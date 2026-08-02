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
import { asCSSUrl } from "../../../base/browser/cssValue.js";
import { $, addDisposableListener, append, EventType, ModifierKeyEmitter, prepend } from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem, SelectActionViewItem } from "../../../base/browser/ui/actionbar/actionViewItems.js";
import { DropdownMenuActionViewItem } from "../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { SeparatorSelectOption } from "../../../base/browser/ui/selectBox/selectBox.js";
import { ActionRunner, Separator, SubmenuAction } from "../../../base/common/actions.js";
import { UILabelProvider } from "../../../base/common/keybindingLabels.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { isLinux, isWindows, OS } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { assertType } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { isICommandActionToggleInfo } from "../../action/common/action.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { INotificationService } from "../../notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { defaultSelectBoxStyles } from "../../theme/browser/defaultStyles.js";
import { asCssVariable, selectBorder } from "../../theme/common/colorRegistry.js";
import { triggerClickAnimation } from "../../../base/browser/ui/animations/animations.js";
import { isDark } from "../../theme/common/theme.js";
import { IThemeService } from "../../theme/common/themeService.js";
import { hasNativeContextMenu } from "../../window/common/window.js";
import { IMenuService, MenuItemAction, SubmenuItemAction } from "../common/actions.js";
import "./menuEntryActionViewItem.css";
function getContextMenuActions(groups, primaryGroup) {
  const target = { primary: [], secondary: [] };
  getContextMenuActionsImpl(groups, target, primaryGroup);
  return target;
}
function getFlatContextMenuActions(groups, primaryGroup) {
  const target = [];
  getContextMenuActionsImpl(groups, target, primaryGroup);
  return target;
}
function getContextMenuActionsImpl(groups, target, primaryGroup) {
  const modifierKeyEmitter = ModifierKeyEmitter.getInstance();
  const useAlternativeActions = modifierKeyEmitter.keyStatus.altKey || (isWindows || isLinux) && modifierKeyEmitter.keyStatus.shiftKey;
  fillInActions(groups, target, useAlternativeActions, primaryGroup ? (actionGroup) => actionGroup === primaryGroup : (actionGroup) => actionGroup === "navigation");
}
function getActionBarActions(groups, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const target = { primary: [], secondary: [] };
  fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
  return target;
}
function getFlatActionBarActions(groups, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const target = [];
  fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
  return target;
}
function fillInActionBarActions(groups, target, primaryGroup, shouldInlineSubmenu, useSeparatorsInPrimaryActions) {
  const isPrimaryAction = typeof primaryGroup === "string" ? (actionGroup) => actionGroup === primaryGroup : primaryGroup;
  fillInActions(groups, target, false, isPrimaryAction, shouldInlineSubmenu, useSeparatorsInPrimaryActions);
}
function fillInActions(groups, target, useAlternativeActions, isPrimaryAction = (actionGroup) => actionGroup === "navigation", shouldInlineSubmenu = () => false, useSeparatorsInPrimaryActions = false) {
  let primaryBucket;
  let secondaryBucket;
  if (Array.isArray(target)) {
    primaryBucket = target;
    secondaryBucket = target;
  } else {
    primaryBucket = target.primary;
    secondaryBucket = target.secondary;
  }
  const submenuInfo = /* @__PURE__ */ new Set();
  for (const [group, actions] of groups) {
    let target2;
    if (isPrimaryAction(group)) {
      target2 = primaryBucket;
      if (target2.length > 0 && useSeparatorsInPrimaryActions) {
        target2.push(new Separator());
      }
    } else {
      target2 = secondaryBucket;
      if (target2.length > 0) {
        target2.push(new Separator());
      }
    }
    for (let action of actions) {
      if (useAlternativeActions) {
        action = action instanceof MenuItemAction && action.alt ? action.alt : action;
      }
      const newLen = target2.push(action);
      if (action instanceof SubmenuAction) {
        submenuInfo.add({ group, action, index: newLen - 1 });
      }
    }
  }
  for (const { group, action, index } of submenuInfo) {
    const target2 = isPrimaryAction(group) ? primaryBucket : secondaryBucket;
    const submenuActions = action.actions;
    if (shouldInlineSubmenu(action, group, target2.length)) {
      target2.splice(index, 1, ...submenuActions);
    }
  }
}
let MenuEntryActionViewItem = class extends ActionViewItem {
  constructor(action, _options, _keybindingService, _notificationService, _contextKeyService, _themeService, _contextMenuService, _accessibilityService) {
    super(void 0, action, { icon: !!(action.class || action.item.icon), label: !action.class && !action.item.icon, draggable: _options?.draggable, keybinding: _options?.keybinding, hoverDelegate: _options?.hoverDelegate, keybindingNotRenderedWithLabel: _options?.keybindingNotRenderedWithLabel });
    this._options = _options;
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._contextKeyService = _contextKeyService;
    this._themeService = _themeService;
    this._contextMenuService = _contextMenuService;
    this._accessibilityService = _accessibilityService;
    this._wantsAltCommand = false;
    this._itemClassDispose = this._register(new MutableDisposable());
    this._altKey = ModifierKeyEmitter.getInstance();
  }
  get _menuItemAction() {
    return this._action;
  }
  get _commandAction() {
    return this._wantsAltCommand && this._menuItemAction.alt || this._menuItemAction;
  }
  async onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (this._options?.onClickAnimation && this.element && !this._accessibilityService.isMotionReduced()) {
      const icon = this._menuItemAction.item.icon;
      triggerClickAnimation(this.element, this._options.onClickAnimation, ThemeIcon.isThemeIcon(icon) ? icon : void 0);
    }
    try {
      await this.actionRunner.run(this._commandAction, this._context);
    } catch (err) {
      this._notificationService.error(err);
    }
  }
  render(container) {
    super.render(container);
    container.classList.add("menu-entry");
    if (this.options.icon) {
      this._updateItemClass(this._menuItemAction.item);
    }
    if (this._menuItemAction.alt) {
      let isMouseOver = false;
      const updateAltState = () => {
        const wantsAltCommand = !!this._menuItemAction.alt?.enabled && (!this._accessibilityService.isMotionReduced() || isMouseOver) && (this._altKey.keyStatus.altKey || this._altKey.keyStatus.shiftKey && isMouseOver);
        if (wantsAltCommand !== this._wantsAltCommand) {
          this._wantsAltCommand = wantsAltCommand;
          this.updateLabel();
          this.updateTooltip();
          this.updateClass();
        }
      };
      this._register(this._altKey.event(updateAltState));
      this._register(addDisposableListener(container, "mouseleave", (_) => {
        isMouseOver = false;
        updateAltState();
      }));
      this._register(addDisposableListener(container, "mouseenter", (_) => {
        isMouseOver = true;
        updateAltState();
      }));
      updateAltState();
    }
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.textContent = this._commandAction.label;
    }
  }
  getTooltip() {
    const tooltip = this._commandAction.tooltip || this._commandAction.label;
    let title = this._keybindingService.appendKeybinding(tooltip, this._commandAction.id, this._contextKeyService);
    if (!this._wantsAltCommand && this._menuItemAction.alt?.enabled) {
      const altTooltip = this._menuItemAction.alt.tooltip || this._menuItemAction.alt.label;
      const altTitleSection = this._keybindingService.appendKeybinding(altTooltip, this._menuItemAction.alt.id, this._contextKeyService);
      title = localize("titleAndKbAndAlt", "{0}\n[{1}] {2}", title, UILabelProvider.modifierLabels[OS].altKey, altTitleSection);
    }
    return title;
  }
  updateClass() {
    if (this.options.icon) {
      if (this._commandAction !== this._menuItemAction) {
        if (this._menuItemAction.alt) {
          this._updateItemClass(this._menuItemAction.alt.item);
        }
      } else {
        this._updateItemClass(this._menuItemAction.item);
      }
    }
  }
  _updateItemClass(item) {
    this._itemClassDispose.value = void 0;
    const { element, label } = this;
    if (!element || !label) {
      return;
    }
    const icon = this._commandAction.checked && isICommandActionToggleInfo(item.toggled) && item.toggled.icon ? item.toggled.icon : item.icon;
    if (!icon) {
      return;
    }
    if (ThemeIcon.isThemeIcon(icon)) {
      const iconClasses = ThemeIcon.asClassNameArray(icon);
      label.classList.add(...iconClasses);
      this._itemClassDispose.value = toDisposable(() => {
        label.classList.remove(...iconClasses);
      });
    } else {
      label.style.backgroundImage = isDark(this._themeService.getColorTheme().type) ? asCSSUrl(icon.dark) : asCSSUrl(icon.light);
      label.classList.add("icon");
      this._itemClassDispose.value = combinedDisposable(
        toDisposable(() => {
          label.style.backgroundImage = "";
          label.classList.remove("icon");
        }),
        this._themeService.onDidColorThemeChange(() => {
          this.updateClass();
        })
      );
    }
  }
};
MenuEntryActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService)
], MenuEntryActionViewItem);
class TextOnlyMenuEntryActionViewItem extends MenuEntryActionViewItem {
  render(container) {
    this.options.label = true;
    this.options.icon = false;
    super.render(container);
    container.classList.add("text-only");
    container.classList.toggle("use-comma", this._options?.useComma ?? false);
  }
  updateLabel() {
    const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService);
    if (!kb) {
      return super.updateLabel();
    }
    if (this.label) {
      const kb2 = TextOnlyMenuEntryActionViewItem._symbolPrintEnter(kb);
      if (this._options?.conversational) {
        this.label.textContent = localize({ key: "content2", comment: ['A label with keybindg like "ESC to dismiss"'] }, "{1} to {0}", this._action.label, kb2);
      } else {
        this.label.textContent = localize({ key: "content", comment: ["A label", "A keybinding"] }, "{0} ({1})", this._action.label, kb2);
      }
    }
  }
  static _symbolPrintEnter(kb) {
    return kb.getLabel()?.replace(/\benter\b/gi, "\u23CE").replace(/\bEscape\b/gi, "Esc");
  }
}
let SubmenuEntryActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, _keybindingService, _contextMenuService, _themeService) {
    const dropdownOptions = {
      ...options,
      menuAsChild: options?.menuAsChild ?? false,
      classNames: options?.classNames ?? (ThemeIcon.isThemeIcon(action.item.icon) ? ThemeIcon.asClassName(action.item.icon) : void 0),
      keybindingProvider: options?.keybindingProvider ?? ((action2) => _keybindingService.lookupKeybinding(action2.id))
    };
    super(action, { getActions: () => action.actions }, _contextMenuService, dropdownOptions);
    this._keybindingService = _keybindingService;
    this._contextMenuService = _contextMenuService;
    this._themeService = _themeService;
  }
  render(container) {
    super.render(container);
    assertType(this.element);
    container.classList.add("menu-entry");
    const action = this._action;
    const { icon } = action.item;
    if (icon && !ThemeIcon.isThemeIcon(icon)) {
      this.element.classList.add("icon");
      const setBackgroundImage = () => {
        if (this.element) {
          this.element.style.backgroundImage = isDark(this._themeService.getColorTheme().type) ? asCSSUrl(icon.dark) : asCSSUrl(icon.light);
        }
      };
      setBackgroundImage();
      this._register(this._themeService.onDidColorThemeChange(() => {
        setBackgroundImage();
      }));
    }
  }
};
SubmenuEntryActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IThemeService)
], SubmenuEntryActionViewItem);
let DropdownWithDefaultActionViewItem = class extends BaseActionViewItem {
  constructor(submenuAction, options, _keybindingService, _notificationService, _contextMenuService, _menuService, _instaService, _storageService, _commandService) {
    super(null, submenuAction);
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._contextMenuService = _contextMenuService;
    this._menuService = _menuService;
    this._instaService = _instaService;
    this._storageService = _storageService;
    this._commandService = _commandService;
    this._defaultActionDisposables = this._register(new DisposableStore());
    this._container = null;
    this._primaryActionListener = this._register(new MutableDisposable());
    this._options = options;
    this._storageKey = `${submenuAction.item.submenu.id}_lastActionId`;
    let defaultAction;
    const defaultActionId = options?.togglePrimaryAction ? _storageService.get(this._storageKey, StorageScope.WORKSPACE) : void 0;
    if (defaultActionId) {
      defaultAction = submenuAction.actions.find((a) => defaultActionId === a.id && this._canBePrimaryAction(a));
    }
    if (!defaultAction) {
      defaultAction = submenuAction.actions.find((action) => this._canBePrimaryAction(action)) ?? submenuAction.actions[0];
    }
    this._defaultAction = this._defaultActionDisposables.add(this._instaService.createInstance(MenuEntryActionViewItem, defaultAction, { keybinding: this._getDefaultActionKeybindingLabel(defaultAction), hoverDelegate: options?.hoverDelegate }));
    const dropdownOptions = {
      keybindingProvider: (action) => this._keybindingService.lookupKeybinding(action.id),
      ...options,
      menuAsChild: options?.menuAsChild ?? true,
      classNames: options?.classNames ?? ["codicon", "codicon-chevron-down"],
      actionRunner: options?.actionRunner ?? this._register(new ActionRunner())
    };
    this._dropdown = this._register(new DropdownMenuActionViewItem(submenuAction, submenuAction.actions, this._contextMenuService, dropdownOptions));
    if (options?.togglePrimaryAction) {
      this.registerTogglePrimaryActionListener();
    }
  }
  get onDidChangeDropdownVisibility() {
    return this._dropdown.onDidChangeVisibility;
  }
  registerTogglePrimaryActionListener() {
    this._primaryActionListener.value = this._options?.primaryActionIds?.length ? this._commandService.onDidExecuteCommand((event) => {
      const action = this._action.actions.find((action2) => action2.id === event.commandId);
      if (action instanceof MenuItemAction && this._canBePrimaryAction(action)) {
        this.update(action);
      }
    }) : this._dropdown.actionRunner.onDidRun((e) => {
      if (e.action instanceof MenuItemAction) {
        this.update(e.action);
      }
    });
  }
  update(lastAction) {
    if (!this._canBePrimaryAction(lastAction)) {
      return;
    }
    if (this._options?.togglePrimaryAction) {
      if (this._storageService.get(this._storageKey, StorageScope.WORKSPACE) !== lastAction.id) {
        this._storageService.store(this._storageKey, lastAction.id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    }
    if (this._defaultAction.action.id === lastAction.id) {
      return;
    }
    this._defaultActionDisposables.clear();
    this._defaultAction = this._defaultActionDisposables.add(this._instaService.createInstance(MenuEntryActionViewItem, lastAction, { keybinding: this._getDefaultActionKeybindingLabel(lastAction), hoverDelegate: this._options?.hoverDelegate }));
    this._defaultAction.actionRunner = this._defaultActionDisposables.add(new class extends ActionRunner {
      async runAction(action, context) {
        await action.run(void 0);
      }
    }());
    if (this._container) {
      this._defaultAction.render(prepend(this._container, $(".action-container")));
    }
  }
  _canBePrimaryAction(action) {
    return !this._options?.primaryActionIds?.length || this._options.primaryActionIds.includes(action.id);
  }
  _getDefaultActionKeybindingLabel(defaultAction) {
    let defaultActionKeybinding;
    if (this._options?.renderKeybindingWithDefaultActionLabel) {
      const kb = this._keybindingService.lookupKeybinding(defaultAction.id);
      if (kb) {
        defaultActionKeybinding = `(${kb.getLabel()})`;
      }
    }
    return defaultActionKeybinding;
  }
  setActionContext(newContext) {
    super.setActionContext(newContext);
    this._defaultAction.setActionContext(newContext);
    this._dropdown.setActionContext(newContext);
  }
  set actionRunner(actionRunner) {
    super.actionRunner = actionRunner;
    this._defaultAction.actionRunner = actionRunner;
    if (!this._options?.togglePrimaryAction || this._options.primaryActionIds?.length) {
      this._dropdown.actionRunner = actionRunner;
    }
  }
  get actionRunner() {
    return super.actionRunner;
  }
  render(container) {
    this._container = container;
    super.render(this._container);
    this._container.classList.add("monaco-dropdown-with-default");
    const primaryContainer = $(".action-container");
    this._defaultAction.render(append(this._container, primaryContainer));
    this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this._defaultAction.element.tabIndex = -1;
        this._dropdown.focus();
        event.stopPropagation();
      }
    }));
    const dropdownContainer = $(".dropdown-action-container");
    this._dropdown.render(append(this._container, dropdownContainer));
    this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        this._defaultAction.element.tabIndex = 0;
        this._dropdown.setFocusable(false);
        this._defaultAction.element?.focus();
        event.stopPropagation();
      }
    }));
  }
  focus(fromRight) {
    if (fromRight) {
      this._dropdown.focus();
    } else {
      this._defaultAction.element.tabIndex = 0;
      this._defaultAction.element.focus();
    }
  }
  blur() {
    this._defaultAction.element.tabIndex = -1;
    this._dropdown.blur();
    this._container.blur();
  }
  setFocusable(focusable) {
    if (focusable) {
      this._defaultAction.element.tabIndex = 0;
    } else {
      this._defaultAction.element.tabIndex = -1;
      this._dropdown.setFocusable(false);
    }
  }
};
DropdownWithDefaultActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ICommandService)
], DropdownWithDefaultActionViewItem);
let SubmenuEntrySelectActionViewItem = class extends SelectActionViewItem {
  constructor(action, contextViewService, configurationService) {
    super(null, action, action.actions.map((a) => a.id === Separator.ID ? SeparatorSelectOption : { text: a.label, isDisabled: !a.enabled }), 0, contextViewService, defaultSelectBoxStyles, { ariaLabel: action.tooltip || action.label, optionsAsChildren: true, useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.select(Math.max(0, action.actions.findIndex((a) => a.checked)));
  }
  render(container) {
    super.render(container);
    container.style.borderColor = asCssVariable(selectBorder);
  }
  runAction(option, index) {
    const action = this.action.actions[index];
    if (action) {
      this.actionRunner.run(action);
    }
  }
};
SubmenuEntrySelectActionViewItem = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IConfigurationService)
], SubmenuEntrySelectActionViewItem);
function createActionViewItem(instaService, action, options) {
  if (action instanceof MenuItemAction) {
    return instaService.createInstance(MenuEntryActionViewItem, action, options);
  } else if (action instanceof SubmenuItemAction) {
    if (action.item.isSelection) {
      return instaService.createInstance(SubmenuEntrySelectActionViewItem, action);
    } else if (action.item.isSplitButton) {
      return instaService.createInstance(DropdownWithDefaultActionViewItem, action, {
        ...options,
        togglePrimaryAction: typeof action.item.isSplitButton !== "boolean" ? action.item.isSplitButton.togglePrimaryAction : false,
        primaryActionIds: typeof action.item.isSplitButton !== "boolean" ? action.item.isSplitButton.primaryActionIds : void 0
      });
    } else {
      return instaService.createInstance(SubmenuEntryActionViewItem, action, options);
    }
  } else {
    return void 0;
  }
}
export {
  DropdownWithDefaultActionViewItem,
  MenuEntryActionViewItem,
  SubmenuEntryActionViewItem,
  TextOnlyMenuEntryActionViewItem,
  createActionViewItem,
  fillInActionBarActions,
  getActionBarActions,
  getContextMenuActions,
  getFlatActionBarActions,
  getFlatContextMenuActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQ1NTVXJsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudFR5cGUsIE1vZGlmaWVyS2V5RW1pdHRlciwgcHJlcGVuZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIEJhc2VBY3Rpb25WaWV3SXRlbSwgU2VsZWN0QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSwgSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yU2VsZWN0T3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyLCBJUnVuRXZlbnQsIFNlcGFyYXRvciwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVSUxhYmVsUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nTGFiZWxzLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc1dpbmRvd3MsIE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uLCBpc0lDb21tYW5kQWN0aW9uVG9nZ2xlSW5mbyB9IGZyb20gJy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgc2VsZWN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2xpY2tBbmltYXRpb24sIHRyaWdnZXJDbGlja0FuaW1hdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hbmltYXRpb25zL2FuaW1hdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51IH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SXRlbUFjdGlvbiwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyB7XG5cdHByaW1hcnk6IElBY3Rpb25bXTtcblx0c2Vjb25kYXJ5OiBJQWN0aW9uW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250ZXh0TWVudUFjdGlvbnMoXG5cdGdyb3VwczogUmVhZG9ubHlBcnJheTxbc3RyaW5nLCBSZWFkb25seUFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XT4sXG5cdHByaW1hcnlHcm91cD86IHN0cmluZ1xuKTogUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMge1xuXHRjb25zdCB0YXJnZXQ6IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zID0geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9O1xuXHRnZXRDb250ZXh0TWVudUFjdGlvbnNJbXBsKGdyb3VwcywgdGFyZ2V0LCBwcmltYXJ5R3JvdXApO1xuXHRyZXR1cm4gdGFyZ2V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucyhcblx0Z3JvdXBzOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFJlYWRvbmx5QXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dPixcblx0cHJpbWFyeUdyb3VwPzogc3RyaW5nXG4pOiBJQWN0aW9uW10ge1xuXHRjb25zdCB0YXJnZXQ6IElBY3Rpb25bXSA9IFtdO1xuXHRnZXRDb250ZXh0TWVudUFjdGlvbnNJbXBsKGdyb3VwcywgdGFyZ2V0LCBwcmltYXJ5R3JvdXApO1xuXHRyZXR1cm4gdGFyZ2V0O1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0TWVudUFjdGlvbnNJbXBsKFxuXHRncm91cHM6IFJlYWRvbmx5QXJyYXk8W3N0cmluZywgUmVhZG9ubHlBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl0+LFxuXHR0YXJnZXQ6IElBY3Rpb25bXSB8IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zLFxuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmdcbikge1xuXHRjb25zdCBtb2RpZmllcktleUVtaXR0ZXIgPSBNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKTtcblx0Y29uc3QgdXNlQWx0ZXJuYXRpdmVBY3Rpb25zID0gbW9kaWZpZXJLZXlFbWl0dGVyLmtleVN0YXR1cy5hbHRLZXkgfHwgKChpc1dpbmRvd3MgfHwgaXNMaW51eCkgJiYgbW9kaWZpZXJLZXlFbWl0dGVyLmtleVN0YXR1cy5zaGlmdEtleSk7XG5cdGZpbGxJbkFjdGlvbnMoZ3JvdXBzLCB0YXJnZXQsIHVzZUFsdGVybmF0aXZlQWN0aW9ucywgcHJpbWFyeUdyb3VwID8gYWN0aW9uR3JvdXAgPT4gYWN0aW9uR3JvdXAgPT09IHByaW1hcnlHcm91cCA6IGFjdGlvbkdyb3VwID0+IGFjdGlvbkdyb3VwID09PSAnbmF2aWdhdGlvbicpO1xufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBY3Rpb25CYXJBY3Rpb25zKFxuXHRncm91cHM6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdLFxuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmcgfCAoKGFjdGlvbkdyb3VwOiBzdHJpbmcpID0+IGJvb2xlYW4pLFxuXHRzaG91bGRJbmxpbmVTdWJtZW51PzogKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZywgZ3JvdXBTaXplOiBudW1iZXIpID0+IGJvb2xlYW4sXG5cdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zPzogYm9vbGVhblxuKTogUHJpbWFyeUFuZFNlY29uZGFyeUFjdGlvbnMge1xuXHRjb25zdCB0YXJnZXQ6IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zID0geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9O1xuXHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKGdyb3VwcywgdGFyZ2V0LCBwcmltYXJ5R3JvdXAsIHNob3VsZElubGluZVN1Ym1lbnUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zKTtcblx0cmV0dXJuIHRhcmdldDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKFxuXHRncm91cHM6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdLFxuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmcgfCAoKGFjdGlvbkdyb3VwOiBzdHJpbmcpID0+IGJvb2xlYW4pLFxuXHRzaG91bGRJbmxpbmVTdWJtZW51PzogKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZywgZ3JvdXBTaXplOiBudW1iZXIpID0+IGJvb2xlYW4sXG5cdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zPzogYm9vbGVhblxuKTogSUFjdGlvbltdIHtcblx0Y29uc3QgdGFyZ2V0OiBJQWN0aW9uW10gPSBbXTtcblx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhncm91cHMsIHRhcmdldCwgcHJpbWFyeUdyb3VwLCBzaG91bGRJbmxpbmVTdWJtZW51LCB1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9ucyk7XG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKFxuXHRncm91cHM6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdLFxuXHR0YXJnZXQ6IElBY3Rpb25bXSB8IFByaW1hcnlBbmRTZWNvbmRhcnlBY3Rpb25zLFxuXHRwcmltYXJ5R3JvdXA/OiBzdHJpbmcgfCAoKGFjdGlvbkdyb3VwOiBzdHJpbmcpID0+IGJvb2xlYW4pLFxuXHRzaG91bGRJbmxpbmVTdWJtZW51PzogKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZywgZ3JvdXBTaXplOiBudW1iZXIpID0+IGJvb2xlYW4sXG5cdHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zPzogYm9vbGVhblxuKTogdm9pZCB7XG5cdGNvbnN0IGlzUHJpbWFyeUFjdGlvbiA9IHR5cGVvZiBwcmltYXJ5R3JvdXAgPT09ICdzdHJpbmcnID8gKGFjdGlvbkdyb3VwOiBzdHJpbmcpID0+IGFjdGlvbkdyb3VwID09PSBwcmltYXJ5R3JvdXAgOiBwcmltYXJ5R3JvdXA7XG5cblx0Ly8gQWN0aW9uIGJhcnMgaGFuZGxlIGFsdGVybmF0aXZlIGFjdGlvbnMgb24gdGhlaXIgb3duIHNvIHRoZSBhbHRlcm5hdGl2ZSBhY3Rpb25zIHNob3VsZCBiZSBpZ25vcmVkXG5cdGZpbGxJbkFjdGlvbnMoZ3JvdXBzLCB0YXJnZXQsIGZhbHNlLCBpc1ByaW1hcnlBY3Rpb24sIHNob3VsZElubGluZVN1Ym1lbnUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zKTtcbn1cblxuZnVuY3Rpb24gZmlsbEluQWN0aW9ucyhcblx0Z3JvdXBzOiBSZWFkb25seUFycmF5PFtzdHJpbmcsIFJlYWRvbmx5QXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dPixcblx0dGFyZ2V0OiBJQWN0aW9uW10gfCBQcmltYXJ5QW5kU2Vjb25kYXJ5QWN0aW9ucyxcblx0dXNlQWx0ZXJuYXRpdmVBY3Rpb25zOiBib29sZWFuLFxuXHRpc1ByaW1hcnlBY3Rpb246IChhY3Rpb25Hcm91cDogc3RyaW5nKSA9PiBib29sZWFuID0gYWN0aW9uR3JvdXAgPT4gYWN0aW9uR3JvdXAgPT09ICduYXZpZ2F0aW9uJyxcblx0c2hvdWxkSW5saW5lU3VibWVudTogKGFjdGlvbjogU3VibWVudUFjdGlvbiwgZ3JvdXA6IHN0cmluZywgZ3JvdXBTaXplOiBudW1iZXIpID0+IGJvb2xlYW4gPSAoKSA9PiBmYWxzZSxcblx0dXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IGJvb2xlYW4gPSBmYWxzZVxuKTogdm9pZCB7XG5cblx0bGV0IHByaW1hcnlCdWNrZXQ6IElBY3Rpb25bXTtcblx0bGV0IHNlY29uZGFyeUJ1Y2tldDogSUFjdGlvbltdO1xuXHRpZiAoQXJyYXkuaXNBcnJheSh0YXJnZXQpKSB7XG5cdFx0cHJpbWFyeUJ1Y2tldCA9IHRhcmdldDtcblx0XHRzZWNvbmRhcnlCdWNrZXQgPSB0YXJnZXQ7XG5cdH0gZWxzZSB7XG5cdFx0cHJpbWFyeUJ1Y2tldCA9IHRhcmdldC5wcmltYXJ5O1xuXHRcdHNlY29uZGFyeUJ1Y2tldCA9IHRhcmdldC5zZWNvbmRhcnk7XG5cdH1cblxuXHRjb25zdCBzdWJtZW51SW5mbyA9IG5ldyBTZXQ8eyBncm91cDogc3RyaW5nOyBhY3Rpb246IFN1Ym1lbnVBY3Rpb247IGluZGV4OiBudW1iZXIgfT4oKTtcblxuXHRmb3IgKGNvbnN0IFtncm91cCwgYWN0aW9uc10gb2YgZ3JvdXBzKSB7XG5cblx0XHRsZXQgdGFyZ2V0OiBJQWN0aW9uW107XG5cdFx0aWYgKGlzUHJpbWFyeUFjdGlvbihncm91cCkpIHtcblx0XHRcdHRhcmdldCA9IHByaW1hcnlCdWNrZXQ7XG5cdFx0XHRpZiAodGFyZ2V0Lmxlbmd0aCA+IDAgJiYgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnMpIHtcblx0XHRcdFx0dGFyZ2V0LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0ID0gc2Vjb25kYXJ5QnVja2V0O1xuXHRcdFx0aWYgKHRhcmdldC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRhcmdldC5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGlmICh1c2VBbHRlcm5hdGl2ZUFjdGlvbnMpIHtcblx0XHRcdFx0YWN0aW9uID0gYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgYWN0aW9uLmFsdCA/IGFjdGlvbi5hbHQgOiBhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdMZW4gPSB0YXJnZXQucHVzaChhY3Rpb24pO1xuXHRcdFx0Ly8ga2VlcCBzdWJtZW51IGluZm8gZm9yIGxhdGVyIGlubGluaW5nXG5cdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikge1xuXHRcdFx0XHRzdWJtZW51SW5mby5hZGQoeyBncm91cCwgYWN0aW9uLCBpbmRleDogbmV3TGVuIC0gMSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBhc2sgdGhlIG91dHNpZGUgaWYgc3VibWVudSBzaG91bGQgYmUgaW5saW5lZCBvciBub3QuIG9ubHkgYXNrIHdoZW5cblx0Ly8gdGhlcmUgd291bGQgYmUgZW5vdWdoIHNwYWNlXG5cdGZvciAoY29uc3QgeyBncm91cCwgYWN0aW9uLCBpbmRleCB9IG9mIHN1Ym1lbnVJbmZvKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gaXNQcmltYXJ5QWN0aW9uKGdyb3VwKSA/IHByaW1hcnlCdWNrZXQgOiBzZWNvbmRhcnlCdWNrZXQ7XG5cblx0XHQvLyBpbmxpbmluZyBzdWJtZW51cyB3aXRoIGxlbmd0aCAwIG9yIDEgaXMgZWFzeSxcblx0XHQvLyBsYXJnZXIgc3VibWVudXMgbmVlZCB0byBiZSBjaGVja2VkIHdpdGggdGhlIG92ZXJhbGwgbGltaXRcblx0XHRjb25zdCBzdWJtZW51QWN0aW9ucyA9IGFjdGlvbi5hY3Rpb25zO1xuXHRcdGlmIChzaG91bGRJbmxpbmVTdWJtZW51KGFjdGlvbiwgZ3JvdXAsIHRhcmdldC5sZW5ndGgpKSB7XG5cdFx0XHR0YXJnZXQuc3BsaWNlKGluZGV4LCAxLCAuLi5zdWJtZW51QWN0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGRyYWdnYWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGtleWJpbmRpbmc/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBob3ZlckRlbGVnYXRlPzogSUhvdmVyRGVsZWdhdGU7XG5cdHJlYWRvbmx5IGtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9uQ2xpY2tBbmltYXRpb24/OiBDbGlja0FuaW1hdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtPFQgZXh0ZW5kcyBJTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zID0gSU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucz4gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBfd2FudHNBbHRDb21tYW5kOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1DbGFzc0Rpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsdEtleTogTW9kaWZpZXJLZXlFbWl0dGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vcHRpb25zOiBUIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgeyBpY29uOiAhIShhY3Rpb24uY2xhc3MgfHwgYWN0aW9uLml0ZW0uaWNvbiksIGxhYmVsOiAhYWN0aW9uLmNsYXNzICYmICFhY3Rpb24uaXRlbS5pY29uLCBkcmFnZ2FibGU6IF9vcHRpb25zPy5kcmFnZ2FibGUsIGtleWJpbmRpbmc6IF9vcHRpb25zPy5rZXliaW5kaW5nLCBob3ZlckRlbGVnYXRlOiBfb3B0aW9ucz8uaG92ZXJEZWxlZ2F0ZSwga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsOiBfb3B0aW9ucz8ua2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsIH0pO1xuXHRcdHRoaXMuX2FsdEtleSA9IE1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBfbWVudUl0ZW1BY3Rpb24oKTogTWVudUl0ZW1BY3Rpb24ge1xuXHRcdHJldHVybiA8TWVudUl0ZW1BY3Rpb24+dGhpcy5fYWN0aW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldCBfY29tbWFuZEFjdGlvbigpOiBNZW51SXRlbUFjdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dhbnRzQWx0Q29tbWFuZCAmJiB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQgfHwgdGhpcy5fbWVudUl0ZW1BY3Rpb247XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBvbkNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5vbkNsaWNrQW5pbWF0aW9uICYmIHRoaXMuZWxlbWVudCAmJiAhdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdGNvbnN0IGljb24gPSB0aGlzLl9tZW51SXRlbUFjdGlvbi5pdGVtLmljb247XG5cdFx0XHR0cmlnZ2VyQ2xpY2tBbmltYXRpb24odGhpcy5lbGVtZW50LCB0aGlzLl9vcHRpb25zLm9uQ2xpY2tBbmltYXRpb24sIFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSA/IGljb24gOiB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5fY29tbWFuZEFjdGlvbiwgdGhpcy5fY29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWVudS1lbnRyeScpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVJdGVtQ2xhc3ModGhpcy5fbWVudUl0ZW1BY3Rpb24uaXRlbSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdCkge1xuXHRcdFx0bGV0IGlzTW91c2VPdmVyID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZUFsdFN0YXRlID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB3YW50c0FsdENvbW1hbmQgPSAhIXRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdD8uZW5hYmxlZCAmJlxuXHRcdFx0XHRcdCghdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkgfHwgaXNNb3VzZU92ZXIpICYmIChcblx0XHRcdFx0XHRcdHRoaXMuX2FsdEtleS5rZXlTdGF0dXMuYWx0S2V5IHx8XG5cdFx0XHRcdFx0XHQodGhpcy5fYWx0S2V5LmtleVN0YXR1cy5zaGlmdEtleSAmJiBpc01vdXNlT3Zlcilcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdGlmICh3YW50c0FsdENvbW1hbmQgIT09IHRoaXMuX3dhbnRzQWx0Q29tbWFuZCkge1xuXHRcdFx0XHRcdHRoaXMuX3dhbnRzQWx0Q29tbWFuZCA9IHdhbnRzQWx0Q29tbWFuZDtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hbHRLZXkuZXZlbnQodXBkYXRlQWx0U3RhdGUpKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ21vdXNlbGVhdmUnLCBfID0+IHtcblx0XHRcdFx0aXNNb3VzZU92ZXIgPSBmYWxzZTtcblx0XHRcdFx0dXBkYXRlQWx0U3RhdGUoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgJ21vdXNlZW50ZXInLCBfID0+IHtcblx0XHRcdFx0aXNNb3VzZU92ZXIgPSB0cnVlO1xuXHRcdFx0XHR1cGRhdGVBbHRTdGF0ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR1cGRhdGVBbHRTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLl9jb21tYW5kQWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCkge1xuXHRcdGNvbnN0IHRvb2x0aXAgPSB0aGlzLl9jb21tYW5kQWN0aW9uLnRvb2x0aXAgfHwgdGhpcy5fY29tbWFuZEFjdGlvbi5sYWJlbDtcblx0XHRsZXQgdGl0bGUgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKHRvb2x0aXAsIHRoaXMuX2NvbW1hbmRBY3Rpb24uaWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoIXRoaXMuX3dhbnRzQWx0Q29tbWFuZCAmJiB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQ/LmVuYWJsZWQpIHtcblx0XHRcdGNvbnN0IGFsdFRvb2x0aXAgPSB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQudG9vbHRpcCB8fCB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQubGFiZWw7XG5cdFx0XHRjb25zdCBhbHRUaXRsZVNlY3Rpb24gPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGFsdFRvb2x0aXAsIHRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdC5pZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0XHR0aXRsZSA9IGxvY2FsaXplKCd0aXRsZUFuZEtiQW5kQWx0JywgXCJ7MH1cXG5bezF9XSB7Mn1cIiwgdGl0bGUsIFVJTGFiZWxQcm92aWRlci5tb2RpZmllckxhYmVsc1tPU10uYWx0S2V5LCBhbHRUaXRsZVNlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbiAhPT0gdGhpcy5fbWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0aWYgKHRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdCkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUl0ZW1DbGFzcyh0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQuaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUl0ZW1DbGFzcyh0aGlzLl9tZW51SXRlbUFjdGlvbi5pdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJdGVtQ2xhc3MoaXRlbTogSUNvbW1hbmRBY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9pdGVtQ2xhc3NEaXNwb3NlLnZhbHVlID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgeyBlbGVtZW50LCBsYWJlbCB9ID0gdGhpcztcblx0XHRpZiAoIWVsZW1lbnQgfHwgIWxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbiA9IHRoaXMuX2NvbW1hbmRBY3Rpb24uY2hlY2tlZCAmJiBpc0lDb21tYW5kQWN0aW9uVG9nZ2xlSW5mbyhpdGVtLnRvZ2dsZWQpICYmIGl0ZW0udG9nZ2xlZC5pY29uID8gaXRlbS50b2dnbGVkLmljb24gOiBpdGVtLmljb247XG5cblx0XHRpZiAoIWljb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHQvLyB0aGVtZSBpY29uc1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKTtcblx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQoLi4uaWNvbkNsYXNzZXMpO1xuXHRcdFx0dGhpcy5faXRlbUNsYXNzRGlzcG9zZS52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoLi4uaWNvbkNsYXNzZXMpO1xuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gaWNvbiBwYXRoL3VybFxuXHRcdFx0bGFiZWwuc3R5bGUuYmFja2dyb3VuZEltYWdlID0gKFxuXHRcdFx0XHRpc0RhcmsodGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKVxuXHRcdFx0XHRcdD8gYXNDU1NVcmwoaWNvbi5kYXJrKVxuXHRcdFx0XHRcdDogYXNDU1NVcmwoaWNvbi5saWdodClcblx0XHRcdCk7XG5cdFx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKCdpY29uJyk7XG5cdFx0XHR0aGlzLl9pdGVtQ2xhc3NEaXNwb3NlLnZhbHVlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdGxhYmVsLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2ljb24nKTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHJlZnJlc2ggd2hlbiB0aGUgdGhlbWUgY2hhbmdlcyBpbiBjYXNlIHdlIGdvIGJldHdlZW4gZGFyayA8LT4gbGlnaHRcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0T25seU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyBleHRlbmRzIElNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnMge1xuXHRyZWFkb25seSBjb252ZXJzYXRpb25hbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZUNvbW1hPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRPbmx5TWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbTxJVGV4dE9ubHlNZW51RW50cnlBY3Rpb25WaWV3SXRlbU9wdGlvbnM+IHtcblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMub3B0aW9ucy5sYWJlbCA9IHRydWU7XG5cdFx0dGhpcy5vcHRpb25zLmljb24gPSBmYWxzZTtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGV4dC1vbmx5Jyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3VzZS1jb21tYScsIHRoaXMuX29wdGlvbnM/LnVzZUNvbW1hID8/IGZhbHNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpIHtcblx0XHRjb25zdCBrYiA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcodGhpcy5fYWN0aW9uLmlkLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCFrYikge1xuXHRcdFx0cmV0dXJuIHN1cGVyLnVwZGF0ZUxhYmVsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHRjb25zdCBrYjIgPSBUZXh0T25seU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLl9zeW1ib2xQcmludEVudGVyKGtiKTtcblxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnM/LmNvbnZlcnNhdGlvbmFsKSB7XG5cdFx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSh7IGtleTogJ2NvbnRlbnQyJywgY29tbWVudDogWydBIGxhYmVsIHdpdGgga2V5YmluZGcgbGlrZSBcIkVTQyB0byBkaXNtaXNzXCInXSB9LCAnezF9IHRvIHswfScsIHRoaXMuX2FjdGlvbi5sYWJlbCwga2IyKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKHsga2V5OiAnY29udGVudCcsIGNvbW1lbnQ6IFsnQSBsYWJlbCcsICdBIGtleWJpbmRpbmcnXSB9LCAnezB9ICh7MX0pJywgdGhpcy5fYWN0aW9uLmxhYmVsLCBrYjIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zeW1ib2xQcmludEVudGVyKGtiOiBSZXNvbHZlZEtleWJpbmRpbmcpIHtcblx0XHRyZXR1cm4ga2IuZ2V0TGFiZWwoKVxuXHRcdFx0Py5yZXBsYWNlKC9cXGJlbnRlclxcYi9naSwgJ1xcdTIzQ0UnKVxuXHRcdFx0LnJlcGxhY2UoL1xcYkVzY2FwZVxcYi9naSwgJ0VzYycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdWJtZW51RW50cnlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IFN1Ym1lbnVJdGVtQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJvdGVjdGVkIF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgZHJvcGRvd25PcHRpb25zOiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG1lbnVBc0NoaWxkOiBvcHRpb25zPy5tZW51QXNDaGlsZCA/PyBmYWxzZSxcblx0XHRcdGNsYXNzTmFtZXM6IG9wdGlvbnM/LmNsYXNzTmFtZXMgPz8gKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihhY3Rpb24uaXRlbS5pY29uKSA/IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShhY3Rpb24uaXRlbS5pY29uKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRrZXliaW5kaW5nUHJvdmlkZXI6IG9wdGlvbnM/LmtleWJpbmRpbmdQcm92aWRlciA/PyAoYWN0aW9uID0+IF9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCkpXG5cdFx0fTtcblxuXHRcdHN1cGVyKGFjdGlvbiwgeyBnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb24uYWN0aW9ucyB9LCBfY29udGV4dE1lbnVTZXJ2aWNlLCBkcm9wZG93bk9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRhc3NlcnRUeXBlKHRoaXMuZWxlbWVudCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWVudS1lbnRyeScpO1xuXHRcdGNvbnN0IGFjdGlvbiA9IDxTdWJtZW51SXRlbUFjdGlvbj50aGlzLl9hY3Rpb247XG5cdFx0Y29uc3QgeyBpY29uIH0gPSBhY3Rpb24uaXRlbTtcblx0XHRpZiAoaWNvbiAmJiAhVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaWNvbicpO1xuXHRcdFx0Y29uc3Qgc2V0QmFja2dyb3VuZEltYWdlID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IChcblx0XHRcdFx0XHRcdGlzRGFyayh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpXG5cdFx0XHRcdFx0XHRcdD8gYXNDU1NVcmwoaWNvbi5kYXJrKVxuXHRcdFx0XHRcdFx0XHQ6IGFzQ1NTVXJsKGljb24ubGlnaHQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHNldEJhY2tncm91bmRJbWFnZSgpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdC8vIHJlZnJlc2ggd2hlbiB0aGUgdGhlbWUgY2hhbmdlcyBpbiBjYXNlIHdlIGdvIGJldHdlZW4gZGFyayA8LT4gbGlnaHRcblx0XHRcdFx0c2V0QmFja2dyb3VuZEltYWdlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURyb3Bkb3duV2l0aERlZmF1bHRBY3Rpb25WaWV3SXRlbU9wdGlvbnMgZXh0ZW5kcyBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIHtcblx0cmVuZGVyS2V5YmluZGluZ1dpdGhEZWZhdWx0QWN0aW9uTGFiZWw/OiBib29sZWFuO1xuXHR0b2dnbGVQcmltYXJ5QWN0aW9uPzogYm9vbGVhbjtcblx0cHJpbWFyeUFjdGlvbklkcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgRHJvcGRvd25XaXRoRGVmYXVsdEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSURyb3Bkb3duV2l0aERlZmF1bHRBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RlZmF1bHRBY3Rpb246IEFjdGlvblZpZXdJdGVtO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0QWN0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcm9wZG93bjogRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW07XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZUtleTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmltYXJ5QWN0aW9uTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5KCk6IEV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fZHJvcGRvd24ub25EaWRDaGFuZ2VWaXNpYmlsaXR5O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c3VibWVudUFjdGlvbjogU3VibWVudUl0ZW1BY3Rpb24sXG5cdFx0b3B0aW9uczogSURyb3Bkb3duV2l0aERlZmF1bHRBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJvdGVjdGVkIF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcm90ZWN0ZWQgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBzdWJtZW51QWN0aW9uKTtcblx0XHR0aGlzLl9vcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9zdG9yYWdlS2V5ID0gYCR7c3VibWVudUFjdGlvbi5pdGVtLnN1Ym1lbnUuaWR9X2xhc3RBY3Rpb25JZGA7XG5cblx0XHQvLyBkZXRlcm1pbmUgZGVmYXVsdCBhY3Rpb25cblx0XHRsZXQgZGVmYXVsdEFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkZWZhdWx0QWN0aW9uSWQgPSBvcHRpb25zPy50b2dnbGVQcmltYXJ5QWN0aW9uID8gX3N0b3JhZ2VTZXJ2aWNlLmdldCh0aGlzLl9zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZGVmYXVsdEFjdGlvbklkKSB7XG5cdFx0XHRkZWZhdWx0QWN0aW9uID0gc3VibWVudUFjdGlvbi5hY3Rpb25zLmZpbmQoYSA9PiBkZWZhdWx0QWN0aW9uSWQgPT09IGEuaWQgJiYgdGhpcy5fY2FuQmVQcmltYXJ5QWN0aW9uKGEpKTtcblx0XHR9XG5cdFx0aWYgKCFkZWZhdWx0QWN0aW9uKSB7XG5cdFx0XHRkZWZhdWx0QWN0aW9uID0gc3VibWVudUFjdGlvbi5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IHRoaXMuX2NhbkJlUHJpbWFyeUFjdGlvbihhY3Rpb24pKSA/PyBzdWJtZW51QWN0aW9uLmFjdGlvbnNbMF07XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVmYXVsdEFjdGlvbiA9IHRoaXMuX2RlZmF1bHRBY3Rpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCA8TWVudUl0ZW1BY3Rpb24+ZGVmYXVsdEFjdGlvbiwgeyBrZXliaW5kaW5nOiB0aGlzLl9nZXREZWZhdWx0QWN0aW9uS2V5YmluZGluZ0xhYmVsKGRlZmF1bHRBY3Rpb24pLCBob3ZlckRlbGVnYXRlOiBvcHRpb25zPy5ob3ZlckRlbGVnYXRlIH0pKTtcblxuXHRcdGNvbnN0IGRyb3Bkb3duT3B0aW9uczogSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IHtcblx0XHRcdGtleWJpbmRpbmdQcm92aWRlcjogYWN0aW9uID0+IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRtZW51QXNDaGlsZDogb3B0aW9ucz8ubWVudUFzQ2hpbGQgPz8gdHJ1ZSxcblx0XHRcdGNsYXNzTmFtZXM6IG9wdGlvbnM/LmNsYXNzTmFtZXMgPz8gWydjb2RpY29uJywgJ2NvZGljb24tY2hldnJvbi1kb3duJ10sXG5cdFx0XHRhY3Rpb25SdW5uZXI6IG9wdGlvbnM/LmFjdGlvblJ1bm5lciA/PyB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uUnVubmVyKCkpLFxuXHRcdH07XG5cblx0XHR0aGlzLl9kcm9wZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbShzdWJtZW51QWN0aW9uLCBzdWJtZW51QWN0aW9uLmFjdGlvbnMsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwgZHJvcGRvd25PcHRpb25zKSk7XG5cdFx0aWYgKG9wdGlvbnM/LnRvZ2dsZVByaW1hcnlBY3Rpb24pIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJUb2dnbGVQcmltYXJ5QWN0aW9uTGlzdGVuZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVG9nZ2xlUHJpbWFyeUFjdGlvbkxpc3RlbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ByaW1hcnlBY3Rpb25MaXN0ZW5lci52YWx1ZSA9IHRoaXMuX29wdGlvbnM/LnByaW1hcnlBY3Rpb25JZHM/Lmxlbmd0aFxuXHRcdFx0PyB0aGlzLl9jb21tYW5kU2VydmljZS5vbkRpZEV4ZWN1dGVDb21tYW5kKGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gKDxTdWJtZW51SXRlbUFjdGlvbj50aGlzLl9hY3Rpb24pLmFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBldmVudC5jb21tYW5kSWQpO1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gJiYgdGhpcy5fY2FuQmVQcmltYXJ5QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZShhY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdFx0OiB0aGlzLl9kcm9wZG93bi5hY3Rpb25SdW5uZXIub25EaWRSdW4oKGU6IElSdW5FdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5hY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlKGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZShsYXN0QWN0aW9uOiBNZW51SXRlbUFjdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2FuQmVQcmltYXJ5QWN0aW9uKGxhc3RBY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy50b2dnbGVQcmltYXJ5QWN0aW9uKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuX3N0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpICE9PSBsYXN0QWN0aW9uLmlkKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuX3N0b3JhZ2VLZXksIGxhc3RBY3Rpb24uaWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWZhdWx0QWN0aW9uLmFjdGlvbi5pZCA9PT0gbGFzdEFjdGlvbi5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24gPSB0aGlzLl9kZWZhdWx0QWN0aW9uRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgbGFzdEFjdGlvbiwgeyBrZXliaW5kaW5nOiB0aGlzLl9nZXREZWZhdWx0QWN0aW9uS2V5YmluZGluZ0xhYmVsKGxhc3RBY3Rpb24pLCBob3ZlckRlbGVnYXRlOiB0aGlzLl9vcHRpb25zPy5ob3ZlckRlbGVnYXRlIH0pKTtcblx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLmFjdGlvblJ1bm5lciA9IHRoaXMuX2RlZmF1bHRBY3Rpb25EaXNwb3NhYmxlcy5hZGQobmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCBhY3Rpb24ucnVuKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblxuXHRcdGlmICh0aGlzLl9jb250YWluZXIpIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24ucmVuZGVyKHByZXBlbmQodGhpcy5fY29udGFpbmVyLCAkKCcuYWN0aW9uLWNvbnRhaW5lcicpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuQmVQcmltYXJ5QWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fb3B0aW9ucz8ucHJpbWFyeUFjdGlvbklkcz8ubGVuZ3RoIHx8IHRoaXMuX29wdGlvbnMucHJpbWFyeUFjdGlvbklkcy5pbmNsdWRlcyhhY3Rpb24uaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdEFjdGlvbktleWJpbmRpbmdMYWJlbChkZWZhdWx0QWN0aW9uOiBJQWN0aW9uKSB7XG5cdFx0bGV0IGRlZmF1bHRBY3Rpb25LZXliaW5kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnJlbmRlcktleWJpbmRpbmdXaXRoRGVmYXVsdEFjdGlvbkxhYmVsKSB7XG5cdFx0XHRjb25zdCBrYiA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoZGVmYXVsdEFjdGlvbi5pZCk7XG5cdFx0XHRpZiAoa2IpIHtcblx0XHRcdFx0ZGVmYXVsdEFjdGlvbktleWJpbmRpbmcgPSBgKCR7a2IuZ2V0TGFiZWwoKX0pYDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRBY3Rpb25LZXliaW5kaW5nO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0KTtcblx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLnNldEFjdGlvbkNvbnRleHQobmV3Q29udGV4dCk7XG5cdFx0dGhpcy5fZHJvcGRvd24uc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBhY3Rpb25SdW5uZXIoYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyKSB7XG5cdFx0c3VwZXIuYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXG5cdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cdFx0Ly8gV2l0aG91dCBhbiBhbGxvd2xpc3QsIHJldGFpbiB0aGUgcHJpdmF0ZSBydW5uZXIgc28gb25seSBkcm9wZG93biBleGVjdXRpb25zIGJlY29tZSBwcmltYXJ5LlxuXHRcdGlmICghdGhpcy5fb3B0aW9ucz8udG9nZ2xlUHJpbWFyeUFjdGlvbiB8fCB0aGlzLl9vcHRpb25zLnByaW1hcnlBY3Rpb25JZHM/Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZHJvcGRvd24uYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldCBhY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB7XG5cdFx0cmV0dXJuIHN1cGVyLmFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHN1cGVyLnJlbmRlcih0aGlzLl9jb250YWluZXIpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby1kcm9wZG93bi13aXRoLWRlZmF1bHQnKTtcblxuXHRcdGNvbnN0IHByaW1hcnlDb250YWluZXIgPSAkKCcuYWN0aW9uLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24ucmVuZGVyKGFwcGVuZCh0aGlzLl9jb250YWluZXIsIHByaW1hcnlDb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocHJpbWFyeUNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5fZHJvcGRvd24uZm9jdXMoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZHJvcGRvd25Db250YWluZXIgPSAkKCcuZHJvcGRvd24tYWN0aW9uLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duLnJlbmRlcihhcHBlbmQodGhpcy5fY29udGFpbmVyLCBkcm9wZG93bkNvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcm9wZG93bkNvbnRhaW5lciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5lbGVtZW50IS50YWJJbmRleCA9IDA7XG5cdFx0XHRcdHRoaXMuX2Ryb3Bkb3duLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudD8uZm9jdXMoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoZnJvbVJpZ2h0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChmcm9tUmlnaHQpIHtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRBY3Rpb24uZWxlbWVudCEudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5lbGVtZW50IS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5lbGVtZW50IS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX2Ryb3Bkb3duLmJsdXIoKTtcblx0XHR0aGlzLl9jb250YWluZXIhLmJsdXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0QWN0aW9uLmVsZW1lbnQhLnRhYkluZGV4ID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVmYXVsdEFjdGlvbi5lbGVtZW50IS50YWJJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5fZHJvcGRvd24uc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU3VibWVudUVudHJ5U2VsZWN0QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBTZWxlY3RBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBTdWJtZW51SXRlbUFjdGlvbixcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIGFjdGlvbi5hY3Rpb25zLm1hcChhID0+IChhLmlkID09PSBTZXBhcmF0b3IuSUQgPyBTZXBhcmF0b3JTZWxlY3RPcHRpb24gOiB7IHRleHQ6IGEubGFiZWwsIGlzRGlzYWJsZWQ6ICFhLmVuYWJsZWQsIH0pKSwgMCwgY29udGV4dFZpZXdTZXJ2aWNlLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCB7IGFyaWFMYWJlbDogYWN0aW9uLnRvb2x0aXAgfHwgYWN0aW9uLmxhYmVsLCBvcHRpb25zQXNDaGlsZHJlbjogdHJ1ZSwgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0dGhpcy5zZWxlY3QoTWF0aC5tYXgoMCwgYWN0aW9uLmFjdGlvbnMuZmluZEluZGV4KGEgPT4gYS5jaGVja2VkKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHNlbGVjdEJvcmRlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcnVuQWN0aW9uKG9wdGlvbjogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uID0gKHRoaXMuYWN0aW9uIGFzIFN1Ym1lbnVJdGVtQWN0aW9uKS5hY3Rpb25zW2luZGV4XTtcblx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4oYWN0aW9uKTtcblx0XHR9XG5cdH1cblxufVxuXG4vKipcbiAqIENyZWF0ZXMgYWN0aW9uIHZpZXcgaXRlbXMgZm9yIG1lbnUgYWN0aW9ucyBvciBzdWJtZW51IGFjdGlvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVBY3Rpb25WaWV3SXRlbShpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zIHwgSU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHVuZGVmaW5lZCB8IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHwgU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfCBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRyZXR1cm4gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHR9IGVsc2UgaWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0aWYgKGFjdGlvbi5pdGVtLmlzU2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Ym1lbnVFbnRyeVNlbGVjdEFjdGlvblZpZXdJdGVtLCBhY3Rpb24pO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uLml0ZW0uaXNTcGxpdEJ1dHRvbikge1xuXHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wZG93bldpdGhEZWZhdWx0QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHR0b2dnbGVQcmltYXJ5QWN0aW9uOiB0eXBlb2YgYWN0aW9uLml0ZW0uaXNTcGxpdEJ1dHRvbiAhPT0gJ2Jvb2xlYW4nID8gYWN0aW9uLml0ZW0uaXNTcGxpdEJ1dHRvbi50b2dnbGVQcmltYXJ5QWN0aW9uIDogZmFsc2UsXG5cdFx0XHRcdHByaW1hcnlBY3Rpb25JZHM6IHR5cGVvZiBhY3Rpb24uaXRlbS5pc1NwbGl0QnV0dG9uICE9PSAnYm9vbGVhbicgPyBhY3Rpb24uaXRlbS5pc1NwbGl0QnV0dG9uLnByaW1hcnlBY3Rpb25JZHMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWJtZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxvQkFBb0IsZUFBZTtBQUN6RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQixvQkFBb0IsNEJBQTRCO0FBQ3pFLFNBQVMsa0NBQXNFO0FBRS9FLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBaUQsV0FBVyxxQkFBcUI7QUFFMUYsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQ3JGLFNBQVMsU0FBUyxXQUFXLFVBQVU7QUFDdkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBeUIsa0NBQWtDO0FBQzNELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FB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
