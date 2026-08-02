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
import "./media/chatContextUsageWidget.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { EventType, addDisposableListener } from "../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue, observableValueOpts } from "../../../../../../base/common/observable.js";
import { equals } from "../../../../../../base/common/arrays.js";
import { localize } from "../../../../../../nls.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatContextUsageDetails } from "./chatContextUsageDetails.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
const $ = dom.$;
function resolveContextWindowInputTokens(modelConfiguration, configurationSchema, maxInputTokens) {
  const configuredContextSize = typeof modelConfiguration?.contextSize === "number" ? modelConfiguration.contextSize : void 0;
  const schemaDefaultContextSize = configurationSchema?.properties?.contextSize?.default;
  return configuredContextSize ?? (typeof schemaDefaultContextSize === "number" ? schemaDefaultContextSize : void 0) ?? maxInputTokens;
}
function isSameContextUsageData(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.usedTokens === b.usedTokens && a.completionTokens === b.completionTokens && a.totalContextWindow === b.totalContextWindow && a.percentage === b.percentage && a.outputBufferPercentage === b.outputBufferPercentage && a.sessionCost === b.sessionCost && equals(a.promptTokenDetails, b.promptTokenDetails, (x, y) => x.category === y.category && x.label === y.label && x.percentageOfPrompt === y.percentageOfPrompt);
}
const _CircularProgressIndicator = class _CircularProgressIndicator {
  constructor() {
    const r = _CircularProgressIndicator.RADIUS;
    this.circumference = 2 * Math.PI * r;
    this.domNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.domNode.setAttribute("viewBox", "0 0 36 36");
    this.domNode.classList.add("circular-progress");
    const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bgCircle.setAttribute("cx", String(_CircularProgressIndicator.CENTER_X));
    bgCircle.setAttribute("cy", String(_CircularProgressIndicator.CENTER_Y));
    bgCircle.setAttribute("r", String(r));
    bgCircle.classList.add("progress-bg");
    this.domNode.appendChild(bgCircle);
    this.progressCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this.progressCircle.setAttribute("cx", String(_CircularProgressIndicator.CENTER_X));
    this.progressCircle.setAttribute("cy", String(_CircularProgressIndicator.CENTER_Y));
    this.progressCircle.setAttribute("r", String(r));
    this.progressCircle.classList.add("progress-arc");
    this.progressCircle.setAttribute("stroke-dasharray", String(this.circumference));
    this.progressCircle.setAttribute("stroke-dashoffset", String(this.circumference));
    this.domNode.appendChild(this.progressCircle);
  }
  /**
   * Updates the ring to display the given percentage (0-100).
   * @param percentage The percentage of the ring to fill (clamped to 0-100)
   */
  setProgress(percentage) {
    const clamped = Math.max(0, Math.min(100, percentage));
    const offset = this.circumference - clamped / 100 * this.circumference;
    this.progressCircle.setAttribute("stroke-dashoffset", String(offset));
  }
};
_CircularProgressIndicator.CENTER_X = 18;
_CircularProgressIndicator.CENTER_Y = 18;
_CircularProgressIndicator.RADIUS = 14;
let CircularProgressIndicator = _CircularProgressIndicator;
let ChatContextUsageWidget = class extends Disposable {
  constructor(hoverService, instantiationService, languageModelsService, contextKeyService, storageService, configurationService) {
    super();
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._isVisible = observableValue(this, false);
    this._lastRequestDisposable = this._register(new MutableDisposable());
    this._modelConfigurationListener = this._register(new MutableDisposable());
    this._hoverDisposable = this._register(new MutableDisposable());
    this._contextUsageDetails = this._register(new MutableDisposable());
    this._currentData = observableValueOpts({ owner: this, equalsFn: isSameContextUsageData }, void 0);
    this._hoverOptions = {
      id: ChatContextUsageWidget._HOVER_ID,
      appearance: { showPointer: true, compact: true },
      persistence: { hideOnHover: false },
      trapFocus: true
    };
    this.domNode = $(".chat-context-usage-widget");
    this.domNode.style.display = "none";
    this.domNode.setAttribute("tabindex", "0");
    this.domNode.setAttribute("role", "button");
    this.domNode.setAttribute("aria-label", localize("contextUsageLabel", "Context window usage"));
    const iconContainer = this.domNode.appendChild($(".icon-container"));
    this.progressIndicator = new CircularProgressIndicator();
    iconContainer.appendChild(this.progressIndicator.domNode);
    this.percentageLabel = this.domNode.appendChild($(".percentage-label"));
    this._contextUsageOpenedKey = ChatContextKeys.contextUsageHasBeenOpened.bindTo(this.contextKeyService);
    if (this.storageService.getBoolean(ChatContextUsageWidget._OPENED_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
      this._contextUsageOpenedKey.set(true);
    }
    this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ChatContextUsageEnabled)) {
        this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
        if (!this._enabled) {
          this.hide();
        } else if (this._currentData.get()) {
          this.show();
        }
      }
    }));
    this.setupHover();
  }
  get isVisible() {
    return this._isVisible;
  }
  setChatWidget(widget) {
    this._chatWidget = widget;
    this._contextUsageDetails.value?.setChatWidget(widget);
  }
  /**
   * Shows the sticky context usage details hover and records that the user
   * has opened it. Returns `true` if the details were shown.
   */
  showDetails() {
    const details = this._createDetails();
    if (!details) {
      return false;
    }
    this.hoverService.showInstantHover(
      { ...this._hoverOptions, content: details.domNode, target: this.domNode, persistence: { hideOnHover: false, sticky: true } },
      true
    );
    this._markOpened();
    return true;
  }
  _createDetails() {
    if (!this._isVisible.get() || !this._currentData.get()) {
      return void 0;
    }
    if (!this._contextUsageDetails.value) {
      this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails, this._chatWidget, this._currentData);
    }
    return this._contextUsageDetails.value;
  }
  _markOpened() {
    this._contextUsageOpenedKey.set(true);
    this.storageService.store(ChatContextUsageWidget._OPENED_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  setupHover() {
    this._hoverDisposable.clear();
    const store = new DisposableStore();
    this._hoverDisposable.value = store;
    store.add(this.hoverService.setupDelayedHover(this.domNode, () => ({
      ...this._hoverOptions,
      content: this._createDetails()?.domNode ?? ""
    })));
    store.add(addDisposableListener(this.domNode, EventType.CLICK, (e) => {
      e.stopPropagation();
      this.showDetails();
    }));
    store.add(addDisposableListener(this.domNode, EventType.KEY_DOWN, (e) => {
      const evt = new StandardKeyboardEvent(e);
      if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
        e.preventDefault();
        this.showDetails();
      }
    }));
  }
  /**
   * Updates the widget with the latest request/response data.
   * The model is retrieved from the request's modelId.
   * @param lastRequest The last request in the session
   */
  update(lastRequest) {
    this._lastRequestDisposable.clear();
    this._currentResponse = void 0;
    this._currentModelId = void 0;
    if (!lastRequest) {
      this._currentData.set(void 0, void 0);
      this.hide();
      return;
    }
    if (!lastRequest.response || !lastRequest.modelId) {
      if (!this._currentData.get()) {
        this.hide();
      }
      return;
    }
    const response = lastRequest.response;
    const modelId = lastRequest.modelId;
    this._currentResponse = response;
    this._currentModelId = modelId;
    this.updateFromResponse(response, modelId);
    this._lastRequestDisposable.value = response.onDidChange(() => {
      this.updateFromResponse(response, modelId);
    });
  }
  updateSessionCost(sessionCost) {
    const data = this._currentData.get();
    if (data && data.sessionCost !== sessionCost) {
      this.render({ ...data, sessionCost });
    }
  }
  /**
   * Provides a per-editor resolver for the selected model's configuration
   * (notably the user-selected context size). The widget re-renders whenever
   * the supplied event fires for the currently displayed model. Without this,
   * the widget falls back to the profile-global value, which can drift from
   * the editor's actual selection (see issue #320393).
   */
  setModelConfigurationResolver(resolver, onDidChange) {
    this._modelConfigurationResolver = resolver;
    this._modelConfigurationListener.value = onDidChange((modelId) => {
      const affectsDisplayedModel = this._currentModelId === modelId || this._selectedModelId === modelId;
      if (this._currentResponse && this._currentModelId && affectsDisplayedModel) {
        this.updateFromResponse(this._currentResponse, this._currentModelId);
      }
    });
  }
  /**
   * Sets the model the user currently has selected in the picker. The
   * context-window denominator then reflects this model immediately, even
   * before a request is sent with it. The usage numerator still comes from the
   * last completed response.
   */
  setSelectedModel(modelId) {
    if (this._selectedModelId === modelId) {
      return;
    }
    this._selectedModelId = modelId;
    if (this._currentResponse && this._currentModelId) {
      this.updateFromResponse(this._currentResponse, this._currentModelId);
    }
  }
  /**
   * Resolves a model's context-window dimensions, or `undefined` when it has no usable window. A meta-model such as
   * "auto" advertises a zero-sized window, so it resolves to `undefined` and the caller falls back to the model that
   * actually served the request (see issue #321781).
   */
  resolveContextWindow(modelId) {
    if (!modelId) {
      return void 0;
    }
    const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
    if (!modelMetadata) {
      return void 0;
    }
    const modelConfiguration = this._modelConfigurationResolver?.(modelId) ?? this.languageModelsService.getModelConfiguration(modelId);
    const maxInputTokens = resolveContextWindowInputTokens(modelConfiguration, modelMetadata.configurationSchema, modelMetadata.maxInputTokens);
    const maxOutputTokens = modelMetadata.maxOutputTokens;
    const totalContextWindow = (maxInputTokens ?? 0) + (maxOutputTokens ?? 0);
    if (totalContextWindow <= 0) {
      return void 0;
    }
    return { maxOutputTokens, totalContextWindow };
  }
  updateFromResponse(response, modelId) {
    const usage = response.usage;
    const effectiveModelId = usage?.actualModelId ?? modelId;
    const contextWindow = this.resolveContextWindow(this._selectedModelId) ?? this.resolveContextWindow(effectiveModelId);
    if (!usage || !contextWindow) {
      if (!this._currentData.get()) {
        this.hide();
      }
      return;
    }
    const { maxOutputTokens, totalContextWindow } = contextWindow;
    const promptTokens = usage.promptTokens;
    const completionTokens = usage.completionTokens;
    const promptTokenDetails = usage.promptTokenDetails;
    const usedTokens = promptTokens + completionTokens;
    const percentage = usedTokens / totalContextWindow * 100;
    const outputBufferPercentage = maxOutputTokens !== void 0 ? Math.max(0, maxOutputTokens - completionTokens) / totalContextWindow * 100 : void 0;
    this.render({
      usedTokens,
      completionTokens,
      totalContextWindow,
      percentage,
      outputBufferPercentage,
      promptTokenDetails,
      sessionCost: response.session.sessionCost
    });
    this.show();
  }
  render(data) {
    this._currentData.set(data, void 0);
    this.progressIndicator.setProgress(data.percentage);
    const roundedPercentage = Math.min(100, Math.round(data.percentage));
    this.percentageLabel.textContent = `${roundedPercentage}%`;
    this.domNode.setAttribute("aria-label", localize("contextUsagePercentageLabel", "Context window usage: {0}%", roundedPercentage));
    this.domNode.classList.remove("warning", "error");
    if (data.percentage >= 90) {
      this.domNode.classList.add("error");
    } else if (data.percentage >= 75) {
      this.domNode.classList.add("warning");
    }
  }
  show() {
    if (!this._enabled) {
      return;
    }
    if (this.domNode.style.display === "none") {
      this.domNode.style.display = "";
      this._isVisible.set(true, void 0);
      this._onDidChangeVisibility.fire();
    }
  }
  hide() {
    if (this.domNode.style.display !== "none") {
      this.domNode.style.display = "none";
      this._isVisible.set(false, void 0);
      this._onDidChangeVisibility.fire();
    }
  }
};
ChatContextUsageWidget._OPENED_STORAGE_KEY = "chat.contextUsage.hasBeenOpened";
ChatContextUsageWidget._HOVER_ID = "chat.contextUsage";
ChatContextUsageWidget = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService)
], ChatContextUsageWidget);
export {
  ChatContextUsageWidget,
  CircularProgressIndicator,
  isSameContextUsageData,
  resolveContextWindowInputTokens
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Q29udGV4dFVzYWdlV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRDb250ZXh0VXNhZ2VXaWRnZXQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJRGVsYXllZEhvdmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCBvYnNlcnZhYmxlVmFsdWVPcHRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ29uZmlndXJhdGlvblNjaGVtYSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFVzYWdlRGV0YWlscywgSUNoYXRDb250ZXh0VXNhZ2VEYXRhIH0gZnJvbSAnLi9jaGF0Q29udGV4dFVzYWdlRGV0YWlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGlucHV0LXRva2VuIGRlbm9taW5hdG9yIHVzZWQgYnkgdGhlIGNvbnRleHQtdXNhZ2UgZ2F1Z2UuXG4gKlxuICogUmVzb2x1dGlvbiBvcmRlciwgbWlycm9yaW5nIHRoZSByZXF1ZXN0IHBhdGgncyBgYXBwbHlDb250ZXh0U2l6ZU92ZXJyaWRlYDpcbiAqICAgMS4gQW4gZXhwbGljaXQgYGNvbnRleHRTaXplYCBpbiB0aGUgcmVzb2x2ZWQgbW9kZWwgY29uZmlndXJhdGlvbi5cbiAqICAgMi4gVGhlIHNjaGVtYSdzIGRlZmF1bHQgYGNvbnRleHRTaXplYCB0aWVyIChlLmcuIDIwMEspLiBVc2VkIHdoZW4gdGhlXG4gKiAgICAgIHJlc29sdmVkIGNvbmZpZ3VyYXRpb24gaXMgbWlzc2luZyBgY29udGV4dFNpemVgIChlLmcuIHRoZSBzY2hlbWEgZGVmYXVsdFxuICogICAgICBoYXMgbm90IGxvYWRlZCB5ZXQpIHNvIHRoZSBnYXVnZSBkZW5vbWluYXRvciBhZ3JlZXMgd2l0aCB0aGUgc2l6ZSB0aGVcbiAqICAgICAgcmVxdWVzdCBhY3R1YWxseSB1c2VzIGluc3RlYWQgb2YganVtcGluZyB0byB0aGUgbW9kZWwncyBmdWxsIG5hdGl2ZVxuICogICAgICB3aW5kb3cuIFNlZSBpc3N1ZSAjMzIwMzkzLlxuICogICAzLiBUaGUgbW9kZWwncyBmdWxsIG5hdGl2ZSB3aW5kb3cgKGBtYXhJbnB1dFRva2Vuc2ApLiBNb2RlbHMgd2l0aG91dCBhXG4gKiAgICAgIGNvbnRleHQtc2l6ZSBwaWNrZXIgaGF2ZSBubyBzdWNoIHNjaGVtYSBwcm9wZXJ0eSBhbmQgbGFuZCBoZXJlLCB3aGVyZVxuICogICAgICBkZWZhdWx0IGFuZCBtYXggYXJlIHRoZSBzYW1lIHZhbHVlLlxuICpcbiAqIEBpbnRlcm5hbCAtIGV4cG9ydGVkIGZvciB0ZXN0aW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQ29udGV4dFdpbmRvd0lucHV0VG9rZW5zKFxuXHRtb2RlbENvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHRjb25maWd1cmF0aW9uU2NoZW1hOiBJTGFuZ3VhZ2VNb2RlbENvbmZpZ3VyYXRpb25TY2hlbWEgfCB1bmRlZmluZWQsXG5cdG1heElucHV0VG9rZW5zOiBudW1iZXIgfCB1bmRlZmluZWQsXG4pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBjb25maWd1cmVkQ29udGV4dFNpemUgPSB0eXBlb2YgbW9kZWxDb25maWd1cmF0aW9uPy5jb250ZXh0U2l6ZSA9PT0gJ251bWJlcicgPyBtb2RlbENvbmZpZ3VyYXRpb24uY29udGV4dFNpemUgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHNjaGVtYURlZmF1bHRDb250ZXh0U2l6ZSA9IGNvbmZpZ3VyYXRpb25TY2hlbWE/LnByb3BlcnRpZXM/LmNvbnRleHRTaXplPy5kZWZhdWx0O1xuXHRyZXR1cm4gY29uZmlndXJlZENvbnRleHRTaXplXG5cdFx0Pz8gKHR5cGVvZiBzY2hlbWFEZWZhdWx0Q29udGV4dFNpemUgPT09ICdudW1iZXInID8gc2NoZW1hRGVmYXVsdENvbnRleHRTaXplIDogdW5kZWZpbmVkKVxuXHRcdD8/IG1heElucHV0VG9rZW5zO1xufVxuXG4vKipcbiAqIEVxdWFsaXR5IGNvbXBhcmVyIGZvciB7QGxpbmsgSUNoYXRDb250ZXh0VXNhZ2VEYXRhfSB1c2VkIHRvIHN1cHByZXNzIHJlZHVuZGFudCB1cGRhdGVzLlxuICpcbiAqIEBpbnRlcm5hbCAtIGV4cG9ydGVkIGZvciB0ZXN0aW5nXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1NhbWVDb250ZXh0VXNhZ2VEYXRhKGE6IElDaGF0Q29udGV4dFVzYWdlRGF0YSB8IHVuZGVmaW5lZCwgYjogSUNoYXRDb250ZXh0VXNhZ2VEYXRhIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhID09PSBiKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBhLnVzZWRUb2tlbnMgPT09IGIudXNlZFRva2Vuc1xuXHRcdCYmIGEuY29tcGxldGlvblRva2VucyA9PT0gYi5jb21wbGV0aW9uVG9rZW5zXG5cdFx0JiYgYS50b3RhbENvbnRleHRXaW5kb3cgPT09IGIudG90YWxDb250ZXh0V2luZG93XG5cdFx0JiYgYS5wZXJjZW50YWdlID09PSBiLnBlcmNlbnRhZ2Vcblx0XHQmJiBhLm91dHB1dEJ1ZmZlclBlcmNlbnRhZ2UgPT09IGIub3V0cHV0QnVmZmVyUGVyY2VudGFnZVxuXHRcdCYmIGEuc2Vzc2lvbkNvc3QgPT09IGIuc2Vzc2lvbkNvc3Rcblx0XHQmJiBlcXVhbHMoYS5wcm9tcHRUb2tlbkRldGFpbHMsIGIucHJvbXB0VG9rZW5EZXRhaWxzLCAoeCwgeSkgPT5cblx0XHRcdHguY2F0ZWdvcnkgPT09IHkuY2F0ZWdvcnkgJiYgeC5sYWJlbCA9PT0geS5sYWJlbCAmJiB4LnBlcmNlbnRhZ2VPZlByb21wdCA9PT0geS5wZXJjZW50YWdlT2ZQcm9tcHQpO1xufVxuXG4vKipcbiAqIEEgcmV1c2FibGUgY2lyY3VsYXIgcHJvZ3Jlc3MgaW5kaWNhdG9yIHRoYXQgZGlzcGxheXMgYSByaW5nLlxuICogVGhlIHJpbmcgZmlsbHMgY2xvY2t3aXNlIGZyb20gdGhlIHRvcCBiYXNlZCBvbiB0aGUgcGVyY2VudGFnZSB2YWx1ZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3Ige1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IFNWR1NWR0VsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc0NpcmNsZTogU1ZHQ2lyY2xlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjaXJjdW1mZXJlbmNlOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0VOVEVSX1ggPSAxODtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0VOVEVSX1kgPSAxODtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkFESVVTID0gMTQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgciA9IENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3IuUkFESVVTO1xuXHRcdHRoaXMuY2lyY3VtZmVyZW5jZSA9IDIgKiBNYXRoLlBJICogcjtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnc3ZnJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgndmlld0JveCcsICcwIDAgMzYgMzYnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2lyY3VsYXItcHJvZ3Jlc3MnKTtcblxuXHRcdC8vIEJhY2tncm91bmQgY2lyY2xlXG5cdFx0Y29uc3QgYmdDaXJjbGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ2NpcmNsZScpO1xuXHRcdGJnQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3gnLCBTdHJpbmcoQ2lyY3VsYXJQcm9ncmVzc0luZGljYXRvci5DRU5URVJfWCkpO1xuXHRcdGJnQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3knLCBTdHJpbmcoQ2lyY3VsYXJQcm9ncmVzc0luZGljYXRvci5DRU5URVJfWSkpO1xuXHRcdGJnQ2lyY2xlLnNldEF0dHJpYnV0ZSgncicsIFN0cmluZyhyKSk7XG5cdFx0YmdDaXJjbGUuY2xhc3NMaXN0LmFkZCgncHJvZ3Jlc3MtYmcnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoYmdDaXJjbGUpO1xuXG5cdFx0Ly8gUHJvZ3Jlc3MgYXJjIChzdHJva2UtYmFzZWQgcmluZylcblx0XHR0aGlzLnByb2dyZXNzQ2lyY2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdjaXJjbGUnKTtcblx0XHR0aGlzLnByb2dyZXNzQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3gnLCBTdHJpbmcoQ2lyY3VsYXJQcm9ncmVzc0luZGljYXRvci5DRU5URVJfWCkpO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuc2V0QXR0cmlidXRlKCdjeScsIFN0cmluZyhDaXJjdWxhclByb2dyZXNzSW5kaWNhdG9yLkNFTlRFUl9ZKSk7XG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ3InLCBTdHJpbmcocikpO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuY2xhc3NMaXN0LmFkZCgncHJvZ3Jlc3MtYXJjJyk7XG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNoYXJyYXknLCBTdHJpbmcodGhpcy5jaXJjdW1mZXJlbmNlKSk7XG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNob2Zmc2V0JywgU3RyaW5nKHRoaXMuY2lyY3VtZmVyZW5jZSkpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLnByb2dyZXNzQ2lyY2xlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSByaW5nIHRvIGRpc3BsYXkgdGhlIGdpdmVuIHBlcmNlbnRhZ2UgKDAtMTAwKS5cblx0ICogQHBhcmFtIHBlcmNlbnRhZ2UgVGhlIHBlcmNlbnRhZ2Ugb2YgdGhlIHJpbmcgdG8gZmlsbCAoY2xhbXBlZCB0byAwLTEwMClcblx0ICovXG5cdHNldFByb2dyZXNzKHBlcmNlbnRhZ2U6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNsYW1wZWQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxMDAsIHBlcmNlbnRhZ2UpKTtcblx0XHRjb25zdCBvZmZzZXQgPSB0aGlzLmNpcmN1bWZlcmVuY2UgLSAoY2xhbXBlZCAvIDEwMCkgKiB0aGlzLmNpcmN1bWZlcmVuY2U7XG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS1kYXNob2Zmc2V0JywgU3RyaW5nKG9mZnNldCkpO1xuXHR9XG59XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgdGhlIGNvbnRleHQvdG9rZW4gdXNhZ2UgZm9yIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbi5cbiAqIFNob3dzIGEgY2lyY3VsYXIgcHJvZ3Jlc3MgaWNvbiB0aGF0IGV4cGFuZHMgb24gaG92ZXIvZm9jdXMgdG8gc2hvdyB0b2tlbiBjb3VudHMsXG4gKiBhbmQgb24gY2xpY2sgc2hvd3MgdGhlIGRldGFpbGVkIGNvbnRleHQgdXNhZ2Ugd2lkZ2V0LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdENvbnRleHRVc2FnZVdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NJbmRpY2F0b3I6IENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGVyY2VudGFnZUxhYmVsOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Zpc2libGUgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRnZXQgaXNWaXNpYmxlKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMuX2lzVmlzaWJsZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3RSZXF1ZXN0RGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxDb25maWd1cmF0aW9uTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX2N1cnJlbnRSZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhlIG1vZGVsIHRoZSB1c2VyIGN1cnJlbnRseSBoYXMgc2VsZWN0ZWQgaW4gdGhlIHBpY2tlci4gV2hlbiBzZXQgaXRcblx0ICogb3ZlcnJpZGVzIHRoZSBsYXN0IHJlcXVlc3QncyBtb2RlbCBmb3IgY29tcHV0aW5nIHRoZSBjb250ZXh0LXdpbmRvd1xuXHQgKiBkZW5vbWluYXRvciwgc28gc3dpdGNoaW5nIG1vZGVscyB1cGRhdGVzIHRoZSB3aWRnZXQgYmVmb3JlIHRoZSBuZXh0XG5cdCAqIHJlcXVlc3QgaXMgc2VudC4gVGhlIHVzYWdlIG51bWVyYXRvciBzdGlsbCBjb21lcyBmcm9tIHRoZSBsYXN0IHJlc3BvbnNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2VsZWN0ZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0VXNhZ2VEZXRhaWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRDb250ZXh0VXNhZ2VEZXRhaWxzPigpKTtcblx0cHJpdmF0ZSBfY2hhdFdpZGdldDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudERhdGEgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPElDaGF0Q29udGV4dFVzYWdlRGF0YSB8IHVuZGVmaW5lZD4oeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGlzU2FtZUNvbnRleHRVc2FnZURhdGEgfSwgdW5kZWZpbmVkKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfT1BFTkVEX1NUT1JBR0VfS0VZID0gJ2NoYXQuY29udGV4dFVzYWdlLmhhc0JlZW5PcGVuZWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSE9WRVJfSUQgPSAnY2hhdC5jb250ZXh0VXNhZ2UnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRVc2FnZU9wZW5lZEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfZW5hYmxlZDogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUGVyLWVkaXRvciByZXNvbHZlciBmb3IgYSBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gKGUuZy4gdXNlci1zZWxlY3RlZFxuXHQgKiBjb250ZXh0IHNpemUpLiBXaGVuIHVuc2V0IHRoZSB3aWRnZXQgZmFsbHMgYmFjayB0byB0aGUgcHJvZmlsZS1nbG9iYWxcblx0ICogdmFsdWUgZnJvbSB7QGxpbmsgSUxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb259LCB3aGljaCBjYW5cblx0ICogbGFnIHRoZSBlZGl0b3IncyBhY3R1YWwgc2VsZWN0aW9uIChzZWUgaXNzdWUgIzMyMDM5MykuXG5cdCAqL1xuXHRwcml2YXRlIF9tb2RlbENvbmZpZ3VyYXRpb25SZXNvbHZlcjogKChtb2RlbElkOiBzdHJpbmcpID0+IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9ICQoJy5jaGF0LWNvbnRleHQtdXNhZ2Utd2lkZ2V0Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjb250ZXh0VXNhZ2VMYWJlbCcsIFwiQ29udGV4dCB3aW5kb3cgdXNhZ2VcIikpO1xuXG5cdFx0Ly8gSWNvbiBjb250YWluZXIgKGFsd2F5cyB2aXNpYmxlLCBjb250YWlucyB0aGUgcGllIGNoYXJ0KVxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSB0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoJCgnLmljb24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMucHJvZ3Jlc3NJbmRpY2F0b3IgPSBuZXcgQ2lyY3VsYXJQcm9ncmVzc0luZGljYXRvcigpO1xuXHRcdGljb25Db250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5wcm9ncmVzc0luZGljYXRvci5kb21Ob2RlKTtcblxuXHRcdC8vIFBlcmNlbnRhZ2UgbGFiZWwgKHZpc2libGUgb24gaG92ZXIvZm9jdXMpXG5cdFx0dGhpcy5wZXJjZW50YWdlTGFiZWwgPSB0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoJCgnLnBlcmNlbnRhZ2UtbGFiZWwnKSk7XG5cblx0XHQvLyBUcmFjayBjb250ZXh0IHVzYWdlIG9wZW5lZCBzdGF0ZVxuXHRcdHRoaXMuX2NvbnRleHRVc2FnZU9wZW5lZEtleSA9IENoYXRDb250ZXh0S2V5cy5jb250ZXh0VXNhZ2VIYXNCZWVuT3BlbmVkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc3RvcmUgcGVyc2lzdGVkIHN0YXRlXG5cdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDaGF0Q29udGV4dFVzYWdlV2lkZ2V0Ll9PUEVORURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKSkge1xuXHRcdFx0dGhpcy5fY29udGV4dFVzYWdlT3BlbmVkS2V5LnNldCh0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBlbmFibGVkIHN0YXRlIGZyb20gY29uZmlndXJhdGlvblxuXHRcdHRoaXMuX2VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRDb250ZXh0VXNhZ2VFbmFibGVkKSAhPT0gZmFsc2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy5fZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdENvbnRleHRVc2FnZUVuYWJsZWQpICE9PSBmYWxzZTtcblx0XHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudERhdGEuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLnNob3coKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNldCB1cCBob3ZlciAtIHdpbGwgYmUgY29uZmlndXJlZCB3aGVuIGRhdGEgaXMgYXZhaWxhYmxlXG5cdFx0dGhpcy5zZXR1cEhvdmVyKCk7XG5cdH1cblxuXHRzZXRDaGF0V2lkZ2V0KHdpZGdldDogSUNoYXRXaWRnZXQpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0V2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdHRoaXMuX2NvbnRleHRVc2FnZURldGFpbHMudmFsdWU/LnNldENoYXRXaWRnZXQod2lkZ2V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyB0aGUgc3RpY2t5IGNvbnRleHQgdXNhZ2UgZGV0YWlscyBob3ZlciBhbmQgcmVjb3JkcyB0aGF0IHRoZSB1c2VyXG5cdCAqIGhhcyBvcGVuZWQgaXQuIFJldHVybnMgYHRydWVgIGlmIHRoZSBkZXRhaWxzIHdlcmUgc2hvd24uXG5cdCAqL1xuXHRzaG93RGV0YWlscygpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZXRhaWxzID0gdGhpcy5fY3JlYXRlRGV0YWlscygpO1xuXHRcdGlmICghZGV0YWlscykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKFxuXHRcdFx0eyAuLi50aGlzLl9ob3Zlck9wdGlvbnMsIGNvbnRlbnQ6IGRldGFpbHMuZG9tTm9kZSwgdGFyZ2V0OiB0aGlzLmRvbU5vZGUsIHBlcnNpc3RlbmNlOiB7IGhpZGVPbkhvdmVyOiBmYWxzZSwgc3RpY2t5OiB0cnVlIH0gfSxcblx0XHRcdHRydWVcblx0XHQpO1xuXHRcdHRoaXMuX21hcmtPcGVuZWQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyT3B0aW9uczogT21pdDxJRGVsYXllZEhvdmVyT3B0aW9ucywgJ2NvbnRlbnQnPiA9IHtcblx0XHRpZDogQ2hhdENvbnRleHRVc2FnZVdpZGdldC5fSE9WRVJfSUQsXG5cdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSwgY29tcGFjdDogdHJ1ZSB9LFxuXHRcdHBlcnNpc3RlbmNlOiB7IGhpZGVPbkhvdmVyOiBmYWxzZSB9LFxuXHRcdHRyYXBGb2N1czogdHJ1ZVxuXHR9O1xuXG5cdHByaXZhdGUgX2NyZWF0ZURldGFpbHMoKTogQ2hhdENvbnRleHRVc2FnZURldGFpbHMgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlLmdldCgpIHx8ICF0aGlzLl9jdXJyZW50RGF0YS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jb250ZXh0VXNhZ2VEZXRhaWxzLnZhbHVlKSB7XG5cdFx0XHQvLyBEZXRhaWxzIHN1YnNjcmliZXMgdG8gYF9jdXJyZW50RGF0YWAgYW5kIHJlLXJlbmRlcnMgcmVhY3RpdmVseS5cblx0XHRcdHRoaXMuX2NvbnRleHRVc2FnZURldGFpbHMudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb250ZXh0VXNhZ2VEZXRhaWxzLCB0aGlzLl9jaGF0V2lkZ2V0LCB0aGlzLl9jdXJyZW50RGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0VXNhZ2VEZXRhaWxzLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya09wZW5lZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZXh0VXNhZ2VPcGVuZWRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2hhdENvbnRleHRVc2FnZVdpZGdldC5fT1BFTkVEX1NUT1JBR0VfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEhvdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hvdmVyRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2hvdmVyRGlzcG9zYWJsZS52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0c3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZG9tTm9kZSwgKCkgPT4gKHtcblx0XHRcdC4uLnRoaXMuX2hvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQ6IHRoaXMuX2NyZWF0ZURldGFpbHMoKT8uZG9tTm9kZSA/PyAnJ1xuXHRcdH0pKSk7XG5cblx0XHQvLyBTaG93IHN0aWNreSArIGZvY3VzZWQgaG92ZXIgb24gY2xpY2tcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLnNob3dEZXRhaWxzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2hvdyBzdGlja3kgKyBmb2N1c2VkIGhvdmVyIG9uIGtleWJvYXJkIGFjdGl2YXRpb24gKFNwYWNlL0VudGVyKVxuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZ0ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2dC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLnNob3dEZXRhaWxzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHdpZGdldCB3aXRoIHRoZSBsYXRlc3QgcmVxdWVzdC9yZXNwb25zZSBkYXRhLlxuXHQgKiBUaGUgbW9kZWwgaXMgcmV0cmlldmVkIGZyb20gdGhlIHJlcXVlc3QncyBtb2RlbElkLlxuXHQgKiBAcGFyYW0gbGFzdFJlcXVlc3QgVGhlIGxhc3QgcmVxdWVzdCBpbiB0aGUgc2Vzc2lvblxuXHQgKi9cblx0dXBkYXRlKGxhc3RSZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RSZXF1ZXN0RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRSZXNwb25zZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jdXJyZW50TW9kZWxJZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICghbGFzdFJlcXVlc3QpIHtcblx0XHRcdC8vIE5ldy9lbXB0eSBjaGF0IHNlc3Npb24gY2xlYXIgZXZlcnl0aGluZ1xuXHRcdFx0dGhpcy5fY3VycmVudERhdGEuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghbGFzdFJlcXVlc3QucmVzcG9uc2UgfHwgIWxhc3RSZXF1ZXN0Lm1vZGVsSWQpIHtcblx0XHRcdC8vIFBlbmRpbmcgcmVxdWVzdCBrZWVwIG9sZCBkYXRhIHZpc2libGUgaWYgYXZhaWxhYmxlXG5cdFx0XHRpZiAoIXRoaXMuX2N1cnJlbnREYXRhLmdldCgpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gbGFzdFJlcXVlc3QucmVzcG9uc2U7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IGxhc3RSZXF1ZXN0Lm1vZGVsSWQ7XG5cdFx0dGhpcy5fY3VycmVudFJlc3BvbnNlID0gcmVzcG9uc2U7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsSWQgPSBtb2RlbElkO1xuXG5cdFx0Ly8gVXBkYXRlIGltbWVkaWF0ZWx5IGlmIHVzYWdlIGRhdGEgaXMgYWxyZWFkeSBhdmFpbGFibGVcblx0XHR0aGlzLnVwZGF0ZUZyb21SZXNwb25zZShyZXNwb25zZSwgbW9kZWxJZCk7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gcmVzcG9uc2UgY2hhbmdlcyB0byB1cGRhdGUgd2hlbmV2ZXIgdXNhZ2UgZGF0YSBjaGFuZ2VzXG5cdFx0dGhpcy5fbGFzdFJlcXVlc3REaXNwb3NhYmxlLnZhbHVlID0gcmVzcG9uc2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVGcm9tUmVzcG9uc2UocmVzcG9uc2UsIG1vZGVsSWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0dXBkYXRlU2Vzc2lvbkNvc3Qoc2Vzc2lvbkNvc3Q6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9jdXJyZW50RGF0YS5nZXQoKTtcblx0XHRpZiAoZGF0YSAmJiBkYXRhLnNlc3Npb25Db3N0ICE9PSBzZXNzaW9uQ29zdCkge1xuXHRcdFx0dGhpcy5yZW5kZXIoeyAuLi5kYXRhLCBzZXNzaW9uQ29zdCB9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJvdmlkZXMgYSBwZXItZWRpdG9yIHJlc29sdmVyIGZvciB0aGUgc2VsZWN0ZWQgbW9kZWwncyBjb25maWd1cmF0aW9uXG5cdCAqIChub3RhYmx5IHRoZSB1c2VyLXNlbGVjdGVkIGNvbnRleHQgc2l6ZSkuIFRoZSB3aWRnZXQgcmUtcmVuZGVycyB3aGVuZXZlclxuXHQgKiB0aGUgc3VwcGxpZWQgZXZlbnQgZmlyZXMgZm9yIHRoZSBjdXJyZW50bHkgZGlzcGxheWVkIG1vZGVsLiBXaXRob3V0IHRoaXMsXG5cdCAqIHRoZSB3aWRnZXQgZmFsbHMgYmFjayB0byB0aGUgcHJvZmlsZS1nbG9iYWwgdmFsdWUsIHdoaWNoIGNhbiBkcmlmdCBmcm9tXG5cdCAqIHRoZSBlZGl0b3IncyBhY3R1YWwgc2VsZWN0aW9uIChzZWUgaXNzdWUgIzMyMDM5MykuXG5cdCAqL1xuXHRzZXRNb2RlbENvbmZpZ3VyYXRpb25SZXNvbHZlcihcblx0XHRyZXNvbHZlcjogKG1vZGVsSWQ6IHN0cmluZykgPT4gSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2U6IEV2ZW50PHN0cmluZz4sXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsQ29uZmlndXJhdGlvblJlc29sdmVyID0gcmVzb2x2ZXI7XG5cdFx0dGhpcy5fbW9kZWxDb25maWd1cmF0aW9uTGlzdGVuZXIudmFsdWUgPSBvbkRpZENoYW5nZShtb2RlbElkID0+IHtcblx0XHRcdGNvbnN0IGFmZmVjdHNEaXNwbGF5ZWRNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbElkID09PSBtb2RlbElkIHx8IHRoaXMuX3NlbGVjdGVkTW9kZWxJZCA9PT0gbW9kZWxJZDtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50UmVzcG9uc2UgJiYgdGhpcy5fY3VycmVudE1vZGVsSWQgJiYgYWZmZWN0c0Rpc3BsYXllZE1vZGVsKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRnJvbVJlc3BvbnNlKHRoaXMuX2N1cnJlbnRSZXNwb25zZSwgdGhpcy5fY3VycmVudE1vZGVsSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1vZGVsIHRoZSB1c2VyIGN1cnJlbnRseSBoYXMgc2VsZWN0ZWQgaW4gdGhlIHBpY2tlci4gVGhlXG5cdCAqIGNvbnRleHQtd2luZG93IGRlbm9taW5hdG9yIHRoZW4gcmVmbGVjdHMgdGhpcyBtb2RlbCBpbW1lZGlhdGVseSwgZXZlblxuXHQgKiBiZWZvcmUgYSByZXF1ZXN0IGlzIHNlbnQgd2l0aCBpdC4gVGhlIHVzYWdlIG51bWVyYXRvciBzdGlsbCBjb21lcyBmcm9tIHRoZVxuXHQgKiBsYXN0IGNvbXBsZXRlZCByZXNwb25zZS5cblx0ICovXG5cdHNldFNlbGVjdGVkTW9kZWwobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NlbGVjdGVkTW9kZWxJZCA9PT0gbW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPSBtb2RlbElkO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVzcG9uc2UgJiYgdGhpcy5fY3VycmVudE1vZGVsSWQpIHtcblx0XHRcdHRoaXMudXBkYXRlRnJvbVJlc3BvbnNlKHRoaXMuX2N1cnJlbnRSZXNwb25zZSwgdGhpcy5fY3VycmVudE1vZGVsSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIG1vZGVsJ3MgY29udGV4dC13aW5kb3cgZGltZW5zaW9ucywgb3IgYHVuZGVmaW5lZGAgd2hlbiBpdCBoYXMgbm8gdXNhYmxlIHdpbmRvdy4gQSBtZXRhLW1vZGVsIHN1Y2ggYXNcblx0ICogXCJhdXRvXCIgYWR2ZXJ0aXNlcyBhIHplcm8tc2l6ZWQgd2luZG93LCBzbyBpdCByZXNvbHZlcyB0byBgdW5kZWZpbmVkYCBhbmQgdGhlIGNhbGxlciBmYWxscyBiYWNrIHRvIHRoZSBtb2RlbCB0aGF0XG5cdCAqIGFjdHVhbGx5IHNlcnZlZCB0aGUgcmVxdWVzdCAoc2VlIGlzc3VlICMzMjE3ODEpLlxuXHQgKi9cblx0cHJpdmF0ZSByZXNvbHZlQ29udGV4dFdpbmRvdyhtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IG1heE91dHB1dFRva2VuczogbnVtYmVyIHwgdW5kZWZpbmVkOyB0b3RhbENvbnRleHRXaW5kb3c6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1vZGVsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQpO1xuXHRcdC8vIENvbXB1dGluZyB0aGUgdG90YWwgY29udGV4dCB3aW5kb3cgbmVlZHMgdGhlIG1vZGVsJ3MgbWV0YWRhdGEsIG5vdGFibHkgaXRzIG91dHB1dC10b2tlbiBidWRnZXRcblx0XHQvLyAoYG1heE91dHB1dFRva2Vuc2ApLCB3aGljaCBcdTIwMTQgdW5saWtlIHRoZSBpbnB1dCB3aW5kb3cgXHUyMDE0IGhhcyBubyBjb25maWd1cmF0aW9uIGZhbGxiYWNrLiBSaWdodCBhZnRlciBhIHJlbG9hZCB0aGVcblx0XHQvLyBtb2RlbCBwcm92aWRlciBtYXkgbm90IGhhdmUgcmVnaXN0ZXJlZCB0aGUgc2VsZWN0ZWQgbW9kZWwgeWV0IHdoaWxlIGEgcGVyc2lzdGVkIGBjb250ZXh0U2l6ZWAgaXMgYWxyZWFkeVxuXHRcdC8vIHJlc29sdmFibGUsIHNvIHRoZSB3aW5kb3cgd291bGQgYmUgY29tcHV0ZWQgaW5wdXQtb25seSAoZS5nLiAyNzJLIGluc3RlYWQgb2YgMjcySyArIDEyOEsgZm9yIEdQVC01KS4gQmFpbCBvdXRcblx0XHQvLyB1bnRpbCBtZXRhZGF0YSBpcyBhdmFpbGFibGUgcmF0aGVyIHRoYW4gcmVuZGVyIGEgbWlzbGVhZGluZyBwYXJ0aWFsIHZhbHVlOyB0aGUgd2lkZ2V0IHJlLXJlbmRlcnMgb24gbW9kZWxcblx0XHQvLyByZWdpc3RyYXRpb24gKGBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzYCkgYW5kIG9uIG1vZGVsIHNlbGVjdGlvbi5cblx0XHRpZiAoIW1vZGVsTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsQ29uZmlndXJhdGlvbiA9IHRoaXMuX21vZGVsQ29uZmlndXJhdGlvblJlc29sdmVyPy4obW9kZWxJZCkgPz8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQpO1xuXHRcdC8vIFByZWZlciB0aGUgc2NoZW1hIGRlZmF1bHQgY29udGV4dC1zaXplIHRpZXIgd2hlbiBjb25maWcgaXMgbWlzc2luZyAoa2VlcHMgZGVub21pbmF0b3IgYWxpZ25lZCB3aXRoIHRoZSByZXF1ZXN0IHBhdGgpLlxuXHRcdGNvbnN0IG1heElucHV0VG9rZW5zID0gcmVzb2x2ZUNvbnRleHRXaW5kb3dJbnB1dFRva2Vucyhtb2RlbENvbmZpZ3VyYXRpb24sIG1vZGVsTWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYSwgbW9kZWxNZXRhZGF0YS5tYXhJbnB1dFRva2Vucyk7XG5cdFx0Y29uc3QgbWF4T3V0cHV0VG9rZW5zID0gbW9kZWxNZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnM7XG5cdFx0Y29uc3QgdG90YWxDb250ZXh0V2luZG93ID0gKG1heElucHV0VG9rZW5zID8/IDApICsgKG1heE91dHB1dFRva2VucyA/PyAwKTtcblx0XHRpZiAodG90YWxDb250ZXh0V2luZG93IDw9IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IG1heE91dHB1dFRva2VucywgdG90YWxDb250ZXh0V2luZG93IH07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZyb21SZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsLCBtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB1c2FnZSA9IHJlc3BvbnNlLnVzYWdlO1xuXG5cdFx0Ly8gV2hlbiBhIG1ldGEtbW9kZWwgKGUuZy4gXCJhdXRvXCIpIHJvdXRlcyB0byBhIGNvbmNyZXRlIG1vZGVsLCB0aGVcblx0XHQvLyB1c2FnZSByZXBvcnRzIHRoZSBhY3R1YWwgbW9kZWwgdGhhdCBzZXJ2ZWQgdGhlIHJlcXVlc3QuXG5cdFx0Y29uc3QgZWZmZWN0aXZlTW9kZWxJZCA9IHVzYWdlPy5hY3R1YWxNb2RlbElkID8/IG1vZGVsSWQ7XG5cblx0XHQvLyBUaGUgZGVub21pbmF0b3IgKGNvbnRleHQgd2luZG93KSBmb2xsb3dzIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgbW9kZWwgc28gc3dpdGNoaW5nIG1vZGVscyB1cGRhdGVzIHRoZSB3aWRnZXRcblx0XHQvLyBpbW1lZGlhdGVseTsgdGhlIG51bWVyYXRvciAodXNhZ2UpIHN0aWxsIGNvbWVzIGZyb20gdGhlIGxhc3QgcmVzcG9uc2UuIEEgbWV0YS1tb2RlbCBzdWNoIGFzIFwiYXV0b1wiIGhhcyBub1xuXHRcdC8vIGNvbnRleHQgd2luZG93IG9mIGl0cyBvd24sIHNvIGZhbGwgYmFjayB0byB0aGUgbW9kZWwgdGhhdCBhY3R1YWxseSBzZXJ2ZWQgdGhlIHJlcXVlc3QgKHNlZSBpc3N1ZSAjMzIxNzgxKS5cblx0XHRjb25zdCBjb250ZXh0V2luZG93ID0gdGhpcy5yZXNvbHZlQ29udGV4dFdpbmRvdyh0aGlzLl9zZWxlY3RlZE1vZGVsSWQpID8/IHRoaXMucmVzb2x2ZUNvbnRleHRXaW5kb3coZWZmZWN0aXZlTW9kZWxJZCk7XG5cdFx0aWYgKCF1c2FnZSB8fCAhY29udGV4dFdpbmRvdykge1xuXHRcdFx0aWYgKCF0aGlzLl9jdXJyZW50RGF0YS5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IG1heE91dHB1dFRva2VucywgdG90YWxDb250ZXh0V2luZG93IH0gPSBjb250ZXh0V2luZG93O1xuXG5cdFx0Y29uc3QgcHJvbXB0VG9rZW5zID0gdXNhZ2UucHJvbXB0VG9rZW5zO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25Ub2tlbnMgPSB1c2FnZS5jb21wbGV0aW9uVG9rZW5zO1xuXHRcdGNvbnN0IHByb21wdFRva2VuRGV0YWlscyA9IHVzYWdlLnByb21wdFRva2VuRGV0YWlscztcblx0XHRjb25zdCB1c2VkVG9rZW5zID0gcHJvbXB0VG9rZW5zICsgY29tcGxldGlvblRva2Vucztcblx0XHRjb25zdCBwZXJjZW50YWdlID0gKHVzZWRUb2tlbnMgLyB0b3RhbENvbnRleHRXaW5kb3cpICogMTAwO1xuXG5cdFx0Ly8gVGhlIHJlc2VydmUgYmFuZCBpcyBhIHByb3BlcnR5IG9mIHRoZSBtb2RlbCB0aGUgdXNlciBjdXJyZW50bHkgaGFzXG5cdFx0Ly8gc2VsZWN0ZWQgKGhvdyBtdWNoIG9mIGl0cyB3aW5kb3cgaXMgc2V0IGFzaWRlIGZvciBvdXRwdXQpLCBub3Qgb2YgdGhlXG5cdFx0Ly8gcGFzdCByZXNwb25zZSwgc28gaXQgaXMgZGVyaXZlZCBmcm9tIHRoZSBzZWxlY3RlZCBtb2RlbCdzIG1heCBvdXRwdXRcblx0XHQvLyB0b2tlbnMgcmF0aGVyIHRoYW4gYHVzYWdlYC4gUmVtYWluaW5nIHJlc2VydmUgPSB0aGF0IHJlc2VydmUgbWludXMgd2hhdFxuXHRcdC8vIGNvbXBsZXRpb25zIGhhdmUgYWxyZWFkeSBjb25zdW1lZDsgb25jZSBjb21wbGV0aW9ucyBleGNlZWQgaXQsIGl0IGRyb3BzXG5cdFx0Ly8gdG8gMC5cblx0XHRjb25zdCBvdXRwdXRCdWZmZXJQZXJjZW50YWdlID0gbWF4T3V0cHV0VG9rZW5zICE9PSB1bmRlZmluZWRcblx0XHRcdD8gKE1hdGgubWF4KDAsIG1heE91dHB1dFRva2VucyAtIGNvbXBsZXRpb25Ub2tlbnMpIC8gdG90YWxDb250ZXh0V2luZG93KSAqIDEwMFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnJlbmRlcih7XG5cdFx0XHR1c2VkVG9rZW5zLCBjb21wbGV0aW9uVG9rZW5zLCB0b3RhbENvbnRleHRXaW5kb3csXG5cdFx0XHRwZXJjZW50YWdlLCBvdXRwdXRCdWZmZXJQZXJjZW50YWdlLFxuXHRcdFx0cHJvbXB0VG9rZW5EZXRhaWxzLCBzZXNzaW9uQ29zdDogcmVzcG9uc2Uuc2Vzc2lvbi5zZXNzaW9uQ29zdCxcblx0XHR9KTtcblx0XHR0aGlzLnNob3coKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKGRhdGE6IElDaGF0Q29udGV4dFVzYWdlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnREYXRhLnNldChkYXRhLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gUGllIGNoYXJ0IHNob3dzIGFjdHVhbCB1c2FnZSBwZXJjZW50YWdlIG9ubHlcblx0XHR0aGlzLnByb2dyZXNzSW5kaWNhdG9yLnNldFByb2dyZXNzKGRhdGEucGVyY2VudGFnZSk7XG5cblx0XHQvLyBVcGRhdGUgcGVyY2VudGFnZSBsYWJlbCBhbmQgYXJpYS1sYWJlbCAoY2xhbXAgZGlzcGxheSB0byAxMDApXG5cdFx0Y29uc3Qgcm91bmRlZFBlcmNlbnRhZ2UgPSBNYXRoLm1pbigxMDAsIE1hdGgucm91bmQoZGF0YS5wZXJjZW50YWdlKSk7XG5cdFx0dGhpcy5wZXJjZW50YWdlTGFiZWwudGV4dENvbnRlbnQgPSBgJHtyb3VuZGVkUGVyY2VudGFnZX0lYDtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NvbnRleHRVc2FnZVBlcmNlbnRhZ2VMYWJlbCcsIFwiQ29udGV4dCB3aW5kb3cgdXNhZ2U6IHswfSVcIiwgcm91bmRlZFBlcmNlbnRhZ2UpKTtcblxuXHRcdC8vIENvbG9yIGJhc2VkIG9uIGFjdHVhbCB1c2FnZSBwZXJjZW50YWdlXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3dhcm5pbmcnLCAnZXJyb3InKTtcblx0XHRpZiAoZGF0YS5wZXJjZW50YWdlID49IDkwKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZXJyb3InKTtcblx0XHR9IGVsc2UgaWYgKGRhdGEucGVyY2VudGFnZSA+PSA3NSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3dhcm5pbmcnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faXNWaXNpYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxXQUFXLDZCQUE2QjtBQUdqRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQXNCLGlCQUFpQiwyQkFBMkI7QUFDbEUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUE0Qyw4QkFBOEI7QUFDMUUsU0FBUywrQkFBc0Q7QUFFL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBRXhCLE1BQU0sSUFBSSxJQUFJO0FBa0JQLFNBQVMsZ0NBQ2Ysb0JBQ0EscUJBQ0EsZ0JBQ3FCO0FBQ3JCLFFBQU0sd0JBQXdCLE9BQU8sb0JBQW9CLGdCQUFnQixXQUFXLG1CQUFtQixjQUFjO0FBQ3JILFFBQU0sMkJBQTJCLHFCQUFxQixZQUFZLGFBQWE7QUFDL0UsU0FBTywwQkFDRixPQUFPLDZCQUE2QixXQUFXLDJCQUEyQixXQUMzRTtBQUNMO0FBT08sU0FBUyx1QkFBdUIsR0FBc0MsR0FBK0M7QUFDM0gsTUFBSSxNQUFNLEdBQUc7QUFDWixX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
