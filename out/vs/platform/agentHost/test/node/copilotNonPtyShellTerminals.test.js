import { deepStrictEqual, ok, strictEqual } from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NonPtyShellTerminalStreams } from "../../node/copilot/copilotNonPtyShellTerminals.js";
import { TestAgentHostTerminalManager } from "./testAgentHostTerminalManager.js";
suite("NonPtyShellTerminalStreams", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let manager;
  let streams;
  setup(() => {
    manager = store.add(new TestAgentHostTerminalManager());
    streams = store.add(new NonPtyShellTerminalStreams(URI.parse("agenthost-session://test/session-1"), manager));
  });
  function channelContent() {
    return manager.outputTerminalData.map((d) => d.data).join("");
  }
  suite("rolling-tail snapshot stitching", () => {
    test("appends only the unseen suffix when the snapshot is a rolling tail, without resetting", () => {
      streams.track("call-1", "shell");
      streams.append("call-1", "line 1\r\nline 2\r\nline 3\r\n");
      streams.append("call-1", "line 2\r\nline 3\r\nline 4\r\n");
      streams.append("call-1", "line 4\r\nline 5\r\nline 6\r\n");
      deepStrictEqual(manager.outputTerminalResets, [], "rolling tails must not reset the channel");
      strictEqual(channelContent(), "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\nline 6\r\n");
    });
    test("truncated completion preview does not discard the streamed transcript", () => {
      streams.track("call-2", "shell");
      streams.append("call-2", "line 1\r\nline 2\r\nline 3\r\n");
      streams.append("call-2", "line 3\r\nline 4\r\nline 5\r\n");
      const completion = streams.completeToolCall("call-2", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 4\r\nline 5\r\n", truncated: true }
      });
      ok(completion);
      deepStrictEqual(manager.outputTerminalResets, []);
      strictEqual(channelContent(), "line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n");
      deepStrictEqual(manager.outputTerminalsFinalized, [{ uri: completion.uri, exitCode: 0 }]);
    });
    test("preserves the transcript across truncation marker rewrites and disjoint rolling tails", () => {
      streams.track("call-3", "shell");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n");
      streams.append("call-3", "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 99 lines from the end>\n");
      streams.append("call-3", "line 498\r\nline 499\r\nline 500\r\n");
      streams.append("call-3", "line 499\r\nline 500\r\nline 501\r\n");
      streams.append("call-3", "line 700\r\nline 701\r\nline 702\r\n");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: [
          "line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n",
          "line 500\r\n",
          "line 501\r\n",
          "line 700\r\nline 701\r\nline 702\r\n"
        ].join("")
      });
    });
    test("recognizes the single-line character truncation marker", () => {
      streams.track("call-4", "shell");
      streams.append("call-4", "abcdefghij");
      streams.append("call-4", "abcdefghij<output too long - dropped 5 characters from the end>");
      streams.append("call-4", "abcdefghij<output too long - dropped 8 characters from the end>");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: "abcdefghij<output too long - dropped 5 characters from the end>"
      });
    });
    test("preserves a direct transition to disjoint shorter tails", () => {
      streams.track("call-5", "shell");
      streams.append("call-5", "alpha beta gamma\r\n");
      streams.append("call-5", "tail one\r\n");
      streams.append("call-5", "tail two\r\n");
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        content: channelContent()
      }, {
        resets: [],
        content: "alpha beta gamma\r\ntail one\r\ntail two\r\n"
      });
    });
    test("does not append a truncated completion preview after streamed output", () => {
      streams.track("call-6", "shell");
      streams.append("call-6", "line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n");
      streams.append("call-6", "line 498\r\nline 499\r\nline 500\r\n");
      streams.completeToolCall("call-6", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: true }
      });
      strictEqual(channelContent(), [
        "line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n",
        "line 498\r\nline 499\r\nline 500\r\n"
      ].join(""));
    });
    test("seeds a zero-partial terminal from its truncated completion preview", () => {
      streams.track("call-7", "shell");
      streams.completeToolCall("call-7", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: true }
      });
      strictEqual(channelContent(), "line 1\r\nline 2\r\n");
    });
    test("replaces a truncated stream with an authoritative non-truncated completion preview", () => {
      streams.track("call-8", "shell");
      const appended = streams.append("call-8", "head\r\n<output too long - dropped 42 lines from the end>\n");
      ok(appended);
      streams.completeToolCall("call-8", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "complete output\r\n", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [appended.uri],
        data: [
          { uri: appended.uri, data: "head\r\n<output too long - dropped 42 lines from the end>\n" },
          { uri: appended.uri, data: "complete output\r\n" }
        ]
      });
    });
    test("clears stale streamed output when the authoritative completion preview is empty", () => {
      streams.track("call-9", "shell");
      const appended = streams.append("call-9", "stale output\r\n");
      ok(appended);
      streams.completeToolCall("call-9", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [appended.uri],
        data: [{ uri: appended.uri, data: "stale output\r\n" }]
      });
    });
    test("appends a prefix-stable authoritative completion preview", () => {
      streams.track("call-10", "shell");
      const appended = streams.append("call-10", "line 1\r\n");
      ok(appended);
      streams.completeToolCall("call-10", void 0, {
        shellId: "shell-1",
        result: { exitCode: 0, preview: "line 1\r\nline 2\r\n", truncated: false }
      });
      deepStrictEqual({
        resets: manager.outputTerminalResets,
        data: manager.outputTerminalData
      }, {
        resets: [],
        data: [
          { uri: appended.uri, data: "line 1\r\n" },
          { uri: appended.uri, data: "line 2\r\n" }
        ]
      });
    });
    test("an unrelated rewrite still resets the channel", () => {
      streams.track("call-11", "shell");
      streams.append("call-11", "alpha beta gamma\r\n");
      streams.append("call-11", "completely different content\r\n");
      strictEqual(manager.outputTerminalResets.length, 1);
      deepStrictEqual(manager.outputTerminalData.map((d) => d.data), ["alpha beta gamma\r\n", "completely different content\r\n"]);
    });
  });
  suite("completion and lifecycle", () => {
    test("parses fallback completion, finalizes once, and ignores later output", () => {
      streams.track("call-12", "shell");
      const completion = streams.completeToolCall("call-12", "fallback output\r\n<shellId: shell-1 completed with exit code -1>", void 0);
      streams.completeToolCall("call-12", "different output\r\n<shellId: shell-1 completed with exit code -1>", void 0);
      streams.append("call-12", "late output\r\n");
      deepStrictEqual({
        completion,
        content: channelContent(),
        finalized: manager.outputTerminalsFinalized
      }, {
        completion: {
          uri: "agenthost-terminal://shell/session-1/call-12",
          result: { exitCode: -1, preview: "fallback output\r\n" },
          shouldRetire: true
        },
        content: "fallback output\r\n",
        finalized: [{ uri: "agenthost-terminal://shell/session-1/call-12", exitCode: -1 }]
      });
    });
    test("drops an unstarted stream without completion data", () => {
      streams.track("call-13", "shell");
      strictEqual(streams.completeToolCall("call-13", void 0, void 0), void 0);
      strictEqual(streams.append("call-13", "late output"), void 0);
    });
    test("keeps a started stream alive without completion data", () => {
      streams.track("call-14", "shell");
      const appended = streams.append("call-14", "partial output");
      ok(appended);
      deepStrictEqual(streams.completeToolCall("call-14", void 0, void 0), {
        uri: appended.uri,
        shouldRetire: false
      });
    });
    test("retires a stream exactly once", () => {
      streams.track("call-15", "shell");
      const appended = streams.append("call-15", "partial output");
      ok(appended);
      streams.retire("call-15");
      streams.retire("call-15");
      deepStrictEqual(manager.disposedTerminals, [appended.uri]);
      strictEqual(streams.append("call-15", "late output"), void 0);
    });
    test("ignores append and completion for an untracked tool call", () => {
      strictEqual(streams.append("missing", "output"), void 0);
      strictEqual(streams.completeToolCall("missing", void 0, void 0), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29waWxvdE5vblB0eVNoZWxsVGVybWluYWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcyB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90Tm9uUHR5U2hlbGxUZXJtaW5hbHMuanMnO1xuaW1wb3J0IHsgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vdGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5cbnN1aXRlKCdOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcycsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgbWFuYWdlcjogVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcjtcblx0bGV0IHN0cmVhbXM6IE5vblB0eVNoZWxsVGVybWluYWxTdHJlYW1zO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtYW5hZ2VyID0gc3RvcmUuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKCkpO1xuXHRcdHN0cmVhbXMgPSBzdG9yZS5hZGQobmV3IE5vblB0eVNoZWxsVGVybWluYWxTdHJlYW1zKFVSSS5wYXJzZSgnYWdlbnRob3N0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24tMScpLCBtYW5hZ2VyKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNoYW5uZWxDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1hbmFnZXIub3V0cHV0VGVybWluYWxEYXRhLm1hcChkID0+IGQuZGF0YSkuam9pbignJyk7XG5cdH1cblxuXHRzdWl0ZSgncm9sbGluZy10YWlsIHNuYXBzaG90IHN0aXRjaGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdhcHBlbmRzIG9ubHkgdGhlIHVuc2VlbiBzdWZmaXggd2hlbiB0aGUgc25hcHNob3QgaXMgYSByb2xsaW5nIHRhaWwsIHdpdGhvdXQgcmVzZXR0aW5nJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xJywgJ3NoZWxsJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0xJywgJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMScsICdsaW5lIDJcXHJcXG5saW5lIDNcXHJcXG5saW5lIDRcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTEnLCAnbGluZSA0XFxyXFxubGluZSA1XFxyXFxubGluZSA2XFxyXFxuJyk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbChtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLCBbXSwgJ3JvbGxpbmcgdGFpbHMgbXVzdCBub3QgcmVzZXQgdGhlIGNoYW5uZWwnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNoYW5uZWxDb250ZW50KCksICdsaW5lIDFcXHJcXG5saW5lIDJcXHJcXG5saW5lIDNcXHJcXG5saW5lIDRcXHJcXG5saW5lIDVcXHJcXG5saW5lIDZcXHJcXG4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydW5jYXRlZCBjb21wbGV0aW9uIHByZXZpZXcgZG9lcyBub3QgZGlzY2FyZCB0aGUgc3RyZWFtZWQgdHJhbnNjcmlwdCcsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtMicsICdzaGVsbCcpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMicsICdsaW5lIDFcXHJcXG5saW5lIDJcXHJcXG5saW5lIDNcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTInLCAnbGluZSAzXFxyXFxubGluZSA0XFxyXFxubGluZSA1XFxyXFxuJyk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtMicsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzaGVsbElkOiAnc2hlbGwtMScsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2xpbmUgNFxcclxcbmxpbmUgNVxcclxcbicsIHRydW5jYXRlZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soY29tcGxldGlvbik7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobWFuYWdlci5vdXRwdXRUZXJtaW5hbFJlc2V0cywgW10pO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2hhbm5lbENvbnRlbnQoKSwgJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbmxpbmUgM1xcclxcbmxpbmUgNFxcclxcbmxpbmUgNVxcclxcbicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKG1hbmFnZXIub3V0cHV0VGVybWluYWxzRmluYWxpemVkLCBbeyB1cmk6IGNvbXBsZXRpb24udXJpLCBleGl0Q29kZTogMCB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdGhlIHRyYW5zY3JpcHQgYWNyb3NzIHRydW5jYXRpb24gbWFya2VyIHJld3JpdGVzIGFuZCBkaXNqb2ludCByb2xsaW5nIHRhaWxzJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0zJywgJ3NoZWxsJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0zJywgJ2xpbmUgMVxcclxcbmxpbmUgNDk4XFxyXFxubGluZSA0OTlcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTMnLCAnbGluZSAxXFxyXFxubGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbjxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDQyIGxpbmVzIGZyb20gdGhlIGVuZD5cXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTMnLCAnbGluZSAxXFxyXFxubGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbjxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDk5IGxpbmVzIGZyb20gdGhlIGVuZD5cXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTMnLCAnbGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbmxpbmUgNTAwXFxyXFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC0zJywgJ2xpbmUgNDk5XFxyXFxubGluZSA1MDBcXHJcXG5saW5lIDUwMVxcclxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtMycsICdsaW5lIDcwMFxcclxcbmxpbmUgNzAxXFxyXFxubGluZSA3MDJcXHJcXG4nKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRjb250ZW50OiBjaGFubmVsQ29udGVudCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNldHM6IFtdLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0J2xpbmUgMVxcclxcbmxpbmUgNDk4XFxyXFxubGluZSA0OTlcXHJcXG48b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA0MiBsaW5lcyBmcm9tIHRoZSBlbmQ+XFxuJyxcblx0XHRcdFx0XHQnbGluZSA1MDBcXHJcXG4nLFxuXHRcdFx0XHRcdCdsaW5lIDUwMVxcclxcbicsXG5cdFx0XHRcdFx0J2xpbmUgNzAwXFxyXFxubGluZSA3MDFcXHJcXG5saW5lIDcwMlxcclxcbicsXG5cdFx0XHRcdF0uam9pbignJyksXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgdGhlIHNpbmdsZS1saW5lIGNoYXJhY3RlciB0cnVuY2F0aW9uIG1hcmtlcicsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtNCcsICdzaGVsbCcpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtNCcsICdhYmNkZWZnaGlqJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC00JywgJ2FiY2RlZmdoaWo8b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA1IGNoYXJhY3RlcnMgZnJvbSB0aGUgZW5kPicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtNCcsICdhYmNkZWZnaGlqPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgOCBjaGFyYWN0ZXJzIGZyb20gdGhlIGVuZD4nKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRjb250ZW50OiBjaGFubmVsQ29udGVudCgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNldHM6IFtdLFxuXHRcdFx0XHRjb250ZW50OiAnYWJjZGVmZ2hpajxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDUgY2hhcmFjdGVycyBmcm9tIHRoZSBlbmQ+Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGEgZGlyZWN0IHRyYW5zaXRpb24gdG8gZGlzam9pbnQgc2hvcnRlciB0YWlscycsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtNScsICdzaGVsbCcpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtNScsICdhbHBoYSBiZXRhIGdhbW1hXFxyXFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC01JywgJ3RhaWwgb25lXFxyXFxuJyk7XG5cdFx0XHRzdHJlYW1zLmFwcGVuZCgnY2FsbC01JywgJ3RhaWwgdHdvXFxyXFxuJyk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc2V0czogbWFuYWdlci5vdXRwdXRUZXJtaW5hbFJlc2V0cyxcblx0XHRcdFx0Y29udGVudDogY2hhbm5lbENvbnRlbnQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzZXRzOiBbXSxcblx0XHRcdFx0Y29udGVudDogJ2FscGhhIGJldGEgZ2FtbWFcXHJcXG50YWlsIG9uZVxcclxcbnRhaWwgdHdvXFxyXFxuJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXBwZW5kIGEgdHJ1bmNhdGVkIGNvbXBsZXRpb24gcHJldmlldyBhZnRlciBzdHJlYW1lZCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTYnLCAnc2hlbGwnKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTYnLCAnbGluZSAxXFxyXFxubGluZSAyXFxyXFxuPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgNDIgbGluZXMgZnJvbSB0aGUgZW5kPlxcbicpO1xuXHRcdFx0c3RyZWFtcy5hcHBlbmQoJ2NhbGwtNicsICdsaW5lIDQ5OFxcclxcbmxpbmUgNDk5XFxyXFxubGluZSA1MDBcXHJcXG4nKTtcblxuXHRcdFx0c3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTYnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0c2hlbGxJZDogJ3NoZWxsLTEnLFxuXHRcdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IDAsIHByZXZpZXc6ICdsaW5lIDFcXHJcXG5saW5lIDJcXHJcXG4nLCB0cnVuY2F0ZWQ6IHRydWUgfVxuXHRcdFx0fSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGNoYW5uZWxDb250ZW50KCksIFtcblx0XHRcdFx0J2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbjxvdXRwdXQgdG9vIGxvbmcgLSBkcm9wcGVkIDQyIGxpbmVzIGZyb20gdGhlIGVuZD5cXG4nLFxuXHRcdFx0XHQnbGluZSA0OThcXHJcXG5saW5lIDQ5OVxcclxcbmxpbmUgNTAwXFxyXFxuJyxcblx0XHRcdF0uam9pbignJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZHMgYSB6ZXJvLXBhcnRpYWwgdGVybWluYWwgZnJvbSBpdHMgdHJ1bmNhdGVkIGNvbXBsZXRpb24gcHJldmlldycsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtNycsICdzaGVsbCcpO1xuXG5cdFx0XHRzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtNycsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzaGVsbElkOiAnc2hlbGwtMScsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbicsIHRydW5jYXRlZDogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoY2hhbm5lbENvbnRlbnQoKSwgJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgYSB0cnVuY2F0ZWQgc3RyZWFtIHdpdGggYW4gYXV0aG9yaXRhdGl2ZSBub24tdHJ1bmNhdGVkIGNvbXBsZXRpb24gcHJldmlldycsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtOCcsICdzaGVsbCcpO1xuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSBzdHJlYW1zLmFwcGVuZCgnY2FsbC04JywgJ2hlYWRcXHJcXG48b3V0cHV0IHRvbyBsb25nIC0gZHJvcHBlZCA0MiBsaW5lcyBmcm9tIHRoZSBlbmQ+XFxuJyk7XG5cdFx0XHRvayhhcHBlbmRlZCk7XG5cblx0XHRcdHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC04JywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHNoZWxsSWQ6ICdzaGVsbC0xJyxcblx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnY29tcGxldGUgb3V0cHV0XFxyXFxuJywgdHJ1bmNhdGVkOiBmYWxzZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRkYXRhOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsRGF0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzZXRzOiBbYXBwZW5kZWQudXJpXSxcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdHsgdXJpOiBhcHBlbmRlZC51cmksIGRhdGE6ICdoZWFkXFxyXFxuPG91dHB1dCB0b28gbG9uZyAtIGRyb3BwZWQgNDIgbGluZXMgZnJvbSB0aGUgZW5kPlxcbicgfSxcblx0XHRcdFx0XHR7IHVyaTogYXBwZW5kZWQudXJpLCBkYXRhOiAnY29tcGxldGUgb3V0cHV0XFxyXFxuJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhcnMgc3RhbGUgc3RyZWFtZWQgb3V0cHV0IHdoZW4gdGhlIGF1dGhvcml0YXRpdmUgY29tcGxldGlvbiBwcmV2aWV3IGlzIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC05JywgJ3NoZWxsJyk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IHN0cmVhbXMuYXBwZW5kKCdjYWxsLTknLCAnc3RhbGUgb3V0cHV0XFxyXFxuJyk7XG5cdFx0XHRvayhhcHBlbmRlZCk7XG5cblx0XHRcdHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC05JywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdHNoZWxsSWQ6ICdzaGVsbC0xJyxcblx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnJywgdHJ1bmNhdGVkOiBmYWxzZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzZXRzOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsUmVzZXRzLFxuXHRcdFx0XHRkYXRhOiBtYW5hZ2VyLm91dHB1dFRlcm1pbmFsRGF0YSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzZXRzOiBbYXBwZW5kZWQudXJpXSxcblx0XHRcdFx0ZGF0YTogW3sgdXJpOiBhcHBlbmRlZC51cmksIGRhdGE6ICdzdGFsZSBvdXRwdXRcXHJcXG4nIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBlbmRzIGEgcHJlZml4LXN0YWJsZSBhdXRob3JpdGF0aXZlIGNvbXBsZXRpb24gcHJldmlldycsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtMTAnLCAnc2hlbGwnKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gc3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTAnLCAnbGluZSAxXFxyXFxuJyk7XG5cdFx0XHRvayhhcHBlbmRlZCk7XG5cblx0XHRcdHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC0xMCcsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzaGVsbElkOiAnc2hlbGwtMScsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2xpbmUgMVxcclxcbmxpbmUgMlxcclxcbicsIHRydW5jYXRlZDogZmFsc2UgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc2V0czogbWFuYWdlci5vdXRwdXRUZXJtaW5hbFJlc2V0cyxcblx0XHRcdFx0ZGF0YTogbWFuYWdlci5vdXRwdXRUZXJtaW5hbERhdGEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc2V0czogW10sXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR7IHVyaTogYXBwZW5kZWQudXJpLCBkYXRhOiAnbGluZSAxXFxyXFxuJyB9LFxuXHRcdFx0XHRcdHsgdXJpOiBhcHBlbmRlZC51cmksIGRhdGE6ICdsaW5lIDJcXHJcXG4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FuIHVucmVsYXRlZCByZXdyaXRlIHN0aWxsIHJlc2V0cyB0aGUgY2hhbm5lbCcsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtMTEnLCAnc2hlbGwnKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTExJywgJ2FscGhhIGJldGEgZ2FtbWFcXHJcXG4nKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTExJywgJ2NvbXBsZXRlbHkgZGlmZmVyZW50IGNvbnRlbnRcXHJcXG4nKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwobWFuYWdlci5vdXRwdXRUZXJtaW5hbFJlc2V0cy5sZW5ndGgsIDEpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKG1hbmFnZXIub3V0cHV0VGVybWluYWxEYXRhLm1hcChkID0+IGQuZGF0YSksIFsnYWxwaGEgYmV0YSBnYW1tYVxcclxcbicsICdjb21wbGV0ZWx5IGRpZmZlcmVudCBjb250ZW50XFxyXFxuJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tcGxldGlvbiBhbmQgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBmYWxsYmFjayBjb21wbGV0aW9uLCBmaW5hbGl6ZXMgb25jZSwgYW5kIGlnbm9yZXMgbGF0ZXIgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xMicsICdzaGVsbCcpO1xuXG5cdFx0XHRjb25zdCBjb21wbGV0aW9uID0gc3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTEyJywgJ2ZhbGxiYWNrIG91dHB1dFxcclxcbjxzaGVsbElkOiBzaGVsbC0xIGNvbXBsZXRlZCB3aXRoIGV4aXQgY29kZSAtMT4nLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyZWFtcy5jb21wbGV0ZVRvb2xDYWxsKCdjYWxsLTEyJywgJ2RpZmZlcmVudCBvdXRwdXRcXHJcXG48c2hlbGxJZDogc2hlbGwtMSBjb21wbGV0ZWQgd2l0aCBleGl0IGNvZGUgLTE+JywgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmVhbXMuYXBwZW5kKCdjYWxsLTEyJywgJ2xhdGUgb3V0cHV0XFxyXFxuJyk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbXBsZXRpb24sXG5cdFx0XHRcdGNvbnRlbnQ6IGNoYW5uZWxDb250ZW50KCksXG5cdFx0XHRcdGZpbmFsaXplZDogbWFuYWdlci5vdXRwdXRUZXJtaW5hbHNGaW5hbGl6ZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbXBsZXRpb246IHtcblx0XHRcdFx0XHR1cmk6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9zZXNzaW9uLTEvY2FsbC0xMicsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IGV4aXRDb2RlOiAtMSwgcHJldmlldzogJ2ZhbGxiYWNrIG91dHB1dFxcclxcbicgfSxcblx0XHRcdFx0XHRzaG91bGRSZXRpcmU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnQ6ICdmYWxsYmFjayBvdXRwdXRcXHJcXG4nLFxuXHRcdFx0XHRmaW5hbGl6ZWQ6IFt7IHVyaTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL3Nlc3Npb24tMS9jYWxsLTEyJywgZXhpdENvZGU6IC0xIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyBhbiB1bnN0YXJ0ZWQgc3RyZWFtIHdpdGhvdXQgY29tcGxldGlvbiBkYXRhJywgKCkgPT4ge1xuXHRcdFx0c3RyZWFtcy50cmFjaygnY2FsbC0xMycsICdzaGVsbCcpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ2NhbGwtMTMnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdHJlYW1zLmFwcGVuZCgnY2FsbC0xMycsICdsYXRlIG91dHB1dCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgYSBzdGFydGVkIHN0cmVhbSBhbGl2ZSB3aXRob3V0IGNvbXBsZXRpb24gZGF0YScsICgpID0+IHtcblx0XHRcdHN0cmVhbXMudHJhY2soJ2NhbGwtMTQnLCAnc2hlbGwnKTtcblx0XHRcdGNvbnN0IGFwcGVuZGVkID0gc3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTQnLCAncGFydGlhbCBvdXRwdXQnKTtcblx0XHRcdG9rKGFwcGVuZGVkKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHN0cmVhbXMuY29tcGxldGVUb29sQ2FsbCgnY2FsbC0xNCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwge1xuXHRcdFx0XHR1cmk6IGFwcGVuZGVkLnVyaSxcblx0XHRcdFx0c2hvdWxkUmV0aXJlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0aXJlcyBhIHN0cmVhbSBleGFjdGx5IG9uY2UnLCAoKSA9PiB7XG5cdFx0XHRzdHJlYW1zLnRyYWNrKCdjYWxsLTE1JywgJ3NoZWxsJyk7XG5cdFx0XHRjb25zdCBhcHBlbmRlZCA9IHN0cmVhbXMuYXBwZW5kKCdjYWxsLTE1JywgJ3BhcnRpYWwgb3V0cHV0Jyk7XG5cdFx0XHRvayhhcHBlbmRlZCk7XG5cblx0XHRcdHN0cmVhbXMucmV0aXJlKCdjYWxsLTE1Jyk7XG5cdFx0XHRzdHJlYW1zLnJldGlyZSgnY2FsbC0xNScpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwobWFuYWdlci5kaXNwb3NlZFRlcm1pbmFscywgW2FwcGVuZGVkLnVyaV0pO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RyZWFtcy5hcHBlbmQoJ2NhbGwtMTUnLCAnbGF0ZSBvdXRwdXQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lnbm9yZXMgYXBwZW5kIGFuZCBjb21wbGV0aW9uIGZvciBhbiB1bnRyYWNrZWQgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RyZWFtcy5hcHBlbmQoJ21pc3NpbmcnLCAnb3V0cHV0JyksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdHJlYW1zLmNvbXBsZXRlVG9vbENhbGwoJ21pc3NpbmcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixJQUFJLG1CQUFtQjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxvQ0FBb0M7QUFFN0MsTUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsY0FBVSxNQUFNLElBQUksSUFBSSw2QkFBNkIsQ0FBQztBQUN0RCxjQUFVLE1BQU0sSUFBSSxJQUFJLDJCQUEyQixJQUFJLE1BQU0sb0NBQW9DLEdBQUcsT0FBTyxDQUFDO0FBQUEsRUFDN0csQ0FBQztBQUVELFdBQVMsaUJBQXlCO0FBQ2pDLFdBQU8sUUFBUSxtQkFBbUIsSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQzNE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
