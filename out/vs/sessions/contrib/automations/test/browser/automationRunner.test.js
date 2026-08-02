import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { observableValue, waitForState } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { createAutomationService } from "./automationTestUtils.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { AutomationRunner } from "../../browser/automationRunner.js";
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
const FOLDER_A = URI.parse("file:///workspace/a");
const FOLDER_B = URI.parse("file:///workspace/b");
function workspaceTarget(folderUri = FOLDER_A, options) {
  return {
    kind: "workspace",
    folderUri,
    providerId: options?.providerId,
    sessionTypeId: options?.sessionTypeId,
    isolation: options?.isolation ?? { kind: "default" }
  };
}
class FakeSessionsManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
    this.workspaceTargetAvailable = true;
    this.quickChatTargetAvailable = true;
  }
  isNewSessionTargetAvailable() {
    return this.workspaceTargetAvailable;
  }
  isQuickChatTargetAvailable() {
    return this.quickChatTargetAvailable;
  }
  async createAndSendNewChatRequest(folderUri, options, createOptions, token = CancellationToken.None) {
    this.calls.push({ isQuickChat: false, folderUri, options, createOptions, token });
    if (this.onSendHook) {
      await this.onSendHook();
    }
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextSession;
  }
  async createAndSendQuickChatRequest(options, createOptions, token = CancellationToken.None) {
    this.calls.push({ isQuickChat: true, options, createOptions, token });
    if (this.onSendHook) {
      await this.onSendHook();
    }
    if (this.nextError) {
      throw this.nextError;
    }
    return this.nextSession;
  }
}
class RecordingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.infos = [];
  }
  info(message) {
    this.infos.push(message);
    return super.info(message);
  }
}
function fakeSession(id, status = observableValue(`status-${id}`, SessionStatus.Completed)) {
  return upcastPartial({
    sessionId: id,
    resource: URI.from({ scheme: "vscode-chat-session", authority: "test", path: `/${id}` }),
    status
  });
}
suite("AutomationRunner", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    const sessionsMgmt = new FakeSessionsManagementService();
    const notifications = new RecordingNotificationService();
    const runner = new AutomationRunner(service, sessionsMgmt, log, NullTelemetryService, notifications);
    return { service, sessionsMgmt, runner, notifications };
  }
  test("creates a session for the automation prompt and marks the run completed", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({ name: "A", prompt: "do the thing", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 99).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_A.toString());
    assert.strictEqual(sessionsMgmt.calls[0].options.query, "do the thing");
    assert.strictEqual(sessionsMgmt.calls[0].options.background, true);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "completed");
    assert.strictEqual(runs[0].sessionResource, "vscode-chat-session://test/s1");
    assert.strictEqual(runs[0].trigger, "schedule");
    assert.strictEqual(runs[0].leaderWindowId, 99);
  });
  test("keeps the run active through NeedsInput and records the session before completion", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const status = observableValue("status-s1", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s1", status);
    const a = await service.createAutomation({ name: "A", prompt: "do the thing", schedule: hourly(), target: workspaceTarget() });
    let settled = false;
    const operation = runner.runOnce(a, "schedule", 99);
    let dispatched = false;
    const dispatchPromise = operation.whenDispatched.finally(() => dispatched = true);
    const runPromise = operation.whenCompleted.finally(() => settled = true);
    await dispatchPromise;
    assert.deepStrictEqual(service.runs.get().map((run) => ({
      status: run.status,
      sessionResource: run.sessionResource,
      completedAt: run.completedAt
    })), [{
      status: "running",
      sessionResource: "vscode-chat-session://test/s1",
      completedAt: void 0
    }]);
    assert.strictEqual(dispatched, true);
    status.set(SessionStatus.NeedsInput, void 0);
    await Promise.resolve();
    assert.deepStrictEqual({
      settled,
      status: service.runs.get()[0].status,
      completedAt: service.runs.get()[0].completedAt
    }, {
      settled: false,
      status: "running",
      completedAt: void 0
    });
    status.set(SessionStatus.Completed, void 0);
    await runPromise;
    assert.strictEqual(service.runs.get()[0].status, "completed");
  });
  test("marks the run failed when the session reports an error", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const status = observableValue("status-s1", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s1", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1).whenCompleted;
    await waitForState(service.runs, (runs) => runs[0]?.sessionResource !== void 0);
    status.set(SessionStatus.Error, void 0);
    await runPromise;
    const run = service.runs.get()[0];
    assert.deepStrictEqual({
      status: run.status,
      sessionResource: run.sessionResource,
      errorMessage: run.errorMessage,
      hasCompletedAt: run.completedAt !== void 0
    }, {
      status: "failed",
      sessionResource: "vscode-chat-session://test/s1",
      errorMessage: "Agent session failed.",
      hasCompletedAt: true
    });
  });
  test("always uses the automation folder regardless of the current workspace", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_B)
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls[0].folderUri?.toString(), FOLDER_B.toString());
  });
  test("creates a workspace-less quick chat without folder or repository configuration", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("quick");
    const automation = await service.createAutomation({
      name: "Quick",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    await runner.runOnce(automation, "schedule", 1).whenCompleted;
    assert.deepStrictEqual(sessionsMgmt.calls.map((call) => ({
      isQuickChat: call.isQuickChat,
      folderUri: call.folderUri,
      createOptions: call.createOptions
    })), [{
      isQuickChat: true,
      folderUri: void 0,
      createOptions: {
        providerId: "local-agent-host",
        sessionTypeId: "copilotcli",
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: void 0,
        branch: void 0
      }
    }]);
  });
  test("truncates the session title to 100 characters", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const longName = "A".repeat(150);
    const a = await service.createAutomation({ name: longName, prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "manual", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls[0].options.title, "A".repeat(100));
  });
  test("marks the run failed when createAndSendNewChatRequest throws", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextError = new Error("provider offline");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "provider offline");
  });
  test("defers a scheduled run without advancing its schedule when the target is unavailable", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.workspaceTargetAvailable = false;
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(automation, "schedule", 1).whenCompleted;
    const updated = service.getAutomation(automation.id);
    assert.deepStrictEqual({
      calls: sessionsMgmt.calls.length,
      runs: service.runs.get(),
      lastRunAt: updated?.lastRunAt,
      nextRunAt: updated?.nextRunAt
    }, {
      calls: 0,
      runs: [],
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("reports an unavailable target for a manual run without recording a failure", async () => {
    const { service, sessionsMgmt, runner, notifications } = setup();
    sessionsMgmt.quickChatTargetAvailable = false;
    const automation = await service.createAutomation({
      name: "Unavailable",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    await runner.runOnce(automation, "manual", 1).whenCompleted;
    assert.deepStrictEqual({
      calls: sessionsMgmt.calls.length,
      runs: service.runs.get(),
      notifications: notifications.infos
    }, {
      calls: 0,
      runs: [],
      notifications: ["Automation 'Unavailable' cannot start until its agent becomes available."]
    });
  });
  test("skips when another active run exists for the same automation", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await service.recordRunStart(a.id, "manual", 1);
    await runner.runOnce(a, "schedule", 2).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "pending");
  });
  test("marks the run failed when the cancellation token is already cancelled", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    cts.cancel();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "Cancelled");
    cts.dispose();
  });
  test("marks the run cancelled when the token is cancelled mid-flight", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    sessionsMgmt.nextSession = fakeSession("s-mid");
    sessionsMgmt.onSendHook = () => {
      cts.cancel();
    };
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].token, cts.token);
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "failed");
    assert.strictEqual(runs[0].errorMessage, "Cancelled");
    assert.strictEqual(runs[0].sessionResource, "vscode-chat-session://test/s-mid");
    cts.dispose();
  });
  test("cancels while waiting for the session to finish", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    const status = observableValue("status-s-waiting", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s-waiting", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    await waitForState(service.runs, (runs) => runs[0]?.sessionResource !== void 0);
    cts.cancel();
    await runPromise;
    const run = service.runs.get()[0];
    assert.deepStrictEqual({
      status: run.status,
      sessionResource: run.sessionResource,
      errorMessage: run.errorMessage
    }, {
      status: "failed",
      sessionResource: "vscode-chat-session://test/s-waiting",
      errorMessage: "Cancelled"
    });
    cts.dispose();
  });
  test("does not overwrite a terminal failure when cancelled", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const cts = new CancellationTokenSource();
    const status = observableValue("status-s-timeout", SessionStatus.InProgress);
    sessionsMgmt.nextSession = fakeSession("s-timeout", status);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runPromise = runner.runOnce(a, "schedule", 1, cts.token).whenCompleted;
    const run = await waitForState(service.runs.map((runs) => runs[0]), (run2) => run2?.sessionResource !== void 0);
    await service.updateRun(run.id, {
      status: "failed",
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      errorMessage: "Timed out"
    });
    cts.cancel();
    await runPromise;
    assert.deepStrictEqual({
      status: service.runs.get()[0].status,
      errorMessage: service.runs.get()[0].errorMessage
    }, {
      status: "failed",
      errorMessage: "Timed out"
    });
    cts.dispose();
  });
  test("completes the run even when the service returns undefined", async () => {
    const { service, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1, CancellationToken.None).whenCompleted;
    const runs = service.runs.get();
    assert.strictEqual(runs.length, 1);
    assert.strictEqual(runs[0].status, "completed");
    assert.strictEqual(runs[0].sessionResource, void 0);
  });
  test("passes the captured providerId and sessionTypeId through to createAndSendNewChatRequest", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_A, { providerId: "local-agent-host", sessionTypeId: "agent-host-copilotcli" })
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
      providerId: "local-agent-host",
      sessionTypeId: "agent-host-copilotcli",
      modelId: void 0,
      modeId: void 0,
      permissionLevel: void 0,
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("passes captured mode and permission level through to createAndSendNewChatRequest", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(),
      mode: "agent",
      permissionLevel: "autopilot"
    });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.deepStrictEqual(sessionsMgmt.calls[0].createOptions, {
      providerId: void 0,
      sessionTypeId: void 0,
      modelId: void 0,
      modeId: "agent",
      permissionLevel: "autopilot",
      isolationMode: void 0,
      branch: void 0
    });
  });
  test("passes a branch only for Worktree isolation", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const worktree = await service.createAutomation({
      name: "Worktree",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_A, { isolation: { kind: "worktree", branch: "feature/worktree" } })
    });
    const folder = await service.createAutomation({
      name: "Folder",
      prompt: "p",
      schedule: hourly(),
      target: workspaceTarget(FOLDER_B, { isolation: { kind: "folder" } })
    });
    await runner.runOnce(worktree, "schedule", 1).whenCompleted;
    await runner.runOnce(folder, "schedule", 1).whenCompleted;
    assert.deepStrictEqual(sessionsMgmt.calls.map((call) => call.createOptions), [
      {
        providerId: void 0,
        sessionTypeId: void 0,
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: "worktree",
        branch: "feature/worktree"
      },
      {
        providerId: void 0,
        sessionTypeId: void 0,
        modelId: void 0,
        modeId: void 0,
        permissionLevel: void 0,
        isolationMode: "workspace",
        branch: void 0
      }
    ]);
  });
  test("omits createOptions entirely when no provider/sessionType is captured", async () => {
    const { service, sessionsMgmt, runner } = setup();
    sessionsMgmt.nextSession = fakeSession("s1");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await runner.runOnce(a, "schedule", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 1);
    assert.strictEqual(sessionsMgmt.calls[0].createOptions, void 0);
  });
  test("does not throw if the automation is deleted mid-run", async () => {
    const { service, sessionsMgmt, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await service.deleteAutomation(a.id);
    await runner.runOnce(a, "manual", 1).whenCompleted;
    assert.strictEqual(sessionsMgmt.calls.length, 0);
    assert.deepStrictEqual(service.runs.get(), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25SdW5uZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4vYXV0b21hdGlvblRlc3RVdGlscy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uVGFyZ2V0LCBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uLCBJQXV0b21hdGlvblNjaGVkdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25SdW5uZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2F1dG9tYXRpb25SdW5uZXIuanMnO1xuXG5mdW5jdGlvbiBob3VybHkoKTogSUF1dG9tYXRpb25TY2hlZHVsZSB7XG5cdHJldHVybiB7IGludGVydmFsOiAnaG91cmx5Jywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfTtcbn1cblxuY29uc3QgRk9MREVSX0EgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL2EnKTtcbmNvbnN0IEZPTERFUl9CID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS9iJyk7XG5cbmZ1bmN0aW9uIHdvcmtzcGFjZVRhcmdldChmb2xkZXJVcmkgPSBGT0xERVJfQSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgcHJvdmlkZXJJZD86IHN0cmluZzsgcmVhZG9ubHkgc2Vzc2lvblR5cGVJZD86IHN0cmluZzsgcmVhZG9ubHkgaXNvbGF0aW9uPzogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbiB9KTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0Zm9sZGVyVXJpLFxuXHRcdHByb3ZpZGVySWQ6IG9wdGlvbnM/LnByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGVJZDogb3B0aW9ucz8uc2Vzc2lvblR5cGVJZCxcblx0XHRpc29sYXRpb246IG9wdGlvbnM/Lmlzb2xhdGlvbiA/PyB7IGtpbmQ6ICdkZWZhdWx0JyB9LFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVJlY29yZGVkQ2FsbCB7XG5cdHJlYWRvbmx5IGlzUXVpY2tDaGF0OiBib29sZWFuO1xuXHRyZWFkb25seSBmb2xkZXJVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnM7XG5cdHJlYWRvbmx5IGNyZWF0ZU9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnM7XG5cdHJlYWRvbmx5IHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbjtcbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblxuXHRyZWFkb25seSBjYWxsczogSVJlY29yZGVkQ2FsbFtdID0gW107XG5cdHdvcmtzcGFjZVRhcmdldEF2YWlsYWJsZSA9IHRydWU7XG5cdHF1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZSA9IHRydWU7XG5cblx0LyoqIENvbmZpZ3VyZSBob3cgdGhlIG5leHQgY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IGJlaGF2ZXMuICovXG5cdG5leHRTZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0bmV4dEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0LyoqIE9wdGlvbmFsIGhvb2sgZmlyZWQgYWZ0ZXIgdGhlIGNhbGwgaXMgcmVjb3JkZWQsIGJlZm9yZSByZXR1cm5pbmcvdGhyb3dpbmcuICovXG5cdG9uU2VuZEhvb2s6ICgoKSA9PiBQcm9taXNlPHZvaWQ+IHwgdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgaXNOZXdTZXNzaW9uVGFyZ2V0QXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZVRhcmdldEF2YWlsYWJsZTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnF1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChcblx0XHRmb2xkZXJVcmk6IFVSSSxcblx0XHRvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zLFxuXHRcdGNyZWF0ZU9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0KTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IGlzUXVpY2tDaGF0OiBmYWxzZSwgZm9sZGVyVXJpLCBvcHRpb25zLCBjcmVhdGVPcHRpb25zLCB0b2tlbiB9KTtcblx0XHRpZiAodGhpcy5vblNlbmRIb29rKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9uU2VuZEhvb2soKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubmV4dEVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLm5leHRFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmV4dFNlc3Npb247XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVBbmRTZW5kUXVpY2tDaGF0UmVxdWVzdChcblx0XHRvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zLFxuXHRcdGNyZWF0ZU9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0KTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCh7IGlzUXVpY2tDaGF0OiB0cnVlLCBvcHRpb25zLCBjcmVhdGVPcHRpb25zLCB0b2tlbiB9KTtcblx0XHRpZiAodGhpcy5vblNlbmRIb29rKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9uU2VuZEhvb2soKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubmV4dEVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLm5leHRFcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubmV4dFNlc3Npb247XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSBleHRlbmRzIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgaW5mb3M6IHN0cmluZ1tdID0gW107XG5cblx0b3ZlcnJpZGUgaW5mbyhtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmluZm9zLnB1c2gobWVzc2FnZSk7XG5cdFx0cmV0dXJuIHN1cGVyLmluZm8obWVzc2FnZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmFrZVNlc3Npb24oaWQ6IHN0cmluZywgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKGBzdGF0dXMtJHtpZH1gLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCkpOiBJU2Vzc2lvbiB7XG5cdHJldHVybiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0c2Vzc2lvbklkOiBpZCxcblx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtY2hhdC1zZXNzaW9uJywgYXV0aG9yaXR5OiAndGVzdCcsIHBhdGg6IGAvJHtpZH1gIH0pLFxuXHRcdHN0YXR1cyxcblx0fSk7XG59XG5cbnN1aXRlKCdBdXRvbWF0aW9uUnVubmVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHRlYXJkb3duID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBzZXNzaW9uc01nbXQgPSBuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zID0gbmV3IFJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgQXV0b21hdGlvblJ1bm5lcihzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIG5vdGlmaWNhdGlvbnMpO1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyLCBub3RpZmljYXRpb25zIH07XG5cdH1cblxuXHR0ZXN0KCdjcmVhdGVzIGEgc2Vzc2lvbiBmb3IgdGhlIGF1dG9tYXRpb24gcHJvbXB0IGFuZCBtYXJrcyB0aGUgcnVuIGNvbXBsZXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzMScpO1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAnZG8gdGhlIHRoaW5nJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDk5KS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0uZm9sZGVyVXJpPy50b1N0cmluZygpLCBGT0xERVJfQS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLm9wdGlvbnMucXVlcnksICdkbyB0aGUgdGhpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLm9wdGlvbnMuYmFja2dyb3VuZCwgdHJ1ZSk7XG5cblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAnY29tcGxldGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc2Vzc2lvblJlc291cmNlLCAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QvczEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS50cmlnZ2VyLCAnc2NoZWR1bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVuc1swXS5sZWFkZXJXaW5kb3dJZCwgOTkpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcnVuIGFjdGl2ZSB0aHJvdWdoIE5lZWRzSW5wdXQgYW5kIHJlY29yZHMgdGhlIHNlc3Npb24gYmVmb3JlIGNvbXBsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBzdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXR1cy1zMScsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJywgc3RhdHVzKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ2RvIHRoZSB0aGluZycsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDk5KTtcblx0XHRsZXQgZGlzcGF0Y2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3BhdGNoUHJvbWlzZSA9IG9wZXJhdGlvbi53aGVuRGlzcGF0Y2hlZC5maW5hbGx5KCgpID0+IGRpc3BhdGNoZWQgPSB0cnVlKTtcblx0XHRjb25zdCBydW5Qcm9taXNlID0gb3BlcmF0aW9uLndoZW5Db21wbGV0ZWQuZmluYWxseSgoKSA9PiBzZXR0bGVkID0gdHJ1ZSk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaFByb21pc2U7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnMuZ2V0KCkubWFwKHJ1biA9PiAoe1xuXHRcdFx0c3RhdHVzOiBydW4uc3RhdHVzLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBydW4uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y29tcGxldGVkQXQ6IHJ1bi5jb21wbGV0ZWRBdCxcblx0XHR9KSksIFt7XG5cdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3MxJyxcblx0XHRcdGNvbXBsZXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwYXRjaGVkLCB0cnVlKTtcblxuXHRcdHN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2V0dGxlZCxcblx0XHRcdHN0YXR1czogc2VydmljZS5ydW5zLmdldCgpWzBdLnN0YXR1cyxcblx0XHRcdGNvbXBsZXRlZEF0OiBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF0uY29tcGxldGVkQXQsXG5cdFx0fSwge1xuXHRcdFx0c2V0dGxlZDogZmFsc2UsXG5cdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdGNvbXBsZXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRzdGF0dXMuc2V0KFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHJ1blByb21pc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucnVucy5nZXQoKVswXS5zdGF0dXMsICdjb21wbGV0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgdGhlIHJ1biBmYWlsZWQgd2hlbiB0aGUgc2Vzc2lvbiByZXBvcnRzIGFuIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlKCdzdGF0dXMtczEnLCBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzMScsIHN0YXR1cyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IHJ1blByb21pc2UgPSBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAxKS53aGVuQ29tcGxldGVkO1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZShzZXJ2aWNlLnJ1bnMsIHJ1bnMgPT4gcnVuc1swXT8uc2Vzc2lvblJlc291cmNlICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0c3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkVycm9yLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHJ1blByb21pc2U7XG5cblx0XHRjb25zdCBydW4gPSBzZXJ2aWNlLnJ1bnMuZ2V0KClbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHJ1bi5zdGF0dXMsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJ1bi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRlcnJvck1lc3NhZ2U6IHJ1bi5lcnJvck1lc3NhZ2UsXG5cdFx0XHRoYXNDb21wbGV0ZWRBdDogcnVuLmNvbXBsZXRlZEF0ICE9PSB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3MxJyxcblx0XHRcdGVycm9yTWVzc2FnZTogJ0FnZW50IHNlc3Npb24gZmFpbGVkLicsXG5cdFx0XHRoYXNDb21wbGV0ZWRBdDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWx3YXlzIHVzZXMgdGhlIGF1dG9tYXRpb24gZm9sZGVyIHJlZ2FyZGxlc3Mgb2YgdGhlIGN1cnJlbnQgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoRk9MREVSX0IpLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLmZvbGRlclVyaT8udG9TdHJpbmcoKSwgRk9MREVSX0IudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0IHdpdGhvdXQgZm9sZGVyIG9yIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdxdWljaycpO1xuXG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnUXVpY2snLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYXV0b21hdGlvbiwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLm1hcChjYWxsID0+ICh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogY2FsbC5pc1F1aWNrQ2hhdCxcblx0XHRcdGZvbGRlclVyaTogY2FsbC5mb2xkZXJVcmksXG5cdFx0XHRjcmVhdGVPcHRpb25zOiBjYWxsLmNyZWF0ZU9wdGlvbnMsXG5cdFx0fSkpLCBbe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGNyZWF0ZU9wdGlvbnM6IHtcblx0XHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScsXG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc29sYXRpb25Nb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RydW5jYXRlcyB0aGUgc2Vzc2lvbiB0aXRsZSB0byAxMDAgY2hhcmFjdGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHNlc3Npb25zTWdtdC5uZXh0U2Vzc2lvbiA9IGZha2VTZXNzaW9uKCdzMScpO1xuXG5cdFx0Y29uc3QgbG9uZ05hbWUgPSAnQScucmVwZWF0KDE1MCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6IGxvbmdOYW1lLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdtYW51YWwnLCAxKS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxsc1swXS5vcHRpb25zLnRpdGxlLCAnQScucmVwZWF0KDEwMCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB0aGUgcnVuIGZhaWxlZCB3aGVuIGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dEVycm9yID0gbmV3IEVycm9yKCdwcm92aWRlciBvZmZsaW5lJyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uZXJyb3JNZXNzYWdlLCAncHJvdmlkZXIgb2ZmbGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZlcnMgYSBzY2hlZHVsZWQgcnVuIHdpdGhvdXQgYWR2YW5jaW5nIGl0cyBzY2hlZHVsZSB3aGVuIHRoZSB0YXJnZXQgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQud29ya3NwYWNlVGFyZ2V0QXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGF1dG9tYXRpb24sICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRjb25zdCB1cGRhdGVkID0gc2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FsbHM6IHNlc3Npb25zTWdtdC5jYWxscy5sZW5ndGgsXG5cdFx0XHRydW5zOiBzZXJ2aWNlLnJ1bnMuZ2V0KCksXG5cdFx0XHRsYXN0UnVuQXQ6IHVwZGF0ZWQ/Lmxhc3RSdW5BdCxcblx0XHRcdG5leHRSdW5BdDogdXBkYXRlZD8ubmV4dFJ1bkF0LFxuXHRcdH0sIHtcblx0XHRcdGNhbGxzOiAwLFxuXHRcdFx0cnVuczogW10sXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgYW4gdW5hdmFpbGFibGUgdGFyZ2V0IGZvciBhIG1hbnVhbCBydW4gd2l0aG91dCByZWNvcmRpbmcgYSBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIsIG5vdGlmaWNhdGlvbnMgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210LnF1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ1VuYXZhaWxhYmxlJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYXV0b21hdGlvbiwgJ21hbnVhbCcsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxzOiBzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLFxuXHRcdFx0cnVuczogc2VydmljZS5ydW5zLmdldCgpLFxuXHRcdFx0bm90aWZpY2F0aW9uczogbm90aWZpY2F0aW9ucy5pbmZvcyxcblx0XHR9LCB7XG5cdFx0XHRjYWxsczogMCxcblx0XHRcdHJ1bnM6IFtdLFxuXHRcdFx0bm90aWZpY2F0aW9uczogWydBdXRvbWF0aW9uIFxcJ1VuYXZhaWxhYmxlXFwnIGNhbm5vdCBzdGFydCB1bnRpbCBpdHMgYWdlbnQgYmVjb21lcyBhdmFpbGFibGUuJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIHdoZW4gYW5vdGhlciBhY3RpdmUgcnVuIGV4aXN0cyBmb3IgdGhlIHNhbWUgYXV0b21hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdtYW51YWwnLCAxKTtcblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAyKS53aGVuQ29tcGxldGVkO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAwKTtcblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAncGVuZGluZycpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB0aGUgcnVuIGZhaWxlZCB3aGVuIHRoZSBjYW5jZWxsYXRpb24gdG9rZW4gaXMgYWxyZWFkeSBjYW5jZWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEsIGN0cy50b2tlbikud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAwKTtcblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uZXJyb3JNZXNzYWdlLCAnQ2FuY2VsbGVkJyk7XG5cdFx0Y3RzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgdGhlIHJ1biBjYW5jZWxsZWQgd2hlbiB0aGUgdG9rZW4gaXMgY2FuY2VsbGVkIG1pZC1mbGlnaHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbigncy1taWQnKTtcblx0XHRzZXNzaW9uc01nbXQub25TZW5kSG9vayA9ICgpID0+IHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAxLCBjdHMudG9rZW4pLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zTWdtdC5jYWxsc1swXS50b2tlbiwgY3RzLnRva2VuKTtcblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uZXJyb3JNZXNzYWdlLCAnQ2FuY2VsbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc2Vzc2lvblJlc291cmNlLCAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3Qvcy1taWQnKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBzZXNzaW9uIHRvIGZpbmlzaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzLXMtd2FpdGluZycsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3Mtd2FpdGluZycsIHN0YXR1cyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IHJ1blByb21pc2UgPSBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAxLCBjdHMudG9rZW4pLndoZW5Db21wbGV0ZWQ7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UucnVucywgcnVucyA9PiBydW5zWzBdPy5zZXNzaW9uUmVzb3VyY2UgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcnVuUHJvbWlzZTtcblxuXHRcdGNvbnN0IHJ1biA9IHNlcnZpY2UucnVucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogcnVuLnN0YXR1cyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogcnVuLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGVycm9yTWVzc2FnZTogcnVuLmVycm9yTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiAndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3Qvcy13YWl0aW5nJyxcblx0XHRcdGVycm9yTWVzc2FnZTogJ0NhbmNlbGxlZCcsXG5cdFx0fSk7XG5cdFx0Y3RzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb3ZlcndyaXRlIGEgdGVybWluYWwgZmFpbHVyZSB3aGVuIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZSgnc3RhdHVzLXMtdGltZW91dCcsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MtdGltZW91dCcsIHN0YXR1cyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IHJ1blByb21pc2UgPSBydW5uZXIucnVuT25jZShhLCAnc2NoZWR1bGUnLCAxLCBjdHMudG9rZW4pLndoZW5Db21wbGV0ZWQ7XG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgd2FpdEZvclN0YXRlKHNlcnZpY2UucnVucy5tYXAocnVucyA9PiBydW5zWzBdKSwgcnVuID0+IHJ1bj8uc2Vzc2lvblJlc291cmNlICE9PSB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHJ1bi5pZCwge1xuXHRcdFx0c3RhdHVzOiAnZmFpbGVkJyxcblx0XHRcdGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRlcnJvck1lc3NhZ2U6ICdUaW1lZCBvdXQnLFxuXHRcdH0pO1xuXG5cdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdGF3YWl0IHJ1blByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc2VydmljZS5ydW5zLmdldCgpWzBdLnN0YXR1cyxcblx0XHRcdGVycm9yTWVzc2FnZTogc2VydmljZS5ydW5zLmdldCgpWzBdLmVycm9yTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdmYWlsZWQnLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiAnVGltZWQgb3V0Jyxcblx0XHR9KTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZXMgdGhlIHJ1biBldmVuIHdoZW4gdGhlIHNlcnZpY2UgcmV0dXJucyB1bmRlZmluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBydW5uZXIgfSA9IHNldHVwKCk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRjb25zdCBydW5zID0gc2VydmljZS5ydW5zLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc3RhdHVzLCAnY29tcGxldGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bnNbMF0uc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXNzZXMgdGhlIGNhcHR1cmVkIHByb3ZpZGVySWQgYW5kIHNlc3Npb25UeXBlSWQgdGhyb3VnaCB0byBjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVJfQSwgeyBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH0pLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0uY3JlYXRlT3B0aW9ucywge1xuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Bhc3NlcyBjYXB0dXJlZCBtb2RlIGFuZCBwZXJtaXNzaW9uIGxldmVsIHRocm91Z2ggdG8gY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJyk7XG5cblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6ICdhdXRvcGlsb3QnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJ1bm5lci5ydW5PbmNlKGEsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHNbMF0uY3JlYXRlT3B0aW9ucywge1xuXHRcdFx0cHJvdmlkZXJJZDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZUlkOiAnYWdlbnQnLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiAnYXV0b3BpbG90Jyxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXNzZXMgYSBicmFuY2ggb25seSBmb3IgV29ya3RyZWUgaXNvbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSwgc2Vzc2lvbnNNZ210LCBydW5uZXIgfSA9IHNldHVwKCk7XG5cdFx0c2Vzc2lvbnNNZ210Lm5leHRTZXNzaW9uID0gZmFrZVNlc3Npb24oJ3MxJyk7XG5cblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnV29ya3RyZWUnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogaG91cmx5KCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVJfQSwgeyBpc29sYXRpb246IHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS93b3JrdHJlZScgfSB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBmb2xkZXIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0ZvbGRlcicsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUl9CLCB7IGlzb2xhdGlvbjogeyBraW5kOiAnZm9sZGVyJyB9IH0pLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2Uod29ya3RyZWUsICdzY2hlZHVsZScsIDEpLndoZW5Db21wbGV0ZWQ7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoZm9sZGVyLCAnc2NoZWR1bGUnLCAxKS53aGVuQ29tcGxldGVkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubWFwKGNhbGwgPT4gY2FsbC5jcmVhdGVPcHRpb25zKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRwcm92aWRlcklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25UeXBlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHRcdGJyYW5jaDogJ2ZlYXR1cmUvd29ya3RyZWUnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cHJvdmlkZXJJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXNzaW9uVHlwZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBjcmVhdGVPcHRpb25zIGVudGlyZWx5IHdoZW4gbm8gcHJvdmlkZXIvc2Vzc2lvblR5cGUgaXMgY2FwdHVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBzZXNzaW9uc01nbXQsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01nbXQubmV4dFNlc3Npb24gPSBmYWtlU2Vzc2lvbignczEnKTtcblxuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgcnVubmVyLnJ1bk9uY2UoYSwgJ3NjaGVkdWxlJywgMSkud2hlbkNvbXBsZXRlZDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc01nbXQuY2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzWzBdLmNyZWF0ZU9wdGlvbnMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHRocm93IGlmIHRoZSBhdXRvbWF0aW9uIGlzIGRlbGV0ZWQgbWlkLXJ1bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHNlc3Npb25zTWdtdCwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5kZWxldGVBdXRvbWF0aW9uKGEuaWQpO1xuXHRcdC8vIFRoZSBydW5uZXIgZGV0ZWN0cyB0aGUgZGVsZXRpb24gdmlhIGdldEF1dG9tYXRpb24gYmVmb3JlIGF0dGVtcHRpbmdcblx0XHQvLyByZWNvcmRSdW5TdGFydCwgYmFpbHMgZWFybHksIGFuZCBwcm9kdWNlcyBubyBydW4gcm93cy5cblx0XHRhd2FpdCBydW5uZXIucnVuT25jZShhLCAnbWFudWFsJywgMSkud2hlbkNvbXBsZXRlZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNNZ210LmNhbGxzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnMuZ2V0KCksIFtdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0JBQStCO0FBRXhDLFNBQW1CLHFCQUFxQjtBQUV4QyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLFNBQThCO0FBQ3RDLFNBQU8sRUFBRSxVQUFVLFVBQVUsY0FBYyxHQUFHLGdCQUFnQixHQUFHLGFBQWEsRUFBRTtBQUNqRjtBQUVBLE1BQU0sV0FBVyxJQUFJLE1BQU0scUJBQXFCO0FBQ2hELE1BQU0sV0FBVyxJQUFJLE1BQU0scUJBQXFCO0FBRWhELFNBQVMsZ0JBQWdCLFlBQVksVUFBVSxTQUFrSjtBQUNoTSxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTjtBQUFBLElBQ0EsWUFBWSxTQUFTO0FBQUEsSUFDckIsZUFBZSxTQUFTO0FBQUEsSUFDeEIsV0FBVyxTQUFTLGFBQWEsRUFBRSxNQUFNLFVBQVU7QUFBQSxFQUNwRDtBQUNEO0FBVUEsTUFBTSxzQ0FBc0MsS0FBaUMsRUFBRTtBQUFBLEVBQS9FO0FBQUE7QUFFQyxTQUFTLFFBQXlCLENBQUM7QUFDbkMsb0NBQTJCO0FBQzNCLG9DQUEyQjtBQUFBO0FBQUEsRUFRbEIsOEJBQXVDO0FBQy9DLFdBQU8sS0FBSztBQUFBLEVB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
