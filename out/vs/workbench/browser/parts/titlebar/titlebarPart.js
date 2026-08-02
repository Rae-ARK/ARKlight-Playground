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
import "./media/titlebarpart.css";
import { localize, localize2 } from "../../../../nls.js";
import { MultiWindowParts, Part } from "../../part.js";
import { getWCOTitlebarAreaRect, getZoomFactor, isWCOEnabled } from "../../../../base/browser/browser.js";
import { getTitleBarStyle, getMenuBarVisibility, hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getWindowControlsStyle, useWindowControlsOverlay, WindowControlsStyle, MenuSettings, hasNativeMenu } from "../../../../platform/window/common/window.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TITLE_BAR_ACTIVE_BACKGROUND, TITLE_BAR_ACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_FOREGROUND, TITLE_BAR_INACTIVE_BACKGROUND, TITLE_BAR_BORDER, WORKBENCH_BACKGROUND } from "../../../common/theme.js";
import { isMacintosh, isWindows, isLinux, isWeb, isNative, platformLocale } from "../../../../base/common/platform.js";
import { Color } from "../../../../base/common/color.js";
import { EventType, EventHelper, Dimension, append, $, addDisposableListener, prepend, reset, getWindow, getWindowId, isAncestor, getActiveDocument, isHTMLElement } from "../../../../base/browser/dom.js";
import { CustomMenubarControl } from "./menubarControl.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService, ActivityBarPosition, LayoutSettings, EditorActionsLocation, EditorTabsMode } from "../../../services/layout/browser/layoutService.js";
import { createActionViewItem, fillInActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { WindowTitle } from "./windowTitle.js";
import { CommandCenterControl } from "./commandCenterControl.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID } from "../../../common/activity.js";
import { AccountsActivityActionViewItem, isAccountsActionVisible, SimpleAccountActivityActionViewItem, SimpleGlobalActivityActionViewItem } from "../globalCompositeBar.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ActionRunner, Separator } from "../../../../base/common/actions.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActionsOrientation, prepareActions } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { EDITOR_CORE_NAVIGATION_COMMANDS } from "../editor/editorCommands.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { EditorPane } from "../editor/editorPane.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { EditorCommandsContextActionRunner } from "../editor/editorTabsControl.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ACCOUNTS_ACTIVITY_TILE_ACTION, GLOBAL_ACTIVITY_TITLE_ACTION, TitleBarLeadingActionsGroup } from "./titlebarActions.js";
import { createInstantHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { safeIntl } from "../../../../base/common/date.js";
import { IsCompactTitleBarContext, TitleBarVisibleContext } from "../../../common/contextkeys.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { WORKBENCH_MENU_MOTION_CLASS, workbenchMenuCloseAnimation } from "../../actions/menuMotion.js";
let BrowserTitleService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.titleService", themeService, storageService);
    this.instantiationService = instantiationService;
    this.properties = void 0;
    this.variables = /* @__PURE__ */ new Map();
    this.mainPart = this._register(this.createMainTitlebarPart());
    this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
    this._register(this.registerPart(this.mainPart));
    this.registerActions();
    this.registerAPICommands();
  }
  createMainTitlebarPart() {
    return this.instantiationService.createInstance(MainBrowserTitlebarPart);
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class FocusTitleBar extends Action2 {
      constructor() {
        super({
          id: `workbench.action.focusTitleBar`,
          title: localize2("focusTitleBar", "Focus Title Bar"),
          category: Categories.View,
          f1: true,
          precondition: TitleBarVisibleContext
        });
      }
      run() {
        that.getPartByDocument(getActiveDocument())?.focus();
      }
    }));
  }
  registerAPICommands() {
    this._register(CommandsRegistry.registerCommand({
      id: "registerWindowTitleVariable",
      handler: (accessor, name, contextKey) => {
        this.registerVariables([{ name, contextKey }]);
      },
      metadata: {
        description: "Registers a new title variable",
        args: [
          { name: "name", schema: { type: "string" }, description: "The name of the variable to register" },
          { name: "contextKey", schema: { type: "string" }, description: "The context key to use for the value of the variable" }
        ]
      }
    }));
  }
  //#region Auxiliary Titlebar Parts
  createAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    const titlebarPartContainer = $(".part.titlebar", { role: "none" });
    titlebarPartContainer.style.position = "relative";
    container.insertBefore(titlebarPartContainer, container.firstChild);
    const disposables = new DisposableStore();
    const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
    disposables.add(this.registerPart(titlebarPart));
    disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
    titlebarPart.create(titlebarPartContainer);
    if (this.properties) {
      titlebarPart.updateProperties(this.properties);
    }
    if (this.variables.size) {
      titlebarPart.registerVariables(Array.from(this.variables.values()));
    }
    Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());
    return titlebarPart;
  }
  doCreateAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    return instantiationService.createInstance(AuxiliaryBrowserTitlebarPart, container, editorGroupsContainer, this.mainPart);
  }
  updateProperties(properties) {
    this.properties = properties;
    for (const part of this.parts) {
      part.updateProperties(properties);
    }
  }
  registerVariables(variables) {
    const newVariables = [];
    for (const variable of variables) {
      if (!this.variables.has(variable.name)) {
        this.variables.set(variable.name, variable);
        newVariables.push(variable);
      }
    }
    for (const part of this.parts) {
      part.registerVariables(newVariables);
    }
  }
  get windowTitle() {
    return this.mainPart.windowTitle;
  }
  //#endregion
};
BrowserTitleService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], BrowserTitleService);
let BrowserTitlebarPart = class extends Part {
  constructor(id, targetWindow, editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.editorGroupsContainer = editorGroupsContainer;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.storageService = storageService;
    this.contextKeyService = contextKeyService;
    this.hostService = hostService;
    this.menuService = menuService;
    this.keybindingService = keybindingService;
    this.actionViewItemService = actionViewItemService;
    //#region IView
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    //#endregion
    //#region Events
    this._onMenubarVisibilityChange = this._register(new Emitter());
    this.onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.customMenubar = this._register(new MutableDisposable());
    this.customMenubarDisposables = this._register(new DisposableStore());
    this.actionToolBarDisposable = this._register(new DisposableStore());
    this.editorActionsChangeDisposable = this._register(new DisposableStore());
    this.centerAdjacentToolBarDisposable = this._register(new DisposableStore());
    this.globalToolbarMenuDisposables = this._register(new DisposableStore());
    this.editorToolbarMenuDisposables = this._register(new DisposableStore());
    this.layoutToolbarMenuDisposables = this._register(new DisposableStore());
    this.activityToolbarDisposables = this._register(new DisposableStore());
    this.titleDisposables = this._register(new DisposableStore());
    this.isInactive = false;
    this.isCompact = false;
    const scopedEditorService = editorService.createScoped(editorGroupsContainer, this._store);
    this.instantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IEditorService, scopedEditorService]
    )));
    this.isAuxiliary = targetWindow.vscodeWindowId !== mainWindow.vscodeWindowId;
    this.isCompactContextKey = IsCompactTitleBarContext.bindTo(this.contextKeyService);
    this.titleBarStyle = getTitleBarStyle(this.configurationService);
    this.windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, targetWindow));
    this.hoverDelegate = this._register(createInstantHoverDelegate());
    this.registerListeners(getWindowId(targetWindow));
  }
  get minimumHeight() {
    const wcoEnabled = isWeb && isWCOEnabled();
    let value = this.isCommandCenterVisible || wcoEnabled ? DEFAULT_CUSTOM_TITLEBAR_HEIGHT : 30;
    if (wcoEnabled) {
      value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
    }
    return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
  }
  get maximumHeight() {
    return this.minimumHeight;
  }
  registerListeners(targetWindowId) {
    this._register(this.hostService.onDidChangeFocus((focused) => focused ? this.onFocus() : this.onBlur()));
    this._register(this.hostService.onDidChangeActiveWindow((windowId) => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChanged(e)));
    this._register(this.editorGroupsContainer.onDidChangeEditorPartOptions((e) => this.onEditorPartConfigurationChange(e)));
  }
  onBlur() {
    this.isInactive = true;
    this.updateStyles();
  }
  onFocus() {
    this.isInactive = false;
    this.updateStyles();
  }
  onEditorPartConfigurationChange({ oldPartOptions, newPartOptions }) {
    if (oldPartOptions.editorActionsLocation !== newPartOptions.editorActionsLocation || oldPartOptions.showTabs !== newPartOptions.showTabs) {
      if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
        this.createActionToolBar();
        this.createActionToolBarMenus({ editorActions: true });
        this._onDidChange.fire(void 0);
      }
    }
  }
  onConfigurationChanged(event) {
    if (event.affectsConfiguration(LayoutSettings.MODERN_UI)) {
      this.updateStyles();
    }
    if (!this.isAuxiliary && !hasNativeMenu(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb)) {
      if (event.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
        if (this.currentMenubarVisibility === "compact") {
          this.uninstallMenubar();
        } else {
          this.installMenubar();
        }
      }
    }
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle) && this.actionToolBar) {
      const affectsLayoutControl = event.affectsConfiguration(LayoutSettings.LAYOUT_ACTIONS);
      const affectsActivityControl = event.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);
      if (affectsLayoutControl || affectsActivityControl) {
        this.createActionToolBarMenus({ layoutActions: affectsLayoutControl, activityActions: affectsActivityControl });
        this._onDidChange.fire(void 0);
      }
    }
    if (event.affectsConfiguration(LayoutSettings.COMMAND_CENTER)) {
      this.recreateTitle();
    }
  }
  recreateTitle() {
    this.createTitle();
    this._onDidChange.fire(void 0);
  }
  updateOptions(options) {
    const oldIsCompact = this.isCompact;
    this.isCompact = options.compact;
    this.isCompactContextKey.set(this.isCompact);
    if (oldIsCompact !== this.isCompact) {
      this.recreateTitle();
      this.createActionToolBarMenus(true);
    }
  }
  installMenubar() {
    if (this.menubar) {
      return;
    }
    const customMenubar = this.instantiationService.createInstance(CustomMenubarControl);
    this.customMenubar.value = customMenubar;
    this.menubar = append(this.leftContent, $("div.menubar"));
    this.menubar.setAttribute("role", "menubar");
    this.customMenubarDisposables.add(customMenubar.onVisibilityChange((e) => this.onMenubarVisibilityChanged(e)));
    customMenubar.create(this.menubar);
  }
  uninstallMenubar() {
    this.customMenubarDisposables.clear();
    this.customMenubar.clear();
    this.menubar?.remove();
    this.menubar = void 0;
    this.onMenubarVisibilityChanged(false);
  }
  onMenubarVisibilityChanged(visible) {
    if (isWeb || isWindows || isLinux) {
      if (this.lastLayoutDimensions) {
        this.layout(this.lastLayoutDimensions.width, this.lastLayoutDimensions.height);
      }
      this._onMenubarVisibilityChange.fire(visible);
    }
  }
  updateProperties(properties) {
    this.windowTitle.updateProperties(properties);
  }
  registerVariables(variables) {
    this.windowTitle.registerVariables(variables);
  }
  createContentArea(parent) {
    this.element = parent;
    this.rootContainer = append(parent, $(".titlebar-container"));
    this.leftContent = append(this.rootContainer, $(".titlebar-left"));
    this.centerContent = append(this.rootContainer, $(".titlebar-center"));
    this.rightContent = append(this.rootContainer, $(".titlebar-right"));
    if ((isWindows || isLinux) && !hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      this.appIcon = prepend(this.leftContent, $("a.window-appicon"));
    }
    this.dragRegion = prepend(this.rootContainer, $("div.titlebar-drag-region"));
    if (!this.isAuxiliary && !hasNativeMenu(this.configurationService, this.titleBarStyle) && (!isMacintosh || isWeb) && this.currentMenubarVisibility !== "compact") {
      this.installMenubar();
    }
    this.title = append(this.centerContent, $("div.window-title"));
    this.createTitle();
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      const centerAdjacentToolBarElement = append(this.rightContent, $("div.center-adjacent-toolbar-container"));
      this.centerAdjacentToolBarElement = centerAdjacentToolBarElement;
      const centerAdjacentToolBar = this.centerAdjacentToolBarDisposable.add(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerAdjacentToolBarElement, MenuId.TitleBarAdjacentCenter, {
        contextMenu: MenuId.TitleBarContext,
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        toolbarOptions: {
          primaryGroup: () => true
        },
        actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options),
        hoverDelegate: this.hoverDelegate
      }));
      this.centerAdjacentToolBarDisposable.add(centerAdjacentToolBar.onDidChangeMenuItems(() => this.updateCenterAdjacentToolBarOverflow()));
    }
    if (hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      this.actionToolBarElement = append(this.rightContent, $("div.action-toolbar-container"));
      this.createActionToolBar();
      this.createActionToolBarMenus();
    }
    if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      let primaryWindowControlsLocation = isMacintosh ? "left" : "right";
      if (isMacintosh && isNative) {
        const localeInfo = safeIntl.Locale(platformLocale).value;
        const textInfo = localeInfo.textInfo;
        if (textInfo && typeof textInfo === "object" && "direction" in textInfo && textInfo.direction === "rtl") {
          primaryWindowControlsLocation = "right";
        }
      }
      if (isMacintosh && isNative && primaryWindowControlsLocation === "left") {
      } else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
      } else {
        this.windowControlsContainer = append(primaryWindowControlsLocation === "left" ? this.leftContent : this.rightContent, $("div.window-controls-container"));
        if (isWeb) {
          append(primaryWindowControlsLocation === "left" ? this.rightContent : this.leftContent, $("div.window-controls-container"));
        }
        if (isWCOEnabled()) {
          this.windowControlsContainer.classList.add("wco-enabled");
        }
      }
    }
    {
      this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, (e) => {
        EventHelper.stop(e);
        let targetMenu;
        if (isMacintosh && isHTMLElement(e.target) && isAncestor(e.target, this.title)) {
          targetMenu = MenuId.TitleBarTitleContext;
        } else {
          targetMenu = MenuId.TitleBarContext;
        }
        this.onContextMenu(e, targetMenu);
      }));
      if (isMacintosh) {
        this._register(addDisposableListener(
          this.title,
          EventType.MOUSE_DOWN,
          (e) => {
            if (e.metaKey) {
              EventHelper.stop(
                e,
                true
                /* stop bubbling to prevent command center from opening */
              );
              this.onContextMenu(e, MenuId.TitleBarTitleContext);
            }
          },
          true
          /* capture phase to prevent command center from opening */
        ));
      }
    }
    this.updateStyles();
    return this.element;
  }
  createTitle() {
    this.titleDisposables.clear();
    const isShowingTitleInNativeTitlebar = hasNativeTitlebar(this.configurationService, this.titleBarStyle);
    if (!this.isCommandCenterVisible) {
      if (!isShowingTitleInNativeTitlebar) {
        this.title.textContent = this.windowTitle.value;
        this.titleDisposables.add(this.windowTitle.onDidChange(() => {
          this.title.textContent = this.windowTitle.value;
          if (this.lastLayoutDimensions) {
            this.updateLayout(this.lastLayoutDimensions);
          }
        }));
      } else {
        reset(this.title);
      }
    } else {
      const commandCenter = this.instantiationService.createInstance(CommandCenterControl, this.windowTitle, this.hoverDelegate);
      reset(this.title, commandCenter.element);
      this.titleDisposables.add(commandCenter);
    }
  }
  actionViewItemProvider(action, options) {
    for (const menuId of [MenuId.TitleBar, MenuId.LayoutControlMenu]) {
      const customViewItem = this.actionViewItemService.lookUp(menuId, action.id);
      if (customViewItem) {
        const result = customViewItem(action, options, this.instantiationService, getWindowId(this.element ? getWindow(this.element) : mainWindow));
        if (result) {
          return result;
        }
      }
    }
    if (!this.isAuxiliary) {
      if (action.id === GLOBAL_ACTIVITY_ID) {
        return this.instantiationService.createInstance(SimpleGlobalActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
      }
      if (action.id === ACCOUNTS_ACTIVITY_ID) {
        return this.instantiationService.createInstance(SimpleAccountActivityActionViewItem, { position: () => HoverPosition.BELOW }, options);
      }
    }
    const activeEditorPane = this.editorGroupsContainer.activeGroup?.activeEditorPane;
    if (activeEditorPane && activeEditorPane instanceof EditorPane) {
      const result = activeEditorPane.getActionViewItem(action, options);
      if (result) {
        return result;
      }
    }
    return createActionViewItem(this.instantiationService, action, { ...options, menuAsChild: false });
  }
  getKeybinding(action) {
    const editorPaneAwareContextKeyService = this.editorGroupsContainer.activeGroup?.activeEditorPane?.scopedContextKeyService ?? this.contextKeyService;
    return this.keybindingService.lookupKeybinding(action.id, editorPaneAwareContextKeyService);
  }
  createActionToolBar() {
    this.actionToolBarDisposable.clear();
    this.actionToolBar = this.actionToolBarDisposable.add(this.instantiationService.createInstance(WorkbenchToolBar, this.actionToolBarElement, {
      contextMenu: MenuId.TitleBarContext,
      orientation: ActionsOrientation.HORIZONTAL,
      ariaLabel: localize("ariaLabelTitleActions", "Title actions"),
      getKeyBinding: (action) => this.getKeybinding(action),
      overflowBehavior: { maxItems: 12, exempted: [ACCOUNTS_ACTIVITY_ID, GLOBAL_ACTIVITY_ID, ...EDITOR_CORE_NAVIGATION_COMMANDS] },
      anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
      dropdownMenuClassName: WORKBENCH_MENU_MOTION_CLASS,
      dropdownMenuCloseAnimation: workbenchMenuCloseAnimation,
      telemetrySource: "titlePart",
      highlightToggledItems: this.isAuxiliary,
      // Only show toggled state for auxiliary title bars
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      hoverDelegate: this.hoverDelegate
    }));
    if (this.editorActionsEnabled) {
      this.actionToolBarDisposable.add(this.editorGroupsContainer.onDidChangeActiveGroup(() => this.createActionToolBarMenus({ editorActions: true })));
    }
  }
  createActionToolBarMenus(update = true) {
    if (update === true) {
      update = { editorActions: true, layoutActions: true, globalActions: true, activityActions: true };
    }
    const updateToolBarActions = () => {
      const actions = { primary: [], secondary: [] };
      if (this.globalToolbarMenu) {
        const leading = { primary: [], secondary: [] };
        fillInActionBarActions(
          this.globalToolbarMenu.getActions(),
          leading,
          (actionGroup) => actionGroup === TitleBarLeadingActionsGroup
        );
        actions.primary.push(...leading.primary);
        actions.primary.push(new Separator());
      }
      if (this.editorActionsEnabled) {
        this.editorActionsChangeDisposable.clear();
        const activeGroup = this.editorGroupsContainer.activeGroup;
        if (activeGroup) {
          const editorActions = activeGroup.createEditorActions(this.editorActionsChangeDisposable, this.isAuxiliary && this.isCompact ? MenuId.CompactWindowEditorTitle : MenuId.EditorTitle);
          actions.primary.push(...editorActions.actions.primary);
          actions.secondary.push(...editorActions.actions.secondary);
          actions.primary.push(new Separator());
          this.editorActionsChangeDisposable.add(editorActions.onDidChange(() => updateToolBarActions()));
        }
      }
      if (this.layoutToolbarMenu) {
        fillInActionBarActions(
          this.layoutToolbarMenu.getActions(),
          actions,
          (group) => group === "navigation"
        );
      }
      if (this.globalToolbarMenu) {
        const trailingGroups = this.globalToolbarMenu.getActions().filter(([group]) => group !== TitleBarLeadingActionsGroup);
        fillInActionBarActions(
          trailingGroups,
          actions
        );
      }
      if (this.activityActionsEnabled) {
        if (isAccountsActionVisible(this.storageService)) {
          actions.primary.push(ACCOUNTS_ACTIVITY_TILE_ACTION);
        }
        actions.primary.push(GLOBAL_ACTIVITY_TITLE_ACTION);
      }
      this.actionToolBar.setActions(prepareActions(actions.primary), prepareActions(actions.secondary));
    };
    if (update.editorActions) {
      this.editorToolbarMenuDisposables.clear();
      if (this.editorActionsEnabled && this.editorGroupsContainer.activeGroup?.activeEditor) {
        const context = { groupId: this.editorGroupsContainer.activeGroup.id };
        this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new EditorCommandsContextActionRunner(context));
        this.actionToolBar.context = context;
      } else {
        this.actionToolBar.actionRunner = this.editorToolbarMenuDisposables.add(new ActionRunner());
        this.actionToolBar.context = void 0;
      }
    }
    if (update.layoutActions) {
      this.layoutToolbarMenuDisposables.clear();
      if (this.layoutControlEnabled) {
        this.layoutToolbarMenu = this.menuService.createMenu(MenuId.LayoutControlMenu, this.contextKeyService);
        this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu);
        this.layoutToolbarMenuDisposables.add(this.layoutToolbarMenu.onDidChange(() => updateToolBarActions()));
      } else {
        this.layoutToolbarMenu = void 0;
      }
    }
    if (update.globalActions) {
      this.globalToolbarMenuDisposables.clear();
      if (this.globalActionsEnabled) {
        this.globalToolbarMenu = this.menuService.createMenu(MenuId.TitleBar, this.contextKeyService);
        this.globalToolbarMenuDisposables.add(this.globalToolbarMenu);
        this.globalToolbarMenuDisposables.add(this.globalToolbarMenu.onDidChange(() => updateToolBarActions()));
      } else {
        this.globalToolbarMenu = void 0;
      }
    }
    if (update.activityActions) {
      this.activityToolbarDisposables.clear();
      if (this.activityActionsEnabled) {
        this.activityToolbarDisposables.add(this.storageService.onDidChangeValue(StorageScope.PROFILE, AccountsActivityActionViewItem.ACCOUNTS_VISIBILITY_PREFERENCE_KEY, this._store)(() => updateToolBarActions()));
      }
    }
    updateToolBarActions();
  }
  updateStyles() {
    super.updateStyles();
    if (this.element) {
      if (this.isInactive) {
        this.element.classList.add("inactive");
      } else {
        this.element.classList.remove("inactive");
      }
      const titleBackground = isNative && isWindows && useWindowControlsOverlay(this.configurationService) && this.configurationService.getValue(LayoutSettings.MODERN_UI) === true ? WORKBENCH_BACKGROUND(this.theme).toString() : this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_BACKGROUND : TITLE_BAR_ACTIVE_BACKGROUND, (color, theme) => {
        return color.isOpaque() ? color : color.makeOpaque(WORKBENCH_BACKGROUND(theme));
      }) || "";
      this.element.style.backgroundColor = titleBackground;
      if (this.appIconBadge) {
        this.appIconBadge.style.backgroundColor = titleBackground;
      }
      if (titleBackground && Color.fromHex(titleBackground).isLighter()) {
        this.element.classList.add("light");
      } else {
        this.element.classList.remove("light");
      }
      const titleForeground = this.getColor(this.isInactive ? TITLE_BAR_INACTIVE_FOREGROUND : TITLE_BAR_ACTIVE_FOREGROUND);
      this.element.style.color = titleForeground || "";
      const titleBorder = this.getColor(TITLE_BAR_BORDER);
      this.element.style.borderBottom = titleBorder ? `1px solid ${titleBorder}` : "";
    }
  }
  onContextMenu(e, menuId) {
    const event = new StandardMouseEvent(getWindow(this.element), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId,
      contextKeyService: this.contextKeyService,
      domForShadowRoot: isMacintosh && isNative ? event.target : void 0
    });
  }
  get currentMenubarVisibility() {
    if (this.isAuxiliary) {
      return "hidden";
    }
    return getMenuBarVisibility(this.configurationService);
  }
  get layoutControlEnabled() {
    return this.configurationService.getValue(LayoutSettings.LAYOUT_ACTIONS) !== false;
  }
  get isCommandCenterVisible() {
    return !this.isCompact && this.configurationService.getValue(LayoutSettings.COMMAND_CENTER) !== false;
  }
  get editorActionsEnabled() {
    return this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.TITLEBAR || this.editorGroupsContainer.partOptions.editorActionsLocation === EditorActionsLocation.DEFAULT && this.editorGroupsContainer.partOptions.showTabs === EditorTabsMode.NONE;
  }
  get activityActionsEnabled() {
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    return !this.isCompact && !this.isAuxiliary && (activityBarPosition === ActivityBarPosition.TOP || activityBarPosition === ActivityBarPosition.BOTTOM);
  }
  get globalActionsEnabled() {
    return !this.isCompact;
  }
  get hasZoomableElements() {
    const hasMenubar = !(this.currentMenubarVisibility === "hidden" || this.currentMenubarVisibility === "compact" || !isWeb && isMacintosh);
    const hasCommandCenter = this.isCommandCenterVisible;
    const hasToolBarActions = this.globalActionsEnabled || this.layoutControlEnabled || this.editorActionsEnabled || this.activityActionsEnabled;
    return hasMenubar || hasCommandCenter || hasToolBarActions;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
  }
  layout(width, height) {
    this.updateLayout(new Dimension(width, height));
    super.layoutContents(width, height);
    this.updateCenterAdjacentToolBarOverflow();
  }
  /**
   * Hides the optional center-adjacent toolbar (e.g. the update indicator) when showing it would push the title bar
   * content—most notably the trailing window controls—off-screen as the window is collapsed horizontally (#303222).
   * Overflow is measured against actual rendered widths so the toolbar stays visible whenever it fits.
   */
  updateCenterAdjacentToolBarOverflow() {
    const element = this.centerAdjacentToolBarElement;
    if (!element) {
      return;
    }
    if (element.classList.contains("has-no-actions")) {
      element.classList.remove("overflowing");
      return;
    }
    element.classList.remove("overflowing");
    const overflows = this.rootContainer.scrollWidth > this.rootContainer.clientWidth;
    element.classList.toggle("overflowing", overflows);
  }
  updateLayout(dimension) {
    this.lastLayoutDimensions = dimension;
    if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      return;
    }
    const zoomFactor = getZoomFactor(getWindow(this.element));
    this.element.style.setProperty("--zoom-factor", zoomFactor.toString());
    this.rootContainer.classList.toggle("counter-zoom", this.preventZoom);
    if (this.customMenubar.value) {
      const menubarDimension = new Dimension(0, dimension.height);
      this.customMenubar.value.layout(menubarDimension);
    }
    const hasCenter = this.isCommandCenterVisible || this.title.textContent !== "";
    this.rootContainer.classList.toggle("has-center", hasCenter);
  }
  focus() {
    if (this.customMenubar.value) {
      this.customMenubar.value.toggleFocus();
    } else {
      this.element.querySelector('[tabindex]:not([tabindex="-1"])')?.focus();
    }
  }
  toJSON() {
    return {
      type: Parts.TITLEBAR_PART
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
BrowserTitlebarPart = __decorateClass([
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IBrowserWorkbenchEnvironmentService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IWorkbenchLayoutService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IEditorService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IActionViewItemService)
], BrowserTitlebarPart);
let MainBrowserTitlebarPart = class extends BrowserTitlebarPart {
  constructor(contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, actionViewItemService) {
    super(Parts.TITLEBAR_PART, mainWindow, editorGroupService.mainPart, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService);
  }
};
MainBrowserTitlebarPart = __decorateClass([
  __decorateParam(0, IContextMenuService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IBrowserWorkbenchEnvironmentService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IHostService),
  __decorateParam(9, IEditorGroupsService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, IActionViewItemService)
], MainBrowserTitlebarPart);
let AuxiliaryBrowserTitlebarPart = class extends BrowserTitlebarPart {
  constructor(container, editorGroupsContainer, mainTitlebar, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorGroupService, editorService, menuService, keybindingService, actionViewItemService) {
    const id = AuxiliaryBrowserTitlebarPart.COUNTER++;
    super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), editorGroupsContainer, contextMenuService, configurationService, environmentService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService, editorService, menuService, keybindingService, actionViewItemService);
    this.container = container;
    this.mainTitlebar = mainTitlebar;
  }
  get height() {
    return this.minimumHeight;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
  }
};
AuxiliaryBrowserTitlebarPart.COUNTER = 1;
AuxiliaryBrowserTitlebarPart = __decorateClass([
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IBrowserWorkbenchEnvironmentService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IWorkbenchLayoutService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IMenuService),
  __decorateParam(15, IKeybindingService),
  __decorateParam(16, IActionViewItemService)
], AuxiliaryBrowserTitlebarPart);
export {
  AuxiliaryBrowserTitlebarPart,
  BrowserTitleService,
  BrowserTitlebarPart,
  MainBrowserTitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3RpdGxlYmFyL3RpdGxlYmFyUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS90aXRsZWJhcnBhcnQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTXVsdGlXaW5kb3dQYXJ0cywgUGFydCB9IGZyb20gJy4uLy4uL3BhcnQuanMnO1xuaW1wb3J0IHsgSVRpdGxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RpdGxlL2Jyb3dzZXIvdGl0bGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFdDT1RpdGxlYmFyQXJlYVJlY3QsIGdldFpvb21GYWN0b3IsIGlzV0NPRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IE1lbnVCYXJWaXNpYmlsaXR5LCBnZXRUaXRsZUJhclN0eWxlLCBnZXRNZW51QmFyVmlzaWJpbGl0eSwgaGFzQ3VzdG9tVGl0bGViYXIsIGhhc05hdGl2ZVRpdGxlYmFyLCBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQsIGdldFdpbmRvd0NvbnRyb2xzU3R5bGUsIHVzZVdpbmRvd0NvbnRyb2xzT3ZlcmxheSwgV2luZG93Q29udHJvbHNTdHlsZSwgVGl0bGViYXJTdHlsZSwgTWVudVNldHRpbmdzLCBoYXNOYXRpdmVNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRJVExFX0JBUl9BQ1RJVkVfQkFDS0dST1VORCwgVElUTEVfQkFSX0FDVElWRV9GT1JFR1JPVU5ELCBUSVRMRV9CQVJfSU5BQ1RJVkVfRk9SRUdST1VORCwgVElUTEVfQkFSX0lOQUNUSVZFX0JBQ0tHUk9VTkQsIFRJVExFX0JBUl9CT1JERVIsIFdPUktCRU5DSF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dpbmRvd3MsIGlzTGludXgsIGlzV2ViLCBpc05hdGl2ZSwgcGxhdGZvcm1Mb2NhbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSwgRXZlbnRIZWxwZXIsIERpbWVuc2lvbiwgYXBwZW5kLCAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIHByZXBlbmQsIHJlc2V0LCBnZXRXaW5kb3csIGdldFdpbmRvd0lkLCBpc0FuY2VzdG9yLCBnZXRBY3RpdmVEb2N1bWVudCwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ3VzdG9tTWVudWJhckNvbnRyb2wgfSBmcm9tICcuL21lbnViYXJDb250cm9sLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUGFydHMsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBBY3Rpdml0eUJhclBvc2l0aW9uLCBMYXlvdXRTZXR0aW5ncywgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLCBFZGl0b3JUYWJzTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGZpbGxJbkFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IFdpbmRvd1RpdGxlIH0gZnJvbSAnLi93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kQ2VudGVyQ29udHJvbCB9IGZyb20gJy4vY29tbWFuZENlbnRlckNvbnRyb2wuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyLCBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQUNUSVZJVFlfSUQsIEdMT0JBTF9BQ1RJVklUWV9JRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBBY2NvdW50c0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0sIGlzQWNjb3VudHNBY3Rpb25WaXNpYmxlLCBTaW1wbGVBY2NvdW50QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSwgU2ltcGxlR2xvYmFsQWN0aXZpdHlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uL2dsb2JhbENvbXBvc2l0ZUJhci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNDb250YWluZXIsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbSwgcHJlcGFyZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBFRElUT1JfQ09SRV9OQVZJR0FUSU9OX0NPTU1BTkRTIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb21tYW5kc0NvbnRleHRBY3Rpb25SdW5uZXIgfSBmcm9tICcuLi9lZGl0b3IvZWRpdG9yVGFic0NvbnRyb2wuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbW1hbmRzQ29udGV4dCwgSUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQsIElUb29sYmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQUNDT1VOVFNfQUNUSVZJVFlfVElMRV9BQ1RJT04sIEdMT0JBTF9BQ1RJVklUWV9USVRMRV9BQ1RJT04sIFRpdGxlQmFyTGVhZGluZ0FjdGlvbnNHcm91cCB9IGZyb20gJy4vdGl0bGViYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IElWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSXNDb21wYWN0VGl0bGVCYXJDb250ZXh0LCBUaXRsZUJhclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgV09SS0JFTkNIX01FTlVfTU9USU9OX0NMQVNTLCB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24gfSBmcm9tICcuLi8uLi9hY3Rpb25zL21lbnVNb3Rpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUaXRsZVZhcmlhYmxlIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb250ZXh0S2V5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRpdGxlUHJvcGVydGllcyB7XG5cdGlzUHVyZT86IGJvb2xlYW47XG5cdGlzQWRtaW4/OiBib29sZWFuO1xuXHRwcmVmaXg/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRpdGxlYmFyUGFydCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgd2hlbiB0aGUgbWVudWJhciB2aXNpYmlsaXR5IGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlOiBFdmVudDxib29sZWFuPjtcblxuXHQvKipcblx0ICogVXBkYXRlIHNvbWUgZW52aXJvbm1lbnRhbCB0aXRsZSBwcm9wZXJ0aWVzLlxuXHQgKi9cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZDtcblxuXHQvKipcblx0ICogQWRkcyB2YXJpYWJsZXMgdG8gYmUgc3VwcG9ydGVkIGluIHRoZSB3aW5kb3cgdGl0bGUuXG5cdCAqL1xuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlclRpdGxlU2VydmljZSBleHRlbmRzIE11bHRpV2luZG93UGFydHM8QnJvd3NlclRpdGxlYmFyUGFydD4gaW1wbGVtZW50cyBJVGl0bGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtYWluUGFydDogQnJvd3NlclRpdGxlYmFyUGFydDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC50aXRsZVNlcnZpY2UnLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMubWFpblBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU1haW5UaXRsZWJhclBhcnQoKSk7XG5cdFx0dGhpcy5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5tYWluUGFydC5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVnaXN0ZXJQYXJ0KHRoaXMubWFpblBhcnQpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFQSUNvbW1hbmRzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWFpblRpdGxlYmFyUGFydCgpOiBCcm93c2VyVGl0bGViYXJQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYWluQnJvd3NlclRpdGxlYmFyUGFydCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucygpOiB2b2lkIHtcblxuXHRcdC8vIEZvY3VzIGFjdGlvblxuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1RpdGxlQmFyIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmZvY3VzVGl0bGVCYXJgLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzVGl0bGVCYXInLCAnRm9jdXMgVGl0bGUgQmFyJyksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0XHRwcmVjb25kaXRpb246IFRpdGxlQmFyVmlzaWJsZUNvbnRleHRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0dGhhdC5nZXRQYXJ0QnlEb2N1bWVudChnZXRBY3RpdmVEb2N1bWVudCgpKT8uZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQVBJQ29tbWFuZHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6ICdyZWdpc3RlcldpbmRvd1RpdGxlVmFyaWFibGUnLFxuXHRcdFx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBuYW1lOiBzdHJpbmcsIGNvbnRleHRLZXk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyVmFyaWFibGVzKFt7IG5hbWUsIGNvbnRleHRLZXkgfV0pO1xuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVnaXN0ZXJzIGEgbmV3IHRpdGxlIHZhcmlhYmxlJyxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHsgbmFtZTogJ25hbWUnLCBzY2hlbWE6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246ICdUaGUgbmFtZSBvZiB0aGUgdmFyaWFibGUgdG8gcmVnaXN0ZXInIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnY29udGV4dEtleScsIHNjaGVtYTogeyB0eXBlOiAnc3RyaW5nJyB9LCBkZXNjcmlwdGlvbjogJ1RoZSBjb250ZXh0IGtleSB0byB1c2UgZm9yIHRoZSB2YWx1ZSBvZiB0aGUgdmFyaWFibGUnIH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBBdXhpbGlhcnkgVGl0bGViYXIgUGFydHNcblxuXHRjcmVhdGVBdXhpbGlhcnlUaXRsZWJhclBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cdFx0Y29uc3QgdGl0bGViYXJQYXJ0Q29udGFpbmVyID0gJCgnLnBhcnQudGl0bGViYXInLCB7IHJvbGU6ICdub25lJyB9KTtcblx0XHR0aXRsZWJhclBhcnRDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdGNvbnRhaW5lci5pbnNlcnRCZWZvcmUodGl0bGViYXJQYXJ0Q29udGFpbmVyLCBjb250YWluZXIuZmlyc3RDaGlsZCk7IC8vIGVuc3VyZSB3ZSBhcmUgZmlyc3QgZWxlbWVudFxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB0aXRsZWJhclBhcnQgPSB0aGlzLmRvQ3JlYXRlQXV4aWxpYXJ5VGl0bGViYXJQYXJ0KHRpdGxlYmFyUGFydENvbnRhaW5lciwgZWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJQYXJ0KHRpdGxlYmFyUGFydCkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aXRsZWJhclBhcnQub25EaWRDaGFuZ2UsICgpID0+IHRpdGxlYmFyUGFydENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aXRsZWJhclBhcnQuaGVpZ2h0fXB4YCkpO1xuXHRcdHRpdGxlYmFyUGFydC5jcmVhdGUodGl0bGViYXJQYXJ0Q29udGFpbmVyKTtcblxuXHRcdGlmICh0aGlzLnByb3BlcnRpZXMpIHtcblx0XHRcdHRpdGxlYmFyUGFydC51cGRhdGVQcm9wZXJ0aWVzKHRoaXMucHJvcGVydGllcyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmFyaWFibGVzLnNpemUpIHtcblx0XHRcdHRpdGxlYmFyUGFydC5yZWdpc3RlclZhcmlhYmxlcyhBcnJheS5mcm9tKHRoaXMudmFyaWFibGVzLnZhbHVlcygpKSk7XG5cdFx0fVxuXG5cdFx0RXZlbnQub25jZSh0aXRsZWJhclBhcnQub25XaWxsRGlzcG9zZSkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHJldHVybiB0aXRsZWJhclBhcnQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZG9DcmVhdGVBdXhpbGlhcnlUaXRsZWJhclBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogQnJvd3NlclRpdGxlYmFyUGFydCAmIElBdXhpbGlhcnlUaXRsZWJhclBhcnQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXhpbGlhcnlCcm93c2VyVGl0bGViYXJQYXJ0LCBjb250YWluZXIsIGVkaXRvckdyb3Vwc0NvbnRhaW5lciwgdGhpcy5tYWluUGFydCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cblx0cmVhZG9ubHkgb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTogRXZlbnQ8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHVwZGF0ZVByb3BlcnRpZXMocHJvcGVydGllczogSVRpdGxlUHJvcGVydGllcyk6IHZvaWQge1xuXHRcdHRoaXMucHJvcGVydGllcyA9IHByb3BlcnRpZXM7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC51cGRhdGVQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmFyaWFibGVzID0gbmV3IE1hcDxzdHJpbmcsIElUaXRsZVZhcmlhYmxlPigpO1xuXG5cdHJlZ2lzdGVyVmFyaWFibGVzKHZhcmlhYmxlczogSVRpdGxlVmFyaWFibGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1ZhcmlhYmxlczogSVRpdGxlVmFyaWFibGVbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmICghdGhpcy52YXJpYWJsZXMuaGFzKHZhcmlhYmxlLm5hbWUpKSB7XG5cdFx0XHRcdHRoaXMudmFyaWFibGVzLnNldCh2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZSk7XG5cdFx0XHRcdG5ld1ZhcmlhYmxlcy5wdXNoKHZhcmlhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC5yZWdpc3RlclZhcmlhYmxlcyhuZXdWYXJpYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdGdldCB3aW5kb3dUaXRsZSgpOiBXaW5kb3dUaXRsZSB7XG5cdFx0cmV0dXJuIHRoaXMubWFpblBhcnQud2luZG93VGl0bGU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJUaXRsZWJhclBhcnQgZXh0ZW5kcyBQYXJ0IGltcGxlbWVudHMgSVRpdGxlYmFyUGFydCB7XG5cblx0Ly8jcmVnaW9uIElWaWV3XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdjb0VuYWJsZWQgPSBpc1dlYiAmJiBpc1dDT0VuYWJsZWQoKTtcblx0XHRsZXQgdmFsdWUgPSB0aGlzLmlzQ29tbWFuZENlbnRlclZpc2libGUgfHwgd2NvRW5hYmxlZCA/IERFRkFVTFRfQ1VTVE9NX1RJVExFQkFSX0hFSUdIVCA6IDMwO1xuXHRcdGlmICh3Y29FbmFibGVkKSB7XG5cdFx0XHR2YWx1ZSA9IE1hdGgubWF4KHZhbHVlLCBnZXRXQ09UaXRsZWJhckFyZWFSZWN0KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKT8uaGVpZ2h0ID8/IDApO1xuXHRcdH1cblxuXHRcdHJldHVybiB2YWx1ZSAvICh0aGlzLnByZXZlbnRab29tID8gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgOiAxKTtcblx0fVxuXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLm1pbmltdW1IZWlnaHQ7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSBfb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByb3RlY3RlZCByb290Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCB3aW5kb3dDb250cm9sc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGRyYWdSZWdpb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRpdGxlITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBsZWZ0Q29udGVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNlbnRlckNvbnRlbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByaWdodENvbnRlbnQhOiBIVE1MRWxlbWVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgY3VzdG9tTWVudWJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDdXN0b21NZW51YmFyQ29udHJvbD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY3VzdG9tTWVudWJhckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJvdGVjdGVkIGFwcEljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFwcEljb25CYWRnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBtZW51YmFyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGFzdExheW91dERpbWVuc2lvbnM6IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGFjdGlvblRvb2xCYXIhOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblRvb2xCYXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JBY3Rpb25zQ2hhbmdlRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgYWN0aW9uVG9vbEJhckVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjZW50ZXJBZGphY2VudFRvb2xCYXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGdsb2JhbFRvb2xiYXJNZW51OiBJTWVudSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXlvdXRUb29sYmFyTWVudTogSU1lbnUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBnbG9iYWxUb29sYmFyTWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JUb29sYmFyTWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXRUb29sYmFyTWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVRvb2xiYXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHRpdGxlQmFyU3R5bGU6IFRpdGxlYmFyU3R5bGU7XG5cblx0cHJpdmF0ZSBpc0luYWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc0F1eGlsaWFyeTogYm9vbGVhbjtcblx0cHJpdmF0ZSBpc0NvbXBhY3QgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlzQ29tcGFjdENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHJlYWRvbmx5IHdpbmRvd1RpdGxlOiBXaW5kb3dUaXRsZTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgeyBoYXNUaXRsZTogZmFsc2UgfSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHRjb25zdCBzY29wZWRFZGl0b3JTZXJ2aWNlID0gZWRpdG9yU2VydmljZS5jcmVhdGVTY29wZWQoZWRpdG9yR3JvdXBzQ29udGFpbmVyLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJRWRpdG9yU2VydmljZSwgc2NvcGVkRWRpdG9yU2VydmljZV1cblx0XHQpKSk7XG5cblx0XHR0aGlzLmlzQXV4aWxpYXJ5ID0gdGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkICE9PSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkO1xuXG5cdFx0dGhpcy5pc0NvbXBhY3RDb250ZXh0S2V5ID0gSXNDb21wYWN0VGl0bGVCYXJDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMudGl0bGVCYXJTdHlsZSA9IGdldFRpdGxlQmFyU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLndpbmRvd1RpdGxlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaW5kb3dUaXRsZSwgdGFyZ2V0V2luZG93KSk7XG5cblx0XHR0aGlzLmhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoZ2V0V2luZG93SWQodGFyZ2V0V2luZG93KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKHRhcmdldFdpbmRvd0lkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoZm9jdXNlZCA9PiBmb2N1c2VkID8gdGhpcy5vbkZvY3VzKCkgOiB0aGlzLm9uQmx1cigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZVdpbmRvdyh3aW5kb3dJZCA9PiB3aW5kb3dJZCA9PT0gdGFyZ2V0V2luZG93SWQgPyB0aGlzLm9uRm9jdXMoKSA6IHRoaXMub25CbHVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25Db25maWd1cmF0aW9uQ2hhbmdlZChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSA9PiB0aGlzLm9uRWRpdG9yUGFydENvbmZpZ3VyYXRpb25DaGFuZ2UoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25CbHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNJbmFjdGl2ZSA9IHRydWU7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNJbmFjdGl2ZSA9IGZhbHNlO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JQYXJ0Q29uZmlndXJhdGlvbkNoYW5nZSh7IG9sZFBhcnRPcHRpb25zLCBuZXdQYXJ0T3B0aW9ucyB9OiBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChcblx0XHRcdG9sZFBhcnRPcHRpb25zLmVkaXRvckFjdGlvbnNMb2NhdGlvbiAhPT0gbmV3UGFydE9wdGlvbnMuZWRpdG9yQWN0aW9uc0xvY2F0aW9uIHx8XG5cdFx0XHRvbGRQYXJ0T3B0aW9ucy5zaG93VGFicyAhPT0gbmV3UGFydE9wdGlvbnMuc2hvd1RhYnNcblx0XHQpIHtcblx0XHRcdGlmIChoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpICYmIHRoaXMuYWN0aW9uVG9vbEJhcikge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXIoKTtcblx0XHRcdFx0dGhpcy5jcmVhdGVBY3Rpb25Ub29sQmFyTWVudXMoeyBlZGl0b3JBY3Rpb25zOiB0cnVlIH0pO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZXZlbnQ6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSkge1xuXHRcdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHR9XG5cblx0XHQvLyBDdXN0b20gbWVudSBiYXIgKGRpc2FibGVkIGlmIGF1eGlsaWFyeSlcblx0XHRpZiAoIXRoaXMuaXNBdXhpbGlhcnkgJiYgIWhhc05hdGl2ZU1lbnUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSAmJiAoIWlzTWFjaW50b3NoIHx8IGlzV2ViKSkge1xuXHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKE1lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudE1lbnViYXJWaXNpYmlsaXR5ID09PSAnY29tcGFjdCcpIHtcblx0XHRcdFx0XHR0aGlzLnVuaW5zdGFsbE1lbnViYXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmluc3RhbGxNZW51YmFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBY3Rpb25zXG5cdFx0aWYgKGhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkgJiYgdGhpcy5hY3Rpb25Ub29sQmFyKSB7XG5cdFx0XHRjb25zdCBhZmZlY3RzTGF5b3V0Q29udHJvbCA9IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkxBWU9VVF9BQ1RJT05TKTtcblx0XHRcdGNvbnN0IGFmZmVjdHNBY3Rpdml0eUNvbnRyb2wgPSBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXG5cdFx0XHRpZiAoYWZmZWN0c0xheW91dENvbnRyb2wgfHwgYWZmZWN0c0FjdGl2aXR5Q29udHJvbCkge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cyh7IGxheW91dEFjdGlvbnM6IGFmZmVjdHNMYXlvdXRDb250cm9sLCBhY3Rpdml0eUFjdGlvbnM6IGFmZmVjdHNBY3Rpdml0eUNvbnRyb2wgfSk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbW1hbmQgQ2VudGVyXG5cdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSkge1xuXHRcdFx0dGhpcy5yZWNyZWF0ZVRpdGxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWNyZWF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdHRoaXMuY3JlYXRlVGl0bGUoKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBvbGRJc0NvbXBhY3QgPSB0aGlzLmlzQ29tcGFjdDtcblx0XHR0aGlzLmlzQ29tcGFjdCA9IG9wdGlvbnMuY29tcGFjdDtcblxuXHRcdHRoaXMuaXNDb21wYWN0Q29udGV4dEtleS5zZXQodGhpcy5pc0NvbXBhY3QpO1xuXG5cdFx0aWYgKG9sZElzQ29tcGFjdCAhPT0gdGhpcy5pc0NvbXBhY3QpIHtcblx0XHRcdHRoaXMucmVjcmVhdGVUaXRsZSgpO1xuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb25Ub29sQmFyTWVudXModHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGluc3RhbGxNZW51YmFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1lbnViYXIpIHtcblx0XHRcdHJldHVybjsgLy8gSWYgdGhlIG1lbnViYXIgaXMgYWxyZWFkeSBpbnN0YWxsZWQsIHNraXBcblx0XHR9XG5cblx0XHRjb25zdCBjdXN0b21NZW51YmFyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21NZW51YmFyQ29udHJvbCk7XG5cdFx0dGhpcy5jdXN0b21NZW51YmFyLnZhbHVlID0gY3VzdG9tTWVudWJhcjtcblxuXHRcdHRoaXMubWVudWJhciA9IGFwcGVuZCh0aGlzLmxlZnRDb250ZW50LCAkKCdkaXYubWVudWJhcicpKTtcblx0XHR0aGlzLm1lbnViYXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ21lbnViYXInKTtcblxuXHRcdHRoaXMuY3VzdG9tTWVudWJhckRpc3Bvc2FibGVzLmFkZChjdXN0b21NZW51YmFyLm9uVmlzaWJpbGl0eUNoYW5nZShlID0+IHRoaXMub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZWQoZSkpKTtcblxuXHRcdGN1c3RvbU1lbnViYXIuY3JlYXRlKHRoaXMubWVudWJhcik7XG5cdH1cblxuXHRwcml2YXRlIHVuaW5zdGFsbE1lbnViYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jdXN0b21NZW51YmFyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmN1c3RvbU1lbnViYXIuY2xlYXIoKTtcblxuXHRcdHRoaXMubWVudWJhcj8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5tZW51YmFyID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlZChmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZWQodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc1dlYiB8fCBpc1dpbmRvd3MgfHwgaXNMaW51eCkge1xuXHRcdFx0aWYgKHRoaXMubGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucy53aWR0aCwgdGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlLmZpcmUodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0dGhpcy53aW5kb3dUaXRsZS51cGRhdGVQcm9wZXJ0aWVzKHByb3BlcnRpZXMpO1xuXHR9XG5cblx0cmVnaXN0ZXJWYXJpYWJsZXModmFyaWFibGVzOiBJVGl0bGVWYXJpYWJsZVtdKTogdm9pZCB7XG5cdFx0dGhpcy53aW5kb3dUaXRsZS5yZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHRoaXMucm9vdENvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy50aXRsZWJhci1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLmxlZnRDb250ZW50ID0gYXBwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnLnRpdGxlYmFyLWxlZnQnKSk7XG5cdFx0dGhpcy5jZW50ZXJDb250ZW50ID0gYXBwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnLnRpdGxlYmFyLWNlbnRlcicpKTtcblx0XHR0aGlzLnJpZ2h0Q29udGVudCA9IGFwcGVuZCh0aGlzLnJvb3RDb250YWluZXIsICQoJy50aXRsZWJhci1yaWdodCcpKTtcblxuXHRcdC8vIEFwcCBJY29uIChXaW5kb3dzLCBMaW51eClcblx0XHRpZiAoKGlzV2luZG93cyB8fCBpc0xpbnV4KSAmJiAhaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSkge1xuXHRcdFx0dGhpcy5hcHBJY29uID0gcHJlcGVuZCh0aGlzLmxlZnRDb250ZW50LCAkKCdhLndpbmRvdy1hcHBpY29uJykpO1xuXHRcdH1cblxuXHRcdC8vIERyYWdnYWJsZSByZWdpb24gdGhhdCB3ZSBjYW4gbWFuaXB1bGF0ZSBmb3IgIzUyNTIyXG5cdFx0dGhpcy5kcmFnUmVnaW9uID0gcHJlcGVuZCh0aGlzLnJvb3RDb250YWluZXIsICQoJ2Rpdi50aXRsZWJhci1kcmFnLXJlZ2lvbicpKTtcblxuXHRcdC8vIE1lbnViYXI6IGluc3RhbGwgYSBjdXN0b20gbWVudSBiYXIgZGVwZW5kaW5nIG9uIGNvbmZpZ3VyYXRpb25cblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5pc0F1eGlsaWFyeSAmJlxuXHRcdFx0IWhhc05hdGl2ZU1lbnUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSAmJlxuXHRcdFx0KCFpc01hY2ludG9zaCB8fCBpc1dlYikgJiZcblx0XHRcdHRoaXMuY3VycmVudE1lbnViYXJWaXNpYmlsaXR5ICE9PSAnY29tcGFjdCdcblx0XHQpIHtcblx0XHRcdHRoaXMuaW5zdGFsbE1lbnViYXIoKTtcblx0XHR9XG5cblx0XHQvLyBUaXRsZVxuXHRcdHRoaXMudGl0bGUgPSBhcHBlbmQodGhpcy5jZW50ZXJDb250ZW50LCAkKCdkaXYud2luZG93LXRpdGxlJykpO1xuXHRcdHRoaXMuY3JlYXRlVGl0bGUoKTtcblxuXHRcdC8vIENlbnRlci1BZGphY2VudCBUb29sYmFyIChlLmcuLCB1cGRhdGUgaW5kaWNhdG9yKVxuXHRcdGlmIChoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHRjb25zdCBjZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50ID0gYXBwZW5kKHRoaXMucmlnaHRDb250ZW50LCAkKCdkaXYuY2VudGVyLWFkamFjZW50LXRvb2xiYXItY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5jZW50ZXJBZGphY2VudFRvb2xCYXJFbGVtZW50ID0gY2VudGVyQWRqYWNlbnRUb29sQmFyRWxlbWVudDtcblx0XHRcdGNvbnN0IGNlbnRlckFkamFjZW50VG9vbEJhciA9IHRoaXMuY2VudGVyQWRqYWNlbnRUb29sQmFyRGlzcG9zYWJsZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2VudGVyQWRqYWNlbnRUb29sQmFyRWxlbWVudCwgTWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsIHtcblx0XHRcdFx0Y29udGV4dE1lbnU6IE1lbnVJZC5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMuaG92ZXJEZWxlZ2F0ZVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBSZS1ldmFsdWF0ZSBmaXQgd2hlbiBpdGVtcyBjaGFuZ2UgKGUuZy4gdGhlIHVwZGF0ZSBpbmRpY2F0b3IgYXBwZWFycyksIHNlZSAjMzAzMjIyLlxuXHRcdFx0dGhpcy5jZW50ZXJBZGphY2VudFRvb2xCYXJEaXNwb3NhYmxlLmFkZChjZW50ZXJBZGphY2VudFRvb2xCYXIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4gdGhpcy51cGRhdGVDZW50ZXJBZGphY2VudFRvb2xCYXJPdmVyZmxvdygpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIFRvb2xiYXIgQWN0aW9uc1xuXHRcdGlmIChoYXNDdXN0b21UaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHR0aGlzLmFjdGlvblRvb2xCYXJFbGVtZW50ID0gYXBwZW5kKHRoaXMucmlnaHRDb250ZW50LCAkKCdkaXYuYWN0aW9uLXRvb2xiYXItY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb25Ub29sQmFyKCk7XG5cdFx0XHR0aGlzLmNyZWF0ZUFjdGlvblRvb2xCYXJNZW51cygpO1xuXHRcdH1cblxuXHRcdC8vIFdpbmRvdyBDb250cm9scyBDb250YWluZXJcblx0XHRpZiAoIWhhc05hdGl2ZVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkpIHtcblx0XHRcdGxldCBwcmltYXJ5V2luZG93Q29udHJvbHNMb2NhdGlvbiA9IGlzTWFjaW50b3NoID8gJ2xlZnQnIDogJ3JpZ2h0Jztcblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBpc05hdGl2ZSkge1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBsb2NhbGUgaXMgUlRMLCBtYWNPUyB3aWxsIG1vdmUgdHJhZmZpYyBsaWdodHMgaW4gUlRMIGxvY2FsZXNcblx0XHRcdFx0Ly8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvSW50bC9Mb2NhbGUvdGV4dEluZm9cblxuXHRcdFx0XHRjb25zdCBsb2NhbGVJbmZvID0gc2FmZUludGwuTG9jYWxlKHBsYXRmb3JtTG9jYWxlKS52YWx1ZTtcblx0XHRcdFx0Y29uc3QgdGV4dEluZm8gPSAobG9jYWxlSW5mbyBhcyB7IHRleHRJbmZvPzogdW5rbm93biB9KS50ZXh0SW5mbztcblx0XHRcdFx0aWYgKHRleHRJbmZvICYmIHR5cGVvZiB0ZXh0SW5mbyA9PT0gJ29iamVjdCcgJiYgJ2RpcmVjdGlvbicgaW4gdGV4dEluZm8gJiYgdGV4dEluZm8uZGlyZWN0aW9uID09PSAncnRsJykge1xuXHRcdFx0XHRcdHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID0gJ3JpZ2h0Jztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgaXNOYXRpdmUgJiYgcHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPT09ICdsZWZ0Jykge1xuXHRcdFx0XHQvLyBtYWNPUyBuYXRpdmU6IGNvbnRyb2xzIGFyZSBvbiB0aGUgbGVmdCBhbmQgdGhlIGNvbnRhaW5lciBpcyBub3QgbmVlZGVkIHRvIG1ha2Ugcm9vbVxuXHRcdFx0XHQvLyBmb3Igc29tZXRoaW5nLCBleGNlcHQgZm9yIHdlYiB3aGVyZSBhIGN1c3RvbSBtZW51IGJlaW5nIHN1cHBvcnRlZCkuIG5vdCBwdXR0aW5nIHRoZVxuXHRcdFx0XHQvLyBjb250YWluZXIgaGVscHMgd2l0aCBhbGxvd2luZyB0byBtb3ZlIHRoZSB3aW5kb3cgd2hlbiBjbGlja2luZyB2ZXJ5IGNsb3NlIHRvIHRoZVxuXHRcdFx0XHQvLyB3aW5kb3cgY29udHJvbCBidXR0b25zLlxuXHRcdFx0fSBlbHNlIGlmIChnZXRXaW5kb3dDb250cm9sc1N0eWxlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpID09PSBXaW5kb3dDb250cm9sc1N0eWxlLkhJRERFTikge1xuXHRcdFx0XHQvLyBMaW51eC9XaW5kb3dzOiBjb250cm9scyBhcmUgZXhwbGljaXRseSBkaXNhYmxlZFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53aW5kb3dDb250cm9sc0NvbnRhaW5lciA9IGFwcGVuZChwcmltYXJ5V2luZG93Q29udHJvbHNMb2NhdGlvbiA9PT0gJ2xlZnQnID8gdGhpcy5sZWZ0Q29udGVudCA6IHRoaXMucmlnaHRDb250ZW50LCAkKCdkaXYud2luZG93LWNvbnRyb2xzLWNvbnRhaW5lcicpKTtcblx0XHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdFx0Ly8gV2ViOiBpdHMgcG9zc2libGUgdG8gaGF2ZSBjb250cm9sIG92ZXJsYXlzIG9uIGJvdGggc2lkZXMsIGZvciBleGFtcGxlIG9uIG1hY09TXG5cdFx0XHRcdFx0Ly8gd2l0aCB3aW5kb3cgY29udHJvbHMgb24gdGhlIGxlZnQgYW5kIFBXQSBjb250cm9scyBvbiB0aGUgcmlnaHQuXG5cdFx0XHRcdFx0YXBwZW5kKHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID09PSAnbGVmdCcgPyB0aGlzLnJpZ2h0Q29udGVudCA6IHRoaXMubGVmdENvbnRlbnQsICQoJ2Rpdi53aW5kb3ctY29udHJvbHMtY29udGFpbmVyJykpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzV0NPRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy53aW5kb3dDb250cm9sc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd3Y28tZW5hYmxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGV4dCBtZW51IG92ZXIgdGl0bGUgYmFyOiBkZXBlbmRpbmcgb24gdGhlIE9TIGFuZCB0aGUgbG9jYXRpb24gb2YgdGhlIGNsaWNrIHRoaXMgd2lsbCBlaXRoZXIgYmVcblx0XHQvLyB0aGUgb3ZlcmFsbCBjb250ZXh0IG1lbnUgZm9yIHRoZSBlbnRpcmUgdGl0bGUgYmFyIG9yIGEgc3BlY2lmaWMgdGl0bGUgY29udGV4dCBtZW51LlxuXHRcdC8vIFdpbmRvd3MgLyBMaW51eDogd2Ugb25seSBzdXBwb3J0IHRoZSBvdmVyYWxsIGNvbnRleHQgbWVudSBvbiB0aGUgdGl0bGUgYmFyXG5cdFx0Ly8gbWFjT1M6IHdlIHN1cHBvcnQgYm90aCB0aGUgb3ZlcmFsbCBjb250ZXh0IG1lbnUgYW5kIHRoZSB0aXRsZSBjb250ZXh0IG1lbnUuXG5cdFx0Ly8gICAgICAgIGluIGFkZGl0aW9uLCB3ZSBhbGxvdyBDbWQrY2xpY2sgdG8gYnJpbmcgdXAgdGhlIHRpdGxlIGNvbnRleHQgbWVudS5cblx0XHR7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yb290Q29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0XHRsZXQgdGFyZ2V0TWVudTogTWVudUlkO1xuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgaXNIVE1MRWxlbWVudChlLnRhcmdldCkgJiYgaXNBbmNlc3RvcihlLnRhcmdldCwgdGhpcy50aXRsZSkpIHtcblx0XHRcdFx0XHR0YXJnZXRNZW51ID0gTWVudUlkLlRpdGxlQmFyVGl0bGVDb250ZXh0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRhcmdldE1lbnUgPSBNZW51SWQuVGl0bGVCYXJDb250ZXh0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5vbkNvbnRleHRNZW51KGUsIHRhcmdldE1lbnUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudGl0bGUsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tZXRhS2V5KSB7XG5cdFx0XHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUgLyogc3RvcCBidWJibGluZyB0byBwcmV2ZW50IGNvbW1hbmQgY2VudGVyIGZyb20gb3BlbmluZyAqLyk7XG5cblx0XHRcdFx0XHRcdHRoaXMub25Db250ZXh0TWVudShlLCBNZW51SWQuVGl0bGVCYXJUaXRsZUNvbnRleHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgdHJ1ZSAvKiBjYXB0dXJlIHBoYXNlIHRvIHByZXZlbnQgY29tbWFuZCBjZW50ZXIgZnJvbSBvcGVuaW5nICovKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdHRoaXMudGl0bGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgaXNTaG93aW5nVGl0bGVJbk5hdGl2ZVRpdGxlYmFyID0gaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKTtcblxuXHRcdC8vIFRleHQgVGl0bGVcblx0XHRpZiAoIXRoaXMuaXNDb21tYW5kQ2VudGVyVmlzaWJsZSkge1xuXHRcdFx0aWYgKCFpc1Nob3dpbmdUaXRsZUluTmF0aXZlVGl0bGViYXIpIHtcblx0XHRcdFx0dGhpcy50aXRsZS50ZXh0Q29udGVudCA9IHRoaXMud2luZG93VGl0bGUudmFsdWU7XG5cdFx0XHRcdHRoaXMudGl0bGVEaXNwb3NhYmxlcy5hZGQodGhpcy53aW5kb3dUaXRsZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy50aXRsZS50ZXh0Q29udGVudCA9IHRoaXMud2luZG93VGl0bGUudmFsdWU7XG5cdFx0XHRcdFx0aWYgKHRoaXMubGFzdExheW91dERpbWVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlTGF5b3V0KHRoaXMubGFzdExheW91dERpbWVuc2lvbnMpOyAvLyBsYXlvdXQgbWVudWJhciBhbmQgb3RoZXIgcmVuZGVyaW5ncyBpbiB0aGUgdGl0bGViYXJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc2V0KHRoaXMudGl0bGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1lbnUgVGl0bGVcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRDZW50ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRDZW50ZXJDb250cm9sLCB0aGlzLndpbmRvd1RpdGxlLCB0aGlzLmhvdmVyRGVsZWdhdGUpO1xuXHRcdFx0cmVzZXQodGhpcy50aXRsZSwgY29tbWFuZENlbnRlci5lbGVtZW50KTtcblx0XHRcdHRoaXMudGl0bGVEaXNwb3NhYmxlcy5hZGQoY29tbWFuZENlbnRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gLS0tIEN1c3RvbSB2aWV3IGl0ZW1zIHJlZ2lzdGVyZWQgdmlhIElBY3Rpb25WaWV3SXRlbVNlcnZpY2Vcblx0XHRmb3IgKGNvbnN0IG1lbnVJZCBvZiBbTWVudUlkLlRpdGxlQmFyLCBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnVdKSB7XG5cdFx0XHRjb25zdCBjdXN0b21WaWV3SXRlbSA9IHRoaXMuYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmxvb2tVcChtZW51SWQsIGFjdGlvbi5pZCk7XG5cdFx0XHRpZiAoY3VzdG9tVmlld0l0ZW0pIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gY3VzdG9tVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBnZXRXaW5kb3dJZCh0aGlzLmVsZW1lbnQgPyBnZXRXaW5kb3codGhpcy5lbGVtZW50KSA6IG1haW5XaW5kb3cpKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAtLS0gQWN0aXZpdHkgQWN0aW9uc1xuXHRcdGlmICghdGhpcy5pc0F1eGlsaWFyeSkge1xuXHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gR0xPQkFMX0FDVElWSVRZX0lEKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZUdsb2JhbEFjdGl2aXR5QWN0aW9uVmlld0l0ZW0sIHsgcG9zaXRpb246ICgpID0+IEhvdmVyUG9zaXRpb24uQkVMT1cgfSwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWN0aW9uLmlkID09PSBBQ0NPVU5UU19BQ1RJVklUWV9JRCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVBY2NvdW50QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSwgeyBwb3NpdGlvbjogKCkgPT4gSG92ZXJQb3NpdGlvbi5CRUxPVyB9LCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAtLS0gRWRpdG9yIEFjdGlvbnNcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXA/LmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgJiYgYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIEVkaXRvclBhbmUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0QWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGV4dGVuc2lvbnNcblx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0odGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIG1lbnVBc0NoaWxkOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5YmluZGluZyhhY3Rpb246IElBY3Rpb24pOiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVkaXRvclBhbmVBd2FyZUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXA/LmFjdGl2ZUVkaXRvclBhbmU/LnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID8/IHRoaXMuY29udGV4dEtleVNlcnZpY2U7XG5cblx0XHRyZXR1cm4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCwgZWRpdG9yUGFuZUF3YXJlQ29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBY3Rpb25Ub29sQmFyKCk6IHZvaWQge1xuXG5cdFx0Ly8gQ3JlYXRlcyB0aGUgYWN0aW9uIHRvb2wgYmFyLiBEZXBlbmRzIG9uIHRoZSBjb25maWd1cmF0aW9uIG9mIHRoZSB0aXRsZSBiYXIgbWVudXNcblx0XHQvLyBSZXF1aXJlcyB0byBiZSByZWNyZWF0ZWQgd2hlbmV2ZXIgZWRpdG9yIGFjdGlvbnMgZW5hYmxlbWVudCBjaGFuZ2VzXG5cblx0XHR0aGlzLmFjdGlvblRvb2xCYXJEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHR0aGlzLmFjdGlvblRvb2xCYXIgPSB0aGlzLmFjdGlvblRvb2xCYXJEaXNwb3NhYmxlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuYWN0aW9uVG9vbEJhckVsZW1lbnQsIHtcblx0XHRcdGNvbnRleHRNZW51OiBNZW51SWQuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnYXJpYUxhYmVsVGl0bGVBY3Rpb25zJywgXCJUaXRsZSBhY3Rpb25zXCIpLFxuXHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMuZ2V0S2V5YmluZGluZyhhY3Rpb24pLFxuXHRcdFx0b3ZlcmZsb3dCZWhhdmlvcjogeyBtYXhJdGVtczogMTIsIGV4ZW1wdGVkOiBbQUNDT1VOVFNfQUNUSVZJVFlfSUQsIEdMT0JBTF9BQ1RJVklUWV9JRCwgLi4uRURJVE9SX0NPUkVfTkFWSUdBVElPTl9DT01NQU5EU10gfSxcblx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRkcm9wZG93bk1lbnVDbGFzc05hbWU6IFdPUktCRU5DSF9NRU5VX01PVElPTl9DTEFTUyxcblx0XHRcdGRyb3Bkb3duTWVudUNsb3NlQW5pbWF0aW9uOiB3b3JrYmVuY2hNZW51Q2xvc2VBbmltYXRpb24sXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICd0aXRsZVBhcnQnLFxuXHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0aGlzLmlzQXV4aWxpYXJ5LCAvLyBPbmx5IHNob3cgdG9nZ2xlZCBzdGF0ZSBmb3IgYXV4aWxpYXJ5IHRpdGxlIGJhcnNcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5ob3ZlckRlbGVnYXRlXG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuZWRpdG9yQWN0aW9uc0VuYWJsZWQpIHtcblx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhckRpc3Bvc2FibGUuYWRkKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy5jcmVhdGVBY3Rpb25Ub29sQmFyTWVudXMoeyBlZGl0b3JBY3Rpb25zOiB0cnVlIH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBY3Rpb25Ub29sQmFyTWVudXModXBkYXRlOiB0cnVlIHwgeyBlZGl0b3JBY3Rpb25zPzogYm9vbGVhbjsgbGF5b3V0QWN0aW9ucz86IGJvb2xlYW47IGdsb2JhbEFjdGlvbnM/OiBib29sZWFuOyBhY3Rpdml0eUFjdGlvbnM/OiBib29sZWFuIH0gPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKHVwZGF0ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0dXBkYXRlID0geyBlZGl0b3JBY3Rpb25zOiB0cnVlLCBsYXlvdXRBY3Rpb25zOiB0cnVlLCBnbG9iYWxBY3Rpb25zOiB0cnVlLCBhY3Rpdml0eUFjdGlvbnM6IHRydWUgfTtcblx0XHR9XG5cblx0XHRjb25zdCB1cGRhdGVUb29sQmFyQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IElUb29sYmFyQWN0aW9ucyA9IHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblxuXHRcdFx0Ly8gLS0tIExlYWRpbmcgR2xvYmFsIEFjdGlvbnMgKHJlbmRlcmVkIGJlZm9yZSBsYXlvdXQgY29udHJvbHM7IG9wdC1pbiB2aWEgVGl0bGVCYXJMZWFkaW5nQWN0aW9uc0dyb3VwKS5cblx0XHRcdC8vIFVzZSBhIHNjcmF0Y2ggYnVja2V0IHNvIG5vbi1sZWFkaW5nIGFjdGlvbnMgZG9uJ3QgbGVhayBpbnRvIHRoZSBzaGFyZWQgYHNlY29uZGFyeWAgKG92ZXJmbG93KSBsaXN0IGhlcmU7XG5cdFx0XHQvLyB0aGV5IGFyZSBhZGRlZCBieSB0aGUgdHJhaWxpbmcgZ2xvYmFsLWFjdGlvbnMgcGFzcyBiZWxvdy5cblx0XHRcdGlmICh0aGlzLmdsb2JhbFRvb2xiYXJNZW51KSB7XG5cdFx0XHRcdGNvbnN0IGxlYWRpbmc6IElUb29sYmFyQWN0aW9ucyA9IHsgcHJpbWFyeTogW10sIHNlY29uZGFyeTogW10gfTtcblx0XHRcdFx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhcblx0XHRcdFx0XHR0aGlzLmdsb2JhbFRvb2xiYXJNZW51LmdldEFjdGlvbnMoKSxcblx0XHRcdFx0XHRsZWFkaW5nLFxuXHRcdFx0XHRcdGFjdGlvbkdyb3VwID0+IGFjdGlvbkdyb3VwID09PSBUaXRsZUJhckxlYWRpbmdBY3Rpb25zR3JvdXBcblx0XHRcdFx0KTtcblx0XHRcdFx0YWN0aW9ucy5wcmltYXJ5LnB1c2goLi4ubGVhZGluZy5wcmltYXJ5KTtcblx0XHRcdFx0YWN0aW9ucy5wcmltYXJ5LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIEVkaXRvciBBY3Rpb25zXG5cdFx0XHRpZiAodGhpcy5lZGl0b3JBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvckFjdGlvbnNDaGFuZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cDtcblx0XHRcdFx0aWYgKGFjdGl2ZUdyb3VwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yQWN0aW9ucyA9IGFjdGl2ZUdyb3VwLmNyZWF0ZUVkaXRvckFjdGlvbnModGhpcy5lZGl0b3JBY3Rpb25zQ2hhbmdlRGlzcG9zYWJsZSwgdGhpcy5pc0F1eGlsaWFyeSAmJiB0aGlzLmlzQ29tcGFjdCA/IE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGUgOiBNZW51SWQuRWRpdG9yVGl0bGUpO1xuXG5cdFx0XHRcdFx0YWN0aW9ucy5wcmltYXJ5LnB1c2goLi4uZWRpdG9yQWN0aW9ucy5hY3Rpb25zLnByaW1hcnkpO1xuXHRcdFx0XHRcdGFjdGlvbnMuc2Vjb25kYXJ5LnB1c2goLi4uZWRpdG9yQWN0aW9ucy5hY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wcmltYXJ5LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblxuXHRcdFx0XHRcdHRoaXMuZWRpdG9yQWN0aW9uc0NoYW5nZURpc3Bvc2FibGUuYWRkKGVkaXRvckFjdGlvbnMub25EaWRDaGFuZ2UoKCkgPT4gdXBkYXRlVG9vbEJhckFjdGlvbnMoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIC0tLSBMYXlvdXQgQWN0aW9uc1xuXHRcdFx0aWYgKHRoaXMubGF5b3V0VG9vbGJhck1lbnUpIHtcblx0XHRcdFx0ZmlsbEluQWN0aW9uQmFyQWN0aW9ucyhcblx0XHRcdFx0XHR0aGlzLmxheW91dFRvb2xiYXJNZW51LmdldEFjdGlvbnMoKSxcblx0XHRcdFx0XHRhY3Rpb25zLFxuXHRcdFx0XHRcdChncm91cCkgPT4gZ3JvdXAgPT09ICduYXZpZ2F0aW9uJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAtLS0gR2xvYmFsIEFjdGlvbnMgKGFmdGVyIGxheW91dCBzbyBlLmcuIG5vdGlmaWNhdGlvbiBiZWxsIGFwcGVhcnMgdG8gdGhlIHJpZ2h0IG9mIGxheW91dCBjb250cm9scykuXG5cdFx0XHQvLyBGaWx0ZXIgb3V0IHRoZSBsZWFkaW5nIGdyb3VwIHVwIGZyb250IHNvIGl0IGlzbid0IGR1cGxpY2F0ZWQgaW50byB0aGUgb3ZlcmZsb3cgYHNlY29uZGFyeWAgYnVja2V0LlxuXHRcdFx0aWYgKHRoaXMuZ2xvYmFsVG9vbGJhck1lbnUpIHtcblx0XHRcdFx0Y29uc3QgdHJhaWxpbmdHcm91cHMgPSB0aGlzLmdsb2JhbFRvb2xiYXJNZW51LmdldEFjdGlvbnMoKS5maWx0ZXIoKFtncm91cF0pID0+IGdyb3VwICE9PSBUaXRsZUJhckxlYWRpbmdBY3Rpb25zR3JvdXApO1xuXHRcdFx0XHRmaWxsSW5BY3Rpb25CYXJBY3Rpb25zKFxuXHRcdFx0XHRcdHRyYWlsaW5nR3JvdXBzLFxuXHRcdFx0XHRcdGFjdGlvbnNcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLS0tIEFjdGl2aXR5IEFjdGlvbnMgKGFsd2F5cyBhdCB0aGUgZW5kKVxuXHRcdFx0aWYgKHRoaXMuYWN0aXZpdHlBY3Rpb25zRW5hYmxlZCkge1xuXHRcdFx0XHRpZiAoaXNBY2NvdW50c0FjdGlvblZpc2libGUodGhpcy5zdG9yYWdlU2VydmljZSkpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaChBQ0NPVU5UU19BQ1RJVklUWV9USUxFX0FDVElPTik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhY3Rpb25zLnByaW1hcnkucHVzaChHTE9CQUxfQUNUSVZJVFlfVElUTEVfQUNUSU9OKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hY3Rpb25Ub29sQmFyLnNldEFjdGlvbnMocHJlcGFyZUFjdGlvbnMoYWN0aW9ucy5wcmltYXJ5KSwgcHJlcGFyZUFjdGlvbnMoYWN0aW9ucy5zZWNvbmRhcnkpKTtcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlL1VwZGF0ZSB0aGUgbWVudXMgd2hpY2ggc2hvdWxkIGJlIGluIHRoZSB0aXRsZSB0b29sIGJhclxuXG5cdFx0aWYgKHVwZGF0ZS5lZGl0b3JBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmVkaXRvclRvb2xiYXJNZW51RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0Ly8gVGhlIGVkaXRvciB0b29sYmFyIG1lbnUgaXMgaGFuZGxlZCBieSB0aGUgZWRpdG9yIGdyb3VwIHNvIHdlIGRvIG5vdCBuZWVkIHRvIG1hbmFnZSBpdCBoZXJlLlxuXHRcdFx0Ly8gSG93ZXZlciwgZGVwZW5kaW5nIG9uIHRoZSBhY3RpdmUgZWRpdG9yLCB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgY29udGV4dCBhbmQgYWN0aW9uIHJ1bm5lciBvZiB0aGUgdG9vbGJhciBtZW51LlxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yQWN0aW9uc0VuYWJsZWQgJiYgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXA/LmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0OiBJRWRpdG9yQ29tbWFuZHNDb250ZXh0ID0geyBncm91cElkOiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cC5pZCB9O1xuXG5cdFx0XHRcdHRoaXMuYWN0aW9uVG9vbEJhci5hY3Rpb25SdW5uZXIgPSB0aGlzLmVkaXRvclRvb2xiYXJNZW51RGlzcG9zYWJsZXMuYWRkKG5ldyBFZGl0b3JDb21tYW5kc0NvbnRleHRBY3Rpb25SdW5uZXIoY29udGV4dCkpO1xuXHRcdFx0XHR0aGlzLmFjdGlvblRvb2xCYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFjdGlvblRvb2xCYXIuYWN0aW9uUnVubmVyID0gdGhpcy5lZGl0b3JUb29sYmFyTWVudURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uUnVubmVyKCkpO1xuXHRcdFx0XHR0aGlzLmFjdGlvblRvb2xCYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodXBkYXRlLmxheW91dEFjdGlvbnMpIHtcblx0XHRcdHRoaXMubGF5b3V0VG9vbGJhck1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHRpZiAodGhpcy5sYXlvdXRDb250cm9sRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLmxheW91dFRvb2xiYXJNZW51ID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdFx0dGhpcy5sYXlvdXRUb29sYmFyTWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLmxheW91dFRvb2xiYXJNZW51KTtcblx0XHRcdFx0dGhpcy5sYXlvdXRUb29sYmFyTWVudURpc3Bvc2FibGVzLmFkZCh0aGlzLmxheW91dFRvb2xiYXJNZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZVRvb2xCYXJBY3Rpb25zKCkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0VG9vbGJhck1lbnUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZS5nbG9iYWxBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmdsb2JhbFRvb2xiYXJNZW51RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0aWYgKHRoaXMuZ2xvYmFsQWN0aW9uc0VuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5nbG9iYWxUb29sYmFyTWVudSA9IHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuVGl0bGVCYXIsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRoaXMuZ2xvYmFsVG9vbGJhck1lbnVEaXNwb3NhYmxlcy5hZGQodGhpcy5nbG9iYWxUb29sYmFyTWVudSk7XG5cdFx0XHRcdHRoaXMuZ2xvYmFsVG9vbGJhck1lbnVEaXNwb3NhYmxlcy5hZGQodGhpcy5nbG9iYWxUb29sYmFyTWVudS5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGVUb29sQmFyQWN0aW9ucygpKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmdsb2JhbFRvb2xiYXJNZW51ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh1cGRhdGUuYWN0aXZpdHlBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmFjdGl2aXR5VG9vbGJhckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRpZiAodGhpcy5hY3Rpdml0eUFjdGlvbnNFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZpdHlUb29sYmFyRGlzcG9zYWJsZXMuYWRkKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgQWNjb3VudHNBY3Rpdml0eUFjdGlvblZpZXdJdGVtLkFDQ09VTlRTX1ZJU0lCSUxJVFlfUFJFRkVSRU5DRV9LRVksIHRoaXMuX3N0b3JlKSgoKSA9PiB1cGRhdGVUb29sQmFyQWN0aW9ucygpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dXBkYXRlVG9vbEJhckFjdGlvbnMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdC8vIFBhcnQgY29udGFpbmVyXG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0aWYgKHRoaXMuaXNJbmFjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW5hY3RpdmUnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbmFjdGl2ZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aXRsZUJhY2tncm91bmQgPSBpc05hdGl2ZSAmJiBpc1dpbmRvd3MgJiYgdXNlV2luZG93Q29udHJvbHNPdmVybGF5KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSA9PT0gdHJ1ZVxuXHRcdFx0XHQ/IFdPUktCRU5DSF9CQUNLR1JPVU5EKHRoaXMudGhlbWUpLnRvU3RyaW5nKClcblx0XHRcdFx0OiB0aGlzLmdldENvbG9yKHRoaXMuaXNJbmFjdGl2ZSA/IFRJVExFX0JBUl9JTkFDVElWRV9CQUNLR1JPVU5EIDogVElUTEVfQkFSX0FDVElWRV9CQUNLR1JPVU5ELCAoY29sb3IsIHRoZW1lKSA9PiB7XG5cdFx0XHRcdFx0Ly8gTENEIFJlbmRlcmluZyBTdXBwb3J0OiB0aGUgdGl0bGUgYmFyIHBhcnQgaXMgYSBkZWZpbmluZyBpdHMgb3duIEdQVSBsYXllci5cblx0XHRcdFx0XHQvLyBUbyBiZW5lZml0IGZyb20gTENEIGZvbnQgcmVuZGVyaW5nLCB3ZSBtdXN0IGVuc3VyZSB0aGF0IHdlIGFsd2F5cyBzZXQgYW5cblx0XHRcdFx0XHQvLyBvcGFxdWUgYmFja2dyb3VuZCBjb2xvci4gQXMgc3VjaCwgd2UgY29tcHV0ZSBhbiBvcGFxdWUgY29sb3IgZ2l2ZW4gd2Uga25vd1xuXHRcdFx0XHRcdC8vIHRoZSBiYWNrZ3JvdW5kIGNvbG9yIGlzIHRoZSB3b3JrYmVuY2ggYmFja2dyb3VuZC5cblx0XHRcdFx0XHRyZXR1cm4gY29sb3IuaXNPcGFxdWUoKSA/IGNvbG9yIDogY29sb3IubWFrZU9wYXF1ZShXT1JLQkVOQ0hfQkFDS0dST1VORCh0aGVtZSkpO1xuXHRcdFx0XHR9KSB8fCAnJztcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aXRsZUJhY2tncm91bmQ7XG5cblx0XHRcdGlmICh0aGlzLmFwcEljb25CYWRnZSkge1xuXHRcdFx0XHR0aGlzLmFwcEljb25CYWRnZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aXRsZUJhY2tncm91bmQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aXRsZUJhY2tncm91bmQgJiYgQ29sb3IuZnJvbUhleCh0aXRsZUJhY2tncm91bmQpLmlzTGlnaHRlcigpKSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaWdodCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2xpZ2h0Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpdGxlRm9yZWdyb3VuZCA9IHRoaXMuZ2V0Q29sb3IodGhpcy5pc0luYWN0aXZlID8gVElUTEVfQkFSX0lOQUNUSVZFX0ZPUkVHUk9VTkQgOiBUSVRMRV9CQVJfQUNUSVZFX0ZPUkVHUk9VTkQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLmNvbG9yID0gdGl0bGVGb3JlZ3JvdW5kIHx8ICcnO1xuXG5cdFx0XHRjb25zdCB0aXRsZUJvcmRlciA9IHRoaXMuZ2V0Q29sb3IoVElUTEVfQkFSX0JPUkRFUik7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuYm9yZGVyQm90dG9tID0gdGl0bGVCb3JkZXIgPyBgMXB4IHNvbGlkICR7dGl0bGVCb3JkZXJ9YCA6ICcnO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvbkNvbnRleHRNZW51KGU6IE1vdXNlRXZlbnQsIG1lbnVJZDogTWVudUlkKTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLCBlKTtcblxuXHRcdC8vIFNob3cgaXRcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdG1lbnVJZCxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0ZG9tRm9yU2hhZG93Um9vdDogaXNNYWNpbnRvc2ggJiYgaXNOYXRpdmUgPyBldmVudC50YXJnZXQgOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgY3VycmVudE1lbnViYXJWaXNpYmlsaXR5KCk6IE1lbnVCYXJWaXNpYmlsaXR5IHtcblx0XHRpZiAodGhpcy5pc0F1eGlsaWFyeSkge1xuXHRcdFx0cmV0dXJuICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGxheW91dENvbnRyb2xFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkxBWU9VVF9BQ1RJT05TKSAhPT0gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGlzQ29tbWFuZENlbnRlclZpc2libGUoKSB7XG5cdFx0cmV0dXJuICF0aGlzLmlzQ29tcGFjdCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkNPTU1BTkRfQ0VOVEVSKSAhPT0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldCBlZGl0b3JBY3Rpb25zRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLnBhcnRPcHRpb25zLmVkaXRvckFjdGlvbnNMb2NhdGlvbiA9PT0gRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSIHx8XG5cdFx0XHQoXG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLnBhcnRPcHRpb25zLmVkaXRvckFjdGlvbnNMb2NhdGlvbiA9PT0gRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQgJiZcblx0XHRcdFx0dGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09IEVkaXRvclRhYnNNb2RlLk5PTkVcblx0XHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgYWN0aXZpdHlBY3Rpb25zRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3Rpdml0eUJhclBvc2l0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxBY3Rpdml0eUJhclBvc2l0aW9uPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXHRcdHJldHVybiAhdGhpcy5pc0NvbXBhY3QgJiYgIXRoaXMuaXNBdXhpbGlhcnkgJiYgKGFjdGl2aXR5QmFyUG9zaXRpb24gPT09IEFjdGl2aXR5QmFyUG9zaXRpb24uVE9QIHx8IGFjdGl2aXR5QmFyUG9zaXRpb24gPT09IEFjdGl2aXR5QmFyUG9zaXRpb24uQk9UVE9NKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGdsb2JhbEFjdGlvbnNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5pc0NvbXBhY3Q7XG5cdH1cblxuXHRnZXQgaGFzWm9vbWFibGVFbGVtZW50cygpOiBib29sZWFuIHtcblx0XHRjb25zdCBoYXNNZW51YmFyID0gISh0aGlzLmN1cnJlbnRNZW51YmFyVmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHwgdGhpcy5jdXJyZW50TWVudWJhclZpc2liaWxpdHkgPT09ICdjb21wYWN0JyB8fCAoIWlzV2ViICYmIGlzTWFjaW50b3NoKSk7XG5cdFx0Y29uc3QgaGFzQ29tbWFuZENlbnRlciA9IHRoaXMuaXNDb21tYW5kQ2VudGVyVmlzaWJsZTtcblx0XHRjb25zdCBoYXNUb29sQmFyQWN0aW9ucyA9IHRoaXMuZ2xvYmFsQWN0aW9uc0VuYWJsZWQgfHwgdGhpcy5sYXlvdXRDb250cm9sRW5hYmxlZCB8fCB0aGlzLmVkaXRvckFjdGlvbnNFbmFibGVkIHx8IHRoaXMuYWN0aXZpdHlBY3Rpb25zRW5hYmxlZDtcblx0XHRyZXR1cm4gaGFzTWVudWJhciB8fCBoYXNDb21tYW5kQ2VudGVyIHx8IGhhc1Rvb2xCYXJBY3Rpb25zO1xuXHR9XG5cblx0Z2V0IHByZXZlbnRab29tKCk6IGJvb2xlYW4ge1xuXHRcdC8vIFByZXZlbnQgem9vbWluZyBiZWhhdmlvciBpZiBhbnkgb2YgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cdFx0Ly8gMS4gU2hyaW5raW5nIGJlbG93IHRoZSB3aW5kb3cgY29udHJvbCBzaXplICh6b29tIDwgMSlcblx0XHQvLyAyLiBObyBjdXN0b20gaXRlbXMgYXJlIHByZXNlbnQgaW4gdGhlIHRpdGxlIGJhclxuXG5cdFx0cmV0dXJuIGdldFpvb21GYWN0b3IoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpIDwgMSB8fCAhdGhpcy5oYXNab29tYWJsZUVsZW1lbnRzO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVMYXlvdXQobmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KSk7XG5cblx0XHRzdXBlci5sYXlvdXRDb250ZW50cyh3aWR0aCwgaGVpZ2h0KTtcblxuXHRcdC8vIFJ1biBhZnRlciBgbGF5b3V0Q29udGVudHNgIHNvIHRoZSB0aXRsZSBiYXIgcmVmbGVjdHMgaXRzIG5ldyB3aWR0aCB3aGVuIG1lYXN1cmluZyBvdmVyZmxvdy5cblx0XHR0aGlzLnVwZGF0ZUNlbnRlckFkamFjZW50VG9vbEJhck92ZXJmbG93KCk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgdGhlIG9wdGlvbmFsIGNlbnRlci1hZGphY2VudCB0b29sYmFyIChlLmcuIHRoZSB1cGRhdGUgaW5kaWNhdG9yKSB3aGVuIHNob3dpbmcgaXQgd291bGQgcHVzaCB0aGUgdGl0bGUgYmFyXG5cdCAqIGNvbnRlbnRcdTIwMTRtb3N0IG5vdGFibHkgdGhlIHRyYWlsaW5nIHdpbmRvdyBjb250cm9sc1x1MjAxNG9mZi1zY3JlZW4gYXMgdGhlIHdpbmRvdyBpcyBjb2xsYXBzZWQgaG9yaXpvbnRhbGx5ICgjMzAzMjIyKS5cblx0ICogT3ZlcmZsb3cgaXMgbWVhc3VyZWQgYWdhaW5zdCBhY3R1YWwgcmVuZGVyZWQgd2lkdGhzIHNvIHRoZSB0b29sYmFyIHN0YXlzIHZpc2libGUgd2hlbmV2ZXIgaXQgZml0cy5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlQ2VudGVyQWRqYWNlbnRUb29sQmFyT3ZlcmZsb3coKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuY2VudGVyQWRqYWNlbnRUb29sQmFyRWxlbWVudDtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTa2lwIG1lYXN1cmluZyAoYW5kIGl0cyBmb3JjZWQgcmVmbG93KSB3aGVuIHRoZSB0b29sYmFyIGlzIGVtcHR5LCB3aGljaCBpcyB0aGUgY29tbW9uIGNhc2UuXG5cdFx0aWYgKGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoYXMtbm8tYWN0aW9ucycpKSB7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ292ZXJmbG93aW5nJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTWVhc3VyZSBmcm9tIHRoZSB2aXNpYmxlIHN0YXRlLCB0aGVuIGhpZGUgYWdhaW4gaWYgdGhlIHRpdGxlIGJhciBjb250ZW50IG92ZXJmbG93cyBpdHMgd2lkdGguXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdvdmVyZmxvd2luZycpO1xuXHRcdGNvbnN0IG92ZXJmbG93cyA9IHRoaXMucm9vdENvbnRhaW5lci5zY3JvbGxXaWR0aCA+IHRoaXMucm9vdENvbnRhaW5lci5jbGllbnRXaWR0aDtcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ292ZXJmbG93aW5nJywgb3ZlcmZsb3dzKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0TGF5b3V0RGltZW5zaW9ucyA9IGRpbWVuc2lvbjtcblxuXHRcdGlmICghaGFzQ3VzdG9tVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy50aXRsZUJhclN0eWxlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHpvb21GYWN0b3IgPSBnZXRab29tRmFjdG9yKGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKTtcblxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS16b29tLWZhY3RvcicsIHpvb21GYWN0b3IudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5yb290Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvdW50ZXItem9vbScsIHRoaXMucHJldmVudFpvb20pO1xuXG5cdFx0aWYgKHRoaXMuY3VzdG9tTWVudWJhci52YWx1ZSkge1xuXHRcdFx0Y29uc3QgbWVudWJhckRpbWVuc2lvbiA9IG5ldyBEaW1lbnNpb24oMCwgZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0XHR0aGlzLmN1c3RvbU1lbnViYXIudmFsdWUubGF5b3V0KG1lbnViYXJEaW1lbnNpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0NlbnRlciA9IHRoaXMuaXNDb21tYW5kQ2VudGVyVmlzaWJsZSB8fCB0aGlzLnRpdGxlLnRleHRDb250ZW50ICE9PSAnJztcblx0XHR0aGlzLnJvb3RDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWNlbnRlcicsIGhhc0NlbnRlcik7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXN0b21NZW51YmFyLnZhbHVlKSB7XG5cdFx0XHR0aGlzLmN1c3RvbU1lbnViYXIudmFsdWUudG9nZ2xlRm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHQodGhpcy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1t0YWJpbmRleF06bm90KFt0YWJpbmRleD1cIi0xXCJdKScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbCk/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLlRJVExFQkFSX1BBUlRcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFpbkJyb3dzZXJUaXRsZWJhclBhcnQgZXh0ZW5kcyBCcm93c2VyVGl0bGViYXJQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoUGFydHMuVElUTEVCQVJfUEFSVCwgbWFpbldpbmRvdywgZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0LCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgaG9zdFNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIG1lbnVTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlUaXRsZWJhclBhcnQgZXh0ZW5kcyBJVGl0bGViYXJQYXJ0LCBJVmlldyB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0pOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQXV4aWxpYXJ5QnJvd3NlclRpdGxlYmFyUGFydCBleHRlbmRzIEJyb3dzZXJUaXRsZWJhclBhcnQgaW1wbGVtZW50cyBJQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBDT1VOVEVSID0gMTtcblxuXHRnZXQgaGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5taW5pbXVtSGVpZ2h0OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluVGl0bGViYXI6IEJyb3dzZXJUaXRsZWJhclBhcnQsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGlkID0gQXV4aWxpYXJ5QnJvd3NlclRpdGxlYmFyUGFydC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoYHdvcmtiZW5jaC5wYXJ0cy5hdXhpbGlhcnlUaXRsZS4ke2lkfWAsIGdldFdpbmRvdyhjb250YWluZXIpLCBlZGl0b3JHcm91cHNDb250YWluZXIsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBob3N0U2VydmljZSwgZWRpdG9yU2VydmljZSwgbWVudVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBhY3Rpb25WaWV3SXRlbVNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHByZXZlbnRab29tKCk6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gUHJldmVudCB6b29taW5nIGJlaGF2aW9yIGlmIGFueSBvZiB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblx0XHQvLyAxLiBTaHJpbmtpbmcgYmVsb3cgdGhlIHdpbmRvdyBjb250cm9sIHNpemUgKHpvb20gPCAxKVxuXHRcdC8vIDIuIE5vIGN1c3RvbSBpdGVtcyBhcmUgcHJlc2VudCBpbiB0aGUgbWFpbiB0aXRsZSBiYXJcblx0XHQvLyBUaGUgYXV4aWxpYXJ5IHRpdGxlIGJhciBuZXZlciBjb250YWlucyBhbnkgem9vbWFibGUgaXRlbXMgaXRzZWxmLFxuXHRcdC8vIGJ1dCB3ZSB3YW50IHRvIG1hdGNoIHRoZSBiZWhhdmlvciBvZiB0aGUgbWFpbiB0aXRsZSBiYXIuXG5cblx0XHRyZXR1cm4gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgPCAxIHx8ICF0aGlzLm1haW5UaXRsZWJhci5oYXNab29tYWJsZUVsZW1lbnRzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCLFlBQVk7QUFFdkMsU0FBUyx3QkFBd0IsZUFBZSxvQkFBb0I7QUFDcEUsU0FBNEIsa0JBQWtCLHNCQUFzQixtQkFBbUIsbUJBQW1CLGdDQUFnQyx3QkFBd0IsMEJBQTBCLHFCQUFvQyxjQUFjLHFCQUFxQjtBQUNuUSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUF3RDtBQUNqRSxTQUFTLGlCQUE4Qix5QkFBeUI7QUFDaEUsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkIsNkJBQTZCLCtCQUErQiwrQkFBK0Isa0JBQWtCLDRCQUE0QjtBQUMvSyxTQUFTLGFBQWEsV0FBVyxTQUFTLE9BQU8sVUFBVSxzQkFBc0I7QUFDakYsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVyxhQUFhLFdBQVcsUUFBUSxHQUFHLHVCQUF1QixTQUFTLE9BQU8sV0FBVyxhQUFhLFlBQVksbUJBQW1CLHFCQUFxQjtBQUMxSyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxPQUFPLHlCQUF5QixxQkFBcUIsZ0JBQWdCLHVCQUF1QixzQkFBc0I7QUFDM0gsU0FBUyxzQkFBc0IsOEJBQThCO0FBQzdELFNBQVMsU0FBZ0IsY0FBYyxRQUFRLHVCQUF1QjtBQUN0RSxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFB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
