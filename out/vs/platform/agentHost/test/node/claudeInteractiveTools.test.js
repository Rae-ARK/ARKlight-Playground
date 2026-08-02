import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConfirmationOptionKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ToolCallStatus } from "../../common/state/protocol/state.js";
import {
  buildAskUserSessionInputQuestions,
  buildExitPlanModeConfirmationState,
  flattenAskUserAnswers,
  parseAskUserQuestionInput
} from "../../node/claude/claudeInteractiveTools.js";
suite("claudeInteractiveTools", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("buildExitPlanModeConfirmationState", () => {
    test("renders the plan markdown body and Approve/Deny buttons", () => {
      const state = buildExitPlanModeConfirmationState({ plan: "# step 1" }, "tool_use_42");
      assert.deepStrictEqual(state, {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: "tool_use_42",
        toolName: "ExitPlanMode",
        displayName: "Ready to code?",
        invocationMessage: { markdown: "# step 1" },
        toolInput: '{"plan":"# step 1"}',
        confirmationTitle: "Ready to code?",
        options: [
          { id: "approve", label: "Approve", kind: ConfirmationOptionKind.Approve },
          { id: "deny", label: "Deny", kind: ConfirmationOptionKind.Deny }
        ]
      });
    });
    test("falls back to empty plan when input.plan is missing or wrong-typed", () => {
      const missing = buildExitPlanModeConfirmationState({}, "tool_use_1");
      const wrongType = buildExitPlanModeConfirmationState({ plan: 123 }, "tool_use_2");
      assert.deepStrictEqual(missing.invocationMessage, { markdown: "" });
      assert.deepStrictEqual(wrongType.invocationMessage, { markdown: "" });
    });
  });
  suite("parseAskUserQuestionInput", () => {
    test("returns undefined when questions is missing or empty", () => {
      assert.strictEqual(parseAskUserQuestionInput({}), void 0);
      assert.strictEqual(parseAskUserQuestionInput({ questions: [] }), void 0);
    });
    test("narrows non-empty questions array", () => {
      const parsed = parseAskUserQuestionInput({
        questions: [{ question: "Q?", header: "h", options: [] }]
      });
      assert.ok(parsed);
      assert.strictEqual(parsed.questions.length, 1);
    });
  });
  suite("buildAskUserSessionInputQuestions", () => {
    test("single-select question maps options 1:1 with header as id", () => {
      const askInput = {
        questions: [{
          question: "Pick one",
          header: "pick",
          options: [
            { label: "A", description: "first" },
            { label: "B" }
          ]
        }]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      assert.deepStrictEqual(result, [{
        id: "pick",
        kind: ChatInputQuestionKind.SingleSelect,
        title: "pick",
        message: "Pick one",
        options: [
          { id: "A", label: "A", description: "first" },
          { id: "B", label: "B" }
        ],
        allowFreeformInput: false
      }]);
    });
    test("multi-select flips question kind and honors allowFreeformInput", () => {
      const askInput = {
        questions: [{
          question: "Pick many",
          header: "pickMany",
          options: [{ label: "X" }],
          multiSelect: true,
          allowFreeformInput: true
        }]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      const question = result[0];
      assert.strictEqual(question.kind, ChatInputQuestionKind.MultiSelect);
      assert.strictEqual(question.kind === ChatInputQuestionKind.MultiSelect ? question.allowFreeformInput : void 0, true);
    });
    test("falls back to q-{idx} id when header is empty", () => {
      const askInput = {
        questions: [
          { question: "first", header: "", options: [] },
          { question: "second", header: "", options: [] }
        ]
      };
      const result = buildAskUserSessionInputQuestions(askInput);
      assert.strictEqual(result[0].id, "q-0");
      assert.strictEqual(result[1].id, "q-1");
    });
  });
  suite("flattenAskUserAnswers", () => {
    const askInput = {
      questions: [
        { question: "What is your name?", header: "name", options: [] },
        { question: "Pick one", header: "one", options: [{ label: "A" }, { label: "B" }] },
        { question: "Pick many", header: "many", options: [{ label: "X" }, { label: "Y" }] },
        { question: "Skipped one", header: "skipped", options: [] }
      ]
    };
    test("flattens text, single-select with freeform, multi-select with freeform; drops skipped", () => {
      const answers = flattenAskUserAnswers(askInput, {
        name: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" }
        },
        one: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: "A", freeformValues: ["extra"] }
        },
        many: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["X", "Y"], freeformValues: ["Z"] }
        },
        skipped: {
          state: ChatInputAnswerState.Skipped
        }
      });
      assert.deepStrictEqual(answers, {
        "What is your name?": "Ada",
        "Pick one": "A, extra",
        "Pick many": "X, Y, Z"
      });
    });
    test("returns empty object when every answer is skipped or missing", () => {
      const answers = flattenAskUserAnswers(askInput, {
        skipped: { state: ChatInputAnswerState.Skipped }
      });
      assert.deepStrictEqual(answers, {});
    });
    test("drops single-select answers with no value and no freeform", () => {
      const answers = flattenAskUserAnswers(askInput, {
        one: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Selected, value: "" }
        }
      });
      assert.deepStrictEqual(answers, {});
    });
    test("keys empty-header questions by positional q-{idx} id (round-trips with buildAskUserSessionInputQuestions)", () => {
      const blankHeaderInput = {
        questions: [
          { question: "first?", header: "", options: [] },
          { question: "second?", header: "named", options: [] }
        ]
      };
      const answers = flattenAskUserAnswers(blankHeaderInput, {
        "q-0": {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "one" }
        },
        named: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "two" }
        }
      });
      assert.deepStrictEqual(answers, {
        "first?": "one",
        "second?": "two"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlSW50ZXJhY3RpdmVUb29scy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb25maXJtYXRpb25PcHRpb25LaW5kLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIFRvb2xDYWxsU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkQXNrVXNlclNlc3Npb25JbnB1dFF1ZXN0aW9ucyxcblx0YnVpbGRFeGl0UGxhbk1vZGVDb25maXJtYXRpb25TdGF0ZSxcblx0ZmxhdHRlbkFza1VzZXJBbnN3ZXJzLFxuXHRwYXJzZUFza1VzZXJRdWVzdGlvbklucHV0LFxuXHR0eXBlIFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0LFxufSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVJbnRlcmFjdGl2ZVRvb2xzLmpzJztcblxuLyoqXG4gKiBQdXJlLXByb2plY3Rpb24gdGVzdHMgZm9yIFtjbGF1ZGVJbnRlcmFjdGl2ZVRvb2xzLnRzXSguLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVJbnRlcmFjdGl2ZVRvb2xzLnRzKS5cbiAqIFRoZSBhZ2VudCdzIGBfaGFuZGxlRXhpdFBsYW5Nb2RlYCBhbmQgYF9oYW5kbGVBc2tVc2VyUXVlc3Rpb25gIGFyZVxuICogNC1saW5lIG9yY2hlc3RyYXRvcnMgZGVsZWdhdGluZyBTREsgXHUyMTk0IHdvcmtiZW5jaCBwcm9qZWN0aW9ucyB0byB0aGVzZVxuICogaGVscGVyczsgdGVzdGluZyB0aGUgcHJvamVjdGlvbnMgZGlyZWN0bHkgYXZvaWRzIHRoZSBhZ2VudCBoYXJuZXNzLlxuICovXG5zdWl0ZSgnY2xhdWRlSW50ZXJhY3RpdmVUb29scycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnYnVpbGRFeGl0UGxhbk1vZGVDb25maXJtYXRpb25TdGF0ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgdGhlIHBsYW4gbWFya2Rvd24gYm9keSBhbmQgQXBwcm92ZS9EZW55IGJ1dHRvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGJ1aWxkRXhpdFBsYW5Nb2RlQ29uZmlybWF0aW9uU3RhdGUoeyBwbGFuOiAnIyBzdGVwIDEnIH0sICd0b29sX3VzZV80MicpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbENhbGxJZDogJ3Rvb2xfdXNlXzQyJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdFeGl0UGxhbk1vZGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1JlYWR5IHRvIGNvZGU/Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICcjIHN0ZXAgMScgfSxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicGxhblwiOlwiIyBzdGVwIDFcIn0nLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1JlYWR5IHRvIGNvZGU/Jyxcblx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdhcHByb3ZlJywgbGFiZWw6ICdBcHByb3ZlJywga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2RlbnknLCBsYWJlbDogJ0RlbnknLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkRlbnkgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBlbXB0eSBwbGFuIHdoZW4gaW5wdXQucGxhbiBpcyBtaXNzaW5nIG9yIHdyb25nLXR5cGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWlzc2luZyA9IGJ1aWxkRXhpdFBsYW5Nb2RlQ29uZmlybWF0aW9uU3RhdGUoe30sICd0b29sX3VzZV8xJyk7XG5cdFx0XHRjb25zdCB3cm9uZ1R5cGUgPSBidWlsZEV4aXRQbGFuTW9kZUNvbmZpcm1hdGlvblN0YXRlKHsgcGxhbjogMTIzIH0sICd0b29sX3VzZV8yJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlzc2luZy5pbnZvY2F0aW9uTWVzc2FnZSwgeyBtYXJrZG93bjogJycgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdyb25nVHlwZS5pbnZvY2F0aW9uTWVzc2FnZSwgeyBtYXJrZG93bjogJycgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUFza1VzZXJRdWVzdGlvbklucHV0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBxdWVzdGlvbnMgaXMgbWlzc2luZyBvciBlbXB0eScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUFza1VzZXJRdWVzdGlvbklucHV0KHt9KSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUFza1VzZXJRdWVzdGlvbklucHV0KHsgcXVlc3Rpb25zOiBbXSB9KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hcnJvd3Mgbm9uLWVtcHR5IHF1ZXN0aW9ucyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQXNrVXNlclF1ZXN0aW9uSW5wdXQoe1xuXHRcdFx0XHRxdWVzdGlvbnM6IFt7IHF1ZXN0aW9uOiAnUT8nLCBoZWFkZXI6ICdoJywgb3B0aW9uczogW10gfV0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhwYXJzZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5xdWVzdGlvbnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQXNrVXNlclNlc3Npb25JbnB1dFF1ZXN0aW9ucycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NpbmdsZS1zZWxlY3QgcXVlc3Rpb24gbWFwcyBvcHRpb25zIDE6MSB3aXRoIGhlYWRlciBhcyBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGFza0lucHV0OiBQYXJzZWRBc2tVc2VyUXVlc3Rpb25JbnB1dCA9IHtcblx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdHF1ZXN0aW9uOiAnUGljayBvbmUnLFxuXHRcdFx0XHRcdGhlYWRlcjogJ3BpY2snLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdBJywgZGVzY3JpcHRpb246ICdmaXJzdCcgfSxcblx0XHRcdFx0XHRcdHsgbGFiZWw6ICdCJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zKGFza0lucHV0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRcdGlkOiAncGljaycsXG5cdFx0XHRcdGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsXG5cdFx0XHRcdHRpdGxlOiAncGljaycsXG5cdFx0XHRcdG1lc3NhZ2U6ICdQaWNrIG9uZScsXG5cdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHR7IGlkOiAnQScsIGxhYmVsOiAnQScsIGRlc2NyaXB0aW9uOiAnZmlyc3QnIH0sXG5cdFx0XHRcdFx0eyBpZDogJ0InLCBsYWJlbDogJ0InIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1zZWxlY3QgZmxpcHMgcXVlc3Rpb24ga2luZCBhbmQgaG9ub3JzIGFsbG93RnJlZWZvcm1JbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGFza0lucHV0OiBQYXJzZWRBc2tVc2VyUXVlc3Rpb25JbnB1dCA9IHtcblx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdHF1ZXN0aW9uOiAnUGljayBtYW55Jyxcblx0XHRcdFx0XHRoZWFkZXI6ICdwaWNrTWFueScsXG5cdFx0XHRcdFx0b3B0aW9uczogW3sgbGFiZWw6ICdYJyB9XSxcblx0XHRcdFx0XHRtdWx0aVNlbGVjdDogdHJ1ZSxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHRydWUsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zKGFza0lucHV0KTtcblxuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSByZXN1bHRbMF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlc3Rpb24ua2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLk11bHRpU2VsZWN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVzdGlvbi5raW5kID09PSBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QgPyBxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgOiB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBxLXtpZHh9IGlkIHdoZW4gaGVhZGVyIGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYXNrSW5wdXQ6IFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0ID0ge1xuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IHF1ZXN0aW9uOiAnZmlyc3QnLCBoZWFkZXI6ICcnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XHRcdHsgcXVlc3Rpb246ICdzZWNvbmQnLCBoZWFkZXI6ICcnLCBvcHRpb25zOiBbXSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zKGFza0lucHV0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pZCwgJ3EtMCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS5pZCwgJ3EtMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmxhdHRlbkFza1VzZXJBbnN3ZXJzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYXNrSW5wdXQ6IFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0ID0ge1xuXHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdHsgcXVlc3Rpb246ICdXaGF0IGlzIHlvdXIgbmFtZT8nLCBoZWFkZXI6ICduYW1lJywgb3B0aW9uczogW10gfSxcblx0XHRcdFx0eyBxdWVzdGlvbjogJ1BpY2sgb25lJywgaGVhZGVyOiAnb25lJywgb3B0aW9uczogW3sgbGFiZWw6ICdBJyB9LCB7IGxhYmVsOiAnQicgfV0gfSxcblx0XHRcdFx0eyBxdWVzdGlvbjogJ1BpY2sgbWFueScsIGhlYWRlcjogJ21hbnknLCBvcHRpb25zOiBbeyBsYWJlbDogJ1gnIH0sIHsgbGFiZWw6ICdZJyB9XSB9LFxuXHRcdFx0XHR7IHF1ZXN0aW9uOiAnU2tpcHBlZCBvbmUnLCBoZWFkZXI6ICdza2lwcGVkJywgb3B0aW9uczogW10gfSxcblx0XHRcdF0sXG5cdFx0fTtcblxuXHRcdHRlc3QoJ2ZsYXR0ZW5zIHRleHQsIHNpbmdsZS1zZWxlY3Qgd2l0aCBmcmVlZm9ybSwgbXVsdGktc2VsZWN0IHdpdGggZnJlZWZvcm07IGRyb3BzIHNraXBwZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gZmxhdHRlbkFza1VzZXJBbnN3ZXJzKGFza0lucHV0LCB7XG5cdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ0FkYScgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0b25lOiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAnQScsIGZyZWVmb3JtVmFsdWVzOiBbJ2V4dHJhJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFueToge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkTWFueSwgdmFsdWU6IFsnWCcsICdZJ10sIGZyZWVmb3JtVmFsdWVzOiBbJ1onXSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lwcGVkOiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbnN3ZXJzLCB7XG5cdFx0XHRcdCdXaGF0IGlzIHlvdXIgbmFtZT8nOiAnQWRhJyxcblx0XHRcdFx0J1BpY2sgb25lJzogJ0EsIGV4dHJhJyxcblx0XHRcdFx0J1BpY2sgbWFueSc6ICdYLCBZLCBaJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBvYmplY3Qgd2hlbiBldmVyeSBhbnN3ZXIgaXMgc2tpcHBlZCBvciBtaXNzaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYW5zd2VycyA9IGZsYXR0ZW5Bc2tVc2VyQW5zd2Vycyhhc2tJbnB1dCwge1xuXHRcdFx0XHRza2lwcGVkOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkIH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbnN3ZXJzLCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBzaW5nbGUtc2VsZWN0IGFuc3dlcnMgd2l0aCBubyB2YWx1ZSBhbmQgbm8gZnJlZWZvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gZmxhdHRlbkFza1VzZXJBbnN3ZXJzKGFza0lucHV0LCB7XG5cdFx0XHRcdG9uZToge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJycgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFuc3dlcnMsIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tleXMgZW1wdHktaGVhZGVyIHF1ZXN0aW9ucyBieSBwb3NpdGlvbmFsIHEte2lkeH0gaWQgKHJvdW5kLXRyaXBzIHdpdGggYnVpbGRBc2tVc2VyU2Vzc2lvbklucHV0UXVlc3Rpb25zKScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJsYW5rSGVhZGVySW5wdXQ6IFBhcnNlZEFza1VzZXJRdWVzdGlvbklucHV0ID0ge1xuXHRcdFx0XHRxdWVzdGlvbnM6IFtcblx0XHRcdFx0XHR7IHF1ZXN0aW9uOiAnZmlyc3Q/JywgaGVhZGVyOiAnJywgb3B0aW9uczogW10gfSxcblx0XHRcdFx0XHR7IHF1ZXN0aW9uOiAnc2Vjb25kPycsIGhlYWRlcjogJ25hbWVkJywgb3B0aW9uczogW10gfSxcblx0XHRcdFx0XSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gZmxhdHRlbkFza1VzZXJBbnN3ZXJzKGJsYW5rSGVhZGVySW5wdXQsIHtcblx0XHRcdFx0J3EtMCc6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ29uZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bmFtZWQ6IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ3R3bycgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFuc3dlcnMsIHtcblx0XHRcdFx0J2ZpcnN0Pyc6ICdvbmUnLFxuXHRcdFx0XHQnc2Vjb25kPyc6ICd0d28nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0Isc0JBQXNCLDBCQUEwQix1QkFBdUIsc0JBQXNCO0FBQzlIO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFRUCxNQUFNLDBCQUEwQixNQUFNO0FBRXJDLDBDQUF3QztBQUV4QyxRQUFNLHNDQUFzQyxNQUFNO0FBRWpELFNBQUssMkRBQTJELE1BQU07QUFDckUsWUFBTSxRQUFRLG1DQUFtQyxFQUFFLE1BQU0sV0FBVyxHQUFHLGFBQWE7QUFFcEYsYUFBTyxnQkFBZ0IsT0FBTztBQUFBLFFBQzdCLFFBQVEsZUFBZTtBQUFBLFFBQ3ZCLFlBQVk7QUFBQSxRQUNaLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxRQUNiLG1CQUFtQixFQUFFLFVBQVUsV0FBVztBQUFBLFFBQzFDLFdBQVc7QUFBQSxRQUNYLG1CQUFtQjtBQUFBLFFBQ25CLFNBQVM7QUFBQSxVQUNSLEVBQUUsSUFBSSxXQUFXLE9BQU8sV0FBVyxNQUFNLHVCQUF1QixRQUFRO0FBQUEsVUFDeEUsRUFBRSxJQUFJLFFBQVEsT0FBTyxRQUFRLE1BQU0sdUJBQXVCLEtBQUs7QUFBQSxRQUNoRTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssc0VBQXNFLE1BQU07QUFDaEYsWUFBTSxVQUFVLG1DQUFtQyxDQUFDLEdBQUcsWUFBWTtBQUNuRSxZQUFNLFlBQVksbUNBQW1DLEVBQUUsTUFBTSxJQUFJLEdBQUcsWUFBWTtBQUVoRixhQUFPLGdCQUFnQixRQUFRLG1CQUFtQixFQUFFLFVBQVUsR0FBRyxDQUFDO0FBQ2xFLGFBQU8sZ0JBQWdCLFVBQVUsbUJBQW1CLEVBQUUsVUFBVSxH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
