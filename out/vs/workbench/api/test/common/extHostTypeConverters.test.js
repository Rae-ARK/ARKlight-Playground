import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ChatPromptReference, ChatRequestModeInstructions, ChatResponseVoiceProgressPart, ChatToolInvocationPart, IconPath } from "../../common/extHostTypeConverters.js";
import { ChatReferenceBinaryData, ChatResponseVoiceProgressPart as ExtHostChatResponseVoiceProgressPart, ChatSubagentToolInvocationData, ChatToolInvocationPart as ExtHostChatToolInvocationPart, ThemeColor, ThemeIcon } from "../../common/extHostTypes.js";
suite("extHostTypeConverters", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts voice progress to hidden chat progress", () => {
    assert.deepStrictEqual(
      ChatResponseVoiceProgressPart.from(new ExtHostChatResponseVoiceProgressPart("investigating", "Investigating the relevant code.")),
      { kind: "voiceProgress", id: "investigating", value: "Investigating the relevant code." }
    );
  });
  suite("IconPath", function() {
    suite("from", function() {
      test("undefined", function() {
        assert.strictEqual(IconPath.from(void 0), void 0);
      });
      test("ThemeIcon", function() {
        const themeIcon = new ThemeIcon("account", new ThemeColor("testing.iconForeground"));
        assert.strictEqual(IconPath.from(themeIcon), themeIcon);
      });
      test("URI", function() {
        const uri = URI.parse("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
        assert.strictEqual(IconPath.from(uri), uri);
      });
      test("string", function() {
        const str = "/path/to/icon.png";
        const r1 = IconPath.from(str);
        assert.ok(URI.isUri(r1));
        assert.strictEqual(r1.scheme, "file");
        assert.strictEqual(r1.path, str);
      });
      test("dark only", function() {
        const input = { dark: URI.file("/path/to/dark.png") };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), input.dark.toString());
        assert.strictEqual(result.light.toString(), input.dark.toString());
      });
      test("dark/light", function() {
        const input = { light: URI.file("/path/to/light.png"), dark: URI.file("/path/to/dark.png") };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), input.dark.toString());
        assert.strictEqual(result.light.toString(), input.light.toString());
      });
      test("dark/light strings", function() {
        const input = { light: "/path/to/light.png", dark: "/path/to/dark.png" };
        const result = IconPath.from(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.path, input.dark);
        assert.strictEqual(result.light.path, input.light);
      });
      test("invalid object", function() {
        const invalidObject = { foo: "bar" };
        const result = IconPath.from(invalidObject);
        assert.strictEqual(result, void 0);
      });
      test("light only", function() {
        const input = { light: URI.file("/path/to/light.png") };
        const result = IconPath.from(input);
        assert.strictEqual(result, void 0);
      });
    });
    suite("to", function() {
      test("undefined", function() {
        assert.strictEqual(IconPath.to(void 0), void 0);
      });
      test("ThemeIcon", function() {
        const themeIcon = new ThemeIcon("account");
        assert.strictEqual(IconPath.to(themeIcon), themeIcon);
      });
      test("URI", function() {
        const uri = { scheme: "data", path: "image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" };
        const result = IconPath.to(uri);
        assert.ok(URI.isUri(result));
        assert.strictEqual(result.toString(), URI.revive(uri).toString());
      });
      test("dark/light", function() {
        const input = {
          light: { scheme: "file", path: "/path/to/light.png" },
          dark: { scheme: "file", path: "/path/to/dark.png" }
        };
        const result = IconPath.to(input);
        assert.strictEqual(typeof result, "object");
        assert.ok("light" in result && "dark" in result);
        assert.ok(URI.isUri(result.light));
        assert.ok(URI.isUri(result.dark));
        assert.strictEqual(result.dark.toString(), URI.revive(input.dark).toString());
        assert.strictEqual(result.light.toString(), URI.revive(input.light).toString());
      });
    });
  });
  suite("ChatPromptReference", function() {
    test("expands an element with a screenshot into text and binary references", async function() {
      const variable = {
        id: "element-1",
        name: "button#submit",
        kind: "element",
        value: '<button id="submit">Submit</button>',
        imageData: new Uint8Array([1, 2, 3]),
        imageMimeType: "image/jpeg"
      };
      const references = ChatPromptReference.toReferences(variable, [], new NullLogService());
      const binaryReference = references[1].value;
      assert.ok(binaryReference instanceof ChatReferenceBinaryData);
      assert.deepStrictEqual({
        references: references.map((reference) => ({
          id: reference.id,
          name: reference.name,
          value: typeof reference.value === "string" ? reference.value : reference.value instanceof ChatReferenceBinaryData ? "ChatReferenceBinaryData" : void 0
        })),
        mimeType: binaryReference.mimeType,
        data: Array.from(await binaryReference.data())
      }, {
        references: [
          { id: "element-1", name: "button#submit", value: '<button id="submit">Submit</button>' },
          { id: "element-1-screenshot", name: "button#submit screenshot", value: "ChatReferenceBinaryData" }
        ],
        mimeType: "image/jpeg",
        data: [1, 2, 3]
      });
    });
  });
  suite("ChatRequestModeInstructions", function() {
    test("to returns undefined for undefined input", function() {
      assert.strictEqual(ChatRequestModeInstructions.to(void 0), void 0);
    });
    test("from returns undefined for undefined input", function() {
      assert.strictEqual(ChatRequestModeInstructions.from(void 0), void 0);
    });
    test("to converts IChatRequestModeInstructions to API type", function() {
      const uri = URI.parse("file:///custom-agent");
      const input = {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{
          kind: "tool",
          id: "tool1",
          name: "tool1",
          value: void 0,
          range: { start: 0, endExclusive: 5 }
        }],
        allowedSubagents: ["agent1", "agent2"],
        metadata: { key: "value" },
        isBuiltin: false
      };
      const result = ChatRequestModeInstructions.to(input);
      assert.deepStrictEqual(result, {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{ name: "tool1", range: [0, 5] }],
        allowedSubagents: ["agent1", "agent2"],
        metadata: { key: "value" },
        isBuiltin: false
      });
    });
    test("to handles Dto with UriComponents", function() {
      const input = {
        uri: { scheme: "file", path: "/custom-agent" },
        name: "test-mode",
        content: "test content",
        toolReferences: [],
        allowedSubagents: void 0,
        metadata: void 0,
        isBuiltin: true
      };
      const result = ChatRequestModeInstructions.to(input);
      assert.ok(URI.isUri(result.uri));
      assert.strictEqual(result.name, "test-mode");
      assert.strictEqual(result.isBuiltin, true);
      assert.deepStrictEqual(result.toolReferences, []);
    });
    test("from converts API type to IChatRequestModeInstructions", function() {
      const uri = URI.parse("file:///custom-agent");
      const input = {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{ name: "tool1", range: [0, 5] }],
        metadata: { key: "value" },
        isBuiltin: false
      };
      const result = ChatRequestModeInstructions.from(input);
      assert.deepStrictEqual(result, {
        uri,
        name: "test-mode",
        content: "test content",
        toolReferences: [{
          kind: "tool",
          id: "tool1",
          name: "tool1",
          value: void 0,
          range: { start: 0, endExclusive: 5 }
        }],
        allowedSubagents: void 0,
        metadata: { key: "value" },
        isBuiltin: false
      });
    });
    test("from handles missing toolReferences", function() {
      const input = {
        name: "test-mode",
        content: "test content"
      };
      const result = ChatRequestModeInstructions.from(input);
      assert.deepStrictEqual(result.toolReferences, []);
    });
    test("roundtrip from -> to preserves data", function() {
      const uri = URI.parse("file:///custom-agent");
      const apiInput = {
        uri,
        name: "roundtrip-mode",
        content: "roundtrip content",
        toolReferences: [
          { name: "tool1" },
          { name: "tool2", range: [10, 20] }
        ],
        metadata: { flag: true },
        isBuiltin: false
      };
      const internal = ChatRequestModeInstructions.from(apiInput);
      const backToApi = ChatRequestModeInstructions.to(internal);
      assert.strictEqual(backToApi.name, apiInput.name);
      assert.strictEqual(backToApi.content, apiInput.content);
      assert.strictEqual(backToApi.isBuiltin, apiInput.isBuiltin);
      assert.strictEqual(backToApi.uri?.toString(), uri.toString());
      assert.strictEqual(backToApi.toolReferences?.length, 2);
      assert.strictEqual(backToApi.toolReferences?.[0].name, "tool1");
      assert.strictEqual(backToApi.toolReferences?.[0].range, void 0);
      assert.strictEqual(backToApi.toolReferences?.[1].name, "tool2");
      assert.deepStrictEqual(backToApi.toolReferences?.[1].range, [10, 20]);
    });
  });
  suite("ChatToolInvocationPart", function() {
    test("converts subagent data with its model name", function() {
      const data = new ChatSubagentToolInvocationData("Run tests", "execution", "npm test", "Passed");
      data.modelName = "Execution Model";
      const part = new ExtHostChatToolInvocationPart("execution_subagent", "tool-call-id");
      part.toolSpecificData = data;
      assert.deepStrictEqual(ChatToolInvocationPart.from(part).toolSpecificData, {
        kind: "subagent",
        description: "Run tests",
        agentName: "execution",
        prompt: "npm test",
        result: "Passed",
        modelName: "Execution Model"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEljb25QYXRoRHRvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ2hhdFByb21wdFJlZmVyZW5jZSwgQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLCBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCwgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgSWNvblBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IENoYXRSZWZlcmVuY2VCaW5hcnlEYXRhLCBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydCBhcyBFeHRIb3N0Q2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQsIENoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSwgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCBhcyBFeHRIb3N0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgVGhlbWVDb2xvciwgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRWxlbWVudFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IER0byB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5cbnN1aXRlKCdleHRIb3N0VHlwZUNvbnZlcnRlcnMnLCBmdW5jdGlvbiAoKSB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIHZvaWNlIHByb2dyZXNzIHRvIGhpZGRlbiBjaGF0IHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydC5mcm9tKG5ldyBFeHRIb3N0Q2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQoJ2ludmVzdGlnYXRpbmcnLCAnSW52ZXN0aWdhdGluZyB0aGUgcmVsZXZhbnQgY29kZS4nKSksXG5cdFx0XHR7IGtpbmQ6ICd2b2ljZVByb2dyZXNzJywgaWQ6ICdpbnZlc3RpZ2F0aW5nJywgdmFsdWU6ICdJbnZlc3RpZ2F0aW5nIHRoZSByZWxldmFudCBjb2RlLicgfVxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdJY29uUGF0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRzdWl0ZSgnZnJvbScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRlc3QoJ3VuZGVmaW5lZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEljb25QYXRoLmZyb20odW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdUaGVtZUljb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lSWNvbiA9IG5ldyBUaGVtZUljb24oJ2FjY291bnQnLCBuZXcgVGhlbWVDb2xvcigndGVzdGluZy5pY29uRm9yZWdyb3VuZCcpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEljb25QYXRoLmZyb20odGhlbWVJY29uKSwgdGhlbWVJY29uKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdVUkknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUFBRUFBQUFCQ0FZQUFBQWZGY1NKQUFBQURVbEVRVlI0Mm1OaytNOVFEd0FEaGdHQVdqUjlhd0FBQUFCSlJVNUVya0pnZ2c9PScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSWNvblBhdGguZnJvbSh1cmkpLCB1cmkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3N0cmluZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3Qgc3RyID0gJy9wYXRoL3RvL2ljb24ucG5nJztcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNvbnN0IHIxID0gSWNvblBhdGguZnJvbShzdHIgYXMgYW55KSBhcyBhbnkgYXMgVVJJO1xuXHRcdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHIxKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5wYXRoLCBzdHIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Rhcmsgb25seScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgaW5wdXQgPSB7IGRhcms6IFVSSS5maWxlKCcvcGF0aC90by9kYXJrLnBuZycpIH07XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBJY29uUGF0aC5mcm9tKGlucHV0IGFzIGFueSkgYXMgdW5rbm93biBhcyB7IGRhcms6IFVSSTsgbGlnaHQ6IFVSSSB9O1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdCwgJ29iamVjdCcpO1xuXHRcdFx0XHRhc3NlcnQub2soJ2xpZ2h0JyBpbiByZXN1bHQgJiYgJ2RhcmsnIGluIHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmxpZ2h0KSk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmRhcmspKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kYXJrLnRvU3RyaW5nKCksIGlucHV0LmRhcmsudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGlnaHQudG9TdHJpbmcoKSwgaW5wdXQuZGFyay50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdkYXJrL2xpZ2h0JywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IHsgbGlnaHQ6IFVSSS5maWxlKCcvcGF0aC90by9saWdodC5wbmcnKSwgZGFyazogVVJJLmZpbGUoJy9wYXRoL3RvL2RhcmsucG5nJykgfTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGguZnJvbShpbnB1dCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0LCAnb2JqZWN0Jyk7XG5cdFx0XHRcdGFzc2VydC5vaygnbGlnaHQnIGluIHJlc3VsdCAmJiAnZGFyaycgaW4gcmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQubGlnaHQpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQuZGFyaykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRhcmsudG9TdHJpbmcoKSwgaW5wdXQuZGFyay50b1N0cmluZygpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5saWdodC50b1N0cmluZygpLCBpbnB1dC5saWdodC50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdkYXJrL2xpZ2h0IHN0cmluZ3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0ID0geyBsaWdodDogJy9wYXRoL3RvL2xpZ2h0LnBuZycsIGRhcms6ICcvcGF0aC90by9kYXJrLnBuZycgfTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IEljb25QYXRoLmZyb20oaW5wdXQgYXMgYW55KSBhcyB1bmtub3duIGFzIEljb25QYXRoRHRvO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdCwgJ29iamVjdCcpO1xuXHRcdFx0XHRhc3NlcnQub2soJ2xpZ2h0JyBpbiByZXN1bHQgJiYgJ2RhcmsnIGluIHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmxpZ2h0KSk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0LmRhcmspKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kYXJrLnBhdGgsIGlucHV0LmRhcmspO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZ2h0LnBhdGgsIGlucHV0LmxpZ2h0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbnZhbGlkIG9iamVjdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgaW52YWxpZE9iamVjdCA9IHsgZm9vOiAnYmFyJyB9O1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gSWNvblBhdGguZnJvbShpbnZhbGlkT2JqZWN0IGFzIGFueSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlnaHQgb25seScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgaW5wdXQgPSB7IGxpZ2h0OiBVUkkuZmlsZSgnL3BhdGgvdG8vbGlnaHQucG5nJykgfTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IEljb25QYXRoLmZyb20oaW5wdXQgYXMgYW55KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3RvJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0dGVzdCgndW5kZWZpbmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSWNvblBhdGgudG8odW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdUaGVtZUljb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lSWNvbiA9IG5ldyBUaGVtZUljb24oJ2FjY291bnQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEljb25QYXRoLnRvKHRoZW1lSWNvbiksIHRoZW1lSWNvbik7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnVVJJJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCB1cmk6IFVyaUNvbXBvbmVudHMgPSB7IHNjaGVtZTogJ2RhdGEnLCBwYXRoOiAnaW1hZ2UvcG5nO2Jhc2U2NCxpVkJPUncwS0dnb0FBQUFOU1VoRVVnQUFBQUVBQUFBQkNBWUFBQUFmRmNTSkFBQUFEVWxFUVZSNDJtTmsrTTlRRHdBRGhnR0FXalI5YXdBQUFBQkpSVTVFcmtKZ2dnPT0nIH07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IEljb25QYXRoLnRvKHVyaSk7XG5cdFx0XHRcdGFzc2VydC5vayhVUkkuaXNVcmkocmVzdWx0KSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudG9TdHJpbmcoKSwgVVJJLnJldml2ZSh1cmkpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2RhcmsvbGlnaHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGlucHV0OiB7IGxpZ2h0OiBVcmlDb21wb25lbnRzOyBkYXJrOiBVcmlDb21wb25lbnRzIH0gPSB7XG5cdFx0XHRcdFx0bGlnaHQ6IHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvcGF0aC90by9saWdodC5wbmcnIH0sXG5cdFx0XHRcdFx0ZGFyazogeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9wYXRoL3RvL2RhcmsucG5nJyB9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IEljb25QYXRoLnRvKGlucHV0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdvYmplY3QnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCdsaWdodCcgaW4gcmVzdWx0ICYmICdkYXJrJyBpbiByZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC5saWdodCkpO1xuXHRcdFx0XHRhc3NlcnQub2soVVJJLmlzVXJpKHJlc3VsdC5kYXJrKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGFyay50b1N0cmluZygpLCBVUkkucmV2aXZlKGlucHV0LmRhcmspLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmxpZ2h0LnRvU3RyaW5nKCksIFVSSS5yZXZpdmUoaW5wdXQubGlnaHQpLnRvU3RyaW5nKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDaGF0UHJvbXB0UmVmZXJlbmNlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3QoJ2V4cGFuZHMgYW4gZWxlbWVudCB3aXRoIGEgc2NyZWVuc2hvdCBpbnRvIHRleHQgYW5kIGJpbmFyeSByZWZlcmVuY2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgdmFyaWFibGU6IElFbGVtZW50VmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdFx0aWQ6ICdlbGVtZW50LTEnLFxuXHRcdFx0XHRuYW1lOiAnYnV0dG9uI3N1Ym1pdCcsXG5cdFx0XHRcdGtpbmQ6ICdlbGVtZW50Jyxcblx0XHRcdFx0dmFsdWU6ICc8YnV0dG9uIGlkPVwic3VibWl0XCI+U3VibWl0PC9idXR0b24+Jyxcblx0XHRcdFx0aW1hZ2VEYXRhOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pLFxuXHRcdFx0XHRpbWFnZU1pbWVUeXBlOiAnaW1hZ2UvanBlZycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWZlcmVuY2VzID0gQ2hhdFByb21wdFJlZmVyZW5jZS50b1JlZmVyZW5jZXModmFyaWFibGUsIFtdLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBiaW5hcnlSZWZlcmVuY2UgPSByZWZlcmVuY2VzWzFdLnZhbHVlO1xuXHRcdFx0YXNzZXJ0Lm9rKGJpbmFyeVJlZmVyZW5jZSBpbnN0YW5jZW9mIENoYXRSZWZlcmVuY2VCaW5hcnlEYXRhKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlZmVyZW5jZXM6IHJlZmVyZW5jZXMubWFwKHJlZmVyZW5jZSA9PiAoe1xuXHRcdFx0XHRcdGlkOiByZWZlcmVuY2UuaWQsXG5cdFx0XHRcdFx0bmFtZTogcmVmZXJlbmNlLm5hbWUsXG5cdFx0XHRcdFx0dmFsdWU6IHR5cGVvZiByZWZlcmVuY2UudmFsdWUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHJlZmVyZW5jZS52YWx1ZVxuXHRcdFx0XHRcdFx0OiByZWZlcmVuY2UudmFsdWUgaW5zdGFuY2VvZiBDaGF0UmVmZXJlbmNlQmluYXJ5RGF0YSA/ICdDaGF0UmVmZXJlbmNlQmluYXJ5RGF0YScgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0bWltZVR5cGU6IGJpbmFyeVJlZmVyZW5jZS5taW1lVHlwZSxcblx0XHRcdFx0ZGF0YTogQXJyYXkuZnJvbShhd2FpdCBiaW5hcnlSZWZlcmVuY2UuZGF0YSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVmZXJlbmNlczogW1xuXHRcdFx0XHRcdHsgaWQ6ICdlbGVtZW50LTEnLCBuYW1lOiAnYnV0dG9uI3N1Ym1pdCcsIHZhbHVlOiAnPGJ1dHRvbiBpZD1cInN1Ym1pdFwiPlN1Ym1pdDwvYnV0dG9uPicgfSxcblx0XHRcdFx0XHR7IGlkOiAnZWxlbWVudC0xLXNjcmVlbnNob3QnLCBuYW1lOiAnYnV0dG9uI3N1Ym1pdCBzY3JlZW5zaG90JywgdmFsdWU6ICdDaGF0UmVmZXJlbmNlQmluYXJ5RGF0YScgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9qcGVnJyxcblx0XHRcdFx0ZGF0YTogWzEsIDIsIDNdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgndG8gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVuZGVmaW5lZCBpbnB1dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMudG8odW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zyb20gcmV0dXJucyB1bmRlZmluZWQgZm9yIHVuZGVmaW5lZCBpbnB1dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMuZnJvbSh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG8gY29udmVydHMgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB0byBBUEkgdHlwZScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jdXN0b20tYWdlbnQnKTtcblx0XHRcdGNvbnN0IGlucHV0OiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zID0ge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdG5hbWU6ICd0ZXN0LW1vZGUnLFxuXHRcdFx0XHRjb250ZW50OiAndGVzdCBjb250ZW50Jyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2wnLFxuXHRcdFx0XHRcdGlkOiAndG9vbDEnLFxuXHRcdFx0XHRcdG5hbWU6ICd0b29sMScsXG5cdFx0XHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyYW5nZTogeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA1IH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRhbGxvd2VkU3ViYWdlbnRzOiBbJ2FnZW50MScsICdhZ2VudDInXSxcblx0XHRcdFx0bWV0YWRhdGE6IHsga2V5OiAndmFsdWUnIH0sXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMudG8oaW5wdXQpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ3Rlc3QtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd0ZXN0IGNvbnRlbnQnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW3sgbmFtZTogJ3Rvb2wxJywgcmFuZ2U6IFswLCA1XSB9XSxcblx0XHRcdFx0YWxsb3dlZFN1YmFnZW50czogWydhZ2VudDEnLCAnYWdlbnQyJ10sXG5cdFx0XHRcdG1ldGFkYXRhOiB7IGtleTogJ3ZhbHVlJyB9LFxuXHRcdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0byBoYW5kbGVzIER0byB3aXRoIFVyaUNvbXBvbmVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBpbnB1dDogRHRvPElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnM+ID0ge1xuXHRcdFx0XHR1cmk6IHsgc2NoZW1lOiAnZmlsZScsIHBhdGg6ICcvY3VzdG9tLWFnZW50JyB9IGFzIFVyaUNvbXBvbmVudHMsXG5cdFx0XHRcdG5hbWU6ICd0ZXN0LW1vZGUnLFxuXHRcdFx0XHRjb250ZW50OiAndGVzdCBjb250ZW50Jyxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IFtdLFxuXHRcdFx0XHRhbGxvd2VkU3ViYWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy50byhpbnB1dCkhO1xuXHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShyZXN1bHQudXJpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm5hbWUsICd0ZXN0LW1vZGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaXNCdWlsdGluLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xSZWZlcmVuY2VzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmcm9tIGNvbnZlcnRzIEFQSSB0eXBlIHRvIElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VzdG9tLWFnZW50Jyk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC1tb2RlJyxcblx0XHRcdFx0Y29udGVudDogJ3Rlc3QgY29udGVudCcsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBbeyBuYW1lOiAndG9vbDEnLCByYW5nZTogWzAsIDVdIGFzIFtudW1iZXIsIG51bWJlcl0gfV0sXG5cdFx0XHRcdG1ldGFkYXRhOiB7IGtleTogJ3ZhbHVlJyB9LFxuXHRcdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLmZyb20oaW5wdXQpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ3Rlc3QtbW9kZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICd0ZXN0IGNvbnRlbnQnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW3tcblx0XHRcdFx0XHRraW5kOiAndG9vbCcsXG5cdFx0XHRcdFx0aWQ6ICd0b29sMScsXG5cdFx0XHRcdFx0bmFtZTogJ3Rvb2wxJyxcblx0XHRcdFx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDUgfSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0YWRhdGE6IHsga2V5OiAndmFsdWUnIH0sXG5cdFx0XHRcdGlzQnVpbHRpbjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Zyb20gaGFuZGxlcyBtaXNzaW5nIHRvb2xSZWZlcmVuY2VzJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0LW1vZGUnLFxuXHRcdFx0XHRjb250ZW50OiAndGVzdCBjb250ZW50Jyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IENoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy5mcm9tKGlucHV0KSE7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sUmVmZXJlbmNlcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncm91bmR0cmlwIGZyb20gLT4gdG8gcHJlc2VydmVzIGRhdGEnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3VzdG9tLWFnZW50Jyk7XG5cdFx0XHRjb25zdCBhcGlJbnB1dCA9IHtcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRuYW1lOiAncm91bmR0cmlwLW1vZGUnLFxuXHRcdFx0XHRjb250ZW50OiAncm91bmR0cmlwIGNvbnRlbnQnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ3Rvb2wxJyB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3Rvb2wyJywgcmFuZ2U6IFsxMCwgMjBdIGFzIFtudW1iZXIsIG51bWJlcl0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWV0YWRhdGE6IHsgZmxhZzogdHJ1ZSB9LFxuXHRcdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgaW50ZXJuYWwgPSBDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMuZnJvbShhcGlJbnB1dCkhO1xuXHRcdFx0Y29uc3QgYmFja1RvQXBpID0gQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLnRvKGludGVybmFsKSE7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkubmFtZSwgYXBpSW5wdXQubmFtZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja1RvQXBpLmNvbnRlbnQsIGFwaUlucHV0LmNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS5pc0J1aWx0aW4sIGFwaUlucHV0LmlzQnVpbHRpbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFja1RvQXBpLnVyaT8udG9TdHJpbmcoKSwgdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhY2tUb0FwaS50b29sUmVmZXJlbmNlcz8ubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkudG9vbFJlZmVyZW5jZXM/LlswXS5uYW1lLCAndG9vbDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkudG9vbFJlZmVyZW5jZXM/LlswXS5yYW5nZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYWNrVG9BcGkudG9vbFJlZmVyZW5jZXM/LlsxXS5uYW1lLCAndG9vbDInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYmFja1RvQXBpLnRvb2xSZWZlcmVuY2VzPy5bMV0ucmFuZ2UsIFsxMCwgMjBdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0NoYXRUb29sSW52b2NhdGlvblBhcnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdCgnY29udmVydHMgc3ViYWdlbnQgZGF0YSB3aXRoIGl0cyBtb2RlbCBuYW1lJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEoJ1J1biB0ZXN0cycsICdleGVjdXRpb24nLCAnbnBtIHRlc3QnLCAnUGFzc2VkJyk7XG5cdFx0XHRkYXRhLm1vZGVsTmFtZSA9ICdFeGVjdXRpb24gTW9kZWwnO1xuXHRcdFx0Y29uc3QgcGFydCA9IG5ldyBFeHRIb3N0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCgnZXhlY3V0aW9uX3N1YmFnZW50JywgJ3Rvb2wtY2FsbC1pZCcpO1xuXHRcdFx0KHBhcnQgYXMgdW5rbm93biBhcyB7IHRvb2xTcGVjaWZpY0RhdGE6IENoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSB9KS50b29sU3BlY2lmaWNEYXRhID0gZGF0YTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChDaGF0VG9vbEludm9jYXRpb25QYXJ0LmZyb20ocGFydCBhcyB1bmtub3duIGFzIFBhcmFtZXRlcnM8dHlwZW9mIENoYXRUb29sSW52b2NhdGlvblBhcnQuZnJvbT5bMF0pLnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW4gdGVzdHMnLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleGVjdXRpb24nLFxuXHRcdFx0XHRwcm9tcHQ6ICducG0gdGVzdCcsXG5cdFx0XHRcdHJlc3VsdDogJ1Bhc3NlZCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0V4ZWN1dGlvbiBNb2RlbCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJd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
