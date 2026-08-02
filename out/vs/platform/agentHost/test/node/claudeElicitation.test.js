import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind } from "../../common/state/sessionState.js";
import { buildElicitationRequest, cancelledElicitationResult, elicitationResultFromAnswers } from "../../node/claude/claudeElicitation.js";
import { handleElicitation } from "../../node/claude/claudeElicitationBridge.js";
suite("claudeElicitation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const formRequest = {
    serverName: "srv",
    message: "Please configure",
    mode: "form",
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
  const urlRequest = {
    serverName: "srv",
    message: "Authorize",
    mode: "url",
    url: "https://example.com/auth",
    elicitationId: "e1"
  };
  test("buildElicitationRequest (form) projects every primitive field kind", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-1", formRequest), {
      id: "req-1",
      message: "Please configure",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "name", title: "Name", message: "Your name", required: true, format: void 0, min: 1, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Integer, id: "count", title: "Count", message: "Count", required: true, min: 0, max: 9, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Boolean, id: "enabled", title: "Enabled", message: "Enabled", required: false, defaultValue: true },
        { kind: ChatInputQuestionKind.SingleSelect, id: "color", title: "Color", message: "Color", required: false, allowFreeformInput: false, options: [{ id: "red", label: "Red" }, { id: "green", label: "Green" }] },
        { kind: ChatInputQuestionKind.SingleSelect, id: "size", title: "Size", message: "Size", required: false, allowFreeformInput: false, options: [{ id: "s", label: "Small" }, { id: "l", label: "Large" }] },
        { kind: ChatInputQuestionKind.MultiSelect, id: "tags", title: "Tags", message: "Tags", required: false, allowFreeformInput: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], min: void 0, max: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (url) surfaces the url with no questions", () => {
    assert.deepStrictEqual(buildElicitationRequest("req-2", urlRequest), {
      id: "req-2",
      message: "Authorize",
      url: "https://example.com/auth"
    });
  });
  test("buildElicitationRequest degrades a malformed schema to a message-only request", () => {
    const malformed = {
      serverName: "srv",
      message: "Broken",
      mode: "form",
      requestedSchema: { type: "object", properties: "not-an-object" }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-3", malformed), { id: "req-3", message: "Broken" });
  });
  test("buildElicitationRequest drops a field that fails validation but keeps valid siblings", () => {
    const mixed = {
      serverName: "srv",
      message: "Mixed",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          // `enum` must be a string array — a bare string is malformed and would
          // otherwise reach `.map` and throw. It is dropped by validation.
          broken: { type: "string", title: "Broken", enum: "red" },
          ok: { type: "string", title: "Ok" }
        }
      }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-4", mixed), {
      id: "req-4",
      message: "Mixed",
      questions: [
        { kind: ChatInputQuestionKind.Text, id: "ok", title: "Ok", message: "Ok", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 }
      ]
    });
  });
  test("buildElicitationRequest (form) projects the remaining field variants", () => {
    const variants = {
      serverName: "srv",
      message: "Variants",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          ratio: { type: "number", title: "Ratio", minimum: 0, maximum: 1, default: 0.5 },
          langs: { type: "array", title: "Langs", items: { anyOf: [{ const: "ts", title: "TypeScript" }, { const: "go", title: "Go" }] }, minItems: 1, maxItems: 2 },
          plain: { type: "string", title: "Plain", enum: ["a", "b"] },
          email: { type: "string", title: "Email", description: "Your email", format: "email", maxLength: 50, default: "x@y.z" },
          mystery: { type: "widget", title: "Mystery" },
          freeText: { title: "Free" }
        }
      }
    };
    assert.deepStrictEqual(buildElicitationRequest("req-5", variants), {
      id: "req-5",
      message: "Variants",
      questions: [
        { kind: ChatInputQuestionKind.Number, id: "ratio", title: "Ratio", message: "Ratio", required: false, min: 0, max: 1, defaultValue: 0.5 },
        { kind: ChatInputQuestionKind.MultiSelect, id: "langs", title: "Langs", message: "Langs", required: false, allowFreeformInput: false, options: [{ id: "ts", label: "TypeScript" }, { id: "go", label: "Go" }], min: 1, max: 2 },
        { kind: ChatInputQuestionKind.SingleSelect, id: "plain", title: "Plain", message: "Plain", required: false, allowFreeformInput: false, options: [{ id: "a", label: "a" }, { id: "b", label: "b" }] },
        { kind: ChatInputQuestionKind.Text, id: "email", title: "Email", message: "Your email", required: false, format: "email", min: void 0, max: 50, defaultValue: "x@y.z" },
        { kind: ChatInputQuestionKind.Text, id: "mystery", title: "Mystery", message: "Mystery", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 },
        { kind: ChatInputQuestionKind.Text, id: "freeText", title: "Free", message: "Free", required: false, format: void 0, min: void 0, max: void 0, defaultValue: void 0 }
      ]
    });
  });
  test("buildElicitationRequest degrades every empty/broken form to a message-only request", () => {
    const cases = {
      // `url` mode without a url field
      urlNoUrl: buildElicitationRequest("a", { serverName: "srv", message: "NoUrl", mode: "url" }),
      // `form` mode with no requestedSchema at all
      formNoSchema: buildElicitationRequest("b", { serverName: "srv", message: "NoSchema", mode: "form" }),
      // `form` mode with an empty properties object
      formEmptyProps: buildElicitationRequest("c", { serverName: "srv", message: "Empty", mode: "form", requestedSchema: { type: "object", properties: {} } }),
      // `form` mode where every field fails validation and is dropped
      formAllInvalid: buildElicitationRequest("d", { serverName: "srv", message: "AllBad", mode: "form", requestedSchema: { type: "object", properties: { a: { type: "string", enum: 123 }, b: { minimum: "nope" } } } })
    };
    assert.deepStrictEqual(cases, {
      urlNoUrl: { id: "a", message: "NoUrl" },
      formNoSchema: { id: "b", message: "NoSchema" },
      formEmptyProps: { id: "c", message: "Empty" },
      formAllInvalid: { id: "d", message: "AllBad" }
    });
  });
  test("elicitationResultFromAnswers maps decline/cancel/accept", () => {
    const accepted = {
      name: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "Ada" } },
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Number, value: 3 } },
      enabled: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Boolean, value: false } },
      color: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "red" } },
      tags: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.SelectedMany, value: ["a", "b"] } },
      size: { state: ChatInputAnswerState.Skipped }
    };
    assert.deepStrictEqual({
      decline: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Decline, void 0),
      cancel: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Cancel, void 0),
      accept: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, accepted)
    }, {
      decline: { action: "decline" },
      cancel: { action: "cancel" },
      accept: { action: "accept", content: { name: "Ada", count: 3, enabled: false, color: "red", tags: ["a", "b"] } }
    });
  });
  test("elicitationResultFromAnswers (url accept) carries no content", () => {
    assert.deepStrictEqual(
      elicitationResultFromAnswers(urlRequest, ChatInputResponseKind.Accept, void 0),
      { action: "accept" }
    );
  });
  test("elicitationResultFromAnswers accept edge cases: broken form omits content, empty answers yield empty content", () => {
    const brokenForm = { serverName: "srv", message: "x", mode: "form", requestedSchema: { properties: "nope" } };
    assert.deepStrictEqual({
      // Accepting a form whose schema can't be parsed → no content object.
      brokenAccept: elicitationResultFromAnswers(brokenForm, ChatInputResponseKind.Accept, void 0),
      // Accepting a valid form with no answers → an empty content object.
      emptyAnswers: elicitationResultFromAnswers(formRequest, ChatInputResponseKind.Accept, void 0)
    }, {
      brokenAccept: { action: "accept" },
      emptyAnswers: { action: "accept", content: {} }
    });
  });
  test("elicitationResultFromAnswers coerces text answers to the field schema type", () => {
    const request = {
      serverName: "srv",
      message: "Coerce",
      mode: "form",
      requestedSchema: {
        type: "object",
        properties: {
          count: { type: "integer" },
          ratio: { type: "number" },
          flag: { type: "boolean" },
          pick: { type: "string", enum: ["a", "b"] },
          bad: { type: "integer" }
        }
      }
    };
    const answers = {
      count: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "3" } },
      ratio: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "0.5" } },
      flag: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "false" } },
      pick: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Selected, value: "a" } },
      bad: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "not-a-number" } }
    };
    assert.deepStrictEqual(
      elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
      { action: "accept", content: { count: 3, ratio: 0.5, flag: false, pick: "a" } }
    );
  });
  test("elicitationResultFromAnswers is safe against prototype-polluting field names", () => {
    const properties = JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"string"},"ok":{"type":"string"}}');
    const request = { serverName: "srv", message: "x", mode: "form", requestedSchema: { type: "object", properties } };
    const answers = { ok: { state: ChatInputAnswerState.Submitted, value: { kind: ChatInputAnswerValueKind.Text, value: "yes" } } };
    assert.deepStrictEqual(
      elicitationResultFromAnswers(request, ChatInputResponseKind.Accept, answers),
      { action: "accept", content: { ok: "yes" } }
    );
  });
  test("cancelledElicitationResult is a plain cancel", () => {
    assert.deepStrictEqual(cancelledElicitationResult(), { action: "cancel" });
  });
  test("handleElicitation cancels when the session lookup misses", async () => {
    const result = await handleElicitation(
      { getSession: () => void 0 },
      "missing-session",
      { serverName: "srv", message: "q", mode: "form", requestedSchema: { type: "object", properties: { side: { type: "string" } } } },
      { signal: new AbortController().signal }
    );
    assert.deepStrictEqual(result, { action: "cancel" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlRWxpY2l0YXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgRWxpY2l0YXRpb25SZXF1ZXN0IH0gZnJvbSAnQGFudGhyb3BpYy1haS9jbGF1ZGUtYWdlbnQtc2RrJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIHR5cGUgQ2hhdElucHV0QW5zd2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCwgY2FuY2VsbGVkRWxpY2l0YXRpb25SZXN1bHQsIGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVFbGljaXRhdGlvbi5qcyc7XG5pbXBvcnQgeyBoYW5kbGVFbGljaXRhdGlvbiB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUVsaWNpdGF0aW9uQnJpZGdlLmpzJztcblxuc3VpdGUoJ2NsYXVkZUVsaWNpdGF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGZvcm1SZXF1ZXN0OiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0c2VydmVyTmFtZTogJ3NydicsXG5cdFx0bWVzc2FnZTogJ1BsZWFzZSBjb25maWd1cmUnLFxuXHRcdG1vZGU6ICdmb3JtJyxcblx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsnbmFtZScsICdjb3VudCddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ05hbWUnLCBkZXNjcmlwdGlvbjogJ1lvdXIgbmFtZScsIG1pbkxlbmd0aDogMSB9LFxuXHRcdFx0XHRjb3VudDogeyB0eXBlOiAnaW50ZWdlcicsIHRpdGxlOiAnQ291bnQnLCBtaW5pbXVtOiAwLCBtYXhpbXVtOiA5IH0sXG5cdFx0XHRcdGVuYWJsZWQ6IHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ0VuYWJsZWQnLCBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdGNvbG9yOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0NvbG9yJywgZW51bTogWydyZWQnLCAnZ3JlZW4nXSwgZW51bU5hbWVzOiBbJ1JlZCcsICdHcmVlbiddIH0sXG5cdFx0XHRcdHNpemU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2l6ZScsIG9uZU9mOiBbeyBjb25zdDogJ3MnLCB0aXRsZTogJ1NtYWxsJyB9LCB7IGNvbnN0OiAnbCcsIHRpdGxlOiAnTGFyZ2UnIH1dIH0sXG5cdFx0XHRcdHRhZ3M6IHsgdHlwZTogJ2FycmF5JywgdGl0bGU6ICdUYWdzJywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnYScsICdiJ10gfSB9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IHVybFJlcXVlc3Q6IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHtcblx0XHRzZXJ2ZXJOYW1lOiAnc3J2Jyxcblx0XHRtZXNzYWdlOiAnQXV0aG9yaXplJyxcblx0XHRtb2RlOiAndXJsJyxcblx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2F1dGgnLFxuXHRcdGVsaWNpdGF0aW9uSWQ6ICdlMScsXG5cdH07XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgKGZvcm0pIHByb2plY3RzIGV2ZXJ5IHByaW1pdGl2ZSBmaWVsZCBraW5kJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ3JlcS0xJywgZm9ybVJlcXVlc3QpLCB7XG5cdFx0XHRpZDogJ3JlcS0xJyxcblx0XHRcdG1lc3NhZ2U6ICdQbGVhc2UgY29uZmlndXJlJyxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ25hbWUnLCB0aXRsZTogJ05hbWUnLCBtZXNzYWdlOiAnWW91ciBuYW1lJywgcmVxdWlyZWQ6IHRydWUsIGZvcm1hdDogdW5kZWZpbmVkLCBtaW46IDEsIG1heDogdW5kZWZpbmVkLCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5JbnRlZ2VyLCBpZDogJ2NvdW50JywgdGl0bGU6ICdDb3VudCcsIG1lc3NhZ2U6ICdDb3VudCcsIHJlcXVpcmVkOiB0cnVlLCBtaW46IDAsIG1heDogOSwgZGVmYXVsdFZhbHVlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuQm9vbGVhbiwgaWQ6ICdlbmFibGVkJywgdGl0bGU6ICdFbmFibGVkJywgbWVzc2FnZTogJ0VuYWJsZWQnLCByZXF1aXJlZDogZmFsc2UsIGRlZmF1bHRWYWx1ZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsIGlkOiAnY29sb3InLCB0aXRsZTogJ0NvbG9yJywgbWVzc2FnZTogJ0NvbG9yJywgcmVxdWlyZWQ6IGZhbHNlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLCBvcHRpb25zOiBbeyBpZDogJ3JlZCcsIGxhYmVsOiAnUmVkJyB9LCB7IGlkOiAnZ3JlZW4nLCBsYWJlbDogJ0dyZWVuJyB9XSB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsIGlkOiAnc2l6ZScsIHRpdGxlOiAnU2l6ZScsIG1lc3NhZ2U6ICdTaXplJywgcmVxdWlyZWQ6IGZhbHNlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLCBvcHRpb25zOiBbeyBpZDogJ3MnLCBsYWJlbDogJ1NtYWxsJyB9LCB7IGlkOiAnbCcsIGxhYmVsOiAnTGFyZ2UnIH1dIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLk11bHRpU2VsZWN0LCBpZDogJ3RhZ3MnLCB0aXRsZTogJ1RhZ3MnLCBtZXNzYWdlOiAnVGFncycsIHJlcXVpcmVkOiBmYWxzZSwgYWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdhJywgbGFiZWw6ICdhJyB9LCB7IGlkOiAnYicsIGxhYmVsOiAnYicgfV0sIG1pbjogdW5kZWZpbmVkLCBtYXg6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgKHVybCkgc3VyZmFjZXMgdGhlIHVybCB3aXRoIG5vIHF1ZXN0aW9ucycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkRWxpY2l0YXRpb25SZXF1ZXN0KCdyZXEtMicsIHVybFJlcXVlc3QpLCB7XG5cdFx0XHRpZDogJ3JlcS0yJyxcblx0XHRcdG1lc3NhZ2U6ICdBdXRob3JpemUnLFxuXHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRoJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgZGVncmFkZXMgYSBtYWxmb3JtZWQgc2NoZW1hIHRvIGEgbWVzc2FnZS1vbmx5IHJlcXVlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFsZm9ybWVkOiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiAnc3J2Jyxcblx0XHRcdG1lc3NhZ2U6ICdCcm9rZW4nLFxuXHRcdFx0bW9kZTogJ2Zvcm0nLFxuXHRcdFx0cmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiAnbm90LWFuLW9iamVjdCcgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9LFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgncmVxLTMnLCBtYWxmb3JtZWQpLCB7IGlkOiAncmVxLTMnLCBtZXNzYWdlOiAnQnJva2VuJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgZHJvcHMgYSBmaWVsZCB0aGF0IGZhaWxzIHZhbGlkYXRpb24gYnV0IGtlZXBzIHZhbGlkIHNpYmxpbmdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1peGVkOiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiAnc3J2Jyxcblx0XHRcdG1lc3NhZ2U6ICdNaXhlZCcsXG5cdFx0XHRtb2RlOiAnZm9ybScsXG5cdFx0XHRyZXF1ZXN0ZWRTY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQvLyBgZW51bWAgbXVzdCBiZSBhIHN0cmluZyBhcnJheSBcdTIwMTQgYSBiYXJlIHN0cmluZyBpcyBtYWxmb3JtZWQgYW5kIHdvdWxkXG5cdFx0XHRcdFx0Ly8gb3RoZXJ3aXNlIHJlYWNoIGAubWFwYCBhbmQgdGhyb3cuIEl0IGlzIGRyb3BwZWQgYnkgdmFsaWRhdGlvbi5cblx0XHRcdFx0XHRicm9rZW46IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJva2VuJywgZW51bTogJ3JlZCcgfSxcblx0XHRcdFx0XHRvazogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdPaycgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkRWxpY2l0YXRpb25SZXF1ZXN0KCdyZXEtNCcsIG1peGVkKSwge1xuXHRcdFx0aWQ6ICdyZXEtNCcsXG5cdFx0XHRtZXNzYWdlOiAnTWl4ZWQnLFxuXHRcdFx0cXVlc3Rpb25zOiBbXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAnb2snLCB0aXRsZTogJ09rJywgbWVzc2FnZTogJ09rJywgcmVxdWlyZWQ6IGZhbHNlLCBmb3JtYXQ6IHVuZGVmaW5lZCwgbWluOiB1bmRlZmluZWQsIG1heDogdW5kZWZpbmVkLCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRFbGljaXRhdGlvblJlcXVlc3QgKGZvcm0pIHByb2plY3RzIHRoZSByZW1haW5pbmcgZmllbGQgdmFyaWFudHMnLCAoKSA9PiB7XG5cdFx0Ly8gQ29tcGxlbWVudHMgdGhlIGNhbm9uaWNhbCBmaXh0dXJlIGFib3ZlOiBudW1iZXIgKG5vbi1pbnRlZ2VyKSwgdGl0bGVkXG5cdFx0Ly8gbXVsdGktc2VsZWN0IChgaXRlbXMuYW55T2ZgICsgbWluL21heEl0ZW1zKSwgcGxhaW4gZW51bSAobm8gZW51bU5hbWVzKSxcblx0XHQvLyByaWNoIHRleHQgKGZvcm1hdC9tYXhMZW5ndGgvc3RyaW5nIGRlZmF1bHQpLCBhbiB1bmtub3duIGB0eXBlYCwgYW5kIGFcblx0XHQvLyBtaXNzaW5nIGB0eXBlYCBcdTIwMTQgdGhlIGxhc3QgdHdvIGZhbGwgYmFjayB0byBhIHBsYWluIHRleHQgZmllbGQuXG5cdFx0Y29uc3QgdmFyaWFudHM6IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHtcblx0XHRcdHNlcnZlck5hbWU6ICdzcnYnLFxuXHRcdFx0bWVzc2FnZTogJ1ZhcmlhbnRzJyxcblx0XHRcdG1vZGU6ICdmb3JtJyxcblx0XHRcdHJlcXVlc3RlZFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHJhdGlvOiB7IHR5cGU6ICdudW1iZXInLCB0aXRsZTogJ1JhdGlvJywgbWluaW11bTogMCwgbWF4aW11bTogMSwgZGVmYXVsdDogMC41IH0sXG5cdFx0XHRcdFx0bGFuZ3M6IHsgdHlwZTogJ2FycmF5JywgdGl0bGU6ICdMYW5ncycsIGl0ZW1zOiB7IGFueU9mOiBbeyBjb25zdDogJ3RzJywgdGl0bGU6ICdUeXBlU2NyaXB0JyB9LCB7IGNvbnN0OiAnZ28nLCB0aXRsZTogJ0dvJyB9XSB9LCBtaW5JdGVtczogMSwgbWF4SXRlbXM6IDIgfSxcblx0XHRcdFx0XHRwbGFpbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdQbGFpbicsIGVudW06IFsnYScsICdiJ10gfSxcblx0XHRcdFx0XHRlbWFpbDogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdFbWFpbCcsIGRlc2NyaXB0aW9uOiAnWW91ciBlbWFpbCcsIGZvcm1hdDogJ2VtYWlsJywgbWF4TGVuZ3RoOiA1MCwgZGVmYXVsdDogJ3hAeS56JyB9LFxuXHRcdFx0XHRcdG15c3Rlcnk6IHsgdHlwZTogJ3dpZGdldCcsIHRpdGxlOiAnTXlzdGVyeScgfSxcblx0XHRcdFx0XHRmcmVlVGV4dDogeyB0aXRsZTogJ0ZyZWUnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgncmVxLTUnLCB2YXJpYW50cyksIHtcblx0XHRcdGlkOiAncmVxLTUnLFxuXHRcdFx0bWVzc2FnZTogJ1ZhcmlhbnRzJyxcblx0XHRcdHF1ZXN0aW9uczogW1xuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5OdW1iZXIsIGlkOiAncmF0aW8nLCB0aXRsZTogJ1JhdGlvJywgbWVzc2FnZTogJ1JhdGlvJywgcmVxdWlyZWQ6IGZhbHNlLCBtaW46IDAsIG1heDogMSwgZGVmYXVsdFZhbHVlOiAwLjUgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QsIGlkOiAnbGFuZ3MnLCB0aXRsZTogJ0xhbmdzJywgbWVzc2FnZTogJ0xhbmdzJywgcmVxdWlyZWQ6IGZhbHNlLCBhbGxvd0ZyZWVmb3JtSW5wdXQ6IGZhbHNlLCBvcHRpb25zOiBbeyBpZDogJ3RzJywgbGFiZWw6ICdUeXBlU2NyaXB0JyB9LCB7IGlkOiAnZ28nLCBsYWJlbDogJ0dvJyB9XSwgbWluOiAxLCBtYXg6IDIgfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LCBpZDogJ3BsYWluJywgdGl0bGU6ICdQbGFpbicsIG1lc3NhZ2U6ICdQbGFpbicsIHJlcXVpcmVkOiBmYWxzZSwgYWxsb3dGcmVlZm9ybUlucHV0OiBmYWxzZSwgb3B0aW9uczogW3sgaWQ6ICdhJywgbGFiZWw6ICdhJyB9LCB7IGlkOiAnYicsIGxhYmVsOiAnYicgfV0gfSxcblx0XHRcdFx0eyBraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuVGV4dCwgaWQ6ICdlbWFpbCcsIHRpdGxlOiAnRW1haWwnLCBtZXNzYWdlOiAnWW91ciBlbWFpbCcsIHJlcXVpcmVkOiBmYWxzZSwgZm9ybWF0OiAnZW1haWwnLCBtaW46IHVuZGVmaW5lZCwgbWF4OiA1MCwgZGVmYXVsdFZhbHVlOiAneEB5LnonIH0sXG5cdFx0XHRcdHsga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsIGlkOiAnbXlzdGVyeScsIHRpdGxlOiAnTXlzdGVyeScsIG1lc3NhZ2U6ICdNeXN0ZXJ5JywgcmVxdWlyZWQ6IGZhbHNlLCBmb3JtYXQ6IHVuZGVmaW5lZCwgbWluOiB1bmRlZmluZWQsIG1heDogdW5kZWZpbmVkLCBkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LCBpZDogJ2ZyZWVUZXh0JywgdGl0bGU6ICdGcmVlJywgbWVzc2FnZTogJ0ZyZWUnLCByZXF1aXJlZDogZmFsc2UsIGZvcm1hdDogdW5kZWZpbmVkLCBtaW46IHVuZGVmaW5lZCwgbWF4OiB1bmRlZmluZWQsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCBkZWdyYWRlcyBldmVyeSBlbXB0eS9icm9rZW4gZm9ybSB0byBhIG1lc3NhZ2Utb25seSByZXF1ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzID0ge1xuXHRcdFx0Ly8gYHVybGAgbW9kZSB3aXRob3V0IGEgdXJsIGZpZWxkXG5cdFx0XHR1cmxOb1VybDogYnVpbGRFbGljaXRhdGlvblJlcXVlc3QoJ2EnLCB7IHNlcnZlck5hbWU6ICdzcnYnLCBtZXNzYWdlOiAnTm9VcmwnLCBtb2RlOiAndXJsJyB9KSxcblx0XHRcdC8vIGBmb3JtYCBtb2RlIHdpdGggbm8gcmVxdWVzdGVkU2NoZW1hIGF0IGFsbFxuXHRcdFx0Zm9ybU5vU2NoZW1hOiBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgnYicsIHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdOb1NjaGVtYScsIG1vZGU6ICdmb3JtJyB9KSxcblx0XHRcdC8vIGBmb3JtYCBtb2RlIHdpdGggYW4gZW1wdHkgcHJvcGVydGllcyBvYmplY3Rcblx0XHRcdGZvcm1FbXB0eVByb3BzOiBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCgnYycsIHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdFbXB0eScsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9IH0pLFxuXHRcdFx0Ly8gYGZvcm1gIG1vZGUgd2hlcmUgZXZlcnkgZmllbGQgZmFpbHMgdmFsaWRhdGlvbiBhbmQgaXMgZHJvcHBlZFxuXHRcdFx0Zm9ybUFsbEludmFsaWQ6IGJ1aWxkRWxpY2l0YXRpb25SZXF1ZXN0KCdkJywgeyBzZXJ2ZXJOYW1lOiAnc3J2JywgbWVzc2FnZTogJ0FsbEJhZCcsIG1vZGU6ICdmb3JtJywgcmVxdWVzdGVkU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGE6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IDEyMyB9LCBiOiB7IG1pbmltdW06ICdub3BlJyB9IH0gfSB9KSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FzZXMsIHtcblx0XHRcdHVybE5vVXJsOiB7IGlkOiAnYScsIG1lc3NhZ2U6ICdOb1VybCcgfSxcblx0XHRcdGZvcm1Ob1NjaGVtYTogeyBpZDogJ2InLCBtZXNzYWdlOiAnTm9TY2hlbWEnIH0sXG5cdFx0XHRmb3JtRW1wdHlQcm9wczogeyBpZDogJ2MnLCBtZXNzYWdlOiAnRW1wdHknIH0sXG5cdFx0XHRmb3JtQWxsSW52YWxpZDogeyBpZDogJ2QnLCBtZXNzYWdlOiAnQWxsQmFkJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzIG1hcHMgZGVjbGluZS9jYW5jZWwvYWNjZXB0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjY2VwdGVkOiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+ID0ge1xuXHRcdFx0bmFtZTogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdBZGEnIH0gfSxcblx0XHRcdGNvdW50OiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5OdW1iZXIsIHZhbHVlOiAzIH0gfSxcblx0XHRcdGVuYWJsZWQ6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLkJvb2xlYW4sIHZhbHVlOiBmYWxzZSB9IH0sXG5cdFx0XHRjb2xvcjogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsIHZhbHVlOiAncmVkJyB9IH0sXG5cdFx0XHR0YWdzOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZE1hbnksIHZhbHVlOiBbJ2EnLCAnYiddIH0gfSxcblx0XHRcdHNpemU6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQgfSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVjbGluZTogZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2Vycyhmb3JtUmVxdWVzdCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUsIHVuZGVmaW5lZCksXG5cdFx0XHRjYW5jZWw6IGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMoZm9ybVJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwsIHVuZGVmaW5lZCksXG5cdFx0XHRhY2NlcHQ6IGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMoZm9ybVJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIGFjY2VwdGVkKSxcblx0XHR9LCB7XG5cdFx0XHRkZWNsaW5lOiB7IGFjdGlvbjogJ2RlY2xpbmUnIH0sXG5cdFx0XHRjYW5jZWw6IHsgYWN0aW9uOiAnY2FuY2VsJyB9LFxuXHRcdFx0YWNjZXB0OiB7IGFjdGlvbjogJ2FjY2VwdCcsIGNvbnRlbnQ6IHsgbmFtZTogJ0FkYScsIGNvdW50OiAzLCBlbmFibGVkOiBmYWxzZSwgY29sb3I6ICdyZWQnLCB0YWdzOiBbJ2EnLCAnYiddIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyAodXJsIGFjY2VwdCkgY2FycmllcyBubyBjb250ZW50JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKHVybFJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIHVuZGVmaW5lZCksXG5cdFx0XHR7IGFjdGlvbjogJ2FjY2VwdCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzIGFjY2VwdCBlZGdlIGNhc2VzOiBicm9rZW4gZm9ybSBvbWl0cyBjb250ZW50LCBlbXB0eSBhbnN3ZXJzIHlpZWxkIGVtcHR5IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYnJva2VuRm9ybTogRWxpY2l0YXRpb25SZXF1ZXN0ID0geyBzZXJ2ZXJOYW1lOiAnc3J2JywgbWVzc2FnZTogJ3gnLCBtb2RlOiAnZm9ybScsIHJlcXVlc3RlZFNjaGVtYTogeyBwcm9wZXJ0aWVzOiAnbm9wZScgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Ly8gQWNjZXB0aW5nIGEgZm9ybSB3aG9zZSBzY2hlbWEgY2FuJ3QgYmUgcGFyc2VkIFx1MjE5MiBubyBjb250ZW50IG9iamVjdC5cblx0XHRcdGJyb2tlbkFjY2VwdDogZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2Vycyhicm9rZW5Gb3JtLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCB1bmRlZmluZWQpLFxuXHRcdFx0Ly8gQWNjZXB0aW5nIGEgdmFsaWQgZm9ybSB3aXRoIG5vIGFuc3dlcnMgXHUyMTkyIGFuIGVtcHR5IGNvbnRlbnQgb2JqZWN0LlxuXHRcdFx0ZW1wdHlBbnN3ZXJzOiBlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKGZvcm1SZXF1ZXN0LCBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LCB1bmRlZmluZWQpLFxuXHRcdH0sIHtcblx0XHRcdGJyb2tlbkFjY2VwdDogeyBhY3Rpb246ICdhY2NlcHQnIH0sXG5cdFx0XHRlbXB0eUFuc3dlcnM6IHsgYWN0aW9uOiAnYWNjZXB0JywgY29udGVudDoge30gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWxpY2l0YXRpb25SZXN1bHRGcm9tQW5zd2VycyBjb2VyY2VzIHRleHQgYW5zd2VycyB0byB0aGUgZmllbGQgc2NoZW1hIHR5cGUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHdvcmtiZW5jaCByZW5kZXJzIG51bWJlci9pbnRlZ2VyL2Jvb2xlYW4gcXVlc3Rpb25zIGFzIHRleHQgaW5wdXRzXG5cdFx0Ly8gYW5kIHJldHVybnMgdGhlbSBhcyB0ZXh0IGFuc3dlcnMsIHNvIGBcIjNcImAgLyBgXCIwLjVcImAgLyBgXCJmYWxzZVwiYCBtdXN0IGJlXG5cdFx0Ly8gY29lcmNlZCBiYWNrIHRvIHRoZSBzY2hlbWEgdHlwZTsgYW4gdW5jb2VyY2libGUgdmFsdWUgaXMgZHJvcHBlZC5cblx0XHRjb25zdCByZXF1ZXN0OiBFbGljaXRhdGlvblJlcXVlc3QgPSB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiAnc3J2JywgbWVzc2FnZTogJ0NvZXJjZScsIG1vZGU6ICdmb3JtJyxcblx0XHRcdHJlcXVlc3RlZFNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGNvdW50OiB7IHR5cGU6ICdpbnRlZ2VyJyB9LFxuXHRcdFx0XHRcdHJhdGlvOiB7IHR5cGU6ICdudW1iZXInIH0sXG5cdFx0XHRcdFx0ZmxhZzogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRwaWNrOiB7IHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbJ2EnLCAnYiddIH0sXG5cdFx0XHRcdFx0YmFkOiB7IHR5cGU6ICdpbnRlZ2VyJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGFuc3dlcnM6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gPSB7XG5cdFx0XHRjb3VudDogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICczJyB9IH0sXG5cdFx0XHRyYXRpbzogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICcwLjUnIH0gfSxcblx0XHRcdGZsYWc6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsIHZhbHVlOiAnZmFsc2UnIH0gfSxcblx0XHRcdHBpY2s6IHsgc3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCwgdmFsdWU6IHsga2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLCB2YWx1ZTogJ2EnIH0gfSxcblx0XHRcdGJhZDogeyBzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLCB2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6ICdub3QtYS1udW1iZXInIH0gfSxcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzKHJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsIGFuc3dlcnMpLFxuXHRcdFx0eyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IGNvdW50OiAzLCByYXRpbzogMC41LCBmbGFnOiBmYWxzZSwgcGljazogJ2EnIH0gfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbGljaXRhdGlvblJlc3VsdEZyb21BbnN3ZXJzIGlzIHNhZmUgYWdhaW5zdCBwcm90b3R5cGUtcG9sbHV0aW5nIGZpZWxkIG5hbWVzJywgKCkgPT4ge1xuXHRcdC8vIEpTT04ucGFyc2UgcHJvZHVjZXMgb3duIGBfX3Byb3RvX19gIC8gYGNvbnN0cnVjdG9yYCBrZXlzICh1bmxpa2UgYW4gb2JqZWN0XG5cdFx0Ly8gbGl0ZXJhbCkuIFJlYWRpbmcgYW5zd2VycyBieSB0aG9zZSBuYW1lcyBtdXN0IHVzZSBvd24tcHJvcGVydHkgbG9va3VwIHNvIGFuXG5cdFx0Ly8gaW5oZXJpdGVkIG1lbWJlciBpcyBuZXZlciByZWFkICh3aGljaCB3b3VsZCBjcmFzaCksIGFuZCBjb250ZW50IG11c3QgYmVcblx0XHQvLyBidWlsdCB3aXRob3V0IHByb3RvdHlwZSBzZXR0ZXJzLlxuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBKU09OLnBhcnNlKCd7XCJfX3Byb3RvX19cIjp7XCJ0eXBlXCI6XCJzdHJpbmdcIn0sXCJjb25zdHJ1Y3RvclwiOntcInR5cGVcIjpcInN0cmluZ1wifSxcIm9rXCI6e1widHlwZVwiOlwic3RyaW5nXCJ9fScpO1xuXHRcdGNvbnN0IHJlcXVlc3Q6IEVsaWNpdGF0aW9uUmVxdWVzdCA9IHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICd4JywgbW9kZTogJ2Zvcm0nLCByZXF1ZXN0ZWRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMgfSB9O1xuXHRcdGNvbnN0IGFuc3dlcnM6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gPSB7IG9rOiB7IHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsIHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ3llcycgfSB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGVsaWNpdGF0aW9uUmVzdWx0RnJvbUFuc3dlcnMocmVxdWVzdCwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgYW5zd2VycyksXG5cdFx0XHR7IGFjdGlvbjogJ2FjY2VwdCcsIGNvbnRlbnQ6IHsgb2s6ICd5ZXMnIH0gfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsZWRFbGljaXRhdGlvblJlc3VsdCBpcyBhIHBsYWluIGNhbmNlbCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbmNlbGxlZEVsaWNpdGF0aW9uUmVzdWx0KCksIHsgYWN0aW9uOiAnY2FuY2VsJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlRWxpY2l0YXRpb24gY2FuY2VscyB3aGVuIHRoZSBzZXNzaW9uIGxvb2t1cCBtaXNzZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIFNESyBjYW4gZmlyZSBhbiBlbGljaXRhdGlvbiBmb3IgYSBzZXNzaW9uIHRoYXQgaXMgYWxyZWFkeSBnb25lXG5cdFx0Ly8gKHRlYXJkb3duIHJhY2UpLiBUaGUgYnJpZGdlIHJldHVybnMgYmVmb3JlIHRvdWNoaW5nIGFueSBzZXNzaW9uLCBzb1xuXHRcdC8vIHRoaXMgbmVlZHMgbm8gc2Vzc2lvbiBcdTIwMTQganVzdCBhIGxvb2t1cCB0aGF0IG1pc3Nlcy5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVFbGljaXRhdGlvbihcblx0XHRcdHsgZ2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkIH0sXG5cdFx0XHQnbWlzc2luZy1zZXNzaW9uJyxcblx0XHRcdHsgc2VydmVyTmFtZTogJ3NydicsIG1lc3NhZ2U6ICdxJywgbW9kZTogJ2Zvcm0nLCByZXF1ZXN0ZWRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgc2lkZTogeyB0eXBlOiAnc3RyaW5nJyB9IH0gfSB9LFxuXHRcdFx0eyBzaWduYWw6IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWwgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGFjdGlvbjogJ2NhbmNlbCcgfSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQiwwQkFBMEIsdUJBQXVCLDZCQUFtRDtBQUNuSSxTQUFTLHlCQUF5Qiw0QkFBNEIsb0NBQW9DO0FBQ2xHLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0scUJBQXFCLE1BQU07QUFFaEMsMENBQXdDO0FBRXhDLFFBQU0sY0FBa0M7QUFBQSxJQUN2QyxZQUFZO0FBQUEsSUFDWixTQUFTO0FBQUEsSUFDVCxNQUFNO0FBQUEsSUFDTixpQkFBaUI7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixVQUFVLENBQUMsUUFBUSxPQUFPO0FBQUEsTUFDMUIsWUFBWTtBQUFBLFFBQ1gsTUFBTSxFQUFFLE1BQU0sVUFBVSxPQUFPLFFBQVEsYUFBYSxhQUFhLFdBQVcsRUFBRTtBQUFBLFFBQzlFLE9B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
