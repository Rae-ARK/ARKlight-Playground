import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { isWindows } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ITelemetryService, TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { createFileEditContentDigest } from "../../common/fileEditAttribution.js";
import { AgentEditAttributionService } from "../../node/shared/agentEditAttributionService.js";
import { computeDiffCounts } from "../../node/diffWorkerMain.js";
import { TestDiffComputeService } from "../common/sessionTestHelpers.js";
suite("Agent Edit Attribution Service", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("emits retained Agent characters from disjoint edits", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("aBcdeF"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(eventName, data) {
        events.push({ eventName, data });
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "abcdef",
      afterText: "aBcdeF",
      changes: [
        { startOffset: 1, endOffsetExclusive: 2, newText: "B" },
        { startOffset: 5, endOffsetExclusive: 6, newText: "F" }
      ],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    const acknowledged = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-2",
      isDirty: false,
      flushToken: "flush-standalone",
      languageId: "typescript"
    });
    const acknowledgedOutcome = await service.commitFlush({
      flushToken: acknowledged.flushToken,
      totalModifiedCount: 0
    });
    assert.deepStrictEqual({
      marker: marker?.status !== "skipped" && marker ? {
        version: marker.version,
        sequence: marker.sequence,
        editIdLength: marker.editId.length,
        beforeDigest: marker.beforeDigest,
        afterDigest: marker.afterDigest
      } : marker,
      events: events.map((event) => ({
        eventName: event.eventName,
        sourceKey: event.data.sourceKey,
        modifiedCount: event.data.modifiedCount,
        deltaModifiedCount: event.data.deltaModifiedCount,
        totalModifiedCount: event.data.totalModifiedCount,
        origin: event.data.origin,
        harness: event.data.harness
      })),
      acknowledged: acknowledged && {
        agentModifiedCount: acknowledged.agentModifiedCount,
        outcome: acknowledgedOutcome
      }
    }, {
      marker: {
        version: 1,
        sequence: 1,
        editIdLength: 36,
        beforeDigest: createFileEditContentDigest("abcdef"),
        afterDigest: createFileEditContentDigest("aBcdeF")
      },
      events: [{
        eventName: "editTelemetry.editSources.details",
        sourceKey: "source:Chat.applyEdits-$modelId:model-$harness:copilot-$origin:agentHost",
        modifiedCount: 2,
        deltaModifiedCount: 2,
        totalModifiedCount: 2,
        origin: "agentHost",
        harness: "copilot"
      }],
      acknowledged: {
        agentModifiedCount: 2,
        outcome: {
          outcome: "committed",
          agentModifiedCount: 2
        }
      }
    });
  });
  test("preserves Agent attribution across later external disk edits", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("axb"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        events.push(data);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual(events.map((event) => ({
      modifiedCount: event.modifiedCount,
      deltaModifiedCount: event.deltaModifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      modifiedCount: 1,
      deltaModifiedCount: 1,
      totalModifiedCount: 1
    }]);
  });
  test("tracks creates and removes retained attribution after deletion", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString(""));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        events.push(data);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const baseEdit = {
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      filePath: resource.fsPath,
      modelId: "model",
      toolName: "edit"
    };
    await service.recordEdit({
      ...baseEdit,
      toolCallId: "tool-create",
      beforeText: "",
      afterText: "abc",
      changes: [{ startOffset: 0, endOffsetExclusive: 0, newText: "abc" }]
    });
    await service.recordEdit({
      ...baseEdit,
      toolCallId: "tool-delete",
      beforeText: "abc",
      afterText: "",
      changes: [{ startOffset: 0, endOffsetExclusive: 3, newText: "" }]
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual(events.map((event) => ({
      modifiedCount: event.modifiedCount,
      deltaModifiedCount: event.deltaModifiedCount,
      totalModifiedCount: event.totalModifiedCount
    })), [{
      modifiedCount: 0,
      deltaModifiedCount: 3,
      totalModifiedCount: 0
    }]);
  });
  test("flushes Agent-only resources when HEAD changes", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const triggers = [];
    let head = "head-1";
    let branch = "main";
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        triggers.push(data.trigger);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    head = "head-2";
    await service.checkGitState();
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    branch = "feature";
    await service.checkGitState();
    assert.deepStrictEqual(triggers, ["hashChange", "branchChange"]);
  });
  test("continues a Git-triggered flush after one resource fails", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      async readFile(resource) {
        if (resource.path === this.failPath) {
          throw new Error("Read failed");
        }
        return super.readFile(resource);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const failingResource = URI.file("/workspace/failing.ts");
    const successfulResource = URI.file("/workspace/successful.ts");
    await fileService.writeFile(failingResource, VSBuffer.fromString("ab"));
    await fileService.writeFile(successfulResource, VSBuffer.fromString("ab"));
    let branch = "main";
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    for (const [toolCallId, resource] of [["tool-failing", failingResource], ["tool-successful", successfulResource]]) {
      await service.recordEdit({
        sessionUri: "copilot:/session-1",
        turnId: "turn-1",
        toolCallId,
        filePath: resource.fsPath,
        beforeText: "a",
        afterText: "ab",
        changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
        modelId: "model",
        toolName: "edit"
      });
    }
    provider.failPath = failingResource.path;
    branch = "feature";
    await service.checkGitState();
    const eventCountAfterFailure = eventCount;
    provider.failPath = void 0;
    await service.checkGitState();
    assert.deepStrictEqual({
      eventCountAfterFailure,
      eventCountAfterRetry: eventCount
    }, {
      eventCountAfterFailure: 1,
      eventCountAfterRetry: 2
    });
  });
  test("keeps a Git boundary pending while an edit is being recorded", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const bridgeStarted = new DeferredPromise();
    const bridgeResult = new DeferredPromise();
    let branch = "main";
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      async computeDiffCounts(original, modified, timeoutMs) {
        if (original === "ab" && modified === "ac") {
          bridgeStarted.complete();
          return bridgeResult.p;
        }
        return computeDiffCounts(original, modified, timeoutMs ?? 5e3);
      }
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const recording = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ac",
      afterText: "acd",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "d" }],
      modelId: "model",
      toolName: "edit"
    });
    await bridgeStarted.p;
    await fileService.writeFile(resource, VSBuffer.fromString("acd"));
    branch = "feature";
    await service.checkGitState();
    const eventCountWhileRecording = eventCount;
    bridgeResult.complete(computeDiffCounts("ab", "ac", 5e3));
    await recording;
    await service.checkGitState();
    assert.deepStrictEqual({
      eventCountWhileRecording,
      eventCountAfterRecording: eventCount
    }, {
      eventCountWhileRecording: 0,
      eventCountAfterRecording: 1
    });
  });
  test("serializes a new edit behind a failing Git flush", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const readStarted = new DeferredPromise();
    const readResult = new DeferredPromise();
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      constructor() {
        super(...arguments);
        this.blockReads = false;
      }
      async readFile(resource2) {
        if (this.blockReads) {
          readStarted.complete();
          return readResult.p;
        }
        return super.readFile(resource2);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let branch = "main";
    const retainedCounts = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        retainedCounts.push(data.modifiedCount);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => ({
      root: "/workspace",
      branch,
      head: "head-1"
    }), void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    provider.blockReads = true;
    branch = "feature";
    const boundaryFlush = service.checkGitState();
    await readStarted.p;
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const recording = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await readResult.error(new Error("Read failed"));
    await boundaryFlush;
    await recording;
    provider.blockReads = false;
    await service.checkGitState();
    assert.deepStrictEqual(retainedCounts, [2]);
  });
  test("does not retain attribution when usage telemetry is disabled", async () => {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.NONE });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    assert.strictEqual(marker, void 0);
  });
  test("discards attribution when edit telemetry is disabled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    service.setEnabled(false);
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ marker, eventCount }, { marker: void 0, eventCount: 0 });
  });
  test("fences in-flight attribution after edit telemetry is disabled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const repositoryReadStarted = new DeferredPromise();
    const repositoryRead = new DeferredPromise();
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
      repositoryReadStarted.complete();
      return repositoryRead.p;
    }, void 0));
    const recordEdit = service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await repositoryReadStarted.p;
    service.setEnabled(false);
    service.setEnabled(true);
    repositoryRead.complete(void 0);
    const marker = await recordEdit;
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ marker, eventCount }, { marker: void 0, eventCount: 0 });
  });
  test("signals files larger than the five MB attribution limit", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/large.ts");
    const beforeText = "a".repeat(6 * 1024 * 1024);
    const afterText = `${beforeText}b`;
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText,
      afterText,
      changes: [{ startOffset: beforeText.length, endOffsetExclusive: beforeText.length, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual(marker && {
      status: marker.status,
      reason: marker.status === "skipped" ? marker.reason : void 0,
      insertedCount: marker.status === "skipped" ? marker.insertedCount : void 0
    }, {
      status: "skipped",
      reason: "fileTooLarge",
      insertedCount: 1
    });
  });
  test("returns a marker when the interval safety limit flushes the resource", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    const characters = Array.from("a".repeat(20001));
    const changes = [];
    for (let offset = 0; offset < characters.length; offset += 2) {
      characters[offset] = "b";
      changes.push({ startOffset: offset, endOffsetExclusive: offset + 1, newText: "b" });
    }
    const afterText = characters.join("");
    await fileService.writeFile(resource, VSBuffer.fromString(afterText));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    const marker = await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a".repeat(20001),
      afterText,
      changes,
      modelId: "model",
      toolName: "edit"
    });
    assert.deepStrictEqual({
      status: marker?.status,
      eventCount
    }, {
      status: void 0,
      eventCount: 1
    });
  });
  test("retries expired non-repository lookups", async () => {
    let now = 0;
    let repositoryReadCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, disposables.add(new FileService(new NullLogService())));
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, { telemetryLevel: TelemetryLevel.USAGE });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => {
      repositoryReadCount++;
      return void 0;
    }, () => now));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: "/workspace/file.ts",
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: "/workspace/file.ts",
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    now = 10 * 60 * 1e3 + 1;
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-3",
      toolCallId: "tool-3",
      filePath: "/workspace/file.ts",
      beforeText: "abc",
      afterText: "abcd",
      changes: [{ startOffset: 3, endOffsetExclusive: 3, newText: "d" }],
      modelId: "model",
      toolName: "edit"
    });
    assert.strictEqual(repositoryReadCount, 2);
  });
  test("flushes only the closing session when sessions edit the same file", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, {
      computeDiffCounts: async (original, modified, timeoutMs) => computeDiffCounts(original, modified, timeoutMs ?? 5e3)
    });
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        events.push(data);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-b",
      turnId: "turn-b",
      toolCallId: "tool-b",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-a");
    const afterFirstFlush = events.map((event) => event.conversationId);
    await service.flushSession("copilot:/session-b");
    assert.deepStrictEqual({
      afterFirstFlush,
      allEvents: events.map((event) => ({
        conversationId: event.conversationId,
        modifiedCount: event.modifiedCount,
        deltaModifiedCount: event.deltaModifiedCount
      }))
    }, {
      afterFirstFlush: ["session-a"],
      allEvents: [
        { conversationId: "session-a", modifiedCount: 1, deltaModifiedCount: 1 },
        { conversationId: "session-b", modifiedCount: 1, deltaModifiedCount: 1 }
      ]
    });
  });
  test("coordinates a live session after another session flushed the same file", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("abc"));
    const events = [];
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2(_eventName, data) {
        events.push(data);
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-a",
      turnId: "turn-a",
      toolCallId: "tool-a",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.recordEdit({
      sessionUri: "copilot:/session-b",
      turnId: "turn-b",
      toolCallId: "tool-b",
      filePath: resource.fsPath,
      beforeText: "ab",
      afterText: "abc",
      changes: [{ startOffset: 2, endOffsetExclusive: 2, newText: "c" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-a");
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.commitFlush({ flushToken: prepared.flushToken, totalModifiedCount: prepared.agentModifiedCount });
    assert.deepStrictEqual(events.map((event) => ({
      conversationId: event.conversationId,
      modifiedCount: event.modifiedCount
    })), [
      { conversationId: "session-a", modifiedCount: 0 },
      { conversationId: "session-b", modifiedCount: 1 }
    ]);
  });
  test("claims a resource once when flush triggers race", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const [_, prepared] = await Promise.all([
      service.flushSession("copilot:/session-1"),
      service.prepareFlush({
        resource,
        trigger: "closed",
        statsUuid: "stats-1",
        isDirty: false,
        flushToken: "flush-1",
        languageId: "typescript"
      })
    ]);
    assert.deepStrictEqual({
      prepared: prepared && {
        agentModifiedCount: prepared.agentModifiedCount,
        lastSequence: prepared.lastSequence
      },
      eventCount
    }, {
      prepared: {
        agentModifiedCount: 1,
        lastSequence: 1
      },
      eventCount: 1
    });
  });
  test("coordinates Windows resources when path casing differs", async () => {
    if (!isWindows) {
      return;
    }
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    const filePath = URI.file("/Workspace/file.ts").fsPath;
    await fileService.createFolder(URI.file("/Workspace"));
    await fileService.writeFile(URI.file(filePath), VSBuffer.fromString("ab"));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    assert.deepStrictEqual(prepared && {
      flushToken: prepared.flushToken,
      agentModifiedCount: prepared.agentModifiedCount
    }, {
      flushToken: "flush-1",
      agentModifiedCount: 1
    });
  });
  test("restores prepared resources when a coordinated flush is cancelled", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: prepared.flushToken });
    await service.flushSession("copilot:/session-1");
    assert.strictEqual(eventCount, 1);
  });
  test("waits for an in-flight prepare before cancelling it", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    const readStarted = new DeferredPromise();
    const readResult = new DeferredPromise();
    const provider = disposables.add(new class extends InMemoryFileSystemProvider {
      constructor() {
        super(...arguments);
        this.blockReads = false;
      }
      async readFile(resource2) {
        if (this.blockReads) {
          readStarted.complete();
          return readResult.p;
        }
        return super.readFile(resource2);
      }
    }());
    disposables.add(fileService.registerProvider("file", provider));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    provider.blockReads = true;
    const prepare = service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await readStarted.p;
    const cancel = service.cancelFlush({ flushToken: "flush-1" });
    readResult.complete(VSBuffer.fromString("ab").buffer);
    const [prepared, cancelOutcome] = await Promise.all([prepare, cancel]);
    provider.blockReads = false;
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({
      prepared: prepared?.agentModifiedCount,
      cancelOutcome,
      eventCount
    }, {
      prepared: 1,
      cancelOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      eventCount: 1
    });
  });
  test("reserves standalone ownership for one prepared flush", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.flushSession("copilot:/session-1");
    const first = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    const duplicate = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-2",
      isDirty: false,
      flushToken: "flush-2",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: "flush-1" });
    const restored = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-3",
      isDirty: false,
      flushToken: "flush-3",
      languageId: "typescript"
    });
    await service.cancelFlush({ flushToken: "flush-3" });
    assert.deepStrictEqual({
      first: first?.agentModifiedCount,
      duplicate,
      restored: restored?.agentModifiedCount
    }, {
      first: 1,
      duplicate: void 0,
      restored: 1
    });
  });
  test("makes commit and cancellation idempotent after telemetry is emitted", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    const outcomes = [
      await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 }),
      await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 }),
      await service.cancelFlush({ flushToken: "flush-1" })
    ];
    assert.deepStrictEqual({ outcomes, eventCount }, {
      outcomes: [
        { outcome: "committed", agentModifiedCount: 1 },
        { outcome: "committed", agentModifiedCount: 1 },
        { outcome: "committed", agentModifiedCount: 1 }
      ],
      eventCount: 1
    });
  });
  test("restores an unclaimed prepared flush after its timeout", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    let now = 0;
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, () => now));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    now = 5 * 60 * 1e3 + 1;
    await service.checkGitState();
    const commitOutcome = await service.commitFlush({ flushToken: "flush-1", totalModifiedCount: 1 });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ commitOutcome, eventCount }, {
      commitOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      eventCount: 1
    });
  });
  test("fences a prepare request that arrives after cancellation", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("ab"));
    let eventCount = 0;
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(IDiffComputeService, new TestDiffComputeService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITelemetryService, {
      telemetryLevel: TelemetryLevel.USAGE,
      publicLog2() {
        eventCount++;
      }
    });
    const service = disposables.add(instantiationService.createInstance(AgentEditAttributionService, async () => void 0, void 0));
    await service.recordEdit({
      sessionUri: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "a",
      afterText: "ab",
      changes: [{ startOffset: 1, endOffsetExclusive: 1, newText: "b" }],
      modelId: "model",
      toolName: "edit"
    });
    const cancelOutcome = await service.cancelFlush({ flushToken: "flush-1" });
    const prepared = await service.prepareFlush({
      resource,
      trigger: "closed",
      statsUuid: "stats-1",
      isDirty: false,
      flushToken: "flush-1",
      languageId: "typescript"
    });
    await service.flushSession("copilot:/session-1");
    assert.deepStrictEqual({ cancelOutcome, prepared, eventCount }, {
      cancelOutcome: { outcome: "cancelled", agentModifiedCount: 0 },
      prepared: void 0,
      eventCount: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0QXR0cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvYWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVEaWZmQ291bnRzIH0gZnJvbSAnLi4vLi4vbm9kZS9kaWZmV29ya2VyTWFpbi5qcyc7XG5pbXBvcnQgeyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbnN1aXRlKCdBZ2VudCBFZGl0IEF0dHJpYnV0aW9uIFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1pdHMgcmV0YWluZWQgQWdlbnQgY2hhcmFjdGVycyBmcm9tIGRpc2pvaW50IGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYUJjZGVGJykpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiB7IGV2ZW50TmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+IH1bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIHtcblx0XHRcdGNvbXB1dGVEaWZmQ291bnRzOiBhc3luYyAob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpID0+IGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zID8/IDVfMDAwKSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBldmVudE5hbWUsIGRhdGE6IGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPiB9KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiY2RlZicsXG5cdFx0XHRhZnRlclRleHQ6ICdhQmNkZUYnLFxuXHRcdFx0Y2hhbmdlczogW1xuXHRcdFx0XHR7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDIsIG5ld1RleHQ6ICdCJyB9LFxuXHRcdFx0XHR7IHN0YXJ0T2Zmc2V0OiA1LCBlbmRPZmZzZXRFeGNsdXNpdmU6IDYsIG5ld1RleHQ6ICdGJyB9LFxuXHRcdFx0XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblx0XHRjb25zdCBhY2tub3dsZWRnZWQgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMicsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC1zdGFuZGFsb25lJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblx0XHRjb25zdCBhY2tub3dsZWRnZWRPdXRjb21lID0gYXdhaXQgc2VydmljZS5jb21taXRGbHVzaCh7XG5cdFx0XHRmbHVzaFRva2VuOiBhY2tub3dsZWRnZWQhLmZsdXNoVG9rZW4sXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1hcmtlcjogbWFya2VyPy5zdGF0dXMgIT09ICdza2lwcGVkJyAmJiBtYXJrZXIgPyB7XG5cdFx0XHRcdHZlcnNpb246IG1hcmtlci52ZXJzaW9uLFxuXHRcdFx0XHRzZXF1ZW5jZTogbWFya2VyLnNlcXVlbmNlLFxuXHRcdFx0XHRlZGl0SWRMZW5ndGg6IG1hcmtlci5lZGl0SWQubGVuZ3RoLFxuXHRcdFx0XHRiZWZvcmVEaWdlc3Q6IG1hcmtlci5iZWZvcmVEaWdlc3QsXG5cdFx0XHRcdGFmdGVyRGlnZXN0OiBtYXJrZXIuYWZ0ZXJEaWdlc3QsXG5cdFx0XHR9IDogbWFya2VyLFxuXHRcdFx0ZXZlbnRzOiBldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHRcdGV2ZW50TmFtZTogZXZlbnQuZXZlbnROYW1lLFxuXHRcdFx0XHRzb3VyY2VLZXk6IGV2ZW50LmRhdGEuc291cmNlS2V5LFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiBldmVudC5kYXRhLm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGF0YS5kZWx0YU1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogZXZlbnQuZGF0YS50b3RhbE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdG9yaWdpbjogZXZlbnQuZGF0YS5vcmlnaW4sXG5cdFx0XHRcdGhhcm5lc3M6IGV2ZW50LmRhdGEuaGFybmVzcyxcblx0XHRcdH0pKSxcblx0XHRcdGFja25vd2xlZGdlZDogYWNrbm93bGVkZ2VkICYmIHtcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBhY2tub3dsZWRnZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0XHRvdXRjb21lOiBhY2tub3dsZWRnZWRPdXRjb21lLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRtYXJrZXI6IHtcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0c2VxdWVuY2U6IDEsXG5cdFx0XHRcdGVkaXRJZExlbmd0aDogMzYsXG5cdFx0XHRcdGJlZm9yZURpZ2VzdDogY3JlYXRlRmlsZUVkaXRDb250ZW50RGlnZXN0KCdhYmNkZWYnKSxcblx0XHRcdFx0YWZ0ZXJEaWdlc3Q6IGNyZWF0ZUZpbGVFZGl0Q29udGVudERpZ2VzdCgnYUJjZGVGJyksXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRzOiBbe1xuXHRcdFx0XHRldmVudE5hbWU6ICdlZGl0VGVsZW1ldHJ5LmVkaXRTb3VyY2VzLmRldGFpbHMnLFxuXHRcdFx0XHRzb3VyY2VLZXk6ICdzb3VyY2U6Q2hhdC5hcHBseUVkaXRzLSRtb2RlbElkOm1vZGVsLSRoYXJuZXNzOmNvcGlsb3QtJG9yaWdpbjphZ2VudEhvc3QnLFxuXHRcdFx0XHRtb2RpZmllZENvdW50OiAyLFxuXHRcdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDIsXG5cdFx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogMixcblx0XHRcdFx0b3JpZ2luOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0aGFybmVzczogJ2NvcGlsb3QnLFxuXHRcdFx0fV0sXG5cdFx0XHRhY2tub3dsZWRnZWQ6IHtcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0XHRvdXRjb21lOiB7XG5cdFx0XHRcdFx0b3V0Y29tZTogJ2NvbW1pdHRlZCcsXG5cdFx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAyLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIEFnZW50IGF0dHJpYnV0aW9uIGFjcm9zcyBsYXRlciBleHRlcm5hbCBkaXNrIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYXhiJykpO1xuXG5cdFx0Y29uc3QgZXZlbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCB7XG5cdFx0XHRjb21wdXRlRGlmZkNvdW50czogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zKSA9PiBjb21wdXRlRGlmZkNvdW50cyhvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcyA/PyA1XzAwMCksXG5cdFx0fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoX2V2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRldmVudHMucHVzaChkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IGV2ZW50LmRlbHRhTW9kaWZpZWRDb3VudCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogZXZlbnQudG90YWxNb2RpZmllZENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdG1vZGlmaWVkQ291bnQ6IDEsXG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDEsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IDEsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja3MgY3JlYXRlcyBhbmQgcmVtb3ZlcyByZXRhaW5lZCBhdHRyaWJ1dGlvbiBhZnRlciBkZWxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpKTtcblxuXHRcdGNvbnN0IGV2ZW50czogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoX2V2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHRldmVudHMucHVzaChkYXRhIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD4pO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBiYXNlRWRpdCA9IHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9O1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdC4uLmJhc2VFZGl0LFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtY3JlYXRlJyxcblx0XHRcdGJlZm9yZVRleHQ6ICcnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAwLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDAsIG5ld1RleHQ6ICdhYmMnIH1dLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHQuLi5iYXNlRWRpdCxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWRlbGV0ZScsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYWJjJyxcblx0XHRcdGFmdGVyVGV4dDogJycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMCwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAzLCBuZXdUZXh0OiAnJyB9XSxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IGV2ZW50LmRlbHRhTW9kaWZpZWRDb3VudCxcblx0XHRcdHRvdGFsTW9kaWZpZWRDb3VudDogZXZlbnQudG90YWxNb2RpZmllZENvdW50LFxuXHRcdH0pKSwgW3tcblx0XHRcdG1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0XHRkZWx0YU1vZGlmaWVkQ291bnQ6IDMsXG5cdFx0XHR0b3RhbE1vZGlmaWVkQ291bnQ6IDAsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmbHVzaGVzIEFnZW50LW9ubHkgcmVzb3VyY2VzIHdoZW4gSEVBRCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRjb25zdCB0cmlnZ2Vyczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaGVhZCA9ICdoZWFkLTEnO1xuXHRcdGxldCBicmFuY2ggPSAnbWFpbic7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoX2V2ZW50TmFtZSwgZGF0YSkge1xuXHRcdFx0XHR0cmlnZ2Vycy5wdXNoKChkYXRhIGFzIHsgdHJpZ2dlcjogc3RyaW5nIH0pLnRyaWdnZXIpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gKHtcblx0XHRcdHJvb3Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaCxcblx0XHRcdGhlYWQsXG5cdFx0fSksIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGhlYWQgPSAnaGVhZC0yJztcblx0XHRhd2FpdCBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiYycpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRicmFuY2ggPSAnZmVhdHVyZSc7XG5cdFx0YXdhaXQgc2VydmljZS5jaGVja0dpdFN0YXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyaWdnZXJzLCBbJ2hhc2hDaGFuZ2UnLCAnYnJhbmNoQ2hhbmdlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250aW51ZXMgYSBHaXQtdHJpZ2dlcmVkIGZsdXNoIGFmdGVyIG9uZSByZXNvdXJjZSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdFx0XHRmYWlsUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRvdmVycmlkZSBhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoID09PSB0aGlzLmZhaWxQYXRoKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZWFkIGZhaWxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdXBlci5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHByb3ZpZGVyKSk7XG5cdFx0Y29uc3QgZmFpbGluZ1Jlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmFpbGluZy50cycpO1xuXHRcdGNvbnN0IHN1Y2Nlc3NmdWxSZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3N1Y2Nlc3NmdWwudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZmFpbGluZ1Jlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc3VjY2Vzc2Z1bFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBicmFuY2ggPSAnbWFpbic7XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKCkge1xuXHRcdFx0XHRldmVudENvdW50Kys7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiAoe1xuXHRcdFx0cm9vdDogJy93b3Jrc3BhY2UnLFxuXHRcdFx0YnJhbmNoLFxuXHRcdFx0aGVhZDogJ2hlYWQtMScsXG5cdFx0fSksIHVuZGVmaW5lZCkpO1xuXHRcdGZvciAoY29uc3QgW3Rvb2xDYWxsSWQsIHJlc291cmNlXSBvZiBbWyd0b29sLWZhaWxpbmcnLCBmYWlsaW5nUmVzb3VyY2VdLCBbJ3Rvb2wtc3VjY2Vzc2Z1bCcsIHN1Y2Nlc3NmdWxSZXNvdXJjZV1dIGFzIGNvbnN0KSB7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRwcm92aWRlci5mYWlsUGF0aCA9IGZhaWxpbmdSZXNvdXJjZS5wYXRoO1xuXHRcdGJyYW5jaCA9ICdmZWF0dXJlJztcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXHRcdGNvbnN0IGV2ZW50Q291bnRBZnRlckZhaWx1cmUgPSBldmVudENvdW50O1xuXHRcdHByb3ZpZGVyLmZhaWxQYXRoID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudENvdW50QWZ0ZXJGYWlsdXJlLFxuXHRcdFx0ZXZlbnRDb3VudEFmdGVyUmV0cnk6IGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudEFmdGVyRmFpbHVyZTogMSxcblx0XHRcdGV2ZW50Q291bnRBZnRlclJldHJ5OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhIEdpdCBib3VuZGFyeSBwZW5kaW5nIHdoaWxlIGFuIGVkaXQgaXMgYmVpbmcgcmVjb3JkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGNvbnN0IGJyaWRnZVN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgYnJpZGdlUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZXR1cm5UeXBlPHR5cGVvZiBjb21wdXRlRGlmZkNvdW50cz4+KCk7XG5cdFx0bGV0IGJyYW5jaCA9ICdtYWluJztcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwge1xuXHRcdFx0YXN5bmMgY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpIHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsID09PSAnYWInICYmIG1vZGlmaWVkID09PSAnYWMnKSB7XG5cdFx0XHRcdFx0YnJpZGdlU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRcdHJldHVybiBicmlkZ2VSZXN1bHQucDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY29tcHV0ZURpZmZDb3VudHMob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMgPz8gNV8wMDApO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gKHtcblx0XHRcdHJvb3Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaCxcblx0XHRcdGhlYWQ6ICdoZWFkLTEnLFxuXHRcdH0pLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZWNvcmRpbmcgPSBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FjJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FjZCcsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnZCcgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBicmlkZ2VTdGFydGVkLnA7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhY2QnKSk7XG5cdFx0YnJhbmNoID0gJ2ZlYXR1cmUnO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXHRcdGNvbnN0IGV2ZW50Q291bnRXaGlsZVJlY29yZGluZyA9IGV2ZW50Q291bnQ7XG5cdFx0YnJpZGdlUmVzdWx0LmNvbXBsZXRlKGNvbXB1dGVEaWZmQ291bnRzKCdhYicsICdhYycsIDVfMDAwKSk7XG5cdFx0YXdhaXQgcmVjb3JkaW5nO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2hlY2tHaXRTdGF0ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudENvdW50V2hpbGVSZWNvcmRpbmcsXG5cdFx0XHRldmVudENvdW50QWZ0ZXJSZWNvcmRpbmc6IGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudFdoaWxlUmVjb3JkaW5nOiAwLFxuXHRcdFx0ZXZlbnRDb3VudEFmdGVyUmVjb3JkaW5nOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIGEgbmV3IGVkaXQgYmVoaW5kIGEgZmFpbGluZyBHaXQgZmx1c2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcmVhZFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVhZFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VWludDhBcnJheT4oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB7XG5cdFx0XHRibG9ja1JlYWRzID0gZmFsc2U7XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRcdFx0aWYgKHRoaXMuYmxvY2tSZWFkcykge1xuXHRcdFx0XHRcdHJlYWRTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlYWRSZXN1bHQucDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc3VwZXIucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0oKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBwcm92aWRlcikpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgYnJhbmNoID0gJ21haW4nO1xuXHRcdGNvbnN0IHJldGFpbmVkQ291bnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKF9ldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0cmV0YWluZWRDb3VudHMucHVzaCgoZGF0YSBhcyB7IG1vZGlmaWVkQ291bnQ6IG51bWJlciB9KS5tb2RpZmllZENvdW50KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+ICh7XG5cdFx0XHRyb290OiAnL3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2gsXG5cdFx0XHRoZWFkOiAnaGVhZC0xJyxcblx0XHR9KSwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdHByb3ZpZGVyLmJsb2NrUmVhZHMgPSB0cnVlO1xuXHRcdGJyYW5jaCA9ICdmZWF0dXJlJztcblxuXHRcdGNvbnN0IGJvdW5kYXJ5Rmx1c2ggPSBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblx0XHRhd2FpdCByZWFkU3RhcnRlZC5wO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWJjJykpO1xuXHRcdGNvbnN0IHJlY29yZGluZyA9IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYWInLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAyLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDIsIG5ld1RleHQ6ICdjJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlYWRSZXN1bHQuZXJyb3IobmV3IEVycm9yKCdSZWFkIGZhaWxlZCcpKTtcblx0XHRhd2FpdCBib3VuZGFyeUZsdXNoO1xuXHRcdGF3YWl0IHJlY29yZGluZztcblx0XHRwcm92aWRlci5ibG9ja1JlYWRzID0gZmFsc2U7XG5cdFx0YXdhaXQgc2VydmljZS5jaGVja0dpdFN0YXRlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJldGFpbmVkQ291bnRzLCBbMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXRhaW4gYXR0cmlidXRpb24gd2hlbiB1c2FnZSB0ZWxlbWV0cnkgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5OT05FIH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0gYXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkcyBhdHRyaWJ1dGlvbiB3aGVuIGVkaXQgdGVsZW1ldHJ5IGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoKSB7XG5cdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0c2VydmljZS5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbWFya2VyLCBldmVudENvdW50IH0sIHsgbWFya2VyOiB1bmRlZmluZWQsIGV2ZW50Q291bnQ6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZlbmNlcyBpbi1mbGlnaHQgYXR0cmlidXRpb24gYWZ0ZXIgZWRpdCB0ZWxlbWV0cnkgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJlYWRTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSZWFkID0gbmV3IERlZmVycmVkUHJvbWlzZTx1bmRlZmluZWQ+KCk7XG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKCkge1xuXHRcdFx0XHRldmVudENvdW50Kys7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXBvc2l0b3J5UmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdHJldHVybiByZXBvc2l0b3J5UmVhZC5wO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgcmVjb3JkRWRpdCA9IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlcG9zaXRvcnlSZWFkU3RhcnRlZC5wO1xuXHRcdHNlcnZpY2Uuc2V0RW5hYmxlZChmYWxzZSk7XG5cdFx0c2VydmljZS5zZXRFbmFibGVkKHRydWUpO1xuXHRcdHJlcG9zaXRvcnlSZWFkLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSBhd2FpdCByZWNvcmRFZGl0O1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBtYXJrZXIsIGV2ZW50Q291bnQgfSwgeyBtYXJrZXI6IHVuZGVmaW5lZCwgZXZlbnRDb3VudDogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2lnbmFscyBmaWxlcyBsYXJnZXIgdGhhbiB0aGUgZml2ZSBNQiBhdHRyaWJ1dGlvbiBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2xhcmdlLnRzJyk7XG5cdFx0Y29uc3QgYmVmb3JlVGV4dCA9ICdhJy5yZXBlYXQoNiAqIDEwMjQgKiAxMDI0KTtcblx0XHRjb25zdCBhZnRlclRleHQgPSBgJHtiZWZvcmVUZXh0fWJgO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhhZnRlclRleHQpKTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKCkgeyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0gYXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQsXG5cdFx0XHRhZnRlclRleHQsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogYmVmb3JlVGV4dC5sZW5ndGgsIGVuZE9mZnNldEV4Y2x1c2l2ZTogYmVmb3JlVGV4dC5sZW5ndGgsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VyICYmIHtcblx0XHRcdHN0YXR1czogbWFya2VyLnN0YXR1cyxcblx0XHRcdHJlYXNvbjogbWFya2VyLnN0YXR1cyA9PT0gJ3NraXBwZWQnID8gbWFya2VyLnJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGluc2VydGVkQ291bnQ6IG1hcmtlci5zdGF0dXMgPT09ICdza2lwcGVkJyA/IG1hcmtlci5pbnNlcnRlZENvdW50IDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0cmVhc29uOiAnZmlsZVRvb0xhcmdlJyxcblx0XHRcdGluc2VydGVkQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSBtYXJrZXIgd2hlbiB0aGUgaW50ZXJ2YWwgc2FmZXR5IGxpbWl0IGZsdXNoZXMgdGhlIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGNvbnN0IGNoYXJhY3RlcnMgPSBBcnJheS5mcm9tKCdhJy5yZXBlYXQoMjBfMDAxKSk7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IFtdO1xuXHRcdGZvciAobGV0IG9mZnNldCA9IDA7IG9mZnNldCA8IGNoYXJhY3RlcnMubGVuZ3RoOyBvZmZzZXQgKz0gMikge1xuXHRcdFx0Y2hhcmFjdGVyc1tvZmZzZXRdID0gJ2InO1xuXHRcdFx0Y2hhbmdlcy5wdXNoKHsgc3RhcnRPZmZzZXQ6IG9mZnNldCwgZW5kT2Zmc2V0RXhjbHVzaXZlOiBvZmZzZXQgKyAxLCBuZXdUZXh0OiAnYicgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGFmdGVyVGV4dCA9IGNoYXJhY3RlcnMuam9pbignJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGFmdGVyVGV4dCkpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKCkge1xuXHRcdFx0XHRldmVudENvdW50Kys7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0gYXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJy5yZXBlYXQoMjBfMDAxKSxcblx0XHRcdGFmdGVyVGV4dCxcblx0XHRcdGNoYW5nZXMsXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBtYXJrZXI/LnN0YXR1cyxcblx0XHRcdGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiB1bmRlZmluZWQsXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIGV4cGlyZWQgbm9uLXJlcG9zaXRvcnkgbG9va3VwcycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgbm93ID0gMDtcblx0XHRsZXQgcmVwb3NpdG9yeVJlYWRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7IHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVwb3NpdG9yeVJlYWRDb3VudCsrO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LCAoKSA9PiBub3cpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYicsXG5cdFx0XHRhZnRlclRleHQ6ICdhYmMnLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDIsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMiwgbmV3VGV4dDogJ2MnIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0bm93ID0gMTAgKiA2MCAqIDEwMDAgKyAxO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMycsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0zJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdhYmMnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjZCcsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMywgZW5kT2Zmc2V0RXhjbHVzaXZlOiAzLCBuZXdUZXh0OiAnZCcgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXBvc2l0b3J5UmVhZENvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZmx1c2hlcyBvbmx5IHRoZSBjbG9zaW5nIHNlc3Npb24gd2hlbiBzZXNzaW9ucyBlZGl0IHRoZSBzYW1lIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmMnKSk7XG5cblx0XHRjb25zdCBldmVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIHtcblx0XHRcdGNvbXB1dGVEaWZmQ291bnRzOiBhc3luYyAob3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpID0+IGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zID8/IDVfMDAwKSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMihfZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGRhdGEgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkPik7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBhc3luYyAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi1hJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tYScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1hJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYScsXG5cdFx0XHRhZnRlclRleHQ6ICdhYicsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMSwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAxLCBuZXdUZXh0OiAnYicgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tYicsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLWInLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtYicsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2FiJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiYycsXG5cdFx0XHRjaGFuZ2VzOiBbeyBzdGFydE9mZnNldDogMiwgZW5kT2Zmc2V0RXhjbHVzaXZlOiAyLCBuZXdUZXh0OiAnYycgfV0sXG5cdFx0XHRtb2RlbElkOiAnbW9kZWwnLFxuXHRcdFx0dG9vbE5hbWU6ICdlZGl0Jyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLWEnKTtcblx0XHRjb25zdCBhZnRlckZpcnN0Rmx1c2ggPSBldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50LmNvbnZlcnNhdGlvbklkKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi1iJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyRmlyc3RGbHVzaCxcblx0XHRcdGFsbEV2ZW50czogZXZlbnRzLm1hcChldmVudCA9PiAoe1xuXHRcdFx0XHRjb252ZXJzYXRpb25JZDogZXZlbnQuY29udmVyc2F0aW9uSWQsXG5cdFx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGRlbHRhTW9kaWZpZWRDb3VudDogZXZlbnQuZGVsdGFNb2RpZmllZENvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGFmdGVyRmlyc3RGbHVzaDogWydzZXNzaW9uLWEnXSxcblx0XHRcdGFsbEV2ZW50czogW1xuXHRcdFx0XHR7IGNvbnZlcnNhdGlvbklkOiAnc2Vzc2lvbi1hJywgbW9kaWZpZWRDb3VudDogMSwgZGVsdGFNb2RpZmllZENvdW50OiAxIH0sXG5cdFx0XHRcdHsgY29udmVyc2F0aW9uSWQ6ICdzZXNzaW9uLWInLCBtb2RpZmllZENvdW50OiAxLCBkZWx0YU1vZGlmaWVkQ291bnQ6IDEgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvb3JkaW5hdGVzIGEgbGl2ZSBzZXNzaW9uIGFmdGVyIGFub3RoZXIgc2Vzc2lvbiBmbHVzaGVkIHRoZSBzYW1lIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYmMnKSk7XG5cblx0XHRjb25zdCBldmVudHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWZmQ29tcHV0ZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwuVVNBR0UsXG5cdFx0XHRwdWJsaWNMb2cyKF9ldmVudE5hbWUsIGRhdGEpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goZGF0YSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCB1bmRlZmluZWQ+KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLWEnLFxuXHRcdFx0dHVybklkOiAndHVybi1hJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLWEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkRWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29waWxvdDovc2Vzc2lvbi1iJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tYicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC1iJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnYWInLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWJjJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAyLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDIsIG5ld1RleHQ6ICdjJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLWEnKTtcblxuXHRcdGNvbnN0IHByZXBhcmVkID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5jb21taXRGbHVzaCh7IGZsdXNoVG9rZW46IHByZXBhcmVkIS5mbHVzaFRva2VuLCB0b3RhbE1vZGlmaWVkQ291bnQ6IHByZXBhcmVkIS5hZ2VudE1vZGlmaWVkQ291bnQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdGNvbnZlcnNhdGlvbklkOiBldmVudC5jb252ZXJzYXRpb25JZCxcblx0XHRcdG1vZGlmaWVkQ291bnQ6IGV2ZW50Lm1vZGlmaWVkQ291bnQsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IGNvbnZlcnNhdGlvbklkOiAnc2Vzc2lvbi1hJywgbW9kaWZpZWRDb3VudDogMCB9LFxuXHRcdFx0eyBjb252ZXJzYXRpb25JZDogJ3Nlc3Npb24tYicsIG1vZGlmaWVkQ291bnQ6IDEgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY2xhaW1zIGEgcmVzb3VyY2Ugb25jZSB3aGVuIGZsdXNoIHRyaWdnZXJzIHJhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBbXywgcHJlcGFyZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VydmljZS5mbHVzaFNlc3Npb24oJ2NvcGlsb3Q6L3Nlc3Npb24tMScpLFxuXHRcdFx0c2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQ6IHByZXBhcmVkICYmIHtcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiBwcmVwYXJlZC5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRcdGxhc3RTZXF1ZW5jZTogcHJlcGFyZWQubGFzdFNlcXVlbmNlLFxuXHRcdFx0fSxcblx0XHRcdGV2ZW50Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0cHJlcGFyZWQ6IHtcblx0XHRcdFx0YWdlbnRNb2RpZmllZENvdW50OiAxLFxuXHRcdFx0XHRsYXN0U2VxdWVuY2U6IDEsXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29vcmRpbmF0ZXMgV2luZG93cyByZXNvdXJjZXMgd2hlbiBwYXRoIGNhc2luZyBkaWZmZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGNvbnN0IGZpbGVQYXRoID0gVVJJLmZpbGUoJy9Xb3Jrc3BhY2UvZmlsZS50cycpLmZzUGF0aDtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLmZpbGUoJy9Xb3Jrc3BhY2UnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKGZpbGVQYXRoKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHsgfSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlcGFyZWQgJiYge1xuXHRcdFx0Zmx1c2hUb2tlbjogcHJlcGFyZWQuZmx1c2hUb2tlbixcblx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogcHJlcGFyZWQuYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdH0sIHtcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGFnZW50TW9kaWZpZWRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgcHJlcGFyZWQgcmVzb3VyY2VzIHdoZW4gYSBjb29yZGluYXRlZCBmbHVzaCBpcyBjYW5jZWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVGbHVzaCh7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHRyaWdnZXI6ICdjbG9zZWQnLFxuXHRcdFx0c3RhdHNVdWlkOiAnc3RhdHMtMScsXG5cdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdGZsdXNoVG9rZW46ICdmbHVzaC0xJyxcblx0XHRcdGxhbmd1YWdlSWQ6ICd0eXBlc2NyaXB0Jyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY2FuY2VsRmx1c2goeyBmbHVzaFRva2VuOiBwcmVwYXJlZCEuZmx1c2hUb2tlbiB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLmZsdXNoU2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhaXRzIGZvciBhbiBpbi1mbGlnaHQgcHJlcGFyZSBiZWZvcmUgY2FuY2VsbGluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZWFkU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZWFkUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxVaW50OEFycmF5PigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIHtcblx0XHRcdGJsb2NrUmVhZHMgPSBmYWxzZTtcblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdFx0XHRpZiAodGhpcy5ibG9ja1JlYWRzKSB7XG5cdFx0XHRcdFx0cmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVhZFJlc3VsdC5wO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdXBlci5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIHByb3ZpZGVyKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0cHJvdmlkZXIuYmxvY2tSZWFkcyA9IHRydWU7XG5cblx0XHRjb25zdCBwcmVwYXJlID0gc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgcmVhZFN0YXJ0ZWQucDtcblx0XHRjb25zdCBjYW5jZWwgPSBzZXJ2aWNlLmNhbmNlbEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnIH0pO1xuXHRcdHJlYWRSZXN1bHQuY29tcGxldGUoVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKS5idWZmZXIpO1xuXHRcdGNvbnN0IFtwcmVwYXJlZCwgY2FuY2VsT3V0Y29tZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbcHJlcGFyZSwgY2FuY2VsXSk7XG5cdFx0cHJvdmlkZXIuYmxvY2tSZWFkcyA9IGZhbHNlO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJlcGFyZWQ6IHByZXBhcmVkPy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0XHRjYW5jZWxPdXRjb21lLFxuXHRcdFx0ZXZlbnRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRwcmVwYXJlZDogMSxcblx0XHRcdGNhbmNlbE91dGNvbWU6IHsgb3V0Y29tZTogJ2NhbmNlbGxlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9LFxuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXJ2ZXMgc3RhbmRhbG9uZSBvd25lcnNoaXAgZm9yIG9uZSBwcmVwYXJlZCBmbHVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcignZmlsZScsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FiJykpO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoKSB7IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZHVwbGljYXRlID0gYXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTInLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMicsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KTtcblx0XHRjb25zdCByZXN0b3JlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0zJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTMnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY2FuY2VsRmx1c2goeyBmbHVzaFRva2VuOiAnZmx1c2gtMycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBmaXJzdD8uYWdlbnRNb2RpZmllZENvdW50LFxuXHRcdFx0ZHVwbGljYXRlLFxuXHRcdFx0cmVzdG9yZWQ6IHJlc3RvcmVkPy5hZ2VudE1vZGlmaWVkQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3Q6IDEsXG5cdFx0XHRkdXBsaWNhdGU6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3RvcmVkOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYWtlcyBjb21taXQgYW5kIGNhbmNlbGxhdGlvbiBpZGVtcG90ZW50IGFmdGVyIHRlbGVtZXRyeSBpcyBlbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnYWInKSk7XG5cblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpZmZDb21wdXRlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSxcblx0XHRcdHB1YmxpY0xvZzIoKSB7XG5cdFx0XHRcdGV2ZW50Q291bnQrKztcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIGFzeW5jICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdhJyxcblx0XHRcdGFmdGVyVGV4dDogJ2FiJyxcblx0XHRcdGNoYW5nZXM6IFt7IHN0YXJ0T2Zmc2V0OiAxLCBlbmRPZmZzZXRFeGNsdXNpdmU6IDEsIG5ld1RleHQ6ICdiJyB9XSxcblx0XHRcdG1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3V0Y29tZXMgPSBbXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNvbW1pdEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnLCB0b3RhbE1vZGlmaWVkQ291bnQ6IDEgfSksXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNvbW1pdEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnLCB0b3RhbE1vZGlmaWVkQ291bnQ6IDEgfSksXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNhbmNlbEZsdXNoKHsgZmx1c2hUb2tlbjogJ2ZsdXNoLTEnIH0pLFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgb3V0Y29tZXMsIGV2ZW50Q291bnQgfSwge1xuXHRcdFx0b3V0Y29tZXM6IFtcblx0XHRcdFx0eyBvdXRjb21lOiAnY29tbWl0dGVkJywgYWdlbnRNb2RpZmllZENvdW50OiAxIH0sXG5cdFx0XHRcdHsgb3V0Y29tZTogJ2NvbW1pdHRlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMSB9LFxuXHRcdFx0XHR7IG91dGNvbWU6ICdjb21taXR0ZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDEgfSxcblx0XHRcdF0sXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhbiB1bmNsYWltZWQgcHJlcGFyZWQgZmx1c2ggYWZ0ZXIgaXRzIHRpbWVvdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRsZXQgbm93ID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCAoKSA9PiBub3cpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cdFx0YXdhaXQgc2VydmljZS5wcmVwYXJlRmx1c2goe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHR0cmlnZ2VyOiAnY2xvc2VkJyxcblx0XHRcdHN0YXRzVXVpZDogJ3N0YXRzLTEnLFxuXHRcdFx0aXNEaXJ0eTogZmFsc2UsXG5cdFx0XHRmbHVzaFRva2VuOiAnZmx1c2gtMScsXG5cdFx0XHRsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsXG5cdFx0fSk7XG5cblx0XHRub3cgPSA1ICogNjAgKiAxMDAwICsgMTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNoZWNrR2l0U3RhdGUoKTtcblx0XHRjb25zdCBjb21taXRPdXRjb21lID0gYXdhaXQgc2VydmljZS5jb21taXRGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJywgdG90YWxNb2RpZmllZENvdW50OiAxIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb21taXRPdXRjb21lLCBldmVudENvdW50IH0sIHtcblx0XHRcdGNvbW1pdE91dGNvbWU6IHsgb3V0Y29tZTogJ2NhbmNlbGxlZCcsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9LFxuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmVuY2VzIGEgcHJlcGFyZSByZXF1ZXN0IHRoYXQgYXJyaXZlcyBhZnRlciBjYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhYicpKTtcblxuXHRcdGxldCBldmVudENvdW50ID0gMDtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRGlmZkNvbXB1dGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0dGVsZW1ldHJ5TGV2ZWw6IFRlbGVtZXRyeUxldmVsLlVTQUdFLFxuXHRcdFx0cHVibGljTG9nMigpIHtcblx0XHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2EnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnYWInLFxuXHRcdFx0Y2hhbmdlczogW3sgc3RhcnRPZmZzZXQ6IDEsIGVuZE9mZnNldEV4Y2x1c2l2ZTogMSwgbmV3VGV4dDogJ2InIH1dLFxuXHRcdFx0bW9kZWxJZDogJ21vZGVsJyxcblx0XHRcdHRvb2xOYW1lOiAnZWRpdCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjYW5jZWxPdXRjb21lID0gYXdhaXQgc2VydmljZS5jYW5jZWxGbHVzaCh7IGZsdXNoVG9rZW46ICdmbHVzaC0xJyB9KTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZUZsdXNoKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0dHJpZ2dlcjogJ2Nsb3NlZCcsXG5cdFx0XHRzdGF0c1V1aWQ6ICdzdGF0cy0xJyxcblx0XHRcdGlzRGlydHk6IGZhbHNlLFxuXHRcdFx0Zmx1c2hUb2tlbjogJ2ZsdXNoLTEnLFxuXHRcdFx0bGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmx1c2hTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYW5jZWxPdXRjb21lLCBwcmVwYXJlZCwgZXZlbnRDb3VudCB9LCB7XG5cdFx0XHRjYW5jZWxPdXRjb21lOiB7IG91dGNvbWU6ICdjYW5jZWxsZWQnLCBhZ2VudE1vZGlmaWVkQ291bnQ6IDAgfSxcblx0XHRcdHByZXBhcmVkOiB1bmRlZmluZWQsXG5cdFx0XHRldmVudENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGFB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
