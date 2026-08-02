import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ResponsePartKind, ToolResultContentType, TurnState } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { importedTurnsFromChatModel } from "../../../browser/agentSessions/agentHost/importLocalConversationToAgentSession.js";
suite("importedTurnsFromChatModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function markdown(value) {
    return { kind: "markdownContent", content: new MarkdownString(value) };
  }
  function thinking(value) {
    return { kind: "thinking", value };
  }
  function inlineReference(uri, name) {
    return { kind: "inlineReference", inlineReference: uri, name };
  }
  function inlineRef(reference, name) {
    return { kind: "inlineReference", inlineReference: reference, name };
  }
  function subagentTool(toolCallId, agentName, description, result) {
    return {
      kind: "toolInvocationSerialized",
      toolId: "delegate",
      toolCallId,
      invocationMessage: "Delegating",
      pastTenseMessage: "Delegated",
      resultDetails: void 0,
      toolSpecificData: { kind: "subagent", agentName, description, prompt: "go", result }
    };
  }
  function response(parts, opts) {
    return {
      entireResponse: { value: parts },
      isCanceled: !!opts?.canceled,
      result: opts?.error ? { errorDetails: opts.error } : void 0
    };
  }
  function request(text, response2, opts) {
    return { message: { text }, response: response2, isSystemInitiated: opts?.systemInitiated };
  }
  function model(requests) {
    return { getRequests: () => requests };
  }
  function subagentOf(part) {
    if (part.kind !== ResponsePartKind.ToolCall) {
      return void 0;
    }
    const sub = part.toolCall.content?.find((c) => c.type === ToolResultContentType.Subagent);
    return sub && sub.type === ToolResultContentType.Subagent ? { agentName: sub.agentName, description: sub.description } : void 0;
  }
  function project(model2) {
    return importedTurnsFromChatModel(model2).map((turn) => ({
      text: turn.message.text,
      state: turn.state,
      error: turn.error,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? { kind: part.kind, content: part.content } : { kind: part.kind, subagent: subagentOf(part) })
    }));
  }
  test("maps markdown, reasoning and inline references in stream order", () => {
    const result = project(model([request("q", response([
      markdown("Found in "),
      inlineReference(URI.file("/repo/a.ts")),
      markdown(" \u2014 done"),
      thinking("let me check")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Found in " },
        { kind: ResponsePartKind.Markdown, content: `[a.ts](${URI.file("/repo/a.ts").toString()})` },
        { kind: ResponsePartKind.Markdown, content: " \u2014 done" },
        { kind: ResponsePartKind.Reasoning, content: "let me check" }
      ]
    }]);
  });
  test("collapses a path-like inline reference label to the file basename", () => {
    const uri = URI.file("/repo/src/common/appInsightsClientFactory.ts");
    const result = project(model([request("q", response([
      inlineReference(uri, "src/common/appInsightsClientFactory.ts")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[appInsightsClientFactory.ts](${uri.toString()})` }
      ]
    }]);
  });
  test("keeps a short inline reference label (e.g. a symbol name) as-is", () => {
    const uri = URI.file("/repo/src/common/appInsightsClientFactory.ts");
    const result = project(model([request("q", response([
      inlineReference(uri, "logEvent")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` }
      ]
    }]);
  });
  test("maps a Location-shaped inline reference to its file basename", () => {
    const uri = URI.file("/repo/src/common/baseTelemetrySender.ts");
    const result = project(model([request("q", response([
      inlineRef({ uri, range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 } })
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[baseTelemetrySender.ts](${uri.toString()})` }
      ]
    }]);
  });
  test("maps a workspace-symbol inline reference using its symbol name", () => {
    const uri = URI.file("/repo/src/common/baseTelemetrySender.ts");
    const result = project(model([request("q", response([
      inlineRef({ name: "logEvent", location: { uri } })
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: `[logEvent](${uri.toString()})` }
      ]
    }]);
  });
  test("falls back to the plain label when an inline reference has no resolvable URI", () => {
    const result = project(model([request("q", response([
      inlineRef({ name: "orphan" }, "orphan")
    ]))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Complete,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "orphan" }
      ]
    }]);
  });
  test("maps a cancelled response to a cancelled turn", () => {
    const result = project(model([request("q", response([markdown("partial")], { canceled: true }))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Cancelled,
      error: void 0,
      parts: [{ kind: ResponsePartKind.Markdown, content: "partial" }]
    }]);
  });
  test("maps an errored response to an error turn carrying the message and code", () => {
    const result = project(model([request("q", response([], { error: { message: "boom", code: "E1" } }))]));
    assert.deepStrictEqual(result, [{
      text: "q",
      state: TurnState.Error,
      error: { errorType: "E1", message: "boom" },
      parts: []
    }]);
  });
  test("folds a system-initiated continuation into the previous turn and supersedes its outcome", () => {
    const result = project(model([
      request("real question", response([markdown("working")])),
      request("[Terminal notification]", response([markdown("continued")], { canceled: true }), { systemInitiated: true })
    ]));
    assert.deepStrictEqual(result, [{
      text: "real question",
      state: TurnState.Cancelled,
      error: void 0,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "working" },
        { kind: ResponsePartKind.Markdown, content: "continued" }
      ]
    }]);
  });
  test("maps a sub-agent tool invocation preserving its identity as structured content", () => {
    const result = project(model([request("delegate", response([subagentTool("tc-1", "explore", "Explores the codebase", "done")]))]));
    assert.deepStrictEqual(result, [{
      text: "delegate",
      state: TurnState.Complete,
      error: void 0,
      parts: [{ kind: ResponsePartKind.ToolCall, subagent: { agentName: "explore", description: "Explores the codebase" } }]
    }]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvaW1wb3J0TG9jYWxDb252ZXJzYXRpb25Ub0FnZW50U2Vzc2lvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZVBhcnRLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCwgSUNoYXRNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgaW1wb3J0ZWRUdXJuc0Zyb21DaGF0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2ltcG9ydExvY2FsQ29udmVyc2F0aW9uVG9BZ2VudFNlc3Npb24uanMnO1xuXG5zdWl0ZSgnaW1wb3J0ZWRUdXJuc0Zyb21DaGF0TW9kZWwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWFya2Rvd24odmFsdWU6IHN0cmluZyk6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQge1xuXHRcdHJldHVybiB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUpIH0gYXMgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudDtcblx0fVxuXG5cdGZ1bmN0aW9uIHRoaW5raW5nKHZhbHVlOiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHtcblx0XHRyZXR1cm4geyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZSB9IGFzIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ7XG5cdH1cblxuXHRmdW5jdGlvbiBpbmxpbmVSZWZlcmVuY2UodXJpOiBVUkksIG5hbWU/OiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHtcblx0XHRyZXR1cm4geyBraW5kOiAnaW5saW5lUmVmZXJlbmNlJywgaW5saW5lUmVmZXJlbmNlOiB1cmksIG5hbWUgfSBhcyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50O1xuXHR9XG5cblx0LyoqIEJ1aWxkcyBhbiBpbmxpbmUgcmVmZXJlbmNlIGZyb20gYSBub24tVVJJIHNoYXBlIChhIGBMb2NhdGlvbmAgb3IgYElXb3Jrc3BhY2VTeW1ib2xgKS4gKi9cblx0ZnVuY3Rpb24gaW5saW5lUmVmKHJlZmVyZW5jZTogdW5rbm93biwgbmFtZT86IHN0cmluZyk6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQge1xuXHRcdHJldHVybiB7IGtpbmQ6ICdpbmxpbmVSZWZlcmVuY2UnLCBpbmxpbmVSZWZlcmVuY2U6IHJlZmVyZW5jZSwgbmFtZSB9IGFzIElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ7XG5cdH1cblxuXHRmdW5jdGlvbiBzdWJhZ2VudFRvb2wodG9vbENhbGxJZDogc3RyaW5nLCBhZ2VudE5hbWU6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgcmVzdWx0OiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0b29sSWQ6ICdkZWxlZ2F0ZScsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdEZWxlZ2F0aW5nJyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdEZWxlZ2F0ZWQnLFxuXHRcdFx0cmVzdWx0RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnLCBhZ2VudE5hbWUsIGRlc2NyaXB0aW9uLCBwcm9tcHQ6ICdnbycsIHJlc3VsdCB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVzcG9uc2UocGFydHM6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSwgb3B0cz86IHsgY2FuY2VsZWQ/OiBib29sZWFuOyBlcnJvcj86IHsgbWVzc2FnZTogc3RyaW5nOyBjb2RlPzogc3RyaW5nIH0gfSk6IElDaGF0UmVzcG9uc2VNb2RlbCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVudGlyZVJlc3BvbnNlOiB7IHZhbHVlOiBwYXJ0cyB9LFxuXHRcdFx0aXNDYW5jZWxlZDogISFvcHRzPy5jYW5jZWxlZCxcblx0XHRcdHJlc3VsdDogb3B0cz8uZXJyb3IgPyB7IGVycm9yRGV0YWlsczogb3B0cy5lcnJvciB9IDogdW5kZWZpbmVkLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFJlc3BvbnNlTW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiByZXF1ZXN0KHRleHQ6IHN0cmluZywgcmVzcG9uc2U/OiBJQ2hhdFJlc3BvbnNlTW9kZWwsIG9wdHM/OiB7IHN5c3RlbUluaXRpYXRlZD86IGJvb2xlYW4gfSk6IElDaGF0UmVxdWVzdE1vZGVsIHtcblx0XHRyZXR1cm4geyBtZXNzYWdlOiB7IHRleHQgfSwgcmVzcG9uc2UsIGlzU3lzdGVtSW5pdGlhdGVkOiBvcHRzPy5zeXN0ZW1Jbml0aWF0ZWQgfSBhcyB1bmtub3duIGFzIElDaGF0UmVxdWVzdE1vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gbW9kZWwocmVxdWVzdHM6IElDaGF0UmVxdWVzdE1vZGVsW10pOiBJQ2hhdE1vZGVsIHtcblx0XHRyZXR1cm4geyBnZXRSZXF1ZXN0czogKCkgPT4gcmVxdWVzdHMgfSBhcyB1bmtub3duIGFzIElDaGF0TW9kZWw7XG5cdH1cblxuXHRmdW5jdGlvbiBzdWJhZ2VudE9mKHBhcnQ6IFJlc3BvbnNlUGFydCkge1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN1YiA9IChwYXJ0LnRvb2xDYWxsIGFzIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUpLmNvbnRlbnQ/LmZpbmQoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0cmV0dXJuIHN1YiAmJiBzdWIudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50ID8geyBhZ2VudE5hbWU6IHN1Yi5hZ2VudE5hbWUsIGRlc2NyaXB0aW9uOiBzdWIuZGVzY3JpcHRpb24gfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZ1bmN0aW9uIHByb2plY3QobW9kZWw6IElDaGF0TW9kZWwpIHtcblx0XHRyZXR1cm4gaW1wb3J0ZWRUdXJuc0Zyb21DaGF0TW9kZWwobW9kZWwpLm1hcCh0dXJuID0+ICh7XG5cdFx0XHR0ZXh0OiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0ZXJyb3I6IHR1cm4uZXJyb3IsXG5cdFx0XHRwYXJ0czogdHVybi5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+XG5cdFx0XHRcdHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biB8fCBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nXG5cdFx0XHRcdFx0PyB7IGtpbmQ6IHBhcnQua2luZCwgY29udGVudDogcGFydC5jb250ZW50IH1cblx0XHRcdFx0XHQ6IHsga2luZDogcGFydC5raW5kLCBzdWJhZ2VudDogc3ViYWdlbnRPZihwYXJ0KSB9KSxcblx0XHR9KSk7XG5cdH1cblxuXHR0ZXN0KCdtYXBzIG1hcmtkb3duLCByZWFzb25pbmcgYW5kIGlubGluZSByZWZlcmVuY2VzIGluIHN0cmVhbSBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdxJywgcmVzcG9uc2UoW1xuXHRcdFx0bWFya2Rvd24oJ0ZvdW5kIGluICcpLFxuXHRcdFx0aW5saW5lUmVmZXJlbmNlKFVSSS5maWxlKCcvcmVwby9hLnRzJykpLFxuXHRcdFx0bWFya2Rvd24oJyBcdTIwMTQgZG9uZScpLFxuXHRcdFx0dGhpbmtpbmcoJ2xldCBtZSBjaGVjaycpLFxuXHRcdF0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3EnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdGb3VuZCBpbiAnIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogYFthLnRzXSgke1VSSS5maWxlKCcvcmVwby9hLnRzJykudG9TdHJpbmcoKX0pYCB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICcgXHUyMDE0IGRvbmUnIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGNvbnRlbnQ6ICdsZXQgbWUgY2hlY2snIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY29sbGFwc2VzIGEgcGF0aC1saWtlIGlubGluZSByZWZlcmVuY2UgbGFiZWwgdG8gdGhlIGZpbGUgYmFzZW5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy9yZXBvL3NyYy9jb21tb24vYXBwSW5zaWdodHNDbGllbnRGYWN0b3J5LnRzJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFtcblx0XHRcdGlubGluZVJlZmVyZW5jZSh1cmksICdzcmMvY29tbW9uL2FwcEluc2lnaHRzQ2xpZW50RmFjdG9yeS50cycpLFxuXHRcdF0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3EnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6IGBbYXBwSW5zaWdodHNDbGllbnRGYWN0b3J5LnRzXSgke3VyaS50b1N0cmluZygpfSlgIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYSBzaG9ydCBpbmxpbmUgcmVmZXJlbmNlIGxhYmVsIChlLmcuIGEgc3ltYm9sIG5hbWUpIGFzLWlzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvcmVwby9zcmMvY29tbW9uL2FwcEluc2lnaHRzQ2xpZW50RmFjdG9yeS50cycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2plY3QobW9kZWwoW3JlcXVlc3QoJ3EnLCByZXNwb25zZShbXG5cdFx0XHRpbmxpbmVSZWZlcmVuY2UodXJpLCAnbG9nRXZlbnQnKSxcblx0XHRdKSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiBgW2xvZ0V2ZW50XSgke3VyaS50b1N0cmluZygpfSlgIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBhIExvY2F0aW9uLXNoYXBlZCBpbmxpbmUgcmVmZXJlbmNlIHRvIGl0cyBmaWxlIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvcmVwby9zcmMvY29tbW9uL2Jhc2VUZWxlbWV0cnlTZW5kZXIudHMnKTtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdxJywgcmVzcG9uc2UoW1xuXHRcdFx0aW5saW5lUmVmKHsgdXJpLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSB9KSxcblx0XHRdKSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiBgW2Jhc2VUZWxlbWV0cnlTZW5kZXIudHNdKCR7dXJpLnRvU3RyaW5nKCl9KWAgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGEgd29ya3NwYWNlLXN5bWJvbCBpbmxpbmUgcmVmZXJlbmNlIHVzaW5nIGl0cyBzeW1ib2wgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3JlcG8vc3JjL2NvbW1vbi9iYXNlVGVsZW1ldHJ5U2VuZGVyLnRzJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFtcblx0XHRcdGlubGluZVJlZih7IG5hbWU6ICdsb2dFdmVudCcsIGxvY2F0aW9uOiB7IHVyaSB9IH0pLFxuXHRcdF0pKV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3EnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6IGBbbG9nRXZlbnRdKCR7dXJpLnRvU3RyaW5nKCl9KWAgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBwbGFpbiBsYWJlbCB3aGVuIGFuIGlubGluZSByZWZlcmVuY2UgaGFzIG5vIHJlc29sdmFibGUgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByb2plY3QobW9kZWwoW3JlcXVlc3QoJ3EnLCByZXNwb25zZShbXG5cdFx0XHRpbmxpbmVSZWYoeyBuYW1lOiAnb3JwaGFuJyB9LCAnb3JwaGFuJyksXG5cdFx0XSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAncScsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ29ycGhhbicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGEgY2FuY2VsbGVkIHJlc3BvbnNlIHRvIGEgY2FuY2VsbGVkIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJvamVjdChtb2RlbChbcmVxdWVzdCgncScsIHJlc3BvbnNlKFttYXJrZG93bigncGFydGlhbCcpXSwgeyBjYW5jZWxlZDogdHJ1ZSB9KSldKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdHRleHQ6ICdxJyxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ2FuY2VsbGVkLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAncGFydGlhbCcgfV0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIGFuIGVycm9yZWQgcmVzcG9uc2UgdG8gYW4gZXJyb3IgdHVybiBjYXJyeWluZyB0aGUgbWVzc2FnZSBhbmQgY29kZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdxJywgcmVzcG9uc2UoW10sIHsgZXJyb3I6IHsgbWVzc2FnZTogJ2Jvb20nLCBjb2RlOiAnRTEnIH0gfSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAncScsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkVycm9yLFxuXHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnRTEnLCBtZXNzYWdlOiAnYm9vbScgfSxcblx0XHRcdHBhcnRzOiBbXSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRzIGEgc3lzdGVtLWluaXRpYXRlZCBjb250aW51YXRpb24gaW50byB0aGUgcHJldmlvdXMgdHVybiBhbmQgc3VwZXJzZWRlcyBpdHMgb3V0Y29tZScsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtcblx0XHRcdHJlcXVlc3QoJ3JlYWwgcXVlc3Rpb24nLCByZXNwb25zZShbbWFya2Rvd24oJ3dvcmtpbmcnKV0pKSxcblx0XHRcdHJlcXVlc3QoJ1tUZXJtaW5hbCBub3RpZmljYXRpb25dJywgcmVzcG9uc2UoW21hcmtkb3duKCdjb250aW51ZWQnKV0sIHsgY2FuY2VsZWQ6IHRydWUgfSksIHsgc3lzdGVtSW5pdGlhdGVkOiB0cnVlIH0pLFxuXHRcdF0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0dGV4dDogJ3JlYWwgcXVlc3Rpb24nLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5DYW5jZWxsZWQsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnd29ya2luZycgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnY29udGludWVkJyB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgYSBzdWItYWdlbnQgdG9vbCBpbnZvY2F0aW9uIHByZXNlcnZpbmcgaXRzIGlkZW50aXR5IGFzIHN0cnVjdHVyZWQgY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcm9qZWN0KG1vZGVsKFtyZXF1ZXN0KCdkZWxlZ2F0ZScsIHJlc3BvbnNlKFtzdWJhZ2VudFRvb2woJ3RjLTEnLCAnZXhwbG9yZScsICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLCAnZG9uZScpXSkpXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHR0ZXh0OiAnZGVsZWdhdGUnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRwYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgc3ViYWdlbnQ6IHsgYWdlbnROYW1lOiAnZXhwbG9yZScsIGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyB9IH1dLFxuXHRcdH1dKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQkFBa0IsdUJBQXVCLGlCQUFpRTtBQUVuSCxTQUFTLGtDQUFrQztBQUUzQyxNQUFNLDhCQUE4QixNQUFNO0FBRXpDLDBDQUF3QztBQUV4QyxXQUFTLFNBQVMsT0FBNkM7QUFDOUQsV0FBTyxFQUFFLE1BQU0sbUJBQW1CLFNBQVMsSUFBSSxlQUFlLEtBQUssRUFBRTtBQUFBLEVBQ3RFO0FBRUEsV0FBUyxTQUFTLE9BQTZDO0FBQzlELFdBQU8sRUFBRSxNQUFNLFlBQVksTUFBTTtBQUFBLEVBQ2xDO0FBRUEsV0FBUyxnQkFBZ0IsS0FBVSxNQUE2QztBQUMvRSxXQUFPLEVBQUUsTUFBTSxtQkFBbUIsaUJBQWlCLEtBQUssS0FBSztBQUFBLEVBQzlEO0FBR0EsV0FBUyxVQUFVLFdBQW9CLE1BQTZDO0FBQ25GLFdBQU8sRUFBRSxNQUFNLG1CQUFtQixpQkFBaUIsV0FBVyxLQUFLO0FBQUEsRUFDcEU7QUFFQSxXQUFTLGFBQWEsWUFBb0IsV0FBbUIsYUFBcUIsUUFBOEM7QUFDL0gsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLE1BQ25CLGtCQUFrQjtBQUFBLE1BQ2xCLGVBQWU7QUFBQSxNQUNmLGtCQUFrQixFQUFFLE1BQU0sWUFBWSxXQUFXLGFBQWEsUUFBUSxNQUFNLE9BQU87QUFBQSxJQUNwRjtBQUFBLEVBQ0Q7QUFFQSxXQUFTLFNBQVMsT0FBdUMsTUFBK0Y7QUFDdkosV0FBTztBQUFBLE1BQ04sZ0JBQWdCLEVBQUUsT0FBTyxNQUFNO0FBQUEsTUFDL0IsWUFBWSxDQUFDLENBQUMsTUFBTTtBQUFBLE1BQ3BCLFFBQVEsTUFBTSxRQUFRLEVBQUUsY0FBYyxLQUFLLE1BQU0sSUFBSTtBQUFBLElBQ3REO0FBQUEsRUFDRDtBQUVBLFdBQVMsUUFBUSxNQUFjQSxXQUErQixNQUF5RDtBQUN0SCxXQUFPLEVBQUUsU0FBUyxFQUFFLEtBQUssR0FBRyxVQUFBQSxXQUFVLG1CQUFtQixNQUFNLGdCQUFnQjtBQUFBLEVBQ2hGO0FBRUEsV0FBUyxNQUFNLFVBQTJDO0FBQ3pELFdBQU8sRUFBRSxhQUFhLE1BQU0sU0FBUztBQUFBLEVBQ3RDO0FBRUEsV0FBUyxXQUFXLE1BQW9CO0FBQ3ZDLFFBQUksS0FBSyxTQUFTLGlCQUFpQixVQUFVO0FBQzVDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxNQUFPLEtBQUssU0FBb0MsU0FBUyxLQUFLLE9BQUssRUFBRSxTQUFTLHNCQUFzQixRQUFRO0FBQ2xILFdBQU8sT0FBTyxJQUFJLFNBQVMsc0JBQXNCLFdBQVcsRUFBRSxXQUFXLElBQUksV0FBVyxhQUFhLElBQUksWUFBWSxJQUFJO0FBQUEsRUFDMUg7QUFFQSxXQUFTLFFBQVFDLFFBQW1CO0FBQ25DLFdBQU8sMkJBQTJCQSxNQUFLLEVBQUUsSUFBSSxXQUFTO0FBQUEsTUFDckQsTUFBTSxLQUFLLFFBQVE7QUFBQSxNQUNuQixPQUFPLEtBQUs7QUFBQSxNQUNaLE9BQU8sS0FBSztBQUFBLE1BQ1osT0FBTyxLQUFLLGNBQWMsSUFBSSxVQUM3QixLQUFLLFNBQVMsaUJBQWlCLFlBQVksS0FBSyxTQUFTLGlCQUFpQixZQUN2RSxFQUFFLE1BQU0sS0FBSyxNQUFNLFNBQVMsS0FBSyxRQUFRLElBQ3pDLEVBQUUsTUFBTSxLQUFLLE1BQU0sVUFBVSxXQUFXLElBQUksRUFBRSxDQUFDO0FBQUEsSUFDcEQsRUFBRTtBQUFBLEVBQ0g7QUFFQSxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sU0FBUyxRQUFRLE1BQU0sQ0FBQyxRQUFRLEtBQUssU0FBUztBQUFBLE1BQ25ELFNBQVMsV0FBVztBQUFBLE1BQ3BCLGdCQUFnQixJQUFJLEtBQUssWUFBWSxDQUFDO0FBQUEsTUFDdEMsU0FBUyxjQUFTO0FBQUEsTUFDbEIsU0FBUyxjQUFjO0FBQUEsSUFDeEIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRUwsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sT0FBTyxVQUFVO0FBQUEsTUFDakIsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVMsWUFBWTtBQUFBLFFBQ3hELEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxTQUFTLFVBQVUsSUFBSSxLQUFLLFlBQVksRUFBRSxTQUFTLENBQUMsSUFBSTtBQUFBLFFBQzNGLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxTQUFTLGVBQVU7QUFBQSxRQUN0RCxFQUFFLE1BQU0saUJBQWlCLFdBQVcsU0FBUyxlQUFlO0FBQUEsTUFDN0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFDL0UsVUFBTSxNQUFNLElBQUksS0FBSyw4Q0FBOEM7QUFDbkUsVUFBTSxTQUFTLFFBQVEsTUFBTSxDQUFDLFFBQVEsS0FBSyxTQUFTO0FBQUEsTUFDbkQsZ0JBQWdCLEtBQUssd0NBQXdDO0FBQUEsSUFDOUQsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRUwsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sT0FBTyxVQUFVO0FBQUEsTUFDakIsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVMsaUNBQWlDLElBQUksU0FBUyxDQUFDLElBQUk7QUFBQSxNQUNoRztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLE1BQU0sSUFBSSxLQUFLLDhDQUE4QztBQUNuRSxVQUFNLFNBQVMsUUFBUSxNQUFNLENBQUMsUUFBUSxLQUFLLFNBQVM7QUFBQSxNQUNuRCxnQkFBZ0IsS0FBSyxVQUFVO0FBQUEsSUFDaEMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRUwsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sT0FBTyxVQUFVO0FBQUEsTUFDakIsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVMsY0FBYyxJQUFJLFNBQVMsQ0FBQyxJQUFJO0FBQUEsTUFDN0U7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsVUFBTSxNQUFNLElBQUksS0FBSyx5Q0FBeUM7QUFDOUQsVUFBTSxTQUFTLFFBQVEsTUFBTSxDQUFDLFFBQVEsS0FBSyxTQUFTO0FBQUEsTUFDbkQsVUFBVSxFQUFFLEtBQUssT0FBTyxFQUFFLGlCQUFpQixHQUFHLGFBQWEsR0FBRyxlQUFlLEdBQUcsV0FBVyxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQ2pHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVMLFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQztBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLE9BQU8sVUFBVTtBQUFBLE1BQ2pCLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxTQUFTLDRCQUE0QixJQUFJLFNBQVMsQ0FBQyxJQUFJO0FBQUEsTUFDM0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsVUFBTSxNQUFNLElBQUksS0FBSyx5Q0FBeUM7QUFDOUQsVUFBTSxTQUFTLFFBQVEsTUFBTSxDQUFDLFFBQVEsS0FBSyxTQUFTO0FBQUEsTUFDbkQsVUFBVSxFQUFFLE1BQU0sWUFBWSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUM7QUFBQSxJQUNsRCxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFTCxXQUFPLGdCQUFnQixRQUFRLENBQUM7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixPQUFPLFVBQVU7QUFBQSxNQUNqQixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTixFQUFFLE1BQU0saUJBQWlCLFVBQVUsU0FBUyxjQUFjLElBQUksU0FBUyxDQUFDLElBQUk7QUFBQSxNQUM3RTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUMxRixVQUFNLFNBQVMsUUFBUSxNQUFNLENBQUMsUUFBUSxLQUFLLFNBQVM7QUFBQSxNQUNuRCxVQUFVLEVBQUUsTUFBTSxTQUFTLEdBQUcsUUFBUTtBQUFBLElBQ3ZDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVMLFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQztBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLE9BQU8sVUFBVTtBQUFBLE1BQ2pCLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxTQUFTLFNBQVM7QUFBQSxNQUN0RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxVQUFNLFNBQVMsUUFBUSxNQUFNLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxTQUFTLFNBQVMsQ0FBQyxHQUFHLEVBQUUsVUFBVSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVqRyxXQUFPLGdCQUFnQixRQUFRLENBQUM7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixPQUFPLFVBQVU7QUFBQSxNQUNqQixPQUFPO0FBQUEsTUFDUCxPQUFPLENBQUMsRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVMsVUFBVSxDQUFDO0FBQUEsSUFDaEUsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSywyRUFBMkUsTUFBTTtBQUNyRixVQUFNLFNBQVMsUUFBUSxNQUFNLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxFQUFFLFNBQVMsUUFBUSxNQUFNLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFFdEcsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sT0FBTyxVQUFVO0FBQUEsTUFDakIsT0FBTyxFQUFFLFdBQVcsTUFBTSxTQUFTLE9BQU87QUFBQSxNQUMxQyxPQUFPLENBQUM7QUFBQSxJQUNULENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssMkZBQTJGLE1BQU07QUFDckcsVUFBTSxTQUFTLFFBQVEsTUFBTTtBQUFBLE1BQzVCLFFBQVEsaUJBQWlCLFNBQVMsQ0FBQyxTQUFTLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUN4RCxRQUFRLDJCQUEyQixTQUFTLENBQUMsU0FBUyxXQUFXLENBQUMsR0FBRyxFQUFFLFVBQVUsS0FBSyxDQUFDLEdBQUcsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsSUFDcEgsQ0FBQyxDQUFDO0FBRUYsV0FBTyxnQkFBZ0IsUUFBUSxDQUFDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sT0FBTyxVQUFVO0FBQUEsTUFDakIsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sRUFBRSxNQUFNLGlCQUFpQixVQUFVLFNBQVMsVUFBVTtBQUFBLFFBQ3RELEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxTQUFTLFlBQVk7QUFBQSxNQUN6RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxrRkFBa0YsTUFBTTtBQUM1RixVQUFNLFNBQVMsUUFBUSxNQUFNLENBQUMsUUFBUSxZQUFZLFNBQVMsQ0FBQyxhQUFhLFFBQVEsV0FBVyx5QkFBeUIsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVqSSxXQUFPLGdCQUFnQixRQUFRLENBQUM7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixPQUFPLFVBQVU7QUFBQSxNQUNqQixPQUFPO0FBQUEsTUFDUCxPQUFPLENBQUMsRUFBRSxNQUFNLGlCQUFpQixVQUFVLFVBQVUsRUFBRSxXQUFXLFdBQVcsYUFBYSx3QkFBd0IsRUFBRSxDQUFDO0FBQUEsSUFDdEgsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsicmVzcG9uc2UiLCAibW9kZWwiXQp9Cg==
