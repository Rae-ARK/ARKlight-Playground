import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { createFileSystemProviderError, FileSystemProviderErrorCode } from "../../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { NullTelemetryServiceShape } from "../../../../telemetry/common/telemetryUtils.js";
import { EditSurvivalReporterFactory } from "../../../node/shared/editSurvivalReporter.js";
import { buildDefaultChatUri } from "../../../common/state/sessionState.js";
class RecordingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    this.events.push({ name: eventName ?? "", data });
  }
}
suite("agentHost editSurvivalReporter", () => {
  const disposables = new DisposableStore();
  let fileService;
  let telemetry;
  let factory;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider("file", disposables.add(new InMemoryFileSystemProvider())));
    telemetry = new RecordingTelemetryService();
    factory = new EditSurvivalReporterFactory(fileService, new NullLogService(), telemetry);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("emits a sample at t=0 with the right shape", async () => {
    await fileService.writeFile(URI.file("/workspace/a.ts"), VSBuffer.fromString("after-text"));
    const reporter = factory.launch({
      sessionUri: "claude:/session-1",
      turnId: "turn-1",
      toolCallId: "tc-1",
      filePath: "/workspace/a.ts",
      beforeText: "before-text",
      afterText: "after-text",
      isCreate: false,
      modelId: "claude-sonnet-4.5",
      toolName: "Edit",
      aiChunks: ["after-text"]
    });
    disposables.add(reporter);
    await timeout(50);
    assert.ok(telemetry.events.length >= 1, `expected at least one event, got ${telemetry.events.length}`);
    const first = telemetry.events[0];
    assert.strictEqual(first.name, "agentHost.trackEditSurvival");
    const data = first.data;
    assert.strictEqual(data.provider, "claude");
    assert.strictEqual(data.modelId, "claude-sonnet-4.5");
    assert.strictEqual(data.toolName, "Edit");
    assert.strictEqual(data.agentSessionId, "session-1");
    assert.strictEqual(data.turnId, "turn-1");
    assert.strictEqual(data.toolCallId, "tc-1");
    assert.strictEqual(data.fileExtension, ".ts");
    assert.strictEqual(data.timeDelayMs, 0);
    assert.strictEqual(data.didFileGetDeleted, 0);
    assert.strictEqual(data.isCreate, 0);
    assert.strictEqual(data.survivalRateFourGram, 1);
    assert.strictEqual(data.survivalRateNoRevert, 1);
    assert.strictEqual(data.scoringMode, "chunked");
    assert.strictEqual(data.aiCharCount, "after-text".length);
  });
  test("resolves ahp-chat sub-channel URIs back to the parent harness", async () => {
    await fileService.writeFile(URI.file("/workspace/b.ts"), VSBuffer.fromString("after-text"));
    const reporter = factory.launch({
      sessionUri: buildDefaultChatUri("claude:/session-9"),
      turnId: "turn-1",
      toolCallId: "tc-9",
      filePath: "/workspace/b.ts",
      beforeText: "before-text",
      afterText: "after-text",
      isCreate: false,
      aiChunks: ["after-text"]
    });
    disposables.add(reporter);
    await timeout(50);
    const data = telemetry.events[0].data;
    assert.strictEqual(data.provider, "claude");
    assert.strictEqual(data.agentSessionId, "session-9");
  });
  test("emits a delete event when the file is missing", async () => {
    const reporter = factory.launch({
      sessionUri: "codex:/session-2",
      turnId: "turn-1",
      toolCallId: "tc-x",
      filePath: "/workspace/missing.ts",
      beforeText: "",
      afterText: "doomed",
      isCreate: true
    });
    disposables.add(reporter);
    await timeout(50);
    assert.ok(telemetry.events.length >= 1);
    const data = telemetry.events[0].data;
    assert.strictEqual(data.didFileGetDeleted, 1);
    assert.strictEqual(data.isCreate, 1);
    assert.strictEqual(data.provider, "codex");
  });
  test("skips the sample on transient read errors (no event, reporter keeps running)", async () => {
    await fileService.writeFile(URI.file("/workspace/flaky.ts"), VSBuffer.fromString("after"));
    const realReadFile = fileService.readFile.bind(fileService);
    let calls = 0;
    const flakyFileService = new Proxy(fileService, {
      get(target, prop, receiver) {
        if (prop === "readFile") {
          return (...args) => {
            calls++;
            if (calls === 1) {
              return Promise.reject(createFileSystemProviderError("permission denied", FileSystemProviderErrorCode.NoPermissions));
            }
            return realReadFile(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    const flakyFactory = new EditSurvivalReporterFactory(flakyFileService, new NullLogService(), telemetry);
    const reporter = flakyFactory.launch({
      sessionUri: "claude:/session-flaky",
      turnId: "turn-1",
      toolCallId: "tc-flaky",
      filePath: "/workspace/flaky.ts",
      beforeText: "before",
      afterText: "after",
      isCreate: false
    });
    disposables.add(reporter);
    await timeout(50);
    assert.strictEqual(telemetry.events.length, 0, "transient errors must not emit telemetry");
    assert.strictEqual(calls, 1, "readFile should have been called exactly once");
  });
  test("skips notebook files entirely (no events ever)", async () => {
    await fileService.writeFile(URI.file("/workspace/n.ipynb"), VSBuffer.fromString("{}"));
    const reporter = factory.launch({
      sessionUri: "claude:/session-3",
      turnId: "turn-1",
      toolCallId: "tc-nb",
      filePath: "/workspace/n.ipynb",
      beforeText: "{}",
      afterText: "{}",
      isCreate: false
    });
    disposables.add(reporter);
    await timeout(50);
    assert.strictEqual(telemetry.events.length, 0);
  });
  test("skips files larger than the size cap (no events ever)", async () => {
    const huge = "x".repeat(6 * 1024 * 1024);
    await fileService.writeFile(URI.file("/workspace/huge.ts"), VSBuffer.fromString(huge));
    const reporter = factory.launch({
      sessionUri: "claude:/session-huge",
      turnId: "turn-1",
      toolCallId: "tc-huge",
      filePath: "/workspace/huge.ts",
      beforeText: "",
      afterText: huge,
      isCreate: true
    });
    disposables.add(reporter);
    await timeout(50);
    assert.strictEqual(telemetry.events.length, 0);
  });
  test("does not contain any code-text fields in the payload", async () => {
    await fileService.writeFile(URI.file("/workspace/secret.ts"), VSBuffer.fromString("SECRET_AFTER"));
    const reporter = factory.launch({
      sessionUri: "claude:/session-4",
      turnId: "turn-1",
      toolCallId: "tc-secret",
      filePath: "/workspace/secret.ts",
      beforeText: "SECRET_BEFORE",
      afterText: "SECRET_AFTER",
      isCreate: false
    });
    disposables.add(reporter);
    await timeout(50);
    assert.ok(telemetry.events.length >= 1);
    const data = telemetry.events[0].data;
    const serialized = JSON.stringify(data);
    assert.ok(!serialized.includes("SECRET_BEFORE"), "payload must not contain before text");
    assert.ok(!serialized.includes("SECRET_AFTER"), "payload must not contain after text");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2hhcmVkL2VkaXRTdXJ2aXZhbFJlcG9ydGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9lZGl0U3Vydml2YWxSZXBvcnRlci5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbmNsYXNzIFJlY29yZGluZ1RlbGVtZXRyeVNlcnZpY2UgZXh0ZW5kcyBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIHtcblx0cmVhZG9ubHkgZXZlbnRzOiBBcnJheTx7IG5hbWU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9PiA9IFtdO1xuXHRvdmVycmlkZSBwdWJsaWNMb2cyKGV2ZW50TmFtZT86IHN0cmluZywgZGF0YT86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgbmFtZTogZXZlbnROYW1lID8/ICcnLCBkYXRhIH0pO1xuXHR9XG59XG5cbnN1aXRlKCdhZ2VudEhvc3QgZWRpdFN1cnZpdmFsUmVwb3J0ZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCB0ZWxlbWV0cnk6IFJlY29yZGluZ1RlbGVtZXRyeVNlcnZpY2U7XG5cdGxldCBmYWN0b3J5OiBFZGl0U3Vydml2YWxSZXBvcnRlckZhY3Rvcnk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKCdmaWxlJywgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHRlbGVtZXRyeSA9IG5ldyBSZWNvcmRpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0ZmFjdG9yeSA9IG5ldyBFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1pdHMgYSBzYW1wbGUgYXQgdD0wIHdpdGggdGhlIHJpZ2h0IHNoYXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9hLnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FmdGVyLXRleHQnKSk7XG5cblx0XHRjb25zdCByZXBvcnRlciA9IGZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2EudHMnLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2JlZm9yZS10ZXh0Jyxcblx0XHRcdGFmdGVyVGV4dDogJ2FmdGVyLXRleHQnLFxuXHRcdFx0aXNDcmVhdGU6IGZhbHNlLFxuXHRcdFx0bW9kZWxJZDogJ2NsYXVkZS1zb25uZXQtNC41Jyxcblx0XHRcdHRvb2xOYW1lOiAnRWRpdCcsXG5cdFx0XHRhaUNodW5rczogWydhZnRlci10ZXh0J10sXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9ydGVyKTtcblxuXHRcdC8vIExldCB0aGUgdD0wIFRpbWVvdXRUaW1lciBmaXJlIGFuZCB0aGUgZmlsZSByZWFkIHJlc29sdmUuXG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cblx0XHRhc3NlcnQub2sodGVsZW1ldHJ5LmV2ZW50cy5sZW5ndGggPj0gMSwgYGV4cGVjdGVkIGF0IGxlYXN0IG9uZSBldmVudCwgZ290ICR7dGVsZW1ldHJ5LmV2ZW50cy5sZW5ndGh9YCk7XG5cdFx0Y29uc3QgZmlyc3QgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5uYW1lLCAnYWdlbnRIb3N0LnRyYWNrRWRpdFN1cnZpdmFsJyk7XG5cdFx0Y29uc3QgZGF0YSA9IGZpcnN0LmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucHJvdmlkZXIsICdjbGF1ZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5tb2RlbElkLCAnY2xhdWRlLXNvbm5ldC00LjUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS50b29sTmFtZSwgJ0VkaXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5hZ2VudFNlc3Npb25JZCwgJ3Nlc3Npb24tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnR1cm5JZCwgJ3R1cm4tMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnRvb2xDYWxsSWQsICd0Yy0xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuZmlsZUV4dGVuc2lvbiwgJy50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnRpbWVEZWxheU1zLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5kaWRGaWxlR2V0RGVsZXRlZCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuaXNDcmVhdGUsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLnN1cnZpdmFsUmF0ZUZvdXJHcmFtLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5zdXJ2aXZhbFJhdGVOb1JldmVydCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuc2NvcmluZ01vZGUsICdjaHVua2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuYWlDaGFyQ291bnQsICdhZnRlci10ZXh0Jy5sZW5ndGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhaHAtY2hhdCBzdWItY2hhbm5lbCBVUklzIGJhY2sgdG8gdGhlIHBhcmVudCBoYXJuZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9iLnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FmdGVyLXRleHQnKSk7XG5cblx0XHRjb25zdCByZXBvcnRlciA9IGZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6IGJ1aWxkRGVmYXVsdENoYXRVcmkoJ2NsYXVkZTovc2Vzc2lvbi05JyksXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTknLFxuXHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2IudHMnLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2JlZm9yZS10ZXh0Jyxcblx0XHRcdGFmdGVyVGV4dDogJ2FmdGVyLXRleHQnLFxuXHRcdFx0aXNDcmVhdGU6IGZhbHNlLFxuXHRcdFx0YWlDaHVua3M6IFsnYWZ0ZXItdGV4dCddLFxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZXBvcnRlcik7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGNvbnN0IGRhdGEgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEucHJvdmlkZXIsICdjbGF1ZGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5hZ2VudFNlc3Npb25JZCwgJ3Nlc3Npb24tOScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBhIGRlbGV0ZSBldmVudCB3aGVuIHRoZSBmaWxlIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBmYWN0b3J5LmxhdW5jaCh7XG5cdFx0XHRzZXNzaW9uVXJpOiAnY29kZXg6L3Nlc3Npb24tMicsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLXgnLFxuXHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL21pc3NpbmcudHMnLFxuXHRcdFx0YmVmb3JlVGV4dDogJycsXG5cdFx0XHRhZnRlclRleHQ6ICdkb29tZWQnLFxuXHRcdFx0aXNDcmVhdGU6IHRydWUsXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9ydGVyKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0YXNzZXJ0Lm9rKHRlbGVtZXRyeS5ldmVudHMubGVuZ3RoID49IDEpO1xuXHRcdGNvbnN0IGRhdGEgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuZGlkRmlsZUdldERlbGV0ZWQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYXRhLmlzQ3JlYXRlLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGF0YS5wcm92aWRlciwgJ2NvZGV4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHRoZSBzYW1wbGUgb24gdHJhbnNpZW50IHJlYWQgZXJyb3JzIChubyBldmVudCwgcmVwb3J0ZXIga2VlcHMgcnVubmluZyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVXNlIGEgZmFrZSBmaWxlIHNlcnZpY2Ugd2hvc2UgcmVhZEZpbGUgdGhyb3dzIGEgcGVybWlzc2lvblxuXHRcdC8vIGVycm9yIC0tIG5vdCBGSUxFX05PVF9GT1VORCAtLSBvbiB0aGUgZmlyc3QgY2FsbCBvbmx5LCB0aGVuXG5cdFx0Ly8gc3VjY2VlZHMuIFRoZSByZXBvcnRlciBzaG91bGQgc2tpcCB0aGUgZmlyc3Qgc2FtcGxlIChub1xuXHRcdC8vIHRlbGVtZXRyeSwgbm8gZGlkRmlsZUdldERlbGV0ZWQpIGFuZCBlbWl0IG5vcm1hbGx5IG9uIHRoZVxuXHRcdC8vIHNlY29uZCBzYW1wbGUuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL2ZsYWt5LnRzJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2FmdGVyJykpO1xuXHRcdGNvbnN0IHJlYWxSZWFkRmlsZSA9IGZpbGVTZXJ2aWNlLnJlYWRGaWxlLmJpbmQoZmlsZVNlcnZpY2UpO1xuXHRcdGxldCBjYWxscyA9IDA7XG5cdFx0Y29uc3QgZmxha3lGaWxlU2VydmljZSA9IG5ldyBQcm94eShmaWxlU2VydmljZSwge1xuXHRcdFx0Z2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpIHtcblx0XHRcdFx0aWYgKHByb3AgPT09ICdyZWFkRmlsZScpIHtcblx0XHRcdFx0XHRyZXR1cm4gKC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIHJlYWxSZWFkRmlsZT4pID0+IHtcblx0XHRcdFx0XHRcdGNhbGxzKys7XG5cdFx0XHRcdFx0XHRpZiAoY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGNyZWF0ZUZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKCdwZXJtaXNzaW9uIGRlbmllZCcsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVhbFJlYWRGaWxlKC4uLmFyZ3MpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFJlZmxlY3QuZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBmbGFreUZhY3RvcnkgPSBuZXcgRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KGZsYWt5RmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCB0ZWxlbWV0cnkpO1xuXG5cdFx0Y29uc3QgcmVwb3J0ZXIgPSBmbGFreUZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tZmxha3knLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1mbGFreScsXG5cdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmxha3kudHMnLFxuXHRcdFx0YmVmb3JlVGV4dDogJ2JlZm9yZScsXG5cdFx0XHRhZnRlclRleHQ6ICdhZnRlcicsXG5cdFx0XHRpc0NyZWF0ZTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9ydGVyKTtcblxuXHRcdC8vIEZpcnN0IHNhbXBsZSAodD0wKSBpcyBza2lwcGVkIGR1ZSB0byB0aGUgcGVybWlzc2lvbiBlcnJvcixcblx0XHQvLyBzZWNvbmQgc2FtcGxlICh0PTVzKSB3b3VsZCBlbWl0IC0tIGJ1dCB3YWl0aW5nIDVzIGluIGEgdW5pdFxuXHRcdC8vIHRlc3QgaXMgd2FzdGVmdWwsIHNvIHdlIGp1c3QgdmVyaWZ5IHRoZSBmaXJzdCBzYW1wbGUgcHJvZHVjZWRcblx0XHQvLyBubyB0ZWxlbWV0cnkgYW5kIHRoZSByZXBvcnRlciBpcyBzdGlsbCBzY2hlZHVsZWQgKGkuZS4gZGlkbid0XG5cdFx0Ly8gZGlzcG9zZSBpdHNlbGYgbGlrZSBpdCB3b3VsZCBmb3IgYSByZWFsIGRlbGV0ZSkuXG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVsZW1ldHJ5LmV2ZW50cy5sZW5ndGgsIDAsICd0cmFuc2llbnQgZXJyb3JzIG11c3Qgbm90IGVtaXQgdGVsZW1ldHJ5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAxLCAncmVhZEZpbGUgc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQgZXhhY3RseSBvbmNlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIG5vdGVib29rIGZpbGVzIGVudGlyZWx5IChubyBldmVudHMgZXZlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL24uaXB5bmInKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cblx0XHRjb25zdCByZXBvcnRlciA9IGZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tMycsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLW5iJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9uLmlweW5iJyxcblx0XHRcdGJlZm9yZVRleHQ6ICd7fScsXG5cdFx0XHRhZnRlclRleHQ6ICd7fScsXG5cdFx0XHRpc0NyZWF0ZTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9ydGVyKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlbGVtZXRyeS5ldmVudHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZmlsZXMgbGFyZ2VyIHRoYW4gdGhlIHNpemUgY2FwIChubyBldmVudHMgZXZlciknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gNiBNQiBleGNlZWRzIHRoZSA1IE1CIGNhcDsgdGhlIGZhY3Rvcnkgc2hvdWxkIHJldHVybiBhXG5cdFx0Ly8gbm8tb3AgZGlzcG9zYWJsZSBhbmQgbmV2ZXIgZW1pdCB0ZWxlbWV0cnkuXG5cdFx0Y29uc3QgaHVnZSA9ICd4Jy5yZXBlYXQoNiAqIDEwMjQgKiAxMDI0KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvaHVnZS50cycpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGh1Z2UpKTtcblxuXHRcdGNvbnN0IHJlcG9ydGVyID0gZmFjdG9yeS5sYXVuY2goe1xuXHRcdFx0c2Vzc2lvblVyaTogJ2NsYXVkZTovc2Vzc2lvbi1odWdlJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndGMtaHVnZScsXG5cdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvaHVnZS50cycsXG5cdFx0XHRiZWZvcmVUZXh0OiAnJyxcblx0XHRcdGFmdGVyVGV4dDogaHVnZSxcblx0XHRcdGlzQ3JlYXRlOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZXBvcnRlcik7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZWxlbWV0cnkuZXZlbnRzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGNvbnRhaW4gYW55IGNvZGUtdGV4dCBmaWVsZHMgaW4gdGhlIHBheWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlL3NlY3JldC50cycpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdTRUNSRVRfQUZURVInKSk7XG5cblx0XHRjb25zdCByZXBvcnRlciA9IGZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjbGF1ZGU6L3Nlc3Npb24tNCcsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLXNlY3JldCcsXG5cdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2Uvc2VjcmV0LnRzJyxcblx0XHRcdGJlZm9yZVRleHQ6ICdTRUNSRVRfQkVGT1JFJyxcblx0XHRcdGFmdGVyVGV4dDogJ1NFQ1JFVF9BRlRFUicsXG5cdFx0XHRpc0NyZWF0ZTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlcG9ydGVyKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0YXNzZXJ0Lm9rKHRlbGVtZXRyeS5ldmVudHMubGVuZ3RoID49IDEpO1xuXHRcdGNvbnN0IGRhdGEgPSB0ZWxlbWV0cnkuZXZlbnRzWzBdLmRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IEpTT04uc3RyaW5naWZ5KGRhdGEpO1xuXHRcdC8vIEd1YXJkIGFnYWluc3QgZXZlciBwdXR0aW5nIGZpbGUgY29udGVudHMgaW4gdGhlIHBheWxvYWQuXG5cdFx0YXNzZXJ0Lm9rKCFzZXJpYWxpemVkLmluY2x1ZGVzKCdTRUNSRVRfQkVGT1JFJyksICdwYXlsb2FkIG11c3Qgbm90IGNvbnRhaW4gYmVmb3JlIHRleHQnKTtcblx0XHRhc3NlcnQub2soIXNlcmlhbGl6ZWQuaW5jbHVkZXMoJ1NFQ1JFVF9BRlRFUicpLCAncGF5bG9hZCBtdXN0IG5vdCBjb250YWluIGFmdGVyIHRleHQnKTtcblx0fSk7XG59KTtc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
