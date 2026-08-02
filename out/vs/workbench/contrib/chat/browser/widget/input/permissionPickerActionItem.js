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
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../common/constants.js";
import { SessionType } from "../../../common/chatSessionsService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../common/chatPermissionWarnings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId, isAgentSandboxEnabledValue } from "../../../../../../platform/sandbox/common/settings.js";
const DEFAULT_PERMISSION_LEVELS = [
  ChatPermissionLevel.Default,
  ChatPermissionLevel.AutoApprove,
  ChatPermissionLevel.Autopilot
];
function getPermissionLevelMeta(level) {
  switch (level) {
    case ChatPermissionLevel.Assisted:
      return {
        id: "chat.permissions.assisted",
        label: localize("permissions.assisted", "Assisted permissions"),
        shortLabel: localize("permissions.assisted.label", "Assisted permissions"),
        detail: localize("permissions.assisted.subtext", "Evaluates risk before running tools"),
        icon: ThemeIcon.fromId(Codicon.sparkle.id),
        description: localize("permissions.assisted.description", "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval."),
        elevated: true
      };
    case ChatPermissionLevel.AutoApprove:
      return {
        id: "chat.permissions.autoApprove",
        label: localize("permissions.autoApprove", "Allow all"),
        shortLabel: localize("permissions.autoApprove.label", "Allow all"),
        detail: localize("permissions.autoApprove.subtext", "Runs tool calls without asking"),
        icon: ThemeIcon.fromId(Codicon.warning.id),
        description: localize("permissions.autoApprove.description", "Auto-approve all tool calls and retry on errors"),
        elevated: true
      };
    case ChatPermissionLevel.Autopilot:
      return {
        id: "chat.permissions.autopilot",
        label: localize("permissions.autopilot", "Autopilot (Preview)"),
        shortLabel: localize("permissions.autopilot.label", "Autopilot (Preview)"),
        detail: localize("permissions.autopilot.subtext", "Autonomously iterates from start to finish"),
        icon: ThemeIcon.fromId(Codicon.rocket.id),
        description: localize("permissions.autopilot.description", "Auto-approve all tool calls and continue until the task is done. Autopilot may increase costs."),
        elevated: true
      };
    case ChatPermissionLevel.Default:
    default:
      return {
        id: "chat.permissions.default",
        label: localize("permissions.default", "Default approvals"),
        shortLabel: localize("permissions.default.label", "Default approvals"),
        detail: localize("permissions.default.subtext", "Asks when approval settings don't apply"),
        icon: ThemeIcon.fromId(Codicon.shield.id),
        description: localize("permissions.default.description", "Use configured approval settings"),
        elevated: false
      };
  }
}
function sanitizeIdSegment(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
function getSandboxEnabledSettingId() {
  return isWindows ? AgentSandboxSettingId.AgentSandboxWindowsEnabled : AgentSandboxSettingId.AgentSandboxEnabled;
}
let PermissionPickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService, configurationService, dialogService, openerService, storageService, hoverService) {
    const isAutoApprovePolicyRestricted = () => configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const actionProvider = {
      getActions: () => {
        const ext = delegate.getExtensionPermissions?.();
        if (ext && ext.items.length > 0) {
          const sessionTypeSeg = sanitizeIdSegment(ext.sessionType);
          const groupSeg = sanitizeIdSegment(ext.groupId);
          return ext.items.map((item) => ({
            ...action,
            id: `chat.permissions.ext.${sessionTypeSeg}.${groupSeg}.${sanitizeIdSegment(item.id)}`,
            label: item.name,
            detail: item.description,
            icon: item.icon,
            checked: ext.selectedId === item.id,
            enabled: !item.locked,
            tooltip: item.locked ? localize("permissions.ext.locked", "This option is locked") : "",
            hover: item.description ? { content: item.description } : void 0,
            run: async () => {
              delegate.setExtensionPermission?.(ext.groupId, item);
              if (this.element) {
                this.renderLabel(this.element);
              }
            }
          }));
        }
        const currentLevel = delegate.currentPermissionLevel.get();
        const policyRestricted = isAutoApprovePolicyRestricted();
        const sandboxToggleEnabled = this.isSandboxToggleAvailable();
        const setSandboxEnabled = async (enableSandbox) => {
          const target = enableSandbox ? AgentSandboxEnabledValue.On : AgentSandboxEnabledValue.Off;
          if (this.isSandboxingEnabled() !== enableSandbox) {
            await configurationService.updateValue(getSandboxEnabledSettingId(), target);
          }
        };
        const levels = delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
        const actions = levels.map((level) => {
          const meta = getPermissionLevelMeta(level);
          const disabledByPolicy = meta.elevated && policyRestricted;
          const hover = disabledByPolicy ? localize("permissions.policyDescription", "Disabled by enterprise policy") : delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;
          const inlineToggle = sandboxToggleEnabled && level === ChatPermissionLevel.Default ? {
            label: localize("permissions.default.sandbox.toggle", "Sandboxing for terminal"),
            title: localize("permissions.default.sandbox.toggle.title", "Run terminal commands inside a sandbox that restricts file system and network access"),
            checked: this.isSandboxingEnabled(),
            onChange: (checked) => {
              void setSandboxEnabled(checked);
            }
          } : void 0;
          return {
            ...action,
            id: meta.id,
            label: meta.label,
            detail: meta.detail,
            icon: meta.icon,
            checked: currentLevel === level,
            enabled: !disabledByPolicy,
            inlineToggle,
            tooltip: disabledByPolicy ? localize("permissions.policyDisabled", "Disabled by enterprise policy") : "",
            hover: {
              content: hover
            },
            run: async () => {
              if (meta.elevated && !await maybeConfirmElevatedPermissionLevel(level, this.dialogService, storageService, {
                defaultSettingKey: delegate.defaultSettingKey,
                levelLabel: meta.label
              })) {
                return;
              }
              delegate.setPermissionLevel(level);
              if (this.element) {
                this.renderLabel(this.element);
              }
            }
          };
        });
        return actions;
      }
    };
    super(action, {
      actionProvider,
      actionBarActions: [{
        id: "chat.permissions.learnMore",
        label: localize("permissions.learnMore", "Learn more about permissions"),
        tooltip: localize("permissions.learnMore", "Learn more about permissions"),
        class: void 0,
        enabled: true,
        run: async () => {
          const ext = delegate.getExtensionPermissions?.();
          const url = ext?.sessionType === SessionType.ClaudeCode ? "https://code.claude.com/docs/en/permission-modes#available-modes" : "https://aka.ms/vscode/docs/permissions";
          await openerService.open(URI.parse(url));
        }
      }],
      reporter: { id: "ChatPermissionPicker", name: "ChatPermissionPicker", includeOptions: true },
      listOptions: { minWidth: 255, detailItemHeight: 44, ...pickerOptions.listOptions }
    }, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.hoverService = hoverService;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._currentTooltip = "";
    this._hover = this._register(new MutableDisposable());
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if ((e.affectsConfiguration(getSandboxEnabledSettingId()) || e.affectsConfiguration(ChatConfiguration.PermissionsSandboxToggleEnabled)) && this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  isSandboxingEnabled() {
    const value = this.configurationService.getValue(getSandboxEnabledSettingId());
    return isAgentSandboxEnabledValue(value);
  }
  isSandboxToggleSettingEnabled() {
    return this.configurationService.getValue(ChatConfiguration.PermissionsSandboxToggleEnabled) === true;
  }
  /**
   * Whether the sandbox toggle should surface for the current harness: the
   * experimental setting must be on and the delegate must opt in (only the
   * local harness does).
   */
  isSandboxToggleAvailable() {
    return this.isSandboxToggleSettingEnabled() && this.delegate.isSandboxToggleApplicable?.() === true;
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const ext = this.delegate.getExtensionPermissions?.();
    let icon;
    let label;
    let tooltip;
    const level = this.delegate.currentPermissionLevel.get();
    if (ext && ext.items.length > 0) {
      const selected = ext.items.find((i) => i.id === ext.selectedId) ?? ext.items.find((i) => i.default) ?? ext.items[0];
      icon = selected.icon ?? Codicon.lock;
      label = selected.name;
      tooltip = selected.description ?? selected.name;
    } else {
      const meta = getPermissionLevelMeta(level);
      icon = meta.icon;
      label = meta.shortLabel;
      tooltip = this.delegate.getPermissionLevelHover?.(level, meta) ?? meta.description;
      if (level === ChatPermissionLevel.Default && this.isSandboxToggleAvailable() && this.isSandboxingEnabled()) {
        label = localize("permissions.defaultSandboxed.label", "Default approvals (sandboxed)");
      }
    }
    const labelElements = [];
    labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
    labelElements.push(dom.$("span.chat-input-picker-label", void 0, label));
    dom.reset(element, ...labelElements);
    element.classList.toggle("warning", !ext && (level === ChatPermissionLevel.Autopilot || level === ChatPermissionLevel.Assisted));
    element.classList.toggle("info", !ext && level === ChatPermissionLevel.AutoApprove);
    this._currentTooltip = tooltip;
    element.setAttribute("aria-label", !ext && this.delegate.getPermissionLevelHover ? localize("permissions.ariaLabelWithDescription", "Permission picker, {0}, {1}", label, tooltip) : localize("permissions.ariaLabel", "Permission picker, {0}", label));
    if (this._hoverElement !== element) {
      this._hoverElement = element;
      this._hover.value = this.hoverService.setupDelayedHover(element, () => ({ content: this._currentTooltip }));
    }
    return null;
  }
  refresh() {
    if (this.element) {
      this.renderLabel(this.element);
    }
  }
  dispose() {
    if (this._store.isDisposed) {
      return;
    }
    this._onDidDispose.fire();
    super.dispose();
  }
};
PermissionPickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IHoverService)
], PermissionPickerActionItem);
export {
  PermissionPickerActionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvcGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24sIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0sIElDaGF0SW5wdXRQaWNrZXJPcHRpb25zIH0gZnJvbSAnLi9jaGF0SW5wdXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFBlcm1pc3Npb25XYXJuaW5ncy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkU2V0dGluZ1ZhbHVlLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUsIEFnZW50U2FuZGJveFNldHRpbmdJZCwgaXNBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblBlcm1pc3Npb25TdGF0ZSB7XG5cdC8qKiBTdGFibGUgaWRlbnRpZmllciBmb3IgdGhlIGNvbnRyaWJ1dGluZyBjaGF0IHNlc3Npb24gdHlwZSwgdXNlZCB0byBuYW1lc3BhY2UgYWN0aW9uIGlkcy4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvblR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgZ3JvdXBJZDogc3RyaW5nO1xuXHRyZWFkb25seSBpdGVtczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtW107XG5cdHJlYWRvbmx5IHNlbGVjdGVkSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGVybWlzc2lvblBpY2tlckRlbGVnYXRlIHtcblx0cmVhZG9ubHkgY3VycmVudFBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD47XG5cdHJlYWRvbmx5IHNldFBlcm1pc3Npb25MZXZlbDogKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKSA9PiB2b2lkO1xuXHQvKipcblx0ICogVGhlIG9yZGVyZWQgc2V0IG9mIHBlcm1pc3Npb24gbGV2ZWxzIHRoZSBwaWNrZXIgc2hvdWxkIG9mZmVyLiBXaGVuXG5cdCAqIG9taXR0ZWQsIHRoZSBidWlsdC1pbiBEZWZhdWx0L0J5cGFzcy9BdXRvcGlsb3Qgc2V0IGlzIHVzZWQuIEFnZW50LWhvc3Rcblx0ICogc2Vzc2lvbnMgb3ZlcnJpZGUgdGhpcyB0byBEZWZhdWx0L0J5cGFzcyAoQXV0b3BpbG90IGxpdmVzIG9uIHRoZVxuXHQgKiBvcnRob2dvbmFsIG1vZGUgYXhpcyB0aGVyZSkuXG5cdCAqL1xuXHRyZWFkb25seSBhdmFpbGFibGVMZXZlbHM/OiByZWFkb25seSBDaGF0UGVybWlzc2lvbkxldmVsW107XG5cdC8qKlxuXHQgKiBUaGUgc2V0dGluZyBpZCB0aGUgZWxldmF0ZWQtbGV2ZWwgd2FybmluZyBkaWFsb2cgbGlua3MgdG8gYXMgXCJtYWtlIHRoaXNcblx0ICogdGhlIGRlZmF1bHRcIi4gRGVmYXVsdHMgdG8gYGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdGA7IGFnZW50LWhvc3Qgc2Vzc2lvbnNcblx0ICogcGFzcyBgY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbmAuXG5cdCAqL1xuXHRyZWFkb25seSBkZWZhdWx0U2V0dGluZ0tleT86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gZGVmaW5lZCBhbmQgcmV0dXJucyBhIG5vbi1lbXB0eSBzdGF0ZSwgdGhlIHBpY2tlciBzaG93cyB0aGUgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkXG5cdCAqIGl0ZW1zIGluIHBsYWNlIG9mIHRoZSBidWlsdC1pbiB7QGxpbmsgQ2hhdFBlcm1pc3Npb25MZXZlbH0gaXRlbXMuXG5cdCAqL1xuXHRyZWFkb25seSBnZXRFeHRlbnNpb25QZXJtaXNzaW9ucz86ICgpID0+IElFeHRlbnNpb25QZXJtaXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNldEV4dGVuc2lvblBlcm1pc3Npb24/OiAoZ3JvdXBJZDogc3RyaW5nLCBpdGVtOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pID0+IHZvaWQ7XG5cdHJlYWRvbmx5IGdldFBlcm1pc3Npb25MZXZlbEhvdmVyPzogKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLCBtZXRhOiBJUGVybWlzc2lvbkxldmVsTWV0YSkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogV2hldGhlciB0aGUgZXhwZXJpbWVudGFsIFwiU2FuZGJveGluZyBmb3IgdGVybWluYWxcIiB0b2dnbGUgbWF5IGJlIHNob3duIG9uXG5cdCAqIHRoZSBEZWZhdWx0IGFwcHJvdmFscyBvcHRpb24uIFRoZSB0b2dnbGUgaXMgc3BlY2lmaWMgdG8gdGhlIGxvY2FsIGhhcm5lc3Ncblx0ICogKHdoaWNoIHJ1bnMgdGhlIGJ1aWx0LWluIHRlcm1pbmFsIHRvb2wpOyBhZ2VudC1ob3N0IGhhcm5lc3NlcyBzdWNoIGFzXG5cdCAqIENvcGlsb3QgQ0xJIGFuZCBDbGF1ZGUgQ29kZSBkbyBub3QgaW1wbGVtZW50IHRoaXMgYW5kIG5ldmVyIHNob3cgaXQuXG5cdCAqIEV2YWx1YXRlZCBlYWNoIHRpbWUgdGhlIHBpY2tlciBvcGVucyBzbyBhIGhhcm5lc3Mgc3dpdGNoIGlzIHJlZmxlY3RlZC5cblx0ICovXG5cdHJlYWRvbmx5IGlzU2FuZGJveFRvZ2dsZUFwcGxpY2FibGU/OiAoKSA9PiBib29sZWFuO1xufVxuXG4vKiogRGVmYXVsdCBsZXZlbCBzZXQgb2ZmZXJlZCB3aGVuIGEgZGVsZWdhdGUgZG9lcyBub3Qgc3BlY2lmeSB7QGxpbmsgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHN9LiAqL1xuY29uc3QgREVGQVVMVF9QRVJNSVNTSU9OX0xFVkVMUzogcmVhZG9ubHkgQ2hhdFBlcm1pc3Npb25MZXZlbFtdID0gW1xuXHRDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsXG5cdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUsXG5cdENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90LFxuXTtcblxuaW50ZXJmYWNlIElQZXJtaXNzaW9uTGV2ZWxNZXRhIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc2hvcnRMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHQvKiogRWxldmF0ZWQgbGV2ZWxzIGFyZSBkaXNhYmxlZCB3aGVuIGVudGVycHJpc2UgcG9saWN5IHR1cm5zIG9mZiBhdXRvLWFwcHJvdmFsIGFuZCBuZWVkIGEgd2FybmluZyBkaWFsb2cuICovXG5cdHJlYWRvbmx5IGVsZXZhdGVkOiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogSVBlcm1pc3Npb25MZXZlbE1ldGEge1xuXHRzd2l0Y2ggKGxldmVsKSB7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICdjaGF0LnBlcm1pc3Npb25zLmFzc2lzdGVkJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hc3Npc3RlZCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdHNob3J0TGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hc3Npc3RlZC5sYWJlbCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmFzc2lzdGVkLnN1YnRleHQnLCBcIkV2YWx1YXRlcyByaXNrIGJlZm9yZSBydW5uaW5nIHRvb2xzXCIpLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc3BhcmtsZS5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXNzaXN0ZWQuZGVzY3JpcHRpb24nLCBcIkFuIExMTSBqdWRnZSBldmFsdWF0ZXMgZWFjaCB0b29sIGNhbGwuIFRvb2xzIGl0IGRvZXNuJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuXCIpLFxuXHRcdFx0XHRlbGV2YXRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6ICdjaGF0LnBlcm1pc3Npb25zLmF1dG9BcHByb3ZlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hdXRvQXBwcm92ZScsIFwiQWxsb3cgYWxsXCIpLFxuXHRcdFx0XHRzaG9ydExhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUubGFiZWwnLCBcIkFsbG93IGFsbFwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUuc3VidGV4dCcsIFwiUnVucyB0b29sIGNhbGxzIHdpdGhvdXQgYXNraW5nXCIpLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ud2FybmluZy5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24nLCBcIkF1dG8tYXBwcm92ZSBhbGwgdG9vbCBjYWxscyBhbmQgcmV0cnkgb24gZXJyb3JzXCIpLFxuXHRcdFx0XHRlbGV2YXRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiAnY2hhdC5wZXJtaXNzaW9ucy5hdXRvcGlsb3QnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdCcsIFwiQXV0b3BpbG90IChQcmV2aWV3KVwiKSxcblx0XHRcdFx0c2hvcnRMYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdC5sYWJlbCcsIFwiQXV0b3BpbG90IChQcmV2aWV3KVwiKSxcblx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b3BpbG90LnN1YnRleHQnLCBcIkF1dG9ub21vdXNseSBpdGVyYXRlcyBmcm9tIHN0YXJ0IHRvIGZpbmlzaFwiKSxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnJvY2tldC5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXV0b3BpbG90LmRlc2NyaXB0aW9uJywgXCJBdXRvLWFwcHJvdmUgYWxsIHRvb2wgY2FsbHMgYW5kIGNvbnRpbnVlIHVudGlsIHRoZSB0YXNrIGlzIGRvbmUuIEF1dG9waWxvdCBtYXkgaW5jcmVhc2UgY29zdHMuXCIpLFxuXHRcdFx0XHRlbGV2YXRlZDogdHJ1ZSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ6XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiAnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0JywgXCJEZWZhdWx0IGFwcHJvdmFsc1wiKSxcblx0XHRcdFx0c2hvcnRMYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmRlZmF1bHQubGFiZWwnLCBcIkRlZmF1bHQgYXBwcm92YWxzXCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5kZWZhdWx0LnN1YnRleHQnLCBcIkFza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb24ndCBhcHBseVwiKSxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnNoaWVsZC5pZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZGVmYXVsdC5kZXNjcmlwdGlvbicsIFwiVXNlIGNvbmZpZ3VyZWQgYXBwcm92YWwgc2V0dGluZ3NcIiksXG5cdFx0XHRcdGVsZXZhdGVkOiBmYWxzZSxcblx0XHRcdH07XG5cdH1cbn1cblxuLyoqIFNhbml0aXplIGEgZnJlZS1mb3JtIGlkIHNlZ21lbnQgc28gaXQgaXMgc2FmZSB0byBlbWJlZCBpbiBhIHN0YWJsZSBhY3Rpb24gaWRlbnRpZmllci4gKi9cbmZ1bmN0aW9uIHNhbml0aXplSWRTZWdtZW50KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdmFsdWUucmVwbGFjZSgvW15hLXpBLVowLTlfLV0vZywgJ18nKTtcbn1cblxuZnVuY3Rpb24gZ2V0U2FuZGJveEVuYWJsZWRTZXR0aW5nSWQoKTogQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQgfCBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQge1xuXHRyZXR1cm4gaXNXaW5kb3dzID8gQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkIDogQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBQZXJtaXNzaW9uUGlja2VyQWN0aW9uSXRlbSBleHRlbmRzIENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9jdXJyZW50VG9vbHRpcDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2hvdmVyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsXG5cdFx0cGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkID0gKCkgPT4gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRcdGNvbnN0IGFjdGlvblByb3ZpZGVyOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Ly8gSWYgdGhlIGFjdGl2ZSBzZXNzaW9uIGNvbnRyaWJ1dGVzIGl0cyBvd24gcGVybWlzc2lvbiBpdGVtcywgc3VyZmFjZSB0aG9zZSBpbnN0ZWFkXG5cdFx0XHRcdC8vIG9mIHRoZSBidWlsdC1pbiBEZWZhdWx0L0F1dG9BcHByb3ZlL0F1dG9waWxvdCBsZXZlbHMuXG5cdFx0XHRcdGNvbnN0IGV4dCA9IGRlbGVnYXRlLmdldEV4dGVuc2lvblBlcm1pc3Npb25zPy4oKTtcblx0XHRcdFx0aWYgKGV4dCAmJiBleHQuaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25UeXBlU2VnID0gc2FuaXRpemVJZFNlZ21lbnQoZXh0LnNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHRjb25zdCBncm91cFNlZyA9IHNhbml0aXplSWRTZWdtZW50KGV4dC5ncm91cElkKTtcblx0XHRcdFx0XHRyZXR1cm4gZXh0Lml0ZW1zLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0XHRpZDogYGNoYXQucGVybWlzc2lvbnMuZXh0LiR7c2Vzc2lvblR5cGVTZWd9LiR7Z3JvdXBTZWd9LiR7c2FuaXRpemVJZFNlZ21lbnQoaXRlbS5pZCl9YCxcblx0XHRcdFx0XHRcdGxhYmVsOiBpdGVtLm5hbWUsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRpY29uOiBpdGVtLmljb24sXG5cdFx0XHRcdFx0XHRjaGVja2VkOiBleHQuc2VsZWN0ZWRJZCA9PT0gaXRlbS5pZCxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6ICFpdGVtLmxvY2tlZCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGl0ZW0ubG9ja2VkID8gbG9jYWxpemUoJ3Blcm1pc3Npb25zLmV4dC5sb2NrZWQnLCBcIlRoaXMgb3B0aW9uIGlzIGxvY2tlZFwiKSA6ICcnLFxuXHRcdFx0XHRcdFx0aG92ZXI6IGl0ZW0uZGVzY3JpcHRpb24gPyB7IGNvbnRlbnQ6IGl0ZW0uZGVzY3JpcHRpb24gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRkZWxlZ2F0ZS5zZXRFeHRlbnNpb25QZXJtaXNzaW9uPy4oZXh0Lmdyb3VwSWQsIGl0ZW0pO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMZXZlbCA9IGRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWQgPSBpc0F1dG9BcHByb3ZlUG9saWN5UmVzdHJpY3RlZCgpO1xuXHRcdFx0XHRjb25zdCBzYW5kYm94VG9nZ2xlRW5hYmxlZCA9IHRoaXMuaXNTYW5kYm94VG9nZ2xlQXZhaWxhYmxlKCk7XG5cdFx0XHRcdGNvbnN0IHNldFNhbmRib3hFbmFibGVkID0gYXN5bmMgKGVuYWJsZVNhbmRib3g6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQ6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSA9IGVuYWJsZVNhbmRib3ggPyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24gOiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmO1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzU2FuZGJveGluZ0VuYWJsZWQoKSAhPT0gZW5hYmxlU2FuZGJveCkge1xuXHRcdFx0XHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoZ2V0U2FuZGJveEVuYWJsZWRTZXR0aW5nSWQoKSwgdGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGxldmVscyA9IGRlbGVnYXRlLmF2YWlsYWJsZUxldmVscyA/PyBERUZBVUxUX1BFUk1JU1NJT05fTEVWRUxTO1xuXHRcdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSA9IGxldmVscy5tYXAobGV2ZWwgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1ldGEgPSBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsKTtcblx0XHRcdFx0XHRjb25zdCBkaXNhYmxlZEJ5UG9saWN5ID0gbWV0YS5lbGV2YXRlZCAmJiBwb2xpY3lSZXN0cmljdGVkO1xuXHRcdFx0XHRcdGNvbnN0IGhvdmVyID0gZGlzYWJsZWRCeVBvbGljeVxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncGVybWlzc2lvbnMucG9saWN5RGVzY3JpcHRpb24nLCBcIkRpc2FibGVkIGJ5IGVudGVycHJpc2UgcG9saWN5XCIpXG5cdFx0XHRcdFx0XHQ6IGRlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbEhvdmVyPy4obGV2ZWwsIG1ldGEpID8/IG1ldGEuZGVzY3JpcHRpb247XG5cblx0XHRcdFx0XHQvLyBUaGUgRGVmYXVsdCBsZXZlbCBjYXJyaWVzIGFuIGlubGluZSB0b2dnbGUgdGhhdCBjb250cm9scyB3aGV0aGVyXG5cdFx0XHRcdFx0Ly8gdGVybWluYWwgY29tbWFuZHMgcnVuIGluc2lkZSBhIHNhbmRib3guIFRoZSB0b2dnbGUgaXMgZ2F0ZWQgYmVoaW5kXG5cdFx0XHRcdFx0Ly8gYW4gZXhwZXJpbWVudGFsIHNldHRpbmcuXG5cdFx0XHRcdFx0Y29uc3QgaW5saW5lVG9nZ2xlID0gc2FuZGJveFRvZ2dsZUVuYWJsZWQgJiYgbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdFxuXHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZGVmYXVsdC5zYW5kYm94LnRvZ2dsZScsIFwiU2FuZGJveGluZyBmb3IgdGVybWluYWxcIiksXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZGVmYXVsdC5zYW5kYm94LnRvZ2dsZS50aXRsZScsIFwiUnVuIHRlcm1pbmFsIGNvbW1hbmRzIGluc2lkZSBhIHNhbmRib3ggdGhhdCByZXN0cmljdHMgZmlsZSBzeXN0ZW0gYW5kIG5ldHdvcmsgYWNjZXNzXCIpLFxuXHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0aGlzLmlzU2FuZGJveGluZ0VuYWJsZWQoKSxcblx0XHRcdFx0XHRcdFx0b25DaGFuZ2U6IChjaGVja2VkOiBib29sZWFuKSA9PiB7IHZvaWQgc2V0U2FuZGJveEVuYWJsZWQoY2hlY2tlZCk7IH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0XHRpZDogbWV0YS5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiBtZXRhLmxhYmVsLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiBtZXRhLmRldGFpbCxcblx0XHRcdFx0XHRcdGljb246IG1ldGEuaWNvbixcblx0XHRcdFx0XHRcdGNoZWNrZWQ6IGN1cnJlbnRMZXZlbCA9PT0gbGV2ZWwsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiAhZGlzYWJsZWRCeVBvbGljeSxcblx0XHRcdFx0XHRcdGlubGluZVRvZ2dsZSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGRpc2FibGVkQnlQb2xpY3kgPyBsb2NhbGl6ZSgncGVybWlzc2lvbnMucG9saWN5RGlzYWJsZWQnLCBcIkRpc2FibGVkIGJ5IGVudGVycHJpc2UgcG9saWN5XCIpIDogJycsXG5cdFx0XHRcdFx0XHRob3Zlcjoge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBob3Zlcixcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gRWxldmF0ZWQgbGV2ZWxzIHNob3cgYSBvbmUtdGltZSBjb25maXJtYXRpb24gd2FybmluZy5cblx0XHRcdFx0XHRcdFx0aWYgKG1ldGEuZWxldmF0ZWQgJiYgIWF3YWl0IG1heWJlQ29uZmlybUVsZXZhdGVkUGVybWlzc2lvbkxldmVsKGxldmVsLCB0aGlzLmRpYWxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdFNldHRpbmdLZXk6IGRlbGVnYXRlLmRlZmF1bHRTZXR0aW5nS2V5LFxuXHRcdFx0XHRcdFx0XHRcdGxldmVsTGFiZWw6IG1ldGEubGFiZWwsXG5cdFx0XHRcdFx0XHRcdH0pKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGRlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChsZXZlbCk7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN1cGVyKGFjdGlvbiwge1xuXHRcdFx0YWN0aW9uUHJvdmlkZXIsXG5cdFx0XHRhY3Rpb25CYXJBY3Rpb25zOiBbe1xuXHRcdFx0XHRpZDogJ2NoYXQucGVybWlzc2lvbnMubGVhcm5Nb3JlJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4dCA9IGRlbGVnYXRlLmdldEV4dGVuc2lvblBlcm1pc3Npb25zPy4oKTtcblx0XHRcdFx0XHRjb25zdCB1cmwgPSBleHQ/LnNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5DbGF1ZGVDb2RlXG5cdFx0XHRcdFx0XHQ/ICdodHRwczovL2NvZGUuY2xhdWRlLmNvbS9kb2NzL2VuL3Blcm1pc3Npb24tbW9kZXMjYXZhaWxhYmxlLW1vZGVzJ1xuXHRcdFx0XHRcdFx0OiAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlL2RvY3MvcGVybWlzc2lvbnMnO1xuXHRcdFx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0cmVwb3J0ZXI6IHsgaWQ6ICdDaGF0UGVybWlzc2lvblBpY2tlcicsIG5hbWU6ICdDaGF0UGVybWlzc2lvblBpY2tlcicsIGluY2x1ZGVPcHRpb25zOiB0cnVlIH0sXG5cdFx0XHRsaXN0T3B0aW9uczogeyBtaW5XaWR0aDogMjU1LCBkZXRhaWxJdGVtSGVpZ2h0OiA0NCwgLi4ucGlja2VyT3B0aW9ucy5saXN0T3B0aW9ucyB9LFxuXHRcdH0sIHBpY2tlck9wdGlvbnMsIGFjdGlvbldpZGdldFNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZ2V0U2FuZGJveEVuYWJsZWRTZXR0aW5nSWQoKSkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5QZXJtaXNzaW9uc1NhbmRib3hUb2dnbGVFbmFibGVkKSkgJiYgdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGlzU2FuZGJveGluZ0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFnZW50U2FuZGJveEVuYWJsZWRTZXR0aW5nVmFsdWU+KGdldFNhbmRib3hFbmFibGVkU2V0dGluZ0lkKCkpO1xuXHRcdHJldHVybiBpc0FnZW50U2FuZGJveEVuYWJsZWRWYWx1ZSh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzU2FuZGJveFRvZ2dsZVNldHRpbmdFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlBlcm1pc3Npb25zU2FuZGJveFRvZ2dsZUVuYWJsZWQpID09PSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHNhbmRib3ggdG9nZ2xlIHNob3VsZCBzdXJmYWNlIGZvciB0aGUgY3VycmVudCBoYXJuZXNzOiB0aGVcblx0ICogZXhwZXJpbWVudGFsIHNldHRpbmcgbXVzdCBiZSBvbiBhbmQgdGhlIGRlbGVnYXRlIG11c3Qgb3B0IGluIChvbmx5IHRoZVxuXHQgKiBsb2NhbCBoYXJuZXNzIGRvZXMpLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1NhbmRib3hUb2dnbGVBdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNTYW5kYm94VG9nZ2xlU2V0dGluZ0VuYWJsZWQoKSAmJiB0aGlzLmRlbGVnYXRlLmlzU2FuZGJveFRvZ2dsZUFwcGxpY2FibGU/LigpID09PSB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUgfCBudWxsIHtcblx0XHR0aGlzLnNldEFyaWFMYWJlbEF0dHJpYnV0ZXMoZWxlbWVudCk7XG5cblx0XHRjb25zdCBleHQgPSB0aGlzLmRlbGVnYXRlLmdldEV4dGVuc2lvblBlcm1pc3Npb25zPy4oKTtcblx0XHRsZXQgaWNvbjogVGhlbWVJY29uO1xuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmc7XG5cdFx0Y29uc3QgbGV2ZWwgPSB0aGlzLmRlbGVnYXRlLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCk7XG5cdFx0aWYgKGV4dCAmJiBleHQuaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBleHQuaXRlbXMuZmluZChpID0+IGkuaWQgPT09IGV4dC5zZWxlY3RlZElkKVxuXHRcdFx0XHQ/PyBleHQuaXRlbXMuZmluZChpID0+IGkuZGVmYXVsdClcblx0XHRcdFx0Pz8gZXh0Lml0ZW1zWzBdO1xuXHRcdFx0aWNvbiA9IHNlbGVjdGVkLmljb24gPz8gQ29kaWNvbi5sb2NrO1xuXHRcdFx0bGFiZWwgPSBzZWxlY3RlZC5uYW1lO1xuXHRcdFx0dG9vbHRpcCA9IHNlbGVjdGVkLmRlc2NyaXB0aW9uID8/IHNlbGVjdGVkLm5hbWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1ldGEgPSBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsKTtcblx0XHRcdGljb24gPSBtZXRhLmljb247XG5cdFx0XHRsYWJlbCA9IG1ldGEuc2hvcnRMYWJlbDtcblx0XHRcdHRvb2x0aXAgPSB0aGlzLmRlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbEhvdmVyPy4obGV2ZWwsIG1ldGEpID8/IG1ldGEuZGVzY3JpcHRpb247XG5cdFx0XHRpZiAobGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCAmJiB0aGlzLmlzU2FuZGJveFRvZ2dsZUF2YWlsYWJsZSgpICYmIHRoaXMuaXNTYW5kYm94aW5nRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3Blcm1pc3Npb25zLmRlZmF1bHRTYW5kYm94ZWQubGFiZWwnLCBcIkRlZmF1bHQgYXBwcm92YWxzIChzYW5kYm94ZWQpXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudHMgPSBbXTtcblx0XHRsYWJlbEVsZW1lbnRzLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtpY29uLmlkfSlgKSk7XG5cdFx0bGFiZWxFbGVtZW50cy5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXG5cdFx0ZG9tLnJlc2V0KGVsZW1lbnQsIC4uLmxhYmVsRWxlbWVudHMpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsICFleHQgJiYgKGxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB8fCBsZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZCkpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaW5mbycsICFleHQgJiYgbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpO1xuXG5cdFx0dGhpcy5fY3VycmVudFRvb2x0aXAgPSB0b29sdGlwO1xuXHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgIWV4dCAmJiB0aGlzLmRlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbEhvdmVyXG5cdFx0XHQ/IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hcmlhTGFiZWxXaXRoRGVzY3JpcHRpb24nLCBcIlBlcm1pc3Npb24gcGlja2VyLCB7MH0sIHsxfVwiLCBsYWJlbCwgdG9vbHRpcClcblx0XHRcdDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmFyaWFMYWJlbCcsIFwiUGVybWlzc2lvbiBwaWNrZXIsIHswfVwiLCBsYWJlbCkpO1xuXHRcdC8vIGByZW5kZXJMYWJlbGAgY2FuIHJ1biBhZ2FpbnN0IGEgZnJlc2ggZWxlbWVudCBvbiBzdWJzZXF1ZW50XG5cdFx0Ly8gYHJlbmRlcigpYCBjYWxscyAoZS5nLiB3aGVuIHRoZSBpdGVtIG1vdmVzIGludG8vb3V0IG9mIG92ZXJmbG93KS5cblx0XHQvLyBSZS13aXJlIHRoZSBob3ZlciBvbiB0aGUgbmV3IGVsZW1lbnQgYW5kIGRpc3Bvc2UgdGhlIHByZXZpb3VzXG5cdFx0Ly8gcmVnaXN0cmF0aW9uIHNvIGl0IGRvZXNuJ3QgbGVhayB0aGUgb2xkIGVsZW1lbnQuXG5cdFx0aWYgKHRoaXMuX2hvdmVyRWxlbWVudCAhPT0gZWxlbWVudCkge1xuXHRcdFx0dGhpcy5faG92ZXJFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdHRoaXMuX2hvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudCwgKCkgPT4gKHsgY29udGVudDogdGhpcy5fY3VycmVudFRvb2x0aXAgfSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyByZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixT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
