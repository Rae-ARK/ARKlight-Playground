import assert from "assert";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { setUnexpectedErrorHandler, errorHandler } from "../../../../base/common/errors.js";
import { URI } from "../../../../base/common/uri.js";
import * as types from "../../common/extHostTypes.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { Position as EditorPosition, Position } from "../../../../editor/common/core/position.js";
import { Range as EditorRange } from "../../../../editor/common/core/range.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { ExtHostLanguageFeatures } from "../../common/extHostLanguageFeatures.js";
import { MainThreadLanguageFeatures } from "../../browser/mainThreadLanguageFeatures.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainThreadCommands } from "../../browser/mainThreadCommands.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import * as languages from "../../../../editor/common/languages.js";
import { getCodeLensModel } from "../../../../editor/contrib/codelens/browser/codelens.js";
import { getDefinitionsAtPosition, getImplementationsAtPosition, getTypeDefinitionsAtPosition, getDeclarationsAtPosition, getReferencesAtPosition } from "../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js";
import { getHoversPromise } from "../../../../editor/contrib/hover/browser/getHover.js";
import { getOccurrencesAtPosition } from "../../../../editor/contrib/wordHighlighter/browser/wordHighlighter.js";
import { getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { getWorkspaceSymbols } from "../../../contrib/search/common/search.js";
import { rename } from "../../../../editor/contrib/rename/browser/rename.js";
import { provideSignatureHelp } from "../../../../editor/contrib/parameterHints/browser/provideSignatureHelp.js";
import { provideSuggestionItems, CompletionOptions } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { getDocumentFormattingEditsUntilResult, getDocumentRangeFormattingEditsUntilResult, getOnTypeFormattingEdits } from "../../../../editor/contrib/format/browser/format.js";
import { getLinks } from "../../../../editor/contrib/links/browser/getLinks.js";
import { MainContext, ExtHostContext } from "../../common/extHost.protocol.js";
import { ExtHostDiagnostics } from "../../common/extHostDiagnostics.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { EndOfLineSequence } from "../../../../editor/common/model.js";
import { getColors } from "../../../../editor/contrib/colorPicker/browser/color.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { nullExtensionDescription as defaultExtension } from "../../../services/extensions/common/extensions.js";
import { provideSelectionRanges } from "../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import { mock } from "../../../../base/test/common/mock.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { NullApiDeprecationService } from "../../common/extHostApiDeprecationService.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { OutlineModel } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
suite("ExtHostLanguageFeatures", function() {
  const defaultSelector = { scheme: "far" };
  let model;
  let extHost;
  let mainThread;
  const disposables = new DisposableStore();
  let rpcProtocol;
  let languageFeaturesService;
  let originalErrorHandler;
  let instantiationService;
  setup(() => {
    model = createTextModel(
      [
        "This is the first line",
        "This is the second line",
        "This is the third line"
      ].join("\n"),
      void 0,
      void 0,
      URI.parse("far://testing/file.a")
    );
    rpcProtocol = new TestRPCProtocol();
    languageFeaturesService = new LanguageFeaturesService();
    let inst;
    {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IMarkerService, MarkerService);
      instantiationService.set(ILanguageFeaturesService, languageFeaturesService);
      instantiationService.set(IUriIdentityService, new class extends mock() {
        asCanonicalUri(uri) {
          return uri;
        }
      }());
      inst = instantiationService;
    }
    originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => {
    });
    const extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        versionId: model.getVersionId(),
        languageId: model.getLanguageId(),
        uri: model.uri,
        lines: model.getValue().split(model.getEOL()),
        EOL: model.getEOL(),
        encoding: "utf8"
      }]
    });
    const extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDocuments, extHostDocuments);
    const commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
    rpcProtocol.set(MainContext.MainThreadCommands, disposables.add(inst.createInstance(MainThreadCommands, rpcProtocol)));
    const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock() {
    }(), extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);
    extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);
    mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, disposables.add(inst.createInstance(MainThreadLanguageFeatures, rpcProtocol)));
  });
  teardown(() => {
    disposables.clear();
    setUnexpectedErrorHandler(originalErrorHandler);
    model.dispose();
    mainThread.dispose();
    instantiationService.dispose();
    return rpcProtocol.sync();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("DocumentSymbols, register/deregister", async () => {
    assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 0);
    const d1 = extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [];
      }
    }());
    await rpcProtocol.sync();
    assert.strictEqual(languageFeaturesService.documentSymbolProvider.all(model).length, 1);
    d1.dispose();
    return rpcProtocol.sync();
  });
  test("DocumentSymbols, evil provider", async () => {
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        throw new Error("evil document symbol provider");
      }
    }()));
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [new types.SymbolInformation("test", types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 1);
  });
  test("DocumentSymbols, data conversion", async () => {
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, new class {
      provideDocumentSymbols() {
        return [new types.SymbolInformation("test", types.SymbolKind.Field, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 1);
    const entry = value[0];
    assert.strictEqual(entry.name, "test");
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Quick Outline uses a not ideal sorting, #138502", async function() {
    const symbols = [
      { name: "containers", range: { startLineNumber: 1, startColumn: 1, endLineNumber: 4, endColumn: 26 } },
      { name: "container 0", range: { startLineNumber: 2, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
      { name: "name", range: { startLineNumber: 2, startColumn: 5, endLineNumber: 2, endColumn: 16 } },
      { name: "ports", range: { startLineNumber: 3, startColumn: 5, endLineNumber: 5, endColumn: 1 } },
      { name: "ports 0", range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } },
      { name: "containerPort", range: { startLineNumber: 4, startColumn: 9, endLineNumber: 4, endColumn: 26 } }
    ];
    disposables.add(extHost.registerDocumentSymbolProvider(defaultExtension, defaultSelector, {
      provideDocumentSymbols: (doc, token) => {
        return symbols.map((s) => {
          return new types.SymbolInformation(
            s.name,
            types.SymbolKind.Object,
            new types.Range(s.range.startLineNumber - 1, s.range.startColumn - 1, s.range.endLineNumber - 1, s.range.endColumn - 1)
          );
        });
      }
    }));
    await rpcProtocol.sync();
    const value = (await OutlineModel.create(languageFeaturesService.documentSymbolProvider, model, CancellationToken.None)).asListOfDocumentSymbols();
    assert.strictEqual(value.length, 6);
    assert.deepStrictEqual(value.map((s) => s.name), ["containers", "container 0", "name", "ports", "ports 0", "containerPort"]);
  });
  test("CodeLens, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          throw new Error("evil");
        }
      }()));
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      value.dispose();
    });
  });
  test("CodeLens, do not resolve a resolved lens", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(
            new types.Range(0, 0, 0, 0),
            { command: "id", title: "Title" }
          )];
        }
        resolveCodeLens() {
          assert.ok(false, "do not resolve");
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      const [data] = value.lenses;
      const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
      assert.strictEqual(symbol.command.id, "id");
      assert.strictEqual(symbol.command.title, "Title");
      value.dispose();
    });
  });
  test("CodeLens, missing command", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeLensProvider(defaultExtension, defaultSelector, new class {
        provideCodeLenses() {
          return [new types.CodeLens(new types.Range(0, 0, 0, 0))];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeLensModel(languageFeaturesService.codeLensProvider, model, CancellationToken.None);
      assert.strictEqual(value.lenses.length, 1);
      const [data] = value.lenses;
      const symbol = await Promise.resolve(data.provider.resolveCodeLens(model, data.symbol, CancellationToken.None));
      assert.strictEqual(symbol, void 0);
      value.dispose();
    });
  });
  test("Definition, data conversion", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Definition, one or many", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 1, 1, 1))];
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(model.uri, new types.Range(2, 1, 1, 1));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
  });
  test("Definition, registration order", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return [new types.Location(URI.parse("far://first"), new types.Range(2, 3, 4, 5))];
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(URI.parse("far://second"), new types.Range(1, 2, 3, 4));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    assert.strictEqual(value[0].uri.authority, "second");
    assert.strictEqual(value[1].uri.authority, "first");
  });
  test("Definition, evil provider", async () => {
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        throw new Error("evil provider");
      }
    }()));
    disposables.add(extHost.registerDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideDefinition() {
        return new types.Location(model.uri, new types.Range(1, 1, 1, 1));
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
  });
  test("Declaration, data conversion", async () => {
    disposables.add(extHost.registerDeclarationProvider(defaultExtension, defaultSelector, new class {
      provideDeclaration() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDeclarationsAtPosition(languageFeaturesService.declarationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Implementation, data conversion", async () => {
    disposables.add(extHost.registerImplementationProvider(defaultExtension, defaultSelector, new class {
      provideImplementation() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getImplementationsAtPosition(languageFeaturesService.implementationProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("Type Definition, data conversion", async () => {
    disposables.add(extHost.registerTypeDefinitionProvider(defaultExtension, defaultSelector, new class {
      provideTypeDefinition() {
        return [new types.Location(model.uri, new types.Range(1, 2, 3, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getTypeDefinitionsAtPosition(languageFeaturesService.typeDefinitionProvider, model, new EditorPosition(1, 1), false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [entry] = value;
    assert.deepStrictEqual(entry.range, { startLineNumber: 2, startColumn: 3, endLineNumber: 4, endColumn: 5 });
    assert.strictEqual(entry.uri.toString(), model.uri.toString());
  });
  test("HoverProvider, word range at pos", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello");
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
    const [entry] = hovers;
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
  });
  test("HoverProvider, given range", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello", new types.Range(3, 0, 8, 7));
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
    const [entry] = hovers;
    assert.deepStrictEqual(entry.range, { startLineNumber: 4, startColumn: 1, endLineNumber: 9, endColumn: 8 });
  });
  test("HoverProvider, registration order", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("registered first");
      }
    }()));
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("registered second");
      }
    }()));
    await rpcProtocol.sync();
    const value = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.contents[0].value, "registered second");
    assert.strictEqual(second.contents[0].value, "registered first");
  });
  test("HoverProvider, evil provider", async () => {
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerHoverProvider(defaultExtension, defaultSelector, new class {
      provideHover() {
        return new types.Hover("Hello");
      }
    }()));
    await rpcProtocol.sync();
    const hovers = await getHoversPromise(languageFeaturesService.hoverProvider, model, new EditorPosition(1, 1), CancellationToken.None);
    assert.strictEqual(hovers.length, 1);
  });
  test("Occurrences, data conversion", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, order 1/2", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return void 0;
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, "*", new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, order 2/2", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 2))];
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, "*", new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
    const [entry] = Array.from(value.values())[0];
    assert.deepStrictEqual(entry.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 3 });
    assert.strictEqual(entry.kind, languages.DocumentHighlightKind.Text);
  });
  test("Occurrences, evil provider", async () => {
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerDocumentHighlightProvider(defaultExtension, defaultSelector, new class {
      provideDocumentHighlights() {
        return [new types.DocumentHighlight(new types.Range(0, 0, 0, 4))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getOccurrencesAtPosition(languageFeaturesService.documentHighlightProvider, model, new EditorPosition(1, 2), CancellationToken.None);
    assert.strictEqual(value.size, 1);
  });
  test("References, registration order", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(URI.parse("far://register/first"), new types.Range(0, 0, 0, 0))];
      }
    }()));
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(URI.parse("far://register/second"), new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.uri.path, "/second");
    assert.strictEqual(second.uri.path, "/first");
  });
  test("References, data conversion", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(model.uri, new types.Position(0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [item] = value;
    assert.deepStrictEqual(item.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    assert.strictEqual(item.uri.toString(), model.uri.toString());
  });
  test("References, evil provider", async () => {
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerReferenceProvider(defaultExtension, defaultSelector, new class {
      provideReferences() {
        return [new types.Location(model.uri, new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getReferencesAtPosition(languageFeaturesService.referenceProvider, model, new EditorPosition(1, 2), false, false, CancellationToken.None);
    assert.strictEqual(value.length, 1);
  });
  test("Quick Fix, command data conversion", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
        provideCodeActions() {
          return [
            { command: "test1", title: "Testing1" },
            { command: "test2", title: "Testing2" }
          ];
        }
      }));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 2);
      const [first, second] = actions;
      assert.strictEqual(first.action.title, "Testing1");
      assert.strictEqual(first.action.command.id, "test1");
      assert.strictEqual(second.action.title, "Testing2");
      assert.strictEqual(second.action.command.id, "test2");
      value.dispose();
    });
  });
  test("Quick Fix, code action data conversion", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, {
        provideCodeActions() {
          return [
            {
              title: "Testing1",
              command: { title: "Testing1Command", command: "test1" },
              kind: types.CodeActionKind.Empty.append("test.scope")
            }
          ];
        }
      }));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      const [first] = actions;
      assert.strictEqual(first.action.title, "Testing1");
      assert.strictEqual(first.action.command.title, "Testing1Command");
      assert.strictEqual(first.action.command.id, "test1");
      assert.strictEqual(first.action.kind, "test.scope");
      value.dispose();
    });
  });
  test("Cannot read property 'id' of undefined, #29469", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          return [
            void 0,
            null,
            { command: "test", title: "Testing" }
          ];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      value.dispose();
    });
  });
  test("Quick Fix, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          throw new Error("evil");
        }
      }()));
      disposables.add(extHost.registerCodeActionProvider(defaultExtension, defaultSelector, new class {
        provideCodeActions() {
          return [{ command: "test", title: "Testing" }];
        }
      }()));
      await rpcProtocol.sync();
      const value = await getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), { type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.QuickFix }, Progress.None, CancellationToken.None);
      const { validActions: actions } = value;
      assert.strictEqual(actions.length, 1);
      value.dispose();
    });
  });
  test("Navigate types, evil provider", async () => {
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        throw new Error("evil");
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("testing", types.SymbolKind.Array, new types.Range(0, 0, 1, 1))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getWorkspaceSymbols("");
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.symbol.name, "testing");
  });
  test("Navigate types, de-duplicate results", async () => {
    const uri = URI.from({ scheme: "foo", path: "/some/path" });
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Array, void 0, new types.Location(uri, void 0))];
      }
      resolveWorkspaceSymbol(a) {
        return a;
      }
    }()));
    disposables.add(extHost.registerWorkspaceSymbolProvider(defaultExtension, new class {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("ONE", types.SymbolKind.Struct, void 0, new types.Location(uri, new types.Range(0, 0, 1, 1)))];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getWorkspaceSymbols("");
    assert.strictEqual(value.length, 3);
  });
  test("Rename, evil provider 0/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        throw new class Foo {
        }();
      }
    }()));
    await rpcProtocol.sync();
    try {
      await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
      throw Error();
    } catch (err) {
    }
  });
  test("Rename, evil provider 1/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        throw Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.rejectReason, "evil");
  });
  test("Rename, evil provider 2/2", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, "*", new class {
      provideRenameEdits() {
        throw Error("evil");
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        const edit = new types.WorkspaceEdit();
        edit.replace(model.uri, new types.Range(0, 0, 0, 0), "testing");
        return edit;
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.edits.length, 1);
  });
  test("Rename, ordering", async () => {
    disposables.add(extHost.registerRenameProvider(defaultExtension, "*", new class {
      provideRenameEdits() {
        const edit = new types.WorkspaceEdit();
        edit.replace(model.uri, new types.Range(0, 0, 0, 0), "testing");
        edit.replace(model.uri, new types.Range(1, 0, 1, 0), "testing");
        return edit;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits() {
        return;
      }
    }()));
    await rpcProtocol.sync();
    const value = await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.strictEqual(value.edits.length, 2);
  });
  test("Multiple RenameProviders don't respect all possible PrepareRename handlers 1/2, #98352", async function() {
    const called = [false, false, false, false];
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[0] = true;
        const range = document.getWordRangeAtPosition(position);
        return range;
      }
      provideRenameEdits() {
        called[1] = true;
        return void 0;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[2] = true;
        return Promise.reject("Cannot rename this symbol2.");
      }
      provideRenameEdits() {
        called[3] = true;
        return void 0;
      }
    }()));
    await rpcProtocol.sync();
    await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.deepStrictEqual(called, [true, true, true, false]);
  });
  test("Multiple RenameProviders don't respect all possible PrepareRename handlers 2/2, #98352", async function() {
    const called = [false, false, false];
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      prepareRename(document, position) {
        called[0] = true;
        const range = document.getWordRangeAtPosition(position);
        return range;
      }
      provideRenameEdits() {
        called[1] = true;
        return void 0;
      }
    }()));
    disposables.add(extHost.registerRenameProvider(defaultExtension, defaultSelector, new class {
      provideRenameEdits(document, position, newName) {
        called[2] = true;
        return new types.WorkspaceEdit();
      }
    }()));
    await rpcProtocol.sync();
    await rename(languageFeaturesService.renameProvider, model, new EditorPosition(1, 1), "newName");
    assert.deepStrictEqual(called, [false, false, true]);
  });
  test("Parameter Hints, order", async () => {
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        return void 0;
      }
    }(), []));
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        return {
          signatures: [],
          activeParameter: 0,
          activeSignature: 0
        };
      }
    }(), []));
    await rpcProtocol.sync();
    const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
    assert.ok(value);
  });
  test("Parameter Hints, evil provider", async () => {
    disposables.add(extHost.registerSignatureHelpProvider(defaultExtension, defaultSelector, new class {
      provideSignatureHelp() {
        throw new Error("evil");
      }
    }(), []));
    await rpcProtocol.sync();
    const value = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, model, new EditorPosition(1, 1), { triggerKind: languages.SignatureHelpTriggerKind.Invoke, isRetrigger: false }, CancellationToken.None);
    assert.strictEqual(value, void 0);
  });
  test("Suggest, order 1/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, "*", new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing1")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing2")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 1);
      assert.strictEqual(value.items[0].completion.insertText, "testing2");
      value.disposable.dispose();
    });
  });
  test("Suggest, order 2/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, "*", new class {
        provideCompletionItems() {
          return [new types.CompletionItem("weak-selector")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 1);
      assert.strictEqual(value.items[0].completion.insertText, "weak-selector");
      value.disposable.dispose();
    });
  });
  test("Suggest, order 3/3", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("strong-1")];
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("strong-2")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items.length, 2);
      assert.strictEqual(value.items[0].completion.insertText, "strong-1");
      assert.strictEqual(value.items[1].completion.insertText, "strong-2");
      value.disposable.dispose();
    });
  });
  test("Suggest, evil provider", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          throw new Error("evil");
        }
      }(), []));
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return [new types.CompletionItem("testing")];
        }
      }(), []));
      await rpcProtocol.sync();
      const value = await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet)));
      assert.strictEqual(value.items[0].container.incomplete, false);
      value.disposable.dispose();
    });
  });
  test("Suggest, CompletionList", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      disposables.add(extHost.registerCompletionItemProvider(defaultExtension, defaultSelector, new class {
        provideCompletionItems() {
          return new types.CompletionList([new types.CompletionItem("hello")], true);
        }
      }(), []));
      await rpcProtocol.sync();
      await provideSuggestionItems(languageFeaturesService.completionProvider, model, new EditorPosition(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(languages.CompletionItemKind.Snippet))).then((model2) => {
        assert.strictEqual(model2.items[0].container.incomplete, true);
        model2.disposable.dispose();
      });
    });
  });
  const NullWorkerService = new class extends mock() {
    computeMoreMinimalEdits(resource, edits) {
      return Promise.resolve(edits ?? void 0);
    }
  }();
  test("Format Doc, data conversion", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing"), types.TextEdit.setEndOfLine(types.EndOfLine.LF)];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
    assert.strictEqual(second.eol, EndOfLineSequence.LF);
    assert.strictEqual(second.text, "");
    assert.deepStrictEqual(second.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Doc, evil provider", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        throw new Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    return getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
  });
  test("Format Doc, order", async () => {
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return void 0;
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing")];
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return void 0;
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Range, data conversion", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "testing")];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "testing");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Format Range, + format_doc", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), "range")];
      }
    }()));
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        return [new types.TextEdit(new types.Range(2, 3, 4, 5), "range2")];
      }
    }()));
    disposables.add(extHost.registerDocumentFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 1, 1), "doc")];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, "range2");
    assert.strictEqual(first.range.startLineNumber, 3);
    assert.strictEqual(first.range.startColumn, 4);
    assert.strictEqual(first.range.endLineNumber, 5);
    assert.strictEqual(first.range.endColumn, 6);
  });
  test("Format Range, evil provider", async () => {
    disposables.add(extHost.registerDocumentRangeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideDocumentRangeFormattingEdits() {
        throw new Error("evil");
      }
    }()));
    await rpcProtocol.sync();
    return getDocumentRangeFormattingEditsUntilResult(NullWorkerService, languageFeaturesService, model, new EditorRange(1, 1, 1, 1), { insertSpaces: true, tabSize: 4 }, CancellationToken.None);
  });
  test("Format on Type, data conversion", async () => {
    disposables.add(extHost.registerOnTypeFormattingEditProvider(defaultExtension, defaultSelector, new class {
      provideOnTypeFormattingEdits() {
        return [new types.TextEdit(new types.Range(0, 0, 0, 0), arguments[2])];
      }
    }(), [";"]));
    await rpcProtocol.sync();
    const value = await getOnTypeFormattingEdits(NullWorkerService, languageFeaturesService, model, new EditorPosition(1, 1), ";", { insertSpaces: true, tabSize: 2 }, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.text, ";");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 });
  });
  test("Links, data conversion", async () => {
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        const link = new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse("foo:bar#3"));
        link.tooltip = "tooltip";
        return [link];
      }
    }()));
    await rpcProtocol.sync();
    const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
    assert.strictEqual(links.length, 1);
    const [first] = links;
    assert.strictEqual(first.url?.toString(), "foo:bar#3");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
    assert.strictEqual(first.tooltip, "tooltip");
  });
  test("Links, evil provider", async () => {
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 1, 1), URI.parse("foo:bar#3"))];
      }
    }()));
    disposables.add(extHost.registerDocumentLinkProvider(defaultExtension, defaultSelector, new class {
      provideDocumentLinks() {
        throw new Error();
      }
    }()));
    await rpcProtocol.sync();
    const { links } = disposables.add(await getLinks(languageFeaturesService.linkProvider, model, CancellationToken.None));
    assert.strictEqual(links.length, 1);
    const [first] = links;
    assert.strictEqual(first.url?.toString(), "foo:bar#3");
    assert.deepStrictEqual(first.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 2 });
  });
  test("Document colors, data conversion", async () => {
    disposables.add(extHost.registerColorProvider(defaultExtension, defaultSelector, new class {
      provideDocumentColors() {
        return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
      }
      provideColorPresentations(color, context) {
        return [];
      }
    }()));
    await rpcProtocol.sync();
    const value = await getColors(languageFeaturesService.colorProvider, model, CancellationToken.None);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.deepStrictEqual(first.colorInfo.color, { red: 0.1, green: 0.2, blue: 0.3, alpha: 0.4 });
    assert.deepStrictEqual(first.colorInfo.range, { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 21 });
  });
  test("Selection Ranges, data conversion", async () => {
    disposables.add(extHost.registerSelectionRangeProvider(defaultExtension, defaultSelector, new class {
      provideSelectionRanges() {
        return [
          new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20)))
        ];
      }
    }()));
    await rpcProtocol.sync();
    provideSelectionRanges(languageFeaturesService.selectionRangeProvider, model, [new Position(1, 17)], { selectLeadingAndTrailingWhitespace: true, selectSubwords: true }, CancellationToken.None).then((ranges) => {
      assert.strictEqual(ranges.length, 1);
      assert.ok(ranges[0].length >= 2);
    });
  });
  test("Selection Ranges, bad data", async () => {
    try {
      const _a = new types.SelectionRange(
        new types.Range(0, 10, 0, 18),
        new types.SelectionRange(new types.Range(0, 11, 0, 18))
      );
      assert.ok(false, String(_a));
    } catch (err) {
      assert.ok(true);
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyLCBlcnJvckhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gYXMgRWRpdG9yUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIGFzIEVkaXRvclJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IE1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRDb21tYW5kcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUxlbnNNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVsZW5zL2Jyb3dzZXIvY29kZWxlbnMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uLCBnZXRJbXBsZW1lbnRhdGlvbnNBdFBvc2l0aW9uLCBnZXRUeXBlRGVmaW5pdGlvbnNBdFBvc2l0aW9uLCBnZXREZWNsYXJhdGlvbnNBdFBvc2l0aW9uLCBnZXRSZWZlcmVuY2VzQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9nb1RvU3ltYm9sLmpzJztcbmltcG9ydCB7IGdldEhvdmVyc1Byb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dldEhvdmVyLmpzJztcbmltcG9ydCB7IGdldE9jY3VycmVuY2VzQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3dvcmRIaWdobGlnaHRlci9icm93c2VyL3dvcmRIaWdobGlnaHRlci5qcyc7XG5pbXBvcnQgeyBnZXRDb2RlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZVN5bWJvbHMgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IHJlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3JlbmFtZS9icm93c2VyL3JlbmFtZS5qcyc7XG5pbXBvcnQgeyBwcm92aWRlU2lnbmF0dXJlSGVscCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BhcmFtZXRlckhpbnRzL2Jyb3dzZXIvcHJvdmlkZVNpZ25hdHVyZUhlbHAuanMnO1xuaW1wb3J0IHsgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcywgQ29tcGxldGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0LCBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQsIGdldE9uVHlwZUZvcm1hdHRpbmdFZGl0cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBnZXRMaW5rcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2xpbmtzL2Jyb3dzZXIvZ2V0TGlua3MuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIEV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERpYWdub3N0aWNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwsIEVuZE9mTGluZVNlcXVlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiBhcyBkZWZhdWx0RXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBwcm92aWRlU2VsZWN0aW9uUmFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc21hcnRTZWxlY3QvYnJvd3Nlci9zbWFydFNlbGVjdC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE51bGxBcGlEZXByZWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBVUklUcmFuc2Zvcm1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVyaVRyYW5zZm9ybWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kb2N1bWVudFN5bWJvbHMvYnJvd3Nlci9vdXRsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcycsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkZWZhdWx0U2VsZWN0b3IgPSB7IHNjaGVtZTogJ2ZhcicgfTtcblx0bGV0IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRsZXQgZXh0SG9zdDogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXM7XG5cdGxldCBtYWluVGhyZWFkOiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcztcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBycGNQcm90b2NvbDogVGVzdFJQQ1Byb3RvY29sO1xuXHRsZXQgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZTtcblx0bGV0IG9yaWdpbmFsRXJyb3JIYW5kbGVyOiAoZTogYW55KSA9PiBhbnk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblxuXHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyB0aGUgZmlyc3QgbGluZScsXG5cdFx0XHRcdCdUaGlzIGlzIHRoZSBzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdUaGlzIGlzIHRoZSB0aGlyZCBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRVUkkucGFyc2UoJ2ZhcjovL3Rlc3RpbmcvZmlsZS5hJykpO1xuXG5cdFx0cnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cblx0XHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpO1xuXG5cdFx0Ly8gVXNlIElJbnN0YW50aWF0aW9uU2VydmljZSB0byBnZXQgdHlwZWNoZWNraW5nIHdoZW4gaW5zdGFudGlhdGluZ1xuXHRcdGxldCBpbnN0OiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0e1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVXJpSWRlbnRpdHlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc0Nhbm9uaWNhbFVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0ID0gaW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0fVxuXG5cdFx0b3JpZ2luYWxFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdGNvbnN0IGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogW3tcblx0XHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRcdHZlcnNpb25JZDogbW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdFx0dXJpOiBtb2RlbC51cmksXG5cdFx0XHRcdGxpbmVzOiBtb2RlbC5nZXRWYWx1ZSgpLnNwbGl0KG1vZGVsLmdldEVPTCgpKSxcblx0XHRcdFx0RU9MOiBtb2RlbC5nZXRFT0woKSxcblx0XHRcdFx0ZW5jb2Rpbmc6ICd1dGY4J1xuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRjb25zdCBleHRIb3N0RG9jdW1lbnRzID0gbmV3IEV4dEhvc3REb2N1bWVudHMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0XHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERvY3VtZW50cywgZXh0SG9zdERvY3VtZW50cyk7XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IG5ldyBFeHRIb3N0Q29tbWFuZHMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29tbWFuZHMsIGNvbW1hbmRzKTtcblx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1hbmRzLCBkaXNwb3NhYmxlcy5hZGQoaW5zdC5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkQ29tbWFuZHMsIHJwY1Byb3RvY29sKSkpO1xuXG5cdFx0Y29uc3QgZGlhZ25vc3RpY3MgPSBuZXcgRXh0SG9zdERpYWdub3N0aWNzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvPigpIHsgfSwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMpO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGlhZ25vc3RpY3MsIGRpYWdub3N0aWNzKTtcblxuXHRcdGV4dEhvc3QgPSBuZXcgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMocnBjUHJvdG9jb2wsIG5ldyBVUklUcmFuc2Zvcm1lclNlcnZpY2UobnVsbCksIGV4dEhvc3REb2N1bWVudHMsIGNvbW1hbmRzLCBkaWFnbm9zdGljcywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxBcGlEZXByZWNhdGlvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLCBleHRIb3N0KTtcblxuXHRcdG1haW5UaHJlYWQgPSBycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMsIGRpc3Bvc2FibGVzLmFkZChpbnN0LmNyZWF0ZUluc3RhbmNlKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLCBycGNQcm90b2NvbCkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdpbmFsRXJyb3JIYW5kbGVyKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdFx0bWFpblRocmVhZC5kaXNwb3NlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tIG91dGxpbmVcblxuXHR0ZXN0KCdEb2N1bWVudFN5bWJvbHMsIHJlZ2lzdGVyL2RlcmVnaXN0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIuYWxsKG1vZGVsKS5sZW5ndGgsIDApO1xuXHRcdGNvbnN0IGQxID0gZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRTeW1ib2xzKCkge1xuXHRcdFx0XHRyZXR1cm4gPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPltdO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLmFsbChtb2RlbCkubGVuZ3RoLCAxKTtcblx0XHRkMS5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdEb2N1bWVudFN5bWJvbHMsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwgZG9jdW1lbnQgc3ltYm9sIHByb3ZpZGVyJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24oJ3Rlc3QnLCB0eXBlcy5TeW1ib2xLaW5kLkZpZWxkLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgT3V0bGluZU1vZGVsLmNyZWF0ZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmFzTGlzdE9mRG9jdW1lbnRTeW1ib2xzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RvY3VtZW50U3ltYm9scywgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24oJ3Rlc3QnLCB0eXBlcy5TeW1ib2xLaW5kLkZpZWxkLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgT3V0bGluZU1vZGVsLmNyZWF0ZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmFzTGlzdE9mRG9jdW1lbnRTeW1ib2xzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZW50cnkgPSB2YWx1ZVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkubmFtZSwgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnUXVpY2sgT3V0bGluZSB1c2VzIGEgbm90IGlkZWFsIHNvcnRpbmcsICMxMzg1MDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc3ltYm9scyA9IFtcblx0XHRcdHsgbmFtZTogJ2NvbnRhaW5lcnMnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDI2IH0gfSxcblx0XHRcdHsgbmFtZTogJ2NvbnRhaW5lciAwJywgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogNSwgZW5kTGluZU51bWJlcjogNSwgZW5kQ29sdW1uOiAxIH0gfSxcblx0XHRcdHsgbmFtZTogJ25hbWUnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiA1LCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDE2IH0gfSxcblx0XHRcdHsgbmFtZTogJ3BvcnRzJywgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogNSwgZW5kTGluZU51bWJlcjogNSwgZW5kQ29sdW1uOiAxIH0gfSxcblx0XHRcdHsgbmFtZTogJ3BvcnRzIDAnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDQsIHN0YXJ0Q29sdW1uOiA5LCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDI2IH0gfSxcblx0XHRcdHsgbmFtZTogJ2NvbnRhaW5lclBvcnQnLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDQsIHN0YXJ0Q29sdW1uOiA5LCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDI2IH0gfVxuXHRcdF07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRTeW1ib2xzOiAoZG9jLCB0b2tlbik6IGFueSA9PiB7XG5cdFx0XHRcdHJldHVybiBzeW1ib2xzLm1hcChzID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKFxuXHRcdFx0XHRcdFx0cy5uYW1lLFxuXHRcdFx0XHRcdFx0dHlwZXMuU3ltYm9sS2luZC5PYmplY3QsXG5cdFx0XHRcdFx0XHRuZXcgdHlwZXMuUmFuZ2Uocy5yYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxLCBzLnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgcy5yYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgcy5yYW5nZS5lbmRDb2x1bW4gLSAxKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IE91dGxpbmVNb2RlbC5jcmVhdGUobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlciwgbW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5hc0xpc3RPZkRvY3VtZW50U3ltYm9scygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZS5tYXAocyA9PiBzLm5hbWUpLCBbJ2NvbnRhaW5lcnMnLCAnY29udGFpbmVyIDAnLCAnbmFtZScsICdwb3J0cycsICdwb3J0cyAwJywgJ2NvbnRhaW5lclBvcnQnXSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBjb2RlIGxlbnNcblxuXHR0ZXN0KCdDb2RlTGVucywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29kZUxlbnNQcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb2RlTGVuc2VzKCk6IGFueSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVMZW5zZXMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29kZUxlbnMobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRDb2RlTGVuc01vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5zZXMubGVuZ3RoLCAxKTtcblx0XHRcdHZhbHVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ29kZUxlbnMsIGRvIG5vdCByZXNvbHZlIGEgcmVzb2x2ZWQgbGVucycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29kZUxlbnNQcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb2RlTGVuc2VzKCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29kZUxlbnMoXG5cdFx0XHRcdFx0XHRuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksXG5cdFx0XHRcdFx0XHR7IGNvbW1hbmQ6ICdpZCcsIHRpdGxlOiAnVGl0bGUnIH0pXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlQ29kZUxlbnMoKTogYW55IHtcblx0XHRcdFx0XHRhc3NlcnQub2soZmFsc2UsICdkbyBub3QgcmVzb2x2ZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0Q29kZUxlbnNNb2RlbChsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuc2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZGF0YV0gPSB2YWx1ZS5sZW5zZXM7XG5cdFx0XHRjb25zdCBzeW1ib2wgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoZGF0YS5wcm92aWRlci5yZXNvbHZlQ29kZUxlbnMhKG1vZGVsLCBkYXRhLnN5bWJvbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5bWJvbCEuY29tbWFuZCEuaWQsICdpZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5bWJvbCEuY29tbWFuZCEudGl0bGUsICdUaXRsZScpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb2RlTGVucywgbWlzc2luZyBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVMZW5zZXMoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29kZUxlbnMobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRDb2RlTGVuc01vZGVsKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVMZW5zUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5zZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtkYXRhXSA9IHZhbHVlLmxlbnNlcztcblx0XHRcdGNvbnN0IHN5bWJvbCA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShkYXRhLnByb3ZpZGVyLnJlc29sdmVDb2RlTGVucyEobW9kZWwsIGRhdGEuc3ltYm9sLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ltYm9sLCB1bmRlZmluZWQpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZGVmaW5pdGlvblxuXG5cdHRlc3QoJ0RlZmluaXRpb24sIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAyLCAzLCA0KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldERlZmluaXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnVyaS50b1N0cmluZygpLCBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlZmluaXRpb24sIG9uZSBvciBtYW55JywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDEsIDEpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDIsIDEsIDEsIDEpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlZmluaXRpb24sIHJlZ2lzdHJhdGlvbiBvcmRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZhcjovL2ZpcnN0JyksIG5ldyB0eXBlcy5SYW5nZSgyLCAzLCA0LCA1KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmFyOi8vc2Vjb25kJyksIG5ldyB0eXBlcy5SYW5nZSgxLCAyLCAzLCA0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDIpO1xuXHRcdC8vIGxldCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0udXJpLmF1dGhvcml0eSwgJ3NlY29uZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVsxXS51cmkuYXV0aG9yaXR5LCAnZmlyc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnRGVmaW5pdGlvbiwgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbigpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwgcHJvdmlkZXInKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRGVmaW5pdGlvblByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldERlZmluaXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0gZGVjbGFyYXRpb25cblxuXHR0ZXN0KCdEZWNsYXJhdGlvbiwgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURlY2xhcmF0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDIsIDMsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0RGVjbGFyYXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWNsYXJhdGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogNCwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS51cmkudG9TdHJpbmcoKSwgbW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHQvLyAtLS0gaW1wbGVtZW50YXRpb25cblxuXHR0ZXN0KCdJbXBsZW1lbnRhdGlvbiwgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkltcGxlbWVudGF0aW9uUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZUltcGxlbWVudGF0aW9uKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkxvY2F0aW9uKG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDIsIDMsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0SW1wbGVtZW50YXRpb25zQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbXBsZW1lbnRhdGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogNCwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS51cmkudG9TdHJpbmcoKSwgbW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHQvLyAtLS0gdHlwZSBkZWZpbml0aW9uXG5cblx0dGVzdCgnVHlwZSBEZWZpbml0aW9uLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuVHlwZURlZmluaXRpb25Qcm92aWRlciB7XG5cdFx0XHRwcm92aWRlVHlwZURlZmluaXRpb24oKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMiwgMywgNCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRUeXBlRGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnR5cGVEZWZpbml0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZW50cnldID0gdmFsdWU7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA0LCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnVyaS50b1N0cmluZygpLCBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBleHRyYSBpbmZvXG5cblx0dGVzdCgnSG92ZXJQcm92aWRlciwgd29yZCByYW5nZSBhdCBwb3MnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckhvdmVyUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuSG92ZXJQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlSG92ZXIoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Ib3ZlcignSGVsbG8nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgaG92ZXJzID0gYXdhaXQgZ2V0SG92ZXJzUHJvbWlzZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IGhvdmVycztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogNSB9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdIb3ZlclByb3ZpZGVyLCBnaXZlbiByYW5nZScsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVySG92ZXJQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Ib3ZlclByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkhvdmVyKCdIZWxsbycsIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCA4LCA3KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IGhvdmVycyA9IGF3YWl0IGdldEhvdmVyc1Byb21pc2UobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaG92ZXJQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVycy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtlbnRyeV0gPSBob3ZlcnM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDQsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiA5LCBlbmRDb2x1bW46IDggfSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnSG92ZXJQcm92aWRlciwgcmVnaXN0cmF0aW9uIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVySG92ZXJQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Ib3ZlclByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVIb3ZlcigpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkhvdmVyKCdyZWdpc3RlcmVkIGZpcnN0Jyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckhvdmVyUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuSG92ZXJQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlSG92ZXIoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Ib3ZlcigncmVnaXN0ZXJlZCBzZWNvbmQnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRIb3ZlcnNQcm9taXNlKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDIpO1xuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb250ZW50c1swXS52YWx1ZSwgJ3JlZ2lzdGVyZWQgc2Vjb25kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5jb250ZW50c1swXS52YWx1ZSwgJ3JlZ2lzdGVyZWQgZmlyc3QnKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdIb3ZlclByb3ZpZGVyLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkhvdmVyUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZUhvdmVyKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckhvdmVyUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuSG92ZXJQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlSG92ZXIoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Ib3ZlcignSGVsbG8nKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgaG92ZXJzID0gYXdhaXQgZ2V0SG92ZXJzUHJvbWlzZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBvY2N1cnJlbmNlc1xuXG5cdHRlc3QoJ09jY3VycmVuY2VzLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCA0KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2l6ZSwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IEFycmF5LmZyb20odmFsdWUudmFsdWVzKCkpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRLaW5kLlRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdPY2N1cnJlbmNlcywgb3JkZXIgMS8yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkRvY3VtZW50SGlnaGxpZ2h0KG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCA0KSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXRPY2N1cnJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2l6ZSwgMSk7XG5cdFx0Y29uc3QgW2VudHJ5XSA9IEFycmF5LmZyb20odmFsdWUudmFsdWVzKCkpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiA1IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRLaW5kLlRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdPY2N1cnJlbmNlcywgb3JkZXIgMi8yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMikpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sICcqJywgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgNCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgZ2V0T2NjdXJyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMiksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNpemUsIDEpO1xuXHRcdGNvbnN0IFtlbnRyeV0gPSBBcnJheS5mcm9tKHZhbHVlLnZhbHVlcygpKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgbGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0S2luZC5UZXh0KTtcblx0fSk7XG5cblx0dGVzdCgnT2NjdXJyZW5jZXMsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDQpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0T2NjdXJyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMiksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSEuc2l6ZSwgMSk7XG5cdH0pO1xuXG5cdC8vIC0tLSByZWZlcmVuY2VzXG5cblx0dGVzdCgnUmVmZXJlbmNlcywgcmVnaXN0cmF0aW9uIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZWZlcmVuY2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZhcjovL3JlZ2lzdGVyL2ZpcnN0JyksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVmZXJlbmNlUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlZmVyZW5jZXMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24oVVJJLnBhcnNlKCdmYXI6Ly9yZWdpc3Rlci9zZWNvbmQnKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0UmVmZXJlbmNlc0F0UG9zaXRpb24obGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMiksIGZhbHNlLCBmYWxzZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnVyaS5wYXRoLCAnL3NlY29uZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudXJpLnBhdGgsICcvZmlyc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnUmVmZXJlbmNlcywgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZWZlcmVuY2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Mb2NhdGlvbihtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldFJlZmVyZW5jZXNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlZmVyZW5jZVByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDIpLCBmYWxzZSwgZmFsc2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtpdGVtXSA9IHZhbHVlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbS5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0udXJpLnRvU3RyaW5nKCksIG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnUmVmZXJlbmNlcywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVmZXJlbmNlUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlZmVyZW5jZXMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVmZXJlbmNlUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlZmVyZW5jZXMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuTG9jYXRpb24obW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRSZWZlcmVuY2VzQXRQb3NpdGlvbihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAyKSwgZmFsc2UsIGZhbHNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tIHF1aWNrIGZpeFxuXG5cdHRlc3QoJ1F1aWNrIEZpeCwgY29tbWFuZCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucygpOiB2c2NvZGUuQ29tbWFuZFtdIHtcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0eyBjb21tYW5kOiAndGVzdDEnLCB0aXRsZTogJ1Rlc3RpbmcxJyB9LFxuXHRcdFx0XHRcdFx0eyBjb21tYW5kOiAndGVzdDInLCB0aXRsZTogJ1Rlc3RpbmcyJyB9XG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHsgdHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlF1aWNrRml4IH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IHZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAyKTtcblx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGFjdGlvbnM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWN0aW9uLnRpdGxlLCAnVGVzdGluZzEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3Rpb24uY29tbWFuZCEuaWQsICd0ZXN0MScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5hY3Rpb24udGl0bGUsICdUZXN0aW5nMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5hY3Rpb24uY29tbWFuZCEuaWQsICd0ZXN0MicpO1xuXHRcdFx0dmFsdWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdRdWljayBGaXgsIGNvZGUgYWN0aW9uIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IHZzY29kZS5Db2RlQWN0aW9uW10ge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnVGVzdGluZzEnLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7IHRpdGxlOiAnVGVzdGluZzFDb21tYW5kJywgY29tbWFuZDogJ3Rlc3QxJyB9LFxuXHRcdFx0XHRcdFx0XHRraW5kOiB0eXBlcy5Db2RlQWN0aW9uS2luZC5FbXB0eS5hcHBlbmQoJ3Rlc3Quc2NvcGUnKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIsIG1vZGVsLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB7IHR5cGU6IGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlLCB0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5EZWZhdWx0IH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IHZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtmaXJzdF0gPSBhY3Rpb25zO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFjdGlvbi50aXRsZSwgJ1Rlc3RpbmcxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWN0aW9uLmNvbW1hbmQhLnRpdGxlLCAnVGVzdGluZzFDb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWN0aW9uLmNvbW1hbmQhLmlkLCAndGVzdDEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hY3Rpb24ua2luZCwgJ3Rlc3Quc2NvcGUnKTtcblx0XHRcdHZhbHVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdDYW5ub3QgcmVhZCBwcm9wZXJ0eSBcXCdpZFxcJyBvZiB1bmRlZmluZWQsICMyOTQ2OScsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bnVsbCxcblx0XHRcdFx0XHRcdHsgY29tbWFuZDogJ3Rlc3QnLCB0aXRsZTogJ1Rlc3RpbmcnIH1cblx0XHRcdFx0XHRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtb2RlbCwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgeyB0eXBlOiBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSwgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuRGVmYXVsdCB9LCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHsgdmFsaWRBY3Rpb25zOiBhY3Rpb25zIH0gPSB2YWx1ZTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHR2YWx1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1F1aWNrIEZpeCwgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoKTogYW55IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29kZUFjdGlvblByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIFt7IGNvbW1hbmQ6ICd0ZXN0JywgdGl0bGU6ICdUZXN0aW5nJyB9XTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHsgdHlwZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5JbnZva2UsIHRyaWdnZXJBY3Rpb246IENvZGVBY3Rpb25UcmlnZ2VyU291cmNlLlF1aWNrRml4IH0sIFByb2dyZXNzLk5vbmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgeyB2YWxpZEFjdGlvbnM6IGFjdGlvbnMgfSA9IHZhbHVlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdHZhbHVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIG5hdmlnYXRlIHR5cGVzXG5cblx0dGVzdCgnTmF2aWdhdGUgdHlwZXMsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V2aWwnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbigndGVzdGluZycsIHR5cGVzLlN5bWJvbEtpbmQuQXJyYXksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldFdvcmtzcGFjZVN5bWJvbHMoJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Quc3ltYm9sLm5hbWUsICd0ZXN0aW5nJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ05hdmlnYXRlIHR5cGVzLCBkZS1kdXBsaWNhdGUgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2ZvbycsIHBhdGg6ICcvc29tZS9wYXRoJyB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignT05FJywgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgdW5kZWZpbmVkLCBuZXcgdHlwZXMuTG9jYXRpb24odXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24oJ09ORScsIHR5cGVzLlN5bWJvbEtpbmQuQXJyYXksIHVuZGVmaW5lZCwgbmV3IHR5cGVzLkxvY2F0aW9uKHVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpKSldOyAvLyBnZXQgZGUtZHVwZWRcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignT05FJywgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgdW5kZWZpbmVkLCBuZXcgdHlwZXMuTG9jYXRpb24odXJpLCB1bmRlZmluZWQhKSldOyAvLyBOTyBkZWR1cGUgYmVjYXVzZSBvZiByZXNvbHZlXG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlV29ya3NwYWNlU3ltYm9sKGE6IHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gYTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Xb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlV29ya3NwYWNlU3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignT05FJywgdHlwZXMuU3ltYm9sS2luZC5TdHJ1Y3QsIHVuZGVmaW5lZCwgbmV3IHR5cGVzLkxvY2F0aW9uKHVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpKSldOyAvLyBOTyBkZWR1cGUgYmVjYXVzZSBvZiBraW5kXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZ2V0V29ya3NwYWNlU3ltYm9scygnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMyk7XG5cdH0pO1xuXG5cdC8vIC0tLSByZW5hbWVcblxuXHR0ZXN0KCdSZW5hbWUsIGV2aWwgcHJvdmlkZXIgMC8yJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IGNsYXNzIEZvbyB7IH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByZW5hbWUobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksICduZXdOYW1lJyk7XG5cdFx0XHR0aHJvdyBFcnJvcigpO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBleHBlY3RlZFxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnUmVuYW1lLCBldmlsIHByb3ZpZGVyIDEvMicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcmVuYW1lKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCAnbmV3TmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5yZWplY3RSZWFzb24sICdldmlsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlbmFtZSwgZXZpbCBwcm92aWRlciAyLzInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sICcqJywgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBFcnJvcignZXZpbCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGVkaXQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdFx0XHRlZGl0LnJlcGxhY2UobW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICd0ZXN0aW5nJyk7XG5cdFx0XHRcdHJldHVybiBlZGl0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHJlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJ25ld05hbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZWRpdHMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnUmVuYW1lLCBvcmRlcmluZycsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuUmVuYW1lUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGVkaXQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdFx0XHRlZGl0LnJlcGxhY2UobW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICd0ZXN0aW5nJyk7XG5cdFx0XHRcdGVkaXQucmVwbGFjZShtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSwgJ3Rlc3RpbmcnKTtcblx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHJlbmFtZShsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZW5hbWVQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgJ25ld05hbWUnKTtcblx0XHQvLyBsZWFzdCByZWxldmFudCByZW5hbWUgcHJvdmlkZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZWRpdHMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgUmVuYW1lUHJvdmlkZXJzIGRvblxcJ3QgcmVzcGVjdCBhbGwgcG9zc2libGUgUHJlcGFyZVJlbmFtZSBoYW5kbGVycyAxLzIsICM5ODM1MicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGNhbGxlZCA9IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByZXBhcmVSZW5hbWUoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5SYW5nZT4ge1xuXHRcdFx0XHRjYWxsZWRbMF0gPSB0cnVlO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0XHRyZXR1cm4gcmFuZ2U7XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cygpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLldvcmtzcGFjZUVkaXQ+IHtcblx0XHRcdFx0Y2FsbGVkWzFdID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByZXBhcmVSZW5hbWUoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5SYW5nZT4ge1xuXHRcdFx0XHRjYWxsZWRbMl0gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoJ0Nhbm5vdCByZW5hbWUgdGhpcyBzeW1ib2wyLicpO1xuXHRcdFx0fVxuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKCk6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuV29ya3NwYWNlRWRpdD4ge1xuXHRcdFx0XHRjYWxsZWRbM10gPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRhd2FpdCByZW5hbWUobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksICduZXdOYW1lJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxlZCwgW3RydWUsIHRydWUsIHRydWUsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIFJlbmFtZVByb3ZpZGVycyBkb25cXCd0IHJlc3BlY3QgYWxsIHBvc3NpYmxlIFByZXBhcmVSZW5hbWUgaGFuZGxlcnMgMi8yLCAjOTgzNTInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBjYWxsZWQgPSBbZmFsc2UsIGZhbHNlLCBmYWxzZV07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblx0XHRcdHByZXBhcmVSZW5hbWUoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5SYW5nZT4ge1xuXHRcdFx0XHRjYWxsZWRbMF0gPSB0cnVlO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGRvY3VtZW50LmdldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0XHRyZXR1cm4gcmFuZ2U7XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVSZW5hbWVFZGl0cygpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLldvcmtzcGFjZUVkaXQ+IHtcblx0XHRcdFx0Y2FsbGVkWzFdID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclJlbmFtZVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblxuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCBuZXdOYW1lOiBzdHJpbmcsKTogdnNjb2RlLlByb3ZpZGVyUmVzdWx0PHZzY29kZS5Xb3Jrc3BhY2VFZGl0PiB7XG5cdFx0XHRcdGNhbGxlZFsyXSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRhd2FpdCByZW5hbWUobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksICduZXdOYW1lJyk7XG5cblx0XHQvLyBmaXJzdCBwcm92aWRlciBoYXMgTk8gcHJlcGFyZSB3aGljaCBtZWFucyBpdCBpcyB0YWtlbiBieSBkZWZhdWx0XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxsZWQsIFtmYWxzZSwgZmFsc2UsIHRydWVdKTtcblx0fSk7XG5cblx0Ly8gLS0tIHBhcmFtZXRlciBoaW50c1xuXG5cdHRlc3QoJ1BhcmFtZXRlciBIaW50cywgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVNpZ25hdHVyZUhlbHAoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVTaWduYXR1cmVIZWxwKCk6IHZzY29kZS5TaWduYXR1cmVIZWxwIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzaWduYXR1cmVzOiBbXSxcblx0XHRcdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IDAsXG5cdFx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlOiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHByb3ZpZGVTaWduYXR1cmVIZWxwKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgeyB0cmlnZ2VyS2luZDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZC5JbnZva2UsIGlzUmV0cmlnZ2VyOiBmYWxzZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQub2sodmFsdWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXJhbWV0ZXIgSGludHMsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVNpZ25hdHVyZUhlbHAoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHByb3ZpZGVTaWduYXR1cmVIZWxwKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgeyB0cmlnZ2VyS2luZDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZC5JbnZva2UsIGlzUmV0cmlnZ2VyOiBmYWxzZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBzdWdnZXN0aW9uc1xuXG5cdHRlc3QoJ1N1Z2dlc3QsIG9yZGVyIDEvMycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgndGVzdGluZzEnKV07XG5cdFx0XHRcdH1cblx0XHRcdH0sIFtdKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCd0ZXN0aW5nMicpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgbmV3IENvbXBsZXRpb25PcHRpb25zKHVuZGVmaW5lZCwgbmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kPigpLmFkZChsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtc1swXS5jb21wbGV0aW9uLmluc2VydFRleHQsICd0ZXN0aW5nMicpO1xuXHRcdFx0dmFsdWUuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1Z2dlc3QsIG9yZGVyIDIvMycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgJyonLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnd2Vhay1zZWxlY3RvcicpXTsgLy8gd2Vha2VyIHNlbGVjdG9yIGJ1dCByZXN1bHRcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBzdHJvbmdlciBzZWxlY3RvciBidXQgbm90IGEgZ29vZCByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sIFtdKSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIG5ldyBTZXQ8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZD4oKS5hZGQobGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuaXRlbXNbMF0uY29tcGxldGlvbi5pbnNlcnRUZXh0LCAnd2Vhay1zZWxlY3RvcicpO1xuXHRcdFx0dmFsdWUuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1Z2dlc3QsIG9yZGVyIDMvMycsIGFzeW5jICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnc3Ryb25nLTEnKV07XG5cdFx0XHRcdH1cblx0XHRcdH0sIFtdKSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdzdHJvbmctMicpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBFZGl0b3JQb3NpdGlvbigxLCAxKSwgbmV3IENvbXBsZXRpb25PcHRpb25zKHVuZGVmaW5lZCwgbmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kPigpLmFkZChsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtc1swXS5jb21wbGV0aW9uLmluc2VydFRleHQsICdzdHJvbmctMScpOyAvLyBzb3J0IGJ5IGxhYmVsXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuaXRlbXNbMV0uY29tcGxldGlvbi5pbnNlcnRUZXh0LCAnc3Ryb25nLTInKTtcblx0XHRcdHZhbHVlLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdTdWdnZXN0LCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBbXSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgndGVzdGluZycpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgW10pKTtcblxuXG5cdFx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnModW5kZWZpbmVkLCBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KCkuYWRkKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5pdGVtc1swXS5jb250YWluZXIuaW5jb21wbGV0ZSwgZmFsc2UpO1xuXHRcdFx0dmFsdWUuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1N1Z2dlc3QsIENvbXBsZXRpb25MaXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHtcblx0XHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuQ29tcGxldGlvbkxpc3QoWzxhbnk+bmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdoZWxsbycpXSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIFtdKSk7XG5cblx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLCBtb2RlbCwgbmV3IEVkaXRvclBvc2l0aW9uKDEsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnModW5kZWZpbmVkLCBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KCkuYWRkKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpKS50aGVuKG1vZGVsID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbnRhaW5lci5pbmNvbXBsZXRlLCB0cnVlKTtcblx0XHRcdFx0bW9kZWwuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGZvcm1hdFxuXG5cdGNvbnN0IE51bGxXb3JrZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMocmVzb3VyY2U6IFVSSSwgZWRpdHM6IGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgbnVsbCB8IHVuZGVmaW5lZCk6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZWRpdHMgPz8gdW5kZWZpbmVkKTtcblx0XHR9XG5cdH07XG5cblx0dGVzdCgnRm9ybWF0IERvYywgZGF0YSBjb252ZXJzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuVGV4dEVkaXQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApLCAndGVzdGluZycpLCB0eXBlcy5UZXh0RWRpdC5zZXRFbmRPZkxpbmUodHlwZXMuRW5kT2ZMaW5lLkxGKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoTnVsbFdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgeyBpbnNlcnRTcGFjZXM6IHRydWUsIHRhYlNpemU6IDQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAyKTtcblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ3Rlc3RpbmcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmVvbCwgRW5kT2ZMaW5lU2VxdWVuY2UuTEYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQudGV4dCwgJycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kLnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IERvYywgZXZpbCBwcm92aWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignZXZpbCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRyZXR1cm4gZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IERvYywgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICd0ZXN0aW5nJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNVbnRpbFJlc3VsdChOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ3Rlc3RpbmcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IFJhbmdlLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICd0ZXN0aW5nJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IChhd2FpdCBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoTnVsbFdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgbmV3IEVkaXRvclJhbmdlKDEsIDEsIDEsIDEpLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dCwgJ3Rlc3RpbmcnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9KTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IFJhbmdlLCArIGZvcm1hdF9kb2MnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksICdyYW5nZScpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UZXh0RWRpdChuZXcgdHlwZXMuUmFuZ2UoMiwgMywgNCwgNSksICdyYW5nZTInKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuVGV4dEVkaXQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpLCAnZG9jJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSAoYXdhaXQgZ2V0RG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0c1VudGlsUmVzdWx0KE51bGxXb3JrZXJTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWwsIG5ldyBFZGl0b3JSYW5nZSgxLCAxLCAxLCAxKSwgeyBpbnNlcnRTcGFjZXM6IHRydWUsIHRhYlNpemU6IDQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHQsICdyYW5nZTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnRDb2x1bW4sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmRMaW5lTnVtYmVyLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UuZW5kQ29sdW1uLCA2KTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IFJhbmdlLCBldmlsIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdldmlsJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdHJldHVybiBnZXREb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzVW50aWxSZXN1bHQoTnVsbFdvcmtlclNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBtb2RlbCwgbmV3IEVkaXRvclJhbmdlKDEsIDEsIDEsIDEpLCB7IGluc2VydFNwYWNlczogdHJ1ZSwgdGFiU2l6ZTogNCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fSk7XG5cblx0dGVzdCgnRm9ybWF0IG9uIFR5cGUsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5PblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuVGV4dEVkaXQobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApLCBhcmd1bWVudHNbMl0pXTtcblx0XHRcdH1cblx0XHR9LCBbJzsnXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHZhbHVlID0gKGF3YWl0IGdldE9uVHlwZUZvcm1hdHRpbmdFZGl0cyhOdWxsV29ya2VyU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsLCBuZXcgRWRpdG9yUG9zaXRpb24oMSwgMSksICc7JywgeyBpbnNlcnRTcGFjZXM6IHRydWUsIHRhYlNpemU6IDIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHQsICc7Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5yYW5nZSwgeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtzLCBkYXRhIGNvbnZlcnNpb24nLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudExpbmtzKCkge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gbmV3IHR5cGVzLkRvY3VtZW50TGluayhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIFVSSS5wYXJzZSgnZm9vOmJhciMzJykpO1xuXHRcdFx0XHRsaW5rLnRvb2x0aXAgPSAndG9vbHRpcCc7XG5cdFx0XHRcdHJldHVybiBbbGlua107XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHsgbGlua3MgfSA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBnZXRMaW5rcyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rUHJvdmlkZXIsIG1vZGVsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IGxpbmtzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC51cmw/LnRvU3RyaW5nKCksICdmb286YmFyIzMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLCB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudG9vbHRpcCwgJ3Rvb2x0aXAnKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua3MsIGV2aWwgcHJvdmlkZXInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKGRlZmF1bHRFeHRlbnNpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50TGlua1Byb3ZpZGVyIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudExpbmtzKCkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudExpbmsobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpLCBVUkkucGFyc2UoJ2ZvbzpiYXIjMycpKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRMaW5rcygpOiBhbnkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgeyBsaW5rcyB9ID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IGdldExpbmtzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtQcm92aWRlciwgbW9kZWwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBbZmlyc3RdID0gbGlua3M7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnVybD8udG9TdHJpbmcoKSwgJ2ZvbzpiYXIjMycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiAyIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEb2N1bWVudCBjb2xvcnMsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0LnJlZ2lzdGVyQ29sb3JQcm92aWRlcihkZWZhdWx0RXh0ZW5zaW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5Eb2N1bWVudENvbG9yUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZURvY3VtZW50Q29sb3JzKCk6IHZzY29kZS5Db2xvckluZm9ybWF0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Db2xvckluZm9ybWF0aW9uKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAyMCksIG5ldyB0eXBlcy5Db2xvcigwLjEsIDAuMiwgMC4zLCAwLjQpKV07XG5cdFx0XHR9XG5cdFx0XHRwcm92aWRlQ29sb3JQcmVzZW50YXRpb25zKGNvbG9yOiB2c2NvZGUuQ29sb3IsIGNvbnRleHQ6IHsgcmFuZ2U6IHZzY29kZS5SYW5nZTsgZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQgfSk6IHZzY29kZS5Db2xvclByZXNlbnRhdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGdldENvbG9ycyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2xvclByb3ZpZGVyLCBtb2RlbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QuY29sb3JJbmZvLmNvbG9yLCB7IHJlZDogMC4xLCBncmVlbjogMC4yLCBibHVlOiAwLjMsIGFscGhhOiAwLjQgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5jb2xvckluZm8ucmFuZ2UsIHsgc3RhcnRMaW5lTnVtYmVyOiAxLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAyMSB9KTtcblx0fSk7XG5cblx0Ly8gLS0gc2VsZWN0aW9uIHJhbmdlc1xuXG5cdHRlc3QoJ1NlbGVjdGlvbiBSYW5nZXMsIGRhdGEgY29udmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdC5yZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXIoZGVmYXVsdEV4dGVuc2lvbiwgZGVmYXVsdFNlbGVjdG9yLCBuZXcgY2xhc3MgaW1wbGVtZW50cyB2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKCkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2UoMCwgMTAsIDAsIDE4KSwgbmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZSgwLCAyLCAwLCAyMCkpKSxcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNlbGVjdGlvblJhbmdlUHJvdmlkZXIsIG1vZGVsLCBbbmV3IFBvc2l0aW9uKDEsIDE3KV0sIHsgc2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZTogdHJ1ZSwgc2VsZWN0U3Vid29yZHM6IHRydWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihyYW5nZXMgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJhbmdlc1swXS5sZW5ndGggPj0gMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdGlvbiBSYW5nZXMsIGJhZCBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IF9hID0gbmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZSgwLCAxMCwgMCwgMTgpLFxuXHRcdFx0XHRuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKDAsIDExLCAwLCAxOCkpXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0Lm9rKGZhbHNlLCBTdHJpbmcoX2EpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5vayh0cnVlKTtcblx0XHR9XG5cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQixvQkFBb0I7QUFDeEQsU0FBUyxXQUFXO0FBQ3BCLFlBQVksV0FBVztBQUN2QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVksZ0JBQWdCLGdCQUFnQjtBQUNyRCxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDO0FBQzNDLFlBQVksZUFBZTtBQUMzQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQiw4QkFBOEIsOEJBQThCLDJCQUEyQiwrQkFBK0I7QUFDekosU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FB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
