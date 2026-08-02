import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { resolveSymbolToolFileUri, findLineNumber, findSymbolColumn, errorResult, getChatPermissionLevelForToolInvocation, getSandboxPrecheckInputsForToolInvocation } from "../../../browser/tools/toolHelpers.js";
import { ChatPermissionLevel } from "../../../common/constants.js";
suite("Tool Helpers", () => {
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockWorkspaceService(folderUri) {
    const uri = folderUri ?? URI.parse("file:///workspace");
    const folder = {
      uri,
      toResource: (relativePath) => URI.joinPath(uri, relativePath)
    };
    return {
      _serviceBrand: void 0,
      getWorkspace: () => ({ folders: [folder] }),
      getWorkspaceFolder: (u) => {
        if (u.toString().startsWith(uri.toString())) {
          return folder;
        }
        return null;
      }
    };
  }
  function createMockChatService(requests) {
    return {
      _serviceBrand: void 0,
      getSession: () => requests ? { getRequests: () => requests } : void 0
    };
  }
  function createMockChatWidgetService(permissionLevel) {
    return {
      _serviceBrand: void 0,
      getWidgetBySessionResource: () => permissionLevel === void 0 ? void 0 : { input: { currentModeInfo: { permissionLevel } } }
    };
  }
  suite("resolveSymbolToolFileUri", () => {
    test("resolves full URI string", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///test/file.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///test/file.ts");
    });
    test("resolves workspace-relative filePath", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///project"));
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/index.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///project/src/index.ts");
    });
    test("prefers uri over filePath", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///explicit.ts", filePath: "other.ts" }, ws);
      assert.strictEqual(result?.toString(), "file:///explicit.ts");
    });
    test("returns undefined when neither provided", () => {
      const ws = createMockWorkspaceService();
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x" }, ws);
      assert.strictEqual(result, void 0);
    });
    test("resolves filePath against workingDirectory when provided", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///other-workspace"));
      const workingDirectory = URI.parse("file:///session-dir");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/index.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///session-dir/src/index.ts");
    });
    test("workingDirectory takes precedence over workspace folders", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "file.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///my-project/file.ts");
    });
    test("uri field ignores workingDirectory", () => {
      const ws = createMockWorkspaceService();
      const workingDirectory = URI.parse("file:///session-dir");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", uri: "file:///absolute/path.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///absolute/path.ts");
    });
    test("rejects filePath that escapes the workingDirectory via parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "../outside.ts" }, ws, workingDirectory);
      assert.strictEqual(result, void 0);
    });
    test("rejects filePath that escapes the workingDirectory via nested parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/../../outside.ts" }, ws, workingDirectory);
      assert.strictEqual(result, void 0);
    });
    test("allows filePath with interior parent segments that stays within the workingDirectory", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///workspace"));
      const workingDirectory = URI.parse("file:///my-project");
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "src/../file.ts" }, ws, workingDirectory);
      assert.strictEqual(result?.toString(), "file:///my-project/file.ts");
    });
    test("rejects filePath that escapes the workspace folder via parent segments", () => {
      const ws = createMockWorkspaceService(URI.parse("file:///project/sub"));
      const result = resolveSymbolToolFileUri({ symbol: "x", lineContent: "x", filePath: "../../outside.ts" }, ws);
      assert.strictEqual(result, void 0);
    });
  });
  suite("getChatPermissionLevelForToolInvocation", () => {
    test("returns undefined when there is no chat session resource", () => {
      const result = getChatPermissionLevelForToolInvocation(void 0, void 0, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
      assert.strictEqual(result, void 0);
    });
    test("prefers the request permission level for the provided request id", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        "request-2",
        createMockChatWidgetService(ChatPermissionLevel.Default),
        createMockChatService([
          { id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
          { id: "request-2", modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }
        ])
      );
      assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
    });
    test("falls back to the live widget permission level when the request is not found", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        "missing-request",
        createMockChatWidgetService(ChatPermissionLevel.Autopilot),
        createMockChatService([{ id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } }])
      );
      assert.strictEqual(result, ChatPermissionLevel.Autopilot);
    });
    test("falls back to the latest request permission level when there is no widget", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getChatPermissionLevelForToolInvocation(
        sessionResource,
        void 0,
        createMockChatWidgetService(void 0),
        createMockChatService([
          { id: "request-1", modeInfo: { permissionLevel: ChatPermissionLevel.Default } },
          { id: "request-2", modeInfo: { permissionLevel: ChatPermissionLevel.AutoApprove } }
        ])
      );
      assert.strictEqual(result, ChatPermissionLevel.AutoApprove);
    });
  });
  suite("getSandboxPrecheckInputsForToolInvocation", () => {
    test("returns undefined when there is no chat permission level", () => {
      const result = getSandboxPrecheckInputsForToolInvocation(void 0, void 0, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([]));
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for the default chat permission level", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      const result = getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.Default), createMockChatService([]));
      assert.deepStrictEqual(result, { isDefaultApprovalPermissionEnabled: true });
    });
    test("disables default approval permission for auto-approve chat permission levels", () => {
      const sessionResource = URI.parse("vscode-chat://session/test");
      assert.deepStrictEqual(
        getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.AutoApprove), createMockChatService([])),
        { isDefaultApprovalPermissionEnabled: false }
      );
      assert.deepStrictEqual(
        getSandboxPrecheckInputsForToolInvocation(sessionResource, void 0, createMockChatWidgetService(ChatPermissionLevel.Autopilot), createMockChatService([])),
        { isDefaultApprovalPermissionEnabled: false }
      );
    });
  });
  suite("findLineNumber", () => {
    test("finds exact match", () => {
      const model = disposables.add(createTextModel("line one\nline two\nline three"));
      assert.strictEqual(findLineNumber(model, "line two"), 2);
    });
    test("handles whitespace normalization", () => {
      const model = disposables.add(createTextModel("function   doSomething(x:  number) {}"));
      assert.strictEqual(findLineNumber(model, "function doSomething(x: number)"), 1);
    });
    test("returns undefined when not found", () => {
      const model = disposables.add(createTextModel("hello world"));
      assert.strictEqual(findLineNumber(model, "not here"), void 0);
    });
    test("handles regex special characters in content", () => {
      const model = disposables.add(createTextModel("const arr = [1, 2, 3];"));
      assert.strictEqual(findLineNumber(model, "[1, 2, 3]"), 1);
    });
    test("finds partial line match", () => {
      const model = disposables.add(createTextModel('import { MyClass } from "./myModule";'));
      assert.strictEqual(findLineNumber(model, "MyClass"), 1);
    });
    test("trims leading and trailing whitespace from input", () => {
      const model = disposables.add(createTextModel("const x = 42;"));
      assert.strictEqual(findLineNumber(model, "  const x = 42;  "), 1);
    });
  });
  suite("findSymbolColumn", () => {
    test("finds symbol with word boundaries", () => {
      assert.strictEqual(findSymbolColumn("const myVar = 42;", "myVar"), 7);
    });
    test("returns 1-based column", () => {
      assert.strictEqual(findSymbolColumn("x = 1", "x"), 1);
    });
    test("does not match partial words", () => {
      assert.strictEqual(findSymbolColumn("const myVariable = 42;", "myVar"), void 0);
    });
    test("returns undefined when not found", () => {
      assert.strictEqual(findSymbolColumn("hello world", "missing"), void 0);
    });
    test("handles regex special characters in symbol name", () => {
      assert.strictEqual(findSymbolColumn("arr[0] = 1", "arr"), 1);
    });
    test("finds first occurrence", () => {
      assert.strictEqual(findSymbolColumn("foo + foo", "foo"), 1);
    });
  });
  suite("errorResult", () => {
    test("creates result with text content", () => {
      const result = errorResult("something went wrong");
      const textPart = result.content.find((p) => p.kind === "text");
      assert.ok(textPart);
      assert.strictEqual(textPart.value, "something went wrong");
    });
    test("sets toolResultMessage", () => {
      const result = errorResult("error message");
      assert.ok(result.toolResultMessage);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Rvb2xzL3Rvb2xIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpLCBmaW5kTGluZU51bWJlciwgZmluZFN5bWJvbENvbHVtbiwgZXJyb3JSZXN1bHQsIGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGb3JUb29sSW52b2NhdGlvbiwgZ2V0U2FuZGJveFByZWNoZWNrSW5wdXRzRm9yVG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL3Rvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcblxuc3VpdGUoJ1Rvb2wgSGVscGVycycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoZm9sZGVyVXJpPzogVVJJKTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblx0XHRjb25zdCB1cmkgPSBmb2xkZXJVcmkgPz8gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IGZvbGRlciA9IHtcblx0XHRcdHVyaSxcblx0XHRcdHRvUmVzb3VyY2U6IChyZWxhdGl2ZVBhdGg6IHN0cmluZykgPT4gVVJJLmpvaW5QYXRoKHVyaSwgcmVsYXRpdmVQYXRoKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZUZvbGRlcjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0V29ya3NwYWNlOiAoKSA9PiAoeyBmb2xkZXJzOiBbZm9sZGVyXSB9KSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlcjogKHU6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodS50b1N0cmluZygpLnN0YXJ0c1dpdGgodXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0U2VydmljZShyZXF1ZXN0czogcmVhZG9ubHkgeyBpZDogc3RyaW5nOyBtb2RlSW5mbz86IHsgcGVybWlzc2lvbkxldmVsPzogQ2hhdFBlcm1pc3Npb25MZXZlbCB9IH1bXSB8IHVuZGVmaW5lZCk6IElDaGF0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFNlc3Npb246ICgpID0+IHJlcXVlc3RzID8geyBnZXRSZXF1ZXN0czogKCkgPT4gcmVxdWVzdHMgfSA6IHVuZGVmaW5lZCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZCk6IElDaGF0V2lkZ2V0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlOiAoKSA9PiBwZXJtaXNzaW9uTGV2ZWwgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHsgaW5wdXQ6IHsgY3VycmVudE1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbCB9IH0gfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXHR9XG5cblx0c3VpdGUoJ3Jlc29sdmVTeW1ib2xUb29sRmlsZVVyaScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGZ1bGwgVVJJIHN0cmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCB1cmk6ICdmaWxlOi8vL3Rlc3QvZmlsZS50cycgfSwgd3MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vdGVzdC9maWxlLnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyB3b3Jrc3BhY2UtcmVsYXRpdmUgZmlsZVBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB3cyA9IGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKFVSSS5wYXJzZSgnZmlsZTovLy9wcm9qZWN0JykpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnc3JjL2luZGV4LnRzJyB9LCB3cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Py50b1N0cmluZygpLCAnZmlsZTovLy9wcm9qZWN0L3NyYy9pbmRleC50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlZmVycyB1cmkgb3ZlciBmaWxlUGF0aCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCB1cmk6ICdmaWxlOi8vL2V4cGxpY2l0LnRzJywgZmlsZVBhdGg6ICdvdGhlci50cycgfSwgd3MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vZXhwbGljaXQudHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbmVpdGhlciBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnIH0sIHdzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyBmaWxlUGF0aCBhZ2FpbnN0IHdvcmtpbmdEaXJlY3Rvcnkgd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL290aGVyLXdvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vc2Vzc2lvbi1kaXInKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVTeW1ib2xUb29sRmlsZVVyaSh7IHN5bWJvbDogJ3gnLCBsaW5lQ29udGVudDogJ3gnLCBmaWxlUGF0aDogJ3NyYy9pbmRleC50cycgfSwgd3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vc2Vzc2lvbi1kaXIvc3JjL2luZGV4LnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JraW5nRGlyZWN0b3J5IHRha2VzIHByZWNlZGVuY2Ugb3ZlciB3b3Jrc3BhY2UgZm9sZGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbXktcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnZmlsZS50cycgfSwgd3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vbXktcHJvamVjdC9maWxlLnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cmkgZmllbGQgaWdub3JlcyB3b3JraW5nRGlyZWN0b3J5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5wYXJzZSgnZmlsZTovLy9zZXNzaW9uLWRpcicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIHVyaTogJ2ZpbGU6Ly8vYWJzb2x1dGUvcGF0aC50cycgfSwgd3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8udG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYWJzb2x1dGUvcGF0aC50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmaWxlUGF0aCB0aGF0IGVzY2FwZXMgdGhlIHdvcmtpbmdEaXJlY3RvcnkgdmlhIHBhcmVudCBzZWdtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbXktcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnLi4vb3V0c2lkZS50cycgfSwgd3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZmlsZVBhdGggdGhhdCBlc2NhcGVzIHRoZSB3b3JraW5nRGlyZWN0b3J5IHZpYSBuZXN0ZWQgcGFyZW50IHNlZ21lbnRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3MgPSBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZShVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlJykpO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5wYXJzZSgnZmlsZTovLy9teS1wcm9qZWN0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlU3ltYm9sVG9vbEZpbGVVcmkoeyBzeW1ib2w6ICd4JywgbGluZUNvbnRlbnQ6ICd4JywgZmlsZVBhdGg6ICdzcmMvLi4vLi4vb3V0c2lkZS50cycgfSwgd3MsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbG93cyBmaWxlUGF0aCB3aXRoIGludGVyaW9yIHBhcmVudCBzZWdtZW50cyB0aGF0IHN0YXlzIHdpdGhpbiB0aGUgd29ya2luZ0RpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpKTtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbXktcHJvamVjdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnc3JjLy4uL2ZpbGUudHMnIH0sIHdzLCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQ/LnRvU3RyaW5nKCksICdmaWxlOi8vL215LXByb2plY3QvZmlsZS50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBmaWxlUGF0aCB0aGF0IGVzY2FwZXMgdGhlIHdvcmtzcGFjZSBmb2xkZXIgdmlhIHBhcmVudCBzZWdtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHdzID0gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3Byb2plY3Qvc3ViJykpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZVN5bWJvbFRvb2xGaWxlVXJpKHsgc3ltYm9sOiAneCcsIGxpbmVDb250ZW50OiAneCcsIGZpbGVQYXRoOiAnLi4vLi4vb3V0c2lkZS50cycgfSwgd3MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldENoYXRQZXJtaXNzaW9uTGV2ZWxGb3JUb29sSW52b2NhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlcmUgaXMgbm8gY2hhdCBzZXNzaW9uIHJlc291cmNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0Q2hhdFBlcm1pc3Npb25MZXZlbEZvclRvb2xJbnZvY2F0aW9uKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KSwgY3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtdKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlZmVycyB0aGUgcmVxdWVzdCBwZXJtaXNzaW9uIGxldmVsIGZvciB0aGUgcHJvdmlkZWQgcmVxdWVzdCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly9zZXNzaW9uL3Rlc3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGb3JUb29sSW52b2NhdGlvbihcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHQncmVxdWVzdC0yJyxcblx0XHRcdFx0Y3JlYXRlTW9ja0NoYXRXaWRnZXRTZXJ2aWNlKENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCksXG5cdFx0XHRcdGNyZWF0ZU1vY2tDaGF0U2VydmljZShbXG5cdFx0XHRcdFx0eyBpZDogJ3JlcXVlc3QtMScsIG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0IH0gfSxcblx0XHRcdFx0XHR7IGlkOiAncmVxdWVzdC0yJywgbW9kZUluZm86IHsgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlIH0gfSxcblx0XHRcdFx0XSksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGxpdmUgd2lkZ2V0IHBlcm1pc3Npb24gbGV2ZWwgd2hlbiB0aGUgcmVxdWVzdCBpcyBub3QgZm91bmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0Oi8vc2Vzc2lvbi90ZXN0Jyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRDaGF0UGVybWlzc2lvbkxldmVsRm9yVG9vbEludm9jYXRpb24oXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0J21pc3NpbmctcmVxdWVzdCcsXG5cdFx0XHRcdGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZShDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCksXG5cdFx0XHRcdGNyZWF0ZU1vY2tDaGF0U2VydmljZShbeyBpZDogJ3JlcXVlc3QtMScsIG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0IH0gfV0pLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgbGF0ZXN0IHJlcXVlc3QgcGVybWlzc2lvbiBsZXZlbCB3aGVuIHRoZXJlIGlzIG5vIHdpZGdldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly9zZXNzaW9uL3Rlc3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGb3JUb29sSW52b2NhdGlvbihcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRjcmVhdGVNb2NrQ2hhdFNlcnZpY2UoW1xuXHRcdFx0XHRcdHsgaWQ6ICdyZXF1ZXN0LTEnLCBtb2RlSW5mbzogeyBwZXJtaXNzaW9uTGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCB9IH0sXG5cdFx0XHRcdFx0eyBpZDogJ3JlcXVlc3QtMicsIG1vZGVJbmZvOiB7IHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB9IH0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRTYW5kYm94UHJlY2hlY2tJbnB1dHNGb3JUb29sSW52b2NhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlcmUgaXMgbm8gY2hhdCBwZXJtaXNzaW9uIGxldmVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0U2FuZGJveFByZWNoZWNrSW5wdXRzRm9yVG9vbEludm9jYXRpb24odW5kZWZpbmVkLCB1bmRlZmluZWQsIGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZShDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKSwgY3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtdKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHRoZSBkZWZhdWx0IGNoYXQgcGVybWlzc2lvbiBsZXZlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly9zZXNzaW9uL3Rlc3QnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uKHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkLCBjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KSwgY3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtdKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiB0cnVlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgZGVmYXVsdCBhcHByb3ZhbCBwZXJtaXNzaW9uIGZvciBhdXRvLWFwcHJvdmUgY2hhdCBwZXJtaXNzaW9uIGxldmVscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQ6Ly9zZXNzaW9uL3Rlc3QnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0U2FuZGJveFByZWNoZWNrSW5wdXRzRm9yVG9vbEludm9jYXRpb24oc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQsIGNyZWF0ZU1vY2tDaGF0V2lkZ2V0U2VydmljZShDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKSwgY3JlYXRlTW9ja0NoYXRTZXJ2aWNlKFtdKSksXG5cdFx0XHRcdHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogZmFsc2UgfVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uKHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkLCBjcmVhdGVNb2NrQ2hhdFdpZGdldFNlcnZpY2UoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QpLCBjcmVhdGVNb2NrQ2hhdFNlcnZpY2UoW10pKSxcblx0XHRcdFx0eyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiBmYWxzZSB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZExpbmVOdW1iZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmaW5kcyBleGFjdCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnbGluZSBvbmVcXG5saW5lIHR3b1xcbmxpbmUgdGhyZWUnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZExpbmVOdW1iZXIobW9kZWwsICdsaW5lIHR3bycpLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgd2hpdGVzcGFjZSBub3JtYWxpemF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCdmdW5jdGlvbiAgIGRvU29tZXRoaW5nKHg6ICBudW1iZXIpIHt9JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRMaW5lTnVtYmVyKG1vZGVsLCAnZnVuY3Rpb24gZG9Tb21ldGhpbmcoeDogbnVtYmVyKScpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm90IGZvdW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCdoZWxsbyB3b3JsZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTGluZU51bWJlcihtb2RlbCwgJ25vdCBoZXJlJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHJlZ2V4IHNwZWNpYWwgY2hhcmFjdGVycyBpbiBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCdjb25zdCBhcnIgPSBbMSwgMiwgM107JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRMaW5lTnVtYmVyKG1vZGVsLCAnWzEsIDIsIDNdJyksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgcGFydGlhbCBsaW5lIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCdpbXBvcnQgeyBNeUNsYXNzIH0gZnJvbSBcIi4vbXlNb2R1bGVcIjsnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZExpbmVOdW1iZXIobW9kZWwsICdNeUNsYXNzJyksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSBmcm9tIGlucHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCdjb25zdCB4ID0gNDI7JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRMaW5lTnVtYmVyKG1vZGVsLCAnICBjb25zdCB4ID0gNDI7ICAnKSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaW5kU3ltYm9sQ29sdW1uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZmluZHMgc3ltYm9sIHdpdGggd29yZCBib3VuZGFyaWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTeW1ib2xDb2x1bW4oJ2NvbnN0IG15VmFyID0gNDI7JywgJ215VmFyJyksIDcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyAxLWJhc2VkIGNvbHVtbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3ltYm9sQ29sdW1uKCd4ID0gMScsICd4JyksIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggcGFydGlhbCB3b3JkcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3ltYm9sQ29sdW1uKCdjb25zdCBteVZhcmlhYmxlID0gNDI7JywgJ215VmFyJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vdCBmb3VuZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3ltYm9sQ29sdW1uKCdoZWxsbyB3b3JsZCcsICdtaXNzaW5nJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHJlZ2V4IHNwZWNpYWwgY2hhcmFjdGVycyBpbiBzeW1ib2wgbmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3ltYm9sQ29sdW1uKCdhcnJbMF0gPSAxJywgJ2FycicpLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IG9jY3VycmVuY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN5bWJvbENvbHVtbignZm9vICsgZm9vJywgJ2ZvbycpLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Vycm9yUmVzdWx0JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY3JlYXRlcyByZXN1bHQgd2l0aCB0ZXh0IGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBlcnJvclJlc3VsdCgnc29tZXRoaW5nIHdlbnQgd3JvbmcnKTtcblx0XHRcdGNvbnN0IHRleHRQYXJ0ID0gcmVzdWx0LmNvbnRlbnQuZmluZChwID0+IHAua2luZCA9PT0gJ3RleHQnKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0UGFydCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRleHRQYXJ0IGFzIHsga2luZDogJ3RleHQnOyB2YWx1ZTogc3RyaW5nIH0pLnZhbHVlLCAnc29tZXRoaW5nIHdlbnQgd3JvbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldHMgdG9vbFJlc3VsdE1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBlcnJvclJlc3VsdCgnZXJyb3IgbWVzc2FnZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC50b29sUmVzdWx0TWVzc2FnZSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCLGdCQUFnQixrQkFBa0IsYUFBYSx5Q0FBeUMsaURBQWlEO0FBRTVLLFNBQVMsMkJBQTJCO0FBR3BDLE1BQU0sZ0JBQWdCLE1BQU07QUFFM0IsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFdBQVMsTUFBTTtBQUNkLGdCQUFZLE1BQU07QUFBQSxFQUNuQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFdBQVMsMkJBQTJCLFdBQTJDO0FBQzlFLFVBQU0sTUFBTSxhQUFhLElBQUksTUFBTSxtQkFBbUI7QUFDdEQsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0EsWUFBWSxDQUFDLGlCQUF5QixJQUFJLFNBQVMsS0FBSyxZQUFZO0FBQUEsSUFDckU7QUFDQSxXQUFPO0FBQUEsTUFDTixlQUFlO0FBQUEsTUFDZixjQUFjLE9BQU8sRUFBRSxTQUFTLENBQUMsTUFBTSxFQUFFO0FBQUEsTUFDekMsb0JBQW9CLENBQUMsTUFBVztBQUMvQixZQUFJLEVBQUUsU0FBUyxFQUFFLFdBQVcsSUFBSSxTQUFTLENBQUMsR0FBRztBQUM1QyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsV0FBUyxzQkFBc0IsVUFBcUg7QUFDbkosV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLE1BQ2Ys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
