import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { LanguageFeaturesService } from "../../../../../../editor/common/services/languageFeaturesService.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { FileMatch, OneLineRange, TextSearchMatch } from "../../../../../services/search/common/search.js";
import { UsagesTool } from "../../../browser/tools/usagesTool.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
function getTextContent(result) {
  const part = result.content.find((p) => p.kind === "text");
  return part?.value ?? "";
}
suite("UsagesTool", () => {
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
  function createMockModelService(models) {
    return {
      _serviceBrand: void 0,
      getModel: (uri) => models?.find((m) => m.uri.toString() === uri.toString()) ?? null
    };
  }
  function createMockSearchService(searchImpl) {
    return {
      _serviceBrand: void 0,
      textSearch: async (query) => searchImpl?.(query) ?? { results: [], messages: [] }
    };
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
  function createInvocation(parameters) {
    return { parameters };
  }
  const noopCountTokens = async () => 0;
  const noopProgress = { report() {
  } };
  function createTool(textModelService, workspaceService, options) {
    return new UsagesTool(langFeatures, options?.modelService ?? createMockModelService(), options?.searchService ?? createMockSearchService(), textModelService, workspaceService);
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
      const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      assert.ok(tool.getToolData());
    });
    test("description does not include a per-language list", () => {
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
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
      const tool1 = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      const data1 = tool1.getToolData();
      const model = disposables.add(createTextModel("", "typescript", void 0, testUri));
      const tool2 = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      disposables.add(langFeatures.referenceProvider.register("python", { provideReferences: () => [] }));
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
      const tool = disposables.add(createTool(createMockTextModelService(null), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", lineContent: "MyClass" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Provide either"));
    });
    test("returns error when line content not found", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "nonexistent line" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find line content"));
    });
    test("returns error when symbol not found in line", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", { provideReferences: () => [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "NotHere", uri: testUri.toString(), lineContent: "function doSomething" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("Could not find symbol"));
    });
    test("finds references and classifies them with usage tags", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      const refProvider = {
        provideReferences: (_model) => [
          { uri: testUri, range: new Range(1, 10, 1, 17) },
          { uri: testUri, range: new Range(4, 23, 4, 30) },
          { uri: otherUri, range: new Range(5, 1, 5, 8) }
        ]
      };
      const defProvider = {
        provideDefinition: () => [{ uri: testUri, range: new Range(1, 10, 1, 17) }]
      };
      const implProvider = {
        provideImplementation: () => [{ uri: otherUri, range: new Range(5, 1, 5, 8) }]
      };
      disposables.add(langFeatures.referenceProvider.register("typescript", refProvider));
      disposables.add(langFeatures.definitionProvider.register("typescript", defProvider));
      disposables.add(langFeatures.implementationProvider.register("typescript", implProvider));
      const searchCalled = [];
      const searchService = createMockSearchService((query) => {
        searchCalled.push(query);
        const fileMatch = new FileMatch(otherUri);
        fileMatch.results = [new TextSearchMatch(
          "export class MyClass implements IMyClass {",
          new OneLineRange(4, 0, 7)
          // 0-based line 4 = 1-based line 5
        )];
        return { results: [fileMatch], messages: [] };
      });
      const modelService = createMockModelService([model]);
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("3 usages of `MyClass`"));
      assert.ok(text.includes(`<usage type="definition" uri="${testUri.toString()}" line="1">`));
      assert.ok(text.includes(`<usage type="reference" uri="${testUri.toString()}" line="4">`));
      assert.ok(text.includes(`<usage type="implementation" uri="${otherUri.toString()}" line="5">`));
      assert.ok(text.includes('import { MyClass } from "./myClass"'));
      assert.ok(text.includes("const instance = new MyClass()"));
      assert.ok(text.includes("export class MyClass implements IMyClass {"));
      assert.ok(text.includes("</usage>"));
      assert.strictEqual(searchCalled.length, 1);
      assert.ok(searchCalled[0].contentPattern.pattern.includes("MyClass"));
      assert.ok(searchCalled[0].contentPattern.isWordMatch);
    });
    test("uses self-closing tag when no preview available", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      const otherUri = URI.parse("file:///test/other.ts");
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: otherUri, range: new Range(10, 5, 10, 12) }
        ]
      }));
      const searchService = createMockSearchService(() => ({ results: [], messages: [] }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes(`<usage type="reference" uri="${otherUri.toString()}" line="10" />`));
    });
    test("does not call search service for files already open in model service", async () => {
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: testUri, range: new Range(1, 10, 1, 17) }
        ]
      }));
      let searchCalled = false;
      const searchService = createMockSearchService(() => {
        searchCalled = true;
        return { results: [], messages: [] };
      });
      const modelService = createMockModelService([model]);
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService(), { modelService, searchService }));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", uri: testUri.toString(), lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
      assert.strictEqual(searchCalled, false, "search service should not be called when all files are open");
    });
    test("handles whitespace normalization in lineContent", async () => {
      const content = "function   doSomething(x:  number) {}";
      const model = disposables.add(createTextModel(content, "typescript", void 0, testUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: testUri, range: new Range(1, 12, 1, 23) }
        ]
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "doSomething", uri: testUri.toString(), lineContent: "function doSomething(x: number)" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
    });
    test("resolves filePath via workspace folders", async () => {
      const fileUri = URI.parse("file:///test/src/file.ts");
      const model = disposables.add(createTextModel(testContent, "typescript", void 0, fileUri));
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: fileUri, range: new Range(1, 10, 1, 17) }
        ]
      }));
      const tool = disposables.add(createTool(createMockTextModelService(model), createMockWorkspaceService()));
      const result = await tool.invoke(
        createInvocation({ symbol: "MyClass", filePath: "src/file.ts", lineContent: "import { MyClass }" }),
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      assert.ok(getTextContent(result).includes("1 usages"));
    });
    test("rejects filePath that escapes the session working directory", async () => {
      const outsideUri = URI.parse("file:///outside.ts");
      const outsideContent = "export const OutsideSecretMarker = 1;";
      const outsideModel = disposables.add(createTextModel(outsideContent, "typescript", void 0, outsideUri));
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
      disposables.add(langFeatures.referenceProvider.register("typescript", {
        provideReferences: () => [
          { uri: outsideUri, range: new Range(1, 14, 1, 33) }
        ]
      }));
      const tool = disposables.add(createTool(textModelService, createMockWorkspaceService(), { modelService: createMockModelService([outsideModel]) }));
      const result = await tool.invoke(
        {
          parameters: { symbol: "OutsideSecretMarker", filePath: "../outside.ts", lineContent: outsideContent },
          context: { workingDirectory: URI.parse("file:///session-dir") }
        },
        noopCountTokens,
        noopProgress,
        CancellationToken.None
      );
      const text = getTextContent(result);
      assert.ok(text.includes("Provide either"));
      assert.ok(!text.includes(outsideContent));
      assert.strictEqual(requestedUris.length, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Rvb2xzL3VzYWdlc1Rvb2wudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRGVmaW5pdGlvblByb3ZpZGVyLCBJbXBsZW1lbnRhdGlvblByb3ZpZGVyLCBMb2NhdGlvbiwgUmVmZXJlbmNlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBGaWxlTWF0Y2gsIElTZWFyY2hDb21wbGV0ZSwgSVNlYXJjaFNlcnZpY2UsIElUZXh0UXVlcnksIE9uZUxpbmVSYW5nZSwgVGV4dFNlYXJjaE1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgVXNhZ2VzVG9vbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvdXNhZ2VzVG9vbC5qcyc7XG5pbXBvcnQgeyBJVG9vbEludm9jYXRpb24sIElUb29sUmVzdWx0LCBJVG9vbFJlc3VsdFRleHRQYXJ0LCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuZnVuY3Rpb24gZ2V0VGV4dENvbnRlbnQocmVzdWx0OiBJVG9vbFJlc3VsdCk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnQgPSByZXN1bHQuY29udGVudC5maW5kKChwKTogcCBpcyBJVG9vbFJlc3VsdFRleHRQYXJ0ID0+IHAua2luZCA9PT0gJ3RleHQnKTtcblx0cmV0dXJuIHBhcnQ/LnZhbHVlID8/ICcnO1xufVxuXG5zdWl0ZSgnVXNhZ2VzVG9vbCcsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGxhbmdGZWF0dXJlczogTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U7XG5cblx0Y29uc3QgdGVzdFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZpbGUudHMnKTtcblx0Y29uc3QgdGVzdENvbnRlbnQgPSBbXG5cdFx0J2ltcG9ydCB7IE15Q2xhc3MgfSBmcm9tIFwiLi9teUNsYXNzXCI7Jyxcblx0XHQnJyxcblx0XHQnZnVuY3Rpb24gZG9Tb21ldGhpbmcoKSB7Jyxcblx0XHQnXFx0Y29uc3QgaW5zdGFuY2UgPSBuZXcgTXlDbGFzcygpOycsXG5cdFx0J1xcdGluc3RhbmNlLnJ1bigpOycsXG5cdFx0J30nLFxuXHRdLmpvaW4oJ1xcbicpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tNb2RlbFNlcnZpY2UobW9kZWxzPzogSVRleHRNb2RlbFtdKTogSU1vZGVsU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldE1vZGVsOiAodXJpOiBVUkkpID0+IG1vZGVscz8uZmluZChtID0+IG0udXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSA/PyBudWxsLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJTW9kZWxTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1NlYXJjaFNlcnZpY2Uoc2VhcmNoSW1wbD86IChxdWVyeTogSVRleHRRdWVyeSkgPT4gSVNlYXJjaENvbXBsZXRlKTogSVNlYXJjaFNlcnZpY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXh0U2VhcmNoOiBhc3luYyAocXVlcnk6IElUZXh0UXVlcnkpID0+IHNlYXJjaEltcGw/LihxdWVyeSkgPz8geyByZXN1bHRzOiBbXSwgbWVzc2FnZXM6IFtdIH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElTZWFyY2hTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1RleHRNb2RlbFNlcnZpY2UobW9kZWw6IElUZXh0TW9kZWwpOiBJVGV4dE1vZGVsU2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNyZWF0ZU1vZGVsUmVmZXJlbmNlOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRvYmplY3Q6IHsgdGV4dEVkaXRvck1vZGVsOiBtb2RlbCB9LFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRjYW5IYW5kbGVSZXNvdXJjZTogKCkgPT4gZmFsc2UsXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXh0TW9kZWxTZXJ2aWNlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpO1xuXHRcdGNvbnN0IGZvbGRlciA9IHtcblx0XHRcdHVyaTogZm9sZGVyVXJpLFxuXHRcdFx0dG9SZXNvdXJjZTogKHJlbGF0aXZlUGF0aDogc3RyaW5nKSA9PiBVUkkucGFyc2UoYGZpbGU6Ly8vdGVzdC8ke3JlbGF0aXZlUGF0aH1gKSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZUZvbGRlcjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0V29ya3NwYWNlOiAoKSA9PiAoeyBmb2xkZXJzOiBbZm9sZGVyXSB9KSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlcjogKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdGlmICh1cmkudG9TdHJpbmcoKS5zdGFydHNXaXRoKGZvbGRlclVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVJbnZvY2F0aW9uKHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogSVRvb2xJbnZvY2F0aW9uIHtcblx0XHRyZXR1cm4geyBwYXJhbWV0ZXJzIH0gYXMgdW5rbm93biBhcyBJVG9vbEludm9jYXRpb247XG5cdH1cblxuXHRjb25zdCBub29wQ291bnRUb2tlbnMgPSBhc3luYyAoKSA9PiAwO1xuXHRjb25zdCBub29wUHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcyA9IHsgcmVwb3J0KCkgeyB9IH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlVG9vbCh0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSwgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBvcHRpb25zPzogeyBtb2RlbFNlcnZpY2U/OiBJTW9kZWxTZXJ2aWNlOyBzZWFyY2hTZXJ2aWNlPzogSVNlYXJjaFNlcnZpY2UgfSk6IFVzYWdlc1Rvb2wge1xuXHRcdHJldHVybiBuZXcgVXNhZ2VzVG9vbChsYW5nRmVhdHVyZXMsIG9wdGlvbnM/Lm1vZGVsU2VydmljZSA/PyBjcmVhdGVNb2NrTW9kZWxTZXJ2aWNlKCksIG9wdGlvbnM/LnNlYXJjaFNlcnZpY2UgPz8gY3JlYXRlTW9ja1NlYXJjaFNlcnZpY2UoKSwgdGV4dE1vZGVsU2VydmljZSwgd29ya3NwYWNlU2VydmljZSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bGFuZ0ZlYXR1cmVzID0gbmV3IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0VG9vbERhdGEnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRvb2wgZGF0YSB3aGVuIG5vIHByb3ZpZGVycyBhcmUgcmVnaXN0ZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShudWxsISksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGFzc2VydC5vayh0b29sLmdldFRvb2xEYXRhKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVzY3JpcHRpb24gZG9lcyBub3QgaW5jbHVkZSBhIHBlci1sYW5ndWFnZSBsaXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHsgcHJvdmlkZVJlZmVyZW5jZXM6ICgpID0+IFtdIH0pKTtcblx0XHRcdGNvbnN0IGRhdGEgPSB0b29sLmdldFRvb2xEYXRhKCk7XG5cdFx0XHRhc3NlcnQub2soIWRhdGEubW9kZWxEZXNjcmlwdGlvbi5pbmNsdWRlcygnQ3VycmVudGx5IHN1cHBvcnRlZCBmb3InKSxcblx0XHRcdFx0YGV4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gbm90IGxpc3QgbGFuZ3VhZ2VzLCBnb3Q6ICR7ZGF0YS5tb2RlbERlc2NyaXB0aW9ufWApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFkYXRhLm1vZGVsRGVzY3JpcHRpb24uaW5jbHVkZXMoJ3R5cGVzY3JpcHQnKSxcblx0XHRcdFx0J2V4cGVjdGVkIG1vZGVsRGVzY3JpcHRpb24gdG8gbm90IGluY2x1ZGUgYW55IHNwZWNpZmljIGxhbmd1YWdlIGlkJyk7XG5cdFx0XHRhc3NlcnQub2soIWRhdGEubW9kZWxEZXNjcmlwdGlvbi5pbmNsdWRlcygnYWxsIGxhbmd1YWdlcycpLFxuXHRcdFx0XHQnZXhwZWN0ZWQgbW9kZWxEZXNjcmlwdGlvbiB0byBub3QgbWVudGlvbiBcImFsbCBsYW5ndWFnZXNcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVzY3JpcHRpb24gaXMgaWRlbnRpY2FsIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggcHJvdmlkZXJzIGFyZSByZWdpc3RlcmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbDEgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShudWxsISksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGRhdGExID0gdG9vbDEuZ2V0VG9vbERhdGEoKTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3QgdG9vbDIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7IHByb3ZpZGVSZWZlcmVuY2VzOiAoKSA9PiBbXSB9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCdweXRob24nLCB7IHByb3ZpZGVSZWZlcmVuY2VzOiAoKSA9PiBbXSB9KSk7XG5cdFx0XHRjb25zdCBkYXRhMiA9IHRvb2wyLmdldFRvb2xEYXRhKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhMS5tb2RlbERlc2NyaXB0aW9uLCBkYXRhMi5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHQnZXhwZWN0ZWQgbW9kZWxEZXNjcmlwdGlvbiB0byBiZSBieXRlLXN0YWJsZSBhY3Jvc3MgcHJvdmlkZXIgcmVnaXN0cmF0aW9ucycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW52b2tlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIG5vIHVyaSBvciBmaWxlUGF0aCBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShudWxsISksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIGxpbmVDb250ZW50OiAnTXlDbGFzcycgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ1Byb3ZpZGUgZWl0aGVyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlcnJvciB3aGVuIGxpbmUgY29udGVudCBub3QgZm91bmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwodGVzdENvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgeyBwcm92aWRlUmVmZXJlbmNlczogKCkgPT4gW10gfSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnbm9uZXhpc3RlbnQgbGluZScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJ0NvdWxkIG5vdCBmaW5kIGxpbmUgY29udGVudCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZXJyb3Igd2hlbiBzeW1ib2wgbm90IGZvdW5kIGluIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwodGVzdENvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCB0ZXN0VXJpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgeyBwcm92aWRlUmVmZXJlbmNlczogKCkgPT4gW10gfSkpO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdOb3RIZXJlJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnZnVuY3Rpb24gZG9Tb21ldGhpbmcnIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhnZXRUZXh0Q29udGVudChyZXN1bHQpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBzeW1ib2wnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyByZWZlcmVuY2VzIGFuZCBjbGFzc2lmaWVzIHRoZW0gd2l0aCB1c2FnZSB0YWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3Qgb3RoZXJVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9vdGhlci50cycpO1xuXG5cdFx0XHRjb25zdCByZWZQcm92aWRlcjogUmVmZXJlbmNlUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzOiAoX21vZGVsOiBJVGV4dE1vZGVsKTogTG9jYXRpb25bXSA9PiBbXG5cdFx0XHRcdFx0eyB1cmk6IHRlc3RVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSB9LFxuXHRcdFx0XHRcdHsgdXJpOiB0ZXN0VXJpLCByYW5nZTogbmV3IFJhbmdlKDQsIDIzLCA0LCAzMCkgfSxcblx0XHRcdFx0XHR7IHVyaTogb3RoZXJVcmksIHJhbmdlOiBuZXcgUmFuZ2UoNSwgMSwgNSwgOCkgfSxcblx0XHRcdFx0XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRlZlByb3ZpZGVyOiBEZWZpbml0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRcdHByb3ZpZGVEZWZpbml0aW9uOiAoKSA9PiBbeyB1cmk6IHRlc3RVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSB9XVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGltcGxQcm92aWRlcjogSW1wbGVtZW50YXRpb25Qcm92aWRlciA9IHtcblx0XHRcdFx0cHJvdmlkZUltcGxlbWVudGF0aW9uOiAoKSA9PiBbeyB1cmk6IG90aGVyVXJpLCByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDUsIDgpIH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgcmVmUHJvdmlkZXIpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMuZGVmaW5pdGlvblByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0JywgZGVmUHJvdmlkZXIpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMuaW1wbGVtZW50YXRpb25Qcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIGltcGxQcm92aWRlcikpO1xuXG5cdFx0XHQvLyBNb2RlbCBpcyBvcGVuIGZvciB0ZXN0VXJpIHNvIElNb2RlbFNlcnZpY2UgcmV0dXJucyBpdDsgb3RoZXJVcmkgbmVlZHMgc2VhcmNoXG5cdFx0XHRjb25zdCBzZWFyY2hDYWxsZWQ6IElUZXh0UXVlcnlbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2VhcmNoU2VydmljZSA9IGNyZWF0ZU1vY2tTZWFyY2hTZXJ2aWNlKHF1ZXJ5ID0+IHtcblx0XHRcdFx0c2VhcmNoQ2FsbGVkLnB1c2gocXVlcnkpO1xuXHRcdFx0XHRjb25zdCBmaWxlTWF0Y2ggPSBuZXcgRmlsZU1hdGNoKG90aGVyVXJpKTtcblx0XHRcdFx0ZmlsZU1hdGNoLnJlc3VsdHMgPSBbbmV3IFRleHRTZWFyY2hNYXRjaChcblx0XHRcdFx0XHQnZXhwb3J0IGNsYXNzIE15Q2xhc3MgaW1wbGVtZW50cyBJTXlDbGFzcyB7Jyxcblx0XHRcdFx0XHRuZXcgT25lTGluZVJhbmdlKDQsIDAsIDcpIC8vIDAtYmFzZWQgbGluZSA0ID0gMS1iYXNlZCBsaW5lIDVcblx0XHRcdFx0KV07XG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdHM6IFtmaWxlTWF0Y2hdLCBtZXNzYWdlczogW10gfTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gY3JlYXRlTW9ja01vZGVsU2VydmljZShbbW9kZWxdKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSwgeyBtb2RlbFNlcnZpY2UsIHNlYXJjaFNlcnZpY2UgfSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdNeUNsYXNzJywgdXJpOiB0ZXN0VXJpLnRvU3RyaW5nKCksIGxpbmVDb250ZW50OiAnaW1wb3J0IHsgTXlDbGFzcyB9JyB9KSxcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRleHQgPSBnZXRUZXh0Q29udGVudChyZXN1bHQpO1xuXG5cdFx0XHQvLyBDaGVjayBvdmVyYWxsIHN0cnVjdHVyZVxuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJzMgdXNhZ2VzIG9mIGBNeUNsYXNzYCcpKTtcblxuXHRcdFx0Ly8gQ2hlY2sgdXNhZ2UgdGFnIGZvcm1hdFxuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoYDx1c2FnZSB0eXBlPVwiZGVmaW5pdGlvblwiIHVyaT1cIiR7dGVzdFVyaS50b1N0cmluZygpfVwiIGxpbmU9XCIxXCI+YCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoYDx1c2FnZSB0eXBlPVwicmVmZXJlbmNlXCIgdXJpPVwiJHt0ZXN0VXJpLnRvU3RyaW5nKCl9XCIgbGluZT1cIjRcIj5gKSk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcyhgPHVzYWdlIHR5cGU9XCJpbXBsZW1lbnRhdGlvblwiIHVyaT1cIiR7b3RoZXJVcmkudG9TdHJpbmcoKX1cIiBsaW5lPVwiNVwiPmApKTtcblxuXHRcdFx0Ly8gQ2hlY2sgdGhhdCBwcmV2aWV3cyBmcm9tIG9wZW4gbW9kZWwgYXJlIGluY2x1ZGVkICh0ZXN0VXJpIGxpbmVzKVxuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2ltcG9ydCB7IE15Q2xhc3MgfSBmcm9tIFwiLi9teUNsYXNzXCInKSk7XG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnY29uc3QgaW5zdGFuY2UgPSBuZXcgTXlDbGFzcygpJykpO1xuXG5cdFx0XHQvLyBDaGVjayB0aGF0IHByZXZpZXcgZnJvbSBzZWFyY2ggc2VydmljZSBpcyBpbmNsdWRlZCAob3RoZXJVcmkpXG5cdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnZXhwb3J0IGNsYXNzIE15Q2xhc3MgaW1wbGVtZW50cyBJTXlDbGFzcyB7JykpO1xuXG5cdFx0XHQvLyBDaGVjayBjbG9zaW5nIHRhZ3Ncblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCc8L3VzYWdlPicpKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHNlYXJjaCBzZXJ2aWNlIHdhcyBjYWxsZWQgZm9yIHRoZSBub24tb3BlbiBmaWxlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VhcmNoQ2FsbGVkLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2soc2VhcmNoQ2FsbGVkWzBdLmNvbnRlbnRQYXR0ZXJuLnBhdHRlcm4uaW5jbHVkZXMoJ015Q2xhc3MnKSk7XG5cdFx0XHRhc3NlcnQub2soc2VhcmNoQ2FsbGVkWzBdLmNvbnRlbnRQYXR0ZXJuLmlzV29yZE1hdGNoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgc2VsZi1jbG9zaW5nIHRhZyB3aGVuIG5vIHByZXZpZXcgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXHRcdFx0Y29uc3Qgb3RoZXJVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9vdGhlci50cycpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0Jywge1xuXHRcdFx0XHRwcm92aWRlUmVmZXJlbmNlczogKCk6IExvY2F0aW9uW10gPT4gW1xuXHRcdFx0XHRcdHsgdXJpOiBvdGhlclVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxMCwgNSwgMTAsIDEyKSB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFNlYXJjaCByZXR1cm5zIG5vIHJlc3VsdHMgZm9yIHRoaXMgZmlsZSAoc3ltYm9sIHJlbmFtZWQvYWxpYXNlZClcblx0XHRcdGNvbnN0IHNlYXJjaFNlcnZpY2UgPSBjcmVhdGVNb2NrU2VhcmNoU2VydmljZSgoKSA9PiAoeyByZXN1bHRzOiBbXSwgbWVzc2FnZXM6IFtdIH0pKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSwgeyBzZWFyY2hTZXJ2aWNlIH0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gZ2V0VGV4dENvbnRlbnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKGA8dXNhZ2UgdHlwZT1cInJlZmVyZW5jZVwiIHVyaT1cIiR7b3RoZXJVcmkudG9TdHJpbmcoKX1cIiBsaW5lPVwiMTBcIiAvPmApKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGNhbGwgc2VhcmNoIHNlcnZpY2UgZm9yIGZpbGVzIGFscmVhZHkgb3BlbiBpbiBtb2RlbCBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKHRlc3RDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgdGVzdFVyaSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ0ZlYXR1cmVzLnJlZmVyZW5jZVByb3ZpZGVyLnJlZ2lzdGVyKCd0eXBlc2NyaXB0Jywge1xuXHRcdFx0XHRwcm92aWRlUmVmZXJlbmNlczogKCk6IExvY2F0aW9uW10gPT4gW1xuXHRcdFx0XHRcdHsgdXJpOiB0ZXN0VXJpLCByYW5nZTogbmV3IFJhbmdlKDEsIDEwLCAxLCAxNykgfSxcblx0XHRcdFx0XVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRsZXQgc2VhcmNoQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzZWFyY2hTZXJ2aWNlID0gY3JlYXRlTW9ja1NlYXJjaFNlcnZpY2UoKCkgPT4ge1xuXHRcdFx0XHRzZWFyY2hDYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4geyByZXN1bHRzOiBbXSwgbWVzc2FnZXM6IFtdIH07XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGNyZWF0ZU1vY2tNb2RlbFNlcnZpY2UoW21vZGVsXSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCksIHsgbW9kZWxTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlIH0pKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnMSB1c2FnZXMnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VhcmNoQ2FsbGVkLCBmYWxzZSwgJ3NlYXJjaCBzZXJ2aWNlIHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gYWxsIGZpbGVzIGFyZSBvcGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHdoaXRlc3BhY2Ugbm9ybWFsaXphdGlvbiBpbiBsaW5lQ29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAnZnVuY3Rpb24gICBkb1NvbWV0aGluZyh4OiAgbnVtYmVyKSB7fSc7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoY29udGVudCwgJ3R5cGVzY3JpcHQnLCB1bmRlZmluZWQsIHRlc3RVcmkpKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlZmVyZW5jZXM6ICgpOiBMb2NhdGlvbltdID0+IFtcblx0XHRcdFx0XHR7IHVyaTogdGVzdFVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxMiwgMSwgMjMpIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKGNyZWF0ZU1vY2tUZXh0TW9kZWxTZXJ2aWNlKG1vZGVsKSwgY3JlYXRlTW9ja1dvcmtzcGFjZVNlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5pbnZva2UoXG5cdFx0XHRcdGNyZWF0ZUludm9jYXRpb24oeyBzeW1ib2w6ICdkb1NvbWV0aGluZycsIHVyaTogdGVzdFVyaS50b1N0cmluZygpLCBsaW5lQ29udGVudDogJ2Z1bmN0aW9uIGRvU29tZXRoaW5nKHg6IG51bWJlciknIH0pLFxuXHRcdFx0XHRub29wQ291bnRUb2tlbnMsIG5vb3BQcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGdldFRleHRDb250ZW50KHJlc3VsdCkuaW5jbHVkZXMoJzEgdXNhZ2VzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgZmlsZVBhdGggdmlhIHdvcmtzcGFjZSBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3NyYy9maWxlLnRzJyk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwodGVzdENvbnRlbnQsICd0eXBlc2NyaXB0JywgdW5kZWZpbmVkLCBmaWxlVXJpKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsYW5nRmVhdHVyZXMucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIoJ3R5cGVzY3JpcHQnLCB7XG5cdFx0XHRcdHByb3ZpZGVSZWZlcmVuY2VzOiAoKTogTG9jYXRpb25bXSA9PiBbXG5cdFx0XHRcdFx0eyB1cmk6IGZpbGVVcmksIHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTAsIDEsIDE3KSB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVG9vbChjcmVhdGVNb2NrVGV4dE1vZGVsU2VydmljZShtb2RlbCksIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wuaW52b2tlKFxuXHRcdFx0XHRjcmVhdGVJbnZvY2F0aW9uKHsgc3ltYm9sOiAnTXlDbGFzcycsIGZpbGVQYXRoOiAnc3JjL2ZpbGUudHMnLCBsaW5lQ29udGVudDogJ2ltcG9ydCB7IE15Q2xhc3MgfScgfSksXG5cdFx0XHRcdG5vb3BDb3VudFRva2Vucywgbm9vcFByb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soZ2V0VGV4dENvbnRlbnQocmVzdWx0KS5pbmNsdWRlcygnMSB1c2FnZXMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGZpbGVQYXRoIHRoYXQgZXNjYXBlcyB0aGUgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHNpZGVVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vb3V0c2lkZS50cycpO1xuXHRcdFx0Y29uc3Qgb3V0c2lkZUNvbnRlbnQgPSAnZXhwb3J0IGNvbnN0IE91dHNpZGVTZWNyZXRNYXJrZXIgPSAxOyc7XG5cdFx0XHRjb25zdCBvdXRzaWRlTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKG91dHNpZGVDb250ZW50LCAndHlwZXNjcmlwdCcsIHVuZGVmaW5lZCwgb3V0c2lkZVVyaSkpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdGVkVXJpczogVVJJW10gPSBbXTtcblx0XHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y3JlYXRlTW9kZWxSZWZlcmVuY2U6IGFzeW5jICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdHJlcXVlc3RlZFVyaXMucHVzaCh1cmkpO1xuXHRcdFx0XHRcdHJldHVybiB7IG9iamVjdDogeyB0ZXh0RWRpdG9yTW9kZWw6IG91dHNpZGVNb2RlbCB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRcdFx0Y2FuSGFuZGxlUmVzb3VyY2U6ICgpID0+IGZhbHNlLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElUZXh0TW9kZWxTZXJ2aWNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdGZWF0dXJlcy5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcigndHlwZXNjcmlwdCcsIHtcblx0XHRcdFx0cHJvdmlkZVJlZmVyZW5jZXM6ICgpOiBMb2NhdGlvbltdID0+IFtcblx0XHRcdFx0XHR7IHVyaTogb3V0c2lkZVVyaSwgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxNCwgMSwgMzMpIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUb29sKHRleHRNb2RlbFNlcnZpY2UsIGNyZWF0ZU1vY2tXb3Jrc3BhY2VTZXJ2aWNlKCksIHsgbW9kZWxTZXJ2aWNlOiBjcmVhdGVNb2NrTW9kZWxTZXJ2aWNlKFtvdXRzaWRlTW9kZWxdKSB9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLmludm9rZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgc3ltYm9sOiAnT3V0c2lkZVNlY3JldE1hcmtlcicsIGZpbGVQYXRoOiAnLi4vb3V0c2lkZS50cycsIGxpbmVDb250ZW50OiBvdXRzaWRlQ29udGVudCB9LFxuXHRcdFx0XHRcdGNvbnRleHQ6IHsgd29ya2luZ0RpcmVjdG9yeTogVVJJLnBhcnNlKCdmaWxlOi8vL3Nlc3Npb24tZGlyJykgfSxcblx0XHRcdFx0fSBhcyB1bmtub3duIGFzIElUb29sSW52b2NhdGlvbixcblx0XHRcdFx0bm9vcENvdW50VG9rZW5zLCBub29wUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmVcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHRleHQgPSBnZXRUZXh0Q29udGVudChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ1Byb3ZpZGUgZWl0aGVyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCF0ZXh0LmluY2x1ZGVzKG91dHNpZGVDb250ZW50KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdGVkVXJpcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFHdEIsU0FBUywrQkFBK0I7QUFHeEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxXQUF3RCxjQUFjLHVCQUF1QjtBQUN0RyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGVBQWUsUUFBNkI7QUFDcEQsUUFBTSxPQUFPLE9BQU8sUUFBUSxLQUFLLENBQUMsTUFBZ0MsRUFBRSxTQUFTLE1BQU07QUFDbkYsU0FBTyxNQUFNLFNBQVM7QUFDdkI7QUFFQSxNQUFNLGNBQWMsTUFBTTtBQUV6QixRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsTUFBSTtBQUVKLFFBQU0sVUFBVSxJQUFJLE1BQU0sc0JBQXNCO0FBQ2hELFFBQU0sY0FBYztBQUFBLElBQ25CO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsV0FBUyx1QkFBdUIsUUFBc0M7QUFDckUsV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLE1BQ2YsVUFBVSxDQUFDLFFBQWEsUUFBUSxLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsTUFBTSxJQUFJLFNBQVMsQ0FBQyxLQUFLO0FBQUEsSUFDbkY7QUFBQSxFQUNEO0FBRUEsV0FBUyx3QkFBd0IsWUFBcUU7QUFDckcsV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLE1BQ2Ys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
