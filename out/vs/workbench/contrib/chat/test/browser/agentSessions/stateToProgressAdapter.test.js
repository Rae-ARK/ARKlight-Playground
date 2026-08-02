import assert from "assert";
import { autorun } from "../../../../../../base/common/observable.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { McpAuthRequiredReason } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { fromAgentHostUri, toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { buildSubagentChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, MessageKind, ToolCallContributorKind, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolCallConfirmationReason, ToolResultContentType, TurnState, ResponsePartKind, readUsageInfoMeta, ToolCallCancellationReason } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { isToolResultInputOutputDetails, ToolDataSource, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { turnsToHistory as rawTurnsToHistory, activeTurnToProgress as rawActiveTurnToProgress, completedToolCallToSerialized, containsAutomaticReplyAnswer, createInputRequestCarousel, toolCallStateToInvocation as rawToolCallStateToInvocation, toolCallStateToPreparedInvocation as rawToolCallStateToPreparedInvocation, toolCallStateToStreamingInvocation, finalizeToolInvocation as rawFinalizeToolInvocation, updateRunningToolSpecificData as rawUpdateRunningToolSpecificData, usageInfoToAutoModeResolution, usageInfoToQuotas, formatTurnResponseDetails, rewriteAgentHostLinkTarget, rewriteMarkdownLinks } from "../../../browser/agentSessions/agentHost/stateToProgressAdapter.js";
function createToolCallState(overrides) {
  return {
    toolCallId: "tc-1",
    toolName: "test_tool",
    displayName: "Test Tool",
    invocationMessage: "Running test tool...",
    status: ToolCallStatus.Running,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    ...overrides
  };
}
function createCompletedToolCall(overrides) {
  return {
    status: ToolCallStatus.Completed,
    toolCallId: "tc-1",
    toolName: "test_tool",
    displayName: "Test Tool",
    invocationMessage: "Running test tool...",
    success: true,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    pastTenseMessage: "Ran test tool",
    ...overrides
  };
}
function createTurn(overrides) {
  return {
    id: "turn-1",
    message: { text: "Hello", origin: { kind: MessageKind.User } },
    responseParts: [],
    usage: void 0,
    state: TurnState.Complete,
    ...overrides
  };
}
function getSerializedTerminalData(serialized) {
  const toolSpecificData = serialized.toolSpecificData;
  assert.strictEqual(toolSpecificData?.kind, "terminal");
  assert.ok(toolSpecificData && hasKey(toolSpecificData, { commandLine: true }));
  return toolSpecificData;
}
function message(text, kind = MessageKind.User) {
  return { text, origin: { kind } };
}
function toolCallStateToInvocation(tc, subAgentInvocationId, options) {
  return rawToolCallStateToInvocation(tc, subAgentInvocationId, URI.file("/"), "local", void 0, options);
}
function toolCallStateToPreparedInvocation(tc) {
  return rawToolCallStateToPreparedInvocation(tc, URI.file("/"), "local");
}
function finalizeToolInvocation(invocation, tc) {
  return rawFinalizeToolInvocation(invocation, tc, URI.file("/"), "local");
}
function turnsToHistory(backendSession, turns, participantId, lookup) {
  return rawTurnsToHistory(backendSession, turns, participantId, "local", lookup);
}
function makeLookup(prefix, displayNames, fallbackRawModelId) {
  const resolveRaw = (raw) => raw ?? fallbackRawModelId;
  return {
    toLanguageModelId: (raw) => {
      const r = resolveRaw(raw);
      return r ? `${prefix}${r}` : void 0;
    },
    toResponseDetails: (raw) => {
      const r = resolveRaw(raw);
      return r ? displayNames[r] : void 0;
    },
    toAutoModeResolution: (usage) => {
      const raw = readUsageInfoMeta(usage).autoModeResolved?.chosenModel;
      return usageInfoToAutoModeResolution(usage, raw ? displayNames[raw] : void 0);
    }
  };
}
function activeTurnToProgress(sessionResource, activeTurn, connectionAuthority, options) {
  return rawActiveTurnToProgress(sessionResource, activeTurn, connectionAuthority || "local", void 0, options);
}
function updateRunningToolSpecificData(existing, tc) {
  return rawUpdateRunningToolSpecificData(existing, tc, URI.file("/"), "local");
}
function assertInputOutputDetails(details) {
  assert.ok(isToolResultInputOutputDetails(details));
}
suite("stateToProgressAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("detects the canonical automatic reply answer", () => {
    assert.deepStrictEqual([
      containsAutomaticReplyAnswer({
        question: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: AgentHostAutoReplyAnswer }
        }
      }),
      containsAutomaticReplyAnswer({
        question: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "User answer" }
        }
      })
    ], [true, false]);
  });
  suite("rewriteAgentHostLinkTarget", () => {
    test("supports absolute paths and file URIs with validated locations", () => {
      const unwrap = (href) => fromAgentHostUri(URI.parse(rewriteAgentHostLinkTarget(href, "my-host"))).toString();
      assert.deepStrictEqual(
        [
          unwrap("C:\\remote\\windows.ts:42"),
          unwrap("\\\\server\\share\\unc.ts:42"),
          unwrap("FILE:///remote/upper.ts:42"),
          unwrap("/remote/zero.ts:0"),
          unwrap("/remote/zero-column.ts:42:0"),
          unwrap("/remote/numeric-segment.ts:42:name.ts"),
          unwrap("/remote/scientific.ts:1e2"),
          unwrap("/remote/encoded%3A42"),
          unwrap("/remote/encoded%3A42:10"),
          unwrap("file:///remote/encoded%3A42"),
          unwrap("file:///remote/encoded%3A42:10"),
          unwrap("file:///remote/queried.ts?rev=1:42"),
          unwrap("/remote/range.ts:42-48")
        ],
        [
          URI.file("C:/remote/windows.ts").with({ fragment: "L42" }).toString(),
          URI.file("//server/share/unc.ts").with({ fragment: "L42" }).toString(),
          URI.file("/remote/upper.ts").with({ fragment: "L42" }).toString(),
          URI.file("/remote/zero.ts:0").toString(),
          URI.file("/remote/zero-column.ts:42:0").toString(),
          URI.file("/remote/numeric-segment.ts:42:name.ts").toString(),
          URI.file("/remote/scientific.ts:1e2").toString(),
          URI.file("/remote/encoded:42").toString(),
          URI.file("/remote/encoded:42").with({ fragment: "L10" }).toString(),
          URI.file("/remote/encoded:42").toString(),
          URI.file("/remote/encoded:42").with({ fragment: "L10" }).toString(),
          URI.file("/remote/queried.ts").with({ query: "rev=1:42" }).toString(),
          URI.file("/remote/range.ts:42-48").toString()
        ]
      );
    });
    test("preserves client-handled link schemes", () => {
      assert.deepStrictEqual(
        [
          rewriteAgentHostLinkTarget("vscode-browser://example.com", "my-host"),
          rewriteAgentHostLinkTarget("copilot-skill:/plan", "my-host"),
          rewriteAgentHostLinkTarget("C:relative", "my-host"),
          rewriteAgentHostLinkTarget("git:foo", "my-host"),
          rewriteAgentHostLinkTarget("urn:isbn:123", "my-host")
        ],
        [
          "vscode-browser://example.com",
          "copilot-skill:/plan",
          "C:relative",
          "git:foo",
          "urn:isbn:123"
        ]
      );
    });
  });
  suite("turnsToHistory", () => {
    test("empty turns produces empty history", () => {
      const result = turnsToHistory(URI.file("/"), [], "p");
      assert.deepStrictEqual(result, []);
    });
    test("single turn produces request + response pair", () => {
      const turn = createTurn({
        message: message("Do something"),
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall() }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].type, "request");
      assert.strictEqual(history[0].prompt, "Do something");
      assert.strictEqual(history[0].participant, "participant-1");
      assert.strictEqual(history[1].type, "response");
      assert.strictEqual(history[1].participant, "participant-1");
      assert.strictEqual(history[1].parts.length, 1);
      const serialized = history[1].parts[0];
      assert.strictEqual(serialized.kind, "toolInvocationSerialized");
      assert.strictEqual(serialized.toolCallId, "tc-1");
      assert.strictEqual(serialized.toolId, "test_tool");
      assert.strictEqual(serialized.isComplete, true);
    });
    test("system-initiated turn preserves compact request label", () => {
      const turn = createTurn({
        message: message("`sleep 6` completed", MessageKind.SystemNotification)
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history[0].type, "request");
      if (history[0].type !== "request") {
        return;
      }
      assert.strictEqual(history[0].isSystemInitiated, true);
      assert.strictEqual(history[0].prompt, "`sleep 6` completed");
      assert.strictEqual(history[0].systemInitiatedLabel, void 0);
    });
    test("system notification response part restores as system notification", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.SystemNotification, content: "Shell command completed" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const progress = response.parts[0];
      assert.strictEqual(progress.kind, "systemNotification");
      if (progress.kind !== "systemNotification") {
        return;
      }
      assert.strictEqual(progress.content.value, "Shell command completed");
    });
    test("reasoning response part restores as thinking progress carrying its id", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.Reasoning, id: "r-1", content: "Let me think about this..." }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const thinking = response.parts[0];
      assert.strictEqual(thinking.kind, "thinking");
      assert.strictEqual(thinking.value, "Let me think about this...");
      assert.strictEqual(thinking.id, "r-1");
    });
    test("generic completed tool call in history includes input/output details", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"query":"terminal activation"}',
            content: [{ type: ToolResultContentType.Text, text: "Use shell integration." }]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.input, '{"query":"terminal activation"}');
      assert.strictEqual(details.inputLanguage, "json");
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "Use shell integration.", isText: true, mimeType: "text/plain" }]);
      assert.strictEqual(details.isError, false);
    });
    test("restores an answered ask-user interaction as a hidden tool plus conversational summary", () => {
      const turn = createTurn({
        responseParts: [
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({ toolName: "ask_user" })
          },
          {
            kind: ResponsePartKind.InputRequest,
            request: {
              id: "input-1",
              questions: [{
                id: "q1",
                kind: ChatInputQuestionKind.SingleSelect,
                message: "What should we work on?",
                required: true,
                options: [
                  { id: "fix", label: "Fix a bug" },
                  { id: "feature", label: "Implement a feature" }
                ]
              }],
              answers: {
                q1: {
                  state: ChatInputAnswerState.Submitted,
                  value: { kind: ChatInputAnswerValueKind.Selected, value: "fix" }
                }
              }
            },
            response: ChatInputResponseKind.Accept
          }
        ]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const parts = history[1].type === "response" ? history[1].parts : [];
      const tool = parts[0];
      const carousel = parts[1];
      assert.deepStrictEqual({
        toolPresentation: tool.presentation,
        carouselKind: carousel.kind,
        answerPresentation: carousel.kind === "questionCarousel" ? carousel.answerPresentation : void 0,
        answer: carousel.kind === "questionCarousel" ? carousel.data?.q1 : void 0
      }, {
        toolPresentation: ToolInvocationPresentation.HiddenAfterComplete,
        carouselKind: "questionCarousel",
        answerPresentation: "conversation",
        answer: { selectedValue: "fix", freeformValue: void 0 }
      });
    });
    test("generic failed tool call in history uses error text as output", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"url":"https://example.com"}',
            success: false,
            error: { message: "request timed out" }
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.isError, true);
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "request timed out", isText: true, mimeType: "text/plain" }]);
    });
    test("failed MCP App tool call in history remains confirmed", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolName: "GitHub-create_pull_request",
            toolInput: '{"owner":"microsoft","repo":"vscode"}',
            success: false,
            error: { message: "The pull request form is awaiting submission." },
            contributor: { kind: ToolCallContributorKind.MCP, customizationId: "github-customization" },
            _meta: {
              ui: {
                resourceUri: "ui://github-mcp-server/pr-write",
                channel: "mcp://copilot/session/GitHub"
              }
            }
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.deepStrictEqual({
        isConfirmed: serialized.isConfirmed,
        toolSpecificData: serialized.toolSpecificData
      }, {
        isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
        toolSpecificData: {
          kind: "input",
          rawInput: { owner: "microsoft", repo: "vscode" },
          mcpAppData: {
            kind: "agentHost",
            resourceUri: "ui://github-mcp-server/pr-write",
            serverId: "github-customization",
            channel: "mcp://copilot/session/GitHub"
          }
        }
      });
    });
    test("generic completed tool call maps embedded resources and resource refs", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"image":"diagram"}',
            content: [
              { type: ToolResultContentType.EmbeddedResource, data: "aW1hZ2U=", contentType: "image/png" },
              { type: ToolResultContentType.Resource, uri: "agenthost-content:///session/result.txt", contentType: "text/plain" }
            ]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.output.length, 2);
      assert.deepStrictEqual(details.output[0], { type: "embed", value: "aW1hZ2U=", mimeType: "image/png" });
      assert.strictEqual(details.output[1].type, "ref");
      assert.strictEqual(details.output[1].uri.scheme, "vscode-agent-host");
      assert.strictEqual(details.output[1].uri.authority, "local");
      assert.strictEqual(details.output[1].uri.path, "/session/result.txt");
      assert.strictEqual(details.output[1].mimeType, "text/plain");
    });
    test("per-turn model id and display name flow from usage.model", () => {
      const turn1 = createTurn({
        id: "turn-1",
        message: message("first"),
        usage: { model: "gpt-5" }
      });
      const turn2 = createTurn({
        id: "turn-2",
        message: message("second"),
        usage: { model: "opus-4.7" }
      });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5": "GPT-5", "opus-4.7": "Claude Opus 4.7" });
      const history = turnsToHistory(URI.file("/"), [turn1, turn2], "p", lookup);
      assert.deepStrictEqual(
        history.map((h) => h.type === "request" ? { type: h.type, modelId: h.modelId } : { type: h.type, details: h.details }),
        [
          { type: "request", modelId: "agent-host-copilot:gpt-5" },
          { type: "response", details: "GPT-5" },
          { type: "request", modelId: "agent-host-copilot:opus-4.7" },
          { type: "response", details: "Claude Opus 4.7" }
        ]
      );
    });
    test("restores Auto model routing with the shared chat UI part", () => {
      const turn = createTurn({
        usage: {
          model: "gpt-5.4-mini",
          _meta: {
            autoModeResolved: {
              chosenModel: "gpt-5.4-mini",
              predictedLabel: "no_reasoning",
              confidence: 0.98
            }
          }
        }
      });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5.4-mini": "GPT-5.4 mini" });
      const history = turnsToHistory(URI.file("/"), [turn], "p", lookup);
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(response.parts, [{
        kind: "autoModeResolution",
        resolvedModel: "gpt-5.4-mini",
        resolvedModelName: "GPT-5.4 mini",
        predictedLabel: "no_reasoning",
        confidence: 0.98
      }]);
    });
    test("falls back to session-level model when turn has no usage.model", () => {
      const turn = createTurn({ message: message("first") });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5": "GPT-5" }, "gpt-5");
      const history = turnsToHistory(URI.file("/"), [turn], "p", lookup);
      assert.deepStrictEqual(
        history.map((h) => h.type === "request" ? { type: h.type, modelId: h.modelId } : { type: h.type, details: h.details }),
        [
          { type: "request", modelId: "agent-host-copilot:gpt-5" },
          { type: "response", details: "GPT-5" }
        ]
      );
    });
    test("maps turn usage to chat usage progress for restored history", () => {
      const turn = createTurn({
        usage: { inputTokens: 1200, outputTokens: 300, model: "gpt-5" },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "md-1", content: "Done" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(
        response.parts.map((part) => part.kind === "usage" ? { kind: part.kind, promptTokens: part.promptTokens, completionTokens: part.completionTokens } : { kind: part.kind }),
        [
          { kind: "usage", promptTokens: 1200, completionTokens: 300 },
          { kind: "markdownContent" }
        ]
      );
    });
    test("request history includes restored model id", () => {
      const turn = createTurn({
        message: message("Use restored model"),
        startedAt: "2025-07-08T22:05:21.000Z",
        duration: 2500
      });
      const lookup = makeLookup("agent-host-copilot:", {}, "gpt-5");
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1", lookup);
      assert.deepStrictEqual(history[0], {
        id: turn.id,
        type: "request",
        prompt: "Use restored model",
        participant: "participant-1",
        modelId: "agent-host-copilot:gpt-5",
        timestamp: 1752012321e3,
        variableData: void 0
      });
      assert.deepStrictEqual(history[1].type === "response" ? {
        elapsedMs: history[1].elapsedMs,
        completedAt: history[1].completedAt
      } : void 0, {
        elapsedMs: 2500,
        completedAt: 1752012323500
      });
    });
    test("request history omits invalid restored timestamp", () => {
      const turn = createTurn({ startedAt: "invalid" });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history[0].type === "request" ? history[0].timestamp : void 0, void 0);
    });
    test("terminal tool call in history has correct terminal data", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: "echo hello",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t1", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "hello" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      assert.strictEqual(serialized.resultDetails, void 0);
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "echo hello");
      assert.strictEqual(termData.terminalCommandOutput.text, "hello");
      assert.strictEqual(termData.terminalCommandState.exitCode, 0);
    });
    test("terminal tool call in history carries autoApproveRuleResolvable only when stamped", () => {
      const turn = createTurn({
        responseParts: [
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({
              toolCallId: "tc-marked",
              toolInput: "my-custom-script",
              _meta: { toolKind: "terminal", autoApproveRuleResolvable: true },
              content: [{ type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///marked", title: "Terminal" }],
              success: true
            })
          },
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({
              toolCallId: "tc-unmarked",
              toolInput: "echo hello",
              content: [{ type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///unmarked", title: "Terminal" }],
              success: true
            })
          }
        ]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(
        response.parts.map((part) => getSerializedTerminalData(part).autoApproveRuleResolvable),
        [true, void 0],
        "flag is copied from tool call meta and absent otherwise"
      );
    });
    test("terminal tool call in history carries the LM intention", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            intention: "List files in the repo root",
            toolInput: "ls",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///intent", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "a\nb" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.intention, "List files in the repo root");
    });
    test("terminal tool call in history does not set pastTenseMessage (avoids duplicate render)", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "terminal" },
            toolInput: "echo hi",
            pastTenseMessage: "Ran echo hi",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///past", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "hi" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      assert.strictEqual(serialized.pastTenseMessage, void 0);
    });
    test("terminal tool call (by toolKind only) in history does not set pastTenseMessage", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "terminal" },
            toolInput: "echo hi",
            pastTenseMessage: "Ran echo hi",
            content: [
              { type: ToolResultContentType.Text, text: "hi" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      assert.strictEqual(serialized.pastTenseMessage, void 0);
    });
    test("subagent tool call in history has correct subagent data", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
            content: [
              { type: ToolResultContentType.Text, text: "Agent result" },
              { type: ToolResultContentType.Subagent, resource: "copilot://session/subagent/tc-1", title: "Explore", agentName: "explore", description: "Explores the codebase" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "subagent");
      assert.strictEqual(serialized.resultDetails, void 0);
      if (serialized.toolSpecificData.kind === "subagent") {
        assert.strictEqual(serialized.toolSpecificData.agentName, "explore");
        assert.strictEqual(serialized.toolSpecificData.description, "Find related files");
        assert.strictEqual(serialized.toolSpecificData.result, "Agent result");
        assert.strictEqual(serialized.toolSpecificData.chatResource, "copilot://session/subagent/tc-1");
      }
    });
    test("subagent tool without content falls back to toolKind meta", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolName: "task",
            displayName: "Task",
            _meta: { toolKind: "subagent" },
            content: [{ type: ToolResultContentType.Text, text: "Result text" }],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "subagent");
      assert.strictEqual(serialized.resultDetails, void 0);
      if (serialized.toolSpecificData.kind === "subagent") {
        assert.strictEqual(serialized.toolSpecificData.description, "Task");
        assert.strictEqual(serialized.toolSpecificData.result, "Result text");
      }
    });
    test("turn with responseText produces markdown content in history", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "md-1", content: "Hello world" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      assert.strictEqual(history.length, 2);
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.parts.length, 1);
      assert.strictEqual(response.parts[0].kind, "markdownContent");
      assert.strictEqual(response.parts[0].content.value, "Hello world");
    });
    test("markdown links in response content stay raw until rendering", () => {
      const content = "See [local](file:///a/b.ts), [external](https://example.com) and [rel](./foo.md).";
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.Markdown,
          id: "md-links",
          content
        }]
      });
      const history = rawTurnsToHistory(URI.file("/"), [turn], "p", "my-host");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const part = response.parts[0];
      assert.strictEqual(part.content.value, content);
    });
    test("markdown link syntax inside fenced code blocks is preserved verbatim", () => {
      const input = [
        "Use [real](file:///a.ts) directly.",
        "",
        "```md",
        "[fake](file:///b.ts)",
        "```",
        "",
        "And then [another](file:///c.ts)."
      ].join("\n");
      const value = rewriteMarkdownLinks(input, "my-host");
      assert.ok(value.includes("[](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)"));
      assert.ok(value.includes("[](vscode-agent-host://my-host/c.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)"));
      assert.ok(value.includes("[fake](file:///b.ts)"));
      assert.ok(!value.includes("[fake](vscode-agent-host"));
    });
    test("markdown link syntax inside inline code spans is preserved verbatim", () => {
      const input = "Real [one](file:///a.ts) and literal `[two](file:///b.ts)` here.";
      const value = rewriteMarkdownLinks(input, "my-host");
      assert.strictEqual(
        value,
        "Real [](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0) and literal `[two](file:///b.ts)` here."
      );
    });
    test("preserves label and tags vscodeLinkType=skill for SKILL.md links", () => {
      const value = rewriteMarkdownLinks("Loaded [plan](file:///abs/repo/skills/plan/SKILL.md) and [other](file:///abs/repo/foo.ts).", "my-host");
      assert.strictEqual(
        value,
        "Loaded [plan](vscode-agent-host://my-host/abs/repo/skills/plan/SKILL.md?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0%26vscodeLinkType%3Dskill) and [](vscode-agent-host://my-host/abs/repo/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)."
      );
    });
    test("preserves alt text for image tokens", () => {
      const value = rewriteMarkdownLinks("See ![diagram](file:///a/b.png).", "my-host");
      assert.strictEqual(value, "See ![diagram](vscode-agent-host://my-host/a/b.png?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0).");
    });
    test("error turn produces error details in history", () => {
      const turn = createTurn({
        state: TurnState.Error,
        error: { errorType: "test", message: "boom" }
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.errorDetails?.message, "Error: (test) boom");
      assert.ok(!response.parts.some((p) => p.kind === "markdownContent" && p.content.value.includes("boom")), "Error should not be duplicated as a markdown part");
    });
    test("forwarded quota error turn produces quota-exceeded error details", () => {
      const turn = createTurn({
        state: TurnState.Error,
        error: {
          errorType: "quota",
          message: "raw",
          _meta: { chatError: { fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded" } } } }
        }
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.errorDetails?.isQuotaExceeded, true);
    });
    test("failed tool in history has exitCode 1", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: "bad-command",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t2", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "error" }
            ],
            success: false
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState.exitCode, 1);
    });
    test("search tool in history keeps search rendering without generic details", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "search" },
            toolInput: '{"query":"activation"}',
            content: [{ type: ToolResultContentType.Text, text: "found results" }]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "search");
      assert.strictEqual(serialized.resultDetails, void 0);
    });
  });
  suite("toolCallStateToInvocation", () => {
    test("creates ChatToolInvocation for running tool", () => {
      const tc = createToolCallState({
        toolCallId: "tc-42",
        toolName: "my_tool",
        displayName: "My Tool",
        invocationMessage: "Doing stuff",
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolCallId, "tc-42");
      assert.strictEqual(invocation.toolId, "my_tool");
      assert.strictEqual(invocation.source, ToolDataSource.Internal);
    });
    test("renders ask-user tools as waiting progress that hides after completion", () => {
      const toolNames = ["ask_user", "AskUserQuestion", "request_user_input"];
      const live = toolNames.map((toolName) => {
        const invocation = toolCallStateToInvocation(createToolCallState({ toolName }));
        return {
          message: invocation.invocationMessage,
          presentation: invocation.presentation
        };
      });
      const restored = completedToolCallToSerialized(createCompletedToolCall({ toolName: "ask_user" }), void 0, URI.file("/"), "local");
      const failed = completedToolCallToSerialized(createCompletedToolCall({ toolName: "ask_user", success: false }), void 0, URI.file("/"), "local");
      assert.deepStrictEqual({ live, restoredPresentation: restored.presentation, failedPresentation: failed.presentation }, {
        live: toolNames.map(() => ({
          message: "Waiting for answer...",
          presentation: ToolInvocationPresentation.HiddenAfterComplete
        })),
        restoredPresentation: ToolInvocationPresentation.HiddenAfterComplete,
        failedPresentation: void 0
      });
    });
    test("marks Agent Host input requests for conversational answer rendering", () => {
      const carousel = createInputRequestCarousel({
        id: "input-1",
        questions: [{
          id: "q1",
          kind: ChatInputQuestionKind.SingleSelect,
          message: "Choose one",
          required: true,
          options: [{ id: "a", label: "Option A" }]
        }]
      }, "local");
      assert.strictEqual(carousel.answerPresentation, "conversation");
    });
    test("attaches automation result data to live and restored configureAutomation calls", () => {
      const content = [{
        type: ToolResultContentType.Text,
        text: JSON.stringify({
          status: "created",
          automation: { id: "automation-1", name: "Morning review" }
        })
      }];
      const completed = createCompletedToolCall({
        toolCallId: "automation-call",
        toolName: "configureAutomation",
        content
      });
      const restored = completedToolCallToSerialized(completed, void 0, URI.file("/"), "local");
      const live = toolCallStateToInvocation(createToolCallState({
        toolCallId: "automation-call",
        toolName: "configureAutomation"
      }));
      finalizeToolInvocation(live, completed);
      assert.deepStrictEqual({
        restored: restored.toolSpecificData,
        live: live.toolSpecificData
      }, {
        restored: {
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        },
        live: {
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        }
      });
    });
    test("represents another client tool without surfacing its confirmation", () => {
      const toolCall = {
        toolCallId: "tc-other-client",
        toolName: "run_task",
        displayName: "Run Task",
        invocationMessage: "Run task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?",
        status: ToolCallStatus.PendingConfirmation,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      let cancelledToolCallId;
      const invocation = toolCallStateToInvocation(toolCall, void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: (toolCall2) => cancelledToolCallId = toolCall2.toolCallId
      });
      invocation.otherClientToolCall?.cancel();
      assert.deepStrictEqual({
        message: invocation.invocationMessage,
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall,
        cancelledToolCallId
      }, {
        message: "Running Run Task on another client...",
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true,
        cancelledToolCallId: "tc-other-client"
      });
    });
    test("creates authentication-required invocation for an MCP tool call", () => {
      const invocation = rawToolCallStateToInvocation({
        ...createToolCallState(),
        status: ToolCallStatus.AuthRequired,
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        auth: {
          reason: McpAuthRequiredReason.InsufficientScope,
          oauthClient: {
            clientId: "configured-client-id",
            clientSecret: "configured-client-secret"
          },
          resource: {
            resource: "https://mcp.example.com",
            resource_name: "Example MCP",
            authorization_servers: ["https://auth.example.com"],
            scopes_supported: ["repo"]
          },
          requiredScopes: ["repo"]
        }
      }, void 0, URI.parse("agent-host-copilot://backend/session"), "remote", "frontend");
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.WaitingForAuthentication);
      if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
        assert.fail("Expected authentication-required state");
      }
      const { cancel, ...stateWithoutCancel } = state;
      assert.strictEqual(typeof cancel, "function");
      assert.deepStrictEqual(stateWithoutCancel, {
        type: IChatToolInvocation.StateKind.WaitingForAuthentication,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: void 0 },
        parameters: void 0,
        confirmationMessages: void 0,
        server: {
          id: "frontend/mcp-1",
          name: "Example MCP",
          resource: "https://mcp.example.com",
          oauthClient: {
            clientId: "configured-client-id",
            clientSecret: "configured-client-secret"
          },
          authorizationServers: ["https://auth.example.com"],
          supportedScopes: ["repo"],
          requiredScopes: ["repo"],
          reason: McpAuthRequiredReason.InsufficientScope
        }
      });
      invocation.setAuthenticationResolved();
      assert.strictEqual(invocation.state.get().type, IChatToolInvocation.StateKind.Executing);
    });
    test("sets terminal toolSpecificData when content has terminal block", () => {
      const tc = createToolCallState({
        toolInput: "ls -la",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t3", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "ls -la");
    });
    test("sets terminal toolSpecificData for built-in bash via _meta.toolKind (no Terminal content block)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        displayName: "Run Shell Command",
        toolInput: "ls -la\nwc -l",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "ls -la\nwc -l");
      assert.strictEqual(termData.language, "shellscript");
      assert.strictEqual(termData.terminalToolSessionId, void 0, "no AHP terminal session for built-in bash");
      assert.strictEqual(termData.terminalCommandUri, void 0, "no AHP terminal URI for built-in bash");
    });
    test("built-in bash terminal toolSpecificData picks up streaming text output (running)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "echo hi",
        _meta: { toolKind: "terminal" },
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Text, text: "hi\n" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
    test("does not render terminal pill for terminal toolKind without a command (falls back to invocationMessage)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        invocationMessage: "Running shell command",
        _meta: { toolKind: "terminal" },
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData, void 0, "no terminal pill without a command");
      assert.strictEqual(invocation.invocationMessage, "Running shell command");
    });
    test("sets subagent toolSpecificData from _meta for subagent toolKind", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Review code", subagentAgentName: "code-reviewer" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "subagent");
      if (invocation.toolSpecificData.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.description, "Review code");
        assert.strictEqual(invocation.toolSpecificData.agentName, "code-reviewer");
      }
    });
    test("sets MCP App toolSpecificData for running MCP tool calls", () => {
      const invocation = toolCallStateToInvocation(createToolCallState({
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: {
          ui: {
            resourceUri: "ui://docs/app",
            channel: "mcp://copilot/test-session-1/docs"
          }
        }
      }));
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "input",
        rawInput: { topic: "metadata" },
        mcpAppData: {
          kind: "agentHost",
          resourceUri: "ui://docs/app",
          serverId: "docs-customization",
          channel: "mcp://copilot/test-session-1/docs"
        }
      });
    });
    test("does not set MCP App toolSpecificData for a streaming MCP tool call", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        status: ToolCallStatus.Streaming,
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: {
          ui: {
            resourceUri: "ui://docs/app",
            channel: "mcp://copilot/test-session-1/docs"
          }
        }
      });
      assert.strictEqual(invocation.toolSpecificData, void 0);
    });
    test("synthesizes subagent chatResource from the tool call id when no discovery content block is present", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Map aux bar + editor part creation" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.chatResource, buildSubagentChatUri(URI.file("/").toString(), "tc-1"));
      }
    });
    test("prefers the host-stamped _meta.subagentChatUri over a discovery content block resource", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentChatUri: "ahp-chat://subagent/stamped/tc-1" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "ahp-chat://subagent/discovery/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.chatResource, "ahp-chat://subagent/stamped/tc-1");
      }
    });
    test("passes subAgentInvocationId to ChatToolInvocation", () => {
      const tc = createToolCallState({});
      const invocation = toolCallStateToInvocation(tc, "parent-tc-42");
      assert.strictEqual(invocation.subAgentInvocationId, "parent-tc-42");
    });
  });
  suite("addComment reference", () => {
    const commentRange = { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 5 };
    function addCommentInput(text) {
      return JSON.stringify({ resourceUri: "file:///workspace/a.ts", range: commentRange, text });
    }
    function markdown(message2) {
      assert.ok(message2 && typeof message2 !== "string", "expected a markdown reference");
      return message2;
    }
    test("renders tool name, truncated quoted preview and a reveal command link", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("This comment is quite long and should be truncated") });
      const message2 = markdown(toolCallStateToInvocation(tc).invocationMessage);
      assert.deepStrictEqual(
        {
          value: message2.value,
          supportThemeIcons: message2.supportThemeIcons,
          isTrusted: message2.isTrusted
        },
        {
          value: `[addComment "This comment is quite long and should be\u2026"](command:_agentFeedbackReview.revealAt?${encodeURIComponent(JSON.stringify(["file:///workspace/a.ts", commentRange]))})`,
          supportThemeIcons: true,
          isTrusted: { enabledCommands: ["_agentFeedbackReview.revealAt"] }
        }
      );
    });
    test("does not truncate a short comment", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("Short note") });
      const message2 = markdown(toolCallStateToInvocation(tc).invocationMessage);
      assert.ok(message2.value.includes('addComment "Short note"'), message2.value);
      assert.ok(!message2.value.includes("\u2026"), message2.value);
    });
    test("sets the same reference as the past-tense message on completion", () => {
      const running = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("Short note") });
      const invocation = toolCallStateToInvocation(running);
      const completed = createCompletedToolCall({ toolName: "addComment", toolInput: addCommentInput("Short note"), pastTenseMessage: "Added comment" });
      finalizeToolInvocation(invocation, completed);
      assert.strictEqual(markdown(invocation.pastTenseMessage).value, markdown(invocation.invocationMessage).value);
    });
    test("falls back to the server message when the input cannot be parsed", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: "not json" });
      assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, "Adding comment");
    });
    test("falls back to the server message when the range is not a valid 1-based range", () => {
      for (const range of [
        { startLineNumber: 0, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        { startLineNumber: 1, startColumn: 1.5, endLineNumber: 1, endColumn: 2 },
        { startLineNumber: -1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
      ]) {
        const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: JSON.stringify({ resourceUri: "file:///workspace/a.ts", range, text: "hi" }) });
        assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, "Adding comment", JSON.stringify(range));
      }
    });
  });
  suite("streaming tool invocations (#314858)", () => {
    test("toolCallStateToStreamingInvocation starts in the native Streaming state", () => {
      const tc = {
        toolCallId: "tc-stream",
        toolName: "bash",
        displayName: "Bash",
        status: ToolCallStatus.Streaming,
        partialInput: '{"command":"npm test","description":"Run',
        invocationMessage: "Running npm test"
      };
      const invocation = toolCallStateToStreamingInvocation(tc, void 0);
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.Streaming);
      if (state.type !== IChatToolInvocation.StateKind.Streaming) {
        return;
      }
      assert.deepStrictEqual({
        toolCallId: invocation.toolCallId,
        toolId: invocation.toolId,
        partialInput: state.partialInput.get(),
        streamingMessage: state.streamingMessage.get(),
        isComplete: IChatToolInvocation.isComplete(invocation)
      }, {
        toolCallId: "tc-stream",
        toolId: "bash",
        partialInput: { command: "npm test", description: "Run" },
        streamingMessage: "Running npm test",
        isComplete: false
      });
    });
    test("toolCallStateToStreamingInvocation preserves subagent metadata before ready", () => {
      const sessionResource = URI.parse("copilotcli:/session-1");
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-subagent",
        toolName: "task",
        displayName: "Delegate Task",
        status: ToolCallStatus.Streaming,
        _meta: {
          toolKind: "subagent",
          subagentDescription: "Review current branch",
          subagentAgentName: "code-review",
          subagentChatUri: buildSubagentChatUri(sessionResource.toString(), "tc-subagent")
        }
      }, void 0, sessionResource, "");
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "subagent",
        description: "Review current branch",
        agentName: "code-review",
        chatResource: buildSubagentChatUri(sessionResource.toString(), "tc-subagent")
      });
    });
    test("finalizeToolInvocation preserves cancellation from streaming", () => {
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-cancelled",
        toolName: "client_tool",
        displayName: "Client Tool",
        status: ToolCallStatus.Streaming
      }, void 0);
      finalizeToolInvocation(invocation, {
        toolCallId: "tc-cancelled",
        toolName: "client_tool",
        displayName: "Client Tool",
        status: ToolCallStatus.Cancelled,
        invocationMessage: "Running client tool",
        reason: ToolCallCancellationReason.Denied,
        reasonMessage: "Denied by the server"
      });
      assert.deepStrictEqual(invocation.state.get(), {
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Denied,
        reasonMessage: "Denied by the server",
        parameters: void 0,
        confirmationMessages: void 0
      });
    });
    test("transitionFromStreaming with a pending terminal prepared invocation yields a single terminal confirmation card", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-term", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      const pending = {
        toolCallId: "tc-term",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Running `rm -rf build`",
        toolInput: "rm -rf build",
        status: ToolCallStatus.PendingConfirmation,
        _meta: { toolKind: "terminal" },
        confirmationTitle: "Run command?"
      };
      const prepared = toolCallStateToPreparedInvocation(pending);
      assert.strictEqual(prepared.confirmationMessages?.title, "Run command?");
      assert.strictEqual(prepared.toolSpecificData?.kind, "terminal");
      streaming.transitionFromStreaming(prepared, void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
      assert.strictEqual(streaming.toolSpecificData?.kind, "terminal");
    });
    test("transitionFromStreaming with a non-confirmation prepared invocation goes straight to Executing", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-run", toolName: "read_file", displayName: "Read File", status: ToolCallStatus.Streaming }, void 0);
      const running = { toolCallId: "tc-run", toolName: "read_file", displayName: "Read File", invocationMessage: "Reading file", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded };
      const prepared = toolCallStateToPreparedInvocation(running);
      assert.strictEqual(prepared.confirmationMessages, void 0);
      streaming.transitionFromStreaming(prepared, void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.Executing);
    });
    test("requestConfirmation re-arms confirmation from Executing (Copilot Running \u2192 PendingConfirmation)", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-term", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      const running = { toolCallId: "tc-term", toolName: "bash", displayName: "Bash", invocationMessage: "Running command", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: "terminal" } };
      streaming.transitionFromStreaming(toolCallStateToPreparedInvocation(running), void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.Executing);
      const pending = { toolCallId: "tc-term", toolName: "bash", displayName: "Bash", invocationMessage: "Running `rm -rf build`", toolInput: "rm -rf build", status: ToolCallStatus.PendingConfirmation, _meta: { toolKind: "terminal" }, confirmationTitle: "Run command?" };
      streaming.requestConfirmation(toolCallStateToPreparedInvocation(pending));
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
      assert.strictEqual(streaming.toolSpecificData?.kind, "terminal");
    });
    test("requestConfirmation no-ops on a completed invocation", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-done", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      streaming.transitionFromStreaming(toolCallStateToPreparedInvocation({ toolCallId: "tc-done", toolName: "bash", displayName: "Bash", invocationMessage: "run", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded }), void 0, void 0);
      streaming.didExecuteTool(void 0);
      assert.strictEqual(IChatToolInvocation.isComplete(streaming), true);
      const pending = { toolCallId: "tc-done", toolName: "bash", displayName: "Bash", invocationMessage: "confirm", status: ToolCallStatus.PendingConfirmation, confirmationTitle: "Confirm?" };
      streaming.requestConfirmation(toolCallStateToPreparedInvocation(pending));
      assert.strictEqual(IChatToolInvocation.isComplete(streaming), true, "completed invocation is not re-armed");
    });
  });
  suite("finalizeToolInvocation", () => {
    test("rewrites markdown links in pastTenseMessage through the agent host scheme", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      rawFinalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "view_file",
        displayName: "View File",
        invocationMessage: "Reading file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: { markdown: "Read [foo.ts](file:///path/to/foo.ts)" }
      }, URI.file("/"), "ssh__macbook-air");
      assert.ok(invocation.pastTenseMessage);
      assert.strictEqual(typeof invocation.pastTenseMessage, "object");
      const value = invocation.pastTenseMessage.value;
      assert.strictEqual(value, "Read [](vscode-agent-host://ssh__macbook-air/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)");
    });
    test("finalizes pty terminal tool with compatibility output and exit code", () => {
      const tc = createToolCallState({
        toolInput: "echo hi",
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t4", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: "echo hi",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran echo hi",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t4", title: "Terminal" },
          { type: ToolResultContentType.Text, text: "output text" }
        ]
      });
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "output text");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("normalizes plain-text line endings for the detached terminal", () => {
      const tc = createToolCallState({
        toolInput: "grep -n foo",
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t5", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: "grep -n foo",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran grep -n foo",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t5", title: "Terminal" },
          { type: ToolResultContentType.Text, text: "line1\nline2\r\nline3\n" }
        ]
      });
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "line1\r\nline2\r\nline3\r\n");
    });
    test("finalizes generic tool with input/output details", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        toolInput: '{"path":"README.md"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: '{"path":"README.md"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Read README",
        content: [{ type: ToolResultContentType.Text, text: "# VS Code" }]
      });
      const details = IChatToolInvocation.resultDetails(invocation);
      assertInputOutputDetails(details);
      assert.strictEqual(details.input, '{"path":"README.md"}');
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "# VS Code", isText: true, mimeType: "text/plain" }]);
      assert.strictEqual(details.isError, false);
    });
    test("finalizes failed tool with error message", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        toolInput: '{"operation":"slow"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: '{"operation":"slow"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: false,
        pastTenseMessage: "Failed",
        error: { message: "timeout" }
      });
      const details = IChatToolInvocation.resultDetails(invocation);
      assertInputOutputDetails(details);
      assert.strictEqual(details.isError, true);
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "timeout", isText: true, mimeType: "text/plain" }]);
    });
    test("returns file edits from completed tool call with FileEdit content", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Edited file",
        toolInput: JSON.stringify({ path: "/home/user/file.ts" }),
        content: [{
          type: ToolResultContentType.FileEdit,
          before: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///session/snap/before" }
          },
          after: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///session/snap/after" }
          }
        }]
      });
      assert.strictEqual(fileEdits.length, 1);
      assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, "/"), "/home/user/file.ts");
      assert.strictEqual(fileEdits[0].beforeContentUri?.toString(), URI.parse("agenthost-content:///session/snap/before").toString());
      assert.strictEqual(fileEdits[0].afterContentUri?.toString(), URI.parse("agenthost-content:///session/snap/after").toString());
      assert.ok(fileEdits[0].undoStopId);
      assert.strictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("does not hide presentation when tool with file edits fails", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: false,
        pastTenseMessage: "Failed to edit",
        error: { message: "write error" },
        content: [{
          type: ToolResultContentType.FileEdit,
          after: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///snap/after" }
          }
        }]
      });
      assert.notStrictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
    });
    test("returns empty file edits for cancelled tool call", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Cancelled,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        reason: ToolCallCancellationReason.Denied,
        reasonMessage: "User cancelled"
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("finalized search tool keeps search rendering without generic details", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        _meta: { toolKind: "search" },
        toolInput: '{"query":"terminal"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "search",
        displayName: "Search",
        invocationMessage: "Searching...",
        _meta: { toolKind: "search" },
        toolInput: '{"query":"terminal"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Searched",
        content: [{ type: ToolResultContentType.Text, text: "result" }]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "search");
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("returns empty file edits when tool has no FileEdit content", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran test tool",
        content: [{ type: ToolResultContentType.Text, text: "output" }]
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("returns empty file edits when FileEdit has no before or after", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Edited",
        toolInput: JSON.stringify({ content: "no path field" }),
        content: [{
          type: ToolResultContentType.FileEdit
        }]
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("returns file edit for create (only after present)", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "create_file",
        displayName: "Create File",
        invocationMessage: "Creating file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Created file",
        content: [{
          type: ToolResultContentType.FileEdit,
          after: {
            uri: URI.file("/home/user/new-file.ts").toString(),
            content: { uri: "agenthost-content:///snap/after" }
          }
        }]
      });
      assert.strictEqual(fileEdits.length, 1);
      assert.strictEqual(fileEdits[0].kind, "create");
      assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, "/"), "/home/user/new-file.ts");
      assert.strictEqual(fileEdits[0].beforeContentUri, void 0);
      assert.ok(fileEdits[0].afterContentUri);
    });
    test("preserves subagent credits when finalizing", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.credits = 2.5;
        invocation.toolSpecificData.isActive = true;
      }
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "run_subagent",
        displayName: "Run Subagent",
        invocationMessage: "Running subagent...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran subagent",
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }, {
          type: ToolResultContentType.Text,
          text: "Subagent result"
        }]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.deepStrictEqual({
          credits: invocation.toolSpecificData.credits,
          isActive: invocation.toolSpecificData.isActive
        }, {
          credits: 2.5,
          isActive: true
        });
      }
    });
  });
  suite("activeTurnToProgress", () => {
    function createActiveTurnState(responseParts) {
      return {
        id: "turn-active",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: message("Do things"),
        responseParts: responseParts ?? [],
        usage: void 0
      };
    }
    test("empty active turn produces empty progress", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState(), void 0);
      assert.deepStrictEqual(result, []);
    });
    test("includes usage progress from active turn usage", () => {
      const activeTurn = createActiveTurnState();
      activeTurn.usage = { inputTokens: 1e3, outputTokens: 250 };
      const result = activeTurnToProgress(URI.file("/"), activeTurn, void 0);
      const usage = result[0];
      assert.deepStrictEqual(
        { kind: usage.kind, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
        { kind: "usage", promptTokens: 1e3, completionTokens: 250 }
      );
    });
    test("produces markdown content for streamed text", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Hello world" }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "markdownContent");
      assert.strictEqual(result[0].content.value, "Hello world");
    });
    test("produces system notification for system notification response part", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.SystemNotification, content: "Shell command completed" }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "systemNotification");
      if (result[0].kind !== "systemNotification") {
        return;
      }
      assert.strictEqual(result[0].content.value, "Shell command completed");
    });
    test("produces thinking progress for reasoning", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Let me think about this..." }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[0].id, "r-1");
    });
    test("reasoning comes before streamed text when ordered that way", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Hmm..." },
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Result text" }
      ]), void 0);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[1].kind, "markdownContent");
    });
    test("serializes completed tool calls", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: "tc-done",
            toolName: "test_tool",
            displayName: "Test Tool",
            invocationMessage: "Ran test",
            confirmed: ToolCallConfirmationReason.NotNeeded,
            success: true,
            pastTenseMessage: "Ran test tool"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "toolInvocationSerialized");
    });
    test("creates live invocations for running tool calls", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: createToolCallState({
            toolCallId: "tc-running",
            status: ToolCallStatus.Running
          })
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      const invocation = result[0];
      assert.strictEqual(invocation.toolCallId, "tc-running");
    });
    test("hydrates another client tool without a confirmation invocation", () => {
      const toolCall = {
        toolCallId: "tc-other-client",
        toolName: "run_task",
        displayName: "Run Task",
        invocationMessage: "Run task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?",
        status: ToolCallStatus.PendingConfirmation,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.ToolCall, toolCall }
      ]), void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: () => {
        }
      });
      const invocation = result[0];
      assert.deepStrictEqual({
        kind: invocation.kind,
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall
      }, {
        kind: "toolInvocation",
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true
      });
    });
    test("hydrates another client streaming tool with its cancel affordance", () => {
      const toolCall = {
        toolCallId: "tc-other-client-streaming",
        toolName: "run_task",
        displayName: "Run Task",
        status: ToolCallStatus.Streaming,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.ToolCall, toolCall }
      ]), void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: () => {
        }
      });
      const invocation = result[0];
      assert.deepStrictEqual({
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall
      }, {
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true
      });
    });
    test("creates confirmation invocations for pending tool confirmations", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            toolCallId: "tc-pending",
            toolName: "bash",
            displayName: "Bash",
            invocationMessage: "Run command",
            status: ToolCallStatus.PendingConfirmation,
            confirmationTitle: "Run command",
            riskAssessment: {
              kind: ToolCallRiskAssessmentKind.Judge,
              status: ToolCallRiskAssessmentStatus.Complete,
              reason: "The command removes a project file.",
              safety: 0.15
            },
            toolInput: "echo hello"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      const invocation = result[0];
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "input");
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "complete",
        explanation: "The command removes a project file.",
        safety: 0.15
      });
    });
    test("creates loading confirmation invocations while judgement is pending", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-judging",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Run command",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Run command",
        riskAssessment: {
          kind: ToolCallRiskAssessmentKind.Judge,
          status: ToolCallRiskAssessmentStatus.Loading
        },
        toolInput: "echo hello"
      });
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "loading"
      });
    });
    test("updates a rendered confirmation when asynchronous judgement completes", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-judging",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Run command",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Run command",
        riskAssessment: {
          kind: ToolCallRiskAssessmentKind.Judge,
          status: ToolCallRiskAssessmentStatus.Loading
        },
        toolInput: "echo hello"
      });
      invocation.updateConfirmationMessages({
        title: "Run command",
        message: "Run command",
        approvalReason: {
          status: "complete",
          explanation: "This command modifies protected files.",
          safety: 0.1
        }
      });
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "complete",
        explanation: "This command modifies protected files.",
        safety: 0.1
      });
    });
    test("preserves create metadata and proposed content for pending file confirmations", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-create",
        toolName: "write",
        displayName: "Write",
        invocationMessage: "Creating package.json",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Create file?",
        edits: {
          items: [{
            after: {
              uri: "file:///workspace/package.json",
              content: { uri: "pending-edit-content://session/tc-create/package.json" }
            }
          }]
        }
      });
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "modifiedFilesConfirmation",
        options: ["Allow"],
        modifiedFiles: [{
          uri: URI.file("/workspace/package.json"),
          editKind: "create",
          originalUri: void 0,
          modifiedContentUri: toAgentHostUri(URI.parse("pending-edit-content://session/tc-create/package.json"), "local"),
          originalContentUri: void 0,
          insertions: void 0,
          deletions: void 0,
          title: "package.json",
          description: "/workspace/package.json"
        }]
      });
    });
    test("includes all parts in correct order", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Thinking..." },
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Output so far" },
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: createToolCallState({
            toolCallId: "tc-1",
            status: ToolCallStatus.Running
          })
        },
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            toolCallId: "tc-2",
            toolName: "test_tool",
            displayName: "Test Tool",
            invocationMessage: "Confirm",
            status: ToolCallStatus.PendingConfirmation,
            confirmationTitle: "Confirm"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 4);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[1].kind, "markdownContent");
    });
  });
  suite("terminal content blocks", () => {
    test("completed tool call with terminal content block sets terminalCommandUri", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///abc123", title: "Terminal", isPty: false }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/abc123");
    });
    test("terminal content block skips bookkeeping text output", () => {
      const tc = createCompletedToolCall({
        _meta: {
          toolKind: "terminal"
        },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///abc123", title: "Terminal", isPty: false },
          { type: ToolResultContentType.Text, text: "text-output" }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = serialized.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("uses terminal completion exit code for completed SDK shell tool history", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "gti status",
        content: [
          { type: ToolResultContentType.Text, text: "command not found\n<shellId: 104 completed with exit code 127>" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 127, preview: "preview only\n", truncated: true } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
      assert.strictEqual(termData.terminalCommandOutput?.text, "preview only\r\n");
      assert.strictEqual(termData.terminalCommandOutput?.truncated, true);
      assert.ok(!termData.terminalCommandOutput?.text.includes("shellId"));
    });
    test("preserves an explicitly empty non-PTY retained completion snapshot", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "true",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 0, preview: "" } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.deepStrictEqual(termData.terminalCommandOutput, { text: "" });
    });
    test("does not store an explicitly empty PTY completion preview when isPty is omitted", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "true",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///pty-empty", title: "Run Shell Command", result: { exitCode: 0, preview: "" } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("does not use text content when a terminal block owns the output", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "ehco hi",
        content: [
          { type: ToolResultContentType.Text, text: "bash: line 1: ehco: command not found\n<shellId: 104 completed with exit code 127>" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 127 } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("reads legacy terminalComplete blocks from old persisted state", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          // Removed from the protocol in AHP 0.7.0; may linger in old persisted turns.
          { type: "terminalComplete", exitCode: 127, preview: "legacy preview\n" }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandOutput?.text, "legacy preview\r\n");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
    });
    test("keeps zero terminal completion exit code as success for completed SDK shell tool history", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 0 } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
    });
    test("does not fall back to tool success when terminal completion has no exit code", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: {} }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState, void 0);
    });
    test("uses failed tool state when an output-only terminal has no shell exit", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "eci hi",
        content: [
          { type: ToolResultContentType.Text, text: "/bin/bash: eci: command not found\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false }
        ],
        success: false
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.deepStrictEqual(termData.terminalCommandState, { exitCode: 1 });
    });
    test("running tool call with terminal content block sets terminalCommandUri", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///running-term", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/running-term");
    });
    test("finalize preserves terminal URI from content block", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "echo hello",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///final-term", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        _meta: { toolKind: "terminal" },
        toolInput: "echo hello",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran echo hello",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///final-term", title: "Terminal" }
        ]
      });
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/final-term");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
    });
    test("finalize uses terminal completion exit code over SDK tool success", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "false",
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "bash",
        displayName: "Run Shell Command",
        invocationMessage: "Running shell command",
        _meta: { toolKind: "terminal" },
        toolInput: "false",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran false",
        content: [
          { type: ToolResultContentType.Text, text: "" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 1 } }
        ]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState?.exitCode, 1);
    });
  });
  suite("updateRunningToolSpecificData", () => {
    test("sets subagent toolSpecificData from content and notifies state observers", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      let stateChanged = false;
      const disposable = autorun((r) => {
        invocation.state.read(r);
        stateChanged = true;
      });
      stateChanged = false;
      const before = invocation.toolSpecificData;
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(stateChanged, true, "state observers should be notified");
      assert.notStrictEqual(invocation.toolSpecificData, before, "toolSpecificData should be replaced");
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.agentName, "explore");
        assert.strictEqual(invocation.toolSpecificData.description, "Find related files");
      }
      disposable.dispose();
    });
    test("preserves subagent credits when refreshing toolSpecificData from content", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.credits = 1.5;
      }
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.credits, 1.5, "credits should survive a toolSpecificData refresh");
      }
    });
    test("preserves subagent model name when refreshing toolSpecificData from content", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.modelName = "Claude Sonnet 4";
      }
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.modelName, "Claude Sonnet 4", "model name should survive a toolSpecificData refresh");
      }
    });
    test("mounts MCP App toolSpecificData when a confirmed MCP tool starts running", () => {
      const meta = {
        ui: {
          resourceUri: "ui://docs/app",
          channel: "mcp://copilot/test-session-1/docs"
        }
      };
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        status: ToolCallStatus.PendingConfirmation,
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: meta
      });
      assert.deepStrictEqual(invocation.toolSpecificData, { kind: "input", rawInput: { topic: "metadata" } });
      let stateChanged = false;
      const disposable = autorun((r) => {
        invocation.state.read(r);
        stateChanged = true;
      });
      stateChanged = false;
      updateRunningToolSpecificData(invocation, createToolCallState({
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: meta
      }));
      assert.strictEqual(stateChanged, true, "state observers should be notified");
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "input",
        rawInput: { topic: "metadata" },
        mcpAppData: {
          kind: "agentHost",
          resourceUri: "ui://docs/app",
          serverId: "docs-customization",
          channel: "mcp://copilot/test-session-1/docs"
        }
      });
      disposable.dispose();
    });
    test("does not notify when no subagent content is present", () => {
      const tc = createToolCallState({});
      const invocation = toolCallStateToInvocation(tc);
      const originalData = invocation.toolSpecificData;
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData, originalData, "toolSpecificData should not change");
    });
    test("refreshes terminal output as text content streams (built-in bash)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "sleep 1; echo hi",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      assert.strictEqual(invocation.toolSpecificData.terminalCommandOutput, void 0);
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        content: [{ type: ToolResultContentType.Text, text: "hi\n" }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.kind, "terminal");
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
    test("preserves AHP terminal fields (terminalToolSessionId, terminalCommandUri) when refreshing output", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "echo hi",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      const reviveUri = URI.parse("agenthost-terminal:///t9");
      invocation.toolSpecificData = {
        kind: "terminal",
        commandLine: { original: "echo hi" },
        language: "shellscript",
        terminalToolSessionId: "session-id-from-revive",
        terminalCommandUri: reviveUri,
        terminalCommandId: "cmd-id-from-revive"
      };
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        content: [{ type: ToolResultContentType.Text, text: "hi\n" }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalToolSessionId, "session-id-from-revive");
      assert.strictEqual(termData.terminalCommandUri, reviveUri);
      assert.strictEqual(termData.terminalCommandId, "cmd-id-from-revive");
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
  });
  suite("usageInfoToQuotas", () => {
    test("returns undefined when no quota snapshots present", () => {
      assert.strictEqual(usageInfoToQuotas(void 0), void 0);
      assert.strictEqual(usageInfoToQuotas({ inputTokens: 10 }), void 0);
      assert.strictEqual(usageInfoToQuotas({ _meta: { cost: 1 } }), void 0);
    });
    test("maps premium and chat snapshots, deriving additional usage and reset date", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            premium_interactions: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 300,
              usedRequests: 75,
              remainingPercentage: 75,
              overage: 1.5,
              overageAllowedWithExhaustedQuota: true,
              resetDate: "2026-07-01T00:00:00.000Z"
            },
            chat: {
              isUnlimitedEntitlement: true,
              entitlementRequests: -1,
              usedRequests: 10,
              remainingPercentage: 100
            }
          }
        }
      });
      assert.deepStrictEqual(result, {
        premiumChat: {
          percentRemaining: 75,
          unlimited: false,
          entitlement: 300,
          quotaRemaining: 225,
          resetAt: Date.parse("2026-07-01T00:00:00.000Z")
        },
        chat: {
          percentRemaining: 100,
          unlimited: true,
          entitlement: void 0,
          quotaRemaining: void 0,
          resetAt: void 0
        },
        additionalUsageEnabled: true,
        additionalUsageCount: 1.5,
        resetDate: "2026-07-01T00:00:00.000Z"
      });
    });
    test("skips categories with no allocated entitlement", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            premium_interactions: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 0,
              usedRequests: 0,
              remainingPercentage: 0,
              overage: 0,
              overageAllowedWithExhaustedQuota: false
            }
          }
        }
      });
      assert.deepStrictEqual(result, {
        additionalUsageEnabled: false,
        additionalUsageCount: 0
      });
    });
    test("skips a category whose remainingPercentage is missing", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            chat: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 100,
              usedRequests: 10
              // remainingPercentage intentionally absent — must not masquerade as exhausted (0%).
            }
          }
        }
      });
      assert.strictEqual(result, void 0);
    });
  });
  suite("formatTurnResponseDetails", () => {
    const auto = { name: "Auto" };
    test("appends the billed model id when one is supplied", () => {
      const result = {
        resolvedModel: formatTurnResponseDetails(auto, "raptor-mini", void 0),
        withPricing: formatTurnResponseDetails({ ...auto, pricing: "0x" }, "raptor-mini", void 0),
        withCredits: formatTurnResponseDetails(auto, "raptor-mini", { _meta: { cost: 2 } }),
        oneCredit: formatTurnResponseDetails(auto, "raptor-mini", { _meta: { cost: 1 } }),
        noBilledModel: formatTurnResponseDetails(auto, void 0, void 0)
      };
      assert.deepStrictEqual(result, {
        resolvedModel: "Auto (raptor-mini)",
        withPricing: "Auto (raptor-mini) \xB7 0x",
        withCredits: "Auto (raptor-mini) \u2022 2 credits",
        oneCredit: "Auto (raptor-mini) \u2022 1 credit",
        noBilledModel: "Auto"
      });
    });
    test("uses the registered model name as-is without a billed id, undefined when unknown", () => {
      const sonnet = { name: "Claude Sonnet 4.5", pricing: "1x" };
      const result = {
        concrete: formatTurnResponseDetails(sonnet, void 0, void 0),
        concreteWithCredits: formatTurnResponseDetails(sonnet, void 0, { _meta: { cost: 2 } }),
        unknown: formatTurnResponseDetails(void 0, "raptor-mini", { _meta: { cost: 2 } })
      };
      assert.deepStrictEqual(result, {
        concrete: "Claude Sonnet 4.5 \xB7 1x",
        concreteWithCredits: "Claude Sonnet 4.5 \u2022 2 credits",
        unknown: void 0
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvc3RhdGVUb1Byb2dyZXNzQWRhcHRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBNY3BBdXRoUmVxdWlyZWRSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGZyb21BZ2VudEhvc3RVcmksIHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmksIENoYXRJbnB1dEFuc3dlclN0YXRlLCBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsIENoYXRJbnB1dFF1ZXN0aW9uS2luZCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBNZXNzYWdlS2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLCBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLCBUb29sQ2FsbFN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCBSZXNwb25zZVBhcnRLaW5kLCByZWFkVXNhZ2VJbmZvTWV0YSwgdHlwZSBBY3RpdmVUdXJuLCB0eXBlIElDb21wbGV0ZWRUb29sQ2FsbCwgdHlwZSBUb29sQ2FsbFBlbmRpbmdDb25maXJtYXRpb25TdGF0ZSwgdHlwZSBUb29sQ2FsbFJ1bm5pbmdTdGF0ZSwgdHlwZSBUdXJuLCB0eXBlIFRvb2xDYWxsUmVzcG9uc2VQYXJ0LCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgdHlwZSBNZXNzYWdlLCB0eXBlIFRvb2xSZXN1bHRDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIFRvb2xDb25maXJtS2luZCwgdHlwZSBJQ2hhdE1hcmtkb3duQ29udGVudCwgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCB0eXBlIElDaGF0VGhpbmtpbmdQYXJ0LCB0eXBlIElDaGF0VXNhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCB0eXBlIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBUb29sRGF0YVNvdXJjZSwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0dXJuc1RvSGlzdG9yeSBhcyByYXdUdXJuc1RvSGlzdG9yeSwgYWN0aXZlVHVyblRvUHJvZ3Jlc3MgYXMgcmF3QWN0aXZlVHVyblRvUHJvZ3Jlc3MsIGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkLCBjb250YWluc0F1dG9tYXRpY1JlcGx5QW5zd2VyLCBjcmVhdGVJbnB1dFJlcXVlc3RDYXJvdXNlbCwgdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbiBhcyByYXdUb29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uLCB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24gYXMgcmF3VG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uLCB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uLCBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uIGFzIHJhd0ZpbmFsaXplVG9vbEludm9jYXRpb24sIHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhIGFzIHJhd1VwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhLCB1c2FnZUluZm9Ub0F1dG9Nb2RlUmVzb2x1dGlvbiwgdXNhZ2VJbmZvVG9RdW90YXMsIGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMsIHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0LCByZXdyaXRlTWFya2Rvd25MaW5rcywgdHlwZSBUdXJuTW9kZWxMb29rdXAgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L3N0YXRlVG9Qcm9ncmVzc0FkYXB0ZXIuanMnO1xuXG4vLyAtLS0tIEhlbHBlciBmYWN0b3JpZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVUb29sQ2FsbFN0YXRlKG92ZXJyaWRlcz86IFBhcnRpYWw8VG9vbENhbGxSdW5uaW5nU3RhdGU+KTogVG9vbENhbGxSdW5uaW5nU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKG92ZXJyaWRlcz86IFBhcnRpYWw8SUNvbXBsZXRlZFRvb2xDYWxsPik6IElDb21wbGV0ZWRUb29sQ2FsbCB7XG5cdHJldHVybiB7XG5cdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIHRlc3QgdG9vbCcsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9IGFzIElDb21wbGV0ZWRUb29sQ2FsbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVHVybihvdmVycmlkZXM/OiBQYXJ0aWFsPFR1cm4+KTogVHVybiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZDogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHtcblx0Y29uc3QgdG9vbFNwZWNpZmljRGF0YSA9IHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRhc3NlcnQub2sodG9vbFNwZWNpZmljRGF0YSAmJiBoYXNLZXkodG9vbFNwZWNpZmljRGF0YSwgeyBjb21tYW5kTGluZTogdHJ1ZSB9KSk7XG5cdHJldHVybiB0b29sU3BlY2lmaWNEYXRhO1xufVxuXG5mdW5jdGlvbiBtZXNzYWdlKHRleHQ6IHN0cmluZywga2luZCA9IE1lc3NhZ2VLaW5kLlVzZXIpOiBNZXNzYWdlIHtcblx0cmV0dXJuIHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQgfSB9O1xufVxuXG5mdW5jdGlvbiB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdUb29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uPlswXSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmcsIG9wdGlvbnM/OiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdUb29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uPls1XSkge1xuXHRyZXR1cm4gcmF3VG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yywgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIFVSSS5maWxlKCcvJyksICdsb2NhbCcsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbih0YzogUGFyYW1ldGVyczx0eXBlb2YgcmF3VG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uPlswXSkge1xuXHRyZXR1cm4gcmF3VG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uKHRjLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnKTtcbn1cblxuZnVuY3Rpb24gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdGaW5hbGl6ZVRvb2xJbnZvY2F0aW9uPlswXSwgdGM6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd0ZpbmFsaXplVG9vbEludm9jYXRpb24+WzFdKSB7XG5cdHJldHVybiByYXdGaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHRjLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnKTtcbn1cblxuZnVuY3Rpb24gdHVybnNUb0hpc3RvcnkoYmFja2VuZFNlc3Npb246IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1R1cm5zVG9IaXN0b3J5PlswXSwgdHVybnM6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1R1cm5zVG9IaXN0b3J5PlsxXSwgcGFydGljaXBhbnRJZDogUGFyYW1ldGVyczx0eXBlb2YgcmF3VHVybnNUb0hpc3Rvcnk+WzJdLCBsb29rdXA/OiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdUdXJuc1RvSGlzdG9yeT5bNF0pIHtcblx0cmV0dXJuIHJhd1R1cm5zVG9IaXN0b3J5KGJhY2tlbmRTZXNzaW9uLCB0dXJucywgcGFydGljaXBhbnRJZCwgJ2xvY2FsJywgbG9va3VwKTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBmYWtlIHtAbGluayBUdXJuTW9kZWxMb29rdXB9IHRoYXQgbmFtZXNwYWNlcyBpZHMgd2l0aCBhIGZpeGVkXG4gKiBwcmVmaXggYW5kIHJldHVybnMgZGlzcGxheSBuYW1lcyBmcm9tIGEgc3RhdGljIG1hcC4gYGZhbGxiYWNrUmF3TW9kZWxJZGBcbiAqIG1pcnJvcnMgdGhlIHJlYWwgaGFuZGxlcidzIFwidXNlIHN1bW1hcnkubW9kZWwgd2hlbiB1c2FnZSBoYXNuJ3QgcmVwb3J0ZWRcbiAqIHlldFwiIGJlaGF2aW9yLlxuICovXG5mdW5jdGlvbiBtYWtlTG9va3VwKHByZWZpeDogc3RyaW5nLCBkaXNwbGF5TmFtZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIGZhbGxiYWNrUmF3TW9kZWxJZD86IHN0cmluZyk6IFR1cm5Nb2RlbExvb2t1cCB7XG5cdGNvbnN0IHJlc29sdmVSYXcgPSAocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4gcmF3ID8/IGZhbGxiYWNrUmF3TW9kZWxJZDtcblx0cmV0dXJuIHtcblx0XHR0b0xhbmd1YWdlTW9kZWxJZDogKHJhdykgPT4ge1xuXHRcdFx0Y29uc3QgciA9IHJlc29sdmVSYXcocmF3KTtcblx0XHRcdHJldHVybiByID8gYCR7cHJlZml4fSR7cn1gIDogdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0dG9SZXNwb25zZURldGFpbHM6IChyYXcpID0+IHtcblx0XHRcdGNvbnN0IHIgPSByZXNvbHZlUmF3KHJhdyk7XG5cdFx0XHRyZXR1cm4gciA/IGRpc3BsYXlOYW1lc1tyXSA6IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdHRvQXV0b01vZGVSZXNvbHV0aW9uOiB1c2FnZSA9PiB7XG5cdFx0XHRjb25zdCByYXcgPSByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZSkuYXV0b01vZGVSZXNvbHZlZD8uY2hvc2VuTW9kZWw7XG5cdFx0XHRyZXR1cm4gdXNhZ2VJbmZvVG9BdXRvTW9kZVJlc29sdXRpb24odXNhZ2UsIHJhdyA/IGRpc3BsYXlOYW1lc1tyYXddIDogdW5kZWZpbmVkKTtcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2U6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd0FjdGl2ZVR1cm5Ub1Byb2dyZXNzPlswXSwgYWN0aXZlVHVybjogUGFyYW1ldGVyczx0eXBlb2YgcmF3QWN0aXZlVHVyblRvUHJvZ3Jlc3M+WzFdLCBjb25uZWN0aW9uQXV0aG9yaXR5PzogUGFyYW1ldGVyczx0eXBlb2YgcmF3QWN0aXZlVHVyblRvUHJvZ3Jlc3M+WzJdLCBvcHRpb25zPzogUGFyYW1ldGVyczx0eXBlb2YgcmF3QWN0aXZlVHVyblRvUHJvZ3Jlc3M+WzRdKSB7XG5cdHJldHVybiByYXdBY3RpdmVUdXJuVG9Qcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2UsIGFjdGl2ZVR1cm4sIGNvbm5lY3Rpb25BdXRob3JpdHkgfHwgJ2xvY2FsJywgdW5kZWZpbmVkLCBvcHRpb25zKTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEoZXhpc3Rpbmc6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1VwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhPlswXSwgdGM6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1VwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhPlsxXSkge1xuXHRyZXR1cm4gcmF3VXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEoZXhpc3RpbmcsIHRjLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHM6IHVua25vd24pOiBhc3NlcnRzIGRldGFpbHMgaXMgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMge1xuXHRhc3NlcnQub2soaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpKTtcbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ3N0YXRlVG9Qcm9ncmVzc0FkYXB0ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZGV0ZWN0cyB0aGUgY2Fub25pY2FsIGF1dG9tYXRpYyByZXBseSBhbnN3ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRjb250YWluc0F1dG9tYXRpY1JlcGx5QW5zd2VyKHtcblx0XHRcdFx0cXVlc3Rpb246IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRcdGNvbnRhaW5zQXV0b21hdGljUmVwbHlBbnN3ZXIoe1xuXHRcdFx0XHRxdWVzdGlvbjoge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnVXNlciBhbnN3ZXInIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSxcblx0XHRdLCBbdHJ1ZSwgZmFsc2VdKTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N1cHBvcnRzIGFic29sdXRlIHBhdGhzIGFuZCBmaWxlIFVSSXMgd2l0aCB2YWxpZGF0ZWQgbG9jYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdW53cmFwID0gKGhyZWY6IHN0cmluZykgPT4gZnJvbUFnZW50SG9zdFVyaShVUkkucGFyc2UocmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoaHJlZiwgJ215LWhvc3QnKSkpLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dW53cmFwKCdDOlxcXFxyZW1vdGVcXFxcd2luZG93cy50czo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcdW5jLnRzOjQyJyksXG5cdFx0XHRcdFx0dW53cmFwKCdGSUxFOi8vL3JlbW90ZS91cHBlci50czo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS96ZXJvLnRzOjAnKSxcblx0XHRcdFx0XHR1bndyYXAoJy9yZW1vdGUvemVyby1jb2x1bW4udHM6NDI6MCcpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9udW1lcmljLXNlZ21lbnQudHM6NDI6bmFtZS50cycpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9zY2llbnRpZmljLnRzOjFlMicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9lbmNvZGVkJTNBNDInKSxcblx0XHRcdFx0XHR1bndyYXAoJy9yZW1vdGUvZW5jb2RlZCUzQTQyOjEwJyksXG5cdFx0XHRcdFx0dW53cmFwKCdmaWxlOi8vL3JlbW90ZS9lbmNvZGVkJTNBNDInKSxcblx0XHRcdFx0XHR1bndyYXAoJ2ZpbGU6Ly8vcmVtb3RlL2VuY29kZWQlM0E0MjoxMCcpLFxuXHRcdFx0XHRcdHVud3JhcCgnZmlsZTovLy9yZW1vdGUvcXVlcmllZC50cz9yZXY9MTo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9yYW5nZS50czo0Mi00OCcpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6L3JlbW90ZS93aW5kb3dzLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvL3NlcnZlci9zaGFyZS91bmMudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvdXBwZXIudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvemVyby50czowJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS96ZXJvLWNvbHVtbi50czo0MjowJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS9udW1lcmljLXNlZ21lbnQudHM6NDI6bmFtZS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvc2NpZW50aWZpYy50czoxZTInKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvcmVtb3RlL2VuY29kZWQ6NDInKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvcmVtb3RlL2VuY29kZWQ6NDInKS53aXRoKHsgZnJhZ21lbnQ6ICdMMTAnIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvZW5jb2RlZDo0MicpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvZW5jb2RlZDo0MicpLndpdGgoeyBmcmFnbWVudDogJ0wxMCcgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS9xdWVyaWVkLnRzJykud2l0aCh7IHF1ZXJ5OiAncmV2PTE6NDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvcmFuZ2UudHM6NDItNDgnKS50b1N0cmluZygpLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBjbGllbnQtaGFuZGxlZCBsaW5rIHNjaGVtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0cmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoJ3ZzY29kZS1icm93c2VyOi8vZXhhbXBsZS5jb20nLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRcdHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KCdjb3BpbG90LXNraWxsOi9wbGFuJywgJ215LWhvc3QnKSxcblx0XHRcdFx0XHRyZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldCgnQzpyZWxhdGl2ZScsICdteS1ob3N0JyksXG5cdFx0XHRcdFx0cmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoJ2dpdDpmb28nLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRcdHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KCd1cm46aXNibjoxMjMnLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J3ZzY29kZS1icm93c2VyOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdCdjb3BpbG90LXNraWxsOi9wbGFuJyxcblx0XHRcdFx0XHQnQzpyZWxhdGl2ZScsXG5cdFx0XHRcdFx0J2dpdDpmb28nLFxuXHRcdFx0XHRcdCd1cm46aXNibjoxMjMnLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3R1cm5zVG9IaXN0b3J5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZW1wdHkgdHVybnMgcHJvZHVjZXMgZW1wdHkgaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFtdLCAncCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZSB0dXJuIHByb2R1Y2VzIHJlcXVlc3QgKyByZXNwb25zZSBwYWlyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlKCdEbyBzb21ldGhpbmcnKSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKCkgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5Lmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFJlcXVlc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5wcm9tcHQsICdEbyBzb21ldGhpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnBhcnRpY2lwYW50LCAncGFydGljaXBhbnQtMScpO1xuXG5cdFx0XHQvLyBSZXNwb25zZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlbMV0udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVsxXS5wYXJ0aWNpcGFudCwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzFdLnBhcnRzLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBoaXN0b3J5WzFdLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQua2luZCwgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbENhbGxJZCwgJ3RjLTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xJZCwgJ3Rlc3RfdG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQuaXNDb21wbGV0ZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeXN0ZW0taW5pdGlhdGVkIHR1cm4gcHJlc2VydmVzIGNvbXBhY3QgcmVxdWVzdCBsYWJlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSgnYHNsZWVwIDZgIGNvbXBsZXRlZCcsIE1lc3NhZ2VLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0XHRpZiAoaGlzdG9yeVswXS50eXBlICE9PSAncmVxdWVzdCcpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5pc1N5c3RlbUluaXRpYXRlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5wcm9tcHQsICdgc2xlZXAgNmAgY29tcGxldGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5c3RlbSBub3RpZmljYXRpb24gcmVzcG9uc2UgcGFydCByZXN0b3JlcyBhcyBzeXN0ZW0gbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiwgY29udGVudDogJ1NoZWxsIGNvbW1hbmQgY29tcGxldGVkJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncGFydGljaXBhbnQtMScpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBwcm9ncmVzcyA9IHJlc3BvbnNlLnBhcnRzWzBdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb2dyZXNzLmtpbmQsICdzeXN0ZW1Ob3RpZmljYXRpb24nKTtcblx0XHRcdGlmIChwcm9ncmVzcy5raW5kICE9PSAnc3lzdGVtTm90aWZpY2F0aW9uJykgeyByZXR1cm47IH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9ncmVzcy5jb250ZW50LnZhbHVlLCAnU2hlbGwgY29tbWFuZCBjb21wbGV0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYXNvbmluZyByZXNwb25zZSBwYXJ0IHJlc3RvcmVzIGFzIHRoaW5raW5nIHByb2dyZXNzIGNhcnJ5aW5nIGl0cyBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAnci0xJywgY29udGVudDogJ0xldCBtZSB0aGluayBhYm91dCB0aGlzLi4uJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncGFydGljaXBhbnQtMScpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCB0aGlua2luZyA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VGhpbmtpbmdQYXJ0O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5raW5nLmtpbmQsICd0aGlua2luZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5raW5nLnZhbHVlLCAnTGV0IG1lIHRoaW5rIGFib3V0IHRoaXMuLi4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlua2luZy5pZCwgJ3ItMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJpYyBjb21wbGV0ZWQgdG9vbCBjYWxsIGluIGhpc3RvcnkgaW5jbHVkZXMgaW5wdXQvb3V0cHV0IGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJ0ZXJtaW5hbCBhY3RpdmF0aW9uXCJ9Jyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnVXNlIHNoZWxsIGludGVncmF0aW9uLicgfV0sXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscztcblxuXHRcdFx0YXNzZXJ0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMuaW5wdXQsICd7XCJxdWVyeVwiOlwidGVybWluYWwgYWN0aXZhdGlvblwifScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMuaW5wdXRMYW5ndWFnZSwgJ2pzb24nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXQsIFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnVXNlIHNoZWxsIGludGVncmF0aW9uLicsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5pc0Vycm9yLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBhbiBhbnN3ZXJlZCBhc2stdXNlciBpbnRlcmFjdGlvbiBhcyBhIGhpZGRlbiB0b29sIHBsdXMgY29udmVyc2F0aW9uYWwgc3VtbWFyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoeyB0b29sTmFtZTogJ2Fza191c2VyJyB9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0LFxuXHRcdFx0XHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0XHRpZDogJ2lucHV0LTEnLFxuXHRcdFx0XHRcdFx0XHRxdWVzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdxMScsXG5cdFx0XHRcdFx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnV2hhdCBzaG91bGQgd2Ugd29yayBvbj8nLFxuXHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgaWQ6ICdmaXgnLCBsYWJlbDogJ0ZpeCBhIGJ1ZycgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgaWQ6ICdmZWF0dXJlJywgbGFiZWw6ICdJbXBsZW1lbnQgYSBmZWF0dXJlJyB9LFxuXHRcdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cTE6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAnZml4JyB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHBhcnRzID0gaGlzdG9yeVsxXS50eXBlID09PSAncmVzcG9uc2UnID8gaGlzdG9yeVsxXS5wYXJ0cyA6IFtdO1xuXHRcdFx0Y29uc3QgdG9vbCA9IHBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWwgPSBwYXJ0c1sxXTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRvb2xQcmVzZW50YXRpb246IHRvb2wucHJlc2VudGF0aW9uLFxuXHRcdFx0XHRjYXJvdXNlbEtpbmQ6IGNhcm91c2VsLmtpbmQsXG5cdFx0XHRcdGFuc3dlclByZXNlbnRhdGlvbjogY2Fyb3VzZWwua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnID8gY2Fyb3VzZWwuYW5zd2VyUHJlc2VudGF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRhbnN3ZXI6IGNhcm91c2VsLmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyA/IGNhcm91c2VsLmRhdGE/LnExIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0b29sUHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlLFxuXHRcdFx0XHRjYXJvdXNlbEtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdFx0YW5zd2VyUHJlc2VudGF0aW9uOiAnY29udmVyc2F0aW9uJyxcblx0XHRcdFx0YW5zd2VyOiB7IHNlbGVjdGVkVmFsdWU6ICdmaXgnLCBmcmVlZm9ybVZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuZXJpYyBmYWlsZWQgdG9vbCBjYWxsIGluIGhpc3RvcnkgdXNlcyBlcnJvciB0ZXh0IGFzIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1widXJsXCI6XCJodHRwczovL2V4YW1wbGUuY29tXCJ9Jyxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ3JlcXVlc3QgdGltZWQgb3V0JyB9LFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBzZXJpYWxpemVkLnJlc3VsdERldGFpbHM7XG5cblx0XHRcdGFzc2VydElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlzRXJyb3IsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dCwgW3sgdHlwZTogJ2VtYmVkJywgdmFsdWU6ICdyZXF1ZXN0IHRpbWVkIG91dCcsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWlsZWQgTUNQIEFwcCB0b29sIGNhbGwgaW4gaGlzdG9yeSByZW1haW5zIGNvbmZpcm1lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdHaXRIdWItY3JlYXRlX3B1bGxfcmVxdWVzdCcsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJvd25lclwiOlwibWljcm9zb2Z0XCIsXCJyZXBvXCI6XCJ2c2NvZGVcIn0nLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnVGhlIHB1bGwgcmVxdWVzdCBmb3JtIGlzIGF3YWl0aW5nIHN1Ym1pc3Npb24uJyB9LFxuXHRcdFx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdnaXRodWItY3VzdG9taXphdGlvbicgfSxcblx0XHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2dpdGh1Yi1tY3Atc2VydmVyL3ByLXdyaXRlJyxcblx0XHRcdFx0XHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC9zZXNzaW9uL0dpdEh1YicsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRpc0NvbmZpcm1lZDogc2VyaWFsaXplZC5pc0NvbmZpcm1lZCxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpc0NvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnaW5wdXQnLFxuXHRcdFx0XHRcdHJhd0lucHV0OiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0XHRtY3BBcHBEYXRhOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9naXRodWItbWNwLXNlcnZlci9wci13cml0ZScsXG5cdFx0XHRcdFx0XHRzZXJ2ZXJJZDogJ2dpdGh1Yi1jdXN0b21pemF0aW9uJyxcblx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24vR2l0SHViJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW5lcmljIGNvbXBsZXRlZCB0b29sIGNhbGwgbWFwcyBlbWJlZGRlZCByZXNvdXJjZXMgYW5kIHJlc291cmNlIHJlZnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcImltYWdlXCI6XCJkaWFncmFtXCJ9Jyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZSwgZGF0YTogJ2FXMWhaMlU9JywgY29udGVudFR5cGU6ICdpbWFnZS9wbmcnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlJlc291cmNlLCB1cmk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zZXNzaW9uL3Jlc3VsdC50eHQnLCBjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBzZXJpYWxpemVkLnJlc3VsdERldGFpbHM7XG5cblx0XHRcdGFzc2VydElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dFswXSwgeyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogJ2FXMWhaMlU9JywgbWltZVR5cGU6ICdpbWFnZS9wbmcnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0WzFdLnR5cGUsICdyZWYnKTtcblx0XHRcdC8vIFJlc291cmNlIFVSSSBpcyB3cmFwcGVkIHZpYSB0b0FnZW50SG9zdFVyaSBzbyBpdCByZXNvbHZlcyB0aHJvdWdoIHRoZVxuXHRcdFx0Ly8gYWdlbnQgaG9zdCBmaWxlc3lzdGVtIHByb3ZpZGVyIG9uIHRoZSBjbGllbnQgd2hlbiB0aGUgc2Vzc2lvbiBpcyBiYWNrZWRcblx0XHRcdC8vIGJ5IGEgcmVtb3RlIGFnZW50IGhvc3QuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXRbMV0udXJpLnNjaGVtZSwgJ3ZzY29kZS1hZ2VudC1ob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXRbMV0udXJpLmF1dGhvcml0eSwgJ2xvY2FsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXRbMV0udXJpLnBhdGgsICcvc2Vzc2lvbi9yZXN1bHQudHh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXRbMV0ubWltZVR5cGUsICd0ZXh0L3BsYWluJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXItdHVybiBtb2RlbCBpZCBhbmQgZGlzcGxheSBuYW1lIGZsb3cgZnJvbSB1c2FnZS5tb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4xID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSgnZmlyc3QnKSxcblx0XHRcdFx0dXNhZ2U6IHsgbW9kZWw6ICdncHQtNScgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdHVybjIgPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0aWQ6ICd0dXJuLTInLFxuXHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlKCdzZWNvbmQnKSxcblx0XHRcdFx0dXNhZ2U6IHsgbW9kZWw6ICdvcHVzLTQuNycgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBsb29rdXAgPSBtYWtlTG9va3VwKCdhZ2VudC1ob3N0LWNvcGlsb3Q6JywgeyAnZ3B0LTUnOiAnR1BULTUnLCAnb3B1cy00LjcnOiAnQ2xhdWRlIE9wdXMgNC43JyB9KTtcblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybjEsIHR1cm4yXSwgJ3AnLCBsb29rdXApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRoaXN0b3J5Lm1hcChoID0+IGgudHlwZSA9PT0gJ3JlcXVlc3QnXG5cdFx0XHRcdFx0PyB7IHR5cGU6IGgudHlwZSwgbW9kZWxJZDogaC5tb2RlbElkIH1cblx0XHRcdFx0XHQ6IHsgdHlwZTogaC50eXBlLCBkZXRhaWxzOiBoLmRldGFpbHMgfSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgbW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdDpncHQtNScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIGRldGFpbHM6ICdHUFQtNScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgbW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdDpvcHVzLTQuNycgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIGRldGFpbHM6ICdDbGF1ZGUgT3B1cyA0LjcnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgQXV0byBtb2RlbCByb3V0aW5nIHdpdGggdGhlIHNoYXJlZCBjaGF0IFVJIHBhcnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdFx0bW9kZWw6ICdncHQtNS40LW1pbmknLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHRhdXRvTW9kZVJlc29sdmVkOiB7XG5cdFx0XHRcdFx0XHRcdGNob3Nlbk1vZGVsOiAnZ3B0LTUuNC1taW5pJyxcblx0XHRcdFx0XHRcdFx0cHJlZGljdGVkTGFiZWw6ICdub19yZWFzb25pbmcnLFxuXHRcdFx0XHRcdFx0XHRjb25maWRlbmNlOiAwLjk4LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBsb29rdXAgPSBtYWtlTG9va3VwKCdhZ2VudC1ob3N0LWNvcGlsb3Q6JywgeyAnZ3B0LTUuNC1taW5pJzogJ0dQVC01LjQgbWluaScgfSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJywgbG9va3VwKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnBhcnRzLCBbe1xuXHRcdFx0XHRraW5kOiAnYXV0b01vZGVSZXNvbHV0aW9uJyxcblx0XHRcdFx0cmVzb2x2ZWRNb2RlbDogJ2dwdC01LjQtbWluaScsXG5cdFx0XHRcdHJlc29sdmVkTW9kZWxOYW1lOiAnR1BULTUuNCBtaW5pJyxcblx0XHRcdFx0cHJlZGljdGVkTGFiZWw6ICdub19yZWFzb25pbmcnLFxuXHRcdFx0XHRjb25maWRlbmNlOiAwLjk4LFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBzZXNzaW9uLWxldmVsIG1vZGVsIHdoZW4gdHVybiBoYXMgbm8gdXNhZ2UubW9kZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7IG1lc3NhZ2U6IG1lc3NhZ2UoJ2ZpcnN0JykgfSk7XG5cdFx0XHRjb25zdCBsb29rdXAgPSBtYWtlTG9va3VwKCdhZ2VudC1ob3N0LWNvcGlsb3Q6JywgeyAnZ3B0LTUnOiAnR1BULTUnIH0sICdncHQtNScpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnLCBsb29rdXApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRoaXN0b3J5Lm1hcChoID0+IGgudHlwZSA9PT0gJ3JlcXVlc3QnXG5cdFx0XHRcdFx0PyB7IHR5cGU6IGgudHlwZSwgbW9kZWxJZDogaC5tb2RlbElkIH1cblx0XHRcdFx0XHQ6IHsgdHlwZTogaC50eXBlLCBkZXRhaWxzOiBoLmRldGFpbHMgfSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXF1ZXN0JywgbW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdDpncHQtNScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdyZXNwb25zZScsIGRldGFpbHM6ICdHUFQtNScgfSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIHR1cm4gdXNhZ2UgdG8gY2hhdCB1c2FnZSBwcm9ncmVzcyBmb3IgcmVzdG9yZWQgaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0dXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEyMDAsIG91dHB1dFRva2VuczogMzAwLCBtb2RlbDogJ2dwdC01JyB9LFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21kLTEnLCBjb250ZW50OiAnRG9uZScgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNwb25zZS5wYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd1c2FnZSdcblx0XHRcdFx0XHQ/IHsga2luZDogcGFydC5raW5kLCBwcm9tcHRUb2tlbnM6IHBhcnQucHJvbXB0VG9rZW5zLCBjb21wbGV0aW9uVG9rZW5zOiBwYXJ0LmNvbXBsZXRpb25Ub2tlbnMgfVxuXHRcdFx0XHRcdDogeyBraW5kOiBwYXJ0LmtpbmQgfSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTIwMCwgY29tcGxldGlvblRva2VuczogMzAwIH0sXG5cdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVlc3QgaGlzdG9yeSBpbmNsdWRlcyByZXN0b3JlZCBtb2RlbCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSgnVXNlIHJlc3RvcmVkIG1vZGVsJyksXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDctMDhUMjI6MDU6MjEuMDAwWicsXG5cdFx0XHRcdGR1cmF0aW9uOiAyXzUwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBsb29rdXAgPSBtYWtlTG9va3VwKCdhZ2VudC1ob3N0LWNvcGlsb3Q6Jywge30sICdncHQtNScpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnLCBsb29rdXApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhpc3RvcnlbMF0sIHtcblx0XHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdFx0cHJvbXB0OiAnVXNlIHJlc3RvcmVkIG1vZGVsJyxcblx0XHRcdFx0cGFydGljaXBhbnQ6ICdwYXJ0aWNpcGFudC0xJyxcblx0XHRcdFx0bW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdDpncHQtNScsXG5cdFx0XHRcdHRpbWVzdGFtcDogMV83NTJfMDEyXzMyMV8wMDAsXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhpc3RvcnlbMV0udHlwZSA9PT0gJ3Jlc3BvbnNlJyA/IHtcblx0XHRcdFx0ZWxhcHNlZE1zOiBoaXN0b3J5WzFdLmVsYXBzZWRNcyxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IGhpc3RvcnlbMV0uY29tcGxldGVkQXQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGVsYXBzZWRNczogMl81MDAsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiAxXzc1Ml8wMTJfMzIzXzUwMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdCBoaXN0b3J5IG9taXRzIGludmFsaWQgcmVzdG9yZWQgdGltZXN0YW1wJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oeyBzdGFydGVkQXQ6ICdpbnZhbGlkJyB9KTtcblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwYXJ0aWNpcGFudC0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUgPT09ICdyZXF1ZXN0JyA/IGhpc3RvcnlbMF0udGltZXN0YW1wIDogdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgdG9vbCBjYWxsIGluIGhpc3RvcnkgaGFzIGNvcnJlY3QgdGVybWluYWwgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy90MScsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoZWxsbycgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IHN0cmluZyB9OyB0ZXJtaW5hbENvbW1hbmRPdXRwdXQ6IHsgdGV4dDogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZFN0YXRlOiB7IGV4aXRDb2RlOiBudW1iZXIgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dC50ZXh0LCAnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXJtaW5hbCB0b29sIGNhbGwgaW4gaGlzdG9yeSBjYXJyaWVzIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgb25seSB3aGVuIHN0YW1wZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFya2VkJyxcblx0XHRcdFx0XHRcdFx0dG9vbElucHV0OiAnbXktY3VzdG9tLXNjcmlwdCcsXG5cdFx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vbWFya2VkJywgdGl0bGU6ICdUZXJtaW5hbCcgfV0sXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXVubWFya2VkJyxcblx0XHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdW5tYXJrZWQnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9XSxcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNwb25zZS5wYXJ0cy5tYXAocGFydCA9PiBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHBhcnQgYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpLmF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUpLFxuXHRcdFx0XHRbdHJ1ZSwgdW5kZWZpbmVkXSxcblx0XHRcdFx0J2ZsYWcgaXMgY29waWVkIGZyb20gdG9vbCBjYWxsIG1ldGEgYW5kIGFic2VudCBvdGhlcndpc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rlcm1pbmFsIHRvb2wgY2FsbCBpbiBoaXN0b3J5IGNhcnJpZXMgdGhlIExNIGludGVudGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0aW50ZW50aW9uOiAnTGlzdCBmaWxlcyBpbiB0aGUgcmVwbyByb290Jyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ2xzJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL2ludGVudCcsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdhXFxuYicgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyBpbnRlbnRpb24/OiBzdHJpbmcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5pbnRlbnRpb24sICdMaXN0IGZpbGVzIGluIHRoZSByZXBvIHJvb3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rlcm1pbmFsIHRvb2wgY2FsbCBpbiBoaXN0b3J5IGRvZXMgbm90IHNldCBwYXN0VGVuc2VNZXNzYWdlIChhdm9pZHMgZHVwbGljYXRlIHJlbmRlciknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZWNobyBoaScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9wYXN0JywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC5wYXN0VGVuc2VNZXNzYWdlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgdG9vbCBjYWxsIChieSB0b29sS2luZCBvbmx5KSBpbiBoaXN0b3J5IGRvZXMgbm90IHNldCBwYXN0VGVuc2VNZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGVjaG8gaGknLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGknIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnBhc3RUZW5zZU1lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJhZ2VudCB0b29sIGNhbGwgaW4gaGlzdG9yeSBoYXMgY29ycmVjdCBzdWJhZ2VudCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0FnZW50IHJlc3VsdCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsIHJlc291cmNlOiAnY29waWxvdDovL3Nlc3Npb24vc3ViYWdlbnQvdGMtMScsIHRpdGxlOiAnRXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmFnZW50TmFtZSwgJ2V4cGxvcmUnKTtcblx0XHRcdFx0Ly8gZGVzY3JpcHRpb24gaXMgdGhlIFRBU0sgZGVzY3JpcHRpb24gZnJvbSBfbWV0YSwgbm90IHRoZSBhZ2VudCBkZXNjcmlwdGlvblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnRmluZCByZWxhdGVkIGZpbGVzJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEucmVzdWx0LCAnQWdlbnQgcmVzdWx0Jyk7XG5cdFx0XHRcdC8vIFRoZSBzdWJhZ2VudCBjaGF0IHJlc291cmNlIGlzIGNhcnJpZWQgc28gdGhlIFVJIGNhbiBvZmZlciBcIk9wZW4gY2hhdFwiLlxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmNoYXRSZXNvdXJjZSwgJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmFnZW50IHRvb2wgd2l0aG91dCBjb250ZW50IGZhbGxzIGJhY2sgdG8gdG9vbEtpbmQgbWV0YScsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgaGFwcGVucyB3aGVuIHRoZSBpbi1tZW1vcnkgc3RhdGUgbG9zdCBzdWJhZ2VudCBjb250ZW50XG5cdFx0XHQvLyAoZS5nLiB0b29sX2NvbXBsZXRlIG92ZXJ3cm90ZSBpdCBiZWZvcmUgdGhlIG1lcmdlIGZpeClcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGFzaycsXG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdSZXN1bHQgdGV4dCcgfV0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnVGFzaycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLnJlc3VsdCwgJ1Jlc3VsdCB0ZXh0Jyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0dXJuIHdpdGggcmVzcG9uc2VUZXh0IHByb2R1Y2VzIG1hcmtkb3duIGNvbnRlbnQgaW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtZC0xJywgY29udGVudDogJ0hlbGxvIHdvcmxkJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnkubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UucGFydHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5wYXJ0c1swXS5raW5kLCAnbWFya2Rvd25Db250ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50KS5jb250ZW50LnZhbHVlLCAnSGVsbG8gd29ybGQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtkb3duIGxpbmtzIGluIHJlc3BvbnNlIGNvbnRlbnQgc3RheSByYXcgdW50aWwgcmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9ICdTZWUgW2xvY2FsXShmaWxlOi8vL2EvYi50cyksIFtleHRlcm5hbF0oaHR0cHM6Ly9leGFtcGxlLmNvbSkgYW5kIFtyZWxdKC4vZm9vLm1kKS4nO1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0aWQ6ICdtZC1saW5rcycsXG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHJhd1R1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnLCAnbXktaG9zdCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb250ZW50LnZhbHVlLCBjb250ZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtkb3duIGxpbmsgc3ludGF4IGluc2lkZSBmZW5jZWQgY29kZSBibG9ja3MgaXMgcHJlc2VydmVkIHZlcmJhdGltJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdVc2UgW3JlYWxdKGZpbGU6Ly8vYS50cykgZGlyZWN0bHkuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdgYGBtZCcsXG5cdFx0XHRcdCdbZmFrZV0oZmlsZTovLy9iLnRzKScsXG5cdFx0XHRcdCdgYGAnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0FuZCB0aGVuIFthbm90aGVyXShmaWxlOi8vL2MudHMpLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXdyaXRlTWFya2Rvd25MaW5rcyhpbnB1dCwgJ215LWhvc3QnKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnW10odnNjb2RlLWFnZW50LWhvc3Q6Ly9teS1ob3N0L2EudHM/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjApJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYy50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCknKSk7XG5cdFx0XHQvLyBUaGUgbGluayBpbnNpZGUgdGhlIGZlbmNlZCBjb2RlIGJsb2NrIG11c3QgTk9UIGJlIHJld3JpdHRlbi5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnW2Zha2VdKGZpbGU6Ly8vYi50cyknKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdbZmFrZV0odnNjb2RlLWFnZW50LWhvc3QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrZG93biBsaW5rIHN5bnRheCBpbnNpZGUgaW5saW5lIGNvZGUgc3BhbnMgaXMgcHJlc2VydmVkIHZlcmJhdGltJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnUmVhbCBbb25lXShmaWxlOi8vL2EudHMpIGFuZCBsaXRlcmFsIGBbdHdvXShmaWxlOi8vL2IudHMpYCBoZXJlLic7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKGlucHV0LCAnbXktaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLFxuXHRcdFx0XHQnUmVhbCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYS50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCkgYW5kIGxpdGVyYWwgYFt0d29dKGZpbGU6Ly8vYi50cylgIGhlcmUuJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBsYWJlbCBhbmQgdGFncyB2c2NvZGVMaW5rVHlwZT1za2lsbCBmb3IgU0tJTEwubWQgbGlua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKCdMb2FkZWQgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpIGFuZCBbb3RoZXJdKGZpbGU6Ly8vYWJzL3JlcG8vZm9vLnRzKS4nLCAnbXktaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLFxuXHRcdFx0XHQnTG9hZGVkIFtwbGFuXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQ/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAlMjZ2c2NvZGVMaW5rVHlwZSUzRHNraWxsKSAnICtcblx0XHRcdFx0J2FuZCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYWJzL3JlcG8vZm9vLnRzP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wKS4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGFsdCB0ZXh0IGZvciBpbWFnZSB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKCdTZWUgIVtkaWFncmFtXShmaWxlOi8vL2EvYi5wbmcpLicsICdteS1ob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdTZWUgIVtkaWFncmFtXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYS9iLnBuZz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCkuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcnJvciB0dXJuIHByb2R1Y2VzIGVycm9yIGRldGFpbHMgaW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAndGVzdCcsIG1lc3NhZ2U6ICdib29tJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5lcnJvckRldGFpbHM/Lm1lc3NhZ2UsICdFcnJvcjogKHRlc3QpIGJvb20nKTtcblx0XHRcdGFzc2VydC5vayghcmVzcG9uc2UucGFydHMuc29tZShwID0+IHAua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgKHAgYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQpLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ2Jvb20nKSksICdFcnJvciBzaG91bGQgbm90IGJlIGR1cGxpY2F0ZWQgYXMgYSBtYXJrZG93biBwYXJ0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkZWQgcXVvdGEgZXJyb3IgdHVybiBwcm9kdWNlcyBxdW90YS1leGNlZWRlZCBlcnJvciBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkVycm9yLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGVycm9yVHlwZTogJ3F1b3RhJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAncmF3Jyxcblx0XHRcdFx0XHRfbWV0YTogeyBjaGF0RXJyb3I6IHsgZmV0Y2hFcnJvcjogeyB0eXBlOiAncXVvdGFFeGNlZWRlZCcsIGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnIH0gfSB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmVycm9yRGV0YWlscz8uaXNRdW90YUV4Y2VlZGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCB0b29sIGluIGhpc3RvcnkgaGFzIGV4aXRDb2RlIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ2JhZC1jb21tYW5kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3QyJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2Vycm9yJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZTogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFyY2ggdG9vbCBpbiBoaXN0b3J5IGtlZXBzIHNlYXJjaCByZW5kZXJpbmcgd2l0aG91dCBnZW5lcmljIGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcImFjdGl2YXRpb25cIn0nLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmb3VuZCByZXN1bHRzJyB9XSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzZWFyY2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnJlc3VsdERldGFpbHMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBDaGF0VG9vbEludm9jYXRpb24gZm9yIHJ1bm5pbmcgdG9vbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy00MicsXG5cdFx0XHRcdHRvb2xOYW1lOiAnbXlfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRG9pbmcgc3R1ZmYnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbENhbGxJZCwgJ3RjLTQyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sSWQsICdteV90b29sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zb3VyY2UsIFRvb2xEYXRhU291cmNlLkludGVybmFsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgYXNrLXVzZXIgdG9vbHMgYXMgd2FpdGluZyBwcm9ncmVzcyB0aGF0IGhpZGVzIGFmdGVyIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2Fza191c2VyJywgJ0Fza1VzZXJRdWVzdGlvbicsICdyZXF1ZXN0X3VzZXJfaW5wdXQnXTtcblx0XHRcdGNvbnN0IGxpdmUgPSB0b29sTmFtZXMubWFwKHRvb2xOYW1lID0+IHtcblx0XHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24oY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHRvb2xOYW1lIH0pKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRtZXNzYWdlOiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogaW52b2NhdGlvbi5wcmVzZW50YXRpb24sXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gY29tcGxldGVkVG9vbENhbGxUb1NlcmlhbGl6ZWQoY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoeyB0b29sTmFtZTogJ2Fza191c2VyJyB9KSwgdW5kZWZpbmVkLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnKTtcblx0XHRcdGNvbnN0IGZhaWxlZCA9IGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkKGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHsgdG9vbE5hbWU6ICdhc2tfdXNlcicsIHN1Y2Nlc3M6IGZhbHNlIH0pLCB1bmRlZmluZWQsIFVSSS5maWxlKCcvJyksICdsb2NhbCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbGl2ZSwgcmVzdG9yZWRQcmVzZW50YXRpb246IHJlc3RvcmVkLnByZXNlbnRhdGlvbiwgZmFpbGVkUHJlc2VudGF0aW9uOiBmYWlsZWQucHJlc2VudGF0aW9uIH0sIHtcblx0XHRcdFx0bGl2ZTogdG9vbE5hbWVzLm1hcCgoKSA9PiAoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6ICdXYWl0aW5nIGZvciBhbnN3ZXIuLi4nLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRyZXN0b3JlZFByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSxcblx0XHRcdFx0ZmFpbGVkUHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtzIEFnZW50IEhvc3QgaW5wdXQgcmVxdWVzdHMgZm9yIGNvbnZlcnNhdGlvbmFsIGFuc3dlciByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZUlucHV0UmVxdWVzdENhcm91c2VsKHtcblx0XHRcdFx0aWQ6ICdpbnB1dC0xJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFt7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnIH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sICdsb2NhbCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2Fyb3VzZWwuYW5zd2VyUHJlc2VudGF0aW9uLCAnY29udmVyc2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdHRhY2hlcyBhdXRvbWF0aW9uIHJlc3VsdCBkYXRhIHRvIGxpdmUgYW5kIHJlc3RvcmVkIGNvbmZpZ3VyZUF1dG9tYXRpb24gY2FsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdID0gW3tcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsXG5cdFx0XHRcdHRleHQ6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRzdGF0dXM6ICdjcmVhdGVkJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uOiB7IGlkOiAnYXV0b21hdGlvbi0xJywgbmFtZTogJ01vcm5pbmcgcmV2aWV3JyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAnYXV0b21hdGlvbi1jYWxsJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdjb25maWd1cmVBdXRvbWF0aW9uJyxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZChjb21wbGV0ZWQsIHVuZGVmaW5lZCwgVVJJLmZpbGUoJy8nKSwgJ2xvY2FsJyk7XG5cdFx0XHRjb25zdCBsaXZlID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ2F1dG9tYXRpb24tY2FsbCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAnY29uZmlndXJlQXV0b21hdGlvbicsXG5cdFx0XHR9KSk7XG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGxpdmUsIGNvbXBsZXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN0b3JlZDogcmVzdG9yZWQudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0bGl2ZTogbGl2ZS50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN0b3JlZDoge1xuXHRcdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0bGl2ZToge1xuXHRcdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwcmVzZW50cyBhbm90aGVyIGNsaWVudCB0b29sIHdpdGhvdXQgc3VyZmFjaW5nIGl0cyBjb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbDogVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1vdGhlci1jbGllbnQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1bl90YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQWxsb3cgUnVuIFRhc2s/Jyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnb3duZXItY2xpZW50JyB9LFxuXHRcdFx0fTtcblx0XHRcdGxldCBjYW5jZWxsZWRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRvb2xDYWxsLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0Y3VycmVudENsaWVudElkOiAndmlld2VyLWNsaWVudCcsXG5cdFx0XHRcdGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6IHRvb2xDYWxsID0+IGNhbmNlbGxlZFRvb2xDYWxsSWQgPSB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGw/LmNhbmNlbCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWVzc2FnZTogaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0c3RhdGU6IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiAhIWludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbCxcblx0XHRcdFx0Y2FuY2VsbGVkVG9vbENhbGxJZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWVzc2FnZTogJ1J1bm5pbmcgUnVuIFRhc2sgb24gYW5vdGhlciBjbGllbnQuLi4nLFxuXHRcdFx0XHRzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRoYXNPdGhlckNsaWVudERhdGE6IHRydWUsXG5cdFx0XHRcdGNhbmNlbGxlZFRvb2xDYWxsSWQ6ICd0Yy1vdGhlci1jbGllbnQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGF1dGhlbnRpY2F0aW9uLXJlcXVpcmVkIGludm9jYXRpb24gZm9yIGFuIE1DUCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcmF3VG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdC4uLmNyZWF0ZVRvb2xDYWxsU3RhdGUoKSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHRcdGF1dGg6IHtcblx0XHRcdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5JbnN1ZmZpY2llbnRTY29wZSxcblx0XHRcdFx0XHRvYXV0aENsaWVudDoge1xuXHRcdFx0XHRcdFx0Y2xpZW50SWQ6ICdjb25maWd1cmVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdFx0XHRjbGllbnRTZWNyZXQ6ICdjb25maWd1cmVkLWNsaWVudC1zZWNyZXQnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2VfbmFtZTogJ0V4YW1wbGUgTUNQJyxcblx0XHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVwbyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWRTY29wZXM6IFsncmVwbyddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovL2JhY2tlbmQvc2Vzc2lvbicpLCAncmVtb3RlJywgJ2Zyb250ZW5kJyk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24pO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgYXV0aGVudGljYXRpb24tcmVxdWlyZWQgc3RhdGUnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgY2FuY2VsLCAuLi5zdGF0ZVdpdGhvdXRDYW5jZWwgfSA9IHN0YXRlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBjYW5jZWwsICdmdW5jdGlvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZVdpdGhvdXRDYW5jZWwsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCwgcmVhc29uOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXJ2ZXI6IHtcblx0XHRcdFx0XHRpZDogJ2Zyb250ZW5kL21jcC0xJyxcblx0XHRcdFx0XHRuYW1lOiAnRXhhbXBsZSBNQ1AnLFxuXHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdG9hdXRoQ2xpZW50OiB7XG5cdFx0XHRcdFx0XHRjbGllbnRJZDogJ2NvbmZpZ3VyZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0XHRcdGNsaWVudFNlY3JldDogJ2NvbmZpZ3VyZWQtY2xpZW50LXNlY3JldCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0XHRzdXBwb3J0ZWRTY29wZXM6IFsncmVwbyddLFxuXHRcdFx0XHRcdHJlcXVpcmVkU2NvcGVzOiBbJ3JlcG8nXSxcblx0XHRcdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5JbnN1ZmZpY2llbnRTY29wZSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0aW52b2NhdGlvbi5zZXRBdXRoZW50aWNhdGlvblJlc29sdmVkKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0cyB0ZXJtaW5hbCB0b29sU3BlY2lmaWNEYXRhIHdoZW4gY29udGVudCBoYXMgdGVybWluYWwgYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICdscyAtbGEnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3QzJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsLCAnbHMgLWxhJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgZm9yIGJ1aWx0LWluIGJhc2ggdmlhIF9tZXRhLnRvb2xLaW5kIChubyBUZXJtaW5hbCBjb250ZW50IGJsb2NrKScsICgpID0+IHtcblx0XHRcdC8vIFRoZSBTREsncyBidWlsdC1pbiBiYXNoIHRvb2wgKHVzZWQgd2hlbiB0aGUgQ3VzdG9tIFRlcm1pbmFsIHRvb2xcblx0XHRcdC8vIGlzIGRpc2FibGVkKSBydW5zIG91dHNpZGUgQUhQJ3MgdGVybWluYWwgaW5mcmEgYW5kIGRvZXMgbm90IGVtaXRcblx0XHRcdC8vIGEgVGVybWluYWwgY29udGVudCBibG9jay4gVGhlIHRlcm1pbmFsIHBpbGwgbXVzdCBzdGlsbCByZW5kZXIgc29cblx0XHRcdC8vIHRoZSB1c2VyIGNhbiBleHBhbmQgdGhlIGZ1bGwgbXVsdGktbGluZSBjb21tYW5kIGFuZCBvdXRwdXQuXG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBTaGVsbCBDb21tYW5kJyxcblx0XHRcdFx0dG9vbElucHV0OiAnbHMgLWxhXFxud2MgLWwnLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IHN0cmluZyB9OyBsYW5ndWFnZT86IHN0cmluZzsgdGVybWluYWxUb29sU2Vzc2lvbklkPzogc3RyaW5nOyB0ZXJtaW5hbENvbW1hbmRVcmk/OiBVUkkgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCwgJ2xzIC1sYVxcbndjIC1sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEubGFuZ3VhZ2UsICdzaGVsbHNjcmlwdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCwgdW5kZWZpbmVkLCAnbm8gQUhQIHRlcm1pbmFsIHNlc3Npb24gZm9yIGJ1aWx0LWluIGJhc2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmksIHVuZGVmaW5lZCwgJ25vIEFIUCB0ZXJtaW5hbCBVUkkgZm9yIGJ1aWx0LWluIGJhc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1aWx0LWluIGJhc2ggdGVybWluYWwgdG9vbFNwZWNpZmljRGF0YSBwaWNrcyB1cCBzdHJlYW1pbmcgdGV4dCBvdXRwdXQgKHJ1bm5pbmcpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoaVxcbicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kT3V0cHV0PzogeyB0ZXh0OiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCwgJ2hpXFxyXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgdGVybWluYWwgcGlsbCBmb3IgdGVybWluYWwgdG9vbEtpbmQgd2l0aG91dCBhIGNvbW1hbmQgKGZhbGxzIGJhY2sgdG8gaW52b2NhdGlvbk1lc3NhZ2UpJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGJ1aWx0LWluIGJhc2ggdG9vbCBhZHZlcnRpc2VzIGBfbWV0YS50b29sS2luZCA9PT0gJ3Rlcm1pbmFsJ2Bcblx0XHRcdC8vIGZyb20gdGhlIHRvb2wtb3BlbiBzZWFtLCBidXQgdGhlIGNvbW1hbmQgb25seSBhcnJpdmVzIG9uY2UgdGhlXG5cdFx0XHQvLyB0b29sIGlucHV0IGhhcyBzdHJlYW1lZCBpbi4gVW50aWwgdGhlbiB0aGVyZSBpcyBub3RoaW5nIHRvIHNob3cgaW5cblx0XHRcdC8vIHRoZSB0ZXJtaW5hbCBwaWxsLCBzbyB3ZSBtdXN0IGZhbGwgYmFjayB0byB0aGUgZ2VuZXJpYyB0b29sIHdpZGdldFxuXHRcdFx0Ly8gKHRoZSBgaW52b2NhdGlvbk1lc3NhZ2VgKSByYXRoZXIgdGhhbiByZW5kZXJpbmcgYW4gZW1wdHkgY29tbWFuZC5cblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHVuZGVmaW5lZCwgJ25vIHRlcm1pbmFsIHBpbGwgd2l0aG91dCBhIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLCAnUnVubmluZyBzaGVsbCBjb21tYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBfbWV0YSBmb3Igc3ViYWdlbnQgdG9vbEtpbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ1JldmlldyBjb2RlJywgc3ViYWdlbnRBZ2VudE5hbWU6ICdjb2RlLXJldmlld2VyJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAnc3ViYWdlbnQnKTtcblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnUmV2aWV3IGNvZGUnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUsICdjb2RlLXJldmlld2VyJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIE1DUCBBcHAgdG9vbFNwZWNpZmljRGF0YSBmb3IgcnVubmluZyBNQ1AgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0b3BpY1wiOlwibWV0YWRhdGFcIn0nLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2RvY3MtY3VzdG9taXphdGlvbicgfSxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdHJhd0lucHV0OiB7IHRvcGljOiAnbWV0YWRhdGEnIH0sXG5cdFx0XHRcdG1jcEFwcERhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogJ3VpOi8vZG9jcy9hcHAnLFxuXHRcdFx0XHRcdHNlcnZlcklkOiAnZG9jcy1jdXN0b21pemF0aW9uJyxcblx0XHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC90ZXN0LXNlc3Npb24tMS9kb2NzJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2V0IE1DUCBBcHAgdG9vbFNwZWNpZmljRGF0YSBmb3IgYSBzdHJlYW1pbmcgTUNQIHRvb2wgY2FsbCcsICgpID0+IHtcblx0XHRcdC8vIEEgYFN0cmVhbWluZ2AgY2FsbCBpcyBjcmVhdGVkIGluIHRoZSBVSSdzIGBFeGVjdXRpbmdgIHN0YXRlIGJlZm9yZVxuXHRcdFx0Ly8gaXQgbWF5IHRyYW5zaXRpb24gdG8gY29uZmlybWF0aW9uLCBzbyB0aGUgQXBwIG11c3Qgbm90IG1vdW50IHlldC5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2RvY3MtY3VzdG9taXphdGlvbicgfSxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bnRoZXNpemVzIHN1YmFnZW50IGNoYXRSZXNvdXJjZSBmcm9tIHRoZSB0b29sIGNhbGwgaWQgd2hlbiBubyBkaXNjb3ZlcnkgY29udGVudCBibG9jayBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Ly8gQSBiYWNrZ3JvdW5kIHN1YmFnZW50J3MgYHN1YmFnZW50X3N0YXJ0ZWRgIGNhbiBhcnJpdmUgYWZ0ZXIgaXRzXG5cdFx0XHQvLyBzcGF3bmluZyB0b29sIGNhbGwgaGFzIGFscmVhZHkgY29tcGxldGVkLCBzbyB0aGUgcnVubmluZy1vbmx5XG5cdFx0XHQvLyBkaXNjb3ZlcnkgY29udGVudCB1cGRhdGUgaXMgZHJvcHBlZCBhbmQgdGhlIGNoaWxkIGNoYXQgcmVzb3VyY2Vcblx0XHRcdC8vIG5ldmVyIGxhbmRzIG9uIHRoZSB0b29sIGNhbGwuIFRoZSBjaGF0IHJlc291cmNlIG11c3Qgc3RpbGwgYmVcblx0XHRcdC8vIGRlcml2YWJsZSBmcm9tIHRoZSBzZXNzaW9uICsgdG9vbCBjYWxsIGlkIHNvIHRoZSBpbmxpbmUgc3ViYWdlbnRcblx0XHRcdC8vIHBpbGwgcmVtYWlucyBsaW5rYWJsZS5cblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnTWFwIGF1eCBiYXIgKyBlZGl0b3IgcGFydCBjcmVhdGlvbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnc3ViYWdlbnQnKTtcblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jaGF0UmVzb3VyY2UsIGJ1aWxkU3ViYWdlbnRDaGF0VXJpKFVSSS5maWxlKCcvJykudG9TdHJpbmcoKSwgJ3RjLTEnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIHRoZSBob3N0LXN0YW1wZWQgX21ldGEuc3ViYWdlbnRDaGF0VXJpIG92ZXIgYSBkaXNjb3ZlcnkgY29udGVudCBibG9jayByZXNvdXJjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudENoYXRVcmk6ICdhaHAtY2hhdDovL3N1YmFnZW50L3N0YW1wZWQvdGMtMScgfSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L2Rpc2NvdmVyeS90Yy0xJyxcblx0XHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY2hhdFJlc291cmNlLCAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC9zdGFtcGVkL3RjLTEnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyBzdWJBZ2VudEludm9jYXRpb25JZCB0byBDaGF0VG9vbEludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe30pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YywgJ3BhcmVudC10Yy00MicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWQsICdwYXJlbnQtdGMtNDInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FkZENvbW1lbnQgcmVmZXJlbmNlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgY29tbWVudFJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAzLCBlbmRDb2x1bW46IDUgfTtcblxuXHRcdGZ1bmN0aW9uIGFkZENvbW1lbnRJbnB1dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgcmVzb3VyY2VVcmk6ICdmaWxlOi8vL3dvcmtzcGFjZS9hLnRzJywgcmFuZ2U6IGNvbW1lbnRSYW5nZSwgdGV4dCB9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBtYXJrZG93bihtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UgJiYgdHlwZW9mIG1lc3NhZ2UgIT09ICdzdHJpbmcnLCAnZXhwZWN0ZWQgYSBtYXJrZG93biByZWZlcmVuY2UnKTtcblx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlbmRlcnMgdG9vbCBuYW1lLCB0cnVuY2F0ZWQgcXVvdGVkIHByZXZpZXcgYW5kIGEgcmV2ZWFsIGNvbW1hbmQgbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHRvb2xOYW1lOiAnYWRkQ29tbWVudCcsIGludm9jYXRpb25NZXNzYWdlOiAnQWRkaW5nIGNvbW1lbnQnLCB0b29sSW5wdXQ6IGFkZENvbW1lbnRJbnB1dCgnVGhpcyBjb21tZW50IGlzIHF1aXRlIGxvbmcgYW5kIHNob3VsZCBiZSB0cnVuY2F0ZWQnKSB9KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBtYXJrZG93bih0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKS5pbnZvY2F0aW9uTWVzc2FnZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YWx1ZTogbWVzc2FnZS52YWx1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogbWVzc2FnZS5zdXBwb3J0VGhlbWVJY29ucyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IG1lc3NhZ2UuaXNUcnVzdGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmFsdWU6IGBbYWRkQ29tbWVudCBcIlRoaXMgY29tbWVudCBpcyBxdWl0ZSBsb25nIGFuZCBzaG91bGQgYmVcdTIwMjZcIl0oY29tbWFuZDpfYWdlbnRGZWVkYmFja1Jldmlldy5yZXZlYWxBdD8ke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShbJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHMnLCBjb21tZW50UmFuZ2VdKSl9KWAsXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogWydfYWdlbnRGZWVkYmFja1Jldmlldy5yZXZlYWxBdCddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdHJ1bmNhdGUgYSBzaG9ydCBjb21tZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogYWRkQ29tbWVudElucHV0KCdTaG9ydCBub3RlJykgfSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbWFya2Rvd24odG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YykuaW52b2NhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ2FkZENvbW1lbnQgXCJTaG9ydCBub3RlXCInKSwgbWVzc2FnZS52YWx1ZSk7XG5cdFx0XHRhc3NlcnQub2soIW1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1x1MjAyNicpLCBtZXNzYWdlLnZhbHVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldHMgdGhlIHNhbWUgcmVmZXJlbmNlIGFzIHRoZSBwYXN0LXRlbnNlIG1lc3NhZ2Ugb24gY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJ1bm5pbmcgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogYWRkQ29tbWVudElucHV0KCdTaG9ydCBub3RlJykgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihydW5uaW5nKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgdG9vbElucHV0OiBhZGRDb21tZW50SW5wdXQoJ1Nob3J0IG5vdGUnKSwgcGFzdFRlbnNlTWVzc2FnZTogJ0FkZGVkIGNvbW1lbnQnIH0pO1xuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCBjb21wbGV0ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duKGludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSkudmFsdWUsIG1hcmtkb3duKGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UpLnZhbHVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHNlcnZlciBtZXNzYWdlIHdoZW4gdGhlIGlucHV0IGNhbm5vdCBiZSBwYXJzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyB0b29sTmFtZTogJ2FkZENvbW1lbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0FkZGluZyBjb21tZW50JywgdG9vbElucHV0OiAnbm90IGpzb24nIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpLmludm9jYXRpb25NZXNzYWdlLCAnQWRkaW5nIGNvbW1lbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHNlcnZlciBtZXNzYWdlIHdoZW4gdGhlIHJhbmdlIGlzIG5vdCBhIHZhbGlkIDEtYmFzZWQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIFtcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDAsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLjUsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogLTEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdF0pIHtcblx0XHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyByZXNvdXJjZVVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHMnLCByYW5nZSwgdGV4dDogJ2hpJyB9KSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpLmludm9jYXRpb25NZXNzYWdlLCAnQWRkaW5nIGNvbW1lbnQnLCBKU09OLnN0cmluZ2lmeShyYW5nZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3RyZWFtaW5nIHRvb2wgaW52b2NhdGlvbnMgKCMzMTQ4NTgpJywgKCkgPT4ge1xuXG5cdFx0dHlwZSBBbnlUb29sQ2FsbFN0YXRlID0gUGFyYW1ldGVyczx0eXBlb2YgcmF3VG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uPlswXTtcblxuXHRcdHRlc3QoJ3Rvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24gc3RhcnRzIGluIHRoZSBuYXRpdmUgU3RyZWFtaW5nIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGM6IEFueVRvb2xDYWxsU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdHJlYW0nLFxuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0cGFydGlhbElucHV0OiAne1wiY29tbWFuZFwiOlwibnBtIHRlc3RcIixcImRlc2NyaXB0aW9uXCI6XCJSdW4nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbnBtIHRlc3QnLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHRjLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZyk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0b29sQ2FsbElkOiBpbnZvY2F0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xJZDogaW52b2NhdGlvbi50b29sSWQsXG5cdFx0XHRcdHBhcnRpYWxJbnB1dDogc3RhdGUucGFydGlhbElucHV0LmdldCgpLFxuXHRcdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiBzdGF0ZS5zdHJlYW1pbmdNZXNzYWdlLmdldCgpLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbiksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdHJlYW0nLFxuXHRcdFx0XHR0b29sSWQ6ICdiYXNoJyxcblx0XHRcdFx0cGFydGlhbElucHV0OiB7IGNvbW1hbmQ6ICducG0gdGVzdCcsIGRlc2NyaXB0aW9uOiAnUnVuJyB9LFxuXHRcdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiAnUnVubmluZyBucG0gdGVzdCcsXG5cdFx0XHRcdGlzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uIHByZXNlcnZlcyBzdWJhZ2VudCBtZXRhZGF0YSBiZWZvcmUgcmVhZHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtc3ViYWdlbnQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0RlbGVnYXRlIFRhc2snLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR0b29sS2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiAnUmV2aWV3IGN1cnJlbnQgYnJhbmNoJyxcblx0XHRcdFx0XHRzdWJhZ2VudEFnZW50TmFtZTogJ2NvZGUtcmV2aWV3Jyxcblx0XHRcdFx0XHRzdWJhZ2VudENoYXRVcmk6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCAndGMtc3ViYWdlbnQnKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCAnJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV2aWV3IGN1cnJlbnQgYnJhbmNoJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnY29kZS1yZXZpZXcnLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCAndGMtc3ViYWdlbnQnKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVUb29sSW52b2NhdGlvbiBwcmVzZXJ2ZXMgY2FuY2VsbGF0aW9uIGZyb20gc3RyZWFtaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2FuY2VsbGVkJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdjbGllbnRfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQ2xpZW50IFRvb2wnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNhbmNlbGxlZCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAnY2xpZW50X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0NsaWVudCBUb29sJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjbGllbnQgdG9vbCcsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHRyZWFzb25NZXNzYWdlOiAnRGVuaWVkIGJ5IHRoZSBzZXJ2ZXInLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zdGF0ZS5nZXQoKSwge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLkRlbmllZCxcblx0XHRcdFx0cmVhc29uTWVzc2FnZTogJ0RlbmllZCBieSB0aGUgc2VydmVyJyxcblx0XHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFuc2l0aW9uRnJvbVN0cmVhbWluZyB3aXRoIGEgcGVuZGluZyB0ZXJtaW5hbCBwcmVwYXJlZCBpbnZvY2F0aW9uIHlpZWxkcyBhIHNpbmdsZSB0ZXJtaW5hbCBjb25maXJtYXRpb24gY2FyZCcsICgpID0+IHtcblx0XHRcdC8vIEEgdGVybWluYWwgY29tbWFuZCBzdHJlYW1lZCBpdHMgYXJncywgdGhlbiByZXF1ZXN0ZWQgY29uZmlybWF0aW9uLlxuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHBlbmRpbmc6IEFueVRvb2xDYWxsU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdCYXNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBybSAtcmYgYnVpbGRgJyxcblx0XHRcdFx0dG9vbElucHV0OiAncm0gLXJmIGJ1aWxkJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kPycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZCA9IHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihwZW5kaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdSdW4gY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblxuXHRcdFx0c3RyZWFtaW5nLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nKHByZXBhcmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyZWFtaW5nLnN0YXRlLmdldCgpLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYW5zaXRpb25Gcm9tU3RyZWFtaW5nIHdpdGggYSBub24tY29uZmlybWF0aW9uIHByZXBhcmVkIGludm9jYXRpb24gZ29lcyBzdHJhaWdodCB0byBFeGVjdXRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHJlYW1pbmcgPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHsgdG9vbENhbGxJZDogJ3RjLXJ1bicsIHRvb2xOYW1lOiAncmVhZF9maWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcnVubmluZzogQW55VG9vbENhbGxTdGF0ZSA9IHsgdG9vbENhbGxJZDogJ3RjLXJ1bicsIHRvb2xOYW1lOiAncmVhZF9maWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZScsIHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24ocnVubmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHN0cmVhbWluZy50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdENvbmZpcm1hdGlvbiByZS1hcm1zIGNvbmZpcm1hdGlvbiBmcm9tIEV4ZWN1dGluZyAoQ29waWxvdCBSdW5uaW5nIFx1MjE5MiBQZW5kaW5nQ29uZmlybWF0aW9uKScsICgpID0+IHtcblx0XHRcdC8vIFJlYWwgQ29waWxvdCBmbG93OiBvblRvb2xTdGFydCByZWFkaWVzIHRoZSB0b29sIChSdW5uaW5nL0V4ZWN1dGluZylcblx0XHRcdC8vIGJlZm9yZSB0aGUgcGVybWlzc2lvbiBjYWxsYmFjayBib3VuY2VzIGl0IHRvIFBlbmRpbmdDb25maXJtYXRpb24uXG5cdFx0XHQvLyByZXF1ZXN0Q29uZmlybWF0aW9uIG11c3QgbW92ZSB0aGUgU0FNRSBpbnZvY2F0aW9uIGJhY2sgdG9cblx0XHRcdC8vIFdhaXRpbmdGb3JDb25maXJtYXRpb24gc28gYSBzaW5nbGUgY2FyZCBzcGFucyB0aGUgbGlmZWN5Y2xlLlxuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU3RyZWFtaW5nIFx1MjE5MiBSdW5uaW5nIChjb25maXJtZWQ6IG5vdC1uZWVkZWQpIFx1MjE5MiBFeGVjdXRpbmcuXG5cdFx0XHRjb25zdCBydW5uaW5nOiBBbnlUb29sQ2FsbFN0YXRlID0geyB0b29sQ2FsbElkOiAndGMtdGVybScsIHRvb2xOYW1lOiAnYmFzaCcsIGRpc3BsYXlOYW1lOiAnQmFzaCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjb21tYW5kJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSB9O1xuXHRcdFx0c3RyZWFtaW5nLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihydW5uaW5nKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXG5cdFx0XHQvLyBSdW5uaW5nIFx1MjE5MiBQZW5kaW5nQ29uZmlybWF0aW9uIHZpYSB0aGUgcGVybWlzc2lvbiBjYWxsYmFjay5cblx0XHRcdGNvbnN0IHBlbmRpbmc6IEFueVRvb2xDYWxsU3RhdGUgPSB7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBybSAtcmYgYnVpbGRgJywgdG9vbElucHV0OiAncm0gLXJmIGJ1aWxkJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLCBfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LCBjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kPycgfTtcblx0XHRcdHN0cmVhbWluZy5yZXF1ZXN0Q29uZmlybWF0aW9uKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihwZW5kaW5nKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyZWFtaW5nLnN0YXRlLmdldCgpLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVlc3RDb25maXJtYXRpb24gbm8tb3BzIG9uIGEgY29tcGxldGVkIGludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHJlYW1pbmcgPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHsgdG9vbENhbGxJZDogJ3RjLWRvbmUnLCB0b29sTmFtZTogJ2Jhc2gnLCBkaXNwbGF5TmFtZTogJ0Jhc2gnLCBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyZWFtaW5nLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy1kb25lJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdydW4nLCBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0pLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJlYW1pbmcuZGlkRXhlY3V0ZVRvb2wodW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoc3RyZWFtaW5nKSwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHBlbmRpbmc6IEFueVRvb2xDYWxsU3RhdGUgPSB7IHRvb2xDYWxsSWQ6ICd0Yy1kb25lJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdjb25maXJtJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLCBjb25maXJtYXRpb25UaXRsZTogJ0NvbmZpcm0/JyB9O1xuXHRcdFx0c3RyZWFtaW5nLnJlcXVlc3RDb25maXJtYXRpb24odG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uKHBlbmRpbmcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoc3RyZWFtaW5nKSwgdHJ1ZSwgJ2NvbXBsZXRlZCBpbnZvY2F0aW9uIGlzIG5vdCByZS1hcm1lZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluYWxpemVUb29sSW52b2NhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Jld3JpdGVzIG1hcmtkb3duIGxpbmtzIGluIHBhc3RUZW5zZU1lc3NhZ2UgdGhyb3VnaCB0aGUgYWdlbnQgaG9zdCBzY2hlbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdHJhd0ZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3ZpZXdfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVmlldyBGaWxlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyBtYXJrZG93bjogJ1JlYWQgW2Zvby50c10oZmlsZTovLy9wYXRoL3RvL2Zvby50cyknIH0sXG5cdFx0XHR9IGFzIElDb21wbGV0ZWRUb29sQ2FsbCwgVVJJLmZpbGUoJy8nKSwgJ3NzaF9fbWFjYm9vay1haXInKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSwgJ29iamVjdCcpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSAoaW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlIGFzIHsgdmFsdWU6IHN0cmluZyB9KS52YWx1ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgJ1JlYWQgW10odnNjb2RlLWFnZW50LWhvc3Q6Ly9zc2hfX21hY2Jvb2stYWlyL3BhdGgvdG8vZm9vLnRzP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVzIHB0eSB0ZXJtaW5hbCB0b29sIHdpdGggY29tcGF0aWJpbGl0eSBvdXRwdXQgYW5kIGV4aXQgY29kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGknLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdDQnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGknLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBlY2hvIGhpJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy90NCcsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ291dHB1dCB0ZXh0JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kT3V0cHV0PzogeyB0ZXh0OiBzdHJpbmcgfTsgdGVybWluYWxDb21tYW5kU3RhdGU/OiB7IGV4aXRDb2RlOiBudW1iZXIgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCwgJ291dHB1dCB0ZXh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMoaW52b2NhdGlvbiksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3JtYWxpemVzIHBsYWluLXRleHQgbGluZSBlbmRpbmdzIGZvciB0aGUgZGV0YWNoZWQgdGVybWluYWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICdncmVwIC1uIGZvbycsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy90NScsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdGVzdCB0b29sLi4uJyxcblx0XHRcdFx0dG9vbElucHV0OiAnZ3JlcCAtbiBmb28nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBncmVwIC1uIGZvbycsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdDUnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdsaW5lMVxcbmxpbmUyXFxyXFxubGluZTNcXG4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRPdXRwdXQ/OiB7IHRleHQ6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0Py50ZXh0LCAnbGluZTFcXHJcXG5saW5lMlxcclxcbmxpbmUzXFxyXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZXMgZ2VuZXJpYyB0b29sIHdpdGggaW5wdXQvb3V0cHV0IGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInBhdGhcIjpcIlJFQURNRS5tZFwifScsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdGVzdCB0b29sLi4uJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicGF0aFwiOlwiUkVBRE1FLm1kXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSZWFkIFJFQURNRScsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnIyBWUyBDb2RlJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBkZXRhaWxzID0gSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKGludm9jYXRpb24pO1xuXHRcdFx0YXNzZXJ0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMuaW5wdXQsICd7XCJwYXRoXCI6XCJSRUFETUUubWRcIn0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXQsIFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnIyBWUyBDb2RlJywgaXNUZXh0OiB0cnVlLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nIH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlzRXJyb3IsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplcyBmYWlsZWQgdG9vbCB3aXRoIGVycm9yIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcIm9wZXJhdGlvblwiOlwic2xvd1wifScsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdGVzdCB0b29sLi4uJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1wib3BlcmF0aW9uXCI6XCJzbG93XCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnRmFpbGVkJyxcblx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ3RpbWVvdXQnIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGV0YWlscyA9IElDaGF0VG9vbEludm9jYXRpb24ucmVzdWx0RGV0YWlscyhpbnZvY2F0aW9uKTtcblx0XHRcdGFzc2VydElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlzRXJyb3IsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dCwgW3sgdHlwZTogJ2VtYmVkJywgdmFsdWU6ICd0aW1lb3V0JywgaXNUZXh0OiB0cnVlLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmlsZSBlZGl0cyBmcm9tIGNvbXBsZXRlZCB0b29sIGNhbGwgd2l0aCBGaWxlRWRpdCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdlZGl0X2ZpbGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0VkaXQgRmlsZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRWRpdGluZyBmaWxlLi4uJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdFZGl0ZWQgZmlsZScsXG5cdFx0XHRcdHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyBwYXRoOiAnL2hvbWUvdXNlci9maWxlLnRzJyB9KSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0YmVmb3JlOiB7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvaG9tZS91c2VyL2ZpbGUudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0Y29udGVudDogeyB1cmk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zZXNzaW9uL3NuYXAvYmVmb3JlJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ob21lL3VzZXIvZmlsZS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3Nlc3Npb24vc25hcC9hZnRlcicgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzWzBdLnJlc291cmNlLmZzUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyksICcvaG9tZS91c2VyL2ZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHNbMF0uYmVmb3JlQ29udGVudFVyaT8udG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdhZ2VudGhvc3QtY29udGVudDovLy9zZXNzaW9uL3NuYXAvYmVmb3JlJykudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzWzBdLmFmdGVyQ29udGVudFVyaT8udG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdhZ2VudGhvc3QtY29udGVudDovLy9zZXNzaW9uL3NuYXAvYWZ0ZXInKS50b1N0cmluZygpKTtcblx0XHRcdGFzc2VydC5vayhmaWxlRWRpdHNbMF0udW5kb1N0b3BJZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5wcmVzZW50YXRpb24sIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKGludm9jYXRpb24pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgaGlkZSBwcmVzZW50YXRpb24gd2hlbiB0b29sIHdpdGggZmlsZSBlZGl0cyBmYWlscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyB9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnZWRpdF9maWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0VkaXRpbmcgZmlsZS4uLicsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0ZhaWxlZCB0byBlZGl0Jyxcblx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ3dyaXRlIGVycm9yJyB9LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2hvbWUvdXNlci9maWxlLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc25hcC9hZnRlcicgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW52b2NhdGlvbi5wcmVzZW50YXRpb24sIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZpbGUgZWRpdHMgZm9yIGNhbmNlbGxlZCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGNvbnN0IGZpbGVFZGl0cyA9IGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXRfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nIGZpbGUuLi4nLFxuXHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLkRlbmllZCxcblx0XHRcdFx0cmVhc29uTWVzc2FnZTogJ1VzZXIgY2FuY2VsbGVkJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZWQgc2VhcmNoIHRvb2wga2VlcHMgc2VhcmNoIHJlbmRlcmluZyB3aXRob3V0IGdlbmVyaWMgZGV0YWlscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInF1ZXJ5XCI6XCJ0ZXJtaW5hbFwifScsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnc2VhcmNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdTZWFyY2gnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZy4uLicsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJxdWVyeVwiOlwidGVybWluYWxcIn0nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1NlYXJjaGVkJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdyZXN1bHQnIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzZWFyY2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMoaW52b2NhdGlvbiksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZpbGUgZWRpdHMgd2hlbiB0b29sIGhhcyBubyBGaWxlRWRpdCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiB0ZXN0IHRvb2wnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ291dHB1dCcgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0cy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmaWxlIGVkaXRzIHdoZW4gRmlsZUVkaXQgaGFzIG5vIGJlZm9yZSBvciBhZnRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyB9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnZWRpdF9maWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0VkaXRpbmcgZmlsZS4uLicsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnRWRpdGVkJyxcblx0XHRcdFx0dG9vbElucHV0OiBKU09OLnN0cmluZ2lmeSh7IGNvbnRlbnQ6ICdubyBwYXRoIGZpZWxkJyB9KSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmlsZSBlZGl0IGZvciBjcmVhdGUgKG9ubHkgYWZ0ZXIgcHJlc2VudCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGNvbnN0IGZpbGVFZGl0cyA9IGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2NyZWF0ZV9maWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdDcmVhdGUgRmlsZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQ3JlYXRpbmcgZmlsZS4uLicsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnQ3JlYXRlZCBmaWxlJyxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ob21lL3VzZXIvbmV3LWZpbGUudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0Y29udGVudDogeyB1cmk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zbmFwL2FmdGVyJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHNbMF0ua2luZCwgJ2NyZWF0ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0c1swXS5yZXNvdXJjZS5mc1BhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLCAnL2hvbWUvdXNlci9uZXctZmlsZS50cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0c1swXS5iZWZvcmVDb250ZW50VXJpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZpbGVFZGl0c1swXS5hZnRlckNvbnRlbnRVcmkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHN1YmFnZW50IGNyZWRpdHMgd2hlbiBmaW5hbGl6aW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzID0gMi41O1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5fc3ViYWdlbnQnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBTdWJhZ2VudCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBzdWJhZ2VudC4uLicsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIHN1YmFnZW50Jyxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdjb3BpbG90Oi8vc2Vzc2lvbi9zdWJhZ2VudC90Yy0xJyxcblx0XHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LFxuXHRcdFx0XHRcdHRleHQ6ICdTdWJhZ2VudCByZXN1bHQnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0gYXMgSUNvbXBsZXRlZFRvb2xDYWxsKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGNyZWRpdHM6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRjcmVkaXRzOiAyLjUsXG5cdFx0XHRcdFx0aXNBY3RpdmU6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYWN0aXZlVHVyblRvUHJvZ3Jlc3MnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVBY3RpdmVUdXJuU3RhdGUocmVzcG9uc2VQYXJ0cz86IEFjdGl2ZVR1cm5bJ3Jlc3BvbnNlUGFydHMnXSk6IEFjdGl2ZVR1cm4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICd0dXJuLWFjdGl2ZScsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IG1lc3NhZ2UoJ0RvIHRoaW5ncycpLFxuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiByZXNwb25zZVBhcnRzID8/IFtdLFxuXHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdlbXB0eSBhY3RpdmUgdHVybiBwcm9kdWNlcyBlbXB0eSBwcm9ncmVzcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZSgpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHVzYWdlIHByb2dyZXNzIGZyb20gYWN0aXZlIHR1cm4gdXNhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVUdXJuID0gY3JlYXRlQWN0aXZlVHVyblN0YXRlKCk7XG5cdFx0XHRhY3RpdmVUdXJuLnVzYWdlID0geyBpbnB1dFRva2VuczogMTAwMCwgb3V0cHV0VG9rZW5zOiAyNTAgfTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgYWN0aXZlVHVybiwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHVzYWdlID0gcmVzdWx0WzBdIGFzIElDaGF0VXNhZ2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IGtpbmQ6IHVzYWdlLmtpbmQsIHByb21wdFRva2VuczogdXNhZ2UucHJvbXB0VG9rZW5zLCBjb21wbGV0aW9uVG9rZW5zOiB1c2FnZS5jb21wbGV0aW9uVG9rZW5zIH0sXG5cdFx0XHRcdHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMDAwLCBjb21wbGV0aW9uVG9rZW5zOiAyNTAgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9kdWNlcyBtYXJrZG93biBjb250ZW50IGZvciBzdHJlYW1lZCB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21kLTEnLCBjb250ZW50OiAnSGVsbG8gd29ybGQnIH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ua2luZCwgJ21hcmtkb3duQ29udGVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQpLmNvbnRlbnQudmFsdWUsICdIZWxsbyB3b3JsZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgc3lzdGVtIG5vdGlmaWNhdGlvbiBmb3Igc3lzdGVtIG5vdGlmaWNhdGlvbiByZXNwb25zZSBwYXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiwgY29udGVudDogJ1NoZWxsIGNvbW1hbmQgY29tcGxldGVkJyB9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmtpbmQsICdzeXN0ZW1Ob3RpZmljYXRpb24nKTtcblx0XHRcdGlmIChyZXN1bHRbMF0ua2luZCAhPT0gJ3N5c3RlbU5vdGlmaWNhdGlvbicpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbnRlbnQudmFsdWUsICdTaGVsbCBjb21tYW5kIGNvbXBsZXRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgdGhpbmtpbmcgcHJvZ3Jlc3MgZm9yIHJlYXNvbmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAnci0xJywgY29udGVudDogJ0xldCBtZSB0aGluayBhYm91dCB0aGlzLi4uJyB9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmtpbmQsICd0aGlua2luZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMF0gYXMgSUNoYXRUaGlua2luZ1BhcnQpLmlkLCAnci0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFzb25pbmcgY29tZXMgYmVmb3JlIHN0cmVhbWVkIHRleHQgd2hlbiBvcmRlcmVkIHRoYXQgd2F5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6ICdyLTEnLCBjb250ZW50OiAnSG1tLi4uJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbWQtMScsIGNvbnRlbnQ6ICdSZXN1bHQgdGV4dCcgfSxcblx0XHRcdF0pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5raW5kLCAndGhpbmtpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ua2luZCwgJ21hcmtkb3duQ29udGVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VyaWFsaXplcyBjb21wbGV0ZWQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1kb25lJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmFuIHRlc3QnLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiB0ZXN0IHRvb2wnLFxuXHRcdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRbJ3Rvb2xDYWxsJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ua2luZCwgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBsaXZlIGludm9jYXRpb25zIGZvciBydW5uaW5nIHRvb2wgY2FsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDogY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtcnVubmluZycsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdC8vIExpdmUgQ2hhdFRvb2xJbnZvY2F0aW9uIC0gY2hlY2sgaXQgaGFzIHRoZSByaWdodCB0b29sQ2FsbElkXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcmVzdWx0WzBdIGFzIHsgdG9vbENhbGxJZD86IHN0cmluZzsga2luZD86IHN0cmluZyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbENhbGxJZCwgJ3RjLXJ1bm5pbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2h5ZHJhdGVzIGFub3RoZXIgY2xpZW50IHRvb2wgd2l0aG91dCBhIGNvbmZpcm1hdGlvbiBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGw6IFRvb2xDYWxsUGVuZGluZ0NvbmZpcm1hdGlvblN0YXRlID0ge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtb3RoZXItY2xpZW50Jyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5fdGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biB0YXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1widGFza1wiOlwiYnVpbGRcIn0nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ0FsbG93IFJ1biBUYXNrPycsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ293bmVyLWNsaWVudCcgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsIH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGN1cnJlbnRDbGllbnRJZDogJ3ZpZXdlci1jbGllbnQnLFxuXHRcdFx0XHRjYW5jZWxPdGhlckNsaWVudFRvb2xDYWxsOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSByZXN1bHRbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGtpbmQ6IGludm9jYXRpb24ua2luZCxcblx0XHRcdFx0c3RhdGU6IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiAhIWludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0c3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoeWRyYXRlcyBhbm90aGVyIGNsaWVudCBzdHJlYW1pbmcgdG9vbCB3aXRoIGl0cyBjYW5jZWwgYWZmb3JkYW5jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsOiBUb29sQ2FsbFJlc3BvbnNlUGFydFsndG9vbENhbGwnXSA9IHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW90aGVyLWNsaWVudC1zdHJlYW1pbmcnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1bl90YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnb3duZXItY2xpZW50JyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGwgfSxcblx0XHRcdF0pLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0Y3VycmVudENsaWVudElkOiAndmlld2VyLWNsaWVudCcsXG5cdFx0XHRcdGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHJlc3VsdFswXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdGU6IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiAhIWludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGNvbmZpcm1hdGlvbiBpbnZvY2F0aW9ucyBmb3IgcGVuZGluZyB0b29sIGNvbmZpcm1hdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXBlbmRpbmcnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGNvbW1hbmQnLFxuXHRcdFx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQuSnVkZ2UsXG5cdFx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0cmVhc29uOiAnVGhlIGNvbW1hbmQgcmVtb3ZlcyBhIHByb2plY3QgZmlsZS4nLFxuXHRcdFx0XHRcdFx0XHRzYWZldHk6IDAuMTUsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF0pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0Ly8gUGVuZGluZ0NvbmZpcm1hdGlvbiB0b29scyBoYXZlIGlucHV0LXN0eWxlIHNwZWNpZmljIGRhdGEgKG5vIHRlcm1pbmFsIGNvbnRlbnQgeWV0KVxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHJlc3VsdFswXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRcdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmtpbmQsICdpbnB1dCcpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uID8gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmFsUmVhc29uIDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdUaGUgY29tbWFuZCByZW1vdmVzIGEgcHJvamVjdCBmaWxlLicsXG5cdFx0XHRcdHNhZmV0eTogMC4xNSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBsb2FkaW5nIGNvbmZpcm1hdGlvbiBpbnZvY2F0aW9ucyB3aGlsZSBqdWRnZW1lbnQgaXMgcGVuZGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWp1ZGdpbmcnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IHtcblx0XHRcdFx0XHRraW5kOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZC5KdWRnZSxcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuTG9hZGluZyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uID8gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmFsUmVhc29uIDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogJ2xvYWRpbmcnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGEgcmVuZGVyZWQgY29uZmlybWF0aW9uIHdoZW4gYXN5bmNocm9ub3VzIGp1ZGdlbWVudCBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1qdWRnaW5nJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdCYXNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdFx0a2luZDogVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQuSnVkZ2UsXG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkxvYWRpbmcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGludm9jYXRpb24udXBkYXRlQ29uZmlybWF0aW9uTWVzc2FnZXMoe1xuXHRcdFx0XHR0aXRsZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0bWVzc2FnZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0YXBwcm92YWxSZWFzb246IHtcblx0XHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZScsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb246ICdUaGlzIGNvbW1hbmQgbW9kaWZpZXMgcHJvdGVjdGVkIGZpbGVzLicsXG5cdFx0XHRcdFx0c2FmZXR5OiAwLjEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uID8gc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmFsUmVhc29uIDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlJyxcblx0XHRcdFx0ZXhwbGFuYXRpb246ICdUaGlzIGNvbW1hbmQgbW9kaWZpZXMgcHJvdGVjdGVkIGZpbGVzLicsXG5cdFx0XHRcdHNhZmV0eTogMC4xLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgY3JlYXRlIG1ldGFkYXRhIGFuZCBwcm9wb3NlZCBjb250ZW50IGZvciBwZW5kaW5nIGZpbGUgY29uZmlybWF0aW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNyZWF0ZScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnd3JpdGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1dyaXRlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDcmVhdGluZyBwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQ3JlYXRlIGZpbGU/Jyxcblx0XHRcdFx0ZWRpdHM6IHtcblx0XHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL3BhY2thZ2UuanNvbicsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiAncGVuZGluZy1lZGl0LWNvbnRlbnQ6Ly9zZXNzaW9uL3RjLWNyZWF0ZS9wYWNrYWdlLmpzb24nIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdtb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uJyxcblx0XHRcdFx0b3B0aW9uczogWydBbGxvdyddLFxuXHRcdFx0XHRtb2RpZmllZEZpbGVzOiBbe1xuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvcGFja2FnZS5qc29uJyksXG5cdFx0XHRcdFx0ZWRpdEtpbmQ6ICdjcmVhdGUnLFxuXHRcdFx0XHRcdG9yaWdpbmFsVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kaWZpZWRDb250ZW50VXJpOiB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UoJ3BlbmRpbmctZWRpdC1jb250ZW50Oi8vc2Vzc2lvbi90Yy1jcmVhdGUvcGFja2FnZS5qc29uJyksICdsb2NhbCcpLFxuXHRcdFx0XHRcdG9yaWdpbmFsQ29udGVudFVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGluc2VydGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkZWxldGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0aXRsZTogJ3BhY2thZ2UuanNvbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcvd29ya3NwYWNlL3BhY2thZ2UuanNvbicsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBhbGwgcGFydHMgaW4gY29ycmVjdCBvcmRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAnci0xJywgY29udGVudDogJ1RoaW5raW5nLi4uJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbWQtMScsIGNvbnRlbnQ6ICdPdXRwdXQgc28gZmFyJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDogY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMicsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0NvbmZpcm0nLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdDb25maXJtJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyByZWFzb25pbmcgKyB0ZXh0ICsgdG9vbCBjYWxsICsgcGVuZGluZyBjb25maXJtYXRpb24gPSA0IGl0ZW1zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmtpbmQsICd0aGlua2luZycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5raW5kLCAnbWFya2Rvd25Db250ZW50Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0ZXJtaW5hbCBjb250ZW50IGJsb2NrcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlZCB0b29sIGNhbGwgd2l0aCB0ZXJtaW5hbCBjb250ZW50IGJsb2NrIHNldHMgdGVybWluYWxDb21tYW5kVXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ25wbSB0ZXN0Jyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9hYmMxMjMnLCB0aXRsZTogJ1Rlcm1pbmFsJywgaXNQdHk6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRVcmk/OiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQub2sodGVybURhdGEudGVybWluYWxDb21tYW5kVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkudG9TdHJpbmcoKSwgJ2FnZW50aG9zdC10ZXJtaW5hbDovYWJjMTIzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXJtaW5hbCBjb250ZW50IGJsb2NrIHNraXBzIGJvb2trZWVwaW5nIHRleHQgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dG9vbEtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ25wbSB0ZXN0Jyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9hYmMxMjMnLCB0aXRsZTogJ1Rlcm1pbmFsJywgaXNQdHk6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3RleHQtb3V0cHV0JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kVXJpPzogeyB0b1N0cmluZygpOiBzdHJpbmcgfTsgdGVybWluYWxDb21tYW5kT3V0cHV0PzogeyB0ZXh0OiBzdHJpbmcgfSB9O1xuXHRcdFx0Ly8gVGVybWluYWwgY29udGVudCBibG9jayBVUkkgc2hvdWxkIGJlIHNldFxuXHRcdFx0YXNzZXJ0Lm9rKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0ZXJtaW5hbCBjb21wbGV0aW9uIGV4aXQgY29kZSBmb3IgY29tcGxldGVkIFNESyBzaGVsbCB0b29sIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnZ3RpIHN0YXR1cycsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnY29tbWFuZCBub3QgZm91bmRcXG48c2hlbGxJZDogMTA0IGNvbXBsZXRlZCB3aXRoIGV4aXQgY29kZSAxMjc+JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2NvcGlsb3ROb25QdHlTaGVsbHMvdGMtMScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCBpc1B0eTogZmFsc2UsIHJlc3VsdDogeyBleGl0Q29kZTogMTI3LCBwcmV2aWV3OiAncHJldmlldyBvbmx5XFxuJywgdHJ1bmNhdGVkOiB0cnVlIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAxMjcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCwgJ3ByZXZpZXcgb25seVxcclxcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udHJ1bmNhdGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5vayghdGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0Py50ZXh0LmluY2x1ZGVzKCdzaGVsbElkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGFuIGV4cGxpY2l0bHkgZW1wdHkgbm9uLVBUWSByZXRhaW5lZCBjb21wbGV0aW9uIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3RydWUnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvY29waWxvdE5vblB0eVNoZWxscy90Yy0xJywgdGl0bGU6ICdSdW4gU2hlbGwgQ29tbWFuZCcsIGlzUHR5OiBmYWxzZSwgcmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnJyB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHNlcmlhbGl6ZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQsIHsgdGV4dDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdG9yZSBhbiBleHBsaWNpdGx5IGVtcHR5IFBUWSBjb21wbGV0aW9uIHByZXZpZXcgd2hlbiBpc1B0eSBpcyBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3RydWUnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3B0eS1lbXB0eScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCByZXN1bHQ6IHsgZXhpdENvZGU6IDAsIHByZXZpZXc6ICcnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdXNlIHRleHQgY29udGVudCB3aGVuIGEgdGVybWluYWwgYmxvY2sgb3ducyB0aGUgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VoY28gaGknLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2Jhc2g6IGxpbmUgMTogZWhjbzogY29tbWFuZCBub3QgZm91bmRcXG48c2hlbGxJZDogMTA0IGNvbXBsZXRlZCB3aXRoIGV4aXQgY29kZSAxMjc+JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2NvcGlsb3ROb25QdHlTaGVsbHMvdGMtMScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCBpc1B0eTogZmFsc2UsIHJlc3VsdDogeyBleGl0Q29kZTogMTI3IH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAxMjcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRzIGxlZ2FjeSB0ZXJtaW5hbENvbXBsZXRlIGJsb2NrcyBmcm9tIG9sZCBwZXJzaXN0ZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHQvLyBSZW1vdmVkIGZyb20gdGhlIHByb3RvY29sIGluIEFIUCAwLjcuMDsgbWF5IGxpbmdlciBpbiBvbGQgcGVyc2lzdGVkIHR1cm5zLlxuXHRcdFx0XHRcdHsgdHlwZTogJ3Rlcm1pbmFsQ29tcGxldGUnLCBleGl0Q29kZTogMTI3LCBwcmV2aWV3OiAnbGVnYWN5IHByZXZpZXdcXG4nIH0gYXMgdW5rbm93biBhcyBUb29sUmVzdWx0Q29udGVudCxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHQvLyBUaGUgbGVnYWN5IGJsb2NrJ3MgY29tcGxldGlvbiBkYXRhIGlzIHByZXNlcnZlZCBpbnN0ZWFkIG9mXG5cdFx0XHQvLyBkZWdyYWRpbmcgdG8gdGhlIFRleHQgZmFsbGJhY2sgYW5kIHRoZSB0b29sIHN1Y2Nlc3MgZmxhZy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdsZWdhY3kgcHJldmlld1xcclxcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZSwgMTI3KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIHplcm8gdGVybWluYWwgY29tcGxldGlvbiBleGl0IGNvZGUgYXMgc3VjY2VzcyBmb3IgY29tcGxldGVkIFNESyBzaGVsbCB0b29sIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHsgZXhpdENvZGU6IDAgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB0byB0b29sIHN1Y2Nlc3Mgd2hlbiB0ZXJtaW5hbCBjb21wbGV0aW9uIGhhcyBubyBleGl0IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHt9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgZmFpbGVkIHRvb2wgc3RhdGUgd2hlbiBhbiBvdXRwdXQtb25seSB0ZXJtaW5hbCBoYXMgbm8gc2hlbGwgZXhpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdlY2kgaGknLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJy9iaW4vYmFzaDogZWNpOiBjb21tYW5kIG5vdCBmb3VuZFxcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlLCB7IGV4aXRDb2RlOiAxIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncnVubmluZyB0b29sIGNhbGwgd2l0aCB0ZXJtaW5hbCBjb250ZW50IGJsb2NrIHNldHMgdGVybWluYWxDb21tYW5kVXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnbnBtIHRlc3QnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3J1bm5pbmctdGVybScsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRVcmk/OiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQub2sodGVybURhdGEudGVybWluYWxDb21tYW5kVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkudG9TdHJpbmcoKSwgJ2FnZW50aG9zdC10ZXJtaW5hbDovcnVubmluZy10ZXJtJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZSBwcmVzZXJ2ZXMgdGVybWluYWwgVVJJIGZyb20gY29udGVudCBibG9jaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL2ZpbmFsLXRlcm0nLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9maW5hbC10ZXJtJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFVyaT86IHsgdG9TdHJpbmcoKTogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5vayh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFVyaS50b1N0cmluZygpLCAnYWdlbnRob3N0LXRlcm1pbmFsOi9maW5hbC10ZXJtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplIHVzZXMgdGVybWluYWwgY29tcGxldGlvbiBleGl0IGNvZGUgb3ZlciBTREsgdG9vbCBzdWNjZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnZmFsc2UnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2ZhbHNlJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZmFsc2UnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJycgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHsgZXhpdENvZGU6IDEgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAxKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgndXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZXRzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBjb250ZW50IGFuZCBub3RpZmllcyBzdGF0ZSBvYnNlcnZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHN1YmFnZW50IGNvbnRlbnQgYXJyaXZpbmcgdmlhIENoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXG5cdFx0XHRjb25zdCBydW5uaW5nVGM6IFRvb2xDYWxsUnVubmluZ1N0YXRlID0ge1xuXHRcdFx0XHQuLi50Yyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdjb3BpbG90Oi8vc2Vzc2lvbi9zdWJhZ2VudC90Yy0xJyxcblx0XHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgc3RhdGVDaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bihyID0+IHtcblx0XHRcdFx0aW52b2NhdGlvbi5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRzdGF0ZUNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZUNoYW5nZWQgPSBmYWxzZTsgLy8gcmVzZXQgYWZ0ZXIgaW5pdGlhbCByZWFkXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUNoYW5nZWQsIHRydWUsICdzdGF0ZSBvYnNlcnZlcnMgc2hvdWxkIGJlIG5vdGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCBiZWZvcmUsICd0b29sU3BlY2lmaWNEYXRhIHNob3VsZCBiZSByZXBsYWNlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuYWdlbnROYW1lLCAnZXhwbG9yZScpO1xuXHRcdFx0XHQvLyBkZXNjcmlwdGlvbiBpcyB0aGUgVEFTSyBkZXNjcmlwdGlvbiBmcm9tIF9tZXRhLCBub3QgdGhlIGFnZW50IGRlc2NyaXB0aW9uXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24sICdGaW5kIHJlbGF0ZWQgZmlsZXMnKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHN1YmFnZW50IGNyZWRpdHMgd2hlbiByZWZyZXNoaW5nIHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIHN1YmFnZW50RGVzY3JpcHRpb246ICdGaW5kIHJlbGF0ZWQgZmlsZXMnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgc2Vzc2lvbiBoYW5kbGVyIGhhdmluZyByZWNvcmRlZCB0aGlzIHN1YmFnZW50J3MgY3JlZGl0cy5cblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSAxLjU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnLFxuXHRcdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMsIDEuNSwgJ2NyZWRpdHMgc2hvdWxkIHN1cnZpdmUgYSB0b29sU3BlY2lmaWNEYXRhIHJlZnJlc2gnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBzdWJhZ2VudCBtb2RlbCBuYW1lIHdoZW4gcmVmcmVzaGluZyB0b29sU3BlY2lmaWNEYXRhIGZyb20gY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnc3ViYWdlbnQnKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIHNlc3Npb24gaGFuZGxlciBoYXZpbmcgcmVjb3JkZWQgdGhpcyBzdWJhZ2VudCdzIG1vZGVsLlxuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gJ0NsYXVkZSBTb25uZXQgNCc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnLFxuXHRcdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSwgJ0NsYXVkZSBTb25uZXQgNCcsICdtb2RlbCBuYW1lIHNob3VsZCBzdXJ2aXZlIGEgdG9vbFNwZWNpZmljRGF0YSByZWZyZXNoJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3VudHMgTUNQIEFwcCB0b29sU3BlY2lmaWNEYXRhIHdoZW4gYSBjb25maXJtZWQgTUNQIHRvb2wgc3RhcnRzIHJ1bm5pbmcnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgTUNQIEFwcCBjaGFubmVsIGlzIHByZXNlbnQgaW4gYF9tZXRhLnVpYCBmcm9tIHRoZSBmaXJzdCB0b29sXG5cdFx0XHQvLyBzdGF0ZSAoYSB0b29sIGNhbm5vdCBzdGFydCB1bnRpbCBpdHMgc2VydmVyIGlzIFJlYWR5KSwgYnV0IHRoZSBBcHBcblx0XHRcdC8vIGlzIG9ubHkgbW91bnRlZCBvbmNlIHRoZSB0b29sIGxlYXZlcyBjb25maXJtYXRpb24gYW5kIHN0YXJ0c1xuXHRcdFx0Ly8gcnVubmluZy5cblx0XHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC90ZXN0LXNlc3Npb24tMS9kb2NzJyxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRvcGljXCI6XCJtZXRhZGF0YVwifScsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnZG9jcy1jdXN0b21pemF0aW9uJyB9LFxuXHRcdFx0XHRfbWV0YTogbWV0YSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gQ29uZmlybWF0aW9uIHN0YXRlIGNhcnJpZXMgdGhlIHJhdyBpbnB1dCBidXQgZG9lcyBub3QgbW91bnQgdGhlIEFwcC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7IGtpbmQ6ICdpbnB1dCcsIHJhd0lucHV0OiB7IHRvcGljOiAnbWV0YWRhdGEnIH0gfSk7XG5cblx0XHRcdGxldCBzdGF0ZUNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRvcnVuKHIgPT4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnN0YXRlLnJlYWQocik7XG5cdFx0XHRcdHN0YXRlQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlQ2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbElucHV0OiAne1widG9waWNcIjpcIm1ldGFkYXRhXCJ9Jyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdkb2NzLWN1c3RvbWl6YXRpb24nIH0sXG5cdFx0XHRcdF9tZXRhOiBtZXRhLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVDaGFuZ2VkLCB0cnVlLCAnc3RhdGUgb2JzZXJ2ZXJzIHNob3VsZCBiZSBub3RpZmllZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0cmF3SW5wdXQ6IHsgdG9waWM6ICdtZXRhZGF0YScgfSxcblx0XHRcdFx0bWNwQXBwRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9kb2NzL2FwcCcsXG5cdFx0XHRcdFx0c2VydmVySWQ6ICdkb2NzLWN1c3RvbWl6YXRpb24nLFxuXHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG5vdGlmeSB3aGVuIG5vIHN1YmFnZW50IGNvbnRlbnQgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9O1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBydW5uaW5nVGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgb3JpZ2luYWxEYXRhLCAndG9vbFNwZWNpZmljRGF0YSBzaG91bGQgbm90IGNoYW5nZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVmcmVzaGVzIHRlcm1pbmFsIG91dHB1dCBhcyB0ZXh0IGNvbnRlbnQgc3RyZWFtcyAoYnVpbHQtaW4gYmFzaCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdzbGVlcCAxOyBlY2hvIGhpJyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH0gfSkudGVybWluYWxDb21tYW5kT3V0cHV0LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBydW5uaW5nVGM6IFRvb2xDYWxsUnVubmluZ1N0YXRlID0ge1xuXHRcdFx0XHQuLi50Yyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpXFxuJyB9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdoaVxcclxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIEFIUCB0ZXJtaW5hbCBmaWVsZHMgKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgdGVybWluYWxDb21tYW5kVXJpKSB3aGVuIHJlZnJlc2hpbmcgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIHRoZSByYWNlIHdoZXJlIGBfcmV2aXZlVGVybWluYWxJZk5lZWRlZGAgaGFzIHBvcHVsYXRlZFxuXHRcdFx0Ly8gQUhQIHRlcm1pbmFsIGZpZWxkcyBhbmQgYSBzdWJzZXF1ZW50IGNvbnRlbnQgY2hhbmdlIHRyaWdnZXJzXG5cdFx0XHQvLyBgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGFgLiBUaGUgYXN5bmMtcG9wdWxhdGVkIGZpZWxkc1xuXHRcdFx0Ly8gbXVzdCBzdXJ2aXZlIHRoZSByZWZyZXNoLlxuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGNvbnN0IHJldml2ZVVyaSA9IFVSSS5wYXJzZSgnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3Q5Jyk7XG5cdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZWNobyBoaScgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaGVsbHNjcmlwdCcsXG5cdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogJ3Nlc3Npb24taWQtZnJvbS1yZXZpdmUnLFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRVcmk6IHJldml2ZVVyaSxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQ6ICdjbWQtaWQtZnJvbS1yZXZpdmUnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcnVubmluZ1RjOiBUb29sQ2FsbFJ1bm5pbmdTdGF0ZSA9IHtcblx0XHRcdFx0Li4udGMsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoaVxcbicgfV0sXG5cdFx0XHR9O1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBydW5uaW5nVGMpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnO1xuXHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZFVyaT86IFVSSTtcblx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH07XG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCwgJ3Nlc3Npb24taWQtZnJvbS1yZXZpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmksIHJldml2ZVVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kSWQsICdjbWQtaWQtZnJvbS1yZXZpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdoaVxcclxcbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndXNhZ2VJbmZvVG9RdW90YXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHF1b3RhIHNuYXBzaG90cyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzYWdlSW5mb1RvUXVvdGFzKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VJbmZvVG9RdW90YXMoeyBpbnB1dFRva2VuczogMTAgfSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VJbmZvVG9RdW90YXMoeyBfbWV0YTogeyBjb3N0OiAxIH0gfSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIHByZW1pdW0gYW5kIGNoYXQgc25hcHNob3RzLCBkZXJpdmluZyBhZGRpdGlvbmFsIHVzYWdlIGFuZCByZXNldCBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdXNhZ2VJbmZvVG9RdW90YXMoe1xuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHF1b3RhU25hcHNob3RzOiB7XG5cdFx0XHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRSZXF1ZXN0czogMzAwLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDc1LFxuXHRcdFx0XHRcdFx0XHRyZW1haW5pbmdQZXJjZW50YWdlOiA3NSxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZTogMS41LFxuXHRcdFx0XHRcdFx0XHRvdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cmVzZXREYXRlOiAnMjAyNi0wNy0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjaGF0OiB7XG5cdFx0XHRcdFx0XHRcdGlzVW5saW1pdGVkRW50aXRsZW1lbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGVudGl0bGVtZW50UmVxdWVzdHM6IC0xLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDEwLFxuXHRcdFx0XHRcdFx0XHRyZW1haW5pbmdQZXJjZW50YWdlOiAxMDAsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0cHJlbWl1bUNoYXQ6IHtcblx0XHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiA3NSxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAzMDAsXG5cdFx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IDIyNSxcblx0XHRcdFx0XHRyZXNldEF0OiBEYXRlLnBhcnNlKCcyMDI2LTA3LTAxVDAwOjAwOjAwLjAwMFonKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2hhdDoge1xuXHRcdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDEwMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRxdW90YVJlbWFpbmluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc2V0QXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDEuNSxcblx0XHRcdFx0cmVzZXREYXRlOiAnMjAyNi0wNy0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgY2F0ZWdvcmllcyB3aXRoIG5vIGFsbG9jYXRlZCBlbnRpdGxlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHVzYWdlSW5mb1RvUXVvdGFzKHtcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRxdW90YVNuYXBzaG90czoge1xuXHRcdFx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0aXNVbmxpbWl0ZWRFbnRpdGxlbWVudDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGVudGl0bGVtZW50UmVxdWVzdHM6IDAsXG5cdFx0XHRcdFx0XHRcdHVzZWRSZXF1ZXN0czogMCxcblx0XHRcdFx0XHRcdFx0cmVtYWluaW5nUGVyY2VudGFnZTogMCxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZTogMCxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZUFsbG93ZWRXaXRoRXhoYXVzdGVkUXVvdGE6IGZhbHNlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSAwLWVudGl0bGVtZW50IHByZW1pdW0gc25hcHNob3QgaXMgc2tpcHBlZCwgYnV0IGFkZGl0aW9uYWwtdXNhZ2UgZmllbGRzIGFyZSBzdGlsbCBkZXJpdmVkLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGFkZGl0aW9uYWxVc2FnZUNvdW50OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBhIGNhdGVnb3J5IHdob3NlIHJlbWFpbmluZ1BlcmNlbnRhZ2UgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHVzYWdlSW5mb1RvUXVvdGFzKHtcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRxdW90YVNuYXBzaG90czoge1xuXHRcdFx0XHRcdFx0Y2hhdDoge1xuXHRcdFx0XHRcdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRSZXF1ZXN0czogMTAwLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDEwLFxuXHRcdFx0XHRcdFx0XHQvLyByZW1haW5pbmdQZXJjZW50YWdlIGludGVudGlvbmFsbHkgYWJzZW50IFx1MjAxNCBtdXN0IG5vdCBtYXNxdWVyYWRlIGFzIGV4aGF1c3RlZCAoMCUpLlxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYXV0byA9IHsgbmFtZTogJ0F1dG8nIH07XG5cblx0XHR0ZXN0KCdhcHBlbmRzIHRoZSBiaWxsZWQgbW9kZWwgaWQgd2hlbiBvbmUgaXMgc3VwcGxpZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIHBpY2sgd2hvc2UgYmlsbGVkIG1vZGVsIGlzIHVucmVnaXN0ZXJlZCAoZS5nLiBcIkF1dG9cIiBiaWxsZWQgYXMgXCJyYXB0b3ItbWluaVwiKSBzaG93cyBcIkF1dG8gKHJhcHRvci1taW5pKVwiLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0XHRyZXNvbHZlZE1vZGVsOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sICdyYXB0b3ItbWluaScsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHdpdGhQcmljaW5nOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHsgLi4uYXV0bywgcHJpY2luZzogJzB4JyB9LCAncmFwdG9yLW1pbmknLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR3aXRoQ3JlZGl0czogZm9ybWF0VHVyblJlc3BvbnNlRGV0YWlscyhhdXRvLCAncmFwdG9yLW1pbmknLCB7IF9tZXRhOiB7IGNvc3Q6IDIgfSB9KSxcblx0XHRcdFx0b25lQ3JlZGl0OiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sICdyYXB0b3ItbWluaScsIHsgX21ldGE6IHsgY29zdDogMSB9IH0pLFxuXHRcdFx0XHRub0JpbGxlZE1vZGVsOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSxcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHJlc29sdmVkTW9kZWw6ICdBdXRvIChyYXB0b3ItbWluaSknLFxuXHRcdFx0XHR3aXRoUHJpY2luZzogJ0F1dG8gKHJhcHRvci1taW5pKSBcdTAwQjcgMHgnLFxuXHRcdFx0XHR3aXRoQ3JlZGl0czogJ0F1dG8gKHJhcHRvci1taW5pKSBcdTIwMjIgMiBjcmVkaXRzJyxcblx0XHRcdFx0b25lQ3JlZGl0OiAnQXV0byAocmFwdG9yLW1pbmkpIFx1MjAyMiAxIGNyZWRpdCcsXG5cdFx0XHRcdG5vQmlsbGVkTW9kZWw6ICdBdXRvJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0aGUgcmVnaXN0ZXJlZCBtb2RlbCBuYW1lIGFzLWlzIHdpdGhvdXQgYSBiaWxsZWQgaWQsIHVuZGVmaW5lZCB3aGVuIHVua25vd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb25uZXQgPSB7IG5hbWU6ICdDbGF1ZGUgU29ubmV0IDQuNScsIHByaWNpbmc6ICcxeCcgfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdFx0Y29uY3JldGU6IGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMoc29ubmV0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGNvbmNyZXRlV2l0aENyZWRpdHM6IGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMoc29ubmV0LCB1bmRlZmluZWQsIHsgX21ldGE6IHsgY29zdDogMiB9IH0pLFxuXHRcdFx0XHR1bmtub3duOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHVuZGVmaW5lZCwgJ3JhcHRvci1taW5pJywgeyBfbWV0YTogeyBjb3N0OiAyIH0gfSksXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRjb25jcmV0ZTogJ0NsYXVkZSBTb25uZXQgNC41IFx1MDBCNyAxeCcsXG5cdFx0XHRcdGNvbmNyZXRlV2l0aENyZWRpdHM6ICdDbGF1ZGUgU29ubmV0IDQuNSBcdTIwMjIgMiBjcmVkaXRzJyxcblx0XHRcdFx0dW5rbm93bjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQVc7QUFFcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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
