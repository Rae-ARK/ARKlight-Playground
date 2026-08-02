import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { timeout } from "../../../../base/common/async.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { observableValue } from "../../../../base/common/observable.js";
import { hasKey } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentSession, SubagentChatSignal } from "../../common/agentService.js";
import { buildDefaultChangesetCatalog } from "../../common/changesetUri.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { ChatOriginKind, CustomizationType, McpAuthRequiredReason, SessionInputRequestKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildSubagentChatUri, buildChatUri, buildDefaultChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInteractivity, CustomizationLoadStatus, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI, SessionInputResponseKind, SessionLifecycle, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, customizationId } from "../../common/state/sessionState.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTelemetryLevelConfigKey, telemetryLevelToAgentHostConfigValue } from "../../common/agentHostSchema.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { AgentService } from "../../node/agentService.js";
import { AgentSideEffects } from "../../node/agentSideEffects.js";
import { AgentHostLocalTurns } from "../../node/agentHostLocalTurns.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { createNoopGitService, createNullSessionDataService, createSessionDataService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
import { MockAgent } from "./mockAgent.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
class FakeChangesetService {
  constructor() {
    this.toolCallEdits = [];
    this.turnCompletes = [];
    this.truncates = [];
  }
  registerStaticChangesets() {
  }
  restoreStaticChangeset(_session, _kind, _diffs) {
  }
  parsePersistedStaticChangesets() {
    return {};
  }
  applyPersistedStaticChangesets() {
  }
  restorePersistedStaticChangesets() {
    return {};
  }
  persistChangesSummary(session, changesSummary) {
  }
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys(_sessionUri) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
  refreshChangesetCatalog(session) {
  }
  refreshBranchChangeset() {
  }
  refreshSessionChangeset() {
  }
  onWorkingDirectoryAvailable() {
  }
  recomputeSubscribedChangesets() {
  }
  onSessionDisposed() {
  }
  async computeUncommittedChangeset(session) {
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(session) {
    return `${session}/changeset/turn/x`;
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`;
  }
  onToolCallEditsApplied(session, turnId) {
    this.toolCallEdits.push({ session, turnId });
  }
  onTurnComplete(session, turnId) {
    this.turnCompletes.push({ session, turnId });
  }
  onSessionTruncated(session) {
    this.truncates.push(session);
  }
}
function createTestSideEffects(disposables, stateManager, options, _gitService, telemetryService = NullTelemetryService, changesets = new FakeChangesetService(), terminalManager = disposables.add(new TestAgentHostTerminalManager()), checkpointService = NULL_CHECKPOINT_SERVICE) {
  const logService = new NullLogService();
  const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
  const instantiationService = disposables.add(new InstantiationService(
    new ServiceCollection(
      [ILogService, logService],
      [IAgentConfigurationService, configService],
      [IAgentHostChangesetService, changesets],
      [IAgentHostCheckpointService, checkpointService],
      [ITelemetryService, telemetryService],
      [IAgentHostTerminalManager, terminalManager],
      [ISessionDataService, options.sessionDataService]
    ),
    /*strict*/
    true
  ));
  const resolvedOptions = {
    ...options,
    localTurns: options.localTurns ?? new AgentHostLocalTurns(options.sessionDataService, logService)
  };
  return disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, resolvedOptions));
}
class TestTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sessionId = "test-session";
    this.machineId = "test-machine";
    this.sqmId = "test-sqm";
    this.devDeviceId = "test-dev-device";
    this.firstSessionDate = "test-first-session-date";
    this.sendErrorTelemetry = false;
    this.events = [];
  }
  publicLog() {
  }
  publicLog2(eventName, data) {
    this.events.push({ eventName, data });
  }
  publicLogError() {
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects", () => {
  const disposables = new DisposableStore();
  let fileService;
  let stateManager;
  let agent;
  let sideEffects;
  let agentList;
  let telemetryService;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession(workingDirectory) {
    stateManager.createSession({
      resource: sessionUri.toString(),
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    });
    stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
    stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
  }
  function startTurn(turnId, channel = defaultChatUri) {
    stateManager.dispatchClientAction(
      channel,
      { type: ActionType.ChatTurnStarted, turnId, startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hello", origin: { kind: MessageKind.User } } },
      { clientId: "test", clientSeq: 1 }
    );
  }
  function waitForState(manager, match) {
    return new Promise((resolve, reject) => {
      const initial = match();
      if (initial !== void 0) {
        resolve(initial);
        return;
      }
      const store = new DisposableStore();
      const timer = setTimeout(() => {
        store.dispose();
        reject(new Error("waitForState: condition was not met"));
      }, 5e3);
      store.add(toDisposable(() => clearTimeout(timer)));
      store.add(manager.onDidEmitEnvelope(() => {
        const value = match();
        if (value !== void 0) {
          store.dispose();
          resolve(value);
        }
      }));
    });
  }
  async function waitForSendMessageCalls(count) {
    if (agent.sendMessageCalls.length >= count) {
      return;
    }
    await Event.toPromise(Event.filter(agent.onDidSendMessage, () => agent.sendMessageCalls.length >= count));
  }
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    const testDir = URI.from({ scheme: Schemas.inMemory, path: "/testDir" });
    await fileService.createFolder(testDir);
    await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path: "/testDir/file.txt" }), VSBuffer.fromString("hello"));
    agent = new MockAgent();
    disposables.add(toDisposable(() => agent.dispose()));
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    agentList = observableValue("agents", [agent]);
    telemetryService = new TestTelemetryService();
    sideEffects = createTestSideEffects(disposables, stateManager, {
      getAgent: () => agent,
      agents: agentList,
      sessionDataService: createNullSessionDataService(),
      onTurnComplete: () => {
      }
    }, void 0, disposables.add(new AgentHostTelemetryService(telemetryService)));
    disposables.add(agent.onDidSessionProgress((signal) => {
      const spawn = SubagentChatSignal.toSpawnEvent(signal);
      if (spawn) {
        stateManager.addChat(spawn.session.toString(), spawn.chat.toString(), {
          title: spawn.title,
          origin: spawn.parent ? { kind: ChatOriginKind.Tool, chat: spawn.parent.chat.toString(), toolCallId: spawn.parent.toolCallId } : void 0
        });
      }
    }));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("handleAction \u2014 session/turnStarted", () => {
    test("calls sendMessage on the agent", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: "hello world", attachments: void 0, chat: URI.parse(defaultChatUri) }]);
    });
    test("passes the dispatching client id and type to sendMessage", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      };
      sideEffects.handleAction(defaultChatUri, action, "client-B", AgentHostClientType.EditorWindow);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: void 0,
        chat: URI.parse(defaultChatUri),
        senderClientId: "client-B",
        clientType: "editor_window"
      }]);
    });
    test("logs telemetry when sending a direct user message", () => {
      setupSession();
      const activeClientAction = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [{ name: "testTool", inputSchema: { type: "object" } }],
          customizations: [{ type: CustomizationType.Plugin, id: customizationId("file:///customizations/SKILL.md"), uri: "file:///customizations/SKILL.md", name: "Test Skill", enabled: true }]
        }
      };
      stateManager.dispatchClientAction(sessionUri.toString(), activeClientAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(sessionUri.toString(), activeClientAction);
      const fileUri = URI.file("/workspace/direct.ts");
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "direct.ts", displayKind: "document" }] }
      }, "client-agents", AgentHostClientType.AgentsWindow);
      assert.deepStrictEqual(telemetryService.events, [{
        eventName: "agentHost.userMessageSent",
        data: {
          provider: "mock",
          initiatorClientType: "agents_window",
          agentSessionId: "session-1",
          source: "direct",
          isSubagentSession: false,
          turnCount: 0,
          activeClientId: "test-client",
          activeClientToolCount: 1,
          activeClientCustomizationCount: 1,
          attachmentCount: 1
        }
      }]);
    });
    test("parses protocol attachment URI strings before passing them to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/test.ts");
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "test.ts", displayKind: "document" }] }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "test.ts", displayKind: "document" }],
        chat: URI.parse(defaultChatUri)
      }]);
    });
    test("passes protocol selection attachment range straight through to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/selection.ts");
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "hello world",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Resource,
            uri: fileUri.toString(),
            label: "selection.ts",
            displayKind: "selection",
            selection: {
              range: {
                start: { line: 2, character: 3 },
                end: { line: 4, character: 5 }
              }
            }
          }]
        }
      };
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "hello world",
        attachments: [{
          type: MessageAttachmentKind.Resource,
          uri: fileUri.toString(),
          label: "selection.ts",
          displayKind: "selection",
          selection: {
            range: {
              start: { line: 2, character: 3 },
              end: { line: 4, character: 5 }
            }
          }
        }],
        chat: URI.parse(defaultChatUri)
      }]);
    });
    test("resolves chat attachments that reference another session", async () => {
      setupSession();
      const otherSessionUri = AgentSession.uri("mock", "session-2");
      stateManager.createSession({
        resource: otherSessionUri.toString(),
        provider: "mock",
        title: "Other",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(otherSessionUri.toString(), { type: ActionType.SessionReady });
      stateManager.seedDefaultChatTurns(otherSessionUri.toString(), [{
        id: "other-turn",
        state: TurnState.Complete,
        message: { text: "Cross session memory", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Recalled across sessions" }],
        usage: void 0
      }]);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "read another session",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: otherSessionUri.toString(),
            endTurn: "other-turn",
            label: "Other session"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasUser: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("User: Cross session memory"),
        hasAssistant: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Recalled across sessions")
      }, {
        type: MessageAttachmentKind.Simple,
        hasUser: true,
        hasAssistant: true
      });
    });
    test("degrades to a no-excerpt pointer when the referenced chat is unresolvable", async () => {
      setupSession();
      const missingSessionUri = AgentSession.uri("mock", "missing");
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        // Mirrors agentService._resolveChatAttachmentTurns throwing
        // ProtocolError(AHP_SESSION_NOT_FOUND) for a cross-session
        // reference this host cannot restore.
        resolveChatAttachmentTurns: async () => {
          throw new Error("AHP_SESSION_NOT_FOUND");
        },
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "read a stale reference",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: missingSessionUri.toString(),
            endTurn: "gone-turn",
            label: "Stale chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        label: attachment?.label,
        noExcerpt: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("has no transcript content up to the selected turn")
      }, {
        type: MessageAttachmentKind.Simple,
        label: "Stale chat",
        noExcerpt: true
      });
    });
    test("awaits hydrated turns when resolving a chat attachment", async () => {
      setupSession();
      const sourceTurn = {
        id: "source-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Remembered" }],
        usage: void 0
      };
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveChatAttachmentTurns: async () => [sourceTurn],
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            endTurn: sourceTurn.id,
            label: "Earlier chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasUser: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("User: Remember X"),
        hasAssistant: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered")
      }, {
        type: MessageAttachmentKind.Simple,
        hasUser: true,
        hasAssistant: true
      });
    });
    test("pins the latest completed turn when a chat attachment omits endTurn", async () => {
      setupSession();
      const olderTurn = {
        id: "older-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "r1", content: "Remembered X" }],
        usage: void 0
      };
      const latestTurn = {
        id: "latest-turn",
        state: TurnState.Complete,
        message: { text: "Remember Z", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "r2", content: "Remembered Z" }],
        usage: void 0
      };
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        resolveChatAttachmentTurns: async () => [olderTurn, latestTurn],
        onTurnComplete: () => {
        }
      });
      resolvingSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            label: "Earlier chat"
          }]
        }
      });
      await waitForSendMessageCalls(1);
      const attachment = agent.sendMessageCalls[0].attachments?.[0];
      assert.deepStrictEqual({
        type: attachment?.type,
        hasOlder: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered X"),
        hasLatest: attachment?.type === MessageAttachmentKind.Simple && attachment.modelRepresentation?.includes("Assistant: Remembered Z")
      }, {
        type: MessageAttachmentKind.Simple,
        hasOlder: true,
        hasLatest: true
      });
    });
    test("rejects chat attachments whose endTurn is missing from the retained transcript", async () => {
      setupSession();
      stateManager.seedDefaultChatTurns(sessionUri.toString(), [{
        id: "source-turn",
        state: TurnState.Complete,
        message: { text: "Remember X", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "response", content: "Remembered" }],
        usage: void 0
      }]);
      const error = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (envelope2) => envelope2.action.type === ActionType.ChatError && envelope2.channel === defaultChatUri));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: sessionUri.toString(),
            endTurn: "missing-turn",
            label: "Earlier chat"
          }]
        }
      });
      const envelope = await error;
      assert.deepStrictEqual({
        sendMessageCalls: agent.sendMessageCalls.length,
        errorType: envelope.action.type === ActionType.ChatError ? envelope.action.error.errorType : void 0
      }, {
        sendMessageCalls: 0,
        errorType: "sendFailed"
      });
    });
    test("rejects chat attachments whose endTurn is still active", async () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      stateManager.addChat(sessionUri.toString(), peerChatUri, { title: "Peer" });
      stateManager.dispatchClientAction(peerChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "active-turn",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Remember X", origin: { kind: MessageKind.User } }
      }, { clientId: "test", clientSeq: 1 });
      const error = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (envelope2) => envelope2.action.type === ActionType.ChatError && envelope2.channel === defaultChatUri));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: {
          text: "What was remembered?",
          origin: { kind: MessageKind.User },
          attachments: [{
            type: MessageAttachmentKind.Chat,
            resource: peerChatUri,
            endTurn: "active-turn",
            label: "Earlier chat"
          }]
        }
      });
      const envelope = await error;
      assert.deepStrictEqual({
        sendMessageCalls: agent.sendMessageCalls.length,
        errorType: envelope.action.type === ActionType.ChatError ? envelope.action.error.errorType : void 0
      }, {
        sendMessageCalls: 0,
        errorType: "sendFailed"
      });
    });
    test("dispatches session/error when no agent is found", async () => {
      setupSession();
      const emptyAgents = observableValue("agents", []);
      const noAgentSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => void 0,
        agents: emptyAgents,
        sessionDataService: {},
        onTurnComplete: () => {
        }
      });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      noAgentSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch session/error");
    });
    test("rejects a turn on an archived session without calling the agent", () => {
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsArchivedChanged, isArchived: true });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch a chat error for an archived session");
      assert.deepStrictEqual(agent.sendMessageCalls, []);
    });
    test("rejects a turn on a read-only chat without calling the agent", () => {
      setupSession();
      const readOnlyChat = buildChatUri(sessionUri, "peer-ro");
      stateManager.addChat(sessionUri.toString(), readOnlyChat, { interactivity: ChatInteractivity.ReadOnly });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(readOnlyChat, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const errorAction = envelopes.find((e) => e.action.type === ActionType.ChatError);
      assert.ok(errorAction, "should dispatch a chat error for a read-only chat");
      assert.deepStrictEqual(agent.sendMessageCalls, []);
    });
  });
  suite("handleAction \u2014 first-turn materialization failure", () => {
    function setupProvisionalSession() {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { emitNotification: false });
    }
    test("surfaces a failed provisional first turn as a terminal creation failure", async () => {
      setupProvisionalSession();
      agent.sendMessageError = new Error("git -c exited with code 128: fatal: invalid reference: main");
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const notifications = [];
      disposables.add(stateManager.onDidEmitNotification((n) => notifications.push(n)));
      sideEffects.handleAction(defaultChatUri, turnStarted);
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed) || void 0);
      const sessionAdded = notifications.find((n) => n.type === "root/sessionAdded");
      assert.deepStrictEqual({
        chatError: envelopes.some((e) => e.action.type === ActionType.ChatError),
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
        sessionAddedWithError: !!sessionAdded && (sessionAdded.summary.status & SessionStatus.Error) === SessionStatus.Error
      }, {
        chatError: true,
        creationFailed: true,
        lifecycle: SessionLifecycle.CreationFailed,
        sessionAddedWithError: true
      });
    });
    test("surfaces a working directory resolution failure without calling the agent", async () => {
      setupProvisionalSession();
      const resolutionError = new Error("The isolated worktree could not be restored");
      const resolvingSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: {},
        resolveWorkingDirectoryBeforeSend: async () => {
          throw resolutionError;
        },
        onTurnComplete: () => {
        }
      });
      const turnStarted = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, turnStarted, { clientId: "test", clientSeq: 1 });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      resolvingSideEffects.handleAction(defaultChatUri, turnStarted);
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed) || void 0);
      assert.deepStrictEqual({
        chatError: envelopes.some((e) => e.action.type === ActionType.ChatError),
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle,
        sendMessageCalls: agent.sendMessageCalls
      }, {
        chatError: true,
        creationFailed: true,
        lifecycle: SessionLifecycle.CreationFailed,
        sendMessageCalls: []
      });
    });
    test("does not fail creation when an already-ready session send rejects", async () => {
      setupSession();
      agent.sendMessageError = new Error("transient send failure");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        startedAt: "2025-01-01T00:00:00.000Z",
        turnId: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      await waitForState(stateManager, () => envelopes.some((e) => e.action.type === ActionType.ChatError) || void 0);
      assert.deepStrictEqual({
        chatError: envelopes.some((e) => e.action.type === ActionType.ChatError),
        creationFailed: envelopes.some((e) => e.action.type === ActionType.SessionCreationFailed),
        lifecycle: stateManager.getSessionState(sessionUri.toString())?.lifecycle
      }, {
        chatError: true,
        creationFailed: false,
        lifecycle: SessionLifecycle.Ready
      });
    });
  });
  suite("handleAction \u2014 /rename slash command", () => {
    function createRenameSideEffects() {
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(),
        onTurnComplete: () => {
        }
      });
    }
    test("redirects /rename to a title change and completes the turn without calling the agent", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/rename Renamed Session", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.title, "Renamed Session");
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
      const part = state?.turns.at(-1)?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.Markdown);
      assert.strictEqual(part?.kind === ResponsePartKind.Markdown ? part.content : void 0, "Renamed: Renamed Session");
    });
    test("/rename without a title completes the turn and leaves the title unchanged", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/rename", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.title, "Test");
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
    });
    test("a message that merely starts with /rename text (no separator) is sent to the agent", async () => {
      setupSession();
      const renameSideEffects = createRenameSideEffects();
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "/renamed thing", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      renameSideEffects.handleAction(defaultChatUri, action);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), chat: URI.parse(defaultChatUri), prompt: "/renamed thing", attachments: void 0 }]);
    });
  });
  suite("handleAction \u2014 ! terminal command", () => {
    function createBangSideEffects(terminalManager) {
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
    }
    test("runs a ! message as a terminal command and completes the turn without calling the agent", async () => {
      setupSession("file:///work");
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createBangSideEffects(terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      const terminalUri = terminalManager.created[0].channel;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.deepStrictEqual(agent.sendMessageCalls, []);
      const state = stateManager.getSessionState(sessionUri.toString());
      const part = state?.turns.at(-1)?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
      assert.strictEqual(toolCall?.status, ToolCallStatus.Completed);
      assert.strictEqual(toolCall?.status === ToolCallStatus.Completed ? toolCall.success : void 0, true);
      assert.ok(toolCall?.status === ToolCallStatus.Completed && toolCall.content?.some((c) => c.type === ToolResultContentType.Terminal && c.resource === terminalUri));
      assert.strictEqual(terminalManager.created.length, 1);
      assert.ok(terminalManager.sentTexts.some((s) => s.data.includes("echo hi")));
    });
    test("a lone ! is forwarded to the agent instead of running a command", async () => {
      setupSession();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createBangSideEffects(terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "!");
      assert.strictEqual(terminalManager.created.length, 0);
    });
    test("records the completed bang turn as a local turn, stripped of the live terminal reference", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const localTurns = new AgentHostLocalTurns(createSessionDataService(db), new NullLogService());
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        localTurns,
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, "turn-1"), void 0);
      const persisted = await db.getLocalTurns();
      assert.strictEqual(persisted.length, 1);
      const payload = JSON.parse(persisted[0].payload);
      const toolCallPart = payload.responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
      assert.ok(toolCallPart?.toolCall?.content?.every((c) => c.type !== ToolResultContentType.Terminal));
      assert.ok(toolCallPart?.toolCall?.content?.some((c) => c.type === ToolResultContentType.Text));
    });
    test("seeds the session title from the ! command when the session is untitled", async () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const bangSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      bangSideEffects.handleAction(defaultChatUri, action);
      assert.strictEqual(stateManager.getSessionState(sessionUri.toString())?.title, "echo hi");
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
      assert.strictEqual(await db.getMetadata("customTitle"), "echo hi");
    });
  });
  suite("local turn persistence", () => {
    let clientSeq;
    setup(() => {
      clientSeq = 0;
    });
    function seedRealTurn(turnId, text) {
      stateManager.dispatchClientAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text, origin: { kind: MessageKind.User } }
      }, { clientId: "test", clientSeq: ++clientSeq });
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnComplete, turnId, duration: 1e3 });
    }
    async function runBang(se, terminalManager, turnId) {
      const action = {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, action);
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: turnId, command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForState(stateManager, () => stateManager.getActiveTurnId(sessionUri.toString()) === void 0 ? true : void 0);
    }
    let localTurns;
    function createLocalTurnSideEffects(db, terminalManager) {
      const sessionDataService = createSessionDataService(db);
      localTurns = new AgentHostLocalTurns(sessionDataService, new NullLogService());
      return createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService,
        localTurns,
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
    }
    test("anchors a bang turn to the preceding concrete turn", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      assert.strictEqual(localTurns.resolveConcreteTurnId(defaultChatUri, "local-1"), "real-1");
      const persisted = await db.getLocalTurns();
      assert.deepStrictEqual(persisted.map((r) => ({ turnId: r.turnId, chatUri: r.chatUri, anchorTurnId: r.anchorTurnId })), [
        { turnId: "local-1", chatUri: defaultChatUri, anchorTurnId: "real-1" }
      ]);
    });
    test("truncating at a local turn redirects the SDK truncation to the concrete anchor", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "local-1" }, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "local-1" });
      const truncateCall = agent.truncateSessionCalls.at(-1);
      assert.strictEqual(truncateCall?.session.toString(), sessionUri.toString());
      assert.strictEqual(truncateCall?.turnId, "real-1");
    });
    test("truncating at a real turn drops the trailing local turn", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const se = createLocalTurnSideEffects(db, terminalManager);
      seedRealTurn("real-1", "hello");
      await runBang(se, terminalManager, "local-1");
      stateManager.dispatchClientAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "real-1" }, { clientId: "test", clientSeq: ++clientSeq });
      se.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "real-1" });
      assert.strictEqual(agent.truncateSessionCalls.at(-1)?.turnId, "real-1");
      assert.strictEqual(localTurns.isLocal(defaultChatUri, "local-1"), false);
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(await db.getLocalTurns(), []);
    });
  });
  suite("turn usage persistence", () => {
    const usage = { inputTokens: 100, outputTokens: 20, model: "gpt-5", _meta: { copilotUsage: { totalNanoAiu: 5e9 } } };
    function createUsageSideEffects(db) {
      const sessionDataService = createSessionDataService(db);
      createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService,
        localTurns: new AgentHostLocalTurns(sessionDataService, new NullLogService()),
        onTurnComplete: () => {
        }
      });
    }
    test("persists the latest usage of a turn, without waiting for the turn to end", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      createUsageSideEffects(db);
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 1, outputTokens: 1 } });
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], [["turn-1", JSON.stringify(usage)]]);
    });
    test("does not persist usage reported on a subagent chat", async () => {
      setupSession("file:///work");
      const db = new TestSessionDatabase();
      createUsageSideEffects(db);
      const subagentChatUri = buildSubagentChatUri(sessionUri.toString(), "tool-call-1");
      stateManager.dispatchServerAction(subagentChatUri, { type: ActionType.ChatUsage, turnId: "turn-1", usage });
      stateManager.dispatchServerAction(subagentChatUri, { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 10 });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual([...(await db.getTurnUsages()).entries()], []);
    });
  });
  suite("immediate title on first turn", () => {
    function setupDefaultSession() {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
    }
    test("dispatches titleChanged with user message on first turn", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "Fix the login bug", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.ok(titleAction, "should dispatch session/titleChanged");
      if (titleAction?.action.type === ActionType.SessionTitleChanged) {
        assert.strictEqual(titleAction.action.title, "Fix the login bug");
      }
    });
    test("does not dispatch titleChanged when message is whitespace", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "   ", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not dispatch titleChanged for empty message");
    });
    test("normalizes whitespace and truncates long messages", () => {
      setupDefaultSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const longMessage = "Fix the bug\nin the login	page  please " + "a".repeat(250);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: longMessage, origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.ok(titleAction, "should dispatch session/titleChanged");
      if (titleAction?.action.type === ActionType.SessionTitleChanged) {
        assert.ok(!titleAction.action.title.includes("\n"), "should not contain newlines");
        assert.ok(!titleAction.action.title.includes("	"), "should not contain tabs");
        assert.ok(!titleAction.action.title.includes("  "), "should not contain double spaces");
        assert.ok(titleAction.action.title.length <= 200, "should be truncated to 200 chars");
      }
    });
    test("does not dispatch titleChanged on second turn", () => {
      setupDefaultSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "second message", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not dispatch titleChanged on second turn");
    });
    test("does not dispatch titleChanged when title is already set", () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "User Renamed",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      const titleAction = envelopes.find((e) => e.action.type === ActionType.SessionTitleChanged);
      assert.strictEqual(titleAction, void 0, "should not clobber existing title");
    });
  });
  suite("turn completion \u2014 read/unread", () => {
    function readChangesFrom(envelopes) {
      return envelopes.filter((e) => e.action.type === ActionType.SessionIsReadChanged).map((e) => e.action.isRead);
    }
    function setupPersisting() {
      const db = new TestSessionDatabase();
      const persisting = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, disposables.add(new AgentHostTelemetryService(telemetryService)));
      return { sideEffects: persisting, db };
    }
    test("marks a read session unread when a turn completes", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("does not re-mark an already-unread session on turn completion", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual(readChangesFrom(envelopes), []);
    });
    test("persists the unread flag so it survives a host restart", async () => {
      const { sideEffects: persisting, db } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.strictEqual(await db.getMetadata("isRead"), "");
    });
    test("persists read state exactly once for client- and server-dispatched changes", () => {
      const { db } = setupPersisting();
      setupSession();
      stateManager.dispatchClientAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true }, { clientId: "client-1", clientSeq: 1 });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: false });
      stateManager.rejectClientAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true }, { clientId: "client-1", clientSeq: 2 }, "nope");
      assert.deepStrictEqual(db.setMetadataCalls.filter((c) => c.key === "isRead"), [
        { key: "isRead", value: "true" },
        { key: "isRead", value: "" }
      ]);
    });
    test("marks the parent session unread when a subagent turn completes", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        agentName: "code-reviewer",
        agentDisplayName: "Code Reviewer"
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subagentTurnId = stateManager.getSessionState(subagentUri).activeTurn.id;
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(subagentUri),
        action: { type: ActionType.ChatTurnComplete, turnId: subagentTurnId, duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("marks a read session unread when a turn is cancelled", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
    test("marks a read session unread when a turn errors", () => {
      const { sideEffects: persisting } = setupPersisting();
      setupSession();
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionIsReadChanged, isRead: true });
      disposables.add(persisting.registerProgressListener(agent));
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatError, turnId: "turn-1", duration: 1e3, error: { errorType: "Error", message: "boom" } }
      });
      assert.deepStrictEqual({
        readChanges: readChangesFrom(envelopes),
        isReadBitSet: (stateManager.getSessionSummary(sessionUri.toString()).status & SessionStatus.IsRead) !== 0
      }, {
        readChanges: [false],
        isReadBitSet: false
      });
    });
  });
  suite("handleAction \u2014 session/turnCancelled", () => {
    test("calls abortSession on the agent", async () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.abortSessionCalls, [URI.parse(sessionUri.toString())]);
    });
  });
  suite("handleAction \u2014 chat/turnStarted model selection", () => {
    test("calls changeModel on the agent before sending the message", async () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: { id: "gpt-5" }, chat: URI.parse(defaultChatUri) }]);
    });
    test("waits for model selection before sending the message", async () => {
      setupSession();
      let resolveChangeModel;
      const changeModelSettled = new Promise((resolve) => {
        resolveChangeModel = resolve;
      });
      let resolveSend;
      const sendStarted = new Promise((resolve) => {
        resolveSend = resolve;
      });
      agent.changeModel = async (session, model, chat) => {
        agent.changeModelCalls.push({ session, model, chat });
        await changeModelSettled;
      };
      agent.sendMessage = async (session, chat, prompt, attachments) => {
        agent.sendMessageCalls.push({ session, prompt, attachments, chat });
        resolveSend();
      };
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      });
      await Promise.resolve();
      assert.deepStrictEqual({
        changeModelCalls: agent.changeModelCalls,
        sendMessageCalls: agent.sendMessageCalls
      }, {
        changeModelCalls: [{ session: URI.parse(sessionUri.toString()), model: { id: "gpt-5" }, chat: URI.parse(defaultChatUri) }],
        sendMessageCalls: []
      });
      resolveChangeModel();
      await sendStarted;
      assert.deepStrictEqual(agent.sendMessageCalls, [{ session: URI.parse(sessionUri.toString()), prompt: "hello", attachments: void 0, chat: URI.parse(defaultChatUri) }]);
    });
    test("forwards the chat channel for an additional (peer) chat", async () => {
      setupSession();
      const chatChannel = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(chatChannel, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "gpt-5" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeModelCalls, [{ session: URI.parse(sessionUri.toString()), model: { id: "gpt-5" }, chat: URI.parse(chatChannel) }]);
    });
  });
  suite("handleAction \u2014 chat/turnStarted agent selection", () => {
    test("calls changeAgent on the agent for the session default chat before sending the message", async () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, agent: { uri: "file:///agents/reviewer.md" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeAgentCalls, [{ session: URI.parse(sessionUri.toString()), agent: { uri: "file:///agents/reviewer.md" }, chat: URI.parse(defaultChatUri) }]);
    });
    test("forwards the chat channel for an additional (peer) chat", async () => {
      setupSession();
      const chatChannel = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(chatChannel, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, agent: { uri: "file:///agents/reviewer.md" } }
      });
      await new Promise((r) => setTimeout(r, 10));
      assert.deepStrictEqual(agent.changeAgentCalls, [{ session: URI.parse(sessionUri.toString()), agent: { uri: "file:///agents/reviewer.md" }, chat: URI.parse(chatChannel) }]);
    });
  });
  suite("registerProgressListener", () => {
    test("maps agent progress events to state actions", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-1", content: "hi" } }
      });
      assert.ok(envelopes.some((e) => e.action.type === ActionType.ChatResponsePart));
    });
    test("does not route stale actions into a force-started turn", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "stale-part", content: "stale response" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 100, outputTokens: 50, model: "stale-model" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 199029 }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-2", part: { kind: ResponsePartKind.Markdown, id: "fresh-part", content: "fresh" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatDelta, turnId: "turn-2", partId: "fresh-part", content: " response" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatUsage, turnId: "turn-2", usage: { inputTokens: 20, outputTokens: 10, model: "fresh-model" } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-2", duration: 2e3 }
      });
      const state = stateManager.getSessionState(defaultChatUri);
      assert.deepStrictEqual(state?.turns.map((turn) => ({
        id: turn.id,
        state: turn.state,
        duration: turn.duration,
        message: turn.message.text,
        markdown: turn.responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content).join(""),
        usage: turn.usage
      })), [{
        id: "turn-1",
        state: TurnState.Cancelled,
        duration: 1e3,
        message: "hello",
        markdown: "",
        usage: void 0
      }, {
        id: "turn-2",
        state: TurnState.Complete,
        duration: 2e3,
        message: "continue",
        markdown: "fresh response",
        usage: { inputTokens: 20, outputTokens: 10, model: "fresh-model" }
      }]);
    });
    test("preserves the turn id of a provider-initiated turn when idle", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "provider-turn",
          startedAt: "2025-01-01T00:01:00.000Z",
          message: { text: "provider notification", origin: { kind: MessageKind.SystemNotification } }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "provider-turn", part: { kind: ResponsePartKind.Markdown, id: "provider-part", content: "provider response" } }
      });
      const state = stateManager.getSessionState(defaultChatUri);
      assert.deepStrictEqual({
        turnId: state?.activeTurn?.id,
        message: state?.activeTurn?.message.text,
        responseParts: state?.activeTurn?.responseParts
      }, {
        turnId: "provider-turn",
        message: "provider notification",
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "provider-part", content: "provider response" }]
      });
    });
    test("does not replace an active turn with a stale turn start", () => {
      setupSession();
      startTurn("turn-2");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-1",
          startedAt: "2025-01-01T00:00:00.000Z",
          message: { text: "stale request", origin: { kind: MessageKind.User } }
        }
      });
      assert.deepStrictEqual({
        turnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id,
        message: stateManager.getSessionState(defaultChatUri)?.activeTurn?.message.text
      }, {
        turnId: "turn-2",
        message: "hello"
      });
    });
    test("stale completion does not clear active turn tool tracking", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-2",
          toolCallId: "active-tool",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 199029 }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-2",
          toolCallId: "active-tool",
          result: { success: true, pastTenseMessage: "Read file" }
        }
      });
      assert.deepStrictEqual(
        telemetryService.events.filter((event) => event.eventName === "languageModelToolInvoked").map((event) => event.eventName),
        ["languageModelToolInvoked"]
      );
    });
    test("returns a disposable that stops listening", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const listener = sideEffects.registerProgressListener(agent);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-1", content: "before" } }
      });
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.ChatResponsePart).length, 1);
      listener.dispose();
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-2", content: "after" } }
      });
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.ChatResponsePart).length, 1);
    });
    test("customizations change publishes once, then dedupes identical re-fetches", async () => {
      setupSession();
      const makeCustomizations = () => [
        { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } }
      ];
      let fetchCalls = 0;
      agent.getSessionCustomizations = async () => {
        fetchCalls++;
        return makeCustomizations();
      };
      const changed = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => {
        if (e.action.type === ActionType.SessionCustomizationsChanged) {
          changed.push(e);
        }
      }));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 1 || void 0);
      assert.strictEqual(changed.length, 1);
      agent.fireCustomizationsChange();
      agent.fireCustomizationsChange();
      const deadline = Date.now() + 5e3;
      while (fetchCalls < 3 && Date.now() < deadline) {
        await timeout(5);
      }
      assert.strictEqual(changed.length, 1, "identical customizations must not re-publish");
      assert.ok(fetchCalls >= 3, "each change still re-fetches to compare");
    });
    test("re-publishes after session eviction + restore even when customizations are unchanged", async () => {
      setupSession();
      const makeCustomizations = () => [
        { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } }
      ];
      agent.getSessionCustomizations = async () => makeCustomizations();
      const changed = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => {
        if (e.action.type === ActionType.SessionCustomizationsChanged) {
          changed.push(e);
        }
      }));
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 1 || void 0);
      assert.strictEqual(changed.length, 1);
      stateManager.removeSession(sessionUri.toString());
      setupSession();
      agent.fireCustomizationsChange();
      await waitForState(stateManager, () => changed.length >= 2 || void 0);
      assert.strictEqual(changed.length, 2, "restored session must receive its customizations");
    });
  });
  suite("agents observable", () => {
    test("dispatches root/agentsChanged without fetching models when observable changes", async () => {
      agentList.set([], void 0);
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents.length === 1;
      }));
      agentList.set([agent], void 0);
      const { action } = await envelope;
      assert.strictEqual(action.type, ActionType.RootAgentsChanged);
      assert.deepStrictEqual(action.agents[0].models, []);
    });
    test("model observable update publishes models", async () => {
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels([{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, maxOutputTokens: 16e3, maxPromptTokens: 112e3, supportsVision: false }]);
      await envelope;
      const actions = envelopes.map((e) => e.action).filter((action2) => action2.type === ActionType.RootAgentsChanged);
      const action = actions[actions.length - 1];
      assert.ok(action, "should dispatch root/agentsChanged");
      assert.deepStrictEqual(action.agents[0].models, [{
        id: "mock-model",
        provider: "mock",
        name: "mock Model",
        maxContextWindow: 128e3,
        maxOutputTokens: 16e3,
        maxPromptTokens: 112e3,
        supportsVision: false,
        policyState: void 0,
        configSchema: void 0,
        _meta: void 0
      }]);
    });
    test("model observable update publishes model metadata", async () => {
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels([{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, supportsVision: false, _meta: { multiplierNumeric: 2 } }]);
      const { action } = await envelope;
      assert.strictEqual(action.type, ActionType.RootAgentsChanged);
      assert.deepStrictEqual(action.agents[0].models[0]._meta, { multiplierNumeric: 2 });
    });
    test("unchanged model observable update does not dispatch unchanged agent infos", async () => {
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const models = [{ provider: "mock", id: "mock-model", name: "mock Model", maxContextWindow: 128e3, supportsVision: false }];
      const envelope = Event.toPromise(Event.filter(stateManager.onDidEmitEnvelope, (e) => {
        if (e.action.type !== ActionType.RootAgentsChanged) {
          return false;
        }
        return e.action.agents[0]?.models.length === 1;
      }));
      agent.setModels(models);
      await envelope;
      envelopes.length = 0;
      agent.setModels([...models]);
      await Promise.resolve();
      await Promise.resolve();
      assert.strictEqual(envelopes.filter((e) => e.action.type === ActionType.RootAgentsChanged).length, 0);
    });
  });
  suite("pending message sync", () => {
    test("syncs steering message to agent on ChatPendingMessageSet", () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-1",
        message: { text: "focus on tests", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].steeringMessage, { id: "steer-1", message: { text: "focus on tests", origin: { kind: MessageKind.User } } });
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
      assert.strictEqual(agent.setPendingMessagesCalls[0].chat.toString(), defaultChatUri);
    });
    test("syncs a peer chat steering message addressed by the peer chat URI", () => {
      setupSession();
      const peerChatUri = URI.parse(buildChatUri(sessionUri.toString(), "peer-steer"));
      stateManager.addChat(sessionUri.toString(), peerChatUri.toString());
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-peer",
        message: { text: "steer the peer", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(peerChatUri.toString(), action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(peerChatUri.toString(), action);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual({
        chat: agent.setPendingMessagesCalls[0].chat.toString(),
        steeringId: agent.setPendingMessagesCalls[0].steeringMessage?.id
      }, {
        chat: peerChatUri.toString(),
        steeringId: "steer-peer"
      });
    });
    test("syncs queued message and preserves the enqueuing client attribution", async () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-1",
        message: { text: "queued message", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action, "client-editor", AgentHostClientType.EditorWindow);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.strictEqual(agent.setPendingMessagesCalls[0].steeringMessage, void 0);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls[0], {
        session: URI.parse(sessionUri.toString()),
        chat: URI.parse(defaultChatUri),
        prompt: "queued message",
        attachments: void 0,
        senderClientId: "client-editor",
        clientType: "editor_window"
      });
    });
    test("parses queued protocol attachment URI strings before passing them to the agent", async () => {
      setupSession();
      const fileUri = URI.file("/workspace/queued.ts");
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-uri",
        message: { text: "queued message", origin: { kind: MessageKind.User }, attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "queued.ts", displayKind: "document" }] }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        chat: URI.parse(defaultChatUri),
        prompt: "queued message",
        attachments: [{ type: MessageAttachmentKind.Resource, uri: fileUri.toString(), label: "queued.ts", displayKind: "document" }]
      }]);
    });
    test("logs telemetry when sending a queued user message", () => {
      setupSession();
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-telemetry",
        message: { text: "queued message", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      assert.deepStrictEqual(telemetryService.events, [{
        eventName: "agentHost.userMessageSent",
        data: {
          provider: "mock",
          initiatorClientType: "unknown",
          agentSessionId: "session-1",
          source: "queued",
          isSubagentSession: false,
          turnCount: 0,
          attachmentCount: 0
        }
      }]);
    });
    test("syncs on ChatPendingMessageRemoved", () => {
      setupSession();
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-rm",
        message: { text: "will be removed", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      agent.setPendingMessagesCalls.length = 0;
      const removeAction = {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Queued,
        id: "q-rm"
      };
      stateManager.dispatchClientAction(defaultChatUri, removeAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, removeAction);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
    });
    test("syncs on ChatQueuedMessagesReordered", () => {
      setupSession();
      const setA = { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: "q-a", message: { text: "A", origin: { kind: MessageKind.User } } };
      stateManager.dispatchClientAction(defaultChatUri, setA, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setA);
      const setB = { type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: "q-b", message: { text: "B", origin: { kind: MessageKind.User } } };
      stateManager.dispatchClientAction(defaultChatUri, setB, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, setB);
      agent.setPendingMessagesCalls.length = 0;
      const reorderAction = { type: ActionType.ChatQueuedMessagesReordered, order: ["q-b", "q-a"] };
      stateManager.dispatchClientAction(defaultChatUri, reorderAction, { clientId: "test", clientSeq: 3 });
      sideEffects.handleAction(defaultChatUri, reorderAction);
      assert.strictEqual(agent.setPendingMessagesCalls.length, 1);
      assert.deepStrictEqual(agent.setPendingMessagesCalls[0].queuedMessages, []);
    });
  });
  suite("queued message consumption", () => {
    test("auto-starts turn from queued message on idle", async () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-auto",
        message: { text: "auto queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      const turnComplete = envelopes.find((e) => e.action.type === ActionType.ChatTurnComplete);
      assert.ok(turnComplete, "should dispatch session/turnComplete");
      const turnStarted = envelopes.find((e) => e.action.type === ActionType.ChatTurnStarted);
      assert.ok(turnStarted, "should dispatch session/turnStarted for queued message");
      assert.strictEqual(turnStarted.action.queuedMessageId, "q-auto");
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls.length, 1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "auto queued");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages, void 0);
    });
    test("waits for pending steering before consuming a queued message", async () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-original");
      const queuedAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "queued-1",
        message: { text: "queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, queuedAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, queuedAction);
      const steeringAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steering-1",
        message: { text: "steering", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, steeringAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, steeringAction);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-original", duration: 1e3 }
      });
      assert.strictEqual(agent.sendMessageCalls.length, 0, "queued message must wait for steering to start");
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-steering",
          startedAt: (/* @__PURE__ */ new Date()).toISOString(),
          message: steeringAction.message,
          queuedMessageId: steeringAction.id
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-steering", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls.map((call) => call.prompt), ["queued"]);
    });
    test("does not drain queued messages when the cancelled turn completes late", () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-after-abort",
        message: { text: "queued behind abort", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const cancelAction = { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 };
      stateManager.dispatchClientAction(defaultChatUri, cancelAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, cancelAction);
      const truncateAction = { type: ActionType.ChatTruncated };
      stateManager.dispatchClientAction(defaultChatUri, truncateAction, { clientId: "test", clientSeq: 3 });
      sideEffects.handleAction(defaultChatUri, truncateAction);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 2e3 }
      });
      assert.strictEqual(agent.sendMessageCalls.length, 0, "cancelling must not drain queued messages");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.turns.length, 0, "the cancelled turn should no longer be retained in history");
      assert.strictEqual(state?.queuedMessages?.length, 1, "queued message should remain for manual dequeue");
      assert.strictEqual(state?.queuedMessages?.[0].id, "q-after-abort");
    });
    test("intercepts queued /rename and drains the message queued behind it", async () => {
      setupSession();
      const renameSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(),
        onTurnComplete: () => {
        }
      });
      disposables.add(renameSideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      for (const msg of [
        { id: "q-rename", text: "/rename Queued Title" },
        { id: "q-after", text: "after rename" }
      ]) {
        const setAction = {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id: msg.id,
          message: { text: msg.text, origin: { kind: MessageKind.User } }
        };
        stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
        renameSideEffects.handleAction(defaultChatUri, setAction);
      }
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.strictEqual(agent.sendMessageCalls.length, 1);
      assert.strictEqual(agent.sendMessageCalls[0].prompt, "after rename");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages, void 0);
      assert.strictEqual(state?.title, "Queued Title");
    });
    test("replaces a queued bang command title with the following real message", async () => {
      stateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
      const db = new TestSessionDatabase();
      const terminalManager = disposables.add(new TestAgentHostTerminalManager());
      const queuedSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createSessionDataService(db),
        onTurnComplete: () => {
        }
      }, void 0, void 0, void 0, terminalManager);
      disposables.add(queuedSideEffects.registerProgressListener(agent));
      startTurn("turn-1");
      for (const [id, text] of [["q-command", "!echo hi"], ["q-request", "Explain the build"]]) {
        const setAction = {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id,
          message: { text, origin: { kind: MessageKind.User } }
        };
        stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
        queuedSideEffects.handleAction(defaultChatUri, setAction);
      }
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await terminalManager.commandFinishedListenerRegistered.p;
      terminalManager.fireCommandFinished({ commandId: "1", command: "echo hi", exitCode: 0, output: "hi\n" });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual({
        prompt: agent.sendMessageCalls[0].prompt,
        title: stateManager.getSessionState(sessionUri.toString())?.title,
        persistedTitle: await db.getMetadata("customTitle")
      }, {
        prompt: "Explain the build",
        title: "Explain the build",
        persistedTitle: "Explain the build"
      });
    });
    test("drains a peer chat queued message to the owning session with the chat arg", async () => {
      setupSession();
      const chatUri = URI.parse(buildChatUri(sessionUri, "peer-q"));
      stateManager.addChat(sessionUri.toString(), chatUri.toString());
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.dispatchClientAction(
        chatUri.toString(),
        { type: ActionType.ChatTurnStarted, turnId: "pturn-1", startedAt: "2025-01-01T00:00:00.000Z", message: { text: "hi", origin: { kind: MessageKind.User } } },
        { clientId: "test", clientSeq: 1 }
      );
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "pq-1",
        message: { text: "peer queued", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(chatUri.toString(), setAction, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(chatUri.toString(), setAction);
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      agent.fireProgress({
        kind: "action",
        resource: chatUri,
        action: { type: ActionType.ChatTurnComplete, turnId: "pturn-1", duration: 1e3 }
      });
      await waitForSendMessageCalls(1);
      assert.deepStrictEqual(agent.sendMessageCalls, [{
        session: URI.parse(sessionUri.toString()),
        prompt: "peer queued",
        attachments: void 0,
        chat: URI.parse(chatUri.toString())
      }]);
    });
    test("does not consume queued message while a turn is active", () => {
      setupSession();
      startTurn("turn-1");
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const setAction = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Queued,
        id: "q-wait",
        message: { text: "should wait", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, setAction);
      const turnStarted = envelopes.find((e) => e.action.type === ActionType.ChatTurnStarted);
      assert.strictEqual(turnStarted, void 0, "should not start a turn while one is active");
      assert.strictEqual(agent.sendMessageCalls.length, 0);
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.queuedMessages?.length, 1);
      assert.strictEqual(state?.queuedMessages?.[0].id, "q-wait");
    });
    test("dispatches ChatPendingMessageRemoved for steering messages on steering_consumed", () => {
      setupSession();
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-rm",
        message: { text: "steer me", origin: { kind: MessageKind.User } }
      };
      stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
      sideEffects.handleAction(defaultChatUri, action);
      let removal = envelopes.find(
        (e) => e.action.type === ActionType.ChatPendingMessageRemoved && e.action.kind === PendingMessageKind.Steering
      );
      assert.strictEqual(removal, void 0, "should not dispatch removal until steering_consumed");
      agent.fireProgress({
        kind: "steering_consumed",
        chat: URI.parse(defaultChatUri),
        id: "steer-rm"
      });
      removal = envelopes.find(
        (e) => e.action.type === ActionType.ChatPendingMessageRemoved && e.action.kind === PendingMessageKind.Steering
      );
      assert.ok(removal, "should dispatch ChatPendingMessageRemoved for steering");
      assert.strictEqual(removal.action.id, "steer-rm");
      const state = stateManager.getSessionState(sessionUri.toString());
      assert.strictEqual(state?.steeringMessage, void 0);
    });
  });
  suite("handleAction \u2014 session/activeClientSet", () => {
    setup(() => {
      disposables.add(sideEffects.registerProgressListener(agent));
    });
    test("calls setClientCustomizations and dispatches customizationsChanged once", async () => {
      setupSession();
      const pluginA = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
      const pluginB = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-b"), uri: "file:///plugin-b", name: "Plugin B", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
      const pluginAClient = { type: CustomizationType.Plugin, id: pluginA.id, uri: pluginA.uri, name: pluginA.name, enabled: true };
      const pluginBClient = { type: CustomizationType.Plugin, id: pluginB.id, uri: pluginB.uri, name: pluginB.name, enabled: true };
      agent.getSessionCustomizations = async () => [pluginA, pluginB];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [],
          customizations: [pluginAClient, pluginBClient]
        }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      await new Promise((r) => setTimeout(r, 50));
      assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
        clientId: "test-client",
        customizations: [pluginAClient, pluginBClient]
      }]);
      const customizationActions = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationActions.length, 1, "should dispatch one full customizationsChanged replacement");
      assert.strictEqual(
        envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationUpdated).length,
        0,
        "should not dispatch customizationUpdated when progress matches the final state"
      );
    });
    test("dispatches customizationUpdated for sync progress after initial replacement", async () => {
      setupSession();
      const pluginAClient = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true };
      let currentCustomizations = [];
      agent.getSessionCustomizations = async () => currentCustomizations;
      agent.syncClientCustomizations = (session, clientId, customizations) => {
        agent.setClientCustomizationsCalls.push({ clientId, customizations });
        const loading = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loading } };
        currentCustomizations = [loading];
        agent.fireProgress({
          kind: "action",
          resource: session,
          action: {
            type: ActionType.SessionCustomizationsChanged,
            customizations: [...currentCustomizations]
          }
        });
        void (async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          const loaded = { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } };
          currentCustomizations = [loaded];
          agent.fireProgress({
            kind: "action",
            resource: session,
            action: {
              type: ActionType.SessionCustomizationUpdated,
              customization: loaded
            }
          });
        })();
        return currentCustomizations.map((customization) => ({ customization }));
      };
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      sideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: [],
          customizations: [pluginAClient]
        }
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const customizationsChanged = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationsChanged.length, 1);
      const firstCustomizationsChanged = customizationsChanged[0].action;
      assert.strictEqual(firstCustomizationsChanged.type, ActionType.SessionCustomizationsChanged);
      assert.deepStrictEqual(firstCustomizationsChanged.customizations, [{
        ...pluginAClient,
        load: { kind: CustomizationLoadStatus.Loading }
      }]);
      const customizationUpdated = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationUpdated);
      assert.deepStrictEqual(customizationUpdated.map((e) => e.action), [{
        type: ActionType.SessionCustomizationUpdated,
        customization: { ...pluginAClient, load: { kind: CustomizationLoadStatus.Loaded } }
      }]);
    });
    test("clears client customizations when activeClient has no customizations", () => {
      setupSession();
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "test-client",
          tools: []
        }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      assert.deepStrictEqual(agent.setClientCustomizationsCalls, [{
        clientId: "test-client",
        customizations: []
      }]);
      const customizationActions = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.strictEqual(customizationActions.length, 1);
      assert.deepStrictEqual(customizationActions[0].action, {
        type: ActionType.SessionCustomizationsChanged,
        customizations: []
      });
    });
    test("removes the active client when it is removed", () => {
      setupSession();
      const action = {
        type: ActionType.SessionActiveClientRemoved,
        clientId: "test-client"
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      assert.deepStrictEqual(agent.removeActiveClientCalls, [{
        clientId: "test-client"
      }]);
    });
  });
  suite("handleAction - root/configChanged", () => {
    test("republishes agent and session customizations for existing sessions", async () => {
      setupSession("file:///workspace");
      const customization = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-a"), uri: "file:///plugin-a", name: "Plugin A", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
      agent.customizations = [customization];
      agent.getSessionCustomizations = async () => [customization];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const action = {
        type: ActionType.RootConfigChanged,
        config: { customizations: [customization] }
      };
      stateManager.dispatchServerAction(sessionUri.toString(), action);
      sideEffects.handleAction(sessionUri.toString(), action);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agentInfoAction = envelopes.filter((e) => e.action.type === ActionType.RootAgentsChanged).at(-1);
      assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
      assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);
      const sessionCustomizationAction = envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged).at(-1);
      assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
      assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
    });
    test("updates telemetry level from root config", () => {
      setupSession();
      const action = {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.NONE) }
      };
      sideEffects.handleAction(sessionUri.toString(), action);
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello world", origin: { kind: MessageKind.User } }
      });
      assert.deepStrictEqual(telemetryService.events, []);
    });
  });
  suite("onDidCustomizationsChange", () => {
    test("republishes agent info and session customizations when agent fires onDidCustomizationsChange", async () => {
      disposables.add(sideEffects.registerProgressListener(agent));
      setupSession("file:///workspace");
      const customization = { type: CustomizationType.Plugin, id: customizationId("file:///plugin-b"), uri: "file:///plugin-b", name: "Plugin B", enabled: true, load: { kind: CustomizationLoadStatus.Loaded } };
      agent.customizations = [customization];
      agent.getSessionCustomizations = async () => [customization];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireCustomizationsChange();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agentInfoAction = envelopes.find((e) => e.action.type === ActionType.RootAgentsChanged);
      assert.ok(agentInfoAction && hasKey(agentInfoAction.action, { agents: true }));
      assert.deepStrictEqual(agentInfoAction.action.agents[0]?.customizations, [customization]);
      const sessionCustomizationAction = envelopes.find((e) => e.action.type === ActionType.SessionCustomizationsChanged);
      assert.ok(sessionCustomizationAction && hasKey(sessionCustomizationAction.action, { customizations: true }));
      assert.deepStrictEqual(sessionCustomizationAction.action.customizations, [customization]);
    });
    test("does not republish when registerProgressListener is disposed", async () => {
      const listener = sideEffects.registerProgressListener(agent);
      setupSession("file:///workspace");
      agent.customizations = [{ type: CustomizationType.Plugin, id: customizationId("file:///plugin-c"), uri: "file:///plugin-c", name: "Plugin C", enabled: true }];
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      listener.dispose();
      agent.fireCustomizationsChange();
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.strictEqual(
        envelopes.filter((e) => e.action.type === ActionType.SessionCustomizationsChanged).length,
        0,
        "should not republish session customizations after listener disposed"
      );
    });
  });
  suite("handleAction \u2014 session/toolCallConfirmed", () => {
    test("routes confirmation to correct agent via _toolCallAgents", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-conf-1",
          toolName: "read",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-conf-1",
          invocationMessage: "Reading file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-conf-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read file.txt",
          toolInput: void 0,
          confirmationTitle: "Read file.txt",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-conf-1",
        approved: true,
        confirmed: "user-action"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-conf-1", approved: true }
      ]);
    });
    test("handles denial of tool call", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-deny-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-deny-1",
          invocationMessage: "Running command",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-deny-1",
        approved: false,
        reason: "denied"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-deny-1", approved: false }
      ]);
    });
  });
  suite("tool_ready dispatches progress actions to advance tool call state", () => {
    test("tool_ready for a non-permission tool dispatches ChatToolCallReady and advances state from Streaming to Running", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-ready-1",
          toolName: "runTask",
          displayName: "Run Task",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      const stateAfterStart = stateManager.getSessionState(sessionUri.toString());
      const partAfterStart = stateAfterStart?.activeTurn?.responseParts[0];
      assert.strictEqual(partAfterStart?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(partAfterStart?.kind === ResponsePartKind.ToolCall ? partAfterStart.toolCall.status : void 0, ToolCallStatus.Streaming);
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-ready-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run Task",
          toolInput: '{"task":"build"}',
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const stateAfterReady = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts[0];
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.Running ? s : void 0;
      });
      const partAfterReady = stateAfterReady?.activeTurn?.responseParts[0];
      assert.strictEqual(partAfterReady?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(
        partAfterReady?.kind === ResponsePartKind.ToolCall ? partAfterReady.toolCall.status : void 0,
        ToolCallStatus.Running,
        "tool call should advance from Streaming to Running after tool_ready"
      );
    });
    test("tool_ready for a permission-gated tool dispatches ChatToolCallReady and advances state to PendingConfirmation", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          toolName: "write",
          displayName: "Write File",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: '{"path":".env"}',
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts[0];
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const part = state?.activeTurn?.responseParts[0];
      assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
      assert.strictEqual(
        part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : void 0,
        ToolCallStatus.PendingConfirmation,
        "tool call should advance to PendingConfirmation for permission-gated tool_ready"
      );
    });
    test("tool_ready marks autoApproveRuleResolvable only for eligible shell confirmations", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      await sideEffects.initialize();
      const cases = [
        ["tc-shell-rules-1", { requestSandboxBypass: false, shellLanguage: "bash" }],
        ["tc-shell-rules-2", { requestSandboxBypass: true, shellLanguage: "bash" }],
        ["tc-shell-rules-3", { managedApprovalRequired: true, shellLanguage: "bash" }]
      ];
      for (const [toolCallId, signalOverrides] of cases) {
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: {
            type: ActionType.ChatToolCallStart,
            turnId: "turn-1",
            toolCallId,
            toolName: "shell",
            displayName: "Shell",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
            _meta: { toolKind: void 0, language: void 0 }
          }
        });
        agent.fireProgress({
          kind: "pending_confirmation",
          chat: URI.parse(defaultChatUri),
          state: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId,
            toolName: "",
            displayName: "",
            invocationMessage: "Run command",
            toolInput: "foo --bar",
            confirmationTitle: "Run in terminal?",
            edits: void 0
          },
          permissionKind: "shell",
          permissionPath: void 0,
          ...signalOverrides
        });
      }
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const parts = s?.activeTurn?.responseParts;
        return parts?.length === cases.length && parts.every((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation) ? s : void 0;
      });
      assert.deepStrictEqual(
        state.activeTurn?.responseParts.map((p) => p.kind === ResponsePartKind.ToolCall ? p.toolCall._meta?.["autoApproveRuleResolvable"] : void 0),
        [true, void 0, void 0],
        "only the rule-resolvable shell confirmation is marked; sandbox-bypass and managed confirmations are not"
      );
    });
    test("tool_ready forwards the signal shell language into shell approval", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      await sideEffects.initialize();
      const cases = [
        ["tc-shell-lang-1", "powershell"],
        ["tc-shell-lang-2", "bash"],
        ["tc-shell-lang-3", void 0]
      ];
      for (const [toolCallId, shellLanguage] of cases) {
        agent.fireProgress({
          kind: "action",
          resource: URI.parse(defaultChatUri),
          action: {
            type: ActionType.ChatToolCallStart,
            turnId: "turn-1",
            toolCallId,
            toolName: "shell",
            displayName: "Shell",
            contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
            _meta: { toolKind: void 0, language: void 0 }
          }
        });
        agent.fireProgress({
          kind: "pending_confirmation",
          chat: URI.parse(defaultChatUri),
          state: {
            status: ToolCallStatus.PendingConfirmation,
            toolCallId,
            toolName: "",
            displayName: "",
            invocationMessage: "Run command",
            toolInput: "get-childitem",
            confirmationTitle: "Run in terminal?",
            edits: void 0
          },
          permissionKind: "shell",
          permissionPath: void 0,
          shellLanguage
        });
      }
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const parts = s?.activeTurn?.responseParts;
        return parts?.length === cases.length && parts.every((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation) ? s : void 0;
      });
      assert.deepStrictEqual(
        state.activeTurn?.responseParts.map((p) => p.kind === ResponsePartKind.ToolCall ? [p.toolCall._meta?.["autoApproveBySetting"], p.toolCall._meta?.["autoApproveRuleResolvable"]] : void 0),
        [[true, void 0], [void 0, true], [void 0, void 0]],
        "powershell auto-approves; bash stays rule-resolvable; missing language is neither"
      );
    });
    test("tool_ready is dropped when the tool completes while permission lookup is pending", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-stale-ready",
          toolName: "vscodeAPI",
          displayName: "Get VS Code API References",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "disconnected-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-stale-ready",
          toolName: "vscodeAPI",
          displayName: "Get VS Code API References",
          invocationMessage: "Get VS Code API References",
          toolInput: '{"query":"test"}',
          confirmationTitle: "Allow tool call?",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-stale-ready",
        invocationMessage: "Get VS Code API References",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-stale-ready",
        result: {
          success: false,
          pastTenseMessage: "Get VS Code API References failed",
          error: { message: "Client disconnected" }
        }
      });
      await Promise.resolve();
      const toolCall = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-stale-ready");
      assert.deepStrictEqual({
        status: toolCall?.kind === ResponsePartKind.ToolCall ? toolCall.toolCall.status : void 0,
        readyActions: envelopes.filter((e) => e.action.type === ActionType.ChatToolCallReady).length
      }, {
        status: ToolCallStatus.Completed,
        readyActions: 1
      });
    });
    test("tool_ready for an additional chat is emitted on that chat channel", async () => {
      setupSession();
      const chatUri = buildChatUri(sessionUri.toString(), "peer");
      stateManager.addChat(sessionUri.toString(), chatUri);
      stateManager.setSessionConfig(sessionUri.toString(), { schema: { type: "object", properties: {} }, values: { [SessionConfigKey.Permissions]: { allow: [], deny: [] } } });
      startTurn("turn-peer", chatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(chatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-peer",
          toolCallId: "tc-peer-perm",
          toolName: "write",
          displayName: "Write File",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(chatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-peer-perm",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: '{"path":".env"}',
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: void 0,
        permissionPath: void 0
      });
      const chatState = await waitForState(stateManager, () => {
        const s = stateManager.getChatState(chatUri);
        const p = s?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const defaultState = stateManager.getSessionState(sessionUri.toString());
      const defaultPart = defaultState?.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
      const peerPart = chatState.activeTurn?.responseParts.find((part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === "tc-peer-perm");
      const readyEnvelope = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady && hasKey(e.action, { toolCallId: true }) && e.action.toolCallId === "tc-peer-perm");
      assert.deepStrictEqual({
        peerToolStatus: peerPart?.kind === ResponsePartKind.ToolCall ? peerPart.toolCall.status : void 0,
        defaultHasTool: defaultPart !== void 0,
        readyEnvelopeChannel: readyEnvelope?.channel
      }, {
        peerToolStatus: ToolCallStatus.PendingConfirmation,
        defaultHasTool: false,
        readyEnvelopeChannel: chatUri
      });
      sideEffects.handleAction(chatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-peer",
        toolCallId: "tc-peer-perm",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-peer-perm", approved: true }
      ]);
      assert.deepStrictEqual(stateManager.getSessionState(sessionUri.toString())?.config?.values[SessionConfigKey.Permissions], { allow: ["write"], deny: [] });
    });
    test("pending_confirmation for a tool inside a subagent routes to the subagent session", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          invocationMessage: "Delegating...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-inner",
          toolName: "problems",
          displayName: "Problems",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "client-tools" },
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-inner",
          toolName: "problems",
          displayName: "Problems",
          invocationMessage: "Get problems",
          toolInput: "{}",
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const subState = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(subagentUri);
        const inner = s?.activeTurn?.responseParts.find(
          (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
        );
        return inner?.kind === ResponsePartKind.ToolCall && inner.toolCall.status === ToolCallStatus.Running ? s : void 0;
      });
      const innerPart = subState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
      );
      assert.ok(innerPart, "inner client tool call should exist on subagent session");
      assert.strictEqual(
        innerPart.kind === ResponsePartKind.ToolCall ? innerPart.toolCall.status : void 0,
        ToolCallStatus.Running,
        "inner client tool call should advance to Running after pending_confirmation"
      );
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInner = parentState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-inner"
      );
      assert.strictEqual(parentInner, void 0, "parent session must not contain the inner tool call");
    });
    test("pending_confirmation without an active turn still dispatches (does not hang)", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-noop",
          toolName: "view",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-noop",
          result: { success: true, pastTenseMessage: "Read file" }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      assert.strictEqual(stateManager.getActiveTurnId(sessionUri.toString()), void 0);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "",
          toolCallId: "tc-orphan",
          toolName: "view",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-orphan",
          toolName: "view",
          displayName: "Read",
          invocationMessage: "Reading file.ts",
          toolInput: '{"path":"file.ts"}',
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/file.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-orphan", approved: true }
      ], "pending_confirmation without active turn should still be processed and auto-approved");
    });
  });
  suite("handleAction \u2014 chat/toolCallComplete routing", () => {
    test("forwards session + default chat URI for a default-chat completion", () => {
      setupSession();
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-default",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
        [{ session: sessionUri.toString(), chat: defaultChatUri, toolCallId: "tc-default" }]
      );
    });
    test("forwards owning session + chat URI for an additional-chat completion", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(peerChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-peer",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
        [{ session: sessionUri.toString(), chat: peerChatUri, toolCallId: "tc-peer" }]
      );
    });
    test("forwards parent peer chat URI for a subagent-chat completion", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-subagent-parent");
      stateManager.addChat(sessionUri.toString(), peerChatUri);
      startTurn("turn-peer", peerChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(peerChatUri),
        toolCallId: "tc-parent",
        agentName: "explore",
        agentDisplayName: "Explore"
      });
      const subagentChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      sideEffects.handleAction(subagentChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-subagent",
        toolCallId: "tc-inner",
        result: { success: true, pastTenseMessage: "done" }
      });
      assert.deepStrictEqual(
        agent.clientToolCallCompleteCalls.map((c) => ({ session: c.session.toString(), chat: c.chat?.toString(), toolCallId: c.toolCallId })),
        [{ session: sessionUri.toString(), chat: peerChatUri, toolCallId: "tc-inner" }]
      );
    });
  });
  suite("session config auto-approve", () => {
    function setupSessionWithConfig(autoApproveLevel) {
      setupSession(URI.file("/workspace").toString());
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: {
          type: "object",
          properties: {
            autoApprove: {
              type: "string",
              title: "Approvals",
              enum: ["default", "autoApprove", "autopilot"],
              default: "default",
              sessionMutable: true
            }
          }
        },
        values: { autoApprove: autoApproveLevel }
      });
    }
    test("auto-approves all writes when autoApprove is set to bypass", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-bypass-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-bypass-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-bypass-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-bypass-1", approved: true }
      ]);
    });
    test("auto-approves shell commands when autoApprove is set to bypass", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-bypass-shell-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-bypass-shell-1",
          invocationMessage: "Run rm -rf /",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-bypass-shell-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run rm -rf /",
          toolInput: "rm -rf /",
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "shell",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-bypass-shell-1", approved: true }
      ]);
    });
    test("does NOT auto-approve a shell command that opted out of the sandbox, even in bypass mode", () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-sandboxbypass-1",
          toolName: "shell",
          displayName: "Shell",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-sandboxbypass-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run cat ~/something.txt",
          toolInput: "cat ~/something.txt",
          confirmationTitle: "Run command",
          edits: void 0
        },
        permissionKind: "shell",
        permissionPath: void 0,
        requestSandboxBypass: true
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, []);
    });
    test("marks pending client tool approval for client-side auto-approval in bypass mode", async () => {
      setupSessionWithConfig("autoApprove");
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-client-approve-1",
          toolName: "runTask",
          displayName: "Run Task",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "test-client" },
          _meta: { toolKind: "terminal" }
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-client-approve-1",
          toolName: "runTask",
          displayName: "Run Task",
          invocationMessage: "Run task",
          toolInput: '{"task":"build"}',
          confirmationTitle: "Run task",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const p = s?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-client-approve-1");
        return p?.kind === ResponsePartKind.ToolCall && p.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const part = state?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === "tc-client-approve-1");
      assert.ok(part?.kind === ResponsePartKind.ToolCall);
      assert.deepStrictEqual({
        status: part.toolCall.status,
        meta: part.toolCall._meta,
        permissionCalls: agent.respondToPermissionCalls
      }, {
        status: ToolCallStatus.PendingConfirmation,
        meta: { toolKind: "terminal", autoApproveBySetting: true },
        permissionCalls: []
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-client-approve-1",
        approved: true,
        confirmed: ToolCallConfirmationReason.Setting
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-client-approve-1", approved: true }
      ]);
    });
    test("does NOT auto-approve when autoApprove is default", () => {
      setupSessionWithConfig("default");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-default-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-default-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-default-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("respects mid-session config change via SessionConfigChanged", async () => {
      setupSessionWithConfig("default");
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-mid-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-mid-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-mid-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-mid-1", approved: true }
      ]);
    });
  });
  suite("edit auto-approve", () => {
    test("auto-approves writes to regular source files", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-auto-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-auto-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-auto-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-auto-1", approved: true }
      ]);
    });
    test("blocks writes to .env files", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-env-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-env-1",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-env-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .env",
          toolInput: void 0,
          confirmationTitle: "Write .env",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.env"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
      const readyAction = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady);
      assert.ok(readyAction, "should dispatch tool_ready for blocked write");
    });
    test("blocks writes to package.json", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-pkg-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-pkg-1",
          invocationMessage: "Write package.json",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-pkg-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write package.json",
          toolInput: void 0,
          confirmationTitle: "Write package.json",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/package.json"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("blocks writes to .lock files", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-lock-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-lock-1",
          invocationMessage: "Write yarn.lock",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-lock-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write yarn.lock",
          toolInput: void 0,
          confirmationTitle: "Write yarn.lock",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/yarn.lock"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
    test("blocks writes to .git directory", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-git-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-git-1",
          invocationMessage: "Write .git/config",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-git-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write .git/config",
          toolInput: void 0,
          confirmationTitle: "Write .git/config",
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/workspace/.git/config"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
    });
  });
  suite("read auto-approve", () => {
    test("auto-approves reads inside working directory", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-read-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-read-1",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-read-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-read-1", approved: true }
      ]);
    });
    test("does not auto-approve reads outside working directory", () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const envelopes = [];
      disposables.add(stateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-read-2",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-read-2",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-read-2",
          toolName: "",
          displayName: "",
          invocationMessage: "Read /etc/passwd",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/etc/passwd"
      });
      assert.strictEqual(agent.respondToPermissionCalls.length, 0);
      const readyAction = envelopes.find((e) => e.action.type === ActionType.ChatToolCallReady);
      assert.ok(readyAction, "should dispatch tool_ready for read outside working directory");
    });
  });
  suite("title persistence", () => {
    let sessionDb;
    setup(async () => {
      sessionDb = disposables.add(await SessionDatabase.open(":memory:"));
    });
    async function waitForMetadata(key) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const value = await sessionDb.getMetadata(key);
        if (value !== void 0) {
          return value;
        }
        await timeout(10);
      }
      throw new Error(`Session metadata '${key}' was not persisted`);
    }
    teardown(async () => {
      await sessionDb.close();
    });
    test("SessionTitleChanged persists to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localSideEffects = createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      localSideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionTitleChanged,
        title: "Custom Title"
      });
      assert.strictEqual(await waitForMetadata("customTitle"), "Custom Title");
    });
    test("handleListSessions returns persisted custom title", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      await localAgent.createSession();
      await sessionDb.setMetadata("customTitle", "My Custom Title");
      const sessions = await localService.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.ok(sessions[0].summary);
    });
    test("handleRestoreSession uses persisted custom title", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      await sessionDb.setMetadata("customTitle", "Restored Title");
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "msg-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "msg-2", content: "Hi", toolRequests: [] }
      ];
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.ok(state);
      assert.strictEqual(state.title, "Restored Title");
    });
    test("restore interleaves a persisted local turn after its anchor", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localService = disposables.add(new AgentService(new NullLogService(), fileService, sessionDataService, { _serviceBrand: void 0 }, createNoopGitService()));
      localService.registerProvider(localAgent);
      const { session } = await localAgent.createSession();
      const sessions = await localAgent.listSessions();
      const sessionResource = sessions[0].session;
      localAgent.sessionMessages = [
        { type: "message", session, role: "user", messageId: "real-1", content: "Hello", toolRequests: [] },
        { type: "message", session, role: "assistant", messageId: "a-1", content: "Hi", toolRequests: [] }
      ];
      const localTurn = {
        id: "local-1",
        message: { text: "!echo hi", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "ran" }],
        usage: void 0,
        state: 2
        // TurnState.Complete
      };
      await sessionDb.insertLocalTurn({ turnId: "local-1", chatUri: buildDefaultChatUri(sessionResource.toString()), anchorTurnId: "real-1", seq: 1, payload: JSON.stringify(localTurn) });
      await localService.restoreSession(sessionResource);
      const state = localService.stateManager.getSessionState(sessionResource.toString());
      assert.deepStrictEqual(state?.turns.map((t) => t.id), ["real-1", "local-1"]);
    });
    test("SessionConfigChanged persists merged config values to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localSideEffects = createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      const session = localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      session.config = { schema: { type: "object", properties: {} }, values: { autoApprove: "default" } };
      localStateManager.dispatchClientAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      }, { clientId: "test-client", clientSeq: 1 });
      localSideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      });
      const persisted = await waitForMetadata("configValues");
      assert.deepStrictEqual(JSON.parse(persisted), { autoApprove: "autoApprove" });
    });
    test("server-dispatched SessionConfigChanged persists merged config values to the database", async () => {
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService,
        onTurnComplete: () => {
        }
      });
      const session = localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        project: { uri: "file:///test-project", displayName: "Test Project" }
      });
      session.config = { schema: { type: "object", properties: {} }, values: { mode: "plan", autoApprove: "default" } };
      localStateManager.dispatchServerAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { mode: "interactive" }
      });
      const persisted = await waitForMetadata("configValues");
      assert.deepStrictEqual(JSON.parse(persisted), { mode: "interactive", autoApprove: "default" });
    });
    test("SessionConfigChanged notifies the agent with the post-reducer merged values", async () => {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localAgent = new MockAgent();
      disposables.add(toDisposable(() => localAgent.dispose()));
      const localSideEffects = createTestSideEffects(disposables, localStateManager, {
        getAgent: () => localAgent,
        agents: observableValue("agents", [localAgent]),
        sessionDataService: createSessionDataService(sessionDb),
        onTurnComplete: () => {
        }
      });
      const session = localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Initial",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
      session.config = { schema: { type: "object", properties: {} }, values: { permissionMode: "default", autoApprove: "default" } };
      localStateManager.dispatchClientAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { permissionMode: "bypassPermissions" }
      }, { clientId: "test-client", clientSeq: 1 });
      localSideEffects.handleAction(sessionUri.toString(), {
        type: ActionType.SessionConfigChanged,
        config: { permissionMode: "bypassPermissions" }
      });
      assert.deepStrictEqual(localAgent.onSessionConfigChangedCalls.map((c) => ({ session: c.session.toString(), values: c.values })), [{
        session: sessionUri.toString(),
        values: { permissionMode: "bypassPermissions", autoApprove: "default" }
      }]);
    });
  });
  suite("subagent sessions", () => {
    test("subagent_started creates a subagent chat and dispatches content on parent tool call", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "runSubagent",
          displayName: "Run Subagent",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-1",
          invocationMessage: "Delegating task...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        agentName: "code-reviewer",
        agentDisplayName: "Code Reviewer",
        agentDescription: "Reviews code",
        taskPrompt: "Review the auth module for security issues"
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState, "subagent chat should exist");
      const subagentSummary = subState.chats.find((c) => c.resource === subagentUri);
      assert.strictEqual(subagentSummary?.title, "Code Reviewer");
      assert.deepStrictEqual(subagentSummary?.origin, { kind: "tool", chat: defaultChatUri, toolCallId: "tc-1" });
      assert.ok(subState.activeTurn, "subagent chat should have an active turn");
      assert.strictEqual(subState.activeTurn.message.text, "Review the auth module for security issues", "subagent turn should render the spawning tool call prompt as its request");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      assert.ok(parentState?.activeTurn);
      const parentToolCall = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(parentToolCall);
      if (parentToolCall?.kind === ResponsePartKind.ToolCall && parentToolCall.toolCall.status === ToolCallStatus.Running) {
        assert.ok(parentToolCall.toolCall.content);
        assert.strictEqual(parentToolCall.toolCall.content[0].type, ToolResultContentType.Subagent);
      }
    });
    test("stamps _meta.subagentChatUri onto a subagent-spawning tool call as soon as toolKind is known", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-1",
          toolName: "task",
          displayName: "Task",
          contributor: void 0,
          _meta: { toolKind: "subagent", language: void 0 }
        }
      });
      const expectedUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const toolCall = parentState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(toolCall?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(readToolCallMeta(toolCall.toolCall).subagentChatUri, expectedUri);
      assert.strictEqual(stateManager.getSnapshot(expectedUri), void 0);
    });
    test("nested subagent_started routes discovery block and seeds each request prompt via the immediate parent chat (arbitrary depth)", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l1", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l1", agentName: "l1", agentDisplayName: "L1", agentDescription: "first", taskPrompt: "l1 prompt" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l1", action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l2", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l1", action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l2", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l2", agentName: "l2", agentDisplayName: "L2", agentDescription: "second", taskPrompt: "l2 prompt", parentToolCallId: "tc-l1" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l2", action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-l3", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: "subagent", language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), parentToolCallId: "tc-l2", action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-l3", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-l3", agentName: "l3", agentDisplayName: "L3", agentDescription: "third", taskPrompt: "l3 prompt", parentToolCallId: "tc-l2" });
      const l1ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l1");
      const l2ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l2");
      const l3ChatUri = buildSubagentChatUri(sessionUri.toString(), "tc-l3");
      assert.ok(stateManager.getSessionState(l2ChatUri), "level-2 subagent chat should exist");
      assert.ok(stateManager.getSessionState(l3ChatUri), "level-3 subagent chat should exist");
      const assertDiscoveryBlock = (parentChatUri, spawningToolId, childChatUri, label) => {
        const parentState = stateManager.getSessionState(parentChatUri);
        const spawningTool = parentState?.activeTurn?.responseParts.find((rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === spawningToolId);
        assert.ok(spawningTool && spawningTool.kind === ResponsePartKind.ToolCall, `${spawningToolId} should live in ${label}`);
        const tc = spawningTool.toolCall;
        assert.strictEqual(tc.status, ToolCallStatus.Running, `${spawningToolId} should be running in ${label}`);
        if (tc.status !== ToolCallStatus.Running) {
          return;
        }
        const block = tc.content?.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
        assert.ok(block, `the discovery block for ${spawningToolId} must land on ${label}`);
        assert.strictEqual(block.resource, childChatUri);
      };
      assertDiscoveryBlock(l1ChatUri, "tc-l2", l2ChatUri, "the level-1 chat");
      assertDiscoveryBlock(l2ChatUri, "tc-l3", l3ChatUri, "the level-2 chat");
      assert.deepStrictEqual(
        [l1ChatUri, l2ChatUri, l3ChatUri].map((uri) => stateManager.getSessionState(uri)?.activeTurn?.message.text),
        ["l1 prompt", "l2 prompt", "l3 prompt"]
      );
      const defaultState = stateManager.getSessionState(sessionUri.toString());
      const l2ToolInDefault = defaultState?.activeTurn?.responseParts.find((rp) => rp.kind === ResponsePartKind.ToolCall && (rp.toolCall.toolCallId === "tc-l2" || rp.toolCall.toolCallId === "tc-l3"));
      assert.strictEqual(l2ToolInDefault, void 0, "nested spawning tools must not appear in the top-level chat");
    });
    test("events with parentToolCallId route to subagent session", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          toolName: "readFile",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          invocationMessage: "Reading file...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn);
      const innerTool = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.ok(innerTool, "inner tool call should be in subagent chat");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInnerTool = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.strictEqual(parentInnerTool, void 0, "inner tool call should NOT be in parent session");
    });
    test("completeSubagentSession clears pending buffered events when subagent never started", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-1",
          invocationMessage: "Reading...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: false, pastTenseMessage: "Failed" }
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState, "subagent session should still be created");
      const innerTool = subState.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-1"
      );
      assert.strictEqual(innerTool, void 0, "stale buffered inner tool call must not be replayed");
    });
    test("subagent_completed signal completes the subagent turn", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: true, pastTenseMessage: "Started in background" }
        }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      let subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState);
      assert.ok(subState.activeTurn, "subagent turn should still be active after parent tool completes");
      agent.fireProgress({ kind: "subagent_completed", chat: URI.parse(defaultChatUri), toolCallId: "tc-1" });
      subState = stateManager.getSessionState(subagentUri);
      assert.strictEqual(subState.activeTurn, void 0, "subagent turn should be completed");
      assert.strictEqual(subState.turns.length, 1);
      agent.fireProgress({
        kind: "subagent_resumed",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-1",
        message: { text: "Follow up", origin: { kind: MessageKind.User } }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: {
          type: ActionType.ChatResponsePart,
          turnId: "parent-turn",
          part: { kind: ResponsePartKind.Markdown, id: "follow-up-part", content: "Follow-up response" }
        }
      });
      subState = stateManager.getSessionState(subagentUri);
      assert.deepStrictEqual({
        message: subState?.activeTurn?.message.text,
        response: subState?.activeTurn?.responseParts[0],
        completedTurns: subState?.turns.length
      }, {
        message: "Follow up",
        response: { kind: ResponsePartKind.Markdown, id: "follow-up-part", content: "Follow-up response" },
        completedTurns: 1
      });
    });
    test("permission requests for inactive and unroutable subagents are denied", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-inactive", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({ kind: "subagent_completed", chat: URI.parse(defaultChatUri), toolCallId: "tc-inactive" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-starting",
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-starting-permission", toolName: "shell", displayName: "Shell" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-starting",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-starting-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-inactive",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-inactive-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        parentToolCallId: "tc-missing",
        state: { status: ToolCallStatus.PendingConfirmation, toolCallId: "tc-missing-permission", toolName: "shell", displayName: "Shell", invocationMessage: "Run command" }
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-inactive-permission", approved: false },
        { requestId: "tc-missing-permission", approved: false }
      ]);
    });
    test("cancelSubagentSessions cancels all subagent chats", () => {
      setupSession();
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Sub 1", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating 1...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "sub1", agentDisplayName: "Sub 1", agentDescription: "First" });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-2", toolName: "runSubagent", displayName: "Sub 2", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-2", invocationMessage: "Delegating 2...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-2", agentName: "sub2", agentDisplayName: "Sub 2", agentDescription: "Second" });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      const sub1 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), "tc-1"));
      const sub2 = stateManager.getSessionState(buildSubagentChatUri(sessionUri.toString(), "tc-2"));
      assert.strictEqual(sub1?.activeTurn, void 0, "sub1 turn should be cancelled");
      assert.strictEqual(sub2?.activeTurn, void 0, "sub2 turn should be cancelled");
    });
    test("removeSubagentSessions removes all subagent chats from state", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Sub 1", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "sub", agentDisplayName: "Sub", agentDescription: "Has subagent" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      assert.ok(stateManager.getChatState(subagentUri));
      sideEffects.removeSubagentSessions(sessionUri.toString());
      assert.strictEqual(stateManager.getChatState(subagentUri), void 0, "subagent chat should be removed");
    });
    test("deltas with parentToolCallId route to subagent session", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "runSubagent", displayName: "Run Subagent", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-1",
        action: { type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "msg-sub", content: "thinking..." } }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-1");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn);
      const markdownPart = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.Markdown
      );
      assert.ok(markdownPart, "delta should create a markdown part in subagent session");
    });
    test("tool_complete preserves subagent content in completed tool call", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-1", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-1", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-1", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" });
      const runningState = stateManager.getSessionState(sessionUri.toString());
      const runningTool = runningState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(runningTool?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(runningTool.toolCall.status, ToolCallStatus.Running);
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-1",
          result: { success: true, pastTenseMessage: "Delegated", content: [{ type: ToolResultContentType.Text, text: "Done" }] }
        }
      });
      const completedState = stateManager.getSessionState(sessionUri.toString());
      const completedTool = completedState?.activeTurn?.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-1"
      );
      assert.ok(completedTool?.kind === ResponsePartKind.ToolCall);
      assert.strictEqual(completedTool.toolCall.status, ToolCallStatus.Completed);
      const content = completedTool.toolCall.content ?? [];
      const subagentEntry = content.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
      assert.ok(subagentEntry, "Completed tool should preserve subagent content entry");
      const textEntry = content.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Text);
      assert.ok(textEntry, "Completed tool should also have the SDK result content");
    });
    test("inner tool_start arriving BEFORE subagent_started routes to subagent (not parent)", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          toolName: "readFile",
          displayName: "Read File",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-tc-1",
          invocationMessage: "Reading file...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const subState = stateManager.getSessionState(subagentUri);
      assert.ok(subState?.activeTurn, "subagent session should exist");
      const innerTool = subState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.ok(innerTool, "inner tool fired before subagent_started should still end up in the subagent session");
      const parentState = stateManager.getSessionState(sessionUri.toString());
      const parentInnerTool = parentState.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "inner-tc-1"
      );
      assert.strictEqual(parentInnerTool, void 0, "inner tool must not leak into parent session");
    });
    test("reads inside parent working directory are auto-approved for tools in subagent sessions", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-read-1",
          toolName: "read",
          displayName: "Read",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-read-1",
          invocationMessage: "Read file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-read-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Read src/app.ts",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "read",
        permissionPath: "/workspace/src/app.ts"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-read-1", approved: true }
      ]);
    });
    test("session-level autoApprove on the parent is inherited by tools in subagent sessions", async () => {
      setupSession(URI.file("/workspace").toString());
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: {
          type: "object",
          properties: {
            autoApprove: {
              type: "string",
              title: "Approvals",
              enum: ["default", "autoApprove", "autopilot"],
              default: "default",
              sessionMutable: true
            }
          }
        },
        values: { autoApprove: "autoApprove" }
      });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Task", contributor: void 0, _meta: { toolKind: void 0, language: void 0 } } });
      agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-parent", invocationMessage: "Delegating...", toolInput: void 0, confirmed: ToolCallConfirmationReason.NotNeeded } });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper", agentDescription: "Helps" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-write-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-write-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-write-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Write /tmp/foo",
          toolInput: void 0,
          confirmationTitle: void 0,
          edits: void 0
        },
        permissionKind: "write",
        permissionPath: "/tmp/foo"
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-write-1", approved: true }
      ]);
    });
  });
  suite("session inputNeeded production", () => {
    function sessionInputNeeded() {
      return stateManager.getSessionState(sessionUri.toString())?.inputNeeded ?? [];
    }
    test("chat input request mirrors its unresolved response part and is removed on completion", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: {
          id: "req-1",
          questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }]
        }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputAnswerChanged,
        requestId: "req-1",
        questionId: "question-1",
        answer: {
          state: ChatInputAnswerState.Draft,
          value: { kind: ChatInputAnswerValueKind.Text, value: "draft value" }
        }
      });
      const produced = sessionInputNeeded();
      assert.deepStrictEqual(produced.map((r) => ({
        kind: r.kind,
        chat: r.chat,
        request: r.kind === SessionInputRequestKind.ChatInput ? r.request : void 0
      })), [
        {
          kind: SessionInputRequestKind.ChatInput,
          chat: defaultChatUri,
          request: {
            id: "req-1",
            questions: [{ kind: ChatInputQuestionKind.Text, id: "question-1", message: "Which value?" }],
            answers: {
              "question-1": {
                state: ChatInputAnswerState.Draft,
                value: { kind: ChatInputAnswerValueKind.Text, value: "draft value" }
              }
            }
          }
        }
      ]);
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputCompleted,
        requestId: "req-1",
        response: SessionInputResponseKind.Accept
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("chat input request without an active turn is not mirrored", () => {
      setupSession();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: { id: "req-1", questions: [] }
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("tool confirmation is produced while pending and removed once confirmed", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-1",
        toolName: "write",
        displayName: "Write"
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-1",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      const pending = sessionInputNeeded();
      assert.deepStrictEqual(
        pending.map((r) => ({ kind: r.kind, chat: r.chat, toolCallId: r.kind === SessionInputRequestKind.ToolConfirmation ? r.toolCall.toolCallId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolConfirmation, chat: defaultChatUri, toolCallId: "tc-1" }]
      );
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-1",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("client tool execution is produced while running and removed once complete", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-client",
        toolName: "toolSearch",
        displayName: "Search for Tools",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-client",
        invocationMessage: "Searching",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      const running = sessionInputNeeded();
      assert.deepStrictEqual(
        running.map((r) => ({ kind: r.kind, chat: r.chat, clientId: r.kind === SessionInputRequestKind.ToolClientExecution ? r.clientId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolClientExecution, chat: defaultChatUri, clientId: "client-1" }]
      );
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-client",
        result: { success: true, pastTenseMessage: "Searched" }
      });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("auto-approved tool call is kept out of the session inputNeeded queue", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        toolName: "browser_navigate",
        displayName: "Navigate Browser",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        _meta: { autoApproveBySetting: true }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        invocationMessage: "Navigate",
        confirmationTitle: "Navigate",
        _meta: { autoApproveBySetting: true }
      });
      assert.deepStrictEqual(sessionInputNeeded(), [], "no confirmation entry while PendingConfirmation");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-auto",
        approved: true,
        confirmed: ToolCallConfirmationReason.Setting
      });
      assert.deepStrictEqual(sessionInputNeeded(), [], "no client-execution entry while Running");
    });
    test("auto-approved tool still surfaces a genuine result confirmation", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        toolName: "browser_navigate",
        displayName: "Navigate Browser",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        _meta: { autoApproveBySetting: true }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        invocationMessage: "Navigate",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-auto-result",
        requiresResultConfirmation: true,
        result: { success: true, pastTenseMessage: "Navigated" }
      });
      assert.deepStrictEqual(
        sessionInputNeeded().map((r) => ({ kind: r.kind, toolCallId: r.kind === SessionInputRequestKind.ToolConfirmation ? r.toolCall.toolCallId : void 0 })),
        [{ kind: SessionInputRequestKind.ToolConfirmation, toolCallId: "tc-auto-result" }]
      );
    });
    test("MCP tool authentication is produced while auth is required and removed once resolved", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallStart,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        toolName: "get_file",
        displayName: "Get File",
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" }
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        invocationMessage: "Getting file",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallAuthRequired,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        auth: {
          reason: McpAuthRequiredReason.InsufficientScope,
          resource: {
            resource: "https://mcp.example.com",
            authorization_servers: ["https://auth.example.com"]
          },
          requiredScopes: ["repo"]
        }
      });
      const pending = sessionInputNeeded();
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn-1",
        toolCallId: "tc-mcp",
        result: {
          success: false,
          pastTenseMessage: "Cancelled tool call",
          error: { message: "MCP authentication was cancelled", code: "cancelled" }
        }
      });
      assert.deepStrictEqual({
        pending: pending.map((request) => ({
          kind: request.kind,
          chat: request.chat,
          toolCallId: request.kind === SessionInputRequestKind.ToolAuthentication ? request.toolCall.toolCallId : void 0
        })),
        resolved: sessionInputNeeded()
      }, {
        pending: [{
          kind: SessionInputRequestKind.ToolAuthentication,
          chat: defaultChatUri,
          toolCallId: "tc-mcp"
        }],
        resolved: []
      });
    });
    test("ending the turn clears the chat's outstanding requests", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatInputRequested,
        request: { id: "req-1", questions: [] }
      });
      assert.strictEqual(sessionInputNeeded().length, 1);
      stateManager.dispatchServerAction(defaultChatUri, { type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
      assert.deepStrictEqual(sessionInputNeeded(), []);
    });
    test("a blocker inside a subagent is produced against the subagent chat", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-parent", toolName: "task", displayName: "Delegate Task" }
      });
      agent.fireProgress({ kind: "subagent_started", chat: URI.parse(defaultChatUri), toolCallId: "tc-parent", agentName: "helper", agentDisplayName: "Helper" });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: { type: ActionType.ChatToolCallStart, turnId: "turn-1", toolCallId: "tc-inner", toolName: "write", displayName: "Write" }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: { type: ActionType.ChatToolCallReady, turnId: "turn-1", toolCallId: "tc-inner", invocationMessage: "Write file", confirmationTitle: "Write file" }
      });
      const subagentUri = buildSubagentChatUri(sessionUri.toString(), "tc-parent");
      const produced = await waitForState(stateManager, () => {
        const entry = sessionInputNeeded().find((r) => r.kind === SessionInputRequestKind.ToolConfirmation);
        return entry?.kind === SessionInputRequestKind.ToolConfirmation ? entry : void 0;
      });
      assert.deepStrictEqual({ chat: produced.chat, toolCallId: produced.toolCall.toolCallId }, { chat: subagentUri, toolCallId: "tc-inner" });
    });
  });
  suite("session permissions", () => {
    test("tool_ready action includes confirmation options when confirmation is needed", async () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-1",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      const state = await waitForState(stateManager, () => {
        const s = stateManager.getSessionState(sessionUri.toString());
        const found = s?.activeTurn?.responseParts.find(
          (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-perm-1"
        );
        return found?.kind === ResponsePartKind.ToolCall && found.toolCall.status === ToolCallStatus.PendingConfirmation ? s : void 0;
      });
      const tc = state.activeTurn.responseParts.find(
        (rp) => rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === "tc-perm-1"
      );
      assert.ok(tc && tc.kind === ResponsePartKind.ToolCall, "tool call should exist");
      assert.strictEqual(tc.toolCall.status, ToolCallStatus.PendingConfirmation);
      assert.ok(Array.isArray(tc.toolCall.options), "options should be an array");
      assert.deepStrictEqual(tc.toolCall.options.map((o) => o.id), ["allow-session", "allow-once", "skip"]);
    });
    test("ChatToolCallConfirmed with allow-session adds tool to session permissions", () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: {}
      });
      startTurn("turn-1", defaultChatUri);
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-2",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-2",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-2",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-perm-2",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      const updatedState = stateManager.getSessionState(sessionUri.toString());
      assert.deepStrictEqual(
        updatedState.config.values.permissions,
        { allow: ["CustomTool"], deny: [] }
      );
    });
    test("subsequent tool_ready for same tool is auto-approved after allow-session permission", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["CustomTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-perm-3",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-perm-3",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-perm-3",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-perm-3", approved: true }
      ]);
    });
    test("managed approval bypasses global, session, and per-tool auto-approval", async () => {
      setupSession();
      stateManager.dispatchServerAction(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostGlobalAutoApproveEnabledConfigKey]: true }
      });
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: {
          [SessionConfigKey.AutoApprove]: "autoApprove",
          [SessionConfigKey.Permissions]: { allow: ["CustomTool"], deny: [] }
        }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-managed",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-managed",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          invocationMessage: "Run managed custom tool",
          toolInput: void 0,
          confirmationTitle: "Run managed custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        managedApprovalRequired: true
      });
      const toolCall = await waitForState(stateManager, () => {
        const part = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find(
          (responsePart) => responsePart.kind === ResponsePartKind.ToolCall && responsePart.toolCall.toolCallId === "tc-managed"
        );
        return part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation ? part.toolCall : void 0;
      });
      assert.deepStrictEqual({
        status: toolCall.status,
        options: toolCall.options?.map((option) => option.id),
        responses: agent.respondToPermissionCalls
      }, {
        status: ToolCallStatus.PendingConfirmation,
        options: ["allow-once", "skip"],
        responses: []
      });
    });
    test("managed approval does not persist allow-session from the client", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["ExistingTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-managed",
          toolName: "ManagedTool",
          displayName: "Managed Tool",
          contributor: void 0
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "tc-managed",
          toolName: "ManagedTool",
          displayName: "Managed Tool",
          invocationMessage: "Run managed tool",
          toolInput: void 0,
          confirmationTitle: "Run managed tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        managedApprovalRequired: true
      });
      await waitForState(stateManager, () => {
        const part = stateManager.getSessionState(sessionUri.toString())?.activeTurn?.responseParts.find(
          (responsePart) => responsePart.kind === ResponsePartKind.ToolCall && responsePart.toolCall.toolCallId === "tc-managed"
        );
        return part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation;
      });
      sideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-managed",
        approved: true,
        confirmed: "user-action",
        selectedOptionId: "allow-session"
      });
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "tc-managed", approved: true }
      ]);
      assert.deepStrictEqual(
        stateManager.getSessionState(sessionUri.toString())?.config?.values[SessionConfigKey.Permissions],
        { allow: ["ExistingTool"], deny: [] }
      );
    });
    test("subagent tool calls inherit parent session permissions", async () => {
      setupSession();
      stateManager.setSessionConfig(sessionUri.toString(), {
        schema: { type: "object", properties: {} },
        values: { permissions: { allow: ["CustomTool"], deny: [] } }
      });
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          toolName: "task",
          displayName: "Task",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-parent",
          invocationMessage: "Delegating...",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "subagent_started",
        chat: URI.parse(defaultChatUri),
        toolCallId: "tc-parent",
        agentName: "helper",
        agentDisplayName: "Helper",
        agentDescription: "Helps"
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "inner-perm-1",
          toolName: "CustomTool",
          displayName: "Custom Tool",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        parentToolCallId: "tc-parent",
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "inner-perm-1",
          invocationMessage: "Running custom tool",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "pending_confirmation",
        chat: URI.parse(defaultChatUri),
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId: "inner-perm-1",
          toolName: "",
          displayName: "",
          invocationMessage: "Run custom tool",
          toolInput: void 0,
          confirmationTitle: "Run custom tool",
          edits: void 0
        },
        permissionKind: "custom-tool",
        permissionPath: void 0
      });
      await waitForState(stateManager, () => agent.respondToPermissionCalls.length > 0 || void 0);
      assert.deepStrictEqual(agent.respondToPermissionCalls, [
        { requestId: "inner-perm-1", approved: true }
      ]);
    });
  });
  suite("changeset forwarders", () => {
    test("stale tool completion does not attribute edits to the active turn", () => {
      setupSession();
      startTurn("turn-1");
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnCancelled,
        turnId: "turn-1",
        duration: 1e3
      });
      stateManager.dispatchServerAction(defaultChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-2",
        startedAt: "2025-01-01T00:01:00.000Z",
        message: { text: "continue", origin: { kind: MessageKind.User } }
      });
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "stale-tool",
          result: {
            success: true,
            pastTenseMessage: "Wrote file",
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }
      });
      assert.deepStrictEqual({
        toolCallEdits: changesets.toolCallEdits,
        activeTurnId: stateManager.getSessionState(defaultChatUri)?.activeTurn?.id
      }, {
        toolCallEdits: [],
        activeTurnId: "turn-2"
      });
    });
    test("post-toolCallComplete edits fire onToolCallEditsApplied once", () => {
      setupSession();
      startTurn("turn-1");
      disposables.add(sideEffects.registerProgressListener(agent));
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          toolName: "write",
          displayName: "Write",
          contributor: void 0,
          _meta: { toolKind: void 0, language: void 0 }
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          invocationMessage: "Write file",
          toolInput: void 0,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      });
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: "turn-1",
          toolCallId: "tc-edit-1",
          result: {
            success: true,
            pastTenseMessage: "wrote",
            content: [{
              type: ToolResultContentType.FileEdit,
              after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
              diff: { added: 1, removed: 0 }
            }]
          }
        }
      });
      assert.deepStrictEqual(changesets.toolCallEdits, [{ session: sessionUri.toString(), turnId: "turn-1" }]);
    });
    test("turn complete fires onTurnComplete once with the right turn id", async () => {
      setupSession();
      startTurn("turn-1");
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await Promise.resolve();
      assert.deepStrictEqual(changesets.turnCompletes, [{ session: sessionUri.toString(), turnId: "turn-1" }]);
    });
    test("turn complete passes the resolved working directories to the checkpoint capture", async () => {
      const workingDirectory = URI.file("/wd").toString();
      setupSession(workingDirectory);
      startTurn("turn-1");
      const captures = [];
      const checkpoints = {
        ...NULL_CHECKPOINT_SERVICE,
        captureTurnCheckpoint: async (_session, turnId, workingDirectories) => {
          captures.push({ turnId, workingDirectories: workingDirectories?.map((w) => w.toString()) });
        }
      };
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, new FakeChangesetService(), void 0, checkpoints);
      disposables.add(localSideEffects.registerProgressListener(agent));
      agent.fireProgress({
        kind: "action",
        resource: URI.parse(defaultChatUri),
        action: { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 }
      });
      await Promise.resolve();
      assert.deepStrictEqual(captures, [{ turnId: "turn-1", workingDirectories: [workingDirectory] }]);
    });
    test("ChatTruncated fires onSessionTruncated once", () => {
      setupSession();
      const changesets = new FakeChangesetService();
      const localSideEffects = createTestSideEffects(disposables, stateManager, {
        getAgent: () => agent,
        agents: agentList,
        sessionDataService: createNullSessionDataService(),
        onTurnComplete: () => {
        }
      }, void 0, NullTelemetryService, changesets);
      localSideEffects.handleAction(defaultChatUri, {
        type: ActionType.ChatTruncated,
        turnId: "turn-1"
      });
      assert.deepStrictEqual(changesets.truncates, [sessionUri.toString()]);
    });
    test("truncating a chat forwards that chat to the agent (default and peer)", () => {
      setupSession();
      const peerChatUri = buildChatUri(sessionUri.toString(), "peer-1");
      sideEffects.handleAction(peerChatUri, { type: ActionType.ChatTruncated, turnId: "turn-peer" });
      const peerCall = agent.truncateSessionCalls.at(-1);
      sideEffects.handleAction(defaultChatUri, { type: ActionType.ChatTruncated, turnId: "turn-default" });
      const defaultCall = agent.truncateSessionCalls.at(-1);
      assert.deepStrictEqual({
        peerSession: peerCall?.session.toString(),
        peerTurnId: peerCall?.turnId,
        peerChat: peerCall?.chat?.toString(),
        defaultTurnId: defaultCall?.turnId,
        defaultChat: defaultCall?.chat?.toString()
      }, {
        peerSession: sessionUri.toString(),
        peerTurnId: "turn-peer",
        peerChat: peerChatUri,
        defaultTurnId: "turn-default",
        defaultChat: defaultChatUri
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRTaWRlRWZmZWN0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCBJQWdlbnQsIFN1YmFnZW50Q2hhdFNpZ25hbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5LCBDaGF0T3JpZ2luS2luZCwgQ3VzdG9taXphdGlvblR5cGUsIE1jcEF1dGhSZXF1aXJlZFJlYXNvbiwgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgQWN0aW9uRW52ZWxvcGUsIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmksIGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW50ZXJhY3Rpdml0eSwgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsIFBlbmRpbmdNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgUk9PVF9TVEFURV9VUkksIFNlc3Npb25JbnB1dFJlc3BvbnNlS2luZCwgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIGN1c3RvbWl6YXRpb25JZCwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgUGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleSwgdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsIE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBTdGF0aWNDaGFuZ2VzZXRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNpZGVFZmZlY3RzLCBJQWdlbnRTaWRlRWZmZWN0c09wdGlvbnMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50U2lkZUVmZmVjdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxUdXJucyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TG9jYWxUdXJucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXNzaW9uRGF0YWJhc2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSwgVGVzdFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50IH0gZnJvbSAnLi9tb2NrQWdlbnQuanMnO1xuaW1wb3J0IHsgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5cbi8vIC0tLS0gVGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKiBTcHkgYElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlYCB1c2VkIHRvIGFzc2VydCBBZ2VudFNpZGVFZmZlY3RzIGZvcndhcmRpbmcuICovXG5jbGFzcyBGYWtlQ2hhbmdlc2V0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgdG9vbENhbGxFZGl0czogeyBzZXNzaW9uOiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRyZWFkb25seSB0dXJuQ29tcGxldGVzOiB7IHNlc3Npb246IHN0cmluZzsgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdHJlYWRvbmx5IHRydW5jYXRlczogc3RyaW5nW10gPSBbXTtcblxuXHRyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoKTogdm9pZCB7IC8qIG5vLW9wIGZvciByb3V0aW5nIHRlc3RzICovIH1cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldChfc2Vzc2lvbjogc3RyaW5nLCBfa2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCwgX2RpZmZzOiByZWFkb25seSB1bmtub3duW10pOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoKTogeyBzZXNzaW9uPzogdW5kZWZpbmVkIH0geyByZXR1cm4ge307IH1cblx0YXBwbHlQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdHBlcnNpc3RDaGFuZ2VzU3VtbWFyeShzZXNzaW9uOiBzdHJpbmcsIGNoYW5nZXNTdW1tYXJ5OiBDaGFuZ2VzU3VtbWFyeSk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZSgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGdldExpc3RNZXRhZGF0YUtleXMoX3Nlc3Npb25Vcmk6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHRydWU+IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfbWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0cmVmcmVzaENoYW5nZXNldENhdGFsb2coc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0cmVmcmVzaEJyYW5jaENoYW5nZXNldCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRyZWZyZXNoU2Vzc2lvbkNoYW5nZXNldCgpOiB2b2lkIHsgLyogbm8tb3AgKi8gfVxuXHRvbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0cmVjb21wdXRlU3Vic2NyaWJlZENoYW5nZXNldHMoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0b25TZXNzaW9uRGlzcG9zZWQoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cblx0YXN5bmMgY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgOyB9XG5cdGFzeW5jIGNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvdHVybi94YDsgfVxuXHRhc3luYyBjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZywgb3JpZ2luYWxUdXJuSWQ6IHN0cmluZywgbW9kaWZpZWRUdXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC9jb21wYXJlLyR7b3JpZ2luYWxUdXJuSWR9LyR7bW9kaWZpZWRUdXJuSWR9YDtcblx0fVxuXG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudG9vbENhbGxFZGl0cy5wdXNoKHsgc2Vzc2lvbiwgdHVybklkIH0pO1xuXHR9XG5cdG9uVHVybkNvbXBsZXRlKHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnR1cm5Db21wbGV0ZXMucHVzaCh7IHNlc3Npb24sIHR1cm5JZCB9KTtcblx0fVxuXHRvblNlc3Npb25UcnVuY2F0ZWQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50cnVuY2F0ZXMucHVzaChzZXNzaW9uKTtcblx0fVxufVxuXG4vKipcbiAqIENvbnN0cnVjdHMgYW4ge0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9IHdpdGggYSBtaW5pbWFsIGxvY2FsIGluc3RhbnRpYXRpb25cbiAqIHNjb3BlIHRoYXQgc2F0aXNmaWVzIGl0cyB7QGxpbmsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2V9IC9cbiAqIHtAbGluayBJTG9nU2VydmljZX0gLyB7QGxpbmsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2V9IGRlcGVuZGVuY2llcy5cbiAqIGBnaXRTZXJ2aWNlYCBpcyBubyBsb25nZXIgcmVxdWlyZWQgYnkgYEFnZW50U2lkZUVmZmVjdHNgIGl0c2VsZiAobW92ZWRcbiAqIHRvIHtAbGluayBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZX0pOyBpdCBpcyBrZXB0IGhlcmUgYXMgYSBsZWZ0b3ZlclxuICogZm9yIGFueSBmdXR1cmUgdGVzdHMgdGhhdCBuZWVkIHRvIG92ZXJyaWRlIHRoZSBuby1vcCBnaXQgc2VydmljZSB2aWFcbiAqIHRoZSBjaGFuZ2VzZXQgZmFrZSdzIHVuZGVybHlpbmcgaW1wbGVtZW50YXRpb24uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0c3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdG9wdGlvbnM6IE9taXQ8SUFnZW50U2lkZUVmZmVjdHNPcHRpb25zLCAnbG9jYWxUdXJucyc+ICYgeyBsb2NhbFR1cm5zPzogQWdlbnRIb3N0TG9jYWxUdXJucyB9LFxuXHRfZ2l0U2VydmljZT86IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHR0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSA9IE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRjaGFuZ2VzZXRzOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSA9IG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpLFxuXHR0ZXJtaW5hbE1hbmFnZXI6IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKSksXG5cdGNoZWNrcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgPSBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcbik6IEFnZW50U2lkZUVmZmVjdHMge1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0W0lMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlXSxcblx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFtJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgY2hhbmdlc2V0c10sXG5cdFx0W0lBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgY2hlY2twb2ludFNlcnZpY2VdLFxuXHRcdFtJVGVsZW1ldHJ5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0W0lBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIHRlcm1pbmFsTWFuYWdlcl0sXG5cdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIG9wdGlvbnMuc2Vzc2lvbkRhdGFTZXJ2aWNlXSxcblx0KSwgLypzdHJpY3QqLyB0cnVlKSk7XG5cdGNvbnN0IHJlc29sdmVkT3B0aW9uczogSUFnZW50U2lkZUVmZmVjdHNPcHRpb25zID0ge1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0bG9jYWxUdXJuczogb3B0aW9ucy5sb2NhbFR1cm5zID8/IG5ldyBBZ2VudEhvc3RMb2NhbFR1cm5zKG9wdGlvbnMuc2Vzc2lvbkRhdGFTZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0fTtcblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCBzdGF0ZU1hbmFnZXIsIHJlc29sdmVkT3B0aW9ucykpO1xufVxuXG5jbGFzcyBUZXN0VGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5TGV2ZWwuVVNBR0U7XG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24nO1xuXHRyZWFkb25seSBtYWNoaW5lSWQgPSAndGVzdC1tYWNoaW5lJztcblx0cmVhZG9ubHkgc3FtSWQgPSAndGVzdC1zcW0nO1xuXHRyZWFkb25seSBkZXZEZXZpY2VJZCA9ICd0ZXN0LWRldi1kZXZpY2UnO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlID0gJ3Rlc3QtZmlyc3Qtc2Vzc2lvbi1kYXRlJztcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gZmFsc2U7XG5cdHJlYWRvbmx5IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10gPSBbXTtcblxuXHRwdWJsaWNMb2coKTogdm9pZCB7IH1cblx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMigpOiB2b2lkIHsgfVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkoKTogdm9pZCB7IH1cblx0c2V0Q29tbW9uUHJvcGVydHkoKTogdm9pZCB7IH1cbn1cblxuc3VpdGUoJ0FnZW50U2lkZUVmZmVjdHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCBzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcjtcblx0bGV0IGFnZW50OiBNb2NrQWdlbnQ7XG5cdGxldCBzaWRlRWZmZWN0czogQWdlbnRTaWRlRWZmZWN0cztcblx0bGV0IGFnZW50TGlzdDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFtdPj47XG5cdGxldCB0ZWxlbWV0cnlTZXJ2aWNlOiBUZXN0VGVsZW1ldHJ5U2VydmljZTtcblxuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKTtcblx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdGZ1bmN0aW9uIHNldHVwU2Vzc2lvbih3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvblVyaS50b1N0cmluZygpLCBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb25VcmkudG9TdHJpbmcoKSkpO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRUdXJuKHR1cm5JZDogc3RyaW5nLCBjaGFubmVsID0gZGVmYXVsdENoYXRVcmkpOiB2b2lkIHtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oY2hhbm5lbCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkLCBzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLCBtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9LFxuXHRcdFx0eyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHdpdGggdGhlIGZpcnN0IG5vbi1gdW5kZWZpbmVkYCB2YWx1ZSByZXR1cm5lZCBieSBgbWF0Y2hgLFxuXHQgKiByZS1ldmFsdWF0aW5nIGl0IGltbWVkaWF0ZWx5IGFuZCBhZnRlciBldmVyeSBlbnZlbG9wZSBlbWl0dGVkIGJ5IHRoZVxuXHQgKiBzdGF0ZSBtYW5hZ2VyLiBVc2VkIHRvIGF3YWl0IHRoZSBhc3luYyB0b29sLWFwcHJvdmFsIHBpcGVsaW5lXG5cdCAqIChgX2hhbmRsZVRvb2xSZWFkeWAgLT4gYGdldEF1dG9BcHByb3ZhbGAgLT4gYHJlYWxwYXRoYCkgZGV0ZXJtaW5pc3RpY2FsbHlcblx0ICogaW5zdGVhZCBvZiBkZXBlbmRpbmcgb24gYSBmaXhlZCBzZXR0bGUgZGVsYXkuXG5cdCAqL1xuXHRmdW5jdGlvbiB3YWl0Rm9yU3RhdGU8VD4obWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBtYXRjaDogKCkgPT4gVCB8IHVuZGVmaW5lZCk6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsID0gbWF0Y2goKTtcblx0XHRcdGlmIChpbml0aWFsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzb2x2ZShpbml0aWFsKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ3dhaXRGb3JTdGF0ZTogY29uZGl0aW9uIHdhcyBub3QgbWV0JykpO1xuXHRcdFx0fSwgNTAwMCk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyVGltZW91dCh0aW1lcikpKTtcblx0XHRcdHN0b3JlLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBtYXRjaCgpO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCA+PSBjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKGFnZW50Lm9uRGlkU2VuZE1lc3NhZ2UsICgpID0+IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoID49IGNvdW50KSk7XG5cdH1cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbWVtRnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIG1lbUZzKSk7XG5cblx0XHQvLyBTZWVkIGEgZmlsZSBzbyB0aGUgaGFuZGxlQnJvd3NlRGlyZWN0b3J5IHRlc3RzIGNhbiBkaXN0aW5ndWlzaCBmaWxlcyBmcm9tIGRpcnNcblx0XHRjb25zdCB0ZXN0RGlyID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvdGVzdERpcicgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRlc3REaXIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy90ZXN0RGlyL2ZpbGUudHh0JyB9KSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8nKSk7XG5cblx0XHRhZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YWdlbnRMaXN0ID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFtdPignYWdlbnRzJywgW2FnZW50XSk7XG5cdFx0dGVsZW1ldHJ5U2VydmljZSA9IG5ldyBUZXN0VGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdHNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdH0sIHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlKHRlbGVtZXRyeVNlcnZpY2UpKSk7XG5cblx0XHQvLyBNaW1pYyB0aGUgb3JjaGVzdHJhdG9yJ3Mgc3Bhd24gY2hhbm5lbDogaW4gcHJvZHVjdGlvbiBBZ2VudFNlcnZpY2UgYWRkc1xuXHRcdC8vIGEgc3ViYWdlbnQncyBjaGF0IHRvIHRoZSBjYXRhbG9nICh2aWEgX29uQ2hhdFNwYXduZWQpIGJlZm9yZVxuXHRcdC8vIEFnZW50U2lkZUVmZmVjdHMgc3RhcnRzIGl0cyB0dXJuLiBSZWdpc3RlcmVkIGhlcmUgKGFoZWFkIG9mIGVhY2ggdGVzdCdzXG5cdFx0Ly8gcmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKSBzbyB0aGUgc3ViYWdlbnQgY2hhdCBleGlzdHMgZmlyc3QuIGFkZENoYXQgaXNcblx0XHQvLyBpZGVtcG90ZW50LCBtYXRjaGluZyB0aGUgcmVhbCBzcGF3bi1jaGFubmVsL3NpZGUtZWZmZWN0cyBvdmVybGFwLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzaWduYWwgPT4ge1xuXHRcdFx0Y29uc3Qgc3Bhd24gPSBTdWJhZ2VudENoYXRTaWduYWwudG9TcGF3bkV2ZW50KHNpZ25hbCk7XG5cdFx0XHRpZiAoc3Bhd24pIHtcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc3Bhd24uc2Vzc2lvbi50b1N0cmluZygpLCBzcGF3bi5jaGF0LnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0aXRsZTogc3Bhd24udGl0bGUsXG5cdFx0XHRcdFx0b3JpZ2luOiBzcGF3bi5wYXJlbnQgPyB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IHNwYXduLnBhcmVudC5jaGF0LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IHNwYXduLnBhcmVudC50b29sQ2FsbElkIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogc2Vzc2lvbi90dXJuU3RhcnRlZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBzZXNzaW9uL3R1cm5TdGFydGVkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2FsbHMgc2VuZE1lc3NhZ2Ugb24gdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbyB3b3JsZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCBwcm9tcHQ6ICdoZWxsbyB3b3JsZCcsIGF0dGFjaG1lbnRzOiB1bmRlZmluZWQsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSkgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHRoZSBkaXNwYXRjaGluZyBjbGllbnQgaWQgYW5kIHR5cGUgdG8gc2VuZE1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvIHdvcmxkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCAnY2xpZW50LUInLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwcm9tcHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHNlbmRlckNsaWVudElkOiAnY2xpZW50LUInLFxuXHRcdFx0XHRjbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsb2dzIHRlbGVtZXRyeSB3aGVuIHNlbmRpbmcgYSBkaXJlY3QgdXNlciBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBhY3RpdmVDbGllbnRBY3Rpb246IFNlc3Npb25BY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFt7IG5hbWU6ICd0ZXN0VG9vbCcsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfV0sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9jdXN0b21pemF0aW9ucy9TS0lMTC5tZCcpLCB1cmk6ICdmaWxlOi8vL2N1c3RvbWl6YXRpb25zL1NLSUxMLm1kJywgbmFtZTogJ1Rlc3QgU2tpbGwnLCBlbmFibGVkOiB0cnVlIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aXZlQ2xpZW50QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGl2ZUNsaWVudEFjdGlvbik7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZGlyZWN0LnRzJyk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvIHdvcmxkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYXR0YWNobWVudHM6IFt7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksIGxhYmVsOiAnZGlyZWN0LnRzJywgZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcgfV0gfSxcblx0XHRcdH0sICdjbGllbnQtYWdlbnRzJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3cpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QudXNlck1lc3NhZ2VTZW50Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2FnZW50c193aW5kb3cnLFxuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdkaXJlY3QnLFxuXHRcdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0XHR0dXJuQ291bnQ6IDAsXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50VG9vbENvdW50OiAxLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudEN1c3RvbWl6YXRpb25Db3VudDogMSxcblx0XHRcdFx0XHRhdHRhY2htZW50Q291bnQ6IDEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgcHJvdG9jb2wgYXR0YWNobWVudCBVUkkgc3RyaW5ncyBiZWZvcmUgcGFzc2luZyB0aGVtIHRvIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QudHMnKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvIHdvcmxkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYXR0YWNobWVudHM6IFt7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksIGxhYmVsOiAndGVzdC50cycsIGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnIH1dIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbe1xuXHRcdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0cHJvbXB0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHRhdHRhY2htZW50czogW3sgdHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLCB1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSwgbGFiZWw6ICd0ZXN0LnRzJywgZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcgfV0sXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgcHJvdG9jb2wgc2VsZWN0aW9uIGF0dGFjaG1lbnQgcmFuZ2Ugc3RyYWlnaHQgdGhyb3VnaCB0byB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zZWxlY3Rpb24udHMnKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHR1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnc2VsZWN0aW9uLnRzJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlLaW5kOiAnc2VsZWN0aW9uJyxcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXJ0OiB7IGxpbmU6IDIsIGNoYXJhY3RlcjogMyB9LFxuXHRcdFx0XHRcdFx0XHRcdGVuZDogeyBsaW5lOiA0LCBjaGFyYWN0ZXI6IDUgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwcm9tcHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0XHR1cmk6IGZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRsYWJlbDogJ3NlbGVjdGlvbi50cycsXG5cdFx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdzZWxlY3Rpb24nLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0c3RhcnQ6IHsgbGluZTogMiwgY2hhcmFjdGVyOiAzIH0sXG5cdFx0XHRcdFx0XHRcdGVuZDogeyBsaW5lOiA0LCBjaGFyYWN0ZXI6IDUgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBjaGF0IGF0dGFjaG1lbnRzIHRoYXQgcmVmZXJlbmNlIGFub3RoZXIgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgb3RoZXJTZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTInKTtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IG90aGVyU2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ090aGVyJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihvdGhlclNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZWVkRGVmYXVsdENoYXRUdXJucyhvdGhlclNlc3Npb25VcmkudG9TdHJpbmcoKSwgW3tcblx0XHRcdFx0aWQ6ICdvdGhlci10dXJuJyxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnQ3Jvc3Mgc2Vzc2lvbiBtZW1vcnknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncmVzcG9uc2UnLCBjb250ZW50OiAnUmVjYWxsZWQgYWNyb3NzIHNlc3Npb25zJyB9XSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH1dKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ3JlYWQgYW5vdGhlciBzZXNzaW9uJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogb3RoZXJTZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRlbmRUdXJuOiAnb3RoZXItdHVybicsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ090aGVyIHNlc3Npb24nLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHM/LlswXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0eXBlOiBhdHRhY2htZW50Py50eXBlLFxuXHRcdFx0XHRoYXNVc2VyOiBhdHRhY2htZW50Py50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlICYmIGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbj8uaW5jbHVkZXMoJ1VzZXI6IENyb3NzIHNlc3Npb24gbWVtb3J5JyksXG5cdFx0XHRcdGhhc0Fzc2lzdGFudDogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdBc3Npc3RhbnQ6IFJlY2FsbGVkIGFjcm9zcyBzZXNzaW9ucycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRoYXNVc2VyOiB0cnVlLFxuXHRcdFx0XHRoYXNBc3Npc3RhbnQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZ3JhZGVzIHRvIGEgbm8tZXhjZXJwdCBwb2ludGVyIHdoZW4gdGhlIHJlZmVyZW5jZWQgY2hhdCBpcyB1bnJlc29sdmFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IG1pc3NpbmdTZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdtaXNzaW5nJyk7XG5cdFx0XHRjb25zdCByZXNvbHZpbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHQvLyBNaXJyb3JzIGFnZW50U2VydmljZS5fcmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnMgdGhyb3dpbmdcblx0XHRcdFx0Ly8gUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQpIGZvciBhIGNyb3NzLXNlc3Npb25cblx0XHRcdFx0Ly8gcmVmZXJlbmNlIHRoaXMgaG9zdCBjYW5ub3QgcmVzdG9yZS5cblx0XHRcdFx0cmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnM6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdBSFBfU0VTU0lPTl9OT1RfRk9VTkQnKTsgfSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2aW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ3JlYWQgYSBzdGFsZSByZWZlcmVuY2UnLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBtaXNzaW5nU2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0ZW5kVHVybjogJ2dvbmUtdHVybicsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ1N0YWxlIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHM/LlswXTtcblx0XHRcdC8vIEEgc3RhbGUvdW5yZWFjaGFibGUgcmVmZXJlbmNlIG11c3Qgbm90IGZhaWwgdGhlIHR1cm46IGl0IHJlc29sdmVzIHRvXG5cdFx0XHQvLyBhIHBvaW50ZXIgd2l0aCBubyBleGNlcnB0IGFuZCB0aGUgZW5kVHVybiBwaW4gaXMgZHJvcHBlZC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0eXBlOiBhdHRhY2htZW50Py50eXBlLFxuXHRcdFx0XHRsYWJlbDogYXR0YWNobWVudD8ubGFiZWwsXG5cdFx0XHRcdG5vRXhjZXJwdDogYXR0YWNobWVudD8udHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSAmJiBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24/LmluY2x1ZGVzKCdoYXMgbm8gdHJhbnNjcmlwdCBjb250ZW50IHVwIHRvIHRoZSBzZWxlY3RlZCB0dXJuJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGxhYmVsOiAnU3RhbGUgY2hhdCcsXG5cdFx0XHRcdG5vRXhjZXJwdDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXdhaXRzIGh5ZHJhdGVkIHR1cm5zIHdoZW4gcmVzb2x2aW5nIGEgY2hhdCBhdHRhY2htZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzb3VyY2VUdXJuOiBUdXJuID0ge1xuXHRcdFx0XHRpZDogJ3NvdXJjZS10dXJuJyxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnUmVtZW1iZXIgWCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdyZXNwb25zZScsIGNvbnRlbnQ6ICdSZW1lbWJlcmVkJyB9XSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXNvbHZpbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRyZXNvbHZlQ2hhdEF0dGFjaG1lbnRUdXJuczogYXN5bmMgKCkgPT4gW3NvdXJjZVR1cm5dLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvbHZpbmdTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnV2hhdCB3YXMgcmVtZW1iZXJlZD8nLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRlbmRUdXJuOiBzb3VyY2VUdXJuLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdFYXJsaWVyIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHNbMF0uYXR0YWNobWVudHM/LlswXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0eXBlOiBhdHRhY2htZW50Py50eXBlLFxuXHRcdFx0XHRoYXNVc2VyOiBhdHRhY2htZW50Py50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlICYmIGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbj8uaW5jbHVkZXMoJ1VzZXI6IFJlbWVtYmVyIFgnKSxcblx0XHRcdFx0aGFzQXNzaXN0YW50OiBhdHRhY2htZW50Py50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlICYmIGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbj8uaW5jbHVkZXMoJ0Fzc2lzdGFudDogUmVtZW1iZXJlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRoYXNVc2VyOiB0cnVlLFxuXHRcdFx0XHRoYXNBc3Npc3RhbnQ6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BpbnMgdGhlIGxhdGVzdCBjb21wbGV0ZWQgdHVybiB3aGVuIGEgY2hhdCBhdHRhY2htZW50IG9taXRzIGVuZFR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IG9sZGVyVHVybjogVHVybiA9IHtcblx0XHRcdFx0aWQ6ICdvbGRlci10dXJuJyxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnUmVtZW1iZXIgWCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdyMScsIGNvbnRlbnQ6ICdSZW1lbWJlcmVkIFgnIH1dLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGxhdGVzdFR1cm46IFR1cm4gPSB7XG5cdFx0XHRcdGlkOiAnbGF0ZXN0LXR1cm4nLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdSZW1lbWJlciBaJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3IyJywgY29udGVudDogJ1JlbWVtYmVyZWQgWicgfV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzb2x2aW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0cmVzb2x2ZUNoYXRBdHRhY2htZW50VHVybnM6IGFzeW5jICgpID0+IFtvbGRlclR1cm4sIGxhdGVzdFR1cm5dLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvbHZpbmdTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiAnV2hhdCB3YXMgcmVtZW1iZXJlZD8nLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0VhcmxpZXIgY2hhdCcsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50ID0gYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5hdHRhY2htZW50cz8uWzBdO1xuXHRcdFx0Ly8gTm8gZW5kVHVybiBwaW4sIHNvIHRoZSB3aG9sZSByZXRhaW5lZCB0cmFuc2NyaXB0IHJlc29sdmVzIFx1MjAxNCBpbmNsdWRpbmdcblx0XHRcdC8vIHRoZSBsYXRlc3QgY29tcGxldGVkIHR1cm4uXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHlwZTogYXR0YWNobWVudD8udHlwZSxcblx0XHRcdFx0aGFzT2xkZXI6IGF0dGFjaG1lbnQ/LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgJiYgYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uPy5pbmNsdWRlcygnQXNzaXN0YW50OiBSZW1lbWJlcmVkIFgnKSxcblx0XHRcdFx0aGFzTGF0ZXN0OiBhdHRhY2htZW50Py50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlICYmIGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbj8uaW5jbHVkZXMoJ0Fzc2lzdGFudDogUmVtZW1iZXJlZCBaJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGhhc09sZGVyOiB0cnVlLFxuXHRcdFx0XHRoYXNMYXRlc3Q6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgY2hhdCBhdHRhY2htZW50cyB3aG9zZSBlbmRUdXJuIGlzIG1pc3NpbmcgZnJvbSB0aGUgcmV0YWluZWQgdHJhbnNjcmlwdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgW3tcblx0XHRcdFx0aWQ6ICdzb3VyY2UtdHVybicsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ1JlbWVtYmVyIFgnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncmVzcG9uc2UnLCBjb250ZW50OiAnUmVtZW1iZXJlZCcgfV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IGVycm9yID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUsIChlbnZlbG9wZSk6IGVudmVsb3BlIGlzIEFjdGlvbkVudmVsb3BlID0+XG5cdFx0XHRcdGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciAmJiBlbnZlbG9wZS5jaGFubmVsID09PSBkZWZhdWx0Q2hhdFVyaSkpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1doYXQgd2FzIHJlbWVtYmVyZWQ/Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0ZW5kVHVybjogJ21pc3NpbmctdHVybicsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ0VhcmxpZXIgY2hhdCcsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBhd2FpdCBlcnJvcjtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCxcblx0XHRcdFx0ZXJyb3JUeXBlOiBlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IgPyBlbnZlbG9wZS5hY3Rpb24uZXJyb3IuZXJyb3JUeXBlIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiAwLFxuXHRcdFx0XHRlcnJvclR5cGU6ICdzZW5kRmFpbGVkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBjaGF0IGF0dGFjaG1lbnRzIHdob3NlIGVuZFR1cm4gaXMgc3RpbGwgYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICdwZWVyLTEnKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGVlckNoYXRVcmksIHsgdGl0bGU6ICdQZWVyJyB9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihwZWVyQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdSZW1lbWJlciBYJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cblx0XHRcdGNvbnN0IGVycm9yID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUsIChlbnZlbG9wZSk6IGVudmVsb3BlIGlzIEFjdGlvbkVudmVsb3BlID0+XG5cdFx0XHRcdGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciAmJiBlbnZlbG9wZS5jaGFubmVsID09PSBkZWZhdWx0Q2hhdFVyaSkpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1doYXQgd2FzIHJlbWVtYmVyZWQ/Jyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogcGVlckNoYXRVcmksXG5cdFx0XHRcdFx0XHRlbmRUdXJuOiAnYWN0aXZlLXR1cm4nLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdFYXJsaWVyIGNoYXQnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gYXdhaXQgZXJyb3I7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGVycm9yVHlwZTogZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yID8gZW52ZWxvcGUuYWN0aW9uLmVycm9yLmVycm9yVHlwZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VuZE1lc3NhZ2VDYWxsczogMCxcblx0XHRcdFx0ZXJyb3JUeXBlOiAnc2VuZEZhaWxlZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3BhdGNoZXMgc2Vzc2lvbi9lcnJvciB3aGVuIG5vIGFnZW50IGlzIGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBlbXB0eUFnZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtdKTtcblx0XHRcdGNvbnN0IG5vQWdlbnRTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGFnZW50czogZW1wdHlBZ2VudHMsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZToge30gYXMgSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRub0FnZW50U2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlcnJvckFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yQWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIHNlc3Npb24vZXJyb3InKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSB0dXJuIG9uIGFuIGFyY2hpdmVkIHNlc3Npb24gd2l0aG91dCBjYWxsaW5nIHRoZSBhZ2VudCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlcnJvckFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yQWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIGEgY2hhdCBlcnJvciBmb3IgYW4gYXJjaGl2ZWQgc2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGEgdHVybiBvbiBhIHJlYWQtb25seSBjaGF0IHdpdGhvdXQgY2FsbGluZyB0aGUgYWdlbnQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdC8vIEEgcmVhZC1vbmx5IHBlZXIgY2hhdCAoZS5nLiBhIHN1YmFnZW50IHdvcmtlcikgb24gYSBub24tYXJjaGl2ZWRcblx0XHRcdC8vIHNlc3Npb24gXHUyMDE0IGVuZm9yY2VtZW50IGtleXMgb2ZmIHRoZSBjaGF0J3MgaW50ZXJhY3Rpdml0eSwgbm90IGFyY2hpdmVkLlxuXHRcdFx0Y29uc3QgcmVhZE9ubHlDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLXJvJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHJlYWRPbmx5Q2hhdCwgeyBpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHJlYWRPbmx5Q2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZXJyb3JBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRcdGFzc2VydC5vayhlcnJvckFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCBhIGNoYXQgZXJyb3IgZm9yIGEgcmVhZC1vbmx5IGNoYXQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogZmlyc3QtdHVybiBtYXRlcmlhbGl6YXRpb24gZmFpbHVyZSAtLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBmaXJzdC10dXJuIG1hdGVyaWFsaXphdGlvbiBmYWlsdXJlJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIENyZWF0ZSBhIHByb3Zpc2lvbmFsIChub3QteWV0LW1hdGVyaWFsaXplZCkgc2Vzc2lvbjogbm8gYFNlc3Npb25SZWFkeWBcblx0XHQgKiAoc28gbGlmZWN5Y2xlIHN0YXlzIGBDcmVhdGluZ2ApIGFuZCBhIGRlZmVycmVkIGBTZXNzaW9uQWRkZWRgIFx1MjAxNCBtaXJyb3Jpbmdcblx0XHQgKiBob3cgdGhlIGFnZW50IGhvc3QgY3JlYXRlcyBhIHNlc3Npb24gd2hvc2Ugd29ya3RyZWUvU0RLIHNldHVwIGhhcHBlbnMgb25cblx0XHQgKiB0aGUgZmlyc3QgYHNlbmRNZXNzYWdlYC5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBzZXR1cFByb3Zpc2lvbmFsU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9LCB7IGVtaXROb3RpZmljYXRpb246IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3N1cmZhY2VzIGEgZmFpbGVkIHByb3Zpc2lvbmFsIGZpcnN0IHR1cm4gYXMgYSB0ZXJtaW5hbCBjcmVhdGlvbiBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBQcm92aXNpb25hbFNlc3Npb24oKTtcblx0XHRcdGFnZW50LnNlbmRNZXNzYWdlRXJyb3IgPSBuZXcgRXJyb3IoJ2dpdCAtYyBleGl0ZWQgd2l0aCBjb2RlIDEyODogZmF0YWw6IGludmFsaWQgcmVmZXJlbmNlOiBtYWluJyk7XG5cblx0XHRcdC8vIFJlZHVjZSB0aGUgdHVybiBzdGFydCAoYXMgdGhlIGNsaWVudCB3b3VsZCkgc28gdGhlIGNoYXQgaGFzIGFuXG5cdFx0XHQvLyBhY3RpdmUgdHVybiBmb3IgdGhlIHN1YnNlcXVlbnQgQ2hhdEVycm9yIHRvIHRlcm1pbmF0ZSwgdGhlbiBpbnZva2Vcblx0XHRcdC8vIHRoZSBzaWRlIGVmZmVjdHMgdGhhdCBkcml2ZSBgc2VuZE1lc3NhZ2VgLlxuXHRcdFx0Y29uc3QgdHVyblN0YXJ0ZWQgPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgY29uc3Q7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHR1cm5TdGFydGVkLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB0dXJuU3RhcnRlZCk7XG5cblx0XHRcdC8vIFdhaXQgZm9yIHRoZSBhc3luYyBzZW5kIHJlamVjdGlvbiArIGNhdGNoIGhhbmRsaW5nIHRvIHJ1bi5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQpIHx8IHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25BZGRlZCA9IG5vdGlmaWNhdGlvbnMuZmluZChuID0+IG4udHlwZSA9PT0gJ3Jvb3Qvc2Vzc2lvbkFkZGVkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdEVycm9yOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSxcblx0XHRcdFx0Y3JlYXRpb25GYWlsZWQ6IGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQpLFxuXHRcdFx0XHRsaWZlY3ljbGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8ubGlmZWN5Y2xlLFxuXHRcdFx0XHRzZXNzaW9uQWRkZWRXaXRoRXJyb3I6ICEhc2Vzc2lvbkFkZGVkICYmIChzZXNzaW9uQWRkZWQuc3VtbWFyeS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLkVycm9yKSA9PT0gU2Vzc2lvblN0YXR1cy5FcnJvcixcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhdEVycm9yOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGlvbkZhaWxlZDogdHJ1ZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW9uRmFpbGVkLFxuXHRcdFx0XHRzZXNzaW9uQWRkZWRXaXRoRXJyb3I6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cmZhY2VzIGEgd29ya2luZyBkaXJlY3RvcnkgcmVzb2x1dGlvbiBmYWlsdXJlIHdpdGhvdXQgY2FsbGluZyB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFByb3Zpc2lvbmFsU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcmVzb2x1dGlvbkVycm9yID0gbmV3IEVycm9yKCdUaGUgaXNvbGF0ZWQgd29ya3RyZWUgY291bGQgbm90IGJlIHJlc3RvcmVkJyk7XG5cdFx0XHRjb25zdCByZXNvbHZpbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZToge30gYXMgSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0cmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kOiBhc3luYyAoKSA9PiB7IHRocm93IHJlc29sdXRpb25FcnJvcjsgfSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdHVyblN0YXJ0ZWQgPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0gYXMgY29uc3Q7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHR1cm5TdGFydGVkLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblx0XHRcdHJlc29sdmluZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgdHVyblN0YXJ0ZWQpO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkKSB8fCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdEVycm9yOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSxcblx0XHRcdFx0Y3JlYXRpb25GYWlsZWQ6IGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQpLFxuXHRcdFx0XHRsaWZlY3ljbGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8ubGlmZWN5Y2xlLFxuXHRcdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiBhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGF0RXJyb3I6IHRydWUsXG5cdFx0XHRcdGNyZWF0aW9uRmFpbGVkOiB0cnVlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpb25GYWlsZWQsXG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBmYWlsIGNyZWF0aW9uIHdoZW4gYW4gYWxyZWFkeS1yZWFkeSBzZXNzaW9uIHNlbmQgcmVqZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpOyAvLyBkaXNwYXRjaGVzIFNlc3Npb25SZWFkeSAtPiBsaWZlY3ljbGUgUmVhZHlcblx0XHRcdGFnZW50LnNlbmRNZXNzYWdlRXJyb3IgPSBuZXcgRXJyb3IoJ3RyYW5zaWVudCBzZW5kIGZhaWx1cmUnKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB8fCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdEVycm9yOiBlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSxcblx0XHRcdFx0Y3JlYXRpb25GYWlsZWQ6IGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3JlYXRpb25GYWlsZWQpLFxuXHRcdFx0XHRsaWZlY3ljbGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8ubGlmZWN5Y2xlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGF0RXJyb3I6IHRydWUsXG5cdFx0XHRcdGNyZWF0aW9uRmFpbGVkOiBmYWxzZSxcblx0XHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGFuZGxlQWN0aW9uOiBnZW5lcmljIC9yZW5hbWUgc2xhc2ggY29tbWFuZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCAvcmVuYW1lIHNsYXNoIGNvbW1hbmQnLCAoKSA9PiB7XG5cblx0XHQvLyBgL3JlbmFtZWAgcGVyc2lzdHMgdGhlIG5ldyB0aXRsZSwgc28gdGhlc2UgdGVzdHMgbmVlZCBhIHNlc3Npb24gZGF0YVxuXHRcdC8vIHNlcnZpY2Ugd2hvc2UgYG9wZW5EYXRhYmFzZWAgYWN0dWFsbHkgcmV0dXJucyBhIGRhdGFiYXNlICh0aGUgZGVmYXVsdFxuXHRcdC8vIG51bGwgc2VydmljZSB0aHJvd3MpLlxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVJlbmFtZVNpZGVFZmZlY3RzKCk6IEFnZW50U2lkZUVmZmVjdHMge1xuXHRcdFx0cmV0dXJuIGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWRpcmVjdHMgL3JlbmFtZSB0byBhIHRpdGxlIGNoYW5nZSBhbmQgY29tcGxldGVzIHRoZSB0dXJuIHdpdGhvdXQgY2FsbGluZyB0aGUgYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHJlbmFtZVNpZGVFZmZlY3RzID0gY3JlYXRlUmVuYW1lU2lkZUVmZmVjdHMoKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9yZW5hbWUgUmVuYW1lZCBTZXNzaW9uJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdC8vIE1pcnJvciBwcm9kdWN0aW9uOiB0aGUgcmVkdWNlciBhcHBsaWVzIHRoZSB0dXJuLCB0aGVuIHNpZGUgZWZmZWN0cyBydW4uXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRyZW5hbWVTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbXSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8udGl0bGUsICdSZW5hbWVkIFNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGU/LnR1cm5zLmF0KC0xKT8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gcGFydC5jb250ZW50IDogdW5kZWZpbmVkLCAnUmVuYW1lZDogUmVuYW1lZCBTZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcvcmVuYW1lIHdpdGhvdXQgYSB0aXRsZSBjb21wbGV0ZXMgdGhlIHR1cm4gYW5kIGxlYXZlcyB0aGUgdGl0bGUgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCByZW5hbWVTaWRlRWZmZWN0cyA9IGNyZWF0ZVJlbmFtZVNpZGVFZmZlY3RzKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcvcmVuYW1lJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFtdKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy50aXRsZSwgJ1Rlc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIG1lc3NhZ2UgdGhhdCBtZXJlbHkgc3RhcnRzIHdpdGggL3JlbmFtZSB0ZXh0IChubyBzZXBhcmF0b3IpIGlzIHNlbnQgdG8gdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCByZW5hbWVTaWRlRWZmZWN0cyA9IGNyZWF0ZVJlbmFtZVNpZGVFZmZlY3RzKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICcvcmVuYW1lZCB0aGluZycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRyZW5hbWVTaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLCBbeyBzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcHJvbXB0OiAnL3JlbmFtZWQgdGhpbmcnLCBhdHRhY2htZW50czogdW5kZWZpbmVkIH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IGdlbmVyaWMgISB0ZXJtaW5hbCBjb21tYW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0ICEgdGVybWluYWwgY29tbWFuZCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUJhbmdTaWRlRWZmZWN0cyh0ZXJtaW5hbE1hbmFnZXI6IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIpOiBBZ2VudFNpZGVFZmZlY3RzIHtcblx0XHRcdHJldHVybiBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0fVxuXG5cdFx0dGVzdCgncnVucyBhICEgbWVzc2FnZSBhcyBhIHRlcm1pbmFsIGNvbW1hbmQgYW5kIGNvbXBsZXRlcyB0aGUgdHVybiB3aXRob3V0IGNhbGxpbmcgdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IGJhbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZUJhbmdTaWRlRWZmZWN0cyh0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnIWVjaG8gaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0Ly8gTWlycm9yIHByb2R1Y3Rpb246IHRoZSByZWR1Y2VyIG9wZW5zIHRoZSB0dXJuLCB0aGVuIHNpZGUgZWZmZWN0cyBydW4uXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRiYW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBXYWl0IHVudGlsIHRoZSBjb21tYW5kIGlzIHJ1bm5pbmcgKGl0cyBjb21wbGV0aW9uIGxpc3RlbmVyIGlzXG5cdFx0XHQvLyByZWdpc3RlcmVkKSwgdGhlbiBzaWduYWwgdGhhdCB0aGUgY29tbWFuZCBmaW5pc2hlZC5cblx0XHRcdGF3YWl0IHRlcm1pbmFsTWFuYWdlci5jb21tYW5kRmluaXNoZWRMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRcdGNvbnN0IHRlcm1pbmFsVXJpID0gdGVybWluYWxNYW5hZ2VyLmNyZWF0ZWRbMF0uY2hhbm5lbDtcblx0XHRcdHRlcm1pbmFsTWFuYWdlci5maXJlQ29tbWFuZEZpbmlzaGVkKHsgY29tbWFuZElkOiAnMScsIGNvbW1hbmQ6ICdlY2hvIGhpJywgZXhpdENvZGU6IDAsIG91dHB1dDogJ2hpXFxuJyB9KTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHR1cm4gdG8gYmUgY2xvc2VkIG91dC5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHN0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc2Vzc2lvblVyaS50b1N0cmluZygpKSA9PT0gdW5kZWZpbmVkID8gdHJ1ZSA6IHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscywgW10pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGU/LnR1cm5zLmF0KC0xKT8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbENhbGw/LnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyB0b29sQ2FsbC5zdWNjZXNzIDogdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdFx0JiYgdG9vbENhbGwuY29udGVudD8uc29tZShjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsICYmIGMucmVzb3VyY2UgPT09IHRlcm1pbmFsVXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybWluYWxNYW5hZ2VyLmNyZWF0ZWQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayh0ZXJtaW5hbE1hbmFnZXIuc2VudFRleHRzLnNvbWUocyA9PiBzLmRhdGEuaW5jbHVkZXMoJ2VjaG8gaGknKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBsb25lICEgaXMgZm9yd2FyZGVkIHRvIHRoZSBhZ2VudCBpbnN0ZWFkIG9mIHJ1bm5pbmcgYSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKSk7XG5cdFx0XHRjb25zdCBiYW5nU2lkZUVmZmVjdHMgPSBjcmVhdGVCYW5nU2lkZUVmZmVjdHModGVybWluYWxNYW5hZ2VyKTtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJyEnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0YmFuZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJyEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtaW5hbE1hbmFnZXIuY3JlYXRlZC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb3JkcyB0aGUgY29tcGxldGVkIGJhbmcgdHVybiBhcyBhIGxvY2FsIHR1cm4sIHN0cmlwcGVkIG9mIHRoZSBsaXZlIHRlcm1pbmFsIHJlZmVyZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3JrJyk7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFR1cm5zID0gbmV3IEFnZW50SG9zdExvY2FsVHVybnMoY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3QgYmFuZ1NpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLFxuXHRcdFx0XHRsb2NhbFR1cm5zLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnIWVjaG8gaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0YmFuZ1NpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblxuXHRcdFx0YXdhaXQgdGVybWluYWxNYW5hZ2VyLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoeyBjb21tYW5kSWQ6ICcxJywgY29tbWFuZDogJ2VjaG8gaGknLCBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXG4nIH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpID09PSB1bmRlZmluZWQgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGhlIHR1cm4gd2l0aCBubyBwcmVjZWRpbmcgcmVhbCB0dXJuIGhhcyBubyBhbmNob3IuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoZGVmYXVsdENoYXRVcmksICd0dXJuLTEnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IGRiLmdldExvY2FsVHVybnMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJzaXN0ZWQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IHBheWxvYWQgPSBKU09OLnBhcnNlKHBlcnNpc3RlZFswXS5wYXlsb2FkKSBhcyB7IHJlc3BvbnNlUGFydHM6IHsga2luZDogc3RyaW5nOyB0b29sQ2FsbD86IHsgY29udGVudD86IHsgdHlwZTogc3RyaW5nIH1bXSB9IH1bXSB9O1xuXHRcdFx0Y29uc3QgdG9vbENhbGxQYXJ0ID0gcGF5bG9hZC5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0Ly8gTGl2ZSB0ZXJtaW5hbCByZWZlcmVuY2UgaXMgc3RyaXBwZWQ7IHRleHQgb3V0cHV0IGlzIHJldGFpbmVkLlxuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xDYWxsUGFydD8udG9vbENhbGw/LmNvbnRlbnQ/LmV2ZXJ5KGMgPT4gYy50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpKTtcblx0XHRcdGFzc2VydC5vayh0b29sQ2FsbFBhcnQ/LnRvb2xDYWxsPy5jb250ZW50Py5zb21lKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZHMgdGhlIHNlc3Npb24gdGl0bGUgZnJvbSB0aGUgISBjb21tYW5kIHdoZW4gdGhlIHNlc3Npb24gaXMgdW50aXRsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBIGJyYW5kLW5ldywgdW50aXRsZWQgc2Vzc2lvbjogdGhlIGJhbmcgY29tbWFuZCBpcyB0aGUgb25seSB0aGluZ1xuXHRcdFx0Ly8gd2UgY2FuIHRpdGxlIGl0IHdpdGggdW50aWwgYSByZWFsIHJlcXVlc3QgYXJyaXZlcy5cblx0XHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IGJhbmdTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICchZWNobyBoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRiYW5nU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBUaGUgcHJvdmlzaW9uYWwgdGl0bGUgaXMgYXBwbGllZCBzeW5jaHJvbm91c2x5LCBiZWZvcmUgdGhlIGNvbW1hbmQgcnVucy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LnRpdGxlLCAnZWNobyBoaScpO1xuXG5cdFx0XHQvLyBMZXQgdGhlIGNvbW1hbmQgZmluaXNoIHNvIHRoZSB0dXJuIGNsb3NlcyBjbGVhbmx5LlxuXHRcdFx0YXdhaXQgdGVybWluYWxNYW5hZ2VyLmNvbW1hbmRGaW5pc2hlZExpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdFx0dGVybWluYWxNYW5hZ2VyLmZpcmVDb21tYW5kRmluaXNoZWQoeyBjb21tYW5kSWQ6ICcxJywgY29tbWFuZDogJ2VjaG8gaGknLCBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXG4nIH0pO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpID09PSB1bmRlZmluZWQgPyB0cnVlIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gVGhlIHByb3Zpc2lvbmFsIHRpdGxlIGlzIHBlcnNpc3RlZCBzbyBpdCBzdXJ2aXZlcyByZWxvYWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksICdlY2hvIGhpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gbG9jYWwgdHVybiBwZXJzaXN0ZW5jZTogYW5jaG9yaW5nICsgdHJ1bmNhdGUgcmVzb2x1dGlvbiAtLS0tLS0tLS1cblxuXHRzdWl0ZSgnbG9jYWwgdHVybiBwZXJzaXN0ZW5jZScsICgpID0+IHtcblxuXHRcdGxldCBjbGllbnRTZXE6IG51bWJlcjtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNsaWVudFNlcSA9IDA7XG5cdFx0fSk7XG5cblx0XHQvKiogRHJpdmVzIGEgbm9ybWFsIChTREstYmFja2VkKSB0dXJuIGludG8gYHR1cm5zW11gIHZpYSB0aGUgcmVkdWNlci4gKi9cblx0XHRmdW5jdGlvbiBzZWVkUmVhbFR1cm4odHVybklkOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6ICsrY2xpZW50U2VxIH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbjogMTAwMCB9KTtcblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiBydW5CYW5nKHNlOiBBZ2VudFNpZGVFZmZlY3RzLCB0ZXJtaW5hbE1hbmFnZXI6IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJyFlY2hvIGhpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogKytjbGllbnRTZXEgfSk7XG5cdFx0XHRzZS5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZEZpbmlzaGVkTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNvbW1hbmRGaW5pc2hlZCh7IGNvbW1hbmRJZDogdHVybklkLCBjb21tYW5kOiAnZWNobyBoaScsIGV4aXRDb2RlOiAwLCBvdXRwdXQ6ICdoaVxcbicgfSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBzdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHNlc3Npb25VcmkudG9TdHJpbmcoKSkgPT09IHVuZGVmaW5lZCA/IHRydWUgOiB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGxldCBsb2NhbFR1cm5zOiBBZ2VudEhvc3RMb2NhbFR1cm5zO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTG9jYWxUdXJuU2lkZUVmZmVjdHMoZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UsIHRlcm1pbmFsTWFuYWdlcjogVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcik6IEFnZW50U2lkZUVmZmVjdHMge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKTtcblx0XHRcdGxvY2FsVHVybnMgPSBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhzZXNzaW9uRGF0YVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdHJldHVybiBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRcdGxvY2FsVHVybnMsXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0ZXJtaW5hbE1hbmFnZXIpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2FuY2hvcnMgYSBiYW5nIHR1cm4gdG8gdGhlIHByZWNlZGluZyBjb25jcmV0ZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IHNlID0gY3JlYXRlTG9jYWxUdXJuU2lkZUVmZmVjdHMoZGIsIHRlcm1pbmFsTWFuYWdlcik7XG5cblx0XHRcdHNlZWRSZWFsVHVybigncmVhbC0xJywgJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCBydW5CYW5nKHNlLCB0ZXJtaW5hbE1hbmFnZXIsICdsb2NhbC0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChkZWZhdWx0Q2hhdFVyaSwgJ2xvY2FsLTEnKSwgJ3JlYWwtMScpO1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgZGIuZ2V0TG9jYWxUdXJucygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwZXJzaXN0ZWQubWFwKHIgPT4gKHsgdHVybklkOiByLnR1cm5JZCwgY2hhdFVyaTogci5jaGF0VXJpLCBhbmNob3JUdXJuSWQ6IHIuYW5jaG9yVHVybklkIH0pKSwgW1xuXHRcdFx0XHR7IHR1cm5JZDogJ2xvY2FsLTEnLCBjaGF0VXJpOiBkZWZhdWx0Q2hhdFVyaSwgYW5jaG9yVHVybklkOiAncmVhbC0xJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW5nIGF0IGEgbG9jYWwgdHVybiByZWRpcmVjdHMgdGhlIFNESyB0cnVuY2F0aW9uIHRvIHRoZSBjb25jcmV0ZSBhbmNob3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdFx0Y29uc3Qgc2UgPSBjcmVhdGVMb2NhbFR1cm5TaWRlRWZmZWN0cyhkYiwgdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdFx0c2VlZFJlYWxUdXJuKCdyZWFsLTEnLCAnaGVsbG8nKTtcblx0XHRcdGF3YWl0IHJ1bkJhbmcoc2UsIHRlcm1pbmFsTWFuYWdlciwgJ2xvY2FsLTEnKTtcblxuXHRcdFx0Ly8gVHJ1bmNhdGUgYXQgdGhlIGxvY2FsIHR1cm4gKGtlZXAgaXQpLiBSZWR1Y2VyIGtlZXBzIFtyZWFsLTEsIGxvY2FsLTFdLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAnbG9jYWwtMScgfSwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6ICsrY2xpZW50U2VxIH0pO1xuXHRcdFx0c2UuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAnbG9jYWwtMScgfSk7XG5cblx0XHRcdC8vIFRoZSBTREsgaXMgdG9sZCB0byBrZWVwIHVwIHRvIHRoZSBjb25jcmV0ZSB0dXJuIGJlZm9yZSB0aGUgbG9jYWwgb25lLlxuXHRcdFx0Y29uc3QgdHJ1bmNhdGVDYWxsID0gYWdlbnQudHJ1bmNhdGVTZXNzaW9uQ2FsbHMuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydW5jYXRlQ2FsbD8uc2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRydW5jYXRlQ2FsbD8udHVybklkLCAncmVhbC0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW5nIGF0IGEgcmVhbCB0dXJuIGRyb3BzIHRoZSB0cmFpbGluZyBsb2NhbCB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKTtcblx0XHRcdGNvbnN0IHNlID0gY3JlYXRlTG9jYWxUdXJuU2lkZUVmZmVjdHMoZGIsIHRlcm1pbmFsTWFuYWdlcik7XG5cblx0XHRcdHNlZWRSZWFsVHVybigncmVhbC0xJywgJ2hlbGxvJyk7XG5cdFx0XHRhd2FpdCBydW5CYW5nKHNlLCB0ZXJtaW5hbE1hbmFnZXIsICdsb2NhbC0xJyk7XG5cblx0XHRcdC8vIFRydW5jYXRlIGF0IHRoZSByZWFsIHR1cm4gKGRyb3AgdGhlIGxvY2FsIHR1cm4gYWZ0ZXIgaXQpLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCwgdHVybklkOiAncmVhbC0xJyB9LCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogKytjbGllbnRTZXEgfSk7XG5cdFx0XHRzZS5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLCB0dXJuSWQ6ICdyZWFsLTEnIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQudHJ1bmNhdGVTZXNzaW9uQ2FsbHMuYXQoLTEpPy50dXJuSWQsICdyZWFsLTEnKTtcblx0XHRcdC8vIFRoZSBsb2NhbCB0dXJuIGlzIGRyb3BwZWQgZnJvbSBtZW1vcnkgc3luY2hyb25vdXNseSBhbmQgZnJvbSB0aGUgREIgYXN5bmMuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxUdXJucy5pc0xvY2FsKGRlZmF1bHRDaGF0VXJpLCAnbG9jYWwtMScpLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGIuZ2V0TG9jYWxUdXJucygpLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gdHVybiB1c2FnZSBwZXJzaXN0ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3R1cm4gdXNhZ2UgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB1c2FnZSA9IHsgaW5wdXRUb2tlbnM6IDEwMCwgb3V0cHV0VG9rZW5zOiAyMCwgbW9kZWw6ICdncHQtNScsIF9tZXRhOiB7IGNvcGlsb3RVc2FnZTogeyB0b3RhbE5hbm9BaXU6IDVfMDAwXzAwMF8wMDAgfSB9IH07XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVVc2FnZVNpZGVFZmZlY3RzKGRiOiBUZXN0U2Vzc2lvbkRhdGFiYXNlKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpO1xuXHRcdFx0Y3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0XHRsb2NhbFR1cm5zOiBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyhzZXNzaW9uRGF0YVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3BlcnNpc3RzIHRoZSBsYXRlc3QgdXNhZ2Ugb2YgYSB0dXJuLCB3aXRob3V0IHdhaXRpbmcgZm9yIHRoZSB0dXJuIHRvIGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFdyaXR0ZW4gZWFnZXJseSByYXRoZXIgdGhhbiBidWZmZXJlZCB1bnRpbCBhIHRlcm1pbmFsIGFjdGlvbjogYSB0dXJuXG5cdFx0XHQvLyBjdXQgc2hvcnQgYnkgYSBjcmFzaCBvciBkaXNjb25uZWN0IG11c3Qga2VlcCB0aGUgdXNhZ2UgaXQgYWNjcnVlZCxcblx0XHRcdC8vIHdoaWNoIGlzIHRoZSBjbGFzcyBvZiBsb3NzIHRoaXMgcGVyc2lzdGVuY2UgZXhpc3RzIHRvIHByZXZlbnQuXG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29yaycpO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y3JlYXRlVXNhZ2VTaWRlRWZmZWN0cyhkYik7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0xJywgdXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEsIG91dHB1dFRva2VuczogMSB9IH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTEnLCB1c2FnZSB9KTtcblxuXHRcdFx0Ly8gTm8gQ2hhdFR1cm5Db21wbGV0ZS9DYW5jZWxsZWQvRXJyb3IgXHUyMDE0IHRoZSByb3dzIGFyZSBhbHJlYWR5IGR1cmFibGUuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtbJ3R1cm4tMScsIEpTT04uc3RyaW5naWZ5KHVzYWdlKV1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgdXNhZ2UgcmVwb3J0ZWQgb24gYSBzdWJhZ2VudCBjaGF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dvcmsnKTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNyZWF0ZVVzYWdlU2lkZUVmZmVjdHMoZGIpO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0b29sLWNhbGwtMScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHN1YmFnZW50Q2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0xJywgdXNhZ2UgfSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc3ViYWdlbnRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwIH0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLihhd2FpdCBkYi5nZXRUdXJuVXNhZ2VzKCkpLmVudHJpZXMoKV0sIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBpbW1lZGlhdGUgdGl0bGUgb24gZmlyc3QgdHVybiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdpbW1lZGlhdGUgdGl0bGUgb24gZmlyc3QgdHVybicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIHNldHVwRGVmYXVsdFNlc3Npb24oKTogdm9pZCB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnZGlzcGF0Y2hlcyB0aXRsZUNoYW5nZWQgd2l0aCB1c2VyIG1lc3NhZ2Ugb24gZmlyc3QgdHVybicsICgpID0+IHtcblx0XHRcdHNldHVwRGVmYXVsdFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdGaXggdGhlIGxvZ2luIGJ1ZycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0aXRsZUFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZUFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCBzZXNzaW9uL3RpdGxlQ2hhbmdlZCcpO1xuXHRcdFx0aWYgKHRpdGxlQWN0aW9uPy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXRsZUFjdGlvbi5hY3Rpb24udGl0bGUsICdGaXggdGhlIGxvZ2luIGJ1ZycpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZGlzcGF0Y2ggdGl0bGVDaGFuZ2VkIHdoZW4gbWVzc2FnZSBpcyB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBEZWZhdWx0U2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJyAgICcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0aXRsZUFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXRsZUFjdGlvbiwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBkaXNwYXRjaCB0aXRsZUNoYW5nZWQgZm9yIGVtcHR5IG1lc3NhZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgd2hpdGVzcGFjZSBhbmQgdHJ1bmNhdGVzIGxvbmcgbWVzc2FnZXMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cERlZmF1bHRTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IGxvbmdNZXNzYWdlID0gJ0ZpeCB0aGUgYnVnXFxuaW4gdGhlIGxvZ2luXFx0cGFnZSAgcGxlYXNlICcgKyAnYScucmVwZWF0KDI1MCk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogbG9uZ01lc3NhZ2UsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0aXRsZUFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5vayh0aXRsZUFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCBzZXNzaW9uL3RpdGxlQ2hhbmdlZCcpO1xuXHRcdFx0aWYgKHRpdGxlQWN0aW9uPy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKSB7XG5cdFx0XHRcdGFzc2VydC5vayghdGl0bGVBY3Rpb24uYWN0aW9uLnRpdGxlLmluY2x1ZGVzKCdcXG4nKSwgJ3Nob3VsZCBub3QgY29udGFpbiBuZXdsaW5lcycpO1xuXHRcdFx0XHRhc3NlcnQub2soIXRpdGxlQWN0aW9uLmFjdGlvbi50aXRsZS5pbmNsdWRlcygnXFx0JyksICdzaG91bGQgbm90IGNvbnRhaW4gdGFicycpO1xuXHRcdFx0XHRhc3NlcnQub2soIXRpdGxlQWN0aW9uLmFjdGlvbi50aXRsZS5pbmNsdWRlcygnICAnKSwgJ3Nob3VsZCBub3QgY29udGFpbiBkb3VibGUgc3BhY2VzJyk7XG5cdFx0XHRcdGFzc2VydC5vayh0aXRsZUFjdGlvbi5hY3Rpb24udGl0bGUubGVuZ3RoIDw9IDIwMCwgJ3Nob3VsZCBiZSB0cnVuY2F0ZWQgdG8gMjAwIGNoYXJzJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkaXNwYXRjaCB0aXRsZUNoYW5nZWQgb24gc2Vjb25kIHR1cm4nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cERlZmF1bHRTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHQvLyBDb21wbGV0ZSB0aGUgZmlyc3QgdHVybiBzbyB0dXJucy5sZW5ndGggYmVjb21lcyAxLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzZWNvbmQgbWVzc2FnZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0aXRsZUFjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXRsZUFjdGlvbiwgdW5kZWZpbmVkLCAnc2hvdWxkIG5vdCBkaXNwYXRjaCB0aXRsZUNoYW5nZWQgb24gc2Vjb25kIHR1cm4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGRpc3BhdGNoIHRpdGxlQ2hhbmdlZCB3aGVuIHRpdGxlIGlzIGFscmVhZHkgc2V0JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2Vzc2lvbiBoYXMgYSBub24tZW1wdHkgdGl0bGUgKGUuZy4gdXNlciByZW5hbWVkIGJlZm9yZSBmaXJzdCBtZXNzYWdlKVxuXHRcdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1VzZXIgUmVuYW1lZCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlQWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlQWN0aW9uLCB1bmRlZmluZWQsICdzaG91bGQgbm90IGNsb2JiZXIgZXhpc3RpbmcgdGl0bGUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3R1cm4gY29tcGxldGlvbiBcdTIwMTQgcmVhZC91bnJlYWQnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiByZWFkQ2hhbmdlc0Zyb20oZW52ZWxvcGVzOiByZWFkb25seSBBY3Rpb25FbnZlbG9wZVtdKTogYm9vbGVhbltdIHtcblx0XHRcdHJldHVybiBlbnZlbG9wZXNcblx0XHRcdFx0LmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQpXG5cdFx0XHRcdC5tYXAoZSA9PiAoZS5hY3Rpb24gYXMgeyBpc1JlYWQ6IGJvb2xlYW4gfSkuaXNSZWFkKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBUdXJuIGNvbXBsZXRpb24gcGVyc2lzdHMgdGhlICh1bilyZWFkIGZsYWcsIHNvIHRoZXNlIHRlc3RzIG5lZWQgYSByZWFsXG5cdFx0ICogc2Vzc2lvbiBkYXRhYmFzZSByYXRoZXIgdGhhbiB0aGUgc3VpdGUncyBudWxsIGRhdGEgc2VydmljZS5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBzZXR1cFBlcnNpc3RpbmcoKTogeyBzaWRlRWZmZWN0czogQWdlbnRTaWRlRWZmZWN0czsgZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2UgfSB7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCBwZXJzaXN0aW5nID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UodGVsZW1ldHJ5U2VydmljZSkpKTtcblx0XHRcdHJldHVybiB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nLCBkYiB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ21hcmtzIGEgcmVhZCBzZXNzaW9uIHVucmVhZCB3aGVuIGEgdHVybiBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nIH0gPSBzZXR1cFBlcnNpc3RpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Ly8gVGhlIHNlc3Npb24gaGFzIGJlZW4gcmVhZCAoZS5nLiBhIGNsaWVudCB2aWV3ZWQgaXQpLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkLCBpc1JlYWQ6IHRydWUgfSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocGVyc2lzdGluZy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVhZENoYW5nZXM6IHJlYWRDaGFuZ2VzRnJvbShlbnZlbG9wZXMpLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaS50b1N0cmluZygpKSEuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQpICE9PSAwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogW2ZhbHNlXSxcblx0XHRcdFx0aXNSZWFkQml0U2V0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgcmUtbWFyayBhbiBhbHJlYWR5LXVucmVhZCBzZXNzaW9uIG9uIHR1cm4gY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2lkZUVmZmVjdHM6IHBlcnNpc3RpbmcgfSA9IHNldHVwUGVyc2lzdGluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHQvLyBObyBTZXNzaW9uSXNSZWFkQ2hhbmdlZCBkaXNwYXRjaGVkOiB0aGUgc2Vzc2lvbiBzdGFydHMgdW5yZWFkLlxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBlcnNpc3RpbmcucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkQ2hhbmdlc0Zyb20oZW52ZWxvcGVzKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVyc2lzdHMgdGhlIHVucmVhZCBmbGFnIHNvIGl0IHN1cnZpdmVzIGEgaG9zdCByZXN0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzaWRlRWZmZWN0czogcGVyc2lzdGluZywgZGIgfSA9IHNldHVwUGVyc2lzdGluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwZXJzaXN0aW5nLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkYi5nZXRNZXRhZGF0YSgnaXNSZWFkJyksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlcnNpc3RzIHJlYWQgc3RhdGUgZXhhY3RseSBvbmNlIGZvciBjbGllbnQtIGFuZCBzZXJ2ZXItZGlzcGF0Y2hlZCBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBkYiB9ID0gc2V0dXBQZXJzaXN0aW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Ly8gQSBjbGllbnQgbWFya2luZyB0aGUgc2Vzc2lvbiByZWFkIChlLmcuIHRoZSB1c2VyIG9wZW5lZCBpdCBpbiB0aGVcblx0XHRcdC8vIGVkaXRvciB3aW5kb3cgb3IgdGhlIGFnZW50IHdpbmRvdykuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9LCB7IGNsaWVudElkOiAnY2xpZW50LTEnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHQvLyBUaGUgaG9zdCBtYXJraW5nIGl0IHVucmVhZCBhZnRlciBiYWNrZ3JvdW5kIG91dHB1dC5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiBmYWxzZSB9KTtcblx0XHRcdC8vIEEgcmVqZWN0ZWQgY2xpZW50IGFjdGlvbiBuZXZlciByZWFjaGVkIHN0YXRlIGFuZCBtdXN0IG5vdCBwZXJzaXN0LlxuXHRcdFx0c3RhdGVNYW5hZ2VyLnJlamVjdENsaWVudEFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0sIHsgY2xpZW50SWQ6ICdjbGllbnQtMScsIGNsaWVudFNlcTogMiB9LCAnbm9wZScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRiLnNldE1ldGFkYXRhQ2FsbHMuZmlsdGVyKGMgPT4gYy5rZXkgPT09ICdpc1JlYWQnKSwgW1xuXHRcdFx0XHR7IGtleTogJ2lzUmVhZCcsIHZhbHVlOiAndHJ1ZScgfSxcblx0XHRcdFx0eyBrZXk6ICdpc1JlYWQnLCB2YWx1ZTogJycgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya3MgdGhlIHBhcmVudCBzZXNzaW9uIHVucmVhZCB3aGVuIGEgc3ViYWdlbnQgdHVybiBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNpZGVFZmZlY3RzOiBwZXJzaXN0aW5nIH0gPSBzZXR1cFBlcnNpc3RpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Ly8gVGhlIHNlc3Npb24gaGFzIGJlZW4gcmVhZCAoZS5nLiBhIGNsaWVudCB2aWV3ZWQgaXQgYWZ0ZXIgdGhlIHBhcmVudFxuXHRcdFx0Ly8gdHVybiBhbHJlYWR5IHByb2R1Y2VkIG91dHB1dCkuIEEgYmFja2dyb3VuZCBzdWJhZ2VudCB0aGVuIGNvbXBsZXRlcy5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBlcnNpc3RpbmcucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHQvLyBTcGF3biBhIHN1YmFnZW50IGNoYXQgb2ZmIGEgcGFyZW50IHRvb2wgY2FsbC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgYWdlbnROYW1lOiAnY29kZS1yZXZpZXdlcicsIGFnZW50RGlzcGxheU5hbWU6ICdDb2RlIFJldmlld2VyJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50VHVybklkID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzdWJhZ2VudFVyaSkhLmFjdGl2ZVR1cm4hLmlkO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShzdWJhZ2VudFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogc3ViYWdlbnRUdXJuSWQsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlYWRDaGFuZ2VzOiByZWFkQ2hhbmdlc0Zyb20oZW52ZWxvcGVzKSxcblx0XHRcdFx0aXNSZWFkQml0U2V0OiAoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkudG9TdHJpbmcoKSkhLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKSAhPT0gMCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVhZENoYW5nZXM6IFtmYWxzZV0sXG5cdFx0XHRcdGlzUmVhZEJpdFNldDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdtYXJrcyBhIHJlYWQgc2Vzc2lvbiB1bnJlYWQgd2hlbiBhIHR1cm4gaXMgY2FuY2VsbGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzaWRlRWZmZWN0czogcGVyc2lzdGluZyB9ID0gc2V0dXBQZXJzaXN0aW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBlcnNpc3RpbmcucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogcmVhZENoYW5nZXNGcm9tKGVudmVsb3BlcyksXG5cdFx0XHRcdGlzUmVhZEJpdFNldDogKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpIS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzUmVhZCkgIT09IDAsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlYWRDaGFuZ2VzOiBbZmFsc2VdLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrcyBhIHJlYWQgc2Vzc2lvbiB1bnJlYWQgd2hlbiBhIHR1cm4gZXJyb3JzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBzaWRlRWZmZWN0czogcGVyc2lzdGluZyB9ID0gc2V0dXBQZXJzaXN0aW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBlcnNpc3RpbmcucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvciwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAsIGVycm9yOiB7IGVycm9yVHlwZTogJ0Vycm9yJywgbWVzc2FnZTogJ2Jvb20nIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVhZENoYW5nZXM6IHJlYWRDaGFuZ2VzRnJvbShlbnZlbG9wZXMpLFxuXHRcdFx0XHRpc1JlYWRCaXRTZXQ6IChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaS50b1N0cmluZygpKSEuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQpICE9PSAwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZWFkQ2hhbmdlczogW2ZhbHNlXSxcblx0XHRcdFx0aXNSZWFkQml0U2V0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBzZXNzaW9uL3R1cm5DYW5jZWxsZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjYWxscyBhYm9ydFNlc3Npb24gb24gdGhlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuYWJvcnRTZXNzaW9uQ2FsbHMsIFtVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogY2hhdC90dXJuU3RhcnRlZCBtb2RlbCBzZWxlY3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBjaGF0L3R1cm5TdGFydGVkIG1vZGVsIHNlbGVjdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NhbGxzIGNoYW5nZU1vZGVsIG9uIHRoZSBhZ2VudCBiZWZvcmUgc2VuZGluZyB0aGUgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIG1vZGVsOiB7IGlkOiAnZ3B0LTUnIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5jaGFuZ2VNb2RlbENhbGxzLCBbeyBzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSwgbW9kZWw6IHsgaWQ6ICdncHQtNScgfSwgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3YWl0cyBmb3IgbW9kZWwgc2VsZWN0aW9uIGJlZm9yZSBzZW5kaW5nIHRoZSBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRsZXQgcmVzb2x2ZUNoYW5nZU1vZGVsITogKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IGNoYW5nZU1vZGVsU2V0dGxlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyByZXNvbHZlQ2hhbmdlTW9kZWwgPSByZXNvbHZlOyB9KTtcblx0XHRcdGxldCByZXNvbHZlU2VuZCE6ICgpID0+IHZvaWQ7XG5cdFx0XHRjb25zdCBzZW5kU3RhcnRlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyByZXNvbHZlU2VuZCA9IHJlc29sdmU7IH0pO1xuXHRcdFx0YWdlbnQuY2hhbmdlTW9kZWwgPSBhc3luYyAoc2Vzc2lvbiwgbW9kZWwsIGNoYXQpID0+IHtcblx0XHRcdFx0YWdlbnQuY2hhbmdlTW9kZWxDYWxscy5wdXNoKHsgc2Vzc2lvbiwgbW9kZWwsIGNoYXQgfSk7XG5cdFx0XHRcdGF3YWl0IGNoYW5nZU1vZGVsU2V0dGxlZDtcblx0XHRcdH07XG5cdFx0XHRhZ2VudC5zZW5kTWVzc2FnZSA9IGFzeW5jIChzZXNzaW9uLCBjaGF0LCBwcm9tcHQsIGF0dGFjaG1lbnRzKSA9PiB7XG5cdFx0XHRcdGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMucHVzaCh7IHNlc3Npb24sIHByb21wdCwgYXR0YWNobWVudHMsIGNoYXQgfSk7XG5cdFx0XHRcdHJlc29sdmVTZW5kKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgbW9kZWw6IHsgaWQ6ICdncHQtNScgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNoYW5nZU1vZGVsQ2FsbHM6IGFnZW50LmNoYW5nZU1vZGVsQ2FsbHMsXG5cdFx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNoYW5nZU1vZGVsQ2FsbHM6IFt7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCBtb2RlbDogeyBpZDogJ2dwdC01JyB9LCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpIH1dLFxuXHRcdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiBbXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXNvbHZlQ2hhbmdlTW9kZWwoKTtcblx0XHRcdGF3YWl0IHNlbmRTdGFydGVkO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCBwcm9tcHQ6ICdoZWxsbycsIGF0dGFjaG1lbnRzOiB1bmRlZmluZWQsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSkgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgdGhlIGNoYXQgY2hhbm5lbCBmb3IgYW4gYWRkaXRpb25hbCAocGVlcikgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgY2hhdENoYW5uZWwgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci0xJyk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oY2hhdENoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgbW9kZWw6IHsgaWQ6ICdncHQtNScgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LmNoYW5nZU1vZGVsQ2FsbHMsIFt7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCBtb2RlbDogeyBpZDogJ2dwdC01JyB9LCBjaGF0OiBVUkkucGFyc2UoY2hhdENoYW5uZWwpIH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBoYW5kbGVBY3Rpb246IGNoYXQvdHVyblN0YXJ0ZWQgYWdlbnQgc2VsZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2hhbmRsZUFjdGlvbiBcdTIwMTQgY2hhdC90dXJuU3RhcnRlZCBhZ2VudCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjYWxscyBjaGFuZ2VBZ2VudCBvbiB0aGUgYWdlbnQgZm9yIHRoZSBzZXNzaW9uIGRlZmF1bHQgY2hhdCBiZWZvcmUgc2VuZGluZyB0aGUgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGFnZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWdlbnRzL3Jldmlld2VyLm1kJyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuY2hhbmdlQWdlbnRDYWxscywgW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIGFnZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWdlbnRzL3Jldmlld2VyLm1kJyB9LCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIHRoZSBjaGF0IGNoYW5uZWwgZm9yIGFuIGFkZGl0aW9uYWwgKHBlZXIpIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGNoYXRDaGFubmVsID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3BlZXItMScpO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGNoYXRDaGFubmVsLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGFnZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWdlbnRzL3Jldmlld2VyLm1kJyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuY2hhbmdlQWdlbnRDYWxscywgW3sgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkudG9TdHJpbmcoKSksIGFnZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWdlbnRzL3Jldmlld2VyLm1kJyB9LCBjaGF0OiBVUkkucGFyc2UoY2hhdENoYW5uZWwpIH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSByZWdpc3RlclByb2dyZXNzTGlzdGVuZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3JlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcicsICgpID0+IHtcblxuXHRcdHRlc3QoJ21hcHMgYWdlbnQgcHJvZ3Jlc3MgZXZlbnRzIHRvIHN0YXRlIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0xJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21zZy0xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRmlyc3QgZGVsdGEgY3JlYXRlcyBhIHJlc3BvbnNlIHBhcnQgKG5vdCBhIGRlbHRhIGFjdGlvbilcblx0XHRcdGFzc2VydC5vayhlbnZlbG9wZXMuc29tZShlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgcm91dGUgc3RhbGUgYWN0aW9ucyBpbnRvIGEgZm9yY2Utc3RhcnRlZCB0dXJuJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDE6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2NvbnRpbnVlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0xJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3N0YWxlLXBhcnQnLCBjb250ZW50OiAnc3RhbGUgcmVzcG9uc2UnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsIHR1cm5JZDogJ3R1cm4tMScsIHVzYWdlOiB7IGlucHV0VG9rZW5zOiAxMDAsIG91dHB1dFRva2VuczogNTAsIG1vZGVsOiAnc3RhbGUtbW9kZWwnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTk5MDI5IH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCB0dXJuSWQ6ICd0dXJuLTInLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnZnJlc2gtcGFydCcsIGNvbnRlbnQ6ICdmcmVzaCcgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXREZWx0YSwgdHVybklkOiAndHVybi0yJywgcGFydElkOiAnZnJlc2gtcGFydCcsIGNvbnRlbnQ6ICcgcmVzcG9uc2UnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLCB0dXJuSWQ6ICd0dXJuLTInLCB1c2FnZTogeyBpbnB1dFRva2VuczogMjAsIG91dHB1dFRva2VuczogMTAsIG1vZGVsOiAnZnJlc2gtbW9kZWwnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTInLCBkdXJhdGlvbjogMjAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlPy50dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRcdGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uLFxuXHRcdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0bWFya2Rvd246IHR1cm4ucmVzcG9uc2VQYXJ0c1xuXHRcdFx0XHRcdC5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pXG5cdFx0XHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQuY29udGVudClcblx0XHRcdFx0XHQuam9pbignJyksXG5cdFx0XHRcdHVzYWdlOiB0dXJuLnVzYWdlLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRpZDogJ3R1cm4tMScsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdFx0bWVzc2FnZTogJ2hlbGxvJyxcblx0XHRcdFx0bWFya2Rvd246ICcnLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogJ3R1cm4tMicsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdGR1cmF0aW9uOiAyMDAwLFxuXHRcdFx0XHRtZXNzYWdlOiAnY29udGludWUnLFxuXHRcdFx0XHRtYXJrZG93bjogJ2ZyZXNoIHJlc3BvbnNlJyxcblx0XHRcdFx0dXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDIwLCBvdXRwdXRUb2tlbnM6IDEwLCBtb2RlbDogJ2ZyZXNoLW1vZGVsJyB9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHRoZSB0dXJuIGlkIG9mIGEgcHJvdmlkZXItaW5pdGlhdGVkIHR1cm4gd2hlbiBpZGxlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0XHR0dXJuSWQ6ICdwcm92aWRlci10dXJuJyxcblx0XHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAxOjAwLjAwMFonLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3Byb3ZpZGVyIG5vdGlmaWNhdGlvbicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb24gfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3Byb3ZpZGVyLXR1cm4nLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncHJvdmlkZXItcGFydCcsIGNvbnRlbnQ6ICdwcm92aWRlciByZXNwb25zZScgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dHVybklkOiBzdGF0ZT8uYWN0aXZlVHVybj8uaWQsXG5cdFx0XHRcdG1lc3NhZ2U6IHN0YXRlPy5hY3RpdmVUdXJuPy5tZXNzYWdlLnRleHQsXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IHN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0dXJuSWQ6ICdwcm92aWRlci10dXJuJyxcblx0XHRcdFx0bWVzc2FnZTogJ3Byb3ZpZGVyIG5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncHJvdmlkZXItcGFydCcsIGNvbnRlbnQ6ICdwcm92aWRlciByZXNwb25zZScgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlcGxhY2UgYW4gYWN0aXZlIHR1cm4gd2l0aCBhIHN0YWxlIHR1cm4gc3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0yJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3N0YWxlIHJlcXVlc3QnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHR1cm5JZDogc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShkZWZhdWx0Q2hhdFVyaSk/LmFjdGl2ZVR1cm4/LmlkLFxuXHRcdFx0XHRtZXNzYWdlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGRlZmF1bHRDaGF0VXJpKT8uYWN0aXZlVHVybj8ubWVzc2FnZS50ZXh0LFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRtZXNzYWdlOiAnaGVsbG8nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGFsZSBjb21wbGV0aW9uIGRvZXMgbm90IGNsZWFyIGFjdGl2ZSB0dXJuIHRvb2wgdHJhY2tpbmcnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMTowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnY29udGludWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdhY3RpdmUtdG9vbCcsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxOTkwMjkgfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdhY3RpdmUtdG9vbCcsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIGZpbGUnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5ldmVudHMuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LmV2ZW50TmFtZSA9PT0gJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcpLm1hcChldmVudCA9PiBldmVudC5ldmVudE5hbWUpLFxuXHRcdFx0XHRbJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCddLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYSBkaXNwb3NhYmxlIHRoYXQgc3RvcHMgbGlzdGVuaW5nJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdiZWZvcmUnIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpLmxlbmd0aCwgMSk7XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0xJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21zZy0yJywgY29udGVudDogJ2FmdGVyJyB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KS5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3VzdG9taXphdGlvbnMgY2hhbmdlIHB1Ymxpc2hlcyBvbmNlLCB0aGVuIGRlZHVwZXMgaWRlbnRpY2FsIHJlLWZldGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Ly8gUmV0dXJuIGEgZnJlc2hseS1idWlsdCBhcnJheSBvZiBmcmVzaGx5LWJ1aWx0IG9iamVjdHMgb24gZXZlcnlcblx0XHRcdC8vIGZldGNoIChtYXRjaGluZyByZWFsIHByb3ZpZGVycywgd2hpY2ggcmUtc2NhbiBkaXNrIGVhY2ggdGltZSkgc29cblx0XHRcdC8vIHRoZSBkZWR1cCBpcyBwcm92ZW4gdG8gcmVseSBvbiBzdHJ1Y3R1cmFsIGVxdWFsaXR5LCBub3QgcmVmZXJlbmNlXG5cdFx0XHQvLyBpZGVudGl0eS5cblx0XHRcdGNvbnN0IG1ha2VDdXN0b21pemF0aW9ucyA9ICgpOiBDdXN0b21pemF0aW9uW10gPT4gW1xuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgZW5hYmxlZDogdHJ1ZSwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGxldCBmZXRjaENhbGxzID0gMDtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IHsgZmV0Y2hDYWxscysrOyByZXR1cm4gbWFrZUN1c3RvbWl6YXRpb25zKCk7IH07XG5cblx0XHRcdGNvbnN0IGNoYW5nZWQ6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpIHtcblx0XHRcdFx0XHRjaGFuZ2VkLnB1c2goZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gRmlyc3QgY2hhbmdlOiBmZXRjaCArIHB1Ymxpc2guXG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGNoYW5nZWQubGVuZ3RoID49IDEgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIFN1YnNlcXVlbnQgY2hhbmdlcyB0aGF0IHJlc29sdmUgdG8gc3RydWN0dXJhbGx5LWVxdWFsIGN1c3RvbWl6YXRpb25zXG5cdFx0XHQvLyAoZS5nLiB0aGUgTyhOXjIpIGZhbi1vdXQgZnJvbSBhIHNoYXJlZCBgfi8uY2xhdWRlYCBlZGl0KSBtdXN0IG5vdFxuXHRcdFx0Ly8gcmUtcHVibGlzaCwgZXZlbiB0aG91Z2ggZWFjaCBmZXRjaCByZXR1cm5zIGEgYnJhbmQtbmV3IGFycmF5LlxuXHRcdFx0YWdlbnQuZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlKCk7XG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIDUwMDA7XG5cdFx0XHR3aGlsZSAoZmV0Y2hDYWxscyA8IDMgJiYgRGF0ZS5ub3coKSA8IGRlYWRsaW5lKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDEsICdpZGVudGljYWwgY3VzdG9taXphdGlvbnMgbXVzdCBub3QgcmUtcHVibGlzaCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZldGNoQ2FsbHMgPj0gMywgJ2VhY2ggY2hhbmdlIHN0aWxsIHJlLWZldGNoZXMgdG8gY29tcGFyZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtcHVibGlzaGVzIGFmdGVyIHNlc3Npb24gZXZpY3Rpb24gKyByZXN0b3JlIGV2ZW4gd2hlbiBjdXN0b21pemF0aW9ucyBhcmUgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IG1ha2VDdXN0b21pemF0aW9ucyA9ICgpOiBDdXN0b21pemF0aW9uW10gPT4gW1xuXHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgZW5hYmxlZDogdHJ1ZSwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9LFxuXHRcdFx0XTtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IG1ha2VDdXN0b21pemF0aW9ucygpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Y2hhbmdlZC5wdXNoKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIEluaXRpYWwgcHVibGlzaCBwb3B1bGF0ZXMgdGhlIHNlc3Npb24gc3RhdGUncyBjdXN0b21pemF0aW9ucy5cblx0XHRcdGFnZW50LmZpcmVDdXN0b21pemF0aW9uc0NoYW5nZSgpO1xuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gY2hhbmdlZC5sZW5ndGggPj0gMSB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gSWRsZS1ldmljdCB0aGVuIHJlc3RvcmUgdGhlIHNhbWUgc2Vzc2lvbiBVUkk6IHRoZSByZXN0b3JlZCBzdGF0ZVxuXHRcdFx0Ly8gc3RhcnRzIHdpdGhvdXQgY3VzdG9taXphdGlvbnMuIEJlY2F1c2UgZGVkdXAgY29tcGFyZXMgYWdhaW5zdCB0aGVcblx0XHRcdC8vIGF1dGhvcml0YXRpdmUgc2Vzc2lvbiBzdGF0ZSAobm90IGEgc3RhbGUgc2lkZSBjYWNoZSksIHRoZSBuZXh0XG5cdFx0XHQvLyByZWZyZXNoIG11c3QgcHVibGlzaCBhZ2FpbiBldmVuIHRob3VnaCB0aGUgcmVzb2x2ZWQgc2V0IGlzXG5cdFx0XHQvLyBzdHJ1Y3R1cmFsbHkgaWRlbnRpY2FsIHRvIHRoZSBwcmlvciBpbmNhcm5hdGlvbidzLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRhZ2VudC5maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2UoKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGNoYW5nZWQubGVuZ3RoID49IDIgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMiwgJ3Jlc3RvcmVkIHNlc3Npb24gbXVzdCByZWNlaXZlIGl0cyBjdXN0b21pemF0aW9ucycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGFnZW50cyBvYnNlcnZhYmxlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2FnZW50cyBvYnNlcnZhYmxlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZGlzcGF0Y2hlcyByb290L2FnZW50c0NoYW5nZWQgd2l0aG91dCBmZXRjaGluZyBtb2RlbHMgd2hlbiBvYnNlcnZhYmxlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhZ2VudExpc3Quc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZSwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlLmFjdGlvbi5hZ2VudHMubGVuZ3RoID09PSAxO1xuXHRcdFx0fSkpO1xuXHRcdFx0YWdlbnRMaXN0LnNldChbYWdlbnRdLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgeyBhY3Rpb24gfSA9IGF3YWl0IGVudmVsb3BlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbi50eXBlLCBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uYWdlbnRzWzBdLm1vZGVscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgb2JzZXJ2YWJsZSB1cGRhdGUgcHVibGlzaGVzIG1vZGVscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5Sb290QWdlbnRzQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZS5hY3Rpb24uYWdlbnRzWzBdPy5tb2RlbHMubGVuZ3RoID09PSAxO1xuXHRcdFx0fSkpO1xuXHRcdFx0YWdlbnQuc2V0TW9kZWxzKFt7IHByb3ZpZGVyOiAnbW9jaycsIGlkOiAnbW9jay1tb2RlbCcsIG5hbWU6ICdtb2NrIE1vZGVsJywgbWF4Q29udGV4dFdpbmRvdzogMTI4MDAwLCBtYXhPdXRwdXRUb2tlbnM6IDE2MDAwLCBtYXhQcm9tcHRUb2tlbnM6IDExMjAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlIH1dKTtcblx0XHRcdGF3YWl0IGVudmVsb3BlO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZW52ZWxvcGVzLm1hcChlID0+IGUuYWN0aW9uKS5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGFjdGlvbnNbYWN0aW9ucy5sZW5ndGggLSAxXTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb24sICdzaG91bGQgZGlzcGF0Y2ggcm9vdC9hZ2VudHNDaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbi5hZ2VudHNbMF0ubW9kZWxzLCBbe1xuXHRcdFx0XHRpZDogJ21vY2stbW9kZWwnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRuYW1lOiAnbW9jayBNb2RlbCcsXG5cdFx0XHRcdG1heENvbnRleHRXaW5kb3c6IDEyODAwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxNjAwMCxcblx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiAxMTIwMDAsXG5cdFx0XHRcdHN1cHBvcnRzVmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0cG9saWN5U3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlnU2NoZW1hOiB1bmRlZmluZWQsXG5cdFx0XHRcdF9tZXRhOiB1bmRlZmluZWQsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBvYnNlcnZhYmxlIHVwZGF0ZSBwdWJsaXNoZXMgbW9kZWwgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlLCBlID0+IHtcblx0XHRcdFx0aWYgKGUuYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGUuYWN0aW9uLmFnZW50c1swXT8ubW9kZWxzLmxlbmd0aCA9PT0gMTtcblx0XHRcdH0pKTtcblx0XHRcdGFnZW50LnNldE1vZGVscyhbeyBwcm92aWRlcjogJ21vY2snLCBpZDogJ21vY2stbW9kZWwnLCBuYW1lOiAnbW9jayBNb2RlbCcsIG1heENvbnRleHRXaW5kb3c6IDEyODAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlLCBfbWV0YTogeyBtdWx0aXBsaWVyTnVtZXJpYzogMiB9IH1dKTtcblxuXHRcdFx0Y29uc3QgeyBhY3Rpb24gfSA9IGF3YWl0IGVudmVsb3BlO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uLnR5cGUsIEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb24uYWdlbnRzWzBdLm1vZGVsc1swXS5fbWV0YSwgeyBtdWx0aXBsaWVyTnVtZXJpYzogMiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuY2hhbmdlZCBtb2RlbCBvYnNlcnZhYmxlIHVwZGF0ZSBkb2VzIG5vdCBkaXNwYXRjaCB1bmNoYW5nZWQgYWdlbnQgaW5mb3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gW3sgcHJvdmlkZXI6ICdtb2NrJyBhcyBjb25zdCwgaWQ6ICdtb2NrLW1vZGVsJywgbmFtZTogJ21vY2sgTW9kZWwnLCBtYXhDb250ZXh0V2luZG93OiAxMjgwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9XTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGUgPSBFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZSwgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlLmFjdGlvbi5hZ2VudHNbMF0/Lm1vZGVscy5sZW5ndGggPT09IDE7XG5cdFx0XHR9KSk7XG5cdFx0XHRhZ2VudC5zZXRNb2RlbHMobW9kZWxzKTtcblx0XHRcdGF3YWl0IGVudmVsb3BlO1xuXHRcdFx0ZW52ZWxvcGVzLmxlbmd0aCA9IDA7XG5cdFx0XHRhZ2VudC5zZXRNb2RlbHMoWy4uLm1vZGVsc10pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RBZ2VudHNDaGFuZ2VkKS5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFBlbmRpbmcgbWVzc2FnZSBzeW5jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3BlbmRpbmcgbWVzc2FnZSBzeW5jJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3luY3Mgc3RlZXJpbmcgbWVzc2FnZSB0byBhZ2VudCBvbiBDaGF0UGVuZGluZ01lc3NhZ2VTZXQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogJ3N0ZWVyLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdmb2N1cyBvbiB0ZXN0cycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5zdGVlcmluZ01lc3NhZ2UsIHsgaWQ6ICdzdGVlci0xJywgbWVzc2FnZTogeyB0ZXh0OiAnZm9jdXMgb24gdGVzdHMnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzWzBdLnF1ZXVlZE1lc3NhZ2VzLCBbXSk7XG5cdFx0XHQvLyBTdGVlcmluZyBpcyBhbHdheXMgYWRkcmVzc2VkIGJ5IGEgY29uY3JldGUgY2hhdCBjaGFubmVsIFVSSS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5jaGF0LnRvU3RyaW5nKCksIGRlZmF1bHRDaGF0VXJpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIGEgcGVlciBjaGF0IHN0ZWVyaW5nIG1lc3NhZ2UgYWRkcmVzc2VkIGJ5IHRoZSBwZWVyIGNoYXQgVVJJJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci1zdGVlcicpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGVlckNoYXRVcmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aWQ6ICdzdGVlci1wZWVyJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc3RlZXIgdGhlIHBlZXInLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKHBlZXJDaGF0VXJpLnRvU3RyaW5nKCksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24ocGVlckNoYXRVcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhdDogYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0uY2hhdC50b1N0cmluZygpLFxuXHRcdFx0XHRzdGVlcmluZ0lkOiBhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5zdGVlcmluZ01lc3NhZ2U/LmlkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGF0OiBwZWVyQ2hhdFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRzdGVlcmluZ0lkOiAnc3RlZXItcGVlcicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bmNzIHF1ZXVlZCBtZXNzYWdlIGFuZCBwcmVzZXJ2ZXMgdGhlIGVucXVldWluZyBjbGllbnQgYXR0cmlidXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdxdWV1ZWQgbWVzc2FnZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgJ2NsaWVudC1lZGl0b3InLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyk7XG5cblx0XHRcdC8vIFF1ZXVlZCBtZXNzYWdlcyBhcmUgbm90IGZvcndhcmRlZCB0byB0aGUgYWdlbnQ7IHRoZSBzZXJ2ZXIgY29udHJvbHMgY29uc3VtcHRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzWzBdLnN0ZWVyaW5nTWVzc2FnZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0ucXVldWVkTWVzc2FnZXMsIFtdKTtcblxuXHRcdFx0Ly8gU2Vzc2lvbiB3YXMgaWRsZSwgc28gdGhlIHF1ZXVlZCBtZXNzYWdlIGlzIGNvbnN1bWVkIGltbWVkaWF0ZWx5XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXSwge1xuXHRcdFx0XHRzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0cHJvbXB0OiAncXVldWVkIG1lc3NhZ2UnLFxuXHRcdFx0XHRhdHRhY2htZW50czogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZW5kZXJDbGllbnRJZDogJ2NsaWVudC1lZGl0b3InLFxuXHRcdFx0XHRjbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBxdWV1ZWQgcHJvdG9jb2wgYXR0YWNobWVudCBVUkkgc3RyaW5ncyBiZWZvcmUgcGFzc2luZyB0aGVtIHRvIHRoZSBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3F1ZXVlZC50cycpO1xuXHRcdFx0Y29uc3QgYWN0aW9uOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLXVyaScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3F1ZXVlZCBtZXNzYWdlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYXR0YWNobWVudHM6IFt7IHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSwgdXJpOiBmaWxlVXJpLnRvU3RyaW5nKCksIGxhYmVsOiAncXVldWVkLnRzJywgZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcgfV0gfSxcblx0XHRcdH07XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwcm9tcHQ6ICdxdWV1ZWQgbWVzc2FnZScsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbeyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogZmlsZVVyaS50b1N0cmluZygpLCBsYWJlbDogJ3F1ZXVlZC50cycsIGRpc3BsYXlLaW5kOiAnZG9jdW1lbnQnIH1dLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbG9ncyB0ZWxlbWV0cnkgd2hlbiBzZW5kaW5nIGEgcXVldWVkIHVzZXIgbWVzc2FnZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3EtdGVsZW1ldHJ5Jyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncXVldWVkIG1lc3NhZ2UnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdhZ2VudEhvc3QudXNlck1lc3NhZ2VTZW50Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ3Vua25vd24nLFxuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdxdWV1ZWQnLFxuXHRcdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0XHR0dXJuQ291bnQ6IDAsXG5cdFx0XHRcdFx0YXR0YWNobWVudENvdW50OiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luY3Mgb24gQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHQvLyBBZGQgYSBxdWV1ZWQgbWVzc2FnZVxuXHRcdFx0Y29uc3Qgc2V0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLXJtJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnd2lsbCBiZSByZW1vdmVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblxuXHRcdFx0YWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdFx0Ly8gUmVtb3ZlXG5cdFx0XHRjb25zdCByZW1vdmVBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLXJtJyxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHJlbW92ZUFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHJlbW92ZUFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZXRQZW5kaW5nTWVzc2FnZXNDYWxsc1swXS5xdWV1ZWRNZXNzYWdlcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3luY3Mgb24gQ2hhdFF1ZXVlZE1lc3NhZ2VzUmVvcmRlcmVkJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdC8vIEFkZCB0d28gcXVldWVkIG1lc3NhZ2VzXG5cdFx0XHRjb25zdCBzZXRBID0geyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCwga2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCwgaWQ6ICdxLWEnLCBtZXNzYWdlOiB7IHRleHQ6ICdBJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEEsIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBKTtcblxuXHRcdFx0Y29uc3Qgc2V0QiA9IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsIGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsIGlkOiAncS1iJywgbWVzc2FnZTogeyB0ZXh0OiAnQicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSB9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRCLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMiB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0Qik7XG5cblx0XHRcdGFnZW50LnNldFBlbmRpbmdNZXNzYWdlc0NhbGxzLmxlbmd0aCA9IDA7XG5cblx0XHRcdC8vIFJlb3JkZXJcblx0XHRcdGNvbnN0IHJlb3JkZXJBY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFF1ZXVlZE1lc3NhZ2VzUmVvcmRlcmVkIGFzIGNvbnN0LCBvcmRlcjogWydxLWInLCAncS1hJ10gfTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgcmVvcmRlckFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDMgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHJlb3JkZXJBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2V0UGVuZGluZ01lc3NhZ2VzQ2FsbHNbMF0ucXVldWVkTWVzc2FnZXMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBRdWV1ZWQgbWVzc2FnZSBjb25zdW1wdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdxdWV1ZWQgbWVzc2FnZSBjb25zdW1wdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2F1dG8tc3RhcnRzIHR1cm4gZnJvbSBxdWV1ZWQgbWVzc2FnZSBvbiBpZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFF1ZXVlIGEgbWVzc2FnZSB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlXG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3Qgc2V0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdxLWF1dG8nLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhdXRvIHF1ZXVlZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbik7XG5cblx0XHRcdC8vIE1lc3NhZ2Ugc2hvdWxkIE5PVCBiZSBjb25zdW1lZCB5ZXQgKHR1cm4gaXMgYWN0aXZlKVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Ly8gRmlyZSBpZGxlIFx1MjE5MiB0dXJuIGNvbXBsZXRlcyBcdTIxOTIgcXVldWVkIG1lc3NhZ2Ugc2hvdWxkIGJlIGNvbnN1bWVkXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybkNvbXBsZXRlID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUpO1xuXHRcdFx0YXNzZXJ0Lm9rKHR1cm5Db21wbGV0ZSwgJ3Nob3VsZCBkaXNwYXRjaCBzZXNzaW9uL3R1cm5Db21wbGV0ZScpO1xuXG5cdFx0XHRjb25zdCB0dXJuU3RhcnRlZCA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHR1cm5TdGFydGVkLCAnc2hvdWxkIGRpc3BhdGNoIHNlc3Npb24vdHVyblN0YXJ0ZWQgZm9yIHF1ZXVlZCBtZXNzYWdlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHR1cm5TdGFydGVkIS5hY3Rpb24gYXMgeyBxdWV1ZWRNZXNzYWdlSWQ/OiBzdHJpbmcgfSkucXVldWVkTWVzc2FnZUlkLCAncS1hdXRvJyk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTZW5kTWVzc2FnZUNhbGxzKDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzWzBdLnByb21wdCwgJ2F1dG8gcXVldWVkJyk7XG5cblx0XHRcdC8vIFF1ZXVlZCBtZXNzYWdlIHNob3VsZCBiZSByZW1vdmVkIGZyb20gc3RhdGVcblx0XHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5xdWV1ZWRNZXNzYWdlcywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dhaXRzIGZvciBwZW5kaW5nIHN0ZWVyaW5nIGJlZm9yZSBjb25zdW1pbmcgYSBxdWV1ZWQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLW9yaWdpbmFsJyk7XG5cblx0XHRcdGNvbnN0IHF1ZXVlZEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncXVldWVkLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdxdWV1ZWQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBxdWV1ZWRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBxdWV1ZWRBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCBzdGVlcmluZ0FjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aWQ6ICdzdGVlcmluZy0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc3RlZXJpbmcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzdGVlcmluZ0FjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHN0ZWVyaW5nQWN0aW9uKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLW9yaWdpbmFsJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLCAwLCAncXVldWVkIG1lc3NhZ2UgbXVzdCB3YWl0IGZvciBzdGVlcmluZyB0byBzdGFydCcpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHRcdHR1cm5JZDogJ3R1cm4tc3RlZXJpbmcnLFxuXHRcdFx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHN0ZWVyaW5nQWN0aW9uLm1lc3NhZ2UsXG5cdFx0XHRcdFx0cXVldWVkTWVzc2FnZUlkOiBzdGVlcmluZ0FjdGlvbi5pZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLXN0ZWVyaW5nJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5tYXAoY2FsbCA9PiBjYWxsLnByb21wdCksIFsncXVldWVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZHJhaW4gcXVldWVkIG1lc3NhZ2VzIHdoZW4gdGhlIGNhbmNlbGxlZCB0dXJuIGNvbXBsZXRlcyBsYXRlJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ2FuY2VsbGluZyBhIHR1cm4gbWVhbnMgXCJzdG9wXCI6IG1lc3NhZ2VzIHF1ZXVlZCBiZWhpbmQgaXQgbXVzdCBzdGF5XG5cdFx0XHQvLyBxdWV1ZWQgZm9yIHRoZSB1c2VyIHRvIGRlcXVldWUvcnVuIG1hbnVhbGx5LCBub3QgYXV0by1zdGFydC4gKEFcblx0XHRcdC8vIG1lc3NhZ2UgdGhlIHVzZXIgc2VuZHMgKmFmdGVyKiB0aGUgYWJvcnQgaXMgY29uc3VtZWQgc2VwYXJhdGVseSB2aWFcblx0XHRcdC8vIHRoZSBDaGF0UGVuZGluZ01lc3NhZ2VTZXQgcGF0aCBvbmNlIGNhbmNlbGxhdGlvbiBjbGVhcnMgdGhlIHR1cm4uKVxuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFF1ZXVlIGEgbWVzc2FnZSB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlLlxuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQgYXMgY29uc3QsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdGlkOiAncS1hZnRlci1hYm9ydCcsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3F1ZXVlZCBiZWhpbmQgYWJvcnQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24pO1xuXG5cdFx0XHQvLyBOb3QgY29uc3VtZWQgeWV0IFx1MjAxNCB0aGUgdHVybiBpcyBzdGlsbCBhY3RpdmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsIDApO1xuXG5cdFx0XHQvLyBDYW5jZWwgdGhlIGFjdGl2ZSB0dXJuIChjbGllbnQgYWJvcnQpLlxuXHRcdFx0Y29uc3QgY2FuY2VsQWN0aW9uID0geyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkIGFzIGNvbnN0LCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjYW5jZWxBY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAyIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBjYW5jZWxBY3Rpb24pO1xuXG5cdFx0XHRjb25zdCB0cnVuY2F0ZUFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkIGFzIGNvbnN0IH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHRydW5jYXRlQWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMyB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgdHJ1bmNhdGVBY3Rpb24pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAyMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGhlIHF1ZXVlZCBtZXNzYWdlIG11c3QgTk9UIGF1dG8tc3RhcnQsIGFuZCBtdXN0IHJlbWFpbiBxdWV1ZWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxscy5sZW5ndGgsIDAsICdjYW5jZWxsaW5nIG11c3Qgbm90IGRyYWluIHF1ZXVlZCBtZXNzYWdlcycpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnR1cm5zLmxlbmd0aCwgMCwgJ3RoZSBjYW5jZWxsZWQgdHVybiBzaG91bGQgbm8gbG9uZ2VyIGJlIHJldGFpbmVkIGluIGhpc3RvcnknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ucXVldWVkTWVzc2FnZXM/Lmxlbmd0aCwgMSwgJ3F1ZXVlZCBtZXNzYWdlIHNob3VsZCByZW1haW4gZm9yIG1hbnVhbCBkZXF1ZXVlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnF1ZXVlZE1lc3NhZ2VzPy5bMF0uaWQsICdxLWFmdGVyLWFib3J0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnRlcmNlcHRzIHF1ZXVlZCAvcmVuYW1lIGFuZCBkcmFpbnMgdGhlIG1lc3NhZ2UgcXVldWVkIGJlaGluZCBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Ly8gYC9yZW5hbWVgIHBlcnNpc3RzIHRoZSBuZXcgdGl0bGUsIHNvIHVzZSBhIHNpZGUgZWZmZWN0cyBpbnN0YW5jZVxuXHRcdFx0Ly8gd2hvc2UgYG9wZW5EYXRhYmFzZWAgcmV0dXJucyBhIHJlYWwgZGF0YWJhc2UgKHRoZSBzdWl0ZSBkZWZhdWx0XG5cdFx0XHQvLyB0aHJvd3MpLlxuXHRcdFx0Y29uc3QgcmVuYW1lU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVuYW1lU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFF1ZXVlIGEgYC9yZW5hbWVgIGZvbGxvd2VkIGJ5IGEgbm9ybWFsIG1lc3NhZ2Ugd2hpbGUgYSB0dXJuIGlzIGFjdGl2ZVxuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGZvciAoY29uc3QgbXNnIG9mIFtcblx0XHRcdFx0eyBpZDogJ3EtcmVuYW1lJywgdGV4dDogJy9yZW5hbWUgUXVldWVkIFRpdGxlJyB9LFxuXHRcdFx0XHR7IGlkOiAncS1hZnRlcicsIHRleHQ6ICdhZnRlciByZW5hbWUnIH0sXG5cdFx0XHRdKSB7XG5cdFx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRcdGlkOiBtc2cuaWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiBtc2cudGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRcdHJlbmFtZVNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlyZSBpZGxlIFx1MjE5MiB0dXJuIGNvbXBsZXRlcyBcdTIxOTIgYC9yZW5hbWVgIGlzIGNvbnN1bWVkIGFuZCBpbnRlcmNlcHRlZCxcblx0XHRcdC8vIHRoZW4gdGhlIG1lc3NhZ2UgcXVldWVkIGJlaGluZCBpdCBtdXN0IGJlIGRyYWluZWQgdG8gdGhlIGFnZW50LlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSBgL3JlbmFtZWAgbXVzdCBub3QgcmVhY2ggdGhlIGFnZW50OyBvbmx5IHRoZSBtZXNzYWdlIGJlaGluZCBpdCBkb2VzXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5wcm9tcHQsICdhZnRlciByZW5hbWUnKTtcblxuXHRcdFx0Ly8gQm90aCBxdWV1ZWQgbWVzc2FnZXMgc2hvdWxkIGJlIGRyYWluZWQgZnJvbSBzdGF0ZVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnF1ZXVlZE1lc3NhZ2VzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy50aXRsZSwgJ1F1ZXVlZCBUaXRsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgYSBxdWV1ZWQgYmFuZyBjb21tYW5kIHRpdGxlIHdpdGggdGhlIGZvbGxvd2luZyByZWFsIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbE1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoKSk7XG5cdFx0XHRjb25zdCBxdWV1ZWRTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKGRiKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRlcm1pbmFsTWFuYWdlcik7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVldWVkU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRmb3IgKGNvbnN0IFtpZCwgdGV4dF0gb2YgW1sncS1jb21tYW5kJywgJyFlY2hvIGhpJ10sIFsncS1yZXF1ZXN0JywgJ0V4cGxhaW4gdGhlIGJ1aWxkJ11dIGFzIGNvbnN0KSB7XG5cdFx0XHRcdGNvbnN0IHNldEFjdGlvbiA9IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRcdHF1ZXVlZFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbE1hbmFnZXIuY29tbWFuZEZpbmlzaGVkTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0XHR0ZXJtaW5hbE1hbmFnZXIuZmlyZUNvbW1hbmRGaW5pc2hlZCh7IGNvbW1hbmRJZDogJzEnLCBjb21tYW5kOiAnZWNobyBoaScsIGV4aXRDb2RlOiAwLCBvdXRwdXQ6ICdoaVxcbicgfSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU2VuZE1lc3NhZ2VDYWxscygxKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHByb21wdDogYWdlbnQuc2VuZE1lc3NhZ2VDYWxsc1swXS5wcm9tcHQsXG5cdFx0XHRcdHRpdGxlOiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LnRpdGxlLFxuXHRcdFx0XHRwZXJzaXN0ZWRUaXRsZTogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHByb21wdDogJ0V4cGxhaW4gdGhlIGJ1aWxkJyxcblx0XHRcdFx0dGl0bGU6ICdFeHBsYWluIHRoZSBidWlsZCcsXG5cdFx0XHRcdHBlcnNpc3RlZFRpdGxlOiAnRXhwbGFpbiB0aGUgYnVpbGQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcmFpbnMgYSBwZWVyIGNoYXQgcXVldWVkIG1lc3NhZ2UgdG8gdGhlIG93bmluZyBzZXNzaW9uIHdpdGggdGhlIGNoYXQgYXJnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1xJykpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBjaGF0VXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTdGFydCBhIHR1cm4gb24gdGhlIHBlZXIgY2hhdCwgdGhlbiBxdWV1ZSBhIG1lc3NhZ2UgYmVoaW5kIGl0LlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYXRVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCwgdHVybklkOiAncHR1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsIG1lc3NhZ2U6IHsgdGV4dDogJ2hpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IH0sXG5cdFx0XHRcdHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0Y29uc3Qgc2V0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdFx0aWQ6ICdwcS0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncGVlciBxdWV1ZWQnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYXRVcmkudG9TdHJpbmcoKSwgc2V0QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMiB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihjaGF0VXJpLnRvU3RyaW5nKCksIHNldEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRcdC8vIElkbGUgb24gdGhlIHBlZXIgY2hhdCBcdTIxOTIgdGhlIHF1ZXVlZCBtZXNzYWdlIGRyYWlucyB0byB0aGUgcGFyZW50XG5cdFx0XHQvLyBzZXNzaW9uIFVSSSB3aXRoIHRoZSBjaGF0IGNoYW5uZWwgcGFzc2VkIGFzIHRoZSBgY2hhdGAgYXJndW1lbnRcblx0XHRcdC8vIHNvIHRoZSBoYXJuZXNzIHJvdXRlcyBpdCB0byB0aGUgcmlnaHQgcGVlciBTREsgY2hhdC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogY2hhdFVyaSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAncHR1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclNlbmRNZXNzYWdlQ2FsbHMoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMsIFt7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRwcm9tcHQ6ICdwZWVyIHF1ZXVlZCcsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNoYXQ6IFVSSS5wYXJzZShjaGF0VXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY29uc3VtZSBxdWV1ZWQgbWVzc2FnZSB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBzZXRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0IGFzIGNvbnN0LFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3Etd2FpdCcsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3Nob3VsZCB3YWl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uLCB7IGNsaWVudElkOiAndGVzdCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgc2V0QWN0aW9uKTtcblxuXHRcdFx0Ly8gTm8gdHVybiBzdGFydGVkIGZvciB0aGUgcXVldWVkIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IHR1cm5TdGFydGVkID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVyblN0YXJ0ZWQsIHVuZGVmaW5lZCwgJ3Nob3VsZCBub3Qgc3RhcnQgYSB0dXJuIHdoaWxlIG9uZSBpcyBhY3RpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5zZW5kTWVzc2FnZUNhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRcdC8vIFF1ZXVlZCBtZXNzYWdlIHN0aWxsIGluIHN0YXRlXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8ucXVldWVkTWVzc2FnZXM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnF1ZXVlZE1lc3NhZ2VzPy5bMF0uaWQsICdxLXdhaXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3BhdGNoZXMgQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZCBmb3Igc3RlZXJpbmcgbWVzc2FnZXMgb24gc3RlZXJpbmdfY29uc3VtZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCBhcyBjb25zdCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogJ3N0ZWVyLXJtJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc3RlZXIgbWUnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9O1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBSZW1vdmFsIGlzIG5vdCBkaXNwYXRjaGVkIHN5bmNocm9ub3VzbHk7IGl0IHdhaXRzIGZvciB0aGUgYWdlbnRcblx0XHRcdGxldCByZW1vdmFsID0gZW52ZWxvcGVzLmZpbmQoZSA9PlxuXHRcdFx0XHRlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQgJiZcblx0XHRcdFx0KGUuYWN0aW9uIGFzIHsga2luZDogUGVuZGluZ01lc3NhZ2VLaW5kIH0pLmtpbmQgPT09IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmFsLCB1bmRlZmluZWQsICdzaG91bGQgbm90IGRpc3BhdGNoIHJlbW92YWwgdW50aWwgc3RlZXJpbmdfY29uc3VtZWQnKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIGFnZW50IGNvbnN1bWluZyB0aGUgc3RlZXJpbmcgbWVzc2FnZVxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N0ZWVyaW5nX2NvbnN1bWVkJyxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0aWQ6ICdzdGVlci1ybScsXG5cdFx0XHR9KTtcblxuXHRcdFx0cmVtb3ZhbCA9IGVudmVsb3Blcy5maW5kKGUgPT5cblx0XHRcdFx0ZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkICYmXG5cdFx0XHRcdChlLmFjdGlvbiBhcyB7IGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZCB9KS5raW5kID09PSBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2socmVtb3ZhbCwgJ3Nob3VsZCBkaXNwYXRjaCBDaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkIGZvciBzdGVlcmluZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZW1vdmFsIS5hY3Rpb24gYXMgeyBpZDogc3RyaW5nIH0pLmlkLCAnc3RlZXItcm0nKTtcblxuXHRcdFx0Ly8gU3RlZXJpbmcgbWVzc2FnZSBzaG91bGQgYmUgcmVtb3ZlZCBmcm9tIHN0YXRlXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8uc3RlZXJpbmdNZXNzYWdlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogc2Vzc2lvbi9hY3RpdmVDbGllbnRTZXQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IHNlc3Npb24vYWN0aXZlQ2xpZW50U2V0JywgKCkgPT4ge1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FsbHMgc2V0Q2xpZW50Q3VzdG9taXphdGlvbnMgYW5kIGRpc3BhdGNoZXMgY3VzdG9taXphdGlvbnNDaGFuZ2VkIG9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHBsdWdpbkE6IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgZW5hYmxlZDogdHJ1ZSwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9O1xuXHRcdFx0Y29uc3QgcGx1Z2luQjogQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1iJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWInLCBuYW1lOiAnUGx1Z2luIEInLCBlbmFibGVkOiB0cnVlLCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9IH07XG5cdFx0XHRjb25zdCBwbHVnaW5BQ2xpZW50OiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uID0geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBwbHVnaW5BLmlkLCB1cmk6IHBsdWdpbkEudXJpLCBuYW1lOiBwbHVnaW5BLm5hbWUsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHRcdGNvbnN0IHBsdWdpbkJDbGllbnQ6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IHBsdWdpbkIuaWQsIHVyaTogcGx1Z2luQi51cmksIG5hbWU6IHBsdWdpbkIubmFtZSwgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbkEsIHBsdWdpbkJdO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25BY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbcGx1Z2luQUNsaWVudCwgcGx1Z2luQkNsaWVudF1cblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXG5cdFx0XHQvLyBXYWl0IGZvciBhc3luYyBzZXRDbGllbnRDdXN0b21pemF0aW9uc1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDUwKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQuc2V0Q2xpZW50Q3VzdG9taXphdGlvbnNDYWxscywgW3tcblx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbcGx1Z2luQUNsaWVudCwgcGx1Z2luQkNsaWVudF0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25BY3Rpb25zID0gZW52ZWxvcGVzXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbWl6YXRpb25BY3Rpb25zLmxlbmd0aCwgMSwgJ3Nob3VsZCBkaXNwYXRjaCBvbmUgZnVsbCBjdXN0b21pemF0aW9uc0NoYW5nZWQgcmVwbGFjZW1lbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkKS5sZW5ndGgsXG5cdFx0XHRcdDAsXG5cdFx0XHRcdCdzaG91bGQgbm90IGRpc3BhdGNoIGN1c3RvbWl6YXRpb25VcGRhdGVkIHdoZW4gcHJvZ3Jlc3MgbWF0Y2hlcyB0aGUgZmluYWwgc3RhdGUnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3BhdGNoZXMgY3VzdG9taXphdGlvblVwZGF0ZWQgZm9yIHN5bmMgcHJvZ3Jlc3MgYWZ0ZXIgaW5pdGlhbCByZXBsYWNlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGx1Z2luQUNsaWVudDogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiA9IHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLCBpZDogY3VzdG9taXphdGlvbklkKCdmaWxlOi8vL3BsdWdpbi1hJyksIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luLWEnLCBuYW1lOiAnUGx1Z2luIEEnLCBlbmFibGVkOiB0cnVlIH07XG5cdFx0XHRsZXQgY3VycmVudEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IGN1cnJlbnRDdXN0b21pemF0aW9ucztcblx0XHRcdGFnZW50LnN5bmNDbGllbnRDdXN0b21pemF0aW9ucyA9IChzZXNzaW9uLCBjbGllbnRJZCwgY3VzdG9taXphdGlvbnMpID0+IHtcblx0XHRcdFx0YWdlbnQuc2V0Q2xpZW50Q3VzdG9taXphdGlvbnNDYWxscy5wdXNoKHsgY2xpZW50SWQsIGN1c3RvbWl6YXRpb25zIH0pO1xuXHRcdFx0XHRjb25zdCBsb2FkaW5nOiBQbHVnaW5DdXN0b21pemF0aW9uID0geyAuLi5wbHVnaW5BQ2xpZW50LCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRpbmcgfSB9O1xuXHRcdFx0XHRjdXJyZW50Q3VzdG9taXphdGlvbnMgPSBbbG9hZGluZ107XG5cdFx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb24sXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogWy4uLmN1cnJlbnRDdXN0b21pemF0aW9uc10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0XHRcdGNvbnN0IGxvYWRlZDogUGx1Z2luQ3VzdG9taXphdGlvbiA9IHsgLi4ucGx1Z2luQUNsaWVudCwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9O1xuXHRcdFx0XHRcdGN1cnJlbnRDdXN0b21pemF0aW9ucyA9IFtsb2FkZWRdO1xuXHRcdFx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkLFxuXHRcdFx0XHRcdFx0XHRjdXN0b21pemF0aW9uOiBsb2FkZWQsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudEN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+ICh7IGN1c3RvbWl6YXRpb246IGN1c3RvbWl6YXRpb24gYXMgUGx1Z2luQ3VzdG9taXphdGlvbiB9KSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBbcGx1Z2luQUNsaWVudF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xuXG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9uc0NoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdXN0b21pemF0aW9uc0NoYW5nZWQubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IGZpcnN0Q3VzdG9taXphdGlvbnNDaGFuZ2VkID0gY3VzdG9taXphdGlvbnNDaGFuZ2VkWzBdLmFjdGlvbjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdEN1c3RvbWl6YXRpb25zQ2hhbmdlZC50eXBlLCBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdEN1c3RvbWl6YXRpb25zQ2hhbmdlZC5jdXN0b21pemF0aW9ucywgW3tcblx0XHRcdFx0Li4ucGx1Z2luQUNsaWVudCxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkaW5nIH0sXG5cdFx0XHR9XSk7XG5cblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25VcGRhdGVkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvblVwZGF0ZWQubWFwKGUgPT4gZS5hY3Rpb24pLCBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogeyAuLi5wbHVnaW5BQ2xpZW50LCBsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9IH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhcnMgY2xpZW50IGN1c3RvbWl6YXRpb25zIHdoZW4gYWN0aXZlQ2xpZW50IGhhcyBubyBjdXN0b21pemF0aW9ucycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25BY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFtdXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5zZXRDbGllbnRDdXN0b21pemF0aW9uc0NhbGxzLCBbe1xuXHRcdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtdLFxuXHRcdFx0fV0pO1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbkFjdGlvbnMgPSBlbnZlbG9wZXNcblx0XHRcdFx0LmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbkFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3VzdG9taXphdGlvbkFjdGlvbnNbMF0uYWN0aW9uLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbnM6IFtdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIHRoZSBhY3RpdmUgY2xpZW50IHdoZW4gaXQgaXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb246IFNlc3Npb25BY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWQsXG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0fTtcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVtb3ZlQWN0aXZlQ2xpZW50Q2FsbHMsIFt7XG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1jbGllbnQnLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogcm9vdC9jb25maWdDaGFuZ2VkIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2hhbmRsZUFjdGlvbiAtIHJvb3QvY29uZmlnQ2hhbmdlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlcHVibGlzaGVzIGFnZW50IGFuZCBzZXNzaW9uIGN1c3RvbWl6YXRpb25zIGZvciBleGlzdGluZyBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYScpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1hJywgbmFtZTogJ1BsdWdpbiBBJywgZW5hYmxlZDogdHJ1ZSwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9O1xuXHRcdFx0YWdlbnQuY3VzdG9taXphdGlvbnMgPSBbY3VzdG9taXphdGlvbl07XG5cdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbY3VzdG9taXphdGlvbl07XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbjogUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24gPSB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdGNvbmZpZzogeyBjdXN0b21pemF0aW9uczogW2N1c3RvbWl6YXRpb25dIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudEluZm9BY3Rpb24gPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWdlbnRzQ2hhbmdlZCkuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGFnZW50SW5mb0FjdGlvbiAmJiBoYXNLZXkoYWdlbnRJbmZvQWN0aW9uLmFjdGlvbiwgeyBhZ2VudHM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEluZm9BY3Rpb24uYWN0aW9uLmFnZW50c1swXT8uY3VzdG9taXphdGlvbnMsIFtjdXN0b21pemF0aW9uXSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCkuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uICYmIGhhc0tleShzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbi5hY3Rpb24sIHsgY3VzdG9taXphdGlvbnM6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uQ3VzdG9taXphdGlvbkFjdGlvbi5hY3Rpb24uY3VzdG9taXphdGlvbnMsIFtjdXN0b21pemF0aW9uXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIHRlbGVtZXRyeSBsZXZlbCBmcm9tIHJvb3QgY29uZmlnJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBhY3Rpb246IFJvb3RDb25maWdDaGFuZ2VkQWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5XTogdGVsZW1ldHJ5TGV2ZWxUb0FnZW50SG9zdENvbmZpZ1ZhbHVlKFRlbGVtZXRyeUxldmVsLk5PTkUpIH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCBhY3Rpb24pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbyB3b3JsZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSBpbnRlZ3JhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwdWJsaXNoZXMgYWdlbnQgaW5mbyBhbmQgc2Vzc2lvbiBjdXN0b21pemF0aW9ucyB3aGVuIGFnZW50IGZpcmVzIG9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd29ya3NwYWNlJyk7XG5cblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24gPSB7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiwgaWQ6IGN1c3RvbWl6YXRpb25JZCgnZmlsZTovLy9wbHVnaW4tYicpLCB1cmk6ICdmaWxlOi8vL3BsdWdpbi1iJywgbmFtZTogJ1BsdWdpbiBCJywgZW5hYmxlZDogdHJ1ZSwgbG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSB9O1xuXHRcdFx0YWdlbnQuY3VzdG9taXphdGlvbnMgPSBbY3VzdG9taXphdGlvbl07XG5cdFx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbY3VzdG9taXphdGlvbl07XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGFnZW50LmZpcmVDdXN0b21pemF0aW9uc0NoYW5nZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50SW5mb0FjdGlvbiA9IGVudmVsb3Blcy5maW5kKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWdlbnRzQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQub2soYWdlbnRJbmZvQWN0aW9uICYmIGhhc0tleShhZ2VudEluZm9BY3Rpb24uYWN0aW9uLCB7IGFnZW50czogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SW5mb0FjdGlvbi5hY3Rpb24uYWdlbnRzWzBdPy5jdXN0b21pemF0aW9ucywgW2N1c3RvbWl6YXRpb25dKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkN1c3RvbWl6YXRpb25BY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQub2soc2Vzc2lvbkN1c3RvbWl6YXRpb25BY3Rpb24gJiYgaGFzS2V5KHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uLmFjdGlvbiwgeyBjdXN0b21pemF0aW9uczogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25DdXN0b21pemF0aW9uQWN0aW9uLmFjdGlvbi5jdXN0b21pemF0aW9ucywgW2N1c3RvbWl6YXRpb25dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IHJlcHVibGlzaCB3aGVuIHJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lciBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KTtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93b3Jrc3BhY2UnKTtcblxuXHRcdFx0YWdlbnQuY3VzdG9taXphdGlvbnMgPSBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sIGlkOiBjdXN0b21pemF0aW9uSWQoJ2ZpbGU6Ly8vcGx1Z2luLWMnKSwgdXJpOiAnZmlsZTovLy9wbHVnaW4tYycsIG5hbWU6ICdQbHVnaW4gQycsIGVuYWJsZWQ6IHRydWUgfV07XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGFnZW50LmZpcmVDdXN0b21pemF0aW9uc0NoYW5nZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0ZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCkubGVuZ3RoLFxuXHRcdFx0XHQwLFxuXHRcdFx0XHQnc2hvdWxkIG5vdCByZXB1Ymxpc2ggc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBhZnRlciBsaXN0ZW5lciBkaXNwb3NlZCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGhhbmRsZUFjdGlvbjogc2Vzc2lvbi90b29sQ2FsbENvbmZpcm1lZCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnaGFuZGxlQWN0aW9uIFx1MjAxNCBzZXNzaW9uL3Rvb2xDYWxsQ29uZmlybWVkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncm91dGVzIGNvbmZpcm1hdGlvbiB0byBjb3JyZWN0IGFnZW50IHZpYSBfdG9vbENhbGxBZ2VudHMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJywgZGVmYXVsdENoYXRVcmkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBGaXJlIHRvb2xfc3RhcnQgdG8gcmVnaXN0ZXIgdGhlIHRvb2wgY2FsbFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb25mLTEnLCB0b29sTmFtZTogJ3JlYWQnLCBkaXNwbGF5TmFtZTogJ1JlYWQgRmlsZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmYtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRmlyZSB0b29sX3JlYWR5IGFza2luZyBmb3IgcGVybWlzc2lvbiAobm9uLXdyaXRlLCBzbyBub3QgYXV0by1hcHByb3ZlZClcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb25mLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgZmlsZS50eHQnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1JlYWQgZmlsZS50eHQnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogdW5kZWZpbmVkLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE5vdyBjb25maXJtIHRoZSB0b29sIGNhbGxcblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmYtMScsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6ICd1c2VyLWFjdGlvbicgYXMgY29uc3QsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLWNvbmYtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZGVuaWFsIG9mIHRvb2wgY2FsbCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVueS0xJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kZW55LTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgY29tbWFuZCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWRlbnktMScsXG5cdFx0XHRcdGFwcHJvdmVkOiBmYWxzZSxcblx0XHRcdFx0cmVhc29uOiAnZGVuaWVkJyBhcyBjb25zdCxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtZGVueS0xJywgYXBwcm92ZWQ6IGZhbHNlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB0b29sX3JlYWR5IHByb2dyZXNzIGRpc3BhdGNoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3Rvb2xfcmVhZHkgZGlzcGF0Y2hlcyBwcm9ncmVzcyBhY3Rpb25zIHRvIGFkdmFuY2UgdG9vbCBjYWxsIHN0YXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndG9vbF9yZWFkeSBmb3IgYSBub24tcGVybWlzc2lvbiB0b29sIGRpc3BhdGNoZXMgQ2hhdFRvb2xDYWxsUmVhZHkgYW5kIGFkdmFuY2VzIHN0YXRlIGZyb20gU3RyZWFtaW5nIHRvIFJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIHRvb2xfc3RhcnQgcHV0cyB0aGUgdG9vbCBjYWxsIGludG8gU3RyZWFtaW5nIHN0YXRlXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWR5LTEnLCB0b29sTmFtZTogJ3J1blRhc2snLCBkaXNwbGF5TmFtZTogJ1J1biBUYXNrJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZUFmdGVyU3RhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwYXJ0QWZ0ZXJTdGFydCA9IHN0YXRlQWZ0ZXJTdGFydD8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0QWZ0ZXJTdGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydEFmdGVyU3RhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0QWZ0ZXJTdGFydC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyk7XG5cblx0XHRcdC8vIHRvb2xfcmVhZHkgd2l0aG91dCBjb25maXJtYXRpb25UaXRsZSBzaG91bGQgZGlzcGF0Y2ggdGhlIHJlYWR5XG5cdFx0XHQvLyBhY3Rpb24gYW5kIGFkdmFuY2UgdGhlIHRvb2wgY2FsbCB0byBSdW5uaW5nXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVhZHktMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIFRhc2snLCB0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6IHVuZGVmaW5lZCwgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZUFmdGVyUmVhZHkgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHAgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0XHRyZXR1cm4gcD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBhcnRBZnRlclJlYWR5ID0gc3RhdGVBZnRlclJlYWR5Py5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnRBZnRlclJlYWR5Py5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0QWZ0ZXJSZWFkeT8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnRBZnRlclJlYWR5LnRvb2xDYWxsLnN0YXR1cyA6IHVuZGVmaW5lZCwgVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0J3Rvb2wgY2FsbCBzaG91bGQgYWR2YW5jZSBmcm9tIFN0cmVhbWluZyB0byBSdW5uaW5nIGFmdGVyIHRvb2xfcmVhZHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2xfcmVhZHkgZm9yIGEgcGVybWlzc2lvbi1nYXRlZCB0b29sIGRpc3BhdGNoZXMgQ2hhdFRvb2xDYWxsUmVhZHkgYW5kIGFkdmFuY2VzIHN0YXRlIHRvIFBlbmRpbmdDb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUgRmlsZScsIGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gdG9vbF9yZWFkeSB3aXRoIGNvbmZpcm1hdGlvblRpdGxlIHNob3VsZCBkaXNwYXRjaCB0aGUgcmVhZHlcblx0XHRcdC8vIGFjdGlvbiBhbmQgYWR2YW5jZSB0aGUgdG9vbCBjYWxsIHRvIFBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6ICd7XCJwYXRoXCI6XCIuZW52XCJ9Jyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIC5lbnYnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogdW5kZWZpbmVkLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBwID0gcz8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRcdFx0cmV0dXJuIHA/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gPyBzIDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHNbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLCBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHQndG9vbCBjYWxsIHNob3VsZCBhZHZhbmNlIHRvIFBlbmRpbmdDb25maXJtYXRpb24gZm9yIHBlcm1pc3Npb24tZ2F0ZWQgdG9vbF9yZWFkeScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbF9yZWFkeSBtYXJrcyBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlIG9ubHkgZm9yIGVsaWdpYmxlIHNoZWxsIGNvbmZpcm1hdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cdFx0XHQvLyBSdWxlIHJlc29sdmFiaWxpdHkgcmVxdWlyZXMgYSBzdWNjZXNzZnVsIHRyZWUtc2l0dGVyIHBhcnNlLlxuXHRcdFx0YXdhaXQgc2lkZUVmZmVjdHMuaW5pdGlhbGl6ZSgpO1xuXG5cdFx0XHRjb25zdCBjYXNlcyA9IFtcblx0XHRcdFx0Wyd0Yy1zaGVsbC1ydWxlcy0xJywgeyByZXF1ZXN0U2FuZGJveEJ5cGFzczogZmFsc2UsIHNoZWxsTGFuZ3VhZ2U6ICdiYXNoJyBhcyBjb25zdCB9XSxcblx0XHRcdFx0Wyd0Yy1zaGVsbC1ydWxlcy0yJywgeyByZXF1ZXN0U2FuZGJveEJ5cGFzczogdHJ1ZSwgc2hlbGxMYW5ndWFnZTogJ2Jhc2gnIGFzIGNvbnN0IH1dLFxuXHRcdFx0XHRbJ3RjLXNoZWxsLXJ1bGVzLTMnLCB7IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiB0cnVlLCBzaGVsbExhbmd1YWdlOiAnYmFzaCcgYXMgY29uc3QgfV0sXG5cdFx0XHRdIGFzIGNvbnN0O1xuXHRcdFx0Zm9yIChjb25zdCBbdG9vbENhbGxJZCwgc2lnbmFsT3ZlcnJpZGVzXSBvZiBjYXNlcykge1xuXHRcdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkLCB0b29sTmFtZTogJ3NoZWxsJywgZGlzcGxheU5hbWU6ICdTaGVsbCcsIGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGNvbW1hbmQnLCB0b29sSW5wdXQ6ICdmb28gLS1iYXInLFxuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gaW4gdGVybWluYWw/JywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdC4uLnNpZ25hbE92ZXJyaWRlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBwYXJ0cyA9IHM/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHM7XG5cdFx0XHRcdHJldHVybiBwYXJ0cz8ubGVuZ3RoID09PSBjYXNlcy5sZW5ndGggJiYgcGFydHMuZXZlcnkocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pID8gcyA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5tYXAocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwLnRvb2xDYWxsLl9tZXRhPy5bJ2F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUnXSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFt0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZF0sXG5cdFx0XHRcdCdvbmx5IHRoZSBydWxlLXJlc29sdmFibGUgc2hlbGwgY29uZmlybWF0aW9uIGlzIG1hcmtlZDsgc2FuZGJveC1ieXBhc3MgYW5kIG1hbmFnZWQgY29uZmlybWF0aW9ucyBhcmUgbm90Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IGZvcndhcmRzIHRoZSBzaWduYWwgc2hlbGwgbGFuZ3VhZ2UgaW50byBzaGVsbCBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0XHRcdGF3YWl0IHNpZGVFZmZlY3RzLmluaXRpYWxpemUoKTtcblxuXHRcdFx0Ly8gYGdldC1jaGlsZGl0ZW1gIG9ubHkgbWF0Y2hlcyB0aGUgZGVmYXVsdCBgR2V0LUNoaWxkSXRlbWAgYWxsb3cgcnVsZVxuXHRcdFx0Ly8gdW5kZXIgUG93ZXJTaGVsbCdzIGNhc2UtaW5zZW5zaXRpdmUgbWF0Y2hpbmcuIE1pc3NpbmcgbGFuZ3VhZ2UgZmFpbHNcblx0XHRcdC8vIGNsb3NlZCBiZWZvcmUgcnVsZSBhbmFseXNpcy5cblx0XHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0XHRbJ3RjLXNoZWxsLWxhbmctMScsICdwb3dlcnNoZWxsJ10sXG5cdFx0XHRcdFsndGMtc2hlbGwtbGFuZy0yJywgJ2Jhc2gnXSxcblx0XHRcdFx0Wyd0Yy1zaGVsbC1sYW5nLTMnLCB1bmRlZmluZWRdLFxuXHRcdFx0XSBhcyBjb25zdDtcblx0XHRcdGZvciAoY29uc3QgW3Rvb2xDYWxsSWQsIHNoZWxsTGFuZ3VhZ2VdIG9mIGNhc2VzKSB7XG5cdFx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ1NoZWxsJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsIHRvb2xJbnB1dDogJ2dldC1jaGlsZGl0ZW0nLFxuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gaW4gdGVybWluYWw/JywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnc2hlbGwnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNoZWxsTGFuZ3VhZ2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcyA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzO1xuXHRcdFx0XHRyZXR1cm4gcGFydHM/Lmxlbmd0aCA9PT0gY2FzZXMubGVuZ3RoICYmIHBhcnRzLmV2ZXJ5KHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHAudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKSA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0YXRlLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMubWFwKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0XHRcdFx0PyBbcC50b29sQ2FsbC5fbWV0YT8uWydhdXRvQXBwcm92ZUJ5U2V0dGluZyddLCBwLnRvb2xDYWxsLl9tZXRhPy5bJ2F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUnXV1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFtbdHJ1ZSwgdW5kZWZpbmVkXSwgW3VuZGVmaW5lZCwgdHJ1ZV0sIFt1bmRlZmluZWQsIHVuZGVmaW5lZF1dLFxuXHRcdFx0XHQncG93ZXJzaGVsbCBhdXRvLWFwcHJvdmVzOyBiYXNoIHN0YXlzIHJ1bGUtcmVzb2x2YWJsZTsgbWlzc2luZyBsYW5ndWFnZSBpcyBuZWl0aGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IGlzIGRyb3BwZWQgd2hlbiB0aGUgdG9vbCBjb21wbGV0ZXMgd2hpbGUgcGVybWlzc2lvbiBsb29rdXAgaXMgcGVuZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdGFsZS1yZWFkeScsIHRvb2xOYW1lOiAndnNjb2RlQVBJJywgZGlzcGxheU5hbWU6ICdHZXQgVlMgQ29kZSBBUEkgUmVmZXJlbmNlcycsXG5cdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2Rpc2Nvbm5lY3RlZC1jbGllbnQnIH0sXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtc3RhbGUtcmVhZHknLCB0b29sTmFtZTogJ3ZzY29kZUFQSScsIGRpc3BsYXlOYW1lOiAnR2V0IFZTIENvZGUgQVBJIFJlZmVyZW5jZXMnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnR2V0IFZTIENvZGUgQVBJIFJlZmVyZW5jZXMnLCB0b29sSW5wdXQ6ICd7XCJxdWVyeVwiOlwidGVzdFwifScsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdBbGxvdyB0b29sIGNhbGw/JywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdGFsZS1yZWFkeScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnR2V0IFZTIENvZGUgQVBJIFJlZmVyZW5jZXMnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdGFsZS1yZWFkeScsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdHZXQgVlMgQ29kZSBBUEkgUmVmZXJlbmNlcyBmYWlsZWQnLFxuXHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICdDbGllbnQgZGlzY29ubmVjdGVkJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRjb25zdCB0b29sQ2FsbCA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1xuXHRcdFx0XHQuZmluZChwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1zdGFsZS1yZWFkeScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogdG9vbENhbGw/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB0b29sQ2FsbC50b29sQ2FsbC5zdGF0dXMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYWR5QWN0aW9uczogZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHJlYWR5QWN0aW9uczogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbF9yZWFkeSBmb3IgYW4gYWRkaXRpb25hbCBjaGF0IGlzIGVtaXR0ZWQgb24gdGhhdCBjaGF0IGNoYW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlcicpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaS50b1N0cmluZygpLCBjaGF0VXJpKTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgeyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc106IHsgYWxsb3c6IFtdLCBkZW55OiBbXSB9IH0gfSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tcGVlcicsIGNoYXRVcmkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShjaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVlci1wZXJtJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUgRmlsZScsIGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGNoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVlci1wZXJtJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSAuZW52JywgdG9vbElucHV0OiAne1wicGF0aFwiOlwiLmVudlwifScsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSAuZW52JywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6IHVuZGVmaW5lZCwgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjaGF0U3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkpO1xuXHRcdFx0XHRjb25zdCBwID0gcz8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLXBlZXItcGVybScpO1xuXHRcdFx0XHRyZXR1cm4gcD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGRlZmF1bHRTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRQYXJ0ID0gZGVmYXVsdFN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtcGVlci1wZXJtJyk7XG5cdFx0XHRjb25zdCBwZWVyUGFydCA9IGNoYXRTdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtcGVlci1wZXJtJyk7XG5cdFx0XHRjb25zdCByZWFkeUVudmVsb3BlID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5ICYmIGhhc0tleShlLmFjdGlvbiwgeyB0b29sQ2FsbElkOiB0cnVlIH0pICYmIGUuYWN0aW9uLnRvb2xDYWxsSWQgPT09ICd0Yy1wZWVyLXBlcm0nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlZXJUb29sU3RhdHVzOiBwZWVyUGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbFxuXHRcdFx0XHRcdD8gcGVlclBhcnQudG9vbENhbGwuc3RhdHVzXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGRlZmF1bHRIYXNUb29sOiBkZWZhdWx0UGFydCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWFkeUVudmVsb3BlQ2hhbm5lbDogcmVhZHlFbnZlbG9wZT8uY2hhbm5lbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGVlclRvb2xTdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdGRlZmF1bHRIYXNUb29sOiBmYWxzZSxcblx0XHRcdFx0cmVhZHlFbnZlbG9wZUNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHR9KTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGNoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZWVyLXBlcm0nLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiAndXNlci1hY3Rpb24nIGFzIGNvbnN0LFxuXHRcdFx0XHRzZWxlY3RlZE9wdGlvbklkOiAnYWxsb3ctc2Vzc2lvbicsXG5cdFx0XHR9IGFzIENoYXRBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLXBlZXItcGVybScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5jb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXSwgeyBhbGxvdzogWyd3cml0ZSddLCBkZW55OiBbXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlbmRpbmdfY29uZmlybWF0aW9uIGZvciBhIHRvb2wgaW5zaWRlIGEgc3ViYWdlbnQgcm91dGVzIHRvIHRoZSBzdWJhZ2VudCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogYSBgcGVuZGluZ19jb25maXJtYXRpb25gIHNpZ25hbCBmb3IgYSBjbGllbnQgdG9vbFxuXHRcdFx0Ly8gaW5zaWRlIGEgc3ViYWdlbnQgbXVzdCBkaXNwYXRjaCBDaGF0VG9vbENhbGxSZWFkeSBhZ2FpbnN0XG5cdFx0XHQvLyB0aGUgc3ViYWdlbnQgc2Vzc2lvbiwgbm90IHRoZSBwYXJlbnQuIE90aGVyd2lzZSB0aGUgcGFyZW50XG5cdFx0XHQvLyBzZXNzaW9uIHNlZXMgYSBzdHJheSBgc2Vzc2lvbi90b29sQ2FsbFJlYWR5YCB3aXRoIG5vXG5cdFx0XHQvLyBwcmVjZWRpbmcgYHNlc3Npb24vdG9vbENhbGxTdGFydGAsIHdoaWNoIGlzIGlsbGVnYWwuXG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFBhcmVudCB0b29sIHRoYXQgZGVsZWdhdGVzIHRvIGEgc3ViYWdlbnQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJyB9KTtcblxuXHRcdFx0Ly8gSW5uZXIgY2xpZW50IHRvb2wgc3RhcnRzIGluc2lkZSB0aGUgc3ViYWdlbnQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsIHRvb2xOYW1lOiAncHJvYmxlbXMnLCBkaXNwbGF5TmFtZTogJ1Byb2JsZW1zJywgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC10b29scycgfSxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUGVybWlzc2lvbiBmbG93IGZpcmVzIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgZm9yIHRoZSBpbm5lclxuXHRcdFx0Ly8gY2xpZW50IHRvb2wuIFRoZSBzaWduYWwgbXVzdCBiZSByb3V0ZWQgdG8gdGhlIHN1YmFnZW50XG5cdFx0XHQvLyBjaGF0IFx1MjAxNCBub3QgdG8gdGhlIHBhcmVudCBcdTIwMTQgd2hlbiB0aGUgc2lnbmFsIGNhcnJpZXMgdGhlIHBhcmVudFxuXHRcdFx0Ly8gY2hhdCBVUkkgYW5kIHBhcmVudFRvb2xDYWxsSWQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWlubmVyJywgdG9vbE5hbWU6ICdwcm9ibGVtcycsIGRpc3BsYXlOYW1lOiAnUHJvYmxlbXMnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnR2V0IHByb2JsZW1zJywgdG9vbElucHV0OiAne30nLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLCBwZXJtaXNzaW9uUGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSBzdWJhZ2VudCBjaGF0IG11c3QgY29udGFpbiB0aGUgQ2hhdFRvb2xDYWxsUmVhZHkuXG5cdFx0XHRjb25zdCBzdWJhZ2VudFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLXBhcmVudCcpO1xuXHRcdFx0Y29uc3Qgc3ViU3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHN1YmFnZW50VXJpKTtcblx0XHRcdFx0Y29uc3QgaW5uZXIgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtaW5uZXInXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiBpbm5lcj8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBpbm5lci50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgPyBzIDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbm5lclBhcnQgPSBzdWJTdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1pbm5lcidcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soaW5uZXJQYXJ0LCAnaW5uZXIgY2xpZW50IHRvb2wgY2FsbCBzaG91bGQgZXhpc3Qgb24gc3ViYWdlbnQgc2Vzc2lvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRpbm5lclBhcnQhLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBpbm5lclBhcnQudG9vbENhbGwuc3RhdHVzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHQnaW5uZXIgY2xpZW50IHRvb2wgY2FsbCBzaG91bGQgYWR2YW5jZSB0byBSdW5uaW5nIGFmdGVyIHBlbmRpbmdfY29uZmlybWF0aW9uJ1xuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVGhlIHBhcmVudCBzZXNzaW9uIG11c3QgTk9UIGhhdmUgYSBzdHJheSB0b29sIGNhbGwgZm9yIHRoZVxuXHRcdFx0Ly8gaW5uZXIgdG9vbENhbGxJZCBcdTIwMTQgdGhhdCB3b3VsZCBiZSBhIENoYXRUb29sQ2FsbFJlYWR5XG5cdFx0XHQvLyB3aXRob3V0IGEgbWF0Y2hpbmcgQ2hhdFRvb2xDYWxsU3RhcnQuXG5cdFx0XHRjb25zdCBwYXJlbnRTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHBhcmVudElubmVyID0gcGFyZW50U3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtaW5uZXInXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudElubmVyLCB1bmRlZmluZWQsICdwYXJlbnQgc2Vzc2lvbiBtdXN0IG5vdCBjb250YWluIHRoZSBpbm5lciB0b29sIGNhbGwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlbmRpbmdfY29uZmlybWF0aW9uIHdpdGhvdXQgYW4gYWN0aXZlIHR1cm4gc3RpbGwgZGlzcGF0Y2hlcyAoZG9lcyBub3QgaGFuZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiB3aGVuIGEgaG9vay10cmlnZ2VyZWQgY29udGludWF0aW9uIHJ1bnMgYWZ0ZXJcblx0XHRcdC8vIHRoZSBwcm90b2NvbCB0dXJuIGhhcyBjb21wbGV0ZWQsIHRoZSBzdGF0ZSBtYW5hZ2VyIGhhcyBub1xuXHRcdFx0Ly8gYWN0aXZlIHR1cm4uIEFjdGlvbiBzaWduYWxzIGdvIHRocm91Z2ggYSBmYWxsYmFjayBwYXRoLCBidXRcblx0XHRcdC8vIHBlbmRpbmdfY29uZmlybWF0aW9uIHdhcyBzaWxlbnRseSBkcm9wcGVkIFx1MjAxNCBjYXVzaW5nIHRoZVxuXHRcdFx0Ly8gcGVybWlzc2lvbiBkZWZlcnJlZCB0byBuZXZlciByZXNvbHZlIGFuZCB0aGUgc2Vzc2lvbiB0byBoYW5nLlxuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTdGFydCBhIHRvb2wgaW4gdGhlIGFjdGl2ZSB0dXJuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW5vb3AnLCB0b29sTmFtZTogJ3ZpZXcnLCBkaXNwbGF5TmFtZTogJ1JlYWQnLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENvbXBsZXRlIHRoZSB0dXJuIFx1MjAxNCBzdGF0ZSBtYW5hZ2VyIG5vIGxvbmdlciBoYXMgYW4gYWN0aXZlIHR1cm5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbm9vcCcsIHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBmaWxlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IG5vIGFjdGl2ZSB0dXJuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpLnRvU3RyaW5nKCkpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgaG9vay10cmlnZ2VyZWQgY29udGludWF0aW9uOiB0b29sIGFjdGlvbnNcblx0XHRcdC8vIGFycml2ZSB3aXRob3V0IGEgbmV3IHByb3RvY29sIHR1cm4gYmVpbmcgc3RhcnRlZFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICcnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1vcnBoYW4nLCB0b29sTmFtZTogJ3ZpZXcnLCBkaXNwbGF5TmFtZTogJ1JlYWQnLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIE5vdyB0aGUgcGVuZGluZ19jb25maXJtYXRpb24gYXJyaXZlcyBcdTIwMTQgdGhpcyBtdXN0IE5PVCBiZSBkcm9wcGVkXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtb3JwaGFuJywgdG9vbE5hbWU6ICd2aWV3JywgZGlzcGxheU5hbWU6ICdSZWFkJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZS50cycsIHRvb2xJbnB1dDogJ3tcInBhdGhcIjpcImZpbGUudHNcIn0nLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBlcm1pc3Npb25QYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGUgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3Qgc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWRcblx0XHRcdC8vIChhdXRvLWFwcHJvdmVkIGJlY2F1c2UgcmVhZCBpcyBpbnNpZGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5KS5cblx0XHRcdC8vIF9oYW5kbGVUb29sUmVhZHkgaXMgYXN5bmMgKGF3YWl0cyBnZXRBdXRvQXBwcm92YWwgLT4gcmVhbHBhdGgpLFxuXHRcdFx0Ly8gc28gd2FpdCBmb3IgdGhlIGFwcHJvdmFsIHRvIHNldHRsZSBkZXRlcm1pbmlzdGljYWxseS5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLW9ycGhhbicsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdLCAncGVuZGluZ19jb25maXJtYXRpb24gd2l0aG91dCBhY3RpdmUgdHVybiBzaG91bGQgc3RpbGwgYmUgcHJvY2Vzc2VkIGFuZCBhdXRvLWFwcHJvdmVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQ2hhdFRvb2xDYWxsQ29tcGxldGUgcm91dGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdoYW5kbGVBY3Rpb24gXHUyMDE0IGNoYXQvdG9vbENhbGxDb21wbGV0ZSByb3V0aW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgc2Vzc2lvbiArIGRlZmF1bHQgY2hhdCBVUkkgZm9yIGEgZGVmYXVsdC1jaGF0IGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uOiBhZ2VudHMga2V5IHRoZWlyIHNlc3Npb25zIGJ5IHNlc3Npb24gaWQsIGJ1dCB0aGVcblx0XHRcdC8vIGNoYXQgVVJJJ3MgcGF0aCBpcyBhIGJhc2U2NCBibG9iLiBUaGUgc2Vzc2lvbiBVUkkgbXVzdCBiZSBwYXNzZWRcblx0XHRcdC8vIHNvIHRoZSBsb29rdXAgcmVzb2x2ZXMgaW5zdGVhZCBvZiBzaWxlbnRseSBkcm9wcGluZyB0aGUgY2FsbC5cblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWRlZmF1bHQnLFxuXHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ2RvbmUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YWdlbnQuY2xpZW50VG9vbENhbGxDb21wbGV0ZUNhbGxzLm1hcChjID0+ICh7IHNlc3Npb246IGMuc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjLmNoYXQ/LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGMudG9vbENhbGxJZCB9KSksXG5cdFx0XHRcdFt7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgY2hhdDogZGVmYXVsdENoYXRVcmksIHRvb2xDYWxsSWQ6ICd0Yy1kZWZhdWx0JyB9XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBvd25pbmcgc2Vzc2lvbiArIGNoYXQgVVJJIGZvciBhbiBhZGRpdGlvbmFsLWNoYXQgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci0xJyk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihwZWVyQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVlcicsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZG9uZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhZ2VudC5jbGllbnRUb29sQ2FsbENvbXBsZXRlQ2FsbHMubWFwKGMgPT4gKHsgc2Vzc2lvbjogYy5zZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGMuY2hhdD8udG9TdHJpbmcoKSwgdG9vbENhbGxJZDogYy50b29sQ2FsbElkIH0pKSxcblx0XHRcdFx0W3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCBjaGF0OiBwZWVyQ2hhdFVyaSwgdG9vbENhbGxJZDogJ3RjLXBlZXInIH1dLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIHBhcmVudCBwZWVyIGNoYXQgVVJJIGZvciBhIHN1YmFnZW50LWNoYXQgY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci1zdWJhZ2VudC1wYXJlbnQnKTtcblx0XHRcdHN0YXRlTWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGVlckNoYXRVcmkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLXBlZXInLCBwZWVyQ2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJyxcblx0XHRcdFx0Y2hhdDogVVJJLnBhcnNlKHBlZXJDaGF0VXJpKSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtcGFyZW50Jyk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oc3ViYWdlbnRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tc3ViYWdlbnQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtaW5uZXInLFxuXHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ2RvbmUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0YWdlbnQuY2xpZW50VG9vbENhbGxDb21wbGV0ZUNhbGxzLm1hcChjID0+ICh7IHNlc3Npb246IGMuc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjLmNoYXQ/LnRvU3RyaW5nKCksIHRvb2xDYWxsSWQ6IGMudG9vbENhbGxJZCB9KSksXG5cdFx0XHRcdFt7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgY2hhdDogcGVlckNoYXRVcmksIHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicgfV0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24tbGV2ZWwgYXV0by1hcHByb3ZlIChjb25maWcpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2Vzc2lvbiBjb25maWcgYXV0by1hcHByb3ZlJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gc2V0dXBTZXNzaW9uV2l0aENvbmZpZyhhdXRvQXBwcm92ZUxldmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gU2V0IGNvbmZpZyBvbiB0aGUgc2Vzc2lvbiBzdGF0ZSBkaXJlY3RseSAoYXMgYWdlbnRTZXJ2aWNlLnRzIGRvZXMpXG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnQXBwcm92YWxzJyxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJywgJ2F1dG9waWxvdCddLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6IGF1dG9BcHByb3ZlTGV2ZWwgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZXMgYWxsIHdyaXRlcyB3aGVuIGF1dG9BcHByb3ZlIGlzIHNldCB0byBieXBhc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb25XaXRoQ29uZmlnKCdhdXRvQXBwcm92ZScpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1ieXBhc3MtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYnlwYXNzLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYnlwYXNzLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlLy5lbnYnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHQvLyAuZW52IHdvdWxkIG5vcm1hbGx5IGJlIGJsb2NrZWQsIGJ1dCBzZXNzaW9uLWxldmVsIGF1dG8tYXBwcm92ZSBvdmVycmlkZXNcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtYnlwYXNzLTEnLCBhcHByb3ZlZDogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVzIHNoZWxsIGNvbW1hbmRzIHdoZW4gYXV0b0FwcHJvdmUgaXMgc2V0IHRvIGJ5cGFzcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbldpdGhDb25maWcoJ2F1dG9BcHByb3ZlJyk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWJ5cGFzcy1zaGVsbC0xJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1ieXBhc3Mtc2hlbGwtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHJtIC1yZiAvJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWJ5cGFzcy1zaGVsbC0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gcm0gLXJmIC8nLCB0b29sSW5wdXQ6ICdybSAtcmYgLycsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdzaGVsbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdC8vIERhbmdlcm91cyBjb21tYW5kIHdvdWxkIG5vcm1hbGx5IGJlIGJsb2NrZWQsIGJ1dCBzZXNzaW9uLWxldmVsXG5cdFx0XHQvLyBieXBhc3MgYXV0by1hcHByb3ZlIG92ZXJyaWRlcy5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtYnlwYXNzLXNoZWxsLTEnLCBhcHByb3ZlZDogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIE5PVCBhdXRvLWFwcHJvdmUgYSBzaGVsbCBjb21tYW5kIHRoYXQgb3B0ZWQgb3V0IG9mIHRoZSBzYW5kYm94LCBldmVuIGluIGJ5cGFzcyBtb2RlJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uV2l0aENvbmZpZygnYXV0b0FwcHJvdmUnKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtc2FuZGJveGJ5cGFzcy0xJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtc2FuZGJveGJ5cGFzcy0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY2F0IH4vc29tZXRoaW5nLnR4dCcsIHRvb2xJbnB1dDogJ2NhdCB+L3NvbWV0aGluZy50eHQnLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGNvbW1hbmQnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdFNhbmRib3hCeXBhc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQSByZWFkLW9ubHkgY29tbWFuZCBsaWtlIGBjYXRgIChvciBldmVuIHNlc3Npb24tbGV2ZWwgYnlwYXNzKVxuXHRcdFx0Ly8gd291bGQgbm9ybWFsbHkgYXV0by1hcHByb3ZlLCBidXQgb3B0aW5nIG91dCBvZiB0aGUgc2FuZGJveCBpcyBhblxuXHRcdFx0Ly8gZWxldmF0aW9uIG9mIHByaXZpbGVnZSB0aGUgdXNlciBtdXN0IGNvbmZpcm0sIHNvIG5vIGF1dG8tYXBwcm92YWxcblx0XHRcdC8vIHJlc3BvbnNlIGlzIHNlbnQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya3MgcGVuZGluZyBjbGllbnQgdG9vbCBhcHByb3ZhbCBmb3IgY2xpZW50LXNpZGUgYXV0by1hcHByb3ZhbCBpbiBieXBhc3MgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbldpdGhDb25maWcoJ2F1dG9BcHByb3ZlJyk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScsIGRlZmF1bHRDaGF0VXJpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQtYXBwcm92ZS0xJywgdG9vbE5hbWU6ICdydW5UYXNrJywgZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsIGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQtYXBwcm92ZS0xJywgdG9vbE5hbWU6ICdydW5UYXNrJywgZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gdGFzaycsIHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biB0YXNrJywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHAgPSBzPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtY2xpZW50LWFwcHJvdmUtMScpO1xuXHRcdFx0XHRyZXR1cm4gcD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLWNsaWVudC1hcHByb3ZlLTEnKTtcblx0XHRcdGFzc2VydC5vayhwYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRtZXRhOiBwYXJ0LnRvb2xDYWxsLl9tZXRhLFxuXHRcdFx0XHRwZXJtaXNzaW9uQ2FsbHM6IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRtZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnLCBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9LFxuXHRcdFx0XHRwZXJtaXNzaW9uQ2FsbHM6IFtdLFxuXHRcdFx0fSk7XG5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1hcHByb3ZlLTEnLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtY2xpZW50LWFwcHJvdmUtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgTk9UIGF1dG8tYXBwcm92ZSB3aGVuIGF1dG9BcHByb3ZlIGlzIGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb25XaXRoQ29uZmlnKCdkZWZhdWx0Jyk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWRlZmF1bHQtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZGVmYXVsdC0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSAuZW52JywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWRlZmF1bHQtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgLmVudicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2UvLmVudicsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gLmVudiBzaG91bGQgc3RpbGwgYmUgYmxvY2tlZCB3aXRoIGRlZmF1bHQgY29uZmlnXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNwZWN0cyBtaWQtc2Vzc2lvbiBjb25maWcgY2hhbmdlIHZpYSBTZXNzaW9uQ29uZmlnQ2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbldpdGhDb25maWcoJ2RlZmF1bHQnKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIENoYW5nZSB0byBieXBhc3MgbWlkLXNlc3Npb25cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1taWQtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWlkLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWlkLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlLy5lbnYnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBTaG91bGQgbm93IGJlIGF1dG8tYXBwcm92ZWQgYWZ0ZXIgY29uZmlnIGNoYW5nZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1taWQtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHQvLyAtLS0tIEVkaXQgYXV0by1hcHByb3ZlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZWRpdCBhdXRvLWFwcHJvdmUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVzIHdyaXRlcyB0byByZWd1bGFyIHNvdXJjZSBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1hdXRvLTEnLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1hdXRvLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIHNyYy9hcHAudHMnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL3NyYy9hcHAudHMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBBdXRvLWFwcHJvdmVkIHdyaXRlcyBjYWxsIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0IGRpcmVjdGx5XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLWF1dG8tMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jsb2NrcyB3cml0ZXMgdG8gLmVudiBmaWxlcycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lbnYtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZW52LTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZW52LTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5lbnYnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIC5lbnYnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlLy5lbnYnLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNob3VsZCBOT1QgYXV0by1hcHByb3ZlIFx1MjAxNCAuZW52IGlzIGV4Y2x1ZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRcdC8vIFNob3VsZCBkaXNwYXRjaCBhIHRvb2xfcmVhZHkgYWN0aW9uIGZvciB0aGUgY2xpZW50IHRvIGNvbmZpcm1cblx0XHRcdGNvbnN0IHJlYWR5QWN0aW9uID0gZW52ZWxvcGVzLmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KTtcblx0XHRcdGFzc2VydC5vayhyZWFkeUFjdGlvbiwgJ3Nob3VsZCBkaXNwYXRjaCB0b29sX3JlYWR5IGZvciBibG9ja2VkIHdyaXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdibG9ja3Mgd3JpdGVzIHRvIHBhY2thZ2UuanNvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wa2ctMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGtnLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIHBhY2thZ2UuanNvbicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wa2ctMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgcGFja2FnZS5qc29uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSBwYWNrYWdlLmpzb24nLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL3BhY2thZ2UuanNvbicsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2tzIHdyaXRlcyB0byAubG9jayBmaWxlcycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1sb2NrLTEnLCB0b29sTmFtZTogJ3dyaXRlJywgZGlzcGxheU5hbWU6ICdXcml0ZScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxvY2stMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgeWFybi5sb2NrJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxvY2stMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgeWFybi5sb2NrJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSB5YXJuLmxvY2snLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL3lhcm4ubG9jaycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmxvY2tzIHdyaXRlcyB0byAuZ2l0IGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1naXQtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZ2l0LTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIC5naXQvY29uZmlnJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWdpdC0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSAuZ2l0L2NvbmZpZycsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgLmdpdC9jb25maWcnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlLy5naXQvY29uZmlnJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gUmVhZCBhdXRvLWFwcHJvdmUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdyZWFkIGF1dG8tYXBwcm92ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZXMgcmVhZHMgaW5zaWRlIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMScsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBzcmMvYXBwLnRzJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHVuZGVmaW5lZCwgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdyZWFkJywgcGVybWlzc2lvblBhdGg6ICcvd29ya3NwYWNlL3NyYy9hcHAudHMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzdGF0ZU1hbmFnZXIsICgpID0+IGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscy5sZW5ndGggPiAwIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLXJlYWQtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGF1dG8tYXBwcm92ZSByZWFkcyBvdXRzaWRlIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKFVSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMicsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMicsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJlYWQtMicsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZCAvZXRjL3Bhc3N3ZCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAncmVhZCcsIHBlcm1pc3Npb25QYXRoOiAnL2V0Yy9wYXNzd2QnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Y29uc3QgcmVhZHlBY3Rpb24gPSBlbnZlbG9wZXMuZmluZChlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlYWR5QWN0aW9uLCAnc2hvdWxkIGRpc3BhdGNoIHRvb2xfcmVhZHkgZm9yIHJlYWQgb3V0c2lkZSB3b3JraW5nIGRpcmVjdG9yeScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFRpdGxlIHBlcnNpc3RlbmNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3RpdGxlIHBlcnNpc3RlbmNlJywgKCkgPT4ge1xuXG5cdFx0bGV0IHNlc3Npb25EYjogU2Vzc2lvbkRhdGFiYXNlO1xuXG5cdFx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2Vzc2lvbkRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHR9KTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JNZXRhZGF0YShrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IDEwMDsgYXR0ZW1wdCsrKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgc2Vzc2lvbkRiLmdldE1ldGFkYXRhKGtleSk7XG5cdFx0XHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIG1ldGFkYXRhICcke2tleX0nIHdhcyBub3QgcGVyc2lzdGVkYCk7XG5cdFx0fVxuXG5cdFx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbkRiLmNsb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTZXNzaW9uVGl0bGVDaGFuZ2VkIHBlcnNpc3RzIHRvIHRoZSBkYXRhYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIGxvY2FsU3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBsb2NhbEFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtsb2NhbEFnZW50XSksXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdJbml0aWFsJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRsb2NhbFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHR0aXRsZTogJ0N1c3RvbSBUaXRsZScsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHdhaXRGb3JNZXRhZGF0YSgnY3VzdG9tVGl0bGUnKSwgJ0N1c3RvbSBUaXRsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlTGlzdFNlc3Npb25zIHJldHVybnMgcGVyc2lzdGVkIGN1c3RvbSB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpO1xuXHRcdFx0Y29uc3QgbG9jYWxBZ2VudCA9IG5ldyBNb2NrQWdlbnQoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9jYWxBZ2VudC5kaXNwb3NlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCB9IGFzIElQcm9kdWN0U2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSkpO1xuXHRcdFx0bG9jYWxTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIobG9jYWxBZ2VudCk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHNlc3Npb24gb24gdGhlIGFnZW50IGJhY2tlbmRcblx0XHRcdGF3YWl0IGxvY2FsQWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXG5cdFx0XHQvLyBQZXJzaXN0IGEgY3VzdG9tIHRpdGxlIGluIHRoZSBEQlxuXHRcdFx0YXdhaXQgc2Vzc2lvbkRiLnNldE1ldGFkYXRhKCdjdXN0b21UaXRsZScsICdNeSBDdXN0b20gVGl0bGUnKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBsb2NhbFNlcnZpY2UubGlzdFNlc3Npb25zKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRcdC8vIEN1c3RvbSB0aXRsZSBjb21lcyBmcm9tIHRoZSBEQiBhbmQgaXMgcmV0dXJuZWQgdmlhIHRoZSBhZ2VudCdzIGxpc3RTZXNzaW9uc1xuXHRcdFx0Ly8gVGhlIG1vY2sgYWdlbnQgc3VtbWFyeSBpcyB1c2VkOyB0aGUgc2VydmljZSBkb2Vzbid0IHJlYWQgdGhlIERCIGZvciBsaXN0XG5cdFx0XHRhc3NlcnQub2soc2Vzc2lvbnNbMF0uc3VtbWFyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVSZXN0b3JlU2Vzc2lvbiB1c2VzIHBlcnNpc3RlZCBjdXN0b20gdGl0bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsQWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGxvY2FsQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmlsZVNlcnZpY2UsIHNlc3Npb25EYXRhU2VydmljZSwgeyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQgfSBhcyBJUHJvZHVjdFNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkpKTtcblx0XHRcdGxvY2FsU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKGxvY2FsQWdlbnQpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYSBzZXNzaW9uIG9uIHRoZSBhZ2VudCBiYWNrZW5kXG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGF3YWl0IGxvY2FsQWdlbnQuY3JlYXRlU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBsb2NhbEFnZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbnNbMF0uc2Vzc2lvbjtcblxuXHRcdFx0Ly8gUGVyc2lzdCBhIGN1c3RvbSB0aXRsZSBpbiB0aGUgREJcblx0XHRcdGF3YWl0IHNlc3Npb25EYi5zZXRNZXRhZGF0YSgnY3VzdG9tVGl0bGUnLCAnUmVzdG9yZWQgVGl0bGUnKTtcblxuXHRcdFx0Ly8gU2V0IHVwIG1pbmltYWwgbWVzc2FnZXMgZm9yIHJlc3RvcmVcblx0XHRcdGxvY2FsQWdlbnQuc2Vzc2lvbk1lc3NhZ2VzID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ3VzZXInLCBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdIZWxsbycsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICdhc3Npc3RhbnQnLCBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUhLnRpdGxlLCAnUmVzdG9yZWQgVGl0bGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmUgaW50ZXJsZWF2ZXMgYSBwZXJzaXN0ZWQgbG9jYWwgdHVybiBhZnRlciBpdHMgYW5jaG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZpbGVTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVOb29wR2l0U2VydmljZSgpKSk7XG5cdFx0XHRsb2NhbFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihsb2NhbEFnZW50KTtcblxuXHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBhd2FpdCBsb2NhbEFnZW50LmNyZWF0ZVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgbG9jYWxBZ2VudC5saXN0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25zWzBdLnNlc3Npb247XG5cblx0XHRcdC8vIFRoZSBTREsgdHJhbnNjcmlwdCB5aWVsZHMgYSBzaW5nbGUgcmVhbCB0dXJuIGtleWVkIGJ5IHRoZSBmaXJzdFxuXHRcdFx0Ly8gdXNlciBtZXNzYWdlIGlkIChgYnVpbGRUdXJuc0Zyb21IaXN0b3J5YCkuXG5cdFx0XHRsb2NhbEFnZW50LnNlc3Npb25NZXNzYWdlcyA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHNlc3Npb24sIHJvbGU6ICd1c2VyJywgbWVzc2FnZUlkOiAncmVhbC0xJywgY29udGVudDogJ0hlbGxvJywgdG9vbFJlcXVlc3RzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgc2Vzc2lvbiwgcm9sZTogJ2Fzc2lzdGFudCcsIG1lc3NhZ2VJZDogJ2EtMScsIGNvbnRlbnQ6ICdIaScsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdF07XG5cblx0XHRcdC8vIEEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuIHJlY29yZGVkIGFnYWluc3QgdGhhdCByZWFsIHR1cm4uXG5cdFx0XHRjb25zdCBsb2NhbFR1cm4gPSB7XG5cdFx0XHRcdGlkOiAnbG9jYWwtMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJyFlY2hvIGhpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3AxJywgY29udGVudDogJ3JhbicgfV0sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXRlOiAyLCAvLyBUdXJuU3RhdGUuQ29tcGxldGVcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuaW5zZXJ0TG9jYWxUdXJuKHsgdHVybklkOiAnbG9jYWwtMScsIGNoYXRVcmk6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpLCBhbmNob3JUdXJuSWQ6ICdyZWFsLTEnLCBzZXE6IDEsIHBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KGxvY2FsVHVybikgfSk7XG5cblx0XHRcdGF3YWl0IGxvY2FsU2VydmljZS5yZXN0b3JlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGxvY2FsU2VydmljZS5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGU/LnR1cm5zLm1hcCh0ID0+IHQuaWQpLCBbJ3JlYWwtMScsICdsb2NhbC0xJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgcGVyc2lzdHMgbWVyZ2VkIGNvbmZpZyB2YWx1ZXMgdG8gdGhlIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbEFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBsb2NhbEFnZW50LmRpc3Bvc2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgbG9jYWxTdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGxvY2FsQWdlbnQsXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFtdPignYWdlbnRzJywgW2xvY2FsQWdlbnRdKSxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdJbml0aWFsJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHByb2plY3Q6IHsgdXJpOiAnZmlsZTovLy90ZXN0LXByb2plY3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QgUHJvamVjdCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0c2Vzc2lvbi5jb25maWcgPSB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSB9O1xuXG5cdFx0XHQvLyBNaWQtc2Vzc2lvbiBjaGFuZ2UgbWVyZ2VzIG5ldyB2YWx1ZXMgaW50byBleGlzdGluZy5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHRcdH0sIHsgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcsIGNsaWVudFNlcTogMSB9KTtcblx0XHRcdGxvY2FsU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB3YWl0Rm9yTWV0YWRhdGEoJ2NvbmZpZ1ZhbHVlcycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHBlcnNpc3RlZCksIHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXJ2ZXItZGlzcGF0Y2hlZCBTZXNzaW9uQ29uZmlnQ2hhbmdlZCBwZXJzaXN0cyBtZXJnZWQgY29uZmlnIHZhbHVlcyB0byB0aGUgZGF0YWJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsQWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGxvY2FsQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIGxvY2FsU3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBsb2NhbEFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtsb2NhbEFnZW50XSksXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbG9jYWxTdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnSW5pdGlhbCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHNlc3Npb24uY29uZmlnID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBtb2RlOiAncGxhbicsIGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSB9O1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IG1vZGU6ICdpbnRlcmFjdGl2ZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB3YWl0Rm9yTWV0YWRhdGEoJ2NvbmZpZ1ZhbHVlcycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChKU09OLnBhcnNlKHBlcnNpc3RlZCksIHsgbW9kZTogJ2ludGVyYWN0aXZlJywgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nlc3Npb25Db25maWdDaGFuZ2VkIG5vdGlmaWVzIHRoZSBhZ2VudCB3aXRoIHRoZSBwb3N0LXJlZHVjZXIgbWVyZ2VkIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBjbGllbnQtYWN0aW9uIHNpZGUtZWZmZWN0cyBwYXRoIGlzIHdoZXJlIGEgcGlja2VyIGVkaXQgbGFuZHNcblx0XHRcdC8vIChpbnRlcm5hbCBzZXJ2ZXIgd3JpdGVzIHVzZSBgZGlzcGF0Y2hTZXJ2ZXJBY3Rpb25gIGFuZCBuZXZlciByZWFjaFxuXHRcdFx0Ly8gYGhhbmRsZUFjdGlvbmApLCBzbyBmb3J3YXJkaW5nIGEgbGl2ZSBjb25maWcgY2hhbmdlIHRvIHRoZSBwcm92aWRlclxuXHRcdFx0Ly8gZnJvbSBoZXJlIGlzIGluaGVyZW50bHkgY2xpZW50LW9ubHkuIFBpbnMgdGhhdCBgb25TZXNzaW9uQ29uZmlnQ2hhbmdlZGBcblx0XHRcdC8vIHJlY2VpdmVzIHRoZSBmdWxsIG1lcmdlZCBjb25maWcsIG5vdCBqdXN0IHRoZSBwYXRjaC5cblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGxvY2FsQWdlbnQgPSBuZXcgTW9ja0FnZW50KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGxvY2FsQWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBsb2NhbFN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gbG9jYWxBZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbbG9jYWxBZ2VudF0pLFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShzZXNzaW9uRGIpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdJbml0aWFsJyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR9KTtcblx0XHRcdC8vIFNlZWQgYSBzZWNvbmQga2V5IHRoZSBwYXRjaCBkb2VzIE5PVCB0b3VjaDogaWYgdGhlIGhvb2sgcmVjZWl2ZWQgdGhlXG5cdFx0XHQvLyByYXcgcGF0Y2ggaW5zdGVhZCBvZiB0aGUgbWVyZ2VkIHZhbHVlcywgYGF1dG9BcHByb3ZlYCB3b3VsZCBiZVxuXHRcdFx0Ly8gbWlzc2luZyBcdTIwMTQgc28gYXNzZXJ0aW5nIGl0IHN1cnZpdmVzIHBpbnMgdGhlIFwibWVyZ2VkIHZhbHVlc1wiIGNvbnRyYWN0LlxuXHRcdFx0c2Vzc2lvbi5jb25maWcgPSB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7IHBlcm1pc3Npb25Nb2RlOiAnZGVmYXVsdCcsIGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSB9O1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IHBlcm1pc3Npb25Nb2RlOiAnYnlwYXNzUGVybWlzc2lvbnMnIH0sXG5cdFx0XHR9LCB7IGNsaWVudElkOiAndGVzdC1jbGllbnQnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0XHRsb2NhbFNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IHBlcm1pc3Npb25Nb2RlOiAnYnlwYXNzUGVybWlzc2lvbnMnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2NhbEFnZW50Lm9uU2Vzc2lvbkNvbmZpZ0NoYW5nZWRDYWxscy5tYXAoYyA9PiAoeyBzZXNzaW9uOiBjLnNlc3Npb24udG9TdHJpbmcoKSwgdmFsdWVzOiBjLnZhbHVlcyB9KSksIFt7XG5cdFx0XHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0dmFsdWVzOiB7IHBlcm1pc3Npb25Nb2RlOiAnYnlwYXNzUGVybWlzc2lvbnMnLCBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0sXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU3ViYWdlbnQgc2Vzc2lvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzdWJhZ2VudCBzZXNzaW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N1YmFnZW50X3N0YXJ0ZWQgY3JlYXRlcyBhIHN1YmFnZW50IGNoYXQgYW5kIGRpc3BhdGNoZXMgY29udGVudCBvbiBwYXJlbnQgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTdGFydCBhIHBhcmVudCB0b29sIGNhbGxcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcgdGFzay4uLicsXG5cdFx0XHRcdFx0dG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRmlyZSBzdWJhZ2VudF9zdGFydGVkXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnY29kZS1yZXZpZXdlcicsXG5cdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6ICdDb2RlIFJldmlld2VyJyxcblx0XHRcdFx0YWdlbnREZXNjcmlwdGlvbjogJ1Jldmlld3MgY29kZScsXG5cdFx0XHRcdHRhc2tQcm9tcHQ6ICdSZXZpZXcgdGhlIGF1dGggbW9kdWxlIGZvciBzZWN1cml0eSBpc3N1ZXMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgc3ViYWdlbnQgY2hhdCB3YXMgY3JlYXRlZFxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlLCAnc3ViYWdlbnQgY2hhdCBzaG91bGQgZXhpc3QnKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50U3VtbWFyeSA9IHN1YlN0YXRlIS5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YmFnZW50U3VtbWFyeT8udGl0bGUsICdDb2RlIFJldmlld2VyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1YmFnZW50U3VtbWFyeT8ub3JpZ2luLCB7IGtpbmQ6ICd0b29sJywgY2hhdDogZGVmYXVsdENoYXRVcmksIHRvb2xDYWxsSWQ6ICd0Yy0xJyB9KTtcblx0XHRcdGFzc2VydC5vayhzdWJTdGF0ZSEuYWN0aXZlVHVybiwgJ3N1YmFnZW50IGNoYXQgc2hvdWxkIGhhdmUgYW4gYWN0aXZlIHR1cm4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJTdGF0ZSEuYWN0aXZlVHVybiEubWVzc2FnZS50ZXh0LCAnUmV2aWV3IHRoZSBhdXRoIG1vZHVsZSBmb3Igc2VjdXJpdHkgaXNzdWVzJywgJ3N1YmFnZW50IHR1cm4gc2hvdWxkIHJlbmRlciB0aGUgc3Bhd25pbmcgdG9vbCBjYWxsIHByb21wdCBhcyBpdHMgcmVxdWVzdCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgY29udGVudCB3YXMgZGlzcGF0Y2hlZCBvbiB0aGUgcGFyZW50IHRvb2wgY2FsbFxuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2socGFyZW50U3RhdGU/LmFjdGl2ZVR1cm4pO1xuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGwgPSBwYXJlbnRTdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhwYXJlbnRUb29sQ2FsbCk7XG5cdFx0XHRpZiAocGFyZW50VG9vbENhbGw/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFyZW50VG9vbENhbGwudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdGFzc2VydC5vayhwYXJlbnRUb29sQ2FsbC50b29sQ2FsbC5jb250ZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcmVudFRvb2xDYWxsLnRvb2xDYWxsLmNvbnRlbnQhWzBdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdGFtcHMgX21ldGEuc3ViYWdlbnRDaGF0VXJpIG9udG8gYSBzdWJhZ2VudC1zcGF3bmluZyB0b29sIGNhbGwgYXMgc29vbiBhcyB0b29sS2luZCBpcyBrbm93bicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JywgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV4cGVjdGVkVXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtMScpO1xuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCB0b29sQ2FsbCA9IHBhcmVudFN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRvb2xDYWxsPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkVG9vbENhbGxNZXRhKHRvb2xDYWxsLnRvb2xDYWxsKS5zdWJhZ2VudENoYXRVcmksIGV4cGVjdGVkVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoZXhwZWN0ZWRVcmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmVzdGVkIHN1YmFnZW50X3N0YXJ0ZWQgcm91dGVzIGRpc2NvdmVyeSBibG9jayBhbmQgc2VlZHMgZWFjaCByZXF1ZXN0IHByb21wdCB2aWEgdGhlIGltbWVkaWF0ZSBwYXJlbnQgY2hhdCAoYXJiaXRyYXJ5IGRlcHRoKScsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IGZvciBhIHN1YmFnZW50IHNwYXduZWQgYnkgYW5vdGhlciBzdWJhZ2VudCwgdGhlXG5cdFx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsJ3MgYGNoYXRgIGlzIHRoZSB0b3AtbGV2ZWwgY2hhdCwgYnV0XG5cdFx0XHQvLyBpdHMgc3Bhd25pbmcgdG9vbCBjYWxsIGxpdmVzIGluIHRoZSBpbW1lZGlhdGUgcGFyZW50J3Mgc3ViYWdlbnRcblx0XHRcdC8vIGNoYXQuIFRoZSBkaXNjb3ZlcnkgYENoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkYCBtdXN0IGxhbmQgdGhlcmVcblx0XHRcdC8vIChyZXNvbHZlZCB2aWEgYHBhcmVudFRvb2xDYWxsSWRgKSBcdTIwMTQgZGlzcGF0Y2hpbmcgaXQgb24gdGhlXG5cdFx0XHQvLyB0b3AtbGV2ZWwgY2hhdCBpcyBhIG5vLW9wLCBsZWF2aW5nIHRoZSBuZXN0ZWQgc3ViYWdlbnRcblx0XHRcdC8vIHVuZGlzY292ZXJhYmxlIGFuZCBoYW5naW5nIGFueSBjbGllbnQgdG9vbCBpdCBydW5zLiBEcml2ZW4gdGhyZWVcblx0XHRcdC8vIGxldmVscyBkZWVwIHRvIHByb3ZlIHRoZSByZXNvbHV0aW9uIGlzIG5vdCBjYXBwZWQgYXQgdHdvOiBlYWNoXG5cdFx0XHQvLyBsZXZlbCdzIGJsb2NrIGxhbmRzIG9uIGl0cyBpbW1lZGlhdGUgcGFyZW50IGNoYXQgdmlhIGEgc2luZ2xlXG5cdFx0XHQvLyBmbGF0LW1hcCBsb29rdXAsIGluZGVwZW5kZW50IG9mIGRlcHRoLlxuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBMZXZlbC0xIHN1YmFnZW50IHNwYXduZWQgZnJvbSB0aGUgZGVmYXVsdCBjaGF0LlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwxJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwxJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1sMScsIGFnZW50TmFtZTogJ2wxJywgYWdlbnREaXNwbGF5TmFtZTogJ0wxJywgYWdlbnREZXNjcmlwdGlvbjogJ2ZpcnN0JywgdGFza1Byb21wdDogJ2wxIHByb21wdCcgfSk7XG5cblx0XHRcdC8vIExldmVsLTIgc3ViYWdlbnQncyBzcGF3bmluZyB0b29sIHJ1bnMgSU5TSURFIHRoZSBsZXZlbC0xXG5cdFx0XHQvLyBzdWJhZ2VudCAocGFyZW50VG9vbENhbGxJZCA9IHRjLWwxKSwgc28gaXQgbGFuZHMgb24gdGhlIGxldmVsLTFcblx0XHRcdC8vIHN1YmFnZW50IGNoYXQgcmF0aGVyIHRoYW4gdGhlIGRlZmF1bHQgY2hhdC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLWwxJywgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1sMicsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLWwxJywgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy1sMicsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXG5cdFx0XHQvLyBMZXZlbC0yIHN1YmFnZW50IHN0YXJ0cy4gSXRzIHNwYXduaW5nIHRvb2wgKHRjLWwyKSBsaXZlcyBpbiB0aGVcblx0XHRcdC8vIGxldmVsLTEgc3ViYWdlbnQgY2hhdCwgc28gdGhlIHNpZ25hbCBjYXJyaWVzIHBhcmVudFRvb2xDYWxsSWQgPSB0Yy1sMS5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLWwyJywgYWdlbnROYW1lOiAnbDInLCBhZ2VudERpc3BsYXlOYW1lOiAnTDInLCBhZ2VudERlc2NyaXB0aW9uOiAnc2Vjb25kJywgdGFza1Byb21wdDogJ2wyIHByb21wdCcsIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1sMScgfSk7XG5cblx0XHRcdC8vIExldmVsLTMgc3ViYWdlbnQncyBzcGF3bmluZyB0b29sIHJ1bnMgSU5TSURFIHRoZSBsZXZlbC0yXG5cdFx0XHQvLyBzdWJhZ2VudCAocGFyZW50VG9vbENhbGxJZCA9IHRjLWwyKSwgbGFuZGluZyBvbiB0aGUgbGV2ZWwtMiBjaGF0LlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtbDInLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwzJywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtbDInLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWwzJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cblx0XHRcdC8vIExldmVsLTMgc3ViYWdlbnQgc3RhcnRzLiBJdHMgc3Bhd25pbmcgdG9vbCAodGMtbDMpIGxpdmVzIGluIHRoZVxuXHRcdFx0Ly8gbGV2ZWwtMiBzdWJhZ2VudCBjaGF0LCBzbyB0aGUgc2lnbmFsIGNhcnJpZXMgcGFyZW50VG9vbENhbGxJZCA9IHRjLWwyLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtbDMnLCBhZ2VudE5hbWU6ICdsMycsIGFnZW50RGlzcGxheU5hbWU6ICdMMycsIGFnZW50RGVzY3JpcHRpb246ICd0aGlyZCcsIHRhc2tQcm9tcHQ6ICdsMyBwcm9tcHQnLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtbDInIH0pO1xuXG5cdFx0XHRjb25zdCBsMUNoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1sMScpO1xuXHRcdFx0Y29uc3QgbDJDaGF0VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtbDInKTtcblx0XHRcdGNvbnN0IGwzQ2hhdFVyaSA9IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLWwzJyk7XG5cblx0XHRcdGFzc2VydC5vayhzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGwyQ2hhdFVyaSksICdsZXZlbC0yIHN1YmFnZW50IGNoYXQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShsM0NoYXRVcmkpLCAnbGV2ZWwtMyBzdWJhZ2VudCBjaGF0IHNob3VsZCBleGlzdCcpO1xuXG5cdFx0XHQvLyBBc3NlcnRzIGEgc3ViYWdlbnQncyBkaXNjb3ZlcnkgYmxvY2sgbGFuZGVkIG9uIGBwYXJlbnRDaGF0VXJpYCdzXG5cdFx0XHQvLyBgc3Bhd25pbmdUb29sSWRgIHRvb2wgY2FsbCwgcG9pbnRpbmcgYXQgYGNoaWxkQ2hhdFVyaWAuXG5cdFx0XHRjb25zdCBhc3NlcnREaXNjb3ZlcnlCbG9jayA9IChwYXJlbnRDaGF0VXJpOiBzdHJpbmcsIHNwYXduaW5nVG9vbElkOiBzdHJpbmcsIGNoaWxkQ2hhdFVyaTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJlbnRDaGF0VXJpKTtcblx0XHRcdFx0Y29uc3Qgc3Bhd25pbmdUb29sID0gcGFyZW50U3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09IHNwYXduaW5nVG9vbElkKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHNwYXduaW5nVG9vbCAmJiBzcGF3bmluZ1Rvb2wua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgYCR7c3Bhd25pbmdUb29sSWR9IHNob3VsZCBsaXZlIGluICR7bGFiZWx9YCk7XG5cdFx0XHRcdGNvbnN0IHRjID0gc3Bhd25pbmdUb29sLnRvb2xDYWxsO1xuXHRcdFx0XHQvLyBgY29udGVudGAgb25seSBleGlzdHMgb24gdGhlIHJ1bm5pbmcvY29tcGxldGVkIHZhcmlhbnRzIG9mIHRoZVxuXHRcdFx0XHQvLyBUb29sQ2FsbFN0YXRlIHVuaW9uOyB0aGUgc3Bhd25pbmcgdG9vbCBpcyBydW5uaW5nIGhlcmUuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0Yy5zdGF0dXMsIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsIGAke3NwYXduaW5nVG9vbElkfSBzaG91bGQgYmUgcnVubmluZyBpbiAke2xhYmVsfWApO1xuXHRcdFx0XHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJsb2NrID0gdGMuY29udGVudD8uZmluZChjID0+IGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQub2soYmxvY2ssIGB0aGUgZGlzY292ZXJ5IGJsb2NrIGZvciAke3NwYXduaW5nVG9vbElkfSBtdXN0IGxhbmQgb24gJHtsYWJlbH1gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChibG9jayBhcyB7IHJlc291cmNlOiBzdHJpbmcgfSkucmVzb3VyY2UsIGNoaWxkQ2hhdFVyaSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBFYWNoIGxldmVsJ3MgZGlzY292ZXJ5IGJsb2NrIGxhbmRzIG9uIGl0cyBpbW1lZGlhdGUgcGFyZW50IGNoYXQuXG5cdFx0XHRhc3NlcnREaXNjb3ZlcnlCbG9jayhsMUNoYXRVcmksICd0Yy1sMicsIGwyQ2hhdFVyaSwgJ3RoZSBsZXZlbC0xIGNoYXQnKTtcblx0XHRcdGFzc2VydERpc2NvdmVyeUJsb2NrKGwyQ2hhdFVyaSwgJ3RjLWwzJywgbDNDaGF0VXJpLCAndGhlIGxldmVsLTIgY2hhdCcpO1xuXG5cdFx0XHQvLyBFYWNoIGNoaWxkIGNoYXQncyBvcGVuaW5nIHJlcXVlc3QgaXMgc2VlZGVkIGZyb20gaXRzIG93blxuXHRcdFx0Ly8gYHN1YmFnZW50X3N0YXJ0ZWRgIHNpZ25hbCdzIGB0YXNrUHJvbXB0YC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtsMUNoYXRVcmksIGwyQ2hhdFVyaSwgbDNDaGF0VXJpXS5tYXAodXJpID0+IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUodXJpKT8uYWN0aXZlVHVybj8ubWVzc2FnZS50ZXh0KSxcblx0XHRcdFx0WydsMSBwcm9tcHQnLCAnbDIgcHJvbXB0JywgJ2wzIHByb21wdCddLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gTmVzdGVkIHNwYXduaW5nIHRvb2xzIG11c3QgTk9UIGJlIG1pc3JvdXRlZCB0byB0aGUgdG9wLWxldmVsXG5cdFx0XHQvLyBkZWZhdWx0IGNoYXQsIHdoZXJlIHRoZXkgZG8gbm90IGV4aXN0LlxuXHRcdFx0Y29uc3QgZGVmYXVsdFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgbDJUb29sSW5EZWZhdWx0ID0gZGVmYXVsdFN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiAocnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLWwyJyB8fCBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtbDMnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobDJUb29sSW5EZWZhdWx0LCB1bmRlZmluZWQsICduZXN0ZWQgc3Bhd25pbmcgdG9vbHMgbXVzdCBub3QgYXBwZWFyIGluIHRoZSB0b3AtbGV2ZWwgY2hhdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZlbnRzIHdpdGggcGFyZW50VG9vbENhbGxJZCByb3V0ZSB0byBzdWJhZ2VudCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTdGFydCBwYXJlbnQgdG9vbCArIHN1YmFnZW50XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Ly8gRmlyZSBhbiBpbm5lciB0b29sIHN0YXJ0IHdpdGggcGFyZW50VG9vbENhbGxJZFxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXRjLTEnLCB0b29sTmFtZTogJ3JlYWRGaWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXRjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZS4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgaW5uZXIgdG9vbCBjYWxsIGlzIG9uIHRoZSBzdWJhZ2VudCBjaGF0J3MgdHVybiwgbm90IHRoZSBwYXJlbnRcblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtMScpO1xuXHRcdFx0Y29uc3Qgc3ViU3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHN1YmFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5vayhzdWJTdGF0ZT8uYWN0aXZlVHVybik7XG5cdFx0XHRjb25zdCBpbm5lclRvb2wgPSBzdWJTdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci10Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhpbm5lclRvb2wsICdpbm5lciB0b29sIGNhbGwgc2hvdWxkIGJlIGluIHN1YmFnZW50IGNoYXQnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBwYXJlbnQgc2Vzc2lvbiBkb2VzIE5PVCBoYXZlIHRoZSBpbm5lciB0b29sIGNhbGxcblx0XHRcdGNvbnN0IHBhcmVudFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgcGFyZW50SW5uZXJUb29sID0gcGFyZW50U3RhdGUhLmFjdGl2ZVR1cm4hLnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAnaW5uZXItdGMtMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyZW50SW5uZXJUb29sLCB1bmRlZmluZWQsICdpbm5lciB0b29sIGNhbGwgc2hvdWxkIE5PVCBiZSBpbiBwYXJlbnQgc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGVTdWJhZ2VudFNlc3Npb24gY2xlYXJzIHBlbmRpbmcgYnVmZmVyZWQgZXZlbnRzIHdoZW4gc3ViYWdlbnQgbmV2ZXIgc3RhcnRlZCcsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb246IGlmIHRoZSBwYXJlbnQgdG9vbCBjb21wbGV0ZXMgKG9yIGZhaWxzKSBiZWZvcmUgYW55XG5cdFx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGAgYXJyaXZlcywgYnVmZmVyZWQgaW5uZXIgZXZlbnRzIHdvdWxkXG5cdFx0XHQvLyBvdGhlcndpc2UgbGVhayBpbiBgX3BlbmRpbmdTdWJhZ2VudEV2ZW50c2AgdW50aWwgc2Vzc2lvblxuXHRcdFx0Ly8gZGlzcG9zYWwuIEFmdGVyIGNvbXBsZXRpb24sIGEgbGF0ZSBgc3ViYWdlbnRfc3RhcnRlZGAgZm9yIHRoZVxuXHRcdFx0Ly8gc2FtZSB0b29sQ2FsbElkIG11c3Qgbm90IHJlcGxheSBzdGFsZSBldmVudHMuXG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdydW5TdWJhZ2VudCcsIGRpc3BsYXlOYW1lOiAnUnVuIFN1YmFnZW50JywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZy4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXG5cdFx0XHQvLyBJbm5lciBldmVudCBhcnJpdmVzIGJ1dCBgc3ViYWdlbnRfc3RhcnRlZGAgbmV2ZXIgZG9lcy5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci0xJywgdG9vbE5hbWU6ICdyZWFkJywgZGlzcGxheU5hbWU6ICdSZWFkJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUGFyZW50IHRvb2wgY29tcGxldGVzIChlLmcuIGl0IGVycm9yZWQgYmVmb3JlIGRlbGVnYXRpbmcpLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UsIHBhc3RUZW5zZU1lc3NhZ2U6ICdGYWlsZWQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gTm93IGEgbGF0ZSBgc3ViYWdlbnRfc3RhcnRlZGAgZm9yIHRoZSBzYW1lIHRvb2xDYWxsSWQgYXJyaXZlcy5cblx0XHRcdC8vIFRoaXMgaXMgdW51c3VhbCBidXQgcG9zc2libGUgYWZ0ZXIgYSByZWNvbm5lY3QvcmVwbGF5LiBUaGVcblx0XHRcdC8vIGRyYWluIG11c3QgTk9UIHJlcGxheSB0aGUgKGNsZWFyZWQpIGJ1ZmZlcmVkIGlubmVyIHRvb2wgY2FsbC5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlLCAnc3ViYWdlbnQgc2Vzc2lvbiBzaG91bGQgc3RpbGwgYmUgY3JlYXRlZCcpO1xuXHRcdFx0Y29uc3QgaW5uZXJUb29sID0gc3ViU3RhdGUhLmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAnaW5uZXItMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5uZXJUb29sLCB1bmRlZmluZWQsICdzdGFsZSBidWZmZXJlZCBpbm5lciB0b29sIGNhbGwgbXVzdCBub3QgYmUgcmVwbGF5ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmFnZW50X2NvbXBsZXRlZCBzaWduYWwgY29tcGxldGVzIHRoZSBzdWJhZ2VudCB0dXJuJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyBTdGFydCBwYXJlbnQgdG9vbCArIHN1YmFnZW50XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Ly8gQ29tcGxldGluZyB0aGUgcGFyZW50IHRvb2wgY2FsbCBtdXN0IE5PVCB0ZWFyIGRvd24gdGhlXG5cdFx0XHQvLyBzdWJhZ2VudCBzZXNzaW9uIFx1MjAxNCBiYWNrZ3JvdW5kIHN1YmFnZW50cyBrZWVwIHJ1bm5pbmcgYWZ0ZXJcblx0XHRcdC8vIHRoZWlyIHBhcmVudCB0b29sIGNhbGwgcmV0dXJucy5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTdGFydGVkIGluIGJhY2tncm91bmQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRsZXQgc3ViU3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHN1YmFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5vayhzdWJTdGF0ZSk7XG5cdFx0XHRhc3NlcnQub2soc3ViU3RhdGUhLmFjdGl2ZVR1cm4sICdzdWJhZ2VudCB0dXJuIHNob3VsZCBzdGlsbCBiZSBhY3RpdmUgYWZ0ZXIgcGFyZW50IHRvb2wgY29tcGxldGVzJyk7XG5cblx0XHRcdC8vIFRoZSBTREsncyBgc3ViYWdlbnQuY29tcGxldGVkYC9gc3ViYWdlbnQuZmFpbGVkYCBldmVudCBpcyB3aGF0XG5cdFx0XHQvLyBhY3R1YWxseSBjbG9zZXMgdGhlIHN1YmFnZW50IHNlc3Npb24uXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnIH0pO1xuXG5cdFx0XHRzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YlN0YXRlIS5hY3RpdmVUdXJuLCB1bmRlZmluZWQsICdzdWJhZ2VudCB0dXJuIHNob3VsZCBiZSBjb21wbGV0ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJTdGF0ZSEudHVybnMubGVuZ3RoLCAxKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X3Jlc3VtZWQnLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0ZvbGxvdyB1cCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6ICdwYXJlbnQtdHVybicsXG5cdFx0XHRcdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ2ZvbGxvdy11cC1wYXJ0JywgY29udGVudDogJ0ZvbGxvdy11cCByZXNwb25zZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG1lc3NhZ2U6IHN1YlN0YXRlPy5hY3RpdmVUdXJuPy5tZXNzYWdlLnRleHQsXG5cdFx0XHRcdHJlc3BvbnNlOiBzdWJTdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0c1swXSxcblx0XHRcdFx0Y29tcGxldGVkVHVybnM6IHN1YlN0YXRlPy50dXJucy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1lc3NhZ2U6ICdGb2xsb3cgdXAnLFxuXHRcdFx0XHRyZXNwb25zZTogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ2ZvbGxvdy11cC1wYXJ0JywgY29udGVudDogJ0ZvbGxvdy11cCByZXNwb25zZScgfSxcblx0XHRcdFx0Y29tcGxldGVkVHVybnM6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blcm1pc3Npb24gcmVxdWVzdHMgZm9yIGluYWN0aXZlIGFuZCB1bnJvdXRhYmxlIHN1YmFnZW50cyBhcmUgZGVuaWVkJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtaW5hY3RpdmUnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9jb21wbGV0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtaW5hY3RpdmUnIH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1zdGFydGluZycsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtc3RhcnRpbmctcGVybWlzc2lvbicsIHRvb2xOYW1lOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ1NoZWxsJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiAndGMtc3RhcnRpbmcnLFxuXHRcdFx0XHRzdGF0ZTogeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sIHRvb2xDYWxsSWQ6ICd0Yy1zdGFydGluZy1wZXJtaXNzaW9uJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiAndGMtaW5hY3RpdmUnLFxuXHRcdFx0XHRzdGF0ZTogeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sIHRvb2xDYWxsSWQ6ICd0Yy1pbmFjdGl2ZS1wZXJtaXNzaW9uJywgdG9vbE5hbWU6ICdzaGVsbCcsIGRpc3BsYXlOYW1lOiAnU2hlbGwnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLFxuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiAndGMtbWlzc2luZycsXG5cdFx0XHRcdHN0YXRlOiB7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiwgdG9vbENhbGxJZDogJ3RjLW1pc3NpbmctcGVybWlzc2lvbicsIHRvb2xOYW1lOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ1NoZWxsJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25DYWxscywgW1xuXHRcdFx0XHR7IHJlcXVlc3RJZDogJ3RjLWluYWN0aXZlLXBlcm1pc3Npb24nLCBhcHByb3ZlZDogZmFsc2UgfSxcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1taXNzaW5nLXBlcm1pc3Npb24nLCBhcHByb3ZlZDogZmFsc2UgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsU3ViYWdlbnRTZXNzaW9ucyBjYW5jZWxzIGFsbCBzdWJhZ2VudCBjaGF0cycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFN0YXJ0IHR3byBwYXJlbnQgdG9vbCBjYWxscyB3aXRoIHN1YmFnZW50c1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3J1blN1YmFnZW50JywgZGlzcGxheU5hbWU6ICdTdWIgMScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcgMS4uLicsIHRvb2xJbnB1dDogdW5kZWZpbmVkLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtMScsIGFnZW50TmFtZTogJ3N1YjEnLCBhZ2VudERpc3BsYXlOYW1lOiAnU3ViIDEnLCBhZ2VudERlc2NyaXB0aW9uOiAnRmlyc3QnIH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMicsIHRvb2xOYW1lOiAncnVuU3ViYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1N1YiAyJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMicsIGludm9jYXRpb25NZXNzYWdlOiAnRGVsZWdhdGluZyAyLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy0yJywgYWdlbnROYW1lOiAnc3ViMicsIGFnZW50RGlzcGxheU5hbWU6ICdTdWIgMicsIGFnZW50RGVzY3JpcHRpb246ICdTZWNvbmQnIH0pO1xuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQm90aCBzdWJhZ2VudCBjaGF0cyBzaG91bGQgaGF2ZSB0aGVpciB0dXJucyBjb21wbGV0ZWQgKGNhbmNlbGxlZClcblx0XHRcdGNvbnN0IHN1YjEgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3RjLTEnKSk7XG5cdFx0XHRjb25zdCBzdWIyID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0yJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YjE/LmFjdGl2ZVR1cm4sIHVuZGVmaW5lZCwgJ3N1YjEgdHVybiBzaG91bGQgYmUgY2FuY2VsbGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViMj8uYWN0aXZlVHVybiwgdW5kZWZpbmVkLCAnc3ViMiB0dXJuIHNob3VsZCBiZSBjYW5jZWxsZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZVN1YmFnZW50U2Vzc2lvbnMgcmVtb3ZlcyBhbGwgc3ViYWdlbnQgY2hhdHMgZnJvbSBzdGF0ZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3J1blN1YmFnZW50JywgZGlzcGxheU5hbWU6ICdTdWIgMScsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdzdWInLCBhZ2VudERpc3BsYXlOYW1lOiAnU3ViJywgYWdlbnREZXNjcmlwdGlvbjogJ0hhcyBzdWJhZ2VudCcgfSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoc3ViYWdlbnRVcmkpKTtcblxuXHRcdFx0c2lkZUVmZmVjdHMucmVtb3ZlU3ViYWdlbnRTZXNzaW9ucyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShzdWJhZ2VudFVyaSksIHVuZGVmaW5lZCwgJ3N1YmFnZW50IGNoYXQgc2hvdWxkIGJlIHJlbW92ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbHRhcyB3aXRoIHBhcmVudFRvb2xDYWxsSWQgcm91dGUgdG8gc3ViYWdlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3J1blN1YmFnZW50JywgZGlzcGxheU5hbWU6ICdSdW4gU3ViYWdlbnQnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLCBfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0gfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgYWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Yy0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy0xJywgYWdlbnROYW1lOiAnaGVscGVyJywgYWdlbnREaXNwbGF5TmFtZTogJ0hlbHBlcicsIGFnZW50RGVzY3JpcHRpb246ICdIZWxwcycgfSk7XG5cblx0XHRcdC8vIEZpcmUgYSBkZWx0YSB3aXRoIHBhcmVudFRvb2xDYWxsSWRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbXNnLXN1YicsIGNvbnRlbnQ6ICd0aGlua2luZy4uLicgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgZGVsdGEgd2VudCB0byB0aGUgc3ViYWdlbnQgc2Vzc2lvblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy0xJyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlPy5hY3RpdmVUdXJuKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duUGFydCA9IHN1YlN0YXRlIS5hY3RpdmVUdXJuIS5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd25cblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Rvd25QYXJ0LCAnZGVsdGEgc2hvdWxkIGNyZWF0ZSBhIG1hcmtkb3duIHBhcnQgaW4gc3ViYWdlbnQgc2Vzc2lvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbF9jb21wbGV0ZSBwcmVzZXJ2ZXMgc3ViYWdlbnQgY29udGVudCBpbiBjb21wbGV0ZWQgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnVGFzaycsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsIF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSB9IH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0RlbGVnYXRpbmcuLi4nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfSB9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7IGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgdG9vbENhbGxJZDogJ3RjLTEnLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0pO1xuXG5cdFx0XHQvLyBWZXJpZnkgc3ViYWdlbnQgY29udGVudCBpcyBvbiB0aGUgcnVubmluZyB0b29sXG5cdFx0XHRjb25zdCBydW5uaW5nU3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBydW5uaW5nVG9vbCA9IHJ1bm5pbmdTdGF0ZT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhydW5uaW5nVG9vbD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmluZ1Rvb2wudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKTtcblxuXHRcdFx0Ly8gQ29tcGxldGUgdGhlIHRvb2wgXHUyMDE0IHRoZSBTREsgcmVzdWx0IGhhcyBpdHMgb3duIGNvbnRlbnRcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdEZWxlZ2F0ZWQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0RvbmUnIH1dIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBjb21wbGV0ZWQgdG9vbCBzdGlsbCBoYXMgdGhlIHN1YmFnZW50IGNvbnRlbnQgZW50cnlcblx0XHRcdGNvbnN0IGNvbXBsZXRlZFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkVG9vbCA9IGNvbXBsZXRlZFN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLTEnXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlZFRvb2w/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlZFRvb2wudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGNvbXBsZXRlZFRvb2wudG9vbENhbGwuY29udGVudCA/PyBbXTtcblx0XHRcdGNvbnN0IHN1YmFnZW50RW50cnkgPSBjb250ZW50LmZpbmQoYyA9PiBoYXNLZXkoYywgeyB0eXBlOiB0cnVlIH0pICYmIGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KTtcblx0XHRcdGFzc2VydC5vayhzdWJhZ2VudEVudHJ5LCAnQ29tcGxldGVkIHRvb2wgc2hvdWxkIHByZXNlcnZlIHN1YmFnZW50IGNvbnRlbnQgZW50cnknKTtcblx0XHRcdGNvbnN0IHRleHRFbnRyeSA9IGNvbnRlbnQuZmluZChjID0+IGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCk7XG5cdFx0XHRhc3NlcnQub2sodGV4dEVudHJ5LCAnQ29tcGxldGVkIHRvb2wgc2hvdWxkIGFsc28gaGF2ZSB0aGUgU0RLIHJlc3VsdCBjb250ZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbm5lciB0b29sX3N0YXJ0IGFycml2aW5nIEJFRk9SRSBzdWJhZ2VudF9zdGFydGVkIHJvdXRlcyB0byBzdWJhZ2VudCAobm90IHBhcmVudCknLCAoKSA9PiB7XG5cdFx0XHQvLyBSZXByb2R1Y2VzIHRoZSByZWdyZXNzaW9uIHdoZXJlIGlubmVyIHN1YmFnZW50IHRvb2wgY2FsbHMgc2hvdyB1cFxuXHRcdFx0Ly8gZmxhdCBhdCB0aGUgdG9wIGxldmVsIG9mIHRoZSBwYXJlbnQgc2Vzc2lvbiBiZWNhdXNlIHRoZSBTREsgY2FuXG5cdFx0XHQvLyBlbWl0IGB0b29sX3N0YXJ0YCAod2l0aCBwYXJlbnRUb29sQ2FsbElkKSBiZWZvcmUgYHN1YmFnZW50X3N0YXJ0ZWRgLlxuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHQvLyAxLiBQYXJlbnQgdG9vbCBzdGFydHMgKHRoZSBgdGFza2AgaW52b2NhdGlvbikuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cblx0XHRcdC8vIDIuIElubmVyIHRvb2wgZmlyZXMgQkVGT1JFIHN1YmFnZW50X3N0YXJ0ZWQgKHJhY2UgY29uZGl0aW9uKS5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXRjLTEnLCB0b29sTmFtZTogJ3JlYWRGaWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItdGMtMScsIGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gMy4gc3ViYWdlbnRfc3RhcnRlZCBhcnJpdmVzIGxhdGVyLlxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgYWdlbnROYW1lOiAnaGVscGVyJywgYWdlbnREaXNwbGF5TmFtZTogJ0hlbHBlcicsIGFnZW50RGVzY3JpcHRpb246ICdIZWxwcycgfSk7XG5cblx0XHRcdGNvbnN0IHN1YmFnZW50VXJpID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndGMtcGFyZW50Jyk7XG5cdFx0XHRjb25zdCBzdWJTdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN1YlN0YXRlPy5hY3RpdmVUdXJuLCAnc3ViYWdlbnQgc2Vzc2lvbiBzaG91bGQgZXhpc3QnKTtcblxuXHRcdFx0Y29uc3QgaW5uZXJUb29sID0gc3ViU3RhdGUhLmFjdGl2ZVR1cm4hLnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAnaW5uZXItdGMtMSdcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soaW5uZXJUb29sLCAnaW5uZXIgdG9vbCBmaXJlZCBiZWZvcmUgc3ViYWdlbnRfc3RhcnRlZCBzaG91bGQgc3RpbGwgZW5kIHVwIGluIHRoZSBzdWJhZ2VudCBzZXNzaW9uJyk7XG5cblx0XHRcdC8vIFBhcmVudCBtdXN0IE5PVCBoYXZlIHRoZSBpbm5lciB0b29sLlxuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBwYXJlbnRJbm5lclRvb2wgPSBwYXJlbnRTdGF0ZSEuYWN0aXZlVHVybiEucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJwLnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICdpbm5lci10Yy0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJlbnRJbm5lclRvb2wsIHVuZGVmaW5lZCwgJ2lubmVyIHRvb2wgbXVzdCBub3QgbGVhayBpbnRvIHBhcmVudCBzZXNzaW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkcyBpbnNpZGUgcGFyZW50IHdvcmtpbmcgZGlyZWN0b3J5IGFyZSBhdXRvLWFwcHJvdmVkIGZvciB0b29scyBpbiBzdWJhZ2VudCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFN1YmFnZW50IHNlc3Npb25zIGRvbid0IGNhcnJ5IHRoZWlyIG93biB3b3JraW5nRGlyZWN0b3J5IG9yXG5cdFx0XHQvLyBhdXRvQXBwcm92ZSBjb25maWcuIFdpdGhvdXQgaW5oZXJpdGFuY2UgZnJvbSB0aGUgcGFyZW50LCBldmVyeVxuXHRcdFx0Ly8gdG9vbCBjYWxsIGluc2lkZSBhIHN1YmFnZW50IChldmVuIGEgcmVhZCBpbiB0aGUgd29ya3NwYWNlKSB3b3VsZFxuXHRcdFx0Ly8gc3VyZmFjZSBhIGNvbmZpcm1hdGlvbiBkaWFsb2cuXG5cdFx0XHRzZXR1cFNlc3Npb24oVVJJLmZpbGUoJy93b3Jrc3BhY2UnKS50b1N0cmluZygpKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdC8vIFBhcmVudCB0YXNrIHRvb2wgc3Bhd25zIGEgc3ViYWdlbnQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Ly8gSW5uZXIgdG9vbCBpbnNpZGUgdGhlIHN1YmFnZW50IHJlcXVlc3RzIHBlcm1pc3Npb24gdG8gcmVhZCBhIGZpbGVcblx0XHRcdC8vIGluc2lkZSB0aGUgcGFyZW50IHdvcmtzcGFjZS5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXJlYWQtMScsIHRvb2xOYW1lOiAncmVhZCcsIGRpc3BsYXlOYW1lOiAnUmVhZCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci1yZWFkLTEnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWQgZmlsZScsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItcmVhZC0xJywgdG9vbE5hbWU6ICcnLCBkaXNwbGF5TmFtZTogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkIHNyYy9hcHAudHMnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwZXJtaXNzaW9uUGF0aDogJy93b3Jrc3BhY2Uvc3JjL2FwcC50cycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAnaW5uZXItcmVhZC0xJywgYXBwcm92ZWQ6IHRydWUgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbi1sZXZlbCBhdXRvQXBwcm92ZSBvbiB0aGUgcGFyZW50IGlzIGluaGVyaXRlZCBieSB0b29scyBpbiBzdWJhZ2VudCBzZXNzaW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbihVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gU2V0IHRoZSBwYXJlbnQgc2Vzc2lvbiB0byBcIkJ5cGFzcyBBcHByb3ZhbHNcIiB2aWEgc2Vzc2lvbiBjb25maWcuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnQXBwcm92YWxzJyxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJywgJ2F1dG9waWxvdCddLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCwgX21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9IH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0gfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLCBhZ2VudE5hbWU6ICdoZWxwZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnSGVscGVyJywgYWdlbnREZXNjcmlwdGlvbjogJ0hlbHBzJyB9KTtcblxuXHRcdFx0Ly8gSW5uZXIgd3JpdGUgb3V0c2lkZSB0aGUgd29ya3NwYWNlIHdvdWxkIG5vcm1hbGx5IE5PVCBhdXRvLWFwcHJvdmUsXG5cdFx0XHQvLyBidXQgc2Vzc2lvbi1sZXZlbCBhdXRvQXBwcm92ZSBvbiB0aGUgcGFyZW50IG11c3QgYXBwbHkuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdpbm5lci13cml0ZS0xJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItd3JpdGUtMScsIGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItd3JpdGUtMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgL3RtcC9mb28nLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogdW5kZWZpbmVkLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ3dyaXRlJywgcGVybWlzc2lvblBhdGg6ICcvdG1wL2ZvbycsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4gYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLmxlbmd0aCA+IDAgfHwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAnaW5uZXItd3JpdGUtMScsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGlucHV0TmVlZGVkIHByb2R1Y3Rpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzZXNzaW9uIGlucHV0TmVlZGVkIHByb2R1Y3Rpb24nLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBzZXNzaW9uSW5wdXROZWVkZWQoKSB7XG5cdFx0XHRyZXR1cm4gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5pbnB1dE5lZWRlZCA/PyBbXTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjaGF0IGlucHV0IHJlcXVlc3QgbWlycm9ycyBpdHMgdW5yZXNvbHZlZCByZXNwb25zZSBwYXJ0IGFuZCBpcyByZW1vdmVkIG9uIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRcdHF1ZXN0aW9uczogW3sga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAncXVlc3Rpb24tMScsIG1lc3NhZ2U6ICdXaGljaCB2YWx1ZT8nIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRBbnN3ZXJDaGFuZ2VkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXEtMScsXG5cdFx0XHRcdHF1ZXN0aW9uSWQ6ICdxdWVzdGlvbi0xJyxcblx0XHRcdFx0YW5zd2VyOiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLkRyYWZ0LFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ2RyYWZ0IHZhbHVlJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHByb2R1Y2VkID0gc2Vzc2lvbklucHV0TmVlZGVkKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2R1Y2VkLm1hcChyID0+ICh7XG5cdFx0XHRcdGtpbmQ6IHIua2luZCxcblx0XHRcdFx0Y2hhdDogci5jaGF0LFxuXHRcdFx0XHRyZXF1ZXN0OiByLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLkNoYXRJbnB1dCA/IHIucmVxdWVzdCA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuQ2hhdElucHV0LFxuXHRcdFx0XHRcdGNoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0XHRcdHJlcXVlc3Q6IHtcblx0XHRcdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRcdFx0cXVlc3Rpb25zOiBbeyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdxdWVzdGlvbi0xJywgbWVzc2FnZTogJ1doaWNoIHZhbHVlPycgfV0sXG5cdFx0XHRcdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdFx0XHRcdCdxdWVzdGlvbi0xJzoge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5EcmFmdCxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdkcmFmdCB2YWx1ZScgfSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcS0xJyxcblx0XHRcdFx0cmVzcG9uc2U6IFNlc3Npb25JbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uSW5wdXROZWVkZWQoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2hhdCBpbnB1dCByZXF1ZXN0IHdpdGhvdXQgYW4gYWN0aXZlIHR1cm4gaXMgbm90IG1pcnJvcmVkJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDogeyBpZDogJ3JlcS0xJywgcXVlc3Rpb25zOiBbXSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2wgY29uZmlybWF0aW9uIGlzIHByb2R1Y2VkIHdoaWxlIHBlbmRpbmcgYW5kIHJlbW92ZWQgb25jZSBjb25maXJtZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJyxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJywgY29uZmlybWF0aW9uVGl0bGU6ICdXcml0ZSBmaWxlJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBwZW5kaW5nID0gc2Vzc2lvbklucHV0TmVlZGVkKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwZW5kaW5nLm1hcChyID0+ICh7IGtpbmQ6IHIua2luZCwgY2hhdDogci5jaGF0LCB0b29sQ2FsbElkOiByLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24gPyByLnRvb2xDYWxsLnRvb2xDYWxsSWQgOiB1bmRlZmluZWQgfSkpLFxuXHRcdFx0XHRbeyBraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdG9vbENhbGxJZDogJ3RjLTEnIH1dLFxuXHRcdFx0KTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsIGFwcHJvdmVkOiB0cnVlLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlVzZXJBY3Rpb24sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uSW5wdXROZWVkZWQoKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xpZW50IHRvb2wgZXhlY3V0aW9uIGlzIHByb2R1Y2VkIHdoaWxlIHJ1bm5pbmcgYW5kIHJlbW92ZWQgb25jZSBjb21wbGV0ZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQnLCB0b29sTmFtZTogJ3Rvb2xTZWFyY2gnLCBkaXNwbGF5TmFtZTogJ1NlYXJjaCBmb3IgVG9vbHMnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcnLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBydW5uaW5nID0gc2Vzc2lvbklucHV0TmVlZGVkKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRydW5uaW5nLm1hcChyID0+ICh7IGtpbmQ6IHIua2luZCwgY2hhdDogci5jaGF0LCBjbGllbnRJZDogci5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9uID8gci5jbGllbnRJZCA6IHVuZGVmaW5lZCB9KSksXG5cdFx0XHRcdFt7IGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCBjbGllbnRJZDogJ2NsaWVudC0xJyB9XSxcblx0XHRcdCk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50JywgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTZWFyY2hlZCcgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25JbnB1dE5lZWRlZCgpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVkIHRvb2wgY2FsbCBpcyBrZXB0IG91dCBvZiB0aGUgc2Vzc2lvbiBpbnB1dE5lZWRlZCBxdWV1ZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0Ly8gQXV0by1hcHByb3ZlZCBjYWxscyBmbG93IHRocm91Z2ggUGVuZGluZ0NvbmZpcm1hdGlvbiB0aGVuIFJ1bm5pbmcgYnV0IG5ldmVyIGJsb2NrIHRoZSB1c2VyLlxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1hdXRvJywgdG9vbE5hbWU6ICdicm93c2VyX25hdmlnYXRlJywgZGlzcGxheU5hbWU6ICdOYXZpZ2F0ZSBCcm93c2VyJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0XHRfbWV0YTogeyBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8nLCBpbnZvY2F0aW9uTWVzc2FnZTogJ05hdmlnYXRlJywgY29uZmlybWF0aW9uVGl0bGU6ICdOYXZpZ2F0ZScsXG5cdFx0XHRcdF9tZXRhOiB7IGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdLCAnbm8gY29uZmlybWF0aW9uIGVudHJ5IHdoaWxlIFBlbmRpbmdDb25maXJtYXRpb24nKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtYXV0bycsIGFwcHJvdmVkOiB0cnVlLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCksIFtdLCAnbm8gY2xpZW50LWV4ZWN1dGlvbiBlbnRyeSB3aGlsZSBSdW5uaW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVkIHRvb2wgc3RpbGwgc3VyZmFjZXMgYSBnZW51aW5lIHJlc3VsdCBjb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdC8vIFRoZSBhdXRvLWFwcHJvdmVkIHBhcmFtZXRlciBnYXRlIGlzIHN1cHByZXNzZWQsIGJ1dCBhIHBvc3QtZXhlY3V0aW9uIHJlc3VsdCBnYXRlIGlzIGEgZ2VudWluZSBwcm9tcHQuXG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tcmVzdWx0JywgdG9vbE5hbWU6ICdicm93c2VyX25hdmlnYXRlJywgZGlzcGxheU5hbWU6ICdOYXZpZ2F0ZSBCcm93c2VyJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9LFxuXHRcdFx0XHRfbWV0YTogeyBhdXRvQXBwcm92ZUJ5U2V0dGluZzogdHJ1ZSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tcmVzdWx0JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdOYXZpZ2F0ZScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWF1dG8tcmVzdWx0JywgcmVxdWlyZXNSZXN1bHRDb25maXJtYXRpb246IHRydWUsXG5cdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnTmF2aWdhdGVkJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlc3Npb25JbnB1dE5lZWRlZCgpLm1hcChyID0+ICh7IGtpbmQ6IHIua2luZCwgdG9vbENhbGxJZDogci5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uID8gci50b29sQ2FsbC50b29sQ2FsbElkIDogdW5kZWZpbmVkIH0pKSxcblx0XHRcdFx0W3sga2luZDogU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENvbmZpcm1hdGlvbiwgdG9vbENhbGxJZDogJ3RjLWF1dG8tcmVzdWx0JyB9XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdNQ1AgdG9vbCBhdXRoZW50aWNhdGlvbiBpcyBwcm9kdWNlZCB3aGlsZSBhdXRoIGlzIHJlcXVpcmVkIGFuZCByZW1vdmVkIG9uY2UgcmVzb2x2ZWQnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWNwJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdnZXRfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnR2V0IEZpbGUnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ21jcC0xJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1jcCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnR2V0dGluZyBmaWxlJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXF1aXJlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1jcCcsXG5cdFx0XHRcdGF1dGg6IHtcblx0XHRcdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5JbnN1ZmZpY2llbnRTY29wZSxcblx0XHRcdFx0XHRyZXNvdXJjZToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScsXG5cdFx0XHRcdFx0XHRhdXRob3JpemF0aW9uX3NlcnZlcnM6IFsnaHR0cHM6Ly9hdXRoLmV4YW1wbGUuY29tJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZFNjb3BlczogWydyZXBvJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHNlc3Npb25JbnB1dE5lZWRlZCgpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tY3AnLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQ2FuY2VsbGVkIHRvb2wgY2FsbCcsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ01DUCBhdXRoZW50aWNhdGlvbiB3YXMgY2FuY2VsbGVkJywgY29kZTogJ2NhbmNlbGxlZCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGVuZGluZzogcGVuZGluZy5tYXAocmVxdWVzdCA9PiAoe1xuXHRcdFx0XHRcdGtpbmQ6IHJlcXVlc3Qua2luZCxcblx0XHRcdFx0XHRjaGF0OiByZXF1ZXN0LmNoYXQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogcmVxdWVzdC5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQXV0aGVudGljYXRpb24gPyByZXF1ZXN0LnRvb2xDYWxsLnRvb2xDYWxsSWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0cmVzb2x2ZWQ6IHNlc3Npb25JbnB1dE5lZWRlZCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwZW5kaW5nOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xBdXRoZW50aWNhdGlvbixcblx0XHRcdFx0XHRjaGF0OiBkZWZhdWx0Q2hhdFVyaSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWNwJyxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJlc29sdmVkOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5kaW5nIHRoZSB0dXJuIGNsZWFycyB0aGUgY2hhdFxcJ3Mgb3V0c3RhbmRpbmcgcmVxdWVzdHMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDogeyBpZDogJ3JlcS0xJywgcXVlc3Rpb25zOiBbXSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbklucHV0TmVlZGVkKCkubGVuZ3RoLCAxKTtcblxuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25JbnB1dE5lZWRlZCgpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIGJsb2NrZXIgaW5zaWRlIGEgc3ViYWdlbnQgaXMgcHJvZHVjZWQgYWdhaW5zdCB0aGUgc3ViYWdlbnQgY2hhdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLXBhcmVudCcsIHRvb2xOYW1lOiAndGFzaycsIGRpc3BsYXlOYW1lOiAnRGVsZWdhdGUgVGFzaycgfSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ3N1YmFnZW50X3N0YXJ0ZWQnLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCB0b29sQ2FsbElkOiAndGMtcGFyZW50JywgYWdlbnROYW1lOiAnaGVscGVyJywgYWdlbnREaXNwbGF5TmFtZTogJ0hlbHBlcicgfSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIHBhcmVudFRvb2xDYWxsSWQ6ICd0Yy1wYXJlbnQnLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgdG9vbE5hbWU6ICd3cml0ZScsIGRpc3BsYXlOYW1lOiAnV3JpdGUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGMtaW5uZXInLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLCBjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0Yy1wYXJlbnQnKTtcblx0XHRcdGNvbnN0IHByb2R1Y2VkID0gYXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb25JbnB1dE5lZWRlZCgpLmZpbmQociA9PiByLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24pO1xuXHRcdFx0XHRyZXR1cm4gZW50cnk/LmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24gPyBlbnRyeSA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2hhdDogcHJvZHVjZWQuY2hhdCwgdG9vbENhbGxJZDogcHJvZHVjZWQudG9vbENhbGwudG9vbENhbGxJZCB9LCB7IGNoYXQ6IHN1YmFnZW50VXJpLCB0b29sQ2FsbElkOiAndGMtaW5uZXInIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gcGVybWlzc2lvbnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3Nlc3Npb24gcGVybWlzc2lvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd0b29sX3JlYWR5IGFjdGlvbiBpbmNsdWRlcyBjb25maXJtYXRpb24gb3B0aW9ucyB3aGVuIGNvbmZpcm1hdGlvbiBpcyBuZWVkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0xJywgdG9vbE5hbWU6ICdDdXN0b21Ub29sJywgZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMScsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjdXN0b20gdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTEnLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjdXN0b20gdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGN1c3RvbSB0b29sJywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IGZvdW5kID0gcz8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKFxuXHRcdFx0XHRcdHJwID0+IHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gJ3RjLXBlcm0tMSdcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIGZvdW5kPy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIGZvdW5kLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiA/IHMgOiB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRjID0gc3RhdGUhLmFjdGl2ZVR1cm4hLnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0cnAgPT4gcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtcGVybS0xJ1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayh0YyAmJiB0Yy5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCAndG9vbCBjYWxsIHNob3VsZCBleGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRjLnRvb2xDYWxsLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbik7XG5cdFx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheSh0Yy50b29sQ2FsbC5vcHRpb25zKSwgJ29wdGlvbnMgc2hvdWxkIGJlIGFuIGFycmF5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRjLnRvb2xDYWxsLm9wdGlvbnMhLm1hcChvID0+IG8uaWQpLCBbJ2FsbG93LXNlc3Npb24nLCAnYWxsb3ctb25jZScsICdza2lwJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2hhdFRvb2xDYWxsQ29uZmlybWVkIHdpdGggYWxsb3ctc2Vzc2lvbiBhZGRzIHRvb2wgdG8gc2Vzc2lvbiBwZXJtaXNzaW9ucycsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdFx0dmFsdWVzOiB7fSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0yJywgdG9vbE5hbWU6ICdDdXN0b21Ub29sJywgZGlzcGxheU5hbWU6ICdDdXN0b20gVG9vbCcsIGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6IHVuZGVmaW5lZCwgbGFuZ3VhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMicsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjdXN0b20gdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsIGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTInLCB0b29sTmFtZTogJycsIGRpc3BsYXlOYW1lOiAnJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjdXN0b20gdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGN1c3RvbSB0b29sJywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsIHBlcm1pc3Npb25QYXRoOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0yJyxcblx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbmZpcm1lZDogJ3VzZXItYWN0aW9uJyBhcyBjb25zdCxcblx0XHRcdFx0c2VsZWN0ZWRPcHRpb25JZDogJ2FsbG93LXNlc3Npb24nLFxuXHRcdFx0fSBhcyBDaGF0QWN0aW9uKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZFN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0dXBkYXRlZFN0YXRlIS5jb25maWchLnZhbHVlcy5wZXJtaXNzaW9ucyxcblx0XHRcdFx0eyBhbGxvdzogWydDdXN0b21Ub29sJ10sIGRlbnk6IFtdIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vic2VxdWVudCB0b29sX3JlYWR5IGZvciBzYW1lIHRvb2wgaXMgYXV0by1hcHByb3ZlZCBhZnRlciBhbGxvdy1zZXNzaW9uIHBlcm1pc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdHZhbHVlczogeyBwZXJtaXNzaW9uczogeyBhbGxvdzogWydDdXN0b21Ub29sJ10sIGRlbnk6IFtdIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZXJtLTMnLCB0b29sTmFtZTogJ0N1c3RvbVRvb2wnLCBkaXNwbGF5TmFtZTogJ0N1c3RvbSBUb29sJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGVybS0zJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlcm0tMycsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY3VzdG9tIHRvb2wnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoID4gMCB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICd0Yy1wZXJtLTMnLCBhcHByb3ZlZDogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYW5hZ2VkIGFwcHJvdmFsIGJ5cGFzc2VzIGdsb2JhbCwgc2Vzc2lvbiwgYW5kIHBlci10b29sIGF1dG8tYXBwcm92YWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgW0FnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdFx0dmFsdWVzOiB7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b0FwcHJvdmUnLFxuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogeyBhbGxvdzogWydDdXN0b21Ub29sJ10sIGRlbnk6IFtdIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFuYWdlZCcsIHRvb2xOYW1lOiAnQ3VzdG9tVG9vbCcsIGRpc3BsYXlOYW1lOiAnQ3VzdG9tIFRvb2wnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAncGVuZGluZ19jb25maXJtYXRpb24nLCBjaGF0OiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFuYWdlZCcsIHRvb2xOYW1lOiAnQ3VzdG9tVG9vbCcsIGRpc3BsYXlOYW1lOiAnQ3VzdG9tIFRvb2wnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIG1hbmFnZWQgY3VzdG9tIHRvb2wnLCB0b29sSW5wdXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBtYW5hZ2VkIGN1c3RvbSB0b29sJywgZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQ6ICdjdXN0b20tdG9vbCcsXG5cdFx0XHRcdG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gYXdhaXQgd2FpdEZvclN0YXRlKHN0YXRlTWFuYWdlciwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQoXG5cdFx0XHRcdFx0cmVzcG9uc2VQYXJ0ID0+IHJlc3BvbnNlUGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHJlc3BvbnNlUGFydC50b29sQ2FsbC50b29sQ2FsbElkID09PSAndGMtbWFuYWdlZCdcblx0XHRcdFx0KTtcblx0XHRcdFx0cmV0dXJuIHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdFx0XHQ/IHBhcnQudG9vbENhbGxcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiB0b29sQ2FsbC5zdGF0dXMsXG5cdFx0XHRcdG9wdGlvbnM6IHRvb2xDYWxsLm9wdGlvbnM/Lm1hcChvcHRpb24gPT4gb3B0aW9uLmlkKSxcblx0XHRcdFx0cmVzcG9uc2VzOiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0b3B0aW9uczogWydhbGxvdy1vbmNlJywgJ3NraXAnXSxcblx0XHRcdFx0cmVzcG9uc2VzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuYWdlZCBhcHByb3ZhbCBkb2VzIG5vdCBwZXJzaXN0IGFsbG93LXNlc3Npb24gZnJvbSB0aGUgY2xpZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgcGVybWlzc2lvbnM6IHsgYWxsb3c6IFsnRXhpc3RpbmdUb29sJ10sIGRlbnk6IFtdIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tYW5hZ2VkJywgdG9vbE5hbWU6ICdNYW5hZ2VkVG9vbCcsIGRpc3BsYXlOYW1lOiAnTWFuYWdlZCBUb29sJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW1hbmFnZWQnLCB0b29sTmFtZTogJ01hbmFnZWRUb29sJywgZGlzcGxheU5hbWU6ICdNYW5hZ2VkIFRvb2wnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIG1hbmFnZWQgdG9vbCcsIHRvb2xJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIG1hbmFnZWQgdG9vbCcsIGVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBlcm1pc3Npb25LaW5kOiAnY3VzdG9tLXRvb2wnLFxuXHRcdFx0XHRtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkudG9TdHJpbmcoKSk/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHMuZmluZChcblx0XHRcdFx0XHRyZXNwb25zZVBhcnQgPT4gcmVzcG9uc2VQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcmVzcG9uc2VQYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09ICd0Yy1tYW5hZ2VkJ1xuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbjtcblx0XHRcdH0pO1xuXHRcdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFuYWdlZCcsXG5cdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRjb25maXJtZWQ6ICd1c2VyLWFjdGlvbicsXG5cdFx0XHRcdHNlbGVjdGVkT3B0aW9uSWQ6ICdhbGxvdy1zZXNzaW9uJyxcblx0XHRcdH0gYXMgQ2hhdEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnQucmVzcG9uZFRvUGVybWlzc2lvbkNhbGxzLCBbXG5cdFx0XHRcdHsgcmVxdWVzdElkOiAndGMtbWFuYWdlZCcsIGFwcHJvdmVkOiB0cnVlIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaS50b1N0cmluZygpKT8uY29uZmlnPy52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10sXG5cdFx0XHRcdHsgYWxsb3c6IFsnRXhpc3RpbmdUb29sJ10sIGRlbnk6IFtdIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViYWdlbnQgdG9vbCBjYWxscyBpbmhlcml0IHBhcmVudCBzZXNzaW9uIHBlcm1pc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgcGVybWlzc2lvbnM6IHsgYWxsb3c6IFsnQ3VzdG9tVG9vbCddLCBkZW55OiBbXSB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50JywgdG9vbE5hbWU6ICd0YXNrJywgZGlzcGxheU5hbWU6ICdUYXNrJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcGFyZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nLi4uJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFnZW50TmFtZTogJ2hlbHBlcicsXG5cdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6ICdIZWxwZXInLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiAnSGVscHMnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSwgcGFyZW50VG9vbENhbGxJZDogJ3RjLXBhcmVudCcsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXBlcm0tMScsIHRvb2xOYW1lOiAnQ3VzdG9tVG9vbCcsIGRpc3BsYXlOYW1lOiAnQ3VzdG9tIFRvb2wnLCBjb250cmlidXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiB1bmRlZmluZWQsIGxhbmd1YWdlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBwYXJlbnRUb29sQ2FsbElkOiAndGMtcGFyZW50Jyxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnaW5uZXItcGVybS0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YWdlbnQuZmlyZVByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJywgY2hhdDogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ2lubmVyLXBlcm0tMScsIHRvb2xOYW1lOiAnJywgZGlzcGxheU5hbWU6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGN1c3RvbSB0b29sJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY3VzdG9tIHRvb2wnLCBlZGl0czogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogJ2N1c3RvbS10b29sJywgcGVybWlzc2lvblBhdGg6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoc3RhdGVNYW5hZ2VyLCAoKSA9PiBhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMubGVuZ3RoID4gMCB8fCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uQ2FsbHMsIFtcblx0XHRcdFx0eyByZXF1ZXN0SWQ6ICdpbm5lci1wZXJtLTEnLCBhcHByb3ZlZDogdHJ1ZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRm9yd2FyZGluZyBpbnRvIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjaGFuZ2VzZXQgZm9yd2FyZGVycycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N0YWxlIHRvb2wgY29tcGxldGlvbiBkb2VzIG5vdCBhdHRyaWJ1dGUgZWRpdHMgdG8gdGhlIGFjdGl2ZSB0dXJuJywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDE6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2NvbnRpbnVlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGxvY2FsU2lkZUVmZmVjdHMgPSBjcmVhdGVUZXN0U2lkZUVmZmVjdHMoZGlzcG9zYWJsZXMsIHN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRnZXRBZ2VudDogKCkgPT4gYWdlbnQsXG5cdFx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2U6IGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdFx0b25UdXJuQ29tcGxldGU6ICgpID0+IHsgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGNoYW5nZXNldHMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxvY2FsU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAnc3RhbGUtdG9vbCcsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1dyb3RlIGZpbGUnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9vbENhbGxFZGl0czogY2hhbmdlc2V0cy50b29sQ2FsbEVkaXRzLFxuXHRcdFx0XHRhY3RpdmVUdXJuSWQ6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZGVmYXVsdENoYXRVcmkpPy5hY3RpdmVUdXJuPy5pZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dG9vbENhbGxFZGl0czogW10sXG5cdFx0XHRcdGFjdGl2ZVR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bvc3QtdG9vbENhbGxDb21wbGV0ZSBlZGl0cyBmaXJlIG9uVG9vbENhbGxFZGl0c0FwcGxpZWQgb25jZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgY2hhbmdlc2V0cyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobG9jYWxTaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblxuXHRcdFx0Ly8gdG9vbF9zdGFydCArIHRvb2xfcmVhZHkgKyB0b29sX2NvbXBsZXRlIHdpdGggYSByZWNvcmRlZCBmaWxlIGVkaXQuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWVkaXQtMScsIHRvb2xOYW1lOiAnd3JpdGUnLCBkaXNwbGF5TmFtZTogJ1dyaXRlJywgY29udHJpYnV0b3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogdW5kZWZpbmVkLCBsYW5ndWFnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZWRpdC0xJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZSBmaWxlJywgdG9vbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZWRpdC0xJyxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnd3JvdGUnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXNldHMudG9vbENhbGxFZGl0cywgW3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3R1cm4gY29tcGxldGUgZmlyZXMgb25UdXJuQ29tcGxldGUgb25jZSB3aXRoIHRoZSByaWdodCB0dXJuIGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IEZha2VDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBsb2NhbFNpZGVFZmZlY3RzID0gY3JlYXRlVGVzdFNpZGVFZmZlY3RzKGRpc3Bvc2FibGVzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0Z2V0QWdlbnQ6ICgpID0+IGFnZW50LFxuXHRcdFx0XHRhZ2VudHM6IGFnZW50TGlzdCxcblx0XHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlOiBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LCB1bmRlZmluZWQsIE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFNpZGVFZmZlY3RzLnJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudCkpO1xuXG5cdFx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gYF9ydW5UdXJuQ29tcGxldGVTaWRlRWZmZWN0c2Agbm93IGRlZmVycyB0aGVcblx0XHRcdC8vIGBjaGFuZ2VzZXRzLm9uVHVybkNvbXBsZXRlYCBjYWxsIGJlaGluZCB0aGUgY2hlY2twb2ludCBjYXB0dXJlXG5cdFx0XHQvLyBwcm9taXNlIChgY2FwdHVyZVR1cm5DaGVja3BvaW50KC4uLikudGhlbiguLi4pYCkuIFlpZWxkIGFcblx0XHRcdC8vIG1pY3JvdGFzayBzbyB0aGUgcmVzb2x2ZWQgcHJvbWlzZSdzIGAudGhlbmAgY29udGludWF0aW9uXG5cdFx0XHQvLyBydW5zIGJlZm9yZSB3ZSBhc3NlcnQuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzZXRzLnR1cm5Db21wbGV0ZXMsIFt7IHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgdHVybklkOiAndHVybi0xJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0dXJuIGNvbXBsZXRlIHBhc3NlcyB0aGUgcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcmllcyB0byB0aGUgY2hlY2twb2ludCBjYXB0dXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvd2QnKS50b1N0cmluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0Y29uc3QgY2FwdHVyZXM6IHsgdHVybklkOiBzdHJpbmc7IHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBjaGVja3BvaW50czogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlID0ge1xuXHRcdFx0XHQuLi5OVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdFx0Y2FwdHVyZVR1cm5DaGVja3BvaW50OiBhc3luYyAoX3Nlc3Npb24sIHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzKSA9PiB7XG5cdFx0XHRcdFx0Y2FwdHVyZXMucHVzaCh7IHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzOiB3b3JraW5nRGlyZWN0b3JpZXM/Lm1hcCh3ID0+IHcudG9TdHJpbmcoKSkgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgbmV3IEZha2VDaGFuZ2VzZXRTZXJ2aWNlKCksIHVuZGVmaW5lZCwgY2hlY2twb2ludHMpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxvY2FsU2lkZUVmZmVjdHMucmVnaXN0ZXJQcm9ncmVzc0xpc3RlbmVyKGFnZW50KSk7XG5cblx0XHRcdGFnZW50LmZpcmVQcm9ncmVzcyh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogVVJJLnBhcnNlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FwdHVyZXMsIFt7IHR1cm5JZDogJ3R1cm4tMScsIHdvcmtpbmdEaXJlY3RvcmllczogW3dvcmtpbmdEaXJlY3RvcnldIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NoYXRUcnVuY2F0ZWQgZmlyZXMgb25TZXNzaW9uVHJ1bmNhdGVkIG9uY2UnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBGYWtlQ2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxTaWRlRWZmZWN0cyA9IGNyZWF0ZVRlc3RTaWRlRWZmZWN0cyhkaXNwb3NhYmxlcywgc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdFx0YWdlbnRzOiBhZ2VudExpc3QsXG5cdFx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRvblR1cm5Db21wbGV0ZTogKCkgPT4geyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBOdWxsVGVsZW1ldHJ5U2VydmljZSwgY2hhbmdlc2V0cyk7XG5cblx0XHRcdGxvY2FsU2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXNldHMudHJ1bmNhdGVzLCBbc2Vzc2lvblVyaS50b1N0cmluZygpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVuY2F0aW5nIGEgY2hhdCBmb3J3YXJkcyB0aGF0IGNoYXQgdG8gdGhlIGFnZW50IChkZWZhdWx0IGFuZCBwZWVyKScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXRVcmkgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAncGVlci0xJyk7XG5cblx0XHRcdC8vIFBlZXIgY2hhdDogdGhlIGNoYXQgVVJJIGlzIGZvcndhcmRlZCBzbyB0aGUgYWdlbnQgdGFyZ2V0cyB0aGF0XG5cdFx0XHQvLyBjaGF0J3Mgb3duIGJhY2tpbmcgcmF0aGVyIHRoYW4gdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQuXG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24ocGVlckNoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLCB0dXJuSWQ6ICd0dXJuLXBlZXInIH0pO1xuXHRcdFx0Y29uc3QgcGVlckNhbGwgPSBhZ2VudC50cnVuY2F0ZVNlc3Npb25DYWxscy5hdCgtMSk7XG5cblx0XHRcdC8vIERlZmF1bHQgY2hhdDogZm9yd2FyZGVkIGFzIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IFVSSS5cblx0XHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQsIHR1cm5JZDogJ3R1cm4tZGVmYXVsdCcgfSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2FsbCA9IGFnZW50LnRydW5jYXRlU2Vzc2lvbkNhbGxzLmF0KC0xKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHBlZXJTZXNzaW9uOiBwZWVyQ2FsbD8uc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0XHRwZWVyVHVybklkOiBwZWVyQ2FsbD8udHVybklkLFxuXHRcdFx0XHRwZWVyQ2hhdDogcGVlckNhbGw/LmNoYXQ/LnRvU3RyaW5nKCksXG5cdFx0XHRcdGRlZmF1bHRUdXJuSWQ6IGRlZmF1bHRDYWxsPy50dXJuSWQsXG5cdFx0XHRcdGRlZmF1bHRDaGF0OiBkZWZhdWx0Q2FsbD8uY2hhdD8udG9TdHJpbmcoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cGVlclNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cGVlclR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHBlZXJDaGF0OiBwZWVyQ2hhdFVyaSxcblx0XHRcdFx0ZGVmYXVsdFR1cm5JZDogJ3R1cm4tZGVmYXVsdCcsXG5cdFx0XHRcdGRlZmF1bHRDaGF0OiBkZWZhdWx0Q2hhdFVyaSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGNBQXNCLDBCQUEwQjtBQUN6RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUF5QixnQkFBZ0IsbUJBQW1CLHVCQUF1QiwrQkFBK0I7QUFDbEgsU0FBUyxrQkFBMkY7QUFDcEcsU0FB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QUFHLFFBQVE7QUFJaEUsa0JBQVksYUFBYSxhQUFhLEVBQUUsTUFBTSxXQUFXLGVBQWUsUUFBUSxZQUFZLENBQUM7QUFDN0YsWUFBTSxXQUFXLE1BQU0scUJBQXFCLEdBQUcsRUFBRTtBQUdqRCxrQkFBWSxhQUFhLGdCQUFnQixFQUFFLE1BQU0sV0FBVyxlQUFlLFFBQVEsZUFBZSxDQUFDO0FBQ25HLFlBQU0sY0FBYyxNQUFNLHFCQUFxQixHQUFHLEVBQUU7QUFFcEQsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixhQUFhLFVBQVUsUUFBUSxTQUFTO0FBQUEsUUFDeEMsWUFBWSxVQUFVO0FBQUEsUUFDdEIsVUFBVSxVQUFVLE1BQU0sU0FBUztBQUFBLFFBQ25DLGVBQWUsYUFBYTtBQUFBLFFBQzVCLGFBQWEsYUFBYSxNQUFNLFNBQVM7QUFBQSxNQUMxQyxHQUFHO0FBQUEsUUFDRixhQUFhLFdBQVcsU0FBUztBQUFBLFFBQ2pDLFlBQVk7QUFBQSxRQUNaLFVBQVU7QUFBQSxRQUNWLGVBQWU7QUFBQSxRQUNmLGFBQWE7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogWyJlbnZlbG9wZSIsICJhY3Rpb24iLCAicGFydCJdCn0K
