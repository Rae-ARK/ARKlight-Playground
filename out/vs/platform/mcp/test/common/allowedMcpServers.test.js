import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { checkMcpServerAllowed, getMcpServerMatchers, isMcpServerMatched, McpServerAllowResult } from "../../common/allowedMcpServers.js";
suite("AllowedMcpServers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getMcpServerMatchers", () => {
    test("coerces non-arrays to undefined", () => {
      assert.strictEqual(getMcpServerMatchers(null), void 0);
      assert.strictEqual(getMcpServerMatchers(void 0), void 0);
      assert.strictEqual(getMcpServerMatchers(true), void 0);
      assert.strictEqual(getMcpServerMatchers("[]"), void 0);
      assert.strictEqual(getMcpServerMatchers({ allowed: [] }), void 0);
    });
    test("empty array is preserved", () => {
      assert.deepStrictEqual(getMcpServerMatchers([]), []);
    });
    test("drops malformed and multi-field matcher entries", () => {
      const value = [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] },
        { serverName: "" },
        // empty string dropped
        { serverCommand: [] },
        // empty array dropped
        { serverCommand: ["ok", 5] },
        // non-string element dropped
        { serverName: "a", serverUrl: "b" },
        // more than one field dropped
        {},
        // no field dropped
        "string-entry"
        // non-object dropped
      ];
      assert.deepStrictEqual(getMcpServerMatchers(value), [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] }
      ]);
    });
  });
  suite("isMcpServerMatched", () => {
    test("undefined and empty match nothing", () => {
      assert.strictEqual(isMcpServerMatched(void 0, { name: "x" }), false);
      assert.strictEqual(isMcpServerMatched([], { name: "x" }), false);
    });
    test("matches by server name", () => {
      const matchers = [{ serverName: "github" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "github" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "gitlab" }), false);
    });
    test("matches by remote URL with wildcards, case-insensitively", () => {
      const matchers = [{ serverUrl: "https://*.example.com/*" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/api" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://MCP.EXAMPLE.COM/api" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://example.com/api" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.evil.com/api" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://evil.test/.example.com/tool" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["node", "x.js"] }), false);
    });
    test("exact URL pattern matches only that URL", () => {
      const matchers = [{ serverUrl: "https://mcp.example.com/mcp" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/mcp" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/mcp/extra" }), false);
    });
    test("matches by local command as an ordered argument list", () => {
      const matchers = [{ serverCommand: ["npx", "-y", "server"] }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "-y", "server"] }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "server"] }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "-y", "server", "--flag"] }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com" }), false);
    });
  });
  suite("checkMcpServerAllowed", () => {
    test("no lists configured allows everything", () => {
      assert.strictEqual(checkMcpServerAllowed(void 0, void 0, { name: "x" }), McpServerAllowResult.Allowed);
    });
    test("empty allowlist blocks everything as NotAllowed", () => {
      assert.strictEqual(checkMcpServerAllowed([], void 0, { name: "x" }), McpServerAllowResult.NotAllowed);
    });
    test("allowlist permits only matching servers", () => {
      const allow = [{ serverName: "github" }];
      assert.strictEqual(checkMcpServerAllowed(allow, void 0, { name: "github" }), McpServerAllowResult.Allowed);
      assert.strictEqual(checkMcpServerAllowed(allow, void 0, { name: "other" }), McpServerAllowResult.NotAllowed);
    });
    test("deny takes precedence over allow", () => {
      const allow = [{ serverName: "github" }];
      const deny = [{ serverName: "github" }];
      assert.strictEqual(checkMcpServerAllowed(allow, deny, { name: "github" }), McpServerAllowResult.Denied);
    });
    test("deny blocks even when no allowlist is configured", () => {
      const deny = [{ serverUrl: "https://*.untrusted.example.com/*" }];
      assert.strictEqual(checkMcpServerAllowed(void 0, deny, { name: "s", url: "https://api.untrusted.example.com/mcp" }), McpServerAllowResult.Denied);
      assert.strictEqual(checkMcpServerAllowed(void 0, deny, { name: "s", url: "https://api.trusted.example.com/mcp" }), McpServerAllowResult.Allowed);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC90ZXN0L2NvbW1vbi9hbGxvd2VkTWNwU2VydmVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjaGVja01jcFNlcnZlckFsbG93ZWQsIGdldE1jcFNlcnZlck1hdGNoZXJzLCBJTWNwU2VydmVyTWF0Y2hlciwgaXNNY3BTZXJ2ZXJNYXRjaGVkLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hbGxvd2VkTWNwU2VydmVycy5qcyc7XG5cbnN1aXRlKCdBbGxvd2VkTWNwU2VydmVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0TWNwU2VydmVyTWF0Y2hlcnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb2VyY2VzIG5vbi1hcnJheXMgdG8gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcFNlcnZlck1hdGNoZXJzKG51bGwpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldE1jcFNlcnZlck1hdGNoZXJzKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnModHJ1ZSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnMoJ1tdJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnMoeyBhbGxvd2VkOiBbXSB9KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGFycmF5IGlzIHByZXNlcnZlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnMoW10pLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBtYWxmb3JtZWQgYW5kIG11bHRpLWZpZWxkIG1hdGNoZXIgZW50cmllcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gW1xuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICdnaXRodWInIH0sXG5cdFx0XHRcdHsgc2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vKicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJDb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9LFxuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICcnIH0sIC8vIGVtcHR5IHN0cmluZyBkcm9wcGVkXG5cdFx0XHRcdHsgc2VydmVyQ29tbWFuZDogW10gfSwgLy8gZW1wdHkgYXJyYXkgZHJvcHBlZFxuXHRcdFx0XHR7IHNlcnZlckNvbW1hbmQ6IFsnb2snLCA1XSB9LCAvLyBub24tc3RyaW5nIGVsZW1lbnQgZHJvcHBlZFxuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICdhJywgc2VydmVyVXJsOiAnYicgfSwgLy8gbW9yZSB0aGFuIG9uZSBmaWVsZCBkcm9wcGVkXG5cdFx0XHRcdHt9LCAvLyBubyBmaWVsZCBkcm9wcGVkXG5cdFx0XHRcdCdzdHJpbmctZW50cnknLCAvLyBub24tb2JqZWN0IGRyb3BwZWRcblx0XHRcdF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldE1jcFNlcnZlck1hdGNoZXJzKHZhbHVlKSwgW1xuXHRcdFx0XHR7IHNlcnZlck5hbWU6ICdnaXRodWInIH0sXG5cdFx0XHRcdHsgc2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vKicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJDb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc01jcFNlcnZlck1hdGNoZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd1bmRlZmluZWQgYW5kIGVtcHR5IG1hdGNoIG5vdGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNY3BTZXJ2ZXJNYXRjaGVkKHVuZGVmaW5lZCwgeyBuYW1lOiAneCcgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQoW10sIHsgbmFtZTogJ3gnIH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGJ5IHNlcnZlciBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcnM6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJOYW1lOiAnZ2l0aHViJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ2dpdGh1YicgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAnZ2l0bGFiJyB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBieSByZW1vdGUgVVJMIHdpdGggd2lsZGNhcmRzLCBjYXNlLWluc2Vuc2l0aXZlbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVyczogSU1jcFNlcnZlck1hdGNoZXJbXSA9IFt7IHNlcnZlclVybDogJ2h0dHBzOi8vKi5leGFtcGxlLmNvbS8qJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9hcGknIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL01DUC5FWEFNUExFLkNPTS9hcGknIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2FwaScgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL21jcC5ldmlsLmNvbS9hcGknIH0pLCBmYWxzZSk7XG5cdFx0XHQvLyBBbiBhdXRob3JpdHkgd2lsZGNhcmQgbXVzdCBub3Qgc3dhbGxvdyB0aGUgcGF0aCBzZXBhcmF0b3IgYW5kIGxldCBhbiB1bnRydXN0ZWQgaG9zdCB0aHJvdWdoLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vZXZpbC50ZXN0Ly5leGFtcGxlLmNvbS90b29sJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIGNvbW1hbmQ6IFsnbm9kZScsICd4LmpzJ10gfSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4YWN0IFVSTCBwYXR0ZXJuIG1hdGNoZXMgb25seSB0aGF0IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoZXJzOiBJTWNwU2VydmVyTWF0Y2hlcltdID0gW3sgc2VydmVyVXJsOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20vbWNwJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9tY3AnIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9tY3AvZXh0cmEnIH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGJ5IGxvY2FsIGNvbW1hbmQgYXMgYW4gb3JkZXJlZCBhcmd1bWVudCBsaXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcnM6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJDb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCBjb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInXSB9KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNY3BTZXJ2ZXJNYXRjaGVkKG1hdGNoZXJzLCB7IG5hbWU6ICdzJywgY29tbWFuZDogWyducHgnLCAnc2VydmVyJ10gfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCBjb21tYW5kOiBbJ25weCcsICcteScsICdzZXJ2ZXInLCAnLS1mbGFnJ10gfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbScgfSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NoZWNrTWNwU2VydmVyQWxsb3dlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ25vIGxpc3RzIGNvbmZpZ3VyZWQgYWxsb3dzIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IG5hbWU6ICd4JyB9KSwgTWNwU2VydmVyQWxsb3dSZXN1bHQuQWxsb3dlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBhbGxvd2xpc3QgYmxvY2tzIGV2ZXJ5dGhpbmcgYXMgTm90QWxsb3dlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQoW10sIHVuZGVmaW5lZCwgeyBuYW1lOiAneCcgfSksIE1jcFNlcnZlckFsbG93UmVzdWx0Lk5vdEFsbG93ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dsaXN0IHBlcm1pdHMgb25seSBtYXRjaGluZyBzZXJ2ZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWxsb3c6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJOYW1lOiAnZ2l0aHViJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQoYWxsb3csIHVuZGVmaW5lZCwgeyBuYW1lOiAnZ2l0aHViJyB9KSwgTWNwU2VydmVyQWxsb3dSZXN1bHQuQWxsb3dlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkKGFsbG93LCB1bmRlZmluZWQsIHsgbmFtZTogJ290aGVyJyB9KSwgTWNwU2VydmVyQWxsb3dSZXN1bHQuTm90QWxsb3dlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW55IHRha2VzIHByZWNlZGVuY2Ugb3ZlciBhbGxvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFsbG93OiBJTWNwU2VydmVyTWF0Y2hlcltdID0gW3sgc2VydmVyTmFtZTogJ2dpdGh1YicgfV07XG5cdFx0XHRjb25zdCBkZW55OiBJTWNwU2VydmVyTWF0Y2hlcltdID0gW3sgc2VydmVyTmFtZTogJ2dpdGh1YicgfV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkKGFsbG93LCBkZW55LCB7IG5hbWU6ICdnaXRodWInIH0pLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdC5EZW5pZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVueSBibG9ja3MgZXZlbiB3aGVuIG5vIGFsbG93bGlzdCBpcyBjb25maWd1cmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVueTogSU1jcFNlcnZlck1hdGNoZXJbXSA9IFt7IHNlcnZlclVybDogJ2h0dHBzOi8vKi51bnRydXN0ZWQuZXhhbXBsZS5jb20vKicgfV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkKHVuZGVmaW5lZCwgZGVueSwgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vYXBpLnVudHJ1c3RlZC5leGFtcGxlLmNvbS9tY3AnIH0pLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdC5EZW5pZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrTWNwU2VydmVyQWxsb3dlZCh1bmRlZmluZWQsIGRlbnksIHsgbmFtZTogJ3MnLCB1cmw6ICdodHRwczovL2FwaS50cnVzdGVkLmV4YW1wbGUuY29tL21jcCcgfSksIE1jcFNlcnZlckFsbG93UmVzdWx0LkFsbG93ZWQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCLHNCQUF5QyxvQkFBb0IsNEJBQTRCO0FBRXpILE1BQU0scUJBQXFCLE1BQU07QUFFaEMsMENBQXdDO0FBRXhDLFFBQU0sd0JBQXdCLE1BQU07QUFFbkMsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxhQUFPLFlBQVkscUJBQXFCLElBQUksR0FBRyxNQUFTO0FBQ3hELGFBQU8sWUFBWSxxQkFBcUIsTUFBUyxHQUFHLE1BQVM7QUFDN0QsYUFBTyxZQUFZLHFCQUFxQixJQUFJLEdBQUcsTUFBUztBQUN4RCxhQUFPLFlBQVkscUJBQXFCLElBQUksR0FBRyxNQUFTO0FBQ3hELGFBQU8sWUFBWSxxQkFBcUIsRUFBRSxTQUFTLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBUztBQUFBLElBQ3BFLENBQUM7QUFFRCxTQUFLLDRCQUE0QixNQUFNO0FBQ3RDLGFBQU8sZ0JBQWdCLHFCQUFxQixDQUFDLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBRUQsU0FBSyxtREFBbUQsTUFBTTtBQUM3RCxZQUFNLFFBQVE7QUFBQSxRQUNiLEVBQUUsWUFBWSxTQUFTO0FBQUEsUUFDdkIsRUFBRSxXQUFXLDRCQUE0QjtBQUFBLFFBQ3pDLEVBQUUsZUFBZSxDQUFDLE9BQU8sTUFBTSxRQUFRLEVBQUU7QUFBQSxRQUN6QyxFQUFFLFlBQVksR0FBRztBQUFBO0FBQUEsUUFDakIsRUFBRSxlQUFlLENBQUMsRUFBRTtBQUFBO0FBQUEsUUFDcEIsRUFBRSxlQUFlLENBQUMs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
