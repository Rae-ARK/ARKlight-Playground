import assert from "assert";
import * as net from "net";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError
} from "../../node/shared/copilotApiService.js";
import { PROXY_ERROR_PREFIX, tryParseForwardedChatError } from "../../node/shared/forwardedChatError.js";
import { ClaudeProxyService } from "../../node/claude/claudeProxyService.js";
function assertEnvelopeWithChatErrorMarker(actual, original, expectedFetchType) {
  assert.strictEqual(actual.type, "error");
  assert.strictEqual(actual.request_id, original.request_id);
  assert.strictEqual(actual.error.type, original.error.type);
  assert.ok(actual.error.message.startsWith(`${original.error.message} ${PROXY_ERROR_PREFIX}`), `expected marker-appended message, got: ${actual.error.message}`);
  const forwarded = tryParseForwardedChatError(actual.error.message);
  assert.ok(forwarded, "embedded marker should decode to a forwarded chat error");
  assert.strictEqual(forwarded.fetchError.type, expectedFetchType);
}
class FakeCopilotApiService {
  constructor() {
    this.messagesResult = { kind: "error", error: new Error("not configured") };
    this.modelsResult = { kind: "value", value: [] };
    this.messagesCalls = [];
    this.modelsCalls = [];
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  messages(githubToken, request, options) {
    this.messagesCalls.push({ githubToken, body: request, options });
    const result = this.messagesResult;
    if (request.stream) {
      return this._streamGen(result, options);
    }
    if (result.kind === "message") {
      return Promise.resolve(result.message);
    }
    if (result.kind === "error") {
      return Promise.reject(result.error);
    }
    return Promise.reject(new Error(`stream result configured but non-streaming request received`));
  }
  async *_streamGen(result, options) {
    if (result.kind === "error") {
      throw result.error;
    }
    if (result.kind !== "stream") {
      throw new Error(`non-stream result configured but streaming request received`);
    }
    let firstReadFired = false;
    for (const ev of result.events) {
      if (options?.signal?.aborted) {
        const e = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }
      if (!firstReadFired) {
        firstReadFired = true;
        this.onStreamFirstRead?.();
      }
      yield ev;
    }
    if (result.midStreamError) {
      throw result.midStreamError;
    }
  }
  async countTokens() {
    throw new Error("countTokens not supported");
  }
  async models(githubToken, options) {
    this.modelsCalls.push({ githubToken, options });
    if (this.modelsResult.kind === "error") {
      throw this.modelsResult.error;
    }
    return this.modelsResult.value;
  }
  async responses() {
    throw new Error("responses not used by Claude proxy tests");
  }
  async utilityChatCompletion() {
    throw new Error("utilityChatCompletion not used by Claude proxy tests");
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
function fetchJson(url, init) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: init?.method ?? "GET",
      headers: init?.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : void 0;
        } catch {
          parsed = void 0;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, parsed });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (init?.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
function fetchSse(url, init, onResponse) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: init.method,
      headers: init.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          rawBody,
          events: parseSseFrames(rawBody)
        });
      });
      res.on("error", reject);
      onResponse?.(res, () => req.destroy());
    });
    req.on("error", (err) => {
      reject(err);
    });
    if (init.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
function parseSseFrames(raw) {
  const out = [];
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice("data: ".length);
      }
    }
    if (event && data) {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      out.push({ type: event, data: parsed });
    }
  }
  return out;
}
const ANTHROPIC_MODEL = {
  id: "claude-opus-4.6",
  name: "Claude Opus 4.6",
  vendor: "Anthropic",
  supported_endpoints: ["/v1/messages"],
  object: "model",
  version: "4.6",
  is_chat_default: false,
  is_chat_fallback: false,
  model_picker_category: "",
  model_picker_enabled: true,
  preview: false,
  billing: { is_premium: false },
  capabilities: {},
  policy: {}
};
const NON_ANTHROPIC_MODEL = {
  ...ANTHROPIC_MODEL,
  id: "gpt-5",
  name: "GPT-5",
  vendor: "OpenAI",
  supported_endpoints: ["/v1/chat/completions"]
};
const NON_MESSAGES_ANTHROPIC = {
  ...ANTHROPIC_MODEL,
  id: "claude-instant-tokenizer",
  name: "Anthropic Tokenizer",
  supported_endpoints: ["/v1/tokenize"]
};
function makeMessage(model, text) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null
    }
  };
}
function makeStreamEvents(model) {
  const message = makeMessage(model, "");
  return [
    { type: "message_start", message },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
    { type: "message_stop" }
  ];
}
function createProxyService(fakeApi) {
  return new ClaudeProxyService(new NullLogService(), fakeApi);
}
const TOKEN = "gh-test-token";
suite("ClaudeProxyService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Token slot", () => {
    test("start() updates token slot last-writer-wins", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [] };
      const service = createProxyService(fake);
      const h1 = await service.start("token-A");
      const h2 = await service.start("token-B");
      try {
        await fetchJson(`${h2.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${h2.nonce}.s1` }
        });
        assert.strictEqual(fake.modelsCalls.at(-1)?.githubToken, "token-B");
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Auth", () => {
    async function withProxy(fn) {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [ANTHROPIC_MODEL] };
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        return await fn(handle, fake);
      } finally {
        handle.dispose();
        service.dispose();
      }
    }
    test("missing Authorization header \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`);
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(res.parsed, {
          type: "error",
          error: { type: "authentication_error", message: "Invalid authentication" },
          request_id: null
        });
      });
    });
    test("Bearer wrong-nonce.x \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": "Bearer wrong-nonce.session" }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce> (no dot) \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}` }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce>. (empty sessionId) \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.` }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("x-api-key alone \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "x-api-key": handle.nonce }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce>.<sessionId> \u2192 request proceeds", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.session-abc` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(fake.modelsCalls.length, 1);
      });
    });
    test("auth-first precedence: GET /v1/models with bad auth does not reach upstream", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": "Bearer wrong.s" }
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(fake.modelsCalls.length, 0);
      });
    });
    test("auth-first precedence: POST /v1/messages with bad auth does not reach upstream", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer wrong.s",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(fake.messagesCalls.length, 0);
      });
    });
    test("auth-first precedence: POST /v1/messages/count_tokens with bad auth \u2192 401 (not 501)", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
          method: "POST",
          headers: { "Authorization": "Bearer wrong.s" },
          body: "{}"
        });
        assert.strictEqual(res.status, 401);
      });
    });
  });
  suite("Routes", () => {
    test("GET / \u2192 200 ok, no auth required", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body, "ok");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("POST /v1/messages/count_tokens \u2192 501 api_error", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${handle.nonce}.s` },
          body: "{}"
        });
        assert.strictEqual(res.status, 501);
        assert.deepStrictEqual(res.parsed, {
          type: "error",
          error: { type: "api_error", message: "count_tokens not supported by CAPI" },
          request_id: null
        });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("GET /something-else \u2192 404 not_found_error", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v2/whatever`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 404);
        const env = res.parsed;
        assert.strictEqual(env.type, "error");
        assert.strictEqual(env.error.type, "not_found_error");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("GET /v1/models", () => {
    test("returns Page envelope with SDK-format IDs and filters by vendor + endpoint", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [ANTHROPIC_MODEL, NON_ANTHROPIC_MODEL, NON_MESSAGES_ANTHROPIC] };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 200);
        const body = res.parsed;
        assert.deepStrictEqual(body, {
          data: [{
            id: "claude-opus-4-6",
            type: "model",
            display_name: "Claude Opus 4.6",
            created_at: "1970-01-01T00:00:00Z",
            capabilities: null,
            max_input_tokens: null,
            max_tokens: null
          }],
          has_more: false,
          first_id: "claude-opus-4-6",
          last_id: "claude-opus-4-6"
        });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("upstream CopilotApiError is re-emitted verbatim with original status", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "rate_limit_error", message: "slow down" },
        request_id: "req_123"
      };
      fake.modelsResult = { kind: "error", error: new CopilotApiError(429, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 429);
        assert.deepStrictEqual(res.parsed, envelope);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("non-CopilotApiError \u2192 502 api_error", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "error", error: new Error("ECONNRESET") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 502);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "api_error");
        assert.strictEqual(env.error.message, "ECONNRESET");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("POST /v1/messages model translation", () => {
    test("SDK ID inbound is translated to endpoint ID upstream", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6-20251101", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(fake.messagesCalls.length, 1);
        assert.strictEqual(fake.messagesCalls[0].body.model, "claude-opus-4.6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("endpoint ID inbound is also accepted", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4.6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(fake.messagesCalls[0].body.model, "claude-opus-4.6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("unparseable model \u2192 404 with no upstream call", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "gpt-4o", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 404);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "not_found_error");
        assert.strictEqual(fake.messagesCalls.length, 0);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("non-streaming response model is rewritten to SDK format", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 200);
        const msg = res.parsed;
        assert.strictEqual(msg.model, "claude-opus-4-6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Credits reporting", () => {
    test("streaming: copilot_usage.total_nano_aiu fires onDidReportCredits with the session id", async () => {
      const fake = new FakeCopilotApiService();
      const events = makeStreamEvents("claude-opus-4.6");
      const delta = events.find((e) => e.type === "message_delta");
      delta.copilot_usage = { total_nano_aiu: 75e7 };
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-42`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.deepStrictEqual(reports, [{ sessionId: "sess-42", totalNanoAiu: 75e7 }]);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
    test("non-streaming: copilot_usage.total_nano_aiu fires onDidReportCredits", async () => {
      const fake = new FakeCopilotApiService();
      const message = makeMessage("claude-opus-4.6", "hi");
      message.copilot_usage = { total_nano_aiu: 25e7 };
      fake.messagesResult = { kind: "message", message };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-7`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.deepStrictEqual(reports, [{ sessionId: "sess-7", totalNanoAiu: 25e7 }]);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
    test("no copilot_usage in the response \u2192 no credits report", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-9`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.deepStrictEqual(reports, []);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Body validation", () => {
    test("non-JSON body \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: "not-json"
        });
        assert.strictEqual(res.status, 400);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "invalid_request_error");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("missing model field \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 400);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("missing messages field \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", max_tokens: 8 })
        });
        assert.strictEqual(res.status, 400);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Header passthrough", () => {
    async function postAndCaptureHeaders(beta, version) {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      const headers = {
        "Authorization": `Bearer ${handle.nonce}.s`,
        "Content-Type": "application/json",
        "x-request-id": "caller-rid-123",
        "x-custom-thing": "should-drop"
      };
      if (beta !== void 0) {
        headers["anthropic-beta"] = beta;
      }
      if (version !== void 0) {
        headers["anthropic-version"] = version;
      }
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        return fake.messagesCalls[0].options?.headers;
      } finally {
        handle.dispose();
        service.dispose();
      }
    }
    test("forwards anthropic-version verbatim", async () => {
      const headers = await postAndCaptureHeaders(void 0, "2023-06-01");
      assert.strictEqual(headers?.["anthropic-version"], "2023-06-01");
    });
    test("forwards supported anthropic-beta", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], "interleaved-thinking-2025-05-14");
    });
    test("filters out unsupported betas", async () => {
      const headers = await postAndCaptureHeaders("foo,bar,baz", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], void 0);
    });
    test("drops supported family without date suffix", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], void 0);
    });
    test("mixed beta list keeps supported entries only", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14,foo", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], "interleaved-thinking-2025-05-14");
    });
    test("drops x-request-id and arbitrary headers", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14", "2023-06-01") ?? {};
      assert.deepStrictEqual(Object.keys(headers).sort(), ["anthropic-beta", "anthropic-version"]);
    });
  });
  suite("Streaming", () => {
    test("emits SSE frames in order with hand-rolled framing and rewrites message_start.message.model", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "stream", events: makeStreamEvents("claude-opus-4.6") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers["content-type"], "text/event-stream");
        const types = res.events.map((e) => e.type);
        assert.deepStrictEqual(types, [
          "message_start",
          "content_block_start",
          "content_block_delta",
          "content_block_stop",
          "message_delta",
          "message_stop"
        ]);
        const start = res.events[0].data;
        assert.strictEqual(start.message.model, "claude-opus-4-6");
        assert.ok(!res.rawBody.includes("[DONE]"));
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("mid-stream CopilotApiError \u2192 SSE error frame, then end, no message_stop after", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } }
      ];
      const upstreamEnvelope = {
        type: "error",
        error: { type: "rate_limit_error", message: "slow down" },
        request_id: "req_xyz"
      };
      fake.messagesResult = {
        kind: "stream",
        events,
        midStreamError: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, upstreamEnvelope)
      };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 200);
        const lastEvent = res.events.at(-1);
        assert.ok(lastEvent);
        assert.strictEqual(lastEvent.type, "error");
        assertEnvelopeWithChatErrorMarker(lastEvent.data, upstreamEnvelope, "failed");
        const types = res.events.map((e) => e.type);
        assert.ok(!types.includes("message_stop"), "no message_stop after error frame");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("pre-stream CopilotApiError \u2192 JSON error response with original status", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "authentication_error", message: "token expired" },
        request_id: "req_pre"
      };
      fake.messagesResult = { kind: "error", error: new CopilotApiError(401, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 401);
        assertEnvelopeWithChatErrorMarker(res.parsed, envelope, "agent_unauthorized");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("pre-stream CopilotApiError with streaming sentinel coerces to 502 but preserves envelope", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "overloaded_error", message: "capacity full" },
        request_id: "req_sentinel"
      };
      fake.messagesResult = { kind: "error", error: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 502);
        assertEnvelopeWithChatErrorMarker(res.parsed, envelope, "failed");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("mid-stream non-CopilotApiError \u2192 synthesized SSE error frame", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") }
      ];
      fake.messagesResult = { kind: "stream", events, midStreamError: new Error("socket hang up") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const lastEvent = res.events.at(-1);
        assert.strictEqual(lastEvent?.type, "error");
        const env = lastEvent.data;
        assert.strictEqual(env.error.type, "api_error");
        assert.strictEqual(env.error.message, "socket hang up");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("tool-use input_json_delta events pass through", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "do_thing", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"a":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "1}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" }
      ];
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const deltas = res.events.filter((e) => e.type === "content_block_delta").map((e) => e.data);
        assert.deepStrictEqual(deltas.map((d) => d.delta.type), ["input_json_delta", "input_json_delta"]);
        assert.deepStrictEqual(deltas.map((d) => d.delta.partial_json), ['{"a":', "1}"]);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("thinking_delta events pass through", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: " ok" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" }
      ];
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const deltas = res.events.filter((e) => e.type === "content_block_delta").map((e) => e.data);
        assert.deepStrictEqual(deltas.map((d) => d.delta.type), ["thinking_delta", "thinking_delta"]);
        assert.deepStrictEqual(deltas.map((d) => d.delta.thinking), ["hmm", " ok"]);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("socket.setNoDelay(true) is called on streaming responses", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "stream", events: makeStreamEvents("claude-opus-4.6") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      const original = net.Socket.prototype.setNoDelay;
      const calls = [];
      net.Socket.prototype.setNoDelay = function(enable) {
        calls.push(enable !== false);
        return original.call(this, enable);
      };
      try {
        await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.ok(calls.some((c) => c === true), "expected setNoDelay(true) to have been called at least once");
      } finally {
        net.Socket.prototype.setNoDelay = original;
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Abort", () => {
    test("client disconnect mid-stream propagates AbortSignal upstream and writes nothing else", async () => {
      let signalSeen;
      let resolveAborted;
      const abortObserved = new Promise((resolve) => {
        resolveAborted = resolve;
      });
      const wrapped = {
        _serviceBrand: void 0,
        // Custom stream: yield message_start, then wait until the
        // caller's AbortSignal fires (mimics a real long-running
        // upstream stream waiting for tokens to arrive). The test
        // client disconnects after receiving the first frame, and
        // we assert that the abort propagated.
        messages: ((_token, _body, options) => {
          signalSeen = options?.signal;
          async function* gen() {
            yield { type: "message_start", message: makeMessage("claude-opus-4.6", "") };
            await new Promise((_resolve, reject) => {
              const onAbort = () => {
                resolveAborted();
                const e = new Error("Aborted");
                e.name = "AbortError";
                reject(e);
              };
              if (options?.signal?.aborted) {
                onAbort();
                return;
              }
              options?.signal?.addEventListener("abort", onAbort);
            });
          }
          return gen();
        }),
        countTokens: () => Promise.reject(new Error("not used")),
        models: () => Promise.resolve([]),
        responses: () => Promise.reject(new Error("not used")),
        utilityChatCompletion: () => Promise.reject(new Error("not used")),
        resolveRestrictedTelemetryContext: () => Promise.resolve({ restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 }),
        resolveApiEndpoint: () => Promise.resolve(void 0)
      };
      const service = new ClaudeProxyService(new NullLogService(), wrapped);
      const handle = await service.start(TOKEN);
      try {
        const u = new URL(`${handle.baseUrl}/v1/messages`);
        const httpMod = await getHttp();
        const clientFinished = new Promise((resolve) => {
          const req = httpMod.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: "POST",
            headers: {
              "Authorization": `Bearer ${handle.nonce}.s`,
              "Content-Type": "application/json"
            }
          }, (res) => {
            let frames = 0;
            res.on("data", () => {
              frames++;
              if (frames >= 1) {
                req.destroy();
                resolve();
              }
            });
            res.on("error", () => resolve());
            res.on("close", () => resolve());
          });
          req.on("error", () => resolve());
          req.write(JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true }));
          req.end();
        });
        await clientFinished;
        await Promise.race([
          abortObserved,
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error("upstream did not observe abort within 2s")), 2e3))
        ]);
        assert.ok(signalSeen, "expected upstream signal");
        assert.ok(signalSeen.aborted, "expected abort to fire on client disconnect");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("dispose() with in-flight non-streaming aborts the upstream call", async () => {
      const fake = new FakeCopilotApiService();
      let signalSeen;
      let releaseUpstream = () => {
      };
      const upstream = new Promise((_resolve, reject) => {
        releaseUpstream = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
      const wrapped = {
        _serviceBrand: void 0,
        messages: ((token, body, options) => {
          signalSeen = options?.signal;
          if (body.stream) {
            return fake.messages(token, body, options);
          }
          options?.signal?.addEventListener("abort", () => releaseUpstream());
          return upstream;
        }),
        countTokens: fake.countTokens.bind(fake),
        models: fake.models.bind(fake),
        responses: fake.responses.bind(fake),
        utilityChatCompletion: fake.utilityChatCompletion.bind(fake),
        resolveRestrictedTelemetryContext: fake.resolveRestrictedTelemetryContext.bind(fake),
        resolveApiEndpoint: fake.resolveApiEndpoint.bind(fake)
      };
      const service = new ClaudeProxyService(new NullLogService(), wrapped);
      const handle = await service.start(TOKEN);
      const inflight = fetchJson(`${handle.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${handle.nonce}.s`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
      }).catch((err) => ({ aborted: true, err }));
      await new Promise((resolve) => {
        const i = setInterval(() => {
          if (signalSeen) {
            clearInterval(i);
            resolve();
          }
        }, 10);
      });
      handle.dispose();
      service.dispose();
      const result = await inflight;
      assert.ok(signalSeen?.aborted, "expected abort to fire on dispose");
      void result;
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlUHJveHlTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHtcblx0Q09QSUxPVF9BUElfRVJST1JfU1RBVFVTX1NUUkVBTUlORyxcblx0Q29waWxvdEFwaUVycm9yLFxuXHR0eXBlIElDb3BpbG90QXBpU2VydmljZSxcblx0dHlwZSBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcbn0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUFJPWFlfRVJST1JfUFJFRklYLCB0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvciB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2ZvcndhcmRlZENoYXRFcnJvci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVQcm94eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eVNlcnZpY2UuanMnO1xuXG4vKipcbiAqIEFzc2VydHMgYSBgL3YxL21lc3NhZ2VzYCBlcnJvciBlbnZlbG9wZSB3YXMgcmUtZW1pdHRlZCB3aXRoIGFsbCBmaWVsZHNcbiAqIHVuY2hhbmdlZCBleGNlcHQgYGVycm9yLm1lc3NhZ2VgLCB3aGljaCBjYXJyaWVzIHRoZSBvcmlnaW5hbCBtZXNzYWdlIHBsdXMgYW5cbiAqIGFwcGVuZGVkIGBWU0NPREVfUFJPWFlfRVJST1JgIG1hcmtlciB0aGF0IGRlY29kZXMgdG8gYSBmb3J3YXJkZWQgY2hhdCBlcnJvclxuICogb2YgdGhlIGV4cGVjdGVkIGZldGNoIHR5cGUuIChUaGUgYC92MS9tb2RlbHNgIHBhdGggc3RheXMgdmVyYmF0aW0uKVxuICovXG5mdW5jdGlvbiBhc3NlcnRFbnZlbG9wZVdpdGhDaGF0RXJyb3JNYXJrZXIoYWN0dWFsOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSwgb3JpZ2luYWw6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlLCBleHBlY3RlZEZldGNoVHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwudHlwZSwgJ2Vycm9yJyk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwucmVxdWVzdF9pZCwgb3JpZ2luYWwucmVxdWVzdF9pZCk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZXJyb3IudHlwZSwgb3JpZ2luYWwuZXJyb3IudHlwZSk7XG5cdGFzc2VydC5vayhhY3R1YWwuZXJyb3IubWVzc2FnZS5zdGFydHNXaXRoKGAke29yaWdpbmFsLmVycm9yLm1lc3NhZ2V9ICR7UFJPWFlfRVJST1JfUFJFRklYfWApLCBgZXhwZWN0ZWQgbWFya2VyLWFwcGVuZGVkIG1lc3NhZ2UsIGdvdDogJHthY3R1YWwuZXJyb3IubWVzc2FnZX1gKTtcblx0Y29uc3QgZm9yd2FyZGVkID0gdHJ5UGFyc2VGb3J3YXJkZWRDaGF0RXJyb3IoYWN0dWFsLmVycm9yLm1lc3NhZ2UpO1xuXHRhc3NlcnQub2soZm9yd2FyZGVkLCAnZW1iZWRkZWQgbWFya2VyIHNob3VsZCBkZWNvZGUgdG8gYSBmb3J3YXJkZWQgY2hhdCBlcnJvcicpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkLmZldGNoRXJyb3IudHlwZSwgZXhwZWN0ZWRGZXRjaFR5cGUpO1xufVxuXG4vLyAjcmVnaW9uIFRlc3QgZmFrZXNcblxuaW50ZXJmYWNlIElGYWtlQ2FsbCB7XG5cdGdpdGh1YlRva2VuOiBzdHJpbmc7XG5cdGJvZHk6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zO1xuXHRvcHRpb25zOiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElNb2RlbHNDYWxsIHtcblx0Z2l0aHViVG9rZW46IHN0cmluZztcblx0b3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgTWVzc2FnZXNSZXN1bHQgPVxuXHR8IHsga2luZDogJ21lc3NhZ2UnOyBtZXNzYWdlOiBBbnRocm9waWMuTWVzc2FnZSB9XG5cdHwgeyBraW5kOiAnc3RyZWFtJzsgZXZlbnRzOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W107IG1pZFN0cmVhbUVycm9yPzogQ29waWxvdEFwaUVycm9yIHwgRXJyb3IgfVxuXHR8IHsga2luZDogJ2Vycm9yJzsgZXJyb3I6IEVycm9yIH07XG5cbmNsYXNzIEZha2VDb3BpbG90QXBpU2VydmljZSBpbXBsZW1lbnRzIElDb3BpbG90QXBpU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRtZXNzYWdlc1Jlc3VsdDogTWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdlcnJvcicsIGVycm9yOiBuZXcgRXJyb3IoJ25vdCBjb25maWd1cmVkJykgfTtcblx0bW9kZWxzUmVzdWx0OiB7IGtpbmQ6ICd2YWx1ZSc7IHZhbHVlOiBDQ0FNb2RlbFtdIH0gfCB7IGtpbmQ6ICdlcnJvcic7IGVycm9yOiBFcnJvciB9ID0geyBraW5kOiAndmFsdWUnLCB2YWx1ZTogW10gfTtcblxuXHRyZWFkb25seSBtZXNzYWdlc0NhbGxzOiBJRmFrZUNhbGxbXSA9IFtdO1xuXHRyZWFkb25seSBtb2RlbHNDYWxsczogSU1vZGVsc0NhbGxbXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlZCB3aGVuIHRoZSBuZXh0IHN0cmVhbWluZyBjb25zdW1lciByZWFkcyBpdHMgZmlyc3QgZXZlbnQsXG5cdCAqIHVzZWZ1bCBmb3IgdGVzdHMgdGhhdCBuZWVkIHRvIGFzc2VydCBvbiBtaWQtc3RyZWFtIGJlaGF2aW9yLlxuXHQgKi9cblx0b25TdHJlYW1GaXJzdFJlYWQ/OiAoKSA9PiB2b2lkO1xuXG5cdG1lc3NhZ2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50Pjtcblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc05vblN0cmVhbWluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+O1xuXHRtZXNzYWdlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhpcy5tZXNzYWdlc0NhbGxzLnB1c2goeyBnaXRodWJUb2tlbiwgYm9keTogcmVxdWVzdCwgb3B0aW9ucyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1lc3NhZ2VzUmVzdWx0O1xuXHRcdGlmIChyZXF1ZXN0LnN0cmVhbSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0cmVhbUdlbihyZXN1bHQsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdtZXNzYWdlJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXN1bHQubWVzc2FnZSk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHJlc3VsdC5lcnJvcik7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYHN0cmVhbSByZXN1bHQgY29uZmlndXJlZCBidXQgbm9uLXN0cmVhbWluZyByZXF1ZXN0IHJlY2VpdmVkYCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyAqX3N0cmVhbUdlbihcblx0XHRyZXN1bHQ6IE1lc3NhZ2VzUmVzdWx0LFxuXHRcdG9wdGlvbnM6IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHQpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50PiB7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnZXJyb3InKSB7XG5cdFx0XHR0aHJvdyByZXN1bHQuZXJyb3I7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQua2luZCAhPT0gJ3N0cmVhbScpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgbm9uLXN0cmVhbSByZXN1bHQgY29uZmlndXJlZCBidXQgc3RyZWFtaW5nIHJlcXVlc3QgcmVjZWl2ZWRgKTtcblx0XHR9XG5cdFx0bGV0IGZpcnN0UmVhZEZpcmVkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBldiBvZiByZXN1bHQuZXZlbnRzKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uc2lnbmFsPy5hYm9ydGVkKSB7XG5cdFx0XHRcdGNvbnN0IGUgPSBuZXcgRXJyb3IoJ0Fib3J0ZWQnKTtcblx0XHRcdFx0KGUgYXMgeyBuYW1lOiBzdHJpbmcgfSkubmFtZSA9ICdBYm9ydEVycm9yJztcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHRcdGlmICghZmlyc3RSZWFkRmlyZWQpIHtcblx0XHRcdFx0Zmlyc3RSZWFkRmlyZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLm9uU3RyZWFtRmlyc3RSZWFkPy4oKTtcblx0XHRcdH1cblx0XHRcdHlpZWxkIGV2O1xuXHRcdH1cblx0XHRpZiAocmVzdWx0Lm1pZFN0cmVhbUVycm9yKSB7XG5cdFx0XHR0aHJvdyByZXN1bHQubWlkU3RyZWFtRXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY291bnRUb2tlbnMoKTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZVRva2Vuc0NvdW50PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdjb3VudFRva2VucyBub3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRhc3luYyBtb2RlbHMoZ2l0aHViVG9rZW46IHN0cmluZywgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxDQ0FNb2RlbFtdPiB7XG5cdFx0dGhpcy5tb2RlbHNDYWxscy5wdXNoKHsgZ2l0aHViVG9rZW4sIG9wdGlvbnMgfSk7XG5cdFx0aWYgKHRoaXMubW9kZWxzUmVzdWx0LmtpbmQgPT09ICdlcnJvcicpIHtcblx0XHRcdHRocm93IHRoaXMubW9kZWxzUmVzdWx0LmVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tb2RlbHNSZXN1bHQudmFsdWU7XG5cdH1cblxuXHRhc3luYyByZXNwb25zZXMoKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcigncmVzcG9uc2VzIG5vdCB1c2VkIGJ5IENsYXVkZSBwcm94eSB0ZXN0cycpO1xuXHR9XG5cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKCk6IFByb21pc2U8bmV2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3V0aWxpdHlDaGF0Q29tcGxldGlvbiBub3QgdXNlZCBieSBDbGF1ZGUgcHJveHkgdGVzdHMnKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSFRUUCBoZWxwZXJzXG5cbmxldCBfaHR0cE1vZHVsZTogdHlwZW9mIGh0dHAgfCB1bmRlZmluZWQ7XG5hc3luYyBmdW5jdGlvbiBnZXRIdHRwKCk6IFByb21pc2U8dHlwZW9mIGh0dHA+IHtcblx0aWYgKCFfaHR0cE1vZHVsZSkge1xuXHRcdF9odHRwTW9kdWxlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdH1cblx0cmV0dXJuIF9odHRwTW9kdWxlO1xufVxuXG5pbnRlcmZhY2UgSUZldGNoZWRKc29uIHtcblx0c3RhdHVzOiBudW1iZXI7XG5cdGhlYWRlcnM6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycztcblx0Ym9keTogc3RyaW5nO1xuXHRwYXJzZWQ6IHVua25vd247XG59XG5cbmZ1bmN0aW9uIGZldGNoSnNvbih1cmw6IHN0cmluZywgaW5pdD86IHsgbWV0aG9kPzogc3RyaW5nOyBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keT86IHN0cmluZyB9KTogUHJvbWlzZTxJRmV0Y2hlZEpzb24+IHtcblx0cmV0dXJuIGdldEh0dHAoKS50aGVuKGh0dHBNb2QgPT4gbmV3IFByb21pc2U8SUZldGNoZWRKc29uPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCByZXEgPSBodHRwTW9kLnJlcXVlc3Qoe1xuXHRcdFx0aG9zdG5hbWU6IHUuaG9zdG5hbWUsXG5cdFx0XHRwb3J0OiB1LnBvcnQsXG5cdFx0XHRwYXRoOiB1LnBhdGhuYW1lICsgdS5zZWFyY2gsXG5cdFx0XHRtZXRob2Q6IGluaXQ/Lm1ldGhvZCA/PyAnR0VUJyxcblx0XHRcdGhlYWRlcnM6IGluaXQ/LmhlYWRlcnMsXG5cdFx0fSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goQnVmZmVyLmlzQnVmZmVyKGMpID8gYyA6IEJ1ZmZlci5mcm9tKGMpKSk7XG5cdFx0XHRyZXMub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0XHRsZXQgcGFyc2VkOiB1bmtub3duO1xuXHRcdFx0XHR0cnkgeyBwYXJzZWQgPSBib2R5ID8gSlNPTi5wYXJzZShib2R5KSA6IHVuZGVmaW5lZDsgfSBjYXRjaCB7IHBhcnNlZCA9IHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRyZXNvbHZlKHsgc3RhdHVzOiByZXMuc3RhdHVzQ29kZSA/PyAwLCBoZWFkZXJzOiByZXMuaGVhZGVycywgYm9keSwgcGFyc2VkIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRpZiAoaW5pdD8uYm9keSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXEud3JpdGUoaW5pdC5ib2R5KTtcblx0XHR9XG5cdFx0cmVxLmVuZCgpO1xuXHR9KSk7XG59XG5cbmludGVyZmFjZSBJU3NlUmVzdWx0IHtcblx0c3RhdHVzOiBudW1iZXI7XG5cdGhlYWRlcnM6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycztcblx0cmF3Qm9keTogc3RyaW5nO1xuXHRldmVudHM6IHsgdHlwZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXTtcbn1cblxuZnVuY3Rpb24gZmV0Y2hTc2UoXG5cdHVybDogc3RyaW5nLFxuXHRpbml0OiB7IG1ldGhvZDogc3RyaW5nOyBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keT86IHN0cmluZyB9LFxuXHRvblJlc3BvbnNlPzogKHJlczogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIGFib3J0OiAoKSA9PiB2b2lkKSA9PiB2b2lkLFxuKTogUHJvbWlzZTxJU3NlUmVzdWx0PiB7XG5cdHJldHVybiBnZXRIdHRwKCkudGhlbihodHRwTW9kID0+IG5ldyBQcm9taXNlPElTc2VSZXN1bHQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCB1ID0gbmV3IFVSTCh1cmwpO1xuXHRcdGNvbnN0IHJlcSA9IGh0dHBNb2QucmVxdWVzdCh7XG5cdFx0XHRob3N0bmFtZTogdS5ob3N0bmFtZSxcblx0XHRcdHBvcnQ6IHUucG9ydCxcblx0XHRcdHBhdGg6IHUucGF0aG5hbWUgKyB1LnNlYXJjaCxcblx0XHRcdG1ldGhvZDogaW5pdC5tZXRob2QsXG5cdFx0XHRoZWFkZXJzOiBpbml0LmhlYWRlcnMsXG5cdFx0fSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goQnVmZmVyLmlzQnVmZmVyKGMpID8gYyA6IEJ1ZmZlci5mcm9tKGMpKSk7XG5cdFx0XHRyZXMub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmF3Qm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRzdGF0dXM6IHJlcy5zdGF0dXNDb2RlID8/IDAsXG5cdFx0XHRcdFx0aGVhZGVyczogcmVzLmhlYWRlcnMsXG5cdFx0XHRcdFx0cmF3Qm9keSxcblx0XHRcdFx0XHRldmVudHM6IHBhcnNlU3NlRnJhbWVzKHJhd0JvZHkpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRvblJlc3BvbnNlPy4ocmVzLCAoKSA9PiByZXEuZGVzdHJveSgpKTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdC8vIEFib3J0ZWQgcmVxdWVzdHMgcmVqZWN0IG5hdHVyYWxseSBcdTIwMTQgc3VyZmFjZSBhcyByZXNvbHV0aW9uXG5cdFx0XHQvLyB3aXRoIHdoYXRldmVyIHdlIGdvdCByYXRoZXIgdGhhbiBmYWlsaW5nIHRoZSB0ZXN0LlxuXHRcdFx0cmVqZWN0KGVycik7XG5cdFx0fSk7XG5cdFx0aWYgKGluaXQuYm9keSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXEud3JpdGUoaW5pdC5ib2R5KTtcblx0XHR9XG5cdFx0cmVxLmVuZCgpO1xuXHR9KSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlU3NlRnJhbWVzKHJhdzogc3RyaW5nKTogeyB0eXBlOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdIHtcblx0Y29uc3Qgb3V0OiB7IHR5cGU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W10gPSBbXTtcblx0Y29uc3QgYmxvY2tzID0gcmF3LnNwbGl0KCdcXG5cXG4nKTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBibG9ja3MpIHtcblx0XHRpZiAoIWJsb2NrLnRyaW0oKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGxldCBldmVudCA9ICcnO1xuXHRcdGxldCBkYXRhID0gJyc7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGJsb2NrLnNwbGl0KCdcXG4nKSkge1xuXHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnZXZlbnQ6ICcpKSB7XG5cdFx0XHRcdGV2ZW50ID0gbGluZS5zbGljZSgnZXZlbnQ6ICcubGVuZ3RoKS50cmltKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnZGF0YTogJykpIHtcblx0XHRcdFx0ZGF0YSA9IGxpbmUuc2xpY2UoJ2RhdGE6ICcubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGV2ZW50ICYmIGRhdGEpIHtcblx0XHRcdGxldCBwYXJzZWQ6IHVua25vd247XG5cdFx0XHR0cnkgeyBwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpOyB9IGNhdGNoIHsgcGFyc2VkID0gZGF0YTsgfVxuXHRcdFx0b3V0LnB1c2goeyB0eXBlOiBldmVudCwgZGF0YTogcGFyc2VkIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gRml4dHVyZXNcblxuY29uc3QgQU5USFJPUElDX01PREVMOiBDQ0FNb2RlbCA9IHtcblx0aWQ6ICdjbGF1ZGUtb3B1cy00LjYnLFxuXHRuYW1lOiAnQ2xhdWRlIE9wdXMgNC42Jyxcblx0dmVuZG9yOiAnQW50aHJvcGljJyxcblx0c3VwcG9ydGVkX2VuZHBvaW50czogWycvdjEvbWVzc2FnZXMnXSxcblx0b2JqZWN0OiAnbW9kZWwnLFxuXHR2ZXJzaW9uOiAnNC42Jyxcblx0aXNfY2hhdF9kZWZhdWx0OiBmYWxzZSxcblx0aXNfY2hhdF9mYWxsYmFjazogZmFsc2UsXG5cdG1vZGVsX3BpY2tlcl9jYXRlZ29yeTogJycsXG5cdG1vZGVsX3BpY2tlcl9lbmFibGVkOiB0cnVlLFxuXHRwcmV2aWV3OiBmYWxzZSxcblx0YmlsbGluZzogeyBpc19wcmVtaXVtOiBmYWxzZSB9IGFzIHVua25vd24gYXMgQ0NBTW9kZWxbJ2JpbGxpbmcnXSxcblx0Y2FwYWJpbGl0aWVzOiB7fSBhcyBDQ0FNb2RlbFsnY2FwYWJpbGl0aWVzJ10sXG5cdHBvbGljeToge30gYXMgQ0NBTW9kZWxbJ3BvbGljeSddLFxufTtcblxuY29uc3QgTk9OX0FOVEhST1BJQ19NT0RFTDogQ0NBTW9kZWwgPSB7XG5cdC4uLkFOVEhST1BJQ19NT0RFTCxcblx0aWQ6ICdncHQtNScsXG5cdG5hbWU6ICdHUFQtNScsXG5cdHZlbmRvcjogJ09wZW5BSScsXG5cdHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3YxL2NoYXQvY29tcGxldGlvbnMnXSxcbn07XG5cbmNvbnN0IE5PTl9NRVNTQUdFU19BTlRIUk9QSUM6IENDQU1vZGVsID0ge1xuXHQuLi5BTlRIUk9QSUNfTU9ERUwsXG5cdGlkOiAnY2xhdWRlLWluc3RhbnQtdG9rZW5pemVyJyxcblx0bmFtZTogJ0FudGhyb3BpYyBUb2tlbml6ZXInLFxuXHRzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy92MS90b2tlbml6ZSddLFxufTtcblxuZnVuY3Rpb24gbWFrZU1lc3NhZ2UobW9kZWw6IHN0cmluZywgdGV4dDogc3RyaW5nKTogQW50aHJvcGljLk1lc3NhZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnbXNnX3Rlc3QnLFxuXHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRyb2xlOiAnYXNzaXN0YW50Jyxcblx0XHRtb2RlbCxcblx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQsIGNpdGF0aW9uczogbnVsbCB9XSxcblx0XHRzdG9wX3JlYXNvbjogJ2VuZF90dXJuJyxcblx0XHRzdG9wX3NlcXVlbmNlOiBudWxsLFxuXHRcdHVzYWdlOiB7XG5cdFx0XHRpbnB1dF90b2tlbnM6IDEsXG5cdFx0XHRvdXRwdXRfdG9rZW5zOiAxLFxuXHRcdFx0Y2FjaGVfY3JlYXRpb25faW5wdXRfdG9rZW5zOiBudWxsLFxuXHRcdFx0Y2FjaGVfcmVhZF9pbnB1dF90b2tlbnM6IG51bGwsXG5cdFx0XHRzZXJ2ZXJfdG9vbF91c2U6IG51bGwsXG5cdFx0XHRzZXJ2aWNlX3RpZXI6IG51bGwsXG5cdFx0fSxcblx0fSBhcyBBbnRocm9waWMuTWVzc2FnZTtcbn1cblxuZnVuY3Rpb24gbWFrZVN0cmVhbUV2ZW50cyhtb2RlbDogc3RyaW5nKTogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdIHtcblx0Y29uc3QgbWVzc2FnZSA9IG1ha2VNZXNzYWdlKG1vZGVsLCAnJyk7XG5cdHJldHVybiBbXG5cdFx0eyB0eXBlOiAnbWVzc2FnZV9zdGFydCcsIG1lc3NhZ2UgfSxcblx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0YXJ0JywgaW5kZXg6IDAsIGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnJywgY2l0YXRpb25zOiBbXSB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXg6IDAsIGRlbHRhOiB7IHR5cGU6ICd0ZXh0X2RlbHRhJywgdGV4dDogJ2hlbGxvJyB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0b3AnLCBpbmRleDogMCB9LFxuXHRcdHsgdHlwZTogJ21lc3NhZ2VfZGVsdGEnLCBkZWx0YTogeyBzdG9wX3JlYXNvbjogJ2VuZF90dXJuJywgc3RvcF9zZXF1ZW5jZTogbnVsbCB9LCB1c2FnZTogeyBpbnB1dF90b2tlbnM6IDEsIG91dHB1dF90b2tlbnM6IDEsIGNhY2hlX2NyZWF0aW9uX2lucHV0X3Rva2VuczogbnVsbCwgY2FjaGVfcmVhZF9pbnB1dF90b2tlbnM6IG51bGwsIHNlcnZlcl90b29sX3VzZTogbnVsbCB9IGFzIEFudGhyb3BpYy5NZXNzYWdlRGVsdGFVc2FnZSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0eyB0eXBlOiAnbWVzc2FnZV9zdG9wJyB9LFxuXHRdO1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gU2VydmljZSBidWlsZGVyXG5cbmZ1bmN0aW9uIGNyZWF0ZVByb3h5U2VydmljZShmYWtlQXBpOiBGYWtlQ29waWxvdEFwaVNlcnZpY2UpOiBDbGF1ZGVQcm94eVNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmFrZUFwaSk7XG59XG5cbmNvbnN0IFRPS0VOID0gJ2doLXRlc3QtdG9rZW4nO1xuXG4vLyAjZW5kcmVnaW9uXG5cbnN1aXRlKCdDbGF1ZGVQcm94eVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gI3JlZ2lvbiBUb2tlbiBzbG90XG5cblx0c3VpdGUoJ1Rva2VuIHNsb3QnLCAoKSA9PiB7XG5cblx0XHQvLyBCYXNlIGxpZmVjeWNsZS9iaW5kIGJlaGF2aW9yIChub25jZSArIGxvb3BiYWNrIGJpbmQsIHJlZmNvdW50ZWRcblx0XHQvLyBoYW5kbGVzLCBkaXNwb3NlL3JlYmluZCwgZGlzcG9zZS1kdXJpbmctYmluZCkgaXMgY292ZXJlZCBieVxuXHRcdC8vIGxvb3BiYWNrUHJveHlTZXJ2ZXIudGVzdC50cy4gVGhpcyBzdWl0ZSBvbmx5IGNvdmVycyBDbGF1ZGUnc1xuXHRcdC8vIGBzdGFydCgpYCBvdmVycmlkZSB0aGF0IHdpcmVzIHRoZSBHaXRIdWIgdG9rZW4gaW50byBvdXRib3VuZCBjYWxscy5cblx0XHR0ZXN0KCdzdGFydCgpIHVwZGF0ZXMgdG9rZW4gc2xvdCBsYXN0LXdyaXRlci13aW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubW9kZWxzUmVzdWx0ID0geyBraW5kOiAndmFsdWUnLCB2YWx1ZTogW10gfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoMSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoJ3Rva2VuLUEnKTtcblx0XHRcdGNvbnN0IGgyID0gYXdhaXQgc2VydmljZS5zdGFydCgndG9rZW4tQicpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hKc29uKGAke2gyLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2gyLm5vbmNlfS5zMWAgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLm1vZGVsc0NhbGxzLmF0KC0xKT8uZ2l0aHViVG9rZW4sICd0b2tlbi1CJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMS5kaXNwb3NlKCk7XG5cdFx0XHRcdGgyLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBBdXRoXG5cblx0c3VpdGUoJ0F1dGgnLCAoKSA9PiB7XG5cblx0XHRhc3luYyBmdW5jdGlvbiB3aXRoUHJveHk8VD4oZm46IChoYW5kbGU6IHsgYmFzZVVybDogc3RyaW5nOyBub25jZTogc3RyaW5nIH0sIGZha2U6IEZha2VDb3BpbG90QXBpU2VydmljZSkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubW9kZWxzUmVzdWx0ID0geyBraW5kOiAndmFsdWUnLCB2YWx1ZTogW0FOVEhST1BJQ19NT0RFTF0gfTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICdoaScpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgZm4oaGFuZGxlLCBmYWtlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ21pc3NpbmcgQXV0aG9yaXphdGlvbiBoZWFkZXIgXHUyMTkyIDQwMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyBoYW5kbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXMucGFyc2VkLCB7XG5cdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0XHRlcnJvcjogeyB0eXBlOiAnYXV0aGVudGljYXRpb25fZXJyb3InLCBtZXNzYWdlOiAnSW52YWxpZCBhdXRoZW50aWNhdGlvbicgfSxcblx0XHRcdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQmVhcmVyIHdyb25nLW5vbmNlLnggXHUyMTkyIDQwMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyBoYW5kbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB3cm9uZy1ub25jZS5zZXNzaW9uJyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0JlYXJlciA8bm9uY2U+IChubyBkb3QpIFx1MjE5MiA0MDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9YCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0JlYXJlciA8bm9uY2U+LiAoZW1wdHkgc2Vzc2lvbklkKSBcdTIxOTIgNDAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIGhhbmRsZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5gIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgneC1hcGkta2V5IGFsb25lIFx1MjE5MiA0MDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAneC1hcGkta2V5JzogaGFuZGxlLm5vbmNlIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQmVhcmVyIDxub25jZT4uPHNlc3Npb25JZD4gXHUyMTkyIHJlcXVlc3QgcHJvY2VlZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgKGhhbmRsZSwgZmFrZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2Vzc2lvbi1hYmNgIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UubW9kZWxzQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0aC1maXJzdCBwcmVjZWRlbmNlOiBHRVQgL3YxL21vZGVscyB3aXRoIGJhZCBhdXRoIGRvZXMgbm90IHJlYWNoIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIChoYW5kbGUsIGZha2UpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6ICdCZWFyZXIgd3JvbmcucycgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tb2RlbHNDYWxscy5sZW5ndGgsIDApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRoLWZpcnN0IHByZWNlZGVuY2U6IFBPU1QgL3YxL21lc3NhZ2VzIHdpdGggYmFkIGF1dGggZG9lcyBub3QgcmVhY2ggdXBzdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgKGhhbmRsZSwgZmFrZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB3cm9uZy5zJyxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLm1lc3NhZ2VzQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0aC1maXJzdCBwcmVjZWRlbmNlOiBQT1NUIC92MS9tZXNzYWdlcy9jb3VudF90b2tlbnMgd2l0aCBiYWQgYXV0aCBcdTIxOTIgNDAxIChub3QgNTAxKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyBoYW5kbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzL2NvdW50X3Rva2Vuc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogJ0JlYXJlciB3cm9uZy5zJyB9LFxuXHRcdFx0XHRcdGJvZHk6ICd7fScsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBSb3V0ZXNcblxuXHRzdWl0ZSgnUm91dGVzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnR0VUIC8gXHUyMTkyIDIwMCBvaywgbm8gYXV0aCByZXF1aXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCAnb2snKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUE9TVCAvdjEvbWVzc2FnZXMvY291bnRfdG9rZW5zIFx1MjE5MiA1MDEgYXBpX2Vycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXMvY291bnRfdG9rZW5zYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCB9LFxuXHRcdFx0XHRcdGJvZHk6ICd7fScsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNTAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXMucGFyc2VkLCB7XG5cdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0XHRlcnJvcjogeyB0eXBlOiAnYXBpX2Vycm9yJywgbWVzc2FnZTogJ2NvdW50X3Rva2VucyBub3Qgc3VwcG9ydGVkIGJ5IENBUEknIH0sXG5cdFx0XHRcdFx0cmVxdWVzdF9pZDogbnVsbCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0dFVCAvc29tZXRoaW5nLWVsc2UgXHUyMTkyIDQwNCBub3RfZm91bmRfZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92Mi93aGF0ZXZlcmAsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDQpO1xuXHRcdFx0XHRjb25zdCBlbnYgPSByZXMucGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LnR5cGUsICdlcnJvcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLnR5cGUsICdub3RfZm91bmRfZXJyb3InKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBNb2RlbHMgcm91dGVcblxuXHRzdWl0ZSgnR0VUIC92MS9tb2RlbHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIFBhZ2UgZW52ZWxvcGUgd2l0aCBTREstZm9ybWF0IElEcyBhbmQgZmlsdGVycyBieSB2ZW5kb3IgKyBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1vZGVsc1Jlc3VsdCA9IHsga2luZDogJ3ZhbHVlJywgdmFsdWU6IFtBTlRIUk9QSUNfTU9ERUwsIE5PTl9BTlRIUk9QSUNfTU9ERUwsIE5PTl9NRVNTQUdFU19BTlRIUk9QSUNdIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCAyMDApO1xuXHRcdFx0XHRjb25zdCBib2R5ID0gcmVzLnBhcnNlZCBhcyB7IGRhdGE6IEFudGhyb3BpYy5Nb2RlbEluZm9bXTsgaGFzX21vcmU6IGJvb2xlYW47IGZpcnN0X2lkOiBzdHJpbmcgfCBudWxsOyBsYXN0X2lkOiBzdHJpbmcgfCBudWxsIH07XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYm9keSwge1xuXHRcdFx0XHRcdGRhdGE6IFt7XG5cdFx0XHRcdFx0XHRpZDogJ2NsYXVkZS1vcHVzLTQtNicsXG5cdFx0XHRcdFx0XHR0eXBlOiAnbW9kZWwnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheV9uYW1lOiAnQ2xhdWRlIE9wdXMgNC42Jyxcblx0XHRcdFx0XHRcdGNyZWF0ZWRfYXQ6ICcxOTcwLTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IG51bGwsXG5cdFx0XHRcdFx0XHRtYXhfaW5wdXRfdG9rZW5zOiBudWxsLFxuXHRcdFx0XHRcdFx0bWF4X3Rva2VuczogbnVsbCxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRoYXNfbW9yZTogZmFsc2UsXG5cdFx0XHRcdFx0Zmlyc3RfaWQ6ICdjbGF1ZGUtb3B1cy00LTYnLFxuXHRcdFx0XHRcdGxhc3RfaWQ6ICdjbGF1ZGUtb3B1cy00LTYnLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBzdHJlYW0gQ29waWxvdEFwaUVycm9yIGlzIHJlLWVtaXR0ZWQgdmVyYmF0aW0gd2l0aCBvcmlnaW5hbCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZW52ZWxvcGU6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlID0ge1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRlcnJvcjogeyB0eXBlOiAncmF0ZV9saW1pdF9lcnJvcicsIG1lc3NhZ2U6ICdzbG93IGRvd24nIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXFfMTIzJyxcblx0XHRcdH07XG5cdFx0XHRmYWtlLm1vZGVsc1Jlc3VsdCA9IHsga2luZDogJ2Vycm9yJywgZXJyb3I6IG5ldyBDb3BpbG90QXBpRXJyb3IoNDI5LCBlbnZlbG9wZSkgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQyOSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwgZW52ZWxvcGUpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub24tQ29waWxvdEFwaUVycm9yIFx1MjE5MiA1MDIgYXBpX2Vycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubW9kZWxzUmVzdWx0ID0geyBraW5kOiAnZXJyb3InLCBlcnJvcjogbmV3IEVycm9yKCdFQ09OTlJFU0VUJykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDUwMik7XG5cdFx0XHRcdGNvbnN0IGVudiA9IHJlcy5wYXJzZWQgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2U7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuZXJyb3IudHlwZSwgJ2FwaV9lcnJvcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLm1lc3NhZ2UsICdFQ09OTlJFU0VUJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTWVzc2FnZXMgXHUyMDE0IG1vZGVsIHRyYW5zbGF0aW9uXG5cblx0c3VpdGUoJ1BPU1QgL3YxL21lc3NhZ2VzIG1vZGVsIHRyYW5zbGF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnU0RLIElEIGluYm91bmQgaXMgdHJhbnNsYXRlZCB0byBlbmRwb2ludCBJRCB1cHN0cmVhbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnbWVzc2FnZScsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnaGknKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYtMjAyNTExMDEnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDggfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tZXNzYWdlc0NhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLm1lc3NhZ2VzQ2FsbHNbMF0uYm9keS5tb2RlbCwgJ2NsYXVkZS1vcHVzLTQuNicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbmRwb2ludCBJRCBpbmJvdW5kIGlzIGFsc28gYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ21lc3NhZ2UnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJ2hpJykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC42JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UubWVzc2FnZXNDYWxsc1swXS5ib2R5Lm1vZGVsLCAnY2xhdWRlLW9wdXMtNC42Jyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VucGFyc2VhYmxlIG1vZGVsIFx1MjE5MiA0MDQgd2l0aCBubyB1cHN0cmVhbSBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnZ3B0LTRvJywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwNCk7XG5cdFx0XHRcdGNvbnN0IGVudiA9IHJlcy5wYXJzZWQgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2U7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuZXJyb3IudHlwZSwgJ25vdF9mb3VuZF9lcnJvcicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tZXNzYWdlc0NhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1zdHJlYW1pbmcgcmVzcG9uc2UgbW9kZWwgaXMgcmV3cml0dGVuIHRvIFNESyBmb3JtYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ21lc3NhZ2UnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJ2hpJykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGNvbnN0IG1zZyA9IHJlcy5wYXJzZWQgYXMgQW50aHJvcGljLk1lc3NhZ2U7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtc2cubW9kZWwsICdjbGF1ZGUtb3B1cy00LTYnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBDcmVkaXRzIHJlcG9ydGluZ1xuXG5cdHN1aXRlKCdDcmVkaXRzIHJlcG9ydGluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N0cmVhbWluZzogY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdSBmaXJlcyBvbkRpZFJlcG9ydENyZWRpdHMgd2l0aCB0aGUgc2Vzc2lvbiBpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBldmVudHMgPSBtYWtlU3RyZWFtRXZlbnRzKCdjbGF1ZGUtb3B1cy00LjYnKTtcblx0XHRcdC8vIEF0dGFjaCBDQVBJIGJpbGxpbmcgdG8gdGhlIG1lc3NhZ2VfZGVsdGEsIG1pcnJvcmluZyB0aGUgcmVhbFxuXHRcdFx0Ly8gYC92MS9tZXNzYWdlc2AgU1NFIHNoYXBlICh0aGUgcHVibGlzaGVkIEFudGhyb3BpYyB0eXBlcyBkb24ndFxuXHRcdFx0Ly8gZGVjbGFyZSBgY29waWxvdF91c2FnZWApLlxuXHRcdFx0Y29uc3QgZGVsdGEgPSBldmVudHMuZmluZChlID0+IGUudHlwZSA9PT0gJ21lc3NhZ2VfZGVsdGEnKSE7XG5cdFx0XHQoZGVsdGEgYXMgdW5rbm93biBhcyB7IGNvcGlsb3RfdXNhZ2U6IHsgdG90YWxfbmFub19haXU6IG51bWJlciB9IH0pLmNvcGlsb3RfdXNhZ2UgPSB7IHRvdGFsX25hbm9fYWl1OiA3NTBfMDAwXzAwMCB9O1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ3N0cmVhbScsIGV2ZW50cyB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IHJlcG9ydHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IHRvdGFsTmFub0FpdTogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3ViID0gc2VydmljZS5vbkRpZFJlcG9ydENyZWRpdHMoZSA9PiByZXBvcnRzLnB1c2goZSkpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zZXNzLTQyYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcG9ydHMsIFt7IHNlc3Npb25JZDogJ3Nlc3MtNDInLCB0b3RhbE5hbm9BaXU6IDc1MF8wMDBfMDAwIH1dKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLXN0cmVhbWluZzogY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdSBmaXJlcyBvbkRpZFJlcG9ydENyZWRpdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnaGknKTtcblx0XHRcdChtZXNzYWdlIGFzIHVua25vd24gYXMgeyBjb3BpbG90X3VzYWdlOiB7IHRvdGFsX25hbm9fYWl1OiBudW1iZXIgfSB9KS5jb3BpbG90X3VzYWdlID0geyB0b3RhbF9uYW5vX2FpdTogMjUwXzAwMF8wMDAgfTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IHJlcG9ydHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IHRvdGFsTmFub0FpdTogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3ViID0gc2VydmljZS5vbkRpZFJlcG9ydENyZWRpdHMoZSA9PiByZXBvcnRzLnB1c2goZSkpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2Vzcy03YCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBvcnRzLCBbeyBzZXNzaW9uSWQ6ICdzZXNzLTcnLCB0b3RhbE5hbm9BaXU6IDI1MF8wMDBfMDAwIH1dKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gY29waWxvdF91c2FnZSBpbiB0aGUgcmVzcG9uc2UgXHUyMTkyIG5vIGNyZWRpdHMgcmVwb3J0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICdoaScpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgcmVwb3J0czogeyBzZXNzaW9uSWQ6IHN0cmluZzsgdG90YWxOYW5vQWl1OiBudW1iZXIgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdWIgPSBzZXJ2aWNlLm9uRGlkUmVwb3J0Q3JlZGl0cyhlID0+IHJlcG9ydHMucHVzaChlKSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zZXNzLTlgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDggfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcG9ydHMsIFtdKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBCb2R5IHZhbGlkYXRpb25cblxuXHRzdWl0ZSgnQm9keSB2YWxpZGF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbm9uLUpTT04gYm9keSBcdTIxOTIgNDAwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiAnbm90LWpzb24nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMCk7XG5cdFx0XHRcdGNvbnN0IGVudiA9IHJlcy5wYXJzZWQgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2U7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuZXJyb3IudHlwZSwgJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaXNzaW5nIG1vZGVsIGZpZWxkIFx1MjE5MiA0MDAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pc3NpbmcgbWVzc2FnZXMgZmllbGQgXHUyMTkyIDQwMCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1heF90b2tlbnM6IDggfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAwKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBIZWFkZXIgcGFzc3Rocm91Z2hcblxuXHRzdWl0ZSgnSGVhZGVyIHBhc3N0aHJvdWdoJywgKCkgPT4ge1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gcG9zdEFuZENhcHR1cmVIZWFkZXJzKGJldGE6IHN0cmluZyB8IHVuZGVmaW5lZCwgdmVyc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ21lc3NhZ2UnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJ2hpJykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCd4LXJlcXVlc3QtaWQnOiAnY2FsbGVyLXJpZC0xMjMnLFxuXHRcdFx0XHQneC1jdXN0b20tdGhpbmcnOiAnc2hvdWxkLWRyb3AnLFxuXHRcdFx0fTtcblx0XHRcdGlmIChiZXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aGVhZGVyc1snYW50aHJvcGljLWJldGEnXSA9IGJldGE7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmVyc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGhlYWRlcnNbJ2FudGhyb3BpYy12ZXJzaW9uJ10gPSB2ZXJzaW9uO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDggfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gZmFrZS5tZXNzYWdlc0NhbGxzWzBdLm9wdGlvbnM/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ2ZvcndhcmRzIGFudGhyb3BpYy12ZXJzaW9uIHZlcmJhdGltJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycyh1bmRlZmluZWQsICcyMDIzLTA2LTAxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycz8uWydhbnRocm9waWMtdmVyc2lvbiddLCAnMjAyMy0wNi0wMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgc3VwcG9ydGVkIGFudGhyb3BpYy1iZXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycygnaW50ZXJsZWF2ZWQtdGhpbmtpbmctMjAyNS0wNS0xNCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycz8uWydhbnRocm9waWMtYmV0YSddLCAnaW50ZXJsZWF2ZWQtdGhpbmtpbmctMjAyNS0wNS0xNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBvdXQgdW5zdXBwb3J0ZWQgYmV0YXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gYXdhaXQgcG9zdEFuZENhcHR1cmVIZWFkZXJzKCdmb28sYmFyLGJheicsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVycz8uWydhbnRocm9waWMtYmV0YSddLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgc3VwcG9ydGVkIGZhbWlseSB3aXRob3V0IGRhdGUgc3VmZml4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycygnaW50ZXJsZWF2ZWQtdGhpbmtpbmcnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnM/LlsnYW50aHJvcGljLWJldGEnXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21peGVkIGJldGEgbGlzdCBrZWVwcyBzdXBwb3J0ZWQgZW50cmllcyBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycygnaW50ZXJsZWF2ZWQtdGhpbmtpbmctMjAyNS0wNS0xNCxmb28nLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnM/LlsnYW50aHJvcGljLWJldGEnXSwgJ2ludGVybGVhdmVkLXRoaW5raW5nLTIwMjUtMDUtMTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIHgtcmVxdWVzdC1pZCBhbmQgYXJiaXRyYXJ5IGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gYXdhaXQgcG9zdEFuZENhcHR1cmVIZWFkZXJzKCdpbnRlcmxlYXZlZC10aGlua2luZy0yMDI1LTA1LTE0JywgJzIwMjMtMDYtMDEnKSA/PyB7fTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoaGVhZGVycykuc29ydCgpLCBbJ2FudGhyb3BpYy1iZXRhJywgJ2FudGhyb3BpYy12ZXJzaW9uJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTdHJlYW1pbmdcblxuXHRzdWl0ZSgnU3RyZWFtaW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZW1pdHMgU1NFIGZyYW1lcyBpbiBvcmRlciB3aXRoIGhhbmQtcm9sbGVkIGZyYW1pbmcgYW5kIHJld3JpdGVzIG1lc3NhZ2Vfc3RhcnQubWVzc2FnZS5tb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnc3RyZWFtJywgZXZlbnRzOiBtYWtlU3RyZWFtRXZlbnRzKCdjbGF1ZGUtb3B1cy00LjYnKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuaGVhZGVyc1snY29udGVudC10eXBlJ10sICd0ZXh0L2V2ZW50LXN0cmVhbScpO1xuXHRcdFx0XHRjb25zdCB0eXBlcyA9IHJlcy5ldmVudHMubWFwKGUgPT4gZS50eXBlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0eXBlcywgW1xuXHRcdFx0XHRcdCdtZXNzYWdlX3N0YXJ0Jyxcblx0XHRcdFx0XHQnY29udGVudF9ibG9ja19zdGFydCcsXG5cdFx0XHRcdFx0J2NvbnRlbnRfYmxvY2tfZGVsdGEnLFxuXHRcdFx0XHRcdCdjb250ZW50X2Jsb2NrX3N0b3AnLFxuXHRcdFx0XHRcdCdtZXNzYWdlX2RlbHRhJyxcblx0XHRcdFx0XHQnbWVzc2FnZV9zdG9wJyxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gcmVzLmV2ZW50c1swXS5kYXRhIGFzIHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnOyBtZXNzYWdlOiB7IG1vZGVsOiBzdHJpbmcgfSB9O1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQubWVzc2FnZS5tb2RlbCwgJ2NsYXVkZS1vcHVzLTQtNicpO1xuXHRcdFx0XHRhc3NlcnQub2soIXJlcy5yYXdCb2R5LmluY2x1ZGVzKCdbRE9ORV0nKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZC1zdHJlYW0gQ29waWxvdEFwaUVycm9yIFx1MjE5MiBTU0UgZXJyb3IgZnJhbWUsIHRoZW4gZW5kLCBubyBtZXNzYWdlX3N0b3AgYWZ0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W10gPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJycpIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLCBpbmRleDogMCwgY29udGVudF9ibG9jazogeyB0eXBlOiAndGV4dCcsIHRleHQ6ICcnLCBjaXRhdGlvbnM6IFtdIH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHVwc3RyZWFtRW52ZWxvcGU6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlID0ge1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRlcnJvcjogeyB0eXBlOiAncmF0ZV9saW1pdF9lcnJvcicsIG1lc3NhZ2U6ICdzbG93IGRvd24nIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXFfeHl6Jyxcblx0XHRcdH07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0ge1xuXHRcdFx0XHRraW5kOiAnc3RyZWFtJyxcblx0XHRcdFx0ZXZlbnRzLFxuXHRcdFx0XHRtaWRTdHJlYW1FcnJvcjogbmV3IENvcGlsb3RBcGlFcnJvcihDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLCB1cHN0cmVhbUVudmVsb3BlKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0Y29uc3QgbGFzdEV2ZW50ID0gcmVzLmV2ZW50cy5hdCgtMSk7XG5cdFx0XHRcdGFzc2VydC5vayhsYXN0RXZlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEV2ZW50LnR5cGUsICdlcnJvcicpO1xuXHRcdFx0XHRhc3NlcnRFbnZlbG9wZVdpdGhDaGF0RXJyb3JNYXJrZXIobGFzdEV2ZW50LmRhdGEgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2UsIHVwc3RyZWFtRW52ZWxvcGUsICdmYWlsZWQnKTtcblx0XHRcdFx0Y29uc3QgdHlwZXMgPSByZXMuZXZlbnRzLm1hcChlID0+IGUudHlwZSk7XG5cdFx0XHRcdGFzc2VydC5vayghdHlwZXMuaW5jbHVkZXMoJ21lc3NhZ2Vfc3RvcCcpLCAnbm8gbWVzc2FnZV9zdG9wIGFmdGVyIGVycm9yIGZyYW1lJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZS1zdHJlYW0gQ29waWxvdEFwaUVycm9yIFx1MjE5MiBKU09OIGVycm9yIHJlc3BvbnNlIHdpdGggb3JpZ2luYWwgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2F1dGhlbnRpY2F0aW9uX2Vycm9yJywgbWVzc2FnZTogJ3Rva2VuIGV4cGlyZWQnIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXFfcHJlJyxcblx0XHRcdH07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnZXJyb3InLCBlcnJvcjogbmV3IENvcGlsb3RBcGlFcnJvcig0MDEsIGVudmVsb3BlKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDgsIHN0cmVhbTogdHJ1ZSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDEpO1xuXHRcdFx0XHRhc3NlcnRFbnZlbG9wZVdpdGhDaGF0RXJyb3JNYXJrZXIocmVzLnBhcnNlZCBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZSwgZW52ZWxvcGUsICdhZ2VudF91bmF1dGhvcml6ZWQnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlLXN0cmVhbSBDb3BpbG90QXBpRXJyb3Igd2l0aCBzdHJlYW1pbmcgc2VudGluZWwgY29lcmNlcyB0byA1MDIgYnV0IHByZXNlcnZlcyBlbnZlbG9wZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSA1MjAgc2VudGluZWwgaXMgbWVhbmluZ2xlc3MgYXMgYW4gSFRUUCBzdGF0dXMgcHJlLVxuXHRcdFx0Ly8gaGVhZGVyOyB0aGUgcHJveHkgbXVzdCBjb2VyY2UgdG8gNTAyIHdoaWxlIGtlZXBpbmcgdGhlXG5cdFx0XHQvLyB1cHN0cmVhbSBlbnZlbG9wZSB2ZXJiYXRpbS4gU2VlIHBsYW4gXHUwMEE3MS41LlxuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ292ZXJsb2FkZWRfZXJyb3InLCBtZXNzYWdlOiAnY2FwYWNpdHkgZnVsbCcgfSxcblx0XHRcdFx0cmVxdWVzdF9pZDogJ3JlcV9zZW50aW5lbCcsXG5cdFx0XHR9O1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ2Vycm9yJywgZXJyb3I6IG5ldyBDb3BpbG90QXBpRXJyb3IoQ09QSUxPVF9BUElfRVJST1JfU1RBVFVTX1NUUkVBTUlORywgZW52ZWxvcGUpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDUwMik7XG5cdFx0XHRcdGFzc2VydEVudmVsb3BlV2l0aENoYXRFcnJvck1hcmtlcihyZXMucGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlLCBlbnZlbG9wZSwgJ2ZhaWxlZCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWQtc3RyZWFtIG5vbi1Db3BpbG90QXBpRXJyb3IgXHUyMTkyIHN5bnRoZXNpemVkIFNTRSBlcnJvciBmcmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBldmVudHM6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnRbXSA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZV9zdGFydCcsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnJykgfSxcblx0XHRcdF07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnc3RyZWFtJywgZXZlbnRzLCBtaWRTdHJlYW1FcnJvcjogbmV3IEVycm9yKCdzb2NrZXQgaGFuZyB1cCcpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBsYXN0RXZlbnQgPSByZXMuZXZlbnRzLmF0KC0xKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RFdmVudD8udHlwZSwgJ2Vycm9yJyk7XG5cdFx0XHRcdGNvbnN0IGVudiA9IGxhc3RFdmVudC5kYXRhIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLnR5cGUsICdhcGlfZXJyb3InKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5lcnJvci5tZXNzYWdlLCAnc29ja2V0IGhhbmcgdXAnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9vbC11c2UgaW5wdXRfanNvbl9kZWx0YSBldmVudHMgcGFzcyB0aHJvdWdoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlX3N0YXJ0JywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICcnKSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0YXJ0JywgaW5kZXg6IDAsIGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV8xJywgbmFtZTogJ2RvX3RoaW5nJywgaW5wdXQ6IHt9IH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXg6IDAsIGRlbHRhOiB7IHR5cGU6ICdpbnB1dF9qc29uX2RlbHRhJywgcGFydGlhbF9qc29uOiAne1wiYVwiOicgfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLCBpbmRleDogMCwgZGVsdGE6IHsgdHlwZTogJ2lucHV0X2pzb25fZGVsdGEnLCBwYXJ0aWFsX2pzb246ICcxfScgfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIGluZGV4OiAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RvcCcgfSxcblx0XHRcdF07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnc3RyZWFtJywgZXZlbnRzIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBkZWx0YXMgPSByZXMuZXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnKS5tYXAoZSA9PiBlLmRhdGEgYXMgeyBkZWx0YTogeyB0eXBlOiBzdHJpbmc7IHBhcnRpYWxfanNvbj86IHN0cmluZyB9IH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlbHRhcy5tYXAoZCA9PiBkLmRlbHRhLnR5cGUpLCBbJ2lucHV0X2pzb25fZGVsdGEnLCAnaW5wdXRfanNvbl9kZWx0YSddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWx0YXMubWFwKGQgPT4gZC5kZWx0YS5wYXJ0aWFsX2pzb24pLCBbJ3tcImFcIjonLCAnMX0nXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RoaW5raW5nX2RlbHRhIGV2ZW50cyBwYXNzIHRocm91Z2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W10gPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJycpIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLCBpbmRleDogMCwgY29udGVudF9ibG9jazogeyB0eXBlOiAndGhpbmtpbmcnLCB0aGlua2luZzogJycgfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfZGVsdGEnLCBpbmRleDogMCwgZGVsdGE6IHsgdHlwZTogJ3RoaW5raW5nX2RlbHRhJywgdGhpbmtpbmc6ICdobW0nIH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXg6IDAsIGRlbHRhOiB7IHR5cGU6ICd0aGlua2luZ19kZWx0YScsIHRoaW5raW5nOiAnIG9rJyB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHRcdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXg6IDAgfSxcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZV9zdG9wJyB9LFxuXHRcdFx0XTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdzdHJlYW0nLCBldmVudHMgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoU3NlKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDgsIHN0cmVhbTogdHJ1ZSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGRlbHRhcyA9IHJlcy5ldmVudHMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAnY29udGVudF9ibG9ja19kZWx0YScpLm1hcChlID0+IGUuZGF0YSBhcyB7IGRlbHRhOiB7IHR5cGU6IHN0cmluZzsgdGhpbmtpbmc/OiBzdHJpbmcgfSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWx0YXMubWFwKGQgPT4gZC5kZWx0YS50eXBlKSwgWyd0aGlua2luZ19kZWx0YScsICd0aGlua2luZ19kZWx0YSddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWx0YXMubWFwKGQgPT4gZC5kZWx0YS50aGlua2luZyksIFsnaG1tJywgJyBvayddKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc29ja2V0LnNldE5vRGVsYXkodHJ1ZSkgaXMgY2FsbGVkIG9uIHN0cmVhbWluZyByZXNwb25zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ3N0cmVhbScsIGV2ZW50czogbWFrZVN0cmVhbUV2ZW50cygnY2xhdWRlLW9wdXMtNC42JykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblxuXHRcdFx0Ly8gUGF0Y2ggbmV0LlNvY2tldC5wcm90b3R5cGUuc2V0Tm9EZWxheSB0byB0cmFjayBjYWxscyBkdXJpbmdcblx0XHRcdC8vIHRoaXMgdGVzdCBvbmx5LlxuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBuZXQuU29ja2V0LnByb3RvdHlwZS5zZXROb0RlbGF5O1xuXHRcdFx0Y29uc3QgY2FsbHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0bmV0LlNvY2tldC5wcm90b3R5cGUuc2V0Tm9EZWxheSA9IGZ1bmN0aW9uICh0aGlzOiBuZXQuU29ja2V0LCBlbmFibGU/OiBib29sZWFuKTogbmV0LlNvY2tldCB7XG5cdFx0XHRcdGNhbGxzLnB1c2goZW5hYmxlICE9PSBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbC5jYWxsKHRoaXMsIGVuYWJsZSBhcyBib29sZWFuKTtcblx0XHRcdH07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQub2soY2FsbHMuc29tZShjID0+IGMgPT09IHRydWUpLCAnZXhwZWN0ZWQgc2V0Tm9EZWxheSh0cnVlKSB0byBoYXZlIGJlZW4gY2FsbGVkIGF0IGxlYXN0IG9uY2UnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdG5ldC5Tb2NrZXQucHJvdG90eXBlLnNldE5vRGVsYXkgPSBvcmlnaW5hbDtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIEFib3J0XG5cblx0c3VpdGUoJ0Fib3J0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY2xpZW50IGRpc2Nvbm5lY3QgbWlkLXN0cmVhbSBwcm9wYWdhdGVzIEFib3J0U2lnbmFsIHVwc3RyZWFtIGFuZCB3cml0ZXMgbm90aGluZyBlbHNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHNpZ25hbFNlZW46IEFib3J0U2lnbmFsIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJlc29sdmVBYm9ydGVkITogKCkgPT4gdm9pZDtcblx0XHRcdGNvbnN0IGFib3J0T2JzZXJ2ZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVzb2x2ZUFib3J0ZWQgPSByZXNvbHZlOyB9KTtcblx0XHRcdGNvbnN0IHdyYXBwZWQ6IElDb3BpbG90QXBpU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHQvLyBDdXN0b20gc3RyZWFtOiB5aWVsZCBtZXNzYWdlX3N0YXJ0LCB0aGVuIHdhaXQgdW50aWwgdGhlXG5cdFx0XHRcdC8vIGNhbGxlcidzIEFib3J0U2lnbmFsIGZpcmVzIChtaW1pY3MgYSByZWFsIGxvbmctcnVubmluZ1xuXHRcdFx0XHQvLyB1cHN0cmVhbSBzdHJlYW0gd2FpdGluZyBmb3IgdG9rZW5zIHRvIGFycml2ZSkuIFRoZSB0ZXN0XG5cdFx0XHRcdC8vIGNsaWVudCBkaXNjb25uZWN0cyBhZnRlciByZWNlaXZpbmcgdGhlIGZpcnN0IGZyYW1lLCBhbmRcblx0XHRcdFx0Ly8gd2UgYXNzZXJ0IHRoYXQgdGhlIGFib3J0IHByb3BhZ2F0ZWQuXG5cdFx0XHRcdG1lc3NhZ2VzOiAoKF90b2tlbjogc3RyaW5nLCBfYm9keTogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXMsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdHNpZ25hbFNlZW4gPSBvcHRpb25zPy5zaWduYWw7XG5cdFx0XHRcdFx0YXN5bmMgZnVuY3Rpb24qIGdlbigpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50PiB7XG5cdFx0XHRcdFx0XHR5aWVsZCB7IHR5cGU6ICdtZXNzYWdlX3N0YXJ0JywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICcnKSB9O1xuXHRcdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKF9yZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb25BYm9ydCA9ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlQWJvcnRlZCgpO1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGUgPSBuZXcgRXJyb3IoJ0Fib3J0ZWQnKTtcblx0XHRcdFx0XHRcdFx0XHQoZSBhcyB7IG5hbWU6IHN0cmluZyB9KS5uYW1lID0gJ0Fib3J0RXJyb3InO1xuXHRcdFx0XHRcdFx0XHRcdHJlamVjdChlKTtcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnNpZ25hbD8uYWJvcnRlZCkge1xuXHRcdFx0XHRcdFx0XHRcdG9uQWJvcnQoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0b3B0aW9ucz8uc2lnbmFsPy5hZGRFdmVudExpc3RlbmVyKCdhYm9ydCcsIG9uQWJvcnQpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBnZW4oKTtcblx0XHRcdFx0fSkgYXMgSUNvcGlsb3RBcGlTZXJ2aWNlWydtZXNzYWdlcyddLFxuXHRcdFx0XHRjb3VudFRva2VuczogKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgdXNlZCcpKSxcblx0XHRcdFx0bW9kZWxzOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoW10pLFxuXHRcdFx0XHRyZXNwb25zZXM6ICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm90IHVzZWQnKSksXG5cdFx0XHRcdHV0aWxpdHlDaGF0Q29tcGxldGlvbjogKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgdXNlZCcpKSxcblx0XHRcdFx0cmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoeyByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogZmFsc2UsIHRyYWNraW5nSWQ6IHVuZGVmaW5lZCwgdGVsZW1ldHJ5RW5kcG9pbnQ6IHVuZGVmaW5lZCB9KSxcblx0XHRcdFx0cmVzb2x2ZUFwaUVuZHBvaW50OiAoKSA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgd3JhcHBlZCk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdSA9IG5ldyBVUkwoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCk7XG5cdFx0XHRcdGNvbnN0IGh0dHBNb2QgPSBhd2FpdCBnZXRIdHRwKCk7XG5cdFx0XHRcdGNvbnN0IGNsaWVudEZpbmlzaGVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdFx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0XHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0XHRcdFx0cGF0aDogdS5wYXRobmFtZSxcblx0XHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LCByZXMgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IGZyYW1lcyA9IDA7XG5cdFx0XHRcdFx0XHRyZXMub24oJ2RhdGEnLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGZyYW1lcysrO1xuXHRcdFx0XHRcdFx0XHRpZiAoZnJhbWVzID49IDEpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXEuZGVzdHJveSgpO1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXMub24oJ2Vycm9yJywgKCkgPT4gcmVzb2x2ZSgpKTtcblx0XHRcdFx0XHRcdHJlcy5vbignY2xvc2UnLCAoKSA9PiByZXNvbHZlKCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJlcS5vbignZXJyb3InLCAoKSA9PiByZXNvbHZlKCkpO1xuXHRcdFx0XHRcdHJlcS53cml0ZShKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSkpO1xuXHRcdFx0XHRcdHJlcS5lbmQoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IGNsaWVudEZpbmlzaGVkO1xuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgdXBzdHJlYW0gZ2VuZXJhdG9yIHRvIG9ic2VydmUgdGhlIGFib3J0LlxuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRcdGFib3J0T2JzZXJ2ZWQsXG5cdFx0XHRcdFx0bmV3IFByb21pc2U8dm9pZD4oKF9yZXNvbHZlLCByZWplY3QpID0+IHNldFRpbWVvdXQoKCkgPT4gcmVqZWN0KG5ldyBFcnJvcigndXBzdHJlYW0gZGlkIG5vdCBvYnNlcnZlIGFib3J0IHdpdGhpbiAycycpKSwgMjAwMCkpLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRhc3NlcnQub2soc2lnbmFsU2VlbiwgJ2V4cGVjdGVkIHVwc3RyZWFtIHNpZ25hbCcpO1xuXHRcdFx0XHRhc3NlcnQub2soc2lnbmFsU2Vlbi5hYm9ydGVkLCAnZXhwZWN0ZWQgYWJvcnQgdG8gZmlyZSBvbiBjbGllbnQgZGlzY29ubmVjdCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlKCkgd2l0aCBpbi1mbGlnaHQgbm9uLXN0cmVhbWluZyBhYm9ydHMgdGhlIHVwc3RyZWFtIGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0bGV0IHNpZ25hbFNlZW46IEFib3J0U2lnbmFsIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJlbGVhc2VVcHN0cmVhbTogKCkgPT4gdm9pZCA9ICgpID0+IHsgfTtcblx0XHRcdGNvbnN0IHVwc3RyZWFtID0gbmV3IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJlbGVhc2VVcHN0cmVhbSA9ICgpID0+IHJlamVjdChPYmplY3QuYXNzaWduKG5ldyBFcnJvcignQWJvcnRlZCcpLCB7IG5hbWU6ICdBYm9ydEVycm9yJyB9KSk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHdyYXBwZWQ6IElDb3BpbG90QXBpU2VydmljZSA9IHtcblx0XHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXNzYWdlczogKCh0b2tlbiwgYm9keSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdHNpZ25hbFNlZW4gPSBvcHRpb25zPy5zaWduYWw7XG5cdFx0XHRcdFx0aWYgKGJvZHkuc3RyZWFtKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFrZS5tZXNzYWdlcyh0b2tlbiwgYm9keSBhcyBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZywgb3B0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG9wdGlvbnM/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCAoKSA9PiByZWxlYXNlVXBzdHJlYW0oKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVwc3RyZWFtO1xuXHRcdFx0XHR9KSBhcyBJQ29waWxvdEFwaVNlcnZpY2VbJ21lc3NhZ2VzJ10sXG5cdFx0XHRcdGNvdW50VG9rZW5zOiBmYWtlLmNvdW50VG9rZW5zLmJpbmQoZmFrZSksXG5cdFx0XHRcdG1vZGVsczogZmFrZS5tb2RlbHMuYmluZChmYWtlKSxcblx0XHRcdFx0cmVzcG9uc2VzOiBmYWtlLnJlc3BvbnNlcy5iaW5kKGZha2UpLFxuXHRcdFx0XHR1dGlsaXR5Q2hhdENvbXBsZXRpb246IGZha2UudXRpbGl0eUNoYXRDb21wbGV0aW9uLmJpbmQoZmFrZSksXG5cdFx0XHRcdHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDogZmFrZS5yZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQuYmluZChmYWtlKSxcblx0XHRcdFx0cmVzb2x2ZUFwaUVuZHBvaW50OiBmYWtlLnJlc29sdmVBcGlFbmRwb2ludC5iaW5kKGZha2UpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQ2xhdWRlUHJveHlTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCB3cmFwcGVkKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXG5cdFx0XHRjb25zdCBpbmZsaWdodCA9IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0fSkuY2F0Y2goZXJyID0+ICh7IGFib3J0ZWQ6IHRydWUsIGVycjogZXJyIGFzIEVycm9yIH0pKTtcblxuXHRcdFx0Ly8gV2FpdCB1bnRpbCB1cHN0cmVhbSBoYXMgYmVlbiBjYWxsZWQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0Y29uc3QgaSA9IHNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoc2lnbmFsU2VlbikgeyBjbGVhckludGVydmFsKGkpOyByZXNvbHZlKCk7IH1cblx0XHRcdFx0fSwgMTApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5mbGlnaHQ7XG5cdFx0XHRhc3NlcnQub2soc2lnbmFsU2Vlbj8uYWJvcnRlZCwgJ2V4cGVjdGVkIGFib3J0IHRvIGZpcmUgb24gZGlzcG9zZScpO1xuXHRcdFx0Ly8gY29ubmVjdGlvbiBzaG91bGQgaGF2ZSBiZWVuIGRlc3Ryb3llZDsgcmVzdWx0IGlzIGVpdGhlciBhblxuXHRcdFx0Ly8gaHR0cCBlcnJvciBvciBhIHBhcnRpYWwgcmVzcG9uc2UgXHUyMDE0IGp1c3QgdmVyaWZ5IHdlIGRpZG4ndCBnZXRcblx0XHRcdC8vIGEgMjAwIHdpdGggYSBib2R5LlxuXHRcdFx0dm9pZCByZXN1bHQ7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBSW5CLFlBQVksU0FBUztBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsT0FHTTtBQUNQLFNBQVMsb0JBQW9CLGtDQUFrQztBQUMvRCxTQUFTLDBCQUEwQjtBQVFuQyxTQUFTLGtDQUFrQyxRQUFpQyxVQUFtQyxtQkFBaUM7QUFDL0ksU0FBTyxZQUFZLE9BQU8sTUFBTSxPQUFPO0FBQ3ZDLFNBQU8sWUFBWSxPQUFPLFlBQVksU0FBUyxVQUFVO0FBQ3pELFNBQU8sWUFBWSxPQUFPLE1BQU0sTUFBTSxTQUFTLE1BQU0sSUFBSTtBQUN6RCxTQUFPLEdBQUcsT0FBTyxNQUFNLFFBQVEsV0FBVyxHQUFHLFNBQVMsTUFBTSxPQUFPLElBQUksa0JBQWtCLEVBQUUsR0FBRywwQ0FBMEMsT0FBTyxNQUFNLE9BQU8sRUFBRTtBQUM5SixRQUFNLFlB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
