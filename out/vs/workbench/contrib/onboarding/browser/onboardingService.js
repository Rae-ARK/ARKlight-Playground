var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { DeferredPromise } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { Memento } from "../../../common/memento.js";
import { onboardingPresentationRegistry } from "../common/onboardingPresentation.js";
import { onboardingScenarioRegistry } from "../common/onboardingRegistry.js";
import { ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX, OnboardingOutcome } from "../common/onboardingScenario.js";
import { isOnboardingDeveloperModeEnabled, ONBOARDING_DEVELOPER_MODE_CONFIG, ONBOARDING_ENABLED_CONFIG } from "../common/onboardingScenarioService.js";
let OnboardingScenarioService = class extends Disposable {
  constructor(storageService, contextKeyService, configurationService, lifecycleService, assignmentService, telemetryService) {
    super();
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.lifecycleService = lifecycleService;
    this.assignmentService = assignmentService;
    this.telemetryService = telemetryService;
    /** Listeners for `observable` triggers, rebuilt whenever the registry changes. */
    this._triggerListeners = this._register(new DisposableStore());
    /** Scenario ids currently queued or running (prevents double-scheduling). */
    this._pending = /* @__PURE__ */ new Set();
    this._queue = [];
    /** Deferreds for scenarios that have been dequeued and are currently running, keyed by id. */
    this._inflight = /* @__PURE__ */ new Map();
    this._pumping = false;
    /** Resolved experiment treatment state, keyed by scenario id. */
    this._experimentStates = /* @__PURE__ */ new Map();
    this._onDidChangeOpenedIds = this._register(new Emitter());
    this._started = false;
    this._stopped = false;
    this._shownSinceStart = /* @__PURE__ */ new Set();
    this._memento = new Memento(OnboardingScenarioService.MEMENTO_ID, this.storageService);
    this._state = this._memento.getMemento(StorageScope.APPLICATION, StorageTarget.MACHINE);
    this._openedAssignmentContextIds = this._loadOpenedIds();
    this.assignmentService.addTelemetryAssignmentFilter({
      id: "onboarding",
      exclude: (assignment) => {
        const variant = getAssignmentContextVariant(assignment);
        return variant.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX) && !this._openedAssignmentContextIds.has(variant);
      },
      onDidChange: this._onDidChangeOpenedIds.event
    });
    this._register(this.lifecycleService.onWillShutdown(() => this._stop()));
  }
  _stop() {
    this._stopped = true;
    this._activeAbort?.fire();
    let entry;
    while (entry = this._queue.shift()) {
      this._pending.delete(entry.scenario.id);
      entry.deferred.complete(OnboardingOutcome.Aborted);
    }
  }
  start() {
    if (this._started) {
      return;
    }
    this._started = true;
    this._register(onboardingScenarioRegistry.onDidChange(() => {
      this._registerTriggerListeners();
      this._resolveExperiments();
      this._evaluate();
    }));
    this._register(this.contextKeyService.onDidChangeContext(() => this._evaluate()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ONBOARDING_ENABLED_CONFIG) || e.affectsConfiguration(ONBOARDING_DEVELOPER_MODE_CONFIG)) {
        this._evaluate();
      }
    }));
    this._registerTriggerListeners();
    this._resolveExperiments();
    this._evaluate();
  }
  getScenarios() {
    return onboardingScenarioRegistry.getScenarios();
  }
  async runScenario(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    if (!scenario) {
      throw new Error(`Unknown onboarding scenario '${id}'.`);
    }
    return this._enqueue(scenario);
  }
  hasBeenShown(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    return this._hasBeenShownKey(scenario ? this._seenKey(scenario) : id, id);
  }
  reset(id) {
    const scenario = onboardingScenarioRegistry.getScenario(id);
    delete this._state[scenario ? this._seenKey(scenario) : id];
    this._memento.saveMemento();
  }
  resetAll() {
    for (const key of Object.keys(this._state)) {
      delete this._state[key];
    }
    this._memento.saveMemento();
  }
  //#region Eligibility & scheduling
  /**
   * The master switch for *automatic* onboarding. When `onboarding.enabled` is
   * explicitly `false`, no scenario ever runs automatically (developer mode does
   * NOT override this — see {@link _evaluate}). Any other value (including unset)
   * is treated as enabled. On-demand {@link runScenario} is intentionally exempt
   * from this switch.
   */
  get _enabled() {
    return this.configurationService.getValue(ONBOARDING_ENABLED_CONFIG) !== false;
  }
  _isDeveloperMode(scenarioId) {
    return isOnboardingDeveloperModeEnabled(this.configurationService, scenarioId);
  }
  /**
   * Re-evaluate every scenario and enqueue any that are eligible to run
   * automatically. Idempotent: already shown / queued scenarios are skipped.
   *
   * The automatic eligibility rules are:
   * 1. If `onboarding.enabled` is `false`, nothing runs automatically — this
   *    method returns immediately, and developer mode does NOT override it.
   * 2. If a scenario declares an `experiment`, it only runs when the experiment
   *    is active AND the user is in the treatment arm (see below) — OR when
   *    developer mode is enabled for that scenario, which bypasses the experiment
   *    gate so the tour can be previewed locally.
   * 3. If a scenario has no `experiment`, it runs for every user that meets its
   *    `when`/trigger criteria (the typical state once an experiment has graduated
   *    and the tour is rolled out to everyone).
   *
   * For an experiment-active scenario, reaching eligibility *is* the "would-show"
   * moment: the telemetry gate is opened for the experiment's assignment-context id
   * (in both arms), and then only the treatment arm is enqueued to actually show the
   * tour. Control opens the gate but renders nothing and is not marked as shown.
   *
   * Developer mode is the exception: it shows the tour unconditionally and never
   * opens the telemetry gate, so a local preview can never affect the experiment
   * scorecard regardless of which arm the developer happens to be assigned to.
   */
  _evaluate() {
    if (!this._enabled || this._stopped) {
      return;
    }
    const claimedSeenKeys = /* @__PURE__ */ new Set();
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      if (!scenario.repeatable && this._pending.has(scenario.id)) {
        claimedSeenKeys.add(this._seenKey(scenario));
      }
    }
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      if (!this._isAutoEligible(scenario)) {
        continue;
      }
      const seenKey = this._seenKey(scenario);
      if (!scenario.repeatable && claimedSeenKeys.has(seenKey)) {
        continue;
      }
      const experiment = scenario.experiment ? this._experimentStates.get(scenario.id) : void 0;
      if (experiment?.active && !this._isDeveloperMode(scenario.id)) {
        this._openGate(experiment.assignmentContextId);
        if (!experiment.behavior) {
          continue;
        }
      }
      this._enqueue(scenario);
      if (!scenario.repeatable) {
        claimedSeenKeys.add(seenKey);
      }
    }
  }
  _isAutoEligible(scenario) {
    if (scenario.trigger.kind === "command") {
      return false;
    }
    if (this._pending.has(scenario.id)) {
      return false;
    }
    if (!scenario.repeatable && this._hasBeenShownKey(this._seenKey(scenario), scenario.id)) {
      return false;
    }
    if (scenario.when && !this.contextKeyService.contextMatchesRules(scenario.when)) {
      return false;
    }
    if (scenario.experiment && this._experimentStates.get(scenario.id)?.active !== true && !this._isDeveloperMode(scenario.id)) {
      return false;
    }
    if (scenario.trigger.kind === "observable" && scenario.trigger.signal.get() !== true) {
      return false;
    }
    return true;
  }
  _enqueue(scenario) {
    if (this._stopped) {
      return Promise.resolve(OnboardingOutcome.Aborted);
    }
    const queued = this._queue.find((entry) => entry.scenario.id === scenario.id);
    if (queued) {
      return queued.deferred.p;
    }
    const inflight = this._inflight.get(scenario.id);
    if (inflight) {
      return inflight.p;
    }
    const deferred = new DeferredPromise();
    this._pending.add(scenario.id);
    this._queue.push({ scenario, deferred });
    this._queue.sort((a, b) => (b.scenario.priority ?? 0) - (a.scenario.priority ?? 0));
    this._pump();
    return deferred.p;
  }
  _pump() {
    if (this._pumping) {
      return;
    }
    this._pumping = true;
    this._doPump();
  }
  async _doPump() {
    await Promise.resolve();
    try {
      let entry;
      while (!this._stopped && (entry = this._queue.shift())) {
        const { scenario, deferred } = entry;
        this._inflight.set(scenario.id, deferred);
        let outcome;
        try {
          outcome = await this._runPresentation(scenario);
        } catch (error) {
          onUnexpectedError(error);
          outcome = OnboardingOutcome.Aborted;
        } finally {
          this._inflight.delete(scenario.id);
          this._pending.delete(scenario.id);
        }
        deferred.complete(outcome);
      }
    } finally {
      this._pumping = false;
    }
  }
  async _runPresentation(scenario) {
    const presentation = onboardingPresentationRegistry.get(scenario.presentation.kind);
    if (!presentation) {
      return OnboardingOutcome.Aborted;
    }
    this._markShown(this._seenKey(scenario));
    const abort = new Emitter();
    this._activeAbort = abort;
    const startTime = Date.now();
    try {
      const result = await presentation.run(scenario, { targetWindow: mainWindow, onAbort: abort.event });
      this._recordOutcome(this._seenKey(scenario), result.outcome);
      if (result.shown) {
        this._reportOutcome(scenario, result, Date.now() - startTime);
      }
      return result.outcome;
    } finally {
      this._activeAbort = void 0;
      abort.dispose();
    }
  }
  /** Emit per-tour telemetry. Only called when a tour was actually shown. */
  _reportOutcome(scenario, result, durationMs) {
    const experimentActive = !!scenario.experiment && this._experimentStates.get(scenario.id)?.active === true;
    this.telemetryService.publicLog2("onboarding.scenarioOutcome", {
      scenarioId: scenario.id,
      outcome: result.outcome,
      dismissReason: result.dismissReason,
      lastStepIndex: result.lastStepIndex,
      stepCount: result.stepCount,
      durationMs,
      experimentActive
    });
  }
  //#endregion
  //#region Triggers & experiments
  _registerTriggerListeners() {
    this._triggerListeners.clear();
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      if (scenario.trigger.kind === "observable") {
        const signal = scenario.trigger.signal;
        this._triggerListeners.add(autorun((reader) => {
          signal.read(reader);
          this._evaluate();
        }));
      }
    }
  }
  /**
   * Resolve the two experiment treatment flags for each scenario that declares an experiment.
   * The experiment is only active when both resolve: the boolean to a boolean and the id to a
   * non-empty string that starts with {@link ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}. Resolved
   * once per scenario; re-evaluation is triggered when an experiment becomes active.
   */
  _resolveExperiments() {
    for (const scenario of onboardingScenarioRegistry.getScenarios()) {
      const experiment = scenario.experiment;
      if (!experiment || this._experimentStates.has(scenario.id)) {
        continue;
      }
      this._experimentStates.set(scenario.id, { active: false, behavior: false, assignmentContextId: "" });
      Promise.all([
        this.assignmentService.getTreatment(experiment.behaviorFlag),
        this.assignmentService.getTreatment(experiment.assignmentContextIdFlag)
      ]).then(([behavior, assignmentContextId]) => {
        const hasBehavior = typeof behavior === "boolean";
        const hasId = typeof assignmentContextId === "string" && assignmentContextId.length > 0;
        const hasValidId = hasId && assignmentContextId.startsWith(ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX);
        if (hasId && !hasValidId) {
          onUnexpectedError(new Error(`Onboarding experiment for scenario '${scenario.id}' resolved an assignment-context id '${assignmentContextId}' that does not start with the required '${ONBOARDING_ASSIGNMENT_CONTEXT_PREFIX}' prefix; treating the experiment as inactive.`));
        }
        const active = hasBehavior && hasValidId;
        this._experimentStates.set(scenario.id, {
          active,
          behavior: behavior === true,
          assignmentContextId: active ? assignmentContextId : ""
        });
        if (active) {
          this._evaluate();
        }
      }, (error) => onUnexpectedError(error));
    }
  }
  //#endregion
  //#region Telemetry gate
  _loadOpenedIds() {
    const raw = this.storageService.get(OnboardingScenarioService.OPENED_IDS_STORAGE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === "string")) : /* @__PURE__ */ new Set();
    } catch (error) {
      onUnexpectedError(error);
      return /* @__PURE__ */ new Set();
    }
  }
  /**
   * Open the telemetry gate for an assignment-context id: from now on (and after reload) the
   * id is no longer filtered out, so every event carries it. Idempotent.
   */
  _openGate(assignmentContextId) {
    if (!assignmentContextId || this._openedAssignmentContextIds.has(assignmentContextId)) {
      return;
    }
    this._openedAssignmentContextIds.add(assignmentContextId);
    this.storageService.store(
      OnboardingScenarioService.OPENED_IDS_STORAGE_KEY,
      JSON.stringify(Array.from(this._openedAssignmentContextIds)),
      StorageScope.APPLICATION,
      StorageTarget.MACHINE
    );
    this._onDidChangeOpenedIds.fire();
  }
  //#endregion
  //#region Persistence
  /**
   * The key under which a scenario's once-per-user "shown" state is stored.
   * Scenarios may opt into a shared {@link IOnboardingScenario.seenKey} so that
   * variations of the same onboarding are gated together; otherwise the
   * scenario id is used.
   */
  _seenKey(scenario) {
    return scenario.seenKey ?? scenario.id;
  }
  _hasBeenShownKey(key, scenarioId) {
    if (this._isDeveloperMode(scenarioId)) {
      return this._shownSinceStart.has(key);
    }
    return !!this._state[key]?.shownAt;
  }
  _markShown(id) {
    this._shownSinceStart.add(id);
    const previous = this._state[id];
    const next = {
      shownAt: Date.now(),
      outcome: previous?.outcome,
      seenCount: (previous?.seenCount ?? 0) + 1
    };
    this._state[id] = next;
    this._memento.saveMemento();
  }
  _recordOutcome(id, outcome) {
    const state = this._state[id];
    if (state) {
      state.outcome = outcome;
      this._memento.saveMemento();
    }
  }
  //#endregion
};
OnboardingScenarioService.MEMENTO_ID = "onboarding";
/**
 * Storage key for the set of assignment-context identifiers whose telemetry gate has been
 * opened (the user reached the onboarding moment). Persisted so the identifier keeps
 * flowing across reloads/relaunches until the experiment is stopped.
 */
