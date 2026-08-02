import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isRestrictedTelemetryEnabled, parseCopilotTokenFields } from "../../node/copilot/copilotTokenFields.js";
suite("copilotTokenFields", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseCopilotTokenFields", () => {
    test("returns empty map for undefined token", () => {
      assert.strictEqual(parseCopilotTokenFields(void 0).size, 0);
    });
    test("returns empty map for empty token", () => {
      assert.strictEqual(parseCopilotTokenFields("").size, 0);
    });
    test("parses fields from the leading colon-delimited segment", () => {
      const fields = parseCopilotTokenFields("tid=abc;exp=123;rt=1:HMACSIGNATURE");
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("exp"), "123");
      assert.strictEqual(fields.get("rt"), "1");
    });
    test("parses fields when no colon separator is present", () => {
      const fields = parseCopilotTokenFields("tid=abc;rt=1");
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("rt"), "1");
    });
    test("skips segments without a value separator", () => {
      const fields = parseCopilotTokenFields("tid=abc;rt;exp=123:HMAC");
      assert.strictEqual(fields.has("rt"), false);
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("exp"), "123");
    });
  });
  suite("isRestrictedTelemetryEnabled", () => {
    test("false for undefined token", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled(void 0), false);
    });
    test("false for empty token", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled(""), false);
    });
    test("false when rt field is missing", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;exp=123:HMAC"), false);
    });
    test("false when rt=0", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=0;exp=123:HMAC"), false);
    });
    test("true when rt=1 with other fields", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=1;exp=123:HMAC"), true);
    });
    test("true when rt=1 is the first field", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("rt=1;tid=abc:HMAC"), true);
    });
    test("true when rt=1 is the last field", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;exp=123;rt=1:HMAC"), true);
    });
    test("true when token has no colon-delimited signature segment", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=1"), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdFRva2VuRmllbGRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsIHBhcnNlQ29waWxvdFRva2VuRmllbGRzIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RUb2tlbkZpZWxkcy5qcyc7XG5cbnN1aXRlKCdjb3BpbG90VG9rZW5GaWVsZHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNlQ29waWxvdFRva2VuRmllbGRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgbWFwIGZvciB1bmRlZmluZWQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDb3BpbG90VG9rZW5GaWVsZHModW5kZWZpbmVkKS5zaXplLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgbWFwIGZvciBlbXB0eSB0b2tlbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcygnJykuc2l6ZSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgZmllbGRzIGZyb20gdGhlIGxlYWRpbmcgY29sb24tZGVsaW1pdGVkIHNlZ21lbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWVsZHMgPSBwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcygndGlkPWFiYztleHA9MTIzO3J0PTE6SE1BQ1NJR05BVFVSRScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZWxkcy5nZXQoJ3RpZCcpLCAnYWJjJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmllbGRzLmdldCgnZXhwJyksICcxMjMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuZ2V0KCdydCcpLCAnMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGZpZWxkcyB3aGVuIG5vIGNvbG9uIHNlcGFyYXRvciBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmllbGRzID0gcGFyc2VDb3BpbG90VG9rZW5GaWVsZHMoJ3RpZD1hYmM7cnQ9MScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZWxkcy5nZXQoJ3RpZCcpLCAnYWJjJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmllbGRzLmdldCgncnQnKSwgJzEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIHNlZ21lbnRzIHdpdGhvdXQgYSB2YWx1ZSBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWVsZHMgPSBwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcygndGlkPWFiYztydDtleHA9MTIzOkhNQUMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuaGFzKCdydCcpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmllbGRzLmdldCgndGlkJyksICdhYmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuZ2V0KCdleHAnKSwgJzEyMycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCcsICgpID0+IHtcblx0XHR0ZXN0KCdmYWxzZSBmb3IgdW5kZWZpbmVkIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQodW5kZWZpbmVkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsc2UgZm9yIGVtcHR5IHRva2VuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoJycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxzZSB3aGVuIHJ0IGZpZWxkIGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgndGlkPWFiYztleHA9MTIzOkhNQUMnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsc2Ugd2hlbiBydD0wJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoJ3RpZD1hYmM7cnQ9MDtleHA9MTIzOkhNQUMnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1ZSB3aGVuIHJ0PTEgd2l0aCBvdGhlciBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgndGlkPWFiYztydD0xO2V4cD0xMjM6SE1BQycpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydWUgd2hlbiBydD0xIGlzIHRoZSBmaXJzdCBmaWVsZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKCdydD0xO3RpZD1hYmM6SE1BQycpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydWUgd2hlbiBydD0xIGlzIHRoZSBsYXN0IGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoJ3RpZD1hYmM7ZXhwPTEyMztydD0xOkhNQUMnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVlIHdoZW4gdG9rZW4gaGFzIG5vIGNvbG9uLWRlbGltaXRlZCBzaWduYXR1cmUgc2VnbWVudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKCd0aWQ9YWJjO3J0PTEnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw4QkFBOEIsK0JBQStCO0FBRXRFLE1BQU0sc0JBQXNCLE1BQU07QUFFakMsMENBQXdDO0FBRXhDLFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsU0FBSyx5Q0FBeUMsTUFBTTtBQUNuRCxhQUFPLFlBQVksd0JBQXdCLE1BQVMsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUM5RCxDQUFDO0FBRUQsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxhQUFPLFlBQVksd0JBQXdCLEVBQUUsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUN2RCxDQUFDO0FBRUQsU0FBSywwREFBMEQsTUFBTTtBQUNwRSxZQUFNLFNBQVMsd0JBQXdCLG9DQUFvQztBQUMzRSxhQUFPLFlBQVksT0FBTyxJQUFJLEtBQUssR0FBRyxLQUFLO0FBQzNDLGFBQU8sWUFBWSxPQUFPLElBQUksS0FBSyxHQUFHLEtBQUs7QUFDM0MsYUFBTyxZQUFZLE9BQU8sSUFBSSxJQUFJLEdBQUcsR0FBRztBQUFBLElBQ3pDLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxNQUFNO0FBQzlELFlBQU0sU0FBUyx3QkFBd0IsY0FBYztBQUNyRCxhQUFPLFlBQVksT0FBTyxJQUFJLEtBQUssR0FBRyxLQUFLO0FBQzNDLGFBQU8sWUFBWSxPQUFPLElBQUksSUFBSSxHQUFHLEdBQUc7QUFBQSxJQUN6QyxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFNBQVMsd0JBQXdCLHlCQUF5QjtBQUNoRSxhQUFPLFlBQVksT0FBTyxJQUFJLElBQUksR0FBRyxLQUFLO0FBQzFDLGFBQU8sWUFBWSxPQUFPLElBQUksS0FBSyxHQUFHLEtBQUs7QUFDM0MsYUFBTyxZQUFZLE9BQU8sSUFBSSxLQUFLLEdBQUcsS0FBSztBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLGdDQUFnQyxNQUFNO0FBQzNDLFNBQUssNkJBQTZCLE1BQU07QUFDdkMsYUFBTyxZQUFZLDZCQUE2QixNQUFTLEdBQUcsS0FBSztBQUFBLElBQ2xFLENBQUM7QUFFRCxTQUFLLHlCQUF5QixNQUFNO0FBQ25DLGFBQU8sWUFBWSw2QkFBNkIsRUFBRSxHQUFHLEtBQUs7QUFBQSxJQUMzRCxDQUFDO0FBRUQsU0FBSyxrQ0FBa0MsTUFBTTtBQUM1QyxhQUFPLFlBQVksNkJBQTZCLHNCQUFzQixHQUFHLEtBQUs7QUFBQSxJQUMvRSxDQUFDO0FBRUQsU0FBSyxtQkFBbUIsTUFBTTtBQUM3QixhQUFPLFlBQVksNkJBQTZCLDJCQUEyQixHQUFHLEtBQUs7QUFBQSxJQUNwRixDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxhQUFPLFlBQVksNkJBQTZCLDJCQUEyQixHQUFHLElBQUk7QUFBQSxJQUNuRixDQUFDO0FBRUQsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxhQUFPLFlBQVksNkJBQTZCLG1CQUFtQixHQUFHLElBQUk7QUFBQSxJQUMzRSxDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxhQUFPLFlBQVksNkJBQTZCLDJCQUEyQixHQUFHLElBQUk7QUFBQSxJQUNuRixDQUFDO0FBRUQsU0FBSyw0REFBNEQsTUFBTTtBQUN0RSxhQUFPLFlBQVksNkJBQTZCLGNBQWMsR0FBRyxJQUFJO0FBQUEsSUFDdEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
