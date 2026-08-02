import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { createAutomationService } from "./automationTestUtils.js";
const FOLDER = URI.parse("file:///workspace");
function workspaceTarget(folderUri = FOLDER, isolation = { kind: "default" }) {
  return { kind: "workspace", folderUri, isolation };
}
function dailySchedule(hour = 9, minute = 0) {
  return { interval: "daily", scheduleHour: hour, scheduleMinute: minute, scheduleDay: 0 };
}
function serializeLedgerAutomation(id, name) {
  return {
    id,
    name,
    prompt: "p",
    schedule: dailySchedule(),
    target: { kind: "workspace", folderUri: FOLDER.toJSON(), isolation: { kind: "default" } },
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
suite("AutomationService", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  async function claimRun(service, automationId, trigger, leaderWindowId = 1) {
    const claim = await service.recordRunStart(automationId, trigger, leaderWindowId);
    assert.ok(claim.claimed, "expected the run slot to be claimed");
    return claim.run;
  }
  async function recordCompletedRun(service, automationId, trigger = "manual") {
    const run = await claimRun(service, automationId, trigger);
    return await service.updateRun(run.id, { status: "completed" }) ?? run;
  }
  function createService(storage) {
    const sharedStorage = teardown.add(storage ?? new InMemoryStorageService());
    const service = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    return { service, storage: sharedStorage };
  }
  test("starts with an empty ledger when nothing is persisted", () => {
    const { service } = createService();
    assert.deepStrictEqual(service.automations.get(), []);
    assert.deepStrictEqual(service.runs.get(), []);
  });
  test("createAutomation appends an entry and computes nextRunAt for non-manual schedules", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "Daily review",
      prompt: "Summarize what changed",
      schedule: dailySchedule(),
      target: workspaceTarget()
    });
    assert.strictEqual(service.automations.get().length, 1);
    assert.strictEqual(service.automations.get()[0].id, a.id);
    assert.ok(a.nextRunAt, "daily schedule should produce a nextRunAt");
    assert.strictEqual(a.enabled, true);
  });
  test("createAutomation with manual schedule leaves nextRunAt undefined", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "Manual",
      prompt: "p",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    assert.strictEqual(a.nextRunAt, void 0);
  });
  test("createAutomation throws when folderUri is missing", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "X",
        prompt: "p",
        schedule: dailySchedule(),
        target: { kind: "workspace", folderUri: void 0, isolation: { kind: "default" } }
      }),
      /folderUri/
    );
  });
  test("creates a workspace-less automation only with an explicit quick-chat target", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "Missing target",
        prompt: "p",
        schedule: dailySchedule(),
        target: { kind: "quickChat", providerId: void 0, sessionTypeId: void 0 }
      }),
      /providerId and sessionTypeId/
    );
    const automation = await service.createAutomation({
      name: "Workspace-less",
      prompt: "p",
      schedule: dailySchedule(),
      target: {
        kind: "quickChat",
        providerId: "local-agent-host",
        sessionTypeId: "copilotcli",
        folderUri: FOLDER,
        isolation: { kind: "worktree", branch: "stale" }
      }
    });
    assert.deepStrictEqual(automation.target, {
      kind: "quickChat",
      providerId: "local-agent-host",
      sessionTypeId: "copilotcli"
    });
  });
  test("rejects malformed worktree targets without a branch", async () => {
    const { service } = createService();
    await assert.rejects(
      () => service.createAutomation({
        name: "Worktree",
        prompt: "p",
        schedule: dailySchedule(),
        target: workspaceTarget(FOLDER, { kind: "worktree", branch: "" })
      }),
      /requires a branch/
    );
  });
  test("updateAutomation recomputes nextRunAt when the schedule changes", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(9, 0),
      target: workspaceTarget()
    });
    const before = a.nextRunAt;
    const b = await service.updateAutomation(a.id, { schedule: dailySchedule(10, 30) });
    assert.notStrictEqual(b.nextRunAt, before);
  });
  test("updateAutomation keeps nextRunAt when only the name changes", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.updateAutomation(a.id, { name: "B" });
    assert.strictEqual(b.nextRunAt, a.nextRunAt);
    assert.strictEqual(b.name, "B");
  });
  test("updateAutomation can clear modelId/mode/permissionLevel by passing null but keeps folderUri", async () => {
    const { service } = createService();
    const a = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(),
      modelId: "gpt-4",
      mode: "agent",
      permissionLevel: "autopilot"
    });
    const b = await service.updateAutomation(a.id, { modelId: null, mode: null, permissionLevel: null });
    assert.strictEqual(b.modelId, void 0);
    assert.strictEqual(b.mode, void 0);
    assert.strictEqual(b.permissionLevel, void 0);
    assert.strictEqual(b.target.kind === "workspace" ? b.target.folderUri.toString() : void 0, FOLDER.toString());
  });
  test("updateAutomation switches folder when a new folderUri is provided", async () => {
    const { service } = createService();
    const other = URI.parse("file:///other");
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.updateAutomation(a.id, { target: workspaceTarget(other) });
    assert.strictEqual(b.target.kind === "workspace" ? b.target.folderUri.toString() : void 0, other.toString());
  });
  test("updateAutomation rejects incomplete workspace-less targets", async () => {
    const { service } = createService();
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await assert.rejects(
      () => service.updateAutomation(automation.id, {
        target: { kind: "quickChat", providerId: void 0, sessionTypeId: void 0 }
      }),
      /providerId and sessionTypeId/
    );
  });
  test("deleteAutomation removes the entry and orphan runs are dropped on reload", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await firstService.recordRunStart(a.id, "manual", 1);
    assert.strictEqual(firstService.runs.get().length, 1);
    await firstService.deleteAutomation(a.id);
    assert.deepStrictEqual(firstService.automations.get(), []);
    assert.strictEqual(firstService.runs.get().length, 0);
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(secondService.automations.get(), []);
    assert.strictEqual(secondService.runs.get().length, 0);
  });
  test("recordRunStart inserts a pending run; updateRun applies a patch", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const run = await claimRun(service, a.id, "schedule", 42);
    assert.strictEqual(run.status, "pending");
    assert.strictEqual(run.leaderWindowId, 42);
    const updated = await service.updateRun(run.id, { status: "completed", sessionResource: "vscode-chat-session://copilot/sess-1", completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    assert.strictEqual(updated?.status, "completed");
    assert.strictEqual(updated?.sessionResource, "vscode-chat-session://copilot/sess-1");
  });
  test("recordRunStart updates lastRunAt and advances the next scheduled run", async () => {
    const { service } = createService();
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const automation = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T10:00:00Z"));
    const run = await claimRun(service, automation.id, "catch_up");
    assert.deepStrictEqual({
      startedAt: run.startedAt,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      startedAt: "2025-06-01T10:00:00.000Z",
      lastRunAt: "2025-06-01T10:00:00.000Z",
      nextRunAt: "2025-06-01T11:00:00.000Z"
    });
  });
  test("recordRunStart leaves schedule timestamps unchanged for a manual run", async () => {
    const { service } = createService();
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const automation = await service.createAutomation({
      name: "A",
      prompt: "p",
      schedule: { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: workspaceTarget()
    });
    service.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:30:00Z"));
    const run = await claimRun(service, automation.id, "manual");
    assert.deepStrictEqual({
      startedAt: run.startedAt,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      startedAt: "2025-06-01T00:30:00.000Z",
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("getActiveRunFor returns the first pending or running run for an automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(service.getActiveRunFor(a.id), void 0);
    const run = await claimRun(service, a.id, "schedule");
    assert.strictEqual(service.getActiveRunFor(a.id)?.id, run.id);
    await service.updateRun(run.id, { status: "completed" });
    assert.strictEqual(service.getActiveRunFor(a.id), void 0);
  });
  test("markStaleRunsFailed moves pending and running rows to failed", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const r1 = await claimRun(service, a.id, "schedule");
    const r2 = await claimRun(service, b.id, "schedule");
    await service.updateRun(r1.id, { status: "running" });
    await service.markStaleRunsFailed("Interrupted");
    const all = service.runs.get();
    assert.deepStrictEqual(all.find((r) => r.id === r1.id)?.status, "failed");
    assert.deepStrictEqual(all.find((r) => r.id === r2.id)?.status, "failed");
    assert.strictEqual(all.find((r) => r.id === r1.id)?.errorMessage, "Interrupted");
  });
  test("runsFor filters to a single automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await recordCompletedRun(service, a.id, "schedule");
    await recordCompletedRun(service, b.id, "schedule");
    await recordCompletedRun(service, a.id, "manual");
    assert.strictEqual(service.runsFor(a.id).get().length, 2);
    assert.strictEqual(service.runsFor(b.id).get().length, 1);
  });
  test("recordRunStart caps retained runs per automation", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const b = await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    for (let i = 0; i < 60; i++) {
      await recordCompletedRun(service, a.id);
    }
    for (let i = 0; i < 5; i++) {
      await recordCompletedRun(service, b.id);
    }
    assert.strictEqual(service.runsFor(a.id).get().length, 50);
    assert.strictEqual(service.runsFor(b.id).get().length, 5);
  });
  test("recordRunStart declines a second claim while a run is active", async () => {
    const { service } = createService();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const first = await claimRun(service, a.id, "manual");
    await service.updateRun(first.id, { status: "running" });
    const second = await service.recordRunStart(a.id, "schedule", 2);
    assert.deepStrictEqual({
      claimed: second.claimed,
      runId: second.run.id,
      totalRuns: service.runsFor(a.id).get().length
    }, {
      claimed: false,
      runId: first.id,
      totalRuns: 1
    });
  });
  test("concurrent claims from two windows produce a single run", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await windowA.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const [first, second] = await Promise.all([
      windowA.recordRunStart(a.id, "manual", 1),
      windowB.recordRunStart(a.id, "manual", 2)
    ]);
    assert.deepStrictEqual({
      claimCount: [first, second].filter((claim) => claim.claimed).length,
      agreeOnRun: first.run.id === second.run.id,
      totalRuns: windowA.runsFor(a.id).get().length
    }, {
      claimCount: 1,
      agreeOnRun: true,
      totalRuns: 1
    });
  });
  test("persists across service restarts via shared storage", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await firstService.recordRunStart(a.id, "manual", 7);
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.strictEqual(secondService.automations.get().length, 1);
    assert.strictEqual(secondService.automations.get()[0].id, a.id);
    assert.strictEqual(secondService.runs.get().length, 1);
  });
  test("round-trips and clears Worktree branch configuration", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const created = await firstService.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" })
    });
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const restored = secondService.getAutomation(created.id);
    const updated = await secondService.updateAutomation(created.id, { target: workspaceTarget(FOLDER, { kind: "folder" }) });
    assert.deepStrictEqual({
      restoredTarget: restored?.target,
      updatedTarget: updated.target
    }, {
      restoredTarget: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" }),
      updatedTarget: workspaceTarget(FOLDER, { kind: "folder" })
    });
  });
  test("round-trips target changes without carrying repository configuration into quick-chat mode", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const created = await firstService.createAutomation({
      name: "A",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" })
    });
    const quickChat = await firstService.updateAutomation(created.id, {
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    firstService.dispose();
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const restored = secondService.getAutomation(created.id);
    const workspace = await secondService.updateAutomation(created.id, {
      target: workspaceTarget(FOLDER, { kind: "worktree", branch: "main" })
    });
    assert.deepStrictEqual({
      quickChat: quickChat.target,
      restored: restored?.target,
      workspace: workspace.target
    }, {
      quickChat: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" },
      restored: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" },
      workspace: workspaceTarget(FOLDER, { kind: "worktree", branch: "main" })
    });
  });
  test("two services on the same storage stay in sync via onDidChangeValue", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(windowB.automations.get(), []);
    const created = await windowA.createAutomation({ name: "X", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(windowB.automations.get().length, 1);
    assert.strictEqual(windowB.automations.get()[0].id, created.id);
  });
  test("mutations preserve unrelated application storage values", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("unrelated", "sentinel", StorageScope.APPLICATION, StorageTarget.MACHINE);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await service.updateAutomation(automation.id, { name: "Updated" });
    await service.recordRunStart(automation.id, "manual", 1);
    await service.deleteAutomation(automation.id);
    assert.strictEqual(storage.get("unrelated", StorageScope.APPLICATION), "sentinel");
  });
  test("guarded update rejects a concurrent editable change", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const reviewed = await windowA.createAutomation({ name: "Original", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    await windowB.updateAutomation(reviewed.id, { prompt: "concurrent edit" });
    const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: "Reviewed edit" }, reviewed);
    assert.deepStrictEqual(result.kind === "conflict" ? {
      kind: result.kind,
      currentName: result.current?.name,
      currentPrompt: result.current?.prompt
    } : result, {
      kind: "conflict",
      currentName: "Original",
      currentPrompt: "concurrent edit"
    });
  });
  test("guarded update tolerates concurrent runtime metadata changes", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    windowA.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T00:00:00Z"));
    const reviewed = await windowA.createAutomation({ name: "Original", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    windowB.setClockForTesting(() => /* @__PURE__ */ new Date("2025-06-01T10:00:00Z"));
    const run = await claimRun(windowB, reviewed.id, "schedule", 2);
    const runtimeState = windowB.getAutomation(reviewed.id);
    const result = await windowA.updateAutomationIfUnchanged(reviewed.id, { name: "Reviewed edit" }, reviewed);
    assert.deepStrictEqual(result.kind === "updated" ? {
      kind: result.kind,
      name: result.automation.name,
      lastRunAt: result.automation.lastRunAt,
      nextRunAt: result.automation.nextRunAt,
      runIds: windowA.runs.get().map((candidate) => candidate.id)
    } : result, {
      kind: "updated",
      name: "Reviewed edit",
      lastRunAt: runtimeState?.lastRunAt,
      nextRunAt: runtimeState?.nextRunAt,
      runIds: [run.id]
    });
  });
  test("concurrent create, edit, run, and delete mutations converge without lost updates", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const windowA = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const windowB = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const edited = await windowA.createAutomation({ name: "Edit me", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const deleted = await windowA.createAutomation({ name: "Delete me", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const [, claim, , created] = await Promise.all([
      windowA.updateAutomation(edited.id, { name: "Edited" }),
      windowB.recordRunStart(edited.id, "schedule", 2),
      windowA.deleteAutomation(deleted.id),
      windowB.createAutomation({ name: "Created", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() })
    ]);
    assert.deepStrictEqual({
      automations: windowA.automations.get().map((automation) => ({ id: automation.id, name: automation.name })).sort((a, b) => a.name.localeCompare(b.name)),
      runs: windowA.runs.get().map((candidate) => ({ id: candidate.id, automationId: candidate.automationId }))
    }, {
      automations: [
        { id: created.id, name: "Created" },
        { id: edited.id, name: "Edited" }
      ],
      runs: [{ id: claim.run.id, automationId: edited.id }]
    });
  });
  test("reading a ledger with a future schema version freezes observables and refuses to write", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const futureLedger = JSON.stringify({ schemaVersion: 999, revision: 7, automations: [], runs: [] });
    storage.store("chat.automations.ledger", futureLedger, -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
    assert.deepStrictEqual(service.runs.get(), []);
    await assert.rejects(
      () => service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() }),
      /newer version/
    );
    assert.deepStrictEqual(service.automations.get(), []);
    assert.strictEqual(storage.get("chat.automations.ledger", -1), futureLedger);
  });
  test("refreshFromStorage preserves in-memory state when storage flips to an unsupported schema", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "Local", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    assert.strictEqual(service.automations.get().length, 1);
    storage.store("chat.automations.ledger", JSON.stringify({ schemaVersion: 999, revision: 99, automations: [], runs: [] }), -1, 1);
    assert.strictEqual(service.automations.get().length, 1);
  });
  test("persist bumps the revision counter on every write", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const rev1 = JSON.parse(storage.get("chat.automations.ledger", -1)).revision;
    await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const rev2 = JSON.parse(storage.get("chat.automations.ledger", -1)).revision;
    assert.strictEqual(typeof rev1, "number");
    assert.ok(rev2 > rev1, `expected ${rev2} > ${rev1}`);
  });
  test("persist absorbs a higher on-disk revision (concurrent-write detection)", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    await service.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const baseline = JSON.parse(storage.get("chat.automations.ledger", -1));
    storage.store("chat.automations.ledger", JSON.stringify({ ...baseline, revision: 5e3 }), -1, 1);
    await service.createAutomation({ name: "B", prompt: "p", schedule: dailySchedule(), target: workspaceTarget() });
    const after = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.ok(after.revision > 5e3, `expected revision > 5000, got ${after.revision}`);
  });
  test("successful CAS accepts a restored lower revision without accepting stale notifications", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 3,
      revision: 40,
      automations: [serializeLedgerAutomation("newer", "Before restore")],
      runs: []
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    const restoredLedger = JSON.stringify({
      schemaVersion: 3,
      revision: 1,
      automations: [serializeLedgerAutomation("restored", "Restored")],
      runs: []
    });
    storage.store("chat.automations.ledger", restoredLedger, -1, 1);
    const created = await service.createAutomation({
      name: "After restore",
      prompt: "p",
      schedule: dailySchedule(),
      target: workspaceTarget()
    });
    const persisted = JSON.parse(storage.get("chat.automations.ledger", -1));
    storage.store("chat.automations.ledger", restoredLedger, -1, 1);
    assert.deepStrictEqual({
      createdName: created.name,
      persistedRevision: persisted.revision,
      persistedNames: persisted.automations.map((automation) => automation.name),
      inMemoryNames: service.automations.get().map((automation) => automation.name)
    }, {
      createdName: "After restore",
      persistedRevision: 2,
      persistedNames: ["After restore", "Restored"],
      inMemoryNames: ["After restore", "Restored"]
    });
  });
  test("reading a corrupt ledger leaves observables empty without throwing", () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", "not json", -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
  });
  test("drops a malformed schema v3 row without discarding valid rows", () => {
    const storage = teardown.add(new InMemoryStorageService());
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 3,
      automations: [
        {
          id: "keep",
          name: "Valid",
          prompt: "p",
          schedule: dailySchedule(),
          target: { kind: "workspace", folderUri: FOLDER.toJSON(), isolation: { kind: "default" } },
          enabled: true,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z"
        },
        null
      ],
      runs: [
        { id: "r-keep", automationId: "keep", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 }
      ]
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual({
      automationIds: service.automations.get().map((automation) => automation.id),
      runIds: service.runs.get().map((run) => run.id)
    }, {
      automationIds: ["keep"],
      runIds: ["r-keep"]
    });
  });
  test("migrates valid schema v1 records to v3 while dropping malformed targets", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const ledger = {
      schemaVersion: 1,
      automations: [
        { id: "orphan", name: "Old", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "orphan-quick", name: "Old Quick", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "keep", name: "Valid", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, folderUri: FOLDER.toJSON(), enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" },
        { id: "quick", name: "Quick", prompt: "p", schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 }, isQuickChat: true, providerId: "local-agent-host", sessionTypeId: "copilotcli", enabled: true, createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z" }
      ],
      runs: [
        { id: "r-orphan", automationId: "orphan", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-orphan-quick", automationId: "orphan-quick", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-keep", automationId: "keep", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 },
        { id: "r-quick", automationId: "quick", status: "completed", trigger: "manual", startedAt: "2024-01-01T00:00:00Z", leaderWindowId: 1 }
      ]
    };
    storage.store("chat.automations.ledger", JSON.stringify(ledger), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual({
      automations: service.automations.get().map((automation) => ({ id: automation.id, targetKind: automation.target.kind })),
      runs: service.runs.get().map((run) => run.id)
    }, {
      automations: [
        { id: "keep", targetKind: "workspace" },
        { id: "quick", targetKind: "quickChat" }
      ],
      runs: ["r-keep", "r-quick"]
    });
    await service.updateAutomation("keep", { name: "Updated" });
    const migrated = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.deepStrictEqual({
      schemaVersion: migrated.schemaVersion,
      automationIds: migrated.automations.map((automation) => automation.id),
      runIds: migrated.runs.map((run) => run.id)
    }, {
      schemaVersion: 3,
      automationIds: ["keep", "quick"],
      runIds: ["r-keep", "r-quick"]
    });
  });
  test("migrates schema v2 flat targets to schema v3 target unions", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const common = {
      prompt: "p",
      schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
      enabled: true,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z"
    };
    storage.store("chat.automations.ledger", JSON.stringify({
      schemaVersion: 2,
      automations: [
        { ...common, id: "workspace", name: "Workspace", folderUri: FOLDER.toJSON(), isolationMode: "worktree", branch: "feature/saved" },
        { ...common, id: "legacy-worktree", name: "Legacy Worktree", folderUri: FOLDER.toJSON(), isolationMode: "worktree" },
        { ...common, id: "quick", name: "Quick", isQuickChat: true, providerId: "local-agent-host", sessionTypeId: "copilotcli" }
      ],
      runs: []
    }), -1, 1);
    const service = teardown.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get().map((automation) => automation.target), [
      workspaceTarget(FOLDER, { kind: "worktree", branch: "feature/saved" }),
      workspaceTarget(FOLDER, { kind: "default" }),
      { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    ]);
    await service.updateAutomation("workspace", { name: "Updated" });
    const migrated = JSON.parse(storage.get("chat.automations.ledger", -1));
    assert.strictEqual(migrated.schemaVersion, 3);
  });
  test("round-trips a folderUri through persistence", async () => {
    const sharedStorage = teardown.add(new InMemoryStorageService());
    const firstService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const uri = URI.parse("file:///workspace/project");
    await firstService.createAutomation({ name: "A", prompt: "p", schedule: dailySchedule(), target: workspaceTarget(uri) });
    const secondService = teardown.add(createAutomationService(sharedStorage, new NullLogService(), NullTelemetryService));
    const reloaded = secondService.automations.get()[0];
    assert.deepStrictEqual(reloaded.target, workspaceTarget(uri));
  });
  test("disposal does not interfere with later in-store reads", () => {
    const store = new DisposableStore();
    const storage = store.add(new InMemoryStorageService());
    const service = store.add(createAutomationService(storage, new NullLogService(), NullTelemetryService));
    assert.deepStrictEqual(service.automations.get(), []);
    store.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25TZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvblJ1blRyaWdnZXIsIEF1dG9tYXRpb25UYXJnZXQsIEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24sIElBdXRvbWF0aW9uUnVuLCBJQXV0b21hdGlvblNjaGVkdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4vYXV0b21hdGlvblRlc3RVdGlscy5qcyc7XG5cbmNvbnN0IEZPTERFUiA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UnKTtcblxuZnVuY3Rpb24gd29ya3NwYWNlVGFyZ2V0KGZvbGRlclVyaSA9IEZPTERFUiwgaXNvbGF0aW9uOiBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uID0geyBraW5kOiAnZGVmYXVsdCcgfSk6IEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4geyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpLCBpc29sYXRpb24gfTtcbn1cblxuZnVuY3Rpb24gZGFpbHlTY2hlZHVsZShob3VyID0gOSwgbWludXRlID0gMCk6IElBdXRvbWF0aW9uU2NoZWR1bGUge1xuXHRyZXR1cm4geyBpbnRlcnZhbDogJ2RhaWx5Jywgc2NoZWR1bGVIb3VyOiBob3VyLCBzY2hlZHVsZU1pbnV0ZTogbWludXRlLCBzY2hlZHVsZURheTogMCB9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVMZWRnZXJBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZykge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdG5hbWUsXG5cdFx0cHJvbXB0OiAncCcsXG5cdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0fTtcbn1cblxuc3VpdGUoJ0F1dG9tYXRpb25TZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IHRlYXJkb3duID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqIFJlY29yZHMgYSBydW4sIGFzc2VydGluZyB0aGUgYXV0b21hdGlvbidzIGFjdGl2ZS1ydW4gc2xvdCB3YXMgZnJlZS4gKi9cblx0YXN5bmMgZnVuY3Rpb24gY2xhaW1SdW4oc2VydmljZTogQXV0b21hdGlvblNlcnZpY2UsIGF1dG9tYXRpb25JZDogc3RyaW5nLCB0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgbGVhZGVyV2luZG93SWQgPSAxKTogUHJvbWlzZTxJQXV0b21hdGlvblJ1bj4ge1xuXHRcdGNvbnN0IGNsYWltID0gYXdhaXQgc2VydmljZS5yZWNvcmRSdW5TdGFydChhdXRvbWF0aW9uSWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRhc3NlcnQub2soY2xhaW0uY2xhaW1lZCwgJ2V4cGVjdGVkIHRoZSBydW4gc2xvdCB0byBiZSBjbGFpbWVkJyk7XG5cdFx0cmV0dXJuIGNsYWltLnJ1bjtcblx0fVxuXG5cdC8qKiBSZWNvcmRzIGEgcnVuIGFuZCBjb21wbGV0ZXMgaXQgc28gdGhlIGF1dG9tYXRpb24ncyBzbG90IGlzIGZyZWUgZm9yIHRoZSBuZXh0IG9uZS4gKi9cblx0YXN5bmMgZnVuY3Rpb24gcmVjb3JkQ29tcGxldGVkUnVuKHNlcnZpY2U6IEF1dG9tYXRpb25TZXJ2aWNlLCBhdXRvbWF0aW9uSWQ6IHN0cmluZywgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIgPSAnbWFudWFsJyk6IFByb21pc2U8SUF1dG9tYXRpb25SdW4+IHtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhdXRvbWF0aW9uSWQsIHRyaWdnZXIpO1xuXHRcdHJldHVybiBhd2FpdCBzZXJ2aWNlLnVwZGF0ZVJ1bihydW4uaWQsIHsgc3RhdHVzOiAnY29tcGxldGVkJyB9KSA/PyBydW47XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKHN0b3JhZ2U/OiBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKTogeyBzZXJ2aWNlOiBBdXRvbWF0aW9uU2VydmljZTsgc3RvcmFnZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZSB9IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKHN0b3JhZ2UgPz8gbmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBzdG9yYWdlOiBzaGFyZWRTdG9yYWdlIH07XG5cdH1cblxuXHR0ZXN0KCdzdGFydHMgd2l0aCBhbiBlbXB0eSBsZWRnZXIgd2hlbiBub3RoaW5nIGlzIHBlcnNpc3RlZCcsICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UucnVucy5nZXQoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBdXRvbWF0aW9uIGFwcGVuZHMgYW4gZW50cnkgYW5kIGNvbXB1dGVzIG5leHRSdW5BdCBmb3Igbm9uLW1hbnVhbCBzY2hlZHVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnRGFpbHkgcmV2aWV3Jyxcblx0XHRcdHByb21wdDogJ1N1bW1hcml6ZSB3aGF0IGNoYW5nZWQnLFxuXHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCksXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKVswXS5pZCwgYS5pZCk7XG5cdFx0YXNzZXJ0Lm9rKGEubmV4dFJ1bkF0LCAnZGFpbHkgc2NoZWR1bGUgc2hvdWxkIHByb2R1Y2UgYSBuZXh0UnVuQXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5lbmFibGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQXV0b21hdGlvbiB3aXRoIG1hbnVhbCBzY2hlZHVsZSBsZWF2ZXMgbmV4dFJ1bkF0IHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdNYW51YWwnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLm5leHRSdW5BdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQXV0b21hdGlvbiB0aHJvd3Mgd2hlbiBmb2xkZXJVcmkgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRcdG5hbWU6ICdYJyxcblx0XHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHRcdHRhcmdldDogeyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiB1bmRlZmluZWQsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9IGFzIHVua25vd24gYXMgQXV0b21hdGlvblRhcmdldCxcblx0XHRcdH0pLFxuXHRcdFx0L2ZvbGRlclVyaS8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyBhIHdvcmtzcGFjZS1sZXNzIGF1dG9tYXRpb24gb25seSB3aXRoIGFuIGV4cGxpY2l0IHF1aWNrLWNoYXQgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdFx0bmFtZTogJ01pc3NpbmcgdGFyZ2V0Jyxcblx0XHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHRcdHRhcmdldDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogdW5kZWZpbmVkLCBzZXNzaW9uVHlwZUlkOiB1bmRlZmluZWQgfSBhcyB1bmtub3duIGFzIEF1dG9tYXRpb25UYXJnZXQsXG5cdFx0XHR9KSxcblx0XHRcdC9wcm92aWRlcklkIGFuZCBzZXNzaW9uVHlwZUlkLyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnV29ya3NwYWNlLWxlc3MnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdFx0dGFyZ2V0OiB7XG5cdFx0XHRcdGtpbmQ6ICdxdWlja0NoYXQnLFxuXHRcdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0Zm9sZGVyVXJpOiBGT0xERVIsXG5cdFx0XHRcdGlzb2xhdGlvbjogeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdzdGFsZScgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBBdXRvbWF0aW9uVGFyZ2V0LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhdXRvbWF0aW9uLnRhcmdldCwge1xuXHRcdFx0a2luZDogJ3F1aWNrQ2hhdCcsXG5cdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgbWFsZm9ybWVkIHdvcmt0cmVlIHRhcmdldHMgd2l0aG91dCBhIGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRcdG5hbWU6ICdXb3JrdHJlZScsXG5cdFx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnJyB9KSxcblx0XHRcdH0pLFxuXHRcdFx0L3JlcXVpcmVzIGEgYnJhbmNoLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVBdXRvbWF0aW9uIHJlY29tcHV0ZXMgbmV4dFJ1bkF0IHdoZW4gdGhlIHNjaGVkdWxlIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKDksIDApLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblx0XHRjb25zdCBiZWZvcmUgPSBhLm5leHRSdW5BdDtcblx0XHRjb25zdCBiID0gYXdhaXQgc2VydmljZS51cGRhdGVBdXRvbWF0aW9uKGEuaWQsIHsgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoMTAsIDMwKSB9KTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYi5uZXh0UnVuQXQsIGJlZm9yZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZUF1dG9tYXRpb24ga2VlcHMgbmV4dFJ1bkF0IHdoZW4gb25seSB0aGUgbmFtZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYS5pZCwgeyBuYW1lOiAnQicgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIubmV4dFJ1bkF0LCBhLm5leHRSdW5BdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIubmFtZSwgJ0InKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlQXV0b21hdGlvbiBjYW4gY2xlYXIgbW9kZWxJZC9tb2RlL3Blcm1pc3Npb25MZXZlbCBieSBwYXNzaW5nIG51bGwgYnV0IGtlZXBzIGZvbGRlclVyaScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdFx0bW9kZWxJZDogJ2dwdC00Jyxcblx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6ICdhdXRvcGlsb3QnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYS5pZCwgeyBtb2RlbElkOiBudWxsLCBtb2RlOiBudWxsLCBwZXJtaXNzaW9uTGV2ZWw6IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIubW9kZWxJZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5tb2RlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLnBlcm1pc3Npb25MZXZlbCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi50YXJnZXQua2luZCA9PT0gJ3dvcmtzcGFjZScgPyBiLnRhcmdldC5mb2xkZXJVcmkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCwgRk9MREVSLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVBdXRvbWF0aW9uIHN3aXRjaGVzIGZvbGRlciB3aGVuIGEgbmV3IGZvbGRlclVyaSBpcyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBvdGhlciA9IFVSSS5wYXJzZSgnZmlsZTovLy9vdGhlcicpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYS5pZCwgeyB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChvdGhlcikgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIudGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnID8gYi50YXJnZXQuZm9sZGVyVXJpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsIG90aGVyLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVBdXRvbWF0aW9uIHJlamVjdHMgaW5jb21wbGV0ZSB3b3Jrc3BhY2UtbGVzcyB0YXJnZXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCwge1xuXHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQ6IHVuZGVmaW5lZCwgc2Vzc2lvblR5cGVJZDogdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBBdXRvbWF0aW9uVGFyZ2V0LFxuXHRcdFx0fSksXG5cdFx0XHQvcHJvdmlkZXJJZCBhbmQgc2Vzc2lvblR5cGVJZC8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiByZW1vdmVzIHRoZSBlbnRyeSBhbmQgb3JwaGFuIHJ1bnMgYXJlIGRyb3BwZWQgb24gcmVsb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgZmlyc3RTZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdtYW51YWwnLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RTZXJ2aWNlLnJ1bnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCBmaXJzdFNlcnZpY2UuZGVsZXRlQXV0b21hdGlvbihhLmlkKTtcblx0XHQvLyBEZWxldGluZyBjb21taXRzIGEgbmV3IGxlZGdlciwgd2hpY2ggdHJpZ2dlcnMgYSByZWxvYWQgdGhhdFxuXHRcdC8vIGRyb3BzIHRoZSBub3ctb3JwaGFuZWQgcnVuIHNvIHRoZSBsZWRnZXIgZG9lcyBub3QgZ3JvdyBmb3JldmVyLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3RTZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0U2VydmljZS5ydW5zLmdldCgpLmxlbmd0aCwgMCk7XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmRTZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRSdW5TdGFydCBpbnNlcnRzIGEgcGVuZGluZyBydW47IHVwZGF0ZVJ1biBhcHBsaWVzIGEgcGF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgY2xhaW1SdW4oc2VydmljZSwgYS5pZCwgJ3NjaGVkdWxlJywgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4uc3RhdHVzLCAncGVuZGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW4ubGVhZGVyV2luZG93SWQsIDQyKTtcblx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgc2VydmljZS51cGRhdGVSdW4ocnVuLmlkLCB7IHN0YXR1czogJ2NvbXBsZXRlZCcsIHNlc3Npb25SZXNvdXJjZTogJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9jb3BpbG90L3Nlc3MtMScsIGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZWQ/LnN0YXR1cywgJ2NvbXBsZXRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkPy5zZXNzaW9uUmVzb3VyY2UsICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vY29waWxvdC9zZXNzLTEnKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkUnVuU3RhcnQgdXBkYXRlcyBsYXN0UnVuQXQgYW5kIGFkdmFuY2VzIHRoZSBuZXh0IHNjaGVkdWxlZCBydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0EnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ2hvdXJseScsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLFxuXHRcdH0pO1xuXG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMTA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IHJ1biA9IGF3YWl0IGNsYWltUnVuKHNlcnZpY2UsIGF1dG9tYXRpb24uaWQsICdjYXRjaF91cCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydGVkQXQ6IHJ1bi5zdGFydGVkQXQsXG5cdFx0XHRsYXN0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk/Lm5leHRSdW5BdCxcblx0XHR9LCB7XG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTA2LTAxVDEwOjAwOjAwLjAwMFonLFxuXHRcdFx0bGFzdFJ1bkF0OiAnMjAyNS0wNi0wMVQxMDowMDowMC4wMDBaJyxcblx0XHRcdG5leHRSdW5BdDogJzIwMjUtMDYtMDFUMTE6MDA6MDAuMDAwWicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZFJ1blN0YXJ0IGxlYXZlcyBzY2hlZHVsZSB0aW1lc3RhbXBzIHVuY2hhbmdlZCBmb3IgYSBtYW51YWwgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IG5ldyBEYXRlKCcyMDI1LTA2LTAxVDAwOjAwOjAwWicpKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdob3VybHknLCBzY2hlZHVsZUhvdXI6IDAsIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblxuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IG5ldyBEYXRlKCcyMDI1LTA2LTAxVDAwOjMwOjAwWicpKTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhdXRvbWF0aW9uLmlkLCAnbWFudWFsJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0ZWRBdDogcnVuLnN0YXJ0ZWRBdCxcblx0XHRcdGxhc3RSdW5BdDogc2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpPy5sYXN0UnVuQXQsXG5cdFx0XHRuZXh0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubmV4dFJ1bkF0LFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDYtMDFUMDA6MzA6MDAuMDAwWicsXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVJ1bkZvciByZXR1cm5zIHRoZSBmaXJzdCBwZW5kaW5nIG9yIHJ1bm5pbmcgcnVuIGZvciBhbiBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhLmlkKSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnc2NoZWR1bGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRBY3RpdmVSdW5Gb3IoYS5pZCk/LmlkLCBydW4uaWQpO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHJ1bi5pZCwgeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFjdGl2ZVJ1bkZvcihhLmlkKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya1N0YWxlUnVuc0ZhaWxlZCBtb3ZlcyBwZW5kaW5nIGFuZCBydW5uaW5nIHJvd3MgdG8gZmFpbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdC8vIE9uZSByb3cgcGVyIHN0YXRlOiBvbmx5IG9uZSBydW4gcGVyIGF1dG9tYXRpb24gY2FuIGJlIGFjdGl2ZSBhdCBhIHRpbWUuXG5cdFx0Y29uc3QgcjEgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnc2NoZWR1bGUnKTtcblx0XHRjb25zdCByMiA9IGF3YWl0IGNsYWltUnVuKHNlcnZpY2UsIGIuaWQsICdzY2hlZHVsZScpO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHIxLmlkLCB7IHN0YXR1czogJ3J1bm5pbmcnIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UubWFya1N0YWxlUnVuc0ZhaWxlZCgnSW50ZXJydXB0ZWQnKTtcblx0XHRjb25zdCBhbGwgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZmluZChyID0+IHIuaWQgPT09IHIxLmlkKT8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZmluZChyID0+IHIuaWQgPT09IHIyLmlkKT8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFsbC5maW5kKHIgPT4gci5pZCA9PT0gcjEuaWQpPy5lcnJvck1lc3NhZ2UsICdJbnRlcnJ1cHRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5zRm9yIGZpbHRlcnMgdG8gYSBzaW5nbGUgYXV0b21hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRjb25zdCBiID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYS5pZCwgJ3NjaGVkdWxlJyk7XG5cdFx0YXdhaXQgcmVjb3JkQ29tcGxldGVkUnVuKHNlcnZpY2UsIGIuaWQsICdzY2hlZHVsZScpO1xuXHRcdGF3YWl0IHJlY29yZENvbXBsZXRlZFJ1bihzZXJ2aWNlLCBhLmlkLCAnbWFudWFsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucnVuc0ZvcihhLmlkKS5nZXQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnNGb3IoYi5pZCkuZ2V0KCkubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkUnVuU3RhcnQgY2FwcyByZXRhaW5lZCBydW5zIHBlciBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdC8vIFB1c2ggNjAgcnVucyBmb3IgYSAoY2FwIGlzIDUwKSBhbmQgNSBmb3IgYi4gRWFjaCBhdXRvbWF0aW9uJ3Ncblx0XHQvLyBoaXN0b3J5IHNob3VsZCBiZSBib3VuZGVkIGluZGVwZW5kZW50bHkuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA2MDsgaSsrKSB7XG5cdFx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYS5pZCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRhd2FpdCByZWNvcmRDb21wbGV0ZWRSdW4oc2VydmljZSwgYi5pZCk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLnJ1bnNGb3IoYS5pZCkuZ2V0KCkubGVuZ3RoLCA1MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UucnVuc0ZvcihiLmlkKS5nZXQoKS5sZW5ndGgsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRSdW5TdGFydCBkZWNsaW5lcyBhIHNlY29uZCBjbGFpbSB3aGlsZSBhIHJ1biBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjbGFpbVJ1bihzZXJ2aWNlLCBhLmlkLCAnbWFudWFsJyk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4oZmlyc3QuaWQsIHsgc3RhdHVzOiAncnVubmluZycgfSk7XG5cblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdzY2hlZHVsZScsIDIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjbGFpbWVkOiBzZWNvbmQuY2xhaW1lZCxcblx0XHRcdHJ1bklkOiBzZWNvbmQucnVuLmlkLFxuXHRcdFx0dG90YWxSdW5zOiBzZXJ2aWNlLnJ1bnNGb3IoYS5pZCkuZ2V0KCkubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGNsYWltZWQ6IGZhbHNlLFxuXHRcdFx0cnVuSWQ6IGZpcnN0LmlkLFxuXHRcdFx0dG90YWxSdW5zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGNsYWltcyBmcm9tIHR3byB3aW5kb3dzIHByb2R1Y2UgYSBzaW5nbGUgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd2luZG93QSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCB3aW5kb3dCID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0Ly8gTmVpdGhlciB3aW5kb3cgc2VlcyBhbiBhY3RpdmUgcnVuIHdoZW4gaXQgc3RhcnRzLCBzbyB0aGUgY2xhaW0gaGFzIHRvIGJlXG5cdFx0Ly8gc2V0dGxlZCBieSB0aGUgc3RvcmFnZSBjb21wYXJlLWFuZC1zd2FwIHJhdGhlciB0aGFuIGJ5IGEgcHJlLXJlYWQgY2hlY2suXG5cdFx0Y29uc3QgW2ZpcnN0LCBzZWNvbmRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0d2luZG93QS5yZWNvcmRSdW5TdGFydChhLmlkLCAnbWFudWFsJywgMSksXG5cdFx0XHR3aW5kb3dCLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdtYW51YWwnLCAyKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xhaW1Db3VudDogW2ZpcnN0LCBzZWNvbmRdLmZpbHRlcihjbGFpbSA9PiBjbGFpbS5jbGFpbWVkKS5sZW5ndGgsXG5cdFx0XHRhZ3JlZU9uUnVuOiBmaXJzdC5ydW4uaWQgPT09IHNlY29uZC5ydW4uaWQsXG5cdFx0XHR0b3RhbFJ1bnM6IHdpbmRvd0EucnVuc0ZvcihhLmlkKS5nZXQoKS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0Y2xhaW1Db3VudDogMSxcblx0XHRcdGFncmVlT25SdW46IHRydWUsXG5cdFx0XHR0b3RhbFJ1bnM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIGFjcm9zcyBzZXJ2aWNlIHJlc3RhcnRzIHZpYSBzaGFyZWQgc3RvcmFnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZpcnN0U2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBhID0gYXdhaXQgZmlyc3RTZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IGZpcnN0U2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnbWFudWFsJywgNyk7XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKVswXS5pZCwgYS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZFNlcnZpY2UucnVucy5nZXQoKS5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhbmQgY2xlYXJzIFdvcmt0cmVlIGJyYW5jaCBjb25maWd1cmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0fSk7XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZFNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBzZWNvbmRTZXJ2aWNlLmdldEF1dG9tYXRpb24oY3JlYXRlZC5pZCk7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IGF3YWl0IHNlY29uZFNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7IHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnZm9sZGVyJyB9KSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdG9yZWRUYXJnZXQ6IHJlc3RvcmVkPy50YXJnZXQsXG5cdFx0XHR1cGRhdGVkVGFyZ2V0OiB1cGRhdGVkLnRhcmdldCxcblx0XHR9LCB7XG5cdFx0XHRyZXN0b3JlZFRhcmdldDogd29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KSxcblx0XHRcdHVwZGF0ZWRUYXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ2ZvbGRlcicgfSksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIHRhcmdldCBjaGFuZ2VzIHdpdGhvdXQgY2FycnlpbmcgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGludG8gcXVpY2stY2hhdCBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZFN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7XG5cdFx0XHRuYW1lOiAnQScsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksXG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0ID0gYXdhaXQgZmlyc3RTZXJ2aWNlLnVwZGF0ZUF1dG9tYXRpb24oY3JlYXRlZC5pZCwge1xuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdH0pO1xuXHRcdGZpcnN0U2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBzZWNvbmRTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gc2Vjb25kU2VydmljZS5nZXRBdXRvbWF0aW9uKGNyZWF0ZWQuaWQpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IGF3YWl0IHNlY29uZFNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihjcmVhdGVkLmlkLCB7XG5cdFx0XHR0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSksXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHF1aWNrQ2hhdDogcXVpY2tDaGF0LnRhcmdldCxcblx0XHRcdHJlc3RvcmVkOiByZXN0b3JlZD8udGFyZ2V0LFxuXHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2UudGFyZ2V0LFxuXHRcdH0sIHtcblx0XHRcdHF1aWNrQ2hhdDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdHJlc3RvcmVkOiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2VUYXJnZXQoRk9MREVSLCB7IGtpbmQ6ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0pLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gc2VydmljZXMgb24gdGhlIHNhbWUgc3RvcmFnZSBzdGF5IGluIHN5bmMgdmlhIG9uRGlkQ2hhbmdlVmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHdpbmRvd0IuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgd2luZG93QS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ1gnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdC8vIEluLW1lbW9yeSBzdG9yYWdlIGZpcmVzIG9uRGlkQ2hhbmdlVmFsdWUgc3luY2hyb25vdXNseSwgc28gd2luZG93QlxuXHRcdC8vIHNob3VsZCBhbHJlYWR5IHNlZSB0aGUgbmV3IGF1dG9tYXRpb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd0IuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93Qi5hdXRvbWF0aW9ucy5nZXQoKVswXS5pZCwgY3JlYXRlZC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211dGF0aW9ucyBwcmVzZXJ2ZSB1bnJlbGF0ZWQgYXBwbGljYXRpb24gc3RvcmFnZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCd1bnJlbGF0ZWQnLCAnc2VudGluZWwnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbihhdXRvbWF0aW9uLmlkLCB7IG5hbWU6ICdVcGRhdGVkJyB9KTtcblx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAxKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmRlbGV0ZUF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmFnZS5nZXQoJ3VucmVsYXRlZCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiksICdzZW50aW5lbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdndWFyZGVkIHVwZGF0ZSByZWplY3RzIGEgY29uY3VycmVudCBlZGl0YWJsZSBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmV2aWV3ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnT3JpZ2luYWwnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGF3YWl0IHdpbmRvd0IudXBkYXRlQXV0b21hdGlvbihyZXZpZXdlZC5pZCwgeyBwcm9tcHQ6ICdjb25jdXJyZW50IGVkaXQnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHdpbmRvd0EudXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKHJldmlld2VkLmlkLCB7IG5hbWU6ICdSZXZpZXdlZCBlZGl0JyB9LCByZXZpZXdlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5raW5kID09PSAnY29uZmxpY3QnID8ge1xuXHRcdFx0a2luZDogcmVzdWx0LmtpbmQsXG5cdFx0XHRjdXJyZW50TmFtZTogcmVzdWx0LmN1cnJlbnQ/Lm5hbWUsXG5cdFx0XHRjdXJyZW50UHJvbXB0OiByZXN1bHQuY3VycmVudD8ucHJvbXB0LFxuXHRcdH0gOiByZXN1bHQsIHtcblx0XHRcdGtpbmQ6ICdjb25mbGljdCcsXG5cdFx0XHRjdXJyZW50TmFtZTogJ09yaWdpbmFsJyxcblx0XHRcdGN1cnJlbnRQcm9tcHQ6ICdjb25jdXJyZW50IGVkaXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdndWFyZGVkIHVwZGF0ZSB0b2xlcmF0ZXMgY29uY3VycmVudCBydW50aW1lIG1ldGFkYXRhIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkU3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3aW5kb3dBID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHdpbmRvd0IgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0d2luZG93QS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDA6MDA6MDBaJykpO1xuXHRcdGNvbnN0IHJldmlld2VkID0gYXdhaXQgd2luZG93QS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ09yaWdpbmFsJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHR3aW5kb3dCLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBuZXcgRGF0ZSgnMjAyNS0wNi0wMVQxMDowMDowMFonKSk7XG5cdFx0Y29uc3QgcnVuID0gYXdhaXQgY2xhaW1SdW4od2luZG93QiwgcmV2aWV3ZWQuaWQsICdzY2hlZHVsZScsIDIpO1xuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHdpbmRvd0IuZ2V0QXV0b21hdGlvbihyZXZpZXdlZC5pZCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgd2luZG93QS51cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQocmV2aWV3ZWQuaWQsIHsgbmFtZTogJ1Jldmlld2VkIGVkaXQnIH0sIHJldmlld2VkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmtpbmQgPT09ICd1cGRhdGVkJyA/IHtcblx0XHRcdGtpbmQ6IHJlc3VsdC5raW5kLFxuXHRcdFx0bmFtZTogcmVzdWx0LmF1dG9tYXRpb24ubmFtZSxcblx0XHRcdGxhc3RSdW5BdDogcmVzdWx0LmF1dG9tYXRpb24ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiByZXN1bHQuYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0XHRydW5JZHM6IHdpbmRvd0EucnVucy5nZXQoKS5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCksXG5cdFx0fSA6IHJlc3VsdCwge1xuXHRcdFx0a2luZDogJ3VwZGF0ZWQnLFxuXHRcdFx0bmFtZTogJ1Jldmlld2VkIGVkaXQnLFxuXHRcdFx0bGFzdFJ1bkF0OiBydW50aW1lU3RhdGU/Lmxhc3RSdW5BdCxcblx0XHRcdG5leHRSdW5BdDogcnVudGltZVN0YXRlPy5uZXh0UnVuQXQsXG5cdFx0XHRydW5JZHM6IFtydW4uaWRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25jdXJyZW50IGNyZWF0ZSwgZWRpdCwgcnVuLCBhbmQgZGVsZXRlIG11dGF0aW9ucyBjb252ZXJnZSB3aXRob3V0IGxvc3QgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHdpbmRvd0EgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc2hhcmVkU3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgd2luZG93QiA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCBlZGl0ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnRWRpdCBtZScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBhd2FpdCB3aW5kb3dBLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnRGVsZXRlIG1lJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRjb25zdCBbLCBjbGFpbSwgLCBjcmVhdGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHdpbmRvd0EudXBkYXRlQXV0b21hdGlvbihlZGl0ZWQuaWQsIHsgbmFtZTogJ0VkaXRlZCcgfSksXG5cdFx0XHR3aW5kb3dCLnJlY29yZFJ1blN0YXJ0KGVkaXRlZC5pZCwgJ3NjaGVkdWxlJywgMiksXG5cdFx0XHR3aW5kb3dBLmRlbGV0ZUF1dG9tYXRpb24oZGVsZXRlZC5pZCksXG5cdFx0XHR3aW5kb3dCLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQ3JlYXRlZCcsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXRvbWF0aW9uczogd2luZG93QS5hdXRvbWF0aW9ucy5nZXQoKVxuXHRcdFx0XHQubWFwKGF1dG9tYXRpb24gPT4gKHsgaWQ6IGF1dG9tYXRpb24uaWQsIG5hbWU6IGF1dG9tYXRpb24ubmFtZSB9KSlcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdFx0cnVuczogd2luZG93QS5ydW5zLmdldCgpLm1hcChjYW5kaWRhdGUgPT4gKHsgaWQ6IGNhbmRpZGF0ZS5pZCwgYXV0b21hdGlvbklkOiBjYW5kaWRhdGUuYXV0b21hdGlvbklkIH0pKSxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aW9uczogW1xuXHRcdFx0XHR7IGlkOiBjcmVhdGVkLmlkLCBuYW1lOiAnQ3JlYXRlZCcgfSxcblx0XHRcdFx0eyBpZDogZWRpdGVkLmlkLCBuYW1lOiAnRWRpdGVkJyB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bnM6IFt7IGlkOiBjbGFpbS5ydW4uaWQsIGF1dG9tYXRpb25JZDogZWRpdGVkLmlkIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkaW5nIGEgbGVkZ2VyIHdpdGggYSBmdXR1cmUgc2NoZW1hIHZlcnNpb24gZnJlZXplcyBvYnNlcnZhYmxlcyBhbmQgcmVmdXNlcyB0byB3cml0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZ1dHVyZUxlZGdlciA9IEpTT04uc3RyaW5naWZ5KHsgc2NoZW1hVmVyc2lvbjogOTk5LCByZXZpc2lvbjogNywgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9KTtcblx0XHQvLyBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04gaXMgLTFcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIGZ1dHVyZUxlZGdlciwgLTEsIDEpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHQvLyBPYnNlcnZhYmxlcyByZW1haW4gZW1wdHkgKG5vIHByaW9yIGluLW1lbW9yeSBzdGF0ZSB0byBwcmVzZXJ2ZSlcblx0XHQvLyBidXQgdGhlIHNlcnZpY2UgaXMgbm93IGluIHJlYWQtb25seSBtb2RlLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5ydW5zLmdldCgpLCBbXSk7XG5cblx0XHQvLyBBIHN1YnNlcXVlbnQgbXV0YXRpb24gbXVzdCBiZSByZWplY3RlZCAocmVhZC1vbmx5IG1vZGUpIGFuZCBtdXN0IG5vdFxuXHRcdC8vIGRlc3Ryb3kgdGhlIG9uLWRpc2sgbmV3ZXIgbGVkZ2VyLlxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KSxcblx0XHRcdC9uZXdlciB2ZXJzaW9uLyxcblx0XHQpO1xuXG5cdFx0Ly8gSW4tbWVtb3J5IHN0YXRlIGlzIGFsc28gdW5jaGFuZ2VkIGJlY2F1c2UgdGhlIG11dGF0aW9uIHdhcyByZWplY3RlZFxuXHRcdC8vIGJlZm9yZSBhbnkgY29tbWl0LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSwgZnV0dXJlTGVkZ2VyKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaEZyb21TdG9yYWdlIHByZXNlcnZlcyBpbi1tZW1vcnkgc3RhdGUgd2hlbiBzdG9yYWdlIGZsaXBzIHRvIGFuIHVuc3VwcG9ydGVkIHNjaGVtYScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0xvY2FsJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubGVuZ3RoLCAxKTtcblxuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoeyBzY2hlbWFWZXJzaW9uOiA5OTksIHJldmlzaW9uOiA5OSwgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9KSwgLTEsIDEpO1xuXG5cdFx0Ly8gVGhlIG9uRGlkQ2hhbmdlVmFsdWUgcmVmcmVzaCBtdXN0IE5PVCBjbGVhciBvdXIgb2JzZXJ2YWJsZXMgdG9cblx0XHQvLyBlbXB0eS4gV2Uga2VlcCBkaXNwbGF5aW5nIHdoYXQgd2UgbGFzdCBrbmV3IGFib3V0LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3QgYnVtcHMgdGhlIHJldmlzaW9uIGNvdW50ZXIgb24gZXZlcnkgd3JpdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcmV2MSA9IEpTT04ucGFyc2Uoc3RvcmFnZS5nZXQoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgLTEpISkucmV2aXNpb247XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblx0XHRjb25zdCByZXYyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKS5yZXZpc2lvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJldjEsICdudW1iZXInKTtcblx0XHRhc3NlcnQub2socmV2MiA+IHJldjEsIGBleHBlY3RlZCAke3JldjJ9ID4gJHtyZXYxfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0IGFic29yYnMgYSBoaWdoZXIgb24tZGlzayByZXZpc2lvbiAoY29uY3VycmVudC13cml0ZSBkZXRlY3Rpb24pJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGJhc2VsaW5lID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHQvLyBTaW11bGF0ZSBhbm90aGVyIHdpbmRvdyBoYXZpbmcgYWR2YW5jZWQgdGhlIHJldmlzaW9uIGJlaGluZCBvdXJcblx0XHQvLyBiYWNrLiBUaGUgc2VydmljZSBtdXN0IG5vdCB3cml0ZSBhIHN0YWxlLW9yLWVxdWFsIHJldmlzaW9uLlxuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoeyAuLi5iYXNlbGluZSwgcmV2aXNpb246IDUwMDAgfSksIC0xLCAxKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGFmdGVyID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHRhc3NlcnQub2soYWZ0ZXIucmV2aXNpb24gPiA1MDAwLCBgZXhwZWN0ZWQgcmV2aXNpb24gPiA1MDAwLCBnb3QgJHthZnRlci5yZXZpc2lvbn1gKTtcblx0fSk7XG5cblx0dGVzdCgnc3VjY2Vzc2Z1bCBDQVMgYWNjZXB0cyBhIHJlc3RvcmVkIGxvd2VyIHJldmlzaW9uIHdpdGhvdXQgYWNjZXB0aW5nIHN0YWxlIG5vdGlmaWNhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNjaGVtYVZlcnNpb246IDMsXG5cdFx0XHRyZXZpc2lvbjogNDAsXG5cdFx0XHRhdXRvbWF0aW9uczogW3NlcmlhbGl6ZUxlZGdlckF1dG9tYXRpb24oJ25ld2VyJywgJ0JlZm9yZSByZXN0b3JlJyldLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSksIC0xLCAxKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3RvcmVkTGVkZ2VyID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdHJldmlzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtzZXJpYWxpemVMZWRnZXJBdXRvbWF0aW9uKCdyZXN0b3JlZCcsICdSZXN0b3JlZCcpXSxcblx0XHRcdHJ1bnM6IFtdLFxuXHRcdH0pO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgcmVzdG9yZWRMZWRnZXIsIC0xLCAxKTtcblxuXHRcdGNvbnN0IGNyZWF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ0FmdGVyIHJlc3RvcmUnLFxuXHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRzY2hlZHVsZTogZGFpbHlTY2hlZHVsZSgpLFxuXHRcdFx0dGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSxcblx0XHR9KTtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSEpO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgcmVzdG9yZWRMZWRnZXIsIC0xLCAxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZE5hbWU6IGNyZWF0ZWQubmFtZSxcblx0XHRcdHBlcnNpc3RlZFJldmlzaW9uOiBwZXJzaXN0ZWQucmV2aXNpb24sXG5cdFx0XHRwZXJzaXN0ZWROYW1lczogcGVyc2lzdGVkLmF1dG9tYXRpb25zLm1hcCgoYXV0b21hdGlvbjogeyBuYW1lOiBzdHJpbmcgfSkgPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHRcdGluTWVtb3J5TmFtZXM6IHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5uYW1lKSxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkTmFtZTogJ0FmdGVyIHJlc3RvcmUnLFxuXHRcdFx0cGVyc2lzdGVkUmV2aXNpb246IDIsXG5cdFx0XHRwZXJzaXN0ZWROYW1lczogWydBZnRlciByZXN0b3JlJywgJ1Jlc3RvcmVkJ10sXG5cdFx0XHRpbk1lbW9yeU5hbWVzOiBbJ0FmdGVyIHJlc3RvcmUnLCAnUmVzdG9yZWQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZGluZyBhIGNvcnJ1cHQgbGVkZ2VyIGxlYXZlcyBvYnNlcnZhYmxlcyBlbXB0eSB3aXRob3V0IHRocm93aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZS5zdG9yZSgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAnbm90IGpzb24nLCAtMSwgMSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgYSBtYWxmb3JtZWQgc2NoZW1hIHYzIHJvdyB3aXRob3V0IGRpc2NhcmRpbmcgdmFsaWQgcm93cycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdGF1dG9tYXRpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2tlZXAnLFxuXHRcdFx0XHRcdG5hbWU6ICdWYWxpZCcsXG5cdFx0XHRcdFx0cHJvbXB0OiAncCcsXG5cdFx0XHRcdFx0c2NoZWR1bGU6IGRhaWx5U2NoZWR1bGUoKSxcblx0XHRcdFx0XHR0YXJnZXQ6IHsga2luZDogJ3dvcmtzcGFjZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0gfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRdLFxuXHRcdFx0cnVuczogW1xuXHRcdFx0XHR7IGlkOiAnci1rZWVwJywgYXV0b21hdGlvbklkOiAna2VlcCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRdLFxuXHRcdH0pLCAtMSwgMSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV0b21hdGlvbklkczogc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHRcdHJ1bklkczogc2VydmljZS5ydW5zLmdldCgpLm1hcChydW4gPT4gcnVuLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBbJ2tlZXAnXSxcblx0XHRcdHJ1bklkczogWydyLWtlZXAnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlncmF0ZXMgdmFsaWQgc2NoZW1hIHYxIHJlY29yZHMgdG8gdjMgd2hpbGUgZHJvcHBpbmcgbWFsZm9ybWVkIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsZWRnZXIgPSB7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiAxLFxuXHRcdFx0YXV0b21hdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ29ycGhhbicsIG5hbWU6ICdPbGQnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGVuYWJsZWQ6IHRydWUsIGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJywgdXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonIH0sXG5cdFx0XHRcdHsgaWQ6ICdvcnBoYW4tcXVpY2snLCBuYW1lOiAnT2xkIFF1aWNrJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LCBpc1F1aWNrQ2hhdDogdHJ1ZSwgZW5hYmxlZDogdHJ1ZSwgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdFx0eyBpZDogJ2tlZXAnLCBuYW1lOiAnVmFsaWQnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBlbmFibGVkOiB0cnVlLCBjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2snLCBuYW1lOiAnUXVpY2snLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sIGlzUXVpY2tDaGF0OiB0cnVlLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJywgZW5hYmxlZDogdHJ1ZSwgY3JlYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCB1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRcdF0sXG5cdFx0XHRydW5zOiBbXG5cdFx0XHRcdHsgaWQ6ICdyLW9ycGhhbicsIGF1dG9tYXRpb25JZDogJ29ycGhhbicsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRcdHsgaWQ6ICdyLW9ycGhhbi1xdWljaycsIGF1dG9tYXRpb25JZDogJ29ycGhhbi1xdWljaycsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRcdHsgaWQ6ICdyLWtlZXAnLCBhdXRvbWF0aW9uSWQ6ICdrZWVwJywgc3RhdHVzOiAnY29tcGxldGVkJywgdHJpZ2dlcjogJ21hbnVhbCcsIHN0YXJ0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJywgbGVhZGVyV2luZG93SWQ6IDEgfSxcblx0XHRcdFx0eyBpZDogJ3ItcXVpY2snLCBhdXRvbWF0aW9uSWQ6ICdxdWljaycsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHRyaWdnZXI6ICdtYW51YWwnLCBzdGFydGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGxlYWRlcldpbmRvd0lkOiAxIH0sXG5cdFx0XHRdLFxuXHRcdH07XG5cdFx0c3RvcmFnZS5zdG9yZSgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCBKU09OLnN0cmluZ2lmeShsZWRnZXIpLCAtMSwgMSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1dG9tYXRpb25zOiBzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+ICh7IGlkOiBhdXRvbWF0aW9uLmlkLCB0YXJnZXRLaW5kOiBhdXRvbWF0aW9uLnRhcmdldC5raW5kIH0pKSxcblx0XHRcdHJ1bnM6IHNlcnZpY2UucnVucy5nZXQoKS5tYXAocnVuID0+IHJ1bi5pZCksXG5cdFx0fSwge1xuXHRcdFx0YXV0b21hdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ2tlZXAnLCB0YXJnZXRLaW5kOiAnd29ya3NwYWNlJyB9LFxuXHRcdFx0XHR7IGlkOiAncXVpY2snLCB0YXJnZXRLaW5kOiAncXVpY2tDaGF0JyB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bnM6IFsnci1rZWVwJywgJ3ItcXVpY2snXSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbigna2VlcCcsIHsgbmFtZTogJ1VwZGF0ZWQnIH0pO1xuXHRcdGNvbnN0IG1pZ3JhdGVkID0gSlNPTi5wYXJzZShzdG9yYWdlLmdldCgnY2hhdC5hdXRvbWF0aW9ucy5sZWRnZXInLCAtMSkhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNjaGVtYVZlcnNpb246IG1pZ3JhdGVkLnNjaGVtYVZlcnNpb24sXG5cdFx0XHRhdXRvbWF0aW9uSWRzOiBtaWdyYXRlZC5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgaWQ6IHN0cmluZyB9KSA9PiBhdXRvbWF0aW9uLmlkKSxcblx0XHRcdHJ1bklkczogbWlncmF0ZWQucnVucy5tYXAoKHJ1bjogeyBpZDogc3RyaW5nIH0pID0+IHJ1bi5pZCksXG5cdFx0fSwge1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRcdGF1dG9tYXRpb25JZHM6IFsna2VlcCcsICdxdWljayddLFxuXHRcdFx0cnVuSWRzOiBbJ3Ita2VlcCcsICdyLXF1aWNrJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pZ3JhdGVzIHNjaGVtYSB2MiBmbGF0IHRhcmdldHMgdG8gc2NoZW1hIHYzIHRhcmdldCB1bmlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBjb21tb24gPSB7XG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMCB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdHVwZGF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR9O1xuXHRcdHN0b3JhZ2Uuc3RvcmUoJ2NoYXQuYXV0b21hdGlvbnMubGVkZ2VyJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0c2NoZW1hVmVyc2lvbjogMixcblx0XHRcdGF1dG9tYXRpb25zOiBbXG5cdFx0XHRcdHsgLi4uY29tbW9uLCBpZDogJ3dvcmtzcGFjZScsIG5hbWU6ICdXb3Jrc3BhY2UnLCBmb2xkZXJVcmk6IEZPTERFUi50b0pTT04oKSwgaXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9zYXZlZCcgfSxcblx0XHRcdFx0eyAuLi5jb21tb24sIGlkOiAnbGVnYWN5LXdvcmt0cmVlJywgbmFtZTogJ0xlZ2FjeSBXb3JrdHJlZScsIGZvbGRlclVyaTogRk9MREVSLnRvSlNPTigpLCBpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnIH0sXG5cdFx0XHRcdHsgLi4uY29tbW9uLCBpZDogJ3F1aWNrJywgbmFtZTogJ1F1aWNrJywgaXNRdWlja0NoYXQ6IHRydWUsIHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknIH0sXG5cdFx0XHRdLFxuXHRcdFx0cnVuczogW10sXG5cdFx0fSksIC0xLCAxKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLm1hcChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24udGFyZ2V0KSwgW1xuXHRcdFx0d29ya3NwYWNlVGFyZ2V0KEZPTERFUiwgeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6ICdmZWF0dXJlL3NhdmVkJyB9KSxcblx0XHRcdHdvcmtzcGFjZVRhcmdldChGT0xERVIsIHsga2luZDogJ2RlZmF1bHQnIH0pLFxuXHRcdFx0eyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRdKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlQXV0b21hdGlvbignd29ya3NwYWNlJywgeyBuYW1lOiAnVXBkYXRlZCcgfSk7XG5cdFx0Y29uc3QgbWlncmF0ZWQgPSBKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdjaGF0LmF1dG9tYXRpb25zLmxlZGdlcicsIC0xKSEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaWdyYXRlZC5zY2hlbWFWZXJzaW9uLCAzKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBmb2xkZXJVcmkgdGhyb3VnaCBwZXJzaXN0ZW5jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzaGFyZWRTdG9yYWdlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZpcnN0U2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzaGFyZWRTdG9yYWdlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlL3Byb2plY3QnKTtcblx0XHRhd2FpdCBmaXJzdFNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBkYWlseVNjaGVkdWxlKCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KHVyaSkgfSk7XG5cblx0XHRjb25zdCBzZWNvbmRTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHNoYXJlZFN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGNvbnN0IHJlbG9hZGVkID0gc2Vjb25kU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbG9hZGVkLnRhcmdldCwgd29ya3NwYWNlVGFyZ2V0KHVyaSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NhbCBkb2VzIG5vdCBpbnRlcmZlcmUgd2l0aCBsYXRlciBpbi1zdG9yZSByZWFkcycsICgpID0+IHtcblx0XHQvLyBKdXN0IHZlcmlmaWVzIHRoZSBuby1sZWFrZWQtZGlzcG9zYWJsZXMgaW52YXJpYW50IGluZGlyZWN0bHk6IGNyZWF0ZVxuXHRcdC8vIGEgc2VydmljZSBhbmQgbGV0IHRlYXJkb3duIGNsZWFuIGl0IHVwLiBGYWlsdXJlIHN1cmZhY2VzIGFzIGFcblx0XHQvLyBsZWFrZWQtZGlzcG9zYWJsZSBhc3NlcnRpb24gYXQgc3VpdGUgdGVhcmRvd24uXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIG5ldyBOdWxsTG9nU2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSwgW10pO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0IsY0FBYyxxQkFBcUI7QUFDcEUsU0FBUyw0QkFBNEI7QUFHckMsU0FBUywrQkFBK0I7QUFFeEMsTUFBTSxTQUFT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QUFNLFVBQVUsU0FBUyxJQUFJLHdCQUF3QixTQUFTLElBQUksZUFBZSxHQUFHLG9CQUFvQixDQUFDO0FBQ3pHLFdBQU8sZ0JBQWdCLFFBQVEsWUFBWSxJQUFJLEVBQUUsSUFBSSxnQkFBYyxXQUFXLE1BQU0sR0FBRztBQUFBLE1BQ3RGLGdCQUFnQixRQUFRLEVBQUUsTUFBTSxZQUFZLFFBQVEsZ0JBQWdCLENBQUM7QUFBQSxNQUNyRSxnQkFBZ0IsUUFBUSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDM0MsRUFBRSxNQUFNLGFBQWEsWUFBWSxvQkFBb0IsZUFBZSxhQUFhO0FBQUEsSUFDbEYsQ0FBQztBQUVELFVBQU0sUUFBUSxpQkFBaUIsYUFBYSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQy9ELFVBQU0sV0FBVyxLQUFLLE1BQU0sUUFBUSxJQUFJLDJCQUEyQixFQUFFLENBQUU7QUFDdkUsV0FBTyxZQUFZLFNBQVMsZUFBZSxDQUFDO0FBQUEsRUFDN0MsQ0FBQztBQUVELE9BQUssK0NBQStDLFlBQVk7QUFDL0QsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDL0QsVUFBTSxlQUFlLFNBQVMsSUFBSSx3QkFBd0IsZUFBZSxJQUFJLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztBQUNwSCxVQUFNLE1BQU0sSUFBSSxNQUFNLDJCQUEyQjtBQUNqRCxVQUFNLGFBQWEsaUJBQWlCLEVBQUUsTUFBTSxLQUFLLFFBQVEsS0FBSyxVQUFVLGNBQWMsR0FBRyxRQUFRLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztBQUV2SCxVQUFNLGdCQUFnQixTQUFTLElBQUksd0JBQXdCLGVBQWUsSUFBSSxlQUFlLEdBQUcsb0JBQW9CLENBQUM7QUFDckgsVUFBTSxXQUFXLGNBQWMsWUFBWSxJQUFJLEVBQUUsQ0FBQztBQUNsRCxXQUFPLGdCQUFnQixTQUFTLFFBQVEsZ0JBQWdCLEdBQUcsQ0FBQztBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBSW5FLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDdEQsVUFBTSxVQUFVLE1BQU0sSUFBSSx3QkFBd0IsU0FBUyxJQUFJLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztBQUN0RyxXQUFPLGdCQUFnQixRQUFRLFlBQVksSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNwRCxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
