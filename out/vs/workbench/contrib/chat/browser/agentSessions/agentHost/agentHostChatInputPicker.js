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
import "./media/agentHostChatInputPicker.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { getCodexApprovalsPickerListOptions } from "../../../../../../platform/agentHost/browser/codexApprovalsPicker.js";
import { IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { KNOWN_AUTO_APPROVE_VALUES, SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ClaudeSessionConfigKey } from "../../../../../../platform/agentHost/common/claudeSessionConfigKeys.js";
import { CodexSessionConfigKey } from "../../../../../../platform/agentHost/common/codexSessionConfigKeys.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from "../../../common/constants.js";
import { isAssistedPermissionsEnabled, isAutoApprovePolicyRestricted, isAutoApproveValuePolicyRestricted, isPermissionLevelVisible, normalizeSessionConfigValue } from "../../../common/agentHostConfigPolicy.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../common/chatPermissionWarnings.js";
import { isUntitledChatSession } from "../../../common/model/chatUri.js";
import { withChatInputPickerMotion } from "../../widget/input/chatInputPickerActionItem.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "./agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostNewSessionFolderService } from "./agentHostNewSessionFolderService.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { toAgentHostBackendSessionUri } from "./agentHostSessionUri.js";
const FILTER_THRESHOLD = 10;
const LEARN_MORE_VALUE = "__agentHostChatInputPicker.learnMore__";
const PERMISSIONS_LEARN_MORE_URL = "https://aka.ms/vscode/docs/permissions";
const CODEX_APPROVALS_LEARN_MORE_URL = "https://developers.openai.com/codex/concepts/sandboxing#how-you-control-it";
function getConfigIcon(property, value) {
  if (property === SessionConfigKey.Mode) {
    switch (value) {
      case "plan":
        return Codicon.checklist;
      case "autopilot":
        return Codicon.rocket;
      case "interactive":
        return Codicon.comment;
    }
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
  if (property === ClaudeSessionConfigKey.PermissionMode && typeof value === "string") {
    switch (value) {
      case "default":
        return Codicon.shield;
      case "acceptEdits":
        return Codicon.edit;
      case "plan":
        return Codicon.lightbulb;
      case "auto":
        return Codicon.sparkle;
      case "bypassPermissions":
        return Codicon.warning;
    }
  }
  if (property === CodexSessionConfigKey.PermissionsPreset && typeof value === "string") {
    switch (value) {
      case "default":
        return Codicon.shield;
      case "auto-review":
        return Codicon.sparkle;
      case "full-access":
        return Codicon.warning;
    }
  }
  return void 0;
}
function toActionItems(property, items, currentValue, policyRestricted = false) {
  return items.map((item) => {
    const disabled = property === SessionConfigKey.AutoApprove && isAutoApproveValuePolicyRestricted(item.value, policyRestricted);
    const hover = getConfigPickerItemHover(property, item, disabled);
    return {
      kind: ActionListItemKind.Action,
      label: item.label,
      detail: disabled ? hover : item.description,
      group: { title: "", icon: getConfigIcon(property, item.value) },
      disabled,
      ...hover ? { hover: { content: hover } } : {},
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
function getAutoApproveHover(value, fallback) {
  switch (value) {
    case ChatPermissionLevel.Default:
      return localize("agentHostChatInputPicker.defaultApprovalsHover", "Copilot asks before running tools unless your configured settings allow the tool.");
    case ChatPermissionLevel.Assisted:
      return localize("agentHostChatInputPicker.assistedApprovalsHover", "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval.");
    case ChatPermissionLevel.AutoApprove:
      return localize("agentHostChatInputPicker.autoApproveHover", "Copilot runs all tools without asking for approval.");
    case ChatPermissionLevel.Autopilot:
      return localize("agentHostChatInputPicker.autopilotApprovalsHover", "Copilot runs tools without asking for approval and continues until the task is done.");
  }
  return fallback ?? localize("agentHostChatInputPicker.approvalsHover", "Controls whether the agent asks before running tools in this session.");
}
function getEnumValueDescription(schema, value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const index = schema.enum?.indexOf(value) ?? -1;
  return index >= 0 ? schema.enumDescriptions?.[index] : void 0;
}
function getConfigPickerTriggerHover(property, schema, value, isReadOnly) {
  if (property === CodexSessionConfigKey.PermissionsPreset) {
    return getEnumValueDescription(schema, value) ?? schema.description ?? schema.title;
  }
  if (property !== SessionConfigKey.AutoApprove) {
    return schema.description ?? schema.title;
  }
  const hover = getAutoApproveHover(value, getEnumValueDescription(schema, value));
  if (isReadOnly) {
    return localize("agentHostChatInputPicker.approvalsLevelHoverReadOnly", "{0} Read-only.", hover);
  }
  return hover;
}
function getConfigPickerItemHover(property, item, disabled) {
  if (disabled) {
    return localize("agentHostChatInputPicker.policyDisabledHover", "Disabled by your organization. Contact your administrator.");
  }
  if (property === SessionConfigKey.AutoApprove) {
    return getAutoApproveHover(item.value, item.description);
  }
  return void 0;
}
function getPermissionsLearnMoreUrl(property) {
  if (property === CodexSessionConfigKey.PermissionsPreset) {
    return CODEX_APPROVALS_LEARN_MORE_URL;
  }
  if (property === ClaudeSessionConfigKey.PermissionMode || property === SessionConfigKey.AutoApprove) {
    return PERMISSIONS_LEARN_MORE_URL;
  }
  return void 0;
}
function getConfigPickerListOptions(property) {
  switch (property) {
    case SessionConfigKey.Mode:
      return { minWidth: 260 };
    case SessionConfigKey.AutoApprove:
      return { minWidth: 255 };
    case CodexSessionConfigKey.PermissionsPreset:
      return getCodexApprovalsPickerListOptions();
    default:
      return void 0;
  }
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
function isWellKnownAutoApproveSchema(schema) {
  if (schema.type !== "string" || !Array.isArray(schema.enum) || schema.enum.length === 0) {
    return false;
  }
  if (!schema.enum.includes("default")) {
    return false;
  }
  return schema.enum.every((value) => typeof value === "string" && KNOWN_AUTO_APPROVE_VALUES.has(value));
}
const WELL_KNOWN_PICKER_PROPERTIES = /* @__PURE__ */ new Set([
  SessionConfigKey.Mode,
  SessionConfigKey.AutoApprove,
  SessionConfigKey.Isolation,
  SessionConfigKey.Branch,
  SessionConfigKey.Permissions,
  SessionConfigKey.WorktreeBranchPrefix,
  SessionConfigKey.WorktreeBranchTrack,
  SessionConfigKey.WorktreeIncludeFiles,
  ClaudeSessionConfigKey.PermissionMode,
  CodexSessionConfigKey.PermissionsPreset
]);
function isClaimedByDedicatedPicker(property, schema) {
  if (property === SessionConfigKey.AutoApprove) {
    return isWellKnownAutoApproveSchema(schema);
  }
  return WELL_KNOWN_PICKER_PROPERTIES.has(property);
}
function resolveConfigChipValue(isUntitled, serverValue, overlayValue, schemaDefault) {
  const preferred = isUntitled ? overlayValue ?? serverValue : serverValue ?? overlayValue;
  return preferred ?? schemaDefault;
}
let AgentHostChatInputPicker = class extends Disposable {
  constructor(_widget, _property, _agentHostService, _actionWidgetService, _hoverService, _openerService, _workingDirectoryResolver, _workspaceContextService, _provisional, _configurationService, _newSessionFolderService, _dialogService, _storageService) {
    super();
    this._widget = _widget;
    this._property = _property;
    this._agentHostService = _agentHostService;
    this._actionWidgetService = _actionWidgetService;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this._workingDirectoryResolver = _workingDirectoryResolver;
    this._workspaceContextService = _workspaceContextService;
    this._provisional = _provisional;
    this._configurationService = _configurationService;
    this._newSessionFolderService = _newSessionFolderService;
    this._dialogService = _dialogService;
    this._storageService = _storageService;
    this._initialResolveCts = this._registerInitialResolveCts();
    this._renderDisposables = this._register(new DisposableStore());
    this._filterDelayer = this._register(new Delayer(200));
    this._subRef = this._register(new MutableDisposable());
    this._register(this._widget.onDidChangeViewModel(() => {
      this._reattach();
    }));
    this._register(this._provisional.onDidChange((sessionResource) => {
      const current = this._widget.viewModel?.sessionResource;
      if (current && current.toString() === sessionResource.toString()) {
        this._reattach();
      }
    }));
    this._reattach();
  }
  _registerInitialResolveCts() {
    const cts = new MutableDisposable();
    this._register(toDisposable(() => {
      this._container = void 0;
      this._cancelInitialResolve();
    }));
    return this._register(cts);
  }
  render(container) {
    this._container = container;
    container.classList.add("agent-host-chat-input-picker-host");
    container.classList.add(`agent-host-chat-input-picker-host-${this._property}`);
    this._renderChip();
  }
  _reattach() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    const provisionalBackend = sessionResource ? this._provisional.get(sessionResource) : void 0;
    const backendSession = provisionalBackend ?? (sessionResource ? toAgentHostBackendSessionUri(sessionResource) : void 0);
    if (!sessionResource || !backendSession) {
      this._subRef.clear();
      this._initialResolved = void 0;
      this._cancelInitialResolve();
      this._renderChip();
      return;
    }
    if (isUntitledChatSession(sessionResource) && !provisionalBackend) {
      this._subRef.clear();
      if (!this._initialResolved || this._initialResolved.sessionResource.toString() !== sessionResource.toString()) {
        this._initialResolved = void 0;
        void this._refreshInitialResolved(sessionResource, backendSession);
      }
      void this._provisional.getOrCreate(
        sessionResource,
        backendSession.scheme,
        this._readWorkingDirectory()
      );
      this._renderChip();
      return;
    }
    this._initialResolved = void 0;
    this._cancelInitialResolve();
    const ref = this._agentHostService.getSubscription(StateComponents.Session, backendSession, "AgentHostChatInputPicker");
    const sub = ref.object;
    const listener = sub.onDidChange(() => this._renderChip());
    this._subRef.value = {
      sub,
      backendSession,
      dispose: () => {
        listener.dispose();
        ref.dispose();
      }
    };
    this._renderChip();
  }
  _cancelInitialResolve() {
    this._initialResolveCts.value?.cancel();
    this._initialResolveCts.clear();
  }
  async _refreshInitialResolved(sessionResource, backendSession) {
    this._initialResolveCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._initialResolveCts.value = cts;
    try {
      const result = await this._agentHostService.resolveSessionConfig({
        provider: backendSession.scheme,
        workingDirectory: this._readWorkingDirectory()
      });
      if (cts.token.isCancellationRequested || this._widget.viewModel?.sessionResource?.toString() !== sessionResource.toString()) {
        return;
      }
      this._initialResolved = { sessionResource, result };
      this._renderChip();
    } catch {
    }
  }
  _renderChip() {
    if (!this._container || this._renderDisposables.isDisposed) {
      return;
    }
    this._renderDisposables.clear();
    dom.clearNode(this._container);
    const ctx = this._readContext();
    const sessionResource = this._widget.viewModel?.sessionResource;
    const isStartedSession = !!sessionResource && !isUntitledChatSession(sessionResource);
    if (!ctx || isStartedSession && ctx.schema.sessionMutable === false) {
      this._container.style.display = "none";
      this._container.classList.add("agent-host-chat-input-picker-host-hidden");
      return;
    }
    if (this._property === SessionConfigKey.AutoApprove && !isWellKnownAutoApproveSchema(ctx.schema)) {
      this._container.style.display = "none";
      this._container.classList.add("agent-host-chat-input-picker-host-hidden");
      return;
    }
    this._container.style.display = "";
    this._container.classList.remove("agent-host-chat-input-picker-host-hidden");
    const slot = dom.append(this._container, dom.$(".agent-host-chat-input-picker-slot"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const isReadOnly = !!ctx.schema.readOnly || isStartedSession && ctx.schema.sessionMutable === false;
    const trigger = renderPickerTrigger(slot, isReadOnly, this._renderDisposables, () => this._showPicker(trigger));
    const tooltip = getConfigPickerTriggerHover(this._property, ctx.schema, ctx.value, isReadOnly);
    if (tooltip) {
      this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, { content: tooltip }));
    }
    this._renderTrigger(trigger, ctx.schema, ctx.value, isReadOnly);
  }
  _renderTrigger(trigger, schema, value, isReadOnly) {
    dom.clearNode(trigger);
    const icon = getConfigIcon(this._property, value);
    if (icon) {
      dom.append(trigger, renderIcon(icon));
    }
    if (this._property === SessionConfigKey.AutoApprove) {
      trigger.classList.toggle("warning", value === "autopilot" || value === "assisted");
      trigger.classList.toggle("info", value === "autoApprove");
    }
    const label = this._labelFor(schema, value);
    const labelSpan = dom.append(trigger, dom.$("span.agent-host-chat-input-picker-label"));
    labelSpan.textContent = label;
    trigger.setAttribute("aria-label", isReadOnly ? localize("agentHostChatInputPicker.triggerAriaReadOnly", "{0}: {1}, Read-Only", schema.title, label) : localize("agentHostChatInputPicker.triggerAria", "{0}: {1}", schema.title, label));
  }
  _labelFor(schema, value) {
    if (schema.type === "boolean") {
      return value === true ? localize("agentHostChatInputPicker.boolean.onLabel", "On") : localize("agentHostChatInputPicker.boolean.offLabel", "Off");
    }
    if (typeof value === "string") {
      const index = schema.enum?.indexOf(value) ?? -1;
      return index >= 0 ? schema.enumLabels?.[index] ?? value : value;
    }
    return schema.title;
  }
  _readContext() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    if (!sessionResource) {
      return void 0;
    }
    if (this._subRef.value) {
      const state = this._subRef.value.sub.value;
      if (!state || state instanceof Error) {
        return void 0;
      }
      const overlay = this._provisional.getResolvedConfig(sessionResource);
      const schemaSource = overlay?.schema ?? state.config?.schema;
      const schema = schemaSource?.properties[this._property];
      if (!schema) {
        return void 0;
      }
      const serverValue = state.config?.values?.[this._property];
      const overlayValue = overlay?.values?.[this._property];
      const value = resolveConfigChipValue(isUntitledChatSession(sessionResource), serverValue, overlayValue, schema.default);
      return { backendSession: this._subRef.value.backendSession, schema, value };
    }
    if (this._initialResolved && this._initialResolved.sessionResource.toString() === sessionResource.toString()) {
      const schema = this._initialResolved.result.schema.properties[this._property];
      if (!schema) {
        return void 0;
      }
      const backendSession = toAgentHostBackendSessionUri(sessionResource);
      if (!backendSession) {
        return void 0;
      }
      const value = this._initialResolved.result.values?.[this._property] ?? schema.default;
      return { backendSession, schema, value };
    }
    return void 0;
  }
  async _showPicker(trigger) {
    if (this._actionWidgetService.isVisible) {
      return;
    }
    const ctx = this._readContext();
    if (!ctx || ctx.schema.readOnly) {
      return;
    }
    const items = await this._getItems(ctx.schema);
    if (items.length === 0) {
      return;
    }
    const currentValue = ctx.value;
    const policyRestricted = isAutoApprovePolicyRestricted(this._configurationService);
    const actionItems = toActionItems(this._property, items, currentValue, policyRestricted);
    const permissionsLearnMoreUrl = getPermissionsLearnMoreUrl(this._property);
    if (permissionsLearnMoreUrl) {
      const learnMoreLabel = localize("agentHostChatInputPicker.learnMorePermissions", "Learn more about permissions");
      actionItems.push({
        kind: ActionListItemKind.Separator,
        label: ""
      });
      actionItems.push({
        kind: ActionListItemKind.Action,
        label: learnMoreLabel,
        group: { title: "", icon: Codicon.blank },
        item: { value: LEARN_MORE_VALUE, label: learnMoreLabel }
      });
    }
    const delegate = {
      onSelect: (item) => {
        this._actionWidgetService.hide();
        if (item.value === LEARN_MORE_VALUE) {
          if (permissionsLearnMoreUrl) {
            void this._openerService.open(URI.parse(permissionsLearnMoreUrl));
          }
          return;
        }
        void this._confirmAndSetValue(ctx.backendSession, item);
      },
      onFilter: ctx.schema.enumDynamic ? (query) => this._filterDelayer.trigger(async () => {
        const refreshed = this._readContext();
        if (!refreshed) {
          return [];
        }
        return toActionItems(this._property, await this._getItems(refreshed.schema, query), refreshed.value, isAutoApprovePolicyRestricted(this._configurationService));
      }) : void 0,
      onHide: () => trigger.focus()
    };
    this._actionWidgetService.show(
      `agentHostChatInputPicker.${this._property}`,
      false,
      actionItems,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("agentHostChatInputPicker.ariaLabel", "{0} Picker", ctx.schema.title)
      },
      withChatInputPickerMotion({
        ...getConfigPickerListOptions(this._property),
        ...actionItems.length > FILTER_THRESHOLD || ctx.schema.enumDynamic ? { showFilter: true, filterPlaceholder: localize("agentHostChatInputPicker.filter", "Filter...") } : {}
      })
    );
  }
  async _getItems(schema, query) {
    if (schema.type === "boolean") {
      return [
        { value: "true", label: localize("agentHostChatInputPicker.boolean.true", "On") },
        { value: "false", label: localize("agentHostChatInputPicker.boolean.false", "Off") }
      ];
    }
    const sessionResource = this._widget.viewModel?.sessionResource;
    const backendSession = this._subRef.value?.backendSession ?? (sessionResource ? toAgentHostBackendSessionUri(sessionResource) : void 0);
    if (schema.enumDynamic && backendSession) {
      try {
        const result = await this._agentHostService.sessionConfigCompletions({
          provider: backendSession.scheme,
          property: this._property,
          query,
          workingDirectory: this._readWorkingDirectory(),
          config: this._readCurrentValues()
        });
        return this._filterAutoApproveItems(result.items.map((item) => this._fromCompletion(item)));
      } catch {
      }
    }
    return this._filterAutoApproveItems((schema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: schema.enumLabels?.[index] ?? String(value),
      description: schema.enumDescriptions?.[index]
    })));
  }
  _filterAutoApproveItems(items) {
    if (this._property !== SessionConfigKey.AutoApprove) {
      return items;
    }
    const assistedPermissionsEnabled = isAssistedPermissionsEnabled(this._configurationService);
    return items.filter((item) => isPermissionLevelVisible(item.value, assistedPermissionsEnabled));
  }
  _fromCompletion(item) {
    return { value: item.value, label: item.label, description: item.description };
  }
  _readWorkingDirectory() {
    const state = this._subRef.value?.sub.value;
    if (state && !(state instanceof Error)) {
      const cwd = state.workingDirectories?.[0];
      return typeof cwd === "string" ? URI.parse(cwd) : cwd;
    }
    const sessionResource = this._widget.viewModel?.sessionResource;
    return (sessionResource && this._newSessionFolderService.getFolder(sessionResource)) ?? (sessionResource && this._workingDirectoryResolver.resolve(sessionResource)) ?? this._newSessionFolderService.getDefaultFolder() ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
  }
  _readCurrentValues() {
    const sessionResource = this._widget.viewModel?.sessionResource;
    const overlay = sessionResource ? this._provisional.getResolvedConfig(sessionResource) : void 0;
    const state = this._subRef.value?.sub.value;
    if (state && !(state instanceof Error)) {
      return { ...state.config?.values ?? {}, ...overlay?.values ?? {} };
    }
    return overlay?.values ?? this._initialResolved?.result.values;
  }
  /**
   * Surfaces the shared elevated-level warning before applying an approval
   * pick. Unknown non-default values fall back to the Bypass warning.
   */
  async _confirmAndSetValue(backendSession, item) {
    const value = item.value;
    if (this._property === SessionConfigKey.AutoApprove && !isPermissionLevelVisible(value, isAssistedPermissionsEnabled(this._configurationService))) {
      return;
    }
    if (this._property === SessionConfigKey.AutoApprove) {
      const levelToConfirm = isChatPermissionLevel(value) ? value : value !== ChatPermissionLevel.Default ? ChatPermissionLevel.AutoApprove : void 0;
      if (levelToConfirm) {
        const confirmed = await maybeConfirmElevatedPermissionLevel(levelToConfirm, this._dialogService, this._storageService, {
          defaultSettingKey: ChatConfiguration.DefaultConfiguration,
          levelLabel: item.label
        });
        if (!confirmed) {
          return;
        }
      }
    }
    await this._setValue(backendSession, value);
  }
  async _setValue(backendSession, value) {
    const sessionResource = this._widget.viewModel?.sessionResource;
    if (!sessionResource) {
      return;
    }
    const ctx = this._readContext();
    const normalizedValue = ctx?.schema.type === "boolean" ? value === "true" : normalizeSessionConfigValue(this._property, value, isAutoApprovePolicyRestricted(this._configurationService));
    const partial = { [this._property]: normalizedValue };
    const nextConfig = { ...this._readCurrentValues() ?? {}, ...partial };
    if (isUntitledChatSession(sessionResource)) {
      const provider = backendSession.scheme;
      const created = await this._provisional.applyConfigChange(
        sessionResource,
        provider,
        this._readWorkingDirectory(),
        partial
      );
      if (!created) {
        return;
      }
      if (!this._subRef.value || this._subRef.value.backendSession.toString() !== created.toString()) {
        this._reattach();
      }
      return;
    }
    this._agentHostService.dispatch(backendSession.toString(), {
      type: ActionType.SessionConfigChanged,
      config: partial
    });
    void this._provisional.refreshResolvedConfig(
      sessionResource,
      backendSession.scheme,
      this._readWorkingDirectory(),
      nextConfig
    );
  }
};
AgentHostChatInputPicker = __decorateClass([
  __decorateParam(2, IAgentHostService),
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IAgentHostSessionWorkingDirectoryResolver),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAgentHostNewSessionFolderService),
  __decorateParam(11, IDialogService),
  __decorateParam(12, IStorageService)
], AgentHostChatInputPicker);
class AgentHostChatInputPickerActionViewItem extends BaseActionViewItem {
  constructor(action, _picker) {
    super(void 0, action);
    this._picker = _picker;
    this._register(this._picker);
  }
  render(container) {
    this._picker.render(container);
  }
}
export {
  AgentHostChatInputPicker,
  AgentHostChatInputPickerActionViewItem,
  WELL_KNOWN_PICKER_PROPERTIES,
  getConfigPickerItemHover,
  getConfigPickerListOptions,
  getConfigPickerTriggerHover,
  isClaimedByDedicatedPicker,
  isWellKnownAutoApproveSchema,
  resolveConfigChipValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uTGlzdE9wdGlvbnMsIEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBnZXRDb2RleEFwcHJvdmFsc1BpY2tlckxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvY29kZXhBcHByb3ZhbHNQaWNrZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBLTk9XTl9BVVRPX0FQUFJPVkVfVkFMVUVTLCBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jbGF1ZGVTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDb2RleFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2NvZGV4U2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvYWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIFNlc3Npb25Db25maWdWYWx1ZUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwsIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCwgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQsIGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQsIGlzUGVybWlzc2lvbkxldmVsVmlzaWJsZSwgbm9ybWFsaXplU2Vzc2lvbkNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FnZW50SG9zdENvbmZpZ1BvbGljeS5qcyc7XG5pbXBvcnQgeyBtYXliZUNvbmZpcm1FbGV2YXRlZFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0UGVybWlzc2lvbldhcm5pbmdzLmpzJztcbmltcG9ydCB7IGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IHdpdGhDaGF0SW5wdXRQaWNrZXJNb3Rpb24gfSBmcm9tICcuLi8uLi93aWRnZXQvaW5wdXQvY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uVXJpLmpzJztcblxuY29uc3QgRklMVEVSX1RIUkVTSE9MRCA9IDEwO1xuXG5jb25zdCBMRUFSTl9NT1JFX1ZBTFVFID0gJ19fYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmxlYXJuTW9yZV9fJztcbmNvbnN0IFBFUk1JU1NJT05TX0xFQVJOX01PUkVfVVJMID0gJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS9kb2NzL3Blcm1pc3Npb25zJztcbmNvbnN0IENPREVYX0FQUFJPVkFMU19MRUFSTl9NT1JFX1VSTCA9ICdodHRwczovL2RldmVsb3BlcnMub3BlbmFpLmNvbS9jb2RleC9jb25jZXB0cy9zYW5kYm94aW5nI2hvdy15b3UtY29udHJvbC1pdCc7XG5cbmludGVyZmFjZSBJQ29uZmlnUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGVja2VkPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZ2V0Q29uZmlnSWNvbihwcm9wZXJ0eTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCk6IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlKSB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAncGxhbic6IHJldHVybiBDb2RpY29uLmNoZWNrbGlzdDtcblx0XHRcdGNhc2UgJ2F1dG9waWxvdCc6IHJldHVybiBDb2RpY29uLnJvY2tldDtcblx0XHRcdGNhc2UgJ2ludGVyYWN0aXZlJzogcmV0dXJuIENvZGljb24uY29tbWVudDtcblx0XHR9XG5cdH1cblx0aWYgKHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0aWYgKHZhbHVlID09PSAnYXV0b3BpbG90Jykge1xuXHRcdFx0cmV0dXJuIENvZGljb24ucm9ja2V0O1xuXHRcdH1cblx0XHRpZiAodmFsdWUgPT09ICdhdXRvQXBwcm92ZScpIHtcblx0XHRcdHJldHVybiBDb2RpY29uLndhcm5pbmc7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSA9PT0gJ2Fzc2lzdGVkJykge1xuXHRcdFx0cmV0dXJuIENvZGljb24uc3BhcmtsZTtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGljb24uc2hpZWxkO1xuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAnZGVmYXVsdCc6IHJldHVybiBDb2RpY29uLnNoaWVsZDtcblx0XHRcdGNhc2UgJ2FjY2VwdEVkaXRzJzogcmV0dXJuIENvZGljb24uZWRpdDtcblx0XHRcdGNhc2UgJ3BsYW4nOiByZXR1cm4gQ29kaWNvbi5saWdodGJ1bGI7XG5cdFx0XHRjYXNlICdhdXRvJzogcmV0dXJuIENvZGljb24uc3BhcmtsZTtcblx0XHRcdGNhc2UgJ2J5cGFzc1Blcm1pc3Npb25zJzogcmV0dXJuIENvZGljb24ud2FybmluZztcblx0XHR9XG5cdH1cblx0aWYgKHByb3BlcnR5ID09PSBDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXQgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgJ2RlZmF1bHQnOiByZXR1cm4gQ29kaWNvbi5zaGllbGQ7XG5cdFx0XHRjYXNlICdhdXRvLXJldmlldyc6IHJldHVybiBDb2RpY29uLnNwYXJrbGU7XG5cdFx0XHRjYXNlICdmdWxsLWFjY2Vzcyc6IHJldHVybiBDb2RpY29uLndhcm5pbmc7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRvQWN0aW9uSXRlbXMocHJvcGVydHk6IHN0cmluZywgaXRlbXM6IHJlYWRvbmx5IElDb25maWdQaWNrZXJJdGVtW10sIGN1cnJlbnRWYWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgcG9saWN5UmVzdHJpY3RlZCA9IGZhbHNlKTogSUFjdGlvbkxpc3RJdGVtPElDb25maWdQaWNrZXJJdGVtPltdIHtcblx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRjb25zdCBkaXNhYmxlZCA9IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmIGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQoaXRlbS52YWx1ZSwgcG9saWN5UmVzdHJpY3RlZCk7XG5cdFx0Y29uc3QgaG92ZXIgPSBnZXRDb25maWdQaWNrZXJJdGVtSG92ZXIocHJvcGVydHksIGl0ZW0sIGRpc2FibGVkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZGV0YWlsOiBkaXNhYmxlZCA/IGhvdmVyIDogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogZ2V0Q29uZmlnSWNvbihwcm9wZXJ0eSwgaXRlbS52YWx1ZSkgfSxcblx0XHRcdGRpc2FibGVkLFxuXHRcdFx0Li4uKGhvdmVyID8geyBob3ZlcjogeyBjb250ZW50OiBob3ZlciB9IH0gOiB7fSksXG5cdFx0XHRpdGVtOiB7IC4uLml0ZW0sIGNoZWNrZWQ6IGlzU2VsZWN0ZWRWYWx1ZShjdXJyZW50VmFsdWUsIGl0ZW0udmFsdWUpIH0sXG5cdFx0fTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGlzU2VsZWN0ZWRWYWx1ZShjdXJyZW50VmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQsIGl0ZW1WYWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgY3VycmVudFZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4gY3VycmVudFZhbHVlID09PSAoaXRlbVZhbHVlID09PSAndHJ1ZScpO1xuXHR9XG5cdHJldHVybiBpdGVtVmFsdWUgPT09IGN1cnJlbnRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0QXV0b0FwcHJvdmVIb3Zlcih2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgZmFsbGJhY2s6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdHN3aXRjaCAodmFsdWUpIHtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmRlZmF1bHRBcHByb3ZhbHNIb3ZlcicsIFwiQ29waWxvdCBhc2tzIGJlZm9yZSBydW5uaW5nIHRvb2xzIHVubGVzcyB5b3VyIGNvbmZpZ3VyZWQgc2V0dGluZ3MgYWxsb3cgdGhlIHRvb2wuXCIpO1xuXHRcdGNhc2UgQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmFzc2lzdGVkQXBwcm92YWxzSG92ZXInLCBcIkFuIExMTSBqdWRnZSBldmFsdWF0ZXMgZWFjaCB0b29sIGNhbGwuIFRvb2xzIGl0IGRvZXNuJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuXCIpO1xuXHRcdGNhc2UgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZTpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmF1dG9BcHByb3ZlSG92ZXInLCBcIkNvcGlsb3QgcnVucyBhbGwgdG9vbHMgd2l0aG91dCBhc2tpbmcgZm9yIGFwcHJvdmFsLlwiKTtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90OlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYXV0b3BpbG90QXBwcm92YWxzSG92ZXInLCBcIkNvcGlsb3QgcnVucyB0b29scyB3aXRob3V0IGFza2luZyBmb3IgYXBwcm92YWwgYW5kIGNvbnRpbnVlcyB1bnRpbCB0aGUgdGFzayBpcyBkb25lLlwiKTtcblx0fVxuXHRyZXR1cm4gZmFsbGJhY2sgPz8gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5hcHByb3ZhbHNIb3ZlcicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgYWdlbnQgYXNrcyBiZWZvcmUgcnVubmluZyB0b29scyBpbiB0aGlzIHNlc3Npb24uXCIpO1xufVxuXG5mdW5jdGlvbiBnZXRFbnVtVmFsdWVEZXNjcmlwdGlvbihzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSwgdmFsdWU6IHVua25vd24gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdHJldHVybiBpbmRleCA+PSAwID8gc2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0gOiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWdQaWNrZXJUcmlnZ2VySG92ZXIocHJvcGVydHk6IHN0cmluZywgc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHZhbHVlOiB1bmtub3duIHwgdW5kZWZpbmVkLCBpc1JlYWRPbmx5OiBib29sZWFuKTogc3RyaW5nIHtcblx0aWYgKHByb3BlcnR5ID09PSBDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXQpIHtcblx0XHRyZXR1cm4gZ2V0RW51bVZhbHVlRGVzY3JpcHRpb24oc2NoZW1hLCB2YWx1ZSkgPz8gc2NoZW1hLmRlc2NyaXB0aW9uID8/IHNjaGVtYS50aXRsZTtcblx0fVxuXHRpZiAocHJvcGVydHkgIT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRyZXR1cm4gc2NoZW1hLmRlc2NyaXB0aW9uID8/IHNjaGVtYS50aXRsZTtcblx0fVxuXG5cdGNvbnN0IGhvdmVyID0gZ2V0QXV0b0FwcHJvdmVIb3Zlcih2YWx1ZSwgZ2V0RW51bVZhbHVlRGVzY3JpcHRpb24oc2NoZW1hLCB2YWx1ZSkpO1xuXHRpZiAoaXNSZWFkT25seSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmFwcHJvdmFsc0xldmVsSG92ZXJSZWFkT25seScsIFwiezB9IFJlYWQtb25seS5cIiwgaG92ZXIpO1xuXHR9XG5cdHJldHVybiBob3Zlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZ1BpY2tlckl0ZW1Ib3Zlcihwcm9wZXJ0eTogc3RyaW5nLCBpdGVtOiBJQ29uZmlnUGlja2VySXRlbSwgZGlzYWJsZWQ6IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoZGlzYWJsZWQpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5wb2xpY3lEaXNhYmxlZEhvdmVyJywgXCJEaXNhYmxlZCBieSB5b3VyIG9yZ2FuaXphdGlvbi4gQ29udGFjdCB5b3VyIGFkbWluaXN0cmF0b3IuXCIpO1xuXHR9XG5cdGlmIChwcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkge1xuXHRcdHJldHVybiBnZXRBdXRvQXBwcm92ZUhvdmVyKGl0ZW0udmFsdWUsIGl0ZW0uZGVzY3JpcHRpb24pO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFBlcm1pc3Npb25zTGVhcm5Nb3JlVXJsKHByb3BlcnR5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAocHJvcGVydHkgPT09IENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldCkge1xuXHRcdHJldHVybiBDT0RFWF9BUFBST1ZBTFNfTEVBUk5fTU9SRV9VUkw7XG5cdH1cblx0aWYgKHByb3BlcnR5ID09PSBDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25Nb2RlIHx8IHByb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0cmV0dXJuIFBFUk1JU1NJT05TX0xFQVJOX01PUkVfVVJMO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25maWdQaWNrZXJMaXN0T3B0aW9ucyhwcm9wZXJ0eTogc3RyaW5nKTogSUFjdGlvbkxpc3RPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChwcm9wZXJ0eSkge1xuXHRcdGNhc2UgU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlOlxuXHRcdFx0cmV0dXJuIHsgbWluV2lkdGg6IDI2MCB9O1xuXHRcdGNhc2UgU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZTpcblx0XHRcdHJldHVybiB7IG1pbldpZHRoOiAyNTUgfTtcblx0XHRjYXNlIENvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldDpcblx0XHRcdHJldHVybiBnZXRDb2RleEFwcHJvdmFsc1BpY2tlckxpc3RPcHRpb25zKCk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyUGlja2VyVHJpZ2dlcihzbG90OiBIVE1MRWxlbWVudCwgZGlzYWJsZWQ6IGJvb2xlYW4sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG9uT3BlbjogKCkgPT4gdm9pZCk6IEhUTUxFbGVtZW50IHtcblx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZGlzYWJsZWQgPyBkb20uJCgnc3Bhbi5hY3Rpb24tbGFiZWwnKSA6IGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0aWYgKGRpc2FibGVkKSB7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtcmVhZG9ubHknLCAndHJ1ZScpO1xuXHR9IGVsc2Uge1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2xpc3Rib3gnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0b25PcGVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdG9uT3BlbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXHRzbG90LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgZGlzYWJsZWQpO1xuXHRyZXR1cm4gdHJpZ2dlcjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCB3aGVuIGFuIGBhdXRvQXBwcm92ZWAgc2NoZW1hIHVzZXMgdGhlIHdlbGwta25vd24gc2hhcGUgdGhlXG4gKiBkZWRpY2F0ZWQgQXV0by1BcHByb3ZlIHBpY2tlciB1bmRlcnN0YW5kczogYSBzdHJpbmcgZW51bSB0aGF0IGluY2x1ZGVzXG4gKiBgZGVmYXVsdGAgYW5kIG9ubHkgY29udGFpbnMgdmFsdWVzIGZyb20ge0BsaW5rIEtOT1dOX0FVVE9fQVBQUk9WRV9WQUxVRVN9LlxuICpcbiAqIEFnZW50cyB0aGF0IGFkdmVydGlzZSBhIGN1c3RvbSBhdXRvLWFwcHJvdmUgc2hhcGUgKGUuZy4gQ2xhdWRlKSBmYWxsXG4gKiB0aHJvdWdoIHRvIHRoZSBnZW5lcmljIHBlci1wcm9wZXJ0eSBwaWNrZXIgbGFuZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzV2VsbEtub3duQXV0b0FwcHJvdmVTY2hlbWEoc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpOiBib29sZWFuIHtcblx0aWYgKHNjaGVtYS50eXBlICE9PSAnc3RyaW5nJyB8fCAhQXJyYXkuaXNBcnJheShzY2hlbWEuZW51bSkgfHwgc2NoZW1hLmVudW0ubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghc2NoZW1hLmVudW0uaW5jbHVkZXMoJ2RlZmF1bHQnKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gc2NoZW1hLmVudW0uZXZlcnkodmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBLTk9XTl9BVVRPX0FQUFJPVkVfVkFMVUVTLmhhcyh2YWx1ZSkpO1xufVxuXG4vKipcbiAqIFRoZSBzZXQgb2Ygd2VsbC1rbm93biBzZXNzaW9uLWNvbmZpZyBwcm9wZXJ0eSBuYW1lcyB0aGF0IGFyZSBlaXRoZXIgaGFuZGxlZFxuICogYnkgZGVkaWNhdGVkIFVJIG9yIGludGVudGlvbmFsbHkgaGlkZGVuIGZyb20gdGhlIHdvcmtiZW5jaCBjaGF0LWlucHV0IGNoaXBcbiAqIGxhbmUuIFRoZSBnZW5lcmljLWZhbGxiYWNrIGNoaXAgbGFuZSBmaWx0ZXJzIHRoZXNlIG91dCBzbyB1bmtub3duIHByb3BlcnRpZXNcbiAqIGFkdmVydGlzZWQgYnkgYW4gYWdlbnQgZ2V0IHRoZWlyIG93biBjaGlwLlxuICpcbiAqIGBQZXJtaXNzaW9uc2AgaGFzIG5vIGNoaXAgXHUyMDE0IGl0IGlzIHN1cmZhY2VkIHRocm91Z2ggb3RoZXIgVUkgXHUyMDE0IGJ1dCBpc1xuICogaW5jbHVkZWQgc28gdGhlIGdlbmVyaWMgbGFuZSBkb2VzIG5vdCBpbnZlbnQgYSBjaGlwIGZvciBpdC5cbiAqXG4gKiBgV29ya3RyZWVCcmFuY2hQcmVmaXhgIGxpa2V3aXNlIGhhcyBubyBjaGlwOiBpdCBpcyBhIGNhcnJpZXIgdmFsdWUgc2VlZGVkIGJ5XG4gKiB0aGUgY2xpZW50IChmcm9tIGBnaXQuYnJhbmNoUHJlZml4YCkgYW5kIGNvbnN1bWVkIGJ5IHRoZSBhZ2VudCBmb3Igd29ya3RyZWVcbiAqIGlzb2xhdGlvbiwgbmV2ZXIgZWRpdGVkIGJ5IHRoZSB1c2VyLiBJbmNsdWRpbmcgaXQgaGVyZSBrZWVwcyB0aGUgZ2VuZXJpYyBsYW5lXG4gKiBmcm9tIHN1cmZhY2luZyBpdCBhcyBhIGNoaXAgaW4gdGhlIGNoYXQgaW5wdXQuXG4gKi9cbmV4cG9ydCBjb25zdCBXRUxMX0tOT1dOX1BJQ0tFUl9QUk9QRVJUSUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KFtcblx0U2Vzc2lvbkNvbmZpZ0tleS5Nb2RlLFxuXHRTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlLFxuXHRTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbixcblx0U2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2gsXG5cdFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnMsXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXgsXG5cdFNlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFjayxcblx0U2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlcyxcblx0Q2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZSxcblx0Q29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0LFxuXSk7XG5cbi8qKlxuICogV2hldGhlciB0aGUgZ2l2ZW4gYChwcm9wZXJ0eSwgc2NoZW1hKWAgcGFpciBpcyBoYW5kbGVkIG91dHNpZGUgdGhlXG4gKiBnZW5lcmljLWZhbGxiYWNrIGNoaXAgbGFuZS4gVGhpcyBpbmNsdWRlcyBwcm9wZXJ0aWVzIHJlbmRlcmVkIGJ5IGRlZGljYXRlZFxuICogY2hpcCB3aWRnZXRzIGFuZCBwcm9wZXJ0aWVzIGludGVudGlvbmFsbHkgaGlkZGVuIGZyb20gd29ya2JlbmNoIGNoYXQuXG4gKlxuICogRm9yIG1vc3Qgd2VsbC1rbm93biBrZXlzIHRoaXMgaXMgcHVyZWx5IGEgcHJvcGVydHktbmFtZSBjaGVjay4gQXV0b0FwcHJvdmUgaXNcbiAqIHNwZWNpYWw6IG9ubHkgd2VsbC1rbm93biBzY2hlbWEgc2hhcGVzIGFyZSBjbGFpbWVkIGJ5IHRoZSBkZWRpY2F0ZWQgcGlja2VyO1xuICogbm9uLWNvbmZvcm1pbmcgc2NoZW1hcyAoZS5nLiBDbGF1ZGUncyBhcHByb3ZhbCBtb2RlKSBmYWxsIHRocm91Z2ggdG8gdGhlXG4gKiBnZW5lcmljIGxhbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NsYWltZWRCeURlZGljYXRlZFBpY2tlcihwcm9wZXJ0eTogc3RyaW5nLCBzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk6IGJvb2xlYW4ge1xuXHRpZiAocHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRyZXR1cm4gaXNXZWxsS25vd25BdXRvQXBwcm92ZVNjaGVtYShzY2hlbWEpO1xuXHR9XG5cdHJldHVybiBXRUxMX0tOT1dOX1BJQ0tFUl9QUk9QRVJUSUVTLmhhcyhwcm9wZXJ0eSk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgd2hpY2ggY29uZmlnIHZhbHVlIGEgY2hhdC1pbnB1dCBjaGlwIHNob3VsZCBkaXNwbGF5LCBnaXZlbiB0aGVcbiAqIHNlcnZlcidzIHNlc3Npb24tc3RhdGUgdmFsdWUgYW5kIHRoZSB3b3JrYmVuY2ggb3ZlcmxheSB2YWx1ZS5cbiAqXG4gKiBQcmVjZWRlbmNlIGRlcGVuZHMgb24gdGhlIHNlc3Npb24gbGlmZWN5Y2xlOlxuICogIC0gVW50aXRsZWQgKHByZS1zZW5kKTogdGhlIHdvcmtiZW5jaCBvdmVybGF5IGlzIGF1dGhvcml0YXRpdmUgXHUyMDE0IGl0IHJlZmxlY3RzXG4gKiAgICBzeW5jaHJvbm91cyBjaGlwIGVkaXRzIGJlZm9yZSB0aGUgcHJvdmlzaW9uYWwgYmFja2VuZCBlY2hvZXMgdGhlbSwgc28gaXRcbiAqICAgIHdpbnMgb3ZlciBzZXJ2ZXIgc3RhdGUuXG4gKiAgLSBSdW5uaW5nICh0aXRsZWQpOiB0aGUgKnNlcnZlciogaXMgYXV0aG9yaXRhdGl2ZS4gVGhlIG92ZXJsYXkgaXMgb25seVxuICogICAgcmVmcmVzaGVkIG9uIG1hbnVhbCBjaGlwIGVkaXRzLCBzbyBzZXJ2ZXItZHJpdmVuIGNoYW5nZXMgKGUuZy4gUGxhbiBcdTIxOTJcbiAqICAgIEF1dG9waWxvdCB3aGVuIHRoZSB1c2VyIGFwcHJvdmVzIGEgcGxhbikgbXVzdCB3aW4sIG90aGVyd2lzZSBhIHN0YWxlXG4gKiAgICBvdmVybGF5IHZhbHVlIHdvdWxkIHNoYWRvdyB0aGVtLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvbmZpZ0NoaXBWYWx1ZShpc1VudGl0bGVkOiBib29sZWFuLCBzZXJ2ZXJWYWx1ZTogdW5rbm93biwgb3ZlcmxheVZhbHVlOiB1bmtub3duLCBzY2hlbWFEZWZhdWx0OiB1bmtub3duKTogdW5rbm93biB7XG5cdGNvbnN0IHByZWZlcnJlZCA9IGlzVW50aXRsZWRcblx0XHQ/IChvdmVybGF5VmFsdWUgPz8gc2VydmVyVmFsdWUpXG5cdFx0OiAoc2VydmVyVmFsdWUgPz8gb3ZlcmxheVZhbHVlKTtcblx0cmV0dXJuIHByZWZlcnJlZCA/PyBzY2hlbWFEZWZhdWx0O1xufVxuXG4vKipcbiAqIE9uZSB3b3JrYmVuY2ggY2hhdC1pbnB1dCBjaGlwIGJvdW5kIHRvIGEgc2luZ2xlIGFnZW50LWhvc3Qgc2Vzc2lvbi1jb25maWdcbiAqIHByb3BlcnR5LiBVc2VkIGJvdGggZm9yIGRlZGljYXRlZCB3ZWxsLWtub3duIHByb3BlcnR5IGNoaXBzXG4gKiAoYFNlc3Npb25Db25maWdLZXkuTW9kZWAsIGAuQXV0b0FwcHJvdmVgKSBhbmQgZm9yIGdlbmVyaWMgcGVyLXByb3BlcnR5IGNoaXBzXG4gKiBhZHZlcnRpc2VkIGJ5IGFuIGFnZW50J3MgY29uZmlnIHNjaGVtYSBidXQgbm90IGtub3duIHRvIFZTIENvZGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbml0aWFsUmVzb2x2ZWQ6IHsgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7IHJlYWRvbmx5IHJlc3VsdDogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbFJlc29sdmVDdHMgPSB0aGlzLl9yZWdpc3RlckluaXRpYWxSZXNvbHZlQ3RzKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsdGVyRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJQ29uZmlnUGlja2VySXRlbT5bXT4oMjAwKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YlJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZSAmIHsgcmVhZG9ubHkgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPjsgcmVhZG9ubHkgYmFja2VuZFNlc3Npb246IFVSSSB9PigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IElDaGF0V2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3BlcnR5OiBzdHJpbmcsXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nRGlyZWN0b3J5UmVzb2x2ZXI6IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm92aXNpb25hbDogSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uZXdTZXNzaW9uRm9sZGVyU2VydmljZTogSUFnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVhdHRhY2goKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvdmlzaW9uYWwub25EaWRDaGFuZ2UoKHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKGN1cnJlbnQgJiYgY3VycmVudC50b1N0cmluZygpID09PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLl9yZWF0dGFjaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWF0dGFjaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJJbml0aWFsUmVzb2x2ZUN0cygpOiBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY2FuY2VsSW5pdGlhbFJlc29sdmUoKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGN0cyk7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtaG9zdC1jaGF0LWlucHV0LXBpY2tlci1ob3N0Jyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoYGFnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC0ke3RoaXMuX3Byb3BlcnR5fWApO1xuXHRcdHRoaXMuX3JlbmRlckNoaXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYXR0YWNoKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBwcm92aXNpb25hbEJhY2tlbmQgPSBzZXNzaW9uUmVzb3VyY2UgPyB0aGlzLl9wcm92aXNpb25hbC5nZXQoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHByb3Zpc2lvbmFsQmFja2VuZFxuXHRcdFx0Pz8gKHNlc3Npb25SZXNvdXJjZSA/IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSB8fCAhYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3N1YlJlZi5jbGVhcigpO1xuXHRcdFx0dGhpcy5faW5pdGlhbFJlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY2FuY2VsSW5pdGlhbFJlc29sdmUoKTtcblx0XHRcdHRoaXMuX3JlbmRlckNoaXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgJiYgIXByb3Zpc2lvbmFsQmFja2VuZCkge1xuXHRcdFx0dGhpcy5fc3ViUmVmLmNsZWFyKCk7XG5cdFx0XHRpZiAoIXRoaXMuX2luaXRpYWxSZXNvbHZlZCB8fCB0aGlzLl9pbml0aWFsUmVzb2x2ZWQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgIT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoSW5pdGlhbFJlc29sdmVkKHNlc3Npb25SZXNvdXJjZSwgYmFja2VuZFNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRWFnZXJseSBjcmVhdGUgYSBwcm92aXNpb25hbCBiYWNrZW5kIHNlc3Npb24gc28gZXZlbiB1c2Vyc1xuXHRcdFx0Ly8gd2hvIG5ldmVyIHRvdWNoIGEgY2hpcCBzdGlsbCBnZXQgdGhlaXIgcGlja2VyIGRlZmF1bHRzXG5cdFx0XHQvLyAoZS5nLiBgaXNvbGF0aW9uOiAnd29ya3RyZWUnYCkgZmxvd2VkIHRocm91Z2ggdG8gdGhlIGFnZW50XG5cdFx0XHQvLyBhdCBtYXRlcmlhbGl6YXRpb24gdGltZS4gV2l0aG91dCB0aGlzLCBzZW5kaW5nIHRoZSB2ZXJ5XG5cdFx0XHQvLyBmaXJzdCBtZXNzYWdlIGdvZXMgdGhyb3VnaCB0aGUgaGFuZGxlcidzIHN0YW5kYXJkXG5cdFx0XHQvLyBgX2NyZWF0ZUFuZFN1YnNjcmliZWAgcGF0aCB3aXRoIG5vIGBzZXNzaW9uQ29uZmlnYC5cblx0XHRcdC8vXG5cdFx0XHQvLyBJZGVtcG90ZW50ICsgc2VyaWFsaXNlZCBpbnNpZGUgdGhlIHNlcnZpY2UsIHNvIGVhY2ggY2hpcFxuXHRcdFx0Ly8gaW5zdGFuY2UgcmFjaW5nIGludG8gdGhpcyBicmFuY2ggcHJvZHVjZXMgZXhhY3RseSBvbmVcblx0XHRcdC8vIHByb3Zpc2lvbmFsLiBPbmNlIGl0IHJlc29sdmVzLCB0aGUgc2VydmljZSBmaXJlc1xuXHRcdFx0Ly8gYG9uRGlkQ2hhbmdlYCBhbmQgd2UgcmUtYXR0YWNoIGludG8gdGhlIHN1YnNjcmlwdGlvbiBwYXRoLlxuXHRcdFx0dm9pZCB0aGlzLl9wcm92aXNpb25hbC5nZXRPckNyZWF0ZShcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRiYWNrZW5kU2Vzc2lvbi5zY2hlbWUsXG5cdFx0XHRcdHRoaXMuX3JlYWRXb3JraW5nRGlyZWN0b3J5KCksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcmVuZGVyQ2hpcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jYW5jZWxJbml0aWFsUmVzb2x2ZSgpO1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBiYWNrZW5kU2Vzc2lvbiwgJ0FnZW50SG9zdENoYXRJbnB1dFBpY2tlcicpO1xuXHRcdGNvbnN0IHN1YiA9IHJlZi5vYmplY3Q7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBzdWIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fcmVuZGVyQ2hpcCgpKTtcblx0XHR0aGlzLl9zdWJSZWYudmFsdWUgPSB7XG5cdFx0XHRzdWIsXG5cdFx0XHRiYWNrZW5kU2Vzc2lvbixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgbGlzdGVuZXIuZGlzcG9zZSgpOyByZWYuZGlzcG9zZSgpOyB9LFxuXHRcdH07XG5cdFx0dGhpcy5fcmVuZGVyQ2hpcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsSW5pdGlhbFJlc29sdmUoKTogdm9pZCB7XG5cdFx0Ly8gQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuZGlzcG9zZSgpIGRvZXMgbm90IGNhbmNlbCBieSBkZWZhdWx0LCBzbyB3ZVxuXHRcdC8vIG11c3QgZXhwbGljaXRseSBjYW5jZWwgYmVmb3JlIGNsZWFyaW5nL3JlcGxhY2luZyB0byBlbnN1cmUgYW55XG5cdFx0Ly8gaW4tZmxpZ2h0IHJlc29sdmVTZXNzaW9uQ29uZmlnIGNhbGwgY2Fubm90IHN0aWxsIHdyaXRlIGJhY2sgaW50b1xuXHRcdC8vIGBfaW5pdGlhbFJlc29sdmVkYCBhZnRlciB0aGUgc2Vzc2lvbiBoYXMgbW92ZWQgb24uXG5cdFx0dGhpcy5faW5pdGlhbFJlc29sdmVDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlQ3RzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoSW5pdGlhbFJlc29sdmVkKHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faW5pdGlhbFJlc29sdmVDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlQ3RzLnZhbHVlID0gY3RzO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJlc29sdmVTZXNzaW9uQ29uZmlnKHtcblx0XHRcdFx0cHJvdmlkZXI6IGJhY2tlbmRTZXNzaW9uLnNjaGVtZSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy5fcmVhZFdvcmtpbmdEaXJlY3RvcnkoKSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCkgIT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luaXRpYWxSZXNvbHZlZCA9IHsgc2Vzc2lvblJlc291cmNlLCByZXN1bHQgfTtcblx0XHRcdHRoaXMuX3JlbmRlckNoaXAoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEJlc3QtZWZmb3J0LlxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNoaXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIgfHwgdGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3JlYWRDb250ZXh0KCk7XG5cdFx0Ly8gRm9yIHNlc3Npb25zIHRoYXQgaGF2ZSBhbHJlYWR5IHN0YXJ0ZWQgKGkuZS4gbm8gbG9uZ2VyIHVudGl0bGVkIFx1MjAxNFxuXHRcdC8vIHRoZSBmaXJzdCBtZXNzYWdlIHdhcyBzZW50IGFuZCB0aGUgY2hhdCBzZXNzaW9uIGhhcyBiZWVuXG5cdFx0Ly8gbWF0ZXJpYWxpemVkKSwgaGlkZSB0aGUgcGlja2VyIGVudGlyZWx5IHdoZW4gdGhlIHByb3BlcnR5IGNhbm5vdFxuXHRcdC8vIGJlIGNoYW5nZWQgcG9zdC1jcmVhdGlvbi4gV2hpbGUgdGhlIHNlc3Npb24gaXMgc3RpbGwgdW50aXRsZWQgdGhlXG5cdFx0Ly8gdXNlciBpcyBpbiB0aGUgcHJlLXNlbmQgY29uZmlndXJhdGlvbiBwaGFzZSBhbmQgbXVzdCBiZSBhYmxlIHRvXG5cdFx0Ly8gYWRqdXN0IGNyZWF0aW9uLXRpbWUtb25seSBwcm9wZXJ0aWVzIChlLmcuIGlzb2xhdGlvbiwgYnJhbmNoKS5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgaXNTdGFydGVkU2Vzc2lvbiA9ICEhc2Vzc2lvblJlc291cmNlICYmICFpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWN0eCB8fCAoaXNTdGFydGVkU2Vzc2lvbiAmJiBjdHguc2NoZW1hLnNlc3Npb25NdXRhYmxlID09PSBmYWxzZSkpIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC1oaWRkZW4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIGRlZGljYXRlZCBBdXRvQXBwcm92ZSBjaGlwIG9ubHkgaGFuZGxlcyB0aGUgd2VsbC1rbm93biBzY2hlbWFcblx0XHQvLyBzaGFwZSAoZGVmYXVsdC9hdXRvQXBwcm92ZS9hdXRvcGlsb3QpLiBXaGVuIGFuIGFnZW50IGFkdmVydGlzZXMgYVxuXHRcdC8vIGN1c3RvbSBBdXRvQXBwcm92ZSBzY2hlbWEgKGUuZy4gQ2xhdWRlJ3MgYXBwcm92YWwgbW9kZXMpLCBsZXQgdGhlXG5cdFx0Ly8gZ2VuZXJpYy1mYWxsYmFjayBjaGlwIGxhbmUgcmVuZGVyIGl0IGluc3RlYWQuXG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmICFpc1dlbGxLbm93bkF1dG9BcHByb3ZlU2NoZW1hKGN0eC5zY2hlbWEpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhZ2VudC1ob3N0LWNoYXQtaW5wdXQtcGlja2VyLWhvc3QtaGlkZGVuJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2FnZW50LWhvc3QtY2hhdC1pbnB1dC1waWNrZXItaG9zdC1oaWRkZW4nKTtcblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5hZ2VudC1ob3N0LWNoYXQtaW5wdXQtcGlja2VyLXNsb3QnKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gc2xvdC5yZW1vdmUoKSB9KTtcblxuXHRcdGNvbnN0IGlzUmVhZE9ubHkgPSAhIWN0eC5zY2hlbWEucmVhZE9ubHkgfHwgKGlzU3RhcnRlZFNlc3Npb24gJiYgY3R4LnNjaGVtYS5zZXNzaW9uTXV0YWJsZSA9PT0gZmFsc2UpO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSByZW5kZXJQaWNrZXJUcmlnZ2VyKHNsb3QsIGlzUmVhZE9ubHksIHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLCAoKSA9PiB0aGlzLl9zaG93UGlja2VyKHRyaWdnZXIpKTtcblx0XHRjb25zdCB0b29sdGlwID0gZ2V0Q29uZmlnUGlja2VyVHJpZ2dlckhvdmVyKHRoaXMuX3Byb3BlcnR5LCBjdHguc2NoZW1hLCBjdHgudmFsdWUsIGlzUmVhZE9ubHkpO1xuXHRcdGlmICh0b29sdGlwKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRyaWdnZXIsIHsgY29udGVudDogdG9vbHRpcCB9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlclRyaWdnZXIodHJpZ2dlciwgY3R4LnNjaGVtYSwgY3R4LnZhbHVlLCBpc1JlYWRPbmx5KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclRyaWdnZXIodHJpZ2dlcjogSFRNTEVsZW1lbnQsIHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCwgaXNSZWFkT25seTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodHJpZ2dlcik7XG5cblx0XHRjb25zdCBpY29uID0gZ2V0Q29uZmlnSWNvbih0aGlzLl9wcm9wZXJ0eSwgdmFsdWUpO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24oaWNvbikpO1xuXHRcdH1cblx0XHQvLyBNaXJyb3IgdGhlIHNlc3Npb25zLXNpZGUgcGlja2VyOiBlbGV2YXRlZCBhcHByb3ZhbCBsZXZlbHMgZ2V0IHRoZW1lZCBjb2xvcnMuXG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0XHR0cmlnZ2VyLmNsYXNzTGlzdC50b2dnbGUoJ3dhcm5pbmcnLCB2YWx1ZSA9PT0gJ2F1dG9waWxvdCcgfHwgdmFsdWUgPT09ICdhc3Npc3RlZCcpO1xuXHRcdFx0dHJpZ2dlci5jbGFzc0xpc3QudG9nZ2xlKCdpbmZvJywgdmFsdWUgPT09ICdhdXRvQXBwcm92ZScpO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2xhYmVsRm9yKHNjaGVtYSwgdmFsdWUpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodHJpZ2dlciwgZG9tLiQoJ3NwYW4uYWdlbnQtaG9zdC1jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGlzUmVhZE9ubHlcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci50cmlnZ2VyQXJpYVJlYWRPbmx5JywgXCJ7MH06IHsxfSwgUmVhZC1Pbmx5XCIsIHNjaGVtYS50aXRsZSwgbGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIudHJpZ2dlckFyaWEnLCBcInswfTogezF9XCIsIHNjaGVtYS50aXRsZSwgbGFiZWwpKTtcblx0fVxuXG5cdHByaXZhdGUgX2xhYmVsRm9yKHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB2YWx1ZSA9PT0gdHJ1ZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYm9vbGVhbi5vbkxhYmVsJywgXCJPblwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYm9vbGVhbi5vZmZMYWJlbCcsIFwiT2ZmXCIpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBzY2hlbWEuZW51bT8uaW5kZXhPZih2YWx1ZSkgPz8gLTE7XG5cdFx0XHRyZXR1cm4gaW5kZXggPj0gMCA/IHNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IHZhbHVlIDogdmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBzY2hlbWEudGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ29udGV4dCgpOiB7IGJhY2tlbmRTZXNzaW9uOiBVUkk7IHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hOyB2YWx1ZTogdW5rbm93biB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N1YlJlZi52YWx1ZSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdWJSZWYudmFsdWUuc3ViLnZhbHVlO1xuXHRcdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcmVmZXIgdGhlIHdvcmtiZW5jaC1zaWRlIHJlLXJlc29sdmVkIGNvbmZpZyBzbyBkZXBlbmRlbnRcblx0XHRcdC8vIHByb3BlcnRpZXMgKGUuZy4gYnJhbmNoLnJlYWRPbmx5IHdoZW4gaXNvbGF0aW9uIGZsaXBzKSByZWZyZXNoXG5cdFx0XHQvLyB3aXRob3V0IHdhaXRpbmcgZm9yIGEgcHJvdG9jb2wtbGV2ZWwgc2NoZW1hLXVwZGF0ZSBjaGFubmVsLiBVc2Vcblx0XHRcdC8vIG92ZXJsYXkudmFsdWVzIHRvbzogYHZhbGlkYXRlT3JEZWZhdWx0YCBtYXkgY2xhbXAgc3RhbGUgdmFsdWVzXG5cdFx0XHQvLyBvciBpbmplY3QgZGVyaXZlZCBkZWZhdWx0cyB0aGUgY2hpcCBzaG91bGQgZGlzcGxheS5cblx0XHRcdGNvbnN0IG92ZXJsYXkgPSB0aGlzLl9wcm92aXNpb25hbC5nZXRSZXNvbHZlZENvbmZpZyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3Qgc2NoZW1hU291cmNlID0gb3ZlcmxheT8uc2NoZW1hID8/IHN0YXRlLmNvbmZpZz8uc2NoZW1hO1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gc2NoZW1hU291cmNlPy5wcm9wZXJ0aWVzW3RoaXMuX3Byb3BlcnR5XTtcblx0XHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXJ2ZXJWYWx1ZSA9IHN0YXRlLmNvbmZpZz8udmFsdWVzPy5bdGhpcy5fcHJvcGVydHldO1xuXHRcdFx0Y29uc3Qgb3ZlcmxheVZhbHVlID0gb3ZlcmxheT8udmFsdWVzPy5bdGhpcy5fcHJvcGVydHldO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXNvbHZlQ29uZmlnQ2hpcFZhbHVlKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpLCBzZXJ2ZXJWYWx1ZSwgb3ZlcmxheVZhbHVlLCBzY2hlbWEuZGVmYXVsdCk7XG5cdFx0XHRyZXR1cm4geyBiYWNrZW5kU2Vzc2lvbjogdGhpcy5fc3ViUmVmLnZhbHVlLmJhY2tlbmRTZXNzaW9uLCBzY2hlbWEsIHZhbHVlIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2luaXRpYWxSZXNvbHZlZCAmJiB0aGlzLl9pbml0aWFsUmVzb2x2ZWQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSB0aGlzLl9pbml0aWFsUmVzb2x2ZWQucmVzdWx0LnNjaGVtYS5wcm9wZXJ0aWVzW3RoaXMuX3Byb3BlcnR5XTtcblx0XHRcdGlmICghc2NoZW1hKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5faW5pdGlhbFJlc29sdmVkLnJlc3VsdC52YWx1ZXM/Llt0aGlzLl9wcm9wZXJ0eV0gPz8gc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRyZXR1cm4geyBiYWNrZW5kU2Vzc2lvbiwgc2NoZW1hLCB2YWx1ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93UGlja2VyKHRyaWdnZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX3JlYWRDb250ZXh0KCk7XG5cdFx0aWYgKCFjdHggfHwgY3R4LnNjaGVtYS5yZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fZ2V0SXRlbXMoY3R4LnNjaGVtYSk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBjdHgudmFsdWU7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhY3Rpb25JdGVtcyA9IHRvQWN0aW9uSXRlbXModGhpcy5fcHJvcGVydHksIGl0ZW1zLCBjdXJyZW50VmFsdWUsIHBvbGljeVJlc3RyaWN0ZWQpO1xuXHRcdGNvbnN0IHBlcm1pc3Npb25zTGVhcm5Nb3JlVXJsID0gZ2V0UGVybWlzc2lvbnNMZWFybk1vcmVVcmwodGhpcy5fcHJvcGVydHkpO1xuXHRcdGlmIChwZXJtaXNzaW9uc0xlYXJuTW9yZVVybCkge1xuXHRcdFx0Y29uc3QgbGVhcm5Nb3JlTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmxlYXJuTW9yZVBlcm1pc3Npb25zJywgXCJMZWFybiBtb3JlIGFib3V0IHBlcm1pc3Npb25zXCIpO1xuXHRcdFx0YWN0aW9uSXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsXG5cdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdH0pO1xuXHRcdFx0YWN0aW9uSXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiBsZWFybk1vcmVMYWJlbCxcblx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLmJsYW5rIH0sXG5cdFx0XHRcdGl0ZW06IHsgdmFsdWU6IExFQVJOX01PUkVfVkFMVUUsIGxhYmVsOiBsZWFybk1vcmVMYWJlbCB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8SUNvbmZpZ1BpY2tlckl0ZW0+ID0ge1xuXHRcdFx0b25TZWxlY3Q6IGl0ZW0gPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0aWYgKGl0ZW0udmFsdWUgPT09IExFQVJOX01PUkVfVkFMVUUpIHtcblx0XHRcdFx0XHRpZiAocGVybWlzc2lvbnNMZWFybk1vcmVVcmwpIHtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShwZXJtaXNzaW9uc0xlYXJuTW9yZVVybCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dm9pZCB0aGlzLl9jb25maXJtQW5kU2V0VmFsdWUoY3R4LmJhY2tlbmRTZXNzaW9uLCBpdGVtKTtcblx0XHRcdH0sXG5cdFx0XHRvbkZpbHRlcjogY3R4LnNjaGVtYS5lbnVtRHluYW1pY1xuXHRcdFx0XHQ/IHF1ZXJ5ID0+IHRoaXMuX2ZpbHRlckRlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmcmVzaGVkID0gdGhpcy5fcmVhZENvbnRleHQoKTtcblx0XHRcdFx0XHRpZiAoIXJlZnJlc2hlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdG9BY3Rpb25JdGVtcyh0aGlzLl9wcm9wZXJ0eSwgYXdhaXQgdGhpcy5fZ2V0SXRlbXMocmVmcmVzaGVkLnNjaGVtYSwgcXVlcnkpLCByZWZyZXNoZWQudmFsdWUsIGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB0cmlnZ2VyLmZvY3VzKCksXG5cdFx0fTtcblxuXHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2Uuc2hvdzxJQ29uZmlnUGlja2VySXRlbT4oXG5cdFx0XHRgYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLiR7dGhpcy5fcHJvcGVydHl9YCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0YWN0aW9uSXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRyaWdnZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRbXSxcblx0XHRcdHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiBpdGVtID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5hcmlhTGFiZWwnLCBcInswfSBQaWNrZXJcIiwgY3R4LnNjaGVtYS50aXRsZSksXG5cdFx0XHR9LFxuXHRcdFx0d2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbih7XG5cdFx0XHRcdC4uLmdldENvbmZpZ1BpY2tlckxpc3RPcHRpb25zKHRoaXMuX3Byb3BlcnR5KSxcblx0XHRcdFx0Li4uKGFjdGlvbkl0ZW1zLmxlbmd0aCA+IEZJTFRFUl9USFJFU0hPTEQgfHwgY3R4LnNjaGVtYS5lbnVtRHluYW1pY1xuXHRcdFx0XHRcdD8geyBzaG93RmlsdGVyOiB0cnVlLCBmaWx0ZXJQbGFjZWhvbGRlcjogbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5maWx0ZXInLCBcIkZpbHRlci4uLlwiKSB9XG5cdFx0XHRcdFx0OiB7fSksXG5cdFx0XHR9KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0SXRlbXMoc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIHF1ZXJ5Pzogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdPiB7XG5cdFx0aWYgKHNjaGVtYS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdHsgdmFsdWU6ICd0cnVlJywgbGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuYm9vbGVhbi50cnVlJywgXCJPblwiKSB9LFxuXHRcdFx0XHR7IHZhbHVlOiAnZmFsc2UnLCBsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5ib29sZWFuLmZhbHNlJywgXCJPZmZcIikgfSxcblx0XHRcdF07XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3N1YlJlZi52YWx1ZT8uYmFja2VuZFNlc3Npb25cblx0XHRcdD8/IChzZXNzaW9uUmVzb3VyY2UgPyB0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQpO1xuXHRcdGlmIChzY2hlbWEuZW51bUR5bmFtaWMgJiYgYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uuc2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zKHtcblx0XHRcdFx0XHRwcm92aWRlcjogYmFja2VuZFNlc3Npb24uc2NoZW1lLFxuXHRcdFx0XHRcdHByb3BlcnR5OiB0aGlzLl9wcm9wZXJ0eSxcblx0XHRcdFx0XHRxdWVyeSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB0aGlzLl9yZWFkV29ya2luZ0RpcmVjdG9yeSgpLFxuXHRcdFx0XHRcdGNvbmZpZzogdGhpcy5fcmVhZEN1cnJlbnRWYWx1ZXMoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9maWx0ZXJBdXRvQXBwcm92ZUl0ZW1zKHJlc3VsdC5pdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9mcm9tQ29tcGxldGlvbihpdGVtKSkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEZhbGwgdGhyb3VnaCB0byB0aGUgc3RhdGljIGVudW0gYmVsb3cuXG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJBdXRvQXBwcm92ZUl0ZW1zKChzY2hlbWEuZW51bSA/PyBbXSkubWFwKCh2YWx1ZSwgaW5kZXgpID0+ICh7XG5cdFx0XHR2YWx1ZTogU3RyaW5nKHZhbHVlKSxcblx0XHRcdGxhYmVsOiBzY2hlbWEuZW51bUxhYmVscz8uW2luZGV4XSA/PyBTdHJpbmcodmFsdWUpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNjaGVtYS5lbnVtRGVzY3JpcHRpb25zPy5baW5kZXhdLFxuXHRcdH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIF9maWx0ZXJBdXRvQXBwcm92ZUl0ZW1zKGl0ZW1zOiByZWFkb25seSBJQ29uZmlnUGlja2VySXRlbVtdKTogcmVhZG9ubHkgSUNvbmZpZ1BpY2tlckl0ZW1bXSB7XG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ICE9PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRyZXR1cm4gaXRlbXM7XG5cdFx0fVxuXHRcdGNvbnN0IGFzc2lzdGVkUGVybWlzc2lvbnNFbmFibGVkID0gaXNBc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpdGVtID0+IGlzUGVybWlzc2lvbkxldmVsVmlzaWJsZShpdGVtLnZhbHVlLCBhc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZnJvbUNvbXBsZXRpb24oaXRlbTogU2Vzc2lvbkNvbmZpZ1ZhbHVlSXRlbSk6IElDb25maWdQaWNrZXJJdGVtIHtcblx0XHRyZXR1cm4geyB2YWx1ZTogaXRlbS52YWx1ZSwgbGFiZWw6IGl0ZW0ubGFiZWwsIGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uIH07XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkV29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3ViUmVmLnZhbHVlPy5zdWIudmFsdWU7XG5cdFx0aWYgKHN0YXRlICYmICEoc3RhdGUgaW5zdGFuY2VvZiBFcnJvcikpIHtcblx0XHRcdGNvbnN0IGN3ZCA9IHN0YXRlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBjd2QgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGN3ZCkgOiBjd2Q7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRyZXR1cm4gKHNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl9uZXdTZXNzaW9uRm9sZGVyU2VydmljZS5nZXRGb2xkZXIoc2Vzc2lvblJlc291cmNlKSlcblx0XHRcdD8/IChzZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fd29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLnJlc29sdmUoc2Vzc2lvblJlc291cmNlKSlcblx0XHRcdD8/IHRoaXMuX25ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmdldERlZmF1bHRGb2xkZXIoKVxuXHRcdFx0Pz8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZEN1cnJlbnRWYWx1ZXMoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldC52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBvdmVybGF5ID0gc2Vzc2lvblJlc291cmNlID8gdGhpcy5fcHJvdmlzaW9uYWwuZ2V0UmVzb2x2ZWRDb25maWcoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N1YlJlZi52YWx1ZT8uc3ViLnZhbHVlO1xuXHRcdGlmIChzdGF0ZSAmJiAhKHN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHRyZXR1cm4geyAuLi4oc3RhdGUuY29uZmlnPy52YWx1ZXMgPz8ge30pLCAuLi4ob3ZlcmxheT8udmFsdWVzID8/IHt9KSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gb3ZlcmxheT8udmFsdWVzID8/IHRoaXMuX2luaXRpYWxSZXNvbHZlZD8ucmVzdWx0LnZhbHVlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlcyB0aGUgc2hhcmVkIGVsZXZhdGVkLWxldmVsIHdhcm5pbmcgYmVmb3JlIGFwcGx5aW5nIGFuIGFwcHJvdmFsXG5cdCAqIHBpY2suIFVua25vd24gbm9uLWRlZmF1bHQgdmFsdWVzIGZhbGwgYmFjayB0byB0aGUgQnlwYXNzIHdhcm5pbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb25maXJtQW5kU2V0VmFsdWUoYmFja2VuZFNlc3Npb246IFVSSSwgaXRlbTogSUNvbmZpZ1BpY2tlckl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZSA9IGl0ZW0udmFsdWU7XG5cdFx0aWYgKHRoaXMuX3Byb3BlcnR5ID09PSBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlICYmICFpc1Blcm1pc3Npb25MZXZlbFZpc2libGUodmFsdWUsIGlzQXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHJvcGVydHkgPT09IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpIHtcblx0XHRcdGNvbnN0IGxldmVsVG9Db25maXJtID0gaXNDaGF0UGVybWlzc2lvbkxldmVsKHZhbHVlKVxuXHRcdFx0XHQ/IHZhbHVlXG5cdFx0XHRcdDogKHZhbHVlICE9PSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgPyBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlIDogdW5kZWZpbmVkKTtcblx0XHRcdGlmIChsZXZlbFRvQ29uZmlybSkge1xuXHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCBtYXliZUNvbmZpcm1FbGV2YXRlZFBlcm1pc3Npb25MZXZlbChsZXZlbFRvQ29uZmlybSwgdGhpcy5fZGlhbG9nU2VydmljZSwgdGhpcy5fc3RvcmFnZVNlcnZpY2UsIHtcblx0XHRcdFx0XHRkZWZhdWx0U2V0dGluZ0tleTogQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdENvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdFx0bGV2ZWxMYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3NldFZhbHVlKGJhY2tlbmRTZXNzaW9uLCB2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZXRWYWx1ZShiYWNrZW5kU2Vzc2lvbjogVVJJLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3R4ID0gdGhpcy5fcmVhZENvbnRleHQoKTtcblx0XHRjb25zdCBub3JtYWxpemVkVmFsdWUgPSBjdHg/LnNjaGVtYS50eXBlID09PSAnYm9vbGVhbidcblx0XHRcdD8gdmFsdWUgPT09ICd0cnVlJ1xuXHRcdFx0OiBub3JtYWxpemVTZXNzaW9uQ29uZmlnVmFsdWUodGhpcy5fcHJvcGVydHksIHZhbHVlLCBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHBhcnRpYWwgPSB7IFt0aGlzLl9wcm9wZXJ0eV06IG5vcm1hbGl6ZWRWYWx1ZSB9O1xuXHRcdGNvbnN0IG5leHRDb25maWcgPSB7IC4uLih0aGlzLl9yZWFkQ3VycmVudFZhbHVlcygpID8/IHt9KSwgLi4ucGFydGlhbCB9O1xuXG5cdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHQvLyBSb3V0ZSB0aHJvdWdoIHRoZSBwcm92aXNpb25hbCBzZXJ2aWNlIHNvIHRoZSB3b3JrYmVuY2gtb3duZWRcblx0XHRcdC8vIGNvbmZpZyBjYWNoZSBpcyB1cGRhdGVkIHN5bmNocm9ub3VzbHkuIGB0cnlSZWJpbmRgIHJlYWRzIGZyb21cblx0XHRcdC8vIHRoYXQgY2FjaGUsIHNvIGEgU2VuZCByYWNpbmcgd2l0aCB0aGlzIGRpc3BhdGNoIHBpY2tzIHVwIHRoZVxuXHRcdFx0Ly8gbmV3IHZhbHVlIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhlIGFnZW50IHRvIGVjaG8gaXQgYmFjay5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gYmFja2VuZFNlc3Npb24uc2NoZW1lO1xuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IHRoaXMuX3Byb3Zpc2lvbmFsLmFwcGx5Q29uZmlnQ2hhbmdlKFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHR0aGlzLl9yZWFkV29ya2luZ0RpcmVjdG9yeSgpLFxuXHRcdFx0XHRwYXJ0aWFsLFxuXHRcdFx0KTtcblx0XHRcdGlmICghY3JlYXRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3N1YlJlZi52YWx1ZSB8fCB0aGlzLl9zdWJSZWYudmFsdWUuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSAhPT0gY3JlYXRlZC50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuX3JlYXR0YWNoKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZS5kaXNwYXRjaChiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiBwYXJ0aWFsLFxuXHRcdH0pO1xuXHRcdHZvaWQgdGhpcy5fcHJvdmlzaW9uYWwucmVmcmVzaFJlc29sdmVkQ29uZmlnKFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0YmFja2VuZFNlc3Npb24uc2NoZW1lLFxuXHRcdFx0dGhpcy5fcmVhZFdvcmtpbmdEaXJlY3RvcnkoKSxcblx0XHRcdG5leHRDb25maWcsXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3RvcihhY3Rpb246IElBY3Rpb24sIHByaXZhdGUgcmVhZG9ubHkgX3BpY2tlcjogQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3BpY2tlcik7XG5cdH1cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9waWNrZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLFNBQVMsYUFBYSxzQkFBc0I7QUFDckQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMs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
