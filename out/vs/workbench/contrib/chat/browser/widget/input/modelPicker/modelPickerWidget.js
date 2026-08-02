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
import "./media/modelPicker.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { getBaseLayerHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { disposableTimeout } from "../../../../../../../base/common/async.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IOpenerService } from "../../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../../platform/storage/common/storage.js";
import { TelemetryTrustedValue } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
import { chatRequiresSetup, IChatEntitlementService } from "../../../../../../services/chat/common/chatEntitlementService.js";
import { CHAT_SETUP_ACTION_ID } from "../../../actions/chatActions.js";
import { IUriIdentityService } from "../../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IUpdateService } from "../../../../../../../platform/update/common/update.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
import { withChatInputPickerMotion } from "../chatInputPickerActionItem.js";
import { buildModelPickerItems, createManageModelsAction, getModelPickerAccessibilityProvider, getModelPickerControlModels, ModelPickerSection, shouldShowManageModelsAction } from "./modelPickerItems.js";
import { ModelPickerConfiguration } from "./modelPickerConfiguration.js";
import { getModelPickerIcon } from "./modelProviderIcons.js";
import { getModelPickerUnavailableReason, isAutoModel, ModelPickerUnavailableReason, shouldShowCacheBreakHint as computeShouldShowCacheBreakHint } from "./modelPickerPresentation.js";
const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = "chat.cacheBreakHintDismissed";
let ModelPickerWidget = class extends Disposable {
  constructor(_delegate, _actionWidgetService, _commandService, _openerService, _telemetryService, _languageModelsService, _productService, _entitlementService, _updateService, _uriIdentityService, _defaultAccountService, _workspaceTrustManagementService, _workspaceTrustRequestService, _storageService, instantiationService) {
    super();
    this._delegate = _delegate;
    this._actionWidgetService = _actionWidgetService;
    this._commandService = _commandService;
    this._openerService = _openerService;
    this._telemetryService = _telemetryService;
    this._languageModelsService = _languageModelsService;
    this._productService = _productService;
    this._entitlementService = _entitlementService;
    this._updateService = _updateService;
    this._uriIdentityService = _uriIdentityService;
    this._defaultAccountService = _defaultAccountService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._storageService = _storageService;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._workspaceTrustInitialized = false;
    this._activatingAfterTrust = false;
    this._activatingTimer = this._register(new MutableDisposable());
    this._configuration = instantiationService.createInstance(ModelPickerConfiguration, {
      getSelectedModel: () => this._selectedModel,
      getConfigurationAccess: () => this._delegate.modelConfiguration ?? this._languageModelsService,
      isDisabled: () => !!this._domNode?.classList.contains("disabled"),
      shouldShowCacheBreakHint: () => this.shouldShowCacheBreakHint(
        /* excludeAutoModel */
        false
      ),
      getCacheBreakLearnMoreLink: () => this.getCacheBreakLearnMoreLink(),
      dismissCacheBreakHint: () => this.dismissCacheBreakHint()
    });
    this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
      if (this._activatingAfterTrust && this._delegate.getModels().length > 0) {
        this._clearActivating();
      }
      this._renderLabel();
    }));
    this._register(this._workspaceTrustManagementService.onDidChangeTrust((trusted) => {
      if (trusted && this._delegate.getPresentationOptions().showAutoModel && this._delegate.getModels().length === 0) {
        this._activatingAfterTrust = true;
        this._activatingTimer.value = disposableTimeout(() => {
          this._activatingAfterTrust = false;
          this._renderLabel();
        }, 15e3);
      } else {
        this._clearActivating();
      }
      this._renderLabel();
    }));
    this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._workspaceTrustInitialized = true;
      this._renderLabel();
    });
    this._register(this._entitlementService.onDidChangeUsageBasedBilling(() => {
      this._renderLabel();
    }));
    this._register(this._entitlementService.onDidChangeEntitlement(() => this._renderLabel()));
    this._register(this._entitlementService.onDidChangeSentiment(() => this._renderLabel()));
    this._register(this._entitlementService.onDidChangeAnonymous(() => this._renderLabel()));
    if (this._delegate.modelConfiguration?.onDidChange) {
      this._register(this._delegate.modelConfiguration.onDidChange(() => {
        this._renderLabel();
      }));
    }
  }
  get selectedModel() {
    return this._selectedModel;
  }
  get domNode() {
    return this._domNode;
  }
  get nameButton() {
    return this._nameButton;
  }
  setCompact(compact) {
    this._compact = compact;
    this._register(autorun((reader) => {
      const isCompact = compact.read(reader);
      if (this._domNode) {
        this._domNode.classList.toggle("compact", isCompact);
      }
      this._renderLabel();
    }));
  }
  setSelectedModel(model) {
    this._selectedModel = model;
    this._renderLabel();
  }
  setEnabled(enabled) {
    if (this._domNode) {
      this._domNode.classList.toggle("disabled", !enabled);
      this._domNode.setAttribute("aria-disabled", String(!enabled));
    }
  }
  setBadge(badge) {
    this._badge = badge;
    this._updateBadge();
  }
  /**
   * Why the picker currently has no model to offer (untrusted vs. needs
   * sign-in/setup), or `undefined` when a model is available. See
   * {@link getModelPickerUnavailableReason}.
   */
  _unavailableReason() {
    return getModelPickerUnavailableReason({
      trustInitialized: this._workspaceTrustInitialized,
      trusted: this._workspaceTrustManagementService.isWorkspaceTrusted(),
      pickerModels: this._delegate.getModels(),
      liveModelIds: this._languageModelsService.getLanguageModelIds(),
      requiresSetup: this._requiresSetup()
    });
  }
  _requiresSetup() {
    const sentiment = this._entitlementService.sentiment;
    return chatRequiresSetup({
      completed: !!sentiment.completed,
      disabled: !!sentiment.disabled,
      // Don't derive `untrusted` from sentiment (it lags after a Trust grant): trust is handled
      // authoritatively by the Restricted branch, which runs first, so it's false here.
      untrusted: false,
      entitlement: this._entitlementService.entitlement,
      anonymous: this._entitlementService.anonymous,
      hasByokModels: this._entitlementService.hasByokModels
    });
  }
  /**
   * Whether the picker has no usable model specifically because the workspace
   * is untrusted (Restricted Mode disables the chat model providers).
   */
  isRestrictedMode() {
    return this._unavailableReason() === ModelPickerUnavailableReason.Restricted;
  }
  /**
   * Whether the picker has no usable model because Chat still needs sign-in /
   * setup (and the workspace is trusted, so it is not Restricted Mode). BYOK
   * and anonymous access never report this state.
   */
  isSetupRequired() {
    return this._unavailableReason() === ModelPickerUnavailableReason.SetupRequired;
  }
  _clearActivating() {
    this._activatingAfterTrust = false;
    this._activatingTimer.clear();
  }
  /**
   * Prompts the user to trust the workspace. On grant, providers register their
   * models and `onDidChangeLanguageModels` refreshes the picker.
   */
  async _requestWorkspaceTrust() {
    await this._workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("chat.modelPicker.trustMessage", "Trusting this workspace enables AI models and chat features.")
    });
  }
  /**
   * Starts the Chat setup / sign-in flow (same command as the title-bar Sign In
   * affordance). On completion the entitlement and model registry change, which
   * refreshes the picker.
   */
  _requestSetup() {
    this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
  }
  render(container) {
    this._domNode = dom.append(container, dom.$("div.action-label.model-picker-split"));
    this._domNode.setAttribute("role", "group");
    this._domNode.tabIndex = -1;
    if (this._compact?.get()) {
      this._domNode.classList.toggle("compact", true);
    }
    this._nameButton = dom.append(this._domNode, dom.$("a.model-picker-section.model-picker-name"));
    this._nameButton.tabIndex = 0;
    this._nameButton.setAttribute("role", "button");
    this._nameButton.setAttribute("aria-haspopup", "true");
    this._nameButton.setAttribute("aria-expanded", "false");
    this._configButton = dom.append(this._domNode, dom.$("a.model-picker-section.model-picker-config"));
    this._configButton.tabIndex = 0;
    this._configButton.setAttribute("role", "button");
    this._configButton.setAttribute("aria-haspopup", "true");
    this._configButton.setAttribute("aria-expanded", "false");
    this._configButton.style.display = "none";
    this._badgeIcon = dom.$("span.model-picker-badge");
    this._updateBadge();
    this._renderLabel();
    this._registerButtonAction(this._nameButton, () => this.show());
    this._registerButtonAction(this._configButton, () => this._configuration.show(this._configButton));
    this._register(getBaseLayerHoverDelegate().setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      this._configButton,
      localize("chat.modelPicker.configTooltip", "Configure Model")
    ));
  }
  /**
   * Registers mouse-down and Enter/Space key handlers on a button element.
   */
  _registerButtonAction(element, action) {
    this._register(dom.addDisposableGenericMouseDownListener(element, (e) => {
      if (e.button !== 0) {
        return;
      }
      dom.EventHelper.stop(e, true);
      action();
    }));
    this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        action();
      }
    }));
  }
  /** The "Learn more" header link for cache-break hints; `undefined` when the product has no URL. */
  getCacheBreakLearnMoreLink() {
    const url = this._productService.defaultChatAgent?.optimizeUsageDocumentationUrl;
    return url ? { label: localize("chat.cacheBreak.learnMore", "Learn more"), uri: URI.parse(url) } : void 0;
  }
  isCacheBreakHintDismissed() {
    return this._storageService.getBoolean(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  dismissCacheBreakHint() {
    this._storageService.store(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
  }
  /**
   * The picker's current availability, derived once so the label states and the "nothing to switch
   * to" hint suppression (#325185) cannot disagree.
   */
  _availability() {
    const reason = this._unavailableReason();
    const empty = this._delegate.getModels().length === 0;
    const activating = reason === void 0 && empty && this._activatingAfterTrust;
    const genericNoModels = reason === void 0 && !activating && empty && !this._delegate.getPresentationOptions().showAutoModel;
    return { reason, activating, genericNoModels, noModels: reason !== void 0 || activating || genericNoModels };
  }
  /** Thin wrapper over {@link computeShouldShowCacheBreakHint} that supplies this picker's live state. */
  shouldShowCacheBreakHint(excludeAutoModel) {
    return computeShouldShowCacheBreakHint({
      dismissed: this.isCacheBreakHintDismissed(),
      cacheWarm: this._delegate.isCacheWarm?.() ?? false,
      noModelsAvailable: this._availability().noModels,
      excludeAutoModel,
      selectedModelIsAuto: !!this._selectedModel && isAutoModel(this._selectedModel)
    });
  }
  show(anchor) {
    const anchorElement = anchor ?? this._domNode;
    if (!anchorElement || this._domNode?.classList.contains("disabled")) {
      return;
    }
    if (this._nameButton?.getAttribute("aria-expanded") === "true") {
      this._actionWidgetService.hide(true);
      return;
    }
    const previousModel = this._selectedModel;
    const onSelect = (model) => {
      this._telemetryService.publicLog2("chat.modelChange", {
        fromModel: previousModel?.metadata.vendor === "copilot" ? new TelemetryTrustedValue(previousModel.identifier) : "unknown",
        toModel: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(model.identifier) : "unknown",
        chatSessionId: this._delegate.getChatSessionId?.()
      });
      this._selectedModel = model;
      this._renderLabel();
      this._onDidChangeSelection.fire(model);
    };
    const onConfigure = (model, group) => {
      onSelect(model);
      this._actionWidgetService.hide();
      this._configuration.show(this._configButton, group);
    };
    const models = this._delegate.getModels();
    const presentation = this._delegate.getPresentationOptions();
    const manifest = this._languageModelsService.getModelsControlManifest();
    const controlModelsForTier = getModelPickerControlModels(manifest, this._entitlementService.entitlement, models);
    const canShowManageModelsAction = presentation.showManageModelsAction && shouldShowManageModelsAction(this._entitlementService);
    const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : void 0;
    const logModelPickerInteraction = (interaction) => {
      this._telemetryService.publicLog2("chat.modelPickerInteraction", { interaction });
    };
    const manageSettingsUrl = this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
    const onTogglePin = (modelIdentifier, pinned) => {
      if (pinned) {
        this._languageModelsService.pinModel(modelIdentifier);
      } else {
        this._languageModelsService.unpinModel(modelIdentifier);
      }
      this._actionWidgetService.hide();
      this.show(anchorElement);
    };
    const items = buildModelPickerItems({
      models,
      selectedModelId: this._selectedModel?.identifier,
      recentModelIds: this._languageModelsService.getRecentlyUsedModelIds().filter((id) => !this._languageModelsService.isModelHidden(id)),
      pinnedModelIds: this._languageModelsService.getPinnedModelIds().filter((id) => !this._languageModelsService.isModelHidden(id)),
      controlModels: controlModelsForTier,
      currentVSCodeVersion: this._productService.version,
      updateStateType: this._updateService.state.type,
      manageSettingsUrl,
      manageModelsAction,
      chatEntitlementService: this._entitlementService,
      languageModelsService: this._languageModelsService,
      openerService: this._openerService,
      presentation: {
        ...presentation,
        restrictedMode: this.isRestrictedMode(),
        setupRequired: this.isSetupRequired(),
        isUBB: !!this._entitlementService.quotas.usageBasedBilling
      },
      actions: {
        onSelect,
        onTogglePin,
        onConfigure,
        onRequestTrust: () => {
          void this._requestWorkspaceTrust();
        },
        onRequestSetup: () => {
          this._requestSetup();
        }
      }
    });
    const hoverDisposables = new DisposableStore();
    for (const item of items) {
      if (item.hover?.disposable) {
        hoverDisposables.add(item.hover.disposable);
      }
    }
    const unavailable = this.isRestrictedMode() || this.isSetupRequired();
    const showCacheBreakHint = this.shouldShowCacheBreakHint(
      /* excludeAutoModel */
      true
    );
    const listOptions = withChatInputPickerMotion({
      className: "chat-model-picker-dropdown",
      headerText: showCacheBreakHint ? localize("chat.modelPicker.cacheBreakHint", "Switching models mid-session resets the prompt cache and may increase cost.") : void 0,
      headerIcon: showCacheBreakHint ? Codicon.info : void 0,
      headerLink: showCacheBreakHint ? this.getCacheBreakLearnMoreLink() : void 0,
      headerDismiss: showCacheBreakHint ? () => this.dismissCacheBreakHint() : void 0,
      showFilter: !unavailable,
      filterPlaceholder: localize("chat.modelPicker.search", "Search models"),
      focusFilterOnOpen: true,
      collapsedByDefault: /* @__PURE__ */ new Set([ModelPickerSection.Other]),
      onDidToggleSection: (section, collapsed) => {
        if (section === ModelPickerSection.Other) {
          logModelPickerInteraction(collapsed ? "otherModelsCollapsed" : "otherModelsExpanded");
        }
      },
      linkHandler: (uri) => {
        if (uri.scheme === "command" && uri.path === "workbench.action.chat.upgradePlan") {
          logModelPickerInteraction("premiumModelUpgradePlanClicked");
        } else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
          logModelPickerInteraction("disabledModelContactAdminClicked");
        }
        void this._openerService.open(uri, { allowCommands: true });
      },
      minWidth: 200
    });
    const previouslyFocusedElement = dom.getActiveElement();
    const delegate = {
      onSelect: (action) => {
        this._actionWidgetService.hide();
        action.run();
      },
      onHide: () => {
        hoverDisposables.dispose();
        this._nameButton?.setAttribute("aria-expanded", "false");
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      }
    };
    this._nameButton?.setAttribute("aria-expanded", "true");
    this._actionWidgetService.show(
      "ChatModelPicker",
      false,
      items,
      delegate,
      anchorElement,
      void 0,
      [],
      getModelPickerAccessibilityProvider(),
      listOptions
    );
  }
  _updateBadge() {
    if (this._badgeIcon) {
      if (this._badge) {
        const icon = this._badge === "info" ? Codicon.info : Codicon.warning;
        dom.reset(this._badgeIcon, renderIcon(icon));
        this._badgeIcon.style.display = "";
        this._badgeIcon.classList.toggle("info", this._badge === "info");
        this._badgeIcon.classList.toggle("warning", this._badge === "warning");
      } else {
        this._badgeIcon.style.display = "none";
      }
    }
  }
  _renderLabel() {
    if (!this._domNode || !this._nameButton) {
      return;
    }
    const { name } = this._selectedModel?.metadata || {};
    const { reason, activating, genericNoModels, noModels: noModelsAvailable } = this._availability();
    const restrictedMode = reason === ModelPickerUnavailableReason.Restricted;
    const setupRequired = reason === ModelPickerUnavailableReason.SetupRequired;
    const unavailable = reason !== void 0;
    const nameChildren = [];
    const modelIcon = this._selectedModel ? this._selectedModel.metadata.statusIcon ?? (this._delegate.getPresentationOptions().showModelIcon ? getModelPickerIcon(this._selectedModel) : void 0) : void 0;
    const compact = this._compact?.get() ?? false;
    if (modelIcon && !noModelsAvailable) {
      nameChildren.push(renderIcon(modelIcon));
    }
    const modelLabel = unavailable ? localize("chat.modelPicker.modelsLabel", "Models") : activating ? localize("chat.modelPicker.activating", "Activating...") : genericNoModels ? localize("chat.modelPicker.noModels", "No models available") : name ?? localize("chat.modelPicker.auto", "Auto");
    if (!compact || !modelIcon || noModelsAvailable) {
      nameChildren.push(dom.$("span.chat-input-picker-label", void 0, modelLabel));
    }
    if (this._badgeIcon) {
      nameChildren.push(this._badgeIcon);
    }
    dom.reset(this._nameButton, ...nameChildren);
    if (this._configButton) {
      this._configuration.renderButton(this._configButton, compact, noModelsAvailable);
    }
    const ariaLabel = restrictedMode ? localize("chat.modelPicker.ariaLabelRestricted", "Models, unavailable while in Restricted mode") : setupRequired ? localize("chat.modelPicker.ariaLabelSetupRequired", "Models, sign in to use Copilot") : localize("chat.modelPicker.ariaLabel", "Models, {0}", modelLabel);
    this._domNode.ariaLabel = ariaLabel;
    this._nameButton.ariaLabel = ariaLabel;
  }
};
ModelPickerWidget = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ILanguageModelsService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IChatEntitlementService),
  __decorateParam(8, IUpdateService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IDefaultAccountService),
  __decorateParam(11, IWorkspaceTrustManagementService),
  __decorateParam(12, IWorkspaceTrustRequestService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IInstantiationService)
], ModelPickerWidget);
export {
  ModelPickerWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbW9kZWxQaWNrZXIuY3NzJztcblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25MaXN0SGVhZGVyTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250cm9sRW50cnksIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBjaGF0UmVxdWlyZXNTZXR1cCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFBpY2tlckRlbGVnYXRlIH0gZnJvbSAnLi9tb2RlbFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgQ0hBVF9TRVRVUF9BQ1RJT05fSUQgfSBmcm9tICcuLi8uLi8uLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgR2l0SHViUGF0aHMsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgd2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbiB9IGZyb20gJy4uL2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgYnVpbGRNb2RlbFBpY2tlckl0ZW1zLCBjcmVhdGVNYW5hZ2VNb2RlbHNBY3Rpb24sIGdldE1vZGVsUGlja2VyQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBnZXRNb2RlbFBpY2tlckNvbnRyb2xNb2RlbHMsIE1vZGVsUGlja2VyU2VjdGlvbiwgc2hvdWxkU2hvd01hbmFnZU1vZGVsc0FjdGlvbiB9IGZyb20gJy4vbW9kZWxQaWNrZXJJdGVtcy5qcyc7XG5pbXBvcnQgeyBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL21vZGVsUGlja2VyQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRNb2RlbFBpY2tlckljb24gfSBmcm9tICcuL21vZGVsUHJvdmlkZXJJY29ucy5qcyc7XG5pbXBvcnQgeyBnZXRNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLCBpc0F1dG9Nb2RlbCwgTW9kZWxQaWNrZXJVbmF2YWlsYWJsZVJlYXNvbiwgc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50IGFzIGNvbXB1dGVTaG91bGRTaG93Q2FjaGVCcmVha0hpbnQgfSBmcm9tICcuL21vZGVsUGlja2VyUHJlc2VudGF0aW9uLmpzJztcblxuY29uc3QgQ0FDSEVfQlJFQUtfSElOVF9ESVNNSVNTRURfU1RPUkFHRV9LRVkgPSAnY2hhdC5jYWNoZUJyZWFrSGludERpc21pc3NlZCc7XG50eXBlIENoYXRNb2RlbENoYW5nZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2xyYW1vczE1Jztcblx0Y29tbWVudDogJ1JlcG9ydGluZyB3aGVuIHRoZSBtb2RlbCBwaWNrZXIgaXMgc3dpdGNoZWQnO1xuXHRmcm9tTW9kZWw/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByZXZpb3VzIGNoYXQgbW9kZWwnIH07XG5cdHRvTW9kZWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmV3IGNoYXQgbW9kZWwnIH07XG5cdGNoYXRTZXNzaW9uSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbiwgdXNlZCB0byBjb3JyZWxhdGUgdGhlIG1vZGVsIHN3aXRjaCB3aXRoIHRoZSBzZXNzaW9uLicgfTtcbn07XG5cbnR5cGUgQ2hhdE1vZGVsQ2hhbmdlRXZlbnQgPSB7XG5cdGZyb21Nb2RlbDogc3RyaW5nIHwgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHRvTW9kZWw6IHN0cmluZyB8IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRjaGF0U2Vzc2lvbklkPzogc3RyaW5nO1xufTtcblxudHlwZSBDaGF0TW9kZWxQaWNrZXJJbnRlcmFjdGlvbiA9ICdkaXNhYmxlZE1vZGVsQ29udGFjdEFkbWluQ2xpY2tlZCcgfCAncHJlbWl1bU1vZGVsVXBncmFkZVBsYW5DbGlja2VkJyB8ICdvdGhlck1vZGVsc0V4cGFuZGVkJyB8ICdvdGhlck1vZGVsc0NvbGxhcHNlZCc7XG5cbnR5cGUgQ2hhdE1vZGVsUGlja2VySW50ZXJhY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdSZXBvcnRpbmcgaW50ZXJhY3Rpb25zIGluIHRoZSBjaGF0IG1vZGVsIHBpY2tlcic7XG5cdGludGVyYWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG1vZGVsIHBpY2tlciBpbnRlcmFjdGlvbiB0aGF0IG9jY3VycmVkJyB9O1xufTtcblxudHlwZSBDaGF0TW9kZWxQaWNrZXJJbnRlcmFjdGlvbkV2ZW50ID0ge1xuXHRpbnRlcmFjdGlvbjogQ2hhdE1vZGVsUGlja2VySW50ZXJhY3Rpb247XG59O1xuXG50eXBlIE1vZGVsUGlja2VyQmFkZ2UgPSAnaW5mbycgfCAnd2FybmluZyc7XG5cbi8qKiBXaHkgdGhlIHBpY2tlciBoYXMgbm8gbW9kZWwgdG8gb2ZmZXIsIGFuZCB0aGUgbGFiZWwgc3RhdGVzIHRoYXQgZm9sbG93IGZyb20gaXQuICovXG5pbnRlcmZhY2UgSU1vZGVsUGlja2VyQXZhaWxhYmlsaXR5IHtcblx0LyoqIFVudHJ1c3RlZCB3b3Jrc3BhY2Ugb3Igc2lnbi1pbiAvIHNldHVwIHJlcXVpcmVkLCBvciBgdW5kZWZpbmVkYCB3aGVuIGEgbW9kZWwgaXMgYXZhaWxhYmxlLiAqL1xuXHRyZWFkb25seSByZWFzb246IE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBUcnVzdGVkLCBidXQgbW9kZWxzIGFyZSBzdGlsbCBsb2FkaW5nIHdoaWxlIHRoZSBjaGF0IGV4dGVuc2lvbiBhY3RpdmF0ZXMuICovXG5cdHJlYWRvbmx5IGFjdGl2YXRpbmc6IGJvb2xlYW47XG5cdC8qKiBUcnVzdGVkIGFuZCBzZXQgdXAsIGJ1dCB0aGUgbGlzdCBpcyBlbXB0eSBhbmQgdGhlcmUgaXMgbm8gQXV0byBmYWxsYmFjay4gKi9cblx0cmVhZG9ubHkgZ2VuZXJpY05vTW9kZWxzOiBib29sZWFuO1xuXHQvKiogQW55IG9mIHRoZSBhYm92ZTogdGhlIHBpY2tlciBoYXMgbm90aGluZyB0byBvZmZlci4gKi9cblx0cmVhZG9ubHkgbm9Nb2RlbHM6IGJvb2xlYW47XG59XG5cbi8qKlxuICogQSBtb2RlbCBzZWxlY3Rpb24gZHJvcGRvd24gd2lkZ2V0LlxuICpcbiAqIFJlbmRlcnMgYSBidXR0b24gc2hvd2luZyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIG1vZGVsIG5hbWUuXG4gKiBPbiBjbGljaywgb3BlbnMgYSBncm91cGVkIHBpY2tlciBwb3B1cCB3aXRoOlxuICogQXV0byBcdTIxOTIgUHJvbW90ZWQgKHJlY2VudGx5IHVzZWQgKyBjdXJhdGVkKSBcdTIxOTIgT3RoZXIgTW9kZWxzIChjb2xsYXBzZWQgd2l0aCBzZWFyY2gpLlxuICpcbiAqIFRoZSB3aWRnZXQgb3ducyBpdHMgc3RhdGUgLSBzZXQgbW9kZWxzLCBzZWxlY3Rpb24sIGFuZCBjdXJhdGVkIElEcyB2aWEgc2V0dGVycy5cbiAqIExpc3RlbiBmb3Igc2VsZWN0aW9uIGNoYW5nZXMgdmlhIGBvbkRpZENoYW5nZVNlbGVjdGlvbmAuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2RlbFBpY2tlcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VsZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb246IEV2ZW50PElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcj4gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9zZWxlY3RlZE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2JhZGdlOiBNb2RlbFBpY2tlckJhZGdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21wYWN0OiBJT2JzZXJ2YWJsZTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9hY3RpdmF0aW5nQWZ0ZXJUcnVzdCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmF0aW5nVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfZG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2JhZGdlSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25hbWVCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb25maWdCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb247XG5cblx0Z2V0IHNlbGVjdGVkTW9kZWwoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRNb2RlbDtcblx0fVxuXG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdGdldCBuYW1lQnV0dG9uKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbmFtZUJ1dHRvbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlOiBJTW9kZWxQaWNrZXJEZWxlZ2F0ZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsUGlja2VyQ29uZmlndXJhdGlvbiwge1xuXHRcdFx0Z2V0U2VsZWN0ZWRNb2RlbDogKCkgPT4gdGhpcy5fc2VsZWN0ZWRNb2RlbCxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25BY2Nlc3M6ICgpID0+IHRoaXMuX2RlbGVnYXRlLm1vZGVsQ29uZmlndXJhdGlvbiA/PyB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRpc0Rpc2FibGVkOiAoKSA9PiAhIXRoaXMuX2RvbU5vZGU/LmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSxcblx0XHRcdHNob3VsZFNob3dDYWNoZUJyZWFrSGludDogKCkgPT4gdGhpcy5zaG91bGRTaG93Q2FjaGVCcmVha0hpbnQoLyogZXhjbHVkZUF1dG9Nb2RlbCAqLyBmYWxzZSksXG5cdFx0XHRnZXRDYWNoZUJyZWFrTGVhcm5Nb3JlTGluazogKCkgPT4gdGhpcy5nZXRDYWNoZUJyZWFrTGVhcm5Nb3JlTGluaygpLFxuXHRcdFx0ZGlzbWlzc0NhY2hlQnJlYWtIaW50OiAoKSA9PiB0aGlzLmRpc21pc3NDYWNoZUJyZWFrSGludCgpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9hY3RpdmF0aW5nQWZ0ZXJUcnVzdCAmJiB0aGlzLl9kZWxlZ2F0ZS5nZXRNb2RlbHMoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyQWN0aXZhdGluZygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWZsZWN0IFJlc3RyaWN0ZWQgTW9kZSBpbW1lZGlhdGVseSB3aGVuIHRydXN0IGNoYW5nZXMuIFdoZW4gdHJ1c3QgaXNcblx0XHQvLyBncmFudGVkIGJ1dCBubyBtb2RlbHMgYXJlIGF2YWlsYWJsZSB5ZXQsIGJyaWVmbHkgc2hvdyBhbiBcIkFjdGl2YXRpbmcuLi5cIlxuXHRcdC8vIHN0YXRlIHdoaWxlIHRoZSBjaGF0IGV4dGVuc2lvbiBjb21lcyB1cCBhbmQgbG9hZHMgdGhlbSwgcmF0aGVyIHRoYW4gYVxuXHRcdC8vIG1pc2xlYWRpbmcgXCJBdXRvXCIgZmFsbGJhY2suXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KHRydXN0ZWQgPT4ge1xuXHRcdFx0aWYgKHRydXN0ZWQgJiYgdGhpcy5fZGVsZWdhdGUuZ2V0UHJlc2VudGF0aW9uT3B0aW9ucygpLnNob3dBdXRvTW9kZWwgJiYgdGhpcy5fZGVsZWdhdGUuZ2V0TW9kZWxzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2YXRpbmdBZnRlclRydXN0ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGluZ1RpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2YXRpbmdBZnRlclRydXN0ID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHRcdFx0fSwgMTUwMDApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJBY3RpdmF0aW5nKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRydXN0IHJlYWRzIGFzIHVudHJ1c3RlZCB1bnRpbCBpbml0aWFsaXphdGlvbiByZXNvbHZlczsgZ2F0ZSBvbiBpdCBzbyBhXG5cdFx0Ly8gdHJ1c3RlZCB3b3Jrc3BhY2UgZG9lc24ndCBicmllZmx5IHJlbmRlciBhcyByZXN0cmljdGVkIGF0IHN0YXJ0dXAuXG5cdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgc2V0dXAtcmVxdWlyZWQgc3RhdGUgZGVyaXZlcyBmcm9tIGVudGl0bGVtZW50IC8gc2VudGltZW50IC8gYW5vbnltb3VzXG5cdFx0Ly8gYWNjZXNzLCBzbyByZWZyZXNoIHRoZSBsYWJlbCB3aGVuIGFueSBvZiB0aG9zZSBjaGFuZ2UgKGUuZy4gYWZ0ZXIgc2lnbi1pbikuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4gdGhpcy5fcmVuZGVyTGFiZWwoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCgoKSA9PiB0aGlzLl9yZW5kZXJMYWJlbCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQW5vbnltb3VzKCgpID0+IHRoaXMuX3JlbmRlckxhYmVsKCkpKTtcblxuXHRcdC8vIEFsc28gcmVmcmVzaCB0aGUgbGFiZWwgd2hlbiB0aGUgcGVyLWVkaXRvciBjb25maWcgbGF5ZXIgKGlmIGFueSkgcmVwb3J0c1xuXHRcdC8vIGEgY2hhbmdlLiBUaGUgZ2xvYmFsIHNlcnZpY2UgcGF0aCBpcyBhbHJlYWR5IGNvdmVyZWQgYWJvdmUgdmlhXG5cdFx0Ly8gYG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHNgIHdoaWNoIGZpcmVzIGZyb20gYHNldE1vZGVsQ29uZmlndXJhdGlvbmAuXG5cdFx0aWYgKHRoaXMuX2RlbGVnYXRlLm1vZGVsQ29uZmlndXJhdGlvbj8ub25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlbGVnYXRlLm1vZGVsQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Q29tcGFjdChjb21wYWN0OiBJT2JzZXJ2YWJsZTxib29sZWFuPik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBhY3QgPSBjb21wYWN0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzQ29tcGFjdCA9IGNvbXBhY3QucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuX2RvbU5vZGUpIHtcblx0XHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb21wYWN0JywgaXNDb21wYWN0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0U2VsZWN0ZWRNb2RlbChtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRNb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XG5cdH1cblxuXHRzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFlbmFibGVkKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKCFlbmFibGVkKSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0QmFkZ2UoYmFkZ2U6IE1vZGVsUGlja2VyQmFkZ2UgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9iYWRnZSA9IGJhZGdlO1xuXHRcdHRoaXMuX3VwZGF0ZUJhZGdlKCk7XG5cdH1cblxuXHQvKipcblx0ICogV2h5IHRoZSBwaWNrZXIgY3VycmVudGx5IGhhcyBubyBtb2RlbCB0byBvZmZlciAodW50cnVzdGVkIHZzLiBuZWVkc1xuXHQgKiBzaWduLWluL3NldHVwKSwgb3IgYHVuZGVmaW5lZGAgd2hlbiBhIG1vZGVsIGlzIGF2YWlsYWJsZS4gU2VlXG5cdCAqIHtAbGluayBnZXRNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29ufS5cblx0ICovXG5cdHByaXZhdGUgX3VuYXZhaWxhYmxlUmVhc29uKCk6IE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uKHtcblx0XHRcdHRydXN0SW5pdGlhbGl6ZWQ6IHRoaXMuX3dvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWQsXG5cdFx0XHR0cnVzdGVkOiB0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpLFxuXHRcdFx0cGlja2VyTW9kZWxzOiB0aGlzLl9kZWxlZ2F0ZS5nZXRNb2RlbHMoKSxcblx0XHRcdGxpdmVNb2RlbElkczogdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSxcblx0XHRcdHJlcXVpcmVzU2V0dXA6IHRoaXMuX3JlcXVpcmVzU2V0dXAoKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVpcmVzU2V0dXAoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VudGltZW50ID0gdGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudDtcblx0XHRyZXR1cm4gY2hhdFJlcXVpcmVzU2V0dXAoe1xuXHRcdFx0Y29tcGxldGVkOiAhIXNlbnRpbWVudC5jb21wbGV0ZWQsXG5cdFx0XHRkaXNhYmxlZDogISFzZW50aW1lbnQuZGlzYWJsZWQsXG5cdFx0XHQvLyBEb24ndCBkZXJpdmUgYHVudHJ1c3RlZGAgZnJvbSBzZW50aW1lbnQgKGl0IGxhZ3MgYWZ0ZXIgYSBUcnVzdCBncmFudCk6IHRydXN0IGlzIGhhbmRsZWRcblx0XHRcdC8vIGF1dGhvcml0YXRpdmVseSBieSB0aGUgUmVzdHJpY3RlZCBicmFuY2gsIHdoaWNoIHJ1bnMgZmlyc3QsIHNvIGl0J3MgZmFsc2UgaGVyZS5cblx0XHRcdHVudHJ1c3RlZDogZmFsc2UsXG5cdFx0XHRlbnRpdGxlbWVudDogdGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50LFxuXHRcdFx0YW5vbnltb3VzOiB0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzLFxuXHRcdFx0aGFzQnlva01vZGVsczogdGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLmhhc0J5b2tNb2RlbHMsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcGlja2VyIGhhcyBubyB1c2FibGUgbW9kZWwgc3BlY2lmaWNhbGx5IGJlY2F1c2UgdGhlIHdvcmtzcGFjZVxuXHQgKiBpcyB1bnRydXN0ZWQgKFJlc3RyaWN0ZWQgTW9kZSBkaXNhYmxlcyB0aGUgY2hhdCBtb2RlbCBwcm92aWRlcnMpLlxuXHQgKi9cblx0aXNSZXN0cmljdGVkTW9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5hdmFpbGFibGVSZWFzb24oKSA9PT0gTW9kZWxQaWNrZXJVbmF2YWlsYWJsZVJlYXNvbi5SZXN0cmljdGVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHBpY2tlciBoYXMgbm8gdXNhYmxlIG1vZGVsIGJlY2F1c2UgQ2hhdCBzdGlsbCBuZWVkcyBzaWduLWluIC9cblx0ICogc2V0dXAgKGFuZCB0aGUgd29ya3NwYWNlIGlzIHRydXN0ZWQsIHNvIGl0IGlzIG5vdCBSZXN0cmljdGVkIE1vZGUpLiBCWU9LXG5cdCAqIGFuZCBhbm9ueW1vdXMgYWNjZXNzIG5ldmVyIHJlcG9ydCB0aGlzIHN0YXRlLlxuXHQgKi9cblx0aXNTZXR1cFJlcXVpcmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91bmF2YWlsYWJsZVJlYXNvbigpID09PSBNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLlNldHVwUmVxdWlyZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckFjdGl2YXRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZhdGluZ0FmdGVyVHJ1c3QgPSBmYWxzZTtcblx0XHR0aGlzLl9hY3RpdmF0aW5nVGltZXIuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tcHRzIHRoZSB1c2VyIHRvIHRydXN0IHRoZSB3b3Jrc3BhY2UuIE9uIGdyYW50LCBwcm92aWRlcnMgcmVnaXN0ZXIgdGhlaXJcblx0ICogbW9kZWxzIGFuZCBgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsc2AgcmVmcmVzaGVzIHRoZSBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXF1ZXN0V29ya3NwYWNlVHJ1c3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIudHJ1c3RNZXNzYWdlJywgXCJUcnVzdGluZyB0aGlzIHdvcmtzcGFjZSBlbmFibGVzIEFJIG1vZGVscyBhbmQgY2hhdCBmZWF0dXJlcy5cIilcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdGFydHMgdGhlIENoYXQgc2V0dXAgLyBzaWduLWluIGZsb3cgKHNhbWUgY29tbWFuZCBhcyB0aGUgdGl0bGUtYmFyIFNpZ24gSW5cblx0ICogYWZmb3JkYW5jZSkuIE9uIGNvbXBsZXRpb24gdGhlIGVudGl0bGVtZW50IGFuZCBtb2RlbCByZWdpc3RyeSBjaGFuZ2UsIHdoaWNoXG5cdCAqIHJlZnJlc2hlcyB0aGUgcGlja2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVxdWVzdFNldHVwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lEKTtcblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnZGl2LmFjdGlvbi1sYWJlbC5tb2RlbC1waWNrZXItc3BsaXQnKSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHQvLyBUaGUgY29udGFpbmVyIGdyb3VwcyB0aGUgaW5kaXZpZHVhbCBidXR0b25zOyBvbmx5IHRoZSBidXR0b25zIHNob3VsZCBiZVxuXHRcdC8vIHRhYiBzdG9wcywgbm90IHRoZSBjb250YWluZXIgaXRzZWxmLlxuXHRcdHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPSAtMTtcblxuXHRcdC8vIEFwcGx5IGluaXRpYWwgY29sbGFwc2VkIHN0YXRlIG5vdyB0aGF0IF9kb21Ob2RlIGV4aXN0c1xuXHRcdGlmICh0aGlzLl9jb21wYWN0Py5nZXQoKSkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb21wYWN0JywgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gTW9kZWwgbmFtZSBidXR0b25cblx0XHR0aGlzLl9uYW1lQnV0dG9uID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCBkb20uJCgnYS5tb2RlbC1waWNrZXItc2VjdGlvbi5tb2RlbC1waWNrZXItbmFtZScpKTtcblx0XHR0aGlzLl9uYW1lQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9uYW1lQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9uYW1lQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0dGhpcy5fbmFtZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblxuXHRcdC8vIENvbWJpbmVkIGNvbmZpZ3VyYXRpb24gYnV0dG9uIChjb25kaXRpb25hbGx5IHZpc2libGUpOiBvcGVucyBhIHNpbmdsZVxuXHRcdC8vIGRyb3Bkb3duIHdpdGggVGhpbmtpbmcgRWZmb3J0IGFuZCBDb250ZXh0IFNpemUgc2VjdGlvbnMuXG5cdFx0dGhpcy5fY29uZmlnQnV0dG9uID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCBkb20uJCgnYS5tb2RlbC1waWNrZXItc2VjdGlvbi5tb2RlbC1waWNrZXItY29uZmlnJykpO1xuXHRcdHRoaXMuX2NvbmZpZ0J1dHRvbi50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fY29uZmlnQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9jb25maWdCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHR0aGlzLl9jb25maWdCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0dGhpcy5fY29uZmlnQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLl9iYWRnZUljb24gPSBkb20uJCgnc3Bhbi5tb2RlbC1waWNrZXItYmFkZ2UnKTtcblx0XHR0aGlzLl91cGRhdGVCYWRnZSgpO1xuXG5cdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyQnV0dG9uQWN0aW9uKHRoaXMuX25hbWVCdXR0b24sICgpID0+IHRoaXMuc2hvdygpKTtcblx0XHR0aGlzLl9yZWdpc3RlckJ1dHRvbkFjdGlvbih0aGlzLl9jb25maWdCdXR0b24sICgpID0+IHRoaXMuX2NvbmZpZ3VyYXRpb24uc2hvdyh0aGlzLl9jb25maWdCdXR0b24pKTtcblxuXHRcdC8vIE1hbmFnZWQgaG92ZXIgZm9yIHRoZSBjb21iaW5lZCBjb25maWd1cmF0aW9uIGJ1dHRvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLFxuXHRcdFx0dGhpcy5fY29uZmlnQnV0dG9uLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuY29uZmlnVG9vbHRpcCcsIFwiQ29uZmlndXJlIE1vZGVsXCIpXG5cdFx0KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIG1vdXNlLWRvd24gYW5kIEVudGVyL1NwYWNlIGtleSBoYW5kbGVycyBvbiBhIGJ1dHRvbiBlbGVtZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJCdXR0b25BY3Rpb24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGFjdGlvbjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGVsZW1lbnQsIGUgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0YWN0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRhY3Rpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKiogVGhlIFwiTGVhcm4gbW9yZVwiIGhlYWRlciBsaW5rIGZvciBjYWNoZS1icmVhayBoaW50czsgYHVuZGVmaW5lZGAgd2hlbiB0aGUgcHJvZHVjdCBoYXMgbm8gVVJMLiAqL1xuXHRwcml2YXRlIGdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rKCk6IElBY3Rpb25MaXN0SGVhZGVyTGluayB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8ub3B0aW1pemVVc2FnZURvY3VtZW50YXRpb25Vcmw7XG5cdFx0cmV0dXJuIHVybCA/IHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0LmNhY2hlQnJlYWsubGVhcm5Nb3JlJywgXCJMZWFybiBtb3JlXCIpLCB1cmk6IFVSSS5wYXJzZSh1cmwpIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGlzQ2FjaGVCcmVha0hpbnREaXNtaXNzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQ0FDSEVfQlJFQUtfSElOVF9ESVNNSVNTRURfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNtaXNzQ2FjaGVCcmVha0hpbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ0FDSEVfQlJFQUtfSElOVF9ESVNNSVNTRURfU1RPUkFHRV9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcGlja2VyJ3MgY3VycmVudCBhdmFpbGFiaWxpdHksIGRlcml2ZWQgb25jZSBzbyB0aGUgbGFiZWwgc3RhdGVzIGFuZCB0aGUgXCJub3RoaW5nIHRvIHN3aXRjaFxuXHQgKiB0b1wiIGhpbnQgc3VwcHJlc3Npb24gKCMzMjUxODUpIGNhbm5vdCBkaXNhZ3JlZS5cblx0ICovXG5cdHByaXZhdGUgX2F2YWlsYWJpbGl0eSgpOiBJTW9kZWxQaWNrZXJBdmFpbGFiaWxpdHkge1xuXHRcdC8vIFF1ZXJpZWQgZGlyZWN0bHkgcmF0aGVyIHRoYW4gdGhyb3VnaCB0aGUgaXNSZXN0cmljdGVkTW9kZSgpL2lzU2V0dXBSZXF1aXJlZCgpIHdyYXBwZXJzLFxuXHRcdC8vIHdoaWNoIHdvdWxkIGVhY2ggcmVjb21wdXRlIGl0LlxuXHRcdGNvbnN0IHJlYXNvbiA9IHRoaXMuX3VuYXZhaWxhYmxlUmVhc29uKCk7XG5cdFx0Y29uc3QgZW1wdHkgPSB0aGlzLl9kZWxlZ2F0ZS5nZXRNb2RlbHMoKS5sZW5ndGggPT09IDA7XG5cdFx0Y29uc3QgYWN0aXZhdGluZyA9IHJlYXNvbiA9PT0gdW5kZWZpbmVkICYmIGVtcHR5ICYmIHRoaXMuX2FjdGl2YXRpbmdBZnRlclRydXN0O1xuXHRcdGNvbnN0IGdlbmVyaWNOb01vZGVscyA9IHJlYXNvbiA9PT0gdW5kZWZpbmVkICYmICFhY3RpdmF0aW5nICYmIGVtcHR5ICYmICF0aGlzLl9kZWxlZ2F0ZS5nZXRQcmVzZW50YXRpb25PcHRpb25zKCkuc2hvd0F1dG9Nb2RlbDtcblx0XHRyZXR1cm4geyByZWFzb24sIGFjdGl2YXRpbmcsIGdlbmVyaWNOb01vZGVscywgbm9Nb2RlbHM6IHJlYXNvbiAhPT0gdW5kZWZpbmVkIHx8IGFjdGl2YXRpbmcgfHwgZ2VuZXJpY05vTW9kZWxzIH07XG5cdH1cblxuXHQvKiogVGhpbiB3cmFwcGVyIG92ZXIge0BsaW5rIGNvbXB1dGVTaG91bGRTaG93Q2FjaGVCcmVha0hpbnR9IHRoYXQgc3VwcGxpZXMgdGhpcyBwaWNrZXIncyBsaXZlIHN0YXRlLiAqL1xuXHRwcml2YXRlIHNob3VsZFNob3dDYWNoZUJyZWFrSGludChleGNsdWRlQXV0b01vZGVsOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbXB1dGVTaG91bGRTaG93Q2FjaGVCcmVha0hpbnQoe1xuXHRcdFx0ZGlzbWlzc2VkOiB0aGlzLmlzQ2FjaGVCcmVha0hpbnREaXNtaXNzZWQoKSxcblx0XHRcdGNhY2hlV2FybTogdGhpcy5fZGVsZWdhdGUuaXNDYWNoZVdhcm0/LigpID8/IGZhbHNlLFxuXHRcdFx0bm9Nb2RlbHNBdmFpbGFibGU6IHRoaXMuX2F2YWlsYWJpbGl0eSgpLm5vTW9kZWxzLFxuXHRcdFx0ZXhjbHVkZUF1dG9Nb2RlbCxcblx0XHRcdHNlbGVjdGVkTW9kZWxJc0F1dG86ICEhdGhpcy5fc2VsZWN0ZWRNb2RlbCAmJiBpc0F1dG9Nb2RlbCh0aGlzLl9zZWxlY3RlZE1vZGVsKSxcblx0XHR9KTtcblx0fVxuXG5cdHNob3coYW5jaG9yPzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhbmNob3JFbGVtZW50ID0gYW5jaG9yID8/IHRoaXMuX2RvbU5vZGU7XG5cdFx0aWYgKCFhbmNob3JFbGVtZW50IHx8IHRoaXMuX2RvbU5vZGU/LmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fbmFtZUJ1dHRvbj8uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJykge1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzTW9kZWwgPSB0aGlzLl9zZWxlY3RlZE1vZGVsO1xuXG5cdFx0Y29uc3Qgb25TZWxlY3QgPSAobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcikgPT4ge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRNb2RlbENoYW5nZUV2ZW50LCBDaGF0TW9kZWxDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oJ2NoYXQubW9kZWxDaGFuZ2UnLCB7XG5cdFx0XHRcdGZyb21Nb2RlbDogcHJldmlvdXNNb2RlbD8ubWV0YWRhdGEudmVuZG9yID09PSAnY29waWxvdCcgPyBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKHByZXZpb3VzTW9kZWwuaWRlbnRpZmllcikgOiAndW5rbm93bicsXG5cdFx0XHRcdHRvTW9kZWw6IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gJ2NvcGlsb3QnID8gbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShtb2RlbC5pZGVudGlmaWVyKSA6ICd1bmtub3duJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25JZDogdGhpcy5fZGVsZWdhdGUuZ2V0Q2hhdFNlc3Npb25JZD8uKClcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRNb2RlbCA9IG1vZGVsO1xuXHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUobW9kZWwpO1xuXHRcdH07XG5cblx0XHQvLyBTZWxlY3RpbmcgYSBtb2RlbCBmcm9tIGEgaG92ZXIncyBjb25maWcgYnV0dG9uOiBhcHBseSB0aGUgc2VsZWN0aW9uLFxuXHRcdC8vIGNsb3NlIHRoZSBtb2RlbCBwaWNrZXIsIHRoZW4gb3BlbiB0aGUgY29uZmlnIHBpY2tlciBmb2N1c2VkIG9uIHRoZVxuXHRcdC8vIHJlcXVlc3RlZCBzZWN0aW9uIChUaGlua2luZyBFZmZvcnQgb3IgQ29udGV4dCBTaXplKS5cblx0XHRjb25zdCBvbkNvbmZpZ3VyZSA9IChtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBncm91cDogc3RyaW5nKSA9PiB7XG5cdFx0XHRvblNlbGVjdChtb2RlbCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24uc2hvdyh0aGlzLl9jb25maWdCdXR0b24sIGdyb3VwKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fZGVsZWdhdGUuZ2V0TW9kZWxzKCk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uID0gdGhpcy5fZGVsZWdhdGUuZ2V0UHJlc2VudGF0aW9uT3B0aW9ucygpO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldE1vZGVsc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdGNvbnN0IGNvbnRyb2xNb2RlbHNGb3JUaWVyOiBJU3RyaW5nRGljdGlvbmFyeTxJTW9kZWxDb250cm9sRW50cnk+ID0gZ2V0TW9kZWxQaWNrZXJDb250cm9sTW9kZWxzKG1hbmlmZXN0LCB0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQsIG1vZGVscyk7XG5cdFx0Y29uc3QgY2FuU2hvd01hbmFnZU1vZGVsc0FjdGlvbiA9IHByZXNlbnRhdGlvbi5zaG93TWFuYWdlTW9kZWxzQWN0aW9uICYmIHNob3VsZFNob3dNYW5hZ2VNb2RlbHNBY3Rpb24odGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBtYW5hZ2VNb2RlbHNBY3Rpb24gPSBjYW5TaG93TWFuYWdlTW9kZWxzQWN0aW9uID8gY3JlYXRlTWFuYWdlTW9kZWxzQWN0aW9uKHRoaXMuX2NvbW1hbmRTZXJ2aWNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBsb2dNb2RlbFBpY2tlckludGVyYWN0aW9uID0gKGludGVyYWN0aW9uOiBDaGF0TW9kZWxQaWNrZXJJbnRlcmFjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRNb2RlbFBpY2tlckludGVyYWN0aW9uRXZlbnQsIENoYXRNb2RlbFBpY2tlckludGVyYWN0aW9uQ2xhc3NpZmljYXRpb24+KCdjaGF0Lm1vZGVsUGlja2VySW50ZXJhY3Rpb24nLCB7IGludGVyYWN0aW9uIH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgbWFuYWdlU2V0dGluZ3NVcmwgPSB0aGlzLl9kZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5jb3BpbG90U2V0dGluZ3MpO1xuXHRcdGNvbnN0IG9uVG9nZ2xlUGluID0gKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nLCBwaW5uZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChwaW5uZWQpIHtcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnBpbk1vZGVsKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UudW5waW5Nb2RlbChtb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmUtc2hvdyB0aGUgcGlja2VyIHRvIHJlZmxlY3QgdGhlIHVwZGF0ZWQgcGluIHN0YXRlXG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdHRoaXMuc2hvdyhhbmNob3JFbGVtZW50KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBidWlsZE1vZGVsUGlja2VySXRlbXMoe1xuXHRcdFx0bW9kZWxzLFxuXHRcdFx0c2VsZWN0ZWRNb2RlbElkOiB0aGlzLl9zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0cmVjZW50TW9kZWxJZHM6IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRSZWNlbnRseVVzZWRNb2RlbElkcygpLmZpbHRlcihpZCA9PiAhdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxIaWRkZW4oaWQpKSxcblx0XHRcdHBpbm5lZE1vZGVsSWRzOiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0UGlubmVkTW9kZWxJZHMoKS5maWx0ZXIoaWQgPT4gIXRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5pc01vZGVsSGlkZGVuKGlkKSksXG5cdFx0XHRjb250cm9sTW9kZWxzOiBjb250cm9sTW9kZWxzRm9yVGllcixcblx0XHRcdGN1cnJlbnRWU0NvZGVWZXJzaW9uOiB0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0dXBkYXRlU3RhdGVUeXBlOiB0aGlzLl91cGRhdGVTZXJ2aWNlLnN0YXRlLnR5cGUsXG5cdFx0XHRtYW5hZ2VTZXR0aW5nc1VybCxcblx0XHRcdG1hbmFnZU1vZGVsc0FjdGlvbixcblx0XHRcdGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IHRoaXMuX2VudGl0bGVtZW50U2VydmljZSxcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZTogdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0b3BlbmVyU2VydmljZTogdGhpcy5fb3BlbmVyU2VydmljZSxcblx0XHRcdHByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHQuLi5wcmVzZW50YXRpb24sXG5cdFx0XHRcdHJlc3RyaWN0ZWRNb2RlOiB0aGlzLmlzUmVzdHJpY3RlZE1vZGUoKSxcblx0XHRcdFx0c2V0dXBSZXF1aXJlZDogdGhpcy5pc1NldHVwUmVxdWlyZWQoKSxcblx0XHRcdFx0aXNVQkI6ICEhdGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyxcblx0XHRcdH0sXG5cdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdG9uU2VsZWN0LFxuXHRcdFx0XHRvblRvZ2dsZVBpbixcblx0XHRcdFx0b25Db25maWd1cmUsXG5cdFx0XHRcdG9uUmVxdWVzdFRydXN0OiAoKSA9PiB7IHZvaWQgdGhpcy5fcmVxdWVzdFdvcmtzcGFjZVRydXN0KCk7IH0sXG5cdFx0XHRcdG9uUmVxdWVzdFNldHVwOiAoKSA9PiB7IHRoaXMuX3JlcXVlc3RTZXR1cCgpOyB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIENvbGxlY3QgYWxsIGhvdmVyIGRpc3Bvc2FibGVzIHNvIHRoZXkgYXJlIHByb3Blcmx5IGNsZWFuZWQgdXAgd2hlbiB0aGVcblx0XHQvLyBwaWNrZXIgaXMgaGlkZGVuLiBUaGUgQWN0aW9uTGlzdFdpZGdldCBvbmx5IHRyYWNrcyB0aGUgZGlzcG9zYWJsZSBmb3IgdGhlXG5cdFx0Ly8gY3VycmVudGx5LXNob3duIGhvdmVyOyBhbGwgb3RoZXIgaXRlbXMnIGhvdmVyIGRpc3Bvc2FibGVzIHdvdWxkIGxlYWsuXG5cdFx0Y29uc3QgaG92ZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLmhvdmVyPy5kaXNwb3NhYmxlKSB7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGl0ZW0uaG92ZXIuZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSB0aGUgZmlsdGVyIGluIHRoZSB1bmF2YWlsYWJsZSBzdGF0ZXMgKFJlc3RyaWN0ZWQgTW9kZSAvIHNldHVwXG5cdFx0Ly8gcmVxdWlyZWQpOiB0aGUgb25seSBlbnRyaWVzIGFyZSB0aGUgZXhwbGFuYXRvcnkgaGVhZGVyIGFuZCB0aGUgVHJ1c3QgL1xuXHRcdC8vIFNpZ24gSW4gYWN0aW9uLCBzbyBhIHNlYXJjaCBmaWVsZCB3b3VsZCBqdXN0IGxldCB1c2VycyBmaWx0ZXIgdGhyb3VnaFxuXHRcdC8vIHN0YWxlLCB1bnVzYWJsZSBtb2RlbHMuIFNob3duIG90aGVyd2lzZSAoaXQgYWxzbyBob3N0cyB0aGUgc2Vjb25kYXJ5XG5cdFx0Ly8gaGVhZGluZykuXG5cdFx0Y29uc3QgdW5hdmFpbGFibGUgPSB0aGlzLmlzUmVzdHJpY3RlZE1vZGUoKSB8fCB0aGlzLmlzU2V0dXBSZXF1aXJlZCgpO1xuXHRcdGNvbnN0IHNob3dDYWNoZUJyZWFrSGludCA9IHRoaXMuc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50KC8qIGV4Y2x1ZGVBdXRvTW9kZWwgKi8gdHJ1ZSk7XG5cdFx0Y29uc3QgbGlzdE9wdGlvbnMgPSB3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uKHtcblx0XHRcdGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWRyb3Bkb3duJyxcblx0XHRcdGhlYWRlclRleHQ6IHNob3dDYWNoZUJyZWFrSGludCA/IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmNhY2hlQnJlYWtIaW50JywgXCJTd2l0Y2hpbmcgbW9kZWxzIG1pZC1zZXNzaW9uIHJlc2V0cyB0aGUgcHJvbXB0IGNhY2hlIGFuZCBtYXkgaW5jcmVhc2UgY29zdC5cIikgOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJJY29uOiBzaG93Q2FjaGVCcmVha0hpbnQgPyBDb2RpY29uLmluZm8gOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJMaW5rOiBzaG93Q2FjaGVCcmVha0hpbnQgPyB0aGlzLmdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJEaXNtaXNzOiBzaG93Q2FjaGVCcmVha0hpbnQgPyAoKSA9PiB0aGlzLmRpc21pc3NDYWNoZUJyZWFrSGludCgpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0ZpbHRlcjogIXVuYXZhaWxhYmxlLFxuXHRcdFx0ZmlsdGVyUGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnNlYXJjaCcsIFwiU2VhcmNoIG1vZGVsc1wiKSxcblx0XHRcdGZvY3VzRmlsdGVyT25PcGVuOiB0cnVlLFxuXHRcdFx0Y29sbGFwc2VkQnlEZWZhdWx0OiBuZXcgU2V0KFtNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXJdKSxcblx0XHRcdG9uRGlkVG9nZ2xlU2VjdGlvbjogKHNlY3Rpb246IHN0cmluZywgY29sbGFwc2VkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmIChzZWN0aW9uID09PSBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIpIHtcblx0XHRcdFx0XHRsb2dNb2RlbFBpY2tlckludGVyYWN0aW9uKGNvbGxhcHNlZCA/ICdvdGhlck1vZGVsc0NvbGxhcHNlZCcgOiAnb3RoZXJNb2RlbHNFeHBhbmRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bGlua0hhbmRsZXI6ICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2NvbW1hbmQnICYmIHVyaS5wYXRoID09PSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJykge1xuXHRcdFx0XHRcdGxvZ01vZGVsUGlja2VySW50ZXJhY3Rpb24oJ3ByZW1pdW1Nb2RlbFVwZ3JhZGVQbGFuQ2xpY2tlZCcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1hbmFnZVNldHRpbmdzVXJsICYmIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1cmksIFVSSS5wYXJzZShtYW5hZ2VTZXR0aW5nc1VybCkpKSB7XG5cdFx0XHRcdFx0bG9nTW9kZWxQaWNrZXJJbnRlcmFjdGlvbignZGlzYWJsZWRNb2RlbENvbnRhY3RBZG1pbkNsaWNrZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0XHRtaW5XaWR0aDogMjAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCA9IGRvbS5nZXRBY3RpdmVFbGVtZW50KCk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHtcblx0XHRcdG9uU2VsZWN0OiAoYWN0aW9uOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24pID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX25hbWVCdXR0b24/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQocHJldmlvdXNseUZvY3VzZWRFbGVtZW50KSkge1xuXHRcdFx0XHRcdHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX25hbWVCdXR0b24/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3coXG5cdFx0XHQnQ2hhdE1vZGVsUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdGFuY2hvckVsZW1lbnQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdGdldE1vZGVsUGlja2VyQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRsaXN0T3B0aW9uc1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVCYWRnZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYmFkZ2VJY29uKSB7XG5cdFx0XHRpZiAodGhpcy5fYmFkZ2UpIHtcblx0XHRcdFx0Y29uc3QgaWNvbiA9IHRoaXMuX2JhZGdlID09PSAnaW5mbycgPyBDb2RpY29uLmluZm8gOiBDb2RpY29uLndhcm5pbmc7XG5cdFx0XHRcdGRvbS5yZXNldCh0aGlzLl9iYWRnZUljb24sIHJlbmRlckljb24oaWNvbikpO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnaW5mbycsIHRoaXMuX2JhZGdlID09PSAnaW5mbycpO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsIHRoaXMuX2JhZGdlID09PSAnd2FybmluZycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYmFkZ2VJY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlIHx8ICF0aGlzLl9uYW1lQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBuYW1lIH0gPSB0aGlzLl9zZWxlY3RlZE1vZGVsPy5tZXRhZGF0YSB8fCB7fTtcblxuXHRcdGNvbnN0IHsgcmVhc29uLCBhY3RpdmF0aW5nLCBnZW5lcmljTm9Nb2RlbHMsIG5vTW9kZWxzOiBub01vZGVsc0F2YWlsYWJsZSB9ID0gdGhpcy5fYXZhaWxhYmlsaXR5KCk7XG5cdFx0Y29uc3QgcmVzdHJpY3RlZE1vZGUgPSByZWFzb24gPT09IE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24uUmVzdHJpY3RlZDtcblx0XHRjb25zdCBzZXR1cFJlcXVpcmVkID0gcmVhc29uID09PSBNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLlNldHVwUmVxdWlyZWQ7XG5cdFx0Y29uc3QgdW5hdmFpbGFibGUgPSByZWFzb24gIT09IHVuZGVmaW5lZDtcblxuXHRcdC8vIC0tLSBOYW1lIHNlY3Rpb24gLS0tXG5cdFx0Y29uc3QgbmFtZUNoaWxkcmVuOiAoSFRNTEVsZW1lbnQgfCBzdHJpbmcpW10gPSBbXTtcblx0XHRjb25zdCBtb2RlbEljb24gPSB0aGlzLl9zZWxlY3RlZE1vZGVsXG5cdFx0XHQ/ICh0aGlzLl9zZWxlY3RlZE1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24gPz8gKHRoaXMuX2RlbGVnYXRlLmdldFByZXNlbnRhdGlvbk9wdGlvbnMoKS5zaG93TW9kZWxJY29uID8gZ2V0TW9kZWxQaWNrZXJJY29uKHRoaXMuX3NlbGVjdGVkTW9kZWwpIDogdW5kZWZpbmVkKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbXBhY3QgPSB0aGlzLl9jb21wYWN0Py5nZXQoKSA/PyBmYWxzZTtcblx0XHRpZiAobW9kZWxJY29uICYmICFub01vZGVsc0F2YWlsYWJsZSkge1xuXHRcdFx0bmFtZUNoaWxkcmVuLnB1c2gocmVuZGVySWNvbihtb2RlbEljb24pKTtcblx0XHR9XG5cdFx0Ly8gQSBcIk1vZGVsc1wiIHBsYWNlaG9sZGVyIChubyBiYWRnZSkgYmVhdHMgYSBkZWFkLWVuZCBsYWJlbCB3aGlsZSB1bmF2YWlsYWJsZSBcdTIwMTQgdGhlIGhvdmVyIGFuZFxuXHRcdC8vIGRyb3Bkb3duIGNhcnJ5IHRoZSBSZXN0cmljdGVkIE1vZGUgZXhwbGFuYXRpb24gYW5kIHRoZSBUcnVzdCBXb3Jrc3BhY2UgLyBTaWduIEluIGFjdGlvbi5cblx0XHQvLyBcIkFjdGl2YXRpbmcuLi5cIiBpcyB0cmFuc2llbnQgd2hpbGUgbW9kZWxzIGxvYWQgYWZ0ZXIgYSBUcnVzdCBncmFudDsgXCJObyBtb2RlbHMgYXZhaWxhYmxlXCJcblx0XHQvLyBpcyB0aGUgZ2VudWluZWx5IGVtcHR5IHN0YXRlIChlLmcuIGFuIGFnZW50LWhvc3Qgc2Vzc2lvbiB3aXRoIG5vIEF1dG8gZmFsbGJhY2spLlxuXHRcdGNvbnN0IG1vZGVsTGFiZWwgPSB1bmF2YWlsYWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5tb2RlbHNMYWJlbCcsIFwiTW9kZWxzXCIpXG5cdFx0XHQ6IGFjdGl2YXRpbmdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5hY3RpdmF0aW5nJywgXCJBY3RpdmF0aW5nLi4uXCIpXG5cdFx0XHRcdDogZ2VuZXJpY05vTW9kZWxzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5ub01vZGVscycsIFwiTm8gbW9kZWxzIGF2YWlsYWJsZVwiKVxuXHRcdFx0XHRcdDogKG5hbWUgPz8gbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuYXV0bycsIFwiQXV0b1wiKSk7XG5cdFx0aWYgKCFjb21wYWN0IHx8ICFtb2RlbEljb24gfHwgbm9Nb2RlbHNBdmFpbGFibGUpIHtcblx0XHRcdG5hbWVDaGlsZHJlbi5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBtb2RlbExhYmVsKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9iYWRnZUljb24pIHtcblx0XHRcdG5hbWVDaGlsZHJlbi5wdXNoKHRoaXMuX2JhZGdlSWNvbik7XG5cdFx0fVxuXHRcdGRvbS5yZXNldCh0aGlzLl9uYW1lQnV0dG9uLCAuLi5uYW1lQ2hpbGRyZW4pO1xuXG5cdFx0aWYgKHRoaXMuX2NvbmZpZ0J1dHRvbikge1xuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi5yZW5kZXJCdXR0b24odGhpcy5fY29uZmlnQnV0dG9uLCBjb21wYWN0LCBub01vZGVsc0F2YWlsYWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXJpYSBcdTIwMTQgbmFtZSB0aGUgY29udHJvbCBcIk1vZGVsc1wiIHRvIG1hdGNoIHRoZSB2aXNpYmxlIGxhYmVsOyB0aGUgY29tbWFcblx0XHQvLyBzZXBhcmF0ZXMgdGhlIGNvbnRyb2wgbmFtZSBmcm9tIGl0cyBjdXJyZW50IHZhbHVlIC8gc3RhdGUuXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gcmVzdHJpY3RlZE1vZGVcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuYXJpYUxhYmVsUmVzdHJpY3RlZCcsIFwiTW9kZWxzLCB1bmF2YWlsYWJsZSB3aGlsZSBpbiBSZXN0cmljdGVkIG1vZGVcIilcblx0XHRcdDogc2V0dXBSZXF1aXJlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmFyaWFMYWJlbFNldHVwUmVxdWlyZWQnLCBcIk1vZGVscywgc2lnbiBpbiB0byB1c2UgQ29waWxvdFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmFyaWFMYWJlbCcsIFwiTW9kZWxzLCB7MH1cIiwgbW9kZWxMYWJlbCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdFx0dGhpcy5fbmFtZUJ1dHRvbi5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBRVAsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzRSw4QkFBOEI7QUFDcEcsU0FBUyxtQkFBbUIsK0JBQStCO0FBRTNELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYSw4QkFBOEI7QUFDcEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0MscUNB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
