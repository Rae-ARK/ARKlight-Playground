import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { getSelectedModelStorageKey, storeSelectedModel } from "../../../../../workbench/contrib/chat/common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../../workbench/contrib/chat/common/constants.js";
import { resolveModelIdentifier } from "../../../../../workbench/contrib/chat/common/modelSelection.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { SessionModelSelectionModel } from "../../browser/sessionModelSelectionModel.js";
function model(identifier) {
  return {
    identifier,
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: identifier,
      name: identifier,
      vendor: "test",
      version: "1.0",
      family: identifier,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      isDefaultForLocation: {}
    }
  };
}
const first = model("test/first");
const second = model("test/second");
const modelTarget = "type";
const selectedModelStorageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, modelTarget);
function legacyModelPickerStorageKey(providerId, sessionType) {
  return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}
const auto = {
  ...model("copilot/auto"),
  metadata: {
    ...model("copilot/auto").metadata,
    id: "auto",
    isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
  }
};
function createSession(providerId, status, selectedModelId, sessionId = `${providerId}:session`) {
  const modelId = observableValue(`${providerId}.model`, selectedModelId);
  const activeChat = observableValue(`${providerId}.activeChat`, { resource: URI.parse(`chat:/${providerId}/one`) });
  return {
    modelId,
    activeChat,
    session: {
      providerId,
      sessionType: "type",
      sessionId,
      resource: URI.parse(`session:/${providerId}`),
      modelId,
      status: observableValue(`${providerId}.status`, status),
      activeChat
    }
  };
}
function createProvider(id, onSetModel) {
  const modelChanges = new Emitter();
  const provider = {
    id,
    models: [first, second],
    modelChanges,
    writes: [],
    desiredModelIds: [],
    getModelsCalls: 0,
    modelsResolved: true,
    dispose: () => modelChanges.dispose(),
    onDidChangeModels: modelChanges.event,
    getModelsSnapshot(_sessionId, desiredModelId) {
      provider.getModelsCalls++;
      provider.desiredModelIds.push(desiredModelId);
      return { models: provider.models, desiredModelResolution: resolveModelIdentifier(provider.models, desiredModelId, provider.modelsResolved), modelTarget };
    },
    getModelPickerOptions() {
      return {
        useGroupedModelPicker: true,
        showFeatured: true,
        showUnavailableFeatured: false,
        showManageModelsAction: false
      };
    },
    setModel(_sessionId, modelIdentifier) {
      provider.writes.push(modelIdentifier);
      onSetModel?.(modelIdentifier);
    }
  };
  return provider;
}
function createProvidersService(providers) {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    onDidChangeProviders: Event.None,
    getProvider: (id) => byId.get(id)
  };
}
function createConfigurationService(defaultModel) {
  return {
    getValue: (key) => key === ChatConfiguration.DefaultModel ? defaultModel : void 0,
    onDidChangeConfiguration: Event.None
  };
}
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.messages = [];
  }
  debug(message, ...args) {
    this.messages.push(`[debug] ${[message, ...args].join(" ")}`);
  }
  info(message, ...args) {
    this.messages.push(`[info] ${[message, ...args].join(" ")}`);
  }
  error(message, ...args) {
    this.messages.push(`[error] ${[message, ...args].join(" ")}`);
  }
}
suite("SessionModelSelectionModel", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("migrates a legacy Sessions preference and seeds a draft exactly once", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(legacyModelPickerStorageKey("provider", "type"), second.identifier, StorageScope.PROFILE, StorageTarget.MACHINE);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      models: selection.state.get().models.map((model2) => model2.identifier),
      showAutoModel: selection.state.get().options.showAutoModel,
      hasSelectableModel: selection.state.get().hasSelectableModel,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
      writes: provider.writes
    }, {
      current: second.identifier,
      models: [first.identifier, second.identifier],
      showAutoModel: true,
      hasSelectableModel: true,
      stored: second.identifier,
      profileUserKeys: [selectedModelStorageKey],
      writes: [second.identifier]
    });
  });
  test("restores an existing session without writing to its provider", () => {
    const testSession = createSession("provider", SessionStatus.Completed, second.identifier);
    const provider = disposables.add(createProvider("provider"));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: []
    });
  });
  test("restores an untitled draft model without applying fresh-conversation defaults", () => {
    const testSession = createSession("provider", SessionStatus.Untitled, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: first.identifier,
      stored: second.identifier,
      writes: []
    });
  });
  test("replaces the current provider listener on session switch", () => {
    const firstSession = createSession("firstProvider", SessionStatus.Completed, first.identifier);
    const secondSession = createSession("secondProvider", SessionStatus.Completed, second.identifier);
    const firstProvider = disposables.add(createProvider("firstProvider"));
    const secondProvider = disposables.add(createProvider("secondProvider"));
    const session = observableValue("session", firstSession.session);
    const selection = disposables.add(new SessionModelSelectionModel(
      session,
      createProvidersService([firstProvider, secondProvider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    session.set(secondSession.session, void 0);
    const callsAfterSwitch = secondProvider.getModelsCalls;
    firstProvider.modelChanges.fire();
    const callsAfterStaleEvent = secondProvider.getModelsCalls;
    secondProvider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      callsAfterSwitch,
      callsAfterStaleEvent,
      callsAfterCurrentEvent: secondProvider.getModelsCalls
    }, {
      current: second.identifier,
      callsAfterSwitch: 1,
      callsAfterStaleEvent: 1,
      callsAfterCurrentEvent: 2
    });
  });
  test("validates manual selection against a fresh models snapshot", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const selected = selection.selectModel(second.identifier);
    provider.models = [first];
    const rejected = selection.selectModel(second.identifier);
    assert.deepStrictEqual({
      selected,
      rejected,
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      profileUserKeys: storage.keys(StorageScope.PROFILE, StorageTarget.USER).sort(),
      writes: provider.writes
    }, {
      selected: true,
      rejected: false,
      current: second.identifier,
      stored: second.identifier,
      profileUserKeys: [selectedModelStorageKey],
      writes: [second.identifier]
    });
  });
  test("does not remember a selection rejected by the provider", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const storage = disposables.add(new InMemoryStorageService());
    const provider = disposables.add(createProvider("provider", () => {
      throw new Error("rejected");
    }));
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      logService
    ));
    assert.throws(() => selection.selectModel(second.identifier), /rejected/);
    const failureMessage = logService.messages.find((message) => message.includes("event=provider-selection-failed"));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      loggedFailure: failureMessage?.includes('error="Error: rejected"'),
      loggedProviderModelBefore: failureMessage?.includes(`providerModelBefore=${JSON.stringify(first.identifier)}`),
      loggedProviderModelAfter: failureMessage?.includes(`providerModelAfter=${JSON.stringify(first.identifier)}`)
    }, {
      current: first.identifier,
      stored: void 0,
      loggedFailure: true,
      loggedProviderModelBefore: true,
      loggedProviderModelAfter: true
    });
  });
  test("clears a rejected draft selection when the provider has no previous model", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const storage = disposables.add(new InMemoryStorageService());
    const provider = disposables.add(createProvider("provider", () => {
      throw new Error("rejected");
    }));
    provider.models = [];
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    provider.models = [second];
    assert.throws(() => selection.selectModel(second.identifier), /rejected/);
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE)
    }, {
      current: void 0,
      stored: void 0
    });
  });
  test("adopts an external draft selection without duplicating the provider write", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    testSession.modelId.set(second.identifier, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: [first.identifier]
    });
  });
  test("requires a registered provider before enabling send", () => {
    const testSession = createSession("missing", SessionStatus.Untitled);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    assert.deepStrictEqual({
      current: selection.state.get().currentModel,
      models: selection.state.get().models,
      hasSelectableModel: selection.state.get().hasSelectableModel
    }, {
      current: void 0,
      models: [],
      hasSelectableModel: false
    });
  });
  test("waits for arbitrary synthetic models to resolve before repairing a removed model", () => {
    const removedModelId = "removed-cloud-model";
    const testSession = createSession("provider", SessionStatus.Completed, removedModelId);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const beforeResolve = { current: selection.state.get().currentModel?.identifier, writes: [...provider.writes] };
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeResolve,
      afterResolve: { current: selection.state.get().currentModel?.identifier, writes: provider.writes }
    }, {
      beforeResolve: { current: void 0, writes: [] },
      afterResolve: { current: second.identifier, writes: [second.identifier] }
    });
  });
  test("preserves a remembered model while another model resolves first", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const beforeResolve = {
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: [...provider.writes],
      desiredModelIds: [...provider.desiredModelIds]
    };
    provider.models = [first, second];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeResolve,
      afterResolve: {
        current: selection.state.get().currentModel?.identifier,
        pending: selection.state.get().pendingSelection,
        stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
        writes: provider.writes
      }
    }, {
      beforeResolve: {
        current: void 0,
        pending: { reference: second.identifier },
        stored: second.identifier,
        writes: [],
        desiredModelIds: [void 0, second.identifier]
      },
      afterResolve: {
        current: second.identifier,
        pending: void 0,
        stored: second.identifier,
        writes: [second.identifier]
      }
    });
    assert.deepStrictEqual(provider.desiredModelIds, [void 0, second.identifier, void 0, second.identifier, second.identifier]);
  });
  test("replaces but does not remember a provisional first model when the default arrives later", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    provider.models = [first, auto];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: auto.identifier,
      stored: void 0,
      writes: [first.identifier, auto.identifier]
    });
  });
  test("falls back instead of waiting for an inapplicable configured model", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService("missing-family"),
      disposables.add(new NullLogService())
    ));
    const beforeArrival = {
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection
    };
    const configured = {
      ...second,
      metadata: { ...second.metadata, id: "missing-family" }
    };
    provider.models = [first, configured];
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      beforeArrival,
      afterArrival: {
        current: selection.state.get().currentModel?.identifier,
        pending: selection.state.get().pendingSelection
      }
    }, {
      beforeArrival: { current: first.identifier, pending: void 0 },
      afterArrival: { current: configured.identifier, pending: void 0 }
    });
  });
  test("explicit selection cancels a pending remembered-model restore", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    provider.models = [first];
    provider.modelsResolved = false;
    const storage = disposables.add(new InMemoryStorageService());
    storeSelectedModel(storage, ChatAgentLocation.Chat, modelTarget, second.identifier);
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      disposables.add(new NullLogService())
    ));
    const selected = selection.selectModel(first.identifier);
    provider.models = [first, second];
    provider.modelsResolved = true;
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      selected,
      current: selection.state.get().currentModel?.identifier,
      pending: selection.state.get().pendingSelection,
      stored: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      selected: true,
      current: first.identifier,
      pending: void 0,
      stored: first.identifier,
      writes: [first.identifier]
    });
  });
  test("explicit selection survives configured-default refreshes", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    const storedAfterConfiguredDefault = storage.get(selectedModelStorageKey, StorageScope.PROFILE);
    selection.selectModel(first.identifier);
    provider.modelChanges.fire();
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      storedAfterConfiguredDefault,
      storedAfterExplicitSelection: storage.get(selectedModelStorageKey, StorageScope.PROFILE),
      writes: provider.writes
    }, {
      current: first.identifier,
      storedAfterConfiguredDefault: void 0,
      storedAfterExplicitSelection: first.identifier,
      writes: [second.identifier, first.identifier]
    });
  });
  test("reapplies the configured default when an untitled chat is reused", () => {
    const testSession = createSession("provider", SessionStatus.Untitled, first.identifier);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    testSession.activeChat.set({ resource: URI.parse("chat:/provider/two") }, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: second.identifier,
      writes: [second.identifier]
    });
  });
  test("restores a different untitled session from the same provider", () => {
    const firstSession = createSession("provider", SessionStatus.Untitled, second.identifier, "provider:first");
    const secondSession = createSession("provider", SessionStatus.Untitled, first.identifier, "provider:second");
    const provider = disposables.add(createProvider("provider"));
    const session = observableValue("session", firstSession.session);
    const selection = disposables.add(new SessionModelSelectionModel(
      session,
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(second.metadata.id),
      disposables.add(new NullLogService())
    ));
    session.set(secondSession.session, void 0);
    assert.deepStrictEqual({ current: selection.state.get().currentModel?.identifier, writes: provider.writes }, {
      current: first.identifier,
      writes: []
    });
  });
  test("logs persistence decisions, provider outcomes, and external storage conflicts", () => {
    const testSession = createSession("provider", SessionStatus.Untitled);
    const provider = disposables.add(createProvider("provider", (identifier) => testSession.modelId.set(identifier, void 0)));
    const storage = disposables.add(new InMemoryStorageService());
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      storage,
      createConfigurationService(),
      logService
    ));
    selection.selectModel(second.identifier);
    storage.storeAll([{
      key: selectedModelStorageKey,
      value: first.identifier,
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }], true);
    const messages = logService.messages.join("\n");
    assert.deepStrictEqual({
      current: selection.state.get().currentModel?.identifier,
      writes: provider.writes,
      loggedInitialTransition: messages.includes("event=transition") && messages.includes(`storageKey=${JSON.stringify(selectedModelStorageKey)}`) && messages.includes('effect="apply"'),
      loggedAutomaticOutcome: messages.includes("event=provider-automatic-selection-applied") && messages.includes('reason="firstAvailable"'),
      loggedExplicitPersistence: messages.includes("event=provider-selection-applied") && messages.includes(`requestedModel=${JSON.stringify(second.identifier)}`) && messages.includes(`storedModelAfter=${JSON.stringify(second.identifier)}`),
      loggedExternalConflict: messages.includes("event=storage-change") && messages.includes("external=true") && messages.includes("conflictsWithCurrentModel=true") && messages.includes(`storedModel=${JSON.stringify(first.identifier)}`)
    }, {
      current: second.identifier,
      writes: [first.identifier, second.identifier],
      loggedInitialTransition: true,
      loggedAutomaticOutcome: true,
      loggedExplicitPersistence: true,
      loggedExternalConflict: true
    });
  });
  test("logs unchanged provider state after a selection write", () => {
    const testSession = createSession("provider", SessionStatus.Completed, first.identifier);
    const provider = disposables.add(createProvider("provider"));
    const logService = disposables.add(new TestLogService());
    const selection = disposables.add(new SessionModelSelectionModel(
      observableValue("session", testSession.session),
      createProvidersService([provider]),
      disposables.add(new InMemoryStorageService()),
      createConfigurationService(),
      logService
    ));
    selection.selectModel(second.identifier);
    const appliedMessage = logService.messages.find((message) => message.includes("event=provider-selection-applied"));
    assert.deepStrictEqual({
      selected: selection.state.get().currentModel?.identifier,
      providerModel: testSession.modelId.get(),
      loggedProviderModelBefore: appliedMessage?.includes(`providerModelBefore=${JSON.stringify(first.identifier)}`),
      loggedProviderModelAfter: appliedMessage?.includes(`providerModelAfter=${JSON.stringify(first.identifier)}`)
    }, {
      selected: second.identifier,
      providerModel: first.identifier,
      loggedProviderModelBefore: true,
      loggedProviderModelAfter: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC90ZXN0L2Jyb3dzZXIvc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBnZXRTZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgc3RvcmVTZWxlY3RlZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IHJlc29sdmVNb2RlbElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIsIElTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXQsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLmpzJztcblxuZnVuY3Rpb24gbW9kZWwoaWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0aWQ6IGlkZW50aWZpZXIsXG5cdFx0XHRuYW1lOiBpZGVudGlmaWVyLFxuXHRcdFx0dmVuZG9yOiAndGVzdCcsXG5cdFx0XHR2ZXJzaW9uOiAnMS4wJyxcblx0XHRcdGZhbWlseTogaWRlbnRpZmllcixcblx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdH0sXG5cdH07XG59XG5cbmNvbnN0IGZpcnN0ID0gbW9kZWwoJ3Rlc3QvZmlyc3QnKTtcbmNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuY29uc3QgbW9kZWxUYXJnZXQgPSAndHlwZSc7XG5jb25zdCBzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSA9IGdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0KTtcblxuZnVuY3Rpb24gbGVnYWN5TW9kZWxQaWNrZXJTdG9yYWdlS2V5KHByb3ZpZGVySWQ6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgc2Vzc2lvbnMubW9kZWxQaWNrZXIuJHtwcm92aWRlcklkfS4ke3Nlc3Npb25UeXBlfS5zZWxlY3RlZE1vZGVsSWRgO1xufVxuY29uc3QgYXV0byA9IHtcblx0Li4ubW9kZWwoJ2NvcGlsb3QvYXV0bycpLFxuXHRtZXRhZGF0YToge1xuXHRcdC4uLm1vZGVsKCdjb3BpbG90L2F1dG8nKS5tZXRhZGF0YSxcblx0XHRpZDogJ2F1dG8nLFxuXHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9LFxuXHR9LFxufTtcblxuaW50ZXJmYWNlIElUZXN0U2Vzc2lvbiB7XG5cdHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uO1xuXHRyZWFkb25seSBtb2RlbElkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGFjdGl2ZUNoYXQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4+O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHByb3ZpZGVySWQ6IHN0cmluZywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBzZWxlY3RlZE1vZGVsSWQ/OiBzdHJpbmcsIHNlc3Npb25JZCA9IGAke3Byb3ZpZGVySWR9OnNlc3Npb25gKTogSVRlc3RTZXNzaW9uIHtcblx0Y29uc3QgbW9kZWxJZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KGAke3Byb3ZpZGVySWR9Lm1vZGVsYCwgc2VsZWN0ZWRNb2RlbElkKTtcblx0Y29uc3QgYWN0aXZlQ2hhdCA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdD4oYCR7cHJvdmlkZXJJZH0uYWN0aXZlQ2hhdGAsIHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgY2hhdDovJHtwcm92aWRlcklkfS9vbmVgKSB9IGFzIElDaGF0KTtcblx0cmV0dXJuIHtcblx0XHRtb2RlbElkLFxuXHRcdGFjdGl2ZUNoYXQsXG5cdFx0c2Vzc2lvbjoge1xuXHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25UeXBlOiAndHlwZScsXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGBzZXNzaW9uOi8ke3Byb3ZpZGVySWR9YCksXG5cdFx0XHRtb2RlbElkLFxuXHRcdFx0c3RhdHVzOiBvYnNlcnZhYmxlVmFsdWUoYCR7cHJvdmlkZXJJZH0uc3RhdHVzYCwgc3RhdHVzKSxcblx0XHRcdGFjdGl2ZUNoYXQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElBY3RpdmVTZXNzaW9uLFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVRlc3RQcm92aWRlciBleHRlbmRzIElTZXNzaW9uc1Byb3ZpZGVyIHtcblx0bW9kZWxzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgbW9kZWxDaGFuZ2VzOiBFbWl0dGVyPHZvaWQ+O1xuXHRyZWFkb25seSB3cml0ZXM6IHN0cmluZ1tdO1xuXHRyZWFkb25seSBkZXNpcmVkTW9kZWxJZHM6IChzdHJpbmcgfCB1bmRlZmluZWQpW107XG5cdGdldE1vZGVsc0NhbGxzOiBudW1iZXI7XG5cdG1vZGVsc1Jlc29sdmVkOiBib29sZWFuO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKGlkOiBzdHJpbmcsIG9uU2V0TW9kZWw/OiAobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpID0+IHZvaWQpOiBJVGVzdFByb3ZpZGVyIHtcblx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0Y29uc3QgcHJvdmlkZXIgPSB7XG5cdFx0aWQsXG5cdFx0bW9kZWxzOiBbZmlyc3QsIHNlY29uZF0sXG5cdFx0bW9kZWxDaGFuZ2VzLFxuXHRcdHdyaXRlczogW10sXG5cdFx0ZGVzaXJlZE1vZGVsSWRzOiBbXSxcblx0XHRnZXRNb2RlbHNDYWxsczogMCxcblx0XHRtb2RlbHNSZXNvbHZlZDogdHJ1ZSxcblx0XHRkaXNwb3NlOiAoKSA9PiBtb2RlbENoYW5nZXMuZGlzcG9zZSgpLFxuXHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBtb2RlbENoYW5nZXMuZXZlbnQsXG5cdFx0Z2V0TW9kZWxzU25hcHNob3QoX3Nlc3Npb25JZDogc3RyaW5nLCBkZXNpcmVkTW9kZWxJZD86IHN0cmluZykge1xuXHRcdFx0cHJvdmlkZXIuZ2V0TW9kZWxzQ2FsbHMrKztcblx0XHRcdHByb3ZpZGVyLmRlc2lyZWRNb2RlbElkcy5wdXNoKGRlc2lyZWRNb2RlbElkKTtcblx0XHRcdHJldHVybiB7IG1vZGVsczogcHJvdmlkZXIubW9kZWxzLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHZlTW9kZWxJZGVudGlmaWVyKHByb3ZpZGVyLm1vZGVscywgZGVzaXJlZE1vZGVsSWQsIHByb3ZpZGVyLm1vZGVsc1Jlc29sdmVkKSwgbW9kZWxUYXJnZXQgfTtcblx0XHR9LFxuXHRcdGdldE1vZGVsUGlja2VyT3B0aW9ucygpOiBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHRydWUsXG5cdFx0XHRcdHNob3dGZWF0dXJlZDogdHJ1ZSxcblx0XHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLFxuXHRcdFx0XHRzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fSxcblx0XHRzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKSB7XG5cdFx0XHRwcm92aWRlci53cml0ZXMucHVzaChtb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0b25TZXRNb2RlbD8uKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElUZXN0UHJvdmlkZXI7XG5cdHJldHVybiBwcm92aWRlcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXJzU2VydmljZShwcm92aWRlcnM6IHJlYWRvbmx5IElUZXN0UHJvdmlkZXJbXSk6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uge1xuXHRjb25zdCBieUlkID0gbmV3IE1hcChwcm92aWRlcnMubWFwKHByb3ZpZGVyID0+IFtwcm92aWRlci5pZCwgcHJvdmlkZXJdKSk7XG5cdHJldHVybiB7XG5cdFx0b25EaWRDaGFuZ2VQcm92aWRlcnM6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0UHJvdmlkZXI6IGlkID0+IGJ5SWQuZ2V0KGlkKSxcblx0fSBhcyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShkZWZhdWx0TW9kZWw/OiBzdHJpbmcpOiBJQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGdldFZhbHVlOiBrZXkgPT4ga2V5ID09PSBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0TW9kZWwgPyBkZWZhdWx0TW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFdmVudC5Ob25lIGFzIEV2ZW50PElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+LFxuXHR9IGFzIElDb25maWd1cmF0aW9uU2VydmljZTtcbn1cblxuY2xhc3MgVGVzdExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdHJlYWRvbmx5IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlcy5wdXNoKGBbZGVidWddICR7W21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKX1gKTtcblx0fVxuXG5cdG92ZXJyaWRlIGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2goYFtpbmZvXSAke1ttZXNzYWdlLCAuLi5hcmdzXS5qb2luKCcgJyl9YCk7XG5cdH1cblxuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlcy5wdXNoKGBbZXJyb3JdICR7W21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKX1gKTtcblx0fVxufVxuXG5zdWl0ZSgnU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtaWdyYXRlcyBhIGxlZ2FjeSBTZXNzaW9ucyBwcmVmZXJlbmNlIGFuZCBzZWVkcyBhIGRyYWZ0IGV4YWN0bHkgb25jZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKGxlZ2FjeU1vZGVsUGlja2VyU3RvcmFnZUtleSgncHJvdmlkZXInLCAndHlwZScpLCBzZWNvbmQuaWRlbnRpZmllciwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRtb2RlbHM6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5tb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLm9wdGlvbnMuc2hvd0F1dG9Nb2RlbCxcblx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmhhc1NlbGVjdGFibGVNb2RlbCxcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHByb2ZpbGVVc2VyS2V5czogc3RvcmFnZS5rZXlzKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpLnNvcnQoKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0bW9kZWxzOiBbZmlyc3QuaWRlbnRpZmllciwgc2Vjb25kLmlkZW50aWZpZXJdLFxuXHRcdFx0c2hvd0F1dG9Nb2RlbDogdHJ1ZSxcblx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogdHJ1ZSxcblx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm9maWxlVXNlcktleXM6IFtzZWxlY3RlZE1vZGVsU3RvcmFnZUtleV0sXG5cdFx0XHR3cml0ZXM6IFtzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGFuIGV4aXN0aW5nIHNlc3Npb24gd2l0aG91dCB3cml0aW5nIHRvIGl0cyBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLCB3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyB9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGFuIHVudGl0bGVkIGRyYWZ0IG1vZGVsIHdpdGhvdXQgYXBwbHlpbmcgZnJlc2gtY29udmVyc2F0aW9uIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLCBmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yZVNlbGVjdGVkTW9kZWwoc3RvcmFnZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZWxUYXJnZXQsIHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRzdG9yZWQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0d3JpdGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgdGhlIGN1cnJlbnQgcHJvdmlkZXIgbGlzdGVuZXIgb24gc2Vzc2lvbiBzd2l0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignZmlyc3RQcm92aWRlcicsIFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignc2Vjb25kUHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgc2Vjb25kLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGZpcnN0UHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ2ZpcnN0UHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2Vjb25kUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3NlY29uZFByb3ZpZGVyJykpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgZmlyc3RTZXNzaW9uLnNlc3Npb24pO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbZmlyc3RQcm92aWRlciwgc2Vjb25kUHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0c2Vzc2lvbi5zZXQoc2Vjb25kU2Vzc2lvbi5zZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGNhbGxzQWZ0ZXJTd2l0Y2ggPSBzZWNvbmRQcm92aWRlci5nZXRNb2RlbHNDYWxscztcblx0XHRmaXJzdFByb3ZpZGVyLm1vZGVsQ2hhbmdlcy5maXJlKCk7XG5cdFx0Y29uc3QgY2FsbHNBZnRlclN0YWxlRXZlbnQgPSBzZWNvbmRQcm92aWRlci5nZXRNb2RlbHNDYWxscztcblx0XHRzZWNvbmRQcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0Y2FsbHNBZnRlclN3aXRjaCxcblx0XHRcdGNhbGxzQWZ0ZXJTdGFsZUV2ZW50LFxuXHRcdFx0Y2FsbHNBZnRlckN1cnJlbnRFdmVudDogc2Vjb25kUHJvdmlkZXIuZ2V0TW9kZWxzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRjYWxsc0FmdGVyU3dpdGNoOiAxLFxuXHRcdFx0Y2FsbHNBZnRlclN0YWxlRXZlbnQ6IDEsXG5cdFx0XHRjYWxsc0FmdGVyQ3VycmVudEV2ZW50OiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZXMgbWFudWFsIHNlbGVjdGlvbiBhZ2FpbnN0IGEgZnJlc2ggbW9kZWxzIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJykpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IHNlbGVjdGlvbi5zZWxlY3RNb2RlbChzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0XTtcblx0XHRjb25zdCByZWplY3RlZCA9IHNlbGVjdGlvbi5zZWxlY3RNb2RlbChzZWNvbmQuaWRlbnRpZmllcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0cmVqZWN0ZWQsXG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdFx0cHJvZmlsZVVzZXJLZXlzOiBzdG9yYWdlLmtleXMoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUikuc29ydCgpLFxuXHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0fSwge1xuXHRcdFx0c2VsZWN0ZWQ6IHRydWUsXG5cdFx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm9maWxlVXNlcktleXM6IFtzZWxlY3RlZE1vZGVsU3RvcmFnZUtleV0sXG5cdFx0XHR3cml0ZXM6IFtzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlbWVtYmVyIGEgc2VsZWN0aW9uIHJlamVjdGVkIGJ5IHRoZSBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGZpcnN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkJyk7IH0pKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKSwgL3JlamVjdGVkLyk7XG5cdFx0Y29uc3QgZmFpbHVyZU1lc3NhZ2UgPSBsb2dTZXJ2aWNlLm1lc3NhZ2VzLmZpbmQobWVzc2FnZSA9PiBtZXNzYWdlLmluY2x1ZGVzKCdldmVudD1wcm92aWRlci1zZWxlY3Rpb24tZmFpbGVkJykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdGxvZ2dlZEZhaWx1cmU6IGZhaWx1cmVNZXNzYWdlPy5pbmNsdWRlcygnZXJyb3I9XCJFcnJvcjogcmVqZWN0ZWRcIicpLFxuXHRcdFx0bG9nZ2VkUHJvdmlkZXJNb2RlbEJlZm9yZTogZmFpbHVyZU1lc3NhZ2U/LmluY2x1ZGVzKGBwcm92aWRlck1vZGVsQmVmb3JlPSR7SlNPTi5zdHJpbmdpZnkoZmlyc3QuaWRlbnRpZmllcil9YCksXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQWZ0ZXI6IGZhaWx1cmVNZXNzYWdlPy5pbmNsdWRlcyhgcHJvdmlkZXJNb2RlbEFmdGVyPSR7SlNPTi5zdHJpbmdpZnkoZmlyc3QuaWRlbnRpZmllcil9YCksXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdFx0bG9nZ2VkRmFpbHVyZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxCZWZvcmU6IHRydWUsXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQWZ0ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyBhIHJlamVjdGVkIGRyYWZ0IHNlbGVjdGlvbiB3aGVuIHRoZSBwcm92aWRlciBoYXMgbm8gcHJldmlvdXMgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlamVjdGVkJyk7IH0pKTtcblx0XHRwcm92aWRlci5tb2RlbHMgPSBbXTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblx0XHRwcm92aWRlci5tb2RlbHMgPSBbc2Vjb25kXTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKSwgL3JlamVjdGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZG9wdHMgYW4gZXh0ZXJuYWwgZHJhZnQgc2VsZWN0aW9uIHdpdGhvdXQgZHVwbGljYXRpbmcgdGhlIHByb3ZpZGVyIHdyaXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0dGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoc2Vjb25kLmlkZW50aWZpZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBwcm92aWRlci53cml0ZXMgfSwge1xuXHRcdFx0Y3VycmVudDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHR3cml0ZXM6IFtmaXJzdC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgYSByZWdpc3RlcmVkIHByb3ZpZGVyIGJlZm9yZSBlbmFibGluZyBzZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignbWlzc2luZycsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsLFxuXHRcdFx0bW9kZWxzOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkubW9kZWxzLFxuXHRcdFx0aGFzU2VsZWN0YWJsZU1vZGVsOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuaGFzU2VsZWN0YWJsZU1vZGVsLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRoYXNTZWxlY3RhYmxlTW9kZWw6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYXJiaXRyYXJ5IHN5bnRoZXRpYyBtb2RlbHMgdG8gcmVzb2x2ZSBiZWZvcmUgcmVwYWlyaW5nIGEgcmVtb3ZlZCBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCByZW1vdmVkTW9kZWxJZCA9ICdyZW1vdmVkLWNsb3VkLW1vZGVsJztcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHJlbW92ZWRNb2RlbElkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmVTZWxlY3RlZE1vZGVsKHN0b3JhZ2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0LCBzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x2ZSA9IHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBbLi4ucHJvdmlkZXIud3JpdGVzXSB9O1xuXHRcdHByb3ZpZGVyLm1vZGVsc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVSZXNvbHZlLFxuXHRcdFx0YWZ0ZXJSZXNvbHZlOiB7IGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsIHdyaXRlczogcHJvdmlkZXIud3JpdGVzIH0sXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlUmVzb2x2ZTogeyBjdXJyZW50OiB1bmRlZmluZWQsIHdyaXRlczogW10gfSxcblx0XHRcdGFmdGVyUmVzb2x2ZTogeyBjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllciwgd3JpdGVzOiBbc2Vjb25kLmlkZW50aWZpZXJdIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhIHJlbWVtYmVyZWQgbW9kZWwgd2hpbGUgYW5vdGhlciBtb2RlbCByZXNvbHZlcyBmaXJzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0XTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmVTZWxlY3RlZE1vZGVsKHN0b3JhZ2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0LCBzZWNvbmQuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x2ZSA9IHtcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkucGVuZGluZ1NlbGVjdGlvbixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogWy4uLnByb3ZpZGVyLndyaXRlc10sXG5cdFx0XHRkZXNpcmVkTW9kZWxJZHM6IFsuLi5wcm92aWRlci5kZXNpcmVkTW9kZWxJZHNdLFxuXHRcdH07XG5cblx0XHRwcm92aWRlci5tb2RlbHMgPSBbZmlyc3QsIHNlY29uZF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdHByb3ZpZGVyLm1vZGVsQ2hhbmdlcy5maXJlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZVJlc29sdmUsXG5cdFx0XHRhZnRlclJlc29sdmU6IHtcblx0XHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdFx0cGVuZGluZzogc2VsZWN0aW9uLnN0YXRlLmdldCgpLnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZVJlc29sdmU6IHtcblx0XHRcdFx0Y3VycmVudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwZW5kaW5nOiB7IHJlZmVyZW5jZTogc2Vjb25kLmlkZW50aWZpZXIgfSxcblx0XHRcdFx0c3RvcmVkOiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdFx0d3JpdGVzOiBbXSxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsSWRzOiBbdW5kZWZpbmVkLCBzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0XHR9LFxuXHRcdFx0YWZ0ZXJSZXNvbHZlOiB7XG5cdFx0XHRcdGN1cnJlbnQ6IHNlY29uZC5pZGVudGlmaWVyLFxuXHRcdFx0XHRwZW5kaW5nOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0b3JlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5kZXNpcmVkTW9kZWxJZHMsIFt1bmRlZmluZWQsIHNlY29uZC5pZGVudGlmaWVyLCB1bmRlZmluZWQsIHNlY29uZC5pZGVudGlmaWVyLCBzZWNvbmQuaWRlbnRpZmllcl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlcyBidXQgZG9lcyBub3QgcmVtZW1iZXIgYSBwcm92aXNpb25hbCBmaXJzdCBtb2RlbCB3aGVuIHRoZSBkZWZhdWx0IGFycml2ZXMgbGF0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicsIGlkZW50aWZpZXIgPT4gdGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoaWRlbnRpZmllciwgdW5kZWZpbmVkKSkpO1xuXHRcdHByb3ZpZGVyLm1vZGVscyA9IFtmaXJzdF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBhdXRvXTtcblx0XHRwcm92aWRlci5tb2RlbHNSZXNvbHZlZCA9IHRydWU7XG5cdFx0cHJvdmlkZXIubW9kZWxDaGFuZ2VzLmZpcmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnQ6IGF1dG8uaWRlbnRpZmllcixcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdFx0d3JpdGVzOiBbZmlyc3QuaWRlbnRpZmllciwgYXV0by5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayBpbnN0ZWFkIG9mIHdhaXRpbmcgZm9yIGFuIGluYXBwbGljYWJsZSBjb25maWd1cmVkIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCdtaXNzaW5nLWZhbWlseScpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGJlZm9yZUFycml2YWwgPSB7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0cGVuZGluZzogc2VsZWN0aW9uLnN0YXRlLmdldCgpLnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0fTtcblx0XHRjb25zdCBjb25maWd1cmVkID0ge1xuXHRcdFx0Li4uc2Vjb25kLFxuXHRcdFx0bWV0YWRhdGE6IHsgLi4uc2Vjb25kLm1ldGFkYXRhLCBpZDogJ21pc3NpbmctZmFtaWx5JyB9LFxuXHRcdH07XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBjb25maWd1cmVkXTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVBcnJpdmFsLFxuXHRcdFx0YWZ0ZXJBcnJpdmFsOiB7XG5cdFx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRcdHBlbmRpbmc6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5wZW5kaW5nU2VsZWN0aW9uLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVBcnJpdmFsOiB7IGN1cnJlbnQ6IGZpcnN0LmlkZW50aWZpZXIsIHBlbmRpbmc6IHVuZGVmaW5lZCB9LFxuXHRcdFx0YWZ0ZXJBcnJpdmFsOiB7IGN1cnJlbnQ6IGNvbmZpZ3VyZWQuaWRlbnRpZmllciwgcGVuZGluZzogdW5kZWZpbmVkIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IHNlbGVjdGlvbiBjYW5jZWxzIGEgcGVuZGluZyByZW1lbWJlcmVkLW1vZGVsIHJlc3RvcmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicsIGlkZW50aWZpZXIgPT4gdGVzdFNlc3Npb24ubW9kZWxJZC5zZXQoaWRlbnRpZmllciwgdW5kZWZpbmVkKSkpO1xuXHRcdHByb3ZpZGVyLm1vZGVscyA9IFtmaXJzdF07XG5cdFx0cHJvdmlkZXIubW9kZWxzUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JlU2VsZWN0ZWRNb2RlbChzdG9yYWdlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlbFRhcmdldCwgc2Vjb25kLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzZWxlY3Rpb24uc2VsZWN0TW9kZWwoZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0cHJvdmlkZXIubW9kZWxzID0gW2ZpcnN0LCBzZWNvbmRdO1xuXHRcdHByb3ZpZGVyLm1vZGVsc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZCxcblx0XHRcdGN1cnJlbnQ6IHNlbGVjdGlvbi5zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkucGVuZGluZ1NlbGVjdGlvbixcblx0XHRcdHN0b3JlZDogc3RvcmFnZS5nZXQoc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHRcdHdyaXRlczogcHJvdmlkZXIud3JpdGVzLFxuXHRcdH0sIHtcblx0XHRcdHNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdHN0b3JlZDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW2ZpcnN0LmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBzZWxlY3Rpb24gc3Vydml2ZXMgY29uZmlndXJlZC1kZWZhdWx0IHJlZnJlc2hlcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHN0b3JlZEFmdGVyQ29uZmlndXJlZERlZmF1bHQgPSBzdG9yYWdlLmdldChzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdHNlbGVjdGlvbi5zZWxlY3RNb2RlbChmaXJzdC5pZGVudGlmaWVyKTtcblx0XHRwcm92aWRlci5tb2RlbENoYW5nZXMuZmlyZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkQWZ0ZXJDb25maWd1cmVkRGVmYXVsdCxcblx0XHRcdHN0b3JlZEFmdGVyRXhwbGljaXRTZWxlY3Rpb246IHN0b3JhZ2UuZ2V0KHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSksXG5cdFx0XHR3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0c3RvcmVkQWZ0ZXJDb25maWd1cmVkRGVmYXVsdDogdW5kZWZpbmVkLFxuXHRcdFx0c3RvcmVkQWZ0ZXJFeHBsaWNpdFNlbGVjdGlvbjogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyLCBmaXJzdC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhcHBsaWVzIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgd2hlbiBhbiB1bnRpdGxlZCBjaGF0IGlzIHJldXNlZCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgZmlyc3QuaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlUHJvdmlkZXIoJ3Byb3ZpZGVyJywgaWRlbnRpZmllciA9PiB0ZXN0U2Vzc2lvbi5tb2RlbElkLnNldChpZGVudGlmaWVyLCB1bmRlZmluZWQpKSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCB0ZXN0U2Vzc2lvbi5zZXNzaW9uKSxcblx0XHRcdGNyZWF0ZVByb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSksXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSksXG5cdFx0XHRjcmVhdGVDb25maWd1cmF0aW9uU2VydmljZShzZWNvbmQubWV0YWRhdGEuaWQpLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHQpKTtcblxuXHRcdHRlc3RTZXNzaW9uLmFjdGl2ZUNoYXQuc2V0KHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdDovcHJvdmlkZXIvdHdvJykgfSBhcyBJQ2hhdCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLCB3cml0ZXM6IHByb3ZpZGVyLndyaXRlcyB9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW3NlY29uZC5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSBkaWZmZXJlbnQgdW50aXRsZWQgc2Vzc2lvbiBmcm9tIHRoZSBzYW1lIHByb3ZpZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCwgc2Vjb25kLmlkZW50aWZpZXIsICdwcm92aWRlcjpmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcicsIFNlc3Npb25TdGF0dXMuVW50aXRsZWQsIGZpcnN0LmlkZW50aWZpZXIsICdwcm92aWRlcjpzZWNvbmQnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Nlc3Npb24nLCBmaXJzdFNlc3Npb24uc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbChcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvblNlcnZpY2Uoc2Vjb25kLm1ldGFkYXRhLmlkKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0KSk7XG5cblx0XHRzZXNzaW9uLnNldChzZWNvbmRTZXNzaW9uLnNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY3VycmVudDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgd3JpdGVzOiBwcm92aWRlci53cml0ZXMgfSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3MgcGVyc2lzdGVuY2UgZGVjaXNpb25zLCBwcm92aWRlciBvdXRjb21lcywgYW5kIGV4dGVybmFsIHN0b3JhZ2UgY29uZmxpY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXInLCBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCBpZGVudGlmaWVyID0+IHRlc3RTZXNzaW9uLm1vZGVsSWQuc2V0KGlkZW50aWZpZXIsIHVuZGVmaW5lZCkpKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwoXG5cdFx0XHRvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdzZXNzaW9uJywgdGVzdFNlc3Npb24uc2Vzc2lvbiksXG5cdFx0XHRjcmVhdGVQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0c2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRzdG9yYWdlLnN0b3JlQWxsKFt7XG5cdFx0XHRrZXk6IHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LFxuXHRcdFx0dmFsdWU6IGZpcnN0LmlkZW50aWZpZXIsXG5cdFx0XHRzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsXG5cdFx0XHR0YXJnZXQ6IFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHR9XSwgdHJ1ZSk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBsb2dTZXJ2aWNlLm1lc3NhZ2VzLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBzZWxlY3Rpb24uc3RhdGUuZ2V0KCkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0d3JpdGVzOiBwcm92aWRlci53cml0ZXMsXG5cdFx0XHRsb2dnZWRJbml0aWFsVHJhbnNpdGlvbjogbWVzc2FnZXMuaW5jbHVkZXMoJ2V2ZW50PXRyYW5zaXRpb24nKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgc3RvcmFnZUtleT0ke0pTT04uc3RyaW5naWZ5KHNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KX1gKSAmJiBtZXNzYWdlcy5pbmNsdWRlcygnZWZmZWN0PVwiYXBwbHlcIicpLFxuXHRcdFx0bG9nZ2VkQXV0b21hdGljT3V0Y29tZTogbWVzc2FnZXMuaW5jbHVkZXMoJ2V2ZW50PXByb3ZpZGVyLWF1dG9tYXRpYy1zZWxlY3Rpb24tYXBwbGllZCcpICYmIG1lc3NhZ2VzLmluY2x1ZGVzKCdyZWFzb249XCJmaXJzdEF2YWlsYWJsZVwiJyksXG5cdFx0XHRsb2dnZWRFeHBsaWNpdFBlcnNpc3RlbmNlOiBtZXNzYWdlcy5pbmNsdWRlcygnZXZlbnQ9cHJvdmlkZXItc2VsZWN0aW9uLWFwcGxpZWQnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgcmVxdWVzdGVkTW9kZWw9JHtKU09OLnN0cmluZ2lmeShzZWNvbmQuaWRlbnRpZmllcil9YCkgJiYgbWVzc2FnZXMuaW5jbHVkZXMoYHN0b3JlZE1vZGVsQWZ0ZXI9JHtKU09OLnN0cmluZ2lmeShzZWNvbmQuaWRlbnRpZmllcil9YCksXG5cdFx0XHRsb2dnZWRFeHRlcm5hbENvbmZsaWN0OiBtZXNzYWdlcy5pbmNsdWRlcygnZXZlbnQ9c3RvcmFnZS1jaGFuZ2UnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcygnZXh0ZXJuYWw9dHJ1ZScpICYmIG1lc3NhZ2VzLmluY2x1ZGVzKCdjb25mbGljdHNXaXRoQ3VycmVudE1vZGVsPXRydWUnKSAmJiBtZXNzYWdlcy5pbmNsdWRlcyhgc3RvcmVkTW9kZWw9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdHdyaXRlczogW2ZpcnN0LmlkZW50aWZpZXIsIHNlY29uZC5pZGVudGlmaWVyXSxcblx0XHRcdGxvZ2dlZEluaXRpYWxUcmFuc2l0aW9uOiB0cnVlLFxuXHRcdFx0bG9nZ2VkQXV0b21hdGljT3V0Y29tZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZEV4cGxpY2l0UGVyc2lzdGVuY2U6IHRydWUsXG5cdFx0XHRsb2dnZWRFeHRlcm5hbENvbmZsaWN0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dzIHVuY2hhbmdlZCBwcm92aWRlciBzdGF0ZSBhZnRlciBhIHNlbGVjdGlvbiB3cml0ZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0U2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIGZpcnN0LmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicpKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsKFxuXHRcdFx0b2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPignc2Vzc2lvbicsIHRlc3RTZXNzaW9uLnNlc3Npb24pLFxuXHRcdFx0Y3JlYXRlUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSxcblx0XHRcdGNyZWF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0c2VsZWN0aW9uLnNlbGVjdE1vZGVsKHNlY29uZC5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBhcHBsaWVkTWVzc2FnZSA9IGxvZ1NlcnZpY2UubWVzc2FnZXMuZmluZChtZXNzYWdlID0+IG1lc3NhZ2UuaW5jbHVkZXMoJ2V2ZW50PXByb3ZpZGVyLXNlbGVjdGlvbi1hcHBsaWVkJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZDogc2VsZWN0aW9uLnN0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHByb3ZpZGVyTW9kZWw6IHRlc3RTZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRsb2dnZWRQcm92aWRlck1vZGVsQmVmb3JlOiBhcHBsaWVkTWVzc2FnZT8uaW5jbHVkZXMoYHByb3ZpZGVyTW9kZWxCZWZvcmU9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxBZnRlcjogYXBwbGllZE1lc3NhZ2U/LmluY2x1ZGVzKGBwcm92aWRlck1vZGVsQWZ0ZXI9JHtKU09OLnN0cmluZ2lmeShmaXJzdC5pZGVudGlmaWVyKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRzZWxlY3RlZDogc2Vjb25kLmlkZW50aWZpZXIsXG5cdFx0XHRwcm92aWRlck1vZGVsOiBmaXJzdC5pZGVudGlmaWVyLFxuXHRcdFx0bG9nZ2VkUHJvdmlkZXJNb2RlbEJlZm9yZTogdHJ1ZSxcblx0XHRcdGxvZ2dlZFByb3ZpZGVyTW9kZWxBZnRlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0IsY0FBYyxxQkFBcUI7QUFDcEUsU0FBUyw0QkFBNEIsMEJBQTBCO0FBQy9ELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLDhCQUE4QjtBQUd2QyxTQUFnQixxQkFBcUI7QUFFckMsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxNQUFNLFlBQTZEO0FBQzNFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxXQUFXLElBQUksb0JBQW9CLGdCQUFnQjtBQUFBLE1BQ25ELElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFFBQVE7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
