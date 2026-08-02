import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { generateUuid, isUUID } from "../../../../base/common/uuid.js";
import { AgentSession } from "../../common/agentService.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { buildSessionEventLogFromTurns, buildSessionEventsFromTurns, serializeSessionEventsToJsonl } from "../../node/copilot/buildSessionEvents.js";
import { mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
suite("buildSessionEventsFromTurns \u2014 reverse of mapSessionEvents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  const sessionId = "test-session";
  function markdown(content) {
    return { kind: ResponsePartKind.Markdown, id: "ignored", content };
  }
  function reasoning(content) {
    return { kind: ResponsePartKind.Reasoning, id: "ignored", content };
  }
  function toolCallPart(toolCallId, toolName, toolInput, resultText, opts) {
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Completed,
        toolCallId,
        toolName,
        displayName: toolName,
        invocationMessage: "",
        toolInput,
        success: opts?.success ?? true,
        pastTenseMessage: "",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        content: resultText ? [{ type: ToolResultContentType.Text, text: resultText }] : void 0,
        ...opts?.errorMessage ? { error: { message: opts.errorMessage } } : {}
      }
    };
  }
  function userTurn(id, text, responseParts) {
    return {
      id,
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  function subagentToolCallPart(toolCallId, toolName, agentName, description, resultText) {
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Completed,
        toolCallId,
        toolName,
        displayName: agentName,
        invocationMessage: "",
        toolInput: "",
        success: true,
        pastTenseMessage: "",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        content: [
          { type: ToolResultContentType.Text, text: resultText },
          { type: ToolResultContentType.Subagent, resource: `agent-host-subagent:/${toolCallId}`, title: agentName, agentName, description }
        ]
      }
    };
  }
  function project(turns) {
    return turns.map((turn) => ({
      id: turn.id,
      text: turn.message.text,
      originKind: turn.message.origin.kind,
      state: turn.state,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? { kind: part.kind, content: part.content } : { kind: part.kind })
    }));
  }
  test("round-trips text turns (prompt, markdown, reasoning) preserving UUID turn id, order and state", async () => {
    const idA = generateUuid();
    const idB = generateUuid();
    const turns = [
      userTurn(idA, "What is 2+2?", [markdown("It is 4.")]),
      userTurn(idB, "Explain why.", [reasoning("2 plus 2..."), markdown("Because arithmetic.")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("preserves interleaved markdown/reasoning order by splitting assistant messages", async () => {
    const id = generateUuid();
    const turns = [userTurn(id, "q", [markdown("A"), reasoning("R"), markdown("B")])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "assistant.message",
      "assistant.message"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("emits an abort for a cancelled turn so it reconstructs as cancelled with its text", async () => {
    const id = generateUuid();
    const turns = [{
      id,
      message: { text: "stop", origin: { kind: MessageKind.User } },
      responseParts: [markdown("partial answer")],
      usage: void 0,
      state: TurnState.Cancelled
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "abort"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("round-trips a completed tool call interleaved with assistant text preserving order and identity", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [{
      id,
      message: { text: "run it", origin: { kind: MessageKind.User } },
      responseParts: [
        markdown("Let me run the tool."),
        toolCallPart(toolCallId, "bash", JSON.stringify({ command: "ls" }), "file1\nfile2"),
        markdown("Done.")
      ],
      usage: void 0,
      state: TurnState.Complete
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "tool.execution_start",
      "tool.execution_complete",
      "assistant.message"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const projected = reconstructed.map((turn) => ({
      id: turn.id,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.ToolCall ? {
        kind: part.kind,
        toolCallId: part.toolCall.toolCallId,
        toolName: part.toolCall.toolName,
        status: part.toolCall.status,
        success: part.toolCall.success,
        output: part.toolCall.content?.find((c) => c.type === ToolResultContentType.Text)?.text
      } : { kind: part.kind, content: part.content })
    }));
    assert.deepStrictEqual(projected, [{
      id,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Let me run the tool." },
        { kind: ResponsePartKind.ToolCall, toolCallId, toolName: "bash", status: ToolCallStatus.Completed, success: true, output: "file1\nfile2" },
        { kind: ResponsePartKind.Markdown, content: "Done." }
      ]
    }]);
  });
  test("omits array tool input from structured session event arguments", () => {
    const events = buildSessionEventsFromTurns([
      userTurn(generateUuid(), "run it", [toolCallPart(generateUuid(), "tool", '["one", "two"]', "")])
    ], { sessionId });
    const started = events.find((e) => e.type === "tool.execution_start");
    assert.ok(started && started.type === "tool.execution_start");
    assert.strictEqual(started.data.arguments, void 0);
  });
  test("round-trips a failed tool call preserving the error message", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [{
      id,
      message: { text: "run it", origin: { kind: MessageKind.User } },
      responseParts: [toolCallPart(toolCallId, "bash", "{}", "", { success: false, errorMessage: "boom" })],
      usage: void 0,
      state: TurnState.Complete
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const complete = events.find((e) => e.type === "tool.execution_complete");
    assert.ok(complete && complete.type === "tool.execution_complete");
    assert.strictEqual(complete.data.success, false);
    assert.strictEqual(complete.data.error?.message, "boom");
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const toolPart = reconstructed[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
    assert.strictEqual(toolPart.toolCall.success, false);
    assert.strictEqual(toolPart.toolCall.error?.message, "boom");
  });
  test("emits subagent.started for a sub-agent tool call so the name/description survive the round-trip", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [userTurn(id, "delegate", [subagentToolCallPart(toolCallId, "bash", "explore", "Explores the codebase", "found it")])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "subagent.started",
      "tool.execution_start",
      "tool.execution_complete"
    ]);
    const started = events.find((e) => e.type === "subagent.started");
    assert.ok(started && started.type === "subagent.started");
    assert.deepStrictEqual(
      { toolCallId: started.data.toolCallId, agentName: started.data.agentName, agentDescription: started.data.agentDescription },
      { toolCallId, agentName: "explore", agentDescription: "Explores the codebase" }
    );
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const toolPart = reconstructed[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
    const subagentContent = toolPart.toolCall.content?.find((c) => c.type === ToolResultContentType.Subagent);
    assert.ok(subagentContent && subagentContent.type === ToolResultContentType.Subagent);
    assert.deepStrictEqual(
      { agentName: subagentContent.agentName, description: subagentContent.description },
      { agentName: "explore", description: "Explores the codebase" }
    );
  });
  test("reuses a UUID turn id as the user.message envelope id, minting UUIDs for non-UUID ids", () => {
    const idA = generateUuid();
    const turns = [
      userTurn(idA, "first", [markdown("r1")]),
      userTurn("not-a-uuid", "second", [markdown("r2")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId, model: "gpt-5" });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "user.message",
      "assistant.message"
    ]);
    assert.strictEqual(events[0].parentId, null);
    for (let i = 1; i < events.length; i++) {
      assert.strictEqual(events[i].parentId, events[i - 1].id, `event ${i} must link to its predecessor`);
    }
    const userIds = events.filter((e) => e.type === "user.message").map((e) => e.id);
    assert.strictEqual(userIds[0], idA);
    assert.notStrictEqual(userIds[1], "not-a-uuid");
    assert.ok(events.every((e) => isUUID(e.id)), "all event ids must be UUIDs");
    const start = events[0];
    assert.strictEqual(start.type === "session.start" && start.data.sessionId, sessionId);
    assert.strictEqual(start.type === "session.start" && start.data.selectedModel, "gpt-5");
  });
  test("omits the assistant.message for a turn with no response content", async () => {
    const turns = [userTurn("turn-empty", "just a note", [])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), ["session.start", "user.message"]);
  });
  test("serializes to newline-terminated JSONL whose lines parse back to the same events", () => {
    const turns = [
      userTurn("turn-a", "What is 2+2?", [markdown("It is 4.")]),
      userTurn("turn-b", "Explain.", [reasoning("math"), markdown("Because arithmetic.")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const jsonl = serializeSessionEventsToJsonl(events);
    assert.ok(jsonl.endsWith("\n"), "jsonl must be newline-terminated");
    const lines = jsonl.split("\n").filter((line) => line.length > 0);
    assert.strictEqual(lines.length, events.length);
    assert.deepStrictEqual(lines.map((line) => JSON.parse(line)), events);
    assert.strictEqual(serializeSessionEventsToJsonl([]), "");
  });
  test("the on-disk JSONL bytes reconstruct the original turns end to end", async () => {
    const turns = [
      userTurn(generateUuid(), "What is 2+2?", [markdown("It is 4.")]),
      userTurn(generateUuid(), "Explain why.", [reasoning("2 plus 2..."), markdown("Because arithmetic.")])
    ];
    const jsonl = buildSessionEventLogFromTurns(turns, { sessionId });
    const parsed = jsonl.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, parsed);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYnVpbGRTZXNzaW9uRXZlbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCwgaXNVVUlEIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkU2Vzc2lvbkV2ZW50TG9nRnJvbVR1cm5zLCBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnMsIHNlcmlhbGl6ZVNlc3Npb25FdmVudHNUb0pzb25sIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2J1aWxkU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBtYXBTZXNzaW9uRXZlbnRzIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L21hcFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uRXZlbnQgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcblxuc3VpdGUoJ2J1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyBcdTIwMTQgcmV2ZXJzZSBvZiBtYXBTZXNzaW9uRXZlbnRzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Rlc3Qtc2Vzc2lvbicpO1xuXHRjb25zdCBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblxuXHRmdW5jdGlvbiBtYXJrZG93bihjb250ZW50OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnaWdub3JlZCcsIGNvbnRlbnQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlYXNvbmluZyhjb250ZW50OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLCBpZDogJ2lnbm9yZWQnLCBjb250ZW50IH07XG5cdH1cblxuXHRmdW5jdGlvbiB0b29sQ2FsbFBhcnQodG9vbENhbGxJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCB0b29sSW5wdXQ6IHN0cmluZywgcmVzdWx0VGV4dDogc3RyaW5nLCBvcHRzPzogeyBzdWNjZXNzPzogYm9vbGVhbjsgZXJyb3JNZXNzYWdlPzogc3RyaW5nIH0pOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogdG9vbE5hbWUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnJyxcblx0XHRcdFx0dG9vbElucHV0LFxuXHRcdFx0XHRzdWNjZXNzOiBvcHRzPy5zdWNjZXNzID8/IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICcnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0Y29udGVudDogcmVzdWx0VGV4dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiByZXN1bHRUZXh0IH1dIDogdW5kZWZpbmVkLFxuXHRcdFx0XHQuLi4ob3B0cz8uZXJyb3JNZXNzYWdlID8geyBlcnJvcjogeyBtZXNzYWdlOiBvcHRzLmVycm9yTWVzc2FnZSB9IH0gOiB7fSksXG5cdFx0XHR9IHNhdGlzZmllcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiB1c2VyVHVybihpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdKTogVHVybiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN1YmFnZW50VG9vbENhbGxQYXJ0KHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgYWdlbnROYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIHJlc3VsdFRleHQ6IHN0cmluZyk6IFJlc3BvbnNlUGFydCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBhZ2VudE5hbWUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnJyxcblx0XHRcdFx0dG9vbElucHV0OiAnJyxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJycsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogcmVzdWx0VGV4dCB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LCByZXNvdXJjZTogYGFnZW50LWhvc3Qtc3ViYWdlbnQ6LyR7dG9vbENhbGxJZH1gLCB0aXRsZTogYWdlbnROYW1lLCBhZ2VudE5hbWUsIGRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9IHNhdGlzZmllcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdGlvbiB0aGF0IGlnbm9yZXMgbm9uLWRldGVybWluaXN0aWMgcmVzcG9uc2UtcGFydCBpZHMgc28gcm91bmQtdHJpcHNcblx0ICogYXJlIGNvbXBhcmFibGUuIFRoZSB0dXJuIGlkIGlzIHByZXNlcnZlZCAoYSBVVUlEIGlkIHJvdW5kLXRyaXBzIHRocm91Z2ggdGhlXG5cdCAqIGV2ZW50IGxvZyksIHNvIGl0IGlzIGluY2x1ZGVkLlxuXHQgKi9cblx0ZnVuY3Rpb24gcHJvamVjdCh0dXJuczogcmVhZG9ubHkgVHVybltdKSB7XG5cdFx0cmV0dXJuIHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHRleHQ6IHR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0b3JpZ2luS2luZDogdHVybi5tZXNzYWdlLm9yaWdpbi5raW5kLFxuXHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRwYXJ0czogdHVybi5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+XG5cdFx0XHRcdHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biB8fCBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nXG5cdFx0XHRcdFx0PyB7IGtpbmQ6IHBhcnQua2luZCwgY29udGVudDogcGFydC5jb250ZW50IH1cblx0XHRcdFx0XHQ6IHsga2luZDogcGFydC5raW5kIH0pLFxuXHRcdH0pKTtcblx0fVxuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHRleHQgdHVybnMgKHByb21wdCwgbWFya2Rvd24sIHJlYXNvbmluZykgcHJlc2VydmluZyBVVUlEIHR1cm4gaWQsIG9yZGVyIGFuZCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZEEgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBpZEIgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW1xuXHRcdFx0dXNlclR1cm4oaWRBLCAnV2hhdCBpcyAyKzI/JywgW21hcmtkb3duKCdJdCBpcyA0LicpXSksXG5cdFx0XHR1c2VyVHVybihpZEIsICdFeHBsYWluIHdoeS4nLCBbcmVhc29uaW5nKCcyIHBsdXMgMi4uLicpLCBtYXJrZG93bignQmVjYXVzZSBhcml0aG1ldGljLicpXSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cdFx0Y29uc3QgeyB0dXJuczogcmVjb25zdHJ1Y3RlZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3QocmVjb25zdHJ1Y3RlZCksIHByb2plY3QodHVybnMpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGludGVybGVhdmVkIG1hcmtkb3duL3JlYXNvbmluZyBvcmRlciBieSBzcGxpdHRpbmcgYXNzaXN0YW50IG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFt1c2VyVHVybihpZCwgJ3EnLCBbbWFya2Rvd24oJ0EnKSwgcmVhc29uaW5nKCdSJyksIG1hcmtkb3duKCdCJyldKV07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Ly8gSW50ZXJsZWF2ZWQgcmVhc29uaW5nL21hcmtkb3duIG11c3Qgbm90IG1lcmdlIGludG8gb25lIGFzc2lzdGFudC5tZXNzYWdlXG5cdFx0Ly8gKHdoaWNoIHRoZSByZXZlcnNlIG1hcHBlciB3b3VsZCByZW9yZGVyIGFzIHJlYXNvbmluZy10aGVuLWNvbnRlbnQpLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFtcblx0XHRcdCdzZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHQnYXNzaXN0YW50Lm1lc3NhZ2UnLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgeyB0dXJuczogcmVjb25zdHJ1Y3RlZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9qZWN0KHJlY29uc3RydWN0ZWQpLCBwcm9qZWN0KHR1cm5zKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtaXRzIGFuIGFib3J0IGZvciBhIGNhbmNlbGxlZCB0dXJuIHNvIGl0IHJlY29uc3RydWN0cyBhcyBjYW5jZWxsZWQgd2l0aCBpdHMgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbe1xuXHRcdFx0aWQsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdzdG9wJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW21hcmtkb3duKCdwYXJ0aWFsIGFuc3dlcicpXSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHR9XTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHQvLyBUaGUgYWJvcnQgdHJhaWxzIHRoZSBhbHJlYWR5LWZsdXNoZWQgYXNzaXN0YW50IGNvbnRlbnQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMubWFwKGUgPT4gZS50eXBlKSwgW1xuXHRcdFx0J3Nlc3Npb24uc3RhcnQnLFxuXHRcdFx0J3VzZXIubWVzc2FnZScsXG5cdFx0XHQnYXNzaXN0YW50Lm1lc3NhZ2UnLFxuXHRcdFx0J2Fib3J0Jyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHsgdHVybnM6IHJlY29uc3RydWN0ZWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvamVjdChyZWNvbnN0cnVjdGVkKSwgcHJvamVjdCh0dXJucykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhIGNvbXBsZXRlZCB0b29sIGNhbGwgaW50ZXJsZWF2ZWQgd2l0aCBhc3Npc3RhbnQgdGV4dCBwcmVzZXJ2aW5nIG9yZGVyIGFuZCBpZGVudGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3tcblx0XHRcdGlkLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW1xuXHRcdFx0XHRtYXJrZG93bignTGV0IG1lIHJ1biB0aGUgdG9vbC4nKSxcblx0XHRcdFx0dG9vbENhbGxQYXJ0KHRvb2xDYWxsSWQsICdiYXNoJywgSlNPTi5zdHJpbmdpZnkoeyBjb21tYW5kOiAnbHMnIH0pLCAnZmlsZTFcXG5maWxlMicpLFxuXHRcdFx0XHRtYXJrZG93bignRG9uZS4nKSxcblx0XHRcdF0sXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHR9XTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHQvLyBUaGUgdG9vbCBjYWxsIGJlY29tZXMgYSBzdGFydCArIGNvbXBsZXRlIHBhaXIsIHdpdGggYXNzaXN0YW50IHRleHRcblx0XHQvLyBmbHVzaGVkIGJlZm9yZSBhbmQgYWZ0ZXIgaXQgYXMgc2VwYXJhdGUgYXNzaXN0YW50Lm1lc3NhZ2UgZXZlbnRzLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFtcblx0XHRcdCdzZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRcdCd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHQndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHsgdHVybnM6IHJlY29uc3RydWN0ZWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGNvbnN0IHByb2plY3RlZCA9IHJlY29uc3RydWN0ZWQubWFwKHR1cm4gPT4gKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0cGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGxcblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZTogcGFydC50b29sQ2FsbC50b29sTmFtZSxcblx0XHRcdFx0XHRzdGF0dXM6IHBhcnQudG9vbENhbGwuc3RhdHVzLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IChwYXJ0LnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUpLnN1Y2Nlc3MsXG5cdFx0XHRcdFx0b3V0cHV0OiAocGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5jb250ZW50Py5maW5kKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCk/LnRleHQsXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB7IGtpbmQ6IHBhcnQua2luZCwgY29udGVudDogKHBhcnQgYXMgeyBjb250ZW50OiBzdHJpbmcgfSkuY29udGVudCB9KSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3RlZCwgW3tcblx0XHRcdGlkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnTGV0IG1lIHJ1biB0aGUgdG9vbC4nIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGxJZCwgdG9vbE5hbWU6ICdiYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsIHN1Y2Nlc3M6IHRydWUsIG91dHB1dDogJ2ZpbGUxXFxuZmlsZTInIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0RvbmUuJyB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIGFycmF5IHRvb2wgaW5wdXQgZnJvbSBzdHJ1Y3R1cmVkIHNlc3Npb24gZXZlbnQgYXJndW1lbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyhbXG5cdFx0XHR1c2VyVHVybihnZW5lcmF0ZVV1aWQoKSwgJ3J1biBpdCcsIFt0b29sQ2FsbFBhcnQoZ2VuZXJhdGVVdWlkKCksICd0b29sJywgJ1tcIm9uZVwiLCBcInR3b1wiXScsICcnKV0pLFxuXHRcdF0sIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGNvbnN0IHN0YXJ0ZWQgPSBldmVudHMuZmluZChlID0+IGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyk7XG5cblx0XHRhc3NlcnQub2soc3RhcnRlZCAmJiBzdGFydGVkLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydGVkLmRhdGEuYXJndW1lbnRzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhIGZhaWxlZCB0b29sIGNhbGwgcHJlc2VydmluZyB0aGUgZXJyb3IgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3tcblx0XHRcdGlkLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAncnVuIGl0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogW3Rvb2xDYWxsUGFydCh0b29sQ2FsbElkLCAnYmFzaCcsICd7fScsICcnLCB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvck1lc3NhZ2U6ICdib29tJyB9KV0sXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHR9XTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBldmVudHMuZmluZChlID0+IGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlICYmIGNvbXBsZXRlLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS5kYXRhLnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUuZGF0YS5lcnJvcj8ubWVzc2FnZSwgJ2Jvb20nKTtcblxuXHRcdGNvbnN0IHsgdHVybnM6IHJlY29uc3RydWN0ZWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGNvbnN0IHRvb2xQYXJ0ID0gcmVjb25zdHJ1Y3RlZFswXS5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5vayh0b29sUGFydCAmJiB0b29sUGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRvb2xQYXJ0LnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUpLnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRvb2xQYXJ0LnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUpLmVycm9yPy5tZXNzYWdlLCAnYm9vbScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBzdWJhZ2VudC5zdGFydGVkIGZvciBhIHN1Yi1hZ2VudCB0b29sIGNhbGwgc28gdGhlIG5hbWUvZGVzY3JpcHRpb24gc3Vydml2ZSB0aGUgcm91bmQtdHJpcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3VzZXJUdXJuKGlkLCAnZGVsZWdhdGUnLCBbc3ViYWdlbnRUb29sQ2FsbFBhcnQodG9vbENhbGxJZCwgJ2Jhc2gnLCAnZXhwbG9yZScsICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLCAnZm91bmQgaXQnKV0pXTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHQvLyBgc3ViYWdlbnQuc3RhcnRlZGAgcHJlY2VkZXMgdGhlIHRvb2wgZXhlY3V0aW9uIHBhaXIgc28gYSByZXN1bWUgYXBwbGllc1xuXHRcdC8vIHRoZSBzdWItYWdlbnQgaWRlbnRpdHkgdG8gdGhlIHBhcmVudCB0b29sIGNhbGwuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMubWFwKGUgPT4gZS50eXBlKSwgW1xuXHRcdFx0J3Nlc3Npb24uc3RhcnQnLFxuXHRcdFx0J3VzZXIubWVzc2FnZScsXG5cdFx0XHQnc3ViYWdlbnQuc3RhcnRlZCcsXG5cdFx0XHQndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0J3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyxcblx0XHRdKTtcblx0XHRjb25zdCBzdGFydGVkID0gZXZlbnRzLmZpbmQoZSA9PiBlLnR5cGUgPT09ICdzdWJhZ2VudC5zdGFydGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHN0YXJ0ZWQgJiYgc3RhcnRlZC50eXBlID09PSAnc3ViYWdlbnQuc3RhcnRlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHRvb2xDYWxsSWQ6IHN0YXJ0ZWQuZGF0YS50b29sQ2FsbElkLCBhZ2VudE5hbWU6IHN0YXJ0ZWQuZGF0YS5hZ2VudE5hbWUsIGFnZW50RGVzY3JpcHRpb246IHN0YXJ0ZWQuZGF0YS5hZ2VudERlc2NyaXB0aW9uIH0sXG5cdFx0XHR7IHRvb2xDYWxsSWQsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyB9LFxuXHRcdCk7XG5cblx0XHRjb25zdCB7IHR1cm5zOiByZWNvbnN0cnVjdGVkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRjb25zdCB0b29sUGFydCA9IHJlY29uc3RydWN0ZWRbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbFBhcnQgJiYgdG9vbFBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRDb250ZW50ID0gKHRvb2xQYXJ0LnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUpLmNvbnRlbnQ/LmZpbmQoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0YXNzZXJ0Lm9rKHN1YmFnZW50Q29udGVudCAmJiBzdWJhZ2VudENvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudC5hZ2VudE5hbWUsIGRlc2NyaXB0aW9uOiBzdWJhZ2VudENvbnRlbnQuZGVzY3JpcHRpb24gfSxcblx0XHRcdHsgYWdlbnROYW1lOiAnZXhwbG9yZScsIGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldXNlcyBhIFVVSUQgdHVybiBpZCBhcyB0aGUgdXNlci5tZXNzYWdlIGVudmVsb3BlIGlkLCBtaW50aW5nIFVVSURzIGZvciBub24tVVVJRCBpZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWRBID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFtcblx0XHRcdHVzZXJUdXJuKGlkQSwgJ2ZpcnN0JywgW21hcmtkb3duKCdyMScpXSksXG5cdFx0XHR1c2VyVHVybignbm90LWEtdXVpZCcsICdzZWNvbmQnLCBbbWFya2Rvd24oJ3IyJyldKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gYnVpbGRTZXNzaW9uRXZlbnRzRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZCwgbW9kZWw6ICdncHQtNScgfSk7XG5cblx0XHQvLyBTaGFwZTogc2Vzc2lvbi5zdGFydCwgKHVzZXIubWVzc2FnZSwgYXNzaXN0YW50Lm1lc3NhZ2UpIHgyLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFtcblx0XHRcdCdzZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRdKTtcblxuXHRcdC8vIEZpcnN0IGV2ZW50IHJvb3RzIHRoZSBjaGFpbjsgZXZlcnkgc3Vic2VxdWVudCBldmVudCBsaW5rcyB0byBpdHMgcHJlZGVjZXNzb3IuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50c1swXS5wYXJlbnRJZCwgbnVsbCk7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBldmVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbaV0ucGFyZW50SWQsIGV2ZW50c1tpIC0gMV0uaWQsIGBldmVudCAke2l9IG11c3QgbGluayB0byBpdHMgcHJlZGVjZXNzb3JgKTtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VySWRzID0gZXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ3VzZXIubWVzc2FnZScpLm1hcChlID0+IGUuaWQpO1xuXHRcdC8vIFRoZSBVVUlEIGlkIGlzIHJldXNlZCB2ZXJiYXRpbTsgdGhlIG5vbi1VVUlEIGlkIGlzIHJlcGxhY2VkIHdpdGggYSBtaW50ZWQgVVVJRC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlcklkc1swXSwgaWRBKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodXNlcklkc1sxXSwgJ25vdC1hLXV1aWQnKTtcblx0XHRhc3NlcnQub2soZXZlbnRzLmV2ZXJ5KGUgPT4gaXNVVUlEKGUuaWQpKSwgJ2FsbCBldmVudCBpZHMgbXVzdCBiZSBVVUlEcycpO1xuXG5cdFx0Ly8gc2Vzc2lvbi5zdGFydCBjYXJyaWVzIHRoZSBzZXNzaW9uIGlkIGFuZCBzZWxlY3RlZCBtb2RlbC5cblx0XHRjb25zdCBzdGFydCA9IGV2ZW50c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudHlwZSA9PT0gJ3Nlc3Npb24uc3RhcnQnICYmIHN0YXJ0LmRhdGEuc2Vzc2lvbklkLCBzZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50eXBlID09PSAnc2Vzc2lvbi5zdGFydCcgJiYgc3RhcnQuZGF0YS5zZWxlY3RlZE1vZGVsLCAnZ3B0LTUnKTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgdGhlIGFzc2lzdGFudC5tZXNzYWdlIGZvciBhIHR1cm4gd2l0aCBubyByZXNwb25zZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbdXNlclR1cm4oJ3R1cm4tZW1wdHknLCAnanVzdCBhIG5vdGUnLCBbXSldO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gYnVpbGRTZXNzaW9uRXZlbnRzRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFsnc2Vzc2lvbi5zdGFydCcsICd1c2VyLm1lc3NhZ2UnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZXMgdG8gbmV3bGluZS10ZXJtaW5hdGVkIEpTT05MIHdob3NlIGxpbmVzIHBhcnNlIGJhY2sgdG8gdGhlIHNhbWUgZXZlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybigndHVybi1hJywgJ1doYXQgaXMgMisyPycsIFttYXJrZG93bignSXQgaXMgNC4nKV0pLFxuXHRcdFx0dXNlclR1cm4oJ3R1cm4tYicsICdFeHBsYWluLicsIFtyZWFzb25pbmcoJ21hdGgnKSwgbWFya2Rvd24oJ0JlY2F1c2UgYXJpdGhtZXRpYy4nKV0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGNvbnN0IGpzb25sID0gc2VyaWFsaXplU2Vzc2lvbkV2ZW50c1RvSnNvbmwoZXZlbnRzKTtcblxuXHRcdC8vIE9uZSBKU09OIG9iamVjdCBwZXIgbGluZSwgdGVybWluYXRlZCBieSBhIHRyYWlsaW5nIG5ld2xpbmUuXG5cdFx0YXNzZXJ0Lm9rKGpzb25sLmVuZHNXaXRoKCdcXG4nKSwgJ2pzb25sIG11c3QgYmUgbmV3bGluZS10ZXJtaW5hdGVkJyk7XG5cdFx0Y29uc3QgbGluZXMgPSBqc29ubC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXMubGVuZ3RoLCBldmVudHMubGVuZ3RoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkpLCBldmVudHMpO1xuXG5cdFx0Ly8gRW1wdHkgaW5wdXQgc2VyaWFsaXplcyB0byB0aGUgZW1wdHkgc3RyaW5nLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVTZXNzaW9uRXZlbnRzVG9Kc29ubChbXSksICcnKTtcblx0fSk7XG5cblx0dGVzdCgndGhlIG9uLWRpc2sgSlNPTkwgYnl0ZXMgcmVjb25zdHJ1Y3QgdGhlIG9yaWdpbmFsIHR1cm5zIGVuZCB0byBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFtcblx0XHRcdHVzZXJUdXJuKGdlbmVyYXRlVXVpZCgpLCAnV2hhdCBpcyAyKzI/JywgW21hcmtkb3duKCdJdCBpcyA0LicpXSksXG5cdFx0XHR1c2VyVHVybihnZW5lcmF0ZVV1aWQoKSwgJ0V4cGxhaW4gd2h5LicsIFtyZWFzb25pbmcoJzIgcGx1cyAyLi4uJyksIG1hcmtkb3duKCdCZWNhdXNlIGFyaXRobWV0aWMuJyldKSxcblx0XHRdO1xuXG5cdFx0Ly8gRnVsbCBwYXRoIGEgcmVhbCBpbXBvcnQgdGFrZXM6IHR1cm5zIC0+IGV2ZW50cy5qc29ubCBzdHJpbmcgLT4gKHdyaXRlIHRvIGRpc2spIC0+XG5cdFx0Ly8gcGFyc2UgZWFjaCBsaW5lIC0+IHJlY29uc3RydWN0IHR1cm5zLlxuXHRcdGNvbnN0IGpzb25sID0gYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGNvbnN0IHBhcnNlZCA9IGpzb25sLnNwbGl0KCdcXG4nKS5maWx0ZXIobGluZSA9PiBsaW5lLmxlbmd0aCA+IDApLm1hcChsaW5lID0+IEpTT04ucGFyc2UobGluZSkgYXMgU2Vzc2lvbkV2ZW50KTtcblx0XHRjb25zdCB7IHR1cm5zOiByZWNvbnN0cnVjdGVkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgcGFyc2VkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvamVjdChyZWNvbnN0cnVjdGVkKSwgcHJvamVjdCh0dXJucykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYSxrQkFBa0IsNEJBQTRCLGdCQUFnQix1QkFBdUIsaUJBQTRFO0FBQ3ZMLFNBQVMsK0JBQStCLDZCQUE2QixxQ0FBcUM7QUFDMUcsU0FBUyx3QkFBd0I7QUFHakMsTUFBTSxrRUFBNkQs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
