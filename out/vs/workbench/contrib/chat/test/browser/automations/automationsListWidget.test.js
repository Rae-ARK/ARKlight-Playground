import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { setARIAContainer } from "../../../../../../base/browser/ui/aria/aria.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { derived, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { mock, upcastPartial } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../../../../platform/hover/test/browser/nullHoverService.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IListService, ListService } from "../../../../../../platform/list/browser/listService.js";
import { ILayoutService } from "../../../../../../platform/layout/browser/layoutService.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IHostService } from "../../../../../services/host/browser/host.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { AutomationsListWidget } from "../../../browser/aiCustomization/automationsListWidget.js";
import { IAutomationRunner } from "../../../common/automations/automationRunner.js";
import { IAutomationService } from "../../../common/automations/automationService.js";
import { IAutomationDialogService } from "../../../common/automations/automationDialogService.js";
const FOLDER = URI.parse("file:///workspace");
const SESSION_RESOURCE = "vscode-chat-session://copilot/sess-1";
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
function workspaceTarget() {
  return { kind: "workspace", folderUri: FOLDER, isolation: { kind: "default" } };
}
class FakeAutomationService extends mock() {
  constructor() {
    super(...arguments);
    this._automations = observableValue(this, []);
    this._runs = observableValue(this, []);
    this._runsForCache = /* @__PURE__ */ new Map();
    this.automations = this._automations;
    this.runs = this._runs;
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
  async createAutomation(options) {
    if (this.createError) {
      throw this.createError;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const automation = Object.freeze({
      id: generateUuid(),
      name: options.name,
      prompt: options.prompt,
      schedule: options.schedule,
      target: options.target,
      modelId: options.modelId,
      mode: options.mode,
      permissionLevel: options.permissionLevel,
      enabled: options.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      lastRunAt: void 0,
      nextRunAt: void 0
    });
    this._automations.set([automation, ...this._automations.get()], void 0);
    return automation;
  }
  async updateAutomation(id, patch) {
    if (this.updateError) {
      throw this.updateError;
    }
    const current = this.getAutomation(id);
    if (!current) {
      throw new Error(`Automation not found: ${id}`);
    }
    const updated = Object.freeze({
      ...current,
      name: patch.name ?? current.name,
      prompt: patch.prompt ?? current.prompt,
      schedule: patch.schedule ?? current.schedule,
      target: patch.target ?? current.target,
      enabled: patch.enabled ?? current.enabled,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    this._automations.set(this._automations.get().map((a) => a.id === id ? updated : a), void 0);
    return updated;
  }
  async updateAutomationIfUnchanged(id, patch, expected) {
    const current = this.getAutomation(id);
    if (current !== expected) {
      return { kind: "conflict", current };
    }
    return { kind: "updated", automation: await this.updateAutomation(id, patch) };
  }
  async deleteAutomation(id) {
    this._automations.set(this._automations.get().filter((a) => a.id !== id), void 0);
    this._runsForCache.delete(id);
  }
  async recordRunStart(automationId, trigger, leaderWindowId) {
    const activeRun = this._runs.get().find((run2) => run2.automationId === automationId && (run2.status === "pending" || run2.status === "running"));
    if (activeRun) {
      return { claimed: false, run: activeRun };
    }
    const run = Object.freeze({
      id: generateUuid(),
      automationId,
      status: "pending",
      trigger,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      leaderWindowId
    });
    this._runs.set([run, ...this._runs.get()], void 0);
    return { claimed: true, run };
  }
  async updateRun(runId, patch) {
    const current = this._runs.get().find((r) => r.id === runId);
    if (!current) {
      return void 0;
    }
    const merged = Object.freeze({
      ...current,
      status: patch.status ?? current.status,
      sessionResource: patch.sessionResource ?? current.sessionResource,
      completedAt: patch.completedAt ?? current.completedAt,
      errorMessage: patch.errorMessage ?? current.errorMessage
    });
    this._runs.set(this._runs.get().map((r) => r.id === runId ? merged : r), void 0);
    return merged;
  }
}
class RecordingRunner extends mock() {
  constructor() {
    super(...arguments);
    this.calls = [];
    this.whenDispatched = Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" });
    this.whenCompleted = Promise.resolve();
  }
  runOnce(automation, trigger, _leaderWindowId, _token) {
    this.calls.push({ automationId: automation.id, trigger });
    if (this.error) {
      const failure = Promise.reject(this.error);
      return { whenDispatched: failure, whenCompleted: failure };
    }
    return { whenDispatched: this.whenDispatched, whenCompleted: this.whenCompleted };
  }
}
class FakeDialogService extends mock() {
  constructor() {
    super(...arguments);
    this.confirmResult = true;
    this.confirmations = [];
    this.errors = [];
  }
  async confirm(confirmation) {
    this.confirmations.push(confirmation);
    return { confirmed: this.confirmResult };
  }
  async error(message, detail) {
    this.errors.push({ message, detail: detail ?? "" });
  }
  async info() {
  }
}
class FakeAutomationDialogService extends mock() {
  async showAutomationDialog(options) {
    this.lastOptions = options;
    return this.result;
  }
}
class FakeWorkspaceContextService extends mock() {
  constructor(folders = [FOLDER]) {
    super();
    this._onDidChangeWorkspaceFolders = new Emitter();
    this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
    this._folders = folders.map((uri, i) => upcastPartial({ uri, name: `folder-${i}`, index: i }));
  }
  getWorkspace() {
    return upcastPartial({ folders: this._folders });
  }
  setFolders(uris) {
    this._folders = uris.map((uri, i) => upcastPartial({ uri, name: `folder-${i}`, index: i }));
    this._onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
  }
  dispose() {
    this._onDidChangeWorkspaceFolders.dispose();
  }
}
suite("AutomationsListWidget", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const log = new NullLogService();
    const service = new FakeAutomationService();
    const runner = new RecordingRunner();
    const dialog = new FakeDialogService();
    const automationDialogService = new FakeAutomationDialogService();
    const instantiation = teardown.add(new TestInstantiationService());
    instantiation.stub(IAutomationService, service);
    instantiation.stub(IAutomationRunner, runner);
    instantiation.stub(IDialogService, dialog);
    instantiation.stub(IFileDialogService, upcastPartial({ showOpenDialog: async () => void 0 }));
    instantiation.stub(IAutomationDialogService, automationDialogService);
    instantiation.stub(IHoverService, NullHoverService);
    const workspace = new FakeWorkspaceContextService();
    teardown.add({ dispose: () => workspace.dispose() });
    instantiation.stub(IWorkspaceContextService, workspace);
    instantiation.stub(IKeybindingService, upcastPartial({}));
    instantiation.stub(IContextKeyService, new MockContextKeyService());
    instantiation.stub(IListService, teardown.add(new ListService()));
    instantiation.stub(ILayoutService, upcastPartial({ activeContainer: document.createElement("div") }));
    instantiation.stub(IHostService, upcastPartial({}));
    instantiation.stub(ILogService, log);
    instantiation.stub(IQuickInputService, upcastPartial({ pick: async () => void 0 }));
    const configService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
    instantiation.stub(IConfigurationService, configService);
    const widget = teardown.add(instantiation.createInstance(AutomationsListWidget));
    widget.setVisible(true);
    return { widget, service, runner, dialog, workspace, configService, automationDialogService };
  }
  test("renders empty state when there are no automations", () => {
    const { widget } = setup();
    const empty = widget.element.querySelector(".automations-empty-state");
    assert.ok(empty, "expected empty-state element to be present");
    const rows = widget.element.querySelectorAll(".automations-row");
    assert.strictEqual(rows.length, 0);
  });
  test("exposes one display entry per automation", async () => {
    const { widget, service } = setup();
    await service.createAutomation({ name: "First", prompt: "p1", schedule: hourly(), target: workspaceTarget() });
    await service.createAutomation({ name: "Second", prompt: "p2", schedule: hourly(), target: workspaceTarget() });
    assert.strictEqual(widget.itemCount, 2);
    const entries = widget.getDisplayEntriesForTest();
    assert.strictEqual(entries.length, 2);
    const names = entries.map((e) => e.automation.name).sort();
    assert.deepStrictEqual(names, ["First", "Second"]);
  });
  test("defers list updates while hidden and commits the latest entries when shown", async () => {
    const { widget, service } = setup();
    await service.createAutomation({ name: "First", prompt: "p1", schedule: hourly(), target: workspaceTarget() });
    widget.setVisible(false);
    await service.createAutomation({ name: "Second", prompt: "p2", schedule: hourly(), target: workspaceTarget() });
    const committedItemCountWhileHidden = widget.itemCount;
    widget.setVisible(true);
    assert.deepStrictEqual({
      committedItemCountWhileHidden,
      visibleItemCount: widget.itemCount,
      names: widget.getDisplayEntriesForTest().map((entry) => entry.automation.name)
    }, {
      committedItemCountWhileHidden: 1,
      visibleItemCount: 2,
      names: ["Second", "First"]
    });
  });
  test("disabled automations surface in the view-model as not enabled", async () => {
    const { widget, service } = setup();
    await service.createAutomation({ name: "D", prompt: "p", schedule: hourly(), target: workspaceTarget(), enabled: false });
    const entries = widget.getDisplayEntriesForTest();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].automation.enabled, false, "disabled badge is rendered from this flag");
  });
  test("workspace-less automations retain explicit quick-chat intent in the view-model", async () => {
    const { widget, service } = setup();
    await service.createAutomation({
      name: "Quick",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
    const automation = widget.getDisplayEntriesForTest()[0].automation;
    assert.deepStrictEqual(automation.target, {
      kind: "quickChat",
      providerId: "local-agent-host",
      sessionTypeId: "copilotcli"
    });
  });
  test("accessible row labels include workspace-less and workspace targets", async () => {
    const { widget, service } = setup();
    const workspace = await service.createAutomation({ name: "Workspace", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const quickChat = await service.createAutomation({
      name: "Quick",
      prompt: "p",
      schedule: hourly(),
      target: { kind: "quickChat", providerId: "local-agent-host", sessionTypeId: "copilotcli" },
      enabled: false
    });
    assert.deepStrictEqual({
      workspace: widget.formatAriaLabel(workspace),
      quickChat: widget.formatAriaLabel(quickChat)
    }, {
      workspace: "Workspace, Hourly, in folder-0",
      quickChat: "Quick, disabled, Hourly, without a workspace"
    });
  });
  test("runNow invokes the runner with trigger=manual", async () => {
    const { widget, service, runner } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await widget.runNow(a);
    assert.strictEqual(runner.calls.length, 1);
    assert.strictEqual(runner.calls[0].automationId, a.id);
    assert.strictEqual(runner.calls[0].trigger, "manual");
  });
  test("runNow announces start after dispatch before lifecycle completion", async () => {
    const { widget, service, runner } = setup();
    const dispatched = new DeferredPromise();
    const completed = new DeferredPromise();
    runner.whenDispatched = dispatched.p;
    runner.whenCompleted = completed.p;
    const ariaParent = document.createElement("div");
    setARIAContainer(ariaParent);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const runNowPromise = widget.runNow(automation);
    const claim = await service.recordRunStart(automation.id, "manual", 0);
    const run = await service.updateRun(claim.run.id, { status: "running" }) ?? claim.run;
    await dispatched.complete({ kind: "started", run, sessionResource: SESSION_RESOURCE });
    await Promise.resolve();
    assert.deepStrictEqual(
      Array.from(ariaParent.querySelectorAll(".monaco-status")).map((element) => element.textContent),
      ["Started automation A", ""]
    );
    await completed.complete(void 0);
    await runNowPromise;
  });
  test("runNow does not announce a start when dispatch never created a session", async () => {
    const { widget, service, runner } = setup();
    runner.whenDispatched = Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" });
    const ariaParent = document.createElement("div");
    setARIAContainer(ariaParent);
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await widget.runNow(automation);
    assert.deepStrictEqual(
      Array.from(ariaParent.querySelectorAll(".monaco-status")).map((element) => element.textContent),
      ["", ""]
    );
  });
  test("runNow clears inFlight when the runner fails", async () => {
    const { widget, service, runner } = setup();
    runner.error = new Error("boom");
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await widget.runNow(automation);
    assert.strictEqual(runner.calls.length, 1);
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].inFlight, false);
  });
  test("mutating actions short-circuit when chat.automations.enabled is off", async () => {
    const { widget, service, runner, configService, dialog } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget(), enabled: true });
    configService.setUserConfiguration("chat.automations.enabled", false);
    dialog.confirmResult = true;
    await widget.runNow(a);
    await widget.toggleEnabled(a);
    await widget.deleteAutomation(a);
    assert.strictEqual(runner.calls.length, 0, "runNow must not call the runner when disabled");
    const reloaded = service.getAutomation(a.id);
    assert.ok(reloaded, "automation must not be deleted");
    assert.strictEqual(reloaded?.enabled, true, "toggle must not mutate enabled flag");
  });
  test("toggleEnabled flips the enabled state", async () => {
    const { widget, service } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget(), enabled: true });
    await widget.toggleEnabled(a);
    const updated = service.getAutomation(a.id);
    assert.ok(updated);
    assert.strictEqual(updated.enabled, false);
  });
  test("openEditDialog surfaces update errors without crashing", async () => {
    const { widget, service, dialog, automationDialogService } = setup();
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    automationDialogService.result = { kind: "update", id: automation.id, value: { name: "Updated" } };
    service.updateError = new Error("update failed");
    await widget.openEditDialog(automation);
    assert.strictEqual(service.getAutomation(automation.id)?.name, "A");
    assert.deepStrictEqual(dialog.errors, [{
      message: "Failed to update automation.",
      detail: "update failed"
    }]);
  });
  test("openCreateDialog creates an automation when the dialog returns a create result", async () => {
    const { widget, automationDialogService } = setup();
    automationDialogService.result = {
      kind: "create",
      value: { name: "Created", prompt: "p", schedule: hourly(), target: workspaceTarget() }
    };
    const openCreateDialog = Reflect.get(widget, "openCreateDialog");
    assert.ok(openCreateDialog);
    await Reflect.apply(openCreateDialog, widget, []);
    assert.strictEqual(widget.itemCount, 1);
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].automation.name, "Created");
  });
  test("openCreateDialog surfaces creation errors without crashing", async () => {
    const { widget, service, dialog, automationDialogService } = setup();
    automationDialogService.result = {
      kind: "create",
      value: { name: "Created", prompt: "p", schedule: hourly(), target: workspaceTarget() }
    };
    service.createError = new Error("create failed");
    const openCreateDialog = Reflect.get(widget, "openCreateDialog");
    assert.ok(openCreateDialog);
    await Reflect.apply(openCreateDialog, widget, []);
    assert.strictEqual(widget.itemCount, 0);
    assert.deepStrictEqual(dialog.errors, [{
      message: "Failed to create automation.",
      detail: "create failed"
    }]);
  });
  test("deleteAutomation only deletes when the confirmation is accepted", async () => {
    const { widget, service, dialog } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    dialog.confirmResult = false;
    await widget.deleteAutomation(a);
    assert.strictEqual(dialog.confirmations.length, 1);
    assert.ok(service.getAutomation(a.id), "expected automation to still exist after declined delete");
  });
  test("deleteAutomation removes the automation when the confirmation is accepted", async () => {
    const { widget, service, dialog } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    dialog.confirmResult = true;
    await widget.deleteAutomation(a);
    assert.strictEqual(service.getAutomation(a.id), void 0);
    assert.strictEqual(widget.itemCount, 0);
    assert.strictEqual(widget.getDisplayEntriesForTest().length, 0);
  });
  test("fires onDidChangeItemCount when automations change", async () => {
    const { widget, service } = setup();
    const seen = [];
    teardown.add(widget.onDidChangeItemCount((c) => seen.push(c)));
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    await service.createAutomation({ name: "B", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    assert.ok(seen.length >= 2, `expected at least 2 emissions, got ${seen.length}`);
    assert.strictEqual(seen[seen.length - 1], 2);
  });
  test("fireItemCount reflects current service size", async () => {
    const { widget, service } = setup();
    await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    let captured = -1;
    teardown.add(widget.onDidChangeItemCount((c) => {
      captured = c;
    }));
    widget.fireItemCount();
    assert.strictEqual(captured, 1);
  });
  test("history is collapsed by default and toggleExpanded flips the row expansion", async () => {
    const { widget, service } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);
    widget.toggleExpanded(a.id);
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, true);
    widget.toggleExpanded(a.id);
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);
  });
  test("focusAutomation reveals and expands the requested automation", async () => {
    const { widget, service } = setup();
    const automation = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    assert.deepStrictEqual({
      found: widget.focusAutomation(automation.id),
      expanded: widget.getDisplayEntriesForTest()[0].expanded,
      missing: widget.focusAutomation("missing")
    }, {
      found: true,
      expanded: true,
      missing: false
    });
  });
  test("expanded row exposes no runs when there are none", async () => {
    const { widget, service } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    widget.toggleExpanded(a.id);
    const entry = widget.getDisplayEntriesForTest()[0];
    assert.strictEqual(entry.expanded, true);
    assert.strictEqual(entry.runs.length, 0, "history empty-state is rendered from an empty runs list");
  });
  test("expanded row exposes runs newest-first with status and error message", async () => {
    const { widget, service } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    const r1 = (await service.recordRunStart(a.id, "schedule", 1)).run;
    await service.updateRun(r1.id, { status: "completed", completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    const r2 = (await service.recordRunStart(a.id, "manual", 1)).run;
    await service.updateRun(r2.id, { status: "failed", errorMessage: "boom", completedAt: (/* @__PURE__ */ new Date()).toISOString() });
    await service.recordRunStart(a.id, "catch_up", 1);
    widget.toggleExpanded(a.id);
    const runs = widget.getDisplayEntriesForTest()[0].runs;
    assert.strictEqual(runs.length, 3);
    const statuses = runs.map((r) => r.status);
    assert.deepStrictEqual(statuses, ["pending", "failed", "completed"]);
    const triggers = runs.map((r) => r.trigger);
    assert.deepStrictEqual(triggers, ["catch_up", "manual", "schedule"]);
    const failed = runs.find((r) => r.status === "failed");
    assert.strictEqual(failed?.errorMessage, "boom");
  });
  test("expanded row re-derives its runs when a run is added", async () => {
    const { widget, service } = setup();
    const a = await service.createAutomation({ name: "A", prompt: "p", schedule: hourly(), target: workspaceTarget() });
    widget.toggleExpanded(a.id);
    assert.strictEqual(widget.getDisplayEntriesForTest()[0].runs.length, 0);
    await service.recordRunStart(a.id, "schedule", 1);
    await Promise.resolve();
    const entry = widget.getDisplayEntriesForTest()[0];
    assert.strictEqual(entry.expanded, true);
    assert.strictEqual(entry.runs.length, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zTGlzdFdpZGdldC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgc2V0QVJJQUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBtb2NrLCB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbmZpcm1hdGlvbiwgSUNvbmZpcm1hdGlvblJlc3VsdCwgSURpYWxvZ1NlcnZpY2UsIElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBOdWxsSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvdGVzdC9icm93c2VyL251bGxIb3ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNMaXN0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYXV0b21hdGlvbnNMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uLCBJQXV0b21hdGlvblJ1biwgSUF1dG9tYXRpb25TY2hlZHVsZSwgQXV0b21hdGlvblJ1blRyaWdnZXIsIEF1dG9tYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoLCBJQXV0b21hdGlvblJ1bm5lciwgSUF1dG9tYXRpb25SdW5PcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkNsYWltLCBJQXV0b21hdGlvblNlcnZpY2UsIElDcmVhdGVBdXRvbWF0aW9uT3B0aW9ucywgSUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0LCBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIElVcGRhdGVBdXRvbWF0aW9uUnVuT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCwgSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBJU2hvd0F1dG9tYXRpb25EaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLmpzJztcblxuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuY29uc3QgU0VTU0lPTl9SRVNPVVJDRSA9ICd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vY29waWxvdC9zZXNzLTEnO1xuXG5mdW5jdGlvbiBob3VybHkoKTogSUF1dG9tYXRpb25TY2hlZHVsZSB7XG5cdHJldHVybiB7IGludGVydmFsOiAnaG91cmx5Jywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfTtcbn1cblxuZnVuY3Rpb24gd29ya3NwYWNlVGFyZ2V0KCk6IEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4geyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9O1xufVxuXG4vKipcbiAqIEluLW1lbW9yeSBJQXV0b21hdGlvblNlcnZpY2UgZm9yIHRoZSB3aWRnZXQgdGVzdHMuIFJlcGxhY2VzIHRoZSBjb25jcmV0ZVxuICogQXV0b21hdGlvblNlcnZpY2UsIHdoaWNoIG5vdyBsaXZlcyBpbiB0aGUgc2Vzc2lvbnMgbGF5ZXIuIEltcG9ydGluZyBpdCBmcm9tXG4gKiBhIHdvcmtiZW5jaC1sYXllciB0ZXN0IHRyaXBzIHRoZSBgY29kZS1pbXBvcnQtcGF0dGVybnNgIHJ1bGUuIFRoZSB3aWRnZXQgb25seVxuICogcmVhZHMgdGhlIGBhdXRvbWF0aW9uc2AvYHJ1bnNgIG9ic2VydmFibGVzIGFuZCBkcml2ZXMgY3JlYXRlL3VwZGF0ZS9kZWxldGUsXG4gKiBzbyB0aGlzIGZha2Uga2VlcHMgYW4gdW5wZXJzaXN0ZWQgcmVhY3RpdmUgc3RvcmUgd2l0aCBqdXN0IHRob3NlIG11dGF0aW9uc1xuICogcGx1cyB0aGUgcnVuLXJlY29yZGluZyB0aGUgdGVzdHMgZXhlcmNpc2UgZGlyZWN0bHkuXG4gKi9cbmNsYXNzIEZha2VBdXRvbWF0aW9uU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25TZXJ2aWNlPigpIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvbWF0aW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQXV0b21hdGlvbltdPih0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ydW5zRm9yQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgSU9ic2VydmFibGU8cmVhZG9ubHkgSUF1dG9tYXRpb25SdW5bXT4+KCk7XG5cdGNyZWF0ZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0dXBkYXRlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdG92ZXJyaWRlIHJlYWRvbmx5IGF1dG9tYXRpb25zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvbltdPiA9IHRoaXMuX2F1dG9tYXRpb25zO1xuXHRvdmVycmlkZSByZWFkb25seSBydW5zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPiA9IHRoaXMuX3J1bnM7XG5cblx0b3ZlcnJpZGUgZ2V0QXV0b21hdGlvbihpZDogc3RyaW5nKTogSUF1dG9tYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvbWF0aW9ucy5nZXQoKS5maW5kKGEgPT4gYS5pZCA9PT0gaWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuc0ZvcihhdXRvbWF0aW9uSWQ6IHN0cmluZyk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+IHtcblx0XHRsZXQgY2FjaGVkID0gdGhpcy5fcnVuc0ZvckNhY2hlLmdldChhdXRvbWF0aW9uSWQpO1xuXHRcdGlmICghY2FjaGVkKSB7XG5cdFx0XHRjYWNoZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9ydW5zLnJlYWQocmVhZGVyKS5maWx0ZXIociA9PiByLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkKSk7XG5cdFx0XHR0aGlzLl9ydW5zRm9yQ2FjaGUuc2V0KGF1dG9tYXRpb25JZCwgY2FjaGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhY2hlZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbj4ge1xuXHRcdGlmICh0aGlzLmNyZWF0ZUVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmNyZWF0ZUVycm9yO1xuXHRcdH1cblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbjogSUF1dG9tYXRpb24gPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdG5hbWU6IG9wdGlvbnMubmFtZSxcblx0XHRcdHByb21wdDogb3B0aW9ucy5wcm9tcHQsXG5cdFx0XHRzY2hlZHVsZTogb3B0aW9ucy5zY2hlZHVsZSxcblx0XHRcdHRhcmdldDogb3B0aW9ucy50YXJnZXQsXG5cdFx0XHRtb2RlbElkOiBvcHRpb25zLm1vZGVsSWQsXG5cdFx0XHRtb2RlOiBvcHRpb25zLm1vZGUsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IG9wdGlvbnMucGVybWlzc2lvbkxldmVsLFxuXHRcdFx0ZW5hYmxlZDogb3B0aW9ucy5lbmFibGVkID8/IHRydWUsXG5cdFx0XHRjcmVhdGVkQXQ6IG5vdyxcblx0XHRcdHVwZGF0ZWRBdDogbm93LFxuXHRcdFx0bGFzdFJ1bkF0OiB1bmRlZmluZWQsXG5cdFx0XHRuZXh0UnVuQXQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHR0aGlzLl9hdXRvbWF0aW9ucy5zZXQoW2F1dG9tYXRpb24sIC4uLnRoaXMuX2F1dG9tYXRpb25zLmdldCgpXSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gYXV0b21hdGlvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHVwZGF0ZUF1dG9tYXRpb24oaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyk6IFByb21pc2U8SUF1dG9tYXRpb24+IHtcblx0XHRpZiAodGhpcy51cGRhdGVFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy51cGRhdGVFcnJvcjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0QXV0b21hdGlvbihpZCk7XG5cdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEF1dG9tYXRpb24gbm90IGZvdW5kOiAke2lkfWApO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkOiBJQXV0b21hdGlvbiA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdG5hbWU6IHBhdGNoLm5hbWUgPz8gY3VycmVudC5uYW1lLFxuXHRcdFx0cHJvbXB0OiBwYXRjaC5wcm9tcHQgPz8gY3VycmVudC5wcm9tcHQsXG5cdFx0XHRzY2hlZHVsZTogcGF0Y2guc2NoZWR1bGUgPz8gY3VycmVudC5zY2hlZHVsZSxcblx0XHRcdHRhcmdldDogcGF0Y2gudGFyZ2V0ID8/IGN1cnJlbnQudGFyZ2V0LFxuXHRcdFx0ZW5hYmxlZDogcGF0Y2guZW5hYmxlZCA/PyBjdXJyZW50LmVuYWJsZWQsXG5cdFx0XHR1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9KTtcblx0XHR0aGlzLl9hdXRvbWF0aW9ucy5zZXQodGhpcy5fYXV0b21hdGlvbnMuZ2V0KCkubWFwKGEgPT4gYS5pZCA9PT0gaWQgPyB1cGRhdGVkIDogYSksIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHVwZGF0ZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVBdXRvbWF0aW9uSWZVbmNoYW5nZWQoaWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucywgZXhwZWN0ZWQ6IElBdXRvbWF0aW9uKTogUHJvbWlzZTxJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQ+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5nZXRBdXRvbWF0aW9uKGlkKTtcblx0XHRpZiAoY3VycmVudCAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdjb25mbGljdCcsIGN1cnJlbnQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ3VwZGF0ZWQnLCBhdXRvbWF0aW9uOiBhd2FpdCB0aGlzLnVwZGF0ZUF1dG9tYXRpb24oaWQsIHBhdGNoKSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGVsZXRlQXV0b21hdGlvbihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYXV0b21hdGlvbnMuc2V0KHRoaXMuX2F1dG9tYXRpb25zLmdldCgpLmZpbHRlcihhID0+IGEuaWQgIT09IGlkKSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9ydW5zRm9yQ2FjaGUuZGVsZXRlKGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb25JZDogc3RyaW5nLCB0cmlnZ2VyOiBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgbGVhZGVyV2luZG93SWQ6IG51bWJlcik6IFByb21pc2U8SUF1dG9tYXRpb25SdW5DbGFpbT4ge1xuXHRcdGNvbnN0IGFjdGl2ZVJ1biA9IHRoaXMuX3J1bnMuZ2V0KCkuZmluZChydW4gPT4gcnVuLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkICYmIChydW4uc3RhdHVzID09PSAncGVuZGluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSk7XG5cdFx0aWYgKGFjdGl2ZVJ1bikge1xuXHRcdFx0cmV0dXJuIHsgY2xhaW1lZDogZmFsc2UsIHJ1bjogYWN0aXZlUnVuIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJ1bjogSUF1dG9tYXRpb25SdW4gPSBPYmplY3QuZnJlZXplKHtcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdGF1dG9tYXRpb25JZCxcblx0XHRcdHN0YXR1czogJ3BlbmRpbmcnLFxuXHRcdFx0dHJpZ2dlcixcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bGVhZGVyV2luZG93SWQsXG5cdFx0fSk7XG5cdFx0dGhpcy5fcnVucy5zZXQoW3J1biwgLi4udGhpcy5fcnVucy5nZXQoKV0sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHsgY2xhaW1lZDogdHJ1ZSwgcnVuIH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVSdW4ocnVuSWQ6IHN0cmluZywgcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uUnVuT3B0aW9ucyk6IFByb21pc2U8SUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcnVucy5nZXQoKS5maW5kKHIgPT4gci5pZCA9PT0gcnVuSWQpO1xuXHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWVyZ2VkOiBJQXV0b21hdGlvblJ1biA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdHN0YXR1czogcGF0Y2guc3RhdHVzID8/IGN1cnJlbnQuc3RhdHVzLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBwYXRjaC5zZXNzaW9uUmVzb3VyY2UgPz8gY3VycmVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjb21wbGV0ZWRBdDogcGF0Y2guY29tcGxldGVkQXQgPz8gY3VycmVudC5jb21wbGV0ZWRBdCxcblx0XHRcdGVycm9yTWVzc2FnZTogcGF0Y2guZXJyb3JNZXNzYWdlID8/IGN1cnJlbnQuZXJyb3JNZXNzYWdlLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3J1bnMuc2V0KHRoaXMuX3J1bnMuZ2V0KCkubWFwKHIgPT4gci5pZCA9PT0gcnVuSWQgPyBtZXJnZWQgOiByKSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gbWVyZ2VkO1xuXHR9XG59XG5cbmNsYXNzIFJlY29yZGluZ1J1bm5lciBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25SdW5uZXI+KCkge1xuXHRyZWFkb25seSBjYWxsczogeyBhdXRvbWF0aW9uSWQ6IHN0cmluZzsgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIgfVtdID0gW107XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2U8SUF1dG9tYXRpb25SdW5EaXNwYXRjaD4gPSBQcm9taXNlLnJlc29sdmUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KTtcblx0d2hlbkNvbXBsZXRlZDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdG92ZXJyaWRlIHJ1bk9uY2UoXG5cdFx0YXV0b21hdGlvbjogSUF1dG9tYXRpb24sXG5cdFx0dHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsXG5cdFx0X2xlYWRlcldpbmRvd0lkOiBudW1iZXIsXG5cdFx0X3Rva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIHtcblx0XHR0aGlzLmNhbGxzLnB1c2goeyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsIHRyaWdnZXIgfSk7XG5cdFx0aWYgKHRoaXMuZXJyb3IpIHtcblx0XHRcdGNvbnN0IGZhaWx1cmUgPSBQcm9taXNlLnJlamVjdCh0aGlzLmVycm9yKTtcblx0XHRcdHJldHVybiB7IHdoZW5EaXNwYXRjaGVkOiBmYWlsdXJlLCB3aGVuQ29tcGxldGVkOiBmYWlsdXJlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHdoZW5EaXNwYXRjaGVkOiB0aGlzLndoZW5EaXNwYXRjaGVkLCB3aGVuQ29tcGxldGVkOiB0aGlzLndoZW5Db21wbGV0ZWQgfTtcblx0fVxufVxuXG5jbGFzcyBGYWtlRGlhbG9nU2VydmljZSBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkge1xuXHRjb25maXJtUmVzdWx0ID0gdHJ1ZTtcblx0cmVhZG9ubHkgY29uZmlybWF0aW9uczogSUNvbmZpcm1hdGlvbltdID0gW107XG5cdHJlYWRvbmx5IGVycm9yczogeyBtZXNzYWdlOiBzdHJpbmc7IGRldGFpbDogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGNvbmZpcm0oY29uZmlybWF0aW9uOiBJQ29uZmlybWF0aW9uKTogUHJvbWlzZTxJQ29uZmlybWF0aW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5jb25maXJtYXRpb25zLnB1c2goY29uZmlybWF0aW9uKTtcblx0XHRyZXR1cm4geyBjb25maXJtZWQ6IHRoaXMuY29uZmlybVJlc3VsdCB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZXJyb3IobWVzc2FnZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmVycm9ycy5wdXNoKHsgbWVzc2FnZSwgZGV0YWlsOiBkZXRhaWwgPz8gJycgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBpbmZvKCk6IFByb21pc2U8dm9pZD4geyAvKiBuby1vcCAqLyB9XG59XG5cbmNsYXNzIEZha2VBdXRvbWF0aW9uRGlhbG9nU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlPigpIHtcblx0cmVzdWx0OiBJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCB8IHVuZGVmaW5lZDtcblx0bGFzdE9wdGlvbnM6IElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvd0F1dG9tYXRpb25EaWFsb2cob3B0aW9uczogSVNob3dBdXRvbWF0aW9uRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8SUF1dG9tYXRpb25EaWFsb2dSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmxhc3RPcHRpb25zID0gb3B0aW9ucztcblx0XHRyZXR1cm4gdGhpcy5yZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgRmFrZVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+KCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRXZlbnQ8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdO1xuXG5cdGNvbnN0cnVjdG9yKGZvbGRlcnM6IHJlYWRvbmx5IFVSSVtdID0gW0ZPTERFUl0pIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2ZvbGRlcnMgPSBmb2xkZXJzLm1hcCgodXJpLCBpKSA9PiB1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VGb2xkZXI+KHsgdXJpLCBuYW1lOiBgZm9sZGVyLSR7aX1gLCBpbmRleDogaSB9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8SVdvcmtzcGFjZT4oeyBmb2xkZXJzOiB0aGlzLl9mb2xkZXJzIH0pO1xuXHR9XG5cblx0c2V0Rm9sZGVycyh1cmlzOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGRlcnMgPSB1cmlzLm1hcCgodXJpLCBpKSA9PiB1cGNhc3RQYXJ0aWFsPElXb3Jrc3BhY2VGb2xkZXI+KHsgdXJpLCBuYW1lOiBgZm9sZGVyLSR7aX1gLCBpbmRleDogaSB9KSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmZpcmUoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5zdWl0ZSgnQXV0b21hdGlvbnNMaXN0V2lkZ2V0JywgKCkgPT4ge1xuXG5cdGNvbnN0IHRlYXJkb3duID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBydW5uZXIgPSBuZXcgUmVjb3JkaW5nUnVubmVyKCk7XG5cdFx0Y29uc3QgZGlhbG9nID0gbmV3IEZha2VEaWFsb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uID0gdGVhcmRvd24uYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElBdXRvbWF0aW9uU2VydmljZSwgc2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElBdXRvbWF0aW9uUnVubmVyLCBydW5uZXIpO1xuXHRcdGluc3RhbnRpYXRpb24uc3R1YihJRGlhbG9nU2VydmljZSwgZGlhbG9nKTtcblx0XHRpbnN0YW50aWF0aW9uLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB1cGNhc3RQYXJ0aWFsPElGaWxlRGlhbG9nU2VydmljZT4oeyBzaG93T3BlbkRpYWxvZzogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0pKTtcblx0XHRpbnN0YW50aWF0aW9uLnN0dWIoSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElIb3ZlclNlcnZpY2UsIE51bGxIb3ZlclNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBGYWtlV29ya3NwYWNlQ29udGV4dFNlcnZpY2UoKTtcblx0XHR0ZWFyZG93bi5hZGQoeyBkaXNwb3NlOiAoKSA9PiB3b3Jrc3BhY2UuZGlzcG9zZSgpIH0pO1xuXHRcdGluc3RhbnRpYXRpb24uc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHdvcmtzcGFjZSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElLZXliaW5kaW5nU2VydmljZSwgdXBjYXN0UGFydGlhbDxJS2V5YmluZGluZ1NlcnZpY2U+KHt9KSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uLnN0dWIoSUxpc3RTZXJ2aWNlLCB0ZWFyZG93bi5hZGQobmV3IExpc3RTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uLnN0dWIoSUxheW91dFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUxheW91dFNlcnZpY2U+KHsgYWN0aXZlQ29udGFpbmVyOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSB9KSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElIb3N0U2VydmljZSwgdXBjYXN0UGFydGlhbDxJSG9zdFNlcnZpY2U+KHt9KSk7XG5cdFx0aW5zdGFudGlhdGlvbi5zdHViKElMb2dTZXJ2aWNlLCBsb2cpO1xuXHRcdGluc3RhbnRpYXRpb24uc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SVF1aWNrSW5wdXRTZXJ2aWNlPih7IHBpY2s6IGFzeW5jICgpID0+IHVuZGVmaW5lZCB9KSk7XG5cdFx0Ly8gRW5hYmxlIHRoZSBBdXRvbWF0aW9ucyBmZWF0dXJlIHNvIG11dGF0aW9uIGhhbmRsZXJzIGRvbid0XG5cdFx0Ly8gc2hvcnQtY2lyY3VpdCB3aXRoIHRoZSBcImZlYXR1cmUgZGlzYWJsZWRcIiB0b2FzdC4gVGhlIHJ1bnRpbWVcblx0XHQvLyBnYXRpbmcgaXMgZXhlcmNpc2VkIGluIGEgZGVkaWNhdGVkIHRlc3QgYmVsb3cuXG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBjaGF0OiB7IGF1dG9tYXRpb25zOiB7IGVuYWJsZWQ6IHRydWUgfSB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb24uc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGVhcmRvd24uYWRkKGluc3RhbnRpYXRpb24uY3JlYXRlSW5zdGFuY2UoQXV0b21hdGlvbnNMaXN0V2lkZ2V0KSk7XG5cdFx0d2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdFx0cmV0dXJuIHsgd2lkZ2V0LCBzZXJ2aWNlLCBydW5uZXIsIGRpYWxvZywgd29ya3NwYWNlLCBjb25maWdTZXJ2aWNlLCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSB9O1xuXHR9XG5cblx0dGVzdCgncmVuZGVycyBlbXB0eSBzdGF0ZSB3aGVuIHRoZXJlIGFyZSBubyBhdXRvbWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBlbXB0eSA9IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1lbXB0eS1zdGF0ZScpO1xuXHRcdGFzc2VydC5vayhlbXB0eSwgJ2V4cGVjdGVkIGVtcHR5LXN0YXRlIGVsZW1lbnQgdG8gYmUgcHJlc2VudCcpO1xuXHRcdGNvbnN0IHJvd3MgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yQWxsKCcuYXV0b21hdGlvbnMtcm93Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvd3MubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gVGhlIEF1dG9tYXRpb25zIGxpc3QgaXMgYSB2aXJ0dWFsaXplZCBXb3JrYmVuY2hMaXN0LCB3aGljaCBkb2VzIG5vdCBsYXlcblx0Ly8gb3V0IHJvd3MgaW4gYSB1bml0LXRlc3QgRE9NIChubyBoZWlnaHQpLiBNaXJyb3JpbmcgdGhlIHNpYmxpbmdcblx0Ly8gYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldCB0ZXN0LCB0aGVzZSBjYXNlcyBhc3NlcnQgdGhlIHdpZGdldCdzIHB1YmxpY1xuXHQvLyBBUEkgYW5kIHZpZXctbW9kZWwgKHZpYSBnZXREaXNwbGF5RW50cmllc0ZvclRlc3QgLyBpdGVtQ291bnQpIHJhdGhlciB0aGFuXG5cdC8vIHF1ZXJ5aW5nIG9yIGNsaWNraW5nIHZpcnR1YWxpemVkIHJvdyBlbGVtZW50cy5cblxuXHR0ZXN0KCdleHBvc2VzIG9uZSBkaXNwbGF5IGVudHJ5IHBlciBhdXRvbWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdGaXJzdCcsIHByb21wdDogJ3AxJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdTZWNvbmQnLCBwcm9tcHQ6ICdwMicsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuaXRlbUNvdW50LCAyKTtcblxuXHRcdGNvbnN0IGVudHJpZXMgPSB3aWRnZXQuZ2V0RGlzcGxheUVudHJpZXNGb3JUZXN0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJpZXMubGVuZ3RoLCAyKTtcblx0XHRjb25zdCBuYW1lcyA9IGVudHJpZXMubWFwKGUgPT4gZS5hdXRvbWF0aW9uLm5hbWUpLnNvcnQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5hbWVzLCBbJ0ZpcnN0JywgJ1NlY29uZCddKTtcblx0fSk7XG5cblx0dGVzdCgnZGVmZXJzIGxpc3QgdXBkYXRlcyB3aGlsZSBoaWRkZW4gYW5kIGNvbW1pdHMgdGhlIGxhdGVzdCBlbnRyaWVzIHdoZW4gc2hvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0ZpcnN0JywgcHJvbXB0OiAncDEnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHR3aWRnZXQuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ1NlY29uZCcsIHByb21wdDogJ3AyJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZEl0ZW1Db3VudFdoaWxlSGlkZGVuID0gd2lkZ2V0Lml0ZW1Db3VudDtcblxuXHRcdHdpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21taXR0ZWRJdGVtQ291bnRXaGlsZUhpZGRlbixcblx0XHRcdHZpc2libGVJdGVtQ291bnQ6IHdpZGdldC5pdGVtQ291bnQsXG5cdFx0XHRuYW1lczogd2lkZ2V0LmdldERpc3BsYXlFbnRyaWVzRm9yVGVzdCgpLm1hcChlbnRyeSA9PiBlbnRyeS5hdXRvbWF0aW9uLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdGNvbW1pdHRlZEl0ZW1Db3VudFdoaWxlSGlkZGVuOiAxLFxuXHRcdFx0dmlzaWJsZUl0ZW1Db3VudDogMixcblx0XHRcdG5hbWVzOiBbJ1NlY29uZCcsICdGaXJzdCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlZCBhdXRvbWF0aW9ucyBzdXJmYWNlIGluIHRoZSB2aWV3LW1vZGVsIGFzIG5vdCBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdEJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSwgZW5hYmxlZDogZmFsc2UgfSk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gd2lkZ2V0LmdldERpc3BsYXlFbnRyaWVzRm9yVGVzdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyaWVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJpZXNbMF0uYXV0b21hdGlvbi5lbmFibGVkLCBmYWxzZSwgJ2Rpc2FibGVkIGJhZGdlIGlzIHJlbmRlcmVkIGZyb20gdGhpcyBmbGFnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtzcGFjZS1sZXNzIGF1dG9tYXRpb25zIHJldGFpbiBleHBsaWNpdCBxdWljay1jaGF0IGludGVudCBpbiB0aGUgdmlldy1tb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oe1xuXHRcdFx0bmFtZTogJ1F1aWNrJyxcblx0XHRcdHByb21wdDogJ3AnLFxuXHRcdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdFx0dGFyZ2V0OiB7IGtpbmQ6ICdxdWlja0NoYXQnLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXS5hdXRvbWF0aW9uO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXV0b21hdGlvbi50YXJnZXQsIHtcblx0XHRcdGtpbmQ6ICdxdWlja0NoYXQnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogJ2NvcGlsb3RjbGknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY2Nlc3NpYmxlIHJvdyBsYWJlbHMgaW5jbHVkZSB3b3Jrc3BhY2UtbGVzcyBhbmQgd29ya3NwYWNlIHRhcmdldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ1dvcmtzcGFjZScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0Y29uc3QgcXVpY2tDaGF0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdRdWljaycsXG5cdFx0XHRwcm9tcHQ6ICdwJyxcblx0XHRcdHNjaGVkdWxlOiBob3VybHkoKSxcblx0XHRcdHRhcmdldDogeyBraW5kOiAncXVpY2tDaGF0JywgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3Jrc3BhY2U6IHdpZGdldC5mb3JtYXRBcmlhTGFiZWwod29ya3NwYWNlKSxcblx0XHRcdHF1aWNrQ2hhdDogd2lkZ2V0LmZvcm1hdEFyaWFMYWJlbChxdWlja0NoYXQpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZTogJ1dvcmtzcGFjZSwgSG91cmx5LCBpbiBmb2xkZXItMCcsXG5cdFx0XHRxdWlja0NoYXQ6ICdRdWljaywgZGlzYWJsZWQsIEhvdXJseSwgd2l0aG91dCBhIHdvcmtzcGFjZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bk5vdyBpbnZva2VzIHRoZSBydW5uZXIgd2l0aCB0cmlnZ2VyPW1hbnVhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRhd2FpdCB3aWRnZXQucnVuTm93KGEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5jYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIuY2FsbHNbMF0uYXV0b21hdGlvbklkLCBhLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVubmVyLmNhbGxzWzBdLnRyaWdnZXIsICdtYW51YWwnKTtcblx0fSk7XG5cblx0dGVzdCgncnVuTm93IGFubm91bmNlcyBzdGFydCBhZnRlciBkaXNwYXRjaCBiZWZvcmUgbGlmZWN5Y2xlIGNvbXBsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBkaXNwYXRjaGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxJQXV0b21hdGlvblJ1bkRpc3BhdGNoPigpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRydW5uZXIud2hlbkRpc3BhdGNoZWQgPSBkaXNwYXRjaGVkLnA7XG5cdFx0cnVubmVyLndoZW5Db21wbGV0ZWQgPSBjb21wbGV0ZWQucDtcblx0XHRjb25zdCBhcmlhUGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2V0QVJJQUNvbnRhaW5lcihhcmlhUGFyZW50KTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0Y29uc3QgcnVuTm93UHJvbWlzZSA9IHdpZGdldC5ydW5Ob3coYXV0b21hdGlvbik7XG5cdFx0Y29uc3QgY2xhaW0gPSBhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAwKTtcblx0XHRjb25zdCBydW4gPSBhd2FpdCBzZXJ2aWNlLnVwZGF0ZVJ1bihjbGFpbS5ydW4uaWQsIHsgc3RhdHVzOiAncnVubmluZycgfSkgPz8gY2xhaW0ucnVuO1xuXHRcdGF3YWl0IGRpc3BhdGNoZWQuY29tcGxldGUoeyBraW5kOiAnc3RhcnRlZCcsIHJ1biwgc2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFIH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdEFycmF5LmZyb20oYXJpYVBhcmVudC5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLXN0YXR1cycpKS5tYXAoZWxlbWVudCA9PiBlbGVtZW50LnRleHRDb250ZW50KSxcblx0XHRcdFsnU3RhcnRlZCBhdXRvbWF0aW9uIEEnLCAnJ10sXG5cdFx0KTtcblxuXHRcdGF3YWl0IGNvbXBsZXRlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHJ1bk5vd1Byb21pc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bk5vdyBkb2VzIG5vdCBhbm5vdW5jZSBhIHN0YXJ0IHdoZW4gZGlzcGF0Y2ggbmV2ZXIgY3JlYXRlZCBhIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UsIHJ1bm5lciB9ID0gc2V0dXAoKTtcblx0XHRydW5uZXIud2hlbkRpc3BhdGNoZWQgPSBQcm9taXNlLnJlc29sdmUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KTtcblx0XHRjb25zdCBhcmlhUGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0c2V0QVJJQUNvbnRhaW5lcihhcmlhUGFyZW50KTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0YXdhaXQgd2lkZ2V0LnJ1bk5vdyhhdXRvbWF0aW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRBcnJheS5mcm9tKGFyaWFQYXJlbnQucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1zdGF0dXMnKSkubWFwKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCksXG5cdFx0XHRbJycsICcnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5Ob3cgY2xlYXJzIGluRmxpZ2h0IHdoZW4gdGhlIHJ1bm5lciBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSwgcnVubmVyIH0gPSBzZXR1cCgpO1xuXHRcdHJ1bm5lci5lcnJvciA9IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRhd2FpdCB3aWRnZXQucnVuTm93KGF1dG9tYXRpb24pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJ1bm5lci5jYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZ2V0RGlzcGxheUVudHJpZXNGb3JUZXN0KClbMF0uaW5GbGlnaHQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbXV0YXRpbmcgYWN0aW9ucyBzaG9ydC1jaXJjdWl0IHdoZW4gY2hhdC5hdXRvbWF0aW9ucy5lbmFibGVkIGlzIG9mZicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSwgcnVubmVyLCBjb25maWdTZXJ2aWNlLCBkaWFsb2cgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSwgZW5hYmxlZDogdHJ1ZSB9KTtcblxuXHRcdC8vIEZsaXAgdGhlIHNldHRpbmcgb2ZmLCB0aGVuIGRyaXZlIGVhY2ggbXV0YXRpbmcgYWN0aW9uIHRocm91Z2ggdGhlXG5cdFx0Ly8gcHVibGljIEFQSS4gTm9uZSBvZiB0aGVtIHNob3VsZCByZWFjaCB0aGUgc2VydmljZSAvIHJ1bm5lci5cblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmF1dG9tYXRpb25zLmVuYWJsZWQnLCBmYWxzZSk7XG5cdFx0ZGlhbG9nLmNvbmZpcm1SZXN1bHQgPSB0cnVlO1xuXG5cdFx0YXdhaXQgd2lkZ2V0LnJ1bk5vdyhhKTtcblx0XHRhd2FpdCB3aWRnZXQudG9nZ2xlRW5hYmxlZChhKTtcblx0XHRhd2FpdCB3aWRnZXQuZGVsZXRlQXV0b21hdGlvbihhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChydW5uZXIuY2FsbHMubGVuZ3RoLCAwLCAncnVuTm93IG11c3Qgbm90IGNhbGwgdGhlIHJ1bm5lciB3aGVuIGRpc2FibGVkJyk7XG5cdFx0Y29uc3QgcmVsb2FkZWQgPSBzZXJ2aWNlLmdldEF1dG9tYXRpb24oYS5pZCk7XG5cdFx0YXNzZXJ0Lm9rKHJlbG9hZGVkLCAnYXV0b21hdGlvbiBtdXN0IG5vdCBiZSBkZWxldGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbG9hZGVkPy5lbmFibGVkLCB0cnVlLCAndG9nZ2xlIG11c3Qgbm90IG11dGF0ZSBlbmFibGVkIGZsYWcnKTtcblx0fSk7XG5cblx0dGVzdCgndG9nZ2xlRW5hYmxlZCBmbGlwcyB0aGUgZW5hYmxlZCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpLCBlbmFibGVkOiB0cnVlIH0pO1xuXG5cdFx0YXdhaXQgd2lkZ2V0LnRvZ2dsZUVuYWJsZWQoYSk7XG5cblx0XHRjb25zdCB1cGRhdGVkID0gc2VydmljZS5nZXRBdXRvbWF0aW9uKGEuaWQpO1xuXHRcdGFzc2VydC5vayh1cGRhdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZC5lbmFibGVkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5FZGl0RGlhbG9nIHN1cmZhY2VzIHVwZGF0ZSBlcnJvcnMgd2l0aG91dCBjcmFzaGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHdpZGdldCwgc2VydmljZSwgZGlhbG9nLCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXHRcdGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnJlc3VsdCA9IHsga2luZDogJ3VwZGF0ZScsIGlkOiBhdXRvbWF0aW9uLmlkLCB2YWx1ZTogeyBuYW1lOiAnVXBkYXRlZCcgfSB9O1xuXHRcdHNlcnZpY2UudXBkYXRlRXJyb3IgPSBuZXcgRXJyb3IoJ3VwZGF0ZSBmYWlsZWQnKTtcblxuXHRcdGF3YWl0IHdpZGdldC5vcGVuRWRpdERpYWxvZyhhdXRvbWF0aW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEF1dG9tYXRpb24oYXV0b21hdGlvbi5pZCk/Lm5hbWUsICdBJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWFsb2cuZXJyb3JzLCBbe1xuXHRcdFx0bWVzc2FnZTogJ0ZhaWxlZCB0byB1cGRhdGUgYXV0b21hdGlvbi4nLFxuXHRcdFx0ZGV0YWlsOiAndXBkYXRlIGZhaWxlZCcsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuQ3JlYXRlRGlhbG9nIGNyZWF0ZXMgYW4gYXV0b21hdGlvbiB3aGVuIHRoZSBkaWFsb2cgcmV0dXJucyBhIGNyZWF0ZSByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLnJlc3VsdCA9IHtcblx0XHRcdGtpbmQ6ICdjcmVhdGUnLFxuXHRcdFx0dmFsdWU6IHsgbmFtZTogJ0NyZWF0ZWQnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgb3BlbkNyZWF0ZURpYWxvZyA9IFJlZmxlY3QuZ2V0KHdpZGdldCwgJ29wZW5DcmVhdGVEaWFsb2cnKSBhcyAoKCkgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0Lm9rKG9wZW5DcmVhdGVEaWFsb2cpO1xuXHRcdGF3YWl0IFJlZmxlY3QuYXBwbHkob3BlbkNyZWF0ZURpYWxvZywgd2lkZ2V0LCBbXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lml0ZW1Db3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXS5hdXRvbWF0aW9uLm5hbWUsICdDcmVhdGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5DcmVhdGVEaWFsb2cgc3VyZmFjZXMgY3JlYXRpb24gZXJyb3JzIHdpdGhvdXQgY3Jhc2hpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UsIGRpYWxvZywgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UucmVzdWx0ID0ge1xuXHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHR2YWx1ZTogeyBuYW1lOiAnQ3JlYXRlZCcsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfVxuXHRcdH07XG5cdFx0c2VydmljZS5jcmVhdGVFcnJvciA9IG5ldyBFcnJvcignY3JlYXRlIGZhaWxlZCcpO1xuXG5cdFx0Y29uc3Qgb3BlbkNyZWF0ZURpYWxvZyA9IFJlZmxlY3QuZ2V0KHdpZGdldCwgJ29wZW5DcmVhdGVEaWFsb2cnKSBhcyAoKCkgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0Lm9rKG9wZW5DcmVhdGVEaWFsb2cpO1xuXHRcdGF3YWl0IFJlZmxlY3QuYXBwbHkob3BlbkNyZWF0ZURpYWxvZywgd2lkZ2V0LCBbXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0Lml0ZW1Db3VudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWFsb2cuZXJyb3JzLCBbe1xuXHRcdFx0bWVzc2FnZTogJ0ZhaWxlZCB0byBjcmVhdGUgYXV0b21hdGlvbi4nLFxuXHRcdFx0ZGV0YWlsOiAnY3JlYXRlIGZhaWxlZCcsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBdXRvbWF0aW9uIG9ubHkgZGVsZXRlcyB3aGVuIHRoZSBjb25maXJtYXRpb24gaXMgYWNjZXB0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UsIGRpYWxvZyB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBhID0gYXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0ZGlhbG9nLmNvbmZpcm1SZXN1bHQgPSBmYWxzZTtcblx0XHRhd2FpdCB3aWRnZXQuZGVsZXRlQXV0b21hdGlvbihhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWFsb2cuY29uZmlybWF0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldEF1dG9tYXRpb24oYS5pZCksICdleHBlY3RlZCBhdXRvbWF0aW9uIHRvIHN0aWxsIGV4aXN0IGFmdGVyIGRlY2xpbmVkIGRlbGV0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBdXRvbWF0aW9uIHJlbW92ZXMgdGhlIGF1dG9tYXRpb24gd2hlbiB0aGUgY29uZmlybWF0aW9uIGlzIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBzZXJ2aWNlLCBkaWFsb2cgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGRpYWxvZy5jb25maXJtUmVzdWx0ID0gdHJ1ZTtcblx0XHRhd2FpdCB3aWRnZXQuZGVsZXRlQXV0b21hdGlvbihhKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEF1dG9tYXRpb24oYS5pZCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5pdGVtQ291bnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZ2V0RGlzcGxheUVudHJpZXNGb3JUZXN0KCkubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2VJdGVtQ291bnQgd2hlbiBhdXRvbWF0aW9ucyBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgc2VlbjogbnVtYmVyW10gPSBbXTtcblx0XHR0ZWFyZG93bi5hZGQod2lkZ2V0Lm9uRGlkQ2hhbmdlSXRlbUNvdW50KGMgPT4gc2Vlbi5wdXNoKGMpKSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0InLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlZW4ubGVuZ3RoID49IDIsIGBleHBlY3RlZCBhdCBsZWFzdCAyIGVtaXNzaW9ucywgZ290ICR7c2Vlbi5sZW5ndGh9YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW5bc2Vlbi5sZW5ndGggLSAxXSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVJdGVtQ291bnQgcmVmbGVjdHMgY3VycmVudCBzZXJ2aWNlIHNpemUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uKHsgbmFtZTogJ0EnLCBwcm9tcHQ6ICdwJywgc2NoZWR1bGU6IGhvdXJseSgpLCB0YXJnZXQ6IHdvcmtzcGFjZVRhcmdldCgpIH0pO1xuXG5cdFx0bGV0IGNhcHR1cmVkID0gLTE7XG5cdFx0dGVhcmRvd24uYWRkKHdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjID0+IHsgY2FwdHVyZWQgPSBjOyB9KSk7XG5cdFx0d2lkZ2V0LmZpcmVJdGVtQ291bnQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpc3RvcnkgaXMgY29sbGFwc2VkIGJ5IGRlZmF1bHQgYW5kIHRvZ2dsZUV4cGFuZGVkIGZsaXBzIHRoZSByb3cgZXhwYW5zaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmdldERpc3BsYXlFbnRyaWVzRm9yVGVzdCgpWzBdLmV4cGFuZGVkLCBmYWxzZSk7XG5cblx0XHR3aWRnZXQudG9nZ2xlRXhwYW5kZWQoYS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXS5leHBhbmRlZCwgdHJ1ZSk7XG5cblx0XHQvLyBDb2xsYXBzZSBhZ2Fpbi5cblx0XHR3aWRnZXQudG9nZ2xlRXhwYW5kZWQoYS5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXS5leHBhbmRlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2N1c0F1dG9tYXRpb24gcmV2ZWFscyBhbmQgZXhwYW5kcyB0aGUgcmVxdWVzdGVkIGF1dG9tYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm91bmQ6IHdpZGdldC5mb2N1c0F1dG9tYXRpb24oYXV0b21hdGlvbi5pZCksXG5cdFx0XHRleHBhbmRlZDogd2lkZ2V0LmdldERpc3BsYXlFbnRyaWVzRm9yVGVzdCgpWzBdLmV4cGFuZGVkLFxuXHRcdFx0bWlzc2luZzogd2lkZ2V0LmZvY3VzQXV0b21hdGlvbignbWlzc2luZycpLFxuXHRcdH0sIHtcblx0XHRcdGZvdW5kOiB0cnVlLFxuXHRcdFx0ZXhwYW5kZWQ6IHRydWUsXG5cdFx0XHRtaXNzaW5nOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwYW5kZWQgcm93IGV4cG9zZXMgbm8gcnVucyB3aGVuIHRoZXJlIGFyZSBub25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgd2lkZ2V0LCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGEgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUF1dG9tYXRpb24oeyBuYW1lOiAnQScsIHByb21wdDogJ3AnLCBzY2hlZHVsZTogaG91cmx5KCksIHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCkgfSk7XG5cblx0XHR3aWRnZXQudG9nZ2xlRXhwYW5kZWQoYS5pZCk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuZXhwYW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ydW5zLmxlbmd0aCwgMCwgJ2hpc3RvcnkgZW1wdHktc3RhdGUgaXMgcmVuZGVyZWQgZnJvbSBhbiBlbXB0eSBydW5zIGxpc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwYW5kZWQgcm93IGV4cG9zZXMgcnVucyBuZXdlc3QtZmlyc3Qgd2l0aCBzdGF0dXMgYW5kIGVycm9yIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdC8vIFJlY29yZCB0aHJlZSBydW5zIGluIGRpZmZlcmVudCBzdGF0ZXMuXG5cdFx0Y29uc3QgcjEgPSAoYXdhaXQgc2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnc2NoZWR1bGUnLCAxKSkucnVuO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHIxLmlkLCB7IHN0YXR1czogJ2NvbXBsZXRlZCcsIGNvbXBsZXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSk7XG5cblx0XHRjb25zdCByMiA9IChhd2FpdCBzZXJ2aWNlLnJlY29yZFJ1blN0YXJ0KGEuaWQsICdtYW51YWwnLCAxKSkucnVuO1xuXHRcdGF3YWl0IHNlcnZpY2UudXBkYXRlUnVuKHIyLmlkLCB7IHN0YXR1czogJ2ZhaWxlZCcsIGVycm9yTWVzc2FnZTogJ2Jvb20nLCBjb21wbGV0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pO1xuXG5cdFx0YXdhaXQgc2VydmljZS5yZWNvcmRSdW5TdGFydChhLmlkLCAnY2F0Y2hfdXAnLCAxKTtcblxuXHRcdHdpZGdldC50b2dnbGVFeHBhbmRlZChhLmlkKTtcblxuXHRcdGNvbnN0IHJ1bnMgPSB3aWRnZXQuZ2V0RGlzcGxheUVudHJpZXNGb3JUZXN0KClbMF0ucnVucztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVucy5sZW5ndGgsIDMpO1xuXG5cdFx0Ly8gTmV3ZXN0LWZpcnN0OiBjYXRjaF91cCBwZW5kaW5nLCBtYW51YWwgZmFpbGVkLCBzY2hlZHVsZSBjb21wbGV0ZWQuXG5cdFx0Y29uc3Qgc3RhdHVzZXMgPSBydW5zLm1hcChyID0+IHIuc3RhdHVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXR1c2VzLCBbJ3BlbmRpbmcnLCAnZmFpbGVkJywgJ2NvbXBsZXRlZCddKTtcblxuXHRcdGNvbnN0IHRyaWdnZXJzID0gcnVucy5tYXAociA9PiByLnRyaWdnZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJpZ2dlcnMsIFsnY2F0Y2hfdXAnLCAnbWFudWFsJywgJ3NjaGVkdWxlJ10pO1xuXG5cdFx0Ly8gVGhlIGZhaWxlZCBydW4gc3VyZmFjZXMgdGhlIGVycm9yIG1lc3NhZ2UuXG5cdFx0Y29uc3QgZmFpbGVkID0gcnVucy5maW5kKHIgPT4gci5zdGF0dXMgPT09ICdmYWlsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbGVkPy5lcnJvck1lc3NhZ2UsICdib29tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGFuZGVkIHJvdyByZS1kZXJpdmVzIGl0cyBydW5zIHdoZW4gYSBydW4gaXMgYWRkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyB3aWRnZXQsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgYSA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvbih7IG5hbWU6ICdBJywgcHJvbXB0OiAncCcsIHNjaGVkdWxlOiBob3VybHkoKSwgdGFyZ2V0OiB3b3Jrc3BhY2VUYXJnZXQoKSB9KTtcblxuXHRcdHdpZGdldC50b2dnbGVFeHBhbmRlZChhLmlkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmdldERpc3BsYXlFbnRyaWVzRm9yVGVzdCgpWzBdLnJ1bnMubGVuZ3RoLCAwKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVjb3JkUnVuU3RhcnQoYS5pZCwgJ3NjaGVkdWxlJywgMSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHdpZGdldC5nZXREaXNwbGF5RW50cmllc0ZvclRlc3QoKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuZXhwYW5kZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ydW5zLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQTZDLGdCQUFnQiwwQkFBMEI7QUFDdkYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMs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RyxRQUFRLGdCQUFnQixFQUFFLENBQUM7QUFHbEgsVUFBTSxNQUFNLE1BQU0sUUFBUSxlQUFlLEVBQUUsSUFBSSxZQUFZLENBQUMsR0FBRztBQUMvRCxVQUFNLFFBQVEsVUFBVSxHQUFHLElBQUksRUFBRSxRQUFRLGFBQWEsY0FBYSxvQkFBSSxLQUFLLEdBQUUsWUFBWSxFQUFFLENBQUM7QUFFN0YsVUFBTSxNQUFNLE1BQU0sUUFBUSxlQUFlLEVBQUUsSUFBSSxVQUFVLENBQUMsR0FBRztBQUM3RCxVQUFNLFFBQVEsVUFBVSxHQUFHLElBQUksRUFBRSxRQUFRLFVBQVUsY0FBYyxRQUFRLGNBQWEsb0JBQUksS0FBSyxHQUFFLFlBQVksRUFBRSxDQUFDO0FBRWhILFVBQU0sUUFBUSxlQUFlLEVBQUUsSUFBSSxZQUFZLENBQUM7QUFFaEQsV0FBTyxlQUFlLEVBQUUsRUFBRTtBQUUxQixVQUFNLE9BQU8sT0FBTyx5QkFBeUIsRUFBRSxDQUFDLEVBQUU7QUFDbEQsV0FBTyxZQUFZLEtBQUssUUFBUSxDQUFDO0FBR2pDLFVBQU0sV0FBVyxLQUFLLElBQUksT0FBSyxFQUFFLE1BQU07QUFDdkMsV0FBTyxnQkFBZ0IsVUFBVSxDQUFDLFdBQVcsVUFBVSxXQUFXLENBQUM7QUFFbkUsVUFBTSxXQUFXLEtBQUssSUFBSSxPQUFLLEVBQUUsT0FBTztBQUN4QyxXQUFPLGdCQUFnQixVQUFVLENBQUMsWUFBWSxVQUFVLFVBQVUsQ0FBQztBQUduRSxVQUFNLFNBQVMsS0FBSyxLQUFLLE9BQUssRUFBRSxXQUFXLFFBQVE7QUFDbkQsV0FBTyxZQUFZLFFBQVEsY0FBYyxNQUFNO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssd0RBQXdELFlBQVk7QUFDeEUsVUFBTSxFQUFFLFFBQVEsUUFBUSxJQUFJLE1BQU07QUFDbEMsVUFBTSxJQUFJLE1BQU0sUUFBUSxpQkFBaUIsRUFBRSxNQUFNLEtBQUssUUFBUSxLQUFLLFVBQVUsT0FBTyxHQUFHLFFBQVEsZ0JBQWdCLEVBQUUsQ0FBQztBQUVsSCxXQUFPLGVBQWUsRUFBRSxFQUFFO0FBQzFCLFdBQU8sWUFBWSxPQUFPLHlCQUF5QixFQUFFLENBQUMsRUFBRSxLQUFLLFFBQVEsQ0FBQztBQUV0RSxVQUFNLFFBQVEsZUFBZSxFQUFFLElBQUksWUFBWSxDQUFDO0FBQ2hELFVBQU0sUUFBUSxRQUFRO0FBRXRCLFVBQU0sUUFBUSxPQUFPLHlCQUF5QixFQUFFLENBQUM7QUFDakQsV0FBTyxZQUFZLE1BQU0sVUFBVSxJQUFJO0FBQ3ZDLFdBQU8sWUFBWSxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQUEsRUFDeEMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInJ1biJdCn0K
