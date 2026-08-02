import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../workbench/services/chat/common/chatEntitlementService.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionTypePicker } from "../../browser/sessionTypePicker.js";
class MockSessionsManagementService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._types = [];
    this._quickChatTypes = [];
    this._typesByFolder = /* @__PURE__ */ new Map();
  }
  setSessionTypes(types) {
    this._types = types;
    this._onDidChangeSessionTypes.fire();
  }
  setSessionTypesForFolder(folderUri, types) {
    this._typesByFolder.set(folderUri.toString(), types);
    this._onDidChangeSessionTypes.fire();
  }
  setQuickChatSessionTypes(types) {
    this._quickChatTypes = types;
    this._onDidChangeSessionTypes.fire();
  }
  getSessionTypesForFolder(folderUri) {
    return this._typesByFolder.get(folderUri.toString()) ?? this._types;
  }
  getQuickChatSessionTypes() {
    return this._quickChatTypes;
  }
}
function createFakeQuickChatSession(providerId, sessionTypeId) {
  return {
    providerId,
    sessionType: sessionTypeId,
    status: constObservable(SessionStatus.Untitled),
    workspace: constObservable(void 0),
    isQuickChat: constObservable(true)
  };
}
function sessionType(providerId, id, label, chatSessionType) {
  return { providerId, sessionType: { id, label, icon: Codicon.terminal, chatSessionType } };
}
function createFakeSession(providerId, sessionTypeId, folderUri, status = SessionStatus.Untitled) {
  const workspace = {
    uri: folderUri,
    label: folderUri.path,
    icon: Codicon.folder,
    folders: [{
      root: folderUri,
      workingDirectory: folderUri,
      name: folderUri.path,
      description: void 0,
      gitRepository: { uri: folderUri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
  return {
    providerId,
    sessionType: sessionTypeId,
    status: constObservable(status),
    workspace: constObservable(workspace)
  };
}
class TestSessionTypePicker extends SessionTypePicker {
  pick(p) {
    this._handleSelectedSessionType(p);
  }
  showPicker() {
    this._showPicker();
  }
}
function createPicker(disposables, session, managementService, storage, options, actionWidgetService = { isVisible: false, hide: () => {
}, show: () => {
} }) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IActionWidgetService, actionWidgetService);
  instantiationService.stub(ISessionsManagementService, managementService);
  instantiationService.stub(ISessionsProvidersService, { getProvider: () => void 0 });
  instantiationService.stub(IStorageService, storage);
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(IChatSessionsService, {
    supportsAutoModelForSessionType: () => false,
    requiresCustomModelsForSessionType: () => false,
    getChatSessionContribution: () => void 0
  });
  instantiationService.stub(IChatEntitlementService, { entitlement: ChatEntitlement.Pro });
  instantiationService.stub(ILanguageModelsService, {
    getLanguageModelIds: () => [],
    lookupLanguageModel: () => void 0
  });
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  return disposables.add(instantiationService.createInstance(TestSessionTypePicker, session, options));
}
suite("SessionTypePicker", () => {
  const disposables = new DisposableStore();
  const folder = URI.file("/project");
  let management;
  let storage;
  let session;
  setup(() => {
    management = disposables.add(new MockSessionsManagementService());
    storage = disposables.add(new TestStorageService());
    session = observableValue("session", void 0);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("preferred session type is the first one and follows session-type changes", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: "local-1", sessionTypeId: "local" });
    management.setSessionTypes([
      sessionType("copilot", "copilot-cli", "Copilot CLI"),
      sessionType("local-1", "local", "Local")
    ]);
    assert.deepStrictEqual(picker.getPreferredSessionType(folder), { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("user picked session type is persisted and survives reload", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    assert.strictEqual(picker.getUserPickedSessionType(), void 0);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    const reloaded = createPicker(disposables, observableValue("session2", void 0), management, storage);
    assert.deepStrictEqual(reloaded.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(reloaded.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("observing an active session does not overwrite the user pick", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    session.set(createFakeSession("local-1", "local", folder), void 0);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "local-1", sessionTypeId: "local" });
    assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("a draft never displays a harness the picker no longer offers", () => {
    management.setSessionTypes([sessionType("local-agent-host", "copilotcli", "Copilot")]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeSession("copilot", "copilotcli", folder), void 0);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "local-agent-host", sessionTypeId: "copilotcli" });
  });
  test("a committed session keeps displaying the harness it runs on", () => {
    management.setSessionTypes([sessionType("local-agent-host", "copilotcli", "Copilot")]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeSession("copilot", "copilotcli", folder, SessionStatus.Completed), void 0);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilotcli" });
  });
  test("a stored pick for a hidden harness does not survive into an offering picker", () => {
    management.setSessionTypes([
      sessionType("local-agent-host", "copilotcli", "Copilot"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    management.setSessionTypes([sessionType("local-agent-host", "copilotcli", "Copilot")]);
    const reloaded = createPicker(disposables, observableValue("session2", void 0), management, storage);
    reloaded.setFolderSource(observableValue("folder", folder));
    assert.deepStrictEqual({
      stored: reloaded.getUserPickedSessionType(),
      selected: reloaded.selectedPick
    }, {
      stored: { providerId: "copilot", sessionTypeId: "copilot-cli" },
      selected: { providerId: "local-agent-host", sessionTypeId: "copilotcli" }
    });
  });
  test("re-selecting the default (first) session type clears the stored pick", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeSession("local-1", "local", folder), void 0);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    picker.pick({ providerId: "local-1", sessionTypeId: "local" });
    assert.strictEqual(picker.getUserPickedSessionType(), void 0);
  });
  test("explicit pick is persisted even when the visible pick is unchanged", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeSession("copilot", "copilot-cli", folder), void 0);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.strictEqual(picker.getUserPickedSessionType(), void 0);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    session.set(createFakeSession("local-1", "local", folder), void 0);
    picker.pick({ providerId: "local-1", sessionTypeId: "local" });
    assert.strictEqual(picker.getUserPickedSessionType(), void 0);
  });
  test("persistSelection false never mutates the shared New Session preference", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI"),
      sessionType("anthropic", "claude", "Claude")
    ]);
    const shared = createPicker(disposables, session, management, storage);
    shared.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    const scopedSession = observableValue("scoped", void 0);
    const scoped = createPicker(disposables, scopedSession, management, storage, { persistSelection: false });
    assert.deepStrictEqual(scoped.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    scopedSession.set(createFakeSession("local-1", "local", folder), void 0);
    scoped.pick({ providerId: "anthropic", sessionTypeId: "claude" });
    assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
    scoped.pick({ providerId: "local-1", sessionTypeId: "local" });
    assert.deepStrictEqual(shared.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("onDidChangeSelectedPick fires when session types are advertised after the picker is created", () => {
    management.setSessionTypes([]);
    const picker = createPicker(disposables, session, management, storage);
    const folderObs = observableValue("folder", folder);
    picker.setFolderSource(folderObs);
    assert.strictEqual(picker.selectedPick, void 0);
    const fired = [];
    disposables.add(picker.onDidChangeSelectedPick((pick) => fired.push(pick)));
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "local-1", sessionTypeId: "local" });
    assert.deepStrictEqual(fired, [{ providerId: "local-1", sessionTypeId: "local" }]);
  });
  test("exposes the selected concrete model target reactively", () => {
    management.setSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("agent-host", "copilotcli", "Copilot CLI", "agent-host-copilotcli")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    const targets = [];
    disposables.add(autorun((reader) => targets.push(picker.modelTargetChatSessionType.read(reader))));
    picker.setFolderSource(observableValue("folder", folder));
    picker.pick({ providerId: "agent-host", sessionTypeId: "copilotcli" });
    assert.deepStrictEqual(targets, [void 0, "local", "agent-host-copilotcli"]);
  });
  test("a quick chat sources its types from the quick-chat list, not the folder list", () => {
    management.setSessionTypes([]);
    management.setQuickChatSessionTypes([
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeQuickChatSession("local-1", "local"), void 0);
    picker.pick({ providerId: "local-1", sessionTypeId: "local" });
    assert.strictEqual(picker.getUserPickedSessionType(), void 0);
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    assert.deepStrictEqual(picker.getUserPickedSessionType(), { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("folder-driven quick-chat mode preserves an unavailable saved target through late discovery", () => {
    const saved = { providerId: "agent-host", sessionTypeId: "copilotcli" };
    management.setQuickChatSessionTypes([
      sessionType("fallback", "fallback", "Fallback")
    ]);
    const picker = createPicker(disposables, session, management, storage, { persistSelection: false });
    picker.setFolderSource(observableValue("folder", void 0), {
      initialPick: saved,
      preserveUnavailableInitialPick: true
    });
    picker.setQuickChatSource(observableValue("quickChat", true));
    const beforeDiscovery = picker.selectedPick;
    management.setQuickChatSessionTypes([
      sessionType("fallback", "fallback", "Fallback"),
      sessionType("agent-host", "copilotcli", "Copilot CLI")
    ]);
    assert.deepStrictEqual({
      beforeDiscovery,
      afterDiscovery: picker.selectedPick
    }, {
      beforeDiscovery: saved,
      afterDiscovery: saved
    });
  });
  test("folder-driven quick-chat mode keeps an available non-default initial pick", () => {
    const proposed = { providerId: "agent-host", sessionTypeId: "copilotcli" };
    management.setQuickChatSessionTypes([
      sessionType("fallback", "fallback", "Fallback"),
      sessionType("agent-host", "copilotcli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage, { persistSelection: false });
    picker.setQuickChatSource(observableValue("quickChat", true));
    picker.setFolderSource(observableValue("folder", void 0), {
      initialPick: proposed
    });
    assert.deepStrictEqual(picker.selectedPick, proposed);
  });
  test("quick-chat mode concretizes a provider-less legacy workspace pick", () => {
    const type = sessionType("agent-host", "copilotcli", "Copilot CLI");
    management.setSessionTypesForFolder(folder, [type]);
    management.setQuickChatSessionTypes([type]);
    const picker = createPicker(disposables, session, management, storage, { persistSelection: false });
    picker.setFolderSource(observableValue("folder", folder), {
      initialPick: { sessionTypeId: "copilotcli" },
      preserveUnavailableInitialPick: true
    });
    const quickChat = observableValue("quickChat", false);
    picker.setQuickChatSource(quickChat);
    const workspacePick = picker.selectedPick;
    quickChat.set(true, void 0);
    assert.deepStrictEqual({
      workspacePick,
      quickChatPick: picker.selectedPick
    }, {
      workspacePick: { sessionTypeId: "copilotcli" },
      quickChatPick: { providerId: "agent-host", sessionTypeId: "copilotcli" }
    });
  });
  test("folder-driven mode ignores the active session and defaults to the folder preferred type", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    session.set(createFakeSession("copilot", "copilot-cli", folderA), void 0);
    picker.setFolderSource(observableValue("folder", folderA));
    assert.deepStrictEqual(picker.selectedPick, { providerId: "local-1", sessionTypeId: "local" });
  });
  test("folder-driven mode seeds the provided initial pick", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    picker.setFolderSource(observableValue("folder", folderA), {
      initialPick: { providerId: "copilot", sessionTypeId: "copilot-cli" }
    });
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("folder-driven mode preserves an unavailable initial pick until its provider appears", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    picker.setFolderSource(observableValue("folder", folderA), {
      initialPick: { providerId: "copilot", sessionTypeId: "copilot-cli" },
      preserveUnavailableInitialPick: true
    });
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("folder-driven mode can replace a pending pick when only one alternative is available", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local")
    ]);
    let pickerShown = false;
    const picker = createPicker(disposables, session, management, storage, void 0, {
      isVisible: false,
      hide: () => {
      },
      show: () => {
        pickerShown = true;
      }
    });
    picker.setFolderSource(observableValue("folder", folderA), {
      initialPick: { providerId: "copilot", sessionTypeId: "copilot-cli" },
      preserveUnavailableInitialPick: true
    });
    picker.render(document.createElement("div"));
    picker.showPicker();
    assert.strictEqual(pickerShown, true);
  });
  test("folder-driven mode re-defaults when a folder change no longer serves the pick", () => {
    const folderA = URI.file("/a");
    const folderB = URI.file("/b");
    management.setSessionTypesForFolder(folderA, [
      sessionType("copilot", "copilot-cli", "Copilot CLI"),
      sessionType("local-1", "local", "Local")
    ]);
    management.setSessionTypesForFolder(folderB, [
      sessionType("local-1", "local", "Local")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    const folderObs = observableValue("folder", folderA);
    picker.setFolderSource(folderObs, { initialPick: { providerId: "copilot", sessionTypeId: "copilot-cli" } });
    folderObs.set(folderB, void 0);
    assert.deepStrictEqual(picker.selectedPick, { providerId: "local-1", sessionTypeId: "local" });
  });
  test("folder-driven mode falls back to the stored user pick when served by the folder", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const seeding = createPicker(disposables, session, management, storage);
    seeding.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    const picker = createPicker(disposables, observableValue("session2", void 0), management, storage);
    picker.setFolderSource(observableValue("folder", folderA));
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
  test("folder-driven mode persists an explicit pick, clears on default, and fires the change event", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    picker.setFolderSource(observableValue("folder", folderA));
    const fired = [];
    disposables.add(picker.onDidSelectSessionType((e) => fired.push(e)));
    picker.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    picker.pick({ providerId: "local-1", sessionTypeId: "local" });
    assert.deepStrictEqual({
      stored: picker.getUserPickedSessionType(),
      selected: picker.selectedPick,
      fired
    }, {
      stored: void 0,
      selected: { providerId: "local-1", sessionTypeId: "local" },
      fired: [
        { providerId: "copilot", sessionTypeId: "copilot-cli" },
        { providerId: "local-1", sessionTypeId: "local" }
      ]
    });
  });
  test("folder-driven mode has no selection until the folder resolves types", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local")
    ]);
    const picker = createPicker(disposables, session, management, storage);
    const folderObs = observableValue("folder", void 0);
    picker.setFolderSource(folderObs);
    const before = picker.selectedPick;
    folderObs.set(folderA, void 0);
    const after = picker.selectedPick;
    assert.deepStrictEqual({ before, after }, {
      before: void 0,
      after: { providerId: "local-1", sessionTypeId: "local" }
    });
  });
  test("folder-driven mode prefers the stored pick over the folder default when the initial pick is unavailable", () => {
    const folderA = URI.file("/a");
    management.setSessionTypesForFolder(folderA, [
      sessionType("local-1", "local", "Local"),
      sessionType("copilot", "copilot-cli", "Copilot CLI")
    ]);
    const seeding = createPicker(disposables, session, management, storage);
    seeding.pick({ providerId: "copilot", sessionTypeId: "copilot-cli" });
    const picker = createPicker(disposables, observableValue("session2", void 0), management, storage);
    picker.setFolderSource(observableValue("folder", folderA), {
      initialPick: { providerId: "claude", sessionTypeId: "claude-code" }
    });
    assert.deepStrictEqual(picker.selectedPick, { providerId: "copilot", sessionTypeId: "copilot-cli" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvc2Vzc2lvblR5cGVQaWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcm92aWRlclNlc3Npb25UeXBlLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVBpY2tlZFNlc3Npb25UeXBlLCBJUHJlZmVycmVkU2Vzc2lvblR5cGUsIElTZXNzaW9uVHlwZVBpY2tlck9wdGlvbnMsIFNlc3Npb25UeXBlUGlja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5cbi8vIC0tLS0gTW9ja3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE1vY2tTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmV2ZW50O1xuXG5cdHByaXZhdGUgX3R5cGVzOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW107XG5cdHByaXZhdGUgX3F1aWNrQ2hhdFR5cGVzOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R5cGVzQnlGb2xkZXIgPSBuZXcgTWFwPHN0cmluZywgSVByb3ZpZGVyU2Vzc2lvblR5cGVbXT4oKTtcblxuXHRzZXRTZXNzaW9uVHlwZXModHlwZXM6IElQcm92aWRlclNlc3Npb25UeXBlW10pOiB2b2lkIHtcblx0XHR0aGlzLl90eXBlcyA9IHR5cGVzO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0fVxuXG5cdHNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmk6IFVSSSwgdHlwZXM6IElQcm92aWRlclNlc3Npb25UeXBlW10pOiB2b2lkIHtcblx0XHR0aGlzLl90eXBlc0J5Rm9sZGVyLnNldChmb2xkZXJVcmkudG9TdHJpbmcoKSwgdHlwZXMpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmZpcmUoKTtcblx0fVxuXG5cdHNldFF1aWNrQ2hhdFNlc3Npb25UeXBlcyh0eXBlczogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3F1aWNrQ2hhdFR5cGVzID0gdHlwZXM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMuZmlyZSgpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlclVyaTogVVJJKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3R5cGVzQnlGb2xkZXIuZ2V0KGZvbGRlclVyaS50b1N0cmluZygpKSA/PyB0aGlzLl90eXBlcztcblx0fVxuXG5cdGdldFF1aWNrQ2hhdFNlc3Npb25UeXBlcygpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcXVpY2tDaGF0VHlwZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRmFrZVF1aWNrQ2hhdFNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0cHJvdmlkZXJJZCxcblx0XHRzZXNzaW9uVHlwZTogc2Vzc2lvblR5cGVJZCxcblx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdGlzUXVpY2tDaGF0OiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbjtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvblR5cGUocHJvdmlkZXJJZDogc3RyaW5nLCBpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBjaGF0U2Vzc2lvblR5cGU/OiBzdHJpbmcpOiBJUHJvdmlkZXJTZXNzaW9uVHlwZSB7XG5cdHJldHVybiB7IHByb3ZpZGVySWQsIHNlc3Npb25UeXBlOiB7IGlkLCBsYWJlbCwgaWNvbjogQ29kaWNvbi50ZXJtaW5hbCwgY2hhdFNlc3Npb25UeXBlIH0gfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRmFrZVNlc3Npb24ocHJvdmlkZXJJZDogc3RyaW5nLCBzZXNzaW9uVHlwZUlkOiBzdHJpbmcsIGZvbGRlclVyaTogVVJJLCBzdGF0dXMgPSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTogSVNlc3Npb24ge1xuXHRjb25zdCB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlID0ge1xuXHRcdHVyaTogZm9sZGVyVXJpLFxuXHRcdGxhYmVsOiBmb2xkZXJVcmkucGF0aCxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0cm9vdDogZm9sZGVyVXJpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogZm9sZGVyVXJpLFxuXHRcdFx0bmFtZTogZm9sZGVyVXJpLnBhdGgsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmk6IGZvbGRlclVyaSwgd29ya1RyZWVVcmk6IHVuZGVmaW5lZCwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0XHR9XSxcblx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHR9O1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGU6IHNlc3Npb25UeXBlSWQsXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoc3RhdHVzKSxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh3b3Jrc3BhY2UpLFxuXHR9IGFzIHVua25vd24gYXMgSVNlc3Npb247XG59XG5cbi8qKiBFeHBvc2VzIHRoZSBwcm90ZWN0ZWQgdXNlci1waWNrIGhhbmRsZXIgc28gdGVzdHMgY2FuIGRyaXZlIHRoZSByZWFsIHdyaXRlIHBhdGguICovXG5jbGFzcyBUZXN0U2Vzc2lvblR5cGVQaWNrZXIgZXh0ZW5kcyBTZXNzaW9uVHlwZVBpY2tlciB7XG5cdHBpY2socDogSVBpY2tlZFNlc3Npb25UeXBlKTogdm9pZCB7XG5cdFx0dGhpcy5faGFuZGxlU2VsZWN0ZWRTZXNzaW9uVHlwZShwKTtcblx0fVxuXG5cdHNob3dQaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBpY2tlcihcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0c2Vzc2lvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4sXG5cdG1hbmFnZW1lbnRTZXJ2aWNlOiBNb2NrU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0c3RvcmFnZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRvcHRpb25zPzogSVNlc3Npb25UeXBlUGlja2VyT3B0aW9ucyxcblx0YWN0aW9uV2lkZ2V0U2VydmljZTogUGFydGlhbDxJQWN0aW9uV2lkZ2V0U2VydmljZT4gPSB7IGlzVmlzaWJsZTogZmFsc2UsIGhpZGU6ICgpID0+IHsgfSwgc2hvdzogKCkgPT4geyB9IH0sXG4pOiBUZXN0U2Vzc2lvblR5cGVQaWNrZXIge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCBhY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbWFuYWdlbWVudFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHsgZ2V0UHJvdmlkZXI6ICgpID0+IHVuZGVmaW5lZCB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRzdXBwb3J0c0F1dG9Nb2RlbEZvclNlc3Npb25UeXBlOiAoKSA9PiBmYWxzZSxcblx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlOiAoKSA9PiBmYWxzZSxcblx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgeyBlbnRpdGxlbWVudDogQ2hhdEVudGl0bGVtZW50LlBybyB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7XG5cdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkczogKCkgPT4gW10sXG5cdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogKCkgPT4gdW5kZWZpbmVkLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFNlc3Npb25UeXBlUGlja2VyLCBzZXNzaW9uLCBvcHRpb25zKSk7XG59XG5cbi8vIC0tLS0gVGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnN1aXRlKCdTZXNzaW9uVHlwZVBpY2tlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgZm9sZGVyID0gVVJJLmZpbGUoJy9wcm9qZWN0Jyk7XG5cblx0bGV0IG1hbmFnZW1lbnQ6IE1vY2tTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZTogVGVzdFN0b3JhZ2VTZXJ2aWNlO1xuXHRsZXQgc2Vzc2lvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1hbmFnZW1lbnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcmVmZXJyZWQgc2Vzc2lvbiB0eXBlIGlzIHRoZSBmaXJzdCBvbmUgYW5kIGZvbGxvd3Mgc2Vzc2lvbi10eXBlIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXMoW1xuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldFByZWZlcnJlZFNlc3Npb25UeXBlKGZvbGRlciksIHsgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBzZXNzaW9uVHlwZUlkOiAnbG9jYWwnIH0pO1xuXG5cdFx0Ly8gQSBsYXRlLXJlZ2lzdGVyaW5nIHByb3ZpZGVyIHByZXBlbmRzIGEgbmV3IHR5cGUgXHUyMTkyIHByZWZlcnJlZCBmb2xsb3dzIGl0LlxuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzKFtcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0UHJlZmVycmVkU2Vzc2lvblR5cGUoZm9sZGVyKSwgeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXIgcGlja2VkIHNlc3Npb24gdHlwZSBpcyBwZXJzaXN0ZWQgYW5kIHN1cnZpdmVzIHJlbG9hZCcsICgpID0+IHtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0Ly8gTm8gZXhwbGljaXQgcGljayB5ZXQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgdW5kZWZpbmVkKTtcblxuXHRcdHBpY2tlci5waWNrKHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgcmVsb2FkOiBhIGZyZXNoIHBpY2tlciByZWFkaW5nIHRoZSBzYW1lIHN0b3JhZ2UgcmVzdG9yZXMgdGhlIHBpY2suXG5cdFx0Y29uc3QgcmVsb2FkZWQgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24yJywgdW5kZWZpbmVkKSwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWxvYWRlZC5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWxvYWRlZC5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0gYXMgSVByZWZlcnJlZFNlc3Npb25UeXBlKTtcblx0fSk7XG5cblx0dGVzdCgnb2JzZXJ2aW5nIGFuIGFjdGl2ZSBzZXNzaW9uIGRvZXMgbm90IG92ZXJ3cml0ZSB0aGUgdXNlciBwaWNrJywgKCkgPT4ge1xuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzKFtcblx0XHRcdHNlc3Npb25UeXBlKCdsb2NhbC0xJywgJ2xvY2FsJywgJ0xvY2FsJyksXG5cdFx0XHRzZXNzaW9uVHlwZSgnY29waWxvdCcsICdjb3BpbG90LWNsaScsICdDb3BpbG90IENMSScpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgc2Vzc2lvbiwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cblx0XHRwaWNrZXIucGljayh7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIEFuIGFjdGl2ZSBzZXNzaW9uIG9mIGEgZGlmZmVyZW50IHR5cGUgYmVjb21lcyBjdXJyZW50LlxuXHRcdHNlc3Npb24uc2V0KGNyZWF0ZUZha2VTZXNzaW9uKCdsb2NhbC0xJywgJ2xvY2FsJywgZm9sZGVyKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFRoZSBpbi1tZW1vcnkgZGlzcGxheSByZWZsZWN0cyB0aGUgYWN0aXZlIHNlc3Npb24sIGJ1dCB0aGUgc3RvcmVkXG5cdFx0Ly8gdXNlciBwaWNrIGlzIHVudG91Y2hlZCAob25seSBhbiBleHBsaWNpdCBwaWNrIGNoYW5nZXMgaXQpLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUGljaywgeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0VXNlclBpY2tlZFNlc3Npb25UeXBlKCksIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGRyYWZ0IG5ldmVyIGRpc3BsYXlzIGEgaGFybmVzcyB0aGUgcGlja2VyIG5vIGxvbmdlciBvZmZlcnMnLCAoKSA9PiB7XG5cdFx0Ly8gYGNoYXQuYWdlbnRzLmNvcGlsb3RDbGkuaGlkZUV4dGVuc2lvbkhvc3RgOiB0aGUgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdFxuXHRcdC8vIENMSSAoJ2NvcGlsb3QnIHByb3ZpZGVyKSBzdG9wcyBiZWluZyBhZHZlcnRpc2VkLCBsZWF2aW5nIG9ubHkgdGhlIGFnZW50XG5cdFx0Ly8gaG9zdCdzIGVudHJ5IFx1MjAxNCB3aGljaCBzaGFyZXMgdGhlICdjb3BpbG90Y2xpJyBzZXNzaW9uIHR5cGUgaWQuXG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXMoW3Nlc3Npb25UeXBlKCdsb2NhbC1hZ2VudC1ob3N0JywgJ2NvcGlsb3RjbGknLCAnQ29waWxvdCcpXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblxuXHRcdC8vIEEgZHJhZnQgbGVmdCBvdmVyIGZyb20gYmVmb3JlIHRoZSBoYXJuZXNzIHdhcyBoaWRkZW4uXG5cdFx0c2Vzc2lvbi5zZXQoY3JlYXRlRmFrZVNlc3Npb24oJ2NvcGlsb3QnLCAnY29waWxvdGNsaScsIGZvbGRlciksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgY29tbWl0dGVkIHNlc3Npb24ga2VlcHMgZGlzcGxheWluZyB0aGUgaGFybmVzcyBpdCBydW5zIG9uJywgKCkgPT4ge1xuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzKFtzZXNzaW9uVHlwZSgnbG9jYWwtYWdlbnQtaG9zdCcsICdjb3BpbG90Y2xpJywgJ0NvcGlsb3QnKV0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgc2Vzc2lvbiwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cblx0XHQvLyBBbiBhbHJlYWR5LWNyZWF0ZWQgZXh0ZW5zaW9uLWhvc3Qgc2Vzc2lvbiByZXBvcnRzIHRoZSB0cnV0aCBhYm91dFxuXHRcdC8vIGl0c2VsZiwgZXZlbiB0aG91Z2ggaXRzIGhhcm5lc3MgaXMgbm8gbG9uZ2VyIG9mZmVyZWQgZm9yIG5ldyBzZXNzaW9ucy5cblx0XHRzZXNzaW9uLnNldChjcmVhdGVGYWtlU2Vzc2lvbignY29waWxvdCcsICdjb3BpbG90Y2xpJywgZm9sZGVyLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3RvcmVkIHBpY2sgZm9yIGEgaGlkZGVuIGhhcm5lc3MgZG9lcyBub3Qgc3Vydml2ZSBpbnRvIGFuIG9mZmVyaW5nIHBpY2tlcicsICgpID0+IHtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtYWdlbnQtaG9zdCcsICdjb3BpbG90Y2xpJywgJ0NvcGlsb3QnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRwaWNrZXIucGljayh7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIFRoZSBleHRlbnNpb24taG9zdCBlbnRyeSBkaXNhcHBlYXJzOyBhIGZyZXNoIHBpY2tlciBtdXN0IG5vdCByZXN0b3JlIGl0XG5cdFx0Ly8gYXMgdGhlIHNlbGVjdGlvbiBqdXN0IGJlY2F1c2Ugc3RvcmFnZSBzdGlsbCBuYW1lcyBpdC5cblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbc2Vzc2lvblR5cGUoJ2xvY2FsLWFnZW50LWhvc3QnLCAnY29waWxvdGNsaScsICdDb3BpbG90JyldKTtcblx0XHRjb25zdCByZWxvYWRlZCA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbjInLCB1bmRlZmluZWQpLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRyZWxvYWRlZC5zZXRGb2xkZXJTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlcikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdG9yZWQ6IHJlbG9hZGVkLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLFxuXHRcdFx0c2VsZWN0ZWQ6IHJlbG9hZGVkLnNlbGVjdGVkUGljayxcblx0XHR9LCB7XG5cdFx0XHRzdG9yZWQ6IHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0sXG5cdFx0XHRzZWxlY3RlZDogeyBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZS1zZWxlY3RpbmcgdGhlIGRlZmF1bHQgKGZpcnN0KSBzZXNzaW9uIHR5cGUgY2xlYXJzIHRoZSBzdG9yZWQgcGljaycsICgpID0+IHtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0Ly8gVGhlIHBpY2tlciByZWZsZWN0cyB0aGUgYWN0aXZlIHNlc3Npb24ncyBmb2xkZXIgdHlwZXMgKHRoZSBwaWNrZXIgaXNcblx0XHQvLyBhbHdheXMgc2hvd24gd2l0aCBhbiBpbi1mbGlnaHQgZHJhZnQgc2Vzc2lvbiBpbiB0aGUgY29tcG9zZXIpLlxuXHRcdHNlc3Npb24uc2V0KGNyZWF0ZUZha2VTZXNzaW9uKCdsb2NhbC0xJywgJ2xvY2FsJywgZm9sZGVyKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFBpY2sgYSBub24tZGVmYXVsdCB0eXBlIFx1MjE5MiBzdG9yZWQuXG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0VXNlclBpY2tlZFNlc3Npb25UeXBlKCksIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXG5cdFx0Ly8gU3dpdGNoIGJhY2sgdG8gdGhlIGRlZmF1bHQgKGZpcnN0KSB0eXBlIFx1MjE5MiBzdG9yZWQgcGljayBpcyBjbGVhcmVkLlxuXHRcdHBpY2tlci5waWNrKHsgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBzZXNzaW9uVHlwZUlkOiAnbG9jYWwnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuZ2V0VXNlclBpY2tlZFNlc3Npb25UeXBlKCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IHBpY2sgaXMgcGVyc2lzdGVkIGV2ZW4gd2hlbiB0aGUgdmlzaWJsZSBwaWNrIGlzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0Ly8gQW4gYWN0aXZlIHNlc3Npb24gb2YgYSBub24tZGVmYXVsdCB0eXBlIGlzIGN1cnJlbnQsIHNvIHRoZSB2aXNpYmxlXG5cdFx0Ly8gcGljayByZWZsZWN0cyBpdCBldmVuIHRob3VnaCBub3RoaW5nIGhhcyBiZWVuIHN0b3JlZCB5ZXQuXG5cdFx0c2Vzc2lvbi5zZXQoY3JlYXRlRmFrZVNlc3Npb24oJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCBmb2xkZXIpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUGljaywgeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIEV4cGxpY2l0bHkgcGlja2luZyB0aGF0IHNhbWUgKGFscmVhZHktdmlzaWJsZSkgbm9uLWRlZmF1bHQgdHlwZSBzdGlsbFxuXHRcdC8vIHBlcnNpc3RzIHRoZSBwcmVmZXJlbmNlLlxuXHRcdHBpY2tlci5waWNrKHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIEV4cGxpY2l0bHkgcGlja2luZyB0aGUgKGFscmVhZHktdmlzaWJsZSkgZGVmYXVsdCB0eXBlIGNsZWFycyBpdCBhZ2Fpbi5cblx0XHRzZXNzaW9uLnNldChjcmVhdGVGYWtlU2Vzc2lvbignbG9jYWwtMScsICdsb2NhbCcsIGZvbGRlciksIHVuZGVmaW5lZCk7XG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncGVyc2lzdFNlbGVjdGlvbiBmYWxzZSBuZXZlciBtdXRhdGVzIHRoZSBzaGFyZWQgTmV3IFNlc3Npb24gcHJlZmVyZW5jZScsICgpID0+IHtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRcdHNlc3Npb25UeXBlKCdhbnRocm9waWMnLCAnY2xhdWRlJywgJ0NsYXVkZScpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIE5ldyBTZXNzaW9uIGNvbXBvc2VyIHN0b3JlZCBhbiBleHBsaWNpdCwgbm9uLWRlZmF1bHQgcHJlZmVyZW5jZS5cblx0XHRjb25zdCBzaGFyZWQgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXHRcdHNoYXJlZC5waWNrKHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hhcmVkLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIFRoZSBhdXRvbWF0aW9ucyBkaWFsb2cgcGlja2VyIHN0aWxsIHJlYWRzIHRoYXQgc3RvcmVkIHByZWZlcmVuY2UgdG8gc2VlZFxuXHRcdC8vIGEgc2Vuc2libGUgZGVmYXVsdCwgYnV0IG11c3QgbmV2ZXIgd3JpdGUgb3IgY2xlYXIgaXQuXG5cdFx0Y29uc3Qgc2NvcGVkU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Njb3BlZCcsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc2NvcGVkID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzY29wZWRTZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlLCB7IHBlcnNpc3RTZWxlY3Rpb246IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2NvcGVkLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblx0XHQvLyBHaXZlIHRoZSBzY29wZWQgcGlja2VyIGEgZm9sZGVyIHNvICdsb2NhbCcgaXMgaXRzIGRlZmF1bHQgdHlwZS5cblx0XHRzY29wZWRTZXNzaW9uLnNldChjcmVhdGVGYWtlU2Vzc2lvbignbG9jYWwtMScsICdsb2NhbCcsIGZvbGRlciksIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBBIGRpZmZlcmVudCBub24tZGVmYXVsdCBwaWNrIHdvdWxkIG5vcm1hbGx5IGJlIHdyaXR0ZW4gXHUyMDE0IGl0IG11c3Qgbm90IGJlLlxuXHRcdHNjb3BlZC5waWNrKHsgcHJvdmlkZXJJZDogJ2FudGhyb3BpYycsIHNlc3Npb25UeXBlSWQ6ICdjbGF1ZGUnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hhcmVkLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIFBpY2tpbmcgdGhlIGRlZmF1bHQgdHlwZSB3b3VsZCBub3JtYWxseSBjbGVhciB0aGUgc3RvcmVkIHBpY2sgXHUyMDE0IGl0IG11c3Qgbm90LlxuXHRcdHNjb3BlZC5waWNrKHsgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBzZXNzaW9uVHlwZUlkOiAnbG9jYWwnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2hhcmVkLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2VTZWxlY3RlZFBpY2sgZmlyZXMgd2hlbiBzZXNzaW9uIHR5cGVzIGFyZSBhZHZlcnRpc2VkIGFmdGVyIHRoZSBwaWNrZXIgaXMgY3JlYXRlZCcsICgpID0+IHtcblx0XHQvLyBObyB0eXBlcyBhZHZlcnRpc2VkIHlldCAoZS5nLiB0aGUgYWdlbnQgaG9zdCBoYXMgbm90IGNvbm5lY3RlZCkuXG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXMoW10pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgc2Vzc2lvbiwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cdFx0Y29uc3QgZm9sZGVyT2JzID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlcik7XG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShmb2xkZXJPYnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRQaWNrLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgZmlyZWQ6IChJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlU2VsZWN0ZWRQaWNrKHBpY2sgPT4gZmlyZWQucHVzaChwaWNrKSkpO1xuXG5cdFx0Ly8gQSBwcm92aWRlciBhZHZlcnRpc2VzIGl0cyB0eXBlcyBsYXRlOyB0aGUgZGlzcGxheWVkIGRlZmF1bHQgc2hpZnRzIG9uIGl0c1xuXHRcdC8vIG93biAobm8gZXhwbGljaXQgdXNlciBwaWNrKSwgYW5kIGNvbnN1bWVycyB0aGF0IGNhY2hlIHRoZSBwaWNrIGFyZSBub3RpZmllZC5cblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUGljaywgeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJlZCwgW3sgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBzZXNzaW9uVHlwZUlkOiAnbG9jYWwnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwb3NlcyB0aGUgc2VsZWN0ZWQgY29uY3JldGUgbW9kZWwgdGFyZ2V0IHJlYWN0aXZlbHknLCAoKSA9PiB7XG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXMoW1xuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdhZ2VudC1ob3N0JywgJ2NvcGlsb3RjbGknLCAnQ29waWxvdCBDTEknLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRjb25zdCB0YXJnZXRzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHRhcmdldHMucHVzaChwaWNrZXIubW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUucmVhZChyZWFkZXIpKSkpO1xuXG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgZm9sZGVyKSk7XG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0cywgW3VuZGVmaW5lZCwgJ2xvY2FsJywgJ2FnZW50LWhvc3QtY29waWxvdGNsaSddKTtcblx0fSk7XG5cblx0dGVzdCgnYSBxdWljayBjaGF0IHNvdXJjZXMgaXRzIHR5cGVzIGZyb20gdGhlIHF1aWNrLWNoYXQgbGlzdCwgbm90IHRoZSBmb2xkZXIgbGlzdCcsICgpID0+IHtcblx0XHQvLyBGb2xkZXIgbGlzdCBpcyBlbXB0eSAod29ya3NwYWNlLWxlc3MpOyBxdWljay1jaGF0IGxpc3QgZHJpdmVzIGRlZmF1bHRzLlxuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzKFtdKTtcblx0XHRtYW5hZ2VtZW50LnNldFF1aWNrQ2hhdFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0c2Vzc2lvbi5zZXQoY3JlYXRlRmFrZVF1aWNrQ2hhdFNlc3Npb24oJ2xvY2FsLTEnLCAnbG9jYWwnKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFBpY2tpbmcgdGhlIGZpcnN0IHF1aWNrLWNoYXQgdHlwZSBpcyBcInRoZSBkZWZhdWx0XCIgXHUyMTkyIHN0b3JlZCBwaWNrIGNsZWFyZWQuXG5cdFx0Ly8gKFdlcmUgdGhlIHBpY2tlciBzdGlsbCBmb2xkZXItc291cmNlZCwgdGhlIGVtcHR5IGZvbGRlciBsaXN0IHdvdWxkIG1ha2Vcblx0XHQvLyBub3RoaW5nIHRoZSBkZWZhdWx0IGFuZCB0aGlzIHdvdWxkIHBlcnNpc3QgaW5zdGVhZC4pXG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFBpY2tpbmcgYSBub24tZmlyc3QgcXVpY2stY2hhdCB0eXBlIGlzIHN0b3JlZC5cblx0XHRwaWNrZXIucGljayh7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKSwgeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlci1kcml2ZW4gcXVpY2stY2hhdCBtb2RlIHByZXNlcnZlcyBhbiB1bmF2YWlsYWJsZSBzYXZlZCB0YXJnZXQgdGhyb3VnaCBsYXRlIGRpc2NvdmVyeScsICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHsgcHJvdmlkZXJJZDogJ2FnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfTtcblx0XHRtYW5hZ2VtZW50LnNldFF1aWNrQ2hhdFNlc3Npb25UeXBlcyhbXG5cdFx0XHRzZXNzaW9uVHlwZSgnZmFsbGJhY2snLCAnZmFsbGJhY2snLCAnRmFsbGJhY2snKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UsIHsgcGVyc2lzdFNlbGVjdGlvbjogZmFsc2UgfSk7XG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgdW5kZWZpbmVkKSwge1xuXHRcdFx0aW5pdGlhbFBpY2s6IHNhdmVkLFxuXHRcdFx0cHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrOiB0cnVlLFxuXHRcdH0pO1xuXHRcdHBpY2tlci5zZXRRdWlja0NoYXRTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlKCdxdWlja0NoYXQnLCB0cnVlKSk7XG5cblx0XHRjb25zdCBiZWZvcmVEaXNjb3ZlcnkgPSBwaWNrZXIuc2VsZWN0ZWRQaWNrO1xuXHRcdG1hbmFnZW1lbnQuc2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKFtcblx0XHRcdHNlc3Npb25UeXBlKCdmYWxsYmFjaycsICdmYWxsYmFjaycsICdGYWxsYmFjaycpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2FnZW50LWhvc3QnLCAnY29waWxvdGNsaScsICdDb3BpbG90IENMSScpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVEaXNjb3ZlcnksXG5cdFx0XHRhZnRlckRpc2NvdmVyeTogcGlja2VyLnNlbGVjdGVkUGljayxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVEaXNjb3Zlcnk6IHNhdmVkLFxuXHRcdFx0YWZ0ZXJEaXNjb3Zlcnk6IHNhdmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXItZHJpdmVuIHF1aWNrLWNoYXQgbW9kZSBrZWVwcyBhbiBhdmFpbGFibGUgbm9uLWRlZmF1bHQgaW5pdGlhbCBwaWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3Bvc2VkID0geyBwcm92aWRlcklkOiAnYWdlbnQtaG9zdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9O1xuXHRcdG1hbmFnZW1lbnQuc2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKFtcblx0XHRcdHNlc3Npb25UeXBlKCdmYWxsYmFjaycsICdmYWxsYmFjaycsICdGYWxsYmFjaycpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2FnZW50LWhvc3QnLCAnY29waWxvdGNsaScsICdDb3BpbG90IENMSScpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgc2Vzc2lvbiwgbWFuYWdlbWVudCwgc3RvcmFnZSwgeyBwZXJzaXN0U2VsZWN0aW9uOiBmYWxzZSB9KTtcblxuXHRcdHBpY2tlci5zZXRRdWlja0NoYXRTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlKCdxdWlja0NoYXQnLCB0cnVlKSk7XG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgdW5kZWZpbmVkKSwge1xuXHRcdFx0aW5pdGlhbFBpY2s6IHByb3Bvc2VkLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRQaWNrLCBwcm9wb3NlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1aWNrLWNoYXQgbW9kZSBjb25jcmV0aXplcyBhIHByb3ZpZGVyLWxlc3MgbGVnYWN5IHdvcmtzcGFjZSBwaWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR5cGUgPSBzZXNzaW9uVHlwZSgnYWdlbnQtaG9zdCcsICdjb3BpbG90Y2xpJywgJ0NvcGlsb3QgQ0xJJyk7XG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyLCBbdHlwZV0pO1xuXHRcdG1hbmFnZW1lbnQuc2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKFt0eXBlXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlLCB7IHBlcnNpc3RTZWxlY3Rpb246IGZhbHNlIH0pO1xuXHRcdHBpY2tlci5zZXRGb2xkZXJTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlciksIHtcblx0XHRcdGluaXRpYWxQaWNrOiB7IHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90Y2xpJyB9LFxuXHRcdFx0cHJlc2VydmVVbmF2YWlsYWJsZUluaXRpYWxQaWNrOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdCA9IG9ic2VydmFibGVWYWx1ZSgncXVpY2tDaGF0JywgZmFsc2UpO1xuXHRcdHBpY2tlci5zZXRRdWlja0NoYXRTb3VyY2UocXVpY2tDaGF0KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VQaWNrID0gcGlja2VyLnNlbGVjdGVkUGljaztcblxuXHRcdHF1aWNrQ2hhdC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya3NwYWNlUGljayxcblx0XHRcdHF1aWNrQ2hhdFBpY2s6IHBpY2tlci5zZWxlY3RlZFBpY2ssXG5cdFx0fSwge1xuXHRcdFx0d29ya3NwYWNlUGljazogeyBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHRcdHF1aWNrQ2hhdFBpY2s6IHsgcHJvdmlkZXJJZDogJ2FnZW50LWhvc3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyLWRyaXZlbiBtb2RlIGlnbm9yZXMgdGhlIGFjdGl2ZSBzZXNzaW9uIGFuZCBkZWZhdWx0cyB0byB0aGUgZm9sZGVyIHByZWZlcnJlZCB0eXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL2EnKTtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJBLCBbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0Ly8gQW4gYWN0aXZlIHNlc3Npb24gb2YgYSBzcGVjaWZpYyB0eXBlIGlzIHByZXNlbnQuLi5cblx0XHRzZXNzaW9uLnNldChjcmVhdGVGYWtlU2Vzc2lvbignY29waWxvdCcsICdjb3BpbG90LWNsaScsIGZvbGRlckEpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gLi4uYnV0IHN3aXRjaGluZyB0byBmb2xkZXItZHJpdmVuIG1vZGUgbWFrZXMgdGhlIGZvbGRlciBhdXRob3JpdGF0aXZlLFxuXHRcdC8vIHNvIHRoZSBkaXNwbGF5IGRlZmF1bHRzIHRvIHRoZSBmb2xkZXIncyBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlLlxuXHRcdHBpY2tlci5zZXRGb2xkZXJTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlckEpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUGljaywgeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlci1kcml2ZW4gbW9kZSBzZWVkcyB0aGUgcHJvdmlkZWQgaW5pdGlhbCBwaWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL2EnKTtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJBLCBbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgZm9sZGVyQSksIHtcblx0XHRcdGluaXRpYWxQaWNrOiB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRQaWNrLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyLWRyaXZlbiBtb2RlIHByZXNlcnZlcyBhbiB1bmF2YWlsYWJsZSBpbml0aWFsIHBpY2sgdW50aWwgaXRzIHByb3ZpZGVyIGFwcGVhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvYScpO1xuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlckEsIFtcblx0XHRcdHNlc3Npb25UeXBlKCdsb2NhbC0xJywgJ2xvY2FsJywgJ0xvY2FsJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblxuXHRcdHBpY2tlci5zZXRGb2xkZXJTb3VyY2Uob2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlckEpLCB7XG5cdFx0XHRpbml0aWFsUGljazogeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSxcblx0XHRcdHByZXNlcnZlVW5hdmFpbGFibGVJbml0aWFsUGljazogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyQSwgW1xuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXItZHJpdmVuIG1vZGUgY2FuIHJlcGxhY2UgYSBwZW5kaW5nIHBpY2sgd2hlbiBvbmx5IG9uZSBhbHRlcm5hdGl2ZSBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvYScpO1xuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlckEsIFtcblx0XHRcdHNlc3Npb25UeXBlKCdsb2NhbC0xJywgJ2xvY2FsJywgJ0xvY2FsJyksXG5cdFx0XSk7XG5cdFx0bGV0IHBpY2tlclNob3duID0gZmFsc2U7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlLCB1bmRlZmluZWQsIHtcblx0XHRcdGlzVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRoaWRlOiAoKSA9PiB7IH0sXG5cdFx0XHRzaG93OiAoKSA9PiB7IHBpY2tlclNob3duID0gdHJ1ZTsgfSxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0Rm9sZGVyU291cmNlKG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCdmb2xkZXInLCBmb2xkZXJBKSwge1xuXHRcdFx0aW5pdGlhbFBpY2s6IHsgcHJvdmlkZXJJZDogJ2NvcGlsb3QnLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdC1jbGknIH0sXG5cdFx0XHRwcmVzZXJ2ZVVuYXZhaWxhYmxlSW5pdGlhbFBpY2s6IHRydWUsXG5cdFx0fSk7XG5cdFx0cGlja2VyLnJlbmRlcihkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cblx0XHRwaWNrZXIuc2hvd1BpY2tlcigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlclNob3duLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyLWRyaXZlbiBtb2RlIHJlLWRlZmF1bHRzIHdoZW4gYSBmb2xkZXIgY2hhbmdlIG5vIGxvbmdlciBzZXJ2ZXMgdGhlIHBpY2snLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvYScpO1xuXHRcdGNvbnN0IGZvbGRlckIgPSBVUkkuZmlsZSgnL2InKTtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJBLCBbXG5cdFx0XHRzZXNzaW9uVHlwZSgnY29waWxvdCcsICdjb3BpbG90LWNsaScsICdDb3BpbG90IENMSScpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRdKTtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJCLCBbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgc2Vzc2lvbiwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cdFx0Y29uc3QgZm9sZGVyT2JzID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4oJ2ZvbGRlcicsIGZvbGRlckEpO1xuXHRcdHBpY2tlci5zZXRGb2xkZXJTb3VyY2UoZm9sZGVyT2JzLCB7IGluaXRpYWxQaWNrOiB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9IH0pO1xuXG5cdFx0Ly8gRm9sZGVyIEIgZG9lcyBub3Qgc2VydmUgY29waWxvdC1jbGksIHNvIHRoZSBwaWNrIHJlLWRlZmF1bHRzIHRvIEIncyBwcmVmZXJyZWQgdHlwZS5cblx0XHRmb2xkZXJPYnMuc2V0KGZvbGRlckIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZFBpY2ssIHsgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBzZXNzaW9uVHlwZUlkOiAnbG9jYWwnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb2xkZXItZHJpdmVuIG1vZGUgZmFsbHMgYmFjayB0byB0aGUgc3RvcmVkIHVzZXIgcGljayB3aGVuIHNlcnZlZCBieSB0aGUgZm9sZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlckEgPSBVUkkuZmlsZSgnL2EnKTtcblx0XHRtYW5hZ2VtZW50LnNldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJBLCBbXG5cdFx0XHRzZXNzaW9uVHlwZSgnbG9jYWwtMScsICdsb2NhbCcsICdMb2NhbCcpLFxuXHRcdFx0c2Vzc2lvblR5cGUoJ2NvcGlsb3QnLCAnY29waWxvdC1jbGknLCAnQ29waWxvdCBDTEknKSxcblx0XHRdKTtcblxuXHRcdC8vIFN0b3JlIGEgbm9uLWRlZmF1bHQgdXNlciBwcmVmZXJlbmNlLlxuXHRcdGNvbnN0IHNlZWRpbmcgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIHNlc3Npb24sIG1hbmFnZW1lbnQsIHN0b3JhZ2UpO1xuXHRcdHNlZWRpbmcucGljayh7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblxuXHRcdC8vIEEgZnJlc2ggZm9sZGVyLWRyaXZlbiBwaWNrZXIgd2l0aCBubyBpbml0aWFsIHBpY2sgcmVzdG9yZXMgdGhhdCBzdG9yZWQgcHJlZmVyZW5jZS5cblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVQaWNrZXIoZGlzcG9zYWJsZXMsIG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24yJywgdW5kZWZpbmVkKSwgbWFuYWdlbWVudCwgc3RvcmFnZSk7XG5cdFx0cGlja2VyLnNldEZvbGRlclNvdXJjZShvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgZm9sZGVyQSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRQaWNrLCB7IHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGVJZDogJ2NvcGlsb3QtY2xpJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyLWRyaXZlbiBtb2RlIHBlcnNpc3RzIGFuIGV4cGxpY2l0IHBpY2ssIGNsZWFycyBvbiBkZWZhdWx0LCBhbmQgZmlyZXMgdGhlIGNoYW5nZSBldmVudCcsICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9hJyk7XG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyQSwgW1xuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRwaWNrZXIuc2V0Rm9sZGVyU291cmNlKG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCdmb2xkZXInLCBmb2xkZXJBKSk7XG5cblx0XHRjb25zdCBmaXJlZDogKElQaWNrZWRTZXNzaW9uVHlwZSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRTZWxlY3RTZXNzaW9uVHlwZShlID0+IGZpcmVkLnB1c2goZSkpKTtcblxuXHRcdC8vIEEgbm9uLWRlZmF1bHQgdHlwZSBpcyBzdG9yZWQ7IHRoZSBmb2xkZXIncyBkZWZhdWx0IChmaXJzdCkgdHlwZSBjbGVhcnMgaXQuXG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdFx0cGlja2VyLnBpY2soeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0b3JlZDogcGlja2VyLmdldFVzZXJQaWNrZWRTZXNzaW9uVHlwZSgpLFxuXHRcdFx0c2VsZWN0ZWQ6IHBpY2tlci5zZWxlY3RlZFBpY2ssXG5cdFx0XHRmaXJlZCxcblx0XHR9LCB7XG5cdFx0XHRzdG9yZWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNlbGVjdGVkOiB7IHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgc2Vzc2lvblR5cGVJZDogJ2xvY2FsJyB9LFxuXHRcdFx0ZmlyZWQ6IFtcblx0XHRcdFx0eyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSxcblx0XHRcdFx0eyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlci1kcml2ZW4gbW9kZSBoYXMgbm8gc2VsZWN0aW9uIHVudGlsIHRoZSBmb2xkZXIgcmVzb2x2ZXMgdHlwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQSA9IFVSSS5maWxlKCcvYScpO1xuXHRcdG1hbmFnZW1lbnQuc2V0U2Vzc2lvblR5cGVzRm9yRm9sZGVyKGZvbGRlckEsIFtcblx0XHRcdHNlc3Npb25UeXBlKCdsb2NhbC0xJywgJ2xvY2FsJywgJ0xvY2FsJyksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRjb25zdCBmb2xkZXJPYnMgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignZm9sZGVyJywgdW5kZWZpbmVkKTtcblx0XHRwaWNrZXIuc2V0Rm9sZGVyU291cmNlKGZvbGRlck9icyk7XG5cblx0XHQvLyBObyBmb2xkZXIgLT4gbm8gdHlwZXMgLT4gbm8gc2VsZWN0aW9uOyBzZWxlY3RpbmcgYSBmb2xkZXIgcmVzb2x2ZXMgdGhlIGRlZmF1bHQuXG5cdFx0Y29uc3QgYmVmb3JlID0gcGlja2VyLnNlbGVjdGVkUGljaztcblx0XHRmb2xkZXJPYnMuc2V0KGZvbGRlckEsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBwaWNrZXIuc2VsZWN0ZWRQaWNrO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGJlZm9yZSwgYWZ0ZXIgfSwge1xuXHRcdFx0YmVmb3JlOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlcjogeyBwcm92aWRlcklkOiAnbG9jYWwtMScsIHNlc3Npb25UeXBlSWQ6ICdsb2NhbCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9sZGVyLWRyaXZlbiBtb2RlIHByZWZlcnMgdGhlIHN0b3JlZCBwaWNrIG92ZXIgdGhlIGZvbGRlciBkZWZhdWx0IHdoZW4gdGhlIGluaXRpYWwgcGljayBpcyB1bmF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJBID0gVVJJLmZpbGUoJy9hJyk7XG5cdFx0bWFuYWdlbWVudC5zZXRTZXNzaW9uVHlwZXNGb3JGb2xkZXIoZm9sZGVyQSwgW1xuXHRcdFx0c2Vzc2lvblR5cGUoJ2xvY2FsLTEnLCAnbG9jYWwnLCAnTG9jYWwnKSxcblx0XHRcdHNlc3Npb25UeXBlKCdjb3BpbG90JywgJ2NvcGlsb3QtY2xpJywgJ0NvcGlsb3QgQ0xJJyksXG5cdFx0XSk7XG5cblx0XHQvLyBTdG9yZSBjb3BpbG90LWNsaSAoYSBub24tZGVmYXVsdCwgZm9sZGVyLXNlcnZlZCBwcmVmZXJlbmNlKS5cblx0XHRjb25zdCBzZWVkaW5nID0gY3JlYXRlUGlja2VyKGRpc3Bvc2FibGVzLCBzZXNzaW9uLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRzZWVkaW5nLnBpY2soeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cblx0XHQvLyBUaGUgaW5pdGlhbCBwaWNrIGlzIGEgdHlwZSB0aGUgZm9sZGVyIGRvZXMgbm90IHNlcnZlLCBzbyBpdCBpcyBkcm9wcGVkIGluXG5cdFx0Ly8gZmF2b3Igb2YgdGhlIHN0b3JlZCBwaWNrIHJhdGhlciB0aGFuIHRoZSBmb2xkZXIncyBwcmVmZXJyZWQgKGZpcnN0KSB0eXBlLlxuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVBpY2tlcihkaXNwb3NhYmxlcywgb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbjInLCB1bmRlZmluZWQpLCBtYW5hZ2VtZW50LCBzdG9yYWdlKTtcblx0XHRwaWNrZXIuc2V0Rm9sZGVyU291cmNlKG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KCdmb2xkZXInLCBmb2xkZXJBKSwge1xuXHRcdFx0aW5pdGlhbFBpY2s6IHsgcHJvdmlkZXJJZDogJ2NsYXVkZScsIHNlc3Npb25UeXBlSWQ6ICdjbGF1ZGUtY29kZScgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkUGljaywgeyBwcm92aWRlcklkOiAnY29waWxvdCcsIHNlc3Npb25UeXBlSWQ6ICdjb3BpbG90LWNsaScgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFNBQVMsaUJBQXNDLHVCQUF1QjtBQUMvRSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxpQkFBaUIsK0JBQStCO0FBQ3pELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUNBQWlDO0FBQzFDLFNBQStCLGtDQUFrQztBQUNqRSxTQUFzQyxxQkFBcUI7QUFDM0QsU0FBK0UseUJBQXlCO0FBSXhHLE1BQU0sc0NBQXNDLFdBQVc7QUFBQSxFQUF2RDtBQUFBO0FBR0MsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RSxTQUFTLDBCQUF1QyxLQUFLLHlCQUF5QjtBQUU5RSxTQUFRLFNBQWlDLENBQUM7QUFDMUMsU0FBUSxrQkFBMEMsQ0FBQztBQUNuRCxTQUFpQixpQkFBaUIsb0JBQUksSUFBb0M7QUFBQTtBQUFBLEVBRTFFLGdCQUFnQixPQUFxQztBQUNwRCxTQUFLLFNBQVM7QUFDZCxTQUFLLHlCQUF5QixLQUFLO0FBQUEsRUFDcEM7QUFBQSxFQUVBLHlCQUF5QixXQUFnQixPQUFxQztBQUM3RSxTQUFLLGVBQWUsSUFBSSxVQUFVLFNBQVMsR0FBRyxLQUFLO0FBQ25ELFNBQUsseUJBQXlCLEtBQUs7QUFBQSxFQUNwQztBQUFBLEVBRUEseUJBQXlCLE9BQXFDO0FB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
