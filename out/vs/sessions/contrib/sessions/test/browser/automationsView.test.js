import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { NullHoverService } from "../../../../../platform/hover/test/browser/nullHoverService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IAutomationDialogService } from "../../../../../workbench/contrib/chat/common/automations/automationDialogService.js";
import { IAutomationRunner } from "../../../../../workbench/contrib/chat/common/automations/automationRunner.js";
import { IAutomationService } from "../../../../../workbench/contrib/chat/common/automations/automationService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { buildAutomationsAccessibleContent } from "../../browser/views/automationsAccessibility.js";
import { AutomationsCardsWidget } from "../../browser/views/automationsView.js";
const AUTOMATION_ID = "automation-1";
const RUN_ID = "run-1";
const SESSION_RESOURCE = URI.parse("vscode-chat-session://test/session-1");
const SECOND_SESSION_RESOURCE = URI.parse("vscode-chat-session://test/session-2");
const FOLDER = URI.parse("file:///workspace");
function hourly() {
  return { interval: "hourly", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}
function workspaceTarget() {
  return { kind: "workspace", folderUri: FOLDER, isolation: { kind: "default" } };
}
function automation(overrides = {}) {
  return {
    id: AUTOMATION_ID,
    name: "Daily review",
    prompt: "Review the workspace",
    schedule: hourly(),
    target: workspaceTarget(),
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...overrides
  };
}
function run(overrides = {}) {
  return {
    id: RUN_ID,
    automationId: AUTOMATION_ID,
    status: "completed",
    trigger: "manual",
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    leaderWindowId: 0,
    sessionResource: SESSION_RESOURCE.toString(),
    ...overrides
  };
}
class FakeAutomationService extends mock() {
  constructor() {
    super(...arguments);
    this.automationValue = observableValue(this, []);
    this.runValue = observableValue(this, []);
    this.automations = this.automationValue;
    this.runs = this.runValue;
    this.updateCalls = 0;
  }
  setAutomations(value) {
    this.automationValue.set(value, void 0);
  }
  setRuns(value) {
    this.runValue.set(value, void 0);
  }
  getAutomation(id) {
    return this.automationValue.get().find((item) => item.id === id);
  }
  runsFor(automationId) {
    return constObservable(this.runValue.get().filter((item) => item.automationId === automationId));
  }
  async createAutomation(options, mutationGuard) {
    mutationGuard?.();
    const created = automation({
      id: AUTOMATION_ID,
      name: options.name,
      prompt: options.prompt,
      schedule: options.schedule,
      target: options.target,
      modelId: options.modelId ?? void 0,
      mode: options.mode ?? void 0,
      permissionLevel: options.permissionLevel ?? void 0,
      enabled: options.enabled ?? true
    });
    this.setAutomations([created, ...this.automationValue.get()]);
    return created;
  }
  async updateAutomation(id, patch) {
    const current = this.getAutomation(id);
    if (!current) {
      throw new Error("missing automation");
    }
    const updated = {
      ...current,
      name: patch.name ?? current.name,
      prompt: patch.prompt ?? current.prompt,
      schedule: patch.schedule ?? current.schedule,
      target: patch.target ?? current.target,
      modelId: patch.modelId === void 0 ? current.modelId : patch.modelId ?? void 0,
      mode: patch.mode === void 0 ? current.mode : patch.mode ?? void 0,
      permissionLevel: patch.permissionLevel === void 0 ? current.permissionLevel : patch.permissionLevel ?? void 0,
      enabled: patch.enabled ?? current.enabled,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.setAutomations(this.automationValue.get().map((item) => item.id === id ? updated : item));
    return updated;
  }
  async updateAutomationIfUnchanged(id, patch, _expected, mutationGuard) {
    this.updateCalls++;
    mutationGuard?.();
    return this.updateResult ?? { kind: "updated", automation: await this.updateAutomation(id, patch) };
  }
  async deleteAutomation(id, mutationGuard) {
    mutationGuard?.();
    this.setAutomations(this.automationValue.get().filter((item) => item.id !== id));
  }
  async recordRunStart() {
    return { claimed: true, run: run() };
  }
  async updateRun(_runId, _patch) {
    return void 0;
  }
}
class FakeAutomationDialogService extends mock() {
  async showAutomationDialog(_options) {
    this.beforeReturn?.();
    return this.result;
  }
}
class FakeDialogService extends mock() {
  constructor() {
    super(...arguments);
    this.errors = [];
    this.infos = [];
    this.errorCalled = new DeferredPromise();
    this.infoCalled = new DeferredPromise();
  }
  async error(message, detail) {
    this.errors.push({ message, detail: detail ?? "" });
    this.errorCalled.complete();
  }
  async info(message) {
    this.infos.push(message);
    this.infoCalled.complete();
  }
}
class FakeRunner extends mock() {
  constructor() {
    super(...arguments);
    this.whenDispatched = Promise.resolve({ kind: "notStarted", reason: "targetUnavailable" });
  }
  runOnce(_automation, _trigger, _leaderWindowId, _token) {
    return { whenDispatched: this.whenDispatched, whenCompleted: Promise.resolve() };
  }
}
class FakeSessionsService extends mock() {
  constructor(onOpen) {
    super();
    this.onOpen = onOpen;
    this.openGate = new DeferredPromise();
    this.openCalls = 0;
  }
  async openSession() {
    this.openCalls++;
    await this.openGate.p;
    if (this.error) {
      throw this.error;
    }
    await this.onOpen();
  }
}
class FakeSessionsManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.sessionExists = true;
    this.isRead = observableValue(this, false);
    this.secondIsRead = observableValue(this, false);
    this.session = upcastPartial({
      resource: SESSION_RESOURCE,
      sessionId: "test/session-1",
      isRead: this.isRead
    });
    this.secondSession = upcastPartial({
      resource: SECOND_SESSION_RESOURCE,
      sessionId: "test/session-2",
      isRead: this.secondIsRead
    });
    this.markAllReadCalls = 0;
    this.markAllReadSessionCount = 0;
    this.getSessionCalls = 0;
    this.markAllReadCompleted = new DeferredPromise();
  }
  getSession(resource) {
    this.getSessionCalls++;
    if (!this.sessionExists) {
      return void 0;
    }
    if (resource.toString() === SESSION_RESOURCE.toString()) {
      return this.session;
    }
    if (resource.toString() === SECOND_SESSION_RESOURCE.toString()) {
      return this.secondSession;
    }
    return void 0;
  }
  async markRead(session) {
    if (session === this.session) {
      this.isRead.set(true, void 0);
    } else if (session === this.secondSession) {
      this.secondIsRead.set(true, void 0);
    }
  }
  async markAllRead(sessions) {
    this.markAllReadCalls++;
    this.markAllReadSessionCount = sessions.length;
    for (const session of sessions) {
      await this.markRead(session);
    }
    this.markAllReadCompleted.complete();
  }
  setRead(isRead) {
    this.isRead.set(isRead, void 0);
  }
}
suite("AutomationsCardsWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const automationService = new FakeAutomationService();
    const automationDialogService = new FakeAutomationDialogService();
    const dialogService = new FakeDialogService();
    const runner = new FakeRunner();
    const sessionsManagementService = new FakeSessionsManagementService();
    const sessionsService = new FakeSessionsService(() => sessionsManagementService.markRead(sessionsManagementService.session));
    const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAutomationService, automationService);
    instantiationService.stub(IAutomationDialogService, automationDialogService);
    instantiationService.stub(IDialogService, dialogService);
    instantiationService.stub(IAutomationRunner, runner);
    instantiationService.stub(ISessionsService, sessionsService);
    instantiationService.stub(ISessionsManagementService, sessionsManagementService);
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IHoverService, NullHoverService);
    instantiationService.stub(ILogService, new NullLogService());
    const widget = disposables.add(instantiationService.createInstance(AutomationsCardsWidget));
    document.body.append(widget.element);
    disposables.add(toDisposable(() => widget.element.remove()));
    return { automationService, automationDialogService, configurationService, dialogService, runner, sessionsManagementService, sessionsService, widget };
  }
  test("renders localized schedules and accessible run state", () => {
    const { automationService, widget } = setup();
    const item = automation({ schedule: { interval: "daily", scheduleHour: 13, scheduleMinute: 5, scheduleDay: 0 } });
    const completedRun = run();
    automationService.setAutomations([item]);
    automationService.setRuns([completedRun]);
    const scheduleTime = new Date(Date.UTC(2e3, 0, 1, 13, 5));
    const runTime = new Date(completedRun.startedAt).toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
    assert.deepStrictEqual({
      schedule: widget.element.querySelector(".automations-card-meta-item")?.textContent,
      runLabel: widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label")
    }, {
      schedule: `Daily at ${scheduleTime.toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}`,
      runLabel: `Daily review, workspace, Completed, ${runTime}, Unread`
    });
  });
  test("run changes preserve automation card identity and focus", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    const card = widget.element.querySelector(".automations-card");
    const editButton = widget.element.querySelector(".automations-card-main");
    editButton?.focus();
    automationService.setRuns([run({ status: "running" })]);
    assert.deepStrictEqual({
      sameCard: widget.element.querySelector(".automations-card") === card,
      focusPreserved: document.activeElement === editButton
    }, {
      sameCard: true,
      focusPreserved: true
    });
  });
  test("focus targets the view without selecting an automation card", () => {
    const { automationService, widget } = setup();
    automationService.setAutomations([automation()]);
    widget.focus();
    assert.deepStrictEqual({
      activeElement: document.activeElement,
      cardFocused: widget.element.querySelector(".automations-card-main") === document.activeElement
    }, {
      activeElement: widget.element,
      cardFocused: false
    });
  });
  test("run card opens with Space and becomes read only after open succeeds", async () => {
    const { automationService, sessionsManagementService, sessionsService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    const card = widget.element.querySelector(".automations-run-card");
    card?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.deepStrictEqual({
      openCalls: sessionsService.openCalls,
      readBeforeOpen: sessionsManagementService.isRead.get()
    }, {
      openCalls: 1,
      readBeforeOpen: false
    });
    sessionsService.openGate.complete();
    await sessionsService.openGate.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      label: widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label")
    }, {
      isRead: true,
      label: card?.getAttribute("aria-label")?.replace(", Unread", "")
    });
  });
  test("run remains unread when opening its session fails", async () => {
    const { automationService, dialogService, sessionsManagementService, sessionsService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    sessionsService.error = new Error("open failed");
    const unreadLabel = widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label");
    widget.element.querySelector(".automations-run-card")?.click();
    sessionsService.openGate.complete();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      label: widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label"),
      error: dialogService.errors
    }, {
      isRead: false,
      label: unreadLabel,
      error: [{ message: "Failed to open automation run.", detail: "open failed" }]
    });
  });
  test("session read state reactively updates run history", () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run()]);
    const unreadLabel = widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label");
    sessionsManagementService.setRead(true);
    const readLabel = widget.element.querySelector(".automations-run-card")?.getAttribute("aria-label");
    assert.deepStrictEqual({
      unreadLabel,
      readLabel,
      markAllVisible: !!widget.element.querySelector(".automations-mark-all-read")
    }, {
      unreadLabel: readLabel ? `${readLabel}, Unread` : void 0,
      readLabel,
      markAllVisible: false
    });
  });
  test("mark all as read delegates to session management", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([run(), run({ id: "run-2" })]);
    widget.element.querySelector(".automations-mark-all-read")?.click();
    await sessionsManagementService.markAllReadCompleted.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      isRead: sessionsManagementService.isRead.get(),
      markAllReadCalls: sessionsManagementService.markAllReadCalls,
      markAllReadSessionCount: sessionsManagementService.markAllReadSessionCount,
      markAllVisible: !!widget.element.querySelector(".automations-mark-all-read")
    }, {
      isRead: true,
      markAllReadCalls: 1,
      markAllReadSessionCount: 1,
      markAllVisible: false
    });
  });
  test("mark all as read coalesces history rendering", async () => {
    const { automationService, sessionsManagementService, widget } = setup();
    automationService.setAutomations([automation()]);
    automationService.setRuns([
      run(),
      run({ id: "run-2", sessionResource: SECOND_SESSION_RESOURCE.toString() })
    ]);
    widget.element.querySelector(".automations-mark-all-read")?.click();
    await sessionsManagementService.markAllReadCompleted.p;
    await Promise.resolve();
    assert.deepStrictEqual({
      getSessionCalls: sessionsManagementService.getSessionCalls,
      firstIsRead: sessionsManagementService.isRead.get(),
      secondIsRead: sessionsManagementService.secondIsRead.get()
    }, {
      getSessionCalls: 6,
      firstIsRead: true,
      secondIsRead: true
    });
  });
  test("stale run sessions are not exposed as buttons", () => {
    const { automationService, sessionsManagementService, widget } = setup();
    sessionsManagementService.sessionExists = false;
    const staleRun = run();
    automationService.setAutomations([automation()]);
    automationService.setRuns([staleRun]);
    const card = widget.element.querySelector(".automations-run-card");
    const runTime = new Date(staleRun.startedAt).toLocaleTimeString(void 0, { hour: "numeric", minute: "2-digit" });
    assert.deepStrictEqual({
      role: card?.getAttribute("role"),
      tabIndex: card?.getAttribute("tabindex"),
      label: card?.getAttribute("aria-label")
    }, {
      role: "group",
      tabIndex: null,
      label: `Daily review, workspace, Completed, ${runTime}`
    });
  });
  test("edit conflict is reported to the user", async () => {
    const { automationDialogService, automationService, dialogService, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    automationService.updateResult = { kind: "conflict", current: automation({ name: "Changed elsewhere" }) };
    automationDialogService.result = { kind: "update", id: item.id, value: { name: "Edited" } };
    widget.element.querySelector(".automations-card-main")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual(dialogService.errors, [{
      message: "Failed to update automation.",
      detail: "This automation changed while the dialog was open. Reopen it to review the latest values."
    }]);
  });
  test("run failures are reported to the user", async () => {
    const { automationService, dialogService, runner, widget } = setup();
    automationService.setAutomations([automation()]);
    runner.whenDispatched = Promise.reject(new Error("runner failed"));
    widget.element.querySelector(".automations-card-action-button")?.click();
    await dialogService.errorCalled.p;
    assert.deepStrictEqual(dialogService.errors, [{
      message: "Failed to run automation.",
      detail: "runner failed"
    }]);
  });
  test("disabling automations while the dialog is open prevents the update", async () => {
    const { automationDialogService, automationService, configurationService, dialogService, widget } = setup();
    const item = automation();
    automationService.setAutomations([item]);
    automationDialogService.result = { kind: "update", id: item.id, value: { name: "Edited" } };
    automationDialogService.beforeReturn = () => configurationService.setUserConfiguration("chat.automations.enabled", false);
    widget.element.querySelector(".automations-card-main")?.click();
    await dialogService.infoCalled.p;
    assert.deepStrictEqual({
      info: dialogService.infos,
      updateCalls: automationService.updateCalls
    }, {
      info: ["Automations are disabled."],
      updateCalls: 0
    });
  });
  test("accessible view includes automation and run content", () => {
    assert.strictEqual(
      buildAutomationsAccessibleContent([automation()], [run({ status: "failed", errorMessage: "boom" })]).includes("Daily review, Failed"),
      true
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25zVmlldy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2ssIHVwY2FzdFBhcnRpYWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IE51bGxIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci90ZXN0L2Jyb3dzZXIvbnVsbEhvdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbiwgSUF1dG9tYXRpb25SdW4sIElBdXRvbWF0aW9uU2NoZWR1bGUsIEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBBdXRvbWF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCwgSUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBJU2hvd0F1dG9tYXRpb25EaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5EaXNwYXRjaCwgSUF1dG9tYXRpb25SdW5uZXIsIElBdXRvbWF0aW9uUnVuT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvblJ1bm5lci5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uTXV0YXRpb25HdWFyZCwgSUF1dG9tYXRpb25SdW5DbGFpbSwgSUF1dG9tYXRpb25TZXJ2aWNlLCBJQ3JlYXRlQXV0b21hdGlvbk9wdGlvbnMsIElHdWFyZGVkQXV0b21hdGlvblVwZGF0ZVJlc3VsdCwgSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zLCBJVXBkYXRlQXV0b21hdGlvblJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYnVpbGRBdXRvbWF0aW9uc0FjY2Vzc2libGVDb250ZW50IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3cy9hdXRvbWF0aW9uc0FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNDYXJkc1dpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld3MvYXV0b21hdGlvbnNWaWV3LmpzJztcblxuY29uc3QgQVVUT01BVElPTl9JRCA9ICdhdXRvbWF0aW9uLTEnO1xuY29uc3QgUlVOX0lEID0gJ3J1bi0xJztcbmNvbnN0IFNFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24tMScpO1xuY29uc3QgU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24tMicpO1xuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuXG5mdW5jdGlvbiBob3VybHkoKTogSUF1dG9tYXRpb25TY2hlZHVsZSB7XG5cdHJldHVybiB7IGludGVydmFsOiAnaG91cmx5Jywgc2NoZWR1bGVIb3VyOiAwLCBzY2hlZHVsZU1pbnV0ZTogMCwgc2NoZWR1bGVEYXk6IDAgfTtcbn1cblxuZnVuY3Rpb24gd29ya3NwYWNlVGFyZ2V0KCk6IEF1dG9tYXRpb25UYXJnZXQge1xuXHRyZXR1cm4geyBraW5kOiAnd29ya3NwYWNlJywgZm9sZGVyVXJpOiBGT0xERVIsIGlzb2xhdGlvbjogeyBraW5kOiAnZGVmYXVsdCcgfSB9O1xufVxuXG5mdW5jdGlvbiBhdXRvbWF0aW9uKG92ZXJyaWRlczogUGFydGlhbDxJQXV0b21hdGlvbj4gPSB7fSk6IElBdXRvbWF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHRpZDogQVVUT01BVElPTl9JRCxcblx0XHRuYW1lOiAnRGFpbHkgcmV2aWV3Jyxcblx0XHRwcm9tcHQ6ICdSZXZpZXcgdGhlIHdvcmtzcGFjZScsXG5cdFx0c2NoZWR1bGU6IGhvdXJseSgpLFxuXHRcdHRhcmdldDogd29ya3NwYWNlVGFyZ2V0KCksXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHJ1bihvdmVycmlkZXM6IFBhcnRpYWw8SUF1dG9tYXRpb25SdW4+ID0ge30pOiBJQXV0b21hdGlvblJ1biB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IFJVTl9JRCxcblx0XHRhdXRvbWF0aW9uSWQ6IEFVVE9NQVRJT05fSUQsXG5cdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHR0cmlnZ2VyOiAnbWFudWFsJyxcblx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRsZWFkZXJXaW5kb3dJZDogMCxcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmNsYXNzIEZha2VBdXRvbWF0aW9uU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25TZXJ2aWNlPigpIHtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvbWF0aW9uVmFsdWUgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25bXT4odGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJ1blZhbHVlID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+KHRoaXMsIFtdKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYXV0b21hdGlvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uW10+ID0gdGhpcy5hdXRvbWF0aW9uVmFsdWU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHJ1bnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+ID0gdGhpcy5ydW5WYWx1ZTtcblx0dXBkYXRlUmVzdWx0OiBJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHVwZGF0ZUNhbGxzID0gMDtcblxuXHRzZXRBdXRvbWF0aW9ucyh2YWx1ZTogcmVhZG9ubHkgSUF1dG9tYXRpb25bXSk6IHZvaWQge1xuXHRcdHRoaXMuYXV0b21hdGlvblZhbHVlLnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFJ1bnModmFsdWU6IHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10pOiB2b2lkIHtcblx0XHR0aGlzLnJ1blZhbHVlLnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEF1dG9tYXRpb24oaWQ6IHN0cmluZyk6IElBdXRvbWF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5hdXRvbWF0aW9uVmFsdWUuZ2V0KCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bnNGb3IoYXV0b21hdGlvbklkOiBzdHJpbmcpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQXV0b21hdGlvblJ1bltdPiB7XG5cdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh0aGlzLnJ1blZhbHVlLmdldCgpLmZpbHRlcihpdGVtID0+IGl0ZW0uYXV0b21hdGlvbklkID09PSBhdXRvbWF0aW9uSWQpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBtdXRhdGlvbkd1YXJkPzogQXV0b21hdGlvbk11dGF0aW9uR3VhcmQpOiBQcm9taXNlPElBdXRvbWF0aW9uPiB7XG5cdFx0bXV0YXRpb25HdWFyZD8uKCk7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGF1dG9tYXRpb24oe1xuXHRcdFx0aWQ6IEFVVE9NQVRJT05fSUQsXG5cdFx0XHRuYW1lOiBvcHRpb25zLm5hbWUsXG5cdFx0XHRwcm9tcHQ6IG9wdGlvbnMucHJvbXB0LFxuXHRcdFx0c2NoZWR1bGU6IG9wdGlvbnMuc2NoZWR1bGUsXG5cdFx0XHR0YXJnZXQ6IG9wdGlvbnMudGFyZ2V0LFxuXHRcdFx0bW9kZWxJZDogb3B0aW9ucy5tb2RlbElkID8/IHVuZGVmaW5lZCxcblx0XHRcdG1vZGU6IG9wdGlvbnMubW9kZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IG9wdGlvbnMucGVybWlzc2lvbkxldmVsID8/IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IG9wdGlvbnMuZW5hYmxlZCA/PyB0cnVlLFxuXHRcdH0pO1xuXHRcdHRoaXMuc2V0QXV0b21hdGlvbnMoW2NyZWF0ZWQsIC4uLnRoaXMuYXV0b21hdGlvblZhbHVlLmdldCgpXSk7XG5cdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uPiB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0QXV0b21hdGlvbihpZCk7XG5cdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgYXV0b21hdGlvbicpO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkOiBJQXV0b21hdGlvbiA9IHtcblx0XHRcdC4uLmN1cnJlbnQsXG5cdFx0XHRuYW1lOiBwYXRjaC5uYW1lID8/IGN1cnJlbnQubmFtZSxcblx0XHRcdHByb21wdDogcGF0Y2gucHJvbXB0ID8/IGN1cnJlbnQucHJvbXB0LFxuXHRcdFx0c2NoZWR1bGU6IHBhdGNoLnNjaGVkdWxlID8/IGN1cnJlbnQuc2NoZWR1bGUsXG5cdFx0XHR0YXJnZXQ6IHBhdGNoLnRhcmdldCA/PyBjdXJyZW50LnRhcmdldCxcblx0XHRcdG1vZGVsSWQ6IHBhdGNoLm1vZGVsSWQgPT09IHVuZGVmaW5lZCA/IGN1cnJlbnQubW9kZWxJZCA6IHBhdGNoLm1vZGVsSWQgPz8gdW5kZWZpbmVkLFxuXHRcdFx0bW9kZTogcGF0Y2gubW9kZSA9PT0gdW5kZWZpbmVkID8gY3VycmVudC5tb2RlIDogcGF0Y2gubW9kZSA/PyB1bmRlZmluZWQsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA9PT0gdW5kZWZpbmVkID8gY3VycmVudC5wZXJtaXNzaW9uTGV2ZWwgOiBwYXRjaC5wZXJtaXNzaW9uTGV2ZWwgPz8gdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogcGF0Y2guZW5hYmxlZCA/PyBjdXJyZW50LmVuYWJsZWQsXG5cdFx0XHR1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHRcdHRoaXMuc2V0QXV0b21hdGlvbnModGhpcy5hdXRvbWF0aW9uVmFsdWUuZ2V0KCkubWFwKGl0ZW0gPT4gaXRlbS5pZCA9PT0gaWQgPyB1cGRhdGVkIDogaXRlbSkpO1xuXHRcdHJldHVybiB1cGRhdGVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIF9leHBlY3RlZDogSUF1dG9tYXRpb24sIG11dGF0aW9uR3VhcmQ/OiBBdXRvbWF0aW9uTXV0YXRpb25HdWFyZCk6IFByb21pc2U8SUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0PiB7XG5cdFx0dGhpcy51cGRhdGVDYWxscysrO1xuXHRcdG11dGF0aW9uR3VhcmQ/LigpO1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVJlc3VsdCA/PyB7IGtpbmQ6ICd1cGRhdGVkJywgYXV0b21hdGlvbjogYXdhaXQgdGhpcy51cGRhdGVBdXRvbWF0aW9uKGlkLCBwYXRjaCkgfTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZUF1dG9tYXRpb24oaWQ6IHN0cmluZywgbXV0YXRpb25HdWFyZD86IEF1dG9tYXRpb25NdXRhdGlvbkd1YXJkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bXV0YXRpb25HdWFyZD8uKCk7XG5cdFx0dGhpcy5zZXRBdXRvbWF0aW9ucyh0aGlzLmF1dG9tYXRpb25WYWx1ZS5nZXQoKS5maWx0ZXIoaXRlbSA9PiBpdGVtLmlkICE9PSBpZCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVjb3JkUnVuU3RhcnQoKTogUHJvbWlzZTxJQXV0b21hdGlvblJ1bkNsYWltPiB7XG5cdFx0cmV0dXJuIHsgY2xhaW1lZDogdHJ1ZSwgcnVuOiBydW4oKSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlUnVuKF9ydW5JZDogc3RyaW5nLCBfcGF0Y2g6IElVcGRhdGVBdXRvbWF0aW9uUnVuT3B0aW9ucyk6IFByb21pc2U8SUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIEZha2VBdXRvbWF0aW9uRGlhbG9nU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlPigpIHtcblx0cmVzdWx0OiBJQXV0b21hdGlvbkRpYWxvZ1Jlc3VsdCB8IHVuZGVmaW5lZDtcblx0YmVmb3JlUmV0dXJuOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvd0F1dG9tYXRpb25EaWFsb2coX29wdGlvbnM6IElTaG93QXV0b21hdGlvbkRpYWxvZ09wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uRGlhbG9nUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5iZWZvcmVSZXR1cm4/LigpO1xuXHRcdHJldHVybiB0aGlzLnJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBGYWtlRGlhbG9nU2VydmljZSBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkge1xuXHRyZWFkb25seSBlcnJvcnM6IHsgbWVzc2FnZTogc3RyaW5nOyBkZXRhaWw6IHN0cmluZyB9W10gPSBbXTtcblx0cmVhZG9ubHkgaW5mb3M6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGVycm9yQ2FsbGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSBpbmZvQ2FsbGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGVycm9yKG1lc3NhZ2U6IHN0cmluZywgZGV0YWlsPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5lcnJvcnMucHVzaCh7IG1lc3NhZ2UsIGRldGFpbDogZGV0YWlsID8/ICcnIH0pO1xuXHRcdHRoaXMuZXJyb3JDYWxsZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGluZm8obWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5pbmZvcy5wdXNoKG1lc3NhZ2UpO1xuXHRcdHRoaXMuaW5mb0NhbGxlZC5jb21wbGV0ZSgpO1xuXHR9XG59XG5cbmNsYXNzIEZha2VSdW5uZXIgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uUnVubmVyPigpIHtcblx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2U8SUF1dG9tYXRpb25SdW5EaXNwYXRjaD4gPSBQcm9taXNlLnJlc29sdmUoeyBraW5kOiAnbm90U3RhcnRlZCcsIHJlYXNvbjogJ3RhcmdldFVuYXZhaWxhYmxlJyB9KTtcblxuXHRvdmVycmlkZSBydW5PbmNlKF9hdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgX3RyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyLCBfbGVhZGVyV2luZG93SWQ6IG51bWJlciwgX3Rva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBJQXV0b21hdGlvblJ1bk9wZXJhdGlvbiB7XG5cdFx0cmV0dXJuIHsgd2hlbkRpc3BhdGNoZWQ6IHRoaXMud2hlbkRpc3BhdGNoZWQsIHdoZW5Db21wbGV0ZWQ6IFByb21pc2UucmVzb2x2ZSgpIH07XG5cdH1cbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zU2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdHJlYWRvbmx5IG9wZW5HYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRvcGVuQ2FsbHMgPSAwO1xuXHRlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvbk9wZW46ICgpID0+IFByb21pc2U8dm9pZD4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgb3BlblNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5vcGVuQ2FsbHMrKztcblx0XHRhd2FpdCB0aGlzLm9wZW5HYXRlLnA7XG5cdFx0aWYgKHRoaXMuZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuZXJyb3I7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMub25PcGVuKCk7XG5cdH1cbn1cblxuY2xhc3MgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0c2Vzc2lvbkV4aXN0cyA9IHRydWU7XG5cdHJlYWRvbmx5IGlzUmVhZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IHNlY29uZElzUmVhZCA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPih0aGlzLCBmYWxzZSk7XG5cdHJlYWRvbmx5IHNlc3Npb24gPSB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0cmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0c2Vzc2lvbklkOiAndGVzdC9zZXNzaW9uLTEnLFxuXHRcdGlzUmVhZDogdGhpcy5pc1JlYWQsXG5cdH0pO1xuXHRyZWFkb25seSBzZWNvbmRTZXNzaW9uID0gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbj4oe1xuXHRcdHJlc291cmNlOiBTRUNPTkRfU0VTU0lPTl9SRVNPVVJDRSxcblx0XHRzZXNzaW9uSWQ6ICd0ZXN0L3Nlc3Npb24tMicsXG5cdFx0aXNSZWFkOiB0aGlzLnNlY29uZElzUmVhZCxcblx0fSk7XG5cdG1hcmtBbGxSZWFkQ2FsbHMgPSAwO1xuXHRtYXJrQWxsUmVhZFNlc3Npb25Db3VudCA9IDA7XG5cdGdldFNlc3Npb25DYWxscyA9IDA7XG5cdHJlYWRvbmx5IG1hcmtBbGxSZWFkQ29tcGxldGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLmdldFNlc3Npb25DYWxscysrO1xuXHRcdGlmICghdGhpcy5zZXNzaW9uRXhpc3RzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gU0VDT05EX1NFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2Vjb25kU2Vzc2lvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG1hcmtSZWFkKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb24gPT09IHRoaXMuc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5pc1JlYWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIGlmIChzZXNzaW9uID09PSB0aGlzLnNlY29uZFNlc3Npb24pIHtcblx0XHRcdHRoaXMuc2Vjb25kSXNSZWFkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIG1hcmtBbGxSZWFkKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tYXJrQWxsUmVhZENhbGxzKys7XG5cdFx0dGhpcy5tYXJrQWxsUmVhZFNlc3Npb25Db3VudCA9IHNlc3Npb25zLmxlbmd0aDtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGF3YWl0IHRoaXMubWFya1JlYWQoc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMubWFya0FsbFJlYWRDb21wbGV0ZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdHNldFJlYWQoaXNSZWFkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pc1JlYWQuc2V0KGlzUmVhZCwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5zdWl0ZSgnQXV0b21hdGlvbnNDYXJkc1dpZGdldCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cCgpIHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gbmV3IEZha2VEaWFsb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IEZha2VSdW5uZXIoKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IEZha2VTZXNzaW9uc1NlcnZpY2UoKCkgPT4gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrUmVhZChzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb24pKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBjaGF0OiB7IGF1dG9tYXRpb25zOiB7IGVuYWJsZWQ6IHRydWUgfSB9IH0pO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQXV0b21hdGlvblNlcnZpY2UsIGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSwgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIGRpYWxvZ1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dG9tYXRpb25SdW5uZXIsIHJ1bm5lcik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJSG92ZXJTZXJ2aWNlLCBOdWxsSG92ZXJTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1dG9tYXRpb25zQ2FyZHNXaWRnZXQpKTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB3aWRnZXQuZWxlbWVudC5yZW1vdmUoKSkpO1xuXHRcdHJldHVybiB7IGF1dG9tYXRpb25TZXJ2aWNlLCBhdXRvbWF0aW9uRGlhbG9nU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGRpYWxvZ1NlcnZpY2UsIHJ1bm5lciwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCB3aWRnZXQgfTtcblx0fVxuXG5cdHRlc3QoJ3JlbmRlcnMgbG9jYWxpemVkIHNjaGVkdWxlcyBhbmQgYWNjZXNzaWJsZSBydW4gc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGl0ZW0gPSBhdXRvbWF0aW9uKHsgc2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogMTMsIHNjaGVkdWxlTWludXRlOiA1LCBzY2hlZHVsZURheTogMCB9IH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlZFJ1biA9IHJ1bigpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFtpdGVtXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbY29tcGxldGVkUnVuXSk7XG5cdFx0Y29uc3Qgc2NoZWR1bGVUaW1lID0gbmV3IERhdGUoRGF0ZS5VVEMoMjAwMCwgMCwgMSwgMTMsIDUpKTtcblx0XHRjb25zdCBydW5UaW1lID0gbmV3IERhdGUoY29tcGxldGVkUnVuLnN0YXJ0ZWRBdCkudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzY2hlZHVsZTogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLWNhcmQtbWV0YS1pdGVtJyk/LnRleHRDb250ZW50LFxuXHRcdFx0cnVuTGFiZWw6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1ydW4tY2FyZCcpPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKSxcblx0XHR9LCB7XG5cdFx0XHRzY2hlZHVsZTogYERhaWx5IGF0ICR7c2NoZWR1bGVUaW1lLnRvTG9jYWxlVGltZVN0cmluZyh1bmRlZmluZWQsIHsgaG91cjogJ251bWVyaWMnLCBtaW51dGU6ICcyLWRpZ2l0JywgdGltZVpvbmU6ICdVVEMnIH0pfWAsXG5cdFx0XHRydW5MYWJlbDogYERhaWx5IHJldmlldywgd29ya3NwYWNlLCBDb21wbGV0ZWQsICR7cnVuVGltZX0sIFVucmVhZGAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1biBjaGFuZ2VzIHByZXNlcnZlIGF1dG9tYXRpb24gY2FyZCBpZGVudGl0eSBhbmQgZm9jdXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRjb25zdCBjYXJkID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLWNhcmQnKTtcblx0XHRjb25zdCBlZGl0QnV0dG9uID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1jYXJkLW1haW4nKTtcblx0XHRlZGl0QnV0dG9uPy5mb2N1cygpO1xuXG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKHsgc3RhdHVzOiAncnVubmluZycgfSldKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2FtZUNhcmQ6IHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1jYXJkJykgPT09IGNhcmQsXG5cdFx0XHRmb2N1c1ByZXNlcnZlZDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWRpdEJ1dHRvbixcblx0XHR9LCB7XG5cdFx0XHRzYW1lQ2FyZDogdHJ1ZSxcblx0XHRcdGZvY3VzUHJlc2VydmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2N1cyB0YXJnZXRzIHRoZSB2aWV3IHdpdGhvdXQgc2VsZWN0aW5nIGFuIGF1dG9tYXRpb24gY2FyZCcsICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXG5cdFx0d2lkZ2V0LmZvY3VzKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQ6IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQsXG5cdFx0XHRjYXJkRm9jdXNlZDogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLWNhcmQtbWFpbicpID09PSBkb2N1bWVudC5hY3RpdmVFbGVtZW50LFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQ6IHdpZGdldC5lbGVtZW50LFxuXHRcdFx0Y2FyZEZvY3VzZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW4gY2FyZCBvcGVucyB3aXRoIFNwYWNlIGFuZCBiZWNvbWVzIHJlYWQgb25seSBhZnRlciBvcGVuIHN1Y2NlZWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtydW4oKV0pO1xuXHRcdGNvbnN0IGNhcmQgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLXJ1bi1jYXJkJyk7XG5cblx0XHRjYXJkPy5kaXNwYXRjaEV2ZW50KG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICcgJywgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuQ2FsbHM6IHNlc3Npb25zU2VydmljZS5vcGVuQ2FsbHMsXG5cdFx0XHRyZWFkQmVmb3JlT3Blbjogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5pc1JlYWQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0b3BlbkNhbGxzOiAxLFxuXHRcdFx0cmVhZEJlZm9yZU9wZW46IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLm9wZW5HYXRlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgc2Vzc2lvbnNTZXJ2aWNlLm9wZW5HYXRlLnA7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzUmVhZDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5pc1JlYWQuZ2V0KCksXG5cdFx0XHRsYWJlbDogd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1jYXJkJyk/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdH0sIHtcblx0XHRcdGlzUmVhZDogdHJ1ZSxcblx0XHRcdGxhYmVsOiBjYXJkPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKT8ucmVwbGFjZSgnLCBVbnJlYWQnLCAnJyksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1biByZW1haW5zIHVucmVhZCB3aGVuIG9wZW5pbmcgaXRzIHNlc3Npb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW3J1bigpXSk7XG5cdFx0c2Vzc2lvbnNTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCdvcGVuIGZhaWxlZCcpO1xuXHRcdGNvbnN0IHVucmVhZExhYmVsID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1jYXJkJyk/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MRGl2RWxlbWVudD4oJy5hdXRvbWF0aW9ucy1ydW4tY2FyZCcpPy5jbGljaygpO1xuXHRcdHNlc3Npb25zU2VydmljZS5vcGVuR2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuZXJyb3JDYWxsZWQucDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNSZWFkOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmlzUmVhZC5nZXQoKSxcblx0XHRcdGxhYmVsOiB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtcnVuLWNhcmQnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRlcnJvcjogZGlhbG9nU2VydmljZS5lcnJvcnMsXG5cdFx0fSwge1xuXHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHRcdGxhYmVsOiB1bnJlYWRMYWJlbCxcblx0XHRcdGVycm9yOiBbeyBtZXNzYWdlOiAnRmFpbGVkIHRvIG9wZW4gYXV0b21hdGlvbiBydW4uJywgZGV0YWlsOiAnb3BlbiBmYWlsZWQnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIHJlYWQgc3RhdGUgcmVhY3RpdmVseSB1cGRhdGVzIHJ1biBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKCldKTtcblxuXHRcdGNvbnN0IHVucmVhZExhYmVsID0gd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLXJ1bi1jYXJkJyk/LmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uuc2V0UmVhZCh0cnVlKTtcblx0XHRjb25zdCByZWFkTGFiZWwgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcuYXV0b21hdGlvbnMtcnVuLWNhcmQnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHVucmVhZExhYmVsLFxuXHRcdFx0cmVhZExhYmVsLFxuXHRcdFx0bWFya0FsbFZpc2libGU6ICEhd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignLmF1dG9tYXRpb25zLW1hcmstYWxsLXJlYWQnKSxcblx0XHR9LCB7XG5cdFx0XHR1bnJlYWRMYWJlbDogcmVhZExhYmVsID8gYCR7cmVhZExhYmVsfSwgVW5yZWFkYCA6IHVuZGVmaW5lZCxcblx0XHRcdHJlYWRMYWJlbCxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFyayBhbGwgYXMgcmVhZCBkZWxlZ2F0ZXMgdG8gc2Vzc2lvbiBtYW5hZ2VtZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRBdXRvbWF0aW9ucyhbYXV0b21hdGlvbigpXSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0UnVucyhbcnVuKCksIHJ1bih7IGlkOiAncnVuLTInIH0pXSk7XG5cblx0XHR3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmF1dG9tYXRpb25zLW1hcmstYWxsLXJlYWQnKT8uY2xpY2soKTtcblx0XHRhd2FpdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkQ29tcGxldGVkLnA7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzUmVhZDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5pc1JlYWQuZ2V0KCksXG5cdFx0XHRtYXJrQWxsUmVhZENhbGxzOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLm1hcmtBbGxSZWFkQ2FsbHMsXG5cdFx0XHRtYXJrQWxsUmVhZFNlc3Npb25Db3VudDogc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZFNlc3Npb25Db3VudCxcblx0XHRcdG1hcmtBbGxWaXNpYmxlOiAhIXdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5hdXRvbWF0aW9ucy1tYXJrLWFsbC1yZWFkJyksXG5cdFx0fSwge1xuXHRcdFx0aXNSZWFkOiB0cnVlLFxuXHRcdFx0bWFya0FsbFJlYWRDYWxsczogMSxcblx0XHRcdG1hcmtBbGxSZWFkU2Vzc2lvbkNvdW50OiAxLFxuXHRcdFx0bWFya0FsbFZpc2libGU6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrIGFsbCBhcyByZWFkIGNvYWxlc2NlcyBoaXN0b3J5IHJlbmRlcmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldFJ1bnMoW1xuXHRcdFx0cnVuKCksXG5cdFx0XHRydW4oeyBpZDogJ3J1bi0yJywgc2Vzc2lvblJlc291cmNlOiBTRUNPTkRfU0VTU0lPTl9SRVNPVVJDRS50b1N0cmluZygpIH0pLFxuXHRcdF0pO1xuXG5cdFx0d2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvcjxIVE1MQnV0dG9uRWxlbWVudD4oJy5hdXRvbWF0aW9ucy1tYXJrLWFsbC1yZWFkJyk/LmNsaWNrKCk7XG5cdFx0YXdhaXQgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5tYXJrQWxsUmVhZENvbXBsZXRlZC5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRnZXRTZXNzaW9uQ2FsbHM6IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbkNhbGxzLFxuXHRcdFx0Zmlyc3RJc1JlYWQ6IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuaXNSZWFkLmdldCgpLFxuXHRcdFx0c2Vjb25kSXNSZWFkOiBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlY29uZElzUmVhZC5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRnZXRTZXNzaW9uQ2FsbHM6IDYsXG5cdFx0XHRmaXJzdElzUmVhZDogdHJ1ZSxcblx0XHRcdHNlY29uZElzUmVhZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbGUgcnVuIHNlc3Npb25zIGFyZSBub3QgZXhwb3NlZCBhcyBidXR0b25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvblNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHdpZGdldCB9ID0gc2V0dXAoKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25FeGlzdHMgPSBmYWxzZTtcblx0XHRjb25zdCBzdGFsZVJ1biA9IHJ1bigpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLnNldEF1dG9tYXRpb25zKFthdXRvbWF0aW9uKCldKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5zZXRSdW5zKFtzdGFsZVJ1bl0pO1xuXHRcdGNvbnN0IGNhcmQgPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmF1dG9tYXRpb25zLXJ1bi1jYXJkJyk7XG5cdFx0Y29uc3QgcnVuVGltZSA9IG5ldyBEYXRlKHN0YWxlUnVuLnN0YXJ0ZWRBdCkudG9Mb2NhbGVUaW1lU3RyaW5nKHVuZGVmaW5lZCwgeyBob3VyOiAnbnVtZXJpYycsIG1pbnV0ZTogJzItZGlnaXQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyb2xlOiBjYXJkPy5nZXRBdHRyaWJ1dGUoJ3JvbGUnKSxcblx0XHRcdHRhYkluZGV4OiBjYXJkPy5nZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JyksXG5cdFx0XHRsYWJlbDogY2FyZD8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0fSwge1xuXHRcdFx0cm9sZTogJ2dyb3VwJyxcblx0XHRcdHRhYkluZGV4OiBudWxsLFxuXHRcdFx0bGFiZWw6IGBEYWlseSByZXZpZXcsIHdvcmtzcGFjZSwgQ29tcGxldGVkLCAke3J1blRpbWV9YCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZWRpdCBjb25mbGljdCBpcyByZXBvcnRlZCB0byB0aGUgdXNlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLCBhdXRvbWF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGl0ZW0gPSBhdXRvbWF0aW9uKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2l0ZW1dKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS51cGRhdGVSZXN1bHQgPSB7IGtpbmQ6ICdjb25mbGljdCcsIGN1cnJlbnQ6IGF1dG9tYXRpb24oeyBuYW1lOiAnQ2hhbmdlZCBlbHNld2hlcmUnIH0pIH07XG5cdFx0YXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UucmVzdWx0ID0geyBraW5kOiAndXBkYXRlJywgaWQ6IGl0ZW0uaWQsIHZhbHVlOiB7IG5hbWU6ICdFZGl0ZWQnIH0gfTtcblxuXHRcdHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1tYWluJyk/LmNsaWNrKCk7XG5cdFx0YXdhaXQgZGlhbG9nU2VydmljZS5lcnJvckNhbGxlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWFsb2dTZXJ2aWNlLmVycm9ycywgW3tcblx0XHRcdG1lc3NhZ2U6ICdGYWlsZWQgdG8gdXBkYXRlIGF1dG9tYXRpb24uJyxcblx0XHRcdGRldGFpbDogJ1RoaXMgYXV0b21hdGlvbiBjaGFuZ2VkIHdoaWxlIHRoZSBkaWFsb2cgd2FzIG9wZW4uIFJlb3BlbiBpdCB0byByZXZpZXcgdGhlIGxhdGVzdCB2YWx1ZXMuJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1biBmYWlsdXJlcyBhcmUgcmVwb3J0ZWQgdG8gdGhlIHVzZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBhdXRvbWF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgcnVubmVyLCB3aWRnZXQgfSA9IHNldHVwKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2F1dG9tYXRpb24oKV0pO1xuXHRcdHJ1bm5lci53aGVuRGlzcGF0Y2hlZCA9IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcigncnVubmVyIGZhaWxlZCcpKTtcblxuXHRcdHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcuYXV0b21hdGlvbnMtY2FyZC1hY3Rpb24tYnV0dG9uJyk/LmNsaWNrKCk7XG5cdFx0YXdhaXQgZGlhbG9nU2VydmljZS5lcnJvckNhbGxlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWFsb2dTZXJ2aWNlLmVycm9ycywgW3tcblx0XHRcdG1lc3NhZ2U6ICdGYWlsZWQgdG8gcnVuIGF1dG9tYXRpb24uJyxcblx0XHRcdGRldGFpbDogJ3J1bm5lciBmYWlsZWQnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzYWJsaW5nIGF1dG9tYXRpb25zIHdoaWxlIHRoZSBkaWFsb2cgaXMgb3BlbiBwcmV2ZW50cyB0aGUgdXBkYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgd2lkZ2V0IH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGl0ZW0gPSBhdXRvbWF0aW9uKCk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2Uuc2V0QXV0b21hdGlvbnMoW2l0ZW1dKTtcblx0XHRhdXRvbWF0aW9uRGlhbG9nU2VydmljZS5yZXN1bHQgPSB7IGtpbmQ6ICd1cGRhdGUnLCBpZDogaXRlbS5pZCwgdmFsdWU6IHsgbmFtZTogJ0VkaXRlZCcgfSB9O1xuXHRcdGF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlLmJlZm9yZVJldHVybiA9ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmF1dG9tYXRpb25zLmVuYWJsZWQnLCBmYWxzZSk7XG5cblx0XHR3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLmF1dG9tYXRpb25zLWNhcmQtbWFpbicpPy5jbGljaygpO1xuXHRcdGF3YWl0IGRpYWxvZ1NlcnZpY2UuaW5mb0NhbGxlZC5wO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbmZvOiBkaWFsb2dTZXJ2aWNlLmluZm9zLFxuXHRcdFx0dXBkYXRlQ2FsbHM6IGF1dG9tYXRpb25TZXJ2aWNlLnVwZGF0ZUNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGluZm86IFsnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLiddLFxuXHRcdFx0dXBkYXRlQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY2Vzc2libGUgdmlldyBpbmNsdWRlcyBhdXRvbWF0aW9uIGFuZCBydW4gY29udGVudCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRidWlsZEF1dG9tYXRpb25zQWNjZXNzaWJsZUNvbnRlbnQoW2F1dG9tYXRpb24oKV0sIFtydW4oeyBzdGF0dXM6ICdmYWlsZWQnLCBlcnJvck1lc3NhZ2U6ICdib29tJyB9KV0pLmluY2x1ZGVzKCdEYWlseSByZXZpZXcsIEZhaWxlZCcpLFxuXHRcdFx0dHJ1ZSxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsaUJBQThCLHVCQUF1QjtBQUM5RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxNQUFNLHFCQUFxQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsc0JBQXNCO0FBRTVDLFNBQWtDLGdDQUE4RDtBQUNoRyxTQUFpQyx5QkFBa0Q7QUFDbkYsU0FBdUQsMEJBQTJJO0FBQ2xNLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsOEJBQThCO0FBRXZDLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sU0FBUztBQUNmLE1BQU0sbUJBQW1CLElBQUksTUFBTSxzQ0FBc0M7QUFDekUsTUFBTSwwQkFBMEIsSUFBSSxNQUFNLHNDQUFzQztBQUNoRixNQUFNLFNBQVMsSUFBSSxNQUFNLG1CQUFtQjtBQUU1QyxTQUFTLFNBQThCO0FBQ3RDLFNB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
