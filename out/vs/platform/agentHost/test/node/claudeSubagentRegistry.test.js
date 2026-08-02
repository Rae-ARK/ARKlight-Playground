import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType } from "../../common/state/protocol/state.js";
import { scanTranscriptForAgentIds, SUBAGENT_ID_SUFFIX_REGEX, SubagentRegistry, SubagentSpawn } from "../../node/claude/claudeSubagentRegistry.js";
function makeAgentToolCallTurn(toolCallId, opts) {
  return {
    id: "turn-" + toolCallId,
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts: [{
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        toolCallId,
        toolName: opts.toolName ?? "Task",
        displayName: "Task",
        status: opts.status ?? ToolCallStatus.Completed,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        invocationMessage: "invoking task",
        success: true,
        pastTenseMessage: "task done",
        content: opts.suffixText !== void 0 ? [{ type: ToolResultContentType.Text, text: opts.suffixText }] : void 0
      }
    }],
    state: 0,
    startedAt: "1970-01-01T00:00:00.001Z",
    duration: 2,
    usage: void 0
  };
}
suite("SubagentSpawn", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agentId is set-once via setAgentId; subagentType/description/background are mutable; markAnnounced and markCompleted are first-call-true-then-false", () => {
    const spawn = new SubagentSpawn("toolu_x");
    const beforeSet = spawn.agentId;
    spawn.setAgentId("agent-1");
    spawn.setAgentId("agent-2");
    const afterSet = spawn.agentId;
    spawn.subagentType = "Explore";
    spawn.description = "Count files";
    spawn.background = true;
    const announce1 = spawn.markAnnounced();
    const announce2 = spawn.markAnnounced();
    const complete1 = spawn.markCompleted();
    const complete2 = spawn.markCompleted();
    assert.deepStrictEqual({
      toolUseId: spawn.toolUseId,
      beforeSet,
      afterSet,
      subagentType: spawn.subagentType,
      description: spawn.description,
      background: spawn.background,
      announce1,
      announce2,
      complete1,
      complete2
    }, {
      toolUseId: "toolu_x",
      beforeSet: void 0,
      afterSet: "agent-1",
      // second setAgentId silently dropped
      subagentType: "Explore",
      description: "Count files",
      background: true,
      announce1: true,
      announce2: false,
      complete1: true,
      complete2: false
    });
  });
});
suite("SubagentRegistry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("recordSpawn is idempotent; init fields are first-writer-wins; getSpawn returns the same record across calls", () => {
    const registry = r();
    const first = registry.recordSpawn("toolu_a", { agentId: "agent-1", subagentType: "Explore", description: "first desc" });
    const second = registry.recordSpawn("toolu_a", { agentId: "agent-2", subagentType: "OverwriteAttempt", description: "second desc" });
    assert.deepStrictEqual({
      sameRef: first === second,
      retrieved: registry.getSpawn("toolu_a") === first,
      agentId: first.agentId,
      subagentType: first.subagentType,
      description: first.description
    }, {
      sameRef: true,
      retrieved: true,
      agentId: "agent-1",
      subagentType: "Explore",
      description: "first desc"
    });
  });
  test("removeSpawn deletes the spawn AND evicts inner-tool edges that pointed at it; other parents\u2019 edges are untouched", () => {
    const registry = r();
    registry.recordSpawn("toolu_parent_a");
    registry.recordSpawn("toolu_parent_b");
    registry.noteInnerTool("toolu_inner_a1", "toolu_parent_a");
    registry.noteInnerTool("toolu_inner_a2", "toolu_parent_a");
    registry.noteInnerTool("toolu_inner_b1", "toolu_parent_b");
    registry.removeSpawn("toolu_parent_a");
    assert.deepStrictEqual({
      parentA: registry.getSpawn("toolu_parent_a"),
      parentB: registry.getSpawn("toolu_parent_b")?.toolUseId,
      innerA1Parent: registry.getParentSpawn("toolu_inner_a1"),
      innerA2Parent: registry.getParentSpawn("toolu_inner_a2"),
      innerB1Parent: registry.getParentSpawn("toolu_inner_b1")?.toolUseId
    }, {
      parentA: void 0,
      parentB: "toolu_parent_b",
      innerA1Parent: void 0,
      innerA2Parent: void 0,
      innerB1Parent: "toolu_parent_b"
    });
  });
  test("drainForegroundSpawns: returns and removes only foreground spawns; background spawns survive; inner-edge entries pointing at drained spawns are evicted", () => {
    const registry = r();
    registry.recordSpawn("toolu_fg_1");
    const bg = registry.recordSpawn("toolu_bg");
    bg.background = true;
    registry.recordSpawn("toolu_fg_2");
    registry.noteInnerTool("toolu_inner_fg1", "toolu_fg_1");
    registry.noteInnerTool("toolu_inner_bg", "toolu_bg");
    const drained = registry.drainForegroundSpawns();
    assert.deepStrictEqual({
      drainedIds: drained.map((s) => s.toolUseId).sort(),
      survivedFg1: registry.getSpawn("toolu_fg_1"),
      survivedFg2: registry.getSpawn("toolu_fg_2"),
      survivedBg: registry.getSpawn("toolu_bg")?.toolUseId,
      fgInnerEvicted: registry.getParentSpawn("toolu_inner_fg1"),
      bgInnerSurvived: registry.getParentSpawn("toolu_inner_bg")?.toolUseId
    }, {
      drainedIds: ["toolu_fg_1", "toolu_fg_2"],
      survivedFg1: void 0,
      survivedFg2: void 0,
      survivedBg: "toolu_bg",
      fgInnerEvicted: void 0,
      bgInnerSurvived: "toolu_bg"
    });
  });
  test("primeFromTranscript scans Task tool_result text blocks for agentId suffix and records each pair (idempotent against repeat calls)", () => {
    const registry = r();
    const transcript = [
      makeAgentToolCallTurn("toolu_a", { suffixText: "agentId: agentaaa\n(use SendMessage with to: 'agentaaa')" }),
      makeAgentToolCallTurn("toolu_b", { suffixText: "no suffix here" }),
      makeAgentToolCallTurn("toolu_c", { suffixText: "agentId: agentccc" }),
      makeAgentToolCallTurn("toolu_d", { suffixText: "agentId: agentddd", toolName: "Read" })
      // not a subagent tool
    ];
    registry.primeFromTranscript(transcript);
    registry.primeFromTranscript(transcript);
    assert.deepStrictEqual({
      a: registry.getSpawn("toolu_a")?.agentId,
      b: registry.getSpawn("toolu_b"),
      c: registry.getSpawn("toolu_c")?.agentId,
      d: registry.getSpawn("toolu_d")
    }, {
      a: "agentaaa",
      b: void 0,
      c: "agentccc",
      d: void 0
    });
  });
  test("dispose clears spawns + inner-edge maps so a stray reference cannot resurrect stale state", () => {
    const registry = new SubagentRegistry();
    registry.recordSpawn("toolu_x", { agentId: "agent-x" });
    registry.noteInnerTool("toolu_inner", "toolu_x");
    registry.dispose();
    assert.deepStrictEqual({
      spawn: registry.getSpawn("toolu_x"),
      innerParent: registry.getParentSpawn("toolu_inner")
    }, {
      spawn: void 0,
      innerParent: void 0
    });
  });
});
suite("SUBAGENT_ID_SUFFIX_REGEX + scanTranscriptForAgentIds", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("regex matches canonical and drifted formats; rejects unrelated text", () => {
    const matches = [
      "agentId: abc123 (use SendMessage with to: 'abc123') ...",
      "agentId:   abc123\n",
      "  agentId: abc123",
      "AgentId: ABC123",
      "noise\nagentId: xyz789 trailing"
    ];
    const nonMatches = [
      "no agent here",
      "agent-Id: nope",
      "agentid abc no colon"
    ];
    assert.deepStrictEqual({
      matches: matches.map((t) => SUBAGENT_ID_SUFFIX_REGEX.exec(t)?.[1]),
      nonMatches: nonMatches.map((t) => SUBAGENT_ID_SUFFIX_REGEX.exec(t))
    }, {
      matches: ["abc123", "abc123", "abc123", "ABC123", "xyz789"],
      nonMatches: [null, null, null]
    });
  });
  test("scanTranscriptForAgentIds returns only the (toolCallId \u2192 agentId) pairs from terminal Task/Agent tool_result text blocks", () => {
    const transcript = [
      makeAgentToolCallTurn("toolu_match", { suffixText: "agentId: agentmatch" }),
      makeAgentToolCallTurn("toolu_streaming", { suffixText: "agentId: agentstream", status: ToolCallStatus.Streaming }),
      makeAgentToolCallTurn("toolu_no_suffix", { suffixText: "just text" }),
      makeAgentToolCallTurn("toolu_wrong_tool", { suffixText: "agentId: agentx", toolName: "Read" })
    ];
    const pairs = scanTranscriptForAgentIds(transcript);
    assert.deepStrictEqual(Array.from(pairs.entries()).sort(), [
      ["toolu_match", "agentmatch"]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzLCBTVUJBR0VOVF9JRF9TVUZGSVhfUkVHRVgsIFN1YmFnZW50UmVnaXN0cnksIFN1YmFnZW50U3Bhd24gfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTdWJhZ2VudFJlZ2lzdHJ5LmpzJztcblxuZnVuY3Rpb24gbWFrZUFnZW50VG9vbENhbGxUdXJuKHRvb2xDYWxsSWQ6IHN0cmluZywgb3B0czogeyBzdWZmaXhUZXh0Pzogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZzsgc3RhdHVzPzogVG9vbENhbGxTdGF0dXMgfSk6IFR1cm4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAndHVybi0nICsgdG9vbENhbGxJZCxcblx0XHRtZXNzYWdlOiB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogb3B0cy50b29sTmFtZSA/PyAnVGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGFzaycsXG5cdFx0XHRcdHN0YXR1czogb3B0cy5zdGF0dXMgPz8gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdpbnZva2luZyB0YXNrJyxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ3Rhc2sgZG9uZScsXG5cdFx0XHRcdGNvbnRlbnQ6IG9wdHMuc3VmZml4VGV4dCAhPT0gdW5kZWZpbmVkID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IG9wdHMuc3VmZml4VGV4dCB9XSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0c3RhdGU6IDAgYXMgdW5rbm93biBhcyBUdXJuWydzdGF0ZSddLFxuXHRcdHN0YXJ0ZWRBdDogJzE5NzAtMDEtMDFUMDA6MDA6MDAuMDAxWicsXG5cdFx0ZHVyYXRpb246IDIsXG5cdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0fSBhcyBUdXJuO1xufVxuXG5zdWl0ZSgnU3ViYWdlbnRTcGF3bicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhZ2VudElkIGlzIHNldC1vbmNlIHZpYSBzZXRBZ2VudElkOyBzdWJhZ2VudFR5cGUvZGVzY3JpcHRpb24vYmFja2dyb3VuZCBhcmUgbXV0YWJsZTsgbWFya0Fubm91bmNlZCBhbmQgbWFya0NvbXBsZXRlZCBhcmUgZmlyc3QtY2FsbC10cnVlLXRoZW4tZmFsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3Bhd24gPSBuZXcgU3ViYWdlbnRTcGF3bigndG9vbHVfeCcpO1xuXG5cdFx0Y29uc3QgYmVmb3JlU2V0ID0gc3Bhd24uYWdlbnRJZDtcblx0XHRzcGF3bi5zZXRBZ2VudElkKCdhZ2VudC0xJyk7XG5cdFx0c3Bhd24uc2V0QWdlbnRJZCgnYWdlbnQtMicpOyAvLyBpZ25vcmVkOiBmaXJzdC13cml0ZXItd2luc1xuXHRcdGNvbnN0IGFmdGVyU2V0ID0gc3Bhd24uYWdlbnRJZDtcblxuXHRcdHNwYXduLnN1YmFnZW50VHlwZSA9ICdFeHBsb3JlJztcblx0XHRzcGF3bi5kZXNjcmlwdGlvbiA9ICdDb3VudCBmaWxlcyc7XG5cdFx0c3Bhd24uYmFja2dyb3VuZCA9IHRydWU7XG5cblx0XHRjb25zdCBhbm5vdW5jZTEgPSBzcGF3bi5tYXJrQW5ub3VuY2VkKCk7XG5cdFx0Y29uc3QgYW5ub3VuY2UyID0gc3Bhd24ubWFya0Fubm91bmNlZCgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlMSA9IHNwYXduLm1hcmtDb21wbGV0ZWQoKTtcblx0XHRjb25zdCBjb21wbGV0ZTIgPSBzcGF3bi5tYXJrQ29tcGxldGVkKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xVc2VJZDogc3Bhd24udG9vbFVzZUlkLFxuXHRcdFx0YmVmb3JlU2V0LFxuXHRcdFx0YWZ0ZXJTZXQsXG5cdFx0XHRzdWJhZ2VudFR5cGU6IHNwYXduLnN1YmFnZW50VHlwZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBzcGF3bi5kZXNjcmlwdGlvbixcblx0XHRcdGJhY2tncm91bmQ6IHNwYXduLmJhY2tncm91bmQsXG5cdFx0XHRhbm5vdW5jZTEsXG5cdFx0XHRhbm5vdW5jZTIsXG5cdFx0XHRjb21wbGV0ZTEsXG5cdFx0XHRjb21wbGV0ZTIsXG5cdFx0fSwge1xuXHRcdFx0dG9vbFVzZUlkOiAndG9vbHVfeCcsXG5cdFx0XHRiZWZvcmVTZXQ6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyU2V0OiAnYWdlbnQtMScsIC8vIHNlY29uZCBzZXRBZ2VudElkIHNpbGVudGx5IGRyb3BwZWRcblx0XHRcdHN1YmFnZW50VHlwZTogJ0V4cGxvcmUnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdDb3VudCBmaWxlcycsXG5cdFx0XHRiYWNrZ3JvdW5kOiB0cnVlLFxuXHRcdFx0YW5ub3VuY2UxOiB0cnVlLFxuXHRcdFx0YW5ub3VuY2UyOiBmYWxzZSxcblx0XHRcdGNvbXBsZXRlMTogdHJ1ZSxcblx0XHRcdGNvbXBsZXRlMjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdTdWJhZ2VudFJlZ2lzdHJ5JywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gcigpOiBTdWJhZ2VudFJlZ2lzdHJ5IHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXHR9XG5cblx0dGVzdCgncmVjb3JkU3Bhd24gaXMgaWRlbXBvdGVudDsgaW5pdCBmaWVsZHMgYXJlIGZpcnN0LXdyaXRlci13aW5zOyBnZXRTcGF3biByZXR1cm5zIHRoZSBzYW1lIHJlY29yZCBhY3Jvc3MgY2FsbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cdFx0Y29uc3QgZmlyc3QgPSByZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfYScsIHsgYWdlbnRJZDogJ2FnZW50LTEnLCBzdWJhZ2VudFR5cGU6ICdFeHBsb3JlJywgZGVzY3JpcHRpb246ICdmaXJzdCBkZXNjJyB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSByZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfYScsIHsgYWdlbnRJZDogJ2FnZW50LTInLCBzdWJhZ2VudFR5cGU6ICdPdmVyd3JpdGVBdHRlbXB0JywgZGVzY3JpcHRpb246ICdzZWNvbmQgZGVzYycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbWVSZWY6IGZpcnN0ID09PSBzZWNvbmQsXG5cdFx0XHRyZXRyaWV2ZWQ6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9hJykgPT09IGZpcnN0LFxuXHRcdFx0YWdlbnRJZDogZmlyc3QuYWdlbnRJZCxcblx0XHRcdHN1YmFnZW50VHlwZTogZmlyc3Quc3ViYWdlbnRUeXBlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGZpcnN0LmRlc2NyaXB0aW9uLFxuXHRcdH0sIHtcblx0XHRcdHNhbWVSZWY6IHRydWUsXG5cdFx0XHRyZXRyaWV2ZWQ6IHRydWUsXG5cdFx0XHRhZ2VudElkOiAnYWdlbnQtMScsXG5cdFx0XHRzdWJhZ2VudFR5cGU6ICdFeHBsb3JlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnZmlyc3QgZGVzYycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVNwYXduIGRlbGV0ZXMgdGhlIHNwYXduIEFORCBldmljdHMgaW5uZXItdG9vbCBlZGdlcyB0aGF0IHBvaW50ZWQgYXQgaXQ7IG90aGVyIHBhcmVudHNcdTIwMTkgZWRnZXMgYXJlIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfcGFyZW50X2EnKTtcblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfcGFyZW50X2InKTtcblx0XHRyZWdpc3RyeS5ub3RlSW5uZXJUb29sKCd0b29sdV9pbm5lcl9hMScsICd0b29sdV9wYXJlbnRfYScpO1xuXHRcdHJlZ2lzdHJ5Lm5vdGVJbm5lclRvb2woJ3Rvb2x1X2lubmVyX2EyJywgJ3Rvb2x1X3BhcmVudF9hJyk7XG5cdFx0cmVnaXN0cnkubm90ZUlubmVyVG9vbCgndG9vbHVfaW5uZXJfYjEnLCAndG9vbHVfcGFyZW50X2InKTtcblxuXHRcdHJlZ2lzdHJ5LnJlbW92ZVNwYXduKCd0b29sdV9wYXJlbnRfYScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXJlbnRBOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfcGFyZW50X2EnKSxcblx0XHRcdHBhcmVudEI6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9wYXJlbnRfYicpPy50b29sVXNlSWQsXG5cdFx0XHRpbm5lckExUGFyZW50OiByZWdpc3RyeS5nZXRQYXJlbnRTcGF3bigndG9vbHVfaW5uZXJfYTEnKSxcblx0XHRcdGlubmVyQTJQYXJlbnQ6IHJlZ2lzdHJ5LmdldFBhcmVudFNwYXduKCd0b29sdV9pbm5lcl9hMicpLFxuXHRcdFx0aW5uZXJCMVBhcmVudDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyX2IxJyk/LnRvb2xVc2VJZCxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRBOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJlbnRCOiAndG9vbHVfcGFyZW50X2InLFxuXHRcdFx0aW5uZXJBMVBhcmVudDogdW5kZWZpbmVkLFxuXHRcdFx0aW5uZXJBMlBhcmVudDogdW5kZWZpbmVkLFxuXHRcdFx0aW5uZXJCMVBhcmVudDogJ3Rvb2x1X3BhcmVudF9iJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZHJhaW5Gb3JlZ3JvdW5kU3Bhd25zOiByZXR1cm5zIGFuZCByZW1vdmVzIG9ubHkgZm9yZWdyb3VuZCBzcGF3bnM7IGJhY2tncm91bmQgc3Bhd25zIHN1cnZpdmU7IGlubmVyLWVkZ2UgZW50cmllcyBwb2ludGluZyBhdCBkcmFpbmVkIHNwYXducyBhcmUgZXZpY3RlZCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRyZWdpc3RyeS5yZWNvcmRTcGF3bigndG9vbHVfZmdfMScpO1xuXHRcdGNvbnN0IGJnID0gcmVnaXN0cnkucmVjb3JkU3Bhd24oJ3Rvb2x1X2JnJyk7XG5cdFx0YmcuYmFja2dyb3VuZCA9IHRydWU7XG5cdFx0cmVnaXN0cnkucmVjb3JkU3Bhd24oJ3Rvb2x1X2ZnXzInKTtcblx0XHRyZWdpc3RyeS5ub3RlSW5uZXJUb29sKCd0b29sdV9pbm5lcl9mZzEnLCAndG9vbHVfZmdfMScpO1xuXHRcdHJlZ2lzdHJ5Lm5vdGVJbm5lclRvb2woJ3Rvb2x1X2lubmVyX2JnJywgJ3Rvb2x1X2JnJyk7XG5cblx0XHRjb25zdCBkcmFpbmVkID0gcmVnaXN0cnkuZHJhaW5Gb3JlZ3JvdW5kU3Bhd25zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRyYWluZWRJZHM6IGRyYWluZWQubWFwKHMgPT4gcy50b29sVXNlSWQpLnNvcnQoKSxcblx0XHRcdHN1cnZpdmVkRmcxOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfZmdfMScpLFxuXHRcdFx0c3Vydml2ZWRGZzI6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9mZ18yJyksXG5cdFx0XHRzdXJ2aXZlZEJnOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfYmcnKT8udG9vbFVzZUlkLFxuXHRcdFx0ZmdJbm5lckV2aWN0ZWQ6IHJlZ2lzdHJ5LmdldFBhcmVudFNwYXduKCd0b29sdV9pbm5lcl9mZzEnKSxcblx0XHRcdGJnSW5uZXJTdXJ2aXZlZDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyX2JnJyk/LnRvb2xVc2VJZCxcblx0XHR9LCB7XG5cdFx0XHRkcmFpbmVkSWRzOiBbJ3Rvb2x1X2ZnXzEnLCAndG9vbHVfZmdfMiddLFxuXHRcdFx0c3Vydml2ZWRGZzE6IHVuZGVmaW5lZCxcblx0XHRcdHN1cnZpdmVkRmcyOiB1bmRlZmluZWQsXG5cdFx0XHRzdXJ2aXZlZEJnOiAndG9vbHVfYmcnLFxuXHRcdFx0ZmdJbm5lckV2aWN0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdGJnSW5uZXJTdXJ2aXZlZDogJ3Rvb2x1X2JnJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJpbWVGcm9tVHJhbnNjcmlwdCBzY2FucyBUYXNrIHRvb2xfcmVzdWx0IHRleHQgYmxvY2tzIGZvciBhZ2VudElkIHN1ZmZpeCBhbmQgcmVjb3JkcyBlYWNoIHBhaXIgKGlkZW1wb3RlbnQgYWdhaW5zdCByZXBlYXQgY2FsbHMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IHRyYW5zY3JpcHQ6IHJlYWRvbmx5IFR1cm5bXSA9IFtcblx0XHRcdG1ha2VBZ2VudFRvb2xDYWxsVHVybigndG9vbHVfYScsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50YWFhXFxuKHVzZSBTZW5kTWVzc2FnZSB3aXRoIHRvOiBcXCdhZ2VudGFhYVxcJyknIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9iJywgeyBzdWZmaXhUZXh0OiAnbm8gc3VmZml4IGhlcmUnIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9jJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRjY2MnIH0pLFxuXHRcdFx0bWFrZUFnZW50VG9vbENhbGxUdXJuKCd0b29sdV9kJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRkZGQnLCB0b29sTmFtZTogJ1JlYWQnIH0pLCAvLyBub3QgYSBzdWJhZ2VudCB0b29sXG5cdFx0XTtcblxuXHRcdHJlZ2lzdHJ5LnByaW1lRnJvbVRyYW5zY3JpcHQodHJhbnNjcmlwdCk7XG5cdFx0cmVnaXN0cnkucHJpbWVGcm9tVHJhbnNjcmlwdCh0cmFuc2NyaXB0KTsgLy8gaWRlbXBvdGVudFxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfYScpPy5hZ2VudElkLFxuXHRcdFx0YjogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2InKSxcblx0XHRcdGM6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9jJyk/LmFnZW50SWQsXG5cdFx0XHRkOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfZCcpLFxuXHRcdH0sIHtcblx0XHRcdGE6ICdhZ2VudGFhYScsXG5cdFx0XHRiOiB1bmRlZmluZWQsXG5cdFx0XHRjOiAnYWdlbnRjY2MnLFxuXHRcdFx0ZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGNsZWFycyBzcGF3bnMgKyBpbm5lci1lZGdlIG1hcHMgc28gYSBzdHJheSByZWZlcmVuY2UgY2Fubm90IHJlc3VycmVjdCBzdGFsZSBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkucmVjb3JkU3Bhd24oJ3Rvb2x1X3gnLCB7IGFnZW50SWQ6ICdhZ2VudC14JyB9KTtcblx0XHRyZWdpc3RyeS5ub3RlSW5uZXJUb29sKCd0b29sdV9pbm5lcicsICd0b29sdV94Jyk7XG5cblx0XHRyZWdpc3RyeS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNwYXduOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfeCcpLFxuXHRcdFx0aW5uZXJQYXJlbnQ6IHJlZ2lzdHJ5LmdldFBhcmVudFNwYXduKCd0b29sdV9pbm5lcicpLFxuXHRcdH0sIHtcblx0XHRcdHNwYXduOiB1bmRlZmluZWQsXG5cdFx0XHRpbm5lclBhcmVudDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYICsgc2NhblRyYW5zY3JpcHRGb3JBZ2VudElkcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZWdleCBtYXRjaGVzIGNhbm9uaWNhbCBhbmQgZHJpZnRlZCBmb3JtYXRzOyByZWplY3RzIHVucmVsYXRlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSBbXG5cdFx0XHQnYWdlbnRJZDogYWJjMTIzICh1c2UgU2VuZE1lc3NhZ2Ugd2l0aCB0bzogXFwnYWJjMTIzXFwnKSAuLi4nLFxuXHRcdFx0J2FnZW50SWQ6ICAgYWJjMTIzXFxuJyxcblx0XHRcdCcgIGFnZW50SWQ6IGFiYzEyMycsXG5cdFx0XHQnQWdlbnRJZDogQUJDMTIzJyxcblx0XHRcdCdub2lzZVxcbmFnZW50SWQ6IHh5ejc4OSB0cmFpbGluZycsXG5cdFx0XTtcblx0XHRjb25zdCBub25NYXRjaGVzID0gW1xuXHRcdFx0J25vIGFnZW50IGhlcmUnLFxuXHRcdFx0J2FnZW50LUlkOiBub3BlJyxcblx0XHRcdCdhZ2VudGlkIGFiYyBubyBjb2xvbicsXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWF0Y2hlczogbWF0Y2hlcy5tYXAodCA9PiBTVUJBR0VOVF9JRF9TVUZGSVhfUkVHRVguZXhlYyh0KT8uWzFdKSxcblx0XHRcdG5vbk1hdGNoZXM6IG5vbk1hdGNoZXMubWFwKHQgPT4gU1VCQUdFTlRfSURfU1VGRklYX1JFR0VYLmV4ZWModCkpLFxuXHRcdH0sIHtcblx0XHRcdG1hdGNoZXM6IFsnYWJjMTIzJywgJ2FiYzEyMycsICdhYmMxMjMnLCAnQUJDMTIzJywgJ3h5ejc4OSddLFxuXHRcdFx0bm9uTWF0Y2hlczogW251bGwsIG51bGwsIG51bGxdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2FuVHJhbnNjcmlwdEZvckFnZW50SWRzIHJldHVybnMgb25seSB0aGUgKHRvb2xDYWxsSWQgXHUyMTkyIGFnZW50SWQpIHBhaXJzIGZyb20gdGVybWluYWwgVGFzay9BZ2VudCB0b29sX3Jlc3VsdCB0ZXh0IGJsb2NrcycsICgpID0+IHtcblx0XHRjb25zdCB0cmFuc2NyaXB0OiByZWFkb25seSBUdXJuW10gPSBbXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X21hdGNoJywgeyBzdWZmaXhUZXh0OiAnYWdlbnRJZDogYWdlbnRtYXRjaCcgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X3N0cmVhbWluZycsIHsgc3VmZml4VGV4dDogJ2FnZW50SWQ6IGFnZW50c3RyZWFtJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X25vX3N1ZmZpeCcsIHsgc3VmZml4VGV4dDogJ2p1c3QgdGV4dCcgfSksXG5cdFx0XHRtYWtlQWdlbnRUb29sQ2FsbFR1cm4oJ3Rvb2x1X3dyb25nX3Rvb2wnLCB7IHN1ZmZpeFRleHQ6ICdhZ2VudElkOiBhZ2VudHgnLCB0b29sTmFtZTogJ1JlYWQnIH0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBwYWlycyA9IHNjYW5UcmFuc2NyaXB0Rm9yQWdlbnRJZHModHJhbnNjcmlwdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20ocGFpcnMuZW50cmllcygpKS5zb3J0KCksIFtcblx0XHRcdFsndG9vbHVfbWF0Y2gnLCAnYWdlbnRtYXRjaCddLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYSxrQkFBa0IsNEJBQTRCLGdCQUFn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
