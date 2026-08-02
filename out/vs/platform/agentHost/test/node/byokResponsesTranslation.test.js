import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  bridgeResultToResponsesBody,
  bridgeResultToResponsesSseFrames,
  responsesRequestToBridge,
  ResponsesTranslationError
} from "../../node/copilot/byokResponsesTranslation.js";
suite("byokResponsesTranslation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps ordered Responses input, tools, continuation, reasoning and options", () => {
    const body = {
      model: "gpt-5",
      instructions: "be helpful",
      previous_response_id: "resp_previous",
      reasoning: { effort: "high" },
      temperature: 0.5,
      top_p: 0.9,
      max_output_tokens: 256,
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "hello" }] },
        { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "considered it" }], encrypted_content: "encrypted" },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "checking" }] },
        { type: "function_call", call_id: "call_1", name: "getWeather", arguments: '{"city":"NYC"}' },
        { type: "function_call_output", call_id: "call_1", output: "sunny" },
        { type: "custom_tool_call", call_id: "call_2", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", call_id: "call_2", output: "Done!" }
      ],
      tools: [
        { type: "function", name: "getWeather", description: "weather", parameters: { type: "object" } },
        { type: "custom", name: "apply_patch", description: "patch files" }
      ]
    };
    assert.deepStrictEqual(responsesRequestToBridge("acme", body), {
      vendor: "acme",
      modelId: "gpt-5",
      instructions: "be helpful",
      input: [
        { type: "message", role: "user", content: [{ type: "text", text: "hello" }] },
        { type: "reasoning", id: "rs_1", summary: ["considered it"], encryptedContent: "encrypted" },
        { type: "message", role: "assistant", content: [{ type: "text", text: "checking" }] },
        { type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "function_call_output", callId: "call_1", output: "sunny" },
        { type: "custom_tool_call", callId: "call_2", name: "apply_patch", input: "*** Begin Patch" },
        { type: "custom_tool_call_output", callId: "call_2", output: "Done!" }
      ],
      tools: [
        { type: "function", name: "getWeather", description: "weather", parametersSchema: { type: "object" } },
        { type: "custom", name: "apply_patch", description: "patch files" }
      ],
      previousResponseId: "resp_previous",
      reasoningEffort: "high",
      modelOptions: { temperature: 0.5, top_p: 0.9, max_tokens: 256 }
    });
  });
  test("maps string input to a user message", () => {
    assert.deepStrictEqual(responsesRequestToBridge("acme", { model: "m", input: "hello" }).input, [
      { type: "message", role: "user", content: [{ type: "text", text: "hello" }] }
    ]);
  });
  test("rejects missing models and unsupported input items", () => {
    assert.throws(() => responsesRequestToBridge("acme", { input: [] }), ResponsesTranslationError);
    assert.throws(() => responsesRequestToBridge("acme", {
      model: "m",
      input: [{ type: "computer_call" }]
    }), /Unsupported input\[0\]/);
  });
  test("emits ordered Responses SSE for reasoning, text and tool calls", () => {
    const result = {
      responseId: "resp_provider",
      output: [
        { type: "reasoning", id: "rs_1", summary: ["first", "second"], encryptedContent: "encrypted" },
        { type: "message", content: [{ type: "text", text: "hello" }] },
        { type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "custom_tool_call", callId: "call_2", name: "apply_patch", input: "patch" }
      ],
      usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 }
    };
    const events = bridgeResultToResponsesSseFrames(result, "gpt-5").map((frame) => {
      const lines = frame.trim().split("\n");
      return {
        event: lines[0].slice("event: ".length),
        data: JSON.parse(lines[1].slice("data: ".length))
      };
    });
    const completed = events.at(-1)?.data.response;
    assert.deepStrictEqual({
      eventTypes: events.map((event) => event.event),
      addedStatuses: events.filter((event) => event.event === "response.output_item.added").map((event) => event.data.item.status),
      responseId: completed.id,
      outputTypes: completed.output.map((item) => item.type),
      usage: completed.usage
    }, {
      eventTypes: [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.reasoning_summary_part.added",
        "response.reasoning_summary_text.delta",
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.reasoning_summary_part.added",
        "response.reasoning_summary_text.delta",
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.output_item.added",
        "response.custom_tool_call_input.delta",
        "response.custom_tool_call_input.done",
        "response.output_item.done",
        "response.completed"
      ],
      addedStatuses: ["in_progress", "in_progress", "in_progress", "in_progress"],
      responseId: "resp_provider",
      outputTypes: ["reasoning", "message", "function_call", "custom_tool_call"],
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 2 },
        total_tokens: 15
      }
    });
  });
  test("encodes a completed non-streaming Responses body", () => {
    const body = JSON.parse(bridgeResultToResponsesBody({
      responseId: "resp_provider",
      output: [
        { type: "reasoning", id: "thinking_1", summary: ["thought"], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig"}' },
        { type: "message", content: [{ type: "text", text: "answer" }] }
      ],
      usage: { inputTokens: 3, outputTokens: 2, reasoningTokens: 1 }
    }, "gpt-5"));
    assert.deepStrictEqual(body, {
      id: "resp_provider",
      object: "response",
      created_at: body["created_at"],
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      model: "gpt-5",
      output: body.output,
      output_text: "answer",
      parallel_tool_calls: true,
      temperature: 1,
      tool_choice: "auto",
      tools: [],
      top_p: 1,
      usage: {
        input_tokens: 3,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 2,
        output_tokens_details: { reasoning_tokens: 1 },
        total_tokens: 5
      }
    });
    assert.deepStrictEqual(body.output.map((item) => item.type), ["reasoning", "message"]);
    assert.match(body.output[0].id, /^rs_byok_/);
    assert.strictEqual(body.output[0].encrypted_content, 'vscode-reasoning-metadata:{"signature":"sig"}');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYnlva1Jlc3BvbnNlc1RyYW5zbGF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ5b2tMbUNoYXRSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7XG5cdGJyaWRnZVJlc3VsdFRvUmVzcG9uc2VzQm9keSxcblx0YnJpZGdlUmVzdWx0VG9SZXNwb25zZXNTc2VGcmFtZXMsXG5cdElSZXNwb25zZXNSZXF1ZXN0LFxuXHRyZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UsXG5cdFJlc3BvbnNlc1RyYW5zbGF0aW9uRXJyb3IsXG59IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9ieW9rUmVzcG9uc2VzVHJhbnNsYXRpb24uanMnO1xuXG5zdWl0ZSgnYnlva1Jlc3BvbnNlc1RyYW5zbGF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hcHMgb3JkZXJlZCBSZXNwb25zZXMgaW5wdXQsIHRvb2xzLCBjb250aW51YXRpb24sIHJlYXNvbmluZyBhbmQgb3B0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBib2R5OiBJUmVzcG9uc2VzUmVxdWVzdCA9IHtcblx0XHRcdG1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiAnYmUgaGVscGZ1bCcsXG5cdFx0XHRwcmV2aW91c19yZXNwb25zZV9pZDogJ3Jlc3BfcHJldmlvdXMnLFxuXHRcdFx0cmVhc29uaW5nOiB7IGVmZm9ydDogJ2hpZ2gnIH0sXG5cdFx0XHR0ZW1wZXJhdHVyZTogMC41LFxuXHRcdFx0dG9wX3A6IDAuOSxcblx0XHRcdG1heF9vdXRwdXRfdG9rZW5zOiAyNTYsXG5cdFx0XHRpbnB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAnaW5wdXRfdGV4dCcsIHRleHQ6ICdoZWxsbycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogW3sgdHlwZTogJ3N1bW1hcnlfdGV4dCcsIHRleHQ6ICdjb25zaWRlcmVkIGl0JyB9XSwgZW5jcnlwdGVkX2NvbnRlbnQ6ICdlbmNyeXB0ZWQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ291dHB1dF90ZXh0JywgdGV4dDogJ2NoZWNraW5nJyB9XSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbl9jYWxsJywgY2FsbF9pZDogJ2NhbGxfMScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzOiAne1wiY2l0eVwiOlwiTllDXCJ9JyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbl9jYWxsX291dHB1dCcsIGNhbGxfaWQ6ICdjYWxsXzEnLCBvdXRwdXQ6ICdzdW5ueScgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsIGNhbGxfaWQ6ICdjYWxsXzInLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBpbnB1dDogJyoqKiBCZWdpbiBQYXRjaCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnLCBjYWxsX2lkOiAnY2FsbF8yJywgb3V0cHV0OiAnRG9uZSEnIH0sXG5cdFx0XHRdLFxuXHRcdFx0dG9vbHM6IFtcblx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb24nLCBuYW1lOiAnZ2V0V2VhdGhlcicsIGRlc2NyaXB0aW9uOiAnd2VhdGhlcicsIHBhcmFtZXRlcnM6IHsgdHlwZTogJ29iamVjdCcgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjdXN0b20nLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBkZXNjcmlwdGlvbjogJ3BhdGNoIGZpbGVzJyB9LFxuXHRcdFx0XSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UoJ2FjbWUnLCBib2R5KSwge1xuXHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRtb2RlbElkOiAnZ3B0LTUnLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiAnYmUgaGVscGZ1bCcsXG5cdFx0XHRpbnB1dDogW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWydjb25zaWRlcmVkIGl0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICdlbmNyeXB0ZWQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnY2hlY2tpbmcnIH1dIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICdjYWxsXzEnLCBuYW1lOiAnZ2V0V2VhdGhlcicsIGFyZ3VtZW50c0pzb246ICd7XCJjaXR5XCI6XCJOWUNcIn0nIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0JywgY2FsbElkOiAnY2FsbF8xJywgb3V0cHV0OiAnc3VubnknIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLCBjYWxsSWQ6ICdjYWxsXzInLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBpbnB1dDogJyoqKiBCZWdpbiBQYXRjaCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnLCBjYWxsSWQ6ICdjYWxsXzInLCBvdXRwdXQ6ICdEb25lIScgfSxcblx0XHRcdF0sXG5cdFx0XHR0b29sczogW1xuXHRcdFx0XHR7IHR5cGU6ICdmdW5jdGlvbicsIG5hbWU6ICdnZXRXZWF0aGVyJywgZGVzY3JpcHRpb246ICd3ZWF0aGVyJywgcGFyYW1ldGVyc1NjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2N1c3RvbScsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGRlc2NyaXB0aW9uOiAncGF0Y2ggZmlsZXMnIH0sXG5cdFx0XHRdLFxuXHRcdFx0cHJldmlvdXNSZXNwb25zZUlkOiAncmVzcF9wcmV2aW91cycsXG5cdFx0XHRyZWFzb25pbmdFZmZvcnQ6ICdoaWdoJyxcblx0XHRcdG1vZGVsT3B0aW9uczogeyB0ZW1wZXJhdHVyZTogMC41LCB0b3BfcDogMC45LCBtYXhfdG9rZW5zOiAyNTYgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBzdHJpbmcgaW5wdXQgdG8gYSB1c2VyIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UoJ2FjbWUnLCB7IG1vZGVsOiAnbScsIGlucHV0OiAnaGVsbG8nIH0pLmlucHV0LCBbXG5cdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbycgfV0gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBtaXNzaW5nIG1vZGVscyBhbmQgdW5zdXBwb3J0ZWQgaW5wdXQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiByZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UoJ2FjbWUnLCB7IGlucHV0OiBbXSB9KSwgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcik7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiByZXNwb25zZXNSZXF1ZXN0VG9CcmlkZ2UoJ2FjbWUnLCB7XG5cdFx0XHRtb2RlbDogJ20nLFxuXHRcdFx0aW5wdXQ6IFt7IHR5cGU6ICdjb21wdXRlcl9jYWxsJyB9XSxcblx0XHR9KSwgL1Vuc3VwcG9ydGVkIGlucHV0XFxbMFxcXS8pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBvcmRlcmVkIFJlc3BvbnNlcyBTU0UgZm9yIHJlYXNvbmluZywgdGV4dCBhbmQgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQ6IElCeW9rTG1DaGF0UmVzdWx0ID0ge1xuXHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfcHJvdmlkZXInLFxuXHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAncnNfMScsIHN1bW1hcnk6IFsnZmlyc3QnLCAnc2Vjb25kJ10sIGVuY3J5cHRlZENvbnRlbnQ6ICdlbmNyeXB0ZWQnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbycgfV0gfSxcblx0XHRcdFx0eyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIGNhbGxJZDogJ2NhbGxfMScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsIGNhbGxJZDogJ2NhbGxfMicsIG5hbWU6ICdhcHBseV9wYXRjaCcsIGlucHV0OiAncGF0Y2gnIH0sXG5cdFx0XHRdLFxuXHRcdFx0dXNhZ2U6IHsgaW5wdXRUb2tlbnM6IDEwLCBvdXRwdXRUb2tlbnM6IDUsIHJlYXNvbmluZ1Rva2VuczogMiB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBldmVudHMgPSBicmlkZ2VSZXN1bHRUb1Jlc3BvbnNlc1NzZUZyYW1lcyhyZXN1bHQsICdncHQtNScpLm1hcChmcmFtZSA9PiB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IGZyYW1lLnRyaW0oKS5zcGxpdCgnXFxuJyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRldmVudDogbGluZXNbMF0uc2xpY2UoJ2V2ZW50OiAnLmxlbmd0aCksXG5cdFx0XHRcdGRhdGE6IEpTT04ucGFyc2UobGluZXNbMV0uc2xpY2UoJ2RhdGE6ICcubGVuZ3RoKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IGV2ZW50cy5hdCgtMSk/LmRhdGEucmVzcG9uc2UgYXMgeyBpZDogc3RyaW5nOyBvdXRwdXQ6IEFycmF5PHsgdHlwZTogc3RyaW5nIH0+OyB1c2FnZTogdW5rbm93biB9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudFR5cGVzOiBldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50LmV2ZW50KSxcblx0XHRcdGFkZGVkU3RhdHVzZXM6IGV2ZW50c1xuXHRcdFx0XHQuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LmV2ZW50ID09PSAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnKVxuXHRcdFx0XHQubWFwKGV2ZW50ID0+IChldmVudC5kYXRhLml0ZW0gYXMgeyBzdGF0dXM6IHN0cmluZyB9KS5zdGF0dXMpLFxuXHRcdFx0cmVzcG9uc2VJZDogY29tcGxldGVkLmlkLFxuXHRcdFx0b3V0cHV0VHlwZXM6IGNvbXBsZXRlZC5vdXRwdXQubWFwKGl0ZW0gPT4gaXRlbS50eXBlKSxcblx0XHRcdHVzYWdlOiBjb21wbGV0ZWQudXNhZ2UsXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRUeXBlczogW1xuXHRcdFx0XHQncmVzcG9uc2UuY3JlYXRlZCcsXG5cdFx0XHRcdCdyZXNwb25zZS5pbl9wcm9ncmVzcycsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcsXG5cdFx0XHRcdCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV9wYXJ0LmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3RleHQuZGVsdGEnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuZG9uZScsXG5cdFx0XHRcdCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV9wYXJ0LmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3RleHQuZGVsdGEnLFxuXHRcdFx0XHQncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuZG9uZScsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfaXRlbS5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5hZGRlZCcsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfdGV4dC5kZWx0YScsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfdGV4dC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2Uub3V0cHV0X2l0ZW0uYWRkZWQnLFxuXHRcdFx0XHQncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZGVsdGEnLFxuXHRcdFx0XHQncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZG9uZScsXG5cdFx0XHRcdCdyZXNwb25zZS5vdXRwdXRfaXRlbS5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmFkZGVkJyxcblx0XHRcdFx0J3Jlc3BvbnNlLmN1c3RvbV90b29sX2NhbGxfaW5wdXQuZGVsdGEnLFxuXHRcdFx0XHQncmVzcG9uc2UuY3VzdG9tX3Rvb2xfY2FsbF9pbnB1dC5kb25lJyxcblx0XHRcdFx0J3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLFxuXHRcdFx0XHQncmVzcG9uc2UuY29tcGxldGVkJyxcblx0XHRcdF0sXG5cdFx0XHRhZGRlZFN0YXR1c2VzOiBbJ2luX3Byb2dyZXNzJywgJ2luX3Byb2dyZXNzJywgJ2luX3Byb2dyZXNzJywgJ2luX3Byb2dyZXNzJ10sXG5cdFx0XHRyZXNwb25zZUlkOiAncmVzcF9wcm92aWRlcicsXG5cdFx0XHRvdXRwdXRUeXBlczogWydyZWFzb25pbmcnLCAnbWVzc2FnZScsICdmdW5jdGlvbl9jYWxsJywgJ2N1c3RvbV90b29sX2NhbGwnXSxcblx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdGlucHV0X3Rva2VuczogMTAsXG5cdFx0XHRcdGlucHV0X3Rva2Vuc19kZXRhaWxzOiB7IGNhY2hlZF90b2tlbnM6IDAgfSxcblx0XHRcdFx0b3V0cHV0X3Rva2VuczogNSxcblx0XHRcdFx0b3V0cHV0X3Rva2Vuc19kZXRhaWxzOiB7IHJlYXNvbmluZ190b2tlbnM6IDIgfSxcblx0XHRcdFx0dG90YWxfdG9rZW5zOiAxNSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuY29kZXMgYSBjb21wbGV0ZWQgbm9uLXN0cmVhbWluZyBSZXNwb25zZXMgYm9keScsICgpID0+IHtcblx0XHRjb25zdCBib2R5ID0gSlNPTi5wYXJzZShicmlkZ2VSZXN1bHRUb1Jlc3BvbnNlc0JvZHkoe1xuXHRcdFx0cmVzcG9uc2VJZDogJ3Jlc3BfcHJvdmlkZXInLFxuXHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAndGhpbmtpbmdfMScsIHN1bW1hcnk6IFsndGhvdWdodCddLCBlbmNyeXB0ZWRDb250ZW50OiAndnNjb2RlLXJlYXNvbmluZy1tZXRhZGF0YTp7XCJzaWduYXR1cmVcIjpcInNpZ1wifScgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2Fuc3dlcicgfV0gfSxcblx0XHRcdF0sXG5cdFx0XHR1c2FnZTogeyBpbnB1dFRva2VuczogMywgb3V0cHV0VG9rZW5zOiAyLCByZWFzb25pbmdUb2tlbnM6IDEgfSxcblx0XHR9LCAnZ3B0LTUnKSkgYXMge1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdGNyZWF0ZWRfYXQ6IG51bWJlcjtcblx0XHRcdHN0YXR1czogc3RyaW5nO1xuXHRcdFx0b3V0cHV0OiBBcnJheTx7IGlkOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgZW5jcnlwdGVkX2NvbnRlbnQ/OiBzdHJpbmcgfCBudWxsIH0+O1xuXHRcdFx0b3V0cHV0X3RleHQ6IHN0cmluZztcblx0XHRcdHVzYWdlOiB1bmtub3duO1xuXHRcdH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJvZHksIHtcblx0XHRcdGlkOiAncmVzcF9wcm92aWRlcicsXG5cdFx0XHRvYmplY3Q6ICdyZXNwb25zZScsXG5cdFx0XHRjcmVhdGVkX2F0OiBib2R5WydjcmVhdGVkX2F0J10sXG5cdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRpbmNvbXBsZXRlX2RldGFpbHM6IG51bGwsXG5cdFx0XHRpbnN0cnVjdGlvbnM6IG51bGwsXG5cdFx0XHRtb2RlbDogJ2dwdC01Jyxcblx0XHRcdG91dHB1dDogYm9keS5vdXRwdXQsXG5cdFx0XHRvdXRwdXRfdGV4dDogJ2Fuc3dlcicsXG5cdFx0XHRwYXJhbGxlbF90b29sX2NhbGxzOiB0cnVlLFxuXHRcdFx0dGVtcGVyYXR1cmU6IDEsXG5cdFx0XHR0b29sX2Nob2ljZTogJ2F1dG8nLFxuXHRcdFx0dG9vbHM6IFtdLFxuXHRcdFx0dG9wX3A6IDEsXG5cdFx0XHR1c2FnZToge1xuXHRcdFx0XHRpbnB1dF90b2tlbnM6IDMsXG5cdFx0XHRcdGlucHV0X3Rva2Vuc19kZXRhaWxzOiB7IGNhY2hlZF90b2tlbnM6IDAgfSxcblx0XHRcdFx0b3V0cHV0X3Rva2VuczogMixcblx0XHRcdFx0b3V0cHV0X3Rva2Vuc19kZXRhaWxzOiB7IHJlYXNvbmluZ190b2tlbnM6IDEgfSxcblx0XHRcdFx0dG90YWxfdG9rZW5zOiA1LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJvZHkub3V0cHV0Lm1hcChpdGVtID0+IGl0ZW0udHlwZSksIFsncmVhc29uaW5nJywgJ21lc3NhZ2UnXSk7XG5cdFx0YXNzZXJ0Lm1hdGNoKGJvZHkub3V0cHV0WzBdLmlkLCAvXnJzX2J5b2tfLyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkub3V0cHV0WzBdLmVuY3J5cHRlZF9jb250ZW50LCAndnNjb2RlLXJlYXNvbmluZy1tZXRhZGF0YTp7XCJzaWduYXR1cmVcIjpcInNpZ1wifScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NB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
