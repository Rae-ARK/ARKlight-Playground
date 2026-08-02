import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { COPILOT_API_ERROR_STATUS_STREAMING, CopilotApiError } from "../../node/shared/copilotApiService.js";
import {
  buildForwardedChatError,
  buildForwardedChatErrorFromFields,
  encodeForwardedChatError,
  extractForwardedErrorInfo,
  PROXY_ERROR_PREFIX,
  toChatErrorMeta,
  tryBuildChatErrorMeta,
  tryParseForwardedChatError
} from "../../node/shared/forwardedChatError.js";
function makeApiError(status, type, message, requestId = "req-1") {
  const envelope = {
    type: "error",
    error: { type, message },
    request_id: requestId
  };
  return new CopilotApiError(status, envelope);
}
suite("forwardedChatError", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("buildForwardedChatError", () => {
    test("maps HTTP status to the matching fetch type", () => {
      const cases = [
        [402, "quotaExceeded"],
        [429, "rateLimited"],
        [499, "canceled"],
        [400, "badRequest"],
        [401, "agent_unauthorized"],
        [403, "agent_unauthorized"],
        [404, "notFound"],
        [500, "failed"]
      ];
      const actual = cases.map(([status]) => buildForwardedChatError(makeApiError(status, "api_error", "boom")).fetchError.type);
      assert.deepStrictEqual(actual, cases.map(([, type]) => type));
    });
    test("mid-stream streaming sentinel maps to failed", () => {
      const forwarded = buildForwardedChatError(makeApiError(COPILOT_API_ERROR_STATUS_STREAMING, "api_error", "mid-stream boom"));
      assert.strictEqual(forwarded.fetchError.type, "failed");
    });
    test("carries envelope message, type, and request id", () => {
      const forwarded = buildForwardedChatError(makeApiError(429, "rate_limit_error", "slow down", "gh-req-9"));
      assert.deepStrictEqual(forwarded, {
        fetchError: {
          type: "rateLimited",
          reason: "slow down",
          requestId: "gh-req-9",
          capiError: { code: "rate_limit_error", message: "slow down" }
        }
      });
    });
    test("null request id becomes empty string", () => {
      const forwarded = buildForwardedChatError(makeApiError(500, "api_error", "boom", null));
      assert.strictEqual(forwarded.fetchError.requestId, "");
    });
    test("extracts CAPI code and message from a synthesized error body", () => {
      const body = JSON.stringify({ error: { message: "You have exceeded your monthly quota", code: "quota_exceeded" } });
      const forwarded = buildForwardedChatError(makeApiError(402, "api_error", body));
      assert.deepStrictEqual(forwarded, {
        fetchError: {
          type: "quotaExceeded",
          reason: "You have exceeded your monthly quota",
          requestId: "req-1",
          capiError: { code: "quota_exceeded", message: "You have exceeded your monthly quota" }
        }
      });
    });
  });
  suite("encode / parse round-trip", () => {
    test("round-trips a forwarded error", () => {
      const original = buildForwardedChatError(makeApiError(402, "quota_error", "no credits"));
      const encoded = encodeForwardedChatError(original);
      assert.ok(encoded.startsWith(PROXY_ERROR_PREFIX));
      assert.deepStrictEqual(tryParseForwardedChatError(encoded), original);
    });
    test("extracts a marker embedded mid-message, stopping at whitespace", () => {
      const original = buildForwardedChatError(makeApiError(429, "rate_limit_error", "slow down"));
      const text = `CAPI request failed: 429 Too Many Requests \u2014 slow down ${encodeForwardedChatError(original)} trailing words`;
      assert.deepStrictEqual(tryParseForwardedChatError(text), original);
    });
    test("returns undefined when no marker is present", () => {
      assert.strictEqual(tryParseForwardedChatError(void 0), void 0);
      assert.strictEqual(tryParseForwardedChatError("just a plain error message"), void 0);
    });
    test("returns undefined for a malformed base64 payload", () => {
      assert.strictEqual(tryParseForwardedChatError(`${PROXY_ERROR_PREFIX}not-valid-base64!!!`), void 0);
    });
    test("returns undefined when the decoded payload lacks a fetchError type", () => {
      const badPayload = `${PROXY_ERROR_PREFIX}${Buffer.from(JSON.stringify({ fetchError: {} })).toString("base64")}`;
      assert.strictEqual(tryParseForwardedChatError(badPayload), void 0);
    });
    test("returns undefined for an oversized marker payload without decoding it", () => {
      const huge = `${PROXY_ERROR_PREFIX}${"A".repeat(9 * 1024)}`;
      assert.strictEqual(tryParseForwardedChatError(huge), void 0);
    });
  });
  suite("buildForwardedChatErrorFromFields", () => {
    test("maps Copilot SDK error categories to fetch types", () => {
      const actual = [
        { errorType: "quota", message: "q" },
        { errorType: "rate_limit", message: "r" },
        { errorType: "context_limit", message: "c" },
        { errorType: "authentication", message: "a" },
        { errorType: "authorization", message: "a" }
      ].map((data) => buildForwardedChatErrorFromFields(data)?.fetchError.type);
      assert.deepStrictEqual(actual, ["quotaExceeded", "rateLimited", "length", "agent_unauthorized", "agent_unauthorized"]);
    });
    test("carries code, message, and request ids for a quota error", () => {
      const forwarded = buildForwardedChatErrorFromFields({
        errorType: "quota",
        errorCode: "quota_exceeded",
        message: "You have exceeded your monthly quota",
        statusCode: 402,
        providerCallId: "gh-1",
        serviceRequestId: "svc-2"
      });
      assert.deepStrictEqual(forwarded, {
        fetchError: {
          type: "quotaExceeded",
          reason: "You have exceeded your monthly quota",
          requestId: "gh-1",
          serverRequestId: "svc-2",
          capiError: { code: "quota_exceeded", message: "You have exceeded your monthly quota" }
        }
      });
    });
    test("defaults a quota error without an explicit code to quota_exceeded so the plan message renders", () => {
      const fromType = buildForwardedChatErrorFromFields({ errorType: "quota", message: "no credits" });
      const fromStatus = buildForwardedChatErrorFromFields({ errorType: "unknown", message: "no credits", statusCode: 402 });
      assert.deepStrictEqual([fromType?.fetchError.capiError?.code, fromStatus?.fetchError.capiError?.code], ["quota_exceeded", "quota_exceeded"]);
    });
    test("falls back to status-code mapping for an unknown category", () => {
      assert.strictEqual(buildForwardedChatErrorFromFields({ errorType: "something", message: "m", statusCode: 429 })?.fetchError.type, "rateLimited");
    });
    test("returns undefined for an unclassifiable error", () => {
      assert.strictEqual(buildForwardedChatErrorFromFields({ errorType: "query", message: "bad input" }), void 0);
    });
  });
  suite("meta helpers", () => {
    test("toChatErrorMeta nests under chatError", () => {
      const forwarded = buildForwardedChatError(makeApiError(404, "not_found_error", "missing"));
      assert.deepStrictEqual(toChatErrorMeta(forwarded), { chatError: forwarded });
    });
    test("tryBuildChatErrorMeta returns the meta record for a marked message, else undefined", () => {
      const forwarded = buildForwardedChatError(makeApiError(402, "quota_error", "no credits"));
      assert.deepStrictEqual(tryBuildChatErrorMeta(encodeForwardedChatError(forwarded)), { chatError: forwarded });
      assert.strictEqual(tryBuildChatErrorMeta("plain message"), void 0);
    });
  });
  suite("extractForwardedErrorInfo", () => {
    test("strips the marker and attaches _meta for a marked message", () => {
      const forwarded = buildForwardedChatError(makeApiError(402, "quota_error", "no credits"));
      const marked = `quota ${encodeForwardedChatError(forwarded)}`;
      assert.deepStrictEqual(extractForwardedErrorInfo(marked), { message: "quota", _meta: { chatError: forwarded } });
    });
    test("returns the message unchanged and omits _meta for a plain message", () => {
      const info = extractForwardedErrorInfo("something went wrong");
      assert.deepStrictEqual(info, { message: "something went wrong" });
      assert.ok(!Object.hasOwn(info, "_meta"), "_meta should be omitted, not set to undefined");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZm9yd2FyZGVkQ2hhdEVycm9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLCBDb3BpbG90QXBpRXJyb3IgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRidWlsZEZvcndhcmRlZENoYXRFcnJvcixcblx0YnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tRmllbGRzLFxuXHRlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IsXG5cdGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8sXG5cdElGb3J3YXJkZWRDaGF0RXJyb3IsXG5cdFBST1hZX0VSUk9SX1BSRUZJWCxcblx0dG9DaGF0RXJyb3JNZXRhLFxuXHR0cnlCdWlsZENoYXRFcnJvck1ldGEsXG5cdHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yLFxufSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9mb3J3YXJkZWRDaGF0RXJyb3IuanMnO1xuXG5mdW5jdGlvbiBtYWtlQXBpRXJyb3Ioc3RhdHVzOiBudW1iZXIsIHR5cGU6IHN0cmluZywgbWVzc2FnZTogc3RyaW5nLCByZXF1ZXN0SWQ6IHN0cmluZyB8IG51bGwgPSAncmVxLTEnKTogQ29waWxvdEFwaUVycm9yIHtcblx0Y29uc3QgZW52ZWxvcGU6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlID0ge1xuXHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0ZXJyb3I6IHsgdHlwZTogdHlwZSBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZVsnZXJyb3InXVsndHlwZSddLCBtZXNzYWdlIH0sXG5cdFx0cmVxdWVzdF9pZDogcmVxdWVzdElkLFxuXHR9O1xuXHRyZXR1cm4gbmV3IENvcGlsb3RBcGlFcnJvcihzdGF0dXMsIGVudmVsb3BlKTtcbn1cblxuc3VpdGUoJ2ZvcndhcmRlZENoYXRFcnJvcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3InLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIEhUVFAgc3RhdHVzIHRvIHRoZSBtYXRjaGluZyBmZXRjaCB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtudW1iZXIsIHN0cmluZ11bXSA9IFtcblx0XHRcdFx0WzQwMiwgJ3F1b3RhRXhjZWVkZWQnXSxcblx0XHRcdFx0WzQyOSwgJ3JhdGVMaW1pdGVkJ10sXG5cdFx0XHRcdFs0OTksICdjYW5jZWxlZCddLFxuXHRcdFx0XHRbNDAwLCAnYmFkUmVxdWVzdCddLFxuXHRcdFx0XHRbNDAxLCAnYWdlbnRfdW5hdXRob3JpemVkJ10sXG5cdFx0XHRcdFs0MDMsICdhZ2VudF91bmF1dGhvcml6ZWQnXSxcblx0XHRcdFx0WzQwNCwgJ25vdEZvdW5kJ10sXG5cdFx0XHRcdFs1MDAsICdmYWlsZWQnXSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBjYXNlcy5tYXAoKFtzdGF0dXNdKSA9PiBidWlsZEZvcndhcmRlZENoYXRFcnJvcihtYWtlQXBpRXJyb3Ioc3RhdHVzLCAnYXBpX2Vycm9yJywgJ2Jvb20nKSkuZmV0Y2hFcnJvci50eXBlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBjYXNlcy5tYXAoKFssIHR5cGVdKSA9PiB0eXBlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWQtc3RyZWFtIHN0cmVhbWluZyBzZW50aW5lbCBtYXBzIHRvIGZhaWxlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKG1ha2VBcGlFcnJvcihDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLCAnYXBpX2Vycm9yJywgJ21pZC1zdHJlYW0gYm9vbScpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWQuZmV0Y2hFcnJvci50eXBlLCAnZmFpbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXJyaWVzIGVudmVsb3BlIG1lc3NhZ2UsIHR5cGUsIGFuZCByZXF1ZXN0IGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IobWFrZUFwaUVycm9yKDQyOSwgJ3JhdGVfbGltaXRfZXJyb3InLCAnc2xvdyBkb3duJywgJ2doLXJlcS05JykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmb3J3YXJkZWQsIHtcblx0XHRcdFx0ZmV0Y2hFcnJvcjoge1xuXHRcdFx0XHRcdHR5cGU6ICdyYXRlTGltaXRlZCcsXG5cdFx0XHRcdFx0cmVhc29uOiAnc2xvdyBkb3duJyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICdnaC1yZXEtOScsXG5cdFx0XHRcdFx0Y2FwaUVycm9yOiB7IGNvZGU6ICdyYXRlX2xpbWl0X2Vycm9yJywgbWVzc2FnZTogJ3Nsb3cgZG93bicgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0gc2F0aXNmaWVzIElGb3J3YXJkZWRDaGF0RXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbnVsbCByZXF1ZXN0IGlkIGJlY29tZXMgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IobWFrZUFwaUVycm9yKDUwMCwgJ2FwaV9lcnJvcicsICdib29tJywgbnVsbCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcndhcmRlZC5mZXRjaEVycm9yLnJlcXVlc3RJZCwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgQ0FQSSBjb2RlIGFuZCBtZXNzYWdlIGZyb20gYSBzeW50aGVzaXplZCBlcnJvciBib2R5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IHsgbWVzc2FnZTogJ1lvdSBoYXZlIGV4Y2VlZGVkIHlvdXIgbW9udGhseSBxdW90YScsIGNvZGU6ICdxdW90YV9leGNlZWRlZCcgfSB9KTtcblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKG1ha2VBcGlFcnJvcig0MDIsICdhcGlfZXJyb3InLCBib2R5KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZvcndhcmRlZCwge1xuXHRcdFx0XHRmZXRjaEVycm9yOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3F1b3RhRXhjZWVkZWQnLFxuXHRcdFx0XHRcdHJlYXNvbjogJ1lvdSBoYXZlIGV4Y2VlZGVkIHlvdXIgbW9udGhseSBxdW90YScsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiAncmVxLTEnLFxuXHRcdFx0XHRcdGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnLCBtZXNzYWdlOiAnWW91IGhhdmUgZXhjZWVkZWQgeW91ciBtb250aGx5IHF1b3RhJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUZvcndhcmRlZENoYXRFcnJvcik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlbmNvZGUgLyBwYXJzZSByb3VuZC10cmlwJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncm91bmQtdHJpcHMgYSBmb3J3YXJkZWQgZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKG1ha2VBcGlFcnJvcig0MDIsICdxdW90YV9lcnJvcicsICdubyBjcmVkaXRzJykpO1xuXHRcdFx0Y29uc3QgZW5jb2RlZCA9IGVuY29kZUZvcndhcmRlZENoYXRFcnJvcihvcmlnaW5hbCk7XG5cdFx0XHRhc3NlcnQub2soZW5jb2RlZC5zdGFydHNXaXRoKFBST1hZX0VSUk9SX1BSRUZJWCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvcihlbmNvZGVkKSwgb3JpZ2luYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYSBtYXJrZXIgZW1iZWRkZWQgbWlkLW1lc3NhZ2UsIHN0b3BwaW5nIGF0IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKG1ha2VBcGlFcnJvcig0MjksICdyYXRlX2xpbWl0X2Vycm9yJywgJ3Nsb3cgZG93bicpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBgQ0FQSSByZXF1ZXN0IGZhaWxlZDogNDI5IFRvbyBNYW55IFJlcXVlc3RzIFxcdTIwMTQgc2xvdyBkb3duICR7ZW5jb2RlRm9yd2FyZGVkQ2hhdEVycm9yKG9yaWdpbmFsKX0gdHJhaWxpbmcgd29yZHNgO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvcih0ZXh0KSwgb3JpZ2luYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBtYXJrZXIgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvcih1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKCdqdXN0IGEgcGxhaW4gZXJyb3IgbWVzc2FnZScpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbWFsZm9ybWVkIGJhc2U2NCBwYXlsb2FkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKGAke1BST1hZX0VSUk9SX1BSRUZJWH1ub3QtdmFsaWQtYmFzZTY0ISEhYCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZSBkZWNvZGVkIHBheWxvYWQgbGFja3MgYSBmZXRjaEVycm9yIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBiYWRQYXlsb2FkID0gYCR7UFJPWFlfRVJST1JfUFJFRklYfSR7QnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoeyBmZXRjaEVycm9yOiB7fSB9KSkudG9TdHJpbmcoJ2Jhc2U2NCcpfWA7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ5UGFyc2VGb3J3YXJkZWRDaGF0RXJyb3IoYmFkUGF5bG9hZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYW4gb3ZlcnNpemVkIG1hcmtlciBwYXlsb2FkIHdpdGhvdXQgZGVjb2RpbmcgaXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIG1hcmtlciB0aGF0IHJvZGUgYWxvbmcgaW4gbW9kZWwtaW5mbHVlbmNlZCB0ZXh0IGNvdWxkIGJlIGFyYml0cmFyaWx5XG5cdFx0XHQvLyBsYXJnZTsgdGhlIHBhcnNlciBtdXN0IHJlamVjdCBpdCBiZWZvcmUgYWxsb2NhdGluZy9kZWNvZGluZy5cblx0XHRcdGNvbnN0IGh1Z2UgPSBgJHtQUk9YWV9FUlJPUl9QUkVGSVh9JHsnQScucmVwZWF0KDkgKiAxMDI0KX1gO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKGh1Z2UpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tRmllbGRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWFwcyBDb3BpbG90IFNESyBlcnJvciBjYXRlZ29yaWVzIHRvIGZldGNoIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gW1xuXHRcdFx0XHR7IGVycm9yVHlwZTogJ3F1b3RhJywgbWVzc2FnZTogJ3EnIH0sXG5cdFx0XHRcdHsgZXJyb3JUeXBlOiAncmF0ZV9saW1pdCcsIG1lc3NhZ2U6ICdyJyB9LFxuXHRcdFx0XHR7IGVycm9yVHlwZTogJ2NvbnRleHRfbGltaXQnLCBtZXNzYWdlOiAnYycgfSxcblx0XHRcdFx0eyBlcnJvclR5cGU6ICdhdXRoZW50aWNhdGlvbicsIG1lc3NhZ2U6ICdhJyB9LFxuXHRcdFx0XHR7IGVycm9yVHlwZTogJ2F1dGhvcml6YXRpb24nLCBtZXNzYWdlOiAnYScgfSxcblx0XHRcdF0ubWFwKGRhdGEgPT4gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tRmllbGRzKGRhdGEpPy5mZXRjaEVycm9yLnR5cGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFsncXVvdGFFeGNlZWRlZCcsICdyYXRlTGltaXRlZCcsICdsZW5ndGgnLCAnYWdlbnRfdW5hdXRob3JpemVkJywgJ2FnZW50X3VuYXV0aG9yaXplZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhcnJpZXMgY29kZSwgbWVzc2FnZSwgYW5kIHJlcXVlc3QgaWRzIGZvciBhIHF1b3RhIGVycm9yJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3JGcm9tRmllbGRzKHtcblx0XHRcdFx0ZXJyb3JUeXBlOiAncXVvdGEnLFxuXHRcdFx0XHRlcnJvckNvZGU6ICdxdW90YV9leGNlZWRlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdZb3UgaGF2ZSBleGNlZWRlZCB5b3VyIG1vbnRobHkgcXVvdGEnLFxuXHRcdFx0XHRzdGF0dXNDb2RlOiA0MDIsXG5cdFx0XHRcdHByb3ZpZGVyQ2FsbElkOiAnZ2gtMScsXG5cdFx0XHRcdHNlcnZpY2VSZXF1ZXN0SWQ6ICdzdmMtMicsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm9yd2FyZGVkLCB7XG5cdFx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0XHR0eXBlOiAncXVvdGFFeGNlZWRlZCcsXG5cdFx0XHRcdFx0cmVhc29uOiAnWW91IGhhdmUgZXhjZWVkZWQgeW91ciBtb250aGx5IHF1b3RhJyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICdnaC0xJyxcblx0XHRcdFx0XHRzZXJ2ZXJSZXF1ZXN0SWQ6ICdzdmMtMicsXG5cdFx0XHRcdFx0Y2FwaUVycm9yOiB7IGNvZGU6ICdxdW90YV9leGNlZWRlZCcsIG1lc3NhZ2U6ICdZb3UgaGF2ZSBleGNlZWRlZCB5b3VyIG1vbnRobHkgcXVvdGEnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9IHNhdGlzZmllcyBJRm9yd2FyZGVkQ2hhdEVycm9yKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIGEgcXVvdGEgZXJyb3Igd2l0aG91dCBhbiBleHBsaWNpdCBjb2RlIHRvIHF1b3RhX2V4Y2VlZGVkIHNvIHRoZSBwbGFuIG1lc3NhZ2UgcmVuZGVycycsICgpID0+IHtcblx0XHRcdC8vIFRoZSBDb3BpbG90IENMSSBTREsgcmVwb3J0cyBxdW90YSBlcnJvcnMgb25seSB2aWEgYGVycm9yVHlwZTogJ3F1b3RhJ2Bcblx0XHRcdC8vIChubyBmaW5lLWdyYWluZWQgQ0FQSSBjb2RlKS4gV2l0aG91dCB0aGUgZGVmYXVsdCwgdGhlIGNvcmUgZm9ybWF0dGVyXG5cdFx0XHQvLyB3b3VsZCBmYWxsIHRocm91Z2ggdG8gdGhlIGdlbmVyaWMgXCJRdW90YSBFeGNlZWRlZFwiIHRpdGxlLlxuXHRcdFx0Y29uc3QgZnJvbVR5cGUgPSBidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21GaWVsZHMoeyBlcnJvclR5cGU6ICdxdW90YScsIG1lc3NhZ2U6ICdubyBjcmVkaXRzJyB9KTtcblx0XHRcdGNvbnN0IGZyb21TdGF0dXMgPSBidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21GaWVsZHMoeyBlcnJvclR5cGU6ICd1bmtub3duJywgbWVzc2FnZTogJ25vIGNyZWRpdHMnLCBzdGF0dXNDb2RlOiA0MDIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtmcm9tVHlwZT8uZmV0Y2hFcnJvci5jYXBpRXJyb3I/LmNvZGUsIGZyb21TdGF0dXM/LmZldGNoRXJyb3IuY2FwaUVycm9yPy5jb2RlXSwgWydxdW90YV9leGNlZWRlZCcsICdxdW90YV9leGNlZWRlZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gc3RhdHVzLWNvZGUgbWFwcGluZyBmb3IgYW4gdW5rbm93biBjYXRlZ29yeScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21GaWVsZHMoeyBlcnJvclR5cGU6ICdzb21ldGhpbmcnLCBtZXNzYWdlOiAnbScsIHN0YXR1c0NvZGU6IDQyOSB9KT8uZmV0Y2hFcnJvci50eXBlLCAncmF0ZUxpbWl0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBhbiB1bmNsYXNzaWZpYWJsZSBlcnJvcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChidWlsZEZvcndhcmRlZENoYXRFcnJvckZyb21GaWVsZHMoeyBlcnJvclR5cGU6ICdxdWVyeScsIG1lc3NhZ2U6ICdiYWQgaW5wdXQnIH0pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWV0YSBoZWxwZXJzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndG9DaGF0RXJyb3JNZXRhIG5lc3RzIHVuZGVyIGNoYXRFcnJvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKG1ha2VBcGlFcnJvcig0MDQsICdub3RfZm91bmRfZXJyb3InLCAnbWlzc2luZycpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9DaGF0RXJyb3JNZXRhKGZvcndhcmRlZCksIHsgY2hhdEVycm9yOiBmb3J3YXJkZWQgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnlCdWlsZENoYXRFcnJvck1ldGEgcmV0dXJucyB0aGUgbWV0YSByZWNvcmQgZm9yIGEgbWFya2VkIG1lc3NhZ2UsIGVsc2UgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IobWFrZUFwaUVycm9yKDQwMiwgJ3F1b3RhX2Vycm9yJywgJ25vIGNyZWRpdHMnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyeUJ1aWxkQ2hhdEVycm9yTWV0YShlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IoZm9yd2FyZGVkKSksIHsgY2hhdEVycm9yOiBmb3J3YXJkZWQgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJ5QnVpbGRDaGF0RXJyb3JNZXRhKCdwbGFpbiBtZXNzYWdlJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleHRyYWN0Rm9yd2FyZGVkRXJyb3JJbmZvJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RyaXBzIHRoZSBtYXJrZXIgYW5kIGF0dGFjaGVzIF9tZXRhIGZvciBhIG1hcmtlZCBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYnVpbGRGb3J3YXJkZWRDaGF0RXJyb3IobWFrZUFwaUVycm9yKDQwMiwgJ3F1b3RhX2Vycm9yJywgJ25vIGNyZWRpdHMnKSk7XG5cdFx0XHRjb25zdCBtYXJrZWQgPSBgcXVvdGEgJHtlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IoZm9yd2FyZGVkKX1gO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0Rm9yd2FyZGVkRXJyb3JJbmZvKG1hcmtlZCksIHsgbWVzc2FnZTogJ3F1b3RhJywgX21ldGE6IHsgY2hhdEVycm9yOiBmb3J3YXJkZWQgfSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIG1lc3NhZ2UgdW5jaGFuZ2VkIGFuZCBvbWl0cyBfbWV0YSBmb3IgYSBwbGFpbiBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8oJ3NvbWV0aGluZyB3ZW50IHdyb25nJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluZm8sIHsgbWVzc2FnZTogJ3NvbWV0aGluZyB3ZW50IHdyb25nJyB9KTtcblx0XHRcdGFzc2VydC5vayghT2JqZWN0Lmhhc093bihpbmZvLCAnX21ldGEnKSwgJ19tZXRhIHNob3VsZCBiZSBvbWl0dGVkLCBub3Qgc2V0IHRvIHVuZGVmaW5lZCcpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdz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
