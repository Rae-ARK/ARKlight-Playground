import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind } from "../../../common/state/sessionState.js";
import { buildElicitationRequest, elicitationResponseFromAnswers } from "../../../node/codex/codexElicitationMapper.js";
suite("codexElicitationMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const formParams = {
    threadId: "t1",
    turnId: null,
    serverName: "srv",
    mode: "form",
    _meta: null,
    message: "Please configure",
    requestedSchema: {
      type: "object",
      required: ["name", "count"],
      properties: {
        name: { type: "string", title: "Name", description: "Your name", minLength: 1 },
        count: { type: "integer", title: "Count", minimum: 0, maximum: 9 },
        enabled: { type: "boolean", title: "Enabled", default: true },
        color: { type: "string", title: "Color", enum: ["red", "green"], enumNames: ["Red", "Green"] },
        size: { type: "string", title: "Size", oneOf: [{ const: "s", title: "Small" }, { const: "l", title: "Large" }] },
        tags: { type: "array", title: "Tags", items: { type: "string", enum: ["a", "b"] } }
      }
    }
  };
  const urlParams = {
    threadId: "t1",
    turnId: null,
    serverName: "srv",
    mode: "url",
    _meta: null,
    message: "Authorize",
    url: "https://example.com/auth",
    elicitationId: "e1"
  };
  test("buildElicitationRequest (form) projects every primitive field kind", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-1", formParams), {
      id: "req-1",
      message: "Please configure",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "name", title: "Name", message: "Your name", required: true, format: void 0, min: 1, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Integer, id: "count", title: "Count", message: "Count", required: true, min: 0, max: 9, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Boolean, id: "enabled", title: "Enabled", message: "Enabled", required: false, defaultValue: true },
        { kind: ChatInputQuestionKind.SingleSelect, id: "color", title: "Color", message: "Color", required: false, options: [{ id: "red", label: "Red" }, { id: "green", label: "Green" }] },
        { kind: ChatInputQuestionKind.SingleSelect, id: "size", title: "Size", message: "Size", required: false, options: [{ id: "s", label: "Small" }, { id: "l", label: "Large" }] },
        { kind: ChatInputQuestionKind.MultiSelect, id: "tags", title: "Tags", message: "Tags", required: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], min: void 0, max: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (url) surfaces the url with no questions", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-2", urlParams), {
      id: "req-2",
      message: "Authorize",
      url: "https://example.com/auth"
    });
  });
  test("elicitationResponseFromAnswers maps decline/cancel/accept", () => {
    const accepted = {
      name: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" } },
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
      enabled: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
      color: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "red" } },
      tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["a", "b"] } },
      size: { state: ChatInputAnswerState.Skipped }
    };
    assert.deepStrictEqual({
      decline: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Decline, void 0),
      cancel: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Cancel, void 0),
      accept: elicitationResponseFromAnswers(formParams, ChatInputResponseKind.Accept, accepted)
    }, {
      decline: { action: "decline", content: null, _meta: null },
      cancel: { action: "cancel", content: null, _meta: null },
      accept: { action: "accept", _meta: null, content: { name: "Ada", count: 3, enabled: false, color: "red", tags: ["a", "b"] } }
    });
  });
  test("elicitationResponseFromAnswers (url accept) carries no content", () => {
    assert.deepStrictEqual(
      elicitationResponseFromAnswers(urlParams, ChatInputResponseKind.Accept, void 0),
      { action: "accept", content: null, _meta: null }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhFbGljaXRhdGlvbk1hcHBlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlc3BvbnNlS2luZCwgdHlwZSBDaGF0SW5wdXRBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkRWxpY2l0YXRpb25SZXF1ZXN0LCBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4RWxpY2l0YXRpb25NYXBwZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L3Byb3RvY29sL2dlbmVyYXRlZC92Mi9NY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMuanMnO1xuXG5zdWl0ZSgnY29kZXhFbGljaXRhdGlvbk1hcHBlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBmb3JtUGFyYW1zOiBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMgPSB7XG5cdFx0dGhyZWFkSWQ6ICd0MScsIHR1cm5JZDogbnVsbCwgc2VydmVyTmFtZTogJ3NydicsIG1vZGU6ICdmb3JtJywgX21ldGE6IG51bGwsXG5cdFx0bWVzc2FnZTogJ1BsZWFzZSBjb25maWd1cmUnLFxuXHRcdHJlcXVlc3RlZFNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRyZXF1aXJlZDogWyduYW1lJywgJ2NvdW50J10sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTmFtZScsIGRlc2NyaXB0aW9uOiAnWW91ciBuYW1lJywgbWluTGVuZ3RoOiAxIH0sXG5cdFx0XHRcdGNvdW50OiB7IHR5cGU6ICdpbnRlZ2VyJywgdGl0bGU6ICdDb3VudCcsIG1pbmltdW06IDAsIG1heGltdW06IDkgfSxcblx0XHRcdFx0ZW5hYmxlZDogeyB0eXBlOiAnYm9vbGVhbicsIHRpdGxlOiAnRW5hYmxlZCcsIGRlZmF1bHQ6IHRydWUgfSxcblx0XHRcdFx0Y29sb3I6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQ29sb3InLCBlbnVtOiBbJ3JlZCcsICdncmVlbiddLCBlbnVtTmFtZXM6IFsnUmVkJywgJ0dyZWVuJ10gfSxcblx0XHRcdFx0c2l6ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdTaXplJywgb25lT2Y6IFt7IGNvbnN0OiAncycsIHRpdGxlOiAnU21hbGwnIH0sIHsgY29uc3Q6ICdsJywgdGl0bGU6ICdMYXJnZScgfV0gfSxcblx0XHRcdFx0dGFnczogeyB0eXBlOiAnYXJyYXknLCB0aXRsZTogJ1RhZ3MnLCBpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgZW51bTogWydhJywgJ2InXSB9IH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH07XG5cblx0Y29uc3QgdXJsUGFyYW1zOiBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMgPSB7XG5cdFx0dGhyZWFkSWQ6ICd0MScsIHR1cm5JZDogbnVsbCwgc2VydmVyTmFtZTogJ3NydicsIG1vZGU6ICd1cmwnLCBfbWV0YTogbnVsbCxcblx0XHRtZXNzYWdlOiAnQXV0aG9yaXplJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRoJywgZWxpY2l0YXRpb25JZDogJ2UxJyxcblx0fTtcblxuXHR0ZXN0KCdidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCAoZm9ybSkgcHJvamVjdHMgZXZlcnkgcHJpbWl0aXZlIGZpZWxkIGtpbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgncmVxLTEnLCBmb3JtUGFyYW1zKSwge1xuXHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRtZXNzYWdlOiAnUGxlYXNlIGNvbmZpZ3VyZScsXG5cdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICduYW1lJywgdGl0bGU6ICdOYW1lJywgbWVzc2FnZTogJ1lvdXIgbmFtZScsIHJlcXVpcmVkOiB0cnVlLCBmb3JtYXQ6IHVuZGVmaW5lZCwgbWluOiAxLCBtYXg6IHVuZGVmaW5lZCwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlciwgaWQ6ICdjb3VudCcsIHRpdGxlOiAnQ291bnQnLCBtZXNzYWdlOiAnQ291bnQnLCByZXF1aXJlZDogdHJ1ZSwgbWluOiAwLCBtYXg6IDksIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4sIGlkOiAnZW5hYmxlZCcsIHRpdGxlOiAnRW5hYmxlZCcsIG1lc3NhZ2U6ICdFbmFibGVkJywgcmVxdWlyZWQ6IGZhbHNlLCBkZWZhdWx0VmFsdWU6IHRydWUgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ2NvbG9yJywgdGl0bGU6ICdDb2xvcicsIG1lc3NhZ2U6ICdDb2xvcicsIHJlcXVpcmVkOiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdyZWQnLCBsYWJlbDogJ1JlZCcgfSwgeyBpZDogJ2dyZWVuJywgbGFiZWw6ICdHcmVlbicgfV0gfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ3NpemUnLCB0aXRsZTogJ1NpemUnLCBtZXNzYWdlOiAnU2l6ZScsIHJlcXVpcmVkOiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdzJywgbGFiZWw6ICdTbWFsbCcgfSwgeyBpZDogJ2wnLCBsYWJlbDogJ0xhcmdlJyB9XSB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5NdWx0aVNlbGVjdCwgaWQ6ICd0YWdzJywgdGl0bGU6ICdUYWdzJywgbWVzc2FnZTogJ1RhZ3MnLCByZXF1aXJlZDogZmFsc2UsIG9wdGlvbnM6IFt7IGlkOiAnYScsIGxhYmVsOiAnYScgfSwgeyBpZDogJ2InLCBsYWJlbDogJ2InIH1dLCBtaW46IHVuZGVmaW5lZCwgbWF4OiB1bmRlZmluZWQgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkRWxpY2l0YXRpb25SZXF1ZXN0ICh1cmwpIHN1cmZhY2VzIHRoZSB1cmwgd2l0aCBubyBxdWVzdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgncmVxLTInLCB1cmxQYXJhbXMpLCB7XG5cdFx0XHRpZDogJ3JlcS0yJywgbWVzc2FnZTogJ0F1dGhvcml6ZScsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXV0aCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2VycyBtYXBzIGRlY2xpbmUvY2FuY2VsL2FjY2VwdCcsICgpID0+IHtcblx0XHRjb25zdCBhY2NlcHRlZDogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPiA9IHtcblx0XHRcdG5hbWU6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnQWRhJyB9IH0sXG5cdFx0XHRjb3VudDogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuTnVtYmVyLCB2YWx1ZTogMyB9IH0sXG5cdFx0XHRlbmFibGVkOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5Cb29sZWFuLCB2YWx1ZTogZmFsc2UgfSB9LFxuXHRcdFx0Y29sb3I6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJ3JlZCcgfSB9LFxuXHRcdFx0dGFnczogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LCB2YWx1ZTogWydhJywgJ2InXSB9IH0sXG5cdFx0XHRzaXplOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkIH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlY2xpbmU6IGVsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2Vycyhmb3JtUGFyYW1zLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSwgdW5kZWZpbmVkKSxcblx0XHRcdGNhbmNlbDogZWxpY2l0YXRpb25SZXNwb25zZUZyb21BbnN3ZXJzKGZvcm1QYXJhbXMsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwsIHVuZGVmaW5lZCksXG5cdFx0XHRhY2NlcHQ6IGVsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2Vycyhmb3JtUGFyYW1zLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCBhY2NlcHRlZCksXG5cdFx0fSwge1xuXHRcdFx0ZGVjbGluZTogeyBhY3Rpb246ICdkZWNsaW5lJywgY29udGVudDogbnVsbCwgX21ldGE6IG51bGwgfSxcblx0XHRcdGNhbmNlbDogeyBhY3Rpb246ICdjYW5jZWwnLCBjb250ZW50OiBudWxsLCBfbWV0YTogbnVsbCB9LFxuXHRcdFx0YWNjZXB0OiB7IGFjdGlvbjogJ2FjY2VwdCcsIF9tZXRhOiBudWxsLCBjb250ZW50OiB7IG5hbWU6ICdBZGEnLCBjb3VudDogMywgZW5hYmxlZDogZmFsc2UsIGNvbG9yOiAncmVkJywgdGFnczogWydhJywgJ2InXSB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2VycyAodXJsIGFjY2VwdCkgY2FycmllcyBubyBjb250ZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnModXJsUGFyYW1zLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCB1bmRlZmluZWQpLFxuXHRcdFx0eyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiBudWxsLCBfbWV0YTogbnVsbCB9LFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0IsMEJBQTBCLHVCQUF1Qiw2QkFBbUQ7QUFDbkksU0FBUyx5QkFBeUIsc0NBQXNDO0FBR3hFLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsMENBQXdDO0FBRXhDLFFBQU0sYUFBZ0Q7QUFBQSxJQUNyRCxVQUFVO0FBQUEsSUFBTSxRQUFRO0FBQUEsSUFBTSxZQUFZO0FBQUEsSUFBTyxNQUFNO0FBQUEsSUFBUSxPQUFPO0FBQUEsSUFDdEUsU0FBUztBQUFBLElBQ1QsaUJBQWlCO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sVUFBVSxDQUFDLFFBQVEsT0FBTztBQUFBLE1BQzFCLFlBQVk7QUFBQSxRQUNYLE1BQU0sRUFBRSxNQUFNLFVBQVUsT0FBTyxRQUFRLGFBQWEsYUFBYSxXQUFXLEVBQUU7QUFBQSxRQUM5RSxPQUFPLEVBQUUsTUFBTSxXQUFXLE9BQU8sU0FBUyxTQUFTLEdBQUcsU0FBUyxFQUFFO0FBQUEsUUFDakUsU0FBUyxFQUFFLE1BQU0sV0FBVyxPQUFPLFdBQVcsU0FBUyxLQUFLO0FBQUEsUUFDNUQsT0FBTyxFQUFFLE1BQU0sVUFBVSxPQUFPLFNBQVMsTUFBTSxDQUFDLE9BQU8sT0FBTyxHQUFHLFdBQVcsQ0FBQyxPQUFPLE9BQU8sRUFBRTtBQUFBLFFBQzdGLE1BQU0sRUFBRSxNQUFNLFVBQVUsT0FBTyxRQUFRLE9BQU8sQ0FBQyxFQUFFLE9BQU8sS0FBSyxPQUFPLFFBQVEsR0FBRyxFQUFF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
