import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { formatModelRequestMismatch, modelRequestsMatch, projectModelRequest, TOOL_RESULT_PLACEHOLDER } from "./e2e/harness/modelRequestProjection.js";
function request(messages) {
  return { model: "claude-sonnet-5", system: "${system}", messages };
}
suite("modelRequestProjection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps the host-authored structure of a conversation", () => {
    assert.deepStrictEqual(projectModelRequest(request([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" }
    ])), {
      system: "${system}",
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "second question" }
      ]
    });
  });
  test("the model id is elided so a catalog bump does not break every capture", () => {
    const recorded = request([{ role: "user", content: "question" }]);
    const live = { ...recorded, model: "claude-sonnet-4.5" };
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("elides the tool result payload but keeps its wiring", () => {
    assert.deepStrictEqual(projectModelRequest(request([
      {
        role: "assistant",
        content: [
          { type: "tool_use", name: "bash", input: { command: 'node -e "console.log(1)"' } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolcall_0", content: "Exit code: 0\r\n/Users/someone/tmp" }
        ]
      }
    ])).messages, [
      {
        role: "assistant",
        content: [
          { type: "tool_use", name: "${shell}", input: { command: 'node -e "console.log(1)"' } }
        ]
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "toolcall_0", content: TOOL_RESULT_PLACEHOLDER }
        ]
      }
    ]);
  });
  test("a capture recorded on one platform matches the same run on another", () => {
    const recorded = request([{ role: "assistant", content: [{ type: "tool_use", name: "bash", input: {} }] }]);
    const live = request([{ role: "assistant", content: [{ type: "tool_use", name: "powershell", input: {} }] }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("run-time identifiers are elided on both sides", () => {
    const recorded = request([{ role: "user", content: "Shell ID: ${uuid_0}" }]);
    const live = request([{ role: "user", content: "Shell ID: 6f1e5a7c-2b3d-4e5f-8a9b-0c1d2e3f4a5b" }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("reasoning blocks are elided because replay cannot reproduce them", () => {
    const recorded = request([{
      role: "assistant",
      content: [
        { type: "thinking" },
        { type: "tool_use", name: "view", input: { path: "a.txt" } }
      ]
    }]);
    const live = request([{
      role: "assistant",
      content: [
        { type: "tool_use", name: "view", input: { path: "a.txt" } }
      ]
    }]);
    assert.ok(modelRequestsMatch(projectModelRequest(recorded), projectModelRequest(live)));
  });
  test("a path matches however it is spelled", () => {
    const pairs = [
      ["Read the file at ${workdir}/peer-note.txt.", "Read the file at C:\\Users\\CLOUDT~1\\Temp\\ws\\peer-note.txt."],
      ["${homedir}/.copilot/session-state/${uuid_0}/plan.md", "C:\\Users\\CLOUDT~1\\Temp\\home-x/.copilot/session-state/${uuid_0}/plan.md"],
      ["* ${workdir}/calculator.py (2 lines)", "* ${workdir}\\calculator.py (2 lines)"],
      ["cd ${workdir} && echo hi", "cd C:\\Users\\CLOUDT~1\\Temp\\ahp-cd-strip-test-kWEDtO && echo hi"]
    ];
    assert.deepStrictEqual(pairs.map(([recorded, live]) => modelRequestsMatch(
      projectModelRequest(request([{ role: "user", content: recorded }])),
      projectModelRequest(request([{ role: "user", content: live }]))
    )), [true, true, true, true]);
  });
  test("the surrounding text still has to match", () => {
    assert.strictEqual(modelRequestsMatch(
      projectModelRequest(request([{ role: "user", content: "Read ${workdir}/a.txt" }])),
      projectModelRequest(request([{ role: "user", content: "Delete ${workdir}/a.txt" }]))
    ), false);
  });
  test("prose that merely contains a slash is left alone", () => {
    const prose = [
      "use a 3/4 ratio",
      "on 2024/01/02 we shipped",
      'Reply with exactly "hello world".'
    ];
    assert.deepStrictEqual(
      prose.map((text) => projectModelRequest(request([{ role: "user", content: text }])).messages[0].content),
      prose
    );
  });
  test("a tool input matches regardless of key order", () => {
    const toolUse = (input) => request([{
      role: "assistant",
      content: [{ type: "tool_use", name: "bash", input }]
    }]);
    assert.ok(modelRequestsMatch(
      projectModelRequest(toolUse({ command: "echo hi", description: "say hi" })),
      projectModelRequest(toolUse({ description: "say hi", command: "echo hi" }))
    ));
  });
  test("a different tool input value is still a mismatch", () => {
    const toolUse = (input) => request([{
      role: "assistant",
      content: [{ type: "tool_use", name: "bash", input }]
    }]);
    assert.strictEqual(modelRequestsMatch(
      projectModelRequest(toolUse({ command: "echo hi" })),
      projectModelRequest(toolUse({ command: "echo bye" }))
    ), false);
  });
  test("detects the regressions it exists to catch", () => {
    const recorded = projectModelRequest(request([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" }
    ]));
    assert.deepStrictEqual({
      droppedHistory: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "user", content: "second question" }
      ]))),
      reorderedMessages: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "assistant", content: "first answer" },
        { role: "user", content: "first question" },
        { role: "user", content: "second question" }
      ]))),
      changedText: modelRequestsMatch(recorded, projectModelRequest(request([
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "a different question" }
      ]))),
      missingSystemPrompt: modelRequestsMatch(recorded, projectModelRequest({
        model: "claude-sonnet-5",
        system: "",
        messages: [
          { role: "user", content: "first question" },
          { role: "assistant", content: "first answer" },
          { role: "user", content: "second question" }
        ]
      }))
    }, {
      droppedHistory: false,
      reorderedMessages: false,
      changedText: false,
      missingSystemPrompt: false
    });
  });
  test("detects a broken tool_use_id link", () => {
    const recorded = projectModelRequest(request([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolcall_0", content: "output" }] }
    ]));
    const live = projectModelRequest(request([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolcall_1", content: "different output" }] }
    ]));
    assert.strictEqual(modelRequestsMatch(recorded, live), false);
  });
  test("names the turn in the mismatch report", () => {
    const expected = projectModelRequest(request([{ role: "user", content: "expected" }]));
    const actual = projectModelRequest(request([{ role: "user", content: "actual" }]));
    const report = formatModelRequestMismatch(2, expected, actual);
    assert.ok(report.startsWith("model request #3 does not match the recorded request in the fixture"));
    assert.ok(report.includes("expected") && report.includes("actual"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvbW9kZWxSZXF1ZXN0UHJvamVjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRNb2RlbFJlcXVlc3RNaXNtYXRjaCwgbW9kZWxSZXF1ZXN0c01hdGNoLCBwcm9qZWN0TW9kZWxSZXF1ZXN0LCBUT09MX1JFU1VMVF9QTEFDRUhPTERFUiB9IGZyb20gJy4vZTJlL2hhcm5lc3MvbW9kZWxSZXF1ZXN0UHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3QgfSBmcm9tICcuL2UyZS9oYXJuZXNzL2NhcGlXaXJlQ29kZWMuanMnO1xuXG5mdW5jdGlvbiByZXF1ZXN0KG1lc3NhZ2VzOiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0WydtZXNzYWdlcyddKTogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB7XG5cdHJldHVybiB7IG1vZGVsOiAnY2xhdWRlLXNvbm5ldC01Jywgc3lzdGVtOiAnJHtzeXN0ZW19JywgbWVzc2FnZXMgfTtcbn1cblxuc3VpdGUoJ21vZGVsUmVxdWVzdFByb2plY3Rpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgna2VlcHMgdGhlIGhvc3QtYXV0aG9yZWQgc3RydWN0dXJlIG9mIGEgY29udmVyc2F0aW9uJywgKCkgPT4ge1xuXHRcdC8vIFJvbGVzLCBvcmRlcmluZywgcmV0YWluZWQgaGlzdG9yeSwgYW5kIHRoZSBzeXN0ZW0gcHJvbXB0IGFyZSB0aGVcblx0XHQvLyBob3N0J3Mgb3duIHByb2R1Y3QsIHNvIGFsbCBvZiB0aGVtIGFyZSBhc3NlcnRlZCB2ZXJiYXRpbS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJyB9LFxuXHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogJ2ZpcnN0IGFuc3dlcicgfSxcblx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnc2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdF0pKSwge1xuXHRcdFx0c3lzdGVtOiAnJHtzeXN0ZW19Jyxcblx0XHRcdG1lc3NhZ2VzOiBbXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6ICdmaXJzdCBhbnN3ZXInIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnc2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhlIG1vZGVsIGlkIGlzIGVsaWRlZCBzbyBhIGNhdGFsb2cgYnVtcCBkb2VzIG5vdCBicmVhayBldmVyeSBjYXB0dXJlJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBtb2RlbCBtb3ZlcyB3aXRoIHRoZSBwcm92aWRlciBkZWZhdWx0IGFuZCB0aGUgY2F0YWxvZyByYXRoZXIgdGhhblxuXHRcdC8vIHdpdGggYW55dGhpbmcgdGhlIGhvc3QgY29tcG9zZXMuXG5cdFx0Y29uc3QgcmVjb3JkZWQgPSByZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ3F1ZXN0aW9uJyB9XSk7XG5cdFx0Y29uc3QgbGl2ZTogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCA9IHsgLi4ucmVjb3JkZWQsIG1vZGVsOiAnY2xhdWRlLXNvbm5ldC00LjUnIH07XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsUmVxdWVzdHNNYXRjaChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlY29yZGVkKSwgcHJvamVjdE1vZGVsUmVxdWVzdChsaXZlKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGlkZXMgdGhlIHRvb2wgcmVzdWx0IHBheWxvYWQgYnV0IGtlZXBzIGl0cyB3aXJpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHBheWxvYWQgaXMgZW52aXJvbm1lbnQtZGVyaXZlZCBcdTIwMTQgY29tbWFuZCBvdXRwdXQsIGxpbmUgZW5kaW5ncyBhbmRcblx0XHQvLyBsaXN0aW5nIGZvcm1hdHMgYWxsIGRpZmZlciBwZXIgT1MgXHUyMDE0IHNvIG9ubHkgcHJlc2VuY2UgYW5kIHRoZVxuXHRcdC8vIGB0b29sX3VzZV9pZGAgbGluayBhcmUgYXNzZXJ0ZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW1xuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2Jhc2gnLCBpbnB1dDogeyBjb21tYW5kOiAnbm9kZSAtZSBcImNvbnNvbGUubG9nKDEpXCInIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJywgY29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6ICd0b29sY2FsbF8wJywgY29udGVudDogJ0V4aXQgY29kZTogMFxcclxcbi9Vc2Vycy9zb21lb25lL3RtcCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XSkpLm1lc3NhZ2VzLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnJHtzaGVsbH0nLCBpbnB1dDogeyBjb21tYW5kOiAnbm9kZSAtZSBcImNvbnNvbGUubG9nKDEpXCInIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJywgY29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6ICd0b29sY2FsbF8wJywgY29udGVudDogVE9PTF9SRVNVTFRfUExBQ0VIT0xERVIgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgY2FwdHVyZSByZWNvcmRlZCBvbiBvbmUgcGxhdGZvcm0gbWF0Y2hlcyB0aGUgc2FtZSBydW4gb24gYW5vdGhlcicsICgpID0+IHtcblx0XHQvLyBUaGUgc2hlbGwgdG9vbCBpcyBuYW1lZCBhZnRlciB0aGUgcGxhdGZvcm0ncyBzaGVsbCwgc28gdGhlIHJlY29yZGVkXG5cdFx0Ly8gYW5kIGxpdmUgbmFtZXMgZGlmZmVyIGJ5IGNvbnN0cnVjdGlvbi4gQm90aCBjb2xsYXBzZSB0byB0aGVcblx0XHQvLyBwbGFjZWhvbGRlciwgd2hpY2ggaXMgd2hhdCBtYWtlcyBvbmUgY2FwdHVyZSBkcml2ZSBldmVyeSBwbGF0Zm9ybS5cblx0XHRjb25zdCByZWNvcmRlZCA9IHJlcXVlc3QoW3sgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICdiYXNoJywgaW5wdXQ6IHt9IH1dIH1dKTtcblx0XHRjb25zdCBsaXZlID0gcmVxdWVzdChbeyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ3Bvd2Vyc2hlbGwnLCBpbnB1dDoge30gfV0gfV0pO1xuXHRcdGFzc2VydC5vayhtb2RlbFJlcXVlc3RzTWF0Y2gocHJvamVjdE1vZGVsUmVxdWVzdChyZWNvcmRlZCksIHByb2plY3RNb2RlbFJlcXVlc3QobGl2ZSkpKTtcblx0fSk7XG5cblx0dGVzdCgncnVuLXRpbWUgaWRlbnRpZmllcnMgYXJlIGVsaWRlZCBvbiBib3RoIHNpZGVzJywgKCkgPT4ge1xuXHRcdC8vIENhcHR1cmVzIHN0b3JlIHRoZXNlIGFzIG9yZGluYWxzIGFzc2lnbmVkIGF0IHdyaXRlIHRpbWU7IGEgbGl2ZSBydW5cblx0XHQvLyBtaW50cyByZWFsIG9uZXMuIE5laXRoZXIgaXMgcmVwcm9kdWNpYmxlLCBzbyBvbmx5IHByZXNlbmNlIGlzIGtlcHQuXG5cdFx0Y29uc3QgcmVjb3JkZWQgPSByZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ1NoZWxsIElEOiAke3V1aWRfMH0nIH1dKTtcblx0XHRjb25zdCBsaXZlID0gcmVxdWVzdChbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdTaGVsbCBJRDogNmYxZTVhN2MtMmIzZC00ZTVmLThhOWItMGMxZDJlM2Y0YTViJyB9XSk7XG5cdFx0YXNzZXJ0Lm9rKG1vZGVsUmVxdWVzdHNNYXRjaChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlY29yZGVkKSwgcHJvamVjdE1vZGVsUmVxdWVzdChsaXZlKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFzb25pbmcgYmxvY2tzIGFyZSBlbGlkZWQgYmVjYXVzZSByZXBsYXkgY2Fubm90IHJlcHJvZHVjZSB0aGVtJywgKCkgPT4ge1xuXHRcdC8vIEFnZ3JlZ2F0aW5nIGEgcmVjb3JkZWQgcmVwbHkgZHJvcHMgcmVhc29uaW5nLCBzbyB0aGUgYXNzaXN0YW50IHR1cm5cblx0XHQvLyByZXBsYXllZCBiYWNrIHRvIHRoZSBhZ2VudCBuZXZlciBjYXJyaWVzIG9uZSBldmVuIHRob3VnaCB0aGUgb3JpZ2luYWxcblx0XHQvLyBsaXZlIHJlY29yZGluZyBkaWQuXG5cdFx0Y29uc3QgcmVjb3JkZWQgPSByZXF1ZXN0KFt7XG5cdFx0XHRyb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW1xuXHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAndmlldycsIGlucHV0OiB7IHBhdGg6ICdhLnR4dCcgfSB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdFx0Y29uc3QgbGl2ZSA9IHJlcXVlc3QoW3tcblx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ3ZpZXcnLCBpbnB1dDogeyBwYXRoOiAnYS50eHQnIH0gfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5vayhtb2RlbFJlcXVlc3RzTWF0Y2gocHJvamVjdE1vZGVsUmVxdWVzdChyZWNvcmRlZCksIHByb2plY3RNb2RlbFJlcXVlc3QobGl2ZSkpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBwYXRoIG1hdGNoZXMgaG93ZXZlciBpdCBpcyBzcGVsbGVkJywgKCkgPT4ge1xuXHRcdC8vIFdpbmRvd3MgQ0kgcmVjb3JkZWQgYWxsIG9mIHRoZXNlIGFnYWluc3QgY2FwdHVyZXMgbWFkZSBvbiBtYWNPUy4gRWFjaFxuXHRcdC8vIHBhaXIgaXMgdGhlIHNhbWUgbG9jYXRpb24gYWRkcmVzc2VkIGRpZmZlcmVudGx5OiBhbiB1bnN1YnN0aXR1dGVkXG5cdFx0Ly8gd29ya2RpciwgYW4gdW5zdWJzdGl0dXRlZCBob21lZGlyLCBhIGBcXGAgc2VwYXJhdG9yLCBhbmQgdGhlIHdvcmtzcGFjZVxuXHRcdC8vIGRpcmVjdG9yeSBpdHNlbGYgd2l0aCBubyB0cmFpbGluZyBmaWxlLlxuXHRcdGNvbnN0IHBhaXJzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXG5cdFx0XHRbJ1JlYWQgdGhlIGZpbGUgYXQgJHt3b3JrZGlyfS9wZWVyLW5vdGUudHh0LicsICdSZWFkIHRoZSBmaWxlIGF0IEM6XFxcXFVzZXJzXFxcXENMT1VEVH4xXFxcXFRlbXBcXFxcd3NcXFxccGVlci1ub3RlLnR4dC4nXSxcblx0XHRcdFsnJHtob21lZGlyfS8uY29waWxvdC9zZXNzaW9uLXN0YXRlLyR7dXVpZF8wfS9wbGFuLm1kJywgJ0M6XFxcXFVzZXJzXFxcXENMT1VEVH4xXFxcXFRlbXBcXFxcaG9tZS14Ly5jb3BpbG90L3Nlc3Npb24tc3RhdGUvJHt1dWlkXzB9L3BsYW4ubWQnXSxcblx0XHRcdFsnKiAke3dvcmtkaXJ9L2NhbGN1bGF0b3IucHkgKDIgbGluZXMpJywgJyogJHt3b3JrZGlyfVxcXFxjYWxjdWxhdG9yLnB5ICgyIGxpbmVzKSddLFxuXHRcdFx0WydjZCAke3dvcmtkaXJ9ICYmIGVjaG8gaGknLCAnY2QgQzpcXFxcVXNlcnNcXFxcQ0xPVURUfjFcXFxcVGVtcFxcXFxhaHAtY2Qtc3RyaXAtdGVzdC1rV0VEdE8gJiYgZWNobyBoaSddLFxuXHRcdF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYWlycy5tYXAoKFtyZWNvcmRlZCwgbGl2ZV0pID0+IG1vZGVsUmVxdWVzdHNNYXRjaChcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IHJlY29yZGVkIH1dKSksXG5cdFx0XHRwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiBsaXZlIH1dKSksXG5cdFx0KSksIFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBzdXJyb3VuZGluZyB0ZXh0IHN0aWxsIGhhcyB0byBtYXRjaCcsICgpID0+IHtcblx0XHQvLyBFbGlkaW5nIHRoZSBwYXRoIG11c3Qgbm90IGVsaWRlIHRoZSBpbnN0cnVjdGlvbiB3cmFwcGVkIGFyb3VuZCBpdC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxSZXF1ZXN0c01hdGNoKFxuXHRcdFx0cHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ1JlYWQgJHt3b3JrZGlyfS9hLnR4dCcgfV0pKSxcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdEZWxldGUgJHt3b3JrZGlyfS9hLnR4dCcgfV0pKSxcblx0XHQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3NlIHRoYXQgbWVyZWx5IGNvbnRhaW5zIGEgc2xhc2ggaXMgbGVmdCBhbG9uZScsICgpID0+IHtcblx0XHRjb25zdCBwcm9zZSA9IFtcblx0XHRcdCd1c2UgYSAzLzQgcmF0aW8nLFxuXHRcdFx0J29uIDIwMjQvMDEvMDIgd2Ugc2hpcHBlZCcsXG5cdFx0XHQnUmVwbHkgd2l0aCBleGFjdGx5IFwiaGVsbG8gd29ybGRcIi4nLFxuXHRcdF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHByb3NlLm1hcCh0ZXh0ID0+IChwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiB0ZXh0IH1dKSkubWVzc2FnZXNbMF0uY29udGVudCkpLFxuXHRcdFx0cHJvc2UsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYSB0b29sIGlucHV0IG1hdGNoZXMgcmVnYXJkbGVzcyBvZiBrZXkgb3JkZXInLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGBpbnB1dGAgaXMgSlNPTiB0aGUgbW9kZWwgcHJvZHVjZWQ7IGl0cyBrZXkgb3JkZXIgaXMgbm90XG5cdFx0Ly8gZ3VhcmFudGVlZCB0byBzdXJ2aXZlIGEgcmUtcmVjb3JkIG9yIGEgWUFNTCByb3VuZC10cmlwLCBhbmQgY29tcGFyaW5nXG5cdFx0Ly8gcmF3IEpTT04gd291bGQgcmVwb3J0IGlkZW50aWNhbCByZXF1ZXN0cyBhcyBhIHJlZ3Jlc3Npb24uXG5cdFx0Y29uc3QgdG9vbFVzZSA9IChpbnB1dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IHJlcXVlc3QoW3tcblx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnYmFzaCcsIGlucHV0IH1dLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQub2sobW9kZWxSZXF1ZXN0c01hdGNoKFxuXHRcdFx0cHJvamVjdE1vZGVsUmVxdWVzdCh0b29sVXNlKHsgY29tbWFuZDogJ2VjaG8gaGknLCBkZXNjcmlwdGlvbjogJ3NheSBoaScgfSkpLFxuXHRcdFx0cHJvamVjdE1vZGVsUmVxdWVzdCh0b29sVXNlKHsgZGVzY3JpcHRpb246ICdzYXkgaGknLCBjb21tYW5kOiAnZWNobyBoaScgfSkpLFxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGRpZmZlcmVudCB0b29sIGlucHV0IHZhbHVlIGlzIHN0aWxsIGEgbWlzbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Ly8gS2V5LW9yZGVyIHRvbGVyYW5jZSBtdXN0IG5vdCBiZWNvbWUgdmFsdWUgdG9sZXJhbmNlLlxuXHRcdGNvbnN0IHRvb2xVc2UgPSAoaW5wdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiByZXF1ZXN0KFt7XG5cdFx0XHRyb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2Jhc2gnLCBpbnB1dCB9XSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsUmVxdWVzdHNNYXRjaChcblx0XHRcdHByb2plY3RNb2RlbFJlcXVlc3QodG9vbFVzZSh7IGNvbW1hbmQ6ICdlY2hvIGhpJyB9KSksXG5cdFx0XHRwcm9qZWN0TW9kZWxSZXF1ZXN0KHRvb2xVc2UoeyBjb21tYW5kOiAnZWNobyBieWUnIH0pKSxcblx0XHQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGVjdHMgdGhlIHJlZ3Jlc3Npb25zIGl0IGV4aXN0cyB0byBjYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCByZWNvcmRlZCA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2ZpcnN0IHF1ZXN0aW9uJyB9LFxuXHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogJ2ZpcnN0IGFuc3dlcicgfSxcblx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnc2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdF0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRyb3BwZWRIaXN0b3J5OiBtb2RlbFJlcXVlc3RzTWF0Y2gocmVjb3JkZWQsIHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnc2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdFx0XSkpKSxcblx0XHRcdHJlb3JkZXJlZE1lc3NhZ2VzOiBtb2RlbFJlcXVlc3RzTWF0Y2gocmVjb3JkZWQsIHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6ICdmaXJzdCBhbnN3ZXInIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnc2Vjb25kIHF1ZXN0aW9uJyB9LFxuXHRcdFx0XSkpKSxcblx0XHRcdGNoYW5nZWRUZXh0OiBtb2RlbFJlcXVlc3RzTWF0Y2gocmVjb3JkZWQsIHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHRcdHsgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6ICdmaXJzdCBhbnN3ZXInIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnYSBkaWZmZXJlbnQgcXVlc3Rpb24nIH0sXG5cdFx0XHRdKSkpLFxuXHRcdFx0bWlzc2luZ1N5c3RlbVByb21wdDogbW9kZWxSZXF1ZXN0c01hdGNoKHJlY29yZGVkLCBwcm9qZWN0TW9kZWxSZXF1ZXN0KHtcblx0XHRcdFx0bW9kZWw6ICdjbGF1ZGUtc29ubmV0LTUnLCBzeXN0ZW06ICcnLCBtZXNzYWdlczogW1xuXHRcdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnZmlyc3QgcXVlc3Rpb24nIH0sXG5cdFx0XHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogJ2ZpcnN0IGFuc3dlcicgfSxcblx0XHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ3NlY29uZCBxdWVzdGlvbicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRkcm9wcGVkSGlzdG9yeTogZmFsc2UsXG5cdFx0XHRyZW9yZGVyZWRNZXNzYWdlczogZmFsc2UsXG5cdFx0XHRjaGFuZ2VkVGV4dDogZmFsc2UsXG5cdFx0XHRtaXNzaW5nU3lzdGVtUHJvbXB0OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBhIGJyb2tlbiB0b29sX3VzZV9pZCBsaW5rJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY29yZGVkID0gcHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFtcblx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogJ3Rvb2xjYWxsXzAnLCBjb250ZW50OiAnb3V0cHV0JyB9XSB9LFxuXHRcdF0pKTtcblx0XHRjb25zdCBsaXZlID0gcHJvamVjdE1vZGVsUmVxdWVzdChyZXF1ZXN0KFtcblx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogJ3Rvb2xjYWxsXzEnLCBjb250ZW50OiAnZGlmZmVyZW50IG91dHB1dCcgfV0gfSxcblx0XHRdKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsUmVxdWVzdHNNYXRjaChyZWNvcmRlZCwgbGl2ZSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbmFtZXMgdGhlIHR1cm4gaW4gdGhlIG1pc21hdGNoIHJlcG9ydCcsICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RlZCA9IHByb2plY3RNb2RlbFJlcXVlc3QocmVxdWVzdChbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdleHBlY3RlZCcgfV0pKTtcblx0XHRjb25zdCBhY3R1YWwgPSBwcm9qZWN0TW9kZWxSZXF1ZXN0KHJlcXVlc3QoW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnYWN0dWFsJyB9XSkpO1xuXHRcdGNvbnN0IHJlcG9ydCA9IGZvcm1hdE1vZGVsUmVxdWVzdE1pc21hdGNoKDIsIGV4cGVjdGVkLCBhY3R1YWwpO1xuXHRcdGFzc2VydC5vayhyZXBvcnQuc3RhcnRzV2l0aCgnbW9kZWwgcmVxdWVzdCAjMyBkb2VzIG5vdCBtYXRjaCB0aGUgcmVjb3JkZWQgcmVxdWVzdCBpbiB0aGUgZml4dHVyZScpKTtcblx0XHRhc3NlcnQub2socmVwb3J0LmluY2x1ZGVzKCdleHBlY3RlZCcpICYmIHJlcG9ydC5pbmNsdWRlcygnYWN0dWFsJykpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NB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
