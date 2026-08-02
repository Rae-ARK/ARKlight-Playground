import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/virtualScheduling/runWithFakedTimers.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agentService.js";
import { SessionInputRequestKind } from "../../common/state/protocol/state.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildDefaultChatUri, MessageKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus } from "../../common/state/sessionState.js";
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
  refreshBranchChangeset() {
  }
  refreshSessionChangeset() {
  }
  refreshChangesetCatalog() {
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
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite("AgentSideEffects \u2014 tool call telemetry", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let agent;
  let sideEffects;
  let telemetry;
  const sessionUri = AgentSession.uri("mock", "session-1");
  const sessionKey = sessionUri.toString();
  const defaultChatUri = buildDefaultChatUri(sessionUri);
  function setupSession() {
    stateManager.createSession({
      resource: sessionKey,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
  }
  function startTurn(turnId, text = "hello") {
    const action = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text, origin: { kind: MessageKind.User } }
    };
    stateManager.dispatchClientAction(defaultChatUri, action, { clientId: "test", clientSeq: 1 });
    sideEffects.handleAction(defaultChatUri, action);
  }
  function fire(action) {
    agent.fireProgress({ kind: "action", resource: URI.parse(defaultChatUri), action });
  }
  function toolStart(turnId, toolCallId, toolName, contributor) {
    fire({ type: ActionType.ChatToolCallStart, turnId, toolCallId, toolName, displayName: toolName, contributor });
  }
  function toolComplete(turnId, toolCallId, result) {
    fire({ type: ActionType.ChatToolCallComplete, turnId, toolCallId, result });
  }
  function toolEvents() {
    return telemetry.events.filter((e) => e.eventName === "languageModelToolInvoked").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          invocationTimeMs: data.invocationTimeMs === void 0 ? void 0 : typeof data.invocationTimeMs === "number" && data.invocationTimeMs >= 0
        }
      };
    });
  }
  function stalledEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.toolCallStalled").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: { ...data, stalledTimeMs: typeof data.stalledTimeMs === "number" && data.stalledTimeMs >= 0 }
      };
    });
  }
  function stalledCompletionEvents() {
    return telemetry.events.filter((e) => e.eventName === "agentHost.stalledToolCallCompleted").map((e) => {
      const data = e.data;
      return {
        eventName: e.eventName,
        data: {
          ...data,
          totalTimeMs: typeof data.totalTimeMs === "number" && data.totalTimeMs >= 0,
          timeAfterStallMs: typeof data.timeAfterStallMs === "number" && data.timeAfterStallMs >= 0
        }
      };
    });
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
  test("emits a successful agent-host tool invocation", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-1", "bash");
    fire({
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-1",
      invocationMessage: "run",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    toolComplete("turn-1", "tc-1", { success: true, pastTenseMessage: "ran" });
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "success",
        chatSessionId: sessionKey,
        toolId: "bash",
        toolExtensionId: void 0,
        toolSourceKind: "agentHost",
        provider: "mock",
        invocationTimeMs: true
      }
    }]);
  });
  test("emits userCancelled with mcp source kind for a denied mcp tool", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-mcp", "lookup", { kind: ToolCallContributorKind.MCP, customizationId: "c1" });
    toolComplete("turn-1", "tc-mcp", { success: false, pastTenseMessage: "denied", error: { message: "denied", code: "denied" } });
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "userCancelled",
        chatSessionId: sessionKey,
        toolId: "lookup",
        toolExtensionId: void 0,
        toolSourceKind: "mcp",
        provider: "mock",
        invocationTimeMs: void 0
      }
    }]);
  });
  test("emits client source kind for a client-contributed tool", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-client", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
    fire({
      type: ActionType.ChatToolCallReady,
      turnId: "turn-1",
      toolCallId: "tc-client",
      invocationMessage: "run tests",
      confirmed: ToolCallConfirmationReason.NotNeeded
    });
    toolComplete("turn-1", "tc-client", { success: true, pastTenseMessage: "ran tests" });
    assert.deepStrictEqual(toolEvents(), [{
      eventName: "languageModelToolInvoked",
      data: {
        result: "success",
        chatSessionId: sessionKey,
        toolId: "run_tests",
        toolExtensionId: void 0,
        toolSourceKind: "client",
        provider: "mock",
        invocationTimeMs: true
      }
    }]);
  });
  test("only accepts contributor refinements that preserve execution ownership", async () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-mcp-ready", "lookup");
    agent.fireProgress({
      kind: "pending_confirmation",
      chat: URI.parse(defaultChatUri),
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tc-mcp-ready",
        toolName: "lookup",
        displayName: "Lookup",
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        invocationMessage: "Looking up metadata",
        toolInput: "{}"
      }
    });
    toolStart("turn-1", "tc-late-client", "run_tests");
    agent.fireProgress({
      kind: "pending_confirmation",
      chat: URI.parse(defaultChatUri),
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tc-late-client",
        toolName: "run_tests",
        displayName: "Run Tests",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        invocationMessage: "Running tests",
        toolInput: "{}"
      }
    });
    await timeout(0);
    toolComplete("turn-1", "tc-mcp-ready", { success: true, pastTenseMessage: "looked up metadata" });
    toolComplete("turn-1", "tc-late-client", { success: true, pastTenseMessage: "ran tests" });
    assert.deepStrictEqual(toolEvents().map((event) => event.data.toolSourceKind), ["mcp", "agentHost"]);
  });
  test("excludes pending confirmation time from invocation timing", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-confirm-timing", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm-timing",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(1e4);
      const confirmed = {
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-confirm-timing",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      };
      stateManager.dispatchClientAction(defaultChatUri, confirmed, { clientId: "test", clientSeq: 2 });
      sideEffects.handleAction(defaultChatUri, confirmed);
      await timeout(25);
      toolComplete("turn-1", "tc-confirm-timing", { success: true, pastTenseMessage: "wrote file" });
    });
    const event = telemetry.events.find((event2) => event2.eventName === "languageModelToolInvoked");
    const invocationTimeMs = event?.data?.invocationTimeMs;
    assert.deepStrictEqual({
      isMeasured: typeof invocationTimeMs === "number",
      excludesConfirmationDelay: typeof invocationTimeMs === "number" && invocationTimeMs < 1e3
    }, {
      isMeasured: true,
      excludesConfirmationDelay: true
    });
  });
  test("emits error for a failure without a cancellation code", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-err", "bash");
    toolComplete("turn-1", "tc-err", { success: false, pastTenseMessage: "boom", error: { message: "boom" } });
    assert.strictEqual(toolEvents()[0].data.result, "error");
  });
  test("emits a single event when a tool completion is duplicated", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-dup", "bash");
    toolComplete("turn-1", "tc-dup", { success: true, pastTenseMessage: "ran" });
    toolComplete("turn-1", "tc-dup", { success: true, pastTenseMessage: "ran" });
    assert.strictEqual(toolEvents().length, 1);
  });
  test("drops an in-flight tool call when the turn is cancelled before completion", () => {
    setupSession();
    startTurn("turn-1");
    toolStart("turn-1", "tc-inflight", "bash");
    fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
    toolComplete("turn-1", "tc-inflight", { success: true, pastTenseMessage: "ran" });
    assert.strictEqual(toolEvents().length, 0);
  });
  test("emits once when a tool confirmation remains blocked", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-confirm", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-confirm",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents(), [{
      eventName: "agentHost.toolCallStalled",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        isSubagentSession: false,
        blockerKind: SessionInputRequestKind.ToolConfirmation,
        toolId: "write",
        toolSourceKind: "agentHost",
        stalledTimeMs: true
      }
    }]);
  });
  test("replaces confirmation tracking with client execution tracking", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-client-stall", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-client-stall",
        invocationMessage: "Run tests",
        confirmationTitle: "Run tests"
      });
      fire({
        type: ActionType.ChatToolCallConfirmed,
        turnId: "turn-1",
        toolCallId: "tc-client-stall",
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents().map((e) => e.data.blockerKind), [SessionInputRequestKind.ToolClientExecution]);
  });
  test("does not emit after a client tool completes or its turn is cancelled", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-complete", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-complete",
        invocationMessage: "Run tests",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      toolComplete("turn-1", "tc-complete", { success: true, pastTenseMessage: "ran tests" });
      toolStart("turn-1", "tc-cancel", "write");
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-cancel",
        invocationMessage: "Write file",
        confirmationTitle: "Write file"
      });
      fire({ type: ActionType.ChatTurnCancelled, turnId: "turn-1", duration: 1e3 });
      await timeout(5 * 60 * 1e3);
    });
    assert.deepStrictEqual(stalledEvents(), []);
    assert.deepStrictEqual(stalledCompletionEvents(), []);
  });
  test("emits when a stalled client tool later completes", async () => {
    await runWithFakedTimers({}, async () => {
      setupSession();
      startTurn("turn-1");
      toolStart("turn-1", "tc-recovered", "run_tests", { kind: ToolCallContributorKind.Client, clientId: "client-1" });
      fire({
        type: ActionType.ChatToolCallReady,
        turnId: "turn-1",
        toolCallId: "tc-recovered",
        invocationMessage: "Run tests",
        confirmed: ToolCallConfirmationReason.NotNeeded
      });
      await timeout(5 * 60 * 1e3);
      toolComplete("turn-1", "tc-recovered", { success: true, pastTenseMessage: "ran tests" });
    });
    assert.deepStrictEqual(stalledCompletionEvents(), [{
      eventName: "agentHost.stalledToolCallCompleted",
      data: {
        provider: "mock",
        agentSessionId: "session-1",
        isSubagentSession: false,
        blockerKind: SessionInputRequestKind.ToolClientExecution,
        toolId: "run_tests",
        toolSourceKind: "client",
        result: "success",
        totalTimeMs: true,
        timeAfterStallMs: true
      }
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0VG9vbENhbGxUZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdmlydHVhbFNjaGVkdWxpbmcvcnVuV2l0aEZha2VkVGltZXJzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBDaGF0QWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIE1lc3NhZ2VLaW5kLCBTZXNzaW9uU3RhdHVzLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsU3RhdHVzLCB0eXBlIFRvb2xDYWxsQ29udHJpYnV0b3IsIHR5cGUgVG9vbENhbGxSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsVHVybnMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdExvY2FsVHVybnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2lkZUVmZmVjdHMgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50U2lkZUVmZmVjdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50IH0gZnJvbSAnLi9tb2NrQWdlbnQuanMnO1xuaW1wb3J0IHsgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5cbmNsYXNzIEZha2VDaGFuZ2VzZXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKCk6IHZvaWQgeyB9XG5cdHJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoKTogdm9pZCB7IH1cblx0cGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKCk6IHsgc2Vzc2lvbj86IHVuZGVmaW5lZCB9IHsgcmV0dXJuIHt9OyB9XG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRyZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cygpOiB7IHNlc3Npb24/OiB1bmRlZmluZWQgfSB7IHJldHVybiB7fTsgfVxuXHRwZXJzaXN0Q2hhbmdlc1N1bW1hcnkoKTogdm9pZCB7IH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb21wdXRlTGlzdEVudHJ5Q2hhbmdlcygpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KCk6IHZvaWQgeyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKCk6IHZvaWQgeyB9XG5cdG9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZSgpOiB2b2lkIHsgfVxuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25EaXNwb3NlZCgpOiB2b2lkIHsgfVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7IH1cblx0YXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3hgOyB9XG5cdGFzeW5jIGNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuIGAke3Nlc3Npb259L3lgOyB9XG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoKTogdm9pZCB7IH1cblx0b25UdXJuQ29tcGxldGUoKTogdm9pZCB7IH1cblx0b25TZXNzaW9uVHJ1bmNhdGVkKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cblx0cHVibGljTG9nKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZzIoZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXHRwdWJsaWNMb2dFcnJvcigpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKTogdm9pZCB7IH1cblx0c2V0RXhwZXJpbWVudFByb3BlcnR5KCk6IHZvaWQgeyB9XG5cdHNldENvbW1vblByb3BlcnR5KCk6IHZvaWQgeyB9XG59XG5cbi8qKlxuICogSW50ZWdyYXRpb24gdGVzdHMgY292ZXJpbmcgdGhlIHtAbGluayBBZ2VudEhvc3RUb29sQ2FsbFRyYWNrZXJ9IGFzIGl0IGlzXG4gKiBkcml2ZW4gdGhyb3VnaCB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uIFRoZXNlIGV4ZXJjaXNlIHRoZSBmdWxsIHdpcmluZ1xuICogKHRvb2wtY2FsbCBzdGFydCBzdGFtcGluZywgY29tcGxldGlvbiBlbWlzc2lvbiwgZGVkdXAgYW5kIHRoZSBpbi1mbGlnaHRcbiAqIGxlYWsgZ3VhcmQpIHNvIHdlIGNvdmVyIGJvdGggdGhlIHRyYWNrZXIgYW5kIGl0cyBpbnRlZ3JhdGlvbiB3aXRoIHRoZVxuICogc2lkZS1lZmZlY3QgZGlzcGF0Y2ggaW4gb25lIHBsYWNlLlxuICovXG5zdWl0ZSgnQWdlbnRTaWRlRWZmZWN0cyBcdTIwMTQgdG9vbCBjYWxsIHRlbGVtZXRyeScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgYWdlbnQ6IE1vY2tBZ2VudDtcblx0bGV0IHNpZGVFZmZlY3RzOiBBZ2VudFNpZGVFZmZlY3RzO1xuXHRsZXQgdGVsZW1ldHJ5OiBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlO1xuXG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpO1xuXHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0ZnVuY3Rpb24gc2V0dXBTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uS2V5LFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uS2V5LCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhcnRUdXJuKHR1cm5JZDogc3RyaW5nLCB0ZXh0ID0gJ2hlbGxvJyk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbjogQ2hhdEFjdGlvbiA9IHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH07XG5cdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGRlZmF1bHRDaGF0VXJpLCBhY3Rpb24sIHsgY2xpZW50SWQ6ICd0ZXN0JywgY2xpZW50U2VxOiAxIH0pO1xuXHRcdHNpZGVFZmZlY3RzLmhhbmRsZUFjdGlvbihkZWZhdWx0Q2hhdFVyaSwgYWN0aW9uKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZpcmUoYWN0aW9uOiBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0YWdlbnQuZmlyZVByb2dyZXNzKHsga2luZDogJ2FjdGlvbicsIHJlc291cmNlOiBVUkkucGFyc2UoZGVmYXVsdENoYXRVcmkpLCBhY3Rpb24gfSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sU3RhcnQodHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgY29udHJpYnV0b3I/OiBUb29sQ2FsbENvbnRyaWJ1dG9yKTogdm9pZCB7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZCwgdG9vbENhbGxJZCwgdG9vbE5hbWUsIGRpc3BsYXlOYW1lOiB0b29sTmFtZSwgY29udHJpYnV0b3IgfSk7XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sQ29tcGxldGUodHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCk6IHZvaWQge1xuXHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQsIHRvb2xDYWxsSWQsIHJlc3VsdCB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvb2xFdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdIHtcblx0XHRyZXR1cm4gdGVsZW1ldHJ5LmV2ZW50c1xuXHRcdFx0LmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJylcblx0XHRcdC5tYXAoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBlLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZXZlbnROYW1lOiBlLmV2ZW50TmFtZSxcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHQuLi5kYXRhLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvblRpbWVNczogZGF0YS5pbnZvY2F0aW9uVGltZU1zID09PSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0OiB0eXBlb2YgZGF0YS5pbnZvY2F0aW9uVGltZU1zID09PSAnbnVtYmVyJyAmJiBkYXRhLmludm9jYXRpb25UaW1lTXMgPj0gMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzdGFsbGVkRXZlbnRzKCk6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSB7XG5cdFx0cmV0dXJuIHRlbGVtZXRyeS5ldmVudHNcblx0XHRcdC5maWx0ZXIoZSA9PiBlLmV2ZW50TmFtZSA9PT0gJ2FnZW50SG9zdC50b29sQ2FsbFN0YWxsZWQnKVxuXHRcdFx0Lm1hcChlID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGUuZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRldmVudE5hbWU6IGUuZXZlbnROYW1lLFxuXHRcdFx0XHRcdGRhdGE6IHsgLi4uZGF0YSwgc3RhbGxlZFRpbWVNczogdHlwZW9mIGRhdGEuc3RhbGxlZFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS5zdGFsbGVkVGltZU1zID49IDAgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gc3RhbGxlZENvbXBsZXRpb25FdmVudHMoKTogeyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfVtdIHtcblx0XHRyZXR1cm4gdGVsZW1ldHJ5LmV2ZW50c1xuXHRcdFx0LmZpbHRlcihlID0+IGUuZXZlbnROYW1lID09PSAnYWdlbnRIb3N0LnN0YWxsZWRUb29sQ2FsbENvbXBsZXRlZCcpXG5cdFx0XHQubWFwKGUgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZS5kYXRhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGV2ZW50TmFtZTogZS5ldmVudE5hbWUsXG5cdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0Li4uZGF0YSxcblx0XHRcdFx0XHRcdHRvdGFsVGltZU1zOiB0eXBlb2YgZGF0YS50b3RhbFRpbWVNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50b3RhbFRpbWVNcyA+PSAwLFxuXHRcdFx0XHRcdFx0dGltZUFmdGVyU3RhbGxNczogdHlwZW9mIGRhdGEudGltZUFmdGVyU3RhbGxNcyA9PT0gJ251bWJlcicgJiYgZGF0YS50aW1lQWZ0ZXJTdGFsbE1zID49IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGFnZW50ID0gbmV3IE1vY2tBZ2VudCgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWdlbnQuZGlzcG9zZSgpKSk7XG5cdFx0c3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBhZ2VudExpc3QgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50W10+KCdhZ2VudHMnLCBbYWdlbnRdKTtcblx0XHR0ZWxlbWV0cnkgPSBuZXcgQ2FwdHVyaW5nVGVsZW1ldHJ5U2VydmljZSgpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0ZWxlbWV0cnkpKTtcblx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTG9nU2VydmljZSwgbG9nU2VydmljZV0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBuZXcgRmFrZUNoYW5nZXNldFNlcnZpY2UoKV0sXG5cdFx0XHRbSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRV0sXG5cdFx0XHRbSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIsIGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcigpKV0sXG5cdFx0XHRbSVNlc3Npb25EYXRhU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlXSxcblx0XHQpLCAvKnN0cmljdCovIHRydWUpKTtcblx0XHRzaWRlRWZmZWN0cyA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCBzdGF0ZU1hbmFnZXIsIHtcblx0XHRcdGdldEFnZW50OiAoKSA9PiBhZ2VudCxcblx0XHRcdGFnZW50czogYWdlbnRMaXN0LFxuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0bG9jYWxUdXJuczogbmV3IEFnZW50SG9zdExvY2FsVHVybnMoc2Vzc2lvbkRhdGFTZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0XHRcdG9uVHVybkNvbXBsZXRlOiAoKSA9PiB7IH0sXG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIoYWdlbnQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbWl0cyBhIHN1Y2Nlc3NmdWwgYWdlbnQtaG9zdCB0b29sIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLTEnLCAnYmFzaCcpO1xuXHRcdGZpcmUoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ3J1bicsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHR9KTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy0xJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAnbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IHNlc3Npb25LZXksXG5cdFx0XHRcdHRvb2xJZDogJ2Jhc2gnLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uVGltZU1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHVzZXJDYW5jZWxsZWQgd2l0aCBtY3Agc291cmNlIGtpbmQgZm9yIGEgZGVuaWVkIG1jcCB0b29sJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1tY3AnLCAnbG9va3VwJywgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2MxJyB9KTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy1tY3AnLCB7IHN1Y2Nlc3M6IGZhbHNlLCBwYXN0VGVuc2VNZXNzYWdlOiAnZGVuaWVkJywgZXJyb3I6IHsgbWVzc2FnZTogJ2RlbmllZCcsIGNvZGU6ICdkZW5pZWQnIH0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xFdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHJlc3VsdDogJ3VzZXJDYW5jZWxsZWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBzZXNzaW9uS2V5LFxuXHRcdFx0XHR0b29sSWQ6ICdsb29rdXAnLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdtY3AnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uVGltZU1zOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgY2xpZW50IHNvdXJjZSBraW5kIGZvciBhIGNsaWVudC1jb250cmlidXRlZCB0b29sJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1jbGllbnQnLCAncnVuX3Rlc3RzJywgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0pO1xuXHRcdGZpcmUoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtY2xpZW50Jyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAncnVuIHRlc3RzJyxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWNsaWVudCcsIHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ3JhbiB0ZXN0cycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvb2xFdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2xhbmd1YWdlTW9kZWxUb29sSW52b2tlZCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHJlc3VsdDogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBzZXNzaW9uS2V5LFxuXHRcdFx0XHR0b29sSWQ6ICdydW5fdGVzdHMnLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdjbGllbnQnLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uVGltZU1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgYWNjZXB0cyBjb250cmlidXRvciByZWZpbmVtZW50cyB0aGF0IHByZXNlcnZlIGV4ZWN1dGlvbiBvd25lcnNoaXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLW1jcC1yZWFkeScsICdsb29rdXAnKTtcblx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tY3AtcmVhZHknLFxuXHRcdFx0XHR0b29sTmFtZTogJ2xvb2t1cCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTG9va3VwJyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdtY3AtMScgfSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdMb29raW5nIHVwIG1ldGFkYXRhJyxcblx0XHRcdFx0dG9vbElucHV0OiAne30nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1sYXRlLWNsaWVudCcsICdydW5fdGVzdHMnKTtcblx0XHRhZ2VudC5maXJlUHJvZ3Jlc3Moe1xuXHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdGNoYXQ6IFVSSS5wYXJzZShkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1sYXRlLWNsaWVudCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuX3Rlc3RzJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGVzdHMnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0cycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3t9Jyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy1tY3AtcmVhZHknLCB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdsb29rZWQgdXAgbWV0YWRhdGEnIH0pO1xuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWxhdGUtY2xpZW50JywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuIHRlc3RzJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbEV2ZW50cygpLm1hcChldmVudCA9PiBldmVudC5kYXRhLnRvb2xTb3VyY2VLaW5kKSwgWydtY3AnLCAnYWdlbnRIb3N0J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBwZW5kaW5nIGNvbmZpcm1hdGlvbiB0aW1lIGZyb20gaW52b2NhdGlvbiB0aW1pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cdFx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1jb25maXJtLXRpbWluZycsICd3cml0ZScpO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb25maXJtLXRpbWluZycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTBfMDAwKTtcblxuXHRcdFx0Y29uc3QgY29uZmlybWVkOiBDaGF0QWN0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmZpcm0tdGltaW5nJyxcblx0XHRcdFx0YXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdH07XG5cdFx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oZGVmYXVsdENoYXRVcmksIGNvbmZpcm1lZCwgeyBjbGllbnRJZDogJ3Rlc3QnLCBjbGllbnRTZXE6IDIgfSk7XG5cdFx0XHRzaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oZGVmYXVsdENoYXRVcmksIGNvbmZpcm1lZCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDI1KTtcblx0XHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWNvbmZpcm0tdGltaW5nJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnd3JvdGUgZmlsZScgfSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBldmVudCA9IHRlbGVtZXRyeS5ldmVudHMuZmluZChldmVudCA9PiBldmVudC5ldmVudE5hbWUgPT09ICdsYW5ndWFnZU1vZGVsVG9vbEludm9rZWQnKTtcblx0XHRjb25zdCBpbnZvY2F0aW9uVGltZU1zID0gKGV2ZW50Py5kYXRhIGFzIHsgaW52b2NhdGlvblRpbWVNcz86IG51bWJlciB9IHwgdW5kZWZpbmVkKT8uaW52b2NhdGlvblRpbWVNcztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzTWVhc3VyZWQ6IHR5cGVvZiBpbnZvY2F0aW9uVGltZU1zID09PSAnbnVtYmVyJyxcblx0XHRcdGV4Y2x1ZGVzQ29uZmlybWF0aW9uRGVsYXk6IHR5cGVvZiBpbnZvY2F0aW9uVGltZU1zID09PSAnbnVtYmVyJyAmJiBpbnZvY2F0aW9uVGltZU1zIDwgMTAwMCxcblx0XHR9LCB7XG5cdFx0XHRpc01lYXN1cmVkOiB0cnVlLFxuXHRcdFx0ZXhjbHVkZXNDb25maXJtYXRpb25EZWxheTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgZXJyb3IgZm9yIGEgZmFpbHVyZSB3aXRob3V0IGEgY2FuY2VsbGF0aW9uIGNvZGUnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLWVycicsICdiYXNoJyk7XG5cdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtZXJyJywgeyBzdWNjZXNzOiBmYWxzZSwgcGFzdFRlbnNlTWVzc2FnZTogJ2Jvb20nLCBlcnJvcjogeyBtZXNzYWdlOiAnYm9vbScgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sRXZlbnRzKClbMF0uZGF0YS5yZXN1bHQsICdlcnJvcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBhIHNpbmdsZSBldmVudCB3aGVuIGEgdG9vbCBjb21wbGV0aW9uIGlzIGR1cGxpY2F0ZWQnLCAoKSA9PiB7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLWR1cCcsICdiYXNoJyk7XG5cdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtZHVwJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJyB9KTtcblx0XHR0b29sQ29tcGxldGUoJ3R1cm4tMScsICd0Yy1kdXAnLCB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdyYW4nIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xFdmVudHMoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBhbiBpbi1mbGlnaHQgdG9vbCBjYWxsIHdoZW4gdGhlIHR1cm4gaXMgY2FuY2VsbGVkIGJlZm9yZSBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1pbmZsaWdodCcsICdiYXNoJyk7XG5cdFx0ZmlyZSh7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0pO1xuXHRcdC8vIEEgbGF0ZSBjb21wbGV0aW9uIGFmdGVyIHRoZSB0dXJuIGVuZGVkIG11c3Qgbm90IGVtaXQ6IHRoZSBzdGFydCBlbnRyeVxuXHRcdC8vIHdhcyBjbGVhcmVkLCBzbyB0aGVyZSBpcyBubyB0aW1pbmcgdG8gcmVwb3J0LlxuXHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWluZmxpZ2h0JywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sRXZlbnRzKCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgb25jZSB3aGVuIGEgdG9vbCBjb25maXJtYXRpb24gcmVtYWlucyBibG9ja2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRzdGFydFR1cm4oJ3R1cm4tMScpO1xuXG5cdFx0XHR0b29sU3RhcnQoJ3R1cm4tMScsICd0Yy1jb25maXJtJywgJ3dyaXRlJyk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmZpcm0nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNvbmZpcm0nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1dyaXRlIGZpbGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNSAqIDYwICogMTAwMCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YWxsZWRFdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC50b29sQ2FsbFN0YWxsZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0YmxvY2tlcktpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xJZDogJ3dyaXRlJyxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRzdGFsbGVkVGltZU1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGNvbmZpcm1hdGlvbiB0cmFja2luZyB3aXRoIGNsaWVudCBleGVjdXRpb24gdHJhY2tpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdHN0YXJ0VHVybigndHVybi0xJyk7XG5cblx0XHRcdHRvb2xTdGFydCgndHVybi0xJywgJ3RjLWNsaWVudC1zdGFsbCcsICdydW5fdGVzdHMnLCB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdjbGllbnQtMScgfSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNsaWVudC1zdGFsbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRlc3RzJyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gdGVzdHMnLFxuXHRcdFx0fSk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jbGllbnQtc3RhbGwnLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoNSAqIDYwICogMTAwMCk7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YWxsZWRFdmVudHMoKS5tYXAoZSA9PiBlLmRhdGEuYmxvY2tlcktpbmQpLCBbU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbENsaWVudEV4ZWN1dGlvbl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IGFmdGVyIGEgY2xpZW50IHRvb2wgY29tcGxldGVzIG9yIGl0cyB0dXJuIGlzIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtY29tcGxldGUnLCAncnVuX3Rlc3RzJywgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0pO1xuXHRcdFx0ZmlyZSh7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jb21wbGV0ZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRlc3RzJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9KTtcblx0XHRcdHRvb2xDb21wbGV0ZSgndHVybi0xJywgJ3RjLWNvbXBsZXRlJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuIHRlc3RzJyB9KTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtY2FuY2VsJywgJ3dyaXRlJyk7XG5cdFx0XHRmaXJlKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNhbmNlbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnV3JpdGUgZmlsZScsXG5cdFx0XHR9KTtcblx0XHRcdGZpcmUoeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuLTEnLCBkdXJhdGlvbjogMTAwMCB9KTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCg1ICogNjAgKiAxMDAwKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGxlZEV2ZW50cygpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFsbGVkQ29tcGxldGlvbkV2ZW50cygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIHdoZW4gYSBzdGFsbGVkIGNsaWVudCB0b29sIGxhdGVyIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0c3RhcnRUdXJuKCd0dXJuLTEnKTtcblxuXHRcdFx0dG9vbFN0YXJ0KCd0dXJuLTEnLCAndGMtcmVjb3ZlcmVkJywgJ3J1bl90ZXN0cycsIHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2NsaWVudC0xJyB9KTtcblx0XHRcdGZpcmUoe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcmVjb3ZlcmVkJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gdGVzdHMnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUgKiA2MCAqIDEwMDApO1xuXHRcdFx0dG9vbENvbXBsZXRlKCd0dXJuLTEnLCAndGMtcmVjb3ZlcmVkJywgeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAncmFuIHRlc3RzJyB9KTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhbGxlZENvbXBsZXRpb25FdmVudHMoKSwgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2FnZW50SG9zdC5zdGFsbGVkVG9vbENhbGxDb21wbGV0ZWQnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogJ3Nlc3Npb24tMScsXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0YmxvY2tlcktpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdHRvb2xJZDogJ3J1bl90ZXN0cycsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnY2xpZW50Jyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdHRvdGFsVGltZU1zOiB0cnVlLFxuXHRcdFx0XHR0aW1lQWZ0ZXJTdGFsbE1zOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFB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
