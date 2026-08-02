import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { getServerToolDisplay } from "../../node/shared/serverToolGroups.js";
function text(value) {
  if (value === void 0) {
    return void 0;
  }
  return typeof value === "string" ? value : value.markdown;
}
suite("serverToolGroups display", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("feedback tools resolve to dedicated display strings", () => {
    const display = (toolName) => {
      const d = getServerToolDisplay(toolName, void 0);
      return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
    };
    assert.deepStrictEqual({
      add: display("addComment"),
      list: display("listComments"),
      del: display("deleteComments"),
      resolve: display("resolveComments"),
      view: display("viewUnreviewedComments")
    }, {
      add: { displayName: "Add Comment", invocation: "Adding comment" },
      list: { displayName: "List Comments", invocation: "Checking comments" },
      del: { displayName: "Delete Comments", invocation: "Deleting comments" },
      resolve: { displayName: "Resolve Comments", invocation: "Resolving comments" },
      view: { displayName: "View Comments", invocation: "Viewing comments" }
    });
  });
  test("session-management tools resolve to dedicated display strings", () => {
    const display = (toolName) => {
      const d = getServerToolDisplay(toolName, void 0);
      return { displayName: d?.displayName, invocation: text(d?.invocationMessage) };
    };
    assert.deepStrictEqual({
      list: display("list_sessions"),
      current: display("get_current_session"),
      create: display("create_session"),
      chat: display("create_chat"),
      send: display("send_message"),
      context: display("get_session_context"),
      del: display("delete_session")
    }, {
      list: { displayName: "List Sessions", invocation: "Checking sessions" },
      current: { displayName: "Get Current Session", invocation: "Checking current session" },
      create: { displayName: "Create Session", invocation: "Creating session" },
      chat: { displayName: "Create Chat", invocation: "Creating chat" },
      send: { displayName: "Send Message", invocation: "Sending message" },
      context: { displayName: "Get Session Context", invocation: "Reading session context" },
      del: { displayName: "Delete Session", invocation: "Deleting session" }
    });
  });
  test("listComments past tense reflects the comment count parsed from the result", () => {
    const past = (resultText) => text(getServerToolDisplay("listComments", void 0, { text: resultText, success: true })?.pastTenseMessage);
    const withComments = (n) => JSON.stringify({ comments: Array.from({ length: n }, (_, i) => ({ id: `${i}` })) });
    assert.deepStrictEqual({
      zero: past(withComments(0)),
      one: past(withComments(1)),
      many: past(withComments(3)),
      noResult: past(),
      malformed: past("not json"),
      noComments: past(JSON.stringify({ other: 1 }))
    }, {
      zero: "Checked 0 comments",
      one: "Checked 1 comment",
      many: "Checked 3 comments",
      noResult: "Checked comments",
      malformed: "Checked comments",
      noComments: "Checked comments"
    });
  });
  test("non-listComments past tense ignores the result text", () => {
    assert.strictEqual(
      text(getServerToolDisplay("resolveComments", void 0, { text: "anything", success: true })?.pastTenseMessage),
      "Resolved comments"
    );
  });
  test("transport-prefixed names (Claude mcp__host__) match the bare tool", () => {
    assert.deepStrictEqual({
      display: getServerToolDisplay("mcp__host__listComments", void 0)?.displayName,
      past: text(getServerToolDisplay("mcp__host__listComments", void 0, { text: JSON.stringify({ comments: [{ id: "a" }, { id: "b" }] }), success: true })?.pastTenseMessage)
    }, {
      display: "List Comments",
      past: "Checked 2 comments"
    });
  });
  test("unknown tools return undefined so callers fall back to their generic display", () => {
    assert.strictEqual(getServerToolDisplay("bash", { command: "ls" }), void 0);
    assert.strictEqual(getServerToolDisplay("someClientTool", void 0), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2VydmVyVG9vbEdyb3Vwcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IFN0cmluZ09yTWFya2Rvd24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGdldFNlcnZlclRvb2xEaXNwbGF5IH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvc2VydmVyVG9vbEdyb3Vwcy5qcyc7XG5cbmZ1bmN0aW9uIHRleHQodmFsdWU6IFN0cmluZ09yTWFya2Rvd24gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHZhbHVlLm1hcmtkb3duO1xufVxuXG5zdWl0ZSgnc2VydmVyVG9vbEdyb3VwcyBkaXNwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZlZWRiYWNrIHRvb2xzIHJlc29sdmUgdG8gZGVkaWNhdGVkIGRpc3BsYXkgc3RyaW5ncycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwbGF5ID0gKHRvb2xOYW1lOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGQgPSBnZXRTZXJ2ZXJUb29sRGlzcGxheSh0b29sTmFtZSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiB7IGRpc3BsYXlOYW1lOiBkPy5kaXNwbGF5TmFtZSwgaW52b2NhdGlvbjogdGV4dChkPy5pbnZvY2F0aW9uTWVzc2FnZSkgfTtcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWRkOiBkaXNwbGF5KCdhZGRDb21tZW50JyksXG5cdFx0XHRsaXN0OiBkaXNwbGF5KCdsaXN0Q29tbWVudHMnKSxcblx0XHRcdGRlbDogZGlzcGxheSgnZGVsZXRlQ29tbWVudHMnKSxcblx0XHRcdHJlc29sdmU6IGRpc3BsYXkoJ3Jlc29sdmVDb21tZW50cycpLFxuXHRcdFx0dmlldzogZGlzcGxheSgndmlld1VucmV2aWV3ZWRDb21tZW50cycpLFxuXHRcdH0sIHtcblx0XHRcdGFkZDogeyBkaXNwbGF5TmFtZTogJ0FkZCBDb21tZW50JywgaW52b2NhdGlvbjogJ0FkZGluZyBjb21tZW50JyB9LFxuXHRcdFx0bGlzdDogeyBkaXNwbGF5TmFtZTogJ0xpc3QgQ29tbWVudHMnLCBpbnZvY2F0aW9uOiAnQ2hlY2tpbmcgY29tbWVudHMnIH0sXG5cdFx0XHRkZWw6IHsgZGlzcGxheU5hbWU6ICdEZWxldGUgQ29tbWVudHMnLCBpbnZvY2F0aW9uOiAnRGVsZXRpbmcgY29tbWVudHMnIH0sXG5cdFx0XHRyZXNvbHZlOiB7IGRpc3BsYXlOYW1lOiAnUmVzb2x2ZSBDb21tZW50cycsIGludm9jYXRpb246ICdSZXNvbHZpbmcgY29tbWVudHMnIH0sXG5cdFx0XHR2aWV3OiB7IGRpc3BsYXlOYW1lOiAnVmlldyBDb21tZW50cycsIGludm9jYXRpb246ICdWaWV3aW5nIGNvbW1lbnRzJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uLW1hbmFnZW1lbnQgdG9vbHMgcmVzb2x2ZSB0byBkZWRpY2F0ZWQgZGlzcGxheSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3BsYXkgPSAodG9vbE5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgZCA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHRvb2xOYW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIHsgZGlzcGxheU5hbWU6IGQ/LmRpc3BsYXlOYW1lLCBpbnZvY2F0aW9uOiB0ZXh0KGQ/Lmludm9jYXRpb25NZXNzYWdlKSB9O1xuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsaXN0OiBkaXNwbGF5KCdsaXN0X3Nlc3Npb25zJyksXG5cdFx0XHRjdXJyZW50OiBkaXNwbGF5KCdnZXRfY3VycmVudF9zZXNzaW9uJyksXG5cdFx0XHRjcmVhdGU6IGRpc3BsYXkoJ2NyZWF0ZV9zZXNzaW9uJyksXG5cdFx0XHRjaGF0OiBkaXNwbGF5KCdjcmVhdGVfY2hhdCcpLFxuXHRcdFx0c2VuZDogZGlzcGxheSgnc2VuZF9tZXNzYWdlJyksXG5cdFx0XHRjb250ZXh0OiBkaXNwbGF5KCdnZXRfc2Vzc2lvbl9jb250ZXh0JyksXG5cdFx0XHRkZWw6IGRpc3BsYXkoJ2RlbGV0ZV9zZXNzaW9uJyksXG5cdFx0fSwge1xuXHRcdFx0bGlzdDogeyBkaXNwbGF5TmFtZTogJ0xpc3QgU2Vzc2lvbnMnLCBpbnZvY2F0aW9uOiAnQ2hlY2tpbmcgc2Vzc2lvbnMnIH0sXG5cdFx0XHRjdXJyZW50OiB7IGRpc3BsYXlOYW1lOiAnR2V0IEN1cnJlbnQgU2Vzc2lvbicsIGludm9jYXRpb246ICdDaGVja2luZyBjdXJyZW50IHNlc3Npb24nIH0sXG5cdFx0XHRjcmVhdGU6IHsgZGlzcGxheU5hbWU6ICdDcmVhdGUgU2Vzc2lvbicsIGludm9jYXRpb246ICdDcmVhdGluZyBzZXNzaW9uJyB9LFxuXHRcdFx0Y2hhdDogeyBkaXNwbGF5TmFtZTogJ0NyZWF0ZSBDaGF0JywgaW52b2NhdGlvbjogJ0NyZWF0aW5nIGNoYXQnIH0sXG5cdFx0XHRzZW5kOiB7IGRpc3BsYXlOYW1lOiAnU2VuZCBNZXNzYWdlJywgaW52b2NhdGlvbjogJ1NlbmRpbmcgbWVzc2FnZScgfSxcblx0XHRcdGNvbnRleHQ6IHsgZGlzcGxheU5hbWU6ICdHZXQgU2Vzc2lvbiBDb250ZXh0JywgaW52b2NhdGlvbjogJ1JlYWRpbmcgc2Vzc2lvbiBjb250ZXh0JyB9LFxuXHRcdFx0ZGVsOiB7IGRpc3BsYXlOYW1lOiAnRGVsZXRlIFNlc3Npb24nLCBpbnZvY2F0aW9uOiAnRGVsZXRpbmcgc2Vzc2lvbicgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdENvbW1lbnRzIHBhc3QgdGVuc2UgcmVmbGVjdHMgdGhlIGNvbW1lbnQgY291bnQgcGFyc2VkIGZyb20gdGhlIHJlc3VsdCcsICgpID0+IHtcblx0XHRjb25zdCBwYXN0ID0gKHJlc3VsdFRleHQ/OiBzdHJpbmcpID0+XG5cdFx0XHR0ZXh0KGdldFNlcnZlclRvb2xEaXNwbGF5KCdsaXN0Q29tbWVudHMnLCB1bmRlZmluZWQsIHsgdGV4dDogcmVzdWx0VGV4dCwgc3VjY2VzczogdHJ1ZSB9KT8ucGFzdFRlbnNlTWVzc2FnZSk7XG5cdFx0Y29uc3Qgd2l0aENvbW1lbnRzID0gKG46IG51bWJlcikgPT4gSlNPTi5zdHJpbmdpZnkoeyBjb21tZW50czogQXJyYXkuZnJvbSh7IGxlbmd0aDogbiB9LCAoXywgaSkgPT4gKHsgaWQ6IGAke2l9YCB9KSkgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR6ZXJvOiBwYXN0KHdpdGhDb21tZW50cygwKSksXG5cdFx0XHRvbmU6IHBhc3Qod2l0aENvbW1lbnRzKDEpKSxcblx0XHRcdG1hbnk6IHBhc3Qod2l0aENvbW1lbnRzKDMpKSxcblx0XHRcdG5vUmVzdWx0OiBwYXN0KCksXG5cdFx0XHRtYWxmb3JtZWQ6IHBhc3QoJ25vdCBqc29uJyksXG5cdFx0XHRub0NvbW1lbnRzOiBwYXN0KEpTT04uc3RyaW5naWZ5KHsgb3RoZXI6IDEgfSkpLFxuXHRcdH0sIHtcblx0XHRcdHplcm86ICdDaGVja2VkIDAgY29tbWVudHMnLFxuXHRcdFx0b25lOiAnQ2hlY2tlZCAxIGNvbW1lbnQnLFxuXHRcdFx0bWFueTogJ0NoZWNrZWQgMyBjb21tZW50cycsXG5cdFx0XHRub1Jlc3VsdDogJ0NoZWNrZWQgY29tbWVudHMnLFxuXHRcdFx0bWFsZm9ybWVkOiAnQ2hlY2tlZCBjb21tZW50cycsXG5cdFx0XHRub0NvbW1lbnRzOiAnQ2hlY2tlZCBjb21tZW50cycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbi1saXN0Q29tbWVudHMgcGFzdCB0ZW5zZSBpZ25vcmVzIHRoZSByZXN1bHQgdGV4dCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0ZXh0KGdldFNlcnZlclRvb2xEaXNwbGF5KCdyZXNvbHZlQ29tbWVudHMnLCB1bmRlZmluZWQsIHsgdGV4dDogJ2FueXRoaW5nJywgc3VjY2VzczogdHJ1ZSB9KT8ucGFzdFRlbnNlTWVzc2FnZSksXG5cdFx0XHQnUmVzb2x2ZWQgY29tbWVudHMnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zcG9ydC1wcmVmaXhlZCBuYW1lcyAoQ2xhdWRlIG1jcF9faG9zdF9fKSBtYXRjaCB0aGUgYmFyZSB0b29sJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGxheTogZ2V0U2VydmVyVG9vbERpc3BsYXkoJ21jcF9faG9zdF9fbGlzdENvbW1lbnRzJywgdW5kZWZpbmVkKT8uZGlzcGxheU5hbWUsXG5cdFx0XHRwYXN0OiB0ZXh0KGdldFNlcnZlclRvb2xEaXNwbGF5KCdtY3BfX2hvc3RfX2xpc3RDb21tZW50cycsIHVuZGVmaW5lZCwgeyB0ZXh0OiBKU09OLnN0cmluZ2lmeSh7IGNvbW1lbnRzOiBbeyBpZDogJ2EnIH0sIHsgaWQ6ICdiJyB9XSB9KSwgc3VjY2VzczogdHJ1ZSB9KT8ucGFzdFRlbnNlTWVzc2FnZSksXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGxheTogJ0xpc3QgQ29tbWVudHMnLFxuXHRcdFx0cGFzdDogJ0NoZWNrZWQgMiBjb21tZW50cycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gdG9vbHMgcmV0dXJuIHVuZGVmaW5lZCBzbyBjYWxsZXJzIGZhbGwgYmFjayB0byB0aGVpciBnZW5lcmljIGRpc3BsYXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlcnZlclRvb2xEaXNwbGF5KCdiYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZXJ2ZXJUb29sRGlzcGxheSgnc29tZUNsaWVudFRvb2wnLCB1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsS0FBSyxPQUF5RDtBQUN0RSxNQUFJLFVBQVUsUUFBVztBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sT0FBTyxVQUFVLFdBQVcsUUFBUSxNQUFNO0FBQ2xEO0FBRUEsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QywwQ0FBd0M7QUFFeEMs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