OnboardingScenarioService.OPENED_IDS_STORAGE_KEY = "onboarding.openedAssignmentContextIds";
OnboardingScenarioService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IWorkbenchAssignmentService),
  __decorateParam(5, ITelemetryService)
], OnboardingScenarioService);
function getAssignmentContextVariant(assignment) {
  const separatorIndex = assignment.lastIndexOf(":");
  return separatorIndex === -1 ? assignment : assignment.slice(0, separatorIndex);
}
export {
  OnboardingScenarioService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL29uYm9hcmRpbmcvYnJvd3Nlci9vbmJvYXJkaW5nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IG9uYm9hcmRpbmdQcmVzZW50YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9vbmJvYXJkaW5nUHJlc2VudGF0aW9uLmpzJztcbmltcG9ydCB7IG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL29uYm9hcmRpbmdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJT25ib2FyZGluZ1J1blJlc3VsdCwgSU9uYm9hcmRpbmdTY2VuYXJpbywgT05CT0FSRElOR19BU1NJR05NRU5UX0NPTlRFWFRfUFJFRklYLCBPbmJvYXJkaW5nT3V0Y29tZSB9IGZyb20gJy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW8uanMnO1xuaW1wb3J0IHsgaXNPbmJvYXJkaW5nRGV2ZWxvcGVyTW9kZUVuYWJsZWQsIElPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlLCBPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJRywgT05CT0FSRElOR19FTkFCTEVEX0NPTkZJRyB9IGZyb20gJy4uL2NvbW1vbi9vbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlLmpzJztcblxuLyoqIFBlcnNpc3RlZCBcInNob3duXCIgc3RhdGUgZm9yIGEgc2luZ2xlIHNjZW5hcmlvLiAqL1xuaW50ZXJmYWNlIElTY2VuYXJpb1N0YXRlIHtcblx0cmVhZG9ubHkgc2hvd25BdDogbnVtYmVyO1xuXHRvdXRjb21lPzogT25ib2FyZGluZ091dGNvbWU7XG5cdHNlZW5Db3VudDogbnVtYmVyO1xufVxuXG50eXBlIE9uYm9hcmRpbmdNZW1lbnRvRGF0YSA9IHsgW3NjZW5hcmlvSWQ6IHN0cmluZ106IElTY2VuYXJpb1N0YXRlIH07XG5cbi8qKiBSZXNvbHZlZCBleHBlcmltZW50IHRyZWF0bWVudCBzdGF0ZSBmb3IgYSBzY2VuYXJpbyB0aGF0IGRlY2xhcmVzIGFuIGV4cGVyaW1lbnQuICovXG5pbnRlcmZhY2UgSUV4cGVyaW1lbnRTdGF0ZSB7XG5cdC8qKiBCb3RoIHRyZWF0bWVudCBmbGFncyByZXNvbHZlZCAodGhlIGV4cGVyaW1lbnQgaXMgY29uZmlndXJlZCBmb3IgdGhpcyB1c2VyKS4gKi9cblx0cmVhZG9ubHkgYWN0aXZlOiBib29sZWFuO1xuXHQvKiogVmFsdWUgb2YgdGhlIGJvb2xlYW4gYmVoYXZpb3IgZmxhZzogYHRydWVgIHNob3dzIHRoZSB0b3VyICh0cmVhdG1lbnQpLCBgZmFsc2VgIGlzIGNvbnRyb2wuICovXG5cdHJlYWRvbmx5IGJlaGF2aW9yOiBib29sZWFuO1xuXHQvKiogVmFsdWUgb2YgdGhlIGFzc2lnbm1lbnQtY29udGV4dCBpZCBmbGFnICh0aGUgaWQgdGhlIHNjb3JlY2FyZCBrZXlzIG9uKS4gKi9cblx0cmVhZG9ubHkgYXNzaWdubWVudENvbnRleHRJZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgT25ib2FyZGluZ1NjZW5hcmlvU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT25ib2FyZGluZ1NjZW5hcmlvU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUVNRU5UT19JRCA9ICdvbmJvYXJkaW5nJztcblxuXHQvKipcblx0ICogU3RvcmFnZSBrZXkgZm9yIHRoZSBzZXQgb2YgYXNzaWdubWVudC1jb250ZXh0IGlkZW50aWZpZXJzIHdob3NlIHRlbGVtZXRyeSBnYXRlIGhhcyBiZWVuXG5cdCAqIG9wZW5lZCAodGhlIHVzZXIgcmVhY2hlZCB0aGUgb25ib2FyZGluZyBtb21lbnQpLiBQZXJzaXN0ZWQgc28gdGhlIGlkZW50aWZpZXIga2VlcHNcblx0ICogZmxvd2luZyBhY3Jvc3MgcmVsb2Fkcy9yZWxhdW5jaGVzIHVudGlsIHRoZSBleHBlcmltZW50IGlzIHN0b3BwZWQuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBPUEVORURfSURTX1NUT1JBR0VfS0VZID0gJ29uYm9hcmRpbmcub3BlbmVkQXNzaWdubWVudENvbnRleHRJZHMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbWVudG86IE1lbWVudG88T25ib2FyZGluZ01lbWVudG9EYXRhPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IFBhcnRpYWw8T25ib2FyZGluZ01lbWVudG9EYXRhPjtcblxuXHQvKiogTGlzdGVuZXJzIGZvciBgb2JzZXJ2YWJsZWAgdHJpZ2dlcnMsIHJlYnVpbHQgd2hlbmV2ZXIgdGhlIHJlZ2lzdHJ5IGNoYW5nZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyaWdnZXJMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8qKiBTY2VuYXJpbyBpZHMgY3VycmVudGx5IHF1ZXVlZCBvciBydW5uaW5nIChwcmV2ZW50cyBkb3VibGUtc2NoZWR1bGluZykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmcgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVldWU6IHsgc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW87IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+IH1bXSA9IFtdO1xuXHQvKiogRGVmZXJyZWRzIGZvciBzY2VuYXJpb3MgdGhhdCBoYXZlIGJlZW4gZGVxdWV1ZWQgYW5kIGFyZSBjdXJyZW50bHkgcnVubmluZywga2V5ZWQgYnkgaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luZmxpZ2h0ID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4+KCk7XG5cdHByaXZhdGUgX3B1bXBpbmcgPSBmYWxzZTtcblxuXHQvKiogQWJvcnQgc2lnbmFsIGZvciB0aGUgc2NlbmFyaW8gY3VycmVudGx5IHJ1bm5pbmcuICovXG5cdHByaXZhdGUgX2FjdGl2ZUFib3J0OiBFbWl0dGVyPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBSZXNvbHZlZCBleHBlcmltZW50IHRyZWF0bWVudCBzdGF0ZSwga2V5ZWQgYnkgc2NlbmFyaW8gaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4cGVyaW1lbnRTdGF0ZXMgPSBuZXcgTWFwPHN0cmluZywgSUV4cGVyaW1lbnRTdGF0ZT4oKTtcblxuXHQvKipcblx0ICogQXNzaWdubWVudC1jb250ZXh0IGlkcyB3aG9zZSB0ZWxlbWV0cnkgZ2F0ZSBpcyBvcGVuLiBXaGlsZSBhbiBvbmJvYXJkaW5nIGlkIGlzICpub3QqIGluXG5cdCAqIHRoaXMgc2V0LCB0aGUgZWFnZXJseS1yZWdpc3RlcmVkIGZpbHRlciBleGNsdWRlcyBpdCBmcm9tIHRlbGVtZXRyeSAoc2VlIHRoZSBwcmVmaXhcblx0ICogY29uc3RhbnQpLiBUaGUgc2V0IGlzIHNlZWRlZCBmcm9tIHN0b3JhZ2UgYW5kIGdyb3dzIGFzIHVzZXJzIHJlYWNoIHRoZSBvbmJvYXJkaW5nIG1vbWVudC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wZW5lZEFzc2lnbm1lbnRDb250ZXh0SWRzOiBTZXQ8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcGVuZWRJZHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRwcml2YXRlIF9zdGFydGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX3N0b3BwZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd25TaW5jZVN0YXJ0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9tZW1lbnRvID0gbmV3IE1lbWVudG8oT25ib2FyZGluZ1NjZW5hcmlvU2VydmljZS5NRU1FTlRPX0lELCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9zdGF0ZSA9IHRoaXMuX21lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHR0aGlzLl9vcGVuZWRBc3NpZ25tZW50Q29udGV4dElkcyA9IHRoaXMuX2xvYWRPcGVuZWRJZHMoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSB0ZWxlbWV0cnkgZ2F0ZSBmaWx0ZXIgZWFnZXJseSAoaW4gdGhlIGNvbnN0cnVjdG9yKSBzbyBvbmJvYXJkaW5nXG5cdFx0Ly8gYXNzaWdubWVudC1jb250ZXh0IGlkcyBhcmUgZXhjbHVkZWQgZnJvbSB0aGUgdmVyeSBmaXJzdCBldmVudCBcdTIwMTQgYmVmb3JlIHRoZSB0cmVhdG1lbnRcblx0XHQvLyBmbGFncyByZXNvbHZlLiBUaGUgZmlsdGVyIGJsb2NrcyBhbnkgaWQgd2l0aCB0aGUgcmVzZXJ2ZWQgb25ib2FyZGluZyBwcmVmaXggdW5sZXNzIGl0c1xuXHRcdC8vIGdhdGUgaGFzIGFscmVhZHkgYmVlbiBvcGVuZWQgKHRoaXMgc2Vzc2lvbiBvciBwZXJzaXN0ZWQgZnJvbSBhIHByZXZpb3VzIG9uZSkuXG5cdFx0dGhpcy5hc3NpZ25tZW50U2VydmljZS5hZGRUZWxlbWV0cnlBc3NpZ25tZW50RmlsdGVyKHtcblx0XHRcdGlkOiAnb25ib2FyZGluZycsXG5cdFx0XHRleGNsdWRlOiBhc3NpZ25tZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgdmFyaWFudCA9IGdldEFzc2lnbm1lbnRDb250ZXh0VmFyaWFudChhc3NpZ25tZW50KTtcblx0XHRcdFx0cmV0dXJuIHZhcmlhbnQuc3RhcnRzV2l0aChPTkJPQVJESU5HX0FTU0lHTk1FTlRfQ09OVEVYVF9QUkVGSVgpICYmICF0aGlzLl9vcGVuZWRBc3NpZ25tZW50Q29udGV4dElkcy5oYXModmFyaWFudCk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX29uRGlkQ2hhbmdlT3BlbmVkSWRzLmV2ZW50XG5cdFx0fSk7XG5cblx0XHQvLyBPbiBzaHV0ZG93biBhYm9ydCB0aGUgYWN0aXZlIHJ1biBhbmQgZHJhaW4gYW55dGhpbmcgc3RpbGwgcXVldWVkIHNvIG5vXG5cdFx0Ly8gZnJlc2ggb3ZlcmxheSBpcyBtb3VudGVkIHdoaWxlIHRoZSB3aW5kb3cgaXMgZ29pbmcgYXdheS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25XaWxsU2h1dGRvd24oKCkgPT4gdGhpcy5fc3RvcCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BwZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2FjdGl2ZUFib3J0Py5maXJlKCk7XG5cblx0XHRsZXQgZW50cnk6IHsgc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW87IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+IH0gfCB1bmRlZmluZWQ7XG5cdFx0d2hpbGUgKChlbnRyeSA9IHRoaXMuX3F1ZXVlLnNoaWZ0KCkpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nLmRlbGV0ZShlbnRyeS5zY2VuYXJpby5pZCk7XG5cdFx0XHRlbnRyeS5kZWZlcnJlZC5jb21wbGV0ZShPbmJvYXJkaW5nT3V0Y29tZS5BYm9ydGVkKTtcblx0XHR9XG5cdH1cblxuXHRzdGFydCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGFydGVkID0gdHJ1ZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyVHJpZ2dlckxpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUV4cGVyaW1lbnRzKCk7XG5cdFx0XHR0aGlzLl9ldmFsdWF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KCgpID0+IHRoaXMuX2V2YWx1YXRlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oT05CT0FSRElOR19FTkFCTEVEX0NPTkZJRykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihPTkJPQVJESU5HX0RFVkVMT1BFUl9NT0RFX0NPTkZJRykpIHtcblx0XHRcdFx0dGhpcy5fZXZhbHVhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlclRyaWdnZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9yZXNvbHZlRXhwZXJpbWVudHMoKTtcblx0XHR0aGlzLl9ldmFsdWF0ZSgpO1xuXHR9XG5cblx0Z2V0U2NlbmFyaW9zKCk6IHJlYWRvbmx5IElPbmJvYXJkaW5nU2NlbmFyaW9bXSB7XG5cdFx0cmV0dXJuIG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LmdldFNjZW5hcmlvcygpO1xuXHR9XG5cblx0YXN5bmMgcnVuU2NlbmFyaW8oaWQ6IHN0cmluZyk6IFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+IHtcblx0XHRjb25zdCBzY2VuYXJpbyA9IG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LmdldFNjZW5hcmlvKGlkKTtcblx0XHRpZiAoIXNjZW5hcmlvKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gb25ib2FyZGluZyBzY2VuYXJpbyAnJHtpZH0nLmApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZW5xdWV1ZShzY2VuYXJpbyk7XG5cdH1cblxuXHRoYXNCZWVuU2hvd24oaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNjZW5hcmlvID0gb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW8oaWQpO1xuXHRcdHJldHVybiB0aGlzLl9oYXNCZWVuU2hvd25LZXkoc2NlbmFyaW8gPyB0aGlzLl9zZWVuS2V5KHNjZW5hcmlvKSA6IGlkLCBpZCk7XG5cdH1cblxuXHRyZXNldChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NlbmFyaW8gPSBvbmJvYXJkaW5nU2NlbmFyaW9SZWdpc3RyeS5nZXRTY2VuYXJpbyhpZCk7XG5cdFx0ZGVsZXRlIHRoaXMuX3N0YXRlW3NjZW5hcmlvID8gdGhpcy5fc2VlbktleShzY2VuYXJpbykgOiBpZF07XG5cdFx0dGhpcy5fbWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0cmVzZXRBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGhpcy5fc3RhdGUpKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fc3RhdGVba2V5XTtcblx0XHR9XG5cdFx0dGhpcy5fbWVtZW50by5zYXZlTWVtZW50bygpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEVsaWdpYmlsaXR5ICYgc2NoZWR1bGluZ1xuXG5cdC8qKlxuXHQgKiBUaGUgbWFzdGVyIHN3aXRjaCBmb3IgKmF1dG9tYXRpYyogb25ib2FyZGluZy4gV2hlbiBgb25ib2FyZGluZy5lbmFibGVkYCBpc1xuXHQgKiBleHBsaWNpdGx5IGBmYWxzZWAsIG5vIHNjZW5hcmlvIGV2ZXIgcnVucyBhdXRvbWF0aWNhbGx5IChkZXZlbG9wZXIgbW9kZSBkb2VzXG5cdCAqIE5PVCBvdmVycmlkZSB0aGlzIFx1MjAxNCBzZWUge0BsaW5rIF9ldmFsdWF0ZX0pLiBBbnkgb3RoZXIgdmFsdWUgKGluY2x1ZGluZyB1bnNldClcblx0ICogaXMgdHJlYXRlZCBhcyBlbmFibGVkLiBPbi1kZW1hbmQge0BsaW5rIHJ1blNjZW5hcmlvfSBpcyBpbnRlbnRpb25hbGx5IGV4ZW1wdFxuXHQgKiBmcm9tIHRoaXMgc3dpdGNoLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX2VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oT05CT0FSRElOR19FTkFCTEVEX0NPTkZJRykgIT09IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZXZlbG9wZXJNb2RlKHNjZW5hcmlvSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc09uYm9hcmRpbmdEZXZlbG9wZXJNb2RlRW5hYmxlZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzY2VuYXJpb0lkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1ldmFsdWF0ZSBldmVyeSBzY2VuYXJpbyBhbmQgZW5xdWV1ZSBhbnkgdGhhdCBhcmUgZWxpZ2libGUgdG8gcnVuXG5cdCAqIGF1dG9tYXRpY2FsbHkuIElkZW1wb3RlbnQ6IGFscmVhZHkgc2hvd24gLyBxdWV1ZWQgc2NlbmFyaW9zIGFyZSBza2lwcGVkLlxuXHQgKlxuXHQgKiBUaGUgYXV0b21hdGljIGVsaWdpYmlsaXR5IHJ1bGVzIGFyZTpcblx0ICogMS4gSWYgYG9uYm9hcmRpbmcuZW5hYmxlZGAgaXMgYGZhbHNlYCwgbm90aGluZyBydW5zIGF1dG9tYXRpY2FsbHkgXHUyMDE0IHRoaXNcblx0ICogICAgbWV0aG9kIHJldHVybnMgaW1tZWRpYXRlbHksIGFuZCBkZXZlbG9wZXIgbW9kZSBkb2VzIE5PVCBvdmVycmlkZSBpdC5cblx0ICogMi4gSWYgYSBzY2VuYXJpbyBkZWNsYXJlcyBhbiBgZXhwZXJpbWVudGAsIGl0IG9ubHkgcnVucyB3aGVuIHRoZSBleHBlcmltZW50XG5cdCAqICAgIGlzIGFjdGl2ZSBBTkQgdGhlIHVzZXIgaXMgaW4gdGhlIHRyZWF0bWVudCBhcm0gKHNlZSBiZWxvdykgXHUyMDE0IE9SIHdoZW5cblx0ICogICAgZGV2ZWxvcGVyIG1vZGUgaXMgZW5hYmxlZCBmb3IgdGhhdCBzY2VuYXJpbywgd2hpY2ggYnlwYXNzZXMgdGhlIGV4cGVyaW1lbnRcblx0ICogICAgZ2F0ZSBzbyB0aGUgdG91ciBjYW4gYmUgcHJldmlld2VkIGxvY2FsbHkuXG5cdCAqIDMuIElmIGEgc2NlbmFyaW8gaGFzIG5vIGBleHBlcmltZW50YCwgaXQgcnVucyBmb3IgZXZlcnkgdXNlciB0aGF0IG1lZXRzIGl0c1xuXHQgKiAgICBgd2hlbmAvdHJpZ2dlciBjcml0ZXJpYSAodGhlIHR5cGljYWwgc3RhdGUgb25jZSBhbiBleHBlcmltZW50IGhhcyBncmFkdWF0ZWRcblx0ICogICAgYW5kIHRoZSB0b3VyIGlzIHJvbGxlZCBvdXQgdG8gZXZlcnlvbmUpLlxuXHQgKlxuXHQgKiBGb3IgYW4gZXhwZXJpbWVudC1hY3RpdmUgc2NlbmFyaW8sIHJlYWNoaW5nIGVsaWdpYmlsaXR5ICppcyogdGhlIFwid291bGQtc2hvd1wiXG5cdCAqIG1vbWVudDogdGhlIHRlbGVtZXRyeSBnYXRlIGlzIG9wZW5lZCBmb3IgdGhlIGV4cGVyaW1lbnQncyBhc3NpZ25tZW50LWNvbnRleHQgaWRcblx0ICogKGluIGJvdGggYXJtcyksIGFuZCB0aGVuIG9ubHkgdGhlIHRyZWF0bWVudCBhcm0gaXMgZW5xdWV1ZWQgdG8gYWN0dWFsbHkgc2hvdyB0aGVcblx0ICogdG91ci4gQ29udHJvbCBvcGVucyB0aGUgZ2F0ZSBidXQgcmVuZGVycyBub3RoaW5nIGFuZCBpcyBub3QgbWFya2VkIGFzIHNob3duLlxuXHQgKlxuXHQgKiBEZXZlbG9wZXIgbW9kZSBpcyB0aGUgZXhjZXB0aW9uOiBpdCBzaG93cyB0aGUgdG91ciB1bmNvbmRpdGlvbmFsbHkgYW5kIG5ldmVyXG5cdCAqIG9wZW5zIHRoZSB0ZWxlbWV0cnkgZ2F0ZSwgc28gYSBsb2NhbCBwcmV2aWV3IGNhbiBuZXZlciBhZmZlY3QgdGhlIGV4cGVyaW1lbnRcblx0ICogc2NvcmVjYXJkIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggYXJtIHRoZSBkZXZlbG9wZXIgaGFwcGVucyB0byBiZSBhc3NpZ25lZCB0by5cblx0ICovXG5cdHByaXZhdGUgX2V2YWx1YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCB8fCB0aGlzLl9zdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VlbiBrZXlzIGFscmVhZHkgY2xhaW1lZCBieSBhIHBlbmRpbmcvcXVldWVkL3J1bm5pbmcgbm9uLXJlcGVhdGFibGVcblx0XHQvLyBzY2VuYXJpby4gU2NlbmFyaW9zIHRoYXQgc2hhcmUgYSBgc2VlbktleWAgYXJlIGdhdGVkIHRvZ2V0aGVyLCBzbyBvbmNlXG5cdFx0Ly8gb25lIHNpYmxpbmcgaXMgc2NoZWR1bGVkIHdlIG11c3Qgbm90IGFsc28gc2NoZWR1bGUgYW5vdGhlciBpbiB0aGUgc2FtZVxuXHRcdC8vIHBhc3M6IHNob3duIHN0YXRlIGlzIG9ubHkgd3JpdHRlbiB3aGVuIGEgc2NlbmFyaW8gc3RhcnRzIHJ1bm5pbmcsIGFmdGVyXG5cdFx0Ly8gdGhlIHF1ZXVlIGhhcyBiZWVuIHBvcHVsYXRlZCwgc28gdGhlIHNoYXJlZC1rZXkgY2hlY2sgaW5cblx0XHQvLyBgX2lzQXV0b0VsaWdpYmxlYCBjYW5ub3Qgc2VlIHRoZSBzaWJsaW5nIHlldC5cblx0XHRjb25zdCBjbGFpbWVkU2VlbktleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHNjZW5hcmlvIG9mIG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LmdldFNjZW5hcmlvcygpKSB7XG5cdFx0XHRpZiAoIXNjZW5hcmlvLnJlcGVhdGFibGUgJiYgdGhpcy5fcGVuZGluZy5oYXMoc2NlbmFyaW8uaWQpKSB7XG5cdFx0XHRcdGNsYWltZWRTZWVuS2V5cy5hZGQodGhpcy5fc2VlbktleShzY2VuYXJpbykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2NlbmFyaW8gb2Ygb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW9zKCkpIHtcblx0XHRcdGlmICghdGhpcy5faXNBdXRvRWxpZ2libGUoc2NlbmFyaW8pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWVuS2V5ID0gdGhpcy5fc2VlbktleShzY2VuYXJpbyk7XG5cdFx0XHRpZiAoIXNjZW5hcmlvLnJlcGVhdGFibGUgJiYgY2xhaW1lZFNlZW5LZXlzLmhhcyhzZWVuS2V5KSkge1xuXHRcdFx0XHQvLyBBIHNpYmxpbmcgc2hhcmluZyB0aGlzIHNlZW4ga2V5IGlzIGFscmVhZHkgc2NoZWR1bGVkIHRoaXMgcGFzcztcblx0XHRcdFx0Ly8gc2hvd2luZyBpdCB3aWxsIG1hcmsgdGhpcyBzY2VuYXJpbyBzZWVuIHRvby5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4cGVyaW1lbnQgPSBzY2VuYXJpby5leHBlcmltZW50ID8gdGhpcy5fZXhwZXJpbWVudFN0YXRlcy5nZXQoc2NlbmFyaW8uaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGV4cGVyaW1lbnQ/LmFjdGl2ZSAmJiAhdGhpcy5faXNEZXZlbG9wZXJNb2RlKHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0XHQvLyBXb3VsZC1zaG93IHJlYWNoZWQ6IHN0YXJ0IGVtaXR0aW5nIHRoZSBhc3NpZ25tZW50LWNvbnRleHQgaWQgZnJvbSBub3cgb24uXG5cdFx0XHRcdC8vIFNraXBwZWQgZW50aXJlbHkgaW4gZGV2ZWxvcGVyIG1vZGUgc28gYSBsb2NhbCBwcmV2aWV3IG5ldmVyIG9wZW5zIHRoZVxuXHRcdFx0XHQvLyB0ZWxlbWV0cnkgZ2F0ZSBhbmQgbmV2ZXIgYWZmZWN0cyB0aGUgZXhwZXJpbWVudCBzY29yZWNhcmQgKHRoZSB0b3VyIGlzXG5cdFx0XHRcdC8vIHNob3duIHVuY29uZGl0aW9uYWxseSBiZWxvdyBpbnN0ZWFkKS5cblx0XHRcdFx0dGhpcy5fb3BlbkdhdGUoZXhwZXJpbWVudC5hc3NpZ25tZW50Q29udGV4dElkKTtcblx0XHRcdFx0aWYgKCFleHBlcmltZW50LmJlaGF2aW9yKSB7XG5cdFx0XHRcdFx0Ly8gQ29udHJvbCBhcm06IHRoZSBpZGVudGlmaWVyIG5vdyBmbG93cywgYnV0IG5vIHRvdXIgaXMgc2hvd24gYW5kIHRoZVxuXHRcdFx0XHRcdC8vIHNjZW5hcmlvIGlzIGxlZnQgdW4tc2hvd24gc28gdGhlIHVzZXIgc3RheXMgZWxpZ2libGUgdG8gc2VlIGl0IGxhdGVyLlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VucXVldWUoc2NlbmFyaW8pO1xuXHRcdFx0aWYgKCFzY2VuYXJpby5yZXBlYXRhYmxlKSB7XG5cdFx0XHRcdGNsYWltZWRTZWVuS2V5cy5hZGQoc2VlbktleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaXNBdXRvRWxpZ2libGUoc2NlbmFyaW86IElPbmJvYXJkaW5nU2NlbmFyaW8pOiBib29sZWFuIHtcblx0XHQvLyBgY29tbWFuZGAgdHJpZ2dlcnMgbmV2ZXIgcnVuIGF1dG9tYXRpY2FsbHkuXG5cdFx0aWYgKHNjZW5hcmlvLnRyaWdnZXIua2luZCA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmcuaGFzKHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghc2NlbmFyaW8ucmVwZWF0YWJsZSAmJiB0aGlzLl9oYXNCZWVuU2hvd25LZXkodGhpcy5fc2VlbktleShzY2VuYXJpbyksIHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChzY2VuYXJpby53aGVuICYmICF0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoc2NlbmFyaW8ud2hlbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBFeHBlcmltZW50LWRyaXZlbiBzY2VuYXJpb3Mgb25seSBydW4gb25jZSB0aGUgZXhwZXJpbWVudCBpcyBhY3RpdmUgKGJvdGggdHJlYXRtZW50XG5cdFx0Ly8gZmxhZ3MgcmVzb2x2ZWQpLiBUaGUgYmVoYXZpb3IgZmxhZyBkb2VzIE5PVCBnYXRlIGVsaWdpYmlsaXR5IFx1MjAxNCBjb250cm9sIHN0aWxsIHJlYWNoZXNcblx0XHQvLyB0aGUgd291bGQtc2hvdyBtb21lbnQgc28gdGhlIGdhdGUgb3BlbnMgZm9yIGl0IHRvby5cblx0XHQvL1xuXHRcdC8vIERldmVsb3BlciBtb2RlIGZvciB0aGlzIHNjZW5hcmlvIGJ5cGFzc2VzIHRoZSBleHBlcmltZW50IGdhdGUgZW50aXJlbHkgc28gdGhlIHRvdXJcblx0XHQvLyBjYW4gYmUgdGVzdGVkIGxvY2FsbHkgd2l0aG91dCB0aGUgZXhwZXJpbWVudCBydW5uaW5nIChvciBiZWluZyBhc3NpZ25lZCB0byB0aGVcblx0XHQvLyB1c2VyKS4gQSBkZXZlbG9wZXItbW9kZSBwcmV2aWV3IG5ldmVyIG9wZW5zIHRoZSBhc3NpZ25tZW50LWNvbnRleHQgZ2F0ZSAoc2VlXG5cdFx0Ly8gYF9ldmFsdWF0ZWApLCBzbyBpdCBuZXZlciBwb2xsdXRlcyB0aGUgc2NvcmVjYXJkLlxuXHRcdGlmIChzY2VuYXJpby5leHBlcmltZW50ICYmIHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuZ2V0KHNjZW5hcmlvLmlkKT8uYWN0aXZlICE9PSB0cnVlICYmICF0aGlzLl9pc0RldmVsb3Blck1vZGUoc2NlbmFyaW8uaWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHNjZW5hcmlvLnRyaWdnZXIua2luZCA9PT0gJ29ic2VydmFibGUnICYmIHNjZW5hcmlvLnRyaWdnZXIuc2lnbmFsLmdldCgpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9lbnF1ZXVlKHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvKTogUHJvbWlzZTxPbmJvYXJkaW5nT3V0Y29tZT4ge1xuXHRcdGlmICh0aGlzLl9zdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQpO1xuXHRcdH1cblxuXHRcdC8vIERlLWR1cGxpY2F0ZSBhZ2FpbnN0IGJvdGggdGhlIHF1ZXVlIGFuZCB0aGUgaW4tZmxpZ2h0IHJ1biBzbyBhIHJlcGVhdGVkXG5cdFx0Ly8gYHJ1blNjZW5hcmlvKGlkKWAgKGUuZy4gYSBjb21tYW5kIGludm9rZWQgd2hpbGUgdGhlIHRvdXIgaXMgYWN0aXZlKVxuXHRcdC8vIGpvaW5zIHRoZSBleGlzdGluZyBydW4gaW5zdGVhZCBvZiBzY2hlZHVsaW5nIGEgc2Vjb25kIG9uZS5cblx0XHRjb25zdCBxdWV1ZWQgPSB0aGlzLl9xdWV1ZS5maW5kKGVudHJ5ID0+IGVudHJ5LnNjZW5hcmlvLmlkID09PSBzY2VuYXJpby5pZCk7XG5cdFx0aWYgKHF1ZXVlZCkge1xuXHRcdFx0cmV0dXJuIHF1ZXVlZC5kZWZlcnJlZC5wO1xuXHRcdH1cblx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX2luZmxpZ2h0LmdldChzY2VuYXJpby5pZCk7XG5cdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gaW5mbGlnaHQucDtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+KCk7XG5cdFx0dGhpcy5fcGVuZGluZy5hZGQoc2NlbmFyaW8uaWQpO1xuXHRcdHRoaXMuX3F1ZXVlLnB1c2goeyBzY2VuYXJpbywgZGVmZXJyZWQgfSk7XG5cdFx0Ly8gSGlnaGVzdCBwcmlvcml0eSBmaXJzdDsgc3RhYmxlIGZvciBlcXVhbCBwcmlvcml0aWVzLlxuXHRcdHRoaXMuX3F1ZXVlLnNvcnQoKGEsIGIpID0+IChiLnNjZW5hcmlvLnByaW9yaXR5ID8/IDApIC0gKGEuc2NlbmFyaW8ucHJpb3JpdHkgPz8gMCkpO1xuXG5cdFx0dGhpcy5fcHVtcCgpO1xuXHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVtcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHVtcGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNYXJrIGFzIHB1bXBpbmcgc3luY2hyb25vdXNseSBzbyBhIGJhdGNoIG9mIGBfZW5xdWV1ZWAgY2FsbHMgbWFkZSBpbiB0aGVcblx0XHQvLyBzYW1lIHRpY2sgYWxsIGxhbmQgKGFuZCByZS1zb3J0IGJ5IHByaW9yaXR5KSBiZWZvcmUgd2UgY29uc3VtZSB0aGUgcXVldWUuXG5cdFx0dGhpcy5fcHVtcGluZyA9IHRydWU7XG5cdFx0dGhpcy5fZG9QdW1wKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1B1bXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7IC8vIGxldCB0aGUgY3VycmVudCBzeW5jaHJvbm91cyBiYXRjaCBvZiBlbnF1ZXVlcyBzZXR0bGVcblx0XHR0cnkge1xuXHRcdFx0bGV0IGVudHJ5OiB7IHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvOyBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPE9uYm9hcmRpbmdPdXRjb21lPiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0d2hpbGUgKCF0aGlzLl9zdG9wcGVkICYmIChlbnRyeSA9IHRoaXMuX3F1ZXVlLnNoaWZ0KCkpKSB7XG5cdFx0XHRcdGNvbnN0IHsgc2NlbmFyaW8sIGRlZmVycmVkIH0gPSBlbnRyeTtcblx0XHRcdFx0Ly8gVHJhY2sgdGhlIHJ1bm5pbmcgc2NlbmFyaW8gc28gYSBjb25jdXJyZW50IGBfZW5xdWV1ZWAgZm9yIHRoZSBzYW1lXG5cdFx0XHRcdC8vIGlkIGpvaW5zIHRoaXMgcnVuIGluc3RlYWQgb2Ygc2NoZWR1bGluZyBhbm90aGVyLlxuXHRcdFx0XHR0aGlzLl9pbmZsaWdodC5zZXQoc2NlbmFyaW8uaWQsIGRlZmVycmVkKTtcblx0XHRcdFx0bGV0IG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG91dGNvbWUgPSBhd2FpdCB0aGlzLl9ydW5QcmVzZW50YXRpb24oc2NlbmFyaW8pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdFx0XHRvdXRjb21lID0gT25ib2FyZGluZ091dGNvbWUuQWJvcnRlZDtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9pbmZsaWdodC5kZWxldGUoc2NlbmFyaW8uaWQpO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKHNjZW5hcmlvLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZShvdXRjb21lKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcHVtcGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blByZXNlbnRhdGlvbihzY2VuYXJpbzogSU9uYm9hcmRpbmdTY2VuYXJpbyk6IFByb21pc2U8T25ib2FyZGluZ091dGNvbWU+IHtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBvbmJvYXJkaW5nUHJlc2VudGF0aW9uUmVnaXN0cnkuZ2V0KHNjZW5hcmlvLnByZXNlbnRhdGlvbi5raW5kKTtcblx0XHRpZiAoIXByZXNlbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuIE9uYm9hcmRpbmdPdXRjb21lLkFib3J0ZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBzaG93biB0aGUgbW9tZW50IGEgc2NlbmFyaW8gc3RhcnRzIHNvIGEgY3Jhc2gvcmVsb2FkIHdvbid0IHJlLXRyaWdnZXIgaXQuXG5cdFx0dGhpcy5fbWFya1Nob3duKHRoaXMuX3NlZW5LZXkoc2NlbmFyaW8pKTtcblxuXHRcdGNvbnN0IGFib3J0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHR0aGlzLl9hY3RpdmVBYm9ydCA9IGFib3J0O1xuXHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByZXNlbnRhdGlvbi5ydW4oc2NlbmFyaW8sIHsgdGFyZ2V0V2luZG93OiBtYWluV2luZG93LCBvbkFib3J0OiBhYm9ydC5ldmVudCB9KTtcblx0XHRcdHRoaXMuX3JlY29yZE91dGNvbWUodGhpcy5fc2VlbktleShzY2VuYXJpbyksIHJlc3VsdC5vdXRjb21lKTtcblx0XHRcdC8vIE9ubHkgZW1pdCBvdXRjb21lIHRlbGVtZXRyeSB3aGVuIGEgdG91ciB3YXMgZ2VudWluZWx5IGRpc3BsYXllZDsgYSBkZWdlbmVyYXRlXG5cdFx0XHQvLyBydW4gdGhhdCByZW5kZXJlZCBub3RoaW5nIChubyBzdGVwcyAvIGFsbCBzdGVwcyBza2lwcGVkKSBtdXN0IG5vdCBwb2xsdXRlIG1ldHJpY3MuXG5cdFx0XHRpZiAocmVzdWx0LnNob3duKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydE91dGNvbWUoc2NlbmFyaW8sIHJlc3VsdCwgRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0Lm91dGNvbWU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2FjdGl2ZUFib3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0YWJvcnQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBFbWl0IHBlci10b3VyIHRlbGVtZXRyeS4gT25seSBjYWxsZWQgd2hlbiBhIHRvdXIgd2FzIGFjdHVhbGx5IHNob3duLiAqL1xuXHRwcml2YXRlIF9yZXBvcnRPdXRjb21lKHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvLCByZXN1bHQ6IElPbmJvYXJkaW5nUnVuUmVzdWx0LCBkdXJhdGlvbk1zOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBleHBlcmltZW50QWN0aXZlID0gISFzY2VuYXJpby5leHBlcmltZW50ICYmIHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuZ2V0KHNjZW5hcmlvLmlkKT8uYWN0aXZlID09PSB0cnVlO1xuXG5cdFx0dHlwZSBPbmJvYXJkaW5nU2NlbmFyaW9PdXRjb21lRXZlbnQgPSB7XG5cdFx0XHRzY2VuYXJpb0lkOiBzdHJpbmc7XG5cdFx0XHRvdXRjb21lOiBzdHJpbmc7XG5cdFx0XHRkaXNtaXNzUmVhc29uOiBzdHJpbmc7XG5cdFx0XHRsYXN0U3RlcEluZGV4OiBudW1iZXI7XG5cdFx0XHRzdGVwQ291bnQ6IG51bWJlcjtcblx0XHRcdGR1cmF0aW9uTXM6IG51bWJlcjtcblx0XHRcdGV4cGVyaW1lbnRBY3RpdmU6IGJvb2xlYW47XG5cdFx0fTtcblx0XHR0eXBlIE9uYm9hcmRpbmdTY2VuYXJpb091dGNvbWVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYmVuaWJlbmonO1xuXHRcdFx0Y29tbWVudDogJ1JlcG9ydHMgaG93IGEgdXNlciBwcm9ncmVzc2VkIHRocm91Z2ggYW4gb25ib2FyZGluZyB0b3VyIHRvIGV2YWx1YXRlIG9uYm9hcmRpbmcgZWZmZWN0aXZlbmVzcy4nO1xuXHRcdFx0c2NlbmFyaW9JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZCBvZiB0aGUgb25ib2FyZGluZyBzY2VuYXJpbyB0aGF0IHJhbi4nIH07XG5cdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IHRoZSB0b3VyIGVuZGVkOiBjb21wbGV0ZWQsIHNraXBwZWQsIGRpc21pc3NlZCBvciBhYm9ydGVkLicgfTtcblx0XHRcdGRpc21pc3NSZWFzb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uY3JldGUgYWN0aW9uIHRoYXQgZW5kZWQgdGhlIHRvdXIsIGUuZy4gc2tpcEJ1dHRvbiwgZXNjYXBlS2V5LCB0YXJnZXRDbGljaywgY29tcGxldGVkIG9yIGFib3J0ZWQuJyB9O1xuXHRcdFx0bGFzdFN0ZXBJbmRleDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBmdXJ0aGVzdCAwLWJhc2VkIHN0ZXAgaW5kZXggdGhlIHVzZXIgcmVhY2hlZC4nIH07XG5cdFx0XHRzdGVwQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgdG90YWwgbnVtYmVyIG9mIHN0ZXBzIGluIHRoZSB0b3VyLicgfTtcblx0XHRcdGR1cmF0aW9uTXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdIb3cgbG9uZyB0aGUgdG91ciB3YXMgb24gc2NyZWVuLCBpbiBtaWxsaXNlY29uZHMuJyB9O1xuXHRcdFx0ZXhwZXJpbWVudEFjdGl2ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgYW4gYWN0aXZlIGV4cGVyaW1lbnQgZHJvdmUgdGhpcyBydW4uJyB9O1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T25ib2FyZGluZ1NjZW5hcmlvT3V0Y29tZUV2ZW50LCBPbmJvYXJkaW5nU2NlbmFyaW9PdXRjb21lQ2xhc3NpZmljYXRpb24+KCdvbmJvYXJkaW5nLnNjZW5hcmlvT3V0Y29tZScsIHtcblx0XHRcdHNjZW5hcmlvSWQ6IHNjZW5hcmlvLmlkLFxuXHRcdFx0b3V0Y29tZTogcmVzdWx0Lm91dGNvbWUsXG5cdFx0XHRkaXNtaXNzUmVhc29uOiByZXN1bHQuZGlzbWlzc1JlYXNvbixcblx0XHRcdGxhc3RTdGVwSW5kZXg6IHJlc3VsdC5sYXN0U3RlcEluZGV4LFxuXHRcdFx0c3RlcENvdW50OiByZXN1bHQuc3RlcENvdW50LFxuXHRcdFx0ZHVyYXRpb25Ncyxcblx0XHRcdGV4cGVyaW1lbnRBY3RpdmVcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUcmlnZ2VycyAmIGV4cGVyaW1lbnRzXG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJUcmlnZ2VyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyaWdnZXJMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHNjZW5hcmlvIG9mIG9uYm9hcmRpbmdTY2VuYXJpb1JlZ2lzdHJ5LmdldFNjZW5hcmlvcygpKSB7XG5cdFx0XHRpZiAoc2NlbmFyaW8udHJpZ2dlci5raW5kID09PSAnb2JzZXJ2YWJsZScpIHtcblx0XHRcdFx0Y29uc3Qgc2lnbmFsID0gc2NlbmFyaW8udHJpZ2dlci5zaWduYWw7XG5cdFx0XHRcdHRoaXMuX3RyaWdnZXJMaXN0ZW5lcnMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRzaWduYWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdHRoaXMuX2V2YWx1YXRlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgdHdvIGV4cGVyaW1lbnQgdHJlYXRtZW50IGZsYWdzIGZvciBlYWNoIHNjZW5hcmlvIHRoYXQgZGVjbGFyZXMgYW4gZXhwZXJpbWVudC5cblx0ICogVGhlIGV4cGVyaW1lbnQgaXMgb25seSBhY3RpdmUgd2hlbiBib3RoIHJlc29sdmU6IHRoZSBib29sZWFuIHRvIGEgYm9vbGVhbiBhbmQgdGhlIGlkIHRvIGFcblx0ICogbm9uLWVtcHR5IHN0cmluZyB0aGF0IHN0YXJ0cyB3aXRoIHtAbGluayBPTkJPQVJESU5HX0FTU0lHTk1FTlRfQ09OVEVYVF9QUkVGSVh9LiBSZXNvbHZlZFxuXHQgKiBvbmNlIHBlciBzY2VuYXJpbzsgcmUtZXZhbHVhdGlvbiBpcyB0cmlnZ2VyZWQgd2hlbiBhbiBleHBlcmltZW50IGJlY29tZXMgYWN0aXZlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUV4cGVyaW1lbnRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2NlbmFyaW8gb2Ygb25ib2FyZGluZ1NjZW5hcmlvUmVnaXN0cnkuZ2V0U2NlbmFyaW9zKCkpIHtcblx0XHRcdGNvbnN0IGV4cGVyaW1lbnQgPSBzY2VuYXJpby5leHBlcmltZW50O1xuXHRcdFx0aWYgKCFleHBlcmltZW50IHx8IHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuaGFzKHNjZW5hcmlvLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFNlZWQgYW4gaW5hY3RpdmUgc3RhdGUgc28gdGhlIHNjZW5hcmlvIGlzIG5vdCBlbGlnaWJsZSB1bnRpbCBib3RoIGZsYWdzIHJlc29sdmUuXG5cdFx0XHR0aGlzLl9leHBlcmltZW50U3RhdGVzLnNldChzY2VuYXJpby5pZCwgeyBhY3RpdmU6IGZhbHNlLCBiZWhhdmlvcjogZmFsc2UsIGFzc2lnbm1lbnRDb250ZXh0SWQ6ICcnIH0pO1xuXHRcdFx0UHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLmFzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxib29sZWFuPihleHBlcmltZW50LmJlaGF2aW9yRmxhZyksXG5cdFx0XHRcdHRoaXMuYXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PHN0cmluZz4oZXhwZXJpbWVudC5hc3NpZ25tZW50Q29udGV4dElkRmxhZylcblx0XHRcdF0pLnRoZW4oKFtiZWhhdmlvciwgYXNzaWdubWVudENvbnRleHRJZF0pID0+IHtcblx0XHRcdFx0Y29uc3QgaGFzQmVoYXZpb3IgPSB0eXBlb2YgYmVoYXZpb3IgPT09ICdib29sZWFuJztcblx0XHRcdFx0Y29uc3QgaGFzSWQgPSB0eXBlb2YgYXNzaWdubWVudENvbnRleHRJZCA9PT0gJ3N0cmluZycgJiYgYXNzaWdubWVudENvbnRleHRJZC5sZW5ndGggPiAwO1xuXG5cdFx0XHRcdC8vIERlZmVuc2l2ZWx5IHJlcXVpcmUgdGhlIHJlc2VydmVkIHByZWZpeC4gVGhlIGVhZ2VyIHRlbGVtZXRyeSBnYXRlIG9ubHkgYmxvY2tzXG5cdFx0XHRcdC8vIGlkcyB0aGF0IHN0YXJ0IHdpdGggaXQsIHNvIGFuIGlkIG1pc3NpbmcgdGhlIHByZWZpeCB3b3VsZCBuZXZlciBiZSBnYXRlZCBhbmRcblx0XHRcdFx0Ly8gd291bGQgbGVhayBpbnRvIHRlbGVtZXRyeSBmcm9tIHRoZSB2ZXJ5IGZpcnN0IGV2ZW50IFx1MjAxNCBzaWxlbnRseSBjb3JydXB0aW5nIHRoZVxuXHRcdFx0XHQvLyBzY29yZWNhcmQgYmFzZWxpbmUuIENhdGNoIHRoZSBtaXNjb25maWd1cmF0aW9uIGxvdWRseSBhbmQgdHJlYXQgdGhlIGV4cGVyaW1lbnRcblx0XHRcdFx0Ly8gYXMgaW5hY3RpdmUgcmF0aGVyIHRoYW4gcnVubmluZyBpdCB3aXRoIGFuIHVuZ2F0ZWQgaWQuXG5cdFx0XHRcdGNvbnN0IGhhc1ZhbGlkSWQgPSBoYXNJZCAmJiBhc3NpZ25tZW50Q29udGV4dElkIS5zdGFydHNXaXRoKE9OQk9BUkRJTkdfQVNTSUdOTUVOVF9DT05URVhUX1BSRUZJWCk7XG5cdFx0XHRcdGlmIChoYXNJZCAmJiAhaGFzVmFsaWRJZCkge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgT25ib2FyZGluZyBleHBlcmltZW50IGZvciBzY2VuYXJpbyAnJHtzY2VuYXJpby5pZH0nIHJlc29sdmVkIGFuIGFzc2lnbm1lbnQtY29udGV4dCBpZCAnJHthc3NpZ25tZW50Q29udGV4dElkfScgdGhhdCBkb2VzIG5vdCBzdGFydCB3aXRoIHRoZSByZXF1aXJlZCAnJHtPTkJPQVJESU5HX0FTU0lHTk1FTlRfQ09OVEVYVF9QUkVGSVh9JyBwcmVmaXg7IHRyZWF0aW5nIHRoZSBleHBlcmltZW50IGFzIGluYWN0aXZlLmApKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFjdGl2ZSA9IGhhc0JlaGF2aW9yICYmIGhhc1ZhbGlkSWQ7XG5cdFx0XHRcdHRoaXMuX2V4cGVyaW1lbnRTdGF0ZXMuc2V0KHNjZW5hcmlvLmlkLCB7XG5cdFx0XHRcdFx0YWN0aXZlLFxuXHRcdFx0XHRcdGJlaGF2aW9yOiBiZWhhdmlvciA9PT0gdHJ1ZSxcblx0XHRcdFx0XHRhc3NpZ25tZW50Q29udGV4dElkOiBhY3RpdmUgPyBhc3NpZ25tZW50Q29udGV4dElkISA6ICcnXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5fZXZhbHVhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgZXJyb3IgPT4gb25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVGVsZW1ldHJ5IGdhdGVcblxuXHRwcml2YXRlIF9sb2FkT3BlbmVkSWRzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChPbmJvYXJkaW5nU2NlbmFyaW9TZXJ2aWNlLk9QRU5FRF9JRFNfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdHJldHVybiBBcnJheS5pc0FycmF5KHBhcnNlZCkgPyBuZXcgU2V0PHN0cmluZz4ocGFyc2VkLmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gdHlwZW9mIGlkID09PSAnc3RyaW5nJykpIDogbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdHJldHVybiBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgdGVsZW1ldHJ5IGdhdGUgZm9yIGFuIGFzc2lnbm1lbnQtY29udGV4dCBpZDogZnJvbSBub3cgb24gKGFuZCBhZnRlciByZWxvYWQpIHRoZVxuXHQgKiBpZCBpcyBubyBsb25nZXIgZmlsdGVyZWQgb3V0LCBzbyBldmVyeSBldmVudCBjYXJyaWVzIGl0LiBJZGVtcG90ZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlbkdhdGUoYXNzaWdubWVudENvbnRleHRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFhc3NpZ25tZW50Q29udGV4dElkIHx8IHRoaXMuX29wZW5lZEFzc2lnbm1lbnRDb250ZXh0SWRzLmhhcyhhc3NpZ25tZW50Q29udGV4dElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vcGVuZWRBc3NpZ25tZW50Q29udGV4dElkcy5hZGQoYXNzaWdubWVudENvbnRleHRJZCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdE9uYm9hcmRpbmdTY2VuYXJpb1NlcnZpY2UuT1BFTkVEX0lEU19TVE9SQUdFX0tFWSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KEFycmF5LmZyb20odGhpcy5fb3BlbmVkQXNzaWdubWVudENvbnRleHRJZHMpKSxcblx0XHRcdFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFN0b3JhZ2VUYXJnZXQuTUFDSElORVxuXHRcdCk7XG5cdFx0Ly8gUmVjb21wdXRlIHRoZSBmaWx0ZXJlZCBhc3NpZ25tZW50IGNvbnRleHQgc28gdGhlIGlkIHN0YXJ0cyBmbG93aW5nIGltbWVkaWF0ZWx5LlxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3BlbmVkSWRzLmZpcmUoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQZXJzaXN0ZW5jZVxuXG5cdC8qKlxuXHQgKiBUaGUga2V5IHVuZGVyIHdoaWNoIGEgc2NlbmFyaW8ncyBvbmNlLXBlci11c2VyIFwic2hvd25cIiBzdGF0ZSBpcyBzdG9yZWQuXG5cdCAqIFNjZW5hcmlvcyBtYXkgb3B0IGludG8gYSBzaGFyZWQge0BsaW5rIElPbmJvYXJkaW5nU2NlbmFyaW8uc2VlbktleX0gc28gdGhhdFxuXHQgKiB2YXJpYXRpb25zIG9mIHRoZSBzYW1lIG9uYm9hcmRpbmcgYXJlIGdhdGVkIHRvZ2V0aGVyOyBvdGhlcndpc2UgdGhlXG5cdCAqIHNjZW5hcmlvIGlkIGlzIHVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9zZWVuS2V5KHNjZW5hcmlvOiBJT25ib2FyZGluZ1NjZW5hcmlvKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc2NlbmFyaW8uc2VlbktleSA/PyBzY2VuYXJpby5pZDtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0JlZW5TaG93bktleShrZXk6IHN0cmluZywgc2NlbmFyaW9JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzRGV2ZWxvcGVyTW9kZShzY2VuYXJpb0lkKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3duU2luY2VTdGFydC5oYXMoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuICEhdGhpcy5fc3RhdGVba2V5XT8uc2hvd25BdDtcblx0fVxuXG5cdHByaXZhdGUgX21hcmtTaG93bihpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd25TaW5jZVN0YXJ0LmFkZChpZCk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9zdGF0ZVtpZF07XG5cdFx0Y29uc3QgbmV4dDogSVNjZW5hcmlvU3RhdGUgPSB7XG5cdFx0XHRzaG93bkF0OiBEYXRlLm5vdygpLFxuXHRcdFx0b3V0Y29tZTogcHJldmlvdXM/Lm91dGNvbWUsXG5cdFx0XHRzZWVuQ291bnQ6IChwcmV2aW91cz8uc2VlbkNvdW50ID8/IDApICsgMVxuXHRcdH07XG5cdFx0dGhpcy5fc3RhdGVbaWRdID0gbmV4dDtcblx0XHR0aGlzLl9tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRPdXRjb21lKGlkOiBzdHJpbmcsIG91dGNvbWU6IE9uYm9hcmRpbmdPdXRjb21lKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZVtpZF07XG5cdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRzdGF0ZS5vdXRjb21lID0gb3V0Y29tZTtcblx0XHRcdHRoaXMuX21lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuZnVuY3Rpb24gZ2V0QXNzaWdubWVudENvbnRleHRWYXJpYW50KGFzc2lnbm1lbnQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gYXNzaWdubWVudC5sYXN0SW5kZXhPZignOicpO1xuXHRyZXR1cm4gc2VwYXJhdG9ySW5kZXggPT09IC0xID8gYXNzaWdubWVudCA6IGFzc2lnbm1lbnQuc2xpY2UoMCwgc2VwYXJhdG9ySW5kZXgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2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
