import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { URI } from "../../../../base/common/uri.js";
import { NullLogService } from "../../../log/common/log.js";
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/protocol/state.js";
import { mapSessionMessagesToTurns, missingPromptPlaceholder, resolveForkAnchorUuid } from "../../node/claude/claudeReplayMapper.js";
suite("claudeReplayMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  const session = URI.parse("claude:/sess-1");
  function makeUser(uuid, text, timestamp) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "text", text }] },
      timestamp
    };
  }
  function makeAssistantText(uuid, text, timestamp) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "text", text }] },
      timestamp
    };
  }
  function makeAssistantToolUse(uuid, toolUseId, name, input = {}, timestamp) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: {
        id: `msg_${uuid}`,
        role: "assistant",
        content: [{ type: "tool_use", id: toolUseId, name, input }]
      },
      timestamp
    };
  }
  function makeUserToolResult(uuid, toolUseId, text, isError = false, timestamp) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: text, ...isError ? { is_error: true } : {} }]
      },
      timestamp
    };
  }
  function makeSystem(uuid, subtype, text) {
    return {
      type: "system",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { subtype, ...text !== void 0 ? { text } : {} }
    };
  }
  test("Fixture 1: single text turn", () => {
    const messages = [
      makeUser("u1", "hello"),
      makeAssistantText("a1", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].id, "u1", "Turn.id MUST equal user SessionMessage.uuid");
    assert.strictEqual(turns[0].message.text, "hello");
    assert.strictEqual(turns[0].usage, void 0, "replay never has usage");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.Markdown);
    if (part.kind === ResponsePartKind.Markdown) {
      assert.strictEqual(part.content, "world");
    }
  });
  test("restores turn timing from persisted message timestamps", () => {
    const messages = [
      makeUser("u1", "hello", "2026-07-09T18:00:00.000Z"),
      makeAssistantText("a1", "world", "2026-07-09T18:00:02.500Z")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual({
      startedAt: turns[0].startedAt,
      duration: turns[0].duration
    }, {
      startedAt: "2026-07-09T18:00:00.000Z",
      duration: 2500
    });
  });
  test("leaves turn timing unknown when persisted timestamps are missing or invalid", () => {
    const messages = [
      makeUser("u1", "hello", "invalid"),
      makeAssistantText("a1", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual({
      startedAt: turns[0].startedAt,
      duration: turns[0].duration
    }, {
      startedAt: void 0,
      duration: void 0
    });
  });
  test("Fixture 2: tool_use + tool_result is one Turn with one Completed ToolCall", () => {
    const messages = [
      makeUser("u1", "list files"),
      makeAssistantToolUse("a1", "tu1", "Bash", { command: "ls" }),
      makeUserToolResult("synthetic1", "tu1", "file1.txt\nfile2.txt"),
      makeAssistantText("a2", "two files")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "tool_result MUST NOT start a new turn");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    const toolCallParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
    assert.strictEqual(toolCallParts.length, 1);
    const toolCall = toolCallParts[0];
    assert.strictEqual(toolCall.kind, ResponsePartKind.ToolCall);
    if (toolCall.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCall.toolCall.status, ToolCallStatus.Completed);
      assert.strictEqual(toolCall.toolCall.toolName, "Bash");
      if (toolCall.toolCall.status === ToolCallStatus.Completed) {
        assert.strictEqual(toolCall.toolCall.success, true);
        assert.deepStrictEqual(toolCall.toolCall.content, [{ type: ToolResultContentType.Text, text: "file1.txt\nfile2.txt" }]);
      }
    }
  });
  test("replay preserves generic semantics for client tools that collide with built-in names", () => {
    const messages = [
      makeUser("u1", "run client tools"),
      makeAssistantToolUse("a1", "tu_bash", "mcp__client__Bash", { command: "echo client" }),
      makeUserToolResult("r1", "tu_bash", "done"),
      makeAssistantToolUse("a2", "tu_task", "mcp__client__Task", { description: "client task" }),
      makeUserToolResult("r2", "tu_task", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const tools = turns[0].responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => {
      assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
      return {
        toolName: part.toolCall.toolName,
        displayName: part.toolCall.displayName,
        meta: part.toolCall._meta,
        invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : void 0,
        toolInput: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.toolInput : void 0,
        pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : void 0,
        hasSubagentContent: part.toolCall.status === ToolCallStatus.Completed && part.toolCall.content?.some((content) => content.type === ToolResultContentType.Subagent)
      };
    });
    assert.deepStrictEqual(tools, [
      {
        toolName: "Bash",
        displayName: "Bash",
        meta: void 0,
        invocationMessage: "Bash",
        toolInput: '{\n  "command": "echo client"\n}',
        pastTenseMessage: "Bash",
        hasSubagentContent: false
      },
      {
        toolName: "Task",
        displayName: "Task",
        meta: void 0,
        invocationMessage: "Task",
        toolInput: '{\n  "description": "client task"\n}',
        pastTenseMessage: "Task",
        hasSubagentContent: false
      }
    ]);
  });
  test("Fixture 3: multi-turn produces ordered Turns", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantText("a1", "reply 1"),
      makeUser("u2", "second"),
      makeAssistantText("a2", "reply 2")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2);
    assert.strictEqual(turns[0].id, "u1");
    assert.strictEqual(turns[1].id, "u2");
  });
  test("Fixture 4: compact_boundary attaches as SystemNotification on the active turn", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantText("a1", "reply 1"),
      makeSystem("s1", "compact_boundary", "context compacted"),
      makeAssistantText("a2", "reply 2")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "compact_boundary is NOT a turn boundary");
    const sysParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.SystemNotification);
    assert.strictEqual(sysParts.length, 1);
  });
  test("Fixture 5: Task / Agent tool_use produces subagent marker", () => {
    const messages = [
      makeUser("u1", "spawn subagent"),
      makeAssistantToolUse("a1", "tu1", "Task", { description: "do thing" }),
      makeUserToolResult("synthetic1", "tu1", "subagent done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const toolCallPart = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolCallPart, "expected a ToolCall part");
    if (toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, "subagent");
      if (toolCallPart.toolCall.status === ToolCallStatus.Completed) {
        const hasSubagentMarker = toolCallPart.toolCall.content?.some((c) => c.type === ToolResultContentType.Subagent);
        assert.strictEqual(hasSubagentMarker, true, "subagent marker block must be present");
      } else {
        assert.fail(`expected Completed status, got ${toolCallPart.toolCall.status}`);
      }
    }
  });
  test("Fixture 5b: Agent tool name also recognised as subagent", () => {
    const messages = [
      makeUser("u1", "spawn subagent"),
      makeAssistantToolUse("a1", "tu1", "Agent", { description: "do thing" }),
      makeUserToolResult("synthetic1", "tu1", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const toolCallPart = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall);
    if (toolCallPart.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, "subagent");
    }
  });
  test("Fixture 6: tail Turn with orphan tool_use is Cancelled", () => {
    const messages = [
      makeUser("u1", "do work"),
      makeAssistantToolUse("a1", "tu-orphan", "Bash", { command: "sleep 100" })
      // no matching tool_result — model crashed mid-turn
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].state, TurnState.Cancelled);
  });
  test("Fixture 6b: orphan in turn N does NOT cancel turn N+1", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantToolUse("a1", "tu-orphan", "Bash", {}),
      // no tool_result for tu-orphan
      makeUser("u2", "second"),
      makeAssistantText("a2", "clean reply")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2);
    assert.strictEqual(turns[0].state, TurnState.Cancelled, "turn 1 has orphan");
    assert.strictEqual(turns[1].state, TurnState.Complete, "turn 2 has no orphan");
  });
  test("late tool results do not extend the active turn duration", () => {
    const messages = [
      makeUser("u1", "first", "2026-07-09T18:00:00.000Z"),
      makeAssistantToolUse("a1", "tu-late", "Bash", {}, "2026-07-09T18:00:01.000Z"),
      makeUser("u2", "second", "2026-07-09T18:00:10.000Z"),
      makeAssistantText("a2", "clean reply", "2026-07-09T18:00:12.000Z"),
      makeUserToolResult("late-result", "tu-late", "done", false, "2026-07-09T18:00:20.000Z")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual(turns.map((turn) => turn.duration), [1e3, 2e3]);
  });
  test("Fixture 7: non-allowlisted system subtypes are dropped", () => {
    const messages = [
      makeUser("u1", "go"),
      makeAssistantText("a1", "reply"),
      makeSystem("s1", "api_retry", "retrying"),
      makeSystem("s2", "hook_started", "hook x")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const sysParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.SystemNotification);
    assert.strictEqual(sysParts.length, 0);
  });
  test("Fixture 9: CLI slash-command echo and local-command-stdout entries are dropped", () => {
    const messages = [
      makeUser("u1", "what model are you"),
      makeAssistantText("a1", "sonnet"),
      {
        type: "user",
        uuid: "echo-1",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args>claude-opus-4.7</command-args>" }
      },
      {
        type: "user",
        uuid: "echo-2",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<local-command-stdout>Set model to claude-opus-4.7</local-command-stdout>" }
      },
      makeUser("u2", "how about now"),
      makeAssistantText("a2", "opus")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2, "CLI-echo user envelopes must NOT start new turns");
    assert.strictEqual(turns[0].id, "u1");
    assert.strictEqual(turns[0].message.text, "what model are you");
    assert.strictEqual(turns[1].id, "u2");
    assert.strictEqual(turns[1].message.text, "how about now");
  });
  test("Fixture 10: prompt-less subagent transcript (inner messages) maps to one turn", () => {
    const parent = "toolu_parent";
    const messages = [
      {
        type: "assistant",
        uuid: "sa1",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa1", role: "assistant", content: [{ type: "thinking", thinking: "planning", signature: "sig" }] }
      },
      {
        type: "assistant",
        uuid: "sa2",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa2", role: "assistant", content: [{ type: "tool_use", id: "tu_inner", name: "Bash", input: { command: "ls" } }] }
      },
      {
        type: "user",
        uuid: "sa3",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_inner", content: "file-a.txt\nfile-b.txt" }] }
      },
      {
        type: "assistant",
        uuid: "sa4",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa4", role: "assistant", content: [{ type: "text", text: "Done. SUBAGENT_ONLY_MARKER_xyz" }] }
      }
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "inner assistant messages must form a single synthesized turn");
    assert.strictEqual(turns[0].id, "sa1", "turn id anchors on the first inner assistant envelope");
    assert.strictEqual(turns[0].message.text, "", "subagent turn has no user prompt");
    assert.strictEqual(turns[0].state, TurnState.Complete, "tool_result drains the pending tool_use");
    const markdown = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.Markdown);
    assert.ok(
      markdown.some((p) => p.kind === ResponsePartKind.Markdown && p.content.includes("SUBAGENT_ONLY_MARKER_xyz")),
      "the subagent final text (with marker) must survive replay"
    );
    const toolCall = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(
      toolCall && toolCall.kind === ResponsePartKind.ToolCall && toolCall.toolCall.status === ToolCallStatus.Completed,
      "inner Bash tool call must be reconstructed as Completed"
    );
  });
  test("Fixture 10b: top-level assistant before any user message is recovered under a placeholder prompt", () => {
    const messages = [
      makeAssistantText("a1", "promptless reply"),
      makeUser("u1", "hello"),
      makeAssistantText("a2", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, text: turn.message.text })), [
      { id: "a1", text: missingPromptPlaceholder() },
      { id: "u1", text: "hello" }
    ]);
  });
  test("a transcript slice with no user message at all still yields turns", () => {
    const messages = [
      makeAssistantToolUse("a1", "tu1", "Bash", { command: "ls" }),
      makeUserToolResult("r1", "tu1", "file.txt"),
      makeAssistantText("a2", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].message.text, missingPromptPlaceholder());
    assert.strictEqual(turns[0].state, TurnState.Complete);
  });
});
suite("resolveForkAnchorUuid", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeUser(uuid, text) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "text", text }] }
    };
  }
  function makeAssistantText(uuid, text) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "text", text }] }
    };
  }
  function makeAssistantToolUse(uuid, toolUseId, name, input = {}) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "tool_use", id: toolUseId, name, input }] }
    };
  }
  function makeUserToolResult(uuid, toolUseId, text) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }] }
    };
  }
  function makeSystem(uuid, subtype, text) {
    return {
      type: "system",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { subtype, ...text !== void 0 ? { text } : {} }
    };
  }
  const threeTurns = [
    makeUser("u1", "apple"),
    makeAssistantText("a1", "apple!"),
    makeUser("u2", "banana"),
    makeAssistantText("a2", "banana!"),
    makeUser("u3", "cherry"),
    makeAssistantText("a3", "cherry!")
  ];
  test("fork at turn 0 \u2192 last assistant uuid of turn 0", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u1"), "a1");
  });
  test("fork at turn 1 \u2192 last assistant uuid of turn 1", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u2"), "a2");
  });
  test("fork at the last turn \u2192 last assistant uuid of that turn", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u3"), "a3");
  });
  test("turn with multiple assistant envelopes \u2192 the LAST one", () => {
    const messages = [
      makeUser("u1", "do a thing"),
      makeAssistantText("a1", "thinking"),
      makeAssistantToolUse("a2", "tool-1", "Read"),
      makeUserToolResult("r1", "tool-1", "file contents"),
      makeUser("u2", "next"),
      makeAssistantText("a3", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a2", "must return the last assistant envelope of the target turn");
  });
  test("user-tool-results between assistants does not flip the turn", () => {
    const messages = [
      makeUser("u1", "go"),
      makeAssistantToolUse("a1", "tool-1", "Read"),
      makeUserToolResult("r1", "tool-1", "contents"),
      makeAssistantText("a2", "done"),
      makeUser("u2", "next"),
      makeAssistantText("a3", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a2", "tool_result envelope must not end the turn");
  });
  test("system-notification mid-turn does not flip the turn", () => {
    const messages = [
      makeUser("u1", "go"),
      makeSystem("s1", "compact_boundary"),
      makeAssistantText("a1", "done"),
      makeUser("u2", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a1", "system notification must not end the turn");
  });
  test("user-only target turn (no assistant) has no valid fork anchor", () => {
    const messages = [
      makeUser("u1", "apple"),
      makeAssistantText("a1", "apple!"),
      makeUser("u2", "unanswered")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u2"), void 0);
  });
  test("turnId not found \u2192 undefined", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "nope"), void 0);
  });
  test("a promptless leading turn is anchorable, mirroring the replay builder", () => {
    const messages = [
      makeAssistantText("a1", "promptless reply"),
      makeUser("u1", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "a1"), "a1");
  });
  test("empty transcript \u2192 undefined", () => {
    assert.strictEqual(resolveForkAnchorUuid([], "u1"), void 0);
  });
  test("CLI-echo user envelopes are skipped by the shared parser", () => {
    const messages = [
      makeUser("u1", "what model"),
      {
        type: "user",
        uuid: "echo-1",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<command-name>/model</command-name>" }
      },
      makeAssistantText("a1", "opus"),
      makeUser("u2", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a1");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlUmVwbGF5TWFwcGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFNlc3Npb25NZXNzYWdlIH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMsIG1pc3NpbmdQcm9tcHRQbGFjZWhvbGRlciwgcmVzb2x2ZUZvcmtBbmNob3JVdWlkIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlUmVwbGF5TWFwcGVyLmpzJztcblxuc3VpdGUoJ2NsYXVkZVJlcGxheU1hcHBlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UoJ2NsYXVkZTovc2Vzcy0xJyk7XG5cdHR5cGUgVGltZXN0YW1wZWRTZXNzaW9uTWVzc2FnZSA9IFNlc3Npb25NZXNzYWdlICYgeyByZWFkb25seSB0aW1lc3RhbXA/OiBzdHJpbmcgfTtcblxuXHRmdW5jdGlvbiBtYWtlVXNlcih1dWlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgdGltZXN0YW1wPzogc3RyaW5nKTogVGltZXN0YW1wZWRTZXNzaW9uTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQgfV0gfSxcblx0XHRcdHRpbWVzdGFtcCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUFzc2lzdGFudFRleHQodXVpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIHRpbWVzdGFtcD86IHN0cmluZyk6IFRpbWVzdGFtcGVkU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnYXNzaXN0YW50Jyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgaWQ6IGBtc2dfJHt1dWlkfWAsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQgfV0gfSxcblx0XHRcdHRpbWVzdGFtcCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUFzc2lzdGFudFRvb2xVc2UodXVpZDogc3RyaW5nLCB0b29sVXNlSWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBpbnB1dDogdW5rbm93biA9IHt9LCB0aW1lc3RhbXA/OiBzdHJpbmcpOiBUaW1lc3RhbXBlZFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdGlkOiBgbXNnXyR7dXVpZH1gLFxuXHRcdFx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6IHRvb2xVc2VJZCwgbmFtZSwgaW5wdXQgfV0sXG5cdFx0XHR9LFxuXHRcdFx0dGltZXN0YW1wLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlVXNlclRvb2xSZXN1bHQodXVpZDogc3RyaW5nLCB0b29sVXNlSWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCBpc0Vycm9yID0gZmFsc2UsIHRpbWVzdGFtcD86IHN0cmluZyk6IFRpbWVzdGFtcGVkU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAndXNlcicsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6IHRvb2xVc2VJZCwgY29udGVudDogdGV4dCwgLi4uKGlzRXJyb3IgPyB7IGlzX2Vycm9yOiB0cnVlIH0gOiB7fSkgfV0sXG5cdFx0XHR9LFxuXHRcdFx0dGltZXN0YW1wLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlU3lzdGVtKHV1aWQ6IHN0cmluZywgc3VidHlwZTogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nKTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc3lzdGVtJyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgc3VidHlwZSwgLi4uKHRleHQgIT09IHVuZGVmaW5lZCA/IHsgdGV4dCB9IDoge30pIH0sXG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ0ZpeHR1cmUgMTogc2luZ2xlIHRleHQgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdoZWxsbycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3dvcmxkJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0uaWQsICd1MScsICdUdXJuLmlkIE1VU1QgZXF1YWwgdXNlciBTZXNzaW9uTWVzc2FnZS51dWlkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnVzYWdlLCB1bmRlZmluZWQsICdyZXBsYXkgbmV2ZXIgaGFzIHVzYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5yZXNwb25zZVBhcnRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bik7XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bikge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuY29udGVudCwgJ3dvcmxkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0dXJuIHRpbWluZyBmcm9tIHBlcnNpc3RlZCBtZXNzYWdlIHRpbWVzdGFtcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnaGVsbG8nLCAnMjAyNi0wNy0wOVQxODowMDowMC4wMDBaJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnd29ybGQnLCAnMjAyNi0wNy0wOVQxODowMDowMi41MDBaJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0ZWRBdDogdHVybnNbMF0uc3RhcnRlZEF0LFxuXHRcdFx0ZHVyYXRpb246IHR1cm5zWzBdLmR1cmF0aW9uLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDctMDlUMTg6MDA6MDAuMDAwWicsXG5cdFx0XHRkdXJhdGlvbjogMl81MDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyB0dXJuIHRpbWluZyB1bmtub3duIHdoZW4gcGVyc2lzdGVkIHRpbWVzdGFtcHMgYXJlIG1pc3Npbmcgb3IgaW52YWxpZCcsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdoZWxsbycsICdpbnZhbGlkJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnd29ybGQnKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRlZEF0OiB0dXJuc1swXS5zdGFydGVkQXQsXG5cdFx0XHRkdXJhdGlvbjogdHVybnNbMF0uZHVyYXRpb24sXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRlZEF0OiB1bmRlZmluZWQsXG5cdFx0XHRkdXJhdGlvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDI6IHRvb2xfdXNlICsgdG9vbF9yZXN1bHQgaXMgb25lIFR1cm4gd2l0aCBvbmUgQ29tcGxldGVkIFRvb2xDYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2xpc3QgZmlsZXMnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dTEnLCAnQmFzaCcsIHsgY29tbWFuZDogJ2xzJyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgnc3ludGhldGljMScsICd0dTEnLCAnZmlsZTEudHh0XFxuZmlsZTIudHh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAndHdvIGZpbGVzJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxLCAndG9vbF9yZXN1bHQgTVVTVCBOT1Qgc3RhcnQgYSBuZXcgdHVybicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0XHRjb25zdCB0b29sQ2FsbFBhcnRzID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maWx0ZXIocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbFBhcnRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdG9vbENhbGwgPSB0b29sQ2FsbFBhcnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRpZiAodG9vbENhbGwua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsLnRvb2xDYWxsLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbC50b29sQ2FsbC50b29sTmFtZSwgJ0Jhc2gnKTtcblx0XHRcdGlmICh0b29sQ2FsbC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbENhbGwudG9vbENhbGwuc3VjY2VzcywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbENhbGwudG9vbENhbGwuY29udGVudCwgW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlMS50eHRcXG5maWxlMi50eHQnIH1dKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxheSBwcmVzZXJ2ZXMgZ2VuZXJpYyBzZW1hbnRpY3MgZm9yIGNsaWVudCB0b29scyB0aGF0IGNvbGxpZGUgd2l0aCBidWlsdC1pbiBuYW1lcycsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdydW4gY2xpZW50IHRvb2xzJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTEnLCAndHVfYmFzaCcsICdtY3BfX2NsaWVudF9fQmFzaCcsIHsgY29tbWFuZDogJ2VjaG8gY2xpZW50JyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgncjEnLCAndHVfYmFzaCcsICdkb25lJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTInLCAndHVfdGFzaycsICdtY3BfX2NsaWVudF9fVGFzaycsIHsgZGVzY3JpcHRpb246ICdjbGllbnQgdGFzaycgfSksXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHQoJ3IyJywgJ3R1X3Rhc2snLCAnZG9uZScpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2xzID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpLm1hcChwYXJ0ID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBwYXJ0LnRvb2xDYWxsLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRtZXRhOiBwYXJ0LnRvb2xDYWxsLl9tZXRhLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuaW52b2NhdGlvbk1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xJbnB1dDogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwudG9vbElucHV0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5wYXN0VGVuc2VNZXNzYWdlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRoYXNTdWJhZ2VudENvbnRlbnQ6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdFx0XHQmJiBwYXJ0LnRvb2xDYWxsLmNvbnRlbnQ/LnNvbWUoY29udGVudCA9PiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9vbHMsIFtcblx0XHRcdHtcblx0XHRcdFx0dG9vbE5hbWU6ICdCYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdCYXNoJyxcblx0XHRcdFx0bWV0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0Jhc2gnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XFxuICBcImNvbW1hbmRcIjogXCJlY2hvIGNsaWVudFwiXFxufScsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdCYXNoJyxcblx0XHRcdFx0aGFzU3ViYWdlbnRDb250ZW50OiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRvb2xOYW1lOiAnVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGFzaycsXG5cdFx0XHRcdG1ldGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdUYXNrJyxcblx0XHRcdFx0dG9vbElucHV0OiAne1xcbiAgXCJkZXNjcmlwdGlvblwiOiBcImNsaWVudCB0YXNrXCJcXG59Jyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1Rhc2snLFxuXHRcdFx0XHRoYXNTdWJhZ2VudENvbnRlbnQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnRml4dHVyZSAzOiBtdWx0aS10dXJuIHByb2R1Y2VzIG9yZGVyZWQgVHVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZmlyc3QnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdyZXBseSAxJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnc2Vjb25kJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAncmVwbHkgMicpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLmlkLCAndTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMV0uaWQsICd1MicpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDQ6IGNvbXBhY3RfYm91bmRhcnkgYXR0YWNoZXMgYXMgU3lzdGVtTm90aWZpY2F0aW9uIG9uIHRoZSBhY3RpdmUgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdmaXJzdCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3JlcGx5IDEnKSxcblx0XHRcdG1ha2VTeXN0ZW0oJ3MxJywgJ2NvbXBhY3RfYm91bmRhcnknLCAnY29udGV4dCBjb21wYWN0ZWQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdyZXBseSAyJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxLCAnY29tcGFjdF9ib3VuZGFyeSBpcyBOT1QgYSB0dXJuIGJvdW5kYXJ5Jyk7XG5cdFx0Y29uc3Qgc3lzUGFydHMgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcihwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeXNQYXJ0cy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDU6IFRhc2sgLyBBZ2VudCB0b29sX3VzZSBwcm9kdWNlcyBzdWJhZ2VudCBtYXJrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnc3Bhd24gc3ViYWdlbnQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dTEnLCAnVGFzaycsIHsgZGVzY3JpcHRpb246ICdkbyB0aGluZycgfSksXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHQoJ3N5bnRoZXRpYzEnLCAndHUxJywgJ3N1YmFnZW50IGRvbmUnKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRvb2xDYWxsUGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmluZChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xDYWxsUGFydCwgJ2V4cGVjdGVkIGEgVG9vbENhbGwgcGFydCcpO1xuXHRcdGlmICh0b29sQ2FsbFBhcnQgJiYgdG9vbENhbGxQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbFBhcnQudG9vbENhbGwuX21ldGE/LnRvb2xLaW5kLCAnc3ViYWdlbnQnKTtcblx0XHRcdGlmICh0b29sQ2FsbFBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdFx0Y29uc3QgaGFzU3ViYWdlbnRNYXJrZXIgPSB0b29sQ2FsbFBhcnQudG9vbENhbGwuY29udGVudD8uc29tZShjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhc1N1YmFnZW50TWFya2VyLCB0cnVlLCAnc3ViYWdlbnQgbWFya2VyIGJsb2NrIG11c3QgYmUgcHJlc2VudCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXNzZXJ0LmZhaWwoYGV4cGVjdGVkIENvbXBsZXRlZCBzdGF0dXMsIGdvdCAke3Rvb2xDYWxsUGFydC50b29sQ2FsbC5zdGF0dXN9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDViOiBBZ2VudCB0b29sIG5hbWUgYWxzbyByZWNvZ25pc2VkIGFzIHN1YmFnZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ3NwYXduIHN1YmFnZW50JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTEnLCAndHUxJywgJ0FnZW50JywgeyBkZXNjcmlwdGlvbjogJ2RvIHRoaW5nJyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgnc3ludGhldGljMScsICd0dTEnLCAnZG9uZScpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdG9vbENhbGxQYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbENhbGxQYXJ0ICYmIHRvb2xDYWxsUGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRpZiAodG9vbENhbGxQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbFBhcnQudG9vbENhbGwuX21ldGE/LnRvb2xLaW5kLCAnc3ViYWdlbnQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgNjogdGFpbCBUdXJuIHdpdGggb3JwaGFuIHRvb2xfdXNlIGlzIENhbmNlbGxlZCcsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdkbyB3b3JrJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTEnLCAndHUtb3JwaGFuJywgJ0Jhc2gnLCB7IGNvbW1hbmQ6ICdzbGVlcCAxMDAnIH0pLFxuXHRcdFx0Ly8gbm8gbWF0Y2hpbmcgdG9vbF9yZXN1bHQgXHUyMDE0IG1vZGVsIGNyYXNoZWQgbWlkLXR1cm5cblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgNmI6IG9ycGhhbiBpbiB0dXJuIE4gZG9lcyBOT1QgY2FuY2VsIHR1cm4gTisxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2ZpcnN0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTEnLCAndHUtb3JwaGFuJywgJ0Jhc2gnLCB7fSksXG5cdFx0XHQvLyBubyB0b29sX3Jlc3VsdCBmb3IgdHUtb3JwaGFuXG5cdFx0XHRtYWtlVXNlcigndTInLCAnc2Vjb25kJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnY2xlYW4gcmVwbHknKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNhbmNlbGxlZCwgJ3R1cm4gMSBoYXMgb3JwaGFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzFdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUsICd0dXJuIDIgaGFzIG5vIG9ycGhhbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXRlIHRvb2wgcmVzdWx0cyBkbyBub3QgZXh0ZW5kIHRoZSBhY3RpdmUgdHVybiBkdXJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdmaXJzdCcsICcyMDI2LTA3LTA5VDE4OjAwOjAwLjAwMFonKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dS1sYXRlJywgJ0Jhc2gnLCB7fSwgJzIwMjYtMDctMDlUMTg6MDA6MDEuMDAwWicpLFxuXHRcdFx0bWFrZVVzZXIoJ3UyJywgJ3NlY29uZCcsICcyMDI2LTA3LTA5VDE4OjAwOjEwLjAwMFonKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdjbGVhbiByZXBseScsICcyMDI2LTA3LTA5VDE4OjAwOjEyLjAwMFonKSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgnbGF0ZS1yZXN1bHQnLCAndHUtbGF0ZScsICdkb25lJywgZmFsc2UsICcyMDI2LTA3LTA5VDE4OjAwOjIwLjAwMFonKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gdHVybi5kdXJhdGlvbiksIFsxXzAwMCwgMl8wMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnRml4dHVyZSA3OiBub24tYWxsb3dsaXN0ZWQgc3lzdGVtIHN1YnR5cGVzIGFyZSBkcm9wcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2dvJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAncmVwbHknKSxcblx0XHRcdG1ha2VTeXN0ZW0oJ3MxJywgJ2FwaV9yZXRyeScsICdyZXRyeWluZycpLFxuXHRcdFx0bWFrZVN5c3RlbSgnczInLCAnaG9va19zdGFydGVkJywgJ2hvb2sgeCcpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3lzUGFydHMgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcihwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeXNQYXJ0cy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDk6IENMSSBzbGFzaC1jb21tYW5kIGVjaG8gYW5kIGxvY2FsLWNvbW1hbmQtc3Rkb3V0IGVudHJpZXMgYXJlIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Ly8gT24tZGlzayBzaGFwZSB2ZXJpZmllZCBlbXBpcmljYWxseSAoY2xhdWRlLWhpc3Rvcnkgc2tpbGwpOlxuXHRcdC8vIHRoZSBgL21vZGVsYCBlY2hvIGxhY2tzIGBpc1N5bnRoZXRpY2AgLyBgaXNNZXRhYCwgY29udGVudCBpcyBhXG5cdFx0Ly8gcmF3IHN0cmluZyBzdGFydGluZyB3aXRoIGA8Y29tbWFuZC1uYW1lPmAuIFNhbWUgZm9yIHRoZVxuXHRcdC8vIGA8bG9jYWwtY29tbWFuZC1zdGRvdXQ+YCBwYWlyZWQgZW50cnkuXG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnd2hhdCBtb2RlbCBhcmUgeW91JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnc29ubmV0JyksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdFx0dXVpZDogJ2VjaG8tMScsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICc8Y29tbWFuZC1uYW1lPi9tb2RlbDwvY29tbWFuZC1uYW1lPlxcbiAgICAgICAgICAgIDxjb21tYW5kLW1lc3NhZ2U+bW9kZWw8L2NvbW1hbmQtbWVzc2FnZT5cXG4gICAgICAgICAgICA8Y29tbWFuZC1hcmdzPmNsYXVkZS1vcHVzLTQuNzwvY29tbWFuZC1hcmdzPicgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdFx0dXVpZDogJ2VjaG8tMicsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICc8bG9jYWwtY29tbWFuZC1zdGRvdXQ+U2V0IG1vZGVsIHRvIGNsYXVkZS1vcHVzLTQuNzwvbG9jYWwtY29tbWFuZC1zdGRvdXQ+JyB9LFxuXHRcdFx0fSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICdob3cgYWJvdXQgbm93JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnb3B1cycpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMiwgJ0NMSS1lY2hvIHVzZXIgZW52ZWxvcGVzIG11c3QgTk9UIHN0YXJ0IG5ldyB0dXJucycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5pZCwgJ3UxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ3doYXQgbW9kZWwgYXJlIHlvdScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1sxXS5pZCwgJ3UyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzFdLm1lc3NhZ2UudGV4dCwgJ2hvdyBhYm91dCBub3cnKTtcblx0fSk7XG5cblx0dGVzdCgnRml4dHVyZSAxMDogcHJvbXB0LWxlc3Mgc3ViYWdlbnQgdHJhbnNjcmlwdCAoaW5uZXIgbWVzc2FnZXMpIG1hcHMgdG8gb25lIHR1cm4nLCAoKSA9PiB7XG5cdFx0Ly8gQSBzdWJhZ2VudCB0cmFuc2NyaXB0IGZyb20gYGdldFN1YmFnZW50TWVzc2FnZXNgIGNhcnJpZXMgYVxuXHRcdC8vIGBwYXJlbnRfdG9vbF91c2VfaWRgIG9uIGV2ZXJ5IGVudmVsb3BlIGFuZCBoYXMgTk8gc3ludGhldGljIHNwYXduaW5nXG5cdFx0Ly8gdXNlciBwcm9tcHQsIHNvIGl0IG9wZW5zIGRpcmVjdGx5IHdpdGggYW4gYXNzaXN0YW50IG1lc3NhZ2UuIFRoZVxuXHRcdC8vIGJ1aWxkZXIgbXVzdCBzeW50aGVzaXplIGFuIGVtcHR5LXByb21wdCB0dXJuIHJhdGhlciB0aGFuIGRyb3BwaW5nIHRoZVxuXHRcdC8vIGlubmVyIGFzc2lzdGFudCBjb250ZW50ICh3aGljaCB3b3VsZCBsb3NlIHRoZSB3aG9sZSB0cmFuc2NyaXB0IG9uXG5cdFx0Ly8gcmVwbGF5KS4gU2hhcGUgbWlycm9ycyBhIHJlYWwgY2FwdHVyZWQgc3ViYWdlbnQgdHJhbnNjcmlwdC5cblx0XHRjb25zdCBwYXJlbnQgPSAndG9vbHVfcGFyZW50Jztcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsIHV1aWQ6ICdzYTEnLCBzZXNzaW9uX2lkOiAnc2Vzcy0xJywgcGFyZW50X3Rvb2xfdXNlX2lkOiBwYXJlbnQsIHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyBpZDogJ21zZ19zYTEnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RoaW5raW5nJywgdGhpbmtpbmc6ICdwbGFubmluZycsIHNpZ25hdHVyZTogJ3NpZycgfV0gfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQnLCB1dWlkOiAnc2EyJywgc2Vzc2lvbl9pZDogJ3Nlc3MtMScsIHBhcmVudF90b29sX3VzZV9pZDogcGFyZW50LCBwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgaWQ6ICdtc2dfc2EyJywgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3VzZScsIGlkOiAndHVfaW5uZXInLCBuYW1lOiAnQmFzaCcsIGlucHV0OiB7IGNvbW1hbmQ6ICdscycgfSB9XSB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3VzZXInLCB1dWlkOiAnc2EzJywgc2Vzc2lvbl9pZDogJ3Nlc3MtMScsIHBhcmVudF90b29sX3VzZV9pZDogcGFyZW50LCBwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogJ3R1X2lubmVyJywgY29udGVudDogJ2ZpbGUtYS50eHRcXG5maWxlLWIudHh0JyB9XSB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsIHV1aWQ6ICdzYTQnLCBzZXNzaW9uX2lkOiAnc2Vzcy0xJywgcGFyZW50X3Rvb2xfdXNlX2lkOiBwYXJlbnQsIHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyBpZDogJ21zZ19zYTQnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnRG9uZS4gU1VCQUdFTlRfT05MWV9NQVJLRVJfeHl6JyB9XSB9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEsICdpbm5lciBhc3Npc3RhbnQgbWVzc2FnZXMgbXVzdCBmb3JtIGEgc2luZ2xlIHN5bnRoZXNpemVkIHR1cm4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0uaWQsICdzYTEnLCAndHVybiBpZCBhbmNob3JzIG9uIHRoZSBmaXJzdCBpbm5lciBhc3Npc3RhbnQgZW52ZWxvcGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ubWVzc2FnZS50ZXh0LCAnJywgJ3N1YmFnZW50IHR1cm4gaGFzIG5vIHVzZXIgcHJvbXB0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUsICd0b29sX3Jlc3VsdCBkcmFpbnMgdGhlIHBlbmRpbmcgdG9vbF91c2UnKTtcblx0XHRjb25zdCBtYXJrZG93biA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRhc3NlcnQub2sobWFya2Rvd24uc29tZShwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biAmJiBwLmNvbnRlbnQuaW5jbHVkZXMoJ1NVQkFHRU5UX09OTFlfTUFSS0VSX3h5eicpKSxcblx0XHRcdCd0aGUgc3ViYWdlbnQgZmluYWwgdGV4dCAod2l0aCBtYXJrZXIpIG11c3Qgc3Vydml2ZSByZXBsYXknKTtcblx0XHRjb25zdCB0b29sQ2FsbCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmluZChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xDYWxsICYmIHRvb2xDYWxsLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgdG9vbENhbGwudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHQnaW5uZXIgQmFzaCB0b29sIGNhbGwgbXVzdCBiZSByZWNvbnN0cnVjdGVkIGFzIENvbXBsZXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDEwYjogdG9wLWxldmVsIGFzc2lzdGFudCBiZWZvcmUgYW55IHVzZXIgbWVzc2FnZSBpcyByZWNvdmVyZWQgdW5kZXIgYSBwbGFjZWhvbGRlciBwcm9tcHQnLCAoKSA9PiB7XG5cdFx0Ly8gQSB0cnVuY2F0ZWQgdHJhbnNjcmlwdCBzbGljZSAodGhlIFNESyByZXR1cm5zIG9ubHkgdGhlIGJ5dGVzIGFmdGVyXG5cdFx0Ly8gdGhlIGxhc3QgY29tcGFjdCBib3VuZGFyeSBmb3IgbGFyZ2Ugc2Vzc2lvbnMpIGNhbiBvcGVuIG1pZC10dXJuLFxuXHRcdC8vIHdpdGggdGhlIHVzZXIgcHJvbXB0IGN1dCBvZmYuIFRoZSByZXBseSBtdXN0IHN0aWxsIGJlIHJlY292ZXJlZCBcdTIwMTRcblx0XHQvLyBkcm9wcGluZyBpdCBlbXB0aWVzIHRoZSB3aG9sZSBjaGF0IHdoZW4gdGhlIHNsaWNlIGNvbnRhaW5zIG5vIHVzZXJcblx0XHQvLyBtZXNzYWdlIGF0IGFsbC5cblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdwcm9tcHRsZXNzIHJlcGx5JyksXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnaGVsbG8nKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICd3b3JsZCcpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoeyBpZDogdHVybi5pZCwgdGV4dDogdHVybi5tZXNzYWdlLnRleHQgfSkpLCBbXG5cdFx0XHR7IGlkOiAnYTEnLCB0ZXh0OiBtaXNzaW5nUHJvbXB0UGxhY2Vob2xkZXIoKSB9LFxuXHRcdFx0eyBpZDogJ3UxJywgdGV4dDogJ2hlbGxvJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHRyYW5zY3JpcHQgc2xpY2Ugd2l0aCBubyB1c2VyIG1lc3NhZ2UgYXQgYWxsIHN0aWxsIHlpZWxkcyB0dXJucycsICgpID0+IHtcblx0XHQvLyBUaGUgcmVwb3J0ZWQgZmFpbHVyZSBtb2RlOiBldmVyeSBlbnZlbG9wZSBpbiB0aGUgc2xpY2UgYmVsb25nZWQgdG9cblx0XHQvLyBvbmUgbG9uZyBhZ2VudGljIHR1cm4gd2hvc2UgcHJvbXB0IHdhcyB0cnVuY2F0ZWQgYXdheSwgc28gdGhlIHdob2xlXG5cdFx0Ly8gc2Vzc2lvbiByZXBsYXllZCBhcyB6ZXJvIHR1cm5zIGFuZCB0aGUgY2hhdCByZW5kZXJlZCBlbXB0eS5cblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dTEnLCAnQmFzaCcsIHsgY29tbWFuZDogJ2xzJyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgncjEnLCAndHUxJywgJ2ZpbGUudHh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnZG9uZScpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgbWlzc2luZ1Byb21wdFBsYWNlaG9sZGVyKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Jlc29sdmVGb3JrQW5jaG9yVXVpZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBtYWtlVXNlcih1dWlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0dXVpZCxcblx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dCB9XSB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQXNzaXN0YW50VGV4dCh1dWlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7IGlkOiBgbXNnXyR7dXVpZH1gLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dIH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VBc3Npc3RhbnRUb29sVXNlKHV1aWQ6IHN0cmluZywgdG9vbFVzZUlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgaW5wdXQ6IHVua25vd24gPSB7fSk6IFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7IGlkOiBgbXNnXyR7dXVpZH1gLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6IHRvb2xVc2VJZCwgbmFtZSwgaW5wdXQgfV0gfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVVzZXJUb29sUmVzdWx0KHV1aWQ6IHN0cmluZywgdG9vbFVzZUlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0dXVpZCxcblx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3Jlc3VsdCcsIHRvb2xfdXNlX2lkOiB0b29sVXNlSWQsIGNvbnRlbnQ6IHRleHQgfV0gfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZVN5c3RlbSh1dWlkOiBzdHJpbmcsIHN1YnR5cGU6IHN0cmluZywgdGV4dD86IHN0cmluZyk6IFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3N5c3RlbScsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7IHN1YnR5cGUsIC4uLih0ZXh0ICE9PSB1bmRlZmluZWQgPyB7IHRleHQgfSA6IHt9KSB9LFxuXHRcdH07XG5cdH1cblxuXHQvLyAzLXR1cm4gdHJhbnNjcmlwdCBzaGFyZWQgYnkgdGhlIGZvcmstcG9zaXRpb24gZml4dHVyZXMuXG5cdGNvbnN0IHRocmVlVHVybnM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0bWFrZVVzZXIoJ3UxJywgJ2FwcGxlJyksXG5cdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ2FwcGxlIScpLFxuXHRcdG1ha2VVc2VyKCd1MicsICdiYW5hbmEnKSxcblx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnYmFuYW5hIScpLFxuXHRcdG1ha2VVc2VyKCd1MycsICdjaGVycnknKSxcblx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTMnLCAnY2hlcnJ5IScpLFxuXHRdO1xuXG5cdHRlc3QoJ2ZvcmsgYXQgdHVybiAwIFx1MjE5MiBsYXN0IGFzc2lzdGFudCB1dWlkIG9mIHR1cm4gMCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKHRocmVlVHVybnMsICd1MScpLCAnYTEnKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yayBhdCB0dXJuIDEgXHUyMTkyIGxhc3QgYXNzaXN0YW50IHV1aWQgb2YgdHVybiAxJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQodGhyZWVUdXJucywgJ3UyJyksICdhMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JrIGF0IHRoZSBsYXN0IHR1cm4gXHUyMTkyIGxhc3QgYXNzaXN0YW50IHV1aWQgb2YgdGhhdCB0dXJuJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQodGhyZWVUdXJucywgJ3UzJyksICdhMycpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuIHdpdGggbXVsdGlwbGUgYXNzaXN0YW50IGVudmVsb3BlcyBcdTIxOTIgdGhlIExBU1Qgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2RvIGEgdGhpbmcnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICd0aGlua2luZycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2EyJywgJ3Rvb2wtMScsICdSZWFkJyksXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHQoJ3IxJywgJ3Rvb2wtMScsICdmaWxlIGNvbnRlbnRzJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnbmV4dCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EzJywgJ29rJyksXG5cdFx0XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCAndTEnKSwgJ2EyJywgJ211c3QgcmV0dXJuIHRoZSBsYXN0IGFzc2lzdGFudCBlbnZlbG9wZSBvZiB0aGUgdGFyZ2V0IHR1cm4nKTtcblx0fSk7XG5cblx0dGVzdCgndXNlci10b29sLXJlc3VsdHMgYmV0d2VlbiBhc3Npc3RhbnRzIGRvZXMgbm90IGZsaXAgdGhlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZ28nKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0b29sLTEnLCAnUmVhZCcpLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdyMScsICd0b29sLTEnLCAnY29udGVudHMnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdkb25lJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnbmV4dCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EzJywgJ29rJyksXG5cdFx0XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCAndTEnKSwgJ2EyJywgJ3Rvb2xfcmVzdWx0IGVudmVsb3BlIG11c3Qgbm90IGVuZCB0aGUgdHVybicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzeXN0ZW0tbm90aWZpY2F0aW9uIG1pZC10dXJuIGRvZXMgbm90IGZsaXAgdGhlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZ28nKSxcblx0XHRcdG1ha2VTeXN0ZW0oJ3MxJywgJ2NvbXBhY3RfYm91bmRhcnknKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdkb25lJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnbmV4dCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ29rJyksXG5cdFx0XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCAndTEnKSwgJ2ExJywgJ3N5c3RlbSBub3RpZmljYXRpb24gbXVzdCBub3QgZW5kIHRoZSB0dXJuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXItb25seSB0YXJnZXQgdHVybiAobm8gYXNzaXN0YW50KSBoYXMgbm8gdmFsaWQgZm9yayBhbmNob3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnYXBwbGUnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdhcHBsZSEnKSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICd1bmFuc3dlcmVkJyksXG5cdFx0XTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCAndTInKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgndHVybklkIG5vdCBmb3VuZCBcdTIxOTIgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQodGhyZWVUdXJucywgJ25vcGUnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYSBwcm9tcHRsZXNzIGxlYWRpbmcgdHVybiBpcyBhbmNob3JhYmxlLCBtaXJyb3JpbmcgdGhlIHJlcGxheSBidWlsZGVyJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBidWlsZGVyIG9wZW5zIGEgdHVybiBrZXllZCBvbiB0aGUgbGVhZGluZyBhc3Npc3RhbnQgZW52ZWxvcGUgd2hlblxuXHRcdC8vIHRoZSBwcm9tcHQgaXMgbWlzc2luZyBmcm9tIHRoZSBzbGljZTsgdGhlIHJlc29sdmVyIG11c3QgYWdyZWUgb3IgYVxuXHRcdC8vIGZvcmsgZnJvbSB0aGF0IHR1cm4gY2Fubm90IGJlIGFuY2hvcmVkLlxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3Byb21wdGxlc3MgcmVwbHknKSxcblx0XHRcdG1ha2VVc2VyKCd1MScsICduZXh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnb2snKSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsICdhMScpLCAnYTEnKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgdHJhbnNjcmlwdCBcdTIxOTIgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQoW10sICd1MScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdDTEktZWNobyB1c2VyIGVudmVsb3BlcyBhcmUgc2tpcHBlZCBieSB0aGUgc2hhcmVkIHBhcnNlcicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICd3aGF0IG1vZGVsJyksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdFx0dXVpZDogJ2VjaG8tMScsXG5cdFx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICc8Y29tbWFuZC1uYW1lPi9tb2RlbDwvY29tbWFuZC1uYW1lPicgfSxcblx0XHRcdH0sXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnb3B1cycpLFxuXHRcdFx0bWFrZVVzZXIoJ3UyJywgJ25leHQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdvaycpLFxuXHRcdF07XG5cdFx0Ly8gVGhlIENMSS1lY2hvIGVudmVsb3BlIG11c3Qgbm90IGJlIHRyZWF0ZWQgYXMgdGhlIHN0YXJ0IG9mIGEgbmV3IHR1cm4sXG5cdFx0Ly8gc28gdHVybiB1MSdzIGFuY2hvciBpcyBzdGlsbCBhMSAobm90IGVjaG8tMSwgbm90IHVuZGVmaW5lZCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZChtZXNzYWdlcywgJ3UxJyksICdhMScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFr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
