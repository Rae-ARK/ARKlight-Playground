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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { Action } from "../../../../base/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { switchTerminalShowTabsTitle } from "./terminalActions.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from "./terminal.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from "../common/terminal.js";
import { TerminalSettingId, TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { ActionViewItem, SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { asCssVariable, selectBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { SeparatorSelectOption } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { TerminalTabbedView } from "./terminalTabbedView.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { getColorForSeverity } from "./terminalStatusList.js";
import { getFlatContextMenuActions, MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { DropdownWithPrimaryActionViewItem } from "../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js";
import { DisposableMap, DisposableStore, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { getColorClass, getUriClasses } from "./terminalIcon.js";
import { getTerminalActionBarArgs } from "./terminalMenus.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Event } from "../../../../base/common/event.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { InstanceContext, TerminalContextActionRunner } from "./terminalContextMenu.js";
import { MicrotaskDelay } from "../../../../base/common/symbols.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { hasKey } from "../../../../base/common/types.js";
let TerminalViewPane = class extends ViewPane {
  constructor(options, keybindingService, _contextKeyService, viewDescriptorService, _configurationService, contextMenuService, _instantiationService, _terminalService, _terminalConfigurationService, _terminalGroupService, themeService, hoverService, _notificationService, _keybindingService, openerService, _menuService, _terminalProfileService, _terminalProfileResolverService) {
    super(options, keybindingService, contextMenuService, _configurationService, _contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._terminalService = _terminalService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._notificationService = _notificationService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._terminalProfileService = _terminalProfileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._isInitialized = false;
    /**
     * Tracks an active promise of terminal creation requested by this component. This helps prevent
     * double creation for example when toggling a terminal's visibility and focusing it.
     */
    this._isTerminalBeingCreated = false;
    this._newDropdown = this._register(new MutableDisposable());
    this._disposableStore = this._register(new DisposableStore());
    this._actionDisposables = this._register(new DisposableMap());
    this._register(this._terminalService.onDidRegisterProcessSupport(() => {
      this._onDidChangeViewWelcomeState.fire();
    }));
    this._register(this._terminalService.onDidChangeInstances(() => {
      if (this._hasWelcomeScreen() && this._terminalGroupService.instances.length <= 1) {
        this._onDidChangeViewWelcomeState.fire();
      }
      if (!this._parentDomElement) {
        return;
      }
      if (!this._terminalTabbedView) {
        this._createTabsView();
      }
      this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
    }));
    this._dropdownMenu = this._register(this._menuService.createMenu(MenuId.TerminalNewDropdownContext, this._contextKeyService));
    this._singleTabMenu = this._register(this._menuService.createMenu(MenuId.TerminalTabContext, this._contextKeyService));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles((profiles) => this._updateTabActionBar(profiles)));
    this._viewShowing = TerminalContextKeys.viewShowing.bindTo(this._contextKeyService);
    this._register(this.onDidChangeBodyVisibility((e) => {
      if (e) {
        this._terminalTabbedView?.rerenderTabs();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (this._parentDomElement && (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled) || e.affectsConfiguration(TerminalSettingId.ShellIntegrationEnabled))) {
        this._updateForShellIntegration(this._parentDomElement);
      }
    }));
    const shellIntegrationDisposable = this._register(new MutableDisposable());
    shellIntegrationDisposable.value = this._terminalService.onAnyInstanceAddedCapabilityType((c) => {
      if (c === TerminalCapability.CommandDetection && this._gutterDecorationsEnabled()) {
        this._parentDomElement?.classList.add("shell-integration");
        shellIntegrationDisposable.clear();
      }
    });
  }
  get terminalTabbedView() {
    return this._terminalTabbedView;
  }
  _updateForShellIntegration(container) {
    container.classList.toggle("shell-integration", this._gutterDecorationsEnabled());
  }
  _gutterDecorationsEnabled() {
    const decorationsEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
    return (decorationsEnabled === "both" || decorationsEnabled === "gutter") && this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled);
  }
  _initializeTerminal(checkRestoredTerminals) {
    if (this.isBodyVisible() && this._terminalService.isProcessSupportRegistered && this._terminalService.connectionState === TerminalConnectionState.Connected) {
      const wasInitialized = this._isInitialized;
      this._isInitialized = true;
      let hideOnStartup = "never";
      if (!wasInitialized) {
        hideOnStartup = this._configurationService.getValue(TerminalSettingId.HideOnStartup);
        if (hideOnStartup === "always") {
          this._terminalGroupService.hidePanel();
        }
      }
      let shouldCreate = this._terminalGroupService.groups.length === 0;
      if (checkRestoredTerminals) {
        shouldCreate &&= this._terminalService.restoredGroupCount === 0;
      }
      if (!shouldCreate) {
        return;
      }
      if (!wasInitialized) {
        switch (hideOnStartup) {
          case "never":
            this._isTerminalBeingCreated = true;
            this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
            break;
          case "whenEmpty":
            if (this._terminalService.restoredGroupCount === 0) {
              this._terminalGroupService.hidePanel();
            }
            break;
        }
        return;
      }
      if (!this._isTerminalBeingCreated) {
        this._isTerminalBeingCreated = true;
        this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  renderBody(container) {
    super.renderBody(container);
    if (!this._parentDomElement) {
      this._updateForShellIntegration(container);
    }
    this._parentDomElement = container;
    this._parentDomElement.classList.add("integrated-terminal");
    domStylesheetsJs.createStyleSheet(this._parentDomElement);
    this._instantiationService.createInstance(TerminalThemeIconStyle, this._parentDomElement);
    if (!this.shouldShowWelcome()) {
      this._createTabsView();
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.FontFamily) || e.affectsConfiguration("editor.fontFamily")) {
        if (!this._terminalConfigurationService.configFontIsMonospace()) {
          const choices = [{
            label: nls.localize("terminal.useMonospace", "Use 'monospace'"),
            run: () => this.configurationService.updateValue(TerminalSettingId.FontFamily, "monospace")
          }];
          this._notificationService.prompt(Severity.Warning, nls.localize("terminal.monospaceOnly", "The terminal only supports monospace fonts. Be sure to restart VS Code if this is a newly installed font."), choices);
        }
      }
    }));
    this._register(this.onDidChangeBodyVisibility(async (visible) => {
      this._viewShowing.set(visible);
      if (visible) {
        if (this._hasWelcomeScreen()) {
          this._onDidChangeViewWelcomeState.fire();
        }
        this._initializeTerminal(false);
        this._terminalGroupService.showPanel(false);
      } else {
        for (const instance of this._terminalGroupService.instances) {
          instance.resetFocusContextKey();
        }
      }
      this._terminalGroupService.updateVisibility();
    }));
    this._register(this._terminalService.onDidChangeConnectionState(() => this._initializeTerminal(true)));
    this.layoutBody(this._parentDomElement.offsetHeight, this._parentDomElement.offsetWidth);
  }
  _createTabsView() {
    if (!this._parentDomElement) {
      return;
    }
    this._terminalTabbedView = this._register(this.instantiationService.createInstance(TerminalTabbedView, this._parentDomElement));
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._terminalTabbedView?.layout(width, height);
  }
  createActionViewItem(action, options) {
    switch (action.id) {
      case TerminalCommandId.Split: {
        const that = this;
        const store = new DisposableStore();
        const panelOnlySplitAction = store.add(new class extends Action {
          constructor() {
            super(action.id, action.label, action.class, action.enabled);
            this.checked = action.checked;
            this.tooltip = action.tooltip;
          }
          async run() {
            const instance = that._terminalGroupService.activeInstance;
            if (instance) {
              const newInstance = await that._terminalService.createTerminal({ location: { parentTerminal: instance } });
              return newInstance?.focusWhenReady();
            }
            return;
          }
        }());
        const item = store.add(new ActionViewItem(action, panelOnlySplitAction, { ...options, icon: true, label: false, keybinding: this._getKeybindingLabel(action) }));
        this._actionDisposables.set(action.id, store);
        return item;
      }
      case TerminalCommandId.SwitchTerminal: {
        const item = this._instantiationService.createInstance(SwitchTerminalActionViewItem, action);
        this._actionDisposables.set(action.id, item);
        return item;
      }
      case TerminalCommandId.Focus: {
        if (action instanceof MenuItemAction) {
          const actions = getFlatContextMenuActions(this._singleTabMenu.getActions({ shouldForwardArgs: true }));
          const item = this._instantiationService.createInstance(SingleTerminalTabActionViewItem, action, actions);
          this._actionDisposables.set(action.id, item);
          return item;
        }
        break;
      }
      case TerminalCommandId.New: {
        if (action instanceof MenuItemAction) {
          this._disposableStore.clear();
          const actions = getTerminalActionBarArgs(TerminalLocation.Panel, this._terminalProfileService.availableProfiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
          this._newDropdown.value = this._instantiationService.createInstance(DropdownWithPrimaryActionViewItem, action, actions.dropdownAction, actions.dropdownMenuActions, actions.className, {
            hoverDelegate: options.hoverDelegate,
            getKeyBinding: (action2) => this._keybindingService.lookupKeybinding(action2.id, this._contextKeyService)
          });
          this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
          return this._newDropdown.value;
        }
      }
    }
    return super.createActionViewItem(action, options);
  }
  _getDefaultProfileName() {
    let defaultProfileName;
    try {
      defaultProfileName = this._terminalProfileService.getDefaultProfileName();
    } catch (e) {
      defaultProfileName = this._terminalProfileResolverService.defaultProfileName;
    }
    return defaultProfileName;
  }
  _getKeybindingLabel(action) {
    return this._keybindingService.lookupKeybinding(action.id)?.getLabel() ?? void 0;
  }
  _updateTabActionBar(profiles) {
    this._disposableStore.clear();
    const actions = getTerminalActionBarArgs(TerminalLocation.Panel, profiles, this._getDefaultProfileName(), this._terminalProfileService.contributedProfiles, this._terminalService, this._dropdownMenu, this._disposableStore);
    this._newDropdown.value?.update(actions.dropdownAction, actions.dropdownMenuActions);
  }
  focus() {
    super.focus();
    if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
      if (this._terminalGroupService.instances.length === 0 && !this._isTerminalBeingCreated) {
        this._isTerminalBeingCreated = true;
        this._terminalService.createTerminal({ location: TerminalLocation.Panel }).finally(() => this._isTerminalBeingCreated = false);
      }
      this._terminalGroupService.showPanel(true);
      return;
    }
    const previousActiveElement = this.element.ownerDocument.activeElement;
    if (previousActiveElement) {
      const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
        if (previousActiveElement && dom.isActiveElement(previousActiveElement)) {
          this._terminalGroupService.showPanel(true);
        }
        this._store.delete(listener);
      }));
    }
  }
  _hasWelcomeScreen() {
    return !this._terminalService.isProcessSupportRegistered;
  }
  shouldShowWelcome() {
    return this._hasWelcomeScreen() && this._terminalService.instances.length === 0;
  }
};
TerminalViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITerminalService),
  __decorateParam(8, ITerminalConfigurationService),
  __decorateParam(9, ITerminalGroupService),
  __decorateParam(10, IThemeService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IKeybindingService),
  __decorateParam(14, IOpenerService),
  __decorateParam(15, IMenuService),
  __decorateParam(16, ITerminalProfileService),
  __decorateParam(17, ITerminalProfileResolverService)
], TerminalViewPane);
let SwitchTerminalActionViewItem = class extends SelectActionViewItem {
  constructor(action, _terminalService, _terminalGroupService, contextViewService, terminalProfileService, configurationService) {
    super(null, action, getTerminalSelectOpenItems(_terminalService, _terminalGroupService), _terminalGroupService.activeGroupIndex, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("terminals", "Open Terminals."), optionsAsChildren: true, useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._register(_terminalService.onDidChangeInstances(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeActiveGroup(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeActiveInstance(() => this._updateItems(), this));
    this._register(_terminalService.onAnyInstanceTitleChange(() => this._updateItems(), this));
    this._register(_terminalGroupService.onDidChangeGroups(() => this._updateItems(), this));
    this._register(_terminalService.onDidChangeConnectionState(() => this._updateItems(), this));
    this._register(terminalProfileService.onDidChangeAvailableProfiles(() => this._updateItems(), this));
    this._register(_terminalService.onAnyInstancePrimaryStatusChange(() => this._updateItems(), this));
  }
  render(container) {
    super.render(container);
    container.classList.add("switch-terminal");
    container.style.borderColor = asCssVariable(selectBorder);
  }
  _updateItems() {
    const options = getTerminalSelectOpenItems(this._terminalService, this._terminalGroupService);
    this.setOptions(options, this._terminalGroupService.activeGroupIndex);
  }
};
SwitchTerminalActionViewItem = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalGroupService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, ITerminalProfileService),
  __decorateParam(5, IConfigurationService)
], SwitchTerminalActionViewItem);
function getTerminalSelectOpenItems(terminalService, terminalGroupService) {
  let items;
  if (terminalService.connectionState === TerminalConnectionState.Connected) {
    items = terminalGroupService.getGroupLabels().map((label) => {
      return { text: label };
    });
  } else {
    items = [{ text: nls.localize("terminalConnectingLabel", "Starting...") }];
  }
  items.push(SeparatorSelectOption);
  items.push({ text: switchTerminalShowTabsTitle });
  return items;
}
let SingleTerminalTabActionViewItem = class extends MenuEntryActionViewItem {
  constructor(action, _actions, keybindingService, notificationService, contextKeyService, themeService, _terminalService, _terminaConfigurationService, _terminalGroupService, contextMenuService, _commandService, _instantiationService, _accessibilityService) {
    super(action, {
      draggable: true,
      hoverDelegate: _instantiationService.createInstance(SingleTabHoverDelegate)
    }, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, _accessibilityService);
    this._actions = _actions;
    this._terminalService = _terminalService;
    this._terminaConfigurationService = _terminaConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._commandService = _commandService;
    this._instantiationService = _instantiationService;
    this._elementDisposables = [];
    this._register(Event.debounce(Event.any(
      this._terminalService.onAnyInstancePrimaryStatusChange,
      this._terminalGroupService.onDidChangeActiveInstance,
      Event.map(this._terminalService.onAnyInstanceIconChange, (e) => e.instance),
      this._terminalService.onAnyInstanceTitleChange,
      this._terminalService.onDidChangeInstanceCapability
    ), (last, e) => {
      if (!last) {
        last = /* @__PURE__ */ new Set();
      }
      if (e) {
        last.add(e);
      }
      return last;
    }, MicrotaskDelay)((merged) => {
      for (const e of merged) {
        this.updateLabel(e);
      }
    }));
    this._register(toDisposable(() => dispose(this._elementDisposables)));
  }
  async onClick(event) {
    this._terminalGroupService.lastAccessedMenu = "inline-tab";
    if (event.altKey && this._menuItemAction.alt) {
      this._commandService.executeCommand(this._menuItemAction.alt.id, { location: TerminalLocation.Panel });
    } else {
      this._openContextMenu();
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  updateLabel(e) {
    if (e && e !== this._terminalGroupService.activeInstance) {
      return;
    }
    if (this._elementDisposables.length === 0 && this.element && this.label) {
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.CONTEXT_MENU, (e2) => {
        if (e2.button === 2) {
          this._openContextMenu();
          e2.stopPropagation();
          e2.preventDefault();
        }
      }));
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.AUXCLICK, (e2) => {
        if (e2.button === 1) {
          const instance = this._terminalGroupService.activeInstance;
          if (instance) {
            this._terminalService.safeDisposeTerminal(instance);
          }
          e2.preventDefault();
        }
      }));
      this._elementDisposables.push(dom.addDisposableListener(this.element, dom.EventType.DRAG_START, (e2) => {
        const instance = this._terminalGroupService.activeInstance;
        if (e2.dataTransfer && instance) {
          e2.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([instance.resource.toString()]));
        }
      }));
    }
    if (this.label) {
      const label = this.label;
      const instance = this._terminalGroupService.activeInstance;
      if (!instance) {
        dom.reset(label, "");
        return;
      }
      label.classList.add("single-terminal-tab");
      let colorStyle = "";
      const primaryStatus = instance.statusList.primary;
      if (primaryStatus) {
        const colorKey = getColorForSeverity(primaryStatus.severity);
        this._themeService.getColorTheme();
        const foundColor = this._themeService.getColorTheme().getColor(colorKey);
        if (foundColor) {
          colorStyle = foundColor.toString();
        }
      }
      label.style.color = colorStyle;
      dom.reset(label, ...renderLabelWithIcons(this._instantiationService.invokeFunction(getSingleTabLabel, instance, this._terminaConfigurationService.config.tabs.separator, ThemeIcon.isThemeIcon(this._commandAction.item.icon) ? this._commandAction.item.icon : void 0)));
      if (this._altCommand) {
        label.classList.remove(this._altCommand);
        this._altCommand = void 0;
      }
      if (this._color) {
        label.classList.remove(this._color);
        this._color = void 0;
      }
      if (this._class) {
        label.classList.remove(this._class);
        label.classList.remove("terminal-uri-icon");
        this._class = void 0;
      }
      const colorClass = getColorClass(instance);
      if (colorClass) {
        this._color = colorClass;
        label.classList.add(colorClass);
      }
      const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
      if (uriClasses) {
        this._class = uriClasses?.[0];
        label.classList.add(...uriClasses);
      }
      if (this._commandAction.item.icon) {
        this._altCommand = `alt-command`;
        label.classList.add(this._altCommand);
      }
      this.updateTooltip();
    }
  }
  _openContextMenu() {
    const actionRunner = new TerminalContextActionRunner();
    this._contextMenuService.showContextMenu({
      actionRunner,
      getAnchor: () => this.element,
      getActions: () => this._actions,
      // The context is always the active instance in the terminal view
      getActionsContext: () => {
        const instance = this._terminalGroupService.activeInstance;
        return instance ? [new InstanceContext(instance)] : [];
      },
      onHide: () => actionRunner.dispose()
    });
  }
};
SingleTerminalTabActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, ITerminalService),
  __decorateParam(7, ITerminalConfigurationService),
  __decorateParam(8, ITerminalGroupService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IAccessibilityService)
], SingleTerminalTabActionViewItem);
function getSingleTabLabel(accessor, instance, separator, icon) {
  if (!instance || !instance.title) {
    return "";
  }
  const iconId = ThemeIcon.isThemeIcon(instance.icon) ? instance.icon.id : accessor.get(ITerminalProfileResolverService).getDefaultIcon().id;
  const label = `$(${icon?.id || iconId}) ${getSingleTabTitle(instance, separator)}`;
  const primaryStatus = instance.statusList.primary;
  if (!primaryStatus?.icon) {
    return label;
  }
  return `${label} $(${primaryStatus.icon.id})`;
}
function getSingleTabTitle(instance, separator) {
  if (!instance) {
    return "";
  }
  return !instance.description ? instance.title : `${instance.title} ${separator} ${instance.description}`;
}
let TerminalThemeIconStyle = class extends Themable {
  constructor(container, _themeService, _terminalService, _terminalGroupService) {
    super(_themeService);
    this._themeService = _themeService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._registerListeners();
    this._styleElement = domStylesheetsJs.createStyleSheet(container);
    this._register(toDisposable(() => this._styleElement.remove()));
    this.updateStyles();
  }
  _registerListeners() {
    this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
    this._register(this._terminalService.onDidChangeInstances(() => this.updateStyles()));
    this._register(this._terminalGroupService.onDidChangeGroups(() => this.updateStyles()));
  }
  updateStyles() {
    super.updateStyles();
    const colorTheme = this._themeService.getColorTheme();
    let css = "";
    for (const instance of this._terminalService.instances) {
      const icon = instance.icon;
      if (!icon) {
        continue;
      }
      let uri = void 0;
      if (icon instanceof URI) {
        uri = icon;
      } else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
        uri = isDark(colorTheme.type) ? icon.dark : icon.light;
      }
      const iconClasses = getUriClasses(instance, colorTheme.type);
      if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
        css += `.monaco-workbench .${iconClasses[0]} .monaco-highlighted-label .codicon, .monaco-action-bar .terminal-uri-icon.single-terminal-tab.action-label:not(.alt-command) .codicon{background-image: ${cssJs.asCSSUrl(uri)};}`;
      }
    }
    for (const instance of this._terminalService.instances) {
      const colorClass = getColorClass(instance);
      if (!colorClass || !instance.color) {
        continue;
      }
      const color = colorTheme.getColor(instance.color);
      if (color) {
        css += `.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-split-horizontal):not(.codicon-trashcan):not(.file-icon):not(.codicon-rerun-task){ color: ${color} !important; }`;
      }
    }
    this._styleElement.textContent = css;
  }
};
TerminalThemeIconStyle = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, ITerminalService),
  __decorateParam(3, ITerminalGroupService)
], TerminalThemeIconStyle);
let SingleTabHoverDelegate = class {
  constructor(_configurationService, _hoverService, _storageService, _terminalGroupService) {
    this._configurationService = _configurationService;
    this._hoverService = _hoverService;
    this._storageService = _storageService;
    this._terminalGroupService = _terminalGroupService;
    this._lastHoverHideTime = 0;
    this.placement = "element";
  }
  get delay() {
    return Date.now() - this._lastHoverHideTime < 200 ? 0 : this._configurationService.getValue("workbench.hover.delay");
  }
  showHover(options, focus) {
    const instance = this._terminalGroupService.activeInstance;
    if (!instance) {
      return;
    }
    const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
    return this._hoverService.showInstantHover({
      ...options,
      content: hoverInfo.content,
      actions: hoverInfo.actions
    }, focus);
  }
  onDidHideHover() {
    this._lastHoverHideTime = Date.now();
  }
};
SingleTabHoverDelegate = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, ITerminalGroupService)
], SingleTabHoverDelegate);
export {
  TerminalViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBzd2l0Y2hUZXJtaW5hbFNob3dUYWJzVGl0bGUgfSBmcm9tICcuL3Rlcm1pbmFsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlVGVybWluYWxPcHRpb25zLCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSwgVGVybWluYWxDb25uZWN0aW9uU3RhdGUsIFRlcm1pbmFsRGF0YVRyYW5zZmVycyB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLCBUZXJtaW5hbENvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNldHRpbmdJZCwgSVRlcm1pbmFsUHJvZmlsZSwgVGVybWluYWxMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsIFNlbGVjdEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgc2VsZWN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlcGFyYXRvclNlbGVjdE9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVGFiYmVkVmlldyB9IGZyb20gJy4vdGVybWluYWxUYWJiZWRWaWV3LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckZvclNldmVyaXR5IH0gZnJvbSAnLi90ZXJtaW5hbFN0YXR1c0xpc3QuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdENvbnRleHRNZW51QWN0aW9ucywgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgRHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2Ryb3Bkb3duV2l0aFByaW1hcnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgZ2V0Q29sb3JDbGFzcywgZ2V0VXJpQ2xhc3NlcyB9IGZyb20gJy4vdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsQWN0aW9uQmFyQXJncyB9IGZyb20gJy4vdGVybWluYWxNZW51cy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBnZXRJbnN0YW5jZUhvdmVySW5mbyB9IGZyb20gJy4vdGVybWluYWxUb29sdGlwLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSwgSUhvdmVyRGVsZWdhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJbnN0YW5jZUNvbnRleHQsIFRlcm1pbmFsQ29udGV4dEFjdGlvblJ1bm5lciB9IGZyb20gJy4vdGVybWluYWxDb250ZXh0TWVudS5qcyc7XG5pbXBvcnQgeyBNaWNyb3Rhc2tEZWxheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N5bWJvbHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVDb250ZXh0TWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsVmlld1BhbmUgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cdHByaXZhdGUgX3BhcmVudERvbUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90ZXJtaW5hbFRhYmJlZFZpZXc/OiBUZXJtaW5hbFRhYmJlZFZpZXc7XG5cdGdldCB0ZXJtaW5hbFRhYmJlZFZpZXcoKTogVGVybWluYWxUYWJiZWRWaWV3IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Rlcm1pbmFsVGFiYmVkVmlldzsgfVxuXHRwcml2YXRlIF9pc0luaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBUcmFja3MgYW4gYWN0aXZlIHByb21pc2Ugb2YgdGVybWluYWwgY3JlYXRpb24gcmVxdWVzdGVkIGJ5IHRoaXMgY29tcG9uZW50LiBUaGlzIGhlbHBzIHByZXZlbnRcblx0ICogZG91YmxlIGNyZWF0aW9uIGZvciBleGFtcGxlIHdoZW4gdG9nZ2xpbmcgYSB0ZXJtaW5hbCdzIHZpc2liaWxpdHkgYW5kIGZvY3VzaW5nIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNUZXJtaW5hbEJlaW5nQ3JlYXRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdEcm9wZG93bjogTXV0YWJsZURpc3Bvc2FibGU8RHJvcGRvd25XaXRoUHJpbWFyeUFjdGlvblZpZXdJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJvcGRvd25NZW51OiBJTWVudTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2luZ2xlVGFiTWVudTogSU1lbnU7XG5cdHByaXZhdGUgX3ZpZXdTaG93aW5nOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVNYXA8VGVybWluYWxDb21tYW5kSWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXAoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBfY29uZmlndXJhdGlvblNlcnZpY2UsIF9jb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBfaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRSZWdpc3RlclByb2Nlc3NTdXBwb3J0KCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHtcblx0XHRcdC8vIElmIHRoZSBmaXJzdCB0ZXJtaW5hbCBpcyBvcGVuZWQsIGhpZGUgdGhlIHdlbGNvbWUgdmlld1xuXHRcdFx0Ly8gYW5kIGlmIHRoZSBsYXN0IG9uZSBpcyBjbG9zZWQsIHNob3cgaXQgYWdhaW5cblx0XHRcdGlmICh0aGlzLl9oYXNXZWxjb21lU2NyZWVuKCkgJiYgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3BhcmVudERvbUVsZW1lbnQpIHsgcmV0dXJuOyB9XG5cdFx0XHQvLyBJZiB3ZSBkbyBub3QgaGF2ZSB0aGUgdGFiIHZpZXcgeWV0LCBjcmVhdGUgaXQgbm93LlxuXHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbFRhYmJlZFZpZXcpIHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlVGFic1ZpZXcoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0Qm9keSh0aGlzLl9wYXJlbnREb21FbGVtZW50Lm9mZnNldEhlaWdodCwgdGhpcy5fcGFyZW50RG9tRWxlbWVudC5vZmZzZXRXaWR0aCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duTWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlRlcm1pbmFsTmV3RHJvcGRvd25Db250ZXh0LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX3NpbmdsZVRhYk1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzKHByb2ZpbGVzID0+IHRoaXMuX3VwZGF0ZVRhYkFjdGlvbkJhcihwcm9maWxlcykpKTtcblx0XHR0aGlzLl92aWV3U2hvd2luZyA9IFRlcm1pbmFsQ29udGV4dEtleXMudmlld1Nob3dpbmcuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkoZSA9PiB7XG5cdFx0XHRpZiAoZSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFRhYmJlZFZpZXc/LnJlcmVuZGVyVGFicygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcGFyZW50RG9tRWxlbWVudCAmJiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRGVjb3JhdGlvbnNFbmFibGVkKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkKSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRm9yU2hlbGxJbnRlZ3JhdGlvbih0aGlzLl9wYXJlbnREb21FbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2hlbGxJbnRlZ3JhdGlvbkRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0c2hlbGxJbnRlZ3JhdGlvbkRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZUFkZGVkQ2FwYWJpbGl0eVR5cGUoYyA9PiB7XG5cdFx0XHRpZiAoYyA9PT0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24gJiYgdGhpcy5fZ3V0dGVyRGVjb3JhdGlvbnNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fcGFyZW50RG9tRWxlbWVudD8uY2xhc3NMaXN0LmFkZCgnc2hlbGwtaW50ZWdyYXRpb24nKTtcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvbkRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZvclNoZWxsSW50ZWdyYXRpb24oY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaGVsbC1pbnRlZ3JhdGlvbicsIHRoaXMuX2d1dHRlckRlY29yYXRpb25zRW5hYmxlZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2d1dHRlckRlY29yYXRpb25zRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWNvcmF0aW9uc0VuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRGVjb3JhdGlvbnNFbmFibGVkKTtcblx0XHRyZXR1cm4gKGRlY29yYXRpb25zRW5hYmxlZCA9PT0gJ2JvdGgnIHx8IGRlY29yYXRpb25zRW5hYmxlZCA9PT0gJ2d1dHRlcicpICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRpYWxpemVUZXJtaW5hbChjaGVja1Jlc3RvcmVkVGVybWluYWxzOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuaXNCb2R5VmlzaWJsZSgpICYmIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pc1Byb2Nlc3NTdXBwb3J0UmVnaXN0ZXJlZCAmJiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY29ubmVjdGlvblN0YXRlID09PSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRcdGNvbnN0IHdhc0luaXRpYWxpemVkID0gdGhpcy5faXNJbml0aWFsaXplZDtcblx0XHRcdHRoaXMuX2lzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG5cdFx0XHRsZXQgaGlkZU9uU3RhcnR1cDogJ25ldmVyJyB8ICd3aGVuRW1wdHknIHwgJ2Fsd2F5cycgPSAnbmV2ZXInO1xuXHRcdFx0aWYgKCF3YXNJbml0aWFsaXplZCkge1xuXHRcdFx0XHRoaWRlT25TdGFydHVwID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuSGlkZU9uU3RhcnR1cCk7XG5cdFx0XHRcdGlmIChoaWRlT25TdGFydHVwID09PSAnYWx3YXlzJykge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmhpZGVQYW5lbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzaG91bGRDcmVhdGUgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5ncm91cHMubGVuZ3RoID09PSAwO1xuXHRcdFx0Ly8gV2hlbiB0cmlnZ2VyZWQganVzdCBhZnRlciByZWNvbm5lY3Rpb24sIGFsc28gY2hlY2sgdGhlcmUgYXJlIG5vIGdyb3VwcyB0aGF0IGNvdWxkIGJlXG5cdFx0XHQvLyBnZXR0aW5nIHJlc3RvcmVkIGN1cnJlbnRseVxuXHRcdFx0aWYgKGNoZWNrUmVzdG9yZWRUZXJtaW5hbHMpIHtcblx0XHRcdFx0c2hvdWxkQ3JlYXRlICYmPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UucmVzdG9yZWRHcm91cENvdW50ID09PSAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzaG91bGRDcmVhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF3YXNJbml0aWFsaXplZCkge1xuXHRcdFx0XHRzd2l0Y2ggKGhpZGVPblN0YXJ0dXApIHtcblx0XHRcdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdFx0XHR0aGlzLl9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pLmZpbmFsbHkoKCkgPT4gdGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCA9IGZhbHNlKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3doZW5FbXB0eSc6XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fdGVybWluYWxTZXJ2aWNlLnJlc3RvcmVkR3JvdXBDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5oaWRlUGFuZWwoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9pc1Rlcm1pbmFsQmVpbmdDcmVhdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lzVGVybWluYWxCZWluZ0NyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbi5QYW5lbCB9KS5maW5hbGx5KCgpID0+IHRoaXMuX2lzVGVybWluYWxCZWluZ0NyZWF0ZWQgPSBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0aWYgKCF0aGlzLl9wYXJlbnREb21FbGVtZW50KSB7XG5cdFx0XHR0aGlzLl91cGRhdGVGb3JTaGVsbEludGVncmF0aW9uKGNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX3BhcmVudERvbUVsZW1lbnQgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fcGFyZW50RG9tRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnRlZ3JhdGVkLXRlcm1pbmFsJyk7XG5cdFx0ZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KHRoaXMuX3BhcmVudERvbUVsZW1lbnQpO1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsVGhlbWVJY29uU3R5bGUsIHRoaXMuX3BhcmVudERvbUVsZW1lbnQpO1xuXG5cdFx0aWYgKCF0aGlzLnNob3VsZFNob3dXZWxjb21lKCkpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZVRhYnNWaWV3KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5Gb250RmFtaWx5KSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZm9udEZhbWlseScpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWdGb250SXNNb25vc3BhY2UoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNob2ljZXM6IElQcm9tcHRDaG9pY2VbXSA9IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC51c2VNb25vc3BhY2UnLCBcIlVzZSAnbW9ub3NwYWNlJ1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Gb250RmFtaWx5LCAnbW9ub3NwYWNlJyksXG5cdFx0XHRcdFx0fV07XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5tb25vc3BhY2VPbmx5JywgXCJUaGUgdGVybWluYWwgb25seSBzdXBwb3J0cyBtb25vc3BhY2UgZm9udHMuIEJlIHN1cmUgdG8gcmVzdGFydCBWUyBDb2RlIGlmIHRoaXMgaXMgYSBuZXdseSBpbnN0YWxsZWQgZm9udC5cIiksIGNob2ljZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShhc3luYyB2aXNpYmxlID0+IHtcblx0XHRcdHRoaXMuX3ZpZXdTaG93aW5nLnNldCh2aXNpYmxlKTtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9oYXNXZWxjb21lU2NyZWVuKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2luaXRpYWxpemVUZXJtaW5hbChmYWxzZSk7XG5cdFx0XHRcdC8vIHdlIGRvbid0IGtub3cgaGVyZSB3aGV0aGVyIG9yIG5vdCBpdCBzaG91bGQgYmUgZm9jdXNlZCwgc29cblx0XHRcdFx0Ly8gZGVmZXIgZm9jdXNpbmcgdGhlIHBhbmVsIHRvIHRoZSBmb2N1cygpIGNhbGxcblx0XHRcdFx0Ly8gdG8gcHJldmVudCBvdmVycmlkaW5nIHByZXNlcnZlRm9jdXMgZm9yIGV4dGVuc2lvbnNcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRcdFx0aW5zdGFuY2UucmVzZXRGb2N1c0NvbnRleHRLZXkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UudXBkYXRlVmlzaWJpbGl0eSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUoKCkgPT4gdGhpcy5faW5pdGlhbGl6ZVRlcm1pbmFsKHRydWUpKSk7XG5cdFx0dGhpcy5sYXlvdXRCb2R5KHRoaXMuX3BhcmVudERvbUVsZW1lbnQub2Zmc2V0SGVpZ2h0LCB0aGlzLl9wYXJlbnREb21FbGVtZW50Lm9mZnNldFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRhYnNWaWV3KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcGFyZW50RG9tRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbFRhYmJlZFZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsVGFiYmVkVmlldywgdGhpcy5fcGFyZW50RG9tRWxlbWVudCkpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5fdGVybWluYWxUYWJiZWRWaWV3Py5sYXlvdXQod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb246IEFjdGlvbiwgb3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAoYWN0aW9uLmlkKSB7XG5cdFx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0OiB7XG5cdFx0XHRcdC8vIFNwbGl0IG5lZWRzIHRvIGJlIHNwZWNpYWwgY2FzZWQgdG8gZm9yY2Ugc3BsaXR0aW5nIHdpdGhpbiB0aGUgcGFuZWwsIG5vdCB0aGUgZWRpdG9yXG5cdFx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3QgcGFuZWxPbmx5U3BsaXRBY3Rpb24gPSBzdG9yZS5hZGQobmV3IGNsYXNzIGV4dGVuZHMgQWN0aW9uIHtcblx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdHN1cGVyKGFjdGlvbi5pZCwgYWN0aW9uLmxhYmVsLCBhY3Rpb24uY2xhc3MsIGFjdGlvbi5lbmFibGVkKTtcblx0XHRcdFx0XHRcdHRoaXMuY2hlY2tlZCA9IGFjdGlvbi5jaGVja2VkO1xuXHRcdFx0XHRcdFx0dGhpcy50b29sdGlwID0gYWN0aW9uLnRvb2x0aXA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bigpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhhdC5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdFx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3SW5zdGFuY2UgPSBhd2FpdCB0aGF0Ll90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogaW5zdGFuY2UgfSB9KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ld0luc3RhbmNlPy5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSBzdG9yZS5hZGQobmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgcGFuZWxPbmx5U3BsaXRBY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLl9nZXRLZXliaW5kaW5nTGFiZWwoYWN0aW9uKSB9KSk7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbkRpc3Bvc2FibGVzLnNldChhY3Rpb24uaWQsIHN0b3JlKTtcblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZElkLlN3aXRjaFRlcm1pbmFsOiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTd2l0Y2hUZXJtaW5hbEFjdGlvblZpZXdJdGVtLCBhY3Rpb24pO1xuXHRcdFx0XHR0aGlzLl9hY3Rpb25EaXNwb3NhYmxlcy5zZXQoYWN0aW9uLmlkLCBpdGVtKTtcblx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRlcm1pbmFsQ29tbWFuZElkLkZvY3VzOiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMuX3NpbmdsZVRhYk1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2luZ2xlVGVybWluYWxUYWJBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBhY3Rpb25zKTtcblx0XHRcdFx0XHR0aGlzLl9hY3Rpb25EaXNwb3NhYmxlcy5zZXQoYWN0aW9uLmlkLCBpdGVtKTtcblx0XHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgVGVybWluYWxDb21tYW5kSWQuTmV3OiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRUZXJtaW5hbEFjdGlvbkJhckFyZ3MoVGVybWluYWxMb2NhdGlvbi5QYW5lbCwgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcywgdGhpcy5fZ2V0RGVmYXVsdFByb2ZpbGVOYW1lKCksIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuY29udHJpYnV0ZWRQcm9maWxlcywgdGhpcy5fdGVybWluYWxTZXJ2aWNlLCB0aGlzLl9kcm9wZG93bk1lbnUsIHRoaXMuX2Rpc3Bvc2FibGVTdG9yZSk7XG5cdFx0XHRcdFx0dGhpcy5fbmV3RHJvcGRvd24udmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wZG93bldpdGhQcmltYXJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgYWN0aW9ucy5kcm9wZG93bkFjdGlvbiwgYWN0aW9ucy5kcm9wZG93bk1lbnVBY3Rpb25zLCBhY3Rpb25zLmNsYXNzTmFtZSwge1xuXHRcdFx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlLFxuXHRcdFx0XHRcdFx0Z2V0S2V5QmluZGluZzogKGFjdGlvbjogSUFjdGlvbikgPT4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX25ld0Ryb3Bkb3duLnZhbHVlPy51cGRhdGUoYWN0aW9ucy5kcm9wZG93bkFjdGlvbiwgYWN0aW9ucy5kcm9wZG93bk1lbnVBY3Rpb25zKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbmV3RHJvcGRvd24udmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZUFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWZhdWx0UHJvZmlsZU5hbWUoKTogc3RyaW5nIHtcblx0XHRsZXQgZGVmYXVsdFByb2ZpbGVOYW1lO1xuXHRcdHRyeSB7XG5cdFx0XHRkZWZhdWx0UHJvZmlsZU5hbWUgPSB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlTmFtZSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGRlZmF1bHRQcm9maWxlTmFtZSA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZS5kZWZhdWx0UHJvZmlsZU5hbWU7XG5cdFx0fVxuXHRcdHJldHVybiBkZWZhdWx0UHJvZmlsZU5hbWUhO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0S2V5YmluZGluZ0xhYmVsKGFjdGlvbjogSUFjdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUYWJBY3Rpb25CYXIocHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVTdG9yZS5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRUZXJtaW5hbEFjdGlvbkJhckFyZ3MoVGVybWluYWxMb2NhdGlvbi5QYW5lbCwgcHJvZmlsZXMsIHRoaXMuX2dldERlZmF1bHRQcm9maWxlTmFtZSgpLCB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmNvbnRyaWJ1dGVkUHJvZmlsZXMsIHRoaXMuX3Rlcm1pbmFsU2VydmljZSwgdGhpcy5fZHJvcGRvd25NZW51LCB0aGlzLl9kaXNwb3NhYmxlU3RvcmUpO1xuXHRcdHRoaXMuX25ld0Ryb3Bkb3duLnZhbHVlPy51cGRhdGUoYWN0aW9ucy5kcm9wZG93bkFjdGlvbiwgYWN0aW9ucy5kcm9wZG93bk1lbnVBY3Rpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCkge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jb25uZWN0aW9uU3RhdGUgPT09IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLkNvbm5lY3RlZCkge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPT09IDAgJiYgIXRoaXMuX2lzVGVybWluYWxCZWluZ0NyZWF0ZWQpIHtcblx0XHRcdFx0dGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pLmZpbmFsbHkoKCkgPT4gdGhpcy5faXNUZXJtaW5hbEJlaW5nQ3JlYXRlZCA9IGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgdGVybWluYWwgaXMgd2FpdGluZyB0byByZWNvbm5lY3QgdG8gcmVtb3RlIHRlcm1pbmFscywgdGhlbiB0aGVyZSBpcyBubyBUZXJtaW5hbEluc3RhbmNlIHlldCB0aGF0IGNhblxuXHRcdC8vIGJlIGZvY3VzZWQuIFNvIHdhaXQgZm9yIGNvbm5lY3Rpb24gdG8gZmluaXNoLCB0aGVuIGZvY3VzLlxuXHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlRWxlbWVudCA9IHRoaXMuZWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0aWYgKHByZXZpb3VzQWN0aXZlRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25TdGF0ZSkoKCkgPT4ge1xuXHRcdFx0XHQvLyBPbmx5IGZvY3VzIHRoZSB0ZXJtaW5hbCBpZiB0aGUgYWN0aXZlRWxlbWVudCBoYXMgbm90IGNoYW5nZWQgc2luY2UgZm9jdXMoKSB3YXMgY2FsbGVkXG5cdFx0XHRcdGlmIChwcmV2aW91c0FjdGl2ZUVsZW1lbnQgJiYgZG9tLmlzQWN0aXZlRWxlbWVudChwcmV2aW91c0FjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShsaXN0ZW5lcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzV2VsY29tZVNjcmVlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuX3Rlcm1pbmFsU2VydmljZS5pc1Byb2Nlc3NTdXBwb3J0UmVnaXN0ZXJlZDtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNXZWxjb21lU2NyZWVuKCkgJiYgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPT09IDA7XG5cdH1cbn1cblxuY2xhc3MgU3dpdGNoVGVybWluYWxBY3Rpb25WaWV3SXRlbSBleHRlbmRzIFNlbGVjdEFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSB0ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgZ2V0VGVybWluYWxTZWxlY3RPcGVuSXRlbXMoX3Rlcm1pbmFsU2VydmljZSwgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlKSwgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwSW5kZXgsIGNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgndGVybWluYWxzJywgJ09wZW4gVGVybWluYWxzLicpLCBvcHRpb25zQXNDaGlsZHJlbjogdHJ1ZSwgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudShjb25maWd1cmF0aW9uU2VydmljZSkgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUluc3RhbmNlcygoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKCgpID0+IHRoaXMuX3VwZGF0ZUl0ZW1zKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoKCkgPT4gdGhpcy5fdXBkYXRlSXRlbXMoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVRpdGxlQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZUl0ZW1zKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VHcm91cHMoKCkgPT4gdGhpcy5fdXBkYXRlSXRlbXMoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlSXRlbXMoKSwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcygoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlUHJpbWFyeVN0YXR1c0NoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVJdGVtcygpLCB0aGlzKSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzd2l0Y2gtdGVybWluYWwnKTtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHNlbGVjdEJvcmRlcik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJdGVtcygpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gZ2V0VGVybWluYWxTZWxlY3RPcGVuSXRlbXModGhpcy5fdGVybWluYWxTZXJ2aWNlLCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZSk7XG5cdFx0dGhpcy5zZXRPcHRpb25zKG9wdGlvbnMsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwSW5kZXgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsU2VsZWN0T3Blbkl0ZW1zKHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSwgdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSk6IElTZWxlY3RPcHRpb25JdGVtW10ge1xuXHRsZXQgaXRlbXM6IElTZWxlY3RPcHRpb25JdGVtW107XG5cdGlmICh0ZXJtaW5hbFNlcnZpY2UuY29ubmVjdGlvblN0YXRlID09PSBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZS5Db25uZWN0ZWQpIHtcblx0XHRpdGVtcyA9IHRlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwTGFiZWxzKCkubWFwKGxhYmVsID0+IHtcblx0XHRcdHJldHVybiB7IHRleHQ6IGxhYmVsIH07XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0aXRlbXMgPSBbeyB0ZXh0OiBubHMubG9jYWxpemUoJ3Rlcm1pbmFsQ29ubmVjdGluZ0xhYmVsJywgXCJTdGFydGluZy4uLlwiKSB9XTtcblx0fVxuXHRpdGVtcy5wdXNoKFNlcGFyYXRvclNlbGVjdE9wdGlvbik7XG5cdGl0ZW1zLnB1c2goeyB0ZXh0OiBzd2l0Y2hUZXJtaW5hbFNob3dUYWJzVGl0bGUgfSk7XG5cdHJldHVybiBpdGVtcztcbn1cblxuY2xhc3MgU2luZ2xlVGVybWluYWxUYWJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSBfY29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWx0Q29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbGFzczogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50RGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbnM6IElBY3Rpb25bXSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbiwge1xuXHRcdFx0ZHJhZ2dhYmxlOiB0cnVlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbmdsZVRhYkhvdmVyRGVsZWdhdGUpXG5cdFx0fSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGxpc3RlbmVycyB0byB1cGRhdGUgdGhlIHRhYlxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCBTZXQ8SVRlcm1pbmFsSW5zdGFuY2U+PihFdmVudC5hbnkoXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVByaW1hcnlTdGF0dXNDaGFuZ2UsXG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLFxuXHRcdFx0RXZlbnQubWFwKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlSWNvbkNoYW5nZSwgZSA9PiBlLmluc3RhbmNlKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlVGl0bGVDaGFuZ2UsXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHksXG5cdFx0KSwgKGxhc3QsIGUpID0+IHtcblx0XHRcdGlmICghbGFzdCkge1xuXHRcdFx0XHRsYXN0ID0gbmV3IFNldCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0bGFzdC5hZGQoZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGFzdDtcblx0XHR9LCBNaWNyb3Rhc2tEZWxheSkobWVyZ2VkID0+IHtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBtZXJnZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVMYWJlbChlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDbGVhbiB1cCBvbiBkaXNwb3NlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGRpc3Bvc2UodGhpcy5fZWxlbWVudERpc3Bvc2FibGVzKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgb25DbGljayhldmVudDogTW91c2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmxhc3RBY2Nlc3NlZE1lbnUgPSAnaW5saW5lLXRhYic7XG5cdFx0aWYgKGV2ZW50LmFsdEtleSAmJiB0aGlzLl9tZW51SXRlbUFjdGlvbi5hbHQpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHRoaXMuX21lbnVJdGVtQWN0aW9uLmFsdC5pZCwgeyBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbi5QYW5lbCB9IHNhdGlzZmllcyBJQ3JlYXRlVGVybWluYWxPcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb3BlbkNvbnRleHRNZW51KCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uYW1pbmctY29udmVudGlvblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoZT86IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Ly8gT25seSB1cGRhdGUgaWYgaXQncyB0aGUgYWN0aXZlIGluc3RhbmNlXG5cdFx0aWYgKGUgJiYgZSAhPT0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZWxlbWVudERpc3Bvc2FibGVzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmVsZW1lbnQgJiYgdGhpcy5sYWJlbCkge1xuXHRcdFx0Ly8gUmlnaHQgY2xpY2sgb3BlbnMgY29udGV4dCBtZW51XG5cdFx0XHR0aGlzLl9lbGVtZW50RGlzcG9zYWJsZXMucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDIpIHtcblx0XHRcdFx0XHR0aGlzLl9vcGVuQ29udGV4dE1lbnUoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gTWlkZGxlIGNsaWNrIGtpbGxzXG5cdFx0XHR0aGlzLl9lbGVtZW50RGlzcG9zYWJsZXMucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5BVVhDTElDSywgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2FmZURpc3Bvc2VUZXJtaW5hbChpbnN0YW5jZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gRHJhZyBhbmQgZHJvcFxuXHRcdFx0dGhpcy5fZWxlbWVudERpc3Bvc2FibGVzLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuRFJBR19TVEFSVCwgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdGlmIChlLmRhdGFUcmFuc2ZlciAmJiBpbnN0YW5jZSkge1xuXHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLnNldERhdGEoVGVybWluYWxEYXRhVHJhbnNmZXJzLlRlcm1pbmFscywgSlNPTi5zdHJpbmdpZnkoW2luc3RhbmNlLnJlc291cmNlLnRvU3RyaW5nKCldKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5sYWJlbDtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRcdGRvbS5yZXNldChsYWJlbCwgJycpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKCdzaW5nbGUtdGVybWluYWwtdGFiJyk7XG5cdFx0XHRsZXQgY29sb3JTdHlsZSA9ICcnO1xuXHRcdFx0Y29uc3QgcHJpbWFyeVN0YXR1cyA9IGluc3RhbmNlLnN0YXR1c0xpc3QucHJpbWFyeTtcblx0XHRcdGlmIChwcmltYXJ5U3RhdHVzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yS2V5ID0gZ2V0Q29sb3JGb3JTZXZlcml0eShwcmltYXJ5U3RhdHVzLnNldmVyaXR5KTtcblx0XHRcdFx0dGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRcdFx0Y29uc3QgZm91bmRDb2xvciA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoY29sb3JLZXkpO1xuXHRcdFx0XHRpZiAoZm91bmRDb2xvcikge1xuXHRcdFx0XHRcdGNvbG9yU3R5bGUgPSBmb3VuZENvbG9yLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxhYmVsLnN0eWxlLmNvbG9yID0gY29sb3JTdHlsZTtcblx0XHRcdGRvbS5yZXNldChsYWJlbCwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnModGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0U2luZ2xlVGFiTGFiZWwsIGluc3RhbmNlLCB0aGlzLl90ZXJtaW5hQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMuc2VwYXJhdG9yLCBUaGVtZUljb24uaXNUaGVtZUljb24odGhpcy5fY29tbWFuZEFjdGlvbi5pdGVtLmljb24pID8gdGhpcy5fY29tbWFuZEFjdGlvbi5pdGVtLmljb24gOiB1bmRlZmluZWQpKSk7XG5cblx0XHRcdGlmICh0aGlzLl9hbHRDb21tYW5kKSB7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fYWx0Q29tbWFuZCk7XG5cdFx0XHRcdHRoaXMuX2FsdENvbW1hbmQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29sb3IpIHtcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl9jb2xvcik7XG5cdFx0XHRcdHRoaXMuX2NvbG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NsYXNzKSB7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fY2xhc3MpO1xuXHRcdFx0XHRsYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCd0ZXJtaW5hbC11cmktaWNvbicpO1xuXHRcdFx0XHR0aGlzLl9jbGFzcyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbG9yQ2xhc3MgPSBnZXRDb2xvckNsYXNzKGluc3RhbmNlKTtcblx0XHRcdGlmIChjb2xvckNsYXNzKSB7XG5cdFx0XHRcdHRoaXMuX2NvbG9yID0gY29sb3JDbGFzcztcblx0XHRcdFx0bGFiZWwuY2xhc3NMaXN0LmFkZChjb2xvckNsYXNzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVyaUNsYXNzZXMgPSBnZXRVcmlDbGFzc2VzKGluc3RhbmNlLCB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpO1xuXHRcdFx0aWYgKHVyaUNsYXNzZXMpIHtcblx0XHRcdFx0dGhpcy5fY2xhc3MgPSB1cmlDbGFzc2VzPy5bMF07XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQoLi4udXJpQ2xhc3Nlcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbi5pdGVtLmljb24pIHtcblx0XHRcdFx0dGhpcy5fYWx0Q29tbWFuZCA9IGBhbHQtY29tbWFuZGA7XG5cdFx0XHRcdGxhYmVsLmNsYXNzTGlzdC5hZGQodGhpcy5fYWx0Q29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuQ29udGV4dE1lbnUoKSB7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gbmV3IFRlcm1pbmFsQ29udGV4dEFjdGlvblJ1bm5lcigpO1xuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLmVsZW1lbnQhLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5fYWN0aW9ucyxcblx0XHRcdC8vIFRoZSBjb250ZXh0IGlzIGFsd2F5cyB0aGUgYWN0aXZlIGluc3RhbmNlIGluIHRoZSB0ZXJtaW5hbCB2aWV3XG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFuY2UgPyBbbmV3IEluc3RhbmNlQ29udGV4dChpbnN0YW5jZSldIDogW107XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiBhY3Rpb25SdW5uZXIuZGlzcG9zZSgpXG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0U2luZ2xlVGFiTGFiZWwoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCwgc2VwYXJhdG9yOiBzdHJpbmcsIGljb24/OiBUaGVtZUljb24pIHtcblx0Ly8gRG9uJ3QgZXZlbiBzaG93IHRoZSBpY29uIGlmIHRoZXJlIGlzIG5vIHRpdGxlIGFzIHRoZSBpY29uIHdvdWxkIHNoaWZ0IGFyb3VuZCB3aGVuIHRoZSB0aXRsZVxuXHQvLyBpcyBhZGRlZFxuXHRpZiAoIWluc3RhbmNlIHx8ICFpbnN0YW5jZS50aXRsZSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRjb25zdCBpY29uSWQgPSBUaGVtZUljb24uaXNUaGVtZUljb24oaW5zdGFuY2UuaWNvbikgPyBpbnN0YW5jZS5pY29uLmlkIDogYWNjZXNzb3IuZ2V0KElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UpLmdldERlZmF1bHRJY29uKCkuaWQ7XG5cdGNvbnN0IGxhYmVsID0gYCQoJHtpY29uPy5pZCB8fCBpY29uSWR9KSAke2dldFNpbmdsZVRhYlRpdGxlKGluc3RhbmNlLCBzZXBhcmF0b3IpfWA7XG5cblx0Y29uc3QgcHJpbWFyeVN0YXR1cyA9IGluc3RhbmNlLnN0YXR1c0xpc3QucHJpbWFyeTtcblx0aWYgKCFwcmltYXJ5U3RhdHVzPy5pY29uKSB7XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cdHJldHVybiBgJHtsYWJlbH0gJCgke3ByaW1hcnlTdGF0dXMuaWNvbi5pZH0pYDtcbn1cblxuZnVuY3Rpb24gZ2V0U2luZ2xlVGFiVGl0bGUoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCBzZXBhcmF0b3I6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghaW5zdGFuY2UpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0cmV0dXJuICFpbnN0YW5jZS5kZXNjcmlwdGlvbiA/IGluc3RhbmNlLnRpdGxlIDogYCR7aW5zdGFuY2UudGl0bGV9ICR7c2VwYXJhdG9yfSAke2luc3RhbmNlLmRlc2NyaXB0aW9ufWA7XG59XG5cbmNsYXNzIFRlcm1pbmFsVGhlbWVJY29uU3R5bGUgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cdHByaXZhdGUgX3N0eWxlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoX3RoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fc3R5bGVFbGVtZW50LnJlbW92ZSgpKSk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlSWNvbkNoYW5nZSgoKSA9PiB0aGlzLnVwZGF0ZVN0eWxlcygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUdyb3VwcygoKSA9PiB0aGlzLnVwZGF0ZVN0eWxlcygpKSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlU3R5bGVzKCk7XG5cdFx0Y29uc3QgY29sb3JUaGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cblx0XHQvLyBUT0RPOiBhZGQgYSBydWxlIGNvbGxlY3RvciB0byBhdm9pZCBkdXBsaWNhdGlvblxuXHRcdGxldCBjc3MgPSAnJztcblxuXHRcdC8vIEFkZCBpY29uc1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGluc3RhbmNlLmljb247XG5cdFx0XHRpZiAoIWljb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGljb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdFx0dXJpID0gaWNvbjtcblx0XHRcdH0gZWxzZSBpZiAoaWNvbiBpbnN0YW5jZW9mIE9iamVjdCAmJiBoYXNLZXkoaWNvbiwgeyBsaWdodDogdHJ1ZSwgZGFyazogdHJ1ZSB9KSkge1xuXHRcdFx0XHR1cmkgPSBpc0RhcmsoY29sb3JUaGVtZS50eXBlKSA/IGljb24uZGFyayA6IGljb24ubGlnaHQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpY29uQ2xhc3NlcyA9IGdldFVyaUNsYXNzZXMoaW5zdGFuY2UsIGNvbG9yVGhlbWUudHlwZSk7XG5cdFx0XHRpZiAodXJpIGluc3RhbmNlb2YgVVJJICYmIGljb25DbGFzc2VzICYmIGljb25DbGFzc2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Y3NzICs9IChcblx0XHRcdFx0XHRgLm1vbmFjby13b3JrYmVuY2ggLiR7aWNvbkNsYXNzZXNbMF19IC5tb25hY28taGlnaGxpZ2h0ZWQtbGFiZWwgLmNvZGljb24sIC5tb25hY28tYWN0aW9uLWJhciAudGVybWluYWwtdXJpLWljb24uc2luZ2xlLXRlcm1pbmFsLXRhYi5hY3Rpb24tbGFiZWw6bm90KC5hbHQtY29tbWFuZCkgLmNvZGljb25gICtcblx0XHRcdFx0XHRge2JhY2tncm91bmQtaW1hZ2U6ICR7Y3NzSnMuYXNDU1NVcmwodXJpKX07fWBcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgY29sb3JzXG5cdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBjb2xvckNsYXNzID0gZ2V0Q29sb3JDbGFzcyhpbnN0YW5jZSk7XG5cdFx0XHRpZiAoIWNvbG9yQ2xhc3MgfHwgIWluc3RhbmNlLmNvbG9yKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29sb3IgPSBjb2xvclRoZW1lLmdldENvbG9yKGluc3RhbmNlLmNvbG9yKTtcblx0XHRcdGlmIChjb2xvcikge1xuXHRcdFx0XHQvLyBleGNsdWRlIHN0YXR1cyBpY29ucyAoZmlsZS1pY29uKSBhbmQgaW5saW5lIGFjdGlvbiBpY29ucyAodHJhc2hjYW4sIGhvcml6b250YWxTcGxpdCwgcmVydW5UYXNrKVxuXHRcdFx0XHRjc3MgKz0gKFxuXHRcdFx0XHRcdGAubW9uYWNvLXdvcmtiZW5jaCAuJHtjb2xvckNsYXNzfSAuY29kaWNvbjpmaXJzdC1jaGlsZDpub3QoLmNvZGljb24tc3BsaXQtaG9yaXpvbnRhbCk6bm90KC5jb2RpY29uLXRyYXNoY2FuKTpub3QoLmZpbGUtaWNvbik6bm90KC5jb2RpY29uLXJlcnVuLXRhc2spYCArXG5cdFx0XHRcdFx0YHsgY29sb3I6ICR7Y29sb3J9ICFpbXBvcnRhbnQ7IH1gXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gY3NzO1xuXHR9XG59XG5cbmNsYXNzIFNpbmdsZVRhYkhvdmVyRGVsZWdhdGUgaW1wbGVtZW50cyBJSG92ZXJEZWxlZ2F0ZSB7XG5cdHByaXZhdGUgX2xhc3RIb3ZlckhpZGVUaW1lOiBudW1iZXIgPSAwO1xuXG5cdHJlYWRvbmx5IHBsYWNlbWVudCA9ICdlbGVtZW50JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0IGRlbGF5KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIERhdGUubm93KCkgLSB0aGlzLl9sYXN0SG92ZXJIaWRlVGltZSA8IDIwMFxuXHRcdFx0PyAwICAvLyBzaG93IGluc3RhbnRseSB3aGVuIGEgaG92ZXIgd2FzIHJlY2VudGx5IHNob3duXG5cdFx0XHQ6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScpO1xuXHR9XG5cblx0c2hvd0hvdmVyKG9wdGlvbnM6IElIb3ZlckRlbGVnYXRlT3B0aW9ucywgZm9jdXM/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhvdmVySW5mbyA9IGdldEluc3RhbmNlSG92ZXJJbmZvKGluc3RhbmNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBob3ZlckluZm8uY29udGVudCxcblx0XHRcdGFjdGlvbnM6IGhvdmVySW5mby5hY3Rpb25zXG5cdFx0fSwgZm9jdXMpO1xuXHR9XG5cblx0b25EaWRIaWRlSG92ZXIoKSB7XG5cdFx0dGhpcy5fbGFzdEhvdmVySGlkZVRpbWUgPSBEYXRlLm5vdygpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQkFBcUMsZ0JBQWdCO0FBQzlELFNBQWlDLCtCQUErQix1QkFBMEMsa0JBQWtCLHlCQUF5Qiw2QkFBNkI7QUFDbEwsU0FBUyxnQkFBa0M7QUFDM0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWdCLGNBQWMsUUFBUSxzQkFBc0I7QUFDNUQsU0FBUyxpQ0FBaUMseUJBQXlCLHlCQUF5QjtBQUM1RixTQUFTLG1CQUFxQyx3QkFBd0I7QUFDdEUsU0FBUyxnQkFBNEMsNEJBQTRCO0FBQ2pGLFNBQVMsZUFBZSxvQkFBb0I7QUFDNUMsU0FBNEIsNkJBQTZCO0FBRXpELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCLCtCQUErQjtBQUNuRSxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGVBQWUsaUJBQWlCLFNBQXNCLG1CQUFtQixvQkFBb0I7QUFDdEcsU0FBUyxXQUFXO0FBQ3BCLFNB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
