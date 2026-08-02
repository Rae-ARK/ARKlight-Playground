import assert from "assert";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { mock } from "../../../../base/test/common/mock.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { ExtHostNotebookController } from "../../common/extHostNotebook.js";
import { CellKind, CellUri, NotebookCellsChangeType } from "../../../contrib/notebook/common/notebookCommon.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Event } from "../../../../base/common/event.js";
import { ExtHostNotebookDocuments } from "../../common/extHostNotebookDocuments.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ExtHostConsumerFileSystem } from "../../common/extHostFileSystemConsumer.js";
import { ExtHostFileSystemInfo } from "../../common/extHostFileSystemInfo.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExtHostSearch } from "../../common/extHostSearch.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
suite("NotebookCell#Document", function() {
  let rpcProtocol;
  let notebook;
  let extHostDocumentsAndEditors;
  let extHostDocuments;
  let extHostNotebooks;
  let extHostNotebookDocuments;
  let extHostConsumerFileSystem;
  let extHostSearch;
  const notebookUri = URI.parse("test:///notebook.file");
  const disposables = new DisposableStore();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(async function() {
    rpcProtocol = new TestRPCProtocol();
    rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
      $registerCommand() {
      }
    }());
    rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock() {
      async $registerNotebookSerializer() {
      }
      async $unregisterNotebookSerializer() {
      }
    }());
    extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
    extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
    extHostConsumerFileSystem = new ExtHostConsumerFileSystem(rpcProtocol, new ExtHostFileSystemInfo());
    extHostSearch = new ExtHostSearch(rpcProtocol, new URITransformerService(null), new NullLogService());
    extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }()), extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, new NullLogService());
    extHostNotebookDocuments = new ExtHostNotebookDocuments(extHostNotebooks);
    const reg = extHostNotebooks.registerNotebookSerializer(nullExtensionDescription, "test", new class extends mock() {
    }());
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      addedDocuments: [{
        uri: notebookUri,
        viewType: "test",
        versionId: 0,
        cells: [{
          handle: 0,
          uri: CellUri.generate(notebookUri, 0),
          source: ["### Heading"],
          eol: "\n",
          language: "markdown",
          cellKind: CellKind.Markup,
          outputs: []
        }, {
          handle: 1,
          uri: CellUri.generate(notebookUri, 1),
          source: ['console.log("aaa")', 'console.log("bbb")'],
          eol: "\n",
          language: "javascript",
          cellKind: CellKind.Code,
          outputs: []
        }]
      }],
      addedEditors: [{
        documentUri: notebookUri,
        id: "_notebook_editor_0",
        selections: [{ start: 0, end: 1 }],
        visibleRanges: [],
        viewType: "test"
      }]
    }));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: "_notebook_editor_0" }));
    notebook = extHostNotebooks.notebookDocuments[0];
    disposables.add(reg);
    disposables.add(notebook);
    disposables.add(extHostDocuments);
  });
  test("cell document is vscode.TextDocument", async function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [c1, c2] = notebook.apiNotebook.getCells();
    const d1 = extHostDocuments.getDocument(c1.document.uri);
    assert.ok(d1);
    assert.strictEqual(d1.languageId, c1.document.languageId);
    assert.strictEqual(d1.version, 1);
    const d2 = extHostDocuments.getDocument(c2.document.uri);
    assert.ok(d2);
    assert.strictEqual(d2.languageId, c2.document.languageId);
    assert.strictEqual(d2.version, 1);
  });
  test("cell document goes when notebook closes", async function() {
    const cellUris = [];
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.ok(extHostDocuments.getDocument(cell.document.uri));
      cellUris.push(cell.document.uri.toString());
    }
    const removedCellUris = [];
    const reg = extHostDocuments.onDidRemoveDocument((doc) => {
      removedCellUris.push(doc.uri.toString());
    });
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
    reg.dispose();
    assert.strictEqual(removedCellUris.length, 2);
    assert.deepStrictEqual(removedCellUris.sort(), cellUris.sort());
  });
  test("cell document is vscode.TextDocument after changing it", async function() {
    const p = new Promise((resolve, reject) => {
      disposables.add(extHostNotebookDocuments.onDidChangeNotebookDocument((e) => {
        try {
          assert.strictEqual(e.contentChanges.length, 1);
          assert.strictEqual(e.contentChanges[0].addedCells.length, 2);
          const [first, second] = e.contentChanges[0].addedCells;
          const doc1 = extHostDocuments.getAllDocumentData().find((data) => isEqual(data.document.uri, first.document.uri));
          assert.ok(doc1);
          assert.strictEqual(doc1?.document === first.document, true);
          const doc2 = extHostDocuments.getAllDocumentData().find((data) => isEqual(data.document.uri, second.document.uri));
          assert.ok(doc2);
          assert.strictEqual(doc2?.document === second.document, true);
          resolve();
        } catch (err) {
          reject(err);
        }
      }));
    });
    extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [
        {
          kind: NotebookCellsChangeType.ModelChange,
          changes: [[0, 0, [{
            handle: 2,
            uri: CellUri.generate(notebookUri, 2),
            source: ["Hello", "World", "Hello World!"],
            eol: "\n",
            language: "test",
            cellKind: CellKind.Code,
            outputs: []
          }, {
            handle: 3,
            uri: CellUri.generate(notebookUri, 3),
            source: ["Hallo", "Welt", "Hallo Welt!"],
            eol: "\n",
            language: "test",
            cellKind: CellKind.Code,
            outputs: []
          }]]]
        }
      ]
    }), false);
    await p;
  });
  test("cell document stays open when notebook is still open", async function() {
    const docs = [];
    const addData = [];
    for (const cell of notebook.apiNotebook.getCells()) {
      const doc = extHostDocuments.getDocument(cell.document.uri);
      assert.ok(doc);
      assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
      docs.push(doc);
      addData.push({
        EOL: "\n",
        isDirty: doc.isDirty,
        lines: doc.getText().split("\n"),
        languageId: doc.languageId,
        uri: doc.uri,
        versionId: doc.version,
        encoding: "utf8"
      });
    }
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addData });
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: docs.map((d) => d.uri) });
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.ok(extHostDocuments.getDocument(cell.document.uri));
      assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
    }
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.throws(() => extHostDocuments.getDocument(cell.document.uri));
    }
    for (const doc of docs) {
      assert.strictEqual(doc.isClosed, true);
    }
  });
  test("cell document goes when cell is removed", async function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [cell1, cell2] = notebook.apiNotebook.getCells();
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 2,
      rawEvents: [
        {
          kind: NotebookCellsChangeType.ModelChange,
          changes: [[0, 1, []]]
        }
      ]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 1);
    assert.strictEqual(cell1.document.isClosed, true);
    assert.strictEqual(cell2.document.isClosed, false);
    assert.throws(() => extHostDocuments.getDocument(cell1.document.uri));
  });
  test("cell#index", function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [first, second] = notebook.apiNotebook.getCells();
    assert.strictEqual(first.index, 0);
    assert.strictEqual(second.index, 1);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 1, []]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 1);
    assert.strictEqual(second.index, 0);
    extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 0, [{
          handle: 2,
          uri: CellUri.generate(notebookUri, 2),
          source: ["Hello", "World", "Hello World!"],
          eol: "\n",
          language: "test",
          cellKind: CellKind.Code,
          outputs: []
        }, {
          handle: 3,
          uri: CellUri.generate(notebookUri, 3),
          source: ["Hallo", "Welt", "Hallo Welt!"],
          eol: "\n",
          language: "test",
          cellKind: CellKind.Code,
          outputs: []
        }]]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 3);
    assert.strictEqual(second.index, 2);
  });
  test("ERR MISSING extHostDocument for notebook cell: #116711", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 100,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 2, [{
          handle: 3,
          uri: CellUri.generate(notebookUri, 3),
          source: ["### Heading"],
          eol: "\n",
          language: "markdown",
          cellKind: CellKind.Markup,
          outputs: []
        }, {
          handle: 4,
          uri: CellUri.generate(notebookUri, 4),
          source: ['console.log("aaa")', 'console.log("bbb")'],
          eol: "\n",
          language: "javascript",
          cellKind: CellKind.Code,
          outputs: []
        }]]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 1);
    assert.strictEqual(event.contentChanges[0].range.end - event.contentChanges[0].range.start, 2);
    assert.strictEqual(event.contentChanges[0].removedCells[0].document.isClosed, true);
    assert.strictEqual(event.contentChanges[0].removedCells[1].document.isClosed, true);
    assert.strictEqual(event.contentChanges[0].addedCells.length, 2);
    assert.strictEqual(event.contentChanges[0].addedCells[0].document.isClosed, false);
    assert.strictEqual(event.contentChanges[0].addedCells[1].document.isClosed, false);
  });
  test("Opening a notebook results in VS Code firing the event onDidChangeActiveNotebookEditor twice #118470", function() {
    let count = 0;
    disposables.add(extHostNotebooks.onDidChangeActiveNotebookEditor(() => count += 1));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      addedEditors: [{
        documentUri: notebookUri,
        id: "_notebook_editor_2",
        selections: [{ start: 0, end: 1 }],
        visibleRanges: [],
        viewType: "test"
      }]
    }));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      newActiveEditor: "_notebook_editor_2"
    }));
    assert.strictEqual(count, 1);
  });
  test("unset active notebook editor", function() {
    const editor = extHostNotebooks.activeNotebookEditor;
    assert.ok(editor !== void 0);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: void 0 }));
    assert.ok(extHostNotebooks.activeNotebookEditor === editor);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({}));
    assert.ok(extHostNotebooks.activeNotebookEditor === editor);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: null }));
    assert.ok(extHostNotebooks.activeNotebookEditor === void 0);
  });
  test("change cell language triggers onDidChange events", async function() {
    const first = notebook.apiNotebook.cellAt(0);
    assert.strictEqual(first.document.languageId, "markdown");
    const removed = Event.toPromise(extHostDocuments.onDidRemoveDocument);
    const added = Event.toPromise(extHostDocuments.onDidAddDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellLanguage,
        index: 0,
        language: "fooLang"
      }]
    }), false);
    const removedDoc = await removed;
    const addedDoc = await added;
    assert.strictEqual(first.document.languageId, "fooLang");
    assert.ok(removedDoc === addedDoc);
  });
  test("onDidChangeNotebook-event, cell changes", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellMetadata,
        index: 0,
        metadata: { foo: 1 }
      }, {
        kind: NotebookCellsChangeType.ChangeCellMetadata,
        index: 1,
        metadata: { foo: 2 }
      }, {
        kind: NotebookCellsChangeType.Output,
        index: 1,
        outputs: [
          {
            items: [{
              valueBytes: VSBuffer.fromByteArray([0, 2, 3]),
              mime: "text/plain"
            }],
            outputId: "1"
          }
        ]
      }]
    }), false, void 0);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 2);
    const [first, second] = event.cellChanges;
    assert.deepStrictEqual(first.metadata, first.cell.metadata);
    assert.deepStrictEqual(first.executionSummary, void 0);
    assert.deepStrictEqual(first.outputs, void 0);
    assert.deepStrictEqual(first.document, void 0);
    assert.deepStrictEqual(second.outputs, second.cell.outputs);
    assert.deepStrictEqual(second.metadata, second.cell.metadata);
    assert.deepStrictEqual(second.executionSummary, void 0);
    assert.deepStrictEqual(second.document, void 0);
  });
  test("onDidChangeNotebook-event, notebook metadata", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 0);
    assert.deepStrictEqual(event.metadata, { foo: 2 });
  });
  test("onDidChangeNotebook-event, froozen data", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });
    const event = await p;
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.cellChanges));
    assert.ok(Object.isFrozen(event.contentChanges));
    assert.ok(Object.isFrozen(event.notebook));
    assert.ok(!Object.isFrozen(event.metadata));
  });
  test("change cell language and onDidChangeNotebookDocument", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    const first = notebook.apiNotebook.cellAt(0);
    assert.strictEqual(first.document.languageId, "markdown");
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellLanguage,
        index: 0,
        language: "fooLang"
      }]
    }), false);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 1);
    const [cellChange] = event.cellChanges;
    assert.strictEqual(cellChange.cell === first, true);
    assert.ok(cellChange.document === first.document);
    assert.ok(cellChange.executionSummary === void 0);
    assert.ok(cellChange.metadata === void 0);
    assert.ok(cellChange.outputs === void 0);
  });
  test("change notebook cell document and onDidChangeNotebookDocument", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    const first = notebook.apiNotebook.cellAt(0);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellContent,
        index: 0
      }]
    }), false);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 1);
    const [cellChange] = event.cellChanges;
    assert.strictEqual(cellChange.cell === first, true);
    assert.ok(cellChange.document === first.document);
    assert.ok(cellChange.executionSummary === void 0);
    assert.ok(cellChange.metadata === void 0);
    assert.ok(cellChange.outputs === void 0);
  });
  async function replaceOutputs(cellIndex, outputId, outputItems) {
    const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.Output,
        index: cellIndex,
        outputs: [{ outputId, items: outputItems }]
      }]
    }), false);
    await changeEvent;
  }
  async function appendOutputItem(cellIndex, outputId, outputItems) {
    const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.OutputItem,
        index: cellIndex,
        append: true,
        outputId,
        outputItems
      }]
    }), false);
    await changeEvent;
  }
  test("Append multiple text/plain output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foo");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[1].data).toString(), "bar");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[2].data).toString(), "baz");
  });
  test("Append multiple stdout stream output items to an output with another mime", async function() {
    await replaceOutputs(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "text/plain");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, "application/vnd.code.notebook.stdout");
  });
  test("Compress multiple stdout stream output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foobarbaz");
  });
  test("Compress multiple stdout stream output items (with support for terminal escape code -> \x1B[A)", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("\nfoo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString(`${String.fromCharCode(27)}[Abar`) }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "bar");
  });
  test("Compress multiple stdout stream output items (with support for terminal escape code -> \r character)", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString(`\rbar`) }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "bar");
  });
  test("Compress multiple stderr stream output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stderr");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foobarbaz");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3ROb3RlYm9vay50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBUZXN0UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSU1vZGVsQWRkZWREYXRhLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENvbW1hbmRzU2hhcGUsIE1haW5UaHJlYWROb3RlYm9va1NoYXBlLCBOb3RlYm9va0NlbGxzQ2hhbmdlZEV2ZW50RHRvLCBOb3RlYm9va091dHB1dEl0ZW1EdG8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3ROb3RlYm9vay5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Tm90ZWJvb2tEb2N1bWVudC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgQ2VsbFVyaSwgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1Db25zdW1lci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEZpbGVTeXN0ZW1JbmZvLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFNlYXJjaCB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0U2VhcmNoLmpzJztcbmltcG9ydCB7IFVSSVRyYW5zZm9ybWVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ05vdGVib29rQ2VsbCNEb2N1bWVudCcsIGZ1bmN0aW9uICgpIHtcblx0bGV0IHJwY1Byb3RvY29sOiBUZXN0UlBDUHJvdG9jb2w7XG5cdGxldCBub3RlYm9vazogRXh0SG9zdE5vdGVib29rRG9jdW1lbnQ7XG5cdGxldCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9yczogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnM7XG5cdGxldCBleHRIb3N0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzO1xuXHRsZXQgZXh0SG9zdE5vdGVib29rczogRXh0SG9zdE5vdGVib29rQ29udHJvbGxlcjtcblx0bGV0IGV4dEhvc3ROb3RlYm9va0RvY3VtZW50czogRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzO1xuXHRsZXQgZXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbTogRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbTtcblx0bGV0IGV4dEhvc3RTZWFyY2g6IEV4dEhvc3RTZWFyY2g7XG5cblx0Y29uc3Qgbm90ZWJvb2tVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vbm90ZWJvb2suZmlsZScpO1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJwY1Byb3RvY29sID0gbmV3IFRlc3RSUENQcm90b2NvbCgpO1xuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkQ29tbWFuZHMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbW1hbmRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHJlZ2lzdGVyQ29tbWFuZCgpIHsgfVxuXHRcdH0pO1xuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkTm90ZWJvb2ssIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZE5vdGVib29rU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgJHJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKCkgeyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyAkdW5yZWdpc3Rlck5vdGVib29rU2VyaWFsaXplcigpIHsgfVxuXHRcdH0pO1xuXHRcdGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZXh0SG9zdERvY3VtZW50cyA9IG5ldyBFeHRIb3N0RG9jdW1lbnRzKHJwY1Byb3RvY29sLCBleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyk7XG5cdFx0ZXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSA9IG5ldyBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtKHJwY1Byb3RvY29sLCBuZXcgRXh0SG9zdEZpbGVTeXN0ZW1JbmZvKCkpO1xuXHRcdGV4dEhvc3RTZWFyY2ggPSBuZXcgRXh0SG9zdFNlYXJjaChycGNQcm90b2NvbCwgbmV3IFVSSVRyYW5zZm9ybWVyU2VydmljZShudWxsKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGV4dEhvc3ROb3RlYm9va3MgPSBuZXcgRXh0SG9zdE5vdGVib29rQ29udHJvbGxlcihycGNQcm90b2NvbCwgbmV3IEV4dEhvc3RDb21tYW5kcyhycGNQcm90b2NvbCwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSksIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLCBleHRIb3N0RG9jdW1lbnRzLCBleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtLCBleHRIb3N0U2VhcmNoLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzID0gbmV3IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50cyhleHRIb3N0Tm90ZWJvb2tzKTtcblxuXHRcdGNvbnN0IHJlZyA9IGV4dEhvc3ROb3RlYm9va3MucmVnaXN0ZXJOb3RlYm9va1NlcmlhbGl6ZXIobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLCAndGVzdCcsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8dnNjb2RlLk5vdGVib29rU2VyaWFsaXplcj4oKSB7IH0pO1xuXHRcdGV4dEhvc3ROb3RlYm9va3MuJGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogW3tcblx0XHRcdFx0dXJpOiBub3RlYm9va1VyaSxcblx0XHRcdFx0dmlld1R5cGU6ICd0ZXN0Jyxcblx0XHRcdFx0dmVyc2lvbklkOiAwLFxuXHRcdFx0XHRjZWxsczogW3tcblx0XHRcdFx0XHRoYW5kbGU6IDAsXG5cdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCAwKSxcblx0XHRcdFx0XHRzb3VyY2U6IFsnIyMjIEhlYWRpbmcnXSxcblx0XHRcdFx0XHRlb2w6ICdcXG4nLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnbWFya2Rvd24nLFxuXHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsXG5cdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRoYW5kbGU6IDEsXG5cdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCAxKSxcblx0XHRcdFx0XHRzb3VyY2U6IFsnY29uc29sZS5sb2coXCJhYWFcIiknLCAnY29uc29sZS5sb2coXCJiYmJcIiknXSxcblx0XHRcdFx0XHRlb2w6ICdcXG4nLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsXG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV0sXG5cdFx0XHRhZGRlZEVkaXRvcnM6IFt7XG5cdFx0XHRcdGRvY3VtZW50VXJpOiBub3RlYm9va1VyaSxcblx0XHRcdFx0aWQ6ICdfbm90ZWJvb2tfZWRpdG9yXzAnLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAxIH1dLFxuXHRcdFx0XHR2aXNpYmxlUmFuZ2VzOiBbXSxcblx0XHRcdFx0dmlld1R5cGU6ICd0ZXN0J1xuXHRcdFx0fV1cblx0XHR9KSk7XG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgbmV3QWN0aXZlRWRpdG9yOiAnX25vdGVib29rX2VkaXRvcl8wJyB9KSk7XG5cblx0XHRub3RlYm9vayA9IGV4dEhvc3ROb3RlYm9va3Mubm90ZWJvb2tEb2N1bWVudHNbMF0hO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5vdGVib29rKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdERvY3VtZW50cyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnY2VsbCBkb2N1bWVudCBpcyB2c2NvZGUuVGV4dERvY3VtZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxDb3VudCwgMik7XG5cblx0XHRjb25zdCBbYzEsIGMyXSA9IG5vdGVib29rLmFwaU5vdGVib29rLmdldENlbGxzKCk7XG5cdFx0Y29uc3QgZDEgPSBleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KGMxLmRvY3VtZW50LnVyaSk7XG5cblx0XHRhc3NlcnQub2soZDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkMS5sYW5ndWFnZUlkLCBjMS5kb2N1bWVudC5sYW5ndWFnZUlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZDEudmVyc2lvbiwgMSk7XG5cblx0XHRjb25zdCBkMiA9IGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoYzIuZG9jdW1lbnQudXJpKTtcblx0XHRhc3NlcnQub2soZDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkMi5sYW5ndWFnZUlkLCBjMi5kb2N1bWVudC5sYW5ndWFnZUlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZDIudmVyc2lvbiwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NlbGwgZG9jdW1lbnQgZ29lcyB3aGVuIG5vdGVib29rIGNsb3NlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjZWxsVXJpczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygbm90ZWJvb2suYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbC5kb2N1bWVudC51cmkpKTtcblx0XHRcdGNlbGxVcmlzLnB1c2goY2VsbC5kb2N1bWVudC51cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3ZlZENlbGxVcmlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlZyA9IGV4dEhvc3REb2N1bWVudHMub25EaWRSZW1vdmVEb2N1bWVudChkb2MgPT4ge1xuXHRcdFx0cmVtb3ZlZENlbGxVcmlzLnB1c2goZG9jLnVyaS50b1N0cmluZygpKTtcblx0XHR9KTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va3MuJGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IHJlbW92ZWREb2N1bWVudHM6IFtub3RlYm9vay51cmldIH0pKTtcblx0XHRyZWcuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZWRDZWxsVXJpcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlZENlbGxVcmlzLnNvcnQoKSwgY2VsbFVyaXMuc29ydCgpKTtcblx0fSk7XG5cblx0dGVzdCgnY2VsbCBkb2N1bWVudCBpcyB2c2NvZGUuVGV4dERvY3VtZW50IGFmdGVyIGNoYW5naW5nIGl0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQoZSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUuY29udGVudENoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jb250ZW50Q2hhbmdlc1swXS5hZGRlZENlbGxzLmxlbmd0aCwgMik7XG5cblx0XHRcdFx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBlLmNvbnRlbnRDaGFuZ2VzWzBdLmFkZGVkQ2VsbHM7XG5cblx0XHRcdFx0XHRjb25zdCBkb2MxID0gZXh0SG9zdERvY3VtZW50cy5nZXRBbGxEb2N1bWVudERhdGEoKS5maW5kKGRhdGEgPT4gaXNFcXVhbChkYXRhLmRvY3VtZW50LnVyaSwgZmlyc3QuZG9jdW1lbnQudXJpKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGRvYzEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2MxPy5kb2N1bWVudCA9PT0gZmlyc3QuZG9jdW1lbnQsIHRydWUpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZG9jMiA9IGV4dEhvc3REb2N1bWVudHMuZ2V0QWxsRG9jdW1lbnREYXRhKCkuZmluZChkYXRhID0+IGlzRXF1YWwoZGF0YS5kb2N1bWVudC51cmksIHNlY29uZC5kb2N1bWVudC51cmkpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZG9jMik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvYzI/LmRvY3VtZW50ID09PSBzZWNvbmQuZG9jdW1lbnQsIHRydWUpO1xuXG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHR9KTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rVXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiBub3RlYm9vay5hcGlOb3RlYm9vay52ZXJzaW9uICsgMSxcblx0XHRcdHJhd0V2ZW50czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsXG5cdFx0XHRcdFx0Y2hhbmdlczogW1swLCAwLCBbe1xuXHRcdFx0XHRcdFx0aGFuZGxlOiAyLFxuXHRcdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCAyKSxcblx0XHRcdFx0XHRcdHNvdXJjZTogWydIZWxsbycsICdXb3JsZCcsICdIZWxsbyBXb3JsZCEnXSxcblx0XHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3Rlc3QnLFxuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRoYW5kbGU6IDMsXG5cdFx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDMpLFxuXHRcdFx0XHRcdFx0c291cmNlOiBbJ0hhbGxvJywgJ1dlbHQnLCAnSGFsbG8gV2VsdCEnXSxcblx0XHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZTogJ3Rlc3QnLFxuXHRcdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHR9XV1dXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KSwgZmFsc2UpO1xuXG5cdFx0YXdhaXQgcDtcblxuXHR9KTtcblxuXHR0ZXN0KCdjZWxsIGRvY3VtZW50IHN0YXlzIG9wZW4gd2hlbiBub3RlYm9vayBpcyBzdGlsbCBvcGVuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZG9jczogdnNjb2RlLlRleHREb2N1bWVudFtdID0gW107XG5cdFx0Y29uc3QgYWRkRGF0YTogSU1vZGVsQWRkZWREYXRhW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygbm90ZWJvb2suYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKSkge1xuXHRcdFx0Y29uc3QgZG9jID0gZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChjZWxsLmRvY3VtZW50LnVyaSk7XG5cdFx0XHRhc3NlcnQub2soZG9jKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KGNlbGwuZG9jdW1lbnQudXJpKS5pc0Nsb3NlZCwgZmFsc2UpO1xuXHRcdFx0ZG9jcy5wdXNoKGRvYyk7XG5cdFx0XHRhZGREYXRhLnB1c2goe1xuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRpc0RpcnR5OiBkb2MuaXNEaXJ0eSxcblx0XHRcdFx0bGluZXM6IGRvYy5nZXRUZXh0KCkuc3BsaXQoJ1xcbicpLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBkb2MubGFuZ3VhZ2VJZCxcblx0XHRcdFx0dXJpOiBkb2MudXJpLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IGRvYy52ZXJzaW9uLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyB0aGlzIGNhbGwgaGFwcGVucyB3aGVuIG9wZW5pbmcgYSBkb2N1bWVudCBvbiB0aGUgbWFpbiBzaWRlXG5cdFx0ZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7IGFkZGVkRG9jdW1lbnRzOiBhZGREYXRhIH0pO1xuXG5cdFx0Ly8gdGhpcyBjYWxsIGhhcHBlbnMgd2hlbiBjbG9zaW5nIGEgZG9jdW1lbnQgZnJvbSB0aGUgbWFpbiBzaWRlXG5cdFx0ZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7IHJlbW92ZWREb2N1bWVudHM6IGRvY3MubWFwKGQgPT4gZC51cmkpIH0pO1xuXG5cdFx0Ly8gbm90ZWJvb2sgaXMgc3RpbGwgb3BlbiAtPiBjZWxsIGRvY3VtZW50cyBzdGF5IG9wZW5cblx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygbm90ZWJvb2suYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbC5kb2N1bWVudC51cmkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KGNlbGwuZG9jdW1lbnQudXJpKS5pc0Nsb3NlZCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdC8vIGNsb3NlIG5vdGVib29rIC0+IGRvY3MgYXJlIGNsb3NlZFxuXHRcdGV4dEhvc3ROb3RlYm9va3MuJGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IHJlbW92ZWREb2N1bWVudHM6IFtub3RlYm9vay51cmldIH0pKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2Ygbm90ZWJvb2suYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKSkge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KGNlbGwuZG9jdW1lbnQudXJpKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZG9jIG9mIGRvY3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2MuaXNDbG9zZWQsIHRydWUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY2VsbCBkb2N1bWVudCBnb2VzIHdoZW4gY2VsbCBpcyByZW1vdmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxDb3VudCwgMik7XG5cdFx0Y29uc3QgW2NlbGwxLCBjZWxsMl0gPSBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiAyLFxuXHRcdFx0cmF3RXZlbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBbWzAsIDEsIFtdXV1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbDEuZG9jdW1lbnQuaXNDbG9zZWQsIHRydWUpOyAvLyByZWYgc3RpbGwgYWxpdmUhXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGwyLmRvY3VtZW50LmlzQ2xvc2VkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbDEuZG9jdW1lbnQudXJpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NlbGwjaW5kZXgnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbENvdW50LCAyKTtcblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5pbmRleCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5pbmRleCwgMSk7XG5cblx0XHQvLyByZW1vdmUgZmlyc3QgY2VsbFxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rLnVyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdHZlcnNpb25JZDogbm90ZWJvb2suYXBpTm90ZWJvb2sudmVyc2lvbiArIDEsXG5cdFx0XHRyYXdFdmVudHM6IFt7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlLFxuXHRcdFx0XHRjaGFuZ2VzOiBbWzAsIDEsIFtdXV1cblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQuaW5kZXgsIDApO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2tVcmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IG5vdGVib29rLmFwaU5vdGVib29rLnZlcnNpb24gKyAxLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSxcblx0XHRcdFx0Y2hhbmdlczogW1swLCAwLCBbe1xuXHRcdFx0XHRcdGhhbmRsZTogMixcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDIpLFxuXHRcdFx0XHRcdHNvdXJjZTogWydIZWxsbycsICdXb3JsZCcsICdIZWxsbyBXb3JsZCEnXSxcblx0XHRcdFx0XHRlb2w6ICdcXG4nLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAndGVzdCcsXG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRoYW5kbGU6IDMsXG5cdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCAzKSxcblx0XHRcdFx0XHRzb3VyY2U6IFsnSGFsbG8nLCAnV2VsdCcsICdIYWxsbyBXZWx0ISddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICd0ZXN0Jyxcblx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fV1dXVxuXHRcdFx0fV1cblx0XHR9KSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxDb3VudCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5pbmRleCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ0VSUiBNSVNTSU5HIGV4dEhvc3REb2N1bWVudCBmb3Igbm90ZWJvb2sgY2VsbDogIzExNjcxMScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHAgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHQvLyBET04nVCBjYWxsIHRoaXMsIG1ha2Ugc3VyZSB0aGUgY2VsbC1kb2N1bWVudHMgaGF2ZSBub3QgYmVlbiBjcmVhdGVkIHlldFxuXHRcdC8vIGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5ub3RlYm9va0RvY3VtZW50LmNlbGxDb3VudCwgMik7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IDEwMCxcblx0XHRcdHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsXG5cdFx0XHRcdGNoYW5nZXM6IFtbMCwgMiwgW3tcblx0XHRcdFx0XHRoYW5kbGU6IDMsXG5cdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCAzKSxcblx0XHRcdFx0XHRzb3VyY2U6IFsnIyMjIEhlYWRpbmcnXSxcblx0XHRcdFx0XHRlb2w6ICdcXG4nLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnbWFya2Rvd24nLFxuXHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsXG5cdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRoYW5kbGU6IDQsXG5cdFx0XHRcdFx0dXJpOiBDZWxsVXJpLmdlbmVyYXRlKG5vdGVib29rVXJpLCA0KSxcblx0XHRcdFx0XHRzb3VyY2U6IFsnY29uc29sZS5sb2coXCJhYWFcIiknLCAnY29uc29sZS5sb2coXCJiYmJcIiknXSxcblx0XHRcdFx0XHRlb2w6ICdcXG4nLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsXG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsXG5cdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdH1dXV1cblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQ291bnQsIDIpO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBhd2FpdCBwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Lm5vdGVib29rID09PSBub3RlYm9vay5hcGlOb3RlYm9vaywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzWzBdLnJhbmdlLmVuZCAtIGV2ZW50LmNvbnRlbnRDaGFuZ2VzWzBdLnJhbmdlLnN0YXJ0LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXNbMF0ucmVtb3ZlZENlbGxzWzBdLmRvY3VtZW50LmlzQ2xvc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXNbMF0ucmVtb3ZlZENlbGxzWzFdLmRvY3VtZW50LmlzQ2xvc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXNbMF0uYWRkZWRDZWxscy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlc1swXS5hZGRlZENlbGxzWzBdLmRvY3VtZW50LmlzQ2xvc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzWzBdLmFkZGVkQ2VsbHNbMV0uZG9jdW1lbnQuaXNDbG9zZWQsIGZhbHNlKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdPcGVuaW5nIGEgbm90ZWJvb2sgcmVzdWx0cyBpbiBWUyBDb2RlIGZpcmluZyB0aGUgZXZlbnQgb25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvciB0d2ljZSAjMTE4NDcwJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGV4dEhvc3ROb3RlYm9va3Mub25EaWRDaGFuZ2VBY3RpdmVOb3RlYm9va0VkaXRvcigoKSA9PiBjb3VudCArPSAxKSk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0YWRkZWRFZGl0b3JzOiBbe1xuXHRcdFx0XHRkb2N1bWVudFVyaTogbm90ZWJvb2tVcmksXG5cdFx0XHRcdGlkOiAnX25vdGVib29rX2VkaXRvcl8yJyxcblx0XHRcdFx0c2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSxcblx0XHRcdFx0dmlzaWJsZVJhbmdlczogW10sXG5cdFx0XHRcdHZpZXdUeXBlOiAndGVzdCdcblx0XHRcdH1dXG5cdFx0fSkpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdG5ld0FjdGl2ZUVkaXRvcjogJ19ub3RlYm9va19lZGl0b3JfMidcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNldCBhY3RpdmUgbm90ZWJvb2sgZWRpdG9yJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZXh0SG9zdE5vdGVib29rcy5hY3RpdmVOb3RlYm9va0VkaXRvcjtcblx0XHRhc3NlcnQub2soZWRpdG9yICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgbmV3QWN0aXZlRWRpdG9yOiB1bmRlZmluZWQgfSkpO1xuXHRcdGFzc2VydC5vayhleHRIb3N0Tm90ZWJvb2tzLmFjdGl2ZU5vdGVib29rRWRpdG9yID09PSBlZGl0b3IpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHt9KSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dEhvc3ROb3RlYm9va3MuYWN0aXZlTm90ZWJvb2tFZGl0b3IgPT09IGVkaXRvcik7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBuZXdBY3RpdmVFZGl0b3I6IG51bGwgfSkpO1xuXHRcdGFzc2VydC5vayhleHRIb3N0Tm90ZWJvb2tzLmFjdGl2ZU5vdGVib29rRWRpdG9yID09PSB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2UgY2VsbCBsYW5ndWFnZSB0cmlnZ2VycyBvbkRpZENoYW5nZSBldmVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBmaXJzdCA9IG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5kb2N1bWVudC5sYW5ndWFnZUlkLCAnbWFya2Rvd24nKTtcblxuXHRcdGNvbnN0IHJlbW92ZWQgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdERvY3VtZW50cy5vbkRpZFJlbW92ZURvY3VtZW50KTtcblx0XHRjb25zdCBhZGRlZCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0RG9jdW1lbnRzLm9uRGlkQWRkRG9jdW1lbnQpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiAxMiwgcmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UsXG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Zvb0xhbmcnXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZW1vdmVkRG9jID0gYXdhaXQgcmVtb3ZlZDtcblx0XHRjb25zdCBhZGRlZERvYyA9IGF3YWl0IGFkZGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmRvY3VtZW50Lmxhbmd1YWdlSWQsICdmb29MYW5nJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlbW92ZWREb2MgPT09IGFkZGVkRG9jKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VOb3RlYm9vay1ldmVudCwgY2VsbCBjaGFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rLnVyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdHZlcnNpb25JZDogMTIsIHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1ldGFkYXRhLFxuXHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0bWV0YWRhdGE6IHsgZm9vOiAxIH1cblx0XHRcdH0sIHtcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbE1ldGFkYXRhLFxuXHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0bWV0YWRhdGE6IHsgZm9vOiAyIH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dCxcblx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdG91dHB1dHM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRcdFx0dmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbUJ5dGVBcnJheShbMCwgMiwgM10pLFxuXHRcdFx0XHRcdFx0XHRtaW1lOiAndGV4dC9wbGFpbidcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICcxJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fV1cblx0XHR9KSwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cblxuXHRcdGNvbnN0IGV2ZW50ID0gYXdhaXQgcDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5ub3RlYm9vayA9PT0gbm90ZWJvb2suYXBpTm90ZWJvb2ssIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jZWxsQ2hhbmdlcy5sZW5ndGgsIDIpO1xuXG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gZXZlbnQuY2VsbENoYW5nZXM7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5tZXRhZGF0YSwgZmlyc3QuY2VsbC5tZXRhZGF0YSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5leGVjdXRpb25TdW1tYXJ5LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3Qub3V0cHV0cywgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LmRvY3VtZW50LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQub3V0cHV0cywgc2Vjb25kLmNlbGwub3V0cHV0cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQubWV0YWRhdGEsIHNlY29uZC5jZWxsLm1ldGFkYXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZC5leGVjdXRpb25TdW1tYXJ5LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kLmRvY3VtZW50LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZU5vdGVib29rLWV2ZW50LCBub3RlYm9vayBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHAgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IHZlcnNpb25JZDogMTIsIHJhd0V2ZW50czogW10gfSksIGZhbHNlLCB7IGZvbzogMiB9KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gYXdhaXQgcDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5ub3RlYm9vayA9PT0gbm90ZWJvb2suYXBpTm90ZWJvb2ssIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jZWxsQ2hhbmdlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnQubWV0YWRhdGEsIHsgZm9vOiAyIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZU5vdGVib29rLWV2ZW50LCBmcm9vemVuIGRhdGEnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwID0gRXZlbnQudG9Qcm9taXNlKGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyB2ZXJzaW9uSWQ6IDEyLCByYXdFdmVudHM6IFtdIH0pLCBmYWxzZSwgeyBmb286IDIgfSk7XG5cblx0XHRjb25zdCBldmVudCA9IGF3YWl0IHA7XG5cblx0XHRhc3NlcnQub2soT2JqZWN0LmlzRnJvemVuKGV2ZW50KSk7XG5cdFx0YXNzZXJ0Lm9rKE9iamVjdC5pc0Zyb3plbihldmVudC5jZWxsQ2hhbmdlcykpO1xuXHRcdGFzc2VydC5vayhPYmplY3QuaXNGcm96ZW4oZXZlbnQuY29udGVudENoYW5nZXMpKTtcblx0XHRhc3NlcnQub2soT2JqZWN0LmlzRnJvemVuKGV2ZW50Lm5vdGVib29rKSk7XG5cdFx0YXNzZXJ0Lm9rKCFPYmplY3QuaXNGcm96ZW4oZXZlbnQubWV0YWRhdGEpKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlIGNlbGwgbGFuZ3VhZ2UgYW5kIG9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHAgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRjb25zdCBmaXJzdCA9IG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuZG9jdW1lbnQubGFuZ3VhZ2VJZCwgJ21hcmtkb3duJyk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IDEyLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2UsXG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Zvb0xhbmcnXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRjb25zdCBldmVudCA9IGF3YWl0IHA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQubm90ZWJvb2sgPT09IG5vdGVib29rLmFwaU5vdGVib29rLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY2VsbENoYW5nZXMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IFtjZWxsQ2hhbmdlXSA9IGV2ZW50LmNlbGxDaGFuZ2VzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxDaGFuZ2UuY2VsbCA9PT0gZmlyc3QsIHRydWUpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLmRvY3VtZW50ID09PSBmaXJzdC5kb2N1bWVudCk7XG5cdFx0YXNzZXJ0Lm9rKGNlbGxDaGFuZ2UuZXhlY3V0aW9uU3VtbWFyeSA9PT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5tZXRhZGF0YSA9PT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5vdXRwdXRzID09PSB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2Ugbm90ZWJvb2sgY2VsbCBkb2N1bWVudCBhbmQgb25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gbm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDApO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiAxMixcblx0XHRcdHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQsXG5cdFx0XHRcdGluZGV4OiAwXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRjb25zdCBldmVudCA9IGF3YWl0IHA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQubm90ZWJvb2sgPT09IG5vdGVib29rLmFwaU5vdGVib29rLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY2VsbENoYW5nZXMubGVuZ3RoLCAxKTtcblxuXHRcdGNvbnN0IFtjZWxsQ2hhbmdlXSA9IGV2ZW50LmNlbGxDaGFuZ2VzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxDaGFuZ2UuY2VsbCA9PT0gZmlyc3QsIHRydWUpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLmRvY3VtZW50ID09PSBmaXJzdC5kb2N1bWVudCk7XG5cdFx0YXNzZXJ0Lm9rKGNlbGxDaGFuZ2UuZXhlY3V0aW9uU3VtbWFyeSA9PT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5tZXRhZGF0YSA9PT0gdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5vdXRwdXRzID09PSB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiByZXBsYWNlT3V0cHV0cyhjZWxsSW5kZXg6IG51bWJlciwgb3V0cHV0SWQ6IHN0cmluZywgb3V0cHV0SXRlbXM6IE5vdGVib29rT3V0cHV0SXRlbUR0b1tdKSB7XG5cdFx0Y29uc3QgY2hhbmdlRXZlbnQgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8Tm90ZWJvb2tDZWxsc0NoYW5nZWRFdmVudER0bz4oe1xuXHRcdFx0dmVyc2lvbklkOiBub3RlYm9vay5hcGlOb3RlYm9vay52ZXJzaW9uICsgMSxcblx0XHRcdHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0LFxuXHRcdFx0XHRpbmRleDogY2VsbEluZGV4LFxuXHRcdFx0XHRvdXRwdXRzOiBbeyBvdXRwdXRJZCwgaXRlbXM6IG91dHB1dEl0ZW1zIH1dXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSk7XG5cdFx0YXdhaXQgY2hhbmdlRXZlbnQ7XG5cdH1cblx0YXN5bmMgZnVuY3Rpb24gYXBwZW5kT3V0cHV0SXRlbShjZWxsSW5kZXg6IG51bWJlciwgb3V0cHV0SWQ6IHN0cmluZywgb3V0cHV0SXRlbXM6IE5vdGVib29rT3V0cHV0SXRlbUR0b1tdKSB7XG5cdFx0Y29uc3QgY2hhbmdlRXZlbnQgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8Tm90ZWJvb2tDZWxsc0NoYW5nZWRFdmVudER0bz4oe1xuXHRcdFx0dmVyc2lvbklkOiBub3RlYm9vay5hcGlOb3RlYm9vay52ZXJzaW9uICsgMSxcblx0XHRcdHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0SXRlbSxcblx0XHRcdFx0aW5kZXg6IGNlbGxJbmRleCxcblx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRvdXRwdXRJZCxcblx0XHRcdFx0b3V0cHV0SXRlbXNcblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblx0XHRhd2FpdCBjaGFuZ2VFdmVudDtcblx0fVxuXHR0ZXN0KCdBcHBlbmQgbXVsdGlwbGUgdGV4dC9wbGFpbiBvdXRwdXQgaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcmVwbGFjZU91dHB1dHMoMSwgJzEnLCBbeyBtaW1lOiAndGV4dC9wbGFpbicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ3RleHQvcGxhaW4nLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXInKSB9XSk7XG5cdFx0YXdhaXQgYXBwZW5kT3V0cHV0SXRlbSgxLCAnMScsIFt7IG1pbWU6ICd0ZXh0L3BsYWluJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmF6JykgfV0pO1xuXG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0ubWltZSwgJ3RleHQvcGxhaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5kYXRhKS50b1N0cmluZygpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzFdLm1pbWUsICd0ZXh0L3BsYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMV0uZGF0YSkudG9TdHJpbmcoKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1syXS5taW1lLCAndGV4dC9wbGFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChWU0J1ZmZlci53cmFwKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzJdLmRhdGEpLnRvU3RyaW5nKCksICdiYXonKTtcblx0fSk7XG5cdHRlc3QoJ0FwcGVuZCBtdWx0aXBsZSBzdGRvdXQgc3RyZWFtIG91dHB1dCBpdGVtcyB0byBhbiBvdXRwdXQgd2l0aCBhbm90aGVyIG1pbWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcmVwbGFjZU91dHB1dHMoMSwgJzEnLCBbeyBtaW1lOiAndGV4dC9wbGFpbicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JhcicpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JheicpIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5taW1lLCAndGV4dC9wbGFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1sxXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzJdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnKTtcblx0fSk7XG5cdHRlc3QoJ0NvbXByZXNzIG11bHRpcGxlIHN0ZG91dCBzdHJlYW0gb3V0cHV0IGl0ZW1zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJlcGxhY2VPdXRwdXRzKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JhcicpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JheicpIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0uZGF0YSkudG9TdHJpbmcoKSwgJ2Zvb2JhcmJheicpO1xuXHR9KTtcblx0dGVzdCgnQ29tcHJlc3MgbXVsdGlwbGUgc3Rkb3V0IHN0cmVhbSBvdXRwdXQgaXRlbXMgKHdpdGggc3VwcG9ydCBmb3IgdGVybWluYWwgZXNjYXBlIGNvZGUgLT4gXFx1MDAxYltBKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCByZXBsYWNlT3V0cHV0cygxLCAnMScsIFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdcXG5mb28nKSB9XSk7XG5cdFx0YXdhaXQgYXBwZW5kT3V0cHV0SXRlbSgxLCAnMScsIFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGAke1N0cmluZy5mcm9tQ2hhckNvZGUoMjcpfVtBYmFyYCkgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5kYXRhKS50b1N0cmluZygpLCAnYmFyJyk7XG5cdH0pO1xuXHR0ZXN0KCdDb21wcmVzcyBtdWx0aXBsZSBzdGRvdXQgc3RyZWFtIG91dHB1dCBpdGVtcyAod2l0aCBzdXBwb3J0IGZvciB0ZXJtaW5hbCBlc2NhcGUgY29kZSAtPiBcXHIgY2hhcmFjdGVyKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCByZXBsYWNlT3V0cHV0cygxLCAnMScsIFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmb28nKSB9XSk7XG5cdFx0YXdhaXQgYXBwZW5kT3V0cHV0SXRlbSgxLCAnMScsIFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGBcXHJiYXJgKSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0ubWltZSwgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChWU0J1ZmZlci53cmFwKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLmRhdGEpLnRvU3RyaW5nKCksICdiYXInKTtcblx0fSk7XG5cdHRlc3QoJ0NvbXByZXNzIG11bHRpcGxlIHN0ZGVyciBzdHJlYW0gb3V0cHV0IGl0ZW1zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJlcGxhY2VPdXRwdXRzKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZGVycicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZGVycicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JhcicpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZGVycicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JheicpIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0uZGF0YSkudG9TdHJpbmcoKSwgJ2Zvb2JhcmJheicpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUEwQixtQkFBMEg7QUFDcEosU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxVQUFVLFNBQVMsK0JBQStCO0FBQzNELFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBRXRDLE1BQU0seUJBQXlCLFdBQVk7QUFDMUMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLGNBQWMsSUFBSSxNQUFNLHVCQUF1QjtBQUNyRCxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsV0FBUyxXQUFZO0FBQ3BCLGdCQUFZLE1BQU07QUFBQSxFQUNuQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFFBQU0saUJBQWtCO0FBQ3ZCLGtCQUFjLElBQUksZ0JBQWdCO0FB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
