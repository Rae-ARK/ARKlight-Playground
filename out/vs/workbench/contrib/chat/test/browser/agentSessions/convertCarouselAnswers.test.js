import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ChatInputQuestionKind, SessionInputAnswerState, SessionInputAnswerValueKind } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { convertCarouselAnswers } from "../../../browser/agentSessions/agentHost/agentHostSessionHandler.js";
suite("convertCarouselAnswers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts string answer to text", () => {
    const result = convertCarouselAnswers({ "q1": "hello" });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Text, value: "hello" }
      }
    });
  });
  test("converts single-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "opt-1" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Selected, value: "opt-1", freeformValues: void 0 }
      }
    });
  });
  test("converts single-select answer with freeform", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "opt-1", freeformValue: "custom" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Selected, value: "opt-1", freeformValues: ["custom"] }
      }
    });
  });
  test("converts boolean single-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValue: "false" } }, [{
      kind: ChatInputQuestionKind.Boolean,
      id: "q1",
      message: "Enable the feature?"
    }]);
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Boolean, value: false }
      }
    });
  });
  test("converts multi-select answer", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValues: ["a", "b"] } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ["a", "b"], freeformValues: void 0 }
      }
    });
  });
  test("converts multi-select answer with freeform", () => {
    const result = convertCarouselAnswers({ "q1": { selectedValues: ["a"], freeformValue: "extra" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.SelectedMany, value: ["a"], freeformValues: ["extra"] }
      }
    });
  });
  test("converts freeform-only answer", () => {
    const result = convertCarouselAnswers({ "q1": { freeformValue: "something" } });
    assert.deepStrictEqual(result, {
      "q1": {
        state: SessionInputAnswerState.Submitted,
        value: { kind: SessionInputAnswerValueKind.Text, value: "something" }
      }
    });
  });
  test("handles multiple questions", () => {
    const result = convertCarouselAnswers({
      "q1": "text",
      "q2": { selectedValue: "opt" },
      "q3": { selectedValues: ["a"] }
    });
    assert.strictEqual(Object.keys(result).length, 3);
    assert.strictEqual(result["q1"].state, SessionInputAnswerState.Submitted);
    assert.strictEqual(result["q2"].state, SessionInputAnswerState.Submitted);
    assert.strictEqual(result["q3"].state, SessionInputAnswerState.Submitted);
  });
  test("skips empty object answers", () => {
    const result = convertCarouselAnswers({ "q1": {} });
    assert.strictEqual(Object.keys(result).length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvY29udmVydENhcm91c2VsQW5zd2Vycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLCBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5cbnN1aXRlKCdjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIHN0cmluZyBhbnN3ZXIgdG8gdGV4dCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzogJ2hlbGxvJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3ExJzoge1xuXHRcdFx0XHRzdGF0ZTogU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdoZWxsbycgfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBzaW5nbGUtc2VsZWN0IGFuc3dlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzogeyBzZWxlY3RlZFZhbHVlOiAnb3B0LTEnIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdxMSc6IHtcblx0XHRcdFx0c3RhdGU6IFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0dmFsdWU6IHsga2luZDogU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJ29wdC0xJywgZnJlZWZvcm1WYWx1ZXM6IHVuZGVmaW5lZCB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIHNpbmdsZS1zZWxlY3QgYW5zd2VyIHdpdGggZnJlZWZvcm0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6IHsgc2VsZWN0ZWRWYWx1ZTogJ29wdC0xJywgZnJlZWZvcm1WYWx1ZTogJ2N1c3RvbScgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3ExJzoge1xuXHRcdFx0XHRzdGF0ZTogU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAnb3B0LTEnLCBmcmVlZm9ybVZhbHVlczogWydjdXN0b20nXSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGJvb2xlYW4gc2luZ2xlLXNlbGVjdCBhbnN3ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydENhcm91c2VsQW5zd2Vycyh7ICdxMSc6IHsgc2VsZWN0ZWRWYWx1ZTogJ2ZhbHNlJyB9IH0sIFt7XG5cdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuQm9vbGVhbixcblx0XHRcdGlkOiAncTEnLFxuXHRcdFx0bWVzc2FnZTogJ0VuYWJsZSB0aGUgZmVhdHVyZT8nLFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0J3ExJzoge1xuXHRcdFx0XHRzdGF0ZTogU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBTZXNzaW9uSW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbiwgdmFsdWU6IGZhbHNlIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgbXVsdGktc2VsZWN0IGFuc3dlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzogeyBzZWxlY3RlZFZhbHVlczogWydhJywgJ2InXSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncTEnOiB7XG5cdFx0XHRcdHN0YXRlOiBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IFNlc3Npb25JbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZE1hbnksIHZhbHVlOiBbJ2EnLCAnYiddLCBmcmVlZm9ybVZhbHVlczogdW5kZWZpbmVkIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgbXVsdGktc2VsZWN0IGFuc3dlciB3aXRoIGZyZWVmb3JtJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMoeyAncTEnOiB7IHNlbGVjdGVkVmFsdWVzOiBbJ2EnXSwgZnJlZWZvcm1WYWx1ZTogJ2V4dHJhJyB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHQncTEnOiB7XG5cdFx0XHRcdHN0YXRlOiBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IFNlc3Npb25JbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZE1hbnksIHZhbHVlOiBbJ2EnXSwgZnJlZWZvcm1WYWx1ZXM6IFsnZXh0cmEnXSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGZyZWVmb3JtLW9ubHkgYW5zd2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMoeyAncTEnOiB7IGZyZWVmb3JtVmFsdWU6ICdzb21ldGhpbmcnIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdCdxMSc6IHtcblx0XHRcdFx0c3RhdGU6IFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0dmFsdWU6IHsga2luZDogU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnc29tZXRoaW5nJyB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbXVsdGlwbGUgcXVlc3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRDYXJvdXNlbEFuc3dlcnMoe1xuXHRcdFx0J3ExJzogJ3RleHQnLFxuXHRcdFx0J3EyJzogeyBzZWxlY3RlZFZhbHVlOiAnb3B0JyB9LFxuXHRcdFx0J3EzJzogeyBzZWxlY3RlZFZhbHVlczogWydhJ10gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbJ3ExJ10uc3RhdGUsIFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsncTInXS5zdGF0ZSwgU2Vzc2lvbklucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WydxMyddLnN0YXRlLCBTZXNzaW9uSW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyBlbXB0eSBvYmplY3QgYW5zd2VycycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHsgJ3ExJzoge30gYXMgUmVjb3JkPHN0cmluZywgbmV2ZXI+IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZXN1bHQpLmxlbmd0aCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIseUJBQXlCLG1DQUFtQztBQUM1RixTQUFTLDhCQUE4QjtBQUV2QyxNQUFNLDBCQUEwQixNQUFNO0FBRXJDLDBDQUF3QztBQUV4QyxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFVBQU0sU0FBUyx1QkFBdUIsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN2RCxXQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDOUIsTUFBTTtBQUFBLFFBQ0wsT0FBTyx3QkFBd0I7QUFBQSxRQUMvQixPQUFPLEVBQUUsTUFBTSw0QkFBNEIsTUFBTSxPQUFPLFFBQVE7QUFBQSxNQUNqRTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsVUFBTSxTQUFTLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxlQUFlLFFBQVEsRUFBRSxDQUFDO0FBQzFFLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixNQUFNO0FBQUEsUUFDTCxPQUFPLHdCQUF3QjtBQUFBLFFBQy9CLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixVQUFVLE9BQU8sU0FBUyxnQkFBZ0IsT0FBVTtBQUFBLE1BQ2hHO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxVQUFNLFNBQVMsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLGVBQWUsU0FBUyxlQUFlLFNBQVMsRUFBRSxDQUFDO0FBQ25HLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixNQUFNO0FBQUEsUUFDTCxPQUFPLHdCQUF3QjtBQUFBLFFBQy9CLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixVQUFVLE9BQU8sU0FBUyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUU7QUFBQSxNQUNqRztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUNBQXlDLE1BQU07QUFDbkQsVUFBTSxTQUFTLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxlQUFlLFFBQVEsRUFBRSxHQUFHLENBQUM7QUFBQSxNQUM1RSxNQUFNLHNCQUFzQjtBQUFBLE1BQzVCLElBQUk7QUFBQSxNQUNKLFNBQVM7QUFBQSxJQUNWLENBQUMsQ0FBQztBQUNGLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QixNQUFNO0FBQUEsUUFDTCxPQUFPLHdCQUF3QjtBQUFBLFFBQy9CLE9BQU8sRUFBRSxNQUFNLDRCQUE0QixTQUFTLE9BQU8sTUFBTTtBQUFBLE1BQ2xFO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxVQUFNLFNBQVMsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLGdCQUFnQixDQUFDLEtBQUssR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUM5RSxXQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDOUIsTUFBTTtBQUFBLFFBQ0wsT0FBTyx3QkFBd0I7QUFBQSxRQUMvQixPQUFPLEVBQUUsTUFBTSw0QkFBNEIsY0FBYyxPQUFPLENBQUMsS0FBSyxHQUFHLEdBQUcsZ0JBQWdCLE9BQVU7QUFBQSxNQUN2RztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsVUFBTSxTQUFTLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLEdBQUcsZUFBZSxRQUFRLEVBQUUsQ0FBQztBQUNqRyxXQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDOUIsTUFBTTtBQUFBLFFBQ0wsT0FBTyx3QkFBd0I7QUFBQSxRQUMvQixPQUFPLEVBQUUsTUFBTSw0QkFBNEIsY0FBYyxPQUFPLENBQUMsR0FBRyxHQUFHLGdCQUFnQixDQUFDLE9BQU8sRUFBRTtBQUFBLE1BQ2xHO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxVQUFNLFNBQVMsdUJBQXVCLEVBQUUsTUFBTSxFQUFFLGVBQWUsWUFBWSxFQUFFLENBQUM7QUFDOUUsV0FBTyxnQkFBZ0IsUUFBUTtBQUFBLE1BQzlCLE1BQU07QUFBQSxRQUNMLE9BQU8sd0JBQXdCO0FBQUEsUUFDL0IsT0FBTyxFQUFFLE1BQU0sNEJBQTRCLE1BQU0sT0FBTyxZQUFZO0FBQUEsTUFDckU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFVBQU0sU0FBUyx1QkFBdUI7QUFBQSxNQUNyQyxNQUFNO0FBQUEsTUFDTixNQUFNLEVBQUUsZUFBZSxNQUFNO0FBQUEsTUFDN0IsTUFBTSxFQUFFLGdCQUFnQixDQUFDLEdBQUcsRUFBRTtBQUFBLElBQy9CLENBQUM7QUFDRCxXQUFPLFlBQVksT0FBTyxLQUFLLE1BQU0sRUFBRSxRQUFRLENBQUM7QUFDaEQsV0FBTyxZQUFZLE9BQU8sSUFBSSxFQUFFLE9BQU8sd0JBQXdCLFNBQVM7QUFDeEUsV0FBTyxZQUFZLE9BQU8sSUFBSSxFQUFFLE9BQU8sd0JBQXdCLFNBQVM7QUFDeEUsV0FBTyxZQUFZLE9BQU8sSUFBSSxFQUFFLE9BQU8sd0JBQXdCLFNBQVM7QUFBQSxFQUN6RSxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxVQUFNLFNBQVMsdUJBQXVCLEVBQUUsTUFBTSxDQUFDLEVBQTJCLENBQUM7QUFDM0UsV0FBTyxZQUFZLE9BQU8sS0FBSyxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDakQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
