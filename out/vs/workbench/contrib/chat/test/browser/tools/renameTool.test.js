import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LanguageFeaturesService } from "../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { RenameTool } from "../../../browser/tools/renameTool.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
function getTextContent(result) {
  const part = result.content.find((p) => p.kind === "text");
  return part?.value ?? "";
}
suite("RenameTool", () => {
  const disposables = new DisposableStore();
  let langFeatures;
  const testUri = URI.parse("file:///test/file.ts");
  const testContent = [
    'import { MyClass } from "./myClass";',
    "",
    "function doSomething() {",
    "	const instance = new MyClass();",
    "	instance.run();",
    "}"
  ].join("\n");
  function makeEdit(resource, range, text) {
    return { resource, versionId: void 0, textEdit: { range, text } };
  }
  function createMockTextModelService(model) {
    return {
      _serviceBrand: void 0,
      createModelReference: async () => ({
        object: { textEditorModel: model },
        dispose: () => {
        }
      }),
      registerTextModelContentProvider: () => ({ dispose: () => {
      } }),
      canHandleResource: () => false
    };
  }
  function createMockWorkspaceService() {
    const folderUri = URI.parse("file:///test");
    const folder = {
      uri: folderUri,
      toResource: (relativePath) => URI.parse(`file:///test/${relativePath}`)
    };
    return {
      _serviceBrand: void 0,
      getWorkspace: () => ({ folders: [folder] }),
      getWorkspaceFolder: (uri) => {
        if (uri.toString().startsWith(folderUri.toString())) {
          return folder;
        }
        return null;
      }
    };
  }
  function createMockChatService() {
    return {
      _serviceBrand: void 0,
      getSession: () => void 0
    };
  }
  function createMockBulkEditService() {
    const appliedEdits = [];
    return {
      _serviceBrand: void 0,
      apply: async (edit) => {
        appliedEdits.push(edit);
        return { ariaSummary: "", isApplied: true };
      },
      appliedEdits
    };
  }
  function createInvocation(parameters) {
    return { parameters };
  }
  const noopCountTokens = async () => 0;
  const noopProgress = { report() {
  } };
  function createTool(textModelService, options) {
    return new RenameTool(
      langFeatures,
      textModelService,
      createMockWorkspaceService(),
      createMockChatService(),
      options?.bulkEditService ?? createMockBulkEditService()
    );
  }
  setup(() => {
    langFeatures = new LanguageFeaturesService();
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getToolData", () => {
    test("returns tool data when no providers are registered", () => {
      const tool = disposables.add(createTool(createMockTextModelService(null)));
      assert.ok(tool.getToolData());
    });
    test("description does not include a per-language list", () => {
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const data = tool.getToolData();
      assert.ok(
        !data.modelDescription.includes("Currently supported for"),
        `expected modelDescription to not list languages, got: ${data.modelDescription}`
      );
      assert.ok(
        !data.modelDescription.includes("typescript"),
        "expected modelDescription to not include any specific language id"
      );
      assert.ok(
        !data.modelDescription.includes("all languages"),
        'expected modelDescription to not mention "all languages"'
      );
    });
    test("description is identical regardless of which providers are registered", () => {
      const tool1 = disposables.add(createTool(createMockTextModelService(null)));
      const data1 = tool1.getToolData();
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool2 = disposables.add(createTool(createMockTextModelService(model)));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      disposables.add(langFeatures.renameProvider.register("python", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const data2 = tool2.getToolData();
      assert.strictEqual(
        data1.modelDescription,
        data2.modelDescription,
        "expected modelDescription to be byte-stable across provider registrations"
      );
    });
  });
  suite("invoke", () => {
    test("returns error when no uri or filePath provided", async () => {
      const tool = disposables.add(createTool(createMockTextModelService(null)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", lineContent: "MyClass" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
    });
    test("returns error when no rename provider available", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("No rename provider"));
    });
    test("returns error when line content not found", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "nonexistent line" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find line content"));
    });
    test("returns error when symbol not found in line", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [] })
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "NotHere", newName: "Something", uri: testUri.toString(), lineContent: "function doSomething" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find symbol"));
    });
    test("returns error when rename is rejected", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const provider = {
        provideRenameEdits: () => ({
          edits: [],
          rejectReason: "Cannot rename this symbol"
        })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Rename rejected"));
      assert.ok(getTextContent(result).includes("Cannot rename this symbol"));
    });
    test("returns error when rename produces no edits", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const provider = {
        provideRenameEdits: () => ({
          edits: []
        })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("no edits"));
    });
    test("successful rename applies edits via bulk edit and reports result", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass"),
        makeEdit(testUri, new Range(4, 23, 4, 30), "MyNewClass"),
        makeEdit(otherUri, new Range(5, 14, 5, 21), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const bulkEditService = createMockBulkEditService();
      const tool = disposables.add(createTool(createMockTextModelService(model), { bulkEditService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("Renamed"));
      assert.ok(text.includes("MyClass"));
      assert.ok(text.includes("MyNewClass"));
      assert.ok(text.includes("3 edits"));
      assert.ok(text.includes("2 files"));
      assert.strictEqual(bulkEditService.appliedEdits.length, 1);
      assert.strictEqual(bulkEditService.appliedEdits[0].edits.length, 3);
    });
    test("successful rename with single edit reports singular message", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("1 edit"));
      assert.ok(text.includes("1 file"));
    });
    test("resolves filePath via workspace folders", async () => {
      const fileUri = URI.parse("file:///test/src/file.ts");
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, fileUri));
      const edits = [
        makeEdit(fileUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", filePath: "src/file.ts", lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Renamed"));
    });
    test("rejects filePath that escapes the session working directory", async () => {
      const outsideUri = URI.parse("file:///outside.ts");
      const outsideModel = disposables.add(createTextModel("const OutsideSecretMarker = 1;", "typescript", void 0, outsideUri));
      const requestedUris = [];
      const textModelService = {
        _serviceBrand: void 0,
        createModelReference: async (uri) => {
          requestedUris.push(uri);
          return { object: { textEditorModel: outsideModel }, dispose: () => {
          } };
        },
        registerTextModelContentProvider: () => ({ dispose: () => {
        } }),
        canHandleResource: () => false
      };
      disposables.add(langFeatures.renameProvider.register("typescript", {
        provideRenameEdits: () => ({ edits: [makeEdit(outsideUri, new Range(1, 7, 1, 26), "RenamedSecretMarker")] })
      }));
      const bulkEditService = createMockBulkEditService();
      const tool = disposables.add(createTool(textModelService, { bulkEditService }));
      const result = await tool.invoke(
        {
          parameters: { symbol: "OutsideSecretMarker", newName: "RenamedSecretMarker", filePath: "../outside.ts", lineContent: "const OutsideSecretMarker = 1;" },
          context: { workingDirectory: URI.parse("file:///session-dir") }
        },
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
      assert.strictEqual(requestedUris.length, 0);
      assert.strictEqual(bulkEditService.appliedEdits.length, 0);
    });
    test("result includes toolResultMessage", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const edits = [
        makeEdit(testUri, new Range(1, 10, 1, 17), "MyNewClass")
      ];
      const provider = {
        provideRenameEdits: () => ({ edits })
      };
      disposables.add(langFeatures.renameProvider.register("typescript", provider));
      const tool = disposables.add(createTool(createMockTextModelService(model)));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", newName: "MyNewClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(result.toolResultMessage);
      const msg = result.toolResultMessage;
      assert.ok(msg.value.includes("Renamed"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Rvb2xzL3JlbmFtZVRvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgUmVuYW1lUHJvdmlkZXIsIFdvcmtzcGFjZUVkaXQsIFJlamVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UsIElCdWxrRWRpdFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZW5hbWVUb29sIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci90b29scy9yZW5hbWVUb29sLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBJVG9vbFJlc3VsdFRleHRQYXJ0LCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuZnVuY3Rpb24gZ2V0VGV4dENvbnRlbnQocmVzdWx0OiBJVG9vbFJlc3VsdCk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnQgPSByZXN1bHQuY29udGVudC5maW5kKChwKTogcCBpcyBJVG9vbFJlc3VsdFRleHRQYXJ0ID0+IHAua2luZCA9PT0gJ3RleHQnKTtcblx0cmV0dXJuIHBhcnQ/LnZhbHVlID8/ICcnO1xufVxuXG5zdWl0ZSgnUmVuYW1lVG9vbCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGxhbmdGZWF0dXJlczogTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U7XG5cblx0Y29uc3QgdGVzdFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZpbGUudHMnKTtcblx0Y29uc3QgdGVzdENvbnRlbnQgPSBbXG5cdFx0J2ltcG9ydCB7IE15Q2xhc3MgfSBmcm9tIFwiLi9teUNsYXNzXCI7Jyxcblx0XHQnJyxcblx0XHQnZnVuY3Rpb24gZG9Tb21ldGhpbmcoKSB7Jyxcblx0XHQnXFx0Y29uc3QgaW5zdGFuY2UgPSBuZXcgTXlDbGFzcygpOycsXG5cdFx0J1xcdGluc3RhbmNlLnJ1bigpOycsXG5cdFx0J30nLFxuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdGZ1bmN0aW9uIG1ha2VFZGl0KHJlc291cmNlOiBVUkksIHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2UsIHZlcnNpb25JZDogdW5kZWZpbmVkLCB0ZXh0RWRpdDogeyByYW5nZSwgdGV4dCB9IH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbDogdW5rbm93bik6IElUZXh0TW9kZWxTZXJ2aWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Y3JlYXRlTW9kZWxSZWZlcmVuY2U6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdG9iamVjdDogeyB0ZXh0RWRpdG9yTW9kZWw6IG1vZGVsIH0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdH0pLFxuXHRcdFx0cmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdGNhbkhhbmRsZVJlc291cmNlOiAoKSA9PiBmYWxzZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRleHRNb2RlbFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Uge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0Jyk7XG5cdFx0Y29uc3QgZm9sZGVyID0ge1xuXHRcdFx0dXJpOiBmb2xkZXJVcmksXG5cdFx0XHR0b1Jlc291cmNlOiAocmVsYXRpdmVQYXRoOiBzdHJpbmcpID0+IFVSSS5wYXJzZShgZmlsZTovLy90ZXN0LyR7cmVsYXRpdmVQYXRofWApLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlRm9sZGVyO1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRXb3Jrc3BhY2U6ICgpID0+ICh7IGZvbGRlcnM6IFtmb2xkZXJdIH0pLFxuXHRcdFx0Z2V0V29ya3NwYWNlRm9sZGVyOiAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0aWYgKHVyaS50b1N0cmluZygpLnN0YXJ0c1dpdGgoZm9sZGVyVXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvbGRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tDaGF0U2VydmljZSgpOiBJQ2hhdFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRnZXRTZXNzaW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDaGF0U2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tCdWxrRWRpdFNlcnZpY2UoKTogSUJ1bGtFZGl0U2VydmljZSAmIHsgYXBwbGllZEVkaXRzOiBXb3Jrc3BhY2VFZGl0W10gfSB7XG5cdFx0Y29uc3QgYXBwbGllZEVkaXRzOiBXb3Jrc3BhY2VFZGl0W10gPSBbXTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0YXBwbHk6IGFzeW5jIChlZGl0OiBXb3Jrc3BhY2VFZGl0KTogUHJvbWlzZTxJQnVsa0VkaXRSZXN1bHQ+ID0+IHtcblx0XHRcdFx0YXBwbGllZEVkaXRzLnB1c2goZWRpdCk7XG5cdFx0XHRcdHJldHVybiB7IGFyaWFTdW1tYXJ5OiAnJywgaXNBcHBsaWVkOiB0cnVlIH07XG5cdFx0XHR9LFxuXHRcdFx0YXBwbGllZEVkaXRzLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQnVsa0VkaXRTZXJ2aWNlICYgeyBhcHBsaWVkRWRpdHM6IFdvcmtzcGFjZUVkaXRbXSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSW52b2NhdGlvbihwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElUb29sSW52b2NhdGlvbiB7XG5cdFx0cmV0dXJuIHsgcGFyYW1ldGVycyB9IGFzIHVua25vd24gYXMgSVRvb2xJbnZvY2F0aW9uO1xuXHR9XG5cblx0Y29uc3Qgbm9vcENvdW50VG9rZW5zID0gYXN5bmMgKCkgPT4gMDtcblx0Y29uc3Qgbm9vcFByb2dyZXNzOiBUb29sUHJvZ3Jlc3MgPSB7IHJlcG9ydCgpIHsgfSB9O1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRvb2wodGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsIG9wdGlvbnM/OiB7IGJ1bGtFZGl0U2VydmljZT86IElCdWxrRWRpdFNlcnZpY2UgfSk6IFJlbmFtZVRvb2wge1xuXHRcdHJldHVybiBuZXcgUmVuYW1lVG9vbChcblx0XHRcdGxhbmdGZWF0dXJlcyxcblx0XHRcdHRleHRNb2RlbFNlcnZpY2UsXG5cdFx0XHRjcmVhdGVNb2NrV29ya3NwYWNlU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlTW9ja0NoYXRTZXJ2aWNlKCksXG5cdFx0XHRvcHRpb25zPy5idWxrRWRpdFNlcnZpY2UgPz8gY3JlYXRlTW9ja0J1bGtFZGl0U2VydmljZSgpLFxuXHRcdCk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bGFuZ0ZlYXR1cmVzID0gbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0VG9vbERhdGEnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRvb2wgZGF0YSB3aGVuIG5vIHByb3ZpZGVycyBhcmUgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShudWxsISkpKTtcblx0XHRcdGFzc2VydC5vayh0b29sLmdldFRvb2xEYXRhKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVzY3JpcHRpb24gZG9lcyBub3QgaW5jbHVkZSBhIHBlci1sYW5ndWFnZSBsaXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKSA9PiAoeyBlZGl0czogW10gfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBkYXRhID0gdG9vbC5nZXRUb29sRGF0YSgpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkYXRhLm1vZGVsRGVzY3JpcHRpb24uaW5jbHVkZXMoJ0N1cnJlbnRseSBzdXBwb3J0ZWQgZm9yJyksXG5cdFx0XHRcdGBleHBlY3RlZCBtb2RlbERlc2NyaXB0aW9uIHRvIG5vdCBsaXN0IGxhbmd1YWdlcywgZ290OiAke2RhdGEubW9kZWxEZXNjcmlwdGlvbn1gKTtcblx0XHRcdGFzc2VydC5vayghZGF0YS5tb2RlbERlc2NyaXB0aW9uLmluY2x1ZGVzKCd0eXBlc2NyaXB0JyksXG5cdFx0XHRcdCdleHBlY3RlZCBtb2RlbERlc2NyaXB0aW9uIHRvIG5vdCBpbmNsdWRlIGFueSBzcGVjaWZpYyBsYW5ndWFnZSBpZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkYXRhLm1vZGVsRGVzY3JpcHRpb24uaW5jbHVkZXMoJ2FsbCBsYW5ndWFnZXMnKSxcblx0XHRcdFx0J2V4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gbm90IG1lbnRpb24gXCJhbGwgbGFuZ3VhZ2VzXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlc2NyaXB0aW9uIGlzIGlkZW50aWNhbCByZWdhcmRsZXNzIG9mIHdoaWNoIHByb3ZpZGVycyBhcmUgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wxID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobnVsbCEpKSk7XG5cdFx0XHRjb25zdCBkYXRhMSA9IHRvb2wxLmdldFRvb2xEYXRhKCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHRvb2wyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0Jywge1xuXHRcdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6ICgpID0+ICh7IGVkaXRzOiBbXSB9KSxcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3B5dGhvbicsIHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKSA9PiAoeyBlZGl0czogW10gfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBkYXRhMiA9IHRvb2wyLmdldFRvb2xEYXRhKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhMS5tb2RlbERlc2NyaXB0aW9uLCBkYXRhMi5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHQnZXhwZWN0ZWQgbW9kZWxEZXNjcmlwdGlvbiB0byBiZSBieXRlLXN0YWJsZSBhY3Jvc3MgcHJvdmlkZXIgcmVnaXN0cmF0aW9ucycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW52b2tlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIG5vIHVyaSBvciBmaWxlUGF0aCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShudWxsISkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgbGluZUNvbnRlbnQ6ICdNeUNsYXNzJyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnUHJvdmlkZSBlaXRoZXInKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gbm8gcmVuYW1lIHByb3ZpZGVyIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdC8vIE5vIHJlbmFtZSBwcm92aWRlciByZWdpc3RlcmVkXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ05vIHJlbmFtZSBwcm92aWRlcicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBsaW5lIGNvbnRlbnQgbm90IGZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKSA9PiAoeyBlZGl0czogW10gfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ25vbmV4aXN0ZW50IGxpbmUnIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBsaW5lIGNvbnRlbnQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gc3ltYm9sIG5vdCBmb3VuZCBpbiBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKSA9PiAoeyBlZGl0czogW10gfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB0b29sID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRvb2woY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWwpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ05vdEhlcmUnLCBuZXdOYW1lOiAnU29tZXRoaW5nJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnZnVuY3Rpb24gZG9Tb21ldGhpbmcnIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBzeW1ib2wnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gcmVuYW1lIGlzIHJlamVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IFJlbmFtZVByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6ICgpOiBXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uID0+ICh7XG5cdFx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHRcdHJlamVjdFJlYXNvbjogJ0Nhbm5vdCByZW5hbWUgdGhpcyBzeW1ib2wnLFxuXHRcdFx0XHR9KSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcHJvdmlkZXIpKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnUmVuYW1lIHJlamVjdGVkJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ0Nhbm5vdCByZW5hbWUgdGhpcyBzeW1ib2wnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVycm9yIHdoZW4gcmVuYW1lIHByb2R1Y2VzIG5vIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXI6IFJlbmFtZVByb3ZpZGVyID0ge1xuXHRcdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6ICgpOiBXb3Jrc3BhY2VFZGl0ICYgUmVqZWN0aW9uID0+ICh7XG5cdFx0XHRcdFx0ZWRpdHM6IFtdLFxuXHRcdFx0XHR9KSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcHJvdmlkZXIpKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnbm8gZWRpdHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWNjZXNzZnVsIHJlbmFtZSBhcHBsaWVzIGVkaXRzIHZpYSBidWxrIGVkaXQgYW5kIHJlcG9ydHMgcmVzdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3Qgb3RoZXJVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9vdGhlci50cycpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBbXG5cdFx0XHRcdG1ha2VFZGl0KHRlc3RVcmksIG5ldyBSYW5nZSgxLCAxMCwgMSwgMTcpLCAnTXlOZXdDbGFzcycpLFxuXHRcdFx0XHRtYWtlRWRpdCh0ZXN0VXJpLCBuZXcgUmFuZ2UoNCwgMjMsIDQsIDMwKSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdFx0bWFrZUVkaXQob3RoZXJVcmksIG5ldyBSYW5nZSg1LCAxNCwgNSwgMjEpLCAnTXlOZXdDbGFzcycpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBSZW5hbWVQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKTogV29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbiA9PiAoeyBlZGl0cyB9KSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcHJvdmlkZXIpKTtcblxuXHRcdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gY3JlYXRlTW9ja0J1bGtFZGl0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgeyBidWxrRWRpdFNlcnZpY2UgfSkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0Y3JlYXRlSW52b2NhdGlvbih7IHN5bWJvbDogJ015Q2xhc3MnLCBuZXdOYW1lOiAnTXlOZXdDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gZ2V0VGV4dENvbnRlbnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdSZW5hbWVkJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ015Q2xhc3MnKSk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnTXlOZXdDbGFzcycpKTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCczIGVkaXRzJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJzIgZmlsZXMnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnVsa0VkaXRTZXJ2aWNlLmFwcGxpZWRFZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bGtFZGl0U2VydmljZS5hcHBsaWVkRWRpdHNbMF0uZWRpdHMubGVuZ3RoLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1Y2Nlc3NmdWwgcmVuYW1lIHdpdGggc2luZ2xlIGVkaXQgcmVwb3J0cyBzaW5ndWxhciBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBbXG5cdFx0XHRcdG1ha2VFZGl0KHRlc3RVcmksIG5ldyBSYW5nZSgxLCAxMCwgMSwgMTcpLCAnTXlOZXdDbGFzcycpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBSZW5hbWVQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKTogV29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbiA9PiAoeyBlZGl0cyB9KSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcHJvdmlkZXIpKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgbmV3TmFtZTogJ015TmV3Q2xhc3MnLCB1cmk6IHRlc3RVcmkudG9TdHJpbmcoKSwgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgdGV4dCA9IGdldFRleHRDb250ZW50KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnMSBlZGl0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJzEgZmlsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGZpbGVQYXRoIHZpYSB3b3Jrc3BhY2UgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9zcmMvZmlsZS50cycpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgZmlsZVVyaSkpO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBbXG5cdFx0XHRcdG1ha2VFZGl0KGZpbGVVcmksIG5ldyBSYW5nZSgxLCAxMCwgMSwgMTcpLCAnTXlOZXdDbGFzcycpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBSZW5hbWVQcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzOiAoKTogV29ya3NwYWNlRWRpdCAmIFJlamVjdGlvbiA9PiAoeyBlZGl0cyB9KSxcblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcHJvdmlkZXIpKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgbmV3TmFtZTogJ015TmV3Q2xhc3MnLCBmaWxlUGF0aDogJ3NyYy9maWxlLnRzJywgbGluZUNvbnRlbnQ6ICdpbXBvcnQgeyBNeUNsYXNzIH0nIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ1JlbmFtZWQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGZpbGVQYXRoIHRoYXQgZXNjYXBlcyB0aGUgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHNpZGVVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vb3V0c2lkZS50cycpO1xuXHRcdFx0Y29uc3Qgb3V0c2lkZU1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnY29uc3QgT3V0c2lkZVNlY3JldE1hcmtlciA9IDE7JywgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIG91dHNpZGVVcmkpKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RlZFVyaXM6IFVSSVtdID0gW107XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWxTZXJ2aWNlID0ge1xuXHRcdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWF0ZU1vZGVsUmVmZXJlbmNlOiBhc3luYyAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0XHRyZXF1ZXN0ZWRVcmlzLnB1c2godXJpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBvYmplY3Q6IHsgdGV4dEVkaXRvck1vZGVsOiBvdXRzaWRlTW9kZWwgfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdGNhbkhhbmRsZVJlc291cmNlOiAoKSA9PiBmYWxzZSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJVGV4dE1vZGVsU2VydmljZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCk6IFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24gPT4gKHsgZWRpdHM6IFttYWtlRWRpdChvdXRzaWRlVXJpLCBuZXcgUmFuZ2UoMSwgNywgMSwgMjYpLCAnUmVuYW1lZFNlY3JldE1hcmtlcicpXSB9KSxcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gY3JlYXRlTW9ja0J1bGtFZGl0U2VydmljZSgpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKHRleHRNb2RlbFNlcnZpY2UsIHsgYnVsa0VkaXRTZXJ2aWNlIH0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczogeyBzeW1ib2w6ICdPdXRzaWRlU2VjcmV0TWFya2VyJywgbmV3TmFtZTogJ1JlbmFtZWRTZWNyZXRNYXJrZXInLCBmaWxlUGF0aDogJy4uL291dHNpZGUudHMnLCBsaW5lQ29udGVudDogJ2NvbnN0IE91dHNpZGVTZWNyZXRNYXJrZXIgPSAxOycgfSxcblx0XHRcdFx0XHRjb250ZXh0OiB7IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5wYXJzZSgnZmlsZTovLy9zZXNzaW9uLWRpcicpIH0sXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBJVG9vbEludm9jYXRpb24sXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnUHJvdmlkZSBlaXRoZXInKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdGVkVXJpcy5sZW5ndGgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJ1bGtFZGl0U2VydmljZS5hcHBsaWVkRWRpdHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3VsdCBpbmNsdWRlcyB0b29sUmVzdWx0TWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXN0Q29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblx0XHRcdGNvbnN0IGVkaXRzID0gW1xuXHRcdFx0XHRtYWtlRWRpdCh0ZXN0VXJpLCBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSwgJ015TmV3Q2xhc3MnKSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBwcm92aWRlcjogUmVuYW1lUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0czogKCk6IFdvcmtzcGFjZUVkaXQgJiBSZWplY3Rpb24gPT4gKHsgZWRpdHMgfSksXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZW5hbWVQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHByb3ZpZGVyKSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIG5ld05hbWU6ICdNeU5ld0NsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2UpO1xuXHRcdFx0Y29uc3QgbXNnID0gcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlIGFzIElNYXJrZG93blN0cmluZztcblx0XHRcdGFzc2VydC5vayhtc2cudmFsdWUuaW5jbHVkZXMoJ1JlbmFtZWQnKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUd0QixTQUFTLCtCQUErQjtBQUV4QyxTQUFTLHVCQUF1QjtBQUdoQyxTQUFTLGtCQUFrQjtBQUczQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGVBQWUsUUFBNkI7QUFDcEQsUUFBTSxPQUFPLE9BQU8sUUFBUSxLQUFLLENBQUMsTUFBZ0MsRUFBRSxTQUFTLE1BQU07QUFDbkYsU0FBTyxNQUFNLFNBQVM7QUFDdkI7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
