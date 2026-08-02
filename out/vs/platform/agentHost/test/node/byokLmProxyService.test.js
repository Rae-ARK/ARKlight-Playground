import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService } from "../../node/copilot/byokLmProxyService.js";
suite("ByokLmProxyService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  function servingConnection(chat, models = []) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat, onDidChangeModels: emitter.event };
  }
  async function withProxy(chat, run) {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", servingConnection(chat));
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      await run(handle);
    } finally {
      handle.dispose();
      registration.dispose();
      service.dispose();
    }
  }
  function responsesUrl(handle, vendor) {
    return `${handle.providerBaseUrl(vendor)}/responses`;
  }
  function authHeaders(handle) {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${handle.nonce}.${sessionId}` };
  }
  test("serves the unauthenticated health check", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(`${handle.baseUrl}/`);
        assert.strictEqual(response.status, 200);
        assert.strictEqual(await response.text(), "ok");
      }
    );
  });
  test("rejects requests without a valid bearer token", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 401);
      }
    );
  });
  test("rejects a nonce-only bearer token (no session id)", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${handle.nonce}` },
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 401);
      }
    );
  });
  test("returns 404 for an authenticated but unknown route", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(`${handle.baseUrl}/v/acme/chat/completions`, {
          method: "POST",
          headers: authHeaders(handle),
          body: "{}"
        });
        assert.strictEqual(response.status, 404);
      }
    );
  });
  test("forwards a Responses request to the bridge and returns JSON by default", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "hello from byok" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "claude", input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }] })
        });
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.headers.get("content-type"), "application/json");
        const body = await response.json();
        assert.strictEqual(body.output[0].content[0].text, "hello from byok");
      }
    );
    assert.strictEqual(captured?.vendor, "acme");
    assert.strictEqual(captured?.modelId, "claude");
    assert.deepStrictEqual(captured?.input, [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }]);
  });
  test("forwards custom tool call history with freeform input", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "done" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({
            model: "m",
            input: [
              {
                type: "custom_tool_call",
                call_id: "call_1",
                name: "apply_patch",
                input: "*** Begin Patch\n*** End Patch"
              },
              { type: "custom_tool_call_output", call_id: "call_1", output: "Done!" }
            ]
          })
        });
        assert.strictEqual(response.status, 200);
        await response.text();
      }
    );
    assert.deepStrictEqual(captured?.input, [
      {
        type: "custom_tool_call",
        callId: "call_1",
        name: "apply_patch",
        input: "*** Begin Patch\n*** End Patch"
      },
      { type: "custom_tool_call_output", callId: "call_1", output: "Done!" }
    ]);
  });
  test("decodes a url-encoded vendor path segment", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "ok" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme corp"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 200);
        await response.text();
      }
    );
    assert.strictEqual(captured?.vendor, "acme corp");
  });
  test("rejects a vendor that decodes to a multi-segment path (%2F)", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "a/b"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 404);
      }
    );
  });
  test("streams assistant tool calls as OpenAI tool_call deltas", async () => {
    await withProxy(
      async () => ({ output: [{ type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' }] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: "weather?", stream: true })
        });
        const text = await response.text();
        assert.ok(text.includes('"type":"function_call"'), `expected function_call in SSE: ${text}`);
        assert.ok(text.includes("event: response.completed"), `expected completed response: ${text}`);
        assert.ok(text.includes("getWeather"));
      }
    );
  });
  test("returns a 502 when the bridge reports an error", async () => {
    await withProxy(
      async () => ({ output: [], error: "model unavailable" }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 502);
        const body = await response.json();
        assert.strictEqual(body.error?.message, "model unavailable");
      }
    );
  });
  test("returns a 502 when the bridge throws", async () => {
    await withProxy(
      async () => {
        throw new Error("bridge exploded");
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 502);
        const body = await response.json();
        assert.strictEqual(body.error?.message, "bridge exploded");
      }
    );
  });
  test("rejects a malformed JSON body with 400", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: "not json"
        });
        assert.strictEqual(response.status, 400);
      }
    );
  });
  test("returns a 503 when no renderer bridge is connected", async () => {
    const registry = new ByokLmBridgeRegistry();
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      const response = await fetch(responsesUrl(handle, "acme"), {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ model: "m", input: [] })
      });
      assert.strictEqual(response.status, 503);
    } finally {
      handle.dispose();
      service.dispose();
    }
  });
  test("routes requests to a serving window and excludes a non-serving one", async () => {
    const registry = new ByokLmBridgeRegistry();
    const calls = [];
    const regServing = registry.register("editor", servingConnection(
      async () => {
        calls.push("serving");
        return { output: [{ type: "message", content: [{ type: "text", text: "from serving" }] }] };
      },
      [{ vendor: "acme", id: "claude" }]
    ));
    const regNonServing = registry.register("no-handler", {
      chat: async () => {
        calls.push("no-handler");
        return { output: [{ type: "message", content: [{ type: "text", text: "from non-serving" }] }] };
      },
      onDidChangeModels: Event.None
    });
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      const res = await fetch(responsesUrl(handle, "acme"), {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ model: "claude", input: [] })
      });
      assert.deepStrictEqual({
        routedToServing: (await res.text()).includes("from serving"),
        calls
      }, { routedToServing: true, calls: ["serving"] });
    } finally {
      handle.dispose();
      regServing.dispose();
      regNonServing.dispose();
      service.dispose();
    }
  });
  test("rebinds with a fresh nonce after every handle is disposed", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", servingConnection(async () => ({ output: [{ type: "message", content: [{ type: "text", text: "ok" }] }] })));
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const first = await service.start();
    const firstNonce = first.nonce;
    first.dispose();
    const second = await service.start();
    try {
      assert.notStrictEqual(second.nonce, firstNonce);
    } finally {
      second.dispose();
      registration.dispose();
      service.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYnlva0xtUHJveHlTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uLCBJQnlva0xtQ2hhdFJlcXVlc3QsIElCeW9rTG1DaGF0UmVzdWx0LCBJQnlva0xtTW9kZWxJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uL25vZGUvYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQnlva0xtUHJveHlTZXJ2aWNlLCB0eXBlIElCeW9rTG1Qcm94eUhhbmRsZSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9ieW9rTG1Qcm94eVNlcnZpY2UuanMnO1xuXG4vKipcbiAqIEV4ZXJjaXNlcyB0aGUgaW5mZXJlbmNlIHBhdGggZW5kLXRvLWVuZCB3aXRob3V0IHRoZSBDb3BpbG90IFNESyBydW50aW1lOlxuICogdGhlIHRlc3QgcGxheXMgdGhlIHJ1bnRpbWUncyByb2xlIGJ5IFBPU1RpbmcgT3BlbkFJIFJlc3BvbnNlc1xuICogcmVxdWVzdHMgYXQgdGhlIGxvb3BiYWNrIHByb3h5LCBhbmQgcGxheXMgdGhlIHJlbmRlcmVyJ3Mgcm9sZSB3aXRoIGEgZmFrZVxuICoge0BsaW5rIElCeW9rTG1DaGF0UmVxdWVzdH0gLT4ge0BsaW5rIElCeW9rTG1DaGF0UmVzdWx0fSBicmlkZ2UgZnVuY3Rpb24uIFRoZVxuICogb25seSBjb250cmFjdCB1bmRlciB0ZXN0IGlzIHRoZSBPcGVuQUkgd2lyZSBmb3JtYXQgaW4sIHRoZSBicmlkZ2UgRFRPIG91dCxcbiAqIGFuZCB0aGUgU1NFIHdpcmUgZm9ybWF0IGJhY2suXG4gKi9cbnN1aXRlKCdCeW9rTG1Qcm94eVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uSWQgPSAnc2Vzcy0xJztcblxuXHQvKipcblx0ICogQSBzZXJ2aW5nIGJyaWRnZSBjb25uZWN0aW9uOiBpdCBwdXNoZXMgaXRzIG1vZGVsIHNuYXBzaG90IChkZWZhdWx0IGVtcHR5KVxuXHQgKiBzeW5jaHJvbm91c2x5IHdoZW4gdGhlIHJlZ2lzdHJ5IHN1YnNjcmliZXMsIHNvIGl0IGlzIGEgdmFsaWQgcm91dGluZyB0YXJnZXQuXG5cdCAqL1xuXHRmdW5jdGlvbiBzZXJ2aW5nQ29ubmVjdGlvbihjaGF0OiBJQnlva0xtQnJpZGdlQ29ubmVjdGlvblsnY2hhdCddLCBtb2RlbHM6IElCeW9rTG1Nb2RlbEluZm9bXSA9IFtdKTogSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb24ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8SUJ5b2tMbU1vZGVsSW5mb1tdPih7XG5cdFx0XHRvbkRpZEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IGVtaXR0ZXIuZmlyZShtb2RlbHMpLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4geyBjaGF0LCBvbkRpZENoYW5nZU1vZGVsczogZW1pdHRlci5ldmVudCB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gd2l0aFByb3h5KFxuXHRcdGNoYXQ6IChyZXF1ZXN0OiBJQnlva0xtQ2hhdFJlcXVlc3QpID0+IFByb21pc2U8SUJ5b2tMbUNoYXRSZXN1bHQ+LFxuXHRcdHJ1bjogKGhhbmRsZTogSUJ5b2tMbVByb3h5SGFuZGxlKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIHNlcnZpbmdDb25uZWN0aW9uKGNoYXQpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEJ5b2tMbVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVnaXN0cnkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcnVuKGhhbmRsZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVzcG9uc2VzVXJsKGhhbmRsZTogSUJ5b2tMbVByb3h5SGFuZGxlLCB2ZW5kb3I6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2hhbmRsZS5wcm92aWRlckJhc2VVcmwodmVuZG9yKX0vcmVzcG9uc2VzYDtcblx0fVxuXG5cdGZ1bmN0aW9uIGF1dGhIZWFkZXJzKGhhbmRsZTogSUJ5b2tMbVByb3h5SGFuZGxlKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0cmV0dXJuIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS4ke3Nlc3Npb25JZH1gIH07XG5cdH1cblxuXHR0ZXN0KCdzZXJ2ZXMgdGhlIHVuYXV0aGVudGljYXRlZCBoZWFsdGggY2hlY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtoYW5kbGUuYmFzZVVybH0vYCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNwb25zZS50ZXh0KCksICdvaycpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHJlcXVlc3RzIHdpdGhvdXQgYSB2YWxpZCBiZWFyZXIgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ20nLCBpbnB1dDogW10gfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3RhdHVzLCA0MDEpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGEgbm9uY2Utb25seSBiZWFyZXIgdG9rZW4gKG5vIHNlc3Npb24gaWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2FjbWUnKSwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAgfSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgNDA0IGZvciBhbiBhdXRoZW50aWNhdGVkIGJ1dCB1bmtub3duIHJvdXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7aGFuZGxlLmJhc2VVcmx9L3YvYWNtZS9jaGF0L2NvbXBsZXRpb25zYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0Ym9keTogJ3t9Jyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDQwNCk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGEgUmVzcG9uc2VzIHJlcXVlc3QgdG8gdGhlIGJyaWRnZSBhbmQgcmV0dXJucyBKU09OIGJ5IGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNhcHR1cmVkOiBJQnlva0xtQ2hhdFJlcXVlc3QgfCB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKHJlcXVlc3QpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWQgPSByZXF1ZXN0O1xuXHRcdFx0XHRyZXR1cm4geyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8gZnJvbSBieW9rJyB9XSB9XSB9O1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlJywgaW5wdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgcm9sZTogJ3VzZXInLCBjb250ZW50OiBbeyB0eXBlOiAnaW5wdXRfdGV4dCcsIHRleHQ6ICdoaScgfV0gfV0gfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3RhdHVzLCAyMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIHsgb3V0cHV0OiBBcnJheTx7IGNvbnRlbnQ6IEFycmF5PHsgdGV4dDogc3RyaW5nIH0+IH0+IH07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5Lm91dHB1dFswXS5jb250ZW50WzBdLnRleHQsICdoZWxsbyBmcm9tIGJ5b2snKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQ/LnZlbmRvciwgJ2FjbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQ/Lm1vZGVsSWQsICdjbGF1ZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcHR1cmVkPy5pbnB1dCwgW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIGN1c3RvbSB0b29sIGNhbGwgaGlzdG9yeSB3aXRoIGZyZWVmb3JtIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjYXB0dXJlZDogSUJ5b2tMbUNoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jIChyZXF1ZXN0KSA9PiB7XG5cdFx0XHRcdGNhcHR1cmVkID0gcmVxdWVzdDtcblx0XHRcdFx0cmV0dXJuIHsgb3V0cHV0OiBbeyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2RvbmUnIH1dIH1dIH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdG1vZGVsOiAnbScsXG5cdFx0XHRcdFx0XHRpbnB1dDogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLFxuXHRcdFx0XHRcdFx0XHRcdGNhbGxfaWQ6ICdjYWxsXzEnLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdhcHBseV9wYXRjaCcsXG5cdFx0XHRcdFx0XHRcdFx0aW5wdXQ6ICcqKiogQmVnaW4gUGF0Y2hcXG4qKiogRW5kIFBhdGNoJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnLCBjYWxsX2lkOiAnY2FsbF8xJywgb3V0cHV0OiAnRG9uZSEnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FwdHVyZWQ/LmlucHV0LCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0Y2FsbElkOiAnY2FsbF8xJyxcblx0XHRcdFx0bmFtZTogJ2FwcGx5X3BhdGNoJyxcblx0XHRcdFx0aW5wdXQ6ICcqKiogQmVnaW4gUGF0Y2hcXG4qKiogRW5kIFBhdGNoJyxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCcsIGNhbGxJZDogJ2NhbGxfMScsIG91dHB1dDogJ0RvbmUhJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvZGVzIGEgdXJsLWVuY29kZWQgdmVuZG9yIHBhdGggc2VnbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FwdHVyZWQ6IElCeW9rTG1DaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAocmVxdWVzdCkgPT4geyBjYXB0dXJlZCA9IHJlcXVlc3Q7IHJldHVybiB7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0gfV0gfTsgfSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZSBjb3JwJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdtJywgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZD8udmVuZG9yLCAnYWNtZSBjb3JwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYSB2ZW5kb3IgdGhhdCBkZWNvZGVzIHRvIGEgbXVsdGktc2VnbWVudCBwYXRoICglMkYpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdC8vIGBlbmNvZGVVUklDb21wb25lbnQoJ2EvYicpYCBcdTIxOTIgYGElMkZiYCwgd2hpY2ggc3Vydml2ZXMgdGhlXG5cdFx0XHRcdC8vIHByZS1kZWNvZGUgc2VnbWVudCBjaGVjayBidXQgZGVjb2RlcyBiYWNrIGludG8gYGEvYmAuXG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2EvYicpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDQwNCk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbXMgYXNzaXN0YW50IHRvb2wgY2FsbHMgYXMgT3BlbkFJIHRvb2xfY2FsbCBkZWx0YXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbeyB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIGNhbGxJZDogJ2NhbGxfMScsIG5hbWU6ICdnZXRXZWF0aGVyJywgYXJndW1lbnRzSnNvbjogJ3tcImNpdHlcIjpcIk5ZQ1wifScgfV0gfSksXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2FjbWUnKSwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ20nLCBpbnB1dDogJ3dlYXRoZXI/Jywgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ1widHlwZVwiOlwiZnVuY3Rpb25fY2FsbFwiJyksIGBleHBlY3RlZCBmdW5jdGlvbl9jYWxsIGluIFNTRTogJHt0ZXh0fWApO1xuXHRcdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnZXZlbnQ6IHJlc3BvbnNlLmNvbXBsZXRlZCcpLCBgZXhwZWN0ZWQgY29tcGxldGVkIHJlc3BvbnNlOiAke3RleHR9YCk7XG5cdFx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdnZXRXZWF0aGVyJykpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGEgNTAyIHdoZW4gdGhlIGJyaWRnZSByZXBvcnRzIGFuIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW10sIGVycm9yOiAnbW9kZWwgdW5hdmFpbGFibGUnIH0pLFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdtJywgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNTAyKTtcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IGVycm9yPzogeyBtZXNzYWdlPzogc3RyaW5nIH0gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZXJyb3I/Lm1lc3NhZ2UsICdtb2RlbCB1bmF2YWlsYWJsZScpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGEgNTAyIHdoZW4gdGhlIGJyaWRnZSB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2JyaWRnZSBleHBsb2RlZCcpOyB9LFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdtJywgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNTAyKTtcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKSBhcyB7IGVycm9yPzogeyBtZXNzYWdlPzogc3RyaW5nIH0gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkuZXJyb3I/Lm1lc3NhZ2UsICdicmlkZ2UgZXhwbG9kZWQnKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBhIG1hbGZvcm1lZCBKU09OIGJvZHkgd2l0aCA0MDAnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiAnbm90IGpzb24nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNDAwKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIDUwMyB3aGVuIG5vIHJlbmRlcmVyIGJyaWRnZSBpcyBjb25uZWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEJ5b2tMbVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVnaXN0cnkpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNTAzKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncm91dGVzIHJlcXVlc3RzIHRvIGEgc2VydmluZyB3aW5kb3cgYW5kIGV4Y2x1ZGVzIGEgbm9uLXNlcnZpbmcgb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Ly8gVGhlIHNlcnZpbmcgd2luZG93IChlZGl0b3IpOiBwdXNoZXMgbW9kZWxzIGFuZCBhbnN3ZXJzIGNoYXQuXG5cdFx0Y29uc3QgcmVnU2VydmluZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdlZGl0b3InLCBzZXJ2aW5nQ29ubmVjdGlvbihcblx0XHRcdGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgnc2VydmluZycpOyByZXR1cm4geyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZnJvbSBzZXJ2aW5nJyB9XSB9XSB9OyB9LFxuXHRcdFx0W3sgdmVuZG9yOiAnYWNtZScsIGlkOiAnY2xhdWRlJyB9XSxcblx0XHQpKTtcblx0XHQvLyBBIG5vbi1zZXJ2aW5nIHdpbmRvdyAoY29ubmVjdGVkIHdpdGhvdXQgYSBCWU9LIGhhbmRsZXIpOiBpdCBuZXZlciBwdXNoZXNcblx0XHQvLyBhIHNuYXBzaG90LCBzbyBpdCBtdXN0IG5ldmVyIGJlIHBpY2tlZCBmb3Igcm91dGluZyBldmVuIHRob3VnaCBjb25uZWN0ZWQuXG5cdFx0Y29uc3QgcmVnTm9uU2VydmluZyA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCduby1oYW5kbGVyJywge1xuXHRcdFx0Y2hhdDogYXN5bmMgKCkgPT4geyBjYWxscy5wdXNoKCduby1oYW5kbGVyJyk7IHJldHVybiB7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdmcm9tIG5vbi1zZXJ2aW5nJyB9XSB9XSB9OyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VNb2RlbHM6IEV2ZW50Lk5vbmUsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBCeW9rTG1Qcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsIGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUnLCBpbnB1dDogW10gfSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyb3V0ZWRUb1NlcnZpbmc6IChhd2FpdCByZXMudGV4dCgpKS5pbmNsdWRlcygnZnJvbSBzZXJ2aW5nJyksXG5cdFx0XHRcdGNhbGxzLFxuXHRcdFx0fSwgeyByb3V0ZWRUb1NlcnZpbmc6IHRydWUsIGNhbGxzOiBbJ3NlcnZpbmcnXSB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ1NlcnZpbmcuZGlzcG9zZSgpO1xuXHRcdFx0cmVnTm9uU2VydmluZy5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYmluZHMgd2l0aCBhIGZyZXNoIG5vbmNlIGFmdGVyIGV2ZXJ5IGhhbmRsZSBpcyBkaXNwb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKCdjbGllbnQtMScsIHNlcnZpbmdDb25uZWN0aW9uKGFzeW5jICgpID0+ICh7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0gfV0gfSkpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEJ5b2tMbVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcmVnaXN0cnkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VydmljZS5zdGFydCgpO1xuXHRcdGNvbnN0IGZpcnN0Tm9uY2UgPSBmaXJzdC5ub25jZTtcblx0XHRmaXJzdC5kaXNwb3NlKCk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2Vjb25kLm5vbmNlLCBmaXJzdE5vbmNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2Vjb25kLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBbUQ7QUFVNUQsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0sWUFBWTtBQU1sQixXQUFTLGtCQUFrQixNQUF1QyxTQUE2QixDQUFDLEdBQTRCO0FBQzNILFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSSxRQUE0QjtBQUFBLE1BQ3pELHVCQUF1QixNQUFNLFFBQVEsS0FBSyxNQUFNO0FBQUEsSUFDakQsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxFQUFF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
