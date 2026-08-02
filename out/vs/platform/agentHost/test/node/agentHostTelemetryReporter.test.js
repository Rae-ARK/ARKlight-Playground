import assert from "assert";
import * as zlib from "zlib";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { hash } from "../../../../base/common/hash.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { AgentSession } from "../../common/agentService.js";
import { AgentHostTelemetryReporter } from "../../node/agentHostTelemetryReporter.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
class TestRestrictedTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sendErrorTelemetry = true;
    this.sessionId = "sessionId";
    this.machineId = "machineId";
    this.sqmId = "sqmId";
    this.devDeviceId = "devDeviceId";
    this.firstSessionDate = "firstSessionDate";
    this.enhancedEvents = [];
    this.enhancedMeasurements = [];
    this.internalEvents = [];
    this.githubStandardEvents = [];
    this.standardEvents = [];
  }
  publicLog() {
  }
  publicLogError() {
  }
  publicLog2(eventName, data) {
    this.standardEvents.push({ eventName, data });
  }
  publicLogError2() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
  sendGHTelemetryEvent(eventName, properties) {
    this.githubStandardEvents.push({ eventName, properties });
  }
  sendEnhancedGHTelemetryEvent(eventName, properties, measurements) {
    this.enhancedEvents.push({ eventName, properties });
    this.enhancedMeasurements.push(measurements);
  }
  sendEnhancedGHTelemetryEventForContext(_context, eventName, properties) {
    this.enhancedEvents.push({ eventName, properties });
  }
  sendInternalMSFTTelemetryEvent(eventName, properties, _measurements) {
    this.internalEvents.push({ eventName, properties });
  }
  sendInternalMSFTTelemetryEventForContext(_context, eventName, properties) {
    this.internalEvents.push({ eventName, properties });
  }
  setCopilotTrackingId() {
  }
  setRestrictedTelemetryEndpoint() {
  }
  setRestrictedTelemetryEnabled() {
  }
  setInternalTelemetryContext() {
  }
}
suite("AgentHostTelemetryReporter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = "agent-session://copilot/abc";
  const tools = [{ name: "grep" }, { name: "edit" }];
  test("assistantMessageReceived emits request.options.tools keyed on the client request id, and no-ops without one or without tools", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, void 0, tools);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, "client-1", []);
    await reporter.assistantMessageReceived(session, AgentHostClientType.AgentsWindow, "client-1", tools);
    assert.deepStrictEqual(service.enhancedEvents, [{
      eventName: "request.options.tools",
      properties: {
        headerRequestId: "client-1",
        conversationId: AgentSession.id(session),
        initiatorClientType: "agents_window",
        messagesJson: JSON.stringify(tools),
        messagesJsonChunk: zlib.gzipSync(Buffer.from(JSON.stringify(tools), "utf8")).toString("base64")
      }
    }]);
  });
  test("userMessageText emits conversation.messageText (source=user) to enhanced + internal, and no-ops on empty content", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.userMessageText(session, AgentHostClientType.EditorWindow, "", 3);
    await reporter.userMessageText(session, AgentHostClientType.EditorWindow, "hello agent", 3);
    const expected = {
      eventName: "conversation.messageText",
      properties: {
        source: "user",
        conversationId: AgentSession.id(session),
        initiatorClientType: "editor_window",
        turnIndex: "3",
        messageText: "hello agent"
      }
    };
    assert.deepStrictEqual(service.enhancedEvents, [expected]);
    assert.deepStrictEqual(service.internalEvents, [expected]);
  });
  test("modelMessageText emits conversation.messageText (source=model) with headerRequestId, and no-ops on empty content", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, "", 3, "client-1");
    await reporter.modelMessageText(session, AgentHostClientType.AgentsWindow, "sure, here you go", 3, "client-1");
    const expected = {
      eventName: "conversation.messageText",
      properties: {
        source: "model",
        conversationId: AgentSession.id(session),
        initiatorClientType: "agents_window",
        turnIndex: "3",
        headerRequestId: "client-1",
        messageText: "sure, here you go"
      }
    };
    assert.deepStrictEqual(service.enhancedEvents, [expected]);
    assert.deepStrictEqual(service.internalEvents, [expected]);
  });
  test("toolCallDetails emits standard and restricted aggregates whenever tools were available, and no-ops when none were", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.Unknown,
      model: "gpt-x",
      responseType: "success",
      toolCounts: {},
      availableTools: [],
      turnIndex: 2,
      turnDuration: 1200,
      messageCharLen: 11,
      numRequests: 1,
      totalToolCalls: 0,
      parallelToolCallRounds: 0,
      parallelToolCallsTotal: 0
    });
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.EditorWindow,
      model: "gpt-x",
      responseType: "success",
      toolCounts: {},
      availableTools: ["grep", "edit"],
      turnIndex: 2,
      turnDuration: 1200,
      messageCharLen: 11,
      numRequests: 1,
      totalToolCalls: 0,
      parallelToolCallRounds: 0,
      parallelToolCallsTotal: 0
    });
    await reporter.toolCallDetails({
      provider: "copilot",
      session,
      turnId: "a1b2c3d4-0000-4000-8000-000000000000",
      clientType: AgentHostClientType.AgentsWindow,
      model: "gpt-x",
      responseType: "cancelled",
      toolCounts: { grep: 2, edit: 1 },
      availableTools: ["grep", "edit"],
      turnIndex: 3,
      turnDuration: 2400,
      messageCharLen: void 0,
      numRequests: 2,
      totalToolCalls: 3,
      parallelToolCallRounds: 1,
      parallelToolCallsTotal: 2
    });
    assert.deepStrictEqual(service.standardEvents, [{
      eventName: "toolCallDetails",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        responseType: "success",
        toolCounts: JSON.stringify({}),
        model: "gpt-x",
        numRequests: 1,
        turnIndex: 2,
        turnDuration: 1200,
        messageCharLen: 11,
        availableToolCount: 2,
        totalToolCalls: 0,
        parallelToolCallRounds: 0,
        parallelToolCallsTotal: 0
      }
    }, {
      eventName: "toolCallDetails",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        responseType: "cancelled",
        toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
        model: "gpt-x",
        numRequests: 2,
        turnIndex: 3,
        turnDuration: 2400,
        messageCharLen: void 0,
        availableToolCount: 2,
        totalToolCalls: 3,
        parallelToolCallRounds: 1,
        parallelToolCallsTotal: 2
      }
    }]);
    assert.deepStrictEqual(service.enhancedEvents, [{
      eventName: "toolCallDetailsExternal",
      properties: {
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        messageId: "a1b2c3d4-0000-4000-8000-000000000000",
        initiatorClientType: "editor_window",
        responseType: "success",
        model: "gpt-x",
        toolCounts: JSON.stringify({}),
        availableTools: JSON.stringify(["grep", "edit"])
      }
    }, {
      eventName: "toolCallDetailsExternal",
      properties: {
        conversationId: AgentSession.id(session),
        requestId: "a1b2c3d4-0000-4000-8000-000000000000",
        messageId: "a1b2c3d4-0000-4000-8000-000000000000",
        initiatorClientType: "agents_window",
        responseType: "cancelled",
        model: "gpt-x",
        toolCounts: JSON.stringify({ grep: 2, edit: 1 }),
        availableTools: JSON.stringify(["grep", "edit"])
      }
    }]);
    assert.strictEqual(service.internalEvents.length, 2);
    assert.strictEqual(service.internalEvents[0].eventName, "toolCallDetailsInternal");
    assert.strictEqual(service.internalEvents[1].eventName, "toolCallDetailsInternal");
  });
  test("toolApproval emits chat.toolApproval with AH discriminators and reason mapping", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-1",
      toolId: "grep",
      toolSourceKind: "internal",
      confirmKind: "confirmationNotNeeded",
      confirmationNotNeededReason: "auto-approve-all",
      requestUnsandboxedExecution: void 0
    });
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-2",
      toolId: "bash",
      toolSourceKind: "internal",
      confirmKind: "userAction",
      confirmationNotNeededReason: void 0,
      requestUnsandboxedExecution: true
    });
    reporter.toolApproval({
      provider: "copilot",
      session,
      turnId: "turn-3",
      toolId: "my-mcp-tool",
      toolSourceKind: "mcp",
      confirmKind: "denied",
      confirmationNotNeededReason: void 0,
      requestUnsandboxedExecution: void 0
    });
    assert.deepStrictEqual(service.standardEvents, [{
      eventName: "chat.toolApproval",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-1",
        toolId: "grep",
        toolExtensionId: void 0,
        toolSourceKind: "internal",
        confirmKind: "confirmationNotNeeded",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: "auto-approve-all",
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: void 0
      }
    }, {
      eventName: "chat.toolApproval",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-2",
        toolId: "bash",
        toolExtensionId: void 0,
        toolSourceKind: "internal",
        confirmKind: "userAction",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: void 0,
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: true
      }
    }, {
      eventName: "chat.toolApproval",
      data: {
        provider: "copilot",
        agentSessionId: AgentSession.id(session),
        isSubagentSession: false,
        chatSessionId: AgentSession.id(session),
        requestId: "turn-3",
        toolId: "my-mcp-tool",
        toolExtensionId: void 0,
        toolSourceKind: "mcp",
        confirmKind: "denied",
        settingId: void 0,
        lmServiceScope: void 0,
        customButtonKind: void 0,
        confirmationNotNeededReason: void 0,
        sandboxWrapped: void 0,
        requestUnsandboxedExecution: void 0
      }
    }]);
  });
  test("autoModeRouterDecision maps the SDK Hydra and binary score shapes without inventing unavailable fields", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.autoModeRouterDecision({
      session,
      turnId: "turn-hydra",
      clientType: AgentHostClientType.EditorWindow,
      chosenModel: "gpt-5",
      predictedLabel: "high",
      confidence: 0.9,
      candidateModels: ["gpt-5", "gpt-4.1"],
      categoryScores: { reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 }
    });
    reporter.autoModeRouterDecision({
      session,
      turnId: "turn-binary",
      clientType: AgentHostClientType.AgentsWindow,
      chosenModel: "gpt-4.1",
      predictedLabel: "no_reasoning",
      confidence: void 0,
      candidateModels: void 0,
      categoryScores: { needs_reasoning: 0.2, no_reasoning: 0.8 }
    });
    assert.deepStrictEqual({ events: service.enhancedEvents, measurements: service.enhancedMeasurements }, {
      events: [{
        eventName: "automode.routerDecisionRestricted",
        properties: {
          conversationId: AgentSession.id(session),
          vscodeRequestId: "turn-hydra",
          initiatorClientType: "editor_window",
          predictedLabel: "high",
          candidateModel: "gpt-5",
          chosenModel: "gpt-5",
          candidateModels: JSON.stringify(["gpt-5", "gpt-4.1"]),
          hydraScores: JSON.stringify({ reasoning: 0.8, code_gen: 0.7, debugging: 0.6, tool_use: 0.5 })
        }
      }, {
        eventName: "automode.routerDecisionRestricted",
        properties: {
          conversationId: AgentSession.id(session),
          vscodeRequestId: "turn-binary",
          initiatorClientType: "agents_window",
          predictedLabel: "no_reasoning",
          candidateModel: "",
          chosenModel: "gpt-4.1",
          candidateModels: JSON.stringify([]),
          binaryScores: JSON.stringify({ needs_reasoning: 0.2, no_reasoning: 0.8 })
        }
      }],
      measurements: [{ confidence: 0.9 }, { scoreNeedsReasoning: 0.2, scoreNoReasoning: 0.8 }]
    });
  });
  test("skillContentRead emits plaintext skill metadata to enhanced + internal, maps plugin identity + hashes content, and no-ops without a name", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.skillContentRead({ clientType: AgentHostClientType.Unknown, name: "", path: "/skills/x/SKILL.md", content: "body", source: "project", pluginName: void 0, pluginVersion: void 0 });
    reporter.skillContentRead({
      clientType: AgentHostClientType.AgentsWindow,
      name: "pdf",
      path: "/plugins/pdf/SKILL.md",
      content: "skill body",
      source: "plugin",
      pluginName: "pdf-plugin",
      pluginVersion: "1.2.3"
    });
    const expected = {
      eventName: "skillContentRead",
      properties: {
        initiatorClientType: "agents_window",
        skillName: "pdf",
        skillPath: "/plugins/pdf/SKILL.md",
        skillExtensionId: "pdf-plugin",
        skillExtensionVersion: "1.2.3",
        skillStorage: "plugin",
        skillContentHash: String(hash("skill body"))
      }
    };
    assert.deepStrictEqual({
      standard: service.githubStandardEvents,
      enhanced: service.enhancedEvents,
      internal: service.internalEvents
    }, {
      standard: [{
        eventName: "skillContentRead",
        properties: {
          initiatorClientType: "agents_window",
          skillNameHash: String(hash("pdf")),
          skillExtensionIdHash: String(hash("pdf-plugin")),
          skillExtensionVersion: "1.2.3",
          skillStorage: "plugin",
          skillContentHash: String(hash("skill body"))
        }
      }],
      enhanced: [expected],
      internal: [expected]
    });
  });
  test("repoInfo gates collection and multiplexes sink-specific properties", async () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    await reporter.reportRepoInfo({
      restrictedTelemetryEnabled: true,
      trackingId: "tracking-id",
      telemetryEndpoint: "https://telemetry.example/telemetry",
      isInternal: true,
      userName: "octocat",
      isVscodeTeamMember: true
    }, {
      telemetryMessageId: "turn-1",
      clientType: AgentHostClientType.EditorWindow,
      location: "begin",
      remoteUrl: "https://github.com/microsoft/vscode",
      repoId: "microsoft/vscode",
      repoType: "github",
      headCommitHash: "abc",
      headBranchName: "feature",
      fileRelativePaths: JSON.stringify(["src/a.ts"]),
      diffsJSON: "x".repeat(8193),
      result: "success",
      isActiveRepository: "true",
      workspaceFileCount: 10,
      changedFileCount: 1,
      diffSizeBytes: 8193
    });
    assert.deepStrictEqual({
      enhanced: service.enhancedEvents[0],
      internal: service.internalEvents[0]
    }, {
      enhanced: {
        eventName: "request.repoInfo",
        properties: {
          initiatorClientType: "editor_window",
          remoteUrl: "https://github.com/microsoft/vscode",
          repoId: "microsoft/vscode",
          repoType: "github",
          headCommitHash: "abc",
          headBranchName: "feature",
          fileRelativePaths: JSON.stringify(["src/a.ts"]),
          diffsJSON: "x".repeat(8192),
          diffsJSONChunk: zlib.gzipSync(Buffer.from("x".repeat(8193), "utf8")).toString("base64"),
          result: "success",
          isActiveRepository: "true",
          location: "begin",
          telemetryMessageId: "turn-1"
        }
      },
      internal: {
        eventName: "request.repoInfo",
        properties: {
          initiatorClientType: "editor_window",
          remoteUrl: "https://github.com/microsoft/vscode",
          repoId: "microsoft/vscode",
          repoType: "github",
          headCommitHash: "abc",
          diffsJSON: "x".repeat(8192),
          diffsJSONChunk: zlib.gzipSync(Buffer.from("x".repeat(8193), "utf8")).toString("base64"),
          result: "success",
          isActiveRepository: "true",
          location: "begin",
          telemetryMessageId: "turn-1"
        }
      }
    });
  });
  test("skillContentRead drops the version when no plugin name is known, matching the extension", () => {
    const service = new TestRestrictedTelemetryService();
    const reporter = new AgentHostTelemetryReporter(service);
    reporter.skillContentRead({ clientType: AgentHostClientType.EditorWindow, name: "local", path: "/skills/local/SKILL.md", content: "c", source: "project", pluginName: void 0, pluginVersion: "9.9.9" });
    assert.strictEqual(service.enhancedEvents.length, 1);
    assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionId, "");
    assert.strictEqual(service.enhancedEvents[0].properties?.skillExtensionVersion, "");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHpsaWIgZnJvbSAnemxpYic7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbERlZmluaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5Q29udGV4dCwgSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnksIElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCwgVGVsZW1ldHJ5TWVhc3VyZW1lbnRzLCBUZWxlbWV0cnlQcm9wcyB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcblxuaW50ZXJmYWNlIElSZXN0cmljdGVkQ2FsbCB7XG5cdGV2ZW50TmFtZTogc3RyaW5nO1xuXHRwcm9wZXJ0aWVzOiBUZWxlbWV0cnlQcm9wcyB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2UsIElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5IHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0dGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5VU0FHRTtcblx0c2VuZEVycm9yVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0c2Vzc2lvbklkID0gJ3Nlc3Npb25JZCc7XG5cdG1hY2hpbmVJZCA9ICdtYWNoaW5lSWQnO1xuXHRzcW1JZCA9ICdzcW1JZCc7XG5cdGRldkRldmljZUlkID0gJ2RldkRldmljZUlkJztcblx0Zmlyc3RTZXNzaW9uRGF0ZSA9ICdmaXJzdFNlc3Npb25EYXRlJztcblxuXHRyZWFkb25seSBlbmhhbmNlZEV2ZW50czogSVJlc3RyaWN0ZWRDYWxsW10gPSBbXTtcblx0cmVhZG9ubHkgZW5oYW5jZWRNZWFzdXJlbWVudHM6IEFycmF5PFRlbGVtZXRyeU1lYXN1cmVtZW50cyB8IHVuZGVmaW5lZD4gPSBbXTtcblx0cmVhZG9ubHkgaW50ZXJuYWxFdmVudHM6IElSZXN0cmljdGVkQ2FsbFtdID0gW107XG5cdHJlYWRvbmx5IGdpdGh1YlN0YW5kYXJkRXZlbnRzOiBJUmVzdHJpY3RlZENhbGxbXSA9IFtdO1xuXHRyZWFkb25seSBzdGFuZGFyZEV2ZW50czogQXJyYXk8eyBldmVudE5hbWU6IHN0cmluZzsgZGF0YTogSVRlbGVtZXRyeURhdGEgfCB1bmRlZmluZWQgfT4gPSBbXTtcblxuXHRwdWJsaWNMb2coKTogdm9pZCB7IH1cblx0cHVibGljTG9nRXJyb3IoKTogdm9pZCB7IH1cblx0cHVibGljTG9nMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5zdGFuZGFyZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhIH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yMigpOiB2b2lkIHsgfVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkoKTogdm9pZCB7IH1cblx0c2V0Q29tbW9uUHJvcGVydHkoKTogdm9pZCB7IH1cblxuXHRzZW5kR0hUZWxlbWV0cnlFdmVudChldmVudE5hbWU6IHN0cmluZywgcHJvcGVydGllcz86IFRlbGVtZXRyeVByb3BzKTogdm9pZCB7XG5cdFx0dGhpcy5naXRodWJTdGFuZGFyZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBwcm9wZXJ0aWVzIH0pO1xuXHR9XG5cdHNlbmRFbmhhbmNlZEdIVGVsZW1ldHJ5RXZlbnQoZXZlbnROYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBUZWxlbWV0cnlQcm9wcywgbWVhc3VyZW1lbnRzPzogVGVsZW1ldHJ5TWVhc3VyZW1lbnRzKTogdm9pZCB7XG5cdFx0dGhpcy5lbmhhbmNlZEV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBwcm9wZXJ0aWVzIH0pO1xuXHRcdHRoaXMuZW5oYW5jZWRNZWFzdXJlbWVudHMucHVzaChtZWFzdXJlbWVudHMpO1xuXHR9XG5cdHNlbmRFbmhhbmNlZEdIVGVsZW1ldHJ5RXZlbnRGb3JDb250ZXh0KF9jb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIGV2ZW50TmFtZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogVGVsZW1ldHJ5UHJvcHMpOiB2b2lkIHtcblx0XHR0aGlzLmVuaGFuY2VkRXZlbnRzLnB1c2goeyBldmVudE5hbWUsIHByb3BlcnRpZXMgfSk7XG5cdH1cblx0c2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50KGV2ZW50TmFtZTogc3RyaW5nLCBwcm9wZXJ0aWVzPzogVGVsZW1ldHJ5UHJvcHMsIF9tZWFzdXJlbWVudHM/OiBUZWxlbWV0cnlNZWFzdXJlbWVudHMpOiB2b2lkIHtcblx0XHR0aGlzLmludGVybmFsRXZlbnRzLnB1c2goeyBldmVudE5hbWUsIHByb3BlcnRpZXMgfSk7XG5cdH1cblx0c2VuZEludGVybmFsTVNGVFRlbGVtZXRyeUV2ZW50Rm9yQ29udGV4dChfY29udGV4dDogSUFnZW50SG9zdEludGVybmFsVGVsZW1ldHJ5Q29udGV4dCwgZXZlbnROYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBUZWxlbWV0cnlQcm9wcyk6IHZvaWQge1xuXHRcdHRoaXMuaW50ZXJuYWxFdmVudHMucHVzaCh7IGV2ZW50TmFtZSwgcHJvcGVydGllcyB9KTtcblx0fVxuXHRzZXRDb3BpbG90VHJhY2tpbmdJZCgpOiB2b2lkIHsgfVxuXHRzZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5kcG9pbnQoKTogdm9pZCB7IH1cblx0c2V0UmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoKTogdm9pZCB7IH1cblx0c2V0SW50ZXJuYWxUZWxlbWV0cnlDb250ZXh0KCk6IHZvaWQgeyB9XG59XG5cbnN1aXRlKCdBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9ICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9hYmMnO1xuXHRjb25zdCB0b29sczogVG9vbERlZmluaXRpb25bXSA9IFt7IG5hbWU6ICdncmVwJyB9LCB7IG5hbWU6ICdlZGl0JyB9XTtcblxuXHR0ZXN0KCdhc3Npc3RhbnRNZXNzYWdlUmVjZWl2ZWQgZW1pdHMgcmVxdWVzdC5vcHRpb25zLnRvb2xzIGtleWVkIG9uIHRoZSBjbGllbnQgcmVxdWVzdCBpZCwgYW5kIG5vLW9wcyB3aXRob3V0IG9uZSBvciB3aXRob3V0IHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRhd2FpdCByZXBvcnRlci5hc3Npc3RhbnRNZXNzYWdlUmVjZWl2ZWQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csIHVuZGVmaW5lZCwgdG9vbHMpOyAvLyBkcm9wcGVkOiBubyBjbGllbnQgcmVxdWVzdCBpZFxuXHRcdGF3YWl0IHJlcG9ydGVyLmFzc2lzdGFudE1lc3NhZ2VSZWNlaXZlZChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdywgJ2NsaWVudC0xJywgW10pOyAvLyBkcm9wcGVkOiBubyB0b29sc1xuXHRcdGF3YWl0IHJlcG9ydGVyLmFzc2lzdGFudE1lc3NhZ2VSZWNlaXZlZChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdywgJ2NsaWVudC0xJywgdG9vbHMpOyAvLyBlbWl0dGVkXG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICdyZXF1ZXN0Lm9wdGlvbnMudG9vbHMnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRoZWFkZXJSZXF1ZXN0SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdFx0bWVzc2FnZXNKc29uOiBKU09OLnN0cmluZ2lmeSh0b29scyksXG5cdFx0XHRcdG1lc3NhZ2VzSnNvbkNodW5rOiB6bGliLmd6aXBTeW5jKEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHRvb2xzKSwgJ3V0ZjgnKSkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXJNZXNzYWdlVGV4dCBlbWl0cyBjb252ZXJzYXRpb24ubWVzc2FnZVRleHQgKHNvdXJjZT11c2VyKSB0byBlbmhhbmNlZCArIGludGVybmFsLCBhbmQgbm8tb3BzIG9uIGVtcHR5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLnVzZXJNZXNzYWdlVGV4dChzZXNzaW9uLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgJycsIDMpOyAvLyBkcm9wcGVkOiBubyBjb250ZW50XG5cdFx0YXdhaXQgcmVwb3J0ZXIudXNlck1lc3NhZ2VUZXh0KHNlc3Npb24sIEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCAnaGVsbG8gYWdlbnQnLCAzKTsgLy8gZW1pdHRlZFxuXG5cdFx0Y29uc3QgZXhwZWN0ZWQ6IElSZXN0cmljdGVkQ2FsbCA9IHtcblx0XHRcdGV2ZW50TmFtZTogJ2NvbnZlcnNhdGlvbi5tZXNzYWdlVGV4dCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHNvdXJjZTogJ3VzZXInLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnZWRpdG9yX3dpbmRvdycsXG5cdFx0XHRcdHR1cm5JbmRleDogJzMnLFxuXHRcdFx0XHRtZXNzYWdlVGV4dDogJ2hlbGxvIGFnZW50Jyxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFtleHBlY3RlZF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5pbnRlcm5hbEV2ZW50cywgW2V4cGVjdGVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsTWVzc2FnZVRleHQgZW1pdHMgY29udmVyc2F0aW9uLm1lc3NhZ2VUZXh0IChzb3VyY2U9bW9kZWwpIHdpdGggaGVhZGVyUmVxdWVzdElkLCBhbmQgbm8tb3BzIG9uIGVtcHR5IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csICcnLCAzLCAnY2xpZW50LTEnKTsgLy8gZHJvcHBlZDogbm8gY29udGVudFxuXHRcdGF3YWl0IHJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQoc2Vzc2lvbiwgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csICdzdXJlLCBoZXJlIHlvdSBnbycsIDMsICdjbGllbnQtMScpOyAvLyBlbWl0dGVkXG5cblx0XHRjb25zdCBleHBlY3RlZDogSVJlc3RyaWN0ZWRDYWxsID0ge1xuXHRcdFx0ZXZlbnROYW1lOiAnY29udmVyc2F0aW9uLm1lc3NhZ2VUZXh0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c291cmNlOiAnbW9kZWwnLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdHR1cm5JbmRleDogJzMnLFxuXHRcdFx0XHRoZWFkZXJSZXF1ZXN0SWQ6ICdjbGllbnQtMScsXG5cdFx0XHRcdG1lc3NhZ2VUZXh0OiAnc3VyZSwgaGVyZSB5b3UgZ28nLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5lbmhhbmNlZEV2ZW50cywgW2V4cGVjdGVkXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmludGVybmFsRXZlbnRzLCBbZXhwZWN0ZWRdKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbENhbGxEZXRhaWxzIGVtaXRzIHN0YW5kYXJkIGFuZCByZXN0cmljdGVkIGFnZ3JlZ2F0ZXMgd2hlbmV2ZXIgdG9vbHMgd2VyZSBhdmFpbGFibGUsIGFuZCBuby1vcHMgd2hlbiBub25lIHdlcmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IHJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIG1vZGVsOiAnZ3B0LXgnLCByZXNwb25zZVR5cGU6ICdzdWNjZXNzJyxcblx0XHRcdHRvb2xDb3VudHM6IHt9LCBhdmFpbGFibGVUb29sczogW10sXG5cdFx0XHR0dXJuSW5kZXg6IDIsIHR1cm5EdXJhdGlvbjogMTIwMCwgbWVzc2FnZUNoYXJMZW46IDExLFxuXHRcdFx0bnVtUmVxdWVzdHM6IDEsIHRvdGFsVG9vbENhbGxzOiAwLCBwYXJhbGxlbFRvb2xDYWxsUm91bmRzOiAwLCBwYXJhbGxlbFRvb2xDYWxsc1RvdGFsOiAwLFxuXHRcdH0pOyAvLyBkcm9wcGVkOiBubyB0b29scyB3ZXJlIGF2YWlsYWJsZVxuXHRcdGF3YWl0IHJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgbW9kZWw6ICdncHQteCcsIHJlc3BvbnNlVHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0dG9vbENvdW50czoge30sIGF2YWlsYWJsZVRvb2xzOiBbJ2dyZXAnLCAnZWRpdCddLFxuXHRcdFx0dHVybkluZGV4OiAyLCB0dXJuRHVyYXRpb246IDEyMDAsIG1lc3NhZ2VDaGFyTGVuOiAxMSxcblx0XHRcdG51bVJlcXVlc3RzOiAxLCB0b3RhbFRvb2xDYWxsczogMCwgcGFyYWxsZWxUb29sQ2FsbFJvdW5kczogMCwgcGFyYWxsZWxUb29sQ2FsbHNUb3RhbDogMCxcblx0XHR9KTsgLy8gZW1pdHRlZDogdG9vbHMgYXZhaWxhYmxlLCBldmVuIHRob3VnaCBubyB0b29sIGNhbGxzIHdlcmUgbWFkZVxuXHRcdGF3YWl0IHJlcG9ydGVyLnRvb2xDYWxsRGV0YWlscyh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdywgbW9kZWw6ICdncHQteCcsIHJlc3BvbnNlVHlwZTogJ2NhbmNlbGxlZCcsXG5cdFx0XHR0b29sQ291bnRzOiB7IGdyZXA6IDIsIGVkaXQ6IDEgfSwgYXZhaWxhYmxlVG9vbHM6IFsnZ3JlcCcsICdlZGl0J10sXG5cdFx0XHR0dXJuSW5kZXg6IDMsIHR1cm5EdXJhdGlvbjogMjQwMCwgbWVzc2FnZUNoYXJMZW46IHVuZGVmaW5lZCxcblx0XHRcdG51bVJlcXVlc3RzOiAyLCB0b3RhbFRvb2xDYWxsczogMywgcGFyYWxsZWxUb29sQ2FsbFJvdW5kczogMSwgcGFyYWxsZWxUb29sQ2FsbHNUb3RhbDogMixcblx0XHR9KTsgLy8gZW1pdHRlZFxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnN0YW5kYXJkRXZlbnRzLCBbe1xuXHRcdFx0ZXZlbnROYW1lOiAndG9vbENhbGxEZXRhaWxzJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRyZXNwb25zZVR5cGU6ICdzdWNjZXNzJyxcblx0XHRcdFx0dG9vbENvdW50czogSlNPTi5zdHJpbmdpZnkoe30pLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC14Jyxcblx0XHRcdFx0bnVtUmVxdWVzdHM6IDEsXG5cdFx0XHRcdHR1cm5JbmRleDogMixcblx0XHRcdFx0dHVybkR1cmF0aW9uOiAxMjAwLFxuXHRcdFx0XHRtZXNzYWdlQ2hhckxlbjogMTEsXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xDb3VudDogMixcblx0XHRcdFx0dG90YWxUb29sQ2FsbHM6IDAsXG5cdFx0XHRcdHBhcmFsbGVsVG9vbENhbGxSb3VuZHM6IDAsXG5cdFx0XHRcdHBhcmFsbGVsVG9vbENhbGxzVG90YWw6IDAsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50TmFtZTogJ3Rvb2xDYWxsRGV0YWlscycsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0cmVxdWVzdElkOiAnYTFiMmMzZDQtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAwJyxcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0dG9vbENvdW50czogSlNPTi5zdHJpbmdpZnkoeyBncmVwOiAyLCBlZGl0OiAxIH0pLFxuXHRcdFx0XHRtb2RlbDogJ2dwdC14Jyxcblx0XHRcdFx0bnVtUmVxdWVzdHM6IDIsXG5cdFx0XHRcdHR1cm5JbmRleDogMyxcblx0XHRcdFx0dHVybkR1cmF0aW9uOiAyNDAwLFxuXHRcdFx0XHRtZXNzYWdlQ2hhckxlbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRhdmFpbGFibGVUb29sQ291bnQ6IDIsXG5cdFx0XHRcdHRvdGFsVG9vbENhbGxzOiAzLFxuXHRcdFx0XHRwYXJhbGxlbFRvb2xDYWxsUm91bmRzOiAxLFxuXHRcdFx0XHRwYXJhbGxlbFRvb2xDYWxsc1RvdGFsOiAyLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHMsIFt7XG5cdFx0XHRldmVudE5hbWU6ICd0b29sQ2FsbERldGFpbHNFeHRlcm5hbCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdHJlcXVlc3RJZDogJ2ExYjJjM2Q0LTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMCcsXG5cdFx0XHRcdG1lc3NhZ2VJZDogJ2ExYjJjM2Q0LTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMCcsXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiAnc3VjY2VzcycsXG5cdFx0XHRcdG1vZGVsOiAnZ3B0LXgnLFxuXHRcdFx0XHR0b29sQ291bnRzOiBKU09OLnN0cmluZ2lmeSh7fSksXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBKU09OLnN0cmluZ2lmeShbJ2dyZXAnLCAnZWRpdCddKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnROYW1lOiAndG9vbENhbGxEZXRhaWxzRXh0ZXJuYWwnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRtZXNzYWdlSWQ6ICdhMWIyYzNkNC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDAnLFxuXHRcdFx0XHRpbml0aWF0b3JDbGllbnRUeXBlOiAnYWdlbnRzX3dpbmRvdycsXG5cdFx0XHRcdHJlc3BvbnNlVHlwZTogJ2NhbmNlbGxlZCcsXG5cdFx0XHRcdG1vZGVsOiAnZ3B0LXgnLFxuXHRcdFx0XHR0b29sQ291bnRzOiBKU09OLnN0cmluZ2lmeSh7IGdyZXA6IDIsIGVkaXQ6IDEgfSksXG5cdFx0XHRcdGF2YWlsYWJsZVRvb2xzOiBKU09OLnN0cmluZ2lmeShbJ2dyZXAnLCAnZWRpdCddKSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmludGVybmFsRXZlbnRzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaW50ZXJuYWxFdmVudHNbMF0uZXZlbnROYW1lLCAndG9vbENhbGxEZXRhaWxzSW50ZXJuYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5pbnRlcm5hbEV2ZW50c1sxXS5ldmVudE5hbWUsICd0b29sQ2FsbERldGFpbHNJbnRlcm5hbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sQXBwcm92YWwgZW1pdHMgY2hhdC50b29sQXBwcm92YWwgd2l0aCBBSCBkaXNjcmltaW5hdG9ycyBhbmQgcmVhc29uIG1hcHBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UmVzdHJpY3RlZFRlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCByZXBvcnRlciA9IG5ldyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcihzZXJ2aWNlKTtcblxuXHRcdHJlcG9ydGVyLnRvb2xBcHByb3ZhbCh7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLCBzZXNzaW9uLCB0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbElkOiAnZ3JlcCcsIHRvb2xTb3VyY2VLaW5kOiAnaW50ZXJuYWwnLFxuXHRcdFx0Y29uZmlybUtpbmQ6ICdjb25maXJtYXRpb25Ob3ROZWVkZWQnLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiAnYXV0by1hcHByb3ZlLWFsbCcsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRyZXBvcnRlci50b29sQXBwcm92YWwoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jywgc2Vzc2lvbiwgdHVybklkOiAndHVybi0yJyxcblx0XHRcdHRvb2xJZDogJ2Jhc2gnLCB0b29sU291cmNlS2luZDogJ2ludGVybmFsJyxcblx0XHRcdGNvbmZpcm1LaW5kOiAndXNlckFjdGlvbicsXG5cdFx0XHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdHJ1ZSxcblx0XHR9KTtcblx0XHRyZXBvcnRlci50b29sQXBwcm92YWwoe1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jywgc2Vzc2lvbiwgdHVybklkOiAndHVybi0zJyxcblx0XHRcdHRvb2xJZDogJ215LW1jcC10b29sJywgdG9vbFNvdXJjZUtpbmQ6ICdtY3AnLFxuXHRcdFx0Y29uZmlybUtpbmQ6ICdkZW5pZWQnLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5zdGFuZGFyZEV2ZW50cywgW3tcblx0XHRcdGV2ZW50TmFtZTogJ2NoYXQudG9vbEFwcHJvdmFsJyxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IGZhbHNlLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xJZDogJ2dyZXAnLFxuXHRcdFx0XHR0b29sRXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbFNvdXJjZUtpbmQ6ICdpbnRlcm5hbCcsXG5cdFx0XHRcdGNvbmZpcm1LaW5kOiAnY29uZmlybWF0aW9uTm90TmVlZGVkJyxcblx0XHRcdFx0c2V0dGluZ0lkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxtU2VydmljZVNjb3BlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN1c3RvbUJ1dHRvbktpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiAnYXV0by1hcHByb3ZlLWFsbCcsXG5cdFx0XHRcdHNhbmRib3hXcmFwcGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRldmVudE5hbWU6ICdjaGF0LnRvb2xBcHByb3ZhbCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTInLFxuXHRcdFx0XHR0b29sSWQ6ICdiYXNoJyxcblx0XHRcdFx0dG9vbEV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTb3VyY2VLaW5kOiAnaW50ZXJuYWwnLFxuXHRcdFx0XHRjb25maXJtS2luZDogJ3VzZXJBY3Rpb24nLFxuXHRcdFx0XHRzZXR0aW5nSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG1TZXJ2aWNlU2NvcGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3VzdG9tQnV0dG9uS2luZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25Ob3ROZWVkZWRSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdFx0c2FuZGJveFdyYXBwZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRldmVudE5hbWU6ICdjaGF0LnRvb2xBcHByb3ZhbCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBmYWxzZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICd0dXJuLTMnLFxuXHRcdFx0XHR0b29sSWQ6ICdteS1tY3AtdG9vbCcsXG5cdFx0XHRcdHRvb2xFeHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0b29sU291cmNlS2luZDogJ21jcCcsXG5cdFx0XHRcdGNvbmZpcm1LaW5kOiAnZGVuaWVkJyxcblx0XHRcdFx0c2V0dGluZ0lkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxtU2VydmljZVNjb3BlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGN1c3RvbUJ1dHRvbktpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNhbmRib3hXcmFwcGVkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9Nb2RlUm91dGVyRGVjaXNpb24gbWFwcyB0aGUgU0RLIEh5ZHJhIGFuZCBiaW5hcnkgc2NvcmUgc2hhcGVzIHdpdGhvdXQgaW52ZW50aW5nIHVuYXZhaWxhYmxlIGZpZWxkcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RSZXN0cmljdGVkVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHNlcnZpY2UpO1xuXG5cdFx0cmVwb3J0ZXIuYXV0b01vZGVSb3V0ZXJEZWNpc2lvbih7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dHVybklkOiAndHVybi1oeWRyYScsXG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0cHJlZGljdGVkTGFiZWw6ICdoaWdoJyxcblx0XHRcdGNvbmZpZGVuY2U6IDAuOSxcblx0XHRcdGNhbmRpZGF0ZU1vZGVsczogWydncHQtNScsICdncHQtNC4xJ10sXG5cdFx0XHRjYXRlZ29yeVNjb3JlczogeyByZWFzb25pbmc6IDAuOCwgY29kZV9nZW46IDAuNywgZGVidWdnaW5nOiAwLjYsIHRvb2xfdXNlOiAwLjUgfSxcblx0XHR9KTtcblx0XHRyZXBvcnRlci5hdXRvTW9kZVJvdXRlckRlY2lzaW9uKHtcblx0XHRcdHNlc3Npb24sXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWJpbmFyeScsXG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdyxcblx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTQuMScsXG5cdFx0XHRwcmVkaWN0ZWRMYWJlbDogJ25vX3JlYXNvbmluZycsXG5cdFx0XHRjb25maWRlbmNlOiB1bmRlZmluZWQsXG5cdFx0XHRjYW5kaWRhdGVNb2RlbHM6IHVuZGVmaW5lZCxcblx0XHRcdGNhdGVnb3J5U2NvcmVzOiB7IG5lZWRzX3JlYXNvbmluZzogMC4yLCBub19yZWFzb25pbmc6IDAuOCB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGV2ZW50czogc2VydmljZS5lbmhhbmNlZEV2ZW50cywgbWVhc3VyZW1lbnRzOiBzZXJ2aWNlLmVuaGFuY2VkTWVhc3VyZW1lbnRzIH0sIHtcblx0XHRcdGV2ZW50czogW3tcblx0XHRcdFx0ZXZlbnROYW1lOiAnYXV0b21vZGUucm91dGVyRGVjaXNpb25SZXN0cmljdGVkJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksXG5cdFx0XHRcdFx0dnNjb2RlUmVxdWVzdElkOiAndHVybi1oeWRyYScsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0XHRcdHByZWRpY3RlZExhYmVsOiAnaGlnaCcsXG5cdFx0XHRcdFx0Y2FuZGlkYXRlTW9kZWw6ICdncHQtNScsXG5cdFx0XHRcdFx0Y2hvc2VuTW9kZWw6ICdncHQtNScsXG5cdFx0XHRcdFx0Y2FuZGlkYXRlTW9kZWxzOiBKU09OLnN0cmluZ2lmeShbJ2dwdC01JywgJ2dwdC00LjEnXSksXG5cdFx0XHRcdFx0aHlkcmFTY29yZXM6IEpTT04uc3RyaW5naWZ5KHsgcmVhc29uaW5nOiAwLjgsIGNvZGVfZ2VuOiAwLjcsIGRlYnVnZ2luZzogMC42LCB0b29sX3VzZTogMC41IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRldmVudE5hbWU6ICdhdXRvbW9kZS5yb3V0ZXJEZWNpc2lvblJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0Y29udmVyc2F0aW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSxcblx0XHRcdFx0XHR2c2NvZGVSZXF1ZXN0SWQ6ICd0dXJuLWJpbmFyeScsXG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2FnZW50c193aW5kb3cnLFxuXHRcdFx0XHRcdHByZWRpY3RlZExhYmVsOiAnbm9fcmVhc29uaW5nJyxcblx0XHRcdFx0XHRjYW5kaWRhdGVNb2RlbDogJycsXG5cdFx0XHRcdFx0Y2hvc2VuTW9kZWw6ICdncHQtNC4xJyxcblx0XHRcdFx0XHRjYW5kaWRhdGVNb2RlbHM6IEpTT04uc3RyaW5naWZ5KFtdKSxcblx0XHRcdFx0XHRiaW5hcnlTY29yZXM6IEpTT04uc3RyaW5naWZ5KHsgbmVlZHNfcmVhc29uaW5nOiAwLjIsIG5vX3JlYXNvbmluZzogMC44IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRtZWFzdXJlbWVudHM6IFt7IGNvbmZpZGVuY2U6IDAuOSB9LCB7IHNjb3JlTmVlZHNSZWFzb25pbmc6IDAuMiwgc2NvcmVOb1JlYXNvbmluZzogMC44IH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lsbENvbnRlbnRSZWFkIGVtaXRzIHBsYWludGV4dCBza2lsbCBtZXRhZGF0YSB0byBlbmhhbmNlZCArIGludGVybmFsLCBtYXBzIHBsdWdpbiBpZGVudGl0eSArIGhhc2hlcyBjb250ZW50LCBhbmQgbm8tb3BzIHdpdGhvdXQgYSBuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRyZXBvcnRlci5za2lsbENvbnRlbnRSZWFkKHsgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLCBuYW1lOiAnJywgcGF0aDogJy9za2lsbHMveC9TS0lMTC5tZCcsIGNvbnRlbnQ6ICdib2R5Jywgc291cmNlOiAncHJvamVjdCcsIHBsdWdpbk5hbWU6IHVuZGVmaW5lZCwgcGx1Z2luVmVyc2lvbjogdW5kZWZpbmVkIH0pOyAvLyBkcm9wcGVkOiBubyBuYW1lXG5cdFx0cmVwb3J0ZXIuc2tpbGxDb250ZW50UmVhZCh7XG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkFnZW50c1dpbmRvdyxcblx0XHRcdG5hbWU6ICdwZGYnLCBwYXRoOiAnL3BsdWdpbnMvcGRmL1NLSUxMLm1kJywgY29udGVudDogJ3NraWxsIGJvZHknLFxuXHRcdFx0c291cmNlOiAncGx1Z2luJywgcGx1Z2luTmFtZTogJ3BkZi1wbHVnaW4nLCBwbHVnaW5WZXJzaW9uOiAnMS4yLjMnLFxuXHRcdH0pOyAvLyBlbWl0dGVkXG5cblx0XHRjb25zdCBleHBlY3RlZDogSVJlc3RyaWN0ZWRDYWxsID0ge1xuXHRcdFx0ZXZlbnROYW1lOiAnc2tpbGxDb250ZW50UmVhZCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdFx0c2tpbGxOYW1lOiAncGRmJyxcblx0XHRcdFx0c2tpbGxQYXRoOiAnL3BsdWdpbnMvcGRmL1NLSUxMLm1kJyxcblx0XHRcdFx0c2tpbGxFeHRlbnNpb25JZDogJ3BkZi1wbHVnaW4nLFxuXHRcdFx0XHRza2lsbEV4dGVuc2lvblZlcnNpb246ICcxLjIuMycsXG5cdFx0XHRcdHNraWxsU3RvcmFnZTogJ3BsdWdpbicsXG5cdFx0XHRcdHNraWxsQ29udGVudEhhc2g6IFN0cmluZyhoYXNoKCdza2lsbCBib2R5JykpLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhbmRhcmQ6IHNlcnZpY2UuZ2l0aHViU3RhbmRhcmRFdmVudHMsXG5cdFx0XHRlbmhhbmNlZDogc2VydmljZS5lbmhhbmNlZEV2ZW50cyxcblx0XHRcdGludGVybmFsOiBzZXJ2aWNlLmludGVybmFsRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdHN0YW5kYXJkOiBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdza2lsbENvbnRlbnRSZWFkJyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdhZ2VudHNfd2luZG93Jyxcblx0XHRcdFx0XHRza2lsbE5hbWVIYXNoOiBTdHJpbmcoaGFzaCgncGRmJykpLFxuXHRcdFx0XHRcdHNraWxsRXh0ZW5zaW9uSWRIYXNoOiBTdHJpbmcoaGFzaCgncGRmLXBsdWdpbicpKSxcblx0XHRcdFx0XHRza2lsbEV4dGVuc2lvblZlcnNpb246ICcxLjIuMycsXG5cdFx0XHRcdFx0c2tpbGxTdG9yYWdlOiAncGx1Z2luJyxcblx0XHRcdFx0XHRza2lsbENvbnRlbnRIYXNoOiBTdHJpbmcoaGFzaCgnc2tpbGwgYm9keScpKSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdFx0ZW5oYW5jZWQ6IFtleHBlY3RlZF0sXG5cdFx0XHRpbnRlcm5hbDogW2V4cGVjdGVkXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb0luZm8gZ2F0ZXMgY29sbGVjdGlvbiBhbmQgbXVsdGlwbGV4ZXMgc2luay1zcGVjaWZpYyBwcm9wZXJ0aWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFJlc3RyaWN0ZWRUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIoc2VydmljZSk7XG5cblx0XHRhd2FpdCByZXBvcnRlci5yZXBvcnRSZXBvSW5mbyh7XG5cdFx0XHRyZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogdHJ1ZSxcblx0XHRcdHRyYWNraW5nSWQ6ICd0cmFja2luZy1pZCcsXG5cdFx0XHR0ZWxlbWV0cnlFbmRwb2ludDogJ2h0dHBzOi8vdGVsZW1ldHJ5LmV4YW1wbGUvdGVsZW1ldHJ5Jyxcblx0XHRcdGlzSW50ZXJuYWw6IHRydWUsXG5cdFx0XHR1c2VyTmFtZTogJ29jdG9jYXQnLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0cnVlLFxuXHRcdH0sIHtcblx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZDogJ3R1cm4tMScsXG5cdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdGxvY2F0aW9uOiAnYmVnaW4nLFxuXHRcdFx0cmVtb3RlVXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRyZXBvVHlwZTogJ2dpdGh1YicsXG5cdFx0XHRoZWFkQ29tbWl0SGFzaDogJ2FiYycsXG5cdFx0XHRoZWFkQnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IEpTT04uc3RyaW5naWZ5KFsnc3JjL2EudHMnXSksXG5cdFx0XHRkaWZmc0pTT046ICd4Jy5yZXBlYXQoODE5MyksXG5cdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdGlzQWN0aXZlUmVwb3NpdG9yeTogJ3RydWUnLFxuXHRcdFx0d29ya3NwYWNlRmlsZUNvdW50OiAxMCxcblx0XHRcdGNoYW5nZWRGaWxlQ291bnQ6IDEsXG5cdFx0XHRkaWZmU2l6ZUJ5dGVzOiA4MTkzLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbmhhbmNlZDogc2VydmljZS5lbmhhbmNlZEV2ZW50c1swXSxcblx0XHRcdGludGVybmFsOiBzZXJ2aWNlLmludGVybmFsRXZlbnRzWzBdLFxuXHRcdH0sIHtcblx0XHRcdGVuaGFuY2VkOiB7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ3JlcXVlc3QucmVwb0luZm8nLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0XHRcdHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0XHRyZXBvSWQ6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0XHRyZXBvVHlwZTogJ2dpdGh1YicsXG5cdFx0XHRcdFx0aGVhZENvbW1pdEhhc2g6ICdhYmMnLFxuXHRcdFx0XHRcdGhlYWRCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IEpTT04uc3RyaW5naWZ5KFsnc3JjL2EudHMnXSksXG5cdFx0XHRcdFx0ZGlmZnNKU09OOiAneCcucmVwZWF0KDgxOTIpLFxuXHRcdFx0XHRcdGRpZmZzSlNPTkNodW5rOiB6bGliLmd6aXBTeW5jKEJ1ZmZlci5mcm9tKCd4Jy5yZXBlYXQoODE5MyksICd1dGY4JykpLnRvU3RyaW5nKCdiYXNlNjQnKSxcblx0XHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdFx0XHRpc0FjdGl2ZVJlcG9zaXRvcnk6ICd0cnVlJyxcblx0XHRcdFx0XHRsb2NhdGlvbjogJ2JlZ2luJyxcblx0XHRcdFx0XHR0ZWxlbWV0cnlNZXNzYWdlSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGludGVybmFsOiB7XG5cdFx0XHRcdGV2ZW50TmFtZTogJ3JlcXVlc3QucmVwb0luZm8nLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogJ2VkaXRvcl93aW5kb3cnLFxuXHRcdFx0XHRcdHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0XHRyZXBvSWQ6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdFx0XHRyZXBvVHlwZTogJ2dpdGh1YicsXG5cdFx0XHRcdFx0aGVhZENvbW1pdEhhc2g6ICdhYmMnLFxuXHRcdFx0XHRcdGRpZmZzSlNPTjogJ3gnLnJlcGVhdCg4MTkyKSxcblx0XHRcdFx0XHRkaWZmc0pTT05DaHVuazogemxpYi5nemlwU3luYyhCdWZmZXIuZnJvbSgneCcucmVwZWF0KDgxOTMpLCAndXRmOCcpKS50b1N0cmluZygnYmFzZTY0JyksXG5cdFx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0aXNBY3RpdmVSZXBvc2l0b3J5OiAndHJ1ZScsXG5cdFx0XHRcdFx0bG9jYXRpb246ICdiZWdpbicsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkOiAndHVybi0xJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraWxsQ29udGVudFJlYWQgZHJvcHMgdGhlIHZlcnNpb24gd2hlbiBubyBwbHVnaW4gbmFtZSBpcyBrbm93biwgbWF0Y2hpbmcgdGhlIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RSZXN0cmljdGVkVGVsZW1ldHJ5U2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHNlcnZpY2UpO1xuXG5cdFx0cmVwb3J0ZXIuc2tpbGxDb250ZW50UmVhZCh7IGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCBuYW1lOiAnbG9jYWwnLCBwYXRoOiAnL3NraWxscy9sb2NhbC9TS0lMTC5tZCcsIGNvbnRlbnQ6ICdjJywgc291cmNlOiAncHJvamVjdCcsIHBsdWdpbk5hbWU6IHVuZGVmaW5lZCwgcGx1Z2luVmVyc2lvbjogJzkuOS45JyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmVuaGFuY2VkRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZW5oYW5jZWRFdmVudHNbMF0ucHJvcGVydGllcz8uc2tpbGxFeHRlbnNpb25JZCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmVuaGFuY2VkRXZlbnRzWzBdLnByb3BlcnRpZXM/LnNraWxsRXh0ZW5zaW9uVmVyc2lvbiwgJycpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksVUFBVTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLFlBQVk7QUFDckIsU0FBNEMsc0JBQXNCO0FBQ2xFLFNBQVMsb0JBQW9CO0FB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
