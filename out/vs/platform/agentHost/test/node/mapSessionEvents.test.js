import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { AgentSession } from "../../common/agentService.js";
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { appendSdkToolResultContent, mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
import { toSessionEvents } from "./copilotTestEvents.js";
suite("mapSessionEvents \u2014 history replay", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  function partKinds(parts) {
    return parts.map((p) => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.SystemNotification ? { kind: p.kind, content: p.content } : { kind: p.kind });
  }
  test("task_complete with a summary renders as a markdown part, not a tool call", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "Working on it.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "task_complete", arguments: { summary: "Done. All good." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.Markdown, content: "Working on it." },
      { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Done. All good." }
    ]);
  });
  test("restores Auto model resolution as usage metadata", async () => {
    const autoModeResolved = {
      chosenModel: "claude-opus-4.8",
      reasoningBucket: "high",
      categoryScores: { reasoning: 0.91, code_gen: 0.72 },
      predictedLabel: "needs_reasoning",
      confidence: 0.93,
      candidateModels: ["claude-opus-4.8", "claude-sonnet-4.6"]
    };
    const events = [
      { type: "user.message", id: "turn-before-auto", data: { interactionId: "m0", content: "First prompt" } },
      { type: "assistant.message", data: { messageId: "m1", content: "First response." } },
      // The runtime resolves Auto while building settings, before it persists
      // the user message for the turn that will use the chosen model.
      { type: "session.auto_mode_resolved", data: autoModeResolved },
      { type: "user.message", id: "turn-auto", data: { interactionId: "m1", content: "Solve this problem" } },
      { type: "assistant.message", data: { messageId: "m2", content: "Done." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, usage: turn.usage })), [
      { id: "turn-before-auto", usage: void 0 },
      {
        id: "turn-auto",
        usage: {
          model: "claude-opus-4.8",
          _meta: { autoModeResolved }
        }
      }
    ]);
  });
  test("task_complete without a summary renders nothing", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "All set.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "task_complete", arguments: {} } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.Markdown, content: "All set." }
    ]);
  });
  test("fallback task_complete marks the turn complete", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "finish the task" } },
      { type: "assistant.message", data: { messageId: "m2", content: "All done.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete", arguments: { summary: "Finished." } }] } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "All done." },
        { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Finished." }
      ]
    }]);
  });
  test("a regular tool still renders as a tool call", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo hi" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "hi\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall }
    ]);
  });
  test("resolves relative patch links in restored tool messages", async () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/file.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch"
    ].join("\n");
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "edit the file" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "apply_patch" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "apply_patch", arguments: patch } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events), URI.file("/workspace"));
    const part = turns[0].responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part);
    assert.deepStrictEqual({
      invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : void 0,
      pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : void 0
    }, {
      invocationMessage: { markdown: "Editing [file.ts](file:///workspace/src/file.ts)" },
      pastTenseMessage: { markdown: "Edited [file.ts](file:///workspace/src/file.ts)" }
    });
  });
  test("restores MCP app data for completed tool calls", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "call an MCP app tool" } },
      {
        type: "assistant.message",
        data: {
          messageId: "m2",
          content: "",
          toolRequests: [{
            toolCallId: "tc-1",
            name: "GitHub-get_me",
            arguments: {},
            type: "function",
            mcpServerName: "GitHub",
            mcpToolName: "get_me"
          }]
        }
      },
      {
        type: "tool.execution_start",
        data: {
          toolCallId: "tc-1",
          toolName: "GitHub-get_me",
          arguments: {},
          mcpServerName: "GitHub",
          mcpToolName: "get_me",
          toolDescription: {
            _meta: {
              ui: {
                resourceUri: "ui://github-mcp-server/get-me"
              }
            }
          }
        }
      },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: { content: '{"login":"octocat"}' }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      contributor: part.toolCall.contributor,
      meta: readToolCallMeta(part.toolCall)
    }, {
      contributor: {
        kind: ToolCallContributorKind.MCP,
        customizationId: "mcp-top-level:copilot:test-session:GitHub"
      },
      meta: {
        mcpServerName: "GitHub",
        mcpToolName: "get_me",
        ui: {
          resourceUri: "ui://github-mcp-server/get-me",
          channel: "mcp://copilot/test-session/GitHub"
        }
      }
    });
  });
  test("derives shell tool intention from the description argument on replay", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "ls", description: "List files in the repo root" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "a\nb\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.intention, "List files in the repo root");
  });
  test("maps SDK shell_exit content to terminal completion on replayed tool completion", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo hi" } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "hi\n",
            contents: [{ type: "shell_exit", shellId: "0", exitCode: 0, cwd: "/repo", outputPreview: "hi\n" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.deepStrictEqual(part.toolCall.content, [
      { type: ToolResultContentType.Text, text: "hi\n" },
      {
        type: ToolResultContentType.Terminal,
        resource: "agenthost-terminal://shell/test-session/tc-1",
        title: "Run Shell Command",
        isPty: false,
        result: { exitCode: 0, preview: "hi\n" }
      }
    ]);
  });
  test("preserves non-zero terminal completion even when SDK tool completion succeeded", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "gti status" } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "command not found\n",
            contents: [{ type: "shell_exit", shellId: "0", exitCode: 127, cwd: "/repo" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.strictEqual(part.toolCall.success, true);
    assert.deepStrictEqual(part.toolCall.content?.find((content) => content.type === ToolResultContentType.Terminal), {
      type: ToolResultContentType.Terminal,
      resource: "agenthost-terminal://shell/test-session/tc-1",
      title: "Run Shell Command",
      isPty: false,
      result: { exitCode: 127 }
    });
  });
  test("restores best-effort model, fallback agent, and attachments onto user messages", async () => {
    const events = [
      { type: "session.model_change", data: { newModel: "opus-4.7" } },
      { type: "subagent.selected", data: { agentName: "reviewer", agentDisplayName: "Reviewer", tools: null } },
      {
        type: "user.message",
        data: {
          interactionId: "m1",
          content: "hi",
          attachments: [{
            type: "file",
            path: "/tmp/example.ts",
            displayName: "example.ts"
          }]
        }
      },
      { type: "assistant.message", data: { messageId: "m2", content: "hello" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events), {
      model: { id: "fallback-model" },
      agent: { uri: "fallback-agent" }
    });
    assert.deepStrictEqual({
      model: turns[0].message.model,
      agent: turns[0].message.agent,
      attachments: turns[0].message.attachments?.map((a) => ({
        type: a.type,
        uri: a.type === MessageAttachmentKind.Resource ? a.uri : void 0,
        label: a.label
      }))
    }, {
      model: { id: "opus-4.7" },
      agent: { uri: "fallback-agent" },
      attachments: [{
        type: MessageAttachmentKind.Resource,
        uri: "file:///tmp/example.ts",
        label: "example.ts"
      }]
    });
  });
  test("uses top-level user messages as turn boundaries", async () => {
    const events = [
      { type: "user.message", id: "user-event-1", data: { interactionId: "interaction-1", content: "Investigate this issue" } },
      { type: "assistant.message", id: "initial-round", data: { interactionId: "interaction-1", content: "I found a likely cause.", toolRequests: [] } },
      { type: "assistant.message", id: "tool-round", data: { interactionId: "interaction-2", content: "I will verify it.", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo investigating" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "investigating\n" } } },
      { type: "assistant.message", id: "empty-round", data: { interactionId: "interaction-2", content: "", toolRequests: [], reasoningOpaque: "opaque-reasoning" } },
      { type: "assistant.message", id: "final-round", data: { interactionId: "interaction-2", content: "Investigation complete.", toolRequests: [] } },
      { type: "user.message", id: "user-event-2", data: { interactionId: "interaction-3", content: "Thanks" } },
      { type: "assistant.message", id: "acknowledgement", data: { interactionId: "interaction-3", content: "You are welcome.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [
      {
        id: "user-event-1",
        message: "Investigate this issue",
        state: TurnState.Complete,
        parts: [
          { kind: ResponsePartKind.Markdown, content: "I found a likely cause." },
          { kind: ResponsePartKind.Markdown, content: "I will verify it." },
          { kind: ResponsePartKind.ToolCall },
          { kind: ResponsePartKind.Markdown, content: "Investigation complete." }
        ]
      },
      {
        id: "user-event-2",
        message: "Thanks",
        state: TurnState.Complete,
        parts: [
          { kind: ResponsePartKind.Markdown, content: "You are welcome." }
        ]
      }
    ]);
  });
  test("restores a system notification inside an assistant turn as a response part", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Wait for the background command" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nShell command completed\n</system_notification>",
          kind: { type: "shell_completed", shellId: "shell-a", exitCode: 0, description: "sleep 6" }
        }
      },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "Reading the output now.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      message: { text: "Wait for the background command", origin: { kind: MessageKind.User } },
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.SystemNotification, content: "`sleep 6` completed" },
        { kind: ResponsePartKind.Markdown, content: "Reading the output now." }
      ]
    }]);
  });
  test("restores an idle system notification as a system-initiated turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Start the background agent" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "The background agent is running.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nAgent completed\n</system_notification>",
          kind: { type: "agent_idle", agentId: "agent-a", agentType: "general-purpose" }
        }
      },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-2" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "Reading the background agent result.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [
      {
        id: "user-event",
        message: { text: "Start the background agent", origin: { kind: MessageKind.User } },
        state: TurnState.Complete,
        parts: [{ kind: ResponsePartKind.Markdown, content: "The background agent is running." }]
      },
      {
        id: "notification-event",
        message: { text: "Background agent agent-a is complete", origin: { kind: MessageKind.SystemNotification } },
        state: TurnState.Complete,
        parts: [{ kind: ResponsePartKind.Markdown, content: "Reading the background agent result." }]
      }
    ]);
  });
  test("does not restore a passive notification outside an assistant turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Check for instructions" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "No new instructions.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nInstruction discovered\n</system_notification>",
          kind: { type: "instruction_discovered", sourcePath: "AGENTS.md", triggerFile: "src/index.ts", triggerTool: "view", description: "Workspace instructions" }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      parts: [{ kind: ResponsePartKind.Markdown, content: "No new instructions." }]
    }]);
  });
  test("synthetic user messages do not start a new turn", async () => {
    const events = [
      { type: "user.message", id: "user-event-1", data: { interactionId: "interaction-1", content: "Use the skill" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "I will use it.", toolRequests: [] } },
      { type: "user.message", id: "synthetic-event", data: { interactionId: "interaction-2", content: "Injected skill content", source: "skill" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "The skill is complete.", toolRequests: [] } },
      { type: "user.message", id: "user-event-2", data: { interactionId: "interaction-3", content: "Thanks" } },
      { type: "assistant.message", data: { interactionId: "interaction-3", content: "You are welcome.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      parts: partKinds(turn.responseParts)
    })), [
      {
        id: "user-event-1",
        message: "Use the skill",
        parts: [
          { kind: ResponsePartKind.Markdown, content: "I will use it." },
          { kind: ResponsePartKind.Markdown, content: "The skill is complete." }
        ]
      },
      {
        id: "user-event-2",
        message: "Thanks",
        parts: [
          { kind: ResponsePartKind.Markdown, content: "You are welcome." }
        ]
      }
    ]);
  });
  test("terminal empty assistant message completes a tool-only turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Close out the todos" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [{ toolCallId: "tc-1", name: "todo" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "todo", arguments: { status: "done" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      message: "Close out the todos",
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    }]);
  });
  test("tool-only turn without a terminal assistant message remains cancelled", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Run the command" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo done" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "done\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    }]);
  });
  test("abort remains terminal for the turn", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "interaction-1", content: "Wait for the task" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "The task is complete.", toolRequests: [] } },
      { type: "abort", data: { reason: "user initiated" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "Late completion.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "The task is complete." },
        { kind: ResponsePartKind.Markdown, content: "Late completion." }
      ]
    }]);
  });
  test("restores turn timing from the SDK event envelopes", async () => {
    const events = [
      { type: "user.message", id: "turn-1", timestamp: "2026-07-29T10:00:00.000Z", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:00:03.500Z", data: { messageId: "m2", content: "First answer." } },
      { type: "user.message", id: "turn-2", timestamp: "2026-07-29T10:05:00.000Z", data: { interactionId: "m3", content: "second" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:05:01.000Z", data: { messageId: "m4", content: "Second answer." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: "2026-07-29T10:00:00.000Z", duration: 3500 },
      { id: "turn-2", startedAt: "2026-07-29T10:05:00.000Z", duration: 1e3 }
    ]);
  });
  test("bounds turn duration by the last event belonging to the turn", async () => {
    const events = [
      { type: "user.message", id: "turn-1", timestamp: "2026-07-29T10:00:00.000Z", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.turn_start", timestamp: "2026-07-29T10:00:00.500Z", data: { turnId: "t1" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:00:03.500Z", data: { messageId: "m2", content: "First answer." } },
      { type: "assistant.turn_end", timestamp: "2026-07-29T10:00:04.000Z", data: { turnId: "t1" } },
      // Ignored by the mapper an hour later: it must not extend the turn.
      { type: "session.unrelated_event", timestamp: "2026-07-29T11:00:00.000Z" }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: "2026-07-29T10:00:00.000Z", duration: 4e3 }
    ]);
  });
  test("leaves turn timing undefined when envelopes carry no usable timestamp", async () => {
    const events = [
      { type: "user.message", id: "turn-1", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.message", timestamp: "not-a-date", data: { messageId: "m2", content: "First answer." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: void 0, duration: void 0 }
    ]);
  });
});
suite("mapSessionEvents \u2014 subagent routing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  function partKinds(parts) {
    return parts.map((p) => p.kind === ResponsePartKind.Markdown ? { kind: p.kind, content: p.content } : { kind: p.kind });
  }
  test("routes subagent events tagged with envelope agentId into the subagent transcript", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "user.message", agentId: "agent-1", data: { interactionId: "subagent-prompt", content: "Inspect the implementation." } },
      // Inner subagent message + tool call, tagged only with the
      // envelope-level agentId (no data.parentToolCallId).
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "", toolRequests: [{ toolCallId: "tc-inner", name: "bash" }] } },
      { type: "tool.execution_start", agentId: "agent-1", data: { toolCallId: "tc-inner", toolName: "bash", arguments: { command: "ls" } } },
      { type: "tool.execution_complete", agentId: "agent-1", data: { toolCallId: "tc-inner", success: true, result: { content: "a\nb\n" } } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m4", content: "Subagent is done." } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: true } },
      { type: "assistant.message", data: { messageId: "m5", content: "Here is what the subagent found." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall },
      { kind: ResponsePartKind.Markdown, content: "Here is what the subagent found." }
    ]);
    const subagentTurns = subagentTurnsByToolCallId.get("tc-task");
    assert.ok(subagentTurns, "Expected subagent turns for tc-task");
    assert.strictEqual(subagentTurns.length, 1);
    assert.strictEqual(subagentTurns[0].message.text, "Inspect the implementation.");
    assert.deepStrictEqual(partKinds(subagentTurns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall },
      { kind: ResponsePartKind.Markdown, content: "Subagent is done." }
    ]);
  });
  test("drops subagent user messages whose agentId cannot be mapped", async () => {
    const events = [
      { type: "user.message", id: "root-message", data: { interactionId: "m1", content: "Continue the task" } },
      { type: "user.message", id: "orphan-subagent-message", agentId: "unknown-agent", data: { interactionId: "m2", content: "Delegated prompt" } },
      { type: "assistant.message", data: { messageId: "m3", content: "Done." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual({
      turns: turns.map((turn) => ({
        id: turn.id,
        message: turn.message.text,
        parts: partKinds(turn.responseParts)
      })),
      subagentTurns: [...subagentTurnsByToolCallId]
    }, {
      turns: [{
        id: "root-message",
        message: "Continue the task",
        parts: [{ kind: ResponsePartKind.Markdown, content: "Done." }]
      }],
      subagentTurns: []
    });
  });
  test("routes subagent skill events into the subagent transcript", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "skill.invoked", agentId: "agent-1", data: { name: "research", path: "/skills/research" } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: true } },
      { type: "assistant.message", data: { messageId: "m3", content: "The subagent finished." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual({
      parentState: turns[0].state,
      parentParts: partKinds(turns[0].responseParts),
      subagentParts: partKinds(subagentTurnsByToolCallId.get("tc-task")?.[0].responseParts ?? [])
    }, {
      parentState: TurnState.Complete,
      parentParts: [
        { kind: ResponsePartKind.ToolCall },
        { kind: ResponsePartKind.Markdown, content: "The subagent finished." }
      ],
      subagentParts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    });
  });
  test("subagent abort marks the subagent turn cancelled", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Partial result." } },
      { type: "abort", agentId: "agent-1", data: { reason: "user initiated" } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: false } },
      { type: "assistant.message", data: { messageId: "m4", content: "The subagent was cancelled." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const subagentTurn = subagentTurnsByToolCallId.get("tc-task")?.[0];
    assert.deepStrictEqual({
      parentState: turns[0].state,
      subagentState: subagentTurn?.state,
      subagentParts: partKinds(subagentTurn?.responseParts ?? [])
    }, {
      parentState: TurnState.Complete,
      subagentState: TurnState.Cancelled,
      subagentParts: [
        { kind: ResponsePartKind.Markdown, content: "Partial result." }
      ]
    });
  });
  test("subagent abort before its first response remains cancelled", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "abort", agentId: "agent-1", data: { reason: "user initiated" } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Late partial result." } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: false } },
      { type: "assistant.message", data: { messageId: "m4", content: "The subagent was cancelled." } }
    ];
    const { subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const subagentTurn = subagentTurnsByToolCallId.get("tc-task")?.[0];
    assert.deepStrictEqual({
      state: subagentTurn?.state,
      parts: partKinds(subagentTurn?.responseParts ?? [])
    }, {
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Late partial result." }
      ]
    });
  });
});
suite("appendSdkToolResultContent", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("folds shell_exit into an existing terminal block instead of adding a second one", () => {
    const content = [
      { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/abc", title: "Bash" }
    ];
    const result = appendSdkToolResultContent(content, [
      { type: "shell_exit", shellId: "0", exitCode: 2, outputPreview: "boom\n", outputTruncated: false }
    ], { session: AgentSession.uri("copilot", "test-session"), toolCallId: "tc-1", title: "Run Shell Command" });
    assert.deepStrictEqual(result, { shellId: "0", result: { exitCode: 2, preview: "boom\n", truncated: false } });
    assert.deepStrictEqual(content, [
      {
        type: ToolResultContentType.Terminal,
        resource: "agenthost-terminal://shell/abc",
        title: "Bash",
        result: { exitCode: 2, preview: "boom\n", truncated: false }
      }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvbWFwU2Vzc2lvbkV2ZW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgU3RyaW5nT3JNYXJrZG93biwgdHlwZSBUb29sQ2FsbFJlc3BvbnNlUGFydCwgdHlwZSBUb29sUmVzdWx0Q29udGVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQsIG1hcFNlc3Npb25FdmVudHMgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyB0b1Nlc3Npb25FdmVudHMsIHR5cGUgSVNlc3Npb25FdmVudCB9IGZyb20gJy4vY29waWxvdFRlc3RFdmVudHMuanMnO1xuXG5zdWl0ZSgnbWFwU2Vzc2lvbkV2ZW50cyBcdTIwMTQgaGlzdG9yeSByZXBsYXknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAndGVzdC1zZXNzaW9uJyk7XG5cblx0ZnVuY3Rpb24gcGFydEtpbmRzKHBhcnRzOiByZWFkb25seSBSZXNwb25zZVBhcnRbXSk6IEFycmF5PHsga2luZDogUmVzcG9uc2VQYXJ0S2luZDsgY29udGVudD86IFN0cmluZ09yTWFya2Rvd24gfT4ge1xuXHRcdHJldHVybiBwYXJ0cy5tYXAocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gfHwgcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiA/IHsga2luZDogcC5raW5kLCBjb250ZW50OiBwLmNvbnRlbnQgfSA6IHsga2luZDogcC5raW5kIH0pO1xuXHR9XG5cblx0dGVzdCgndGFza19jb21wbGV0ZSB3aXRoIGEgc3VtbWFyeSByZW5kZXJzIGFzIGEgbWFya2Rvd24gcGFydCwgbm90IGEgdG9vbCBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnaGknIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdXb3JraW5nIG9uIGl0LicsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAndGFza19jb21wbGV0ZScgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd0YXNrX2NvbXBsZXRlJywgYXJndW1lbnRzOiB7IHN1bW1hcnk6ICdEb25lLiBBbGwgZ29vZC4nIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyh0dXJuc1swXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnV29ya2luZyBvbiBpdC4nIH0sXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdcXG5cXG4qKlRhc2sgY29tcGxldGVkOioqIERvbmUuIEFsbCBnb29kLicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgQXV0byBtb2RlbCByZXNvbHV0aW9uIGFzIHVzYWdlIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9Nb2RlUmVzb2x2ZWQgPSB7XG5cdFx0XHRjaG9zZW5Nb2RlbDogJ2NsYXVkZS1vcHVzLTQuOCcsXG5cdFx0XHRyZWFzb25pbmdCdWNrZXQ6ICdoaWdoJyxcblx0XHRcdGNhdGVnb3J5U2NvcmVzOiB7IHJlYXNvbmluZzogMC45MSwgY29kZV9nZW46IDAuNzIgfSxcblx0XHRcdHByZWRpY3RlZExhYmVsOiAnbmVlZHNfcmVhc29uaW5nJyxcblx0XHRcdGNvbmZpZGVuY2U6IDAuOTMsXG5cdFx0XHRjYW5kaWRhdGVNb2RlbHM6IFsnY2xhdWRlLW9wdXMtNC44JywgJ2NsYXVkZS1zb25uZXQtNC42J10sXG5cdFx0fTtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndHVybi1iZWZvcmUtYXV0bycsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20wJywgY29udGVudDogJ0ZpcnN0IHByb21wdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20xJywgY29udGVudDogJ0ZpcnN0IHJlc3BvbnNlLicgfSB9LFxuXHRcdFx0Ly8gVGhlIHJ1bnRpbWUgcmVzb2x2ZXMgQXV0byB3aGlsZSBidWlsZGluZyBzZXR0aW5ncywgYmVmb3JlIGl0IHBlcnNpc3RzXG5cdFx0XHQvLyB0aGUgdXNlciBtZXNzYWdlIGZvciB0aGUgdHVybiB0aGF0IHdpbGwgdXNlIHRoZSBjaG9zZW4gbW9kZWwuXG5cdFx0XHR7IHR5cGU6ICdzZXNzaW9uLmF1dG9fbW9kZV9yZXNvbHZlZCcsIGRhdGE6IGF1dG9Nb2RlUmVzb2x2ZWQgfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndHVybi1hdXRvJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnU29sdmUgdGhpcyBwcm9ibGVtJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnRG9uZS4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHsgaWQ6IHR1cm4uaWQsIHVzYWdlOiB0dXJuLnVzYWdlIH0pKSwgW1xuXHRcdFx0eyBpZDogJ3R1cm4tYmVmb3JlLWF1dG8nLCB1c2FnZTogdW5kZWZpbmVkIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndHVybi1hdXRvJyxcblx0XHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0XHRtb2RlbDogJ2NsYXVkZS1vcHVzLTQuOCcsXG5cdFx0XHRcdFx0X21ldGE6IHsgYXV0b01vZGVSZXNvbHZlZCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndGFza19jb21wbGV0ZSB3aXRob3V0IGEgc3VtbWFyeSByZW5kZXJzIG5vdGhpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdoaScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ0FsbCBzZXQuJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICd0YXNrX2NvbXBsZXRlJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3Rhc2tfY29tcGxldGUnLCBhcmd1bWVudHM6IHt9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0S2luZHModHVybnNbMF0ucmVzcG9uc2VQYXJ0cyksIFtcblx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0FsbCBzZXQuJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxsYmFjayB0YXNrX2NvbXBsZXRlIG1hcmtzIHRoZSB0dXJuIGNvbXBsZXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnZmluaXNoIHRoZSB0YXNrJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnQWxsIGRvbmUuJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICd0YXNrX2NvbXBsZXRlJywgYXJndW1lbnRzOiB7IHN1bW1hcnk6ICdGaW5pc2hlZC4nIH0gfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFt7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnQWxsIGRvbmUuJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdcXG5cXG4qKlRhc2sgY29tcGxldGVkOioqIEZpbmlzaGVkLicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHJlZ3VsYXIgdG9vbCBzdGlsbCByZW5kZXJzIGFzIGEgdG9vbCBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnaGknIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnZWNobyBoaScgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ2hpXFxuJyB9IH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydEtpbmRzKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMpLCBbXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgcmVsYXRpdmUgcGF0Y2ggbGlua3MgaW4gcmVzdG9yZWQgdG9vbCBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdCcqKiogQmVnaW4gUGF0Y2gnLFxuXHRcdFx0JyoqKiBVcGRhdGUgRmlsZTogc3JjL2ZpbGUudHMnLFxuXHRcdFx0J0BAJyxcblx0XHRcdCctb2xkJyxcblx0XHRcdCcrbmV3Jyxcblx0XHRcdCcqKiogRW5kIFBhdGNoJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnZWRpdCB0aGUgZmlsZScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAnYXBwbHlfcGF0Y2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnYXBwbHlfcGF0Y2gnLCBhcmd1bWVudHM6IHBhdGNoIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cyksIFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5vayhwYXJ0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnBhc3RUZW5zZU1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdFZGl0aW5nIFtmaWxlLnRzXShmaWxlOi8vL3dvcmtzcGFjZS9zcmMvZmlsZS50cyknIH0sXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB7IG1hcmtkb3duOiAnRWRpdGVkIFtmaWxlLnRzXShmaWxlOi8vL3dvcmtzcGFjZS9zcmMvZmlsZS50cyknIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIE1DUCBhcHAgZGF0YSBmb3IgY29tcGxldGVkIHRvb2wgY2FsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdjYWxsIGFuIE1DUCBhcHAgdG9vbCcgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0bWVzc2FnZUlkOiAnbTInLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdHRvb2xSZXF1ZXN0czogW3tcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRcdG5hbWU6ICdHaXRIdWItZ2V0X21lJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czoge30sXG5cdFx0XHRcdFx0XHR0eXBlOiAnZnVuY3Rpb24nLFxuXHRcdFx0XHRcdFx0bWNwU2VydmVyTmFtZTogJ0dpdEh1YicsXG5cdFx0XHRcdFx0XHRtY3BUb29sTmFtZTogJ2dldF9tZScsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiAnR2l0SHViLWdldF9tZScsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiB7fSxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnR2l0SHViJyxcblx0XHRcdFx0XHRtY3BUb29sTmFtZTogJ2dldF9tZScsXG5cdFx0XHRcdFx0dG9vbERlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9naXRodWItbWNwLXNlcnZlci9nZXQtbWUnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBjb250ZW50OiAne1wibG9naW5cIjpcIm9jdG9jYXRcIn0nIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb250cmlidXRvcjogcGFydC50b29sQ2FsbC5jb250cmlidXRvcixcblx0XHRcdG1ldGE6IHJlYWRUb29sQ2FsbE1ldGEocGFydC50b29sQ2FsbCksXG5cdFx0fSwge1xuXHRcdFx0Y29udHJpYnV0b3I6IHtcblx0XHRcdFx0a2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uSWQ6ICdtY3AtdG9wLWxldmVsOmNvcGlsb3Q6dGVzdC1zZXNzaW9uOkdpdEh1YicsXG5cdFx0XHR9LFxuXHRcdFx0bWV0YToge1xuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnR2l0SHViJyxcblx0XHRcdFx0bWNwVG9vbE5hbWU6ICdnZXRfbWUnLFxuXHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9naXRodWItbWNwLXNlcnZlci9nZXQtbWUnLFxuXHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi9HaXRIdWInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVyaXZlcyBzaGVsbCB0b29sIGludGVudGlvbiBmcm9tIHRoZSBkZXNjcmlwdGlvbiBhcmd1bWVudCBvbiByZXBsYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdoaScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAnYmFzaCcgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdiYXNoJywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdscycsIGRlc2NyaXB0aW9uOiAnTGlzdCBmaWxlcyBpbiB0aGUgcmVwbyByb290JyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnYVxcbmJcXG4nIH0gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuaW50ZW50aW9uLCAnTGlzdCBmaWxlcyBpbiB0aGUgcmVwbyByb290Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgU0RLIHNoZWxsX2V4aXQgY29udGVudCB0byB0ZXJtaW5hbCBjb21wbGV0aW9uIG9uIHJlcGxheWVkIHRvb2wgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdiYXNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGknIH0gfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnaGlcXG4nLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFt7IHR5cGU6ICdzaGVsbF9leGl0Jywgc2hlbGxJZDogJzAnLCBleGl0Q29kZTogMCwgY3dkOiAnL3JlcG8nLCBvdXRwdXRQcmV2aWV3OiAnaGlcXG4nIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdGlmIChwYXJ0LnRvb2xDYWxsLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7IHJldHVybjsgfVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC50b29sQ2FsbC5jb250ZW50LCBbXG5cdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGlcXG4nIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCxcblx0XHRcdFx0cmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC90ZXN0LXNlc3Npb24vdGMtMScsXG5cdFx0XHRcdHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2hpXFxuJyB9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5vbi16ZXJvIHRlcm1pbmFsIGNvbXBsZXRpb24gZXZlbiB3aGVuIFNESyB0b29sIGNvbXBsZXRpb24gc3VjY2VlZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnaGknIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnZ3RpIHN0YXR1cycgfSB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6ICdjb21tYW5kIG5vdCBmb3VuZFxcbicsXG5cdFx0XHRcdFx0XHRjb250ZW50czogW3sgdHlwZTogJ3NoZWxsX2V4aXQnLCBzaGVsbElkOiAnMCcsIGV4aXRDb2RlOiAxMjcsIGN3ZDogJy9yZXBvJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdIGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnRvb2xDYWxsLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRpZiAocGFydC50b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkgeyByZXR1cm47IH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC50b29sQ2FsbC5zdWNjZXNzLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuY29udGVudD8uZmluZChjb250ZW50ID0+IGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsKSwge1xuXHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0cmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC90ZXN0LXNlc3Npb24vdGMtMScsXG5cdFx0XHR0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJyxcblx0XHRcdGlzUHR5OiBmYWxzZSxcblx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMTI3IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGJlc3QtZWZmb3J0IG1vZGVsLCBmYWxsYmFjayBhZ2VudCwgYW5kIGF0dGFjaG1lbnRzIG9udG8gdXNlciBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3Nlc3Npb24ubW9kZWxfY2hhbmdlJywgZGF0YTogeyBuZXdNb2RlbDogJ29wdXMtNC43JyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdzdWJhZ2VudC5zZWxlY3RlZCcsIGRhdGE6IHsgYWdlbnROYW1lOiAncmV2aWV3ZXInLCBhZ2VudERpc3BsYXlOYW1lOiAnUmV2aWV3ZXInLCB0b29sczogbnVsbCB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0aW50ZXJhY3Rpb25JZDogJ20xJyxcblx0XHRcdFx0XHRjb250ZW50OiAnaGknLFxuXHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ2ZpbGUnLFxuXHRcdFx0XHRcdFx0cGF0aDogJy90bXAvZXhhbXBsZS50cycsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ2V4YW1wbGUudHMnLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ2hlbGxvJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSwge1xuXHRcdFx0bW9kZWw6IHsgaWQ6ICdmYWxsYmFjay1tb2RlbCcgfSxcblx0XHRcdGFnZW50OiB7IHVyaTogJ2ZhbGxiYWNrLWFnZW50JyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbDogdHVybnNbMF0ubWVzc2FnZS5tb2RlbCxcblx0XHRcdGFnZW50OiB0dXJuc1swXS5tZXNzYWdlLmFnZW50LFxuXHRcdFx0YXR0YWNobWVudHM6IHR1cm5zWzBdLm1lc3NhZ2UuYXR0YWNobWVudHM/Lm1hcChhID0+ICh7XG5cdFx0XHRcdHR5cGU6IGEudHlwZSxcblx0XHRcdFx0dXJpOiBhLnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSA/IGEudXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRsYWJlbDogYS5sYWJlbCxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRtb2RlbDogeyBpZDogJ29wdXMtNC43JyB9LFxuXHRcdFx0YWdlbnQ6IHsgdXJpOiAnZmFsbGJhY2stYWdlbnQnIH0sXG5cdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0XHR1cmk6ICdmaWxlOi8vL3RtcC9leGFtcGxlLnRzJyxcblx0XHRcdFx0bGFiZWw6ICdleGFtcGxlLnRzJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRvcC1sZXZlbCB1c2VyIG1lc3NhZ2VzIGFzIHR1cm4gYm91bmRhcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudC0xJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdJbnZlc3RpZ2F0ZSB0aGlzIGlzc3VlJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGlkOiAnaW5pdGlhbC1yb3VuZCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnSSBmb3VuZCBhIGxpa2VseSBjYXVzZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgaWQ6ICd0b29sLXJvdW5kJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMicsIGNvbnRlbnQ6ICdJIHdpbGwgdmVyaWZ5IGl0LicsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAnYmFzaCcgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdiYXNoJywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGludmVzdGlnYXRpbmcnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdpbnZlc3RpZ2F0aW5nXFxuJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgaWQ6ICdlbXB0eS1yb3VuZCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbXSwgcmVhc29uaW5nT3BhcXVlOiAnb3BhcXVlLXJlYXNvbmluZycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBpZDogJ2ZpbmFsLXJvdW5kJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMicsIGNvbnRlbnQ6ICdJbnZlc3RpZ2F0aW9uIGNvbXBsZXRlLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd1c2VyLWV2ZW50LTInLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0zJywgY29udGVudDogJ1RoYW5rcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBpZDogJ2Fja25vd2xlZGdlbWVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTMnLCBjb250ZW50OiAnWW91IGFyZSB3ZWxjb21lLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQtMScsXG5cdFx0XHRcdG1lc3NhZ2U6ICdJbnZlc3RpZ2F0ZSB0aGlzIGlzc3VlJyxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0cGFydHM6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdJIGZvdW5kIGEgbGlrZWx5IGNhdXNlLicgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdJIHdpbGwgdmVyaWZ5IGl0LicgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdJbnZlc3RpZ2F0aW9uIGNvbXBsZXRlLicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndXNlci1ldmVudC0yJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoYW5rcycsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnWW91IGFyZSB3ZWxjb21lLicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGEgc3lzdGVtIG5vdGlmaWNhdGlvbiBpbnNpZGUgYW4gYXNzaXN0YW50IHR1cm4gYXMgYSByZXNwb25zZSBwYXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd1c2VyLWV2ZW50JywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdXYWl0IGZvciB0aGUgYmFja2dyb3VuZCBjb21tYW5kJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQudHVybl9zdGFydCcsIGRhdGE6IHsgdHVybklkOiAnMCcsIGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzeXN0ZW0ubm90aWZpY2F0aW9uJyxcblx0XHRcdFx0aWQ6ICdub3RpZmljYXRpb24tZXZlbnQnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzxzeXN0ZW1fbm90aWZpY2F0aW9uPlxcblNoZWxsIGNvbW1hbmQgY29tcGxldGVkXFxuPC9zeXN0ZW1fbm90aWZpY2F0aW9uPicsXG5cdFx0XHRcdFx0a2luZDogeyB0eXBlOiAnc2hlbGxfY29tcGxldGVkJywgc2hlbGxJZDogJ3NoZWxsLWEnLCBleGl0Q29kZTogMCwgZGVzY3JpcHRpb246ICdzbGVlcCA2JyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdSZWFkaW5nIHRoZSBvdXRwdXQgbm93LicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgZGF0YTogeyB0dXJuSWQ6ICcwJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZSxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiAndXNlci1ldmVudCcsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdXYWl0IGZvciB0aGUgYmFja2dyb3VuZCBjb21tYW5kJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sIGNvbnRlbnQ6ICdgc2xlZXAgNmAgY29tcGxldGVkJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdSZWFkaW5nIHRoZSBvdXRwdXQgbm93LicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhbiBpZGxlIHN5c3RlbSBub3RpZmljYXRpb24gYXMgYSBzeXN0ZW0taW5pdGlhdGVkIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ1N0YXJ0IHRoZSBiYWNrZ3JvdW5kIGFnZW50JyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQudHVybl9zdGFydCcsIGRhdGE6IHsgdHVybklkOiAnMCcsIGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnVGhlIGJhY2tncm91bmQgYWdlbnQgaXMgcnVubmluZy4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC50dXJuX2VuZCcsIGRhdGE6IHsgdHVybklkOiAnMCcgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3lzdGVtLm5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdGlkOiAnbm90aWZpY2F0aW9uLWV2ZW50Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICc8c3lzdGVtX25vdGlmaWNhdGlvbj5cXG5BZ2VudCBjb21wbGV0ZWRcXG48L3N5c3RlbV9ub3RpZmljYXRpb24+Jyxcblx0XHRcdFx0XHRraW5kOiB7IHR5cGU6ICdhZ2VudF9pZGxlJywgYWdlbnRJZDogJ2FnZW50LWEnLCBhZ2VudFR5cGU6ICdnZW5lcmFsLXB1cnBvc2UnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fc3RhcnQnLCBkYXRhOiB7IHR1cm5JZDogJzAnLCBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJ1JlYWRpbmcgdGhlIGJhY2tncm91bmQgYWdlbnQgcmVzdWx0LicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgZGF0YTogeyB0dXJuSWQ6ICcwJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZSxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdTdGFydCB0aGUgYmFja2dyb3VuZCBhZ2VudCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0cGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdUaGUgYmFja2dyb3VuZCBhZ2VudCBpcyBydW5uaW5nLicgfV0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGlmaWNhdGlvbi1ldmVudCcsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0JhY2tncm91bmQgYWdlbnQgYWdlbnQtYSBpcyBjb21wbGV0ZScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb24gfSB9LFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRwYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1JlYWRpbmcgdGhlIGJhY2tncm91bmQgYWdlbnQgcmVzdWx0LicgfV0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXN0b3JlIGEgcGFzc2l2ZSBub3RpZmljYXRpb24gb3V0c2lkZSBhbiBhc3Npc3RhbnQgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnQ2hlY2sgZm9yIGluc3RydWN0aW9ucycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fc3RhcnQnLCBkYXRhOiB7IHR1cm5JZDogJzAnLCBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ05vIG5ldyBpbnN0cnVjdGlvbnMuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQudHVybl9lbmQnLCBkYXRhOiB7IHR1cm5JZDogJzAnIH0gfSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N5c3RlbS5ub3RpZmljYXRpb24nLFxuXHRcdFx0XHRpZDogJ25vdGlmaWNhdGlvbi1ldmVudCcsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRjb250ZW50OiAnPHN5c3RlbV9ub3RpZmljYXRpb24+XFxuSW5zdHJ1Y3Rpb24gZGlzY292ZXJlZFxcbjwvc3lzdGVtX25vdGlmaWNhdGlvbj4nLFxuXHRcdFx0XHRcdGtpbmQ6IHsgdHlwZTogJ2luc3RydWN0aW9uX2Rpc2NvdmVyZWQnLCBzb3VyY2VQYXRoOiAnQUdFTlRTLm1kJywgdHJpZ2dlckZpbGU6ICdzcmMvaW5kZXgudHMnLCB0cmlnZ2VyVG9vbDogJ3ZpZXcnLCBkZXNjcmlwdGlvbjogJ1dvcmtzcGFjZSBpbnN0cnVjdGlvbnMnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICd1c2VyLWV2ZW50Jyxcblx0XHRcdHBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnTm8gbmV3IGluc3RydWN0aW9ucy4nIH1dLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc3ludGhldGljIHVzZXIgbWVzc2FnZXMgZG8gbm90IHN0YXJ0IGEgbmV3IHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQtMScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnVXNlIHRoZSBza2lsbCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0kgd2lsbCB1c2UgaXQuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3N5bnRoZXRpYy1ldmVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnSW5qZWN0ZWQgc2tpbGwgY29udGVudCcsIHNvdXJjZTogJ3NraWxsJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnVGhlIHNraWxsIGlzIGNvbXBsZXRlLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd1c2VyLWV2ZW50LTInLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0zJywgY29udGVudDogJ1RoYW5rcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0zJywgY29udGVudDogJ1lvdSBhcmUgd2VsY29tZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0bWVzc2FnZTogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndXNlci1ldmVudC0xJyxcblx0XHRcdFx0bWVzc2FnZTogJ1VzZSB0aGUgc2tpbGwnLFxuXHRcdFx0XHRwYXJ0czogW1xuXHRcdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0kgd2lsbCB1c2UgaXQuJyB9LFxuXHRcdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1RoZSBza2lsbCBpcyBjb21wbGV0ZS4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQtMicsXG5cdFx0XHRcdG1lc3NhZ2U6ICdUaGFua3MnLFxuXHRcdFx0XHRwYXJ0czogW1xuXHRcdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1lvdSBhcmUgd2VsY29tZS4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXJtaW5hbCBlbXB0eSBhc3Npc3RhbnQgbWVzc2FnZSBjb21wbGV0ZXMgYSB0b29sLW9ubHkgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnQ2xvc2Ugb3V0IHRoZSB0b2RvcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAndG9kbycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd0b2RvJywgYXJndW1lbnRzOiB7IHN0YXR1czogJ2RvbmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICd1c2VyLWV2ZW50Jyxcblx0XHRcdG1lc3NhZ2U6ICdDbG9zZSBvdXQgdGhlIHRvZG9zJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sLW9ubHkgdHVybiB3aXRob3V0IGEgdGVybWluYWwgYXNzaXN0YW50IG1lc3NhZ2UgcmVtYWlucyBjYW5jZWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ1J1biB0aGUgY29tbWFuZCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAnYmFzaCcgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdiYXNoJywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGRvbmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdkb25lXFxuJyB9IH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW3tcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYWJvcnQgcmVtYWlucyB0ZXJtaW5hbCBmb3IgdGhlIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ1dhaXQgZm9yIHRoZSB0YXNrJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnVGhlIHRhc2sgaXMgY29tcGxldGUuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhYm9ydCcsIGRhdGE6IHsgcmVhc29uOiAndXNlciBpbml0aWF0ZWQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMicsIGNvbnRlbnQ6ICdMYXRlIGNvbXBsZXRpb24uJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFt7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1RoZSB0YXNrIGlzIGNvbXBsZXRlLicgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnTGF0ZSBjb21wbGV0aW9uLicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0dXJuIHRpbWluZyBmcm9tIHRoZSBTREsgZXZlbnQgZW52ZWxvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjAwMFonLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAzLjUwMFonLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ0ZpcnN0IGFuc3dlci4nIH0gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndHVybi0yJywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMDowNTowMC4wMDBaJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTMnLCBjb250ZW50OiAnc2Vjb25kJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIHRpbWVzdGFtcDogJzIwMjYtMDctMjlUMTA6MDU6MDEuMDAwWicsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTQnLCBjb250ZW50OiAnU2Vjb25kIGFuc3dlci4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHsgaWQ6IHR1cm4uaWQsIHN0YXJ0ZWRBdDogdHVybi5zdGFydGVkQXQsIGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uIH0pKSwgW1xuXHRcdFx0eyBpZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjYtMDctMjlUMTA6MDA6MDAuMDAwWicsIGR1cmF0aW9uOiAzNTAwIH0sXG5cdFx0XHR7IGlkOiAndHVybi0yJywgc3RhcnRlZEF0OiAnMjAyNi0wNy0yOVQxMDowNTowMC4wMDBaJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIHR1cm4gZHVyYXRpb24gYnkgdGhlIGxhc3QgZXZlbnQgYmVsb25naW5nIHRvIHRoZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjAwMFonLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fc3RhcnQnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjUwMFonLCBkYXRhOiB7IHR1cm5JZDogJ3QxJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIHRpbWVzdGFtcDogJzIwMjYtMDctMjlUMTA6MDA6MDMuNTAwWicsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnRmlyc3QgYW5zd2VyLicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMDowMDowNC4wMDBaJywgZGF0YTogeyB0dXJuSWQ6ICd0MScgfSB9LFxuXHRcdFx0Ly8gSWdub3JlZCBieSB0aGUgbWFwcGVyIGFuIGhvdXIgbGF0ZXI6IGl0IG11c3Qgbm90IGV4dGVuZCB0aGUgdHVybi5cblx0XHRcdHsgdHlwZTogJ3Nlc3Npb24udW5yZWxhdGVkX2V2ZW50JywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMTowMDowMC4wMDBaJyB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoeyBpZDogdHVybi5pZCwgc3RhcnRlZEF0OiB0dXJuLnN0YXJ0ZWRBdCwgZHVyYXRpb246IHR1cm4uZHVyYXRpb24gfSkpLCBbXG5cdFx0XHR7IGlkOiAndHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNi0wNy0yOVQxMDowMDowMC4wMDBaJywgZHVyYXRpb246IDQwMDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHR1cm4gdGltaW5nIHVuZGVmaW5lZCB3aGVuIGVudmVsb3BlcyBjYXJyeSBubyB1c2FibGUgdGltZXN0YW1wJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCB0aW1lc3RhbXA6ICdub3QtYS1kYXRlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdGaXJzdCBhbnN3ZXIuJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCBzdGFydGVkQXQ6IHR1cm4uc3RhcnRlZEF0LCBkdXJhdGlvbjogdHVybi5kdXJhdGlvbiB9KSksIFtcblx0XHRcdHsgaWQ6ICd0dXJuLTEnLCBzdGFydGVkQXQ6IHVuZGVmaW5lZCwgZHVyYXRpb246IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbWFwU2Vzc2lvbkV2ZW50cyBcdTIwMTQgc3ViYWdlbnQgcm91dGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKTtcblxuXHRmdW5jdGlvbiBwYXJ0S2luZHMocGFydHM6IHJlYWRvbmx5IFJlc3BvbnNlUGFydFtdKTogQXJyYXk8eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kOyBjb250ZW50Pzogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4gcGFydHMubWFwKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8geyBraW5kOiBwLmtpbmQsIGNvbnRlbnQ6IHAuY29udGVudCB9IDogeyBraW5kOiBwLmtpbmQgfSk7XG5cdH1cblxuXHQvLyBUaGUgU0RLIG1pZ3JhdGVkIHN1YmFnZW50IGNvcnJlbGF0aW9uIGZyb20gdGhlIGRlcHJlY2F0ZWRcblx0Ly8gYGRhdGEucGFyZW50VG9vbENhbGxJZGAgdG8gYW4gZW52ZWxvcGUtbGV2ZWwgYGFnZW50SWRgLiBOZXdlciBzZXNzaW9uXG5cdC8vIGxvZ3Mgb25seSBjYXJyeSBgYWdlbnRJZGAsIHNvIHRoZSByZXBsYXkgcGF0aCBtdXN0IHJvdXRlIHRob3NlIGV2ZW50c1xuXHQvLyBpbnRvIHRoZSBzdWJhZ2VudCB0cmFuc2NyaXB0IHJhdGhlciB0aGFuIGxlYWtpbmcgdGhlbSBpbnRvIHRoZSBwYXJlbnQuXG5cdHRlc3QoJ3JvdXRlcyBzdWJhZ2VudCBldmVudHMgdGFnZ2VkIHdpdGggZW52ZWxvcGUgYWdlbnRJZCBpbnRvIHRoZSBzdWJhZ2VudCB0cmFuc2NyaXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnc3Bhd24gYSBzdWJhZ2VudCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBuYW1lOiAndGFzaycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgdG9vbE5hbWU6ICd0YXNrJywgYXJndW1lbnRzOiB7IGRlc2NyaXB0aW9uOiAnZXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc3RhcnRlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdzdWJhZ2VudC1wcm9tcHQnLCBjb250ZW50OiAnSW5zcGVjdCB0aGUgaW1wbGVtZW50YXRpb24uJyB9IH0sXG5cdFx0XHQvLyBJbm5lciBzdWJhZ2VudCBtZXNzYWdlICsgdG9vbCBjYWxsLCB0YWdnZWQgb25seSB3aXRoIHRoZVxuXHRcdFx0Ly8gZW52ZWxvcGUtbGV2ZWwgYWdlbnRJZCAobm8gZGF0YS5wYXJlbnRUb29sQ2FsbElkKS5cblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20zJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnbHMnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdhXFxuYlxcbicgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtNCcsIGNvbnRlbnQ6ICdTdWJhZ2VudCBpcyBkb25lLicgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTUnLCBjb250ZW50OiAnSGVyZSBpcyB3aGF0IHRoZSBzdWJhZ2VudCBmb3VuZC4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucywgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdC8vIFRoZSBwYXJlbnQgdHJhbnNjcmlwdCBtdXN0IGNvbnRhaW4gZXhhY3RseSB0aGUgdXNlciB0dXJuIHdpdGggdGhlXG5cdFx0Ly8gdGFzayB0b29sIGNhbGwgYW5kIHRoZSBmaW5hbCBwYXJlbnQgYXNzaXN0YW50IG1lc3NhZ2UgXHUyMDE0IHRoZVxuXHRcdC8vIHN1YmFnZW50J3MgaW5uZXIgbWVzc2FnZSBtdXN0IE5PVCBhcHBlYXIgYXMgYW4gZXh0cmEgdHVybi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyh0dXJuc1swXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdIZXJlIGlzIHdoYXQgdGhlIHN1YmFnZW50IGZvdW5kLicgfSxcblx0XHRdKTtcblxuXHRcdC8vIFRoZSBzdWJhZ2VudCdzIGlubmVyIGNvbnRlbnQgaXMgcm91dGVkIHRvIGl0cyBvd24gdHJhbnNjcmlwdCBrZXllZFxuXHRcdC8vIGJ5IHRoZSBwYXJlbnQgdGFzayB0b29sIGNhbGwgaWQuXG5cdFx0Y29uc3Qgc3ViYWdlbnRUdXJucyA9IHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQuZ2V0KCd0Yy10YXNrJyk7XG5cdFx0YXNzZXJ0Lm9rKHN1YmFnZW50VHVybnMsICdFeHBlY3RlZCBzdWJhZ2VudCB0dXJucyBmb3IgdGMtdGFzaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJhZ2VudFR1cm5zIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJhZ2VudFR1cm5zIVswXS5tZXNzYWdlLnRleHQsICdJbnNwZWN0IHRoZSBpbXBsZW1lbnRhdGlvbi4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyhzdWJhZ2VudFR1cm5zIVswXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdTdWJhZ2VudCBpcyBkb25lLicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgc3ViYWdlbnQgdXNlciBtZXNzYWdlcyB3aG9zZSBhZ2VudElkIGNhbm5vdCBiZSBtYXBwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3Jvb3QtbWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ0NvbnRpbnVlIHRoZSB0YXNrJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ29ycGhhbi1zdWJhZ2VudC1tZXNzYWdlJywgYWdlbnRJZDogJ3Vua25vd24tYWdlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMicsIGNvbnRlbnQ6ICdEZWxlZ2F0ZWQgcHJvbXB0JyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTMnLCBjb250ZW50OiAnRG9uZS4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucywgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHVybnM6IHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdFx0fSkpLFxuXHRcdFx0c3ViYWdlbnRUdXJuczogWy4uLnN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWRdLFxuXHRcdH0sIHtcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3Jvb3QtbWVzc2FnZScsXG5cdFx0XHRcdG1lc3NhZ2U6ICdDb250aW51ZSB0aGUgdGFzaycsXG5cdFx0XHRcdHBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnRG9uZS4nIH1dLFxuXHRcdFx0fV0sXG5cdFx0XHRzdWJhZ2VudFR1cm5zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm91dGVzIHN1YmFnZW50IHNraWxsIGV2ZW50cyBpbnRvIHRoZSBzdWJhZ2VudCB0cmFuc2NyaXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnc3Bhd24gYSBzdWJhZ2VudCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBuYW1lOiAndGFzaycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgdG9vbE5hbWU6ICd0YXNrJywgYXJndW1lbnRzOiB7IGRlc2NyaXB0aW9uOiAnZXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc3RhcnRlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnc2tpbGwuaW52b2tlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBuYW1lOiAncmVzZWFyY2gnLCBwYXRoOiAnL3NraWxscy9yZXNlYXJjaCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTMnLCBjb250ZW50OiAnVGhlIHN1YmFnZW50IGZpbmlzaGVkLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXJlbnRTdGF0ZTogdHVybnNbMF0uc3RhdGUsXG5cdFx0XHRwYXJlbnRQYXJ0czogcGFydEtpbmRzKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMpLFxuXHRcdFx0c3ViYWdlbnRQYXJ0czogcGFydEtpbmRzKHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQuZ2V0KCd0Yy10YXNrJyk/LlswXS5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0cGFyZW50UGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1RoZSBzdWJhZ2VudCBmaW5pc2hlZC4nIH0sXG5cdFx0XHRdLFxuXHRcdFx0c3ViYWdlbnRQYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YmFnZW50IGFib3J0IG1hcmtzIHRoZSBzdWJhZ2VudCB0dXJuIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ3NwYXduIGEgc3ViYWdlbnQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgbmFtZTogJ3Rhc2snIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHRvb2xOYW1lOiAndGFzaycsIGFyZ3VtZW50czogeyBkZXNjcmlwdGlvbjogJ2V4cGxvcmUnLCBhZ2VudE5hbWU6ICdleHBsb3JlJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3N1YmFnZW50LnN0YXJ0ZWQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20zJywgY29udGVudDogJ1BhcnRpYWwgcmVzdWx0LicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYWJvcnQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgcmVhc29uOiAndXNlciBpbml0aWF0ZWQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHN1Y2Nlc3M6IGZhbHNlIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtNCcsIGNvbnRlbnQ6ICdUaGUgc3ViYWdlbnQgd2FzIGNhbmNlbGxlZC4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucywgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblx0XHRjb25zdCBzdWJhZ2VudFR1cm4gPSBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldCgndGMtdGFzaycpPy5bMF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhcmVudFN0YXRlOiB0dXJuc1swXS5zdGF0ZSxcblx0XHRcdHN1YmFnZW50U3RhdGU6IHN1YmFnZW50VHVybj8uc3RhdGUsXG5cdFx0XHRzdWJhZ2VudFBhcnRzOiBwYXJ0S2luZHMoc3ViYWdlbnRUdXJuPy5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0c3ViYWdlbnRTdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHN1YmFnZW50UGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnUGFydGlhbCByZXN1bHQuJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnQgYWJvcnQgYmVmb3JlIGl0cyBmaXJzdCByZXNwb25zZSByZW1haW5zIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ3NwYXduIGEgc3ViYWdlbnQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgbmFtZTogJ3Rhc2snIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHRvb2xOYW1lOiAndGFzaycsIGFyZ3VtZW50czogeyBkZXNjcmlwdGlvbjogJ2V4cGxvcmUnLCBhZ2VudE5hbWU6ICdleHBsb3JlJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3N1YmFnZW50LnN0YXJ0ZWQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fib3J0JywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IHJlYXNvbjogJ3VzZXIgaW5pdGlhdGVkJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMycsIGNvbnRlbnQ6ICdMYXRlIHBhcnRpYWwgcmVzdWx0LicgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogZmFsc2UgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ200JywgY29udGVudDogJ1RoZSBzdWJhZ2VudCB3YXMgY2FuY2VsbGVkLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRUdXJuID0gc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZC5nZXQoJ3RjLXRhc2snKT8uWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0ZTogc3ViYWdlbnRUdXJuPy5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHMoc3ViYWdlbnRUdXJuPy5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0xhdGUgcGFydGlhbCByZXN1bHQuJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2FwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZvbGRzIHNoZWxsX2V4aXQgaW50byBhbiBleGlzdGluZyB0ZXJtaW5hbCBibG9jayBpbnN0ZWFkIG9mIGFkZGluZyBhIHNlY29uZCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2FiYycsIHRpdGxlOiAnQmFzaCcgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQoY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiAnc2hlbGxfZXhpdCcsIHNoZWxsSWQ6ICcwJywgZXhpdENvZGU6IDIsIG91dHB1dFByZXZpZXc6ICdib29tXFxuJywgb3V0cHV0VHJ1bmNhdGVkOiBmYWxzZSB9LFxuXHRcdF0sIHsgc2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKSwgdG9vbENhbGxJZDogJ3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHNoZWxsSWQ6ICcwJywgcmVzdWx0OiB7IGV4aXRDb2RlOiAyLCBwcmV2aWV3OiAnYm9vbVxcbicsIHRydW5jYXRlZDogZmFsc2UgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRlbnQsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0XHRyZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2FiYycsXG5cdFx0XHRcdHRpdGxlOiAnQmFzaCcsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMiwgcHJldmlldzogJ2Jvb21cXG4nLCB0cnVuY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0XHR9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
