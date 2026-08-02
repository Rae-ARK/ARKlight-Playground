import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ConfirmationOptionKind } from "../../../../../platform/agentHost/common/state/protocol/channels-chat/state.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatAutomationsEnabledContext, CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js";
import { AutomationService } from "../../browser/automationService.js";
import { ConfigureAutomationTool, ConfigureAutomationToolId, DeleteAutomationTool, DeleteAutomationToolId, ListAutomationsTool, ListAutomationsToolId, RunAutomationTool, RunAutomationToolId } from "../../browser/automationTools.js";
import { AUTOMATION_STORAGE_KEY } from "../../common/automationStorageService.js";
const FOLDER = URI.parse("file:///workspace");
const SESSION_RESOURCE = URI.parse("agent-session://local/session");
const CHAT_RESOURCE = URI.parse("agent-chat://local/chat");
const NOW = "2026-01-01T00:00:00.000Z";
const progress = { report: () => {
} };
function createAutomation(overrides) {
  return {
    id: "automation-1",
    name: "Daily review",
    prompt: "Review the repository",
    schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
    target: {
      kind: "workspace",
      folderUri: FOLDER,
      providerId: "local-agent-host",
      sessionTypeId: "copilot",
      isolation: { kind: "default" }
    },
    modelId: "gpt-test",
    mode: "agent",
    permissionLevel: "default",
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
    nextRunAt: "2026-01-02T09:00:00.000Z",
    ...overrides
  };
}
class FakeAutomationService extends mock() {
  constructor(automations = []) {
    super();
    this.automations = observableValue(this, []);
    this.runs = observableValue(this, []);
    this.created = [];
    this.updated = [];
    this.deleted = [];
    this.automations.set(automations, void 0);
  }
  getAutomation(id) {
    return this.automations.get().find((automation) => automation.id === id);
  }
  runsFor(automationId) {
    return constObservable(this.runs.get().filter((run) => run.automationId === automationId));
  }
  getActiveRunFor(automationId) {
    return this.runs.get().find((run) => run.automationId === automationId && (run.status === "pending" || run.status === "running"));
  }
  addRun(run) {
    this.runs.set([run, ...this.runs.get()], void 0);
  }
  async createAutomation(options) {
    this.created.push(options);
    return {
      ...options,
      id: "created-automation",
      enabled: options.enabled ?? true,
      createdAt: NOW,
      updatedAt: NOW
    };
  }
  async updateAutomation(id, patch) {
    this.updated.push({ id, patch });
    const existing = this.getAutomation(id);
    assert.ok(existing);
    return {
      ...existing,
      name: patch.name ?? existing.name,
      prompt: patch.prompt ?? existing.prompt,
      schedule: patch.schedule ?? existing.schedule,
      target: patch.target ?? existing.target,
      modelId: patch.modelId === null ? void 0 : patch.modelId ?? existing.modelId,
      mode: patch.mode === null ? void 0 : patch.mode ?? existing.mode,
      permissionLevel: patch.permissionLevel === null ? void 0 : patch.permissionLevel ?? existing.permissionLevel,
      enabled: patch.enabled ?? existing.enabled,
      updatedAt: NOW
    };
  }
  async updateAutomationIfUnchanged(id, patch, expected) {
    const current = this.getAutomation(id);
    if (!current || editableAutomationKey(current) !== editableAutomationKey(expected)) {
      return { kind: "conflict", current };
    }
    return { kind: "updated", automation: await this.updateAutomation(id, patch) };
  }
  async deleteAutomation(id) {
    this.deleted.push(id);
    this.automations.set(this.automations.get().filter((automation) => automation.id !== id), void 0);
  }
}
class RecordingAutomationRunner extends mock() {
  constructor(automationService) {
    super();
    this.automationService = automationService;
    this.calls = [];
    this.tokens = [];
    this.whenDispatched = Promise.resolve();
    this.whenCompleted = Promise.resolve();
    this.runStatus = "running";
  }
  runOnce(automation, trigger, leaderWindowId, token = CancellationToken.None) {
    this.calls.push({
      automationId: automation.id,
      trigger,
      leaderWindowId,
      cancelled: token.isCancellationRequested
    });
    this.tokens.push(token);
    const whenDispatched = this.whenDispatched.then(() => {
      const activeRun = this.automationService.getActiveRunFor(automation.id);
      if (activeRun) {
        return { kind: "alreadyRunning", activeRun };
      }
      if (this.notStarted) {
        return this.notStarted;
      }
      const sessionResource = SESSION_RESOURCE.toString();
      const run = {
        id: "run-1",
        automationId: automation.id,
        status: this.runStatus,
        trigger,
        sessionResource,
        startedAt: NOW,
        leaderWindowId
      };
      this.automationService.addRun(run);
      return { kind: "started", run, sessionResource };
    });
    return {
      whenDispatched,
      whenCompleted: Promise.all([whenDispatched, this.whenCompleted]).then(() => void 0)
    };
  }
}
class ControllableAutomationStorageService {
  constructor(currentValue) {
    this.currentValue = currentValue;
    this.readStarted = new DeferredPromise();
    this.compareAndSwapCalls = 0;
  }
  get value() {
    return this.currentValue;
  }
  async read() {
    await this.readStarted.complete();
    await this.readBarrier?.p;
    return this.currentValue;
  }
  async compareAndSwap(expectedValue, newValue) {
    this.compareAndSwapCalls++;
    this.beforeCompareAndSwap?.();
    if (this.nextConflictValue !== void 0) {
      const currentValue = this.nextConflictValue;
      this.nextConflictValue = void 0;
      this.currentValue = currentValue;
      return { swapped: false, currentValue };
    }
    if (this.currentValue !== expectedValue) {
      return { swapped: false, currentValue: this.currentValue };
    }
    this.currentValue = newValue;
    return { swapped: true, currentValue: newValue };
  }
}
function editableAutomationKey(automation) {
  return JSON.stringify({
    name: automation.name,
    prompt: automation.prompt,
    schedule: automation.schedule,
    target: automation.target.kind === "workspace" ? { ...automation.target, folderUri: automation.target.folderUri.toString() } : automation.target,
    modelId: automation.modelId,
    mode: automation.mode,
    permissionLevel: automation.permissionLevel,
    enabled: automation.enabled
  });
}
function serializeAutomationLedger(automations, revision = 1) {
  return JSON.stringify({
    schemaVersion: 3,
    revision,
    automations: automations.map((automation) => ({
      ...automation,
      target: automation.target.kind === "workspace" ? { ...automation.target, folderUri: automation.target.folderUri.toJSON() } : automation.target
    })),
    runs: []
  });
}
class FakeSessionsManagementService extends mock() {
  constructor(session, resolveFromChatResource = false, folderSessionTypes = [], quickChatSessionTypes = []) {
    super();
    this.session = session;
    this.resolveFromChatResource = resolveFromChatResource;
    this.folderSessionTypes = folderSessionTypes;
    this.quickChatSessionTypes = quickChatSessionTypes;
  }
  getSession() {
    return this.resolveFromChatResource ? void 0 : this.session;
  }
  getSessionForChatResource() {
    return this.resolveFromChatResource && this.session ? { session: this.session, chat: upcastPartial({ resource: CHAT_RESOURCE }) } : void 0;
  }
  getSessionTypesForFolder() {
    this.beforeGetFolderSessionTypes?.();
    return [...this.folderSessionTypes];
  }
  getQuickChatSessionTypes() {
    return [...this.quickChatSessionTypes];
  }
}
function createConfigurationService(enabled = true) {
  const configurationService = new TestConfigurationService();
  configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, enabled);
  return configurationService;
}
function createSession(options) {
  const workspace = options?.workspace === void 0 ? void 0 : upcastPartial({ uri: options.workspace });
  return upcastPartial({
    resource: SESSION_RESOURCE,
    providerId: "local-agent-host",
    sessionType: "copilot",
    workspace: constObservable(workspace),
    isQuickChat: constObservable(options?.quickChat === true)
  });
}
function providerSessionType(providerId, sessionTypeId, supportsWorktreeConfiguration = false) {
  return {
    providerId,
    sessionType: upcastPartial({ id: sessionTypeId, supportsWorktreeConfiguration })
  };
}
async function invoke(tool, parameters, sessionResource = SESSION_RESOURCE, token = CancellationToken.None, selectedCustomButton, toolSpecificData) {
  return tool.invoke({
    callId: "call-1",
    toolId: "tool-1",
    parameters,
    context: { sessionResource },
    selectedCustomButton,
    toolSpecificData
  }, async () => 0, progress, token);
}
function getText(result) {
  const part = result.content[0];
  if (!part || part.kind !== "text") {
    assert.fail("Expected a text tool result.");
  }
  return part.value;
}
suite("AutomationTools", () => {
  const teardown = ensureNoDisposablesAreLeakedInTestSuite();
  function createStorageBackedService(raw, automationStorageService) {
    const storageService = teardown.add(new InMemoryStorageService());
    if (raw !== void 0) {
      storageService.store(AUTOMATION_STORAGE_KEY, raw, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return teardown.add(new AutomationService(storageService, new NullLogService(), NullTelemetryService, automationStorageService));
  }
  test("tool data is gated by AI and Automations context keys", () => {
    const automationService = new FakeAutomationService();
    const configurationService = createConfigurationService();
    const runData = new RunAutomationTool(
      automationService,
      new RecordingAutomationRunner(automationService),
      configurationService
    ).getToolData();
    const listData = new ListAutomationsTool(automationService, configurationService).getToolData();
    const deleteData = new DeleteAutomationTool(automationService, configurationService).getToolData();
    const configureData = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      configurationService
    ).getToolData();
    const serialize = (tool) => tool.when?.serialize() ?? "";
    assert.deepStrictEqual([listData, configureData, runData, deleteData].map((tool) => ({
      id: tool.id,
      referenceName: tool.toolReferenceName,
      aiEnabledGate: serialize(tool).includes(ChatContextKeys.enabled.key),
      automationsEnabledGate: serialize(tool).includes(ChatAutomationsEnabledContext.key),
      runsInWorkspace: tool.runsInWorkspace
    })), [
      {
        id: ListAutomationsToolId,
        referenceName: "listAutomations",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: ConfigureAutomationToolId,
        referenceName: "configureAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: RunAutomationToolId,
        referenceName: "runAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      },
      {
        id: DeleteAutomationToolId,
        referenceName: "deleteAutomation",
        aiEnabledGate: true,
        automationsEnabledGate: true,
        runsInWorkspace: false
      }
    ]);
  });
  test("listAutomations returns stable IDs and editable fields", async () => {
    const automation = createAutomation();
    const tool = new ListAutomationsTool(new FakeAutomationService([automation]), createConfigurationService());
    const result = await invoke(tool, {});
    assert.deepStrictEqual(JSON.parse(getText(result)), {
      automations: [{
        id: "automation-1",
        name: "Daily review",
        prompt: "Review the repository",
        schedule: { interval: "daily", scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
        target: {
          kind: "workspace",
          folderUri: "file:///workspace",
          providerId: "local-agent-host",
          sessionTypeId: "copilot",
          isolation: { kind: "default" }
        },
        modelId: "gpt-test",
        mode: "agent",
        permissionLevel: "default",
        enabled: true,
        createdAt: NOW,
        updatedAt: NOW,
        lastRunAt: null,
        nextRunAt: "2026-01-02T09:00:00.000Z"
      }]
    });
  });
  test("runAutomation confirms and starts a manual run", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const runner = new RecordingAutomationRunner(automationService);
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const parameters = { automationId: automation.id };
    const invocationCancellation = new CancellationTokenSource();
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const message = prepared.confirmationMessages?.message;
    const result = await invoke(tool, parameters, SESSION_RESOURCE, invocationCancellation.token);
    invocationCancellation.cancel();
    const runTokenCancelledAfterDispatch = runner.tokens[0]?.isCancellationRequested;
    invocationCancellation.dispose();
    assert.deepStrictEqual({
      confirmationTitle: prepared.confirmationMessages?.title,
      confirmationMessage: typeof message === "string" ? message : message?.value,
      calls: runner.calls,
      runTokenCancelledAfterDispatch,
      result: JSON.parse(getText(result))
    }, {
      confirmationTitle: "Run Automation?",
      confirmationMessage: "Run **Daily review** (`automation-1`) now? This starts a new agent session using the automation's configured prompt and permissions.",
      calls: [{
        automationId: "automation-1",
        trigger: "manual",
        leaderWindowId: 0,
        cancelled: false
      }],
      runTokenCancelledAfterDispatch: false,
      result: {
        status: "started",
        automation: { id: "automation-1", name: "Daily review" },
        run: {
          id: "run-1",
          status: "running",
          sessionResource: SESSION_RESOURCE.toString()
        }
      }
    });
  });
  test("runAutomation reports the active run when the runner declines to claim it", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    automationService.addRun({
      id: "active-run",
      automationId: automation.id,
      status: "running",
      trigger: "manual",
      sessionResource: SESSION_RESOURCE.toString(),
      startedAt: NOW,
      leaderWindowId: 0
    });
    const runner = new RecordingAutomationRunner(automationService);
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const parameters = { automationId: automation.id };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const result = await invoke(tool, parameters);
    assert.deepStrictEqual({
      confirmation: prepared.confirmationMessages,
      // The runner owns the claim, so the tool still dispatches and lets it decline.
      runsCreated: automationService.runs.get().length,
      result: JSON.parse(getText(result))
    }, {
      confirmation: void 0,
      runsCreated: 1,
      result: {
        status: "already_running",
        automation: { id: "automation-1", name: "Daily review" },
        run: {
          id: "active-run",
          status: "running",
          sessionResource: SESSION_RESOURCE.toString()
        }
      }
    });
  });
  test("runAutomation reports when dispatch does not start a run", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const runner = new RecordingAutomationRunner(automationService);
    runner.notStarted = { kind: "notStarted", reason: "targetUnavailable" };
    const tool = new RunAutomationTool(automationService, runner, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id });
    assert.deepStrictEqual({
      error: result.toolResultError,
      calls: runner.calls.length
    }, {
      error: 'Automation "automation-1" did not start. Its configured agent is unavailable.',
      calls: 1
    });
  });
  test("deleteAutomation provides Delete and Cancel confirmation options", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const parameters = { automationId: automation.id };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "call-1",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const message = prepared?.confirmationMessages?.message;
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, "delete");
    assert.deepStrictEqual({
      confirmationTitle: prepared?.confirmationMessages?.title,
      confirmationMessage: typeof message === "string" ? message : message?.value,
      allowAutoConfirm: prepared?.confirmationMessages?.allowAutoConfirm,
      options: prepared?.confirmationMessages?.customOptions,
      deleted: automationService.deleted,
      automations: automationService.automations.get(),
      result: JSON.parse(getText(result))
    }, {
      confirmationTitle: "Delete Automation?",
      confirmationMessage: "Delete **Daily review** (`automation-1`)? Its saved configuration and run history will be permanently removed. Runs already in flight will continue.",
      allowAutoConfirm: void 0,
      options: [
        { id: "delete", label: "Delete", kind: ConfirmationOptionKind.Approve },
        { id: "cancel", label: "Cancel", kind: ConfirmationOptionKind.Deny }
      ],
      deleted: ["automation-1"],
      automations: [],
      result: {
        status: "deleted",
        automation: { id: "automation-1", name: "Daily review" }
      }
    });
  });
  test("deleteAutomation rejects stale IDs before confirmation", async () => {
    const automationService = new FakeAutomationService();
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const parameters = { automationId: "missing" };
    await assert.rejects(
      tool.prepareToolInvocation({
        parameters,
        toolCallId: "call-1",
        chatSessionResource: SESSION_RESOURCE
      }, CancellationToken.None),
      /Automation "missing" does not exist/
    );
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, "delete");
    assert.deepStrictEqual({
      error: result.toolResultError,
      deleted: automationService.deleted
    }, {
      error: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
      deleted: []
    });
  });
  test("deleteAutomation Cancel option makes no changes", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, CancellationToken.None, "cancel");
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      deleted: [],
      automations: [automation]
    });
  });
  test("deleteAutomation runs without a custom button after approval", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(
      tool,
      { automationId: automation.id },
      SESSION_RESOURCE,
      CancellationToken.None
    );
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "deleted",
        automation: { id: automation.id, name: automation.name }
      },
      deleted: [automation.id],
      automations: []
    });
  });
  test("deleteAutomation cancellation makes no changes", async () => {
    const automation = createAutomation();
    const automationService = new FakeAutomationService([automation]);
    const tokenSource = new CancellationTokenSource();
    tokenSource.cancel();
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const result = await invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, tokenSource.token, "delete");
    tokenSource.dispose();
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      deleted: automationService.deleted,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      deleted: [],
      automations: [automation]
    });
  });
  test("configureAutomation prepares normal create and update confirmations", async () => {
    const existing = createAutomation();
    const tool = new ConfigureAutomationTool(
      new FakeAutomationService([existing]),
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const createPrepared = await tool.prepareToolInvocation({
      parameters: {
        name: "Morning review",
        prompt: "Review open pull requests",
        schedule: { interval: "daily" }
      },
      toolCallId: "create-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const updatePrepared = await tool.prepareToolInvocation({
      parameters: { automationId: existing.id, name: "Updated review" },
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    assert.deepStrictEqual({
      create: {
        title: createPrepared.confirmationMessages?.title,
        message: typeof createPrepared.confirmationMessages?.message === "string" ? createPrepared.confirmationMessages.message : createPrepared.confirmationMessages?.message?.value,
        toolSpecificData: createPrepared.toolSpecificData
      },
      update: {
        title: updatePrepared.confirmationMessages?.title,
        message: typeof updatePrepared.confirmationMessages?.message === "string" ? updatePrepared.confirmationMessages.message : updatePrepared.confirmationMessages?.message?.value,
        expectedId: updatePrepared.toolSpecificData?.kind === "automationConfiguration" ? updatePrepared.toolSpecificData.expectedAutomationId : void 0
      }
    }, {
      create: {
        title: "Create Automation?",
        message: "Create the automation **Morning review**?",
        toolSpecificData: void 0
      },
      update: {
        title: "Update Automation?",
        message: "Apply the proposed changes to **Daily review** (`automation-1`)?",
        expectedId: existing.id
      }
    });
  });
  test("configureAutomation creates from the invoking chat target and returns clickable result data", async () => {
    const automationService = new FakeAutomationService();
    const target = {
      kind: "quickChat",
      providerId: "local-agent-host",
      sessionTypeId: "copilot"
    };
    const schedule = { interval: "daily", scheduleHour: 8, scheduleMinute: 30, scheduleDay: 1 };
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ quickChat: true }), true),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Morning review",
      prompt: "Review open pull requests",
      schedule: { interval: "daily", scheduleHour: 8, scheduleMinute: 30 },
      enabled: true
    }, CHAT_RESOURCE);
    assert.deepStrictEqual({
      created: automationService.created,
      status: JSON.parse(getText(result)).status,
      toolSpecificData: result.toolSpecificData
    }, {
      created: [{
        name: "Morning review",
        prompt: "Review open pull requests",
        schedule,
        target,
        enabled: true
      }],
      status: "created",
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: "created-automation",
        automationName: "Morning review",
        operation: "created"
      }
    });
  });
  test("configureAutomation applies a partial guarded update and returns clickable result data", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = {
      automationId: existing.id,
      name: "Updated review",
      schedule: { scheduleMinute: 45 },
      modelId: null,
      mode: null,
      permissionLevel: null
    };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      updated: automationService.updated,
      status: JSON.parse(getText(result)).status,
      toolSpecificData: result.toolSpecificData
    }, {
      updated: [{
        id: existing.id,
        patch: {
          name: "Updated review",
          schedule: { ...existing.schedule, scheduleMinute: 45 },
          modelId: null,
          mode: null,
          permissionLevel: null
        }
      }],
      status: "updated",
      toolSpecificData: {
        kind: "automationConfigured",
        automationId: existing.id,
        automationName: "Updated review",
        operation: "updated"
      }
    });
  });
  test("configureAutomation rejects editable changes made while awaiting approval", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = { automationId: existing.id, name: "Proposed name" };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    automationService.automations.set([
      { ...existing, prompt: "Changed in another window", updatedAt: "2026-01-01T00:01:00.000Z" }
    ], void 0);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      error: result.toolResultError,
      updated: automationService.updated
    }, {
      error: 'Automation "automation-1" changed before the update was applied. Call listAutomations to refresh it before proposing new changes. No changes were made.',
      updated: []
    });
  });
  test("configureAutomation permits runtime metadata changes while awaiting approval", async () => {
    const existing = createAutomation();
    const automationService = new FakeAutomationService([existing]);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const parameters = { automationId: existing.id, name: "Proposed name" };
    const prepared = await tool.prepareToolInvocation({
      parameters,
      toolCallId: "update-call",
      chatSessionResource: SESSION_RESOURCE
    }, CancellationToken.None);
    automationService.automations.set([{
      ...existing,
      updatedAt: "2026-01-01T00:01:00.000Z",
      lastRunAt: "2026-01-01T00:01:00.000Z",
      nextRunAt: "2026-01-02T09:00:00.000Z"
    }], void 0);
    const result = await invoke(tool, parameters, SESSION_RESOURCE, CancellationToken.None, void 0, prepared.toolSpecificData);
    assert.deepStrictEqual({
      status: JSON.parse(getText(result)).status,
      updated: automationService.updated
    }, {
      status: "updated",
      updated: [{ id: existing.id, patch: { name: "Proposed name" } }]
    });
  });
  test("configureAutomation validates explicit targets before writing", async () => {
    const automationService = new FakeAutomationService();
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(
        void 0,
        false,
        [providerSessionType("local-agent-host", "copilot", false)]
      ),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Invalid worktree",
      prompt: "Do not save",
      schedule: { interval: "manual" },
      target: {
        kind: "workspace",
        folderUri: FOLDER.toString(),
        providerId: "local-agent-host",
        sessionTypeId: "copilot",
        isolation: "worktree",
        branch: "main"
      }
    });
    assert.deepStrictEqual({
      error: result.toolResultError,
      created: automationService.created
    }, {
      error: 'Session type "copilot" does not support worktree isolation.',
      created: []
    });
  });
  test("configureAutomation rechecks cancellation immediately before writing", async () => {
    const automationService = new FakeAutomationService();
    const tokenSource = new CancellationTokenSource();
    tokenSource.cancel();
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Cancelled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    tokenSource.dispose();
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      created: automationService.created
    }, {
      result: {
        status: "cancelled",
        message: "The automation change was cancelled. No changes were made."
      },
      created: []
    });
  });
  test("configureAutomation rechecks the feature setting immediately before writing", async () => {
    const automationService = new FakeAutomationService();
    const configurationService = createConfigurationService();
    const sessionsManagementService = new FakeSessionsManagementService(
      void 0,
      false,
      [providerSessionType("local-agent-host", "copilot")]
    );
    sessionsManagementService.beforeGetFolderSessionTypes = () => configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
    const tool = new ConfigureAutomationTool(automationService, sessionsManagementService, configurationService);
    const result = await invoke(tool, {
      name: "Disabled",
      prompt: "Do not save",
      schedule: { interval: "manual" },
      target: {
        kind: "workspace",
        folderUri: FOLDER.toString(),
        providerId: "local-agent-host",
        sessionTypeId: "copilot",
        isolation: "default"
      }
    });
    assert.deepStrictEqual({
      error: result.toolResultError,
      created: automationService.created
    }, {
      error: "Automations are disabled.",
      created: []
    });
  });
  test("configureAutomation cancellation during an authoritative read makes no changes", async () => {
    const automationStorageService = new ControllableAutomationStorageService(void 0);
    const readBarrier = new DeferredPromise();
    automationStorageService.readBarrier = readBarrier;
    const automationService = createStorageBackedService(void 0, automationStorageService);
    const tokenSource = teardown.add(new CancellationTokenSource());
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const resultPromise = invoke(tool, {
      name: "Cancelled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    await automationStorageService.readStarted.p;
    tokenSource.cancel();
    await readBarrier.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automations: automationService.automations.get()
    }, {
      result: {
        status: "cancelled",
        message: "The automation change was cancelled. No changes were made."
      },
      compareAndSwapCalls: 0,
      automations: []
    });
  });
  test("deleteAutomation cancellation during an authoritative read makes no changes", async () => {
    const automation = createAutomation();
    const raw = serializeAutomationLedger([automation]);
    const automationStorageService = new ControllableAutomationStorageService(raw);
    const readBarrier = new DeferredPromise();
    automationStorageService.readBarrier = readBarrier;
    const automationService = createStorageBackedService(raw, automationStorageService);
    const tokenSource = teardown.add(new CancellationTokenSource());
    const tool = new DeleteAutomationTool(automationService, createConfigurationService());
    const resultPromise = invoke(tool, { automationId: automation.id }, SESSION_RESOURCE, tokenSource.token, "delete");
    await automationStorageService.readStarted.p;
    tokenSource.cancel();
    await readBarrier.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      result: JSON.parse(getText(result)),
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automationIds: automationService.automations.get().map((candidate) => candidate.id)
    }, {
      result: {
        status: "cancelled",
        message: "The automation was not deleted."
      },
      compareAndSwapCalls: 0,
      automationIds: [automation.id]
    });
  });
  test("configureAutomation disablement during a CAS conflict stops before retrying", async () => {
    const automation = createAutomation();
    const raw = serializeAutomationLedger([automation]);
    const automationStorageService = new ControllableAutomationStorageService(raw);
    automationStorageService.nextConflictValue = serializeAutomationLedger([automation], 2);
    const configurationService = createConfigurationService();
    automationStorageService.beforeCompareAndSwap = () => configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
    const automationService = createStorageBackedService(raw, automationStorageService);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(void 0),
      configurationService
    );
    const result = await invoke(tool, { automationId: automation.id, name: "Must not commit" });
    assert.deepStrictEqual({
      error: result.toolResultError,
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      automationName: automationService.getAutomation(automation.id)?.name
    }, {
      error: "Automations are disabled.",
      compareAndSwapCalls: 1,
      automationName: automation.name
    });
  });
  test("configureAutomation reports success when cancellation crosses a committed CAS boundary", async () => {
    const automationStorageService = new ControllableAutomationStorageService(void 0);
    const tokenSource = teardown.add(new CancellationTokenSource());
    automationStorageService.beforeCompareAndSwap = () => tokenSource.cancel();
    const automationService = createStorageBackedService(void 0, automationStorageService);
    const tool = new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      createConfigurationService()
    );
    const result = await invoke(tool, {
      name: "Committed",
      prompt: "Save once CAS starts",
      schedule: { interval: "manual" }
    }, SESSION_RESOURCE, tokenSource.token);
    const persisted = JSON.parse(automationStorageService.value);
    assert.deepStrictEqual({
      status: JSON.parse(getText(result)).status,
      cancelled: tokenSource.token.isCancellationRequested,
      compareAndSwapCalls: automationStorageService.compareAndSwapCalls,
      inMemoryNames: automationService.automations.get().map((automation) => automation.name),
      persistedNames: persisted.automations.map((automation) => automation.name)
    }, {
      status: "created",
      cancelled: true,
      compareAndSwapCalls: 1,
      inMemoryNames: ["Committed"],
      persistedNames: ["Committed"]
    });
  });
  test("configureAutomation rejects stale IDs and malformed targets", async () => {
    const tool = new ConfigureAutomationTool(
      new FakeAutomationService(),
      new FakeSessionsManagementService(void 0),
      createConfigurationService()
    );
    const staleResult = await invoke(tool, { automationId: "missing", name: "Updated" });
    const malformedTargetResult = await invoke(tool, {
      name: "Invalid target",
      prompt: "Do not save",
      schedule: { interval: "weekly" },
      target: {
        kind: "workspace",
        folderUri: "not-an-absolute-uri",
        isolation: "worktree",
        branch: "main"
      }
    });
    assert.deepStrictEqual({
      staleError: staleResult.toolResultError,
      targetError: malformedTargetResult.toolResultError
    }, {
      staleError: 'Automation "missing" does not exist. Call listAutomations to refresh the available IDs.',
      targetError: '"target.folderUri" must be a valid absolute URI.'
    });
  });
  test("disabled Automations cannot be listed, configured, run, or deleted", async () => {
    const automationService = new FakeAutomationService([createAutomation()]);
    const configurationService = createConfigurationService(false);
    const runner = new RecordingAutomationRunner(automationService);
    const listResult = await invoke(new ListAutomationsTool(automationService, configurationService), {});
    const configureResult = await invoke(new ConfigureAutomationTool(
      automationService,
      new FakeSessionsManagementService(createSession({ workspace: FOLDER })),
      configurationService
    ), {
      name: "Disabled",
      prompt: "Do not save",
      schedule: { interval: "manual" }
    });
    const runResult = await invoke(
      new RunAutomationTool(automationService, runner, configurationService),
      { automationId: "automation-1" }
    );
    const deleteResult = await invoke(
      new DeleteAutomationTool(automationService, configurationService),
      { automationId: "automation-1" },
      SESSION_RESOURCE,
      CancellationToken.None,
      "delete"
    );
    assert.deepStrictEqual({
      listError: listResult.toolResultError,
      configureError: configureResult.toolResultError,
      runError: runResult.toolResultError,
      deleteError: deleteResult.toolResultError,
      runCalls: runner.calls,
      deleted: automationService.deleted
    }, {
      listError: "Automations are disabled.",
      configureError: "Automations are disabled.",
      runError: "Automations are disabled.",
      deleteError: "Automations are disabled.",
      runCalls: [],
      deleted: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25Ub29scy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYXQvc3RhdGUuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uUnVuVHJpZ2dlciwgQXV0b21hdGlvblRhcmdldCwgSUF1dG9tYXRpb24sIElBdXRvbWF0aW9uUnVuLCBJQXV0b21hdGlvblNjaGVkdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblJ1bkRpc3BhdGNoLCBJQXV0b21hdGlvblJ1bm5lciwgSUF1dG9tYXRpb25SdW5PcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uUnVubmVyLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uU2VydmljZSwgSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zLCBJR3VhcmRlZEF1dG9tYXRpb25VcGRhdGVSZXN1bHQsIElVcGRhdGVBdXRvbWF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBdXRvbWF0aW9uc0VuYWJsZWRDb250ZXh0LCBDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25zRW5hYmxlZC5qcyc7XG5pbXBvcnQgeyBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xSZXN1bHQsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXQsIElTZXNzaW9uLCBJU2Vzc2lvblR5cGUsIElTZXNzaW9uV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVByb3ZpZGVyU2Vzc2lvblR5cGUsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBdXRvbWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYXV0b21hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlQXV0b21hdGlvblRvb2wsIENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sSWQsIERlbGV0ZUF1dG9tYXRpb25Ub29sLCBEZWxldGVBdXRvbWF0aW9uVG9vbElkLCBMaXN0QXV0b21hdGlvbnNUb29sLCBMaXN0QXV0b21hdGlvbnNUb29sSWQsIFJ1bkF1dG9tYXRpb25Ub29sLCBSdW5BdXRvbWF0aW9uVG9vbElkIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9hdXRvbWF0aW9uVG9vbHMuanMnO1xuaW1wb3J0IHsgQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgSUF1dG9tYXRpb25TdG9yYWdlQ29tcGFyZUFuZFN3YXBSZXN1bHQsIElBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmpzJztcblxuY29uc3QgRk9MREVSID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZScpO1xuY29uc3QgU0VTU0lPTl9SRVNPVVJDRSA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL2xvY2FsL3Nlc3Npb24nKTtcbmNvbnN0IENIQVRfUkVTT1VSQ0UgPSBVUkkucGFyc2UoJ2FnZW50LWNoYXQ6Ly9sb2NhbC9jaGF0Jyk7XG5jb25zdCBOT1cgPSAnMjAyNi0wMS0wMVQwMDowMDowMC4wMDBaJztcbmNvbnN0IHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MgPSB7IHJlcG9ydDogKCkgPT4geyB9IH07XG5cbmZ1bmN0aW9uIGNyZWF0ZUF1dG9tYXRpb24ob3ZlcnJpZGVzPzogUGFydGlhbDxJQXV0b21hdGlvbj4pOiBJQXV0b21hdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdG5hbWU6ICdEYWlseSByZXZpZXcnLFxuXHRcdHByb21wdDogJ1JldmlldyB0aGUgcmVwb3NpdG9yeScsXG5cdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdkYWlseScsIHNjaGVkdWxlSG91cjogOSwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAxIH0sXG5cdFx0dGFyZ2V0OiB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdGZvbGRlclVyaTogRk9MREVSLFxuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0c2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QnLFxuXHRcdFx0aXNvbGF0aW9uOiB7IGtpbmQ6ICdkZWZhdWx0JyB9LFxuXHRcdH0sXG5cdFx0bW9kZWxJZDogJ2dwdC10ZXN0Jyxcblx0XHRtb2RlOiAnYWdlbnQnLFxuXHRcdHBlcm1pc3Npb25MZXZlbDogJ2RlZmF1bHQnLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y3JlYXRlZEF0OiBOT1csXG5cdFx0dXBkYXRlZEF0OiBOT1csXG5cdFx0bmV4dFJ1bkF0OiAnMjAyNi0wMS0wMlQwOTowMDowMC4wMDBaJyxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmNsYXNzIEZha2VBdXRvbWF0aW9uU2VydmljZSBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25TZXJ2aWNlPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYXV0b21hdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUF1dG9tYXRpb25bXT4odGhpcywgW10pO1xuXHRvdmVycmlkZSByZWFkb25seSBydW5zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBdXRvbWF0aW9uUnVuW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgY3JlYXRlZDogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zW10gPSBbXTtcblx0cmVhZG9ubHkgdXBkYXRlZDogQXJyYXk8eyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBwYXRjaDogSVVwZGF0ZUF1dG9tYXRpb25PcHRpb25zIH0+ID0gW107XG5cdHJlYWRvbmx5IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cblx0Y29uc3RydWN0b3IoYXV0b21hdGlvbnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uW10gPSBbXSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5hdXRvbWF0aW9ucy5zZXQoYXV0b21hdGlvbnMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBdXRvbWF0aW9uKGlkOiBzdHJpbmcpOiBJQXV0b21hdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYXV0b21hdGlvbnMuZ2V0KCkuZmluZChhdXRvbWF0aW9uID0+IGF1dG9tYXRpb24uaWQgPT09IGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bnNGb3IoYXV0b21hdGlvbklkOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHRoaXMucnVucy5nZXQoKS5maWx0ZXIocnVuID0+IHJ1bi5hdXRvbWF0aW9uSWQgPT09IGF1dG9tYXRpb25JZCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aXZlUnVuRm9yKGF1dG9tYXRpb25JZDogc3RyaW5nKTogSUF1dG9tYXRpb25SdW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJ1bnMuZ2V0KCkuZmluZChydW4gPT4gcnVuLmF1dG9tYXRpb25JZCA9PT0gYXV0b21hdGlvbklkICYmIChydW4uc3RhdHVzID09PSAncGVuZGluZycgfHwgcnVuLnN0YXR1cyA9PT0gJ3J1bm5pbmcnKSk7XG5cdH1cblxuXHRhZGRSdW4ocnVuOiBJQXV0b21hdGlvblJ1bik6IHZvaWQge1xuXHRcdHRoaXMucnVucy5zZXQoW3J1biwgLi4udGhpcy5ydW5zLmdldCgpXSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUF1dG9tYXRpb24ob3B0aW9uczogSUNyZWF0ZUF1dG9tYXRpb25PcHRpb25zKTogUHJvbWlzZTxJQXV0b21hdGlvbj4ge1xuXHRcdHRoaXMuY3JlYXRlZC5wdXNoKG9wdGlvbnMpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0aWQ6ICdjcmVhdGVkLWF1dG9tYXRpb24nLFxuXHRcdFx0ZW5hYmxlZDogb3B0aW9ucy5lbmFibGVkID8/IHRydWUsXG5cdFx0XHRjcmVhdGVkQXQ6IE5PVyxcblx0XHRcdHVwZGF0ZWRBdDogTk9XLFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMpOiBQcm9taXNlPElBdXRvbWF0aW9uPiB7XG5cdFx0dGhpcy51cGRhdGVkLnB1c2goeyBpZCwgcGF0Y2ggfSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmdldEF1dG9tYXRpb24oaWQpO1xuXHRcdGFzc2VydC5vayhleGlzdGluZyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmV4aXN0aW5nLFxuXHRcdFx0bmFtZTogcGF0Y2gubmFtZSA/PyBleGlzdGluZy5uYW1lLFxuXHRcdFx0cHJvbXB0OiBwYXRjaC5wcm9tcHQgPz8gZXhpc3RpbmcucHJvbXB0LFxuXHRcdFx0c2NoZWR1bGU6IHBhdGNoLnNjaGVkdWxlID8/IGV4aXN0aW5nLnNjaGVkdWxlLFxuXHRcdFx0dGFyZ2V0OiBwYXRjaC50YXJnZXQgPz8gZXhpc3RpbmcudGFyZ2V0LFxuXHRcdFx0bW9kZWxJZDogcGF0Y2gubW9kZWxJZCA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHBhdGNoLm1vZGVsSWQgPz8gZXhpc3RpbmcubW9kZWxJZCxcblx0XHRcdG1vZGU6IHBhdGNoLm1vZGUgPT09IG51bGwgPyB1bmRlZmluZWQgOiBwYXRjaC5tb2RlID8/IGV4aXN0aW5nLm1vZGUsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHBhdGNoLnBlcm1pc3Npb25MZXZlbCA/PyBleGlzdGluZy5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRlbmFibGVkOiBwYXRjaC5lbmFibGVkID8/IGV4aXN0aW5nLmVuYWJsZWQsXG5cdFx0XHR1cGRhdGVkQXQ6IE5PVyxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgdXBkYXRlQXV0b21hdGlvbklmVW5jaGFuZ2VkKGlkOiBzdHJpbmcsIHBhdGNoOiBJVXBkYXRlQXV0b21hdGlvbk9wdGlvbnMsIGV4cGVjdGVkOiBJQXV0b21hdGlvbik6IFByb21pc2U8SUd1YXJkZWRBdXRvbWF0aW9uVXBkYXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuZ2V0QXV0b21hdGlvbihpZCk7XG5cdFx0aWYgKCFjdXJyZW50IHx8IGVkaXRhYmxlQXV0b21hdGlvbktleShjdXJyZW50KSAhPT0gZWRpdGFibGVBdXRvbWF0aW9uS2V5KGV4cGVjdGVkKSkge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2NvbmZsaWN0JywgY3VycmVudCB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBraW5kOiAndXBkYXRlZCcsIGF1dG9tYXRpb246IGF3YWl0IHRoaXMudXBkYXRlQXV0b21hdGlvbihpZCwgcGF0Y2gpIH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkZWxldGVBdXRvbWF0aW9uKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmRlbGV0ZWQucHVzaChpZCk7XG5cdFx0dGhpcy5hdXRvbWF0aW9ucy5zZXQodGhpcy5hdXRvbWF0aW9ucy5nZXQoKS5maWx0ZXIoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLmlkICE9PSBpZCksIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nQXV0b21hdGlvblJ1bm5lciBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25SdW5uZXI+KCkge1xuXHRyZWFkb25seSBjYWxsczogQXJyYXk8e1xuXHRcdHJlYWRvbmx5IGF1dG9tYXRpb25JZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRyaWdnZXI6IEF1dG9tYXRpb25SdW5UcmlnZ2VyO1xuXHRcdHJlYWRvbmx5IGxlYWRlcldpbmRvd0lkOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgY2FuY2VsbGVkOiBib29sZWFuO1xuXHR9PiA9IFtdO1xuXHRyZWFkb25seSB0b2tlbnM6IENhbmNlbGxhdGlvblRva2VuW10gPSBbXTtcblx0d2hlbkRpc3BhdGNoZWQ6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0d2hlbkNvbXBsZXRlZDogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRydW5TdGF0dXM6IElBdXRvbWF0aW9uUnVuWydzdGF0dXMnXSA9ICdydW5uaW5nJztcblx0LyoqIFdoZW4gc2V0LCBkaXNwYXRjaCByZXBvcnRzIHRoaXMgb3V0Y29tZSBpbnN0ZWFkIG9mIHN0YXJ0aW5nIGEgc2Vzc2lvbi4gKi9cblx0bm90U3RhcnRlZDogKElBdXRvbWF0aW9uUnVuRGlzcGF0Y2ggJiB7IGtpbmQ6ICdub3RTdGFydGVkJyB9KSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGF1dG9tYXRpb25TZXJ2aWNlOiBGYWtlQXV0b21hdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuT25jZShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbiwgdHJpZ2dlcjogQXV0b21hdGlvblJ1blRyaWdnZXIsIGxlYWRlcldpbmRvd0lkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBJQXV0b21hdGlvblJ1bk9wZXJhdGlvbiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHtcblx0XHRcdGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHRsZWFkZXJXaW5kb3dJZCxcblx0XHRcdGNhbmNlbGxlZDogdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsXG5cdFx0fSk7XG5cdFx0dGhpcy50b2tlbnMucHVzaCh0b2tlbik7XG5cdFx0Y29uc3Qgd2hlbkRpc3BhdGNoZWQgPSB0aGlzLndoZW5EaXNwYXRjaGVkLnRoZW48SUF1dG9tYXRpb25SdW5EaXNwYXRjaD4oKCkgPT4ge1xuXHRcdFx0Ly8gTWlycm9ycyB0aGUgcmVhbCBydW5uZXI6IHRoZSBhdG9taWMgY2xhaW0gZGVjaWRlcyB3aG8gZ2V0cyB0byBkaXNwYXRjaC5cblx0XHRcdGNvbnN0IGFjdGl2ZVJ1biA9IHRoaXMuYXV0b21hdGlvblNlcnZpY2UuZ2V0QWN0aXZlUnVuRm9yKGF1dG9tYXRpb24uaWQpO1xuXHRcdFx0aWYgKGFjdGl2ZVJ1bikge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWxyZWFkeVJ1bm5pbmcnLCBhY3RpdmVSdW4gfTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm5vdFN0YXJ0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubm90U3RhcnRlZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFNFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHJ1bjogSUF1dG9tYXRpb25SdW4gPSB7XG5cdFx0XHRcdGlkOiAncnVuLTEnLFxuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQsXG5cdFx0XHRcdHN0YXR1czogdGhpcy5ydW5TdGF0dXMsXG5cdFx0XHRcdHRyaWdnZXIsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0c3RhcnRlZEF0OiBOT1csXG5cdFx0XHRcdGxlYWRlcldpbmRvd0lkLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuYXV0b21hdGlvblNlcnZpY2UuYWRkUnVuKHJ1bik7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnc3RhcnRlZCcsIHJ1biwgc2Vzc2lvblJlc291cmNlIH07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdoZW5EaXNwYXRjaGVkLFxuXHRcdFx0d2hlbkNvbXBsZXRlZDogUHJvbWlzZS5hbGwoW3doZW5EaXNwYXRjaGVkLCB0aGlzLndoZW5Db21wbGV0ZWRdKS50aGVuKCgpID0+IHVuZGVmaW5lZCksXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBDb250cm9sbGFibGVBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UgaW1wbGVtZW50cyBJQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSByZWFkU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZEJhcnJpZXI6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0YmVmb3JlQ29tcGFyZUFuZFN3YXA6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0bmV4dENvbmZsaWN0VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y29tcGFyZUFuZFN3YXBDYWxscyA9IDA7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjdXJyZW50VmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkgeyB9XG5cblx0Z2V0IHZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudFZhbHVlO1xuXHR9XG5cblx0YXN5bmMgcmVhZCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVhZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRhd2FpdCB0aGlzLnJlYWRCYXJyaWVyPy5wO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRWYWx1ZTtcblx0fVxuXG5cdGFzeW5jIGNvbXBhcmVBbmRTd2FwKGV4cGVjdGVkVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IHN0cmluZyk6IFByb21pc2U8SUF1dG9tYXRpb25TdG9yYWdlQ29tcGFyZUFuZFN3YXBSZXN1bHQ+IHtcblx0XHR0aGlzLmNvbXBhcmVBbmRTd2FwQ2FsbHMrKztcblx0XHR0aGlzLmJlZm9yZUNvbXBhcmVBbmRTd2FwPy4oKTtcblx0XHRpZiAodGhpcy5uZXh0Q29uZmxpY3RWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSB0aGlzLm5leHRDb25mbGljdFZhbHVlO1xuXHRcdFx0dGhpcy5uZXh0Q29uZmxpY3RWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuY3VycmVudFZhbHVlID0gY3VycmVudFZhbHVlO1xuXHRcdFx0cmV0dXJuIHsgc3dhcHBlZDogZmFsc2UsIGN1cnJlbnRWYWx1ZSB9O1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdXJyZW50VmFsdWUgIT09IGV4cGVjdGVkVmFsdWUpIHtcblx0XHRcdHJldHVybiB7IHN3YXBwZWQ6IGZhbHNlLCBjdXJyZW50VmFsdWU6IHRoaXMuY3VycmVudFZhbHVlIH07XG5cdFx0fVxuXHRcdHRoaXMuY3VycmVudFZhbHVlID0gbmV3VmFsdWU7XG5cdFx0cmV0dXJuIHsgc3dhcHBlZDogdHJ1ZSwgY3VycmVudFZhbHVlOiBuZXdWYWx1ZSB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVkaXRhYmxlQXV0b21hdGlvbktleShhdXRvbWF0aW9uOiBJQXV0b21hdGlvbik6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0bmFtZTogYXV0b21hdGlvbi5uYW1lLFxuXHRcdHByb21wdDogYXV0b21hdGlvbi5wcm9tcHQsXG5cdFx0c2NoZWR1bGU6IGF1dG9tYXRpb24uc2NoZWR1bGUsXG5cdFx0dGFyZ2V0OiBhdXRvbWF0aW9uLnRhcmdldC5raW5kID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0PyB7IC4uLmF1dG9tYXRpb24udGFyZ2V0LCBmb2xkZXJVcmk6IGF1dG9tYXRpb24udGFyZ2V0LmZvbGRlclVyaS50b1N0cmluZygpIH1cblx0XHRcdDogYXV0b21hdGlvbi50YXJnZXQsXG5cdFx0bW9kZWxJZDogYXV0b21hdGlvbi5tb2RlbElkLFxuXHRcdG1vZGU6IGF1dG9tYXRpb24ubW9kZSxcblx0XHRwZXJtaXNzaW9uTGV2ZWw6IGF1dG9tYXRpb24ucGVybWlzc2lvbkxldmVsLFxuXHRcdGVuYWJsZWQ6IGF1dG9tYXRpb24uZW5hYmxlZCxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUF1dG9tYXRpb25MZWRnZXIoYXV0b21hdGlvbnM6IHJlYWRvbmx5IElBdXRvbWF0aW9uW10sIHJldmlzaW9uID0gMSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0c2NoZW1hVmVyc2lvbjogMyxcblx0XHRyZXZpc2lvbixcblx0XHRhdXRvbWF0aW9uczogYXV0b21hdGlvbnMubWFwKGF1dG9tYXRpb24gPT4gKHtcblx0XHRcdC4uLmF1dG9tYXRpb24sXG5cdFx0XHR0YXJnZXQ6IGF1dG9tYXRpb24udGFyZ2V0LmtpbmQgPT09ICd3b3Jrc3BhY2UnXG5cdFx0XHRcdD8geyAuLi5hdXRvbWF0aW9uLnRhcmdldCwgZm9sZGVyVXJpOiBhdXRvbWF0aW9uLnRhcmdldC5mb2xkZXJVcmkudG9KU09OKCkgfVxuXHRcdFx0XHQ6IGF1dG9tYXRpb24udGFyZ2V0LFxuXHRcdH0pKSxcblx0XHRydW5zOiBbXSxcblx0fSk7XG59XG5cbmNsYXNzIEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdGJlZm9yZUdldEZvbGRlclNlc3Npb25UeXBlczogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZXNvbHZlRnJvbUNoYXRSZXNvdXJjZSA9IGZhbHNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZm9sZGVyU2Vzc2lvblR5cGVzOiByZWFkb25seSBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBxdWlja0NoYXRTZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElQcm92aWRlclNlc3Npb25UeXBlW10gPSBbXSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFNlc3Npb24oKTogSVNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tQ2hhdFJlc291cmNlID8gdW5kZWZpbmVkIDogdGhpcy5zZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZSgpOiB7IHNlc3Npb246IElTZXNzaW9uOyBjaGF0OiBJQ2hhdCB9IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbUNoYXRSZXNvdXJjZSAmJiB0aGlzLnNlc3Npb25cblx0XHRcdD8geyBzZXNzaW9uOiB0aGlzLnNlc3Npb24sIGNoYXQ6IHVwY2FzdFBhcnRpYWw8SUNoYXQ+KHsgcmVzb3VyY2U6IENIQVRfUkVTT1VSQ0UgfSkgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0dGhpcy5iZWZvcmVHZXRGb2xkZXJTZXNzaW9uVHlwZXM/LigpO1xuXHRcdHJldHVybiBbLi4udGhpcy5mb2xkZXJTZXNzaW9uVHlwZXNdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKCk6IElQcm92aWRlclNlc3Npb25UeXBlW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5xdWlja0NoYXRTZXNzaW9uVHlwZXNdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGVuYWJsZWQgPSB0cnVlKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HLCBlbmFibGVkKTtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKG9wdGlvbnM/OiB7IHJlYWRvbmx5IHF1aWNrQ2hhdD86IGJvb2xlYW47IHJlYWRvbmx5IHdvcmtzcGFjZT86IFVSSSB9KTogSVNlc3Npb24ge1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBvcHRpb25zPy53b3Jrc3BhY2UgPT09IHVuZGVmaW5lZFxuXHRcdD8gdW5kZWZpbmVkXG5cdFx0OiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uV29ya3NwYWNlPih7IHVyaTogb3B0aW9ucy53b3Jrc3BhY2UgfSk7XG5cdHJldHVybiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0cmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdHNlc3Npb25UeXBlOiAnY29waWxvdCcsXG5cdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUod29ya3NwYWNlKSxcblx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnM/LnF1aWNrQ2hhdCA9PT0gdHJ1ZSksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBwcm92aWRlclNlc3Npb25UeXBlKHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGVJZDogc3RyaW5nLCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiA9IGZhbHNlKTogSVByb3ZpZGVyU2Vzc2lvblR5cGUge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGU6IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25UeXBlPih7IGlkOiBzZXNzaW9uVHlwZUlkLCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiB9KSxcblx0fTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gaW52b2tlKHRvb2w6IElUb29sSW1wbCwgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHNlc3Npb25SZXNvdXJjZSA9IFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgc2VsZWN0ZWRDdXN0b21CdXR0b24/OiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE/OiBJVG9vbEludm9jYXRpb25bJ3Rvb2xTcGVjaWZpY0RhdGEnXSk6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0cmV0dXJuIHRvb2wuaW52b2tlKHtcblx0XHRjYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdHRvb2xJZDogJ3Rvb2wtMScsXG5cdFx0cGFyYW1ldGVycyxcblx0XHRjb250ZXh0OiB7IHNlc3Npb25SZXNvdXJjZSB9LFxuXHRcdHNlbGVjdGVkQ3VzdG9tQnV0dG9uLFxuXHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdH0sIGFzeW5jICgpID0+IDAsIHByb2dyZXNzLCB0b2tlbik7XG59XG5cbmZ1bmN0aW9uIGdldFRleHQocmVzdWx0OiBJVG9vbFJlc3VsdCk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnQgPSByZXN1bHQuY29udGVudFswXTtcblx0aWYgKCFwYXJ0IHx8IHBhcnQua2luZCAhPT0gJ3RleHQnKSB7XG5cdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGEgdGV4dCB0b29sIHJlc3VsdC4nKTtcblx0fVxuXHRyZXR1cm4gcGFydC52YWx1ZTtcbn1cblxuc3VpdGUoJ0F1dG9tYXRpb25Ub29scycsICgpID0+IHtcblx0Y29uc3QgdGVhcmRvd24gPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTdG9yYWdlQmFja2VkU2VydmljZShyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlOiBJQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKTogQXV0b21hdGlvblNlcnZpY2Uge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gdGVhcmRvd24uYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGlmIChyYXcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQVVUT01BVElPTl9TVE9SQUdFX0tFWSwgcmF3LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZWFyZG93bi5hZGQobmV3IEF1dG9tYXRpb25TZXJ2aWNlKHN0b3JhZ2VTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSkpO1xuXHR9XG5cblx0dGVzdCgndG9vbCBkYXRhIGlzIGdhdGVkIGJ5IEFJIGFuZCBBdXRvbWF0aW9ucyBjb250ZXh0IGtleXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHJ1bkRhdGEgPSBuZXcgUnVuQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBSZWNvcmRpbmdBdXRvbWF0aW9uUnVubmVyKGF1dG9tYXRpb25TZXJ2aWNlKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBsaXN0RGF0YSA9IG5ldyBMaXN0QXV0b21hdGlvbnNUb29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBkZWxldGVEYXRhID0gbmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VG9vbERhdGEoKTtcblx0XHRjb25zdCBjb25maWd1cmVEYXRhID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UodW5kZWZpbmVkKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCkuZ2V0VG9vbERhdGEoKTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZSA9ICh0b29sOiB0eXBlb2YgbGlzdERhdGEpID0+IHRvb2wud2hlbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbbGlzdERhdGEsIGNvbmZpZ3VyZURhdGEsIHJ1bkRhdGEsIGRlbGV0ZURhdGFdLm1hcCh0b29sID0+ICh7XG5cdFx0XHRpZDogdG9vbC5pZCxcblx0XHRcdHJlZmVyZW5jZU5hbWU6IHRvb2wudG9vbFJlZmVyZW5jZU5hbWUsXG5cdFx0XHRhaUVuYWJsZWRHYXRlOiBzZXJpYWxpemUodG9vbCkuaW5jbHVkZXMoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQua2V5KSxcblx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHNlcmlhbGl6ZSh0b29sKS5pbmNsdWRlcyhDaGF0QXV0b21hdGlvbnNFbmFibGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0cnVuc0luV29ya3NwYWNlOiB0b29sLnJ1bnNJbldvcmtzcGFjZSxcblx0XHR9KSksIFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IExpc3RBdXRvbWF0aW9uc1Rvb2xJZCxcblx0XHRcdFx0cmVmZXJlbmNlTmFtZTogJ2xpc3RBdXRvbWF0aW9ucycsXG5cdFx0XHRcdGFpRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdHJ1bnNJbldvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogQ29uZmlndXJlQXV0b21hdGlvblRvb2xJZCxcblx0XHRcdFx0cmVmZXJlbmNlTmFtZTogJ2NvbmZpZ3VyZUF1dG9tYXRpb24nLFxuXHRcdFx0XHRhaUVuYWJsZWRHYXRlOiB0cnVlLFxuXHRcdFx0XHRhdXRvbWF0aW9uc0VuYWJsZWRHYXRlOiB0cnVlLFxuXHRcdFx0XHRydW5zSW5Xb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFJ1bkF1dG9tYXRpb25Ub29sSWQsXG5cdFx0XHRcdHJlZmVyZW5jZU5hbWU6ICdydW5BdXRvbWF0aW9uJyxcblx0XHRcdFx0YWlFbmFibGVkR2F0ZTogdHJ1ZSxcblx0XHRcdFx0YXV0b21hdGlvbnNFbmFibGVkR2F0ZTogdHJ1ZSxcblx0XHRcdFx0cnVuc0luV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBEZWxldGVBdXRvbWF0aW9uVG9vbElkLFxuXHRcdFx0XHRyZWZlcmVuY2VOYW1lOiAnZGVsZXRlQXV0b21hdGlvbicsXG5cdFx0XHRcdGFpRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdGF1dG9tYXRpb25zRW5hYmxlZEdhdGU6IHRydWUsXG5cdFx0XHRcdHJ1bnNJbldvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXN0QXV0b21hdGlvbnMgcmV0dXJucyBzdGFibGUgSURzIGFuZCBlZGl0YWJsZSBmaWVsZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCB0b29sID0gbmV3IExpc3RBdXRvbWF0aW9uc1Rvb2wobmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSwge1xuXHRcdFx0YXV0b21hdGlvbnM6IFt7XG5cdFx0XHRcdGlkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0bmFtZTogJ0RhaWx5IHJldmlldycsXG5cdFx0XHRcdHByb21wdDogJ1JldmlldyB0aGUgcmVwb3NpdG9yeScsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDksIHNjaGVkdWxlTWludXRlOiAwLCBzY2hlZHVsZURheTogMSB9LFxuXHRcdFx0XHR0YXJnZXQ6IHtcblx0XHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0XHRmb2xkZXJVcmk6ICdmaWxlOi8vL3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Jyxcblx0XHRcdFx0XHRpc29sYXRpb246IHsga2luZDogJ2RlZmF1bHQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1vZGVsSWQ6ICdncHQtdGVzdCcsXG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogJ2RlZmF1bHQnLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IE5PVyxcblx0XHRcdFx0dXBkYXRlZEF0OiBOT1csXG5cdFx0XHRcdGxhc3RSdW5BdDogbnVsbCxcblx0XHRcdFx0bmV4dFJ1bkF0OiAnMjAyNi0wMS0wMlQwOTowMDowMC4wMDBaJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5BdXRvbWF0aW9uIGNvbmZpcm1zIGFuZCBzdGFydHMgYSBtYW51YWwgcnVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFthdXRvbWF0aW9uXSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFJlY29yZGluZ0F1dG9tYXRpb25SdW5uZXIoYXV0b21hdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgUnVuQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIHJ1bm5lciwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH07XG5cdFx0Y29uc3QgaW52b2NhdGlvbkNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHBhcmFtZXRlcnMsIFNFU1NJT05fUkVTT1VSQ0UsIGludm9jYXRpb25DYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdGludm9jYXRpb25DYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0Y29uc3QgcnVuVG9rZW5DYW5jZWxsZWRBZnRlckRpc3BhdGNoID0gcnVubmVyLnRva2Vuc1swXT8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0aW52b2NhdGlvbkNhbmNlbGxhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlOiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZT8udmFsdWUsXG5cdFx0XHRjYWxsczogcnVubmVyLmNhbGxzLFxuXHRcdFx0cnVuVG9rZW5DYW5jZWxsZWRBZnRlckRpc3BhdGNoLFxuXHRcdFx0cmVzdWx0OiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSksXG5cdFx0fSwge1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gQXV0b21hdGlvbj8nLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZTogJ1J1biAqKkRhaWx5IHJldmlldyoqIChgYXV0b21hdGlvbi0xYCkgbm93PyBUaGlzIHN0YXJ0cyBhIG5ldyBhZ2VudCBzZXNzaW9uIHVzaW5nIHRoZSBhdXRvbWF0aW9uXFwncyBjb25maWd1cmVkIHByb21wdCBhbmQgcGVybWlzc2lvbnMuJyxcblx0XHRcdGNhbGxzOiBbe1xuXHRcdFx0XHRhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnLFxuXHRcdFx0XHR0cmlnZ2VyOiAnbWFudWFsJyxcblx0XHRcdFx0bGVhZGVyV2luZG93SWQ6IDAsXG5cdFx0XHRcdGNhbmNlbGxlZDogZmFsc2UsXG5cdFx0XHR9XSxcblx0XHRcdHJ1blRva2VuQ2FuY2VsbGVkQWZ0ZXJEaXNwYXRjaDogZmFsc2UsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnc3RhcnRlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb246IHsgaWQ6ICdhdXRvbWF0aW9uLTEnLCBuYW1lOiAnRGFpbHkgcmV2aWV3JyB9LFxuXHRcdFx0XHRydW46IHtcblx0XHRcdFx0XHRpZDogJ3J1bi0xJyxcblx0XHRcdFx0XHRzdGF0dXM6ICdydW5uaW5nJyxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bkF1dG9tYXRpb24gcmVwb3J0cyB0aGUgYWN0aXZlIHJ1biB3aGVuIHRoZSBydW5uZXIgZGVjbGluZXMgdG8gY2xhaW0gaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRhdXRvbWF0aW9uU2VydmljZS5hZGRSdW4oe1xuXHRcdFx0aWQ6ICdhY3RpdmUtcnVuJyxcblx0XHRcdGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCxcblx0XHRcdHN0YXR1czogJ3J1bm5pbmcnLFxuXHRcdFx0dHJpZ2dlcjogJ21hbnVhbCcsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UudG9TdHJpbmcoKSxcblx0XHRcdHN0YXJ0ZWRBdDogTk9XLFxuXHRcdFx0bGVhZGVyV2luZG93SWQ6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgcnVubmVyID0gbmV3IFJlY29yZGluZ0F1dG9tYXRpb25SdW5uZXIoYXV0b21hdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgUnVuQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIHJ1bm5lciwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH07XG5cblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uISh7XG5cdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtMScsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCBwYXJhbWV0ZXJzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29uZmlybWF0aW9uOiBwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdC8vIFRoZSBydW5uZXIgb3ducyB0aGUgY2xhaW0sIHNvIHRoZSB0b29sIHN0aWxsIGRpc3BhdGNoZXMgYW5kIGxldHMgaXQgZGVjbGluZS5cblx0XHRcdHJ1bnNDcmVhdGVkOiBhdXRvbWF0aW9uU2VydmljZS5ydW5zLmdldCgpLmxlbmd0aCxcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdH0sIHtcblx0XHRcdGNvbmZpcm1hdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0cnVuc0NyZWF0ZWQ6IDEsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnYWxyZWFkeV9ydW5uaW5nJyxcblx0XHRcdFx0YXV0b21hdGlvbjogeyBpZDogJ2F1dG9tYXRpb24tMScsIG5hbWU6ICdEYWlseSByZXZpZXcnIH0sXG5cdFx0XHRcdHJ1bjoge1xuXHRcdFx0XHRcdGlkOiAnYWN0aXZlLXJ1bicsXG5cdFx0XHRcdFx0c3RhdHVzOiAncnVubmluZycsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLnRvU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdydW5BdXRvbWF0aW9uIHJlcG9ydHMgd2hlbiBkaXNwYXRjaCBkb2VzIG5vdCBzdGFydCBhIHJ1bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBSZWNvcmRpbmdBdXRvbWF0aW9uUnVubmVyKGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRydW5uZXIubm90U3RhcnRlZCA9IHsga2luZDogJ25vdFN0YXJ0ZWQnLCByZWFzb246ICd0YXJnZXRVbmF2YWlsYWJsZScgfTtcblx0XHRjb25zdCB0b29sID0gbmV3IFJ1bkF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBydW5uZXIsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvcjogcmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGNhbGxzOiBydW5uZXIuY2FsbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnQXV0b21hdGlvbiBcImF1dG9tYXRpb24tMVwiIGRpZCBub3Qgc3RhcnQuIEl0cyBjb25maWd1cmVkIGFnZW50IGlzIHVuYXZhaWxhYmxlLicsXG5cdFx0XHRjYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiBwcm92aWRlcyBEZWxldGUgYW5kIENhbmNlbCBjb25maXJtYXRpb24gb3B0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCB9O1xuXG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBtZXNzYWdlID0gcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCBwYXJhbWV0ZXJzLCBTRVNTSU9OX1JFU09VUkNFLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnZGVsZXRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBwcmVwYXJlZD8uY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZTogdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZSA6IG1lc3NhZ2U/LnZhbHVlLFxuXHRcdFx0YWxsb3dBdXRvQ29uZmlybTogcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hbGxvd0F1dG9Db25maXJtLFxuXHRcdFx0b3B0aW9uczogcHJlcGFyZWQ/LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5jdXN0b21PcHRpb25zLFxuXHRcdFx0ZGVsZXRlZDogYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlZCxcblx0XHRcdGF1dG9tYXRpb25zOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSxcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdH0sIHtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnRGVsZXRlIEF1dG9tYXRpb24/Jyxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2U6ICdEZWxldGUgKipEYWlseSByZXZpZXcqKiAoYGF1dG9tYXRpb24tMWApPyBJdHMgc2F2ZWQgY29uZmlndXJhdGlvbiBhbmQgcnVuIGhpc3Rvcnkgd2lsbCBiZSBwZXJtYW5lbnRseSByZW1vdmVkLiBSdW5zIGFscmVhZHkgaW4gZmxpZ2h0IHdpbGwgY29udGludWUuJyxcblx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0eyBpZDogJ2RlbGV0ZScsIGxhYmVsOiAnRGVsZXRlJywga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH0sXG5cdFx0XHRcdHsgaWQ6ICdjYW5jZWwnLCBsYWJlbDogJ0NhbmNlbCcsIGtpbmQ6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSB9LFxuXHRcdFx0XSxcblx0XHRcdGRlbGV0ZWQ6IFsnYXV0b21hdGlvbi0xJ10sXG5cdFx0XHRhdXRvbWF0aW9uczogW10sXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnZGVsZXRlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb246IHsgaWQ6ICdhdXRvbWF0aW9uLTEnLCBuYW1lOiAnRGFpbHkgcmV2aWV3JyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiByZWplY3RzIHN0YWxlIElEcyBiZWZvcmUgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7IGF1dG9tYXRpb25JZDogJ21pc3NpbmcnIH07XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uISh7XG5cdFx0XHRcdHBhcmFtZXRlcnMsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHQvQXV0b21hdGlvbiBcIm1pc3NpbmdcIiBkb2VzIG5vdCBleGlzdC8sXG5cdFx0KTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycywgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ2RlbGV0ZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvcjogcmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3I6ICdBdXRvbWF0aW9uIFwibWlzc2luZ1wiIGRvZXMgbm90IGV4aXN0LiBDYWxsIGxpc3RBdXRvbWF0aW9ucyB0byByZWZyZXNoIHRoZSBhdmFpbGFibGUgSURzLicsXG5cdFx0XHRkZWxldGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiBDYW5jZWwgb3B0aW9uIG1ha2VzIG5vIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvbiA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2F1dG9tYXRpb25dKTtcblx0XHRjb25zdCB0b29sID0gbmV3IERlbGV0ZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7IGF1dG9tYXRpb25JZDogYXV0b21hdGlvbi5pZCB9LCBTRVNTSU9OX1JFU09VUkNFLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnY2FuY2VsJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdFx0ZGVsZXRlZDogYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlZCxcblx0XHRcdGF1dG9tYXRpb25zOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIHdhcyBub3QgZGVsZXRlZC4nLFxuXHRcdFx0fSxcblx0XHRcdGRlbGV0ZWQ6IFtdLFxuXHRcdFx0YXV0b21hdGlvbnM6IFthdXRvbWF0aW9uXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiBydW5zIHdpdGhvdXQgYSBjdXN0b20gYnV0dG9uIGFmdGVyIGFwcHJvdmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFthdXRvbWF0aW9uXSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBEZWxldGVBdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UoXG5cdFx0XHR0b29sLFxuXHRcdFx0eyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQgfSxcblx0XHRcdFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdFx0ZGVsZXRlZDogYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlZCxcblx0XHRcdGF1dG9tYXRpb25zOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnZGVsZXRlZCcsXG5cdFx0XHRcdGF1dG9tYXRpb246IHsgaWQ6IGF1dG9tYXRpb24uaWQsIG5hbWU6IGF1dG9tYXRpb24ubmFtZSB9LFxuXHRcdFx0fSxcblx0XHRcdGRlbGV0ZWQ6IFthdXRvbWF0aW9uLmlkXSxcblx0XHRcdGF1dG9tYXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiBjYW5jZWxsYXRpb24gbWFrZXMgbm8gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBEZWxldGVBdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgeyBhdXRvbWF0aW9uSWQ6IGF1dG9tYXRpb24uaWQgfSwgU0VTU0lPTl9SRVNPVVJDRSwgdG9rZW5Tb3VyY2UudG9rZW4sICdkZWxldGUnKTtcblx0XHR0b2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdDogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLFxuXHRcdFx0ZGVsZXRlZDogYXV0b21hdGlvblNlcnZpY2UuZGVsZXRlZCxcblx0XHRcdGF1dG9tYXRpb25zOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3RhdHVzOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0bWVzc2FnZTogJ1RoZSBhdXRvbWF0aW9uIHdhcyBub3QgZGVsZXRlZC4nLFxuXHRcdFx0fSxcblx0XHRcdGRlbGV0ZWQ6IFtdLFxuXHRcdFx0YXV0b21hdGlvbnM6IFthdXRvbWF0aW9uXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBwcmVwYXJlcyBub3JtYWwgY3JlYXRlIGFuZCB1cGRhdGUgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0bmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbZXhpc3RpbmddKSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShjcmVhdGVTZXNzaW9uKHsgd29ya3NwYWNlOiBGT0xERVIgfSkpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXHRcdGNvbnN0IGNyZWF0ZVByZXBhcmVkID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24hKHtcblx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0bmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0cHJvbXB0OiAnUmV2aWV3IG9wZW4gcHVsbCByZXF1ZXN0cycsXG5cdFx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknIH0sXG5cdFx0XHR9LFxuXHRcdFx0dG9vbENhbGxJZDogJ2NyZWF0ZS1jYWxsJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgdXBkYXRlUHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVyczogeyBhdXRvbWF0aW9uSWQ6IGV4aXN0aW5nLmlkLCBuYW1lOiAnVXBkYXRlZCByZXZpZXcnIH0sXG5cdFx0XHR0b29sQ2FsbElkOiAndXBkYXRlLWNhbGwnLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogU0VTU0lPTl9SRVNPVVJDRSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlOiB7XG5cdFx0XHRcdHRpdGxlOiBjcmVhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHR5cGVvZiBjcmVhdGVQcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8ubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQ/IGNyZWF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2Vcblx0XHRcdFx0XHQ6IGNyZWF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlPy52YWx1ZSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogY3JlYXRlUHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGU6IHtcblx0XHRcdFx0dGl0bGU6IHVwZGF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSxcblx0XHRcdFx0bWVzc2FnZTogdHlwZW9mIHVwZGF0ZVByZXBhcmVkLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdD8gdXBkYXRlUHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMubWVzc2FnZVxuXHRcdFx0XHRcdDogdXBkYXRlUHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXM/Lm1lc3NhZ2U/LnZhbHVlLFxuXHRcdFx0XHRleHBlY3RlZElkOiB1cGRhdGVQcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnYXV0b21hdGlvbkNvbmZpZ3VyYXRpb24nXG5cdFx0XHRcdFx0PyB1cGRhdGVQcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhLmV4cGVjdGVkQXV0b21hdGlvbklkXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZToge1xuXHRcdFx0XHR0aXRsZTogJ0NyZWF0ZSBBdXRvbWF0aW9uPycsXG5cdFx0XHRcdG1lc3NhZ2U6ICdDcmVhdGUgdGhlIGF1dG9tYXRpb24gKipNb3JuaW5nIHJldmlldyoqPycsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR1cGRhdGU6IHtcblx0XHRcdFx0dGl0bGU6ICdVcGRhdGUgQXV0b21hdGlvbj8nLFxuXHRcdFx0XHRtZXNzYWdlOiAnQXBwbHkgdGhlIHByb3Bvc2VkIGNoYW5nZXMgdG8gKipEYWlseSByZXZpZXcqKiAoYGF1dG9tYXRpb24tMWApPycsXG5cdFx0XHRcdGV4cGVjdGVkSWQ6IGV4aXN0aW5nLmlkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBjcmVhdGVzIGZyb20gdGhlIGludm9raW5nIGNoYXQgdGFyZ2V0IGFuZCByZXR1cm5zIGNsaWNrYWJsZSByZXN1bHQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB0YXJnZXQ6IEF1dG9tYXRpb25UYXJnZXQgPSB7XG5cdFx0XHRraW5kOiAncXVpY2tDaGF0Jyxcblx0XHRcdHByb3ZpZGVySWQ6ICdsb2NhbC1hZ2VudC1ob3N0Jyxcblx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Jyxcblx0XHR9O1xuXHRcdGNvbnN0IHNjaGVkdWxlOiBJQXV0b21hdGlvblNjaGVkdWxlID0geyBpbnRlcnZhbDogJ2RhaWx5Jywgc2NoZWR1bGVIb3VyOiA4LCBzY2hlZHVsZU1pbnV0ZTogMzAsIHNjaGVkdWxlRGF5OiAxIH07XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGNyZWF0ZVNlc3Npb24oeyBxdWlja0NoYXQ6IHRydWUgfSksIHRydWUpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHtcblx0XHRcdG5hbWU6ICdNb3JuaW5nIHJldmlldycsXG5cdFx0XHRwcm9tcHQ6ICdSZXZpZXcgb3BlbiBwdWxsIHJlcXVlc3RzJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnZGFpbHknLCBzY2hlZHVsZUhvdXI6IDgsIHNjaGVkdWxlTWludXRlOiAzMCB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHR9LCBDSEFUX1JFU09VUkNFKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlZDogYXV0b21hdGlvblNlcnZpY2UuY3JlYXRlZCxcblx0XHRcdHN0YXR1czogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLnN0YXR1cyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWQ6IFt7XG5cdFx0XHRcdG5hbWU6ICdNb3JuaW5nIHJldmlldycsXG5cdFx0XHRcdHByb21wdDogJ1JldmlldyBvcGVuIHB1bGwgcmVxdWVzdHMnLFxuXHRcdFx0XHRzY2hlZHVsZSxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0fV0sXG5cdFx0XHRzdGF0dXM6ICdjcmVhdGVkJyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmVkJyxcblx0XHRcdFx0YXV0b21hdGlvbklkOiAnY3JlYXRlZC1hdXRvbWF0aW9uJyxcblx0XHRcdFx0YXV0b21hdGlvbk5hbWU6ICdNb3JuaW5nIHJldmlldycsXG5cdFx0XHRcdG9wZXJhdGlvbjogJ2NyZWF0ZWQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBhcHBsaWVzIGEgcGFydGlhbCBndWFyZGVkIHVwZGF0ZSBhbmQgcmV0dXJucyBjbGlja2FibGUgcmVzdWx0IGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBuZXcgRmFrZUF1dG9tYXRpb25TZXJ2aWNlKFtleGlzdGluZ10pO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgQ29uZmlndXJlQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSh1bmRlZmluZWQpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSB7XG5cdFx0XHRhdXRvbWF0aW9uSWQ6IGV4aXN0aW5nLmlkLFxuXHRcdFx0bmFtZTogJ1VwZGF0ZWQgcmV2aWV3Jyxcblx0XHRcdHNjaGVkdWxlOiB7IHNjaGVkdWxlTWludXRlOiA0NSB9LFxuXHRcdFx0bW9kZWxJZDogbnVsbCxcblx0XHRcdG1vZGU6IG51bGwsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IG51bGwsXG5cdFx0fTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uISh7XG5cdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0dG9vbENhbGxJZDogJ3VwZGF0ZS1jYWxsJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycywgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdW5kZWZpbmVkLCBwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dXBkYXRlZDogYXV0b21hdGlvblNlcnZpY2UudXBkYXRlZCxcblx0XHRcdHN0YXR1czogSlNPTi5wYXJzZShnZXRUZXh0KHJlc3VsdCkpLnN0YXR1cyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdH0sIHtcblx0XHRcdHVwZGF0ZWQ6IFt7XG5cdFx0XHRcdGlkOiBleGlzdGluZy5pZCxcblx0XHRcdFx0cGF0Y2g6IHtcblx0XHRcdFx0XHRuYW1lOiAnVXBkYXRlZCByZXZpZXcnLFxuXHRcdFx0XHRcdHNjaGVkdWxlOiB7IC4uLmV4aXN0aW5nLnNjaGVkdWxlLCBzY2hlZHVsZU1pbnV0ZTogNDUgfSxcblx0XHRcdFx0XHRtb2RlbElkOiBudWxsLFxuXHRcdFx0XHRcdG1vZGU6IG51bGwsXG5cdFx0XHRcdFx0cGVybWlzc2lvbkxldmVsOiBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRzdGF0dXM6ICd1cGRhdGVkJyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0a2luZDogJ2F1dG9tYXRpb25Db25maWd1cmVkJyxcblx0XHRcdFx0YXV0b21hdGlvbklkOiBleGlzdGluZy5pZCxcblx0XHRcdFx0YXV0b21hdGlvbk5hbWU6ICdVcGRhdGVkIHJldmlldycsXG5cdFx0XHRcdG9wZXJhdGlvbjogJ3VwZGF0ZWQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiByZWplY3RzIGVkaXRhYmxlIGNoYW5nZXMgbWFkZSB3aGlsZSBhd2FpdGluZyBhcHByb3ZhbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IGNyZWF0ZUF1dG9tYXRpb24oKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2V4aXN0aW5nXSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHVuZGVmaW5lZCksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IHsgYXV0b21hdGlvbklkOiBleGlzdGluZy5pZCwgbmFtZTogJ1Byb3Bvc2VkIG5hbWUnIH07XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbiEoe1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd1cGRhdGUtY2FsbCcsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBTRVNTSU9OX1JFU09VUkNFLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLnNldChbXG5cdFx0XHR7IC4uLmV4aXN0aW5nLCBwcm9tcHQ6ICdDaGFuZ2VkIGluIGFub3RoZXIgd2luZG93JywgdXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMTowMC4wMDBaJyB9LFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwgcGFyYW1ldGVycywgU0VTU0lPTl9SRVNPVVJDRSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdW5kZWZpbmVkLCBwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHR1cGRhdGVkOiBhdXRvbWF0aW9uU2VydmljZS51cGRhdGVkLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnQXV0b21hdGlvbiBcImF1dG9tYXRpb24tMVwiIGNoYW5nZWQgYmVmb3JlIHRoZSB1cGRhdGUgd2FzIGFwcGxpZWQuIENhbGwgbGlzdEF1dG9tYXRpb25zIHRvIHJlZnJlc2ggaXQgYmVmb3JlIHByb3Bvc2luZyBuZXcgY2hhbmdlcy4gTm8gY2hhbmdlcyB3ZXJlIG1hZGUuJyxcblx0XHRcdHVwZGF0ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVBdXRvbWF0aW9uIHBlcm1pdHMgcnVudGltZSBtZXRhZGF0YSBjaGFuZ2VzIHdoaWxlIGF3YWl0aW5nIGFwcHJvdmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY3JlYXRlQXV0b21hdGlvbigpO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gbmV3IEZha2VBdXRvbWF0aW9uU2VydmljZShbZXhpc3RpbmddKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UodW5kZWZpbmVkKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0geyBhdXRvbWF0aW9uSWQ6IGV4aXN0aW5nLmlkLCBuYW1lOiAnUHJvcG9zZWQgbmFtZScgfTtcblx0XHRjb25zdCBwcmVwYXJlZCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uISh7XG5cdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0dG9vbENhbGxJZDogJ3VwZGF0ZS1jYWxsJyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFNFU1NJT05fUkVTT1VSQ0UsXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuc2V0KFt7XG5cdFx0XHQuLi5leGlzdGluZyxcblx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDE6MDAuMDAwWicsXG5cdFx0XHRsYXN0UnVuQXQ6ICcyMDI2LTAxLTAxVDAwOjAxOjAwLjAwMFonLFxuXHRcdFx0bmV4dFJ1bkF0OiAnMjAyNi0wMS0wMlQwOTowMDowMC4wMDBaJyxcblx0XHR9XSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCBwYXJhbWV0ZXJzLCBTRVNTSU9OX1JFU09VUkNFLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB1bmRlZmluZWQsIHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKS5zdGF0dXMsXG5cdFx0XHR1cGRhdGVkOiBhdXRvbWF0aW9uU2VydmljZS51cGRhdGVkLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogJ3VwZGF0ZWQnLFxuXHRcdFx0dXBkYXRlZDogW3sgaWQ6IGV4aXN0aW5nLmlkLCBwYXRjaDogeyBuYW1lOiAnUHJvcG9zZWQgbmFtZScgfSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiB2YWxpZGF0ZXMgZXhwbGljaXQgdGFyZ2V0cyBiZWZvcmUgd3JpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdFtwcm92aWRlclNlc3Npb25UeXBlKCdsb2NhbC1hZ2VudC1ob3N0JywgJ2NvcGlsb3QnLCBmYWxzZSldLFxuXHRcdFx0KSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7XG5cdFx0XHRuYW1lOiAnSW52YWxpZCB3b3JrdHJlZScsXG5cdFx0XHRwcm9tcHQ6ICdEbyBub3Qgc2F2ZScsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcgfSxcblx0XHRcdHRhcmdldDoge1xuXHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0Zm9sZGVyVXJpOiBGT0xERVIudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLFxuXHRcdFx0XHRzZXNzaW9uVHlwZUlkOiAnY29waWxvdCcsXG5cdFx0XHRcdGlzb2xhdGlvbjogJ3dvcmt0cmVlJyxcblx0XHRcdFx0YnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvcjogcmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGNyZWF0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZWQsXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3I6ICdTZXNzaW9uIHR5cGUgXCJjb3BpbG90XCIgZG9lcyBub3Qgc3VwcG9ydCB3b3JrdHJlZSBpc29sYXRpb24uJyxcblx0XHRcdGNyZWF0ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVBdXRvbWF0aW9uIHJlY2hlY2tzIGNhbmNlbGxhdGlvbiBpbW1lZGlhdGVseSBiZWZvcmUgd3JpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdGNvbnN0IHRvb2wgPSBuZXcgQ29uZmlndXJlQXV0b21hdGlvblRvb2woXG5cdFx0XHRhdXRvbWF0aW9uU2VydmljZSxcblx0XHRcdG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShjcmVhdGVTZXNzaW9uKHsgd29ya3NwYWNlOiBGT0xERVIgfSkpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHtcblx0XHRcdG5hbWU6ICdDYW5jZWxsZWQnLFxuXHRcdFx0cHJvbXB0OiAnRG8gbm90IHNhdmUnLFxuXHRcdFx0c2NoZWR1bGU6IHsgaW50ZXJ2YWw6ICdtYW51YWwnIH0sXG5cdFx0fSwgU0VTU0lPTl9SRVNPVVJDRSwgdG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdHRva2VuU291cmNlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0OiBKU09OLnBhcnNlKGdldFRleHQocmVzdWx0KSksXG5cdFx0XHRjcmVhdGVkOiBhdXRvbWF0aW9uU2VydmljZS5jcmVhdGVkLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdGF0dXM6ICdjYW5jZWxsZWQnLFxuXHRcdFx0XHRtZXNzYWdlOiAnVGhlIGF1dG9tYXRpb24gY2hhbmdlIHdhcyBjYW5jZWxsZWQuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLicsXG5cdFx0XHR9LFxuXHRcdFx0Y3JlYXRlZDogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyZUF1dG9tYXRpb24gcmVjaGVja3MgdGhlIGZlYXR1cmUgc2V0dGluZyBpbW1lZGlhdGVseSBiZWZvcmUgd3JpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSA9IG5ldyBGYWtlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0W3Byb3ZpZGVyU2Vzc2lvblR5cGUoJ2xvY2FsLWFnZW50LWhvc3QnLCAnY29waWxvdCcpXSxcblx0XHQpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYmVmb3JlR2V0Rm9sZGVyU2Vzc2lvblR5cGVzID0gKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkcsIGZhbHNlKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKGF1dG9tYXRpb25TZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnZva2UodG9vbCwge1xuXHRcdFx0bmFtZTogJ0Rpc2FibGVkJyxcblx0XHRcdHByb21wdDogJ0RvIG5vdCBzYXZlJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJyB9LFxuXHRcdFx0dGFyZ2V0OiB7XG5cdFx0XHRcdGtpbmQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRmb2xkZXJVcmk6IEZPTERFUi50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRcdHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Jyxcblx0XHRcdFx0aXNvbGF0aW9uOiAnZGVmYXVsdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlcnJvcjogcmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGNyZWF0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmNyZWF0ZWQsXG5cdFx0fSwge1xuXHRcdFx0ZXJyb3I6ICdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyxcblx0XHRcdGNyZWF0ZWQ6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVBdXRvbWF0aW9uIGNhbmNlbGxhdGlvbiBkdXJpbmcgYW4gYXV0aG9yaXRhdGl2ZSByZWFkIG1ha2VzIG5vIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlID0gbmV3IENvbnRyb2xsYWJsZUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSh1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHJlYWRCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5yZWFkQmFycmllciA9IHJlYWRCYXJyaWVyO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TZXJ2aWNlID0gY3JlYXRlU3RvcmFnZUJhY2tlZFNlcnZpY2UodW5kZWZpbmVkLCBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHRva2VuU291cmNlID0gdGVhcmRvd24uYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoY3JlYXRlU2Vzc2lvbih7IHdvcmtzcGFjZTogRk9MREVSIH0pKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdFByb21pc2UgPSBpbnZva2UodG9vbCwge1xuXHRcdFx0bmFtZTogJ0NhbmNlbGxlZCcsXG5cdFx0XHRwcm9tcHQ6ICdEbyBub3Qgc2F2ZScsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcgfSxcblx0XHR9LCBTRVNTSU9OX1JFU09VUkNFLCB0b2tlblNvdXJjZS50b2tlbik7XG5cdFx0YXdhaXQgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLnJlYWRTdGFydGVkLnA7XG5cdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcmVhZEJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHRcdGNvbXBhcmVBbmRTd2FwQ2FsbHM6IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5jb21wYXJlQW5kU3dhcENhbGxzLFxuXHRcdFx0YXV0b21hdGlvbnM6IGF1dG9tYXRpb25TZXJ2aWNlLmF1dG9tYXRpb25zLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdGF0dXM6ICdjYW5jZWxsZWQnLFxuXHRcdFx0XHRtZXNzYWdlOiAnVGhlIGF1dG9tYXRpb24gY2hhbmdlIHdhcyBjYW5jZWxsZWQuIE5vIGNoYW5nZXMgd2VyZSBtYWRlLicsXG5cdFx0XHR9LFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogMCxcblx0XHRcdGF1dG9tYXRpb25zOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQXV0b21hdGlvbiBjYW5jZWxsYXRpb24gZHVyaW5nIGFuIGF1dGhvcml0YXRpdmUgcmVhZCBtYWtlcyBubyBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgcmF3ID0gc2VyaWFsaXplQXV0b21hdGlvbkxlZGdlcihbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSA9IG5ldyBDb250cm9sbGFibGVBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UocmF3KTtcblx0XHRjb25zdCByZWFkQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UucmVhZEJhcnJpZXIgPSByZWFkQmFycmllcjtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IGNyZWF0ZVN0b3JhZ2VCYWNrZWRTZXJ2aWNlKHJhdywgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IHRlYXJkb3duLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBEZWxldGVBdXRvbWF0aW9uVG9vbChhdXRvbWF0aW9uU2VydmljZSwgY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gaW52b2tlKHRvb2wsIHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkIH0sIFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuU291cmNlLnRva2VuLCAnZGVsZXRlJyk7XG5cdFx0YXdhaXQgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLnJlYWRTdGFydGVkLnA7XG5cdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0YXdhaXQgcmVhZEJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKSxcblx0XHRcdGNvbXBhcmVBbmRTd2FwQ2FsbHM6IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5jb21wYXJlQW5kU3dhcENhbGxzLFxuXHRcdFx0YXV0b21hdGlvbklkczogYXV0b21hdGlvblNlcnZpY2UuYXV0b21hdGlvbnMuZ2V0KCkubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQpLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdGF0dXM6ICdjYW5jZWxsZWQnLFxuXHRcdFx0XHRtZXNzYWdlOiAnVGhlIGF1dG9tYXRpb24gd2FzIG5vdCBkZWxldGVkLicsXG5cdFx0XHR9LFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogMCxcblx0XHRcdGF1dG9tYXRpb25JZHM6IFthdXRvbWF0aW9uLmlkXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiBkaXNhYmxlbWVudCBkdXJpbmcgYSBDQVMgY29uZmxpY3Qgc3RvcHMgYmVmb3JlIHJldHJ5aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBjcmVhdGVBdXRvbWF0aW9uKCk7XG5cdFx0Y29uc3QgcmF3ID0gc2VyaWFsaXplQXV0b21hdGlvbkxlZGdlcihbYXV0b21hdGlvbl0pO1xuXHRcdGNvbnN0IGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSA9IG5ldyBDb250cm9sbGFibGVBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UocmF3KTtcblx0XHRhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UubmV4dENvbmZsaWN0VmFsdWUgPSBzZXJpYWxpemVBdXRvbWF0aW9uTGVkZ2VyKFthdXRvbWF0aW9uXSwgMik7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS5iZWZvcmVDb21wYXJlQW5kU3dhcCA9ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENIQVRfQVVUT01BVElPTlNfRU5BQkxFRF9TRVRUSU5HLCBmYWxzZSk7XG5cdFx0Y29uc3QgYXV0b21hdGlvblNlcnZpY2UgPSBjcmVhdGVTdG9yYWdlQmFja2VkU2VydmljZShyYXcsIGF1dG9tYXRpb25TdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdG9vbCA9IG5ldyBDb25maWd1cmVBdXRvbWF0aW9uVG9vbChcblx0XHRcdGF1dG9tYXRpb25TZXJ2aWNlLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHVuZGVmaW5lZCksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHsgYXV0b21hdGlvbklkOiBhdXRvbWF0aW9uLmlkLCBuYW1lOiAnTXVzdCBub3QgY29tbWl0JyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXJyb3I6IHJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRjb21wYXJlQW5kU3dhcENhbGxzOiBhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuY29tcGFyZUFuZFN3YXBDYWxscyxcblx0XHRcdGF1dG9tYXRpb25OYW1lOiBhdXRvbWF0aW9uU2VydmljZS5nZXRBdXRvbWF0aW9uKGF1dG9tYXRpb24uaWQpPy5uYW1lLFxuXHRcdH0sIHtcblx0XHRcdGVycm9yOiAnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicsXG5cdFx0XHRjb21wYXJlQW5kU3dhcENhbGxzOiAxLFxuXHRcdFx0YXV0b21hdGlvbk5hbWU6IGF1dG9tYXRpb24ubmFtZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlQXV0b21hdGlvbiByZXBvcnRzIHN1Y2Nlc3Mgd2hlbiBjYW5jZWxsYXRpb24gY3Jvc3NlcyBhIGNvbW1pdHRlZCBDQVMgYm91bmRhcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlID0gbmV3IENvbnRyb2xsYWJsZUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSh1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHRva2VuU291cmNlID0gdGVhcmRvd24uYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRhdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2UuYmVmb3JlQ29tcGFyZUFuZFN3YXAgPSAoKSA9PiB0b2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IGNyZWF0ZVN0b3JhZ2VCYWNrZWRTZXJ2aWNlKHVuZGVmaW5lZCwgYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoY3JlYXRlU2Vzc2lvbih7IHdvcmtzcGFjZTogRk9MREVSIH0pKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7XG5cdFx0XHRuYW1lOiAnQ29tbWl0dGVkJyxcblx0XHRcdHByb21wdDogJ1NhdmUgb25jZSBDQVMgc3RhcnRzJyxcblx0XHRcdHNjaGVkdWxlOiB7IGludGVydmFsOiAnbWFudWFsJyB9LFxuXHRcdH0sIFNFU1NJT05fUkVTT1VSQ0UsIHRva2VuU291cmNlLnRva2VuKTtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBKU09OLnBhcnNlKGF1dG9tYXRpb25TdG9yYWdlU2VydmljZS52YWx1ZSEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IEpTT04ucGFyc2UoZ2V0VGV4dChyZXN1bHQpKS5zdGF0dXMsXG5cdFx0XHRjYW5jZWxsZWQ6IHRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLFxuXHRcdFx0Y29tcGFyZUFuZFN3YXBDYWxsczogYXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlLmNvbXBhcmVBbmRTd2FwQ2FsbHMsXG5cdFx0XHRpbk1lbW9yeU5hbWVzOiBhdXRvbWF0aW9uU2VydmljZS5hdXRvbWF0aW9ucy5nZXQoKS5tYXAoYXV0b21hdGlvbiA9PiBhdXRvbWF0aW9uLm5hbWUpLFxuXHRcdFx0cGVyc2lzdGVkTmFtZXM6IHBlcnNpc3RlZC5hdXRvbWF0aW9ucy5tYXAoKGF1dG9tYXRpb246IHsgbmFtZTogc3RyaW5nIH0pID0+IGF1dG9tYXRpb24ubmFtZSksXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiAnY3JlYXRlZCcsXG5cdFx0XHRjYW5jZWxsZWQ6IHRydWUsXG5cdFx0XHRjb21wYXJlQW5kU3dhcENhbGxzOiAxLFxuXHRcdFx0aW5NZW1vcnlOYW1lczogWydDb21taXR0ZWQnXSxcblx0XHRcdHBlcnNpc3RlZE5hbWVzOiBbJ0NvbW1pdHRlZCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVBdXRvbWF0aW9uIHJlamVjdHMgc3RhbGUgSURzIGFuZCBtYWxmb3JtZWQgdGFyZ2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b29sID0gbmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0bmV3IEZha2VBdXRvbWF0aW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IEZha2VTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHVuZGVmaW5lZCksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBzdGFsZVJlc3VsdCA9IGF3YWl0IGludm9rZSh0b29sLCB7IGF1dG9tYXRpb25JZDogJ21pc3NpbmcnLCBuYW1lOiAnVXBkYXRlZCcgfSk7XG5cdFx0Y29uc3QgbWFsZm9ybWVkVGFyZ2V0UmVzdWx0ID0gYXdhaXQgaW52b2tlKHRvb2wsIHtcblx0XHRcdG5hbWU6ICdJbnZhbGlkIHRhcmdldCcsXG5cdFx0XHRwcm9tcHQ6ICdEbyBub3Qgc2F2ZScsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ3dlZWtseScgfSxcblx0XHRcdHRhcmdldDoge1xuXHRcdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdFx0Zm9sZGVyVXJpOiAnbm90LWFuLWFic29sdXRlLXVyaScsXG5cdFx0XHRcdGlzb2xhdGlvbjogJ3dvcmt0cmVlJyxcblx0XHRcdFx0YnJhbmNoOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFsZUVycm9yOiBzdGFsZVJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHR0YXJnZXRFcnJvcjogbWFsZm9ybWVkVGFyZ2V0UmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHR9LCB7XG5cdFx0XHRzdGFsZUVycm9yOiAnQXV0b21hdGlvbiBcIm1pc3NpbmdcIiBkb2VzIG5vdCBleGlzdC4gQ2FsbCBsaXN0QXV0b21hdGlvbnMgdG8gcmVmcmVzaCB0aGUgYXZhaWxhYmxlIElEcy4nLFxuXHRcdFx0dGFyZ2V0RXJyb3I6ICdcInRhcmdldC5mb2xkZXJVcmlcIiBtdXN0IGJlIGEgdmFsaWQgYWJzb2x1dGUgVVJJLicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2FibGVkIEF1dG9tYXRpb25zIGNhbm5vdCBiZSBsaXN0ZWQsIGNvbmZpZ3VyZWQsIHJ1biwgb3IgZGVsZXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvbWF0aW9uU2VydmljZSA9IG5ldyBGYWtlQXV0b21hdGlvblNlcnZpY2UoW2NyZWF0ZUF1dG9tYXRpb24oKV0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoZmFsc2UpO1xuXHRcdGNvbnN0IHJ1bm5lciA9IG5ldyBSZWNvcmRpbmdBdXRvbWF0aW9uUnVubmVyKGF1dG9tYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0UmVzdWx0ID0gYXdhaXQgaW52b2tlKG5ldyBMaXN0QXV0b21hdGlvbnNUb29sKGF1dG9tYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSksIHt9KTtcblx0XHRjb25zdCBjb25maWd1cmVSZXN1bHQgPSBhd2FpdCBpbnZva2UobmV3IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sKFxuXHRcdFx0YXV0b21hdGlvblNlcnZpY2UsXG5cdFx0XHRuZXcgRmFrZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoY3JlYXRlU2Vzc2lvbih7IHdvcmtzcGFjZTogRk9MREVSIH0pKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCksIHtcblx0XHRcdG5hbWU6ICdEaXNhYmxlZCcsXG5cdFx0XHRwcm9tcHQ6ICdEbyBub3Qgc2F2ZScsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCBydW5SZXN1bHQgPSBhd2FpdCBpbnZva2UoXG5cdFx0XHRuZXcgUnVuQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIHJ1bm5lciwgY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0eyBhdXRvbWF0aW9uSWQ6ICdhdXRvbWF0aW9uLTEnIH0sXG5cdFx0KTtcblx0XHRjb25zdCBkZWxldGVSZXN1bHQgPSBhd2FpdCBpbnZva2UoXG5cdFx0XHRuZXcgRGVsZXRlQXV0b21hdGlvblRvb2woYXV0b21hdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdHsgYXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyB9LFxuXHRcdFx0U0VTU0lPTl9SRVNPVVJDRSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHQnZGVsZXRlJyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsaXN0RXJyb3I6IGxpc3RSZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0Y29uZmlndXJlRXJyb3I6IGNvbmZpZ3VyZVJlc3VsdC50b29sUmVzdWx0RXJyb3IsXG5cdFx0XHRydW5FcnJvcjogcnVuUmVzdWx0LnRvb2xSZXN1bHRFcnJvcixcblx0XHRcdGRlbGV0ZUVycm9yOiBkZWxldGVSZXN1bHQudG9vbFJlc3VsdEVycm9yLFxuXHRcdFx0cnVuQ2FsbHM6IHJ1bm5lci5jYWxscyxcblx0XHRcdGRlbGV0ZWQ6IGF1dG9tYXRpb25TZXJ2aWNlLmRlbGV0ZWQsXG5cdFx0fSwge1xuXHRcdFx0bGlzdEVycm9yOiAnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicsXG5cdFx0XHRjb25maWd1cmVFcnJvcjogJ0F1dG9tYXRpb25zIGFyZSBkaXNhYmxlZC4nLFxuXHRcdFx0cnVuRXJyb3I6ICdBdXRvbWF0aW9ucyBhcmUgZGlzYWJsZWQuJyxcblx0XHRcdGRlbGV0ZUVycm9yOiAnQXV0b21hdGlvbnMgYXJlIGRpc2FibGVkLicsXG5cdFx0XHRydW5DYWxsczogW10sXG5cdFx0XHRkZWxldGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3BFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMsK0JBQStCLHdDQUF3QztBQUloRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QiwyQkFBMkIsc0JBQXNCLHdCQUF3QixxQkFBcUIsdUJBQXVCLG1CQUFtQiwyQkFBMkI7QUFDck0sU0FBUyw4QkFBaUc7QUFFMUcsTUFBTSxTQUFTLElBQUksTUFBTSxtQkFBbUI7QUFDNUMsTUFBTSxtQkFBbUIsSUFBSSxNQUFNLCtCQUErQjtBQUNsRSxNQUFNLGdCQUFnQixJQUFJLE1BQU0seUJBQXlCO0FBQ3pELE1BQU0sTUFBTTtBQUNaLE1BQU0sV0FBeUIsRUFBRSxRQUFRLE1BQU07QUFBRSxFQUFFO0FBRW5ELFNBQVMsaUJBQWlCLFdBQStDO0FBQ3hFLFNBQU87QUFBQSxJQUNOLElBQUk7QUFBQSxJQUNKLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxJQUNSLFVBQVUsRUFBRSxVQUFV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
