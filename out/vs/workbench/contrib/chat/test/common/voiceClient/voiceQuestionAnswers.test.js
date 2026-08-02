import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { resolveQuestionAnswers } from "../../../common/voiceClient/voiceQuestionAnswers.js";
suite("VoiceQuestionAnswers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const single = {
    id: "q_single",
    type: "singleSelect",
    title: "Which region?",
    required: true,
    options: [
      { id: "o1", label: "West US", value: "westus" },
      { id: "o2", label: "East US", value: "eastus" }
    ]
  };
  const multi = {
    id: "q_multi",
    type: "multiSelect",
    title: "Which features?",
    allowFreeformInput: true,
    options: [
      { id: "o1", label: "Auth", value: "auth" },
      { id: "o2", label: "Search", value: "search" },
      { id: "o3", label: "Billing", value: "billing" }
    ]
  };
  const text = { id: "q_text", type: "text", title: "Anything else?" };
  suite("resolveQuestionAnswers", () => {
    test("accepts freeform when the question omits allowFreeformInput", () => {
      const { allowFreeformInput, ...omitted } = multi;
      assert.deepStrictEqual(
        resolveQuestionAnswers([omitted], [{ question_id: "q_multi", values: ["auth"], freeform: "telemetry" }]),
        { q_multi: { selectedValues: ["auth"], freeformValue: "telemetry" } }
      );
    });
    test("refuses a freeform value the form would reject on submit", () => {
      const validated = { ...text, validation: { minLength: 5 } };
      assert.strictEqual(
        resolveQuestionAnswers([validated], [{ question_id: "q_text", freeform: "no" }]),
        void 0
      );
      assert.deepStrictEqual(
        resolveQuestionAnswers([validated], [{ question_id: "q_text", freeform: "long enough" }]),
        { q_text: "long enough" }
      );
    });
    test("maps an exact single-select value", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "eastus" }]),
        { q_single: { selectedValue: "eastus" } }
      );
    });
    test("maps exact multi-select values with freeform", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [multi],
          [{ question_id: "q_multi", values: ["billing", "auth"], freeform: "telemetry" }]
        ),
        { q_multi: { selectedValues: ["billing", "auth"], freeformValue: "telemetry" } }
      );
    });
    test("maps a text answer", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", freeform: "ship it" }]),
        { q_text: "ship it" }
      );
    });
    test("maps a freeform fallback on a select", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [{ ...single, allowFreeformInput: true }],
          [{ question_id: "q_single", freeform: "Central US" }]
        ),
        { q_single: { freeformValue: "Central US" } }
      );
    });
    test("maps several questions at once", () => {
      assert.deepStrictEqual(
        resolveQuestionAnswers(
          [single, text],
          [
            { question_id: "q_single", value: "westus" },
            { question_id: "q_text", freeform: "no" }
          ]
        ),
        { q_single: { selectedValue: "westus" }, q_text: "no" }
      );
    });
    test("rejects a value that is a label rather than an option value", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "West US" }]),
        void 0
      );
    });
    test("rejects a value that is an option id rather than an option value", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", value: "o1" }]),
        void 0
      );
    });
    test("rejects an unknown question id", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "nope", value: "westus" }]),
        void 0
      );
    });
    test("rejects the whole set when one multi-select value is unknown", () => {
      assert.strictEqual(
        resolveQuestionAnswers([multi], [{ question_id: "q_multi", values: ["auth", "nope"] }]),
        void 0
      );
    });
    test("rejects freeform on a question that forbids it", () => {
      assert.strictEqual(
        resolveQuestionAnswers(
          [{ ...single, allowFreeformInput: false }],
          [{ question_id: "q_single", freeform: "Central US" }]
        ),
        void 0
      );
    });
    test("rejects an empty answer list", () => {
      assert.strictEqual(resolveQuestionAnswers([single], []), void 0);
    });
    test("rejects an answer that carries nothing", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single" }]),
        void 0
      );
    });
    test("rejects whitespace-only freeform on a text question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", freeform: "   " }]),
        void 0
      );
    });
    test("rejects a selection on a text question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([text], [{ question_id: "q_text", value: "anything" }]),
        void 0
      );
    });
    test("rejects a multi-select shape on a single-select question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([single], [{ question_id: "q_single", values: ["westus"] }]),
        void 0
      );
    });
    test("rejects a single-select shape on a multi-select question", () => {
      assert.strictEqual(
        resolveQuestionAnswers([multi], [{ question_id: "q_multi", value: "auth" }]),
        void 0
      );
    });
    test("rejects two answers to the same question", () => {
      assert.strictEqual(
        resolveQuestionAnswers(
          [single],
          [
            { question_id: "q_single", value: "westus" },
            { question_id: "q_single", value: "eastus" }
          ]
        ),
        void 0
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vdm9pY2VDbGllbnQvdm9pY2VRdWVzdGlvbkFuc3dlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRRdWVzdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlUXVlc3Rpb25BbnN3ZXJzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlUXVlc3Rpb25BbnN3ZXJzLmpzJztcblxuc3VpdGUoJ1ZvaWNlUXVlc3Rpb25BbnN3ZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzaW5nbGU6IElDaGF0UXVlc3Rpb24gPSB7XG5cdFx0aWQ6ICdxX3NpbmdsZScsXG5cdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0dGl0bGU6ICdXaGljaCByZWdpb24/Jyxcblx0XHRyZXF1aXJlZDogdHJ1ZSxcblx0XHRvcHRpb25zOiBbXG5cdFx0XHR7IGlkOiAnbzEnLCBsYWJlbDogJ1dlc3QgVVMnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdHsgaWQ6ICdvMicsIGxhYmVsOiAnRWFzdCBVUycsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdF0sXG5cdH07XG5cblx0Y29uc3QgbXVsdGk6IElDaGF0UXVlc3Rpb24gPSB7XG5cdFx0aWQ6ICdxX211bHRpJyxcblx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdHRpdGxlOiAnV2hpY2ggZmVhdHVyZXM/Jyxcblx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHRydWUsXG5cdFx0b3B0aW9uczogW1xuXHRcdFx0eyBpZDogJ28xJywgbGFiZWw6ICdBdXRoJywgdmFsdWU6ICdhdXRoJyB9LFxuXHRcdFx0eyBpZDogJ28yJywgbGFiZWw6ICdTZWFyY2gnLCB2YWx1ZTogJ3NlYXJjaCcgfSxcblx0XHRcdHsgaWQ6ICdvMycsIGxhYmVsOiAnQmlsbGluZycsIHZhbHVlOiAnYmlsbGluZycgfSxcblx0XHRdLFxuXHR9O1xuXG5cdGNvbnN0IHRleHQ6IElDaGF0UXVlc3Rpb24gPSB7IGlkOiAncV90ZXh0JywgdHlwZTogJ3RleHQnLCB0aXRsZTogJ0FueXRoaW5nIGVsc2U/JyB9O1xuXG5cdHN1aXRlKCdyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FjY2VwdHMgZnJlZWZvcm0gd2hlbiB0aGUgcXVlc3Rpb24gb21pdHMgYWxsb3dGcmVlZm9ybUlucHV0JywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIHdpZGdldCBhbmQgdGhlIHBlbmRpbmcgcGF5bG9hZCBib3RoIHJlYWQgYW4gb21pdHRlZCBmbGFnIGFzXG5cdFx0XHQvLyBlbmFibGVkLCBzbyByZWplY3RpbmcgaGVyZSB3b3VsZCByZWZ1c2UgYW4gYW5zd2VyIHRoZSB1c2VyIHdhc1xuXHRcdFx0Ly8gaW52aXRlZCB0byBnaXZlLlxuXHRcdFx0Y29uc3QgeyBhbGxvd0ZyZWVmb3JtSW5wdXQsIC4uLm9taXR0ZWQgfSA9IG11bHRpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbb21pdHRlZF0sIFt7IHF1ZXN0aW9uX2lkOiAncV9tdWx0aScsIHZhbHVlczogWydhdXRoJ10sIGZyZWVmb3JtOiAndGVsZW1ldHJ5JyB9XSksXG5cdFx0XHRcdHsgcV9tdWx0aTogeyBzZWxlY3RlZFZhbHVlczogWydhdXRoJ10sIGZyZWVmb3JtVmFsdWU6ICd0ZWxlbWV0cnknIH0gfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWZ1c2VzIGEgZnJlZWZvcm0gdmFsdWUgdGhlIGZvcm0gd291bGQgcmVqZWN0IG9uIHN1Ym1pdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbGlkYXRlZCA9IHsgLi4udGV4dCwgdmFsaWRhdGlvbjogeyBtaW5MZW5ndGg6IDUgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFt2YWxpZGF0ZWRdLCBbeyBxdWVzdGlvbl9pZDogJ3FfdGV4dCcsIGZyZWVmb3JtOiAnbm8nIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3ZhbGlkYXRlZF0sIFt7IHF1ZXN0aW9uX2lkOiAncV90ZXh0JywgZnJlZWZvcm06ICdsb25nIGVub3VnaCcgfV0pLFxuXHRcdFx0XHR7IHFfdGV4dDogJ2xvbmcgZW5vdWdoJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHMgYW4gZXhhY3Qgc2luZ2xlLXNlbGVjdCB2YWx1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3NpbmdsZV0sIFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ2Vhc3R1cycgfV0pLFxuXHRcdFx0XHR7IHFfc2luZ2xlOiB7IHNlbGVjdGVkVmFsdWU6ICdlYXN0dXMnIH0gfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIGV4YWN0IG11bHRpLXNlbGVjdCB2YWx1ZXMgd2l0aCBmcmVlZm9ybScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoXG5cdFx0XHRcdFx0W211bHRpXSxcblx0XHRcdFx0XHRbeyBxdWVzdGlvbl9pZDogJ3FfbXVsdGknLCB2YWx1ZXM6IFsnYmlsbGluZycsICdhdXRoJ10sIGZyZWVmb3JtOiAndGVsZW1ldHJ5JyB9XSxcblx0XHRcdFx0KSxcblx0XHRcdFx0eyBxX211bHRpOiB7IHNlbGVjdGVkVmFsdWVzOiBbJ2JpbGxpbmcnLCAnYXV0aCddLCBmcmVlZm9ybVZhbHVlOiAndGVsZW1ldHJ5JyB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcyBhIHRleHQgYW5zd2VyJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyhbdGV4dF0sIFt7IHF1ZXN0aW9uX2lkOiAncV90ZXh0JywgZnJlZWZvcm06ICdzaGlwIGl0JyB9XSksXG5cdFx0XHRcdHsgcV90ZXh0OiAnc2hpcCBpdCcgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIGEgZnJlZWZvcm0gZmFsbGJhY2sgb24gYSBzZWxlY3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFxuXHRcdFx0XHRcdFt7IC4uLnNpbmdsZSwgYWxsb3dGcmVlZm9ybUlucHV0OiB0cnVlIH1dLFxuXHRcdFx0XHRcdFt7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCBmcmVlZm9ybTogJ0NlbnRyYWwgVVMnIH1dLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHR7IHFfc2luZ2xlOiB7IGZyZWVmb3JtVmFsdWU6ICdDZW50cmFsIFVTJyB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcyBzZXZlcmFsIHF1ZXN0aW9ucyBhdCBvbmNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhcblx0XHRcdFx0XHRbc2luZ2xlLCB0ZXh0XSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdFx0XHRcdHsgcXVlc3Rpb25faWQ6ICdxX3RleHQnLCBmcmVlZm9ybTogJ25vJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdCksXG5cdFx0XHRcdHsgcV9zaW5nbGU6IHsgc2VsZWN0ZWRWYWx1ZTogJ3dlc3R1cycgfSwgcV90ZXh0OiAnbm8nIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQSB2YWx1ZSBvdXRzaWRlIHRoZSBzY2hlbWEgbWVhbnMgdGhlIGJhY2tlbmQgcmVzb2x2ZWQgYWdhaW5zdCBhIHN0YWxlXG5cdFx0Ly8gbWlycm9yLCBzbyBvbmUgYmFkIGVudHJ5IHJlamVjdHMgdGhlIHdob2xlIHNldCByYXRoZXIgdGhhbiBndWVzc2luZy5cblx0XHR0ZXN0KCdyZWplY3RzIGEgdmFsdWUgdGhhdCBpcyBhIGxhYmVsIHJhdGhlciB0aGFuIGFuIG9wdGlvbiB2YWx1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW3sgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScsIHZhbHVlOiAnV2VzdCBVUycgfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBhIHZhbHVlIHRoYXQgaXMgYW4gb3B0aW9uIGlkIHJhdGhlciB0aGFuIGFuIG9wdGlvbiB2YWx1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW3sgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScsIHZhbHVlOiAnbzEnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYW4gdW5rbm93biBxdWVzdGlvbiBpZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW3sgcXVlc3Rpb25faWQ6ICdub3BlJywgdmFsdWU6ICd3ZXN0dXMnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdGhlIHdob2xlIHNldCB3aGVuIG9uZSBtdWx0aS1zZWxlY3QgdmFsdWUgaXMgdW5rbm93bicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2VycyhbbXVsdGldLCBbeyBxdWVzdGlvbl9pZDogJ3FfbXVsdGknLCB2YWx1ZXM6IFsnYXV0aCcsICdub3BlJ10gfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmcmVlZm9ybSBvbiBhIHF1ZXN0aW9uIHRoYXQgZm9yYmlkcyBpdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhcblx0XHRcdFx0XHRbeyAuLi5zaW5nbGUsIGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UgfV0sXG5cdFx0XHRcdFx0W3sgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScsIGZyZWVmb3JtOiAnQ2VudHJhbCBVUycgfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBhbiBlbXB0eSBhbnN3ZXIgbGlzdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFtzaW5nbGVdLCBbXSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGFuIGFuc3dlciB0aGF0IGNhcnJpZXMgbm90aGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhbc2luZ2xlXSwgW3sgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScgfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB3aGl0ZXNwYWNlLW9ubHkgZnJlZWZvcm0gb24gYSB0ZXh0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFt0ZXh0XSwgW3sgcXVlc3Rpb25faWQ6ICdxX3RleHQnLCBmcmVlZm9ybTogJyAgICcgfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBhIHNlbGVjdGlvbiBvbiBhIHRleHQgcXVlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc29sdmVRdWVzdGlvbkFuc3dlcnMoW3RleHRdLCBbeyBxdWVzdGlvbl9pZDogJ3FfdGV4dCcsIHZhbHVlOiAnYW55dGhpbmcnIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSBtdWx0aS1zZWxlY3Qgc2hhcGUgb24gYSBzaW5nbGUtc2VsZWN0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFtzaW5nbGVdLCBbeyBxdWVzdGlvbl9pZDogJ3Ffc2luZ2xlJywgdmFsdWVzOiBbJ3dlc3R1cyddIH1dKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSBzaW5nbGUtc2VsZWN0IHNoYXBlIG9uIGEgbXVsdGktc2VsZWN0IHF1ZXN0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNvbHZlUXVlc3Rpb25BbnN3ZXJzKFttdWx0aV0sIFt7IHF1ZXN0aW9uX2lkOiAncV9tdWx0aScsIHZhbHVlOiAnYXV0aCcgfV0pLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB0d28gYW5zd2VycyB0byB0aGUgc2FtZSBxdWVzdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVzb2x2ZVF1ZXN0aW9uQW5zd2Vycyhcblx0XHRcdFx0XHRbc2luZ2xlXSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHF1ZXN0aW9uX2lkOiAncV9zaW5nbGUnLCB2YWx1ZTogJ3dlc3R1cycgfSxcblx0XHRcdFx0XHRcdHsgcXVlc3Rpb25faWQ6ICdxX3NpbmdsZScsIHZhbHVlOiAnZWFzdHVzJyB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdCksXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQywwQ0FBd0M7QUFFeEMsUUFBTSxTQUF3QjtBQUFBLElBQzdCLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLFVBQVU7QUFBQSxJQUNWLFNBQVM7QUFBQSxNQUNSLEVBQUUsSUFBSSxNQUFNLE9BQU8sV0FBVyxPQUFPLFNBQVM7QUFBQSxNQUM5QyxFQUFFLElBQUksTUFBTSxPQUFPLFdBQVcsT0FBTyxTQUFTO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBRUEsUUFBTSxRQUF1QjtBQUFBLElBQzVCLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxJQUNQLG9CQUFvQjtBQUFBLElBQ3BCLFNBQVM7QUFBQSxNQUNSLEVBQUUsSUFBSSxNQUFNLE9BQU8sUUFBUSxPQUFPLE9BQU87QUFBQSxNQUN6QyxFQUFFLElBQUksTUFBTSxPQUFPLFVBQVUsT0FBTyxTQUFTO0FBQUEsTUFDN0MsRUFBRSxJQUFJLE1BQU0sT0FBTyxXQUFXLE9BQU8sVUFBVTtBQUFBLElBQ2hEO0FBQUEsRUFDRDtBQUVBLFFBQU0sT0FBc0IsRUFBRSxJQUFJLFVBQVUsTUFBTSxRQUFRLE9BQU8saUJBQWlCO0FBRWxGLFFBQU0sMEJBQTBCLE1BQU07QUFDckMsU0FBSywrREFBK0QsTUFBTTtBQUl6RSxZQUFNLEVBQUUsb0JBQW9CLEdBQUcsUUFBUSxJQUFJO0FBQzNDLGFBQU87QUFBQSxRQUNOLHVCQUF1QixDQUFDLE9BQU8sR0FBRyxDQUFDLEVBQUUsYUFBYSxXQUFXLFFBQVEsQ0FBQyxNQUFNLEdBQUcsVUFBVSxZQUFZLENB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
