import assert from "assert";
import { DeferredPromise, raceTimeout, timeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { NullTelemetryServiceShape } from "../../../../telemetry/common/telemetryUtils.js";
import { TelemetryLevel } from "../../../../telemetry/common/telemetry.js";
import { EditArcReporterService } from "../../../node/shared/editArcReporter.js";
import { TestDiffComputeService, createNoopGitService } from "../../common/sessionTestHelpers.js";
import { buildSubagentChatUri } from "../../../common/state/sessionState.js";
class CountingFileService extends FileService {
  constructor() {
    super(...arguments);
    this.watcherCount = 0;
  }
  createWatcher(resource, options) {
    this.watcherCount++;
    return super.createWatcher(resource, options);
  }
}
class RecordingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super();
    this.events = [];
    this.githubEvents = [];
    Object.defineProperty(this, "telemetryLevel", { value: TelemetryLevel.USAGE });
  }
  publicLog2(eventName, data) {
    const event = { name: eventName ?? "", data: data ?? {} };
    this.events.push(event);
    this.onEvent?.(event);
  }
  updateTelemetryLevel() {
  }
  sendGHTelemetryEvent(name, properties, measurements) {
    this.githubEvents.push({ name, properties, measurements });
  }
}
suite("Agent Host Edit ARC Reporter", () => {
  const disposables = new DisposableStore();
  let fileService;
  let telemetry;
  let config;
  setup(() => {
    fileService = disposables.add(new CountingFileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    telemetry = new RecordingTelemetryService();
    config = createConfigurationService(true);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("emits the locked Microsoft and GitHub event shape", async () => {
    const resource = URI.file("/workspace/file.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "copilotcli:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      modelId: "gpt-5",
      toolName: "edit",
      completionTime: Date.now()
    });
    await timeout(10);
    const event = telemetry.events[0];
    assert.deepStrictEqual({
      name: event.name,
      data: { ...event.data, uniqueEditId: "<uuid>" },
      githubName: telemetry.githubEvents[0]?.name
    }, {
      name: "editTelemetry.reportEditArc",
      data: {
        sourceKeyCleaned: "source:Chat.applyEdits",
        extensionId: void 0,
        extensionVersion: void 0,
        opportunityId: void 0,
        editSessionId: "session-1",
        requestId: "turn-1",
        modelId: "gpt-5",
        languageId: void 0,
        mode: void 0,
        uniqueEditId: "<uuid>",
        provider: "copilotcli",
        agentSessionId: "session-1",
        isSubagentSession: "false",
        didBranchChange: 0,
        timeDelayMs: 0,
        originalCharCount: 3,
        originalLineCount: 1,
        originalDeletedLineCount: 1,
        arc: 3,
        currentLineCount: 1,
        currentDeletedLineCount: 1
      },
      githubName: "vscode.editTelemetry.reportEditArc"
    });
  });
  test("reports edits from subagent chat channels", async () => {
    const resource = URI.file("/workspace/subagent.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: buildSubagentChatUri("copilotcli:/session-1", "parent-tool"),
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    assert.deepStrictEqual({
      editSessionId: telemetry.events[0].data.editSessionId,
      agentSessionId: telemetry.events[0].data.agentSessionId,
      isSubagentSession: telemetry.events[0].data.isSubagentSession
    }, {
      editSessionId: "session-1",
      agentSessionId: "session-1",
      isSubagentSession: "true"
    });
  });
  test("updates older reporters before starting the next reporter", async () => {
    const resource = URI.file("/workspace/order.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("AIbase"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    const completionTime = Date.now();
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "base",
      afterText: "AIbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
      completionTime
    });
    await timeout(10);
    const firstEditId = telemetry.events[0].data.uniqueEditId;
    await fileService.writeFile(resource, VSBuffer.fromString("Abase"));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "AIbase",
      afterText: "Abase",
      initialEdit: { replacements: [{ start: 1, endExclusive: 2, text: "" }] },
      completionTime: Date.now()
    });
    await timeout(70);
    assert.deepStrictEqual(telemetry.events.filter((event) => event.data.uniqueEditId === firstEditId).map((event) => ({ timeDelayMs: event.data.timeDelayMs, arc: event.data.arc })), [
      { timeDelayMs: 0, arc: 2 },
      { timeDelayMs: 30, arc: 1 },
      { timeDelayMs: 60, arc: 1 }
    ]);
    assert.deepStrictEqual(telemetry.githubEvents, []);
  });
  test("does not create a reporter after reconciliation state is disposed", async () => {
    const detailedStarted = new DeferredPromise();
    const detailedResult = new DeferredPromise();
    const diffComputeService = {
      _serviceBrand: void 0,
      computeDiffCounts: async () => ({ added: 0, removed: 0, changes: [] }),
      computeDetailedDiff: async () => {
        detailedStarted.complete();
        return detailedResult.p;
      }
    };
    const resource = URI.file("/workspace/stale.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("AIbase"));
    const service = disposables.add(new EditArcReporterService([0, 6e4], fileService, diffComputeService, createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "base",
      afterText: "AIbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    const secondReport = service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-2",
      toolCallId: "tool-2",
      filePath: resource.fsPath,
      beforeText: "unrelated",
      afterText: "newbase",
      initialEdit: { replacements: [{ start: 0, endExclusive: 9, text: "newbase" }] },
      completionTime: Date.now()
    });
    await detailedStarted.p;
    config.setEnabled(false);
    config.setEnabled(true);
    detailedResult.complete({
      added: 1,
      removed: 1,
      replacements: [{ start: 0, endExclusive: 6, text: "newbase" }],
      hitTimeout: false
    });
    await secondReport;
    await timeout(10);
    assert.deepStrictEqual(telemetry.events.map((event) => event.data.requestId), ["turn-1"]);
  });
  test("does not create resource watchers after the host reporter limit is reached", async () => {
    const service = disposables.add(new EditArcReporterService([6e4], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    for (let index = 0; index <= 200; index++) {
      await service.reportEdit({
        sessionUri: "claude:/session-1",
        turnId: `turn-${index}`,
        toolCallId: `tool-${index}`,
        filePath: `/workspace/file-${index}.ts`,
        beforeText: "",
        afterText: "AI",
        initialEdit: { replacements: [{ start: 0, endExclusive: 0, text: "AI" }] },
        completionTime: Date.now()
      });
    }
    assert.strictEqual(fileService.watcherCount, 200);
  });
  test("disposes active reporters when edit telemetry is disabled", async () => {
    const resource = URI.file("/workspace/disabled.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    config.setEnabled(false);
    await timeout(70);
    assert.deepStrictEqual(telemetry.events.map((event) => event.data.timeDelayMs), [0]);
  });
  test("continues sampling after a sample fails", async () => {
    const resource = URI.file("/workspace/failure.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const sampleFailed = new DeferredPromise();
    const finalSampleEmitted = new DeferredPromise();
    telemetry.onEvent = (event) => {
      if (event.data.timeDelayMs === 60) {
        finalSampleEmitted.complete();
      }
    };
    let branchLookupCount = 0;
    const gitService = {
      ...createNoopGitService(),
      getCurrentBranchName: async () => {
        branchLookupCount++;
        if (branchLookupCount === 3) {
          sampleFailed.complete();
          throw new Error("branch lookup failed");
        }
        return "main";
      }
    };
    const service = disposables.add(new EditArcReporterService([0, 30, 60], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    const samplingCompleted = await raceTimeout(Promise.all([sampleFailed.p, finalSampleEmitted.p]), 5e3);
    assert.deepStrictEqual({
      samplingCompleted: samplingCompleted !== void 0,
      timeDelays: telemetry.events.map((event) => event.data.timeDelayMs)
    }, {
      samplingCompleted: true,
      timeDelays: [0, 60]
    });
  });
  test("reports symbolic branch changes", async () => {
    const resource = URI.file("/workspace/branch.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    let branch = "main";
    const gitService = {
      ...createNoopGitService(),
      getCurrentBranchName: async () => branch
    };
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    branch = "feature";
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      didBranchChange: event.data.didBranchChange
    })), [
      { timeDelayMs: 0, didBranchChange: 0 },
      { timeDelayMs: 30, didBranchChange: 1 }
    ]);
  });
  test("retains the repository root when the edited parent directory is deleted", async () => {
    const resource = URI.file("/workspace/removed/branch.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const repositoryRoot = URI.file("/workspace");
    const fileDirectory = URI.file("/workspace/removed");
    let fileDirectoryExists = true;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repositoryRoot,
      getCurrentBranchName: async (workingDirectory) => {
        if (workingDirectory.toString() === repositoryRoot.toString()) {
          return "main";
        }
        return fileDirectoryExists && workingDirectory.toString() === fileDirectory.toString() ? "main" : void 0;
      }
    };
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), gitService, config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    fileDirectoryExists = false;
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      didBranchChange: event.data.didBranchChange
    })), [
      { timeDelayMs: 0, didBranchChange: 0 },
      { timeDelayMs: 30, didBranchChange: 0 }
    ]);
  });
  test("treats deletion as removal of the tracked edit", async () => {
    const resource = URI.file("/workspace/deleted.ts");
    await fileService.writeFile(resource, VSBuffer.fromString("hello AI"));
    const service = disposables.add(new EditArcReporterService([0, 30], fileService, new TestDiffComputeService(), createNoopGitService(), config, new NullLogService(), telemetry));
    await service.reportEdit({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1",
      filePath: resource.fsPath,
      beforeText: "hello",
      afterText: "hello AI",
      initialEdit: { replacements: [{ start: 5, endExclusive: 5, text: " AI" }] },
      completionTime: Date.now()
    });
    await timeout(10);
    await fileService.del(resource);
    await timeout(40);
    assert.deepStrictEqual(telemetry.events.map((event) => ({
      timeDelayMs: event.data.timeDelayMs,
      arc: event.data.arc
    })), [
      { timeDelayMs: 0, arc: 3 },
      { timeDelayMs: 30, arc: 0 }
    ]);
  });
});
function createConfigurationService(enabled) {
  const rootConfigChange = new Emitter();
  return {
    _serviceBrand: void 0,
    onDidRootConfigChange: rootConfigChange.event,
    onDidSessionConfigChange: Event.None,
    getEffectiveValue: () => void 0,
    getEffectiveWorkingDirectory: () => void 0,
    getEffectiveWorkingDirectories: () => void 0,
    isWorkingDirectoryPending: () => false,
    resolveWorkingDirectoryForResume: async (_session, workingDirectory) => workingDirectory,
    updateSessionConfig: () => {
    },
    getSessionConfigValues: () => void 0,
    getRootValue: (schema, key) => schema.validate(key, enabled) ? enabled : void 0,
    updateRootConfig: () => {
    },
    persistRootConfig: () => {
    },
    whenIdle: async () => {
    },
    setEnabled(value) {
      enabled = value;
      rootConfigChange.fire();
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2hhcmVkL2VkaXRBcmNSZXBvcnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU3lzdGVtV2F0Y2hlciwgSVdhdGNoT3B0aW9uc1dpdGhvdXRDb3JyZWxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeU1lYXN1cmVtZW50cywgVGVsZW1ldHJ5UHJvcHMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9zaGFyZWQvZWRpdEFyY1JlcG9ydGVyLmpzJztcbmltcG9ydCB7IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UsIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkU3ViYWdlbnRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJRGV0YWlsZWREaWZmUmVzdWx0LCBJRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5cbmNsYXNzIENvdW50aW5nRmlsZVNlcnZpY2UgZXh0ZW5kcyBGaWxlU2VydmljZSB7XG5cdHdhdGNoZXJDb3VudCA9IDA7XG5cblx0b3ZlcnJpZGUgY3JlYXRlV2F0Y2hlcihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJV2F0Y2hPcHRpb25zV2l0aG91dENvcnJlbGF0aW9uICYgeyByZWN1cnNpdmU6IGZhbHNlIH0pOiBJRmlsZVN5c3RlbVdhdGNoZXIge1xuXHRcdHRoaXMud2F0Y2hlckNvdW50Kys7XG5cdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZVdhdGNoZXIocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG59XG5cbmNsYXNzIFJlY29yZGluZ1RlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0cmVhZG9ubHkgZXZlbnRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfT4gPSBbXTtcblx0cmVhZG9ubHkgZ2l0aHViRXZlbnRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgcHJvcGVydGllczogVGVsZW1ldHJ5UHJvcHMgfCB1bmRlZmluZWQ7IG1lYXN1cmVtZW50czogVGVsZW1ldHJ5TWVhc3VyZW1lbnRzIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdG9uRXZlbnQ6ICgoZXZlbnQ6IHsgbmFtZTogc3RyaW5nOyBkYXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCAndGVsZW1ldHJ5TGV2ZWwnLCB7IHZhbHVlOiBUZWxlbWV0cnlMZXZlbC5VU0FHRSB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHRjb25zdCBldmVudCA9IHsgbmFtZTogZXZlbnROYW1lID8/ICcnLCBkYXRhOiBkYXRhID8/IHt9IH07XG5cdFx0dGhpcy5ldmVudHMucHVzaChldmVudCk7XG5cdFx0dGhpcy5vbkV2ZW50Py4oZXZlbnQpO1xuXHR9XG5cblx0dXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTogdm9pZCB7IH1cblxuXHRzZW5kR0hUZWxlbWV0cnlFdmVudChuYW1lOiBzdHJpbmcsIHByb3BlcnRpZXM/OiBUZWxlbWV0cnlQcm9wcywgbWVhc3VyZW1lbnRzPzogVGVsZW1ldHJ5TWVhc3VyZW1lbnRzKTogdm9pZCB7XG5cdFx0dGhpcy5naXRodWJFdmVudHMucHVzaCh7IG5hbWUsIHByb3BlcnRpZXMsIG1lYXN1cmVtZW50cyB9KTtcblx0fVxufVxuXG5zdWl0ZSgnQWdlbnQgSG9zdCBFZGl0IEFSQyBSZXBvcnRlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogQ291bnRpbmdGaWxlU2VydmljZTtcblx0bGV0IHRlbGVtZXRyeTogUmVjb3JkaW5nVGVsZW1ldHJ5U2VydmljZTtcblx0bGV0IGNvbmZpZzogVGVzdEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb3VudGluZ0ZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoJ2ZpbGUnLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0dGVsZW1ldHJ5ID0gbmV3IFJlY29yZGluZ1RlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25maWcgPSBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSh0cnVlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtaXRzIHRoZSBsb2NrZWQgTWljcm9zb2Z0IGFuZCBHaXRIdWIgZXZlbnQgc2hhcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9maWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMCwgNjBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2hlbGxvJyxcblx0XHRcdGFmdGVyVGV4dDogJ2hlbGxvIEFJJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSwgdGV4dDogJyBBSScgfV0gfSxcblx0XHRcdG1vZGVsSWQ6ICdncHQtNScsXG5cdFx0XHR0b29sTmFtZTogJ2VkaXQnLFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb25zdCBldmVudCA9IHRlbGVtZXRyeS5ldmVudHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRuYW1lOiBldmVudC5uYW1lLFxuXHRcdFx0ZGF0YTogeyAuLi5ldmVudC5kYXRhLCB1bmlxdWVFZGl0SWQ6ICc8dXVpZD4nIH0sXG5cdFx0XHRnaXRodWJOYW1lOiB0ZWxlbWV0cnkuZ2l0aHViRXZlbnRzWzBdPy5uYW1lLFxuXHRcdH0sIHtcblx0XHRcdG5hbWU6ICdlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmMnLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRzb3VyY2VLZXlDbGVhbmVkOiAnc291cmNlOkNoYXQuYXBwbHlFZGl0cycsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0b3Bwb3J0dW5pdHlJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlZGl0U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0cmVxdWVzdElkOiAndHVybi0xJyxcblx0XHRcdFx0bW9kZWxJZDogJ2dwdC01Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVuaXF1ZUVkaXRJZDogJzx1dWlkPicsXG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiAnc2Vzc2lvbi0xJyxcblx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246ICdmYWxzZScsXG5cdFx0XHRcdGRpZEJyYW5jaENoYW5nZTogMCxcblx0XHRcdFx0dGltZURlbGF5TXM6IDAsXG5cdFx0XHRcdG9yaWdpbmFsQ2hhckNvdW50OiAzLFxuXHRcdFx0XHRvcmlnaW5hbExpbmVDb3VudDogMSxcblx0XHRcdFx0b3JpZ2luYWxEZWxldGVkTGluZUNvdW50OiAxLFxuXHRcdFx0XHRhcmM6IDMsXG5cdFx0XHRcdGN1cnJlbnRMaW5lQ291bnQ6IDEsXG5cdFx0XHRcdGN1cnJlbnREZWxldGVkTGluZUNvdW50OiAxLFxuXHRcdFx0fSxcblx0XHRcdGdpdGh1Yk5hbWU6ICd2c2NvZGUuZWRpdFRlbGVtZXRyeS5yZXBvcnRFZGl0QXJjJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBlZGl0cyBmcm9tIHN1YmFnZW50IGNoYXQgY2hhbm5lbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zdWJhZ2VudC50cycpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZygnaGVsbG8gQUknKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdEFyY1JlcG9ydGVyU2VydmljZShbMF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBjcmVhdGVOb29wR2l0U2VydmljZSgpLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiBidWlsZFN1YmFnZW50Q2hhdFVyaSgnY29waWxvdGNsaTovc2Vzc2lvbi0xJywgJ3BhcmVudC10b29sJyksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2hlbGxvJyxcblx0XHRcdGFmdGVyVGV4dDogJ2hlbGxvIEFJJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSwgdGV4dDogJyBBSScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0U2Vzc2lvbklkOiB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEuZWRpdFNlc3Npb25JZCxcblx0XHRcdGFnZW50U2Vzc2lvbklkOiB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEuYWdlbnRTZXNzaW9uSWQsXG5cdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogdGVsZW1ldHJ5LmV2ZW50c1swXS5kYXRhLmlzU3ViYWdlbnRTZXNzaW9uLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0YWdlbnRTZXNzaW9uSWQ6ICdzZXNzaW9uLTEnLFxuXHRcdFx0aXNTdWJhZ2VudFNlc3Npb246ICd0cnVlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyBvbGRlciByZXBvcnRlcnMgYmVmb3JlIHN0YXJ0aW5nIHRoZSBuZXh0IHJlcG9ydGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2Uvb3JkZXIudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0FJYmFzZScpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMCwgNjBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cdFx0Y29uc3QgY29tcGxldGlvblRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2Jhc2UnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnQUliYXNlJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogMCwgdGV4dDogJ0FJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWUsXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdFx0Y29uc3QgZmlyc3RFZGl0SWQgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEudW5pcXVlRWRpdElkO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdBYmFzZScpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnQUliYXNlJyxcblx0XHRcdGFmdGVyVGV4dDogJ0FiYXNlJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDEsIGVuZEV4Y2x1c2l2ZTogMiwgdGV4dDogJycgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoNzApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZXZlbnRzXG5cdFx0XHQuZmlsdGVyKGV2ZW50ID0+IGV2ZW50LmRhdGEudW5pcXVlRWRpdElkID09PSBmaXJzdEVkaXRJZClcblx0XHRcdC5tYXAoZXZlbnQgPT4gKHsgdGltZURlbGF5TXM6IGV2ZW50LmRhdGEudGltZURlbGF5TXMsIGFyYzogZXZlbnQuZGF0YS5hcmMgfSkpLCBbXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAwLCBhcmM6IDIgfSxcblx0XHRcdHsgdGltZURlbGF5TXM6IDMwLCBhcmM6IDEgfSxcblx0XHRcdHsgdGltZURlbGF5TXM6IDYwLCBhcmM6IDEgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5naXRodWJFdmVudHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY3JlYXRlIGEgcmVwb3J0ZXIgYWZ0ZXIgcmVjb25jaWxpYXRpb24gc3RhdGUgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGV0YWlsZWRTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGRldGFpbGVkUmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxJRGV0YWlsZWREaWZmUmVzdWx0PigpO1xuXHRcdGNvbnN0IGRpZmZDb21wdXRlU2VydmljZTogSURpZmZDb21wdXRlU2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdGNvbXB1dGVEaWZmQ291bnRzOiBhc3luYyAoKSA9PiAoeyBhZGRlZDogMCwgcmVtb3ZlZDogMCwgY2hhbmdlczogW10gfSksXG5cdFx0XHRjb21wdXRlRGV0YWlsZWREaWZmOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGRldGFpbGVkU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRyZXR1cm4gZGV0YWlsZWRSZXN1bHQucDtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3N0YWxlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdBSWJhc2UnKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdEFyY1JlcG9ydGVyU2VydmljZShbMCwgNjBfMDAwXSwgZmlsZVNlcnZpY2UsIGRpZmZDb21wdXRlU2VydmljZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2Jhc2UnLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnQUliYXNlJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDAsIGVuZEV4Y2x1c2l2ZTogMCwgdGV4dDogJ0FJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRjb25zdCBzZWNvbmRSZXBvcnQgPSBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAndW5yZWxhdGVkJyxcblx0XHRcdGFmdGVyVGV4dDogJ25ld2Jhc2UnLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA5LCB0ZXh0OiAnbmV3YmFzZScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGRldGFpbGVkU3RhcnRlZC5wO1xuXHRcdGNvbmZpZy5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRjb25maWcuc2V0RW5hYmxlZCh0cnVlKTtcblx0XHRkZXRhaWxlZFJlc3VsdC5jb21wbGV0ZSh7XG5cdFx0XHRhZGRlZDogMSxcblx0XHRcdHJlbW92ZWQ6IDEsXG5cdFx0XHRyZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDYsIHRleHQ6ICduZXdiYXNlJyB9XSxcblx0XHRcdGhpdFRpbWVvdXQ6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHNlY29uZFJlcG9ydDtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5LmV2ZW50cy5tYXAoZXZlbnQgPT4gZXZlbnQuZGF0YS5yZXF1ZXN0SWQpLCBbJ3R1cm4tMSddKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY3JlYXRlIHJlc291cmNlIHdhdGNoZXJzIGFmdGVyIHRoZSBob3N0IHJlcG9ydGVyIGxpbWl0IGlzIHJlYWNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdEFyY1JlcG9ydGVyU2VydmljZShbNjBfMDAwXSwgZmlsZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCksIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8PSAyMDA7IGluZGV4KyspIHtcblx0XHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHRcdHR1cm5JZDogYHR1cm4tJHtpbmRleH1gLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBgdG9vbC0ke2luZGV4fWAsXG5cdFx0XHRcdGZpbGVQYXRoOiBgL3dvcmtzcGFjZS9maWxlLSR7aW5kZXh9LnRzYCxcblx0XHRcdFx0YmVmb3JlVGV4dDogJycsXG5cdFx0XHRcdGFmdGVyVGV4dDogJ0FJJyxcblx0XHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiAwLCB0ZXh0OiAnQUknIH1dIH0sXG5cdFx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVTZXJ2aWNlLndhdGNoZXJDb3VudCwgMjAwKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZXMgYWN0aXZlIHJlcG9ydGVycyB3aGVuIGVkaXQgdGVsZW1ldHJ5IGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZGlzYWJsZWQudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvIEFJJykpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzAsIDMwLCA2MF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBjcmVhdGVOb29wR2l0U2VydmljZSgpLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdoZWxsbycsXG5cdFx0XHRhZnRlclRleHQ6ICdoZWxsbyBBSScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiA1LCBlbmRFeGNsdXNpdmU6IDUsIHRleHQ6ICcgQUknIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRjb25maWcuc2V0RW5hYmxlZChmYWxzZSk7XG5cdFx0YXdhaXQgdGltZW91dCg3MCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50LmRhdGEudGltZURlbGF5TXMpLCBbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250aW51ZXMgc2FtcGxpbmcgYWZ0ZXIgYSBzYW1wbGUgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9mYWlsdXJlLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCBzYW1wbGVGYWlsZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgZmluYWxTYW1wbGVFbWl0dGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdHRlbGVtZXRyeS5vbkV2ZW50ID0gZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmRhdGEudGltZURlbGF5TXMgPT09IDYwKSB7XG5cdFx0XHRcdGZpbmFsU2FtcGxlRW1pdHRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IGJyYW5jaExvb2t1cENvdW50ID0gMDtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRDdXJyZW50QnJhbmNoTmFtZTogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRicmFuY2hMb29rdXBDb3VudCsrO1xuXHRcdFx0XHRpZiAoYnJhbmNoTG9va3VwQ291bnQgPT09IDMpIHtcblx0XHRcdFx0XHRzYW1wbGVGYWlsZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2JyYW5jaCBsb29rdXAgZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuICdtYWluJztcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMCwgNjBdLCBmaWxlU2VydmljZSwgbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKSwgZ2l0U2VydmljZSwgY29uZmlnLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVsZW1ldHJ5KSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnJlcG9ydEVkaXQoe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0xJyxcblx0XHRcdGZpbGVQYXRoOiByZXNvdXJjZS5mc1BhdGgsXG5cdFx0XHRiZWZvcmVUZXh0OiAnaGVsbG8nLFxuXHRcdFx0YWZ0ZXJUZXh0OiAnaGVsbG8gQUknLFxuXHRcdFx0aW5pdGlhbEVkaXQ6IHsgcmVwbGFjZW1lbnRzOiBbeyBzdGFydDogNSwgZW5kRXhjbHVzaXZlOiA1LCB0ZXh0OiAnIEFJJyB9XSB9LFxuXHRcdFx0Y29tcGxldGlvblRpbWU6IERhdGUubm93KCksXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2FtcGxpbmdDb21wbGV0ZWQgPSBhd2FpdCByYWNlVGltZW91dChQcm9taXNlLmFsbChbc2FtcGxlRmFpbGVkLnAsIGZpbmFsU2FtcGxlRW1pdHRlZC5wXSksIDVfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2FtcGxpbmdDb21wbGV0ZWQ6IHNhbXBsaW5nQ29tcGxldGVkICE9PSB1bmRlZmluZWQsXG5cdFx0XHR0aW1lRGVsYXlzOiB0ZWxlbWV0cnkuZXZlbnRzLm1hcChldmVudCA9PiBldmVudC5kYXRhLnRpbWVEZWxheU1zKSxcblx0XHR9LCB7XG5cdFx0XHRzYW1wbGluZ0NvbXBsZXRlZDogdHJ1ZSxcblx0XHRcdHRpbWVEZWxheXM6IFswLCA2MF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgc3ltYm9saWMgYnJhbmNoIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9icmFuY2gudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvIEFJJykpO1xuXHRcdGxldCBicmFuY2ggPSAnbWFpbic7XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0Q3VycmVudEJyYW5jaE5hbWU6IGFzeW5jICgpID0+IGJyYW5jaCxcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzAsIDMwXSwgZmlsZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCksIGdpdFNlcnZpY2UsIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2hlbGxvJyxcblx0XHRcdGFmdGVyVGV4dDogJ2hlbGxvIEFJJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSwgdGV4dDogJyBBSScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdGJyYW5jaCA9ICdmZWF0dXJlJztcblx0XHRhd2FpdCB0aW1lb3V0KDQwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5LmV2ZW50cy5tYXAoZXZlbnQgPT4gKHtcblx0XHRcdHRpbWVEZWxheU1zOiBldmVudC5kYXRhLnRpbWVEZWxheU1zLFxuXHRcdFx0ZGlkQnJhbmNoQ2hhbmdlOiBldmVudC5kYXRhLmRpZEJyYW5jaENoYW5nZSxcblx0XHR9KSksIFtcblx0XHRcdHsgdGltZURlbGF5TXM6IDAsIGRpZEJyYW5jaENoYW5nZTogMCB9LFxuXHRcdFx0eyB0aW1lRGVsYXlNczogMzAsIGRpZEJyYW5jaENoYW5nZTogMSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIHRoZSByZXBvc2l0b3J5IHJvb3Qgd2hlbiB0aGUgZWRpdGVkIHBhcmVudCBkaXJlY3RvcnkgaXMgZGVsZXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlbW92ZWQvYnJhbmNoLnRzJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdoZWxsbyBBSScpKTtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgZmlsZURpcmVjdG9yeSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3JlbW92ZWQnKTtcblx0XHRsZXQgZmlsZURpcmVjdG9yeUV4aXN0cyA9IHRydWU7XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0UmVwb3NpdG9yeVJvb3Q6IGFzeW5jICgpID0+IHJlcG9zaXRvcnlSb290LFxuXHRcdFx0Z2V0Q3VycmVudEJyYW5jaE5hbWU6IGFzeW5jIHdvcmtpbmdEaXJlY3RvcnkgPT4ge1xuXHRcdFx0XHRpZiAod29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpID09PSByZXBvc2l0b3J5Um9vdC50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuICdtYWluJztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmlsZURpcmVjdG9yeUV4aXN0cyAmJiB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkgPT09IGZpbGVEaXJlY3RvcnkudG9TdHJpbmcoKSA/ICdtYWluJyA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKFswLCAzMF0sIGZpbGVTZXJ2aWNlLCBuZXcgVGVzdERpZmZDb21wdXRlU2VydmljZSgpLCBnaXRTZXJ2aWNlLCBjb25maWcsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY2xhdWRlOi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdFx0ZmlsZVBhdGg6IHJlc291cmNlLmZzUGF0aCxcblx0XHRcdGJlZm9yZVRleHQ6ICdoZWxsbycsXG5cdFx0XHRhZnRlclRleHQ6ICdoZWxsbyBBSScsXG5cdFx0XHRpbml0aWFsRWRpdDogeyByZXBsYWNlbWVudHM6IFt7IHN0YXJ0OiA1LCBlbmRFeGNsdXNpdmU6IDUsIHRleHQ6ICcgQUknIH1dIH0sXG5cdFx0XHRjb21wbGV0aW9uVGltZTogRGF0ZS5ub3coKSxcblx0XHR9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRmaWxlRGlyZWN0b3J5RXhpc3RzID0gZmFsc2U7XG5cdFx0YXdhaXQgdGltZW91dCg0MCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHR0aW1lRGVsYXlNczogZXZlbnQuZGF0YS50aW1lRGVsYXlNcyxcblx0XHRcdGRpZEJyYW5jaENoYW5nZTogZXZlbnQuZGF0YS5kaWRCcmFuY2hDaGFuZ2UsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAwLCBkaWRCcmFuY2hDaGFuZ2U6IDAgfSxcblx0XHRcdHsgdGltZURlbGF5TXM6IDMwLCBkaWRCcmFuY2hDaGFuZ2U6IDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHJlYXRzIGRlbGV0aW9uIGFzIHJlbW92YWwgb2YgdGhlIHRyYWNrZWQgZWRpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2RlbGV0ZWQudHMnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbGxvIEFJJykpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UoWzAsIDMwXSwgZmlsZVNlcnZpY2UsIG5ldyBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlKCksIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksIGNvbmZpZywgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHRlbGVtZXRyeSkpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZXBvcnRFZGl0KHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2wtMScsXG5cdFx0XHRmaWxlUGF0aDogcmVzb3VyY2UuZnNQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2hlbGxvJyxcblx0XHRcdGFmdGVyVGV4dDogJ2hlbGxvIEFJJyxcblx0XHRcdGluaXRpYWxFZGl0OiB7IHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDUsIGVuZEV4Y2x1c2l2ZTogNSwgdGV4dDogJyBBSScgfV0gfSxcblx0XHRcdGNvbXBsZXRpb25UaW1lOiBEYXRlLm5vdygpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChyZXNvdXJjZSk7XG5cdFx0YXdhaXQgdGltZW91dCg0MCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubWFwKGV2ZW50ID0+ICh7XG5cdFx0XHR0aW1lRGVsYXlNczogZXZlbnQuZGF0YS50aW1lRGVsYXlNcyxcblx0XHRcdGFyYzogZXZlbnQuZGF0YS5hcmMsXG5cdFx0fSkpLCBbXG5cdFx0XHR7IHRpbWVEZWxheU1zOiAwLCBhcmM6IDMgfSxcblx0XHRcdHsgdGltZURlbGF5TXM6IDMwLCBhcmM6IDAgfSxcblx0XHRdKTtcblx0fSk7XG59KTtcblxuaW50ZXJmYWNlIFRlc3RBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShlbmFibGVkOiBib29sZWFuKTogVGVzdEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRjb25zdCByb290Q29uZmlnQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRSb290Q29uZmlnQ2hhbmdlOiByb290Q29uZmlnQ2hhbmdlLmV2ZW50LFxuXHRcdG9uRGlkU2Vzc2lvbkNvbmZpZ0NoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRnZXRFZmZlY3RpdmVWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3Rvcnk6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXM6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRpc1dvcmtpbmdEaXJlY3RvcnlQZW5kaW5nOiAoKSA9PiBmYWxzZSxcblx0XHRyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZTogYXN5bmMgKF9zZXNzaW9uLCB3b3JraW5nRGlyZWN0b3J5KSA9PiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdHVwZGF0ZVNlc3Npb25Db25maWc6ICgpID0+IHsgfSxcblx0XHRnZXRTZXNzaW9uQ29uZmlnVmFsdWVzOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0Um9vdFZhbHVlOiAoc2NoZW1hLCBrZXkpID0+IHNjaGVtYS52YWxpZGF0ZShrZXksIGVuYWJsZWQpID8gZW5hYmxlZCA6IHVuZGVmaW5lZCxcblx0XHR1cGRhdGVSb290Q29uZmlnOiAoKSA9PiB7IH0sXG5cdFx0cGVyc2lzdFJvb3RDb25maWc6ICgpID0+IHsgfSxcblx0XHR3aGVuSWRsZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHNldEVuYWJsZWQodmFsdWUpIHtcblx0XHRcdGVuYWJsZWQgPSB2YWx1ZTtcblx0XHRcdHJvb3RDb25maWdDaGFuZ2UuZmlyZSgpO1xuXHRcdH0sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUIsYUFBYSxlQUFlO0FBQ3RELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdCQUF3Qiw0QkFBNEI7QUFHN0QsU0FBUyw0QkFBNEI7QUFHckMsTUFBTSw0QkFBNEIsWUFBWTtBQUFBLEVBQTlDO0FBQUE7QUFDQyx3QkFBZTtBQUFBO0FBQUEsRUFFTixjQUFjLFVBQWUsU0FBcUY7QUFDMUgsU0FBSztBQUNMLFdBQU8sTUFBTSxjQUFjLFVBQVUsT0FBTztBQUFBLEVBQzdDO0FBQ0Q7QUFFQSxNQUFNLGtDQUFrQywwQkFBMEI7QUFBQSxFQUtqRSxjQUFjO0FBQ2IsVUFBTTtBQUxQLFNBQVMsU0FBaUUsQ0FBQztBQUMzRSxTQUFTLGVBQWlJLENBQUM7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
