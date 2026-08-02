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
import "./media/agentHostSessionConfigPicker.css";
import * as dom from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, constObservable } from "../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { defaultCheckboxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ChatConfiguration, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js";
import { ChatContextKeyExprs, ChatContextKeys } from "../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { markOnboardingTarget } from "../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionProviderIdContext, IsPhoneLayoutContext, IsQuickChatSessionContext } from "../../../../common/contextkeys.js";
import { IWorkbenchLayoutService } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { reportNewChatPickerClosed } from "../../../chat/browser/newChatPickerTelemetry.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../../services/sessions/browser/sessionContext.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { isAgentHostProvider, LOCAL_AGENT_HOST_PROVIDER_ID, REMOTE_AGENT_HOST_PROVIDER_RE } from "../../../../common/agentHostSessionsProvider.js";
import { MobilePermissionPicker } from "../../copilotChatSessions/browser/mobilePermissionPicker.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { showMobilePickerSheet } from "../../../../browser/parts/mobile/mobilePickerSheet.js";
import { AgentHostModePicker } from "./agentHostModePicker.js";
import { MobileAgentHostModePicker } from "./mobile/mobileAgentHostModePicker.js";
import { AgentHostPermissionPickerActionItem } from "./agentHostPermissionPickerActionItem.js";
import { AgentHostPermissionPickerDelegate, isWellKnownAutoApproveSchema, isWellKnownClaudePermissionModeSchema, isWellKnownCodexApprovalsSchema, isWellKnownModeSchema } from "./agentHostPermissionPickerDelegate.js";
import { SessionConfigKey } from "../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { AgentHostClaudePermissionModePicker } from "./agentHostClaudePermissionModePicker.js";
import { ClaudeSessionConfigKey } from "../../../../../platform/agentHost/common/claudeSessionConfigKeys.js";
import { AgentHostCodexApprovalsPicker } from "./agentHostCodexApprovalsPicker.js";
import { isAutoApproveValuePolicyRestricted } from "../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js";
import { CodexSessionConfigKey } from "../../../../../platform/agentHost/common/codexSessionConfigKeys.js";
const IsActiveSessionRemoteAgentHost = ContextKeyExpr.regex(SessionProviderIdContext.key, REMOTE_AGENT_HOST_PROVIDER_RE);
const IsActiveSessionLocalAgentHost = ContextKeyExpr.equals(SessionProviderIdContext.key, LOCAL_AGENT_HOST_PROVIDER_ID);
function showActiveSessionModePicker(accessor) {
  const activeElement = dom.getActiveElement();
  const anchor = dom.isHTMLElement(activeElement) ? activeElement : dom.getActiveDocument().body;
  const picker = accessor.get(IInstantiationService).createInstance(
    isPhoneLayout(accessor.get(IWorkbenchLayoutService)) ? MobileAgentHostModePicker : AgentHostModePicker,
    accessor.get(ISessionsService).activeSession
  );
  if (!picker.showPicker(anchor, () => picker.dispose())) {
    picker.dispose();
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "sessions.agentHost.sessionConfigPicker",
      title: localize2("agentHostSessionConfigPicker", "Session Configuration"),
      f1: false,
      menu: [{
        id: Menus.NewSessionRepositoryConfig,
        group: "navigation",
        order: 3,
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
          IsQuickChatSessionContext.negate()
        )
      }]
    });
  }
  async run() {
  }
});
function getConfigIcon(property, value) {
  if (property === SessionConfigKey.Isolation) {
    if (value === "folder") {
      return Codicon.folder;
    }
    if (value === "worktree") {
      return Codicon.worktree;
    }
  }
  if (property === SessionConfigKey.Branch) {
    return Codicon.gitBranch;
  }
  if (property === SessionConfigKey.AutoApprove) {
    if (value === "autopilot") {
      return Codicon.rocket;
    }
    if (value === "autoApprove") {
      return Codicon.warning;
    }
    if (value === "assisted") {
      return Codicon.sparkle;
    }
    return Codicon.shield;
  }
  return void 0;
}
function toActionItems(property, items, currentValue, policyRestricted) {
  return items.map((item) => {
    const disabled = property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(item.value, policyRestricted === true);
    return {
      kind: ActionListItemKind.Action,
      label: item.label,
      detail: disabled ? localize("agentHostSessionConfig.policyDisabled", "Disabled by your organization. Contact your administrator.") : item.description,
      group: { title: "", icon: getConfigIcon(property, item.value) },
      disabled,
      item: { ...item, checked: isSelectedValue(currentValue, item.value) }
    };
  });
}
function isSelectedValue(currentValue, itemValue) {
  if (typeof currentValue === "boolean") {
    return currentValue === (itemValue === "true");
  }
  return itemValue === currentValue;
}
function renderPickerTrigger(slot, disabled, disposables, onOpen) {
  const trigger = dom.append(slot, disabled ? dom.$("span.action-label") : dom.$("a.action-label"));
  if (disabled) {
    trigger.setAttribute("aria-readonly", "true");
  } else {
    trigger.role = "button";
    trigger.tabIndex = 0;
    trigger.setAttribute("aria-haspopup", "listbox");
    disposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      disposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        onOpen();
      }));
    }
    disposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        onOpen();
      }
    }));
  }
  slot.classList.toggle("disabled", disabled);
  return trigger;
}
function applyAutoApproveFiltering(items, property, configurationService) {
  if (property !== SessionConfigKey.AutoApprove) {
    return { items, policyRestricted: false };
  }
  const policyRestricted = configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
  return { items, policyRestricted };
}
async function confirmAutoApproveLevel(value, label, dialogService, storageService) {
  if (!isChatPermissionLevel(value)) {
    return true;
  }
  return maybeConfirmElevatedPermissionLevel(value, dialogService, storageService, { defaultSettingKey: ChatConfiguration.DefaultConfiguration, levelLabel: label });
}
function applyAutoApproveTriggerStyles(trigger, property, value) {
  if (property === SessionConfigKey.AutoApprove) {
    trigger.classList.toggle("warning", value === "autopilot" || value === "assisted");
    trigger.classList.toggle("info", value === "autoApprove");
  }
}
let AgentHostSessionConfigPicker = class extends Disposable {
  constructor(_session, _actionWidgetService, _configurationService, _contextKeyService, _dialogService, _hoverService, _sessionsProvidersService, _telemetryService, _layoutService, _storageService) {
    super();
    this._session = _session;
    this._actionWidgetService = _actionWidgetService;
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._dialogService = _dialogService;
    this._hoverService = _hoverService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._telemetryService = _telemetryService;
    this._layoutService = _layoutService;
    this._storageService = _storageService;
    this._renderDisposables = this._register(new DisposableStore());
    this._providerListeners = this._register(new DisposableMap());
    this._filterDelayer = this._register(new Delayer(200));
    /**
     * Session/property-scoped value→label cache for `enumDynamic`
     * properties (e.g. branch), populated whenever `_getItems` fetches
     * completions. `enumDynamic` completions are transient protocol
     * data — only `value` is persisted via `setSessionConfigValue`/
     * `resolveSessionConfig` — so this is the only place a completion's
     * `label` for a previously-picked value can be recovered once the
     * dropdown/sheet closes. Static `enum` properties don't need this:
     * their label is always derivable from `schema.enum`/`enumLabels`.
     *
     * Keyed by session so entries don't leak across sessions: this picker
     * is only ever created for the new-session composer (`Menus.NewSession-
     * RepositoryConfig`), and that composer's `_session` tracks the
     * globally active session — so the *same* picker instance can observe
     * a sequence of different (not-yet-created) draft sessions as the user
     * switches between them. `_renderConfigPickers` evicts entries for any
     * session other than the current one on every render, so the map never
     * grows beyond the properties of the currently active session.
     */
    this._dynamicValueLabels = /* @__PURE__ */ new Map();
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._renderConfigPickers();
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders((e) => {
      for (const provider of e.removed) {
        this._providerListeners.deleteAndDispose(provider.id);
      }
      this._watchProviders(e.added);
      this._renderConfigPickers();
    }));
    this._watchProviders(this._sessionsProvidersService.getProviders());
    this._register(this._contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([IsPhoneLayoutContext.key]))) {
        this._renderConfigPickers();
      }
    }));
  }
  _watchProviders(providers) {
    for (const provider of providers) {
      if (!isAgentHostProvider(provider) || this._providerListeners.has(provider.id)) {
        continue;
      }
      this._providerListeners.set(provider.id, provider.onDidChangeSessionConfig(() => this._renderConfigPickers()));
    }
  }
  render(container) {
    this._container = dom.append(container, dom.$(".sessions-chat-agent-host-config"));
    this._renderConfigPickers();
  }
  _renderConfigPickers() {
    if (!this._container) {
      return;
    }
    this._renderDisposables.clear();
    dom.clearNode(this._container);
    const session = this._session.get();
    this._evictDynamicValueLabelsForOtherSessions(session?.sessionId);
    const provider = session ? this._getProvider(session.providerId) : void 0;
    const resolvedConfig = session && provider?.getSessionConfig(session.sessionId);
    if (!session || !provider || !resolvedConfig) {
      return;
    }
    const isNewSession = provider.getCreateSessionConfig(session.sessionId) !== void 0;
    const isLoading = provider.isSessionConfigResolving(session.sessionId).get();
    const properties = this._orderProperties(Object.entries(resolvedConfig.schema.properties));
    for (const [property, schema] of properties) {
      if (!this._isPickable(schema)) {
        continue;
      }
      if (property === SessionConfigKey.WorktreeBranchTrack) {
        continue;
      }
      if (property === SessionConfigKey.Isolation && !schema.enum?.includes("worktree")) {
        continue;
      }
      if (!this._shouldRenderProperty(property, schema, isNewSession)) {
        continue;
      }
      if (property === SessionConfigKey.AutoApprove && isWellKnownAutoApproveSchema(schema)) {
        continue;
      }
      if (property === SessionConfigKey.Mode && isWellKnownModeSchema(schema)) {
        continue;
      }
      if (property === ClaudeSessionConfigKey.PermissionMode && isWellKnownClaudePermissionModeSchema(schema)) {
        continue;
      }
      if (property === CodexSessionConfigKey.PermissionsPreset && isWellKnownCodexApprovalsSchema(schema)) {
        continue;
      }
      const value = resolvedConfig.values[property] ?? schema.default;
      const isReadOnly = this._isReadOnlyChip(property, schema, isNewSession);
      const slot = dom.append(this._container, dom.$(".sessions-chat-picker-slot"));
      if (property === SessionConfigKey.Isolation) {
        this._renderDisposables.add(markOnboardingTarget(slot, "sessions.newSession.isolation"));
      }
      if (property === SessionConfigKey.Isolation && this._shouldRenderIsolationAsCheckbox(schema)) {
        this._renderIsolationCheckbox(slot, provider, session.sessionId, schema, value, isReadOnly, !isReadOnly && isLoading);
        continue;
      }
      const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(provider, session.sessionId, property, schema, trigger));
      const tooltip = property === SessionConfigKey.Branch && isReadOnly ? void 0 : schema.description ?? schema.title;
      if (tooltip) {
        this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, { content: tooltip }));
      }
      if (!isReadOnly && isLoading) {
        slot.classList.add("disabled");
        trigger.setAttribute("aria-disabled", "true");
      }
      this._renderTrigger(trigger, session.sessionId, property, schema, value, isReadOnly);
    }
  }
  _isPickable(schema) {
    if (schema.type === "boolean") {
      return true;
    }
    if (schema.type !== "string") {
      return false;
    }
    return !!schema.enumDynamic || Array.isArray(schema.enum) && schema.enum.length > 0;
  }
  /**
   * Order the schema properties for rendering. The base implementation
   * enforces a stable visual sequence for well-known properties:
   * Isolation (worktree/folder) first, then Branch. Any other properties
   * keep their original schema order after these two. Subclasses can
   * override to impose a different deterministic visual sequence
   * (e.g. the mobile chip row groups Approvals | Branch | Worktree).
   */
  _orderProperties(properties) {
    const order = /* @__PURE__ */ new Map([
      [SessionConfigKey.Isolation, 0],
      [SessionConfigKey.Branch, 1]
    ]);
    return properties.map(([key, schema], index) => ({ key, schema, index })).sort((a, b) => {
      const aRank = order.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const bRank = order.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank || a.index - b.index;
    }).map(({ key, schema }) => [key, schema]);
  }
  /**
   * Decide whether a property's chip should be rendered for the current
   * session. The base implementation hides non-mutable properties in
   * running sessions (they would render as dead pills). Subclasses can
   * override to keep specific properties visible as readonly chips —
   * see {@link _isReadOnlyChip}.
   */
  _shouldRenderProperty(property, schema, isNewSession) {
    return isNewSession || !!schema.sessionMutable;
  }
  /**
   * Decide whether a property's trigger should render as readonly
   * (no chevron, no popup). The base implementation defers to the
   * schema's `readOnly` flag. Subclasses that opt in to rendering
   * non-mutable chips via {@link _shouldRenderProperty} should
   * override this to also mark them readonly at runtime.
   */
  _isReadOnlyChip(property, schema, isNewSession) {
    return !!schema.readOnly;
  }
  _renderTrigger(trigger, sessionId, property, schema, value, isReadOnly) {
    dom.clearNode(trigger);
    const icon = getConfigIcon(property, value);
    if (icon) {
      dom.append(trigger, renderIcon(icon));
    }
    const labelSpan = dom.append(trigger, dom.$("span.sessions-chat-dropdown-label"));
    const label = this._getLabel(sessionId, property, schema, value);
    labelSpan.textContent = label;
    trigger.setAttribute("aria-label", isReadOnly ? localize("agentHostSessionConfig.triggerAriaReadOnly", "{0}: {1}, Read-Only", schema.title, label) : localize("agentHostSessionConfig.triggerAria", "{0}: {1}", schema.title, label));
    applyAutoApproveTriggerStyles(trigger, property, value);
  }
  /**
   * Whether the isolation property should render as a checkbox
   * (Worktree on/off) rather than a dropdown. Only on non-phone
   * layouts and only when the schema offers both folder and worktree.
   */
  _shouldRenderIsolationAsCheckbox(schema) {
    return !isPhoneLayout(this._layoutService) && Array.isArray(schema.enum) && schema.enum.includes("worktree") && schema.enum.includes("folder");
  }
  _renderIsolationCheckbox(slot, provider, sessionId, schema, value, isReadOnly, isLoading) {
    const disabled = isReadOnly || isLoading;
    const label = localize("agentHostSessionConfig.isolation.worktree", "New Worktree");
    slot.classList.add("sessions-chat-isolation-checkbox");
    slot.classList.toggle("disabled", disabled);
    const row = dom.append(slot, dom.$(".action-label"));
    const checkbox = this._renderDisposables.add(new Checkbox(label, value === "worktree", { ...defaultCheckboxStyles, size: 14 }));
    if (disabled) {
      checkbox.disable();
    }
    dom.append(row, checkbox.domNode);
    const labelSpan = dom.append(row, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    const worktreeIndex = schema.enum?.indexOf("worktree") ?? -1;
    const tooltip = (worktreeIndex >= 0 ? schema.enumDescriptions?.[worktreeIndex] : void 0) ?? schema.description ?? schema.title;
    if (tooltip) {
      this._renderDisposables.add(this._hoverService.setupDelayedHover(row, { content: tooltip }));
    }
    const applyValue = (checked) => {
      const before = provider.getSessionConfig(sessionId)?.values[SessionConfigKey.Isolation] ?? schema.default;
      const nextValue = checked ? "worktree" : "folder";
      reportNewChatPickerClosed(this._telemetryService, {
        id: "NewChatAgentHostSessionConfigPicker",
        name: `NewChatAgentHostSessionConfigPicker.${SessionConfigKey.Isolation}`,
        optionIdBefore: typeof before === "string" ? before : void 0,
        optionIdAfter: nextValue,
        optionLabelBefore: typeof before === "string" ? this._getLabel(sessionId, SessionConfigKey.Isolation, schema, before) : void 0,
        optionLabelAfter: this._getLabel(sessionId, SessionConfigKey.Isolation, schema, nextValue),
        isPII: false
      });
      provider.setSessionConfigValue(sessionId, SessionConfigKey.Isolation, nextValue).catch(() => {
      });
    };
    this._renderDisposables.add(checkbox.onChange(() => applyValue(checkbox.checked)));
    if (!disabled) {
      this._renderDisposables.add(Gesture.addTarget(row));
      for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
        this._renderDisposables.add(dom.addDisposableListener(row, eventType, (e) => {
          dom.EventHelper.stop(e, true);
          checkbox.checked = !checkbox.checked;
          applyValue(checkbox.checked);
        }));
      }
    }
  }
  async _showPicker(provider, sessionId, property, schema, trigger) {
    if (schema.readOnly || this._actionWidgetService.isVisible) {
      return;
    }
    if (provider.isSessionConfigResolving(sessionId).get()) {
      return;
    }
    const rawItems = await this._getItems(provider, sessionId, property, schema);
    const { items, policyRestricted } = applyAutoApproveFiltering(rawItems, property, this._configurationService);
    if (items.length === 0) {
      return;
    }
    const isAutoApproveProperty = property === SessionConfigKey.AutoApprove;
    const currentValue = provider.getSessionConfig(sessionId)?.values[property] ?? schema.default;
    const currentItem = items.find((i) => isSelectedValue(currentValue, i.value));
    const actionItems = toActionItems(property, items, currentValue, policyRestricted);
    const delegate = {
      onSelect: async (item) => {
        this._actionWidgetService.hide();
        reportNewChatPickerClosed(this._telemetryService, {
          id: "NewChatAgentHostSessionConfigPicker",
          name: `NewChatAgentHostSessionConfigPicker.${property}`,
          optionIdBefore: typeof currentValue === "string" ? currentValue : void 0,
          optionIdAfter: item.value,
          optionLabelBefore: currentItem?.label,
          optionLabelAfter: item.label,
          isPII: !!schema.enumDynamic
        });
        if (isAutoApproveProperty && item.value !== "default") {
          const confirmed = await confirmAutoApproveLevel(item.value, item.label, this._dialogService, this._storageService);
          if (!confirmed) {
            return;
          }
        }
        const nextValue = schema.type === "boolean" ? item.value === "true" : item.value;
        provider.setSessionConfigValue(sessionId, property, nextValue).catch(() => {
        });
      },
      onFilter: schema.enumDynamic ? (query) => this._filterDelayer.trigger(async () => {
        const filteredRawItems = await this._getItems(provider, sessionId, property, schema, query);
        const { items: filteredItems, policyRestricted: filteredPolicyRestricted } = applyAutoApproveFiltering(filteredRawItems, property, this._configurationService);
        return toActionItems(property, filteredItems, provider.getSessionConfig(sessionId)?.values[property] ?? schema.default, filteredPolicyRestricted);
      }) : void 0,
      onHide: () => trigger.focus()
    };
    this._actionWidgetService.show(
      `agentHostSessionConfig.${property}`,
      false,
      actionItems,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("agentHostSessionConfig.ariaLabel", "{0} Picker", schema.title)
      },
      actionItems.length > 10 ? { showFilter: true, filterPlaceholder: localize("agentHostSessionConfig.filter", "Filter options..."), minWidth: 255 } : { minWidth: 255 }
    );
  }
  async _getItems(provider, sessionId, property, schema, query) {
    if (schema.type === "boolean") {
      return [
        { value: "true", label: localize("agentHostSessionConfig.boolean.true", "On") },
        { value: "false", label: localize("agentHostSessionConfig.boolean.false", "Off") }
      ];
    }
    const dynamicItems = schema.enumDynamic ? await provider.getSessionConfigCompletions(sessionId, property, query) : void 0;
    if (dynamicItems?.length) {
      const items = dynamicItems.map((item) => this._fromCompletionItem(item));
      this._cacheDynamicValueLabels(sessionId, property, items);
      return items;
    }
    return (schema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: schema.enumLabels?.[index] ?? String(value),
      description: schema.enumDescriptions?.[index]
    }));
  }
  _fromCompletionItem(item) {
    return {
      value: item.value,
      label: item.label,
      description: item.description
    };
  }
  _dynamicValueLabelsKey(sessionId, property) {
    return `${sessionId}\0${property}`;
  }
  _cacheDynamicValueLabels(sessionId, property, items) {
    const key = this._dynamicValueLabelsKey(sessionId, property);
    let labels = this._dynamicValueLabels.get(key);
    if (!labels) {
      labels = /* @__PURE__ */ new Map();
      this._dynamicValueLabels.set(key, labels);
    }
    for (const item of items) {
      labels.set(item.value, item.label);
    }
  }
  /**
   * Drops cached labels for any session other than `sessionId`. Called on
   * every render so the cache tracks whichever session the picker is
   * currently bound to, instead of accumulating entries for every draft
   * session this (potentially long-lived) picker instance has ever shown.
   */
  _evictDynamicValueLabelsForOtherSessions(sessionId) {
    if (!sessionId) {
      return;
    }
    const prefix = `${sessionId}\0`;
    for (const key of this._dynamicValueLabels.keys()) {
      if (!key.startsWith(prefix)) {
        this._dynamicValueLabels.delete(key);
      }
    }
  }
  _getLabel(sessionId, property, schema, value) {
    if (schema.type === "boolean") {
      return value === true ? localize("agentHostSessionConfig.boolean.onLabel", "On") : localize("agentHostSessionConfig.boolean.offLabel", "Off");
    }
    if (typeof value === "string") {
      if (schema.enumDynamic) {
        const key = this._dynamicValueLabelsKey(sessionId, property);
        const dynamicLabel = this._dynamicValueLabels.get(key)?.get(value);
        if (dynamicLabel) {
          return dynamicLabel;
        }
      }
      const index = schema.enum?.indexOf(value) ?? -1;
      return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
    }
    return schema.title;
  }
  _getProvider(providerId) {
    const provider = this._sessionsProvidersService.getProvider(providerId);
    return provider && isAgentHostProvider(provider) ? provider : void 0;
  }
};
AgentHostSessionConfigPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, ISessionsProvidersService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IStorageService)
], AgentHostSessionConfigPicker);
class MobileAgentHostSessionConfigPicker extends AgentHostSessionConfigPicker {
  /**
   * On phone the chip lane has a fixed visual sequence — Default
   * Approvals (rendered by a separate left-side picker), then Branch,
   * then Worktree. Sort the known repo-config properties to that
   * order; unknown properties fall through to schema-declared order
   * after the known ones.
   *
   * On desktop viewports this subclass is also instantiated (see the
   * factory in `AgentHostSessionConfigPickersContribution` — it always
   * picks the mobile-aware subclass so `_showPicker` can route to the
   * bottom sheet on phones), so we must defer to the base ordering
   * (Isolation first, Branch second) when not on a phone layout.
   */
  _orderProperties(properties) {
    if (!isPhoneLayout(this._layoutService)) {
      return super._orderProperties(properties);
    }
    const order = /* @__PURE__ */ new Map([
      [SessionConfigKey.Branch, 0],
      [SessionConfigKey.Isolation, 1]
    ]);
    return properties.slice().sort(([aKey], [bKey]) => {
      const a = order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
      const b = order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
      return a - b;
    });
  }
  /**
   * Keep Branch and Isolation visible in running sessions even when
   * the schema marks them non-mutable. Their value is informational
   * — the user wants to see what the running session is using —
   * and the chip renders as readonly via {@link _isReadOnlyChip}.
   * All other properties defer to the base behavior (hide if
   * non-mutable in a running session).
   */
  _shouldRenderProperty(property, schema, isNewSession) {
    const isUnifiedRepoProperty = property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch;
    return isUnifiedRepoProperty || super._shouldRenderProperty(property, schema, isNewSession);
  }
  /**
   * Mark non-mutable properties as readonly chips in running sessions
   * so taps don't try to open a picker (which would no-op at the
   * provider boundary). The schema's own `readOnly` flag still wins.
   */
  _isReadOnlyChip(property, schema, isNewSession) {
    return super._isReadOnlyChip(property, schema, isNewSession) || !isNewSession && !schema.sessionMutable;
  }
  async _showPicker(provider, sessionId, property, schema, trigger) {
    if (!isPhoneLayout(this._layoutService)) {
      return super._showPicker(provider, sessionId, property, schema, trigger);
    }
    if (provider.isSessionConfigResolving(sessionId).get()) {
      return;
    }
    if (property === SessionConfigKey.Isolation || property === SessionConfigKey.Branch) {
      await this._showUnifiedRepoSheet(provider, sessionId, trigger);
      return;
    }
    return super._showPicker(provider, sessionId, property, schema, trigger);
  }
  async _showUnifiedRepoSheet(provider, sessionId, trigger) {
    const config = provider.getSessionConfig(sessionId);
    if (!config) {
      return;
    }
    const isolationSchema = config.schema.properties[SessionConfigKey.Isolation];
    const branchSchema = config.schema.properties[SessionConfigKey.Branch];
    const [isolationItems, branchItems] = await Promise.all([
      isolationSchema && !isolationSchema.readOnly ? this._getItems(provider, sessionId, SessionConfigKey.Isolation, isolationSchema) : Promise.resolve([]),
      branchSchema && !branchSchema.readOnly ? this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema) : Promise.resolve([])
    ]);
    const isolationValue = config.values[SessionConfigKey.Isolation];
    const branchValue = config.values[SessionConfigKey.Branch];
    const sheetItems = [];
    const idToConfig = /* @__PURE__ */ new Map();
    const registerId = (property, value, label, isPII) => {
      const id = `repo-row-${idToConfig.size}`;
      idToConfig.set(id, { property, value, label, isPII });
      return id;
    };
    isolationItems.forEach((item, index) => {
      sheetItems.push({
        id: registerId(SessionConfigKey.Isolation, item.value, item.label, !!isolationSchema?.enumDynamic),
        label: item.label,
        description: item.description,
        icon: getConfigIcon(SessionConfigKey.Isolation, item.value),
        checked: item.value === isolationValue,
        sectionTitle: index === 0 ? isolationSchema?.title ?? localize("mobileAgentHostSessionConfig.repoSheet.isolationSection", "Isolation") : void 0
      });
    });
    const branchSectionTitle = branchSchema?.title ?? localize("mobileAgentHostSessionConfig.repoSheet.branchSection", "Base Branch");
    if (!branchSchema?.enumDynamic) {
      branchItems.forEach((item, index) => {
        sheetItems.push({
          id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema?.enumDynamic),
          label: item.label,
          description: item.description,
          icon: getConfigIcon(SessionConfigKey.Branch, item.value),
          checked: item.value === branchValue,
          sectionTitle: index === 0 ? branchSectionTitle : void 0
        });
      });
    }
    if (sheetItems.length === 0 && !branchSchema?.enumDynamic) {
      return;
    }
    let search;
    if (branchSchema?.enumDynamic && !branchSchema.readOnly) {
      search = {
        placeholder: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchPlaceholder", "Search branches"),
        ariaLabel: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchAria", "Search base branches"),
        resultsSectionTitle: branchSectionTitle,
        emptyMessage: localize("mobileAgentHostSessionConfig.repoSheet.branchSearchEmpty", "No matching branches."),
        loadItems: async (query, token) => {
          const items = query ? await this._getItems(provider, sessionId, SessionConfigKey.Branch, branchSchema, query) : branchItems;
          if (token.isCancellationRequested) {
            return [];
          }
          return items.map((item) => ({
            id: registerId(SessionConfigKey.Branch, item.value, item.label, !!branchSchema.enumDynamic),
            label: item.label,
            description: item.description,
            icon: getConfigIcon(SessionConfigKey.Branch, item.value),
            checked: item.value === branchValue
          }));
        }
      };
    }
    trigger.setAttribute("aria-expanded", "true");
    await showMobilePickerSheet(
      this._layoutService.mainContainer,
      localize("mobileAgentHostSessionConfig.repoSheet.title", "Worktree"),
      sheetItems,
      {
        search,
        // Keep the sheet open on row taps so the user can adjust
        // both isolation mode and branch without reopening. Each
        // tap writes through immediately; Done just dismisses.
        stayOpenOnSelect: true,
        onDidSelect: (id) => {
          const selection = idToConfig.get(id);
          if (selection) {
            const beforeValue = provider.getSessionConfig(sessionId)?.values[selection.property];
            reportNewChatPickerClosed(this._telemetryService, {
              id: "NewChatAgentHostSessionConfigPicker",
              name: `NewChatAgentHostSessionConfigPicker.${selection.property}`,
              optionIdBefore: typeof beforeValue === "string" ? beforeValue : void 0,
              optionIdAfter: selection.value,
              optionLabelBefore: void 0,
              optionLabelAfter: selection.label,
              isPII: selection.isPII
            });
            provider.setSessionConfigValue(sessionId, selection.property, selection.value).catch(() => {
            });
          }
        }
      }
    );
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  }
}
class PickerActionViewItem extends BaseActionViewItem {
  constructor(_picker, disposable) {
    super(void 0, { id: "", label: "", enabled: true, class: void 0, tooltip: "", run: () => {
    } });
    this._picker = _picker;
    if (disposable) {
      this._register(disposable);
    }
  }
  render(container) {
    this._picker.render(container);
  }
  dispose() {
    this._picker.dispose();
    super.dispose();
  }
}
let AgentHostSessionConfigPickerContribution = class extends Disposable {
  constructor(actionViewItemService, _layoutService) {
    super();
    this._layoutService = _layoutService;
    this._register(actionViewItemService.register(
      Menus.NewSessionRepositoryConfig,
      "sessions.agentHost.sessionConfigPicker",
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(MobileAgentHostSessionConfigPicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(
          isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
          session
        ));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(
          isPhoneLayout(this._layoutService) ? MobileAgentHostModePicker : AgentHostModePicker,
          session
        ));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_APPROVE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => this._createNewSessionPermissionPicker(scopedInstantiationService)
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_PERMISSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      Menus.NewSessionControl,
      NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_CONFIG_PICKER_ID,
      this._createRunningSessionPermissionPickerFactory()
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostClaudePermissionModePicker, session));
      }
    ));
    this._register(actionViewItemService.register(
      MenuId.ChatInputSecondary,
      RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        return new PickerActionViewItem(scopedInstantiationService.createInstance(AgentHostCodexApprovalsPicker, session));
      }
    ));
  }
  /**
   * On the new-chat page (left of the toolbar), use the sessions
   * {@link PermissionPicker} so the styling matches the surrounding sessions
   * pickers (font size, padding, icon size).
   */
  _createNewSessionPermissionPicker(instantiationService) {
    const { session } = instantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
    const delegate = instantiationService.createInstance(AgentHostPermissionPickerDelegate, session);
    const picker = instantiationService.createInstance(MobilePermissionPicker, delegate);
    return new PickerActionViewItem(picker, delegate);
  }
  /**
   * Inside a running chat widget (`ChatInputSecondary`), use the workbench
   * {@link PermissionPickerActionItem} so it matches the rest of the
   * chat-input secondary toolbar (which is what the extension-host CLI
   * already uses).
   */
  _createRunningSessionPermissionPickerFactory() {
    return (action, _options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      const { session } = instantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
      const pickerOptions = {
        compact: constObservable(true),
        listOptions: { minWidth: 255 }
      };
      return instantiationService.createInstance(
        AgentHostPermissionPickerActionItem,
        action,
        pickerOptions,
        session
      );
    };
  }
};
AgentHostSessionConfigPickerContribution.ID = "sessions.contrib.agentHostSessionConfigPicker";
AgentHostSessionConfigPickerContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IWorkbenchLayoutService)
], AgentHostSessionConfigPickerContribution);
const NEW_SESSION_APPROVE_PICKER_ID = "sessions.agentHost.newSessionApprovePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_APPROVE_PICKER_ID,
      title: localize2("agentHostNewSessionApprovePicker", "Session Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_PERMISSION_MODE_PICKER_ID = "sessions.agentHost.newSessionPermissionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_PERMISSION_MODE_PICKER_ID,
      title: localize2("agentHostNewSessionPermissionModePicker", "Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_CODEX_APPROVALS_PICKER_ID = "sessions.agentHost.newSessionCodexApprovalsPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_CODEX_APPROVALS_PICKER_ID,
      title: localize2("agentHostNewSessionCodexApprovalsPicker", "Approvals"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 3,
        when: ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost)
      }]
    });
  }
  async run() {
  }
});
const NEW_SESSION_MODE_PICKER_ID = "sessions.agentHost.newSessionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: NEW_SESSION_MODE_PICKER_ID,
      title: localize2("agentHostNewSessionModePicker", "Agent Mode"),
      f1: false,
      menu: [{
        id: Menus.NewSessionControl,
        group: "navigation",
        order: 0,
        // On phone the {@link MobileChatInputConfigPicker} replaces
        // this picker with a unified mode + model bottom sheet, so
        // gate this desktop-only Action out of phone layouts.
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(IsActiveSessionLocalAgentHost, IsActiveSessionRemoteAgentHost),
          IsPhoneLayoutContext.negate()
        )
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_CONFIG_PICKER_ID = "sessions.agentHost.runningSessionConfigPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_CONFIG_PICKER_ID,
      title: localize2("agentHostRunningSessionConfigPicker", "Session Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 10,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_PERMISSION_MODE_PICKER_ID = "sessions.agentHost.runningSessionPermissionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_PERMISSION_MODE_PICKER_ID,
      title: localize2("agentHostRunningSessionPermissionModePicker", "Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 11,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID = "sessions.agentHost.runningSessionCodexApprovalsPicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_CODEX_APPROVALS_PICKER_ID,
      title: localize2("agentHostRunningSessionCodexApprovalsPicker", "Approvals"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 12,
        when: ChatContextKeyExprs.isAgentHostSession
      }]
    });
  }
  async run() {
  }
});
const RUNNING_SESSION_MODE_PICKER_ID = "sessions.agentHost.runningSessionModePicker";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RUNNING_SESSION_MODE_PICKER_ID,
      title: localize2("agentHostRunningSessionModePicker", "Agent Mode"),
      f1: false,
      menu: [{
        id: MenuId.ChatInputSecondary,
        group: "navigation",
        order: 9,
        // Hide the agent mode picker while a delegation (continue in) target is pending.
        when: ContextKeyExpr.and(ChatContextKeyExprs.isAgentHostSession, ChatContextKeys.hasPendingDelegationTarget.negate())
      }]
    });
  }
  async run(accessor) {
    showActiveSessionModePicker(accessor);
  }
});
registerWorkbenchContribution2(AgentHostSessionConfigPickerContribution.ID, AgentHostSessionConfigPickerContribution, WorkbenchPhase.AfterRestored);
export {
  AgentHostSessionConfigPicker,
  PickerActionViewItem,
  getConfigIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIHR5cGUgSUFjdGlvblZpZXdJdGVtRmFjdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIFNlc3Npb25Db25maWdWYWx1ZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0UGVybWlzc2lvbldhcm5pbmdzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5RXhwcnMsIENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IG1hcmtPbmJvYXJkaW5nVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvb25ib2FyZGluZy9icm93c2VyL3Nwb3RsaWdodC9vbmJvYXJkaW5nVGFyZ2V0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblByb3ZpZGVySWRDb250ZXh0LCBJc1Bob25lTGF5b3V0Q29udGV4dCwgSXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdFBpY2tlclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbkNvbnRleHQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBpc0FnZW50SG9zdFByb3ZpZGVyLCBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBSRU1PVEVfQUdFTlRfSE9TVF9QUk9WSURFUl9SRSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IFBlcm1pc3Npb25QaWNrZXIgfSBmcm9tICcuLi8uLi9jb3BpbG90Q2hhdFNlc3Npb25zL2Jyb3dzZXIvcGVybWlzc2lvblBpY2tlci5qcyc7XG5pbXBvcnQgeyBNb2JpbGVQZXJtaXNzaW9uUGlja2VyIH0gZnJvbSAnLi4vLi4vY29waWxvdENoYXRTZXNzaW9ucy9icm93c2VyL21vYmlsZVBlcm1pc3Npb25QaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNQaG9uZUxheW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZUxheW91dC5qcyc7XG5pbXBvcnQgeyBzaG93TW9iaWxlUGlja2VyU2hlZXQsIElNb2JpbGVQaWNrZXJTaGVldEl0ZW0sIElNb2JpbGVQaWNrZXJTaGVldFNlYXJjaFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZVBpY2tlclNoZWV0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE1vZGVQaWNrZXIgfSBmcm9tICcuL2FnZW50SG9zdE1vZGVQaWNrZXIuanMnO1xuaW1wb3J0IHsgTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlciB9IGZyb20gJy4vbW9iaWxlL21vYmlsZUFnZW50SG9zdE1vZGVQaWNrZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL2FnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSwgaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYSwgaXNXZWxsS25vd25DbGF1ZGVQZXJtaXNzaW9uTW9kZVNjaGVtYSwgaXNXZWxsS25vd25Db2RleEFwcHJvdmFsc1NjaGVtYSwgaXNXZWxsS25vd25Nb2RlU2NoZW1hIH0gZnJvbSAnLi9hZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xhdWRlUGVybWlzc2lvbk1vZGVQaWNrZXIgfSBmcm9tICcuL2FnZW50SG9zdENsYXVkZVBlcm1pc3Npb25Nb2RlUGlja2VyLmpzJztcbmltcG9ydCB7IENsYXVkZVNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NsYXVkZVNlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4QXBwcm92YWxzUGlja2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlci5qcyc7XG5pbXBvcnQgeyBpc0F1dG9BcHByb3ZlVmFsdWVQb2xpY3lSZXN0cmljdGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWdlbnRIb3N0Q29uZmlnUG9saWN5LmpzJztcbmltcG9ydCB7IENvZGV4U2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29kZXhTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5cbmNvbnN0IElzQWN0aXZlU2Vzc2lvblJlbW90ZUFnZW50SG9zdCA9IENvbnRleHRLZXlFeHByLnJlZ2V4KFNlc3Npb25Qcm92aWRlcklkQ29udGV4dC5rZXksIFJFTU9URV9BR0VOVF9IT1NUX1BST1ZJREVSX1JFKTtcbmNvbnN0IElzQWN0aXZlU2Vzc2lvbkxvY2FsQWdlbnRIb3N0ID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKFNlc3Npb25Qcm92aWRlcklkQ29udGV4dC5rZXksIExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQpO1xuXG5mdW5jdGlvbiBzaG93QWN0aXZlU2Vzc2lvbk1vZGVQaWNrZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGRvbS5nZXRBY3RpdmVFbGVtZW50KCk7XG5cdGNvbnN0IGFuY2hvciA9IGRvbS5pc0hUTUxFbGVtZW50KGFjdGl2ZUVsZW1lbnQpID8gYWN0aXZlRWxlbWVudCA6IGRvbS5nZXRBY3RpdmVEb2N1bWVudCgpLmJvZHk7XG5cdGNvbnN0IHBpY2tlciA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKFxuXHRcdGlzUGhvbmVMYXlvdXQoYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKSkgPyBNb2JpbGVBZ2VudEhvc3RNb2RlUGlja2VyIDogQWdlbnRIb3N0TW9kZVBpY2tlcixcblx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSkuYWN0aXZlU2Vzc2lvbixcblx0KTtcblx0aWYgKCFwaWNrZXIuc2hvd1BpY2tlcihhbmNob3IsICgpID0+IHBpY2tlci5kaXNwb3NlKCkpKSB7XG5cdFx0cGlja2VyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzZXNzaW9ucy5hZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZ1BpY2tlcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyJywgXCJTZXNzaW9uIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvblJlcG9zaXRvcnlDb25maWcsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoSXNBY3RpdmVTZXNzaW9uTG9jYWxBZ2VudEhvc3QsIElzQWN0aXZlU2Vzc2lvblJlbW90ZUFnZW50SG9zdCksXG5cdFx0XHRcdFx0SXNRdWlja0NoYXRTZXNzaW9uQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlnUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGVja2VkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZ0ljb24ocHJvcGVydHk6IHN0cmluZywgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQpOiBUaGVtZUljb24gfCB1bmRlZmluZWQge1xuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uKSB7XG5cdFx0aWYgKHZhbHVlID09PSAnZm9sZGVyJykge1xuXHRcdFx0cmV0dXJuIENvZGljb24uZm9sZGVyO1xuXHRcdH1cblx0XHRpZiAodmFsdWUgPT09ICd3b3JrdHJlZScpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLndvcmt0cmVlO1xuXHRcdH1cblx0fVxuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQnJhbmNoKSB7XG5cdFx0cmV0dXJuIENvZGljb24uZ2l0QnJhbmNoO1xuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gJ2F1dG9waWxvdCcpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLnJvY2tldDtcblx0XHR9XG5cdFx0aWYgKHZhbHVlID09PSAnYXV0b0FwcHJvdmUnKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi53YXJuaW5nO1xuXHRcdH1cblx0XHRpZiAodmFsdWUgPT09ICdhc3Npc3RlZCcpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLnNwYXJrbGU7XG5cdFx0fVxuXHRcdHJldHVybiBDb2RpY29uLnNoaWVsZDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB0b0FjdGlvbkl0ZW1zKHByb3BlcnR5OiBzdHJpbmcsIGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdLCBjdXJyZW50VmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIHBvbGljeVJlc3RyaWN0ZWQ/OiBib29sZWFuKTogSUFjdGlvbkxpc3RJdGVtPElDb25maWdQaWNrZXJJdGVtPltdIHtcblx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRjb25zdCBkaXNhYmxlZCA9IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmIGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQoaXRlbS52YWx1ZSwgcG9saWN5UmVzdHJpY3RlZCA9PT0gdHJ1ZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRldGFpbDogZGlzYWJsZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5wb2xpY3lEaXNhYmxlZCcsIFwiRGlzYWJsZWQgYnkgeW91ciBvcmdhbml6YXRpb24uIENvbnRhY3QgeW91ciBhZG1pbmlzdHJhdG9yLlwiKVxuXHRcdFx0XHQ6IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IGdldENvbmZpZ0ljb24ocHJvcGVydHksIGl0ZW0udmFsdWUpIH0sXG5cdFx0XHRkaXNhYmxlZCxcblx0XHRcdGl0ZW06IHsgLi4uaXRlbSwgY2hlY2tlZDogaXNTZWxlY3RlZFZhbHVlKGN1cnJlbnRWYWx1ZSwgaXRlbS52YWx1ZSkgfSxcblx0XHR9O1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gaXNTZWxlY3RlZFZhbHVlKGN1cnJlbnRWYWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgaXRlbVZhbHVlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHR5cGVvZiBjdXJyZW50VmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiBjdXJyZW50VmFsdWUgPT09IChpdGVtVmFsdWUgPT09ICd0cnVlJyk7XG5cdH1cblx0cmV0dXJuIGl0ZW1WYWx1ZSA9PT0gY3VycmVudFZhbHVlO1xufVxuXG5mdW5jdGlvbiByZW5kZXJQaWNrZXJUcmlnZ2VyKHNsb3Q6IEhUTUxFbGVtZW50LCBkaXNhYmxlZDogYm9vbGVhbiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb25PcGVuOiAoKSA9PiB2b2lkKTogSFRNTEVsZW1lbnQge1xuXHRjb25zdCB0cmlnZ2VyID0gZG9tLmFwcGVuZChzbG90LCBkaXNhYmxlZCA/IGRvbS4kKCdzcGFuLmFjdGlvbi1sYWJlbCcpIDogZG9tLiQoJ2EuYWN0aW9uLWxhYmVsJykpO1xuXHRpZiAoZGlzYWJsZWQpIHtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1yZWFkb25seScsICd0cnVlJyk7XG5cdH0gZWxzZSB7XG5cdFx0dHJpZ2dlci5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dHJpZ2dlci50YWJJbmRleCA9IDA7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAnbGlzdGJveCcpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChHZXN0dXJlLmFkZFRhcmdldCh0cmlnZ2VyKSk7XG5cdFx0Zm9yIChjb25zdCBldmVudFR5cGUgb2YgW2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0pIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRvbk9wZW4oKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0b25PcGVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cdHNsb3QuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cblx0cmV0dXJuIHRyaWdnZXI7XG59XG5cbi8vIFRyYWNrIHdoZXRoZXIgYXV0by1hcHByb3ZlIHdhcm5pbmdzIGhhdmUgYmVlbiBzaG93biB0aGlzIFZTIENvZGUgc2Vzc2lvblxuLyoqXG4gKiBNYXJrcyBieXBhc3MvYXV0b3BpbG90IGFzIGRpc2FibGVkIGlmIGVudGVycHJpc2UgcG9saWN5IHJlc3RyaWN0c1xuICogYXV0by1hcHByb3ZhbC4gUmV0dXJucyB0aGUgaXRlbXMgYW5kIHBvbGljeSBzdGF0ZS5cbiAqL1xuZnVuY3Rpb24gYXBwbHlBdXRvQXBwcm92ZUZpbHRlcmluZyhcblx0aXRlbXM6IHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10sXG5cdHByb3BlcnR5OiBzdHJpbmcsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG4pOiB7IHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdOyByZWFkb25seSBwb2xpY3lSZXN0cmljdGVkOiBib29sZWFuIH0ge1xuXHRpZiAocHJvcGVydHkgIT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRyZXR1cm4geyBpdGVtcywgcG9saWN5UmVzdHJpY3RlZDogZmFsc2UgfTtcblx0fVxuXHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRyZXR1cm4geyBpdGVtcywgcG9saWN5UmVzdHJpY3RlZCB9O1xufVxuXG4vKipcbiAqIFNob3dzIGEgY29uZmlybWF0aW9uIGRpYWxvZyBmb3IgZWxldmF0ZWQgYXV0by1hcHByb3ZlIGxldmVscyAoQnlwYXNzXG4gKiBvciBsZWdhY3kgQXV0b3BpbG90KS4gRGVsZWdhdGVzIHRvIHRoZSBzaGFyZWRcbiAqIHtAbGluayBtYXliZUNvbmZpcm1FbGV2YXRlZFBlcm1pc3Npb25MZXZlbH0gc28gdGhlIGNvcHksIGljb25zLCBhbmRcbiAqIFwiRG9uJ3Qgc2hvdyBhZ2FpblwiIHBlcnNpc3RlbmNlIHN0YXkgY29uc2lzdGVudCBhY3Jvc3MgZXZlcnkgcGVybWlzc2lvblxuICogcGlja2VyLiBSZXR1cm5zIGB0cnVlYCB3aGVuIGNvbmZpcm1lZCAob3Igbm90IGVsZXZhdGVkKSwgYGZhbHNlYCB3aGVuIHRoZVxuICogdXNlciBjYW5jZWxzLlxuICovXG5hc3luYyBmdW5jdGlvbiBjb25maXJtQXV0b0FwcHJvdmVMZXZlbCh2YWx1ZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSwgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRpZiAoIWlzQ2hhdFBlcm1pc3Npb25MZXZlbCh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWwodmFsdWUsIGRpYWxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB7IGRlZmF1bHRTZXR0aW5nS2V5OiBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbiwgbGV2ZWxMYWJlbDogbGFiZWwgfSk7XG59XG5cbi8qKlxuICogQXBwbGllcyB3YXJuaW5nL2luZm8gQ1NTIGNsYXNzZXMgdG8gYSB0cmlnZ2VyIGVsZW1lbnQgZm9yIGF1dG8tYXBwcm92ZSBsZXZlbHMuXG4gKi9cbmZ1bmN0aW9uIGFwcGx5QXV0b0FwcHJvdmVUcmlnZ2VyU3R5bGVzKHRyaWdnZXI6IEhUTUxFbGVtZW50LCBwcm9wZXJ0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHR0cmlnZ2VyLmNsYXNzTGlzdC50b2dnbGUoJ3dhcm5pbmcnLCB2YWx1ZSA9PT0gJ2F1dG9waWxvdCcgfHwgdmFsdWUgPT09ICdhc3Npc3RlZCcpO1xuXHRcdHRyaWdnZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaW5mbycsIHZhbHVlID09PSAnYXV0b0FwcHJvdmUnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZmlsdGVyRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJQ29uZmlnUGlja2VySXRlbT5bXT4oMjAwKSk7XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNlc3Npb24vcHJvcGVydHktc2NvcGVkIHZhbHVlXHUyMTkybGFiZWwgY2FjaGUgZm9yIGBlbnVtRHluYW1pY2Bcblx0ICogcHJvcGVydGllcyAoZS5nLiBicmFuY2gpLCBwb3B1bGF0ZWQgd2hlbmV2ZXIgYF9nZXRJdGVtc2AgZmV0Y2hlc1xuXHQgKiBjb21wbGV0aW9ucy4gYGVudW1EeW5hbWljYCBjb21wbGV0aW9ucyBhcmUgdHJhbnNpZW50IHByb3RvY29sXG5cdCAqIGRhdGEgXHUyMDE0IG9ubHkgYHZhbHVlYCBpcyBwZXJzaXN0ZWQgdmlhIGBzZXRTZXNzaW9uQ29uZmlnVmFsdWVgL1xuXHQgKiBgcmVzb2x2ZVNlc3Npb25Db25maWdgIFx1MjAxNCBzbyB0aGlzIGlzIHRoZSBvbmx5IHBsYWNlIGEgY29tcGxldGlvbidzXG5cdCAqIGBsYWJlbGAgZm9yIGEgcHJldmlvdXNseS1waWNrZWQgdmFsdWUgY2FuIGJlIHJlY292ZXJlZCBvbmNlIHRoZVxuXHQgKiBkcm9wZG93bi9zaGVldCBjbG9zZXMuIFN0YXRpYyBgZW51bWAgcHJvcGVydGllcyBkb24ndCBuZWVkIHRoaXM6XG5cdCAqIHRoZWlyIGxhYmVsIGlzIGFsd2F5cyBkZXJpdmFibGUgZnJvbSBgc2NoZW1hLmVudW1gL2BlbnVtTGFiZWxzYC5cblx0ICpcblx0ICogS2V5ZWQgYnkgc2Vzc2lvbiBzbyBlbnRyaWVzIGRvbid0IGxlYWsgYWNyb3NzIHNlc3Npb25zOiB0aGlzIHBpY2tlclxuXHQgKiBpcyBvbmx5IGV2ZXIgY3JlYXRlZCBmb3IgdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyIChgTWVudXMuTmV3U2Vzc2lvbi1cblx0ICogUmVwb3NpdG9yeUNvbmZpZ2ApLCBhbmQgdGhhdCBjb21wb3NlcidzIGBfc2Vzc2lvbmAgdHJhY2tzIHRoZVxuXHQgKiBnbG9iYWxseSBhY3RpdmUgc2Vzc2lvbiBcdTIwMTQgc28gdGhlICpzYW1lKiBwaWNrZXIgaW5zdGFuY2UgY2FuIG9ic2VydmVcblx0ICogYSBzZXF1ZW5jZSBvZiBkaWZmZXJlbnQgKG5vdC15ZXQtY3JlYXRlZCkgZHJhZnQgc2Vzc2lvbnMgYXMgdGhlIHVzZXJcblx0ICogc3dpdGNoZXMgYmV0d2VlbiB0aGVtLiBgX3JlbmRlckNvbmZpZ1BpY2tlcnNgIGV2aWN0cyBlbnRyaWVzIGZvciBhbnlcblx0ICogc2Vzc2lvbiBvdGhlciB0aGFuIHRoZSBjdXJyZW50IG9uZSBvbiBldmVyeSByZW5kZXIsIHNvIHRoZSBtYXAgbmV2ZXJcblx0ICogZ3Jvd3MgYmV5b25kIHRoZSBwcm9wZXJ0aWVzIG9mIHRoZSBjdXJyZW50bHkgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9keW5hbWljVmFsdWVMYWJlbHMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgc3RyaW5nPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Nlc3Npb246IElPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPixcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9hY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcmVuZGVyQ29uZmlnUGlja2VycygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycyhlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UocHJvdmlkZXIuaWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd2F0Y2hQcm92aWRlcnMoZS5hZGRlZCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJDb25maWdQaWNrZXJzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3dhdGNoUHJvdmlkZXJzKHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgbGF5b3V0IGNyb3NzZXMgdGhlIHBob25lIGJyZWFrcG9pbnQgc28gdGhlXG5cdFx0Ly8gaXNvbGF0aW9uIGNvbnRyb2wgc3dhcHMgYmV0d2VlbiB0aGUgZGVza3RvcCBjaGVja2JveCBhbmQgdGhlXG5cdFx0Ly8gcGhvbmUgY2hpcCAod2hpY2ggcm91dGVzIHRvIHRoZSB1bmlmaWVkIHJlcG9zaXRvcnkgc2hlZXQpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoW0lzUGhvbmVMYXlvdXRDb250ZXh0LmtleV0pKSkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJDb25maWdQaWNrZXJzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hQcm92aWRlcnMocHJvdmlkZXJzOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdGlmICghaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgfHwgdGhpcy5fcHJvdmlkZXJMaXN0ZW5lcnMuaGFzKHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLnNldChwcm92aWRlci5pZCwgcHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnKCgpID0+IHRoaXMuX3JlbmRlckNvbmZpZ1BpY2tlcnMoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1hZ2VudC1ob3N0LWNvbmZpZycpKTtcblx0XHR0aGlzLl9yZW5kZXJDb25maWdQaWNrZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDb25maWdQaWNrZXJzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHR0aGlzLl9ldmljdER5bmFtaWNWYWx1ZUxhYmVsc0Zvck90aGVyU2Vzc2lvbnMoc2Vzc2lvbj8uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHNlc3Npb24gPyB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc29sdmVkQ29uZmlnID0gc2Vzc2lvbiAmJiBwcm92aWRlcj8uZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICFwcm92aWRlciB8fCAhcmVzb2x2ZWRDb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbiB0aGUgcnVubmluZy1zZXNzaW9uIGZsb3cgb25seSBgc2Vzc2lvbk11dGFibGVgIHByb3BlcnRpZXMgY2FuXG5cdFx0Ly8gYWN0dWFsbHkgYmUgY2hhbmdlZCAobm9uLW11dGFibGUgb25lcyB3b3VsZCBuby1vcCBpblxuXHRcdC8vIGBzZXRTZXNzaW9uQ29uZmlnVmFsdWVgKS4gSW4gdGhlIG5ldy1zZXNzaW9uIGZsb3cgYW55IHByb3BlcnR5IGlzXG5cdFx0Ly8gY2hhbmdlYWJsZSBiZWNhdXNlIGNoYW5nZXMgdHJpZ2dlciBhIGZ1bGwgY29uZmlnIHJlLXJlc29sdmUgXHUyMDE0IHNvXG5cdFx0Ly8gbm9uLW11dGFibGUgcHJvcGVydGllcyBsaWtlIGBpc29sYXRpb25gIG11c3QgcmVtYWluIHZpc2libGUgYW5kXG5cdFx0Ly8gaW50ZXJhY3RpdmUgdGhlcmUuXG5cdFx0Y29uc3QgaXNOZXdTZXNzaW9uID0gcHJvdmlkZXIuZ2V0Q3JlYXRlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCkgIT09IHVuZGVmaW5lZDtcblx0XHQvLyBEaXNhYmxlIGludGVyYWN0aW9ucyB3aGlsZSBhIHJlc29sdmUgaXMgaW4gZmxpZ2h0LiBTY2hlbWEgaXNcblx0XHQvLyBwcmVzZXJ2ZWQgc28gY2hpcHMgc3RheSB2aXNpYmxlLiBOb3QgYHNlc3Npb24ubG9hZGluZ2AgXHUyMDE0XG5cdFx0Ly8gdGhhdCBhbHNvIGNvdmVycyB0aGUgcmVxdWlyZWQtdmFsdWVzLW1pc3Npbmcgc3RhdGUgd2hlcmVcblx0XHQvLyBjaGlwcyBtdXN0IHJlbWFpbiBpbnRlcmFjdGl2ZS5cblx0XHRjb25zdCBpc0xvYWRpbmcgPSBwcm92aWRlci5pc1Nlc3Npb25Db25maWdSZXNvbHZpbmcoc2Vzc2lvbi5zZXNzaW9uSWQpLmdldCgpO1xuXG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IHRoaXMuX29yZGVyUHJvcGVydGllcyhPYmplY3QuZW50cmllcyhyZXNvbHZlZENvbmZpZy5zY2hlbWEucHJvcGVydGllcykpO1xuXG5cdFx0Zm9yIChjb25zdCBbcHJvcGVydHksIHNjaGVtYV0gb2YgcHJvcGVydGllcykge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1BpY2thYmxlKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBBIGhpZGRlbiBjYXJyaWVyIHByb3BlcnR5IChzZWUgYHdvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eWAgaW5cblx0XHRcdC8vIGB3b3JrdHJlZUlzb2xhdGlvbi50c2ApIGNvbnN1bWVkIG9ubHkgYnkgdGhlIGhvc3QgZm9yIHdvcmt0cmVlXG5cdFx0XHQvLyBpc29sYXRpb24sIG5ldmVyIGVkaXRlZCBieSB0aGUgdXNlci4gSXRzIGJvb2xlYW4gdHlwZSBvdGhlcndpc2Vcblx0XHRcdC8vIHBhc3NlcyBgX2lzUGlja2FibGVgIHVubGlrZSBpdHMgc3RyaW5nL2FycmF5IGNhcnJpZXIgc2libGluZ3Ncblx0XHRcdC8vIChgd29ya3RyZWVCcmFuY2hQcmVmaXhgL2B3b3JrdHJlZUluY2x1ZGVGaWxlc2ApLCB3aGljaCBhcmVcblx0XHRcdC8vIGZpbHRlcmVkIG91dCBiZWNhdXNlIHRoZXkgbGFjayBhbiBgZW51bWAuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFjaykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24gJiYgIXNjaGVtYS5lbnVtPy5pbmNsdWRlcygnd29ya3RyZWUnKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fc2hvdWxkUmVuZGVyUHJvcGVydHkocHJvcGVydHksIHNjaGVtYSwgaXNOZXdTZXNzaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gdGhlIGF1dG9BcHByb3ZlIHByb3BlcnR5IHVzZXMgdGhlIHdlbGwta25vd24gc2NoZW1hLCB0aGVcblx0XHRcdC8vIHdvcmtiZW5jaCBgUGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW1gIChyZWdpc3RlcmVkIHNlcGFyYXRlbHkgZm9yXG5cdFx0XHQvLyBgTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2xgKSBoYW5kbGVzIGl0IFx1MjAxNCBza2lwIGl0IGhlcmUgdG8gYXZvaWRcblx0XHRcdC8vIGRvdWJsZS1yZW5kZXJpbmcuIE5vbi1jb25mb3JtaW5nIHNjaGVtYXMgc3RpbGwgZmFsbCB0aHJvdWdoIHRvXG5cdFx0XHQvLyB0aGUgZ2VuZXJpYyBwZXItcHJvcGVydHkgcGlja2VyIGJlbG93LlxuXHRcdFx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmIGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gdGhlIG1vZGUgcHJvcGVydHkgdXNlcyB0aGUgd2VsbC1rbm93biBzY2hlbWEsIHRoZSBkZWRpY2F0ZWRcblx0XHRcdC8vIHtAbGluayBBZ2VudEhvc3RNb2RlUGlja2VyfSAocmVnaXN0ZXJlZCBzZXBhcmF0ZWx5IGZvclxuXHRcdFx0Ly8gYE1lbnVzLk5ld1Nlc3Npb25Db250cm9sYCkgaGFuZGxlcyBpdC4gTm9uLWNvbmZvcm1pbmcgc2NoZW1hc1xuXHRcdFx0Ly8gc3RpbGwgZmFsbCB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIHBlci1wcm9wZXJ0eSBwaWNrZXIgYmVsb3cuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuTW9kZSAmJiBpc1dlbGxLbm93bk1vZGVTY2hlbWEoc2NoZW1hKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIENsYXVkZSdzIHBlcm1pc3Npb25Nb2RlIGhhcyBhIGRlZGljYXRlZCBDbGF1ZGUtbmF0aXZlIHBpY2tlciBzb1xuXHRcdFx0Ly8gaXQgZG9lc24ndCByZW5kZXIgYXMgYSBnZW5lcmljIGVudW0gY2hpcC5cblx0XHRcdGlmIChwcm9wZXJ0eSA9PT0gQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZSAmJiBpc1dlbGxLbm93bkNsYXVkZVBlcm1pc3Npb25Nb2RlU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBDb2RleCdzIHBlcm1pc3Npb25zIHByZXNldCBoYXMgYSBkZWRpY2F0ZWQgQ29kZXgtbmF0aXZlIHBpY2tlclxuXHRcdFx0Ly8gKGEgc2luZ2xlIFwiQXBwcm92YWxzXCIgY2hpcCkgc28gaXQgZG9lc24ndCByZW5kZXIgYXMgYSBnZW5lcmljXG5cdFx0XHQvLyBlbnVtIGNoaXAuXG5cdFx0XHRpZiAocHJvcGVydHkgPT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCAmJiBpc1dlbGxLbm93bkNvZGV4QXBwcm92YWxzU2NoZW1hKHNjaGVtYSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlc29sdmVkQ29uZmlnLnZhbHVlc1twcm9wZXJ0eV0gPz8gc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRjb25zdCBpc1JlYWRPbmx5ID0gdGhpcy5faXNSZWFkT25seUNoaXAocHJvcGVydHksIHNjaGVtYSwgaXNOZXdTZXNzaW9uKTtcblx0XHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90JykpO1xuXHRcdFx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQobWFya09uYm9hcmRpbmdUYXJnZXQoc2xvdCwgJ3Nlc3Npb25zLm5ld1Nlc3Npb24uaXNvbGF0aW9uJykpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSXNvbGF0aW9uIHJlbmRlcnMgYXMgYSBXb3JrdHJlZSBjaGVja2JveCBvbiBkZXNrdG9wOyB0aGUgcGhvbmUgbGF5b3V0IGtlZXBzIHRoZSBjaGlwIGZvciB0aGUgdW5pZmllZCByZXBvIHNoZWV0LlxuXHRcdFx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiAmJiB0aGlzLl9zaG91bGRSZW5kZXJJc29sYXRpb25Bc0NoZWNrYm94KHNjaGVtYSkpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVySXNvbGF0aW9uQ2hlY2tib3goc2xvdCwgcHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBzY2hlbWEsIHZhbHVlLCBpc1JlYWRPbmx5LCAhaXNSZWFkT25seSAmJiBpc0xvYWRpbmcpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIGByZW5kZXJQaWNrZXJUcmlnZ2VyYCdzIGBkaXNhYmxlZGAgZmxhZyBtZWFucyBcInJlYWQtb25seVwiXG5cdFx0XHQvLyAocmVuZGVycyBhIGA8c3Bhbj5gIHdpdGggYGFyaWEtcmVhZG9ubHlgKS4gVGhlIHJlc29sdmluZ1xuXHRcdFx0Ly8gc3RhdGUgaXMgdHJhbnNpZW50IGFuZCB1c2VzIGAuZGlzYWJsZWRgIG9uIHRoZSBzbG90IChzZWVcblx0XHRcdC8vIENTUyBpbiBgY2hhdFdpZGdldC5jc3NgKSArIGBhcmlhLWRpc2FibGVkYCBvbiB0aGUgdHJpZ2dlcixcblx0XHRcdC8vIGtlZXBpbmcgaXQgZm9jdXNhYmxlIGFuZCB1c2luZyBjb3JyZWN0IEFSSUEgc2VtYW50aWNzLiBUaGVcblx0XHRcdC8vIGNsaWNrIGhhbmRsZXIgYmFpbHMgd2hlbiByZXNvbHZpbmcgaW4gYF9zaG93UGlja2VyYC5cblx0XHRcdGNvbnN0IHRyaWdnZXIgPSByZW5kZXJQaWNrZXJUcmlnZ2VyKHNsb3QsIGlzUmVhZE9ubHksIHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLCAoKSA9PiB0aGlzLl9zaG93UGlja2VyKHByb3ZpZGVyLCBzZXNzaW9uLnNlc3Npb25JZCwgcHJvcGVydHksIHNjaGVtYSwgdHJpZ2dlcikpO1xuXHRcdFx0Ly8gVGhlIHJlYWQtb25seSBCcmFuY2ggY2hpcCBza2lwcyB0aGUgaG92ZXI6IGl0IGp1c3QgbWlycm9ycyB0aGVcblx0XHRcdC8vIGN1cnJlbnQvZGVmYXVsdCBicmFuY2ggbmFtZSAoYWxyZWFkeSB2aXNpYmxlIGFzIHRoZSBsYWJlbCksXG5cdFx0XHQvLyBhbmQgdGhlIHNjaGVtYSBkZXNjcmlwdGlvbiByZWFkcyBhd2t3YXJkbHkgYXMgYSBob3ZlciBmb3IgYVxuXHRcdFx0Ly8gZml4ZWQgdmFsdWUuIFRoZSBlZGl0YWJsZSBCcmFuY2ggY2hpcCAod29ya3RyZWUgaXNvbGF0aW9uKVxuXHRcdFx0Ly8ga2VlcHMgaXRzIGRlc2NyaXB0aW9uLCB3aGljaCBpcyB1c2VmdWwgY29udGV4dCB0aGVyZS5cblx0XHRcdGNvbnN0IHRvb2x0aXAgPSAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQnJhbmNoICYmIGlzUmVhZE9ubHkpID8gdW5kZWZpbmVkIDogKHNjaGVtYS5kZXNjcmlwdGlvbiA/PyBzY2hlbWEudGl0bGUpO1xuXHRcdFx0aWYgKHRvb2x0aXApIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0cmlnZ2VyLCB7IGNvbnRlbnQ6IHRvb2x0aXAgfSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpc1JlYWRPbmx5ICYmIGlzTG9hZGluZykge1xuXHRcdFx0XHRzbG90LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgJ3RydWUnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlclRyaWdnZXIodHJpZ2dlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEsIHZhbHVlLCBpc1JlYWRPbmx5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1BpY2thYmxlKHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTogYm9vbGVhbiB7XG5cdFx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2NoZW1hLnR5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAhIXNjaGVtYS5lbnVtRHluYW1pYyB8fCAoQXJyYXkuaXNBcnJheShzY2hlbWEuZW51bSkgJiYgc2NoZW1hLmVudW0ubGVuZ3RoID4gMCk7XG5cdH1cblxuXHQvKipcblx0ICogT3JkZXIgdGhlIHNjaGVtYSBwcm9wZXJ0aWVzIGZvciByZW5kZXJpbmcuIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uXG5cdCAqIGVuZm9yY2VzIGEgc3RhYmxlIHZpc3VhbCBzZXF1ZW5jZSBmb3Igd2VsbC1rbm93biBwcm9wZXJ0aWVzOlxuXHQgKiBJc29sYXRpb24gKHdvcmt0cmVlL2ZvbGRlcikgZmlyc3QsIHRoZW4gQnJhbmNoLiBBbnkgb3RoZXIgcHJvcGVydGllc1xuXHQgKiBrZWVwIHRoZWlyIG9yaWdpbmFsIHNjaGVtYSBvcmRlciBhZnRlciB0aGVzZSB0d28uIFN1YmNsYXNzZXMgY2FuXG5cdCAqIG92ZXJyaWRlIHRvIGltcG9zZSBhIGRpZmZlcmVudCBkZXRlcm1pbmlzdGljIHZpc3VhbCBzZXF1ZW5jZVxuXHQgKiAoZS5nLiB0aGUgbW9iaWxlIGNoaXAgcm93IGdyb3VwcyBBcHByb3ZhbHMgfCBCcmFuY2ggfCBXb3JrdHJlZSkuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX29yZGVyUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYV0+KTogUmVhZG9ubHlBcnJheTxbc3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWFdPiB7XG5cdFx0Y29uc3Qgb3JkZXIgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPihbXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIDBdLFxuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoLCAxXSxcblx0XHRdKTtcblx0XHRyZXR1cm4gcHJvcGVydGllc1xuXHRcdFx0Lm1hcCgoW2tleSwgc2NoZW1hXSwgaW5kZXgpID0+ICh7IGtleSwgc2NoZW1hLCBpbmRleCB9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFSYW5rID0gb3JkZXIuZ2V0KGEua2V5KSA/PyBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0XHRcdFx0Y29uc3QgYlJhbmsgPSBvcmRlci5nZXQoYi5rZXkpID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdFx0XHRyZXR1cm4gYVJhbmsgLSBiUmFuayB8fCBhLmluZGV4IC0gYi5pbmRleDtcblx0XHRcdH0pXG5cdFx0XHQubWFwKCh7IGtleSwgc2NoZW1hIH0pID0+IFtrZXksIHNjaGVtYV0gYXMgW3N0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hXSk7XG5cdH1cblxuXHQvKipcblx0ICogRGVjaWRlIHdoZXRoZXIgYSBwcm9wZXJ0eSdzIGNoaXAgc2hvdWxkIGJlIHJlbmRlcmVkIGZvciB0aGUgY3VycmVudFxuXHQgKiBzZXNzaW9uLiBUaGUgYmFzZSBpbXBsZW1lbnRhdGlvbiBoaWRlcyBub24tbXV0YWJsZSBwcm9wZXJ0aWVzIGluXG5cdCAqIHJ1bm5pbmcgc2Vzc2lvbnMgKHRoZXkgd291bGQgcmVuZGVyIGFzIGRlYWQgcGlsbHMpLiBTdWJjbGFzc2VzIGNhblxuXHQgKiBvdmVycmlkZSB0byBrZWVwIHNwZWNpZmljIHByb3BlcnRpZXMgdmlzaWJsZSBhcyByZWFkb25seSBjaGlwcyBcdTIwMTRcblx0ICogc2VlIHtAbGluayBfaXNSZWFkT25seUNoaXB9LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRSZW5kZXJQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgaXNOZXdTZXNzaW9uOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzTmV3U2Vzc2lvbiB8fCAhIXNjaGVtYS5zZXNzaW9uTXV0YWJsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZWNpZGUgd2hldGhlciBhIHByb3BlcnR5J3MgdHJpZ2dlciBzaG91bGQgcmVuZGVyIGFzIHJlYWRvbmx5XG5cdCAqIChubyBjaGV2cm9uLCBubyBwb3B1cCkuIFRoZSBiYXNlIGltcGxlbWVudGF0aW9uIGRlZmVycyB0byB0aGVcblx0ICogc2NoZW1hJ3MgYHJlYWRPbmx5YCBmbGFnLiBTdWJjbGFzc2VzIHRoYXQgb3B0IGluIHRvIHJlbmRlcmluZ1xuXHQgKiBub24tbXV0YWJsZSBjaGlwcyB2aWEge0BsaW5rIF9zaG91bGRSZW5kZXJQcm9wZXJ0eX0gc2hvdWxkXG5cdCAqIG92ZXJyaWRlIHRoaXMgdG8gYWxzbyBtYXJrIHRoZW0gcmVhZG9ubHkgYXQgcnVudGltZS5cblx0ICovXG5cdHByb3RlY3RlZCBfaXNSZWFkT25seUNoaXAocHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIGlzTmV3U2Vzc2lvbjogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXNjaGVtYS5yZWFkT25seTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVuZGVyVHJpZ2dlcih0cmlnZ2VyOiBIVE1MRWxlbWVudCwgc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgaXNSZWFkT25seTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodHJpZ2dlcik7XG5cblx0XHRjb25zdCBpY29uID0gZ2V0Q29uZmlnSWNvbihwcm9wZXJ0eSwgdmFsdWUpO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oaWNvbikpO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uYXBwZW5kKHRyaWdnZXIsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9nZXRMYWJlbChzZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEsIHZhbHVlKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGlzUmVhZE9ubHlcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcudHJpZ2dlckFyaWFSZWFkT25seScsIFwiezB9OiB7MX0sIFJlYWQtT25seVwiLCBzY2hlbWEudGl0bGUsIGxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy50cmlnZ2VyQXJpYScsIFwiezB9OiB7MX1cIiwgc2NoZW1hLnRpdGxlLCBsYWJlbCkpO1xuXHRcdGFwcGx5QXV0b0FwcHJvdmVUcmlnZ2VyU3R5bGVzKHRyaWdnZXIsIHByb3BlcnR5LCB2YWx1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgaXNvbGF0aW9uIHByb3BlcnR5IHNob3VsZCByZW5kZXIgYXMgYSBjaGVja2JveFxuXHQgKiAoV29ya3RyZWUgb24vb2ZmKSByYXRoZXIgdGhhbiBhIGRyb3Bkb3duLiBPbmx5IG9uIG5vbi1waG9uZVxuXHQgKiBsYXlvdXRzIGFuZCBvbmx5IHdoZW4gdGhlIHNjaGVtYSBvZmZlcnMgYm90aCBmb2xkZXIgYW5kIHdvcmt0cmVlLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9zaG91bGRSZW5kZXJJc29sYXRpb25Bc0NoZWNrYm94KHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFpc1Bob25lTGF5b3V0KHRoaXMuX2xheW91dFNlcnZpY2UpXG5cdFx0XHQmJiBBcnJheS5pc0FycmF5KHNjaGVtYS5lbnVtKVxuXHRcdFx0JiYgc2NoZW1hLmVudW0uaW5jbHVkZXMoJ3dvcmt0cmVlJylcblx0XHRcdCYmIHNjaGVtYS5lbnVtLmluY2x1ZGVzKCdmb2xkZXInKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcklzb2xhdGlvbkNoZWNrYm94KHNsb3Q6IEhUTUxFbGVtZW50LCBwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb25JZDogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIGlzUmVhZE9ubHk6IGJvb2xlYW4sIGlzTG9hZGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGRpc2FibGVkID0gaXNSZWFkT25seSB8fCBpc0xvYWRpbmc7XG5cdFx0Y29uc3QgbGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5pc29sYXRpb24ud29ya3RyZWUnLCBcIk5ldyBXb3JrdHJlZVwiKTtcblx0XHRzbG90LmNsYXNzTGlzdC5hZGQoJ3Nlc3Npb25zLWNoYXQtaXNvbGF0aW9uLWNoZWNrYm94Jyk7XG5cdFx0c2xvdC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGRpc2FibGVkKTtcblxuXHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJy5hY3Rpb24tbGFiZWwnKSk7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGxhYmVsLCB2YWx1ZSA9PT0gJ3dvcmt0cmVlJywgeyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMsIHNpemU6IDE0IH0pKTtcblx0XHRpZiAoZGlzYWJsZWQpIHtcblx0XHRcdGNoZWNrYm94LmRpc2FibGUoKTtcblx0XHR9XG5cdFx0ZG9tLmFwcGVuZChyb3csIGNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQocm93LCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJykpO1xuXHRcdGxhYmVsU3Bhbi50ZXh0Q29udGVudCA9IGxhYmVsO1xuXG5cdFx0Ly8gUmV1c2UgdGhlIHNjaGVtYSdzIG93biBgd29ya3RyZWVgIGVudW0gZGVzY3JpcHRpb24gKGUuZy4gXCJDcmVhdGUgYVxuXHRcdC8vIEdpdCB3b3JrdHJlZSBmb3IgaXNvbGF0aW9uXCIpIHNpbmNlIGl0IGFscmVhZHkgZXhwbGFpbnMgd2hhdFxuXHRcdC8vIGNoZWNraW5nIHRoZSBib3ggZG9lcy4gRmFsbCBiYWNrIHRvIHRoZSBzY2hlbWEncyBkZXNjcmlwdGlvbi90aXRsZVxuXHRcdC8vIGlmIHRoZSBlbnVtIHNoYXBlIGlzIHVuZXhwZWN0ZWQuXG5cdFx0Y29uc3Qgd29ya3RyZWVJbmRleCA9IHNjaGVtYS5lbnVtPy5pbmRleE9mKCd3b3JrdHJlZScpID8/IC0xO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSAod29ya3RyZWVJbmRleCA+PSAwID8gc2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/Llt3b3JrdHJlZUluZGV4XSA6IHVuZGVmaW5lZCkgPz8gc2NoZW1hLmRlc2NyaXB0aW9uID8/IHNjaGVtYS50aXRsZTtcblx0XHRpZiAodG9vbHRpcCkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihyb3csIHsgY29udGVudDogdG9vbHRpcCB9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBwbHlWYWx1ZSA9IChjaGVja2VkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCk/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gPz8gc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRjb25zdCBuZXh0VmFsdWUgPSBjaGVja2VkID8gJ3dvcmt0cmVlJyA6ICdmb2xkZXInO1xuXHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdGlkOiAnTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXInLFxuXHRcdFx0XHRuYW1lOiBgTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIuJHtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbn1gLFxuXHRcdFx0XHRvcHRpb25JZEJlZm9yZTogdHlwZW9mIGJlZm9yZSA9PT0gJ3N0cmluZycgPyBiZWZvcmUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9wdGlvbklkQWZ0ZXI6IG5leHRWYWx1ZSxcblx0XHRcdFx0b3B0aW9uTGFiZWxCZWZvcmU6IHR5cGVvZiBiZWZvcmUgPT09ICdzdHJpbmcnID8gdGhpcy5fZ2V0TGFiZWwoc2Vzc2lvbklkLCBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiwgc2NoZW1hLCBiZWZvcmUpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvcHRpb25MYWJlbEFmdGVyOiB0aGlzLl9nZXRMYWJlbChzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCBzY2hlbWEsIG5leHRWYWx1ZSksXG5cdFx0XHRcdGlzUElJOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0cHJvdmlkZXIuc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIG5leHRWYWx1ZSkuY2F0Y2goKCkgPT4geyAvKiBiZXN0LWVmZm9ydCAqLyB9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IGFwcGx5VmFsdWUoY2hlY2tib3guY2hlY2tlZCkpKTtcblx0XHRpZiAoIWRpc2FibGVkKSB7XG5cdFx0XHQvLyBUb2dnbGUgZnJvbSBhbnl3aGVyZSBvbiB0aGUgcm93IHNvIHRoZSB2aXNpYmxlIGhpdCB0YXJnZXRcblx0XHRcdC8vIChwYWRkaW5nICsgY2hlY2tib3gvbGFiZWwgZ2FwKSBtYXRjaGVzIHRoZSBpbnRlcmFjdGl2ZSBvbmUuXG5cdFx0XHQvLyBUaGUgY2hlY2tib3ggc3RvcHMgaXRzIG93biBjbGljayBmcm9tIGJ1YmJsaW5nIGhlcmUuXG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQocm93KSk7XG5cdFx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3csIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9ICFjaGVja2JveC5jaGVja2VkO1xuXHRcdFx0XHRcdGFwcGx5VmFsdWUoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Nob3dQaWNrZXIocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNjaGVtYS5yZWFkT25seSB8fCB0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNb2JpbGUgYm90dG9tLXNoZWV0IG92ZXJyaWRlIGRpc3BhdGNoZXMgdGhyb3VnaCB0aGlzIGVudHJ5XG5cdFx0Ly8gcG9pbnQsIHNvIGd1YXJkIGhlcmUgZm9yIGJvdGggaW52b2NhdGlvbiBwYXRocy5cblx0XHRpZiAocHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZCkuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYXdJdGVtcyA9IGF3YWl0IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEpO1xuXHRcdGNvbnN0IHsgaXRlbXMsIHBvbGljeVJlc3RyaWN0ZWQgfSA9IGFwcGx5QXV0b0FwcHJvdmVGaWx0ZXJpbmcocmF3SXRlbXMsIHByb3BlcnR5LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVQcm9wZXJ0eSA9IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlO1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKT8udmFsdWVzW3Byb3BlcnR5XSA/PyBzY2hlbWEuZGVmYXVsdDtcblx0XHRjb25zdCBjdXJyZW50SXRlbSA9IGl0ZW1zLmZpbmQoaSA9PiBpc1NlbGVjdGVkVmFsdWUoY3VycmVudFZhbHVlLCBpLnZhbHVlKSk7XG5cdFx0Y29uc3QgYWN0aW9uSXRlbXMgPSB0b0FjdGlvbkl0ZW1zKHByb3BlcnR5LCBpdGVtcywgY3VycmVudFZhbHVlLCBwb2xpY3lSZXN0cmljdGVkKTtcblxuXHRcdGNvbnN0IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPElDb25maWdQaWNrZXJJdGVtPiA9IHtcblx0XHRcdG9uU2VsZWN0OiBhc3luYyBpdGVtID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cblx0XHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0aWQ6ICdOZXdDaGF0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcicsXG5cdFx0XHRcdFx0bmFtZTogYE5ld0NoYXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyLiR7cHJvcGVydHl9YCxcblx0XHRcdFx0XHRvcHRpb25JZEJlZm9yZTogdHlwZW9mIGN1cnJlbnRWYWx1ZSA9PT0gJ3N0cmluZycgPyBjdXJyZW50VmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogaXRlbS52YWx1ZSxcblx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogY3VycmVudEl0ZW0/LmxhYmVsLFxuXHRcdFx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0aXNQSUk6ICEhc2NoZW1hLmVudW1EeW5hbWljLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAoaXNBdXRvQXBwcm92ZVByb3BlcnR5ICYmIGl0ZW0udmFsdWUgIT09ICdkZWZhdWx0Jykge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IGNvbmZpcm1BdXRvQXBwcm92ZUxldmVsKGl0ZW0udmFsdWUsIGl0ZW0ubGFiZWwsIHRoaXMuX2RpYWxvZ1NlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5leHRWYWx1ZSA9IHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicgPyBpdGVtLnZhbHVlID09PSAndHJ1ZScgOiBpdGVtLnZhbHVlO1xuXHRcdFx0XHRwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbklkLCBwcm9wZXJ0eSwgbmV4dFZhbHVlKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRmlsdGVyOiBzY2hlbWEuZW51bUR5bmFtaWNcblx0XHRcdFx0PyBxdWVyeSA9PiB0aGlzLl9maWx0ZXJEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkUmF3SXRlbXMgPSBhd2FpdCB0aGlzLl9nZXRJdGVtcyhwcm92aWRlciwgc2Vzc2lvbklkLCBwcm9wZXJ0eSwgc2NoZW1hLCBxdWVyeSk7XG5cdFx0XHRcdFx0Y29uc3QgeyBpdGVtczogZmlsdGVyZWRJdGVtcywgcG9saWN5UmVzdHJpY3RlZDogZmlsdGVyZWRQb2xpY3lSZXN0cmljdGVkIH0gPSBhcHBseUF1dG9BcHByb3ZlRmlsdGVyaW5nKGZpbHRlcmVkUmF3SXRlbXMsIHByb3BlcnR5LCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uSXRlbXMocHJvcGVydHksIGZpbHRlcmVkSXRlbXMsIHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKT8udmFsdWVzW3Byb3BlcnR5XSA/PyBzY2hlbWEuZGVmYXVsdCwgZmlsdGVyZWRQb2xpY3lSZXN0cmljdGVkKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRvbkhpZGU6ICgpID0+IHRyaWdnZXIuZm9jdXMoKSxcblx0XHR9O1xuXG5cdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93PElDb25maWdQaWNrZXJJdGVtPihcblx0XHRcdGBhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLiR7cHJvcGVydHl9YCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0YWN0aW9uSXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiBpdGVtID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYXJpYUxhYmVsJywgXCJ7MH0gUGlja2VyXCIsIHNjaGVtYS50aXRsZSksXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uSXRlbXMubGVuZ3RoID4gMTBcblx0XHRcdFx0PyB7IHNob3dGaWx0ZXI6IHRydWUsIGZpbHRlclBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5maWx0ZXInLCBcIkZpbHRlciBvcHRpb25zLi4uXCIpLCBtaW5XaWR0aDogMjU1IH1cblx0XHRcdFx0OiB7IG1pbldpZHRoOiAyNTUgfSxcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRJdGVtcyhwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb25JZDogc3RyaW5nLCBwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgcXVlcnk/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10+IHtcblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0eyB2YWx1ZTogJ3RydWUnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi50cnVlJywgXCJPblwiKSB9LFxuXHRcdFx0XHR7IHZhbHVlOiAnZmFsc2UnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi5mYWxzZScsIFwiT2ZmXCIpIH0sXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRjb25zdCBkeW5hbWljSXRlbXMgPSBzY2hlbWEuZW51bUR5bmFtaWNcblx0XHRcdD8gYXdhaXQgcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHNlc3Npb25JZCwgcHJvcGVydHksIHF1ZXJ5KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGR5bmFtaWNJdGVtcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGR5bmFtaWNJdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9mcm9tQ29tcGxldGlvbkl0ZW0oaXRlbSkpO1xuXHRcdFx0dGhpcy5fY2FjaGVEeW5hbWljVmFsdWVMYWJlbHMoc2Vzc2lvbklkLCBwcm9wZXJ0eSwgaXRlbXMpO1xuXHRcdFx0cmV0dXJuIGl0ZW1zO1xuXHRcdH1cblxuXHRcdC8vIFN0YXRpYyBlbnVtOiBzY2hlbWEuZW51bS9lbnVtTGFiZWxzIGFscmVhZHkgY2FycnkgYSByZWxpYWJsZVxuXHRcdC8vIGxhYmVsIG1hcHBpbmcsIHNvIHRoZXJlJ3Mgbm8gbmVlZCB0byBjYWNoZSB0aGVzZSBzZXBhcmF0ZWx5LlxuXHRcdHJldHVybiAoc2NoZW1hLmVudW0gPz8gW10pLm1hcCgodmFsdWUsIGluZGV4KSA9PiAoe1xuXHRcdFx0dmFsdWU6IFN0cmluZyh2YWx1ZSksXG5cdFx0XHRsYWJlbDogc2NoZW1hLmVudW1MYWJlbHM/LltpbmRleF0gPz8gU3RyaW5nKHZhbHVlKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBzY2hlbWEuZW51bURlc2NyaXB0aW9ucz8uW2luZGV4XSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9mcm9tQ29tcGxldGlvbkl0ZW0oaXRlbTogU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbSk6IElDb25maWdQaWNrZXJJdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmFsdWU6IGl0ZW0udmFsdWUsXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9keW5hbWljVmFsdWVMYWJlbHNLZXkoc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtzZXNzaW9uSWR9XFwwJHtwcm9wZXJ0eX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVEeW5hbWljVmFsdWVMYWJlbHMoc2Vzc2lvbklkOiBzdHJpbmcsIHByb3BlcnR5OiBzdHJpbmcsIGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fZHluYW1pY1ZhbHVlTGFiZWxzS2V5KHNlc3Npb25JZCwgcHJvcGVydHkpO1xuXHRcdGxldCBsYWJlbHMgPSB0aGlzLl9keW5hbWljVmFsdWVMYWJlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFsYWJlbHMpIHtcblx0XHRcdGxhYmVscyA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5zZXQoa2V5LCBsYWJlbHMpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0bGFiZWxzLnNldChpdGVtLnZhbHVlLCBpdGVtLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcHMgY2FjaGVkIGxhYmVscyBmb3IgYW55IHNlc3Npb24gb3RoZXIgdGhhbiBgc2Vzc2lvbklkYC4gQ2FsbGVkIG9uXG5cdCAqIGV2ZXJ5IHJlbmRlciBzbyB0aGUgY2FjaGUgdHJhY2tzIHdoaWNoZXZlciBzZXNzaW9uIHRoZSBwaWNrZXIgaXNcblx0ICogY3VycmVudGx5IGJvdW5kIHRvLCBpbnN0ZWFkIG9mIGFjY3VtdWxhdGluZyBlbnRyaWVzIGZvciBldmVyeSBkcmFmdFxuXHQgKiBzZXNzaW9uIHRoaXMgKHBvdGVudGlhbGx5IGxvbmctbGl2ZWQpIHBpY2tlciBpbnN0YW5jZSBoYXMgZXZlciBzaG93bi5cblx0ICovXG5cdHByaXZhdGUgX2V2aWN0RHluYW1pY1ZhbHVlTGFiZWxzRm9yT3RoZXJTZXNzaW9ucyhzZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlZml4ID0gYCR7c2Vzc2lvbklkfVxcMGA7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fZHluYW1pY1ZhbHVlTGFiZWxzLmtleXMoKSkge1xuXHRcdFx0aWYgKCFrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYWJlbChzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoc2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHZhbHVlID09PSB0cnVlXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdFNlc3Npb25Db25maWcuYm9vbGVhbi5vbkxhYmVsJywgXCJPblwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RTZXNzaW9uQ29uZmlnLmJvb2xlYW4ub2ZmTGFiZWwnLCBcIk9mZlwiKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGlmIChzY2hlbWEuZW51bUR5bmFtaWMpIHtcblx0XHRcdFx0Ly8gTG9vayB1cCB0aGUgZHluYW1pYyB2YWx1ZSBsYWJlbC4gSWYgd2UgYXJlIHVuYWJsZVxuXHRcdFx0XHQvLyB0byBsb29rdXAgdGhlIGR5bmFtaWMgdmFsdWUgbGFiZWwsIHdlIGZhbGwgYmFjayB0b1xuXHRcdFx0XHQvLyB0aGUgdmFsdWUgaXRzZWxmLlxuXHRcdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9keW5hbWljVmFsdWVMYWJlbHNLZXkoc2Vzc2lvbklkLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdGNvbnN0IGR5bmFtaWNMYWJlbCA9IHRoaXMuX2R5bmFtaWNWYWx1ZUxhYmVscy5nZXQoa2V5KT8uZ2V0KHZhbHVlKTtcblx0XHRcdFx0aWYgKGR5bmFtaWNMYWJlbCkge1xuXHRcdFx0XHRcdHJldHVybiBkeW5hbWljTGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdFx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IHZhbHVlIDogdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBzY2hlbWEudGl0bGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFByb3ZpZGVyKHByb3ZpZGVySWQ6IHN0cmluZyk6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRyZXR1cm4gcHJvdmlkZXIgJiYgaXNBZ2VudEhvc3RQcm92aWRlcihwcm92aWRlcikgPyBwcm92aWRlciA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFBob25lIHZhcmlhbnQgb2Yge0BsaW5rIEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXJ9IHRoYXQgcm91dGVzIHRoZVxuICogSXNvbGF0aW9uIGFuZCBCcmFuY2ggcGlja2VycyB0aHJvdWdoIGEgdW5pZmllZCBib3R0b20gc2hlZXQgcmF0aGVyXG4gKiB0aGFuIHRoZSBkZXNrdG9wIGFjdGlvbi13aWRnZXQgcG9wdXAuXG4gKlxuICogT24gZGVza3RvcCB2aWV3cG9ydHMgdGhlIGluaGVyaXRlZCBgX3Nob3dQaWNrZXJgIGZhbGxzIHRocm91Z2ggdG8gdGhlXG4gKiBiYXNlIGltcGxlbWVudGF0aW9uLCBzbyB0aGlzIGNsYXNzIGlzIHNhZmUgdG8ga2VlcCB0aHJvdWdoXG4gKiB2aWV3cG9ydC1jbGFzcyB0cmFuc2l0aW9ucy5cbiAqXG4gKiBEZWZpbmVkIGluIHRoZSBzYW1lIGZpbGUgYXMgdGhlIGJhc2UgY2xhc3MgdG8gYXZvaWQgYSBjaXJjdWxhciBFU01cbiAqIGRlcGVuZGVuY3kgKHRoZSBgZXh0ZW5kc2AgY2xhdXNlIHJ1bnMgYXQgY2xhc3MtZGVmaW5pdGlvbiB0aW1lLCB3aGljaFxuICogaXMgZHVyaW5nIG1vZHVsZSBldmFsdWF0aW9uIFx1MjAxNCBhIHNlcGFyYXRlIGZpbGUgdGhhdCBpbXBvcnRlZCB0aGUgYmFzZVxuICogd291bGQgaGl0IFwiQ2Fubm90IGFjY2VzcyBiZWZvcmUgaW5pdGlhbGl6YXRpb25cIikuXG4gKi9cbmNsYXNzIE1vYmlsZUFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIgZXh0ZW5kcyBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyIHtcblxuXHQvKipcblx0ICogT24gcGhvbmUgdGhlIGNoaXAgbGFuZSBoYXMgYSBmaXhlZCB2aXN1YWwgc2VxdWVuY2UgXHUyMDE0IERlZmF1bHRcblx0ICogQXBwcm92YWxzIChyZW5kZXJlZCBieSBhIHNlcGFyYXRlIGxlZnQtc2lkZSBwaWNrZXIpLCB0aGVuIEJyYW5jaCxcblx0ICogdGhlbiBXb3JrdHJlZS4gU29ydCB0aGUga25vd24gcmVwby1jb25maWcgcHJvcGVydGllcyB0byB0aGF0XG5cdCAqIG9yZGVyOyB1bmtub3duIHByb3BlcnRpZXMgZmFsbCB0aHJvdWdoIHRvIHNjaGVtYS1kZWNsYXJlZCBvcmRlclxuXHQgKiBhZnRlciB0aGUga25vd24gb25lcy5cblx0ICpcblx0ICogT24gZGVza3RvcCB2aWV3cG9ydHMgdGhpcyBzdWJjbGFzcyBpcyBhbHNvIGluc3RhbnRpYXRlZCAoc2VlIHRoZVxuXHQgKiBmYWN0b3J5IGluIGBBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2Vyc0NvbnRyaWJ1dGlvbmAgXHUyMDE0IGl0IGFsd2F5c1xuXHQgKiBwaWNrcyB0aGUgbW9iaWxlLWF3YXJlIHN1YmNsYXNzIHNvIGBfc2hvd1BpY2tlcmAgY2FuIHJvdXRlIHRvIHRoZVxuXHQgKiBib3R0b20gc2hlZXQgb24gcGhvbmVzKSwgc28gd2UgbXVzdCBkZWZlciB0byB0aGUgYmFzZSBvcmRlcmluZ1xuXHQgKiAoSXNvbGF0aW9uIGZpcnN0LCBCcmFuY2ggc2Vjb25kKSB3aGVuIG5vdCBvbiBhIHBob25lIGxheW91dC5cblx0ICovXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb3JkZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXM6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hXT4pOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYV0+IHtcblx0XHRpZiAoIWlzUGhvbmVMYXlvdXQodGhpcy5fbGF5b3V0U2VydmljZSkpIHtcblx0XHRcdHJldHVybiBzdXBlci5fb3JkZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuXHRcdH1cblx0XHRjb25zdCBvcmRlciA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KFtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgMF0sXG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIDFdLFxuXHRcdF0pO1xuXHRcdHJldHVybiBwcm9wZXJ0aWVzLnNsaWNlKCkuc29ydCgoW2FLZXldLCBbYktleV0pID0+IHtcblx0XHRcdGNvbnN0IGEgPSBvcmRlci5nZXQoYUtleSkgPz8gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVI7XG5cdFx0XHRjb25zdCBiID0gb3JkZXIuZ2V0KGJLZXkpID8/IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdFx0cmV0dXJuIGEgLSBiO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXAgQnJhbmNoIGFuZCBJc29sYXRpb24gdmlzaWJsZSBpbiBydW5uaW5nIHNlc3Npb25zIGV2ZW4gd2hlblxuXHQgKiB0aGUgc2NoZW1hIG1hcmtzIHRoZW0gbm9uLW11dGFibGUuIFRoZWlyIHZhbHVlIGlzIGluZm9ybWF0aW9uYWxcblx0ICogXHUyMDE0IHRoZSB1c2VyIHdhbnRzIHRvIHNlZSB3aGF0IHRoZSBydW5uaW5nIHNlc3Npb24gaXMgdXNpbmcgXHUyMDE0XG5cdCAqIGFuZCB0aGUgY2hpcCByZW5kZXJzIGFzIHJlYWRvbmx5IHZpYSB7QGxpbmsgX2lzUmVhZE9ubHlDaGlwfS5cblx0ICogQWxsIG90aGVyIHByb3BlcnRpZXMgZGVmZXIgdG8gdGhlIGJhc2UgYmVoYXZpb3IgKGhpZGUgaWZcblx0ICogbm9uLW11dGFibGUgaW4gYSBydW5uaW5nIHNlc3Npb24pLlxuXHQgKi9cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9zaG91bGRSZW5kZXJQcm9wZXJ0eShwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgaXNOZXdTZXNzaW9uOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNVbmlmaWVkUmVwb1Byb3BlcnR5ID0gcHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uIHx8IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaDtcblx0XHRyZXR1cm4gaXNVbmlmaWVkUmVwb1Byb3BlcnR5IHx8IHN1cGVyLl9zaG91bGRSZW5kZXJQcm9wZXJ0eShwcm9wZXJ0eSwgc2NoZW1hLCBpc05ld1Nlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcmsgbm9uLW11dGFibGUgcHJvcGVydGllcyBhcyByZWFkb25seSBjaGlwcyBpbiBydW5uaW5nIHNlc3Npb25zXG5cdCAqIHNvIHRhcHMgZG9uJ3QgdHJ5IHRvIG9wZW4gYSBwaWNrZXIgKHdoaWNoIHdvdWxkIG5vLW9wIGF0IHRoZVxuXHQgKiBwcm92aWRlciBib3VuZGFyeSkuIFRoZSBzY2hlbWEncyBvd24gYHJlYWRPbmx5YCBmbGFnIHN0aWxsIHdpbnMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2lzUmVhZE9ubHlDaGlwKHByb3BlcnR5OiBzdHJpbmcsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBpc05ld1Nlc3Npb246IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3VwZXIuX2lzUmVhZE9ubHlDaGlwKHByb3BlcnR5LCBzY2hlbWEsIGlzTmV3U2Vzc2lvbikgfHwgKCFpc05ld1Nlc3Npb24gJiYgIXNjaGVtYS5zZXNzaW9uTXV0YWJsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3Nob3dQaWNrZXIocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1Bob25lTGF5b3V0KHRoaXMuX2xheW91dFNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuX3Nob3dQaWNrZXIocHJvdmlkZXIsIHNlc3Npb25JZCwgcHJvcGVydHksIHNjaGVtYSwgdHJpZ2dlcik7XG5cdFx0fVxuXG5cdFx0Ly8gTWlycm9yIHRoZSBiYXNlIGBfc2hvd1BpY2tlcmAgZ3VhcmQgKHRoZSByZXBvLXNoZWV0IHBhdGggYmVsb3cgYnlwYXNzZXNcblx0XHQvLyBpdCk6IGJhaWwgd2hpbGUgcmVzb2x2aW5nIHNvIGluamVjdGVkIGRpc2FibGVkIGNoaXBzIGRvbid0IG9wZW4gYSBzaGVldC5cblx0XHRpZiAocHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb25JZCkuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uIHx8IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2hvd1VuaWZpZWRSZXBvU2hlZXQocHJvdmlkZXIsIHNlc3Npb25JZCwgdHJpZ2dlcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLl9zaG93UGlja2VyKHByb3ZpZGVyLCBzZXNzaW9uSWQsIHByb3BlcnR5LCBzY2hlbWEsIHRyaWdnZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd1VuaWZpZWRSZXBvU2hlZXQocHJvdmlkZXI6IElBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgdHJpZ2dlcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWcgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc29sYXRpb25TY2hlbWEgPSBjb25maWcuc2NoZW1hLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dO1xuXHRcdGNvbnN0IGJyYW5jaFNjaGVtYSA9IGNvbmZpZy5zY2hlbWEucHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF07XG5cblx0XHRjb25zdCBbaXNvbGF0aW9uSXRlbXMsIGJyYW5jaEl0ZW1zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGlzb2xhdGlvblNjaGVtYSAmJiAhaXNvbGF0aW9uU2NoZW1hLnJlYWRPbmx5XG5cdFx0XHRcdD8gdGhpcy5fZ2V0SXRlbXMocHJvdmlkZXIsIHNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sIGlzb2xhdGlvblNjaGVtYSlcblx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoW10gYXMgcmVhZG9ubHkgSUNvbmZpZ1BpY2tlckl0ZW1bXSksXG5cdFx0XHRicmFuY2hTY2hlbWEgJiYgIWJyYW5jaFNjaGVtYS5yZWFkT25seVxuXHRcdFx0XHQ/IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBicmFuY2hTY2hlbWEpXG5cdFx0XHRcdDogUHJvbWlzZS5yZXNvbHZlKFtdIGFzIHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgaXNvbGF0aW9uVmFsdWUgPSBjb25maWcudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTtcblx0XHRjb25zdCBicmFuY2hWYWx1ZSA9IGNvbmZpZy52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdO1xuXHRcdGNvbnN0IHNoZWV0SXRlbXM6IElNb2JpbGVQaWNrZXJTaGVldEl0ZW1bXSA9IFtdO1xuXG5cdFx0Y29uc3QgaWRUb0NvbmZpZyA9IG5ldyBNYXA8c3RyaW5nLCB7IHByb3BlcnR5OiBzdHJpbmc7IHZhbHVlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGlzUElJOiBib29sZWFuIH0+KCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJJZCA9IChwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBpc1BJSTogYm9vbGVhbik6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IGByZXBvLXJvdy0ke2lkVG9Db25maWcuc2l6ZX1gO1xuXHRcdFx0aWRUb0NvbmZpZy5zZXQoaWQsIHsgcHJvcGVydHksIHZhbHVlLCBsYWJlbCwgaXNQSUkgfSk7XG5cdFx0XHRyZXR1cm4gaWQ7XG5cdFx0fTtcblxuXHRcdGlzb2xhdGlvbkl0ZW1zLmZvckVhY2goKGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0XHRzaGVldEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogcmVnaXN0ZXJJZChTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbiwgaXRlbS52YWx1ZSwgaXRlbS5sYWJlbCwgISFpc29sYXRpb25TY2hlbWE/LmVudW1EeW5hbWljKSxcblx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRpY29uOiBnZXRDb25maWdJY29uKFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCBpdGVtLnZhbHVlKSxcblx0XHRcdFx0Y2hlY2tlZDogaXRlbS52YWx1ZSA9PT0gaXNvbGF0aW9uVmFsdWUsXG5cdFx0XHRcdHNlY3Rpb25UaXRsZTogaW5kZXggPT09IDAgPyAoaXNvbGF0aW9uU2NoZW1hPy50aXRsZSA/PyBsb2NhbGl6ZSgnbW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5yZXBvU2hlZXQuaXNvbGF0aW9uU2VjdGlvbicsIFwiSXNvbGF0aW9uXCIpKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYnJhbmNoU2VjdGlvblRpdGxlID0gYnJhbmNoU2NoZW1hPy50aXRsZSA/PyBsb2NhbGl6ZSgnbW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZy5yZXBvU2hlZXQuYnJhbmNoU2VjdGlvbicsIFwiQmFzZSBCcmFuY2hcIik7XG5cdFx0aWYgKCFicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljKSB7XG5cdFx0XHRicmFuY2hJdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRzaGVldEl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGlkOiByZWdpc3RlcklkKFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBpdGVtLnZhbHVlLCBpdGVtLmxhYmVsLCAhIWJyYW5jaFNjaGVtYT8uZW51bUR5bmFtaWMpLFxuXHRcdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGljb246IGdldENvbmZpZ0ljb24oU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGl0ZW0udmFsdWUpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGl0ZW0udmFsdWUgPT09IGJyYW5jaFZhbHVlLFxuXHRcdFx0XHRcdHNlY3Rpb25UaXRsZTogaW5kZXggPT09IDAgPyBicmFuY2hTZWN0aW9uVGl0bGUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNoZWV0SXRlbXMubGVuZ3RoID09PSAwICYmICFicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHNlYXJjaDogSU1vYmlsZVBpY2tlclNoZWV0U2VhcmNoU291cmNlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChicmFuY2hTY2hlbWE/LmVudW1EeW5hbWljICYmICFicmFuY2hTY2hlbWEucmVhZE9ubHkpIHtcblx0XHRcdHNlYXJjaCA9IHtcblx0XHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hQbGFjZWhvbGRlcicsIFwiU2VhcmNoIGJyYW5jaGVzXCIpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hBcmlhJywgXCJTZWFyY2ggYmFzZSBicmFuY2hlc1wiKSxcblx0XHRcdFx0cmVzdWx0c1NlY3Rpb25UaXRsZTogYnJhbmNoU2VjdGlvblRpdGxlLFxuXHRcdFx0XHRlbXB0eU1lc3NhZ2U6IGxvY2FsaXplKCdtb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnLnJlcG9TaGVldC5icmFuY2hTZWFyY2hFbXB0eScsIFwiTm8gbWF0Y2hpbmcgYnJhbmNoZXMuXCIpLFxuXHRcdFx0XHRsb2FkSXRlbXM6IGFzeW5jIChxdWVyeSwgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IHF1ZXJ5XG5cdFx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2dldEl0ZW1zKHByb3ZpZGVyLCBzZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCBicmFuY2hTY2hlbWEsIHF1ZXJ5KVxuXHRcdFx0XHRcdFx0OiBicmFuY2hJdGVtcztcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdFx0XHRpZDogcmVnaXN0ZXJJZChTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaCwgaXRlbS52YWx1ZSwgaXRlbS5sYWJlbCwgISFicmFuY2hTY2hlbWEuZW51bUR5bmFtaWMpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGljb246IGdldENvbmZpZ0ljb24oU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsIGl0ZW0udmFsdWUpLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogaXRlbS52YWx1ZSA9PT0gYnJhbmNoVmFsdWUsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0YXdhaXQgc2hvd01vYmlsZVBpY2tlclNoZWV0KFxuXHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLFxuXHRcdFx0bG9jYWxpemUoJ21vYmlsZUFnZW50SG9zdFNlc3Npb25Db25maWcucmVwb1NoZWV0LnRpdGxlJywgXCJXb3JrdHJlZVwiKSxcblx0XHRcdHNoZWV0SXRlbXMsXG5cdFx0XHR7XG5cdFx0XHRcdHNlYXJjaCxcblx0XHRcdFx0Ly8gS2VlcCB0aGUgc2hlZXQgb3BlbiBvbiByb3cgdGFwcyBzbyB0aGUgdXNlciBjYW4gYWRqdXN0XG5cdFx0XHRcdC8vIGJvdGggaXNvbGF0aW9uIG1vZGUgYW5kIGJyYW5jaCB3aXRob3V0IHJlb3BlbmluZy4gRWFjaFxuXHRcdFx0XHQvLyB0YXAgd3JpdGVzIHRocm91Z2ggaW1tZWRpYXRlbHk7IERvbmUganVzdCBkaXNtaXNzZXMuXG5cdFx0XHRcdHN0YXlPcGVuT25TZWxlY3Q6IHRydWUsXG5cdFx0XHRcdG9uRGlkU2VsZWN0OiAoaWQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBpZFRvQ29uZmlnLmdldChpZCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYmVmb3JlVmFsdWUgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25JZCk/LnZhbHVlc1tzZWxlY3Rpb24ucHJvcGVydHldO1xuXHRcdFx0XHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRcdGlkOiAnTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXInLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBgTmV3Q2hhdEFnZW50SG9zdFNlc3Npb25Db25maWdQaWNrZXIuJHtzZWxlY3Rpb24ucHJvcGVydHl9YCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uSWRCZWZvcmU6IHR5cGVvZiBiZWZvcmVWYWx1ZSA9PT0gJ3N0cmluZycgPyBiZWZvcmVWYWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogc2VsZWN0aW9uLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25MYWJlbEFmdGVyOiBzZWxlY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGlzUElJOiBzZWxlY3Rpb24uaXNQSUksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uSWQsIHNlbGVjdGlvbi5wcm9wZXJ0eSwgc2VsZWN0aW9uLnZhbHVlKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdHRyaWdnZXIuZm9jdXMoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbmZpZ1BpY2tlcldpZGdldCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUGlja2VyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9waWNrZXI6IElDb25maWdQaWNrZXJXaWRnZXQsIGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgeyBpZDogJycsIGxhYmVsOiAnJywgZW5hYmxlZDogdHJ1ZSwgY2xhc3M6IHVuZGVmaW5lZCwgdG9vbHRpcDogJycsIHJ1bjogKCkgPT4geyB9IH0pO1xuXHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGlja2VyLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3Nlc3Npb25zLmNvbnRyaWIuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBUaGUgbW9kZS1waWNrZXIgZmFjdG9yaWVzIGJlbG93IHBpY2sgdGhlIG1vYmlsZSBzdWJjbGFzcyBhdFxuXHRcdC8vIHZpZXctaXRlbSBjb25zdHJ1Y3Rpb24gdGltZSB3aGVuIHRoZSB2aWV3cG9ydCBpcyBwaG9uZSwgYW5kXG5cdFx0Ly8gdGhlIGRlc2t0b3AgY2xhc3Mgb3RoZXJ3aXNlLiBUaGUgc2Vzc2lvbi1jb25maWcgcGlja2VyXG5cdFx0Ly8gYWx3YXlzIHVzZXMgdGhlIG1vYmlsZS1hd2FyZSBzdWJjbGFzcyBiZWNhdXNlIGl0c1xuXHRcdC8vIGBfc2hvd1BpY2tlcmAgb3ZlcnJpZGUgZmFsbHMgYmFjayB0byBgc3VwZXIuX3Nob3dQaWNrZXIoKWBcblx0XHQvLyBvbiBkZXNrdG9wLiBUaGUgc3RhdGljIGltcG9ydCBvZiBgTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlcmBcblx0XHQvLyAvIGBNb2JpbGVBZ2VudEhvc3RTZXNzaW9uQ29uZmlnUGlja2VyYCBjcmVhdGVzIGEgY2lyY3VsYXJcblx0XHQvLyBkZXBlbmRlbmN5IChtb2JpbGUgXHUyMTkyIGJhc2UgXHUyMTkyIG1vYmlsZSksIGJ1dCBFU00gaGFuZGxlcyBpdFxuXHRcdC8vIGJlY2F1c2UgdGhlIGNsYXNzZXMgYXJlIG9ubHkgYWNjZXNzZWQgaW5zaWRlIHRoZXNlIGZhY3Rvcnlcblx0XHQvLyBjYWxsYmFja3MsIHdoaWNoIHJ1biBhdCBgQWZ0ZXJSZXN0b3JlZGAgXHUyMDE0IHdlbGwgYWZ0ZXIgYm90aFxuXHRcdC8vIG1vZHVsZXMgaGF2ZSBmaW5pc2hlZCBldmFsdWF0aW5nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLk5ld1Nlc3Npb25SZXBvc2l0b3J5Q29uZmlnLFxuXHRcdFx0J3Nlc3Npb25zLmFnZW50SG9zdC5zZXNzaW9uQ29uZmlnUGlja2VyJyxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlciwgc2Vzc2lvbikpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXG5cdFx0XHRNZW51cy5OZXdTZXNzaW9uQ29udHJvbCxcblx0XHRcdE5FV19TRVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0KF9hY3Rpb24sIF9vcHRpb25zLCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQaWNrZXJBY3Rpb25WaWV3SXRlbShzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRpc1Bob25lTGF5b3V0KHRoaXMuX2xheW91dFNlcnZpY2UpID8gTW9iaWxlQWdlbnRIb3N0TW9kZVBpY2tlciA6IEFnZW50SG9zdE1vZGVQaWNrZXIsXG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0KSk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRSVU5OSU5HX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQsXG5cdFx0XHQoX2FjdGlvbiwgX29wdGlvbnMsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uQ29udGV4dCkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdGlzUGhvbmVMYXlvdXQodGhpcy5fbGF5b3V0U2VydmljZSkgPyBNb2JpbGVBZ2VudEhvc3RNb2RlUGlja2VyIDogQWdlbnRIb3N0TW9kZVBpY2tlcixcblx0XHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHQpKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRORVdfU0VTU0lPTl9BUFBST1ZFX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHRoaXMuX2NyZWF0ZU5ld1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoXG5cdFx0XHRNZW51cy5OZXdTZXNzaW9uQ29udHJvbCxcblx0XHRcdE5FV19TRVNTSU9OX1BFUk1JU1NJT05fTU9ERV9QSUNLRVJfSUQsXG5cdFx0XHQoX2FjdGlvbiwgX29wdGlvbnMsIHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiB9ID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElTZXNzaW9uQ29udGV4dCkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENsYXVkZVBlcm1pc3Npb25Nb2RlUGlja2VyLCBzZXNzaW9uKSk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLk5ld1Nlc3Npb25Db250cm9sLFxuXHRcdFx0TkVXX1NFU1NJT05fQ09ERVhfQVBQUk9WQUxTX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q29kZXhBcHByb3ZhbHNQaWNrZXIsIHNlc3Npb24pKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFJVTk5JTkdfU0VTU0lPTl9DT05GSUdfUElDS0VSX0lELFxuXHRcdFx0dGhpcy5fY3JlYXRlUnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyRmFjdG9yeSgpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRSVU5OSU5HX1NFU1NJT05fUEVSTUlTU0lPTl9NT0RFX1BJQ0tFUl9JRCxcblx0XHRcdChfYWN0aW9uLCBfb3B0aW9ucywgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0XHRcdHJldHVybiBuZXcgUGlja2VyQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2xhdWRlUGVybWlzc2lvbk1vZGVQaWNrZXIsIHNlc3Npb24pKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFJVTk5JTkdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0KF9hY3Rpb24sIF9vcHRpb25zLCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQaWNrZXJBY3Rpb25WaWV3SXRlbShzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlciwgc2Vzc2lvbikpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbiB0aGUgbmV3LWNoYXQgcGFnZSAobGVmdCBvZiB0aGUgdG9vbGJhciksIHVzZSB0aGUgc2Vzc2lvbnNcblx0ICoge0BsaW5rIFBlcm1pc3Npb25QaWNrZXJ9IHNvIHRoZSBzdHlsaW5nIG1hdGNoZXMgdGhlIHN1cnJvdW5kaW5nIHNlc3Npb25zXG5cdCAqIHBpY2tlcnMgKGZvbnQgc2l6ZSwgcGFkZGluZywgaWNvbiBzaXplKS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZU5ld1Nlc3Npb25QZXJtaXNzaW9uUGlja2VyKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBQaWNrZXJBY3Rpb25WaWV3SXRlbSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uIH0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSVNlc3Npb25Db250ZXh0KSk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIHNlc3Npb24pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZVBlcm1pc3Npb25QaWNrZXIsIGRlbGVnYXRlKTtcblx0XHRyZXR1cm4gbmV3IFBpY2tlckFjdGlvblZpZXdJdGVtKHBpY2tlciwgZGVsZWdhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluc2lkZSBhIHJ1bm5pbmcgY2hhdCB3aWRnZXQgKGBDaGF0SW5wdXRTZWNvbmRhcnlgKSwgdXNlIHRoZSB3b3JrYmVuY2hcblx0ICoge0BsaW5rIFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtfSBzbyBpdCBtYXRjaGVzIHRoZSByZXN0IG9mIHRoZVxuXHQgKiBjaGF0LWlucHV0IHNlY29uZGFyeSB0b29sYmFyICh3aGljaCBpcyB3aGF0IHRoZSBleHRlbnNpb24taG9zdCBDTElcblx0ICogYWxyZWFkeSB1c2VzKS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVJ1bm5pbmdTZXNzaW9uUGVybWlzc2lvblBpY2tlckZhY3RvcnkoKTogSUFjdGlvblZpZXdJdGVtRmFjdG9yeSB7XG5cdFx0cmV0dXJuIChhY3Rpb24sIF9vcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdGNvbnN0IHBpY2tlck9wdGlvbnM6IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zID0ge1xuXHRcdFx0XHRjb21wYWN0OiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0XHRcdGxpc3RPcHRpb25zOiB7IG1pbldpZHRoOiAyNTUgfSxcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFnZW50SG9zdFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdHBpY2tlck9wdGlvbnMsXG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHQpO1xuXHRcdH07XG5cdH1cbn1cblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBhdXRvLWFwcHJvdmUgcGlja2VyIChsZWZ0IHNpZGUsIE5ld1Nlc3Npb25Db250cm9sKSAtLS0tXG5cbmNvbnN0IE5FV19TRVNTSU9OX0FQUFJPVkVfUElDS0VSX0lEID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5uZXdTZXNzaW9uQXBwcm92ZVBpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTkVXX1NFU1NJT05fQVBQUk9WRV9QSUNLRVJfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudEhvc3ROZXdTZXNzaW9uQXBwcm92ZVBpY2tlcicsIFwiU2Vzc2lvbiBBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuY29uc3QgTkVXX1NFU1NJT05fUEVSTUlTU0lPTl9NT0RFX1BJQ0tFUl9JRCA9ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9QRVJNSVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0TmV3U2Vzc2lvblBlcm1pc3Npb25Nb2RlUGlja2VyJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBDb2RleCBhcHByb3ZhbHMgcGlja2VyIChOZXdTZXNzaW9uQ29udHJvbCkgLS0tLVxuLy8gQ29kZXgtc3BlY2lmaWMgXCJBcHByb3ZhbHNcIiBjaGlwLiBTaGFyZXMgdGhlIE5ld1Nlc3Npb25Db250cm9sIG5hdmlnYXRpb25cbi8vIGdyb3VwIHdpdGggdGhlIENsYXVkZSBwZXJtaXNzaW9uLW1vZGUgcGlja2VyIChvcmRlciAyKTsgdGhlIHR3byBhcmVcbi8vIG11dHVhbGx5IGV4Y2x1c2l2ZSBiZWNhdXNlIGVhY2ggaGlkZXMgaXRzZWxmIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uJ3Ncbi8vIHNjaGVtYSBkb2Vzbid0IGV4cG9zZSBpdHMgYmFja2luZyBwcm9wZXJ0eS5cblxuY29uc3QgTkVXX1NFU1NJT05fQ09ERVhfQVBQUk9WQUxTX1BJQ0tFUl9JRCA9ICdzZXNzaW9ucy5hZ2VudEhvc3QubmV3U2Vzc2lvbkNvZGV4QXBwcm92YWxzUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0TmV3U2Vzc2lvbkNvZGV4QXBwcm92YWxzUGlja2VyJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudXMuTmV3U2Vzc2lvbkNvbnRyb2wsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihJc0FjdGl2ZVNlc3Npb25Mb2NhbEFnZW50SG9zdCwgSXNBY3RpdmVTZXNzaW9uUmVtb3RlQWdlbnRIb3N0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuLy8gLS0tLSBOZXcgc2Vzc2lvbiBtb2RlIHBpY2tlciAoTmV3U2Vzc2lvbkNvbnRyb2wpIC0tLS1cblxuY29uc3QgTkVXX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0Lm5ld1Nlc3Npb25Nb2RlUGlja2VyJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBORVdfU0VTU0lPTl9NT0RFX1BJQ0tFUl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50SG9zdE5ld1Nlc3Npb25Nb2RlUGlja2VyJywgXCJBZ2VudCBNb2RlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLk5ld1Nlc3Npb25Db250cm9sLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Ly8gT24gcGhvbmUgdGhlIHtAbGluayBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJ9IHJlcGxhY2VzXG5cdFx0XHRcdC8vIHRoaXMgcGlja2VyIHdpdGggYSB1bmlmaWVkIG1vZGUgKyBtb2RlbCBib3R0b20gc2hlZXQsIHNvXG5cdFx0XHRcdC8vIGdhdGUgdGhpcyBkZXNrdG9wLW9ubHkgQWN0aW9uIG91dCBvZiBwaG9uZSBsYXlvdXRzLlxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoSXNBY3RpdmVTZXNzaW9uTG9jYWxBZ2VudEhvc3QsIElzQWN0aXZlU2Vzc2lvblJlbW90ZUFnZW50SG9zdCksXG5cdFx0XHRcdFx0SXNQaG9uZUxheW91dENvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cblxuLy8gLS0tLSBSdW5uaW5nIHNlc3Npb24gY29uZmlnIHBpY2tlciAoQ2hhdElucHV0U2Vjb25kYXJ5KSAtLS0tXG5cbmNvbnN0IFJVTk5JTkdfU0VTU0lPTl9DT05GSUdfUElDS0VSX0lEID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5ydW5uaW5nU2Vzc2lvbkNvbmZpZ1BpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUlVOTklOR19TRVNTSU9OX0NPTkZJR19QSUNLRVJfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhZ2VudEhvc3RSdW5uaW5nU2Vzc2lvbkNvbmZpZ1BpY2tlcicsIFwiU2Vzc2lvbiBBcHByb3ZhbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleUV4cHJzLmlzQWdlbnRIb3N0U2Vzc2lvbixcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4geyB9XG59KTtcblxuY29uc3QgUlVOTklOR19TRVNTSU9OX1BFUk1JU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uUGVybWlzc2lvbk1vZGVQaWNrZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJVTk5JTkdfU0VTU0lPTl9QRVJNSVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25QZXJtaXNzaW9uTW9kZVBpY2tlcicsIFwiQXBwcm92YWxzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMSxcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb24sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cbi8vIC0tLS0gUnVubmluZyBzZXNzaW9uIENvZGV4IGFwcHJvdmFscyBwaWNrZXIgKENoYXRJbnB1dFNlY29uZGFyeSkgLS0tLVxuLy8gQ29kZXgtc3BlY2lmaWMgXCJBcHByb3ZhbHNcIiBjaGlwIGZvciBhIHJ1bm5pbmcgc2Vzc2lvbi4gTXV0dWFsbHkgZXhjbHVzaXZlXG4vLyB3aXRoIHRoZSBDbGF1ZGUgcGVybWlzc2lvbi1tb2RlIHBpY2tlciAob3JkZXIgMTEpIFx1MjAxNCBlYWNoIGhpZGVzIHdoZW4gaXRzXG4vLyBiYWNraW5nIHByb3BlcnR5IGlzIGFic2VudCBmcm9tIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHNjaGVtYS5cblxuY29uc3QgUlVOTklOR19TRVNTSU9OX0NPREVYX0FQUFJPVkFMU19QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uQ29kZXhBcHByb3ZhbHNQaWNrZXInO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJVTk5JTkdfU0VTU0lPTl9DT0RFWF9BUFBST1ZBTFNfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25Db2RleEFwcHJvdmFsc1BpY2tlcicsIFwiQXBwcm92YWxzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxMixcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlFeHBycy5pc0FnZW50SG9zdFNlc3Npb24sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cblxuLy8gLS0tLSBSdW5uaW5nIHNlc3Npb24gbW9kZSBwaWNrZXIgKENoYXRJbnB1dFNlY29uZGFyeSwgYmVmb3JlIGFwcHJvdmFscykgLS0tLVxuXG5jb25zdCBSVU5OSU5HX1NFU1NJT05fTU9ERV9QSUNLRVJfSUQgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnJ1bm5pbmdTZXNzaW9uTW9kZVBpY2tlcic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUlVOTklOR19TRVNTSU9OX01PREVfUElDS0VSX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRIb3N0UnVubmluZ1Nlc3Npb25Nb2RlUGlja2VyJywgXCJBZ2VudCBNb2RlXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHQvLyBIaWRlIHRoZSBhZ2VudCBtb2RlIHBpY2tlciB3aGlsZSBhIGRlbGVnYXRpb24gKGNvbnRpbnVlIGluKSB0YXJnZXQgaXMgcGVuZGluZy5cblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5RXhwcnMuaXNBZ2VudEhvc3RTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXQubmVnYXRlKCkpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzaG93QWN0aXZlU2Vzc2lvbk1vZGVQaWNrZXIoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbi5JRCwgQWdlbnRIb3N0U2Vzc2lvbkNvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZ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
