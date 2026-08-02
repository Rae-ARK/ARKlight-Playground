import assert from "assert";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { mock } from "../../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { SessionConfigKey } from "../../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkbenchLayoutService } from "../../../../../../../workbench/services/layout/browser/layoutService.js";
import { Menus } from "../../../../../../browser/menus.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../../../common/agentHostSessionsProvider.js";
import { ISessionsProvidersService } from "../../../../../../services/sessions/browser/sessionsProvidersService.js";
import { AgentHostSessionConfigPicker } from "../../../browser/agentHostSessionConfigPicker.js";
const SESSION_ID = "local-agent-host:s1";
function makeRepoConfig(branchValue) {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder", "worktree"],
          enumLabels: ["Folder", "Worktree"],
          default: "worktree"
        },
        [SessionConfigKey.Branch]: {
          title: "Base Branch",
          description: "",
          type: "string",
          enum: ["main", "dev"]
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: "worktree", ...branchValue ? { [SessionConfigKey.Branch]: branchValue } : {} }
  };
}
function makeDynamicBranchConfig(branchValue) {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder", "worktree"],
          enumLabels: ["Folder", "Worktree"],
          default: "worktree"
        },
        [SessionConfigKey.Branch]: {
          title: "Base Branch",
          description: "",
          type: "string",
          enumDynamic: true
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: branchValue }
  };
}
function makeNoGitConfig() {
  return {
    schema: {
      type: "object",
      properties: {
        [SessionConfigKey.Isolation]: {
          title: "Isolation",
          description: "",
          type: "string",
          enum: ["folder"],
          enumLabels: ["Folder"],
          default: "folder",
          readOnly: true
        }
      }
    },
    values: { [SessionConfigKey.Isolation]: "folder" }
  };
}
class FakeProvider {
  constructor(_emitter) {
    this._emitter = _emitter;
    this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
    this.config = makeRepoConfig("main");
    this.resolving = observableValue("resolving", false);
    this.isNew = true;
    /** Completions returned by `getSessionConfigCompletions`, e.g. for the dynamic branch picker. */
    this.completions = [];
    this.onDidChangeSessionConfig = _emitter.event;
  }
  getSessionConfig() {
    return this.config;
  }
  getCreateSessionConfig() {
    return this.isNew ? {} : void 0;
  }
  isSessionConfigResolving() {
    return this.resolving;
  }
  async setSessionConfigValue() {
  }
  async getSessionConfigCompletions() {
    return this.completions;
  }
  /** Swap the config + resolving flag and pulse, as the real provider does. */
  set(config, resolving) {
    this.config = config;
    this.resolving.set(resolving, void 0);
    this._emitter.fire(SESSION_ID);
  }
}
class AlwaysRenderConfigPicker extends AgentHostSessionConfigPicker {
  _shouldRenderProperty(_property, _schema, _isNewSession) {
    return true;
  }
}
function isolationSlot(container) {
  return container.querySelector(".sessions-chat-isolation-checkbox");
}
function branchSlot(container) {
  return Array.from(container.querySelectorAll(".sessions-chat-picker-slot")).find((slot) => !slot.classList.contains("sessions-chat-isolation-checkbox"));
}
function branchLabel(container) {
  return branchSlot(container)?.querySelector(".sessions-chat-dropdown-label")?.textContent ?? void 0;
}
class CapturingActionWidgetHolder {
}
function setupServices(store) {
  const emitter = store.add(new Emitter());
  const provider = new FakeProvider(emitter);
  const actionWidget = new CapturingActionWidgetHolder();
  const instantiationService = store.add(new TestInstantiationService());
  instantiationService.stub(IActionWidgetService, {
    isVisible: false,
    hide: () => {
    },
    show: (_user, _supportsPreview, _items, delegate) => {
      actionWidget.delegate = delegate;
    }
  });
  instantiationService.stub(IHoverService, { setupDelayedHover: () => ({ dispose: () => {
  } }) });
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(IConfigurationService, new class extends mock() {
  }());
  instantiationService.stub(IDialogService, new class extends mock() {
  }());
  instantiationService.stub(IStorageService, new class extends mock() {
  }());
  instantiationService.stub(IContextKeyService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeContext = Event.None;
    }
  }());
  instantiationService.stub(IWorkbenchLayoutService, new class extends mock() {
    constructor() {
      super(...arguments);
      // No `phone-layout` class → `isPhoneLayout` is false → isolation renders as a checkbox.
      this.mainContainer = document.createElement("div");
    }
  }());
  instantiationService.set(ISessionsProvidersService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeProviders = Event.None;
    }
    getProviders() {
      return [provider];
    }
    getProvider(id) {
      return id === provider.id ? provider : void 0;
    }
  }());
  const sessionObs = observableValue("activeSession", { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: SESSION_ID });
  return { instantiationService, provider, sessionObs, actionWidget };
}
function renderPicker(store, services) {
  const picker = store.add(services.instantiationService.createInstance(AgentHostSessionConfigPicker, services.sessionObs));
  const container = document.createElement("div");
  picker.render(container);
  return { picker, container };
}
suite("Agent Host Session Config Picker", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("places mode immediately before approvals in secondary toolbars", () => {
    const summarize = (menu, ids) => MenuRegistry.getMenuItems(menu).filter(isIMenuItem).filter((item) => ids.includes(item.command.id)).map((item) => ({ id: item.command.id, order: item.order })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const newSessionIds = [
      "sessions.agentHost.newSessionModePicker",
      "sessions.agentHost.newSessionApprovePicker",
      "sessions.agentHost.newSessionPermissionModePicker"
    ];
    const runningSessionIds = [
      "sessions.agentHost.runningSessionModePicker",
      "sessions.agentHost.runningSessionConfigPicker",
      "sessions.agentHost.runningSessionPermissionModePicker"
    ];
    assert.deepStrictEqual({
      newSessionPrimary: summarize(Menus.NewSessionConfig, newSessionIds),
      newSessionSecondary: summarize(Menus.NewSessionControl, newSessionIds),
      runningSessionPrimary: summarize(MenuId.ChatInput, runningSessionIds),
      runningSessionSecondary: summarize(MenuId.ChatInputSecondary, runningSessionIds)
    }, {
      newSessionPrimary: [],
      newSessionSecondary: [
        { id: "sessions.agentHost.newSessionModePicker", order: 0 },
        { id: "sessions.agentHost.newSessionApprovePicker", order: 1 },
        { id: "sessions.agentHost.newSessionPermissionModePicker", order: 2 }
      ],
      runningSessionPrimary: [],
      runningSessionSecondary: [
        { id: "sessions.agentHost.runningSessionModePicker", order: 9 },
        { id: "sessions.agentHost.runningSessionConfigPicker", order: 10 },
        { id: "sessions.agentHost.runningSessionPermissionModePicker", order: 11 }
      ]
    });
  });
  test("a picker recreated on a session switch still renders the provider-seeded chips (disabled) while resolving", () => {
    const services = setupServices(store);
    const { provider } = services;
    provider.set(makeRepoConfig("main"), false);
    const first = renderPicker(store, services);
    assert.ok(isolationSlot(first.container), "isolation checkbox renders for a resolved schema");
    assert.ok(branchSlot(first.container), "branch chip renders for a resolved schema");
    assert.strictEqual(isolationSlot(first.container).classList.contains("disabled"), false);
    first.picker.dispose();
    provider.set(makeRepoConfig(), true);
    const second = renderPicker(store, services);
    assert.ok(isolationSlot(second.container), "isolation visible on a freshly created picker");
    assert.ok(branchSlot(second.container), "branch visible on a freshly created picker");
    assert.strictEqual(isolationSlot(second.container).classList.contains("disabled"), true, "isolation disabled while resolving");
    assert.strictEqual(branchSlot(second.container).classList.contains("disabled"), true, "branch disabled while resolving");
    assert.strictEqual(branchSlot(second.container).querySelector("a.action-label")?.getAttribute("aria-disabled"), "true");
    provider.set(makeRepoConfig("dev"), false);
    assert.strictEqual(isolationSlot(second.container).classList.contains("disabled"), false, "isolation re-enables after resolve");
    assert.strictEqual(branchSlot(second.container).classList.contains("disabled"), false, "branch re-enables after resolve");
    assert.strictEqual(branchLabel(second.container), "dev", "branch label reflects the resolved value");
  });
  test("branch picker keeps the display label for a dynamic (enumDynamic) selection, not just the persisted value", async () => {
    const services = setupServices(store);
    const { provider, actionWidget } = services;
    provider.config = makeDynamicBranchConfig("main");
    const { picker, container } = renderPicker(store, services);
    provider.completions = [{ value: "feature/x", label: "Feature X" }];
    const trigger = branchSlot(container).querySelector("a.action-label");
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    assert.ok(actionWidget.delegate, "opening the picker fetches completions and shows the action widget");
    actionWidget.delegate.onSelect({ value: "feature/x", label: "Feature X" });
    await new Promise((resolve) => setTimeout(resolve));
    provider.set(makeDynamicBranchConfig("feature/x"), false);
    assert.strictEqual(branchLabel(container), "Feature X", "branch label uses the cached completion label, not the raw value");
    picker.dispose();
  });
  test("evicts dynamic-value label cache entries once the picker moves to a different session", async () => {
    const services = setupServices(store);
    const { provider, actionWidget, sessionObs } = services;
    provider.config = makeDynamicBranchConfig("main");
    const { picker, container } = renderPicker(store, services);
    provider.completions = [{ value: "feature/x", label: "Feature X" }];
    const trigger = branchSlot(container).querySelector("a.action-label");
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve));
    actionWidget.delegate.onSelect({ value: "feature/x", label: "Feature X" });
    await new Promise((resolve) => setTimeout(resolve));
    provider.set(makeDynamicBranchConfig("feature/x"), false);
    const cache = picker._dynamicValueLabels;
    assert.ok(Array.from(cache.keys()).some((key) => key.startsWith(`${SESSION_ID}\0`)), "cache holds an entry for the first session");
    const OTHER_SESSION_ID = "local-agent-host:s2";
    provider.config = makeDynamicBranchConfig("main");
    sessionObs.set({ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionId: OTHER_SESSION_ID }, void 0);
    assert.strictEqual(Array.from(cache.keys()).some((key) => key.startsWith(`${SESSION_ID}\0`)), false, "stale entries for the previous session are evicted");
    picker.dispose();
  });
  test("does not render folder isolation when the workspace has no Git repository", () => {
    const services = setupServices(store);
    services.provider.config = makeNoGitConfig();
    const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
    const container = document.createElement("div");
    picker.render(container);
    assert.strictEqual(isolationSlot(container), null);
  });
  test("never renders a chip for the hidden worktreeBranchTrack carrier property", () => {
    const services = setupServices(store);
    services.provider.config = {
      schema: {
        type: "object",
        properties: {
          [SessionConfigKey.Isolation]: {
            title: "Isolation",
            description: "",
            type: "string",
            enum: ["folder", "worktree"],
            enumLabels: ["Folder", "Worktree"],
            default: "worktree"
          },
          [SessionConfigKey.WorktreeBranchTrack]: {
            title: "Track Branch",
            description: "",
            type: "boolean",
            default: false,
            readOnly: true,
            sessionMutable: false
          }
        }
      },
      values: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.WorktreeBranchTrack]: false }
    };
    const picker = store.add(services.instantiationService.createInstance(AlwaysRenderConfigPicker, services.sessionObs));
    const container = document.createElement("div");
    picker.render(container);
    assert.strictEqual(container.querySelectorAll(".sessions-chat-picker-slot").length, 1, "only the isolation checkbox renders, not a worktreeBranchTrack chip");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC90ZXN0L2Jyb3dzZXIvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uTGlzdERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCwgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBTZXNzaW9uQ29uZmlnVmFsdWVJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlciwgSUNvbmZpZ1BpY2tlckl0ZW0gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIuanMnO1xuXG5jb25zdCBTRVNTSU9OX0lEID0gJ2xvY2FsLWFnZW50LWhvc3Q6czEnO1xuXG4vKiogQSBjb25maWcgZXhwb3NpbmcgdGhlIHR3byBzaGFyZWQgcmVwby1jb25maWcgY2hpcHMgKGlzb2xhdGlvbiArIGJyYW5jaCkuICovXG5mdW5jdGlvbiBtYWtlUmVwb0NvbmZpZyhicmFuY2hWYWx1ZT86IHN0cmluZyk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIGVudW1MYWJlbHM6IFsnRm9sZGVyJywgJ1dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3dvcmt0cmVlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXToge1xuXHRcdFx0XHRcdHRpdGxlOiAnQmFzZSBCcmFuY2gnLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbWFpbicsICdkZXYnXSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHR2YWx1ZXM6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJywgLi4uKGJyYW5jaFZhbHVlID8geyBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiBicmFuY2hWYWx1ZSB9IDoge30pIH0sXG5cdH0gYXMgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG59XG5cbi8qKiBBIGNvbmZpZyB3aG9zZSBCcmFuY2ggcHJvcGVydHkgaXMgcmVzb2x2ZWQgZHluYW1pY2FsbHkgKG5vIHN0YXRpYyBgZW51bWApLCBhcyB0aGUgcmVhbCBicmFuY2ggcGlja2VyIGlzLiAqL1xuZnVuY3Rpb24gbWFrZUR5bmFtaWNCcmFuY2hDb25maWcoYnJhbmNoVmFsdWU6IHN0cmluZyk6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0IHtcblx0cmV0dXJuIHtcblx0XHRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiB7XG5cdFx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIGVudW1MYWJlbHM6IFsnRm9sZGVyJywgJ1dvcmt0cmVlJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3dvcmt0cmVlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXToge1xuXHRcdFx0XHRcdHRpdGxlOiAnQmFzZSBCcmFuY2gnLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW1EeW5hbWljOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHZhbHVlczogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiBicmFuY2hWYWx1ZSB9LFxuXHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xufVxuXG5mdW5jdGlvbiBtYWtlTm9HaXRDb25maWcoKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQge1xuXHRyZXR1cm4ge1xuXHRcdHNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IHtcblx0XHRcdFx0XHR0aXRsZTogJ0lzb2xhdGlvbicsIGRlc2NyaXB0aW9uOiAnJywgdHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydmb2xkZXInXSwgZW51bUxhYmVsczogWydGb2xkZXInXSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnZm9sZGVyJywgcmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0sXG5cdH0gYXMgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG59XG5cbi8qKlxuICogRmFrZSBwcm92aWRlciB3aG9zZSBgZ2V0U2Vzc2lvbkNvbmZpZ2AgcmV0dXJucyB3aGF0ZXZlciBjb25maWcgaXMgc2V0LiBUaGVcbiAqIHByb3ZpZGVyIChub3QgdGhlIHBpY2tlcikgb3ducyB0aGUgc2VlZGVkIHNjaGVtYSwgc28gYSBwaWNrZXIgcmVjcmVhdGVkIGJ5IGFcbiAqIHRvb2xiYXIgcmVidWlsZCBzdGlsbCByZWFkcyB0aGUgc2VlZGVkIGNoaXBzIGZyb20gaGVyZS5cbiAqL1xuY2xhc3MgRmFrZVByb3ZpZGVyIGltcGxlbWVudHMgUGljazxJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgJ2lkJyB8ICdvbkRpZENoYW5nZVNlc3Npb25Db25maWcnIHwgJ2dldFNlc3Npb25Db25maWcnIHwgJ2dldENyZWF0ZVNlc3Npb25Db25maWcnIHwgJ2lzU2Vzc2lvbkNvbmZpZ1Jlc29sdmluZycgfCAnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlJyB8ICdnZXRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnMnPiB7XG5cdHJlYWRvbmx5IGlkID0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnOiBFdmVudDxzdHJpbmc+O1xuXHRjb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0gbWFrZVJlcG9Db25maWcoJ21haW4nKTtcblx0cmVhZG9ubHkgcmVzb2x2aW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KCdyZXNvbHZpbmcnLCBmYWxzZSk7XG5cdGlzTmV3ID0gdHJ1ZTtcblx0LyoqIENvbXBsZXRpb25zIHJldHVybmVkIGJ5IGBnZXRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNgLCBlLmcuIGZvciB0aGUgZHluYW1pYyBicmFuY2ggcGlja2VyLiAqL1xuXHRjb21wbGV0aW9uczogcmVhZG9ubHkgU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZW1pdHRlcjogRW1pdHRlcjxzdHJpbmc+KSB7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVNlc3Npb25Db25maWcgPSBfZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdGdldFNlc3Npb25Db25maWcoKTogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5jb25maWc7IH1cblx0Z2V0Q3JlYXRlU2Vzc2lvbkNvbmZpZygpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmlzTmV3ID8ge30gOiB1bmRlZmluZWQ7IH1cblx0aXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKCkgeyByZXR1cm4gdGhpcy5yZXNvbHZpbmc7IH1cblx0YXN5bmMgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGdldFNlc3Npb25Db25maWdDb21wbGV0aW9ucygpOiBQcm9taXNlPHJlYWRvbmx5IFNlc3Npb25Db25maWdWYWx1ZUl0ZW1bXT4geyByZXR1cm4gdGhpcy5jb21wbGV0aW9uczsgfVxuXG5cdC8qKiBTd2FwIHRoZSBjb25maWcgKyByZXNvbHZpbmcgZmxhZyBhbmQgcHVsc2UsIGFzIHRoZSByZWFsIHByb3ZpZGVyIGRvZXMuICovXG5cdHNldChjb25maWc6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCByZXNvbHZpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmNvbmZpZyA9IGNvbmZpZztcblx0XHR0aGlzLnJlc29sdmluZy5zZXQocmVzb2x2aW5nLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2VtaXR0ZXIuZmlyZShTRVNTSU9OX0lEKTtcblx0fVxufVxuXG5jbGFzcyBBbHdheXNSZW5kZXJDb25maWdQaWNrZXIgZXh0ZW5kcyBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyIHtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRSZW5kZXJQcm9wZXJ0eShfcHJvcGVydHk6IHN0cmluZywgX3NjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBfaXNOZXdTZXNzaW9uOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNvbGF0aW9uU2xvdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0cmV0dXJuIGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94Jyk7XG59XG5cbmZ1bmN0aW9uIGJyYW5jaFNsb3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdCcpKVxuXHRcdC5maW5kKHNsb3QgPT4gIXNsb3QuY2xhc3NMaXN0LmNvbnRhaW5zKCdzZXNzaW9ucy1jaGF0LWlzb2xhdGlvbi1jaGVja2JveCcpKTtcbn1cblxuZnVuY3Rpb24gYnJhbmNoTGFiZWwoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBicmFuY2hTbG90KGNvbnRhaW5lcik/LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpPy50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQ7XG59XG5cbi8qKiBDYXB0dXJlcyB0aGUgZGVsZWdhdGUgcGFzc2VkIHRvIHRoZSBsYXN0IGBJQWN0aW9uV2lkZ2V0U2VydmljZS5zaG93YCBjYWxsLCBzbyB0ZXN0cyBjYW4gZHJpdmUgYSBzZWxlY3Rpb24uICovXG5jbGFzcyBDYXB0dXJpbmdBY3Rpb25XaWRnZXRIb2xkZXIge1xuXHRkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQ29uZmlnUGlja2VySXRlbT4gfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNldHVwU2VydmljZXMoc3RvcmU6IFBpY2s8UmV0dXJuVHlwZTx0eXBlb2YgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlPiwgJ2FkZCc+KSB7XG5cdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgRmFrZVByb3ZpZGVyKGVtaXR0ZXIpO1xuXHRjb25zdCBhY3Rpb25XaWRnZXQgPSBuZXcgQ2FwdHVyaW5nQWN0aW9uV2lkZ2V0SG9sZGVyKCk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWN0aW9uV2lkZ2V0U2VydmljZSwge1xuXHRcdGlzVmlzaWJsZTogZmFsc2UsXG5cdFx0aGlkZTogKCkgPT4geyB9LFxuXHRcdHNob3c6IChfdXNlciwgX3N1cHBvcnRzUHJldmlldywgX2l0ZW1zLCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQ29uZmlnUGlja2VySXRlbT4pID0+IHsgYWN0aW9uV2lkZ2V0LmRlbGVnYXRlID0gZGVsZWdhdGU7IH0sXG5cdH0gYXMgUGFydGlhbDxJQWN0aW9uV2lkZ2V0U2VydmljZT4gYXMgSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElIb3ZlclNlcnZpY2UsIHsgc2V0dXBEZWxheWVkSG92ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSB9IGFzIFBhcnRpYWw8SUhvdmVyU2VydmljZT4gYXMgSUhvdmVyU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyAoY2xhc3MgZXh0ZW5kcyBtb2NrPElDb25maWd1cmF0aW9uU2VydmljZT4oKSB7IH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7IH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVN0b3JhZ2VTZXJ2aWNlPigpIHsgfSkoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJQ29udGV4dEtleVNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dCA9IEV2ZW50Lk5vbmU7XG5cdH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgKGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya2JlbmNoTGF5b3V0U2VydmljZT4oKSB7XG5cdFx0Ly8gTm8gYHBob25lLWxheW91dGAgY2xhc3MgXHUyMTkyIGBpc1Bob25lTGF5b3V0YCBpcyBmYWxzZSBcdTIxOTIgaXNvbGF0aW9uIHJlbmRlcnMgYXMgYSBjaGVja2JveC5cblx0XHRvdmVycmlkZSByZWFkb25seSBtYWluQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdH0pKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IChjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zUHJvdmlkZXJzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldFByb3ZpZGVycygpOiBJU2Vzc2lvbnNQcm92aWRlcltdIHsgcmV0dXJuIFtwcm92aWRlciBhcyB1bmtub3duIGFzIElTZXNzaW9uc1Byb3ZpZGVyXTsgfVxuXHRcdG92ZXJyaWRlIGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4oaWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIGlkID09PSBwcm92aWRlci5pZCA/IHByb3ZpZGVyIGFzIHVua25vd24gYXMgVCA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pKCkpO1xuXG5cdGNvbnN0IHNlc3Npb25PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uSWQ6IFNFU1NJT05fSUQgfSBhcyBJQWN0aXZlU2Vzc2lvbik7XG5cdHJldHVybiB7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBwcm92aWRlciwgc2Vzc2lvbk9icywgYWN0aW9uV2lkZ2V0IH07XG59XG5cbi8qKiBDcmVhdGUgYW5kIHJlbmRlciBhIGZyZXNoIHBpY2tlciBpbnN0YW5jZSwgYXMgdGhlIHRvb2xiYXIgZG9lcyBvbiBhIHJlYnVpbGQuICovXG5mdW5jdGlvbiByZW5kZXJQaWNrZXIoc3RvcmU6IFBpY2s8UmV0dXJuVHlwZTx0eXBlb2YgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlPiwgJ2FkZCc+LCBzZXJ2aWNlczogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0dXBTZXJ2aWNlcz4pIHtcblx0Y29uc3QgcGlja2VyID0gc3RvcmUuYWRkKHNlcnZpY2VzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIsIHNlcnZpY2VzLnNlc3Npb25PYnMpKTtcblx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0cmV0dXJuIHsgcGlja2VyLCBjb250YWluZXIgfTtcbn1cblxuc3VpdGUoJ0FnZW50IEhvc3QgU2Vzc2lvbiBDb25maWcgUGlja2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGxhY2VzIG1vZGUgaW1tZWRpYXRlbHkgYmVmb3JlIGFwcHJvdmFscyBpbiBzZWNvbmRhcnkgdG9vbGJhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3VtbWFyaXplID0gKG1lbnU6IE1lbnVJZCwgaWRzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhtZW51KVxuXHRcdFx0LmZpbHRlcihpc0lNZW51SXRlbSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpZHMuaW5jbHVkZXMoaXRlbS5jb21tYW5kLmlkKSlcblx0XHRcdC5tYXAoaXRlbSA9PiAoeyBpZDogaXRlbS5jb21tYW5kLmlkLCBvcmRlcjogaXRlbS5vcmRlciB9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiAoYS5vcmRlciA/PyAwKSAtIChiLm9yZGVyID8/IDApKTtcblxuXHRcdGNvbnN0IG5ld1Nlc3Npb25JZHMgPSBbXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25Nb2RlUGlja2VyJyxcblx0XHRcdCdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbkFwcHJvdmVQaWNrZXInLFxuXHRcdFx0J3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInLFxuXHRcdF07XG5cdFx0Y29uc3QgcnVubmluZ1Nlc3Npb25JZHMgPSBbXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcicsXG5cdFx0XHQnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uQ29uZmlnUGlja2VyJyxcblx0XHRcdCdzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uTW9kZVBpY2tlcicsXG5cdFx0XTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bmV3U2Vzc2lvblByaW1hcnk6IHN1bW1hcml6ZShNZW51cy5OZXdTZXNzaW9uQ29uZmlnLCBuZXdTZXNzaW9uSWRzKSxcblx0XHRcdG5ld1Nlc3Npb25TZWNvbmRhcnk6IHN1bW1hcml6ZShNZW51cy5OZXdTZXNzaW9uQ29udHJvbCwgbmV3U2Vzc2lvbklkcyksXG5cdFx0XHRydW5uaW5nU2Vzc2lvblByaW1hcnk6IHN1bW1hcml6ZShNZW51SWQuQ2hhdElucHV0LCBydW5uaW5nU2Vzc2lvbklkcyksXG5cdFx0XHRydW5uaW5nU2Vzc2lvblNlY29uZGFyeTogc3VtbWFyaXplKE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHJ1bm5pbmdTZXNzaW9uSWRzKSxcblx0XHR9LCB7XG5cdFx0XHRuZXdTZXNzaW9uUHJpbWFyeTogW10sXG5cdFx0XHRuZXdTZXNzaW9uU2Vjb25kYXJ5OiBbXG5cdFx0XHRcdHsgaWQ6ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbk1vZGVQaWNrZXInLCBvcmRlcjogMCB9LFxuXHRcdFx0XHR7IGlkOiAnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25BcHByb3ZlUGlja2VyJywgb3JkZXI6IDEgfSxcblx0XHRcdFx0eyBpZDogJ3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInLCBvcmRlcjogMiB9LFxuXHRcdFx0XSxcblx0XHRcdHJ1bm5pbmdTZXNzaW9uUHJpbWFyeTogW10sXG5cdFx0XHRydW5uaW5nU2Vzc2lvblNlY29uZGFyeTogW1xuXHRcdFx0XHR7IGlkOiAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcicsIG9yZGVyOiA5IH0sXG5cdFx0XHRcdHsgaWQ6ICdzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25Db25maWdQaWNrZXInLCBvcmRlcjogMTAgfSxcblx0XHRcdFx0eyBpZDogJ3Nlc3Npb25zLmFnZW50SG9zdC5ydW5uaW5nU2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJywgb3JkZXI6IDExIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBpY2tlciByZWNyZWF0ZWQgb24gYSBzZXNzaW9uIHN3aXRjaCBzdGlsbCByZW5kZXJzIHRoZSBwcm92aWRlci1zZWVkZWQgY2hpcHMgKGRpc2FibGVkKSB3aGlsZSByZXNvbHZpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBzZXR1cFNlcnZpY2VzKHN0b3JlKTtcblx0XHRjb25zdCB7IHByb3ZpZGVyIH0gPSBzZXJ2aWNlcztcblxuXHRcdC8vIERyYWZ0IHJlc29sdmVkIFx1MjE5MiBjaGlwcyBwcmVzZW50IGFuZCBlbmFibGVkLlxuXHRcdHByb3ZpZGVyLnNldChtYWtlUmVwb0NvbmZpZygnbWFpbicpLCBmYWxzZSk7XG5cdFx0Y29uc3QgZmlyc3QgPSByZW5kZXJQaWNrZXIoc3RvcmUsIHNlcnZpY2VzKTtcblx0XHRhc3NlcnQub2soaXNvbGF0aW9uU2xvdChmaXJzdC5jb250YWluZXIpLCAnaXNvbGF0aW9uIGNoZWNrYm94IHJlbmRlcnMgZm9yIGEgcmVzb2x2ZWQgc2NoZW1hJyk7XG5cdFx0YXNzZXJ0Lm9rKGJyYW5jaFNsb3QoZmlyc3QuY29udGFpbmVyKSwgJ2JyYW5jaCBjaGlwIHJlbmRlcnMgZm9yIGEgcmVzb2x2ZWQgc2NoZW1hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzb2xhdGlvblNsb3QoZmlyc3QuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpLCBmYWxzZSk7XG5cblx0XHQvLyBBIHNlc3Npb24tdHlwZSBzd2l0Y2ggZGlzcG9zZXMgdGhlIHRvb2xiYXIncyBwaWNrZXI7IHRoZSBwcm92aWRlciBzZWVkcyB0aGVcblx0XHQvLyBuZXcgKHN0aWxsLXJlc29sdmluZykgZHJhZnQncyBjb25maWcgd2l0aCB0aGUgY2FjaGVkIGNoaXBzLlxuXHRcdGZpcnN0LnBpY2tlci5kaXNwb3NlKCk7XG5cdFx0cHJvdmlkZXIuc2V0KG1ha2VSZXBvQ29uZmlnKCksIHRydWUpO1xuXG5cdFx0Ly8gVGhlIGZyZXNobHkgY3JlYXRlZCBwaWNrZXIgc3RpbGwgc2hvd3MgdGhlIGNoaXBzIChkaXNhYmxlZCkgXHUyMDE0IHRoZSBjYWNoZVxuXHRcdC8vIGxpdmVzIG9uIHRoZSBwcm92aWRlciwgbm90IHRoZSBkaXNwb3NlZCBwaWNrZXIgaW5zdGFuY2UuXG5cdFx0Y29uc3Qgc2Vjb25kID0gcmVuZGVyUGlja2VyKHN0b3JlLCBzZXJ2aWNlcyk7XG5cdFx0YXNzZXJ0Lm9rKGlzb2xhdGlvblNsb3Qoc2Vjb25kLmNvbnRhaW5lciksICdpc29sYXRpb24gdmlzaWJsZSBvbiBhIGZyZXNobHkgY3JlYXRlZCBwaWNrZXInKTtcblx0XHRhc3NlcnQub2soYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSwgJ2JyYW5jaCB2aXNpYmxlIG9uIGEgZnJlc2hseSBjcmVhdGVkIHBpY2tlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc29sYXRpb25TbG90KHNlY29uZC5jb250YWluZXIpIS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksIHRydWUsICdpc29sYXRpb24gZGlzYWJsZWQgd2hpbGUgcmVzb2x2aW5nJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJyYW5jaFNsb3Qoc2Vjb25kLmNvbnRhaW5lcikhLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSwgdHJ1ZSwgJ2JyYW5jaCBkaXNhYmxlZCB3aGlsZSByZXNvbHZpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSEucXVlcnlTZWxlY3RvcignYS5hY3Rpb24tbGFiZWwnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJyksICd0cnVlJyk7XG5cblx0XHQvLyBSZXNvbHZlIGxhbmRzIFx1MjE5MiBjaGlwcyByZS1lbmFibGUgYW5kIHJlZmxlY3QgdGhlIHJlc29sdmVkIHZhbHVlLlxuXHRcdHByb3ZpZGVyLnNldChtYWtlUmVwb0NvbmZpZygnZGV2JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNvbGF0aW9uU2xvdChzZWNvbmQuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpLCBmYWxzZSwgJ2lzb2xhdGlvbiByZS1lbmFibGVzIGFmdGVyIHJlc29sdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoU2xvdChzZWNvbmQuY29udGFpbmVyKSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpLCBmYWxzZSwgJ2JyYW5jaCByZS1lbmFibGVzIGFmdGVyIHJlc29sdmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYnJhbmNoTGFiZWwoc2Vjb25kLmNvbnRhaW5lciksICdkZXYnLCAnYnJhbmNoIGxhYmVsIHJlZmxlY3RzIHRoZSByZXNvbHZlZCB2YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdicmFuY2ggcGlja2VyIGtlZXBzIHRoZSBkaXNwbGF5IGxhYmVsIGZvciBhIGR5bmFtaWMgKGVudW1EeW5hbWljKSBzZWxlY3Rpb24sIG5vdCBqdXN0IHRoZSBwZXJzaXN0ZWQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBzZXR1cFNlcnZpY2VzKHN0b3JlKTtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBhY3Rpb25XaWRnZXQgfSA9IHNlcnZpY2VzO1xuXG5cdFx0cHJvdmlkZXIuY29uZmlnID0gbWFrZUR5bmFtaWNCcmFuY2hDb25maWcoJ21haW4nKTtcblx0XHRjb25zdCB7IHBpY2tlciwgY29udGFpbmVyIH0gPSByZW5kZXJQaWNrZXIoc3RvcmUsIHNlcnZpY2VzKTtcblxuXHRcdC8vIE9ubHkgYHZhbHVlYCBnZXRzIHBlcnNpc3RlZCBzZXJ2ZXItc2lkZSBmb3IgZW51bUR5bmFtaWMgcHJvcGVydGllcywgc28gdGhlXG5cdFx0Ly8gZGlzcGxheSBsYWJlbCBmb3IgYSBmcmVzaGx5IHNlbGVjdGVkIGJyYW5jaCBtdXN0IGNvbWUgZnJvbSB0aGUgcGlja2VyJ3Ncblx0XHQvLyBvd24gY2FjaGUgb2YgdGhlIGxhc3QtZmV0Y2hlZCBjb21wbGV0aW9ucywgbm90IGZyb20gdGhlIHNjaGVtYSAodGhlcmUgaXNcblx0XHQvLyBubyBzdGF0aWMgYGVudW1gL2BlbnVtTGFiZWxzYCBmb3IgYSBkeW5hbWljIHByb3BlcnR5KSBvciB0aGUgcmF3IHZhbHVlLlxuXHRcdHByb3ZpZGVyLmNvbXBsZXRpb25zID0gW3sgdmFsdWU6ICdmZWF0dXJlL3gnLCBsYWJlbDogJ0ZlYXR1cmUgWCcgfV07XG5cblx0XHRjb25zdCB0cmlnZ2VyID0gYnJhbmNoU2xvdChjb250YWluZXIpIS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignYS5hY3Rpb24tbGFiZWwnKSE7XG5cdFx0dHJpZ2dlci5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUpKTtcblxuXHRcdGFzc2VydC5vayhhY3Rpb25XaWRnZXQuZGVsZWdhdGUsICdvcGVuaW5nIHRoZSBwaWNrZXIgZmV0Y2hlcyBjb21wbGV0aW9ucyBhbmQgc2hvd3MgdGhlIGFjdGlvbiB3aWRnZXQnKTtcblx0XHRhY3Rpb25XaWRnZXQuZGVsZWdhdGUhLm9uU2VsZWN0KHsgdmFsdWU6ICdmZWF0dXJlL3gnLCBsYWJlbDogJ0ZlYXR1cmUgWCcgfSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUpKTtcblxuXHRcdC8vIFNpbXVsYXRlIHRoZSBwcm92aWRlciBwZXJzaXN0aW5nIHRoZSBuZXcgdmFsdWUgYW5kIG5vdGlmeWluZyBsaXN0ZW5lcnMsXG5cdFx0Ly8gYXMgdGhlIHJlYWwgcHJvdmlkZXIgZG9lcyBvbmNlIGBzZXRTZXNzaW9uQ29uZmlnVmFsdWVgIHJlc29sdmVzLlxuXHRcdHByb3ZpZGVyLnNldChtYWtlRHluYW1pY0JyYW5jaENvbmZpZygnZmVhdHVyZS94JyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChicmFuY2hMYWJlbChjb250YWluZXIpLCAnRmVhdHVyZSBYJywgJ2JyYW5jaCBsYWJlbCB1c2VzIHRoZSBjYWNoZWQgY29tcGxldGlvbiBsYWJlbCwgbm90IHRoZSByYXcgdmFsdWUnKTtcblx0XHRwaWNrZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmljdHMgZHluYW1pYy12YWx1ZSBsYWJlbCBjYWNoZSBlbnRyaWVzIG9uY2UgdGhlIHBpY2tlciBtb3ZlcyB0byBhIGRpZmZlcmVudCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gc2V0dXBTZXJ2aWNlcyhzdG9yZSk7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgYWN0aW9uV2lkZ2V0LCBzZXNzaW9uT2JzIH0gPSBzZXJ2aWNlcztcblxuXHRcdC8vIFRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcidzIGBfc2Vzc2lvbmAgb2JzZXJ2YWJsZSB0cmFja3MgdGhlIGdsb2JhbGx5XG5cdFx0Ly8gYWN0aXZlIHNlc3Npb24sIHNvIHRoZSAqc2FtZSogcGlja2VyIGluc3RhbmNlIGNhbiBiZSBzaG93biBhIHNlcXVlbmNlIG9mXG5cdFx0Ly8gZGlmZmVyZW50IGRyYWZ0IHNlc3Npb25zIG92ZXIgaXRzIGxpZmV0aW1lIChzZWUgYE5ld0NoYXRXaWRnZXQuX3Nlc3Npb25gKS5cblx0XHQvLyBTaW11bGF0ZSB0aGF0IGhlcmUgYnkgbXV0YXRpbmcgYHNlc3Npb25PYnNgIGluIHBsYWNlIGluc3RlYWQgb2YgZGlzcG9zaW5nLlxuXHRcdHByb3ZpZGVyLmNvbmZpZyA9IG1ha2VEeW5hbWljQnJhbmNoQ29uZmlnKCdtYWluJyk7XG5cdFx0Y29uc3QgeyBwaWNrZXIsIGNvbnRhaW5lciB9ID0gcmVuZGVyUGlja2VyKHN0b3JlLCBzZXJ2aWNlcyk7XG5cblx0XHRwcm92aWRlci5jb21wbGV0aW9ucyA9IFt7IHZhbHVlOiAnZmVhdHVyZS94JywgbGFiZWw6ICdGZWF0dXJlIFgnIH1dO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSBicmFuY2hTbG90KGNvbnRhaW5lcikhLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCdhLmFjdGlvbi1sYWJlbCcpITtcblx0XHR0cmlnZ2VyLmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjYW5jZWxhYmxlOiB0cnVlIH0pKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSkpO1xuXHRcdGFjdGlvbldpZGdldC5kZWxlZ2F0ZSEub25TZWxlY3QoeyB2YWx1ZTogJ2ZlYXR1cmUveCcsIGxhYmVsOiAnRmVhdHVyZSBYJyB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSkpO1xuXHRcdHByb3ZpZGVyLnNldChtYWtlRHluYW1pY0JyYW5jaENvbmZpZygnZmVhdHVyZS94JyksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGNhY2hlID0gKHBpY2tlciBhcyB1bmtub3duIGFzIHsgX2R5bmFtaWNWYWx1ZUxhYmVsczogTWFwPHN0cmluZywgTWFwPHN0cmluZywgc3RyaW5nPj4gfSkuX2R5bmFtaWNWYWx1ZUxhYmVscztcblx0XHRhc3NlcnQub2soQXJyYXkuZnJvbShjYWNoZS5rZXlzKCkpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKGAke1NFU1NJT05fSUR9XFwwYCkpLCAnY2FjaGUgaG9sZHMgYW4gZW50cnkgZm9yIHRoZSBmaXJzdCBzZXNzaW9uJyk7XG5cblx0XHQvLyBNb3ZlIHRoZSBwaWNrZXIgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbiwgYXMgd291bGQgaGFwcGVuIHdoZW4gdGhlXG5cdFx0Ly8gY29tcG9zZXIncyBhY3RpdmUgc2Vzc2lvbiBjaGFuZ2VzIHdpdGhvdXQgdGhlIHBpY2tlciBiZWluZyByZWNyZWF0ZWQuXG5cdFx0Y29uc3QgT1RIRVJfU0VTU0lPTl9JRCA9ICdsb2NhbC1hZ2VudC1ob3N0OnMyJztcblx0XHRwcm92aWRlci5jb25maWcgPSBtYWtlRHluYW1pY0JyYW5jaENvbmZpZygnbWFpbicpO1xuXHRcdHNlc3Npb25PYnMuc2V0KHsgcHJvdmlkZXJJZDogTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCwgc2Vzc2lvbklkOiBPVEhFUl9TRVNTSU9OX0lEIH0gYXMgSUFjdGl2ZVNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQXJyYXkuZnJvbShjYWNoZS5rZXlzKCkpLnNvbWUoa2V5ID0+IGtleS5zdGFydHNXaXRoKGAke1NFU1NJT05fSUR9XFwwYCkpLCBmYWxzZSwgJ3N0YWxlIGVudHJpZXMgZm9yIHRoZSBwcmV2aW91cyBzZXNzaW9uIGFyZSBldmljdGVkJyk7XG5cdFx0cGlja2VyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVuZGVyIGZvbGRlciBpc29sYXRpb24gd2hlbiB0aGUgd29ya3NwYWNlIGhhcyBubyBHaXQgcmVwb3NpdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlcyA9IHNldHVwU2VydmljZXMoc3RvcmUpO1xuXHRcdHNlcnZpY2VzLnByb3ZpZGVyLmNvbmZpZyA9IG1ha2VOb0dpdENvbmZpZygpO1xuXHRcdGNvbnN0IHBpY2tlciA9IHN0b3JlLmFkZChzZXJ2aWNlcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBbHdheXNSZW5kZXJDb25maWdQaWNrZXIsIHNlcnZpY2VzLnNlc3Npb25PYnMpKTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRwaWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNvbGF0aW9uU2xvdChjb250YWluZXIpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbmV2ZXIgcmVuZGVycyBhIGNoaXAgZm9yIHRoZSBoaWRkZW4gd29ya3RyZWVCcmFuY2hUcmFjayBjYXJyaWVyIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2VzID0gc2V0dXBTZXJ2aWNlcyhzdG9yZSk7XG5cdFx0c2VydmljZXMucHJvdmlkZXIuY29uZmlnID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXToge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdJc29sYXRpb24nLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSwgZW51bUxhYmVsczogWydGb2xkZXInLCAnV29ya3RyZWUnXSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICd3b3JrdHJlZScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXToge1xuXHRcdFx0XHRcdFx0dGl0bGU6ICdUcmFjayBCcmFuY2gnLCBkZXNjcmlwdGlvbjogJycsIHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLCByZWFkT25seTogdHJ1ZSwgc2Vzc2lvbk11dGFibGU6IGZhbHNlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2tdOiBmYWxzZSB9LFxuXHRcdH0gYXMgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ7XG5cdFx0Y29uc3QgcGlja2VyID0gc3RvcmUuYWRkKHNlcnZpY2VzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFsd2F5c1JlbmRlckNvbmZpZ1BpY2tlciwgc2VydmljZXMuc2Vzc2lvbk9icykpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3QnKS5sZW5ndGgsIDEsICdvbmx5IHRoZSBpc29sYXRpb24gY2hlY2tib3ggcmVuZGVycywgbm90IGEgd29ya3RyZWVCcmFuY2hUcmFjayBjaGlwJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsYUFBYSxRQUFRLG9CQUFvQjtBQUVsRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGFBQWE7QUFDdEIsU0FBcUMsb0NBQW9DO0FBQ3pFLFNBQVMsaUNBQWlDO0FBRzFDLFNBQVMsb0NBQXVEO0FBRWhFLE1BQU0sYUFBYTtBQUduQixTQUFTLGVBQWUsYUFBa0Q7QUFDekUsU0FBTztBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsQ0FBQyxpQkFBaUIsU0FBUyxHQUFH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
