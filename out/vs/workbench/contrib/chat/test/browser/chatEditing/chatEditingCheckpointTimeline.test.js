import assert from "assert";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { transaction } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { SyncDescriptor } from "../../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ChatEditingCheckpointTimelineImpl } from "../../../browser/chatEditing/chatEditingCheckpointTimelineImpl.js";
import { FileOperationType } from "../../../browser/chatEditing/chatEditingOperations.js";
suite("ChatEditingCheckpointTimeline", function() {
  const store = new DisposableStore();
  let timeline;
  let fileContents;
  let fileDelegate;
  const DEFAULT_TELEMETRY_INFO = upcastPartial({
    agentId: "testAgent",
    command: void 0,
    sessionResource: URI.parse("chat://test-session"),
    requestId: "test-request",
    result: void 0,
    modelId: void 0,
    modeId: void 0,
    applyCodeBlockSuggestionId: void 0,
    feature: void 0
  });
  function createTextEditOperation(uri, requestId, epoch, edits) {
    return upcastPartial({
      type: FileOperationType.TextEdit,
      uri,
      requestId,
      epoch,
      edits
    });
  }
  function createFileCreateOperation(uri, requestId, epoch, initialContent) {
    return upcastPartial({
      type: FileOperationType.Create,
      uri,
      requestId,
      epoch,
      initialContent
    });
  }
  function createFileDeleteOperation(uri, requestId, epoch, finalContent) {
    return upcastPartial({
      type: FileOperationType.Delete,
      uri,
      requestId,
      epoch,
      finalContent
    });
  }
  function createFileRenameOperation(oldUri, newUri, requestId, epoch) {
    return upcastPartial({
      type: FileOperationType.Rename,
      uri: newUri,
      requestId,
      epoch,
      oldUri,
      newUri
    });
  }
  setup(function() {
    fileContents = new ResourceMap();
    fileDelegate = {
      createFile: async (uri, initialContent) => {
        fileContents.set(uri, initialContent);
      },
      deleteFile: async (uri) => {
        fileContents.delete(uri);
      },
      renameFile: async (fromUri, toUri) => {
        const content = fileContents.get(fromUri);
        if (content !== void 0) {
          fileContents.set(toUri, content);
          fileContents.delete(fromUri);
        }
      },
      setContents: async (uri, content) => {
        fileContents.set(uri, content);
      }
    };
    const collection = new ServiceCollection();
    collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
    const insta = store.add(workbenchInstantiationService(void 0, store).createChild(collection));
    timeline = insta.createInstance(ChatEditingCheckpointTimelineImpl, URI.parse("chat://test-session"), fileDelegate);
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("creates initial checkpoint on construction", function() {
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    assert.strictEqual(checkpoints.length, 1);
    assert.strictEqual(checkpoints[0].requestId, void 0);
    assert.strictEqual(checkpoints[0].label, "Initial State");
  });
  test("canUndo and canRedo are initially false", function() {
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), false);
  });
  test("createCheckpoint increments epoch and creates checkpoint", function() {
    const initialEpoch = timeline.getStateForPersistence().epochCounter;
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1");
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.checkpoints.length, 2);
    assert.strictEqual(state.checkpoints[1].requestId, "req1");
    assert.strictEqual(state.checkpoints[1].undoStopId, "stop1");
    assert.strictEqual(state.checkpoints[1].label, "Checkpoint 1");
    assert.strictEqual(state.epochCounter, initialEpoch + 1);
  });
  test("createCheckpoint does not create duplicate checkpoints", function() {
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1");
    timeline.createCheckpoint("req1", "stop1", "Checkpoint 1 Duplicate");
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    assert.strictEqual(checkpoints.length, 2);
    assert.strictEqual(checkpoints[1].label, "Checkpoint 1");
  });
  test("incrementEpoch increases epoch counter", function() {
    const initialEpoch = timeline.getStateForPersistence().epochCounter;
    const epoch1 = timeline.incrementEpoch();
    const epoch2 = timeline.incrementEpoch();
    assert.strictEqual(epoch1, initialEpoch);
    assert.strictEqual(epoch2, initialEpoch + 1);
    assert.strictEqual(timeline.getStateForPersistence().epochCounter, initialEpoch + 2);
  });
  test("recordFileBaseline stores baseline", function() {
    const uri = URI.parse("file:///test.txt");
    const baseline = upcastPartial({
      uri,
      requestId: "req1",
      content: "initial content",
      epoch: 1,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    });
    timeline.recordFileBaseline(baseline);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("recordFileOperation stores operation", function() {
    const uri = URI.parse("file:///test.txt");
    const operation = createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 1), text: "hello" }]
    );
    timeline.recordFileOperation(operation);
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 1);
    assert.strictEqual(state.operations[0].type, FileOperationType.TextEdit);
    assert.strictEqual(state.operations[0].requestId, "req1");
  });
  test("basic undo/redo with text edits", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "hello",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start of Request");
    const editEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      editEpoch,
      [{ range: new Range(1, 1, 1, 6), text: "goodbye" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "After Edit");
    assert.strictEqual(timeline.canUndo.get(), true);
    assert.strictEqual(timeline.canRedo.get(), false);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), true);
  });
  test("file creation and deletion operations", async function() {
    const uri = URI.parse("file:///new.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "new file content",
      epoch: createEpoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      createEpoch,
      "new file content"
    ));
    timeline.createCheckpoint("req1", "created", "File Created");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "created"));
    assert.strictEqual(fileContents.get(uri), "new file content");
    const deleteEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileDeleteOperation(
      uri,
      "req1",
      deleteEpoch,
      "new file content"
    ));
    timeline.createCheckpoint("req1", "deleted", "File Deleted");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "deleted"));
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "new file content");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.has(uri), false);
  });
  test("file rename operations", async function() {
    const oldUri = URI.parse("file:///old.txt");
    const newUri = URI.parse("file:///new.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: oldUri,
      requestId: "req1",
      content: "content",
      epoch: createEpoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      oldUri,
      "req1",
      createEpoch,
      "content"
    ));
    timeline.createCheckpoint("req1", "created", "File Created");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "created"));
    assert.strictEqual(fileContents.get(oldUri), "content");
    const renameEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileRenameOperation(
      oldUri,
      newUri,
      "req1",
      renameEpoch
    ));
    timeline.createCheckpoint("req1", "renamed", "File Renamed");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "renamed"));
    assert.strictEqual(fileContents.has(oldUri), false);
    assert.strictEqual(fileContents.get(newUri), "content");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(oldUri), "content");
    assert.strictEqual(fileContents.has(newUri), false);
  });
  test("multiple sequential edits to same file", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "line1\nline2\nline3",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "LINE1" }]
    ));
    timeline.createCheckpoint("req1", "edit1", "Edit 1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(2, 1, 2, 6), text: "LINE2" }]
    ));
    timeline.createCheckpoint("req1", "edit2", "Edit 2");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "edit1"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nline2\nline3");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "edit2"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nLINE2\nline3");
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", void 0));
    assert.strictEqual(fileContents.get(uri), "line1\nline2\nline3");
  });
  test("getCheckpointIdForRequest returns correct checkpoint", function() {
    timeline.createCheckpoint("req1", void 0, "Start of req1");
    timeline.createCheckpoint("req1", "stop1", "Stop 1");
    timeline.createCheckpoint("req2", void 0, "Start of req2");
    const req1Start = timeline.getCheckpointIdForRequest("req1", void 0);
    const req1Stop = timeline.getCheckpointIdForRequest("req1", "stop1");
    const req2Start = timeline.getCheckpointIdForRequest("req2", void 0);
    assert.ok(req1Start);
    assert.ok(req1Stop);
    assert.ok(req2Start);
    assert.notStrictEqual(req1Start, req1Stop);
    assert.notStrictEqual(req1Start, req2Start);
  });
  test("getCheckpointIdForRequest returns undefined for non-existent checkpoint", function() {
    const checkpoint = timeline.getCheckpointIdForRequest("nonexistent", "stop1");
    assert.strictEqual(checkpoint, void 0);
  });
  test("requestDisablement tracks disabled requests", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createFileCreateOperation(uri, "req1", timeline.incrementEpoch(), "a"));
    timeline.createCheckpoint("req1", "stop1", "Stop req1");
    timeline.recordFileOperation(createTextEditOperation(uri, "req1", timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: "b" }]));
    timeline.createCheckpoint("req2", void 0, "Start req2");
    timeline.recordFileOperation(createTextEditOperation(uri, "req2", timeline.incrementEpoch(), [{ range: new Range(1, 1, 1, 2), text: "c" }]));
    assert.deepStrictEqual(timeline.requestDisablement.get(), []);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "b");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 }
    ]);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), "a");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: "stop1" }
    ]);
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(fileContents.get(uri), void 0);
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: void 0 }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "a");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 },
      { requestId: "req1", afterUndoStop: "stop1" }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "b");
    assert.deepStrictEqual(timeline.requestDisablement.get(), [
      { requestId: "req2", afterUndoStop: void 0 }
    ]);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(fileContents.get(uri), "c");
  });
  test("persistence - save and restore state", function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit Complete");
    const savedState = timeline.getStateForPersistence();
    const collection = new ServiceCollection();
    collection.set(INotebookService, new SyncDescriptor(TestNotebookService));
    const insta = store.add(workbenchInstantiationService(void 0, store).createChild(collection));
    const newTimeline = insta.createInstance(
      ChatEditingCheckpointTimelineImpl,
      URI.parse("chat://test-session-2"),
      fileDelegate
    );
    transaction((tx) => {
      newTimeline.restoreFromState(savedState, tx);
    });
    const restoredState = newTimeline.getStateForPersistence();
    assert.strictEqual(restoredState.checkpoints.length, savedState.checkpoints.length);
    assert.strictEqual(restoredState.operations.length, savedState.operations.length);
    assert.strictEqual(restoredState.currentEpoch, savedState.currentEpoch);
    assert.strictEqual(restoredState.epochCounter, savedState.epochCounter);
  });
  test("navigating between multiple requests", async function() {
    const uri1 = URI.parse("file:///file1.txt");
    const uri2 = URI.parse("file:///file2.txt");
    timeline.createCheckpoint("req1", void 0, "Start req1");
    const create1Epoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: uri1,
      requestId: "req1",
      content: "file1 modified",
      epoch: create1Epoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri1,
      "req1",
      create1Epoch,
      "file1 modified"
    ));
    timeline.createCheckpoint("req1", "stop1", "Req1 complete");
    timeline.createCheckpoint("req2", void 0, "Start req2");
    const create2Epoch = timeline.incrementEpoch();
    timeline.recordFileBaseline(upcastPartial({
      uri: uri2,
      requestId: "req2",
      content: "file2 modified",
      epoch: create2Epoch,
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri2,
      "req2",
      create2Epoch,
      "file2 modified"
    ));
    timeline.createCheckpoint("req2", "stop1", "Req2 complete");
    await timeline.navigateToCheckpoint(timeline.getStateForPersistence().checkpoints[0].checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    assert.strictEqual(fileContents.get(uri1), "file1 modified");
    assert.strictEqual(fileContents.has(uri2), false);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req2", "stop1"));
    assert.strictEqual(fileContents.get(uri1), "file1 modified");
    assert.strictEqual(fileContents.get(uri2), "file2 modified");
    const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    assert.strictEqual(fileContents.has(uri1), false);
    assert.strictEqual(fileContents.has(uri2), false);
  });
  test("getContentURIAtStop returns snapshot URI", function() {
    const fileUri = URI.parse("file:///test.txt");
    const snapshotUri = timeline.getContentURIAtStop("req1", fileUri, "stop1");
    assert.ok(snapshotUri);
    assert.notStrictEqual(snapshotUri.toString(), fileUri.toString());
    assert.ok(snapshotUri.toString().includes("req1"));
  });
  test("undoing entire request when appropriate", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit complete");
    assert.strictEqual(timeline.canUndo.get(), true);
    await timeline.undoToLastCheckpoint();
    const state = timeline.getStateForPersistence();
    assert.strictEqual(state.currentEpoch, 2);
  });
  test("operations use incrementing epochs", function() {
    const uri = URI.parse("file:///test.txt");
    const epoch1 = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      epoch1,
      [{ range: new Range(1, 1, 1, 1), text: "edit1" }]
    ));
    const epoch2 = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      epoch2,
      [{ range: new Range(2, 1, 2, 1), text: "edit2" }]
    ));
    const operations = timeline.getStateForPersistence().operations;
    assert.strictEqual(operations.length, 2);
    assert.strictEqual(operations[0].epoch, epoch1);
    assert.strictEqual(operations[1].epoch, epoch2);
  });
  test("navigateToCheckpoint throws error for invalid checkpoint ID", async function() {
    let errorThrown = false;
    try {
      await timeline.navigateToCheckpoint("invalid-checkpoint-id");
    } catch (error) {
      errorThrown = true;
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes("not found"));
    }
    assert.ok(errorThrown, "Expected error to be thrown");
  });
  test("navigateToCheckpoint does nothing when already at target epoch", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      createEpoch,
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Checkpoint");
    const checkpointId = timeline.getCheckpointIdForRequest("req1", "stop1");
    await timeline.navigateToCheckpoint(checkpointId);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.navigateToCheckpoint(checkpointId);
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("recording operation after undo truncates future history", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit 1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "edit2" }]
    ));
    timeline.createCheckpoint("req1", "stop2", "Edit 2");
    const stateWithTwoEdits = timeline.getStateForPersistence();
    assert.strictEqual(stateWithTwoEdits.operations.length, 2);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "edit3" }]
    ));
    const stateAfterNewEdit = timeline.getStateForPersistence();
    assert.strictEqual(stateAfterNewEdit.operations.length, 2);
    assert.strictEqual(stateAfterNewEdit.operations[1].type, FileOperationType.TextEdit);
  });
  test("redo after recording new operation should work", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "Edit 1");
    await timeline.undoToLastCheckpoint();
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.strictEqual(timeline.canUndo.get(), true);
  });
  test("redo when there is no checkpoint after operation", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 8), text: "edit1" }]
    ));
    const startCheckpoint = timeline.getCheckpointIdForRequest("req1", void 0);
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    const state = timeline.getStateForPersistence();
    assert.ok(state.currentEpoch > 1);
  });
  test("getContentAtStop returns empty for non-existent file", async function() {
    const uri = URI.parse("file:///nonexistent.txt");
    const content = await timeline.getContentAtStop("req1", uri, "stop1");
    assert.strictEqual(content, "");
  });
  test("getContentAtStop with epoch-based stopId", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    const editEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      editEpoch,
      [{ range: new Range(1, 1, 1, 8), text: "modified" }]
    ));
    const content = await timeline.getContentAtStop("req1", uri, `__epoch_${editEpoch + 1}`);
    assert.ok(content);
    assert.strictEqual(content, "modified");
  });
  test("hasFileBaseline correctly reports baseline existence", function() {
    const uri = URI.parse("file:///test.txt");
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), false);
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "initial",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("hasFileBaseline returns true for files with create operations", function() {
    const uri = URI.parse("file:///created.txt");
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), false);
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "created content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
  });
  test("hasFileBaseline distinguishes between different request IDs for create operations", function() {
    const uri = URI.parse("file:///created.txt");
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "content from req1"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req2"), false);
    assert.strictEqual(timeline.hasFileBaseline(uri, "req3"), false);
  });
  test("hasFileBaseline returns true when both baseline and create operation exist", function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "baseline content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "created content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
  });
  test("hasFileBaseline with create operation followed by edit", function() {
    const uri = URI.parse("file:///created-and-edited.txt");
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      "initial content"
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "edited content" }]
    ));
    assert.strictEqual(timeline.hasFileBaseline(uri, "req1"), true);
  });
  test("multiple text edits to same file are properly replayed", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "line1\nline2\nline3",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", void 0, "Start");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 6), text: "LINE1" }]
    ));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(2, 1, 2, 6), text: "LINE2" }]
    ));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(3, 1, 3, 6), text: "LINE3" }]
    ));
    timeline.createCheckpoint("req1", "all-edits", "All edits");
    const initialCheckpoint = timeline.getStateForPersistence().checkpoints[0];
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "all-edits"));
    assert.strictEqual(fileContents.get(uri), "LINE1\nLINE2\nLINE3");
  });
  test("checkpoint with same requestId and undoStopId is not duplicated", function() {
    timeline.createCheckpoint("req1", "stop1", "First");
    timeline.createCheckpoint("req1", "stop1", "Second");
    const checkpoints = timeline.getStateForPersistence().checkpoints;
    const req1Stop1Checkpoints = checkpoints.filter((c) => c.requestId === "req1" && c.undoStopId === "stop1");
    assert.strictEqual(req1Stop1Checkpoints.length, 1);
    assert.strictEqual(req1Stop1Checkpoints[0].label, "First");
  });
  test("finding baseline after file rename operation", async function() {
    const oldUri = URI.parse("file:///old.txt");
    const newUri = URI.parse("file:///new.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri: oldUri,
      requestId: "req1",
      content: "initial content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      oldUri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "modified content" }]
    ));
    timeline.recordFileOperation(createFileRenameOperation(
      oldUri,
      newUri,
      "req1",
      timeline.incrementEpoch()
    ));
    timeline.createCheckpoint("req1", "renamed", "After rename");
    const content = await timeline.getContentAtStop("req1", newUri, "renamed");
    assert.strictEqual(content, "modified content");
  });
  test("baseline lookup across different request IDs", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "req1 content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 13), text: "req1 modified" }]
    ));
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req2",
      content: "req2 content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req2",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 13), text: "req2 modified" }]
    ));
    timeline.createCheckpoint("req2", "stop1", "Req2 checkpoint");
    const content = await timeline.getContentAtStop("req2", uri, "stop1");
    assert.strictEqual(content, "req2 modified");
  });
  test("getContentAtStop with file that does not exist in operations", async function() {
    const uri = URI.parse("file:///test.txt");
    timeline.recordFileBaseline(upcastPartial({
      uri,
      requestId: "req1",
      content: "content",
      epoch: timeline.incrementEpoch(),
      telemetryInfo: DEFAULT_TELEMETRY_INFO
    }));
    timeline.createCheckpoint("req1", "stop1", "Checkpoint");
    const differentUri = URI.parse("file:///different.txt");
    const content = await timeline.getContentAtStop("req1", differentUri, "stop1");
    assert.strictEqual(content, "");
  });
  test("undoToLastCheckpoint when canUndo is false does nothing", async function() {
    assert.strictEqual(timeline.canUndo.get(), false);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.undoToLastCheckpoint();
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("redoToNextCheckpoint when canRedo is false does nothing", async function() {
    assert.strictEqual(timeline.canRedo.get(), false);
    const stateBefore = timeline.getStateForPersistence();
    await timeline.redoToNextCheckpoint();
    const stateAfter = timeline.getStateForPersistence();
    assert.strictEqual(stateBefore.currentEpoch, stateAfter.currentEpoch);
  });
  test("orphaned operations and checkpoints are removed after undo and new changes", async function() {
    const uri = URI.parse("file:///test.txt");
    const createEpoch = timeline.incrementEpoch();
    timeline.recordFileOperation(createFileCreateOperation(
      uri,
      "req1",
      createEpoch,
      "initial content"
    ));
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 16), text: "first edit" }]
    ));
    timeline.createCheckpoint("req1", "stop1", "First Edit");
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 11), text: "second edit" }]
    ));
    timeline.createCheckpoint("req1", "stop2", "Second Edit");
    let state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 3);
    assert.strictEqual(state.checkpoints.length, 4);
    await timeline.navigateToCheckpoint(timeline.getCheckpointIdForRequest("req1", "stop1"));
    timeline.recordFileOperation(createTextEditOperation(
      uri,
      "req1",
      timeline.incrementEpoch(),
      [{ range: new Range(1, 1, 1, 11), text: "replacement edit" }]
    ));
    timeline.createCheckpoint("req1", "stop2-new", "Replacement Edit");
    state = timeline.getStateForPersistence();
    assert.strictEqual(state.operations.length, 3, "Should still have 3 operations (create + first + replacement)");
    assert.strictEqual(state.checkpoints.length, 4, "Should have 4 checkpoints (initial, start, stop1, stop2-new)");
    const thirdOp = state.operations[2];
    assert.strictEqual(thirdOp.type, FileOperationType.TextEdit);
    if (thirdOp.type === FileOperationType.TextEdit) {
      assert.strictEqual(thirdOp.edits[0].text, "replacement edit");
    }
    const stop2NewCheckpoint = timeline.getCheckpointIdForRequest("req1", "stop2-new");
    const stop2OldCheckpoint = timeline.getCheckpointIdForRequest("req1", "stop2");
    assert.ok(stop2NewCheckpoint, "New checkpoint should exist");
    assert.strictEqual(stop2OldCheckpoint, void 0, "Old orphaned checkpoint should be removed");
    const initialCheckpoint = state.checkpoints[0];
    const startCheckpoint = timeline.getCheckpointIdForRequest("req1", void 0);
    const stop1Checkpoint = timeline.getCheckpointIdForRequest("req1", "stop1");
    const stop2NewCheckpointId = timeline.getCheckpointIdForRequest("req1", "stop2-new");
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    assert.strictEqual(fileContents.has(uri), false);
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(fileContents.get(uri), "initial content");
    await timeline.navigateToCheckpoint(stop1Checkpoint);
    assert.strictEqual(fileContents.get(uri), "first edit");
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit");
    await timeline.navigateToCheckpoint(startCheckpoint);
    assert.strictEqual(fileContents.get(uri), "initial content");
    await timeline.navigateToCheckpoint(stop1Checkpoint);
    assert.strictEqual(fileContents.get(uri), "first edit");
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit", "Orphaned edit should never reappear");
    await timeline.navigateToCheckpoint(initialCheckpoint.checkpointId);
    await timeline.navigateToCheckpoint(stop2NewCheckpointId);
    assert.strictEqual(fileContents.get(uri), "replacement edit", "Content should still be correct after full timeline traversal");
  });
  test("undo/redo with multiple no-edit requests advances one request at a time", async function() {
    timeline.createCheckpoint("req1", void 0, "Start req1");
    timeline.createCheckpoint("req2", void 0, "Start req2");
    timeline.createCheckpoint("req3", void 0, "Start req3");
    timeline.createCheckpoint("req4", void 0, "Start req4");
    assert.strictEqual(timeline.canUndo.get(), true);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2"]);
    await timeline.undoToLastCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2", "req1"]);
    assert.strictEqual(timeline.canUndo.get(), false);
    assert.strictEqual(timeline.canRedo.get(), true);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3", "req2"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4", "req3"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), ["req4"]);
    await timeline.redoToNextCheckpoint();
    assert.deepStrictEqual(timeline.requestDisablement.get().map((d) => d.requestId), []);
    assert.strictEqual(timeline.canRedo.get(), false);
  });
});
class TestNotebookService {
  getNotebookTextModel() {
    return void 0;
  }
  hasSupportedNotebooks() {
    return false;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZUltcGwsIElDaGF0RWRpdGluZ1RpbWVsaW5lRnNEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdDaGVja3BvaW50VGltZWxpbmVJbXBsLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIEZpbGVPcGVyYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ09wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSU1vZGlmaWVkRW50cnlUZWxlbWV0cnlJbmZvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0NoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgdGltZWxpbmU6IENoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbDtcblx0bGV0IGZpbGVDb250ZW50czogUmVzb3VyY2VNYXA8c3RyaW5nPjtcblx0bGV0IGZpbGVEZWxlZ2F0ZTogSUNoYXRFZGl0aW5nVGltZWxpbmVGc0RlbGVnYXRlO1xuXG5cdGNvbnN0IERFRkFVTFRfVEVMRU1FVFJZX0lORk86IElNb2RpZmllZEVudHJ5VGVsZW1ldHJ5SW5mbyA9IHVwY2FzdFBhcnRpYWwoe1xuXHRcdGFnZW50SWQ6ICd0ZXN0QWdlbnQnLFxuXHRcdGNvbW1hbmQ6IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDovL3Rlc3Qtc2Vzc2lvbicpLFxuXHRcdHJlcXVlc3RJZDogJ3Rlc3QtcmVxdWVzdCcsXG5cdFx0cmVzdWx0OiB1bmRlZmluZWQsXG5cdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdG1vZGVJZDogdW5kZWZpbmVkLFxuXHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0ZmVhdHVyZTogdW5kZWZpbmVkLFxuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbih1cmk6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcsIGVwb2NoOiBudW1iZXIsIGVkaXRzOiB7IHJhbmdlOiBSYW5nZTsgdGV4dDogc3RyaW5nIH1bXSk6IEZpbGVPcGVyYXRpb24ge1xuXHRcdHJldHVybiB1cGNhc3RQYXJ0aWFsPEZpbGVPcGVyYXRpb24+KHtcblx0XHRcdHR5cGU6IEZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0LFxuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0ZXBvY2gsXG5cdFx0XHRlZGl0c1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbih1cmk6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcsIGVwb2NoOiBudW1iZXIsIGluaXRpYWxDb250ZW50OiBzdHJpbmcpOiBGaWxlT3BlcmF0aW9uIHtcblx0XHRyZXR1cm4gdXBjYXN0UGFydGlhbDxGaWxlT3BlcmF0aW9uPih7XG5cdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5DcmVhdGUsXG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRlcG9jaCxcblx0XHRcdGluaXRpYWxDb250ZW50XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVGaWxlRGVsZXRlT3BlcmF0aW9uKHVyaTogVVJJLCByZXF1ZXN0SWQ6IHN0cmluZywgZXBvY2g6IG51bWJlciwgZmluYWxDb250ZW50OiBzdHJpbmcpOiBGaWxlT3BlcmF0aW9uIHtcblx0XHRyZXR1cm4gdXBjYXN0UGFydGlhbDxGaWxlT3BlcmF0aW9uPih7XG5cdFx0XHR0eXBlOiBGaWxlT3BlcmF0aW9uVHlwZS5EZWxldGUsXG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRlcG9jaCxcblx0XHRcdGZpbmFsQ29udGVudFxuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRmlsZVJlbmFtZU9wZXJhdGlvbihvbGRVcmk6IFVSSSwgbmV3VXJpOiBVUkksIHJlcXVlc3RJZDogc3RyaW5nLCBlcG9jaDogbnVtYmVyKTogRmlsZU9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8RmlsZU9wZXJhdGlvbj4oe1xuXHRcdFx0dHlwZTogRmlsZU9wZXJhdGlvblR5cGUuUmVuYW1lLFxuXHRcdFx0dXJpOiBuZXdVcmksXG5cdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRlcG9jaCxcblx0XHRcdG9sZFVyaSxcblx0XHRcdG5ld1VyaVxuXHRcdH0pO1xuXHR9XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGZpbGVDb250ZW50cyA9IG5ldyBSZXNvdXJjZU1hcDxzdHJpbmc+KCk7XG5cblx0XHRmaWxlRGVsZWdhdGUgPSB7XG5cdFx0XHRjcmVhdGVGaWxlOiBhc3luYyAodXJpOiBVUkksIGluaXRpYWxDb250ZW50OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0ZmlsZUNvbnRlbnRzLnNldCh1cmksIGluaXRpYWxDb250ZW50KTtcblx0XHRcdH0sXG5cdFx0XHRkZWxldGVGaWxlOiBhc3luYyAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0ZmlsZUNvbnRlbnRzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0fSxcblx0XHRcdHJlbmFtZUZpbGU6IGFzeW5jIChmcm9tVXJpOiBVUkksIHRvVXJpOiBVUkkpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGZpbGVDb250ZW50cy5nZXQoZnJvbVVyaSk7XG5cdFx0XHRcdGlmIChjb250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRmaWxlQ29udGVudHMuc2V0KHRvVXJpLCBjb250ZW50KTtcblx0XHRcdFx0XHRmaWxlQ29udGVudHMuZGVsZXRlKGZyb21VcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c2V0Q29udGVudHM6IGFzeW5jICh1cmk6IFVSSSwgY29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGZpbGVDb250ZW50cy5zZXQodXJpLCBjb250ZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElOb3RlYm9va1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0Tm90ZWJvb2tTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5zdGEgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkuY3JlYXRlQ2hpbGQoY29sbGVjdGlvbikpO1xuXG5cdFx0dGltZWxpbmUgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdGluZ0NoZWNrcG9pbnRUaW1lbGluZUltcGwsIFVSSS5wYXJzZSgnY2hhdDovL3Rlc3Qtc2Vzc2lvbicpLCBmaWxlRGVsZWdhdGUpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlcyBpbml0aWFsIGNoZWNrcG9pbnQgb24gY29uc3RydWN0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3BvaW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3BvaW50c1swXS5yZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrcG9pbnRzWzBdLmxhYmVsLCAnSW5pdGlhbCBTdGF0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5VbmRvIGFuZCBjYW5SZWRvIGFyZSBpbml0aWFsbHkgZmFsc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuUmVkby5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVDaGVja3BvaW50IGluY3JlbWVudHMgZXBvY2ggYW5kIGNyZWF0ZXMgY2hlY2twb2ludCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBpbml0aWFsRXBvY2ggPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuZXBvY2hDb3VudGVyO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdDaGVja3BvaW50IDEnKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jaGVja3BvaW50cy5sZW5ndGgsIDIpOyAvLyBJbml0aWFsICsgbmV3IGNoZWNrcG9pbnRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY2hlY2twb2ludHNbMV0ucmVxdWVzdElkLCAncmVxMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jaGVja3BvaW50c1sxXS51bmRvU3RvcElkLCAnc3RvcDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY2hlY2twb2ludHNbMV0ubGFiZWwsICdDaGVja3BvaW50IDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuZXBvY2hDb3VudGVyLCBpbml0aWFsRXBvY2ggKyAxKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQ2hlY2twb2ludCBkb2VzIG5vdCBjcmVhdGUgZHVwbGljYXRlIGNoZWNrcG9pbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQ2hlY2twb2ludCAxJyk7XG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdDaGVja3BvaW50IDEgRHVwbGljYXRlJyk7XG5cblx0XHRjb25zdCBjaGVja3BvaW50cyA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50cztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2twb2ludHMubGVuZ3RoLCAyKTsgLy8gT25seSBpbml0aWFsICsgZmlyc3QgY2hlY2twb2ludFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja3BvaW50c1sxXS5sYWJlbCwgJ0NoZWNrcG9pbnQgMScpOyAvLyBPcmlnaW5hbCBsYWJlbCBwcmVzZXJ2ZWRcblx0fSk7XG5cblx0dGVzdCgnaW5jcmVtZW50RXBvY2ggaW5jcmVhc2VzIGVwb2NoIGNvdW50ZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgaW5pdGlhbEVwb2NoID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmVwb2NoQ291bnRlcjtcblxuXHRcdGNvbnN0IGVwb2NoMSA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0Y29uc3QgZXBvY2gyID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcG9jaDEsIGluaXRpYWxFcG9jaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVwb2NoMiwgaW5pdGlhbEVwb2NoICsgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5lcG9jaENvdW50ZXIsIGluaXRpYWxFcG9jaCArIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRGaWxlQmFzZWxpbmUgc3RvcmVzIGJhc2VsaW5lJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXHRcdGNvbnN0IGJhc2VsaW5lID0gdXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsIGNvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IDEsXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUoYmFzZWxpbmUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXExJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMicpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZEZpbGVPcGVyYXRpb24gc3RvcmVzIG9wZXJhdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnaGVsbG8nIH1dXG5cdFx0KTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24ob3BlcmF0aW9uKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVyYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLm9wZXJhdGlvbnNbMF0udHlwZSwgRmlsZU9wZXJhdGlvblR5cGUuVGV4dEVkaXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5vcGVyYXRpb25zWzBdLnJlcXVlc3RJZCwgJ3JlcTEnKTtcblx0fSk7XG5cblx0dGVzdCgnYmFzaWMgdW5kby9yZWRvIHdpdGggdGV4dCBlZGl0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIFJlY29yZCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2hlbGxvJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdC8vIENyZWF0ZSBjaGVja3BvaW50IGJlZm9yZSBlZGl0IC0gbWFya3Mgc3RhdGUgd2l0aCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCBvZiBSZXF1ZXN0Jyk7XG5cblx0XHQvLyBSZWNvcmQgZWRpdCBhdCBhIG5ldyBlcG9jaFxuXHRcdGNvbnN0IGVkaXRFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGVkaXRFcG9jaCxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICdnb29kYnllJyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIGNoZWNrcG9pbnQgYWZ0ZXIgZWRpdCAtIG1hcmtzIHN0YXRlIHdpdGggZWRpdCBhcHBsaWVkXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdBZnRlciBFZGl0Jyk7XG5cblx0XHQvLyBjYW5VbmRvIGFuZCBjYW5SZWRvIGFyZSBiYXNlZCBvbiBjaGVja3BvaW50IHBvc2l0aW9ucywgbm90IGRlbGVnYXRlIHN0YXRlXG5cdFx0Ly8gV2UgaGF2ZTogSW5pdGlhbCwgU3RhcnQgb2YgUmVxdWVzdCwgQWZ0ZXIgRWRpdFxuXHRcdC8vIEN1cnJlbnQgZXBvY2ggaXMgYWZ0ZXIgJ0FmdGVyIEVkaXQnLCBzbyB3ZSBjYW4gdW5kbyBidXQgbm90IHJlZG9cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblxuXHRcdC8vIFVuZG8gKGdvZXMgdG8gc3RhcnQgb2YgcmVxdWVzdClcblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXG5cdFx0Ly8gQWZ0ZXIgdW5kb2luZyB0byBzdGFydCBvZiByZXF1ZXN0LCB3ZSBjYW4ndCB1bmRvIHdpdGhpbiB0aGlzIHJlcXVlc3QgYW55bW9yZVxuXHRcdC8vIGJ1dCB3ZSBjYW4gcmVkbyB0byB0aGUgJ3N0b3AxJyBjaGVja3BvaW50XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIGZhbHNlKTsgLy8gTm8gbW9yZSB1bmRvIHN0b3BzIGluIHJlcTEgYmVmb3JlIHRoaXNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuUmVkby5nZXQoKSwgdHJ1ZSk7IC8vIENhbiByZWRvIHRvICdzdG9wMSdcblxuXHRcdC8vIFJlZG9cblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXG5cdFx0Ly8gQWZ0ZXIgcmVkbyB0byAnc3RvcDEnLCB3ZSBjYW4gdW5kbyBhZ2FpblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCB0cnVlKTtcblx0XHQvLyBjYW5SZWRvIG1pZ2h0IHN0aWxsIGJlIHRydWUgaWYgY3VycmVudEVwb2NoIGlzIGxlc3MgdGhhbiB0aGUgbWF4IGVwb2NoXG5cdFx0Ly8gVGhpcyBpcyBiZWNhdXNlIGNoZWNrcG9pbnRzIGFyZSBjcmVhdGVkIHdpdGggaW5jcmVtZW50RXBvY2gsIHNvIHRoZXJlIGFyZSBlcG9jaHMgYWZ0ZXIgdGhlbVxuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIGNyZWF0aW9uIGFuZCBkZWxldGlvbiBvcGVyYXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9uZXcudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgZmlsZVxuXHRcdGNvbnN0IGNyZWF0ZUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblxuXHRcdC8vIFJlY29yZCBiYXNlbGluZSBmb3IgdGhlIGNyZWF0ZWQgZmlsZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ25ldyBmaWxlIGNvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IGNyZWF0ZUVwb2NoLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGNyZWF0ZUVwb2NoLFxuXHRcdFx0J25ldyBmaWxlIGNvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHQvLyBDaGVja3BvaW50IG1hcmtzIHN0YXRlIGFmdGVyIGZpbGUgY3JlYXRpb25cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ2NyZWF0ZWQnLCAnRmlsZSBDcmVhdGVkJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBpbml0aWFsIHRvIHN5bmMgZGVsZWdhdGUsIHRoZW4gdG8gY3JlYXRlZFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50c1swXS5jaGVja3BvaW50SWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKHVyaSksIGZhbHNlKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGNyZWF0ZWQgY2hlY2twb2ludFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnY3JlYXRlZCcpISk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ25ldyBmaWxlIGNvbnRlbnQnKTtcblxuXHRcdC8vIERlbGV0ZSBmaWxlXG5cdFx0Y29uc3QgZGVsZXRlRXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZURlbGV0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGRlbGV0ZUVwb2NoLFxuXHRcdFx0J25ldyBmaWxlIGNvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ2RlbGV0ZWQnLCAnRmlsZSBEZWxldGVkJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBiYWNrIHRvIGluaXRpYWwsIHRoZW4gdG8gZGVsZXRlZCB0byBwcm9wZXJseSBhcHBseSBvcGVyYXRpb25zXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzWzBdLmNoZWNrcG9pbnRJZCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdkZWxldGVkJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyh1cmkpLCBmYWxzZSk7XG5cblx0XHQvLyBVbmRvIGRlbGV0aW9uIC0gZ29lcyBiYWNrIHRvICdjcmVhdGVkJyBjaGVja3BvaW50XG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnbmV3IGZpbGUgY29udGVudCcpO1xuXG5cdFx0Ly8gVW5kbyBjcmVhdGlvbiAtIGdvZXMgYmFjayB0byBpbml0aWFsIHN0YXRlXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyh1cmkpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgcmVuYW1lIG9wZXJhdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb2xkVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL29sZC50eHQnKTtcblx0XHRjb25zdCBuZXdVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbmV3LnR4dCcpO1xuXG5cdFx0Ly8gQ3JlYXRlIGluaXRpYWwgZmlsZVxuXHRcdGNvbnN0IGNyZWF0ZUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblxuXHRcdC8vIFJlY29yZCBiYXNlbGluZSBmb3IgdGhlIGNyZWF0ZWQgZmlsZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaTogb2xkVXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnY29udGVudCcsXG5cdFx0XHRlcG9jaDogY3JlYXRlRXBvY2gsXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0b2xkVXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0Y3JlYXRlRXBvY2gsXG5cdFx0XHQnY29udGVudCdcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnY3JlYXRlZCcsICdGaWxlIENyZWF0ZWQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGluaXRpYWwsIHRoZW4gdG8gY3JlYXRlZCB0byBhcHBseSBjcmVhdGUgb3BlcmF0aW9uXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLmNoZWNrcG9pbnRzWzBdLmNoZWNrcG9pbnRJZCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdjcmVhdGVkJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldChvbGRVcmkpLCAnY29udGVudCcpO1xuXG5cdFx0Ly8gUmVuYW1lIGZpbGVcblx0XHRjb25zdCByZW5hbWVFcG9jaCA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlUmVuYW1lT3BlcmF0aW9uKFxuXHRcdFx0b2xkVXJpLFxuXHRcdFx0bmV3VXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0cmVuYW1lRXBvY2hcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAncmVuYW1lZCcsICdGaWxlIFJlbmFtZWQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIGJhY2sgdG8gaW5pdGlhbCwgdGhlbiB0byByZW5hbWVkIHRvIHByb3Blcmx5IGFwcGx5IG9wZXJhdGlvbnNcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHNbMF0uY2hlY2twb2ludElkKTtcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3JlbmFtZWQnKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKG9sZFVyaSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldChuZXdVcmkpLCAnY29udGVudCcpO1xuXG5cdFx0Ly8gVW5kbyByZW5hbWUgLSBnb2VzIGJhY2sgdG8gJ2NyZWF0ZWQnIGNoZWNrcG9pbnRcblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KG9sZFVyaSksICdjb250ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXMobmV3VXJpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzZXF1ZW50aWFsIGVkaXRzIHRvIHNhbWUgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIFJlY29yZCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2xpbmUxXFxubGluZTJcXG5saW5lMycsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQnKTtcblxuXHRcdC8vIEZpcnN0IGVkaXRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIHRleHQ6ICdMSU5FMScgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnZWRpdDEnLCAnRWRpdCAxJyk7XG5cblx0XHQvLyBTZWNvbmQgZWRpdFxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgyLCAxLCAyLCA2KSwgdGV4dDogJ0xJTkUyJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdlZGl0MicsICdFZGl0IDInKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIGZpcnN0IGVkaXRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ2VkaXQxJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnTElORTFcXG5saW5lMlxcbmxpbmUzJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBzZWNvbmQgZWRpdFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnZWRpdDInKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdMSU5FMVxcbkxJTkUyXFxubGluZTMnKTtcblxuXHRcdC8vIE5hdmlnYXRlIGJhY2sgdG8gc3RhcnRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgdW5kZWZpbmVkKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdsaW5lMVxcbmxpbmUyXFxubGluZTMnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCByZXR1cm5zIGNvcnJlY3QgY2hlY2twb2ludCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgb2YgcmVxMScpO1xuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnU3RvcCAxJyk7XG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMicsIHVuZGVmaW5lZCwgJ1N0YXJ0IG9mIHJlcTInKTtcblxuXHRcdGNvbnN0IHJlcTFTdGFydCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHJlcTFTdG9wID0gdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdzdG9wMScpO1xuXHRcdGNvbnN0IHJlcTJTdGFydCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTInLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlcTFTdGFydCk7XG5cdFx0YXNzZXJ0Lm9rKHJlcTFTdG9wKTtcblx0XHRhc3NlcnQub2socmVxMlN0YXJ0KTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVxMVN0YXJ0LCByZXExU3RvcCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlcTFTdGFydCwgcmVxMlN0YXJ0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCByZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLWV4aXN0ZW50IGNoZWNrcG9pbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ25vbmV4aXN0ZW50JywgJ3N0b3AxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrcG9pbnQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVlc3REaXNhYmxlbWVudCB0cmFja3MgZGlzYWJsZWQgcmVxdWVzdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMScpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbih1cmksICdyZXExJywgdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSwgJ2EnKSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ1N0b3AgcmVxMScpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24odXJpLCAncmVxMScsIHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIHRleHQ6ICdiJyB9XSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMicsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTInKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKHVyaSwgJ3JlcTInLCB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIpLCB0ZXh0OiAnYycgfV0pKTtcblxuXHRcdC8vIFVuZG8gc2VxdWVuY2U6XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtdKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnVuZG9Ub0xhc3RDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2InKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKSwgW1xuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXEyJywgYWZ0ZXJVbmRvU3RvcDogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMicsIGFmdGVyVW5kb1N0b3A6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXExJywgYWZ0ZXJVbmRvU3RvcDogJ3N0b3AxJyB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcTInLCBhZnRlclVuZG9TdG9wOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMScsIGFmdGVyVW5kb1N0b3A6IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXG5cdFx0Ly8gUmVkbyBzZXF1ZW5jZTpcblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdhJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCksIFtcblx0XHRcdHsgcmVxdWVzdElkOiAncmVxMicsIGFmdGVyVW5kb1N0b3A6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyByZXF1ZXN0SWQ6ICdyZXExJywgYWZ0ZXJVbmRvU3RvcDogJ3N0b3AxJyB9LFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLCBbXG5cdFx0XHR7IHJlcXVlc3RJZDogJ3JlcTInLCBhZnRlclVuZG9TdG9wOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2MnKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdGVuY2UgLSBzYXZlIGFuZCByZXN0b3JlIHN0YXRlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gU2V0dXAgc29tZSBzdGF0ZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRWRpdCBDb21wbGV0ZScpO1xuXG5cdFx0Ly8gU2F2ZSBzdGF0ZVxuXHRcdGNvbnN0IHNhdmVkU3RhdGUgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cblx0XHQvLyBDcmVhdGUgbmV3IHRpbWVsaW5lIGFuZCByZXN0b3JlXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElOb3RlYm9va1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihUZXN0Tm90ZWJvb2tTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgaW5zdGEgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkuY3JlYXRlQ2hpbGQoY29sbGVjdGlvbikpO1xuXG5cdFx0Y29uc3QgbmV3VGltZWxpbmUgPSBpbnN0YS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRFZGl0aW5nQ2hlY2twb2ludFRpbWVsaW5lSW1wbCxcblx0XHRcdFVSSS5wYXJzZSgnY2hhdDovL3Rlc3Qtc2Vzc2lvbi0yJyksXG5cdFx0XHRmaWxlRGVsZWdhdGVcblx0XHQpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bmV3VGltZWxpbmUucmVzdG9yZUZyb21TdGF0ZShzYXZlZFN0YXRlLCB0eCk7XG5cdFx0fSk7XG5cblx0XHQvLyBWZXJpZnkgc3RhdGUgd2FzIHJlc3RvcmVkXG5cdFx0Y29uc3QgcmVzdG9yZWRTdGF0ZSA9IG5ld1RpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWRTdGF0ZS5jaGVja3BvaW50cy5sZW5ndGgsIHNhdmVkU3RhdGUuY2hlY2twb2ludHMubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdG9yZWRTdGF0ZS5vcGVyYXRpb25zLmxlbmd0aCwgc2F2ZWRTdGF0ZS5vcGVyYXRpb25zLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU3RhdGUuY3VycmVudEVwb2NoLCBzYXZlZFN0YXRlLmN1cnJlbnRFcG9jaCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3RvcmVkU3RhdGUuZXBvY2hDb3VudGVyLCBzYXZlZFN0YXRlLmVwb2NoQ291bnRlcik7XG5cdH0pO1xuXG5cdHRlc3QoJ25hdmlnYXRpbmcgYmV0d2VlbiBtdWx0aXBsZSByZXF1ZXN0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKCdmaWxlOi8vL2ZpbGUxLnR4dCcpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vZmlsZTIudHh0Jyk7XG5cblx0XHQvLyBSZXF1ZXN0IDEgLSBjcmVhdGUgZmlsZVxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCByZXExJyk7XG5cblx0XHRjb25zdCBjcmVhdGUxRXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaTogdXJpMSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2ZpbGUxIG1vZGlmaWVkJyxcblx0XHRcdGVwb2NoOiBjcmVhdGUxRXBvY2gsXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0dXJpMSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGNyZWF0ZTFFcG9jaCxcblx0XHRcdCdmaWxlMSBtb2RpZmllZCdcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnUmVxMSBjb21wbGV0ZScpO1xuXG5cdFx0Ly8gUmVxdWVzdCAyIC0gY3JlYXRlIGFub3RoZXIgZmlsZVxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTInLCB1bmRlZmluZWQsICdTdGFydCByZXEyJyk7XG5cblx0XHRjb25zdCBjcmVhdGUyRXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaTogdXJpMixcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTInLFxuXHRcdFx0Y29udGVudDogJ2ZpbGUyIG1vZGlmaWVkJyxcblx0XHRcdGVwb2NoOiBjcmVhdGUyRXBvY2gsXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0dXJpMixcblx0XHRcdCdyZXEyJyxcblx0XHRcdGNyZWF0ZTJFcG9jaCxcblx0XHRcdCdmaWxlMiBtb2RpZmllZCdcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTInLCAnc3RvcDEnLCAnUmVxMiBjb21wbGV0ZScpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gaW5pdGlhbCwgdGhlbiB0byByZXExIGNvbXBsZXRpb24gdG8gYXBwbHkgaXRzIG9wZXJhdGlvbnNcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHNbMF0uY2hlY2twb2ludElkKTtcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AxJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkxKSwgJ2ZpbGUxIG1vZGlmaWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXModXJpMiksIGZhbHNlKTsgLy8gcmVxMiBoYXNuJ3QgaGFwcGVuZWQgeWV0XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byByZXEyIGNvbXBsZXRpb25cblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludCh0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXEyJywgJ3N0b3AxJykhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkxKSwgJ2ZpbGUxIG1vZGlmaWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpMiksICdmaWxlMiBtb2RpZmllZCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgYmFjayB0byBpbml0aWFsIHN0YXRlIGJ5IGdldHRpbmcgdGhlIGZpcnN0IGNoZWNrcG9pbnRcblx0XHRjb25zdCBpbml0aWFsQ2hlY2twb2ludCA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50c1swXTtcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChpbml0aWFsQ2hlY2twb2ludC5jaGVja3BvaW50SWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuaGFzKHVyaTEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5oYXModXJpMiksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29udGVudFVSSUF0U3RvcCByZXR1cm5zIHNuYXBzaG90IFVSSScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cdFx0Y29uc3Qgc25hcHNob3RVcmkgPSB0aW1lbGluZS5nZXRDb250ZW50VVJJQXRTdG9wKCdyZXExJywgZmlsZVVyaSwgJ3N0b3AxJyk7XG5cblx0XHRhc3NlcnQub2soc25hcHNob3RVcmkpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChzbmFwc2hvdFVyaS50b1N0cmluZygpLCBmaWxlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5vayhzbmFwc2hvdFVyaS50b1N0cmluZygpLmluY2x1ZGVzKCdyZXExJykpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmRvaW5nIGVudGlyZSByZXF1ZXN0IHdoZW4gYXBwcm9wcmlhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgaW5pdGlhbCBiYXNlbGluZSBhbmQgY2hlY2twb2ludFxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0IHJlcTEnKTtcblxuXHRcdC8vIFNpbmdsZSBlZGl0IHdpdGggY2hlY2twb2ludFxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA4KSwgdGV4dDogJ21vZGlmaWVkJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdFZGl0IGNvbXBsZXRlJyk7XG5cblx0XHQvLyBTaG91bGQgYmUgYWJsZSB0byB1bmRvXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXG5cdFx0Ly8gVW5kbyBzaG91bGQgZ28gYmFjayB0byBzdGFydCBvZiByZXF1ZXN0LCBub3QganVzdCBwcmV2aW91cyBjaGVja3BvaW50XG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblxuXHRcdC8vIFZlcmlmeSB3ZSdyZSBhdCB0aGUgc3RhcnQgb2YgcmVxMSwgd2hpY2ggaGFzIGVwb2NoIDIgKDAgPSBpbml0aWFsLCAxID0gYmFzZWxpbmUsIDIgPSBzdGFydCBjaGVja3BvaW50KVxuXHRcdGNvbnN0IHN0YXRlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jdXJyZW50RXBvY2gsIDIpOyAvLyBTaG91bGQgYmUgYXQgdGhlIFwiU3RhcnQgcmVxMVwiIGNoZWNrcG9pbnQgZXBvY2hcblx0fSk7XG5cblx0dGVzdCgnb3BlcmF0aW9ucyB1c2UgaW5jcmVtZW50aW5nIGVwb2NocycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdGNvbnN0IGVwb2NoMSA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGVwb2NoMSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdlZGl0MScgfV1cblx0XHQpKTtcblxuXHRcdGNvbnN0IGVwb2NoMiA9IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCk7XG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGVwb2NoMixcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIHRleHQ6ICdlZGl0MicgfV1cblx0XHQpKTtcblxuXHRcdC8vIEJvdGggb3BlcmF0aW9ucyBzaG91bGQgYmUgcmVjb3JkZWRcblx0XHRjb25zdCBvcGVyYXRpb25zID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpLm9wZXJhdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wZXJhdGlvbnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlcmF0aW9uc1swXS5lcG9jaCwgZXBvY2gxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3BlcmF0aW9uc1sxXS5lcG9jaCwgZXBvY2gyKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGVUb0NoZWNrcG9pbnQgdGhyb3dzIGVycm9yIGZvciBpbnZhbGlkIGNoZWNrcG9pbnQgSUQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGVycm9yVGhyb3duID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KCdpbnZhbGlkLWNoZWNrcG9pbnQtaWQnKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZXJyb3JUaHJvd24gPSB0cnVlO1xuXHRcdFx0YXNzZXJ0Lm9rKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm9rKChlcnJvciBhcyBFcnJvcikubWVzc2FnZS5pbmNsdWRlcygnbm90IGZvdW5kJykpO1xuXHRcdH1cblx0XHRhc3NlcnQub2soZXJyb3JUaHJvd24sICdFeHBlY3RlZCBlcnJvciB0byBiZSB0aHJvd24nKTtcblx0fSk7XG5cblx0dGVzdCgnbmF2aWdhdGVUb0NoZWNrcG9pbnQgZG9lcyBub3RoaW5nIHdoZW4gYWxyZWFkeSBhdCB0YXJnZXQgZXBvY2gnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYmFzZWxpbmUgYW5kIG9wZXJhdGlvblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlRXBvY2ggPSB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpO1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHRjcmVhdGVFcG9jaCxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnQ2hlY2twb2ludCcpO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gY2hlY2twb2ludFxuXHRcdGNvbnN0IGNoZWNrcG9pbnRJZCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDEnKSE7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoY2hlY2twb2ludElkKTtcblxuXHRcdC8vIE5hdmlnYXRlIGFnYWluIHRvIHNhbWUgY2hlY2twb2ludCAtIHNob3VsZCBiZSBhIG5vLW9wXG5cdFx0Y29uc3Qgc3RhdGVCZWZvcmUgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoY2hlY2twb2ludElkKTtcblx0XHRjb25zdCBzdGF0ZUFmdGVyID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlQmVmb3JlLmN1cnJlbnRFcG9jaCwgc3RhdGVBZnRlci5jdXJyZW50RXBvY2gpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRpbmcgb3BlcmF0aW9uIGFmdGVyIHVuZG8gdHJ1bmNhdGVzIGZ1dHVyZSBoaXN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gU2V0dXAgaW5pdGlhbCBvcGVyYXRpb25zXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnaW5pdGlhbCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA4KSwgdGV4dDogJ2VkaXQxJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdFZGl0IDEnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgdGV4dDogJ2VkaXQyJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMicsICdFZGl0IDInKTtcblxuXHRcdGNvbnN0IHN0YXRlV2l0aFR3b0VkaXRzID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZVdpdGhUd29FZGl0cy5vcGVyYXRpb25zLmxlbmd0aCwgMik7XG5cblx0XHQvLyBVbmRvIHRvIHN0b3AxXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQodGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdzdG9wMScpISk7XG5cblx0XHQvLyBSZWNvcmQgbmV3IG9wZXJhdGlvbiAtIHRoaXMgc2hvdWxkIHRydW5jYXRlIHRoZSBzZWNvbmQgZWRpdFxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgdGV4dDogJ2VkaXQzJyB9XVxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgc3RhdGVBZnRlck5ld0VkaXQgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlQWZ0ZXJOZXdFZGl0Lm9wZXJhdGlvbnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVBZnRlck5ld0VkaXQub3BlcmF0aW9uc1sxXS50eXBlLCBGaWxlT3BlcmF0aW9uVHlwZS5UZXh0RWRpdCk7XG5cdFx0Ly8gVGhlIHNlY29uZCBvcGVyYXRpb24gc2hvdWxkIGJlIHRoZSBuZXcgZWRpdDMsIG5vdCBlZGl0MlxuXHR9KTtcblxuXHR0ZXN0KCdyZWRvIGFmdGVyIHJlY29yZGluZyBuZXcgb3BlcmF0aW9uIHNob3VsZCB3b3JrJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMScsXG5cdFx0XHRjb250ZW50OiAnaW5pdGlhbCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA4KSwgdGV4dDogJ2VkaXQxJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdFZGl0IDEnKTtcblxuXHRcdC8vIFVuZG9cblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5SZWRvLmdldCgpLCB0cnVlKTtcblxuXHRcdC8vIFJlZG9cblx0XHRhd2FpdCB0aW1lbGluZS5yZWRvVG9OZXh0Q2hlY2twb2ludCgpO1xuXG5cdFx0Ly8gQWZ0ZXIgcmVkbywgY2FuUmVkbyBkZXBlbmRzIG9uIHdoZXRoZXIgd2UncmUgYXQgdGhlIGxhdGVzdCBlcG9jaFxuXHRcdC8vIFNpbmNlIHdlIGNyZWF0ZWQgYSBjaGVja3BvaW50IGFmdGVyIHRoZSBvcGVyYXRpb24sIGN1cnJlbnRFcG9jaCBpcyBhaGVhZFxuXHRcdC8vIG9mIHRoZSBjaGVja3BvaW50IGVwb2NoLCBzbyBjYW5SZWRvIG1heSBzdGlsbCBiZSB0cnVlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWRvIHdoZW4gdGhlcmUgaXMgbm8gY2hlY2twb2ludCBhZnRlciBvcGVyYXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCcpO1xuXG5cdFx0Ly8gUmVjb3JkIG9wZXJhdGlvbiBidXQgZG9uJ3QgY3JlYXRlIGNoZWNrcG9pbnQgYWZ0ZXIgaXRcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIHRleHQ6ICdlZGl0MScgfV1cblx0XHQpKTtcblxuXHRcdC8vIFVuZG8gdG8gc3RhcnRcblx0XHRjb25zdCBzdGFydENoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgdW5kZWZpbmVkKSE7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoc3RhcnRDaGVja3BvaW50KTtcblxuXHRcdC8vIFNob3VsZCBiZSBhYmxlIHRvIHJlZG8gZXZlbiB3aXRob3V0IGEgY2hlY2twb2ludCBhZnRlciB0aGUgb3BlcmF0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIHRydWUpO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0XHQvLyBBZnRlciByZWRvLCB3ZSBzaG91bGQgYmUgYXQgdGhlIG9wZXJhdGlvbidzIGVwb2NoICsgMVxuXHRcdGNvbnN0IHN0YXRlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGFzc2VydC5vayhzdGF0ZS5jdXJyZW50RXBvY2ggPiAxKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29udGVudEF0U3RvcCByZXR1cm5zIGVtcHR5IGZvciBub24tZXhpc3RlbnQgZmlsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vbm9uZXhpc3RlbnQudHh0Jyk7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AoJ3JlcTEnLCB1cmksICdzdG9wMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICcnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q29udGVudEF0U3RvcCB3aXRoIGVwb2NoLWJhc2VkIHN0b3BJZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWRpdEVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0ZWRpdEVwb2NoLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA4KSwgdGV4dDogJ21vZGlmaWVkJyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gVXNlIGVwb2NoLWJhc2VkIHN0b3AgSURcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGltZWxpbmUuZ2V0Q29udGVudEF0U3RvcCgncmVxMScsIHVyaSwgYF9fZXBvY2hfJHtlZGl0RXBvY2ggKyAxfWApO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LCAnbW9kaWZpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzRmlsZUJhc2VsaW5lIGNvcnJlY3RseSByZXBvcnRzIGJhc2VsaW5lIGV4aXN0ZW5jZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCBmYWxzZSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdpbml0aWFsJyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuaGFzRmlsZUJhc2VsaW5lKHVyaSwgJ3JlcTInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXNGaWxlQmFzZWxpbmUgcmV0dXJucyB0cnVlIGZvciBmaWxlcyB3aXRoIGNyZWF0ZSBvcGVyYXRpb25zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jcmVhdGVkLnR4dCcpO1xuXG5cdFx0Ly8gSW5pdGlhbGx5LCBubyBiYXNlbGluZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCBmYWxzZSk7XG5cblx0XHQvLyBSZWNvcmQgYSBjcmVhdGUgb3BlcmF0aW9uIHdpdGhvdXQgcmVjb3JkaW5nIGFuIGV4cGxpY2l0IGJhc2VsaW5lXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdCdjcmVhdGVkIGNvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHQvLyBoYXNGaWxlQmFzZWxpbmUgc2hvdWxkIG5vdyByZXR1cm4gdHJ1ZSBiZWNhdXNlIG9mIHRoZSBjcmVhdGUgb3BlcmF0aW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXExJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMicpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhc0ZpbGVCYXNlbGluZSBkaXN0aW5ndWlzaGVzIGJldHdlZW4gZGlmZmVyZW50IHJlcXVlc3QgSURzIGZvciBjcmVhdGUgb3BlcmF0aW9ucycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vY3JlYXRlZC50eHQnKTtcblxuXHRcdC8vIFJlY29yZCBhIGNyZWF0ZSBvcGVyYXRpb24gZm9yIHJlcTFcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZUZpbGVDcmVhdGVPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0J2NvbnRlbnQgZnJvbSByZXExJ1xuXHRcdCkpO1xuXG5cdFx0Ly8gaGFzRmlsZUJhc2VsaW5lIHNob3VsZCBvbmx5IHJldHVybiB0cnVlIGZvciByZXExXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXExJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXEzJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzRmlsZUJhc2VsaW5lIHJldHVybnMgdHJ1ZSB3aGVuIGJvdGggYmFzZWxpbmUgYW5kIGNyZWF0ZSBvcGVyYXRpb24gZXhpc3QnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYm90aCBhIGJhc2VsaW5lIGFuZCBhIGNyZWF0ZSBvcGVyYXRpb25cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdiYXNlbGluZSBjb250ZW50Jyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHQnY3JlYXRlZCBjb250ZW50J1xuXHRcdCkpO1xuXG5cdFx0Ly8gU2hvdWxkIHJldHVybiB0cnVlIChjaGVja2luZyBlaXRoZXIgc291cmNlKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5oYXNGaWxlQmFzZWxpbmUodXJpLCAncmVxMScpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaGFzRmlsZUJhc2VsaW5lIHdpdGggY3JlYXRlIG9wZXJhdGlvbiBmb2xsb3dlZCBieSBlZGl0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jcmVhdGVkLWFuZC1lZGl0ZWQudHh0Jyk7XG5cblx0XHQvLyBSZWNvcmQgYSBjcmVhdGUgb3BlcmF0aW9uXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlQ3JlYXRlT3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdCdpbml0aWFsIGNvbnRlbnQnXG5cdFx0KSk7XG5cblx0XHQvLyBoYXNGaWxlQmFzZWxpbmUgc2hvdWxkIHJldHVybiB0cnVlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXExJyksIHRydWUpO1xuXG5cdFx0Ly8gUmVjb3JkIGFuIGVkaXQgb3BlcmF0aW9uIG9uIHRoZSBjcmVhdGVkIGZpbGVcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTYpLCB0ZXh0OiAnZWRpdGVkIGNvbnRlbnQnIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBoYXNGaWxlQmFzZWxpbmUgc2hvdWxkIHN0aWxsIHJldHVybiB0cnVlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmhhc0ZpbGVCYXNlbGluZSh1cmksICdyZXExJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSB0ZXh0IGVkaXRzIHRvIHNhbWUgZmlsZSBhcmUgcHJvcGVybHkgcmVwbGF5ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QudHh0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmksXG5cdFx0XHRyZXF1ZXN0SWQ6ICdyZXExJyxcblx0XHRcdGNvbnRlbnQ6ICdsaW5lMVxcbmxpbmUyXFxubGluZTMnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsIHVuZGVmaW5lZCwgJ1N0YXJ0Jyk7XG5cblx0XHQvLyBGaXJzdCBlZGl0IC0gdXBwZXJjYXNlIGxpbmUgMVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgdGV4dDogJ0xJTkUxJyB9XVxuXHRcdCkpO1xuXG5cdFx0Ly8gU2Vjb25kIGVkaXQgLSB1cHBlcmNhc2UgbGluZSAyXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDIsIDEsIDIsIDYpLCB0ZXh0OiAnTElORTInIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBUaGlyZCBlZGl0IC0gdXBwZXJjYXNlIGxpbmUgM1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgzLCAxLCAzLCA2KSwgdGV4dDogJ0xJTkUzJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdhbGwtZWRpdHMnLCAnQWxsIGVkaXRzJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBzZWUgYWxsIGVkaXRzIGFwcGxpZWRcblx0XHRjb25zdCBpbml0aWFsQ2hlY2twb2ludCA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKS5jaGVja3BvaW50c1swXTtcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChpbml0aWFsQ2hlY2twb2ludC5jaGVja3BvaW50SWQpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnYWxsLWVkaXRzJykhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdMSU5FMVxcbkxJTkUyXFxuTElORTMnKTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2twb2ludCB3aXRoIHNhbWUgcmVxdWVzdElkIGFuZCB1bmRvU3RvcElkIGlzIG5vdCBkdXBsaWNhdGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCAnc3RvcDEnLCAnRmlyc3QnKTtcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AxJywgJ1NlY29uZCcpOyAvLyBTaG91bGQgYmUgaWdub3JlZFxuXG5cdFx0Y29uc3QgY2hlY2twb2ludHMgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCkuY2hlY2twb2ludHM7XG5cdFx0Y29uc3QgcmVxMVN0b3AxQ2hlY2twb2ludHMgPSBjaGVja3BvaW50cy5maWx0ZXIoYyA9PiBjLnJlcXVlc3RJZCA9PT0gJ3JlcTEnICYmIGMudW5kb1N0b3BJZCA9PT0gJ3N0b3AxJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxMVN0b3AxQ2hlY2twb2ludHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxMVN0b3AxQ2hlY2twb2ludHNbMF0ubGFiZWwsICdGaXJzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kaW5nIGJhc2VsaW5lIGFmdGVyIGZpbGUgcmVuYW1lIG9wZXJhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBvbGRVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vb2xkLnR4dCcpO1xuXHRcdGNvbnN0IG5ld1VyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9uZXcudHh0Jyk7XG5cblx0XHQvLyBDcmVhdGUgYmFzZWxpbmUgZm9yIG9sZCBVUklcblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlQmFzZWxpbmUodXBjYXN0UGFydGlhbCh7XG5cdFx0XHR1cmk6IG9sZFVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2luaXRpYWwgY29udGVudCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0IHRoZSBmaWxlIGJlZm9yZSByZW5hbWUgKHJlcGxhY2UgZW50aXJlIGNvbnRlbnQpXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVUZXh0RWRpdE9wZXJhdGlvbihcblx0XHRcdG9sZFVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDE2KSwgdGV4dDogJ21vZGlmaWVkIGNvbnRlbnQnIH1dXG5cdFx0KSk7XG5cblx0XHQvLyBSZW5hbWUgb3BlcmF0aW9uXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZU9wZXJhdGlvbihjcmVhdGVGaWxlUmVuYW1lT3BlcmF0aW9uKFxuXHRcdFx0b2xkVXJpLFxuXHRcdFx0bmV3VXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdyZW5hbWVkJywgJ0FmdGVyIHJlbmFtZScpO1xuXG5cdFx0Ly8gR2V0IGNvbnRlbnQgYXQgdGhlIHJlbmFtZWQgVVJJIC0gc2hvdWxkIGZpbmQgdGhlIGJhc2VsaW5lIHRocm91Z2ggcmVuYW1lIGNoYWluXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AoJ3JlcTEnLCBuZXdVcmksICdyZW5hbWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdtb2RpZmllZCBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2VsaW5lIGxvb2t1cCBhY3Jvc3MgZGlmZmVyZW50IHJlcXVlc3QgSURzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gRmlyc3QgcmVxdWVzdCBiYXNlbGluZVxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ3JlcTEgY29udGVudCcsXG5cdFx0XHRlcG9jaDogdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdHRlbGVtZXRyeUluZm86IERFRkFVTFRfVEVMRU1FVFJZX0lORk9cblx0XHR9KSk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTMpLCB0ZXh0OiAncmVxMSBtb2RpZmllZCcgfV1cblx0XHQpKTtcblxuXHRcdC8vIFNlY29uZCByZXF1ZXN0IGJhc2VsaW5lXG5cdFx0dGltZWxpbmUucmVjb3JkRmlsZUJhc2VsaW5lKHVwY2FzdFBhcnRpYWwoe1xuXHRcdFx0dXJpLFxuXHRcdFx0cmVxdWVzdElkOiAncmVxMicsXG5cdFx0XHRjb250ZW50OiAncmVxMiBjb250ZW50Jyxcblx0XHRcdGVwb2NoOiB0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0dGVsZW1ldHJ5SW5mbzogREVGQVVMVF9URUxFTUVUUllfSU5GT1xuXHRcdH0pKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMicsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMyksIHRleHQ6ICdyZXEyIG1vZGlmaWVkJyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMicsICdzdG9wMScsICdSZXEyIGNoZWNrcG9pbnQnKTtcblxuXHRcdC8vIEdldHRpbmcgY29udGVudCBzaG91bGQgdXNlIHJlcTIgYmFzZWxpbmVcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGltZWxpbmUuZ2V0Q29udGVudEF0U3RvcCgncmVxMicsIHVyaSwgJ3N0b3AxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICdyZXEyIG1vZGlmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbnRlbnRBdFN0b3Agd2l0aCBmaWxlIHRoYXQgZG9lcyBub3QgZXhpc3QgaW4gb3BlcmF0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVCYXNlbGluZSh1cGNhc3RQYXJ0aWFsKHtcblx0XHRcdHVyaSxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcTEnLFxuXHRcdFx0Y29udGVudDogJ2NvbnRlbnQnLFxuXHRcdFx0ZXBvY2g6IHRpbWVsaW5lLmluY3JlbWVudEVwb2NoKCksXG5cdFx0XHR0ZWxlbWV0cnlJbmZvOiBERUZBVUxUX1RFTEVNRVRSWV9JTkZPXG5cdFx0fSkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdDaGVja3BvaW50Jyk7XG5cblx0XHQvLyBUcnkgdG8gZ2V0IGNvbnRlbnQgZm9yIGEgZGlmZmVyZW50IFVSSSB0aGF0IGRvZXNuJ3QgaGF2ZSBhbnkgb3BlcmF0aW9uc1xuXHRcdGNvbnN0IGRpZmZlcmVudFVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9kaWZmZXJlbnQudHh0Jyk7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRpbWVsaW5lLmdldENvbnRlbnRBdFN0b3AoJ3JlcTEnLCBkaWZmZXJlbnRVcmksICdzdG9wMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQsICcnKTtcblx0fSk7XG5cblx0dGVzdCgndW5kb1RvTGFzdENoZWNrcG9pbnQgd2hlbiBjYW5VbmRvIGlzIGZhbHNlIGRvZXMgbm90aGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBBdCBpbml0aWFsIHN0YXRlLCBjYW5VbmRvIHNob3VsZCBiZSBmYWxzZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5VbmRvLmdldCgpLCBmYWxzZSk7XG5cblx0XHRjb25zdCBzdGF0ZUJlZm9yZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGNvbnN0IHN0YXRlQWZ0ZXIgPSB0aW1lbGluZS5nZXRTdGF0ZUZvclBlcnNpc3RlbmNlKCk7XG5cblx0XHQvLyBTaG91bGQgbm90IGhhdmUgY2hhbmdlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUJlZm9yZS5jdXJyZW50RXBvY2gsIHN0YXRlQWZ0ZXIuY3VycmVudEVwb2NoKTtcblx0fSk7XG5cblx0dGVzdCgncmVkb1RvTmV4dENoZWNrcG9pbnQgd2hlbiBjYW5SZWRvIGlzIGZhbHNlIGRvZXMgbm90aGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBBdCBpbml0aWFsIHN0YXRlIHdpdGggbm8gZnV0dXJlIG9wZXJhdGlvbnMsIGNhblJlZG8gc2hvdWxkIGJlIGZhbHNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblJlZG8uZ2V0KCksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHN0YXRlQmVmb3JlID0gdGltZWxpbmUuZ2V0U3RhdGVGb3JQZXJzaXN0ZW5jZSgpO1xuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0Y29uc3Qgc3RhdGVBZnRlciA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblxuXHRcdC8vIFNob3VsZCBub3QgaGF2ZSBjaGFuZ2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlQmVmb3JlLmN1cnJlbnRFcG9jaCwgc3RhdGVBZnRlci5jdXJyZW50RXBvY2gpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcnBoYW5lZCBvcGVyYXRpb25zIGFuZCBjaGVja3BvaW50cyBhcmUgcmVtb3ZlZCBhZnRlciB1bmRvIGFuZCBuZXcgY2hhbmdlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC50eHQnKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgZmlsZSBmaXJzdFxuXHRcdGNvbnN0IGNyZWF0ZUVwb2NoID0gdGltZWxpbmUuaW5jcmVtZW50RXBvY2goKTtcblxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlRmlsZUNyZWF0ZU9wZXJhdGlvbihcblx0XHRcdHVyaSxcblx0XHRcdCdyZXExJyxcblx0XHRcdGNyZWF0ZUVwb2NoLFxuXHRcdFx0J2luaXRpYWwgY29udGVudCdcblx0XHQpKTtcblxuXHRcdHRpbWVsaW5lLmNyZWF0ZUNoZWNrcG9pbnQoJ3JlcTEnLCB1bmRlZmluZWQsICdTdGFydCByZXExJyk7XG5cblx0XHQvLyBGaXJzdCBzZXQgb2YgY2hhbmdlc1xuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxNiksIHRleHQ6ICdmaXJzdCBlZGl0JyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMScsICdGaXJzdCBFZGl0Jyk7XG5cblx0XHR0aW1lbGluZS5yZWNvcmRGaWxlT3BlcmF0aW9uKGNyZWF0ZVRleHRFZGl0T3BlcmF0aW9uKFxuXHRcdFx0dXJpLFxuXHRcdFx0J3JlcTEnLFxuXHRcdFx0dGltZWxpbmUuaW5jcmVtZW50RXBvY2goKSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTEpLCB0ZXh0OiAnc2Vjb25kIGVkaXQnIH1dXG5cdFx0KSk7XG5cblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgJ3N0b3AyJywgJ1NlY29uZCBFZGl0Jyk7XG5cblx0XHQvLyBWZXJpZnkgd2UgaGF2ZSAzIG9wZXJhdGlvbnMgKGNyZWF0ZSArIDIgZWRpdHMpIGFuZCA0IGNoZWNrcG9pbnRzIChpbml0aWFsLCBzdGFydCwgc3RvcDEsIHN0b3AyKVxuXHRcdGxldCBzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlcmF0aW9ucy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jaGVja3BvaW50cy5sZW5ndGgsIDQpO1xuXG5cdFx0Ly8gVW5kbyB0byBzdG9wMSAoYmVmb3JlIHNlY29uZCBlZGl0KVxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDEnKSEpO1xuXG5cdFx0Ly8gUmVjb3JkIGEgbmV3IG9wZXJhdGlvbiAtIHRoaXMgc2hvdWxkIHRydW5jYXRlIHRoZSBcInNlY29uZCBlZGl0XCIgb3BlcmF0aW9uXG5cdFx0Ly8gYW5kIHJlbW92ZSB0aGUgc3RvcDIgY2hlY2twb2ludFxuXHRcdHRpbWVsaW5lLnJlY29yZEZpbGVPcGVyYXRpb24oY3JlYXRlVGV4dEVkaXRPcGVyYXRpb24oXG5cdFx0XHR1cmksXG5cdFx0XHQncmVxMScsXG5cdFx0XHR0aW1lbGluZS5pbmNyZW1lbnRFcG9jaCgpLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMSksIHRleHQ6ICdyZXBsYWNlbWVudCBlZGl0JyB9XVxuXHRcdCkpO1xuXG5cdFx0dGltZWxpbmUuY3JlYXRlQ2hlY2twb2ludCgncmVxMScsICdzdG9wMi1uZXcnLCAnUmVwbGFjZW1lbnQgRWRpdCcpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBvcnBoYW5lZCBvcGVyYXRpb24gYW5kIGNoZWNrcG9pbnQgYXJlIGdvbmVcblx0XHRzdGF0ZSA9IHRpbWVsaW5lLmdldFN0YXRlRm9yUGVyc2lzdGVuY2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUub3BlcmF0aW9ucy5sZW5ndGgsIDMsICdTaG91bGQgc3RpbGwgaGF2ZSAzIG9wZXJhdGlvbnMgKGNyZWF0ZSArIGZpcnN0ICsgcmVwbGFjZW1lbnQpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNoZWNrcG9pbnRzLmxlbmd0aCwgNCwgJ1Nob3VsZCBoYXZlIDQgY2hlY2twb2ludHMgKGluaXRpYWwsIHN0YXJ0LCBzdG9wMSwgc3RvcDItbmV3KScpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSB0aGlyZCBvcGVyYXRpb24gaXMgdGhlIHJlcGxhY2VtZW50LCBub3QgdGhlIG9yaWdpbmFsIHNlY29uZCBlZGl0XG5cdFx0Y29uc3QgdGhpcmRPcCA9IHN0YXRlLm9wZXJhdGlvbnNbMl07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXJkT3AudHlwZSwgRmlsZU9wZXJhdGlvblR5cGUuVGV4dEVkaXQpO1xuXHRcdGlmICh0aGlyZE9wLnR5cGUgPT09IEZpbGVPcGVyYXRpb25UeXBlLlRleHRFZGl0KSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcmRPcC5lZGl0c1swXS50ZXh0LCAncmVwbGFjZW1lbnQgZWRpdCcpO1xuXHRcdH1cblxuXHRcdC8vIFZlcmlmeSB0aGUgc3RvcDItbmV3IGNoZWNrcG9pbnQgZXhpc3RzLCBub3Qgc3RvcDJcblx0XHRjb25zdCBzdG9wMk5ld0NoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgJ3N0b3AyLW5ldycpO1xuXHRcdGNvbnN0IHN0b3AyT2xkQ2hlY2twb2ludCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDInKTtcblx0XHRhc3NlcnQub2soc3RvcDJOZXdDaGVja3BvaW50LCAnTmV3IGNoZWNrcG9pbnQgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3AyT2xkQ2hlY2twb2ludCwgdW5kZWZpbmVkLCAnT2xkIG9ycGhhbmVkIGNoZWNrcG9pbnQgc2hvdWxkIGJlIHJlbW92ZWQnKTtcblxuXHRcdC8vIE5vdyBuYXZpZ2F0ZSB0aHJvdWdoIHRoZSBlbnRpcmUgdGltZWxpbmUgdG8gdmVyaWZ5IGNvbnNpc3RlbmN5XG5cdFx0Y29uc3QgaW5pdGlhbENoZWNrcG9pbnQgPSBzdGF0ZS5jaGVja3BvaW50c1swXTtcblx0XHRjb25zdCBzdGFydENoZWNrcG9pbnQgPSB0aW1lbGluZS5nZXRDaGVja3BvaW50SWRGb3JSZXF1ZXN0KCdyZXExJywgdW5kZWZpbmVkKSE7XG5cdFx0Y29uc3Qgc3RvcDFDaGVja3BvaW50ID0gdGltZWxpbmUuZ2V0Q2hlY2twb2ludElkRm9yUmVxdWVzdCgncmVxMScsICdzdG9wMScpITtcblx0XHRjb25zdCBzdG9wMk5ld0NoZWNrcG9pbnRJZCA9IHRpbWVsaW5lLmdldENoZWNrcG9pbnRJZEZvclJlcXVlc3QoJ3JlcTEnLCAnc3RvcDItbmV3JykhO1xuXG5cdFx0Ly8gTmF2aWdhdGUgdG8gaW5pdGlhbCB0byBjbGVhciBldmVyeXRoaW5nXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoaW5pdGlhbENoZWNrcG9pbnQuY2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmhhcyh1cmkpLCBmYWxzZSk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byBzdGFydCAtIGZpbGUgc2hvdWxkIGJlIGNyZWF0ZWRcblx0XHRhd2FpdCB0aW1lbGluZS5uYXZpZ2F0ZVRvQ2hlY2twb2ludChzdGFydENoZWNrcG9pbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdpbml0aWFsIGNvbnRlbnQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIHN0b3AxIC0gZmlyc3QgZWRpdCBzaG91bGQgYmUgYXBwbGllZFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0b3AxQ2hlY2twb2ludCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2ZpcnN0IGVkaXQnKTtcblxuXHRcdC8vIE5hdmlnYXRlIHRvIHN0b3AyLW5ldyAtIHJlcGxhY2VtZW50IGVkaXQgc2hvdWxkIGJlIGFwcGxpZWQsIE5PVCB0aGUgb3JwaGFuZWQgXCJzZWNvbmQgZWRpdFwiXG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoc3RvcDJOZXdDaGVja3BvaW50SWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdyZXBsYWNlbWVudCBlZGl0Jyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBiYWNrIHRvIHN0YXJ0XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoc3RhcnRDaGVja3BvaW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAnaW5pdGlhbCBjb250ZW50Jyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSBmb3J3YXJkIHRocm91Z2ggYWxsIGNoZWNrcG9pbnRzIGFnYWluIHRvIGVuc3VyZSByZWRvIHdvcmtzIGNvcnJlY3RseVxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0b3AxQ2hlY2twb2ludCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVDb250ZW50cy5nZXQodXJpKSwgJ2ZpcnN0IGVkaXQnKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KHN0b3AyTmV3Q2hlY2twb2ludElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUNvbnRlbnRzLmdldCh1cmkpLCAncmVwbGFjZW1lbnQgZWRpdCcsICdPcnBoYW5lZCBlZGl0IHNob3VsZCBuZXZlciByZWFwcGVhcicpO1xuXG5cdFx0Ly8gR28gYmFjayB0byBpbml0aWFsIGFuZCBmb3J3YXJkIGFnYWluIHRvIHRob3JvdWdobHkgdGVzdFxuXHRcdGF3YWl0IHRpbWVsaW5lLm5hdmlnYXRlVG9DaGVja3BvaW50KGluaXRpYWxDaGVja3BvaW50LmNoZWNrcG9pbnRJZCk7XG5cdFx0YXdhaXQgdGltZWxpbmUubmF2aWdhdGVUb0NoZWNrcG9pbnQoc3RvcDJOZXdDaGVja3BvaW50SWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlQ29udGVudHMuZ2V0KHVyaSksICdyZXBsYWNlbWVudCBlZGl0JywgJ0NvbnRlbnQgc2hvdWxkIHN0aWxsIGJlIGNvcnJlY3QgYWZ0ZXIgZnVsbCB0aW1lbGluZSB0cmF2ZXJzYWwnKTtcblx0fSk7XG5cblx0dGVzdCgndW5kby9yZWRvIHdpdGggbXVsdGlwbGUgbm8tZWRpdCByZXF1ZXN0cyBhZHZhbmNlcyBvbmUgcmVxdWVzdCBhdCBhIHRpbWUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gcmVxMTogbm8gZWRpdHNcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXExJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMScpO1xuXG5cdFx0Ly8gcmVxMjogbm8gZWRpdHNcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXEyJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMicpO1xuXG5cdFx0Ly8gcmVxMzogbm8gZWRpdHNcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXEzJywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxMycpO1xuXG5cdFx0Ly8gcmVxNDogbm8gZWRpdHNcblx0XHR0aW1lbGluZS5jcmVhdGVDaGVja3BvaW50KCdyZXE0JywgdW5kZWZpbmVkLCAnU3RhcnQgcmVxNCcpO1xuXG5cdFx0Ly8gVW5kbyBzaG91bGQgc3RlcCBvbmUgcmVxdWVzdCBhdCBhIHRpbWVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuVW5kby5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLm1hcChkID0+IGQucmVxdWVzdElkKSwgWydyZXE0J10pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCcsICdyZXEzJ10pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUudW5kb1RvTGFzdENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCcsICdyZXEzJywgJ3JlcTInXSk7XG5cblx0XHRhd2FpdCB0aW1lbGluZS51bmRvVG9MYXN0Q2hlY2twb2ludCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGltZWxpbmUucmVxdWVzdERpc2FibGVtZW50LmdldCgpLm1hcChkID0+IGQucmVxdWVzdElkKSwgWydyZXE0JywgJ3JlcTMnLCAncmVxMicsICdyZXExJ10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVsaW5lLmNhblVuZG8uZ2V0KCksIGZhbHNlKTtcblxuXHRcdC8vIFJlZG8gc2hvdWxkIGFsc28gc3RlcCBvbmUgcmVxdWVzdCBhdCBhIHRpbWUgKG5vdCBza2lwIGFsbCBhdCBvbmNlKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aW1lbGluZS5jYW5SZWRvLmdldCgpLCB0cnVlKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbJ3JlcTQnLCAncmVxMycsICdyZXEyJ10pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCcsICdyZXEzJ10pO1xuXG5cdFx0YXdhaXQgdGltZWxpbmUucmVkb1RvTmV4dENoZWNrcG9pbnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRpbWVsaW5lLnJlcXVlc3REaXNhYmxlbWVudC5nZXQoKS5tYXAoZCA9PiBkLnJlcXVlc3RJZCksIFsncmVxNCddKTtcblxuXHRcdGF3YWl0IHRpbWVsaW5lLnJlZG9Ub05leHRDaGVja3BvaW50KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aW1lbGluZS5yZXF1ZXN0RGlzYWJsZW1lbnQuZ2V0KCkubWFwKGQgPT4gZC5yZXF1ZXN0SWQpLCBbXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWxpbmUuY2FuUmVkby5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuXG4vLyBNb2NrIG5vdGVib29rIHNlcnZpY2UgZm9yIHRlc3RzIHRoYXQgZG9uJ3QgbmVlZCBub3RlYm9vayBmdW5jdGlvbmFsaXR5XG5jbGFzcyBUZXN0Tm90ZWJvb2tTZXJ2aWNlIHtcblx0Z2V0Tm90ZWJvb2tUZXh0TW9kZWwoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0aGFzU3VwcG9ydGVkTm90ZWJvb2tzKCkgeyByZXR1cm4gZmFsc2U7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUNBQXlFO0FBQ2xGLFNBQXdCLHlCQUF5QjtBQUdqRCxNQUFNLGlDQUFpQyxXQUFZO0FBRWxELFFBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLHlCQUFzRCxjQUFjO0FBQUEsSUFDekUsU0FBUztBQUFBLElBQ1QsU0FBUztBQUFBLElBQ1QsaUJBQWlCLElBQUksTUFBTSxxQkFBcUI7QUFBQSxJQUNoRCxXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUEsSUFDUixTQUFTO0FBQUEsSUFDVCxRQUFRO0FBQUEsSUFDUiw0QkFBNEI7QUFBQSxJQUM1QixTQUFTO0FBQUEsRUFDVixDQUFDO0FBRUQsV0FBUyx3QkFBd0IsS0FBVSxXQUFtQixPQUFlLE9BQXdEO0FBQ3BJLFdBQU8sY0FBNkI7QUFBQSxNQUNuQyxNQUFNLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLFdBQVMsMEJBQTBCLEtBQVUsV0FBbUIsT0FBZSxnQkFBdUM7QUFDckgsV0FBTyxjQUE2QjtBQUFBLE1BQ25DLE1BQU0sa0JBQWtC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
