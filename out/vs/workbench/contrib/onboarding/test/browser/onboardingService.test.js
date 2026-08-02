import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../../../../base/common/errors.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { InMemoryStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { Memento } from "../../../../common/memento.js";
import { NullWorkbenchAssignmentService } from "../../../../services/assignment/test/common/nullAssignmentService.js";
import { TestLifecycleService } from "../../../../test/common/workbenchTestServices.js";
import { OnboardingScenarioService } from "../../browser/onboardingService.js";
import { onboardingPresentationRegistry } from "../../common/onboardingPresentation.js";
import { onboardingScenarioRegistry } from "../../common/onboardingRegistry.js";
import { OnboardingDismissReason, OnboardingOutcome } from "../../common/onboardingScenario.js";
import { ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from "../../common/onboardingScenarioService.js";
function completedResult(outcome = OnboardingOutcome.Completed) {
  const dismissReason = outcome === OnboardingOutcome.Skipped ? OnboardingDismissReason.SkipButton : outcome === OnboardingOutcome.Aborted ? OnboardingDismissReason.Aborted : OnboardingDismissReason.Completed;
  return { outcome, shown: true, dismissReason, lastStepIndex: 0, stepCount: 1 };
}
function notShownResult() {
  return { outcome: OnboardingOutcome.Completed, shown: false, dismissReason: OnboardingDismissReason.Completed, lastStepIndex: 0, stepCount: 0 };
}
class CapturingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName) {
    if (eventName) {
      this.events.push(eventName);
    }
  }
}
class FixedResultPresentation {
  constructor(kind, result) {
    this.kind = kind;
    this.result = result;
  }
  async run(_scenario, _context) {
    return this.result;
  }
}
class RecordingPresentation {
  constructor(kind, outcome = OnboardingOutcome.Completed, onRun) {
    this.kind = kind;
    this.outcome = outcome;
    this.onRun = onRun;
    this.runs = [];
  }
  async run(scenario, _context) {
    this.runs.push(scenario.id);
    this.onRun?.();
    return completedResult(this.outcome);
  }
}
class BlockingUntilAbortPresentation {
  constructor(kind) {
    this.kind = kind;
    this.runs = [];
  }
  run(scenario, context) {
    this.runs.push(scenario.id);
    return new Promise((resolve) => {
      const listener = context.onAbort(() => {
        listener.dispose();
        resolve(completedResult(OnboardingOutcome.Aborted));
      });
    });
  }
}
class FakeAssignmentService extends NullWorkbenchAssignmentService {
  constructor(treatments) {
    super();
    this.treatments = treatments;
    this._filters = [];
  }
  async getTreatment(name) {
    return this.treatments[name];
  }
  addTelemetryAssignmentFilter(filter) {
    this._filters.push(filter);
  }
  /** True when the given assignment-context id is currently excluded from telemetry. */
  isExcluded(assignment) {
    return this._filters.some((f) => f.exclude(assignment));
  }
}
suite("OnboardingScenarioService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    Memento.clear(StorageScope.APPLICATION);
  });
  let idSeed = 0;
  function uniqueKind() {
    return `test-presentation-${idSeed++}`;
  }
  function createService(configValues = {}, assignment, storage = disposables.add(new InMemoryStorageService()), telemetry = NullTelemetryService) {
    const store = disposables;
    const config = new TestConfigurationService(configValues);
    const contextKeyService = store.add(new ContextKeyService(config));
    const lifecycle = store.add(new TestLifecycleService());
    const service = store.add(new OnboardingScenarioService(
      storage,
      contextKeyService,
      config,
      lifecycle,
      assignment ?? new NullWorkbenchAssignmentService(),
      telemetry
    ));
    return { service, contextKeyService, config, lifecycle };
  }
  function registerPresentation(presentation) {
    disposables.add(onboardingPresentationRegistry.register(presentation));
  }
  function registerScenario(scenario) {
    disposables.add(onboardingScenarioRegistry.register(scenario));
  }
  test("runs an eligible auto scenario exactly once and marks it shown", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "auto-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    service.start();
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, shown: service.hasBeenShown("auto-1") },
      { runs: ["auto-1"], shown: true }
    );
  });
  test("developer mode ignores previously shown state for auto scenarios", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "dev-repeat-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const storage = disposables.add(new InMemoryStorageService());
    const first = createService({}, void 0, storage).service;
    first.start();
    await timeout(0);
    const { service: second, contextKeyService } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "dev-repeat-1": true } }, void 0, storage);
    second.start();
    await timeout(0);
    contextKeyService.createKey("onboardingTestDevModeReevaluate", false).set(true);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["dev-repeat-1", "dev-repeat-1"]);
  });
  test("does not run automatically when onboarding.enabled is false", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "disabled-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("respects the when clause and reacts to context changes", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({
      id: "when-1",
      when: ContextKeyExpr.equals("onboardingTestReady", true),
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service, contextKeyService } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "should not run while when is unsatisfied");
    const key = contextKeyService.createKey("onboardingTestReady", false);
    key.set(true);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["when-1"]);
  });
  test("runs higher-priority scenarios before lower-priority ones", async () => {
    const order = [];
    const presentation = new RecordingPresentation(uniqueKind(), OnboardingOutcome.Completed);
    registerPresentation(presentation);
    registerScenario({ id: "low", priority: 1, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    registerScenario({ id: "high", priority: 10, trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    order.push(...presentation.runs);
    assert.deepStrictEqual(order, ["high", "low"]);
  });
  test("observable triggers start the scenario when the signal turns true", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const signal = observableValue("onboardingTestSignal", false);
    registerScenario({ id: "observable-1", trigger: { kind: "observable", signal }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "should not run while signal is false");
    signal.set(true, void 0);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, ["observable-1"]);
  });
  test("command-triggered scenarios never run automatically", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "command-1", trigger: { kind: "command", commandId: "noop" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("runScenario runs manually even when disabled and already shown", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "manual-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService({ [ONBOARDING_ENABLED_CONFIG]: false });
    service.start();
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, [], "disabled: should not auto-run");
    const outcome = await service.runScenario("manual-1");
    assert.deepStrictEqual({ runs: presentation.runs, outcome }, { runs: ["manual-1"], outcome: OnboardingOutcome.Completed });
  });
  test("runScenario joins an in-flight run instead of starting a second one", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const kind = uniqueKind();
    const runs = [];
    const presentation = {
      kind,
      async run(scenario) {
        runs.push(scenario.id);
        await gate;
        return completedResult();
      }
    };
    registerPresentation(presentation);
    registerScenario({ id: "inflight-1", trigger: { kind: "command", commandId: "noop" }, presentation: { kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    const first = service.runScenario("inflight-1");
    await timeout(0);
    const second = service.runScenario("inflight-1");
    await timeout(0);
    release();
    const [a, b] = await Promise.all([first, second]);
    assert.deepStrictEqual({ runs, a, b }, { runs: ["inflight-1"], a: OnboardingOutcome.Completed, b: OnboardingOutcome.Completed });
  });
  test("resetAll clears shown state so the scenario can run again", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({ id: "reset-1", trigger: { kind: "auto" }, presentation: { kind: presentation.kind, payload: void 0 } });
    const { service } = createService();
    service.start();
    await timeout(0);
    service.resetAll();
    assert.strictEqual(service.hasBeenShown("reset-1"), false);
  });
  test("emits scenarioOutcome telemetry when a tour is shown but not when nothing is rendered", async () => {
    const shownKind = uniqueKind();
    const notShownKind = uniqueKind();
    registerPresentation(new FixedResultPresentation(shownKind, completedResult()));
    registerPresentation(new FixedResultPresentation(notShownKind, notShownResult()));
    registerScenario({ id: "tele-shown", trigger: { kind: "auto" }, presentation: { kind: shownKind, payload: void 0 } });
    registerScenario({ id: "tele-notshown", trigger: { kind: "auto" }, presentation: { kind: notShownKind, payload: void 0 } });
    const telemetry = new CapturingTelemetryService();
    const { service } = createService({}, void 0, void 0, telemetry);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(telemetry.events, ["onboarding.scenarioOutcome"]);
  });
  test("experiment-driven scenario does not run unless both treatment flags are set", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    registerScenario({
      id: "exp-off",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({}, new FakeAssignmentService({ "exp.show": true }));
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(presentation.runs, []);
  });
  test("an assignment-context id without the reserved prefix is rejected as inactive", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "newsession-2026q3" });
    registerScenario({
      id: "exp-badid",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    const errors = [];
    setUnexpectedErrorHandler((error) => errors.push(error));
    try {
      const { service } = createService({}, assignment);
      service.start();
      await timeout(0);
      await timeout(0);
      assert.deepStrictEqual(
        { runs: presentation.runs, shown: service.hasBeenShown("exp-badid"), reported: errors.length === 1 },
        { runs: [], shown: false, reported: true }
      );
    } finally {
      setUnexpectedErrorHandler(origErrorHandler);
    }
  });
  test("treatment arm shows the tour and opens the telemetry gate", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-treat",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const assignmentContext = "onb-tour-q3:12345";
    const { service } = createService({}, assignment);
    const excludedBeforeWouldShow = assignment.isExcluded(assignmentContext);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      {
        excludedBeforeWouldShow,
        runs: presentation.runs,
        shown: service.hasBeenShown("exp-treat"),
        excludedAfterWouldShow: assignment.isExcluded(assignmentContext),
        otherVariantExcluded: assignment.isExcluded("onb-tour-q3-other:12346")
      },
      {
        excludedBeforeWouldShow: true,
        runs: ["exp-treat"],
        shown: true,
        excludedAfterWouldShow: false,
        otherVariantExcluded: true
      }
    );
  });
  test("control arm opens the gate but shows nothing and stays eligible", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-control",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({}, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, shown: service.hasBeenShown("exp-control"), excluded: assignment.isExcluded("onb-tour-q3:12345") },
      { runs: [], shown: false, excluded: false }
    );
  });
  test("developer mode shows an experiment scenario whose experiment is not active", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({});
    registerScenario({
      id: "exp-dev-inactive",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "exp-dev-inactive": true } }, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, excluded: assignment.isExcluded("onb-tour-q3") },
      { runs: ["exp-dev-inactive"], excluded: true }
    );
  });
  test("developer mode shows the tour even when the user is in the control arm", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const assignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    registerScenario({
      id: "exp-dev-control",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const { service } = createService({ [ONBOARDING_DEVELOPER_MODE_CONFIG]: { "exp-dev-control": true } }, assignment);
    service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { runs: presentation.runs, excluded: assignment.isExcluded("onb-tour-q3") },
      { runs: ["exp-dev-control"], excluded: true }
    );
  });
  test("an opened gate persists so the id keeps flowing after a reload", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const storage = disposables.add(new InMemoryStorageService());
    registerScenario({
      id: "exp-persist",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind: presentation.kind, payload: void 0 }
    });
    const first = createService({}, new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" }), storage);
    first.service.start();
    await timeout(0);
    await timeout(0);
    const secondAssignment = new FakeAssignmentService({ "exp.show": false, "exp.id": "onb-tour-q3" });
    createService({}, secondAssignment, storage);
    assert.strictEqual(secondAssignment.isExcluded("onb-tour-q3:12345"), false);
  });
  test("a second experiment with a new id is blocked for a user who already saw the tour", async () => {
    const presentation = new RecordingPresentation(uniqueKind());
    registerPresentation(presentation);
    const storage = disposables.add(new InMemoryStorageService());
    const kind = presentation.kind;
    disposables.add(onboardingScenarioRegistry.register({
      id: "tour",
      experiment: { behaviorFlag: "exp.show", assignmentContextIdFlag: "exp.id" },
      trigger: { kind: "auto" },
      presentation: { kind, payload: void 0 }
    }));
    const first = createService({}, new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-2026q3" }), storage);
    first.service.start();
    await timeout(0);
    await timeout(0);
    assert.strictEqual(first.service.hasBeenShown("tour"), true);
    const secondAssignment = new FakeAssignmentService({ "exp.show": true, "exp.id": "onb-tour-2027q1" });
    const second = createService({}, secondAssignment, storage);
    second.service.start();
    await timeout(0);
    await timeout(0);
    assert.deepStrictEqual(
      { shown: second.service.hasBeenShown("tour"), excludedNew: secondAssignment.isExcluded("onb-tour-2027q1") },
      { shown: true, excludedNew: true }
    );
  });
  test("shutdown aborts the active scenario and never starts queued ones", async () => {
    const active = new BlockingUntilAbortPresentation(uniqueKind());
    const queued = new RecordingPresentation(uniqueKind());
    registerPresentation(active);
    registerPresentation(queued);
    registerScenario({ id: "active", priority: 10, trigger: { kind: "auto" }, presentation: { kind: active.kind, payload: void 0 } });
    registerScenario({ id: "queued", priority: 1, trigger: { kind: "auto" }, presentation: { kind: queued.kind, payload: void 0 } });
    const { service, lifecycle } = createService();
    service.start();
    await timeout(0);
    assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ["active"], queued: [] });
    lifecycle.fireShutdown();
    await timeout(0);
    assert.deepStrictEqual({ active: active.runs, queued: queued.runs }, { active: ["active"], queued: [] });
  });
  test("service starts and disposes without leaking", () => {
    const store = new DisposableStore();
    const storage = store.add(new InMemoryStorageService());
    const config = new TestConfigurationService();
    const contextKeyService = store.add(new ContextKeyService(config));
    const lifecycle = store.add(new TestLifecycleService());
    const service = store.add(new OnboardingScenarioService(storage, contextKeyService, config, lifecycle, new NullWorkbenchAssignmentService(), NullTelemetryService));
    service.start();
    store.dispose();
    assert.ok(true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL29uYm9hcmRpbmcvdGVzdC9icm93c2VyL29uYm9hcmRpbmdTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZXJyb3JIYW5kbGVyLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgSUFzc2lnbm1lbnRGaWx0ZXIsIElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvdGVzdC9jb21tb24vbnVsbEFzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL29uYm9hcmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPbmJvYXJkaW5nUHJlc2VudGF0aW9uLCBJT25ib2FyZGluZ1J1bkNvbnRleHQsIG9uYm9hcmRpbmdQcmVzZW50YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nUHJlc2VudGF0aW9uLmpzJztcbmltcG9ydCB7IG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1J1blJlc3VsdCwgSU9uYm9hcmRpbmdTY2VuYXJpbywgT25ib2FyZGluZ0Rpc21pc3NSZWFzb24sIE9uYm9hcmRpbmdPdXRjb21lIH0gZnJvbSAnLi4vLi4vY29tbW9uL29uYm9hcmRpbmdTY2VuYXJpby5qcyc7XG5pbXBvcnQgeyBPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJRywgT05CT0FSRElOR19FTkFCTEVEX0NPTkZJRyB9IGZyb20gJy4uLy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlLmpzJztcblxuZnVuY3Rpb24gY29tcGxldGVkUmVzdWx0KG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lID0gT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkKTogSU9uYm9hcmRpbmdSdW5SZXN1bHQge1xuXHRjb25zdCBkaXNtaXNzUmVhc29uID0gb3V0Y29tZSA9PT0gT25ib2FyZGluZ091dGNvbWUuU2tpcHBlZCA/IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLlNraXBCdXR0b25cblx0XHQ6IG91dGNvbWUgPT09IE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQgPyBPbmJvYXJkaW5nRGlzbWlzc1JlYXNvbi5BYm9ydGVkXG5cdFx0XHQ6IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZDtcblx0cmV0dXJuIHsgb3V0Y29tZSwgc2hvd246IHRydWUsIGRpc21pc3NSZWFzb24sIGxhc3RTdGVwSW5kZXg6IDAsIHN0ZXBDb3VudDogMSB9O1xufVxuXG4vKiogQSByZXN1bHQgZm9yIGEgZGVnZW5lcmF0ZSBydW4gdGhhdCByZW5kZXJlZCBub3RoaW5nIChubyBzdGVwcyAvIGFsbCBzdGVwcyBza2lwcGVkKS4gKi9cbmZ1bmN0aW9uIG5vdFNob3duUmVzdWx0KCk6IElPbmJvYXJkaW5nUnVuUmVzdWx0IHtcblx0cmV0dXJuIHsgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkLCBzaG93bjogZmFsc2UsIGRpc21pc3NSZWFzb246IE9uYm9hcmRpbmdEaXNtaXNzUmVhc29uLkNvbXBsZXRlZCwgbGFzdFN0ZXBJbmRleDogMCwgc3RlcENvdW50OiAwIH07XG59XG5cbi8qKiBDYXB0dXJlcyB0aGUgbmFtZXMgb2YgYHB1YmxpY0xvZzJgIHRlbGVtZXRyeSBldmVudHMuICovXG5jbGFzcyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlIGV4dGVuZHMgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB7XG5cdHJlYWRvbmx5IGV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0b3ZlcnJpZGUgcHVibGljTG9nMihldmVudE5hbWU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnROYW1lKSB7XG5cdFx0XHR0aGlzLmV2ZW50cy5wdXNoKGV2ZW50TmFtZSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKiBBIHByZXNlbnRhdGlvbiB0aGF0IHJlc29sdmVzIHdpdGggYSBmaXhlZCBydW4gcmVzdWx0LiAqL1xuY2xhc3MgRml4ZWRSZXN1bHRQcmVzZW50YXRpb24gaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGtpbmQ6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSByZXN1bHQ6IElPbmJvYXJkaW5nUnVuUmVzdWx0KSB7IH1cblx0YXN5bmMgcnVuKF9zY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgX2NvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ7XG5cdH1cbn1cblxuLyoqIFJlY29yZHMgZXZlcnkgc2NlbmFyaW8gaXQgcmVuZGVycywgdGhlbiByZXNvbHZlcyB3aXRoIGEgZml4ZWQgb3V0Y29tZS4gKi9cbmNsYXNzIFJlY29yZGluZ1ByZXNlbnRhdGlvbiBpbXBsZW1lbnRzIElPbmJvYXJkaW5nUHJlc2VudGF0aW9uIHtcblx0cmVhZG9ubHkgcnVuczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkga2luZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0Y29tZTogT25ib2FyZGluZ091dGNvbWUgPSBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblJ1bj86ICgpID0+IHZvaWQsXG5cdCkgeyB9XG5cdGFzeW5jIHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgX2NvbnRleHQ6IElPbmJvYXJkaW5nUnVuQ29udGV4dCk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHR0aGlzLnJ1bnMucHVzaChzY2VuYXJpby5pZCk7XG5cdFx0dGhpcy5vblJ1bj8uKCk7XG5cdFx0cmV0dXJuIGNvbXBsZXRlZFJlc3VsdCh0aGlzLm91dGNvbWUpO1xuXHR9XG59XG5cbi8qKiBCbG9ja3MgdW50aWwgdGhlIGVuZ2luZSBhYm9ydHMgdGhlIHJ1biAodXNlZCB0byB0ZXN0IHNodXRkb3duIGJlaGF2aW91cikuICovXG5jbGFzcyBCbG9ja2luZ1VudGlsQWJvcnRQcmVzZW50YXRpb24gaW1wbGVtZW50cyBJT25ib2FyZGluZ1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IHJ1bnM6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGtpbmQ6IHN0cmluZykgeyB9XG5cdHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbywgY29udGV4dDogSU9uYm9hcmRpbmdSdW5Db250ZXh0KTogUHJvbWlzZTxJT25ib2FyZGluZ1J1blJlc3VsdD4ge1xuXHRcdHRoaXMucnVucy5wdXNoKHNjZW5hcmlvLmlkKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBjb250ZXh0Lm9uQWJvcnQoKCkgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUoY29tcGxldGVkUmVzdWx0KE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogQXNzaWdubWVudCBzZXJ2aWNlIHRlc3QgZG91YmxlIHRoYXQgcmV0dXJucyBjYW5uZWQgdHJlYXRtZW50cyBhbmQgcmVjb3JkcyB0aGUgcmVnaXN0ZXJlZFxuICogdGVsZW1ldHJ5IGZpbHRlciBzbyB0ZXN0cyBjYW4gYXNzZXJ0IHdoaWNoIGFzc2lnbm1lbnQtY29udGV4dCBpZHMgd291bGQgYmUgZXhjbHVkZWQuXG4gKi9cbmNsYXNzIEZha2VBc3NpZ25tZW50U2VydmljZSBleHRlbmRzIE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlcnM6IElBc3NpZ25tZW50RmlsdGVyW10gPSBbXTtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSB0cmVhdG1lbnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0VHJlYXRtZW50PFQgZXh0ZW5kcyBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPihuYW1lOiBzdHJpbmcpOiBQcm9taXNlPFQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVhdG1lbnRzW25hbWVdIGFzIFQgfCB1bmRlZmluZWQ7XG5cdH1cblx0b3ZlcnJpZGUgYWRkVGVsZW1ldHJ5QXNzaWdubWVudEZpbHRlcihmaWx0ZXI6IElBc3NpZ25tZW50RmlsdGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdH1cblx0LyoqIFRydWUgd2hlbiB0aGUgZ2l2ZW4gYXNzaWdubWVudC1jb250ZXh0IGlkIGlzIGN1cnJlbnRseSBleGNsdWRlZCBmcm9tIHRlbGVtZXRyeS4gKi9cblx0aXNFeGNsdWRlZChhc3NpZ25tZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVycy5zb21lKGYgPT4gZi5leGNsdWRlKGFzc2lnbm1lbnQpKTtcblx0fVxufVxuXG5zdWl0ZSgnT25ib2FyZGluZ1NjZW5hcmlvU2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHQvLyBUaGUgTWVtZW50byBtYWludGFpbnMgYSBzdGF0aWMgY2FjaGUga2V5ZWQgYnkgaWQ7IGNsZWFyIGl0IHNvIGVhY2ggdGVzdFxuXHRcdC8vIHN0YXJ0cyB3aXRoIGZyZXNoIHBlcnNpc3RlZCBzdGF0ZSBpbnN0ZWFkIG9mIGxlYWtpbmcgYWNyb3NzIHRlc3RzLlxuXHRcdE1lbWVudG8uY2xlYXIoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0fSk7XG5cblx0bGV0IGlkU2VlZCA9IDA7XG5cdGZ1bmN0aW9uIHVuaXF1ZUtpbmQoKTogc3RyaW5nIHsgcmV0dXJuIGB0ZXN0LXByZXNlbnRhdGlvbi0ke2lkU2VlZCsrfWA7IH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKGNvbmZpZ1ZhbHVlczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSwgYXNzaWdubWVudD86IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSwgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSwgdGVsZW1ldHJ5OiBJVGVsZW1ldHJ5U2VydmljZSA9IE51bGxUZWxlbWV0cnlTZXJ2aWNlIGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpOiB7IHNlcnZpY2U6IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2U7IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7IGNvbmZpZzogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlOyBsaWZlY3ljbGU6IFRlc3RMaWZlY3ljbGVTZXJ2aWNlIH0ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXM7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShjb25maWdWYWx1ZXMpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZShjb25maWcpKTtcblx0XHRjb25zdCBsaWZlY3ljbGUgPSBzdG9yZS5hZGQobmV3IFRlc3RMaWZlY3ljbGVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UoXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRjb25maWcgYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRsaWZlY3ljbGUsXG5cdFx0XHRhc3NpZ25tZW50ID8/IG5ldyBOdWxsV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UoKSxcblx0XHRcdHRlbGVtZXRyeSxcblx0XHQpKTtcblx0XHRyZXR1cm4geyBzZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29uZmlnLCBsaWZlY3ljbGUgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbjogSU9uYm9hcmRpbmdQcmVzZW50YXRpb24pOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQob25ib2FyZGluZ1ByZXNlbnRhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKHByZXNlbnRhdGlvbikpO1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVnaXN0ZXJTY2VuYXJpbyhzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IHZvaWQge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5yZWdpc3RlcihzY2VuYXJpbykpO1xuXHR9XG5cblx0dGVzdCgncnVucyBhbiBlbGlnaWJsZSBhdXRvIHNjZW5hcmlvIGV4YWN0bHkgb25jZSBhbmQgbWFya3MgaXQgc2hvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnYXV0by0xJywgdHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gUmUtZXZhbHVhdGluZyAoZS5nLiBhbm90aGVyIHN0YXJ0KSBtdXN0IG5vdCBydW4gaXQgYWdhaW4uXG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBydW5zOiBwcmVzZW50YXRpb24ucnVucywgc2hvd246IHNlcnZpY2UuaGFzQmVlblNob3duKCdhdXRvLTEnKSB9LFxuXHRcdFx0eyBydW5zOiBbJ2F1dG8tMSddLCBzaG93bjogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIG1vZGUgaWdub3JlcyBwcmV2aW91c2x5IHNob3duIHN0YXRlIGZvciBhdXRvIHNjZW5hcmlvcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdkZXYtcmVwZWF0LTEnLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVNlcnZpY2Uoe30sIHVuZGVmaW5lZCwgc3RvcmFnZSkuc2VydmljZTtcblx0XHRmaXJzdC5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2U6IHNlY29uZCwgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyBbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7ICdkZXYtcmVwZWF0LTEnOiB0cnVlIH0gfSwgdW5kZWZpbmVkLCBzdG9yYWdlKTtcblx0XHRzZWNvbmQuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdvbmJvYXJkaW5nVGVzdERldk1vZGVSZWV2YWx1YXRlJywgZmFsc2UpLnNldCh0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWydkZXYtcmVwZWF0LTEnLCAnZGV2LXJlcGVhdC0xJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBydW4gYXV0b21hdGljYWxseSB3aGVuIG9uYm9hcmRpbmcuZW5hYmxlZCBpcyBmYWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdkaXNhYmxlZC0xJywgdHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7IFtPTkJPQVJESU5HX0VOQUJMRURfQ09ORklHXTogZmFsc2UgfSk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXNlbnRhdGlvbi5ydW5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIHRoZSB3aGVuIGNsYXVzZSBhbmQgcmVhY3RzIHRvIGNvbnRleHQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnd2hlbi0xJyxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnb25ib2FyZGluZ1Rlc3RSZWFkeScsIHRydWUpLFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSwgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXNlbnRhdGlvbi5ydW5zLCBbXSwgJ3Nob3VsZCBub3QgcnVuIHdoaWxlIHdoZW4gaXMgdW5zYXRpc2ZpZWQnKTtcblxuXHRcdGNvbnN0IGtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj4gPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoJ29uYm9hcmRpbmdUZXN0UmVhZHknLCBmYWxzZSk7XG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWyd3aGVuLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bnMgaGlnaGVyLXByaW9yaXR5IHNjZW5hcmlvcyBiZWZvcmUgbG93ZXItcHJpb3JpdHkgb25lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSwgT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkKTtcblx0XHQvLyBUcmFjayBvcmRlcmluZyB2aWEgdGhlIHJlY29yZGVyJ3MgcnVucyBhcnJheSB3aGljaCBpcyBhcHBlbmRlZCBpbiBydW4oKS5cblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ2xvdycsIHByaW9yaXR5OiAxLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ2hpZ2gnLCBwcmlvcml0eTogMTAsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRvcmRlci5wdXNoKC4uLnByZXNlbnRhdGlvbi5ydW5zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3JkZXIsIFsnaGlnaCcsICdsb3cnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ic2VydmFibGUgdHJpZ2dlcnMgc3RhcnQgdGhlIHNjZW5hcmlvIHdoZW4gdGhlIHNpZ25hbCB0dXJucyB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IHNpZ25hbCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignb25ib2FyZGluZ1Rlc3RTaWduYWwnLCBmYWxzZSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnb2JzZXJ2YWJsZS0xJywgdHJpZ2dlcjogeyBraW5kOiAnb2JzZXJ2YWJsZScsIHNpZ25hbCB9LCBwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgW10sICdzaG91bGQgbm90IHJ1biB3aGlsZSBzaWduYWwgaXMgZmFsc2UnKTtcblxuXHRcdHNpZ25hbC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgWydvYnNlcnZhYmxlLTEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmQtdHJpZ2dlcmVkIHNjZW5hcmlvcyBuZXZlciBydW4gYXV0b21hdGljYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdjb21tYW5kLTEnLCB0cmlnZ2VyOiB7IGtpbmQ6ICdjb21tYW5kJywgY29tbWFuZElkOiAnbm9vcCcgfSwgcHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmVzZW50YXRpb24ucnVucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5TY2VuYXJpbyBydW5zIG1hbnVhbGx5IGV2ZW4gd2hlbiBkaXNhYmxlZCBhbmQgYWxyZWFkeSBzaG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdtYW51YWwtMScsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyBbT05CT0FSRElOR19FTkFCTEVEX0NPTkZJR106IGZhbHNlIH0pO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJlc2VudGF0aW9uLnJ1bnMsIFtdLCAnZGlzYWJsZWQ6IHNob3VsZCBub3QgYXV0by1ydW4nKTtcblxuXHRcdGNvbnN0IG91dGNvbWUgPSBhd2FpdCBzZXJ2aWNlLnJ1blNjZW5hcmlvKCdtYW51YWwtMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJ1bnM6IHByZXNlbnRhdGlvbi5ydW5zLCBvdXRjb21lIH0sIHsgcnVuczogWydtYW51YWwtMSddLCBvdXRjb21lOiBPbmJvYXJkaW5nT3V0Y29tZS5Db21wbGV0ZWQgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1blNjZW5hcmlvIGpvaW5zIGFuIGluLWZsaWdodCBydW4gaW5zdGVhZCBvZiBzdGFydGluZyBhIHNlY29uZCBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHJlbGVhc2UhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IGdhdGUgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgcmVsZWFzZSA9IHJlc29sdmU7IH0pO1xuXHRcdGNvbnN0IGtpbmQgPSB1bmlxdWVLaW5kKCk7XG5cdFx0Y29uc3QgcnVuczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcmVzZW50YXRpb246IElPbmJvYXJkaW5nUHJlc2VudGF0aW9uID0ge1xuXHRcdFx0a2luZCxcblx0XHRcdGFzeW5jIHJ1bihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IFByb21pc2U8SU9uYm9hcmRpbmdSdW5SZXN1bHQ+IHtcblx0XHRcdFx0cnVucy5wdXNoKHNjZW5hcmlvLmlkKTtcblx0XHRcdFx0YXdhaXQgZ2F0ZTtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlZFJlc3VsdCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHsgaWQ6ICdpbmZsaWdodC0xJywgdHJpZ2dlcjogeyBraW5kOiAnY29tbWFuZCcsIGNvbW1hbmRJZDogJ25vb3AnIH0sIHByZXNlbnRhdGlvbjogeyBraW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gc2VydmljZS5ydW5TY2VuYXJpbygnaW5mbGlnaHQtMScpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Ly8gU2Vjb25kIGNhbGwgd2hpbGUgdGhlIGZpcnN0IHJ1biBpcyBzdGlsbCBpbi1mbGlnaHQgbXVzdCBub3Qgc3RhcnQgYWdhaW4uXG5cdFx0Y29uc3Qgc2Vjb25kID0gc2VydmljZS5ydW5TY2VuYXJpbygnaW5mbGlnaHQtMScpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRyZWxlYXNlKCk7XG5cdFx0Y29uc3QgW2EsIGJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBzZWNvbmRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBydW5zLCBhLCBiIH0sIHsgcnVuczogWydpbmZsaWdodC0xJ10sIGE6IE9uYm9hcmRpbmdPdXRjb21lLkNvbXBsZXRlZCwgYjogT25ib2FyZGluZ091dGNvbWUuQ29tcGxldGVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldEFsbCBjbGVhcnMgc2hvd24gc3RhdGUgc28gdGhlIHNjZW5hcmlvIGNhbiBydW4gYWdhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAncmVzZXQtMScsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH0gfSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdHNlcnZpY2UucmVzZXRBbGwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNCZWVuU2hvd24oJ3Jlc2V0LTEnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBzY2VuYXJpb091dGNvbWUgdGVsZW1ldHJ5IHdoZW4gYSB0b3VyIGlzIHNob3duIGJ1dCBub3Qgd2hlbiBub3RoaW5nIGlzIHJlbmRlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNob3duS2luZCA9IHVuaXF1ZUtpbmQoKTtcblx0XHRjb25zdCBub3RTaG93bktpbmQgPSB1bmlxdWVLaW5kKCk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24obmV3IEZpeGVkUmVzdWx0UHJlc2VudGF0aW9uKHNob3duS2luZCwgY29tcGxldGVkUmVzdWx0KCkpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihuZXcgRml4ZWRSZXN1bHRQcmVzZW50YXRpb24obm90U2hvd25LaW5kLCBub3RTaG93blJlc3VsdCgpKSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAndGVsZS1zaG93bicsIHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sIHByZXNlbnRhdGlvbjogeyBraW5kOiBzaG93bktpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ3RlbGUtbm90c2hvd24nLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogbm90U2hvd25LaW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfSB9KTtcblxuXHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHt9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGVsZW1ldHJ5IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBPbmUgZXZlbnQgZm9yIHRoZSBzaG93biB0b3VyOyBub25lIGZvciB0aGUgZGVnZW5lcmF0ZSBydW4gdGhhdCByZW5kZXJlZCBub3RoaW5nLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVsZW1ldHJ5LmV2ZW50cywgWydvbmJvYXJkaW5nLnNjZW5hcmlvT3V0Y29tZSddKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwZXJpbWVudC1kcml2ZW4gc2NlbmFyaW8gZG9lcyBub3QgcnVuIHVubGVzcyBib3RoIHRyZWF0bWVudCBmbGFncyBhcmUgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtb2ZmJyxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgYmVoYXZpb3JGbGFnOiAnZXhwLnNob3cnLCBhc3NpZ25tZW50Q29udGV4dElkRmxhZzogJ2V4cC5pZCcgfSxcblx0XHRcdHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sXG5cdFx0XHRwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9XG5cdFx0fSk7XG5cblx0XHQvLyBPbmx5IG9uZSBvZiB0aGUgdHdvIGZsYWdzIHJlc29sdmVzIC0+IHRyZWF0ZWQgYXMgbm90IGNvbmZpZ3VyZWQgLT4gZG9lcyBub3QgcnVuLlxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7fSwgbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IHRydWUgfSkpO1xuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXNlbnRhdGlvbi5ydW5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGFzc2lnbm1lbnQtY29udGV4dCBpZCB3aXRob3V0IHRoZSByZXNlcnZlZCBwcmVmaXggaXMgcmVqZWN0ZWQgYXMgaW5hY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0Ly8gTWlzY29uZmlndXJlZCBpZDogd291bGQgbmV2ZXIgYmUgZ2F0ZWQgYnkgdGhlIHByZWZpeCBmaWx0ZXIsIHNvIGl0IG11c3Qgbm90IHJ1bi5cblx0XHRjb25zdCBhc3NpZ25tZW50ID0gbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IHRydWUsICdleHAuaWQnOiAnbmV3c2Vzc2lvbi0yMDI2cTMnIH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtYmFkaWQnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdGNvbnN0IGVycm9yczogdW5rbm93bltdID0gW107XG5cdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihlcnJvciA9PiBlcnJvcnMucHVzaChlcnJvcikpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe30sIGFzc2lnbm1lbnQpO1xuXHRcdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgcnVuczogcHJlc2VudGF0aW9uLnJ1bnMsIHNob3duOiBzZXJ2aWNlLmhhc0JlZW5TaG93bignZXhwLWJhZGlkJyksIHJlcG9ydGVkOiBlcnJvcnMubGVuZ3RoID09PSAxIH0sXG5cdFx0XHRcdHsgcnVuczogW10sIHNob3duOiBmYWxzZSwgcmVwb3J0ZWQ6IHRydWUgfVxuXHRcdFx0KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0bWVudCBhcm0gc2hvd3MgdGhlIHRvdXIgYW5kIG9wZW5zIHRoZSB0ZWxlbWV0cnkgZ2F0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRjb25zdCBhc3NpZ25tZW50ID0gbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IHRydWUsICdleHAuaWQnOiAnb25iLXRvdXItcTMnIH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtdHJlYXQnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGFzc2lnbm1lbnRDb250ZXh0ID0gJ29uYi10b3VyLXEzOjEyMzQ1Jztcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2Uoe30sIGFzc2lnbm1lbnQpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkQmVmb3JlV291bGRTaG93ID0gYXNzaWdubWVudC5pc0V4Y2x1ZGVkKGFzc2lnbm1lbnRDb250ZXh0KTtcblxuXHRcdHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRleGNsdWRlZEJlZm9yZVdvdWxkU2hvdyxcblx0XHRcdFx0cnVuczogcHJlc2VudGF0aW9uLnJ1bnMsXG5cdFx0XHRcdHNob3duOiBzZXJ2aWNlLmhhc0JlZW5TaG93bignZXhwLXRyZWF0JyksXG5cdFx0XHRcdGV4Y2x1ZGVkQWZ0ZXJXb3VsZFNob3c6IGFzc2lnbm1lbnQuaXNFeGNsdWRlZChhc3NpZ25tZW50Q29udGV4dCksXG5cdFx0XHRcdG90aGVyVmFyaWFudEV4Y2x1ZGVkOiBhc3NpZ25tZW50LmlzRXhjbHVkZWQoJ29uYi10b3VyLXEzLW90aGVyOjEyMzQ2Jylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGV4Y2x1ZGVkQmVmb3JlV291bGRTaG93OiB0cnVlLFxuXHRcdFx0XHRydW5zOiBbJ2V4cC10cmVhdCddLFxuXHRcdFx0XHRzaG93bjogdHJ1ZSxcblx0XHRcdFx0ZXhjbHVkZWRBZnRlcldvdWxkU2hvdzogZmFsc2UsXG5cdFx0XHRcdG90aGVyVmFyaWFudEV4Y2x1ZGVkOiB0cnVlXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJvbCBhcm0gb3BlbnMgdGhlIGdhdGUgYnV0IHNob3dzIG5vdGhpbmcgYW5kIHN0YXlzIGVsaWdpYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IG5ldyBSZWNvcmRpbmdQcmVzZW50YXRpb24odW5pcXVlS2luZCgpKTtcblx0XHRyZWdpc3RlclByZXNlbnRhdGlvbihwcmVzZW50YXRpb24pO1xuXHRcdGNvbnN0IGFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogZmFsc2UsICdleHAuaWQnOiAnb25iLXRvdXItcTMnIH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oe1xuXHRcdFx0aWQ6ICdleHAtY29udHJvbCcsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQ6IHByZXNlbnRhdGlvbi5raW5kLCBwYXlsb2FkOiB1bmRlZmluZWQgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXJ2aWNlKHt9LCBhc3NpZ25tZW50KTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gTm8gdG91ciBzaG93biwgbm90IG1hcmtlZCBzaG93biAocmUtZWxpZ2libGUgbGF0ZXIpLCBidXQgdGhlIGlkIG5vdyBmbG93cy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBydW5zOiBwcmVzZW50YXRpb24ucnVucywgc2hvd246IHNlcnZpY2UuaGFzQmVlblNob3duKCdleHAtY29udHJvbCcpLCBleGNsdWRlZDogYXNzaWdubWVudC5pc0V4Y2x1ZGVkKCdvbmItdG91ci1xMzoxMjM0NScpIH0sXG5cdFx0XHR7IHJ1bnM6IFtdLCBzaG93bjogZmFsc2UsIGV4Y2x1ZGVkOiBmYWxzZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIG1vZGUgc2hvd3MgYW4gZXhwZXJpbWVudCBzY2VuYXJpbyB3aG9zZSBleHBlcmltZW50IGlzIG5vdCBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0Ly8gTmVpdGhlciB0cmVhdG1lbnQgZmxhZyByZXNvbHZlczogdGhlIGV4cGVyaW1lbnQgaXMgaW5hY3RpdmUsIHNvIGl0IHdvdWxkIG5vdCBydW5cblx0XHQvLyBhdXRvbWF0aWNhbGx5IFx1MjAxNCBidXQgZGV2ZWxvcGVyIG1vZGUgYnlwYXNzZXMgdGhlIGV4cGVyaW1lbnQgZ2F0ZS5cblx0XHRjb25zdCBhc3NpZ25tZW50ID0gbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7fSk7XG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7XG5cdFx0XHRpZDogJ2V4cC1kZXYtaW5hY3RpdmUnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2VydmljZSh7IFtPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJR106IHsgJ2V4cC1kZXYtaW5hY3RpdmUnOiB0cnVlIH0gfSwgYXNzaWdubWVudCk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFRoZSB0b3VyIGlzIHNob3duLCBidXQgc2luY2UgdGhlIGV4cGVyaW1lbnQgaXMgbm90IGFjdGl2ZSBubyB0ZWxlbWV0cnkgZ2F0ZSBpc1xuXHRcdC8vIG9wZW5lZCAodGhlcmUgaXMgbm8gYXNzaWdubWVudC1jb250ZXh0IGlkIHRvIGZsb3cpLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJ1bnM6IHByZXNlbnRhdGlvbi5ydW5zLCBleGNsdWRlZDogYXNzaWdubWVudC5pc0V4Y2x1ZGVkKCdvbmItdG91ci1xMycpIH0sXG5cdFx0XHR7IHJ1bnM6IFsnZXhwLWRldi1pbmFjdGl2ZSddLCBleGNsdWRlZDogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV2ZWxvcGVyIG1vZGUgc2hvd3MgdGhlIHRvdXIgZXZlbiB3aGVuIHRoZSB1c2VyIGlzIGluIHRoZSBjb250cm9sIGFybScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRjb25zdCBhc3NpZ25tZW50ID0gbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IGZhbHNlLCAnZXhwLmlkJzogJ29uYi10b3VyLXEzJyB9KTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnZXhwLWRldi1jb250cm9sJyxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgYmVoYXZpb3JGbGFnOiAnZXhwLnNob3cnLCBhc3NpZ25tZW50Q29udGV4dElkRmxhZzogJ2V4cC5pZCcgfSxcblx0XHRcdHRyaWdnZXI6IHsga2luZDogJ2F1dG8nIH0sXG5cdFx0XHRwcmVzZW50YXRpb246IHsga2luZDogcHJlc2VudGF0aW9uLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlcnZpY2UoeyBbT05CT0FSRElOR19ERVZFTE9QRVJfTU9ERV9DT05GSUddOiB7ICdleHAtZGV2LWNvbnRyb2wnOiB0cnVlIH0gfSwgYXNzaWdubWVudCk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIERldmVsb3BlciBtb2RlIHNob3dzIHRoZSB0b3VyIHVuY29uZGl0aW9uYWxseSBhbmQgbmV2ZXIgb3BlbnMgdGhlIHRlbGVtZXRyeVxuXHRcdC8vIGdhdGUsIHNvIHRoZSBhc3NpZ25tZW50LWNvbnRleHQgaWQgc3RheXMgZXhjbHVkZWQgZXZlbiB0aG91Z2ggdGhlIHVzZXIgaXMgaW5cblx0XHQvLyB0aGUgKGFjdGl2ZSkgY29udHJvbCBhcm0gXHUyMDE0IGEgbG9jYWwgcHJldmlldyBjYW4ndCBhZmZlY3QgdGhlIHNjb3JlY2FyZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBydW5zOiBwcmVzZW50YXRpb24ucnVucywgZXhjbHVkZWQ6IGFzc2lnbm1lbnQuaXNFeGNsdWRlZCgnb25iLXRvdXItcTMnKSB9LFxuXHRcdFx0eyBydW5zOiBbJ2V4cC1kZXYtY29udHJvbCddLCBleGNsdWRlZDogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYW4gb3BlbmVkIGdhdGUgcGVyc2lzdHMgc28gdGhlIGlkIGtlZXBzIGZsb3dpbmcgYWZ0ZXIgYSByZWxvYWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKHByZXNlbnRhdGlvbik7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRyZWdpc3RlclNjZW5hcmlvKHtcblx0XHRcdGlkOiAnZXhwLXBlcnNpc3QnLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBiZWhhdmlvckZsYWc6ICdleHAuc2hvdycsIGFzc2lnbm1lbnRDb250ZXh0SWRGbGFnOiAnZXhwLmlkJyB9LFxuXHRcdFx0dHJpZ2dlcjogeyBraW5kOiAnYXV0bycgfSxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBraW5kOiBwcmVzZW50YXRpb24ua2luZCwgcGF5bG9hZDogdW5kZWZpbmVkIH1cblx0XHR9KTtcblxuXHRcdC8vIEZpcnN0IFwic2Vzc2lvblwiOiBjb250cm9sIHJlYWNoZXMgd291bGQtc2hvdyBhbmQgb3BlbnMgdGhlIGdhdGUuXG5cdFx0Y29uc3QgZmlyc3QgPSBjcmVhdGVTZXJ2aWNlKHt9LCBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogZmFsc2UsICdleHAuaWQnOiAnb25iLXRvdXItcTMnIH0pLCBzdG9yYWdlKTtcblx0XHRmaXJzdC5zZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gU2Vjb25kIFwic2Vzc2lvblwiIChyZWxvYWQpIHdpdGggYSBmcmVzaCBzZXJ2aWNlICsgYXNzaWdubWVudCBzZXJ2aWNlOiB0aGUgcGVyc2lzdGVkXG5cdFx0Ly8gZ2F0ZSBtdXN0IGltbWVkaWF0ZWx5IGFsbG93IHRoZSBpZCwgZXZlbiBiZWZvcmUgYW55IHdvdWxkLXNob3cgdGhpcyBzZXNzaW9uLlxuXHRcdGNvbnN0IHNlY29uZEFzc2lnbm1lbnQgPSBuZXcgRmFrZUFzc2lnbm1lbnRTZXJ2aWNlKHsgJ2V4cC5zaG93JzogZmFsc2UsICdleHAuaWQnOiAnb25iLXRvdXItcTMnIH0pO1xuXHRcdGNyZWF0ZVNlcnZpY2Uoe30sIHNlY29uZEFzc2lnbm1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZEFzc2lnbm1lbnQuaXNFeGNsdWRlZCgnb25iLXRvdXItcTM6MTIzNDUnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNlY29uZCBleHBlcmltZW50IHdpdGggYSBuZXcgaWQgaXMgYmxvY2tlZCBmb3IgYSB1c2VyIHdobyBhbHJlYWR5IHNhdyB0aGUgdG91cicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBuZXcgUmVjb3JkaW5nUHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocHJlc2VudGF0aW9uKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGtpbmQgPSBwcmVzZW50YXRpb24ua2luZDtcblxuXHRcdC8vIEV4cGVyaW1lbnQgMTogdHJlYXRtZW50LiBUaGUgdXNlciBzZWVzIHRoZSB0b3VyIGFuZCBpcyBtYXJrZWQgc2hvd24uXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LnJlZ2lzdGVyKHtcblx0XHRcdGlkOiAndG91cicsXG5cdFx0XHRleHBlcmltZW50OiB7IGJlaGF2aW9yRmxhZzogJ2V4cC5zaG93JywgYXNzaWdubWVudENvbnRleHRJZEZsYWc6ICdleHAuaWQnIH0sXG5cdFx0XHR0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gY3JlYXRlU2VydmljZSh7fSwgbmV3IEZha2VBc3NpZ25tZW50U2VydmljZSh7ICdleHAuc2hvdyc6IHRydWUsICdleHAuaWQnOiAnb25iLXRvdXItMjAyNnEzJyB9KSwgc3RvcmFnZSk7XG5cdFx0Zmlyc3Quc2VydmljZS5zdGFydCgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Quc2VydmljZS5oYXNCZWVuU2hvd24oJ3RvdXInKSwgdHJ1ZSk7XG5cblx0XHQvLyBFeHBlcmltZW50IDIgKG5ldyBpZCkgaW4gYSByZWxvYWQ6IGFscmVhZHkgc2hvd24gLT4gbm90IGVsaWdpYmxlIC0+IGlkIHN0YXlzIGJsb2NrZWQuXG5cdFx0Y29uc3Qgc2Vjb25kQXNzaWdubWVudCA9IG5ldyBGYWtlQXNzaWdubWVudFNlcnZpY2UoeyAnZXhwLnNob3cnOiB0cnVlLCAnZXhwLmlkJzogJ29uYi10b3VyLTIwMjdxMScgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gY3JlYXRlU2VydmljZSh7fSwgc2Vjb25kQXNzaWdubWVudCwgc3RvcmFnZSk7XG5cdFx0c2Vjb25kLnNlcnZpY2Uuc3RhcnQoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBzaG93bjogc2Vjb25kLnNlcnZpY2UuaGFzQmVlblNob3duKCd0b3VyJyksIGV4Y2x1ZGVkTmV3OiBzZWNvbmRBc3NpZ25tZW50LmlzRXhjbHVkZWQoJ29uYi10b3VyLTIwMjdxMScpIH0sXG5cdFx0XHR7IHNob3duOiB0cnVlLCBleGNsdWRlZE5ldzogdHJ1ZSB9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2h1dGRvd24gYWJvcnRzIHRoZSBhY3RpdmUgc2NlbmFyaW8gYW5kIG5ldmVyIHN0YXJ0cyBxdWV1ZWQgb25lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3RpdmUgPSBuZXcgQmxvY2tpbmdVbnRpbEFib3J0UHJlc2VudGF0aW9uKHVuaXF1ZUtpbmQoKSk7XG5cdFx0Y29uc3QgcXVldWVkID0gbmV3IFJlY29yZGluZ1ByZXNlbnRhdGlvbih1bmlxdWVLaW5kKCkpO1xuXHRcdHJlZ2lzdGVyUHJlc2VudGF0aW9uKGFjdGl2ZSk7XG5cdFx0cmVnaXN0ZXJQcmVzZW50YXRpb24ocXVldWVkKTtcblx0XHQvLyBgYWN0aXZlYCBoYXMgaGlnaGVyIHByaW9yaXR5IHNvIGl0IHJ1bnMgZmlyc3QgYW5kIGJsb2NrczsgYHF1ZXVlZGAgd2FpdHMuXG5cdFx0cmVnaXN0ZXJTY2VuYXJpbyh7IGlkOiAnYWN0aXZlJywgcHJpb3JpdHk6IDEwLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogYWN0aXZlLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXHRcdHJlZ2lzdGVyU2NlbmFyaW8oeyBpZDogJ3F1ZXVlZCcsIHByaW9yaXR5OiAxLCB0cmlnZ2VyOiB7IGtpbmQ6ICdhdXRvJyB9LCBwcmVzZW50YXRpb246IHsga2luZDogcXVldWVkLmtpbmQsIHBheWxvYWQ6IHVuZGVmaW5lZCB9IH0pO1xuXG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBsaWZlY3ljbGUgfSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHQvLyBPbmx5IHRoZSBhY3RpdmUgKGJsb2NraW5nKSBzY2VuYXJpbyBzaG91bGQgaGF2ZSBzdGFydGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3RpdmU6IGFjdGl2ZS5ydW5zLCBxdWV1ZWQ6IHF1ZXVlZC5ydW5zIH0sIHsgYWN0aXZlOiBbJ2FjdGl2ZSddLCBxdWV1ZWQ6IFtdIH0pO1xuXG5cdFx0bGlmZWN5Y2xlLmZpcmVTaHV0ZG93bigpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBUaGUgcXVldWVkIHNjZW5hcmlvIG11c3QgbmV2ZXIgaGF2ZSBiZWVuIHByZXNlbnRlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWN0aXZlOiBhY3RpdmUucnVucywgcXVldWVkOiBxdWV1ZWQucnVucyB9LCB7IGFjdGl2ZTogWydhY3RpdmUnXSwgcXVldWVkOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmljZSBzdGFydHMgYW5kIGRpc3Bvc2VzIHdpdGhvdXQgbGVha2luZycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzdG9yYWdlID0gc3RvcmUuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHN0b3JlLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UoY29uZmlnKSk7XG5cdFx0Y29uc3QgbGlmZWN5Y2xlID0gc3RvcmUuYWRkKG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlKHN0b3JhZ2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWcgYXMgdW5rbm93biBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGxpZmVjeWNsZSwgbmV3IE51bGxXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSgpLCBOdWxsVGVsZW1ldHJ5U2VydmljZSBhcyB1bmtub3duIGFzIElUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0c2VydmljZS5zdGFydCgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQub2sodHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYyxpQ0FBaUM7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBdUQ7QUFDaEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0Isb0JBQW9CO0FBRXJELFNBQVMsc0JBQXNCLGlDQUFpQztBQUNo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
