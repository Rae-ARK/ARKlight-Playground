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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { getSelectedModelStorageKey, getStoredSelectedModel, storeSelectedModel } from "../../../../workbench/contrib/chat/common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../workbench/contrib/chat/common/constants.js";
import { ModelSelectionReason, transitionModelSelection } from "../../../../workbench/contrib/chat/common/modelSelection.js";
import { ChatModelSelectionDiagnostics } from "../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionDiagnostics.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
const DEFAULT_MODEL_PICKER_OPTIONS = {
  useGroupedModelPicker: true,
  showFeatured: true,
  showUnavailableFeatured: false,
  showManageModelsAction: false,
  showAutoModel: true
};
function normalizeModelPickerOptions(options) {
  return {
    ...DEFAULT_MODEL_PICKER_OPTIONS,
    ...options,
    showAutoModel: options?.showAutoModel ?? true
  };
}
function legacyModelPickerStorageKey(providerId, sessionType) {
  return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}
function persistSessionModelSelection(session, provider, storageService, model, modelTarget) {
  provider.setModel(session.sessionId, model.identifier);
  storeSelectedModel(storageService, ChatAgentLocation.Chat, modelTarget, model.identifier);
}
function hasSelectableModel(models, options) {
  return models.length > 0 || options.showAutoModel;
}
const ISessionModelSelectionModel = createDecorator("sessionModelSelectionModel");
let SessionModelSelectionModel = class extends Disposable {
  constructor(_session, _sessionsProvidersService, _storageService, _configurationService, logService) {
    super();
    this._session = _session;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._state = observableValue(this, {
      currentModel: void 0,
      pendingSelection: void 0,
      models: [],
      options: normalizeModelPickerOptions(void 0),
      hasSelectableModel: false
    });
    this.state = this._state;
    this._providerListener = this._register(new MutableDisposable());
    this._memory = {
      sessionKey: void 0,
      lastPushedChatKey: void 0,
      currentModel: void 0,
      currentReason: void 0
    };
    this._sharedDiagnostics = new ChatModelSelectionDiagnostics(logService, this._storageService, () => {
      const session = this._session.get();
      return {
        surface: "sessions",
        location: ChatAgentLocation.Chat,
        modelTarget: this._modelTarget,
        sessionKey: session ? this._sessionKey(session) : void 0,
        conversationKey: session?.activeChat.get().resource.toString(),
        metadata: {
          providerId: session?.providerId,
          sessionType: session?.sessionType,
          sessionId: session?.sessionId
        }
      };
    });
    this._register(autorun((reader) => {
      const session = this._session.read(reader);
      session?.modelId.read(reader);
      session?.status.read(reader);
      session?.activeChat.read(reader);
      this._refresh("sessionState", session);
    }));
    this._register(this._configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatConfiguration.DefaultModel)) {
        this._refresh("configuration");
      }
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._refresh("providers")));
    this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((event) => this._sharedDiagnostics.logStorageChange(event, this._state.get().currentModel?.identifier)));
  }
  selectModel(modelIdentifier) {
    const session = this._session.get();
    const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : void 0;
    if (!session || !provider) {
      this._sharedDiagnostics.report("selection-rejected", {
        requestedModel: modelIdentifier,
        reason: !session ? "noSession" : "noProvider"
      }, "info");
      return false;
    }
    const snapshot = provider.getModelsSnapshot(session.sessionId);
    this._modelTarget = snapshot.modelTarget;
    const models = snapshot.models;
    const model = models.find((model2) => model2.identifier === modelIdentifier);
    if (!model) {
      this._sharedDiagnostics.report("selection-rejected", {
        requestedModel: modelIdentifier,
        reason: "modelUnavailable",
        availableModels: models.map((model2) => model2.identifier).join(",")
      }, "info");
      return false;
    }
    const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
    const previousState = this._state.get();
    const previousMemory = this._memory;
    const providerModelBefore = session.modelId.get();
    const storageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, snapshot.modelTarget);
    this._state.set({
      models,
      options,
      hasSelectableModel: hasSelectableModel(models, options),
      currentModel: model,
      pendingSelection: void 0
    }, void 0);
    this._memory = {
      sessionKey: this._sessionKey(session),
      lastPushedChatKey: session.activeChat.get().resource.toString(),
      currentModel: model,
      currentReason: ModelSelectionReason.UserSelection
    };
    this._sharedDiagnostics.report("explicit-selection", { model: model.identifier }, "info");
    try {
      persistSessionModelSelection(session, provider, this._storageService, model, snapshot.modelTarget);
      this._sharedDiagnostics.report("explicit-selection-applied", { model: model.identifier }, "info");
    } catch (error) {
      this._memory = previousMemory;
      this._sharedDiagnostics.report("explicit-selection-failed", { model: model.identifier, error: String(error) }, "error");
      this._sharedDiagnostics.report("provider-selection-failed", {
        requestedModel: modelIdentifier,
        providerModelBefore,
        providerModelAfter: session.modelId.get(),
        storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
        error: String(error)
      }, "error");
      this._state.set({
        models,
        options,
        hasSelectableModel: hasSelectableModel(models, options),
        currentModel: previousState.currentModel,
        pendingSelection: previousState.pendingSelection
      }, void 0);
      throw error;
    }
    this._sharedDiagnostics.report("provider-selection-applied", {
      requestedModel: modelIdentifier,
      providerModelBefore,
      providerModelAfter: session.modelId.get(),
      storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE)
    }, "info");
    return true;
  }
  _refresh(trigger, session = this._session.get()) {
    const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : void 0;
    this._setProvider(provider);
    const sessionKey = session ? this._sessionKey(session) : void 0;
    const sessionModelId = session?.modelId.get();
    const previousState = this._state.get();
    const previousMemory = this._memory;
    const sessionContext = session ? {
      kind: session.status.get() === SessionStatus.Untitled ? "untitled" : "existing",
      key: sessionKey,
      chatKey: session.activeChat.get().resource.toString(),
      modelId: sessionModelId
    } : { kind: "none" };
    const currentReason = sessionKey === this._memory.sessionKey ? this._memory.currentReason : void 0;
    const initialSnapshot = session && provider ? provider.getModelsSnapshot(session.sessionId, sessionModelId) : { models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 };
    const rememberedSelection = session ? this._getRememberedModel(session, initialSnapshot.modelTarget) : void 0;
    const rememberedModelId = rememberedSelection?.identifier;
    const desiredModelIdentifier = sessionContext.kind === "untitled" ? currentReason === ModelSelectionReason.FirstAvailable ? rememberedModelId : sessionModelId ?? rememberedModelId : sessionModelId;
    const snapshot = desiredModelIdentifier !== sessionModelId && session && provider ? provider.getModelsSnapshot(session.sessionId, desiredModelIdentifier) : initialSnapshot;
    const fallbackModel = snapshot.models.find((model) => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]) ?? snapshot.models[0];
    const result = transitionModelSelection({
      session: sessionContext,
      models: {
        available: snapshot.models,
        configuredModel: this._configurationService.getValue(ChatConfiguration.DefaultModel),
        rememberedModelId,
        desiredModelResolution: snapshot.desiredModelResolution,
        fallbackModel
      },
      previous: { ...this._memory, currentReason }
    });
    this._memory = {
      sessionKey: result.sessionKey,
      lastPushedChatKey: result.lastPushedChatKey,
      currentModel: result.currentModel,
      currentReason: result.currentReason
    };
    this._modelTarget = snapshot.modelTarget;
    const models = snapshot.models;
    const options = normalizeModelPickerOptions(session && provider ? provider.getModelPickerOptions(session.sessionId) : void 0);
    this._state.set({
      models,
      options,
      hasSelectableModel: !!session && !!provider && hasSelectableModel(models, options),
      currentModel: result.currentModel,
      pendingSelection: result.pendingSelection
    }, void 0);
    this._sharedDiagnostics.report("transition", {
      trigger,
      sessionKind: sessionContext.kind,
      modelTarget: snapshot.modelTarget,
      configuredModel: this._configurationService.getValue(ChatConfiguration.DefaultModel),
      rememberedModel: rememberedModelId,
      rememberedSource: rememberedSelection?.source,
      desiredModel: desiredModelIdentifier,
      desiredResolution: snapshot.desiredModelResolution.kind,
      fallbackModel: fallbackModel?.identifier,
      availableModels: snapshot.models.map((model) => model.identifier).join(","),
      previousModel: previousMemory.currentModel?.identifier,
      previousReason: currentReason,
      resultModel: result.currentModel?.identifier,
      resultReason: result.currentReason,
      pendingReference: result.pendingSelection?.reference,
      effect: result.effect.kind,
      effectModel: result.effect.kind === "apply" ? result.effect.model.identifier : void 0,
      effectReason: result.effect.kind === "none" ? void 0 : result.effect.reason
    }, result.effect.kind === "none" && previousMemory.currentModel?.identifier === result.currentModel?.identifier ? "debug" : "info");
    if (result.effect.kind === "apply" && session && provider) {
      const effect = result.effect;
      const providerModelBefore = session.modelId.get();
      try {
        provider.setModel(session.sessionId, effect.model.identifier);
      } catch (error) {
        this._memory = previousMemory;
        this._state.set(previousState, void 0);
        this._sharedDiagnostics.report("provider-automatic-selection-failed", {
          model: effect.model.identifier,
          reason: effect.reason,
          providerModelBefore,
          providerModelAfter: session.modelId.get(),
          error: String(error)
        }, "error");
        throw error;
      }
      this._sharedDiagnostics.report("provider-automatic-selection-applied", {
        model: effect.model.identifier,
        reason: effect.reason,
        providerModelBefore,
        providerModelAfter: session.modelId.get()
      }, "info");
    }
  }
  _getRememberedModel(session, modelTarget) {
    const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
    if (storedSelection) {
      return { identifier: storedSelection, source: "stored" };
    }
    const legacyStorageKey = legacyModelPickerStorageKey(session.providerId, session.sessionType);
    const legacyIdentifier = this._storageService.get(legacyStorageKey, StorageScope.PROFILE);
    if (legacyIdentifier) {
      storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, legacyIdentifier);
      this._sharedDiagnostics.report("legacy-selection-migrated", {
        legacyStorageKey,
        model: legacyIdentifier
      }, "info");
      return { identifier: legacyIdentifier, source: "legacy" };
    }
    return void 0;
  }
  _setProvider(provider) {
    if (this._provider === provider) {
      return;
    }
    this._provider = provider;
    this._providerListener.value = provider?.onDidChangeModels(() => this._refresh("models"));
  }
  _sessionKey(session) {
    return session.sessionId;
  }
};
SessionModelSelectionModel = __decorateClass([
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService)
], SessionModelSelectionModel);
export {
  ISessionModelSelectionModel,
  SessionModelSelectionModel,
  hasSelectableModel,
  normalizeModelPickerOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LCBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsLCBzdG9yZVNlbGVjdGVkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VsZWN0ZWRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VsZWN0aW9uTWVtb3J5LCBJTW9kZWxTZWxlY3Rpb25TZXNzaW9uQ29udGV4dCwgSVBlbmRpbmdNb2RlbFNlbGVjdGlvbiwgTW9kZWxTZWxlY3Rpb25SZWFzb24sIHRyYW5zaXRpb25Nb2RlbFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vcm1hbGl6ZWRTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIGV4dGVuZHMgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMge1xuXHRyZWFkb25seSBzaG93QXV0b01vZGVsOiBib29sZWFuO1xufVxuXG5jb25zdCBERUZBVUxUX01PREVMX1BJQ0tFUl9PUFRJT05TOiBJTm9ybWFsaXplZFNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMgPSB7XG5cdHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSxcblx0c2hvd0ZlYXR1cmVkOiB0cnVlLFxuXHRzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogZmFsc2UsXG5cdHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IGZhbHNlLFxuXHRzaG93QXV0b01vZGVsOiB0cnVlLFxufTtcblxudHlwZSBNb2RlbFNlbGVjdGlvblJlZnJlc2hUcmlnZ2VyID0gJ3Nlc3Npb25TdGF0ZScgfCAnY29uZmlndXJhdGlvbicgfCAncHJvdmlkZXJzJyB8ICdtb2RlbHMnO1xuXG5pbnRlcmZhY2UgSVJlbWVtYmVyZWRNb2RlbFNlbGVjdGlvbiB7XG5cdHJlYWRvbmx5IGlkZW50aWZpZXI6IHN0cmluZztcblx0cmVhZG9ubHkgc291cmNlOiAnc3RvcmVkJyB8ICdsZWdhY3knO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplTW9kZWxQaWNrZXJPcHRpb25zKG9wdGlvbnM6IElTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIHwgdW5kZWZpbmVkKTogSU5vcm1hbGl6ZWRTZXNzaW9uTW9kZWxQaWNrZXJPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHQuLi5ERUZBVUxUX01PREVMX1BJQ0tFUl9PUFRJT05TLFxuXHRcdC4uLm9wdGlvbnMsXG5cdFx0c2hvd0F1dG9Nb2RlbDogb3B0aW9ucz8uc2hvd0F1dG9Nb2RlbCA/PyB0cnVlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBsZWdhY3lNb2RlbFBpY2tlclN0b3JhZ2VLZXkocHJvdmlkZXJJZDogc3RyaW5nLCBzZXNzaW9uVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBzZXNzaW9ucy5tb2RlbFBpY2tlci4ke3Byb3ZpZGVySWR9LiR7c2Vzc2lvblR5cGV9LnNlbGVjdGVkTW9kZWxJZGA7XG59XG5cbmZ1bmN0aW9uIHBlcnNpc3RTZXNzaW9uTW9kZWxTZWxlY3Rpb24oXG5cdHNlc3Npb246IFBpY2s8SUFjdGl2ZVNlc3Npb24sICdwcm92aWRlcklkJyB8ICdzZXNzaW9uVHlwZScgfCAnc2Vzc2lvbklkJz4sXG5cdHByb3ZpZGVyOiBQaWNrPElTZXNzaW9uc1Byb3ZpZGVyLCAnc2V0TW9kZWwnPixcblx0c3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0bW9kZWxUYXJnZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcbik6IHZvaWQge1xuXHRwcm92aWRlci5zZXRNb2RlbChzZXNzaW9uLnNlc3Npb25JZCwgbW9kZWwuaWRlbnRpZmllcik7XG5cdHN0b3JlU2VsZWN0ZWRNb2RlbChzdG9yYWdlU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZWxUYXJnZXQsIG1vZGVsLmlkZW50aWZpZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzU2VsZWN0YWJsZU1vZGVsKFxuXHRtb2RlbHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdLFxuXHRvcHRpb25zOiBJTm9ybWFsaXplZFNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsXG4pOiBib29sZWFuIHtcblx0cmV0dXJuIG1vZGVscy5sZW5ndGggPiAwIHx8IG9wdGlvbnMuc2hvd0F1dG9Nb2RlbDtcbn1cblxuZXhwb3J0IGNvbnN0IElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCA9IGNyZWF0ZURlY29yYXRvcjxJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWw+KCdzZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCcpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uTW9kZWxTZWxlY3Rpb25TdGF0ZSB7XG5cdHJlYWRvbmx5IGN1cnJlbnRNb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwZW5kaW5nU2VsZWN0aW9uOiBJUGVuZGluZ01vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtb2RlbHM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdO1xuXHRyZWFkb25seSBvcHRpb25zOiBJTm9ybWFsaXplZFNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnM7XG5cdHJlYWRvbmx5IGhhc1NlbGVjdGFibGVNb2RlbDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uU3RhdGU+O1xuXHRzZWxlY3RNb2RlbChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uTW9kZWxTZWxlY3Rpb25TdGF0ZT4odGhpcywge1xuXHRcdGN1cnJlbnRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdHBlbmRpbmdTZWxlY3Rpb246IHVuZGVmaW5lZCxcblx0XHRtb2RlbHM6IFtdLFxuXHRcdG9wdGlvbnM6IG5vcm1hbGl6ZU1vZGVsUGlja2VyT3B0aW9ucyh1bmRlZmluZWQpLFxuXHRcdGhhc1NlbGVjdGFibGVNb2RlbDogZmFsc2UsXG5cdH0pO1xuXHRyZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8SVNlc3Npb25Nb2RlbFNlbGVjdGlvblN0YXRlPiA9IHRoaXMuX3N0YXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGFyZWREaWFnbm9zdGljczogQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3M7XG5cdHByaXZhdGUgX21lbW9yeTogSU1vZGVsU2VsZWN0aW9uTWVtb3J5ID0ge1xuXHRcdHNlc3Npb25LZXk6IHVuZGVmaW5lZCxcblx0XHRsYXN0UHVzaGVkQ2hhdEtleTogdW5kZWZpbmVkLFxuXHRcdGN1cnJlbnRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdGN1cnJlbnRSZWFzb246IHVuZGVmaW5lZCxcblx0fTtcblx0cHJpdmF0ZSBfcHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbFRhcmdldDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb246IElPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPixcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MgPSBuZXcgQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MobG9nU2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VyZmFjZTogJ3Nlc3Npb25zJyxcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdG1vZGVsVGFyZ2V0OiB0aGlzLl9tb2RlbFRhcmdldCxcblx0XHRcdFx0c2Vzc2lvbktleTogc2Vzc2lvbiA/IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbnZlcnNhdGlvbktleTogc2Vzc2lvbj8uYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdHByb3ZpZGVySWQ6IHNlc3Npb24/LnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IHNlc3Npb24/LnNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbj8uc2Vzc2lvbklkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRzZXNzaW9uPy5tb2RlbElkLnJlYWQocmVhZGVyKTtcblx0XHRcdHNlc3Npb24/LnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRzZXNzaW9uPy5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3JlZnJlc2goJ3Nlc3Npb25TdGF0ZScsIHNlc3Npb24pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbCkpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaCgnY29uZmlndXJhdGlvbicpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoKCkgPT4gdGhpcy5fcmVmcmVzaCgncHJvdmlkZXJzJykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKShldmVudCA9PiB0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5sb2dTdG9yYWdlQ2hhbmdlKGV2ZW50LCB0aGlzLl9zdGF0ZS5nZXQoKS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIpKSk7XG5cdH1cblxuXHRzZWxlY3RNb2RlbChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2Vzc2lvbiA/IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghc2Vzc2lvbiB8fCAhcHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgnc2VsZWN0aW9uLXJlamVjdGVkJywge1xuXHRcdFx0XHRyZXF1ZXN0ZWRNb2RlbDogbW9kZWxJZGVudGlmaWVyLFxuXHRcdFx0XHRyZWFzb246ICFzZXNzaW9uID8gJ25vU2Vzc2lvbicgOiAnbm9Qcm92aWRlcicsXG5cdFx0XHR9LCAnaW5mbycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNuYXBzaG90ID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX21vZGVsVGFyZ2V0ID0gc25hcHNob3QubW9kZWxUYXJnZXQ7XG5cdFx0Y29uc3QgbW9kZWxzID0gc25hcHNob3QubW9kZWxzO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciA9PT0gbW9kZWxJZGVudGlmaWVyKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ3NlbGVjdGlvbi1yZWplY3RlZCcsIHtcblx0XHRcdFx0cmVxdWVzdGVkTW9kZWw6IG1vZGVsSWRlbnRpZmllcixcblx0XHRcdFx0cmVhc29uOiAnbW9kZWxVbmF2YWlsYWJsZScsXG5cdFx0XHRcdGF2YWlsYWJsZU1vZGVsczogbW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyKS5qb2luKCcsJyksXG5cdFx0XHR9LCAnaW5mbycpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBub3JtYWxpemVNb2RlbFBpY2tlck9wdGlvbnMocHJvdmlkZXIuZ2V0TW9kZWxQaWNrZXJPcHRpb25zKHNlc3Npb24uc2Vzc2lvbklkKSk7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzTWVtb3J5ID0gdGhpcy5fbWVtb3J5O1xuXHRcdGNvbnN0IHByb3ZpZGVyTW9kZWxCZWZvcmUgPSBzZXNzaW9uLm1vZGVsSWQuZ2V0KCk7XG5cdFx0Y29uc3Qgc3RvcmFnZUtleSA9IGdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHNuYXBzaG90Lm1vZGVsVGFyZ2V0KTtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0bW9kZWxzLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogaGFzU2VsZWN0YWJsZU1vZGVsKG1vZGVscywgb3B0aW9ucyksXG5cdFx0XHRjdXJyZW50TW9kZWw6IG1vZGVsLFxuXHRcdFx0cGVuZGluZ1NlbGVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbWVtb3J5ID0ge1xuXHRcdFx0c2Vzc2lvbktleTogdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uKSxcblx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGN1cnJlbnRNb2RlbDogbW9kZWwsXG5cdFx0XHRjdXJyZW50UmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5Vc2VyU2VsZWN0aW9uLFxuXHRcdH07XG5cdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdleHBsaWNpdC1zZWxlY3Rpb24nLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyIH0sICdpbmZvJyk7XG5cdFx0dHJ5IHtcblx0XHRcdHBlcnNpc3RTZXNzaW9uTW9kZWxTZWxlY3Rpb24oc2Vzc2lvbiwgcHJvdmlkZXIsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCBtb2RlbCwgc25hcHNob3QubW9kZWxUYXJnZXQpO1xuXHRcdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdleHBsaWNpdC1zZWxlY3Rpb24tYXBwbGllZCcsIHsgbW9kZWw6IG1vZGVsLmlkZW50aWZpZXIgfSwgJ2luZm8nKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbWVtb3J5ID0gcHJldmlvdXNNZW1vcnk7XG5cdFx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ2V4cGxpY2l0LXNlbGVjdGlvbi1mYWlsZWQnLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9LCAnZXJyb3InKTtcblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgncHJvdmlkZXItc2VsZWN0aW9uLWZhaWxlZCcsIHtcblx0XHRcdFx0cmVxdWVzdGVkTW9kZWw6IG1vZGVsSWRlbnRpZmllcixcblx0XHRcdFx0cHJvdmlkZXJNb2RlbEJlZm9yZSxcblx0XHRcdFx0cHJvdmlkZXJNb2RlbEFmdGVyOiBzZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRcdHN0b3JlZE1vZGVsQWZ0ZXI6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChzdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSksXG5cdFx0XHRcdGVycm9yOiBTdHJpbmcoZXJyb3IpLFxuXHRcdFx0fSwgJ2Vycm9yJyk7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHRtb2RlbHMsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdGhhc1NlbGVjdGFibGVNb2RlbDogaGFzU2VsZWN0YWJsZU1vZGVsKG1vZGVscywgb3B0aW9ucyksXG5cdFx0XHRcdGN1cnJlbnRNb2RlbDogcHJldmlvdXNTdGF0ZS5jdXJyZW50TW9kZWwsXG5cdFx0XHRcdHBlbmRpbmdTZWxlY3Rpb246IHByZXZpb3VzU3RhdGUucGVuZGluZ1NlbGVjdGlvbixcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdwcm92aWRlci1zZWxlY3Rpb24tYXBwbGllZCcsIHtcblx0XHRcdHJlcXVlc3RlZE1vZGVsOiBtb2RlbElkZW50aWZpZXIsXG5cdFx0XHRwcm92aWRlck1vZGVsQmVmb3JlLFxuXHRcdFx0cHJvdmlkZXJNb2RlbEFmdGVyOiBzZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRzdG9yZWRNb2RlbEFmdGVyOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdH0sICdpbmZvJyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoKHRyaWdnZXI6IE1vZGVsU2VsZWN0aW9uUmVmcmVzaFRyaWdnZXIsIHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBzZXNzaW9uID8gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJJZCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2V0UHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uID8gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXNzaW9uTW9kZWxJZCA9IHNlc3Npb24/Lm1vZGVsSWQuZ2V0KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzTWVtb3J5ID0gdGhpcy5fbWVtb3J5O1xuXHRcdGNvbnN0IHNlc3Npb25Db250ZXh0OiBJTW9kZWxTZWxlY3Rpb25TZXNzaW9uQ29udGV4dCA9IHNlc3Npb24gPyB7XG5cdFx0XHRraW5kOiBzZXNzaW9uLnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCA/ICd1bnRpdGxlZCcgOiAnZXhpc3RpbmcnLFxuXHRcdFx0a2V5OiBzZXNzaW9uS2V5ISxcblx0XHRcdGNoYXRLZXk6IHNlc3Npb24uYWN0aXZlQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0bW9kZWxJZDogc2Vzc2lvbk1vZGVsSWQsXG5cdFx0fSA6IHsga2luZDogJ25vbmUnIH07XG5cdFx0Y29uc3QgY3VycmVudFJlYXNvbiA9IHNlc3Npb25LZXkgPT09IHRoaXMuX21lbW9yeS5zZXNzaW9uS2V5ID8gdGhpcy5fbWVtb3J5LmN1cnJlbnRSZWFzb24gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaW5pdGlhbFNuYXBzaG90ID0gc2Vzc2lvbiAmJiBwcm92aWRlclxuXHRcdFx0PyBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbk1vZGVsSWQpXG5cdFx0XHQ6IHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAnbm90UmVxdWVzdGVkJyB9IGFzIGNvbnN0LCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgcmVtZW1iZXJlZFNlbGVjdGlvbiA9IHNlc3Npb24gPyB0aGlzLl9nZXRSZW1lbWJlcmVkTW9kZWwoc2Vzc2lvbiwgaW5pdGlhbFNuYXBzaG90Lm1vZGVsVGFyZ2V0KSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZW1lbWJlcmVkTW9kZWxJZCA9IHJlbWVtYmVyZWRTZWxlY3Rpb24/LmlkZW50aWZpZXI7XG5cdFx0Y29uc3QgZGVzaXJlZE1vZGVsSWRlbnRpZmllciA9IHNlc3Npb25Db250ZXh0LmtpbmQgPT09ICd1bnRpdGxlZCdcblx0XHRcdD8gKGN1cnJlbnRSZWFzb24gPT09IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlID8gcmVtZW1iZXJlZE1vZGVsSWQgOiAoc2Vzc2lvbk1vZGVsSWQgPz8gcmVtZW1iZXJlZE1vZGVsSWQpKVxuXHRcdFx0OiBzZXNzaW9uTW9kZWxJZDtcblx0XHRjb25zdCBzbmFwc2hvdCA9IGRlc2lyZWRNb2RlbElkZW50aWZpZXIgIT09IHNlc3Npb25Nb2RlbElkICYmIHNlc3Npb24gJiYgcHJvdmlkZXJcblx0XHRcdD8gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGRlc2lyZWRNb2RlbElkZW50aWZpZXIpXG5cdFx0XHQ6IGluaXRpYWxTbmFwc2hvdDtcblx0XHRjb25zdCBmYWxsYmFja01vZGVsID0gc25hcHNob3QubW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwubWV0YWRhdGEuaXNEZWZhdWx0Rm9yTG9jYXRpb25bQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0pID8/IHNuYXBzaG90Lm1vZGVsc1swXTtcblx0XHRjb25zdCByZXN1bHQgPSB0cmFuc2l0aW9uTW9kZWxTZWxlY3Rpb24oe1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvbkNvbnRleHQsXG5cdFx0XHRtb2RlbHM6IHtcblx0XHRcdFx0YXZhaWxhYmxlOiBzbmFwc2hvdC5tb2RlbHMsXG5cdFx0XHRcdGNvbmZpZ3VyZWRNb2RlbDogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0TW9kZWwpLFxuXHRcdFx0XHRyZW1lbWJlcmVkTW9kZWxJZCxcblx0XHRcdFx0ZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogc25hcHNob3QuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbixcblx0XHRcdFx0ZmFsbGJhY2tNb2RlbCxcblx0XHRcdH0sXG5cdFx0XHRwcmV2aW91czogeyAuLi50aGlzLl9tZW1vcnksIGN1cnJlbnRSZWFzb24gfSxcblx0XHR9KTtcblx0XHR0aGlzLl9tZW1vcnkgPSB7XG5cdFx0XHRzZXNzaW9uS2V5OiByZXN1bHQuc2Vzc2lvbktleSxcblx0XHRcdGxhc3RQdXNoZWRDaGF0S2V5OiByZXN1bHQubGFzdFB1c2hlZENoYXRLZXksXG5cdFx0XHRjdXJyZW50TW9kZWw6IHJlc3VsdC5jdXJyZW50TW9kZWwsXG5cdFx0XHRjdXJyZW50UmVhc29uOiByZXN1bHQuY3VycmVudFJlYXNvbixcblx0XHR9O1xuXHRcdHRoaXMuX21vZGVsVGFyZ2V0ID0gc25hcHNob3QubW9kZWxUYXJnZXQ7XG5cdFx0Y29uc3QgbW9kZWxzID0gc25hcHNob3QubW9kZWxzO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBub3JtYWxpemVNb2RlbFBpY2tlck9wdGlvbnMoc2Vzc2lvbiAmJiBwcm92aWRlciA/IHByb3ZpZGVyLmdldE1vZGVsUGlja2VyT3B0aW9ucyhzZXNzaW9uLnNlc3Npb25JZCkgOiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdG1vZGVscyxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRoYXNTZWxlY3RhYmxlTW9kZWw6ICEhc2Vzc2lvbiAmJiAhIXByb3ZpZGVyICYmIGhhc1NlbGVjdGFibGVNb2RlbChtb2RlbHMsIG9wdGlvbnMpLFxuXHRcdFx0Y3VycmVudE1vZGVsOiByZXN1bHQuY3VycmVudE1vZGVsLFxuXHRcdFx0cGVuZGluZ1NlbGVjdGlvbjogcmVzdWx0LnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ3RyYW5zaXRpb24nLCB7XG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0c2Vzc2lvbktpbmQ6IHNlc3Npb25Db250ZXh0LmtpbmQsXG5cdFx0XHRtb2RlbFRhcmdldDogc25hcHNob3QubW9kZWxUYXJnZXQsXG5cdFx0XHRjb25maWd1cmVkTW9kZWw6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE1vZGVsKSxcblx0XHRcdHJlbWVtYmVyZWRNb2RlbDogcmVtZW1iZXJlZE1vZGVsSWQsXG5cdFx0XHRyZW1lbWJlcmVkU291cmNlOiByZW1lbWJlcmVkU2VsZWN0aW9uPy5zb3VyY2UsXG5cdFx0XHRkZXNpcmVkTW9kZWw6IGRlc2lyZWRNb2RlbElkZW50aWZpZXIsXG5cdFx0XHRkZXNpcmVkUmVzb2x1dGlvbjogc25hcHNob3QuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbi5raW5kLFxuXHRcdFx0ZmFsbGJhY2tNb2RlbDogZmFsbGJhY2tNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdGF2YWlsYWJsZU1vZGVsczogc25hcHNob3QubW9kZWxzLm1hcChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyKS5qb2luKCcsJyksXG5cdFx0XHRwcmV2aW91c01vZGVsOiBwcmV2aW91c01lbW9yeS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRwcmV2aW91c1JlYXNvbjogY3VycmVudFJlYXNvbixcblx0XHRcdHJlc3VsdE1vZGVsOiByZXN1bHQuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVzdWx0UmVhc29uOiByZXN1bHQuY3VycmVudFJlYXNvbixcblx0XHRcdHBlbmRpbmdSZWZlcmVuY2U6IHJlc3VsdC5wZW5kaW5nU2VsZWN0aW9uPy5yZWZlcmVuY2UsXG5cdFx0XHRlZmZlY3Q6IHJlc3VsdC5lZmZlY3Qua2luZCxcblx0XHRcdGVmZmVjdE1vZGVsOiByZXN1bHQuZWZmZWN0LmtpbmQgPT09ICdhcHBseScgPyByZXN1bHQuZWZmZWN0Lm1vZGVsLmlkZW50aWZpZXIgOiB1bmRlZmluZWQsXG5cdFx0XHRlZmZlY3RSZWFzb246IHJlc3VsdC5lZmZlY3Qua2luZCA9PT0gJ25vbmUnID8gdW5kZWZpbmVkIDogcmVzdWx0LmVmZmVjdC5yZWFzb24sXG5cdFx0fSwgcmVzdWx0LmVmZmVjdC5raW5kID09PSAnbm9uZScgJiYgcHJldmlvdXNNZW1vcnkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyID09PSByZXN1bHQuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyID8gJ2RlYnVnJyA6ICdpbmZvJyk7XG5cblx0XHRpZiAocmVzdWx0LmVmZmVjdC5raW5kID09PSAnYXBwbHknICYmIHNlc3Npb24gJiYgcHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGVmZmVjdCA9IHJlc3VsdC5lZmZlY3Q7XG5cdFx0XHRjb25zdCBwcm92aWRlck1vZGVsQmVmb3JlID0gc2Vzc2lvbi5tb2RlbElkLmdldCgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsIGVmZmVjdC5tb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX21lbW9yeSA9IHByZXZpb3VzTWVtb3J5O1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQocHJldmlvdXNTdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdwcm92aWRlci1hdXRvbWF0aWMtc2VsZWN0aW9uLWZhaWxlZCcsIHtcblx0XHRcdFx0XHRtb2RlbDogZWZmZWN0Lm1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0cmVhc29uOiBlZmZlY3QucmVhc29uLFxuXHRcdFx0XHRcdHByb3ZpZGVyTW9kZWxCZWZvcmUsXG5cdFx0XHRcdFx0cHJvdmlkZXJNb2RlbEFmdGVyOiBzZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHRcdFx0ZXJyb3I6IFN0cmluZyhlcnJvciksXG5cdFx0XHRcdH0sICdlcnJvcicpO1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgncHJvdmlkZXItYXV0b21hdGljLXNlbGVjdGlvbi1hcHBsaWVkJywge1xuXHRcdFx0XHRtb2RlbDogZWZmZWN0Lm1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRcdHJlYXNvbjogZWZmZWN0LnJlYXNvbixcblx0XHRcdFx0cHJvdmlkZXJNb2RlbEJlZm9yZSxcblx0XHRcdFx0cHJvdmlkZXJNb2RlbEFmdGVyOiBzZXNzaW9uLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHR9LCAnaW5mbycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJlbWVtYmVyZWRNb2RlbChzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbiwgbW9kZWxUYXJnZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElSZW1lbWJlcmVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0b3JlZFNlbGVjdGlvbiA9IGdldFN0b3JlZFNlbGVjdGVkTW9kZWwodGhpcy5fc3RvcmFnZVNlcnZpY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0KTtcblx0XHRpZiAoc3RvcmVkU2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBpZGVudGlmaWVyOiBzdG9yZWRTZWxlY3Rpb24sIHNvdXJjZTogJ3N0b3JlZCcgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsZWdhY3lTdG9yYWdlS2V5ID0gbGVnYWN5TW9kZWxQaWNrZXJTdG9yYWdlS2V5KHNlc3Npb24ucHJvdmlkZXJJZCwgc2Vzc2lvbi5zZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbGVnYWN5SWRlbnRpZmllciA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChsZWdhY3lTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKGxlZ2FjeUlkZW50aWZpZXIpIHtcblx0XHRcdHN0b3JlU2VsZWN0ZWRNb2RlbCh0aGlzLl9zdG9yYWdlU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZWxUYXJnZXQsIGxlZ2FjeUlkZW50aWZpZXIpO1xuXHRcdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdsZWdhY3ktc2VsZWN0aW9uLW1pZ3JhdGVkJywge1xuXHRcdFx0XHRsZWdhY3lTdG9yYWdlS2V5LFxuXHRcdFx0XHRtb2RlbDogbGVnYWN5SWRlbnRpZmllcixcblx0XHRcdH0sICdpbmZvJyk7XG5cdFx0XHRyZXR1cm4geyBpZGVudGlmaWVyOiBsZWdhY3lJZGVudGlmaWVyLCBzb3VyY2U6ICdsZWdhY3knIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRQcm92aWRlcihwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXIgPT09IHByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5fcHJvdmlkZXJMaXN0ZW5lci52YWx1ZSA9IHByb3ZpZGVyPy5vbkRpZENoYW5nZU1vZGVscygoKSA9PiB0aGlzLl9yZWZyZXNoKCdtb2RlbHMnKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXNzaW9uS2V5KHNlc3Npb246IElBY3RpdmVTZXNzaW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc2Vzc2lvbi5zZXNzaW9uSWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsU0FBc0IsdUJBQXVCO0FBQ3RELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMs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
