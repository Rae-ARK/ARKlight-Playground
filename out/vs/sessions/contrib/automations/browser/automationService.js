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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, observableValue, transaction } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import {
  serializeAutomationEditableState
} from "../../../../workbench/contrib/chat/common/automations/automationService.js";
import { publishAutomationCreated, publishAutomationDeleted, publishAutomationUpdated } from "../../../../workbench/contrib/chat/common/automations/automationTelemetry.js";
import { computeNextRunAt } from "../../../../workbench/contrib/chat/common/automations/schedule.js";
import { ChatPermissionLevel, isChatPermissionLevel } from "../../../../workbench/contrib/chat/common/constants.js";
import { AUTOMATION_STORAGE_KEY, IAutomationStorageService } from "../common/automationStorageService.js";
const LEGACY_SCHEMA_VERSIONS = /* @__PURE__ */ new Set([1, 2]);
const CURRENT_SCHEMA_VERSION = 3;
const MAX_RUNS_PER_AUTOMATION = 50;
const EMPTY_LEDGER = Object.freeze({ automations: [], runs: [] });
let AutomationService = class extends Disposable {
  constructor(storageService, logService, telemetryService, automationStorageService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.automationStorageService = automationStorageService;
    this._runsForCache = /* @__PURE__ */ new Map();
    this._lastSeenRevision = 0;
    this._now = () => /* @__PURE__ */ new Date();
    const result = this.readLedger(this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    const initial = result.kind === "ledger" ? result.ledger : EMPTY_LEDGER;
    if (result.kind === "ledger") {
      this._lastSeenRevision = result.revision;
    }
    this._automations = observableValue(this, initial.automations);
    this._runs = observableValue(this, initial.runs);
    this.automations = this._automations;
    this.runs = this._runs;
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, AUTOMATION_STORAGE_KEY, this._store)(() => {
      this.refreshFromStorage();
    }));
  }
  /** Test-only: swap in a deterministic clock used by create/update. */
  setClockForTesting(now) {
    this._now = now;
  }
  getAutomation(id) {
    return this._automations.get().find((a) => a.id === id);
  }
  runsFor(automationId) {
    let cached = this._runsForCache.get(automationId);
    if (!cached) {
      cached = derived(this, (reader) => this._runs.read(reader).filter((r) => r.automationId === automationId));
      this._runsForCache.set(automationId, cached);
    }
    return cached;
  }
  async createAutomation(options, mutationGuard) {
    const now = this._now();
    const nowIso = now.toISOString();
    const nextRun = computeNextRunAt(options.schedule, now);
    const automation = Object.freeze({
      id: generateUuid(),
      name: options.name,
      prompt: options.prompt,
      schedule: options.schedule,
      target: normalizeAutomationTarget(options.target),
      modelId: options.modelId,
      mode: options.mode,
      permissionLevel: isChatPermissionLevel(options.permissionLevel) ? options.permissionLevel : void 0,
      enabled: options.enabled ?? true,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastRunAt: void 0,
      nextRunAt: nextRun?.toISOString()
    });
    await this.mutateLedger((ledger) => ({
      kind: "commit",
      ledger: { automations: [automation, ...ledger.automations], runs: ledger.runs },
      result: void 0
    }), mutationGuard);
    publishAutomationCreated(this.telemetryService, automation);
    return automation;
  }
  async updateAutomation(id, patch) {
    const now = this._now();
    const result = await this.mutateLedger((ledger) => {
      const current = ledger.automations.find((automation) => automation.id === id);
      if (!current) {
        throw new Error(`Automation not found: ${id}`);
      }
      const updated = updateAutomation(current, patch, now);
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.map((automation) => automation.id === id ? updated : automation),
          runs: ledger.runs
        },
        result: { current, updated }
      };
    });
    publishAutomationUpdated(this.telemetryService, result.current, result.updated);
    return result.updated;
  }
  async updateAutomationIfUnchanged(id, patch, expected, mutationGuard) {
    const now = this._now();
    let previous;
    const result = await this.mutateLedger((ledger) => {
      const current = ledger.automations.find((automation) => automation.id === id);
      if (!current || serializeAutomationEditableState(current) !== serializeAutomationEditableState(expected)) {
        return {
          kind: "noChange",
          result: { kind: "conflict", current }
        };
      }
      const updated = updateAutomation(current, patch, now);
      previous = current;
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.map((automation) => automation.id === id ? updated : automation),
          runs: ledger.runs
        },
        result: { kind: "updated", automation: updated }
      };
    }, mutationGuard);
    if (result.kind === "conflict" || !previous) {
      return result;
    }
    publishAutomationUpdated(this.telemetryService, previous, result.automation);
    return result;
  }
  async deleteAutomation(id, mutationGuard) {
    const existing = await this.mutateLedger((ledger) => {
      const automation = ledger.automations.find((automation2) => automation2.id === id);
      if (!automation) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations.filter((automation2) => automation2.id !== id),
          runs: ledger.runs.filter((run) => run.automationId !== id)
        },
        result: automation
      };
    }, mutationGuard);
    if (!existing) {
      return;
    }
    this._runsForCache.delete(id);
    publishAutomationDeleted(this.telemetryService, existing);
  }
  async recordRunStart(automationId, trigger, leaderWindowId) {
    const now = this._now();
    const startedAt = now.toISOString();
    const run = Object.freeze({
      id: generateUuid(),
      automationId,
      status: "pending",
      trigger,
      startedAt,
      leaderWindowId
    });
    return this.mutateLedger((ledger) => {
      const automation = ledger.automations.find((automation2) => automation2.id === automationId);
      if (!automation) {
        throw new Error(`Automation not found: ${automationId}`);
      }
      const activeRun = findActiveRun(ledger.runs, automationId);
      if (activeRun) {
        return { kind: "noChange", result: { claimed: false, run: activeRun } };
      }
      let automations = ledger.automations;
      if (trigger !== "manual") {
        const updatedAutomation = Object.freeze({
          ...automation,
          lastRunAt: startedAt,
          nextRunAt: computeNextRunAt(automation.schedule, now)?.toISOString(),
          updatedAt: startedAt
        });
        automations = automations.map((automation2) => automation2.id === automationId ? updatedAutomation : automation2);
      }
      return {
        kind: "commit",
        ledger: { automations, runs: [run, ...ledger.runs] },
        result: { claimed: true, run }
      };
    });
  }
  async updateRun(runId, patch) {
    return this.mutateLedger((ledger) => {
      const current = ledger.runs.find((run) => run.id === runId);
      if (!current) {
        return { kind: "noChange", result: void 0 };
      }
      const updated = Object.freeze({
        ...current,
        status: patch.status ?? current.status,
        sessionResource: patch.sessionResource ?? current.sessionResource,
        completedAt: patch.completedAt ?? current.completedAt,
        errorMessage: patch.errorMessage ?? current.errorMessage
      });
      return {
        kind: "commit",
        ledger: {
          automations: ledger.automations,
          runs: ledger.runs.map((run) => run.id === runId ? updated : run)
        },
        result: updated
      };
    });
  }
  getActiveRunFor(automationId) {
    return findActiveRun(this._runs.get(), automationId);
  }
  async markStaleRunsFailed(reason) {
    const completedAt = this._now().toISOString();
    await this.mutateLedger((ledger) => {
      let changed = false;
      const runs = ledger.runs.map((run) => {
        if (run.status === "pending" || run.status === "running") {
          changed = true;
          return Object.freeze({ ...run, status: "failed", completedAt, errorMessage: reason });
        }
        return run;
      });
      if (!changed) {
        return { kind: "noChange", result: void 0 };
      }
      return {
        kind: "commit",
        ledger: { automations: ledger.automations, runs },
        result: void 0
      };
    });
  }
  //#region Persistence
  async mutateLedger(mutate, mutationGuard) {
    let raw = await this.automationStorageService.read();
    while (true) {
      const readResult = this.readLedger(raw);
      if (readResult.kind === "unsupportedSchema") {
        throw new Error("Cannot modify automations: storage was written by a newer version");
      }
      this.acceptLedger(readResult.ledger, readResult.revision);
      const mutation = mutate(readResult.ledger);
      if (mutation.kind === "noChange") {
        return mutation.result;
      }
      const ledger = {
        automations: mutation.ledger.automations,
        runs: trimRunsPerAutomation(mutation.ledger.runs, MAX_RUNS_PER_AUTOMATION)
      };
      const revision = readResult.revision + 1;
      const serialized = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        revision,
        automations: ledger.automations.map(serializeAutomation),
        runs: [...ledger.runs]
      };
      const newValue = JSON.stringify(serialized);
      mutationGuard?.();
      const writeResult = await this.automationStorageService.compareAndSwap(raw, newValue);
      if (writeResult.swapped) {
        this.setLedger(ledger, revision);
        return mutation.result;
      }
      if (writeResult.currentValue === raw) {
        throw new Error("Automation storage rejected an unchanged compare-and-swap value.");
      }
      raw = writeResult.currentValue;
    }
  }
  acceptLedger(ledger, revision) {
    if (revision < this._lastSeenRevision) {
      return;
    }
    this.setLedger(ledger, revision);
  }
  setLedger(ledger, revision) {
    this._lastSeenRevision = revision;
    transaction((tx) => {
      this._automations.set(ledger.automations, tx);
      this._runs.set(ledger.runs, tx);
    });
  }
  refreshFromStorage() {
    const result = this.readLedger(this.storageService.get(AUTOMATION_STORAGE_KEY, StorageScope.APPLICATION));
    if (result.kind === "unsupportedSchema") {
      return;
    }
    this.acceptLedger(result.ledger, result.revision);
  }
  readLedger(raw) {
    if (!raw) {
      return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
    }
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.schemaVersion === "number" && parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
        this.logService.warn(`[AutomationService] Ledger has schema v${parsed.schemaVersion}; this build only supports v${CURRENT_SCHEMA_VERSION}. Entering read-only mode.`);
        return { kind: "unsupportedSchema" };
      }
      if (parsed?.schemaVersion !== CURRENT_SCHEMA_VERSION && !LEGACY_SCHEMA_VERSIONS.has(parsed?.schemaVersion)) {
        this.logService.warn(`[AutomationService] Unsupported ledger schema version ${parsed?.schemaVersion}; ignoring.`);
        return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
      }
      const automations = [];
      if (parsed.schemaVersion === CURRENT_SCHEMA_VERSION) {
        const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
        for (const entry of entries) {
          try {
            const automation = deserializeAutomation(entry);
            if (automation) {
              automations.push(automation);
            } else {
              this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid target.`);
            }
          } catch (err) {
            this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
          }
        }
      } else {
        const entries = Array.isArray(parsed.automations) ? parsed.automations : [];
        for (const entry of entries) {
          try {
            const automation = deserializeLegacyAutomation(entry);
            if (automation) {
              automations.push(automation);
            } else {
              this.logService.warn(`[AutomationService] Dropping persisted automation ${entry?.id} with an invalid legacy target.`);
            }
          } catch (err) {
            this.logService.warn(`[AutomationService] Dropping malformed persisted automation ${entry?.id}.`, err);
          }
        }
      }
      const validIds = new Set(automations.map((a) => a.id));
      const serializedRuns = Array.isArray(parsed.runs) ? parsed.runs : [];
      const runs = serializedRuns.filter((r) => !!r && typeof r === "object" && validIds.has(r.automationId)).map((r) => Object.freeze({ ...r }));
      const revision = typeof parsed.revision === "number" ? parsed.revision : 0;
      return { kind: "ledger", ledger: { automations, runs: trimRunsPerAutomation(runs, MAX_RUNS_PER_AUTOMATION) }, revision };
    } catch (err) {
      this.logService.error("[AutomationService] Failed to parse automations ledger; resetting.", err);
      return { kind: "ledger", ledger: EMPTY_LEDGER, revision: 0 };
    }
  }
  //#endregion
};
AutomationService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IAutomationStorageService)
], AutomationService);
function serializeAutomation(a) {
  return {
    id: a.id,
    name: a.name,
    prompt: a.prompt,
    schedule: a.schedule,
    target: serializeAutomationTarget(a.target),
    modelId: a.modelId,
    mode: a.mode,
    permissionLevel: a.permissionLevel,
    enabled: a.enabled,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    lastRunAt: a.lastRunAt,
    nextRunAt: a.nextRunAt
  };
}
function deserializeAutomation(s) {
  const target = deserializeAutomationTarget(s.target);
  return target ? createAutomationFromSerialized(s, target) : void 0;
}
function deserializeLegacyAutomation(s) {
  let target;
  if (s.isQuickChat === true) {
    if (!s.providerId || !s.sessionTypeId) {
      return void 0;
    }
    target = createQuickChatAutomationTarget(s.providerId, s.sessionTypeId);
  } else {
    if (!s.folderUri) {
      return void 0;
    }
    target = createWorkspaceAutomationTarget(
      URI.revive(s.folderUri),
      s.providerId,
      s.sessionTypeId,
      deserializeLegacyIsolation(s.isolationMode, s.branch)
    );
  }
  return createAutomationFromSerialized(s, target);
}
function createAutomationFromSerialized(s, target) {
  const permissionLevel = isChatPermissionLevel(s.permissionLevel) ? s.permissionLevel : ChatPermissionLevel.Default;
  return Object.freeze({
    id: s.id,
    name: s.name,
    prompt: s.prompt,
    schedule: s.schedule,
    target,
    modelId: s.modelId,
    mode: s.mode,
    permissionLevel,
    enabled: s.enabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt
  });
}
function updateAutomation(current, patch, now) {
  const merged = mergeAutomation(current, patch);
  const scheduleChanged = patch.schedule !== void 0;
  const enabledChanged = patch.enabled !== void 0;
  return Object.freeze({
    ...merged,
    updatedAt: now.toISOString(),
    nextRunAt: scheduleChanged || enabledChanged && merged.enabled ? computeNextRunAt(merged.schedule, now)?.toISOString() : merged.nextRunAt
  });
}
function mergeAutomation(current, patch) {
  return {
    ...current,
    name: patch.name ?? current.name,
    prompt: patch.prompt ?? current.prompt,
    schedule: patch.schedule ?? current.schedule,
    target: patch.target ? normalizeAutomationTarget(patch.target) : current.target,
    modelId: patch.modelId === null ? void 0 : patch.modelId ?? current.modelId,
    mode: patch.mode === null ? void 0 : patch.mode ?? current.mode,
    permissionLevel: patch.permissionLevel === null ? void 0 : patch.permissionLevel && isChatPermissionLevel(patch.permissionLevel) ? patch.permissionLevel : current.permissionLevel,
    enabled: patch.enabled ?? current.enabled
  };
}
function normalizeAutomationTarget(target) {
  if (target.kind === "quickChat") {
    if (!target.providerId || !target.sessionTypeId) {
      throw new Error("Workspace-less automation requires a providerId and sessionTypeId.");
    }
    return createQuickChatAutomationTarget(target.providerId, target.sessionTypeId);
  }
  if (!target.folderUri) {
    throw new Error("Workspace-backed automation requires a folderUri.");
  }
  return createWorkspaceAutomationTarget(
    target.folderUri,
    target.providerId,
    target.sessionTypeId,
    target.isolation
  );
}
function serializeAutomationTarget(target) {
  return target.kind === "quickChat" ? { kind: "quickChat", providerId: target.providerId, sessionTypeId: target.sessionTypeId } : {
    kind: "workspace",
    folderUri: target.folderUri.toJSON(),
    providerId: target.providerId,
    sessionTypeId: target.sessionTypeId,
    isolation: target.isolation
  };
}
function deserializeAutomationTarget(target) {
  if (target?.kind === "quickChat") {
    return target.providerId && target.sessionTypeId ? createQuickChatAutomationTarget(target.providerId, target.sessionTypeId) : void 0;
  }
  if (target?.kind !== "workspace" || !target.folderUri || !isAutomationWorkspaceIsolation(target.isolation)) {
    return void 0;
  }
  return createWorkspaceAutomationTarget(
    URI.revive(target.folderUri),
    target.providerId,
    target.sessionTypeId,
    target.isolation
  );
}
function deserializeLegacyIsolation(isolationMode, branch) {
  if (isolationMode === "worktree") {
    return branch ? { kind: "worktree", branch } : { kind: "default" };
  }
  return isolationMode === "workspace" ? { kind: "folder" } : { kind: "default" };
}
function normalizeAutomationWorkspaceIsolation(isolation) {
  if (isolation?.kind === "default") {
    return Object.freeze({ kind: "default" });
  }
  if (isolation?.kind === "folder") {
    return Object.freeze({ kind: "folder" });
  }
  if (isolation?.kind === "worktree" && isolation.branch) {
    return Object.freeze({ kind: "worktree", branch: isolation.branch });
  }
  if (isolation?.kind === "worktree") {
    throw new Error("Worktree automation requires a branch.");
  }
  throw new Error("Workspace-backed automation requires a valid isolation mode.");
}
function createQuickChatAutomationTarget(providerId, sessionTypeId) {
  return Object.freeze({ kind: "quickChat", providerId, sessionTypeId });
}
function createWorkspaceAutomationTarget(folderUri, providerId, sessionTypeId, isolation) {
  return Object.freeze({
    kind: "workspace",
    folderUri,
    ...providerId !== void 0 ? { providerId } : {},
    ...sessionTypeId !== void 0 ? { sessionTypeId } : {},
    isolation: normalizeAutomationWorkspaceIsolation(isolation)
  });
}
function isAutomationWorkspaceIsolation(value) {
  return value?.kind === "default" || value?.kind === "folder" || value?.kind === "worktree" && typeof value.branch === "string" && value.branch.length > 0;
}
function findActiveRun(runs, automationId) {
  return runs.find((run) => run.automationId === automationId && (run.status === "pending" || run.status === "running"));
}
function trimRunsPerAutomation(runs, max) {
  const counts = /* @__PURE__ */ new Map();
  const out = [];
  for (const run of runs) {
    const count = counts.get(run.automationId) ?? 0;
    if (count >= max) {
      continue;
    }
    counts.set(run.automationId, count + 1);
    out.push(run);
  }
  return out.length === runs.length ? runs : out;
}
export {
  AutomationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvYnJvd3Nlci9hdXRvbWF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHtcblx0QXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdEF1dG9tYXRpb25UYXJnZXQsXG5cdEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24sXG5cdElBdXRvbWF0aW9uLFxuXHRJQXV0b21hdGlvblJ1bixcbn0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQge1xuXHR0eXBlIEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkLFxuXHRJQXV0b21hdGlvblJ1bkNsYWltLFxuXHRJQXV0b21hdGlvblNlcnZpY2UsXG5cdElDcmVhdGVBdXRvbWF0aW9uT3B0aW9ucyxcblx0SUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0LFxuXHRzZXJpYWxpemVBdXRvbWF0aW9uRWRpdGFibGVTdGF0ZSxcblx0SVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zLFxuXHRJVXBkYXRlQXV0b21hdGlvblJ1bk9wdGlvbnMsXG59IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHB1Ymxpc2hBdXRvbWF0aW9uQ3JlYXRlZCwgcHVibGlzaEF1dG9tYXRpb25EZWxldGVkLCBwdWJsaXNoQXV0b21hdGlvblVwZGF0ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGNvbXB1dGVOZXh0UnVuQXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9zY2hlZHVsZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGVybWlzc2lvbkxldmVsLCBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgSUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuanMnO1xuXG5jb25zdCBMRUdBQ1lfU0NIRU1BX1ZFUlNJT05TID0gbmV3IFNldChbMSwgMl0pO1xuY29uc3QgQ1VSUkVOVF9TQ0hFTUFfVkVSU0lPTiA9IDM7XG5cbmNvbnN0IE1BWF9SVU5TX1BFUl9BVVRPTUFUSU9OID0gNTA7XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZEF1dG9tYXRpb25CYXNlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2NoZWR1bGU6IElBdXRvbWF0aW9uWydzY2hlZHVsZSddO1xuXHRyZWFkb25seSBtb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwZXJtaXNzaW9uTGV2ZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNyZWF0ZWRBdDogc3RyaW5nO1xuXHRyZWFkb25seSB1cGRhdGVkQXQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFzdFJ1bkF0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBuZXh0UnVuQXQ/OiBzdHJpbmc7XG59XG5cbnR5cGUgSVNlcmlhbGl6ZWRBdXRvbWF0aW9uVGFyZ2V0ID1cblx0fCB7XG5cdFx0cmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7XG5cdFx0cmVhZG9ubHkgZm9sZGVyVXJpOiBVcmlDb21wb25lbnRzO1xuXHRcdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc2Vzc2lvblR5cGVJZD86IHN0cmluZztcblx0XHRyZWFkb25seSBpc29sYXRpb246IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb247XG5cdH1cblx0fCB7XG5cdFx0cmVhZG9ubHkga2luZDogJ3F1aWNrQ2hhdCc7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHNlc3Npb25UeXBlSWQ6IHN0cmluZztcblx0fTtcblxuaW50ZXJmYWNlIElTZXJpYWxpemVkQXV0b21hdGlvbiBleHRlbmRzIElTZXJpYWxpemVkQXV0b21hdGlvbkJhc2Uge1xuXHRyZWFkb25seSB0YXJnZXQ6IElTZXJpYWxpemVkQXV0b21hdGlvblRhcmdldDtcbn1cblxuaW50ZXJmYWNlIElMZWdhY3lTZXJpYWxpemVkQXV0b21hdGlvbiBleHRlbmRzIElTZXJpYWxpemVkQXV0b21hdGlvbkJhc2Uge1xuXHRyZWFkb25seSBpc1F1aWNrQ2hhdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZvbGRlclVyaT86IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzb2xhdGlvbk1vZGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJyYW5jaD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkTGVkZ2VyIHtcblx0cmVhZG9ubHkgc2NoZW1hVmVyc2lvbjogMztcblx0Ly8gT3B0aW1pc3RpYy1jb25jdXJyZW5jeSBjb3VudGVyLiAwIGZvciBsZWdhY3kgYmxvYnMgd2l0aG91dCB0aGlzIGZpZWxkLlxuXHRyZWFkb25seSByZXZpc2lvbj86IG51bWJlcjtcblx0cmVhZG9ubHkgYXV0b21hdGlvbnM6IHJlYWRvbmx5IElTZXJpYWxpemVkQXV0b21hdGlvbltdO1xuXHRyZWFkb25seSBydW5zOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdO1xufVxuXG5pbnRlcmZhY2UgSUxlZ2FjeVNlcmlhbGl6ZWRMZWRnZXIge1xuXHRyZWFkb25seSBzY2hlbWFWZXJzaW9uOiAxIHwgMjtcblx0cmVhZG9ubHkgcmV2aXNpb24/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGF1dG9tYXRpb25zOiByZWFkb25seSBJTGVnYWN5U2VyaWFsaXplZEF1dG9tYXRpb25bXTtcblx0cmVhZG9ubHkgcnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXTtcbn1cblxuaW50ZXJmYWNlIElMZWRnZXIge1xuXHRyZWFkb25seSBhdXRvbWF0aW9uczogcmVhZG9ubHkgSUF1dG9tYXRpb25bXTtcblx0cmVhZG9ubHkgcnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXTtcbn1cblxudHlwZSBJTGVkZ2VyTXV0YXRpb248VD4gPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ2NvbW1pdCc7IHJlYWRvbmx5IGxlZGdlcjogSUxlZGdlcjsgcmVhZG9ubHkgcmVzdWx0OiBUIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdub0NoYW5nZSc7IHJlYWRvbmx5IHJlc3VsdDogVCB9O1xuXG5jb25zdCBFTVBUWV9MRURHRVI6IElMZWRnZXIgPSBPYmplY3QuZnJlZXplKHsgYXV0b21hdGlvbnM6IFtdLCBydW5zOiBbXSB9KTtcblxudHlwZSBSZWFkTGVkZ2VyUmVzdWx0ID1cblx0fCB7IGtpbmQ6ICdsZWRnZXInOyBsZWRnZXI6IElMZWRnZXI7IHJldmlzaW9uOiBudW1iZXIgfVxuXHR8IHsga2luZDogJ3Vuc3VwcG9ydGVkU2NoZW1hJyB9O1xuXG5leHBvcnQgY2xhc3MgQXV0b21hdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUF1dG9tYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvbWF0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvbltdPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcnVuczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPjtcblx0cHJpdmF0ZSBfbm93OiAoKSA9PiBEYXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ydW5zRm9yQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSU9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4+KCk7XG5cblx0cHJpdmF0ZSBfbGFzdFNlZW5SZXZpc2lvbiA9IDA7XG5cblx0cmVhZG9ubHkgYXV0b21hdGlvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uW10+O1xuXHRyZWFkb25seSBydW5zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZTogSUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX25vdyA9ICgpID0+IG5ldyBEYXRlKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnJlYWRMZWRnZXIodGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSk7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IHJlc3VsdC5raW5kID09PSAnbGVkZ2VyJyA/IHJlc3VsdC5sZWRnZXIgOiBFTVBUWV9MRURHRVI7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnbGVkZ2VyJykge1xuXHRcdFx0dGhpcy5fbGFzdFNlZW5SZXZpc2lvbiA9IHJlc3VsdC5yZXZpc2lvbjtcblx0XHR9XG5cdFx0dGhpcy5fYXV0b21hdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25bXT4odGhpcywgaW5pdGlhbC5hdXRvbWF0aW9ucyk7XG5cdFx0dGhpcy5fcnVucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPih0aGlzLCBpbml0aWFsLnJ1bnMpO1xuXHRcdHRoaXMuYXV0b21hdGlvbnMgPSB0aGlzLl9hdXRvbWF0aW9ucztcblx0XHR0aGlzLnJ1bnMgPSB0aGlzLl9ydW5zO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHtcblx0XHRcdHRoaXMucmVmcmVzaEZyb21TdG9yYWdlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIFRlc3Qtb25seTogc3dhcCBpbiBhIGRldGVybWluaXN0aWMgY2xvY2sgdXNlZCBieSBjcmVhdGUvdXBkYXRlLiAqL1xuXHRzZXRDbG9ja0ZvclRlc3Rpbmcobm93OiAoKSA9PiBEYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fbm93ID0gbm93O1xuXHR9XG5cblx0Z2V0QXV0b21hdGlvbihpZDogc3RyaW5nKTogSUF1dG9tYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvbWF0aW9ucy5nZXQoKS5maW5kKGEgPT4gYS5pZCA9PT0gaWQpO1xuXHR9XG5cblx0cnVuc0ZvcihhdXRvbWF0aW9uSWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+IHtcblx0XHRsZXQgY2FjaGVkID0gdGhpcy5fcnVuc0ZvckNhY2hlLmdldChhdXRvbWF0aW9uSWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRjYWNoZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9ydW5zLnJlYWQocmVhZGVyKS5maWx0ZXIociA9PiByLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkKSk7XG5cdFx0XHR0aGlzLl9ydW5zRm9yQ2FjaGUuc2V0KGF1dG9tYXRpb25JZCwgY2FjaGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhY2hlZDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElBdXRvbWF0aW9uPiB7XG5cdFx0Y29uc3Qgbm93ID0gdGhpcy5fbm93KCk7XG5cdFx0Y29uc3Qgbm93SXNvID0gbm93LnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgbmV4dFJ1biA9IGNvbXB1dGVOZXh0UnVuQXQob3B0aW9ucy5zY2hlZHVsZSwgbm93KTtcblx0XHRjb25zdCBhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0bmFtZTogb3B0aW9ucy5uYW1lLFxuXHRcdFx0cHJvbXB0OiBvcHRpb25zLnByb21wdCxcblx0XHRcdHNjaGVkdWxlOiBvcHRpb25zLnNjaGVkdWxlLFxuXHRcdFx0dGFyZ2V0OiBub3JtYWxpemVBdXRvbWF0aW9uVGFyZ2V0KG9wdGlvbnMudGFyZ2V0KSxcblx0XHRcdG1vZGVsSWQ6IG9wdGlvbnMubW9kZWxJZCxcblx0XHRcdG1vZGU6IG9wdGlvbnMubW9kZSxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogaXNDaGF0UGVybWlzc2lvbkxldmVsKG9wdGlvbnMucGVybWlzc2lvbkxldmVsKSA/IG9wdGlvbnMucGVybWlzc2lvbkxldmVsIDogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogb3B0aW9ucy5lbmFibGVkID8/IHRydWUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5vd0lzbyxcblx0XHRcdHVwZGF0ZWRBdDogbm93SXNvLFxuXHRcdFx0bGFzdFJ1bkF0OiB1bmRlZmluZWQsXG5cdFx0XHRuZXh0UnVuQXQ6IG5leHRSdW4/LnRvSVNPU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5tdXRhdGVMZWRnZXIobGVkZ2VyID0+ICh7XG5cdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdGxlZGdlcjogeyBhdXRvbWF0aW9uczogW2F1dG9tYXRpb24sIC4uLmxlZGdlci5hdXRvbWF0aW9uc10sIHJ1bnM6IGxlZGdlci5ydW5zIH0sXG5cdFx0XHRyZXN1bHQ6IHVuZGVmaW5lZCxcblx0XHR9KSwgbXV0YXRpb25HdWFyZCk7XG5cdFx0cHVibGlzaEF1dG9tYXRpb25DcmVhdGVkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgYXV0b21hdGlvbik7XG5cdFx0cmV0dXJuIGF1dG9tYXRpb247XG5cdH1cblxuXHRhc3luYyB1cGRhdGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uPiB7XG5cdFx0Y29uc3Qgbm93ID0gdGhpcy5fbm93KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tdXRhdGVMZWRnZXIobGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGlkKTtcblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF1dG9tYXRpb24gbm90IGZvdW5kOiAke2lkfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IHVwZGF0ZUF1dG9tYXRpb24oY3VycmVudCwgcGF0Y2gsIG5vdyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucy5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkID09PSBpZCA/IHVwZGF0ZWQgOiBhdXRvbWF0aW9uKSxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzdWx0OiB7IGN1cnJlbnQsIHVwZGF0ZWQgfSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0cHVibGlzaEF1dG9tYXRpb25VcGRhdGVkKHRoaXMudGVsZW1ldHJ5U2VydmljZSwgcmVzdWx0LmN1cnJlbnQsIHJlc3VsdC51cGRhdGVkKTtcblx0XHRyZXR1cm4gcmVzdWx0LnVwZGF0ZWQ7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQoaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucywgZXhwZWN0ZWQ6IElBdXRvbWF0aW9uLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElHdWFyZGVkQXV0b21hdGlvblVwZGF0ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IG5vdyA9IHRoaXMuX25vdygpO1xuXHRcdGxldCBwcmV2aW91czogSUF1dG9tYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tdXRhdGVMZWRnZXI8SUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0PihsZWRnZXIgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGxlZGdlci5hdXRvbWF0aW9ucy5maW5kKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCA9PT0gaWQpO1xuXHRcdFx0aWYgKCFjdXJyZW50IHx8IHNlcmlhbGl6ZUF1dG9tYXRpb25FZGl0YWJsZVN0YXRlKGN1cnJlbnQpICE9PSBzZXJpYWxpemVBdXRvbWF0aW9uRWRpdGFibGVTdGF0ZShleHBlY3RlZCkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbm9DaGFuZ2UnLFxuXHRcdFx0XHRcdHJlc3VsdDogeyBraW5kOiAnY29uZmxpY3QnLCBjdXJyZW50IH0gYXMgY29uc3QsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB1cGRhdGVBdXRvbWF0aW9uKGN1cnJlbnQsIHBhdGNoLCBub3cpO1xuXHRcdFx0cHJldmlvdXMgPSBjdXJyZW50O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjoge1xuXHRcdFx0XHRcdGF1dG9tYXRpb25zOiBsZWRnZXIuYXV0b21hdGlvbnMubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCA9PT0gaWQgPyB1cGRhdGVkIDogYXV0b21hdGlvbiksXG5cdFx0XHRcdFx0cnVuczogbGVkZ2VyLnJ1bnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3VsdDogeyBraW5kOiAndXBkYXRlZCcsIGF1dG9tYXRpb246IHVwZGF0ZWQgfSBhcyBjb25zdCxcblx0XHRcdH07XG5cdFx0fSwgbXV0YXRpb25HdWFyZCk7XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnY29uZmxpY3QnIHx8ICFwcmV2aW91cykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRwdWJsaXNoQXV0b21hdGlvblVwZGF0ZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCBwcmV2aW91cywgcmVzdWx0LmF1dG9tYXRpb24pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBkZWxldGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIG11dGF0aW9uR3VhcmQ/OiBBdXRvbWF0aW9uTXV0YXRpb25HdWFyZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgdGhpcy5tdXRhdGVMZWRnZXIobGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb24gPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGlkKTtcblx0XHRcdGlmICghYXV0b21hdGlvbikge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnbm9DaGFuZ2UnLCByZXN1bHQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjoge1xuXHRcdFx0XHRcdGF1dG9tYXRpb25zOiBsZWRnZXIuYXV0b21hdGlvbnMuZmlsdGVyKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCAhPT0gaWQpLFxuXHRcdFx0XHRcdHJ1bnM6IGxlZGdlci5ydW5zLmZpbHRlcihydW4gPT4gcnVuLmF1dG9tYXRpb25JZCAhPT0gaWQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXN1bHQ6IGF1dG9tYXRpb24sXG5cdFx0XHR9O1xuXHRcdH0sIG11dGF0aW9uR3VhcmQpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ydW5zRm9yQ2FjaGUuZGVsZXRlKGlkKTtcblx0XHRwdWJsaXNoQXV0b21hdGlvbkRlbGV0ZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCBleGlzdGluZyk7XG5cdH1cblxuXHRhc3luYyByZWNvcmRSdW5TdGFydChhdXRvbWF0aW9uSWQ6IHN0cmluZywgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGxlYWRlcldpbmRvd0lkOiBudW1iZXIpOiBQcm9taXNlPElBdXRvbWF0aW9uUnVuQ2xhaW0+IHtcblx0XHRjb25zdCBub3cgPSB0aGlzLl9ub3coKTtcblx0XHRjb25zdCBzdGFydGVkQXQgPSBub3cudG9JU09TdHJpbmcoKTtcblx0XHRjb25zdCBydW46IElBdXRvbWF0aW9uUnVuID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRhdXRvbWF0aW9uSWQsXG5cdFx0XHRzdGF0dXM6ICdwZW5kaW5nJyxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHRzdGFydGVkQXQsXG5cdFx0XHRsZWFkZXJXaW5kb3dJZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy5tdXRhdGVMZWRnZXI8SUF1dG9tYXRpb25SdW5DbGFpbT4obGVkZ2VyID0+IHtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb24gPSBsZWRnZXIuYXV0b21hdGlvbnMuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGF1dG9tYXRpb25JZCk7XG5cdFx0XHRpZiAoIWF1dG9tYXRpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBBdXRvbWF0aW9uIG5vdCBmb3VuZDogJHthdXRvbWF0aW9uSWR9YCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGFpbWluZyBpbnNpZGUgdGhlIGNvbXBhcmUtYW5kLXN3YXAga2VlcHMgYXQgbW9zdCBvbmUgYWN0aXZlIHJ1biBwZXJcblx0XHRcdC8vIGF1dG9tYXRpb24gZXZlbiB3aGVuIHdpbmRvd3Mgb3IgYWdlbnRzIHJhY2UgdG8gc3RhcnQgdGhlIHNhbWUgb25lLlxuXHRcdFx0Y29uc3QgYWN0aXZlUnVuID0gZmluZEFjdGl2ZVJ1bihsZWRnZXIucnVucywgYXV0b21hdGlvbklkKTtcblx0XHRcdGlmIChhY3RpdmVSdW4pIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ25vQ2hhbmdlJywgcmVzdWx0OiB7IGNsYWltZWQ6IGZhbHNlLCBydW46IGFjdGl2ZVJ1biB9IH07XG5cdFx0XHR9XG5cdFx0XHRsZXQgYXV0b21hdGlvbnMgPSBsZWRnZXIuYXV0b21hdGlvbnM7XG5cdFx0XHRpZiAodHJpZ2dlciAhPT0gJ21hbnVhbCcpIHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlZEF1dG9tYXRpb246IElBdXRvbWF0aW9uID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdFx0Li4uYXV0b21hdGlvbixcblx0XHRcdFx0XHRsYXN0UnVuQXQ6IHN0YXJ0ZWRBdCxcblx0XHRcdFx0XHRuZXh0UnVuQXQ6IGNvbXB1dGVOZXh0UnVuQXQoYXV0b21hdGlvbi5zY2hlZHVsZSwgbm93KT8udG9JU09TdHJpbmcoKSxcblx0XHRcdFx0XHR1cGRhdGVkQXQ6IHN0YXJ0ZWRBdCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF1dG9tYXRpb25zID0gYXV0b21hdGlvbnMubWFwKGF1dG9tYXRpb24gPT4gYXV0b21hdGlvbi5pZCA9PT0gYXV0b21hdGlvbklkID8gdXBkYXRlZEF1dG9tYXRpb24gOiBhdXRvbWF0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdjb21taXQnLFxuXHRcdFx0XHRsZWRnZXI6IHsgYXV0b21hdGlvbnMsIHJ1bnM6IFtydW4sIC4uLmxlZGdlci5ydW5zXSB9LFxuXHRcdFx0XHRyZXN1bHQ6IHsgY2xhaW1lZDogdHJ1ZSwgcnVuIH0sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUnVuKHJ1bklkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvblJ1bk9wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uUnVuIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMubXV0YXRlTGVkZ2VyKGxlZGdlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gbGVkZ2VyLnJ1bnMuZmluZChydW4gPT4gcnVuLmlkID09PSBydW5JZCk7XG5cdFx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ25vQ2hhbmdlJywgcmVzdWx0OiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVwZGF0ZWQ6IElBdXRvbWF0aW9uUnVuID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdC4uLmN1cnJlbnQsXG5cdFx0XHRcdHN0YXR1czogcGF0Y2guc3RhdHVzID8/IGN1cnJlbnQuc3RhdHVzLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHBhdGNoLnNlc3Npb25SZXNvdXJjZSA/PyBjdXJyZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IHBhdGNoLmNvbXBsZXRlZEF0ID8/IGN1cnJlbnQuY29tcGxldGVkQXQsXG5cdFx0XHRcdGVycm9yTWVzc2FnZTogcGF0Y2guZXJyb3JNZXNzYWdlID8/IGN1cnJlbnQuZXJyb3JNZXNzYWdlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnY29tbWl0Jyxcblx0XHRcdFx0bGVkZ2VyOiB7XG5cdFx0XHRcdFx0YXV0b21hdGlvbnM6IGxlZGdlci5hdXRvbWF0aW9ucyxcblx0XHRcdFx0XHRydW5zOiBsZWRnZXIucnVucy5tYXAocnVuID0+IHJ1bi5pZCA9PT0gcnVuSWQgPyB1cGRhdGVkIDogcnVuKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzdWx0OiB1cGRhdGVkLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEFjdGl2ZVJ1bkZvcihhdXRvbWF0aW9uSWQ6IHN0cmluZyk6IElBdXRvbWF0aW9uUnVuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZmluZEFjdGl2ZVJ1bih0aGlzLl9ydW5zLmdldCgpLCBhdXRvbWF0aW9uSWQpO1xuXHR9XG5cblx0YXN5bmMgbWFya1N0YWxlUnVuc0ZhaWxlZChyZWFzb246IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbXBsZXRlZEF0ID0gdGhpcy5fbm93KCkudG9JU09TdHJpbmcoKTtcblx0XHRhd2FpdCB0aGlzLm11dGF0ZUxlZGdlcihsZWRnZXIgPT4ge1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJ1bnMgPSBsZWRnZXIucnVucy5tYXAocnVuID0+IHtcblx0XHRcdFx0aWYgKHJ1bi5zdGF0dXMgPT09ICdwZW5kaW5nJyB8fCBydW4uc3RhdHVzID09PSAncnVubmluZycpIHtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7IC4uLnJ1biwgc3RhdHVzOiAnZmFpbGVkJyBhcyBjb25zdCwgY29tcGxldGVkQXQsIGVycm9yTWVzc2FnZTogcmVhc29uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBydW47XG5cdFx0XHR9KTtcblx0XHRcdGlmICghY2hhbmdlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnbm9DaGFuZ2UnLCByZXN1bHQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2NvbW1pdCcsXG5cdFx0XHRcdGxlZGdlcjogeyBhdXRvbWF0aW9uczogbGVkZ2VyLmF1dG9tYXRpb25zLCBydW5zIH0sXG5cdFx0XHRcdHJlc3VsdDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBQZXJzaXN0ZW5jZVxuXG5cdHByaXZhdGUgYXN5bmMgbXV0YXRlTGVkZ2VyPFQ+KG11dGF0ZTogKGxlZGdlcjogSUxlZGdlcikgPT4gSUxlZGdlck11dGF0aW9uPFQ+LCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPFQ+IHtcblx0XHRsZXQgcmF3ID0gYXdhaXQgdGhpcy5hdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UucmVhZCgpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCByZWFkUmVzdWx0ID0gdGhpcy5yZWFkTGVkZ2VyKHJhdyk7XG5cdFx0XHRpZiAocmVhZFJlc3VsdC5raW5kID09PSAndW5zdXBwb3J0ZWRTY2hlbWEnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IG1vZGlmeSBhdXRvbWF0aW9uczogc3RvcmFnZSB3YXMgd3JpdHRlbiBieSBhIG5ld2VyIHZlcnNpb24nKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hY2NlcHRMZWRnZXIocmVhZFJlc3VsdC5sZWRnZXIsIHJlYWRSZXN1bHQucmV2aXNpb24pO1xuXHRcdFx0Y29uc3QgbXV0YXRpb24gPSBtdXRhdGUocmVhZFJlc3VsdC5sZWRnZXIpO1xuXHRcdFx0aWYgKG11dGF0aW9uLmtpbmQgPT09ICdub0NoYW5nZScpIHtcblx0XHRcdFx0cmV0dXJuIG11dGF0aW9uLnJlc3VsdDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGVkZ2VyOiBJTGVkZ2VyID0ge1xuXHRcdFx0XHRhdXRvbWF0aW9uczogbXV0YXRpb24ubGVkZ2VyLmF1dG9tYXRpb25zLFxuXHRcdFx0XHRydW5zOiB0cmltUnVuc1BlckF1dG9tYXRpb24obXV0YXRpb24ubGVkZ2VyLnJ1bnMsIE1BWF9SVU5TX1BFUl9BVVRPTUFUSU9OKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXZpc2lvbiA9IHJlYWRSZXN1bHQucmV2aXNpb24gKyAxO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRMZWRnZXIgPSB7XG5cdFx0XHRcdHNjaGVtYVZlcnNpb246IENVUlJFTlRfU0NIRU1BX1ZFUlNJT04sXG5cdFx0XHRcdHJldmlzaW9uLFxuXHRcdFx0XHRhdXRvbWF0aW9uczogbGVkZ2VyLmF1dG9tYXRpb25zLm1hcChzZXJpYWxpemVBdXRvbWF0aW9uKSxcblx0XHRcdFx0cnVuczogWy4uLmxlZGdlci5ydW5zXSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBuZXdWYWx1ZSA9IEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpO1xuXHRcdFx0bXV0YXRpb25HdWFyZD8uKCk7XG5cdFx0XHRjb25zdCB3cml0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmNvbXBhcmVBbmRTd2FwKHJhdywgbmV3VmFsdWUpO1xuXHRcdFx0aWYgKHdyaXRlUmVzdWx0LnN3YXBwZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRMZWRnZXIobGVkZ2VyLCByZXZpc2lvbik7XG5cdFx0XHRcdHJldHVybiBtdXRhdGlvbi5yZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAod3JpdGVSZXN1bHQuY3VycmVudFZhbHVlID09PSByYXcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdXRvbWF0aW9uIHN0b3JhZ2UgcmVqZWN0ZWQgYW4gdW5jaGFuZ2VkIGNvbXBhcmUtYW5kLXN3YXAgdmFsdWUuJyk7XG5cdFx0XHR9XG5cdFx0XHRyYXcgPSB3cml0ZVJlc3VsdC5jdXJyZW50VmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhY2NlcHRMZWRnZXIobGVkZ2VyOiBJTGVkZ2VyLCByZXZpc2lvbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHJldmlzaW9uIDwgdGhpcy5fbGFzdFNlZW5SZXZpc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNldExlZGdlcihsZWRnZXIsIHJldmlzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TGVkZ2VyKGxlZGdlcjogSUxlZGdlciwgcmV2aXNpb246IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RTZWVuUmV2aXNpb24gPSByZXZpc2lvbjtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9hdXRvbWF0aW9ucy5zZXQobGVkZ2VyLmF1dG9tYXRpb25zLCB0eCk7XG5cdFx0XHR0aGlzLl9ydW5zLnNldChsZWRnZXIucnVucywgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoRnJvbVN0b3JhZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5yZWFkTGVkZ2VyKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFVVE9NQVRJT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpO1xuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ3Vuc3VwcG9ydGVkU2NoZW1hJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFjY2VwdExlZGdlcihyZXN1bHQubGVkZ2VyLCByZXN1bHQucmV2aXNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkTGVkZ2VyKHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogUmVhZExlZGdlclJlc3VsdCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdsZWRnZXInLCBsZWRnZXI6IEVNUFRZX0xFREdFUiwgcmV2aXNpb246IDAgfTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KSBhcyBJU2VyaWFsaXplZExlZGdlciB8IElMZWdhY3lTZXJpYWxpemVkTGVkZ2VyO1xuXHRcdFx0aWYgKHR5cGVvZiBwYXJzZWQ/LnNjaGVtYVZlcnNpb24gPT09ICdudW1iZXInICYmIHBhcnNlZC5zY2hlbWFWZXJzaW9uID4gQ1VSUkVOVF9TQ0hFTUFfVkVSU0lPTikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBMZWRnZXIgaGFzIHNjaGVtYSB2JHtwYXJzZWQuc2NoZW1hVmVyc2lvbn07IHRoaXMgYnVpbGQgb25seSBzdXBwb3J0cyB2JHtDVVJSRU5UX1NDSEVNQV9WRVJTSU9OfS4gRW50ZXJpbmcgcmVhZC1vbmx5IG1vZGUuYCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICd1bnN1cHBvcnRlZFNjaGVtYScgfTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJzZWQ/LnNjaGVtYVZlcnNpb24gIT09IENVUlJFTlRfU0NIRU1BX1ZFUlNJT04gJiYgIUxFR0FDWV9TQ0hFTUFfVkVSU0lPTlMuaGFzKHBhcnNlZD8uc2NoZW1hVmVyc2lvbikpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtBdXRvbWF0aW9uU2VydmljZV0gVW5zdXBwb3J0ZWQgbGVkZ2VyIHNjaGVtYSB2ZXJzaW9uICR7cGFyc2VkPy5zY2hlbWFWZXJzaW9ufTsgaWdub3JpbmcuYCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdsZWRnZXInLCBsZWRnZXI6IEVNUFRZX0xFREdFUiwgcmV2aXNpb246IDAgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGF1dG9tYXRpb25zOiBJQXV0b21hdGlvbltdID0gW107XG5cdFx0XHRpZiAocGFyc2VkLnNjaGVtYVZlcnNpb24gPT09IENVUlJFTlRfU0NIRU1BX1ZFUlNJT04pIHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkLmF1dG9tYXRpb25zKSA/IHBhcnNlZC5hdXRvbWF0aW9ucyA6IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXV0b21hdGlvbiA9IGRlc2VyaWFsaXplQXV0b21hdGlvbihlbnRyeSk7XG5cdFx0XHRcdFx0XHRpZiAoYXV0b21hdGlvbikge1xuXHRcdFx0XHRcdFx0XHRhdXRvbWF0aW9ucy5wdXNoKGF1dG9tYXRpb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtBdXRvbWF0aW9uU2VydmljZV0gRHJvcHBpbmcgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9IHdpdGggYW4gaW52YWxpZCB0YXJnZXQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBtYWxmb3JtZWQgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9LmAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gQXJyYXkuaXNBcnJheShwYXJzZWQuYXV0b21hdGlvbnMpID8gcGFyc2VkLmF1dG9tYXRpb25zIDogW107XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdXRvbWF0aW9uID0gZGVzZXJpYWxpemVMZWdhY3lBdXRvbWF0aW9uKGVudHJ5KTtcblx0XHRcdFx0XHRcdGlmIChhdXRvbWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGF1dG9tYXRpb25zLnB1c2goYXV0b21hdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBwZXJzaXN0ZWQgYXV0b21hdGlvbiAke2VudHJ5Py5pZH0gd2l0aCBhbiBpbnZhbGlkIGxlZ2FjeSB0YXJnZXQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0F1dG9tYXRpb25TZXJ2aWNlXSBEcm9wcGluZyBtYWxmb3JtZWQgcGVyc2lzdGVkIGF1dG9tYXRpb24gJHtlbnRyeT8uaWR9LmAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWxpZElkcyA9IG5ldyBTZXQoYXV0b21hdGlvbnMubWFwKGEgPT4gYS5pZCkpO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZFJ1bnMgPSBBcnJheS5pc0FycmF5KHBhcnNlZC5ydW5zKSA/IHBhcnNlZC5ydW5zIDogW107XG5cdFx0XHRjb25zdCBydW5zID0gc2VyaWFsaXplZFJ1bnNcblx0XHRcdFx0LmZpbHRlcihyID0+ICEhciAmJiB0eXBlb2YgciA9PT0gJ29iamVjdCcgJiYgdmFsaWRJZHMuaGFzKHIuYXV0b21hdGlvbklkKSlcblx0XHRcdFx0Lm1hcChyID0+IE9iamVjdC5mcmVlemUoeyAuLi5yIH0pKTtcblx0XHRcdGNvbnN0IHJldmlzaW9uID0gdHlwZW9mIHBhcnNlZC5yZXZpc2lvbiA9PT0gJ251bWJlcicgPyBwYXJzZWQucmV2aXNpb24gOiAwO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2xlZGdlcicsIGxlZGdlcjogeyBhdXRvbWF0aW9ucywgcnVuczogdHJpbVJ1bnNQZXJBdXRvbWF0aW9uKHJ1bnMsIE1BWF9SVU5TX1BFUl9BVVRPTUFUSU9OKSB9LCByZXZpc2lvbiB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQXV0b21hdGlvblNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBhdXRvbWF0aW9ucyBsZWRnZXI7IHJlc2V0dGluZy4nLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2xlZGdlcicsIGxlZGdlcjogRU1QVFlfTEVER0VSLCByZXZpc2lvbjogMCB9O1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVBdXRvbWF0aW9uKGE6IElBdXRvbWF0aW9uKTogSVNlcmlhbGl6ZWRBdXRvbWF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRpZDogYS5pZCxcblx0XHRuYW1lOiBhLm5hbWUsXG5cdFx0cHJvbXB0OiBhLnByb21wdCxcblx0XHRzY2hlZHVsZTogYS5zY2hlZHVsZSxcblx0XHR0YXJnZXQ6IHNlcmlhbGl6ZUF1dG9tYXRpb25UYXJnZXQoYS50YXJnZXQpLFxuXHRcdG1vZGVsSWQ6IGEubW9kZWxJZCxcblx0XHRtb2RlOiBhLm1vZGUsXG5cdFx0cGVybWlzc2lvbkxldmVsOiBhLnBlcm1pc3Npb25MZXZlbCxcblx0XHRlbmFibGVkOiBhLmVuYWJsZWQsXG5cdFx0Y3JlYXRlZEF0OiBhLmNyZWF0ZWRBdCxcblx0XHR1cGRhdGVkQXQ6IGEudXBkYXRlZEF0LFxuXHRcdGxhc3RSdW5BdDogYS5sYXN0UnVuQXQsXG5cdFx0bmV4dFJ1bkF0OiBhLm5leHRSdW5BdCxcblx0fTtcbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVBdXRvbWF0aW9uKHM6IElTZXJpYWxpemVkQXV0b21hdGlvbik6IElBdXRvbWF0aW9uIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGFyZ2V0ID0gZGVzZXJpYWxpemVBdXRvbWF0aW9uVGFyZ2V0KHMudGFyZ2V0KTtcblx0cmV0dXJuIHRhcmdldCA/IGNyZWF0ZUF1dG9tYXRpb25Gcm9tU2VyaWFsaXplZChzLCB0YXJnZXQpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBkZXNlcmlhbGl6ZUxlZ2FjeUF1dG9tYXRpb24oczogSUxlZ2FjeVNlcmlhbGl6ZWRBdXRvbWF0aW9uKTogSUF1dG9tYXRpb24gfCB1bmRlZmluZWQge1xuXHRsZXQgdGFyZ2V0OiBBdXRvbWF0aW9uVGFyZ2V0O1xuXHRpZiAocy5pc1F1aWNrQ2hhdCA9PT0gdHJ1ZSkge1xuXHRcdGlmICghcy5wcm92aWRlcklkIHx8ICFzLnNlc3Npb25UeXBlSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRhcmdldCA9IGNyZWF0ZVF1aWNrQ2hhdEF1dG9tYXRpb25UYXJnZXQocy5wcm92aWRlcklkLCBzLnNlc3Npb25UeXBlSWQpO1xuXHR9IGVsc2Uge1xuXHRcdGlmICghcy5mb2xkZXJVcmkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRhcmdldCA9IGNyZWF0ZVdvcmtzcGFjZUF1dG9tYXRpb25UYXJnZXQoXG5cdFx0XHRVUkkucmV2aXZlKHMuZm9sZGVyVXJpKSxcblx0XHRcdHMucHJvdmlkZXJJZCxcblx0XHRcdHMuc2Vzc2lvblR5cGVJZCxcblx0XHRcdGRlc2VyaWFsaXplTGVnYWN5SXNvbGF0aW9uKHMuaXNvbGF0aW9uTW9kZSwgcy5icmFuY2gpLFxuXHRcdCk7XG5cdH1cblx0cmV0dXJuIGNyZWF0ZUF1dG9tYXRpb25Gcm9tU2VyaWFsaXplZChzLCB0YXJnZXQpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBdXRvbWF0aW9uRnJvbVNlcmlhbGl6ZWQoczogSVNlcmlhbGl6ZWRBdXRvbWF0aW9uQmFzZSwgdGFyZ2V0OiBBdXRvbWF0aW9uVGFyZ2V0KTogSUF1dG9tYXRpb24ge1xuXHQvLyBEZWZhdWx0IHRvIG1vc3QgcmVzdHJpY3RpdmUgaWYgdGhlIHBlcnNpc3RlZCB2YWx1ZSBpcyBpbnZhbGlkLlxuXHRjb25zdCBwZXJtaXNzaW9uTGV2ZWwgPSBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwocy5wZXJtaXNzaW9uTGV2ZWwpXG5cdFx0PyBzLnBlcm1pc3Npb25MZXZlbFxuXHRcdDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXG5cdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRpZDogcy5pZCxcblx0XHRuYW1lOiBzLm5hbWUsXG5cdFx0cHJvbXB0OiBzLnByb21wdCxcblx0XHRzY2hlZHVsZTogcy5zY2hlZHVsZSxcblx0XHR0YXJnZXQsXG5cdFx0bW9kZWxJZDogcy5tb2RlbElkLFxuXHRcdG1vZGU6IHMubW9kZSxcblx0XHRwZXJtaXNzaW9uTGV2ZWwsXG5cdFx0ZW5hYmxlZDogcy5lbmFibGVkLFxuXHRcdGNyZWF0ZWRBdDogcy5jcmVhdGVkQXQsXG5cdFx0dXBkYXRlZEF0OiBzLnVwZGF0ZWRBdCxcblx0XHRsYXN0UnVuQXQ6IHMubGFzdFJ1bkF0LFxuXHRcdG5leHRSdW5BdDogcy5uZXh0UnVuQXQsXG5cdH0pO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVBdXRvbWF0aW9uKGN1cnJlbnQ6IElBdXRvbWF0aW9uLCBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zLCBub3c6IERhdGUpOiBJQXV0b21hdGlvbiB7XG5cdGNvbnN0IG1lcmdlZCA9IG1lcmdlQXV0b21hdGlvbihjdXJyZW50LCBwYXRjaCk7XG5cdGNvbnN0IHNjaGVkdWxlQ2hhbmdlZCA9IHBhdGNoLnNjaGVkdWxlICE9PSB1bmRlZmluZWQ7XG5cdGNvbnN0IGVuYWJsZWRDaGFuZ2VkID0gcGF0Y2guZW5hYmxlZCAhPT0gdW5kZWZpbmVkO1xuXHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0Li4ubWVyZ2VkLFxuXHRcdHVwZGF0ZWRBdDogbm93LnRvSVNPU3RyaW5nKCksXG5cdFx0bmV4dFJ1bkF0OiAoc2NoZWR1bGVDaGFuZ2VkIHx8IChlbmFibGVkQ2hhbmdlZCAmJiBtZXJnZWQuZW5hYmxlZCkpXG5cdFx0XHQ/IGNvbXB1dGVOZXh0UnVuQXQobWVyZ2VkLnNjaGVkdWxlLCBub3cpPy50b0lTT1N0cmluZygpXG5cdFx0XHQ6IG1lcmdlZC5uZXh0UnVuQXQsXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBtZXJnZUF1dG9tYXRpb24oY3VycmVudDogSUF1dG9tYXRpb24sIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMpOiBJQXV0b21hdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0Li4uY3VycmVudCxcblx0XHRuYW1lOiBwYXRjaC5uYW1lID8/IGN1cnJlbnQubmFtZSxcblx0XHRwcm9tcHQ6IHBhdGNoLnByb21wdCA/PyBjdXJyZW50LnByb21wdCxcblx0XHRzY2hlZHVsZTogcGF0Y2guc2NoZWR1bGUgPz8gY3VycmVudC5zY2hlZHVsZSxcblx0XHR0YXJnZXQ6IHBhdGNoLnRhcmdldCA/IG5vcm1hbGl6ZUF1dG9tYXRpb25UYXJnZXQocGF0Y2gudGFyZ2V0KSA6IGN1cnJlbnQudGFyZ2V0LFxuXHRcdG1vZGVsSWQ6IHBhdGNoLm1vZGVsSWQgPT09IG51bGwgPyB1bmRlZmluZWQgOiAocGF0Y2gubW9kZWxJZCA/PyBjdXJyZW50Lm1vZGVsSWQpLFxuXHRcdG1vZGU6IHBhdGNoLm1vZGUgPT09IG51bGwgPyB1bmRlZmluZWQgOiAocGF0Y2gubW9kZSA/PyBjdXJyZW50Lm1vZGUpLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogcGF0Y2gucGVybWlzc2lvbkxldmVsID09PSBudWxsID8gdW5kZWZpbmVkIDogKHBhdGNoLnBlcm1pc3Npb25MZXZlbCAmJiBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwocGF0Y2gucGVybWlzc2lvbkxldmVsKSA/IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA6IGN1cnJlbnQucGVybWlzc2lvbkxldmVsKSxcblx0XHRlbmFibGVkOiBwYXRjaC5lbmFibGVkID8/IGN1cnJlbnQuZW5hYmxlZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IEF1dG9tYXRpb25UYXJnZXQpOiBBdXRvbWF0aW9uVGFyZ2V0IHtcblx0aWYgKHRhcmdldC5raW5kID09PSAncXVpY2tDaGF0Jykge1xuXHRcdGlmICghdGFyZ2V0LnByb3ZpZGVySWQgfHwgIXRhcmdldC5zZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZS1sZXNzIGF1dG9tYXRpb24gcmVxdWlyZXMgYSBwcm92aWRlcklkIGFuZCBzZXNzaW9uVHlwZUlkLicpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3JlYXRlUXVpY2tDaGF0QXV0b21hdGlvblRhcmdldCh0YXJnZXQucHJvdmlkZXJJZCwgdGFyZ2V0LnNlc3Npb25UeXBlSWQpO1xuXHR9XG5cdGlmICghdGFyZ2V0LmZvbGRlclVyaSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignV29ya3NwYWNlLWJhY2tlZCBhdXRvbWF0aW9uIHJlcXVpcmVzIGEgZm9sZGVyVXJpLicpO1xuXHR9XG5cdHJldHVybiBjcmVhdGVXb3Jrc3BhY2VBdXRvbWF0aW9uVGFyZ2V0KFxuXHRcdHRhcmdldC5mb2xkZXJVcmksXG5cdFx0dGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0dGFyZ2V0LnNlc3Npb25UeXBlSWQsXG5cdFx0dGFyZ2V0Lmlzb2xhdGlvbixcblx0KTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IEF1dG9tYXRpb25UYXJnZXQpOiBJU2VyaWFsaXplZEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4gdGFyZ2V0LmtpbmQgPT09ICdxdWlja0NoYXQnXG5cdFx0PyB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogdGFyZ2V0LnNlc3Npb25UeXBlSWQgfVxuXHRcdDoge1xuXHRcdFx0a2luZDogJ3dvcmtzcGFjZScsXG5cdFx0XHRmb2xkZXJVcmk6IHRhcmdldC5mb2xkZXJVcmkudG9KU09OKCksXG5cdFx0XHRwcm92aWRlcklkOiB0YXJnZXQucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlSWQ6IHRhcmdldC5zZXNzaW9uVHlwZUlkLFxuXHRcdFx0aXNvbGF0aW9uOiB0YXJnZXQuaXNvbGF0aW9uLFxuXHRcdH07XG59XG5cbmZ1bmN0aW9uIGRlc2VyaWFsaXplQXV0b21hdGlvblRhcmdldCh0YXJnZXQ6IElTZXJpYWxpemVkQXV0b21hdGlvblRhcmdldCk6IEF1dG9tYXRpb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRpZiAodGFyZ2V0Py5raW5kID09PSAncXVpY2tDaGF0Jykge1xuXHRcdHJldHVybiB0YXJnZXQucHJvdmlkZXJJZCAmJiB0YXJnZXQuc2Vzc2lvblR5cGVJZFxuXHRcdFx0PyBjcmVhdGVRdWlja0NoYXRBdXRvbWF0aW9uVGFyZ2V0KHRhcmdldC5wcm92aWRlcklkLCB0YXJnZXQuc2Vzc2lvblR5cGVJZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0YXJnZXQ/LmtpbmQgIT09ICd3b3Jrc3BhY2UnIHx8ICF0YXJnZXQuZm9sZGVyVXJpIHx8ICFpc0F1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24odGFyZ2V0Lmlzb2xhdGlvbikpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBjcmVhdGVXb3Jrc3BhY2VBdXRvbWF0aW9uVGFyZ2V0KFxuXHRcdFVSSS5yZXZpdmUodGFyZ2V0LmZvbGRlclVyaSksXG5cdFx0dGFyZ2V0LnByb3ZpZGVySWQsXG5cdFx0dGFyZ2V0LnNlc3Npb25UeXBlSWQsXG5cdFx0dGFyZ2V0Lmlzb2xhdGlvbixcblx0KTtcbn1cblxuZnVuY3Rpb24gZGVzZXJpYWxpemVMZWdhY3lJc29sYXRpb24oaXNvbGF0aW9uTW9kZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBicmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCk6IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRpZiAoaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdHJldHVybiBicmFuY2ggPyB7IGtpbmQ6ICd3b3JrdHJlZScsIGJyYW5jaCB9IDogeyBraW5kOiAnZGVmYXVsdCcgfTtcblx0fVxuXHRyZXR1cm4gaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmtzcGFjZScgPyB7IGtpbmQ6ICdmb2xkZXInIH0gOiB7IGtpbmQ6ICdkZWZhdWx0JyB9O1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uKGlzb2xhdGlvbjogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbik6IEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRpZiAoaXNvbGF0aW9uPy5raW5kID09PSAnZGVmYXVsdCcpIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7IGtpbmQ6ICdkZWZhdWx0JyB9KTtcblx0fVxuXHRpZiAoaXNvbGF0aW9uPy5raW5kID09PSAnZm9sZGVyJykge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHsga2luZDogJ2ZvbGRlcicgfSk7XG5cdH1cblx0aWYgKGlzb2xhdGlvbj8ua2luZCA9PT0gJ3dvcmt0cmVlJyAmJiBpc29sYXRpb24uYnJhbmNoKSB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemUoeyBraW5kOiAnd29ya3RyZWUnLCBicmFuY2g6IGlzb2xhdGlvbi5icmFuY2ggfSk7XG5cdH1cblx0aWYgKGlzb2xhdGlvbj8ua2luZCA9PT0gJ3dvcmt0cmVlJykge1xuXHRcdHRocm93IG5ldyBFcnJvcignV29ya3RyZWUgYXV0b21hdGlvbiByZXF1aXJlcyBhIGJyYW5jaC4nKTtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoJ1dvcmtzcGFjZS1iYWNrZWQgYXV0b21hdGlvbiByZXF1aXJlcyBhIHZhbGlkIGlzb2xhdGlvbiBtb2RlLicpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVRdWlja0NoYXRBdXRvbWF0aW9uVGFyZ2V0KHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiBPYmplY3QuZnJlZXplKHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQsIHNlc3Npb25UeXBlSWQgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZUF1dG9tYXRpb25UYXJnZXQoXG5cdGZvbGRlclVyaTogVVJJLFxuXHRwcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHNlc3Npb25UeXBlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aXNvbGF0aW9uOiBBdXRvbWF0aW9uV29ya3NwYWNlSXNvbGF0aW9uLFxuKTogQXV0b21hdGlvblRhcmdldCB7XG5cdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRmb2xkZXJVcmksXG5cdFx0Li4uKHByb3ZpZGVySWQgIT09IHVuZGVmaW5lZCA/IHsgcHJvdmlkZXJJZCB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uVHlwZUlkICE9PSB1bmRlZmluZWQgPyB7IHNlc3Npb25UeXBlSWQgfSA6IHt9KSxcblx0XHRpc29sYXRpb246IG5vcm1hbGl6ZUF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24oaXNvbGF0aW9uKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbih2YWx1ZTogQXV0b21hdGlvbldvcmtzcGFjZUlzb2xhdGlvbiB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIEF1dG9tYXRpb25Xb3Jrc3BhY2VJc29sYXRpb24ge1xuXHRyZXR1cm4gdmFsdWU/LmtpbmQgPT09ICdkZWZhdWx0J1xuXHRcdHx8IHZhbHVlPy5raW5kID09PSAnZm9sZGVyJ1xuXHRcdHx8ICh2YWx1ZT8ua2luZCA9PT0gJ3dvcmt0cmVlJyAmJiB0eXBlb2YgdmFsdWUuYnJhbmNoID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5icmFuY2gubGVuZ3RoID4gMCk7XG59XG5cbmZ1bmN0aW9uIGZpbmRBY3RpdmVSdW4ocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgYXV0b21hdGlvbklkOiBzdHJpbmcpOiBJQXV0b21hdGlvblJ1biB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBydW5zLmZpbmQocnVuID0+IHJ1bi5hdXRvbWF0aW9uSWQgPT09IGF1dG9tYXRpb25JZCAmJiAocnVuLnN0YXR1cyA9PT0gJ3BlbmRpbmcnIHx8IHJ1bi5zdGF0dXMgPT09ICdydW5uaW5nJykpO1xufVxuXG5mdW5jdGlvbiB0cmltUnVuc1BlckF1dG9tYXRpb24ocnVuczogcmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXSwgbWF4OiBudW1iZXIpOiByZWFkb25seSBJQXV0b21hdGlvblJ1bltdIHtcblx0Y29uc3QgY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Y29uc3Qgb3V0OiBJQXV0b21hdGlvblJ1bltdID0gW107XG5cdGZvciAoY29uc3QgcnVuIG9mIHJ1bnMpIHtcblx0XHRjb25zdCBjb3VudCA9IGNvdW50cy5nZXQocnVuLmF1dG9tYXRpb25JZCkgPz8gMDtcblx0XHRpZiAoY291bnQgPj0gbWF4KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y291bnRzLnNldChydW4uYXV0b21hdGlvbklkLCBjb3VudCArIDEpO1xuXHRcdG91dC5wdXNoKHJ1bik7XG5cdH1cblx0cmV0dXJuIG91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
