import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mockObject } from "../../../../../../base/test/common/mock.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IEnvironmentService } from "../../../../../../platform/environment/common/environment.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, WillSaveStateReason } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IUserDataProfilesService, toUserDataProfile } from "../../../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkbenchAssignmentService } from "../../../../../services/assignment/common/assignmentService.js";
import { NullWorkbenchAssignmentService } from "../../../../../services/assignment/test/common/nullAssignmentService.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IExtensionService, nullExtensionDescription } from "../../../../../services/extensions/common/extensions.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IViewsService } from "../../../../../services/views/common/viewsService.js";
import { IWorkspaceEditingService } from "../../../../../services/workspaces/common/workspaceEditing.js";
import { InMemoryTestFileService, mock, TestChatEntitlementService, TestContextService, TestExtensionService, TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { TestMcpService } from "../../../../mcp/test/common/testMcpService.js";
import { IChatVariablesService } from "../../../common/attachments/chatVariables.js";
import { IChatDebugService } from "../../../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../../../common/chatDebugServiceImpl.js";
import { ChatRequestQueueKind, ChatSendResult, IChatService, ResponseModelState } from "../../../common/chatService/chatService.js";
import { backfillTransferredModel, backfillRestoredPickerState, ChatService } from "../../../common/chatService/chatServiceImpl.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ChatEditingSessionState, IChatEditingService, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatSlashCommandService, IChatSlashCommandService } from "../../../common/participants/chatSlashCommands.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { ILanguageModelToolsService } from "../../../common/tools/languageModelToolsService.js";
import { MockChatVariablesService } from "../mockChatVariables.js";
import { MockPromptsService } from "../promptSyntax/service/mockPromptsService.js";
import { MockLanguageModelToolsService } from "../tools/mockLanguageModelToolsService.js";
import { MockChatService } from "./mockChatService.js";
import { ChatSessionOptionsMap, IChatSessionsService } from "../../../common/chatSessionsService.js";
import { MockChatSessionsService } from "../mockChatSessionsService.js";
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, COPILOT_SKILL_URI_SCHEME, TROUBLESHOOT_SKILL_PATH } from "../../../common/promptSyntax/promptTypes.js";
import { ChatRequestSlashPromptPart } from "../../../common/requestParser/chatParserTypes.js";
import { NullLanguageModelsService } from "../languageModels.js";
const chatAgentWithUsedContextId = "ChatProviderWithUsedContext";
const chatAgentWithUsedContext = {
  id: chatAgentWithUsedContextId,
  name: chatAgentWithUsedContextId,
  extensionId: nullExtensionDescription.identifier,
  extensionVersion: void 0,
  publisherDisplayName: "",
  extensionPublisherId: "",
  extensionDisplayName: "",
  locations: [ChatAgentLocation.Chat],
  modes: [ChatModeKind.Ask],
  metadata: {},
  slashCommands: [],
  disambiguation: [],
  async invoke(request, progress, history, token) {
    progress([{
      documents: [
        {
          uri: URI.file("/test/path/to/file"),
          version: 3,
          ranges: [
            new Range(1, 1, 2, 2)
          ]
        }
      ],
      kind: "usedContext"
    }]);
    return { metadata: { metadataKey: "value" } };
  },
  async provideFollowups(sessionId, token) {
    return [{ kind: "reply", message: "Something else", agentId: "", tooltip: "a tooltip" }];
  }
};
const chatAgentWithMarkdownId = "ChatProviderWithMarkdown";
const chatAgentWithMarkdown = {
  id: chatAgentWithMarkdownId,
  name: chatAgentWithMarkdownId,
  extensionId: nullExtensionDescription.identifier,
  extensionVersion: void 0,
  publisherDisplayName: "",
  extensionPublisherId: "",
  extensionDisplayName: "",
  locations: [ChatAgentLocation.Chat],
  modes: [ChatModeKind.Ask],
  metadata: {},
  slashCommands: [],
  disambiguation: [],
  async invoke(request, progress, history, token) {
    progress([{ kind: "markdownContent", content: new MarkdownString("test") }]);
    return { metadata: { metadataKey: "value" } };
  },
  async provideFollowups(sessionId, token) {
    return [];
  }
};
function getAgentData(id) {
  return {
    name: id,
    id,
    extensionId: nullExtensionDescription.identifier,
    extensionVersion: void 0,
    extensionPublisherId: "",
    publisherDisplayName: "",
    extensionDisplayName: "",
    locations: [ChatAgentLocation.Chat],
    modes: [ChatModeKind.Ask],
    metadata: {},
    slashCommands: [],
    disambiguation: []
  };
}
suite("ChatService", () => {
  const testDisposables = new DisposableStore();
  let instantiationService;
  let testFileService;
  let editingSessionEntries;
  let chatAgentService;
  const testServices = [];
  function createChatService() {
    const service = testDisposables.add(instantiationService.createInstance(ChatService));
    testServices.push(service);
    return service;
  }
  function startSessionModel(service, location = ChatAgentLocation.Chat) {
    const ref = testDisposables.add(service.startNewLocalSession(location));
    return ref;
  }
  async function getOrRestoreModel(service, resource) {
    const ref = await service.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
    if (!ref) {
      return void 0;
    }
    return testDisposables.add(ref).object;
  }
  setup(async () => {
    instantiationService = testDisposables.add(new TestInstantiationService(new ServiceCollection(
      [IChatVariablesService, new MockChatVariablesService()],
      [IWorkbenchAssignmentService, new NullWorkbenchAssignmentService()],
      [IMcpService, new TestMcpService()],
      [IPromptsService, new MockPromptsService()],
      [ILanguageModelToolsService, testDisposables.add(new MockLanguageModelToolsService())]
    )));
    instantiationService.stub(IStorageService, testDisposables.add(new TestStorageService()));
    instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IUserDataProfilesService, { defaultProfile: toUserDataProfile("default", "Default", URI.file("/test/userdata"), URI.file("/test/cache")) });
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IExtensionService, new TestExtensionService());
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IViewsService, new TestExtensionService());
    instantiationService.stub(IWorkspaceContextService, new TestContextService());
    instantiationService.stub(IChatSlashCommandService, testDisposables.add(instantiationService.createInstance(ChatSlashCommandService)));
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IChatService, new MockChatService());
    instantiationService.stub(IChatSessionsService, new MockChatSessionsService());
    instantiationService.stub(ILanguageModelsService, new NullLanguageModelsService());
    instantiationService.stub(IEnvironmentService, { workspaceStorageHome: URI.file("/test/path/to/workspaceStorage") });
    instantiationService.stub(ILifecycleService, { onWillShutdown: Event.None });
    instantiationService.stub(IWorkspaceEditingService, { onDidEnterWorkspace: Event.None });
    instantiationService.stub(IChatDebugService, testDisposables.add(new ChatDebugServiceImpl(new TestConfigurationService())));
    editingSessionEntries = observableValue("editingSessionEntries", []);
    instantiationService.stub(IChatEditingService, new class extends mock() {
      startOrContinueGlobalEditingSession() {
        return {
          state: constObservable(ChatEditingSessionState.Idle),
          requestDisablement: observableValue("requestDisablement", []),
          entries: editingSessionEntries,
          dispose: () => {
          }
        };
      }
    }());
    testFileService = testDisposables.add(new InMemoryTestFileService());
    instantiationService.stub(IFileService, testFileService);
    chatAgentService = testDisposables.add(instantiationService.createInstance(ChatAgentService));
    instantiationService.stub(IChatAgentService, chatAgentService);
    const agent = {
      async invoke(request, progress, history, token) {
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("testAgent", { ...getAgentData("testAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgent(chatAgentWithUsedContextId, getAgentData(chatAgentWithUsedContextId)));
    testDisposables.add(chatAgentService.registerAgent(chatAgentWithMarkdownId, getAgentData(chatAgentWithMarkdownId)));
    testDisposables.add(chatAgentService.registerAgentImplementation("testAgent", agent));
    chatAgentService.updateAgent("testAgent", {});
  });
  teardown(async () => {
    testDisposables.clear();
    await Promise.all(testServices.map((s) => s.waitForModelDisposals()));
    testServices.length = 0;
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("propagates Agents Voice Mode input to the participant request", async () => {
    const captured = new DeferredPromise();
    testDisposables.add(chatAgentService.registerAgent("voiceAgent", getAgentData("voiceAgent")));
    testDisposables.add(chatAgentService.registerAgentImplementation("voiceAgent", {
      async invoke(request) {
        captured.complete(request.isVoiceModeInput);
        return {};
      }
    }));
    const service = createChatService();
    const model = startSessionModel(service).object;
    await service.sendRequest(model.sessionResource, "voice request", {
      agentId: "voiceAgent",
      isVoiceModeInput: true
    });
    assert.strictEqual(await captured.p, true);
  });
  test("slash commands can share ids across non-overlapping session types", async () => {
    const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
    const executions = [];
    const progress = { report: (_progress) => {
    } };
    testDisposables.add(slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "Local switch",
      locations: [ChatAgentLocation.Chat],
      sessionTypes: ["local"]
    }, async () => {
      executions.push("local");
    }));
    testDisposables.add(slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "Remote switch",
      locations: [ChatAgentLocation.Chat],
      sessionTypes: ["remote"]
    }, async () => {
      executions.push("remote");
    }));
    assert.strictEqual(slashCommandService.hasCommand("switch", "local"), true);
    assert.strictEqual(slashCommandService.hasCommand("switch", "remote"), true);
    assert.strictEqual(slashCommandService.hasCommand("switch", "other"), false);
    await slashCommandService.executeCommand("switch", "", progress, [], ChatAgentLocation.Chat, LocalChatSessionUri.forSession("local-session"), CancellationToken.None);
    await slashCommandService.executeCommand("switch", "", progress, [], ChatAgentLocation.Chat, URI.from({ scheme: "remote", path: "/session" }), CancellationToken.None);
    assert.deepStrictEqual(executions, ["local", "remote"]);
  });
  test("slash commands reject overlapping session types for the same id", () => {
    const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
    const command = async () => void 0;
    testDisposables.add(slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "Local switch",
      locations: [ChatAgentLocation.Chat],
      sessionTypes: ["local", "remote"]
    }, command));
    assert.throws(() => slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "Remote switch",
      locations: [ChatAgentLocation.Chat],
      sessionTypes: ["remote", "other"]
    }, command));
  });
  test("slash commands without session types apply to all session types", async () => {
    const slashCommandService = testDisposables.add(instantiationService.createInstance(ChatSlashCommandService));
    const executions = [];
    const progress = { report: (_progress) => {
    } };
    testDisposables.add(slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "All sessions switch",
      locations: [ChatAgentLocation.Chat]
    }, async () => {
      executions.push("all");
    }));
    assert.strictEqual(slashCommandService.hasCommand("switch", "local"), true);
    assert.strictEqual(slashCommandService.hasCommand("switch", "remote"), true);
    await slashCommandService.executeCommand("switch", "", progress, [], ChatAgentLocation.Chat, LocalChatSessionUri.forSession("local-session"), CancellationToken.None);
    await slashCommandService.executeCommand("switch", "", progress, [], ChatAgentLocation.Chat, URI.from({ scheme: "remote", path: "/session" }), CancellationToken.None);
    assert.deepStrictEqual(executions, ["all", "all"]);
    assert.throws(() => slashCommandService.registerSlashCommand({
      command: "switch",
      detail: "Remote switch",
      locations: [ChatAgentLocation.Chat],
      sessionTypes: ["remote"]
    }, async () => void 0));
  });
  test("retrieveSession", async () => {
    const testService = createChatService();
    const session1Ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const session1 = session1Ref.object;
    session1.addRequest({ parts: [], text: "request 1" }, { variables: [] }, 0);
    const session2Ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const session2 = session2Ref.object;
    session2.addRequest({ parts: [], text: "request 2" }, { variables: [] }, 0);
    session1Ref.dispose();
    session2Ref.dispose();
    await testService.waitForModelDisposals();
    assert.strictEqual(testFileService.writeOperations.length, 2, "Should have written 2 sessions to file service");
    const session1WriteOp = testFileService.writeOperations.find((op) => op.content.includes("request 1"));
    const session2WriteOp = testFileService.writeOperations.find((op) => op.content.includes("request 2"));
    assert.ok(session1WriteOp, "Session 1 should have been written to file service");
    assert.ok(session2WriteOp, "Session 2 should have been written to file service");
    const testService2 = createChatService();
    const retrieved1 = await getOrRestoreModel(testService2, session1.sessionResource);
    const retrieved2 = await getOrRestoreModel(testService2, session2.sessionResource);
    assert.ok(retrieved1, "Should retrieve session 1");
    assert.ok(retrieved2, "Should retrieve session 2");
    assert.deepStrictEqual(retrieved1.getRequests()[0]?.message.text, "request 1");
    assert.deepStrictEqual(retrieved2.getRequests()[0]?.message.text, "request 2");
  });
  test("reports modified edit keep-alive holders", () => {
    const testService = createChatService();
    instantiationService.stub(IChatService, testService);
    const rootRef = testService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: "ChatServiceTest#root" });
    const modifiedEntry = new class extends mock() {
      constructor() {
        super(...arguments);
        this.state = constObservable(ModifiedFileEntryState.Modified);
      }
    }();
    editingSessionEntries.set([modifiedEntry], void 0);
    assert.deepStrictEqual(testService.getChatModelReferenceDebugInfo().models.map((model) => ({
      createdBy: model.createdBy,
      holders: model.holders,
      hasPendingEdits: model.hasPendingEdits,
      referenceCount: model.referenceCount
    })), [{
      createdBy: "ChatServiceTest#root",
      holders: [
        { holder: "ChatModel#modifiedEditsKeepAlive", count: 1 },
        { holder: "ChatServiceTest#root", count: 1 }
      ],
      hasPendingEdits: true,
      referenceCount: 2
    }]);
    editingSessionEntries.set([], void 0);
    assert.deepStrictEqual(testService.getChatModelReferenceDebugInfo().models.map((model) => ({
      holders: model.holders,
      hasPendingEdits: model.hasPendingEdits,
      referenceCount: model.referenceCount
    })), [{
      holders: [{ holder: "ChatServiceTest#root", count: 1 }],
      hasPendingEdits: false,
      referenceCount: 1
    }]);
    rootRef.dispose();
  });
  test("addCompleteRequest", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    assert.strictEqual(model.getRequests().length, 0);
    await testService.addCompleteRequest(model.sessionResource, "test request", void 0, 0, { message: "test response" });
    assert.strictEqual(model.getRequests().length, 1);
    assert.ok(model.getRequests()[0].response);
    assert.strictEqual(model.getRequests()[0].response?.response.toString(), "test response");
  });
  test("sendRequest allows empty message with explicit file attachment", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const fileEntry = { kind: "file", id: "file", name: "README.md", value: URI.file("/test/README.md") };
    const response = await testService.sendRequest(model.sessionResource, "", { attachedContext: [fileEntry] });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 1);
    assert.strictEqual(model.getRequests()[0].message.text, "");
    assert.deepStrictEqual(model.getRequests()[0].variableData.variables, [fileEntry]);
  });
  test("sendRequest rejects empty message without explicit file attachment", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const workspaceEntry = { kind: "workspace", id: "workspace", name: "workspace", value: "workspace" };
    assert.deepStrictEqual(await testService.sendRequest(model.sessionResource, ""), { kind: "rejected", reason: "Empty message" });
    assert.deepStrictEqual(await testService.sendRequest(model.sessionResource, "", { attachedContext: [workspaceEntry] }), { kind: "rejected", reason: "Empty message" });
    assert.strictEqual(model.getRequests().length, 0);
  });
  test("sendRequest fails", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    await assertSnapshot(toSnapshotExportData(model));
  });
  test("history", async () => {
    const historyLengthAgent = {
      async invoke(request, progress, history, token) {
        return {
          metadata: { historyLength: history.length }
        };
      }
    };
    testDisposables.add(chatAgentService.registerAgent("defaultAgent", { ...getAgentData("defaultAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgent("agent2", getAgentData("agent2")));
    testDisposables.add(chatAgentService.registerAgentImplementation("defaultAgent", historyLengthAgent));
    testDisposables.add(chatAgentService.registerAgentImplementation("agent2", historyLengthAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, `test request`, { agentId: "defaultAgent" });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 1);
    assert.strictEqual(model.getRequests()[0].response?.result?.metadata?.historyLength, 0);
    const response2 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: "agent2" });
    ChatSendResult.assertSent(response2);
    await response2.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 2);
    assert.strictEqual(model.getRequests()[1].response?.result?.metadata?.historyLength, 0);
    const response3 = await testService.sendRequest(model.sessionResource, `test request`, { agentId: "defaultAgent" });
    ChatSendResult.assertSent(response3);
    await response3.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 3);
    assert.strictEqual(model.getRequests()[2].response?.result?.metadata?.historyLength, 2);
  });
  test("can serialize", async () => {
    testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
    chatAgentService.updateAgent(chatAgentWithUsedContextId, {});
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    assert.strictEqual(model.getRequests().length, 0);
    await assertSnapshot(toSnapshotExportData(model));
    const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithUsedContextId} test request`);
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 1);
    const response2 = await testService.sendRequest(model.sessionResource, `test request 2`);
    ChatSendResult.assertSent(response2);
    await response2.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 2);
    await assertSnapshot(toSnapshotExportData(model));
  });
  test("can deserialize", async () => {
    let serializedChatData;
    testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithUsedContextId, chatAgentWithUsedContext));
    {
      const testService = createChatService();
      const chatModel1Ref = testDisposables.add(startSessionModel(testService));
      const chatModel1 = chatModel1Ref.object;
      assert.strictEqual(chatModel1.getRequests().length, 0);
      const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
      ChatSendResult.assertSent(response);
      await response.data.responseCompletePromise;
      serializedChatData = JSON.parse(JSON.stringify(chatModel1));
    }
    const testService2 = createChatService();
    const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
    assert(chatModel2Ref);
    testDisposables.add(chatModel2Ref);
    const chatModel2 = chatModel2Ref.object;
    await assertSnapshot(toSnapshotExportData(chatModel2));
  });
  test("can deserialize with response", async () => {
    let serializedChatData;
    testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));
    {
      const testService = createChatService();
      const chatModel1Ref = testDisposables.add(startSessionModel(testService));
      const chatModel1 = chatModel1Ref.object;
      assert.strictEqual(chatModel1.getRequests().length, 0);
      const response = await testService.sendRequest(chatModel1.sessionResource, `@${chatAgentWithUsedContextId} test request`);
      ChatSendResult.assertSent(response);
      await response.data.responseCompletePromise;
      serializedChatData = JSON.parse(JSON.stringify(chatModel1));
    }
    const testService2 = createChatService();
    const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
    assert(chatModel2Ref);
    testDisposables.add(chatModel2Ref);
    const chatModel2 = chatModel2Ref.object;
    await assertSnapshot(toSnapshotExportData(chatModel2));
  });
  test("can serialize and deserialize implicit request flag", async () => {
    let serializedChatData;
    {
      const testService = createChatService();
      const chatModel1Ref = testDisposables.add(startSessionModel(testService));
      const chatModel1 = chatModel1Ref.object;
      const response = await testService.sendRequest(chatModel1.sessionResource, "test implicit request", { isSystemInitiated: true });
      ChatSendResult.assertSent(response);
      await response.data.responseCompletePromise;
      assert.strictEqual(chatModel1.getRequests().length, 1);
      assert.strictEqual(chatModel1.getRequests()[0].isSystemInitiated, true);
      serializedChatData = JSON.parse(JSON.stringify(chatModel1));
      assert.strictEqual(serializedChatData.requests.length, 1);
      assert.strictEqual(serializedChatData.requests[0].isSystemInitiated, true);
    }
    const testService2 = createChatService();
    const chatModel2Ref = testService2.loadSessionFromData(serializedChatData);
    assert(chatModel2Ref);
    testDisposables.add(chatModel2Ref);
    const chatModel2 = chatModel2Ref.object;
    assert.strictEqual(chatModel2.getRequests().length, 1);
    assert.strictEqual(chatModel2.getRequests()[0].isSystemInitiated, true);
  });
  test("acquireExistingSession keeps model alive for steering request after refs released", async () => {
    const testService = createChatService();
    const modelRef = startSessionModel(testService);
    const sessionResource = modelRef.object.sessionResource;
    const keepAliveRef = testDisposables.add(testService.acquireExistingSession(sessionResource, "test#keepAlive"));
    assert.ok(keepAliveRef, "acquireExistingSession should return a reference");
    modelRef.dispose();
    await testService.waitForModelDisposals();
    const response = await testService.sendRequest(sessionResource, "terminal completed", {
      queue: ChatRequestQueueKind.Steering,
      isSystemInitiated: true
    });
    assert.strictEqual(response.kind, "queued");
    keepAliveRef.dispose();
  });
  test("onDidDisposeSession", async () => {
    const testService = createChatService();
    const modelRef = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const model = modelRef.object;
    let disposed = false;
    testDisposables.add(testService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        if (resource.toString() === model.sessionResource.toString()) {
          disposed = true;
        }
      }
    }));
    modelRef.dispose();
    await testService.waitForModelDisposals();
    assert.strictEqual(disposed, true);
  });
  test("disposing a session cancels pending followups", async () => {
    let followupsToken;
    const followupsCancelled = new DeferredPromise();
    const followupsAgent = {
      async invoke() {
        return {};
      },
      provideFollowups(request, result, history, token) {
        followupsToken = token;
        testDisposables.add(token.onCancellationRequested(() => followupsCancelled.complete([])));
        return followupsCancelled.p;
      }
    };
    testDisposables.add(chatAgentService.registerAgent("followupsAgent", { ...getAgentData("followupsAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("followupsAgent", followupsAgent));
    const testService = createChatService();
    const modelRef = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const response = await testService.sendRequest(modelRef.object.sessionResource, "test request", { agentId: "followupsAgent" });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.ok(followupsToken);
    assert.strictEqual(followupsToken.isCancellationRequested, false);
    modelRef.dispose();
    await testService.waitForModelDisposals();
    assert.strictEqual(followupsToken.isCancellationRequested, true);
  });
  test("steering message queued triggers setYieldRequested", async () => {
    const requestStarted = new DeferredPromise();
    const completeRequest = new DeferredPromise();
    let setYieldRequestedCalled = false;
    const slowAgent = {
      async invoke(request, progress, history, token) {
        requestStarted.complete();
        await completeRequest.p;
        return {};
      },
      setYieldRequested(requestId, value) {
        setYieldRequestedCalled = true;
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "first request", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response);
    await requestStarted.p;
    const steeringResponse = await testService.sendRequest(model.sessionResource, "steering message", {
      agentId: "slowAgent",
      queue: ChatRequestQueueKind.Steering
    });
    assert.strictEqual(steeringResponse.kind, "queued");
    assert.strictEqual(setYieldRequestedCalled, true, "setYieldRequested should be called when a steering message is queued");
    completeRequest.complete();
    await response.data.responseCompletePromise;
  });
  test("multiple steering messages are combined into a single request", async () => {
    const requestStarted = new DeferredPromise();
    const completeRequest = new DeferredPromise();
    const invokedRequests = [];
    const slowAgent = {
      async invoke(request, progress, history, token) {
        invokedRequests.push(request.message);
        if (invokedRequests.length === 1) {
          requestStarted.complete();
          await completeRequest.p;
        }
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "first request", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response);
    await requestStarted.p;
    const steering1 = await testService.sendRequest(model.sessionResource, "steering1", { agentId: "slowAgent", queue: ChatRequestQueueKind.Steering });
    const steering2 = await testService.sendRequest(model.sessionResource, "steering2", { agentId: "slowAgent", queue: ChatRequestQueueKind.Steering });
    const steering3 = await testService.sendRequest(model.sessionResource, "steering3", { agentId: "slowAgent", queue: ChatRequestQueueKind.Steering });
    assert.ok(ChatSendResult.isQueued(steering1));
    assert.ok(ChatSendResult.isQueued(steering2));
    assert.ok(ChatSendResult.isQueued(steering3));
    completeRequest.complete();
    await response.data.responseCompletePromise;
    await steering1.deferred;
    await steering2.deferred;
    await steering3.deferred;
    assert.strictEqual(invokedRequests.length, 2, "Should have only 2 invocations (initial + combined steering)");
    assert.ok(invokedRequests[1].includes("steering1"), "Combined message should include steering1");
    assert.ok(invokedRequests[1].includes("steering2"), "Combined message should include steering2");
    assert.ok(invokedRequests[1].includes("steering3"), "Combined message should include steering3");
    assert.ok(invokedRequests[1].includes("\n\n"), "Combined message should use \\n\\n as separator");
  });
  test("steering message on a streamed (activeResponseCallback) session dispatches immediately, mid-turn", async () => {
    const sessionType = "remote-streamed-steer";
    const sessionResource = URI.from({ scheme: sessionType, path: "/streamed-session" });
    const isCompleteObs = observableValue("isComplete", false);
    const mockSessionsService = new MockChatSessionsService();
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        // History ends with a request, so the session has an in-progress (cancellable) turn.
        history: [{ type: "request", prompt: "initial task", participant: sessionType }],
        progressObs: constObservable([]),
        isCompleteObs,
        interruptActiveResponseCallback: async () => false,
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const invokedMessages = [];
    const steeringInvoked = new DeferredPromise();
    const agent = {
      async invoke(request) {
        invokedMessages.push(request.message);
        steeringInvoked.complete();
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, agent));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const steering = await testService.sendRequest(sessionResource, "steering message", { agentId: sessionType, queue: ChatRequestQueueKind.Steering });
    assert.ok(ChatSendResult.isQueued(steering));
    await steeringInvoked.p;
    await steering.deferred;
    await timeout(0);
    assert.strictEqual(invokedMessages.filter((m) => m.includes("steering message")).length, 1, "steering message should be dispatched exactly once, immediately");
    const model = testService.getSession(sessionResource);
    assert.strictEqual(model.getPendingRequests().length, 0, "steering message should be dispatched, not left queued");
    const plain = await testService.sendRequest(sessionResource, "plain message", { agentId: sessionType });
    assert.strictEqual(plain.kind, "rejected");
    isCompleteObs.set(true, void 0);
    await timeout(0);
    assert.strictEqual(invokedMessages.filter((m) => m.includes("steering message")).length, 1, "steering message must not be dispatched again on completion");
  });
  test("queued (non-steering) message is flushed when a streamed (activeResponseCallback) turn completes (fix for cloud-session queue limbo)", async () => {
    const sessionType = "remote-streamed-queue";
    const sessionResource = URI.from({ scheme: sessionType, path: "/streamed-session" });
    const isCompleteObs = observableValue("isComplete", false);
    const mockSessionsService = new MockChatSessionsService();
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [{ type: "request", prompt: "initial task", participant: sessionType }],
        progressObs: constObservable([]),
        isCompleteObs,
        interruptActiveResponseCallback: async () => false,
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const invokedMessages = [];
    const invoked = new DeferredPromise();
    const agent = {
      async invoke(request) {
        invokedMessages.push(request.message);
        invoked.complete();
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, agent));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const queued = await testService.sendRequest(sessionResource, "queued message", { agentId: sessionType, queue: ChatRequestQueueKind.Queued });
    assert.ok(ChatSendResult.isQueued(queued));
    const model = testService.getSession(sessionResource);
    assert.strictEqual(model.getPendingRequests().length, 1, "queued message should wait while the streamed turn is in progress");
    isCompleteObs.set(true, void 0);
    await invoked.p;
    assert.ok(invokedMessages.some((m) => m.includes("queued message")), "queued message should be sent once the streamed turn completes");
    assert.strictEqual(model.getPendingRequests().length, 0, "no pending requests should remain after the flush");
  });
  test("disabled Claude hooks hint is shown once per workspace (fix for #295079)", async () => {
    const mockPromptsService = new class extends MockPromptsService {
      getHooks(_token) {
        return Promise.resolve({ hooks: {}, hasDisabledClaudeHooks: true });
      }
    }();
    instantiationService.stub(IPromptsService, mockPromptsService);
    const storageService = instantiationService.get(IStorageService);
    const disabledHintsKey = "chat.disabledClaudeHooks.notification";
    assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), void 0);
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "test request");
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), true, "Flag should be set after showing the hint");
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    const responseParts = requests[0].response?.response.value ?? [];
    const hasHookHint = responseParts.some((part) => part.kind === "disabledClaudeHooks");
    assert.ok(hasHookHint, "Response should contain the disabledClaudeHooks hint");
    const response2 = await testService.sendRequest(model.sessionResource, "second request");
    ChatSendResult.assertSent(response2);
    await response2.data.responseCompletePromise;
    const requests2 = model.getRequests();
    assert.strictEqual(requests2.length, 2);
    const responseParts2 = requests2[1].response?.response.value ?? [];
    const hasHookHint2 = responseParts2.some((part) => part.kind === "disabledClaudeHooks");
    assert.ok(!hasHookHint2, "Response should NOT contain the disabledClaudeHooks hint on second request");
  });
  test("disabled Claude hooks hint is not consumed when no disabled hooks (fix for #295079)", async () => {
    const mockPromptsService = new class extends MockPromptsService {
      constructor() {
        super(...arguments);
        this._callCount = 0;
      }
      getHooks(_token) {
        this._callCount++;
        return Promise.resolve({ hooks: {}, hasDisabledClaudeHooks: this._callCount > 1 });
      }
    }();
    instantiationService.stub(IPromptsService, mockPromptsService);
    const storageService = instantiationService.get(IStorageService);
    const disabledHintsKey = "chat.disabledClaudeHooks.notification";
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "first request");
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), void 0, "Flag should not be set when no disabled hooks");
    const firstRequest = model.getRequests()[0];
    assert.ok(firstRequest, "Expected the initial request to exist before resend");
    await testService.resendRequest(firstRequest);
    assert.strictEqual(storageService.getBoolean(disabledHintsKey, StorageScope.WORKSPACE), true, "Flag should be set after showing the hint");
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1, "Resend should replace the original request");
    const responseParts2 = requests[0].response?.response.value ?? [];
    const hasHookHint2 = responseParts2.some((part) => part.kind === "disabledClaudeHooks");
    assert.ok(hasHookHint2, "Response should contain the disabledClaudeHooks hint on second request");
  });
  test("cancelCurrentRequestForSession waits for response completion", async () => {
    const requestStarted = new DeferredPromise();
    const completeRequest = new DeferredPromise();
    const slowAgent = {
      async invoke(request, progress, history, token) {
        requestStarted.complete();
        const listener = token.onCancellationRequested(() => {
          listener.dispose();
          setTimeout(() => completeRequest.complete(), 10);
        });
        await completeRequest.p;
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "test request", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response);
    await requestStarted.p;
    await testService.cancelCurrentRequestForSession(model.sessionResource, "test");
    const lastRequest = model.getRequests()[0];
    assert.ok(lastRequest.response, "Response should exist after cancellation completes");
    assert.strictEqual(lastRequest.response.state, ResponseModelState.Cancelled, "Response should be in Cancelled state");
  });
  test("cancelCurrentRequestForSession returns after timeout if response does not complete", async () => {
    const requestStarted = new DeferredPromise();
    const completeRequest = new DeferredPromise();
    const hangingAgent = {
      async invoke(request, progress, history, token) {
        requestStarted.complete();
        await completeRequest.p;
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("hangingAgent", { ...getAgentData("hangingAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("hangingAgent", hangingAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "test request", { agentId: "hangingAgent" });
    ChatSendResult.assertSent(response);
    await requestStarted.p;
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      await testService.cancelCurrentRequestForSession(model.sessionResource, "test");
    });
    completeRequest.complete();
    await response.data.responseCompletePromise;
  });
  test("pending requests can be removed from one session and re-sent on another", async () => {
    const requestStarted = new DeferredPromise();
    const completeRequest = new DeferredPromise();
    const invokedMessages = [];
    const slowAgent = {
      async invoke(request, progress, history, token) {
        invokedMessages.push(request.message);
        if (invokedMessages.length === 1) {
          requestStarted.complete();
          await completeRequest.p;
        }
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const sourceRef = testDisposables.add(startSessionModel(testService));
    const source = sourceRef.object;
    const response = await testService.sendRequest(source.sessionResource, "first request", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response);
    await requestStarted.p;
    const queued = await testService.sendRequest(source.sessionResource, "queued request", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued });
    assert.ok(ChatSendResult.isQueued(queued));
    const pendingId = source.getPendingRequests()[0].request.id;
    testService.removePendingRequest(source.sessionResource, pendingId);
    assert.strictEqual(source.getPendingRequests().length, 0);
    const targetRef = testDisposables.add(startSessionModel(testService));
    const target = targetRef.object;
    const resent = await testService.sendRequest(target.sessionResource, "queued request", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued, pauseQueue: true });
    assert.ok(ChatSendResult.isQueued(resent));
    assert.strictEqual(target.getPendingRequests().length, 1);
    completeRequest.complete();
    await response.data.responseCompletePromise;
    testService.processPendingRequests(target.sessionResource);
    const result = await resent.deferred;
    assert.ok(ChatSendResult.isSent(result));
    await result.data.responseCompletePromise;
    assert.strictEqual(invokedMessages.length, 2);
    assert.ok(invokedMessages[1].includes("queued request"));
  });
  test("syncPendingRequestsFromRemote adds, reorders and removes pending requests preserving ids", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    testService.syncPendingRequestsFromRemote(model.sessionResource, [
      { id: "remote-1", kind: ChatRequestQueueKind.Queued, message: "first remote message" },
      { id: "remote-2", kind: ChatRequestQueueKind.Queued, message: "second remote message" }
    ]);
    assert.deepStrictEqual(
      model.getPendingRequests().map((p) => ({ id: p.request.id, kind: p.kind, text: p.request.message.text })),
      [
        { id: "remote-1", kind: ChatRequestQueueKind.Queued, text: "first remote message" },
        { id: "remote-2", kind: ChatRequestQueueKind.Queued, text: "second remote message" }
      ]
    );
    const firstRequest = model.getPendingRequests()[0].request;
    testService.syncPendingRequestsFromRemote(model.sessionResource, [
      { id: "remote-steer", kind: ChatRequestQueueKind.Steering, message: "steer now" },
      { id: "remote-1", kind: ChatRequestQueueKind.Queued, message: "first remote message" }
    ]);
    assert.deepStrictEqual(
      model.getPendingRequests().map((p) => ({ id: p.request.id, kind: p.kind, text: p.request.message.text })),
      [
        { id: "remote-steer", kind: ChatRequestQueueKind.Steering, text: "steer now" },
        { id: "remote-1", kind: ChatRequestQueueKind.Queued, text: "first remote message" }
      ]
    );
    assert.strictEqual(model.getPendingRequests()[1].request, firstRequest, "unchanged messages should not be rebuilt");
    testService.syncPendingRequestsFromRemote(model.sessionResource, []);
    assert.strictEqual(model.getPendingRequests().length, 0);
  });
  test("syncPendingRequestsFromRemote atomically emits the final state and no-ops when it already matches", async () => {
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    testService.syncPendingRequestsFromRemote(model.sessionResource, [
      { id: "remote-1", kind: ChatRequestQueueKind.Queued, message: "old remote message" },
      { id: "remote-2", kind: ChatRequestQueueKind.Queued, message: "removed remote message" }
    ]);
    const snapshots = [];
    testDisposables.add(model.onDidChangePendingRequests(() => {
      snapshots.push(model.getPendingRequests().map((p) => ({ id: p.request.id, kind: p.kind, text: p.request.message.text })));
    }));
    const remote = [
      { id: "remote-steer", kind: ChatRequestQueueKind.Steering, message: "steer now" },
      { id: "remote-1", kind: ChatRequestQueueKind.Queued, message: "updated remote message" }
    ];
    testService.syncPendingRequestsFromRemote(model.sessionResource, remote);
    testService.syncPendingRequestsFromRemote(model.sessionResource, remote);
    assert.deepStrictEqual(snapshots, [[
      { id: "remote-steer", kind: ChatRequestQueueKind.Steering, text: "steer now" },
      { id: "remote-1", kind: ChatRequestQueueKind.Queued, text: "updated remote message" }
    ]]);
  });
  test("sendPendingRequestImmediately cancels current and sends the queued message on local sessions", async () => {
    const firstStarted = new DeferredPromise();
    const secondInvoked = new DeferredPromise();
    const invokedMessages = [];
    const slowAgent = {
      async invoke(request, progress, history, token) {
        invokedMessages.push(request.message);
        if (invokedMessages.length === 1) {
          firstStarted.complete();
          await new Promise((resolve) => {
            const listener = token.onCancellationRequested(() => {
              listener.dispose();
              resolve();
            });
          });
        } else {
          secondInvoked.complete();
        }
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const response = await testService.sendRequest(model.sessionResource, "first request", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response);
    await firstStarted.p;
    const queued = await testService.sendRequest(model.sessionResource, "queued message", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued });
    assert.ok(ChatSendResult.isQueued(queued));
    const pendingId = model.getPendingRequests()[0].request.id;
    await testService.sendPendingRequestImmediately(model.sessionResource, pendingId);
    await secondInvoked.p;
    assert.strictEqual(invokedMessages.length, 2);
    assert.ok(invokedMessages[1].includes("queued message"));
    assert.strictEqual(model.getPendingRequests().length, 0);
  });
  test("sendPendingRequestImmediately re-sends a steering message as a turn on agent host sessions", async () => {
    const sessionType = "agent-host-copilot";
    const sessionResource = URI.from({ scheme: sessionType, path: "/session-send-immediately" });
    const mockSessionsService = new MockChatSessionsService();
    mockSessionsService.setContributions([{
      type: sessionType,
      name: "Agent Host",
      displayName: "Agent Host",
      description: "Agent Host"
    }]);
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const firstStarted = new DeferredPromise();
    const secondInvoked = new DeferredPromise();
    const invokedMessages = [];
    const slowAgent = {
      async invoke(request, progress, history, token) {
        invokedMessages.push(request.message);
        if (invokedMessages.length === 1) {
          firstStarted.complete();
          await new Promise((resolve) => {
            const listener = token.onCancellationRequested(() => {
              listener.dispose();
              resolve();
            });
          });
        } else {
          secondInvoked.complete();
        }
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, slowAgent));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const response = await testService.sendRequest(sessionResource, "first request", { agentId: sessionType });
    ChatSendResult.assertSent(response);
    await firstStarted.p;
    const steering = await testService.sendRequest(sessionResource, "steering message", { agentId: sessionType, queue: ChatRequestQueueKind.Steering });
    assert.ok(ChatSendResult.isQueued(steering));
    const model = testService.getSession(sessionResource);
    assert.strictEqual(model.getPendingRequests().length, 1);
    const pendingId = model.getPendingRequests()[0].request.id;
    await testService.sendPendingRequestImmediately(sessionResource, pendingId);
    await secondInvoked.p;
    assert.strictEqual(invokedMessages.length, 2);
    assert.ok(invokedMessages[1].includes("steering message"));
    assert.strictEqual(model.getPendingRequests().length, 0);
  });
  test("race condition: processNextPendingRequest dequeues before commit handler runs", async () => {
    const invocationOrder = [];
    const firstRequestStarted = new DeferredPromise();
    const firstRequestGate = new DeferredPromise();
    const slowAgent = {
      async invoke(request, progress, history, token) {
        invocationOrder.push(request.message);
        if (invocationOrder.length === 1) {
          firstRequestStarted.complete();
          await firstRequestGate.p;
        }
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("slowAgent", { ...getAgentData("slowAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("slowAgent", slowAgent));
    const testService = createChatService();
    const sourceRef = testDisposables.add(startSessionModel(testService));
    const source = sourceRef.object;
    const response1 = await testService.sendRequest(source.sessionResource, "request-1", { agentId: "slowAgent" });
    ChatSendResult.assertSent(response1);
    await firstRequestStarted.p;
    const q1 = await testService.sendRequest(source.sessionResource, "queued-1", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued });
    const q2 = await testService.sendRequest(source.sessionResource, "queued-2", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued });
    const q3 = await testService.sendRequest(source.sessionResource, "queued-3", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued });
    assert.ok(ChatSendResult.isQueued(q1));
    assert.ok(ChatSendResult.isQueued(q2));
    assert.ok(ChatSendResult.isQueued(q3));
    assert.strictEqual(source.getPendingRequests().length, 3);
    assert.strictEqual(source.getRequests().length, 1, "Only request-1 should be a real request");
    firstRequestGate.complete();
    await response1.data.responseCompletePromise;
    assert.strictEqual(source.getPendingRequests().length, 2, "Should have 2 remaining after auto-dequeue");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const targetRef = testDisposables.add(startSessionModel(testService));
    const target = targetRef.object;
    await testService.cancelCurrentRequestForSession(source.sessionResource);
    const remaining = [...source.getPendingRequests()];
    for (const p of remaining) {
      testService.removePendingRequest(source.sessionResource, p.request.id);
    }
    assert.strictEqual(source.getPendingRequests().length, 0);
    const resent1 = await testService.sendRequest(target.sessionResource, "queued-1", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued, pauseQueue: true });
    const resent2 = await testService.sendRequest(target.sessionResource, "queued-2", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued, pauseQueue: true });
    const resent3 = await testService.sendRequest(target.sessionResource, "queued-3", { agentId: "slowAgent", queue: ChatRequestQueueKind.Queued, pauseQueue: true });
    assert.ok(ChatSendResult.isQueued(resent1));
    assert.ok(ChatSendResult.isQueued(resent2));
    assert.ok(ChatSendResult.isQueued(resent3));
    assert.strictEqual(target.getPendingRequests().length, 3, "Target should have all 3 queued requests");
    testService.processPendingRequests(target.sessionResource);
    const result1 = await resent1.deferred;
    assert.ok(ChatSendResult.isSent(result1));
    await result1.data.responseCompletePromise;
    const result2 = await resent2.deferred;
    assert.ok(ChatSendResult.isSent(result2));
    await result2.data.responseCompletePromise;
    const result3 = await resent3.deferred;
    assert.ok(ChatSendResult.isSent(result3));
    await result3.data.responseCompletePromise;
    const queuedInvocations = invocationOrder.filter((m) => m.includes("queued-"));
    assert.ok(queuedInvocations.length >= 3, `Expected at least 3 queued invocations, got ${queuedInvocations.length}`);
    const lastThree = queuedInvocations.slice(-3);
    assert.ok(lastThree[0].includes("queued-1"));
    assert.ok(lastThree[1].includes("queued-2"));
    assert.ok(lastThree[2].includes("queued-3"));
  });
  test("acquireOrLoadSession returns undefined when remote provider is not registered (fix for #301203)", async () => {
    const unregisteredScheme = "unregistered-provider";
    const sessionResource = URI.from({ scheme: unregisteredScheme, path: "/orphaned-session" });
    const mockSessionsService = new MockChatSessionsService();
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.strictEqual(ref, void 0, "Should return undefined when no provider is registered");
  });
  test("sendRequest on untitled remote session propagates initialSessionOptions to new model", async () => {
    const remoteScheme = "remoteProvider";
    const untitledResource = URI.from({ scheme: remoteScheme, path: "/untitled-test-session" });
    const realResource = URI.from({ scheme: remoteScheme, path: "/real-session-123" });
    const mockSessionsService = new MockChatSessionsService();
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(remoteScheme, {
      provideChatSessionContent: (_resource, _token) => {
        return Promise.resolve({
          sessionResource: _resource,
          history: [],
          onWillDispose: Event.None,
          dispose: () => {
          }
        });
      }
    }));
    mockSessionsService.setSessionOption(untitledResource, "model", "claude-3.5-sonnet");
    mockSessionsService.setSessionOption(untitledResource, "repo", "my-repo");
    mockSessionsService.createNewChatSessionItem = async () => ({
      resource: realResource,
      label: "Test Session",
      timing: { created: Date.now(), lastRequestStarted: void 0, lastRequestEnded: void 0 }
    });
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const remoteAgent = {
      async invoke(request, progress, history, token) {
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent(remoteScheme, { ...getAgentData(remoteScheme), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(remoteScheme, remoteAgent));
    const testService = createChatService();
    const untitledRef = await testService.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(untitledRef, "Should load untitled session");
    testDisposables.add(untitledRef);
    const response = await testService.sendRequest(untitledResource, "hello", { agentId: remoteScheme });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    const newModel = testService.getSession(realResource);
    assert.ok(newModel, "New model should exist at the real resource");
    assert.deepStrictEqual(
      ChatSessionOptionsMap.toStrValueArray(mockSessionsService.getSessionOptions(realResource)),
      [
        { optionId: "model", value: "claude-3.5-sonnet" },
        { optionId: "repo", value: "my-repo" }
      ]
    );
  });
  suite("untitled session materialization is idempotent/serialized (avoids duplicate sessions)", () => {
    const remoteScheme = "remoteProvider";
    function setupUntitledRemote(opts) {
      const mockSessionsService = new MockChatSessionsService();
      testDisposables.add(mockSessionsService.registerChatSessionContentProvider(remoteScheme, {
        provideChatSessionContent: opts.provideContent ?? ((resource) => Promise.resolve({
          sessionResource: resource,
          history: [],
          onWillDispose: Event.None,
          dispose: () => {
          }
        }))
      }));
      mockSessionsService.createNewChatSessionItem = opts.createItem;
      instantiationService.stub(IChatSessionsService, mockSessionsService);
      const remoteAgent = { invoke: opts.invoke ?? (async () => ({})) };
      testDisposables.add(chatAgentService.registerAgent(remoteScheme, { ...getAgentData(remoteScheme), isDefault: true }));
      testDisposables.add(chatAgentService.registerAgentImplementation(remoteScheme, remoteAgent));
      const service = createChatService();
      const untitledResource = URI.from({ scheme: remoteScheme, path: "/untitled-materialize" });
      return { service, untitledResource, mockSessionsService };
    }
    function realItem(resource) {
      return { resource, label: "Test Session", timing: { created: Date.now(), lastRequestStarted: void 0, lastRequestEnded: void 0 } };
    }
    test("two concurrent sends create a single real session and reject the duplicate", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-concurrent" });
      let createCount = 0;
      const agentGate = new DeferredPromise();
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          return realItem(realResource);
        },
        invoke: async () => {
          await agentGate.p;
          return {};
        }
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      const p1 = service.sendRequest(untitledResource, "hello", { agentId: remoteScheme });
      const p2 = service.sendRequest(untitledResource, "hello", { agentId: remoteScheme });
      const [r1, r2] = await Promise.all([p1, p2]);
      assert.strictEqual(createCount, 1, "createNewChatSessionItem must run exactly once");
      assert.deepStrictEqual([r1.kind, r2.kind].sort(), ["rejected", "sent"], "one send is accepted, the duplicate is rejected");
      assert.ok(service.getSession(realResource), "exactly one real session is materialized");
      agentGate.complete();
      const sent = ChatSendResult.isSent(r1) ? r1 : r2;
      ChatSendResult.assertSent(sent);
      await sent.data.responseCompletePromise;
    });
    test("materialization rejects a send when the real session is read-only", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-read-only" });
      let invokeCount = 0;
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => realItem(realResource),
        invoke: async () => {
          invokeCount++;
          return {};
        },
        provideContent: (resource) => Promise.resolve({
          sessionResource: resource,
          history: [],
          onWillDispose: Event.None,
          isReadOnly: constObservable(resource.toString() === realResource.toString()),
          dispose: () => {
          }
        })
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      const result = await service.sendRequest(untitledResource, "hello", { agentId: remoteScheme });
      const realModel = service.getSession(realResource);
      assert.deepStrictEqual({
        result,
        invokeCount,
        requestCount: realModel?.getRequests().length
      }, {
        result: { kind: "rejected", reason: "Session is read-only", newSessionResource: realResource },
        invokeCount: 0,
        requestCount: 0
      });
    });
    test("a late send still addressed to the untitled resource re-targets the real session", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-late" });
      let createCount = 0;
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          return realItem(realResource);
        }
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      const r1 = await service.sendRequest(untitledResource, "first", { agentId: remoteScheme });
      ChatSendResult.assertSent(r1);
      await r1.data.responseCompletePromise;
      const realModel = service.getSession(realResource);
      assert.ok(realModel, "real session exists after first send");
      const requestsAfterFirst = realModel.getRequests().length;
      const r2 = await service.sendRequest(untitledResource, "second", { agentId: remoteScheme });
      ChatSendResult.assertSent(r2);
      await r2.data.responseCompletePromise;
      assert.strictEqual(createCount, 1, "no second materialization for a stale untitled send");
      assert.strictEqual(r2.newSessionResource?.toString(), realResource.toString(), "late re-target reports the real resource as the new session");
      assert.strictEqual(realModel.getRequests().length, requestsAfterFirst + 1, "second request is routed to the real session");
    });
    test("a late send to a read-only materialized session reports the real resource", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-late-read-only" });
      const isReadOnly = observableValue("isReadOnly", false);
      let invokeCount = 0;
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => realItem(realResource),
        invoke: async () => {
          invokeCount++;
          return {};
        },
        provideContent: (resource) => Promise.resolve({
          sessionResource: resource,
          history: [],
          onWillDispose: Event.None,
          isReadOnly,
          dispose: () => {
          }
        })
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      const first = await service.sendRequest(untitledResource, "first", { agentId: remoteScheme });
      ChatSendResult.assertSent(first);
      await first.data.responseCompletePromise;
      isReadOnly.set(true, void 0);
      const second = await service.sendRequest(untitledResource, "second", { agentId: remoteScheme });
      assert.deepStrictEqual({
        second,
        invokeCount
      }, {
        second: { kind: "rejected", reason: "Session is read-only", newSessionResource: realResource },
        invokeCount: 1
      });
    });
    test("a failed materialization does not poison the latch (retry re-attempts)", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-retry" });
      let createCount = 0;
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          if (createCount === 1) {
            throw new Error("boom");
          }
          return realItem(realResource);
        }
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      await assert.rejects(service.sendRequest(untitledResource, "first", { agentId: remoteScheme }), /boom/);
      const r2 = await service.sendRequest(untitledResource, "second", { agentId: remoteScheme });
      ChatSendResult.assertSent(r2);
      await r2.data.responseCompletePromise;
      assert.strictEqual(createCount, 2, "retry re-attempts materialization");
      assert.ok(service.getSession(realResource), "retry produces the real session");
    });
    test("a concurrent waiter does not inherit the first send's materialization failure", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-shared-failure" });
      let createCount = 0;
      const gate = new DeferredPromise();
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          await gate.p;
          throw new Error("boom");
        }
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      const p1 = service.sendRequest(untitledResource, "first", { agentId: remoteScheme });
      const p2 = service.sendRequest(untitledResource, "second", { agentId: remoteScheme });
      gate.complete();
      const firstOutcome = await p1.then(() => "resolved", () => "rejected");
      const r2 = await p2;
      assert.strictEqual(firstOutcome, "rejected", "the originating send surfaces the failure");
      ChatSendResult.assertSent(r2);
      assert.strictEqual(createCount, 1, "the waiter did not start a second materialization");
      assert.ok(!service.getSession(realResource), "no real session was created");
      await r2.data.responseCompletePromise;
    });
    test("disposing a materialized untitled session clears its re-target mapping", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-dispose" });
      let createCount = 0;
      const { service, untitledResource } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          return realItem(realResource);
        }
      });
      const untitledRef = await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None);
      const r1 = await service.sendRequest(untitledResource, "first", { agentId: remoteScheme });
      ChatSendResult.assertSent(r1);
      await r1.data.responseCompletePromise;
      assert.ok(service.getSession(realResource), "real session exists after first send");
      untitledRef.dispose();
      await timeout(0);
      await assert.rejects(
        service.sendRequest(untitledResource, "second", { agentId: remoteScheme }),
        /Unknown session/,
        "the stale untitled resource no longer re-targets the real session"
      );
      const r3 = await service.sendRequest(realResource, "third", { agentId: remoteScheme });
      ChatSendResult.assertSent(r3);
      await r3.data.responseCompletePromise;
      assert.strictEqual(createCount, 1, "no extra materialization occurred");
    });
    test("a load failure after alias registration does not poison the late-send re-target", async () => {
      const realResource = URI.from({ scheme: remoteScheme, path: "/real-loadfail" });
      let createCount = 0;
      let failRealLoad = true;
      const { service, untitledResource, mockSessionsService } = setupUntitledRemote({
        createItem: async () => {
          createCount++;
          return realItem(realResource);
        },
        // Fail the first load of the real session (e.g. provider raced/unregistered),
        // then succeed so a retry can complete.
        provideContent: (resource) => {
          if (resource.toString() === realResource.toString() && failRealLoad) {
            failRealLoad = false;
            return Promise.reject(new Error("load boom"));
          }
          return Promise.resolve({ sessionResource: resource, history: [], onWillDispose: Event.None, dispose: () => {
          } });
        }
      });
      testDisposables.add(await service.acquireOrLoadSession(untitledResource, ChatAgentLocation.Chat, CancellationToken.None));
      await assert.rejects(service.sendRequest(untitledResource, "first", { agentId: remoteScheme }), /load boom/);
      assert.strictEqual(mockSessionsService.getMaterializedSessionResource(untitledResource), void 0, "no poisoned untitled\u2192real mapping after a load failure");
      const r2 = await service.sendRequest(untitledResource, "second", { agentId: remoteScheme });
      ChatSendResult.assertSent(r2);
      await r2.data.responseCompletePromise;
      assert.strictEqual(createCount, 2, "second send re-materializes after the failed attempt");
      assert.ok(service.getSession(realResource), "second send produces the real session");
    });
  });
  test("sendRequest passes agent host session capabilities to the request parser", async () => {
    const sessionType = "agent-host-copilot";
    const sessionResource = URI.from({ scheme: sessionType, path: "/session" });
    const mockSessionsService = new MockChatSessionsService();
    mockSessionsService.setContributions([{
      type: sessionType,
      name: "Agent Host",
      displayName: "Agent Host",
      description: "Agent Host",
      capabilities: { supportsPromptAttachments: true }
    }]);
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, { async invoke() {
      return {};
    } }));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const response = await testService.sendRequest(sessionResource, "/skill plan", { agentId: sessionType });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    const model = testService.getSession(sessionResource);
    assert.deepStrictEqual(model.getRequests()[0].message.parts.map((part) => ({
      kind: part.kind,
      text: part instanceof ChatRequestSlashPromptPart ? part.name : void 0
    })), [
      { kind: "agent", text: void 0 },
      { kind: "text", text: void 0 },
      { kind: "prompt", text: "skill" },
      { kind: "text", text: void 0 }
    ]);
  });
  test("sendRequest redacts remote session type in provider invoked telemetry", async () => {
    const sessionType = "remote-test-copilot";
    const sessionResource = URI.from({ scheme: sessionType, path: "/session" });
    const providerInvokedEvents = [];
    instantiationService.stub(ITelemetryService, {
      ...NullTelemetryService,
      publicLog2(eventName, data) {
        if (eventName === "interactiveSessionProviderInvoked" && data) {
          providerInvokedEvents.push(data);
        }
      }
    });
    const mockSessionsService = new MockChatSessionsService();
    mockSessionsService.setContributions([{
      type: sessionType,
      name: "Remote Agent Host",
      displayName: "Remote Agent Host",
      description: "Remote Agent Host"
    }]);
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, { async invoke() {
      return {};
    } }));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const response = await testService.sendRequest(sessionResource, "hello", { agentId: sessionType });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.deepStrictEqual(providerInvokedEvents.map((event) => ({
      sessionType: event.sessionType,
      hasRequestId: typeof event.requestId === "string"
    })), [{ sessionType: "remote-agent-host", hasRequestId: true }]);
  });
  test("sendRequest with agentIdSilent passes agent host session capabilities to the request parser", async () => {
    const sessionType = "agent-host-copilot";
    const sessionResource = URI.from({ scheme: sessionType, path: "/session-silent" });
    const mockSessionsService = new MockChatSessionsService();
    mockSessionsService.setContributions([{
      type: sessionType,
      name: "Agent Host",
      displayName: "Agent Host",
      description: "Agent Host",
      capabilities: { supportsPromptAttachments: true }
    }]);
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, { async invoke() {
      return {};
    } }));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    const response = await testService.sendRequest(sessionResource, "/skill plan", { agentIdSilent: sessionType });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    const model = testService.getSession(sessionResource);
    assert.deepStrictEqual(model.getRequests()[0].message.parts.map((part) => ({
      kind: part.kind,
      text: part instanceof ChatRequestSlashPromptPart ? part.name : void 0
    })), [
      { kind: "prompt", text: "skill" },
      { kind: "text", text: void 0 }
    ]);
  });
  test("loadRemoteSession passes agent host session capabilities to the request parser", async () => {
    const sessionType = "agent-host-copilot";
    const sessionResource = URI.from({ scheme: sessionType, path: "/session-with-history" });
    const mockSessionsService = new MockChatSessionsService();
    mockSessionsService.setContributions([{
      type: sessionType,
      name: "Agent Host",
      displayName: "Agent Host",
      description: "Agent Host",
      capabilities: { supportsPromptAttachments: true }
    }]);
    testDisposables.add(mockSessionsService.registerChatSessionContentProvider(sessionType, {
      provideChatSessionContent: (resource) => Promise.resolve({
        sessionResource: resource,
        history: [{ type: "request", prompt: "/skill plan", participant: sessionType }],
        onWillDispose: Event.None,
        dispose: () => {
        }
      })
    }));
    instantiationService.stub(IChatSessionsService, mockSessionsService);
    const promptsService = mockObject()({ _serviceBrand: void 0 });
    promptsService.isValidSlashCommandName.callsFake((command) => command === "skill");
    instantiationService.stub(IPromptsService, promptsService);
    testDisposables.add(chatAgentService.registerAgent(sessionType, { ...getAgentData(sessionType), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation(sessionType, { async invoke() {
      return {};
    } }));
    const testService = createChatService();
    const ref = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None);
    assert.ok(ref);
    testDisposables.add(ref);
    assert.deepStrictEqual(ref.object.getRequests()[0].message.parts.map((part) => ({
      kind: part.kind,
      text: part instanceof ChatRequestSlashPromptPart ? part.name : void 0
    })), [
      { kind: "prompt", text: "skill" },
      { kind: "text", text: void 0 }
    ]);
  });
  test("troubleshoot skill via attachedContext is blocked when fileLogging.enabled is off", async () => {
    const configService = instantiationService.get(IConfigurationService);
    await configService.setUserConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, false);
    const troubleshootAgent = {
      async invoke(_request, _progress, _history, _token) {
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("troubleshootAgent", { ...getAgentData("troubleshootAgent"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("troubleshootAgent", troubleshootAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const skillUri = URI.from({ scheme: COPILOT_SKILL_URI_SCHEME, path: TROUBLESHOOT_SKILL_PATH });
    const response = await testService.sendRequest(model.sessionResource, "investigate this issue", {
      attachedContext: [{
        id: "troubleshoot-skill",
        name: "troubleshoot",
        kind: "generic",
        value: skillUri
      }]
    });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    const responseContent = requests[0].response?.response.toString();
    assert.ok(responseContent?.includes(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING), "Response should mention the fileLogging setting");
  });
  test("troubleshoot skill via attachedContext proceeds when fileLogging.enabled is on", async () => {
    const configService = instantiationService.get(IConfigurationService);
    await configService.setUserConfiguration(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, true);
    const troubleshootAgent = {
      async invoke(_request, progress, _history, _token) {
        progress([{ kind: "markdownContent", content: new MarkdownString("Troubleshooting complete") }]);
        return {};
      }
    };
    testDisposables.add(chatAgentService.registerAgent("troubleshootAgent2", { ...getAgentData("troubleshootAgent2"), isDefault: true }));
    testDisposables.add(chatAgentService.registerAgentImplementation("troubleshootAgent2", troubleshootAgent));
    const testService = createChatService();
    const modelRef = testDisposables.add(startSessionModel(testService));
    const model = modelRef.object;
    const skillUri = URI.from({ scheme: COPILOT_SKILL_URI_SCHEME, path: TROUBLESHOOT_SKILL_PATH });
    const response = await testService.sendRequest(model.sessionResource, "investigate this issue", {
      attachedContext: [{
        id: "troubleshoot-skill",
        name: "troubleshoot",
        kind: "generic",
        value: skillUri
      }]
    });
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    const requests = model.getRequests();
    assert.strictEqual(requests.length, 1);
    const responseContent = requests[0].response?.response.toString();
    assert.ok(!responseContent?.includes(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING), "Response should not contain the settings gate message");
  });
  test("switching between sessions disposes previous models and releases all references", async () => {
    const testService = createChatService();
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
      const model = ref.object;
      model.addRequest({ parts: [], text: `request in session ${i}` }, { variables: [] }, 0);
      sessions.push({ resource: model.sessionResource, ref });
    }
    for (const s of sessions) {
      s.ref.dispose();
    }
    await testService.waitForModelDisposals();
    for (const s of sessions) {
      assert.strictEqual(testService.getSession(s.resource), void 0, `Session ${s.resource} should be disposed after ref release`);
    }
    let currentRef;
    for (const s of sessions) {
      const newRef = await testService.acquireOrLoadSession(s.resource, ChatAgentLocation.Chat, CancellationToken.None, "test#switch");
      assert.ok(newRef, `Should be able to restore session ${s.resource}`);
      currentRef?.dispose();
      currentRef = newRef;
    }
    await testService.waitForModelDisposals();
    const debugInfo = testService.getChatModelReferenceDebugInfo();
    assert.deepStrictEqual({
      totalModels: debugInfo.totalModels,
      totalReferences: debugInfo.totalReferences,
      models: debugInfo.models.map((m) => ({
        resource: m.sessionResource.toString(),
        refCount: m.referenceCount,
        holders: m.holders,
        pendingDisposal: m.pendingDisposal,
        createdBy: m.createdBy
      }))
    }, {
      totalModels: 1,
      totalReferences: 1,
      models: [{
        resource: sessions[2].resource.toString(),
        refCount: 1,
        holders: [{ holder: "test#switch", count: 1 }],
        pendingDisposal: false,
        createdBy: "test#switch"
      }]
    });
    assert.strictEqual(
      debugInfo.models[0].sessionResource.toString(),
      sessions[2].resource.toString(),
      "The live model should be the last session we switched to"
    );
    await testService.waitForModelDisposals();
    assert.strictEqual(testService.getSession(sessions[0].resource), void 0, "Session 0 model should be disposed");
    assert.strictEqual(testService.getSession(sessions[1].resource), void 0, "Session 1 model should be disposed");
    assert.ok(testService.getSession(sessions[2].resource), "Session 2 model should still be alive");
    currentRef.dispose();
    await testService.waitForModelDisposals();
  });
  test("previousModelRef pattern in ChatViewPane does not cause double-reference retention", async () => {
    const testService = createChatService();
    const sessions = [];
    for (let i = 0; i < 3; i++) {
      const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
      const model = ref.object;
      model.addRequest({ parts: [], text: `request ${i}` }, { variables: [] }, 0);
      sessions.push({ resource: model.sessionResource });
      ref.dispose();
    }
    await testService.waitForModelDisposals();
    const ref0 = await testService.acquireOrLoadSession(sessions[0].resource, ChatAgentLocation.Chat, CancellationToken.None, "test");
    assert.ok(ref0);
    const previousRef = ref0;
    ref0.dispose();
    const ref1 = await testService.acquireOrLoadSession(sessions[1].resource, ChatAgentLocation.Chat, CancellationToken.None, "test");
    assert.ok(ref1);
    await testService.waitForModelDisposals();
    assert.strictEqual(
      testService.getSession(sessions[0].resource),
      void 0,
      'Session 0 should be disposed -- the "previous ref" pattern did not keep it alive'
    );
    const debugInfo = testService.getChatModelReferenceDebugInfo();
    assert.strictEqual(debugInfo.totalModels, 1, "Only session 1 should be alive");
    ref1.dispose();
    previousRef.dispose();
    await testService.waitForModelDisposals();
  });
  test("serializer _previous field does not retain data after model disposal", async () => {
    const testService = createChatService();
    const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const model = ref.object;
    const sessionResource = model.sessionResource;
    model.addRequest({ parts: [], text: "some request with data" }, { variables: [] }, 0);
    ref.dispose();
    await testService.waitForModelDisposals();
    assert.strictEqual(testService.getSession(sessionResource), void 0);
    const ref2 = await testService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, "test");
    assert.ok(ref2);
    const model2 = ref2.object;
    assert.ok(model2.dataSerializer, "Restored model should have a dataSerializer");
    ref2.dispose();
    await testService.waitForModelDisposals();
    assert.strictEqual(testService.getSession(sessionResource), void 0, "Model should be disposed after second cycle");
  });
  test("model becomes unreachable after all references released", async () => {
    const testService = createChatService();
    const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
    let model = ref.object;
    const sessionResource = model.sessionResource;
    model.addRequest({ parts: [], text: "a request" }, { variables: [] }, 0);
    const weakModel = new WeakRef(model);
    ref.dispose();
    model = void 0;
    await testService.waitForModelDisposals();
    assert.strictEqual(testService.getSession(sessionResource), void 0, "Model should be gone from store");
    const debugInfo = testService.getChatModelReferenceDebugInfo();
    assert.strictEqual(debugInfo.totalModels, 0, "No models should be tracked");
    if (typeof globalThis.gc === "function") {
      globalThis.gc();
      assert.strictEqual(weakModel.deref(), void 0, "Model should be GC'd after all references released");
    }
  });
  test("rapid session switching accumulates at most 2 live models", async () => {
    const testService = createChatService();
    const sessionResources = [];
    for (let i = 0; i < 5; i++) {
      const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
      const model = ref.object;
      model.addRequest({ parts: [], text: `session ${i} request` }, { variables: [] }, 0);
      sessionResources.push(model.sessionResource);
      ref.dispose();
    }
    await testService.waitForModelDisposals();
    let currentRef;
    for (const resource of sessionResources) {
      const newRef = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, "test#rapid");
      assert.ok(newRef);
      currentRef?.dispose();
      currentRef = newRef;
    }
    await testService.waitForModelDisposals();
    const finalDebugInfo = testService.getChatModelReferenceDebugInfo();
    assert.strictEqual(finalDebugInfo.totalModels, 1, "Should have exactly 1 model after waiting for disposals");
    currentRef.dispose();
    await testService.waitForModelDisposals();
  });
  suite("loadRemoteSession progress streaming", () => {
    const remoteScheme = "remote-streaming-test";
    function setupRemoteProvider(opts) {
      const resource = URI.from({ scheme: remoteScheme, path: "/session-" + generateId() });
      const mockSessionsService = new MockChatSessionsService();
      instantiationService.stub(IChatSessionsService, mockSessionsService);
      testDisposables.add(chatAgentService.registerAgent(remoteScheme, { ...getAgentData(remoteScheme), isDefault: true }));
      testDisposables.add(chatAgentService.registerAgentImplementation(remoteScheme, { async invoke() {
        return {};
      } }));
      const provided = {
        sessionResource: resource,
        history: opts.history ?? [{ type: "request", prompt: "hello", participant: remoteScheme }],
        onWillDispose: Event.None,
        progressObs: opts.progressObs,
        isCompleteObs: opts.isCompleteObs,
        isReadOnly: opts.isReadOnly,
        interruptActiveResponseCallback: opts.interruptActiveResponseCallback,
        onDidStartServerRequest: opts.onDidStartServerRequest,
        dispose: () => {
        }
      };
      testDisposables.add(mockSessionsService.registerChatSessionContentProvider(remoteScheme, {
        provideChatSessionContent: () => Promise.resolve(provided)
      }));
      return { resource, provided };
    }
    let idCounter = 0;
    function generateId() {
      return `${Date.now()}-${idCounter++}`;
    }
    test("contributed session read-only state is preserved on the chat model", async () => {
      const isReadOnly = observableValue("isReadOnly", true);
      const { resource } = setupRemoteProvider({ isReadOnly });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const sendResult = await testService.sendRequest(resource, "Do not send");
      const states = [ref.object.isReadOnly.get()];
      isReadOnly.set(false, void 0);
      states.push(ref.object.isReadOnly.get());
      assert.deepStrictEqual({ states, sendResult }, {
        states: [true, false],
        sendResult: { kind: "rejected", reason: "Session is read-only" }
      });
    });
    test("restores request timestamps from remote session history", async () => {
      const timestamp = 1752012321e3;
      const completedAt = timestamp + 2500;
      const { resource } = setupRemoteProvider({
        history: [
          { type: "request", prompt: "hello", participant: remoteScheme, timestamp },
          { type: "response", parts: [], participant: remoteScheme, elapsedMs: 2500, completedAt }
        ]
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      assert.deepStrictEqual({
        timestamp: ref.object.getRequests()[0].timestamp,
        requestTimestamp: ref.object.getRequests()[0].requestTimestamp,
        elapsedMs: ref.object.getRequests()[0].response?.elapsedMs,
        completedAt: ref.object.getRequests()[0].response?.completedAt,
        completionTimestamp: ref.object.getRequests()[0].response?.completionTimestamp
      }, {
        timestamp,
        requestTimestamp: timestamp,
        elapsedMs: 2500,
        completedAt,
        completionTimestamp: completedAt
      });
    });
    test("keeps display time unknown when remote session history predates timestamps", async () => {
      const before = Date.now();
      const { resource } = setupRemoteProvider({
        history: [{ type: "request", prompt: "hello", participant: remoteScheme }]
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const request = ref.object.getRequests()[0];
      assert.deepStrictEqual({
        hasCurrentRecencyFallback: request.timestamp >= before && request.timestamp <= Date.now(),
        requestTimestamp: request.requestTimestamp,
        completionTimestamp: request.response?.completionTimestamp
      }, {
        hasCurrentRecencyFallback: true,
        requestTimestamp: void 0,
        completionTimestamp: void 0
      });
    });
    test("normalizes legacy remote timestamp sentinels to unknown", async () => {
      const { resource } = setupRemoteProvider({
        history: [{ type: "request", prompt: "hello", participant: remoteScheme, timestamp: -1 }]
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      assert.deepStrictEqual({
        requestTimestamp: ref.object.getRequests()[0].requestTimestamp,
        serializedTimestamp: ref.object.toJSON().requests[0].timestamp
      }, {
        requestTimestamp: void 0,
        serializedTimestamp: void 0
      });
    });
    test("uses the Agent Host timestamp for live server-initiated requests", async () => {
      const onDidStartServerRequest = testDisposables.add(new Emitter());
      const timestamp = 1752012321e3;
      const { resource } = setupRemoteProvider({
        progressObs: observableValue("progress", []),
        interruptActiveResponseCallback: async () => true,
        onDidStartServerRequest: onDidStartServerRequest.event
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      onDidStartServerRequest.fire({ id: "turn-1", prompt: "server request", timestamp });
      assert.deepStrictEqual({
        message: ref.object.lastRequest?.message.text,
        timestamp: ref.object.lastRequest?.timestamp
      }, {
        message: "server request",
        timestamp
      });
    });
    test("adopts the Agent Host turn id for live server-initiated requests", async () => {
      const onDidStartServerRequest = testDisposables.add(new Emitter());
      const { resource } = setupRemoteProvider({
        history: [{ id: "turn-1", type: "request", prompt: "hello", participant: remoteScheme }],
        progressObs: observableValue("progress", []),
        interruptActiveResponseCallback: async () => true,
        onDidStartServerRequest: onDidStartServerRequest.event
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      onDidStartServerRequest.fire({ id: "turn-2", prompt: "server request" });
      assert.deepStrictEqual(ref.object.getRequests().map((r) => ({ id: r.id, message: r.message.text })), [
        { id: "turn-1", message: "hello" },
        { id: "turn-2", message: "server request" }
      ]);
    });
    test("already-complete session at load time: no initial pending request, response is completed via autorun", async () => {
      const progressObs = observableValue("progress", []);
      const isCompleteObs = observableValue("isComplete", true);
      let interruptCalls = 0;
      const { resource } = setupRemoteProvider({
        progressObs,
        isCompleteObs,
        interruptActiveResponseCallback: async () => {
          interruptCalls++;
          return true;
        }
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const model = ref.object;
      const lastRequest = model.lastRequest;
      assert.strictEqual(lastRequest.response?.isComplete, true, "Response should be completed through the isComplete autorun");
      await testService.cancelCurrentRequestForSession(resource, "test");
      assert.strictEqual(interruptCalls, 0, "Interrupt callback should not be invoked when there is no pending request");
    });
    test("active session at load time: cancelCurrentRequestForSession invokes the interrupt callback", async () => {
      const progressObs = observableValue("progress", []);
      const isCompleteObs = observableValue("isComplete", false);
      let interruptCalls = 0;
      const { resource } = setupRemoteProvider({
        progressObs,
        isCompleteObs,
        interruptActiveResponseCallback: async () => {
          interruptCalls++;
          return true;
        }
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const model = ref.object;
      assert.strictEqual(model.lastRequest?.response?.isComplete, false, "Response must stay open while session is active");
      await testService.cancelCurrentRequestForSession(resource, "test");
      assert.strictEqual(interruptCalls, 1, "Interrupt callback should be invoked once");
    });
    test("transition of isCompleteObs to true clears pending request and completes response", async () => {
      const progressObs = observableValue("progress", []);
      const isCompleteObs = observableValue("isComplete", false);
      let interruptCalls = 0;
      const { resource } = setupRemoteProvider({
        progressObs,
        isCompleteObs,
        interruptActiveResponseCallback: async () => {
          interruptCalls++;
          return true;
        }
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const model = ref.object;
      const lastRequest = model.lastRequest;
      assert.strictEqual(lastRequest.response?.isComplete, false);
      isCompleteObs.set(true, void 0);
      assert.strictEqual(lastRequest.response?.isComplete, true, "Response should complete when isCompleteObs transitions to true");
      await testService.cancelCurrentRequestForSession(resource, "test");
      assert.strictEqual(interruptCalls, 0, "Interrupt should not fire after the turn has completed");
    });
    test("interrupt callback returning false installs a fresh pending request so cancel can be retried", async () => {
      const progressObs = observableValue("progress", []);
      const isCompleteObs = observableValue("isComplete", false);
      const interruptResults = [false, true];
      const interruptInvocations = [];
      const { resource } = setupRemoteProvider({
        progressObs,
        isCompleteObs,
        interruptActiveResponseCallback: async () => {
          const index = interruptInvocations.length;
          interruptInvocations.push(index);
          return interruptResults[index] ?? true;
        }
      });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      await testService.cancelCurrentRequestForSession(resource, "test-first");
      await testService.cancelCurrentRequestForSession(resource, "test-second");
      assert.strictEqual(interruptInvocations.length, 2, "Interrupt callback should be invoked on both cancel attempts");
    });
    test("non-streaming session with isCompleteObs=true at load: response completes synchronously", async () => {
      const isCompleteObs = observableValue("isComplete", true);
      const { resource } = setupRemoteProvider({ isCompleteObs });
      const testService = createChatService();
      const ref = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref);
      testDisposables.add(ref);
      const model = ref.object;
      assert.strictEqual(model.lastRequest?.response?.isComplete, true, "Non-streaming session should complete response at load time");
    });
    test("draft input is restored after disposing and reloading a remote session", async () => {
      const { resource } = setupRemoteProvider({ history: [] });
      const testService = createChatService();
      const ref1 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref1, "Should load remote session");
      const model1 = ref1.object;
      model1.inputModel.setState({
        inputText: "unsent draft",
        selections: [{ selectionStartLineNumber: 1, selectionStartColumn: 1, positionLineNumber: 1, positionColumn: 12 }]
      });
      ref1.dispose();
      await testService.waitForModelDisposals();
      const ref2 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref2, "Should re-load remote session");
      testDisposables.add(ref2);
      const model2 = ref2.object;
      const restored = model2.inputModel.state.get();
      assert.strictEqual(restored?.inputText, "unsent draft", "Input text should be restored");
    });
    test("restored draft uses the session history model, not the persisted (stale) one", async () => {
      const historyModelId = "history-model";
      const historyMetadata = {
        id: historyModelId,
        name: "History Model",
        vendor: "copilot",
        version: "1.0",
        family: "history",
        extension: new ExtensionIdentifier("a.b"),
        isUserSelectable: true,
        maxInputTokens: 8192,
        maxOutputTokens: 1024,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      };
      instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
        lookupLanguageModel(id) {
          return id === historyModelId ? historyMetadata : void 0;
        }
      }());
      const { resource } = setupRemoteProvider({
        history: [{ type: "request", prompt: "hello", participant: remoteScheme, modelId: historyModelId }]
      });
      const testService = createChatService();
      const ref1 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref1, "Should load remote session");
      ref1.object.inputModel.setState({
        inputText: "unsent draft",
        selectedModel: { identifier: "stale-model", metadata: { ...historyMetadata, id: "stale-model", name: "Stale Model" } }
      });
      ref1.dispose();
      await testService.waitForModelDisposals();
      const ref2 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref2, "Should re-load remote session");
      testDisposables.add(ref2);
      const restored = ref2.object.inputModel.state.get();
      assert.deepStrictEqual(
        { inputText: restored?.inputText, selectedModel: restored?.selectedModel?.identifier },
        { inputText: "unsent draft", selectedModel: historyModelId },
        "Draft text is restored and the model comes from session history, not the stale persisted selection"
      );
    });
    test("restored draft keeps the history model while the live catalog is cold", async () => {
      const historyModelId = "agent-host-copilotcli:gpt-5.6-sol";
      const historyMetadata = {
        id: historyModelId,
        name: "GPT-5.6 Sol",
        vendor: "agent-host-copilotcli",
        version: "1.0",
        family: "gpt-5.6-sol",
        extension: new ExtensionIdentifier("a.b"),
        isUserSelectable: true,
        maxInputTokens: 8192,
        maxOutputTokens: 1024,
        isDefaultForLocation: {},
        targetChatSessionType: remoteScheme
      };
      let catalogLoaded = true;
      instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
        lookupLanguageModel(id) {
          return catalogLoaded && id === historyModelId ? historyMetadata : void 0;
        }
      }());
      const { resource } = setupRemoteProvider({
        history: [{ type: "request", prompt: "hello", participant: remoteScheme, modelId: historyModelId }]
      });
      const testService = createChatService();
      const ref1 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref1, "Should load remote session");
      ref1.object.inputModel.setState({
        inputText: "unsent draft",
        selectedModel: { identifier: historyModelId, metadata: historyMetadata }
      });
      ref1.dispose();
      await testService.waitForModelDisposals();
      catalogLoaded = false;
      const ref2 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref2, "Should re-load remote session");
      testDisposables.add(ref2);
      const restored = ref2.object.inputModel.state.get();
      assert.deepStrictEqual({
        inputText: restored?.inputText,
        selectedModel: restored?.selectedModel?.identifier,
        target: restored?.selectedModel?.metadata.targetChatSessionType
      }, {
        inputText: "unsent draft",
        selectedModel: historyModelId,
        target: remoteScheme
      });
    });
    test("restored draft preserves the model configuration (effort/context) of the history model", async () => {
      const historyModelId = "history-model";
      const historyMetadata = {
        id: historyModelId,
        name: "History Model",
        vendor: "copilot",
        version: "1.0",
        family: "history",
        extension: new ExtensionIdentifier("a.b"),
        isUserSelectable: true,
        maxInputTokens: 8192,
        maxOutputTokens: 1024,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      };
      instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
        lookupLanguageModel(id) {
          return id === historyModelId ? historyMetadata : void 0;
        }
      }());
      const { resource } = setupRemoteProvider({
        history: [{ type: "request", prompt: "hello", participant: remoteScheme, modelId: historyModelId }]
      });
      const testService = createChatService();
      const modelConfiguration = { thinkingEffort: "high", contextSize: 1e6 };
      const ref1 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref1, "Should load remote session");
      ref1.object.inputModel.setState({
        inputText: "unsent draft",
        selectedModel: { identifier: historyModelId, metadata: historyMetadata },
        modelConfiguration
      });
      ref1.dispose();
      await testService.waitForModelDisposals();
      const ref2 = await testService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None);
      assert.ok(ref2, "Should re-load remote session");
      testDisposables.add(ref2);
      const restored = ref2.object.inputModel.state.get();
      assert.deepStrictEqual(
        { selectedModel: restored?.selectedModel?.identifier, modelConfiguration: restored?.modelConfiguration },
        { selectedModel: historyModelId, modelConfiguration },
        "Model and its configuration (effort + context window) are restored from the persisted draft for the history model"
      );
    });
  });
  test("onWillSaveState persists session index synchronously so it survives reload", async () => {
    const testService = createChatService();
    const storageService = instantiationService.get(IStorageService);
    const ref = testService.startNewLocalSession(ChatAgentLocation.Chat);
    const model = ref.object;
    model.addRequest({ parts: [], text: "hello world" }, { variables: [] }, 0);
    storageService.testEmitWillSaveState(WillSaveStateReason.SHUTDOWN);
    const testService2 = createChatService();
    const historyItems = await testService2.getHistorySessionItems();
    assert.ok(
      historyItems.some((item) => item.sessionResource.toString() === model.sessionResource.toString()),
      `Session ${model.sessionResource} should appear in history after onWillSaveState. Got: ${historyItems.map((i) => i.sessionResource.toString()).join(", ")}`
    );
    ref.dispose();
  });
  test("removeHistoryEntry marks model as deleted and excludes from getLiveSessionItems", async () => {
    testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));
    const testService = createChatService();
    const ref = testDisposables.add(startSessionModel(testService));
    const model = ref.object;
    const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithMarkdownId} test request`);
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    assert.strictEqual(model.getRequests().length, 1);
    const liveItemsBefore = await testService.getLiveSessionItems();
    assert.ok(
      liveItemsBefore.some((item) => item.sessionResource.toString() === model.sessionResource.toString()),
      "Session should appear in getLiveSessionItems before deletion"
    );
    await testService.removeHistoryEntry(model.sessionResource);
    const liveItemsAfter = await testService.getLiveSessionItems();
    assert.ok(
      !liveItemsAfter.some((item) => item.sessionResource.toString() === model.sessionResource.toString()),
      "Session should NOT appear in getLiveSessionItems after deletion"
    );
    assert.strictEqual(model.isDeleted, true);
  });
  test("removeHistoryEntry prevents re-saving on model disposal", async () => {
    testDisposables.add(chatAgentService.registerAgentImplementation(chatAgentWithMarkdownId, chatAgentWithMarkdown));
    const testService = createChatService();
    const ref = testDisposables.add(startSessionModel(testService));
    const model = ref.object;
    const response = await testService.sendRequest(model.sessionResource, `@${chatAgentWithMarkdownId} test request`);
    ChatSendResult.assertSent(response);
    await response.data.responseCompletePromise;
    await testService.removeHistoryEntry(model.sessionResource);
    ref.dispose();
    await testService.waitForModelDisposals();
    const testService2 = createChatService();
    const historyItems = await testService2.getHistorySessionItems();
    assert.ok(
      !historyItems.some((item) => item.sessionResource.toString() === model.sessionResource.toString()),
      "Deleted session should NOT reappear in history after model disposal"
    );
  });
});
suite("backfillRestoredPickerState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const AGENT = "agent";
  const model = (identifier) => ({
    identifier,
    metadata: {
      id: identifier,
      name: identifier,
      vendor: "copilot",
      version: "1.0",
      family: "test",
      extension: new ExtensionIdentifier("a.b"),
      isUserSelectable: true,
      maxInputTokens: 8192,
      maxOutputTokens: 1024,
      isDefaultForLocation: {}
    }
  });
  const state = (modeId, selectedModel) => ({
    attachments: [],
    mode: { id: modeId, kind: ChatModeKind.Agent },
    selectedModel,
    inputText: "",
    selections: [],
    contrib: {}
  });
  test("does not backfill selectedModel from stored state when the chosen state has none", () => {
    const result = backfillRestoredPickerState(state(AGENT, void 0), state(AGENT, model("agent-host-claude:opus")), AGENT);
    assert.strictEqual(result?.selectedModel, void 0);
  });
  test("keeps the chosen model when present (never overrides it with the stored one)", () => {
    const result = backfillRestoredPickerState(state(AGENT, model("agent-host-claude:opus")), state(AGENT, model("agent-host-claude:haiku")), AGENT);
    assert.strictEqual(result?.selectedModel?.identifier, "agent-host-claude:opus");
  });
  test("promotes a stored custom agent over the default Agent only, never over an explicit mode", () => {
    assert.strictEqual(backfillRestoredPickerState(state(AGENT, void 0), state("custom-uri", void 0), AGENT)?.mode.id, "custom-uri", "default Agent \u2192 stored custom agent");
    assert.strictEqual(backfillRestoredPickerState(state("other-uri", void 0), state("custom-uri", void 0), AGENT)?.mode.id, "other-uri", "explicit mode is not overridden");
    assert.strictEqual(backfillRestoredPickerState(state(AGENT, void 0), state(AGENT, void 0), AGENT)?.mode.id, AGENT, "stored default Agent leaves chosen Agent");
  });
  test("returns the chosen state unchanged when there is no stored state", () => {
    const chosen = state(AGENT, void 0);
    assert.strictEqual(backfillRestoredPickerState(chosen, void 0, AGENT), chosen);
  });
});
suite("backfillTransferredModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const AGENT = "agent";
  const model = (identifier) => ({
    identifier,
    metadata: {
      id: identifier,
      name: identifier,
      vendor: "copilot",
      version: "1.0",
      family: "test",
      extension: new ExtensionIdentifier("a.b"),
      isUserSelectable: true,
      maxInputTokens: 8192,
      maxOutputTokens: 1024,
      isDefaultForLocation: {}
    }
  });
  const state = (selectedModel) => ({
    attachments: [],
    mode: { id: AGENT, kind: ChatModeKind.Agent },
    selectedModel,
    inputText: "",
    selections: [],
    contrib: {}
  });
  test("backfills the history model when the transferred state dropped its model", () => {
    const history = model("agent-host-copilotcli:gpt-5.6-sol");
    const result = backfillTransferredModel(state(void 0), history);
    assert.strictEqual(result?.selectedModel?.identifier, "agent-host-copilotcli:gpt-5.6-sol");
  });
  test("never overrides a model already present on the transferred state", () => {
    const result = backfillTransferredModel(state(model("agent-host-copilotcli:gpt-5.6-terra")), model("agent-host-copilotcli:gpt-5.6-sol"));
    assert.strictEqual(result?.selectedModel?.identifier, "agent-host-copilotcli:gpt-5.6-terra");
  });
  test("leaves the state unchanged when there is no history model", () => {
    const chosen = state(void 0);
    assert.strictEqual(backfillTransferredModel(chosen, void 0), chosen);
    assert.strictEqual(chosen.selectedModel, void 0);
  });
  test("returns undefined state as-is", () => {
    assert.strictEqual(backfillTransferredModel(void 0, model("agent-host-copilotcli:gpt-5.6-sol")), void 0);
  });
});
function toSnapshotExportData(model) {
  const exp = model.toExport();
  return {
    ...exp,
    requests: exp.requests.map((r) => {
      const { slashCommand, usedContext, contentReferences, codeCitations, timeSpentWaiting, isSystemInitiated: _isSystemInitiated, systemInitiatedLabel: _systemInitiatedLabel, responseTimestamp: _responseTimestamp, elapsedMs: _elapsedMs, completionTokens: _completionTokens, promptTokens: _promptTokens, outputBuffer: _outputBuffer, promptTokenDetails: _promptTokenDetails, copilotCredits: _copilotCredits, ...rest } = r;
      return {
        ...rest,
        modelState: {
          ...r.modelState,
          completedAt: void 0
        },
        timestamp: void 0,
        requestId: void 0,
        // id contains a random part
        responseId: void 0,
        // id contains a random part
        voteDownReason: void 0,
        // removed from model, kept for snapshot compat
        slashCommand,
        usedContext,
        contentReferences,
        codeCitations,
        timeSpentWaiting
      };
    })
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGFzc2VydFNuYXBzaG90IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9zbmFwc2hvdC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgV2lsbFNhdmVTdGF0ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0b1VzZXJEYXRhUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlUZXN0RmlsZVNlcnZpY2UsIG1vY2ssIFRlc3RDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RFeHRlbnNpb25TZXJ2aWNlLCBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IFRlc3RNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL3Rlc3QvY29tbW9uL3Rlc3RNY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z1NlcnZpY2VJbXBsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgSUNoYXRGb2xsb3d1cCwgSUNoYXRNb2RlbFJlZmVyZW5jZSwgSUNoYXRQcm9ncmVzcywgSUNoYXRTZXJ2aWNlLCBSZXNwb25zZU1vZGVsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsLCBiYWNrZmlsbFJlc3RvcmVkUGlja2VyU3RhdGUsIENoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSwgSUNoYXRFZGl0aW5nU2VydmljZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgSU1vZGlmaWVkRmlsZUVudHJ5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgSUNoYXRNb2RlbCwgSVNlcmlhbGl6YWJsZUNoYXREYXRhLCBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFNlcnZpY2UsIElDaGF0QWdlbnQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24sIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLCBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmVkSG9va3NJbmZvLCBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi9tb2NrQ2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvc2VydmljZS9tb2NrUHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi90b29scy9tb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlcnZpY2UgfSBmcm9tICcuL21vY2tDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIElDaGF0U2Vzc2lvbiwgSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLCBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSwgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uU2VydmVyUmVxdWVzdCwgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uL21vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0RFQlVHX0xPR19GSUxFX0xPR0dJTkdfRU5BQkxFRF9TRVRUSU5HLCBDT1BJTE9UX1NLSUxMX1VSSV9TQ0hFTUUsIFRST1VCTEVTSE9PVF9TS0lMTF9QQVRIIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuXG5jb25zdCBjaGF0QWdlbnRXaXRoVXNlZENvbnRleHRJZCA9ICdDaGF0UHJvdmlkZXJXaXRoVXNlZENvbnRleHQnO1xuY29uc3QgY2hhdEFnZW50V2l0aFVzZWRDb250ZXh0OiBJQ2hhdEFnZW50ID0ge1xuXHRpZDogY2hhdEFnZW50V2l0aFVzZWRDb250ZXh0SWQsXG5cdG5hbWU6IGNoYXRBZ2VudFdpdGhVc2VkQ29udGV4dElkLFxuXHRleHRlbnNpb25JZDogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0cHVibGlzaGVyRGlzcGxheU5hbWU6ICcnLFxuXHRleHRlbnNpb25QdWJsaXNoZXJJZDogJycsXG5cdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnJyxcblx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdG1vZGVzOiBbQ2hhdE1vZGVLaW5kLkFza10sXG5cdG1ldGFkYXRhOiB7fSxcblx0c2xhc2hDb21tYW5kczogW10sXG5cdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzLCBoaXN0b3J5LCB0b2tlbikge1xuXHRcdHByb2dyZXNzKFt7XG5cdFx0XHRkb2N1bWVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy90ZXN0L3BhdGgvdG8vZmlsZScpLFxuXHRcdFx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRcdFx0cmFuZ2VzOiBbXG5cdFx0XHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMiwgMilcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRraW5kOiAndXNlZENvbnRleHQnXG5cdFx0fV0pO1xuXG5cdFx0cmV0dXJuIHsgbWV0YWRhdGE6IHsgbWV0YWRhdGFLZXk6ICd2YWx1ZScgfSB9O1xuXHR9LFxuXHRhc3luYyBwcm92aWRlRm9sbG93dXBzKHNlc3Npb25JZCwgdG9rZW4pIHtcblx0XHRyZXR1cm4gW3sga2luZDogJ3JlcGx5JywgbWVzc2FnZTogJ1NvbWV0aGluZyBlbHNlJywgYWdlbnRJZDogJycsIHRvb2x0aXA6ICdhIHRvb2x0aXAnIH0gc2F0aXNmaWVzIElDaGF0Rm9sbG93dXBdO1xuXHR9LFxufTtcblxuY29uc3QgY2hhdEFnZW50V2l0aE1hcmtkb3duSWQgPSAnQ2hhdFByb3ZpZGVyV2l0aE1hcmtkb3duJztcbmNvbnN0IGNoYXRBZ2VudFdpdGhNYXJrZG93bjogSUNoYXRBZ2VudCA9IHtcblx0aWQ6IGNoYXRBZ2VudFdpdGhNYXJrZG93bklkLFxuXHRuYW1lOiBjaGF0QWdlbnRXaXRoTWFya2Rvd25JZCxcblx0ZXh0ZW5zaW9uSWQ6IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiAnJyxcblx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICcnLFxuXHRleHRlbnNpb25EaXNwbGF5TmFtZTogJycsXG5cdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRtb2RlczogW0NoYXRNb2RlS2luZC5Bc2tdLFxuXHRtZXRhZGF0YToge30sXG5cdHNsYXNoQ29tbWFuZHM6IFtdLFxuXHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdGFzeW5jIGludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pIHtcblx0XHRwcm9ncmVzcyhbeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCd0ZXN0JykgfV0pO1xuXHRcdHJldHVybiB7IG1ldGFkYXRhOiB7IG1ldGFkYXRhS2V5OiAndmFsdWUnIH0gfTtcblx0fSxcblx0YXN5bmMgcHJvdmlkZUZvbGxvd3VwcyhzZXNzaW9uSWQsIHRva2VuKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9LFxufTtcblxuZnVuY3Rpb24gZ2V0QWdlbnREYXRhKGlkOiBzdHJpbmcpOiBJQ2hhdEFnZW50RGF0YSB7XG5cdHJldHVybiB7XG5cdFx0bmFtZTogaWQsXG5cdFx0aWQ6IGlkLFxuXHRcdGV4dGVuc2lvbklkOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6ICcnLFxuXHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiAnJyxcblx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJycsXG5cdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrXSxcblx0XHRtZXRhZGF0YToge30sXG5cdFx0c2xhc2hDb21tYW5kczogW10sXG5cdFx0ZGlzYW1iaWd1YXRpb246IFtdLFxuXHR9O1xufVxuXG5zdWl0ZSgnQ2hhdFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHRlc3RGaWxlU2VydmljZTogSW5NZW1vcnlUZXN0RmlsZVNlcnZpY2U7XG5cdGxldCBlZGl0aW5nU2Vzc2lvbkVudHJpZXM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSU1vZGlmaWVkRmlsZUVudHJ5W10+O1xuXG5cdGxldCBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZTtcblx0Y29uc3QgdGVzdFNlcnZpY2VzOiBDaGF0U2VydmljZVtdID0gW107XG5cblx0LyoqXG5cdCAqIEVuc3VyZSB3ZSB3YWl0IGZvciBtb2RlbCBkaXNwb3NhbHMgZnJvbSBhbGwgY3JlYXRlZCBDaGF0U2VydmljZXNcblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZUNoYXRTZXJ2aWNlKCk6IENoYXRTZXJ2aWNlIHtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2VydmljZSkpO1xuXHRcdHRlc3RTZXJ2aWNlcy5wdXNoKHNlcnZpY2UpO1xuXHRcdHJldHVybiBzZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRTZXNzaW9uTW9kZWwoc2VydmljZTogSUNoYXRTZXJ2aWNlLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24gPSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTogSUNoYXRNb2RlbFJlZmVyZW5jZSB7XG5cdFx0Y29uc3QgcmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKGxvY2F0aW9uKSk7XG5cdFx0cmV0dXJuIHJlZjtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGdldE9yUmVzdG9yZU1vZGVsKHNlcnZpY2U6IElDaGF0U2VydmljZSwgcmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUNoYXRNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGVzdERpc3Bvc2FibGVzLmFkZChyZWYpLm9iamVjdDtcblx0fVxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUNoYXRWYXJpYWJsZXNTZXJ2aWNlLCBuZXcgTW9ja0NoYXRWYXJpYWJsZXNTZXJ2aWNlKCldLFxuXHRcdFx0W0lXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgbmV3IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSgpXSxcblx0XHRcdFtJTWNwU2VydmljZSwgbmV3IFRlc3RNY3BTZXJ2aWNlKCldLFxuXHRcdFx0W0lQcm9tcHRzU2VydmljZSwgbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpXSxcblx0XHRcdFtJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSldXG5cdFx0KSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIG5ldyBUZXN0Q2hhdEVudGl0bGVtZW50U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHsgZGVmYXVsdFByb2ZpbGU6IHRvVXNlckRhdGFQcm9maWxlKCdkZWZhdWx0JywgJ0RlZmF1bHQnLCBVUkkuZmlsZSgnL3Rlc3QvdXNlcmRhdGEnKSwgVVJJLmZpbGUoJy90ZXN0L2NhY2hlJykpIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVmlld3NTZXJ2aWNlLCBuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBNb2NrQ2hhdFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgbmV3IE51bGxMYW5ndWFnZU1vZGVsc1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRW52aXJvbm1lbnRTZXJ2aWNlLCB7IHdvcmtzcGFjZVN0b3JhZ2VIb21lOiBVUkkuZmlsZSgnL3Rlc3QvcGF0aC90by93b3Jrc3BhY2VTdG9yYWdlJykgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGlmZWN5Y2xlU2VydmljZSwgeyBvbldpbGxTaHV0ZG93bjogRXZlbnQuTm9uZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSwgeyBvbkRpZEVudGVyV29ya3NwYWNlOiBFdmVudC5Ob25lIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXREZWJ1Z1NlcnZpY2UsIHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IENoYXREZWJ1Z1NlcnZpY2VJbXBsKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpKTtcblx0XHRlZGl0aW5nU2Vzc2lvbkVudHJpZXMgPSBvYnNlcnZhYmxlVmFsdWUoJ2VkaXRpbmdTZXNzaW9uRW50cmllcycsIFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0RWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRFZGl0aW5nU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBzdGFydE9yQ29udGludWVHbG9iYWxFZGl0aW5nU2Vzc2lvbigpOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0ZTogY29uc3RPYnNlcnZhYmxlKENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLklkbGUpLFxuXHRcdFx0XHRcdHJlcXVlc3REaXNhYmxlbWVudDogb2JzZXJ2YWJsZVZhbHVlKCdyZXF1ZXN0RGlzYWJsZW1lbnQnLCBbXSksXG5cdFx0XHRcdFx0ZW50cmllczogZWRpdGluZ1Nlc3Npb25FbnRyaWVzLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRFZGl0aW5nU2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIENvbmZpZ3VyZSB0ZXN0IGZpbGUgc2VydmljZSB3aXRoIHRyYWNraW5nIGFuZCBpbi1tZW1vcnkgc3RvcmFnZVxuXHRcdHRlc3RGaWxlU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5VGVzdEZpbGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB0ZXN0RmlsZVNlcnZpY2UpO1xuXG5cdFx0Y2hhdEFnZW50U2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50U2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRBZ2VudFNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50KCd0ZXN0QWdlbnQnLCB7IC4uLmdldEFnZW50RGF0YSgndGVzdEFnZW50JyksIGlzRGVmYXVsdDogdHJ1ZSB9KSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoY2hhdEFnZW50V2l0aFVzZWRDb250ZXh0SWQsIGdldEFnZW50RGF0YShjaGF0QWdlbnRXaXRoVXNlZENvbnRleHRJZCkpKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChjaGF0QWdlbnRXaXRoTWFya2Rvd25JZCwgZ2V0QWdlbnREYXRhKGNoYXRBZ2VudFdpdGhNYXJrZG93bklkKSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ3Rlc3RBZ2VudCcsIGFnZW50KSk7XG5cdFx0Y2hhdEFnZW50U2VydmljZS51cGRhdGVBZ2VudCgndGVzdEFnZW50Jywge30pO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGVzdFNlcnZpY2VzLm1hcChzID0+IHMud2FpdEZvck1vZGVsRGlzcG9zYWxzKCkpKTtcblx0XHR0ZXN0U2VydmljZXMubGVuZ3RoID0gMDtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Byb3BhZ2F0ZXMgQWdlbnRzIFZvaWNlIE1vZGUgaW5wdXQgdG8gdGhlIHBhcnRpY2lwYW50IHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FwdHVyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KCk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3ZvaWNlQWdlbnQnLCBnZXRBZ2VudERhdGEoJ3ZvaWNlQWdlbnQnKSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ3ZvaWNlQWdlbnQnLCB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCkge1xuXHRcdFx0XHRjYXB0dXJlZC5jb21wbGV0ZShyZXF1ZXN0LmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbCA9IHN0YXJ0U2Vzc2lvbk1vZGVsKHNlcnZpY2UpLm9iamVjdDtcblxuXHRcdGF3YWl0IHNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAndm9pY2UgcmVxdWVzdCcsIHtcblx0XHRcdGFnZW50SWQ6ICd2b2ljZUFnZW50Jyxcblx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgY2FwdHVyZWQucCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NsYXNoIGNvbW1hbmRzIGNhbiBzaGFyZSBpZHMgYWNyb3NzIG5vbi1vdmVybGFwcGluZyBzZXNzaW9uIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTbGFzaENvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm9ncmVzcyA9IHsgcmVwb3J0OiAoX3Byb2dyZXNzOiBJQ2hhdFByb2dyZXNzKSA9PiB7IH0gfTtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnc3dpdGNoJyxcblx0XHRcdGRldGFpbDogJ0xvY2FsIHN3aXRjaCcsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogWydsb2NhbCddLFxuXHRcdH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGV4ZWN1dGlvbnMucHVzaCgnbG9jYWwnKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0Y29tbWFuZDogJ3N3aXRjaCcsXG5cdFx0XHRkZXRhaWw6ICdSZW1vdGUgc3dpdGNoJyxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbJ3JlbW90ZSddLFxuXHRcdH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGV4ZWN1dGlvbnMucHVzaCgncmVtb3RlJyk7XG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZFNlcnZpY2UuaGFzQ29tbWFuZCgnc3dpdGNoJywgJ2xvY2FsJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbGFzaENvbW1hbmRTZXJ2aWNlLmhhc0NvbW1hbmQoJ3N3aXRjaCcsICdyZW1vdGUnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZFNlcnZpY2UuaGFzQ29tbWFuZCgnc3dpdGNoJywgJ290aGVyJyksIGZhbHNlKTtcblxuXHRcdGF3YWl0IHNsYXNoQ29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3N3aXRjaCcsICcnLCBwcm9ncmVzcywgW10sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignbG9jYWwtc2Vzc2lvbicpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCBzbGFzaENvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdzd2l0Y2gnLCAnJywgcHJvZ3Jlc3MsIFtdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBVUkkuZnJvbSh7IHNjaGVtZTogJ3JlbW90ZScsIHBhdGg6ICcvc2Vzc2lvbicgfSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRpb25zLCBbJ2xvY2FsJywgJ3JlbW90ZSddKTtcblx0fSk7XG5cblx0dGVzdCgnc2xhc2ggY29tbWFuZHMgcmVqZWN0IG92ZXJsYXBwaW5nIHNlc3Npb24gdHlwZXMgZm9yIHRoZSBzYW1lIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTbGFzaENvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGFzeW5jICgpID0+IHVuZGVmaW5lZDtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnc3dpdGNoJyxcblx0XHRcdGRldGFpbDogJ0xvY2FsIHN3aXRjaCcsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogWydsb2NhbCcsICdyZW1vdGUnXSxcblx0XHR9LCBjb21tYW5kKSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0Y29tbWFuZDogJ3N3aXRjaCcsXG5cdFx0XHRkZXRhaWw6ICdSZW1vdGUgc3dpdGNoJyxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbJ3JlbW90ZScsICdvdGhlciddLFxuXHRcdH0sIGNvbW1hbmQpKTtcblx0fSk7XG5cblx0dGVzdCgnc2xhc2ggY29tbWFuZHMgd2l0aG91dCBzZXNzaW9uIHR5cGVzIGFwcGx5IHRvIGFsbCBzZXNzaW9uIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZFNlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTbGFzaENvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZXhlY3V0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm9ncmVzcyA9IHsgcmVwb3J0OiAoX3Byb2dyZXNzOiBJQ2hhdFByb2dyZXNzKSA9PiB7IH0gfTtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnc3dpdGNoJyxcblx0XHRcdGRldGFpbDogJ0FsbCBzZXNzaW9ucyBzd2l0Y2gnLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZXhlY3V0aW9ucy5wdXNoKCdhbGwnKTtcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2xhc2hDb21tYW5kU2VydmljZS5oYXNDb21tYW5kKCdzd2l0Y2gnLCAnbG9jYWwnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNsYXNoQ29tbWFuZFNlcnZpY2UuaGFzQ29tbWFuZCgnc3dpdGNoJywgJ3JlbW90ZScpLCB0cnVlKTtcblxuXHRcdGF3YWl0IHNsYXNoQ29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3N3aXRjaCcsICcnLCBwcm9ncmVzcywgW10sIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignbG9jYWwtc2Vzc2lvbicpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCBzbGFzaENvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdzd2l0Y2gnLCAnJywgcHJvZ3Jlc3MsIFtdLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBVUkkuZnJvbSh7IHNjaGVtZTogJ3JlbW90ZScsIHBhdGg6ICcvc2Vzc2lvbicgfSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleGVjdXRpb25zLCBbJ2FsbCcsICdhbGwnXSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICdzd2l0Y2gnLFxuXHRcdFx0ZGV0YWlsOiAnUmVtb3RlIHN3aXRjaCcsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogWydyZW1vdGUnXSxcblx0XHR9LCBhc3luYyAoKSA9PiB1bmRlZmluZWQpKTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmlldmVTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHQvLyBEb24ndCBhZGQgcmVmcyB0byB0ZXN0RGlzcG9zYWJsZXMgc28gd2UgY2FuIGNvbnRyb2wgZGlzcG9zYWxcblx0XHRjb25zdCBzZXNzaW9uMVJlZiA9IHRlc3RTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb24xID0gc2Vzc2lvbjFSZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRzZXNzaW9uMS5hZGRSZXF1ZXN0KHsgcGFydHM6IFtdLCB0ZXh0OiAncmVxdWVzdCAxJyB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uMlJlZiA9IHRlc3RTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb24yID0gc2Vzc2lvbjJSZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRzZXNzaW9uMi5hZGRSZXF1ZXN0KHsgcGFydHM6IFtdLCB0ZXh0OiAncmVxdWVzdCAyJyB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cblx0XHQvLyBEaXNwb3NlIHJlZnMgdG8gdHJpZ2dlciBwZXJzaXN0ZW5jZSB0byBmaWxlIHNlcnZpY2Vcblx0XHRzZXNzaW9uMVJlZi5kaXNwb3NlKCk7XG5cdFx0c2Vzc2lvbjJSZWYuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gV2FpdCBmb3IgYXN5bmMgcGVyc2lzdGVuY2UgdG8gY29tcGxldGVcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdC8vIFZlcmlmeSB0aGF0IHNlc3Npb25zIHdlcmUgd3JpdHRlbiB0byB0aGUgZmlsZSBzZXJ2aWNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RGaWxlU2VydmljZS53cml0ZU9wZXJhdGlvbnMubGVuZ3RoLCAyLCAnU2hvdWxkIGhhdmUgd3JpdHRlbiAyIHNlc3Npb25zIHRvIGZpbGUgc2VydmljZScpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbjFXcml0ZU9wID0gdGVzdEZpbGVTZXJ2aWNlLndyaXRlT3BlcmF0aW9ucy5maW5kKChvcDogeyByZXNvdXJjZTogVVJJOyBjb250ZW50OiBzdHJpbmcgfSkgPT5cblx0XHRcdG9wLmNvbnRlbnQuaW5jbHVkZXMoJ3JlcXVlc3QgMScpKTtcblx0XHRjb25zdCBzZXNzaW9uMldyaXRlT3AgPSB0ZXN0RmlsZVNlcnZpY2Uud3JpdGVPcGVyYXRpb25zLmZpbmQoKG9wOiB7IHJlc291cmNlOiBVUkk7IGNvbnRlbnQ6IHN0cmluZyB9KSA9PlxuXHRcdFx0b3AuY29udGVudC5pbmNsdWRlcygncmVxdWVzdCAyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24xV3JpdGVPcCwgJ1Nlc3Npb24gMSBzaG91bGQgaGF2ZSBiZWVuIHdyaXR0ZW4gdG8gZmlsZSBzZXJ2aWNlJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24yV3JpdGVPcCwgJ1Nlc3Npb24gMiBzaG91bGQgaGF2ZSBiZWVuIHdyaXR0ZW4gdG8gZmlsZSBzZXJ2aWNlJyk7XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgc2VydmljZSBpbnN0YW5jZSB0byBzaW11bGF0ZSBhcHAgcmVzdGFydFxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlMiA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHQvLyBSZXRyaWV2ZSBzZXNzaW9ucyBhbmQgdmVyaWZ5IHRoZXkncmUgbG9hZGVkIGZyb20gZmlsZSBzZXJ2aWNlXG5cdFx0Y29uc3QgcmV0cmlldmVkMSA9IGF3YWl0IGdldE9yUmVzdG9yZU1vZGVsKHRlc3RTZXJ2aWNlMiwgc2Vzc2lvbjEuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXRyaWV2ZWQyID0gYXdhaXQgZ2V0T3JSZXN0b3JlTW9kZWwodGVzdFNlcnZpY2UyLCBzZXNzaW9uMi5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJldHJpZXZlZDEsICdTaG91bGQgcmV0cmlldmUgc2Vzc2lvbiAxJyk7XG5cdFx0YXNzZXJ0Lm9rKHJldHJpZXZlZDIsICdTaG91bGQgcmV0cmlldmUgc2Vzc2lvbiAyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXRyaWV2ZWQxLmdldFJlcXVlc3RzKClbMF0/Lm1lc3NhZ2UudGV4dCwgJ3JlcXVlc3QgMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0cmlldmVkMi5nZXRSZXF1ZXN0cygpWzBdPy5tZXNzYWdlLnRleHQsICdyZXF1ZXN0IDInKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBtb2RpZmllZCBlZGl0IGtlZXAtYWxpdmUgaG9sZGVycycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHRlc3RTZXJ2aWNlKTtcblx0XHRjb25zdCByb290UmVmID0gdGVzdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBkZWJ1Z093bmVyOiAnQ2hhdFNlcnZpY2VUZXN0I3Jvb3QnIH0pO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRFbnRyeSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1vZGlmaWVkRmlsZUVudHJ5PigpIHtcblx0XHRcdG92ZXJyaWRlIHN0YXRlID0gY29uc3RPYnNlcnZhYmxlKE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXHRcdH0oKTtcblxuXHRcdGVkaXRpbmdTZXNzaW9uRW50cmllcy5zZXQoW21vZGlmaWVkRW50cnldLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0U2VydmljZS5nZXRDaGF0TW9kZWxSZWZlcmVuY2VEZWJ1Z0luZm8oKS5tb2RlbHMubWFwKG1vZGVsID0+ICh7XG5cdFx0XHRjcmVhdGVkQnk6IG1vZGVsLmNyZWF0ZWRCeSxcblx0XHRcdGhvbGRlcnM6IG1vZGVsLmhvbGRlcnMsXG5cdFx0XHRoYXNQZW5kaW5nRWRpdHM6IG1vZGVsLmhhc1BlbmRpbmdFZGl0cyxcblx0XHRcdHJlZmVyZW5jZUNvdW50OiBtb2RlbC5yZWZlcmVuY2VDb3VudCxcblx0XHR9KSksIFt7XG5cdFx0XHRjcmVhdGVkQnk6ICdDaGF0U2VydmljZVRlc3Qjcm9vdCcsXG5cdFx0XHRob2xkZXJzOiBbXG5cdFx0XHRcdHsgaG9sZGVyOiAnQ2hhdE1vZGVsI21vZGlmaWVkRWRpdHNLZWVwQWxpdmUnLCBjb3VudDogMSB9LFxuXHRcdFx0XHR7IGhvbGRlcjogJ0NoYXRTZXJ2aWNlVGVzdCNyb290JywgY291bnQ6IDEgfVxuXHRcdFx0XSxcblx0XHRcdGhhc1BlbmRpbmdFZGl0czogdHJ1ZSxcblx0XHRcdHJlZmVyZW5jZUNvdW50OiAyLFxuXHRcdH1dKTtcblxuXHRcdGVkaXRpbmdTZXNzaW9uRW50cmllcy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0U2VydmljZS5nZXRDaGF0TW9kZWxSZWZlcmVuY2VEZWJ1Z0luZm8oKS5tb2RlbHMubWFwKG1vZGVsID0+ICh7XG5cdFx0XHRob2xkZXJzOiBtb2RlbC5ob2xkZXJzLFxuXHRcdFx0aGFzUGVuZGluZ0VkaXRzOiBtb2RlbC5oYXNQZW5kaW5nRWRpdHMsXG5cdFx0XHRyZWZlcmVuY2VDb3VudDogbW9kZWwucmVmZXJlbmNlQ291bnQsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aG9sZGVyczogW3sgaG9sZGVyOiAnQ2hhdFNlcnZpY2VUZXN0I3Jvb3QnLCBjb3VudDogMSB9XSxcblx0XHRcdGhhc1BlbmRpbmdFZGl0czogZmFsc2UsXG5cdFx0XHRyZWZlcmVuY2VDb3VudDogMSxcblx0XHR9XSk7XG5cblx0XHRyb290UmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkQ29tcGxldGVSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cblx0XHRhd2FpdCB0ZXN0U2VydmljZS5hZGRDb21wbGV0ZVJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAndGVzdCByZXF1ZXN0JywgdW5kZWZpbmVkLCAwLCB7IG1lc3NhZ2U6ICd0ZXN0IHJlc3BvbnNlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhtb2RlbC5nZXRSZXF1ZXN0cygpWzBdLnJlc3BvbnNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKVswXS5yZXNwb25zZT8ucmVzcG9uc2UudG9TdHJpbmcoKSwgJ3Rlc3QgcmVzcG9uc2UnKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgYWxsb3dzIGVtcHR5IG1lc3NhZ2Ugd2l0aCBleHBsaWNpdCBmaWxlIGF0dGFjaG1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cdFx0Y29uc3QgZmlsZUVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0geyBraW5kOiAnZmlsZScsIGlkOiAnZmlsZScsIG5hbWU6ICdSRUFETUUubWQnLCB2YWx1ZTogVVJJLmZpbGUoJy90ZXN0L1JFQURNRS5tZCcpIH07XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsICcnLCB7IGF0dGFjaGVkQ29udGV4dDogW2ZpbGVFbnRyeV0gfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKClbMF0ubWVzc2FnZS50ZXh0LCAnJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpWzBdLnZhcmlhYmxlRGF0YS52YXJpYWJsZXMsIFtmaWxlRW50cnldKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgcmVqZWN0cyBlbXB0eSBtZXNzYWdlIHdpdGhvdXQgZXhwbGljaXQgZmlsZSBhdHRhY2htZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdGNvbnN0IHdvcmtzcGFjZUVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ID0geyBraW5kOiAnd29ya3NwYWNlJywgaWQ6ICd3b3Jrc3BhY2UnLCBuYW1lOiAnd29ya3NwYWNlJywgdmFsdWU6ICd3b3Jrc3BhY2UnIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJycpLCB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ0VtcHR5IG1lc3NhZ2UnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnJywgeyBhdHRhY2hlZENvbnRleHQ6IFt3b3Jrc3BhY2VFbnRyeV0gfSksIHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnRW1wdHkgbWVzc2FnZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGBAJHtjaGF0QWdlbnRXaXRoVXNlZENvbnRleHRJZH0gdGVzdCByZXF1ZXN0YCk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHRvU25hcHNob3RFeHBvcnREYXRhKG1vZGVsKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeUxlbmd0aEFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bWV0YWRhdGE6IHsgaGlzdG9yeUxlbmd0aDogaGlzdG9yeS5sZW5ndGggfVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ2RlZmF1bHRBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdkZWZhdWx0QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudCgnYWdlbnQyJywgZ2V0QWdlbnREYXRhKCdhZ2VudDInKSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ2RlZmF1bHRBZ2VudCcsIGhpc3RvcnlMZW5ndGhBZ2VudCkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ2FnZW50MicsIGhpc3RvcnlMZW5ndGhBZ2VudCkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXG5cdFx0Ly8gU2VuZCBhIHJlcXVlc3QgdG8gZGVmYXVsdCBhZ2VudFxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCBgdGVzdCByZXF1ZXN0YCwgeyBhZ2VudElkOiAnZGVmYXVsdEFnZW50JyB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblx0XHRhd2FpdCByZXNwb25zZS5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKClbMF0ucmVzcG9uc2U/LnJlc3VsdD8ubWV0YWRhdGE/Lmhpc3RvcnlMZW5ndGgsIDApO1xuXG5cdFx0Ly8gU2VuZCBhIHJlcXVlc3QgdG8gYWdlbnQyLSBpdCBjYW4ndCBzZWUgdGhlIGRlZmF1bHQgYWdlbnQncyBtZXNzYWdlXG5cdFx0Y29uc3QgcmVzcG9uc2UyID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCBgdGVzdCByZXF1ZXN0YCwgeyBhZ2VudElkOiAnYWdlbnQyJyB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlMik7XG5cdFx0YXdhaXQgcmVzcG9uc2UyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKVsxXS5yZXNwb25zZT8ucmVzdWx0Py5tZXRhZGF0YT8uaGlzdG9yeUxlbmd0aCwgMCk7XG5cblx0XHQvLyBTZW5kIGEgcmVxdWVzdCB0byBkZWZhdWx0QWdlbnQgLSB0aGUgZGVmYXVsdCBhZ2VudCBjYW4gc2VlIGFnZW50MidzIG1lc3NhZ2Vcblx0XHRjb25zdCByZXNwb25zZTMgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGB0ZXN0IHJlcXVlc3RgLCB7IGFnZW50SWQ6ICdkZWZhdWx0QWdlbnQnIH0pO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UzKTtcblx0XHRhd2FpdCByZXNwb25zZTMuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpWzJdLnJlc3BvbnNlPy5yZXN1bHQ/Lm1ldGFkYXRhPy5oaXN0b3J5TGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHNlcmlhbGl6ZScsIGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGNoYXRBZ2VudFdpdGhVc2VkQ29udGV4dElkLCBjaGF0QWdlbnRXaXRoVXNlZENvbnRleHQpKTtcblx0XHRjaGF0QWdlbnRTZXJ2aWNlLnVwZGF0ZUFnZW50KGNoYXRBZ2VudFdpdGhVc2VkQ29udGV4dElkLCB7fSk7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblxuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHRvU25hcHNob3RFeHBvcnREYXRhKG1vZGVsKSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgYEAke2NoYXRBZ2VudFdpdGhVc2VkQ29udGV4dElkfSB0ZXN0IHJlcXVlc3RgKTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblx0XHRhd2FpdCByZXNwb25zZS5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cblx0XHRjb25zdCByZXNwb25zZTIgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGB0ZXN0IHJlcXVlc3QgMmApO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UyKTtcblx0XHRhd2FpdCByZXNwb25zZTIuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDIpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QodG9TbmFwc2hvdEV4cG9ydERhdGEobW9kZWwpKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRlc2VyaWFsaXplJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXJpYWxpemVkQ2hhdERhdGE6IElTZXJpYWxpemFibGVDaGF0RGF0YTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGNoYXRBZ2VudFdpdGhVc2VkQ29udGV4dElkLCBjaGF0QWdlbnRXaXRoVXNlZENvbnRleHQpKTtcblxuXHRcdC8vIGNyZWF0ZSB0aGUgZmlyc3Qgc2VydmljZSwgc2VuZCByZXF1ZXN0LCBnZXQgcmVzcG9uc2UsIGFuZCBzZXJpYWxpemUgdGhlIHN0YXRlXG5cdFx0eyAgLy8gc2VyYXBhdGUgYmxvY2sgdG8gbm90IGxlYWsgdmFyaWFibGVzIGluIG91dGVyIHNjb3BlXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHRcdGNvbnN0IGNoYXRNb2RlbDFSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwxID0gY2hhdE1vZGVsMVJlZi5vYmplY3Q7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdE1vZGVsMS5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMCk7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QoY2hhdE1vZGVsMS5zZXNzaW9uUmVzb3VyY2UsIGBAJHtjaGF0QWdlbnRXaXRoVXNlZENvbnRleHRJZH0gdGVzdCByZXF1ZXN0YCk7XG5cdFx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblxuXHRcdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdFx0c2VyaWFsaXplZENoYXREYXRhID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShjaGF0TW9kZWwxKSk7XG5cdFx0fVxuXG5cdFx0Ly8gdHJ5IGRlc2VyaWFsaXppbmcgdGhlIHN0YXRlIGludG8gYSBuZXcgc2VydmljZVxuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UyID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGNoYXRNb2RlbDJSZWYgPSB0ZXN0U2VydmljZTIubG9hZFNlc3Npb25Gcm9tRGF0YShzZXJpYWxpemVkQ2hhdERhdGEpO1xuXHRcdGFzc2VydChjaGF0TW9kZWwyUmVmKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRNb2RlbDJSZWYpO1xuXHRcdGNvbnN0IGNoYXRNb2RlbDIgPSBjaGF0TW9kZWwyUmVmLm9iamVjdDtcblxuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHRvU25hcHNob3RFeHBvcnREYXRhKGNoYXRNb2RlbDIpKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIGRlc2VyaWFsaXplIHdpdGggcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlcmlhbGl6ZWRDaGF0RGF0YTogSVNlcmlhbGl6YWJsZUNoYXREYXRhO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oY2hhdEFnZW50V2l0aE1hcmtkb3duSWQsIGNoYXRBZ2VudFdpdGhNYXJrZG93bikpO1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0XHRjb25zdCBjaGF0TW9kZWwxUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsMSA9IGNoYXRNb2RlbDFSZWYub2JqZWN0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRNb2RlbDEuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRNb2RlbDEuc2Vzc2lvblJlc291cmNlLCBgQCR7Y2hhdEFnZW50V2l0aFVzZWRDb250ZXh0SWR9IHRlc3QgcmVxdWVzdGApO1xuXHRcdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cblx0XHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRcdHNlcmlhbGl6ZWRDaGF0RGF0YSA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoY2hhdE1vZGVsMSkpO1xuXHRcdH1cblxuXHRcdC8vIHRyeSBkZXNlcmlhbGl6aW5nIHRoZSBzdGF0ZSBpbnRvIGEgbmV3IHNlcnZpY2VcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlMiA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBjaGF0TW9kZWwyUmVmID0gdGVzdFNlcnZpY2UyLmxvYWRTZXNzaW9uRnJvbURhdGEoc2VyaWFsaXplZENoYXREYXRhKTtcblx0XHRhc3NlcnQoY2hhdE1vZGVsMlJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0TW9kZWwyUmVmKTtcblx0XHRjb25zdCBjaGF0TW9kZWwyID0gY2hhdE1vZGVsMlJlZi5vYmplY3Q7XG5cblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdCh0b1NuYXBzaG90RXhwb3J0RGF0YShjaGF0TW9kZWwyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBzZXJpYWxpemUgYW5kIGRlc2VyaWFsaXplIGltcGxpY2l0IHJlcXVlc3QgZmxhZycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgc2VyaWFsaXplZENoYXREYXRhOiBJU2VyaWFsaXphYmxlQ2hhdERhdGE7XG5cblx0XHR7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwxUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsMSA9IGNoYXRNb2RlbDFSZWYub2JqZWN0O1xuXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRNb2RlbDEuc2Vzc2lvblJlc291cmNlLCAndGVzdCBpbXBsaWNpdCByZXF1ZXN0JywgeyBpc1N5c3RlbUluaXRpYXRlZDogdHJ1ZSB9KTtcblx0XHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRNb2RlbDEuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRNb2RlbDEuZ2V0UmVxdWVzdHMoKVswXS5pc1N5c3RlbUluaXRpYXRlZCwgdHJ1ZSk7XG5cblx0XHRcdHNlcmlhbGl6ZWRDaGF0RGF0YSA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkoY2hhdE1vZGVsMSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWRDaGF0RGF0YS5yZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWRDaGF0RGF0YS5yZXF1ZXN0c1swXS5pc1N5c3RlbUluaXRpYXRlZCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UyID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGF0TW9kZWwyUmVmID0gdGVzdFNlcnZpY2UyLmxvYWRTZXNzaW9uRnJvbURhdGEoc2VyaWFsaXplZENoYXREYXRhKTtcblx0XHRhc3NlcnQoY2hhdE1vZGVsMlJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0TW9kZWwyUmVmKTtcblx0XHRjb25zdCBjaGF0TW9kZWwyID0gY2hhdE1vZGVsMlJlZi5vYmplY3Q7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdE1vZGVsMi5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRNb2RlbDIuZ2V0UmVxdWVzdHMoKVswXS5pc1N5c3RlbUluaXRpYXRlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjcXVpcmVFeGlzdGluZ1Nlc3Npb24ga2VlcHMgbW9kZWwgYWxpdmUgZm9yIHN0ZWVyaW5nIHJlcXVlc3QgYWZ0ZXIgcmVmcyByZWxlYXNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gbW9kZWxSZWYub2JqZWN0LnNlc3Npb25SZXNvdXJjZTtcblxuXHRcdC8vIEFjcXVpcmUgYSBrZWVwLWFsaXZlIHJlZmVyZW5jZSAod2hhdCB0aGUgZml4IGRvZXMpXG5cdFx0Y29uc3Qga2VlcEFsaXZlUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZCh0ZXN0U2VydmljZS5hY3F1aXJlRXhpc3RpbmdTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgJ3Rlc3Qja2VlcEFsaXZlJykhKTtcblx0XHRhc3NlcnQub2soa2VlcEFsaXZlUmVmLCAnYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbiBzaG91bGQgcmV0dXJuIGEgcmVmZXJlbmNlJyk7XG5cblx0XHQvLyBSZWxlYXNlIHRoZSBvcmlnaW5hbCByZWZlcmVuY2UgdG8gc2ltdWxhdGUgdXNlciBuYXZpZ2F0aW5nIGF3YXlcblx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHQvLyBNb2RlbCBzaG91bGQgc3RpbGwgYmUgYWNjZXNzaWJsZSBiZWNhdXNlIGtlZXBBbGl2ZVJlZiBob2xkcyBpdFxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCAndGVybWluYWwgY29tcGxldGVkJywge1xuXHRcdFx0cXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmtpbmQsICdxdWV1ZWQnKTtcblxuXHRcdC8vIENsZWFuIHVwXG5cdFx0a2VlcEFsaXZlUmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWREaXNwb3NlU2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQodGVzdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpID09PSBtb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG1vZGVsUmVmLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgYSBzZXNzaW9uIGNhbmNlbHMgcGVuZGluZyBmb2xsb3d1cHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGZvbGxvd3Vwc1Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2xsb3d1cHNDYW5jZWxsZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElDaGF0Rm9sbG93dXBbXT4oKTtcblx0XHRjb25zdCBmb2xsb3d1cHNBZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0YXN5bmMgaW52b2tlKCkge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZUZvbGxvd3VwcyhyZXF1ZXN0LCByZXN1bHQsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdGZvbGxvd3Vwc1Rva2VuID0gdG9rZW47XG5cdFx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gZm9sbG93dXBzQ2FuY2VsbGVkLmNvbXBsZXRlKFtdKSkpO1xuXHRcdFx0XHRyZXR1cm4gZm9sbG93dXBzQ2FuY2VsbGVkLnA7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudCgnZm9sbG93dXBzQWdlbnQnLCB7IC4uLmdldEFnZW50RGF0YSgnZm9sbG93dXBzQWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdmb2xsb3d1cHNBZ2VudCcsIGZvbGxvd3Vwc0FnZW50KSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsUmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2UsICd0ZXN0IHJlcXVlc3QnLCB7IGFnZW50SWQ6ICdmb2xsb3d1cHNBZ2VudCcgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5vayhmb2xsb3d1cHNUb2tlbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGxvd3Vwc1Rva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCBmYWxzZSk7XG5cblx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sbG93dXBzVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGVlcmluZyBtZXNzYWdlIHF1ZXVlZCB0cmlnZ2VycyBzZXRZaWVsZFJlcXVlc3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjb21wbGV0ZVJlcXVlc3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IHNldFlpZWxkUmVxdWVzdGVkQ2FsbGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBzbG93QWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pIHtcblx0XHRcdFx0cmVxdWVzdFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVSZXF1ZXN0LnA7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH0sXG5cdFx0XHRzZXRZaWVsZFJlcXVlc3RlZChyZXF1ZXN0SWQ6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pIHtcblx0XHRcdFx0c2V0WWllbGRSZXF1ZXN0ZWRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Nsb3dBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdzbG93QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdzbG93QWdlbnQnLCBzbG93QWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdC8vIFN0YXJ0IGEgcmVxdWVzdCB0aGF0IHdpbGwgd2FpdFxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnZmlyc3QgcmVxdWVzdCcsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgYWdlbnQgdG8gc3RhcnQgcHJvY2Vzc2luZ1xuXHRcdGF3YWl0IHJlcXVlc3RTdGFydGVkLnA7XG5cblx0XHQvLyBRdWV1ZSBhIHN0ZWVyaW5nIG1lc3NhZ2Ugd2hpbGUgdGhlIGZpcnN0IHJlcXVlc3QgaXMgc3RpbGwgaW4gcHJvZ3Jlc3Ncblx0XHRjb25zdCBzdGVlcmluZ1Jlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnc3RlZXJpbmcgbWVzc2FnZScsIHtcblx0XHRcdGFnZW50SWQ6ICdzbG93QWdlbnQnLFxuXHRcdFx0cXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ZWVyaW5nUmVzcG9uc2Uua2luZCwgJ3F1ZXVlZCcpO1xuXG5cdFx0Ly8gc2V0WWllbGRSZXF1ZXN0ZWQgc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQgb24gdGhlIGFnZW50XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldFlpZWxkUmVxdWVzdGVkQ2FsbGVkLCB0cnVlLCAnc2V0WWllbGRSZXF1ZXN0ZWQgc2hvdWxkIGJlIGNhbGxlZCB3aGVuIGEgc3RlZXJpbmcgbWVzc2FnZSBpcyBxdWV1ZWQnKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBmaXJzdCByZXF1ZXN0XG5cdFx0Y29tcGxldGVSZXF1ZXN0LmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgc3RlZXJpbmcgbWVzc2FnZXMgYXJlIGNvbWJpbmVkIGludG8gYSBzaW5nbGUgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXF1ZXN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjb21wbGV0ZVJlcXVlc3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW52b2tlZFJlcXVlc3RzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2xvd0FnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdGludm9rZWRSZXF1ZXN0cy5wdXNoKHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRcdGlmIChpbnZva2VkUmVxdWVzdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0cmVxdWVzdFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRhd2FpdCBjb21wbGV0ZVJlcXVlc3QucDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudCgnc2xvd0FnZW50JywgeyAuLi5nZXRBZ2VudERhdGEoJ3Nsb3dBZ2VudCcpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oJ3Nsb3dBZ2VudCcsIHNsb3dBZ2VudCkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXG5cdFx0Ly8gU3RhcnQgYSByZXF1ZXN0IHRoYXQgd2lsbCB3YWl0XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdmaXJzdCByZXF1ZXN0JywgeyBhZ2VudElkOiAnc2xvd0FnZW50JyB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBhZ2VudCB0byBzdGFydCBwcm9jZXNzaW5nXG5cdFx0YXdhaXQgcmVxdWVzdFN0YXJ0ZWQucDtcblxuXHRcdC8vIFF1ZXVlIDMgc3RlZXJpbmcgbWVzc2FnZXMgd2hpbGUgdGhlIGZpcnN0IHJlcXVlc3QgaXMgaW4gcHJvZ3Jlc3Ncblx0XHRjb25zdCBzdGVlcmluZzEgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdzdGVlcmluZzEnLCB7IGFnZW50SWQ6ICdzbG93QWdlbnQnLCBxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcgfSk7XG5cdFx0Y29uc3Qgc3RlZXJpbmcyID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnc3RlZXJpbmcyJywgeyBhZ2VudElkOiAnc2xvd0FnZW50JywgcXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nIH0pO1xuXHRcdGNvbnN0IHN0ZWVyaW5nMyA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ3N0ZWVyaW5nMycsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyB9KTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQoc3RlZXJpbmcxKSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHN0ZWVyaW5nMikpO1xuXHRcdGFzc2VydC5vayhDaGF0U2VuZFJlc3VsdC5pc1F1ZXVlZChzdGVlcmluZzMpKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBmaXJzdCByZXF1ZXN0IC0gc2hvdWxkIHRyaWdnZXIgcHJvY2Vzc2luZyBvZiBjb21iaW5lZCBzdGVlcmluZyByZXF1ZXN0c1xuXHRcdGNvbXBsZXRlUmVxdWVzdC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBXYWl0IGZvciBhbGwgZGVmZXJyZWQgcHJvbWlzZXMgdG8gcmVzb2x2ZVxuXHRcdGF3YWl0IHN0ZWVyaW5nMS5kZWZlcnJlZDtcblx0XHRhd2FpdCBzdGVlcmluZzIuZGVmZXJyZWQ7XG5cdFx0YXdhaXQgc3RlZXJpbmczLmRlZmVycmVkO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgb25seSBpbnZva2VkIDIgcmVxdWVzdHM6IHRoZSBpbml0aWFsIGFuZCB0aGUgY29tYmluZWQgc3RlZXJpbmdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZFJlcXVlc3RzLmxlbmd0aCwgMiwgJ1Nob3VsZCBoYXZlIG9ubHkgMiBpbnZvY2F0aW9ucyAoaW5pdGlhbCArIGNvbWJpbmVkIHN0ZWVyaW5nKScpO1xuXHRcdC8vIFRoZSBjb21iaW5lZCBtZXNzYWdlIGluY2x1ZGVzIGFsbCBzdGVlcmluZyB0ZXh0cyBqb2luZWQgd2l0aCBcXG5cXG5cblx0XHRhc3NlcnQub2soaW52b2tlZFJlcXVlc3RzWzFdLmluY2x1ZGVzKCdzdGVlcmluZzEnKSwgJ0NvbWJpbmVkIG1lc3NhZ2Ugc2hvdWxkIGluY2x1ZGUgc3RlZXJpbmcxJyk7XG5cdFx0YXNzZXJ0Lm9rKGludm9rZWRSZXF1ZXN0c1sxXS5pbmNsdWRlcygnc3RlZXJpbmcyJyksICdDb21iaW5lZCBtZXNzYWdlIHNob3VsZCBpbmNsdWRlIHN0ZWVyaW5nMicpO1xuXHRcdGFzc2VydC5vayhpbnZva2VkUmVxdWVzdHNbMV0uaW5jbHVkZXMoJ3N0ZWVyaW5nMycpLCAnQ29tYmluZWQgbWVzc2FnZSBzaG91bGQgaW5jbHVkZSBzdGVlcmluZzMnKTtcblx0XHRhc3NlcnQub2soaW52b2tlZFJlcXVlc3RzWzFdLmluY2x1ZGVzKCdcXG5cXG4nKSwgJ0NvbWJpbmVkIG1lc3NhZ2Ugc2hvdWxkIHVzZSBcXFxcblxcXFxuIGFzIHNlcGFyYXRvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGVlcmluZyBtZXNzYWdlIG9uIGEgc3RyZWFtZWQgKGFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2spIHNlc3Npb24gZGlzcGF0Y2hlcyBpbW1lZGlhdGVseSwgbWlkLXR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVHJ1ZSBtaWQtdHVybiBzdGVlcmluZzogYSBzdGVlcmluZyBtZXNzYWdlIHNlbnQgd2hpbGUgYSBzdHJlYW1lZCB0dXJuIGlzIGluIHByb2dyZXNzIGlzXG5cdFx0Ly8gZGlzcGF0Y2hlZCB0byB0aGUgcGFydGljaXBhbnQgaW1tZWRpYXRlbHkgKHdoaWNoIFBPU1RzIHRoZSBzdGVlciBzZXJ2ZXItc2lkZSksIGluc3RlYWQgb2Zcblx0XHQvLyB3YWl0aW5nIGZvciB0aGUgdHVybiB0byBjb21wbGV0ZS5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdyZW1vdGUtc3RyZWFtZWQtc3RlZXInO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBzZXNzaW9uVHlwZSwgcGF0aDogJy9zdHJlYW1lZC1zZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IGlzQ29tcGxldGVPYnM6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUoJ2lzQ29tcGxldGUnLCBmYWxzZSk7XG5cblx0XHRjb25zdCBtb2NrU2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2NrU2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2Vzc2lvblR5cGUsIHtcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdFNlc3Npb24+ID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdC8vIEhpc3RvcnkgZW5kcyB3aXRoIGEgcmVxdWVzdCwgc28gdGhlIHNlc3Npb24gaGFzIGFuIGluLXByb2dyZXNzIChjYW5jZWxsYWJsZSkgdHVybi5cblx0XHRcdFx0aGlzdG9yeTogW3sgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdpbml0aWFsIHRhc2snLCBwYXJ0aWNpcGFudDogc2Vzc2lvblR5cGUgfV0sXG5cdFx0XHRcdHByb2dyZXNzT2JzOiBjb25zdE9ic2VydmFibGU8SUNoYXRQcm9ncmVzc1tdPihbXSksXG5cdFx0XHRcdGlzQ29tcGxldGVPYnMsXG5cdFx0XHRcdGludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGFzeW5jICgpID0+IGZhbHNlLFxuXHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja1Nlc3Npb25zU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnZva2VkTWVzc2FnZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgc3RlZXJpbmdJbnZva2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCkge1xuXHRcdFx0XHRpbnZva2VkTWVzc2FnZXMucHVzaChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRzdGVlcmluZ0ludm9rZWQuY29tcGxldGUoKTtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50KHNlc3Npb25UeXBlLCB7IC4uLmdldEFnZW50RGF0YShzZXNzaW9uVHlwZSksIGlzRGVmYXVsdDogdHJ1ZSB9KSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihzZXNzaW9uVHlwZSwgYWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5vayhyZWYpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdGNvbnN0IHN0ZWVyaW5nID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCAnc3RlZXJpbmcgbWVzc2FnZScsIHsgYWdlbnRJZDogc2Vzc2lvblR5cGUsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyB9KTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQoc3RlZXJpbmcpKTtcblxuXHRcdC8vIERpc3BhdGNoZWQgaW1tZWRpYXRlbHksIHdpdGhvdXQgdGhlIHN0cmVhbWVkIHR1cm4gY29tcGxldGluZyAoaXNDb21wbGV0ZU9icyBzdGF5cyBmYWxzZSkuXG5cdFx0YXdhaXQgc3RlZXJpbmdJbnZva2VkLnA7XG5cdFx0YXdhaXQgc3RlZXJpbmcuZGVmZXJyZWQ7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IHRoZSBwb3N0LWRpc3BhdGNoIHRyYWNraW5nIHJlc3RvcmUgcnVuXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZE1lc3NhZ2VzLmZpbHRlcihtID0+IG0uaW5jbHVkZXMoJ3N0ZWVyaW5nIG1lc3NhZ2UnKSkubGVuZ3RoLCAxLCAnc3RlZXJpbmcgbWVzc2FnZSBzaG91bGQgYmUgZGlzcGF0Y2hlZCBleGFjdGx5IG9uY2UsIGltbWVkaWF0ZWx5Jyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDAsICdzdGVlcmluZyBtZXNzYWdlIHNob3VsZCBiZSBkaXNwYXRjaGVkLCBub3QgbGVmdCBxdWV1ZWQnKTtcblxuXHRcdC8vIEluLXByb2dyZXNzIHRyYWNraW5nIGlzIHByZXNlcnZlZCBmb3IgdGhlIHN0aWxsLWFjdGl2ZSBzdHJlYW06IGEgcGxhaW4gc2VuZCBpcyByZWplY3RlZC5cblx0XHRjb25zdCBwbGFpbiA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgJ3BsYWluIG1lc3NhZ2UnLCB7IGFnZW50SWQ6IHNlc3Npb25UeXBlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGFpbi5raW5kLCAncmVqZWN0ZWQnKTtcblxuXHRcdC8vIENvbXBsZXRpbmcgdGhlIHN0cmVhbWVkIHR1cm4gbXVzdCBub3QgcmUtZGlzcGF0Y2ggdGhlIGFscmVhZHktc2VudCBzdGVlcmluZyBtZXNzYWdlLlxuXHRcdGlzQ29tcGxldGVPYnMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZE1lc3NhZ2VzLmZpbHRlcihtID0+IG0uaW5jbHVkZXMoJ3N0ZWVyaW5nIG1lc3NhZ2UnKSkubGVuZ3RoLCAxLCAnc3RlZXJpbmcgbWVzc2FnZSBtdXN0IG5vdCBiZSBkaXNwYXRjaGVkIGFnYWluIG9uIGNvbXBsZXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncXVldWVkIChub24tc3RlZXJpbmcpIG1lc3NhZ2UgaXMgZmx1c2hlZCB3aGVuIGEgc3RyZWFtZWQgKGFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2spIHR1cm4gY29tcGxldGVzIChmaXggZm9yIGNsb3VkLXNlc3Npb24gcXVldWUgbGltYm8pJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgbm9uLXN0ZWVyaW5nIHF1ZXVlZCBtZXNzYWdlIGlzIG5vdCBkaXNwYXRjaGVkIG1pZC10dXJuOyBpdCBtdXN0IGJlIGZsdXNoZWQgd2hlbiB0aGVcblx0XHQvLyBzdHJlYW1lZCB0dXJuIGNvbXBsZXRlcyAocHJldmlvdXNseSBpdCB3YXMgc3RyYW5kZWQgaW4gdGhlIHBlbmRpbmcgcXVldWUgZm9yZXZlcikuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAncmVtb3RlLXN0cmVhbWVkLXF1ZXVlJztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc3RyZWFtZWQtc2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBpc0NvbXBsZXRlT2JzOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKCdpc0NvbXBsZXRlJywgZmFsc2UpO1xuXG5cdFx0Y29uc3QgbW9ja1Nlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9ja1Nlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHNlc3Npb25UeXBlLCB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiAocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUNoYXRTZXNzaW9uPiA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRoaXN0b3J5OiBbeyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ2luaXRpYWwgdGFzaycsIHBhcnRpY2lwYW50OiBzZXNzaW9uVHlwZSB9XSxcblx0XHRcdFx0cHJvZ3Jlc3NPYnM6IGNvbnN0T2JzZXJ2YWJsZTxJQ2hhdFByb2dyZXNzW10+KFtdKSxcblx0XHRcdFx0aXNDb21wbGV0ZU9icyxcblx0XHRcdFx0aW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjazogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGludm9rZWRNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbnZva2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCkge1xuXHRcdFx0XHRpbnZva2VkTWVzc2FnZXMucHVzaChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRpbnZva2VkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChzZXNzaW9uVHlwZSwgeyAuLi5nZXRBZ2VudERhdGEoc2Vzc2lvblR5cGUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oc2Vzc2lvblR5cGUsIGFnZW50KSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQub2socmVmKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cblx0XHRjb25zdCBxdWV1ZWQgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQgbWVzc2FnZScsIHsgYWdlbnRJZDogc2Vzc2lvblR5cGUsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHF1ZXVlZCkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDEsICdxdWV1ZWQgbWVzc2FnZSBzaG91bGQgd2FpdCB3aGlsZSB0aGUgc3RyZWFtZWQgdHVybiBpcyBpbiBwcm9ncmVzcycpO1xuXG5cdFx0aXNDb21wbGV0ZU9icy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCBpbnZva2VkLnA7XG5cblx0XHRhc3NlcnQub2soaW52b2tlZE1lc3NhZ2VzLnNvbWUobSA9PiBtLmluY2x1ZGVzKCdxdWV1ZWQgbWVzc2FnZScpKSwgJ3F1ZXVlZCBtZXNzYWdlIHNob3VsZCBiZSBzZW50IG9uY2UgdGhlIHN0cmVhbWVkIHR1cm4gY29tcGxldGVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCwgMCwgJ25vIHBlbmRpbmcgcmVxdWVzdHMgc2hvdWxkIHJlbWFpbiBhZnRlciB0aGUgZmx1c2gnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsZWQgQ2xhdWRlIGhvb2tzIGhpbnQgaXMgc2hvd24gb25jZSBwZXIgd29ya3NwYWNlIChmaXggZm9yICMyOTUwNzkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldCB1cCBhIHByb21wdHMgc2VydmljZSB0aGF0IHJlcG9ydHMgZGlzYWJsZWQgQ2xhdWRlIGhvb2tzXG5cdFx0Y29uc3QgbW9ja1Byb21wdHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgTW9ja1Byb21wdHNTZXJ2aWNlIHtcblx0XHRcdG92ZXJyaWRlIGdldEhvb2tzKF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDb25maWd1cmVkSG9va3NJbmZvPiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBob29rczoge30sIGhhc0Rpc2FibGVkQ2xhdWRlSG9va3M6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBtb2NrUHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXNhYmxlZEhpbnRzS2V5ID0gJ2NoYXQuZGlzYWJsZWRDbGF1ZGVIb29rcy5ub3RpZmljYXRpb24nO1xuXG5cdFx0Ly8gQmVmb3JlIGFueSByZXF1ZXN0LCB0aGUgc3RvcmFnZSBrZXkgc2hvdWxkIG5vdCBiZSBzZXRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihkaXNhYmxlZEhpbnRzS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdC8vIERpc2FibGVkIGhvb2tzIGFyZSByZXBvcnRlZCBmb3IgZXZlcnkgcmVxdWVzdCwgYnV0IHRoZSBoaW50IHNob3VsZCBvbmx5IGJlIHNob3duIG9uY2UgcGVyIHdvcmtzcGFjZS5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ3Rlc3QgcmVxdWVzdCcpO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBUaGUgaGludCBzaG91bGQgaGF2ZSBiZWVuIHNob3duLCBhbmQgdGhlIGtleSBzZXQgdG8gdHJ1ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRpc2FibGVkSGludHNLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpLCB0cnVlLCAnRmxhZyBzaG91bGQgYmUgc2V0IGFmdGVyIHNob3dpbmcgdGhlIGhpbnQnKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgcmVzcG9uc2UgY29udGFpbnMgdGhlIGRpc2FibGVkQ2xhdWRlSG9va3MgcGFydFxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzID0gcmVxdWVzdHNbMF0ucmVzcG9uc2U/LnJlc3BvbnNlLnZhbHVlID8/IFtdO1xuXHRcdGNvbnN0IGhhc0hvb2tIaW50ID0gcmVzcG9uc2VQYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAnZGlzYWJsZWRDbGF1ZGVIb29rcycpO1xuXHRcdGFzc2VydC5vayhoYXNIb29rSGludCwgJ1Jlc3BvbnNlIHNob3VsZCBjb250YWluIHRoZSBkaXNhYmxlZENsYXVkZUhvb2tzIGhpbnQnKTtcblxuXHRcdC8vIFNlbmRpbmcgYW5vdGhlciByZXF1ZXN0IHNob3VsZCBOT1Qgc2hvdyB0aGUgaGludCBhZ2FpbiAoc2hvd24gb25seSBvbmNlIHBlciB3b3Jrc3BhY2UpXG5cdFx0Y29uc3QgcmVzcG9uc2UyID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnc2Vjb25kIHJlcXVlc3QnKTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlMik7XG5cdFx0YXdhaXQgcmVzcG9uc2UyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRjb25zdCByZXF1ZXN0czIgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0czIubGVuZ3RoLCAyKTtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzMiA9IHJlcXVlc3RzMlsxXS5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUgPz8gW107XG5cdFx0Y29uc3QgaGFzSG9va0hpbnQyID0gcmVzcG9uc2VQYXJ0czIuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ2Rpc2FibGVkQ2xhdWRlSG9va3MnKTtcblx0XHRhc3NlcnQub2soIWhhc0hvb2tIaW50MiwgJ1Jlc3BvbnNlIHNob3VsZCBOT1QgY29udGFpbiB0aGUgZGlzYWJsZWRDbGF1ZGVIb29rcyBoaW50IG9uIHNlY29uZCByZXF1ZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2FibGVkIENsYXVkZSBob29rcyBoaW50IGlzIG5vdCBjb25zdW1lZCB3aGVuIG5vIGRpc2FibGVkIGhvb2tzIChmaXggZm9yICMyOTUwNzkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNldCB1cCBhIHByb21wdHMgc2VydmljZSB0aGF0IHNpbXVsYXRlcyB0aGUgc2V0dXAgYWdlbnQgZmlyc3QgcGFzcyAobm8gZGlzYWJsZWQgaG9va3MpXG5cdFx0Ly8gZm9sbG93ZWQgYnkgdGhlIHJlYWwgcmVzZW50IHJlcXVlc3QgKHdpdGggZGlzYWJsZWQgaG9va3MpLlxuXHRcdGNvbnN0IG1vY2tQcm9tcHRzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIE1vY2tQcm9tcHRzU2VydmljZSB7XG5cdFx0XHRwcml2YXRlIF9jYWxsQ291bnQgPSAwO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0SG9va3MoX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNvbmZpZ3VyZWRIb29rc0luZm8+IHtcblx0XHRcdFx0dGhpcy5fY2FsbENvdW50Kys7XG5cdFx0XHRcdC8vIEZpcnN0IGNhbGwgKHNldHVwIGFnZW50KTogbm8gZGlzYWJsZWQgaG9va3Ncblx0XHRcdFx0Ly8gU2Vjb25kIGNhbGwgKHJlYWwgcmVxdWVzdCBhZnRlciByZXNlbmQpOiBkaXNhYmxlZCBob29rcyBwcmVzZW50XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBob29rczoge30sIGhhc0Rpc2FibGVkQ2xhdWRlSG9va3M6IHRoaXMuX2NhbGxDb3VudCA+IDEgfSk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBtb2NrUHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXNhYmxlZEhpbnRzS2V5ID0gJ2NoYXQuZGlzYWJsZWRDbGF1ZGVIb29rcy5ub3RpZmljYXRpb24nO1xuXG5cdFx0Ly8gRmlyc3QgcmVxdWVzdDogbm8gZGlzYWJsZWQgaG9va3MgKHNpbXVsYXRlcyBzZXR1cCBhZ2VudCBwYXNzKVxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnZmlyc3QgcmVxdWVzdCcpO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBGbGFnIHNob3VsZCBOT1QgYmUgc2V0IGJlY2F1c2Ugbm8gaGludCB3YXMgc2hvd25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihkaXNhYmxlZEhpbnRzS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSwgdW5kZWZpbmVkLCAnRmxhZyBzaG91bGQgbm90IGJlIHNldCB3aGVuIG5vIGRpc2FibGVkIGhvb2tzJyk7XG5cblx0XHRjb25zdCBmaXJzdFJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpWzBdO1xuXHRcdGFzc2VydC5vayhmaXJzdFJlcXVlc3QsICdFeHBlY3RlZCB0aGUgaW5pdGlhbCByZXF1ZXN0IHRvIGV4aXN0IGJlZm9yZSByZXNlbmQnKTtcblxuXHRcdC8vIFJlc2VuZCB0aGUgb3JpZ2luYWwgcmVxdWVzdDogbm93IGRpc2FibGVkIGhvb2tzIGFyZSBwcmVzZW50IChzaW11bGF0ZXMgcmVzZW5kIGFmdGVyIHNldHVwKVxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJlc2VuZFJlcXVlc3QoZmlyc3RSZXF1ZXN0KTtcblxuXHRcdC8vIE5vdyB0aGUgZmxhZyBzaG91bGQgYmUgc2V0IGFuZCB0aGUgaGludCBzaG93blxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRpc2FibGVkSGludHNLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpLCB0cnVlLCAnRmxhZyBzaG91bGQgYmUgc2V0IGFmdGVyIHNob3dpbmcgdGhlIGhpbnQnKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHMubGVuZ3RoLCAxLCAnUmVzZW5kIHNob3VsZCByZXBsYWNlIHRoZSBvcmlnaW5hbCByZXF1ZXN0Jyk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQYXJ0czIgPSByZXF1ZXN0c1swXS5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUgPz8gW107XG5cdFx0Y29uc3QgaGFzSG9va0hpbnQyID0gcmVzcG9uc2VQYXJ0czIuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ2Rpc2FibGVkQ2xhdWRlSG9va3MnKTtcblx0XHRhc3NlcnQub2soaGFzSG9va0hpbnQyLCAnUmVzcG9uc2Ugc2hvdWxkIGNvbnRhaW4gdGhlIGRpc2FibGVkQ2xhdWRlSG9va3MgaGludCBvbiBzZWNvbmQgcmVxdWVzdCcpO1xuXHR9KTtcblx0dGVzdCgnY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uIHdhaXRzIGZvciByZXNwb25zZSBjb21wbGV0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcXVlc3RTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGNvbXBsZXRlUmVxdWVzdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRcdGNvbnN0IHNsb3dBZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzLCBoaXN0b3J5LCB0b2tlbikge1xuXHRcdFx0XHRyZXF1ZXN0U3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0Ly8gU2ltdWxhdGUgc29tZSBjbGVhbnVwIGRlbGF5IGJlZm9yZSBjb21wbGV0aW5nXG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBjb21wbGV0ZVJlcXVlc3QuY29tcGxldGUoKSwgMTApO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgY29tcGxldGVSZXF1ZXN0LnA7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50KCdzbG93QWdlbnQnLCB7IC4uLmdldEFnZW50RGF0YSgnc2xvd0FnZW50JyksIGlzRGVmYXVsdDogdHJ1ZSB9KSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbignc2xvd0FnZW50Jywgc2xvd0FnZW50KSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ3Rlc3QgcmVxdWVzdCcsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cblx0XHRhd2FpdCByZXF1ZXN0U3RhcnRlZC5wO1xuXG5cdFx0Ly8gQ2FuY2VsIGFuZCBhd2FpdCAtIHNob3VsZCB3YWl0IGZvciB0aGUgcmVzcG9uc2UgdG8gY29tcGxldGVcblx0XHRhd2FpdCB0ZXN0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlLCAndGVzdCcpO1xuXG5cdFx0Ly8gQWZ0ZXIgY2FuY2VsIHJlc29sdmVzLCB0aGUgcmVzcG9uc2UgbW9kZWwgc2hvdWxkIGhhdmUgYSByZXN1bHRcblx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKClbMF07XG5cdFx0YXNzZXJ0Lm9rKGxhc3RSZXF1ZXN0LnJlc3BvbnNlLCAnUmVzcG9uc2Ugc2hvdWxkIGV4aXN0IGFmdGVyIGNhbmNlbGxhdGlvbiBjb21wbGV0ZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFJlcXVlc3QucmVzcG9uc2Uuc3RhdGUsIFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQsICdSZXNwb25zZSBzaG91bGQgYmUgaW4gQ2FuY2VsbGVkIHN0YXRlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbiByZXR1cm5zIGFmdGVyIHRpbWVvdXQgaWYgcmVzcG9uc2UgZG9lcyBub3QgY29tcGxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY29tcGxldGVSZXF1ZXN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgaGFuZ2luZ0FnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdHJlcXVlc3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdC8vIFdhaXQgZm9yIGV4dGVybmFsIHNpZ25hbCwgaWdub3JpbmcgY2FuY2VsbGF0aW9uIHRvIHNpbXVsYXRlIGEgaHVuZyBhZ2VudFxuXHRcdFx0XHRhd2FpdCBjb21wbGV0ZVJlcXVlc3QucDtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ2hhbmdpbmdBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdoYW5naW5nQWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdoYW5naW5nQWdlbnQnLCBoYW5naW5nQWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAndGVzdCByZXF1ZXN0JywgeyBhZ2VudElkOiAnaGFuZ2luZ0FnZW50JyB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblxuXHRcdGF3YWl0IHJlcXVlc3RTdGFydGVkLnA7XG5cblx0XHQvLyBDYW5jZWwgc2hvdWxkIHJldHVybiBhZnRlciB0aW1lb3V0IGV2ZW4gdGhvdWdoIHRoZSBhZ2VudCBoYXMgbm90IGNvbXBsZXRlZC5cblx0XHQvLyBVc2UgZmFrZWQgdGltZXJzIHNvIHJhY2VUaW1lb3V0J3MgMXMgc2V0VGltZW91dCBmaXJlcyBpbnN0YW50bHkuXG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gTGV0IHRoZSBhZ2VudCBmaW5pc2ggc28gdGhlIHRlc3QgY2xlYW5zIHVwIHByb3Blcmx5XG5cdFx0Y29tcGxldGVSZXF1ZXN0LmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyByZXF1ZXN0cyBjYW4gYmUgcmVtb3ZlZCBmcm9tIG9uZSBzZXNzaW9uIGFuZCByZS1zZW50IG9uIGFub3RoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVxdWVzdFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY29tcGxldGVSZXF1ZXN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGludm9rZWRNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IHNsb3dBZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzLCBoaXN0b3J5LCB0b2tlbikge1xuXHRcdFx0XHRpbnZva2VkTWVzc2FnZXMucHVzaChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAoaW52b2tlZE1lc3NhZ2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHJlcXVlc3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgY29tcGxldGVSZXF1ZXN0LnA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Nsb3dBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdzbG93QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdzbG93QWdlbnQnLCBzbG93QWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBzb3VyY2VSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgc291cmNlID0gc291cmNlUmVmLm9iamVjdDtcblxuXHRcdC8vIFN0YXJ0IGEgYmxvY2tpbmcgcmVxdWVzdCBvbiBzb3VyY2Vcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNvdXJjZS5zZXNzaW9uUmVzb3VyY2UsICdmaXJzdCByZXF1ZXN0JywgeyBhZ2VudElkOiAnc2xvd0FnZW50JyB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblx0XHRhd2FpdCByZXF1ZXN0U3RhcnRlZC5wO1xuXG5cdFx0Ly8gUXVldWUgYSByZXF1ZXN0IHdoaWxlIHRoZSBmaXJzdCBpcyBpbiBwcm9ncmVzc1xuXHRcdGNvbnN0IHF1ZXVlZCA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNvdXJjZS5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQgcmVxdWVzdCcsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHF1ZXVlZCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBxdWV1ZWQgcmVxdWVzdCBmcm9tIHNvdXJjZVxuXHRcdGNvbnN0IHBlbmRpbmdJZCA9IHNvdXJjZS5nZXRQZW5kaW5nUmVxdWVzdHMoKVswXS5yZXF1ZXN0LmlkO1xuXHRcdHRlc3RTZXJ2aWNlLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KHNvdXJjZS5zZXNzaW9uUmVzb3VyY2UsIHBlbmRpbmdJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gUmUtc2VuZCBpdCBvbiBhIG5ldyB0YXJnZXQgc2Vzc2lvbiB0aHJvdWdoIHRoZSBub3JtYWwgcXVldWUgcGF0aFxuXHRcdGNvbnN0IHRhcmdldFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0YXJnZXRSZWYub2JqZWN0O1xuXHRcdGNvbnN0IHJlc2VudCA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRhcmdldC5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQgcmVxdWVzdCcsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHBhdXNlUXVldWU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHJlc2VudCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIENvbXBsZXRlIHRoZSBmaXJzdCByZXF1ZXN0IHNvIHRoZSBzb3VyY2UgbG9vcCBmaW5pc2hlc1xuXHRcdGNvbXBsZXRlUmVxdWVzdC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBQcm9jZXNzIHRoZSB0YXJnZXQgcXVldWUgXHUyMDE0IHRoZSByZS1zZW50IHJlcXVlc3Qgc2hvdWxkIGJlIGludm9rZWRcblx0XHR0ZXN0U2VydmljZS5wcm9jZXNzUGVuZGluZ1JlcXVlc3RzKHRhcmdldC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc2VudC5kZWZlcnJlZDtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHJlc3VsdCkpO1xuXHRcdGF3YWl0IHJlc3VsdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXG5cdFx0Ly8gVGhlIGFnZW50IHNob3VsZCBoYXZlIGJlZW4gaW52b2tlZCB0d2ljZTogZmlyc3QgcmVxdWVzdCArIHJlLXNlbnQgcXVldWVkIHJlcXVlc3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZE1lc3NhZ2VzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKGludm9rZWRNZXNzYWdlc1sxXS5pbmNsdWRlcygncXVldWVkIHJlcXVlc3QnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlIGFkZHMsIHJlb3JkZXJzIGFuZCByZW1vdmVzIHBlbmRpbmcgcmVxdWVzdHMgcHJlc2VydmluZyBpZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXG5cdFx0dGVzdFNlcnZpY2Uuc3luY1BlbmRpbmdSZXF1ZXN0c0Zyb21SZW1vdGUobW9kZWwuc2Vzc2lvblJlc291cmNlLCBbXG5cdFx0XHR7IGlkOiAncmVtb3RlLTEnLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIG1lc3NhZ2U6ICdmaXJzdCByZW1vdGUgbWVzc2FnZScgfSxcblx0XHRcdHsgaWQ6ICdyZW1vdGUtMicsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwgbWVzc2FnZTogJ3NlY29uZCByZW1vdGUgbWVzc2FnZScgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubWFwKHAgPT4gKHsgaWQ6IHAucmVxdWVzdC5pZCwga2luZDogcC5raW5kLCB0ZXh0OiBwLnJlcXVlc3QubWVzc2FnZS50ZXh0IH0pKSxcblx0XHRcdFtcblx0XHRcdFx0eyBpZDogJ3JlbW90ZS0xJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB0ZXh0OiAnZmlyc3QgcmVtb3RlIG1lc3NhZ2UnIH0sXG5cdFx0XHRcdHsgaWQ6ICdyZW1vdGUtMicsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwgdGV4dDogJ3NlY29uZCByZW1vdGUgbWVzc2FnZScgfSxcblx0XHRcdF0sXG5cdFx0KTtcblxuXHRcdGNvbnN0IGZpcnN0UmVxdWVzdCA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpWzBdLnJlcXVlc3Q7XG5cblx0XHQvLyBSZW9yZGVyLCBkcm9wIG9uZSwgYWRkIGEgc3RlZXJpbmcgbWVzc2FnZSBhbmQgdXBkYXRlIHRleHQgb2YgdGhlIHN1cnZpdm9yLlxuXHRcdHRlc3RTZXJ2aWNlLnN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgW1xuXHRcdFx0eyBpZDogJ3JlbW90ZS1zdGVlcicsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCBtZXNzYWdlOiAnc3RlZXIgbm93JyB9LFxuXHRcdFx0eyBpZDogJ3JlbW90ZS0xJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCBtZXNzYWdlOiAnZmlyc3QgcmVtb3RlIG1lc3NhZ2UnIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLm1hcChwID0+ICh7IGlkOiBwLnJlcXVlc3QuaWQsIGtpbmQ6IHAua2luZCwgdGV4dDogcC5yZXF1ZXN0Lm1lc3NhZ2UudGV4dCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgaWQ6ICdyZW1vdGUtc3RlZXInLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZywgdGV4dDogJ3N0ZWVyIG5vdycgfSxcblx0XHRcdFx0eyBpZDogJ3JlbW90ZS0xJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB0ZXh0OiAnZmlyc3QgcmVtb3RlIG1lc3NhZ2UnIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpWzFdLnJlcXVlc3QsIGZpcnN0UmVxdWVzdCwgJ3VuY2hhbmdlZCBtZXNzYWdlcyBzaG91bGQgbm90IGJlIHJlYnVpbHQnKTtcblxuXHRcdHRlc3RTZXJ2aWNlLnN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jUGVuZGluZ1JlcXVlc3RzRnJvbVJlbW90ZSBhdG9taWNhbGx5IGVtaXRzIHRoZSBmaW5hbCBzdGF0ZSBhbmQgbm8tb3BzIHdoZW4gaXQgYWxyZWFkeSBtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdHRlc3RTZXJ2aWNlLnN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgW1xuXHRcdFx0eyBpZDogJ3JlbW90ZS0xJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCBtZXNzYWdlOiAnb2xkIHJlbW90ZSBtZXNzYWdlJyB9LFxuXHRcdFx0eyBpZDogJ3JlbW90ZS0yJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCBtZXNzYWdlOiAncmVtb3ZlZCByZW1vdGUgbWVzc2FnZScgfSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHNuYXBzaG90czogeyBpZDogc3RyaW5nOyBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZDsgdGV4dDogc3RyaW5nIH1bXVtdID0gW107XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cygoKSA9PiB7XG5cdFx0XHRzbmFwc2hvdHMucHVzaChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5tYXAocCA9PiAoeyBpZDogcC5yZXF1ZXN0LmlkLCBraW5kOiBwLmtpbmQsIHRleHQ6IHAucmVxdWVzdC5tZXNzYWdlLnRleHQgfSkpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZW1vdGUgPSBbXG5cdFx0XHR7IGlkOiAncmVtb3RlLXN0ZWVyJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsIG1lc3NhZ2U6ICdzdGVlciBub3cnIH0sXG5cdFx0XHR7IGlkOiAncmVtb3RlLTEnLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIG1lc3NhZ2U6ICd1cGRhdGVkIHJlbW90ZSBtZXNzYWdlJyB9LFxuXHRcdF07XG5cdFx0dGVzdFNlcnZpY2Uuc3luY1BlbmRpbmdSZXF1ZXN0c0Zyb21SZW1vdGUobW9kZWwuc2Vzc2lvblJlc291cmNlLCByZW1vdGUpO1xuXHRcdHRlc3RTZXJ2aWNlLnN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgcmVtb3RlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3RzLCBbW1xuXHRcdFx0eyBpZDogJ3JlbW90ZS1zdGVlcicsIGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLCB0ZXh0OiAnc3RlZXIgbm93JyB9LFxuXHRcdFx0eyBpZDogJ3JlbW90ZS0xJywga2luZDogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkLCB0ZXh0OiAndXBkYXRlZCByZW1vdGUgbWVzc2FnZScgfSxcblx0XHRdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5IGNhbmNlbHMgY3VycmVudCBhbmQgc2VuZHMgdGhlIHF1ZXVlZCBtZXNzYWdlIG9uIGxvY2FsIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzZWNvbmRJbnZva2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGludm9rZWRNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IHNsb3dBZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzLCBoaXN0b3J5LCB0b2tlbikge1xuXHRcdFx0XHRpbnZva2VkTWVzc2FnZXMucHVzaChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAoaW52b2tlZE1lc3NhZ2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGZpcnN0U3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7IGxpc3RlbmVyLmRpc3Bvc2UoKTsgcmVzb2x2ZSgpOyB9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWNvbmRJbnZva2VkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Nsb3dBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdzbG93QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdzbG93QWdlbnQnLCBzbG93QWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRlc3REaXNwb3NhYmxlcy5hZGQoc3RhcnRTZXNzaW9uTW9kZWwodGVzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnZmlyc3QgcmVxdWVzdCcsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgZmlyc3RTdGFydGVkLnA7XG5cblx0XHRjb25zdCBxdWV1ZWQgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQgbWVzc2FnZScsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHF1ZXVlZCkpO1xuXG5cdFx0Y29uc3QgcGVuZGluZ0lkID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKClbMF0ucmVxdWVzdC5pZDtcblx0XHRhd2FpdCB0ZXN0U2VydmljZS5zZW5kUGVuZGluZ1JlcXVlc3RJbW1lZGlhdGVseShtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHBlbmRpbmdJZCk7XG5cdFx0YXdhaXQgc2Vjb25kSW52b2tlZC5wO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9rZWRNZXNzYWdlcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhpbnZva2VkTWVzc2FnZXNbMV0uaW5jbHVkZXMoJ3F1ZXVlZCBtZXNzYWdlJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUGVuZGluZ1JlcXVlc3RJbW1lZGlhdGVseSByZS1zZW5kcyBhIHN0ZWVyaW5nIG1lc3NhZ2UgYXMgYSB0dXJuIG9uIGFnZW50IGhvc3Qgc2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Jztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi1zZW5kLWltbWVkaWF0ZWx5JyB9KTtcblxuXHRcdGNvbnN0IG1vY2tTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnMoW3tcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogJ0FnZW50IEhvc3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdBZ2VudCBIb3N0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgSG9zdCcsXG5cdFx0fV0pO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9ja1Nlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHNlc3Npb25UeXBlLCB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiByZXNvdXJjZSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdFx0b25XaWxsRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fSksXG5cdFx0fSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZmlyc3RTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHNlY29uZEludm9rZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgaW52b2tlZE1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2xvd0FnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdGludm9rZWRNZXNzYWdlcy5wdXNoKHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRcdGlmIChpbnZva2VkTWVzc2FnZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Zmlyc3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHsgbGlzdGVuZXIuZGlzcG9zZSgpOyByZXNvbHZlKCk7IH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlY29uZEludm9rZWQuY29tcGxldGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChzZXNzaW9uVHlwZSwgeyAuLi5nZXRBZ2VudERhdGEoc2Vzc2lvblR5cGUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oc2Vzc2lvblR5cGUsIHNsb3dBZ2VudCkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICdmaXJzdCByZXF1ZXN0JywgeyBhZ2VudElkOiBzZXNzaW9uVHlwZSB9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblx0XHRhd2FpdCBmaXJzdFN0YXJ0ZWQucDtcblxuXHRcdC8vIFN0ZWVyaW5nIHN0YXlzIHBlbmRpbmcgaGVyZSBzaW5jZSBhZ2VudCBob3N0IHF1ZXVlcyBhcmUgc2VydmVyLW1hbmFnZWQuXG5cdFx0Y29uc3Qgc3RlZXJpbmcgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICdzdGVlcmluZyBtZXNzYWdlJywgeyBhZ2VudElkOiBzZXNzaW9uVHlwZSwgcXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nIH0pO1xuXHRcdGFzc2VydC5vayhDaGF0U2VuZFJlc3VsdC5pc1F1ZXVlZChzdGVlcmluZykpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0ZXN0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHBlbmRpbmdJZCA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpWzBdLnJlcXVlc3QuaWQ7XG5cblx0XHQvLyBNdXN0IGNhbmNlbCB0aGUgY3VycmVudCB0dXJuIEFORCBzZW5kIHRoZSBzdGVlcmluZyBtZXNzYWdlICh3YXMgZHJvcHBlZCBiZWZvcmUpLlxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5KHNlc3Npb25SZXNvdXJjZSwgcGVuZGluZ0lkKTtcblx0XHRhd2FpdCBzZWNvbmRJbnZva2VkLnA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2tlZE1lc3NhZ2VzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKGludm9rZWRNZXNzYWdlc1sxXS5pbmNsdWRlcygnc3RlZXJpbmcgbWVzc2FnZScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmFjZSBjb25kaXRpb246IHByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QgZGVxdWV1ZXMgYmVmb3JlIGNvbW1pdCBoYW5kbGVyIHJ1bnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhpcyByZXByb2R1Y2VzIHRoZSByYWNlIHdoZXJlOlxuXHRcdC8vIDEuIFJlcXVlc3QgMSBjb21wbGV0ZXMgXHUyMTkyIC5maW5hbGx5KCkgY2FsbHMgcHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdCBpbW1lZGlhdGVseVxuXHRcdC8vIDIuIHByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QgZGVxdWV1ZXMgcXVldWVkLXJlcXVlc3QtMSBhbmQgc3RhcnRzIGl0IG9uIHRoZSBPTEQgc2Vzc2lvblxuXHRcdC8vIDMuIENvbW1pdCBldmVudCBhcnJpdmVzIGxhdGVyIFx1MjE5MiBvbmx5IHNlZXMgcmVtYWluaW5nIHF1ZXVlZCByZXF1ZXN0cyAob25lIHdhcyBhbHJlYWR5IGRlcXVldWVkKVxuXHRcdC8vIFRoZSBmaXg6IGRldGVjdCB0aGUgaW4tZmxpZ2h0IHJlcXVlc3Qgb24gdGhlIG9sZCBzZXNzaW9uLCBjYW5jZWwgaXQsIGFuZCByZS1zZW5kIG9uIHRoZSBuZXcgc2Vzc2lvbi5cblxuXHRcdGNvbnN0IGludm9jYXRpb25PcmRlcjogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBmaXJzdFJlcXVlc3RTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGZpcnN0UmVxdWVzdEdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBzbG93QWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pIHtcblx0XHRcdFx0aW52b2NhdGlvbk9yZGVyLnB1c2gocmVxdWVzdC5tZXNzYWdlKTtcblxuXHRcdFx0XHRpZiAoaW52b2NhdGlvbk9yZGVyLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdC8vIEZpcnN0IHJlcXVlc3QgXHUyMDE0IGJsb2NrIHVudGlsIHdlIHNheSBnb1xuXHRcdFx0XHRcdGZpcnN0UmVxdWVzdFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRhd2FpdCBmaXJzdFJlcXVlc3RHYXRlLnA7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQWxsIHN1YnNlcXVlbnQgcmVxdWVzdHMgY29tcGxldGUgaW1tZWRpYXRlbHlcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Nsb3dBZ2VudCcsIHsgLi4uZ2V0QWdlbnREYXRhKCdzbG93QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCdzbG93QWdlbnQnLCBzbG93QWdlbnQpKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBzb3VyY2VSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgc291cmNlID0gc291cmNlUmVmLm9iamVjdDtcblxuXHRcdC8vIFN0ZXAgMTogU2VuZCByZXF1ZXN0IDEgKGJsb2NrcyBvbiBmaXJzdFJlcXVlc3RHYXRlKVxuXHRcdGNvbnN0IHJlc3BvbnNlMSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNvdXJjZS5zZXNzaW9uUmVzb3VyY2UsICdyZXF1ZXN0LTEnLCB7IGFnZW50SWQ6ICdzbG93QWdlbnQnIH0pO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UxKTtcblx0XHRhd2FpdCBmaXJzdFJlcXVlc3RTdGFydGVkLnA7XG5cblx0XHQvLyBTdGVwIDI6IFF1ZXVlIDMgbW9yZSByZXF1ZXN0cyB3aGlsZSByZXF1ZXN0IDEgaXMgaW4gcHJvZ3Jlc3Ncblx0XHRjb25zdCBxMSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNvdXJjZS5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQtMScsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQgfSk7XG5cdFx0Y29uc3QgcTIgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzb3VyY2Uuc2Vzc2lvblJlc291cmNlLCAncXVldWVkLTInLCB7IGFnZW50SWQ6ICdzbG93QWdlbnQnLCBxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkIH0pO1xuXHRcdGNvbnN0IHEzID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc291cmNlLnNlc3Npb25SZXNvdXJjZSwgJ3F1ZXVlZC0zJywgeyBhZ2VudElkOiAnc2xvd0FnZW50JywgcXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCB9KTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQocTEpKTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQocTIpKTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQocTMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgMSwgJ09ubHkgcmVxdWVzdC0xIHNob3VsZCBiZSBhIHJlYWwgcmVxdWVzdCcpO1xuXG5cdFx0Ly8gU3RlcCAzOiBDb21wbGV0ZSByZXF1ZXN0IDEgXHUyMTkyIC5maW5hbGx5KCkgcnVucyBwcm9jZXNzTmV4dFBlbmRpbmdSZXF1ZXN0XG5cdFx0Ly8gVGhpcyBkZXF1ZXVlcyBcInF1ZXVlZC0xXCIgYW5kIHN0YXJ0cyBpdCBvbiB0aGUgc291cmNlIChvbGQpIHNlc3Npb25cblx0XHRmaXJzdFJlcXVlc3RHYXRlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgcmVzcG9uc2UxLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBwcm9jZXNzTmV4dFBlbmRpbmdSZXF1ZXN0IGRlcXVldWVkIG9uZSBmcm9tIHRoZSBxdWV1ZSBzeW5jaHJvbm91c2x5XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIHJlbWFpbmluZyBhZnRlciBhdXRvLWRlcXVldWUnKTtcblxuXHRcdC8vIFlpZWxkIHRvIGxldCB0aGUgZGVxdWV1ZWQgcmVxdWVzdCdzIGFzeW5jIGNoYWluIHByb2dyZXNzIChleHRlbnNpb24gYWN0aXZhdGlvbiwgYWRkUmVxdWVzdCwgZXRjLilcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0Ly8gU3RlcCA0OiBTaW11bGF0ZSB3aGF0IF9yZXNlbmRQZW5kaW5nUmVxdWVzdHMgZG9lcyAodGhlIGNvbW1pdCBoYW5kbGVyKVxuXHRcdC8vIFRoaXMgaXMgdGhlIHJlY292ZXJ5OiBjYW5jZWwgdGhlIGluLWZsaWdodCwgcmVtb3ZlIHJlbWFpbmluZywgcmUtc2VuZCBhbGwgb24gdGFyZ2V0XG5cdFx0Y29uc3QgdGFyZ2V0UmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldFJlZi5vYmplY3Q7XG5cblx0XHQvLyBDYW5jZWwgd2hhdGV2ZXIgaXMgaW4tZmxpZ2h0IG9uIHRoZSBvbGQgc2Vzc2lvblxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzb3VyY2Uuc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIFJlbW92ZSByZW1haW5pbmcgcGVuZGluZyByZXF1ZXN0cyBmcm9tIG9sZCBzZXNzaW9uXG5cdFx0Y29uc3QgcmVtYWluaW5nID0gWy4uLnNvdXJjZS5nZXRQZW5kaW5nUmVxdWVzdHMoKV07XG5cdFx0Zm9yIChjb25zdCBwIG9mIHJlbWFpbmluZykge1xuXHRcdFx0dGVzdFNlcnZpY2UucmVtb3ZlUGVuZGluZ1JlcXVlc3Qoc291cmNlLnNlc3Npb25SZXNvdXJjZSwgcC5yZXF1ZXN0LmlkKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvdXJjZS5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gUmUtc2VuZCBBTEwgMyBvbiB0aGUgdGFyZ2V0IHRocm91Z2ggdGhlIG5vcm1hbCBxdWV1ZSBwYXRoXG5cdFx0Y29uc3QgcmVzZW50MSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRhcmdldC5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQtMScsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHBhdXNlUXVldWU6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVzZW50MiA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRhcmdldC5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQtMicsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHBhdXNlUXVldWU6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVzZW50MyA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRhcmdldC5zZXNzaW9uUmVzb3VyY2UsICdxdWV1ZWQtMycsIHsgYWdlbnRJZDogJ3Nsb3dBZ2VudCcsIHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQsIHBhdXNlUXVldWU6IHRydWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKENoYXRTZW5kUmVzdWx0LmlzUXVldWVkKHJlc2VudDEpKTtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQocmVzZW50MikpO1xuXHRcdGFzc2VydC5vayhDaGF0U2VuZFJlc3VsdC5pc1F1ZXVlZChyZXNlbnQzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgsIDMsICdUYXJnZXQgc2hvdWxkIGhhdmUgYWxsIDMgcXVldWVkIHJlcXVlc3RzJyk7XG5cblx0XHQvLyBTdGVwIDU6IFByb2Nlc3MgdGhlIHRhcmdldCBxdWV1ZSBhbmQgdmVyaWZ5IGFsbCAzIGdldCBzZW50XG5cdFx0dGVzdFNlcnZpY2UucHJvY2Vzc1BlbmRpbmdSZXF1ZXN0cyh0YXJnZXQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgcmVzZW50MS5kZWZlcnJlZDtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHJlc3VsdDEpKTtcblx0XHRhd2FpdCByZXN1bHQxLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgcmVzZW50Mi5kZWZlcnJlZDtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHJlc3VsdDIpKTtcblx0XHRhd2FpdCByZXN1bHQyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRjb25zdCByZXN1bHQzID0gYXdhaXQgcmVzZW50My5kZWZlcnJlZDtcblx0XHRhc3NlcnQub2soQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHJlc3VsdDMpKTtcblx0XHRhd2FpdCByZXN1bHQzLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBWZXJpZnkgdGhlIGFnZW50IHJlY2VpdmVkIGFsbCAzIHF1ZXVlZCBtZXNzYWdlcyBvbiB0aGUgdGFyZ2V0IHNlc3Npb25cblx0XHRjb25zdCBxdWV1ZWRJbnZvY2F0aW9ucyA9IGludm9jYXRpb25PcmRlci5maWx0ZXIobSA9PiBtLmluY2x1ZGVzKCdxdWV1ZWQtJykpO1xuXHRcdGFzc2VydC5vayhxdWV1ZWRJbnZvY2F0aW9ucy5sZW5ndGggPj0gMywgYEV4cGVjdGVkIGF0IGxlYXN0IDMgcXVldWVkIGludm9jYXRpb25zLCBnb3QgJHtxdWV1ZWRJbnZvY2F0aW9ucy5sZW5ndGh9YCk7XG5cdFx0Y29uc3QgbGFzdFRocmVlID0gcXVldWVkSW52b2NhdGlvbnMuc2xpY2UoLTMpO1xuXHRcdGFzc2VydC5vayhsYXN0VGhyZWVbMF0uaW5jbHVkZXMoJ3F1ZXVlZC0xJykpO1xuXHRcdGFzc2VydC5vayhsYXN0VGhyZWVbMV0uaW5jbHVkZXMoJ3F1ZXVlZC0yJykpO1xuXHRcdGFzc2VydC5vayhsYXN0VGhyZWVbMl0uaW5jbHVkZXMoJ3F1ZXVlZC0zJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3F1aXJlT3JMb2FkU2Vzc2lvbiByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHJlbW90ZSBwcm92aWRlciBpcyBub3QgcmVnaXN0ZXJlZCAoZml4IGZvciAjMzAxMjAzKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1bnJlZ2lzdGVyZWRTY2hlbWUgPSAndW5yZWdpc3RlcmVkLXByb3ZpZGVyJztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogdW5yZWdpc3RlcmVkU2NoZW1lLCBwYXRoOiAnL29ycGhhbmVkLXNlc3Npb24nIH0pO1xuXG5cdFx0Ly8gVXNlIGEgbW9jayBzZXNzaW9ucyBzZXJ2aWNlIHdpdGggTk8gY29udGVudCBwcm92aWRlciByZWdpc3RlcmVkIGZvciB0aGUgc2NoZW1lXG5cdFx0Y29uc3QgbW9ja1Nlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZiwgdW5kZWZpbmVkLCAnU2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBubyBwcm92aWRlciBpcyByZWdpc3RlcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IG9uIHVudGl0bGVkIHJlbW90ZSBzZXNzaW9uIHByb3BhZ2F0ZXMgaW5pdGlhbFNlc3Npb25PcHRpb25zIHRvIG5ldyBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVTY2hlbWUgPSAncmVtb3RlUHJvdmlkZXInO1xuXHRcdGNvbnN0IHVudGl0bGVkUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogcmVtb3RlU2NoZW1lLCBwYXRoOiAnL3VudGl0bGVkLXRlc3Qtc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgcmVhbFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHJlbW90ZVNjaGVtZSwgcGF0aDogJy9yZWFsLXNlc3Npb24tMTIzJyB9KTtcblxuXHRcdC8vIFNldCB1cCB0aGUgbW9jayBjaGF0IHNlc3Npb25zIHNlcnZpY2Vcblx0XHRjb25zdCBtb2NrU2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cblx0XHQvLyBSZWdpc3RlciBhIGNvbnRlbnQgcHJvdmlkZXIgc28gbG9hZFJlbW90ZVNlc3Npb24gY2FuIHJlc29sdmUgc2Vzc2lvbnNcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vY2tTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihyZW1vdGVTY2hlbWUsIHtcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IChfcmVzb3VyY2U6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IF9yZXNvdXJjZSxcblx0XHRcdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFNldCBzZXNzaW9uIG9wdGlvbnMgZm9yIHRoZSB1bnRpdGxlZCByZXNvdXJjZVxuXHRcdG1vY2tTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbih1bnRpdGxlZFJlc291cmNlLCAnbW9kZWwnLCAnY2xhdWRlLTMuNS1zb25uZXQnKTtcblx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24odW50aXRsZWRSZXNvdXJjZSwgJ3JlcG8nLCAnbXktcmVwbycpO1xuXG5cdFx0Ly8gT3ZlcnJpZGUgY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtIHRvIHJldHVybiBhIHJlYWwgcmVzb3VyY2Vcblx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLmNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbSA9IGFzeW5jICgpID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogcmVhbFJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICdUZXN0IFNlc3Npb24nLFxuXHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IERhdGUubm93KCksIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfSxcblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIHJlbW90ZSBhZ2VudFxuXHRcdGNvbnN0IHJlbW90ZUFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24gPSB7XG5cdFx0XHRhc3luYyBpbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChyZW1vdGVTY2hlbWUsIHsgLi4uZ2V0QWdlbnREYXRhKHJlbW90ZVNjaGVtZSksIGlzRGVmYXVsdDogdHJ1ZSB9KSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihyZW1vdGVTY2hlbWUsIHJlbW90ZUFnZW50KSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHQvLyBMb2FkIHRoZSB1bnRpdGxlZCBzZXNzaW9uIHRvIGNyZWF0ZSB0aGUgaW5pdGlhbCBtb2RlbFxuXHRcdGNvbnN0IHVudGl0bGVkUmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odW50aXRsZWRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHVudGl0bGVkUmVmLCAnU2hvdWxkIGxvYWQgdW50aXRsZWQgc2Vzc2lvbicpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQodW50aXRsZWRSZWYpO1xuXG5cdFx0Ly8gU2VuZCBhIHJlcXVlc3QgLSB0aGlzIHRyaWdnZXJzIHRoZSB1bnRpdGxlZCBcdTIxOTIgcmVhbCBzZXNzaW9uIGNvbnZlcnNpb25cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdoZWxsbycsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBUaGUgbmV3IG1vZGVsICh3aXRoIHJlYWwgcmVzb3VyY2UpIHNob3VsZCBoYXZlIGluaXRpYWxTZXNzaW9uT3B0aW9ucyBzZXRcblx0XHRjb25zdCBuZXdNb2RlbCA9IHRlc3RTZXJ2aWNlLmdldFNlc3Npb24ocmVhbFJlc291cmNlKSBhcyBDaGF0TW9kZWw7XG5cdFx0YXNzZXJ0Lm9rKG5ld01vZGVsLCAnTmV3IG1vZGVsIHNob3VsZCBleGlzdCBhdCB0aGUgcmVhbCByZXNvdXJjZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRDaGF0U2Vzc2lvbk9wdGlvbnNNYXAudG9TdHJWYWx1ZUFycmF5KG1vY2tTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbnMocmVhbFJlc291cmNlKSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdtb2RlbCcsIHZhbHVlOiAnY2xhdWRlLTMuNS1zb25uZXQnIH0sXG5cdFx0XHRcdHsgb3B0aW9uSWQ6ICdyZXBvJywgdmFsdWU6ICdteS1yZXBvJyB9LFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1bnRpdGxlZCBzZXNzaW9uIG1hdGVyaWFsaXphdGlvbiBpcyBpZGVtcG90ZW50L3NlcmlhbGl6ZWQgKGF2b2lkcyBkdXBsaWNhdGUgc2Vzc2lvbnMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVNjaGVtZSA9ICdyZW1vdGVQcm92aWRlcic7XG5cblx0XHQvKipcblx0XHQgKiBSZWdpc3RlcnMgYSBjb250ZW50IHByb3ZpZGVyICsgZGVmYXVsdCBhZ2VudCBmb3IgYHJlbW90ZVNjaGVtZWAsIHdpcmVzIHRoZVxuXHRcdCAqIGdpdmVuIGBjcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW1gL2BpbnZva2VgIGltcGxlbWVudGF0aW9ucywgYW5kIHJldHVybnMgYVxuXHRcdCAqIGZyZXNobHkgY3JlYXRlZCAoYnV0IG5vdC15ZXQtYWNxdWlyZWQpIENoYXRTZXJ2aWNlIHBsdXMgYW4gdW50aXRsZWQgcmVzb3VyY2UuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gc2V0dXBVbnRpdGxlZFJlbW90ZShvcHRzOiB7XG5cdFx0XHRjcmVhdGVJdGVtOiBJQ2hhdFNlc3Npb25zU2VydmljZVsnY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtJ107XG5cdFx0XHRpbnZva2U/OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb25bJ2ludm9rZSddO1xuXHRcdFx0cHJvdmlkZUNvbnRlbnQ/OiBJQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXJbJ3Byb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQnXTtcblx0XHR9KTogeyBzZXJ2aWNlOiBDaGF0U2VydmljZTsgdW50aXRsZWRSZXNvdXJjZTogVVJJOyBtb2NrU2Vzc2lvbnNTZXJ2aWNlOiBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IHtcblx0XHRcdGNvbnN0IG1vY2tTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9ja1Nlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHJlbW90ZVNjaGVtZSwge1xuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiBvcHRzLnByb3ZpZGVDb250ZW50ID8/ICgocmVzb3VyY2U6IFVSSSkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KSksXG5cdFx0XHR9KSk7XG5cdFx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLmNyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbSA9IG9wdHMuY3JlYXRlSXRlbTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG1vY2tTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCByZW1vdGVBZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0geyBpbnZva2U6IG9wdHMuaW52b2tlID8/IChhc3luYyAoKSA9PiAoe30pKSB9O1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQocmVtb3RlU2NoZW1lLCB7IC4uLmdldEFnZW50RGF0YShyZW1vdGVTY2hlbWUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihyZW1vdGVTY2hlbWUsIHJlbW90ZUFnZW50KSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvdW50aXRsZWQtbWF0ZXJpYWxpemUnIH0pO1xuXHRcdFx0cmV0dXJuIHsgc2VydmljZSwgdW50aXRsZWRSZXNvdXJjZSwgbW9ja1Nlc3Npb25zU2VydmljZSB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHJlYWxJdGVtKHJlc291cmNlOiBVUkkpOiBJQ2hhdFNlc3Npb25JdGVtIHtcblx0XHRcdHJldHVybiB7IHJlc291cmNlLCBsYWJlbDogJ1Rlc3QgU2Vzc2lvbicsIHRpbWluZzogeyBjcmVhdGVkOiBEYXRlLm5vdygpLCBsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHVuZGVmaW5lZCwgbGFzdFJlcXVlc3RFbmRlZDogdW5kZWZpbmVkIH0gfTtcblx0XHR9XG5cblx0XHR0ZXN0KCd0d28gY29uY3VycmVudCBzZW5kcyBjcmVhdGUgYSBzaW5nbGUgcmVhbCBzZXNzaW9uIGFuZCByZWplY3QgdGhlIGR1cGxpY2F0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvcmVhbC1jb25jdXJyZW50JyB9KTtcblx0XHRcdGxldCBjcmVhdGVDb3VudCA9IDA7XG5cdFx0XHQvLyBLZWVwIHRoZSBhZ2VudCB0dXJuIHBlbmRpbmcgc28gdGhlIGZpcnN0IHNlbmQncyByZXF1ZXN0IHN0YXlzIGluXG5cdFx0XHQvLyBgX3BlbmRpbmdSZXF1ZXN0c2AsIG1ha2luZyB0aGUgY29udmVyZ2VkIHNlY29uZCBzZW5kJ3MgcmVqZWN0aW9uXG5cdFx0XHQvLyBkZXRlcm1pbmlzdGljLlxuXHRcdFx0Y29uc3QgYWdlbnRHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCB1bnRpdGxlZFJlc291cmNlIH0gPSBzZXR1cFVudGl0bGVkUmVtb3RlKHtcblx0XHRcdFx0Y3JlYXRlSXRlbTogYXN5bmMgKCkgPT4geyBjcmVhdGVDb3VudCsrOyByZXR1cm4gcmVhbEl0ZW0ocmVhbFJlc291cmNlKTsgfSxcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7IGF3YWl0IGFnZW50R2F0ZS5wOyByZXR1cm4ge307IH0sXG5cdFx0XHR9KTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoKGF3YWl0IHNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odW50aXRsZWRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpISk7XG5cblx0XHRcdC8vIEZpcmUgdHdvIHNlbmRzIG9uIHRoZSBzYW1lIHVudGl0bGVkIHJlc291cmNlIHdpdGhvdXQgYXdhaXRpbmcgYmV0d2VlblxuXHRcdFx0Ly8gdGhlbSwgc28gYm90aCByZWFjaCB0aGUgbWF0ZXJpYWxpemF0aW9uIHBhdGggY29uY3VycmVudGx5LlxuXHRcdFx0Y29uc3QgcDEgPSBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdoZWxsbycsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdFx0Y29uc3QgcDIgPSBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdoZWxsbycsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdFx0Y29uc3QgW3IxLCByMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbcDEsIHAyXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMSwgJ2NyZWF0ZU5ld0NoYXRTZXNzaW9uSXRlbSBtdXN0IHJ1biBleGFjdGx5IG9uY2UnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3IxLmtpbmQsIHIyLmtpbmRdLnNvcnQoKSwgWydyZWplY3RlZCcsICdzZW50J10sICdvbmUgc2VuZCBpcyBhY2NlcHRlZCwgdGhlIGR1cGxpY2F0ZSBpcyByZWplY3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0U2Vzc2lvbihyZWFsUmVzb3VyY2UpLCAnZXhhY3RseSBvbmUgcmVhbCBzZXNzaW9uIGlzIG1hdGVyaWFsaXplZCcpO1xuXG5cdFx0XHRhZ2VudEdhdGUuY29tcGxldGUoKTtcblx0XHRcdGNvbnN0IHNlbnQgPSBDaGF0U2VuZFJlc3VsdC5pc1NlbnQocjEpID8gcjEgOiByMjtcblx0XHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQoc2VudCk7XG5cdFx0XHRhd2FpdCBzZW50LmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRlcmlhbGl6YXRpb24gcmVqZWN0cyBhIHNlbmQgd2hlbiB0aGUgcmVhbCBzZXNzaW9uIGlzIHJlYWQtb25seScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvcmVhbC1yZWFkLW9ubHknIH0pO1xuXHRcdFx0bGV0IGludm9rZUNvdW50ID0gMDtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgdW50aXRsZWRSZXNvdXJjZSB9ID0gc2V0dXBVbnRpdGxlZFJlbW90ZSh7XG5cdFx0XHRcdGNyZWF0ZUl0ZW06IGFzeW5jICgpID0+IHJlYWxJdGVtKHJlYWxSZXNvdXJjZSksXG5cdFx0XHRcdGludm9rZTogYXN5bmMgKCkgPT4geyBpbnZva2VDb3VudCsrOyByZXR1cm4ge307IH0sXG5cdFx0XHRcdHByb3ZpZGVDb250ZW50OiByZXNvdXJjZSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHRpc1JlYWRPbmx5OiBjb25zdE9ic2VydmFibGUocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVhbFJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoKGF3YWl0IHNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odW50aXRsZWRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpISk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2Uuc2VuZFJlcXVlc3QodW50aXRsZWRSZXNvdXJjZSwgJ2hlbGxvJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cdFx0XHRjb25zdCByZWFsTW9kZWwgPSBzZXJ2aWNlLmdldFNlc3Npb24ocmVhbFJlc291cmNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc3VsdCxcblx0XHRcdFx0aW52b2tlQ291bnQsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogcmVhbE1vZGVsPy5nZXRSZXF1ZXN0cygpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1Nlc3Npb24gaXMgcmVhZC1vbmx5JywgbmV3U2Vzc2lvblJlc291cmNlOiByZWFsUmVzb3VyY2UgfSxcblx0XHRcdFx0aW52b2tlQ291bnQ6IDAsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBsYXRlIHNlbmQgc3RpbGwgYWRkcmVzc2VkIHRvIHRoZSB1bnRpdGxlZCByZXNvdXJjZSByZS10YXJnZXRzIHRoZSByZWFsIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFsUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogcmVtb3RlU2NoZW1lLCBwYXRoOiAnL3JlYWwtbGF0ZScgfSk7XG5cdFx0XHRsZXQgY3JlYXRlQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCB1bnRpdGxlZFJlc291cmNlIH0gPSBzZXR1cFVudGl0bGVkUmVtb3RlKHtcblx0XHRcdFx0Y3JlYXRlSXRlbTogYXN5bmMgKCkgPT4geyBjcmVhdGVDb3VudCsrOyByZXR1cm4gcmVhbEl0ZW0ocmVhbFJlc291cmNlKTsgfSxcblx0XHRcdH0pO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZCgoYXdhaXQgc2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih1bnRpdGxlZFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhKTtcblxuXHRcdFx0Y29uc3QgcjEgPSBhd2FpdCBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdmaXJzdCcsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyMSk7XG5cdFx0XHRhd2FpdCByMS5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXG5cdFx0XHRjb25zdCByZWFsTW9kZWwgPSBzZXJ2aWNlLmdldFNlc3Npb24ocmVhbFJlc291cmNlKSBhcyBDaGF0TW9kZWw7XG5cdFx0XHRhc3NlcnQub2socmVhbE1vZGVsLCAncmVhbCBzZXNzaW9uIGV4aXN0cyBhZnRlciBmaXJzdCBzZW5kJyk7XG5cdFx0XHRjb25zdCByZXF1ZXN0c0FmdGVyRmlyc3QgPSByZWFsTW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGg7XG5cblx0XHRcdC8vIEEgc2Vjb25kIHNlbmQgYXJyaXZpbmcgb24gdGhlIHN0YWxlIHVudGl0bGVkIHJlc291cmNlIChiZWZvcmUgdGhlIFVJXG5cdFx0XHQvLyBzd2FwcGVkIHRvIHRoZSByZWFsIHJlc291cmNlKSBtdXN0IE5PVCBtYXRlcmlhbGl6ZSBhIHNlY29uZCBzZXNzaW9uLFxuXHRcdFx0Ly8gYW5kIG11c3QgcmVwb3J0IHRoZSByZWFsIHJlc291cmNlIGFzIHRoZSBuZXcgc2Vzc2lvbiBzbyB0aGUgY2FsbGVyXG5cdFx0XHQvLyBzd2FwcyBpdHMgVUkgdG8gdGhlIHJlYWwgc2Vzc2lvbiAobWlycm9yaW5nIHRoZSBmaXJzdCBzZW5kKS5cblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCAnc2Vjb25kJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cdFx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHIyKTtcblx0XHRcdGF3YWl0IHIyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMSwgJ25vIHNlY29uZCBtYXRlcmlhbGl6YXRpb24gZm9yIGEgc3RhbGUgdW50aXRsZWQgc2VuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIyLm5ld1Nlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSwgcmVhbFJlc291cmNlLnRvU3RyaW5nKCksICdsYXRlIHJlLXRhcmdldCByZXBvcnRzIHRoZSByZWFsIHJlc291cmNlIGFzIHRoZSBuZXcgc2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWxNb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgcmVxdWVzdHNBZnRlckZpcnN0ICsgMSwgJ3NlY29uZCByZXF1ZXN0IGlzIHJvdXRlZCB0byB0aGUgcmVhbCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIGxhdGUgc2VuZCB0byBhIHJlYWQtb25seSBtYXRlcmlhbGl6ZWQgc2Vzc2lvbiByZXBvcnRzIHRoZSByZWFsIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhbFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHJlbW90ZVNjaGVtZSwgcGF0aDogJy9yZWFsLWxhdGUtcmVhZC1vbmx5JyB9KTtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2lzUmVhZE9ubHknLCBmYWxzZSk7XG5cdFx0XHRsZXQgaW52b2tlQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCB1bnRpdGxlZFJlc291cmNlIH0gPSBzZXR1cFVudGl0bGVkUmVtb3RlKHtcblx0XHRcdFx0Y3JlYXRlSXRlbTogYXN5bmMgKCkgPT4gcmVhbEl0ZW0ocmVhbFJlc291cmNlKSxcblx0XHRcdFx0aW52b2tlOiBhc3luYyAoKSA9PiB7IGludm9rZUNvdW50Kys7IHJldHVybiB7fTsgfSxcblx0XHRcdFx0cHJvdmlkZUNvbnRlbnQ6IHJlc291cmNlID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRoaXN0b3J5OiBbXSxcblx0XHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGlzUmVhZE9ubHksXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZCgoYXdhaXQgc2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih1bnRpdGxlZFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhKTtcblxuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdmaXJzdCcsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChmaXJzdCk7XG5cdFx0XHRhd2FpdCBmaXJzdC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdFx0aXNSZWFkT25seS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCAnc2Vjb25kJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZWNvbmQsXG5cdFx0XHRcdGludm9rZUNvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWNvbmQ6IHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnU2Vzc2lvbiBpcyByZWFkLW9ubHknLCBuZXdTZXNzaW9uUmVzb3VyY2U6IHJlYWxSZXNvdXJjZSB9LFxuXHRcdFx0XHRpbnZva2VDb3VudDogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBmYWlsZWQgbWF0ZXJpYWxpemF0aW9uIGRvZXMgbm90IHBvaXNvbiB0aGUgbGF0Y2ggKHJldHJ5IHJlLWF0dGVtcHRzKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvcmVhbC1yZXRyeScgfSk7XG5cdFx0XHRsZXQgY3JlYXRlQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCB1bnRpdGxlZFJlc291cmNlIH0gPSBzZXR1cFVudGl0bGVkUmVtb3RlKHtcblx0XHRcdFx0Y3JlYXRlSXRlbTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNyZWF0ZUNvdW50Kys7XG5cdFx0XHRcdFx0aWYgKGNyZWF0ZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlYWxJdGVtKHJlYWxSZXNvdXJjZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoKGF3YWl0IHNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24odW50aXRsZWRSZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpISk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHNlcnZpY2Uuc2VuZFJlcXVlc3QodW50aXRsZWRSZXNvdXJjZSwgJ2ZpcnN0JywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSksIC9ib29tLyk7XG5cblx0XHRcdC8vIFRoZSBpbi1mbGlnaHQgZW50cnkgbXVzdCBoYXZlIGJlZW4gY2xlYXJlZCBzbyBhIHJldHJ5IG1hdGVyaWFsaXplcy5cblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCAnc2Vjb25kJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cdFx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHIyKTtcblx0XHRcdGF3YWl0IHIyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMiwgJ3JldHJ5IHJlLWF0dGVtcHRzIG1hdGVyaWFsaXphdGlvbicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0U2Vzc2lvbihyZWFsUmVzb3VyY2UpLCAncmV0cnkgcHJvZHVjZXMgdGhlIHJlYWwgc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjb25jdXJyZW50IHdhaXRlciBkb2VzIG5vdCBpbmhlcml0IHRoZSBmaXJzdCBzZW5kXFwncyBtYXRlcmlhbGl6YXRpb24gZmFpbHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvcmVhbC1zaGFyZWQtZmFpbHVyZScgfSk7XG5cdFx0XHRsZXQgY3JlYXRlQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZ2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgdW50aXRsZWRSZXNvdXJjZSB9ID0gc2V0dXBVbnRpdGxlZFJlbW90ZSh7XG5cdFx0XHRcdGNyZWF0ZUl0ZW06IGFzeW5jICgpID0+IHsgY3JlYXRlQ291bnQrKzsgYXdhaXQgZ2F0ZS5wOyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfSxcblx0XHRcdH0pO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZCgoYXdhaXQgc2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih1bnRpdGxlZFJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhKTtcblxuXHRcdFx0Y29uc3QgcDEgPSBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdmaXJzdCcsIHsgYWdlbnRJZDogcmVtb3RlU2NoZW1lIH0pO1xuXHRcdFx0Y29uc3QgcDIgPSBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdzZWNvbmQnLCB7IGFnZW50SWQ6IHJlbW90ZVNjaGVtZSB9KTtcblx0XHRcdGdhdGUuY29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3QgZmlyc3RPdXRjb21lID0gYXdhaXQgcDEudGhlbigoKSA9PiAncmVzb2x2ZWQnLCAoKSA9PiAncmVqZWN0ZWQnKTtcblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgcDI7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdE91dGNvbWUsICdyZWplY3RlZCcsICd0aGUgb3JpZ2luYXRpbmcgc2VuZCBzdXJmYWNlcyB0aGUgZmFpbHVyZScpO1xuXHRcdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDEsICd0aGUgd2FpdGVyIGRpZCBub3Qgc3RhcnQgYSBzZWNvbmQgbWF0ZXJpYWxpemF0aW9uJyk7XG5cdFx0XHRhc3NlcnQub2soIXNlcnZpY2UuZ2V0U2Vzc2lvbihyZWFsUmVzb3VyY2UpLCAnbm8gcmVhbCBzZXNzaW9uIHdhcyBjcmVhdGVkJyk7XG5cdFx0XHRhd2FpdCByMi5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zaW5nIGEgbWF0ZXJpYWxpemVkIHVudGl0bGVkIHNlc3Npb24gY2xlYXJzIGl0cyByZS10YXJnZXQgbWFwcGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWxSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiByZW1vdGVTY2hlbWUsIHBhdGg6ICcvcmVhbC1kaXNwb3NlJyB9KTtcblx0XHRcdGxldCBjcmVhdGVDb3VudCA9IDA7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIHVudGl0bGVkUmVzb3VyY2UgfSA9IHNldHVwVW50aXRsZWRSZW1vdGUoe1xuXHRcdFx0XHRjcmVhdGVJdGVtOiBhc3luYyAoKSA9PiB7IGNyZWF0ZUNvdW50Kys7IHJldHVybiByZWFsSXRlbShyZWFsUmVzb3VyY2UpOyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB1bnRpdGxlZFJlZiA9IChhd2FpdCBzZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHVudGl0bGVkUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSE7XG5cblx0XHRcdGNvbnN0IHIxID0gYXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCAnZmlyc3QnLCB7IGFnZW50SWQ6IHJlbW90ZVNjaGVtZSB9KTtcblx0XHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocjEpO1xuXHRcdFx0YXdhaXQgcjEuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblx0XHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFNlc3Npb24ocmVhbFJlc291cmNlKSwgJ3JlYWwgc2Vzc2lvbiBleGlzdHMgYWZ0ZXIgZmlyc3Qgc2VuZCcpO1xuXG5cdFx0XHQvLyBEaXNwb3NpbmcgdGhlIHVudGl0bGVkIHNlc3Npb24gKHRoZSBVSSBzd2FwIGluIHByb2R1Y3Rpb24pIG11c3QgZHJvcFxuXHRcdFx0Ly8gdGhlIHVudGl0bGVkXHUyMTkycmVhbCBtYXBwaW5nIHNvIGl0IGNhbm5vdCBncm93IHVuYm91bmRlZCBvciByZWRpcmVjdC5cblx0XHRcdHVudGl0bGVkUmVmLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHRzZXJ2aWNlLnNlbmRSZXF1ZXN0KHVudGl0bGVkUmVzb3VyY2UsICdzZWNvbmQnLCB7IGFnZW50SWQ6IHJlbW90ZVNjaGVtZSB9KSxcblx0XHRcdFx0L1Vua25vd24gc2Vzc2lvbi8sXG5cdFx0XHRcdCd0aGUgc3RhbGUgdW50aXRsZWQgcmVzb3VyY2Ugbm8gbG9uZ2VyIHJlLXRhcmdldHMgdGhlIHJlYWwgc2Vzc2lvbicsXG5cdFx0XHQpO1xuXG5cdFx0XHQvLyBUaGUgcmVhbCBzZXNzaW9uIHJlbWFpbnMgdXNhYmxlLlxuXHRcdFx0Y29uc3QgcjMgPSBhd2FpdCBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHJlYWxSZXNvdXJjZSwgJ3RoaXJkJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cdFx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHIzKTtcblx0XHRcdGF3YWl0IHIzLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDEsICdubyBleHRyYSBtYXRlcmlhbGl6YXRpb24gb2NjdXJyZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgbG9hZCBmYWlsdXJlIGFmdGVyIGFsaWFzIHJlZ2lzdHJhdGlvbiBkb2VzIG5vdCBwb2lzb24gdGhlIGxhdGUtc2VuZCByZS10YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFsUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogcmVtb3RlU2NoZW1lLCBwYXRoOiAnL3JlYWwtbG9hZGZhaWwnIH0pO1xuXHRcdFx0bGV0IGNyZWF0ZUNvdW50ID0gMDtcblx0XHRcdGxldCBmYWlsUmVhbExvYWQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCB1bnRpdGxlZFJlc291cmNlLCBtb2NrU2Vzc2lvbnNTZXJ2aWNlIH0gPSBzZXR1cFVudGl0bGVkUmVtb3RlKHtcblx0XHRcdFx0Y3JlYXRlSXRlbTogYXN5bmMgKCkgPT4geyBjcmVhdGVDb3VudCsrOyByZXR1cm4gcmVhbEl0ZW0ocmVhbFJlc291cmNlKTsgfSxcblx0XHRcdFx0Ly8gRmFpbCB0aGUgZmlyc3QgbG9hZCBvZiB0aGUgcmVhbCBzZXNzaW9uIChlLmcuIHByb3ZpZGVyIHJhY2VkL3VucmVnaXN0ZXJlZCksXG5cdFx0XHRcdC8vIHRoZW4gc3VjY2VlZCBzbyBhIHJldHJ5IGNhbiBjb21wbGV0ZS5cblx0XHRcdFx0cHJvdmlkZUNvbnRlbnQ6IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlYWxSZXNvdXJjZS50b1N0cmluZygpICYmIGZhaWxSZWFsTG9hZCkge1xuXHRcdFx0XHRcdFx0ZmFpbFJlYWxMb2FkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdsb2FkIGJvb20nKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLCBoaXN0b3J5OiBbXSwgb25XaWxsRGlzcG9zZTogRXZlbnQuTm9uZSwgZGlzcG9zZTogKCkgPT4geyB9IH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKChhd2FpdCBzZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHVudGl0bGVkUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSEpO1xuXG5cdFx0XHQvLyBGaXJzdCBzZW5kIHJlZ2lzdGVycyB0aGUgaW52ZXJzZSBhbGlhcywgdGhlbiB0aGUgcmVhbCBzZXNzaW9uJ3MgbG9hZFxuXHRcdFx0Ly8gZmFpbHMuIFRoZSBmb3J3YXJkIG1hcHBpbmcgbXVzdCBOT1QgaGF2ZSBiZWVuIHB1Ymxpc2hlZCAoaXQgaXMgb25seVxuXHRcdFx0Ly8gcHVibGlzaGVkIGFmdGVyIGEgc3VjY2Vzc2Z1bCBsb2FkKSwgc28gbm90aGluZyByZS10YXJnZXRzIGEgc2Vzc2lvblxuXHRcdFx0Ly8gdGhhdCB3YXMgbmV2ZXIgY3JlYXRlZC5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHNlcnZpY2Uuc2VuZFJlcXVlc3QodW50aXRsZWRSZXNvdXJjZSwgJ2ZpcnN0JywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSksIC9sb2FkIGJvb20vKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrU2Vzc2lvbnNTZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZFJlc291cmNlKSwgdW5kZWZpbmVkLCAnbm8gcG9pc29uZWQgdW50aXRsZWRcdTIxOTJyZWFsIG1hcHBpbmcgYWZ0ZXIgYSBsb2FkIGZhaWx1cmUnKTtcblxuXHRcdFx0Ly8gQSBzdWJzZXF1ZW50IHNlbmQgbXVzdCBOT1QgdGhyb3cgYFVua25vd24gc2Vzc2lvbmAgKHRoZSBwb2lzb25pbmdcblx0XHRcdC8vIHN5bXB0b20pOyBpdCByZS1tYXRlcmlhbGl6ZXMgY2xlYW5seSBub3cgdGhhdCB0aGUgbG9hZCBzdWNjZWVkcy5cblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCAnc2Vjb25kJywgeyBhZ2VudElkOiByZW1vdGVTY2hlbWUgfSk7XG5cdFx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHIyKTtcblx0XHRcdGF3YWl0IHIyLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDIsICdzZWNvbmQgc2VuZCByZS1tYXRlcmlhbGl6ZXMgYWZ0ZXIgdGhlIGZhaWxlZCBhdHRlbXB0Jyk7XG5cdFx0XHRhc3NlcnQub2soc2VydmljZS5nZXRTZXNzaW9uKHJlYWxSZXNvdXJjZSksICdzZWNvbmQgc2VuZCBwcm9kdWNlcyB0aGUgcmVhbCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHBhc3NlcyBhZ2VudCBob3N0IHNlc3Npb24gY2FwYWJpbGl0aWVzIHRvIHRoZSByZXF1ZXN0IHBhcnNlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LWNvcGlsb3QnO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBzZXNzaW9uVHlwZSwgcGF0aDogJy9zZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IG1vY2tTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnMoW3tcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogJ0FnZW50IEhvc3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdBZ2VudCBIb3N0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgSG9zdCcsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSB9LFxuXHRcdH1dKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vY2tTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZSwge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogcmVzb3VyY2UgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IGNvbW1hbmQgPT09ICdza2lsbCcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChzZXNzaW9uVHlwZSwgeyAuLi5nZXRBZ2VudERhdGEoc2Vzc2lvblR5cGUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oc2Vzc2lvblR5cGUsIHsgYXN5bmMgaW52b2tlKCkgeyByZXR1cm4ge307IH0gfSkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICcvc2tpbGwgcGxhbicsIHsgYWdlbnRJZDogc2Vzc2lvblR5cGUgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKClbMF0ubWVzc2FnZS5wYXJ0cy5tYXAocGFydCA9PiAoe1xuXHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0dGV4dDogcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0ID8gcGFydC5uYW1lIDogdW5kZWZpbmVkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBraW5kOiAnYWdlbnQnLCB0ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2luZDogJ3RleHQnLCB0ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRcdHsga2luZDogJ3Byb21wdCcsIHRleHQ6ICdza2lsbCcgfSxcblx0XHRcdHsga2luZDogJ3RleHQnLCB0ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgcmVkYWN0cyByZW1vdGUgc2Vzc2lvbiB0eXBlIGluIHByb3ZpZGVyIGludm9rZWQgdGVsZW1ldHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ3JlbW90ZS10ZXN0LWNvcGlsb3QnO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBzZXNzaW9uVHlwZSwgcGF0aDogJy9zZXNzaW9uJyB9KTtcblx0XHRjb25zdCBwcm92aWRlckludm9rZWRFdmVudHM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+W10gPSBbXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHQuLi5OdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRcdGlmIChldmVudE5hbWUgPT09ICdpbnRlcmFjdGl2ZVNlc3Npb25Qcm92aWRlckludm9rZWQnICYmIGRhdGEpIHtcblx0XHRcdFx0XHRwcm92aWRlckludm9rZWRFdmVudHMucHVzaChkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbW9ja1Nlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdG1vY2tTZXNzaW9uc1NlcnZpY2Uuc2V0Q29udHJpYnV0aW9ucyhbe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiAnUmVtb3RlIEFnZW50IEhvc3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdSZW1vdGUgQWdlbnQgSG9zdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1JlbW90ZSBBZ2VudCBIb3N0Jyxcblx0XHR9XSk7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChtb2NrU2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2Vzc2lvblR5cGUsIHtcblx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQ6IHJlc291cmNlID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdGhpc3Rvcnk6IFtdLFxuXHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja1Nlc3Npb25zU2VydmljZSk7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChzZXNzaW9uVHlwZSwgeyAuLi5nZXRBZ2VudERhdGEoc2Vzc2lvblR5cGUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oc2Vzc2lvblR5cGUsIHsgYXN5bmMgaW52b2tlKCkgeyByZXR1cm4ge307IH0gfSkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICdoZWxsbycsIHsgYWdlbnRJZDogc2Vzc2lvblR5cGUgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXJJbnZva2VkRXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0c2Vzc2lvblR5cGU6IGV2ZW50LnNlc3Npb25UeXBlLFxuXHRcdFx0aGFzUmVxdWVzdElkOiB0eXBlb2YgZXZlbnQucmVxdWVzdElkID09PSAnc3RyaW5nJyxcblx0XHR9KSksIFt7IHNlc3Npb25UeXBlOiAncmVtb3RlLWFnZW50LWhvc3QnLCBoYXNSZXF1ZXN0SWQ6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCB3aXRoIGFnZW50SWRTaWxlbnQgcGFzc2VzIGFnZW50IGhvc3Qgc2Vzc2lvbiBjYXBhYmlsaXRpZXMgdG8gdGhlIHJlcXVlc3QgcGFyc2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtY29waWxvdCc7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHNlc3Npb25UeXBlLCBwYXRoOiAnL3Nlc3Npb24tc2lsZW50JyB9KTtcblxuXHRcdGNvbnN0IG1vY2tTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRtb2NrU2Vzc2lvbnNTZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnMoW3tcblx0XHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdFx0bmFtZTogJ0FnZW50IEhvc3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdBZ2VudCBIb3N0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnQWdlbnQgSG9zdCcsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHsgc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSB9LFxuXHRcdH1dKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vY2tTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZSwge1xuXHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudDogcmVzb3VyY2UgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbW9ja09iamVjdDxJUHJvbXB0c1NlcnZpY2U+KCkoeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSk7XG5cdFx0cHJvbXB0c1NlcnZpY2UuaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUuY2FsbHNGYWtlKChjb21tYW5kOiBzdHJpbmcpID0+IGNvbW1hbmQgPT09ICdza2lsbCcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChzZXNzaW9uVHlwZSwgeyAuLi5nZXRBZ2VudERhdGEoc2Vzc2lvblR5cGUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oc2Vzc2lvblR5cGUsIHsgYXN5bmMgaW52b2tlKCkgeyByZXR1cm4ge307IH0gfSkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0ZXN0U2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsICcvc2tpbGwgcGxhbicsIHsgYWdlbnRJZFNpbGVudDogc2Vzc2lvblR5cGUgfSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKClbMF0ubWVzc2FnZS5wYXJ0cy5tYXAocGFydCA9PiAoe1xuXHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0dGV4dDogcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0ID8gcGFydC5uYW1lIDogdW5kZWZpbmVkLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyBraW5kOiAncHJvbXB0JywgdGV4dDogJ3NraWxsJyB9LFxuXHRcdFx0eyBraW5kOiAndGV4dCcsIHRleHQ6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkUmVtb3RlU2Vzc2lvbiBwYXNzZXMgYWdlbnQgaG9zdCBzZXNzaW9uIGNhcGFiaWxpdGllcyB0byB0aGUgcmVxdWVzdCBwYXJzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Jztcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogc2Vzc2lvblR5cGUsIHBhdGg6ICcvc2Vzc2lvbi13aXRoLWhpc3RvcnknIH0pO1xuXG5cdFx0Y29uc3QgbW9ja1Nlc3Npb25zU2VydmljZSA9IG5ldyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSgpO1xuXHRcdG1vY2tTZXNzaW9uc1NlcnZpY2Uuc2V0Q29udHJpYnV0aW9ucyhbe1xuXHRcdFx0dHlwZTogc2Vzc2lvblR5cGUsXG5cdFx0XHRuYW1lOiAnQWdlbnQgSG9zdCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0FnZW50IEhvc3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBZ2VudCBIb3N0Jyxcblx0XHRcdGNhcGFiaWxpdGllczogeyBzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlIH0sXG5cdFx0fV0pO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9ja1Nlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHNlc3Npb25UeXBlLCB7XG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiByZXNvdXJjZSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRoaXN0b3J5OiBbeyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJy9za2lsbCBwbGFuJywgcGFydGljaXBhbnQ6IHNlc3Npb25UeXBlIH1dLFxuXHRcdFx0XHRvbldpbGxEaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwgbW9ja1Nlc3Npb25zU2VydmljZSk7XG5cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG1vY2tPYmplY3Q8SVByb21wdHNTZXJ2aWNlPigpKHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0pO1xuXHRcdHByb21wdHNTZXJ2aWNlLmlzVmFsaWRTbGFzaENvbW1hbmROYW1lLmNhbGxzRmFrZSgoY29tbWFuZDogc3RyaW5nKSA9PiBjb21tYW5kID09PSAnc2tpbGwnKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwgcHJvbXB0c1NlcnZpY2UpO1xuXG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoc2Vzc2lvblR5cGUsIHsgLi4uZ2V0QWdlbnREYXRhKHNlc3Npb25UeXBlKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKHNlc3Npb25UeXBlLCB7IGFzeW5jIGludm9rZSgpIHsgcmV0dXJuIHt9OyB9IH0pKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5vayhyZWYpO1xuXHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmLm9iamVjdC5nZXRSZXF1ZXN0cygpWzBdLm1lc3NhZ2UucGFydHMubWFwKHBhcnQgPT4gKHtcblx0XHRcdGtpbmQ6IHBhcnQua2luZCxcblx0XHRcdHRleHQ6IHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCA/IHBhcnQubmFtZSA6IHVuZGVmaW5lZCxcblx0XHR9KSksIFtcblx0XHRcdHsga2luZDogJ3Byb21wdCcsIHRleHQ6ICdza2lsbCcgfSxcblx0XHRcdHsga2luZDogJ3RleHQnLCB0ZXh0OiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHJvdWJsZXNob290IHNraWxsIHZpYSBhdHRhY2hlZENvbnRleHQgaXMgYmxvY2tlZCB3aGVuIGZpbGVMb2dnaW5nLmVuYWJsZWQgaXMgb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSBhcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0YXdhaXQgY29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORywgZmFsc2UpO1xuXG5cdFx0Y29uc3QgdHJvdWJsZXNob290QWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShfcmVxdWVzdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX3Rva2VuKSB7XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudCgndHJvdWJsZXNob290QWdlbnQnLCB7IC4uLmdldEFnZW50RGF0YSgndHJvdWJsZXNob290QWdlbnQnKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCd0cm91Ymxlc2hvb3RBZ2VudCcsIHRyb3VibGVzaG9vdEFnZW50KSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3Q7XG5cblx0XHRjb25zdCBza2lsbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBDT1BJTE9UX1NLSUxMX1VSSV9TQ0hFTUUsIHBhdGg6IFRST1VCTEVTSE9PVF9TS0lMTF9QQVRIIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCAnaW52ZXN0aWdhdGUgdGhpcyBpc3N1ZScsIHtcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogW3tcblx0XHRcdFx0aWQ6ICd0cm91Ymxlc2hvb3Qtc2tpbGwnLFxuXHRcdFx0XHRuYW1lOiAndHJvdWJsZXNob290Jyxcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHR2YWx1ZTogc2tpbGxVcmksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRDaGF0U2VuZFJlc3VsdC5hc3NlcnRTZW50KHJlc3BvbnNlKTtcblx0XHRhd2FpdCByZXNwb25zZS5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHJlc3BvbnNlQ29udGVudCA9IHJlcXVlc3RzWzBdLnJlc3BvbnNlPy5yZXNwb25zZS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5vayhyZXNwb25zZUNvbnRlbnQ/LmluY2x1ZGVzKEFHRU5UX0RFQlVHX0xPR19GSUxFX0xPR0dJTkdfRU5BQkxFRF9TRVRUSU5HKSwgJ1Jlc3BvbnNlIHNob3VsZCBtZW50aW9uIHRoZSBmaWxlTG9nZ2luZyBzZXR0aW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Ryb3VibGVzaG9vdCBza2lsbCB2aWEgYXR0YWNoZWRDb250ZXh0IHByb2NlZWRzIHdoZW4gZmlsZUxvZ2dpbmcuZW5hYmxlZCBpcyBvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkgYXMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdGF3YWl0IGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcsIHRydWUpO1xuXG5cdFx0Y29uc3QgdHJvdWJsZXNob290QWdlbnQ6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGFzeW5jIGludm9rZShfcmVxdWVzdCwgcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfdG9rZW4pIHtcblx0XHRcdFx0cHJvZ3Jlc3MoW3sga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnVHJvdWJsZXNob290aW5nIGNvbXBsZXRlJykgfV0pO1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoJ3Ryb3VibGVzaG9vdEFnZW50MicsIHsgLi4uZ2V0QWdlbnREYXRhKCd0cm91Ymxlc2hvb3RBZ2VudDInKSwgaXNEZWZhdWx0OiB0cnVlIH0pKTtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKCd0cm91Ymxlc2hvb3RBZ2VudDInLCB0cm91Ymxlc2hvb3RBZ2VudCkpO1xuXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGVzdERpc3Bvc2FibGVzLmFkZChzdGFydFNlc3Npb25Nb2RlbCh0ZXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXG5cdFx0Y29uc3Qgc2tpbGxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ09QSUxPVF9TS0lMTF9VUklfU0NIRU1FLCBwYXRoOiBUUk9VQkxFU0hPT1RfU0tJTExfUEFUSCB9KTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ2ludmVzdGlnYXRlIHRoaXMgaXNzdWUnLCB7XG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IFt7XG5cdFx0XHRcdGlkOiAndHJvdWJsZXNob290LXNraWxsJyxcblx0XHRcdFx0bmFtZTogJ3Ryb3VibGVzaG9vdCcsXG5cdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0dmFsdWU6IHNraWxsVXJpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0Q2hhdFNlbmRSZXN1bHQuYXNzZXJ0U2VudChyZXNwb25zZSk7XG5cdFx0YXdhaXQgcmVzcG9uc2UuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCByZXNwb25zZUNvbnRlbnQgPSByZXF1ZXN0c1swXS5yZXNwb25zZT8ucmVzcG9uc2UudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQub2soIXJlc3BvbnNlQ29udGVudD8uaW5jbHVkZXMoQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcpLCAnUmVzcG9uc2Ugc2hvdWxkIG5vdCBjb250YWluIHRoZSBzZXR0aW5ncyBnYXRlIG1lc3NhZ2UnKTtcblx0fSk7XG5cblx0dGVzdCgnc3dpdGNoaW5nIGJldHdlZW4gc2Vzc2lvbnMgZGlzcG9zZXMgcHJldmlvdXMgbW9kZWxzIGFuZCByZWxlYXNlcyBhbGwgcmVmZXJlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHQvLyBDcmVhdGUgMyBzZXNzaW9ucyB3aXRoIHNvbWUgY29udGVudFxuXHRcdGNvbnN0IHNlc3Npb25zOiB7IHJlc291cmNlOiBVUkk7IHJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB9W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVmID0gdGVzdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0bW9kZWwuYWRkUmVxdWVzdCh7IHBhcnRzOiBbXSwgdGV4dDogYHJlcXVlc3QgaW4gc2Vzc2lvbiAke2l9YCB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0XHRzZXNzaW9ucy5wdXNoKHsgcmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgcmVmIH0pO1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgYWxsIHNlc3Npb25zIHNvIHRoZXkgY2FuIGJlIHJlc3RvcmVkIGxhdGVyXG5cdFx0Zm9yIChjb25zdCBzIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRzLnJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0Ly8gVmVyaWZ5IGFsbCBtb2RlbHMgYXJlIGRpc3Bvc2VkXG5cdFx0Zm9yIChjb25zdCBzIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzLnJlc291cmNlKSwgdW5kZWZpbmVkLCBgU2Vzc2lvbiAke3MucmVzb3VyY2V9IHNob3VsZCBiZSBkaXNwb3NlZCBhZnRlciByZWYgcmVsZWFzZWApO1xuXHRcdH1cblxuXHRcdC8vIE5vdyBzaW11bGF0ZSBcImNsaWNraW5nIHRocm91Z2ggc2Vzc2lvbnNcIiBcdTIwMTQgbG9hZCBlYWNoIG9uZSwgc3dpdGNoIHRvIG5leHRcblx0XHQvLyBUaGlzIG1pbWljcyBjaGF0Vmlld1BhbmUubG9hZFNlc3Npb24oKSBwYXR0ZXJuOiBhY3F1aXJlIG5ldywgcmVsZWFzZSBvbGRcblx0XHRsZXQgY3VycmVudFJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHMgb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IG5ld1JlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHMucmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICd0ZXN0I3N3aXRjaCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKG5ld1JlZiwgYFNob3VsZCBiZSBhYmxlIHRvIHJlc3RvcmUgc2Vzc2lvbiAke3MucmVzb3VyY2V9YCk7XG5cblx0XHRcdC8vIFJlbGVhc2Ugb2xkIHJlZiAobGlrZSBDaGF0Vmlld1BhbmUuc2hvd01vZGVsIGRvZXMpXG5cdFx0XHRjdXJyZW50UmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRjdXJyZW50UmVmID0gbmV3UmVmO1xuXHRcdH1cblxuXHRcdC8vIEF0IHRoaXMgcG9pbnQsIG9ubHkgdGhlIGxhc3Qgc2Vzc2lvbiBzaG91bGQgaGF2ZSBhIGxpdmUgbW9kZWxcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0XHRjb25zdCBkZWJ1Z0luZm8gPSB0ZXN0U2VydmljZS5nZXRDaGF0TW9kZWxSZWZlcmVuY2VEZWJ1Z0luZm8oKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvdGFsTW9kZWxzOiBkZWJ1Z0luZm8udG90YWxNb2RlbHMsXG5cdFx0XHR0b3RhbFJlZmVyZW5jZXM6IGRlYnVnSW5mby50b3RhbFJlZmVyZW5jZXMsXG5cdFx0XHRtb2RlbHM6IGRlYnVnSW5mby5tb2RlbHMubWFwKG0gPT4gKHtcblx0XHRcdFx0cmVzb3VyY2U6IG0uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlZkNvdW50OiBtLnJlZmVyZW5jZUNvdW50LFxuXHRcdFx0XHRob2xkZXJzOiBtLmhvbGRlcnMsXG5cdFx0XHRcdHBlbmRpbmdEaXNwb3NhbDogbS5wZW5kaW5nRGlzcG9zYWwsXG5cdFx0XHRcdGNyZWF0ZWRCeTogbS5jcmVhdGVkQnksXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0dG90YWxNb2RlbHM6IDEsXG5cdFx0XHR0b3RhbFJlZmVyZW5jZXM6IDEsXG5cdFx0XHRtb2RlbHM6IFt7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uc1syXS5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRyZWZDb3VudDogMSxcblx0XHRcdFx0aG9sZGVyczogW3sgaG9sZGVyOiAndGVzdCNzd2l0Y2gnLCBjb3VudDogMSB9XSxcblx0XHRcdFx0cGVuZGluZ0Rpc3Bvc2FsOiBmYWxzZSxcblx0XHRcdFx0Y3JlYXRlZEJ5OiAndGVzdCNzd2l0Y2gnLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnSW5mby5tb2RlbHNbMF0uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25zWzJdLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHQnVGhlIGxpdmUgbW9kZWwgc2hvdWxkIGJlIHRoZSBsYXN0IHNlc3Npb24gd2Ugc3dpdGNoZWQgdG8nKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgZmlyc3QgdHdvIHNlc3Npb25zJyBtb2RlbHMgYXJlIGdvbmVcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uc1swXS5yZXNvdXJjZSksIHVuZGVmaW5lZCwgJ1Nlc3Npb24gMCBtb2RlbCBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uc1sxXS5yZXNvdXJjZSksIHVuZGVmaW5lZCwgJ1Nlc3Npb24gMSBtb2RlbCBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQub2sodGVzdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uc1syXS5yZXNvdXJjZSksICdTZXNzaW9uIDIgbW9kZWwgc2hvdWxkIHN0aWxsIGJlIGFsaXZlJyk7XG5cblx0XHRjdXJyZW50UmVmIS5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpb3VzTW9kZWxSZWYgcGF0dGVybiBpbiBDaGF0Vmlld1BhbmUgZG9lcyBub3QgY2F1c2UgZG91YmxlLXJlZmVyZW5jZSByZXRlbnRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIDMgc2Vzc2lvbnNcblx0XHRjb25zdCBzZXNzaW9uczogeyByZXNvdXJjZTogVVJJIH1bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XG5cdFx0XHRjb25zdCByZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRtb2RlbC5hZGRSZXF1ZXN0KHsgcGFydHM6IFtdLCB0ZXh0OiBgcmVxdWVzdCAke2l9YCB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0XHRzZXNzaW9ucy5wdXNoKHsgcmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSB9KTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0Ly8gU2ltdWxhdGUgdGhlIENoYXRWaWV3UGFuZS5fcHJldmlvdXNNb2RlbFJlZiBwYXR0ZXJuOlxuXHRcdC8vIHNob3dNb2RlbCgpIGRvZXM6XG5cdFx0Ly8gICB0aGlzLl9wcmV2aW91c01vZGVsUmVmLnZhbHVlID0gdGhpcy5tb2RlbFJlZi52YWx1ZTsgIC8vIDwtLSBzdG9yZXMgcmVmXG5cdFx0Ly8gICB0aGlzLm1vZGVsUmVmLnZhbHVlID0gdW5kZWZpbmVkOyAgICAgICAgICAgICAgICAgICAgICAvLyA8LS0gZGlzcG9zZXMgc2FtZSByZWYhXG5cdFx0Ly8gVGhpcyBzaG91bGQgTk9UIGNhdXNlIHRoZSBtb2RlbCB0byBzdGF5IGFsaXZlIGJlY2F1c2UgdGhlXG5cdFx0Ly8gTXV0YWJsZURpc3Bvc2FibGUgc2V0dGVyIGRpc3Bvc2VzIHRoZSBvbGQgdmFsdWUgYWZ0ZXIgYXNzaWduaW5nIHRoZSBuZXcgb25lLlxuXG5cdFx0Ly8gTG9hZCBzZXNzaW9uIDBcblx0XHRjb25zdCByZWYwID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvbnNbMF0ucmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlZjApO1xuXG5cdFx0Ly8gXCJTd2l0Y2hcIiB0byBzZXNzaW9uIDEgdXNpbmcgdGhlIGJ1Z2d5IHBhdHRlcm5cblx0XHRjb25zdCBwcmV2aW91c1JlZiA9IHJlZjA7IC8vIHNhdmUgcmVmZXJlbmNlIChsaWtlIF9wcmV2aW91c01vZGVsUmVmLnZhbHVlID0gbW9kZWxSZWYudmFsdWUpXG5cdFx0Ly8gTm93IGRpc3Bvc2UgdGhlIHJlZiAobGlrZSBtb2RlbFJlZi52YWx1ZSA9IHVuZGVmaW5lZCB3aGljaCBkaXNwb3NlcyB2aWEgc2V0dGVyKVxuXHRcdHJlZjAuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gVGhlIHByZXZpb3VzUmVmIElTIHJlZjAgXHUyMDE0IHNhbWUgb2JqZWN0LiBJdCdzIG5vdyBkaXNwb3NlZC5cblx0XHQvLyBTbyBwcmV2aW91c1JlZiBpcyBob2xkaW5nIGEgZGVhZCByZWZlcmVuY2UuXG5cblx0XHQvLyBMb2FkIHNlc3Npb24gMVxuXHRcdGNvbnN0IHJlZjEgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uc1sxXS5yZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ3Rlc3QnKTtcblx0XHRhc3NlcnQub2socmVmMSk7XG5cblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdC8vIFNlc3Npb24gMCBzaG91bGQgYmUgZGlzcG9zZWQgYmVjYXVzZSBpdHMgcmVmIHdhcyBkaXNwb3NlZCBhbmRcblx0XHQvLyBwcmV2aW91c1JlZiBpcyB0aGUgc2FtZSBvYmplY3QgKGFsc28gZGlzcG9zZWQpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvbnNbMF0ucmVzb3VyY2UpLCB1bmRlZmluZWQsXG5cdFx0XHQnU2Vzc2lvbiAwIHNob3VsZCBiZSBkaXNwb3NlZCAtLSB0aGUgXCJwcmV2aW91cyByZWZcIiBwYXR0ZXJuIGRpZCBub3Qga2VlcCBpdCBhbGl2ZScpO1xuXG5cdFx0Ly8gT25seSBzZXNzaW9uIDEgc2hvdWxkIGJlIGFsaXZlXG5cdFx0Y29uc3QgZGVidWdJbmZvID0gdGVzdFNlcnZpY2UuZ2V0Q2hhdE1vZGVsUmVmZXJlbmNlRGVidWdJbmZvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnSW5mby50b3RhbE1vZGVscywgMSwgJ09ubHkgc2Vzc2lvbiAxIHNob3VsZCBiZSBhbGl2ZScpO1xuXG5cdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0Ly8gQ2xlYW4gdXAgcHJldmlvdXNSZWYgXHUyMDE0IGl0J3MgYWxyZWFkeSBkaXNwb3NlZCwgY2FsbGluZyBhZ2FpbiBzaG91bGQgYmUgYSBuby1vcFxuXHRcdHByZXZpb3VzUmVmLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplciBfcHJldmlvdXMgZmllbGQgZG9lcyBub3QgcmV0YWluIGRhdGEgYWZ0ZXIgbW9kZWwgZGlzcG9zYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2Vzc2lvbiB3aXRoIGNvbnRlbnRcblx0XHRjb25zdCByZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IG1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRtb2RlbC5hZGRSZXF1ZXN0KHsgcGFydHM6IFtdLCB0ZXh0OiAnc29tZSByZXF1ZXN0IHdpdGggZGF0YScgfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0Ly8gRm9yY2Ugc2VyaWFsaXphdGlvbiB0byBwb3B1bGF0ZSBkYXRhU2VyaWFsaXplci5fcHJldmlvdXNcblx0XHQvLyAoaGFwcGVucyBpbiB3aWxsRGlzcG9zZU1vZGVsKVxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHQvLyBNb2RlbCBzaG91bGQgYmUgZ29uZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBSZXN0b3JlIGFuZCBkaXNwb3NlIGFnYWluIHRvIHZlcmlmeSBjbGVhbiBkaXNwb3NhbCBjeWNsZVxuXHRcdGNvbnN0IHJlZjIgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0Lm9rKHJlZjIpO1xuXHRcdGNvbnN0IG1vZGVsMiA9IHJlZjIub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRhc3NlcnQub2sobW9kZWwyLmRhdGFTZXJpYWxpemVyLCAnUmVzdG9yZWQgbW9kZWwgc2hvdWxkIGhhdmUgYSBkYXRhU2VyaWFsaXplcicpO1xuXG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSwgdW5kZWZpbmVkLCAnTW9kZWwgc2hvdWxkIGJlIGRpc3Bvc2VkIGFmdGVyIHNlY29uZCBjeWNsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBiZWNvbWVzIHVucmVhY2hhYmxlIGFmdGVyIGFsbCByZWZlcmVuY2VzIHJlbGVhc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdC8vIENyZWF0ZSBhIHNlc3Npb24gd2l0aCBub24tdHJpdmlhbCBjb250ZW50IHRvIHRyYWNrXG5cdFx0Y29uc3QgcmVmID0gdGVzdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0bGV0IG1vZGVsOiBDaGF0TW9kZWwgfCB1bmRlZmluZWQgPSByZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBtb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0bW9kZWwuYWRkUmVxdWVzdCh7IHBhcnRzOiBbXSwgdGV4dDogJ2EgcmVxdWVzdCcgfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0Ly8gVXNlIFdlYWtSZWYgdG8gZGV0ZWN0IEdDXG5cdFx0Y29uc3Qgd2Vha01vZGVsID0gbmV3IFdlYWtSZWYobW9kZWwpO1xuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgcmVmZXJlbmNlIGFuZCBjbGVhciB0aGUgbG9jYWwgc3Ryb25nIHJlZmVyZW5jZVxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0bW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHQvLyBNb2RlbCBzaG91bGQgbm90IGJlIGluIHRoZSBzdG9yZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSksIHVuZGVmaW5lZCwgJ01vZGVsIHNob3VsZCBiZSBnb25lIGZyb20gc3RvcmUnKTtcblxuXHRcdC8vIFRoZSByZWZlcmVuY2UgZGVidWcgc25hcHNob3Qgc2hvdWxkIHNob3cgbm8gbW9kZWxzXG5cdFx0Y29uc3QgZGVidWdJbmZvID0gdGVzdFNlcnZpY2UuZ2V0Q2hhdE1vZGVsUmVmZXJlbmNlRGVidWdJbmZvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlYnVnSW5mby50b3RhbE1vZGVscywgMCwgJ05vIG1vZGVscyBzaG91bGQgYmUgdHJhY2tlZCcpO1xuXG5cdFx0Ly8gRm9yY2UgR0MgYW5kIGNoZWNrIHdlYWsgcmVmXG5cdFx0aWYgKHR5cGVvZiBnbG9iYWxUaGlzLmdjID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRnbG9iYWxUaGlzLmdjKCk7XG5cdFx0XHQvLyBBZnRlciBHQywgdGhlIHdlYWsgcmVmZXJlbmNlIHNob3VsZCBiZSBjbGVhcmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2Vha01vZGVsLmRlcmVmKCksIHVuZGVmaW5lZCwgJ01vZGVsIHNob3VsZCBiZSBHQ1xcJ2QgYWZ0ZXIgYWxsIHJlZmVyZW5jZXMgcmVsZWFzZWQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JhcGlkIHNlc3Npb24gc3dpdGNoaW5nIGFjY3VtdWxhdGVzIGF0IG1vc3QgMiBsaXZlIG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHQvLyBDcmVhdGUgNSBzZXNzaW9ucyB3aXRoIGNvbnRlbnRcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRjb25zdCByZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRtb2RlbC5hZGRSZXF1ZXN0KHsgcGFydHM6IFtdLCB0ZXh0OiBgc2Vzc2lvbiAke2l9IHJlcXVlc3RgIH0sIHsgdmFyaWFibGVzOiBbXSB9LCAwKTtcblx0XHRcdHNlc3Npb25SZXNvdXJjZXMucHVzaChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHQvLyBOb3cgcmFwaWRseSBzd2l0Y2ggdGhyb3VnaCBhbGwgc2Vzc2lvbnMgd2l0aG91dCB3YWl0aW5nIGZvciBkaXNwb3NhbFxuXHRcdGxldCBjdXJyZW50UmVmOiBJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2Ygc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0Y29uc3QgbmV3UmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICd0ZXN0I3JhcGlkJyk7XG5cdFx0XHRhc3NlcnQub2sobmV3UmVmKTtcblx0XHRcdGN1cnJlbnRSZWY/LmRpc3Bvc2UoKTtcblx0XHRcdGN1cnJlbnRSZWYgPSBuZXdSZWY7XG5cdFx0fVxuXG5cdFx0Ly8gQWZ0ZXIgd2FpdGluZyBmb3IgZGlzcG9zYWxzLCBzaG91bGQgYmUgZXhhY3RseSAxXG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdFx0Y29uc3QgZmluYWxEZWJ1Z0luZm8gPSB0ZXN0U2VydmljZS5nZXRDaGF0TW9kZWxSZWZlcmVuY2VEZWJ1Z0luZm8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluYWxEZWJ1Z0luZm8udG90YWxNb2RlbHMsIDEsICdTaG91bGQgaGF2ZSBleGFjdGx5IDEgbW9kZWwgYWZ0ZXIgd2FpdGluZyBmb3IgZGlzcG9zYWxzJyk7XG5cblx0XHRjdXJyZW50UmVmIS5kaXNwb3NlKCk7XG5cdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsb2FkUmVtb3RlU2Vzc2lvbiBwcm9ncmVzcyBzdHJlYW1pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVtb3RlU2NoZW1lID0gJ3JlbW90ZS1zdHJlYW1pbmctdGVzdCc7XG5cblx0XHRpbnRlcmZhY2UgSVByb3ZpZGVkU2Vzc2lvbk9wdGlvbnMge1xuXHRcdFx0cmVhZG9ubHkgcHJvZ3Jlc3NPYnM/OiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0UHJvZ3Jlc3NbXT47XG5cdFx0XHRyZWFkb25seSBpc0NvbXBsZXRlT2JzPzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0XHRcdHJlYWRvbmx5IGlzUmVhZE9ubHk/OiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRcdFx0cmVhZG9ubHkgaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjaz86ICgpID0+IFByb21pc2U8Ym9vbGVhbj47XG5cdFx0XHRyZWFkb25seSBvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdD86IEV2ZW50PElDaGF0U2Vzc2lvblNlcnZlclJlcXVlc3Q+O1xuXHRcdFx0cmVhZG9ubHkgaGlzdG9yeT86IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW107XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0dXBSZW1vdGVQcm92aWRlcihvcHRzOiBJUHJvdmlkZWRTZXNzaW9uT3B0aW9ucyk6IHsgcmVzb3VyY2U6IFVSSTsgcHJvdmlkZWQ6IElDaGF0U2Vzc2lvbiB9IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHJlbW90ZVNjaGVtZSwgcGF0aDogJy9zZXNzaW9uLScgKyBnZW5lcmF0ZUlkKCkgfSk7XG5cdFx0XHRjb25zdCBtb2NrU2Vzc2lvbnNTZXJ2aWNlID0gbmV3IE1vY2tDaGF0U2Vzc2lvbnNTZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBtb2NrU2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQocmVtb3RlU2NoZW1lLCB7IC4uLmdldEFnZW50RGF0YShyZW1vdGVTY2hlbWUpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihyZW1vdGVTY2hlbWUsIHsgYXN5bmMgaW52b2tlKCkgeyByZXR1cm4ge307IH0gfSkpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlZDogSUNoYXRTZXNzaW9uID0ge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0XHRoaXN0b3J5OiBvcHRzLmhpc3RvcnkgPz8gW3sgdHlwZTogJ3JlcXVlc3QnLCBwcm9tcHQ6ICdoZWxsbycsIHBhcnRpY2lwYW50OiByZW1vdGVTY2hlbWUgfV0sXG5cdFx0XHRcdG9uV2lsbERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdHByb2dyZXNzT2JzOiBvcHRzLnByb2dyZXNzT2JzLFxuXHRcdFx0XHRpc0NvbXBsZXRlT2JzOiBvcHRzLmlzQ29tcGxldGVPYnMsXG5cdFx0XHRcdGlzUmVhZE9ubHk6IG9wdHMuaXNSZWFkT25seSxcblx0XHRcdFx0aW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjazogb3B0cy5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrLFxuXHRcdFx0XHRvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdDogb3B0cy5vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdCxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0fTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQobW9ja1Nlc3Npb25zU2VydmljZS5yZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKHJlbW90ZVNjaGVtZSwge1xuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50OiAoKSA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZWQpLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZSwgcHJvdmlkZWQgfTtcblx0XHR9XG5cblx0XHRsZXQgaWRDb3VudGVyID0gMDtcblx0XHRmdW5jdGlvbiBnZW5lcmF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gYCR7RGF0ZS5ub3coKX0tJHtpZENvdW50ZXIrK31gO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2NvbnRyaWJ1dGVkIHNlc3Npb24gcmVhZC1vbmx5IHN0YXRlIGlzIHByZXNlcnZlZCBvbiB0aGUgY2hhdCBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2lzUmVhZE9ubHknLCB0cnVlKTtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoeyBpc1JlYWRPbmx5IH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdFx0Y29uc3Qgc2VuZFJlc3VsdCA9IGF3YWl0IHRlc3RTZXJ2aWNlLnNlbmRSZXF1ZXN0KHJlc291cmNlLCAnRG8gbm90IHNlbmQnKTtcblx0XHRcdGNvbnN0IHN0YXRlcyA9IFtyZWYub2JqZWN0LmlzUmVhZE9ubHkuZ2V0KCldO1xuXHRcdFx0aXNSZWFkT25seS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdGF0ZXMucHVzaChyZWYub2JqZWN0LmlzUmVhZE9ubHkuZ2V0KCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc3RhdGVzLCBzZW5kUmVzdWx0IH0sIHtcblx0XHRcdFx0c3RhdGVzOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRzZW5kUmVzdWx0OiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1Nlc3Npb24gaXMgcmVhZC1vbmx5JyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyByZXF1ZXN0IHRpbWVzdGFtcHMgZnJvbSByZW1vdGUgc2Vzc2lvbiBoaXN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZXN0YW1wID0gMV83NTJfMDEyXzMyMV8wMDA7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRBdCA9IHRpbWVzdGFtcCArIDJfNTAwO1xuXHRcdFx0Y29uc3QgeyByZXNvdXJjZSB9ID0gc2V0dXBSZW1vdGVQcm92aWRlcih7XG5cdFx0XHRcdGhpc3Rvcnk6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnaGVsbG8nLCBwYXJ0aWNpcGFudDogcmVtb3RlU2NoZW1lLCB0aW1lc3RhbXAgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIHBhcnRzOiBbXSwgcGFydGljaXBhbnQ6IHJlbW90ZVNjaGVtZSwgZWxhcHNlZE1zOiAyXzUwMCwgY29tcGxldGVkQXQgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRpbWVzdGFtcDogcmVmLm9iamVjdC5nZXRSZXF1ZXN0cygpWzBdLnRpbWVzdGFtcCxcblx0XHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogcmVmLm9iamVjdC5nZXRSZXF1ZXN0cygpWzBdLnJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRcdGVsYXBzZWRNczogcmVmLm9iamVjdC5nZXRSZXF1ZXN0cygpWzBdLnJlc3BvbnNlPy5lbGFwc2VkTXMsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiByZWYub2JqZWN0LmdldFJlcXVlc3RzKClbMF0ucmVzcG9uc2U/LmNvbXBsZXRlZEF0LFxuXHRcdFx0XHRjb21wbGV0aW9uVGltZXN0YW1wOiByZWYub2JqZWN0LmdldFJlcXVlc3RzKClbMF0ucmVzcG9uc2U/LmNvbXBsZXRpb25UaW1lc3RhbXAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRpbWVzdGFtcCxcblx0XHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogdGltZXN0YW1wLFxuXHRcdFx0XHRlbGFwc2VkTXM6IDJfNTAwLFxuXHRcdFx0XHRjb21wbGV0ZWRBdCxcblx0XHRcdFx0Y29tcGxldGlvblRpbWVzdGFtcDogY29tcGxldGVkQXQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGRpc3BsYXkgdGltZSB1bmtub3duIHdoZW4gcmVtb3RlIHNlc3Npb24gaGlzdG9yeSBwcmVkYXRlcyB0aW1lc3RhbXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gRGF0ZS5ub3coKTtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRoaXN0b3J5OiBbeyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ2hlbGxvJywgcGFydGljaXBhbnQ6IHJlbW90ZVNjaGVtZSB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHJlZi5vYmplY3QuZ2V0UmVxdWVzdHMoKVswXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoYXNDdXJyZW50UmVjZW5jeUZhbGxiYWNrOiByZXF1ZXN0LnRpbWVzdGFtcCA+PSBiZWZvcmUgJiYgcmVxdWVzdC50aW1lc3RhbXAgPD0gRGF0ZS5ub3coKSxcblx0XHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogcmVxdWVzdC5yZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0XHRjb21wbGV0aW9uVGltZXN0YW1wOiByZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0aW9uVGltZXN0YW1wLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRoYXNDdXJyZW50UmVjZW5jeUZhbGxiYWNrOiB0cnVlLFxuXHRcdFx0XHRyZXF1ZXN0VGltZXN0YW1wOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbXBsZXRpb25UaW1lc3RhbXA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyBsZWdhY3kgcmVtb3RlIHRpbWVzdGFtcCBzZW50aW5lbHMgdG8gdW5rbm93bicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRoaXN0b3J5OiBbeyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ2hlbGxvJywgcGFydGljaXBhbnQ6IHJlbW90ZVNjaGVtZSwgdGltZXN0YW1wOiAtMSB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcXVlc3RUaW1lc3RhbXA6IHJlZi5vYmplY3QuZ2V0UmVxdWVzdHMoKVswXS5yZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0XHRzZXJpYWxpemVkVGltZXN0YW1wOiByZWYub2JqZWN0LnRvSlNPTigpLnJlcXVlc3RzWzBdLnRpbWVzdGFtcCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVxdWVzdFRpbWVzdGFtcDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXJpYWxpemVkVGltZXN0YW1wOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIEFnZW50IEhvc3QgdGltZXN0YW1wIGZvciBsaXZlIHNlcnZlci1pbml0aWF0ZWQgcmVxdWVzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdCA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uU2VydmVyUmVxdWVzdD4oKSk7XG5cdFx0XHRjb25zdCB0aW1lc3RhbXAgPSAxXzc1Ml8wMTJfMzIxXzAwMDtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm9ncmVzc09iczogb2JzZXJ2YWJsZVZhbHVlPElDaGF0UHJvZ3Jlc3NbXT4oJ3Byb2dyZXNzJywgW10pLFxuXHRcdFx0XHRpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0XHRvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdDogb25EaWRTdGFydFNlcnZlclJlcXVlc3QuZXZlbnQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cdFx0XHRvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdC5maXJlKHsgaWQ6ICd0dXJuLTEnLCBwcm9tcHQ6ICdzZXJ2ZXIgcmVxdWVzdCcsIHRpbWVzdGFtcCB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1lc3NhZ2U6IHJlZi5vYmplY3QubGFzdFJlcXVlc3Q/Lm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0dGltZXN0YW1wOiByZWYub2JqZWN0Lmxhc3RSZXF1ZXN0Py50aW1lc3RhbXAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1lc3NhZ2U6ICdzZXJ2ZXIgcmVxdWVzdCcsXG5cdFx0XHRcdHRpbWVzdGFtcCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRvcHRzIHRoZSBBZ2VudCBIb3N0IHR1cm4gaWQgZm9yIGxpdmUgc2VydmVyLWluaXRpYXRlZCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG9uRGlkU3RhcnRTZXJ2ZXJSZXF1ZXN0ID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25TZXJ2ZXJSZXF1ZXN0PigpKTtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRoaXN0b3J5OiBbeyBpZDogJ3R1cm4tMScsIHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnaGVsbG8nLCBwYXJ0aWNpcGFudDogcmVtb3RlU2NoZW1lIH1dLFxuXHRcdFx0XHRwcm9ncmVzc09iczogb2JzZXJ2YWJsZVZhbHVlPElDaGF0UHJvZ3Jlc3NbXT4oJ3Byb2dyZXNzJywgW10pLFxuXHRcdFx0XHRpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdFx0XHRvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdDogb25EaWRTdGFydFNlcnZlclJlcXVlc3QuZXZlbnQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cdFx0XHRvbkRpZFN0YXJ0U2VydmVyUmVxdWVzdC5maXJlKHsgaWQ6ICd0dXJuLTInLCBwcm9tcHQ6ICdzZXJ2ZXIgcmVxdWVzdCcgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVmLm9iamVjdC5nZXRSZXF1ZXN0cygpLm1hcChyID0+ICh7IGlkOiByLmlkLCBtZXNzYWdlOiByLm1lc3NhZ2UudGV4dCB9KSksIFtcblx0XHRcdFx0eyBpZDogJ3R1cm4tMScsIG1lc3NhZ2U6ICdoZWxsbycgfSxcblx0XHRcdFx0eyBpZDogJ3R1cm4tMicsIG1lc3NhZ2U6ICdzZXJ2ZXIgcmVxdWVzdCcgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxyZWFkeS1jb21wbGV0ZSBzZXNzaW9uIGF0IGxvYWQgdGltZTogbm8gaW5pdGlhbCBwZW5kaW5nIHJlcXVlc3QsIHJlc3BvbnNlIGlzIGNvbXBsZXRlZCB2aWEgYXV0b3J1bicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2dyZXNzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0UHJvZ3Jlc3NbXT4oJ3Byb2dyZXNzJywgW10pO1xuXHRcdFx0Y29uc3QgaXNDb21wbGV0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb21wbGV0ZScsIHRydWUpO1xuXHRcdFx0bGV0IGludGVycnVwdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm9ncmVzc09icyxcblx0XHRcdFx0aXNDb21wbGV0ZU9icyxcblx0XHRcdFx0aW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjazogYXN5bmMgKCkgPT4geyBpbnRlcnJ1cHRDYWxscysrOyByZXR1cm4gdHJ1ZTsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmKTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gbW9kZWwubGFzdFJlcXVlc3QhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RSZXF1ZXN0LnJlc3BvbnNlPy5pc0NvbXBsZXRlLCB0cnVlLCAnUmVzcG9uc2Ugc2hvdWxkIGJlIGNvbXBsZXRlZCB0aHJvdWdoIHRoZSBpc0NvbXBsZXRlIGF1dG9ydW4nKTtcblxuXHRcdFx0Ly8gTm8gcGVuZGluZyByZXF1ZXN0IHNob3VsZCBleGlzdCBcdTIwMTQgY2FuY2VsbGluZyBpcyBhIG5vb3AgYW5kIG11c3Qgbm90IGNhbGwgdGhlIGludGVycnVwdCBjYWxsYmFjay5cblx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihyZXNvdXJjZSwgJ3Rlc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnRlcnJ1cHRDYWxscywgMCwgJ0ludGVycnVwdCBjYWxsYmFjayBzaG91bGQgbm90IGJlIGludm9rZWQgd2hlbiB0aGVyZSBpcyBubyBwZW5kaW5nIHJlcXVlc3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZSBzZXNzaW9uIGF0IGxvYWQgdGltZTogY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uIGludm9rZXMgdGhlIGludGVycnVwdCBjYWxsYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2dyZXNzT2JzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0UHJvZ3Jlc3NbXT4oJ3Byb2dyZXNzJywgW10pO1xuXHRcdFx0Y29uc3QgaXNDb21wbGV0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb21wbGV0ZScsIGZhbHNlKTtcblx0XHRcdGxldCBpbnRlcnJ1cHRDYWxscyA9IDA7XG5cdFx0XHRjb25zdCB7IHJlc291cmNlIH0gPSBzZXR1cFJlbW90ZVByb3ZpZGVyKHtcblx0XHRcdFx0cHJvZ3Jlc3NPYnMsXG5cdFx0XHRcdGlzQ29tcGxldGVPYnMsXG5cdFx0XHRcdGludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2s6IGFzeW5jICgpID0+IHsgaW50ZXJydXB0Q2FsbHMrKzsgcmV0dXJuIHRydWU7IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NvbXBsZXRlLCBmYWxzZSwgJ1Jlc3BvbnNlIG11c3Qgc3RheSBvcGVuIHdoaWxlIHNlc3Npb24gaXMgYWN0aXZlJyk7XG5cblx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihyZXNvdXJjZSwgJ3Rlc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnRlcnJ1cHRDYWxscywgMSwgJ0ludGVycnVwdCBjYWxsYmFjayBzaG91bGQgYmUgaW52b2tlZCBvbmNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFuc2l0aW9uIG9mIGlzQ29tcGxldGVPYnMgdG8gdHJ1ZSBjbGVhcnMgcGVuZGluZyByZXF1ZXN0IGFuZCBjb21wbGV0ZXMgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9ncmVzc09icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFByb2dyZXNzW10+KCdwcm9ncmVzcycsIFtdKTtcblx0XHRcdGNvbnN0IGlzQ29tcGxldGVPYnMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ2lzQ29tcGxldGUnLCBmYWxzZSk7XG5cdFx0XHRsZXQgaW50ZXJydXB0Q2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgeyByZXNvdXJjZSB9ID0gc2V0dXBSZW1vdGVQcm92aWRlcih7XG5cdFx0XHRcdHByb2dyZXNzT2JzLFxuXHRcdFx0XHRpc0NvbXBsZXRlT2JzLFxuXHRcdFx0XHRpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBhc3luYyAoKSA9PiB7IGludGVycnVwdENhbGxzKys7IHJldHVybiB0cnVlOyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZWYpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSBtb2RlbC5sYXN0UmVxdWVzdCE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdFJlcXVlc3QucmVzcG9uc2U/LmlzQ29tcGxldGUsIGZhbHNlKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgc2VydmVyIGZpbmlzaGluZyB0aGUgdHVybi5cblx0XHRcdGlzQ29tcGxldGVPYnMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0UmVxdWVzdC5yZXNwb25zZT8uaXNDb21wbGV0ZSwgdHJ1ZSwgJ1Jlc3BvbnNlIHNob3VsZCBjb21wbGV0ZSB3aGVuIGlzQ29tcGxldGVPYnMgdHJhbnNpdGlvbnMgdG8gdHJ1ZScpO1xuXG5cdFx0XHQvLyBQZW5kaW5nIHJlcXVlc3QgZW50cnkgc2hvdWxkIG5vdyBiZSBnb25lIFx1MjAxNCBjYW5jZWwgbXVzdCBiZSBhIG5vb3AuXG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24ocmVzb3VyY2UsICd0ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW50ZXJydXB0Q2FsbHMsIDAsICdJbnRlcnJ1cHQgc2hvdWxkIG5vdCBmaXJlIGFmdGVyIHRoZSB0dXJuIGhhcyBjb21wbGV0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludGVycnVwdCBjYWxsYmFjayByZXR1cm5pbmcgZmFsc2UgaW5zdGFsbHMgYSBmcmVzaCBwZW5kaW5nIHJlcXVlc3Qgc28gY2FuY2VsIGNhbiBiZSByZXRyaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NPYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRQcm9ncmVzc1tdPigncHJvZ3Jlc3MnLCBbXSk7XG5cdFx0XHRjb25zdCBpc0NvbXBsZXRlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdpc0NvbXBsZXRlJywgZmFsc2UpO1xuXHRcdFx0Y29uc3QgaW50ZXJydXB0UmVzdWx0cyA9IFtmYWxzZSwgdHJ1ZV07XG5cdFx0XHRjb25zdCBpbnRlcnJ1cHRJbnZvY2F0aW9uczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm9ncmVzc09icyxcblx0XHRcdFx0aXNDb21wbGV0ZU9icyxcblx0XHRcdFx0aW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gaW50ZXJydXB0SW52b2NhdGlvbnMubGVuZ3RoO1xuXHRcdFx0XHRcdGludGVycnVwdEludm9jYXRpb25zLnB1c2goaW5kZXgpO1xuXHRcdFx0XHRcdHJldHVybiBpbnRlcnJ1cHRSZXN1bHRzW2luZGV4XSA/PyB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZWYpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYpO1xuXG5cdFx0XHQvLyBGaXJzdCBjYW5jZWw6IHVzZXIgcmVqZWN0cyB0aGUgaW50ZXJydXB0aW9uLCBzbyBhIG5ldyBwZW5kaW5nIHJlcXVlc3QgaXMgd2lyZWQgdXAuXG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24ocmVzb3VyY2UsICd0ZXN0LWZpcnN0Jyk7XG5cblx0XHRcdC8vIFNlY29uZCBjYW5jZWw6IHNob3VsZCBmaW5kIHRoZSBmcmVzaGx5LWluc3RhbGxlZCBwZW5kaW5nIHJlcXVlc3QgYW5kIGZpcmUgdGhlIGNhbGxiYWNrIGFnYWluLlxuXHRcdFx0YXdhaXQgdGVzdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHJlc291cmNlLCAndGVzdC1zZWNvbmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludGVycnVwdEludm9jYXRpb25zLmxlbmd0aCwgMiwgJ0ludGVycnVwdCBjYWxsYmFjayBzaG91bGQgYmUgaW52b2tlZCBvbiBib3RoIGNhbmNlbCBhdHRlbXB0cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLXN0cmVhbWluZyBzZXNzaW9uIHdpdGggaXNDb21wbGV0ZU9icz10cnVlIGF0IGxvYWQ6IHJlc3BvbnNlIGNvbXBsZXRlcyBzeW5jaHJvbm91c2x5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNDb21wbGV0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignaXNDb21wbGV0ZScsIHRydWUpO1xuXHRcdFx0Ly8gRGVsaWJlcmF0ZWx5IG5vIHByb2dyZXNzT2JzIC8gaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjayBcdTIwMTQgZmFsbHMgdGhyb3VnaCB0byB0aGUgbm9uLXN0cmVhbWluZyBicmFuY2guXG5cdFx0XHRjb25zdCB7IHJlc291cmNlIH0gPSBzZXR1cFJlbW90ZVByb3ZpZGVyKHsgaXNDb21wbGV0ZU9icyB9KTtcblxuXHRcdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBjcmVhdGVDaGF0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZik7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZik7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NvbXBsZXRlLCB0cnVlLCAnTm9uLXN0cmVhbWluZyBzZXNzaW9uIHNob3VsZCBjb21wbGV0ZSByZXNwb25zZSBhdCBsb2FkIHRpbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RyYWZ0IGlucHV0IGlzIHJlc3RvcmVkIGFmdGVyIGRpc3Bvc2luZyBhbmQgcmVsb2FkaW5nIGEgcmVtb3RlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHJlc291cmNlIH0gPSBzZXR1cFJlbW90ZVByb3ZpZGVyKHsgaGlzdG9yeTogW10gfSk7XG5cblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdFx0Ly8gTG9hZCB0aGUgc2Vzc2lvbiBhbmQgc2VlZCBhbiB1bnNlbnQgZHJhZnQgb24gaXRzIGlucHV0TW9kZWwuXG5cdFx0XHRjb25zdCByZWYxID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZjEsICdTaG91bGQgbG9hZCByZW1vdGUgc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwxID0gcmVmMS5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0bW9kZWwxLmlucHV0TW9kZWwuc2V0U3RhdGUoe1xuXHRcdFx0XHRpbnB1dFRleHQ6ICd1bnNlbnQgZHJhZnQnLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbeyBzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IDEsIHNlbGVjdGlvblN0YXJ0Q29sdW1uOiAxLCBwb3NpdGlvbkxpbmVOdW1iZXI6IDEsIHBvc2l0aW9uQ29sdW1uOiAxMiB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZWxlYXNlIHRoZSBvbmx5IHJlZmVyZW5jZSAtPiB3aWxsRGlzcG9zZU1vZGVsIHJ1bnMgYW5kIHBlcnNpc3RzIG1ldGFkYXRhLlxuXHRcdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdFx0Ly8gUmVsb2FkIHRoZSBzYW1lIHNlc3Npb24uIFRoZSBkcmFmdCBtdXN0IGJlIHJlc3RvcmVkIGZyb20gbWV0YWRhdGEuXG5cdFx0XHRjb25zdCByZWYyID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZjIsICdTaG91bGQgcmUtbG9hZCByZW1vdGUgc2Vzc2lvbicpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYyKTtcblx0XHRcdGNvbnN0IG1vZGVsMiA9IHJlZjIub2JqZWN0IGFzIENoYXRNb2RlbDtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gbW9kZWwyLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWQ/LmlucHV0VGV4dCwgJ3Vuc2VudCBkcmFmdCcsICdJbnB1dCB0ZXh0IHNob3VsZCBiZSByZXN0b3JlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZWQgZHJhZnQgdXNlcyB0aGUgc2Vzc2lvbiBoaXN0b3J5IG1vZGVsLCBub3QgdGhlIHBlcnNpc3RlZCAoc3RhbGUpIG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlNb2RlbElkID0gJ2hpc3RvcnktbW9kZWwnO1xuXHRcdFx0Y29uc3QgaGlzdG9yeU1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSA9IHtcblx0XHRcdFx0aWQ6IGhpc3RvcnlNb2RlbElkLCBuYW1lOiAnSGlzdG9yeSBNb2RlbCcsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnaGlzdG9yeScsXG5cdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfVxuXHRcdFx0fTtcblx0XHRcdC8vIFJlc29sdmUgb25seSB0aGUgbW9kZWwgdGhlIHNlc3Npb24gYWN0dWFsbHkgdXNlZCBpbiBpdHMgaGlzdG9yeS5cblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgTnVsbExhbmd1YWdlTW9kZWxzU2VydmljZSB7XG5cdFx0XHRcdG92ZXJyaWRlIGxvb2t1cExhbmd1YWdlTW9kZWwoaWQ6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0XHRyZXR1cm4gaWQgPT09IGhpc3RvcnlNb2RlbElkID8gaGlzdG9yeU1ldGFkYXRhIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXNvdXJjZSB9ID0gc2V0dXBSZW1vdGVQcm92aWRlcih7XG5cdFx0XHRcdGhpc3Rvcnk6IFt7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnaGVsbG8nLCBwYXJ0aWNpcGFudDogcmVtb3RlU2NoZW1lLCBtb2RlbElkOiBoaXN0b3J5TW9kZWxJZCB9XVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdFx0Ly8gTG9hZCwgdGhlbiBzZWVkIGFuIHVuc2VudCBkcmFmdCBBTkQgYSBzdGFsZSBtb2RlbCBzZWxlY3Rpb24gdGhhdCBtdXN0IE5PVCBzdXJ2aXZlIHJlbG9hZC5cblx0XHRcdGNvbnN0IHJlZjEgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmMSwgJ1Nob3VsZCBsb2FkIHJlbW90ZSBzZXNzaW9uJyk7XG5cdFx0XHQocmVmMS5vYmplY3QgYXMgQ2hhdE1vZGVsKS5pbnB1dE1vZGVsLnNldFN0YXRlKHtcblx0XHRcdFx0aW5wdXRUZXh0OiAndW5zZW50IGRyYWZ0Jyxcblx0XHRcdFx0c2VsZWN0ZWRNb2RlbDogeyBpZGVudGlmaWVyOiAnc3RhbGUtbW9kZWwnLCBtZXRhZGF0YTogeyAuLi5oaXN0b3J5TWV0YWRhdGEsIGlkOiAnc3RhbGUtbW9kZWwnLCBuYW1lOiAnU3RhbGUgTW9kZWwnIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRlc3RTZXJ2aWNlLndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0XHRjb25zdCByZWYyID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZjIsICdTaG91bGQgcmUtbG9hZCByZW1vdGUgc2Vzc2lvbicpO1xuXHRcdFx0dGVzdERpc3Bvc2FibGVzLmFkZChyZWYyKTtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gKHJlZjIub2JqZWN0IGFzIENoYXRNb2RlbCkuaW5wdXRNb2RlbC5zdGF0ZS5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgaW5wdXRUZXh0OiByZXN0b3JlZD8uaW5wdXRUZXh0LCBzZWxlY3RlZE1vZGVsOiByZXN0b3JlZD8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciB9LFxuXHRcdFx0XHR7IGlucHV0VGV4dDogJ3Vuc2VudCBkcmFmdCcsIHNlbGVjdGVkTW9kZWw6IGhpc3RvcnlNb2RlbElkIH0sXG5cdFx0XHRcdCdEcmFmdCB0ZXh0IGlzIHJlc3RvcmVkIGFuZCB0aGUgbW9kZWwgY29tZXMgZnJvbSBzZXNzaW9uIGhpc3RvcnksIG5vdCB0aGUgc3RhbGUgcGVyc2lzdGVkIHNlbGVjdGlvbidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlZCBkcmFmdCBrZWVwcyB0aGUgaGlzdG9yeSBtb2RlbCB3aGlsZSB0aGUgbGl2ZSBjYXRhbG9nIGlzIGNvbGQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoaXN0b3J5TW9kZWxJZCA9ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnO1xuXHRcdFx0Y29uc3QgaGlzdG9yeU1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSA9IHtcblx0XHRcdFx0aWQ6IGhpc3RvcnlNb2RlbElkLCBuYW1lOiAnR1BULTUuNiBTb2wnLCB2ZW5kb3I6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnZ3B0LTUuNi1zb2wnLFxuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6IHJlbW90ZVNjaGVtZSxcblx0XHRcdH07XG5cdFx0XHRsZXQgY2F0YWxvZ0xvYWRlZCA9IHRydWU7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIE51bGxMYW5ndWFnZU1vZGVsc1NlcnZpY2Uge1xuXHRcdFx0XHRvdmVycmlkZSBsb29rdXBMYW5ndWFnZU1vZGVsKGlkOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhdGFsb2dMb2FkZWQgJiYgaWQgPT09IGhpc3RvcnlNb2RlbElkID8gaGlzdG9yeU1ldGFkYXRhIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXNvdXJjZSB9ID0gc2V0dXBSZW1vdGVQcm92aWRlcih7XG5cdFx0XHRcdGhpc3Rvcnk6IFt7IHR5cGU6ICdyZXF1ZXN0JywgcHJvbXB0OiAnaGVsbG8nLCBwYXJ0aWNpcGFudDogcmVtb3RlU2NoZW1lLCBtb2RlbElkOiBoaXN0b3J5TW9kZWxJZCB9XVxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCByZWYxID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZjEsICdTaG91bGQgbG9hZCByZW1vdGUgc2Vzc2lvbicpO1xuXHRcdFx0KHJlZjEub2JqZWN0IGFzIENoYXRNb2RlbCkuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7XG5cdFx0XHRcdGlucHV0VGV4dDogJ3Vuc2VudCBkcmFmdCcsXG5cdFx0XHRcdHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogaGlzdG9yeU1vZGVsSWQsIG1ldGFkYXRhOiBoaXN0b3J5TWV0YWRhdGEgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVmMS5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdFx0Y2F0YWxvZ0xvYWRlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVmMiA9IGF3YWl0IHRlc3RTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhyZWYyLCAnU2hvdWxkIHJlLWxvYWQgcmVtb3RlIHNlc3Npb24nKTtcblx0XHRcdHRlc3REaXNwb3NhYmxlcy5hZGQocmVmMik7XG5cdFx0XHRjb25zdCByZXN0b3JlZCA9IChyZWYyLm9iamVjdCBhcyBDaGF0TW9kZWwpLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpbnB1dFRleHQ6IHJlc3RvcmVkPy5pbnB1dFRleHQsXG5cdFx0XHRcdHNlbGVjdGVkTW9kZWw6IHJlc3RvcmVkPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0XHR0YXJnZXQ6IHJlc3RvcmVkPy5zZWxlY3RlZE1vZGVsPy5tZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlucHV0VGV4dDogJ3Vuc2VudCBkcmFmdCcsXG5cdFx0XHRcdHNlbGVjdGVkTW9kZWw6IGhpc3RvcnlNb2RlbElkLFxuXHRcdFx0XHR0YXJnZXQ6IHJlbW90ZVNjaGVtZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZWQgZHJhZnQgcHJlc2VydmVzIHRoZSBtb2RlbCBjb25maWd1cmF0aW9uIChlZmZvcnQvY29udGV4dCkgb2YgdGhlIGhpc3RvcnkgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoaXN0b3J5TW9kZWxJZCA9ICdoaXN0b3J5LW1vZGVsJztcblx0XHRcdGNvbnN0IGhpc3RvcnlNZXRhZGF0YTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgPSB7XG5cdFx0XHRcdGlkOiBoaXN0b3J5TW9kZWxJZCwgbmFtZTogJ0hpc3RvcnkgTW9kZWwnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ2hpc3RvcnknLFxuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIE51bGxMYW5ndWFnZU1vZGVsc1NlcnZpY2Uge1xuXHRcdFx0XHRvdmVycmlkZSBsb29rdXBMYW5ndWFnZU1vZGVsKGlkOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdFx0cmV0dXJuIGlkID09PSBoaXN0b3J5TW9kZWxJZCA/IGhpc3RvcnlNZXRhZGF0YSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzb3VyY2UgfSA9IHNldHVwUmVtb3RlUHJvdmlkZXIoe1xuXHRcdFx0XHRoaXN0b3J5OiBbeyB0eXBlOiAncmVxdWVzdCcsIHByb21wdDogJ2hlbGxvJywgcGFydGljaXBhbnQ6IHJlbW90ZVNjaGVtZSwgbW9kZWxJZDogaGlzdG9yeU1vZGVsSWQgfV1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHRcdC8vIExvYWQsIHRoZW4gc2VlZCBhbiB1bnNlbnQgZHJhZnQgdG9nZXRoZXIgd2l0aCB0aGUgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gdGhlXG5cdFx0XHQvLyB1c2VyIHBpY2tlZCAoZS5nLiBoaWdoIHRoaW5raW5nIGVmZm9ydCArIDFNIGNvbnRleHQgd2luZG93KSBmb3IgdGhhdCBzYW1lIG1vZGVsLlxuXHRcdFx0Y29uc3QgbW9kZWxDb25maWd1cmF0aW9uID0geyB0aGlua2luZ0VmZm9ydDogJ2hpZ2gnLCBjb250ZXh0U2l6ZTogMV8wMDBfMDAwIH07XG5cdFx0XHRjb25zdCByZWYxID0gYXdhaXQgdGVzdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlZjEsICdTaG91bGQgbG9hZCByZW1vdGUgc2Vzc2lvbicpO1xuXHRcdFx0KHJlZjEub2JqZWN0IGFzIENoYXRNb2RlbCkuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7XG5cdFx0XHRcdGlucHV0VGV4dDogJ3Vuc2VudCBkcmFmdCcsXG5cdFx0XHRcdHNlbGVjdGVkTW9kZWw6IHsgaWRlbnRpZmllcjogaGlzdG9yeU1vZGVsSWQsIG1ldGFkYXRhOiBoaXN0b3J5TWV0YWRhdGEgfSxcblx0XHRcdFx0bW9kZWxDb25maWd1cmF0aW9uLFxuXHRcdFx0fSk7XG5cblx0XHRcdHJlZjEuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgdGVzdFNlcnZpY2Uud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHRcdGNvbnN0IHJlZjIgPSBhd2FpdCB0ZXN0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihyZXNvdXJjZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQub2socmVmMiwgJ1Nob3VsZCByZS1sb2FkIHJlbW90ZSBzZXNzaW9uJyk7XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKHJlZjIpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSAocmVmMi5vYmplY3QgYXMgQ2hhdE1vZGVsKS5pbnB1dE1vZGVsLnN0YXRlLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBzZWxlY3RlZE1vZGVsOiByZXN0b3JlZD8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciwgbW9kZWxDb25maWd1cmF0aW9uOiByZXN0b3JlZD8ubW9kZWxDb25maWd1cmF0aW9uIH0sXG5cdFx0XHRcdHsgc2VsZWN0ZWRNb2RlbDogaGlzdG9yeU1vZGVsSWQsIG1vZGVsQ29uZmlndXJhdGlvbiB9LFxuXHRcdFx0XHQnTW9kZWwgYW5kIGl0cyBjb25maWd1cmF0aW9uIChlZmZvcnQgKyBjb250ZXh0IHdpbmRvdykgYXJlIHJlc3RvcmVkIGZyb20gdGhlIHBlcnNpc3RlZCBkcmFmdCBmb3IgdGhlIGhpc3RvcnkgbW9kZWwnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxTYXZlU3RhdGUgcGVyc2lzdHMgc2Vzc2lvbiBpbmRleCBzeW5jaHJvbm91c2x5IHNvIGl0IHN1cnZpdmVzIHJlbG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKSBhcyBUZXN0U3RvcmFnZVNlcnZpY2U7XG5cblx0XHQvLyBDcmVhdGUgYSBzZXNzaW9uIHdpdGggYSByZXF1ZXN0IHNvIGl0IHF1YWxpZmllcyBmb3IgcGVyc2lzdGVuY2Vcblx0XHRjb25zdCByZWYgPSB0ZXN0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdG1vZGVsLmFkZFJlcXVlc3QoeyBwYXJ0czogW10sIHRleHQ6ICdoZWxsbyB3b3JsZCcgfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXG5cdFx0Ly8gU2ltdWxhdGUgd2hhdCB0aGUgc3RvcmFnZSBzZXJ2aWNlIGRvZXMgYmVmb3JlIHNodXRkb3duOlxuXHRcdC8vIGZpcmUgb25XaWxsU2F2ZVN0YXRlIHN5bmNocm9ub3VzbHksIHRoZW4gZmx1c2guXG5cdFx0c3RvcmFnZVNlcnZpY2UudGVzdEVtaXRXaWxsU2F2ZVN0YXRlKFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2Vjb25kIENoYXRTZXJ2aWNlIGZyb20gdGhlIHNhbWUgc3RvcmFnZSAoc2ltdWxhdGluZ1xuXHRcdC8vIHdpbmRvdyByZWxvYWQpLiBUaGUgc2Vzc2lvbiBtdXN0IGJlIGRpc2NvdmVyYWJsZSBpbiBoaXN0b3J5XG5cdFx0Ly8gSU1NRURJQVRFTFkgXHUyMDE0IG5vIGFzeW5jIHdvcmsgZnJvbSB0aGUgZmlyc3Qgc2VydmljZSBuZWVkcyB0b1xuXHRcdC8vIGhhdmUgY29tcGxldGVkLlxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlMiA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zID0gYXdhaXQgdGVzdFNlcnZpY2UyLmdldEhpc3RvcnlTZXNzaW9uSXRlbXMoKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRoaXN0b3J5SXRlbXMuc29tZShpdGVtID0+IGl0ZW0uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdGBTZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSBzaG91bGQgYXBwZWFyIGluIGhpc3RvcnkgYWZ0ZXIgb25XaWxsU2F2ZVN0YXRlLiBHb3Q6ICR7aGlzdG9yeUl0ZW1zLm1hcChpID0+IGkuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLmpvaW4oJywgJyl9YFxuXHRcdCk7XG5cblx0XHQvLyBDbGVhbiB1cFxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUhpc3RvcnlFbnRyeSBtYXJrcyBtb2RlbCBhcyBkZWxldGVkIGFuZCBleGNsdWRlcyBmcm9tIGdldExpdmVTZXNzaW9uSXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihjaGF0QWdlbnRXaXRoTWFya2Rvd25JZCwgY2hhdEFnZW50V2l0aE1hcmtkb3duKSk7XG5cblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IGNyZWF0ZUNoYXRTZXJ2aWNlKCk7XG5cblx0XHQvLyBDcmVhdGUgYSBzZXNzaW9uIGFuZCBzZW5kIGEgbWVzc2FnZSBzbyBpdCBoYXMgcmVxdWVzdHNcblx0XHRjb25zdCByZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0O1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCBgQCR7Y2hhdEFnZW50V2l0aE1hcmtkb3duSWR9IHRlc3QgcmVxdWVzdGApO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgc2Vzc2lvbiBhcHBlYXJzIGluIGxpdmUgc2Vzc2lvbiBpdGVtc1xuXHRcdGNvbnN0IGxpdmVJdGVtc0JlZm9yZSA9IGF3YWl0IHRlc3RTZXJ2aWNlLmdldExpdmVTZXNzaW9uSXRlbXMoKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRsaXZlSXRlbXNCZWZvcmUuc29tZShpdGVtID0+IGl0ZW0uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdCdTZXNzaW9uIHNob3VsZCBhcHBlYXIgaW4gZ2V0TGl2ZVNlc3Npb25JdGVtcyBiZWZvcmUgZGVsZXRpb24nXG5cdFx0KTtcblxuXHRcdC8vIERlbGV0ZSB0aGUgc2Vzc2lvblxuXHRcdGF3YWl0IHRlc3RTZXJ2aWNlLnJlbW92ZUhpc3RvcnlFbnRyeShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBzZXNzaW9uIG5vIGxvbmdlciBhcHBlYXJzIGluIGxpdmUgc2Vzc2lvbiBpdGVtc1xuXHRcdGNvbnN0IGxpdmVJdGVtc0FmdGVyID0gYXdhaXQgdGVzdFNlcnZpY2UuZ2V0TGl2ZVNlc3Npb25JdGVtcygpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFsaXZlSXRlbXNBZnRlci5zb21lKGl0ZW0gPT4gaXRlbS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0J1Nlc3Npb24gc2hvdWxkIE5PVCBhcHBlYXIgaW4gZ2V0TGl2ZVNlc3Npb25JdGVtcyBhZnRlciBkZWxldGlvbidcblx0XHQpO1xuXG5cdFx0Ly8gVmVyaWZ5IG9uRGlkRGlzcG9zZVNlc3Npb24gd2FzIGZpcmVkXG5cdFx0Ly8gKG1vZGVsIGlzIHN0aWxsIGFsaXZlIGJlY2F1c2UgcmVmIGhvbGRzIGl0LCBidXQgaXQncyBtYXJrZWQgZGVsZXRlZClcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKG1vZGVsIGFzIENoYXRNb2RlbCkuaXNEZWxldGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlSGlzdG9yeUVudHJ5IHByZXZlbnRzIHJlLXNhdmluZyBvbiBtb2RlbCBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGNoYXRBZ2VudFdpdGhNYXJrZG93bklkLCBjaGF0QWdlbnRXaXRoTWFya2Rvd24pKTtcblxuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblxuXHRcdC8vIENyZWF0ZSBhIHNlc3Npb24gd2l0aCBhIHJlcXVlc3Rcblx0XHRjb25zdCByZWYgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKHN0YXJ0U2Vzc2lvbk1vZGVsKHRlc3RTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0O1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGVzdFNlcnZpY2Uuc2VuZFJlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCBgQCR7Y2hhdEFnZW50V2l0aE1hcmtkb3duSWR9IHRlc3QgcmVxdWVzdGApO1xuXHRcdENoYXRTZW5kUmVzdWx0LmFzc2VydFNlbnQocmVzcG9uc2UpO1xuXHRcdGF3YWl0IHJlc3BvbnNlLmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cblx0XHQvLyBEZWxldGUgdGhlIGhpc3RvcnkgZW50cnlcblx0XHRhd2FpdCB0ZXN0U2VydmljZS5yZW1vdmVIaXN0b3J5RW50cnkobW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIFJlbGVhc2UgdGhlIG1vZGVsIHJlZmVyZW5jZSBcdTIwMTQgdGhpcyB0cmlnZ2VycyB3aWxsRGlzcG9zZU1vZGVsXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0ZXN0U2VydmljZS53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgc2Vzc2lvbiBkb2VzIE5PVCByZWFwcGVhciBpbiBoaXN0b3J5IGFmdGVyIGRpc3Bvc2FsXG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UyID0gY3JlYXRlQ2hhdFNlcnZpY2UoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbXMgPSBhd2FpdCB0ZXN0U2VydmljZTIuZ2V0SGlzdG9yeVNlc3Npb25JdGVtcygpO1xuXHRcdGFzc2VydC5vayhcblx0XHRcdCFoaXN0b3J5SXRlbXMuc29tZShpdGVtID0+IGl0ZW0uc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdCdEZWxldGVkIHNlc3Npb24gc2hvdWxkIE5PVCByZWFwcGVhciBpbiBoaXN0b3J5IGFmdGVyIG1vZGVsIGRpc3Bvc2FsJ1xuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdiYWNrZmlsbFJlc3RvcmVkUGlja2VyU3RhdGUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IEFHRU5UID0gJ2FnZW50Jztcblx0Y29uc3QgbW9kZWwgPSAoaWRlbnRpZmllcjogc3RyaW5nKTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGVbJ3NlbGVjdGVkTW9kZWwnXSA9PiAoe1xuXHRcdGlkZW50aWZpZXIsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGlkOiBpZGVudGlmaWVyLCBuYW1lOiBpZGVudGlmaWVyLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ3Rlc3QnLFxuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge31cblx0XHR9XG5cdH0pO1xuXHRjb25zdCBzdGF0ZSA9IChtb2RlSWQ6IHN0cmluZywgc2VsZWN0ZWRNb2RlbDogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGVbJ3NlbGVjdGVkTW9kZWwnXSk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlID0+ICh7XG5cdFx0YXR0YWNobWVudHM6IFtdLCBtb2RlOiB7IGlkOiBtb2RlSWQsIGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCB9LCBzZWxlY3RlZE1vZGVsLCBpbnB1dFRleHQ6ICcnLCBzZWxlY3Rpb25zOiBbXSwgY29udHJpYjoge31cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmFja2ZpbGwgc2VsZWN0ZWRNb2RlbCBmcm9tIHN0b3JlZCBzdGF0ZSB3aGVuIHRoZSBjaG9zZW4gc3RhdGUgaGFzIG5vbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYmFja2ZpbGxSZXN0b3JlZFBpY2tlclN0YXRlKHN0YXRlKEFHRU5ULCB1bmRlZmluZWQpLCBzdGF0ZShBR0VOVCwgbW9kZWwoJ2FnZW50LWhvc3QtY2xhdWRlOm9wdXMnKSksIEFHRU5UKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5zZWxlY3RlZE1vZGVsLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgY2hvc2VuIG1vZGVsIHdoZW4gcHJlc2VudCAobmV2ZXIgb3ZlcnJpZGVzIGl0IHdpdGggdGhlIHN0b3JlZCBvbmUpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZShzdGF0ZShBR0VOVCwgbW9kZWwoJ2FnZW50LWhvc3QtY2xhdWRlOm9wdXMnKSksIHN0YXRlKEFHRU5ULCBtb2RlbCgnYWdlbnQtaG9zdC1jbGF1ZGU6aGFpa3UnKSksIEFHRU5UKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyLCAnYWdlbnQtaG9zdC1jbGF1ZGU6b3B1cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tb3RlcyBhIHN0b3JlZCBjdXN0b20gYWdlbnQgb3ZlciB0aGUgZGVmYXVsdCBBZ2VudCBvbmx5LCBuZXZlciBvdmVyIGFuIGV4cGxpY2l0IG1vZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZShzdGF0ZShBR0VOVCwgdW5kZWZpbmVkKSwgc3RhdGUoJ2N1c3RvbS11cmknLCB1bmRlZmluZWQpLCBBR0VOVCk/Lm1vZGUuaWQsICdjdXN0b20tdXJpJywgJ2RlZmF1bHQgQWdlbnQgXHUyMTkyIHN0b3JlZCBjdXN0b20gYWdlbnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja2ZpbGxSZXN0b3JlZFBpY2tlclN0YXRlKHN0YXRlKCdvdGhlci11cmknLCB1bmRlZmluZWQpLCBzdGF0ZSgnY3VzdG9tLXVyaScsIHVuZGVmaW5lZCksIEFHRU5UKT8ubW9kZS5pZCwgJ290aGVyLXVyaScsICdleHBsaWNpdCBtb2RlIGlzIG5vdCBvdmVycmlkZGVuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZShzdGF0ZShBR0VOVCwgdW5kZWZpbmVkKSwgc3RhdGUoQUdFTlQsIHVuZGVmaW5lZCksIEFHRU5UKT8ubW9kZS5pZCwgQUdFTlQsICdzdG9yZWQgZGVmYXVsdCBBZ2VudCBsZWF2ZXMgY2hvc2VuIEFnZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIGNob3NlbiBzdGF0ZSB1bmNoYW5nZWQgd2hlbiB0aGVyZSBpcyBubyBzdG9yZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hvc2VuID0gc3RhdGUoQUdFTlQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZShjaG9zZW4sIHVuZGVmaW5lZCwgQUdFTlQpLCBjaG9zZW4pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBBR0VOVCA9ICdhZ2VudCc7XG5cdGNvbnN0IG1vZGVsID0gKGlkZW50aWZpZXI6IHN0cmluZyk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlWydzZWxlY3RlZE1vZGVsJ10gPT4gKHtcblx0XHRpZGVudGlmaWVyLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRpZDogaWRlbnRpZmllciwgbmFtZTogaWRlbnRpZmllciwgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICd0ZXN0Jyxcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0fVxuXHR9KTtcblx0Y29uc3Qgc3RhdGUgPSAoc2VsZWN0ZWRNb2RlbDogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGVbJ3NlbGVjdGVkTW9kZWwnXSk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlID0+ICh7XG5cdFx0YXR0YWNobWVudHM6IFtdLCBtb2RlOiB7IGlkOiBBR0VOVCwga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50IH0sIHNlbGVjdGVkTW9kZWwsIGlucHV0VGV4dDogJycsIHNlbGVjdGlvbnM6IFtdLCBjb250cmliOiB7fVxuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZmlsbHMgdGhlIGhpc3RvcnkgbW9kZWwgd2hlbiB0aGUgdHJhbnNmZXJyZWQgc3RhdGUgZHJvcHBlZCBpdHMgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGlzdG9yeSA9IG1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnKTtcblx0XHRjb25zdCByZXN1bHQgPSBiYWNrZmlsbFRyYW5zZmVycmVkTW9kZWwoc3RhdGUodW5kZWZpbmVkKSwgaGlzdG9yeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXZlciBvdmVycmlkZXMgYSBtb2RlbCBhbHJlYWR5IHByZXNlbnQgb24gdGhlIHRyYW5zZmVycmVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJhY2tmaWxsVHJhbnNmZXJyZWRNb2RlbChzdGF0ZShtb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmdwdC01LjYtdGVycmEnKSksIG1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXRlcnJhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB0aGUgc3RhdGUgdW5jaGFuZ2VkIHdoZW4gdGhlcmUgaXMgbm8gaGlzdG9yeSBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCBjaG9zZW4gPSBzdGF0ZSh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrZmlsbFRyYW5zZmVycmVkTW9kZWwoY2hvc2VuLCB1bmRlZmluZWQpLCBjaG9zZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaG9zZW4uc2VsZWN0ZWRNb2RlbCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgc3RhdGUgYXMtaXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tmaWxsVHJhbnNmZXJyZWRNb2RlbCh1bmRlZmluZWQsIG1vZGVsKCdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6Z3B0LTUuNi1zb2wnKSksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cblxuZnVuY3Rpb24gdG9TbmFwc2hvdEV4cG9ydERhdGEobW9kZWw6IElDaGF0TW9kZWwpIHtcblx0Y29uc3QgZXhwID0gbW9kZWwudG9FeHBvcnQoKTtcblx0cmV0dXJuIHtcblx0XHQuLi5leHAsXG5cdFx0cmVxdWVzdHM6IGV4cC5yZXF1ZXN0cy5tYXAociA9PiB7XG5cdFx0XHQvLyBEZXN0cnVjdHVyZSBwcm9wZXJ0aWVzIGFmdGVyIGB2b3RlYCBzbyB3ZSBjYW4gaW5zZXJ0IGB2b3RlRG93blJlYXNvbmAgaW4gdGhlIGNvcnJlY3QgcG9zaXRpb24gZm9yIHNuYXBzaG90IGNvbXBhdFxuXHRcdFx0Y29uc3QgeyBzbGFzaENvbW1hbmQsIHVzZWRDb250ZXh0LCBjb250ZW50UmVmZXJlbmNlcywgY29kZUNpdGF0aW9ucywgdGltZVNwZW50V2FpdGluZywgaXNTeXN0ZW1Jbml0aWF0ZWQ6IF9pc1N5c3RlbUluaXRpYXRlZCwgc3lzdGVtSW5pdGlhdGVkTGFiZWw6IF9zeXN0ZW1Jbml0aWF0ZWRMYWJlbCwgcmVzcG9uc2VUaW1lc3RhbXA6IF9yZXNwb25zZVRpbWVzdGFtcCwgZWxhcHNlZE1zOiBfZWxhcHNlZE1zLCBjb21wbGV0aW9uVG9rZW5zOiBfY29tcGxldGlvblRva2VucywgcHJvbXB0VG9rZW5zOiBfcHJvbXB0VG9rZW5zLCBvdXRwdXRCdWZmZXI6IF9vdXRwdXRCdWZmZXIsIHByb21wdFRva2VuRGV0YWlsczogX3Byb21wdFRva2VuRGV0YWlscywgY29waWxvdENyZWRpdHM6IF9jb3BpbG90Q3JlZGl0cywgLi4ucmVzdCB9ID0gcjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnJlc3QsXG5cdFx0XHRcdG1vZGVsU3RhdGU6IHtcblx0XHRcdFx0XHQuLi5yLm1vZGVsU3RhdGUsXG5cdFx0XHRcdFx0Y29tcGxldGVkQXQ6IHVuZGVmaW5lZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aW1lc3RhbXA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdElkOiB1bmRlZmluZWQsIC8vIGlkIGNvbnRhaW5zIGEgcmFuZG9tIHBhcnRcblx0XHRcdFx0cmVzcG9uc2VJZDogdW5kZWZpbmVkLCAvLyBpZCBjb250YWlucyBhIHJhbmRvbSBwYXJ0XG5cdFx0XHRcdHZvdGVEb3duUmVhc29uOiB1bmRlZmluZWQsIC8vIHJlbW92ZWQgZnJvbSBtb2RlbCwga2VwdCBmb3Igc25hcHNob3QgY29tcGF0XG5cdFx0XHRcdHNsYXNoQ29tbWFuZCxcblx0XHRcdFx0dXNlZENvbnRleHQsXG5cdFx0XHRcdGNvbnRlbnRSZWZlcmVuY2VzLFxuXHRcdFx0XHRjb2RlQ2l0YXRpb25zLFxuXHRcdFx0XHR0aW1lU3BlbnRXYWl0aW5nLFxuXHRcdFx0fTtcblx0XHR9KVxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBc0MsdUJBQXVCO0FBQ3RFLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGlCQUFpQixjQUFjLDJCQUEyQjtBQUNuRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQix5QkFBeUI7QUFDNUQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUIsZ0NBQWdDO0FBQzVELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCLE1BQU0sNEJBQTRCLG9CQUFvQixzQkFBc0IsMEJBQTBCO0FBQ3hJLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCLGdCQUFtRSxjQUFjLDBCQUEwQjtBQUMxSSxTQUFTLDBCQUEwQiw2QkFBNkIsbUJBQW1CO0FBQ25GLFNBQVMsbUJBQW1CLG9CQUFvQjtBQUNoRCxTQUFTLHlCQUF5QixxQkFBOEQsOEJBQThCO0FBQzlILFNBQXFDLDhCQUE4QjtBQUVuRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUF3RSx5QkFBeUI7QUFDMUcsU0FBUyx5QkFBeUIsZ0NBQWdDO0FBQ2xFLFNBQStCLHVCQUF1QjtBQUN0RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF3SSw0QkFBNEI7QUFDN0ssU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw4Q0FBOEMsMEJBQTBCLCtCQUErQjtBQUNoSCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlDQUFpQztBQUUxQyxNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDJCQUF1QztBQUFBLEVBQzVDLElBQUk7QUFBQSxFQUNKLE1BQU07QUFBQSxFQUNOLGFBQWEseUJBQXlCO0FBQUEsRUFDdEMsa0JBQWtCO0FBQUEsRUFDbEIsc0JBQXNCO0FBQUEsRUFDdEIsc0JBQXNCO0FBQUEsRUFDdEIsc0JBQXNCO0FBQUEsRUFDdEIsV0FBVyxDQUFDLGtCQUFrQixJQUFJO0FBQUEsRUFDbEMsT0FBTyxDQUFDLGFBQWEsR0FBRztBQUFBLEVBQ3hCLFVBQVUsQ0FBQztBQUFBLEVBQ1gsZUFBZSxDQUFDO0FBQUEsRUFDaEIsZ0JBQWdCLENBQUM7QUFBQSxFQUNqQixNQUFNLE9BQU8sU0FBUyxVQUFVLFNBQVMsT0FBTztBQUMvQyxhQUFTLENBQUM7QUFBQSxNQUNULFdBQVc7QUFBQSxRQUNWO0FBQUEsVUFDQyxLQUFLLElBQUksS0FBSyxvQkFBb0I7QUFBQSxVQUNsQyxTQUFTO0FBQUEsVUFDVCxRQUFRO0FBQUEsWUFDUCxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFVBQ3JCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUVGLFdBQU8sRUFBRSxVQUFVLEVBQUUsYUFBYSxRQUFRLEVBQUU7QUFBQSxFQUM3QztBQUFBLEVBQ0EsTUFBTSxpQkFBaUIsV0FBVyxPQUFPO0FBQ3hDLFdBQU8sQ0FBQyxFQUFFLE1BQU0sU0FBUyxTQUFTLGtCQUFrQixTQUFTLElBQUksU0FBUyxZQUFZLENBQXlCO0FBQUEsRUFDaEg7QUFDRDtBQUVBLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sd0JBQW9DO0FBQUEsRUFDekMsSUFBSTtBQUFBLEVBQ0osTUFBTTtBQUFBLEVBQ04sYUFBYSx5QkFBeUI7QUFBQSxFQUN0QyxrQkFBa0I7QUFBQSxFQUNsQixzQkFBc0I7QUFBQSxFQUN0QixzQkFBc0I7QUFBQSxFQUN0QixzQkFBc0I7QUFBQSxFQUN0QixXQUFXLENBQUMsa0JBQWtCLElBQUk7QUFBQSxFQUNsQyxPQUFPLENBQUMsYUFBYSxHQUFHO0FBQUEsRUFDeEIsVUFBVSxDQUFDO0FBQUEsRUFDWCxlQUFlLENBQUM7QUFBQSxFQUNoQixnQkFBZ0IsQ0FBQztBQUFBLEVBQ2pCLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLGFBQVMsQ0FBQyxFQUFFLE1BQU0sbUJBQW1CLFNBQVMsSUFBSSxlQUFlLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDM0UsV0FBTyxFQUFFLFVBQVUsRUFBRSxhQUFhLFFBQVEsRUFBRTtBQUFBLEVBQzdDO0FBQUEsRUFDQSxNQUFNLGlCQUFpQixXQUFXLE9BQU87QUFDeEMsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUNEO0FBRUEsU0FBUyxhQUFhLElBQTRCO0FBQ2pELFNBQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOO0FBQUEsSUFDQSxhQUFhLHlCQUF5QjtBQUFBLElBQ3RDLGtCQUFrQjtBQUFBLElBQ2xCLHNCQUFzQjtBQUFBLElBQ3RCLHNCQUFzQjtBQUFBLElBQ3RCLHNCQUFzQjtBQUFBLElBQ3RCLFdBQVcsQ0FBQyxrQkFBa0IsSUFBSTtBQUFBLElBQ2xDLE9BQU8sQ0FBQyxhQUFhLEdBQUc7QUFBQSxJQUN4QixVQUFVLENBQUM7QUFBQSxJQUNYLGVBQWUsQ0FBQztBQUFBLElBQ2hCLGdCQUFnQixDQUFDO0FBQUEsRUFDbEI7QUFDRDtBQUVBLE1BQU0sZUFBZSxNQUFNO0FBQzFCLFFBQU0sa0JBQWtCLElBQUksZ0JBQWdCO0FBRTVDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLE1BQUk7QUFDSixRQUFNLGVBQThCLENBQUM7QUFLckMsV0FBUyxvQkFBaUM7QUFDekMsVUFBTSxVQUFVLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLFdBQVcsQ0FBQztBQUNwRixpQkFBYSxLQUFLLE9BQU87QUFDekIsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLGtCQUFrQixTQUF1QixXQUE4QixrQkFBa0IsTUFBMkI7QUFDNUgsVUFBTSxNQUFNLGdCQUFnQixJQUFJLFFBQVEscUJBQXFCLFFBQVEsQ0FBQztBQUN0RSxXQUFPO0FBQUEsRUFDUjtBQUVBLGlCQUFlLGtCQUFrQixTQUF1QixVQUFnRDtBQUN2RyxVQUFNLE1BQU0sTUFBTSxRQUFRLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQ3ZHLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLGdCQUFnQixJQUFJLEdBQUcsRUFBRTtBQUFBLEVBQ2pDO0FBRUEsUUFBTSxZQUFZO0FBQ2pCLDJCQUF1QixnQkFBZ0IsSUFBSSxJQUFJLHlCQUF5QixJQUFJO0FBQUEsTUFDM0UsQ0FBQyx1QkFBdUIsSUFBSSx5QkFBeUIsQ0FBQztBQUFBLE1BQ3RELENBQUMsNkJBQTZCLElBQUksK0JBQStCLENBQUM7QUFBQSxNQUNsRSxDQUFDLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFBQSxNQUNsQyxDQUFDLGlCQUFpQixJQUFJLG1CQUFtQixDQUFDO0FBQUEsTUFDMUMsQ0FBQyw0QkFBNEIsZ0JBQWdCLElBQUksSUFBSSw4QkFBOEIsQ0FBQyxDQUFDO0FBQUEsSUFDdEYsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssaUJBQWlCLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUN4Rix5QkFBcUIsS0FBSyx5QkFBeUIsSUFBSSwyQkFBMkIsQ0FBQztBQUNuRix5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLDBCQUEwQixFQUFFLGdCQUFnQixrQkFBa0IsV0FBVyxXQUFXLElBQUksS0FBSyxnQkFBZ0IsR0FBRyxJQUFJLEtBQUssYUFBYSxDQUFDLEVBQUUsQ0FBQztBQUNwSyx5QkFBcUIsS0FBSyxtQkFBbUIsb0JBQW9CO0FBQ2pFLHlCQUFxQixLQUFLLG1CQUFtQixJQUFJLHFCQUFxQixDQUFDO0FBQ3ZFLHlCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLHlCQUFxQixLQUFLLGVBQWUsSUFBSSxxQkFBcUIsQ0FBQztBQUNuRSx5QkFBcUIsS0FBSywwQkFBMEIsSUFBSSxtQkFBbUIsQ0FBQztBQUM1RSx5QkFBcUIsS0FBSywwQkFBMEIsZ0JBQWdCLElBQUkscUJBQXFCLGVBQWUsdUJBQXVCLENBQUMsQ0FBQztBQUNySSx5QkFBcUIsS0FBSyx1QkFBdUIsSUFBSSx5QkFBeUIsQ0FBQztBQUMvRSx5QkFBcUIsS0FBSyxjQUFjLElBQUksZ0JBQWdCLENBQUM7QUFDN0QseUJBQXFCLEtBQUssc0JBQXNCLElBQUksd0JBQXdCLENBQUM7QUFDN0UseUJBQXFCLEtBQUssd0JBQXdCLElBQUksMEJBQTBCLENBQUM7QUFDakYseUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsc0JBQXNCLElBQUksS0FBSyxnQ0FBZ0MsRUFBRSxDQUFDO0FBQ25ILHlCQUFxQixLQUFLLG1CQUFtQixFQUFFLGdCQUFnQixNQUFNLEtBQUssQ0FBQztBQUMzRSx5QkFBcUIsS0FBSywwQkFBMEIsRUFBRSxxQkFBcUIsTUFBTSxLQUFLLENBQUM7QUFDdkYseUJBQXFCLEtBQUssbUJBQW1CLGdCQUFnQixJQUFJLElBQUkscUJBQXFCLElBQUkseUJBQXlCLENBQUMsQ0FBQyxDQUFDO0FBQzFILDRCQUF3QixnQkFBZ0IseUJBQXlCLENBQUMsQ0FBQztBQUNuRSx5QkFBcUIsS0FBSyxxQkFBcUIsSUFBSSxjQUFjLEtBQTBCLEVBQUU7QUFBQSxNQUNuRixzQ0FBMkQ7QUFDbkUsZUFBTztBQUFBLFVBQ04sT0FBTyxnQkFBZ0Isd0JBQXdCLElBQUk7QUFBQSxVQUNuRCxvQkFBb0IsZ0JBQWdCLHNCQUFzQixDQUFDLENBQUM7QUFBQSxVQUM1RCxTQUFTO0FBQUEsVUFDVCxTQUFTLE1BQU07QUFBQSxVQUFFO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFDO0FBR0Qsc0JBQWtCLGdCQUFnQixJQUFJLElBQUksd0JBQXdCLENBQUM7QUFDbkUseUJBQXFCLEtBQUssY0FBYyxlQUFlO0FBRXZELHVCQUFtQixnQkFBZ0IsSUFBSSxxQkFBcUIsZUFBZSxnQkFBZ0IsQ0FBQztBQUM1Rix5QkFBcUIsS0FBSyxtQkFBbUIsZ0JBQWdCO0FBRTdELFVBQU0sUUFBa0M7QUFBQSxNQUN2QyxNQUFNLE9BQU8sU0FBUyxVQUFVLFNBQVMsT0FBTztBQUMvQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsNEJBQTRCLGFBQWEsMEJBQTBCLENBQUMsQ0FBQztBQUN4SCxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyx5QkFBeUIsYUFBYSx1QkFBdUIsQ0FBQyxDQUFDO0FBQ2xILG9CQUFnQixJQUFJLGlCQUFpQiw0QkFBNEIsYUFBYSxLQUFLLENBQUM7QUFDcEYscUJBQWlCLFlBQVksYUFBYSxDQUFDLENBQUM7QUFBQSxFQUM3QyxDQUFDO0FBRUQsV0FBUyxZQUFZO0FBQ3BCLG9CQUFnQixNQUFNO0FBQ3RCLFVBQU0sUUFBUSxJQUFJLGFBQWEsSUFBSSxPQUFLLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztBQUNsRSxpQkFBYSxTQUFTO0FBQUEsRUFDdkIsQ0FBQztBQUNELDBDQUF3QztBQUV4QyxPQUFLLGlFQUFpRSxZQUFZO0FBQ2pGLFVBQU0sV0FBVyxJQUFJLGdCQUFxQztBQUMxRCxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxjQUFjLGFBQWEsWUFBWSxDQUFDLENBQUM7QUFDNUYsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixjQUFjO0FBQUEsTUFDOUUsTUFBTSxPQUFPLFNBQVM7QUFDckIsaUJBQVMsU0FBUyxRQUFRLGdCQUFnQjtBQUMxQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixVQUFNLFVBQVUsa0JBQWtCO0FBQ2xDLFVBQU0sUUFBUSxrQkFBa0IsT0FBTyxFQUFFO0FBRXpDLFVBQU0sUUFBUSxZQUFZLE1BQU0saUJBQWlCLGlCQUFpQjtBQUFBLE1BQ2pFLFNBQVM7QUFBQSxNQUNULGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFFRCxXQUFPLFlBQVksTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFVBQU0sc0JBQXNCLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixDQUFDO0FBQzVHLFVBQU0sYUFBdUIsQ0FBQztBQUM5QixVQUFNLFdBQVcsRUFBRSxRQUFRLENBQUMsY0FBNkI7QUFBQSxJQUFFLEVBQUU7QUFFN0Qsb0JBQWdCLElBQUksb0JBQW9CLHFCQUFxQjtBQUFBLE1BQzVELFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLFdBQVcsQ0FBQyxrQkFBa0IsSUFBSTtBQUFBLE1BQ2xDLGNBQWMsQ0FBQyxPQUFPO0FBQUEsSUFDdkIsR0FBRyxZQUFZO0FBQ2QsaUJBQVcsS0FBSyxPQUFPO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsb0JBQWdCLElBQUksb0JBQW9CLHFCQUFxQjtBQUFBLE1BQzVELFNBQVM7QUFBQSxNQUNULFFBQVE7QUFBQSxNQUNSLFdBQVcsQ0FBQyxrQkFBa0IsSUFBSTtBQUFBLE1BQ2xDLGNBQWMsQ0FBQyxRQUFRO0FBQUEsSUFDeEIsR0FBRyxZQUFZO0FBQ2QsaUJBQVcsS0FBSyxRQUFRO0FBQUEsSUFDekIsQ0FBQyxDQUFDO0FBRUYsV0FBTyxZQUFZLG9CQUFvQixXQUFXLFVBQVUsT0FBTyxHQUFHLElBQUk7QUFDMUUsV0FBTyxZQUFZLG9CQUFvQixXQUFXLFVBQVUsUUFBUSxHQUFHLElBQUk7QUFDM0UsV0FBTyxZQUFZLG9CQUFvQixXQUFXLFVBQVUsT0FBTyxHQUFHLEtBQUs7QUFFM0UsVUFBTSxvQkFBb0IsZUFBZSxVQUFVLElBQUksVUFBVSxDQUFDLEdBQUcsa0JBQWtCLE1BQU0sb0JBQW9CLFdBQVcsZUFBZSxHQUFHLGtCQUFrQixJQUFJO0FBQ3BLLFVBQU0sb0JBQW9CLGVBQWUsVUFBVSxJQUFJLFVBQVUsQ0FBQyxHQUFHLGtCQUFrQixNQUFNLElBQUksS0FBSyxFQUFFLFFBQVEsVUFBVSxNQUFNLFdBQVcsQ0FBQyxHQUFHLGtCQUFrQixJQUFJO0FBRXJLLFdBQU8sZ0JBQWdCLFlBQVksQ0FBQyxTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFVBQU0sc0JBQXNCLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLHVCQUF1QixDQUFDO0FBQzVHLFVBQU0sVUFBVSxZQUFZO0FBRTVCLG9CQUFnQixJQUFJLG9CQUFvQixxQkFBcUI7QUFBQSxNQUM1RCxTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixXQUFXLENBQUMsa0JBQWtCLElBQUk7QUFBQSxNQUNsQyxjQUFjLENBQUMsU0FBUyxRQUFRO0FBQUEsSUFDakMsR0FBRyxPQUFPLENBQUM7QUFFWCxXQUFPLE9BQU8sTUFBTSxvQkFBb0IscUJBQXFCO0FBQUEsTUFDNUQsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsV0FBVyxDQUFDLGtCQUFrQixJQUFJO0FBQUEsTUFDbEMsY0FBYyxDQUFDLFVBQVUsT0FBTztBQUFBLElBQ2pDLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDWixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsWUFBWTtBQUNuRixVQUFNLHNCQUFzQixnQkFBZ0IsSUFBSSxxQkFBcUIsZUFBZSx1QkFBdUIsQ0FBQztBQUM1RyxVQUFNLGFBQXVCLENBQUM7QUFDOUIsVUFBTSxXQUFXLEVBQUUsUUFBUSxDQUFDLGNBQTZCO0FBQUEsSUFBRSxFQUFFO0FBRTdELG9CQUFnQixJQUFJLG9CQUFvQixxQkFBcUI7QUFBQSxNQUM1RCxTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixXQUFXLENBQUMsa0JBQWtCLElBQUk7QUFBQSxJQUNuQyxHQUFHLFlBQVk7QUFDZCxpQkFBVyxLQUFLLEtBQUs7QUFBQSxJQUN0QixDQUFDLENBQUM7QUFFRixXQUFPLFlBQVksb0JBQW9CLFdBQVcsVUFBVSxPQUFPLEdBQUcsSUFBSTtBQUMxRSxXQUFPLFlBQVksb0JBQW9CLFdBQVcsVUFBVSxRQUFRLEdBQUcsSUFBSTtBQUUzRSxVQUFNLG9CQUFvQixlQUFlLFVBQVUsSUFBSSxVQUFVLENBQUMsR0FBRyxrQkFBa0IsTUFBTSxvQkFBb0IsV0FBVyxlQUFlLEdBQUcsa0JBQWtCLElBQUk7QUFDcEssVUFBTSxvQkFBb0IsZUFBZSxVQUFVLElBQUksVUFBVSxDQUFDLEdBQUcsa0JBQWtCLE1BQU0sSUFBSSxLQUFLLEVBQUUsUUFBUSxVQUFVLE1BQU0sV0FBVyxDQUFDLEdBQUcsa0JBQWtCLElBQUk7QUFFckssV0FBTyxnQkFBZ0IsWUFBWSxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQ2pELFdBQU8sT0FBTyxNQUFNLG9CQUFvQixxQkFBcUI7QUFBQSxNQUM1RCxTQUFTO0FBQUEsTUFDVCxRQUFRO0FBQUEsTUFDUixXQUFXLENBQUMsa0JBQWtCLElBQUk7QUFBQSxNQUNsQyxjQUFjLENBQUMsUUFBUTtBQUFBLElBQ3hCLEdBQUcsWUFBWSxNQUFTLENBQUM7QUFBQSxFQUMxQixDQUFDO0FBRUQsT0FBSyxtQkFBbUIsWUFBWTtBQUNuQyxVQUFNLGNBQWMsa0JBQWtCO0FBRXRDLFVBQU0sY0FBYyxZQUFZLHFCQUFxQixrQkFBa0IsSUFBSTtBQUMzRSxVQUFNLFdBQVcsWUFBWTtBQUM3QixhQUFTLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLFlBQVksR0FBRyxFQUFFLFdBQVcsQ0FBQyxFQUFFLEdBQUcsQ0FBQztBQUUxRSxVQUFNLGNBQWMsWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDM0UsVUFBTSxXQUFXLFlBQVk7QUFDN0IsYUFBUyxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxZQUFZLEdBQUcsRUFBRSxXQUFXLENBQUMsRUFBRSxHQUFHLENBQUM7QUFHMUUsZ0JBQVksUUFBUTtBQUNwQixnQkFBWSxRQUFRO0FBR3BCLFVBQU0sWUFBWSxzQkFBc0I7QUFHeEMsV0FBTyxZQUFZLGdCQUFnQixnQkFBZ0IsUUFBUSxHQUFHLGdEQUFnRDtBQUU5RyxVQUFNLGtCQUFrQixnQkFBZ0IsZ0JBQWdCLEtBQUssQ0FBQyxPQUM3RCxHQUFHLFFBQVEsU0FBUyxXQUFXLENBQUM7QUFDakMsVUFBTSxrQkFBa0IsZ0JBQWdCLGdCQUFnQixLQUFLLENBQUMsT0FDN0QsR0FBRyxRQUFRLFNBQVMsV0FBVyxDQUFDO0FBRWpDLFdBQU8sR0FBRyxpQkFBaUIsb0RBQW9EO0FBQy9FLFdBQU8sR0FBRyxpQkFBaUIsb0RBQW9EO0FBRy9FLFVBQU0sZUFBZSxrQkFBa0I7QUFHdkMsVUFBTSxhQUFhLE1BQU0sa0JBQWtCLGNBQWMsU0FBUyxlQUFlO0FBQ2pGLFVBQU0sYUFBYSxNQUFNLGtCQUFrQixjQUFjLFNBQVMsZUFBZTtBQUVqRixXQUFPLEdBQUcsWUFBWSwyQkFBMkI7QUFDakQsV0FBTyxHQUFHLFlBQVksMkJBQTJCO0FBQ2pELFdBQU8sZ0JBQWdCLFdBQVcsWUFBWSxFQUFFLENBQUMsR0FBRyxRQUFRLE1BQU0sV0FBVztBQUM3RSxXQUFPLGdCQUFnQixXQUFXLFlBQVksRUFBRSxDQUFDLEdBQUcsUUFBUSxNQUFNLFdBQVc7QUFBQSxFQUM5RSxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLHlCQUFxQixLQUFLLGNBQWMsV0FBVztBQUNuRCxVQUFNLFVBQVUsWUFBWSxxQkFBcUIsa0JBQWtCLE1BQU0sRUFBRSxZQUFZLHVCQUF1QixDQUFDO0FBRS9HLFVBQU0sZ0JBQWdCLElBQUksY0FBYyxLQUF5QixFQUFFO0FBQUEsTUFBekM7QUFBQTtBQUN6QixhQUFTLFFBQVEsZ0JBQWdCLHVCQUF1QixRQUFRO0FBQUE7QUFBQSxJQUNqRSxFQUFFO0FBRUYsMEJBQXNCLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBUztBQUVwRCxXQUFPLGdCQUFnQixZQUFZLCtCQUErQixFQUFFLE9BQU8sSUFBSSxZQUFVO0FBQUEsTUFDeEYsV0FBVyxNQUFNO0FBQUEsTUFDakIsU0FBUyxNQUFNO0FBQUEsTUFDZixpQkFBaUIsTUFBTTtBQUFBLE1BQ3ZCLGdCQUFnQixNQUFNO0FBQUEsSUFDdkIsRUFBRSxHQUFHLENBQUM7QUFBQSxNQUNMLFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxRQUNSLEVBQUUsUUFBUSxvQ0FBb0MsT0FBTyxFQUFFO0FBQUEsUUFDdkQsRUFBRSxRQUFRLHdCQUF3QixPQUFPLEVBQUU7QUFBQSxNQUM1QztBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsTUFDakIsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQyxDQUFDO0FBRUYsMEJBQXNCLElBQUksQ0FBQyxHQUFHLE1BQVM7QUFDdkMsV0FBTyxnQkFBZ0IsWUFBWSwrQkFBK0IsRUFBRSxPQUFPLElBQUksWUFBVTtBQUFBLE1BQ3hGLFNBQVMsTUFBTTtBQUFBLE1BQ2YsaUJBQWlCLE1BQU07QUFBQSxNQUN2QixnQkFBZ0IsTUFBTTtBQUFBLElBQ3ZCLEVBQUUsR0FBRyxDQUFDO0FBQUEsTUFDTCxTQUFTLENBQUMsRUFBRSxRQUFRLHdCQUF3QixPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQ3RELGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQjtBQUFBLElBQ2pCLENBQUMsQ0FBQztBQUVGLFlBQVEsUUFBUTtBQUFBLEVBQ2pCLENBQUM7QUFFRCxPQUFLLHNCQUFzQixZQUFZO0FBQ3RDLFVBQU0sY0FBYyxrQkFBa0I7QUFFdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFDdkIsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUVoRCxVQUFNLFlBQVksbUJBQW1CLE1BQU0saUJBQWlCLGdCQUFnQixRQUFXLEdBQUcsRUFBRSxTQUFTLGdCQUFnQixDQUFDO0FBQ3RILFdBQU8sWUFBWSxNQUFNLFlBQVksRUFBRSxRQUFRLENBQUM7QUFDaEQsV0FBTyxHQUFHLE1BQU0sWUFBWSxFQUFFLENBQUMsRUFBRSxRQUFRO0FBQ3pDLFdBQU8sWUFBWSxNQUFNLFlBQVksRUFBRSxDQUFDLEVBQUUsVUFBVSxTQUFTLFNBQVMsR0FBRyxlQUFlO0FBQUEsRUFDekYsQ0FBQztBQUVELE9BQUssa0VBQWtFLFlBQVk7QUFDbEYsVUFBTSxjQUFjLGtCQUFrQjtBQUV0QyxVQUFNLFdBQVcsZ0JBQWdCLElBQUksa0JBQWtCLFdBQVcsQ0FBQztBQUNuRSxVQUFNLFFBQVEsU0FBUztBQUN2QixVQUFNLFlBQXVDLEVBQUUsTUFBTSxRQUFRLElBQUksUUFBUSxNQUFNLGFBQWEsT0FBTyxJQUFJLEtBQUssaUJBQWlCLEVBQUU7QUFDL0gsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUMxRyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFFcEIsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUNoRCxXQUFPLFlBQVksTUFBTSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFFBQVEsTUFBTSxFQUFFO0FBQzFELFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxFQUFFLENBQUMsRUFBRSxhQUFhLFdBQVcsQ0FBQyxTQUFTLENBQUM7QUFBQSxFQUNsRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLGNBQWMsa0JBQWtCO0FBRXRDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBQ3ZCLFVBQU0saUJBQTRDLEVBQUUsTUFBTSxhQUFhLElBQUksYUFBYSxNQUFNLGFBQWEsT0FBTyxZQUFZO0FBRTlILFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLEVBQUUsR0FBRyxFQUFFLE1BQU0sWUFBWSxRQUFRLGdCQUFnQixDQUFDO0FBQzlILFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLElBQUksRUFBRSxpQkFBaUIsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxHQUFHLEVBQUUsTUFBTSxZQUFZLFFBQVEsZ0JBQWdCLENBQUM7QUFDckssV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQ2pELENBQUM7QUFFRCxPQUFLLHFCQUFxQixZQUFZO0FBQ3JDLFVBQU0sY0FBYyxrQkFBa0I7QUFFdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFDdkIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLElBQUksMEJBQTBCLGVBQWU7QUFDbkgsbUJBQWUsV0FBVyxRQUFRO0FBQ2xDLFVBQU0sU0FBUyxLQUFLO0FBRXBCLFVBQU0sZUFBZSxxQkFBcUIsS0FBSyxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssV0FBVyxZQUFZO0FBQzNCLFVBQU0scUJBQStDO0FBQUEsTUFDcEQsTUFBTSxPQUFPLFNBQVMsVUFBVSxTQUFTLE9BQU87QUFDL0MsZUFBTztBQUFBLFVBQ04sVUFBVSxFQUFFLGVBQWUsUUFBUSxPQUFPO0FBQUEsUUFDM0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGdCQUFnQixFQUFFLEdBQUcsYUFBYSxjQUFjLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUN4SCxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxVQUFVLGFBQWEsUUFBUSxDQUFDLENBQUM7QUFDcEYsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixnQkFBZ0Isa0JBQWtCLENBQUM7QUFDcEcsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixVQUFVLGtCQUFrQixDQUFDO0FBRTlGLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFHdkIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLGdCQUFnQixFQUFFLFNBQVMsZUFBZSxDQUFDO0FBQ2pILG1CQUFlLFdBQVcsUUFBUTtBQUNsQyxVQUFNLFNBQVMsS0FBSztBQUNwQixXQUFPLFlBQVksTUFBTSxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBQ2hELFdBQU8sWUFBWSxNQUFNLFlBQVksRUFBRSxDQUFDLEVBQUUsVUFBVSxRQUFRLFVBQVUsZUFBZSxDQUFDO0FBR3RGLFVBQU0sWUFBWSxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixnQkFBZ0IsRUFBRSxTQUFTLFNBQVMsQ0FBQztBQUM1RyxtQkFBZSxXQUFXLFNBQVM7QUFDbkMsVUFBTSxVQUFVLEtBQUs7QUFDckIsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUNoRCxXQUFPLFlBQVksTUFBTSxZQUFZLEVBQUUsQ0FBQyxFQUFFLFVBQVUsUUFBUSxVQUFVLGVBQWUsQ0FBQztBQUd0RixVQUFNLFlBQVksTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsZ0JBQWdCLEVBQUUsU0FBUyxlQUFlLENBQUM7QUFDbEgsbUJBQWUsV0FBVyxTQUFTO0FBQ25DLFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFdBQU8sWUFBWSxNQUFNLFlBQVksRUFBRSxRQUFRLENBQUM7QUFDaEQsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLENBQUMsRUFBRSxVQUFVLFFBQVEsVUFBVSxlQUFlLENBQUM7QUFBQSxFQUN2RixDQUFDO0FBRUQsT0FBSyxpQkFBaUIsWUFBWTtBQUNqQyxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLDRCQUE0Qix3QkFBd0IsQ0FBQztBQUN0SCxxQkFBaUIsWUFBWSw0QkFBNEIsQ0FBQyxDQUFDO0FBQzNELFVBQU0sY0FBYyxrQkFBa0I7QUFFdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFDdkIsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUVoRCxVQUFNLGVBQWUscUJBQXFCLEtBQUssQ0FBQztBQUVoRCxVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsSUFBSSwwQkFBMEIsZUFBZTtBQUNuSCxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFDcEIsV0FBTyxZQUFZLE1BQU0sWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUVoRCxVQUFNLFlBQVksTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsZ0JBQWdCO0FBQ3ZGLG1CQUFlLFdBQVcsU0FBUztBQUNuQyxVQUFNLFVBQVUsS0FBSztBQUNyQixXQUFPLFlBQVksTUFBTSxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBRWhELFVBQU0sZUFBZSxxQkFBcUIsS0FBSyxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUVELE9BQUssbUJBQW1CLFlBQVk7QUFDbkMsUUFBSTtBQUNKLG9CQUFnQixJQUFJLGlCQUFpQiw0QkFBNEIsNEJBQTRCLHdCQUF3QixDQUFDO0FBR3RIO0FBQ0MsWUFBTSxjQUFjLGtCQUFrQjtBQUV0QyxZQUFNLGdCQUFnQixnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ3hFLFlBQU0sYUFBYSxjQUFjO0FBQ2pDLGFBQU8sWUFBWSxXQUFXLFlBQVksRUFBRSxRQUFRLENBQUM7QUFFckQsWUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLFdBQVcsaUJBQWlCLElBQUksMEJBQTBCLGVBQWU7QUFDeEgscUJBQWUsV0FBVyxRQUFRO0FBRWxDLFlBQU0sU0FBUyxLQUFLO0FBRXBCLDJCQUFxQixLQUFLLE1BQU0sS0FBSyxVQUFVLFVBQVUsQ0FBQztBQUFBLElBQzNEO0FBSUEsVUFBTSxlQUFlLGtCQUFrQjtBQUV2QyxVQUFNLGdCQUFnQixhQUFhLG9CQUFvQixrQkFBa0I7QUFDekUsV0FBTyxhQUFhO0FBQ3BCLG9CQUFnQixJQUFJLGFBQWE7QUFDakMsVUFBTSxhQUFhLGNBQWM7QUFFakMsVUFBTSxlQUFlLHFCQUFxQixVQUFVLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsWUFBWTtBQUNqRCxRQUFJO0FBQ0osb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0Qix5QkFBeUIscUJBQXFCLENBQUM7QUFFaEg7QUFDQyxZQUFNLGNBQWMsa0JBQWtCO0FBRXRDLFlBQU0sZ0JBQWdCLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDeEUsWUFBTSxhQUFhLGNBQWM7QUFDakMsYUFBTyxZQUFZLFdBQVcsWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUVyRCxZQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksV0FBVyxpQkFBaUIsSUFBSSwwQkFBMEIsZUFBZTtBQUN4SCxxQkFBZSxXQUFXLFFBQVE7QUFFbEMsWUFBTSxTQUFTLEtBQUs7QUFFcEIsMkJBQXFCLEtBQUssTUFBTSxLQUFLLFVBQVUsVUFBVSxDQUFDO0FBQUEsSUFDM0Q7QUFJQSxVQUFNLGVBQWUsa0JBQWtCO0FBRXZDLFVBQU0sZ0JBQWdCLGFBQWEsb0JBQW9CLGtCQUFrQjtBQUN6RSxXQUFPLGFBQWE7QUFDcEIsb0JBQWdCLElBQUksYUFBYTtBQUNqQyxVQUFNLGFBQWEsY0FBYztBQUVqQyxVQUFNLGVBQWUscUJBQXFCLFVBQVUsQ0FBQztBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFFBQUk7QUFFSjtBQUNDLFlBQU0sY0FBYyxrQkFBa0I7QUFDdEMsWUFBTSxnQkFBZ0IsZ0JBQWdCLElBQUksa0JBQWtCLFdBQVcsQ0FBQztBQUN4RSxZQUFNLGFBQWEsY0FBYztBQUVqQyxZQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksV0FBVyxpQkFBaUIseUJBQXlCLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUMvSCxxQkFBZSxXQUFXLFFBQVE7QUFDbEMsWUFBTSxTQUFTLEtBQUs7QUFFcEIsYUFBTyxZQUFZLFdBQVcsWUFBWSxFQUFFLFFBQVEsQ0FBQztBQUNyRCxhQUFPLFlBQVksV0FBVyxZQUFZLEVBQUUsQ0FBQyxFQUFFLG1CQUFtQixJQUFJO0FBRXRFLDJCQUFxQixLQUFLLE1BQU0sS0FBSyxVQUFVLFVBQVUsQ0FBQztBQUMxRCxhQUFPLFlBQVksbUJBQW1CLFNBQVMsUUFBUSxDQUFDO0FBQ3hELGFBQU8sWUFBWSxtQkFBbUIsU0FBUyxDQUFDLEVBQUUsbUJBQW1CLElBQUk7QUFBQSxJQUMxRTtBQUVBLFVBQU0sZUFBZSxrQkFBa0I7QUFDdkMsVUFBTSxnQkFBZ0IsYUFBYSxvQkFBb0Isa0JBQWtCO0FBQ3pFLFdBQU8sYUFBYTtBQUNwQixvQkFBZ0IsSUFBSSxhQUFhO0FBQ2pDLFVBQU0sYUFBYSxjQUFjO0FBRWpDLFdBQU8sWUFBWSxXQUFXLFlBQVksRUFBRSxRQUFRLENBQUM7QUFDckQsV0FBTyxZQUFZLFdBQVcsWUFBWSxFQUFFLENBQUMsRUFBRSxtQkFBbUIsSUFBSTtBQUFBLEVBQ3ZFLENBQUM7QUFFRCxPQUFLLHFGQUFxRixZQUFZO0FBQ3JHLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLGtCQUFrQixXQUFXO0FBQzlDLFVBQU0sa0JBQWtCLFNBQVMsT0FBTztBQUd4QyxVQUFNLGVBQWUsZ0JBQWdCLElBQUksWUFBWSx1QkFBdUIsaUJBQWlCLGdCQUFnQixDQUFFO0FBQy9HLFdBQU8sR0FBRyxjQUFjLGtEQUFrRDtBQUcxRSxhQUFTLFFBQVE7QUFDakIsVUFBTSxZQUFZLHNCQUFzQjtBQUd4QyxVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksaUJBQWlCLHNCQUFzQjtBQUFBLE1BQ3JGLE9BQU8scUJBQXFCO0FBQUEsTUFDNUIsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUNELFdBQU8sWUFBWSxTQUFTLE1BQU0sUUFBUTtBQUcxQyxpQkFBYSxRQUFRO0FBQUEsRUFDdEIsQ0FBQztBQUVELE9BQUssdUJBQXVCLFlBQVk7QUFDdkMsVUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxVQUFNLFdBQVcsWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDeEUsVUFBTSxRQUFRLFNBQVM7QUFFdkIsUUFBSSxXQUFXO0FBQ2Ysb0JBQWdCLElBQUksWUFBWSxvQkFBb0IsT0FBSztBQUN4RCxpQkFBVyxZQUFZLEVBQUUsa0JBQWtCO0FBQzFDLFlBQUksU0FBUyxTQUFTLE1BQU0sTUFBTSxnQkFBZ0IsU0FBUyxHQUFHO0FBQzdELHFCQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLGFBQVMsUUFBUTtBQUNqQixVQUFNLFlBQVksc0JBQXNCO0FBQ3hDLFdBQU8sWUFBWSxVQUFVLElBQUk7QUFBQSxFQUNsQyxDQUFDO0FBRUQsT0FBSyxpREFBaUQsWUFBWTtBQUNqRSxRQUFJO0FBQ0osVUFBTSxxQkFBcUIsSUFBSSxnQkFBaUM7QUFDaEUsVUFBTSxpQkFBMkM7QUFBQSxNQUNoRCxNQUFNLFNBQVM7QUFDZCxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsTUFDQSxpQkFBaUIsU0FBUyxRQUFRLFNBQVMsT0FBTztBQUNqRCx5QkFBaUI7QUFDakIsd0JBQWdCLElBQUksTUFBTSx3QkFBd0IsTUFBTSxtQkFBbUIsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3hGLGVBQU8sbUJBQW1CO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBRUEsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsa0JBQWtCLEVBQUUsR0FBRyxhQUFhLGdCQUFnQixHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDNUgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixrQkFBa0IsY0FBYyxDQUFDO0FBRWxHLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLFlBQVkscUJBQXFCLGtCQUFrQixJQUFJO0FBQ3hFLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxTQUFTLE9BQU8saUJBQWlCLGdCQUFnQixFQUFFLFNBQVMsaUJBQWlCLENBQUM7QUFDN0gsbUJBQWUsV0FBVyxRQUFRO0FBQ2xDLFVBQU0sU0FBUyxLQUFLO0FBRXBCLFdBQU8sR0FBRyxjQUFjO0FBQ3hCLFdBQU8sWUFBWSxlQUFlLHlCQUF5QixLQUFLO0FBRWhFLGFBQVMsUUFBUTtBQUNqQixVQUFNLFlBQVksc0JBQXNCO0FBRXhDLFdBQU8sWUFBWSxlQUFlLHlCQUF5QixJQUFJO0FBQUEsRUFDaEUsQ0FBQztBQUVELE9BQUssc0RBQXNELFlBQVk7QUFDdEUsVUFBTSxpQkFBaUIsSUFBSSxnQkFBc0I7QUFDakQsVUFBTSxrQkFBa0IsSUFBSSxnQkFBc0I7QUFDbEQsUUFBSSwwQkFBMEI7QUFFOUIsVUFBTSxZQUFzQztBQUFBLE1BQzNDLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLHVCQUFlLFNBQVM7QUFDeEIsY0FBTSxnQkFBZ0I7QUFDdEIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLE1BQ0Esa0JBQWtCLFdBQW1CLE9BQWdCO0FBQ3BELGtDQUEwQjtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLFNBQVMsQ0FBQztBQUV4RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBR3ZCLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixpQkFBaUIsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUMvRyxtQkFBZSxXQUFXLFFBQVE7QUFHbEMsVUFBTSxlQUFlO0FBR3JCLFVBQU0sbUJBQW1CLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLG9CQUFvQjtBQUFBLE1BQ2pHLFNBQVM7QUFBQSxNQUNULE9BQU8scUJBQXFCO0FBQUEsSUFDN0IsQ0FBQztBQUNELFdBQU8sWUFBWSxpQkFBaUIsTUFBTSxRQUFRO0FBR2xELFdBQU8sWUFBWSx5QkFBeUIsTUFBTSxzRUFBc0U7QUFHeEgsb0JBQWdCLFNBQVM7QUFDekIsVUFBTSxTQUFTLEtBQUs7QUFBQSxFQUNyQixDQUFDO0FBRUQsT0FBSyxpRUFBaUUsWUFBWTtBQUNqRixVQUFNLGlCQUFpQixJQUFJLGdCQUFzQjtBQUNqRCxVQUFNLGtCQUFrQixJQUFJLGdCQUFzQjtBQUNsRCxVQUFNLGtCQUE0QixDQUFDO0FBRW5DLFVBQU0sWUFBc0M7QUFBQSxNQUMzQyxNQUFNLE9BQU8sU0FBUyxVQUFVLFNBQVMsT0FBTztBQUMvQyx3QkFBZ0IsS0FBSyxRQUFRLE9BQU87QUFDcEMsWUFBSSxnQkFBZ0IsV0FBVyxHQUFHO0FBQ2pDLHlCQUFlLFNBQVM7QUFDeEIsZ0JBQU0sZ0JBQWdCO0FBQUEsUUFDdkI7QUFDQSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLFNBQVMsQ0FBQztBQUV4RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBR3ZCLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixpQkFBaUIsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUMvRyxtQkFBZSxXQUFXLFFBQVE7QUFHbEMsVUFBTSxlQUFlO0FBR3JCLFVBQU0sWUFBWSxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixhQUFhLEVBQUUsU0FBUyxhQUFhLE9BQU8scUJBQXFCLFNBQVMsQ0FBQztBQUNsSixVQUFNLFlBQVksTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsYUFBYSxFQUFFLFNBQVMsYUFBYSxPQUFPLHFCQUFxQixTQUFTLENBQUM7QUFDbEosVUFBTSxZQUFZLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLGFBQWEsRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsU0FBUyxDQUFDO0FBQ2xKLFdBQU8sR0FBRyxlQUFlLFNBQVMsU0FBUyxDQUFDO0FBQzVDLFdBQU8sR0FBRyxlQUFlLFNBQVMsU0FBUyxDQUFDO0FBQzVDLFdBQU8sR0FBRyxlQUFlLFNBQVMsU0FBUyxDQUFDO0FBRzVDLG9CQUFnQixTQUFTO0FBQ3pCLFVBQU0sU0FBUyxLQUFLO0FBR3BCLFVBQU0sVUFBVTtBQUNoQixVQUFNLFVBQVU7QUFDaEIsVUFBTSxVQUFVO0FBR2hCLFdBQU8sWUFBWSxnQkFBZ0IsUUFBUSxHQUFHLDhEQUE4RDtBQUU1RyxXQUFPLEdBQUcsZ0JBQWdCLENBQUMsRUFBRSxTQUFTLFdBQVcsR0FBRywyQ0FBMkM7QUFDL0YsV0FBTyxHQUFHLGdCQUFnQixDQUFDLEVBQUUsU0FBUyxXQUFXLEdBQUcsMkNBQTJDO0FBQy9GLFdBQU8sR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsV0FBVyxHQUFHLDJDQUEyQztBQUMvRixXQUFPLEdBQUcsZ0JBQWdCLENBQUMsRUFBRSxTQUFTLE1BQU0sR0FBRyxpREFBaUQ7QUFBQSxFQUNqRyxDQUFDO0FBRUQsT0FBSyxvR0FBb0csWUFBWTtBQUlwSCxVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sb0JBQW9CLENBQUM7QUFFbkYsVUFBTSxnQkFBOEMsZ0JBQWdCLGNBQWMsS0FBSztBQUV2RixVQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUN4RCxvQkFBZ0IsSUFBSSxvQkFBb0IsbUNBQW1DLGFBQWE7QUFBQSxNQUN2RiwyQkFBMkIsQ0FBQyxhQUF5QyxRQUFRLFFBQVE7QUFBQSxRQUNwRixpQkFBaUI7QUFBQTtBQUFBLFFBRWpCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sV0FBVyxRQUFRLGdCQUFnQixhQUFhLFlBQVksQ0FBQztBQUFBLFFBQy9FLGFBQWEsZ0JBQWlDLENBQUMsQ0FBQztBQUFBLFFBQ2hEO0FBQUEsUUFDQSxpQ0FBaUMsWUFBWTtBQUFBLFFBQzdDLGVBQWUsTUFBTTtBQUFBLFFBQ3JCLFNBQVMsTUFBTTtBQUFBLFFBQUU7QUFBQSxNQUNsQixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxzQkFBc0IsbUJBQW1CO0FBRW5FLFVBQU0sa0JBQTRCLENBQUM7QUFDbkMsVUFBTSxrQkFBa0IsSUFBSSxnQkFBc0I7QUFDbEQsVUFBTSxRQUFrQztBQUFBLE1BQ3ZDLE1BQU0sT0FBTyxTQUFTO0FBQ3JCLHdCQUFnQixLQUFLLFFBQVEsT0FBTztBQUNwQyx3QkFBZ0IsU0FBUztBQUN6QixlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLEtBQUssQ0FBQztBQUVwRixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLGlCQUFpQixrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUNsSCxXQUFPLEdBQUcsR0FBRztBQUNiLG9CQUFnQixJQUFJLEdBQUc7QUFFdkIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLGlCQUFpQixvQkFBb0IsRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsU0FBUyxDQUFDO0FBQ2xKLFdBQU8sR0FBRyxlQUFlLFNBQVMsUUFBUSxDQUFDO0FBRzNDLFVBQU0sZ0JBQWdCO0FBQ3RCLFVBQU0sU0FBUztBQUNmLFVBQU0sUUFBUSxDQUFDO0FBRWYsV0FBTyxZQUFZLGdCQUFnQixPQUFPLE9BQUssRUFBRSxTQUFTLGtCQUFrQixDQUFDLEVBQUUsUUFBUSxHQUFHLGlFQUFpRTtBQUMzSixVQUFNLFFBQVEsWUFBWSxXQUFXLGVBQWU7QUFDcEQsV0FBTyxZQUFZLE1BQU0sbUJBQW1CLEVBQUUsUUFBUSxHQUFHLHdEQUF3RDtBQUdqSCxVQUFNLFFBQVEsTUFBTSxZQUFZLFlBQVksaUJBQWlCLGlCQUFpQixFQUFFLFNBQVMsWUFBWSxDQUFDO0FBQ3RHLFdBQU8sWUFBWSxNQUFNLE1BQU0sVUFBVTtBQUd6QyxrQkFBYyxJQUFJLE1BQU0sTUFBUztBQUNqQyxVQUFNLFFBQVEsQ0FBQztBQUNmLFdBQU8sWUFBWSxnQkFBZ0IsT0FBTyxPQUFLLEVBQUUsU0FBUyxrQkFBa0IsQ0FBQyxFQUFFLFFBQVEsR0FBRyw2REFBNkQ7QUFBQSxFQUN4SixDQUFDO0FBRUQsT0FBSyx3SUFBd0ksWUFBWTtBQUd4SixVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sb0JBQW9CLENBQUM7QUFFbkYsVUFBTSxnQkFBOEMsZ0JBQWdCLGNBQWMsS0FBSztBQUV2RixVQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUN4RCxvQkFBZ0IsSUFBSSxvQkFBb0IsbUNBQW1DLGFBQWE7QUFBQSxNQUN2RiwyQkFBMkIsQ0FBQyxhQUF5QyxRQUFRLFFBQVE7QUFBQSxRQUNwRixpQkFBaUI7QUFBQSxRQUNqQixTQUFTLENBQUMsRUFBRSxNQUFNLFdBQVcsUUFBUSxnQkFBZ0IsYUFBYSxZQUFZLENBQUM7QUFBQSxRQUMvRSxhQUFhLGdCQUFpQyxDQUFDLENBQUM7QUFBQSxRQUNoRDtBQUFBLFFBQ0EsaUNBQWlDLFlBQVk7QUFBQSxRQUM3QyxlQUFlLE1BQU07QUFBQSxRQUNyQixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssc0JBQXNCLG1CQUFtQjtBQUVuRSxVQUFNLGtCQUE0QixDQUFDO0FBQ25DLFVBQU0sVUFBVSxJQUFJLGdCQUFzQjtBQUMxQyxVQUFNLFFBQWtDO0FBQUEsTUFDdkMsTUFBTSxPQUFPLFNBQVM7QUFDckIsd0JBQWdCLEtBQUssUUFBUSxPQUFPO0FBQ3BDLGdCQUFRLFNBQVM7QUFDakIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFDQSxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxhQUFhLEVBQUUsR0FBRyxhQUFhLFdBQVcsR0FBRyxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQ2xILG9CQUFnQixJQUFJLGlCQUFpQiw0QkFBNEIsYUFBYSxLQUFLLENBQUM7QUFFcEYsVUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxVQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixpQkFBaUIsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDbEgsV0FBTyxHQUFHLEdBQUc7QUFDYixvQkFBZ0IsSUFBSSxHQUFHO0FBRXZCLFVBQU0sU0FBUyxNQUFNLFlBQVksWUFBWSxpQkFBaUIsa0JBQWtCLEVBQUUsU0FBUyxhQUFhLE9BQU8scUJBQXFCLE9BQU8sQ0FBQztBQUM1SSxXQUFPLEdBQUcsZUFBZSxTQUFTLE1BQU0sQ0FBQztBQUV6QyxVQUFNLFFBQVEsWUFBWSxXQUFXLGVBQWU7QUFDcEQsV0FBTyxZQUFZLE1BQU0sbUJBQW1CLEVBQUUsUUFBUSxHQUFHLG1FQUFtRTtBQUU1SCxrQkFBYyxJQUFJLE1BQU0sTUFBUztBQUNqQyxVQUFNLFFBQVE7QUFFZCxXQUFPLEdBQUcsZ0JBQWdCLEtBQUssT0FBSyxFQUFFLFNBQVMsZ0JBQWdCLENBQUMsR0FBRyxnRUFBZ0U7QUFDbkksV0FBTyxZQUFZLE1BQU0sbUJBQW1CLEVBQUUsUUFBUSxHQUFHLG1EQUFtRDtBQUFBLEVBQzdHLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBRTVGLFVBQU0scUJBQXFCLElBQUksY0FBYyxtQkFBbUI7QUFBQSxNQUN0RCxTQUFTLFFBQTBEO0FBQzNFLGVBQU8sUUFBUSxRQUFRLEVBQUUsT0FBTyxDQUFDLEdBQUcsd0JBQXdCLEtBQUssQ0FBQztBQUFBLE1BQ25FO0FBQUEsSUFDRCxFQUFFO0FBQ0YseUJBQXFCLEtBQUssaUJBQWlCLGtCQUFrQjtBQUU3RCxVQUFNLGlCQUFpQixxQkFBcUIsSUFBSSxlQUFlO0FBQy9ELFVBQU0sbUJBQW1CO0FBR3pCLFdBQU8sWUFBWSxlQUFlLFdBQVcsa0JBQWtCLGFBQWEsU0FBUyxHQUFHLE1BQVM7QUFFakcsVUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxVQUFNLFdBQVcsZ0JBQWdCLElBQUksa0JBQWtCLFdBQVcsQ0FBQztBQUNuRSxVQUFNLFFBQVEsU0FBUztBQUd2QixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsY0FBYztBQUNwRixtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFHcEIsV0FBTyxZQUFZLGVBQWUsV0FBVyxrQkFBa0IsYUFBYSxTQUFTLEdBQUcsTUFBTSwyQ0FBMkM7QUFHekksVUFBTSxXQUFXLE1BQU0sWUFBWTtBQUNuQyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsVUFBTSxnQkFBZ0IsU0FBUyxDQUFDLEVBQUUsVUFBVSxTQUFTLFNBQVMsQ0FBQztBQUMvRCxVQUFNLGNBQWMsY0FBYyxLQUFLLFVBQVEsS0FBSyxTQUFTLHFCQUFxQjtBQUNsRixXQUFPLEdBQUcsYUFBYSxzREFBc0Q7QUFHN0UsVUFBTSxZQUFZLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLGdCQUFnQjtBQUN2RixtQkFBZSxXQUFXLFNBQVM7QUFDbkMsVUFBTSxVQUFVLEtBQUs7QUFFckIsVUFBTSxZQUFZLE1BQU0sWUFBWTtBQUNwQyxXQUFPLFlBQVksVUFBVSxRQUFRLENBQUM7QUFDdEMsVUFBTSxpQkFBaUIsVUFBVSxDQUFDLEVBQUUsVUFBVSxTQUFTLFNBQVMsQ0FBQztBQUNqRSxVQUFNLGVBQWUsZUFBZSxLQUFLLFVBQVEsS0FBSyxTQUFTLHFCQUFxQjtBQUNwRixXQUFPLEdBQUcsQ0FBQyxjQUFjLDRFQUE0RTtBQUFBLEVBQ3RHLENBQUM7QUFFRCxPQUFLLHVGQUF1RixZQUFZO0FBR3ZHLFVBQU0scUJBQXFCLElBQUksY0FBYyxtQkFBbUI7QUFBQSxNQUFqQztBQUFBO0FBQzlCLGFBQVEsYUFBYTtBQUFBO0FBQUEsTUFDWixTQUFTLFFBQTBEO0FBQzNFLGFBQUs7QUFHTCxlQUFPLFFBQVEsUUFBUSxFQUFFLE9BQU8sQ0FBQyxHQUFHLHdCQUF3QixLQUFLLGFBQWEsRUFBRSxDQUFDO0FBQUEsTUFDbEY7QUFBQSxJQUNELEVBQUU7QUFDRix5QkFBcUIsS0FBSyxpQkFBaUIsa0JBQWtCO0FBRTdELFVBQU0saUJBQWlCLHFCQUFxQixJQUFJLGVBQWU7QUFDL0QsVUFBTSxtQkFBbUI7QUFHekIsVUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxVQUFNLFdBQVcsZ0JBQWdCLElBQUksa0JBQWtCLFdBQVcsQ0FBQztBQUNuRSxVQUFNLFFBQVEsU0FBUztBQUV2QixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsZUFBZTtBQUNyRixtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFHcEIsV0FBTyxZQUFZLGVBQWUsV0FBVyxrQkFBa0IsYUFBYSxTQUFTLEdBQUcsUUFBVywrQ0FBK0M7QUFFbEosVUFBTSxlQUFlLE1BQU0sWUFBWSxFQUFFLENBQUM7QUFDMUMsV0FBTyxHQUFHLGNBQWMscURBQXFEO0FBRzdFLFVBQU0sWUFBWSxjQUFjLFlBQVk7QUFHNUMsV0FBTyxZQUFZLGVBQWUsV0FBVyxrQkFBa0IsYUFBYSxTQUFTLEdBQUcsTUFBTSwyQ0FBMkM7QUFFekksVUFBTSxXQUFXLE1BQU0sWUFBWTtBQUNuQyxXQUFPLFlBQVksU0FBUyxRQUFRLEdBQUcsNENBQTRDO0FBQ25GLFVBQU0saUJBQWlCLFNBQVMsQ0FBQyxFQUFFLFVBQVUsU0FBUyxTQUFTLENBQUM7QUFDaEUsVUFBTSxlQUFlLGVBQWUsS0FBSyxVQUFRLEtBQUssU0FBUyxxQkFBcUI7QUFDcEYsV0FBTyxHQUFHLGNBQWMsd0VBQXdFO0FBQUEsRUFDakcsQ0FBQztBQUNELE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsVUFBTSxpQkFBaUIsSUFBSSxnQkFBc0I7QUFDakQsVUFBTSxrQkFBa0IsSUFBSSxnQkFBc0I7QUFFbEQsVUFBTSxZQUFzQztBQUFBLE1BQzNDLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLHVCQUFlLFNBQVM7QUFDeEIsY0FBTSxXQUFXLE1BQU0sd0JBQXdCLE1BQU07QUFDcEQsbUJBQVMsUUFBUTtBQUVqQixxQkFBVyxNQUFNLGdCQUFnQixTQUFTLEdBQUcsRUFBRTtBQUFBLFFBQ2hELENBQUM7QUFDRCxjQUFNLGdCQUFnQjtBQUN0QixlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLFNBQVMsQ0FBQztBQUV4RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBRXZCLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixnQkFBZ0IsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUM5RyxtQkFBZSxXQUFXLFFBQVE7QUFFbEMsVUFBTSxlQUFlO0FBR3JCLFVBQU0sWUFBWSwrQkFBK0IsTUFBTSxpQkFBaUIsTUFBTTtBQUc5RSxVQUFNLGNBQWMsTUFBTSxZQUFZLEVBQUUsQ0FBQztBQUN6QyxXQUFPLEdBQUcsWUFBWSxVQUFVLG9EQUFvRDtBQUNwRixXQUFPLFlBQVksWUFBWSxTQUFTLE9BQU8sbUJBQW1CLFdBQVcsdUNBQXVDO0FBQUEsRUFDckgsQ0FBQztBQUVELE9BQUssc0ZBQXNGLFlBQVk7QUFDdEcsVUFBTSxpQkFBaUIsSUFBSSxnQkFBc0I7QUFDakQsVUFBTSxrQkFBa0IsSUFBSSxnQkFBc0I7QUFFbEQsVUFBTSxlQUF5QztBQUFBLE1BQzlDLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLHVCQUFlLFNBQVM7QUFFeEIsY0FBTSxnQkFBZ0I7QUFDdEIsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFFQSxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxnQkFBZ0IsRUFBRSxHQUFHLGFBQWEsY0FBYyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDeEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixnQkFBZ0IsWUFBWSxDQUFDO0FBRTlGLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFFdkIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLGdCQUFnQixFQUFFLFNBQVMsZUFBZSxDQUFDO0FBQ2pILG1CQUFlLFdBQVcsUUFBUTtBQUVsQyxVQUFNLGVBQWU7QUFJckIsVUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBQzdELFlBQU0sWUFBWSwrQkFBK0IsTUFBTSxpQkFBaUIsTUFBTTtBQUFBLElBQy9FLENBQUM7QUFHRCxvQkFBZ0IsU0FBUztBQUN6QixVQUFNLFNBQVMsS0FBSztBQUFBLEVBQ3JCLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxZQUFZO0FBQzNGLFVBQU0saUJBQWlCLElBQUksZ0JBQXNCO0FBQ2pELFVBQU0sa0JBQWtCLElBQUksZ0JBQXNCO0FBQ2xELFVBQU0sa0JBQTRCLENBQUM7QUFFbkMsVUFBTSxZQUFzQztBQUFBLE1BQzNDLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLHdCQUFnQixLQUFLLFFBQVEsT0FBTztBQUNwQyxZQUFJLGdCQUFnQixXQUFXLEdBQUc7QUFDakMseUJBQWUsU0FBUztBQUN4QixnQkFBTSxnQkFBZ0I7QUFBQSxRQUN2QjtBQUNBLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBRUEsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsYUFBYSxFQUFFLEdBQUcsYUFBYSxXQUFXLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGFBQWEsU0FBUyxDQUFDO0FBRXhGLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxZQUFZLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDcEUsVUFBTSxTQUFTLFVBQVU7QUFHekIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE9BQU8saUJBQWlCLGlCQUFpQixFQUFFLFNBQVMsWUFBWSxDQUFDO0FBQ2hILG1CQUFlLFdBQVcsUUFBUTtBQUNsQyxVQUFNLGVBQWU7QUFHckIsVUFBTSxTQUFTLE1BQU0sWUFBWSxZQUFZLE9BQU8saUJBQWlCLGtCQUFrQixFQUFFLFNBQVMsYUFBYSxPQUFPLHFCQUFxQixPQUFPLENBQUM7QUFDbkosV0FBTyxHQUFHLGVBQWUsU0FBUyxNQUFNLENBQUM7QUFHekMsVUFBTSxZQUFZLE9BQU8sbUJBQW1CLEVBQUUsQ0FBQyxFQUFFLFFBQVE7QUFDekQsZ0JBQVkscUJBQXFCLE9BQU8saUJBQWlCLFNBQVM7QUFDbEUsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLEVBQUUsUUFBUSxDQUFDO0FBR3hELFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ3BFLFVBQU0sU0FBUyxVQUFVO0FBQ3pCLFVBQU0sU0FBUyxNQUFNLFlBQVksWUFBWSxPQUFPLGlCQUFpQixrQkFBa0IsRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsUUFBUSxZQUFZLEtBQUssQ0FBQztBQUNySyxXQUFPLEdBQUcsZUFBZSxTQUFTLE1BQU0sQ0FBQztBQUN6QyxXQUFPLFlBQVksT0FBTyxtQkFBbUIsRUFBRSxRQUFRLENBQUM7QUFHeEQsb0JBQWdCLFNBQVM7QUFDekIsVUFBTSxTQUFTLEtBQUs7QUFHcEIsZ0JBQVksdUJBQXVCLE9BQU8sZUFBZTtBQUN6RCxVQUFNLFNBQVMsTUFBTSxPQUFPO0FBQzVCLFdBQU8sR0FBRyxlQUFlLE9BQU8sTUFBTSxDQUFDO0FBQ3ZDLFVBQU0sT0FBTyxLQUFLO0FBR2xCLFdBQU8sWUFBWSxnQkFBZ0IsUUFBUSxDQUFDO0FBQzVDLFdBQU8sR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsZ0JBQWdCLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyw0RkFBNEYsWUFBWTtBQUM1RyxVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBRXZCLGdCQUFZLDhCQUE4QixNQUFNLGlCQUFpQjtBQUFBLE1BQ2hFLEVBQUUsSUFBSSxZQUFZLE1BQU0scUJBQXFCLFFBQVEsU0FBUyx1QkFBdUI7QUFBQSxNQUNyRixFQUFFLElBQUksWUFBWSxNQUFNLHFCQUFxQixRQUFRLFNBQVMsd0JBQXdCO0FBQUEsSUFDdkYsQ0FBQztBQUNELFdBQU87QUFBQSxNQUNOLE1BQU0sbUJBQW1CLEVBQUUsSUFBSSxRQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsSUFBSSxNQUFNLEVBQUUsTUFBTSxNQUFNLEVBQUUsUUFBUSxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQ3RHO0FBQUEsUUFDQyxFQUFFLElBQUksWUFBWSxNQUFNLHFCQUFxQixRQUFRLE1BQU0sdUJBQXVCO0FBQUEsUUFDbEYsRUFBRSxJQUFJLFlBQVksTUFBTSxxQkFBcUIsUUFBUSxNQUFNLHdCQUF3QjtBQUFBLE1BQ3BGO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxNQUFNLG1CQUFtQixFQUFFLENBQUMsRUFBRTtBQUduRCxnQkFBWSw4QkFBOEIsTUFBTSxpQkFBaUI7QUFBQSxNQUNoRSxFQUFFLElBQUksZ0JBQWdCLE1BQU0scUJBQXFCLFVBQVUsU0FBUyxZQUFZO0FBQUEsTUFDaEYsRUFBRSxJQUFJLFlBQVksTUFBTSxxQkFBcUIsUUFBUSxTQUFTLHVCQUF1QjtBQUFBLElBQ3RGLENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTixNQUFNLG1CQUFtQixFQUFFLElBQUksUUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLElBQUksTUFBTSxFQUFFLE1BQU0sTUFBTSxFQUFFLFFBQVEsUUFBUSxLQUFLLEVBQUU7QUFBQSxNQUN0RztBQUFBLFFBQ0MsRUFBRSxJQUFJLGdCQUFnQixNQUFNLHFCQUFxQixVQUFVLE1BQU0sWUFBWTtBQUFBLFFBQzdFLEVBQUUsSUFBSSxZQUFZLE1BQU0scUJBQXFCLFFBQVEsTUFBTSx1QkFBdUI7QUFBQSxNQUNuRjtBQUFBLElBQ0Q7QUFDQSxXQUFPLFlBQVksTUFBTSxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsU0FBUyxjQUFjLDBDQUEwQztBQUVsSCxnQkFBWSw4QkFBOEIsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ25FLFdBQU8sWUFBWSxNQUFNLG1CQUFtQixFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQ3hELENBQUM7QUFFRCxPQUFLLHFHQUFxRyxZQUFZO0FBQ3JILFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFFdkIsZ0JBQVksOEJBQThCLE1BQU0saUJBQWlCO0FBQUEsTUFDaEUsRUFBRSxJQUFJLFlBQVksTUFBTSxxQkFBcUIsUUFBUSxTQUFTLHFCQUFxQjtBQUFBLE1BQ25GLEVBQUUsSUFBSSxZQUFZLE1BQU0scUJBQXFCLFFBQVEsU0FBUyx5QkFBeUI7QUFBQSxJQUN4RixDQUFDO0FBRUQsVUFBTSxZQUEwRSxDQUFDO0FBQ2pGLG9CQUFnQixJQUFJLE1BQU0sMkJBQTJCLE1BQU07QUFDMUQsZ0JBQVUsS0FBSyxNQUFNLG1CQUFtQixFQUFFLElBQUksUUFBTSxFQUFFLElBQUksRUFBRSxRQUFRLElBQUksTUFBTSxFQUFFLE1BQU0sTUFBTSxFQUFFLFFBQVEsUUFBUSxLQUFLLEVBQUUsQ0FBQztBQUFBLElBQ3ZILENBQUMsQ0FBQztBQUVGLFVBQU0sU0FBUztBQUFBLE1BQ2QsRUFBRSxJQUFJLGdCQUFnQixNQUFNLHFCQUFxQixVQUFVLFNBQVMsWUFBWTtBQUFBLE1BQ2hGLEVBQUUsSUFBSSxZQUFZLE1BQU0scUJBQXFCLFFBQVEsU0FBUyx5QkFBeUI7QUFBQSxJQUN4RjtBQUNBLGdCQUFZLDhCQUE4QixNQUFNLGlCQUFpQixNQUFNO0FBQ3ZFLGdCQUFZLDhCQUE4QixNQUFNLGlCQUFpQixNQUFNO0FBRXZFLFdBQU8sZ0JBQWdCLFdBQVcsQ0FBQztBQUFBLE1BQ2xDLEVBQUUsSUFBSSxnQkFBZ0IsTUFBTSxxQkFBcUIsVUFBVSxNQUFNLFlBQVk7QUFBQSxNQUM3RSxFQUFFLElBQUksWUFBWSxNQUFNLHFCQUFxQixRQUFRLE1BQU0seUJBQXlCO0FBQUEsSUFDckYsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxnR0FBZ0csWUFBWTtBQUNoSCxVQUFNLGVBQWUsSUFBSSxnQkFBc0I7QUFDL0MsVUFBTSxnQkFBZ0IsSUFBSSxnQkFBc0I7QUFDaEQsVUFBTSxrQkFBNEIsQ0FBQztBQUVuQyxVQUFNLFlBQXNDO0FBQUEsTUFDM0MsTUFBTSxPQUFPLFNBQVMsVUFBVSxTQUFTLE9BQU87QUFDL0Msd0JBQWdCLEtBQUssUUFBUSxPQUFPO0FBQ3BDLFlBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUNqQyx1QkFBYSxTQUFTO0FBQ3RCLGdCQUFNLElBQUksUUFBYyxhQUFXO0FBQ2xDLGtCQUFNLFdBQVcsTUFBTSx3QkFBd0IsTUFBTTtBQUFFLHVCQUFTLFFBQVE7QUFBRyxzQkFBUTtBQUFBLFlBQUcsQ0FBQztBQUFBLFVBQ3hGLENBQUM7QUFBQSxRQUNGLE9BQU87QUFDTix3QkFBYyxTQUFTO0FBQUEsUUFDeEI7QUFDQSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLFNBQVMsQ0FBQztBQUV4RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBRXZCLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixpQkFBaUIsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUMvRyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxhQUFhO0FBRW5CLFVBQU0sU0FBUyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixrQkFBa0IsRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsT0FBTyxDQUFDO0FBQ2xKLFdBQU8sR0FBRyxlQUFlLFNBQVMsTUFBTSxDQUFDO0FBRXpDLFVBQU0sWUFBWSxNQUFNLG1CQUFtQixFQUFFLENBQUMsRUFBRSxRQUFRO0FBQ3hELFVBQU0sWUFBWSw4QkFBOEIsTUFBTSxpQkFBaUIsU0FBUztBQUNoRixVQUFNLGNBQWM7QUFFcEIsV0FBTyxZQUFZLGdCQUFnQixRQUFRLENBQUM7QUFDNUMsV0FBTyxHQUFHLGdCQUFnQixDQUFDLEVBQUUsU0FBUyxnQkFBZ0IsQ0FBQztBQUN2RCxXQUFPLFlBQVksTUFBTSxtQkFBbUIsRUFBRSxRQUFRLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyw4RkFBOEYsWUFBWTtBQUM5RyxVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sNEJBQTRCLENBQUM7QUFFM0YsVUFBTSxzQkFBc0IsSUFBSSx3QkFBd0I7QUFDeEQsd0JBQW9CLGlCQUFpQixDQUFDO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLElBQ2QsQ0FBQyxDQUFDO0FBQ0Ysb0JBQWdCLElBQUksb0JBQW9CLG1DQUFtQyxhQUFhO0FBQUEsTUFDdkYsMkJBQTJCLGNBQVksUUFBUSxRQUFRO0FBQUEsUUFDdEQsaUJBQWlCO0FBQUEsUUFDakIsU0FBUyxDQUFDO0FBQUEsUUFDVixlQUFlLE1BQU07QUFBQSxRQUNyQixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssc0JBQXNCLG1CQUFtQjtBQUVuRSxVQUFNLGVBQWUsSUFBSSxnQkFBc0I7QUFDL0MsVUFBTSxnQkFBZ0IsSUFBSSxnQkFBc0I7QUFDaEQsVUFBTSxrQkFBNEIsQ0FBQztBQUVuQyxVQUFNLFlBQXNDO0FBQUEsTUFDM0MsTUFBTSxPQUFPLFNBQVMsVUFBVSxTQUFTLE9BQU87QUFDL0Msd0JBQWdCLEtBQUssUUFBUSxPQUFPO0FBQ3BDLFlBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUNqQyx1QkFBYSxTQUFTO0FBQ3RCLGdCQUFNLElBQUksUUFBYyxhQUFXO0FBQ2xDLGtCQUFNLFdBQVcsTUFBTSx3QkFBd0IsTUFBTTtBQUFFLHVCQUFTLFFBQVE7QUFBRyxzQkFBUTtBQUFBLFlBQUcsQ0FBQztBQUFBLFVBQ3hGLENBQUM7QUFBQSxRQUNGLE9BQU87QUFDTix3QkFBYyxTQUFTO0FBQUEsUUFDeEI7QUFDQSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLGFBQWEsRUFBRSxHQUFHLGFBQWEsV0FBVyxHQUFHLFdBQVcsS0FBSyxDQUFDLENBQUM7QUFDbEgsb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0QixhQUFhLFNBQVMsQ0FBQztBQUV4RixVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLGlCQUFpQixrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUNsSCxXQUFPLEdBQUcsR0FBRztBQUNiLG9CQUFnQixJQUFJLEdBQUc7QUFFdkIsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLGlCQUFpQixpQkFBaUIsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUN6RyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxhQUFhO0FBR25CLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxpQkFBaUIsb0JBQW9CLEVBQUUsU0FBUyxhQUFhLE9BQU8scUJBQXFCLFNBQVMsQ0FBQztBQUNsSixXQUFPLEdBQUcsZUFBZSxTQUFTLFFBQVEsQ0FBQztBQUUzQyxVQUFNLFFBQVEsWUFBWSxXQUFXLGVBQWU7QUFDcEQsV0FBTyxZQUFZLE1BQU0sbUJBQW1CLEVBQUUsUUFBUSxDQUFDO0FBQ3ZELFVBQU0sWUFBWSxNQUFNLG1CQUFtQixFQUFFLENBQUMsRUFBRSxRQUFRO0FBR3hELFVBQU0sWUFBWSw4QkFBOEIsaUJBQWlCLFNBQVM7QUFDMUUsVUFBTSxjQUFjO0FBRXBCLFdBQU8sWUFBWSxnQkFBZ0IsUUFBUSxDQUFDO0FBQzVDLFdBQU8sR0FBRyxnQkFBZ0IsQ0FBQyxFQUFFLFNBQVMsa0JBQWtCLENBQUM7QUFDekQsV0FBTyxZQUFZLE1BQU0sbUJBQW1CLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssaUZBQWlGLFlBQVk7QUFPakcsVUFBTSxrQkFBNEIsQ0FBQztBQUNuQyxVQUFNLHNCQUFzQixJQUFJLGdCQUFzQjtBQUN0RCxVQUFNLG1CQUFtQixJQUFJLGdCQUFzQjtBQUVuRCxVQUFNLFlBQXNDO0FBQUEsTUFDM0MsTUFBTSxPQUFPLFNBQVMsVUFBVSxTQUFTLE9BQU87QUFDL0Msd0JBQWdCLEtBQUssUUFBUSxPQUFPO0FBRXBDLFlBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUVqQyw4QkFBb0IsU0FBUztBQUM3QixnQkFBTSxpQkFBaUI7QUFBQSxRQUN4QjtBQUVBLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBRUEsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsYUFBYSxFQUFFLEdBQUcsYUFBYSxXQUFXLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGFBQWEsU0FBUyxDQUFDO0FBRXhGLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxZQUFZLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDcEUsVUFBTSxTQUFTLFVBQVU7QUFHekIsVUFBTSxZQUFZLE1BQU0sWUFBWSxZQUFZLE9BQU8saUJBQWlCLGFBQWEsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUM3RyxtQkFBZSxXQUFXLFNBQVM7QUFDbkMsVUFBTSxvQkFBb0I7QUFHMUIsVUFBTSxLQUFLLE1BQU0sWUFBWSxZQUFZLE9BQU8saUJBQWlCLFlBQVksRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsT0FBTyxDQUFDO0FBQ3pJLFVBQU0sS0FBSyxNQUFNLFlBQVksWUFBWSxPQUFPLGlCQUFpQixZQUFZLEVBQUUsU0FBUyxhQUFhLE9BQU8scUJBQXFCLE9BQU8sQ0FBQztBQUN6SSxVQUFNLEtBQUssTUFBTSxZQUFZLFlBQVksT0FBTyxpQkFBaUIsWUFBWSxFQUFFLFNBQVMsYUFBYSxPQUFPLHFCQUFxQixPQUFPLENBQUM7QUFDekksV0FBTyxHQUFHLGVBQWUsU0FBUyxFQUFFLENBQUM7QUFDckMsV0FBTyxHQUFHLGVBQWUsU0FBUyxFQUFFLENBQUM7QUFDckMsV0FBTyxHQUFHLGVBQWUsU0FBUyxFQUFFLENBQUM7QUFDckMsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLEVBQUUsUUFBUSxDQUFDO0FBQ3hELFdBQU8sWUFBWSxPQUFPLFlBQVksRUFBRSxRQUFRLEdBQUcseUNBQXlDO0FBSTVGLHFCQUFpQixTQUFTO0FBQzFCLFVBQU0sVUFBVSxLQUFLO0FBR3JCLFdBQU8sWUFBWSxPQUFPLG1CQUFtQixFQUFFLFFBQVEsR0FBRyw0Q0FBNEM7QUFHdEcsVUFBTSxJQUFJLFFBQVEsYUFBVyxXQUFXLFNBQVMsQ0FBQyxDQUFDO0FBSW5ELFVBQU0sWUFBWSxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ3BFLFVBQU0sU0FBUyxVQUFVO0FBR3pCLFVBQU0sWUFBWSwrQkFBK0IsT0FBTyxlQUFlO0FBR3ZFLFVBQU0sWUFBWSxDQUFDLEdBQUcsT0FBTyxtQkFBbUIsQ0FBQztBQUNqRCxlQUFXLEtBQUssV0FBVztBQUMxQixrQkFBWSxxQkFBcUIsT0FBTyxpQkFBaUIsRUFBRSxRQUFRLEVBQUU7QUFBQSxJQUN0RTtBQUNBLFdBQU8sWUFBWSxPQUFPLG1CQUFtQixFQUFFLFFBQVEsQ0FBQztBQUd4RCxVQUFNLFVBQVUsTUFBTSxZQUFZLFlBQVksT0FBTyxpQkFBaUIsWUFBWSxFQUFFLFNBQVMsYUFBYSxPQUFPLHFCQUFxQixRQUFRLFlBQVksS0FBSyxDQUFDO0FBQ2hLLFVBQU0sVUFBVSxNQUFNLFlBQVksWUFBWSxPQUFPLGlCQUFpQixZQUFZLEVBQUUsU0FBUyxhQUFhLE9BQU8scUJBQXFCLFFBQVEsWUFBWSxLQUFLLENBQUM7QUFDaEssVUFBTSxVQUFVLE1BQU0sWUFBWSxZQUFZLE9BQU8saUJBQWlCLFlBQVksRUFBRSxTQUFTLGFBQWEsT0FBTyxxQkFBcUIsUUFBUSxZQUFZLEtBQUssQ0FBQztBQUNoSyxXQUFPLEdBQUcsZUFBZSxTQUFTLE9BQU8sQ0FBQztBQUMxQyxXQUFPLEdBQUcsZUFBZSxTQUFTLE9BQU8sQ0FBQztBQUMxQyxXQUFPLEdBQUcsZUFBZSxTQUFTLE9BQU8sQ0FBQztBQUMxQyxXQUFPLFlBQVksT0FBTyxtQkFBbUIsRUFBRSxRQUFRLEdBQUcsMENBQTBDO0FBR3BHLGdCQUFZLHVCQUF1QixPQUFPLGVBQWU7QUFDekQsVUFBTSxVQUFVLE1BQU0sUUFBUTtBQUM5QixXQUFPLEdBQUcsZUFBZSxPQUFPLE9BQU8sQ0FBQztBQUN4QyxVQUFNLFFBQVEsS0FBSztBQUVuQixVQUFNLFVBQVUsTUFBTSxRQUFRO0FBQzlCLFdBQU8sR0FBRyxlQUFlLE9BQU8sT0FBTyxDQUFDO0FBQ3hDLFVBQU0sUUFBUSxLQUFLO0FBRW5CLFVBQU0sVUFBVSxNQUFNLFFBQVE7QUFDOUIsV0FBTyxHQUFHLGVBQWUsT0FBTyxPQUFPLENBQUM7QUFDeEMsVUFBTSxRQUFRLEtBQUs7QUFHbkIsVUFBTSxvQkFBb0IsZ0JBQWdCLE9BQU8sT0FBSyxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBQzNFLFdBQU8sR0FBRyxrQkFBa0IsVUFBVSxHQUFHLCtDQUErQyxrQkFBa0IsTUFBTSxFQUFFO0FBQ2xILFVBQU0sWUFBWSxrQkFBa0IsTUFBTSxFQUFFO0FBQzVDLFdBQU8sR0FBRyxVQUFVLENBQUMsRUFBRSxTQUFTLFVBQVUsQ0FBQztBQUMzQyxXQUFPLEdBQUcsVUFBVSxDQUFDLEVBQUUsU0FBUyxVQUFVLENBQUM7QUFDM0MsV0FBTyxHQUFHLFVBQVUsQ0FBQyxFQUFFLFNBQVMsVUFBVSxDQUFDO0FBQUEsRUFDNUMsQ0FBQztBQUVELE9BQUssbUdBQW1HLFlBQVk7QUFDbkgsVUFBTSxxQkFBcUI7QUFDM0IsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxvQkFBb0IsTUFBTSxvQkFBb0IsQ0FBQztBQUcxRixVQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUN4RCx5QkFBcUIsS0FBSyxzQkFBc0IsbUJBQW1CO0FBRW5FLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsaUJBQWlCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQ2xILFdBQU8sWUFBWSxLQUFLLFFBQVcsd0RBQXdEO0FBQUEsRUFDNUYsQ0FBQztBQUVELE9BQUssd0ZBQXdGLFlBQVk7QUFDeEcsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sbUJBQW1CLElBQUksS0FBSyxFQUFFLFFBQVEsY0FBYyxNQUFNLHlCQUF5QixDQUFDO0FBQzFGLFVBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLGNBQWMsTUFBTSxvQkFBb0IsQ0FBQztBQUdqRixVQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUd4RCxvQkFBZ0IsSUFBSSxvQkFBb0IsbUNBQW1DLGNBQWM7QUFBQSxNQUN4RiwyQkFBMkIsQ0FBQyxXQUFnQixXQUE4QjtBQUN6RSxlQUFPLFFBQVEsUUFBUTtBQUFBLFVBQ3RCLGlCQUFpQjtBQUFBLFVBQ2pCLFNBQVMsQ0FBQztBQUFBLFVBQ1YsZUFBZSxNQUFNO0FBQUEsVUFDckIsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRix3QkFBb0IsaUJBQWlCLGtCQUFrQixTQUFTLG1CQUFtQjtBQUNuRix3QkFBb0IsaUJBQWlCLGtCQUFrQixRQUFRLFNBQVM7QUFHeEUsd0JBQW9CLDJCQUEyQixhQUFhO0FBQUEsTUFDM0QsVUFBVTtBQUFBLE1BQ1YsT0FBTztBQUFBLE1BQ1AsUUFBUSxFQUFFLFNBQVMsS0FBSyxJQUFJLEdBQUcsb0JBQW9CLFFBQVcsa0JBQWtCLE9BQVU7QUFBQSxJQUMzRjtBQUVBLHlCQUFxQixLQUFLLHNCQUFzQixtQkFBbUI7QUFHbkUsVUFBTSxjQUF3QztBQUFBLE1BQzdDLE1BQU0sT0FBTyxTQUFTLFVBQVUsU0FBUyxPQUFPO0FBQy9DLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBQ0Esb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsY0FBYyxFQUFFLEdBQUcsYUFBYSxZQUFZLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNwSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGNBQWMsV0FBVyxDQUFDO0FBRTNGLFVBQU0sY0FBYyxrQkFBa0I7QUFHdEMsVUFBTSxjQUFjLE1BQU0sWUFBWSxxQkFBcUIsa0JBQWtCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQzNILFdBQU8sR0FBRyxhQUFhLDhCQUE4QjtBQUNyRCxvQkFBZ0IsSUFBSSxXQUFXO0FBRy9CLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxrQkFBa0IsU0FBUyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQ25HLG1CQUFlLFdBQVcsUUFBUTtBQUNsQyxVQUFNLFNBQVMsS0FBSztBQUdwQixVQUFNLFdBQVcsWUFBWSxXQUFXLFlBQVk7QUFDcEQsV0FBTyxHQUFHLFVBQVUsNkNBQTZDO0FBQ2pFLFdBQU87QUFBQSxNQUNOLHNCQUFzQixnQkFBZ0Isb0JBQW9CLGtCQUFrQixZQUFZLENBQUM7QUFBQSxNQUN6RjtBQUFBLFFBQ0MsRUFBRSxVQUFVLFNBQVMsT0FBTyxvQkFBb0I7QUFBQSxRQUNoRCxFQUFFLFVBQVUsUUFBUSxPQUFPLFVBQVU7QUFBQSxNQUN0QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLHlGQUF5RixNQUFNO0FBQ3BHLFVBQU0sZUFBZTtBQU9yQixhQUFTLG9CQUFvQixNQUlxRTtBQUNqRyxZQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUN4RCxzQkFBZ0IsSUFBSSxvQkFBb0IsbUNBQW1DLGNBQWM7QUFBQSxRQUN4RiwyQkFBMkIsS0FBSyxtQkFBbUIsQ0FBQyxhQUFrQixRQUFRLFFBQVE7QUFBQSxVQUNyRixpQkFBaUI7QUFBQSxVQUNqQixTQUFTLENBQUM7QUFBQSxVQUNWLGVBQWUsTUFBTTtBQUFBLFVBQ3JCLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQixDQUFDO0FBQUEsTUFDRixDQUFDLENBQUM7QUFDRiwwQkFBb0IsMkJBQTJCLEtBQUs7QUFDcEQsMkJBQXFCLEtBQUssc0JBQXNCLG1CQUFtQjtBQUVuRSxZQUFNLGNBQXdDLEVBQUUsUUFBUSxLQUFLLFdBQVcsYUFBYSxDQUFDLElBQUk7QUFDMUYsc0JBQWdCLElBQUksaUJBQWlCLGNBQWMsY0FBYyxFQUFFLEdBQUcsYUFBYSxZQUFZLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNwSCxzQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGNBQWMsV0FBVyxDQUFDO0FBRTNGLFlBQU0sVUFBVSxrQkFBa0I7QUFDbEMsWUFBTSxtQkFBbUIsSUFBSSxLQUFLLEVBQUUsUUFBUSxjQUFjLE1BQU0sd0JBQXdCLENBQUM7QUFDekYsYUFBTyxFQUFFLFNBQVMsa0JBQWtCLG9CQUFvQjtBQUFBLElBQ3pEO0FBRUEsYUFBUyxTQUFTLFVBQWlDO0FBQ2xELGFBQU8sRUFBRSxVQUFVLE9BQU8sZ0JBQWdCLFFBQVEsRUFBRSxTQUFTLEtBQUssSUFBSSxHQUFHLG9CQUFvQixRQUFXLGtCQUFrQixPQUFVLEVBQUU7QUFBQSxJQUN2STtBQUVBLFNBQUssOEVBQThFLFlBQVk7QUFDOUYsWUFBTSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsY0FBYyxNQUFNLG1CQUFtQixDQUFDO0FBQ2hGLFVBQUksY0FBYztBQUlsQixZQUFNLFlBQVksSUFBSSxnQkFBc0I7QUFDNUMsWUFBTSxFQUFFLFNBQVMsaUJBQWlCLElBQUksb0JBQW9CO0FBQUEsUUFDekQsWUFBWSxZQUFZO0FBQUU7QUFBZSxpQkFBTyxTQUFTLFlBQVk7QUFBQSxRQUFHO0FBQUEsUUFDeEUsUUFBUSxZQUFZO0FBQUUsZ0JBQU0sVUFBVTtBQUFHLGlCQUFPLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDckQsQ0FBQztBQUNELHNCQUFnQixJQUFLLE1BQU0sUUFBUSxxQkFBcUIsa0JBQWtCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJLENBQUc7QUFJM0gsWUFBTSxLQUFLLFFBQVEsWUFBWSxrQkFBa0IsU0FBUyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQ25GLFlBQU0sS0FBSyxRQUFRLFlBQVksa0JBQWtCLFNBQVMsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUNuRixZQUFNLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUUzQyxhQUFPLFlBQVksYUFBYSxHQUFHLGdEQUFnRDtBQUNuRixhQUFPLGdCQUFnQixDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksRUFBRSxLQUFLLEdBQUcsQ0FBQyxZQUFZLE1BQU0sR0FBRyxpREFBaUQ7QUFDekgsYUFBTyxHQUFHLFFBQVEsV0FBVyxZQUFZLEdBQUcsMENBQTBDO0FBRXRGLGdCQUFVLFNBQVM7QUFDbkIsWUFBTSxPQUFPLGVBQWUsT0FBTyxFQUFFLElBQUksS0FBSztBQUM5QyxxQkFBZSxXQUFXLElBQUk7QUFDOUIsWUFBTSxLQUFLLEtBQUs7QUFBQSxJQUNqQixDQUFDO0FBRUQsU0FBSyxxRUFBcUUsWUFBWTtBQUNyRixZQUFNLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxjQUFjLE1BQU0sa0JBQWtCLENBQUM7QUFDL0UsVUFBSSxjQUFjO0FBQ2xCLFlBQU0sRUFBRSxTQUFTLGlCQUFpQixJQUFJLG9CQUFvQjtBQUFBLFFBQ3pELFlBQVksWUFBWSxTQUFTLFlBQVk7QUFBQSxRQUM3QyxRQUFRLFlBQVk7QUFBRTtBQUFlLGlCQUFPLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDaEQsZ0JBQWdCLGNBQVksUUFBUSxRQUFRO0FBQUEsVUFDM0MsaUJBQWlCO0FBQUEsVUFDakIsU0FBUyxDQUFDO0FBQUEsVUFDVixlQUFlLE1BQU07QUFBQSxVQUNyQixZQUFZLGdCQUFnQixTQUFTLFNBQVMsTUFBTSxhQUFhLFNBQVMsQ0FBQztBQUFBLFVBQzNFLFNBQVMsTUFBTTtBQUFBLFVBQUU7QUFBQSxRQUNsQixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQ0Qsc0JBQWdCLElBQUssTUFBTSxRQUFRLHFCQUFxQixrQkFBa0Isa0JBQWtCLE1BQU0sa0JBQWtCLElBQUksQ0FBRztBQUUzSCxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVksa0JBQWtCLFNBQVMsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUM3RixZQUFNLFlBQVksUUFBUSxXQUFXLFlBQVk7QUFFakQsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0E7QUFBQSxRQUNBLGNBQWMsV0FBVyxZQUFZLEVBQUU7QUFBQSxNQUN4QyxHQUFHO0FBQUEsUUFDRixRQUFRLEVBQUUsTUFBTSxZQUFZLFFBQVEsd0JBQXdCLG9CQUFvQixhQUFhO0FBQUEsUUFDN0YsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLE1BQ2YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0ZBQW9GLFlBQVk7QUFDcEcsWUFBTSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsY0FBYyxNQUFNLGFBQWEsQ0FBQztBQUMxRSxVQUFJLGNBQWM7QUFDbEIsWUFBTSxFQUFFLFNBQVMsaUJBQWlCLElBQUksb0JBQW9CO0FBQUEsUUFDekQsWUFBWSxZQUFZO0FBQUU7QUFBZSxpQkFBTyxTQUFTLFlBQVk7QUFBQSxRQUFHO0FBQUEsTUFDekUsQ0FBQztBQUNELHNCQUFnQixJQUFLLE1BQU0sUUFBUSxxQkFBcUIsa0JBQWtCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJLENBQUc7QUFFM0gsWUFBTSxLQUFLLE1BQU0sUUFBUSxZQUFZLGtCQUFrQixTQUFTLEVBQUUsU0FBUyxhQUFhLENBQUM7QUFDekYscUJBQWUsV0FBVyxFQUFFO0FBQzVCLFlBQU0sR0FBRyxLQUFLO0FBRWQsWUFBTSxZQUFZLFFBQVEsV0FBVyxZQUFZO0FBQ2pELGFBQU8sR0FBRyxXQUFXLHNDQUFzQztBQUMzRCxZQUFNLHFCQUFxQixVQUFVLFlBQVksRUFBRTtBQU1uRCxZQUFNLEtBQUssTUFBTSxRQUFRLFlBQVksa0JBQWtCLFVBQVUsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUMxRixxQkFBZSxXQUFXLEVBQUU7QUFDNUIsWUFBTSxHQUFHLEtBQUs7QUFFZCxhQUFPLFlBQVksYUFBYSxHQUFHLHFEQUFxRDtBQUN4RixhQUFPLFlBQVksR0FBRyxvQkFBb0IsU0FBUyxHQUFHLGFBQWEsU0FBUyxHQUFHLDZEQUE2RDtBQUM1SSxhQUFPLFlBQVksVUFBVSxZQUFZLEVBQUUsUUFBUSxxQkFBcUIsR0FBRyw4Q0FBOEM7QUFBQSxJQUMxSCxDQUFDO0FBRUQsU0FBSyw2RUFBNkUsWUFBWTtBQUM3RixZQUFNLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxjQUFjLE1BQU0sdUJBQXVCLENBQUM7QUFDcEYsWUFBTSxhQUFhLGdCQUF5QixjQUFjLEtBQUs7QUFDL0QsVUFBSSxjQUFjO0FBQ2xCLFlBQU0sRUFBRSxTQUFTLGlCQUFpQixJQUFJLG9CQUFvQjtBQUFBLFFBQ3pELFlBQVksWUFBWSxTQUFTLFlBQVk7QUFBQSxRQUM3QyxRQUFRLFlBQVk7QUFBRTtBQUFlLGlCQUFPLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDaEQsZ0JBQWdCLGNBQVksUUFBUSxRQUFRO0FBQUEsVUFDM0MsaUJBQWlCO0FBQUEsVUFDakIsU0FBUyxDQUFDO0FBQUEsVUFDVixlQUFlLE1BQU07QUFBQSxVQUNyQjtBQUFBLFVBQ0EsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCLENBQUM7QUFBQSxNQUNGLENBQUM7QUFDRCxzQkFBZ0IsSUFBSyxNQUFNLFFBQVEscUJBQXFCLGtCQUFrQixrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSSxDQUFHO0FBRTNILFlBQU0sUUFBUSxNQUFNLFFBQVEsWUFBWSxrQkFBa0IsU0FBUyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQzVGLHFCQUFlLFdBQVcsS0FBSztBQUMvQixZQUFNLE1BQU0sS0FBSztBQUNqQixpQkFBVyxJQUFJLE1BQU0sTUFBUztBQUU5QixZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVksa0JBQWtCLFVBQVUsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUU5RixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsUUFBUSxFQUFFLE1BQU0sWUFBWSxRQUFRLHdCQUF3QixvQkFBb0IsYUFBYTtBQUFBLFFBQzdGLGFBQWE7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxZQUFZO0FBQzFGLFlBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLGNBQWMsTUFBTSxjQUFjLENBQUM7QUFDM0UsVUFBSSxjQUFjO0FBQ2xCLFlBQU0sRUFBRSxTQUFTLGlCQUFpQixJQUFJLG9CQUFvQjtBQUFBLFFBQ3pELFlBQVksWUFBWTtBQUN2QjtBQUNBLGNBQUksZ0JBQWdCLEdBQUc7QUFDdEIsa0JBQU0sSUFBSSxNQUFNLE1BQU07QUFBQSxVQUN2QjtBQUNBLGlCQUFPLFNBQVMsWUFBWTtBQUFBLFFBQzdCO0FBQUEsTUFDRCxDQUFDO0FBQ0Qsc0JBQWdCLElBQUssTUFBTSxRQUFRLHFCQUFxQixrQkFBa0Isa0JBQWtCLE1BQU0sa0JBQWtCLElBQUksQ0FBRztBQUUzSCxZQUFNLE9BQU8sUUFBUSxRQUFRLFlBQVksa0JBQWtCLFNBQVMsRUFBRSxTQUFTLGFBQWEsQ0FBQyxHQUFHLE1BQU07QUFHdEcsWUFBTSxLQUFLLE1BQU0sUUFBUSxZQUFZLGtCQUFrQixVQUFVLEVBQUUsU0FBUyxhQUFhLENBQUM7QUFDMUYscUJBQWUsV0FBVyxFQUFFO0FBQzVCLFlBQU0sR0FBRyxLQUFLO0FBRWQsYUFBTyxZQUFZLGFBQWEsR0FBRyxtQ0FBbUM7QUFDdEUsYUFBTyxHQUFHLFFBQVEsV0FBVyxZQUFZLEdBQUcsaUNBQWlDO0FBQUEsSUFDOUUsQ0FBQztBQUVELFNBQUssaUZBQWtGLFlBQVk7QUFDbEcsWUFBTSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsY0FBYyxNQUFNLHVCQUF1QixDQUFDO0FBQ3BGLFVBQUksY0FBYztBQUNsQixZQUFNLE9BQU8sSUFBSSxnQkFBc0I7QUFDdkMsWUFBTSxFQUFFLFNBQVMsaUJBQWlCLElBQUksb0JBQW9CO0FBQUEsUUFDekQsWUFBWSxZQUFZO0FBQUU7QUFBZSxnQkFBTSxLQUFLO0FBQUcsZ0JBQU0sSUFBSSxNQUFNLE1BQU07QUFBQSxRQUFHO0FBQUEsTUFDakYsQ0FBQztBQUNELHNCQUFnQixJQUFLLE1BQU0sUUFBUSxxQkFBcUIsa0JBQWtCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJLENBQUc7QUFFM0gsWUFBTSxLQUFLLFFBQVEsWUFBWSxrQkFBa0IsU0FBUyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQ25GLFlBQU0sS0FBSyxRQUFRLFlBQVksa0JBQWtCLFVBQVUsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUNwRixXQUFLLFNBQVM7QUFFZCxZQUFNLGVBQWUsTUFBTSxHQUFHLEtBQUssTUFBTSxZQUFZLE1BQU0sVUFBVTtBQUNyRSxZQUFNLEtBQUssTUFBTTtBQUVqQixhQUFPLFlBQVksY0FBYyxZQUFZLDJDQUEyQztBQUN4RixxQkFBZSxXQUFXLEVBQUU7QUFDNUIsYUFBTyxZQUFZLGFBQWEsR0FBRyxtREFBbUQ7QUFDdEYsYUFBTyxHQUFHLENBQUMsUUFBUSxXQUFXLFlBQVksR0FBRyw2QkFBNkI7QUFDMUUsWUFBTSxHQUFHLEtBQUs7QUFBQSxJQUNmLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxZQUFZO0FBQzFGLFlBQU0sZUFBZSxJQUFJLEtBQUssRUFBRSxRQUFRLGNBQWMsTUFBTSxnQkFBZ0IsQ0FBQztBQUM3RSxVQUFJLGNBQWM7QUFDbEIsWUFBTSxFQUFFLFNBQVMsaUJBQWlCLElBQUksb0JBQW9CO0FBQUEsUUFDekQsWUFBWSxZQUFZO0FBQUU7QUFBZSxpQkFBTyxTQUFTLFlBQVk7QUFBQSxRQUFHO0FBQUEsTUFDekUsQ0FBQztBQUNELFlBQU0sY0FBZSxNQUFNLFFBQVEscUJBQXFCLGtCQUFrQixrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUV4SCxZQUFNLEtBQUssTUFBTSxRQUFRLFlBQVksa0JBQWtCLFNBQVMsRUFBRSxTQUFTLGFBQWEsQ0FBQztBQUN6RixxQkFBZSxXQUFXLEVBQUU7QUFDNUIsWUFBTSxHQUFHLEtBQUs7QUFDZCxhQUFPLEdBQUcsUUFBUSxXQUFXLFlBQVksR0FBRyxzQ0FBc0M7QUFJbEYsa0JBQVksUUFBUTtBQUNwQixZQUFNLFFBQVEsQ0FBQztBQUVmLFlBQU0sT0FBTztBQUFBLFFBQ1osUUFBUSxZQUFZLGtCQUFrQixVQUFVLEVBQUUsU0FBUyxhQUFhLENBQUM7QUFBQSxRQUN6RTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBR0EsWUFBTSxLQUFLLE1BQU0sUUFBUSxZQUFZLGNBQWMsU0FBUyxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQ3JGLHFCQUFlLFdBQVcsRUFBRTtBQUM1QixZQUFNLEdBQUcsS0FBSztBQUNkLGFBQU8sWUFBWSxhQUFhLEdBQUcsbUNBQW1DO0FBQUEsSUFDdkUsQ0FBQztBQUVELFNBQUssbUZBQW1GLFlBQVk7QUFDbkcsWUFBTSxlQUFlLElBQUksS0FBSyxFQUFFLFFBQVEsY0FBYyxNQUFNLGlCQUFpQixDQUFDO0FBQzlFLFVBQUksY0FBYztBQUNsQixVQUFJLGVBQWU7QUFDbkIsWUFBTSxFQUFFLFNBQVMsa0JBQWtCLG9CQUFvQixJQUFJLG9CQUFvQjtBQUFBLFFBQzlFLFlBQVksWUFBWTtBQUFFO0FBQWUsaUJBQU8sU0FBUyxZQUFZO0FBQUEsUUFBRztBQUFBO0FBQUE7QUFBQSxRQUd4RSxnQkFBZ0IsQ0FBQyxhQUFrQjtBQUNsQyxjQUFJLFNBQVMsU0FBUyxNQUFNLGFBQWEsU0FBUyxLQUFLLGNBQWM7QUFDcEUsMkJBQWU7QUFDZixtQkFBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLFdBQVcsQ0FBQztBQUFBLFVBQzdDO0FBQ0EsaUJBQU8sUUFBUSxRQUFRLEVBQUUsaUJBQWlCLFVBQVUsU0FBUyxDQUFDLEdBQUcsZUFBZSxNQUFNLE1BQU0sU0FBUyxNQUFNO0FBQUEsVUFBRSxFQUFFLENBQUM7QUFBQSxRQUNqSDtBQUFBLE1BQ0QsQ0FBQztBQUNELHNCQUFnQixJQUFLLE1BQU0sUUFBUSxxQkFBcUIsa0JBQWtCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJLENBQUc7QUFNM0gsWUFBTSxPQUFPLFFBQVEsUUFBUSxZQUFZLGtCQUFrQixTQUFTLEVBQUUsU0FBUyxhQUFhLENBQUMsR0FBRyxXQUFXO0FBQzNHLGFBQU8sWUFBWSxvQkFBb0IsK0JBQStCLGdCQUFnQixHQUFHLFFBQVcsNkRBQXdEO0FBSTVKLFlBQU0sS0FBSyxNQUFNLFFBQVEsWUFBWSxrQkFBa0IsVUFBVSxFQUFFLFNBQVMsYUFBYSxDQUFDO0FBQzFGLHFCQUFlLFdBQVcsRUFBRTtBQUM1QixZQUFNLEdBQUcsS0FBSztBQUNkLGFBQU8sWUFBWSxhQUFhLEdBQUcsc0RBQXNEO0FBQ3pGLGFBQU8sR0FBRyxRQUFRLFdBQVcsWUFBWSxHQUFHLHVDQUF1QztBQUFBLElBQ3BGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFVBQU0sY0FBYztBQUNwQixVQUFNLGtCQUFrQixJQUFJLEtBQUssRUFBRSxRQUFRLGFBQWEsTUFBTSxXQUFXLENBQUM7QUFFMUUsVUFBTSxzQkFBc0IsSUFBSSx3QkFBd0I7QUFDeEQsd0JBQW9CLGlCQUFpQixDQUFDO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IsY0FBYyxFQUFFLDJCQUEyQixLQUFLO0FBQUEsSUFDakQsQ0FBQyxDQUFDO0FBQ0Ysb0JBQWdCLElBQUksb0JBQW9CLG1DQUFtQyxhQUFhO0FBQUEsTUFDdkYsMkJBQTJCLGNBQVksUUFBUSxRQUFRO0FBQUEsUUFDdEQsaUJBQWlCO0FBQUEsUUFDakIsU0FBUyxDQUFDO0FBQUEsUUFDVixlQUFlLE1BQU07QUFBQSxRQUNyQixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssc0JBQXNCLG1CQUFtQjtBQUVuRSxVQUFNLGlCQUFpQixXQUE0QixFQUFFLEVBQUUsZUFBZSxPQUFVLENBQUM7QUFDakYsbUJBQWUsd0JBQXdCLFVBQVUsQ0FBQyxZQUFvQixZQUFZLE9BQU87QUFDekYseUJBQXFCLEtBQUssaUJBQWlCLGNBQWM7QUFFekQsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsYUFBYSxFQUFFLEdBQUcsYUFBYSxXQUFXLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGFBQWEsRUFBRSxNQUFNLFNBQVM7QUFBRSxhQUFPLENBQUM7QUFBQSxJQUFHLEVBQUUsQ0FBQyxDQUFDO0FBRWhILFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsaUJBQWlCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQ2xILFdBQU8sR0FBRyxHQUFHO0FBQ2Isb0JBQWdCLElBQUksR0FBRztBQUV2QixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksaUJBQWlCLGVBQWUsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUN2RyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFFcEIsVUFBTSxRQUFRLFlBQVksV0FBVyxlQUFlO0FBQ3BELFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxFQUFFLENBQUMsRUFBRSxRQUFRLE1BQU0sSUFBSSxXQUFTO0FBQUEsTUFDeEUsTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLGdCQUFnQiw2QkFBNkIsS0FBSyxPQUFPO0FBQUEsSUFDaEUsRUFBRSxHQUFHO0FBQUEsTUFDSixFQUFFLE1BQU0sU0FBUyxNQUFNLE9BQVU7QUFBQSxNQUNqQyxFQUFFLE1BQU0sUUFBUSxNQUFNLE9BQVU7QUFBQSxNQUNoQyxFQUFFLE1BQU0sVUFBVSxNQUFNLFFBQVE7QUFBQSxNQUNoQyxFQUFFLE1BQU0sUUFBUSxNQUFNLE9BQVU7QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RUFBeUUsWUFBWTtBQUN6RixVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sV0FBVyxDQUFDO0FBQzFFLFVBQU0sd0JBQW1ELENBQUM7QUFDMUQseUJBQXFCLEtBQUssbUJBQW1CO0FBQUEsTUFDNUMsR0FBRztBQUFBLE1BQ0gsV0FBVyxXQUFtQixNQUFpRDtBQUM5RSxZQUFJLGNBQWMsdUNBQXVDLE1BQU07QUFDOUQsZ0NBQXNCLEtBQUssSUFBSTtBQUFBLFFBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sc0JBQXNCLElBQUksd0JBQXdCO0FBQ3hELHdCQUFvQixpQkFBaUIsQ0FBQztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLGFBQWE7QUFBQSxJQUNkLENBQUMsQ0FBQztBQUNGLG9CQUFnQixJQUFJLG9CQUFvQixtQ0FBbUMsYUFBYTtBQUFBLE1BQ3ZGLDJCQUEyQixjQUFZLFFBQVEsUUFBUTtBQUFBLFFBQ3RELGlCQUFpQjtBQUFBLFFBQ2pCLFNBQVMsQ0FBQztBQUFBLFFBQ1YsZUFBZSxNQUFNO0FBQUEsUUFDckIsU0FBUyxNQUFNO0FBQUEsUUFBRTtBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUNGLHlCQUFxQixLQUFLLHNCQUFzQixtQkFBbUI7QUFFbkUsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsYUFBYSxFQUFFLEdBQUcsYUFBYSxXQUFXLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGFBQWEsRUFBRSxNQUFNLFNBQVM7QUFBRSxhQUFPLENBQUM7QUFBQSxJQUFHLEVBQUUsQ0FBQyxDQUFDO0FBRWhILFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsaUJBQWlCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQ2xILFdBQU8sR0FBRyxHQUFHO0FBQ2Isb0JBQWdCLElBQUksR0FBRztBQUV2QixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksaUJBQWlCLFNBQVMsRUFBRSxTQUFTLFlBQVksQ0FBQztBQUNqRyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFFcEIsV0FBTyxnQkFBZ0Isc0JBQXNCLElBQUksWUFBVTtBQUFBLE1BQzFELGFBQWEsTUFBTTtBQUFBLE1BQ25CLGNBQWMsT0FBTyxNQUFNLGNBQWM7QUFBQSxJQUMxQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLGFBQWEscUJBQXFCLGNBQWMsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUNoRSxDQUFDO0FBRUQsT0FBSywrRkFBK0YsWUFBWTtBQUMvRyxVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sa0JBQWtCLENBQUM7QUFFakYsVUFBTSxzQkFBc0IsSUFBSSx3QkFBd0I7QUFDeEQsd0JBQW9CLGlCQUFpQixDQUFDO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IsY0FBYyxFQUFFLDJCQUEyQixLQUFLO0FBQUEsSUFDakQsQ0FBQyxDQUFDO0FBQ0Ysb0JBQWdCLElBQUksb0JBQW9CLG1DQUFtQyxhQUFhO0FBQUEsTUFDdkYsMkJBQTJCLGNBQVksUUFBUSxRQUFRO0FBQUEsUUFDdEQsaUJBQWlCO0FBQUEsUUFDakIsU0FBUyxDQUFDO0FBQUEsUUFDVixlQUFlLE1BQU07QUFBQSxRQUNyQixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQ0YseUJBQXFCLEtBQUssc0JBQXNCLG1CQUFtQjtBQUVuRSxVQUFNLGlCQUFpQixXQUE0QixFQUFFLEVBQUUsZUFBZSxPQUFVLENBQUM7QUFDakYsbUJBQWUsd0JBQXdCLFVBQVUsQ0FBQyxZQUFvQixZQUFZLE9BQU87QUFDekYseUJBQXFCLEtBQUssaUJBQWlCLGNBQWM7QUFFekQsb0JBQWdCLElBQUksaUJBQWlCLGNBQWMsYUFBYSxFQUFFLEdBQUcsYUFBYSxXQUFXLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSCxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGFBQWEsRUFBRSxNQUFNLFNBQVM7QUFBRSxhQUFPLENBQUM7QUFBQSxJQUFHLEVBQUUsQ0FBQyxDQUFDO0FBRWhILFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsaUJBQWlCLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQ2xILFdBQU8sR0FBRyxHQUFHO0FBQ2Isb0JBQWdCLElBQUksR0FBRztBQUV2QixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksaUJBQWlCLGVBQWUsRUFBRSxlQUFlLFlBQVksQ0FBQztBQUM3RyxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFFcEIsVUFBTSxRQUFRLFlBQVksV0FBVyxlQUFlO0FBQ3BELFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxFQUFFLENBQUMsRUFBRSxRQUFRLE1BQU0sSUFBSSxXQUFTO0FBQUEsTUFDeEUsTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLGdCQUFnQiw2QkFBNkIsS0FBSyxPQUFPO0FBQUEsSUFDaEUsRUFBRSxHQUFHO0FBQUEsTUFDSixFQUFFLE1BQU0sVUFBVSxNQUFNLFFBQVE7QUFBQSxNQUNoQyxFQUFFLE1BQU0sUUFBUSxNQUFNLE9BQVU7QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRkFBa0YsWUFBWTtBQUNsRyxVQUFNLGNBQWM7QUFDcEIsVUFBTSxrQkFBa0IsSUFBSSxLQUFLLEVBQUUsUUFBUSxhQUFhLE1BQU0sd0JBQXdCLENBQUM7QUFFdkYsVUFBTSxzQkFBc0IsSUFBSSx3QkFBd0I7QUFDeEQsd0JBQW9CLGlCQUFpQixDQUFDO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IsY0FBYyxFQUFFLDJCQUEyQixLQUFLO0FBQUEsSUFDakQsQ0FBQyxDQUFDO0FBQ0Ysb0JBQWdCLElBQUksb0JBQW9CLG1DQUFtQyxhQUFhO0FBQUEsTUFDdkYsMkJBQTJCLGNBQVksUUFBUSxRQUFRO0FBQUEsUUFDdEQsaUJBQWlCO0FBQUEsUUFDakIsU0FBUyxDQUFDLEVBQUUsTUFBTSxXQUFXLFFBQVEsZUFBZSxhQUFhLFlBQVksQ0FBQztBQUFBLFFBQzlFLGVBQWUsTUFBTTtBQUFBLFFBQ3JCLFNBQVMsTUFBTTtBQUFBLFFBQUU7QUFBQSxNQUNsQixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFDRix5QkFBcUIsS0FBSyxzQkFBc0IsbUJBQW1CO0FBRW5FLFVBQU0saUJBQWlCLFdBQTRCLEVBQUUsRUFBRSxlQUFlLE9BQVUsQ0FBQztBQUNqRixtQkFBZSx3QkFBd0IsVUFBVSxDQUFDLFlBQW9CLFlBQVksT0FBTztBQUN6Rix5QkFBcUIsS0FBSyxpQkFBaUIsY0FBYztBQUV6RCxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxhQUFhLEVBQUUsR0FBRyxhQUFhLFdBQVcsR0FBRyxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQ2xILG9CQUFnQixJQUFJLGlCQUFpQiw0QkFBNEIsYUFBYSxFQUFFLE1BQU0sU0FBUztBQUFFLGFBQU8sQ0FBQztBQUFBLElBQUcsRUFBRSxDQUFDLENBQUM7QUFFaEgsVUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxVQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixpQkFBaUIsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDbEgsV0FBTyxHQUFHLEdBQUc7QUFDYixvQkFBZ0IsSUFBSSxHQUFHO0FBRXZCLFdBQU8sZ0JBQWdCLElBQUksT0FBTyxZQUFZLEVBQUUsQ0FBQyxFQUFFLFFBQVEsTUFBTSxJQUFJLFdBQVM7QUFBQSxNQUM3RSxNQUFNLEtBQUs7QUFBQSxNQUNYLE1BQU0sZ0JBQWdCLDZCQUE2QixLQUFLLE9BQU87QUFBQSxJQUNoRSxFQUFFLEdBQUc7QUFBQSxNQUNKLEVBQUUsTUFBTSxVQUFVLE1BQU0sUUFBUTtBQUFBLE1BQ2hDLEVBQUUsTUFBTSxRQUFRLE1BQU0sT0FBVTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFGQUFxRixZQUFZO0FBQ3JHLFVBQU0sZ0JBQWdCLHFCQUFxQixJQUFJLHFCQUFxQjtBQUNwRSxVQUFNLGNBQWMscUJBQXFCLDhDQUE4QyxLQUFLO0FBRTVGLFVBQU0sb0JBQThDO0FBQUEsTUFDbkQsTUFBTSxPQUFPLFVBQVUsV0FBVyxVQUFVLFFBQVE7QUFDbkQsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUFBLElBQ0Q7QUFDQSxvQkFBZ0IsSUFBSSxpQkFBaUIsY0FBYyxxQkFBcUIsRUFBRSxHQUFHLGFBQWEsbUJBQW1CLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNsSSxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLHFCQUFxQixpQkFBaUIsQ0FBQztBQUV4RyxVQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFVBQU0sV0FBVyxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQ25FLFVBQU0sUUFBUSxTQUFTO0FBRXZCLFVBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLDBCQUEwQixNQUFNLHdCQUF3QixDQUFDO0FBQzdGLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQiwwQkFBMEI7QUFBQSxNQUMvRixpQkFBaUIsQ0FBQztBQUFBLFFBQ2pCLElBQUk7QUFBQSxRQUNKLE1BQU07QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFFcEIsVUFBTSxXQUFXLE1BQU0sWUFBWTtBQUNuQyxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFDckMsVUFBTSxrQkFBa0IsU0FBUyxDQUFDLEVBQUUsVUFBVSxTQUFTLFNBQVM7QUFDaEUsV0FBTyxHQUFHLGlCQUFpQixTQUFTLDRDQUE0QyxHQUFHLGlEQUFpRDtBQUFBLEVBQ3JJLENBQUM7QUFFRCxPQUFLLGtGQUFrRixZQUFZO0FBQ2xHLFVBQU0sZ0JBQWdCLHFCQUFxQixJQUFJLHFCQUFxQjtBQUNwRSxVQUFNLGNBQWMscUJBQXFCLDhDQUE4QyxJQUFJO0FBRTNGLFVBQU0sb0JBQThDO0FBQUEsTUFDbkQsTUFBTSxPQUFPLFVBQVUsVUFBVSxVQUFVLFFBQVE7QUFDbEQsaUJBQVMsQ0FBQyxFQUFFLE1BQU0sbUJBQW1CLFNBQVMsSUFBSSxlQUFlLDBCQUEwQixFQUFFLENBQUMsQ0FBQztBQUMvRixlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLG9CQUFnQixJQUFJLGlCQUFpQixjQUFjLHNCQUFzQixFQUFFLEdBQUcsYUFBYSxvQkFBb0IsR0FBRyxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQ3BJLG9CQUFnQixJQUFJLGlCQUFpQiw0QkFBNEIsc0JBQXNCLGlCQUFpQixDQUFDO0FBRXpHLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxXQUFXLGdCQUFnQixJQUFJLGtCQUFrQixXQUFXLENBQUM7QUFDbkUsVUFBTSxRQUFRLFNBQVM7QUFFdkIsVUFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsMEJBQTBCLE1BQU0sd0JBQXdCLENBQUM7QUFDN0YsVUFBTSxXQUFXLE1BQU0sWUFBWSxZQUFZLE1BQU0saUJBQWlCLDBCQUEwQjtBQUFBLE1BQy9GLGlCQUFpQixDQUFDO0FBQUEsUUFDakIsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELG1CQUFlLFdBQVcsUUFBUTtBQUNsQyxVQUFNLFNBQVMsS0FBSztBQUVwQixVQUFNLFdBQVcsTUFBTSxZQUFZO0FBQ25DLFdBQU8sWUFBWSxTQUFTLFFBQVEsQ0FBQztBQUNyQyxVQUFNLGtCQUFrQixTQUFTLENBQUMsRUFBRSxVQUFVLFNBQVMsU0FBUztBQUNoRSxXQUFPLEdBQUcsQ0FBQyxpQkFBaUIsU0FBUyw0Q0FBNEMsR0FBRyx1REFBdUQ7QUFBQSxFQUM1SSxDQUFDO0FBRUQsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxVQUFNLGNBQWMsa0JBQWtCO0FBR3RDLFVBQU0sV0FBMEQsQ0FBQztBQUNqRSxhQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMzQixZQUFNLE1BQU0sWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDbkUsWUFBTSxRQUFRLElBQUk7QUFDbEIsWUFBTSxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxzQkFBc0IsQ0FBQyxHQUFHLEdBQUcsRUFBRSxXQUFXLENBQUMsRUFBRSxHQUFHLENBQUM7QUFDckYsZUFBUyxLQUFLLEVBQUUsVUFBVSxNQUFNLGlCQUFpQixJQUFJLENBQUM7QUFBQSxJQUN2RDtBQUdBLGVBQVcsS0FBSyxVQUFVO0FBQ3pCLFFBQUUsSUFBSSxRQUFRO0FBQUEsSUFDZjtBQUNBLFVBQU0sWUFBWSxzQkFBc0I7QUFHeEMsZUFBVyxLQUFLLFVBQVU7QUFDekIsYUFBTyxZQUFZLFlBQVksV0FBVyxFQUFFLFFBQVEsR0FBRyxRQUFXLFdBQVcsRUFBRSxRQUFRLHVDQUF1QztBQUFBLElBQy9IO0FBSUEsUUFBSTtBQUNKLGVBQVcsS0FBSyxVQUFVO0FBQ3pCLFlBQU0sU0FBUyxNQUFNLFlBQVkscUJBQXFCLEVBQUUsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsTUFBTSxhQUFhO0FBQy9ILGFBQU8sR0FBRyxRQUFRLHFDQUFxQyxFQUFFLFFBQVEsRUFBRTtBQUduRSxrQkFBWSxRQUFRO0FBQ3BCLG1CQUFhO0FBQUEsSUFDZDtBQUdBLFVBQU0sWUFBWSxzQkFBc0I7QUFDeEMsVUFBTSxZQUFZLFlBQVksK0JBQStCO0FBQzdELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsYUFBYSxVQUFVO0FBQUEsTUFDdkIsaUJBQWlCLFVBQVU7QUFBQSxNQUMzQixRQUFRLFVBQVUsT0FBTyxJQUFJLFFBQU07QUFBQSxRQUNsQyxVQUFVLEVBQUUsZ0JBQWdCLFNBQVM7QUFBQSxRQUNyQyxVQUFVLEVBQUU7QUFBQSxRQUNaLFNBQVMsRUFBRTtBQUFBLFFBQ1gsaUJBQWlCLEVBQUU7QUFBQSxRQUNuQixXQUFXLEVBQUU7QUFBQSxNQUNkLEVBQUU7QUFBQSxJQUNILEdBQUc7QUFBQSxNQUNGLGFBQWE7QUFBQSxNQUNiLGlCQUFpQjtBQUFBLE1BQ2pCLFFBQVEsQ0FBQztBQUFBLFFBQ1IsVUFBVSxTQUFTLENBQUMsRUFBRSxTQUFTLFNBQVM7QUFBQSxRQUN4QyxVQUFVO0FBQUEsUUFDVixTQUFTLENBQUMsRUFBRSxRQUFRLGVBQWUsT0FBTyxFQUFFLENBQUM7QUFBQSxRQUM3QyxpQkFBaUI7QUFBQSxRQUNqQixXQUFXO0FBQUEsTUFDWixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTztBQUFBLE1BQVksVUFBVSxPQUFPLENBQUMsRUFBRSxnQkFBZ0IsU0FBUztBQUFBLE1BQUcsU0FBUyxDQUFDLEVBQUUsU0FBUyxTQUFTO0FBQUEsTUFDaEc7QUFBQSxJQUEwRDtBQUczRCxVQUFNLFlBQVksc0JBQXNCO0FBQ3hDLFdBQU8sWUFBWSxZQUFZLFdBQVcsU0FBUyxDQUFDLEVBQUUsUUFBUSxHQUFHLFFBQVcsb0NBQW9DO0FBQ2hILFdBQU8sWUFBWSxZQUFZLFdBQVcsU0FBUyxDQUFDLEVBQUUsUUFBUSxHQUFHLFFBQVcsb0NBQW9DO0FBQ2hILFdBQU8sR0FBRyxZQUFZLFdBQVcsU0FBUyxDQUFDLEVBQUUsUUFBUSxHQUFHLHVDQUF1QztBQUUvRixlQUFZLFFBQVE7QUFDcEIsVUFBTSxZQUFZLHNCQUFzQjtBQUFBLEVBQ3pDLENBQUM7QUFFRCxPQUFLLHNGQUFzRixZQUFZO0FBQ3RHLFVBQU0sY0FBYyxrQkFBa0I7QUFHdEMsVUFBTSxXQUFnQyxDQUFDO0FBQ3ZDLGFBQVMsSUFBSSxHQUFHLElBQUksR0FBRyxLQUFLO0FBQzNCLFlBQU0sTUFBTSxZQUFZLHFCQUFxQixrQkFBa0IsSUFBSTtBQUNuRSxZQUFNLFFBQVEsSUFBSTtBQUNsQixZQUFNLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLFdBQVcsQ0FBQyxHQUFHLEdBQUcsRUFBRSxXQUFXLENBQUMsRUFBRSxHQUFHLENBQUM7QUFDMUUsZUFBUyxLQUFLLEVBQUUsVUFBVSxNQUFNLGdCQUFnQixDQUFDO0FBQ2pELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFDQSxVQUFNLFlBQVksc0JBQXNCO0FBVXhDLFVBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFNBQVMsQ0FBQyxFQUFFLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLE1BQU0sTUFBTTtBQUNoSSxXQUFPLEdBQUcsSUFBSTtBQUdkLFVBQU0sY0FBYztBQUVwQixTQUFLLFFBQVE7QUFNYixVQUFNLE9BQU8sTUFBTSxZQUFZLHFCQUFxQixTQUFTLENBQUMsRUFBRSxVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixNQUFNLE1BQU07QUFDaEksV0FBTyxHQUFHLElBQUk7QUFFZCxVQUFNLFlBQVksc0JBQXNCO0FBSXhDLFdBQU87QUFBQSxNQUFZLFlBQVksV0FBVyxTQUFTLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQ2hFO0FBQUEsSUFBa0Y7QUFHbkYsVUFBTSxZQUFZLFlBQVksK0JBQStCO0FBQzdELFdBQU8sWUFBWSxVQUFVLGFBQWEsR0FBRyxnQ0FBZ0M7QUFFN0UsU0FBSyxRQUFRO0FBRWIsZ0JBQVksUUFBUTtBQUNwQixVQUFNLFlBQVksc0JBQXNCO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssd0VBQXdFLFlBQVk7QUFDeEYsVUFBTSxjQUFjLGtCQUFrQjtBQUd0QyxVQUFNLE1BQU0sWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDbkUsVUFBTSxRQUFRLElBQUk7QUFDbEIsVUFBTSxrQkFBa0IsTUFBTTtBQUM5QixVQUFNLFdBQVcsRUFBRSxPQUFPLENBQUMsR0FBRyxNQUFNLHlCQUF5QixHQUFHLEVBQUUsV0FBVyxDQUFDLEVBQUUsR0FBRyxDQUFDO0FBSXBGLFFBQUksUUFBUTtBQUNaLFVBQU0sWUFBWSxzQkFBc0I7QUFHeEMsV0FBTyxZQUFZLFlBQVksV0FBVyxlQUFlLEdBQUcsTUFBUztBQUdyRSxVQUFNLE9BQU8sTUFBTSxZQUFZLHFCQUFxQixpQkFBaUIsa0JBQWtCLE1BQU0sa0JBQWtCLE1BQU0sTUFBTTtBQUMzSCxXQUFPLEdBQUcsSUFBSTtBQUNkLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFdBQU8sR0FBRyxPQUFPLGdCQUFnQiw2Q0FBNkM7QUFFOUUsU0FBSyxRQUFRO0FBQ2IsVUFBTSxZQUFZLHNCQUFzQjtBQUN4QyxXQUFPLFlBQVksWUFBWSxXQUFXLGVBQWUsR0FBRyxRQUFXLDZDQUE2QztBQUFBLEVBQ3JILENBQUM7QUFFRCxPQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFVBQU0sY0FBYyxrQkFBa0I7QUFHdEMsVUFBTSxNQUFNLFlBQVkscUJBQXFCLGtCQUFrQixJQUFJO0FBQ25FLFFBQUksUUFBK0IsSUFBSTtBQUN2QyxVQUFNLGtCQUFrQixNQUFNO0FBQzlCLFVBQU0sV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sWUFBWSxHQUFHLEVBQUUsV0FBVyxDQUFDLEVBQUUsR0FBRyxDQUFDO0FBR3ZFLFVBQU0sWUFBWSxJQUFJLFFBQVEsS0FBSztBQUduQyxRQUFJLFFBQVE7QUFDWixZQUFRO0FBQ1IsVUFBTSxZQUFZLHNCQUFzQjtBQUd4QyxXQUFPLFlBQVksWUFBWSxXQUFXLGVBQWUsR0FBRyxRQUFXLGlDQUFpQztBQUd4RyxVQUFNLFlBQVksWUFBWSwrQkFBK0I7QUFDN0QsV0FBTyxZQUFZLFVBQVUsYUFBYSxHQUFHLDZCQUE2QjtBQUcxRSxRQUFJLE9BQU8sV0FBVyxPQUFPLFlBQVk7QUFDeEMsaUJBQVcsR0FBRztBQUVkLGFBQU8sWUFBWSxVQUFVLE1BQU0sR0FBRyxRQUFXLG9EQUFxRDtBQUFBLElBQ3ZHO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxVQUFNLGNBQWMsa0JBQWtCO0FBR3RDLFVBQU0sbUJBQTBCLENBQUM7QUFDakMsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDM0IsWUFBTSxNQUFNLFlBQVkscUJBQXFCLGtCQUFrQixJQUFJO0FBQ25FLFlBQU0sUUFBUSxJQUFJO0FBQ2xCLFlBQU0sV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sV0FBVyxDQUFDLFdBQVcsR0FBRyxFQUFFLFdBQVcsQ0FBQyxFQUFFLEdBQUcsQ0FBQztBQUNsRix1QkFBaUIsS0FBSyxNQUFNLGVBQWU7QUFDM0MsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUNBLFVBQU0sWUFBWSxzQkFBc0I7QUFHeEMsUUFBSTtBQUNKLGVBQVcsWUFBWSxrQkFBa0I7QUFDeEMsWUFBTSxTQUFTLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsTUFBTSxZQUFZO0FBQzVILGFBQU8sR0FBRyxNQUFNO0FBQ2hCLGtCQUFZLFFBQVE7QUFDcEIsbUJBQWE7QUFBQSxJQUNkO0FBR0EsVUFBTSxZQUFZLHNCQUFzQjtBQUN4QyxVQUFNLGlCQUFpQixZQUFZLCtCQUErQjtBQUNsRSxXQUFPLFlBQVksZUFBZSxhQUFhLEdBQUcseURBQXlEO0FBRTNHLGVBQVksUUFBUTtBQUNwQixVQUFNLFlBQVksc0JBQXNCO0FBQUEsRUFDekMsQ0FBQztBQUVELFFBQU0sd0NBQXdDLE1BQU07QUFDbkQsVUFBTSxlQUFlO0FBV3JCLGFBQVMsb0JBQW9CLE1BQTBFO0FBQ3RHLFlBQU0sV0FBVyxJQUFJLEtBQUssRUFBRSxRQUFRLGNBQWMsTUFBTSxjQUFjLFdBQVcsRUFBRSxDQUFDO0FBQ3BGLFlBQU0sc0JBQXNCLElBQUksd0JBQXdCO0FBQ3hELDJCQUFxQixLQUFLLHNCQUFzQixtQkFBbUI7QUFFbkUsc0JBQWdCLElBQUksaUJBQWlCLGNBQWMsY0FBYyxFQUFFLEdBQUcsYUFBYSxZQUFZLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUNwSCxzQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLGNBQWMsRUFBRSxNQUFNLFNBQVM7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHLEVBQUUsQ0FBQyxDQUFDO0FBRWpILFlBQU0sV0FBeUI7QUFBQSxRQUM5QixpQkFBaUI7QUFBQSxRQUNqQixTQUFTLEtBQUssV0FBVyxDQUFDLEVBQUUsTUFBTSxXQUFXLFFBQVEsU0FBUyxhQUFhLGFBQWEsQ0FBQztBQUFBLFFBQ3pGLGVBQWUsTUFBTTtBQUFBLFFBQ3JCLGFBQWEsS0FBSztBQUFBLFFBQ2xCLGVBQWUsS0FBSztBQUFBLFFBQ3BCLFlBQVksS0FBSztBQUFBLFFBQ2pCLGlDQUFpQyxLQUFLO0FBQUEsUUFDdEMseUJBQXlCLEtBQUs7QUFBQSxRQUM5QixTQUFTLE1BQU07QUFBQSxRQUFFO0FBQUEsTUFDbEI7QUFDQSxzQkFBZ0IsSUFBSSxvQkFBb0IsbUNBQW1DLGNBQWM7QUFBQSxRQUN4RiwyQkFBMkIsTUFBTSxRQUFRLFFBQVEsUUFBUTtBQUFBLE1BQzFELENBQUMsQ0FBQztBQUVGLGFBQU8sRUFBRSxVQUFVLFNBQVM7QUFBQSxJQUM3QjtBQUVBLFFBQUksWUFBWTtBQUNoQixhQUFTLGFBQXFCO0FBQzdCLGFBQU8sR0FBRyxLQUFLLElBQUksQ0FBQyxJQUFJLFdBQVc7QUFBQSxJQUNwQztBQUVBLFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxhQUFhLGdCQUF5QixjQUFjLElBQUk7QUFDOUQsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0IsRUFBRSxXQUFXLENBQUM7QUFFdkQsWUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxZQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQzNHLGFBQU8sR0FBRyxHQUFHO0FBQ2Isc0JBQWdCLElBQUksR0FBRztBQUV2QixZQUFNLGFBQWEsTUFBTSxZQUFZLFlBQVksVUFBVSxhQUFhO0FBQ3hFLFlBQU0sU0FBUyxDQUFDLElBQUksT0FBTyxXQUFXLElBQUksQ0FBQztBQUMzQyxpQkFBVyxJQUFJLE9BQU8sTUFBUztBQUMvQixhQUFPLEtBQUssSUFBSSxPQUFPLFdBQVcsSUFBSSxDQUFDO0FBRXZDLGFBQU8sZ0JBQWdCLEVBQUUsUUFBUSxXQUFXLEdBQUc7QUFBQSxRQUM5QyxRQUFRLENBQUMsTUFBTSxLQUFLO0FBQUEsUUFDcEIsWUFBWSxFQUFFLE1BQU0sWUFBWSxRQUFRLHVCQUF1QjtBQUFBLE1BQ2hFLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDJEQUEyRCxZQUFZO0FBQzNFLFlBQU0sWUFBWTtBQUNsQixZQUFNLGNBQWMsWUFBWTtBQUNoQyxZQUFNLEVBQUUsU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFFBQ3hDLFNBQVM7QUFBQSxVQUNSLEVBQUUsTUFBTSxXQUFXLFFBQVEsU0FBUyxhQUFhLGNBQWMsVUFBVTtBQUFBLFVBQ3pFLEVBQUUsTUFBTSxZQUFZLE9BQU8sQ0FBQyxHQUFHLGFBQWEsY0FBYyxXQUFXLE1BQU8sWUFBWTtBQUFBLFFBQ3pGO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxZQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQzNHLGFBQU8sR0FBRyxHQUFHO0FBQ2Isc0JBQWdCLElBQUksR0FBRztBQUV2QixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFdBQVcsSUFBSSxPQUFPLFlBQVksRUFBRSxDQUFDLEVBQUU7QUFBQSxRQUN2QyxrQkFBa0IsSUFBSSxPQUFPLFlBQVksRUFBRSxDQUFDLEVBQUU7QUFBQSxRQUM5QyxXQUFXLElBQUksT0FBTyxZQUFZLEVBQUUsQ0FBQyxFQUFFLFVBQVU7QUFBQSxRQUNqRCxhQUFhLElBQUksT0FBTyxZQUFZLEVBQUUsQ0FBQyxFQUFFLFVBQVU7QUFBQSxRQUNuRCxxQkFBcUIsSUFBSSxPQUFPLFlBQVksRUFBRSxDQUFDLEVBQUUsVUFBVTtBQUFBLE1BQzVELEdBQUc7QUFBQSxRQUNGO0FBQUEsUUFDQSxrQkFBa0I7QUFBQSxRQUNsQixXQUFXO0FBQUEsUUFDWDtBQUFBLFFBQ0EscUJBQXFCO0FBQUEsTUFDdEIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssOEVBQThFLFlBQVk7QUFDOUYsWUFBTSxTQUFTLEtBQUssSUFBSTtBQUN4QixZQUFNLEVBQUUsU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFFBQ3hDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sV0FBVyxRQUFRLFNBQVMsYUFBYSxhQUFhLENBQUM7QUFBQSxNQUMxRSxDQUFDO0FBRUQsWUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxZQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQzNHLGFBQU8sR0FBRyxHQUFHO0FBQ2Isc0JBQWdCLElBQUksR0FBRztBQUV2QixZQUFNLFVBQVUsSUFBSSxPQUFPLFlBQVksRUFBRSxDQUFDO0FBQzFDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsMkJBQTJCLFFBQVEsYUFBYSxVQUFVLFFBQVEsYUFBYSxLQUFLLElBQUk7QUFBQSxRQUN4RixrQkFBa0IsUUFBUTtBQUFBLFFBQzFCLHFCQUFxQixRQUFRLFVBQVU7QUFBQSxNQUN4QyxHQUFHO0FBQUEsUUFDRiwyQkFBMkI7QUFBQSxRQUMzQixrQkFBa0I7QUFBQSxRQUNsQixxQkFBcUI7QUFBQSxNQUN0QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywyREFBMkQsWUFBWTtBQUMzRSxZQUFNLEVBQUUsU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFFBQ3hDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sV0FBVyxRQUFRLFNBQVMsYUFBYSxjQUFjLFdBQVcsR0FBRyxDQUFDO0FBQUEsTUFDekYsQ0FBQztBQUVELFlBQU0sY0FBYyxrQkFBa0I7QUFDdEMsWUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUMzRyxhQUFPLEdBQUcsR0FBRztBQUNiLHNCQUFnQixJQUFJLEdBQUc7QUFFdkIsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixrQkFBa0IsSUFBSSxPQUFPLFlBQVksRUFBRSxDQUFDLEVBQUU7QUFBQSxRQUM5QyxxQkFBcUIsSUFBSSxPQUFPLE9BQU8sRUFBRSxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQ3RELEdBQUc7QUFBQSxRQUNGLGtCQUFrQjtBQUFBLFFBQ2xCLHFCQUFxQjtBQUFBLE1BQ3RCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFlBQU0sMEJBQTBCLGdCQUFnQixJQUFJLElBQUksUUFBbUMsQ0FBQztBQUM1RixZQUFNLFlBQVk7QUFDbEIsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0I7QUFBQSxRQUN4QyxhQUFhLGdCQUFpQyxZQUFZLENBQUMsQ0FBQztBQUFBLFFBQzVELGlDQUFpQyxZQUFZO0FBQUEsUUFDN0MseUJBQXlCLHdCQUF3QjtBQUFBLE1BQ2xELENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDM0csYUFBTyxHQUFHLEdBQUc7QUFDYixzQkFBZ0IsSUFBSSxHQUFHO0FBQ3ZCLDhCQUF3QixLQUFLLEVBQUUsSUFBSSxVQUFVLFFBQVEsa0JBQWtCLFVBQVUsQ0FBQztBQUVsRixhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFNBQVMsSUFBSSxPQUFPLGFBQWEsUUFBUTtBQUFBLFFBQ3pDLFdBQVcsSUFBSSxPQUFPLGFBQWE7QUFBQSxNQUNwQyxHQUFHO0FBQUEsUUFDRixTQUFTO0FBQUEsUUFDVDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0VBQW9FLFlBQVk7QUFDcEYsWUFBTSwwQkFBMEIsZ0JBQWdCLElBQUksSUFBSSxRQUFtQyxDQUFDO0FBQzVGLFlBQU0sRUFBRSxTQUFTLElBQUksb0JBQW9CO0FBQUEsUUFDeEMsU0FBUyxDQUFDLEVBQUUsSUFBSSxVQUFVLE1BQU0sV0FBVyxRQUFRLFNBQVMsYUFBYSxhQUFhLENBQUM7QUFBQSxRQUN2RixhQUFhLGdCQUFpQyxZQUFZLENBQUMsQ0FBQztBQUFBLFFBQzVELGlDQUFpQyxZQUFZO0FBQUEsUUFDN0MseUJBQXlCLHdCQUF3QjtBQUFBLE1BQ2xELENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDM0csYUFBTyxHQUFHLEdBQUc7QUFDYixzQkFBZ0IsSUFBSSxHQUFHO0FBQ3ZCLDhCQUF3QixLQUFLLEVBQUUsSUFBSSxVQUFVLFFBQVEsaUJBQWlCLENBQUM7QUFFdkUsYUFBTyxnQkFBZ0IsSUFBSSxPQUFPLFlBQVksRUFBRSxJQUFJLFFBQU0sRUFBRSxJQUFJLEVBQUUsSUFBSSxTQUFTLEVBQUUsUUFBUSxLQUFLLEVBQUUsR0FBRztBQUFBLFFBQ2xHLEVBQUUsSUFBSSxVQUFVLFNBQVMsUUFBUTtBQUFBLFFBQ2pDLEVBQUUsSUFBSSxVQUFVLFNBQVMsaUJBQWlCO0FBQUEsTUFDM0MsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssd0dBQXdHLFlBQVk7QUFDeEgsWUFBTSxjQUFjLGdCQUFpQyxZQUFZLENBQUMsQ0FBQztBQUNuRSxZQUFNLGdCQUFnQixnQkFBeUIsY0FBYyxJQUFJO0FBQ2pFLFVBQUksaUJBQWlCO0FBQ3JCLFlBQU0sRUFBRSxTQUFTLElBQUksb0JBQW9CO0FBQUEsUUFDeEM7QUFBQSxRQUNBO0FBQUEsUUFDQSxpQ0FBaUMsWUFBWTtBQUFFO0FBQWtCLGlCQUFPO0FBQUEsUUFBTTtBQUFBLE1BQy9FLENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDM0csYUFBTyxHQUFHLEdBQUc7QUFDYixzQkFBZ0IsSUFBSSxHQUFHO0FBRXZCLFlBQU0sUUFBUSxJQUFJO0FBQ2xCLFlBQU0sY0FBYyxNQUFNO0FBQzFCLGFBQU8sWUFBWSxZQUFZLFVBQVUsWUFBWSxNQUFNLDZEQUE2RDtBQUd4SCxZQUFNLFlBQVksK0JBQStCLFVBQVUsTUFBTTtBQUNqRSxhQUFPLFlBQVksZ0JBQWdCLEdBQUcsMkVBQTJFO0FBQUEsSUFDbEgsQ0FBQztBQUVELFNBQUssOEZBQThGLFlBQVk7QUFDOUcsWUFBTSxjQUFjLGdCQUFpQyxZQUFZLENBQUMsQ0FBQztBQUNuRSxZQUFNLGdCQUFnQixnQkFBeUIsY0FBYyxLQUFLO0FBQ2xFLFVBQUksaUJBQWlCO0FBQ3JCLFlBQU0sRUFBRSxTQUFTLElBQUksb0JBQW9CO0FBQUEsUUFDeEM7QUFBQSxRQUNBO0FBQUEsUUFDQSxpQ0FBaUMsWUFBWTtBQUFFO0FBQWtCLGlCQUFPO0FBQUEsUUFBTTtBQUFBLE1BQy9FLENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDM0csYUFBTyxHQUFHLEdBQUc7QUFDYixzQkFBZ0IsSUFBSSxHQUFHO0FBRXZCLFlBQU0sUUFBUSxJQUFJO0FBQ2xCLGFBQU8sWUFBWSxNQUFNLGFBQWEsVUFBVSxZQUFZLE9BQU8saURBQWlEO0FBRXBILFlBQU0sWUFBWSwrQkFBK0IsVUFBVSxNQUFNO0FBQ2pFLGFBQU8sWUFBWSxnQkFBZ0IsR0FBRywyQ0FBMkM7QUFBQSxJQUNsRixDQUFDO0FBRUQsU0FBSyxxRkFBcUYsWUFBWTtBQUNyRyxZQUFNLGNBQWMsZ0JBQWlDLFlBQVksQ0FBQyxDQUFDO0FBQ25FLFlBQU0sZ0JBQWdCLGdCQUF5QixjQUFjLEtBQUs7QUFDbEUsVUFBSSxpQkFBaUI7QUFDckIsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0I7QUFBQSxRQUN4QztBQUFBLFFBQ0E7QUFBQSxRQUNBLGlDQUFpQyxZQUFZO0FBQUU7QUFBa0IsaUJBQU87QUFBQSxRQUFNO0FBQUEsTUFDL0UsQ0FBQztBQUVELFlBQU0sY0FBYyxrQkFBa0I7QUFDdEMsWUFBTSxNQUFNLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUMzRyxhQUFPLEdBQUcsR0FBRztBQUNiLHNCQUFnQixJQUFJLEdBQUc7QUFFdkIsWUFBTSxRQUFRLElBQUk7QUFDbEIsWUFBTSxjQUFjLE1BQU07QUFDMUIsYUFBTyxZQUFZLFlBQVksVUFBVSxZQUFZLEtBQUs7QUFHMUQsb0JBQWMsSUFBSSxNQUFNLE1BQVM7QUFFakMsYUFBTyxZQUFZLFlBQVksVUFBVSxZQUFZLE1BQU0saUVBQWlFO0FBRzVILFlBQU0sWUFBWSwrQkFBK0IsVUFBVSxNQUFNO0FBQ2pFLGFBQU8sWUFBWSxnQkFBZ0IsR0FBRyx3REFBd0Q7QUFBQSxJQUMvRixDQUFDO0FBRUQsU0FBSyxnR0FBZ0csWUFBWTtBQUNoSCxZQUFNLGNBQWMsZ0JBQWlDLFlBQVksQ0FBQyxDQUFDO0FBQ25FLFlBQU0sZ0JBQWdCLGdCQUF5QixjQUFjLEtBQUs7QUFDbEUsWUFBTSxtQkFBbUIsQ0FBQyxPQUFPLElBQUk7QUFDckMsWUFBTSx1QkFBaUMsQ0FBQztBQUN4QyxZQUFNLEVBQUUsU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFFBQ3hDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsaUNBQWlDLFlBQVk7QUFDNUMsZ0JBQU0sUUFBUSxxQkFBcUI7QUFDbkMsK0JBQXFCLEtBQUssS0FBSztBQUMvQixpQkFBTyxpQkFBaUIsS0FBSyxLQUFLO0FBQUEsUUFDbkM7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sTUFBTSxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDM0csYUFBTyxHQUFHLEdBQUc7QUFDYixzQkFBZ0IsSUFBSSxHQUFHO0FBR3ZCLFlBQU0sWUFBWSwrQkFBK0IsVUFBVSxZQUFZO0FBR3ZFLFlBQU0sWUFBWSwrQkFBK0IsVUFBVSxhQUFhO0FBRXhFLGFBQU8sWUFBWSxxQkFBcUIsUUFBUSxHQUFHLDhEQUE4RDtBQUFBLElBQ2xILENBQUM7QUFFRCxTQUFLLDJGQUEyRixZQUFZO0FBQzNHLFlBQU0sZ0JBQWdCLGdCQUF5QixjQUFjLElBQUk7QUFFakUsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0IsRUFBRSxjQUFjLENBQUM7QUFFMUQsWUFBTSxjQUFjLGtCQUFrQjtBQUN0QyxZQUFNLE1BQU0sTUFBTSxZQUFZLHFCQUFxQixVQUFVLGtCQUFrQixNQUFNLGtCQUFrQixJQUFJO0FBQzNHLGFBQU8sR0FBRyxHQUFHO0FBQ2Isc0JBQWdCLElBQUksR0FBRztBQUV2QixZQUFNLFFBQVEsSUFBSTtBQUNsQixhQUFPLFlBQVksTUFBTSxhQUFhLFVBQVUsWUFBWSxNQUFNLDZEQUE2RDtBQUFBLElBQ2hJLENBQUM7QUFFRCxTQUFLLDBFQUEwRSxZQUFZO0FBQzFGLFlBQU0sRUFBRSxTQUFTLElBQUksb0JBQW9CLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztBQUV4RCxZQUFNLGNBQWMsa0JBQWtCO0FBR3RDLFlBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDNUcsYUFBTyxHQUFHLE1BQU0sNEJBQTRCO0FBQzVDLFlBQU0sU0FBUyxLQUFLO0FBQ3BCLGFBQU8sV0FBVyxTQUFTO0FBQUEsUUFDMUIsV0FBVztBQUFBLFFBQ1gsWUFBWSxDQUFDLEVBQUUsMEJBQTBCLEdBQUcsc0JBQXNCLEdBQUcsb0JBQW9CLEdBQUcsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBLE1BQ2pILENBQUM7QUFHRCxXQUFLLFFBQVE7QUFDYixZQUFNLFlBQVksc0JBQXNCO0FBR3hDLFlBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDNUcsYUFBTyxHQUFHLE1BQU0sK0JBQStCO0FBQy9DLHNCQUFnQixJQUFJLElBQUk7QUFDeEIsWUFBTSxTQUFTLEtBQUs7QUFDcEIsWUFBTSxXQUFXLE9BQU8sV0FBVyxNQUFNLElBQUk7QUFDN0MsYUFBTyxZQUFZLFVBQVUsV0FBVyxnQkFBZ0IsK0JBQStCO0FBQUEsSUFDeEYsQ0FBQztBQUVELFNBQUssZ0ZBQWdGLFlBQVk7QUFDaEcsWUFBTSxpQkFBaUI7QUFDdkIsWUFBTSxrQkFBOEM7QUFBQSxRQUNuRCxJQUFJO0FBQUEsUUFBZ0IsTUFBTTtBQUFBLFFBQWlCLFFBQVE7QUFBQSxRQUFXLFNBQVM7QUFBQSxRQUFPLFFBQVE7QUFBQSxRQUN0RixXQUFXLElBQUksb0JBQW9CLEtBQUs7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQU0sZ0JBQWdCO0FBQUEsUUFBTSxpQkFBaUI7QUFBQSxRQUMxRyxzQkFBc0IsRUFBRSxDQUFDLGtCQUFrQixJQUFJLEdBQUcsS0FBSztBQUFBLE1BQ3hEO0FBRUEsMkJBQXFCLEtBQUssd0JBQXdCLElBQUksY0FBYywwQkFBMEI7QUFBQSxRQUNwRixvQkFBb0IsSUFBb0Q7QUFDaEYsaUJBQU8sT0FBTyxpQkFBaUIsa0JBQWtCO0FBQUEsUUFDbEQ7QUFBQSxNQUNELEdBQUM7QUFFRCxZQUFNLEVBQUUsU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFFBQ3hDLFNBQVMsQ0FBQyxFQUFFLE1BQU0sV0FBVyxRQUFRLFNBQVMsYUFBYSxjQUFjLFNBQVMsZUFBZSxDQUFDO0FBQUEsTUFDbkcsQ0FBQztBQUVELFlBQU0sY0FBYyxrQkFBa0I7QUFHdEMsWUFBTSxPQUFPLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUM1RyxhQUFPLEdBQUcsTUFBTSw0QkFBNEI7QUFDNUMsTUFBQyxLQUFLLE9BQXFCLFdBQVcsU0FBUztBQUFBLFFBQzlDLFdBQVc7QUFBQSxRQUNYLGVBQWUsRUFBRSxZQUFZLGVBQWUsVUFBVSxFQUFFLEdBQUcsaUJBQWlCLElBQUksZUFBZSxNQUFNLGNBQWMsRUFBRTtBQUFBLE1BQ3RILENBQUM7QUFFRCxXQUFLLFFBQVE7QUFDYixZQUFNLFlBQVksc0JBQXNCO0FBRXhDLFlBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDNUcsYUFBTyxHQUFHLE1BQU0sK0JBQStCO0FBQy9DLHNCQUFnQixJQUFJLElBQUk7QUFDeEIsWUFBTSxXQUFZLEtBQUssT0FBcUIsV0FBVyxNQUFNLElBQUk7QUFDakUsYUFBTztBQUFBLFFBQ04sRUFBRSxXQUFXLFVBQVUsV0FBVyxlQUFlLFVBQVUsZUFBZSxXQUFXO0FBQUEsUUFDckYsRUFBRSxXQUFXLGdCQUFnQixlQUFlLGVBQWU7QUFBQSxRQUMzRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sa0JBQThDO0FBQUEsUUFDbkQsSUFBSTtBQUFBLFFBQWdCLE1BQU07QUFBQSxRQUFlLFFBQVE7QUFBQSxRQUF5QixTQUFTO0FBQUEsUUFBTyxRQUFRO0FBQUEsUUFDbEcsV0FBVyxJQUFJLG9CQUFvQixLQUFLO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLGdCQUFnQjtBQUFBLFFBQU0saUJBQWlCO0FBQUEsUUFDMUcsc0JBQXNCLENBQUM7QUFBQSxRQUFHLHVCQUF1QjtBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxnQkFBZ0I7QUFDcEIsMkJBQXFCLEtBQUssd0JBQXdCLElBQUksY0FBYywwQkFBMEI7QUFBQSxRQUNwRixvQkFBb0IsSUFBb0Q7QUFDaEYsaUJBQU8saUJBQWlCLE9BQU8saUJBQWlCLGtCQUFrQjtBQUFBLFFBQ25FO0FBQUEsTUFDRCxHQUFDO0FBRUQsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0I7QUFBQSxRQUN4QyxTQUFTLENBQUMsRUFBRSxNQUFNLFdBQVcsUUFBUSxTQUFTLGFBQWEsY0FBYyxTQUFTLGVBQWUsQ0FBQztBQUFBLE1BQ25HLENBQUM7QUFDRCxZQUFNLGNBQWMsa0JBQWtCO0FBQ3RDLFlBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDNUcsYUFBTyxHQUFHLE1BQU0sNEJBQTRCO0FBQzVDLE1BQUMsS0FBSyxPQUFxQixXQUFXLFNBQVM7QUFBQSxRQUM5QyxXQUFXO0FBQUEsUUFDWCxlQUFlLEVBQUUsWUFBWSxnQkFBZ0IsVUFBVSxnQkFBZ0I7QUFBQSxNQUN4RSxDQUFDO0FBQ0QsV0FBSyxRQUFRO0FBQ2IsWUFBTSxZQUFZLHNCQUFzQjtBQUV4QyxzQkFBZ0I7QUFDaEIsWUFBTSxPQUFPLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUM1RyxhQUFPLEdBQUcsTUFBTSwrQkFBK0I7QUFDL0Msc0JBQWdCLElBQUksSUFBSTtBQUN4QixZQUFNLFdBQVksS0FBSyxPQUFxQixXQUFXLE1BQU0sSUFBSTtBQUVqRSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLFdBQVcsVUFBVTtBQUFBLFFBQ3JCLGVBQWUsVUFBVSxlQUFlO0FBQUEsUUFDeEMsUUFBUSxVQUFVLGVBQWUsU0FBUztBQUFBLE1BQzNDLEdBQUc7QUFBQSxRQUNGLFdBQVc7QUFBQSxRQUNYLGVBQWU7QUFBQSxRQUNmLFFBQVE7QUFBQSxNQUNULENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDBGQUEwRixZQUFZO0FBQzFHLFlBQU0saUJBQWlCO0FBQ3ZCLFlBQU0sa0JBQThDO0FBQUEsUUFDbkQsSUFBSTtBQUFBLFFBQWdCLE1BQU07QUFBQSxRQUFpQixRQUFRO0FBQUEsUUFBVyxTQUFTO0FBQUEsUUFBTyxRQUFRO0FBQUEsUUFDdEYsV0FBVyxJQUFJLG9CQUFvQixLQUFLO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLGdCQUFnQjtBQUFBLFFBQU0saUJBQWlCO0FBQUEsUUFDMUcsc0JBQXNCLEVBQUUsQ0FBQyxrQkFBa0IsSUFBSSxHQUFHLEtBQUs7QUFBQSxNQUN4RDtBQUNBLDJCQUFxQixLQUFLLHdCQUF3QixJQUFJLGNBQWMsMEJBQTBCO0FBQUEsUUFDcEYsb0JBQW9CLElBQW9EO0FBQ2hGLGlCQUFPLE9BQU8saUJBQWlCLGtCQUFrQjtBQUFBLFFBQ2xEO0FBQUEsTUFDRCxHQUFDO0FBRUQsWUFBTSxFQUFFLFNBQVMsSUFBSSxvQkFBb0I7QUFBQSxRQUN4QyxTQUFTLENBQUMsRUFBRSxNQUFNLFdBQVcsUUFBUSxTQUFTLGFBQWEsY0FBYyxTQUFTLGVBQWUsQ0FBQztBQUFBLE1BQ25HLENBQUM7QUFFRCxZQUFNLGNBQWMsa0JBQWtCO0FBSXRDLFlBQU0scUJBQXFCLEVBQUUsZ0JBQWdCLFFBQVEsYUFBYSxJQUFVO0FBQzVFLFlBQU0sT0FBTyxNQUFNLFlBQVkscUJBQXFCLFVBQVUsa0JBQWtCLE1BQU0sa0JBQWtCLElBQUk7QUFDNUcsYUFBTyxHQUFHLE1BQU0sNEJBQTRCO0FBQzVDLE1BQUMsS0FBSyxPQUFxQixXQUFXLFNBQVM7QUFBQSxRQUM5QyxXQUFXO0FBQUEsUUFDWCxlQUFlLEVBQUUsWUFBWSxnQkFBZ0IsVUFBVSxnQkFBZ0I7QUFBQSxRQUN2RTtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssUUFBUTtBQUNiLFlBQU0sWUFBWSxzQkFBc0I7QUFFeEMsWUFBTSxPQUFPLE1BQU0sWUFBWSxxQkFBcUIsVUFBVSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUM1RyxhQUFPLEdBQUcsTUFBTSwrQkFBK0I7QUFDL0Msc0JBQWdCLElBQUksSUFBSTtBQUN4QixZQUFNLFdBQVksS0FBSyxPQUFxQixXQUFXLE1BQU0sSUFBSTtBQUNqRSxhQUFPO0FBQUEsUUFDTixFQUFFLGVBQWUsVUFBVSxlQUFlLFlBQVksb0JBQW9CLFVBQVUsbUJBQW1CO0FBQUEsUUFDdkcsRUFBRSxlQUFlLGdCQUFnQixtQkFBbUI7QUFBQSxRQUNwRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhFQUE4RSxZQUFZO0FBQzlGLFVBQU0sY0FBYyxrQkFBa0I7QUFDdEMsVUFBTSxpQkFBaUIscUJBQXFCLElBQUksZUFBZTtBQUcvRCxVQUFNLE1BQU0sWUFBWSxxQkFBcUIsa0JBQWtCLElBQUk7QUFDbkUsVUFBTSxRQUFRLElBQUk7QUFDbEIsVUFBTSxXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxjQUFjLEdBQUcsRUFBRSxXQUFXLENBQUMsRUFBRSxHQUFHLENBQUM7QUFJekUsbUJBQWUsc0JBQXNCLG9CQUFvQixRQUFRO0FBTWpFLFVBQU0sZUFBZSxrQkFBa0I7QUFDdkMsVUFBTSxlQUFlLE1BQU0sYUFBYSx1QkFBdUI7QUFDL0QsV0FBTztBQUFBLE1BQ04sYUFBYSxLQUFLLFVBQVEsS0FBSyxnQkFBZ0IsU0FBUyxNQUFNLE1BQU0sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQzlGLFdBQVcsTUFBTSxlQUFlLHlEQUF5RCxhQUFhLElBQUksT0FBSyxFQUFFLGdCQUFnQixTQUFTLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLElBQ3hKO0FBR0EsUUFBSSxRQUFRO0FBQUEsRUFDYixDQUFDO0FBRUQsT0FBSyxtRkFBbUYsWUFBWTtBQUNuRyxvQkFBZ0IsSUFBSSxpQkFBaUIsNEJBQTRCLHlCQUF5QixxQkFBcUIsQ0FBQztBQUVoSCxVQUFNLGNBQWMsa0JBQWtCO0FBR3RDLFVBQU0sTUFBTSxnQkFBZ0IsSUFBSSxrQkFBa0IsV0FBVyxDQUFDO0FBQzlELFVBQU0sUUFBUSxJQUFJO0FBQ2xCLFVBQU0sV0FBVyxNQUFNLFlBQVksWUFBWSxNQUFNLGlCQUFpQixJQUFJLHVCQUF1QixlQUFlO0FBQ2hILG1CQUFlLFdBQVcsUUFBUTtBQUNsQyxVQUFNLFNBQVMsS0FBSztBQUNwQixXQUFPLFlBQVksTUFBTSxZQUFZLEVBQUUsUUFBUSxDQUFDO0FBR2hELFVBQU0sa0JBQWtCLE1BQU0sWUFBWSxvQkFBb0I7QUFDOUQsV0FBTztBQUFBLE1BQ04sZ0JBQWdCLEtBQUssVUFBUSxLQUFLLGdCQUFnQixTQUFTLE1BQU0sTUFBTSxnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsTUFDakc7QUFBQSxJQUNEO0FBR0EsVUFBTSxZQUFZLG1CQUFtQixNQUFNLGVBQWU7QUFHMUQsVUFBTSxpQkFBaUIsTUFBTSxZQUFZLG9CQUFvQjtBQUM3RCxXQUFPO0FBQUEsTUFDTixDQUFDLGVBQWUsS0FBSyxVQUFRLEtBQUssZ0JBQWdCLFNBQVMsTUFBTSxNQUFNLGdCQUFnQixTQUFTLENBQUM7QUFBQSxNQUNqRztBQUFBLElBQ0Q7QUFJQSxXQUFPLFlBQWEsTUFBb0IsV0FBVyxJQUFJO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssMkRBQTJELFlBQVk7QUFDM0Usb0JBQWdCLElBQUksaUJBQWlCLDRCQUE0Qix5QkFBeUIscUJBQXFCLENBQUM7QUFFaEgsVUFBTSxjQUFjLGtCQUFrQjtBQUd0QyxVQUFNLE1BQU0sZ0JBQWdCLElBQUksa0JBQWtCLFdBQVcsQ0FBQztBQUM5RCxVQUFNLFFBQVEsSUFBSTtBQUNsQixVQUFNLFdBQVcsTUFBTSxZQUFZLFlBQVksTUFBTSxpQkFBaUIsSUFBSSx1QkFBdUIsZUFBZTtBQUNoSCxtQkFBZSxXQUFXLFFBQVE7QUFDbEMsVUFBTSxTQUFTLEtBQUs7QUFHcEIsVUFBTSxZQUFZLG1CQUFtQixNQUFNLGVBQWU7QUFHMUQsUUFBSSxRQUFRO0FBQ1osVUFBTSxZQUFZLHNCQUFzQjtBQUd4QyxVQUFNLGVBQWUsa0JBQWtCO0FBQ3ZDLFVBQU0sZUFBZSxNQUFNLGFBQWEsdUJBQXVCO0FBQy9ELFdBQU87QUFBQSxNQUNOLENBQUMsYUFBYSxLQUFLLFVBQVEsS0FBSyxnQkFBZ0IsU0FBUyxNQUFNLE1BQU0sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQy9GO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLCtCQUErQixNQUFNO0FBQzFDLDBDQUF3QztBQUV4QyxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVEsQ0FBQyxnQkFBMkU7QUFBQSxJQUN6RjtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1QsSUFBSTtBQUFBLE1BQVksTUFBTTtBQUFBLE1BQVksUUFBUTtBQUFBLE1BQVcsU0FBUztBQUFBLE1BQU8sUUFBUTtBQUFBLE1BQzdFLFdBQVcsSUFBSSxvQkFBb0IsS0FBSztBQUFBLE1BQUcsa0JBQWtCO0FBQUEsTUFBTSxnQkFBZ0I7QUFBQSxNQUFNLGlCQUFpQjtBQUFBLE1BQzFHLHNCQUFzQixDQUFDO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxRQUFRLENBQUMsUUFBZ0IsbUJBQXdHO0FBQUEsSUFDdEksYUFBYSxDQUFDO0FBQUEsSUFBRyxNQUFNLEVBQUUsSUFBSSxRQUFRLE1BQU0sYUFBYSxNQUFNO0FBQUEsSUFBRztBQUFBLElBQWUsV0FBVztBQUFBLElBQUksWUFBWSxDQUFDO0FBQUEsSUFBRyxTQUFTLENBQUM7QUFBQSxFQUMxSDtBQUVBLE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxTQUFTLDRCQUE0QixNQUFNLE9BQU8sTUFBUyxHQUFHLE1BQU0sT0FBTyxNQUFNLHdCQUF3QixDQUFDLEdBQUcsS0FBSztBQUN4SCxXQUFPLFlBQVksUUFBUSxlQUFlLE1BQVM7QUFBQSxFQUNwRCxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUMxRixVQUFNLFNBQVMsNEJBQTRCLE1BQU0sT0FBTyxNQUFNLHdCQUF3QixDQUFDLEdBQUcsTUFBTSxPQUFPLE1BQU0seUJBQXlCLENBQUMsR0FBRyxLQUFLO0FBQy9JLFdBQU8sWUFBWSxRQUFRLGVBQWUsWUFBWSx3QkFBd0I7QUFBQSxFQUMvRSxDQUFDO0FBRUQsT0FBSywyRkFBMkYsTUFBTTtBQUNyRyxXQUFPLFlBQVksNEJBQTRCLE1BQU0sT0FBTyxNQUFTLEdBQUcsTUFBTSxjQUFjLE1BQVMsR0FBRyxLQUFLLEdBQUcsS0FBSyxJQUFJLGNBQWMsMENBQXFDO0FBQzVLLFdBQU8sWUFBWSw0QkFBNEIsTUFBTSxhQUFhLE1BQVMsR0FBRyxNQUFNLGNBQWMsTUFBUyxHQUFHLEtBQUssR0FBRyxLQUFLLElBQUksYUFBYSxpQ0FBaUM7QUFDN0ssV0FBTyxZQUFZLDRCQUE0QixNQUFNLE9BQU8sTUFBUyxHQUFHLE1BQU0sT0FBTyxNQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUssSUFBSSxPQUFPLDBDQUEwQztBQUFBLEVBQ3BLLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sU0FBUyxNQUFNLE9BQU8sTUFBUztBQUNyQyxXQUFPLFlBQVksNEJBQTRCLFFBQVEsUUFBVyxLQUFLLEdBQUcsTUFBTTtBQUFBLEVBQ2pGLENBQUM7QUFDRixDQUFDO0FBRUQsTUFBTSw0QkFBNEIsTUFBTTtBQUN2QywwQ0FBd0M7QUFFeEMsUUFBTSxRQUFRO0FBQ2QsUUFBTSxRQUFRLENBQUMsZ0JBQTJFO0FBQUEsSUFDekY7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNULElBQUk7QUFBQSxNQUFZLE1BQU07QUFBQSxNQUFZLFFBQVE7QUFBQSxNQUFXLFNBQVM7QUFBQSxNQUFPLFFBQVE7QUFBQSxNQUM3RSxXQUFXLElBQUksb0JBQW9CLEtBQUs7QUFBQSxNQUFHLGtCQUFrQjtBQUFBLE1BQU0sZ0JBQWdCO0FBQUEsTUFBTSxpQkFBaUI7QUFBQSxNQUMxRyxzQkFBc0IsQ0FBQztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNBLFFBQU0sUUFBUSxDQUFDLG1CQUF3RztBQUFBLElBQ3RILGFBQWEsQ0FBQztBQUFBLElBQUcsTUFBTSxFQUFFLElBQUksT0FBTyxNQUFNLGFBQWEsTUFBTTtBQUFBLElBQUc7QUFBQSxJQUFlLFdBQVc7QUFBQSxJQUFJLFlBQVksQ0FBQztBQUFBLElBQUcsU0FBUyxDQUFDO0FBQUEsRUFDekg7QUFFQSxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFVBQU0sVUFBVSxNQUFNLG1DQUFtQztBQUN6RCxVQUFNLFNBQVMseUJBQXlCLE1BQU0sTUFBUyxHQUFHLE9BQU87QUFDakUsV0FBTyxZQUFZLFFBQVEsZUFBZSxZQUFZLG1DQUFtQztBQUFBLEVBQzFGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sU0FBUyx5QkFBeUIsTUFBTSxNQUFNLHFDQUFxQyxDQUFDLEdBQUcsTUFBTSxtQ0FBbUMsQ0FBQztBQUN2SSxXQUFPLFlBQVksUUFBUSxlQUFlLFlBQVkscUNBQXFDO0FBQUEsRUFDNUYsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsVUFBTSxTQUFTLE1BQU0sTUFBUztBQUM5QixXQUFPLFlBQVkseUJBQXlCLFFBQVEsTUFBUyxHQUFHLE1BQU07QUFDdEUsV0FBTyxZQUFZLE9BQU8sZUFBZSxNQUFTO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsV0FBTyxZQUFZLHlCQUF5QixRQUFXLE1BQU0sbUNBQW1DLENBQUMsR0FBRyxNQUFTO0FBQUEsRUFDOUcsQ0FBQztBQUNGLENBQUM7QUFHRCxTQUFTLHFCQUFxQixPQUFtQjtBQUNoRCxRQUFNLE1BQU0sTUFBTSxTQUFTO0FBQzNCLFNBQU87QUFBQSxJQUNOLEdBQUc7QUFBQSxJQUNILFVBQVUsSUFBSSxTQUFTLElBQUksT0FBSztBQUUvQixZQUFNLEVBQUUsY0FBYyxhQUFhLG1CQUFtQixlQUFlLGtCQUFrQixtQkFBbUIsb0JBQW9CLHNCQUFzQix1QkFBdUIsbUJBQW1CLG9CQUFvQixXQUFXLFlBQVksa0JBQWtCLG1CQUFtQixjQUFjLGVBQWUsY0FBYyxlQUFlLG9CQUFvQixxQkFBcUIsZ0JBQWdCLGlCQUFpQixHQUFHLEtBQUssSUFBSTtBQUM5WixhQUFPO0FBQUEsUUFDTixHQUFHO0FBQUEsUUFDSCxZQUFZO0FBQUEsVUFDWCxHQUFHLEVBQUU7QUFBQSxVQUNMLGFBQWE7QUFBQSxRQUNkO0FBQUEsUUFDQSxXQUFXO0FBQUEsUUFDWCxXQUFXO0FBQUE7QUFBQSxRQUNYLFlBQVk7QUFBQTtBQUFBLFFBQ1osZ0JBQWdCO0FBQUE7QUFBQSxRQUNoQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
