import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { LcsDiff } from "../../../../../../base/common/diff/diff.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../../base/common/mime.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NotebookDiffEditorEventDispatcher } from "../../../browser/diff/eventDispatcher.js";
import { NotebookDiffViewModel, prettyChanges } from "../../../browser/diff/notebookDiffViewModel.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { withTestNotebookDiffModel } from "../testNotebookEditor.js";
class CellSequence {
  constructor(textModel) {
    this.textModel = textModel;
  }
  getElements() {
    const hashValue = new Int32Array(this.textModel.cells.length);
    for (let i = 0; i < this.textModel.cells.length; i++) {
      hashValue[i] = this.textModel.cells[i].getHashValue();
    }
    return hashValue;
  }
}
suite("NotebookDiff", () => {
  let disposables;
  let token;
  let eventDispatcher;
  let diffViewModel;
  let diffResult;
  let notebookEditorWorkerService;
  let heightCalculator;
  teardown(() => disposables.dispose());
  const configurationService = new TestConfigurationService({ notebook: { diff: { ignoreMetadata: true } } });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    const cancellation = disposables.add(new CancellationTokenSource());
    eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
    token = cancellation.token;
    notebookEditorWorkerService = new class extends mock() {
      computeDiff() {
        return Promise.resolve({ cellsDiff: diffResult, metadataChanged: false });
      }
    }();
    heightCalculator = new class extends mock() {
      diffAndComputeHeight() {
        return Promise.resolve(0);
      }
      computeHeightFromLines(_lineCount) {
        return 0;
      }
    }();
  });
  async function verifyChangeEventIsNotFired(diffViewModel2) {
    let eventArgs = void 0;
    disposables.add(diffViewModel2.onDidChangeItems((e) => eventArgs = e));
    await diffViewModel2.computeDiff(token);
    assert.strictEqual(eventArgs, void 0);
  }
  test("diff different source", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
    });
  });
  test("No changes when re-computing diff with the same source", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff different output", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      diffViewModel.items[1].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff test small source", async () => {
    await withTestNotebookDiffModel([
      ["123456789", "javascript", CellKind.Code, [], {}]
    ], [
      ["987654321", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff test data single cell", async () => {
    await withTestNotebookDiffModel([
      [[
        "# This version has a bug\n",
        "def mult(a, b):\n",
        "    return a / b"
      ].join(""), "javascript", CellKind.Code, [], {}]
    ], [
      [[
        "def mult(a, b):\n",
        "    'This version is debugged.'\n",
        "    return a * b"
      ].join(""), "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff foo/foe", async () => {
    await withTestNotebookDiffModel([
      [["def foe(x, y):\n", "    return x + y\n", "foe(3, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      [["def foo(x, y):\n", "    return x * y\n", "foo(1, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], [
      [["def foo(x, y):\n", "    return x * y\n", "foo(1, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      [["def foe(x, y):\n", "    return x + y\n", "foe(3, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 3);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "modified");
      assert.strictEqual(diffViewModel.items[2].type, "placeholder");
      diffViewModel.items[2].showHiddenCells();
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 2, deleteCount: 1, elements: [diffViewModel.items[2]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff markdown", async () => {
    await withTestNotebookDiffModel([
      ["This is a test notebook with only markdown cells", "markdown", CellKind.Markup, [], {}],
      ["Lorem ipsum dolor sit amet", "markdown", CellKind.Markup, [], {}],
      ["In other news", "markdown", CellKind.Markup, [], {}]
    ], [
      ["This is a test notebook with markdown cells only", "markdown", CellKind.Markup, [], {}],
      ["Lorem ipsum dolor sit amet", "markdown", CellKind.Markup, [], {}],
      ["In the news", "markdown", CellKind.Markup, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 3);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.strictEqual(diffViewModel.items[2].type, "modified");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      diffResult = {
        changes: [{
          originalStart: 0,
          originalLength: 0,
          modifiedStart: 0,
          modifiedLength: 1
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(eventArgs?.firstChangeIndex, 0);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1], diffViewModel.items[2]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert 2", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const eventDispatcher2 = disposables2.add(new NotebookDiffEditorEventDispatcher());
      diffResult = {
        changes: [{
          originalStart: 0,
          originalLength: 0,
          modifiedStart: 0,
          modifiedLength: 1
        }, {
          originalStart: 0,
          originalLength: 6,
          modifiedStart: 1,
          modifiedLength: 6
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher2, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(eventArgs?.firstChangeIndex, 0);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "unchanged");
      assert.strictEqual(diffViewModel.items[5].type, "unchanged");
      assert.strictEqual(diffViewModel.items[6].type, "unchanged");
      assert.strictEqual(diffViewModel.items[7].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: diffViewModel.items.slice(1) });
      diffViewModel.items[1].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 7, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert 3", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      diffResult = {
        changes: [{
          originalStart: 4,
          originalLength: 0,
          modifiedStart: 4,
          modifiedLength: 1
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      assert.strictEqual(diffViewModel.items[1].type, "insert");
      assert.strictEqual(diffViewModel.items[2].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].type, "unchanged");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "insert");
      assert.strictEqual(diffViewModel.items[5].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: diffViewModel.items.slice(0, 4) });
      diffViewModel.items[5].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].type, "unchanged");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "insert");
      assert.strictEqual(diffViewModel.items[5].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 5, deleteCount: 1, elements: diffViewModel.items.slice(5) });
      diffViewModel.items[0].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      assert.strictEqual(diffViewModel.items[1].type, "insert");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 4, elements: diffViewModel.items.slice(0, 1) });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("LCS", async () => {
    await withTestNotebookDiffModel([
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }]
    ], [
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 2,
        originalLength: 0,
        modifiedStart: 2,
        modifiedLength: 1
      }, {
        originalStart: 3,
        originalLength: 1,
        modifiedStart: 4,
        modifiedLength: 0
      }]);
    });
  });
  test("LCS 2", async () => {
    await withTestNotebookDiffModel([
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x = 5", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}]
    ], [
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x = 5", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
      ["x", "javascript", CellKind.Code, [], {}]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      prettyChanges(model.original.notebook, model.modified.notebook, diffResult2);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 2,
        originalLength: 0,
        modifiedStart: 2,
        modifiedLength: 1
      }, {
        originalStart: 3,
        originalLength: 1,
        modifiedStart: 4,
        modifiedLength: 0
      }, {
        originalStart: 5,
        originalLength: 0,
        modifiedStart: 5,
        modifiedLength: 1
      }, {
        originalStart: 6,
        originalLength: 1,
        modifiedStart: 7,
        modifiedLength: 0
      }]);
    });
  });
  test("LCS 3", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      prettyChanges(model.original.notebook, model.modified.notebook, diffResult2);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 4,
        originalLength: 0,
        modifiedStart: 4,
        modifiedLength: 1
      }]);
    });
  });
  test("diff output", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].checkIfOutputsModified(), false);
      assert.strictEqual(diffViewModel.items[1].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff output fast check", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].original.textModel.equal(diffViewModel.items[0].modified.textModel), true);
      assert.strictEqual(diffViewModel.items[1].original.textModel.equal(diffViewModel.items[1].modified.textModel), false);
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmUmVzdWx0LCBJU2VxdWVuY2UsIExjc0RpZmYgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kaWZmL2RpZmYuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSwgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kaWZmL2RpZmZFbGVtZW50Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9ldmVudERpc3BhdGNoZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRGlmZlZpZXdNb2RlbCwgSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZkVkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEaWZmVmlld01vZGVsLCBwcmV0dHlDaGFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9kaWZmL25vdGVib29rRGlmZlZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgSU5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9lZGl0b3JIZWlnaHRDYWxjdWxhdG9yLmpzJztcblxuY2xhc3MgQ2VsbFNlcXVlbmNlIGltcGxlbWVudHMgSVNlcXVlbmNlIHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB0ZXh0TW9kZWw6IElOb3RlYm9va1RleHRNb2RlbCkge1xuXHR9XG5cblx0Z2V0RWxlbWVudHMoKTogc3RyaW5nW10gfCBudW1iZXJbXSB8IEludDMyQXJyYXkge1xuXHRcdGNvbnN0IGhhc2hWYWx1ZSA9IG5ldyBJbnQzMkFycmF5KHRoaXMudGV4dE1vZGVsLmNlbGxzLmxlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRleHRNb2RlbC5jZWxscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aGFzaFZhbHVlW2ldID0gdGhpcy50ZXh0TW9kZWwuY2VsbHNbaV0uZ2V0SGFzaFZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhc2hWYWx1ZTtcblx0fVxufVxuXG5zdWl0ZSgnTm90ZWJvb2tEaWZmJywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0bGV0IGV2ZW50RGlzcGF0Y2hlcjogTm90ZWJvb2tEaWZmRWRpdG9yRXZlbnREaXNwYXRjaGVyO1xuXHRsZXQgZGlmZlZpZXdNb2RlbDogTm90ZWJvb2tEaWZmVmlld01vZGVsO1xuXHRsZXQgZGlmZlJlc3VsdDogSURpZmZSZXN1bHQ7XG5cdGxldCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2U6IElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2U7XG5cdGxldCBoZWlnaHRDYWxjdWxhdG9yOiBJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlO1xuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IG5vdGVib29rOiB7IGRpZmY6IHsgaWdub3JlTWV0YWRhdGE6IHRydWUgfSB9IH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRldmVudERpc3BhdGNoZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcigpKTtcblx0XHR0b2tlbiA9IGNhbmNlbGxhdGlvbi50b2tlbjtcblx0XHRub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgY29tcHV0ZURpZmYoKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBjZWxsc0RpZmY6IGRpZmZSZXN1bHQsIG1ldGFkYXRhQ2hhbmdlZDogZmFsc2UgfSk7IH1cblx0XHR9O1xuXHRcdGhlaWdodENhbGN1bGF0b3IgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZGlmZkFuZENvbXB1dGVIZWlnaHQoKSB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7IH1cblx0XHRcdG92ZXJyaWRlIGNvbXB1dGVIZWlnaHRGcm9tTGluZXMoX2xpbmVDb3VudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0fTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWw6IElOb3RlYm9va0RpZmZWaWV3TW9kZWwpIHtcblx0XHRsZXQgZXZlbnRBcmdzOiBJTm90ZWJvb2tEaWZmVmlld01vZGVsVXBkYXRlRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEFyZ3MsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHR0ZXN0KCdkaWZmIGRpZmZlcmVudCBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XSwgW1xuXHRcdFx0Wyd5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDAsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIGNoYW5nZXMgd2hlbiByZS1jb21wdXRpbmcgZGlmZiB3aXRoIHRoZSBzYW1lIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRdLCBbXG5cdFx0XHRbJ3knLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9XSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBkaWZmZXJlbnQgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzVdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogNSB9XSxcblx0XHRcdFsnJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdFx0WycnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbFN0YXJ0LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWRTdGFydCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IGNoYW5nZS5tb2RpZmllZExlbmd0aFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAwLFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMSxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogMCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdH1dKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKG1vZGVsLCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBldmVudERpc3BhdGNoZXIsIGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKSwgaGVpZ2h0Q2FsY3VsYXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRsZXQgZXZlbnRBcmdzOiBJTm90ZWJvb2tEaWZmVmlld01vZGVsVXBkYXRlRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlmZlZpZXdNb2RlbC5vbkRpZENoYW5nZUl0ZW1zKGUgPT4gZXZlbnRBcmdzID0gZSkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnbW9kaWZpZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXG5cblx0XHRcdGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0uc2hvd0hpZGRlbkNlbGxzKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnbW9kaWZpZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IFtkaWZmVmlld01vZGVsLml0ZW1zWzFdXSB9KTtcblxuXHRcdFx0KGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLmhpZGVVbmNoYW5nZWRDZWxscygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSkudHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogMSwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBbZGlmZlZpZXdNb2RlbC5pdGVtc1sxXV0gfSk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiB0ZXN0IHNtYWxsIHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsnMTIzNDU2Nzg5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgW1xuXHRcdFx0Wyc5ODc2NTQzMjEnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9XSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnbW9kaWZpZWQnKTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmIHRlc3QgZGF0YSBzaW5nbGUgY2VsbCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFtbXG5cdFx0XHRcdCcjIFRoaXMgdmVyc2lvbiBoYXMgYSBidWdcXG4nLFxuXHRcdFx0XHQnZGVmIG11bHQoYSwgYik6XFxuJyxcblx0XHRcdFx0JyAgICByZXR1cm4gYSAvIGInXG5cdFx0XHRdLmpvaW4oJycpLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCBbXG5cdFx0XHRbW1xuXHRcdFx0XHQnZGVmIG11bHQoYSwgYik6XFxuJyxcblx0XHRcdFx0JyAgICBcXCdUaGlzIHZlcnNpb24gaXMgZGVidWdnZWQuXFwnXFxuJyxcblx0XHRcdFx0JyAgICByZXR1cm4gYSAqIGInXG5cdFx0XHRdLmpvaW4oJycpLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9XSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnbW9kaWZpZWQnKTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmIGZvby9mb2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbWydkZWYgZm9lKHgsIHkpOlxcbicsICcgICAgcmV0dXJuIHggKyB5XFxuJywgJ2ZvZSgzLCAyKSddLmpvaW4oJycpLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNl0pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiA1IH1dLFxuXHRcdFx0W1snZGVmIGZvbyh4LCB5KTpcXG4nLCAnICAgIHJldHVybiB4ICogeVxcbicsICdmb28oMSwgMiknXS5qb2luKCcnKSwgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzJdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogNiB9XSxcblx0XHRcdFsnJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgW1xuXHRcdFx0W1snZGVmIGZvbyh4LCB5KTpcXG4nLCAnICAgIHJldHVybiB4ICogeVxcbicsICdmb28oMSwgMiknXS5qb2luKCcnKSwgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzZdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogNSB9XSxcblx0XHRcdFtbJ2RlZiBmb2UoeCwgeSk6XFxuJywgJyAgICByZXR1cm4geCArIHlcXG4nLCAnZm9lKDMsIDIpJ10uam9pbignJyksICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFsyXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDYgfV0sXG5cdFx0XHRbJycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKG1vZGVsLCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBldmVudERpc3BhdGNoZXIsIGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKSwgaGVpZ2h0Q2FsY3VsYXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRsZXQgZXZlbnRBcmdzOiBJTm90ZWJvb2tEaWZmVmlld01vZGVsVXBkYXRlRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlmZlZpZXdNb2RlbC5vbkRpZENoYW5nZUl0ZW1zKGUgPT4gZXZlbnRBcmdzID0gZSkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnbW9kaWZpZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdtb2RpZmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0udHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzJdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDIsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogW2RpZmZWaWV3TW9kZWwuaXRlbXNbMl1dIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgbWFya2Rvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ1RoaXMgaXMgYSB0ZXN0IG5vdGVib29rIHdpdGggb25seSBtYXJrZG93biBjZWxscycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFsnTG9yZW0gaXBzdW0gZG9sb3Igc2l0IGFtZXQnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRbJ0luIG90aGVyIG5ld3MnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XSwgW1xuXHRcdFx0WydUaGlzIGlzIGEgdGVzdCBub3RlYm9vayB3aXRoIG1hcmtkb3duIGNlbGxzIG9ubHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRbJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0WydJbiB0aGUgbmV3cycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICdtb2RpZmllZCcpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzFdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogW2RpZmZWaWV3TW9kZWwuaXRlbXNbMV1dIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBpbnNlcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCBbXG5cdFx0XHRbJ3ZhciBoID0gODsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0ZGlmZlJlc3VsdCA9IHtcblx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAwLFxuXHRcdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRBcmdzPy5maXJzdENoYW5nZUluZGV4LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzFdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogW2RpZmZWaWV3TW9kZWwuaXRlbXNbMV0sIGRpZmZWaWV3TW9kZWwuaXRlbXNbMl1dIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgaW5zZXJ0IDInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGYgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGcgPSA3OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCBbXG5cdFx0XHRbJ3ZhciBoID0gODsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBlID0gNTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBmID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBnID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50RGlzcGF0Y2hlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmRWRpdG9yRXZlbnREaXNwYXRjaGVyKCkpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IHtcblx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAwLFxuXHRcdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDAsXG5cdFx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDYsXG5cdFx0XHRcdFx0bW9kaWZpZWRTdGFydDogMSxcblx0XHRcdFx0XHRtb2RpZmllZExlbmd0aDogNlxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cXVpdEVhcmx5OiBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKG1vZGVsLCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBldmVudERpc3BhdGNoZXIsIGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKSwgaGVpZ2h0Q2FsY3VsYXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRsZXQgZXZlbnRBcmdzOiBJTm90ZWJvb2tEaWZmVmlld01vZGVsVXBkYXRlRXZlbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZGlmZlZpZXdNb2RlbC5vbkRpZENoYW5nZUl0ZW1zKGUgPT4gZXZlbnRBcmdzID0gZSkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudEFyZ3M/LmZpcnN0Q2hhbmdlSW5kZXgsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzFdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbM10udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNF0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNl0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbN10udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogZGlmZlZpZXdNb2RlbC5pdGVtcy5zbGljZSgxKSB9KTtcblxuXG5cdFx0XHQoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXSBhcyB1bmtub3duIGFzIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkuaGlkZVVuY2hhbmdlZENlbGxzKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSkudHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogMSwgZGVsZXRlQ291bnQ6IDcsIGVsZW1lbnRzOiBbZGlmZlZpZXdNb2RlbC5pdGVtc1sxXV0gfSk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBpbnNlcnQgMycsIGFzeW5jICgpID0+IHtcblxuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZCA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZyA9IDc7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGggPSA4OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGYgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGcgPSA3OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0ZGlmZlJlc3VsdCA9IHtcblx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiA0LFxuXHRcdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDQsXG5cdFx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzBdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbM10udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNF0udHlwZSwgJ2luc2VydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNV0udHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBkaWZmVmlld01vZGVsLml0ZW1zLnNsaWNlKDAsIDQpIH0pO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzVdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzBdIGFzIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1syXSBhcyBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlKS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1szXS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1s0XS50eXBlLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1s1XS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogNSwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBkaWZmVmlld01vZGVsLml0ZW1zLnNsaWNlKDUpIH0pO1xuXG5cdFx0XHQoZGlmZlZpZXdNb2RlbC5pdGVtc1swXSBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLmhpZGVVbmNoYW5nZWRDZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzBdIGFzIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ2luc2VydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzJdIGFzIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAwLCBkZWxldGVDb3VudDogNCwgZWxlbWVudHM6IGRpZmZWaWV3TW9kZWwuaXRlbXMuc2xpY2UoMCwgMSkgfSk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdMQ1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJyMgRGVzY3JpcHRpb24nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7IG1ldGFkYXRhOiB7fSB9XSxcblx0XHRcdFsneCA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogdHJ1ZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XSxcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDEgfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSB9XVxuXHRcdF0sIFtcblx0XHRcdFsnIyBEZXNjcmlwdGlvbicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHsgbWV0YWRhdGE6IHt9IH1dLFxuXHRcdFx0Wyd4ID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiB0cnVlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0gfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dXG5cdFx0XSwgYXN5bmMgKG1vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDIsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAwLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAyLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAzLFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMSxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogNCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDBcblx0XHRcdH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTENTIDInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJyMgRGVzY3JpcHRpb24nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7IG1ldGFkYXRhOiB7fSB9XSxcblx0XHRcdFsneCA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogdHJ1ZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XSxcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDEgfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSB9XSxcblx0XHRcdFsneCA9IDUnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNV0pKSB9XSB9XSwge31dLFxuXHRcdF0sIFtcblx0XHRcdFsnIyBEZXNjcmlwdGlvbicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHsgbWV0YWRhdGE6IHt9IH1dLFxuXHRcdFx0Wyd4ID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiB0cnVlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0gfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dLFxuXHRcdFx0Wyd4ID0gNScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFs1XSkpIH1dIH1dLCB7fV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdHByZXR0eUNoYW5nZXMobW9kZWwub3JpZ2luYWwubm90ZWJvb2ssIG1vZGVsLm1vZGlmaWVkLm5vdGVib29rLCBkaWZmUmVzdWx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMixcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDAsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDIsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDMsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiA0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiA1LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogNSxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdH0sIHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogNixcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDcsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAwXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xDUyAzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZCA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZyA9IDc7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGggPSA4OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGYgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGcgPSA3OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCBhc3luYyAobW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0Y29uc3QgZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXHRcdFx0cHJldHR5Q2hhbmdlcyhtb2RlbC5vcmlnaW5hbC5ub3RlYm9vaywgbW9kZWwubW9kaWZpZWQubm90ZWJvb2ssIGRpZmZSZXN1bHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbFN0YXJ0LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWRTdGFydCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IGNoYW5nZS5tb2RpZmllZExlbmd0aFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiA0LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogNCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdH1dKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XHRbJ3knLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFs0XSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XSwgW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdFx0Wyd5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNV0pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKG1vZGVsLCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBldmVudERpc3BhdGNoZXIsIGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKSwgaGVpZ2h0Q2FsY3VsYXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1swXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1swXSBhcyB1bmtub3duIGFzIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkuY2hlY2tJZk91dHB1dHNNb2RpZmllZCgpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAnbW9kaWZpZWQnKTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmIG91dHB1dCBmYXN0IGNoZWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdFx0Wyd5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNF0pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRcdFsneScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzVdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblx0XHRcdGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0uc2hvd0hpZGRlbkNlbGxzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLm9yaWdpbmFsIS50ZXh0TW9kZWwuZXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLm1vZGlmaWVkIS50ZXh0TW9kZWwpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXSBhcyB1bmtub3duIGFzIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkub3JpZ2luYWwhLnRleHRNb2RlbC5lcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXSBhcyB1bmtub3duIGFzIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkubW9kaWZpZWQhLnRleHRNb2RlbCksIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFpQyxlQUFlO0FBQ2hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyx5Q0FBeUM7QUFFbEQsU0FBUyx1QkFBdUIscUJBQXFCO0FBQ3JELFNB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TSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEQsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEQsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbkQsR0FBRztBQUFBLE1BQ0YsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEQsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbEQsQ0FBQyxjQUFjLGNBQWMsU0FBUyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ25ELEdBQUcsT0FBTyxPQUFPQSxjQUFhLGFBQWE7QUFDMUMsbUJBQWE7QUFBQSxRQUNaLFNBQVMsQ0FBQztBQUFBLFVBQ1Qs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Z0JBLGFBQVksSUFBSSxJQUFJLHNCQUFzQixPQUFPLDZCQUE2QixzQkFBc0IsaUJBQWlCLFNBQVMsSUFBc0IsZ0JBQWdCLEdBQUcsa0JBQWtCLE1BQVMsQ0FBQztBQUNuTixZQUFNLGNBQWMsWUFBWSxLQUFLO0FBRXJDLGFBQU8sWUFBWSxjQUFjLE1BQU0sUUFBUSxDQUFDO0FBQ2hELGFBQU8sWUFBWSxjQUFjLE1BQU0sQ0FBQyxFQUFFLE1BQU0sYUFBYTtBQUM3RCxvQkFBYyxNQUFNLENBQUMsRUFBRSxnQkFBZ0I7QUFDdkMsYUFBTyxZQUFhLGNBQWMsTUFBTSxDQUFDLEVBQWdELFNBQVUsVUFBVSxNQUFPLGNBQWMsTUFBTSxDQUFDLEVBQWdELFNBQVUsU0FBUyxHQUFHLElBQUk7QUFDbk4sYUFBTyxZQUFhLGNBQWMsTUFBTSxDQUFDLEVBQWdELFNBQVUsVUFBVSxNQUFPLGNBQWMsTUFBTSxDQUFDLEVBQWdELFNBQVUsU0FBUyxHQUFHLEtBQUs7QUFFcE4sWUFBTSw0QkFBNEIsYUFBYTtBQUFBLElBQ2hELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJkaWZmVmlld01vZGVsIiwgImRpc3Bvc2FibGVzIiwgImV2ZW50RGlzcGF0Y2hlciIsICJkaWZmUmVzdWx0Il0KfQo=
