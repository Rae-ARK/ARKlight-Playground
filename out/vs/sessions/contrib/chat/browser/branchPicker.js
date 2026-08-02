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
import * as dom from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import "./media/branchPicker.css";
const FILTER_THRESHOLD = 10;
let descriptionIdPool = 0;
let BranchPicker = class extends Disposable {
  constructor(_options, _actionWidgetService) {
    super();
    this._options = _options;
    this._actionWidgetService = _actionWidgetService;
    this._renderDisposables = this._register(new DisposableStore());
    this._state = {
      label: localize("branchPicker.select", "Branch"),
      branches: [],
      status: "empty",
      canOpen: false
    };
    this._isOpen = false;
    this._register(toDisposable(() => {
      if (this._isOpen) {
        this._actionWidgetService.hide(true);
      }
    }));
  }
  _renderIsolation(container) {
    const isolation = this._options.isolation;
    if (!isolation) {
      return;
    }
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-isolation-checkbox"));
    if (isolation.slotClassName) {
      slot.classList.add(isolation.slotClassName);
    }
    this._isolationSlot = slot;
    this._renderDisposables.add(toDisposable(() => slot.remove()));
    if (isolation.markTarget) {
      this._renderDisposables.add(isolation.markTarget(slot));
    }
    const row = dom.append(slot, dom.$(".action-label"));
    row.setAttribute("aria-label", isolation.ariaLabel);
    this._isolationRow = row;
    const checkbox = this._renderDisposables.add(new Checkbox(isolation.label, this._isolationState?.checked ?? false, { ...defaultCheckboxStyles, size: 14 }));
    this._isolationCheckbox = checkbox;
    dom.append(row, checkbox.domNode);
    const labelSpan = dom.append(row, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = isolation.label;
    this._renderDisposables.add(checkbox.onChange(() => isolation.onToggle(checkbox.checked)));
    this._renderDisposables.add(Gesture.addTarget(row));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(row, eventType, (e) => {
        if (!checkbox.enabled) {
          return;
        }
        dom.EventHelper.stop(e, true);
        checkbox.checked = !checkbox.checked;
        isolation.onToggle(checkbox.checked);
      }));
    }
    this._updateIsolation();
  }
  _updateIsolation() {
    if (!this._options.isolation || !this._isolationCheckbox || !this._isolationSlot) {
      return;
    }
    const state = this._isolationState;
    const mode = state?.state ?? "disabled";
    this._isolationCheckbox.checked = state?.checked ?? false;
    if (mode === "enabled") {
      this._isolationCheckbox.enable();
    } else {
      this._isolationCheckbox.disable();
      this._isolationCheckbox.domNode.tabIndex = 0;
    }
    this._isolationSlot.classList.toggle("disabled", mode === "disabled");
    this._isolationSlot.classList.toggle("hidden", mode === "hidden");
    const reason = state?.disabledReason;
    if (this._isolationRow) {
      if (mode === "disabled" && reason) {
        this._isolationRow.title = reason;
      } else {
        this._isolationRow.removeAttribute("title");
      }
    }
  }
  render(container) {
    if (this._isOpen) {
      this._actionWidgetService.hide(true);
    }
    this._renderDisposables.clear();
    const renderTarget = this._options.isolation ? dom.append(container, dom.$("span.sessions-chat-branch-picker-group")) : container;
    if (renderTarget !== container) {
      this._renderDisposables.add({ dispose: () => renderTarget.remove() });
    }
    this._renderIsolation(renderTarget);
    const slot = dom.append(renderTarget, dom.$(".sessions-chat-picker-slot"));
    if (this._options.slotClassName) {
      slot.classList.add(this._options.slotClassName);
    }
    this._slotElement = slot;
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    if (this._options.triggerClassName) {
      trigger.classList.add(this._options.triggerClassName);
    }
    trigger.role = "button";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    if (this._options.ariaLive) {
      trigger.setAttribute("aria-live", this._options.ariaLive);
    }
    this._triggerElement = trigger;
    const description = dom.append(slot, dom.$("span.branch-picker-description"));
    if (this._options.descriptionClassName) {
      description.classList.add(this._options.descriptionClassName);
    }
    description.id = `branch-picker-description-${++descriptionIdPool}`;
    trigger.setAttribute("aria-describedby", description.id);
    this._descriptionElement = description;
    this._updateTrigger();
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
  }
  update(state) {
    this._state = state;
    this._isolationState = state.isolation;
    this._updateTrigger();
    this._updateIsolation();
    if (this._isOpen) {
      if (!state.canOpen) {
        this._actionWidgetService.hide(true);
      } else {
        this._actionWidgetService.updateItems(this._getItems());
      }
    }
  }
  showPicker() {
    if (!this._triggerElement || this._actionWidgetService.isVisible || !this._state.canOpen) {
      return;
    }
    const trigger = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this._actionWidgetService.hide();
        if (item.kind === "retry") {
          this._options.onRetry?.();
        } else if (item.name) {
          this._options.onSelectBranch(item.name);
        }
      },
      onHide: () => {
        this._isOpen = false;
        trigger.setAttribute("aria-expanded", "false");
        if (trigger.isConnected) {
          trigger.focus();
        }
      }
    };
    this._isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    const items = this._getItems();
    const branchCount = items.filter((item) => item.item?.kind === "branch" && !item.item.unavailable).length;
    this._actionWidgetService.show(
      this._options.user,
      false,
      items,
      delegate,
      trigger,
      void 0,
      [],
      {
        getAriaLabel: (item) => {
          const label = item.label ?? "";
          return item.item?.unavailable ? localize("branchPicker.unavailableAriaLabel", "{0}, unavailable locally", label) : label;
        },
        getWidgetAriaLabel: () => localize("branchPicker.ariaLabel", "Branch Picker")
      },
      branchCount > FILTER_THRESHOLD ? { showFilter: true, filterPlaceholder: localize("branchPicker.filter", "Filter branches\u2026") } : void 0
    );
  }
  _getItems() {
    switch (this._state.status) {
      case "loading":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.loading", "Loading branches\u2026"),
          disabled: true,
          item: { kind: "branch" }
        }];
      case "error":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.retry", "Retry Loading Branches"),
          group: { title: "", icon: Codicon.refresh },
          disabled: !this._options.onRetry,
          item: { kind: "retry" }
        }];
      case "empty":
        return [{
          kind: ActionListItemKind.Action,
          label: localize("branchPicker.empty", "No local branches"),
          disabled: true,
          item: { kind: "branch" }
        }];
      case "ready":
        return this._state.branches.map((branch) => ({
          kind: ActionListItemKind.Action,
          label: branch.name,
          detail: branch.unavailable ? localize("branchPicker.unavailable", "Unavailable locally") : void 0,
          group: { title: "", icon: branch.unavailable ? Codicon.warning : Codicon.gitBranch },
          item: {
            kind: "branch",
            name: branch.name,
            checked: branch.selected || void 0,
            unavailable: branch.unavailable
          }
        }));
    }
  }
  _updateTrigger() {
    if (!this._triggerElement || !this._slotElement || !this._descriptionElement) {
      return;
    }
    dom.clearNode(this._triggerElement);
    const icon = dom.append(this._triggerElement, renderIcon(Codicon.gitBranch));
    icon.setAttribute("aria-hidden", "true");
    const label = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    if (this._options.labelClassName) {
      label.classList.add(this._options.labelClassName);
    }
    label.textContent = this._state.label;
    if (this._state.showChevron !== false) {
      const chevron = dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
      chevron.setAttribute("aria-hidden", "true");
    }
    const disabled = !this._state.canOpen;
    const renderAsStatic = disabled && this._options.renderDisabledAsStatic === true;
    const reason = this._state.disabledReason;
    this._triggerElement.setAttribute("aria-label", disabled && reason ? localize("branchPicker.disabledAriaLabel", "{0}. {1}", this._state.label, reason) : localize("branchPicker.triggerAriaLabel", "Pick Branch, {0}", this._state.label));
    this._triggerElement.setAttribute("aria-disabled", String(disabled));
    this._triggerElement.setAttribute("aria-busy", String(this._state.status === "loading"));
    this._triggerElement.tabIndex = !disabled || this._options.keepDisabledFocusable && !renderAsStatic ? 0 : -1;
    if (renderAsStatic) {
      this._triggerElement.removeAttribute("role");
      this._triggerElement.removeAttribute("aria-haspopup");
      this._triggerElement.removeAttribute("aria-expanded");
    } else {
      this._triggerElement.setAttribute("role", "button");
      this._triggerElement.setAttribute("aria-haspopup", "listbox");
      this._triggerElement.setAttribute("aria-expanded", String(this._isOpen));
    }
    this._triggerElement.title = disabled && reason ? reason : this._state.label;
    this._descriptionElement.textContent = reason ?? "";
    this._slotElement.classList.toggle("disabled", disabled);
    this._triggerElement.classList.toggle("branch-picker-disabled", disabled);
    this._triggerElement.classList.toggle("branch-picker-missing", this._state.missing === true);
  }
};
BranchPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService)
], BranchPicker);
export {
  BranchPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2JyYW5jaFBpY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9icmFuY2hQaWNrZXIuY3NzJztcblxuY29uc3QgRklMVEVSX1RIUkVTSE9MRCA9IDEwO1xubGV0IGRlc2NyaXB0aW9uSWRQb29sID0gMDtcblxuZXhwb3J0IGludGVyZmFjZSBJQnJhbmNoUGlja2VyQnJhbmNoIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBzZWxlY3RlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVuYXZhaWxhYmxlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJhbmNoUGlja2VyU3RhdGUge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBicmFuY2hlczogcmVhZG9ubHkgSUJyYW5jaFBpY2tlckJyYW5jaFtdO1xuXHRyZWFkb25seSBzdGF0dXM6ICdyZWFkeScgfCAnbG9hZGluZycgfCAnZW1wdHknIHwgJ2Vycm9yJztcblx0cmVhZG9ubHkgY2FuT3BlbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZWRSZWFzb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1pc3Npbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaG93Q2hldnJvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzb2xhdGlvbj86IElCcmFuY2hQaWNrZXJJc29sYXRpb25TdGF0ZTtcbn1cblxuLyoqXG4gKiBTdGF0aWMgY29uZmlndXJhdGlvbiBmb3IgdGhlIG9wdGlvbmFsIGlzb2xhdGlvbiBjaGVja2JveCByZW5kZXJlZCBiZWZvcmUgdGhlIGJyYW5jaCB0cmlnZ2VyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJJc29sYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgYXJpYUxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uVG9nZ2xlOiAoY2hlY2tlZDogYm9vbGVhbikgPT4gdm9pZDtcblx0cmVhZG9ubHkgc2xvdENsYXNzTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbWFya1RhcmdldD86IChlbGVtZW50OiBIVE1MRWxlbWVudCkgPT4gSURpc3Bvc2FibGU7XG59XG5cbi8qKlxuICogUGVyLXVwZGF0ZSBzdGF0ZSBmb3IgdGhlIG9wdGlvbmFsIGlzb2xhdGlvbiBjaGVja2JveC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJhbmNoUGlja2VySXNvbGF0aW9uU3RhdGUge1xuXHRyZWFkb25seSBjaGVja2VkOiBib29sZWFuO1xuXHRyZWFkb25seSBzdGF0ZTogJ2VuYWJsZWQnIHwgJ2Rpc2FibGVkJyB8ICdoaWRkZW4nO1xuXHRyZWFkb25seSBkaXNhYmxlZFJlYXNvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJhbmNoUGlja2VyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHVzZXI6IHN0cmluZztcblx0cmVhZG9ubHkgb25TZWxlY3RCcmFuY2g6IChicmFuY2g6IHN0cmluZykgPT4gdm9pZDtcblx0cmVhZG9ubHkgb25SZXRyeT86ICgpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHNsb3RDbGFzc05hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRyaWdnZXJDbGFzc05hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsQ2xhc3NOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbkNsYXNzTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkga2VlcERpc2FibGVkRm9jdXNhYmxlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVuZGVyRGlzYWJsZWRBc1N0YXRpYz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFyaWFMaXZlPzogJ29mZicgfCAncG9saXRlJyB8ICdhc3NlcnRpdmUnO1xuXHRyZWFkb25seSBpc29sYXRpb24/OiBJQnJhbmNoUGlja2VySXNvbGF0aW9uT3B0aW9ucztcbn1cblxuaW50ZXJmYWNlIElCcmFuY2hQaWNrZXJJdGVtIHtcblx0cmVhZG9ubHkga2luZDogJ2JyYW5jaCcgfCAncmV0cnknO1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBjaGVja2VkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdW5hdmFpbGFibGU/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFNoYXJlZCBicmFuY2ggdHJpZ2dlciBhbmQgQWN0aW9uV2lkZ2V0IHVzZWQgYnkgbmV3LXNlc3Npb24gYW5kIGF1dG9tYXRpb24gc3VyZmFjZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcmFuY2hQaWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9zdGF0ZTogSUJyYW5jaFBpY2tlclN0YXRlID0ge1xuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLnNlbGVjdCcsIFwiQnJhbmNoXCIpLFxuXHRcdGJyYW5jaGVzOiBbXSxcblx0XHRzdGF0dXM6ICdlbXB0eScsXG5cdFx0Y2FuT3BlbjogZmFsc2UsXG5cdH07XG5cdHByaXZhdGUgX3Nsb3RFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHJpZ2dlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc09wZW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNvbGF0aW9uU2xvdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzb2xhdGlvblJvdzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzb2xhdGlvbkNoZWNrYm94OiBDaGVja2JveCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNvbGF0aW9uU3RhdGU6IElCcmFuY2hQaWNrZXJJc29sYXRpb25TdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQnJhbmNoUGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc09wZW4pIHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcklzb2xhdGlvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gdGhpcy5fb3B0aW9ucy5pc29sYXRpb247XG5cdFx0aWYgKCFpc29sYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzbG90ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdC5zZXNzaW9ucy1jaGF0LWlzb2xhdGlvbi1jaGVja2JveCcpKTtcblx0XHRpZiAoaXNvbGF0aW9uLnNsb3RDbGFzc05hbWUpIHtcblx0XHRcdHNsb3QuY2xhc3NMaXN0LmFkZChpc29sYXRpb24uc2xvdENsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2lzb2xhdGlvblNsb3QgPSBzbG90O1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2xvdC5yZW1vdmUoKSkpO1xuXHRcdGlmIChpc29sYXRpb24ubWFya1RhcmdldCkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGlzb2xhdGlvbi5tYXJrVGFyZ2V0KHNsb3QpKTtcblx0XHR9XG5cblx0XHRjb25zdCByb3cgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCcuYWN0aW9uLWxhYmVsJykpO1xuXHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBpc29sYXRpb24uYXJpYUxhYmVsKTtcblx0XHR0aGlzLl9pc29sYXRpb25Sb3cgPSByb3c7XG5cblx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3goaXNvbGF0aW9uLmxhYmVsLCB0aGlzLl9pc29sYXRpb25TdGF0ZT8uY2hlY2tlZCA/PyBmYWxzZSwgeyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMsIHNpemU6IDE0IH0pKTtcblx0XHR0aGlzLl9pc29sYXRpb25DaGVja2JveCA9IGNoZWNrYm94O1xuXHRcdGRvbS5hcHBlbmQocm93LCBjaGVja2JveC5kb21Ob2RlKTtcblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBpc29sYXRpb24ubGFiZWw7XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4gaXNvbGF0aW9uLm9uVG9nZ2xlKGNoZWNrYm94LmNoZWNrZWQpKSk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHJvdykpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3csIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGlmICghY2hlY2tib3guZW5hYmxlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9ICFjaGVja2JveC5jaGVja2VkO1xuXHRcdFx0XHRpc29sYXRpb24ub25Ub2dnbGUoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlSXNvbGF0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJc29sYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9vcHRpb25zLmlzb2xhdGlvbiB8fCAhdGhpcy5faXNvbGF0aW9uQ2hlY2tib3ggfHwgIXRoaXMuX2lzb2xhdGlvblNsb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2lzb2xhdGlvblN0YXRlO1xuXHRcdGNvbnN0IG1vZGUgPSBzdGF0ZT8uc3RhdGUgPz8gJ2Rpc2FibGVkJztcblx0XHR0aGlzLl9pc29sYXRpb25DaGVja2JveC5jaGVja2VkID0gc3RhdGU/LmNoZWNrZWQgPz8gZmFsc2U7XG5cdFx0aWYgKG1vZGUgPT09ICdlbmFibGVkJykge1xuXHRcdFx0dGhpcy5faXNvbGF0aW9uQ2hlY2tib3guZW5hYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lzb2xhdGlvbkNoZWNrYm94LmRpc2FibGUoKTtcblx0XHRcdC8vIEtlZXAgZm9jdXNhYmxlIHNvIGtleWJvYXJkIHVzZXJzIGNhbiBkaXNjb3ZlciB0aGUgZGlzYWJsZWQgcmVhc29uIHZpYSB0b29sdGlwXG5cdFx0XHR0aGlzLl9pc29sYXRpb25DaGVja2JveC5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR9XG5cdFx0dGhpcy5faXNvbGF0aW9uU2xvdC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIG1vZGUgPT09ICdkaXNhYmxlZCcpO1xuXHRcdHRoaXMuX2lzb2xhdGlvblNsb3QuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgbW9kZSA9PT0gJ2hpZGRlbicpO1xuXG5cdFx0Y29uc3QgcmVhc29uID0gc3RhdGU/LmRpc2FibGVkUmVhc29uO1xuXHRcdGlmICh0aGlzLl9pc29sYXRpb25Sb3cpIHtcblx0XHRcdGlmIChtb2RlID09PSAnZGlzYWJsZWQnICYmIHJlYXNvbikge1xuXHRcdFx0XHR0aGlzLl9pc29sYXRpb25Sb3cudGl0bGUgPSByZWFzb247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9pc29sYXRpb25Sb3cucmVtb3ZlQXR0cmlidXRlKCd0aXRsZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzT3Blbikge1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgcmVuZGVyVGFyZ2V0ID0gdGhpcy5fb3B0aW9ucy5pc29sYXRpb25cblx0XHRcdD8gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtYnJhbmNoLXBpY2tlci1ncm91cCcpKVxuXHRcdFx0OiBjb250YWluZXI7XG5cdFx0aWYgKHJlbmRlclRhcmdldCAhPT0gY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiByZW5kZXJUYXJnZXQucmVtb3ZlKCkgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVySXNvbGF0aW9uKHJlbmRlclRhcmdldCk7XG5cblx0XHRjb25zdCBzbG90ID0gZG9tLmFwcGVuZChyZW5kZXJUYXJnZXQsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1waWNrZXItc2xvdCcpKTtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5zbG90Q2xhc3NOYW1lKSB7XG5cdFx0XHRzbG90LmNsYXNzTGlzdC5hZGQodGhpcy5fb3B0aW9ucy5zbG90Q2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0dGhpcy5fc2xvdEVsZW1lbnQgPSBzbG90O1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNsb3QucmVtb3ZlKCkgfSk7XG5cblx0XHRjb25zdCB0cmlnZ2VyID0gZG9tLmFwcGVuZChzbG90LCBkb20uJCgnYS5hY3Rpb24tbGFiZWwnKSk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudHJpZ2dlckNsYXNzTmFtZSkge1xuXHRcdFx0dHJpZ2dlci5jbGFzc0xpc3QuYWRkKHRoaXMuX29wdGlvbnMudHJpZ2dlckNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdHRyaWdnZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2xpc3Rib3gnKTtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmFyaWFMaXZlKSB7XG5cdFx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgdGhpcy5fb3B0aW9ucy5hcmlhTGl2ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50ID0gdHJpZ2dlcjtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZG9tLmFwcGVuZChzbG90LCBkb20uJCgnc3Bhbi5icmFuY2gtcGlja2VyLWRlc2NyaXB0aW9uJykpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmRlc2NyaXB0aW9uQ2xhc3NOYW1lKSB7XG5cdFx0XHRkZXNjcmlwdGlvbi5jbGFzc0xpc3QuYWRkKHRoaXMuX29wdGlvbnMuZGVzY3JpcHRpb25DbGFzc05hbWUpO1xuXHRcdH1cblx0XHRkZXNjcmlwdGlvbi5pZCA9IGBicmFuY2gtcGlja2VyLWRlc2NyaXB0aW9uLSR7KytkZXNjcmlwdGlvbklkUG9vbH1gO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWRlc2NyaWJlZGJ5JywgZGVzY3JpcHRpb24uaWQpO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudCA9IGRlc2NyaXB0aW9uO1xuXG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlcigpO1xuXG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRyaWdnZXIpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbZG9tLkV2ZW50VHlwZS5DTElDSywgVG91Y2hFdmVudFR5cGUuVGFwXSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodHJpZ2dlciwgZXZlbnRUeXBlLCBlID0+IHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLnNob3dQaWNrZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGUoc3RhdGU6IElCcmFuY2hQaWNrZXJTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5faXNvbGF0aW9uU3RhdGUgPSBzdGF0ZS5pc29sYXRpb247XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlcigpO1xuXHRcdHRoaXMuX3VwZGF0ZUlzb2xhdGlvbigpO1xuXHRcdGlmICh0aGlzLl9pc09wZW4pIHtcblx0XHRcdGlmICghc3RhdGUuY2FuT3Blbikge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnVwZGF0ZUl0ZW1zKHRoaXMuX2dldEl0ZW1zKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHNob3dQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCB8fCB0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSB8fCAhdGhpcy5fc3RhdGUuY2FuT3Blbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQnJhbmNoUGlja2VySXRlbT4gPSB7XG5cdFx0XHRvblNlbGVjdDogaXRlbSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSAncmV0cnknKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3B0aW9ucy5vblJldHJ5Py4oKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpdGVtLm5hbWUpIHtcblx0XHRcdFx0XHR0aGlzLl9vcHRpb25zLm9uU2VsZWN0QnJhbmNoKGl0ZW0ubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5faXNPcGVuID0gZmFsc2U7XG5cdFx0XHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdGlmICh0cmlnZ2VyLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0dHJpZ2dlci5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0aGlzLl9pc09wZW4gPSB0cnVlO1xuXHRcdHRyaWdnZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2dldEl0ZW1zKCk7XG5cdFx0Y29uc3QgYnJhbmNoQ291bnQgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLml0ZW0/LmtpbmQgPT09ICdicmFuY2gnICYmICFpdGVtLml0ZW0udW5hdmFpbGFibGUpLmxlbmd0aDtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3coXG5cdFx0XHR0aGlzLl9vcHRpb25zLnVzZXIsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHR0cmlnZ2VyLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHR7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogaXRlbSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBpdGVtLmxhYmVsID8/ICcnO1xuXHRcdFx0XHRcdHJldHVybiBpdGVtLml0ZW0/LnVuYXZhaWxhYmxlXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdicmFuY2hQaWNrZXIudW5hdmFpbGFibGVBcmlhTGFiZWwnLCBcInswfSwgdW5hdmFpbGFibGUgbG9jYWxseVwiLCBsYWJlbClcblx0XHRcdFx0XHRcdDogbGFiZWw7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5hcmlhTGFiZWwnLCBcIkJyYW5jaCBQaWNrZXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0YnJhbmNoQ291bnQgPiBGSUxURVJfVEhSRVNIT0xEXG5cdFx0XHRcdD8geyBzaG93RmlsdGVyOiB0cnVlLCBmaWx0ZXJQbGFjZWhvbGRlcjogbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5maWx0ZXInLCBcIkZpbHRlciBicmFuY2hlc1x1MjAyNlwiKSB9XG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJdGVtcygpOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08SUJyYW5jaFBpY2tlckl0ZW0+W10ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUuc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdsb2FkaW5nJzpcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2JyYW5jaFBpY2tlci5sb2FkaW5nJywgXCJMb2FkaW5nIGJyYW5jaGVzXHUyMDI2XCIpLFxuXHRcdFx0XHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGl0ZW06IHsga2luZDogJ2JyYW5jaCcgfSxcblx0XHRcdFx0fV07XG5cdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicmFuY2hQaWNrZXIucmV0cnknLCBcIlJldHJ5IExvYWRpbmcgQnJhbmNoZXNcIiksXG5cdFx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLnJlZnJlc2ggfSxcblx0XHRcdFx0XHRkaXNhYmxlZDogIXRoaXMuX29wdGlvbnMub25SZXRyeSxcblx0XHRcdFx0XHRpdGVtOiB7IGtpbmQ6ICdyZXRyeScgfSxcblx0XHRcdFx0fV07XG5cdFx0XHRjYXNlICdlbXB0eSc6XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdicmFuY2hQaWNrZXIuZW1wdHknLCBcIk5vIGxvY2FsIGJyYW5jaGVzXCIpLFxuXHRcdFx0XHRcdGRpc2FibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGl0ZW06IHsga2luZDogJ2JyYW5jaCcgfSxcblx0XHRcdFx0fV07XG5cdFx0XHRjYXNlICdyZWFkeSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdGF0ZS5icmFuY2hlcy5tYXAoYnJhbmNoID0+ICh7XG5cdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRsYWJlbDogYnJhbmNoLm5hbWUsXG5cdFx0XHRcdFx0ZGV0YWlsOiBicmFuY2gudW5hdmFpbGFibGUgPyBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLnVuYXZhaWxhYmxlJywgXCJVbmF2YWlsYWJsZSBsb2NhbGx5XCIpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogYnJhbmNoLnVuYXZhaWxhYmxlID8gQ29kaWNvbi53YXJuaW5nIDogQ29kaWNvbi5naXRCcmFuY2ggfSxcblx0XHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdG5hbWU6IGJyYW5jaC5uYW1lLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZDogYnJhbmNoLnNlbGVjdGVkIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHVuYXZhaWxhYmxlOiBicmFuY2gudW5hdmFpbGFibGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRyaWdnZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCB8fCAhdGhpcy5fc2xvdEVsZW1lbnQgfHwgIXRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3RyaWdnZXJFbGVtZW50KTtcblxuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKHRoaXMuX3RyaWdnZXJFbGVtZW50LCByZW5kZXJJY29uKENvZGljb24uZ2l0QnJhbmNoKSk7XG5cdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIGRvbS4kKCdzcGFuLnNlc3Npb25zLWNoYXQtZHJvcGRvd24tbGFiZWwnKSk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMubGFiZWxDbGFzc05hbWUpIHtcblx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQodGhpcy5fb3B0aW9ucy5sYWJlbENsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5fc3RhdGUubGFiZWw7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLnNob3dDaGV2cm9uICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgY2hldnJvbiA9IGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXHRcdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNhYmxlZCA9ICF0aGlzLl9zdGF0ZS5jYW5PcGVuO1xuXHRcdGNvbnN0IHJlbmRlckFzU3RhdGljID0gZGlzYWJsZWQgJiYgdGhpcy5fb3B0aW9ucy5yZW5kZXJEaXNhYmxlZEFzU3RhdGljID09PSB0cnVlO1xuXHRcdGNvbnN0IHJlYXNvbiA9IHRoaXMuX3N0YXRlLmRpc2FibGVkUmVhc29uO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGRpc2FibGVkICYmIHJlYXNvblxuXHRcdFx0PyBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLmRpc2FibGVkQXJpYUxhYmVsJywgXCJ7MH0uIHsxfVwiLCB0aGlzLl9zdGF0ZS5sYWJlbCwgcmVhc29uKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYnJhbmNoUGlja2VyLnRyaWdnZXJBcmlhTGFiZWwnLCBcIlBpY2sgQnJhbmNoLCB7MH1cIiwgdGhpcy5fc3RhdGUubGFiZWwpKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoZGlzYWJsZWQpKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtYnVzeScsIFN0cmluZyh0aGlzLl9zdGF0ZS5zdGF0dXMgPT09ICdsb2FkaW5nJykpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnRhYkluZGV4ID0gIWRpc2FibGVkIHx8IHRoaXMuX29wdGlvbnMua2VlcERpc2FibGVkRm9jdXNhYmxlICYmICFyZW5kZXJBc1N0YXRpYyA/IDAgOiAtMTtcblx0XHRpZiAocmVuZGVyQXNTdGF0aWMpIHtcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgncm9sZScpO1xuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJyk7XG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ2xpc3Rib3gnKTtcblx0XHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyh0aGlzLl9pc09wZW4pKTtcblx0XHR9XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQudGl0bGUgPSBkaXNhYmxlZCAmJiByZWFzb24gPyByZWFzb24gOiB0aGlzLl9zdGF0ZS5sYWJlbDtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbkVsZW1lbnQudGV4dENvbnRlbnQgPSByZWFzb24gPz8gJyc7XG5cdFx0dGhpcy5fc2xvdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYnJhbmNoLXBpY2tlci1kaXNhYmxlZCcsIGRpc2FibGVkKTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdicmFuY2gtcGlja2VyLW1pc3NpbmcnLCB0aGlzLl9zdGF0ZS5taXNzaW5nID09PSB0cnVlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUFnRTtBQUN6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
