import "../../../../editor/contrib/codeAction/browser/codeAction.js";
import "../../../../editor/contrib/codelens/browser/codelens.js";
import "../../../../editor/contrib/colorPicker/browser/colorPickerContribution.js";
import "../../../../editor/contrib/format/browser/format.js";
import "../../../../editor/contrib/gotoSymbol/browser/goToCommands.js";
import "../../../../editor/contrib/documentSymbols/browser/documentSymbols.js";
import "../../../../editor/contrib/hover/browser/getHover.js";
import "../../../../editor/contrib/links/browser/getLinks.js";
import "../../../../editor/contrib/parameterHints/browser/provideSignatureHelp.js";
import "../../../../editor/contrib/smartSelect/browser/smartSelect.js";
import "../../../../editor/contrib/suggest/browser/suggest.js";
import "../../../../editor/contrib/rename/browser/rename.js";
import "../../../../editor/contrib/inlayHints/browser/inlayHintsController.js";
import assert from "assert";
import { setUnexpectedErrorHandler, errorHandler } from "../../../../base/common/errors.js";
import { URI } from "../../../../base/common/uri.js";
import { Event } from "../../../../base/common/event.js";
import * as types from "../../common/extHostTypes.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ExtHostLanguageFeatures } from "../../common/extHostLanguageFeatures.js";
import { MainThreadLanguageFeatures } from "../../browser/mainThreadLanguageFeatures.js";
import { ExtHostApiCommands } from "../../common/extHostApiCommands.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainThreadCommands } from "../../browser/mainThreadCommands.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { MainContext, ExtHostContext } from "../../common/extHost.protocol.js";
import { ExtHostDiagnostics } from "../../common/extHostDiagnostics.js";
import "../../../contrib/search/browser/search.contribution.js";
import { ILogService, NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription, IExtensionService } from "../../../services/extensions/common/extensions.js";
import { dispose, ImmortalReference } from "../../../../base/common/lifecycle.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullApiDeprecationService } from "../../common/extHostApiDeprecationService.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { IOutlineModelService, OutlineModelService } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { assertType } from "../../../../base/common/types.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../base/common/async.js";
function assertRejects(fn, message = "Expected rejection") {
  return fn().then(() => assert.ok(false, message), (_err) => assert.ok(true));
}
function isLocation(value) {
  const candidate = value;
  return candidate && candidate.uri instanceof URI && candidate.range instanceof types.Range;
}
suite("ExtHostLanguageFeatureCommands", function() {
  const defaultSelector = { scheme: "far" };
  let model;
  let insta;
  let rpcProtocol;
  let extHost;
  let mainThread;
  let commands;
  let disposables = [];
  let originalErrorHandler;
  suiteSetup(() => {
    model = createTextModel(
      [
        "This is the first line",
        "This is the second line",
        "This is the third line"
      ].join("\n"),
      void 0,
      void 0,
      URI.parse("far://testing/file.b")
    );
    originalErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => {
    });
    rpcProtocol = new TestRPCProtocol();
    const services = new ServiceCollection();
    services.set(IUriIdentityService, new class extends mock() {
      asCanonicalUri(uri) {
        return uri;
      }
    }());
    services.set(ILanguageFeaturesService, new SyncDescriptor(LanguageFeaturesService));
    services.set(IExtensionService, new class extends mock() {
      async activateByEvent() {
      }
      activationEventIsDone(activationEvent) {
        return true;
      }
    }());
    services.set(ICommandService, new SyncDescriptor(class extends mock() {
      executeCommand(id, ...args) {
        const command = CommandsRegistry.getCommands().get(id);
        if (!command) {
          return Promise.reject(new Error(id + " NOT known"));
        }
        const { handler } = command;
        return Promise.resolve(insta.invokeFunction(handler, ...args));
      }
    }));
    services.set(IEnvironmentService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.isBuilt = true;
        this.isExtensionDevelopment = false;
      }
    }());
    services.set(IMarkerService, new MarkerService());
    services.set(ILogService, new SyncDescriptor(NullLogService));
    services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
    services.set(IModelService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onModelRemoved = Event.None;
      }
      getModel() {
        return model;
      }
    }());
    services.set(ITextModelService, new class extends mock() {
      async createModelReference() {
        return new ImmortalReference(new class extends mock() {
          constructor() {
            super(...arguments);
            this.textEditorModel = model;
          }
        }());
      }
    }());
    services.set(IEditorWorkerService, new class extends mock() {
      async computeMoreMinimalEdits(_uri, edits) {
        return edits || void 0;
      }
    }());
    services.set(ILanguageFeatureDebounceService, new SyncDescriptor(LanguageFeatureDebounceService));
    services.set(IOutlineModelService, new SyncDescriptor(OutlineModelService));
    services.set(IConfigurationService, new TestConfigurationService());
    insta = new TestInstantiationService(services);
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
    commands = new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostCommands, commands);
    rpcProtocol.set(MainContext.MainThreadCommands, insta.createInstance(MainThreadCommands, rpcProtocol));
    ExtHostApiCommands.register(commands);
    const diagnostics = new ExtHostDiagnostics(rpcProtocol, new NullLogService(), new class extends mock() {
    }(), extHostDocumentsAndEditors);
    rpcProtocol.set(ExtHostContext.ExtHostDiagnostics, diagnostics);
    extHost = new ExtHostLanguageFeatures(rpcProtocol, new URITransformerService(null), extHostDocuments, commands, diagnostics, new NullLogService(), NullApiDeprecationService, new class extends mock() {
      onExtensionError() {
        return true;
      }
    }());
    rpcProtocol.set(ExtHostContext.ExtHostLanguageFeatures, extHost);
    mainThread = rpcProtocol.set(MainContext.MainThreadLanguageFeatures, insta.createInstance(MainThreadLanguageFeatures, rpcProtocol));
    insta.get(IOutlineModelService);
    return rpcProtocol.sync();
  });
  suiteTeardown(() => {
    setUnexpectedErrorHandler(originalErrorHandler);
    model.dispose();
    mainThread.dispose();
    insta.get(IOutlineModelService).dispose();
    insta.dispose();
  });
  teardown(() => {
    disposables = dispose(disposables);
    return rpcProtocol.sync();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApiCmd(name, fn) {
    test(name, async function() {
      await runWithFakedTimers({}, async () => {
        await fn();
        await timeout(1e4);
      });
    });
  }
  test("WorkspaceSymbols, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeWorkspaceSymbolProvider", true))
    ];
    return Promise.all(promises);
  });
  test("WorkspaceSymbols, back and forth", function() {
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols(query) {
        return [
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/first")),
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/second"))
        ];
      }
    }));
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols(query) {
        return [
          new types.SymbolInformation(query, types.SymbolKind.Array, new types.Range(0, 0, 1, 1), URI.parse("far://testing/first"))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "testing").then((value) => {
        assert.strictEqual(value.length, 2);
        for (const info of value) {
          assert.strictEqual(info instanceof types.SymbolInformation, true);
          assert.strictEqual(info.name, "testing");
          assert.strictEqual(info.kind, types.SymbolKind.Array);
        }
      });
    });
  });
  test("executeWorkspaceSymbolProvider should accept empty string, #39522", async function() {
    disposables.push(extHost.registerWorkspaceSymbolProvider(nullExtensionDescription, {
      provideWorkspaceSymbols() {
        return [new types.SymbolInformation("hello", types.SymbolKind.Array, new types.Range(0, 0, 0, 0), URI.parse("foo:bar"))];
      }
    }));
    await rpcProtocol.sync();
    let symbols = await commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "");
    assert.strictEqual(symbols.length, 1);
    await rpcProtocol.sync();
    symbols = await commands.executeCommand("vscode.executeWorkspaceSymbolProvider", "*");
    assert.strictEqual(symbols.length, 1);
  });
  test("executeFormatDocumentProvider, back and forth", async function() {
    disposables.push(extHost.registerDocumentFormattingEditProvider(nullExtensionDescription, defaultSelector, new class {
      provideDocumentFormattingEdits() {
        return [types.TextEdit.insert(new types.Position(0, 0), "42")];
      }
    }()));
    await rpcProtocol.sync();
    const edits = await commands.executeCommand("vscode.executeFormatDocumentProvider", model.uri, {
      insertSpaces: false,
      tabSize: 4
    });
    assert.strictEqual(edits.length, 1);
  });
  test("vscode.prepareRename", async function() {
    disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class {
      prepareRename(document, position) {
        return {
          range: new types.Range(0, 12, 0, 24),
          placeholder: "foooPlaceholder"
        };
      }
      provideRenameEdits(document, position, newName) {
        const edit = new types.WorkspaceEdit();
        edit.insert(document.uri, position, newName);
        return edit;
      }
    }()));
    await rpcProtocol.sync();
    const data = await commands.executeCommand("vscode.prepareRename", model.uri, new types.Position(0, 12));
    assert.ok(data);
    assert.strictEqual(data.placeholder, "foooPlaceholder");
    assert.strictEqual(data.range.start.line, 0);
    assert.strictEqual(data.range.start.character, 12);
    assert.strictEqual(data.range.end.line, 0);
    assert.strictEqual(data.range.end.character, 24);
  });
  test("vscode.executeDocumentRenameProvider", async function() {
    disposables.push(extHost.registerRenameProvider(nullExtensionDescription, defaultSelector, new class {
      provideRenameEdits(document, position, newName) {
        const edit2 = new types.WorkspaceEdit();
        edit2.insert(document.uri, position, newName);
        return edit2;
      }
    }()));
    await rpcProtocol.sync();
    const edit = await commands.executeCommand("vscode.executeDocumentRenameProvider", model.uri, new types.Position(0, 12), "newNameOfThis");
    assert.ok(edit);
    assert.strictEqual(edit.has(model.uri), true);
    const textEdits = edit.get(model.uri);
    assert.strictEqual(textEdits.length, 1);
    assert.strictEqual(textEdits[0].newText, "newNameOfThis");
  });
  test("Definition, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeDefinitionProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Definition, back and forth", function() {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Definition, back and forth (sorting & de-deduping)", function() {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(URI.parse("file:///b"), new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return new types.Location(URI.parse("file:///b"), new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(URI.parse("file:///a"), new types.Range(2, 0, 0, 0)),
          new types.Location(URI.parse("file:///c"), new types.Range(3, 0, 0, 0)),
          new types.Location(URI.parse("file:///d"), new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        assert.strictEqual(values[0].uri.path, "/a");
        assert.strictEqual(values[1].uri.path, "/b");
        assert.strictEqual(values[2].uri.path, "/c");
        assert.strictEqual(values[3].uri.path, "/d");
      });
    });
  });
  test("Definition Link", () => {
    disposables.push(extHost.registerDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Declaration, back and forth", function() {
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDeclarationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Declaration Link", () => {
    disposables.push(extHost.registerDeclarationProvider(nullExtensionDescription, defaultSelector, {
      provideDeclaration(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDeclarationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Type Definition, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeTypeDefinitionProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Type Definition, back and forth", function() {
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeTypeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Type Definition Link", () => {
    disposables.push(extHost.registerTypeDefinitionProvider(nullExtensionDescription, defaultSelector, {
      provideTypeDefinition(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeTypeDefinitionProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("Implementation, invalid arguments", function() {
    const promises = [
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider")),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", null)),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", void 0)),
      assertRejects(() => commands.executeCommand("vscode.executeImplementationProvider", true, false))
    ];
    return Promise.all(promises);
  });
  test("Implementation, back and forth", function() {
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return new types.Location(doc.uri, new types.Range(1, 0, 0, 0));
      }
    }));
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return [
          new types.Location(doc.uri, new types.Range(2, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(3, 0, 0, 0)),
          new types.Location(doc.uri, new types.Range(4, 0, 0, 0))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeImplementationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 4);
        for (const v of values) {
          assert.ok(v.uri instanceof URI);
          assert.ok(v.range instanceof types.Range);
        }
      });
    });
  });
  test("Implementation Definition Link", () => {
    disposables.push(extHost.registerImplementationProvider(nullExtensionDescription, defaultSelector, {
      provideImplementation(doc) {
        return [
          new types.Location(doc.uri, new types.Range(0, 0, 0, 0)),
          { targetUri: doc.uri, targetRange: new types.Range(1, 0, 0, 0), targetSelectionRange: new types.Range(1, 1, 1, 1), originSelectionRange: new types.Range(2, 2, 2, 2) }
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeImplementationProvider", model.uri, new types.Position(0, 0)).then((values) => {
        assert.strictEqual(values.length, 2);
        for (const v of values) {
          if (isLocation(v)) {
            assert.ok(v.uri instanceof URI);
            assert.ok(v.range instanceof types.Range);
          } else {
            assert.ok(v.targetUri instanceof URI);
            assert.ok(v.targetRange instanceof types.Range);
            assert.ok(v.targetSelectionRange instanceof types.Range);
            assert.ok(v.originSelectionRange instanceof types.Range);
          }
        }
      });
    });
  });
  test("reference search, back and forth", function() {
    disposables.push(extHost.registerReferenceProvider(nullExtensionDescription, defaultSelector, {
      provideReferences() {
        return [
          new types.Location(URI.parse("some:uri/path"), new types.Range(0, 1, 0, 5))
        ];
      }
    }));
    return commands.executeCommand("vscode.executeReferenceProvider", model.uri, new types.Position(0, 0)).then((values) => {
      assert.strictEqual(values.length, 1);
      const [first] = values;
      assert.strictEqual(first.uri.toString(), "some:uri/path");
      assert.strictEqual(first.range.start.line, 0);
      assert.strictEqual(first.range.start.character, 1);
      assert.strictEqual(first.range.end.line, 0);
      assert.strictEqual(first.range.end.character, 5);
    });
  });
  test('"vscode.executeDocumentHighlights" API has stopped returning DocumentHighlight[]#200056', async function() {
    disposables.push(extHost.registerDocumentHighlightProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentHighlights() {
        return [
          new types.DocumentHighlight(new types.Range(0, 17, 0, 25), types.DocumentHighlightKind.Read)
        ];
      }
    }));
    await rpcProtocol.sync();
    return commands.executeCommand("vscode.executeDocumentHighlights", model.uri, new types.Position(0, 0)).then((values) => {
      assert.ok(Array.isArray(values));
      assert.strictEqual(values.length, 1);
      const [first] = values;
      assert.strictEqual(first.range.start.line, 0);
      assert.strictEqual(first.range.start.character, 17);
      assert.strictEqual(first.range.end.line, 0);
      assert.strictEqual(first.range.end.character, 25);
    });
  });
  test("Outline, back and forth", function() {
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        return [
          new types.SymbolInformation("testing1", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0)),
          new types.SymbolInformation("testing2", types.SymbolKind.Enum, new types.Range(0, 1, 0, 3))
        ];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentSymbolProvider", model.uri).then((values) => {
        assert.strictEqual(values.length, 2);
        const [first, second] = values;
        assert.strictEqual(first instanceof types.SymbolInformation, true);
        assert.strictEqual(second instanceof types.SymbolInformation, true);
        assert.strictEqual(first.name, "testing2");
        assert.strictEqual(second.name, "testing1");
      });
    });
  });
  test("vscode.executeDocumentSymbolProvider command only returns SymbolInformation[] rather than DocumentSymbol[] #57984", function() {
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        return [
          new types.SymbolInformation("SymbolInformation", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0))
        ];
      }
    }));
    disposables.push(extHost.registerDocumentSymbolProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentSymbols() {
        const root = new types.DocumentSymbol("DocumentSymbol", "DocumentSymbol#detail", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0));
        root.children = [new types.DocumentSymbol("DocumentSymbol#child", "DocumentSymbol#detail#child", types.SymbolKind.Enum, new types.Range(1, 0, 1, 0), new types.Range(1, 0, 1, 0))];
        return [root];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentSymbolProvider", model.uri).then((values) => {
        assert.strictEqual(values.length, 2);
        const [first, second] = values;
        assert.strictEqual(first instanceof types.SymbolInformation, true);
        assert.strictEqual(first instanceof types.DocumentSymbol, false);
        assert.strictEqual(second instanceof types.SymbolInformation, true);
        assert.strictEqual(first.name, "DocumentSymbol");
        assert.strictEqual(first.children.length, 1);
        assert.strictEqual(second.name, "SymbolInformation");
      });
    });
  });
  testApiCmd("triggerCharacter is null when completion provider is called programmatically #159914", async function() {
    let actualContext;
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems(_doc, _pos, _tok, context) {
        actualContext = context;
        return [];
      }
    }, []));
    await rpcProtocol.sync();
    await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(actualContext);
    assert.deepStrictEqual(actualContext, { triggerKind: types.CompletionTriggerKind.Invoke, triggerCharacter: void 0 });
  });
  testApiCmd("Suggest, back and forth", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        a.documentation = new types.MarkdownString("hello_md_string");
        const b = new types.CompletionItem("item2");
        b.textEdit = types.TextEdit.replace(new types.Range(0, 4, 0, 8), "foo");
        const c = new types.CompletionItem("item3");
        c.textEdit = types.TextEdit.replace(new types.Range(0, 1, 0, 6), "foobar");
        const d = new types.CompletionItem("item4");
        d.range = new types.Range(0, 1, 0, 4);
        d.insertText = new types.SnippetString("foo$0bar");
        return [a, b, c, d];
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(list instanceof types.CompletionList);
    const values = list.items;
    assert.ok(Array.isArray(values));
    assert.strictEqual(values.length, 4);
    const [first, second, third, fourth] = values;
    assert.strictEqual(first.label, "item1");
    assert.strictEqual(first.textEdit, void 0);
    assert.ok(!types.Range.isRange(first.range));
    assert.strictEqual(first.documentation.value, "hello_md_string");
    assert.strictEqual(second.label, "item2");
    assert.strictEqual(second.textEdit.newText, "foo");
    assert.strictEqual(second.textEdit.range.start.line, 0);
    assert.strictEqual(second.textEdit.range.start.character, 4);
    assert.strictEqual(second.textEdit.range.end.line, 0);
    assert.strictEqual(second.textEdit.range.end.character, 8);
    assert.strictEqual(third.label, "item3");
    assert.strictEqual(third.textEdit.newText, "foobar");
    assert.strictEqual(third.textEdit.range.start.line, 0);
    assert.strictEqual(third.textEdit.range.start.character, 1);
    assert.strictEqual(third.textEdit.range.end.line, 0);
    assert.strictEqual(third.textEdit.range.end.character, 6);
    assert.strictEqual(fourth.label, "item4");
    assert.strictEqual(fourth.textEdit, void 0);
    const range = fourth.range;
    assert.ok(types.Range.isRange(range));
    assert.strictEqual(range.start.line, 0);
    assert.strictEqual(range.start.character, 1);
    assert.strictEqual(range.end.line, 0);
    assert.strictEqual(range.end.character, 4);
    assert.ok(fourth.insertText instanceof types.SnippetString);
    assert.strictEqual(fourth.insertText.value, "foo$0bar");
  });
  testApiCmd("Suggest, return CompletionList !array", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        const b = new types.CompletionItem("item2");
        return new types.CompletionList([a, b], true);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand("vscode.executeCompletionItemProvider", model.uri, new types.Position(0, 4));
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.isIncomplete, true);
  });
  testApiCmd("Suggest, resolve completion items", async function() {
    let resolveCount = 0;
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a = new types.CompletionItem("item1");
        const b = new types.CompletionItem("item2");
        const c = new types.CompletionItem("item3");
        const d = new types.CompletionItem("item4");
        return new types.CompletionList([a, b, c, d], false);
      },
      resolveCompletionItem(item) {
        resolveCount += 1;
        return item;
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0,
      2
      // maxItemsToResolve
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(resolveCount, 2);
  });
  testApiCmd('"vscode.executeCompletionItemProvider" doesnot return a preselect field #53749', async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a2 = new types.CompletionItem("item1");
        a2.preselect = true;
        const b2 = new types.CompletionItem("item2");
        const c2 = new types.CompletionItem("item3");
        c2.preselect = true;
        const d2 = new types.CompletionItem("item4");
        return new types.CompletionList([a2, b2, c2, d2], false);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 4);
    const [a, b, c, d] = list.items;
    assert.strictEqual(a.preselect, true);
    assert.strictEqual(b.preselect, void 0);
    assert.strictEqual(c.preselect, true);
    assert.strictEqual(d.preselect, void 0);
  });
  testApiCmd("executeCompletionItemProvider doesn't capture commitCharacters #58228", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        const a2 = new types.CompletionItem("item1");
        a2.commitCharacters = ["a", "b"];
        const b2 = new types.CompletionItem("item2");
        return new types.CompletionList([a2, b2], false);
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 2);
    const [a, b] = list.items;
    assert.deepStrictEqual(a.commitCharacters, ["a", "b"]);
    assert.strictEqual(b.commitCharacters, void 0);
  });
  testApiCmd("vscode.executeCompletionItemProvider returns the wrong CompletionItemKinds in insiders #95715", async function() {
    disposables.push(extHost.registerCompletionItemProvider(nullExtensionDescription, defaultSelector, {
      provideCompletionItems() {
        return [
          new types.CompletionItem("My Method", types.CompletionItemKind.Method),
          new types.CompletionItem("My Property", types.CompletionItemKind.Property)
        ];
      }
    }, []));
    await rpcProtocol.sync();
    const list = await commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      model.uri,
      new types.Position(0, 4),
      void 0
    );
    assert.ok(list instanceof types.CompletionList);
    assert.strictEqual(list.items.length, 2);
    const [a, b] = list.items;
    assert.strictEqual(a.kind, types.CompletionItemKind.Method);
    assert.strictEqual(b.kind, types.CompletionItemKind.Property);
  });
  test("Parameter Hints, back and forth", async () => {
    disposables.push(extHost.registerSignatureHelpProvider(nullExtensionDescription, defaultSelector, new class {
      provideSignatureHelp(_document, _position, _token, context) {
        return {
          activeSignature: 0,
          activeParameter: 1,
          signatures: [
            {
              label: "abc",
              documentation: `${context.triggerKind === 1 ? "invoked" : "unknown"} ${context.triggerCharacter}`,
              parameters: []
            }
          ]
        };
      }
    }(), []));
    await rpcProtocol.sync();
    const firstValue = await commands.executeCommand("vscode.executeSignatureHelpProvider", model.uri, new types.Position(0, 1), ",");
    assert.strictEqual(firstValue.activeSignature, 0);
    assert.strictEqual(firstValue.activeParameter, 1);
    assert.strictEqual(firstValue.signatures.length, 1);
    assert.strictEqual(firstValue.signatures[0].label, "abc");
    assert.strictEqual(firstValue.signatures[0].documentation, "invoked ,");
  });
  testApiCmd("QuickFix, back and forth", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions() {
        return [{ command: "testing", title: "Title", arguments: [1, 2, true] }];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, new types.Range(0, 0, 1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.title, "Title");
        assert.strictEqual(first.command, "testing");
        assert.deepStrictEqual(first.arguments, [1, 2, true]);
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider results seem to be missing their `command` property #45124", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, range) {
        return [{
          command: {
            arguments: [document, range],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title"
        }];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, new types.Range(0, 0, 1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.ok(first.command);
        assert.strictEqual(first.command.command, "command");
        assert.strictEqual(first.command.title, "command_title");
        assert.strictEqual(first.kind.value, "foo");
        assert.strictEqual(first.title, "title");
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider passes Range to provider although Selection is passed in #77997", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [{
          command: {
            arguments: [document, rangeOrSelection],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title"
        }];
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.ok(first.command);
        assert.ok(first.command.arguments[1] instanceof types.Selection);
        assert.ok(first.command.arguments[1].isEqual(selection));
      });
    });
  });
  testApiCmd("vscode.executeCodeActionProvider results seem to be missing their `isPreferred` property #78098", function() {
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [{
          command: {
            arguments: [document, rangeOrSelection],
            command: "command",
            title: "command_title"
          },
          kind: types.CodeActionKind.Empty.append("foo"),
          title: "title",
          isPreferred: true
        }];
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.isPreferred, true);
      });
    });
  });
  testApiCmd("resolving code action", async function() {
    let didCallResolve = 0;
    class MyAction extends types.CodeAction {
    }
    disposables.push(extHost.registerCodeActionProvider(nullExtensionDescription, defaultSelector, {
      provideCodeActions(document, rangeOrSelection) {
        return [new MyAction("title", types.CodeActionKind.Empty.append("foo"))];
      },
      resolveCodeAction(action) {
        assert.ok(action instanceof MyAction);
        didCallResolve += 1;
        action.title = "resolved title";
        action.edit = new types.WorkspaceEdit();
        return action;
      }
    }));
    const selection = new types.Selection(0, 0, 1, 1);
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeCodeActionProvider", model.uri, selection, void 0, 1e3);
    assert.strictEqual(didCallResolve, 1);
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.title, "title");
    assert.ok(first.edit);
  });
  testApiCmd("CodeLens, back and forth", function() {
    const complexArg = {
      foo() {
      },
      bar() {
      },
      big: extHost
    };
    disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, {
      provideCodeLenses() {
        return [new types.CodeLens(new types.Range(0, 0, 1, 1), { title: "Title", command: "cmd", arguments: [1, true, complexArg] })];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeCodeLensProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.command.title, "Title");
        assert.strictEqual(first.command.command, "cmd");
        assert.strictEqual(first.command.arguments[0], 1);
        assert.strictEqual(first.command.arguments[1], true);
        assert.strictEqual(first.command.arguments[2], complexArg);
      });
    });
  });
  testApiCmd("CodeLens, resolve", async function() {
    let resolveCount = 0;
    disposables.push(extHost.registerCodeLensProvider(nullExtensionDescription, defaultSelector, {
      provideCodeLenses() {
        return [
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1)),
          new types.CodeLens(new types.Range(0, 0, 1, 1), { title: "Already resolved", command: "fff" })
        ];
      },
      resolveCodeLens(codeLens) {
        codeLens.command = { title: resolveCount.toString(), command: "resolved" };
        resolveCount += 1;
        return codeLens;
      }
    }));
    await rpcProtocol.sync();
    let value = await commands.executeCommand("vscode.executeCodeLensProvider", model.uri, 2);
    assert.strictEqual(value.length, 3);
    assert.strictEqual(resolveCount, 2);
    resolveCount = 0;
    value = await commands.executeCommand("vscode.executeCodeLensProvider", model.uri);
    assert.strictEqual(value.length, 4);
    assert.strictEqual(resolveCount, 0);
  });
  testApiCmd("Links, back and forth", function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse("foo:bar"))];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeLinkProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.target + "", "foo:bar");
        assert.strictEqual(first.range.start.line, 0);
        assert.strictEqual(first.range.start.character, 0);
        assert.strictEqual(first.range.end.line, 0);
        assert.strictEqual(first.range.end.character, 20);
      });
    });
  });
  testApiCmd("What's the condition for DocumentLink target to be undefined? #106308", async function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        return [new types.DocumentLink(new types.Range(0, 0, 0, 20), void 0)];
      },
      resolveDocumentLink(link) {
        link.target = URI.parse("foo:bar");
        return link;
      }
    }));
    await rpcProtocol.sync();
    const links1 = await commands.executeCommand("vscode.executeLinkProvider", model.uri);
    assert.strictEqual(links1.length, 1);
    assert.strictEqual(links1[0].target, void 0);
    const links2 = await commands.executeCommand("vscode.executeLinkProvider", model.uri, 1e3);
    assert.strictEqual(links2.length, 1);
    assert.strictEqual(links2[0].target.toString(), URI.parse("foo:bar").toString());
  });
  testApiCmd("DocumentLink[] vscode.executeLinkProvider returns lack tooltip #213970", async function() {
    disposables.push(extHost.registerDocumentLinkProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentLinks() {
        const link = new types.DocumentLink(new types.Range(0, 0, 0, 20), URI.parse("foo:bar"));
        link.tooltip = "Link Tooltip";
        return [link];
      }
    }));
    await rpcProtocol.sync();
    const links1 = await commands.executeCommand("vscode.executeLinkProvider", model.uri);
    assert.strictEqual(links1.length, 1);
    assert.strictEqual(links1[0].tooltip, "Link Tooltip");
  });
  test("Color provider", function() {
    disposables.push(extHost.registerColorProvider(nullExtensionDescription, defaultSelector, {
      provideDocumentColors() {
        return [new types.ColorInformation(new types.Range(0, 0, 0, 20), new types.Color(0.1, 0.2, 0.3, 0.4))];
      },
      provideColorPresentations() {
        const cp = new types.ColorPresentation("#ABC");
        cp.textEdit = types.TextEdit.replace(new types.Range(1, 0, 1, 20), "#ABC");
        cp.additionalTextEdits = [types.TextEdit.insert(new types.Position(2, 20), "*")];
        return [cp];
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeDocumentColorProvider", model.uri).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.color.red, 0.1);
        assert.strictEqual(first.color.green, 0.2);
        assert.strictEqual(first.color.blue, 0.3);
        assert.strictEqual(first.color.alpha, 0.4);
        assert.strictEqual(first.range.start.line, 0);
        assert.strictEqual(first.range.start.character, 0);
        assert.strictEqual(first.range.end.line, 0);
        assert.strictEqual(first.range.end.character, 20);
      });
    }).then(() => {
      const color = new types.Color(0.5, 0.6, 0.7, 0.8);
      const range = new types.Range(0, 0, 0, 20);
      return commands.executeCommand("vscode.executeColorPresentationProvider", color, { uri: model.uri, range }).then((value) => {
        assert.strictEqual(value.length, 1);
        const [first] = value;
        assert.strictEqual(first.label, "#ABC");
        assert.strictEqual(first.textEdit.newText, "#ABC");
        assert.strictEqual(first.textEdit.range.start.line, 1);
        assert.strictEqual(first.textEdit.range.start.character, 0);
        assert.strictEqual(first.textEdit.range.end.line, 1);
        assert.strictEqual(first.textEdit.range.end.character, 20);
        assert.strictEqual(first.additionalTextEdits.length, 1);
        assert.strictEqual(first.additionalTextEdits[0].range.start.line, 2);
        assert.strictEqual(first.additionalTextEdits[0].range.start.character, 20);
        assert.strictEqual(first.additionalTextEdits[0].range.end.line, 2);
        assert.strictEqual(first.additionalTextEdits[0].range.end.character, 20);
      });
    });
  });
  test('"TypeError: e.onCancellationRequested is not a function" calling hover provider in Insiders #54174', function() {
    disposables.push(extHost.registerHoverProvider(nullExtensionDescription, defaultSelector, {
      provideHover() {
        return new types.Hover("fofofofo");
      }
    }));
    return rpcProtocol.sync().then(() => {
      return commands.executeCommand("vscode.executeHoverProvider", model.uri, new types.Position(1, 1)).then((value) => {
        assert.strictEqual(value.length, 1);
        assert.strictEqual(value[0].contents.length, 1);
      });
    });
  });
  testApiCmd("Inlay Hints, back and forth", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        return [new types.InlayHint(new types.Position(0, 1), "Foo")];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
  });
  testApiCmd("Inline Hints, merge", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        const part = new types.InlayHintLabelPart("Bar");
        part.tooltip = "part_tooltip";
        part.command = { command: "cmd", title: "part" };
        const hint = new types.InlayHint(new types.Position(10, 11), [part]);
        hint.tooltip = "hint_tooltip";
        hint.paddingLeft = true;
        hint.paddingRight = false;
        return [hint];
      }
    }));
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        const hint = new types.InlayHint(new types.Position(0, 1), "Foo", types.InlayHintKind.Parameter);
        hint.textEdits = [types.TextEdit.insert(new types.Position(0, 0), "Hello")];
        return [hint];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 2);
    const [first, second] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
    assert.strictEqual(first.textEdits?.length, 1);
    assert.strictEqual(first.textEdits[0].newText, "Hello");
    assert.strictEqual(second.position.line, 10);
    assert.strictEqual(second.position.character, 11);
    assert.strictEqual(second.paddingLeft, true);
    assert.strictEqual(second.paddingRight, false);
    assert.strictEqual(second.tooltip, "hint_tooltip");
    const label = second.label[0];
    assertType(label instanceof types.InlayHintLabelPart);
    assert.strictEqual(label.value, "Bar");
    assert.strictEqual(label.tooltip, "part_tooltip");
    assert.strictEqual(label.command?.command, "cmd");
    assert.strictEqual(label.command?.title, "part");
  });
  testApiCmd("Inline Hints, bad provider", async function() {
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        return [new types.InlayHint(new types.Position(0, 1), "Foo")];
      }
    }));
    disposables.push(extHost.registerInlayHintsProvider(nullExtensionDescription, defaultSelector, {
      provideInlayHints() {
        throw new Error();
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeInlayHintProvider", model.uri, new types.Range(0, 0, 20, 20));
    assert.strictEqual(value.length, 1);
    const [first] = value;
    assert.strictEqual(first.label, "Foo");
    assert.strictEqual(first.position.line, 0);
    assert.strictEqual(first.position.character, 1);
  });
  test("Selection Range, back and forth", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges() {
        return [
          new types.SelectionRange(new types.Range(0, 10, 0, 18), new types.SelectionRange(new types.Range(0, 2, 0, 20)))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeSelectionRangeProvider", model.uri, [new types.Position(0, 10)]);
    assert.strictEqual(value.length, 1);
    assert.ok(value[0].parent);
  });
  test("CallHierarchy, back and forth", async function() {
    disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareCallHierarchy(document, position) {
        return new types.CallHierarchyItem(types.SymbolKind.Constant, "ROOT", "ROOT", document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0));
      }
      provideCallHierarchyIncomingCalls(item, token) {
        return [new types.CallHierarchyIncomingCall(
          new types.CallHierarchyItem(types.SymbolKind.Constant, "INCOMING", "INCOMING", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
          [new types.Range(0, 0, 0, 0)]
        )];
      }
      provideCallHierarchyOutgoingCalls(item, token) {
        return [new types.CallHierarchyOutgoingCall(
          new types.CallHierarchyItem(types.SymbolKind.Constant, "OUTGOING", "OUTGOING", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0)),
          [new types.Range(0, 0, 0, 0)]
        )];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareCallHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 1);
    assert.strictEqual(root[0].name, "ROOT");
    const incoming = await commands.executeCommand("vscode.provideIncomingCalls", root[0]);
    assert.strictEqual(incoming.length, 1);
    assert.strictEqual(incoming[0].from.name, "INCOMING");
    const outgoing = await commands.executeCommand("vscode.provideOutgoingCalls", root[0]);
    assert.strictEqual(outgoing.length, 1);
    assert.strictEqual(outgoing[0].to.name, "OUTGOING");
  });
  test("prepareCallHierarchy throws TypeError if clangd returns empty result #137415", async function() {
    disposables.push(extHost.registerCallHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareCallHierarchy(document, position) {
        return [];
      }
      provideCallHierarchyIncomingCalls(item, token) {
        return [];
      }
      provideCallHierarchyOutgoingCalls(item, token) {
        return [];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareCallHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 0);
  });
  test("TypeHierarchy, back and forth", async function() {
    disposables.push(extHost.registerTypeHierarchyProvider(nullExtensionDescription, defaultSelector, new class {
      prepareTypeHierarchy(document, position, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "ROOT", "ROOT", document.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
      provideTypeHierarchySupertypes(item, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "SUPER", "SUPER", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
      provideTypeHierarchySubtypes(item, token) {
        return [new types.TypeHierarchyItem(types.SymbolKind.Constant, "SUB", "SUB", item.uri, new types.Range(0, 0, 0, 0), new types.Range(0, 0, 0, 0))];
      }
    }()));
    await rpcProtocol.sync();
    const root = await commands.executeCommand("vscode.prepareTypeHierarchy", model.uri, new types.Position(0, 0));
    assert.ok(Array.isArray(root));
    assert.strictEqual(root.length, 1);
    assert.strictEqual(root[0].name, "ROOT");
    const incoming = await commands.executeCommand("vscode.provideSupertypes", root[0]);
    assert.strictEqual(incoming.length, 1);
    assert.strictEqual(incoming[0].name, "SUPER");
    const outgoing = await commands.executeCommand("vscode.provideSubtypes", root[0]);
    assert.strictEqual(outgoing.length, 1);
    assert.strictEqual(outgoing[0].name, "SUB");
  });
  test("selectionRangeProvider on inner array always returns outer array #91852", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges(_doc, positions) {
        const [first] = positions;
        return [
          new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand("vscode.executeSelectionRangeProvider", model.uri, [new types.Position(0, 10)]);
    assert.strictEqual(value.length, 1);
    assert.strictEqual(value[0].range.start.line, 0);
    assert.strictEqual(value[0].range.start.character, 10);
    assert.strictEqual(value[0].range.end.line, 0);
    assert.strictEqual(value[0].range.end.character, 10);
  });
  test("more element test of selectionRangeProvider on inner array always returns outer array #91852", async function() {
    disposables.push(extHost.registerSelectionRangeProvider(nullExtensionDescription, defaultSelector, {
      provideSelectionRanges(_doc, positions) {
        const [first, second] = positions;
        return [
          new types.SelectionRange(new types.Range(first.line, first.character, first.line, first.character)),
          new types.SelectionRange(new types.Range(second.line, second.character, second.line, second.character))
        ];
      }
    }));
    await rpcProtocol.sync();
    const value = await commands.executeCommand(
      "vscode.executeSelectionRangeProvider",
      model.uri,
      [new types.Position(0, 0), new types.Position(0, 10)]
    );
    assert.strictEqual(value.length, 2);
    assert.strictEqual(value[0].range.start.line, 0);
    assert.strictEqual(value[0].range.start.character, 0);
    assert.strictEqual(value[0].range.end.line, 0);
    assert.strictEqual(value[0].range.end.character, 0);
    assert.strictEqual(value[1].range.start.line, 0);
    assert.strictEqual(value[1].range.start.character, 10);
    assert.strictEqual(value[1].range.end.line, 0);
    assert.strictEqual(value[1].range.end.character, 10);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RBcGlDb21tYW5kcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVsZW5zL2Jyb3dzZXIvY29kZWxlbnMuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yUGlja2VyQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL2dvVG9Db21tYW5kcy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL2RvY3VtZW50U3ltYm9scy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvZ2V0SG92ZXIuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5rcy9icm93c2VyL2dldExpbmtzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGFyYW1ldGVySGludHMvYnJvd3Nlci9wcm92aWRlU2lnbmF0dXJlSGVscC5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NtYXJ0U2VsZWN0L2Jyb3dzZXIvc21hcnRTZWxlY3QuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3JlbmFtZS9icm93c2VyL3JlbmFtZS5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzQ29udHJvbGxlci5qcyc7XG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIsIGVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSwgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdEFwaUNvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RBcGlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRDb21tYW5kcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCwgRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RGlhZ25vc3RpY3MgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERpYWdub3N0aWNzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgJy4uLy4uLy4uL2NvbnRyaWIvc2VhcmNoL2Jyb3dzZXIvc2VhcmNoLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlLCBJbW1vcnRhbFJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgTnVsbEFwaURlcHJlY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RmlsZVN5c3RlbUluZm8uanMnO1xuaW1wb3J0IHsgVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RVcmlUcmFuc2Zvcm1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVNb2RlbFNlcnZpY2UsIE91dGxpbmVNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kb2N1bWVudFN5bWJvbHMvYnJvd3Nlci9vdXRsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcblxuZnVuY3Rpb24gYXNzZXJ0UmVqZWN0cyhmbjogKCkgPT4gUHJvbWlzZTxhbnk+LCBtZXNzYWdlOiBzdHJpbmcgPSAnRXhwZWN0ZWQgcmVqZWN0aW9uJykge1xuXHRyZXR1cm4gZm4oKS50aGVuKCgpID0+IGFzc2VydC5vayhmYWxzZSwgbWVzc2FnZSksIF9lcnIgPT4gYXNzZXJ0Lm9rKHRydWUpKTtcbn1cblxuZnVuY3Rpb24gaXNMb2NhdGlvbih2YWx1ZTogdnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluayk6IHZhbHVlIGlzIHZzY29kZS5Mb2NhdGlvbiB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIHZzY29kZS5Mb2NhdGlvbjtcblx0cmV0dXJuIGNhbmRpZGF0ZSAmJiBjYW5kaWRhdGUudXJpIGluc3RhbmNlb2YgVVJJICYmIGNhbmRpZGF0ZS5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlO1xufVxuXG5zdWl0ZSgnRXh0SG9zdExhbmd1YWdlRmVhdHVyZUNvbW1hbmRzJywgZnVuY3Rpb24gKCkge1xuXHRjb25zdCBkZWZhdWx0U2VsZWN0b3IgPSB7IHNjaGVtZTogJ2ZhcicgfTtcblx0bGV0IG1vZGVsOiBJVGV4dE1vZGVsO1xuXG5cdGxldCBpbnN0YTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgcnBjUHJvdG9jb2w6IFRlc3RSUENQcm90b2NvbDtcblx0bGV0IGV4dEhvc3Q6IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzO1xuXHRsZXQgbWFpblRocmVhZDogTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXM7XG5cdGxldCBjb21tYW5kczogRXh0SG9zdENvbW1hbmRzO1xuXHRsZXQgZGlzcG9zYWJsZXM6IHZzY29kZS5EaXNwb3NhYmxlW10gPSBbXTtcblxuXHRsZXQgb3JpZ2luYWxFcnJvckhhbmRsZXI6IChlOiBhbnkpID0+IGFueTtcblxuXHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgdGhlIGZpcnN0IGxpbmUnLFxuXHRcdFx0XHQnVGhpcyBpcyB0aGUgc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnVGhpcyBpcyB0aGUgdGhpcmQgbGluZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0VVJJLnBhcnNlKCdmYXI6Ly90ZXN0aW5nL2ZpbGUuYicpKTtcblx0XHRvcmlnaW5hbEVycm9ySGFuZGxlciA9IGVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0Ly8gVXNlIElJbnN0YW50aWF0aW9uU2VydmljZSB0byBnZXQgdHlwZWNoZWNraW5nIHdoZW4gaW5zdGFudGlhdGluZ1xuXHRcdHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElVcmlJZGVudGl0eVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc0Nhbm9uaWNhbFVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cdFx0XHRcdHJldHVybiB1cmk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElFeHRlbnNpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRlbnNpb25TZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIGFjdGl2YXRlQnlFdmVudCgpIHtcblxuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYWN0aXZhdGlvbkV2ZW50SXNEb25lKGFjdGl2YXRpb25FdmVudDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJQ29tbWFuZFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihjbGFzcyBleHRlbmRzIG1vY2s8SUNvbW1hbmRTZXJ2aWNlPigpIHtcblxuXHRcdFx0b3ZlcnJpZGUgZXhlY3V0ZUNvbW1hbmQoaWQ6IHN0cmluZywgLi4uYXJnczogYW55KTogYW55IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZHMoKS5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGlkICsgJyBOT1Qga25vd24nKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBoYW5kbGVyIH0gPSBjb21tYW5kO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGluc3RhLmludm9rZUZ1bmN0aW9uKGhhbmRsZXIsIC4uLmFyZ3MpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0c2VydmljZXMuc2V0KElFbnZpcm9ubWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVudmlyb25tZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRcdG92ZXJyaWRlIGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSU1hcmtlclNlcnZpY2UsIG5ldyBNYXJrZXJTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE51bGxMb2dTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSU1vZGVsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldE1vZGVsKCkgeyByZXR1cm4gbW9kZWw7IH1cblx0XHRcdG92ZXJyaWRlIG9uTW9kZWxSZW1vdmVkID0gRXZlbnQuTm9uZTtcblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSVRleHRNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTW9kZWxSZWZlcmVuY2UoKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgSW1tb3J0YWxSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPihuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgdGV4dEVkaXRvck1vZGVsID0gbW9kZWw7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdG9yV29ya2VyU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yV29ya2VyU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhfdXJpOiBhbnksIGVkaXRzOiBhbnkpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRzIHx8IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRzZXJ2aWNlcy5zZXQoSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJT3V0bGluZU1vZGVsU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKE91dGxpbmVNb2RlbFNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0aW5zdGEgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKTtcblxuXHRcdGNvbnN0IGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogW3tcblx0XHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRcdHZlcnNpb25JZDogbW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IG1vZGVsLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdFx0dXJpOiBtb2RlbC51cmksXG5cdFx0XHRcdGxpbmVzOiBtb2RlbC5nZXRWYWx1ZSgpLnNwbGl0KG1vZGVsLmdldEVPTCgpKSxcblx0XHRcdFx0RU9MOiBtb2RlbC5nZXRFT0woKSxcblx0XHRcdFx0ZW5jb2Rpbmc6ICd1dGY4J1xuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRjb25zdCBleHRIb3N0RG9jdW1lbnRzID0gbmV3IEV4dEhvc3REb2N1bWVudHMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0XHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERvY3VtZW50cywgZXh0SG9zdERvY3VtZW50cyk7XG5cblx0XHRjb21tYW5kcyA9IG5ldyBFeHRIb3N0Q29tbWFuZHMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q29tbWFuZHMsIGNvbW1hbmRzKTtcblx0XHRycGNQcm90b2NvbC5zZXQoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1hbmRzLCBpbnN0YS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkQ29tbWFuZHMsIHJwY1Byb3RvY29sKSk7XG5cdFx0RXh0SG9zdEFwaUNvbW1hbmRzLnJlZ2lzdGVyKGNvbW1hbmRzKTtcblxuXHRcdGNvbnN0IGRpYWdub3N0aWNzID0gbmV3IEV4dEhvc3REaWFnbm9zdGljcyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RGaWxlU3lzdGVtSW5mbz4oKSB7IH0sIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0XHRycGNQcm90b2NvbC5zZXQoRXh0SG9zdENvbnRleHQuRXh0SG9zdERpYWdub3N0aWNzLCBkaWFnbm9zdGljcyk7XG5cblx0XHRleHRIb3N0ID0gbmV3IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzKHJwY1Byb3RvY29sLCBuZXcgVVJJVHJhbnNmb3JtZXJTZXJ2aWNlKG51bGwpLCBleHRIb3N0RG9jdW1lbnRzLCBjb21tYW5kcywgZGlhZ25vc3RpY3MsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsQXBpRGVwcmVjYXRpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJwY1Byb3RvY29sLnNldChFeHRIb3N0Q29udGV4dC5FeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcywgZXh0SG9zdCk7XG5cblx0XHRtYWluVGhyZWFkID0gcnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLCBpbnN0YS5jcmVhdGVJbnN0YW5jZShNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcywgcnBjUHJvdG9jb2wpKTtcblxuXHRcdC8vIGZvcmNlZnVsbHkgY3JlYXRlIHRoZSBvdXRsaW5lIHNlcnZpY2Ugc28gdGhhdCBgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlYCBkb2Vzbid0IGJhcmtcblx0XHRpbnN0YS5nZXQoSU91dGxpbmVNb2RlbFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKTtcblx0fSk7XG5cblx0c3VpdGVUZWFyZG93bigoKSA9PiB7XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnaW5hbEVycm9ySGFuZGxlcik7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG1haW5UaHJlYWQuZGlzcG9zZSgpO1xuXG5cdFx0KDxPdXRsaW5lTW9kZWxTZXJ2aWNlPmluc3RhLmdldChJT3V0bGluZU1vZGVsU2VydmljZSkpLmRpc3Bvc2UoKTtcblx0XHRpbnN0YS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLSB3b3Jrc3BhY2Ugc3ltYm9sc1xuXG5cdGZ1bmN0aW9uIHRlc3RBcGlDbWQobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gUHJvbWlzZTxhbnk+KSB7XG5cdFx0dGVzdChuYW1lLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgZm4oKTtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDAwMCk7IFx0Ly8gQVBJIGNvbW1hbmRzIGZvciB0aGluZ3MgdGhhdCBhbGxvdyBjb21tYW5kcyBkaXNwb3NlIHRoZWlyIHJlc3VsdCBkZWxheS4gVGhpcyBpcyB0byBiZSBuaWNlXG5cdFx0XHRcdC8vIGJlY2F1c2Ugb3RoZXJ3aXNlIHByb3BlcnRpZXMgbGlrZSBjb21tYW5kIGFyZSBkaXNwb3NlZCB0b28gZWFybHlcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdH1cblxuXHR0ZXN0KCdXb3Jrc3BhY2VTeW1ib2xzLCBpbnZhbGlkIGFyZ3VtZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm9taXNlcyA9IFtcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXInKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyJywgbnVsbCkpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsIHVuZGVmaW5lZCkpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsIHRydWUpKVxuXHRcdF07XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fSk7XG5cblx0dGVzdCgnV29ya3NwYWNlU3ltYm9scywgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIDx2c2NvZGUuV29ya3NwYWNlU3ltYm9sUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMocXVlcnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbihxdWVyeSwgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpLCBVUkkucGFyc2UoJ2ZhcjovL3Rlc3RpbmcvZmlyc3QnKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKHF1ZXJ5LCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIFVSSS5wYXJzZSgnZmFyOi8vdGVzdGluZy9zZWNvbmQnKSlcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIDx2c2NvZGUuV29ya3NwYWNlU3ltYm9sUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMocXVlcnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbihxdWVyeSwgdHlwZXMuU3ltYm9sS2luZC5BcnJheSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpLCBVUkkucGFyc2UoJ2ZhcjovL3Rlc3RpbmcvZmlyc3QnKSlcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPigndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsICd0ZXN0aW5nJykudGhlbih2YWx1ZSA9PiB7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMik7IC8vIGRlLWR1cGVkXG5cdFx0XHRcdGZvciAoY29uc3QgaW5mbyBvZiB2YWx1ZSkge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvIGluc3RhbmNlb2YgdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24sIHRydWUpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvLm5hbWUsICd0ZXN0aW5nJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluZm8ua2luZCwgdHlwZXMuU3ltYm9sS2luZC5BcnJheSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIgc2hvdWxkIGFjY2VwdCBlbXB0eSBzdHJpbmcsICMzOTUyMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwge1xuXHRcdFx0cHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMoKTogdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignaGVsbG8nLCB0eXBlcy5TeW1ib2xLaW5kLkFycmF5LCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIFVSSS5wYXJzZSgnZm9vOmJhcicpKSBhcyB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb25dO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRsZXQgc3ltYm9scyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPigndnNjb2RlLmV4ZWN1dGVXb3Jrc3BhY2VTeW1ib2xQcm92aWRlcicsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ltYm9scy5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdHN5bWJvbHMgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlV29ya3NwYWNlU3ltYm9sUHJvdmlkZXInLCAnKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeW1ib2xzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBmb3JtYXR0aW5nXG5cdHRlc3QoJ2V4ZWN1dGVGb3JtYXREb2N1bWVudFByb3ZpZGVyLCBiYWNrIGFuZCBmb3J0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoKSB7XG5cdFx0XHRcdHJldHVybiBbdHlwZXMuVGV4dEVkaXQuaW5zZXJ0KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgJzQyJyldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPigndnNjb2RlLmV4ZWN1dGVGb3JtYXREb2N1bWVudFByb3ZpZGVyJywgbW9kZWwudXJpLCB7XG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0dGFiU2l6ZTogNCxcblx0XHR9IHNhdGlzZmllcyBGb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cblx0Ly8gLS0tIHJlbmFtZVxuXHR0ZXN0KCd2c2NvZGUucHJlcGFyZVJlbmFtZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJSZW5hbWVQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLlJlbmFtZVByb3ZpZGVyIHtcblxuXHRcdFx0cHJlcGFyZVJlbmFtZShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMCwgMTIsIDAsIDI0KSxcblx0XHRcdFx0XHRwbGFjZWhvbGRlcjogJ2Zvb29QbGFjZWhvbGRlcidcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZVJlbmFtZUVkaXRzKGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCBuZXdOYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0Y29uc3QgZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0XHRcdGVkaXQuaW5zZXJ0KGRvY3VtZW50LnVyaSwgPHR5cGVzLlBvc2l0aW9uPnBvc2l0aW9uLCBuZXdOYW1lKTtcblx0XHRcdFx0cmV0dXJuIGVkaXQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHsgcmFuZ2U6IHZzY29kZS5SYW5nZTsgcGxhY2Vob2xkZXI6IHN0cmluZyB9PigndnNjb2RlLnByZXBhcmVSZW5hbWUnLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxMikpO1xuXG5cdFx0YXNzZXJ0Lm9rKGRhdGEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnBsYWNlaG9sZGVyLCAnZm9vb1BsYWNlaG9sZGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDI0KTtcblxuXHR9KTtcblxuXHR0ZXN0KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50UmVuYW1lUHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyUmVuYW1lUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5SZW5hbWVQcm92aWRlciB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHMoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBlZGl0ID0gbmV3IHR5cGVzLldvcmtzcGFjZUVkaXQoKTtcblx0XHRcdFx0ZWRpdC5pbnNlcnQoZG9jdW1lbnQudXJpLCA8dHlwZXMuUG9zaXRpb24+cG9zaXRpb24sIG5ld05hbWUpO1xuXHRcdFx0XHRyZXR1cm4gZWRpdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBlZGl0ID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLldvcmtzcGFjZUVkaXQ+KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50UmVuYW1lUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxMiksICduZXdOYW1lT2ZUaGlzJyk7XG5cblx0XHRhc3NlcnQub2soZWRpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXQuaGFzKG1vZGVsLnVyaSksIHRydWUpO1xuXHRcdGNvbnN0IHRleHRFZGl0cyA9IGVkaXQuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRFZGl0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0RWRpdHNbMF0ubmV3VGV4dCwgJ25ld05hbWVPZlRoaXMnKTtcblx0fSk7XG5cblx0Ly8gLS0tIGRlZmluaXRpb25cblxuXHR0ZXN0KCdEZWZpbml0aW9uLCBpbnZhbGlkIGFyZ3VtZW50cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwcm9taXNlcyA9IFtcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJykpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInLCBudWxsKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcicsIHVuZGVmaW5lZCkpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVEZWZpbml0aW9uUHJvdmlkZXInLCB0cnVlLCBmYWxzZSkpXG5cdFx0XTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlZmluaXRpb24sIGJhY2sgYW5kIGZvcnRoJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdC8vIGR1cGxpY2F0ZSByZXN1bHQgd2lsbCBnZXQgcmVtb3ZlZFxuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURlZmluaXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMiwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMywgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoNCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkxvY2F0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0RlZmluaXRpb24sIGJhY2sgYW5kIGZvcnRoIChzb3J0aW5nICYgZGUtZGVkdXBpbmcpJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oVVJJLnBhcnNlKCdmaWxlOi8vL2InKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdC8vIGR1cGxpY2F0ZSByZXN1bHQgd2lsbCBnZXQgcmVtb3ZlZFxuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKFVSSS5wYXJzZSgnZmlsZTovLy9iJyksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURlZmluaXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpLCBuZXcgdHlwZXMuUmFuZ2UoMiwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vYycpLCBuZXcgdHlwZXMuUmFuZ2UoMywgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vZCcpLCBuZXcgdHlwZXMuUmFuZ2UoNCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkxvY2F0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZURlZmluaXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzBdLnVyaS5wYXRoLCAnL2EnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlc1sxXS51cmkucGF0aCwgJy9iJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXNbMl0udXJpLnBhdGgsICcvYycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzNdLnVyaS5wYXRoLCAnL2QnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWZpbml0aW9uIExpbmsnLCAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVmaW5pdGlvbihkb2M6IGFueSk6ICh2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKSxcblx0XHRcdFx0XHR7IHRhcmdldFVyaTogZG9jLnVyaSwgdGFyZ2V0UmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSwgdGFyZ2V0U2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgxLCAxLCAxLCAxKSwgb3JpZ2luU2VsZWN0aW9uUmFuZ2U6IG5ldyB0eXBlcy5SYW5nZSgyLCAyLCAyLCAyKSB9XG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDwodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXT4oJ3ZzY29kZS5leGVjdXRlRGVmaW5pdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0aWYgKGlzTG9jYXRpb24odikpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0VXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0U2VsZWN0aW9uUmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi5vcmlnaW5TZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZGVjbGFyYXRpb25cblxuXHR0ZXN0KCdEZWNsYXJhdGlvbiwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURlY2xhcmF0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEZWNsYXJhdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRlY2xhcmF0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURlY2xhcmF0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHJlc3VsdCB3aWxsIGdldCByZW1vdmVkXG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5EZWNsYXJhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEZWNsYXJhdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSg0LCAwLCAwLCAwKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlRGVjbGFyYXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWNsYXJhdGlvbiBMaW5rJywgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRGVjbGFyYXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRGVjbGFyYXRpb24oZG9jOiBhbnkpOiAodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0eyB0YXJnZXRVcmk6IGRvYy51cmksIHRhcmdldFJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCksIHRhcmdldFNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSksIG9yaWdpblNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMiwgMiwgMiwgMikgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8KHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10+KCd2c2NvZGUuZXhlY3V0ZURlY2xhcmF0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRpZiAoaXNMb2NhdGlvbih2KSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRVcmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0UmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRTZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2Lm9yaWdpblNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSB0eXBlIGRlZmluaXRpb25cblxuXHR0ZXN0KCdUeXBlIERlZmluaXRpb24sIGludmFsaWQgYXJndW1lbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHByb21pc2VzID0gW1xuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJykpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgbnVsbCkpLFxuXHRcdFx0YXNzZXJ0UmVqZWN0cygoKSA9PiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZCgndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgdW5kZWZpbmVkKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZVR5cGVEZWZpbml0aW9uUHJvdmlkZXInLCB0cnVlLCBmYWxzZSkpXG5cdFx0XTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1R5cGUgRGVmaW5pdGlvbiwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVR5cGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVR5cGVEZWZpbml0aW9uKGRvYzogYW55KTogYW55IHtcblx0XHRcdFx0Ly8gZHVwbGljYXRlIHJlc3VsdCB3aWxsIGdldCByZW1vdmVkXG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5UeXBlRGVmaW5pdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVUeXBlRGVmaW5pdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgyLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgzLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSg0LCAwLCAwLCAwKSksXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuTG9jYXRpb25bXT4oJ3ZzY29kZS5leGVjdXRlVHlwZURlZmluaXRpb25Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0Zm9yIChjb25zdCB2IG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKHYucmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUeXBlIERlZmluaXRpb24gTGluaycsICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVR5cGVEZWZpbml0aW9uKGRvYzogYW55KTogKHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdHsgdGFyZ2V0VXJpOiBkb2MudXJpLCB0YXJnZXRSYW5nZTogbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApLCB0YXJnZXRTZWxlY3Rpb25SYW5nZTogbmV3IHR5cGVzLlJhbmdlKDEsIDEsIDEsIDEpLCBvcmlnaW5TZWxlY3Rpb25SYW5nZTogbmV3IHR5cGVzLlJhbmdlKDIsIDIsIDIsIDIpIH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPCh2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuTG9jYXRpb25MaW5rKVtdPigndnNjb2RlLmV4ZWN1dGVUeXBlRGVmaW5pdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0aWYgKGlzTG9jYXRpb24odikpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnVyaSBpbnN0YW5jZW9mIFVSSSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi5yYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0VXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnRhcmdldFJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0U2VsZWN0aW9uUmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi5vcmlnaW5TZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gaW1wbGVtZW50YXRpb25cblxuXHR0ZXN0KCdJbXBsZW1lbnRhdGlvbiwgaW52YWxpZCBhcmd1bWVudHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSBbXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInLCBudWxsKSksXG5cdFx0XHRhc3NlcnRSZWplY3RzKCgpID0+IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInLCB1bmRlZmluZWQpKSxcblx0XHRcdGFzc2VydFJlamVjdHMoKCkgPT4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5leGVjdXRlSW1wbGVtZW50YXRpb25Qcm92aWRlcicsIHRydWUsIGZhbHNlKSlcblx0XHRdO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0fSk7XG5cblx0dGVzdCgnSW1wbGVtZW50YXRpb24sIGJhY2sgYW5kIGZvcnRoJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTG9jYXRpb24oZG9jLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDAsIDApKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVJbXBsZW1lbnRhdGlvbihkb2M6IGFueSk6IGFueSB7XG5cdFx0XHRcdC8vIGR1cGxpY2F0ZSByZXN1bHQgd2lsbCBnZXQgcmVtb3ZlZFxuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuSW1wbGVtZW50YXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW1wbGVtZW50YXRpb24oZG9jOiBhbnkpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMiwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMywgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Mb2NhdGlvbihkb2MudXJpLCBuZXcgdHlwZXMuUmFuZ2UoNCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkxvY2F0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRhc3NlcnQub2sodi51cmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdGFzc2VydC5vayh2LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnSW1wbGVtZW50YXRpb24gRGVmaW5pdGlvbiBMaW5rJywgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuSW1wbGVtZW50YXRpb25Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW1wbGVtZW50YXRpb24oZG9jOiBhbnkpOiAodnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uTGluaylbXSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkxvY2F0aW9uKGRvYy51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0eyB0YXJnZXRVcmk6IGRvYy51cmksIHRhcmdldFJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMCwgMCksIHRhcmdldFNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMSwgMSwgMSwgMSksIG9yaWdpblNlbGVjdGlvblJhbmdlOiBuZXcgdHlwZXMuUmFuZ2UoMiwgMiwgMiwgMikgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8KHZzY29kZS5Mb2NhdGlvbiB8IHZzY29kZS5Mb2NhdGlvbkxpbmspW10+KCd2c2NvZGUuZXhlY3V0ZUltcGxlbWVudGF0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGZvciAoY29uc3QgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRpZiAoaXNMb2NhdGlvbih2KSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudXJpIGluc3RhbmNlb2YgVVJJKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRVcmkgaW5zdGFuY2VvZiBVUkkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHYudGFyZ2V0UmFuZ2UgaW5zdGFuY2VvZiB0eXBlcy5SYW5nZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQub2sodi50YXJnZXRTZWxlY3Rpb25SYW5nZSBpbnN0YW5jZW9mIHR5cGVzLlJhbmdlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5vayh2Lm9yaWdpblNlbGVjdGlvblJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSByZWZlcmVuY2VzXG5cblx0dGVzdCgncmVmZXJlbmNlIHNlYXJjaCwgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5SZWZlcmVuY2VQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlUmVmZXJlbmNlcygpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuTG9jYXRpb24oVVJJLnBhcnNlKCdzb21lOnVyaS9wYXRoJyksIG5ldyB0eXBlcy5SYW5nZSgwLCAxLCAwLCA1KSlcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkxvY2F0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZVJlZmVyZW5jZVByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudXJpLnRvU3RyaW5nKCksICdzb21lOnVyaS9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UuZW5kLmNoYXJhY3RlciwgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBkb2N1bWVudCBoaWdobGlnaHRzXG5cblx0dGVzdCgnXCJ2c2NvZGUuZXhlY3V0ZURvY3VtZW50SGlnaGxpZ2h0c1wiIEFQSSBoYXMgc3RvcHBlZCByZXR1cm5pbmcgRG9jdW1lbnRIaWdobGlnaHRbXSMyMDAwNTYnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKCkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Eb2N1bWVudEhpZ2hsaWdodChuZXcgdHlwZXMuUmFuZ2UoMCwgMTcsIDAsIDI1KSwgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHRLaW5kLlJlYWQpXG5cdFx0XHRcdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFtdPigndnNjb2RlLmV4ZWN1dGVEb2N1bWVudEhpZ2hsaWdodHMnLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkodmFsdWVzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMSk7XG5cdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWVzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQuY2hhcmFjdGVyLCAyNSk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0Ly8gLS0tIG91dGxpbmVcblxuXHR0ZXN0KCdPdXRsaW5lLCBiYWNrIGFuZCBmb3J0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbigndGVzdGluZzEnLCB0eXBlcy5TeW1ib2xLaW5kLkVudW0sIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSksXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlN5bWJvbEluZm9ybWF0aW9uKCd0ZXN0aW5nMicsIHR5cGVzLlN5bWJvbEtpbmQuRW51bSwgbmV3IHR5cGVzLlJhbmdlKDAsIDEsIDAsIDMpKSxcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbltdPigndnNjb2RlLmV4ZWN1dGVEb2N1bWVudFN5bWJvbFByb3ZpZGVyJywgbW9kZWwudXJpKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gdmFsdWVzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QgaW5zdGFuY2VvZiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQgaW5zdGFuY2VvZiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5uYW1lLCAndGVzdGluZzInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5uYW1lLCAndGVzdGluZzEnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50U3ltYm9sUHJvdmlkZXIgY29tbWFuZCBvbmx5IHJldHVybnMgU3ltYm9sSW5mb3JtYXRpb25bXSByYXRoZXIgdGhhbiBEb2N1bWVudFN5bWJvbFtdICM1Nzk4NCcsIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURvY3VtZW50U3ltYm9scygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbignU3ltYm9sSW5mb3JtYXRpb24nLCB0eXBlcy5TeW1ib2xLaW5kLkVudW0sIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSlcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoKTogYW55IHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IG5ldyB0eXBlcy5Eb2N1bWVudFN5bWJvbCgnRG9jdW1lbnRTeW1ib2wnLCAnRG9jdW1lbnRTeW1ib2wjZGV0YWlsJywgdHlwZXMuU3ltYm9sS2luZC5FbnVtLCBuZXcgdHlwZXMuUmFuZ2UoMSwgMCwgMSwgMCksIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSk7XG5cdFx0XHRcdHJvb3QuY2hpbGRyZW4gPSBbbmV3IHR5cGVzLkRvY3VtZW50U3ltYm9sKCdEb2N1bWVudFN5bWJvbCNjaGlsZCcsICdEb2N1bWVudFN5bWJvbCNkZXRhaWwjY2hpbGQnLCB0eXBlcy5TeW1ib2xLaW5kLkVudW0sIG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDEsIDAsIDEsIDApKV07XG5cdFx0XHRcdHJldHVybiBbcm9vdF07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDwodnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uICYgdnNjb2RlLkRvY3VtZW50U3ltYm9sKVtdPigndnNjb2RlLmV4ZWN1dGVEb2N1bWVudFN5bWJvbFByb3ZpZGVyJywgbW9kZWwudXJpKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gdmFsdWVzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QgaW5zdGFuY2VvZiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdCBpbnN0YW5jZW9mIHR5cGVzLkRvY3VtZW50U3ltYm9sLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQgaW5zdGFuY2VvZiB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5uYW1lLCAnRG9jdW1lbnRTeW1ib2wnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQubmFtZSwgJ1N5bWJvbEluZm9ybWF0aW9uJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIHN1Z2dlc3RcblxuXHR0ZXN0QXBpQ21kKCd0cmlnZ2VyQ2hhcmFjdGVyIGlzIG51bGwgd2hlbiBjb21wbGV0aW9uIHByb3ZpZGVyIGlzIGNhbGxlZCBwcm9ncmFtbWF0aWNhbGx5ICMxNTk5MTQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgYWN0dWFsQ29udGV4dDogdnNjb2RlLkNvbXBsZXRpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoX2RvYywgX3BvcywgX3RvaywgY29udGV4dCk6IGFueSB7XG5cdFx0XHRcdGFjdHVhbENvbnRleHQgPSBjb250ZXh0O1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db21wbGV0aW9uTGlzdD4oJ3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpKTtcblxuXHRcdGFzc2VydC5vayhhY3R1YWxDb250ZXh0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbENvbnRleHQsIHsgdHJpZ2dlcktpbmQ6IHR5cGVzLkNvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UsIHRyaWdnZXJDaGFyYWN0ZXI6IHVuZGVmaW5lZCB9KTtcblxuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdTdWdnZXN0LCBiYWNrIGFuZCBmb3J0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0xJyk7XG5cdFx0XHRcdGEuZG9jdW1lbnRhdGlvbiA9IG5ldyB0eXBlcy5NYXJrZG93blN0cmluZygnaGVsbG9fbWRfc3RyaW5nJyk7XG5cdFx0XHRcdGNvbnN0IGIgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0yJyk7XG5cdFx0XHRcdGIudGV4dEVkaXQgPSB0eXBlcy5UZXh0RWRpdC5yZXBsYWNlKG5ldyB0eXBlcy5SYW5nZSgwLCA0LCAwLCA4KSwgJ2ZvbycpOyAvLyBvdmVyd2l0ZSBhZnRlclxuXHRcdFx0XHRjb25zdCBjID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMycpO1xuXHRcdFx0XHRjLnRleHRFZGl0ID0gdHlwZXMuVGV4dEVkaXQucmVwbGFjZShuZXcgdHlwZXMuUmFuZ2UoMCwgMSwgMCwgNiksICdmb29iYXInKTsgLy8gb3ZlcndpdGUgYmVmb3JlICYgYWZ0ZXJcblxuXHRcdFx0XHQvLyBzbmlwcGV0IHN0cmluZyFcblx0XHRcdFx0Y29uc3QgZCA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTQnKTtcblx0XHRcdFx0ZC5yYW5nZSA9IG5ldyB0eXBlcy5SYW5nZSgwLCAxLCAwLCA0KTsvLyBvdmVyd2l0ZSBiZWZvcmVcblx0XHRcdFx0ZC5pbnNlcnRUZXh0ID0gbmV3IHR5cGVzLlNuaXBwZXRTdHJpbmcoJ2ZvbyQwYmFyJyk7XG5cdFx0XHRcdHJldHVybiBbYSwgYiwgYywgZF07XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCA0KSk7XG5cdFx0YXNzZXJ0Lm9rKGxpc3QgaW5zdGFuY2VvZiB0eXBlcy5Db21wbGV0aW9uTGlzdCk7XG5cdFx0Y29uc3QgdmFsdWVzID0gbGlzdC5pdGVtcztcblx0XHRhc3NlcnQub2soQXJyYXkuaXNBcnJheSh2YWx1ZXMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgNCk7XG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmQsIHRoaXJkLCBmb3VydGhdID0gdmFsdWVzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5sYWJlbCwgJ2l0ZW0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRFZGl0LCB1bmRlZmluZWQpOyAvLyBubyB0ZXh0IGVkaXQsIGRlZmF1bHQgcmFuZ2VzXG5cdFx0YXNzZXJ0Lm9rKCF0eXBlcy5SYW5nZS5pc1JhbmdlKGZpcnN0LnJhbmdlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8dHlwZXMuTWFya2Rvd25TdHJpbmc+Zmlyc3QuZG9jdW1lbnRhdGlvbikudmFsdWUsICdoZWxsb19tZF9zdHJpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmxhYmVsLCAnaXRlbTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRFZGl0IS5uZXdUZXh0LCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRleHRFZGl0IS5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC50ZXh0RWRpdCEucmFuZ2UuZW5kLmNoYXJhY3RlciwgOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkLmxhYmVsLCAnaXRlbTMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQudGV4dEVkaXQhLm5ld1RleHQsICdmb29iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQudGV4dEVkaXQhLnJhbmdlLnN0YXJ0LmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlyZC50ZXh0RWRpdCEucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQudGV4dEVkaXQhLnJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmQudGV4dEVkaXQhLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VydGgubGFiZWwsICdpdGVtNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VydGgudGV4dEVkaXQsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmFuZ2U6IGFueSA9IGZvdXJ0aC5yYW5nZSE7XG5cdFx0YXNzZXJ0Lm9rKHR5cGVzLlJhbmdlLmlzUmFuZ2UocmFuZ2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlLmVuZC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2UuZW5kLmNoYXJhY3RlciwgNCk7XG5cdFx0YXNzZXJ0Lm9rKGZvdXJ0aC5pbnNlcnRUZXh0IGluc3RhbmNlb2YgdHlwZXMuU25pcHBldFN0cmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCg8dHlwZXMuU25pcHBldFN0cmluZz5mb3VydGguaW5zZXJ0VGV4dCkudmFsdWUsICdmb28kMGJhcicpO1xuXG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ1N1Z2dlc3QsIHJldHVybiBDb21wbGV0aW9uTGlzdCAhYXJyYXknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMScpO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMicpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db21wbGV0aW9uTGlzdCg8YW55PlthLCBiXSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCA0KSk7XG5cblx0XHRhc3NlcnQub2sobGlzdCBpbnN0YW5jZW9mIHR5cGVzLkNvbXBsZXRpb25MaXN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlzdC5pc0luY29tcGxldGUsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdTdWdnZXN0LCByZXNvbHZlIGNvbXBsZXRpb24gaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXHRcdGxldCByZXNvbHZlQ291bnQgPSAwO1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0Y29uc3QgYSA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTEnKTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTInKTtcblx0XHRcdFx0Y29uc3QgYyA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTMnKTtcblx0XHRcdFx0Y29uc3QgZCA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTQnKTtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5Db21wbGV0aW9uTGlzdChbYSwgYiwgYywgZF0sIGZhbHNlKTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlQ29tcGxldGlvbkl0ZW0oaXRlbSkge1xuXHRcdFx0XHRyZXNvbHZlQ291bnQgKz0gMTtcblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9XG5cdFx0fSwgW10pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpc3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tcGxldGlvbkxpc3Q+KFxuXHRcdFx0J3ZzY29kZS5leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsXG5cdFx0XHRtb2RlbC51cmksXG5cdFx0XHRuZXcgdHlwZXMuUG9zaXRpb24oMCwgNCksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQyIC8vIG1heEl0ZW1zVG9SZXNvbHZlXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhsaXN0IGluc3RhbmNlb2YgdHlwZXMuQ29tcGxldGlvbkxpc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDIpO1xuXG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ1widnNjb2RlLmV4ZWN1dGVDb21wbGV0aW9uSXRlbVByb3ZpZGVyXCIgZG9lc25vdCByZXR1cm4gYSBwcmVzZWxlY3QgZmllbGQgIzUzNzQ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCk6IGFueSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ2l0ZW0xJyk7XG5cdFx0XHRcdGEucHJlc2VsZWN0ID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgYiA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTInKTtcblx0XHRcdFx0Y29uc3QgYyA9IG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnaXRlbTMnKTtcblx0XHRcdFx0Yy5wcmVzZWxlY3QgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBkID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtNCcpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNvbXBsZXRpb25MaXN0KFthLCBiLCBjLCBkXSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0sIFtdKSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBsaXN0ID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbXBsZXRpb25MaXN0Pihcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0bmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhsaXN0IGluc3RhbmNlb2YgdHlwZXMuQ29tcGxldGlvbkxpc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Lml0ZW1zLmxlbmd0aCwgNCk7XG5cblx0XHRjb25zdCBbYSwgYiwgYywgZF0gPSBsaXN0Lml0ZW1zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLnByZXNlbGVjdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIucHJlc2VsZWN0LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjLnByZXNlbGVjdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQucHJlc2VsZWN0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdleGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlciBkb2VzblxcJ3QgY2FwdHVyZSBjb21taXRDaGFyYWN0ZXJzICM1ODIyOCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb21wbGV0aW9uSXRlbVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcygpOiBhbnkge1xuXHRcdFx0XHRjb25zdCBhID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMScpO1xuXHRcdFx0XHRhLmNvbW1pdENoYXJhY3RlcnMgPSBbJ2EnLCAnYiddO1xuXHRcdFx0XHRjb25zdCBiID0gbmV3IHR5cGVzLkNvbXBsZXRpb25JdGVtKCdpdGVtMicpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkNvbXBsZXRpb25MaXN0KFthLCBiXSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0sIFtdKSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBsaXN0ID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbXBsZXRpb25MaXN0Pihcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0bmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhsaXN0IGluc3RhbmNlb2YgdHlwZXMuQ29tcGxldGlvbkxpc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Lml0ZW1zLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBbYSwgYl0gPSBsaXN0Lml0ZW1zO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYS5jb21taXRDaGFyYWN0ZXJzLCBbJ2EnLCAnYiddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5jb21taXRDaGFyYWN0ZXJzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXIgcmV0dXJucyB0aGUgd3JvbmcgQ29tcGxldGlvbkl0ZW1LaW5kcyBpbiBpbnNpZGVycyAjOTU3MTUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oJ015IE1ldGhvZCcsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2QpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db21wbGV0aW9uSXRlbSgnTXkgUHJvcGVydHknLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0sIFtdKSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBsaXN0ID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvbXBsZXRpb25MaXN0Pihcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZUNvbXBsZXRpb25JdGVtUHJvdmlkZXInLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0bmV3IHR5cGVzLlBvc2l0aW9uKDAsIDQpLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhsaXN0IGluc3RhbmNlb2YgdHlwZXMuQ29tcGxldGlvbkxpc3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Lml0ZW1zLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBbYSwgYl0gPSBsaXN0Lml0ZW1zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmtpbmQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLmtpbmQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBzaWduYXR1cmVIZWxwXG5cblx0dGVzdCgnUGFyYW1ldGVyIEhpbnRzLCBiYWNrIGFuZCBmb3J0aCcsIGFzeW5jICgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5TaWduYXR1cmVIZWxwUHJvdmlkZXIge1xuXHRcdFx0cHJvdmlkZVNpZ25hdHVyZUhlbHAoX2RvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBfcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwgX3Rva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IHZzY29kZS5TaWduYXR1cmVIZWxwQ29udGV4dCk6IHZzY29kZS5TaWduYXR1cmVIZWxwIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRhY3RpdmVTaWduYXR1cmU6IDAsXG5cdFx0XHRcdFx0YWN0aXZlUGFyYW1ldGVyOiAxLFxuXHRcdFx0XHRcdHNpZ25hdHVyZXM6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6ICdhYmMnLFxuXHRcdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBgJHtjb250ZXh0LnRyaWdnZXJLaW5kID09PSAxIC8qIHZzY29kZS5TaWduYXR1cmVIZWxwVHJpZ2dlcktpbmQuSW52b2tlICovID8gJ2ludm9rZWQnIDogJ3Vua25vd24nfSAke2NvbnRleHQudHJpZ2dlckNoYXJhY3Rlcn1gLFxuXHRcdFx0XHRcdFx0XHRwYXJhbWV0ZXJzOiBbXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9LCBbXSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3QgZmlyc3RWYWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TaWduYXR1cmVIZWxwPigndnNjb2RlLmV4ZWN1dGVTaWduYXR1cmVIZWxwUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxKSwgJywnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RWYWx1ZS5hY3RpdmVTaWduYXR1cmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFZhbHVlLmFjdGl2ZVBhcmFtZXRlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0VmFsdWUuc2lnbmF0dXJlcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFZhbHVlLnNpZ25hdHVyZXNbMF0ubGFiZWwsICdhYmMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RWYWx1ZS5zaWduYXR1cmVzWzBdLmRvY3VtZW50YXRpb24sICdpbnZva2VkICwnKTtcblx0fSk7XG5cblx0Ly8gLS0tIHF1aWNrZml4XG5cblx0dGVzdEFwaUNtZCgnUXVpY2tGaXgsIGJhY2sgYW5kIGZvcnRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKCk6IHZzY29kZS5Db21tYW5kW10ge1xuXHRcdFx0XHRyZXR1cm4gW3sgY29tbWFuZDogJ3Rlc3RpbmcnLCB0aXRsZTogJ1RpdGxlJywgYXJndW1lbnRzOiBbMSwgMiwgdHJ1ZV0gfV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ29tbWFuZFtdPigndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAxLCAxKSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50aXRsZSwgJ1RpdGxlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kLCAndGVzdGluZycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LmFyZ3VtZW50cywgWzEsIDIsIHRydWVdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCd2c2NvZGUuZXhlY3V0ZUNvZGVBY3Rpb25Qcm92aWRlciByZXN1bHRzIHNlZW0gdG8gYmUgbWlzc2luZyB0aGVpciBgY29tbWFuZGAgcHJvcGVydHkgIzQ1MTI0JywgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZUNvZGVBY3Rpb25zKGRvY3VtZW50LCByYW5nZSk6IHZzY29kZS5Db2RlQWN0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtkb2N1bWVudCwgcmFuZ2VdLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdjb21tYW5kX3RpdGxlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtpbmQ6IHR5cGVzLkNvZGVBY3Rpb25LaW5kLkVtcHR5LmFwcGVuZCgnZm9vJyksXG5cdFx0XHRcdFx0dGl0bGU6ICd0aXRsZScsXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVBY3Rpb25bXT4oJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdFx0XHRhc3NlcnQub2soZmlyc3QuY29tbWFuZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kLmNvbW1hbmQsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kLnRpdGxlLCAnY29tbWFuZF90aXRsZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Qua2luZCEudmFsdWUsICdmb28nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRpdGxlLCAndGl0bGUnKTtcblxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyIHBhc3NlcyBSYW5nZSB0byBwcm92aWRlciBhbHRob3VnaCBTZWxlY3Rpb24gaXMgcGFzc2VkIGluICM3Nzk5NycsIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVDb2RlQWN0aW9ucyhkb2N1bWVudCwgcmFuZ2VPclNlbGVjdGlvbik6IHZzY29kZS5Db2RlQWN0aW9uW10ge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtkb2N1bWVudCwgcmFuZ2VPclNlbGVjdGlvbl0sXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ2NvbW1hbmRfdGl0bGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogdHlwZXMuQ29kZUFjdGlvbktpbmQuRW1wdHkuYXBwZW5kKCdmb28nKSxcblx0XHRcdFx0XHR0aXRsZTogJ3RpdGxlJyxcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbmV3IHR5cGVzLlNlbGVjdGlvbigwLCAwLCAxLCAxKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVBY3Rpb25bXT4oJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBzZWxlY3Rpb24pLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdFx0XHRhc3NlcnQub2soZmlyc3QuY29tbWFuZCk7XG5cdFx0XHRcdGFzc2VydC5vayhmaXJzdC5jb21tYW5kLmFyZ3VtZW50cyFbMV0gaW5zdGFuY2VvZiB0eXBlcy5TZWxlY3Rpb24pO1xuXHRcdFx0XHRhc3NlcnQub2soZmlyc3QuY29tbWFuZC5hcmd1bWVudHMhWzFdLmlzRXF1YWwoc2VsZWN0aW9uKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgndnNjb2RlLmV4ZWN1dGVDb2RlQWN0aW9uUHJvdmlkZXIgcmVzdWx0cyBzZWVtIHRvIGJlIG1pc3NpbmcgdGhlaXIgYGlzUHJlZmVycmVkYCBwcm9wZXJ0eSAjNzgwOTgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoZG9jdW1lbnQsIHJhbmdlT3JTZWxlY3Rpb24pOiB2c2NvZGUuQ29kZUFjdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbZG9jdW1lbnQsIHJhbmdlT3JTZWxlY3Rpb25dLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdjb21tYW5kX3RpdGxlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtpbmQ6IHR5cGVzLkNvZGVBY3Rpb25LaW5kLkVtcHR5LmFwcGVuZCgnZm9vJyksXG5cdFx0XHRcdFx0dGl0bGU6ICd0aXRsZScsXG5cdFx0XHRcdFx0aXNQcmVmZXJyZWQ6IHRydWVcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbmV3IHR5cGVzLlNlbGVjdGlvbigwLCAwLCAxLCAxKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVBY3Rpb25bXT4oJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBzZWxlY3Rpb24pLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuaXNQcmVmZXJyZWQsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ3Jlc29sdmluZyBjb2RlIGFjdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBkaWRDYWxsUmVzb2x2ZSA9IDA7XG5cdFx0Y2xhc3MgTXlBY3Rpb24gZXh0ZW5kcyB0eXBlcy5Db2RlQWN0aW9uIHsgfVxuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnMoZG9jdW1lbnQsIHJhbmdlT3JTZWxlY3Rpb24pOiB2c2NvZGUuQ29kZUFjdGlvbltdIHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgTXlBY3Rpb24oJ3RpdGxlJywgdHlwZXMuQ29kZUFjdGlvbktpbmQuRW1wdHkuYXBwZW5kKCdmb28nKSldO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVDb2RlQWN0aW9uKGFjdGlvbik6IHZzY29kZS5Db2RlQWN0aW9uIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbiBpbnN0YW5jZW9mIE15QWN0aW9uKTtcblxuXHRcdFx0XHRkaWRDYWxsUmVzb2x2ZSArPSAxO1xuXHRcdFx0XHRhY3Rpb24udGl0bGUgPSAncmVzb2x2ZWQgdGl0bGUnO1xuXHRcdFx0XHRhY3Rpb24uZWRpdCA9IG5ldyB0eXBlcy5Xb3Jrc3BhY2VFZGl0KCk7XG5cdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbmV3IHR5cGVzLlNlbGVjdGlvbigwLCAwLCAxLCAxKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVBY3Rpb25bXT4oJ3ZzY29kZS5leGVjdXRlQ29kZUFjdGlvblByb3ZpZGVyJywgbW9kZWwudXJpLCBzZWxlY3Rpb24sIHVuZGVmaW5lZCwgMTAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZENhbGxSZXNvbHZlLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGl0bGUsICd0aXRsZScpOyAvLyBkb2VzIE5PVCBjaGFuZ2Vcblx0XHRhc3NlcnQub2soZmlyc3QuZWRpdCk7IC8vIGlzIHNldFxuXHR9KTtcblxuXHQvLyAtLS0gY29kZSBsZW5zXG5cblx0dGVzdEFwaUNtZCgnQ29kZUxlbnMsIGJhY2sgYW5kIGZvcnRoJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgY29tcGxleEFyZyA9IHtcblx0XHRcdGZvbygpIHsgfSxcblx0XHRcdGJhcigpIHsgfSxcblx0XHRcdGJpZzogZXh0SG9zdFxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkNvZGVMZW5zUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUNvZGVMZW5zZXMoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuQ29kZUxlbnMobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDEsIDEpLCB7IHRpdGxlOiAnVGl0bGUnLCBjb21tYW5kOiAnY21kJywgYXJndW1lbnRzOiBbMSwgdHJ1ZSwgY29tcGxleEFyZ10gfSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCkudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNvZGVMZW5zW10+KCd2c2NvZGUuZXhlY3V0ZUNvZGVMZW5zUHJvdmlkZXInLCBtb2RlbC51cmkpLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kIS50aXRsZSwgJ1RpdGxlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kIS5jb21tYW5kLCAnY21kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5jb21tYW5kIS5hcmd1bWVudHMhWzBdLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbW1hbmQhLmFyZ3VtZW50cyFbMV0sIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29tbWFuZCEuYXJndW1lbnRzIVsyXSwgY29tcGxleEFyZyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnQ29kZUxlbnMsIHJlc29sdmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgcmVzb2x2ZUNvdW50ID0gMDtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNvZGVMZW5zUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuQ29kZUxlbnNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlQ29kZUxlbnNlcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSkpLFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5Db2RlTGVucyhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMSwgMSksIHsgdGl0bGU6ICdBbHJlYWR5IHJlc29sdmVkJywgY29tbWFuZDogJ2ZmZicgfSlcblx0XHRcdFx0XTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlQ29kZUxlbnMoY29kZUxlbnM6IHR5cGVzLkNvZGVMZW5zKSB7XG5cdFx0XHRcdGNvZGVMZW5zLmNvbW1hbmQgPSB7IHRpdGxlOiByZXNvbHZlQ291bnQudG9TdHJpbmcoKSwgY29tbWFuZDogJ3Jlc29sdmVkJyB9O1xuXHRcdFx0XHRyZXNvbHZlQ291bnQgKz0gMTtcblx0XHRcdFx0cmV0dXJuIGNvZGVMZW5zO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGxldCB2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db2RlTGVuc1tdPigndnNjb2RlLmV4ZWN1dGVDb2RlTGVuc1Byb3ZpZGVyJywgbW9kZWwudXJpLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDMpOyAvLyB0aGUgcmVzb2x2ZSBhcmd1bWVudCBkZWZpbmVzIHRoZSBudW1iZXIgb2YgcmVzdWx0cyBiZWluZyByZXR1cm5lZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDIpO1xuXG5cdFx0cmVzb2x2ZUNvdW50ID0gMDtcblx0XHR2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db2RlTGVuc1tdPigndnNjb2RlLmV4ZWN1dGVDb2RlTGVuc1Byb3ZpZGVyJywgbW9kZWwudXJpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0QXBpQ21kKCdMaW5rcywgYmFjayBhbmQgZm9ydGgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRMaW5rcygpOiBhbnkge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5Eb2N1bWVudExpbmsobmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDIwKSwgVVJJLnBhcnNlKCdmb286YmFyJykpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Eb2N1bWVudExpbmtbXT4oJ3ZzY29kZS5leGVjdXRlTGlua1Byb3ZpZGVyJywgbW9kZWwudXJpKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGFyZ2V0ICsgJycsICdmb286YmFyJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5lbmQuY2hhcmFjdGVyLCAyMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnV2hhdFxcJ3MgdGhlIGNvbmRpdGlvbiBmb3IgRG9jdW1lbnRMaW5rIHRhcmdldCB0byBiZSB1bmRlZmluZWQ/ICMxMDYzMDgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuRG9jdW1lbnRMaW5rUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZURvY3VtZW50TGlua3MoKTogYW55IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuRG9jdW1lbnRMaW5rKG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAyMCksIHVuZGVmaW5lZCldO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVEb2N1bWVudExpbmsobGluaykge1xuXHRcdFx0XHRsaW5rLnRhcmdldCA9IFVSSS5wYXJzZSgnZm9vOmJhcicpO1xuXHRcdFx0XHRyZXR1cm4gbGluaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCBsaW5rczEgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuRG9jdW1lbnRMaW5rW10+KCd2c2NvZGUuZXhlY3V0ZUxpbmtQcm92aWRlcicsIG1vZGVsLnVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtzMS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rczFbMF0udGFyZ2V0LCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgbGlua3MyID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkRvY3VtZW50TGlua1tdPigndnNjb2RlLmV4ZWN1dGVMaW5rUHJvdmlkZXInLCBtb2RlbC51cmksIDEwMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5rczIubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MyWzBdLnRhcmdldCEudG9TdHJpbmcoKSwgVVJJLnBhcnNlKCdmb286YmFyJykudG9TdHJpbmcoKSk7XG5cblx0fSk7XG5cblx0dGVzdEFwaUNtZCgnRG9jdW1lbnRMaW5rW10gdnNjb2RlLmV4ZWN1dGVMaW5rUHJvdmlkZXIgcmV0dXJucyBsYWNrIHRvb2x0aXAgIzIxMzk3MCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJEb2N1bWVudExpbmtQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRMaW5rcygpOiBhbnkge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gbmV3IHR5cGVzLkRvY3VtZW50TGluayhuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMjApLCBVUkkucGFyc2UoJ2ZvbzpiYXInKSk7XG5cdFx0XHRcdGxpbmsudG9vbHRpcCA9ICdMaW5rIFRvb2x0aXAnO1xuXHRcdFx0XHRyZXR1cm4gW2xpbmtdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IGxpbmtzMSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Eb2N1bWVudExpbmtbXT4oJ3ZzY29kZS5leGVjdXRlTGlua1Byb3ZpZGVyJywgbW9kZWwudXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGlua3MxLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmtzMVswXS50b29sdGlwLCAnTGluayBUb29sdGlwJyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnQ29sb3IgcHJvdmlkZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJDb2xvclByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkRvY3VtZW50Q29sb3JQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRDb2xvcnMoKTogdnNjb2RlLkNvbG9ySW5mb3JtYXRpb25bXSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNvbG9ySW5mb3JtYXRpb24obmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDIwKSwgbmV3IHR5cGVzLkNvbG9yKDAuMSwgMC4yLCAwLjMsIDAuNCkpXTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlQ29sb3JQcmVzZW50YXRpb25zKCk6IHZzY29kZS5Db2xvclByZXNlbnRhdGlvbltdIHtcblx0XHRcdFx0Y29uc3QgY3AgPSBuZXcgdHlwZXMuQ29sb3JQcmVzZW50YXRpb24oJyNBQkMnKTtcblx0XHRcdFx0Y3AudGV4dEVkaXQgPSB0eXBlcy5UZXh0RWRpdC5yZXBsYWNlKG5ldyB0eXBlcy5SYW5nZSgxLCAwLCAxLCAyMCksICcjQUJDJyk7XG5cdFx0XHRcdGNwLmFkZGl0aW9uYWxUZXh0RWRpdHMgPSBbdHlwZXMuVGV4dEVkaXQuaW5zZXJ0KG5ldyB0eXBlcy5Qb3NpdGlvbigyLCAyMCksICcqJyldO1xuXHRcdFx0XHRyZXR1cm4gW2NwXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcnBjUHJvdG9jb2wuc3luYygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db2xvckluZm9ybWF0aW9uW10+KCd2c2NvZGUuZXhlY3V0ZURvY3VtZW50Q29sb3JQcm92aWRlcicsIG1vZGVsLnVyaSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWU7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbG9yLnJlZCwgMC4xKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbG9yLmdyZWVuLCAwLjIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuY29sb3IuYmx1ZSwgMC4zKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmNvbG9yLmFscGhhLCAwLjQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5yYW5nZS5zdGFydC5jaGFyYWN0ZXIsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucmFuZ2UuZW5kLmNoYXJhY3RlciwgMjApO1xuXHRcdFx0fSk7XG5cdFx0fSkudGhlbigoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2xvciA9IG5ldyB0eXBlcy5Db2xvcigwLjUsIDAuNiwgMC43LCAwLjgpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMjApO1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5Db2xvclByZXNlbnRhdGlvbltdPigndnNjb2RlLmV4ZWN1dGVDb2xvclByZXNlbnRhdGlvblByb3ZpZGVyJywgY29sb3IsIHsgdXJpOiBtb2RlbC51cmksIHJhbmdlIH0pLnRoZW4odmFsdWUgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5sYWJlbCwgJyNBQkMnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRFZGl0IS5uZXdUZXh0LCAnI0FCQycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXQhLnJhbmdlLnN0YXJ0LmxpbmUsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXQhLnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0RWRpdCEucmFuZ2UuZW5kLmxpbmUsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QudGV4dEVkaXQhLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDIwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFkZGl0aW9uYWxUZXh0RWRpdHMhLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5hZGRpdGlvbmFsVGV4dEVkaXRzIVswXS5yYW5nZS5zdGFydC5saW5lLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmFkZGl0aW9uYWxUZXh0RWRpdHMhWzBdLnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMjApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWRkaXRpb25hbFRleHRFZGl0cyFbMF0ucmFuZ2UuZW5kLmxpbmUsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuYWRkaXRpb25hbFRleHRFZGl0cyFbMF0ucmFuZ2UuZW5kLmNoYXJhY3RlciwgMjApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1wiVHlwZUVycm9yOiBlLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIGlzIG5vdCBhIGZ1bmN0aW9uXCIgY2FsbGluZyBob3ZlciBwcm92aWRlciBpbiBJbnNpZGVycyAjNTQxNzQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJIb3ZlclByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLkhvdmVyUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUhvdmVyKCk6IGFueSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuSG92ZXIoJ2ZvZm9mb2ZvJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJwY1Byb3RvY29sLnN5bmMoKS50aGVuKCgpID0+IHtcblx0XHRcdHJldHVybiBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuSG92ZXJbXT4oJ3ZzY29kZS5leGVjdXRlSG92ZXJQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDEsIDEpKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5jb250ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBpbmxpbmUgaGludHNcblxuXHR0ZXN0QXBpQ21kKCdJbmxheSBIaW50cywgYmFjayBhbmQgZm9ydGgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLklubGF5SGludHNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW5sYXlIaW50cygpIHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuSW5sYXlIaW50KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxKSwgJ0ZvbycpXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5JbmxheUhpbnRbXT4oJ3ZzY29kZS5leGVjdXRlSW5sYXlIaW50UHJvdmlkZXInLCBtb2RlbC51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAyMCwgMjApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IFtmaXJzdF0gPSB2YWx1ZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QubGFiZWwsICdGb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucG9zaXRpb24ubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnBvc2l0aW9uLmNoYXJhY3RlciwgMSk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ0lubGluZSBIaW50cywgbWVyZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVySW5sYXlIaW50c1Byb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLklubGF5SGludHNQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlSW5sYXlIaW50cygpIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyB0eXBlcy5JbmxheUhpbnRMYWJlbFBhcnQoJ0JhcicpO1xuXHRcdFx0XHRwYXJ0LnRvb2x0aXAgPSAncGFydF90b29sdGlwJztcblx0XHRcdFx0cGFydC5jb21tYW5kID0geyBjb21tYW5kOiAnY21kJywgdGl0bGU6ICdwYXJ0JyB9O1xuXHRcdFx0XHRjb25zdCBoaW50ID0gbmV3IHR5cGVzLklubGF5SGludChuZXcgdHlwZXMuUG9zaXRpb24oMTAsIDExKSwgW3BhcnRdKTtcblx0XHRcdFx0aGludC50b29sdGlwID0gJ2hpbnRfdG9vbHRpcCc7XG5cdFx0XHRcdGhpbnQucGFkZGluZ0xlZnQgPSB0cnVlO1xuXHRcdFx0XHRoaW50LnBhZGRpbmdSaWdodCA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4gW2hpbnRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcklubGF5SGludHNQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbmxheUhpbnRzUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUlubGF5SGludHMoKSB7XG5cdFx0XHRcdGNvbnN0IGhpbnQgPSBuZXcgdHlwZXMuSW5sYXlIaW50KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAxKSwgJ0ZvbycsIHR5cGVzLklubGF5SGludEtpbmQuUGFyYW1ldGVyKTtcblx0XHRcdFx0aGludC50ZXh0RWRpdHMgPSBbdHlwZXMuVGV4dEVkaXQuaW5zZXJ0KG5ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgJ0hlbGxvJyldO1xuXHRcdFx0XHRyZXR1cm4gW2hpbnRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLklubGF5SGludFtdPigndnNjb2RlLmV4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDIwLCAyMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gdmFsdWU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmxhYmVsLCAnRm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnBvc2l0aW9uLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wb3NpdGlvbi5jaGFyYWN0ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC50ZXh0RWRpdHM/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnRleHRFZGl0c1swXS5uZXdUZXh0LCAnSGVsbG8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQucG9zaXRpb24ubGluZSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQucG9zaXRpb24uY2hhcmFjdGVyLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wYWRkaW5nTGVmdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5wYWRkaW5nUmlnaHQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLnRvb2x0aXAsICdoaW50X3Rvb2x0aXAnKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gKDx0eXBlcy5JbmxheUhpbnRMYWJlbFBhcnRbXT5zZWNvbmQubGFiZWwpWzBdO1xuXHRcdGFzc2VydFR5cGUobGFiZWwgaW5zdGFuY2VvZiB0eXBlcy5JbmxheUhpbnRMYWJlbFBhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbC52YWx1ZSwgJ0JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbC50b29sdGlwLCAncGFydF90b29sdGlwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsLmNvbW1hbmQ/LmNvbW1hbmQsICdjbWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFiZWwuY29tbWFuZD8udGl0bGUsICdwYXJ0Jyk7XG5cdH0pO1xuXG5cdHRlc3RBcGlDbWQoJ0lubGluZSBIaW50cywgYmFkIHByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcklubGF5SGludHNQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbmxheUhpbnRzUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUlubGF5SGludHMoKSB7XG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLklubGF5SGludChuZXcgdHlwZXMuUG9zaXRpb24oMCwgMSksICdGb28nKV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlcklubGF5SGludHNQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5JbmxheUhpbnRzUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZUlubGF5SGludHMoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLklubGF5SGludFtdPigndnNjb2RlLmV4ZWN1dGVJbmxheUhpbnRQcm92aWRlcicsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDIwLCAyMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5sYWJlbCwgJ0ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5wb3NpdGlvbi5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QucG9zaXRpb24uY2hhcmFjdGVyLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tIHNlbGVjdGlvbiByYW5nZXNcblxuXHR0ZXN0KCdTZWxlY3Rpb24gUmFuZ2UsIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMucHVzaChleHRIb3N0LnJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgPHZzY29kZS5TZWxlY3Rpb25SYW5nZVByb3ZpZGVyPntcblx0XHRcdHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoKSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IHR5cGVzLlNlbGVjdGlvblJhbmdlKG5ldyB0eXBlcy5SYW5nZSgwLCAxMCwgMCwgMTgpLCBuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKDAsIDIsIDAsIDIwKSkpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TZWxlY3Rpb25SYW5nZVtdPigndnNjb2RlLmV4ZWN1dGVTZWxlY3Rpb25SYW5nZVByb3ZpZGVyJywgbW9kZWwudXJpLCBbbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEwKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayh2YWx1ZVswXS5wYXJlbnQpO1xuXHR9KTtcblxuXHQvLyAtLS0gY2FsbCBoaWVyYXJjaHlcblxuXHR0ZXN0KCdDYWxsSGllcmFyY2h5LCBiYWNrIGFuZCBmb3J0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNhbGxIaWVyYXJjaHlQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNhbGxIaWVyYXJjaHlQcm92aWRlciB7XG5cblx0XHRcdHByZXBhcmVDYWxsSGllcmFyY2h5KGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LCBwb3NpdGlvbjogdnNjb2RlLlBvc2l0aW9uLCk6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5DYWxsSGllcmFyY2h5SXRlbSh0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50LCAnUk9PVCcsICdST09UJywgZG9jdW1lbnQudXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSk7XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVDYWxsSGllcmFyY2h5SW5jb21pbmdDYWxscyhpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxbXT4ge1xuXG5cdFx0XHRcdHJldHVybiBbbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwoXG5cdFx0XHRcdFx0bmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtKHR5cGVzLlN5bWJvbEtpbmQuQ29uc3RhbnQsICdJTkNPTUlORycsICdJTkNPTUlORycsIGl0ZW0udXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSksXG5cdFx0XHRcdFx0W25ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKV1cblx0XHRcdFx0KV07XG5cdFx0XHR9XG5cblx0XHRcdHByb3ZpZGVDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxscyhpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxbXT4ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5DYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsKFxuXHRcdFx0XHRcdG5ldyB0eXBlcy5DYWxsSGllcmFyY2h5SXRlbSh0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50LCAnT1VUR09JTkcnLCAnT1VUR09JTkcnLCBpdGVtLnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpLFxuXHRcdFx0XHRcdFtuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCldXG5cdFx0XHRcdCldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW1bXT4oJ3ZzY29kZS5wcmVwYXJlQ2FsbEhpZXJhcmNoeScsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKTtcblxuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJvb3QpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290WzBdLm5hbWUsICdST09UJyk7XG5cblx0XHRjb25zdCBpbmNvbWluZyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5DYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsW10+KCd2c2NvZGUucHJvdmlkZUluY29taW5nQ2FsbHMnLCByb290WzBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5jb21pbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5jb21pbmdbMF0uZnJvbS5uYW1lLCAnSU5DT01JTkcnKTtcblxuXHRcdGNvbnN0IG91dGdvaW5nID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxbXT4oJ3ZzY29kZS5wcm92aWRlT3V0Z29pbmdDYWxscycsIHJvb3RbMF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRnb2luZy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRnb2luZ1swXS50by5uYW1lLCAnT1VUR09JTkcnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlcGFyZUNhbGxIaWVyYXJjaHkgdGhyb3dzIFR5cGVFcnJvciBpZiBjbGFuZ2QgcmV0dXJucyBlbXB0eSByZXN1bHQgIzEzNzQxNScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlckNhbGxIaWVyYXJjaHlQcm92aWRlcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGRlZmF1bHRTZWxlY3RvciwgbmV3IGNsYXNzIGltcGxlbWVudHMgdnNjb2RlLkNhbGxIaWVyYXJjaHlQcm92aWRlciB7XG5cdFx0XHRwcmVwYXJlQ2FsbEhpZXJhcmNoeShkb2N1bWVudDogdnNjb2RlLlRleHREb2N1bWVudCwgcG9zaXRpb246IHZzY29kZS5Qb3NpdGlvbiwpOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtW10+IHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cHJvdmlkZUNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxzKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbFtdPiB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxscyhpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxbXT4ge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbVtdPigndnNjb2RlLnByZXBhcmVDYWxsSGllcmFyY2h5JywgbW9kZWwudXJpLCBuZXcgdHlwZXMuUG9zaXRpb24oMCwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkocm9vdCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdC8vIC0tLSB0eXBlIGhpZXJhcmNoeVxuXG5cdHRlc3QoJ1R5cGVIaWVyYXJjaHksIGJhY2sgYW5kIGZvcnRoJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJUeXBlSGllcmFyY2h5UHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIG5ldyBjbGFzcyBpbXBsZW1lbnRzIHZzY29kZS5UeXBlSGllcmFyY2h5UHJvdmlkZXIge1xuXHRcdFx0cHJlcGFyZVR5cGVIaWVyYXJjaHkoZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtW10+IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW0odHlwZXMuU3ltYm9sS2luZC5Db25zdGFudCwgJ1JPT1QnLCAnUk9PVCcsIGRvY3VtZW50LnVyaSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCkpXTtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVUeXBlSGllcmFyY2h5U3VwZXJ0eXBlcyhpdGVtOiB2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW0sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtW10+IHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgdHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW0odHlwZXMuU3ltYm9sS2luZC5Db25zdGFudCwgJ1NVUEVSJywgJ1NVUEVSJywgaXRlbS51cmksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSwgbmV3IHR5cGVzLlJhbmdlKDAsIDAsIDAsIDApKV07XG5cdFx0XHR9XG5cdFx0XHRwcm92aWRlVHlwZUhpZXJhcmNoeVN1YnR5cGVzKGl0ZW06IHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IHZzY29kZS5Qcm92aWRlclJlc3VsdDx2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW1bXT4ge1xuXHRcdFx0XHRyZXR1cm4gW25ldyB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbSh0eXBlcy5TeW1ib2xLaW5kLkNvbnN0YW50LCAnU1VCJywgJ1NVQicsIGl0ZW0udXJpLCBuZXcgdHlwZXMuUmFuZ2UoMCwgMCwgMCwgMCksIG5ldyB0eXBlcy5SYW5nZSgwLCAwLCAwLCAwKSldO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW1bXT4oJ3ZzY29kZS5wcmVwYXJlVHlwZUhpZXJhcmNoeScsIG1vZGVsLnVyaSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDApKTtcblxuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KHJvb3QpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290WzBdLm5hbWUsICdST09UJyk7XG5cblx0XHRjb25zdCBpbmNvbWluZyA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbVtdPigndnNjb2RlLnByb3ZpZGVTdXBlcnR5cGVzJywgcm9vdFswXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluY29taW5nLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluY29taW5nWzBdLm5hbWUsICdTVVBFUicpO1xuXG5cdFx0Y29uc3Qgb3V0Z29pbmcgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuVHlwZUhpZXJhcmNoeUl0ZW1bXT4oJ3ZzY29kZS5wcm92aWRlU3VidHlwZXMnLCByb290WzBdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0Z29pbmcubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0Z29pbmdbMF0ubmFtZSwgJ1NVQicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3Rpb25SYW5nZVByb3ZpZGVyIG9uIGlubmVyIGFycmF5IGFsd2F5cyByZXR1cm5zIG91dGVyIGFycmF5ICM5MTg1MicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGRpc3Bvc2FibGVzLnB1c2goZXh0SG9zdC5yZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCBkZWZhdWx0U2VsZWN0b3IsIDx2c2NvZGUuU2VsZWN0aW9uUmFuZ2VQcm92aWRlcj57XG5cdFx0XHRwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKF9kb2MsIHBvc2l0aW9ucykge1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gcG9zaXRpb25zO1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2UoZmlyc3QubGluZSwgZmlyc3QuY2hhcmFjdGVyLCBmaXJzdC5saW5lLCBmaXJzdC5jaGFyYWN0ZXIpKSxcblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBycGNQcm90b2NvbC5zeW5jKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBjb21tYW5kcy5leGVjdXRlQ29tbWFuZDx2c2NvZGUuU2VsZWN0aW9uUmFuZ2VbXT4oJ3ZzY29kZS5leGVjdXRlU2VsZWN0aW9uUmFuZ2VQcm92aWRlcicsIG1vZGVsLnVyaSwgW25ldyB0eXBlcy5Qb3NpdGlvbigwLCAxMCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0ucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzBdLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnbW9yZSBlbGVtZW50IHRlc3Qgb2Ygc2VsZWN0aW9uUmFuZ2VQcm92aWRlciBvbiBpbm5lciBhcnJheSBhbHdheXMgcmV0dXJucyBvdXRlciBhcnJheSAjOTE4NTInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKGV4dEhvc3QucmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmYXVsdFNlbGVjdG9yLCA8dnNjb2RlLlNlbGVjdGlvblJhbmdlUHJvdmlkZXI+e1xuXHRcdFx0cHJvdmlkZVNlbGVjdGlvblJhbmdlcyhfZG9jLCBwb3NpdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gcG9zaXRpb25zO1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyB0eXBlcy5TZWxlY3Rpb25SYW5nZShuZXcgdHlwZXMuUmFuZ2UoZmlyc3QubGluZSwgZmlyc3QuY2hhcmFjdGVyLCBmaXJzdC5saW5lLCBmaXJzdC5jaGFyYWN0ZXIpKSxcblx0XHRcdFx0XHRuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UobmV3IHR5cGVzLlJhbmdlKHNlY29uZC5saW5lLCBzZWNvbmQuY2hhcmFjdGVyLCBzZWNvbmQubGluZSwgc2Vjb25kLmNoYXJhY3RlcikpLFxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kPHZzY29kZS5TZWxlY3Rpb25SYW5nZVtdPihcblx0XHRcdCd2c2NvZGUuZXhlY3V0ZVNlbGVjdGlvblJhbmdlUHJvdmlkZXInLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0W25ldyB0eXBlcy5Qb3NpdGlvbigwLCAwKSwgbmV3IHR5cGVzLlBvc2l0aW9uKDAsIDEwKV1cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5zdGFydC5saW5lLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0ucmFuZ2Uuc3RhcnQuY2hhcmFjdGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMF0ucmFuZ2UuZW5kLmxpbmUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVswXS5yYW5nZS5lbmQuY2hhcmFjdGVyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVbMV0ucmFuZ2Uuc3RhcnQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzFdLnJhbmdlLnN0YXJ0LmNoYXJhY3RlciwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZVsxXS5yYW5nZS5lbmQubGluZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlWzFdLnJhbmdlLmVuZC5jaGFyYWN0ZXIsIDEwKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFFUCxPQUFPLFlBQVk7QUFDbkIsU0FBUywyQkFBMkIsb0JBQW9CO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLGFBQWE7QUFDdEIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsMEJBQTBCO0FBRW5DLE9BQU87QUFDUCxTQUFTLGFBQWEsc0JBQXNCO0FBRTVDLFNBQVMsMEJBQTBCLHlCQUF5QjtBQUM1RCxTQUFTLFNBQVMseUJBQXlCO0FBQzNDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsWUFBWTtBQUNyQixTQUFTLGlDQUFp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
