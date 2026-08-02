import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { isInConversationModelChoice, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier } from "../../../common/modelSelection.js";
import { findBestMatchingModel, findDefaultModel, hasModelsTargetingSession, isModelValidForSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange } from "./chatInputModelUtils.js";
import { NullChatModelSelectionDiagnostics } from "./chatModelSelectionDiagnostics.js";
class ChatInputModelSelectionController extends Disposable {
  constructor(_runtime, _diagnostics = NullChatModelSelectionDiagnostics) {
    super();
    this._runtime = _runtime;
    this._diagnostics = _diagnostics;
    this._currentModel = observableValue(this, void 0);
    this.currentModel = this._currentModel;
    this._restorePerTypeModel = false;
    this._register(this._runtime.subscribeToModelChanges(() => this.reconcileModelListChange(this._runtime.getModels(this._runtime.getCurrentSessionType()))));
    this._register(toDisposable(() => this._clearIntent()));
  }
  get restorePerTypeModel() {
    return this._restorePerTypeModel;
  }
  get selectionReason() {
    return this._selectionReason;
  }
  get userExplicitlySelectedModel() {
    return this._selectionReason === ModelSelectionReason.UserSelection;
  }
  beginSessionSwitch(isEmpty, ownsPool, hadIncomingModel) {
    this._selectionReason = void 0;
    this._restorePerTypeModel = isEmpty && ownsPool && !hadIncomingModel;
    this._clearIntent();
  }
  endSessionSwitch() {
    this._restorePerTypeModel = false;
  }
  hasPendingIntent() {
    return !!this._intent;
  }
  /**
   * True while the remembered model is not selectable, i.e. whatever is currently selected is a
   * stand-in that {@link _restoreRememberedModel} will replace once the catalog offers the real
   * one. Callers use this to avoid acting on a selection that is about to change.
   */
  isAwaitingRememberedModel() {
    const modelId = this._rememberedSelection?.modelId;
    return !!modelId && !this._runtime.getModels(this._runtime.getCurrentSessionType()).some((model) => model.identifier === modelId);
  }
  hasPendingProgrammaticSelection() {
    return this._intent?.kind === "programmatic";
  }
  clearIntent() {
    this._clearIntent();
  }
  clearHistoryIntent() {
    if (this._intent?.kind === "history") {
      this._clearIntent();
    }
  }
  applyExplicitSelection(model, apply, rollbackOnError) {
    this._clearIntent();
    const previousModel = this._currentModel.get();
    const previousReason = this._selectionReason;
    const previousRememberedSelection = this._rememberedSelection;
    this._currentModel.set(model, void 0);
    this._selectionReason = ModelSelectionReason.UserSelection;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.UserSelection });
    this._diagnostics.report("explicit-selection", { model: model.identifier }, "info");
    try {
      apply();
      this._diagnostics.report("explicit-selection-applied", { model: model.identifier }, "info");
    } catch (error) {
      if (rollbackOnError) {
        this._currentModel.set(previousModel, void 0);
        this._selectionReason = previousReason;
        this._remember(previousRememberedSelection);
      }
      this._diagnostics.report("explicit-selection-failed", { model: model.identifier, error: String(error) }, "error");
      throw error;
    }
  }
  applyAutomaticSelection(model, apply) {
    this._currentModel.set(model, void 0);
    apply();
  }
  applyProgrammaticSelection(model) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.ProgrammaticSelection });
    this._applyModel(model);
  }
  requestProgrammaticSelection(resolveModel, conversationKey) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
    return new Promise((resolve) => {
      let complete = resolve;
      this._intent = {
        kind: "programmatic",
        resolveModel,
        conversationKey,
        complete: (applied) => {
          complete(applied);
          complete = () => {
          };
        }
      };
      this._reconcileIntent();
    });
  }
  initialize(rememberedModelId, onInitialSelection) {
    this._clearIntent();
    this._remember(rememberedModelId ? { modelId: rememberedModelId, reason: ModelSelectionReason.Remembered } : void 0);
    const resolveSelection = () => {
      const configuredModelValue = this._runtime.getConfiguredModelValue();
      const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
      const configuredModel = this._runtime.isEmpty() ? resolveConfiguredModel(configuredModelValue, models) : void 0;
      const resolution = resolveModelIdentifier(models, rememberedModelId, false);
      return resolveInitialModelSelection({
        configuredModel,
        desiredModelResolution: resolution,
        desiredReason: ModelSelectionReason.Remembered,
        fallbackModel: findDefaultModel(models, this._runtime.location),
        fallbackReason: ModelSelectionReason.FirstAvailable
      });
    };
    const selection = resolveSelection();
    onInitialSelection(selection);
    this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
    if (selection.kind === "apply") {
      this._selectionReason = selection.reason;
      this._applyModel(selection.model);
      this.ensureCurrentModelSupported();
    } else if (selection.kind === "pending") {
      const fallbackModel = findDefaultModel(this._runtime.getModels(this._runtime.getCurrentSessionType()), this._runtime.location);
      if (fallbackModel) {
        this._selectionReason = ModelSelectionReason.FirstAvailable;
        this._applyModel(fallbackModel);
      }
    }
  }
  ensureCurrentModelSupported() {
    const currentModel = this._currentModel.get();
    const sessionType = this._runtime.getCurrentSessionType();
    const models = this._runtime.getModels(sessionType);
    const context = {
      location: this._runtime.location,
      currentModeKind: this._runtime.getCurrentModeKind(),
      sessionType
    };
    const willReset = shouldResetModelToDefault(currentModel, models, context, this._runtime.getAllModels());
    this._diagnostics.report("compatibility-check", {
      currentModel: currentModel?.identifier,
      mode: context.currentModeKind,
      sessionType,
      willReset
    }, willReset ? "info" : "debug");
    if (willReset) {
      this.selectDefault(sessionType);
    }
  }
  selectDefault(sessionType = this._runtime.getCurrentSessionType()) {
    const allModels = this._runtime.getAllModels();
    if (sessionType && this._runtime.requiresCustomModels(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
      return;
    }
    const models = this._runtime.getModels(sessionType);
    const configuredModel = resolveConfiguredModel(this._runtime.getConfiguredModelValue(), models);
    const defaultModel = configuredModel ?? findDefaultModel(models, this._runtime.location);
    this._diagnostics.report("select-default", {
      configuredModel: configuredModel?.identifier,
      defaultModel: defaultModel?.identifier,
      currentModel: this._currentModel.get()?.identifier
    }, defaultModel ? "info" : "debug");
    if (!defaultModel) {
      return;
    }
    if (!this.hasPendingProgrammaticSelection()) {
      this._selectionReason = configuredModel ? ModelSelectionReason.ConfiguredDefault : ModelSelectionReason.FirstAvailable;
    }
    this._applyModel(defaultModel);
  }
  applyConfiguredDefault() {
    if (!this._runtime.isEmpty() || isInConversationModelChoice(this._selectionReason) || this._intent) {
      return false;
    }
    const configuredValue = this._runtime.getConfiguredModelValue();
    if (!configuredValue) {
      return false;
    }
    const configuredModel = resolveConfiguredModel(configuredValue, this._runtime.getModels(this._runtime.getCurrentSessionType()));
    if (!configuredModel) {
      return false;
    }
    if (configuredModel.identifier === this._currentModel.get()?.identifier) {
      if (this._selectionReason !== ModelSelectionReason.ConfiguredDefault) {
        this._selectionReason = ModelSelectionReason.ConfiguredDefault;
        return true;
      }
      return false;
    }
    this._selectionReason = ModelSelectionReason.ConfiguredDefault;
    this._applyModel(configuredModel);
    this.ensureCurrentModelSupported();
    return true;
  }
  reconcileModelListChange(models) {
    if (this.applyConfiguredDefault() || this._reconcileIntent() || this._restoreRememberedModel()) {
      return;
    }
    if (this._intent?.kind === "history") {
      return;
    }
    const currentModel = this._currentModel.get();
    const locationDefault = models.find((model) => model.metadata.isDefaultForLocation[this._runtime.location]);
    if (this._runtime.isEmpty() && this._selectionReason === ModelSelectionReason.FirstAvailable && locationDefault && currentModel?.identifier !== locationDefault.identifier) {
      this._applyModel(locationDefault);
      return;
    }
    if (!shouldResetOnModelListChange(currentModel?.identifier, [...models])) {
      return;
    }
    const match = findBestMatchingModel(currentModel, models);
    if (match) {
      this._applyModel(match);
    } else {
      this.selectDefault();
    }
  }
  /**
   * Reclaims the remembered model whenever the catalog can offer it — no matter how long that
   * takes. A model can be missing for reasons that have nothing to do with intent: an agent host
   * publishes its catalog in waves, and restarting one drops the whole catalog and republishes it
   * moments later. The default shown meanwhile is a stand-in, not a decision. Every deliberate
   * choice updates {@link _rememberedSelection}, so a current model that differs from it is
   * always a stand-in of some kind and may be superseded. `chat.defaultModel` outranks a merely
   * remembered model, but never an in-conversation choice, which is why the displaced authority
   * is restored along with the model.
   */
  _restoreRememberedModel() {
    const remembered = this._rememberedSelection;
    if (!remembered || this._currentModel.get()?.identifier === remembered.modelId) {
      return false;
    }
    if (this._selectionReason === ModelSelectionReason.ConfiguredDefault && !isInConversationModelChoice(remembered.reason)) {
      return false;
    }
    const pool = this._runtime.getModels(this._runtime.getCurrentSessionType());
    const exact = pool.find((model2) => model2.identifier === remembered.modelId);
    const model = exact ?? (remembered.reason === ModelSelectionReason.SessionRestore ? findBestMatchingModel(remembered.model, pool) : void 0);
    if (!model || !exact && this._currentModel.get()?.identifier === model.identifier) {
      return false;
    }
    this._diagnostics.report("restore-remembered-model", { model: model.identifier, remembered: remembered.modelId, reason: remembered.reason }, "info");
    this._selectionReason = remembered.reason;
    if (exact && remembered.configuration) {
      this._runtime.restoreModelConfiguration(remembered.modelId, remembered.configuration);
    }
    this._applyModel(model);
    return true;
  }
  syncFromConversationState(desiredModel, modelConfiguration, sessionType, conversationKey, isRemoteEdit = false) {
    if (!isRemoteEdit && this._isEchoOfStandIn(desiredModel.identifier, conversationKey)) {
      this._diagnostics.report("conversation-restore-echo-ignored", {
        desiredModel: desiredModel.identifier,
        awaitingModel: this._rememberedSelection?.modelId
      }, "info");
      return;
    }
    this.clearHistoryIntent();
    const allModels = this._runtime.getAllModels();
    const currentModel = this._currentModel.get();
    const syncResult = resolveModelFromSyncState(desiredModel, currentModel, allModels, sessionType, {
      location: this._runtime.location,
      currentModeKind: this._runtime.getCurrentModeKind(),
      sessionType
    });
    this._diagnostics.report("conversation-restore", {
      desiredModel: desiredModel.identifier,
      currentModel: currentModel?.identifier,
      sessionType,
      action: syncResult.action
    }, syncResult.action === "keep" ? "debug" : "info");
    if (syncResult.action === "apply" || syncResult.action === "keep") {
      this._applySessionRestore(desiredModel, syncResult.action === "apply", modelConfiguration, conversationKey);
      return;
    }
    this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey);
    this._clearIntent();
    const pool = this._runtime.getModels(sessionType);
    const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
    if (match) {
      this._applyModel(match);
      this._selectionReason = ModelSelectionReason.SessionRestore;
    } else {
      this.selectDefault(sessionType);
    }
  }
  /**
   * Whether a conversation-state sync is merely this controller's own stand-in coming back.
   *
   * Applying a model writes it into the conversation's input state, which the local sync then
   * hands straight back. While the real model is still missing from the catalog, that echo would
   * otherwise be mistaken for the session's model and overwrite the very selection being waited
   * for — the loop that makes a transient stand-in stick permanently.
   *
   * Two things keep this from swallowing a real change. Only the exact model this controller put
   * on screen as a stand-in qualifies, and only a *local* write does: a state pushed in by
   * another client carries {@link ChatInputStateOrigin.Remote}, so a peer that genuinely selects
   * the stand-in still supersedes the model being awaited. A local change cannot be mistaken for
   * an echo either, since every deliberate local choice updates {@link _rememberedSelection}
   * before the state is written.
   */
  _isEchoOfStandIn(desiredModelId, conversationKey) {
    const remembered = this._rememberedSelection;
    return !!remembered && remembered.conversationKey === conversationKey && desiredModelId === this._standInModelId && this.isAwaitingRememberedModel();
  }
  /**
   * Replaces the remembered selection. Any stand-in shown for the previous one stops being an
   * echo candidate at that moment, so the two are always updated together.
   */
  _remember(selection) {
    this._rememberedSelection = selection;
    this._standInModelId = void 0;
  }
  /**
   * Records the conversation's model as the one to reclaim, unless this sync belongs to a
   * conversation the input has already moved off — a late sync for an outgoing session must not
   * dictate the active one's model.
   */
  _rememberOnBoundConversation(model, configuration, conversationKey) {
    if (this._runtime.getBoundConversationKey() !== conversationKey) {
      return;
    }
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration, conversationKey });
  }
  ensureCurrentModelInSessionPool() {
    const currentModel = this._currentModel.get();
    if (currentModel && !isModelValidForSession(currentModel, this._runtime.getAllModels(), this._runtime.getCurrentSessionType())) {
      this.selectDefault();
    }
  }
  revalidateForSessionType(initialize) {
    const previousModel = this._currentModel.get();
    this._selectionReason = void 0;
    initialize();
    const restoredModel = this._currentModel.get();
    const sessionType = this._runtime.getCurrentSessionType();
    const models = this._runtime.getModels(sessionType);
    if (restoredModel && models.some((model) => model.identifier === restoredModel.identifier)) {
      return;
    }
    const match = findBestMatchingModel(previousModel, models);
    if (match) {
      this._applyModel(match);
    } else if (models.length === 0) {
      this._currentModel.set(void 0, void 0);
    } else {
      this.selectDefault(sessionType);
    }
  }
  preselectFromHistory(modelId, conversationKey) {
    this.clearIntent();
    const tryMatch = () => {
      const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
      if (models.length === 0 || models.length === 1 && models[0].metadata.id.toLocaleLowerCase() === "auto") {
        return void 0;
      }
      return models.find((model) => model.identifier === modelId) ?? models.find((model) => model.metadata.id === modelId);
    };
    const match = tryMatch();
    if (match) {
      this._selectionReason = ModelSelectionReason.SessionRestore;
      this._remember({ modelId: match.identifier, model: match, reason: ModelSelectionReason.SessionRestore });
      this._applyModel(match);
      return;
    }
    this._intent = { kind: "history", modelId, conversationKey };
  }
  resolveDraftModel(draftModel, sessionTypeForValidation, validatePool) {
    let model = draftModel;
    if (validatePool && shouldDropAgnosticDraftModel(model, this._runtime.getAllModels(), sessionTypeForValidation)) {
      model = void 0;
    }
    const configuredValue = this._runtime.getConfiguredModelValue();
    if (configuredValue) {
      model = resolveConfiguredModel(configuredValue, this._runtime.getModels(this._runtime.getCurrentSessionType()));
    }
    return { model, changed: model?.identifier !== draftModel?.identifier };
  }
  _applySessionRestore(model, applyModel, configuration, conversationKey) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.SessionRestore;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration, conversationKey });
    if (configuration) {
      this._runtime.restoreModelConfiguration(model.identifier, configuration);
    }
    if (applyModel) {
      this._applyModel(model);
    }
  }
  _reconcileIntent() {
    const intent = this._intent;
    if (!intent) {
      return false;
    }
    if (intent.kind === "programmatic") {
      if (this._runtime.getBoundConversationKey() !== intent.conversationKey) {
        this._clearIntent();
        return true;
      }
      const model2 = intent.resolveModel();
      if (!model2) {
        return false;
      }
      this._intent = void 0;
      intent.complete(true);
      this.applyProgrammaticSelection(model2);
      return true;
    }
    if (this._runtime.getVisibleConversationKey() !== intent.conversationKey) {
      this._clearIntent();
      return true;
    }
    const models = this._runtime.getModels(this._runtime.getCurrentSessionType());
    const model = models.find((model2) => model2.identifier === intent.modelId) ?? models.find((model2) => model2.metadata.id === intent.modelId);
    if (model && !(models.length === 1 && model.metadata.id.toLocaleLowerCase() === "auto")) {
      this._intent = void 0;
      this._selectionReason = ModelSelectionReason.SessionRestore;
      this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore });
      this._applyModel(model);
      return true;
    }
    return false;
  }
  _clearIntent() {
    const intent = this._intent;
    this._intent = void 0;
    if (intent?.kind === "programmatic") {
      intent.complete(false);
      if (this._selectionReason === ModelSelectionReason.ProgrammaticSelection) {
        this._selectionReason = void 0;
      }
    }
  }
  _applyModel(model) {
    const remembered = this._rememberedSelection;
    if (remembered && model.identifier !== remembered.modelId) {
      this._standInModelId = model.identifier;
    }
    this._currentModel.set(model, void 0);
    this._runtime.applyModel(model);
  }
  _reportInitialization(configuredModel, rememberedModel, selection) {
    this._diagnostics.report("initialize", {
      configuredModel,
      rememberedModel,
      availableModels: this._runtime.getModels(this._runtime.getCurrentSessionType()).map((model) => model.identifier).join(","),
      selection: selection.kind,
      resultModel: selection.kind === "apply" ? selection.model.identifier : void 0,
      resultReason: selection.kind === "apply" ? selection.reason : void 0,
      pendingReference: selection.kind === "pending" ? selection.selection.reference : void 0
    }, selection.kind === "none" ? "debug" : "info");
  }
}
export {
  ChatInputModelSelectionController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSW5pdGlhbE1vZGVsU2VsZWN0aW9uUmVzdWx0LCBpc0luQ29udmVyc2F0aW9uTW9kZWxDaG9pY2UsIE1vZGVsU2VsZWN0aW9uQXBwbHlSZWFzb24sIE1vZGVsU2VsZWN0aW9uUmVhc29uLCByZXNvbHZlQ29uZmlndXJlZE1vZGVsLCByZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uLCByZXNvbHZlTW9kZWxJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGZpbmRCZXN0TWF0Y2hpbmdNb2RlbCwgZmluZERlZmF1bHRNb2RlbCwgaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbiwgaXNNb2RlbFZhbGlkRm9yU2Vzc2lvbiwgcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZSwgc2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbCwgc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCwgc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSB9IGZyb20gJy4vY2hhdElucHV0TW9kZWxVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MsIE51bGxDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcyB9IGZyb20gJy4vY2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MuanMnO1xuXG4vKiogU3VwcGxpZXMgV29ya2JlbmNoIGNoYXQncyBmaWx0ZXJlZCBtb2RlbCBjYXRhbG9nIGFuZCBjb252ZXJzYXRpb24gZWZmZWN0cy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSB7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjtcblx0cmVhZG9ubHkgZ2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQ7XG5cdHJlYWRvbmx5IGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc0VtcHR5OiAoKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBnZXRNb2RlbHM6IChzZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgZ2V0QWxsTW9kZWxzOiAoKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgcmVxdWlyZXNDdXN0b21Nb2RlbHM6IChzZXNzaW9uVHlwZTogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKGxpc3RlbmVyOiAoKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZTtcblx0cmVhZG9ubHkgZ2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAobW9kZWxJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgYXBwbHlNb2RlbDogKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpID0+IHZvaWQ7XG59XG5cbi8qKiBBIG1vZGVsIHRoZSB1c2VyIGlzIG1lYW50IHRvIGJlIG9uLCBhbmQgdGhlIGF1dGhvcml0eSBhbmQgY29udGV4dCB0aGF0IHB1dCB0aGVtIHRoZXJlLiAqL1xuaW50ZXJmYWNlIElSZW1lbWJlcmVkTW9kZWxTZWxlY3Rpb24ge1xuXHRyZWFkb25seSBtb2RlbElkOiBzdHJpbmc7XG5cdC8qKiBQcmVzZW50IHdoZW4gdGhlIG1vZGVsIGl0c2VsZiB3YXMgc2VlbjsgYWJzZW50IHdoZW4gb25seSBhbiBpZCB3YXMgcmVzdG9yZWQgZnJvbSBzdG9yYWdlLiAqL1xuXHRyZWFkb25seSBtb2RlbD86IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgcmVhc29uOiBNb2RlbFNlbGVjdGlvbkFwcGx5UmVhc29uO1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdC8qKiBUaGUgY29udmVyc2F0aW9uIHRoaXMgY2FtZSBmcm9tLCBmb3Igc2VsZWN0aW9ucyByZXN0b3JlZCBmcm9tIGNvbnZlcnNhdGlvbiBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgY29udmVyc2F0aW9uS2V5Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJlc29sdmVkRHJhZnRNb2RlbFNlbGVjdGlvbiB7XG5cdHJlYWRvbmx5IG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNoYW5nZWQ6IGJvb2xlYW47XG59XG5cbnR5cGUgTW9kZWxTZWxlY3Rpb25JbnRlbnQgPVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3Byb2dyYW1tYXRpYyc7IHJlYWRvbmx5IHJlc29sdmVNb2RlbDogKCkgPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkOyByZWFkb25seSBjb252ZXJzYXRpb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgY29tcGxldGU6IChhcHBsaWVkOiBib29sZWFuKSA9PiB2b2lkIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdoaXN0b3J5JzsgcmVhZG9ubHkgbW9kZWxJZDogc3RyaW5nOyByZWFkb25seSBjb252ZXJzYXRpb25LZXk6IHN0cmluZyB9O1xuXG4vKiogUmVjb25jaWxlcyB0aGUgc2hhcmVkIHNlbGVjdGlvbiBtb2RlbCB3aXRoIFdvcmtiZW5jaC1zcGVjaWZpYyBpbnB1dCBhbmQgY2F0YWxvZyBzdGF0ZS4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50TW9kZWwgPSBvYnNlcnZhYmxlVmFsdWU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBjdXJyZW50TW9kZWw6IElPYnNlcnZhYmxlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9jdXJyZW50TW9kZWw7XG5cdHByaXZhdGUgX3NlbGVjdGlvblJlYXNvbjogTW9kZWxTZWxlY3Rpb25BcHBseVJlYXNvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW50ZW50OiBNb2RlbFNlbGVjdGlvbkludGVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVzdG9yZVBlclR5cGVNb2RlbCA9IGZhbHNlO1xuXHQvKipcblx0ICogVGhlIG1vZGVsIHRoZSB1c2VyIGlzIG1lYW50IHRvIGJlIG9uLCBpbmRlcGVuZGVudCBvZiB3aGF0IHRoZSBjYXRhbG9nIGNhbiBjdXJyZW50bHkgb2ZmZXIsXG5cdCAqIHRvZ2V0aGVyIHdpdGggdGhlIGF1dGhvcml0eSB0aGF0IHB1dCB0aGVtIHRoZXJlIGFuZCBhbnkgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gdGhhdCBiZWxvbmdzXG5cdCAqIHdpdGggaXQuIFNlZWRlZCBmcm9tIHBlcnNpc3RlZCBzdG9yYWdlIGJ5IHtAbGluayBpbml0aWFsaXplfSBhbmQgdXBkYXRlZCBieSBldmVyeSBkZWxpYmVyYXRlXG5cdCAqIGNob2ljZSAoZXhwbGljaXQgcGljaywgcHJvZ3JhbW1hdGljIHNlbGVjdGlvbiwgc2Vzc2lvbiByZXN0b3JlKS4gRmFsbGluZyBiYWNrIHRvIGEgZGVmYXVsdFxuXHQgKiBiZWNhdXNlIHRoZSBjYXRhbG9nIGNhbm5vdCBvZmZlciB0aGUgbW9kZWwgKnlldCogaXMgYSBkaXNwbGF5IHN0YXRlLCBub3QgYSBkZWNpc2lvbiwgc28gaXRcblx0ICogZGVsaWJlcmF0ZWx5IGxlYXZlcyB0aGlzIHVudG91Y2hlZCBcdTIwMTQgc2VlIHtAbGluayBfcmVzdG9yZVJlbWVtYmVyZWRNb2RlbH0sIHdoaWNoIHJlY2xhaW1zIHRoZVxuXHQgKiBtb2RlbCB0aGUgbW9tZW50IGl0IGFwcGVhcnMuIFRoYXQgcmVjbGFpbSBpcyB3aGF0IG1ha2VzIGNhdGFsb2cgdGltaW5nIGlycmVsZXZhbnQ6IHRoZXJlIGlzXG5cdCAqIG5vIGRlYWRsaW5lIGJ5IHdoaWNoIGEgbW9kZWwgbXVzdCBiZSBwdWJsaXNoZWQgdG8gYmUgaG9ub3VyZWQuIFRoZSByZWFzb24gaXMgcmV0YWluZWQgc28gYVxuXHQgKiByZXN0b3JlIHJlaW5zdGF0ZXMgdGhlIG9yaWdpbmFsIGF1dGhvcml0eSByYXRoZXIgdGhhbiBkb3duZ3JhZGluZyBhbiBleHBsaWNpdCBwaWNrIHRvIGEgbWVyZVxuXHQgKiByZW1lbWJlcmVkIG9uZS5cblx0ICovXG5cdHByaXZhdGUgX3JlbWVtYmVyZWRTZWxlY3Rpb246IElSZW1lbWJlcmVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBUaGUgbGFzdCBtb2RlbCBhcHBsaWVkIHB1cmVseSBhcyBhIHN0YW5kLWluIGZvciBhIHtAbGluayBfcmVtZW1iZXJlZFNlbGVjdGlvbn0gdGhlIGNhdGFsb2dcblx0ICogY291bGQgbm90IG9mZmVyIHlldC4gUmV0YWluZWQgb25seSB0byByZWNvZ25pc2UgaXQgY29taW5nIGJhY2sgYXJvdW5kIHRoZSBjb252ZXJzYXRpb24tc3RhdGVcblx0ICogcm91bmQtdHJpcCBcdTIwMTQgc2VlIHtAbGluayBfaXNFY2hvT2ZTdGFuZElufS5cblx0ICovXG5cdHByaXZhdGUgX3N0YW5kSW5Nb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcnVudGltZTogSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWFnbm9zdGljczogSUNoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzID0gTnVsbENoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3J1bnRpbWUuc3Vic2NyaWJlVG9Nb2RlbENoYW5nZXMoKCkgPT4gdGhpcy5yZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UodGhpcy5fcnVudGltZS5nZXRNb2RlbHModGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NsZWFySW50ZW50KCkpKTtcblx0fVxuXG5cdGdldCByZXN0b3JlUGVyVHlwZU1vZGVsKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXN0b3JlUGVyVHlwZU1vZGVsO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvblJlYXNvbigpOiBNb2RlbFNlbGVjdGlvbkFwcGx5UmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uUmVhc29uO1xuXHR9XG5cblx0Z2V0IHVzZXJFeHBsaWNpdGx5U2VsZWN0ZWRNb2RlbCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uUmVhc29uID09PSBNb2RlbFNlbGVjdGlvblJlYXNvbi5Vc2VyU2VsZWN0aW9uO1xuXHR9XG5cblx0YmVnaW5TZXNzaW9uU3dpdGNoKGlzRW1wdHk6IGJvb2xlYW4sIG93bnNQb29sOiBib29sZWFuLCBoYWRJbmNvbWluZ01vZGVsOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc3RvcmVQZXJUeXBlTW9kZWwgPSBpc0VtcHR5ICYmIG93bnNQb29sICYmICFoYWRJbmNvbWluZ01vZGVsO1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdH1cblxuXHRlbmRTZXNzaW9uU3dpdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3RvcmVQZXJUeXBlTW9kZWwgPSBmYWxzZTtcblx0fVxuXG5cdGhhc1BlbmRpbmdJbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW50ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hpbGUgdGhlIHJlbWVtYmVyZWQgbW9kZWwgaXMgbm90IHNlbGVjdGFibGUsIGkuZS4gd2hhdGV2ZXIgaXMgY3VycmVudGx5IHNlbGVjdGVkIGlzIGFcblx0ICogc3RhbmQtaW4gdGhhdCB7QGxpbmsgX3Jlc3RvcmVSZW1lbWJlcmVkTW9kZWx9IHdpbGwgcmVwbGFjZSBvbmNlIHRoZSBjYXRhbG9nIG9mZmVycyB0aGUgcmVhbFxuXHQgKiBvbmUuIENhbGxlcnMgdXNlIHRoaXMgdG8gYXZvaWQgYWN0aW5nIG9uIGEgc2VsZWN0aW9uIHRoYXQgaXMgYWJvdXQgdG8gY2hhbmdlLlxuXHQgKi9cblx0aXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbElkID0gdGhpcy5fcmVtZW1iZXJlZFNlbGVjdGlvbj8ubW9kZWxJZDtcblx0XHRyZXR1cm4gISFtb2RlbElkICYmICF0aGlzLl9ydW50aW1lLmdldE1vZGVscyh0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKS5zb21lKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IG1vZGVsSWQpO1xuXHR9XG5cblx0aGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faW50ZW50Py5raW5kID09PSAncHJvZ3JhbW1hdGljJztcblx0fVxuXG5cdGNsZWFySW50ZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdH1cblxuXHRjbGVhckhpc3RvcnlJbnRlbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ludGVudD8ua2luZCA9PT0gJ2hpc3RvcnknKSB7XG5cdFx0XHR0aGlzLl9jbGVhckludGVudCgpO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5RXhwbGljaXRTZWxlY3Rpb24oXG5cdFx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0XHRhcHBseTogKCkgPT4gdm9pZCxcblx0XHRyb2xsYmFja09uRXJyb3I6IGJvb2xlYW4sXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKTtcblx0XHRjb25zdCBwcmV2aW91c1JlYXNvbiA9IHRoaXMuX3NlbGVjdGlvblJlYXNvbjtcblx0XHRjb25zdCBwcmV2aW91c1JlbWVtYmVyZWRTZWxlY3Rpb24gPSB0aGlzLl9yZW1lbWJlcmVkU2VsZWN0aW9uO1xuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbC5zZXQobW9kZWwsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbjtcblx0XHR0aGlzLl9yZW1lbWJlcih7IG1vZGVsSWQ6IG1vZGVsLmlkZW50aWZpZXIsIG1vZGVsLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24gfSk7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdleHBsaWNpdC1zZWxlY3Rpb24nLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyIH0sICdpbmZvJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGFwcGx5KCk7XG5cdFx0XHR0aGlzLl9kaWFnbm9zdGljcy5yZXBvcnQoJ2V4cGxpY2l0LXNlbGVjdGlvbi1hcHBsaWVkJywgeyBtb2RlbDogbW9kZWwuaWRlbnRpZmllciB9LCAnaW5mbycpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAocm9sbGJhY2tPbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNb2RlbC5zZXQocHJldmlvdXNNb2RlbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gcHJldmlvdXNSZWFzb247XG5cdFx0XHRcdHRoaXMuX3JlbWVtYmVyKHByZXZpb3VzUmVtZW1iZXJlZFNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kaWFnbm9zdGljcy5yZXBvcnQoJ2V4cGxpY2l0LXNlbGVjdGlvbi1mYWlsZWQnLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9LCAnZXJyb3InKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5QXV0b21hdGljU2VsZWN0aW9uKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIGFwcGx5OiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsLnNldChtb2RlbCwgdW5kZWZpbmVkKTtcblx0XHRhcHBseSgpO1xuXHR9XG5cblx0YXBwbHlQcm9ncmFtbWF0aWNTZWxlY3Rpb24obW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uUHJvZ3JhbW1hdGljU2VsZWN0aW9uO1xuXHRcdHRoaXMuX3JlbWVtYmVyKHsgbW9kZWxJZDogbW9kZWwuaWRlbnRpZmllciwgbW9kZWwsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uUHJvZ3JhbW1hdGljU2VsZWN0aW9uIH0pO1xuXHRcdHRoaXMuX2FwcGx5TW9kZWwobW9kZWwpO1xuXHR9XG5cblx0cmVxdWVzdFByb2dyYW1tYXRpY1NlbGVjdGlvbihcblx0XHRyZXNvbHZlTW9kZWw6ICgpID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRjb252ZXJzYXRpb25LZXk6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fY2xlYXJJbnRlbnQoKTtcblx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSBNb2RlbFNlbGVjdGlvblJlYXNvbi5Qcm9ncmFtbWF0aWNTZWxlY3Rpb247XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0bGV0IGNvbXBsZXRlID0gcmVzb2x2ZTtcblx0XHRcdHRoaXMuX2ludGVudCA9IHtcblx0XHRcdFx0a2luZDogJ3Byb2dyYW1tYXRpYycsXG5cdFx0XHRcdHJlc29sdmVNb2RlbCxcblx0XHRcdFx0Y29udmVyc2F0aW9uS2V5LFxuXHRcdFx0XHRjb21wbGV0ZTogYXBwbGllZCA9PiB7XG5cdFx0XHRcdFx0Y29tcGxldGUoYXBwbGllZCk7XG5cdFx0XHRcdFx0Y29tcGxldGUgPSAoKSA9PiB7IH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlSW50ZW50KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRpbml0aWFsaXplKHJlbWVtYmVyZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9uSW5pdGlhbFNlbGVjdGlvbjogKHNlbGVjdGlvbjogSW5pdGlhbE1vZGVsU2VsZWN0aW9uUmVzdWx0KSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJJbnRlbnQoKTtcblx0XHQvLyBTdG9yYWdlIHJlY29yZHMgb25seSBleHBsaWNpdCBwaWNrcywgYnV0IGl0IGlzIG5vdCBhbiBpbi1jb252ZXJzYXRpb24gY2hvaWNlOiBhIG5ld1xuXHRcdC8vIGNvbnZlcnNhdGlvbiBzdGlsbCBsZXRzIGBjaGF0LmRlZmF1bHRNb2RlbGAgdGFrZSBwcmVjZWRlbmNlIG92ZXIgaXQuXG5cdFx0dGhpcy5fcmVtZW1iZXIocmVtZW1iZXJlZE1vZGVsSWQgPyB7IG1vZGVsSWQ6IHJlbWVtYmVyZWRNb2RlbElkLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlJlbWVtYmVyZWQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgcmVzb2x2ZVNlbGVjdGlvbiA9ICgpOiBJbml0aWFsTW9kZWxTZWxlY3Rpb25SZXN1bHQgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZE1vZGVsVmFsdWUgPSB0aGlzLl9ydW50aW1lLmdldENvbmZpZ3VyZWRNb2RlbFZhbHVlKCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9ydW50aW1lLmdldE1vZGVscyh0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKTtcblx0XHRcdC8vIGBjaGF0LmRlZmF1bHRNb2RlbGAgc2VlZHMgbmV3IGNvbnZlcnNhdGlvbnMgb25seTsgYSBjb252ZXJzYXRpb24gd2l0aCBoaXN0b3J5IGtlZXBzXG5cdFx0XHQvLyB0aGUgbW9kZWwgaXQgd2FzIHN0YXJ0ZWQgd2l0aC5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlbCA9IHRoaXMuX3J1bnRpbWUuaXNFbXB0eSgpID8gcmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbChjb25maWd1cmVkTW9kZWxWYWx1ZSwgbW9kZWxzKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSByZXNvbHZlTW9kZWxJZGVudGlmaWVyKG1vZGVscywgcmVtZW1iZXJlZE1vZGVsSWQsIGZhbHNlKTtcblx0XHRcdHJldHVybiByZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uKHtcblx0XHRcdFx0Y29uZmlndXJlZE1vZGVsLFxuXHRcdFx0XHRkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHV0aW9uLFxuXHRcdFx0XHRkZXNpcmVkUmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5SZW1lbWJlcmVkLFxuXHRcdFx0XHRmYWxsYmFja01vZGVsOiBmaW5kRGVmYXVsdE1vZGVsKG1vZGVscywgdGhpcy5fcnVudGltZS5sb2NhdGlvbiksXG5cdFx0XHRcdGZhbGxiYWNrUmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5GaXJzdEF2YWlsYWJsZSxcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSByZXNvbHZlU2VsZWN0aW9uKCk7XG5cdFx0b25Jbml0aWFsU2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdFx0dGhpcy5fcmVwb3J0SW5pdGlhbGl6YXRpb24odGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpLCByZW1lbWJlcmVkTW9kZWxJZCwgc2VsZWN0aW9uKTtcblx0XHRpZiAoc2VsZWN0aW9uLmtpbmQgPT09ICdhcHBseScpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IHNlbGVjdGlvbi5yZWFzb247XG5cdFx0XHR0aGlzLl9hcHBseU1vZGVsKHNlbGVjdGlvbi5tb2RlbCk7XG5cdFx0XHR0aGlzLmVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdH0gZWxzZSBpZiAoc2VsZWN0aW9uLmtpbmQgPT09ICdwZW5kaW5nJykge1xuXHRcdFx0Ly8gVGhlIHJlbWVtYmVyZWQgbW9kZWwgaXNuJ3QgaW4gdGhlIGNhdGFsb2cgeWV0LiBTaG93IHRoZSBkZWZhdWx0IG1lYW53aGlsZTtcblx0XHRcdC8vIGBfcmVzdG9yZVJlbWVtYmVyZWRNb2RlbGAgY2xhaW1zIHRoZSByZWFsIG9uZSBhcyBzb29uIGFzIGl0IGlzIHB1Ymxpc2hlZC5cblx0XHRcdGNvbnN0IGZhbGxiYWNrTW9kZWwgPSBmaW5kRGVmYXVsdE1vZGVsKHRoaXMuX3J1bnRpbWUuZ2V0TW9kZWxzKHRoaXMuX3J1bnRpbWUuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpLCB0aGlzLl9ydW50aW1lLmxvY2F0aW9uKTtcblx0XHRcdGlmIChmYWxsYmFja01vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlO1xuXHRcdFx0XHR0aGlzLl9hcHBseU1vZGVsKGZhbGxiYWNrTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuX3J1bnRpbWUuZ2V0TW9kZWxzKHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0bG9jYXRpb246IHRoaXMuX3J1bnRpbWUubG9jYXRpb24sXG5cdFx0XHRjdXJyZW50TW9kZUtpbmQ6IHRoaXMuX3J1bnRpbWUuZ2V0Q3VycmVudE1vZGVLaW5kKCksXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHR9O1xuXHRcdGNvbnN0IHdpbGxSZXNldCA9IHNob3VsZFJlc2V0TW9kZWxUb0RlZmF1bHQoY3VycmVudE1vZGVsLCBtb2RlbHMsIGNvbnRleHQsIHRoaXMuX3J1bnRpbWUuZ2V0QWxsTW9kZWxzKCkpO1xuXHRcdHRoaXMuX2RpYWdub3N0aWNzLnJlcG9ydCgnY29tcGF0aWJpbGl0eS1jaGVjaycsIHtcblx0XHRcdGN1cnJlbnRNb2RlbDogY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0bW9kZTogY29udGV4dC5jdXJyZW50TW9kZUtpbmQsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdHdpbGxSZXNldCxcblx0XHR9LCB3aWxsUmVzZXQgPyAnaW5mbycgOiAnZGVidWcnKTtcblx0XHRpZiAod2lsbFJlc2V0KSB7XG5cdFx0XHR0aGlzLnNlbGVjdERlZmF1bHQoc2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdERlZmF1bHQoc2Vzc2lvblR5cGUgPSB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKTogdm9pZCB7XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRBbGxNb2RlbHMoKTtcblx0XHRpZiAoc2Vzc2lvblR5cGUgJiYgdGhpcy5fcnVudGltZS5yZXF1aXJlc0N1c3RvbU1vZGVscyhzZXNzaW9uVHlwZSkgJiYgIWhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24oYWxsTW9kZWxzLCBzZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRNb2RlbHMoc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlbCA9IHJlc29sdmVDb25maWd1cmVkTW9kZWwodGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpLCBtb2RlbHMpO1xuXHRcdGNvbnN0IGRlZmF1bHRNb2RlbCA9IGNvbmZpZ3VyZWRNb2RlbCA/PyBmaW5kRGVmYXVsdE1vZGVsKG1vZGVscywgdGhpcy5fcnVudGltZS5sb2NhdGlvbik7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdzZWxlY3QtZGVmYXVsdCcsIHtcblx0XHRcdGNvbmZpZ3VyZWRNb2RlbDogY29uZmlndXJlZE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0ZGVmYXVsdE1vZGVsOiBkZWZhdWx0TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRjdXJyZW50TW9kZWw6IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHR9LCBkZWZhdWx0TW9kZWwgPyAnaW5mbycgOiAnZGVidWcnKTtcblx0XHRpZiAoIWRlZmF1bHRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSBjb25maWd1cmVkTW9kZWwgPyBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCA6IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseU1vZGVsKGRlZmF1bHRNb2RlbCk7XG5cdH1cblxuXHRhcHBseUNvbmZpZ3VyZWREZWZhdWx0KCk6IGJvb2xlYW4ge1xuXHRcdC8vIGBjaGF0LmRlZmF1bHRNb2RlbGAgaXMgdGhlIGRlZmF1bHQgZm9yIGV2ZXJ5IG5ldyAoZW1wdHkpIGNvbnZlcnNhdGlvbi4gT25seSBhIGdlbnVpbmVcblx0XHQvLyBpbi1jb252ZXJzYXRpb24gY2hvaWNlIGJsb2NrcyBpdDogYW4gZXhwbGljaXQgdXNlciBwaWNrIG9yIGEgbW9kZS1mb3JjZWQgcHJvZ3JhbW1hdGljXG5cdFx0Ly8gc2VsZWN0aW9uLiBgU2Vzc2lvblJlc3RvcmVgIG9uIGFuIGVtcHR5IHNlc3Npb24gaXMganVzdCBzcGlsbG92ZXIgZnJvbSB0aGUgcHJldmlvdXNcblx0XHQvLyBzZXNzaW9uIGFuZCBtdXN0IHlpZWxkLlxuXHRcdGlmICghdGhpcy5fcnVudGltZS5pc0VtcHR5KClcblx0XHRcdHx8IGlzSW5Db252ZXJzYXRpb25Nb2RlbENob2ljZSh0aGlzLl9zZWxlY3Rpb25SZWFzb24pXG5cdFx0XHR8fCB0aGlzLl9pbnRlbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZFZhbHVlID0gdGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpO1xuXHRcdGlmICghY29uZmlndXJlZFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlbCA9IHJlc29sdmVDb25maWd1cmVkTW9kZWwoY29uZmlndXJlZFZhbHVlLCB0aGlzLl9ydW50aW1lLmdldE1vZGVscyh0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKSk7XG5cdFx0aWYgKCFjb25maWd1cmVkTW9kZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbmZpZ3VyZWRNb2RlbC5pZGVudGlmaWVyID09PSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIpIHtcblx0XHRcdGlmICh0aGlzLl9zZWxlY3Rpb25SZWFzb24gIT09IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0KSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0O1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQ7XG5cdFx0dGhpcy5fYXBwbHlNb2RlbChjb25maWd1cmVkTW9kZWwpO1xuXHRcdHRoaXMuZW5zdXJlQ3VycmVudE1vZGVsU3VwcG9ydGVkKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZWNvbmNpbGVNb2RlbExpc3RDaGFuZ2UobW9kZWxzOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKSB8fCB0aGlzLl9yZWNvbmNpbGVJbnRlbnQoKSB8fCB0aGlzLl9yZXN0b3JlUmVtZW1iZXJlZE1vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQSBoaXN0b3J5IHJlc3RvcmUgdGhhdCBpcyBzdGlsbCB3YWl0aW5nIGZvciBpdHMgbW9kZWwgb3ducyB0aGUgc2VsZWN0aW9uOyBmYWxsaW5nIHRocm91Z2hcblx0XHQvLyB3b3VsZCBzd2FwIGluIGEgc3RhbmQtaW4gZnJvbSBhIHBvb2wgdGhhdCBtYXkgc3RpbGwgYmUgZmlsbGluZy5cblx0XHRpZiAodGhpcy5faW50ZW50Py5raW5kID09PSAnaGlzdG9yeScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudE1vZGVsID0gdGhpcy5fY3VycmVudE1vZGVsLmdldCgpO1xuXHRcdGNvbnN0IGxvY2F0aW9uRGVmYXVsdCA9IG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLmlzRGVmYXVsdEZvckxvY2F0aW9uW3RoaXMuX3J1bnRpbWUubG9jYXRpb25dKTtcblx0XHRpZiAodGhpcy5fcnVudGltZS5pc0VtcHR5KClcblx0XHRcdCYmIHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9PT0gTW9kZWxTZWxlY3Rpb25SZWFzb24uRmlyc3RBdmFpbGFibGVcblx0XHRcdCYmIGxvY2F0aW9uRGVmYXVsdFxuXHRcdFx0JiYgY3VycmVudE1vZGVsPy5pZGVudGlmaWVyICE9PSBsb2NhdGlvbkRlZmF1bHQuaWRlbnRpZmllcikge1xuXHRcdFx0dGhpcy5fYXBwbHlNb2RlbChsb2NhdGlvbkRlZmF1bHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UoY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLCBbLi4ubW9kZWxzXSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWF0Y2ggPSBmaW5kQmVzdE1hdGNoaW5nTW9kZWwoY3VycmVudE1vZGVsLCBtb2RlbHMpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0dGhpcy5fYXBwbHlNb2RlbChtYXRjaCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0RGVmYXVsdCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNsYWltcyB0aGUgcmVtZW1iZXJlZCBtb2RlbCB3aGVuZXZlciB0aGUgY2F0YWxvZyBjYW4gb2ZmZXIgaXQgXHUyMDE0IG5vIG1hdHRlciBob3cgbG9uZyB0aGF0XG5cdCAqIHRha2VzLiBBIG1vZGVsIGNhbiBiZSBtaXNzaW5nIGZvciByZWFzb25zIHRoYXQgaGF2ZSBub3RoaW5nIHRvIGRvIHdpdGggaW50ZW50OiBhbiBhZ2VudCBob3N0XG5cdCAqIHB1Ymxpc2hlcyBpdHMgY2F0YWxvZyBpbiB3YXZlcywgYW5kIHJlc3RhcnRpbmcgb25lIGRyb3BzIHRoZSB3aG9sZSBjYXRhbG9nIGFuZCByZXB1Ymxpc2hlcyBpdFxuXHQgKiBtb21lbnRzIGxhdGVyLiBUaGUgZGVmYXVsdCBzaG93biBtZWFud2hpbGUgaXMgYSBzdGFuZC1pbiwgbm90IGEgZGVjaXNpb24uIEV2ZXJ5IGRlbGliZXJhdGVcblx0ICogY2hvaWNlIHVwZGF0ZXMge0BsaW5rIF9yZW1lbWJlcmVkU2VsZWN0aW9ufSwgc28gYSBjdXJyZW50IG1vZGVsIHRoYXQgZGlmZmVycyBmcm9tIGl0IGlzXG5cdCAqIGFsd2F5cyBhIHN0YW5kLWluIG9mIHNvbWUga2luZCBhbmQgbWF5IGJlIHN1cGVyc2VkZWQuIGBjaGF0LmRlZmF1bHRNb2RlbGAgb3V0cmFua3MgYSBtZXJlbHlcblx0ICogcmVtZW1iZXJlZCBtb2RlbCwgYnV0IG5ldmVyIGFuIGluLWNvbnZlcnNhdGlvbiBjaG9pY2UsIHdoaWNoIGlzIHdoeSB0aGUgZGlzcGxhY2VkIGF1dGhvcml0eVxuXHQgKiBpcyByZXN0b3JlZCBhbG9uZyB3aXRoIHRoZSBtb2RlbC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3RvcmVSZW1lbWJlcmVkTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IHRoaXMuX3JlbWVtYmVyZWRTZWxlY3Rpb247XG5cdFx0aWYgKCFyZW1lbWJlcmVkIHx8IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciA9PT0gcmVtZW1iZXJlZC5tb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25SZWFzb24gPT09IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0ICYmICFpc0luQ29udmVyc2F0aW9uTW9kZWxDaG9pY2UocmVtZW1iZXJlZC5yZWFzb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFBvb2wgbWVtYmVyc2hpcCBpcyB0aGUgdmFsaWRpdHkgdGVzdDogdGhlIHBvb2wgaXMgYWxyZWFkeSBmaWx0ZXJlZCBieSBzZXNzaW9uIGFuZCBtb2RlLFxuXHRcdC8vIHNvIGEgbW9kZWwgdGhhdCBpcyBhYnNlbnQgaGVyZSBpcyBnZW51aW5lbHkgbm90IHNlbGVjdGFibGUgcmlnaHQgbm93LlxuXHRcdGNvbnN0IHBvb2wgPSB0aGlzLl9ydW50aW1lLmdldE1vZGVscyh0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKTtcblx0XHRjb25zdCBleGFjdCA9IHBvb2wuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZW1lbWJlcmVkLm1vZGVsSWQpO1xuXHRcdC8vIEEgY29udmVyc2F0aW9uJ3MgbW9kZWwgaXMgdGllZCB0byBhIHBvb2wgdGhhdCBjYW4gYmUgcmVwdWJsaXNoZWQgdW5kZXIgZGlmZmVyZW50XG5cdFx0Ly8gaWRlbnRpZmllcnMgKGFuIGFnZW50IGhvc3QgcmUtZXhwb3NpbmcgdGhlIHNhbWUgbW9kZWwsIGEgaGFuZG9mZiBiZXR3ZWVuIHBvb2xzKSwgc28gd2hlblxuXHRcdC8vIHRoZSBleGFjdCBtb2RlbCBpcyBnb25lIGFuIGVxdWl2YWxlbnQgb25lIHN0aWxsIHNlcnZlcyB0aGUgY29udmVyc2F0aW9uIGJldHRlciB0aGFuIHRoZVxuXHRcdC8vIGdlbmVyaWMgZGVmYXVsdC4gVGhlIHJlbWVtYmVyZWQgc2VsZWN0aW9uIGRlbGliZXJhdGVseSBrZWVwcyBwb2ludGluZyBhdCB0aGUgb3JpZ2luYWwsIHNvXG5cdFx0Ly8gdGhlIGV4YWN0IG1vZGVsIHN0aWxsIHdpbnMgaWYgaXQgcmV0dXJucy5cblx0XHRjb25zdCBtb2RlbCA9IGV4YWN0ID8/IChyZW1lbWJlcmVkLnJlYXNvbiA9PT0gTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUgPyBmaW5kQmVzdE1hdGNoaW5nTW9kZWwocmVtZW1iZXJlZC5tb2RlbCwgcG9vbCkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghbW9kZWwgfHwgKCFleGFjdCAmJiB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIgPT09IG1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2RpYWdub3N0aWNzLnJlcG9ydCgncmVzdG9yZS1yZW1lbWJlcmVkLW1vZGVsJywgeyBtb2RlbDogbW9kZWwuaWRlbnRpZmllciwgcmVtZW1iZXJlZDogcmVtZW1iZXJlZC5tb2RlbElkLCByZWFzb246IHJlbWVtYmVyZWQucmVhc29uIH0sICdpbmZvJyk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gcmVtZW1iZXJlZC5yZWFzb247XG5cdFx0aWYgKGV4YWN0ICYmIHJlbWVtYmVyZWQuY29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5fcnVudGltZS5yZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uKHJlbWVtYmVyZWQubW9kZWxJZCwgcmVtZW1iZXJlZC5jb25maWd1cmF0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlNb2RlbChtb2RlbCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKFxuXHRcdGRlc2lyZWRNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLFxuXHRcdG1vZGVsQ29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0c2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRjb252ZXJzYXRpb25LZXk6IHN0cmluZyxcblx0XHRpc1JlbW90ZUVkaXQgPSBmYWxzZSxcblx0KTogdm9pZCB7XG5cdFx0aWYgKCFpc1JlbW90ZUVkaXQgJiYgdGhpcy5faXNFY2hvT2ZTdGFuZEluKGRlc2lyZWRNb2RlbC5pZGVudGlmaWVyLCBjb252ZXJzYXRpb25LZXkpKSB7XG5cdFx0XHR0aGlzLl9kaWFnbm9zdGljcy5yZXBvcnQoJ2NvbnZlcnNhdGlvbi1yZXN0b3JlLWVjaG8taWdub3JlZCcsIHtcblx0XHRcdFx0ZGVzaXJlZE1vZGVsOiBkZXNpcmVkTW9kZWwuaWRlbnRpZmllcixcblx0XHRcdFx0YXdhaXRpbmdNb2RlbDogdGhpcy5fcmVtZW1iZXJlZFNlbGVjdGlvbj8ubW9kZWxJZCxcblx0XHRcdH0sICdpbmZvJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXJIaXN0b3J5SW50ZW50KCk7XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRBbGxNb2RlbHMoKTtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk7XG5cdFx0Y29uc3Qgc3luY1Jlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoZGVzaXJlZE1vZGVsLCBjdXJyZW50TW9kZWwsIGFsbE1vZGVscywgc2Vzc2lvblR5cGUsIHtcblx0XHRcdGxvY2F0aW9uOiB0aGlzLl9ydW50aW1lLmxvY2F0aW9uLFxuXHRcdFx0Y3VycmVudE1vZGVLaW5kOiB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRNb2RlS2luZCgpLFxuXHRcdFx0c2Vzc2lvblR5cGUsXG5cdFx0fSk7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdjb252ZXJzYXRpb24tcmVzdG9yZScsIHtcblx0XHRcdGRlc2lyZWRNb2RlbDogZGVzaXJlZE1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRjdXJyZW50TW9kZWw6IGN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0YWN0aW9uOiBzeW5jUmVzdWx0LmFjdGlvbixcblx0XHR9LCBzeW5jUmVzdWx0LmFjdGlvbiA9PT0gJ2tlZXAnID8gJ2RlYnVnJyA6ICdpbmZvJyk7XG5cdFx0aWYgKHN5bmNSZXN1bHQuYWN0aW9uID09PSAnYXBwbHknIHx8IHN5bmNSZXN1bHQuYWN0aW9uID09PSAna2VlcCcpIHtcblx0XHRcdHRoaXMuX2FwcGx5U2Vzc2lvblJlc3RvcmUoZGVzaXJlZE1vZGVsLCBzeW5jUmVzdWx0LmFjdGlvbiA9PT0gJ2FwcGx5JywgbW9kZWxDb25maWd1cmF0aW9uLCBjb252ZXJzYXRpb25LZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjb252ZXJzYXRpb24ncyBvd24gbW9kZWwgY2Fubm90IGJlIHNob3duIHJpZ2h0IG5vdyBcdTIwMTQgbW9zdCBvZnRlbiBiZWNhdXNlIHRoZSBwb29sIGl0XG5cdFx0Ly8gYmVsb25ncyB0byBoYXMgbm90IGZpbmlzaGVkIHB1Ymxpc2hpbmcuIFRoYXQgaXMgYSBzdGF0ZW1lbnQgYWJvdXQgdGhlIGNhdGFsb2csIG5vdCBhYm91dFxuXHRcdC8vIHdoYXQgdGhlIHVzZXIgc2hvdWxkIGJlIG9uLCBzbyByZW1lbWJlciBpdCByZWdhcmRsZXNzIGFuZCBzaG93IHRoZSBiZXN0IHN0YW5kLWluXG5cdFx0Ly8gbWVhbndoaWxlOyBgX3Jlc3RvcmVSZW1lbWJlcmVkTW9kZWxgIGNsYWltcyB0aGUgcmVhbCBtb2RlbCB3aGVuZXZlciBpdCBhcHBlYXJzLCBob3dldmVyXG5cdFx0Ly8gbGF0ZS4gT25seSBhIGRlbGliZXJhdGUgY2hvaWNlIG1hZGUgYWZ0ZXJ3YXJkcyBkaXNwbGFjZXMgaXQuXG5cdFx0dGhpcy5fcmVtZW1iZXJPbkJvdW5kQ29udmVyc2F0aW9uKGRlc2lyZWRNb2RlbCwgbW9kZWxDb25maWd1cmF0aW9uLCBjb252ZXJzYXRpb25LZXkpO1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0Y29uc3QgcG9vbCA9IHRoaXMuX3J1bnRpbWUuZ2V0TW9kZWxzKHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBtYXRjaCA9IGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChkZXNpcmVkTW9kZWwsIHBvb2wpID8/IGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChjdXJyZW50TW9kZWwsIHBvb2wpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0dGhpcy5fYXBwbHlNb2RlbChtYXRjaCk7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3REZWZhdWx0KHNlc3Npb25UeXBlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIGNvbnZlcnNhdGlvbi1zdGF0ZSBzeW5jIGlzIG1lcmVseSB0aGlzIGNvbnRyb2xsZXIncyBvd24gc3RhbmQtaW4gY29taW5nIGJhY2suXG5cdCAqXG5cdCAqIEFwcGx5aW5nIGEgbW9kZWwgd3JpdGVzIGl0IGludG8gdGhlIGNvbnZlcnNhdGlvbidzIGlucHV0IHN0YXRlLCB3aGljaCB0aGUgbG9jYWwgc3luYyB0aGVuXG5cdCAqIGhhbmRzIHN0cmFpZ2h0IGJhY2suIFdoaWxlIHRoZSByZWFsIG1vZGVsIGlzIHN0aWxsIG1pc3NpbmcgZnJvbSB0aGUgY2F0YWxvZywgdGhhdCBlY2hvIHdvdWxkXG5cdCAqIG90aGVyd2lzZSBiZSBtaXN0YWtlbiBmb3IgdGhlIHNlc3Npb24ncyBtb2RlbCBhbmQgb3ZlcndyaXRlIHRoZSB2ZXJ5IHNlbGVjdGlvbiBiZWluZyB3YWl0ZWRcblx0ICogZm9yIFx1MjAxNCB0aGUgbG9vcCB0aGF0IG1ha2VzIGEgdHJhbnNpZW50IHN0YW5kLWluIHN0aWNrIHBlcm1hbmVudGx5LlxuXHQgKlxuXHQgKiBUd28gdGhpbmdzIGtlZXAgdGhpcyBmcm9tIHN3YWxsb3dpbmcgYSByZWFsIGNoYW5nZS4gT25seSB0aGUgZXhhY3QgbW9kZWwgdGhpcyBjb250cm9sbGVyIHB1dFxuXHQgKiBvbiBzY3JlZW4gYXMgYSBzdGFuZC1pbiBxdWFsaWZpZXMsIGFuZCBvbmx5IGEgKmxvY2FsKiB3cml0ZSBkb2VzOiBhIHN0YXRlIHB1c2hlZCBpbiBieVxuXHQgKiBhbm90aGVyIGNsaWVudCBjYXJyaWVzIHtAbGluayBDaGF0SW5wdXRTdGF0ZU9yaWdpbi5SZW1vdGV9LCBzbyBhIHBlZXIgdGhhdCBnZW51aW5lbHkgc2VsZWN0c1xuXHQgKiB0aGUgc3RhbmQtaW4gc3RpbGwgc3VwZXJzZWRlcyB0aGUgbW9kZWwgYmVpbmcgYXdhaXRlZC4gQSBsb2NhbCBjaGFuZ2UgY2Fubm90IGJlIG1pc3Rha2VuIGZvclxuXHQgKiBhbiBlY2hvIGVpdGhlciwgc2luY2UgZXZlcnkgZGVsaWJlcmF0ZSBsb2NhbCBjaG9pY2UgdXBkYXRlcyB7QGxpbmsgX3JlbWVtYmVyZWRTZWxlY3Rpb259XG5cdCAqIGJlZm9yZSB0aGUgc3RhdGUgaXMgd3JpdHRlbi5cblx0ICovXG5cdHByaXZhdGUgX2lzRWNob09mU3RhbmRJbihkZXNpcmVkTW9kZWxJZDogc3RyaW5nLCBjb252ZXJzYXRpb25LZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlbWVtYmVyZWQgPSB0aGlzLl9yZW1lbWJlcmVkU2VsZWN0aW9uO1xuXHRcdHJldHVybiAhIXJlbWVtYmVyZWRcblx0XHRcdCYmIHJlbWVtYmVyZWQuY29udmVyc2F0aW9uS2V5ID09PSBjb252ZXJzYXRpb25LZXlcblx0XHRcdCYmIGRlc2lyZWRNb2RlbElkID09PSB0aGlzLl9zdGFuZEluTW9kZWxJZFxuXHRcdFx0JiYgdGhpcy5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZXMgdGhlIHJlbWVtYmVyZWQgc2VsZWN0aW9uLiBBbnkgc3RhbmQtaW4gc2hvd24gZm9yIHRoZSBwcmV2aW91cyBvbmUgc3RvcHMgYmVpbmcgYW5cblx0ICogZWNobyBjYW5kaWRhdGUgYXQgdGhhdCBtb21lbnQsIHNvIHRoZSB0d28gYXJlIGFsd2F5cyB1cGRhdGVkIHRvZ2V0aGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVtZW1iZXIoc2VsZWN0aW9uOiBJUmVtZW1iZXJlZE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtZW1iZXJlZFNlbGVjdGlvbiA9IHNlbGVjdGlvbjtcblx0XHR0aGlzLl9zdGFuZEluTW9kZWxJZCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHRoZSBjb252ZXJzYXRpb24ncyBtb2RlbCBhcyB0aGUgb25lIHRvIHJlY2xhaW0sIHVubGVzcyB0aGlzIHN5bmMgYmVsb25ncyB0byBhXG5cdCAqIGNvbnZlcnNhdGlvbiB0aGUgaW5wdXQgaGFzIGFscmVhZHkgbW92ZWQgb2ZmIFx1MjAxNCBhIGxhdGUgc3luYyBmb3IgYW4gb3V0Z29pbmcgc2Vzc2lvbiBtdXN0IG5vdFxuXHQgKiBkaWN0YXRlIHRoZSBhY3RpdmUgb25lJ3MgbW9kZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW1lbWJlck9uQm91bmRDb252ZXJzYXRpb24oXG5cdFx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0XHRjb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0XHRjb252ZXJzYXRpb25LZXk6IHN0cmluZyxcblx0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3J1bnRpbWUuZ2V0Qm91bmRDb252ZXJzYXRpb25LZXkoKSAhPT0gY29udmVyc2F0aW9uS2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbWVtYmVyKHsgbW9kZWxJZDogbW9kZWwuaWRlbnRpZmllciwgbW9kZWwsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsIGNvbmZpZ3VyYXRpb24sIGNvbnZlcnNhdGlvbktleSB9KTtcblx0fVxuXG5cdGVuc3VyZUN1cnJlbnRNb2RlbEluU2Vzc2lvblBvb2woKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudE1vZGVsID0gdGhpcy5fY3VycmVudE1vZGVsLmdldCgpO1xuXHRcdGlmIChjdXJyZW50TW9kZWwgJiYgIWlzTW9kZWxWYWxpZEZvclNlc3Npb24oY3VycmVudE1vZGVsLCB0aGlzLl9ydW50aW1lLmdldEFsbE1vZGVscygpLCB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKSkge1xuXHRcdFx0dGhpcy5zZWxlY3REZWZhdWx0KCk7XG5cdFx0fVxuXHR9XG5cblx0cmV2YWxpZGF0ZUZvclNlc3Npb25UeXBlKGluaXRpYWxpemU6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c01vZGVsID0gdGhpcy5fY3VycmVudE1vZGVsLmdldCgpO1xuXHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IHVuZGVmaW5lZDtcblx0XHRpbml0aWFsaXplKCk7XG5cdFx0Y29uc3QgcmVzdG9yZWRNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuX3J1bnRpbWUuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCk7XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRNb2RlbHMoc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChyZXN0b3JlZE1vZGVsICYmIG1vZGVscy5zb21lKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IHJlc3RvcmVkTW9kZWwuaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbWF0Y2ggPSBmaW5kQmVzdE1hdGNoaW5nTW9kZWwocHJldmlvdXNNb2RlbCwgbW9kZWxzKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHRoaXMuX2FwcGx5TW9kZWwobWF0Y2gpO1xuXHRcdH0gZWxzZSBpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fY3VycmVudE1vZGVsLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0RGVmYXVsdChzZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJlc2VsZWN0RnJvbUhpc3RvcnkobW9kZWxJZDogc3RyaW5nLCBjb252ZXJzYXRpb25LZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXJJbnRlbnQoKTtcblx0XHRjb25zdCB0cnlNYXRjaCA9ICgpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRNb2RlbHModGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSk7XG5cdFx0XHRpZiAobW9kZWxzLmxlbmd0aCA9PT0gMCB8fCAobW9kZWxzLmxlbmd0aCA9PT0gMSAmJiBtb2RlbHNbMF0ubWV0YWRhdGEuaWQudG9Mb2NhbGVMb3dlckNhc2UoKSA9PT0gJ2F1dG8nKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IG1vZGVsSWQpXG5cdFx0XHRcdD8/IG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLmlkID09PSBtb2RlbElkKTtcblx0XHR9O1xuXHRcdGNvbnN0IG1hdGNoID0gdHJ5TWF0Y2goKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLlNlc3Npb25SZXN0b3JlO1xuXHRcdFx0dGhpcy5fcmVtZW1iZXIoeyBtb2RlbElkOiBtYXRjaC5pZGVudGlmaWVyLCBtb2RlbDogbWF0Y2gsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUgfSk7XG5cdFx0XHR0aGlzLl9hcHBseU1vZGVsKG1hdGNoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faW50ZW50ID0geyBraW5kOiAnaGlzdG9yeScsIG1vZGVsSWQsIGNvbnZlcnNhdGlvbktleSB9O1xuXHR9XG5cblx0cmVzb2x2ZURyYWZ0TW9kZWwoXG5cdFx0ZHJhZnRNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkLFxuXHRcdHNlc3Npb25UeXBlRm9yVmFsaWRhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHZhbGlkYXRlUG9vbDogYm9vbGVhbixcblx0KTogSVJlc29sdmVkRHJhZnRNb2RlbFNlbGVjdGlvbiB7XG5cdFx0bGV0IG1vZGVsID0gZHJhZnRNb2RlbDtcblx0XHRpZiAodmFsaWRhdGVQb29sICYmIHNob3VsZERyb3BBZ25vc3RpY0RyYWZ0TW9kZWwobW9kZWwsIHRoaXMuX3J1bnRpbWUuZ2V0QWxsTW9kZWxzKCksIHNlc3Npb25UeXBlRm9yVmFsaWRhdGlvbikpIHtcblx0XHRcdG1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWd1cmVkVmFsdWUgPSB0aGlzLl9ydW50aW1lLmdldENvbmZpZ3VyZWRNb2RlbFZhbHVlKCk7XG5cdFx0aWYgKGNvbmZpZ3VyZWRWYWx1ZSkge1xuXHRcdFx0bW9kZWwgPSByZXNvbHZlQ29uZmlndXJlZE1vZGVsKGNvbmZpZ3VyZWRWYWx1ZSwgdGhpcy5fcnVudGltZS5nZXRNb2RlbHModGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4geyBtb2RlbCwgY2hhbmdlZDogbW9kZWw/LmlkZW50aWZpZXIgIT09IGRyYWZ0TW9kZWw/LmlkZW50aWZpZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5U2Vzc2lvblJlc3RvcmUoXG5cdFx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0XHRhcHBseU1vZGVsOiBib29sZWFuLFxuXHRcdGNvbmZpZ3VyYXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHRcdGNvbnZlcnNhdGlvbktleTogc3RyaW5nLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhckludGVudCgpO1xuXHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLlNlc3Npb25SZXN0b3JlO1xuXHRcdHRoaXMuX3JlbWVtYmVyKHsgbW9kZWxJZDogbW9kZWwuaWRlbnRpZmllciwgbW9kZWwsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsIGNvbmZpZ3VyYXRpb24sIGNvbnZlcnNhdGlvbktleSB9KTtcblx0XHRpZiAoY29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5fcnVudGltZS5yZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uKG1vZGVsLmlkZW50aWZpZXIsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHRpZiAoYXBwbHlNb2RlbCkge1xuXHRcdFx0dGhpcy5fYXBwbHlNb2RlbChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlSW50ZW50KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGludGVudCA9IHRoaXMuX2ludGVudDtcblx0XHRpZiAoIWludGVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpbnRlbnQua2luZCA9PT0gJ3Byb2dyYW1tYXRpYycpIHtcblx0XHRcdGlmICh0aGlzLl9ydW50aW1lLmdldEJvdW5kQ29udmVyc2F0aW9uS2V5KCkgIT09IGludGVudC5jb252ZXJzYXRpb25LZXkpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJJbnRlbnQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IGludGVudC5yZXNvbHZlTW9kZWwoKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW50ZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0aW50ZW50LmNvbXBsZXRlKHRydWUpO1xuXHRcdFx0dGhpcy5hcHBseVByb2dyYW1tYXRpY1NlbGVjdGlvbihtb2RlbCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcnVudGltZS5nZXRWaXNpYmxlQ29udmVyc2F0aW9uS2V5KCkgIT09IGludGVudC5jb252ZXJzYXRpb25LZXkpIHtcblx0XHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRNb2RlbHModGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSBpbnRlbnQubW9kZWxJZClcblx0XHRcdD8/IG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLmlkID09PSBpbnRlbnQubW9kZWxJZCk7XG5cdFx0aWYgKG1vZGVsICYmICEobW9kZWxzLmxlbmd0aCA9PT0gMSAmJiBtb2RlbC5tZXRhZGF0YS5pZC50b0xvY2FsZUxvd2VyQ2FzZSgpID09PSAnYXV0bycpKSB7XG5cdFx0XHR0aGlzLl9pbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZTtcblx0XHRcdHRoaXMuX3JlbWVtYmVyKHsgbW9kZWxJZDogbW9kZWwuaWRlbnRpZmllciwgbW9kZWwsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUgfSk7XG5cdFx0XHR0aGlzLl9hcHBseU1vZGVsKG1vZGVsKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckludGVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnRlbnQgPSB0aGlzLl9pbnRlbnQ7XG5cdFx0dGhpcy5faW50ZW50ID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpbnRlbnQ/LmtpbmQgPT09ICdwcm9ncmFtbWF0aWMnKSB7XG5cdFx0XHRpbnRlbnQuY29tcGxldGUoZmFsc2UpO1xuXHRcdFx0aWYgKHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9PT0gTW9kZWxTZWxlY3Rpb25SZWFzb24uUHJvZ3JhbW1hdGljU2VsZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseU1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpOiB2b2lkIHtcblx0XHRjb25zdCByZW1lbWJlcmVkID0gdGhpcy5fcmVtZW1iZXJlZFNlbGVjdGlvbjtcblx0XHRpZiAocmVtZW1iZXJlZCAmJiBtb2RlbC5pZGVudGlmaWVyICE9PSByZW1lbWJlcmVkLm1vZGVsSWQpIHtcblx0XHRcdHRoaXMuX3N0YW5kSW5Nb2RlbElkID0gbW9kZWwuaWRlbnRpZmllcjtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsLnNldChtb2RlbCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9ydW50aW1lLmFwcGx5TW9kZWwobW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0SW5pdGlhbGl6YXRpb24oY29uZmlndXJlZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbWVtYmVyZWRNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBzZWxlY3Rpb246IEluaXRpYWxNb2RlbFNlbGVjdGlvblJlc3VsdCk6IHZvaWQge1xuXHRcdHRoaXMuX2RpYWdub3N0aWNzLnJlcG9ydCgnaW5pdGlhbGl6ZScsIHtcblx0XHRcdGNvbmZpZ3VyZWRNb2RlbCxcblx0XHRcdHJlbWVtYmVyZWRNb2RlbCxcblx0XHRcdGF2YWlsYWJsZU1vZGVsczogdGhpcy5fcnVudGltZS5nZXRNb2RlbHModGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSkubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLmpvaW4oJywnKSxcblx0XHRcdHNlbGVjdGlvbjogc2VsZWN0aW9uLmtpbmQsXG5cdFx0XHRyZXN1bHRNb2RlbDogc2VsZWN0aW9uLmtpbmQgPT09ICdhcHBseScgPyBzZWxlY3Rpb24ubW9kZWwuaWRlbnRpZmllciA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3VsdFJlYXNvbjogc2VsZWN0aW9uLmtpbmQgPT09ICdhcHBseScgPyBzZWxlY3Rpb24ucmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0cGVuZGluZ1JlZmVyZW5jZTogc2VsZWN0aW9uLmtpbmQgPT09ICdwZW5kaW5nJyA/IHNlbGVjdGlvbi5zZWxlY3Rpb24ucmVmZXJlbmNlIDogdW5kZWZpbmVkLFxuXHRcdH0sIHNlbGVjdGlvbi5raW5kID09PSAnbm9uZScgPyAnZGVidWcnIDogJ2luZm8nKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBc0IsdUJBQXVCO0FBRzdDLFNBQXNDLDZCQUF3RCxzQkFBc0Isd0JBQXdCLDhCQUE4Qiw4QkFBOEI7QUFDeE0sU0FBUyx1QkFBdUIsa0JBQWtCLDJCQUEyQix3QkFBd0IsMkJBQTJCLDhCQUE4QiwyQkFBMkIsb0NBQW9DO0FBQzdOLFNBQXlDLHlDQUF5QztB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
