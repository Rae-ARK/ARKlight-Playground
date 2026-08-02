import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentSession } from "../../common/agentService.js";
import { FileEditKind, MessageKind, ResponsePartKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
import { mapSessionEventsToHistoryRecords } from "./historyRecordFixtures.js";
import { mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
import { toSessionEvents } from "./copilotTestEvents.js";
suite("mapSessionEventsToHistoryRecords", () => {
  const disposables = new DisposableStore();
  let db;
  const session = AgentSession.uri("copilot", "test-session");
  teardown(async () => {
    disposables.clear();
    await db?.close();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps user and assistant messages", async () => {
    const events = [
      { type: "user.message", data: { messageId: "msg-1", content: "hello" } },
      { type: "assistant.message", data: { messageId: "msg-2", content: "world" } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      session,
      type: "message",
      role: "user",
      messageId: "msg-1",
      content: "hello",
      toolRequests: void 0,
      reasoningOpaque: void 0,
      reasoningText: void 0,
      encryptedContent: void 0,
      parentToolCallId: void 0
    });
    assert.strictEqual(result[1].type, "message");
    assert.strictEqual(result[1].role, "assistant");
  });
  test("maps tool start and complete events", async () => {
    const events = [
      {
        type: "tool.execution_start",
        data: { toolCallId: "tc-1", toolName: "shell", arguments: { command: "echo hi" } }
      },
      {
        type: "tool.execution_complete",
        data: { toolCallId: "tc-1", success: true, result: { content: "hi\n" } }
      }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "tool_start");
    assert.strictEqual(result[1].type, "tool_complete");
    const complete = result[1];
    assert.ok(complete.result.content);
    assert.strictEqual(complete.result.content[0].type, ToolResultContentType.Text);
  });
  test("maps task_complete to a root markdown response part", async () => {
    const events = [
      { type: "user.message", id: "turn-1", data: { messageId: "msg-1", content: "finish this" } },
      { type: "tool.execution_start", data: { toolCallId: "tc-read", toolName: "view", arguments: { path: "/workspace/index.html" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-read", success: true, result: { content: "file contents" } } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task-complete", toolName: "task_complete", arguments: { summary: "Reviewed index.html." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task-complete", success: true, result: { content: "Reviewed index.html." } } }
    ];
    const result = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(result.turns.map((turn) => ({
      message: turn.message,
      state: turn.state,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.ToolCall ? {
        kind: part.kind,
        toolName: part.toolCall.toolName
      } : {
        kind: part.kind,
        content: part.kind === ResponsePartKind.Markdown ? part.content : void 0
      })
    })), [{
      message: { text: "finish this", origin: { kind: MessageKind.User } },
      state: "complete",
      parts: [
        { kind: ResponsePartKind.ToolCall, toolName: "view" },
        { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Reviewed index.html." }
      ]
    }]);
  });
  test("drops orphan task_complete without synthesizing a turn", async () => {
    const events = [
      { type: "tool.execution_start", data: { toolCallId: "tc-task-complete", toolName: "task_complete", arguments: { summary: "Done." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task-complete", success: true, result: { content: "Done." } } }
    ];
    const result = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(result.turns, []);
  });
  test("skips tool_complete without matching tool_start", async () => {
    const events = [
      { type: "tool.execution_complete", data: { toolCallId: "orphan", success: true } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 0);
  });
  test("ignores unknown event types", async () => {
    const events = [
      { type: "some.unknown.event", data: {} },
      { type: "user.message", data: { messageId: "msg-1", content: "test" } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 1);
  });
  suite("file edit restoration", () => {
    test("restores file edits from database for edit tools", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-edit",
        filePath: "/workspace/file.ts",
        kind: FileEditKind.Edit,
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: 3,
        removedLines: 1
      });
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-edit", toolName: "edit", arguments: { filePath: "/workspace/file.ts" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-edit", success: true, result: { content: "Edited file.ts" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const complete = result[1];
      assert.strictEqual(complete.type, "tool_complete");
      const content = complete.result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 2);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
      assert.strictEqual(content[1].type, ToolResultContentType.FileEdit);
      const fileEdit = content[1];
      const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
      assert.ok(beforeFields);
      assert.strictEqual(beforeFields.toolCallId, "tc-edit");
      assert.strictEqual(beforeFields.filePath, "/workspace/file.ts");
      assert.strictEqual(beforeFields.part, "before");
      assert.deepStrictEqual(fileEdit.diff, { added: 3, removed: 1 });
    });
    test("handles multiple file edits for one tool call", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-multi",
        filePath: "/workspace/a.ts",
        kind: FileEditKind.Edit,
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("a"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-multi",
        filePath: "/workspace/b.ts",
        kind: FileEditKind.Edit,
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("b"),
        addedLines: void 0,
        removedLines: void 0
      });
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-multi", toolName: "edit" }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-multi", success: true }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const content = result[1].result.content;
      assert.ok(content);
      const fileEdits = content.filter((c) => c.type === ToolResultContentType.FileEdit);
      assert.strictEqual(fileEdits.length, 2);
    });
    test("works without database (no file edits restored)", async () => {
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "edit", arguments: { filePath: "/workspace/file.ts" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-1", success: true, result: { content: "done" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      const content = result[1].result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 1);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
    });
    test("non-edit tools do not get file edits even if db has data", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "shell", arguments: { command: "ls" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-1", success: true, result: { content: "files" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const content = result[1].result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 1);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
    });
  });
  suite("subagent events", () => {
    test("maps subagent.started event to subagent_started progress event", async () => {
      const events = [
        {
          type: "subagent.started",
          data: {
            toolCallId: "tc-1",
            agentName: "code-reviewer",
            agentDisplayName: "Code Reviewer",
            agentDescription: "Reviews code"
          }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, "subagent_started");
      const event = result[0];
      assert.strictEqual(event.toolCallId, "tc-1");
      assert.strictEqual(event.agentName, "code-reviewer");
      assert.strictEqual(event.agentDisplayName, "Code Reviewer");
    });
  });
  suite("skill events", () => {
    test("synthesizes tool start/complete from skill.invoked and filters synthetic skill-injected user messages", async () => {
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-skill", toolName: "skill", arguments: { skill: "plan" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-skill", success: true }
        },
        {
          type: "skill.invoked",
          id: "evt-42",
          data: { name: "plan", path: "/abs/repo/skills/plan/SKILL.md" }
        },
        {
          type: "user.message",
          data: { messageId: "msg-skill", content: "<skill content body>", source: "skill-plan" }
        },
        {
          type: "assistant.message",
          data: { messageId: "msg-1", content: "ok" }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      assert.deepStrictEqual({
        count: result.length,
        types: result.map((r) => r.type),
        skillStart: result[0],
        skillComplete: result[1],
        assistantRole: result[2].role
      }, {
        count: 3,
        types: ["tool_start", "tool_complete", "message"],
        skillStart: {
          session,
          type: "tool_start",
          toolCallId: "synth-skill-evt-42",
          toolName: "skill",
          displayName: "Read Skill",
          invocationMessage: { markdown: "Reading skill [plan](file:///abs/repo/skills/plan/SKILL.md)" }
        },
        skillComplete: {
          session,
          type: "tool_complete",
          toolCallId: "synth-skill-evt-42",
          result: {
            success: true,
            pastTenseMessage: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" }
          }
        },
        assistantRole: "assistant"
      });
    });
  });
  suite("cd-prefix rewriting", () => {
    const cwd = URI.file("/workspace/proj");
    function makeBashEvent(command, toolCallId = "tc-1") {
      return {
        type: "tool.execution_start",
        data: { toolCallId, toolName: "bash", arguments: { command } }
      };
    }
    function getStart(events) {
      return events[0];
    }
    test("strips redundant bash cd prefix matching workingDirectory", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls -la")
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls -la");
    });
    test("leaves command unchanged when cd dir does not match", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /other && ls")
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "cd /other && ls");
    });
    test("leaves command unchanged when no workingDirectory provided", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls")
      ]);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "cd /workspace/proj && ls");
    });
    test("non-shell tools are not rewritten even with matching command field", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "edit", arguments: { command: "cd /workspace/proj && ls" } }
        }
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, '{\n  "command": "cd /workspace/proj && ls"\n}');
    });
    test("handles trailing slash on workingDirectory", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls")
      ], URI.file("/workspace/proj/"));
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls");
    });
    test("handles quoted directory in cd prefix", async () => {
      const cwdWithSpaces = URI.file("/workspace/my proj");
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent('cd "/workspace/my proj" && ls')
      ], cwdWithSpaces);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls");
    });
    test("rewrites powershell commands too", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "powershell", arguments: { command: "cd /workspace/proj; dir" } }
        }
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "dir");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvaGlzdG9yeVJlY29yZEZpeHR1cmVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdEtpbmQsIE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IHBhcnNlU2Vzc2lvbkRiVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYlVyaS5qcyc7XG5pbXBvcnQgeyBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyB9IGZyb20gJy4vaGlzdG9yeVJlY29yZEZpeHR1cmVzLmpzJztcbmltcG9ydCB7IG1hcFNlc3Npb25FdmVudHMgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyB0b1Nlc3Npb25FdmVudHMsIHR5cGUgSVNlc3Npb25FdmVudCB9IGZyb20gJy4vY29waWxvdFRlc3RFdmVudHMuanMnO1xuXG5zdWl0ZSgnbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBkYjogU2Vzc2lvbkRhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRhd2FpdCBkYj8uY2xvc2UoKTtcblx0fSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0gQmFzaWMgZXZlbnQgbWFwcGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ21hcHMgdXNlciBhbmQgYXNzaXN0YW50IG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdoZWxsbycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ21zZy0yJywgY29udGVudDogJ3dvcmxkJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIHtcblx0XHRcdHNlc3Npb24sXG5cdFx0XHR0eXBlOiAnbWVzc2FnZScsXG5cdFx0XHRyb2xlOiAndXNlcicsXG5cdFx0XHRtZXNzYWdlSWQ6ICdtc2ctMScsXG5cdFx0XHRjb250ZW50OiAnaGVsbG8nLFxuXHRcdFx0dG9vbFJlcXVlc3RzOiB1bmRlZmluZWQsXG5cdFx0XHRyZWFzb25pbmdPcGFxdWU6IHVuZGVmaW5lZCxcblx0XHRcdHJlYXNvbmluZ1RleHQ6IHVuZGVmaW5lZCxcblx0XHRcdGVuY3J5cHRlZENvbnRlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLnR5cGUsICdtZXNzYWdlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHRbMV0gYXMgeyByb2xlOiBzdHJpbmcgfSkucm9sZSwgJ2Fzc2lzdGFudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRvb2wgc3RhcnQgYW5kIGNvbXBsZXRlIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnc2hlbGwnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGknIH0gfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ2hpXFxuJyB9IH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0udHlwZSwgJ3Rvb2xfc3RhcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLnR5cGUsICd0b29sX2NvbXBsZXRlJyk7XG5cblx0XHRjb25zdCBjb21wbGV0ZSA9IHJlc3VsdFsxXSBhcyB7IHJlc3VsdDogeyBjb250ZW50PzogcmVhZG9ubHkgeyB0eXBlOiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfVtdIH0gfTtcblx0XHRhc3NlcnQub2soY29tcGxldGUucmVzdWx0LmNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS5yZXN1bHQuY29udGVudFswXS50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgdGFza19jb21wbGV0ZSB0byBhIHJvb3QgbWFya2Rvd24gcmVzcG9uc2UgcGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndHVybi0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdmaW5pc2ggdGhpcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1yZWFkJywgdG9vbE5hbWU6ICd2aWV3JywgYXJndW1lbnRzOiB7IHBhdGg6ICcvd29ya3NwYWNlL2luZGV4Lmh0bWwnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1yZWFkJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdmaWxlIGNvbnRlbnRzJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzay1jb21wbGV0ZScsIHRvb2xOYW1lOiAndGFza19jb21wbGV0ZScsIGFyZ3VtZW50czogeyBzdW1tYXJ5OiAnUmV2aWV3ZWQgaW5kZXguaHRtbC4nIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrLWNvbXBsZXRlJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdSZXZpZXdlZCBpbmRleC5odG1sLicgfSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZSxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyB7XG5cdFx0XHRcdGtpbmQ6IHBhcnQua2luZCxcblx0XHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHR9IDoge1xuXHRcdFx0XHRraW5kOiBwYXJ0LmtpbmQsXG5cdFx0XHRcdGNvbnRlbnQ6IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biA/IHBhcnQuY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdH0pLFxuXHRcdH0pKSwgW3tcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2ZpbmlzaCB0aGlzJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0c3RhdGU6ICdjb21wbGV0ZScsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xOYW1lOiAndmlldycgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnXFxuXFxuKipUYXNrIGNvbXBsZXRlZDoqKiBSZXZpZXdlZCBpbmRleC5odG1sLicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBvcnBoYW4gdGFza19jb21wbGV0ZSB3aXRob3V0IHN5bnRoZXNpemluZyBhIHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2stY29tcGxldGUnLCB0b29sTmFtZTogJ3Rhc2tfY29tcGxldGUnLCBhcmd1bWVudHM6IHsgc3VtbWFyeTogJ0RvbmUuJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzay1jb21wbGV0ZScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnRG9uZS4nIH0gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnR1cm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHRvb2xfY29tcGxldGUgd2l0aG91dCBtYXRjaGluZyB0b29sX3N0YXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICdvcnBoYW4nLCBzdWNjZXNzOiB0cnVlIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB1bmtub3duIGV2ZW50IHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAnc29tZS51bmtub3duLmV2ZW50JywgZGF0YToge30gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAndGVzdCcgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHQvLyAtLS0tIEZpbGUgZWRpdCByZXN0b3JhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZmlsZSBlZGl0IHJlc3RvcmF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVzdG9yZXMgZmlsZSBlZGl0cyBmcm9tIGRhdGFiYXNlIGZvciBlZGl0IHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zdG9yZUZpbGVFZGl0KHtcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWVkaXQnLFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2JlZm9yZScpLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYWZ0ZXInKSxcblx0XHRcdFx0YWRkZWRMaW5lczogMyxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiAxLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1lZGl0JywgdG9vbE5hbWU6ICdlZGl0JywgYXJndW1lbnRzOiB7IGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLWVkaXQnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ0VkaXRlZCBmaWxlLnRzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCBkYiwgZXZlbnRzKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRlID0gcmVzdWx0WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnR5cGUsICd0b29sX2NvbXBsZXRlJyk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAoY29tcGxldGUgYXMgeyByZXN1bHQ6IHsgY29udGVudD86IHJlYWRvbmx5IFJlY29yZDxzdHJpbmcsIHVua25vd24+W10gfSB9KS5yZXN1bHQuY29udGVudDtcblx0XHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRcdC8vIFNob3VsZCBoYXZlIHRleHQgY29udGVudCArIGZpbGUgZWRpdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50WzBdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50WzFdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCk7XG5cblx0XHRcdC8vIEZpbGUgZWRpdCBVUklzIHNob3VsZCBiZSBwYXJzZWFibGVcblx0XHRcdGNvbnN0IGZpbGVFZGl0ID0gY29udGVudFsxXSBhcyB7IGJlZm9yZTogeyB1cmk6IGFueTsgY29udGVudDogeyB1cmk6IGFueSB9IH07IGFmdGVyOiB7IHVyaTogYW55OyBjb250ZW50OiB7IHVyaTogYW55IH0gfTsgZGlmZj86IHsgYWRkZWQ/OiBudW1iZXI7IHJlbW92ZWQ/OiBudW1iZXIgfSB9O1xuXHRcdFx0Y29uc3QgYmVmb3JlRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkoZmlsZUVkaXQuYmVmb3JlLmNvbnRlbnQudXJpKTtcblx0XHRcdGFzc2VydC5vayhiZWZvcmVGaWVsZHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZUZpZWxkcy50b29sQ2FsbElkLCAndGMtZWRpdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZUZpZWxkcy5maWxlUGF0aCwgJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZUZpZWxkcy5wYXJ0LCAnYmVmb3JlJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVFZGl0LmRpZmYsIHsgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG11bHRpcGxlIGZpbGUgZWRpdHMgZm9yIG9uZSB0b29sIGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0XHRhd2FpdCBkYi5jcmVhdGVUdXJuKCd0dXJuLTEnKTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbXVsdGknLFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYS50cycsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2EnKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1tdWx0aScsXG5cdFx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9iLnRzJyxcblx0XHRcdFx0a2luZDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IG5ldyBVaW50OEFycmF5KDApLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnYicpLFxuXHRcdFx0XHRhZGRlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1tdWx0aScsIHRvb2xOYW1lOiAnZWRpdCcgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtbXVsdGknLCBzdWNjZXNzOiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCBkYiwgZXZlbnRzKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAocmVzdWx0WzFdIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gfSkucmVzdWx0LmNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0XHQvLyBUd28gZmlsZSBlZGl0cyAobm8gdGV4dCBzaW5jZSByZXN1bHQgaGFkIG5vIGNvbnRlbnQpXG5cdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBjb250ZW50LmZpbHRlcihjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dvcmtzIHdpdGhvdXQgZGF0YWJhc2UgKG5vIGZpbGUgZWRpdHMgcmVzdG9yZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2VkaXQnLCBhcmd1bWVudHM6IHsgZmlsZVBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnZG9uZScgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IChyZXN1bHRbMV0gYXMgeyByZXN1bHQ6IHsgY29udGVudD86IHJlYWRvbmx5IFJlY29yZDxzdHJpbmcsIHVua25vd24+W10gfSB9KS5yZXN1bHQuY29udGVudDtcblx0XHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRcdC8vIE9ubHkgdGV4dCBjb250ZW50LCBubyBmaWxlIGVkaXRzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRbMF0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLWVkaXQgdG9vbHMgZG8gbm90IGdldCBmaWxlIGVkaXRzIGV2ZW4gaWYgZGIgaGFzIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdzaGVsbCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnbHMnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnZmlsZXMnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIGRiLCBldmVudHMpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IChyZXN1bHRbMV0gYXMgeyByZXN1bHQ6IHsgY29udGVudD86IHJlYWRvbmx5IFJlY29yZDxzdHJpbmcsIHVua25vd24+W10gfSB9KS5yZXN1bHQuY29udGVudDtcblx0XHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudFswXS50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU3ViYWdlbnQgZXZlbnRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdzdWJhZ2VudCBldmVudHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIHN1YmFnZW50LnN0YXJ0ZWQgZXZlbnQgdG8gc3ViYWdlbnRfc3RhcnRlZCBwcm9ncmVzcyBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N1YmFnZW50LnN0YXJ0ZWQnLFxuXHRcdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0XHRcdGFnZW50TmFtZTogJ2NvZGUtcmV2aWV3ZXInLFxuXHRcdFx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogJ0NvZGUgUmV2aWV3ZXInLFxuXHRcdFx0XHRcdFx0YWdlbnREZXNjcmlwdGlvbjogJ1Jldmlld3MgY29kZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0udHlwZSwgJ3N1YmFnZW50X3N0YXJ0ZWQnKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gcmVzdWx0WzBdIGFzIHsgdHlwZTogc3RyaW5nOyB0b29sQ2FsbElkOiBzdHJpbmc7IGFnZW50TmFtZTogc3RyaW5nOyBhZ2VudERpc3BsYXlOYW1lOiBzdHJpbmcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC50b29sQ2FsbElkLCAndGMtMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmFnZW50TmFtZSwgJ2NvZGUtcmV2aWV3ZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5hZ2VudERpc3BsYXlOYW1lLCAnQ29kZSBSZXZpZXdlcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNraWxsIGV2ZW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2tpbGwgZXZlbnRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3ludGhlc2l6ZXMgdG9vbCBzdGFydC9jb21wbGV0ZSBmcm9tIHNraWxsLmludm9rZWQgYW5kIGZpbHRlcnMgc3ludGhldGljIHNraWxsLWluamVjdGVkIHVzZXIgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtc2tpbGwnLCB0b29sTmFtZTogJ3NraWxsJywgYXJndW1lbnRzOiB7IHNraWxsOiAncGxhbicgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1za2lsbCcsIHN1Y2Nlc3M6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdza2lsbC5pbnZva2VkJyxcblx0XHRcdFx0XHRpZDogJ2V2dC00MicsXG5cdFx0XHRcdFx0ZGF0YTogeyBuYW1lOiAncGxhbicsIHBhdGg6ICcvYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndXNlci5tZXNzYWdlJyxcblx0XHRcdFx0XHRkYXRhOiB7IG1lc3NhZ2VJZDogJ21zZy1za2lsbCcsIGNvbnRlbnQ6ICc8c2tpbGwgY29udGVudCBib2R5PicsIHNvdXJjZTogJ3NraWxsLXBsYW4nIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLFxuXHRcdFx0XHRcdGRhdGE6IHsgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnb2snIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjb3VudDogcmVzdWx0Lmxlbmd0aCxcblx0XHRcdFx0dHlwZXM6IHJlc3VsdC5tYXAociA9PiByLnR5cGUpLFxuXHRcdFx0XHRza2lsbFN0YXJ0OiByZXN1bHRbMF0sXG5cdFx0XHRcdHNraWxsQ29tcGxldGU6IHJlc3VsdFsxXSxcblx0XHRcdFx0YXNzaXN0YW50Um9sZTogKHJlc3VsdFsyXSBhcyB7IHJvbGU6IHN0cmluZyB9KS5yb2xlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb3VudDogMyxcblx0XHRcdFx0dHlwZXM6IFsndG9vbF9zdGFydCcsICd0b29sX2NvbXBsZXRlJywgJ21lc3NhZ2UnXSxcblx0XHRcdFx0c2tpbGxTdGFydDoge1xuXHRcdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2xfc3RhcnQnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdzeW50aC1za2lsbC1ldnQtNDInLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiAnc2tpbGwnLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBTa2lsbCcsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdSZWFkaW5nIHNraWxsIFtwbGFuXShmaWxlOi8vL2Ficy9yZXBvL3NraWxscy9wbGFuL1NLSUxMLm1kKScgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2tpbGxDb21wbGV0ZToge1xuXHRcdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2xfY29tcGxldGUnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdzeW50aC1za2lsbC1ldnQtNDInLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHsgbWFya2Rvd246ICdSZWFkIHNraWxsIFtwbGFuXShmaWxlOi8vL2Ficy9yZXBvL3NraWxscy9wbGFuL1NLSUxMLm1kKScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3Npc3RhbnRSb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIGNkLXByZWZpeCByZXdyaXRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnY2QtcHJlZml4IHJld3JpdGluZycsICgpID0+IHtcblxuXHRcdGNvbnN0IGN3ZCA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Byb2onKTtcblxuXHRcdGZ1bmN0aW9uIG1ha2VCYXNoRXZlbnQoY29tbWFuZDogc3RyaW5nLCB0b29sQ2FsbElkID0gJ3RjLTEnKTogSVNlc3Npb25FdmVudCB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kIH0gfSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0U3RhcnQoZXZlbnRzOiBSZXR1cm5UeXBlPHR5cGVvZiBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3Jkcz4gZXh0ZW5kcyBQcm9taXNlPGluZmVyIFI+ID8gUiA6IG5ldmVyKSB7XG5cdFx0XHRyZXR1cm4gZXZlbnRzWzBdIGFzIHsgdG9vbElucHV0OiBzdHJpbmcgfTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzdHJpcHMgcmVkdW5kYW50IGJhc2ggY2QgcHJlZml4IG1hdGNoaW5nIHdvcmtpbmdEaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0bWFrZUJhc2hFdmVudCgnY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzIC1sYScpLFxuXHRcdFx0XSwgY3dkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZ2V0U3RhcnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50b29sSW5wdXQsICdscyAtbGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyBjb21tYW5kIHVuY2hhbmdlZCB3aGVuIGNkIGRpciBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgW1xuXHRcdFx0XHRtYWtlQmFzaEV2ZW50KCdjZCAvb3RoZXIgJiYgbHMnKSxcblx0XHRcdF0sIGN3ZCk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudG9vbElucHV0LCAnY2QgL290aGVyICYmIGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgY29tbWFuZCB1bmNoYW5nZWQgd2hlbiBubyB3b3JraW5nRGlyZWN0b3J5IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBbXG5cdFx0XHRcdG1ha2VCYXNoRXZlbnQoJ2NkIC93b3Jrc3BhY2UvcHJvaiAmJiBscycpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudG9vbElucHV0LCAnY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub24tc2hlbGwgdG9vbHMgYXJlIG5vdCByZXdyaXR0ZW4gZXZlbiB3aXRoIG1hdGNoaW5nIGNvbW1hbmQgZmllbGQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnZWRpdCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLCBjd2QpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBnZXRTdGFydChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LnRvb2xJbnB1dCwgJ3tcXG4gIFwiY29tbWFuZFwiOiBcImNkIC93b3Jrc3BhY2UvcHJvaiAmJiBsc1wiXFxufScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB0cmFpbGluZyBzbGFzaCBvbiB3b3JraW5nRGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBbXG5cdFx0XHRcdG1ha2VCYXNoRXZlbnQoJ2NkIC93b3Jrc3BhY2UvcHJvaiAmJiBscycpLFxuXHRcdFx0XSwgVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvai8nKSk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudG9vbElucHV0LCAnbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgcXVvdGVkIGRpcmVjdG9yeSBpbiBjZCBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjd2RXaXRoU3BhY2VzID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvbXkgcHJvaicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBbXG5cdFx0XHRcdG1ha2VCYXNoRXZlbnQoJ2NkIFwiL3dvcmtzcGFjZS9teSBwcm9qXCIgJiYgbHMnKSxcblx0XHRcdF0sIGN3ZFdpdGhTcGFjZXMpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBnZXRTdGFydChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LnRvb2xJbnB1dCwgJ2xzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXdyaXRlcyBwb3dlcnNoZWxsIGNvbW1hbmRzIHRvbycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdwb3dlcnNoZWxsJywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdjZCAvd29ya3NwYWNlL3Byb2o7IGRpcicgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSwgY3dkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZ2V0U3RhcnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50b29sSW5wdXQsICdkaXInKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxjQUFjLGFBQWEsa0JBQWtCLDZCQUE2QjtBQUNuRixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUEyQztBQUVwRCxNQUFNLG9DQUFvQyxNQUFNO0FBRS9DLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxNQUFJO0FBQ0osUUFBTSxVQUFVLGFBQWEsSUFBSSxXQUFXLGNBQWM7QUFFMUQsV0FBUyxZQUFZO0FBQ3BCLGdCQUFZLE1BQU07QUFDbEIsVUFBTSxJQUFJLE1BQU07QUFBQSxFQUNqQixDQUFDO0FBQ0QsMENBQXdDO0FBSXhDLE9BQUssb0NBQW9DLFlBQVk7QUFDcEQsVUFBTSxTQUEw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RSxjQUFjLDBCQUEwQjtBQUFBLE1BQ3pDLENBQUM7QUFDRCxZQUFNLFFBQVEsU0FBUyxNQUFNO0FBQzdCLGFBQU8sWUFBWSxNQUFNLFdBQVcsMEJBQTBCO0FBQUEsSUFDL0QsQ0FBQztBQUVELFNBQUssc0VBQXNFLFlBQVk7QUFDdEYsWUFBTSxTQUFTLE1BQU0saUNBQWlDLFNBQVMsUUFBVztBQUFBLFFBQ3pFO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixNQUFNLEVBQUUsWUFBWSxRQUFRLFVBQVUsUUFBUSxXQUFXLEVBQUUsU0FBUywyQkFBMkIsRUFBRTtBQUFBLFFBQ2xHO0FBQUEsTUFDRCxHQUFHLEdBQUc7QUFDTixZQUFNLFFBQVEsU0FBUyxNQUFNO0FBQzdCLGFBQU8sWUFBWSxNQUFNLFdBQVcsK0NBQStDO0FBQUEsSUFDcEYsQ0FBQztBQUVELFNBQUssOENBQThDLFlBQVk7QUFDOUQsWUFBTSxTQUFTLE1BQU0saUNBQWlDLFNBQVMsUUFBVztBQUFBLFFBQ3pFLGNBQWMsMEJBQTBCO0FBQUEsTUFDekMsR0FBRyxJQUFJLEtBQUssa0JBQWtCLENBQUM7QUFDL0IsWUFBTSxRQUFRLFNBQVMsTUFBTTtBQUM3QixhQUFPLFlBQVksTUFBTSxXQUFXLElBQUk7QUFBQSxJQUN6QyxDQUFDO0FBRUQsU0FBSyx5Q0FBeUMsWUFBWTtBQUN6RCxZQUFNLGdCQUFnQixJQUFJLEtBQUssb0JBQW9CO0FBQ25ELFlBQU0sU0FBUyxNQUFNLGlDQUFpQyxTQUFTLFFBQVc7QUFBQSxRQUN6RSxjQUFjLCtCQUErQjtBQUFBLE1BQzlDLEdBQUcsYUFBYTtBQUNoQixZQUFNLFFBQVEsU0FBUyxNQUFNO0FBQzdCLGFBQU8sWUFBWSxNQUFNLFdBQVcsSUFBSTtBQUFBLElBQ3pDLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxZQUFZO0FBQ3BELFlBQU0sU0FBUyxNQUFNLGlDQUFpQyxTQUFTLFFBQVc7QUFBQSxRQUN6RTtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sTUFBTSxFQUFFLFlBQVksUUFBUSxVQUFVLGNBQWMsV0FBVyxFQUFFLFNBQVMsMEJBQTBCLEVBQUU7QUFBQSxRQUN2RztBQUFBLE1BQ0QsR0FBRyxHQUFHO0FBQ04sWUFBTSxRQUFRLFNBQVMsTUFBTTtBQUM3QixhQUFPLFlBQVksTUFBTSxXQUFXLEtBQUs7QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
