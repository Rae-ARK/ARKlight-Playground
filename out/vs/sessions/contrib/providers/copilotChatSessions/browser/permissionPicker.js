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
import * as dom from "../../../../../base/browser/dom.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, derived } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { maybeConfirmElevatedPermissionLevel } from "../../../../../workbench/contrib/chat/common/chatPermissionWarnings.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatConfiguration, ChatPermissionLevel, isChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { reportNewChatPickerClosed } from "../../../chat/browser/newChatPickerTelemetry.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { CopilotChatSessionsProvider } from "./copilotChatSessionsProvider.js";
const PERMISSION_LEVEL_OPTION_ID = "permissionLevel";
const DEFAULT_PERMISSION_LEVELS = [
  ChatPermissionLevel.Default,
  ChatPermissionLevel.AutoApprove,
  ChatPermissionLevel.Autopilot
];
function getPermissionLevelMeta(level) {
  switch (level) {
    case ChatPermissionLevel.Assisted:
      return {
        label: localize("permissions.assisted", "Assisted permissions"),
        detail: localize("permissions.assisted.subtext", "Evaluates risk before running tools"),
        icon: Codicon.sparkle,
        hover: localize("permissions.assisted.description", "An LLM judge evaluates each tool call. Tools it doesn't approve require your approval.")
      };
    case ChatPermissionLevel.AutoApprove:
      return {
        label: localize("permissions.autoApprove", "Allow all"),
        detail: localize("permissions.autoApprove.subtext", "Runs tool calls without asking"),
        icon: Codicon.warning
      };
    case ChatPermissionLevel.Autopilot:
      return {
        label: localize("permissions.autopilot", "Autopilot (Preview)"),
        detail: localize("permissions.autopilot.subtext", "Autonomously iterates from start to finish"),
        icon: Codicon.rocket,
        hover: localize("permissions.autopilot.description", "Auto-approve all tool calls and continue until the task is done. Autopilot may increase costs.")
      };
    case ChatPermissionLevel.Default:
    default:
      return {
        label: localize("permissions.default", "Default approvals"),
        detail: localize("permissions.default.subtext", "Asks when approval settings don't apply"),
        icon: Codicon.shield
      };
  }
}
let PermissionPicker = class extends Disposable {
  constructor(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService) {
    super();
    this._delegate = _delegate;
    this.actionWidgetService = actionWidgetService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.hoverService = hoverService;
    this._currentLevel = ChatPermissionLevel.Default;
    this._renderDisposables = this._register(new DisposableStore());
  }
  render(container) {
    this._renderDisposables.clear();
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const configuredDefault = this.configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
    const initialLevel = isChatPermissionLevel(configuredDefault) ? configuredDefault : ChatPermissionLevel.Default;
    this._currentLevel = policyRestricted ? ChatPermissionLevel.Default : initialLevel;
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-permission-picker"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._updateTriggerLabel(trigger);
    if (this._delegate.getPermissionLevelHover) {
      this._renderDisposables.add(this.hoverService.setupDelayedHover(trigger, () => {
        const meta = this._getPermissionLevelMeta(this._currentLevel);
        return { content: this._getPermissionLevelHover(this._currentLevel, meta) ?? "" };
      }));
    }
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }
    }));
    const currentPermissionLevel = this._delegate.currentPermissionLevel;
    if (currentPermissionLevel) {
      this._renderDisposables.add(autorun((reader) => {
        const level = currentPermissionLevel.read(reader);
        if (level === void 0) {
          return;
        }
        this._currentLevel = level;
        this._updateTriggerLabel(trigger);
      }));
    }
    const isApplicable = this._delegate.isApplicable;
    if (isApplicable) {
      this._renderDisposables.add(autorun((reader) => {
        const visible = isApplicable.read(reader);
        slot.style.display = visible ? "" : "none";
        container.style.display = visible ? "" : "none";
      }));
    }
    return slot;
  }
  showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const levels = this._delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
    const items = levels.map((level) => {
      const meta = this._getPermissionLevelMeta(level);
      const disabled = level !== ChatPermissionLevel.Default && policyRestricted;
      const hover = this._delegate.getPermissionLevelHover ? disabled ? localize("permissions.policyDescription", "Disabled by enterprise policy") : this._getPermissionLevelHover(level, meta) : meta.hover;
      return {
        kind: ActionListItemKind.Action,
        group: { kind: ActionListItemKind.Header, title: "", icon: meta.icon },
        item: {
          level,
          label: meta.label,
          icon: meta.icon,
          checked: this._currentLevel === level
        },
        label: meta.label,
        detail: meta.detail,
        ...hover ? { hover: { content: hover } } : {},
        disabled
      };
    });
    items.push({
      kind: ActionListItemKind.Separator,
      label: "",
      disabled: false
    });
    items.push({
      kind: ActionListItemKind.Action,
      group: { kind: ActionListItemKind.Header, title: "", icon: Codicon.blank },
      item: {
        label: localize("permissions.learnMore", "Learn more about permissions"),
        icon: Codicon.blank,
        checked: false
      },
      label: localize("permissions.learnMore", "Learn more about permissions"),
      hideIcon: false,
      disabled: false
    });
    const triggerElement = this._triggerElement;
    const delegate = {
      onSelect: async (item) => {
        this.actionWidgetService.hide();
        if (item.level) {
          await this._selectLevel(item.level);
        } else {
          await this.openerService.open(URI.parse("https://aka.ms/vscode/docs/permissions"));
        }
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    const listOptions = { minWidth: 255 };
    this.actionWidgetService.show(
      "permissionPicker",
      false,
      items,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getWidgetAriaLabel: () => localize("permissionPicker.ariaLabel", "Permission Picker")
      },
      listOptions
    );
  }
  async _selectLevel(level) {
    if (!await maybeConfirmElevatedPermissionLevel(level, this.dialogService, this.storageService, {
      defaultSettingKey: this._delegate.defaultSettingKey,
      levelLabel: this._getPermissionLevelMeta(level).label
    })) {
      reportNewChatPickerClosed(this.telemetryService, {
        id: "NewChatPermissionPicker",
        name: "NewChatPermissionPicker",
        optionIdBefore: this._currentLevel,
        optionIdAfter: this._currentLevel,
        optionLabelBefore: void 0,
        optionLabelAfter: void 0,
        isPII: false
      });
      return;
    }
    reportNewChatPickerClosed(this.telemetryService, {
      id: "NewChatPermissionPicker",
      name: "NewChatPermissionPicker",
      optionIdBefore: this._currentLevel,
      optionIdAfter: level,
      optionLabelBefore: void 0,
      optionLabelAfter: void 0,
      isPII: false
    });
    this._currentLevel = level;
    this._updateTriggerLabel(this._triggerElement);
    this._delegate.setPermissionLevel(level);
  }
  _updateTriggerLabel(trigger) {
    if (!trigger) {
      return;
    }
    dom.clearNode(trigger);
    const meta = this._getPermissionLevelMeta(this._currentLevel);
    dom.append(trigger, renderIcon(meta.icon));
    const labelSpan = dom.append(trigger, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = meta.label;
    const hover = this._getPermissionLevelHover(this._currentLevel, meta);
    trigger.ariaLabel = hover ? localize("permissionPicker.triggerAriaLabelWithDescription", "Pick Permission Level, {0}, {1}", meta.label, hover) : localize("permissionPicker.triggerAriaLabel", "Pick Permission Level, {0}", meta.label);
    trigger.classList.toggle("warning", this._currentLevel === ChatPermissionLevel.Autopilot || this._currentLevel === ChatPermissionLevel.Assisted);
    trigger.classList.toggle("info", this._currentLevel === ChatPermissionLevel.AutoApprove);
  }
  _getPermissionLevelHover(level, meta) {
    return this._delegate.getPermissionLevelHover?.(level, meta) ?? meta.hover;
  }
  _getPermissionLevelMeta(level) {
    const meta = getPermissionLevelMeta(level);
    return this._delegate.getPermissionLevelMeta(level, meta);
  }
};
PermissionPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IHoverService)
], PermissionPicker);
let CopilotPermissionPickerDelegate = class extends Disposable {
  constructor(_session, _sessionsProvidersService, _chatSessionsService) {
    super();
    this._session = _session;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._chatSessionsService = _chatSessionsService;
    this.currentPermissionLevel = derived(this, (reader) => {
      const session = this._session.read(reader);
      if (!session) {
        return void 0;
      }
      const provider = this._sessionsProvidersService.getProvider(session.providerId);
      if (!(provider instanceof CopilotChatSessionsProvider)) {
        return void 0;
      }
      return provider.getSession(session.sessionId)?.permissionLevel.read(reader);
    });
  }
  getPermissionLevelMeta(_level, meta) {
    return meta;
  }
  setPermissionLevel(level) {
    const session = this._session.get();
    if (!session) {
      return;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (provider instanceof CopilotChatSessionsProvider) {
      const chatSession = provider.getSession(session.sessionId);
      if (!chatSession) {
        return;
      }
      if (chatSession.setOption) {
        chatSession.setPermissionLevel(level);
        chatSession.setOption(PERMISSION_LEVEL_OPTION_ID, level);
      } else {
        this._chatSessionsService.setSessionOption(chatSession.resource, PERMISSION_LEVEL_OPTION_ID, level);
      }
    }
  }
};
CopilotPermissionPickerDelegate = __decorateClass([
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, IChatSessionsService)
], CopilotPermissionPickerDelegate);
export {
  CopilotPermissionPickerDelegate,
  DEFAULT_PERMISSION_LEVELS,
  PermissionPicker,
  getPermissionLevelMeta
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9wZXJtaXNzaW9uUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBtYXliZUNvbmZpcm1FbGV2YXRlZFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRQZXJtaXNzaW9uV2FybmluZ3MuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsLCBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgcmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9uZXdDaGF0UGlja2VyVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi9jb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuXG5jb25zdCBQRVJNSVNTSU9OX0xFVkVMX09QVElPTl9JRCA9ICdwZXJtaXNzaW9uTGV2ZWwnO1xuXG4vKipcbiAqIFN0cmF0ZWd5IGZvciB0aGUgcGVyLXByb3ZpZGVyIHBhcnRzIG9mIHtAbGluayBQZXJtaXNzaW9uUGlja2VyfTogaG93IHRvIHJlYWRcbiAqIGJhY2sgdGhlIGN1cnJlbnQgbGV2ZWwgKGlmIGF0IGFsbCksIHdoZXRoZXIgdGhlIHBpY2tlciBzaG91bGQgYmUgdmlzaWJsZVxuICogZ2l2ZW4gdGhlIGFjdGl2ZSBzZXNzaW9uLCBhbmQgd2hlcmUgdG8gd3JpdGUgdGhlIHVzZXIncyBzZWxlY3Rpb24uXG4gKlxuICogSW1wbGVtZW50YXRpb25zIGxpdmUgd2l0aCB0aGUgcHJvdmlkZXIgdGhleSBiYWNrIChlLmcuXG4gKiB7QGxpbmsgQ29waWxvdFBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZX0gYmVsb3cgZm9yIHRoZSBkZWZhdWx0IENvcGlsb3RcbiAqIHByb3ZpZGVyLCBvciBgQWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlYCBpbiB0aGUgYWdlbnQtaG9zdCBmb2xkZXIpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUge1xuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIHRoZSBwaWNrZXIncyB0cmlnZ2VyIGxhYmVsIHJlYWN0aXZlbHkgdHJhY2tzIHRoaXMuIElmXG5cdCAqIG9taXR0ZWQsIHRoZSBwaWNrZXIgbWFuYWdlcyBpdHMgb3duIGludGVybmFsIHN0YXRlIGFuZCBzdGFydHMgYXRcblx0ICoge0BsaW5rIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdH0uXG5cdCAqL1xuXHRyZWFkb25seSBjdXJyZW50UGVybWlzc2lvbkxldmVsPzogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIElmIHByb3ZpZGVkLCB0aGUgcGlja2VyIGhpZGVzIGl0c2VsZiB3aGVuIHRoaXMgaXMgYGZhbHNlYC4gVXNlZCBieVxuXHQgKiBkZWxlZ2F0ZXMgd2hvc2UgYXBwbGljYWJpbGl0eSBkZXBlbmRzIG9uIHRoZSBhY3RpdmUgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IGlzQXBwbGljYWJsZT86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JkZXJlZCBzZXQgb2YgcGVybWlzc2lvbiBsZXZlbHMgdGhlIHBpY2tlciBzaG91bGQgb2ZmZXIuIFdoZW5cblx0ICogb21pdHRlZCwgdGhlIHBpY2tlciBvZmZlcnMgdGhlIGRlZmF1bHQgQ29waWxvdCBzZXRcblx0ICogKGBEZWZhdWx0YCAvIGBCeXBhc3NgIC8gYEF1dG9waWxvdGApLiBBZ2VudC1ob3N0IHNlc3Npb25zIG92ZXJyaWRlIHRoaXNcblx0ICogdG8gb2ZmZXIgYERlZmF1bHRgIC8gYEJ5cGFzc2AuXG5cdCAqL1xuXHRyZWFkb25seSBhdmFpbGFibGVMZXZlbHM/OiByZWFkb25seSBDaGF0UGVybWlzc2lvbkxldmVsW107XG5cblx0LyoqXG5cdCAqIFRoZSBzZXR0aW5nIGlkIHRoZSBlbGV2YXRlZC1sZXZlbCB3YXJuaW5nIGRpYWxvZyBsaW5rcyB0byBhcyBcIm1ha2UgdGhpc1xuXHQgKiB0aGUgZGVmYXVsdFwiLiBEZWZhdWx0cyB0byBgY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0YDsgYWdlbnQtaG9zdCBzZXNzaW9uc1xuXHQgKiBwYXNzIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYC5cblx0ICovXG5cdHJlYWRvbmx5IGRlZmF1bHRTZXR0aW5nS2V5Pzogc3RyaW5nO1xuXHRnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLCBtZXRhOiBJUGVybWlzc2lvbkxldmVsTWV0YSk6IElQZXJtaXNzaW9uTGV2ZWxNZXRhO1xuXG5cdC8qKlxuXHQgKiBDYWxsZWQgYWZ0ZXIgdGhlIHVzZXIgc2VsZWN0cyBhIGxldmVsIChhbmQgYW55IHJlcXVpcmVkIGNvbmZpcm1hdGlvblxuXHQgKiBkaWFsb2cgaGFzIGJlZW4gYWNjZXB0ZWQpLlxuXHQgKi9cblx0c2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZDtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgaG92ZXIgY29udGVudCBmb3IgZGVsZWdhdGVzIHRoYXQgbmVlZCBwcm92aWRlci1zcGVjaWZpYyBjb3B5LlxuXHQgKi9cblx0Z2V0UGVybWlzc2lvbkxldmVsSG92ZXI/KGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLCBtZXRhOiBJUGVybWlzc2lvbkxldmVsTWV0YSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGVybWlzc2lvbkxldmVsTWV0YSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGhvdmVyPzogc3RyaW5nO1xufVxuXG4vKiogRGVmYXVsdCBsZXZlbCBzZXQgb2ZmZXJlZCB3aGVuIGEgZGVsZWdhdGUgZG9lcyBub3Qgc3BlY2lmeSB7QGxpbmsgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHN9LiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfUEVSTUlTU0lPTl9MRVZFTFM6IHJlYWRvbmx5IENoYXRQZXJtaXNzaW9uTGV2ZWxbXSA9IFtcblx0Q2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0LFxuXHRDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlLFxuXHRDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogSVBlcm1pc3Npb25MZXZlbE1ldGEge1xuXHRzd2l0Y2ggKGxldmVsKSB7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hc3Npc3RlZCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmFzc2lzdGVkLnN1YnRleHQnLCBcIkV2YWx1YXRlcyByaXNrIGJlZm9yZSBydW5uaW5nIHRvb2xzXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGhvdmVyOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuYXNzaXN0ZWQuZGVzY3JpcHRpb24nLCBcIkFuIExMTSBqdWRnZSBldmFsdWF0ZXMgZWFjaCB0b29sIGNhbGwuIFRvb2xzIGl0IGRvZXNuJ3QgYXBwcm92ZSByZXF1aXJlIHlvdXIgYXBwcm92YWwuXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmU6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9BcHByb3ZlJywgXCJBbGxvdyBhbGxcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9BcHByb3ZlLnN1YnRleHQnLCBcIlJ1bnMgdG9vbCBjYWxscyB3aXRob3V0IGFza2luZ1wiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi53YXJuaW5nLFxuXHRcdFx0fTtcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5hdXRvcGlsb3QnLCBcIkF1dG9waWxvdCAoUHJldmlldylcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdC5zdWJ0ZXh0JywgXCJBdXRvbm9tb3VzbHkgaXRlcmF0ZXMgZnJvbSBzdGFydCB0byBmaW5pc2hcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucm9ja2V0LFxuXHRcdFx0XHRob3ZlcjogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmF1dG9waWxvdC5kZXNjcmlwdGlvbicsIFwiQXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzIGFuZCBjb250aW51ZSB1bnRpbCB0aGUgdGFzayBpcyBkb25lLiBBdXRvcGlsb3QgbWF5IGluY3JlYXNlIGNvc3RzLlwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ6XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMuZGVmYXVsdCcsIFwiRGVmYXVsdCBhcHByb3ZhbHNcIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Blcm1pc3Npb25zLmRlZmF1bHQuc3VidGV4dCcsIFwiQXNrcyB3aGVuIGFwcHJvdmFsIHNldHRpbmdzIGRvbid0IGFwcGx5XCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNoaWVsZCxcblx0XHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElQZXJtaXNzaW9uSXRlbSB7XG5cdHJlYWRvbmx5IGxldmVsPzogQ2hhdFBlcm1pc3Npb25MZXZlbDtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBjaGVja2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgUGVybWlzc2lvblBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBfY3VycmVudExldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsID0gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHRwcm90ZWN0ZWQgX3RyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9kZWxlZ2F0ZTogSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHBpY2tlciB0byByZWZsZWN0IHRoZSBjb25maWd1cmVkIGRlZmF1bHQgcGVybWlzc2lvbiBsZXZlbFxuXHRcdC8vIChgY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0YCkgd2hlbmV2ZXIgaXQgaXMgKHJlLSlyZW5kZXJlZC4gSWYgZW50ZXJwcmlzZVxuXHRcdC8vIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZhbCwgY2xhbXAgdG8gRGVmYXVsdCByZWdhcmRsZXNzIG9mIHRoZVxuXHRcdC8vIGNvbmZpZ3VyZWQgZGVmYXVsdCBzbyB3ZSBuZXZlciBzaG93IGFuIGVsZXZhdGVkIGxldmVsIHRoZSB1c2VyIGNhbid0IHBpY2suXG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWREZWZhdWx0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwpO1xuXHRcdGNvbnN0IGluaXRpYWxMZXZlbCA9IGlzQ2hhdFBlcm1pc3Npb25MZXZlbChjb25maWd1cmVkRGVmYXVsdCkgPyBjb25maWd1cmVkRGVmYXVsdCA6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDtcblx0XHR0aGlzLl9jdXJyZW50TGV2ZWwgPSBwb2xpY3lSZXN0cmljdGVkID8gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0IDogaW5pdGlhbExldmVsO1xuXG5cdFx0Y29uc3Qgc2xvdCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3Quc2Vzc2lvbnMtY2hhdC1wZXJtaXNzaW9uLXBpY2tlcicpKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBzbG90LnJlbW92ZSgpIH0pO1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJ2EuYWN0aW9uLWxhYmVsJykpO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50ID0gdHJpZ2dlcjtcblxuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCh0cmlnZ2VyKTtcblx0XHRpZiAodGhpcy5fZGVsZWdhdGUuZ2V0UGVybWlzc2lvbkxldmVsSG92ZXIpIHtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0cmlnZ2VyLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9nZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKHRoaXMuX2N1cnJlbnRMZXZlbCk7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IHRoaXMuX2dldFBlcm1pc3Npb25MZXZlbEhvdmVyKHRoaXMuX2N1cnJlbnRMZXZlbCwgbWV0YSkgPz8gJycgfTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIChlKSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNob3dQaWNrZXIoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwgPSB0aGlzLl9kZWxlZ2F0ZS5jdXJyZW50UGVybWlzc2lvbkxldmVsO1xuXHRcdGlmIChjdXJyZW50UGVybWlzc2lvbkxldmVsKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBsZXZlbCA9IGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAobGV2ZWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50TGV2ZWwgPSBsZXZlbDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKHRyaWdnZXIpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQXBwbGljYWJsZSA9IHRoaXMuX2RlbGVnYXRlLmlzQXBwbGljYWJsZTtcblx0XHRpZiAoaXNBcHBsaWNhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlID0gaXNBcHBsaWNhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0c2xvdC5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdFx0XHQvLyBBbHNvIGNvbGxhcHNlIHRoZSB3cmFwcGluZyBgLmFjdGlvbi1pdGVtYCB0aGF0XG5cdFx0XHRcdC8vIGBNZW51V29ya2JlbmNoVG9vbEJhcmAgY3JlYXRlZCBmb3IgdGhpcyBwaWNrZXIgXHUyMDE0IGhpZGluZyBvbmx5XG5cdFx0XHRcdC8vIHRoZSBpbm5lciBzbG90IGxlYXZlcyB0aGUgd3JhcHBlciBvY2N1cHlpbmcgaXRzIGBtaW4td2lkdGhgXG5cdFx0XHRcdC8vIGZsb29yIGFuZCBwcm9kdWNlcyBhIHZpc2libGUgZW1wdHkgZ2FwIGluIHRoZSBjaGlwIHJvdyB3aGVuXG5cdFx0XHRcdC8vIHRoZSBwaWNrZXIgaXNuJ3QgYXBwbGljYWJsZSB0byB0aGUgYWN0aXZlIHNlc3Npb24gKGUuZy5cblx0XHRcdFx0Ly8gQ2xhdWRlIGFnZW50IGhvc3QgaGFzIG5vIGBhdXRvQXBwcm92ZWAgaW4gaXRzIHNjaGVtYSkuXG5cdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzbG90O1xuXHR9XG5cblx0c2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cblx0XHRjb25zdCBsZXZlbHMgPSB0aGlzLl9kZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMgPz8gREVGQVVMVF9QRVJNSVNTSU9OX0xFVkVMUztcblx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElQZXJtaXNzaW9uSXRlbT5bXSA9IGxldmVscy5tYXAobGV2ZWwgPT4ge1xuXHRcdFx0Y29uc3QgbWV0YSA9IHRoaXMuX2dldFBlcm1pc3Npb25MZXZlbE1ldGEobGV2ZWwpO1xuXHRcdFx0Ly8gRGVmYXVsdCBpcyBuZXZlciBwb2xpY3ktcmVzdHJpY3RlZDsgZWxldmF0ZWQgbGV2ZWxzIGFyZSBkaXNhYmxlZFxuXHRcdFx0Ly8gd2hlbiBlbnRlcnByaXNlIHBvbGljeSB0dXJucyBvZmYgZ2xvYmFsIGF1dG8tYXBwcm92YWwuXG5cdFx0XHRjb25zdCBkaXNhYmxlZCA9IGxldmVsICE9PSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQgJiYgcG9saWN5UmVzdHJpY3RlZDtcblx0XHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fZGVsZWdhdGUuZ2V0UGVybWlzc2lvbkxldmVsSG92ZXJcblx0XHRcdFx0PyAoZGlzYWJsZWQgPyBsb2NhbGl6ZSgncGVybWlzc2lvbnMucG9saWN5RGVzY3JpcHRpb24nLCBcIkRpc2FibGVkIGJ5IGVudGVycHJpc2UgcG9saWN5XCIpIDogdGhpcy5fZ2V0UGVybWlzc2lvbkxldmVsSG92ZXIobGV2ZWwsIG1ldGEpKVxuXHRcdFx0XHQ6IG1ldGEuaG92ZXI7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRncm91cDogeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCB0aXRsZTogJycsIGljb246IG1ldGEuaWNvbiB9LFxuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0bGV2ZWwsXG5cdFx0XHRcdFx0bGFiZWw6IG1ldGEubGFiZWwsXG5cdFx0XHRcdFx0aWNvbjogbWV0YS5pY29uLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuX2N1cnJlbnRMZXZlbCA9PT0gbGV2ZWwsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhYmVsOiBtZXRhLmxhYmVsLFxuXHRcdFx0XHRkZXRhaWw6IG1ldGEuZGV0YWlsLFxuXHRcdFx0XHQuLi4oaG92ZXIgPyB7IGhvdmVyOiB7IGNvbnRlbnQ6IGhvdmVyIH0gfSA6IHt9KSxcblx0XHRcdFx0ZGlzYWJsZWQsXG5cdFx0XHR9IHNhdGlzZmllcyBJQWN0aW9uTGlzdEl0ZW08SVBlcm1pc3Npb25JdGVtPjtcblx0XHR9KTtcblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcixcblx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdGRpc2FibGVkOiBmYWxzZSxcblx0XHR9KTtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRncm91cDogeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCB0aXRsZTogJycsIGljb246IENvZGljb24uYmxhbmsgfSxcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uYmxhbmssXG5cdFx0XHRcdGNoZWNrZWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGVybWlzc2lvbnMubGVhcm5Nb3JlJywgXCJMZWFybiBtb3JlIGFib3V0IHBlcm1pc3Npb25zXCIpLFxuXHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0ZGlzYWJsZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJpZ2dlckVsZW1lbnQgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJUGVybWlzc2lvbkl0ZW0+ID0ge1xuXHRcdFx0b25TZWxlY3Q6IGFzeW5jIChpdGVtKSA9PiB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdGlmIChpdGVtLmxldmVsKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2VsZWN0TGV2ZWwoaXRlbS5sZXZlbCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy92c2NvZGUvZG9jcy9wZXJtaXNzaW9ucycpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4geyB0cmlnZ2VyRWxlbWVudC5mb2N1cygpOyB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBsaXN0T3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zID0geyBtaW5XaWR0aDogMjU1IH07XG5cdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3c8SVBlcm1pc3Npb25JdGVtPihcblx0XHRcdCdwZXJtaXNzaW9uUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR7XG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3Blcm1pc3Npb25QaWNrZXIuYXJpYUxhYmVsJywgXCJQZXJtaXNzaW9uIFBpY2tlclwiKSxcblx0XHRcdH0sXG5cdFx0XHRsaXN0T3B0aW9ucyxcblx0XHQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9zZWxlY3RMZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYXdhaXQgbWF5YmVDb25maXJtRWxldmF0ZWRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwsIHRoaXMuZGlhbG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwge1xuXHRcdFx0ZGVmYXVsdFNldHRpbmdLZXk6IHRoaXMuX2RlbGVnYXRlLmRlZmF1bHRTZXR0aW5nS2V5LFxuXHRcdFx0bGV2ZWxMYWJlbDogdGhpcy5fZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCkubGFiZWwsXG5cdFx0fSkpIHtcblx0XHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdGlkOiAnTmV3Q2hhdFBlcm1pc3Npb25QaWNrZXInLFxuXHRcdFx0XHRuYW1lOiAnTmV3Q2hhdFBlcm1pc3Npb25QaWNrZXInLFxuXHRcdFx0XHRvcHRpb25JZEJlZm9yZTogdGhpcy5fY3VycmVudExldmVsLFxuXHRcdFx0XHRvcHRpb25JZEFmdGVyOiB0aGlzLl9jdXJyZW50TGV2ZWwsXG5cdFx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9wdGlvbkxhYmVsQWZ0ZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNQSUk6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdGlkOiAnTmV3Q2hhdFBlcm1pc3Npb25QaWNrZXInLFxuXHRcdFx0bmFtZTogJ05ld0NoYXRQZXJtaXNzaW9uUGlja2VyJyxcblx0XHRcdG9wdGlvbklkQmVmb3JlOiB0aGlzLl9jdXJyZW50TGV2ZWwsXG5cdFx0XHRvcHRpb25JZEFmdGVyOiBsZXZlbCxcblx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25MYWJlbEFmdGVyOiB1bmRlZmluZWQsXG5cdFx0XHRpc1BJSTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jdXJyZW50TGV2ZWwgPSBsZXZlbDtcblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXHRcdHRoaXMuX2RlbGVnYXRlLnNldFBlcm1pc3Npb25MZXZlbChsZXZlbCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyTGFiZWwodHJpZ2dlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRyaWdnZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRyaWdnZXIpO1xuXHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9nZXRQZXJtaXNzaW9uTGV2ZWxNZXRhKHRoaXMuX2N1cnJlbnRMZXZlbCk7XG5cblx0XHRkb20uYXBwZW5kKHRyaWdnZXIsIHJlbmRlckljb24obWV0YS5pY29uKSk7XG5cdFx0Y29uc3QgbGFiZWxTcGFuID0gZG9tLmFwcGVuZCh0cmlnZ2VyLCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJykpO1xuXHRcdGxhYmVsU3Bhbi50ZXh0Q29udGVudCA9IG1ldGEubGFiZWw7XG5cblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2dldFBlcm1pc3Npb25MZXZlbEhvdmVyKHRoaXMuX2N1cnJlbnRMZXZlbCwgbWV0YSk7XG5cdFx0dHJpZ2dlci5hcmlhTGFiZWwgPSBob3ZlclxuXHRcdFx0PyBsb2NhbGl6ZSgncGVybWlzc2lvblBpY2tlci50cmlnZ2VyQXJpYUxhYmVsV2l0aERlc2NyaXB0aW9uJywgXCJQaWNrIFBlcm1pc3Npb24gTGV2ZWwsIHswfSwgezF9XCIsIG1ldGEubGFiZWwsIGhvdmVyKVxuXHRcdFx0OiBsb2NhbGl6ZSgncGVybWlzc2lvblBpY2tlci50cmlnZ2VyQXJpYUxhYmVsJywgXCJQaWNrIFBlcm1pc3Npb24gTGV2ZWwsIHswfVwiLCBtZXRhLmxhYmVsKTtcblxuXHRcdHRyaWdnZXIuY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsIHRoaXMuX2N1cnJlbnRMZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfHwgdGhpcy5fY3VycmVudExldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkKTtcblx0XHR0cmlnZ2VyLmNsYXNzTGlzdC50b2dnbGUoJ2luZm8nLCB0aGlzLl9jdXJyZW50TGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UGVybWlzc2lvbkxldmVsSG92ZXIobGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwsIG1ldGE6IElQZXJtaXNzaW9uTGV2ZWxNZXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVsZWdhdGUuZ2V0UGVybWlzc2lvbkxldmVsSG92ZXI/LihsZXZlbCwgbWV0YSkgPz8gbWV0YS5ob3Zlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IElQZXJtaXNzaW9uTGV2ZWxNZXRhIHtcblx0XHRjb25zdCBtZXRhID0gZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCk7XG5cdFx0cmV0dXJuIHRoaXMuX2RlbGVnYXRlLmdldFBlcm1pc3Npb25MZXZlbE1ldGEobGV2ZWwsIG1ldGEpO1xuXHR9XG59XG5cbi8qKlxuICogRGVmYXVsdC1Db3BpbG90IHtAbGluayBJUGVybWlzc2lvblBpY2tlckRlbGVnYXRlfTogd3JpdGVzIHRoZSB1c2VyJ3MgY2hvc2VuXG4gKiBsZXZlbCBiYWNrIHRvIHRoZSBhY3RpdmUge0BsaW5rIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcn0gc2Vzc2lvbiwgYW5kXG4gKiBleHBvc2VzIHRoYXQgc2Vzc2lvbidzIGBwZXJtaXNzaW9uTGV2ZWxgIG9ic2VydmFibGUgc28gdGhlIHBpY2tlcidzXG4gKiB0cmlnZ2VyIGxhYmVsIHRyYWNrcyB0aGUgc2Vzc2lvbidzIGN1cnJlbnQgbGV2ZWwgcmF0aGVyIHRoYW4gcmVzZXR0aW5nIHRvXG4gKiB0aGUgY29uZmlndXJlZCBkZWZhdWx0IG9uIGV2ZXJ5IHJlLXJlbmRlci5cbiAqL1xuZXhwb3J0IGNsYXNzIENvcGlsb3RQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSB7XG5cblx0cmVhZG9ubHkgY3VycmVudFBlcm1pc3Npb25MZXZlbDogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZD47XG5cblx0Z2V0UGVybWlzc2lvbkxldmVsTWV0YShfbGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwsIG1ldGE6IElQZXJtaXNzaW9uTGV2ZWxNZXRhKTogSVBlcm1pc3Npb25MZXZlbE1ldGEge1xuXHRcdHJldHVybiBtZXRhO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+LFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmN1cnJlbnRQZXJtaXNzaW9uTGV2ZWwgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAoIShwcm92aWRlciBpbnN0YW5jZW9mIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKT8ucGVybWlzc2lvbkxldmVsLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHRcdGlmIChwcm92aWRlciBpbnN0YW5jZW9mIENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcikge1xuXHRcdFx0Y29uc3QgY2hhdFNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdGlmICghY2hhdFNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoYXRTZXNzaW9uLnNldE9wdGlvbikge1xuXHRcdFx0XHRjaGF0U2Vzc2lvbi5zZXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpO1xuXHRcdFx0XHRjaGF0U2Vzc2lvbi5zZXRPcHRpb24oUEVSTUlTU0lPTl9MRVZFTF9PUFRJT05fSUQsIGxldmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihjaGF0U2Vzc2lvbi5yZXNvdXJjZSwgUEVSTUlTU0lPTl9MRVZFTF9PUFRJT05fSUQsIGxldmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFNBQVMsZUFBNEI7QUFFOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQW9GO0FBQzdGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CLHFCQUFxQiw2QkFBNkI7QUFDOUUsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxtQ0FBbUM7QUFFNUMsTUFBTSw2QkFBNkI7QUE2RDVCLE1BQU0sNEJBQTREO0FBQUEsRUFDeEUsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQUEsRUFDcEIsb0JBQW9CO0FBQ3JCO0FBRU8sU0FBUyx1QkFBdUIsT0FBa0Q7QUFDeEYsVUFBUSxPQUFPO0FBQUEsSUFDZCxLQUFLLG9CQUFvQjtBQUN4QixhQUFPO0FBQUEsUUFDTixPQUFPLFNBQVMsd0JBQXdCLHNCQUFzQjtBQUFBLFFBQzlELFFBQVEsU0FBUyxnQ0FBZ0MscUNBQXFDO0FBQUEsUUFDdEYsTUFBTSxRQUFRO0FBQUEsUUFDZCxPQUFPLFNBQVMsb0NBQW9DLHdGQUF3RjtBQUFBLE1BQzdJO0FBQUEsSUFDRCxLQUFLLG9CQUFvQjtBQUN4QixhQUFPO0FBQUEsUUFDTixPQUFPLFNBQVMsMkJBQTJCLFdBQVc7QUFBQSxRQUN0RCxRQUFRLFNBQVMsbUNBQW1DLGdDQUFnQztBQUFBLFFBQ3BGLE1BQU0sUUFBUTtBQUFBLE1BQ2Y7QUFBQSxJQUNELEtBQUssb0JBQW9CO0FBQ3hCLGFBQU87QUFBQSxRQUNOLE9BQU8sU0FBUyx5QkFBeUIscUJBQXFCO0FBQUEsUUFDOUQsUUFBUSxTQUFTLGlDQUFpQyw0Q0FBNEM7QUFBQSxRQUM5RixNQUFNLFFBQVE7QUFBQSxRQUNkLE9BQU8sU0FBUyxxQ0FBcUMsZ0dBQWdHO0FBQUEsTUFDdEo7QUFBQSxJQUNELEtBQUssb0JBQW9CO0FBQUEsSUFDekI7QUFDQyxhQUFPO0FBQUEsUUFDTixPQUFPLFNBQVMsdUJBQXVCLG1CQUFtQjtBQUFBLFFBQzFELFFBQVEsU0FBUywrQkFBK0IseUNBQXlDO0FBQUEsUUFDekYsTUFBTSxRQUFRO0FBQUEsTUFDZjtBQUFBLEVBQ0Y7QUFDRDtBQVNPLElBQU0sbUJBQU4sY0FBK0IsV0FBVztBQUFBLEVBTWhELFlBQ29CLFdBQ3NCLHFCQUNDLHNCQUNQLGVBQ0EsZUFDQyxnQkFDRSxrQkFDSixjQUNqQztBQUNELFVBQU07QUFUYTtBQUNzQjtBQUNDO0FBQ1A7QUFDQTtBQUNDO0FBQ0U7QUFDSjtBQVpuQyxTQUFVLGdCQUFxQyxvQkFBb0I7QUFFbkUsU0FBbUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQUEsRUFhNUU7QUFBQSxFQUVBLE9BQU8sV0FBcUM7QUFDM0MsU0FBSyxtQkFBbUIsTUFBTTtBQU05QixVQUFNLG1CQUFtQixLQUFLLHFCQUFxQixRQUFpQixrQkFBa0IsaUJBQWlCLEVBQUUsZ0JBQWdCO0FBQ3pILFVBQU0sb0JBQW9CLEtBQUsscUJBQXFCLFNBQWlCLGtCQUFrQixzQkFBc0I7QUFDN0csVUFBTSxlQUFlLHNCQUFzQixpQkFBaUIsSUFBSSxvQkFBb0Isb0JBQW9CO0FBQ3hHLFNBQUssZ0JBQWdCLG1CQUFtQixvQkFBb0IsVUFBVTtBQUV0RSxVQUFNLE9BQU8sSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLDREQUE0RCxDQUFDO0FBQ3RHLFNBQUssbUJBQW1CLElBQUksRUFBRSxTQUFTLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUU1RCxVQUFNLFVBQVUsSUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLGdCQUFnQixDQUFDO0FBQ3hELFlBQVEsV0FBVztBQUNuQixZQUFRLE9BQU87QUFDZixTQUFLLGtCQUFrQjtBQUV2QixTQUFLLG9CQUFvQixPQUFPO0FBQ2hDLFFBQUksS0FBSyxVQUFVLHlCQUF5QjtBQUMzQyxXQUFLLG1CQUFtQixJQUFJLEtBQUssYUFBYSxrQkFBa0IsU0FBUyxNQUFNO0FBQzlFLGNBQU0sT0FBTyxLQUFLLHdCQUF3QixLQUFLLGFBQWE7QUFDNUQsZUFBTyxFQUFFLFNBQVMsS0FBSyx5QkFBeUIsS0FBSyxlQUFlLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDakYsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFNBQUssbUJBQW1CLElBQUksUUFBUSxVQUFVLE9BQU8sQ0FBQztBQUN0RCxlQUFXLGFBQWEsQ0FBQyxJQUFJLFVBQVUsT0FBTyxlQUFlLEdBQUcsR0FBRztBQUNsRSxXQUFLLG1CQUFtQixJQUFJLElBQUksc0JBQXNCLFNBQVMsV0FBVyxDQUFDLE1BQU07QUFDaEYsWUFBSSxZQUFZLEtBQUssR0FBRyxJQUFJO0FBQzVCLGFBQUssV0FBVztBQUFBLE1BQ2pCLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxTQUFLLG1CQUFtQixJQUFJLElBQUksc0JBQXNCLFNBQVMsSUFBSSxVQUFVLFVBQVUsQ0FBQyxNQUFNO0FBQzdGLFVBQUksRUFBRSxRQUFRLFdBQVcsRUFBRSxRQUFRLEtBQUs7QUFDdkMsWUFBSSxZQUFZLEtBQUssR0FBRyxJQUFJO0FBQzVCLGFBQUssV0FBVztBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLHlCQUF5QixLQUFLLFVBQVU7QUFDOUMsUUFBSSx3QkFBd0I7QUFDM0IsV0FBSyxtQkFBbUIsSUFBSSxRQUFRLFlBQVU7QUFDN0MsY0FBTSxRQUFRLHVCQUF1QixLQUFLLE1BQU07QUFDaEQsWUFBSSxVQUFVLFFBQVc7QUFDeEI7QUFBQSxRQUNEO0FBQ0EsYUFBSyxnQkFBZ0I7QUFDckIsYUFBSyxvQkFBb0IsT0FBTztBQUFBLE1BQ2pDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxVQUFNLGVBQWUsS0FBSyxVQUFVO0FBQ3BDLFFBQUksY0FBYztBQUNqQixXQUFLLG1CQUFtQixJQUFJLFFBQVEsWUFBVTtBQUM3QyxjQUFNLFVBQVUsYUFBYSxLQUFLLE1BQU07QUFDeEMsYUFBSyxNQUFNLFVBQVUsVUFBVSxLQUFLO0FBT3BDLGtCQUFVLE1BQU0sVUFBVSxVQUFVLEtBQUs7QUFBQSxNQUMxQyxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGFBQW1CO0FBQ2xCLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixLQUFLLG9CQUFvQixXQUFXO0FBQ2hFO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLEtBQUsscUJBQXFCLFFBQWlCLGtCQUFrQixpQkFBaUIsRUFBRSxnQkFBZ0I7QUFFekgsVUFBTSxTQUFTLEtBQUssVUFBVSxtQkFBbUI7QUFDakQsVUFBTSxRQUE0QyxPQUFPLElBQUksV0FBUztBQUNyRSxZQUFNLE9BQU8sS0FBSyx3QkFBd0IsS0FBSztBQUcvQyxZQUFNLFdBQVcsVUFBVSxvQkFBb0IsV0FBVztBQUMxRCxZQUFNLFFBQVEsS0FBSyxVQUFVLDBCQUN6QixXQUFXLFNBQVMsaUNBQWlDLCtCQUErQixJQUFJLEtBQUsseUJBQXlCLE9BQU8sSUFBSSxJQUNsSSxLQUFLO0FBQ1IsYUFBTztBQUFBLFFBQ04sTUFBTSxtQkFBbUI7QUFBQSxRQUN6QixPQUFPLEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLElBQUksTUFBTSxLQUFLLEtBQUs7QUFBQSxRQUNyRSxNQUFNO0FBQUEsVUFDTDtBQUFBLFVBQ0EsT0FBTyxLQUFLO0FBQUEsVUFDWixNQUFNLEtBQUs7QUFBQSxVQUNYLFNBQVMsS0FBSyxrQkFBa0I7QUFBQSxRQUNqQztBQUFBLFFBQ0EsT0FBTyxLQUFLO0FBQUEsUUFDWixRQUFRLEtBQUs7QUFBQSxRQUNiLEdBQUksUUFBUSxFQUFFLE9BQU8sRUFBRSxTQUFTLE1BQU0sRUFBRSxJQUFJLENBQUM7QUFBQSxRQUM3QztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLEtBQUs7QUFBQSxNQUNWLE1BQU0sbUJBQW1CO0FBQUEsTUFDekIsT0FBTztBQUFBLE1BQ1AsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUNELFVBQU0sS0FBSztBQUFBLE1BQ1YsTUFBTSxtQkFBbUI7QUFBQSxNQUN6QixPQUFPLEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLElBQUksTUFBTSxRQUFRLE1BQU07QUFBQSxNQUN6RSxNQUFNO0FBQUEsUUFDTCxPQUFPLFNBQVMseUJBQXlCLDhCQUE4QjtBQUFBLFFBQ3ZFLE1BQU0sUUFBUTtBQUFBLFFBQ2QsU0FBUztBQUFBLE1BQ1Y7QUFBQSxNQUNBLE9BQU8sU0FBUyx5QkFBeUIsOEJBQThCO0FBQUEsTUFDdkUsVUFBVTtBQUFBLE1BQ1YsVUFBVTtBQUFBLElBQ1gsQ0FBQztBQUVELFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsVUFBTSxXQUFpRDtBQUFBLE1BQ3RELFVBQVUsT0FBTyxTQUFTO0FBQ3pCLGFBQUssb0JBQW9CLEtBQUs7QUFDOUIsWUFBSSxLQUFLLE9BQU87QUFDZixnQkFBTSxLQUFLLGFBQWEsS0FBSyxLQUFLO0FBQUEsUUFDbkMsT0FBTztBQUNOLGdCQUFNLEtBQUssY0FBYyxLQUFLLElBQUksTUFBTSx3Q0FBd0MsQ0FBQztBQUFBLFFBQ2xGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsUUFBUSxNQUFNO0FBQUUsdUJBQWUsTUFBTTtBQUFBLE1BQUc7QUFBQSxJQUN6QztBQUVBLFVBQU0sY0FBa0MsRUFBRSxVQUFVLElBQUk7QUFDeEQsU0FBSyxvQkFBb0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBLENBQUM7QUFBQSxNQUNEO0FBQUEsUUFDQyxvQkFBb0IsTUFBTSxTQUFTLDhCQUE4QixtQkFBbUI7QUFBQSxNQUNyRjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBZ0IsYUFBYSxPQUEyQztBQUN2RSxRQUFJLENBQUMsTUFBTSxvQ0FBb0MsT0FBTyxLQUFLLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxNQUM5RixtQkFBbUIsS0FBSyxVQUFVO0FBQUEsTUFDbEMsWUFBWSxLQUFLLHdCQUF3QixLQUFLLEVBQUU7QUFBQSxJQUNqRCxDQUFDLEdBQUc7QUFDSCxnQ0FBMEIsS0FBSyxrQkFBa0I7QUFBQSxRQUNoRCxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixnQkFBZ0IsS0FBSztBQUFBLFFBQ3JCLGVBQWUsS0FBSztBQUFBLFFBQ3BCLG1CQUFtQjtBQUFBLFFBQ25CLGtCQUFrQjtBQUFBLFFBQ2xCLE9BQU87QUFBQSxNQUNSLENBQUM7QUFDRDtBQUFBLElBQ0Q7QUFFQSw4QkFBMEIsS0FBSyxrQkFBa0I7QUFBQSxNQUNoRCxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCLGVBQWU7QUFBQSxNQUNmLG1CQUFtQjtBQUFBLE1BQ25CLGtCQUFrQjtBQUFBLE1BQ2xCLE9BQU87QUFBQSxJQUNSLENBQUM7QUFFRCxTQUFLLGdCQUFnQjtBQUNyQixTQUFLLG9CQUFvQixLQUFLLGVBQWU7QUFDN0MsU0FBSyxVQUFVLG1CQUFtQixLQUFLO0FBQUEsRUFDeEM7QUFBQSxFQUVRLG9CQUFvQixTQUF3QztBQUNuRSxRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUVBLFFBQUksVUFBVSxPQUFPO0FBQ3JCLFVBQU0sT0FBTyxLQUFLLHdCQUF3QixLQUFLLGFBQWE7QUFFNUQsUUFBSSxPQUFPLFNBQVMsV0FBVyxLQUFLLElBQUksQ0FBQztBQUN6QyxVQUFNLFlBQVksSUFBSSxPQUFPLFNBQVMsSUFBSSxFQUFFLG1DQUFtQyxDQUFDO0FBQ2hGLGNBQVUsY0FBYyxLQUFLO0FBRTdCLFVBQU0sUUFBUSxLQUFLLHlCQUF5QixLQUFLLGVBQWUsSUFBSTtBQUNwRSxZQUFRLFlBQVksUUFDakIsU0FBUyxvREFBb0QsbUNBQW1DLEtBQUssT0FBTyxLQUFLLElBQ2pILFNBQVMscUNBQXFDLDhCQUE4QixLQUFLLEtBQUs7QUFFekYsWUFBUSxVQUFVLE9BQU8sV0FBVyxLQUFLLGtCQUFrQixvQkFBb0IsYUFBYSxLQUFLLGtCQUFrQixvQkFBb0IsUUFBUTtBQUMvSSxZQUFRLFVBQVUsT0FBTyxRQUFRLEtBQUssa0JBQWtCLG9CQUFvQixXQUFXO0FBQUEsRUFDeEY7QUFBQSxFQUVRLHlCQUF5QixPQUE0QixNQUFnRDtBQUM1RyxXQUFPLEtBQUssVUFBVSwwQkFBMEIsT0FBTyxJQUFJLEtBQUssS0FBSztBQUFBLEVBQ3RFO0FBQUEsRUFFVSx3QkFBd0IsT0FBa0Q7QUFDbkYsVUFBTSxPQUFPLHVCQUF1QixLQUFLO0FBQ3pDLFdBQU8sS0FBSyxVQUFVLHVCQUF1QixPQUFPLElBQUk7QUFBQSxFQUN6RDtBQUNEO0FBeE9hLG1CQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZFU7QUFpUE4sSUFBTSxrQ0FBTixjQUE4QyxXQUFnRDtBQUFBLEVBUXBHLFlBQ2tCLFVBQzJCLDJCQUNMLHNCQUN0QztBQUNELFVBQU07QUFKVztBQUMyQjtBQUNMO0FBSXZDLFNBQUsseUJBQXlCLFFBQVEsTUFBTSxZQUFVO0FBQ3JELFlBQU0sVUFBVSxLQUFLLFNBQVMsS0FBSyxNQUFNO0FBQ3pDLFVBQUksQ0FBQyxTQUFTO0FBQ2IsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFdBQVcsS0FBSywwQkFBMEIsWUFBWSxRQUFRLFVBQVU7QUFDOUUsVUFBSSxFQUFFLG9CQUFvQiw4QkFBOEI7QUFDdkQsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLFNBQVMsV0FBVyxRQUFRLFNBQVMsR0FBRyxnQkFBZ0IsS0FBSyxNQUFNO0FBQUEsSUFDM0UsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQXRCQSx1QkFBdUIsUUFBNkIsTUFBa0Q7QUFDckcsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQXNCQSxtQkFBbUIsT0FBa0M7QUFDcEQsVUFBTSxVQUFVLEtBQUssU0FBUyxJQUFJO0FBQ2xDLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLEtBQUssMEJBQTBCLFlBQVksUUFBUSxVQUFVO0FBQzlFLFFBQUksb0JBQW9CLDZCQUE2QjtBQUNwRCxZQUFNLGNBQWMsU0FBUyxXQUFXLFFBQVEsU0FBUztBQUN6RCxVQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFlBQVksV0FBVztBQUMxQixvQkFBWSxtQkFBbUIsS0FBSztBQUNwQyxvQkFBWSxVQUFVLDRCQUE0QixLQUFLO0FBQUEsTUFDeEQsT0FBTztBQUNOLGFBQUsscUJBQXFCLGlCQUFpQixZQUFZLFVBQVUsNEJBQTRCLEtBQUs7QUFBQSxNQUNuRztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUEvQ2Esa0NBQU47QUFBQSxFQVVKO0FBQUEsRUFDQTtBQUFBLEdBWFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
