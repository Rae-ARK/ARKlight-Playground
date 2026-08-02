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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../../workbench/common/contributions.js";
import { IChatPhoneInputPresenter } from "../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js";
import { getModelProviderIcon } from "../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js";
import { Menus } from "../../../../../browser/menus.js";
import { SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext } from "../../../../../common/contextkeys.js";
import { isAgentHostProvider, isAgentHostProviderId } from "../../../../../common/agentHostSessionsProvider.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../../../services/sessions/browser/sessionContext.js";
import { isWellKnownModeSchema } from "../agentHostPermissionPickerDelegate.js";
import { getAgentHostModeIcon } from "../agentHostModeIcon.js";
import { INewChatModelPickerService } from "../../../../chat/browser/newChatModelPicker.js";
import { ISessionModelSelectionModel } from "../../../../chat/browser/sessionModelSelectionModel.js";
import { reportNewChatPickerClosed } from "../../../../chat/browser/newChatPickerTelemetry.js";
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, matchesChatPhoneInputTarget } from "./mobileChatPhoneInputTarget.js";
const MOBILE_CHAT_INPUT_CONFIG_PICKER_ID = "sessions.agentHost.mobileChatInputConfigPicker";
let MobileChatInputConfigPicker = class extends Disposable {
  constructor(_session, _sessionsProvidersService, _telemetryService, _phonePresenter, _newChatModelPickerService, _selectionModel, _uriIdentityService) {
    super();
    this._session = _session;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._telemetryService = _telemetryService;
    this._phonePresenter = _phonePresenter;
    this._newChatModelPickerService = _newChatModelPickerService;
    this._selectionModel = _selectionModel;
    this._uriIdentityService = _uriIdentityService;
    this._renderDisposables = this._register(new DisposableStore());
    this._providerListeners = this._register(new DisposableMap());
    this._register(this._newChatModelPickerService.registerModelPicker({
      open: () => {
        void this._showSheet();
      },
      switchToModel: (modelIdentifier) => this._switchToModel(modelIdentifier)
    }));
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._selectionModel.state.read(reader);
      this._updateTrigger();
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders((e) => {
      for (const provider of e.removed) {
        this._providerListeners.deleteAndDispose(provider.id);
      }
      this._watchProviders(e.added);
      this._updateTrigger();
    }));
    this._watchProviders(this._sessionsProvidersService.getProviders());
  }
  /**
   * Subscribe to each agent-host provider's `onDidChangeSessionConfig`
   * so the button refreshes when the session's mode is mutated outside
   * the sheet (e.g. by a setting reload, schema re-resolve, or
   * another picker).
   */
  _watchProviders(providers) {
    for (const provider of providers) {
      if (this._providerListeners.has(provider.id)) {
        continue;
      }
      const resolved = this._sessionsProvidersService.getProvider(provider.id);
      if (!resolved || !isAgentHostProvider(resolved)) {
        continue;
      }
      this._providerListeners.set(provider.id, resolved.onDidChangeSessionConfig(() => this._updateTrigger()));
    }
  }
  render(container) {
    this._renderDisposables.clear();
    this._containerElement = container;
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-picker-slot-mobile-config"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    this._slotElement = slot;
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._showSheet();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this._showSheet();
      }
    }));
    this._updateTrigger();
  }
  _getContext() {
    const session = this._session.get();
    if (!session) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider || !isAgentHostProvider(provider)) {
      return void 0;
    }
    const config = provider.getSessionConfig(session.sessionId);
    const modeSchema = config?.schema.properties[SessionConfigKey.Mode];
    const modeItems = modeSchema && isWellKnownModeSchema(modeSchema) ? (modeSchema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: modeSchema.enumLabels?.[index] ?? String(value),
      description: modeSchema.enumDescriptions?.[index]
    })) : [];
    const rawCurrentMode = config?.values[SessionConfigKey.Mode] ?? modeSchema?.default;
    const currentMode = typeof rawCurrentMode === "string" && modeItems.some((i) => i.value === rawCurrentMode) ? rawCurrentMode : modeItems[0]?.value;
    const selectionState = this._selectionModel.state.get();
    const modelItems = selectionState.models;
    const currentModelId = selectionState.currentModel?.identifier;
    const showAutoModel = selectionState.options.showAutoModel;
    return { provider, session, modeItems, currentMode, modelItems, currentModelId, showAutoModel };
  }
  _updateTrigger() {
    if (!this._slotElement || !this._triggerElement || !this._containerElement) {
      return;
    }
    const ctx = this._getContext();
    if (!ctx || ctx.modeItems.length === 0 && ctx.modelItems.length === 0 && ctx.showAutoModel) {
      this._slotElement.style.display = "none";
      this._containerElement.style.display = "none";
      return;
    }
    this._slotElement.style.display = "";
    this._containerElement.style.display = "";
    dom.clearNode(this._triggerElement);
    const modeIcon = ctx.currentMode ? getAgentHostModeIcon(ctx.currentMode) : void 0;
    if (modeIcon) {
      dom.append(this._triggerElement, renderIcon(modeIcon));
    }
    const currentModel = ctx.currentModelId ? ctx.modelItems.find((m) => m.identifier === ctx.currentModelId) : void 0;
    if (currentModel) {
      dom.append(this._triggerElement, renderIcon(getModelProviderIcon(currentModel)));
    }
    const labelText = currentModel?.metadata.name ?? (ctx.showAutoModel ? localize("mobileChatInputConfigPicker.autoLabel", "Auto") : localize("mobileChatInputConfigPicker.noModelsLabel", "No models available"));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.chat-input-picker-label"));
    labelSpan.textContent = labelText;
    const ariaParts = [];
    if (ctx.currentMode) {
      const modeItem = ctx.modeItems.find((i) => i.value === ctx.currentMode);
      if (modeItem) {
        ariaParts.push(modeItem.label);
      }
    }
    ariaParts.push(labelText);
    this._triggerElement.ariaLabel = localize(
      "mobileChatInputConfigPicker.triggerAriaLabel",
      "Pick Mode and Model, {0}",
      ariaParts.join(", ")
    );
    const isResolving = ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get();
    this._slotElement.classList.toggle("disabled", isResolving);
    this._triggerElement.setAttribute("aria-disabled", isResolving ? "true" : "false");
  }
  _switchToModel(modelIdentifier) {
    return this._selectionModel.selectModel(modelIdentifier);
  }
  async _showSheet() {
    if (!this._triggerElement) {
      return;
    }
    const ctx = this._getContext();
    if (ctx && ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get()) {
      return;
    }
    const trigger = this._triggerElement;
    const beforeCtx = ctx;
    const target = createChatPhoneInputTarget(createChatPhoneInputSessionContext(beforeCtx?.session), this._uriIdentityService);
    const beforeMode = beforeCtx?.currentMode;
    const beforeModeItem = beforeCtx?.modeItems.find((i) => i.value === beforeMode);
    const beforeModelId = beforeCtx?.currentModelId;
    const beforeModel = beforeModelId ? beforeCtx?.modelItems.find((m) => m.identifier === beforeModelId) : void 0;
    trigger.setAttribute("aria-expanded", "true");
    try {
      await this._phonePresenter.showCombinedModeAndModelSheet(trigger, {
        kind: "session",
        getSessionContext: () => createChatPhoneInputSessionContext(this._session.get()),
        selectModel: (modelIdentifier) => this._switchToModel(modelIdentifier)
      });
      const afterCtx = this._getContext();
      if (beforeCtx && afterCtx && matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(afterCtx.session), this._uriIdentityService)) {
        if (beforeCtx.modeItems.length > 0) {
          const afterMode = afterCtx.currentMode;
          const afterModeItem = afterCtx.modeItems.find((i) => i.value === afterMode);
          reportNewChatPickerClosed(this._telemetryService, {
            id: "NewChatMobileChatInputConfigPicker",
            name: "NewChatMobileChatInputConfigPicker.mode",
            optionIdBefore: beforeMode,
            optionIdAfter: afterMode,
            optionLabelBefore: beforeModeItem?.label ?? beforeMode,
            optionLabelAfter: afterModeItem?.label ?? afterMode,
            isPII: false
          });
        }
        if (beforeCtx.modelItems.length > 0) {
          const afterModelId = afterCtx.currentModelId;
          const afterModel = afterModelId ? afterCtx.modelItems.find((m) => m.identifier === afterModelId) : void 0;
          reportNewChatPickerClosed(this._telemetryService, {
            id: "NewChatMobileChatInputConfigPicker",
            name: "NewChatMobileChatInputConfigPicker.model",
            optionIdBefore: beforeModelId,
            optionIdAfter: afterModelId,
            optionLabelBefore: beforeModel?.metadata.name,
            optionLabelAfter: afterModel?.metadata.name,
            isPII: false
          });
        }
      }
    } finally {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  }
};
MobileChatInputConfigPicker = __decorateClass([
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatPhoneInputPresenter),
  __decorateParam(4, INewChatModelPickerService),
  __decorateParam(5, ISessionModelSelectionModel),
  __decorateParam(6, IUriIdentityService)
], MobileChatInputConfigPicker);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
      title: localize2("mobileChatInputConfigPicker", "Mode and Model"),
      f1: false,
      menu: [{
        id: Menus.NewSessionConfig,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext)
      }]
    });
  }
  async run() {
  }
});
let MobileChatInputConfigPickerContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, sessionsService, contextKeyService) {
    super();
    const usesCombinedPicker = SessionUsesCombinedConfigPickerContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      const session = sessionsService.activeSession.read(reader);
      usesCombinedPicker.set(!!session && isAgentHostProviderId(session.providerId));
    }));
    this._register(actionViewItemService.register(
      Menus.NewSessionConfig,
      MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        const picker = scopedInstantiationService.createInstance(MobileChatInputConfigPicker, session);
        return new MobileChatInputConfigPickerActionViewItem(picker);
      }
    ));
  }
};
MobileChatInputConfigPickerContribution.ID = "sessions.contrib.mobileChatInputConfigPicker";
MobileChatInputConfigPickerContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IContextKeyService)
], MobileChatInputConfigPickerContribution);
class MobileChatInputConfigPickerActionViewItem extends BaseActionViewItem {
  constructor(_picker) {
    super(void 0, { id: "", label: "", enabled: true, class: void 0, tooltip: "", run: () => {
    } });
    this._picker = _picker;
  }
  render(container) {
    this._picker.render(container);
    container.classList.add("chat-input-picker-item");
  }
  dispose() {
    this._picker.dispose();
    super.dispose();
  }
}
registerWorkbenchContribution2(MobileChatInputConfigPickerContribution.ID, MobileChatInputConfigPickerContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL21vYmlsZS9tb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IHR5cGUgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRQaG9uZUlucHV0UHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBnZXRNb2RlbFByb3ZpZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQcm92aWRlckljb25zLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVXNlc0NvbWJpbmVkQ29uZmlnUGlja2VyQ29udGV4dCwgSXNQaG9uZUxheW91dENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgaXNBZ2VudEhvc3RQcm92aWRlciwgaXNBZ2VudEhvc3RQcm92aWRlcklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBpc1dlbGxLbm93bk1vZGVTY2hlbWEgfSBmcm9tICcuLi9hZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRIb3N0TW9kZUljb24gfSBmcm9tICcuLi9hZ2VudEhvc3RNb2RlSWNvbi5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9uZXdDaGF0TW9kZWxQaWNrZXIuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdFBpY2tlclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDaGF0UGhvbmVJbnB1dFNlc3Npb25Db250ZXh0LCBjcmVhdGVDaGF0UGhvbmVJbnB1dFRhcmdldCwgbWF0Y2hlc0NoYXRQaG9uZUlucHV0VGFyZ2V0IH0gZnJvbSAnLi9tb2JpbGVDaGF0UGhvbmVJbnB1dFRhcmdldC5qcyc7XG5cbmNvbnN0IE1PQklMRV9DSEFUX0lOUFVUX0NPTkZJR19QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0Lm1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcic7XG5cbmludGVyZmFjZSBJTW9iaWxlQ29uZmlnQ29udGV4dCB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb247XG5cdHJlYWRvbmx5IG1vZGVJdGVtczogcmVhZG9ubHkgeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9W107XG5cdHJlYWRvbmx5IGN1cnJlbnRNb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1vZGVsSXRlbXM6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdO1xuXHRyZWFkb25seSBjdXJyZW50TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzaG93QXV0b01vZGVsOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFBob25lLW9ubHkgY2hhdCBpbnB1dCBjb25maWcgcGlja2VyIHRoYXQgY29tYmluZXMgdGhlIE1vZGUgYW5kIE1vZGVsXG4gKiBwaWNrZXJzIGludG8gb25lIGNvbXBhY3QgYnV0dG9uIHRoYXQgb3BlbnMgYSB1bmlmaWVkIGJvdHRvbSBzaGVldC5cbiAqXG4gKiBEZXNrdG9wIHJlbmRlcnMgTW9kZSBhbmQgTW9kZWwgYXMgdHdvIHNlcGFyYXRlIHBpY2tlcnMgaW4gdGhlIGlucHV0XG4gKiB0b29sYmFyIChzZWUge0BsaW5rIEFnZW50SG9zdE1vZGVQaWNrZXJ9IGFuZCB0aGUgc2Vzc2lvbnMtY29yZSBtb2RlbFxuICogcGlja2VyKS4gT24gcGhvbmUgdGhvc2UgdHdvIGRlc2t0b3AgcGlja2VycyBhcmVcbiAqIGdhdGVkIG9mZiB2aWEgYHdoZW46IElzUGhvbmVMYXlvdXRDb250ZXh0Lm5lZ2F0ZSgpYCBhbmQgdGhpcyBzaW5nbGVcbiAqIGNvbWJpbmVkIHBpY2tlciB0YWtlcyB0aGVpciBzbG90IFx1MjAxNCBzYW1lIGRhdGEsIGRpZmZlcmVudCBwcmVzZW50YXRpb24sXG4gKiBtYXRjaGluZyB0aGUgTU9CSUxFLm1kIGNvcmUgcHJpbmNpcGxlLlxuICpcbiAqIFRoZSB0cmlnZ2VyIGxhYmVsIHNob3dzIHRoZSBjdXJyZW50IG1vZGVsIG5hbWUgKGUuZy4gXCJBdXRvXCIpIHNvIHRoZVxuICogdXNlciBpbW1lZGlhdGVseSBzZWVzIHRoZSBtb3N0IHJlbGV2YW50IGNvbmZpZ3VyYXRpb247IHRoZSBtb2RlIGlzXG4gKiBzdXJmYWNlZCBhcyB0aGUgYnV0dG9uJ3MgbGVhZGluZyBpY29uIHdoZW4gb25lIGlzIHNlbGVjdGVkLiBUYXBwaW5nXG4gKiBvcGVucyBhIHNoZWV0IHdpdGggdHdvIHNlY3Rpb25zOiBBZ2VudCBNb2RlIChJbnRlcmFjdGl2ZSAvIFBsYW4gL1xuICogQXV0b3BpbG90IHdoZW4gYXBwbGljYWJsZSkgYW5kIE1vZGVsICh0aGUgbW9kZWwgbGlzdCBmaWx0ZXJlZCBieSB0aGVcbiAqIGFjdGl2ZSBzZXNzaW9uJ3MgcmVzb3VyY2Ugc2NoZW1lKS5cbiAqL1xuY2xhc3MgTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgX2NvbnRhaW5lckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zbG90RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4sXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRQaG9uZUlucHV0UHJlc2VudGVyIHByaXZhdGUgcmVhZG9ubHkgX3Bob25lUHJlc2VudGVyOiBJQ2hhdFBob25lSW5wdXRQcmVzZW50ZXIsXG5cdFx0QElOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2U6IElOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwgcHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uTW9kZWw6IElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZS5yZWdpc3Rlck1vZGVsUGlja2VyKHtcblx0XHRcdG9wZW46ICgpID0+IHsgdm9pZCB0aGlzLl9zaG93U2hlZXQoKTsgfSxcblx0XHRcdHN3aXRjaFRvTW9kZWw6IG1vZGVsSWRlbnRpZmllciA9PiB0aGlzLl9zd2l0Y2hUb01vZGVsKG1vZGVsSWRlbnRpZmllciksXG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHRoZSB0cmlnZ2VyIHdoZW5ldmVyIHRoZSBhY3RpdmUgc2Vzc2lvbiwgaXRzIGNvbmZpZyxcblx0XHQvLyBpdHMgbW9kZWwsIG9yIHRoZSBhdmFpbGFibGUgbGFuZ3VhZ2UgbW9kZWxzIGNoYW5nZS4gVGhlXG5cdFx0Ly8gVGhlIGlucHV0LXNjb3BlZCBzZWxlY3Rpb24gbW9kZWwgb3ducyBtb2RlbCBpbml0aWFsaXphdGlvbiBldmVuIHdoZW5cblx0XHQvLyB0aGUgZGVza3RvcCBwaWNrZXIgaXMgZ2F0ZWQgb2ZmLCBzbyB0aGlzIHN1cmZhY2Ugb25seSByZW5kZXJzIGl0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uTW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5kZWxldGVBbmREaXNwb3NlKHByb3ZpZGVyLmlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dhdGNoUHJvdmlkZXJzKGUuYWRkZWQpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl93YXRjaFByb3ZpZGVycyh0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1YnNjcmliZSB0byBlYWNoIGFnZW50LWhvc3QgcHJvdmlkZXIncyBgb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnYFxuXHQgKiBzbyB0aGUgYnV0dG9uIHJlZnJlc2hlcyB3aGVuIHRoZSBzZXNzaW9uJ3MgbW9kZSBpcyBtdXRhdGVkIG91dHNpZGVcblx0ICogdGhlIHNoZWV0IChlLmcuIGJ5IGEgc2V0dGluZyByZWxvYWQsIHNjaGVtYSByZS1yZXNvbHZlLCBvclxuXHQgKiBhbm90aGVyIHBpY2tlcikuXG5cdCAqL1xuXHRwcml2YXRlIF93YXRjaFByb3ZpZGVycyhwcm92aWRlcnM6IHJlYWRvbmx5IHsgaWQ6IHN0cmluZyB9W10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHByb3ZpZGVycykge1xuXHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLmhhcyhwcm92aWRlci5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIXJlc29sdmVkIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHJlc29sdmVkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLnNldChwcm92aWRlci5pZCwgcmVzb2x2ZWQub25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnKCgpID0+IHRoaXMuX3VwZGF0ZVRyaWdnZXIoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9jb250YWluZXJFbGVtZW50ID0gY29udGFpbmVyO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3Quc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdC1tb2JpbGUtY29uZmlnJykpO1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNsb3QucmVtb3ZlKCkgfSk7XG5cdFx0dGhpcy5fc2xvdEVsZW1lbnQgPSBzbG90O1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJ2EuYWN0aW9uLWxhYmVsJykpO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50ID0gdHJpZ2dlcjtcblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChHZXN0dXJlLmFkZFRhcmdldCh0cmlnZ2VyKSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9zaG93U2hlZXQoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1NoZWV0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29udGV4dCgpOiBJTW9iaWxlQ29uZmlnQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIWlzQWdlbnRIb3N0UHJvdmlkZXIocHJvdmlkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE1vZGUgKG9wdGlvbmFsIFx1MjAxNCBhZ2VudCBtYXkgbm90IGFkdmVydGlzZSBhIHdlbGwta25vd24gc2NoZW1hKVxuXHRcdGNvbnN0IGNvbmZpZyA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IG1vZGVTY2hlbWEgPSBjb25maWc/LnNjaGVtYS5wcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuTW9kZV07XG5cdFx0Y29uc3QgbW9kZUl0ZW1zID0gKG1vZGVTY2hlbWEgJiYgaXNXZWxsS25vd25Nb2RlU2NoZW1hKG1vZGVTY2hlbWEpKVxuXHRcdFx0PyAobW9kZVNjaGVtYS5lbnVtID8/IFtdKS5tYXAoKHZhbHVlLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0dmFsdWU6IFN0cmluZyh2YWx1ZSksXG5cdFx0XHRcdGxhYmVsOiBtb2RlU2NoZW1hLmVudW1MYWJlbHM/LltpbmRleF0gPz8gU3RyaW5nKHZhbHVlKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG1vZGVTY2hlbWEuZW51bURlc2NyaXB0aW9ucz8uW2luZGV4XSxcblx0XHRcdH0pKVxuXHRcdFx0OiBbXTtcblx0XHRjb25zdCByYXdDdXJyZW50TW9kZSA9IGNvbmZpZz8udmFsdWVzW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPz8gbW9kZVNjaGVtYT8uZGVmYXVsdDtcblx0XHRjb25zdCBjdXJyZW50TW9kZSA9ICh0eXBlb2YgcmF3Q3VycmVudE1vZGUgPT09ICdzdHJpbmcnICYmIG1vZGVJdGVtcy5zb21lKGkgPT4gaS52YWx1ZSA9PT0gcmF3Q3VycmVudE1vZGUpKVxuXHRcdFx0PyByYXdDdXJyZW50TW9kZVxuXHRcdFx0OiBtb2RlSXRlbXNbMF0/LnZhbHVlO1xuXG5cdFx0Ly8gTW9kZWxcblx0XHRjb25zdCBzZWxlY3Rpb25TdGF0ZSA9IHRoaXMuX3NlbGVjdGlvbk1vZGVsLnN0YXRlLmdldCgpO1xuXHRcdGNvbnN0IG1vZGVsSXRlbXMgPSBzZWxlY3Rpb25TdGF0ZS5tb2RlbHM7XG5cdFx0Y29uc3QgY3VycmVudE1vZGVsSWQgPSBzZWxlY3Rpb25TdGF0ZS5jdXJyZW50TW9kZWw/LmlkZW50aWZpZXI7XG5cdFx0Y29uc3Qgc2hvd0F1dG9Nb2RlbCA9IHNlbGVjdGlvblN0YXRlLm9wdGlvbnMuc2hvd0F1dG9Nb2RlbDtcblxuXHRcdHJldHVybiB7IHByb3ZpZGVyLCBzZXNzaW9uLCBtb2RlSXRlbXMsIGN1cnJlbnRNb2RlLCBtb2RlbEl0ZW1zLCBjdXJyZW50TW9kZWxJZCwgc2hvd0F1dG9Nb2RlbCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVHJpZ2dlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Nsb3RFbGVtZW50IHx8ICF0aGlzLl90cmlnZ2VyRWxlbWVudCB8fCAhdGhpcy5fY29udGFpbmVyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX2dldENvbnRleHQoKTtcblx0XHQvLyBIaWRlIHRoZSBidXR0b24gd2hlbiB0aGVyZSdzIG5vdGhpbmcgdG8gcGljayAobm8gbW9kZSBBTkQgbm9cblx0XHQvLyBtb2RlbHMpLiBJbiB0aGF0IHN0YXRlIHRoZSB0b29sYmFyIGlzIG1vcmUgY29tcGFjdCByYXRoZXIgdGhhblxuXHRcdC8vIHNob3dpbmcgYSBuby1vcCB0cmlnZ2VyLiBBbHNvIGNvbGxhcHNlIHRoZSB3cmFwcGluZ1xuXHRcdC8vIGAuYWN0aW9uLWl0ZW1gIHRoYXQgYE1lbnVXb3JrYmVuY2hUb29sQmFyYCBjcmVhdGVkIFx1MjAxNCBoaWRpbmdcblx0XHQvLyBvbmx5IHRoZSBpbm5lciBzbG90IGxlYXZlcyB0aGUgd3JhcHBlciBvY2N1cHlpbmcgaXRzXG5cdFx0Ly8gYG1pbi13aWR0aGAgZmxvb3IgYW5kIHByb2R1Y2VzIGEgdmlzaWJsZSBlbXB0eSBnYXAuXG5cdFx0aWYgKCFjdHggfHwgKGN0eC5tb2RlSXRlbXMubGVuZ3RoID09PSAwICYmIGN0eC5tb2RlbEl0ZW1zLmxlbmd0aCA9PT0gMCAmJiBjdHguc2hvd0F1dG9Nb2RlbCkpIHtcblx0XHRcdHRoaXMuX3Nsb3RFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9jb250YWluZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nsb3RFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLl9jb250YWluZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXG5cdFx0Ly8gTGVhZGluZyBpY29uOiB0aGUgY3VycmVudCBtb2RlJ3MgaWNvbiBpZiBhIG1vZGUgaXMgc2VsZWN0ZWQsXG5cdFx0Ly8gb3RoZXJ3aXNlIG5vdGhpbmcuXG5cdFx0Y29uc3QgbW9kZUljb24gPSBjdHguY3VycmVudE1vZGUgPyBnZXRBZ2VudEhvc3RNb2RlSWNvbihjdHguY3VycmVudE1vZGUpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChtb2RlSWNvbikge1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihtb2RlSWNvbikpO1xuXHRcdH1cblxuXHRcdC8vIExhYmVsOiB0aGUgY3VycmVudCBtb2RlbCBuYW1lIChvciBcIkF1dG9cIiBwbGFjZWhvbGRlciB3aGVuIG5vXG5cdFx0Ly8gbW9kZWwgaXMgYXZhaWxhYmxlKS4gTW9kZSBpcyBzdXJmYWNlZCB2aWEgdGhlIGljb24sIG5vdFxuXHRcdC8vIGR1cGxpY2F0ZWQgaW4gdGhlIGxhYmVsLCB0byBrZWVwIHRoZSBidXR0b24gY29tcGFjdC5cblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSBjdHguY3VycmVudE1vZGVsSWRcblx0XHRcdD8gY3R4Lm1vZGVsSXRlbXMuZmluZChtID0+IG0uaWRlbnRpZmllciA9PT0gY3R4LmN1cnJlbnRNb2RlbElkKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGN1cnJlbnRNb2RlbCkge1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgcmVuZGVySWNvbihnZXRNb2RlbFByb3ZpZGVySWNvbihjdXJyZW50TW9kZWwpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsVGV4dCA9IGN1cnJlbnRNb2RlbD8ubWV0YWRhdGEubmFtZVxuXHRcdFx0Pz8gKGN0eC5zaG93QXV0b01vZGVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlci5hdXRvTGFiZWwnLCBcIkF1dG9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyLm5vTW9kZWxzTGFiZWwnLCBcIk5vIG1vZGVscyBhdmFpbGFibGVcIikpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJykpO1xuXHRcdGxhYmVsU3Bhbi50ZXh0Q29udGVudCA9IGxhYmVsVGV4dDtcblxuXHRcdGNvbnN0IGFyaWFQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoY3R4LmN1cnJlbnRNb2RlKSB7XG5cdFx0XHRjb25zdCBtb2RlSXRlbSA9IGN0eC5tb2RlSXRlbXMuZmluZChpID0+IGkudmFsdWUgPT09IGN0eC5jdXJyZW50TW9kZSk7XG5cdFx0XHRpZiAobW9kZUl0ZW0pIHtcblx0XHRcdFx0YXJpYVBhcnRzLnB1c2gobW9kZUl0ZW0ubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhcmlhUGFydHMucHVzaChsYWJlbFRleHQpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LmFyaWFMYWJlbCA9IGxvY2FsaXplKFxuXHRcdFx0J21vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlci50cmlnZ2VyQXJpYUxhYmVsJyxcblx0XHRcdFwiUGljayBNb2RlIGFuZCBNb2RlbCwgezB9XCIsXG5cdFx0XHRhcmlhUGFydHMuam9pbignLCAnKSxcblx0XHQpO1xuXG5cdFx0Ly8gU2hlZXQncyBtb2RlIHJvdyB3cml0ZXMgdGhyb3VnaCBgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlYCwgc29cblx0XHQvLyBkaXNhYmxlIHRoZSBidXR0b24gd2hpbGUgYSByZXNvbHZlIGlzIGluIGZsaWdodC5cblx0XHRjb25zdCBpc1Jlc29sdmluZyA9IGN0eC5wcm92aWRlci5pc1Nlc3Npb25Db25maWdSZXNvbHZpbmcoY3R4LnNlc3Npb24uc2Vzc2lvbklkKS5nZXQoKTtcblx0XHR0aGlzLl9zbG90RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGlzUmVzb2x2aW5nKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBpc1Jlc29sdmluZyA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3dpdGNoVG9Nb2RlbChtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3Rpb25Nb2RlbC5zZWxlY3RNb2RlbChtb2RlbElkZW50aWZpZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1NoZWV0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdHJpZ2dlckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2hlZXQncyBtb2RlIHJvdyB3cml0ZXMgdGhyb3VnaCBgc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlYDsgdGhlXG5cdFx0Ly8gYnV0dG9uIHJldGFpbnMgaXRzIHRhcCB0YXJnZXQgd2hpbGUgdmlzdWFsbHkgZGlzYWJsZWQsIHNvXG5cdFx0Ly8gZ3VhcmQgZXhwbGljaXRseS5cblx0XHRjb25zdCBjdHggPSB0aGlzLl9nZXRDb250ZXh0KCk7XG5cdFx0aWYgKGN0eCAmJiBjdHgucHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKGN0eC5zZXNzaW9uLnNlc3Npb25JZCkuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRGVsZWdhdGUgc2hlZXQgY29uc3RydWN0aW9uIHRvIHRoZSBzaGFyZWQgcGhvbmUgcHJlc2VudGVyIHNvXG5cdFx0Ly8gdGhlIG5ldy1zZXNzaW9uIGFuZCBvcGVuZWQtY2hhdCBidXR0b25zIHJlbmRlciB0aGUgZXhhY3Rcblx0XHQvLyBzYW1lIE1vZGUgKyBNb2RlbCByb3dzLiBUaGUgcHJlc2VudGVyJ3MgYWdlbnQtaG9zdCBicmFuY2hcblx0XHQvLyByZWFkcyB0aGUgYWN0aXZlIHNlc3Npb24ncyBwcm92aWRlci1vd25lZCBjb25maWcgYW5kIG1vZGVscy5cblx0XHRjb25zdCB0cmlnZ2VyID0gdGhpcy5fdHJpZ2dlckVsZW1lbnQ7XG5cdFx0Y29uc3QgYmVmb3JlQ3R4ID0gY3R4O1xuXHRcdGNvbnN0IHRhcmdldCA9IGNyZWF0ZUNoYXRQaG9uZUlucHV0VGFyZ2V0KGNyZWF0ZUNoYXRQaG9uZUlucHV0U2Vzc2lvbkNvbnRleHQoYmVmb3JlQ3R4Py5zZXNzaW9uKSwgdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCBiZWZvcmVNb2RlID0gYmVmb3JlQ3R4Py5jdXJyZW50TW9kZTtcblx0XHRjb25zdCBiZWZvcmVNb2RlSXRlbSA9IGJlZm9yZUN0eD8ubW9kZUl0ZW1zLmZpbmQoaSA9PiBpLnZhbHVlID09PSBiZWZvcmVNb2RlKTtcblx0XHRjb25zdCBiZWZvcmVNb2RlbElkID0gYmVmb3JlQ3R4Py5jdXJyZW50TW9kZWxJZDtcblx0XHRjb25zdCBiZWZvcmVNb2RlbCA9IGJlZm9yZU1vZGVsSWQgPyBiZWZvcmVDdHg/Lm1vZGVsSXRlbXMuZmluZChtID0+IG0uaWRlbnRpZmllciA9PT0gYmVmb3JlTW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9waG9uZVByZXNlbnRlci5zaG93Q29tYmluZWRNb2RlQW5kTW9kZWxTaGVldCh0cmlnZ2VyLCB7XG5cdFx0XHRcdGtpbmQ6ICdzZXNzaW9uJyxcblx0XHRcdFx0Z2V0U2Vzc2lvbkNvbnRleHQ6ICgpID0+IGNyZWF0ZUNoYXRQaG9uZUlucHV0U2Vzc2lvbkNvbnRleHQodGhpcy5fc2Vzc2lvbi5nZXQoKSksXG5cdFx0XHRcdHNlbGVjdE1vZGVsOiBtb2RlbElkZW50aWZpZXIgPT4gdGhpcy5fc3dpdGNoVG9Nb2RlbChtb2RlbElkZW50aWZpZXIpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlckN0eCA9IHRoaXMuX2dldENvbnRleHQoKTtcblx0XHRcdGlmIChiZWZvcmVDdHggJiYgYWZ0ZXJDdHggJiYgbWF0Y2hlc0NoYXRQaG9uZUlucHV0VGFyZ2V0KHRhcmdldCwgY3JlYXRlQ2hhdFBob25lSW5wdXRTZXNzaW9uQ29udGV4dChhZnRlckN0eC5zZXNzaW9uKSwgdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlKSkge1xuXHRcdFx0XHRpZiAoYmVmb3JlQ3R4Lm1vZGVJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJNb2RlID0gYWZ0ZXJDdHguY3VycmVudE1vZGU7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJNb2RlSXRlbSA9IGFmdGVyQ3R4Lm1vZGVJdGVtcy5maW5kKGkgPT4gaS52YWx1ZSA9PT0gYWZ0ZXJNb2RlKTtcblx0XHRcdFx0XHRyZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGlkOiAnTmV3Q2hhdE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcicsXG5cdFx0XHRcdFx0XHRuYW1lOiAnTmV3Q2hhdE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlci5tb2RlJyxcblx0XHRcdFx0XHRcdG9wdGlvbklkQmVmb3JlOiBiZWZvcmVNb2RlLFxuXHRcdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogYWZ0ZXJNb2RlLFxuXHRcdFx0XHRcdFx0b3B0aW9uTGFiZWxCZWZvcmU6IGJlZm9yZU1vZGVJdGVtPy5sYWJlbCA/PyBiZWZvcmVNb2RlLFxuXHRcdFx0XHRcdFx0b3B0aW9uTGFiZWxBZnRlcjogYWZ0ZXJNb2RlSXRlbT8ubGFiZWwgPz8gYWZ0ZXJNb2RlLFxuXHRcdFx0XHRcdFx0aXNQSUk6IGZhbHNlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChiZWZvcmVDdHgubW9kZWxJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJNb2RlbElkID0gYWZ0ZXJDdHguY3VycmVudE1vZGVsSWQ7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJNb2RlbCA9IGFmdGVyTW9kZWxJZCA/IGFmdGVyQ3R4Lm1vZGVsSXRlbXMuZmluZChtID0+IG0uaWRlbnRpZmllciA9PT0gYWZ0ZXJNb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGlkOiAnTmV3Q2hhdE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcicsXG5cdFx0XHRcdFx0XHRuYW1lOiAnTmV3Q2hhdE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlci5tb2RlbCcsXG5cdFx0XHRcdFx0XHRvcHRpb25JZEJlZm9yZTogYmVmb3JlTW9kZWxJZCxcblx0XHRcdFx0XHRcdG9wdGlvbklkQWZ0ZXI6IGFmdGVyTW9kZWxJZCxcblx0XHRcdFx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiBiZWZvcmVNb2RlbD8ubWV0YWRhdGEubmFtZSxcblx0XHRcdFx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IGFmdGVyTW9kZWw/Lm1ldGFkYXRhLm5hbWUsXG5cdFx0XHRcdFx0XHRpc1BJSTogZmFsc2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdHRyaWdnZXIuZm9jdXMoKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBY3Rpb24gd3JhcHBlciBmb3IgdGhlIG1vYmlsZSBjaGF0LWlucHV0IGNvbmZpZyBwaWNrZXIuIEhhcyBubyBmMVxuICogc3VyZmFjZSBhbmQgaXMgZ2F0ZWQgb24gcGhvbmUgbGF5b3V0ICsgYW4gYWN0aXZlIGFnZW50LWhvc3Qgc2Vzc2lvbi5cbiAqIE9yZGVyIG1hdGNoZXMgdGhlIGV4aXN0aW5nIGRlc2t0b3AgbW9kZSBwaWNrZXIgKDApIHNvIHRoZSBidXR0b24gbGFuZHNcbiAqIGluIHRoZSBzYW1lIHRvb2xiYXIgc2xvdC5cbiAqL1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNT0JJTEVfQ0hBVF9JTlBVVF9DT05GSUdfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyJywgXCJNb2RlIGFuZCBNb2RlbFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5OZXdTZXNzaW9uQ29uZmlnLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFNlc3Npb25Vc2VzQ29tYmluZWRDb25maWdQaWNrZXJDb250ZXh0LCBJc1Bob25lTGF5b3V0Q29udGV4dCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7IH1cbn0pO1xuXG4vKipcbiAqIFdvcmtiZW5jaCBjb250cmlidXRpb24gdGhhdCB3aXJlcyB0aGUge0BsaW5rIE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcn1cbiAqIGludG8gdGhlIG5ldy1zZXNzaW9uIGNvbmZpZyB0b29sYmFyLiBSZWdpc3RlcnMgYW4gYWN0aW9uIHZpZXcgaXRlbVxuICogZmFjdG9yeSBmb3IgdGhlIG1vYmlsZS1vbmx5IGNvbW1hbmQgaWQ7IHRoZSBhY3Rpb24ncyBgd2hlbmAgY2xhdXNlXG4gKiAoYWJvdmUpIGVuc3VyZXMgdGhlIHBpY2tlciBpcyBvbmx5IGRpc3BsYXllZCBvbiBwaG9uZSBsYXlvdXRzLiBPblxuICogZGVza3RvcCwgdGhlIGV4aXN0aW5nIG1vZGUgYW5kIHNlc3Npb25zLWNvcmUgbW9kZWwgcGlja2VyIHJlZ2lzdHJhdGlvbnNcbiAqIHByb3ZpZGUgdGhlIHRvb2xiYXIgaXRlbXMgYXMgYmVmb3JlLlxuICovXG5jbGFzcyBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmNvbnRyaWIubW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBUaGUgYWdlbnQgaG9zdCBvd25zIHRoZSBcImNvbWJpbmVkIGNvbmZpZyBwaWNrZXJcIiBkZWNpc2lvbjogb24gcGhvbmVcblx0XHQvLyBsYXlvdXRzIGl0IHJlcGxhY2VzIHRoZSBzdGFuZGFsb25lIG1vZGUgKyBtb2RlbCBwaWNrZXJzIHdpdGggYSBzaW5nbGVcblx0XHQvLyBib3R0b20gc2hlZXQuIFB1Ymxpc2ggdGhpcyBhcyBhIG5ldXRyYWwgY29udGV4dCBrZXkgc28gdGhlIGNvcmUgbW9kZWxcblx0XHQvLyBwaWNrZXIgY2FuIGdhdGUgaXRzZWxmIG91dCB3aXRob3V0IGRlcGVuZGluZyBvbiBhZ2VudC1ob3N0IGlkZW50aXR5LlxuXHRcdGNvbnN0IHVzZXNDb21iaW5lZFBpY2tlciA9IFNlc3Npb25Vc2VzQ29tYmluZWRDb25maWdQaWNrZXJDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHVzZXNDb21iaW5lZFBpY2tlci5zZXQoISFzZXNzaW9uICYmIGlzQWdlbnRIb3N0UHJvdmlkZXJJZChzZXNzaW9uLnByb3ZpZGVySWQpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXG5cdFx0XHRNZW51cy5OZXdTZXNzaW9uQ29uZmlnLFxuXHRcdFx0TU9CSUxFX0NIQVRfSU5QVVRfQ09ORklHX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdGNvbnN0IHBpY2tlciA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlciwgc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiBuZXcgTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyQWN0aW9uVmlld0l0ZW0ocGlja2VyKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdH1cbn1cblxuY2xhc3MgTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9waWNrZXI6IE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcikge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgeyBpZDogJycsIGxhYmVsOiAnJywgZW5hYmxlZDogdHJ1ZSwgY2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogJycsIHJ1bjogKCkgPT4geyB9IH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9waWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtaW5wdXQtcGlja2VyLWl0ZW0nKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGlja2VyLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbi5JRCwgTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVksZUFBZSx1QkFBdUI7QUFDM0QsU0FBUyxlQUE0QjtBQUNyQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBQ25ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFFdkYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsd0NBQXdDLDRCQUE0QjtBQUM3RSxTQUEwQyxxQkFBcUIsNkJBQTZCO0FBRTVGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FB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
