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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ChatMode, IChatModeService } from "../../../../../workbench/contrib/chat/common/chatModes.js";
import { IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../../../../workbench/contrib/chat/common/model/chatUri.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { Target } from "../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { AICustomizationManagementCommands } from "../../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationManagementSection } from "../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { reportNewChatPickerClosed } from "../../../chat/browser/newChatPickerTelemetry.js";
import { CopilotCLISessionType } from "../../agentHost/browser/baseAgentHostSessionsProvider.js";
let ModePickerModel = class extends Disposable {
  constructor(chatSessionsService, chatModeService) {
    super();
    this.chatSessionsService = chatSessionsService;
    this.chatModeService = chatModeService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._modeChangeListener = this._register(new MutableDisposable());
    this._chatModesDisposable = this._register(new MutableDisposable());
    this._selectedModeId = void 0;
  }
  get selectedMode() {
    if (!this._selectedModeId) {
      return ChatMode.Agent;
    }
    return this._findModeById(this._selectedModeId) ?? ChatMode.Agent;
  }
  get selectedModeId() {
    return this._selectedModeId;
  }
  reset() {
    this._selectedModeId = void 0;
    this._onDidChange.fire();
  }
  setSelectedMode(mode) {
    this._selectedModeId = mode.id;
    this._onDidChange.fire();
  }
  setSession(session, selectedModeId) {
    if (!session) {
      if (!this._sessionResource) {
        return;
      }
      this._sessionResource = void 0;
      this._chatModesDisposable.value = void 0;
      this._chatModes = void 0;
      this._selectedModeId = void 0;
      this._onDidChange.fire();
      return;
    }
    this._setSession(session, selectedModeId);
  }
  getAvailableModes() {
    const sessionType = this._sessionResource ? getChatSessionType(this._sessionResource) : CopilotCLISessionType.id;
    const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType);
    const effectiveTarget = customAgentTarget && customAgentTarget !== Target.Undefined ? customAgentTarget : Target.GitHubCopilot;
    const result = [ChatMode.Agent];
    for (const mode of this._chatModes?.custom ?? []) {
      const target = mode.target.get();
      if (target === effectiveTarget || target === Target.Undefined) {
        const visibility = mode.visibility?.get();
        if (visibility && !visibility.userInvocable) {
          continue;
        }
        result.push(mode);
      }
    }
    return result;
  }
  _setSession(session, selectedModeId) {
    const sessionResource = session.resource;
    if (this._sessionResource?.toString() === sessionResource.toString()) {
      if (this._selectedModeId !== selectedModeId) {
        this._selectedModeId = selectedModeId;
        this._onDidChange.fire();
      }
      return;
    }
    this._sessionResource = sessionResource;
    const modes = this.chatModeService.createModes(sessionResource);
    this._chatModesDisposable.value = modes;
    this._chatModes = modes;
    this._modeChangeListener.value = modes.onDidChange(() => {
      this._onDidChange.fire();
    });
    this._selectedModeId = selectedModeId;
    this._onDidChange.fire();
  }
  _findModeById(id) {
    const mode = this._chatModes?.findModeById(id);
    if (mode) {
      return mode;
    }
    return void 0;
  }
};
ModePickerModel = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IChatModeService)
], ModePickerModel);
let ModePicker = class extends Disposable {
  constructor(modePickerModel, actionWidgetService, commandService, telemetryService) {
    super();
    this.actionWidgetService = actionWidgetService;
    this.commandService = commandService;
    this.telemetryService = telemetryService;
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    this._renderDisposables = this._register(new DisposableStore());
    this._modePickerModel = modePickerModel;
    this._register(this._modePickerModel.onDidChange(() => {
      if (this._triggerElement) {
        this._updateTriggerLabel();
      }
    }));
  }
  /**
   * Resets the selected mode back to the default Agent mode.
   */
  reset() {
    this._modePickerModel.reset();
    this._updateTriggerLabel();
  }
  /**
   * Renders the mode picker trigger button into the given container.
   */
  render(container) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._updateTriggerLabel();
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this._showPicker();
      }
    }));
    return slot;
  }
  _showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const modes = this._modePickerModel.getAvailableModes();
    const items = this._buildItems(modes);
    const triggerElement = this._triggerElement;
    const previousMode = this._modePickerModel.selectedMode;
    const delegate = {
      onSelect: (item) => {
        this.actionWidgetService.hide();
        if (item.kind === "mode") {
          reportNewChatPickerClosed(this.telemetryService, {
            id: "NewChatModePicker",
            optionIdBefore: previousMode.id,
            optionIdAfter: item.mode.id,
            optionLabelBefore: previousMode.label.get(),
            optionLabelAfter: item.mode.label.get(),
            isPII: true
          });
          this._selectMode(item.mode);
        } else {
          this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
        }
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    this.actionWidgetService.show(
      "localModePicker",
      false,
      items,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("modePicker.ariaLabel", "Mode Picker")
      }
    );
  }
  _buildItems(modes) {
    const items = [];
    const selectedModeId = this._modePickerModel.selectedMode.id;
    const agentMode = modes[0];
    items.push({
      kind: ActionListItemKind.Action,
      label: agentMode.label.get(),
      group: { title: "", icon: selectedModeId === agentMode.id ? Codicon.check : Codicon.blank },
      item: { kind: "mode", mode: agentMode }
    });
    const customModes = modes.slice(1);
    if (customModes.length > 0) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
      for (const mode of customModes) {
        items.push({
          kind: ActionListItemKind.Action,
          label: mode.label.get(),
          group: { title: "", icon: selectedModeId === mode.id ? Codicon.check : Codicon.blank },
          item: { kind: "mode", mode }
        });
      }
    }
    items.push({ kind: ActionListItemKind.Separator, label: "" });
    items.push({
      kind: ActionListItemKind.Action,
      label: localize("configureCustomAgents", "Configure Custom Agents..."),
      group: { title: "", icon: Codicon.blank },
      item: { kind: "configure" }
    });
    return items;
  }
  _selectMode(mode) {
    this._modePickerModel.setSelectedMode(mode);
    this._updateTriggerLabel();
    this._onDidSelect.fire(mode);
  }
  _updateTriggerLabel() {
    if (!this._triggerElement) {
      return;
    }
    dom.clearNode(this._triggerElement);
    const selectedMode = this._modePickerModel.selectedMode;
    const icon = selectedMode.icon.get();
    if (icon) {
      dom.append(this._triggerElement, renderIcon(icon));
    }
    const labelSpan = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = selectedMode.label.get();
    this._triggerElement.ariaLabel = localize("modePicker.triggerAriaLabel", "Pick Mode, {0}", selectedMode.label.get());
  }
};
ModePicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, ITelemetryService)
], ModePicker);
export {
  ModePicker,
  ModePickerModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9tb2RlUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3RJdGVtS2luZCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIElDaGF0TW9kZSwgSUNoYXRNb2RlcywgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdFBpY2tlclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q0xJU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9hZ2VudEhvc3QvYnJvd3Nlci9iYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5pbnRlcmZhY2UgSU1vZGVQaWNrZXJJdGVtIHtcblx0cmVhZG9ubHkga2luZDogJ21vZGUnO1xuXHRyZWFkb25seSBtb2RlOiBJQ2hhdE1vZGU7XG59XG5cbmludGVyZmFjZSBJQ29uZmlndXJlUGlja2VySXRlbSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdjb25maWd1cmUnO1xufVxuXG50eXBlIE1vZGVQaWNrZXJJdGVtID0gSU1vZGVQaWNrZXJJdGVtIHwgSUNvbmZpZ3VyZVBpY2tlckl0ZW07XG5cbmV4cG9ydCBjbGFzcyBNb2RlUGlja2VyTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlQ2hhbmdlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRNb2Rlc0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlcyAmIElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIF9zZWxlY3RlZE1vZGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2hhdE1vZGVzOiBJQ2hhdE1vZGVzIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBzZWxlY3RlZE1vZGUoKTogSUNoYXRNb2RlIHtcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGVkTW9kZUlkKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdE1vZGUuQWdlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maW5kTW9kZUJ5SWQodGhpcy5fc2VsZWN0ZWRNb2RlSWQpID8/IENoYXRNb2RlLkFnZW50O1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkTW9kZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGVkTW9kZUlkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TW9kZVNlcnZpY2U6IElDaGF0TW9kZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVJZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRzZXRTZWxlY3RlZE1vZGUobW9kZTogSUNoYXRNb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRNb2RlSWQgPSBtb2RlLmlkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHNldFNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24gfCB1bmRlZmluZWQsIHNlbGVjdGVkTW9kZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdGlmICghdGhpcy5fc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NoYXRNb2Rlc0Rpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jaGF0TW9kZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZE1vZGVJZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRTZXNzaW9uKHNlc3Npb24sIHNlbGVjdGVkTW9kZUlkKTtcblx0fVxuXG5cdGdldEF2YWlsYWJsZU1vZGVzKCk6IElDaGF0TW9kZVtdIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpIDogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkO1xuXHRcdGNvbnN0IGN1c3RvbUFnZW50VGFyZ2V0ID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEN1c3RvbUFnZW50VGFyZ2V0Rm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZVRhcmdldCA9IGN1c3RvbUFnZW50VGFyZ2V0ICYmIGN1c3RvbUFnZW50VGFyZ2V0ICE9PSBUYXJnZXQuVW5kZWZpbmVkID8gY3VzdG9tQWdlbnRUYXJnZXQgOiBUYXJnZXQuR2l0SHViQ29waWxvdDtcblxuXHRcdC8vIEFsd2F5cyBpbmNsdWRlIHRoZSBkZWZhdWx0IEFnZW50IG1vZGUuXG5cdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdE1vZGVbXSA9IFtDaGF0TW9kZS5BZ2VudF07XG5cblx0XHQvLyBBZGQgY3VzdG9tIG1vZGVzIG1hdGNoaW5nIHRoZSB0YXJnZXQgYW5kIHZpc2libGUgdG8gdXNlcnMuXG5cdFx0Zm9yIChjb25zdCBtb2RlIG9mICh0aGlzLl9jaGF0TW9kZXM/LmN1c3RvbSA/PyBbXSkpIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IG1vZGUudGFyZ2V0LmdldCgpO1xuXHRcdFx0aWYgKHRhcmdldCA9PT0gZWZmZWN0aXZlVGFyZ2V0IHx8IHRhcmdldCA9PT0gVGFyZ2V0LlVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCB2aXNpYmlsaXR5ID0gbW9kZS52aXNpYmlsaXR5Py5nZXQoKTtcblx0XHRcdFx0aWYgKHZpc2liaWxpdHkgJiYgIXZpc2liaWxpdHkudXNlckludm9jYWJsZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCBzZWxlY3RlZE1vZGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvbi5yZXNvdXJjZTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpID09PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0aWYgKHRoaXMuX3NlbGVjdGVkTW9kZUlkICE9PSBzZWxlY3RlZE1vZGVJZCkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZE1vZGVJZCA9IHNlbGVjdGVkTW9kZUlkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBtb2RlcyA9IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmNyZWF0ZU1vZGVzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fY2hhdE1vZGVzRGlzcG9zYWJsZS52YWx1ZSA9IG1vZGVzO1xuXHRcdHRoaXMuX2NoYXRNb2RlcyA9IG1vZGVzO1xuXHRcdHRoaXMuX21vZGVDaGFuZ2VMaXN0ZW5lci52YWx1ZSA9IG1vZGVzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVJZCA9IHNlbGVjdGVkTW9kZUlkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNb2RlQnlJZChpZDogc3RyaW5nKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5fY2hhdE1vZGVzPy5maW5kTW9kZUJ5SWQoaWQpO1xuXHRcdGlmIChtb2RlKSB7XG5cdFx0XHRyZXR1cm4gbW9kZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIEEgc2VsZi1jb250YWluZWQgd2lkZ2V0IGZvciBzZWxlY3RpbmcgYSBjaGF0IG1vZGUgKEFnZW50LCBjdXN0b20gYWdlbnRzKVxuICogZm9yIGxvY2FsL0JhY2tncm91bmQgc2Vzc2lvbnMuIFNob3dzIG9ubHkgbW9kZXMgd2hvc2UgdGFyZ2V0IG1hdGNoZXNcbiAqIHRoZSBCYWNrZ3JvdW5kIHNlc3Npb24gdHlwZSdzIGN1c3RvbUFnZW50VGFyZ2V0LlxuICovXG5leHBvcnQgY2xhc3MgTW9kZVBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRNb2RlPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3Q6IEV2ZW50PElDaGF0TW9kZT4gPSB0aGlzLl9vbkRpZFNlbGVjdC5ldmVudDtcblxuXHRwcml2YXRlIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZVBpY2tlck1vZGVsOiBNb2RlUGlja2VyTW9kZWw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bW9kZVBpY2tlck1vZGVsOiBNb2RlUGlja2VyTW9kZWwsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9tb2RlUGlja2VyTW9kZWwgPSBtb2RlUGlja2VyTW9kZWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZVBpY2tlck1vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXRzIHRoZSBzZWxlY3RlZCBtb2RlIGJhY2sgdG8gdGhlIGRlZmF1bHQgQWdlbnQgbW9kZS5cblx0ICovXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVQaWNrZXJNb2RlbC5yZXNldCgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIG1vZGUgcGlja2VyIHRyaWdnZXIgYnV0dG9uIGludG8gdGhlIGdpdmVuIGNvbnRhaW5lci5cblx0ICovXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzbG90ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdCcpKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBzbG90LnJlbW92ZSgpIH0pO1xuXG5cdFx0Y29uc3QgdHJpZ2dlciA9IGRvbS5hcHBlbmQoc2xvdCwgZG9tLiQoJ2EuYWN0aW9uLWxhYmVsJykpO1xuXHRcdHRyaWdnZXIudGFiSW5kZXggPSAwO1xuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50ID0gdHJpZ2dlcjtcblxuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRyaWdnZXIpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCAoZSkgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzbG90O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX21vZGVQaWNrZXJNb2RlbC5nZXRBdmFpbGFibGVNb2RlcygpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9idWlsZEl0ZW1zKG1vZGVzKTtcblxuXHRcdGNvbnN0IHRyaWdnZXJFbGVtZW50ID0gdGhpcy5fdHJpZ2dlckVsZW1lbnQ7XG5cdFx0Y29uc3QgcHJldmlvdXNNb2RlID0gdGhpcy5fbW9kZVBpY2tlck1vZGVsLnNlbGVjdGVkTW9kZTtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxNb2RlUGlja2VySXRlbT4gPSB7XG5cdFx0XHRvblNlbGVjdDogKGl0ZW0pID0+IHtcblx0XHRcdFx0dGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ21vZGUnKSB7XG5cdFx0XHRcdFx0cmVwb3J0TmV3Q2hhdFBpY2tlckNsb3NlZCh0aGlzLnRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGlkOiAnTmV3Q2hhdE1vZGVQaWNrZXInLFxuXHRcdFx0XHRcdFx0b3B0aW9uSWRCZWZvcmU6IHByZXZpb3VzTW9kZS5pZCxcblx0XHRcdFx0XHRcdG9wdGlvbklkQWZ0ZXI6IGl0ZW0ubW9kZS5pZCxcblx0XHRcdFx0XHRcdG9wdGlvbkxhYmVsQmVmb3JlOiBwcmV2aW91c01vZGUubGFiZWwuZ2V0KCksXG5cdFx0XHRcdFx0XHRvcHRpb25MYWJlbEFmdGVyOiBpdGVtLm1vZGUubGFiZWwuZ2V0KCksXG5cdFx0XHRcdFx0XHRpc1BJSTogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RNb2RlKGl0ZW0ubW9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3BlbkVkaXRvciwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4geyB0cmlnZ2VyRWxlbWVudC5mb2N1cygpOyB9LFxuXHRcdH07XG5cblx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2Uuc2hvdzxNb2RlUGlja2VySXRlbT4oXG5cdFx0XHQnbG9jYWxNb2RlUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW0pID0+IGl0ZW0ubGFiZWwgPz8gJycsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ21vZGVQaWNrZXIuYXJpYUxhYmVsJywgXCJNb2RlIFBpY2tlclwiKSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkSXRlbXMobW9kZXM6IElDaGF0TW9kZVtdKTogSUFjdGlvbkxpc3RJdGVtPE1vZGVQaWNrZXJJdGVtPltdIHtcblx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPE1vZGVQaWNrZXJJdGVtPltdID0gW107XG5cblx0XHRjb25zdCBzZWxlY3RlZE1vZGVJZCA9IHRoaXMuX21vZGVQaWNrZXJNb2RlbC5zZWxlY3RlZE1vZGUuaWQ7XG5cblx0XHQvLyBEZWZhdWx0IEFnZW50IG1vZGVcblx0XHRjb25zdCBhZ2VudE1vZGUgPSBtb2Rlc1swXTtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRsYWJlbDogYWdlbnRNb2RlLmxhYmVsLmdldCgpLFxuXHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBzZWxlY3RlZE1vZGVJZCA9PT0gYWdlbnRNb2RlLmlkID8gQ29kaWNvbi5jaGVjayA6IENvZGljb24uYmxhbmsgfSxcblx0XHRcdGl0ZW06IHsga2luZDogJ21vZGUnLCBtb2RlOiBhZ2VudE1vZGUgfSxcblx0XHR9KTtcblxuXHRcdC8vIEN1c3RvbSBtb2RlcyAod2l0aCBzZXBhcmF0b3IgaWYgYW55IGV4aXN0KVxuXHRcdGNvbnN0IGN1c3RvbU1vZGVzID0gbW9kZXMuc2xpY2UoMSk7XG5cdFx0aWYgKGN1c3RvbU1vZGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGUgb2YgY3VzdG9tTW9kZXMpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogbW9kZS5sYWJlbC5nZXQoKSxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IHNlbGVjdGVkTW9kZUlkID09PSBtb2RlLmlkID8gQ29kaWNvbi5jaGVjayA6IENvZGljb24uYmxhbmsgfSxcblx0XHRcdFx0XHRpdGVtOiB7IGtpbmQ6ICdtb2RlJywgbW9kZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb25maWd1cmUgQ3VzdG9tIEFnZW50cyBhY3Rpb25cblx0XHRpdGVtcy5wdXNoKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWw6ICcnIH0pO1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlQ3VzdG9tQWdlbnRzJywgXCJDb25maWd1cmUgQ3VzdG9tIEFnZW50cy4uLlwiKSxcblx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5ibGFuayB9LFxuXHRcdFx0aXRlbTogeyBraW5kOiAnY29uZmlndXJlJyB9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0TW9kZShtb2RlOiBJQ2hhdE1vZGUpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlUGlja2VyTW9kZWwuc2V0U2VsZWN0ZWRNb2RlKG1vZGUpO1xuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJMYWJlbCgpO1xuXHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUobW9kZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHJpZ2dlckVsZW1lbnQpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlID0gdGhpcy5fbW9kZVBpY2tlck1vZGVsLnNlbGVjdGVkTW9kZTtcblx0XHRjb25zdCBpY29uID0gc2VsZWN0ZWRNb2RlLmljb24uZ2V0KCk7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oaWNvbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0gc2VsZWN0ZWRNb2RlLmxhYmVsLmdldCgpO1xuXG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuYXJpYUxhYmVsID0gbG9jYWxpemUoJ21vZGVQaWNrZXIudHJpZ2dlckFyaWFMYWJlbCcsIFwiUGljayBNb2RlLCB7MH1cIiwgc2VsZWN0ZWRNb2RlLmxhYmVsLmdldCgpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMs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LFlBQU0sS0FBSyxFQUFFLE1BQU0sbUJBQW1CLFdBQVcsT0FBTyxHQUFHLENBQUM7QUFDNUQsaUJBQVcsUUFBUSxhQUFhO0FBQy9CLGNBQU0sS0FBSztBQUFBLFVBQ1YsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixPQUFPLEtBQUssTUFBTSxJQUFJO0FBQUEsVUFDdEIsT0FBTyxFQUFFLE9BQU8sSUFBSSxNQUFNLG1CQUFtQixLQUFLLEtBQUssUUFBUSxRQUFRLFFBQVEsTUFBTTtBQUFBLFVBQ3JGLE1BQU0sRUFBRSxNQUFNLFFBQVEsS0FBSztBQUFBLFFBQzVCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUdBLFVBQU0sS0FBSyxFQUFFLE1BQU0sbUJBQW1CLFdBQVcsT0FBTyxHQUFHLENBQUM7QUFDNUQsVUFBTSxLQUFLO0FBQUEsTUFDVixNQUFNLG1CQUFtQjtBQUFBLE1BQ3pCLE9BQU8sU0FBUyx5QkFBeUIsNEJBQTRCO0FBQUEsTUFDckUsT0FBTyxFQUFFLE9BQU8sSUFBSSxNQUFNLFFBQVEsTUFBTTtBQUFBLE1BQ3hDLE1BQU0sRUFBRSxNQUFNLFlBQVk7QUFBQSxJQUMzQixDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFlBQVksTUFBdUI7QUFDMUMsU0FBSyxpQkFBaUIsZ0JBQWdCLElBQUk7QUFDMUMsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxhQUFhLEtBQUssSUFBSTtBQUFBLEVBQzVCO0FBQUEsRUFFUSxzQkFBNEI7QUFDbkMsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQzFCO0FBQUEsSUFDRDtBQUVBLFFBQUksVUFBVSxLQUFLLGVBQWU7QUFFbEMsVUFBTSxlQUFlLEtBQUssaUJBQWlCO0FBQzNDLFVBQU0sT0FBTyxhQUFhLEtBQUssSUFBSTtBQUNuQyxRQUFJLE1BQU07QUFDVCxVQUFJLE9BQU8sS0FBSyxpQkFBaUIsV0FBVyxJQUFJLENBQUM7QUFBQSxJQUNsRDtBQUVBLFVBQU0sWUFBWSxJQUFJLE9BQU8sS0FBSyxpQkFBaUIsSUFBSSxFQUFFLG1DQUFtQyxDQUFDO0FBQzdGLGNBQVUsY0FBYyxhQUFhLE1BQU0sSUFBSTtBQUUvQyxTQUFLLGdCQUFnQixZQUFZLFNBQVMsK0JBQStCLGtCQUFrQixhQUFhLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDcEg7QUFDRDtBQWpMYSxhQUFOO0FBQUEsRUFXSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FiVTsiLAogICJuYW1lcyI6IFtdCn0K
