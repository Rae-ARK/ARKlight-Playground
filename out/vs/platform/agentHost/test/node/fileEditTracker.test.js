import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest, getFileEditAttributionMarker, IAgentEditAttributionService, NullAgentEditAttributionService } from "../../common/fileEditAttribution.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
import { ToolResultContentType } from "../../common/state/sessionState.js";
import { TestDiffComputeService } from "../common/sessionTestHelpers.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { IEditSurvivalReporterFactory, NullEditSurvivalReporterFactory } from "../../node/shared/editSurvivalReporter.js";
import { FileEditTracker } from "../../node/shared/fileEditTracker.js";
import { IEditArcReporterService, NullEditArcReporterService } from "../../node/shared/editArcReporter.js";
suite("FileEditTracker", () => {
  const disposables = new DisposableStore();
  let fileService;
  let db;
  let tracker;
  let diffComputeService;
  setup(async () => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const sourceFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("file", sourceFs));
    db = disposables.add(await SessionDatabase.open(":memory:"));
    await db.createTurn("turn-1");
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    diffComputeService = new TestDiffComputeService();
    services.set(IDiffComputeService, diffComputeService);
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const instantiationService = disposables.add(new InstantiationService(services));
    tracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
  });
  teardown(async () => {
    disposables.clear();
    await db.close();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks edit start and complete for existing file", async () => {
    await fileService.writeFile(URI.file("/workspace/test.txt"), VSBuffer.fromString("original content\nline 2"));
    await tracker.trackEditStart("/workspace/test.txt");
    await fileService.writeFile(URI.file("/workspace/test.txt"), VSBuffer.fromString("modified content\nline 2\nline 3"));
    await tracker.completeEdit("/workspace/test.txt");
    const fileEdit = await tracker.takeCompletedEdit("turn-1", "tc-1", "/workspace/test.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    assert.strictEqual(fileEdit.type, ToolResultContentType.FileEdit);
    assert.strictEqual(diffComputeService.callCount, 1);
    const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
    assert.ok(beforeFields);
    assert.strictEqual(beforeFields.sessionUri, "copilot:/test-session");
    assert.strictEqual(beforeFields.toolCallId, "tc-1");
    assert.strictEqual(beforeFields.filePath, "/workspace/test.txt");
    assert.strictEqual(beforeFields.part, "before");
    const afterFields = parseSessionDbUri(fileEdit.after.content.uri);
    assert.ok(afterFields);
    assert.strictEqual(afterFields.part, "after");
    await new Promise((r) => setTimeout(r, 50));
    const content = await db.readFileEditContent("tc-1", "/workspace/test.txt");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "original content\nline 2");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "modified content\nline 2\nline 3");
  });
  test("tracks edit for newly created file (no before content)", async () => {
    await tracker.trackEditStart("/workspace/new-file.txt");
    await fileService.writeFile(URI.file("/workspace/new-file.txt"), VSBuffer.fromString("new file\ncontent"));
    await tracker.completeEdit("/workspace/new-file.txt");
    const fileEdit = await tracker.takeCompletedEdit("turn-1", "tc-2", "/workspace/new-file.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    await new Promise((r) => setTimeout(r, 50));
    const content = await db.readFileEditContent("tc-2", "/workspace/new-file.txt");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "new file\ncontent");
  });
  test("takeCompletedEdit returns undefined for unknown file path", async () => {
    const result = await tracker.takeCompletedEdit("turn-1", "tc-x", "/nonexistent", "", void 0, void 0);
    assert.strictEqual(result, void 0);
  });
  test("attaches Agent attribution marker to the file edit result", async () => {
    const services = new ServiceCollection();
    let arcReportCount = 0;
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService());
    services.set(IAgentEditAttributionService, {
      _serviceBrand: void 0,
      setEnabled: () => {
      },
      recordEdit: async (edit) => ({
        version: 1,
        editId: "edit-1",
        sequence: 1,
        beforeDigest: createFileEditContentDigest(edit.beforeText),
        afterDigest: createFileEditContentDigest(edit.afterText)
      }),
      flushSession: async () => {
      },
      prepareFlush: async () => void 0,
      commitFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 }),
      cancelFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 })
    });
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, {
      _serviceBrand: void 0,
      reportEdit: async () => {
        arcReportCount++;
      }
    });
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/marker.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/marker.txt");
    await fileService.writeFile(URI.file("/workspace/marker.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/marker.txt");
    const result = await localTracker.takeCompletedEdit("turn-1", "tc-marker", "/workspace/marker.txt", "edit", void 0, "model");
    assert.deepStrictEqual(result && getFileEditAttributionMarker(result), {
      version: 1,
      editId: "edit-1",
      sequence: 1,
      beforeDigest: createFileEditContentDigest("before"),
      afterDigest: createFileEditContentDigest("after")
    });
    assert.strictEqual(arcReportCount, 1);
  });
  test("returns the file edit result when attribution fails", async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService());
    services.set(IAgentEditAttributionService, {
      _serviceBrand: void 0,
      setEnabled: () => {
      },
      recordEdit: async () => {
        throw new Error("Attribution failed");
      },
      flushSession: async () => {
      },
      prepareFlush: async () => void 0,
      commitFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 }),
      cancelFlush: async () => ({ outcome: "missing", agentModifiedCount: 0 })
    });
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/fallback.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/fallback.txt");
    await fileService.writeFile(URI.file("/workspace/fallback.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/fallback.txt");
    const result = await localTracker.takeCompletedEdit("turn-1", "tc-fallback", "/workspace/fallback.txt", "edit", void 0, "model");
    assert.deepStrictEqual({
      type: result?.type,
      marker: result && getFileEditAttributionMarker(result)
    }, {
      type: ToolResultContentType.FileEdit,
      marker: void 0
    });
  });
  test("reuses the existing diff and does not wait for ARC reporting", async () => {
    const reportStarted = new DeferredPromise();
    const releaseReport = new DeferredPromise();
    const services = new ServiceCollection();
    const localDiffComputeService = new TestDiffComputeService();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, localDiffComputeService);
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, {
      _serviceBrand: void 0,
      reportEdit: async (params) => {
        reportStarted.complete(params);
        await releaseReport.p;
      }
    });
    const instantiationService = disposables.add(new InstantiationService(services));
    const localTracker = instantiationService.createInstance(FileEditTracker, "copilot:/test-session", db);
    await fileService.writeFile(URI.file("/workspace/non-blocking.txt"), VSBuffer.fromString("before"));
    await localTracker.trackEditStart("/workspace/non-blocking.txt");
    await fileService.writeFile(URI.file("/workspace/non-blocking.txt"), VSBuffer.fromString("after"));
    await localTracker.completeEdit("/workspace/non-blocking.txt");
    const resultPromise = localTracker.takeCompletedEdit("turn-1", "tc-non-blocking", "/workspace/non-blocking.txt", "apply_patch", void 0, "model");
    const report = await reportStarted.p;
    let timeoutHandle;
    const completion = await Promise.race([
      resultPromise.then(() => "complete"),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(() => resolve("timeout"), 100);
      })
    ]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    releaseReport.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      completion,
      resultType: result?.type,
      diffCallCount: localDiffComputeService.callCount,
      detailedDiffCallCount: localDiffComputeService.detailedCallCount,
      initialEdit: report.initialEdit
    }, {
      completion: "complete",
      resultType: ToolResultContentType.FileEdit,
      diffCallCount: 1,
      detailedDiffCallCount: 0,
      initialEdit: {
        replacements: [{ start: 0, endExclusive: 6, text: "after" }]
      }
    });
  });
  test("Write to non-existent file records kind=create with removed=0", async () => {
    const services = new ServiceCollection();
    services.set(ILogService, new NullLogService());
    services.set(IFileService, fileService);
    services.set(IDiffComputeService, new TestDiffComputeService({ added: 1, removed: 1, changes: [] }));
    services.set(IAgentEditAttributionService, new NullAgentEditAttributionService());
    services.set(IEditSurvivalReporterFactory, new NullEditSurvivalReporterFactory());
    services.set(IEditArcReporterService, new NullEditArcReporterService());
    const inst = disposables.add(new InstantiationService(services));
    const localTracker = inst.createInstance(FileEditTracker, "copilot:/test-session", db);
    await localTracker.trackEditStart("/workspace/brand-new.txt");
    await fileService.writeFile(URI.file("/workspace/brand-new.txt"), VSBuffer.fromString("fresh"));
    await localTracker.completeEdit("/workspace/brand-new.txt");
    const fileEdit = await localTracker.takeCompletedEdit("turn-1", "tc-create", "/workspace/brand-new.txt", "", void 0, void 0);
    assert.ok(fileEdit);
    const records = await db.getAllFileEdits();
    const created = records.find((r) => r.toolCallId === "tc-create");
    assert.deepStrictEqual({
      diff: fileEdit.diff,
      kind: created?.kind,
      addedLines: created?.addedLines,
      removedLines: created?.removedLines
    }, {
      diff: { added: 1, removed: 0 },
      kind: "create",
      addedLines: 1,
      removedLines: 0
    });
  });
  test("before and after content can be read from database", async () => {
    await fileService.writeFile(URI.file("/workspace/file.ts"), VSBuffer.fromString("original"));
    await tracker.trackEditStart("/workspace/file.ts");
    await fileService.writeFile(URI.file("/workspace/file.ts"), VSBuffer.fromString("modified"));
    await tracker.completeEdit("/workspace/file.ts");
    await tracker.takeCompletedEdit("turn-1", "tc-3", "/workspace/file.ts", "", void 0, void 0);
    const content = await db.readFileEditContent("tc-3", "/workspace/file.ts");
    assert.ok(content);
    assert.strictEqual(new TextDecoder().decode(content.beforeContent), "original");
    assert.strictEqual(new TextDecoder().decode(content.afterContent), "modified");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZmlsZUVkaXRUcmFja2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdCwgZ2V0RmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciwgSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgTnVsbEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IHBhcnNlU2Vzc2lvbkRiVXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYlVyaS5qcyc7XG5pbXBvcnQgeyBUb29sUmVzdWx0Q29udGVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IFNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvbkRhdGFiYXNlLmpzJztcbmltcG9ydCB7IElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIE51bGxFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9lZGl0U3Vydml2YWxSZXBvcnRlci5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdFRyYWNrZXIgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9maWxlRWRpdFRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcywgSUVkaXRBcmNSZXBvcnRlclNlcnZpY2UsIE51bGxFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvZWRpdEFyY1JlcG9ydGVyLmpzJztcblxuc3VpdGUoJ0ZpbGVFZGl0VHJhY2tlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IGRiOiBTZXNzaW9uRGF0YWJhc2U7XG5cdGxldCB0cmFja2VyOiBGaWxlRWRpdFRyYWNrZXI7XG5cdGxldCBkaWZmQ29tcHV0ZVNlcnZpY2U6IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2U7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHNvdXJjZUZzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHNvdXJjZUZzKSk7XG5cblx0XHRkYiA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBTZXNzaW9uRGF0YWJhc2Uub3BlbignOm1lbW9yeTonKSk7XG5cdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRkaWZmQ29tcHV0ZVNlcnZpY2UgPSBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBkaWZmQ29tcHV0ZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBuZXcgTnVsbEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgbmV3IE51bGxFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCBuZXcgTnVsbEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHR0cmFja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRhd2FpdCBkYi5jbG9zZSgpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndHJhY2tzIGVkaXQgc3RhcnQgYW5kIGNvbXBsZXRlIGZvciBleGlzdGluZyBmaWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdvcmlnaW5hbCBjb250ZW50XFxubGluZSAyJykpO1xuXG5cdFx0YXdhaXQgdHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS90ZXN0LnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdtb2RpZmllZCBjb250ZW50XFxubGluZSAyXFxubGluZSAzJykpO1xuXHRcdGF3YWl0IHRyYWNrZXIuY29tcGxldGVFZGl0KCcvd29ya3NwYWNlL3Rlc3QudHh0Jyk7XG5cblx0XHRjb25zdCBmaWxlRWRpdCA9IGF3YWl0IHRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy0xJywgJy93b3Jrc3BhY2UvdGVzdC50eHQnLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhmaWxlRWRpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0LnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZDb21wdXRlU2VydmljZS5jYWxsQ291bnQsIDEpO1xuXG5cdFx0Ly8gVVJJcyBhcmUgcGFyc2VhYmxlIHNlc3Npb24tZGI6IFVSSXNcblx0XHRjb25zdCBiZWZvcmVGaWVsZHMgPSBwYXJzZVNlc3Npb25EYlVyaShmaWxlRWRpdC5iZWZvcmUhLmNvbnRlbnQudXJpKTtcblx0XHRhc3NlcnQub2soYmVmb3JlRmllbGRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlRmllbGRzLnNlc3Npb25VcmksICdjb3BpbG90Oi90ZXN0LXNlc3Npb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlRmllbGRzLnRvb2xDYWxsSWQsICd0Yy0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJlZm9yZUZpZWxkcy5maWxlUGF0aCwgJy93b3Jrc3BhY2UvdGVzdC50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlRmllbGRzLnBhcnQsICdiZWZvcmUnKTtcblxuXHRcdGNvbnN0IGFmdGVyRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkoZmlsZUVkaXQuYWZ0ZXIhLmNvbnRlbnQudXJpKTtcblx0XHRhc3NlcnQub2soYWZ0ZXJGaWVsZHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZnRlckZpZWxkcy5wYXJ0LCAnYWZ0ZXInKTtcblxuXHRcdC8vIENvbnRlbnQgaXMgcGVyc2lzdGVkIGluIHRoZSBkYXRhYmFzZSAod2FpdCBmb3IgZmlyZS1hbmQtZm9yZ2V0IHdyaXRlKVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGRiLnJlYWRGaWxlRWRpdENvbnRlbnQoJ3RjLTEnLCAnL3dvcmtzcGFjZS90ZXN0LnR4dCcpO1xuXHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYmVmb3JlQ29udGVudCksICdvcmlnaW5hbCBjb250ZW50XFxubGluZSAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShjb250ZW50LmFmdGVyQ29udGVudCksICdtb2RpZmllZCBjb250ZW50XFxubGluZSAyXFxubGluZSAzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyBlZGl0IGZvciBuZXdseSBjcmVhdGVkIGZpbGUgKG5vIGJlZm9yZSBjb250ZW50KScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0cmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL25ldy1maWxlLnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9uZXctZmlsZS50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnbmV3IGZpbGVcXG5jb250ZW50JykpO1xuXHRcdGF3YWl0IHRyYWNrZXIuY29tcGxldGVFZGl0KCcvd29ya3NwYWNlL25ldy1maWxlLnR4dCcpO1xuXG5cdFx0Y29uc3QgZmlsZUVkaXQgPSBhd2FpdCB0cmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMtMicsICcvd29ya3NwYWNlL25ldy1maWxlLnR4dCcsICcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVFZGl0KTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBmaXJlLWFuZC1mb3JnZXQgREIgd3JpdGUgdG8gY29tcGxldGVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy0yJywgJy93b3Jrc3BhY2UvbmV3LWZpbGUudHh0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudC5iZWZvcmVDb250ZW50KSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudC5hZnRlckNvbnRlbnQpLCAnbmV3IGZpbGVcXG5jb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rha2VDb21wbGV0ZWRFZGl0IHJldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIGZpbGUgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0cmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMteCcsICcvbm9uZXhpc3RlbnQnLCAnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIEFnZW50IGF0dHJpYnV0aW9uIG1hcmtlciB0byB0aGUgZmlsZSBlZGl0IHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdGxldCBhcmNSZXBvcnRDb3VudCA9IDA7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0cmVjb3JkRWRpdDogYXN5bmMgZWRpdCA9PiAoe1xuXHRcdFx0XHR2ZXJzaW9uOiAxLFxuXHRcdFx0XHRlZGl0SWQ6ICdlZGl0LTEnLFxuXHRcdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdFx0YmVmb3JlRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoZWRpdC5iZWZvcmVUZXh0KSxcblx0XHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdChlZGl0LmFmdGVyVGV4dCksXG5cdFx0XHR9KSxcblx0XHRcdGZsdXNoU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRjb21taXRGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0XHRjYW5jZWxGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIG5ldyBOdWxsRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVwb3J0RWRpdDogYXN5bmMgKCkgPT4geyBhcmNSZXBvcnRDb3VudCsrOyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3QgbG9jYWxUcmFja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9tYXJrZXIudHh0JyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JlZm9yZScpKTtcblxuXHRcdGF3YWl0IGxvY2FsVHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS9tYXJrZXIudHh0Jyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL21hcmtlci50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWZ0ZXInKSk7XG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLmNvbXBsZXRlRWRpdCgnL3dvcmtzcGFjZS9tYXJrZXIudHh0Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbG9jYWxUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMtbWFya2VyJywgJy93b3Jrc3BhY2UvbWFya2VyLnR4dCcsICdlZGl0JywgdW5kZWZpbmVkLCAnbW9kZWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0ICYmIGdldEZpbGVFZGl0QXR0cmlidXRpb25NYXJrZXIocmVzdWx0KSwge1xuXHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdGVkaXRJZDogJ2VkaXQtMScsXG5cdFx0XHRzZXF1ZW5jZTogMSxcblx0XHRcdGJlZm9yZURpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KCdiZWZvcmUnKSxcblx0XHRcdGFmdGVyRGlnZXN0OiBjcmVhdGVGaWxlRWRpdENvbnRlbnREaWdlc3QoJ2FmdGVyJyksXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFyY1JlcG9ydENvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB0aGUgZmlsZSBlZGl0IHJlc3VsdCB3aGVuIGF0dHJpYnV0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0c2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0c2VydmljZXMuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0c2V0RW5hYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0cmVjb3JkRWRpdDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0F0dHJpYnV0aW9uIGZhaWxlZCcpO1xuXHRcdFx0fSxcblx0XHRcdGZsdXNoU2Vzc2lvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0cHJlcGFyZUZsdXNoOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRjb21taXRGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0XHRjYW5jZWxGbHVzaDogYXN5bmMgKCkgPT4gKHsgb3V0Y29tZTogJ21pc3NpbmcnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSksXG5cdFx0fSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIG5ldyBOdWxsRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRWRpdEFyY1JlcG9ydGVyU2VydmljZSwgbmV3IE51bGxFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluc3RhbnRpYXRpb25TZXJ2aWNlKHNlcnZpY2VzKSk7XG5cdFx0Y29uc3QgbG9jYWxUcmFja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL2ZhbGxiYWNrLnR4dCcpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWZ0ZXInKSk7XG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLmNvbXBsZXRlRWRpdCgnL3dvcmtzcGFjZS9mYWxsYmFjay50eHQnKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsb2NhbFRyYWNrZXIudGFrZUNvbXBsZXRlZEVkaXQoJ3R1cm4tMScsICd0Yy1mYWxsYmFjaycsICcvd29ya3NwYWNlL2ZhbGxiYWNrLnR4dCcsICdlZGl0JywgdW5kZWZpbmVkLCAnbW9kZWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHlwZTogcmVzdWx0Py50eXBlLFxuXHRcdFx0bWFya2VyOiByZXN1bHQgJiYgZ2V0RmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlcihyZXN1bHQpLFxuXHRcdH0sIHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdG1hcmtlcjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgdGhlIGV4aXN0aW5nIGRpZmYgYW5kIGRvZXMgbm90IHdhaXQgZm9yIEFSQyByZXBvcnRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb3J0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SUVkaXRBcmNSZXBvcnRlckxhdW5jaFBhcmFtcz4oKTtcblx0XHRjb25zdCByZWxlYXNlUmVwb3J0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29uc3QgbG9jYWxEaWZmQ29tcHV0ZVNlcnZpY2UgPSBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpZmZDb21wdXRlU2VydmljZSwgbG9jYWxEaWZmQ29tcHV0ZVNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBuZXcgTnVsbEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgbmV3IE51bGxFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBvcnRFZGl0OiBhc3luYyBwYXJhbXMgPT4ge1xuXHRcdFx0XHRyZXBvcnRTdGFydGVkLmNvbXBsZXRlKHBhcmFtcyk7XG5cdFx0XHRcdGF3YWl0IHJlbGVhc2VSZXBvcnQucDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMpKTtcblx0XHRjb25zdCBsb2NhbFRyYWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlRWRpdFRyYWNrZXIsICdjb3BpbG90Oi90ZXN0LXNlc3Npb24nLCBkYik7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL25vbi1ibG9ja2luZy50eHQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYmVmb3JlJykpO1xuXG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL25vbi1ibG9ja2luZy50eHQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2Uvbm9uLWJsb2NraW5nLnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhZnRlcicpKTtcblx0XHRhd2FpdCBsb2NhbFRyYWNrZXIuY29tcGxldGVFZGl0KCcvd29ya3NwYWNlL25vbi1ibG9ja2luZy50eHQnKTtcblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gbG9jYWxUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMtbm9uLWJsb2NraW5nJywgJy93b3Jrc3BhY2Uvbm9uLWJsb2NraW5nLnR4dCcsICdhcHBseV9wYXRjaCcsIHVuZGVmaW5lZCwgJ21vZGVsJyk7XG5cdFx0Y29uc3QgcmVwb3J0ID0gYXdhaXQgcmVwb3J0U3RhcnRlZC5wO1xuXHRcdGxldCB0aW1lb3V0SGFuZGxlOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb21wbGV0aW9uID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdHJlc3VsdFByb21pc2UudGhlbigoKSA9PiAnY29tcGxldGUnIGFzIGNvbnN0KSxcblx0XHRcdG5ldyBQcm9taXNlPCd0aW1lb3V0Jz4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoJ3RpbWVvdXQnKSwgMTAwKTtcblx0XHRcdH0pLFxuXHRcdF0pO1xuXHRcdGlmICh0aW1lb3V0SGFuZGxlKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG5cdFx0fVxuXHRcdHJlbGVhc2VSZXBvcnQuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21wbGV0aW9uLFxuXHRcdFx0cmVzdWx0VHlwZTogcmVzdWx0Py50eXBlLFxuXHRcdFx0ZGlmZkNhbGxDb3VudDogbG9jYWxEaWZmQ29tcHV0ZVNlcnZpY2UuY2FsbENvdW50LFxuXHRcdFx0ZGV0YWlsZWREaWZmQ2FsbENvdW50OiBsb2NhbERpZmZDb21wdXRlU2VydmljZS5kZXRhaWxlZENhbGxDb3VudCxcblx0XHRcdGluaXRpYWxFZGl0OiByZXBvcnQuaW5pdGlhbEVkaXQsXG5cdFx0fSwge1xuXHRcdFx0Y29tcGxldGlvbjogJ2NvbXBsZXRlJyxcblx0XHRcdHJlc3VsdFR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdGRpZmZDYWxsQ291bnQ6IDEsXG5cdFx0XHRkZXRhaWxlZERpZmZDYWxsQ291bnQ6IDAsXG5cdFx0XHRpbml0aWFsRWRpdDoge1xuXHRcdFx0XHRyZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDYsIHRleHQ6ICdhZnRlcicgfV1cblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1dyaXRlIHRvIG5vbi1leGlzdGVudCBmaWxlIHJlY29yZHMga2luZD1jcmVhdGUgd2l0aCByZW1vdmVkPTAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gV2hlbiBhIGZpbGUgZGlkIG5vdCBleGlzdCBiZWZvcmUgdGhlIGVkaXQsIHRoZSB0cmFja2VyIGNsYW1wc1xuXHRcdC8vIGByZW1vdmVkYCB0byAwICh0aGUgZGlmZmVyIG90aGVyd2lzZSByZXBvcnRzIDEgZm9yIGFuIGVtcHR5XG5cdFx0Ly8gYmVmb3JlLWNvbnRlbnQgdnMuIGEgb25lLWxpbmUgYWZ0ZXItY29udGVudCkgYW5kIHJlY29yZHNcblx0XHQvLyBga2luZD1jcmVhdGVgIGluc3RlYWQgb2YgYGVkaXRgLiBgYWRkZWRgIGlzIHBhc3NlZCB0aHJvdWdoXG5cdFx0Ly8gZnJvbSB0aGUgZGlmZiBzZXJ2aWNlIHVuY2hhbmdlZC5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHRcdHNlcnZpY2VzLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRzZXJ2aWNlcy5zZXQoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoeyBhZGRlZDogMSwgcmVtb3ZlZDogMSwgY2hhbmdlczogW10gfSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBuZXcgTnVsbEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSgpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgbmV3IE51bGxFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkoKSk7XG5cdFx0c2VydmljZXMuc2V0KElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCBuZXcgTnVsbEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgaW5zdDogSUluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcykpO1xuXHRcdGNvbnN0IGxvY2FsVHJhY2tlciA9IGluc3QuY3JlYXRlSW5zdGFuY2UoRmlsZUVkaXRUcmFja2VyLCAnY29waWxvdDovdGVzdC1zZXNzaW9uJywgZGIpO1xuXG5cdFx0YXdhaXQgbG9jYWxUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KCcvd29ya3NwYWNlL2JyYW5kLW5ldy50eHQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvYnJhbmQtbmV3LnR4dCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdmcmVzaCcpKTtcblx0XHRhd2FpdCBsb2NhbFRyYWNrZXIuY29tcGxldGVFZGl0KCcvd29ya3NwYWNlL2JyYW5kLW5ldy50eHQnKTtcblxuXHRcdGNvbnN0IGZpbGVFZGl0ID0gYXdhaXQgbG9jYWxUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KCd0dXJuLTEnLCAndGMtY3JlYXRlJywgJy93b3Jrc3BhY2UvYnJhbmQtbmV3LnR4dCcsICcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVFZGl0KTtcblxuXHRcdGNvbnN0IHJlY29yZHMgPSBhd2FpdCBkYi5nZXRBbGxGaWxlRWRpdHMoKTtcblx0XHRjb25zdCBjcmVhdGVkID0gcmVjb3Jkcy5maW5kKHIgPT4gci50b29sQ2FsbElkID09PSAndGMtY3JlYXRlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaWZmOiBmaWxlRWRpdC5kaWZmLFxuXHRcdFx0a2luZDogY3JlYXRlZD8ua2luZCxcblx0XHRcdGFkZGVkTGluZXM6IGNyZWF0ZWQ/LmFkZGVkTGluZXMsXG5cdFx0XHRyZW1vdmVkTGluZXM6IGNyZWF0ZWQ/LnJlbW92ZWRMaW5lcyxcblx0XHR9LCB7XG5cdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdGFkZGVkTGluZXM6IDEsXG5cdFx0XHRyZW1vdmVkTGluZXM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JlZm9yZSBhbmQgYWZ0ZXIgY29udGVudCBjYW4gYmUgcmVhZCBmcm9tIGRhdGFiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ29yaWdpbmFsJykpO1xuXG5cdFx0YXdhaXQgdHJhY2tlci50cmFja0VkaXRTdGFydCgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnbW9kaWZpZWQnKSk7XG5cdFx0YXdhaXQgdHJhY2tlci5jb21wbGV0ZUVkaXQoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXG5cdFx0YXdhaXQgdHJhY2tlci50YWtlQ29tcGxldGVkRWRpdCgndHVybi0xJywgJ3RjLTMnLCAnL3dvcmtzcGFjZS9maWxlLnRzJywgJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBkYi5yZWFkRmlsZUVkaXRDb250ZW50KCd0Yy0zJywgJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGFzc2VydC5vayhjb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGNvbnRlbnQuYmVmb3JlQ29udGVudCksICdvcmlnaW5hbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoY29udGVudC5hZnRlckNvbnRlbnQpLCAnbW9kaWZpZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7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
