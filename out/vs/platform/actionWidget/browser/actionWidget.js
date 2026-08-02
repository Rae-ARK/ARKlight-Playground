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
import * as dom from "../../../base/browser/dom.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import "./actionWidget.css";
import { localize, localize2 } from "../../../nls.js";
import { acceptSelectedActionCommand, ActionList, previewSelectedActionCommand } from "./actionList.js";
import { Action2, registerAction2 } from "../../actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../contextkey/common/contextkey.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../keybinding/common/keybindingsRegistry.js";
import { inputActiveOptionBackground, registerColor } from "../../theme/common/colorRegistry.js";
registerColor(
  "actionBar.toggledBackground",
  inputActiveOptionBackground,
  localize("actionBar.toggledBackground", "Background color for toggled action items in action bar.")
);
const ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE = "--action-widget-close-start-opacity";
const ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE = "--action-widget-close-start-transform";
const ActionWidgetContextKeys = {
  Visible: new RawContextKey("codeActionMenuVisible", false, localize("codeActionMenuVisible", "Whether the action widget list is visible")),
  FilterFocused: new RawContextKey("codeActionMenuFilterFocused", false, localize("codeActionMenuFilterFocused", "Whether the action widget filter input is focused"))
};
const IActionWidgetService = createDecorator("actionWidgetService");
let ActionWidgetService = class extends Disposable {
  constructor(_contextViewService, _contextKeyService, _instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._list = this._register(new MutableDisposable());
    this._closeAnimation = this._register(new MutableDisposable());
  }
  get isVisible() {
    return ActionWidgetContextKeys.Visible.getValue(this._contextKeyService) || false;
  }
  show(user, supportsPreview, items, delegate, anchor, container, actionBarActions, accessibilityProvider, listOptions) {
    const visibleContext = ActionWidgetContextKeys.Visible.bindTo(this._contextKeyService);
    const list = this._instantiationService.createInstance(ActionList, user, supportsPreview, items, delegate, accessibilityProvider, listOptions, anchor);
    this._contextViewService.showContextView({
      getAnchor: () => anchor,
      render: (container2) => {
        visibleContext.set(true);
        return this._renderWidget(container2, list, actionBarActions ?? []);
      },
      onHide: (didCancel) => {
        visibleContext.reset();
        this._onWidgetClosed(didCancel);
      },
      get anchorPosition() {
        return list.anchorPosition;
      }
    }, container, false);
  }
  acceptSelected(preview) {
    this._list.value?.acceptSelected(preview);
  }
  updateItems(items, focusItemId) {
    this._list.value?.updateItems(items, focusItemId);
  }
  focusItemById(itemId) {
    this._list.value?.focusItemById(itemId);
  }
  focusPrevious() {
    this._list?.value?.focusPrevious();
  }
  focusNext() {
    this._list?.value?.focusNext();
  }
  collapseSection() {
    this._list?.value?.collapseFocusedSection();
  }
  expandSection() {
    this._list?.value?.expandFocusedSection();
  }
  toggleSection() {
    return this._list?.value?.toggleFocusedSection() ?? false;
  }
  clearFilter() {
    return this._list?.value?.clearFilter() ?? false;
  }
  hide(didCancel) {
    const list = this._list.value;
    const widget = this._widgetElement;
    if (!list || this._closingList === list) {
      return;
    }
    const closeAnimation = list.closeAnimation;
    if (!widget || !closeAnimation || closeAnimation.duration <= 0 || !this._hasRequiredAncestorClasses(widget, closeAnimation.requiredAncestorClasses)) {
      this._closingList = list;
      list.hide(didCancel);
      return;
    }
    this._closingList = list;
    const computedStyle = dom.getWindow(widget).getComputedStyle(widget);
    widget.style.setProperty(ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE, computedStyle.opacity);
    widget.style.setProperty(ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE, computedStyle.transform);
    widget.classList.add(closeAnimation.className);
    list.hide(didCancel, false);
    this._closeAnimation.value = disposableTimeout(() => {
      if (this._list.value === list) {
        this._contextViewService.hideContextView(didCancel);
      }
    }, closeAnimation.duration);
  }
  clear() {
    this._closeAnimation.clear();
    this._closingList = void 0;
    this._widgetElement?.style.removeProperty(ACTION_WIDGET_CLOSE_START_OPACITY_VARIABLE);
    this._widgetElement?.style.removeProperty(ACTION_WIDGET_CLOSE_START_TRANSFORM_VARIABLE);
    this._widgetElement = void 0;
    this._list.clear();
  }
  _renderWidget(element, list, actionBarActions) {
    const widget = document.createElement("div");
    widget.classList.add("action-widget");
    element.appendChild(widget);
    this._widgetElement = widget;
    this._list.value = list;
    if (this._list.value) {
      if (this._list.value.headerContainer) {
        widget.appendChild(this._list.value.headerContainer);
      }
      if (this._list.value.filterContainer) {
        widget.appendChild(this._list.value.filterContainer);
      }
      widget.appendChild(this._list.value.domNode);
      if (this._list.value.footerContainer) {
        widget.appendChild(this._list.value.footerContainer);
      }
    } else {
      throw new Error("List has no value");
    }
    const renderDisposables = new DisposableStore();
    const headerContainer = this._list.value.headerContainer;
    if (headerContainer) {
      renderDisposables.add(dom.addDisposableGenericMouseDownListener(headerContainer, (e) => e.preventDefault()));
    }
    const menuBlock = document.createElement("div");
    const block = element.appendChild(menuBlock);
    block.classList.add("context-view-block");
    renderDisposables.add(dom.addDisposableGenericMouseDownListener(block, (e) => e.stopPropagation()));
    const pointerBlockDiv = document.createElement("div");
    const pointerBlock = element.appendChild(pointerBlockDiv);
    pointerBlock.classList.add("context-view-pointerBlock");
    renderDisposables.add(dom.addDisposableListener(pointerBlock, dom.EventType.POINTER_MOVE, () => pointerBlock.remove()));
    renderDisposables.add(dom.addDisposableGenericMouseDownListener(pointerBlock, () => pointerBlock.remove()));
    let actionBarWidth = 0;
    if (actionBarActions.length) {
      const actionBar = this._createActionBar(".action-widget-action-bar", actionBarActions);
      if (actionBar) {
        widget.appendChild(actionBar.getContainer().parentElement);
        renderDisposables.add(actionBar);
        actionBarWidth = actionBar.getContainer().offsetWidth;
      }
    }
    const width = this._list.value?.layout(actionBarWidth);
    widget.style.width = `${width}px`;
    this._list.value?.focus();
    const filterFocusedContext = ActionWidgetContextKeys.FilterFocused.bindTo(this._contextKeyService);
    renderDisposables.add({ dispose: () => filterFocusedContext.reset() });
    if (this._list.value?.filterInput) {
      const filterInput = this._list.value.filterInput;
      renderDisposables.add(dom.addDisposableListener(filterInput, "focus", () => filterFocusedContext.set(true)));
      renderDisposables.add(dom.addDisposableListener(filterInput, "blur", () => filterFocusedContext.set(false)));
    }
    const focusTracker = renderDisposables.add(dom.trackFocus(element));
    renderDisposables.add(focusTracker.onDidBlur(() => {
      const activeElement = dom.getActiveElement();
      if (activeElement?.closest(".action-widget-hover") || activeElement?.closest(".action-list-submenu-panel")) {
        return;
      }
      this.hide(true);
    }));
    return renderDisposables;
  }
  _createActionBar(className, actions) {
    if (!actions.length) {
      return void 0;
    }
    const container = dom.$(className);
    const actionBar = new ActionBar(container);
    actionBar.push(actions, { icon: false, label: true });
    return actionBar;
  }
  _hasRequiredAncestorClasses(element, classNames) {
    if (!classNames?.length) {
      return true;
    }
    for (let candidate = element; candidate; candidate = candidate.parentElement) {
      if (classNames.every((className) => candidate.classList.contains(className))) {
        return true;
      }
    }
    return false;
  }
  _onWidgetClosed(didCancel) {
    if (this._closingList === this._list.value) {
      this.clear();
      return;
    }
    this._closeAnimation.clear();
    this._closingList = void 0;
    this._widgetElement = void 0;
    this._list.value?.hide(didCancel);
  }
};
ActionWidgetService = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IInstantiationService)
], ActionWidgetService);
registerSingleton(IActionWidgetService, ActionWidgetService, InstantiationType.Delayed);
const weight = KeybindingWeight.EditorContrib + 1e3;
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "hideCodeActionWidget",
      title: localize2("hideCodeActionWidget.title", "Hide action widget"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.Escape,
        secondary: [KeyMod.Shift | KeyCode.Escape]
      }
    });
  }
  run(accessor) {
    accessor.get(IActionWidgetService).hide(true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "clearFilterCodeActionWidget",
      title: localize2("clearFilterCodeActionWidget.title", "Clear action widget filter"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused),
      keybinding: {
        weight: weight + 1,
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      if (!widgetService.clearFilter()) {
        widgetService.hide(true);
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "selectPrevCodeAction",
      title: localize2("selectPrevCodeAction.title", "Select previous action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.UpArrow,
        secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
        mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.focusPrevious();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "selectNextCodeAction",
      title: localize2("selectNextCodeAction.title", "Select next action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.DownArrow,
        secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
        mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.focusNext();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "collapseSectionCodeAction",
      title: localize2("collapseSectionCodeAction.title", "Collapse section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.LeftArrow
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.collapseSection();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "expandSectionCodeAction",
      title: localize2("expandSectionCodeAction.title", "Expand section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.RightArrow
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.expandSection();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "toggleSectionCodeAction",
      title: localize2("toggleSectionCodeAction.title", "Toggle section"),
      precondition: ContextKeyExpr.and(ActionWidgetContextKeys.Visible, ActionWidgetContextKeys.FilterFocused.negate()),
      keybinding: {
        weight,
        primary: KeyCode.Space
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      if (!widgetService.toggleSection()) {
        widgetService.acceptSelected();
      }
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: acceptSelectedActionCommand,
      title: localize2("acceptSelected.title", "Accept selected action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyCode.Enter,
        secondary: [KeyMod.CtrlCmd | KeyCode.Period]
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.acceptSelected();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: previewSelectedActionCommand,
      title: localize2("previewSelected.title", "Preview selected action"),
      precondition: ActionWidgetContextKeys.Visible,
      keybinding: {
        weight,
        primary: KeyMod.CtrlCmd | KeyCode.Enter
      }
    });
  }
  run(accessor) {
    const widgetService = accessor.get(IActionWidgetService);
    if (widgetService instanceof ActionWidgetService) {
      widgetService.acceptSelected(true);
    }
  }
});
export {
  IActionWidgetService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICcuL2FjdGlvbldpZGdldC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhY2NlcHRTZWxlY3RlZEFjdGlvbkNvbW1hbmQsIEFjdGlvbkxpc3QsIElBY3Rpb25MaXN0RGVsZWdhdGUsIElBY3Rpb25MaXN0SXRlbSwgSUFjdGlvbkxpc3RPcHRpb25zLCBwcmV2aWV3U2VsZWN0ZWRBY3Rpb25Db21tYW5kIH0gZnJvbSAnLi9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcblxucmVnaXN0ZXJDb2xvcihcblx0J2FjdGlvbkJhci50b2dnbGVkQmFja2dyb3VuZCcsXG5cdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCxcblx0bG9jYWxpemUoJ2FjdGlvbkJhci50b2dnbGVkQmFja2dyb3VuZCcsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciB0b2dnbGVkIGFjdGlvbiBpdGVtcyBpbiBhY3Rpb24gYmFyLicpXG4pO1xuXG5jb25zdCBBQ1RJT05fV0lER0VUX0NMT1NFX1NUQVJUX09QQUNJVFlfVkFSSUFCTEUgPSAnLS1hY3Rpb24td2lkZ2V0LWNsb3NlLXN0YXJ0LW9wYWNpdHknO1xuY29uc3QgQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEUgPSAnLS1hY3Rpb24td2lkZ2V0LWNsb3NlLXN0YXJ0LXRyYW5zZm9ybSc7XG5cbmNvbnN0IEFjdGlvbldpZGdldENvbnRleHRLZXlzID0ge1xuXHRWaXNpYmxlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY29kZUFjdGlvbk1lbnVWaXNpYmxlJywgZmFsc2UsIGxvY2FsaXplKCdjb2RlQWN0aW9uTWVudVZpc2libGUnLCBcIldoZXRoZXIgdGhlIGFjdGlvbiB3aWRnZXQgbGlzdCBpcyB2aXNpYmxlXCIpKSxcblx0RmlsdGVyRm9jdXNlZDogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NvZGVBY3Rpb25NZW51RmlsdGVyRm9jdXNlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnY29kZUFjdGlvbk1lbnVGaWx0ZXJGb2N1c2VkJywgXCJXaGV0aGVyIHRoZSBhY3Rpb24gd2lkZ2V0IGZpbHRlciBpbnB1dCBpcyBmb2N1c2VkXCIpKSxcbn07XG5cbmV4cG9ydCBjb25zdCBJQWN0aW9uV2lkZ2V0U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWN0aW9uV2lkZ2V0U2VydmljZT4oJ2FjdGlvbldpZGdldFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uV2lkZ2V0U2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRzaG93PFQ+KHVzZXI6IHN0cmluZywgc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLCBpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPFQ+LCBhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCwgYWN0aW9uQmFyQWN0aW9ucz86IHJlYWRvbmx5IElBY3Rpb25bXSwgYWNjZXNzaWJpbGl0eVByb3ZpZGVyPzogUGFydGlhbDxJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJQWN0aW9uTGlzdEl0ZW08VD4+PiwgbGlzdE9wdGlvbnM/OiBJQWN0aW9uTGlzdE9wdGlvbnMpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXBsYWNlcyB0aGUgaXRlbXMgb2YgdGhlIGN1cnJlbnRseSBzaG93biB3aWRnZXQgaW4gcGxhY2UsIHdpdGhvdXQgY2xvc2luZ1xuXHQgKiBvciByZXBvc2l0aW9uaW5nIGl0LiBQcmVzZXJ2ZXMgdGhlIGN1cnJlbnQgZmlsdGVyLiBXaGVuIGBmb2N1c0l0ZW1JZGAgaXNcblx0ICogcHJvdmlkZWQsIGZvY3VzZXMgdGhhdCBpdGVtOyBvdGhlcndpc2UgcHJlc2VydmVzIHRoZSBmb2N1c2VkIGl0ZW0uXG5cdCAqL1xuXHR1cGRhdGVJdGVtczxUPihpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIGZvY3VzSXRlbUlkPzogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgaXRlbSB3aXRoIHRoZSBnaXZlbiBpZCBpbiB0aGUgY3VycmVudGx5IHNob3duIHdpZGdldCwgd2l0aG91dFxuXHQgKiByZWJ1aWxkaW5nIHRoZSBsaXN0LlxuXHQgKi9cblx0Zm9jdXNJdGVtQnlJZChpdGVtSWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0aGlkZShkaWRDYW5jZWw/OiBib29sZWFuKTogdm9pZDtcblxuXHRyZWFkb25seSBpc1Zpc2libGU6IGJvb2xlYW47XG59XG5cbmNsYXNzIEFjdGlvbldpZGdldFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjdGlvbldpZGdldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRnZXQgaXNWaXNpYmxlKCkge1xuXHRcdHJldHVybiBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSB8fCBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8QWN0aW9uTGlzdDx1bmtub3duPj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlQW5pbWF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBfd2lkZ2V0RWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Nsb3NpbmdMaXN0OiBBY3Rpb25MaXN0PHVua25vd24+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzaG93PFQ+KHVzZXI6IHN0cmluZywgc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLCBpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sIGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPFQ+LCBhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCwgYWN0aW9uQmFyQWN0aW9ucz86IHJlYWRvbmx5IElBY3Rpb25bXSwgYWNjZXNzaWJpbGl0eVByb3ZpZGVyPzogUGFydGlhbDxJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJQWN0aW9uTGlzdEl0ZW08VD4+PiwgbGlzdE9wdGlvbnM/OiBJQWN0aW9uTGlzdE9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlQ29udGV4dCA9IEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpb25MaXN0LCB1c2VyLCBzdXBwb3J0c1ByZXZpZXcsIGl0ZW1zLCBkZWxlZ2F0ZSwgYWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBsaXN0T3B0aW9ucywgYW5jaG9yKTtcblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0cmVuZGVyOiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0XHR2aXNpYmxlQ29udGV4dC5zZXQodHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZW5kZXJXaWRnZXQoY29udGFpbmVyLCBsaXN0LCBhY3Rpb25CYXJBY3Rpb25zID8/IFtdKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6IChkaWRDYW5jZWwpID0+IHtcblx0XHRcdFx0dmlzaWJsZUNvbnRleHQucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fb25XaWRnZXRDbG9zZWQoZGlkQ2FuY2VsKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYW5jaG9yUG9zaXRpb24oKSB7IHJldHVybiBsaXN0LmFuY2hvclBvc2l0aW9uOyB9LFxuXHRcdH0sIGNvbnRhaW5lciwgZmFsc2UpO1xuXHR9XG5cblx0YWNjZXB0U2VsZWN0ZWQocHJldmlldz86IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9saXN0LnZhbHVlPy5hY2NlcHRTZWxlY3RlZChwcmV2aWV3KTtcblx0fVxuXG5cdHVwZGF0ZUl0ZW1zPFQ+KGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSwgZm9jdXNJdGVtSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQodGhpcy5fbGlzdC52YWx1ZSBhcyBBY3Rpb25MaXN0PFQ+IHwgdW5kZWZpbmVkKT8udXBkYXRlSXRlbXMoaXRlbXMsIGZvY3VzSXRlbUlkKTtcblx0fVxuXG5cdGZvY3VzSXRlbUJ5SWQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnZhbHVlPy5mb2N1c0l0ZW1CeUlkKGl0ZW1JZCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKCkge1xuXHRcdHRoaXMuX2xpc3Q/LnZhbHVlPy5mb2N1c1ByZXZpb3VzKCk7XG5cdH1cblxuXHRmb2N1c05leHQoKSB7XG5cdFx0dGhpcy5fbGlzdD8udmFsdWU/LmZvY3VzTmV4dCgpO1xuXHR9XG5cblx0Y29sbGFwc2VTZWN0aW9uKCkge1xuXHRcdHRoaXMuX2xpc3Q/LnZhbHVlPy5jb2xsYXBzZUZvY3VzZWRTZWN0aW9uKCk7XG5cdH1cblxuXHRleHBhbmRTZWN0aW9uKCkge1xuXHRcdHRoaXMuX2xpc3Q/LnZhbHVlPy5leHBhbmRGb2N1c2VkU2VjdGlvbigpO1xuXHR9XG5cblx0dG9nZ2xlU2VjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdD8udmFsdWU/LnRvZ2dsZUZvY3VzZWRTZWN0aW9uKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRjbGVhckZpbHRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGlzdD8udmFsdWU/LmNsZWFyRmlsdGVyKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRoaWRlKGRpZENhbmNlbD86IGJvb2xlYW4pIHtcblx0XHRjb25zdCBsaXN0ID0gdGhpcy5fbGlzdC52YWx1ZTtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl93aWRnZXRFbGVtZW50O1xuXHRcdGlmICghbGlzdCB8fCB0aGlzLl9jbG9zaW5nTGlzdCA9PT0gbGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNsb3NlQW5pbWF0aW9uID0gbGlzdC5jbG9zZUFuaW1hdGlvbjtcblx0XHRpZiAoIXdpZGdldCB8fCAhY2xvc2VBbmltYXRpb24gfHwgY2xvc2VBbmltYXRpb24uZHVyYXRpb24gPD0gMCB8fCAhdGhpcy5faGFzUmVxdWlyZWRBbmNlc3RvckNsYXNzZXMod2lkZ2V0LCBjbG9zZUFuaW1hdGlvbi5yZXF1aXJlZEFuY2VzdG9yQ2xhc3NlcykpIHtcblx0XHRcdHRoaXMuX2Nsb3NpbmdMaXN0ID0gbGlzdDtcblx0XHRcdGxpc3QuaGlkZShkaWRDYW5jZWwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Nsb3NpbmdMaXN0ID0gbGlzdDtcblx0XHRjb25zdCBjb21wdXRlZFN0eWxlID0gZG9tLmdldFdpbmRvdyh3aWRnZXQpLmdldENvbXB1dGVkU3R5bGUod2lkZ2V0KTtcblx0XHR3aWRnZXQuc3R5bGUuc2V0UHJvcGVydHkoQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFLCBjb21wdXRlZFN0eWxlLm9wYWNpdHkpO1xuXHRcdHdpZGdldC5zdHlsZS5zZXRQcm9wZXJ0eShBQ1RJT05fV0lER0VUX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRSwgY29tcHV0ZWRTdHlsZS50cmFuc2Zvcm0pO1xuXHRcdHdpZGdldC5jbGFzc0xpc3QuYWRkKGNsb3NlQW5pbWF0aW9uLmNsYXNzTmFtZSk7XG5cdFx0bGlzdC5oaWRlKGRpZENhbmNlbCwgZmFsc2UpO1xuXHRcdHRoaXMuX2Nsb3NlQW5pbWF0aW9uLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xpc3QudmFsdWUgPT09IGxpc3QpIHtcblx0XHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldyhkaWRDYW5jZWwpO1xuXHRcdFx0fVxuXHRcdH0sIGNsb3NlQW5pbWF0aW9uLmR1cmF0aW9uKTtcblx0fVxuXG5cdGNsZWFyKCkge1xuXHRcdHRoaXMuX2Nsb3NlQW5pbWF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2xvc2luZ0xpc3QgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fd2lkZ2V0RWxlbWVudD8uc3R5bGUucmVtb3ZlUHJvcGVydHkoQUNUSU9OX1dJREdFVF9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFKTtcblx0XHR0aGlzLl93aWRnZXRFbGVtZW50Py5zdHlsZS5yZW1vdmVQcm9wZXJ0eShBQ1RJT05fV0lER0VUX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRSk7XG5cdFx0dGhpcy5fd2lkZ2V0RWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9saXN0LmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJXaWRnZXQoZWxlbWVudDogSFRNTEVsZW1lbnQsIGxpc3Q6IEFjdGlvbkxpc3Q8dW5rbm93bj4sIGFjdGlvbkJhckFjdGlvbnM6IHJlYWRvbmx5IElBY3Rpb25bXSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB3aWRnZXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR3aWRnZXQuY2xhc3NMaXN0LmFkZCgnYWN0aW9uLXdpZGdldCcpO1xuXHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQod2lkZ2V0KTtcblx0XHR0aGlzLl93aWRnZXRFbGVtZW50ID0gd2lkZ2V0O1xuXG5cdFx0dGhpcy5fbGlzdC52YWx1ZSA9IGxpc3Q7XG5cdFx0aWYgKHRoaXMuX2xpc3QudmFsdWUpIHtcblx0XHRcdGlmICh0aGlzLl9saXN0LnZhbHVlLmhlYWRlckNvbnRhaW5lcikge1xuXHRcdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQodGhpcy5fbGlzdC52YWx1ZS5oZWFkZXJDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2xpc3QudmFsdWUuZmlsdGVyQ29udGFpbmVyKSB7XG5cdFx0XHRcdHdpZGdldC5hcHBlbmRDaGlsZCh0aGlzLl9saXN0LnZhbHVlLmZpbHRlckNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQodGhpcy5fbGlzdC52YWx1ZS5kb21Ob2RlKTtcblx0XHRcdGlmICh0aGlzLl9saXN0LnZhbHVlLmZvb3RlckNvbnRhaW5lcikge1xuXHRcdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQodGhpcy5fbGlzdC52YWx1ZS5mb290ZXJDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xpc3QgaGFzIG5vIHZhbHVlJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gQ2xpY2tpbmcgdGhlIGhlYWRlciBiYW5uZXIgbXVzdCBub3QgbW92ZSBmb2N1cyBvdXQgb2YgdGhlIGxpc3QsIHdoaWNoXG5cdFx0Ly8gd291bGQgYmx1ciB0aGUgd2lkZ2V0IGFuZCBkaXNtaXNzIGl0LlxuXHRcdGNvbnN0IGhlYWRlckNvbnRhaW5lciA9IHRoaXMuX2xpc3QudmFsdWUuaGVhZGVyQ29udGFpbmVyO1xuXHRcdGlmIChoZWFkZXJDb250YWluZXIpIHtcblx0XHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihoZWFkZXJDb250YWluZXIsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW52aXNpYmxlIGRpdiB0byBibG9jayBtb3VzZSBpbnRlcmFjdGlvbiBpbiB0aGUgcmVzdCBvZiB0aGUgVUlcblx0XHRjb25zdCBtZW51QmxvY2sgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBibG9jayA9IGVsZW1lbnQuYXBwZW5kQ2hpbGQobWVudUJsb2NrKTtcblx0XHRibG9jay5jbGFzc0xpc3QuYWRkKCdjb250ZXh0LXZpZXctYmxvY2snKTtcblx0XHRyZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoYmxvY2ssIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXG5cdFx0Ly8gSW52aXNpYmxlIGRpdiB0byBibG9jayBtb3VzZSBpbnRlcmFjdGlvbiB3aXRoIHRoZSBtZW51XG5cdFx0Y29uc3QgcG9pbnRlckJsb2NrRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgcG9pbnRlckJsb2NrID0gZWxlbWVudC5hcHBlbmRDaGlsZChwb2ludGVyQmxvY2tEaXYpO1xuXHRcdHBvaW50ZXJCbG9jay5jbGFzc0xpc3QuYWRkKCdjb250ZXh0LXZpZXctcG9pbnRlckJsb2NrJyk7XG5cblx0XHQvLyBSZW1vdmVzIGJsb2NrIG9uIGNsaWNrIElOU0lERSB3aWRnZXQgb3IgQU5ZIG1vdXNlIG1vdmVtZW50XG5cdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocG9pbnRlckJsb2NrLCBkb20uRXZlbnRUeXBlLlBPSU5URVJfTU9WRSwgKCkgPT4gcG9pbnRlckJsb2NrLnJlbW92ZSgpKSk7XG5cdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHBvaW50ZXJCbG9jaywgKCkgPT4gcG9pbnRlckJsb2NrLnJlbW92ZSgpKSk7XG5cblx0XHQvLyBBY3Rpb24gYmFyXG5cdFx0bGV0IGFjdGlvbkJhcldpZHRoID0gMDtcblx0XHRpZiAoYWN0aW9uQmFyQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGFjdGlvbkJhciA9IHRoaXMuX2NyZWF0ZUFjdGlvbkJhcignLmFjdGlvbi13aWRnZXQtYWN0aW9uLWJhcicsIGFjdGlvbkJhckFjdGlvbnMpO1xuXHRcdFx0aWYgKGFjdGlvbkJhcikge1xuXHRcdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyLmdldENvbnRhaW5lcigpLnBhcmVudEVsZW1lbnQhKTtcblx0XHRcdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGFjdGlvbkJhcik7XG5cdFx0XHRcdGFjdGlvbkJhcldpZHRoID0gYWN0aW9uQmFyLmdldENvbnRhaW5lcigpLm9mZnNldFdpZHRoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fbGlzdC52YWx1ZT8ubGF5b3V0KGFjdGlvbkJhcldpZHRoKTtcblx0XHR3aWRnZXQuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cblx0XHR0aGlzLl9saXN0LnZhbHVlPy5mb2N1cygpO1xuXG5cdFx0Ly8gVHJhY2sgZmlsdGVyIGlucHV0IGZvY3VzIHN0YXRlXG5cdFx0Y29uc3QgZmlsdGVyRm9jdXNlZENvbnRleHQgPSBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5GaWx0ZXJGb2N1c2VkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gZmlsdGVyRm9jdXNlZENvbnRleHQucmVzZXQoKSB9KTtcblx0XHRpZiAodGhpcy5fbGlzdC52YWx1ZT8uZmlsdGVySW5wdXQpIHtcblx0XHRcdGNvbnN0IGZpbHRlcklucHV0ID0gdGhpcy5fbGlzdC52YWx1ZS5maWx0ZXJJbnB1dDtcblx0XHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGZpbHRlcklucHV0LCAnZm9jdXMnLCAoKSA9PiBmaWx0ZXJGb2N1c2VkQ29udGV4dC5zZXQodHJ1ZSkpKTtcblx0XHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGZpbHRlcklucHV0LCAnYmx1cicsICgpID0+IGZpbHRlckZvY3VzZWRDb250ZXh0LnNldChmYWxzZSkpKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSByZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLnRyYWNrRm9jdXMoZWxlbWVudCkpO1xuXHRcdHJlbmRlckRpc3Bvc2FibGVzLmFkZChmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdC8vIERvbid0IGhpZGUgaWYgZm9jdXMgbW92ZWQgdG8gYSBob3ZlciBvciBzdWJtZW51IHRoYXQgYmVsb25ncyB0byB0aGlzIGFjdGlvbiB3aWRnZXRcblx0XHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdFx0aWYgKGFjdGl2ZUVsZW1lbnQ/LmNsb3Nlc3QoJy5hY3Rpb24td2lkZ2V0LWhvdmVyJykgfHwgYWN0aXZlRWxlbWVudD8uY2xvc2VzdCgnLmFjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmhpZGUodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJlbmRlckRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQWN0aW9uQmFyKGNsYXNzTmFtZTogc3RyaW5nLCBhY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10pOiBBY3Rpb25CYXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoY2xhc3NOYW1lKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGNvbnRhaW5lcik7XG5cdFx0YWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiBmYWxzZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGFjdGlvbkJhcjtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1JlcXVpcmVkQW5jZXN0b3JDbGFzc2VzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjbGFzc05hbWVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmICghY2xhc3NOYW1lcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY2FuZGlkYXRlOiBIVE1MRWxlbWVudCB8IG51bGwgPSBlbGVtZW50OyBjYW5kaWRhdGU7IGNhbmRpZGF0ZSA9IGNhbmRpZGF0ZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRpZiAoY2xhc3NOYW1lcy5ldmVyeShjbGFzc05hbWUgPT4gY2FuZGlkYXRlLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25XaWRnZXRDbG9zZWQoZGlkQ2FuY2VsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jbG9zaW5nTGlzdCA9PT0gdGhpcy5fbGlzdC52YWx1ZSkge1xuXHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jbG9zZUFuaW1hdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2Nsb3NpbmdMaXN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3dpZGdldEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbGlzdC52YWx1ZT8uaGlkZShkaWRDYW5jZWwpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCBBY3Rpb25XaWRnZXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuY29uc3Qgd2VpZ2h0ID0gS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgMTAwMDtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaGlkZUNvZGVBY3Rpb25XaWRnZXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaGlkZUNvZGVBY3Rpb25XaWRnZXQudGl0bGUnLCBcIkhpZGUgYWN0aW9uIHdpZGdldFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKS5oaWRlKHRydWUpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY2xlYXJGaWx0ZXJDb2RlQWN0aW9uV2lkZ2V0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NsZWFyRmlsdGVyQ29kZUFjdGlvbldpZGdldC50aXRsZScsIFwiQ2xlYXIgYWN0aW9uIHdpZGdldCBmaWx0ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLCBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5GaWx0ZXJGb2N1c2VkKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiB3ZWlnaHQgKyAxLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUFjdGlvbldpZGdldFNlcnZpY2UpO1xuXHRcdGlmICh3aWRnZXRTZXJ2aWNlIGluc3RhbmNlb2YgQWN0aW9uV2lkZ2V0U2VydmljZSkge1xuXHRcdFx0aWYgKCF3aWRnZXRTZXJ2aWNlLmNsZWFyRmlsdGVyKCkpIHtcblx0XHRcdFx0d2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3NlbGVjdFByZXZDb2RlQWN0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlbGVjdFByZXZDb2RlQWN0aW9uLnRpdGxlJywgXCJTZWxlY3QgcHJldmlvdXMgYWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5VcEFycm93LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdywgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleVBdIH0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0U2VydmljZSBpbnN0YW5jZW9mIEFjdGlvbldpZGdldFNlcnZpY2UpIHtcblx0XHRcdHdpZGdldFNlcnZpY2UuZm9jdXNQcmV2aW91cygpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3NlbGVjdE5leHRDb2RlQWN0aW9uJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlbGVjdE5leHRDb2RlQWN0aW9uLnRpdGxlJywgXCJTZWxlY3QgbmV4dCBhY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEFjdGlvbldpZGdldENvbnRleHRLZXlzLlZpc2libGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csIEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlOXSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0U2VydmljZSBpbnN0YW5jZW9mIEFjdGlvbldpZGdldFNlcnZpY2UpIHtcblx0XHRcdHdpZGdldFNlcnZpY2UuZm9jdXNOZXh0KCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnY29sbGFwc2VTZWN0aW9uQ29kZUFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb2xsYXBzZVNlY3Rpb25Db2RlQWN0aW9uLnRpdGxlJywgXCJDb2xsYXBzZSBzZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSwgQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuRmlsdGVyRm9jdXNlZC5uZWdhdGUoKSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0U2VydmljZSBpbnN0YW5jZW9mIEFjdGlvbldpZGdldFNlcnZpY2UpIHtcblx0XHRcdHdpZGdldFNlcnZpY2UuY29sbGFwc2VTZWN0aW9uKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZXhwYW5kU2VjdGlvbkNvZGVBY3Rpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZXhwYW5kU2VjdGlvbkNvZGVBY3Rpb24udGl0bGUnLCBcIkV4cGFuZCBzZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSwgQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuRmlsdGVyRm9jdXNlZC5uZWdhdGUoKSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmV4cGFuZFNlY3Rpb24oKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd0b2dnbGVTZWN0aW9uQ29kZUFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVTZWN0aW9uQ29kZUFjdGlvbi50aXRsZScsIFwiVG9nZ2xlIHNlY3Rpb25cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLCBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5GaWx0ZXJGb2N1c2VkLm5lZ2F0ZSgpKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHRpZiAoIXdpZGdldFNlcnZpY2UudG9nZ2xlU2VjdGlvbigpKSB7XG5cdFx0XHRcdHdpZGdldFNlcnZpY2UuYWNjZXB0U2VsZWN0ZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGFjY2VwdFNlbGVjdGVkQWN0aW9uQ29tbWFuZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FjY2VwdFNlbGVjdGVkLnRpdGxlJywgXCJBY2NlcHQgc2VsZWN0ZWQgYWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3Rpb25XaWRnZXRDb250ZXh0S2V5cy5WaXNpYmxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QZXJpb2RdLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWN0aW9uV2lkZ2V0U2VydmljZSk7XG5cdFx0aWYgKHdpZGdldFNlcnZpY2UgaW5zdGFuY2VvZiBBY3Rpb25XaWRnZXRTZXJ2aWNlKSB7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmFjY2VwdFNlbGVjdGVkKCk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBwcmV2aWV3U2VsZWN0ZWRBY3Rpb25Db21tYW5kLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncHJldmlld1NlbGVjdGVkLnRpdGxlJywgXCJQcmV2aWV3IHNlbGVjdGVkIGFjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQWN0aW9uV2lkZ2V0Q29udGV4dEtleXMuVmlzaWJsZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBY3Rpb25XaWRnZXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0U2VydmljZSBpbnN0YW5jZW9mIEFjdGlvbldpZGdldFNlcnZpY2UpIHtcblx0XHRcdHdpZGdldFNlcnZpY2UuYWNjZXB0U2VsZWN0ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCO0FBRzFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLE9BQU87QUFDUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQTZCLFlBQXNFLG9DQUFvQztBQUNoSixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsZ0JBQWdCLG9CQUFvQixxQkFBcUI7QUFDbEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLDZCQUErQztBQUN6RSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QixxQkFBcUI7QUFJM0Q7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0EsU0FBUywrQkFBK0IsMERBQTBEO0FBQ25HO0FBRUEsTUFBTSw2Q0FBNkM7QUFDbkQsTUFBTSwrQ0FBK0M7QUFFckQsTUFBTSwwQkFBMEI7QUFBQSxFQUMvQixTQUFTLElBQUksY0FBdUIseUJBQXlCLE9BQU8sU0FBUyx5QkFBeUIsMkNBQTJDLENBQUM7QUFBQSxFQUNsSixlQUFlLElBQUksY0FBdUIsK0JBQStCLE9BQU8sU0FBUywrQkFBK0IsbURBQW1ELENBQUM7QUFDN0s7QUFFTyxNQUFNLHVCQUF1QixnQkFBc0MscUJBQXFCO0FBeUIvRixJQUFNLHNCQUFOLGNBQWtDLFdBQTJDO0FBQUEsRUFZNUUsWUFDdUMscUJBQ0Qsb0JBQ0csdUJBQ3ZDO0FBQ0QsVUFBTTtBQUpnQztBQUNEO0FBQ0c7QUFSekMsU0FBaUIsUUFBUSxLQUFLLFVBQVUsSUFBSSxrQkFBdUMsQ0FBQztBQUNwRixTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElB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
