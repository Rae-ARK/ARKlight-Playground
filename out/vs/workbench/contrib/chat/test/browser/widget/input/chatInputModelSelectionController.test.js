import assert from "assert";
import { Emitter } from "../../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../common/constants.js";
import { ModelSelectionReason, resolveModelIdentifierFromCatalog } from "../../../../common/modelSelection.js";
import { ChatInputModelSelectionController } from "../../../../browser/widget/input/chatInputModelSelectionController.js";
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
function targetedModel(identifier, sessionType) {
  const result = model(identifier);
  return { ...result, metadata: { ...result.metadata, targetChatSessionType: sessionType } };
}
function createRuntime(state, modelChanges, applied) {
  return {
    location: ChatAgentLocation.Chat,
    getCurrentModeKind: () => ChatModeKind.Ask,
    getCurrentSessionType: () => state.sessionType,
    isEmpty: () => state.isEmpty ?? true,
    getModels: () => state.models,
    getAllModels: () => state.models,
    requiresCustomModels: () => false,
    getConfiguredModelValue: () => state.configuredModel,
    subscribeToModelChanges: (listener) => modelChanges.event(listener),
    getBoundConversationKey: () => "chat:one",
    getVisibleConversationKey: () => "chat:one",
    restoreModelConfiguration: () => {
    },
    applyModel: (model2) => applied.push(model2.identifier)
  };
}
suite("ChatInputModelSelectionController", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("tracks explicit selection origin", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: "test" }, modelChanges, [])));
    const first = model("test/first");
    const second = model("test/second");
    controller.applyAutomaticSelection(first, () => {
    });
    const automatic = {
      current: controller.currentModel.get()?.identifier,
      explicit: controller.userExplicitlySelectedModel
    };
    controller.applyExplicitSelection(second, () => {
    }, false);
    assert.deepStrictEqual({
      automatic,
      current: controller.currentModel.get()?.identifier,
      explicitAfterUserSelection: controller.userExplicitlySelectedModel
    }, {
      automatic: { current: first.identifier, explicit: false },
      current: second.identifier,
      explicitAfterUserSelection: true
    });
  });
  test("rolls back a failed explicit selection effect", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({ models: [], sessionType: "test" }, modelChanges, [])));
    const first = model("test/first");
    const second = model("test/second");
    controller.applyAutomaticSelection(first, () => {
    });
    assert.throws(() => controller.applyExplicitSelection(second, () => {
      throw new Error("rejected");
    }, true), /rejected/);
    assert.deepStrictEqual({
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      current: first.identifier,
      reason: void 0
    });
  });
  test("restores only for fresh own-pool session switches", () => {
    const modelChanges = disposables.add(new Emitter());
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime({
      models: [],
      sessionType: "test"
    }, modelChanges, [])));
    controller.beginSessionSwitch(true, true, false);
    const restoreDuringFreshSwitch = controller.restorePerTypeModel;
    controller.endSessionSwitch();
    const restoreAfterSwitch = controller.restorePerTypeModel;
    controller.beginSessionSwitch(true, true, true);
    assert.deepStrictEqual({
      restoreDuringFreshSwitch,
      restoreAfterSwitch,
      carriedModelRestore: controller.restorePerTypeModel
    }, {
      restoreDuringFreshSwitch: true,
      restoreAfterSwitch: false,
      carriedModelRestore: false
    });
  });
  test("applies a fallback while waiting for a remembered model, then restores it", () => {
    const modelChanges = disposables.add(new Emitter());
    const first = model("test/first");
    const second = model("test/second");
    let models = [first];
    const applied = [];
    const initialSelections = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(second.identifier, (result) => initialSelections.push(result.kind));
    const pending = controller.isAwaitingRememberedModel();
    models = [first, second];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      initialSelections,
      pending,
      pendingAfterResolve: controller.isAwaitingRememberedModel(),
      applied
    }, {
      initialSelections: ["pending"],
      pending: true,
      pendingAfterResolve: false,
      applied: [first.identifier, second.identifier]
    });
  });
  test("restores a remembered model after split same-vendor catalog publication", () => {
    const first = model("test/first");
    const remembered = model("test/remembered");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier, () => {
    });
    models = [first];
    modelChanges.fire("partial");
    const resolutionAfterPartial = resolveModelIdentifierFromCatalog(models, remembered.identifier, {
      hasLiveModels: (vendor) => models.some((model2) => model2.metadata.vendor === vendor),
      hasResolved: () => true
    }).kind;
    const pendingAfterPartial = controller.isAwaitingRememberedModel();
    models = [first, remembered];
    modelChanges.fire("complete");
    assert.deepStrictEqual({
      resolutionAfterPartial,
      pendingAfterPartial,
      pendingAfterComplete: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      resolutionAfterPartial: "unavailable",
      pendingAfterPartial: true,
      pendingAfterComplete: false,
      applied: [first.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("explicit selection cancels an eventual remembered-model restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const explicit = model("test/explicit");
    const remembered = model("test/remembered");
    const state = { models: [fallback, explicit], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
    state.models = [fallback, explicit, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: false,
      applied: [fallback.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
  test("programmatic selection cancels an eventual remembered-model restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const programmatic = model("test/programmatic");
    const remembered = model("test/remembered");
    const state = { models: [fallback, programmatic], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    controller.applyProgrammaticSelection(programmatic);
    state.models = [fallback, programmatic, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      pending: false,
      applied: [fallback.identifier, programmatic.identifier],
      current: programmatic.identifier,
      reason: ModelSelectionReason.ProgrammaticSelection
    });
  });
  test("pending programmatic selection applies when the model arrives", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const state = { models: [], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    const pending = controller.hasPendingProgrammaticSelection();
    state.models = [requested];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending,
      result: await result,
      pendingAfterLoad: controller.hasPendingProgrammaticSelection(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: true,
      result: true,
      pendingAfterLoad: false,
      applied: [requested.identifier],
      current: requested.identifier
    });
  });
  test("explicit selection cancels a pending programmatic selection", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const explicit = model("test/explicit");
    const state = { models: [explicit], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
    state.models = [explicit, requested];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      result: await result,
      pending: controller.hasPendingProgrammaticSelection(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      result: false,
      pending: false,
      applied: [explicit.identifier],
      current: explicit.identifier
    });
  });
  test("clearing a pending programmatic selection clears its authority", async () => {
    const modelChanges = disposables.add(new Emitter());
    const requested = model("test/requested");
    const state = { models: [], sessionType: "local" };
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, [])));
    const result = controller.requestProgrammaticSelection(
      () => state.models.find((model2) => model2.identifier === requested.identifier),
      "chat:one"
    );
    controller.clearIntent();
    assert.deepStrictEqual({ result: await result, reason: controller.selectionReason }, {
      result: false,
      reason: void 0
    });
  });
  test("location default improves the fallback without canceling remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("test/remembered");
    const defaultBase = model("test/default");
    const locationDefault = {
      ...defaultBase,
      metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
    };
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    state.models = [fallback, locationDefault];
    controller.reconcileModelListChange(state.models);
    const pendingAfterDefault = controller.isAwaitingRememberedModel();
    state.models = [fallback, locationDefault, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterDefault,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterDefault: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, locationDefault.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("repairs a removed fallback without canceling remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const replacement = model("test/replacement");
    const remembered = model("test/remembered");
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    state.models = [replacement];
    modelChanges.fire("fallback-removed");
    const pendingAfterRepair = controller.isAwaitingRememberedModel();
    state.models = [replacement, remembered];
    modelChanges.fire("remembered-loaded");
    assert.deepStrictEqual({
      pendingAfterRepair,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterRepair: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, replacement.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("reclaims the selected model after it disappears and comes back", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = targetedModel("agent-host/selected", "agent-host");
    const other = targetedModel("agent-host/other", "agent-host");
    const state = { models: [selected, other], sessionType: "agent-host" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applyExplicitSelection(selected, () => {
    }, false);
    state.models = [other];
    modelChanges.fire("agent-host-restarting");
    const duringRestart = controller.currentModel.get()?.identifier;
    state.models = [selected, other];
    modelChanges.fire("agent-host-restarted");
    assert.deepStrictEqual({
      duringRestart,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      duringRestart: other.identifier,
      current: selected.identifier,
      // The restore reinstates the original authority rather than downgrading to `Remembered`.
      reason: ModelSelectionReason.UserSelection,
      pending: false,
      applied: [other.identifier, selected.identifier]
    });
  });
  test("reclaims a storage-seeded remembered model that disappears mid-session", () => {
    const modelChanges = disposables.add(new Emitter());
    const remembered = model("test/remembered");
    const other = model("test/other");
    const state = { models: [remembered, other], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    state.models = [other];
    modelChanges.fire("model-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    state.models = [remembered, other];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      duringOutage,
      current: controller.currentModel.get()?.identifier,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      duringOutage: other.identifier,
      current: remembered.identifier,
      pending: false,
      applied: [remembered.identifier, other.identifier, remembered.identifier]
    });
  });
  test("reclaims the selected model even after a same-family substitute stood in", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = model("test/selected");
    const substitute = {
      identifier: "test/substitute",
      metadata: { ...selected.metadata, id: "test/substitute", name: "test/substitute" }
    };
    const state = { models: [selected, substitute], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applyExplicitSelection(selected, () => {
    }, false);
    state.models = [substitute];
    modelChanges.fire("model-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    state.models = [selected, substitute];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      duringOutage,
      current: controller.currentModel.get()?.identifier,
      applied
    }, {
      // The shared family makes `substitute` a best match, so it stands in rather than the default.
      duringOutage: substitute.identifier,
      current: selected.identifier,
      applied: [substitute.identifier, selected.identifier]
    });
  });
  test("an explicit selection outlives the model it displaced", () => {
    const modelChanges = disposables.add(new Emitter());
    const selected = model("test/selected");
    const other = model("test/other");
    const chosen = model("test/chosen");
    const state = { models: [selected, other, chosen], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applyExplicitSelection(selected, () => {
    }, false);
    state.models = [other, chosen];
    modelChanges.fire("model-removed");
    controller.applyExplicitSelection(chosen, () => {
    }, false);
    state.models = [selected, other, chosen];
    modelChanges.fire("model-back");
    assert.deepStrictEqual({
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason,
      pending: controller.hasPendingIntent(),
      applied
    }, {
      current: chosen.identifier,
      reason: ModelSelectionReason.UserSelection,
      pending: false,
      applied: [other.identifier]
    });
  });
  test("reclaims an explicit pick that was displaced while chat.defaultModel stood in", () => {
    const modelChanges = disposables.add(new Emitter());
    const configured = model("test/configured");
    const picked = model("test/picked");
    const state = {
      models: [configured, picked],
      sessionType: "local",
      configuredModel: configured.metadata.id
    };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.applyExplicitSelection(picked, () => {
    }, false);
    state.models = [configured];
    modelChanges.fire("picked-gone");
    const duringOutage = controller.currentModel.get()?.identifier;
    const reasonDuringOutage = controller.selectionReason;
    state.models = [configured, picked];
    modelChanges.fire("picked-back");
    const afterReturn = controller.currentModel.get()?.identifier;
    modelChanges.fire("later-refresh");
    assert.deepStrictEqual({
      duringOutage,
      reasonDuringOutage,
      afterReturn,
      afterRefresh: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      duringOutage: configured.identifier,
      reasonDuringOutage: ModelSelectionReason.ConfiguredDefault,
      afterReturn: picked.identifier,
      afterRefresh: picked.identifier,
      reason: ModelSelectionReason.UserSelection
    });
  });
  test("applies a fallback while the configured default loads, then upgrades it", () => {
    const byok = model("openai/byok");
    const configured = model("copilot/configured");
    let models = [byok];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0, () => {
    });
    const pending = controller.hasPendingIntent();
    models = [byok, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ pending, applied, current: controller.currentModel.get()?.identifier }, {
      pending: false,
      applied: [byok.identifier, configured.identifier],
      current: configured.identifier
    });
  });
  test("configured default supersedes pending remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const configured = model("test/configured");
    const remembered = model("test/remembered");
    const state = {
      models: [fallback],
      sessionType: "local",
      configuredModel: configured.metadata.id
    };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(remembered.identifier, () => {
    });
    state.models = [fallback, configured, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      pending: false,
      applied: [fallback.identifier, configured.identifier],
      current: configured.identifier,
      reason: ModelSelectionReason.ConfiguredDefault
    });
  });
  test("configured default claims an already selected fallback", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const defaultBase = model("test/default");
    const locationDefault = {
      ...defaultBase,
      metadata: { ...defaultBase.metadata, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
    };
    const state = { models: [fallback], sessionType: "local" };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.initialize(void 0, () => {
    });
    state.configuredModel = fallback.metadata.id;
    state.models = [fallback, locationDefault];
    modelChanges.fire("configured");
    modelChanges.fire("unchanged");
    assert.deepStrictEqual({
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      applied: [fallback.identifier],
      current: fallback.identifier,
      reason: ModelSelectionReason.ConfiguredDefault
    });
  });
  test("keeps an explicit selection when the configured default loads later", () => {
    const byok = model("openai/byok");
    const explicit = model("openai/explicit");
    const configured = model("copilot/configured");
    let models = [byok, explicit];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0, () => {
    });
    controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
    models = [byok, explicit, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [byok.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
  test("conversation restore cancels startup remembered intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("copilot/remembered");
    const restored = model("test/restored");
    let models = [fallback, restored];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier, () => {
    });
    controller.syncFromConversationState(restored, void 0, void 0, "chat:one");
    models = [fallback, restored, remembered];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      pending: controller.hasPendingIntent(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pending: false,
      applied: [fallback.identifier, restored.identifier],
      current: restored.identifier
    });
  });
  test("late configured default does not overwrite a restored conversation model", () => {
    const restored = model("test/restored");
    const configured = model("copilot/configured");
    let models = [restored];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configured.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0, () => {
    });
    controller.syncFromConversationState(restored, void 0, void 0, "chat:one");
    models = [restored, configured];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [restored.identifier],
      current: restored.identifier
    });
  });
  test("conversation restore cancels older history intent", () => {
    const modelChanges = disposables.add(new Emitter());
    const restored = model("test/restored");
    const history = model("test/history");
    let models = [restored];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.preselectFromHistory(history.identifier, "chat:one");
    controller.syncFromConversationState(restored, void 0, void 0, "chat:one");
    models = [restored, history];
    modelChanges.fire("test");
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [restored.identifier],
      current: restored.identifier
    });
  });
  test("fresh conversation precedence is configured, remembered, default, then first available", () => {
    const first = model("test/first");
    const remembered = model("test/remembered");
    const locationDefault = {
      ...model("test/default"),
      metadata: {
        ...model("test/default").metadata,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      }
    };
    const run = (configuredModel, rememberedModel, models) => {
      const applied = [];
      const runtime = {
        location: ChatAgentLocation.Chat,
        getCurrentModeKind: () => ChatModeKind.Ask,
        getCurrentSessionType: () => void 0,
        isEmpty: () => true,
        getModels: () => models,
        getAllModels: () => models,
        requiresCustomModels: () => false,
        getConfiguredModelValue: () => configuredModel,
        subscribeToModelChanges: () => toDisposable(() => {
        }),
        getBoundConversationKey: () => "chat:one",
        getVisibleConversationKey: () => "chat:one",
        restoreModelConfiguration: () => {
        },
        applyModel: (selected) => {
          applied.push(selected.identifier);
        }
      };
      disposables.add(new ChatInputModelSelectionController(runtime)).initialize(rememberedModel, () => {
      });
      return applied[0];
    };
    assert.deepStrictEqual([
      run(locationDefault.metadata.id, remembered.identifier, [first, remembered, locationDefault]),
      run(void 0, remembered.identifier, [first, remembered, locationDefault]),
      run(void 0, void 0, [first, locationDefault]),
      run(void 0, void 0, [first])
    ], [locationDefault.identifier, remembered.identifier, locationDefault.identifier, first.identifier]);
  });
  test("applies fallback and configured defaults through the automatic path", () => {
    const first = model("test/first");
    const second = model("test/second");
    const configuration = { model: void 0 };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => [first, second],
      getAllModels: () => [first, second],
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => configuration.model,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.ensureCurrentModelSupported();
    configuration.model = second.metadata.id;
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied }, {
      configuredApplied: true,
      applied: [first.identifier, second.identifier]
    });
  });
  test("re-applies the configured default over a spilled-over session-restore on an empty session", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.syncFromConversationState(opus, void 0, "test", "chat:one");
    const afterSpillover = controller.currentModel.get()?.identifier;
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ afterSpillover, configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      afterSpillover: opus.identifier,
      configuredApplied: true,
      applied: [opus.identifier, gpt.identifier],
      current: gpt.identifier
    });
  });
  test("keeps a reopened conversation on its own model instead of the configured default", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(
      { models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id, isEmpty: false },
      modelChanges,
      applied
    )));
    controller.beginSessionSwitch(false, false, true);
    controller.initialize(opus.identifier, () => {
    });
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("preserves an explicit user pick on an empty session over the configured default", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test", configuredModel: gpt.metadata.id }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.applyExplicitSelection(opus, () => applied.push(opus.identifier), false);
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier, userPicked: controller.userExplicitlySelectedModel }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier,
      userPicked: true
    });
  });
  test("keeps the restored model on a reopened non-empty conversation even when a default is configured", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => [gpt, opus],
      getAllModels: () => [gpt, opus],
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => gpt.metadata.id,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(opus, void 0, void 0, "chat:one");
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("leaves the spilled-over model sticky when no default model is configured", () => {
    const gpt = model("test/gpt");
    const opus = model("test/opus");
    const modelChanges = disposables.add(new Emitter());
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(
      createRuntime({ models: [gpt, opus], sessionType: "test" }, modelChanges, applied)
    ));
    controller.beginSessionSwitch(true, false, false);
    controller.syncFromConversationState(opus, void 0, "test", "chat:one");
    const configuredApplied = controller.applyConfiguredDefault();
    assert.deepStrictEqual({ configuredApplied, applied, current: controller.currentModel.get()?.identifier }, {
      configuredApplied: false,
      applied: [opus.identifier],
      current: opus.identifier
    });
  });
  test("replaces a BYOK first-available model when the Copilot default loads later", () => {
    const modelChanges = disposables.add(new Emitter());
    const byok = model("openai/byok");
    const copilotDefault = {
      ...model("copilot/auto"),
      metadata: {
        ...model("copilot/auto").metadata,
        isDefaultForLocation: { [ChatAgentLocation.Chat]: true }
      }
    };
    let models = [byok];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(void 0, () => {
    });
    models = [byok, copilotDefault];
    controller.reconcileModelListChange(models);
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [byok.identifier, copilotDefault.identifier],
      current: copilotDefault.identifier
    });
  });
  test("drops cross-pool drafts and waits for a cold conversation model", () => {
    const sessionType = "agent-host-test";
    const general = model("test/general");
    const fallback = targetedModel("test/fallback", sessionType);
    const desired = targetedModel("test/desired", sessionType);
    const modelChanges = disposables.add(new Emitter());
    let models = [fallback];
    const applied = [];
    const restored = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    const draft = controller.resolveDraftModel(general, sessionType, true);
    models = [];
    controller.syncFromConversationState(desired, { effort: "high" }, sessionType, "chat:one");
    const awaiting = controller.isAwaitingRememberedModel();
    models = [fallback, desired];
    modelChanges.fire("test");
    assert.deepStrictEqual({
      draft: { model: draft.model?.identifier, changed: draft.changed },
      awaiting,
      awaitingAfterResolve: controller.isAwaitingRememberedModel(),
      applied,
      restored
    }, {
      draft: { model: void 0, changed: true },
      awaiting: true,
      awaitingAfterResolve: false,
      applied: [desired.identifier],
      restored: [{ modelId: desired.identifier, configuration: { effort: "high" } }]
    });
  });
  test("syncFromConversationState reclaims the conversation model however late the pool publishes", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier, byokModelIdentifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType, byokModelIdentifier } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7", "openrouter/OpenRouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const restored = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: (modelId, configuration) => restored.push({ modelId, configuration }),
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, { effort: "high" }, sessionType, "chat:one");
    const awaitingWhileEmpty = controller.isAwaitingRememberedModel();
    models = [bridged];
    modelChanges.fire("byok-bridge");
    const awaitingAfterBridge = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      awaitingWhileEmpty,
      awaitingAfterBridge,
      awaitingAfterLoad: controller.isAwaitingRememberedModel(),
      current: controller.currentModel.get()?.identifier,
      finalApplied: applied[applied.length - 1],
      restored
    }, {
      awaitingWhileEmpty: true,
      awaitingAfterBridge: true,
      awaitingAfterLoad: false,
      current: desired.identifier,
      finalApplied: desired.identifier,
      restored: [{ modelId: desired.identifier, configuration: { effort: "high" } }]
    });
  });
  test("a stand-in echoed back by the conversation does not displace the model being awaited", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    models = [bridged];
    modelChanges.fire("byok-bridge");
    const standIn = controller.currentModel.get()?.identifier;
    controller.syncFromConversationState(bridged, void 0, sessionType, "chat:one");
    const awaitingAfterEcho = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      standIn,
      awaitingAfterEcho,
      current: controller.currentModel.get()?.identifier
    }, {
      standIn: bridged.identifier,
      awaitingAfterEcho: true,
      current: desired.identifier
    });
  });
  test("a peer client genuinely selecting the stand-in supersedes the model being awaited", () => {
    const sessionType = "agent-host-copilotcli";
    const hostModel = (identifier) => {
      const base = targetedModel(identifier, sessionType);
      return { ...base, metadata: { ...base.metadata, vendor: sessionType } };
    };
    const desired = hostModel("agent-host-copilotcli:gpt-5.6-sol");
    const bridged = hostModel("agent-host-copilotcli:openrouter/ai21/jamba-large-1.7");
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    models = [bridged];
    modelChanges.fire("byok-bridge");
    controller.syncFromConversationState(bridged, void 0, sessionType, "chat:one", true);
    const awaitingAfterPeerPick = controller.isAwaitingRememberedModel();
    models = [bridged, desired];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      awaitingAfterPeerPick,
      current: controller.currentModel.get()?.identifier
    }, {
      awaitingAfterPeerPick: false,
      current: bridged.identifier
    });
  });
  test("initialize keeps remembered intent through empty catalog updates", () => {
    const sessionType = "test-session";
    const remembered = targetedModel("test:remembered", sessionType);
    const modelChanges = disposables.add(new Emitter());
    let models = [];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => sessionType,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier, () => {
    });
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    const appliedAfterInit = [...applied];
    modelChanges.fire("still-empty");
    const pendingAfterEmpty = controller.isAwaitingRememberedModel();
    models = [remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      appliedAfterInit,
      pendingAfterEmpty,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      appliedAfterInit: [],
      pendingAfterEmpty: true,
      pendingAfterLoad: false,
      applied: [remembered.identifier],
      current: remembered.identifier
    });
  });
  test("late best-match restore remains authoritative after configured-model refresh", () => {
    const modelChanges = disposables.add(new Emitter());
    const sessionType = "agent-host-test";
    const desired = targetedModel("test/desired", sessionType);
    const matchBase = targetedModel("test/match", sessionType);
    const match = { ...matchBase, metadata: { ...matchBase.metadata, id: desired.metadata.id } };
    const configured = targetedModel("test/configured", sessionType);
    const state = { models: [], sessionType, configuredModel: configured.metadata.id, isEmpty: false };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.syncFromConversationState(desired, void 0, sessionType, "chat:one");
    state.models = [match, configured];
    modelChanges.fire("test");
    controller.reconcileModelListChange(state.models);
    assert.deepStrictEqual({
      applied,
      current: controller.currentModel.get()?.identifier,
      reason: controller.selectionReason
    }, {
      applied: [match.identifier],
      current: match.identifier,
      reason: ModelSelectionReason.SessionRestore
    });
  });
  test("a genuinely different conversation model cancels an outstanding restore", () => {
    const modelChanges = disposables.add(new Emitter());
    const sessionType = "agent-host-test";
    const staleDesired = targetedModel("test/stale", sessionType);
    const fallback = targetedModel("test/fallback", sessionType);
    const inapplicable = model("test/inapplicable");
    const state = { models: [], sessionType };
    const applied = [];
    const controller = disposables.add(new ChatInputModelSelectionController(createRuntime(state, modelChanges, applied)));
    controller.syncFromConversationState(staleDesired, void 0, sessionType, "chat:one");
    state.models = [fallback];
    controller.syncFromConversationState(inapplicable, void 0, sessionType, "chat:one");
    state.models = [fallback, staleDesired];
    modelChanges.fire("test");
    assert.deepStrictEqual({ pending: controller.hasPendingIntent(), applied }, {
      pending: false,
      applied: [fallback.identifier]
    });
  });
  test("does not apply a late history model after the visible conversation changes", () => {
    const modelChanges = disposables.add(new Emitter());
    const restored = model("test/restored");
    let models = [];
    let visibleConversation = "chat:one";
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => false,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => visibleConversation,
      getVisibleConversationKey: () => visibleConversation,
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.preselectFromHistory(restored.identifier, "chat:one");
    visibleConversation = "chat:two";
    models = [restored];
    modelChanges.fire("test");
    assert.deepStrictEqual(applied, []);
  });
  test("revalidates a selection when switching model pools", () => {
    const general = model("test/general");
    const targeted = targetedModel("test/targeted", "agent-host-test");
    const state = { sessionType: void 0 };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => state.sessionType,
      isEmpty: () => true,
      getModels: (type) => type ? [targeted] : [general],
      getAllModels: () => [general, targeted],
      requiresCustomModels: () => true,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: () => toDisposable(() => {
      }),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.applyAutomaticSelection(general, () => {
    });
    state.sessionType = "agent-host-test";
    controller.revalidateForSessionType(() => {
    });
    assert.deepStrictEqual({ applied, current: controller.currentModel.get()?.identifier }, {
      applied: [targeted.identifier],
      current: targeted.identifier
    });
  });
  test("clears the previous model while the destination harness pool loads", () => {
    const sessionType = "agent-host-test";
    const general = model("test/general");
    const targeted = targetedModel("test/targeted", sessionType);
    const modelChanges = disposables.add(new Emitter());
    const state = {
      sessionType: void 0,
      targetedModels: []
    };
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => state.sessionType,
      isEmpty: () => true,
      getModels: (sessionType2) => sessionType2 ? state.targetedModels : [general],
      getAllModels: () => [general, ...state.targetedModels],
      requiresCustomModels: (sessionType2) => sessionType2 === state.sessionType,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => applied.push(selected.identifier)
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.applyAutomaticSelection(general, () => {
    });
    state.sessionType = sessionType;
    controller.revalidateForSessionType(() => {
    });
    const modelWhileLoading = controller.currentModel.get()?.identifier;
    state.targetedModels = [targeted];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({ modelWhileLoading, applied, current: controller.currentModel.get()?.identifier }, {
      modelWhileLoading: void 0,
      applied: [targeted.identifier],
      current: targeted.identifier
    });
  });
  test("initialize restores a remembered model after a non-empty initial catalog", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const remembered = model("test/remembered");
    let models = [fallback];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier, () => {
    });
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    models = [fallback, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      pendingAfterLoad: controller.isAwaitingRememberedModel(),
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      pendingAfterLoad: false,
      applied: [fallback.identifier, remembered.identifier],
      current: remembered.identifier
    });
  });
  test("initialize does not arm a restore wait when there is nothing to wait for", () => {
    const build = (rememberedId, models) => {
      const applied = [];
      const runtime = {
        location: ChatAgentLocation.Chat,
        getCurrentModeKind: () => ChatModeKind.Ask,
        getCurrentSessionType: () => void 0,
        isEmpty: () => true,
        getModels: () => models,
        getAllModels: () => models,
        requiresCustomModels: () => false,
        getConfiguredModelValue: () => void 0,
        subscribeToModelChanges: () => toDisposable(() => {
        }),
        getBoundConversationKey: () => "chat:one",
        getVisibleConversationKey: () => "chat:one",
        restoreModelConfiguration: () => {
        },
        applyModel: (selected) => {
          applied.push(selected.identifier);
        }
      };
      const controller = disposables.add(new ChatInputModelSelectionController(runtime));
      controller.initialize(rememberedId, () => {
      });
      return controller.hasPendingIntent();
    };
    const first = model("test/first");
    const remembered = model("test/remembered");
    assert.deepStrictEqual({
      noRememberedModel: build(void 0, [first]),
      rememberedAlreadyAvailable: build(remembered.identifier, [first, remembered])
    }, {
      noRememberedModel: false,
      rememberedAlreadyAvailable: false
    });
  });
  test("an explicit selection cancels the initialize restore wait", () => {
    const modelChanges = disposables.add(new Emitter());
    const fallback = model("test/fallback");
    const explicit = model("test/explicit");
    const remembered = model("test/remembered");
    let models = [fallback, explicit];
    const applied = [];
    const runtime = {
      location: ChatAgentLocation.Chat,
      getCurrentModeKind: () => ChatModeKind.Ask,
      getCurrentSessionType: () => void 0,
      isEmpty: () => true,
      getModels: () => models,
      getAllModels: () => models,
      requiresCustomModels: () => false,
      getConfiguredModelValue: () => void 0,
      subscribeToModelChanges: (listener) => modelChanges.event(listener),
      getBoundConversationKey: () => "chat:one",
      getVisibleConversationKey: () => "chat:one",
      restoreModelConfiguration: () => {
      },
      applyModel: (selected) => {
        applied.push(selected.identifier);
      }
    };
    const controller = disposables.add(new ChatInputModelSelectionController(runtime));
    controller.initialize(remembered.identifier, () => {
    });
    const pendingAfterInit = controller.isAwaitingRememberedModel();
    controller.applyExplicitSelection(explicit, () => applied.push(explicit.identifier), false);
    const pendingAfterExplicit = controller.isAwaitingRememberedModel();
    models = [fallback, explicit, remembered];
    modelChanges.fire("loaded");
    assert.deepStrictEqual({
      pendingAfterInit,
      pendingAfterExplicit,
      applied,
      current: controller.currentModel.get()?.identifier
    }, {
      pendingAfterInit: true,
      pendingAfterExplicit: false,
      applied: [fallback.identifier, explicit.identifier],
      current: explicit.identifier
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgTW9kZWxTZWxlY3Rpb25SZWFzb24sIHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tQ2F0YWxvZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIsIElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuanMnO1xuXG5mdW5jdGlvbiBtb2RlbChpZGVudGlmaWVyOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRyZXR1cm4ge1xuXHRcdGlkZW50aWZpZXIsXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJyksXG5cdFx0XHRpZDogaWRlbnRpZmllcixcblx0XHRcdG5hbWU6IGlkZW50aWZpZXIsXG5cdFx0XHR2ZW5kb3I6ICd0ZXN0Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiBpZGVudGlmaWVyLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gdGFyZ2V0ZWRNb2RlbChpZGVudGlmaWVyOiBzdHJpbmcsIHNlc3Npb25UeXBlOiBzdHJpbmcpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIge1xuXHRjb25zdCByZXN1bHQgPSBtb2RlbChpZGVudGlmaWVyKTtcblx0cmV0dXJuIHsgLi4ucmVzdWx0LCBtZXRhZGF0YTogeyAuLi5yZXN1bHQubWV0YWRhdGEsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUgfSB9O1xufVxuXG5pbnRlcmZhY2UgSVJ1bnRpbWVTdGF0ZSB7XG5cdG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW107XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdGNvbmZpZ3VyZWRNb2RlbD86IHN0cmluZztcblx0LyoqIERlZmF1bHRzIHRvIGB0cnVlYCAoYSBuZXcvZW1wdHkgc2Vzc2lvbikuIFNldCB0byBgZmFsc2VgIHRvIG1vZGVsIGEgcmVvcGVuZWQgY29udmVyc2F0aW9uIHdpdGggaGlzdG9yeS4gKi9cblx0aXNFbXB0eT86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJ1bnRpbWUoXG5cdHN0YXRlOiBJUnVudGltZVN0YXRlLFxuXHRtb2RlbENoYW5nZXM6IEVtaXR0ZXI8c3RyaW5nPixcblx0YXBwbGllZDogc3RyaW5nW10sXG4pOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lIHtcblx0cmV0dXJuIHtcblx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiBzdGF0ZS5zZXNzaW9uVHlwZSxcblx0XHRpc0VtcHR5OiAoKSA9PiBzdGF0ZS5pc0VtcHR5ID8/IHRydWUsXG5cdFx0Z2V0TW9kZWxzOiAoKSA9PiBzdGF0ZS5tb2RlbHMsXG5cdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBzdGF0ZS5tb2RlbHMsXG5cdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBzdGF0ZS5jb25maWd1cmVkTW9kZWwsXG5cdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0YXBwbHlNb2RlbDogbW9kZWwgPT4gYXBwbGllZC5wdXNoKG1vZGVsLmlkZW50aWZpZXIpLFxuXHR9O1xufVxuXG5zdWl0ZSgnQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndHJhY2tzIGV4cGxpY2l0IHNlbGVjdGlvbiBvcmlnaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoeyBtb2RlbHM6IFtdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnIH0sIG1vZGVsQ2hhbmdlcywgW10pKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseUF1dG9tYXRpY1NlbGVjdGlvbihmaXJzdCwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBhdXRvbWF0aWMgPSB7XG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdGV4cGxpY2l0OiBjb250cm9sbGVyLnVzZXJFeHBsaWNpdGx5U2VsZWN0ZWRNb2RlbCxcblx0XHR9O1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlFeHBsaWNpdFNlbGVjdGlvbihzZWNvbmQsICgpID0+IHsgfSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXRvbWF0aWMsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdGV4cGxpY2l0QWZ0ZXJVc2VyU2VsZWN0aW9uOiBjb250cm9sbGVyLnVzZXJFeHBsaWNpdGx5U2VsZWN0ZWRNb2RlbCxcblx0XHR9LCB7XG5cdFx0XHRhdXRvbWF0aWM6IHsgY3VycmVudDogZmlyc3QuaWRlbnRpZmllciwgZXhwbGljaXQ6IGZhbHNlIH0sXG5cdFx0XHRjdXJyZW50OiBzZWNvbmQuaWRlbnRpZmllcixcblx0XHRcdGV4cGxpY2l0QWZ0ZXJVc2VyU2VsZWN0aW9uOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyb2xscyBiYWNrIGEgZmFpbGVkIGV4cGxpY2l0IHNlbGVjdGlvbiBlZmZlY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoeyBtb2RlbHM6IFtdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnIH0sIG1vZGVsQ2hhbmdlcywgW10pKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtb2RlbCgndGVzdC9maXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1vZGVsKCd0ZXN0L3NlY29uZCcpO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlBdXRvbWF0aWNTZWxlY3Rpb24oZmlyc3QsICgpID0+IHsgfSk7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGNvbnRyb2xsZXIuYXBwbHlFeHBsaWNpdFNlbGVjdGlvbihzZWNvbmQsICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdyZWplY3RlZCcpOyB9LCB0cnVlKSwgL3JlamVjdGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0Y3VycmVudDogZmlyc3QuaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBvbmx5IGZvciBmcmVzaCBvd24tcG9vbCBzZXNzaW9uIHN3aXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHtcblx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRzZXNzaW9uVHlwZTogJ3Rlc3QnLFxuXHRcdH0sIG1vZGVsQ2hhbmdlcywgW10pKSk7XG5cblx0XHRjb250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaCh0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0Y29uc3QgcmVzdG9yZUR1cmluZ0ZyZXNoU3dpdGNoID0gY29udHJvbGxlci5yZXN0b3JlUGVyVHlwZU1vZGVsO1xuXHRcdGNvbnRyb2xsZXIuZW5kU2Vzc2lvblN3aXRjaCgpO1xuXHRcdGNvbnN0IHJlc3RvcmVBZnRlclN3aXRjaCA9IGNvbnRyb2xsZXIucmVzdG9yZVBlclR5cGVNb2RlbDtcblx0XHRjb250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaCh0cnVlLCB0cnVlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdG9yZUR1cmluZ0ZyZXNoU3dpdGNoLFxuXHRcdFx0cmVzdG9yZUFmdGVyU3dpdGNoLFxuXHRcdFx0Y2FycmllZE1vZGVsUmVzdG9yZTogY29udHJvbGxlci5yZXN0b3JlUGVyVHlwZU1vZGVsLFxuXHRcdH0sIHtcblx0XHRcdHJlc3RvcmVEdXJpbmdGcmVzaFN3aXRjaDogdHJ1ZSxcblx0XHRcdHJlc3RvcmVBZnRlclN3aXRjaDogZmFsc2UsXG5cdFx0XHRjYXJyaWVkTW9kZWxSZXN0b3JlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBhIGZhbGxiYWNrIHdoaWxlIHdhaXRpbmcgZm9yIGEgcmVtZW1iZXJlZCBtb2RlbCwgdGhlbiByZXN0b3JlcyBpdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtmaXJzdF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBpbml0aWFsU2VsZWN0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdGdldFZpc2libGVDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShzZWNvbmQuaWRlbnRpZmllciwgcmVzdWx0ID0+IGluaXRpYWxTZWxlY3Rpb25zLnB1c2gocmVzdWx0LmtpbmQpKTtcblx0XHRjb25zdCBwZW5kaW5nID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0bW9kZWxzID0gW2ZpcnN0LCBzZWNvbmRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGluaXRpYWxTZWxlY3Rpb25zLFxuXHRcdFx0cGVuZGluZyxcblx0XHRcdHBlbmRpbmdBZnRlclJlc29sdmU6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHR9LCB7XG5cdFx0XHRpbml0aWFsU2VsZWN0aW9uczogWydwZW5kaW5nJ10sXG5cdFx0XHRwZW5kaW5nOiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyUmVzb2x2ZTogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmlyc3QuaWRlbnRpZmllciwgc2Vjb25kLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIHJlbWVtYmVyZWQgbW9kZWwgYWZ0ZXIgc3BsaXQgc2FtZS12ZW5kb3IgY2F0YWxvZyBwdWJsaWNhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCd0ZXN0L3JlbWVtYmVyZWQnKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRsZXQgbW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZC5pZGVudGlmaWVyLCAoKSA9PiB7IH0pO1xuXHRcdG1vZGVscyA9IFtmaXJzdF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3BhcnRpYWwnKTtcblx0XHQvLyBUaGUgY2F0YWxvZyBjYWxscyB0aGUgbW9kZWwgY29uY2x1c2l2ZWx5IGdvbmU7IHRoZSByZWNsYWltIG11c3Qgbm90IGRlcGVuZCBvbiB0aGF0IHZlcmRpY3QuXG5cdFx0Y29uc3QgcmVzb2x1dGlvbkFmdGVyUGFydGlhbCA9IHJlc29sdmVNb2RlbElkZW50aWZpZXJGcm9tQ2F0YWxvZyhtb2RlbHMsIHJlbWVtYmVyZWQuaWRlbnRpZmllciwge1xuXHRcdFx0aGFzTGl2ZU1vZGVsczogdmVuZG9yID0+IG1vZGVscy5zb21lKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gdmVuZG9yKSxcblx0XHRcdGhhc1Jlc29sdmVkOiAoKSA9PiB0cnVlLFxuXHRcdH0pLmtpbmQ7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVyUGFydGlhbCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmaXJzdCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2NvbXBsZXRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc29sdXRpb25BZnRlclBhcnRpYWwsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJQYXJ0aWFsLFxuXHRcdFx0cGVuZGluZ0FmdGVyQ29tcGxldGU6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdXRpb25BZnRlclBhcnRpYWw6ICd1bmF2YWlsYWJsZScsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJQYXJ0aWFsOiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZpcnN0LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IHNlbGVjdGlvbiBjYW5jZWxzIGFuIGV2ZW50dWFsIHJlbWVtYmVyZWQtbW9kZWwgcmVzdG9yZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IG1vZGVsKCd0ZXN0L2ZhbGxiYWNrJyk7XG5cdFx0Y29uc3QgZXhwbGljaXQgPSBtb2RlbCgndGVzdC9leHBsaWNpdCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrLCBleHBsaWNpdF0sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllciwgKCkgPT4geyB9KTtcblx0XHRjb250cm9sbGVyLmFwcGx5RXhwbGljaXRTZWxlY3Rpb24oZXhwbGljaXQsICgpID0+IGFwcGxpZWQucHVzaChleHBsaWNpdC5pZGVudGlmaWVyKSwgZmFsc2UpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtmYWxsYmFjaywgZXhwbGljaXQsIHJlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZzogY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllciwgZXhwbGljaXQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBleHBsaWNpdC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9ncmFtbWF0aWMgc2VsZWN0aW9uIGNhbmNlbHMgYW4gZXZlbnR1YWwgcmVtZW1iZXJlZC1tb2RlbCByZXN0b3JlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCBwcm9ncmFtbWF0aWMgPSBtb2RlbCgndGVzdC9wcm9ncmFtbWF0aWMnKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtmYWxsYmFjaywgcHJvZ3JhbW1hdGljXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZC5pZGVudGlmaWVyLCAoKSA9PiB7IH0pO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlQcm9ncmFtbWF0aWNTZWxlY3Rpb24ocHJvZ3JhbW1hdGljKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIHByb2dyYW1tYXRpYywgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllciwgcHJvZ3JhbW1hdGljLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogcHJvZ3JhbW1hdGljLmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlByb2dyYW1tYXRpY1NlbGVjdGlvbixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGVuZGluZyBwcm9ncmFtbWF0aWMgc2VsZWN0aW9uIGFwcGxpZXMgd2hlbiB0aGUgbW9kZWwgYXJyaXZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSBtb2RlbCgndGVzdC9yZXF1ZXN0ZWQnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250cm9sbGVyLnJlcXVlc3RQcm9ncmFtbWF0aWNTZWxlY3Rpb24oXG5cdFx0XHQoKSA9PiBzdGF0ZS5tb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXF1ZXN0ZWQuaWRlbnRpZmllciksXG5cdFx0XHQnY2hhdDpvbmUnLFxuXHRcdCk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IGNvbnRyb2xsZXIuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtyZXF1ZXN0ZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZyxcblx0XHRcdHJlc3VsdDogYXdhaXQgcmVzdWx0LFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogY29udHJvbGxlci5oYXNQZW5kaW5nUHJvZ3JhbW1hdGljU2VsZWN0aW9uKCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzogdHJ1ZSxcblx0XHRcdHJlc3VsdDogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW3JlcXVlc3RlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlcXVlc3RlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBsaWNpdCBzZWxlY3Rpb24gY2FuY2VscyBhIHBlbmRpbmcgcHJvZ3JhbW1hdGljIHNlbGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCByZXF1ZXN0ZWQgPSBtb2RlbCgndGVzdC9yZXF1ZXN0ZWQnKTtcblx0XHRjb25zdCBleHBsaWNpdCA9IG1vZGVsKCd0ZXN0L2V4cGxpY2l0Jyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2V4cGxpY2l0XSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBjb250cm9sbGVyLnJlcXVlc3RQcm9ncmFtbWF0aWNTZWxlY3Rpb24oXG5cdFx0XHQoKSA9PiBzdGF0ZS5tb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXF1ZXN0ZWQuaWRlbnRpZmllciksXG5cdFx0XHQnY2hhdDpvbmUnLFxuXHRcdCk7XG5cdFx0Y29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKGV4cGxpY2l0LCAoKSA9PiBhcHBsaWVkLnB1c2goZXhwbGljaXQuaWRlbnRpZmllciksIGZhbHNlKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZXhwbGljaXQsIHJlcXVlc3RlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQ6IGF3YWl0IHJlc3VsdCxcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogZmFsc2UsXG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtleHBsaWNpdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGV4cGxpY2l0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyaW5nIGEgcGVuZGluZyBwcm9ncmFtbWF0aWMgc2VsZWN0aW9uIGNsZWFycyBpdHMgYXV0aG9yaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZCA9IG1vZGVsKCd0ZXN0L3JlcXVlc3RlZCcpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIFtdKSkpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gY29udHJvbGxlci5yZXF1ZXN0UHJvZ3JhbW1hdGljU2VsZWN0aW9uKFxuXHRcdFx0KCkgPT4gc3RhdGUubW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciA9PT0gcmVxdWVzdGVkLmlkZW50aWZpZXIpLFxuXHRcdFx0J2NoYXQ6b25lJyxcblx0XHQpO1xuXHRcdGNvbnRyb2xsZXIuY2xlYXJJbnRlbnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQ6IGF3YWl0IHJlc3VsdCwgcmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbiB9LCB7XG5cdFx0XHRyZXN1bHQ6IGZhbHNlLFxuXHRcdFx0cmVhc29uOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2F0aW9uIGRlZmF1bHQgaW1wcm92ZXMgdGhlIGZhbGxiYWNrIHdpdGhvdXQgY2FuY2VsaW5nIHJlbWVtYmVyZWQgaW50ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IGRlZmF1bHRCYXNlID0gbW9kZWwoJ3Rlc3QvZGVmYXVsdCcpO1xuXHRcdGNvbnN0IGxvY2F0aW9uRGVmYXVsdCA9IHtcblx0XHRcdC4uLmRlZmF1bHRCYXNlLFxuXHRcdFx0bWV0YWRhdGE6IHsgLi4uZGVmYXVsdEJhc2UubWV0YWRhdGEsIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0sXG5cdFx0fTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbZmFsbGJhY2tdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIsICgpID0+IHsgfSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrLCBsb2NhdGlvbkRlZmF1bHRdO1xuXHRcdGNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKHN0YXRlLm1vZGVscyk7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVyRGVmYXVsdCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtmYWxsYmFjaywgbG9jYXRpb25EZWZhdWx0LCByZW1lbWJlcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmdBZnRlckRlZmF1bHQsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJMb2FkOiBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHR9LCB7XG5cdFx0XHRwZW5kaW5nQWZ0ZXJEZWZhdWx0OiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllciwgbG9jYXRpb25EZWZhdWx0LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGFpcnMgYSByZW1vdmVkIGZhbGxiYWNrIHdpdGhvdXQgY2FuY2VsaW5nIHJlbWVtYmVyZWQgaW50ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCByZXBsYWNlbWVudCA9IG1vZGVsKCd0ZXN0L3JlcGxhY2VtZW50Jyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCd0ZXN0L3JlbWVtYmVyZWQnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbZmFsbGJhY2tdLCBzZXNzaW9uVHlwZTogJ2xvY2FsJyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIsICgpID0+IHsgfSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW3JlcGxhY2VtZW50XTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnZmFsbGJhY2stcmVtb3ZlZCcpO1xuXHRcdGNvbnN0IHBlbmRpbmdBZnRlclJlcGFpciA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtyZXBsYWNlbWVudCwgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3JlbWVtYmVyZWQtbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmdBZnRlclJlcGFpcixcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlclJlcGFpcjogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlcGxhY2VtZW50LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY2xhaW1zIHRoZSBzZWxlY3RlZCBtb2RlbCBhZnRlciBpdCBkaXNhcHBlYXJzIGFuZCBjb21lcyBiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGFyZ2V0ZWRNb2RlbCgnYWdlbnQtaG9zdC9zZWxlY3RlZCcsICdhZ2VudC1ob3N0Jyk7XG5cdFx0Y29uc3Qgb3RoZXIgPSB0YXJnZXRlZE1vZGVsKCdhZ2VudC1ob3N0L290aGVyJywgJ2FnZW50LWhvc3QnKTtcblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbc2VsZWN0ZWQsIG90aGVyXSwgc2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0JyB9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYXBwbHlFeHBsaWNpdFNlbGVjdGlvbihzZWxlY3RlZCwgKCkgPT4geyB9LCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW290aGVyXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnYWdlbnQtaG9zdC1yZXN0YXJ0aW5nJyk7XG5cdFx0Y29uc3QgZHVyaW5nUmVzdGFydCA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzZWxlY3RlZCwgb3RoZXJdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdhZ2VudC1ob3N0LXJlc3RhcnRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkdXJpbmdSZXN0YXJ0LFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uLFxuXHRcdFx0cGVuZGluZzogY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdH0sIHtcblx0XHRcdGR1cmluZ1Jlc3RhcnQ6IG90aGVyLmlkZW50aWZpZXIsXG5cdFx0XHRjdXJyZW50OiBzZWxlY3RlZC5pZGVudGlmaWVyLFxuXHRcdFx0Ly8gVGhlIHJlc3RvcmUgcmVpbnN0YXRlcyB0aGUgb3JpZ2luYWwgYXV0aG9yaXR5IHJhdGhlciB0aGFuIGRvd25ncmFkaW5nIHRvIGBSZW1lbWJlcmVkYC5cblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbixcblx0XHRcdHBlbmRpbmc6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW290aGVyLmlkZW50aWZpZXIsIHNlbGVjdGVkLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNsYWltcyBhIHN0b3JhZ2Utc2VlZGVkIHJlbWVtYmVyZWQgbW9kZWwgdGhhdCBkaXNhcHBlYXJzIG1pZC1zZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBtb2RlbCgndGVzdC9vdGhlcicpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtyZW1lbWJlcmVkLCBvdGhlcl0sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Ly8gVGhlIHJlbWVtYmVyZWQgbW9kZWwgaXMgYWxyZWFkeSBhdmFpbGFibGUsIHNvIGBpbml0aWFsaXplYCBhcHBsaWVzIGl0IGFuZCBhcm1zIG5vIHdhaXQuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllciwgKCkgPT4geyB9KTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbb3RoZXJdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdtb2RlbC1nb25lJyk7XG5cdFx0Y29uc3QgZHVyaW5nT3V0YWdlID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0c3RhdGUubW9kZWxzID0gW3JlbWVtYmVyZWQsIG90aGVyXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbW9kZWwtYmFjaycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkdXJpbmdPdXRhZ2UsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHR9LCB7XG5cdFx0XHRkdXJpbmdPdXRhZ2U6IG90aGVyLmlkZW50aWZpZXIsXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtyZW1lbWJlcmVkLmlkZW50aWZpZXIsIG90aGVyLmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY2xhaW1zIHRoZSBzZWxlY3RlZCBtb2RlbCBldmVuIGFmdGVyIGEgc2FtZS1mYW1pbHkgc3Vic3RpdHV0ZSBzdG9vZCBpbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IG1vZGVsKCd0ZXN0L3NlbGVjdGVkJyk7XG5cdFx0Y29uc3Qgc3Vic3RpdHV0ZTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0ge1xuXHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qvc3Vic3RpdHV0ZScsXG5cdFx0XHRtZXRhZGF0YTogeyAuLi5zZWxlY3RlZC5tZXRhZGF0YSwgaWQ6ICd0ZXN0L3N1YnN0aXR1dGUnLCBuYW1lOiAndGVzdC9zdWJzdGl0dXRlJyB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW3NlbGVjdGVkLCBzdWJzdGl0dXRlXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmFwcGx5RXhwbGljaXRTZWxlY3Rpb24oc2VsZWN0ZWQsICgpID0+IHsgfSwgZmFsc2UpO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzdWJzdGl0dXRlXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbW9kZWwtZ29uZScpO1xuXHRcdGNvbnN0IGR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtzZWxlY3RlZCwgc3Vic3RpdHV0ZV07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ21vZGVsLWJhY2snKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHVyaW5nT3V0YWdlLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRhcHBsaWVkLFxuXHRcdH0sIHtcblx0XHRcdC8vIFRoZSBzaGFyZWQgZmFtaWx5IG1ha2VzIGBzdWJzdGl0dXRlYCBhIGJlc3QgbWF0Y2gsIHNvIGl0IHN0YW5kcyBpbiByYXRoZXIgdGhhbiB0aGUgZGVmYXVsdC5cblx0XHRcdGR1cmluZ091dGFnZTogc3Vic3RpdHV0ZS5pZGVudGlmaWVyLFxuXHRcdFx0Y3VycmVudDogc2VsZWN0ZWQuaWRlbnRpZmllcixcblx0XHRcdGFwcGxpZWQ6IFtzdWJzdGl0dXRlLmlkZW50aWZpZXIsIHNlbGVjdGVkLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBleHBsaWNpdCBzZWxlY3Rpb24gb3V0bGl2ZXMgdGhlIG1vZGVsIGl0IGRpc3BsYWNlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IG1vZGVsKCd0ZXN0L3NlbGVjdGVkJyk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBtb2RlbCgndGVzdC9vdGhlcicpO1xuXHRcdGNvbnN0IGNob3NlbiA9IG1vZGVsKCd0ZXN0L2Nob3NlbicpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0geyBtb2RlbHM6IFtzZWxlY3RlZCwgb3RoZXIsIGNob3Nlbl0sIHNlc3Npb25UeXBlOiAnbG9jYWwnIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKHNlbGVjdGVkLCAoKSA9PiB7IH0sIGZhbHNlKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbb3RoZXIsIGNob3Nlbl07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ21vZGVsLXJlbW92ZWQnKTtcblx0XHRjb250cm9sbGVyLmFwcGx5RXhwbGljaXRTZWxlY3Rpb24oY2hvc2VuLCAoKSA9PiB7IH0sIGZhbHNlKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbc2VsZWN0ZWQsIG90aGVyLCBjaG9zZW5dO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdtb2RlbC1iYWNrJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHR9LCB7XG5cdFx0XHRjdXJyZW50OiBjaG9zZW4uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbixcblx0XHRcdHBlbmRpbmc6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW290aGVyLmlkZW50aWZpZXJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNsYWltcyBhbiBleHBsaWNpdCBwaWNrIHRoYXQgd2FzIGRpc3BsYWNlZCB3aGlsZSBjaGF0LmRlZmF1bHRNb2RlbCBzdG9vZCBpbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gbW9kZWwoJ3Rlc3QvY29uZmlndXJlZCcpO1xuXHRcdGNvbnN0IHBpY2tlZCA9IG1vZGVsKCd0ZXN0L3BpY2tlZCcpO1xuXHRcdGNvbnN0IHN0YXRlOiBJUnVudGltZVN0YXRlID0ge1xuXHRcdFx0bW9kZWxzOiBbY29uZmlndXJlZCwgcGlja2VkXSxcblx0XHRcdHNlc3Npb25UeXBlOiAnbG9jYWwnLFxuXHRcdFx0Y29uZmlndXJlZE1vZGVsOiBjb25maWd1cmVkLm1ldGFkYXRhLmlkLFxuXHRcdH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKHBpY2tlZCwgKCkgPT4geyB9LCBmYWxzZSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2NvbmZpZ3VyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdwaWNrZWQtZ29uZScpO1xuXHRcdGNvbnN0IGR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IHJlYXNvbkR1cmluZ091dGFnZSA9IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtjb25maWd1cmVkLCBwaWNrZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdwaWNrZWQtYmFjaycpO1xuXHRcdGNvbnN0IGFmdGVyUmV0dXJuID0gY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXI7XG5cdFx0Ly8gQSBsYXRlciByZWZyZXNoIG11c3Qgbm90IGxldCB0aGUgY29uZmlndXJlZCBkZWZhdWx0IHJlY2xhaW0gYW4gZXhwbGljaXQgcGljay5cblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbGF0ZXItcmVmcmVzaCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkdXJpbmdPdXRhZ2UsXG5cdFx0XHRyZWFzb25EdXJpbmdPdXRhZ2UsXG5cdFx0XHRhZnRlclJldHVybixcblx0XHRcdGFmdGVyUmVmcmVzaDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IGNvbnRyb2xsZXIuc2VsZWN0aW9uUmVhc29uLFxuXHRcdH0sIHtcblx0XHRcdGR1cmluZ091dGFnZTogY29uZmlndXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uRHVyaW5nT3V0YWdlOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHRcdGFmdGVyUmV0dXJuOiBwaWNrZWQuaWRlbnRpZmllcixcblx0XHRcdGFmdGVyUmVmcmVzaDogcGlja2VkLmlkZW50aWZpZXIsXG5cdFx0XHRyZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgYSBmYWxsYmFjayB3aGlsZSB0aGUgY29uZmlndXJlZCBkZWZhdWx0IGxvYWRzLCB0aGVuIHVwZ3JhZGVzIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGJ5b2sgPSBtb2RlbCgnb3BlbmFpL2J5b2snKTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gbW9kZWwoJ2NvcGlsb3QvY29uZmlndXJlZCcpO1xuXHRcdGxldCBtb2RlbHMgPSBbYnlva107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IGNvbmZpZ3VyZWQubWV0YWRhdGEuaWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdGdldFZpc2libGVDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHVuZGVmaW5lZCwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBwZW5kaW5nID0gY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCk7XG5cdFx0bW9kZWxzID0gW2J5b2ssIGNvbmZpZ3VyZWRdO1xuXHRcdGNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKG1vZGVscyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcGVuZGluZywgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0cGVuZGluZzogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbYnlvay5pZGVudGlmaWVyLCBjb25maWd1cmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogY29uZmlndXJlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmVkIGRlZmF1bHQgc3VwZXJzZWRlcyBwZW5kaW5nIHJlbWVtYmVyZWQgaW50ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gbW9kZWwoJ3Rlc3QvY29uZmlndXJlZCcpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7XG5cdFx0XHRtb2RlbHM6IFtmYWxsYmFja10sXG5cdFx0XHRzZXNzaW9uVHlwZTogJ2xvY2FsJyxcblx0XHRcdGNvbmZpZ3VyZWRNb2RlbDogY29uZmlndXJlZC5tZXRhZGF0YS5pZCxcblx0XHR9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoc3RhdGUsIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIsICgpID0+IHsgfSk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrLCBjb25maWd1cmVkLCByZW1lbWJlcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHR9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyLCBjb25maWd1cmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogY29uZmlndXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJlZCBkZWZhdWx0IGNsYWltcyBhbiBhbHJlYWR5IHNlbGVjdGVkIGZhbGxiYWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCBkZWZhdWx0QmFzZSA9IG1vZGVsKCd0ZXN0L2RlZmF1bHQnKTtcblx0XHRjb25zdCBsb2NhdGlvbkRlZmF1bHQgPSB7XG5cdFx0XHQuLi5kZWZhdWx0QmFzZSxcblx0XHRcdG1ldGFkYXRhOiB7IC4uLmRlZmF1bHRCYXNlLm1ldGFkYXRhLCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9LFxuXHRcdH07XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW2ZhbGxiYWNrXSwgc2Vzc2lvblR5cGU6ICdsb2NhbCcgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUodW5kZWZpbmVkLCAoKSA9PiB7IH0pO1xuXHRcdHN0YXRlLmNvbmZpZ3VyZWRNb2RlbCA9IGZhbGxiYWNrLm1ldGFkYXRhLmlkO1xuXHRcdHN0YXRlLm1vZGVscyA9IFtmYWxsYmFjaywgbG9jYXRpb25EZWZhdWx0XTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnY29uZmlndXJlZCcpO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd1bmNoYW5nZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBjb250cm9sbGVyLnNlbGVjdGlvblJlYXNvbixcblx0XHR9LCB7XG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBmYWxsYmFjay5pZGVudGlmaWVyLFxuXHRcdFx0cmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYW4gZXhwbGljaXQgc2VsZWN0aW9uIHdoZW4gdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBsb2FkcyBsYXRlcicsICgpID0+IHtcblx0XHRjb25zdCBieW9rID0gbW9kZWwoJ29wZW5haS9ieW9rJyk7XG5cdFx0Y29uc3QgZXhwbGljaXQgPSBtb2RlbCgnb3BlbmFpL2V4cGxpY2l0Jyk7XG5cdFx0Y29uc3QgY29uZmlndXJlZCA9IG1vZGVsKCdjb3BpbG90L2NvbmZpZ3VyZWQnKTtcblx0XHRsZXQgbW9kZWxzID0gW2J5b2ssIGV4cGxpY2l0XTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gY29uZmlndXJlZC5tZXRhZGF0YS5pZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUodW5kZWZpbmVkLCAoKSA9PiB7IH0pO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlFeHBsaWNpdFNlbGVjdGlvbihleHBsaWNpdCwgKCkgPT4gYXBwbGllZC5wdXNoKGV4cGxpY2l0LmlkZW50aWZpZXIpLCBmYWxzZSk7XG5cdFx0bW9kZWxzID0gW2J5b2ssIGV4cGxpY2l0LCBjb25maWd1cmVkXTtcblx0XHRjb250cm9sbGVyLnJlY29uY2lsZU1vZGVsTGlzdENoYW5nZShtb2RlbHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGFwcGxpZWQ6IFtieW9rLmlkZW50aWZpZXIsIGV4cGxpY2l0LmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogZXhwbGljaXQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVyc2F0aW9uIHJlc3RvcmUgY2FuY2VscyBzdGFydHVwIHJlbWVtYmVyZWQgaW50ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrID0gbW9kZWwoJ3Rlc3QvZmFsbGJhY2snKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ2NvcGlsb3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gbW9kZWwoJ3Rlc3QvcmVzdG9yZWQnKTtcblx0XHRsZXQgbW9kZWxzID0gW2ZhbGxiYWNrLCByZXN0b3JlZF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZC5pZGVudGlmaWVyLCAoKSA9PiB7IH0pO1xuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShyZXN0b3JlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdjaGF0Om9uZScpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgcmVzdG9yZWQsIHJlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmc6IGNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmc6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlc3RvcmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogcmVzdG9yZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZSBjb25maWd1cmVkIGRlZmF1bHQgZG9lcyBub3Qgb3ZlcndyaXRlIGEgcmVzdG9yZWQgY29udmVyc2F0aW9uIG1vZGVsJywgKCkgPT4ge1xuXHRcdC8vIEEgZ2VudWluZSByZW9wZW5lZCBjb252ZXJzYXRpb24gaXMgTk9OLWVtcHR5LCBzbyB0aGUgY29uZmlndXJlZCBkZWZhdWx0IG11c3QgbmV2ZXIgb3ZlcnJpZGVcblx0XHQvLyBpdHMgcmVzdG9yZWQgbW9kZWwuIFRoZSBlbXB0eS9uZXctc2Vzc2lvbiBjYXNlICh3aGVyZSB0aGUgY29uZmlndXJlZCBkZWZhdWx0IHdpbnMgb3ZlciBhXG5cdFx0Ly8gc3BpbGxlZC1vdmVyIHJlc3RvcmUpIGlzIGNvdmVyZWQgYnkgdGhlIGVtcHR5LXNlc3Npb24gdGVzdHMgYWJvdmUuXG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBtb2RlbCgndGVzdC9yZXN0b3JlZCcpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWQgPSBtb2RlbCgnY29waWxvdC9jb25maWd1cmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtyZXN0b3JlZF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBjb25maWd1cmVkLm1ldGFkYXRhLmlkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZSh1bmRlZmluZWQsICgpID0+IHsgfSk7XG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKHJlc3RvcmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2NoYXQ6b25lJyk7XG5cdFx0bW9kZWxzID0gW3Jlc3RvcmVkLCBjb25maWd1cmVkXTtcblx0XHRjb250cm9sbGVyLnJlY29uY2lsZU1vZGVsTGlzdENoYW5nZShtb2RlbHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGFwcGxpZWQ6IFtyZXN0b3JlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlc3RvcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnNhdGlvbiByZXN0b3JlIGNhbmNlbHMgb2xkZXIgaGlzdG9yeSBpbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBtb2RlbCgndGVzdC9yZXN0b3JlZCcpO1xuXHRcdGNvbnN0IGhpc3RvcnkgPSBtb2RlbCgndGVzdC9oaXN0b3J5Jyk7XG5cdFx0bGV0IG1vZGVscyA9IFtyZXN0b3JlZF07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLnByZXNlbGVjdEZyb21IaXN0b3J5KGhpc3RvcnkuaWRlbnRpZmllciwgJ2NoYXQ6b25lJyk7XG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKHJlc3RvcmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJ2NoYXQ6b25lJyk7XG5cdFx0bW9kZWxzID0gW3Jlc3RvcmVkLCBoaXN0b3J5XTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgndGVzdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGFwcGxpZWQ6IFtyZXN0b3JlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlc3RvcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZyZXNoIGNvbnZlcnNhdGlvbiBwcmVjZWRlbmNlIGlzIGNvbmZpZ3VyZWQsIHJlbWVtYmVyZWQsIGRlZmF1bHQsIHRoZW4gZmlyc3QgYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0ID0gbW9kZWwoJ3Rlc3QvZmlyc3QnKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGNvbnN0IGxvY2F0aW9uRGVmYXVsdCA9IHtcblx0XHRcdC4uLm1vZGVsKCd0ZXN0L2RlZmF1bHQnKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLm1vZGVsKCd0ZXN0L2RlZmF1bHQnKS5tZXRhZGF0YSxcblx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBydW4gPSAoY29uZmlndXJlZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbWVtYmVyZWRNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdKSA9PiB7XG5cdFx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gY29uZmlndXJlZE1vZGVsLFxuXHRcdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpLmluaXRpYWxpemUocmVtZW1iZXJlZE1vZGVsLCAoKSA9PiB7IH0pO1xuXHRcdFx0cmV0dXJuIGFwcGxpZWRbMF07XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cnVuKGxvY2F0aW9uRGVmYXVsdC5tZXRhZGF0YS5pZCwgcmVtZW1iZXJlZC5pZGVudGlmaWVyLCBbZmlyc3QsIHJlbWVtYmVyZWQsIGxvY2F0aW9uRGVmYXVsdF0pLFxuXHRcdFx0cnVuKHVuZGVmaW5lZCwgcmVtZW1iZXJlZC5pZGVudGlmaWVyLCBbZmlyc3QsIHJlbWVtYmVyZWQsIGxvY2F0aW9uRGVmYXVsdF0pLFxuXHRcdFx0cnVuKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbZmlyc3QsIGxvY2F0aW9uRGVmYXVsdF0pLFxuXHRcdFx0cnVuKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbZmlyc3RdKSxcblx0XHRdLCBbbG9jYXRpb25EZWZhdWx0LmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllciwgbG9jYXRpb25EZWZhdWx0LmlkZW50aWZpZXIsIGZpcnN0LmlkZW50aWZpZXJdKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBmYWxsYmFjayBhbmQgY29uZmlndXJlZCBkZWZhdWx0cyB0aHJvdWdoIHRoZSBhdXRvbWF0aWMgcGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbW9kZWwoJ3Rlc3Qvc2Vjb25kJyk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbjogeyBtb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSB7IG1vZGVsOiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gW2ZpcnN0LCBzZWNvbmRdLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBbZmlyc3QsIHNlY29uZF0sXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gY29uZmlndXJhdGlvbi5tb2RlbCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdGNvbmZpZ3VyYXRpb24ubW9kZWwgPSBzZWNvbmQubWV0YWRhdGEuaWQ7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCB9LCB7XG5cdFx0XHRjb25maWd1cmVkQXBwbGllZDogdHJ1ZSxcblx0XHRcdGFwcGxpZWQ6IFtmaXJzdC5pZGVudGlmaWVyLCBzZWNvbmQuaWRlbnRpZmllcl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWFwcGxpZXMgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBvdmVyIGEgc3BpbGxlZC1vdmVyIHNlc3Npb24tcmVzdG9yZSBvbiBhbiBlbXB0eSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSBsb2NhbCBcIisgbmV3IHNlc3Npb25cIiAvIGJhY2stdG8tbGlzdCBjYXNlczogYSBuZXcgZW1wdHkgc2Vzc2lvbiB0aGF0XG5cdFx0Ly8gaW5oZXJpdHMgdGhlIHByZXZpb3VzIHNlc3Npb24ncyBtb2RlbCBhcyBhIHNlc3Npb24tcmVzdG9yZSBtdXN0IHN0aWxsIHJlc2V0IHRvIHRoZVxuXHRcdC8vIGNvbmZpZ3VyZWQgYGNoYXQuZGVmYXVsdE1vZGVsYC4gU2VlIHRoZSBTZXNzaW9uUmVzdG9yZS1pcy1ub3QtYS1ibG9ja2VyIHJ1bGUgaW5cblx0XHQvLyBgYXBwbHlDb25maWd1cmVkRGVmYXVsdGAuXG5cdFx0Y29uc3QgZ3B0ID0gbW9kZWwoJ3Rlc3QvZ3B0Jyk7XG5cdFx0Y29uc3Qgb3B1cyA9IG1vZGVsKCd0ZXN0L29wdXMnKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihcblx0XHRcdGNyZWF0ZVJ1bnRpbWUoeyBtb2RlbHM6IFtncHQsIG9wdXNdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnLCBjb25maWd1cmVkTW9kZWw6IGdwdC5tZXRhZGF0YS5pZCB9LCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaCh0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShvcHVzLCB1bmRlZmluZWQsICd0ZXN0JywgJ2NoYXQ6b25lJyk7XG5cdFx0Y29uc3QgYWZ0ZXJTcGlsbG92ZXIgPSBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRjb25zdCBjb25maWd1cmVkQXBwbGllZCA9IGNvbnRyb2xsZXIuYXBwbHlDb25maWd1cmVkRGVmYXVsdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFmdGVyU3BpbGxvdmVyLCBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgfSwge1xuXHRcdFx0YWZ0ZXJTcGlsbG92ZXI6IG9wdXMuaWRlbnRpZmllcixcblx0XHRcdGNvbmZpZ3VyZWRBcHBsaWVkOiB0cnVlLFxuXHRcdFx0YXBwbGllZDogW29wdXMuaWRlbnRpZmllciwgZ3B0LmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogZ3B0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGEgcmVvcGVuZWQgY29udmVyc2F0aW9uIG9uIGl0cyBvd24gbW9kZWwgaW5zdGVhZCBvZiB0aGUgY29uZmlndXJlZCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdC8vIFN3aXRjaGluZyBiYWNrIHRvIGEgY2hhdCB0aGF0IGFscmVhZHkgaGFzIGhpc3RvcnkgbXVzdCBub3QgcmUtc2VlZCBpdCBmcm9tXG5cdFx0Ly8gYGNoYXQuZGVmYXVsdE1vZGVsYCBcdTIwMTQgdGhhdCBidXN0cyB0aGUgcHJvbXB0IGNhY2hlIG9uIGV2ZXJ5IHN3aXRjaC5cblx0XHRjb25zdCBncHQgPSBtb2RlbCgndGVzdC9ncHQnKTtcblx0XHRjb25zdCBvcHVzID0gbW9kZWwoJ3Rlc3Qvb3B1cycpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKGNyZWF0ZVJ1bnRpbWUoXG5cdFx0XHR7IG1vZGVsczogW2dwdCwgb3B1c10sIHNlc3Npb25UeXBlOiAndGVzdCcsIGNvbmZpZ3VyZWRNb2RlbDogZ3B0Lm1ldGFkYXRhLmlkLCBpc0VtcHR5OiBmYWxzZSB9LFxuXHRcdFx0bW9kZWxDaGFuZ2VzLFxuXHRcdFx0YXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYmVnaW5TZXNzaW9uU3dpdGNoKGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKG9wdXMuaWRlbnRpZmllciwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBjb25maWd1cmVkQXBwbGllZCA9IGNvbnRyb2xsZXIuYXBwbHlDb25maWd1cmVkRGVmYXVsdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbmZpZ3VyZWRBcHBsaWVkLCBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRjb25maWd1cmVkQXBwbGllZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbb3B1cy5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IG9wdXMuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGFuIGV4cGxpY2l0IHVzZXIgcGljayBvbiBhbiBlbXB0eSBzZXNzaW9uIG92ZXIgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBncHQgPSBtb2RlbCgndGVzdC9ncHQnKTtcblx0XHRjb25zdCBvcHVzID0gbW9kZWwoJ3Rlc3Qvb3B1cycpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKFxuXHRcdFx0Y3JlYXRlUnVudGltZSh7IG1vZGVsczogW2dwdCwgb3B1c10sIHNlc3Npb25UeXBlOiAndGVzdCcsIGNvbmZpZ3VyZWRNb2RlbDogZ3B0Lm1ldGFkYXRhLmlkIH0sIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYmVnaW5TZXNzaW9uU3dpdGNoKHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0Y29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKG9wdXMsICgpID0+IGFwcGxpZWQucHVzaChvcHVzLmlkZW50aWZpZXIpLCBmYWxzZSk7XG5cdFx0Y29uc3QgY29uZmlndXJlZEFwcGxpZWQgPSBjb250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjb25maWd1cmVkQXBwbGllZCwgYXBwbGllZCwgY3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsIHVzZXJQaWNrZWQ6IGNvbnRyb2xsZXIudXNlckV4cGxpY2l0bHlTZWxlY3RlZE1vZGVsIH0sIHtcblx0XHRcdGNvbmZpZ3VyZWRBcHBsaWVkOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtvcHVzLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogb3B1cy5pZGVudGlmaWVyLFxuXHRcdFx0dXNlclBpY2tlZDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIHJlc3RvcmVkIG1vZGVsIG9uIGEgcmVvcGVuZWQgbm9uLWVtcHR5IGNvbnZlcnNhdGlvbiBldmVuIHdoZW4gYSBkZWZhdWx0IGlzIGNvbmZpZ3VyZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3B0ID0gbW9kZWwoJ3Rlc3QvZ3B0Jyk7XG5cdFx0Y29uc3Qgb3B1cyA9IG1vZGVsKCd0ZXN0L29wdXMnKTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IFtncHQsIG9wdXNdLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBbZ3B0LCBvcHVzXSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiBncHQubWV0YWRhdGEuaWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdGdldFZpc2libGVDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiBhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllciksXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKG9wdXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBjb25maWd1cmVkQXBwbGllZCA9IGNvbnRyb2xsZXIuYXBwbHlDb25maWd1cmVkRGVmYXVsdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbmZpZ3VyZWRBcHBsaWVkLCBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRjb25maWd1cmVkQXBwbGllZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbb3B1cy5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IG9wdXMuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHRoZSBzcGlsbGVkLW92ZXIgbW9kZWwgc3RpY2t5IHdoZW4gbm8gZGVmYXVsdCBtb2RlbCBpcyBjb25maWd1cmVkJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBmaXggbXVzdCBiZSBpbmVydCB3aGVuIGBjaGF0LmRlZmF1bHRNb2RlbGAgaXMgdW5zZXQ6IHN0aWNreSBcImxhc3QtdXNlZFwiIGJlaGF2aW9yIHdpbnMuXG5cdFx0Y29uc3QgZ3B0ID0gbW9kZWwoJ3Rlc3QvZ3B0Jyk7XG5cdFx0Y29uc3Qgb3B1cyA9IG1vZGVsKCd0ZXN0L29wdXMnKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihcblx0XHRcdGNyZWF0ZVJ1bnRpbWUoeyBtb2RlbHM6IFtncHQsIG9wdXNdLCBzZXNzaW9uVHlwZTogJ3Rlc3QnIH0sIG1vZGVsQ2hhbmdlcywgYXBwbGllZCkpKTtcblxuXHRcdGNvbnRyb2xsZXIuYmVnaW5TZXNzaW9uU3dpdGNoKHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKG9wdXMsIHVuZGVmaW5lZCwgJ3Rlc3QnLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBjb25maWd1cmVkQXBwbGllZCA9IGNvbnRyb2xsZXIuYXBwbHlDb25maWd1cmVkRGVmYXVsdCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNvbmZpZ3VyZWRBcHBsaWVkLCBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRjb25maWd1cmVkQXBwbGllZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbb3B1cy5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IG9wdXMuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgYSBCWU9LIGZpcnN0LWF2YWlsYWJsZSBtb2RlbCB3aGVuIHRoZSBDb3BpbG90IGRlZmF1bHQgbG9hZHMgbGF0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgYnlvayA9IG1vZGVsKCdvcGVuYWkvYnlvaycpO1xuXHRcdGNvbnN0IGNvcGlsb3REZWZhdWx0ID0ge1xuXHRcdFx0Li4ubW9kZWwoJ2NvcGlsb3QvYXV0bycpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0Li4ubW9kZWwoJ2NvcGlsb3QvYXV0bycpLm1ldGFkYXRhLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRsZXQgbW9kZWxzID0gW2J5b2tdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUodW5kZWZpbmVkLCAoKSA9PiB7IH0pO1xuXHRcdG1vZGVscyA9IFtieW9rLCBjb3BpbG90RGVmYXVsdF07XG5cdFx0Y29udHJvbGxlci5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UobW9kZWxzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRhcHBsaWVkOiBbYnlvay5pZGVudGlmaWVyLCBjb3BpbG90RGVmYXVsdC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IGNvcGlsb3REZWZhdWx0LmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGNyb3NzLXBvb2wgZHJhZnRzIGFuZCB3YWl0cyBmb3IgYSBjb2xkIGNvbnZlcnNhdGlvbiBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXHRcdGNvbnN0IGdlbmVyYWwgPSBtb2RlbCgndGVzdC9nZW5lcmFsJyk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2ZhbGxiYWNrJywgc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2Rlc2lyZWQnLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVscyA9IFtmYWxsYmFja107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByZXN0b3JlZDogeyBtb2RlbElkOiBzdHJpbmc7IGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc2Vzc2lvblR5cGUsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246IChtb2RlbElkLCBjb25maWd1cmF0aW9uKSA9PiByZXN0b3JlZC5wdXNoKHsgbW9kZWxJZCwgY29uZmlndXJhdGlvbiB9KSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb25zdCBkcmFmdCA9IGNvbnRyb2xsZXIucmVzb2x2ZURyYWZ0TW9kZWwoZ2VuZXJhbCwgc2Vzc2lvblR5cGUsIHRydWUpO1xuXHRcdG1vZGVscyA9IFtdO1xuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShkZXNpcmVkLCB7IGVmZm9ydDogJ2hpZ2gnIH0sIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBhd2FpdGluZyA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgZGVzaXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3Rlc3QnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZHJhZnQ6IHsgbW9kZWw6IGRyYWZ0Lm1vZGVsPy5pZGVudGlmaWVyLCBjaGFuZ2VkOiBkcmFmdC5jaGFuZ2VkIH0sXG5cdFx0XHRhd2FpdGluZyxcblx0XHRcdGF3YWl0aW5nQWZ0ZXJSZXNvbHZlOiBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKSxcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRyZXN0b3JlZCxcblx0XHR9LCB7XG5cdFx0XHRkcmFmdDogeyBtb2RlbDogdW5kZWZpbmVkLCBjaGFuZ2VkOiB0cnVlIH0sXG5cdFx0XHRhd2FpdGluZzogdHJ1ZSxcblx0XHRcdGF3YWl0aW5nQWZ0ZXJSZXNvbHZlOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtkZXNpcmVkLmlkZW50aWZpZXJdLFxuXHRcdFx0cmVzdG9yZWQ6IFt7IG1vZGVsSWQ6IGRlc2lyZWQuaWRlbnRpZmllciwgY29uZmlndXJhdGlvbjogeyBlZmZvcnQ6ICdoaWdoJyB9IH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlIHJlY2xhaW1zIHRoZSBjb252ZXJzYXRpb24gbW9kZWwgaG93ZXZlciBsYXRlIHRoZSBwb29sIHB1Ymxpc2hlcycsICgpID0+IHtcblx0XHQvLyBDb2xkLXJlc3RhcnQgcmFjZTogdGhlIGFnZW50LWhvc3QgdmVuZG9yIGlzIHJlZ2lzdGVyZWQgYnV0IGl0cyBtb2RlbHMgYXJyaXZlIGxhdGVyLCBhbmQgaXRcblx0XHQvLyBwdWJsaXNoZXMgaW4gd2F2ZXMgXHUyMDE0IGZpcnN0IHRoZSB3b3JrYmVuY2gncyBCWU9LIG1vZGVscyBtaXJyb3JlZCBpbiBvdmVyIHRoZSBicmlkZ2UsIHRoZW4gaXRzXG5cdFx0Ly8gb3duLiBXaGF0ZXZlciBzdGFuZC1pbiBpcyBzaG93biBtZWFud2hpbGUsIHRoZSBjb252ZXJzYXRpb24ncyBtb2RlbCBpcyByZWNsYWltZWQgdGhlIG1vbWVudFxuXHRcdC8vIGl0IGFwcGVhcnM7IG5vIHdhdmUgaGFzIHRvIGFycml2ZSBieSBhbnkgcGFydGljdWxhciBkZWFkbGluZSBmb3IgdGhlIHJlc3RvcmUgdG8gYmUgaG9ub3VyZWQuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblx0XHRjb25zdCBob3N0TW9kZWwgPSAoaWRlbnRpZmllcjogc3RyaW5nLCBieW9rTW9kZWxJZGVudGlmaWVyPzogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0+IHtcblx0XHRcdGNvbnN0IGJhc2UgPSB0YXJnZXRlZE1vZGVsKGlkZW50aWZpZXIsIHNlc3Npb25UeXBlKTtcblx0XHRcdHJldHVybiB7IC4uLmJhc2UsIG1ldGFkYXRhOiB7IC4uLmJhc2UubWV0YWRhdGEsIHZlbmRvcjogc2Vzc2lvblR5cGUsIGJ5b2tNb2RlbElkZW50aWZpZXIgfSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgZGVzaXJlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmdwdC01LjYtc29sJyk7XG5cdFx0Y29uc3QgYnJpZGdlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm9wZW5yb3V0ZXIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnLCAnb3BlbnJvdXRlci9PcGVuUm91dGVyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3RvcmVkOiB7IG1vZGVsSWQ6IHN0cmluZzsgY29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiBzZXNzaW9uVHlwZSxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiBtb2RlbENoYW5nZXMuZXZlbnQobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKG1vZGVsSWQsIGNvbmZpZ3VyYXRpb24pID0+IHJlc3RvcmVkLnB1c2goeyBtb2RlbElkLCBjb25maWd1cmF0aW9uIH0pLFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShkZXNpcmVkLCB7IGVmZm9ydDogJ2hpZ2gnIH0sIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBhd2FpdGluZ1doaWxlRW1wdHkgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHQvLyBXYXZlIG9uZTogYnJpZGdlZCBCWU9LIGNvcGllcyBvbmx5IFx1MjAxNCB0aGUgaG9zdCdzIG93biBjYXRhbG9nIGlzIHN0aWxsIGluIGZsaWdodC5cblx0XHRtb2RlbHMgPSBbYnJpZGdlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2J5b2stYnJpZGdlJyk7XG5cdFx0Y29uc3QgYXdhaXRpbmdBZnRlckJyaWRnZSA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdC8vIFdhdmUgdHdvOiB0aGUgaG9zdCdzIG93biBtb2RlbHMgYXJyaXZlLlxuXHRcdG1vZGVscyA9IFticmlkZ2VkLCBkZXNpcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF3YWl0aW5nV2hpbGVFbXB0eSxcblx0XHRcdGF3YWl0aW5nQWZ0ZXJCcmlkZ2UsXG5cdFx0XHRhd2FpdGluZ0FmdGVyTG9hZDogY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCksXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdGZpbmFsQXBwbGllZDogYXBwbGllZFthcHBsaWVkLmxlbmd0aCAtIDFdLFxuXHRcdFx0cmVzdG9yZWQsXG5cdFx0fSwge1xuXHRcdFx0YXdhaXRpbmdXaGlsZUVtcHR5OiB0cnVlLFxuXHRcdFx0YXdhaXRpbmdBZnRlckJyaWRnZTogdHJ1ZSxcblx0XHRcdGF3YWl0aW5nQWZ0ZXJMb2FkOiBmYWxzZSxcblx0XHRcdGN1cnJlbnQ6IGRlc2lyZWQuaWRlbnRpZmllcixcblx0XHRcdGZpbmFsQXBwbGllZDogZGVzaXJlZC5pZGVudGlmaWVyLFxuXHRcdFx0cmVzdG9yZWQ6IFt7IG1vZGVsSWQ6IGRlc2lyZWQuaWRlbnRpZmllciwgY29uZmlndXJhdGlvbjogeyBlZmZvcnQ6ICdoaWdoJyB9IH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHN0YW5kLWluIGVjaG9lZCBiYWNrIGJ5IHRoZSBjb252ZXJzYXRpb24gZG9lcyBub3QgZGlzcGxhY2UgdGhlIG1vZGVsIGJlaW5nIGF3YWl0ZWQnLCAoKSA9PiB7XG5cdFx0Ly8gQXBwbHlpbmcgYSBtb2RlbCB3cml0ZXMgaXQgaW50byB0aGUgY29udmVyc2F0aW9uJ3MgaW5wdXQgc3RhdGUsIHdoaWNoIHRoZSBhZ2VudCBob3N0XG5cdFx0Ly8gcmVwdWJsaXNoZXMgYXMgdGhlIHNlc3Npb24gZHJhZnQgYW5kIHN5bmNzIHN0cmFpZ2h0IGJhY2suIFdpdGhvdXQgdGhlIGVjaG8gZ3VhcmQgdGhhdFxuXHRcdC8vIHJvdW5kLXRyaXAgaXMgcmVhZCBhcyB0aGUgc2Vzc2lvbidzIG93biBtb2RlbCwgb3ZlcndyaXRlcyB0aGUgbW9kZWwgYmVpbmcgd2FpdGVkIGZvciwgYW5kXG5cdFx0Ly8gbWFrZXMgYSB0cmFuc2llbnQgc3RhbmQtaW4gcGVybWFuZW50IFx1MjAxNCB3aGljaCBpcyBleGFjdGx5IGhvdyBhIHJlc3RvcmVkIHNlc3Npb24gZW5kcyB1cFxuXHRcdC8vIHBpbm5lZCB0byBhbiBhcmJpdHJhcnkgbW9kZWwgZnJvbSBhIGhhbGYtcHVibGlzaGVkIHBvb2wuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJztcblx0XHRjb25zdCBob3N0TW9kZWwgPSAoaWRlbnRpZmllcjogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyID0+IHtcblx0XHRcdGNvbnN0IGJhc2UgPSB0YXJnZXRlZE1vZGVsKGlkZW50aWZpZXIsIHNlc3Npb25UeXBlKTtcblx0XHRcdHJldHVybiB7IC4uLmJhc2UsIG1ldGFkYXRhOiB7IC4uLmJhc2UubWV0YWRhdGEsIHZlbmRvcjogc2Vzc2lvblR5cGUgfSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgZGVzaXJlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmdwdC01LjYtc29sJyk7XG5cdFx0Y29uc3QgYnJpZGdlZCA9IGhvc3RNb2RlbCgnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm9wZW5yb3V0ZXIvYWkyMS9qYW1iYS1sYXJnZS0xLjcnKTtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRsZXQgbW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiBzZXNzaW9uVHlwZSxcblx0XHRcdGlzRW1wdHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiBtb2RlbENoYW5nZXMuZXZlbnQobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShkZXNpcmVkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHQvLyBXYXZlIG9uZSBwdWJsaXNoZXMgYnJpZGdlZCBjb3BpZXMgb25seSwgc28gYSBzdGFuZC1pbiBpcyBzaG93bi5cblx0XHRtb2RlbHMgPSBbYnJpZGdlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2J5b2stYnJpZGdlJyk7XG5cdFx0Y29uc3Qgc3RhbmRJbiA9IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdC8vIFRoZSBzdGFuZC1pbiByb3VuZC10cmlwcyB0aHJvdWdoIHRoZSBkcmFmdCBhbmQgY29tZXMgYmFjayBhcyB0aGUgc2Vzc2lvbidzIG1vZGVsLlxuXHRcdGNvbnRyb2xsZXIuc3luY0Zyb21Db252ZXJzYXRpb25TdGF0ZShicmlkZ2VkLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRjb25zdCBhd2FpdGluZ0FmdGVyRWNobyA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFticmlkZ2VkLCBkZXNpcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YW5kSW4sXG5cdFx0XHRhd2FpdGluZ0FmdGVyRWNobyxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHN0YW5kSW46IGJyaWRnZWQuaWRlbnRpZmllcixcblx0XHRcdGF3YWl0aW5nQWZ0ZXJFY2hvOiB0cnVlLFxuXHRcdFx0Y3VycmVudDogZGVzaXJlZC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBlZXIgY2xpZW50IGdlbnVpbmVseSBzZWxlY3RpbmcgdGhlIHN0YW5kLWluIHN1cGVyc2VkZXMgdGhlIG1vZGVsIGJlaW5nIGF3YWl0ZWQnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGVjaG8gZ3VhcmQga2V5cyBvbiB0aGUgbG9jYWwgcm91bmQtdHJpcCBvZiBvdXIgb3duIHN0YW5kLWluLiBBIHN0YXRlIHB1c2hlZCBpbiBieVxuXHRcdC8vIGFub3RoZXIgY29ubmVjdGVkIGNsaWVudCBjYXJyaWVzIGBDaGF0SW5wdXRTdGF0ZU9yaWdpbi5SZW1vdGVgLCBhbmQgdGhhdCBJUyBhIHJlYWwgc3RhdGVtZW50XG5cdFx0Ly8gYWJvdXQgdGhlIHNlc3Npb24gZXZlbiB3aGVuIGl0IG5hbWVzIHRoZSB2ZXJ5IG1vZGVsIHdlIGhhcHBlbiB0byBiZSBkaXNwbGF5aW5nIFx1MjAxNCBzbyBpdCBtdXN0XG5cdFx0Ly8gbm90IGJlIGRpc2NhcmRlZCBhcyBhbiBlY2hvLlxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtY29waWxvdGNsaSc7XG5cdFx0Y29uc3QgaG9zdE1vZGVsID0gKGlkZW50aWZpZXI6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB7XG5cdFx0XHRjb25zdCBiYXNlID0gdGFyZ2V0ZWRNb2RlbChpZGVudGlmaWVyLCBzZXNzaW9uVHlwZSk7XG5cdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBtZXRhZGF0YTogeyAuLi5iYXNlLm1ldGFkYXRhLCB2ZW5kb3I6IHNlc3Npb25UeXBlIH0gfTtcblx0XHR9O1xuXHRcdGNvbnN0IGRlc2lyZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpncHQtNS42LXNvbCcpO1xuXHRcdGNvbnN0IGJyaWRnZWQgPSBob3N0TW9kZWwoJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvcGVucm91dGVyL2FpMjEvamFtYmEtbGFyZ2UtMS43Jyk7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc2Vzc2lvblR5cGUsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoZGVzaXJlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0bW9kZWxzID0gW2JyaWRnZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdieW9rLWJyaWRnZScpO1xuXHRcdC8vIEEgcGVlciBwaWNrcyB0aGUgbW9kZWwgd2UgYXJlIHNob3dpbmcgYXMgYSBzdGFuZC1pbi5cblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoYnJpZGdlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJywgdHJ1ZSk7XG5cdFx0Y29uc3QgYXdhaXRpbmdBZnRlclBlZXJQaWNrID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0Ly8gVGhlIG9yaWdpbmFsbHkgYXdhaXRlZCBtb2RlbCBmaW5hbGx5IHB1Ymxpc2hlcyBcdTIwMTQgaXQgbXVzdCBOT1QgcmVjbGFpbSB0aGUgc2VsZWN0aW9uLlxuXHRcdG1vZGVscyA9IFticmlkZ2VkLCBkZXNpcmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgnbG9hZGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF3YWl0aW5nQWZ0ZXJQZWVyUGljayxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdGF3YWl0aW5nQWZ0ZXJQZWVyUGljazogZmFsc2UsXG5cdFx0XHRjdXJyZW50OiBicmlkZ2VkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemUga2VlcHMgcmVtZW1iZXJlZCBpbnRlbnQgdGhyb3VnaCBlbXB0eSBjYXRhbG9nIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSAndGVzdC1zZXNzaW9uJztcblx0XHRjb25zdCByZW1lbWJlcmVkID0gdGFyZ2V0ZWRNb2RlbCgndGVzdDpyZW1lbWJlcmVkJywgc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGxldCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHNlc3Npb25UeXBlLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogbGlzdGVuZXIgPT4gbW9kZWxDaGFuZ2VzLmV2ZW50KGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cblx0XHRjb250cm9sbGVyLmluaXRpYWxpemUocmVtZW1iZXJlZC5pZGVudGlmaWVyLCAoKSA9PiB7IH0pO1xuXHRcdGNvbnN0IHBlbmRpbmdBZnRlckluaXQgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHRjb25zdCBhcHBsaWVkQWZ0ZXJJbml0ID0gWy4uLmFwcGxpZWRdO1xuXHRcdC8vIEFuIGludGVybWVkaWF0ZSBlbXB0eSByZS1yZXNvbHV0aW9uIG11c3Qgbm90IGVuZCB0aGUgd2FpdCBvciBhcHBseSBhIGRlZmF1bHQuXG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3N0aWxsLWVtcHR5Jyk7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVyRW1wdHkgPSBjb250cm9sbGVyLmlzQXdhaXRpbmdSZW1lbWJlcmVkTW9kZWwoKTtcblx0XHQvLyBUaGUgcmVtZW1iZXJlZCBtb2RlbCBmaW5hbGx5IGFwcGVhcnMuXG5cdFx0bW9kZWxzID0gW3JlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdCxcblx0XHRcdGFwcGxpZWRBZnRlckluaXQsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJFbXB0eSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpLFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlckluaXQ6IHRydWUsXG5cdFx0XHRhcHBsaWVkQWZ0ZXJJbml0OiBbXSxcblx0XHRcdHBlbmRpbmdBZnRlckVtcHR5OiB0cnVlLFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbcmVtZW1iZXJlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHJlbWVtYmVyZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZSBiZXN0LW1hdGNoIHJlc3RvcmUgcmVtYWlucyBhdXRob3JpdGF0aXZlIGFmdGVyIGNvbmZpZ3VyZWQtbW9kZWwgcmVmcmVzaCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbENoYW5nZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXHRcdGNvbnN0IGRlc2lyZWQgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L2Rlc2lyZWQnLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbWF0Y2hCYXNlID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9tYXRjaCcsIHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBtYXRjaCA9IHsgLi4ubWF0Y2hCYXNlLCBtZXRhZGF0YTogeyAuLi5tYXRjaEJhc2UubWV0YWRhdGEsIGlkOiBkZXNpcmVkLm1ldGFkYXRhLmlkIH0gfTtcblx0XHRjb25zdCBjb25maWd1cmVkID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9jb25maWd1cmVkJywgc2Vzc2lvblR5cGUpO1xuXHRcdC8vIEEgZ2VudWluZSByZW9wZW5lZCBjb252ZXJzYXRpb24gaXMgTk9OLWVtcHR5LCBzbyBpdHMgYmVzdC1tYXRjaCByZXN0b3JlIHN0YXlzIGF1dGhvcml0YXRpdmUgYW5kXG5cdFx0Ly8gdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBtdXN0IG5vdCBvdmVycmlkZSBpdC4gVGhlIGVtcHR5LXNlc3Npb24gYmVoYXZpb3IgaXMgY292ZXJlZCBhYm92ZS5cblx0XHRjb25zdCBzdGF0ZTogSVJ1bnRpbWVTdGF0ZSA9IHsgbW9kZWxzOiBbXSwgc2Vzc2lvblR5cGUsIGNvbmZpZ3VyZWRNb2RlbDogY29uZmlndXJlZC5tZXRhZGF0YS5pZCwgaXNFbXB0eTogZmFsc2UgfTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihjcmVhdGVSdW50aW1lKHN0YXRlLCBtb2RlbENoYW5nZXMsIGFwcGxpZWQpKSk7XG5cblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoZGVzaXJlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0c3RhdGUubW9kZWxzID0gW21hdGNoLCBjb25maWd1cmVkXTtcblx0XHRtb2RlbENoYW5nZXMuZmlyZSgndGVzdCcpO1xuXHRcdGNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKHN0YXRlLm1vZGVscyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFwcGxpZWQsXG5cdFx0XHRjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogY29udHJvbGxlci5zZWxlY3Rpb25SZWFzb24sXG5cdFx0fSwge1xuXHRcdFx0YXBwbGllZDogW21hdGNoLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogbWF0Y2guaWRlbnRpZmllcixcblx0XHRcdHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZ2VudWluZWx5IGRpZmZlcmVudCBjb252ZXJzYXRpb24gbW9kZWwgY2FuY2VscyBhbiBvdXRzdGFuZGluZyByZXN0b3JlJywgKCkgPT4ge1xuXHRcdC8vIERpc3RpbmN0IGZyb20gdGhlIGVjaG9lZCBzdGFuZC1pbiBhYm92ZTogdGhpcyBtb2RlbCB3YXMgbmV2ZXIgYXBwbGllZCBieSB0aGUgY29udHJvbGxlcixcblx0XHQvLyBzbyBpdCBpcyBhIHJlYWwgc3RhdGVtZW50IGFib3V0IHRoZSBzZXNzaW9uIGFuZCBzdXBlcnNlZGVzIHRoZSBtb2RlbCBiZWluZyB3YWl0ZWQgZm9yLlxuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtdGVzdCc7XG5cdFx0Y29uc3Qgc3RhbGVEZXNpcmVkID0gdGFyZ2V0ZWRNb2RlbCgndGVzdC9zdGFsZScsIHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBmYWxsYmFjayA9IHRhcmdldGVkTW9kZWwoJ3Rlc3QvZmFsbGJhY2snLCBzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgaW5hcHBsaWNhYmxlID0gbW9kZWwoJ3Rlc3QvaW5hcHBsaWNhYmxlJyk7XG5cdFx0Y29uc3Qgc3RhdGU6IElSdW50aW1lU3RhdGUgPSB7IG1vZGVsczogW10sIHNlc3Npb25UeXBlIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIoY3JlYXRlUnVudGltZShzdGF0ZSwgbW9kZWxDaGFuZ2VzLCBhcHBsaWVkKSkpO1xuXG5cdFx0Y29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKHN0YWxlRGVzaXJlZCwgdW5kZWZpbmVkLCBzZXNzaW9uVHlwZSwgJ2NoYXQ6b25lJyk7XG5cdFx0c3RhdGUubW9kZWxzID0gW2ZhbGxiYWNrXTtcblx0XHRjb250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoaW5hcHBsaWNhYmxlLCB1bmRlZmluZWQsIHNlc3Npb25UeXBlLCAnY2hhdDpvbmUnKTtcblx0XHRzdGF0ZS5tb2RlbHMgPSBbZmFsbGJhY2ssIHN0YWxlRGVzaXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ3Rlc3QnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwZW5kaW5nOiBjb250cm9sbGVyLmhhc1BlbmRpbmdJbnRlbnQoKSwgYXBwbGllZCB9LCB7XG5cdFx0XHRwZW5kaW5nOiBmYWxzZSxcblx0XHRcdGFwcGxpZWQ6IFtmYWxsYmFjay5pZGVudGlmaWVyXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYXBwbHkgYSBsYXRlIGhpc3RvcnkgbW9kZWwgYWZ0ZXIgdGhlIHZpc2libGUgY29udmVyc2F0aW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBtb2RlbCgndGVzdC9yZXN0b3JlZCcpO1xuXHRcdGxldCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdFx0bGV0IHZpc2libGVDb252ZXJzYXRpb24gPSAnY2hhdDpvbmUnO1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRpc0VtcHR5OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gdmlzaWJsZUNvbnZlcnNhdGlvbixcblx0XHRcdGdldFZpc2libGVDb252ZXJzYXRpb25LZXk6ICgpID0+IHZpc2libGVDb252ZXJzYXRpb24sXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiBhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllciksXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5wcmVzZWxlY3RGcm9tSGlzdG9yeShyZXN0b3JlZC5pZGVudGlmaWVyLCAnY2hhdDpvbmUnKTtcblx0XHR2aXNpYmxlQ29udmVyc2F0aW9uID0gJ2NoYXQ6dHdvJztcblx0XHRtb2RlbHMgPSBbcmVzdG9yZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCd0ZXN0Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFwcGxpZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV2YWxpZGF0ZXMgYSBzZWxlY3Rpb24gd2hlbiBzd2l0Y2hpbmcgbW9kZWwgcG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ2VuZXJhbCA9IG1vZGVsKCd0ZXN0L2dlbmVyYWwnKTtcblx0XHRjb25zdCB0YXJnZXRlZCA9IHRhcmdldGVkTW9kZWwoJ3Rlc3QvdGFyZ2V0ZWQnLCAnYWdlbnQtaG9zdC10ZXN0Jyk7XG5cdFx0Y29uc3Qgc3RhdGU6IHsgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9ID0geyBzZXNzaW9uVHlwZTogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHN0YXRlLnNlc3Npb25UeXBlLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogdHlwZSA9PiB0eXBlID8gW3RhcmdldGVkXSA6IFtnZW5lcmFsXSxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gW2dlbmVyYWwsIHRhcmdldGVkXSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiAoKSA9PiB0cnVlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246ICgpID0+IHsgfSxcblx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0YXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcihydW50aW1lKSk7XG5cdFx0Y29udHJvbGxlci5hcHBseUF1dG9tYXRpY1NlbGVjdGlvbihnZW5lcmFsLCAoKSA9PiB7IH0pO1xuXHRcdHN0YXRlLnNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtdGVzdCc7XG5cblx0XHRjb250cm9sbGVyLnJldmFsaWRhdGVGb3JTZXNzaW9uVHlwZSgoKSA9PiB7IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFwcGxpZWQsIGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyIH0sIHtcblx0XHRcdGFwcGxpZWQ6IFt0YXJnZXRlZC5pZGVudGlmaWVyXSxcblx0XHRcdGN1cnJlbnQ6IHRhcmdldGVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFycyB0aGUgcHJldmlvdXMgbW9kZWwgd2hpbGUgdGhlIGRlc3RpbmF0aW9uIGhhcm5lc3MgcG9vbCBsb2FkcycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXHRcdGNvbnN0IGdlbmVyYWwgPSBtb2RlbCgndGVzdC9nZW5lcmFsJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ZWQgPSB0YXJnZXRlZE1vZGVsKCd0ZXN0L3RhcmdldGVkJywgc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IHN0YXRlOiB7IHNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHRhcmdldGVkTW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB9ID0ge1xuXHRcdFx0c2Vzc2lvblR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdHRhcmdldGVkTW9kZWxzOiBbXSxcblx0XHR9O1xuXHRcdGNvbnN0IGFwcGxpZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Z2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiBzdGF0ZS5zZXNzaW9uVHlwZSxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6IHNlc3Npb25UeXBlID0+IHNlc3Npb25UeXBlID8gc3RhdGUudGFyZ2V0ZWRNb2RlbHMgOiBbZ2VuZXJhbF0sXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IFtnZW5lcmFsLCAuLi5zdGF0ZS50YXJnZXRlZE1vZGVsc10sXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogc2Vzc2lvblR5cGUgPT4gc2Vzc2lvblR5cGUgPT09IHN0YXRlLnNlc3Npb25UeXBlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiBtb2RlbENoYW5nZXMuZXZlbnQobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4gYXBwbGllZC5wdXNoKHNlbGVjdGVkLmlkZW50aWZpZXIpLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblx0XHRjb250cm9sbGVyLmFwcGx5QXV0b21hdGljU2VsZWN0aW9uKGdlbmVyYWwsICgpID0+IHsgfSk7XG5cblx0XHRzdGF0ZS5zZXNzaW9uVHlwZSA9IHNlc3Npb25UeXBlO1xuXHRcdGNvbnRyb2xsZXIucmV2YWxpZGF0ZUZvclNlc3Npb25UeXBlKCgpID0+IHsgfSk7XG5cdFx0Y29uc3QgbW9kZWxXaGlsZUxvYWRpbmcgPSBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRzdGF0ZS50YXJnZXRlZE1vZGVscyA9IFt0YXJnZXRlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1vZGVsV2hpbGVMb2FkaW5nLCBhcHBsaWVkLCBjdXJyZW50OiBjb250cm9sbGVyLmN1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciB9LCB7XG5cdFx0XHRtb2RlbFdoaWxlTG9hZGluZzogdW5kZWZpbmVkLFxuXHRcdFx0YXBwbGllZDogW3RhcmdldGVkLmlkZW50aWZpZXJdLFxuXHRcdFx0Y3VycmVudDogdGFyZ2V0ZWQuaWRlbnRpZmllcixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZSByZXN0b3JlcyBhIHJlbWVtYmVyZWQgbW9kZWwgYWZ0ZXIgYSBub24tZW1wdHkgaW5pdGlhbCBjYXRhbG9nJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBpbml0aWFsIGZhbGxiYWNrIHJlbWFpbnMgcHJvdmlzaW9uYWwgZXZlbiB3aGVuIHRoZSBjYXRhbG9nIHJlcG9ydHMgdGhlIHJlbWVtYmVyZWQgbW9kZWwgdW5hdmFpbGFibGUuXG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtb2RlbCgndGVzdC9mYWxsYmFjaycpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSBtb2RlbCgndGVzdC9yZW1lbWJlcmVkJyk7XG5cdFx0bGV0IG1vZGVscyA9IFtmYWxsYmFja107XG5cdFx0Y29uc3QgYXBwbGllZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiBtb2RlbENoYW5nZXMuZXZlbnQobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0YXBwbHlNb2RlbDogc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblxuXHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkLmlkZW50aWZpZXIsICgpID0+IHsgfSk7XG5cdFx0Y29uc3QgcGVuZGluZ0FmdGVySW5pdCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgcmVtZW1iZXJlZF07XG5cdFx0bW9kZWxDaGFuZ2VzLmZpcmUoJ2xvYWRlZCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nQWZ0ZXJJbml0LFxuXHRcdFx0cGVuZGluZ0FmdGVyTG9hZDogY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCksXG5cdFx0XHRhcHBsaWVkLFxuXHRcdFx0Y3VycmVudDogY29udHJvbGxlci5jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdDogdHJ1ZSxcblx0XHRcdHBlbmRpbmdBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0YXBwbGllZDogW2ZhbGxiYWNrLmlkZW50aWZpZXIsIHJlbWVtYmVyZWQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiByZW1lbWJlcmVkLmlkZW50aWZpZXIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaXRpYWxpemUgZG9lcyBub3QgYXJtIGEgcmVzdG9yZSB3YWl0IHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byB3YWl0IGZvcicsICgpID0+IHtcblx0XHQvLyBHdWFyZCBhZ2FpbnN0IG92ZXItYXJtaW5nOiBubyByZW1lbWJlcmVkIG1vZGVsLCBvciBhIHJlbWVtYmVyZWQgbW9kZWwgdGhhdCBpcyBhbHJlYWR5XG5cdFx0Ly8gYXZhaWxhYmxlLCBtdXN0IG5vdCBsZWF2ZSBhIGNhdGFsb2cgc3Vic2NyaXB0aW9uIGFybWVkLlxuXHRcdGNvbnN0IGJ1aWxkID0gKHJlbWVtYmVyZWRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdKSA9PiB7XG5cdFx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSA9IHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzRW1wdHk6ICgpID0+IHRydWUsXG5cdFx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IG1vZGVscyxcblx0XHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0XHRnZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5OiAoKSA9PiAnY2hhdDpvbmUnLFxuXHRcdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGFwcGx5TW9kZWw6IHNlbGVjdGVkID0+IHtcblx0XHRcdFx0XHRhcHBsaWVkLnB1c2goc2VsZWN0ZWQuaWRlbnRpZmllcik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHJ1bnRpbWUpKTtcblx0XHRcdGNvbnRyb2xsZXIuaW5pdGlhbGl6ZShyZW1lbWJlcmVkSWQsICgpID0+IHsgfSk7XG5cdFx0XHRyZXR1cm4gY29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCk7XG5cdFx0fTtcblx0XHRjb25zdCBmaXJzdCA9IG1vZGVsKCd0ZXN0L2ZpcnN0Jyk7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IG1vZGVsKCd0ZXN0L3JlbWVtYmVyZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bm9SZW1lbWJlcmVkTW9kZWw6IGJ1aWxkKHVuZGVmaW5lZCwgW2ZpcnN0XSksXG5cdFx0XHRyZW1lbWJlcmVkQWxyZWFkeUF2YWlsYWJsZTogYnVpbGQocmVtZW1iZXJlZC5pZGVudGlmaWVyLCBbZmlyc3QsIHJlbWVtYmVyZWRdKSxcblx0XHR9LCB7XG5cdFx0XHRub1JlbWVtYmVyZWRNb2RlbDogZmFsc2UsXG5cdFx0XHRyZW1lbWJlcmVkQWxyZWFkeUF2YWlsYWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGV4cGxpY2l0IHNlbGVjdGlvbiBjYW5jZWxzIHRoZSBpbml0aWFsaXplIHJlc3RvcmUgd2FpdCcsICgpID0+IHtcblx0XHQvLyBXaGlsZSB0aGUgd2FpdCBpcyBhcm1lZCwgYW4gZXhwbGljaXQgdXNlciBwaWNrIG11c3Qgd2luIHBlcm1hbmVudGx5OiB0aGUgd2FpdCBpcyBjYW5jZWxsZWRcblx0XHQvLyBhbmQgYSBsYXRlciBhcHBlYXJhbmNlIG9mIHRoZSByZW1lbWJlcmVkIG1vZGVsIGRvZXMgbm90IG92ZXJyaWRlIHRoZSBleHBsaWNpdCBzZWxlY3Rpb24uXG5cdFx0Y29uc3QgbW9kZWxDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSBtb2RlbCgndGVzdC9mYWxsYmFjaycpO1xuXHRcdGNvbnN0IGV4cGxpY2l0ID0gbW9kZWwoJ3Rlc3QvZXhwbGljaXQnKTtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gbW9kZWwoJ3Rlc3QvcmVtZW1iZXJlZCcpO1xuXHRcdGxldCBtb2RlbHMgPSBbZmFsbGJhY2ssIGV4cGxpY2l0XTtcblx0XHRjb25zdCBhcHBsaWVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gdHJ1ZSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gbW9kZWxzLFxuXHRcdFx0Z2V0QWxsTW9kZWxzOiAoKSA9PiBtb2RlbHMsXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogKCkgPT4gZmFsc2UsXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IG1vZGVsQ2hhbmdlcy5ldmVudChsaXN0ZW5lciksXG5cdFx0XHRnZXRCb3VuZENvbnZlcnNhdGlvbktleTogKCkgPT4gJ2NoYXQ6b25lJyxcblx0XHRcdGdldFZpc2libGVDb252ZXJzYXRpb25LZXk6ICgpID0+ICdjaGF0Om9uZScsXG5cdFx0XHRyZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRhcHBseU1vZGVsOiBzZWxlY3RlZCA9PiB7XG5cdFx0XHRcdGFwcGxpZWQucHVzaChzZWxlY3RlZC5pZGVudGlmaWVyKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIocnVudGltZSkpO1xuXG5cdFx0Y29udHJvbGxlci5pbml0aWFsaXplKHJlbWVtYmVyZWQuaWRlbnRpZmllciwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBwZW5kaW5nQWZ0ZXJJbml0ID0gY29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdFx0Y29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKGV4cGxpY2l0LCAoKSA9PiBhcHBsaWVkLnB1c2goZXhwbGljaXQuaWRlbnRpZmllciksIGZhbHNlKTtcblx0XHRjb25zdCBwZW5kaW5nQWZ0ZXJFeHBsaWNpdCA9IGNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpO1xuXHRcdG1vZGVscyA9IFtmYWxsYmFjaywgZXhwbGljaXQsIHJlbWVtYmVyZWRdO1xuXHRcdG1vZGVsQ2hhbmdlcy5maXJlKCdsb2FkZWQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZ0FmdGVySW5pdCxcblx0XHRcdHBlbmRpbmdBZnRlckV4cGxpY2l0LFxuXHRcdFx0YXBwbGllZCxcblx0XHRcdGN1cnJlbnQ6IGNvbnRyb2xsZXIuY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmdBZnRlckluaXQ6IHRydWUsXG5cdFx0XHRwZW5kaW5nQWZ0ZXJFeHBsaWNpdDogZmFsc2UsXG5cdFx0XHRhcHBsaWVkOiBbZmFsbGJhY2suaWRlbnRpZmllciwgZXhwbGljaXQuaWRlbnRpZmllcl0sXG5cdFx0XHRjdXJyZW50OiBleHBsaWNpdC5pZGVudGlmaWVyLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQixvQkFBb0I7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QUFBQSxNQUNuQiw0QkFBNEI7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUd2RSxVQUFNLGVBQWUsWUFBWSxJQUFJLElBQUksUUFBZ0IsQ0FBQztBQUMxRCxVQUFNLFdBQVcsTUFBTSxlQUFlO0FBQ3RDLFVBQU0sV0FBVyxNQUFNLGVBQWU7QUFDdEMsVUFBTSxhQUFhLE1BQU0saUJBQWlCO0FBQzFDLFFBQUksU0FBUyxDQUFDLFVBQVUsUUFBUTtBQUNoQyxVQUFNLFVBQW9CLENBQUM7QUFDM0IsVUFBTSxVQUEyQztBQUFBLE1BQ2hELFVBQVUsa0JBQWtCO0FBQUEsTUFDNUIsb0JBQW9CLE1BQU0sYUFBYTtBQUFBLE1BQ3ZDLHVCQUF1QixNQUFNO0FBQUEsTUFDN0IsU0FBUyxNQUFNO0FBQUEsTUFDZixXQUFXLE1BQU07QUFBQSxNQUNqQixjQUFjLE1BQU07QUFBQSxNQUNwQixzQkFBc0IsTUFBTTtBQUFBLE1BQzVCLHlCQUF5QixNQUFNO0FBQUEsTUFDL0IseUJBQXlCLGNBQVksYUFBYSxNQUFNLFFBQVE7QUFBQSxNQUNoRSx5QkFBeUIsTUFBTTtBQUFBLE1BQy9CLDJCQUEyQixNQUFNO0FBQUEsTUFDakMsMkJBQTJCLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDbkMsWUFBWSxjQUFZO0FBQ3ZCLGdCQUFRLEtBQUssU0FBUyxVQUFVO0FBQUEsTUFDakM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLFlBQVksSUFBSSxJQUFJLGtDQUFrQyxPQUFPLENBQUM7QUFFakYsZUFBVyxXQUFXLFdBQVcsWUFBWSxNQUFNO0FBQUEsSUFBRSxDQUFDO0FBQ3RELFVBQU0sbUJBQW1CLFdBQVcsMEJBQTBCO0FBQzlELGVBQVcsdUJBQXVCLFVBQVUsTUFBTSxRQUFRLEtBQUssU0FBUyxVQUFVLEdBQUcsS0FBSztBQUMxRixVQUFNLHVCQUF1QixXQUFXLDBCQUEwQjtBQUNsRSxhQUFTLENBQUMsVUFBVSxVQUFVLFVBQVU7QUFDeEMsaUJBQWEsS0FBSyxRQUFRO0FBRTFCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUyxXQUFXLGFBQWEsSUFBSSxHQUFHO0FBQUEsSUFDekMsR0FBRztBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsc0JBQXNCO0FBQUEsTUFDdEIsU0FBUyxDQUFDLFNBQVMsWUFBWSxTQUFTLFVBQVU7QUFBQSxNQUNsRCxTQUFTLFNBQVM7QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsibW9kZWwiLCAic2Vzc2lvblR5cGUiXQp9Cg==
