import assert from "assert";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../telemetry/common/telemetryUtils.js";
import { createAgentModelByokMeta } from "../../common/agentModelByokMeta.js";
import { AgentSession } from "../../common/agentService.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, MessageKind, PendingMessageKind, ResponsePartKind, SessionStatus } from "../../common/state/sessionState.js";
import { IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { IAgentHostTerminalManager } from "../../node/agentHostTerminalManager.js";
import { AgentHostLocalTurns } from "../../node/agentHostLocalTurns.js";
import { AgentHostTelemetryService } from "../../node/agentHostTelemetryService.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { AgentSideEffects } from "../../node/agentSideEffects.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { createNullSessionDataService } from "../common/sessionTestHelpers.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { MockAgent } from "./mockAgent.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
class FakeChangesetService {
  registerStaticChangesets() {
  }
  restoreStaticChangeset() {
  }
  parsePersistedStaticChangesets() {
    return {};
  }
  applyPersistedStaticChangesets() {
  }
  restorePersistedStaticChangesets() {
    return {};
  }
  persistChangesSummary() {
  }
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys() {
    return void 0;
  }
  computeListEntryChanges() {
    return void 0;
  }
  refreshChangesetCatalog() {
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
    return `${session}/x`;
  }
  async computeCompareTurnsChangeset(session) {
    return `${session}/y`;
  }
  onToolCallEditsApplied() {
  }
  onTurnComplete() {
  }
  onSessionTruncated() {
  }
}
class CapturingTelemetryService {
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
  publicLogError2(eventName, data) {
    this.events.push({ eventName, data });
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects \u2014 turn tracker telemetry", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let agent;
  let sideEffects;
  let telemetry;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const sessionKey = sessionUri.toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession(ready = true) {
    stateManager.createSession({
      resource: sessionKey,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    if (ready) {
      stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
    }
  }
  function setAutoApprove(level) {
    stateManager.setSessionConfig(sessionKey, {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Approvals", enum: ["default", "autoApprove", "autopilot"], default: "default" }
        }
      },
      values: { autoApprove: level }
    });
  }
  function startTurn(turnId, text = "hello", modelId) {
    const action = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User }, model: modelId ? { id: modelId } : void 0 }
    };
    stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, action);
  }
  function fire(action) {
    agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action });
  }
  function completedEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.turnCompleted");
  }
  function capturedModel(data) {
    const model = data.model;
    return model instanceof TelemetryTrustedValue ? { trusted: true, value: model.value } : { trusted: false, value: model };
  }
  function failedEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.turnFailed");
  }
  setup(() => {
    agent = new MockAgent();
    disposables.add(toDisposable(() => agent.dispose()));
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const agentList = observableValue("agents", [agent]);
    telemetry = new CapturingTelemetryService();
    const logService = new NullLogService();
    const configService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const telemetryService = disposables.add(new AgentHostTelemetryService(telemetry));
    const sessionDataService = createNullSessionDataService();
    const instantiationService = disposables.add(new InstantiationService(
      new ServiceCollection(
        [ILogService, logService],
        [IAgentConfigurationService, configService],
        [IAgentHostChangesetService, new FakeChangesetService()],
        [IAgentHostCheckpointService, NULL_CHECKPOINT_SERVICE],
        [ITelemetryService, telemetryService],
        [IAgentHostTerminalManager, disposables.add(new TestAgentHostTerminalManager())],
        [ISessionDataService, sessionDataService]
      ),
      /*strict*/
      true
    ));
    sideEffects = disposables.add(instantiationService.createInstance(AgentSideEffects, stateManager, {
      getAgent: () => agent,
      agents: agentList,
      sessionDataService,
      localTurns: new AgentHostLocalTurns(sessionDataService, logService),
      onTurnComplete: () => {
      }
    }));
    disposables.add(sideEffects.registerProgressListener(agent));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("emits turnCompleted with timing, model and permissionLevel on success", () => {
    setupSession();
    agent.setModels([{ provider: "mock", id: "gpt-5.5", name: "GPT 5.5", supportsVision: false }]);
    setAutoApprove("autopilot");
    startTurn("turn-1", "hello", "gpt-5.5");
    fire({ type: ActionType.ChatResponsePart, turnId: "turn-1", part: { kind: ResponsePartKind.Markdown, id: "p1", content: "hi" } });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    const data = events[0].data;
    assert.strictEqual(data.provider, "mock");
    assert.strictEqual(data.agentSessionId, "session-1");
    assert.strictEqual(data.turnId, "turn-1");
    assert.strictEqual(data.result, "success");
    assert.deepStrictEqual(capturedModel(data), { trusted: true, value: "gpt-5.5" });
    assert.strictEqual(data.modelSelectionKind, "explicit");
    assert.strictEqual(data.permissionLevel, "autopilot");
    assert.strictEqual(typeof data.totalTime, "number");
    assert.strictEqual(typeof data.timeToFirstProgress, "number");
  });
  test("uses generic model values for BYOK and unknown selections", () => {
    setupSession();
    agent.setModels([{
      provider: "mock",
      id: "openrouter/private-model",
      name: "Private Model",
      supportsVision: false,
      _meta: createAgentModelByokMeta("openrouter/private-model")
    }]);
    startTurn("turn-byok", "hello", "openrouter/private-model");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-byok", duration: 1e3 });
    startTurn("turn-unknown", "hello", "unadvertised/private-model");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-unknown", duration: 1e3 });
    assert.deepStrictEqual(completedEvents().map((event) => {
      const data = event.data;
      return { model: data.model, modelSelectionKind: data.modelSelectionKind };
    }), [
      { model: "byokModel", modelSelectionKind: "explicit" },
      { model: "unknown", modelSelectionKind: "explicit" }
    ]);
  });
  test("timeToFirstProgress is undefined when no visible progress arrives before completion", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatUsage, turnId: "turn-1", usage: { inputTokens: 1, outputTokens: 1 } });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.timeToFirstProgress, void 0);
  });
  test("emits result=cancelled on ChatTurnCancelled", () => {
    setupSession();
    startTurn("turn-1", "hello", "auto");
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.deepStrictEqual({
      model: capturedModel(data),
      result: data.result,
      modelSelectionKind: data.modelSelectionKind
    }, { model: { trusted: true, value: "auto" }, result: "cancelled", modelSelectionKind: "auto" });
  });
  test("emits result=error on ChatError", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatError, turnId: "turn-1", duration: 1e3, error: { errorType: "oops", message: "fail" } });
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
    assert.strictEqual(events[0].data.errorType, "oops");
  });
  test("emits a single turnCompleted per turn even when followed by duplicate completions", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    assert.strictEqual(completedEvents().length, 1);
  });
  test("captures permissionLevel at turnStarted, not later mid-turn changes", () => {
    setupSession();
    setAutoApprove("default");
    startTurn("turn-1");
    setAutoApprove("autopilot");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.permissionLevel, "default");
  });
  test("model and permissionLevel are undefined when never set", () => {
    setupSession();
    startTurn("turn-1");
    fire({ type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 });
    const data = completedEvents()[0].data;
    assert.strictEqual(data.model, void 0);
    assert.strictEqual(data.modelSelectionKind, "default");
    assert.strictEqual(data.permissionLevel, void 0);
  });
  test("emits result=cancelled when the client cancels a turn (no agent progress signal)", async () => {
    setupSession();
    startTurn("turn-1");
    sideEffects.handleAction(defaultChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "cancelled");
  });
  test("emits result=error when a direct sendMessage rejects", async () => {
    setupSession();
    agent.sendMessage = async () => {
      throw new Error("boom");
    };
    startTurn("turn-1");
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
    assert.strictEqual(events[0].data.errorType, "sendFailed");
    assert.deepStrictEqual(failedEvents().map((event) => {
      const data = event.data;
      return {
        failureStage: data.failureStage,
        errorType: data.errorType,
        errorName: data.errorName,
        msg: data.msg,
        hasStack: typeof data.callstack === "string"
      };
    }), [{
      failureStage: "sendMessage",
      errorType: "sendFailed",
      errorName: "Error",
      msg: "Error: boom",
      hasStack: true
    }]);
  });
  test("fails the turn when model selection rejects instead of sending with a stale model", async () => {
    setupSession(false);
    agent.changeModel = async () => {
      throw new Error("unknown model");
    };
    startTurn("turn-1", "hello", "missing-model");
    await new Promise((r) => setTimeout(r, 10));
    const completed = completedEvents()[0].data;
    const failed = failedEvents()[0].data;
    assert.deepStrictEqual({
      completed: { result: completed.result, errorType: completed.errorType, failureStage: completed.failureStage },
      failed: { errorType: failed.errorType, failureStage: failed.failureStage, msg: failed.msg },
      creationErrorType: stateManager.getSessionState(sessionKey)?.creationError?.errorType,
      sendMessageCalls: agent.sendMessageCalls.length
    }, {
      completed: { result: "error", errorType: "modelSelectionFailed", failureStage: "modelSelection" },
      failed: { errorType: "modelSelectionFailed", failureStage: "modelSelection", msg: "Error: unknown model" },
      creationErrorType: "modelSelectionFailed",
      sendMessageCalls: 0
    });
  });
  test("emits result=error when a queued sendMessage rejects", async () => {
    setupSession();
    agent.sendMessage = async () => {
      throw new Error("boom");
    };
    const setAction = {
      type: ActionType.ChatPendingMessageSet,
      kind: PendingMessageKind.Queued,
      id: "q-err",
      message: { text: "queued message", origin: { kind: MessageKind.User } }
    };
    stateManager.dispatchClientAction(defaultChatUri, setAction, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, setAction);
    await new Promise((r) => setTimeout(r, 10));
    const events = completedEvents();
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].data.result, "error");
  });
  test("emits a single turnCompleted when both the client cancel and a follow-up agent signal arrive", () => {
    setupSession();
    startTurn("turn-1");
    sideEffects.handleAction(defaultChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    assert.strictEqual(completedEvents().length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0VHVyblRlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudE1vZGVsQnlva01ldGEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRNb2RlbEJ5b2tNZXRhLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgSUFnZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIENoYXRBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgTWVzc2FnZUtpbmQsIFBlbmRpbmdNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxUdXJucyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TG9jYWxUdXJucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTaWRlRWZmZWN0cyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRTaWRlRWZmZWN0cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQWdlbnQgfSBmcm9tICcuL21vY2tBZ2VudC5qcyc7XG5pbXBvcnQgeyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIH0gZnJvbSAnLi90ZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcblxuY2xhc3MgRmFrZUNoYW5nZXNldFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoKTogdm9pZCB7IH1cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldCgpOiB2b2lkIHsgfVxuXHRwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoKTogeyBzZXNzaW9uPzogdW5kZWZpbmVkIH0geyByZXR1cm4ge307IH1cblx0YXBwbHlQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdHBlcnNpc3RDaGFuZ2VzU3VtbWFyeSgpOiB2b2lkIHsgfVxuXHRpc1N0YXRpY0NoYW5nZXNldENvbXB1dGVBY3RpdmUoKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXHRnZXRMaXN0TWV0YWRhdGFLZXlzKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKCk6IHZvaWQgeyB9XG5cdHJlY29tcHV0ZVN1YnNjcmliZWRDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdG9uU2Vzc2lvbkRpc3Bvc2VkKCk6IHZvaWQgeyB9XG5cdGFzeW5jIGNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDsgfVxuXHRhc3luYyBjb21wdXRlVHVybkNoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0veGA7IH1cblx0YXN5bmMgY29tcHV0ZUNvbXBhcmVUdXJuc0NoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0veWA7IH1cblx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZCgpOiB2b2lkIHsgfVxuXHRvblR1cm5Db21wbGV0ZSgpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25UcnVuY2F0ZWQoKTogdm9pZCB7IH1cbn1cblxuY2xhc3MgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5TGV2ZWwuVVNBR0U7XG5cdHJlYWRvbmx5IHNlc3Npb25JZCA9ICd0ZXN0LXNlc3Npb24nO1xuXHRyZWFkb25seSBtYWNoaW5lSWQgPSAndGVzdC1tYWNoaW5lJztcblx0cmVhZG9ubHkgc3FtSWQgPSAndGVzdC1zcW0nO1xuXHRyZWFkb25seSBkZXZEZXZpY2VJZCA9ICd0ZXN0LWRldi1kZXZpY2UnO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlID0gJ3Rlc3QtZmlyc3Qtc2Vzc2lvbi1kYXRlJztcblx0cmVhZG9ubHkgc2VuZEVycm9yVGVsZW1ldHJ5ID0gZmFsc2U7XG5cdHJlYWRvbmx5IGV2ZW50czogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10gPSBbXTtcblxuXHRwdWJsaWNMb2coKTogdm9pZCB7IH1cblx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHNldEV4cGVyaW1lbnRQcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRzZXRDb21tb25Qcm9wZXJ0eSgpOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIEludGVncmF0aW9uIHRlc3RzIGNvdmVyaW5nIHRoZSB7QGxpbmsgQWdlbnRIb3N0VHVyblRyYWNrZXJ9IGFzIGl0IGlzXG4gKiBkcml2ZW4gdGhyb3VnaCB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uIFRoZXNlIHRlc3RzIGludGVudGlvbmFsbHlcbiAqIGV4ZXJjaXNlIHRoZSBmdWxsIHdpcmluZyAodHVybi1zdGFydGVkIHJvdXRpbmcsIHByb2dyZXNzIGRpc3BhdGNoLFxuICogdHVybi1jb21wbGV0ZS9jYW5jZWwvZXJyb3IgcGF0aHMpIHNvIHRoYXQgd2UgY292ZXIgYm90aCB0aGUgdHJhY2tlclxuICogYW5kIGl0cyBpbnRlZ3JhdGlvbiB3aXRoIHRoZSBzaWRlLWVmZmVjdCBkaXNwYXRjaCBpbiBvbmUgcGxhY2UuXG4gKi9cbnN1aXRlKCdBZ2VudFNpZGVFZmZlY3RzIFx1MjAxNCB0dXJuIHRyYWNrZXIgdGVsZW1ldHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdGxldCBhZ2VudDogTW9ja0FnZW50O1xuXHRsZXQgc2lkZUVmZmVjdHM6IEFnZW50U2lkZUVmZmVjdHM7XG5cdGxldCB0ZWxlbWV0cnk6IENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2U7XG5cblx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJyk7XG5cdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBzZXR1cFNlc3Npb24ocmVhZHkgPSB0cnVlKTogdm9pZCB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb25LZXksXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0aWYgKHJlYWR5KSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbktleSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRBdXRvQXBwcm92ZShsZXZlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gRXN0YWJsaXNoIGNvbmZpZyBvbiB0aGUgYXV0aG9yaXRhdGl2ZSBzZXNzaW9uIHN0YXRlIHZpYSB0aGUgc3RhdGVcblx0XHQvLyBtYW5hZ2VyIEFQSS4gTXV0YXRpbmcgdGhlIG9iamVjdCByZXR1cm5lZCBieSBgZ2V0U2Vzc2lvblN0YXRlYCB3b3VsZFxuXHRcdC8vIHN0cmFuZCB0aGUgY2hhbmdlIG9uIGEgZGV0YWNoZWQgY29tcG9zaXRlIGNvcHkgKHNlc3Npb24gbWVyZ2VkIHdpdGhcblx0XHQvLyBpdHMgZGVmYXVsdCBjaGF0KS4gYGFnZW50U2VydmljZWAgcmVnaXN0ZXJzIHRoZSBzY2hlbWEgYXQgc2Vzc2lvblxuXHRcdC8vIGNyZWF0aW9uIHRpbWU7IHRlc3RzIGJ5cGFzcyB0aGF0IHdpcmluZyB3aXRoIHRoaXMgZGlyZWN0IHNldC5cblx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uS2V5LCB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBcHByb3ZhbHMnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnLCAnYXV0b3BpbG90J10sIGRlZmF1bHQ6ICdkZWZhdWx0JyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogbGV2ZWwgfSxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0YXJ0VHVybih0dXJuSWQ6IHN0cmluZywgdGV4dCA9ICdoZWxsbycsIG1vZGVsSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb246IENoYXRBY3Rpb24gPSB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIG1vZGVsOiBtb2RlbElkID8geyBpZDogbW9kZWxJZCB9IDogdW5kZWZpbmVkIH0sXG5cdFx0fTtcblx0XHQvLyBEaXNwYXRjaCBpbnRvIHRoZSBzdGF0ZSBtYW5hZ2VyIHNvIGBnZXRBY3RpdmVUdXJuSWRgIHJldHVybnMgdGhlXG5cdFx0Ly8gYWN0aXZlIHR1cm4gKHRoZSBwcm9ncmVzcy1saXN0ZW5lciBwYXRoIHJlbGllcyBvbiB0aGlzKSBhbmQgdGhlblxuXHRcdC8vIGludm9rZSBgaGFuZGxlQWN0aW9uYCBzbyB0aGUgc2lkZS1lZmZlY3QgKHdoaWNoIGNhbGxzXG5cdFx0Ly8gYGFnZW50LnNlbmRNZXNzYWdlYCBhbmQgYHR1cm5UcmFja2VyLnR1cm5TdGFydGVkYCkgcnVucy5cblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmlyZShhY3Rpb246IENoYXRBY3Rpb24pOiB2b2lkIHtcblx0XHRhZ2VudC5maXJlUHJvZ3Jlc3MoeyBraW5kOiAnYWN0aW9uJywgcmVzb3VyY2U6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksIGFjdGlvbiB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbXBsZXRlZEV2ZW50cygpOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHMuZmlsdGVyKGUgPT4gZS5ldmVudE5hbWUgPT09ICdhZ2VudEhvc3QudHVybkNvbXBsZXRlZCcpO1xuXHR9XG5cblx0ZnVuY3Rpb24gY2FwdHVyZWRNb2RlbChkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHsgdHJ1c3RlZDogYm9vbGVhbjsgdmFsdWU6IHVua25vd24gfSB7XG5cdFx0Y29uc3QgbW9kZWwgPSBkYXRhLm1vZGVsO1xuXHRcdHJldHVybiBtb2RlbCBpbnN0YW5jZW9mIFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSA/IHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6IG1vZGVsLnZhbHVlIH0gOiB7IHRydXN0ZWQ6IGZhbHNlLCB2YWx1ZTogbW9kZWwgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZhaWxlZEV2ZW50cygpOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHMuZmlsdGVyKGUgPT4gZS5ldmVudE5hbWUgPT09ICdhZ2VudEhvc3QudHVybkZhaWxlZCcpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBhZ2VudExpc3QgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbYWdlbnRdKTtcblx0XHR0ZWxlbWV0cnkgPSBuZXcgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnkpKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlXSxcblx0XHQpLCAvKnN0cmljdCovIHRydWUpKTtcblx0XHRzaWRlRWZmZWN0cyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0bG9jYWxUdXJuczogbmV3IEFnZW50SG9zdExvY2FsVHVybnMoc2Vzc2lvbkRhdGFTZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0fSkpO1xuXHRcdC8vIFdpcmUgdGhlIGFnZW50J3MgcHJvZ3Jlc3Mgc2lnbmFscyB0aHJvdWdoIHNpZGUtZWZmZWN0cyAodGhpcyBpcyBob3dcblx0XHQvLyBwcm9ncmVzcyBhY3Rpb25zIHJlYWNoIHRoZSBzdGF0ZSBtYW5hZ2VyIGluIHByb2R1Y3Rpb24pLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbWl0cyB0dXJuQ29tcGxldGVkIHdpdGggdGltaW5nLCBtb2RlbCBhbmQgcGVybWlzc2lvbkxldmVsIG9uIHN1Y2Nlc3MnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0YWdlbnQuc2V0TW9kZWxzKFt7IHByb3ZpZGVyOiAnbW9jaycsIGlkOiAnZ3B0LTUuNScsIG5hbWU6ICdHUFQgNS41Jywgc3VwcG9ydHNWaXNpb246IGZhbHNlIH1dKTtcblx0XHRzZXRBdXRvQXBwcm92ZSgnYXV0b3BpbG90Jyk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnLCAnaGVsbG8nLCAnZ3B0LTUuNScpO1xuXG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybi0xJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3AxJywgY29udGVudDogJ2hpJyB9IH0pO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gY29tcGxldGVkRXZlbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGRhdGEgPSBldmVudHNbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5wcm92aWRlciwgJ21vY2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5hZ2VudFNlc3Npb25JZCwgJ3Nlc3Npb24tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnR1cm5JZCwgJ3R1cm4tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnJlc3VsdCwgJ3N1Y2Nlc3MnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcHR1cmVkTW9kZWwoZGF0YSksIHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdncHQtNS41JyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5tb2RlbFNlbGVjdGlvbktpbmQsICdleHBsaWNpdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnBlcm1pc3Npb25MZXZlbCwgJ2F1dG9waWxvdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZGF0YS50b3RhbFRpbWUsICdudW1iZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGRhdGEudGltZVRvRmlyc3RQcm9ncmVzcywgJ251bWJlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGdlbmVyaWMgbW9kZWwgdmFsdWVzIGZvciBCWU9LIGFuZCB1bmtub3duIHNlbGVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0YWdlbnQuc2V0TW9kZWxzKFt7XG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0aWQ6ICdvcGVucm91dGVyL3ByaXZhdGUtbW9kZWwnLFxuXHRcdFx0bmFtZTogJ1ByaXZhdGUgTW9kZWwnLFxuXHRcdFx0c3VwcG9ydHNWaXNpb246IGZhbHNlLFxuXHRcdFx0X21ldGE6IGNyZWF0ZUFnZW50TW9kZWxCeW9rTWV0YSgnb3BlbnJvdXRlci9wcml2YXRlLW1vZGVsJyksXG5cdFx0fV0pO1xuXG5cdFx0c3RhcnRUdXJuKCd0dXJuLWJ5b2snLCAnaGVsbG8nLCAnb3BlbnJvdXRlci9wcml2YXRlLW1vZGVsJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi1ieW9rJywgZHVyYXRpb246IDEwMDAgfSk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLXVua25vd24nLCAnaGVsbG8nLCAndW5hZHZlcnRpc2VkL3ByaXZhdGUtbW9kZWwnKTtcblx0XHRmaXJlKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuLXVua25vd24nLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGVkRXZlbnRzKCkubWFwKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0cmV0dXJuIHsgbW9kZWw6IGRhdGEubW9kZWwsIG1vZGVsU2VsZWN0aW9uS2luZDogZGF0YS5tb2RlbFNlbGVjdGlvbktpbmQgfTtcblx0XHR9KSwgW1xuXHRcdFx0eyBtb2RlbDogJ2J5b2tNb2RlbCcsIG1vZGVsU2VsZWN0aW9uS2luZDogJ2V4cGxpY2l0JyB9LFxuXHRcdFx0eyBtb2RlbDogJ3Vua25vd24nLCBtb2RlbFNlbGVjdGlvbktpbmQ6ICdleHBsaWNpdCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndGltZVRvRmlyc3RQcm9ncmVzcyBpcyB1bmRlZmluZWQgd2hlbiBubyB2aXNpYmxlIHByb2dyZXNzIGFycml2ZXMgYmVmb3JlIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdC8vIFVzYWdlIGlzIG5vdCBhIFwidmlzaWJsZSBwcm9ncmVzc1wiIGFjdGlvbiBcdTIwMTQgaXQgc2hvdWxkIG5vdCBtYXJrIGZpcnN0IHByb2dyZXNzLlxuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSwgdHVybklkOiAndHVybi0xJywgdXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEsIG91dHB1dFRva2VuczogMSB9IH0pO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEudGltZVRvRmlyc3RQcm9ncmVzcywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgcmVzdWx0PWNhbmNlbGxlZCBvbiBDaGF0VHVybkNhbmNlbGxlZCcsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScsICdoZWxsbycsICdhdXRvJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbDogY2FwdHVyZWRNb2RlbChkYXRhKSxcblx0XHRcdHJlc3VsdDogZGF0YS5yZXN1bHQsXG5cdFx0XHRtb2RlbFNlbGVjdGlvbktpbmQ6IGRhdGEubW9kZWxTZWxlY3Rpb25LaW5kLFxuXHRcdH0sIHsgbW9kZWw6IHsgdHJ1c3RlZDogdHJ1ZSwgdmFsdWU6ICdhdXRvJyB9LCByZXN1bHQ6ICdjYW5jZWxsZWQnLCBtb2RlbFNlbGVjdGlvbktpbmQ6ICdhdXRvJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgcmVzdWx0PWVycm9yIG9uIENoYXRFcnJvcicsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvciwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAsIGVycm9yOiB7IGVycm9yVHlwZTogJ29vcHMnLCBtZXNzYWdlOiAnZmFpbCcgfSB9KTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGNvbXBsZXRlZEV2ZW50cygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGV2ZW50c1swXS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5yZXN1bHQsICdlcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmVycm9yVHlwZSwgJ29vcHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgYSBzaW5nbGUgdHVybkNvbXBsZXRlZCBwZXIgdHVybiBldmVuIHdoZW4gZm9sbG93ZWQgYnkgZHVwbGljYXRlIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cdFx0Ly8gQSBkdXBsaWNhdGUgdHVybi1jb21wbGV0ZSBzaG91bGQgbm90IHByb2R1Y2UgYSBzZWNvbmQgdGVsZW1ldHJ5IGV2ZW50IGJlY2F1c2UgdGhlIHRyYWNrZXJcblx0XHQvLyBkcm9wcyBpdHMgcGVyLXR1cm4gc3RhdGUgb24gdGhlIGZpcnN0IGNvbXBsZXRpb24uXG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkRXZlbnRzKCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2FwdHVyZXMgcGVybWlzc2lvbkxldmVsIGF0IHR1cm5TdGFydGVkLCBub3QgbGF0ZXIgbWlkLXR1cm4gY2hhbmdlcycsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzZXRBdXRvQXBwcm92ZSgnZGVmYXVsdCcpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHQvLyBDaGFuZ2UgY29uZmlnIG1pZC10dXJuIFx1MjAxNCBzaG91bGQgbm90IGFmZmVjdCB0aGUgcmVjb3JkZWQgZXZlbnQuXG5cdFx0c2V0QXV0b0FwcHJvdmUoJ2F1dG9waWxvdCcpO1xuXG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSk7XG5cblx0XHRjb25zdCBkYXRhID0gY29tcGxldGVkRXZlbnRzKClbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5wZXJtaXNzaW9uTGV2ZWwsICdkZWZhdWx0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGFuZCBwZXJtaXNzaW9uTGV2ZWwgYXJlIHVuZGVmaW5lZCB3aGVuIG5ldmVyIHNldCcsICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEubW9kZWwsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEubW9kZWxTZWxlY3Rpb25LaW5kLCAnZGVmYXVsdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnBlcm1pc3Npb25MZXZlbCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Ly8gVGhlIHRlc3RzIGJlbG93IGNvdmVyIGNvbXBsZXRpb24gcGF0aHMgdGhhdCBieXBhc3MgdGhlIGFnZW50LXByb2dyZXNzXG5cdC8vIHNpZ25hbCBmbG93IChgX2Rpc3BhdGNoQWN0aW9uRm9yU2Vzc2lvbmApIFx1MjAxNCBjbGllbnQtaW5pdGlhdGVkIGNhbmNlbFxuXHQvLyBhbmQgYHNlbmRNZXNzYWdlYCByZWplY3Rpb24gYm90aCBkaXNwYXRjaCB0aGVpciB0ZXJtaW5hbCBhY3Rpb25cblx0Ly8gZGlyZWN0bHkgdGhyb3VnaCB0aGUgc3RhdGUgbWFuYWdlci5cblxuXHR0ZXN0KCdlbWl0cyByZXN1bHQ9Y2FuY2VsbGVkIHdoZW4gdGhlIGNsaWVudCBjYW5jZWxzIGEgdHVybiAobm8gYWdlbnQgcHJvZ3Jlc3Mgc2lnbmFsKScsIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRjb25zdCBldmVudHMgPSBjb21wbGV0ZWRFdmVudHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucmVzdWx0LCAnY2FuY2VsbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHJlc3VsdD1lcnJvciB3aGVuIGEgZGlyZWN0IHNlbmRNZXNzYWdlIHJlamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0YWdlbnQuc2VuZE1lc3NhZ2UgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignYm9vbScpOyB9O1xuXG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxMCkpO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gY29tcGxldGVkRXZlbnRzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnJlc3VsdCwgJ2Vycm9yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuZXJyb3JUeXBlLCAnc2VuZEZhaWxlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmFpbGVkRXZlbnRzKCkubWFwKGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBldmVudC5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZmFpbHVyZVN0YWdlOiBkYXRhLmZhaWx1cmVTdGFnZSxcblx0XHRcdFx0ZXJyb3JUeXBlOiBkYXRhLmVycm9yVHlwZSxcblx0XHRcdFx0ZXJyb3JOYW1lOiBkYXRhLmVycm9yTmFtZSxcblx0XHRcdFx0bXNnOiBkYXRhLm1zZyxcblx0XHRcdFx0aGFzU3RhY2s6IHR5cGVvZiBkYXRhLmNhbGxzdGFjayA9PT0gJ3N0cmluZycsXG5cdFx0XHR9O1xuXHRcdH0pLCBbe1xuXHRcdFx0ZmFpbHVyZVN0YWdlOiAnc2VuZE1lc3NhZ2UnLFxuXHRcdFx0ZXJyb3JUeXBlOiAnc2VuZEZhaWxlZCcsXG5cdFx0XHRlcnJvck5hbWU6ICdFcnJvcicsXG5cdFx0XHRtc2c6ICdFcnJvcjogYm9vbScsXG5cdFx0XHRoYXNTdGFjazogdHJ1ZSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIHRoZSB0dXJuIHdoZW4gbW9kZWwgc2VsZWN0aW9uIHJlamVjdHMgaW5zdGVhZCBvZiBzZW5kaW5nIHdpdGggYSBzdGFsZSBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXR1cFNlc3Npb24oZmFsc2UpO1xuXHRcdGFnZW50LmNoYW5nZU1vZGVsID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3Vua25vd24gbW9kZWwnKTsgfTtcblxuXHRcdHN0YXJ0VHVybigndHVybi0xJywgJ2hlbGxvJywgJ21pc3NpbmctbW9kZWwnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNvbXBsZXRlZEV2ZW50cygpWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Y29uc3QgZmFpbGVkID0gZmFpbGVkRXZlbnRzKClbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXBsZXRlZDogeyByZXN1bHQ6IGNvbXBsZXRlZC5yZXN1bHQsIGVycm9yVHlwZTogY29tcGxldGVkLmVycm9yVHlwZSwgZmFpbHVyZVN0YWdlOiBjb21wbGV0ZWQuZmFpbHVyZVN0YWdlIH0sXG5cdFx0XHRmYWlsZWQ6IHsgZXJyb3JUeXBlOiBmYWlsZWQuZXJyb3JUeXBlLCBmYWlsdXJlU3RhZ2U6IGZhaWxlZC5mYWlsdXJlU3RhZ2UsIG1zZzogZmFpbGVkLm1zZyB9LFxuXHRcdFx0Y3JlYXRpb25FcnJvclR5cGU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk/LmNyZWF0aW9uRXJyb3I/LmVycm9yVHlwZSxcblx0XHRcdHNlbmRNZXNzYWdlQ2FsbHM6IGFnZW50LnNlbmRNZXNzYWdlQ2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGNvbXBsZXRlZDogeyByZXN1bHQ6ICdlcnJvcicsIGVycm9yVHlwZTogJ21vZGVsU2VsZWN0aW9uRmFpbGVkJywgZmFpbHVyZVN0YWdlOiAnbW9kZWxTZWxlY3Rpb24nIH0sXG5cdFx0XHRmYWlsZWQ6IHsgZXJyb3JUeXBlOiAnbW9kZWxTZWxlY3Rpb25GYWlsZWQnLCBmYWlsdXJlU3RhZ2U6ICdtb2RlbFNlbGVjdGlvbicsIG1zZzogJ0Vycm9yOiB1bmtub3duIG1vZGVsJyB9LFxuXHRcdFx0Y3JlYXRpb25FcnJvclR5cGU6ICdtb2RlbFNlbGVjdGlvbkZhaWxlZCcsXG5cdFx0XHRzZW5kTWVzc2FnZUNhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyByZXN1bHQ9ZXJyb3Igd2hlbiBhIHF1ZXVlZCBzZW5kTWVzc2FnZSByZWplY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdGFnZW50LnNlbmRNZXNzYWdlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTsgfTtcblxuXHRcdGNvbnN0IHNldEFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdGlkOiAncS1lcnInLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncXVldWVkIG1lc3NhZ2UnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIHNldEFjdGlvbiwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDEgfSk7XG5cdFx0c2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBzZXRBY3Rpb24pO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7XG5cblx0XHRjb25zdCBldmVudHMgPSBjb21wbGV0ZWRFdmVudHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChldmVudHNbMF0uZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucmVzdWx0LCAnZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgYSBzaW5nbGUgdHVybkNvbXBsZXRlZCB3aGVuIGJvdGggdGhlIGNsaWVudCBjYW5jZWwgYW5kIGEgZm9sbG93LXVwIGFnZW50IHNpZ25hbCBhcnJpdmUnLCAoKSA9PiB7XG5cdFx0Ly8gU29tZSBhZ2VudHMgZW1pdCBhIGBDaGF0VHVybkNhbmNlbGxlZGAgc2lnbmFsIGluIHJlc3BvbnNlIHRvXG5cdFx0Ly8gYGFib3J0U2Vzc2lvbmA7IHRoZSB0cmFja2VyIG11c3QgZGVkdXAgYWNyb3NzIHRoZSBjbGllbnQtY2FuY2VsXG5cdFx0Ly8gcGF0aCBhbmQgdGhlIGFnZW50LXByb2dyZXNzIHNpZ25hbCBwYXRoLlxuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlZEV2ZW50cygpLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxP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
