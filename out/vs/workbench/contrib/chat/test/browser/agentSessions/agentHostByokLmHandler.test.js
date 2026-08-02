import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Event } from "../../../../../../base/common/event.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentHostByokLmHandler } from "../../../browser/agentSessions/agentHost/agentHostByokLmHandler.js";
import { ChatMessageRole } from "../../../common/languageModels.js";
class TestLanguageModelsService extends mock() {
  constructor(_models, _respond) {
    super();
    this._models = _models;
    this._respond = _respond;
    this.onDidChangeLanguageModels = Event.None;
  }
  getLanguageModelIds() {
    return [...this._models.keys()];
  }
  lookupLanguageModel(modelId) {
    return this._models.get(modelId);
  }
  async sendChatRequest(modelId, _from, messages, options, _token) {
    this.captured = { modelId, messages, options };
    return this._respond(this.captured);
  }
}
function byokModel(vendor, id, capabilities) {
  return {
    extension: new ExtensionIdentifier("test.byok"),
    name: `${vendor} ${id}`,
    id,
    vendor,
    version: "1.0.0",
    family: "test",
    maxInputTokens: 1e3,
    maxOutputTokens: 1e3,
    isDefaultForLocation: {},
    isBYOK: true,
    capabilities
  };
}
function responseOf(parts) {
  return {
    stream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    result: Promise.resolve(void 0)
  };
}
suite("AgentHostByokLmHandler", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createHandler(service) {
    return store.add(new AgentHostByokLmHandler(service, new NullLogService()));
  }
  test("listModels enumerates renderer BYOK models and excludes agent-host copies", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        ["id-acme", byokModel("acme", "claude", { vision: true })],
        ["id-copy", { ...byokModel("acme", "claude"), targetChatSessionType: "copilotcli" }],
        ["id-capi", { ...byokModel("copilot", "gpt-4"), isBYOK: false }]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      { vendor: "acme", id: "claude", name: "acme claude", modelIdentifier: "id-acme", maxContextWindowTokens: 2e3, supportsVision: true }
    ]);
  });
  test("listModels carries the LM service identifier (the Manage Models visibility key)", async () => {
    const groupedId = "openrouter/OpenRouter 2/ai21/jamba-large-1.7";
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        [groupedId, byokModel("openrouter", "ai21/jamba-large-1.7")],
        ["openrouter/gpt-4", byokModel("openrouter", "gpt-4")]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      { vendor: "openrouter", id: "ai21/jamba-large-1.7", name: "openrouter ai21/jamba-large-1.7", modelIdentifier: groupedId, maxContextWindowTokens: 2e3, supportsVision: false },
      { vendor: "openrouter", id: "gpt-4", name: "openrouter gpt-4", modelIdentifier: "openrouter/gpt-4", maxContextWindowTokens: 2e3, supportsVision: false }
    ]);
  });
  test("listModels carries string reasoning effort metadata from renderer BYOK schemas", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([
        ["id-reasoning", {
          ...byokModel("acme", "reasoning"),
          configurationSchema: {
            properties: {
              reasoningEffort: {
                type: "string",
                enum: ["minimal", "low", 1, "high"],
                default: "high"
              }
            }
          }
        }],
        ["id-malformed", {
          ...byokModel("acme", "malformed"),
          configurationSchema: {
            properties: {
              reasoningEffort: {
                type: "string",
                enum: [1, false],
                default: 1
              }
            }
          }
        }],
        ["id-plain", byokModel("acme", "plain")]
      ]),
      () => responseOf([])
    );
    const handler = createHandler(service);
    const models = await handler.listModels(CancellationToken.None);
    assert.deepStrictEqual(models, [
      {
        vendor: "acme",
        id: "reasoning",
        name: "acme reasoning",
        modelIdentifier: "id-reasoning",
        maxContextWindowTokens: 2e3,
        supportsVision: false,
        supportedReasoningEfforts: ["minimal", "low", "high"],
        defaultReasoningEffort: "high"
      },
      { vendor: "acme", id: "malformed", name: "acme malformed", modelIdentifier: "id-malformed", maxContextWindowTokens: 2e3, supportsVision: false },
      { vendor: "acme", id: "plain", name: "acme plain", modelIdentifier: "id-plain", maxContextWindowTokens: 2e3, supportsVision: false }
    ]);
  });
  test("buffers ordered thinking, text, tool calls, continuation and usage", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id-acme-claude", byokModel("acme", "claude")]]),
      () => responseOf([
        { type: "thinking", value: "considered ", id: "rs_1" },
        { type: "thinking", value: ["options"], id: "rs_1", metadata: { encrypted_content: "opaque" } },
        { type: "thinking", value: "", id: "thinking_2", metadata: { signature: "sig", _completeThinking: "full thought" } },
        { type: "text", value: "hello " },
        { type: "text", value: "world" },
        { type: "tool_use", name: "getWeather", toolCallId: "t1", parameters: { city: "NYC" } },
        { type: "tool_use", name: "apply_patch", toolCallId: "t2", parameters: { input: "patch" } },
        { type: "data", mimeType: "stateful_marker", data: VSBuffer.fromString("claude\\resp_provider") },
        { type: "data", mimeType: "usage", data: VSBuffer.fromString('{"prompt_tokens":10,"completion_tokens":5,"completion_tokens_details":{"reasoning_tokens":2}}') }
      ])
    );
    const handler = createHandler(service);
    const result = await handler.chat(
      {
        vendor: "acme",
        modelId: "claude",
        input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }],
        tools: [
          { type: "function", name: "getWeather" },
          { type: "custom", name: "apply_patch" }
        ]
      },
      CancellationToken.None
    );
    assert.strictEqual(service.captured?.modelId, "id-acme-claude");
    assert.deepStrictEqual(result, {
      output: [
        { type: "reasoning", id: "rs_1", summary: ["considered ", "options"], encryptedContent: "opaque", metadata: { encrypted_content: "opaque" } },
        { type: "reasoning", id: "thinking_2", summary: [""], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig","_completeThinking":"full thought"}', metadata: { signature: "sig", _completeThinking: "full thought" } },
        { type: "message", content: [{ type: "text", text: "hello world" }] },
        { type: "function_call", callId: "t1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
        { type: "custom_tool_call", callId: "t2", name: "apply_patch", input: "patch" }
      ],
      responseId: "resp_provider",
      usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 2 }
    });
  });
  test("maps ordered Responses input and options to LM API chat messages", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id", byokModel("acme", "claude")]]),
      () => responseOf([{ type: "text", value: "ok" }])
    );
    const handler = createHandler(service);
    await handler.chat(
      {
        vendor: "acme",
        modelId: "claude",
        instructions: "be helpful",
        previousResponseId: "resp_previous",
        reasoningEffort: "high",
        modelOptions: { temperature: 0.5 },
        tools: [
          { type: "function", name: "getWeather", parametersSchema: { type: "object" } },
          { type: "custom", name: "apply_patch" }
        ],
        input: [
          { type: "reasoning", id: "rs_1", summary: ["thought"], encryptedContent: "opaque" },
          { type: "reasoning", id: "rs_2", summary: ["other thought"], encryptedContent: 'vscode-reasoning-metadata:{"signature":"sig-2","_completeThinking":"other complete thought"}' },
          { type: "message", role: "assistant", content: [{ type: "text", text: "check" }, { type: "text", text: "ing" }] },
          { type: "function_call", callId: "t1", name: "getWeather", argumentsJson: '{"city":"NYC"}' },
          { type: "custom_tool_call", callId: "t2", name: "apply_patch", input: "patch" },
          { type: "function_call_output", callId: "t1", output: "sunny" },
          { type: "custom_tool_call_output", callId: "t2", output: "Done!" },
          { type: "message", role: "user", content: [{ type: "text", text: "hi" }] }
        ]
      },
      CancellationToken.None
    );
    const messages = service.captured?.messages.map((message) => ({
      role: message.role,
      content: message.content.map((part) => part.type === "data" ? { ...part, data: part.data.toString() } : part)
    }));
    assert.deepStrictEqual({
      messages,
      options: service.captured?.options
    }, {
      messages: [
        { role: ChatMessageRole.Assistant, content: [{ type: "data", mimeType: "stateful_marker", data: "claude\\resp_previous" }] },
        { role: ChatMessageRole.System, content: [{ type: "text", value: "be helpful" }] },
        {
          role: ChatMessageRole.Assistant,
          content: [
            { type: "thinking", value: ["thought"], id: "rs_1", metadata: { encrypted_content: "opaque" } },
            { type: "thinking", value: ["other thought"], id: "rs_2", metadata: { signature: "sig-2", _completeThinking: "other complete thought" } },
            { type: "text", value: "checking" },
            { type: "tool_use", name: "getWeather", toolCallId: "t1", parameters: { city: "NYC" } },
            { type: "tool_use", name: "apply_patch", toolCallId: "t2", parameters: { input: "patch" } }
          ]
        },
        { role: ChatMessageRole.User, content: [{ type: "tool_result", toolCallId: "t1", value: [{ type: "text", value: "sunny" }] }] },
        { role: ChatMessageRole.User, content: [{ type: "tool_result", toolCallId: "t2", value: [{ type: "text", value: "Done!" }] }] },
        { role: ChatMessageRole.User, content: [{ type: "text", value: "hi" }] }
      ],
      options: {
        modelOptions: { temperature: 0.5 },
        includeEncryptedThinking: true,
        configuration: { reasoningEffort: "high" },
        tools: [
          { name: "getWeather", description: "", inputSchema: { type: "object" } },
          { name: "apply_patch", description: "", inputSchema: { type: "object", properties: { input: { type: "string" } }, required: ["input"] } }
        ]
      }
    });
  });
  test("returns an error result when no BYOK model matches", async () => {
    const service = new TestLanguageModelsService(/* @__PURE__ */ new Map(), () => responseOf([]));
    const handler = createHandler(service);
    const result = await handler.chat(
      { vendor: "acme", modelId: "missing", input: [] },
      CancellationToken.None
    );
    assert.deepStrictEqual(result.output, []);
    assert.ok(result.error?.includes("acme/missing"), `expected error to name the model: ${result.error}`);
  });
  test("returns an error result when the LM request throws", async () => {
    const service = new TestLanguageModelsService(
      /* @__PURE__ */ new Map([["id", byokModel("acme", "claude")]]),
      () => {
        throw new Error("provider exploded");
      }
    );
    const handler = createHandler(service);
    const result = await handler.chat(
      { vendor: "acme", modelId: "claude", input: [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }] },
      CancellationToken.None
    );
    assert.deepStrictEqual(result, { output: [], error: "provider exploded" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0Qnlva0xtSGFuZGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElCeW9rTG1DaGF0UmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEJ5b2tMbUhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEJ5b2tMbUhhbmRsZXIuanMnO1xuaW1wb3J0IHsgQ2hhdE1lc3NhZ2VSb2xlLCBJQ2hhdE1lc3NhZ2UsIElDaGF0UmVzcG9uc2VQYXJ0LCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdE9wdGlvbnMsIElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcblxuaW50ZXJmYWNlIElDYXB0dXJlZFJlcXVlc3Qge1xuXHRtb2RlbElkOiBzdHJpbmc7XG5cdG1lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXTtcblx0b3B0aW9uczogSUxhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdE9wdGlvbnM7XG59XG5cbi8qKlxuICogRmFrZSBMTSBBUEkgc2VydmljZTogcmVzb2x2ZXMgYSBzbWFsbCBmaXhlZCBtb2RlbCBzZXQgYW5kIHJlcGxheXMgYVxuICogc2NyaXB0ZWQgcmVzcG9uc2Ugc3RyZWFtLCBjYXB0dXJpbmcgd2hhdCB0aGUgaGFuZGxlciBmb3J3YXJkZWQuIFN0YW5kcyBpblxuICogZm9yIHRoZSByZW5kZXJlcidzIHJlYWwgYElMYW5ndWFnZU1vZGVsc1NlcnZpY2VgIHNvIHRoZSBicmlkZ2UgaGFuZGxlciBjYW4gYmVcbiAqIGV4ZXJjaXNlZCB3aXRob3V0IGFueSBleHRlbnNpb24gb3IgbW9kZWwgcHJvdmlkZXIuXG4gKi9cbmNsYXNzIFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXG5cdGNhcHR1cmVkOiBJQ2FwdHVyZWRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsczogUmVhZG9ubHlNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVzcG9uZDogKHJlcXVlc3Q6IElDYXB0dXJlZFJlcXVlc3QpID0+IElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9tb2RlbHMua2V5cygpXTtcblx0fVxuXG5cdG92ZXJyaWRlIGxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZDogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2VuZENoYXRSZXF1ZXN0KG1vZGVsSWQ6IHN0cmluZywgX2Zyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG1lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXSwgb3B0aW9uczogSUxhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdE9wdGlvbnMsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlPiB7XG5cdFx0dGhpcy5jYXB0dXJlZCA9IHsgbW9kZWxJZCwgbWVzc2FnZXMsIG9wdGlvbnMgfTtcblx0XHRyZXR1cm4gdGhpcy5fcmVzcG9uZCh0aGlzLmNhcHR1cmVkKTtcblx0fVxufVxuXG5mdW5jdGlvbiBieW9rTW9kZWwodmVuZG9yOiBzdHJpbmcsIGlkOiBzdHJpbmcsIGNhcGFiaWxpdGllcz86IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhWydjYXBhYmlsaXRpZXMnXSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmJ5b2snKSxcblx0XHRuYW1lOiBgJHt2ZW5kb3J9ICR7aWR9YCxcblx0XHRpZCxcblx0XHR2ZW5kb3IsXG5cdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRmYW1pbHk6ICd0ZXN0Jyxcblx0XHRtYXhJbnB1dFRva2VuczogMTAwMCxcblx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMDAsXG5cdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdGlzQllPSzogdHJ1ZSxcblx0XHRjYXBhYmlsaXRpZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlT2YocGFydHM6IElDaGF0UmVzcG9uc2VQYXJ0W10pOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZSB7XG5cdHJldHVybiB7XG5cdFx0c3RyZWFtOiAoYXN5bmMgZnVuY3Rpb24qICgpIHtcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0XHR5aWVsZCBwYXJ0O1xuXHRcdFx0fVxuXHRcdH0pKCksXG5cdFx0cmVzdWx0OiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdEJ5b2tMbUhhbmRsZXInLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVIYW5kbGVyKHNlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpOiBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyIHtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKG5ldyBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyKHNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH1cblxuXHR0ZXN0KCdsaXN0TW9kZWxzIGVudW1lcmF0ZXMgcmVuZGVyZXIgQllPSyBtb2RlbHMgYW5kIGV4Y2x1ZGVzIGFnZW50LWhvc3QgY29waWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT4oW1xuXHRcdFx0XHRbJ2lkLWFjbWUnLCBieW9rTW9kZWwoJ2FjbWUnLCAnY2xhdWRlJywgeyB2aXNpb246IHRydWUgfSldLFxuXHRcdFx0XHRbJ2lkLWNvcHknLCB7IC4uLmJ5b2tNb2RlbCgnYWNtZScsICdjbGF1ZGUnKSwgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnY29waWxvdGNsaScgfV0sXG5cdFx0XHRcdFsnaWQtY2FwaScsIHsgLi4uYnlva01vZGVsKCdjb3BpbG90JywgJ2dwdC00JyksIGlzQllPSzogZmFsc2UgfV0sXG5cdFx0XHRdKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBoYW5kbGVyLmxpc3RNb2RlbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscywgW1xuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdjbGF1ZGUnLCBuYW1lOiAnYWNtZSBjbGF1ZGUnLCBtb2RlbElkZW50aWZpZXI6ICdpZC1hY21lJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMCwgc3VwcG9ydHNWaXNpb246IHRydWUgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGlzdE1vZGVscyBjYXJyaWVzIHRoZSBMTSBzZXJ2aWNlIGlkZW50aWZpZXIgKHRoZSBNYW5hZ2UgTW9kZWxzIHZpc2liaWxpdHkga2V5KScsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBIGdyb3VwZWQgQllPSyBtb2RlbCBpcyByZWdpc3RlcmVkIHVuZGVyIGA8dmVuZG9yPi88Z3JvdXA+LzxpZD5gIFx1MjAxNCBleGFjdGx5IHRoZSBpZCB0aGVcblx0XHQvLyBNYW5hZ2UgTW9kZWxzIHZpZXcga2V5cyB2aXNpYmlsaXR5IGJ5LiBUaGUgaGFuZGxlciBjYXJyaWVzIHRoYXQgaWRlbnRpZmllciB2ZXJiYXRpbSBzb1xuXHRcdC8vIHRoZSBwaWNrZXIgY2FuIGhvbm91ciB0aGUgdG9nZ2xlIGZvciB0aGUgbW9kZWwncyBhZ2VudC1ob3N0IGNvcHkuXG5cdFx0Y29uc3QgZ3JvdXBlZElkID0gJ29wZW5yb3V0ZXIvT3BlblJvdXRlciAyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jztcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KFtcblx0XHRcdFx0W2dyb3VwZWRJZCwgYnlva01vZGVsKCdvcGVucm91dGVyJywgJ2FpMjEvamFtYmEtbGFyZ2UtMS43JyldLFxuXHRcdFx0XHRbJ29wZW5yb3V0ZXIvZ3B0LTQnLCBieW9rTW9kZWwoJ29wZW5yb3V0ZXInLCAnZ3B0LTQnKV0sXG5cdFx0XHRdKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBoYW5kbGVyLmxpc3RNb2RlbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscywgW1xuXHRcdFx0eyB2ZW5kb3I6ICdvcGVucm91dGVyJywgaWQ6ICdhaTIxL2phbWJhLWxhcmdlLTEuNycsIG5hbWU6ICdvcGVucm91dGVyIGFpMjEvamFtYmEtbGFyZ2UtMS43JywgbW9kZWxJZGVudGlmaWVyOiBncm91cGVkSWQsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdFx0eyB2ZW5kb3I6ICdvcGVucm91dGVyJywgaWQ6ICdncHQtNCcsIG5hbWU6ICdvcGVucm91dGVyIGdwdC00JywgbW9kZWxJZGVudGlmaWVyOiAnb3BlbnJvdXRlci9ncHQtNCcsIG1heENvbnRleHRXaW5kb3dUb2tlbnM6IDIwMDAsIHN1cHBvcnRzVmlzaW9uOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0TW9kZWxzIGNhcnJpZXMgc3RyaW5nIHJlYXNvbmluZyBlZmZvcnQgbWV0YWRhdGEgZnJvbSByZW5kZXJlciBCWU9LIHNjaGVtYXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPihbXG5cdFx0XHRcdFsnaWQtcmVhc29uaW5nJywge1xuXHRcdFx0XHRcdC4uLmJ5b2tNb2RlbCgnYWNtZScsICdyZWFzb25pbmcnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnbWluaW1hbCcsICdsb3cnLCAxLCAnaGlnaCddLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdoaWdoJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnaWQtbWFsZm9ybWVkJywge1xuXHRcdFx0XHRcdC4uLmJ5b2tNb2RlbCgnYWNtZScsICdtYWxmb3JtZWQnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsxLCBmYWxzZV0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogMSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnaWQtcGxhaW4nLCBieW9rTW9kZWwoJ2FjbWUnLCAncGxhaW4nKV0sXG5cdFx0XHRdKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW10pLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBoYW5kbGVyLmxpc3RNb2RlbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVscywgW1xuXHRcdFx0e1xuXHRcdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdFx0aWQ6ICdyZWFzb25pbmcnLFxuXHRcdFx0XHRuYW1lOiAnYWNtZSByZWFzb25pbmcnLFxuXHRcdFx0XHRtb2RlbElkZW50aWZpZXI6ICdpZC1yZWFzb25pbmcnLFxuXHRcdFx0XHRtYXhDb250ZXh0V2luZG93VG9rZW5zOiAyMDAwLFxuXHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM6IFsnbWluaW1hbCcsICdsb3cnLCAnaGlnaCddLFxuXHRcdFx0XHRkZWZhdWx0UmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsXG5cdFx0XHR9LFxuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgaWQ6ICdtYWxmb3JtZWQnLCBuYW1lOiAnYWNtZSBtYWxmb3JtZWQnLCBtb2RlbElkZW50aWZpZXI6ICdpZC1tYWxmb3JtZWQnLCBtYXhDb250ZXh0V2luZG93VG9rZW5zOiAyMDAwLCBzdXBwb3J0c1Zpc2lvbjogZmFsc2UgfSxcblx0XHRcdHsgdmVuZG9yOiAnYWNtZScsIGlkOiAncGxhaW4nLCBuYW1lOiAnYWNtZSBwbGFpbicsIG1vZGVsSWRlbnRpZmllcjogJ2lkLXBsYWluJywgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogMjAwMCwgc3VwcG9ydHNWaXNpb246IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZmZlcnMgb3JkZXJlZCB0aGlua2luZywgdGV4dCwgdG9vbCBjYWxscywgY29udGludWF0aW9uIGFuZCB1c2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UoXG5cdFx0XHRuZXcgTWFwKFtbJ2lkLWFjbWUtY2xhdWRlJywgYnlva01vZGVsKCdhY21lJywgJ2NsYXVkZScpXV0pLFxuXHRcdFx0KCkgPT4gcmVzcG9uc2VPZihbXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6ICdjb25zaWRlcmVkICcsIGlkOiAncnNfMScgfSxcblx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogWydvcHRpb25zJ10sIGlkOiAncnNfMScsIG1ldGFkYXRhOiB7IGVuY3J5cHRlZF9jb250ZW50OiAnb3BhcXVlJyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6ICcnLCBpZDogJ3RoaW5raW5nXzInLCBtZXRhZGF0YTogeyBzaWduYXR1cmU6ICdzaWcnLCBfY29tcGxldGVUaGlua2luZzogJ2Z1bGwgdGhvdWdodCcgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICdoZWxsbyAnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ3dvcmxkJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6ICdnZXRXZWF0aGVyJywgdG9vbENhbGxJZDogJ3QxJywgcGFyYW1ldGVyczogeyBjaXR5OiAnTllDJyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogJ2FwcGx5X3BhdGNoJywgdG9vbENhbGxJZDogJ3QyJywgcGFyYW1ldGVyczogeyBpbnB1dDogJ3BhdGNoJyB9IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogJ3N0YXRlZnVsX21hcmtlcicsIGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2NsYXVkZVxcXFxyZXNwX3Byb3ZpZGVyJykgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGF0YScsIG1pbWVUeXBlOiAndXNhZ2UnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCd7XCJwcm9tcHRfdG9rZW5zXCI6MTAsXCJjb21wbGV0aW9uX3Rva2Vuc1wiOjUsXCJjb21wbGV0aW9uX3Rva2Vuc19kZXRhaWxzXCI6e1wicmVhc29uaW5nX3Rva2Vuc1wiOjJ9fScpIH0sXG5cdFx0XHRdKSxcblx0XHQpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5jaGF0KFxuXHRcdFx0e1xuXHRcdFx0XHR2ZW5kb3I6ICdhY21lJyxcblx0XHRcdFx0bW9kZWxJZDogJ2NsYXVkZScsXG5cdFx0XHRcdGlucHV0OiBbeyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGknIH1dIH1dLFxuXHRcdFx0XHR0b29sczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uJywgbmFtZTogJ2dldFdlYXRoZXInIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tJywgbmFtZTogJ2FwcGx5X3BhdGNoJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhcHR1cmVkPy5tb2RlbElkLCAnaWQtYWNtZS1jbGF1ZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdHsgdHlwZTogJ3JlYXNvbmluZycsIGlkOiAncnNfMScsIHN1bW1hcnk6IFsnY29uc2lkZXJlZCAnLCAnb3B0aW9ucyddLCBlbmNyeXB0ZWRDb250ZW50OiAnb3BhcXVlJywgbWV0YWRhdGE6IHsgZW5jcnlwdGVkX2NvbnRlbnQ6ICdvcGFxdWUnIH0gfSxcblx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICd0aGlua2luZ18yJywgc3VtbWFyeTogWycnXSwgZW5jcnlwdGVkQ29udGVudDogJ3ZzY29kZS1yZWFzb25pbmctbWV0YWRhdGE6e1wic2lnbmF0dXJlXCI6XCJzaWdcIixcIl9jb21wbGV0ZVRoaW5raW5nXCI6XCJmdWxsIHRob3VnaHRcIn0nLCBtZXRhZGF0YTogeyBzaWduYXR1cmU6ICdzaWcnLCBfY29tcGxldGVUaGlua2luZzogJ2Z1bGwgdGhvdWdodCcgfSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8gd29ybGQnIH1dIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICd0MScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfSxcblx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsIGNhbGxJZDogJ3QyJywgbmFtZTogJ2FwcGx5X3BhdGNoJywgaW5wdXQ6ICdwYXRjaCcgfSxcblx0XHRcdF0sXG5cdFx0XHRyZXNwb25zZUlkOiAncmVzcF9wcm92aWRlcicsXG5cdFx0XHR1c2FnZTogeyBpbnB1dFRva2VuczogMTAsIG91dHB1dFRva2VuczogNSwgcmVhc29uaW5nVG9rZW5zOiAyIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgb3JkZXJlZCBSZXNwb25zZXMgaW5wdXQgYW5kIG9wdGlvbnMgdG8gTE0gQVBJIGNoYXQgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKFxuXHRcdFx0bmV3IE1hcChbWydpZCcsIGJ5b2tNb2RlbCgnYWNtZScsICdjbGF1ZGUnKV1dKSxcblx0XHRcdCgpID0+IHJlc3BvbnNlT2YoW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ29rJyB9XSksXG5cdFx0KTtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcihzZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGhhbmRsZXIuY2hhdChcblx0XHRcdHtcblx0XHRcdFx0dmVuZG9yOiAnYWNtZScsXG5cdFx0XHRcdG1vZGVsSWQ6ICdjbGF1ZGUnLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6ICdiZSBoZWxwZnVsJyxcblx0XHRcdFx0cHJldmlvdXNSZXNwb25zZUlkOiAncmVzcF9wcmV2aW91cycsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogJ2hpZ2gnLFxuXHRcdFx0XHRtb2RlbE9wdGlvbnM6IHsgdGVtcGVyYXR1cmU6IDAuNSB9LFxuXHRcdFx0XHR0b29sczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uJywgbmFtZTogJ2dldFdlYXRoZXInLCBwYXJhbWV0ZXJzU2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnIH0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b20nLCBuYW1lOiAnYXBwbHlfcGF0Y2gnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGlucHV0OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18xJywgc3VtbWFyeTogWyd0aG91Z2h0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICdvcGFxdWUnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAncmVhc29uaW5nJywgaWQ6ICdyc18yJywgc3VtbWFyeTogWydvdGhlciB0aG91Z2h0J10sIGVuY3J5cHRlZENvbnRlbnQ6ICd2c2NvZGUtcmVhc29uaW5nLW1ldGFkYXRhOntcInNpZ25hdHVyZVwiOlwic2lnLTJcIixcIl9jb21wbGV0ZVRoaW5raW5nXCI6XCJvdGhlciBjb21wbGV0ZSB0aG91Z2h0XCJ9JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnY2hlY2snIH0sIHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaW5nJyB9XSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICd0MScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJywgY2FsbElkOiAndDInLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBpbnB1dDogJ3BhdGNoJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0JywgY2FsbElkOiAndDEnLCBvdXRwdXQ6ICdzdW5ueScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsIGNhbGxJZDogJ3QyJywgb3V0cHV0OiAnRG9uZSEnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGknIH1dIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBzZXJ2aWNlLmNhcHR1cmVkPy5tZXNzYWdlcy5tYXAobWVzc2FnZSA9PiAoe1xuXHRcdFx0cm9sZTogbWVzc2FnZS5yb2xlLFxuXHRcdFx0Y29udGVudDogbWVzc2FnZS5jb250ZW50Lm1hcChwYXJ0ID0+IHBhcnQudHlwZSA9PT0gJ2RhdGEnID8geyAuLi5wYXJ0LCBkYXRhOiBwYXJ0LmRhdGEudG9TdHJpbmcoKSB9IDogcGFydCksXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZXMsXG5cdFx0XHRvcHRpb25zOiBzZXJ2aWNlLmNhcHR1cmVkPy5vcHRpb25zLFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2VzOiBbXG5cdFx0XHRcdHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudDogW3sgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogJ3N0YXRlZnVsX21hcmtlcicsIGRhdGE6ICdjbGF1ZGVcXFxccmVzcF9wcmV2aW91cycgfV0gfSxcblx0XHRcdFx0eyByb2xlOiBDaGF0TWVzc2FnZVJvbGUuU3lzdGVtLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiAnYmUgaGVscGZ1bCcgfV0gfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsXG5cdFx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAndGhpbmtpbmcnLCB2YWx1ZTogWyd0aG91Z2h0J10sIGlkOiAncnNfMScsIG1ldGFkYXRhOiB7IGVuY3J5cHRlZF9jb250ZW50OiAnb3BhcXVlJyB9IH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiBbJ290aGVyIHRob3VnaHQnXSwgaWQ6ICdyc18yJywgbWV0YWRhdGE6IHsgc2lnbmF0dXJlOiAnc2lnLTInLCBfY29tcGxldGVUaGlua2luZzogJ290aGVyIGNvbXBsZXRlIHRob3VnaHQnIH0gfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ2NoZWNraW5nJyB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnZ2V0V2VhdGhlcicsIHRvb2xDYWxsSWQ6ICd0MScsIHBhcmFtZXRlcnM6IHsgY2l0eTogJ05ZQycgfSB9LFxuXHRcdFx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiAnYXBwbHlfcGF0Y2gnLCB0b29sQ2FsbElkOiAndDInLCBwYXJhbWV0ZXJzOiB7IGlucHV0OiAncGF0Y2gnIH0gfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sQ2FsbElkOiAndDEnLCB2YWx1ZTogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ3N1bm55JyB9XSB9XSB9LFxuXHRcdFx0XHR7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sQ2FsbElkOiAndDInLCB2YWx1ZTogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogJ0RvbmUhJyB9XSB9XSB9LFxuXHRcdFx0XHR7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiAnaGknIH1dIH0sXG5cdFx0XHRdLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRtb2RlbE9wdGlvbnM6IHsgdGVtcGVyYXR1cmU6IDAuNSB9LFxuXHRcdFx0XHRpbmNsdWRlRW5jcnlwdGVkVGhpbmtpbmc6IHRydWUsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHsgcmVhc29uaW5nRWZmb3J0OiAnaGlnaCcgfSxcblx0XHRcdFx0dG9vbHM6IFtcblx0XHRcdFx0XHR7IG5hbWU6ICdnZXRXZWF0aGVyJywgZGVzY3JpcHRpb246ICcnLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnYXBwbHlfcGF0Y2gnLCBkZXNjcmlwdGlvbjogJycsIGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7IGlucHV0OiB7IHR5cGU6ICdzdHJpbmcnIH0gfSwgcmVxdWlyZWQ6IFsnaW5wdXQnXSB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVycm9yIHJlc3VsdCB3aGVuIG5vIEJZT0sgbW9kZWwgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RMYW5ndWFnZU1vZGVsc1NlcnZpY2UobmV3IE1hcCgpLCAoKSA9PiByZXNwb25zZU9mKFtdKSk7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoc2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmNoYXQoXG5cdFx0XHR7IHZlbmRvcjogJ2FjbWUnLCBtb2RlbElkOiAnbWlzc2luZycsIGlucHV0OiBbXSB9IHNhdGlzZmllcyBJQnlva0xtQ2hhdFJlcXVlc3QsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5vdXRwdXQsIFtdKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmVycm9yPy5pbmNsdWRlcygnYWNtZS9taXNzaW5nJyksIGBleHBlY3RlZCBlcnJvciB0byBuYW1lIHRoZSBtb2RlbDogJHtyZXN1bHQuZXJyb3J9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYW4gZXJyb3IgcmVzdWx0IHdoZW4gdGhlIExNIHJlcXVlc3QgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlTW9kZWxzU2VydmljZShcblx0XHRcdG5ldyBNYXAoW1snaWQnLCBieW9rTW9kZWwoJ2FjbWUnLCAnY2xhdWRlJyldXSksXG5cdFx0XHQoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncHJvdmlkZXIgZXhwbG9kZWQnKTsgfSxcblx0XHQpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5jaGF0KFxuXHRcdFx0eyB2ZW5kb3I6ICdhY21lJywgbW9kZWxJZDogJ2NsYXVkZScsIGlucHV0OiBbeyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGknIH1dIH1dIH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBvdXRwdXQ6IFtdLCBlcnJvcjogJ3Byb3ZpZGVyIGV4cGxvZGVkJyB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsOEJB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
