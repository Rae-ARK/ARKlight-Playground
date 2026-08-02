import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { Emitter } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { AutomationSchedulerCore, CRASH_RECOVERY_REASON, RUN_TIMEOUT_REASON_PREFIX } from "../../browser/automationScheduler.js";
import { createAutomationService } from "./automationTestUtils.js";
const FOLDER = URI.parse("file:///workspace");
const TARGET = { kind: "workspace", folderUri: FOLDER, isolation: { kind: "default" } };
const SESSION_RESOURCE = "vscode-chat-session://copilot/sess-1";
class FakeLeaderElection {
  constructor(initial = true) {
    this.instanceId = "fake-leader-window";
    this._isLeader = observableValue(this, initial);
    this.isLeader = this._isLeader;
  }
  set(value) {
    this._isLeader.set(value, void 0);
  }
  evaluateForTesting() {
  }
  dispose() {
  }
}
class RecordingRunner {
  constructor(service) {
    this.service = service;
    this.runs = [];
  }
  runOnce(automation, trigger, leaderWindowId, _token) {
    this.runs.push({ automationId: automation.id, trigger });
    const operation = (async () => {
      const claim = await this.service.recordRunStart(automation.id, trigger, leaderWindowId);
      if (!claim.claimed) {
        return { kind: "alreadyRunning", activeRun: claim.run };
      }
      const run = await this.service.updateRun(claim.run.id, { status: "completed" }) ?? claim.run;
      return { kind: "started", run, sessionResource: SESSION_RESOURCE };
    })();
    return {
      whenDispatched: operation,
      whenCompleted: operation.then(() => void 0)
    };
  }
}
class SkippingRunner {
  constructor() {
    this.runs = [];
  }
  runOnce(automation, trigger) {
    this.runs.push({ automationId: automation.id, trigger });
    return {
      whenDispatched: Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" }),
      whenCompleted: Promise.resolve()
    };
  }
}
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
const T0 = /* @__PURE__ */ new Date("2025-06-01T00:00:00Z");
const T_PAST_DUE = /* @__PURE__ */ new Date("2025-06-01T02:00:00Z");
const T_TOMORROW = /* @__PURE__ */ new Date("2025-06-02T04:00:00Z");
suite("AutomationSchedulerCore", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(false);
    let now = T0;
    service.setClockForTesting(() => now);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => now
    }));
    return {
      service,
      runner,
      leader,
      core,
      setNow: (d) => {
        now = d;
      }
    };
  }
  test("does not run anything if there are no automations", async () => {
    const { core, runner, leader } = setup();
    leader.set(true);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.deepStrictEqual(runner.runs, []);
  });
  test("on becoming leader, runs catch-up for due automations exactly once", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    assert.strictEqual(runner.runs[0].automationId, a.id);
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
  });
  test("delayed scheduled ticks use trigger=schedule", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1, "first run should be catch-up");
    setNow(T_TOMORROW);
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 2);
    assert.strictEqual(runner.runs[1].trigger, "schedule");
  });
  test("disabled automations are not dispatched", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    await service.updateAutomation(a.id, { enabled: false });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.deepStrictEqual(runner.runs, []);
  });
  test("advances nextRunAt so the same automation is not picked up again on the next tick", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 1);
    const updated = service.getAutomation(a.id);
    assert.ok(updated?.nextRunAt);
    const next = Date.parse(updated.nextRunAt);
    assert.ok(next > T_PAST_DUE.getTime(), "nextRunAt should be after the tick that just fired");
  });
  test("does not report a run until the runner records its claim", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const leader = new FakeLeaderElection(false);
    const runner = new SkippingRunner();
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T_PAST_DUE
    }));
    leader.set(true);
    await core.waitForPendingRuns();
    assert.deepStrictEqual({
      dispatches: runner.runs.length,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt,
      runCount: service.runs.get().length
    }, {
      dispatches: 1,
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt,
      runCount: 0
    });
  });
  test("retries a still-due automation when target availability changes", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const runner = new SkippingRunner();
    const leader = new FakeLeaderElection(false);
    const onDidChangeTargetAvailability = teardown.add(new Emitter());
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T_PAST_DUE,
      onDidChangeTargetAvailability: onDidChangeTargetAvailability.event
    }));
    leader.set(true);
    await core.waitForPendingRuns();
    onDidChangeTargetAvailability.fire();
    await core.waitForPendingRuns();
    assert.deepStrictEqual({
      dispatches: runner.runs,
      lastRunAt: service.getAutomation(automation.id)?.lastRunAt,
      nextRunAt: service.getAutomation(automation.id)?.nextRunAt
    }, {
      dispatches: [
        { automationId: automation.id, trigger: "catch_up" },
        { automationId: automation.id, trigger: "schedule" }
      ],
      lastRunAt: void 0,
      nextRunAt: automation.nextRunAt
    });
  });
  test("does nothing while not leader", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    await core.waitForPendingRuns();
    await core.tickForTesting();
    assert.strictEqual(runner.runs.length, 0);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 1);
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
  });
  test("on becoming leader, fails any leftover pending/running runs as crash recovery", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const firstService = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    firstService.setClockForTesting(() => T0);
    const a = await firstService.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const run = (await firstService.recordRunStart(a.id, "manual", 1)).run;
    firstService.dispose();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(true);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T0
    }));
    await core.waitForPendingRuns();
    const recovered = service.runs.get().find((r) => r.id === run.id);
    assert.strictEqual(recovered?.status, "failed");
    assert.strictEqual(recovered?.errorMessage, CRASH_RECOVERY_REASON);
  });
  test("losing then regaining leadership re-runs catch-up", async () => {
    const { core, runner, service, leader, setNow } = setup();
    setNow(T0);
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    setNow(T_PAST_DUE);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs[0].trigger, "catch_up");
    leader.set(false);
    await core.waitForPendingRuns();
    setNow(T_TOMORROW);
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.runs.length, 2);
    assert.strictEqual(runner.runs[1].trigger, "catch_up");
  });
  test("toggling the feature setting off then on does not crash-recover in-progress runs", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    service.setClockForTesting(() => T0);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const inFlight = (await service.recordRunStart(a.id, "schedule", 1)).run;
    const runner = new RecordingRunner(service);
    const leader = new FakeLeaderElection(true);
    let enabled = true;
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => T0,
      isFeatureEnabled: () => enabled
    }));
    await core.waitForPendingRuns();
    await service.updateRun(inFlight.id, { status: "running" });
    enabled = false;
    await core.tickForTesting();
    enabled = true;
    await core.tickForTesting();
    const after = service.runs.get().find((r) => r.id === inFlight.id);
    assert.strictEqual(after?.status, "running", "feature-toggle off/on must not fail in-flight runs");
  });
  test("runOneWithTimeout: a hung run is cancelled, marked failed, and the next due automation still fires", async () => {
    const storage = teardown.add(new InMemoryStorageService());
    const log = new NullLogService();
    const service = teardown.add(createAutomationService(storage, log, NullTelemetryService));
    let now = T0;
    service.setClockForTesting(() => now);
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: TARGET });
    const b = await service.createAutomation({ name: "B", prompt: "q", schedule: hourly(), target: TARGET });
    let hungAutomationId;
    class HangingRunner {
      constructor() {
        this.hung = new DeferredPromise();
        this.calls = 0;
        this.cancelObserved = false;
      }
      runOnce(automation, trigger, leaderWindowId, token) {
        this.calls++;
        const whenCompleted = this._run(automation, trigger, leaderWindowId, token);
        return {
          whenDispatched: Promise.resolve({ kind: "notStarted", reason: "error" }),
          whenCompleted
        };
      }
      async _run(automation, trigger, leaderWindowId, token) {
        if (this.calls === 1) {
          hungAutomationId = automation.id;
          await service.recordRunStart(automation.id, trigger, leaderWindowId);
          const listener = token?.onCancellationRequested(() => {
            this.cancelObserved = true;
            const active = service.getActiveRunFor(automation.id);
            if (active) {
              void service.updateRun(active.id, {
                status: "failed",
                errorMessage: "Cancelled"
              });
            }
            this.hung.complete();
          });
          try {
            await this.hung.p;
          } finally {
            listener?.dispose();
          }
          return;
        }
        await service.recordRunStart(automation.id, trigger, leaderWindowId);
      }
    }
    const runner = new HangingRunner();
    const leader = new FakeLeaderElection(false);
    const core = teardown.add(new AutomationSchedulerCore(service, runner, storage, log, {
      leaderElection: leader,
      disableAutoTick: true,
      now: () => now,
      getRunTimeoutMs: () => 50
    }));
    now = T_PAST_DUE;
    leader.set(true);
    await core.waitForPendingRuns();
    assert.strictEqual(runner.calls, 2, "both A and B should have been dispatched");
    assert.strictEqual(runner.cancelObserved, true, "runner should observe cancellation on timeout");
    assert.ok(hungAutomationId, "runner should have recorded a hung automation id");
    const otherId = hungAutomationId === a.id ? b.id : a.id;
    const hungRun = service.runs.get().find((r) => r.automationId === hungAutomationId);
    assert.strictEqual(hungRun?.status, "failed");
    assert.ok(hungRun?.errorMessage?.startsWith(RUN_TIMEOUT_REASON_PREFIX), `expected timeout marker, got: ${hungRun?.errorMessage}`);
    const otherRun = service.runs.get().find((r) => r.automationId === otherId);
    assert.notStrictEqual(otherRun?.status, "failed");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25TY2hlZHVsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkxlYWRlckVsZWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uTGVhZGVyRWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5EaXNwYXRjaCwgSUF1dG9tYXRpb25SdW5uZXIsIElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZSwgQ1JBU0hfUkVDT1ZFUllfUkVBU09OLCBSVU5fVElNRU9VVF9SRUFTT05fUFJFRklYIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IEF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgQXV0b21hdGlvblRhcmdldCwgSUF1dG9tYXRpb24sIElBdXRvbWF0aW9uU2NoZWR1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hdXRvbWF0aW9uVGVzdFV0aWxzLmpzJztcblxuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuY29uc3QgVEFSR0VUOiBBdXRvbWF0aW9uVGFyZ2V0ID0geyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9O1xuY29uc3QgU0VTU0lPTl9SRVNPVVJDRSA9ICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vY29waWxvdC9zZXNzLTEnO1xuXG5jbGFzcyBGYWtlTGVhZGVyRWxlY3Rpb24gaW1wbGVtZW50cyBJQXV0b21hdGlvbkxlYWRlckVsZWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNMZWFkZXI6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzTGVhZGVyOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaW5zdGFuY2VJZCA9ICdmYWtlLWxlYWRlci13aW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKGluaXRpYWwgPSB0cnVlKSB7XG5cdFx0dGhpcy5faXNMZWFkZXIgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgaW5pdGlhbCk7XG5cdFx0dGhpcy5pc0xlYWRlciA9IHRoaXMuX2lzTGVhZGVyO1xuXHR9XG5cblx0c2V0KHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNMZWFkZXIuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZXZhbHVhdGVGb3JUZXN0aW5nKCk6IHZvaWQgeyAvKiBuby1vcCAqLyB9XG5cdGRpc3Bvc2UoKTogdm9pZCB7IC8qIG5vLW9wICovIH1cbn1cblxuaW50ZXJmYWNlIFJlY29yZGVkUnVuIHtcblx0cmVhZG9ubHkgYXV0b21hdGlvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyO1xufVxuXG5jbGFzcyBSZWNvcmRpbmdSdW5uZXIgaW1wbGVtZW50cyBJQXV0b21hdGlvblJ1bm5lciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHJ1bnM6IFJlY29yZGVkUnVuW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNlcnZpY2U6IEF1dG9tYXRpb25TZXJ2aWNlKSB7IH1cblxuXHRydW5PbmNlKFxuXHRcdGF1dG9tYXRpb246IElBdXRvbWF0aW9uLFxuXHRcdHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLFxuXHRcdGxlYWRlcldpbmRvd0lkOiBudW1iZXIsXG5cdFx0X3Rva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHR0aGlzLnJ1bnMucHVzaCh7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCwgdHJpZ2dlciB9KTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xhaW0gPSBhd2FpdCB0aGlzLnNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYXV0b21hdGlvbi5pZCwgdHJpZ2dlciwgbGVhZGVyV2luZG93SWQpO1xuXHRcdFx0aWYgKCFjbGFpbS5jbGFpbWVkKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhbHJlYWR5UnVubmluZycsIGFjdGl2ZVJ1bjogY2xhaW0ucnVuIH0gc2F0aXNmaWVzIElBdXRvbWF0aW9uUnVuRGlzcGF0Y2g7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBydW4gPSBhd2FpdCB0aGlzLnNlcnZpY2UudXBkYXRlUnVuKGNsYWltLnJ1bi5pZCwgeyBzdGF0dXM6ICdjb21wbGV0ZWQnIH0pID8/IGNsYWltLnJ1bjtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdzdGFydGVkJywgcnVuLCBzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UgfSBzYXRpc2ZpZXMgSUF1dG9tYXRpb25SdW5EaXNwYXRjaDtcblx0XHR9KSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR3aGVuRGlzcGF0Y2hlZDogb3BlcmF0aW9uLFxuXHRcdFx0d2hlbkNvbXBsZXRlZDogb3BlcmF0aW9uLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFNraXBwaW5nUnVubmVyIGltcGxlbWVudHMgSUF1dG9tYXRpb25SdW5uZXIge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBydW5zOiBSZWNvcmRlZFJ1bltdID0gW107XG5cblx0cnVuT25jZShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIpOiBJQXV0b21hdGlvblJ1bk9wZXJhdGlvbiB7XG5cdFx0dGhpcy5ydW5zLnB1c2goeyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsIHRyaWdnZXIgfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdoZW5EaXNwYXRjaGVkOiBQcm9taXNlLnJlc29sdmUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KSxcblx0XHRcdHdoZW5Db21wbGV0ZWQ6IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gaG91cmx5KCk6IElBdXRvbWF0aW9uU2NoZWR1bGUge1xuXHRyZXR1cm4geyBpbnRlcnZhbDogJ2hvdXJseScsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH07XG59XG5cbmNvbnN0IFQwID0gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDA6MDA6MDBaJyk7XG5jb25zdCBUX1BBU1RfRFVFID0gbmV3IERhdGUoJzIwMjUtMDYtMDFUMDI6MDA6MDBaJyk7XG5jb25zdCBUX1RPTU9SUk9XID0gbmV3IERhdGUoJzIwMjUtMDYtMDJUMDQ6MDA6MDBaJyk7XG5cbnN1aXRlKCdBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZScsICgpID0+IHtcblxuXHRjb25zdCB0ZWFyZG93biA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNldHVwKCkge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFJlY29yZGluZ1J1bm5lcihzZXJ2aWNlKTtcblx0XHQvLyBTdGFydCBhcyBub24tbGVhZGVyIHNvIGluZGl2aWR1YWwgdGVzdHMgY2FuIHNlZWQgYXV0b21hdGlvbnNcblx0XHQvLyBiZWZvcmUgdHJpZ2dlcmluZyB0aGUgbGVhZGVyJ3MgY2F0Y2gtdXAgcGFzcy5cblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlckVsZWN0aW9uKGZhbHNlKTtcblxuXHRcdGxldCBub3cgPSBUMDtcblx0XHRzZXJ2aWNlLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBub3cpO1xuXHRcdGNvbnN0IGNvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TY2hlZHVsZXJDb3JlKHNlcnZpY2UsIHJ1bm5lciwgc3RvcmFnZSwgbG9nLCB7XG5cdFx0XHRsZWFkZXJFbGVjdGlvbjogbGVhZGVyLFxuXHRcdFx0ZGlzYWJsZUF1dG9UaWNrOiB0cnVlLFxuXHRcdFx0bm93OiAoKSA9PiBub3csXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlcnZpY2UsIHJ1bm5lciwgbGVhZGVyLCBjb3JlLFxuXHRcdFx0c2V0Tm93OiAoZDogRGF0ZSkgPT4geyBub3cgPSBkOyB9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdkb2VzIG5vdCBydW4gYW55dGhpbmcgaWYgdGhlcmUgYXJlIG5vIGF1dG9tYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY29yZSwgcnVubmVyLCBsZWFkZXIgfSA9IHNldHVwKCk7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGF3YWl0IGNvcmUudGlja0ZvclRlc3RpbmcoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uIGJlY29taW5nIGxlYWRlciwgcnVucyBjYXRjaC11cCBmb3IgZHVlIGF1dG9tYXRpb25zIGV4YWN0bHkgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHQvLyBuZXh0UnVuQXQgaXMgVDArMWg7IGFkdmFuY2UgdGhlIGNsb2NrIHBhc3QgaXQgc28gdGhlIHJvdyBpcyBkdWUuXG5cdFx0c2V0Tm93KFRfUEFTVF9EVUUpO1xuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVuc1swXS5hdXRvbWF0aW9uSWQsIGEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVuc1swXS50cmlnZ2VyLCAnY2F0Y2hfdXAnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsYXllZCBzY2hlZHVsZWQgdGlja3MgdXNlIHRyaWdnZXI9c2NoZWR1bGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb3JlLCBydW5uZXIsIHNlcnZpY2UsIGxlYWRlciwgc2V0Tm93IH0gPSBzZXR1cCgpO1xuXHRcdHNldE5vdyhUMCk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IFRBUkdFVCB9KTtcblx0XHRzZXROb3coVF9QQVNUX0RVRSk7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDEsICdmaXJzdCBydW4gc2hvdWxkIGJlIGNhdGNoLXVwJyk7XG5cblx0XHRzZXROb3coVF9UT01PUlJPVyk7XG5cdFx0YXdhaXQgY29yZS50aWNrRm9yVGVzdGluZygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zWzFdLnRyaWdnZXIsICdzY2hlZHVsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlZCBhdXRvbWF0aW9ucyBhcmUgbm90IGRpc3BhdGNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb3JlLCBydW5uZXIsIHNlcnZpY2UsIGxlYWRlciwgc2V0Tm93IH0gPSBzZXR1cCgpO1xuXHRcdHNldE5vdyhUMCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVBdXRvbWF0aW9uKGEuaWQsIHsgZW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0c2V0Tm93KFRfUEFTVF9EVUUpO1xuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRhd2FpdCBjb3JlLnRpY2tGb3JUZXN0aW5nKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydW5uZXIucnVucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZHZhbmNlcyBuZXh0UnVuQXQgc28gdGhlIHNhbWUgYXV0b21hdGlvbiBpcyBub3QgcGlja2VkIHVwIGFnYWluIG9uIHRoZSBuZXh0IHRpY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjb3JlLCBydW5uZXIsIHNlcnZpY2UsIGxlYWRlciwgc2V0Tm93IH0gPSBzZXR1cCgpO1xuXHRcdHNldE5vdyhUMCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0c2V0Tm93KFRfUEFTVF9EVUUpO1xuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFRpY2sgYWdhaW4gaW1tZWRpYXRlbHkgLSBuZXh0UnVuQXQgd2FzIGFkdmFuY2VkLCBzbyB0aGVcblx0XHQvLyBhdXRvbWF0aW9uIGlzIG5vIGxvbmdlciBkdWUgYXQgdGhlIHNhbWUgYG5vd2AuXG5cdFx0YXdhaXQgY29yZS50aWNrRm9yVGVzdGluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIucnVucy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhLmlkKTtcblx0XHRhc3NlcnQub2sodXBkYXRlZD8ubmV4dFJ1bkF0KTtcblx0XHRjb25zdCBuZXh0ID0gRGF0ZS5wYXJzZSh1cGRhdGVkIS5uZXh0UnVuQXQhKTtcblx0XHRhc3NlcnQub2sobmV4dCA+IFRfUEFTVF9EVUUuZ2V0VGltZSgpLCAnbmV4dFJ1bkF0IHNob3VsZCBiZSBhZnRlciB0aGUgdGljayB0aGF0IGp1c3QgZmlyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVwb3J0IGEgcnVuIHVudGlsIHRoZSBydW5uZXIgcmVjb3JkcyBpdHMgY2xhaW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBUMCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0Y29uc3QgbGVhZGVyID0gbmV3IEZha2VMZWFkZXJFbGVjdGlvbihmYWxzZSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFNraXBwaW5nUnVubmVyKCk7XG5cdFx0Y29uc3QgY29yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblNjaGVkdWxlckNvcmUoc2VydmljZSwgcnVubmVyLCBzdG9yYWdlLCBsb2csIHtcblx0XHRcdGxlYWRlckVsZWN0aW9uOiBsZWFkZXIsXG5cdFx0XHRkaXNhYmxlQXV0b1RpY2s6IHRydWUsXG5cdFx0XHRub3c6ICgpID0+IFRfUEFTVF9EVUUsXG5cdFx0fSkpO1xuXG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwYXRjaGVzOiBydW5uZXIucnVucy5sZW5ndGgsXG5cdFx0XHRsYXN0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk/Lm5leHRSdW5BdCxcblx0XHRcdHJ1bkNvdW50OiBzZXJ2aWNlLnJ1bnMuZ2V0KCkubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGRpc3BhdGNoZXM6IDEsXG5cdFx0XHRsYXN0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHRcdG5leHRSdW5BdDogYXV0b21hdGlvbi5uZXh0UnVuQXQsXG5cdFx0XHRydW5Db3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyBhIHN0aWxsLWR1ZSBhdXRvbWF0aW9uIHdoZW4gdGFyZ2V0IGF2YWlsYWJpbGl0eSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IHRlYXJkb3duLmFkZChjcmVhdGVBdXRvbWF0aW9uU2VydmljZShzdG9yYWdlLCBsb2csIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0c2VydmljZS5zZXRDbG9ja0ZvclRlc3RpbmcoKCkgPT4gVDApO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBTa2lwcGluZ1J1bm5lcigpO1xuXHRcdGNvbnN0IGxlYWRlciA9IG5ldyBGYWtlTGVhZGVyRWxlY3Rpb24oZmFsc2UpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlVGFyZ2V0QXZhaWxhYmlsaXR5ID0gdGVhcmRvd24uYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IGNvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TY2hlZHVsZXJDb3JlKHNlcnZpY2UsIHJ1bm5lciwgc3RvcmFnZSwgbG9nLCB7XG5cdFx0XHRsZWFkZXJFbGVjdGlvbjogbGVhZGVyLFxuXHRcdFx0ZGlzYWJsZUF1dG9UaWNrOiB0cnVlLFxuXHRcdFx0bm93OiAoKSA9PiBUX1BBU1RfRFVFLFxuXHRcdFx0b25EaWRDaGFuZ2VUYXJnZXRBdmFpbGFiaWxpdHk6IG9uRGlkQ2hhbmdlVGFyZ2V0QXZhaWxhYmlsaXR5LmV2ZW50LFxuXHRcdH0pKTtcblxuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRvbkRpZENoYW5nZVRhcmdldEF2YWlsYWJpbGl0eS5maXJlKCk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcGF0Y2hlczogcnVubmVyLnJ1bnMsXG5cdFx0XHRsYXN0UnVuQXQ6IHNlcnZpY2UuZ2V0QXV0b21hdGlvbihhdXRvbWF0aW9uLmlkKT8ubGFzdFJ1bkF0LFxuXHRcdFx0bmV4dFJ1bkF0OiBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk/Lm5leHRSdW5BdCxcblx0XHR9LCB7XG5cdFx0XHRkaXNwYXRjaGVzOiBbXG5cdFx0XHRcdHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkLCB0cmlnZ2VyOiAnY2F0Y2hfdXAnIH0sXG5cdFx0XHRcdHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkLCB0cmlnZ2VyOiAnc2NoZWR1bGUnIH0sXG5cdFx0XHRdLFxuXHRcdFx0bGFzdFJ1bkF0OiB1bmRlZmluZWQsXG5cdFx0XHRuZXh0UnVuQXQ6IGF1dG9tYXRpb24ubmV4dFJ1bkF0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdGhpbmcgd2hpbGUgbm90IGxlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdHNldE5vdyhUX1BBU1RfRFVFKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXHRcdGF3YWl0IGNvcmUudGlja0ZvclRlc3RpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnMubGVuZ3RoLCAwKTtcblxuXHRcdGxlYWRlci5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLnJ1bnNbMF0udHJpZ2dlciwgJ2NhdGNoX3VwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uIGJlY29taW5nIGxlYWRlciwgZmFpbHMgYW55IGxlZnRvdmVyIHBlbmRpbmcvcnVubmluZyBydW5zIGFzIGNyYXNoIHJlY292ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSB0ZWFyZG93bi5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlyc3RTZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRmaXJzdFNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IFQwKTtcblx0XHRjb25zdCBhID0gYXdhaXQgZmlyc3RTZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdGNvbnN0IHJ1biA9IChhd2FpdCBmaXJzdFNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYS5pZCwgJ21hbnVhbCcsIDEpKS5ydW47XG5cdFx0Zmlyc3RTZXJ2aWNlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSB0ZWFyZG93bi5hZGQoY3JlYXRlQXV0b21hdGlvblNlcnZpY2Uoc3RvcmFnZSwgbG9nLCBOdWxsVGVsZW1ldHJ5U2VydmljZSkpO1xuXHRcdHNlcnZpY2Uuc2V0Q2xvY2tGb3JUZXN0aW5nKCgpID0+IFQwKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgUmVjb3JkaW5nUnVubmVyKHNlcnZpY2UpO1xuXHRcdGNvbnN0IGxlYWRlciA9IG5ldyBGYWtlTGVhZGVyRWxlY3Rpb24odHJ1ZSk7XG5cdFx0Y29uc3QgY29yZSA9IHRlYXJkb3duLmFkZChuZXcgQXV0b21hdGlvblNjaGVkdWxlckNvcmUoc2VydmljZSwgcnVubmVyLCBzdG9yYWdlLCBsb2csIHtcblx0XHRcdGxlYWRlckVsZWN0aW9uOiBsZWFkZXIsXG5cdFx0XHRkaXNhYmxlQXV0b1RpY2s6IHRydWUsXG5cdFx0XHRub3c6ICgpID0+IFQwLFxuXHRcdH0pKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0Y29uc3QgcmVjb3ZlcmVkID0gc2VydmljZS5ydW5zLmdldCgpLmZpbmQociA9PiByLmlkID09PSBydW4uaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvdmVyZWQ/LnN0YXR1cywgJ2ZhaWxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNvdmVyZWQ/LmVycm9yTWVzc2FnZSwgQ1JBU0hfUkVDT1ZFUllfUkVBU09OKTtcblx0fSk7XG5cblx0dGVzdCgnbG9zaW5nIHRoZW4gcmVnYWluaW5nIGxlYWRlcnNoaXAgcmUtcnVucyBjYXRjaC11cCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNvcmUsIHJ1bm5lciwgc2VydmljZSwgbGVhZGVyLCBzZXROb3cgfSA9IHNldHVwKCk7XG5cdFx0c2V0Tm93KFQwKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdHNldE5vdyhUX1BBU1RfRFVFKTtcblx0XHRsZWFkZXIuc2V0KHRydWUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zWzBdLnRyaWdnZXIsICdjYXRjaF91cCcpO1xuXG5cdFx0Ly8gTG9zZSBsZWFkZXJzaGlwLlxuXHRcdGxlYWRlci5zZXQoZmFsc2UpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cblx0XHQvLyBNYWtlIHRoZSByb3cgZHVlIGFnYWluLlxuXHRcdHNldE5vdyhUX1RPTU9SUk9XKTtcblxuXHRcdC8vIFJlZ2FpbiBpdCAtIHdlIHNob3VsZCBzZWUgYW5vdGhlciBjYXRjaC11cC5cblx0XHRsZWFkZXIuc2V0KHRydWUpO1xuXHRcdGF3YWl0IGNvcmUud2FpdEZvclBlbmRpbmdSdW5zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5ydW5zWzFdLnRyaWdnZXIsICdjYXRjaF91cCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGluZyB0aGUgZmVhdHVyZSBzZXR0aW5nIG9mZiB0aGVuIG9uIGRvZXMgbm90IGNyYXNoLXJlY292ZXIgaW4tcHJvZ3Jlc3MgcnVucycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZXByb2R1Y2UgdGhlIGJ1ZyB3aGVyZSBkaXNhYmxpbmcgdGhlIGZlYXR1cmUgcmVzZXQgdGhlXG5cdFx0Ly8gcGVyLWxlYWRlcnNoaXAgc3RhcnR1cCBmbGFnLCBjYXVzaW5nIGEgc3Vic2VxdWVudCByZS1lbmFibGVcblx0XHQvLyB0aWNrIHRvIGNhbGwgbWFya1N0YWxlUnVuc0ZhaWxlZCBhbmQgaW5jb3JyZWN0bHkgZmFpbCBhbnlcblx0XHQvLyBydW5zIHRoYXQgd2VyZSBhY3RpdmUgYWNyb3NzIHRoZSB0b2dnbGUuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblx0XHRzZXJ2aWNlLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBUMCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiBUQVJHRVQgfSk7XG5cdFx0Y29uc3QgaW5GbGlnaHQgPSAoYXdhaXQgc2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnc2NoZWR1bGUnLCAxKSkucnVuO1xuXG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFJlY29yZGluZ1J1bm5lcihzZXJ2aWNlKTtcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlckVsZWN0aW9uKHRydWUpO1xuXHRcdGxldCBlbmFibGVkID0gdHJ1ZTtcblx0XHRjb25zdCBjb3JlID0gdGVhcmRvd24uYWRkKG5ldyBBdXRvbWF0aW9uU2NoZWR1bGVyQ29yZShzZXJ2aWNlLCBydW5uZXIsIHN0b3JhZ2UsIGxvZywge1xuXHRcdFx0bGVhZGVyRWxlY3Rpb246IGxlYWRlcixcblx0XHRcdGRpc2FibGVBdXRvVGljazogdHJ1ZSxcblx0XHRcdG5vdzogKCkgPT4gVDAsXG5cdFx0XHRpc0ZlYXR1cmVFbmFibGVkOiAoKSA9PiBlbmFibGVkLFxuXHRcdH0pKTtcblx0XHQvLyBGaXJzdCB0aWNrIChhcyBsZWFkZXIsIGZlYXR1cmUgT04pIGRvZXMgc3RhcnR1cCByZWNvdmVyeSxcblx0XHQvLyB3aGljaCBieSBkZXNpZ24gZmFpbHMgdGhlIGluLWZsaWdodCByb3cuIFRlc3RzIGJlbG93IG9ubHlcblx0XHQvLyBjYXJlIHRoYXQgdGhlICpuZXh0KiBlbmFibGVcdTIxOTJkaXNhYmxlXHUyMTkyZW5hYmxlIGN5Y2xlIGRvZXMgbm90XG5cdFx0Ly8gcmVwZWF0IHRoYXQgcmVjb3ZlcnkuXG5cdFx0YXdhaXQgY29yZS53YWl0Rm9yUGVuZGluZ1J1bnMoKTtcblx0XHQvLyBSZXNldCB0aGUgcm93IGJhY2sgdG8gcnVubmluZyBzbyB3ZSBjYW4gb2JzZXJ2ZSB3aGV0aGVyIHRoZVxuXHRcdC8vIHRvZ2dsZSByZS10cmlnZ2VycyByZWNvdmVyeS4gTm90ZTogdXBkYXRlUnVuJ3MgcGF0Y2hcblx0XHQvLyBzZW1hbnRpY3MgdHJlYXQgdW5kZWZpbmVkIGZpZWxkcyBhcyBcIm5vIGNoYW5nZVwiLCBzbyB3ZVxuXHRcdC8vIGNhbm5vdCBjbGVhciBlcnJvck1lc3NhZ2UgZnJvbSBoZXJlOyBhc3NlcnQgb25seSBvbiBzdGF0dXMuXG5cdFx0YXdhaXQgc2VydmljZS51cGRhdGVSdW4oaW5GbGlnaHQuaWQsIHsgc3RhdHVzOiAncnVubmluZycgfSk7XG5cblx0XHRlbmFibGVkID0gZmFsc2U7XG5cdFx0YXdhaXQgY29yZS50aWNrRm9yVGVzdGluZygpO1xuXHRcdGVuYWJsZWQgPSB0cnVlO1xuXHRcdGF3YWl0IGNvcmUudGlja0ZvclRlc3RpbmcoKTtcblxuXHRcdC8vIFRoZSBpbi1mbGlnaHQgcnVuIG11c3Qgc3RpbGwgYmUgcnVubmluZy4gVGhlIGZlYXR1cmUgdG9nZ2xlXG5cdFx0Ly8gbXVzdCBOT1QgaGF2ZSByZS10cmlnZ2VyZWQgY3Jhc2ggcmVjb3ZlcnkuXG5cdFx0Y29uc3QgYWZ0ZXIgPSBzZXJ2aWNlLnJ1bnMuZ2V0KCkuZmluZChyID0+IHIuaWQgPT09IGluRmxpZ2h0LmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXI/LnN0YXR1cywgJ3J1bm5pbmcnLCAnZmVhdHVyZS10b2dnbGUgb2ZmL29uIG11c3Qgbm90IGZhaWwgaW4tZmxpZ2h0IHJ1bnMnKTtcblx0fSk7XG5cblx0dGVzdCgncnVuT25lV2l0aFRpbWVvdXQ6IGEgaHVuZyBydW4gaXMgY2FuY2VsbGVkLCBtYXJrZWQgZmFpbGVkLCBhbmQgdGhlIG5leHQgZHVlIGF1dG9tYXRpb24gc3RpbGwgZmlyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IHRlYXJkb3duLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gdGVhcmRvd24uYWRkKGNyZWF0ZUF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2UsIGxvZywgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblxuXHRcdGxldCBub3cgPSBUMDtcblx0XHRzZXJ2aWNlLnNldENsb2NrRm9yVGVzdGluZygoKSA9PiBub3cpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXHRcdGNvbnN0IGIgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQicsIHByb21wdDogJ3EnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogVEFSR0VUIH0pO1xuXG5cdFx0Ly8gVGhlIGZpcnN0IHJ1biBoYW5ncyB1bnRpbCBjYW5jZWxsYXRpb24gYW5kIHRyaWVzIHRvIHJlY29yZCBgQ2FuY2VsbGVkYCxcblx0XHQvLyBtYXRjaGluZyB0aGUgcmVhbCBydW5uZXIncyB0aW1lb3V0IGJlaGF2aW9yLlxuXHRcdGxldCBodW5nQXV0b21hdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y2xhc3MgSGFuZ2luZ1J1bm5lciBpbXBsZW1lbnRzIElBdXRvbWF0aW9uUnVubmVyIHtcblx0XHRcdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRcdFx0cmVhZG9ubHkgaHVuZyA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNhbGxzID0gMDtcblx0XHRcdGNhbmNlbE9ic2VydmVkID0gZmFsc2U7XG5cdFx0XHRydW5PbmNlKGF1dG9tYXRpb246IElBdXRvbWF0aW9uLCB0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgbGVhZGVyV2luZG93SWQ6IG51bWJlciwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHRcdFx0dGhpcy5jYWxscysrO1xuXHRcdFx0XHRjb25zdCB3aGVuQ29tcGxldGVkID0gdGhpcy5fcnVuKGF1dG9tYXRpb24sIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2UucmVzb2x2ZSh7IGtpbmQ6ICdub3RTdGFydGVkJywgcmVhc29uOiAnZXJyb3InIH0pLFxuXHRcdFx0XHRcdHdoZW5Db21wbGV0ZWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHByaXZhdGUgYXN5bmMgX3J1bihhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGxlYWRlcldpbmRvd0lkOiBudW1iZXIsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRodW5nQXV0b21hdGlvbklkID0gYXV0b21hdGlvbi5pZDtcblx0XHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmNhbmNlbE9ic2VydmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZSA9IHNlcnZpY2UuZ2V0QWN0aXZlUnVuRm9yKGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRcdFx0XHR2b2lkIHNlcnZpY2UudXBkYXRlUnVuKGFjdGl2ZS5pZCwge1xuXHRcdFx0XHRcdFx0XHRcdHN0YXR1czogJ2ZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiAnQ2FuY2VsbGVkJyxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmh1bmcuY29tcGxldGUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5odW5nLnA7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsIHRyaWdnZXIsIGxlYWRlcldpbmRvd0lkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IEhhbmdpbmdSdW5uZXIoKTtcblx0XHRjb25zdCBsZWFkZXIgPSBuZXcgRmFrZUxlYWRlckVsZWN0aW9uKGZhbHNlKTtcblxuXHRcdC8vIFVzZSBhIHZlcnkgc2hvcnQgdGltZW91dCBzbyB0aGUgdGVzdCBmaW5pc2hlcyBxdWlja2x5LlxuXHRcdGNvbnN0IGNvcmUgPSB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TY2hlZHVsZXJDb3JlKHNlcnZpY2UsIHJ1bm5lciwgc3RvcmFnZSwgbG9nLCB7XG5cdFx0XHRsZWFkZXJFbGVjdGlvbjogbGVhZGVyLFxuXHRcdFx0ZGlzYWJsZUF1dG9UaWNrOiB0cnVlLFxuXHRcdFx0bm93OiAoKSA9PiBub3csXG5cdFx0XHRnZXRSdW5UaW1lb3V0TXM6ICgpID0+IDUwLFxuXHRcdH0pKTtcblxuXHRcdG5vdyA9IFRfUEFTVF9EVUU7XG5cdFx0bGVhZGVyLnNldCh0cnVlKTtcblx0XHRhd2FpdCBjb3JlLndhaXRGb3JQZW5kaW5nUnVucygpO1xuXG5cdFx0Ly8gQm90aCBBIGFuZCBCIHNob3VsZCBoYXZlIGJlZW4gZGlzcGF0Y2hlZCAodGhlIHNlY29uZCB3YXNcblx0XHQvLyBub3QgYmxvY2tlZCBieSB0aGUgZmlyc3QncyBoYW5nKS4gVGhlIGh1bmcgYXV0b21hdGlvbidzIHJ1blxuXHRcdC8vIHJvdyBtdXN0IGJlIGZhaWxlZCB3aXRoIHRoZSB0aW1lb3V0IHJlYXNvbjsgdGhlIHJ1bm5lciBtdXN0XG5cdFx0Ly8gaGF2ZSBvYnNlcnZlZCBjYW5jZWxsYXRpb24uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5jYWxscywgMiwgJ2JvdGggQSBhbmQgQiBzaG91bGQgaGF2ZSBiZWVuIGRpc3BhdGNoZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLmNhbmNlbE9ic2VydmVkLCB0cnVlLCAncnVubmVyIHNob3VsZCBvYnNlcnZlIGNhbmNlbGxhdGlvbiBvbiB0aW1lb3V0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGh1bmdBdXRvbWF0aW9uSWQsICdydW5uZXIgc2hvdWxkIGhhdmUgcmVjb3JkZWQgYSBodW5nIGF1dG9tYXRpb24gaWQnKTtcblx0XHRjb25zdCBvdGhlcklkID0gaHVuZ0F1dG9tYXRpb25JZCA9PT0gYS5pZCA/IGIuaWQgOiBhLmlkO1xuXHRcdGNvbnN0IGh1bmdSdW4gPSBzZXJ2aWNlLnJ1bnMuZ2V0KCkuZmluZChyID0+IHIuYXV0b21hdGlvbklkID09PSBodW5nQXV0b21hdGlvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaHVuZ1J1bj8uc3RhdHVzLCAnZmFpbGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGh1bmdSdW4/LmVycm9yTWVzc2FnZT8uc3RhcnRzV2l0aChSVU5fVElNRU9VVF9SRUFTT05fUFJFRklYKSwgYGV4cGVjdGVkIHRpbWVvdXQgbWFya2VyLCBnb3Q6ICR7aHVuZ1J1bj8uZXJyb3JNZXNzYWdlfWApO1xuXHRcdC8vIFRoZSBub24taHVuZyBhdXRvbWF0aW9uJ3Mgcm93IHNob3VsZCBOT1QgaGF2ZSBiZWVuIHRvdWNoZWRcblx0XHQvLyBieSB0aGUgdGltZW91dCBwYXRoLlxuXHRcdGNvbnN0IG90aGVyUnVuID0gc2VydmljZS5ydW5zLmdldCgpLmZpbmQociA9PiByLmF1dG9tYXRpb25JZCA9PT0gb3RoZXJJZCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKG90aGVyUnVuPy5zdGF0dXMsICdmYWlsZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBMkMsdUJBQXVCO0FBQ2xFLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLHlCQUF5Qix1QkFBdUIsaUNBQWlDO0FBRzFGLFNBQVMsK0JBQStCO0FBRXhDLE1BQU0sU0FBUyxJQUFJLE1BQU0sbUJBQW1CO0FBQzVDLE1BQU0sU0FBMkIsRUFBRSxNQUFNLGFBQWEsV0FBVyxRQUFRLFdBQVcsRUFBRSxNQUFNLFVBQVUsRUFBRTtBQUN4RyxNQUFNLG1CQUFtQjtBQUV6QixNQUFNLG1CQUF3RDtBQUFBLEVBSzdELFlBQVksVUFBVSxNQUFNO0FBRjVCLFNBQVMsYUFBYTtBQUdyQixTQUFLLFlBQVksZ0JBQXlCLE1BQU0sT0FBTztBQUN2RCxTQUFLLFdBQVcsS0FBSztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxJQUFJLE9BQXNCO0FBQ3pCLFNBQUssVUFBVSxJQUFJLE9BQU8sTUFBUztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxxQkFBMkI7QUFBQSxFQUFjO0FBQUEsRUFDekMsVUFBZ0I7QUFBQSxFQUFjO0FBQy9CO0FBT0EsTUFBTSxnQkFBNkM7QUFBQSxFQUtsRCxZQUE2QixTQUE0QjtBQUE1QjtBQUY3QixTQUFTLE9BQXNCLENBQUM7QUFBQSxFQUUyQjtBQUFBLEVBRTNELFFBQ0MsWUFDQSxTQUNBLGdCQUNBLFFBQzBCO0FBQzFCLFNBQUssS0FBSyxLQUFLLEVBQUUsY0FBYyxXQUFXLElBQUksUUFBUSxDQUFDO0FBQ3ZELFVBQU0sYUFBYSxZQUFZO0FBQzlCLFlBQU0sUUFBUSxNQUFNLEtBQUssUUFBUSxlQUFlLFdBQVcsSUFBSSxTQUFTLGNBQWM7QUFDdEYsVUFBSSxDQUFDLE1BQU0sU0FBUztBQUNuQixlQUFPLEVBQUUsTUFBTSxrQkFBa0IsV0FBVyxNQUFNLElBQUk7QUFBQSxNQUN2RDtBQUNBLFlBQU0sTUFBTSxNQUFNLEtBQUssUUFBUSxVQUFVLE1BQU0sSUFBSSxJQUFJLEVBQUUsUUFBUSxZQUFZLENBQUMsS0FBSyxNQUFNO0FBQ3pGLGFBQU8sRUFBRSxNQUFNLFdBQVcsS0FBSyxpQkFBaUIsaUJBQWlCO0FBQUEsSUFDbEUsR0FBRztBQUNILFdBQU87QUFBQSxNQUNOLGdCQUFnQjtBQUFBLE1BQ2hCLGVBQWUsVUFBVSxLQUFLLE1BQU0sTUFBUztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxlQUE0QztBQUFBLEVBQWxEO0FBR0MsU0FBUyxPQUFzQixDQUFDO0FBQUE7QUFBQSxFQUVoQyxRQUFRLFlBQXlCLFNBQXdEO0FBQ3hGLFNBQUssS0FBSyxLQUFLLEVBQUUsY0FBYyxXQUFXLElBQUksUUFBUSxDQUFDO0FBQ3ZELFdBQU87QUFBQSxNQUNOLGdCQUFnQixRQUFRLFFBQVEsRUFBRSxNQUFNLGNBQWMsUUFBUSxvQkFBb0IsQ0FBQztBQUFBLE1BQ25GLGVBQWUsUUFBUSxRQUFRO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLFNBQThCO0FBQ3RDLFNBQU8sRUFBRSxVQUFVLFVBQVUsY0FBYyxHQUFHLGdCQUFnQixHQUFHLGFBQWEsRUFBRTtBQUNqRjtBQUVBLE1BQU0sS0FBSyxvQkFBSSxLQUFLLHNCQUFzQjtBQUMxQyxNQUFNLGFBQWEsb0JBQUksS0FBSyxzQkFBc0I7QUFDbEQsTUFBTSxhQUFhLG9CQUFJLEtBQUssc0JBQXNCO0FBRWxELE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsUUFBTSxXQUFXLHdDQUF3QztBQUV6RCxXQUFTLFFBQVE7QUFDaEIsVUFBTSxVQUFVLFNBQVMsSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3pELFVBQU0sTUFBTSxJQUFJLGVBQWU7QUFDL0IsVUFBTSxVQUFVLFNBQVMsSUFBSSx3QkFBd0IsU0FBUyxLQUFLLG9CQUFvQixDQUFDO0FBQ3hGLFVBQU0sU0FBUyxJQUFJLGdCQUFnQixPQUFPO0FBRzFDLFVBQU0sU0FBUyxJQUFJLG1CQUFtQixLQUFLO0FBRTNDLFFBQUksTUFBTTtBQUNWLFlBQVEsbUJBQW1CLE1BQU0sR0FBRztBQUNwQyxVQUFNLE9BQU8sU0FBUyxJQUFJLElBQUksd0JBQXdCLFNBQVMsUUFBUSxTQUFTLEtBQUs7QUFBQSxNQUNwRixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixLQUFLLE1BQU07QUFBQSxJQUNaLENBQUMsQ0FBQztBQUVGLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFBUztBQUFBLE1BQVE7QUFBQSxNQUFRO0FBQUEsTUFDekIsUUFBUSxDQUFDLE1BQVk7QUFBRSxjQUFNO0FBQUEsTUFBRztBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUVBLE9BQUsscURBQXFELFlBQVk7QUFDckUsVUFBTSxFQUFFLE1BQU0sUUFBUSxPQUFPLElBQUksTUFBTTtBQUN2QyxXQUFPLElBQUksSUFBSTtBQUNmLFVBQU0sS0FBSyxtQkFBbUI7QUFDOUIsVUFBTSxLQUFLLGVBQWU7QUFDMUIsV0FBTyxnQkFBZ0IsT0FBTyxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ3ZDLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sRUFBRSxNQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU8sSUFBSSxNQUFNO0FBQ3hELFdBQU8sRUFBRTtBQUNULFVBQU0sSUFBSSxNQUFNLFFBQVEsaUJBQWlCLEVBQUUsTUFBTSxLQUFLLFFBQVEsS0FBSyxVQUFVLE9BQU8sR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUV2RyxXQUFPLFVBQVU7QUFDakIsV0FBTyxJQUFJLElBQUk7QUFDZixVQUFNLEtBQUssbUJBQW1CO0FBRTlCLFdBQU8sWUFBWSxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxPQUFPLEtBQUssQ0FBQyxFQUFFLGNBQWMsRUFBRSxFQUFFO0FBQ3BELFdBQU8sWUFBWSxPQUFPLEtBQUssQ0FBQyxFQUFFLFNBQVMsVUFBVTtBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxZQUFZO0FBQ2hFLFVBQU0sRUFBRSxNQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU8sSUFBSSxNQUFNO0FBQ3hELFdBQU8sRUFBRTtBQUNULFVBQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQzdGLFdBQU8sVUFBVTtBQUNqQixXQUFPLElBQUksSUFBSTtBQUNmLFVBQU0sS0FBSyxtQkFBbUI7QUFDOUIsV0FBTyxZQUFZLE9BQU8sS0FBSyxRQUFRLEdBQUcsOEJBQThCO0FBRXhFLFdBQU8sVUFBVTtBQUNqQixVQUFNLEtBQUssZUFBZTtBQUUxQixXQUFPLFlBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUN4QyxXQUFPLFlBQVksT0FBTyxLQUFLLENBQUMsRUFBRSxTQUFTLFVBQVU7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsWUFBWTtBQUMzRCxVQUFNLEVBQUUsTUFBTSxRQUFRLFNBQVMsUUFBUSxPQUFPLElBQUksTUFBTTtBQUN4RCxXQUFPLEVBQUU7QUFDVCxVQUFNLElBQUksTUFBTSxRQUFRLGlCQUFpQixFQUFFLE1BQU0sS0FBSyxRQUFRLEtBQUssVUFBVSxPQUFPLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFDdkcsVUFBTSxRQUFRLGlCQUFpQixFQUFFLElBQUksRUFBRSxTQUFTLE1BQU0sQ0FBQztBQUN2RCxXQUFPLFVBQVU7QUFDakIsV0FBTyxJQUFJLElBQUk7QUFDZixVQUFNLEtBQUssbUJBQW1CO0FBQzlCLFVBQU0sS0FBSyxlQUFlO0FBQzFCLFdBQU8sZ0JBQWdCLE9BQU8sTUFBTSxDQUFDLENBQUM7QUFBQSxFQUN2QyxDQUFDO0FBRUQsT0FBSyxxRkFBcUYsWUFBWTtBQUNyRyxVQUFNLEVBQUUsTUFBTSxRQUFRLFNBQVMsUUFBUSxPQUFPLElBQUksTUFBTTtBQUN4RCxXQUFPLEVBQUU7QUFDVCxVQUFNLElBQUksTUFBTSxRQUFRLGlCQUFpQixFQUFFLE1BQU0sS0FBSyxRQUFRLEtBQUssVUFBVSxPQUFPLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFDdkcsV0FBTyxVQUFVO0FBQ2pCLFdBQU8sSUFBSSxJQUFJO0FBQ2YsVUFBTSxLQUFLLG1CQUFtQjtBQUM5QixXQUFPLFlBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUl4QyxVQUFNLEtBQUssZUFBZTtBQUMxQixXQUFPLFlBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUV4QyxVQUFNLFVBQVUsUUFBUSxjQUFjLEVBQUUsRUFBRTtBQUMxQyxXQUFPLEdBQUcsU0FBUyxTQUFTO0FBQzVCLFVBQU0sT0FBTyxLQUFLLE1BQU0sUUFBUyxTQUFVO0FBQzNDLFdBQU8sR0FBRyxPQUFPLFdBQVcsUUFBUSxHQUFHLG9EQUFvRDtBQUFBLEVBQzVGLENBQUM7QUFFRCxPQUFLLDREQUE0RCxZQUFZO0FBQzVFLFVBQU0sVUFBVSxTQUFTLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFVBQU0sVUFBVSxTQUFTLElBQUksd0JBQXdCLFNBQVMsS0FBSyxvQkFBb0IsQ0FBQztBQUN4RixZQUFRLG1CQUFtQixNQUFNLEVBQUU7QUFDbkMsVUFBTSxhQUFhLE1BQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQ2hILFVBQU0sU0FBUyxJQUFJLG1CQUFtQixLQUFLO0FBQzNDLFVBQU0sU0FBUyxJQUFJLGVBQWU7QUFDbEMsVUFBTSxPQUFPLFNBQVMsSUFBSSxJQUFJLHdCQUF3QixTQUFTLFFBQVEsU0FBUyxLQUFLO0FBQUEsTUFDcEYsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsS0FBSyxNQUFNO0FBQUEsSUFDWixDQUFDLENBQUM7QUFFRixXQUFPLElBQUksSUFBSTtBQUNmLFVBQU0sS0FBSyxtQkFBbUI7QUFFOUIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLE9BQU8sS0FBSztBQUFBLE1BQ3hCLFdBQVcsUUFBUSxjQUFjLFdBQVcsRUFBRSxHQUFHO0FBQUEsTUFDakQsV0FBVyxRQUFRLGNBQWMsV0FBVyxFQUFFLEdBQUc7QUFBQSxNQUNqRCxVQUFVLFFBQVEsS0FBSyxJQUFJLEVBQUU7QUFBQSxJQUM5QixHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixXQUFXO0FBQUEsTUFDWCxXQUFXLFdBQVc7QUFBQSxNQUN0QixVQUFVO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsWUFBWTtBQUNuRixVQUFNLFVBQVUsU0FBUyxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFVBQVUsU0FBUyxJQUFJLHdCQUF3QixTQUFTLEtBQUssb0JBQW9CLENBQUM7QUFDeEYsWUFBUSxtQkFBbUIsTUFBTSxFQUFFO0FBQ25DLFVBQU0sYUFBYSxNQUFNLFFBQVEsaUJBQWlCLEVBQUUsTUFBTSxLQUFLLFFBQVEsS0FBSyxVQUFVLE9BQU8sR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUNoSCxVQUFNLFNBQVMsSUFBSSxlQUFlO0FBQ2xDLFVBQU0sU0FBUyxJQUFJLG1CQUFtQixLQUFLO0FBQzNDLFVBQU0sZ0NBQWdDLFNBQVMsSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUN0RSxVQUFNLE9BQU8sU0FBUyxJQUFJLElBQUksd0JBQXdCLFNBQVMsUUFBUSxTQUFTLEtBQUs7QUFBQSxNQUNwRixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixLQUFLLE1BQU07QUFBQSxNQUNYLCtCQUErQiw4QkFBOEI7QUFBQSxJQUM5RCxDQUFDLENBQUM7QUFFRixXQUFPLElBQUksSUFBSTtBQUNmLFVBQU0sS0FBSyxtQkFBbUI7QUFDOUIsa0NBQThCLEtBQUs7QUFDbkMsVUFBTSxLQUFLLG1CQUFtQjtBQUU5QixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksT0FBTztBQUFBLE1BQ25CLFdBQVcsUUFBUSxjQUFjLFdBQVcsRUFBRSxHQUFHO0FBQUEsTUFDakQsV0FBVyxRQUFRLGNBQWMsV0FBVyxFQUFFLEdBQUc7QUFBQSxJQUNsRCxHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsUUFDWCxFQUFFLGNBQWMsV0FBVyxJQUFJLFNBQVMsV0FBVztBQUFBLFFBQ25ELEVBQUUsY0FBYyxXQUFXLElBQUksU0FBUyxXQUFXO0FBQUEsTUFDcEQ7QUFBQSxNQUNBLFdBQVc7QUFBQSxNQUNYLFdBQVcsV0FBVztBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlDQUFpQyxZQUFZO0FBQ2pELFVBQU0sRUFBRSxNQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU8sSUFBSSxNQUFNO0FBQ3hELFdBQU8sRUFBRTtBQUNULFVBQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQzdGLFdBQU8sVUFBVTtBQUNqQixVQUFNLEtBQUssbUJBQW1CO0FBQzlCLFVBQU0sS0FBSyxlQUFlO0FBQzFCLFdBQU8sWUFBWSxPQUFPLEtBQUssUUFBUSxDQUFDO0FBRXhDLFdBQU8sSUFBSSxJQUFJO0FBQ2YsVUFBTSxLQUFLLG1CQUFtQjtBQUM5QixXQUFPLFlBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUN4QyxXQUFPLFlBQVksT0FBTyxLQUFLLENBQUMsRUFBRSxTQUFTLFVBQVU7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLFVBQVUsU0FBUyxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLGVBQWUsU0FBUyxJQUFJLHdCQUF3QixTQUFTLEtBQUssb0JBQW9CLENBQUM7QUFDN0YsaUJBQWEsbUJBQW1CLE1BQU0sRUFBRTtBQUN4QyxVQUFNLElBQUksTUFBTSxhQUFhLGlCQUFpQixFQUFFLE1BQU0sS0FBSyxRQUFRLEtBQUssVUFBVSxPQUFPLEdBQUcsUUFBUSxPQUFPLENBQUM7QUFDNUcsVUFBTSxPQUFPLE1BQU0sYUFBYSxlQUFlLEVBQUUsSUFBSSxVQUFVLENBQUMsR0FBRztBQUNuRSxpQkFBYSxRQUFRO0FBRXJCLFVBQU0sVUFBVSxTQUFTLElBQUksd0JBQXdCLFNBQVMsS0FBSyxvQkFBb0IsQ0FBQztBQUN4RixZQUFRLG1CQUFtQixNQUFNLEVBQUU7QUFDbkMsVUFBTSxTQUFTLElBQUksZ0JBQWdCLE9BQU87QUFDMUMsVUFBTSxTQUFTLElBQUksbUJBQW1CLElBQUk7QUFDMUMsVUFBTSxPQUFPLFNBQVMsSUFBSSxJQUFJLHdCQUF3QixTQUFTLFFBQVEsU0FBUyxLQUFLO0FBQUEsTUFDcEYsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsS0FBSyxNQUFNO0FBQUEsSUFDWixDQUFDLENBQUM7QUFDRixVQUFNLEtBQUssbUJBQW1CO0FBRTlCLFVBQU0sWUFBWSxRQUFRLEtBQUssSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE9BQU8sSUFBSSxFQUFFO0FBQzlELFdBQU8sWUFBWSxXQUFXLFFBQVEsUUFBUTtBQUM5QyxXQUFPLFlBQVksV0FBVyxjQUFjLHFCQUFxQjtBQUFBLEVBQ2xFLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFVBQU0sRUFBRSxNQUFNLFFBQVEsU0FBUyxRQUFRLE9BQU8sSUFBSSxNQUFNO0FBQ3hELFdBQU8sRUFBRTtBQUNULFVBQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQzdGLFdBQU8sVUFBVTtBQUNqQixXQUFPLElBQUksSUFBSTtBQUNmLFVBQU0sS0FBSyxtQkFBbUI7QUFDOUIsV0FBTyxZQUFZLE9BQU8sS0FBSyxDQUFDLEVBQUUsU0FBUyxVQUFVO0FBR3JELFdBQU8sSUFBSSxLQUFLO0FBQ2hCLFVBQU0sS0FBSyxtQkFBbUI7QUFHOUIsV0FBTyxVQUFVO0FBR2pCLFdBQU8sSUFBSSxJQUFJO0FBQ2YsVUFBTSxLQUFLLG1CQUFtQjtBQUM5QixXQUFPLFlBQVksT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUN4QyxXQUFPLFlBQVksT0FBTyxLQUFLLENBQUMsRUFBRSxTQUFTLFVBQVU7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsWUFBWTtBQUtwRyxVQUFNLFVBQVUsU0FBUyxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDekQsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixVQUFNLFVBQVUsU0FBUyxJQUFJLHdCQUF3QixTQUFTLEtBQUssb0JBQW9CLENBQUM7QUFDeEYsWUFBUSxtQkFBbUIsTUFBTSxFQUFFO0FBQ25DLFVBQU0sSUFBSSxNQUFNLFFBQVEsaUJBQWlCLEVBQUUsTUFBTSxLQUFLLFFBQVEsS0FBSyxVQUFVLE9BQU8sR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUN2RyxVQUFNLFlBQVksTUFBTSxRQUFRLGVBQWUsRUFBRSxJQUFJLFlBQVksQ0FBQyxHQUFHO0FBRXJFLFVBQU0sU0FBUyxJQUFJLGdCQUFnQixPQUFPO0FBQzFDLFVBQU0sU0FBUyxJQUFJLG1CQUFtQixJQUFJO0FBQzFDLFFBQUksVUFBVTtBQUNkLFVBQU0sT0FBTyxTQUFTLElBQUksSUFBSSx3QkFBd0IsU0FBUyxRQUFRLFNBQVMsS0FBSztBQUFBLE1BQ3BGLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLEtBQUssTUFBTTtBQUFBLE1BQ1gsa0JBQWtCLE1BQU07QUFBQSxJQUN6QixDQUFDLENBQUM7QUFLRixVQUFNLEtBQUssbUJBQW1CO0FBSzlCLFVBQU0sUUFBUSxVQUFVLFNBQVMsSUFBSSxFQUFFLFFBQVEsVUFBVSxDQUFDO0FBRTFELGNBQVU7QUFDVixVQUFNLEtBQUssZUFBZTtBQUMxQixjQUFVO0FBQ1YsVUFBTSxLQUFLLGVBQWU7QUFJMUIsVUFBTSxRQUFRLFFBQVEsS0FBSyxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxTQUFTLEVBQUU7QUFDL0QsV0FBTyxZQUFZLE9BQU8sUUFBUSxXQUFXLG9EQUFvRDtBQUFBLEVBQ2xHLENBQUM7QUFFRCxPQUFLLHNHQUFzRyxZQUFZO0FBQ3RILFVBQU0sVUFBVSxTQUFTLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUN6RCxVQUFNLE1BQU0sSUFBSSxlQUFlO0FBQy9CLFVBQU0sVUFBVSxTQUFTLElBQUksd0JBQXdCLFNBQVMsS0FBSyxvQkFBb0IsQ0FBQztBQUV4RixRQUFJLE1BQU07QUFDVixZQUFRLG1CQUFtQixNQUFNLEdBQUc7QUFDcEMsVUFBTSxJQUFJLE1BQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsT0FBTyxDQUFDO0FBQ3ZHLFVBQU0sSUFBSSxNQUFNLFFBQVEsaUJBQWlCLEVBQUUsTUFBTSxLQUFLLFFBQVEsS0FBSyxVQUFVLE9BQU8sR0FBRyxRQUFRLE9BQU8sQ0FBQztBQUl2RyxRQUFJO0FBQUEsSUFDSixNQUFNLGNBQTJDO0FBQUEsTUFBakQ7QUFFQyxhQUFTLE9BQU8sSUFBSSxnQkFBc0I7QUFDMUMscUJBQVE7QUFDUiw4QkFBaUI7QUFBQTtBQUFBLE1BQ2pCLFFBQVEsWUFBeUIsU0FBK0IsZ0JBQXdCLE9BQW9EO0FBQzNJLGFBQUs7QUFDTCxjQUFNLGdCQUFnQixLQUFLLEtBQUssWUFBWSxTQUFTLGdCQUFnQixLQUFLO0FBQzFFLGVBQU87QUFBQSxVQUNOLGdCQUFnQixRQUFRLFFBQVEsRUFBRSxNQUFNLGNBQWMsUUFBUSxRQUFRLENBQUM7QUFBQSxVQUN2RTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFFQSxNQUFjLEtBQUssWUFBeUIsU0FBK0IsZ0JBQXdCLE9BQTBDO0FBQzVJLFlBQUksS0FBSyxVQUFVLEdBQUc7QUFDckIsNkJBQW1CLFdBQVc7QUFDOUIsZ0JBQU0sUUFBUSxlQUFlLFdBQVcsSUFBSSxTQUFTLGNBQWM7QUFDbkUsZ0JBQU0sV0FBVyxPQUFPLHdCQUF3QixNQUFNO0FBQ3JELGlCQUFLLGlCQUFpQjtBQUN0QixrQkFBTSxTQUFTLFFBQVEsZ0JBQWdCLFdBQVcsRUFBRTtBQUNwRCxnQkFBSSxRQUFRO0FBQ1gsbUJBQUssUUFBUSxVQUFVLE9BQU8sSUFBSTtBQUFBLGdCQUNqQyxRQUFRO0FBQUEsZ0JBQ1IsY0FBYztBQUFBLGNBQ2YsQ0FBQztBQUFBLFlBQ0Y7QUFDQSxpQkFBSyxLQUFLLFNBQVM7QUFBQSxVQUNwQixDQUFDO0FBQ0QsY0FBSTtBQUNILGtCQUFNLEtBQUssS0FBSztBQUFBLFVBQ2pCLFVBQUU7QUFDRCxzQkFBVSxRQUFRO0FBQUEsVUFDbkI7QUFDQTtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFFBQVEsZUFBZSxXQUFXLElBQUksU0FBUyxjQUFjO0FBQUEsTUFDcEU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLElBQUksY0FBYztBQUNqQyxVQUFNLFNBQVMsSUFBSSxtQkFBbUIsS0FBSztBQUczQyxVQUFNLE9BQU8sU0FBUyxJQUFJLElBQUksd0JBQXdCLFNBQVMsUUFBUSxTQUFTLEtBQUs7QUFBQSxNQUNwRixnQkFBZ0I7QUFBQSxNQUNoQixpQkFBaUI7QUFBQSxNQUNqQixLQUFLLE1BQU07QUFBQSxNQUNYLGlCQUFpQixNQUFNO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsVUFBTTtBQUNOLFdBQU8sSUFBSSxJQUFJO0FBQ2YsVUFBTSxLQUFLLG1CQUFtQjtBQU05QixXQUFPLFlBQVksT0FBTyxPQUFPLEdBQUcsMENBQTBDO0FBQzlFLFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFNLCtDQUErQztBQUMvRixXQUFPLEdBQUcsa0JBQWtCLGtEQUFrRDtBQUM5RSxVQUFNLFVBQVUscUJBQXFCLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRTtBQUNyRCxVQUFNLFVBQVUsUUFBUSxLQUFLLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxpQkFBaUIsZ0JBQWdCO0FBQ2hGLFdBQU8sWUFBWSxTQUFTLFFBQVEsUUFBUTtBQUM1QyxXQUFPLEdBQUcsU0FBUyxjQUFjLFdBQVcseUJBQXlCLEdBQUcsaUNBQWlDLFNBQVMsWUFBWSxFQUFFO0FBR2hJLFVBQU0sV0FBVyxRQUFRLEtBQUssSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLGlCQUFpQixPQUFPO0FBQ3hFLFdBQU8sZUFBZSxVQUFVLFFBQVEsUUFBUTtBQUFBLEVBQ2pELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
