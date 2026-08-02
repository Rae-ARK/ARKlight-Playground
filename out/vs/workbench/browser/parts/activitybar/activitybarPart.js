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
import "./media/activitybarpart.css";
import "./media/activityaction.css";
import { localize, localize2 } from "../../../../nls.js";
import { ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Part } from "../../part.js";
import { ActivityBarPosition, IWorkbenchLayoutService, LayoutSettings, Parts, Position, FLOATING_PANEL_MARGIN } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ToggleSidebarPositionAction, ToggleSidebarVisibilityAction } from "../../actions/layoutActions.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ACTIVITY_BAR_BACKGROUND, ACTIVITY_BAR_BORDER, ACTIVITY_BAR_FOREGROUND, ACTIVITY_BAR_ACTIVE_BORDER, ACTIVITY_BAR_BADGE_BACKGROUND, ACTIVITY_BAR_BADGE_FOREGROUND, ACTIVITY_BAR_INACTIVE_FOREGROUND, ACTIVITY_BAR_ACTIVE_BACKGROUND, ACTIVITY_BAR_DRAG_AND_DROP_BORDER, ACTIVITY_BAR_ACTIVE_FOCUS_BORDER } from "../../../common/theme.js";
import { activeContrastBorder, contrastBorder, focusBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { addDisposableListener, append, EventType, isAncestor, $, clearNode } from "../../../../base/browser/dom.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { CustomMenubarControl } from "../titlebar/menubarControl.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { getMenuBarVisibility, MenuSettings } from "../../../../platform/window/common/window.js";
import { Separator, SubmenuAction, toAction } from "../../../../base/common/actions.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { PaneCompositeBar } from "../paneCompositeBar.js";
import { GlobalCompositeBar } from "../globalCompositeBar.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from "../../../common/views.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { SwitchCompositeViewAction } from "../compositeBarActions.js";
let ActivitybarPart = class extends Part {
  constructor(location, paneCompositePart, instantiationService, layoutService, themeService, storageService, configurationService) {
    super(Parts.ACTIVITYBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
    this.location = location;
    this.paneCompositePart = paneCompositePart;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.minimumHeight = 0;
    this.maximumHeight = Number.POSITIVE_INFINITY;
    this.compositeBar = this._register(new MutableDisposable());
    this._isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_COMPACT)) {
        this._isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
        this.updateCompactStyle();
        this.recreateCompositeBar();
        this._onDidChange.fire(void 0);
      }
      if (e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this.updateCompactStyle();
        this.recreateCompositeBar();
        this._onDidChange.fire(void 0);
      }
    }));
  }
  //#region IView
  get minimumWidth() {
    return this.baseWidth + this.floatingGutter;
  }
  get maximumWidth() {
    return this.baseWidth + this.floatingGutter;
  }
  //#endregion
  /** The intrinsic activity bar width (excludes any floating gutter). */
  get baseWidth() {
    if (this.layoutService.isFloatingPanelsEnabled()) {
      return this._isCompact ? ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH;
    }
    return this._isCompact ? ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart.ACTIVITYBAR_WIDTH;
  }
  /** The action (item) height that drives visible item sizing and the composite bar overflow size. */
  get actionHeight() {
    if (this._isCompact) {
      return ActivitybarPart.COMPACT_ACTION_HEIGHT;
    }
    return this.layoutService.isFloatingPanelsEnabled() ? ActivitybarPart.FLOATING_ACTION_HEIGHT : ActivitybarPart.ACTION_HEIGHT;
  }
  /** Extra space reserved around the part when the floating panels experiment is enabled. */
  get floatingGutter() {
    return this.layoutService.isFloatingPanelsEnabled() ? ActivitybarPart.FLOATING_MARGIN : 0;
  }
  updateCompactStyle() {
    if (this.element) {
      this.element.classList.toggle("compact", this._isCompact);
      this.layoutService.mainContainer.classList.toggle("activitybar-compact", this._isCompact);
      this.element.style.setProperty("--activity-bar-width", `${this.baseWidth}px`);
      this.element.style.setProperty("--activity-bar-action-height", `${this.actionHeight}px`);
      this.element.style.setProperty("--activity-bar-icon-size", `${this._isCompact ? ActivitybarPart.COMPACT_ICON_SIZE : ActivitybarPart.ICON_SIZE}px`);
    }
  }
  recreateCompositeBar() {
    if (!this.content || !this.compositeBar.value) {
      return;
    }
    this.compositeBar.clear();
    clearNode(this.content);
    this.compositeBar.value = this.createCompositeBar();
    this.compositeBar.value.create(this.content);
    if (this.dimension) {
      this.layout(this.dimension.width, this.dimension.height);
    }
  }
  createCompositeBar() {
    const actionHeight = this.actionHeight;
    const iconSize = this._isCompact ? ActivitybarPart.COMPACT_ICON_SIZE : ActivitybarPart.ICON_SIZE;
    return this.instantiationService.createInstance(ActivityBarCompositeBar, this.location, {
      partContainerClass: "activitybar",
      pinnedViewContainersKey: ActivitybarPart.pinnedViewContainersKey,
      placeholderViewContainersKey: ActivitybarPart.placeholderViewContainersKey,
      viewContainersWorkspaceStateKey: ActivitybarPart.viewContainersWorkspaceStateKey,
      orientation: ActionsOrientation.VERTICAL,
      icon: true,
      iconSize,
      activityHoverOptions: {
        position: () => this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT
      },
      preventLoopNavigation: true,
      recomputeSizes: false,
      fillExtraContextMenuActions: (actions, e) => {
      },
      compositeSize: 52,
      colors: (theme) => ({
        activeForegroundColor: theme.getColor(ACTIVITY_BAR_FOREGROUND),
        inactiveForegroundColor: theme.getColor(ACTIVITY_BAR_INACTIVE_FOREGROUND),
        activeBorderColor: theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER),
        activeBackground: theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND),
        badgeBackground: theme.getColor(ACTIVITY_BAR_BADGE_BACKGROUND),
        badgeForeground: theme.getColor(ACTIVITY_BAR_BADGE_FOREGROUND),
        dragAndDropBorder: theme.getColor(ACTIVITY_BAR_DRAG_AND_DROP_BORDER),
        activeBackgroundColor: void 0,
        inactiveBackgroundColor: void 0,
        activeBorderBottomColor: void 0
      }),
      overflowActionSize: actionHeight
    }, Parts.ACTIVITYBAR_PART, this.paneCompositePart, true);
  }
  createContentArea(parent) {
    this.element = parent;
    this.content = append(this.element, $(".content"));
    this.updateCompactStyle();
    if (this.layoutService.isVisible(Parts.ACTIVITYBAR_PART)) {
      this.show();
    }
    return this.content;
  }
  getPinnedPaneCompositeIds() {
    return this.compositeBar.value?.getPinnedPaneCompositeIds() ?? [];
  }
  getVisiblePaneCompositeIds() {
    return this.compositeBar.value?.getVisiblePaneCompositeIds() ?? [];
  }
  getPaneCompositeIds() {
    return this.compositeBar.value?.getPaneCompositeIds() ?? [];
  }
  focus() {
    this.compositeBar.value?.focus();
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const background = this.getColor(ACTIVITY_BAR_BACKGROUND) || "";
    container.style.backgroundColor = background;
    const borderColor = this.getColor(ACTIVITY_BAR_BORDER) || this.getColor(contrastBorder) || "";
    container.classList.toggle("bordered", !!borderColor);
    container.style.borderColor = borderColor ? borderColor : "";
  }
  show(focus) {
    if (!this.content) {
      return;
    }
    if (!this.compositeBar.value) {
      this.compositeBar.value = this.createCompositeBar();
      this.compositeBar.value.create(this.content);
      if (this.dimension) {
        this.layout(this.dimension.width, this.dimension.height);
      }
    }
    if (focus) {
      this.focus();
    }
  }
  hide() {
    if (!this.compositeBar.value) {
      return;
    }
    this.compositeBar.clear();
    if (this.content) {
      clearNode(this.content);
    }
  }
  layout(width, height) {
    super.layout(width, height, 0, 0);
    if (!this.compositeBar.value) {
      return;
    }
    const gutter = this.floatingGutter;
    const contentWidth = Math.max(0, width - gutter);
    const contentHeight = Math.max(0, height - gutter);
    const contentAreaSize = super.layoutContents(contentWidth, contentHeight).contentSize;
    this.compositeBar.value.layout(contentWidth, contentAreaSize.height);
  }
  toJSON() {
    return {
      type: Parts.ACTIVITYBAR_PART
    };
  }
};
ActivitybarPart.ACTION_HEIGHT = 48;
ActivitybarPart.COMPACT_ACTION_HEIGHT = 28;
ActivitybarPart.ACTIVITYBAR_WIDTH = 48;
ActivitybarPart.COMPACT_ACTIVITYBAR_WIDTH = 36;
/** Narrower dimensions used when the floating panels (Modern UI) experiment is enabled. */
ActivitybarPart.FLOATING_ACTION_HEIGHT = 36;
ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH = 36;
ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH = 28;
ActivitybarPart.ICON_SIZE = 24;
ActivitybarPart.COMPACT_ICON_SIZE = 16;
/**
 * Gutter reserved on the left and bottom edges under the floating panels
 * experiment so the activity bar aligns with the floating cards (it stays
 * flush with the title bar, so no top gutter). Must match the margins applied
 * in `part.css` under `.floating-panels`.
 */
ActivitybarPart.FLOATING_MARGIN = FLOATING_PANEL_MARGIN;
ActivitybarPart.pinnedViewContainersKey = "workbench.activity.pinnedViewlets2";
ActivitybarPart.placeholderViewContainersKey = "workbench.activity.placeholderViewlets";
ActivitybarPart.viewContainersWorkspaceStateKey = "workbench.activity.viewletsWorkspaceState";
ActivitybarPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService)
], ActivitybarPart);
let ActivityBarCompositeBar = class extends PaneCompositeBar {
  constructor(location, options, part, paneCompositePart, showGlobalActivities, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, configurationService, menuService, layoutService) {
    super(
      location,
      {
        ...options,
        fillExtraContextMenuActions: (actions, e) => {
          options.fillExtraContextMenuActions(actions, e);
          this.fillContextMenuActions(actions, e);
        }
      },
      part,
      paneCompositePart,
      instantiationService,
      storageService,
      extensionService,
      viewDescriptorService,
      viewService,
      contextKeyService,
      environmentService,
      layoutService
    );
    this.configurationService = configurationService;
    this.menuService = menuService;
    this.menuBar = this._register(new MutableDisposable());
    this.keyboardNavigationDisposables = this._register(new DisposableStore());
    if (showGlobalActivities) {
      this.globalCompositeBar = this._register(instantiationService.createInstance(GlobalCompositeBar, () => this.getContextMenuActions(), (theme) => this.options.colors(theme), this.options.activityHoverOptions));
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
        if (getMenuBarVisibility(this.configurationService) === "compact") {
          this.installMenubar();
        } else {
          this.uninstallMenubar();
        }
      }
    }));
  }
  fillContextMenuActions(actions, e) {
    const menuBarVisibility = getMenuBarVisibility(this.configurationService);
    if (menuBarVisibility === "compact" || menuBarVisibility === "hidden" || menuBarVisibility === "toggle") {
      actions.unshift(...[toAction({ id: "toggleMenuVisibility", label: localize("menu", "Menu"), checked: menuBarVisibility === "compact", run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, menuBarVisibility === "compact" ? "toggle" : "compact") }), new Separator()]);
    }
    if (menuBarVisibility === "compact" && this.menuBarContainer && e?.target) {
      if (isAncestor(e.target, this.menuBarContainer)) {
        actions.unshift(...[toAction({ id: "hideCompactMenu", label: localize("hideMenu", "Hide Menu"), run: () => this.configurationService.updateValue(MenuSettings.MenuBarVisibility, "toggle") }), new Separator()]);
      }
    }
    if (this.globalCompositeBar) {
      actions.push(new Separator());
      actions.push(...this.globalCompositeBar.getContextMenuActions());
    }
    actions.push(new Separator());
    actions.push(...this.getActivityBarContextMenuActions());
  }
  uninstallMenubar() {
    if (this.menuBar.value) {
      this.menuBar.value = void 0;
    }
    if (this.menuBarContainer) {
      this.menuBarContainer.remove();
      this.menuBarContainer = void 0;
    }
  }
  installMenubar() {
    if (this.menuBar.value) {
      return;
    }
    this.menuBarContainer = $(".menubar");
    const content = assertReturnsDefined(this.element);
    content.prepend(this.menuBarContainer);
    this.menuBar.value = this.instantiationService.createInstance(CustomMenubarControl);
    this.menuBar.value.create(this.menuBarContainer);
  }
  registerKeyboardNavigationListeners() {
    this.keyboardNavigationDisposables.clear();
    if (this.menuBarContainer) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.menuBarContainer, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
          this.focus();
        }
      }));
    }
    if (this.compositeBarContainer) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.compositeBarContainer, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.DownArrow) || kbEvent.equals(KeyCode.RightArrow)) {
          this.globalCompositeBar?.focus();
        } else if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
          this.menuBar.value?.toggleFocus();
        }
      }));
    }
    if (this.globalCompositeBar) {
      this.keyboardNavigationDisposables.add(addDisposableListener(this.globalCompositeBar.element, EventType.KEY_DOWN, (e) => {
        const kbEvent = new StandardKeyboardEvent(e);
        if (kbEvent.equals(KeyCode.UpArrow) || kbEvent.equals(KeyCode.LeftArrow)) {
          this.focus(this.getVisiblePaneCompositeIds().length - 1);
        }
      }));
    }
  }
  create(parent) {
    this.element = parent;
    if (getMenuBarVisibility(this.configurationService) === "compact") {
      this.installMenubar();
    }
    this.compositeBarContainer = super.create(this.element);
    if (this.globalCompositeBar) {
      this.globalCompositeBar.create(this.element);
    }
    this.registerKeyboardNavigationListeners();
    return this.compositeBarContainer;
  }
  layout(width, height) {
    if (this.menuBarContainer) {
      if (this.options.orientation === ActionsOrientation.VERTICAL) {
        height -= this.menuBarContainer.clientHeight;
      } else {
        width -= this.menuBarContainer.clientWidth;
      }
    }
    if (this.globalCompositeBar) {
      if (this.options.orientation === ActionsOrientation.VERTICAL) {
        height -= this.globalCompositeBar.size() * this.options.overflowActionSize;
      } else {
        width -= this.globalCompositeBar.element.clientWidth;
      }
    }
    super.layout(width, height);
  }
  getActivityBarContextMenuActions() {
    const activityBarPositionMenu = this.menuService.getMenuActions(MenuId.ActivityBarPositionMenu, this.contextKeyService, { shouldForwardArgs: true, renderShortTitle: true });
    const positionActions = getContextMenuActions(activityBarPositionMenu).secondary;
    const actions = [
      new SubmenuAction("workbench.action.activityBar.position", localize("activity bar position", "Activity Bar Position"), positionActions)
    ];
    const activityBarPosition = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION);
    if (activityBarPosition === ActivityBarPosition.DEFAULT) {
      const isCompact = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_COMPACT) ?? false;
      const sizeActions = [
        toAction({ id: "workbench.action.activityBar.size.default", label: localize("activityBarSizeDefault", "Default"), checked: !isCompact, run: () => this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_COMPACT, false) }),
        toAction({ id: "workbench.action.activityBar.size.compact", label: localize("activityBarSizeCompact", "Compact"), checked: isCompact, run: () => this.configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_COMPACT, true) })
      ];
      actions.push(new SubmenuAction("workbench.action.activityBar.size", localize("activity bar size", "Activity Bar Size"), sizeActions));
    }
    actions.push(toAction({ id: ToggleSidebarPositionAction.ID, label: ToggleSidebarPositionAction.getLabel(this.layoutService), run: () => this.instantiationService.invokeFunction((accessor) => new ToggleSidebarPositionAction().run(accessor)) }));
    if (this.part === Parts.SIDEBAR_PART) {
      actions.push(toAction({ id: ToggleSidebarVisibilityAction.ID, label: ToggleSidebarVisibilityAction.LABEL, run: () => this.instantiationService.invokeFunction((accessor) => new ToggleSidebarVisibilityAction().run(accessor)) }));
    }
    return actions;
  }
};
ActivityBarCompositeBar = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IViewDescriptorService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IMenuService),
  __decorateParam(14, IWorkbenchLayoutService)
], ActivityBarCompositeBar);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.default",
      title: {
        ...localize2("positionActivityBarDefault", "Move Activity Bar to Side"),
        mnemonicTitle: localize({ key: "miDefaultActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Default")
      },
      shortTitle: localize("default", "Default"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 1
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.DEFAULT), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.DEFAULT);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.top",
      title: {
        ...localize2("positionActivityBarTop", "Move Activity Bar to Top"),
        mnemonicTitle: localize({ key: "miTopActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Top")
      },
      shortTitle: localize("top", "Top"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 2
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.TOP), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.TOP);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.bottom",
      title: {
        ...localize2("positionActivityBarBottom", "Move Activity Bar to Bottom"),
        mnemonicTitle: localize({ key: "miBottomActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Bottom")
      },
      shortTitle: localize("bottom", "Bottom"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 3
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.BOTTOM), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.BOTTOM);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.activityBarLocation.hide",
      title: {
        ...localize2("hideActivityBar", "Hide Activity Bar"),
        mnemonicTitle: localize({ key: "miHideActivityBar", comment: ["&& denotes a mnemonic"] }, "&&Hidden")
      },
      shortTitle: localize("hide", "Hidden"),
      category: Categories.View,
      toggled: ContextKeyExpr.equals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN),
      menu: [{
        id: MenuId.ActivityBarPositionMenu,
        order: 4
      }, {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ContextKeyExpr.notEquals(`config.${LayoutSettings.ACTIVITY_BAR_LOCATION}`, ActivityBarPosition.HIDDEN), IsSessionsWindowContext.negate())
      }]
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    configurationService.updateValue(LayoutSettings.ACTIVITY_BAR_LOCATION, ActivityBarPosition.HIDDEN);
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.ActivityBarPositionMenu,
  title: localize("positionActivituBar", "Activity Bar Position"),
  group: "3_workbench_layout_move",
  order: 2,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.ViewContainerTitleContext, {
  submenu: MenuId.ActivityBarPositionMenu,
  title: localize("positionActivituBar", "Activity Bar Position"),
  when: ContextKeyExpr.or(
    ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar)),
    ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))
  ),
  group: "3_workbench_layout_move",
  order: 1
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.previousSideBarView",
      title: localize2("previousSideBarView", "Previous Primary Side Bar View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Sidebar, -1);
  }
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.nextSideBarView",
      title: localize2("nextSideBarView", "Next Primary Side Bar View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Sidebar, 1);
  }
});
registerAction2(
  class FocusActivityBarAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.focusActivityBar",
        title: localize2("focusActivityBar", "Focus Activity Bar"),
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.focusPart(Parts.ACTIVITYBAR_PART);
    }
  }
);
registerThemingParticipant((theme, collector) => {
  const activityBarActiveBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BORDER);
  if (activityBarActiveBorderColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator:before {
				border-left-color: ${activityBarActiveBorderColor};
			}
		`);
  }
  const activityBarActiveFocusBorderColor = theme.getColor(ACTIVITY_BAR_ACTIVE_FOCUS_BORDER);
  if (activityBarActiveFocusBorderColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus::before {
				visibility: hidden;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:focus .active-item-indicator:before {
				visibility: visible;
				border-left-color: ${activityBarActiveFocusBorderColor};
			}
		`);
  }
  const activityBarActiveBackgroundColor = theme.getColor(ACTIVITY_BAR_ACTIVE_BACKGROUND);
  if (activityBarActiveBackgroundColor) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .active-item-indicator {
				z-index: 0;
				background-color: ${activityBarActiveBackgroundColor};
			}
		`);
  }
  const outline = theme.getColor(activeContrastBorder);
  if (outline) {
    collector.addRule(`
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item .action-label::before{
				padding: 6px;
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.active:hover .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked .action-label::before,
			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item.checked:hover .action-label::before {
				outline: 1px solid ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:hover .action-label::before {
				outline: 1px dashed ${outline};
			}

			.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator:before {
				border-left-color: ${outline};
			}
		`);
  } else {
    const focusBorderColor = theme.getColor(focusBorder);
    if (focusBorderColor) {
      collector.addRule(`
				.monaco-workbench .activitybar > .content :not(.monaco-menu) > .monaco-action-bar .action-item:focus .active-item-indicator::before {
						border-left-color: ${focusBorderColor};
					}
				`);
    }
  }
});
export {
  ActivityBarCompositeBar,
  ActivitybarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2FjdGl2aXR5YmFyL2FjdGl2aXR5YmFyUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hY3Rpdml0eWJhcnBhcnQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9hY3Rpdml0eWFjdGlvbi5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBQYXJ0IH0gZnJvbSAnLi4vLi4vcGFydC5qcyc7XG5pbXBvcnQgeyBBY3Rpdml0eUJhclBvc2l0aW9uLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgTGF5b3V0U2V0dGluZ3MsIFBhcnRzLCBQb3NpdGlvbiwgRkxPQVRJTkdfUEFORUxfTUFSR0lOIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLCBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvbGF5b3V0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBJQ29sb3JUaGVtZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWSVRZX0JBUl9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQk9SREVSLCBBQ1RJVklUWV9CQVJfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0FDVElWRV9CT1JERVIsIEFDVElWSVRZX0JBUl9CQURHRV9CQUNLR1JPVU5ELCBBQ1RJVklUWV9CQVJfQkFER0VfRk9SRUdST1VORCwgQUNUSVZJVFlfQkFSX0lOQUNUSVZFX0ZPUkVHUk9VTkQsIEFDVElWSVRZX0JBUl9BQ1RJVkVfQkFDS0dST1VORCwgQUNUSVZJVFlfQkFSX0RSQUdfQU5EX0RST1BfQk9SREVSLCBBQ1RJVklUWV9CQVJfQUNUSVZFX0ZPQ1VTX0JPUkRFUiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgY29udHJhc3RCb3JkZXIsIGZvY3VzQm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIEV2ZW50VHlwZSwgaXNBbmNlc3RvciwgJCwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEN1c3RvbU1lbnViYXJDb250cm9sIH0gZnJvbSAnLi4vdGl0bGViYXIvbWVudWJhckNvbnRyb2wuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRNZW51QmFyVmlzaWJpbGl0eSwgTWVudVNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydCB9IGZyb20gJy4uL3BhbmVDb21wb3NpdGVQYXJ0LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlQmFyT3B0aW9ucywgUGFuZUNvbXBvc2l0ZUJhciB9IGZyb20gJy4uL3BhbmVDb21wb3NpdGVCYXIuanMnO1xuaW1wb3J0IHsgR2xvYmFsQ29tcG9zaXRlQmFyIH0gZnJvbSAnLi4vZ2xvYmFsQ29tcG9zaXRlQmFyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIH0gZnJvbSAnLi4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBY3Rpdml0eWJhclBhcnQgZXh0ZW5kcyBQYXJ0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQUNUSU9OX0hFSUdIVCA9IDQ4O1xuXHRzdGF0aWMgcmVhZG9ubHkgQ09NUEFDVF9BQ1RJT05fSEVJR0hUID0gMjg7XG5cblx0c3RhdGljIHJlYWRvbmx5IEFDVElWSVRZQkFSX1dJRFRIID0gNDg7XG5cdHN0YXRpYyByZWFkb25seSBDT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIID0gMzY7XG5cblx0LyoqIE5hcnJvd2VyIGRpbWVuc2lvbnMgdXNlZCB3aGVuIHRoZSBmbG9hdGluZyBwYW5lbHMgKE1vZGVybiBVSSkgZXhwZXJpbWVudCBpcyBlbmFibGVkLiAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgRkxPQVRJTkdfQUNUSU9OX0hFSUdIVCA9IDM2O1xuXHRzdGF0aWMgcmVhZG9ubHkgRkxPQVRJTkdfQUNUSVZJVFlCQVJfV0lEVEggPSAzNjtcblx0c3RhdGljIHJlYWRvbmx5IEZMT0FUSU5HX0NPTVBBQ1RfQUNUSVZJVFlCQVJfV0lEVEggPSAyODtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUNPTl9TSVpFID0gMjQ7XG5cdHN0YXRpYyByZWFkb25seSBDT01QQUNUX0lDT05fU0laRSA9IDE2O1xuXG5cdC8qKlxuXHQgKiBHdXR0ZXIgcmVzZXJ2ZWQgb24gdGhlIGxlZnQgYW5kIGJvdHRvbSBlZGdlcyB1bmRlciB0aGUgZmxvYXRpbmcgcGFuZWxzXG5cdCAqIGV4cGVyaW1lbnQgc28gdGhlIGFjdGl2aXR5IGJhciBhbGlnbnMgd2l0aCB0aGUgZmxvYXRpbmcgY2FyZHMgKGl0IHN0YXlzXG5cdCAqIGZsdXNoIHdpdGggdGhlIHRpdGxlIGJhciwgc28gbm8gdG9wIGd1dHRlcikuIE11c3QgbWF0Y2ggdGhlIG1hcmdpbnMgYXBwbGllZFxuXHQgKiBpbiBgcGFydC5jc3NgIHVuZGVyIGAuZmxvYXRpbmctcGFuZWxzYC5cblx0ICovXG5cdHN0YXRpYyByZWFkb25seSBGTE9BVElOR19NQVJHSU4gPSBGTE9BVElOR19QQU5FTF9NQVJHSU47XG5cblx0c3RhdGljIHJlYWRvbmx5IHBpbm5lZFZpZXdDb250YWluZXJzS2V5ID0gJ3dvcmtiZW5jaC5hY3Rpdml0eS5waW5uZWRWaWV3bGV0czInO1xuXHRzdGF0aWMgcmVhZG9ubHkgcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc0tleSA9ICd3b3JrYmVuY2guYWN0aXZpdHkucGxhY2Vob2xkZXJWaWV3bGV0cyc7XG5cdHN0YXRpYyByZWFkb25seSB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlS2V5ID0gJ3dvcmtiZW5jaC5hY3Rpdml0eS52aWV3bGV0c1dvcmtzcGFjZVN0YXRlJztcblxuXHQvLyNyZWdpb24gSVZpZXdcblxuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmJhc2VXaWR0aCArIHRoaXMuZmxvYXRpbmdHdXR0ZXI7IH1cblx0Z2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5iYXNlV2lkdGggKyB0aGlzLmZsb2F0aW5nR3V0dGVyOyB9XG5cdHJlYWRvbmx5IG1pbmltdW1IZWlnaHQ6IG51bWJlciA9IDA7XG5cdHJlYWRvbmx5IG1heGltdW1IZWlnaHQ6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvKiogVGhlIGludHJpbnNpYyBhY3Rpdml0eSBiYXIgd2lkdGggKGV4Y2x1ZGVzIGFueSBmbG9hdGluZyBndXR0ZXIpLiAqL1xuXHRwcml2YXRlIGdldCBiYXNlV2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5sYXlvdXRTZXJ2aWNlLmlzRmxvYXRpbmdQYW5lbHNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pc0NvbXBhY3QgPyBBY3Rpdml0eWJhclBhcnQuRkxPQVRJTkdfQ09NUEFDVF9BQ1RJVklUWUJBUl9XSURUSCA6IEFjdGl2aXR5YmFyUGFydC5GTE9BVElOR19BQ1RJVklUWUJBUl9XSURUSDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0FDVElWSVRZQkFSX1dJRFRIIDogQWN0aXZpdHliYXJQYXJ0LkFDVElWSVRZQkFSX1dJRFRIO1xuXHR9XG5cblx0LyoqIFRoZSBhY3Rpb24gKGl0ZW0pIGhlaWdodCB0aGF0IGRyaXZlcyB2aXNpYmxlIGl0ZW0gc2l6aW5nIGFuZCB0aGUgY29tcG9zaXRlIGJhciBvdmVyZmxvdyBzaXplLiAqL1xuXHRwcml2YXRlIGdldCBhY3Rpb25IZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5faXNDb21wYWN0KSB7XG5cdFx0XHRyZXR1cm4gQWN0aXZpdHliYXJQYXJ0LkNPTVBBQ1RfQUNUSU9OX0hFSUdIVDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX0FDVElPTl9IRUlHSFQgOiBBY3Rpdml0eWJhclBhcnQuQUNUSU9OX0hFSUdIVDtcblx0fVxuXG5cdC8qKiBFeHRyYSBzcGFjZSByZXNlcnZlZCBhcm91bmQgdGhlIHBhcnQgd2hlbiB0aGUgZmxvYXRpbmcgcGFuZWxzIGV4cGVyaW1lbnQgaXMgZW5hYmxlZC4gKi9cblx0cHJpdmF0ZSBnZXQgZmxvYXRpbmdHdXR0ZXIoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5pc0Zsb2F0aW5nUGFuZWxzRW5hYmxlZCgpID8gQWN0aXZpdHliYXJQYXJ0LkZMT0FUSU5HX01BUkdJTiA6IDA7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxQYW5lQ29tcG9zaXRlQmFyPigpKTtcblx0cHJpdmF0ZSBjb250ZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNDb21wYWN0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhbmVDb21wb3NpdGVQYXJ0OiBJUGFuZUNvbXBvc2l0ZVBhcnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5faXNDb21wYWN0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfQ09NUEFDVCkgPz8gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKSkge1xuXHRcdFx0XHR0aGlzLl9pc0NvbXBhY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKSA/PyBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVDb21wYWN0U3R5bGUoKTtcblx0XHRcdFx0dGhpcy5yZWNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7IC8vIFNpZ25hbCBncmlkIHRoYXQgc2l6ZSBjb25zdHJhaW50cyBjaGFuZ2VkXG5cdFx0XHR9XG5cblx0XHRcdC8vIEZsb2F0aW5nIHBhbmVscyBjaGFuZ2VzIHRoZSByZXNlcnZlZCBsZWZ0L2JvdHRvbSBndXR0ZXIgKGFuZCB0aGVyZWZvcmVcblx0XHRcdC8vIHRoZSBmaXhlZCBwYXJ0IHdpZHRoKTogc2lnbmFsIHRoZSBncmlkIHRoYXQgdGhlIHNpemUgY29uc3RyYWludCBjaGFuZ2VkLlxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTGF5b3V0U2V0dGluZ3MuTU9ERVJOX1VJKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBhY3RTdHlsZSgpO1xuXHRcdFx0XHR0aGlzLnJlY3JlYXRlQ29tcG9zaXRlQmFyKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBhY3RTdHlsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGFjdCcsIHRoaXMuX2lzQ29tcGFjdCk7XG5cdFx0XHQvLyBNaXJyb3JlZCBvbiB0aGUgd29ya2JlbmNoIHJvb3QgZm9yIGZsb2F0aW5nUGFuZWxzLmNzc1xuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZpdHliYXItY29tcGFjdCcsIHRoaXMuX2lzQ29tcGFjdCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYWN0aXZpdHktYmFyLXdpZHRoJywgYCR7dGhpcy5iYXNlV2lkdGh9cHhgKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1hY3Rpdml0eS1iYXItYWN0aW9uLWhlaWdodCcsIGAke3RoaXMuYWN0aW9uSGVpZ2h0fXB4YCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tYWN0aXZpdHktYmFyLWljb24tc2l6ZScsIGAke3RoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0lDT05fU0laRSA6IEFjdGl2aXR5YmFyUGFydC5JQ09OX1NJWkV9cHhgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlY3JlYXRlQ29tcG9zaXRlQmFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50IHx8ICF0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tcG9zaXRlQmFyLmNsZWFyKCk7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlLmNyZWF0ZSh0aGlzLmNvbnRlbnQpO1xuXG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbXBvc2l0ZUJhcigpOiBQYW5lQ29tcG9zaXRlQmFyIHtcblx0XHRjb25zdCBhY3Rpb25IZWlnaHQgPSB0aGlzLmFjdGlvbkhlaWdodDtcblx0XHRjb25zdCBpY29uU2l6ZSA9IHRoaXMuX2lzQ29tcGFjdCA/IEFjdGl2aXR5YmFyUGFydC5DT01QQUNUX0lDT05fU0laRSA6IEFjdGl2aXR5YmFyUGFydC5JQ09OX1NJWkU7XG5cblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpdml0eUJhckNvbXBvc2l0ZUJhciwgdGhpcy5sb2NhdGlvbiwge1xuXHRcdFx0cGFydENvbnRhaW5lckNsYXNzOiAnYWN0aXZpdHliYXInLFxuXHRcdFx0cGlubmVkVmlld0NvbnRhaW5lcnNLZXk6IEFjdGl2aXR5YmFyUGFydC5waW5uZWRWaWV3Q29udGFpbmVyc0tleSxcblx0XHRcdHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNLZXk6IEFjdGl2aXR5YmFyUGFydC5wbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5LFxuXHRcdFx0dmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZUtleTogQWN0aXZpdHliYXJQYXJ0LnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXksXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdGljb25TaXplLFxuXHRcdFx0YWN0aXZpdHlIb3Zlck9wdGlvbnM6IHtcblx0XHRcdFx0cG9zaXRpb246ICgpID0+IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uUklHSFQgOiBIb3ZlclBvc2l0aW9uLkxFRlQsXG5cdFx0XHR9LFxuXHRcdFx0cHJldmVudExvb3BOYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0cmVjb21wdXRlU2l6ZXM6IGZhbHNlLFxuXHRcdFx0ZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9ucywgZT86IE1vdXNlRXZlbnQgfCBHZXN0dXJlRXZlbnQpID0+IHsgfSxcblx0XHRcdGNvbXBvc2l0ZVNpemU6IDUyLFxuXHRcdFx0Y29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiAoe1xuXHRcdFx0XHRhY3RpdmVGb3JlZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9GT1JFR1JPVU5EKSxcblx0XHRcdFx0aW5hY3RpdmVGb3JlZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9JTkFDVElWRV9GT1JFR1JPVU5EKSxcblx0XHRcdFx0YWN0aXZlQm9yZGVyQ29sb3I6IHRoZW1lLmdldENvbG9yKEFDVElWSVRZX0JBUl9BQ1RJVkVfQk9SREVSKSxcblx0XHRcdFx0YWN0aXZlQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0FDVElWRV9CQUNLR1JPVU5EKSxcblx0XHRcdFx0YmFkZ2VCYWNrZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQkFER0VfQkFDS0dST1VORCksXG5cdFx0XHRcdGJhZGdlRm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0JBREdFX0ZPUkVHUk9VTkQpLFxuXHRcdFx0XHRkcmFnQW5kRHJvcEJvcmRlcjogdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0RSQUdfQU5EX0RST1BfQk9SREVSKSxcblx0XHRcdFx0YWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsIGluYWN0aXZlQmFja2dyb3VuZENvbG9yOiB1bmRlZmluZWQsIGFjdGl2ZUJvcmRlckJvdHRvbUNvbG9yOiB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHRcdG92ZXJmbG93QWN0aW9uU2l6ZTogYWN0aW9uSGVpZ2h0LFxuXHRcdH0sIFBhcnRzLkFDVElWSVRZQkFSX1BBUlQsIHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQsIHRydWUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuY29udGVudCA9IGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jb250ZW50JykpO1xuXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0U3R5bGUoKTtcblxuXHRcdGlmICh0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLkFDVElWSVRZQkFSX1BBUlQpKSB7XG5cdFx0XHR0aGlzLnNob3coKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb250ZW50O1xuXHR9XG5cblx0Z2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKCkgPz8gW107XG5cdH1cblxuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpID8/IFtdO1xuXHR9XG5cblx0Z2V0UGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlPy5nZXRQYW5lQ29tcG9zaXRlSWRzKCkgPz8gW107XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZT8uZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ2V0Q29udGFpbmVyKCkpO1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKEFDVElWSVRZX0JBUl9CQUNLR1JPVU5EKSB8fCAnJztcblx0XHRjb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblxuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSB8fCAnJztcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYm9yZGVyZWQnLCAhIWJvcmRlckNvbG9yKTtcblx0XHRjb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBib3JkZXJDb2xvciA/IGJvcmRlckNvbG9yIDogJyc7XG5cdH1cblxuXHRzaG93KGZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhcigpO1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIudmFsdWUuY3JlYXRlKHRoaXMuY29udGVudCk7XG5cblx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbi53aWR0aCwgdGhpcy5kaW1lbnNpb24uaGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb21wb3NpdGVCYXIudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuY29udGVudCkge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuY29udGVudCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0KHdpZHRoLCBoZWlnaHQsIDAsIDApO1xuXG5cdFx0aWYgKCF0aGlzLmNvbXBvc2l0ZUJhci52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gdGhlIGZsb2F0aW5nIHBhbmVscyBleHBlcmltZW50IGlzIGVuYWJsZWQsIHJlc2VydmUgYSBndXR0ZXIgb24gdGhlXG5cdFx0Ly8gbGVmdCBhbmQgYm90dG9tIHNvIHRoZSBhY3Rpdml0eSBiYXIgbGluZXMgdXAgd2l0aCB0aGUgZmxvYXRpbmcgY2FyZHMgKGl0XG5cdFx0Ly8gc3RheXMgZmx1c2ggd2l0aCB0aGUgdGl0bGUgYmFyLCBzbyBubyB0b3AgZ3V0dGVyKS4gVGhlIGdyaWQgY29sdW1uIGlzIGdyb3duXG5cdFx0Ly8gYnkgdGhlIHNhbWUgYW1vdW50IChzZWUgbWluaW11bS9tYXhpbXVtV2lkdGgpIGFuZCB0aGUgbWF0Y2hpbmcgbWFyZ2lucyBhcmVcblx0XHQvLyBhcHBsaWVkIGluIENTUyAoYC5mbG9hdGluZy1wYW5lbHMgLnBhcnQuYWN0aXZpdHliYXJgKS5cblx0XHRjb25zdCBndXR0ZXIgPSB0aGlzLmZsb2F0aW5nR3V0dGVyO1xuXHRcdGNvbnN0IGNvbnRlbnRXaWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gZ3V0dGVyKTtcblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gZ3V0dGVyKTtcblxuXHRcdC8vIExheW91dCBjb250ZW50c1xuXHRcdGNvbnN0IGNvbnRlbnRBcmVhU2l6ZSA9IHN1cGVyLmxheW91dENvbnRlbnRzKGNvbnRlbnRXaWR0aCwgY29udGVudEhlaWdodCkuY29udGVudFNpemU7XG5cblx0XHQvLyBMYXlvdXQgY29tcG9zaXRlIGJhclxuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnZhbHVlLmxheW91dChjb250ZW50V2lkdGgsIGNvbnRlbnRBcmVhU2l6ZS5oZWlnaHQpO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLkFDVElWSVRZQkFSX1BBUlRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBY3Rpdml0eUJhckNvbXBvc2l0ZUJhciBleHRlbmRzIFBhbmVDb21wb3NpdGVCYXIge1xuXG5cdHByaXZhdGUgZWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtZW51QmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEN1c3RvbU1lbnViYXJDb250cm9sPigpKTtcblx0cHJpdmF0ZSBtZW51QmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb21wb3NpdGVCYXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGdsb2JhbENvbXBvc2l0ZUJhcjogR2xvYmFsQ29tcG9zaXRlQmFyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkga2V5Ym9hcmROYXZpZ2F0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sXG5cdFx0b3B0aW9uczogSVBhbmVDb21wb3NpdGVCYXJPcHRpb25zLFxuXHRcdHBhcnQ6IFBhcnRzLFxuXHRcdHBhbmVDb21wb3NpdGVQYXJ0OiBJUGFuZUNvbXBvc2l0ZVBhcnQsXG5cdFx0c2hvd0dsb2JhbEFjdGl2aXRpZXM6IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHZpZXdTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsb2NhdGlvbixcblx0XHRcdHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0ZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zOiAoYWN0aW9ucywgZSkgPT4ge1xuXHRcdFx0XHRcdG9wdGlvbnMuZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnMsIGUpO1xuXHRcdFx0XHRcdHRoaXMuZmlsbENvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgcGFydCwgcGFuZUNvbXBvc2l0ZVBhcnQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCB2aWV3U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHRpZiAoc2hvd0dsb2JhbEFjdGl2aXRpZXMpIHtcblx0XHRcdHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR2xvYmFsQ29tcG9zaXRlQmFyLCAoKSA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucygpLCAodGhlbWU6IElDb2xvclRoZW1lKSA9PiB0aGlzLm9wdGlvbnMuY29sb3JzKHRoZW1lKSwgdGhpcy5vcHRpb25zLmFjdGl2aXR5SG92ZXJPcHRpb25zKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgZm9yIGNvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5KSkge1xuXHRcdFx0XHRpZiAoZ2V0TWVudUJhclZpc2liaWxpdHkodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09ICdjb21wYWN0Jykge1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFsbE1lbnViYXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnVuaW5zdGFsbE1lbnViYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsbENvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zOiBJQWN0aW9uW10sIGU/OiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KSB7XG5cdFx0Ly8gTWVudVxuXHRcdGNvbnN0IG1lbnVCYXJWaXNpYmlsaXR5ID0gZ2V0TWVudUJhclZpc2liaWxpdHkodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKG1lbnVCYXJWaXNpYmlsaXR5ID09PSAnY29tcGFjdCcgfHwgbWVudUJhclZpc2liaWxpdHkgPT09ICdoaWRkZW4nIHx8IG1lbnVCYXJWaXNpYmlsaXR5ID09PSAndG9nZ2xlJykge1xuXHRcdFx0YWN0aW9ucy51bnNoaWZ0KC4uLlt0b0FjdGlvbih7IGlkOiAndG9nZ2xlTWVudVZpc2liaWxpdHknLCBsYWJlbDogbG9jYWxpemUoJ21lbnUnLCBcIk1lbnVcIiksIGNoZWNrZWQ6IG1lbnVCYXJWaXNpYmlsaXR5ID09PSAnY29tcGFjdCcsIHJ1bjogKCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHksIG1lbnVCYXJWaXNpYmlsaXR5ID09PSAnY29tcGFjdCcgPyAndG9nZ2xlJyA6ICdjb21wYWN0JykgfSksIG5ldyBTZXBhcmF0b3IoKV0pO1xuXHRcdH1cblxuXHRcdGlmIChtZW51QmFyVmlzaWJpbGl0eSA9PT0gJ2NvbXBhY3QnICYmIHRoaXMubWVudUJhckNvbnRhaW5lciAmJiBlPy50YXJnZXQpIHtcblx0XHRcdGlmIChpc0FuY2VzdG9yKGUudGFyZ2V0IGFzIE5vZGUsIHRoaXMubWVudUJhckNvbnRhaW5lcikpIHtcblx0XHRcdFx0YWN0aW9ucy51bnNoaWZ0KC4uLlt0b0FjdGlvbih7IGlkOiAnaGlkZUNvbXBhY3RNZW51JywgbGFiZWw6IGxvY2FsaXplKCdoaWRlTWVudScsIFwiSGlkZSBNZW51XCIpLCBydW46ICgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5LCAndG9nZ2xlJykgfSksIG5ldyBTZXBhcmF0b3IoKV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEdsb2JhbCBDb21wb3NpdGUgQmFyXG5cdFx0aWYgKHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdGFjdGlvbnMucHVzaCguLi50aGlzLmdsb2JhbENvbXBvc2l0ZUJhci5nZXRDb250ZXh0TWVudUFjdGlvbnMoKSk7XG5cdFx0fVxuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdGFjdGlvbnMucHVzaCguLi50aGlzLmdldEFjdGl2aXR5QmFyQ29udGV4dE1lbnVBY3Rpb25zKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1bmluc3RhbGxNZW51YmFyKCkge1xuXHRcdGlmICh0aGlzLm1lbnVCYXIudmFsdWUpIHtcblx0XHRcdHRoaXMubWVudUJhci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tZW51QmFyQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLm1lbnVCYXJDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLm1lbnVCYXJDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsTWVudWJhcigpIHtcblx0XHRpZiAodGhpcy5tZW51QmFyLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm47IC8vIHByZXZlbnQgbWVudSBiYXIgZnJvbSBpbnN0YWxsaW5nIHR3aWNlICMxMTA3MjBcblx0XHR9XG5cblx0XHR0aGlzLm1lbnVCYXJDb250YWluZXIgPSAkKCcubWVudWJhcicpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZWxlbWVudCk7XG5cdFx0Y29udGVudC5wcmVwZW5kKHRoaXMubWVudUJhckNvbnRhaW5lcik7XG5cblx0XHQvLyBNZW51YmFyOiBpbnN0YWxsIGEgY3VzdG9tIG1lbnUgYmFyIGRlcGVuZGluZyBvbiBjb25maWd1cmF0aW9uXG5cdFx0dGhpcy5tZW51QmFyLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21NZW51YmFyQ29udHJvbCk7XG5cdFx0dGhpcy5tZW51QmFyLnZhbHVlLmNyZWF0ZSh0aGlzLm1lbnVCYXJDb250YWluZXIpO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyS2V5Ym9hcmROYXZpZ2F0aW9uTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMua2V5Ym9hcmROYXZpZ2F0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIFVwL0Rvd24gb3IgTGVmdC9SaWdodCBhcnJvdyBvbiBjb21wYWN0IG1lbnVcblx0XHRpZiAodGhpcy5tZW51QmFyQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmtleWJvYXJkTmF2aWdhdGlvbkRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5tZW51QmFyQ29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBrYkV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSB8fCBrYkV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXAvRG93biBvbiBBY3Rpdml0eSBJY29uc1xuXHRcdGlmICh0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5rZXlib2FyZE5hdmlnYXRpb25EaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBrYkV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSB8fCBrYkV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdFx0dGhpcy5nbG9iYWxDb21wb3NpdGVCYXI/LmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoa2JFdmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSB8fCBrYkV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0XHR0aGlzLm1lbnVCYXIudmFsdWU/LnRvZ2dsZUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBVcCBhcnJvdyBvbiBnbG9iYWwgaWNvbnNcblx0XHRpZiAodGhpcy5nbG9iYWxDb21wb3NpdGVCYXIpIHtcblx0XHRcdHRoaXMua2V5Ym9hcmROYXZpZ2F0aW9uRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmdsb2JhbENvbXBvc2l0ZUJhci5lbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBrYkV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGtiRXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykgfHwga2JFdmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cyh0aGlzLmdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKCkubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cblx0XHQvLyBJbnN0YWxsIG1lbnViYXIgaWYgY29tcGFjdFxuXHRcdGlmIChnZXRNZW51QmFyVmlzaWJpbGl0eSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHR0aGlzLmluc3RhbGxNZW51YmFyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVmlldyBDb250YWluZXJzIGFjdGlvbiBiYXJcblx0XHR0aGlzLmNvbXBvc2l0ZUJhckNvbnRhaW5lciA9IHN1cGVyLmNyZWF0ZSh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0Ly8gR2xvYmFsIGFjdGlvbiBiYXJcblx0XHRpZiAodGhpcy5nbG9iYWxDb21wb3NpdGVCYXIpIHtcblx0XHRcdHRoaXMuZ2xvYmFsQ29tcG9zaXRlQmFyLmNyZWF0ZSh0aGlzLmVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIEtleWJvYXJkIE5hdmlnYXRpb25cblx0XHR0aGlzLnJlZ2lzdGVyS2V5Ym9hcmROYXZpZ2F0aW9uTGlzdGVuZXJzKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5jb21wb3NpdGVCYXJDb250YWluZXI7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZW51QmFyQ29udGFpbmVyKSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLm9yaWVudGF0aW9uID09PSBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdFx0aGVpZ2h0IC09IHRoaXMubWVudUJhckNvbnRhaW5lci5jbGllbnRIZWlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWR0aCAtPSB0aGlzLm1lbnVCYXJDb250YWluZXIuY2xpZW50V2lkdGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLmdsb2JhbENvbXBvc2l0ZUJhcikge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbiA9PT0gQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRcdGhlaWdodCAtPSAodGhpcy5nbG9iYWxDb21wb3NpdGVCYXIuc2l6ZSgpICogdGhpcy5vcHRpb25zLm92ZXJmbG93QWN0aW9uU2l6ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWR0aCAtPSB0aGlzLmdsb2JhbENvbXBvc2l0ZUJhci5lbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzdXBlci5sYXlvdXQod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRnZXRBY3Rpdml0eUJhckNvbnRleHRNZW51QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyUG9zaXRpb25NZW51ID0gdGhpcy5tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSk7XG5cdFx0Y29uc3QgcG9zaXRpb25BY3Rpb25zID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGFjdGl2aXR5QmFyUG9zaXRpb25NZW51KS5zZWNvbmRhcnk7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW1xuXHRcdFx0bmV3IFN1Ym1lbnVBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uYWN0aXZpdHlCYXIucG9zaXRpb24nLCBsb2NhbGl6ZSgnYWN0aXZpdHkgYmFyIHBvc2l0aW9uJywgXCJBY3Rpdml0eSBCYXIgUG9zaXRpb25cIiksIHBvc2l0aW9uQWN0aW9ucyksXG5cdFx0XTtcblxuXHRcdC8vIFNob3cgc2l6ZSBzdWJtZW51IG9ubHkgd2hlbiBhY3Rpdml0eSBiYXIgaXMgaW4gZGVmYXVsdCBwb3NpdGlvblxuXHRcdGNvbnN0IGFjdGl2aXR5QmFyUG9zaXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OKTtcblx0XHRpZiAoYWN0aXZpdHlCYXJQb3NpdGlvbiA9PT0gQWN0aXZpdHlCYXJQb3NpdGlvbi5ERUZBVUxUKSB7XG5cdFx0XHRjb25zdCBpc0NvbXBhY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNUKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IHNpemVBY3Rpb25zID0gW1xuXHRcdFx0XHR0b0FjdGlvbih7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhci5zaXplLmRlZmF1bHQnLCBsYWJlbDogbG9jYWxpemUoJ2FjdGl2aXR5QmFyU2l6ZURlZmF1bHQnLCBcIkRlZmF1bHRcIiksIGNoZWNrZWQ6ICFpc0NvbXBhY3QsIHJ1bjogKCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfQ09NUEFDVCwgZmFsc2UpIH0pLFxuXHRcdFx0XHR0b0FjdGlvbih7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhci5zaXplLmNvbXBhY3QnLCBsYWJlbDogbG9jYWxpemUoJ2FjdGl2aXR5QmFyU2l6ZUNvbXBhY3QnLCBcIkNvbXBhY3RcIiksIGNoZWNrZWQ6IGlzQ29tcGFjdCwgcnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9DT01QQUNULCB0cnVlKSB9KSxcblx0XHRcdF07XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFN1Ym1lbnVBY3Rpb24oJ3dvcmtiZW5jaC5hY3Rpb24uYWN0aXZpdHlCYXIuc2l6ZScsIGxvY2FsaXplKCdhY3Rpdml0eSBiYXIgc2l6ZScsIFwiQWN0aXZpdHkgQmFyIFNpemVcIiksIHNpemVBY3Rpb25zKSk7XG5cdFx0fVxuXG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5JRCwgbGFiZWw6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5nZXRMYWJlbCh0aGlzLmxheW91dFNlcnZpY2UpLCBydW46ICgpID0+IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gbmV3IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbigpLnJ1bihhY2Nlc3NvcikpIH0pKTtcblxuXHRcdGlmICh0aGlzLnBhcnQgPT09IFBhcnRzLlNJREVCQVJfUEFSVCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6IFRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5QWN0aW9uLklELCBsYWJlbDogVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uTEFCRUwsIHJ1bjogKCkgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBuZXcgVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24oKS5ydW4oYWNjZXNzb3IpKSB9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFjdGl2aXR5QmFyTG9jYXRpb24uZGVmYXVsdCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3Bvc2l0aW9uQWN0aXZpdHlCYXJEZWZhdWx0JywgJ01vdmUgQWN0aXZpdHkgQmFyIHRvIFNpZGUnKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaURlZmF1bHRBY3Rpdml0eUJhcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlZmF1bHRcIiksXG5cdFx0XHR9LFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ2RlZmF1bHQnLCBcIkRlZmF1bHRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5ERUZBVUxUKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTn1gLCBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OLCBBY3Rpdml0eUJhclBvc2l0aW9uLkRFRkFVTFQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhckxvY2F0aW9uLnRvcCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3Bvc2l0aW9uQWN0aXZpdHlCYXJUb3AnLCAnTW92ZSBBY3Rpdml0eSBCYXIgdG8gVG9wJyksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUb3BBY3Rpdml0eUJhcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRvcFwiKSxcblx0XHRcdH0sXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgndG9wJywgXCJUb3BcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1ApLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OfWAsIEFjdGl2aXR5QmFyUG9zaXRpb24uVE9QKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTiwgQWN0aXZpdHlCYXJQb3NpdGlvbi5UT1ApO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhckxvY2F0aW9uLmJvdHRvbScsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3Bvc2l0aW9uQWN0aXZpdHlCYXJCb3R0b20nLCAnTW92ZSBBY3Rpdml0eSBCYXIgdG8gQm90dG9tJyksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlCb3R0b21BY3Rpdml0eUJhcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkJvdHRvbVwiKSxcblx0XHRcdH0sXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgnYm90dG9tJywgXCJCb3R0b21cIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT059YCwgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT00pLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OfWAsIEFjdGl2aXR5QmFyUG9zaXRpb24uQk9UVE9NKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTiwgQWN0aXZpdHlCYXJQb3NpdGlvbi5CT1RUT00pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hY3Rpdml0eUJhckxvY2F0aW9uLmhpZGUnLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdoaWRlQWN0aXZpdHlCYXInLCAnSGlkZSBBY3Rpdml0eSBCYXInKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUhpZGVBY3Rpdml0eUJhcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkhpZGRlblwiKSxcblx0XHRcdH0sXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgnaGlkZScsIFwiSGlkZGVuXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuQUNUSVZJVFlfQkFSX0xPQ0FUSU9OfWAsIEFjdGl2aXR5QmFyUG9zaXRpb24uSElEREVOKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQWN0aXZpdHlCYXJQb3NpdGlvbk1lbnUsXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTn1gLCBBY3Rpdml0eUJhclBvc2l0aW9uLkhJRERFTiksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04sIEFjdGl2aXR5QmFyUG9zaXRpb24uSElEREVOKTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5BY3Rpdml0eUJhclBvc2l0aW9uTWVudSxcblx0dGl0bGU6IGxvY2FsaXplKCdwb3NpdGlvbkFjdGl2aXR1QmFyJywgXCJBY3Rpdml0eSBCYXIgUG9zaXRpb25cIiksXG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRvcmRlcjogMixcblx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdDb250YWluZXJUaXRsZUNvbnRleHQsIHtcblx0c3VibWVudTogTWVudUlkLkFjdGl2aXR5QmFyUG9zaXRpb25NZW51LFxuXHR0aXRsZTogbG9jYWxpemUoJ3Bvc2l0aW9uQWN0aXZpdHVCYXInLCBcIkFjdGl2aXR5IEJhciBQb3NpdGlvblwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyTG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikpLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lckxvY2F0aW9uJywgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpXG5cdCksXG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRvcmRlcjogMVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFN3aXRjaENvbXBvc2l0ZVZpZXdBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNTaWRlQmFyVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwcmV2aW91c1NpZGVCYXJWaWV3JywgJ1ByZXZpb3VzIFByaW1hcnkgU2lkZSBCYXIgVmlldycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIC0xKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFN3aXRjaENvbXBvc2l0ZVZpZXdBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubmV4dFNpZGVCYXJWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25leHRTaWRlQmFyVmlldycsICdOZXh0IFByaW1hcnkgU2lkZSBCYXIgVmlldycpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIDEpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKFxuXHRjbGFzcyBGb2N1c0FjdGl2aXR5QmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0FjdGl2aXR5QmFyJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNBY3Rpdml0eUJhcicsICdGb2N1cyBBY3Rpdml0eSBCYXInKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLmZvY3VzUGFydChQYXJ0cy5BQ1RJVklUWUJBUl9QQVJUKTtcblx0XHR9XG5cdH0pO1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXG5cdGNvbnN0IGFjdGl2aXR5QmFyQWN0aXZlQm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQUNUSVZFX0JPUkRFUik7XG5cdGlmIChhY3Rpdml0eUJhckFjdGl2ZUJvcmRlckNvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5jaGVja2VkIC5hY3RpdmUtaXRlbS1pbmRpY2F0b3I6YmVmb3JlIHtcblx0XHRcdFx0Ym9yZGVyLWxlZnQtY29sb3I6ICR7YWN0aXZpdHlCYXJBY3RpdmVCb3JkZXJDb2xvcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCBhY3Rpdml0eUJhckFjdGl2ZUZvY3VzQm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihBQ1RJVklUWV9CQVJfQUNUSVZFX0ZPQ1VTX0JPUkRFUik7XG5cdGlmIChhY3Rpdml0eUJhckFjdGl2ZUZvY3VzQm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuYWN0aXZpdHliYXIgPiAuY29udGVudCA6bm90KC5tb25hY28tbWVudSkgPiAubW9uYWNvLWFjdGlvbi1iYXIgLmFjdGlvbi1pdGVtLmNoZWNrZWQ6Zm9jdXM6OmJlZm9yZSB7XG5cdFx0XHRcdHZpc2liaWxpdHk6IGhpZGRlbjtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5jaGVja2VkOmZvY3VzIC5hY3RpdmUtaXRlbS1pbmRpY2F0b3I6YmVmb3JlIHtcblx0XHRcdFx0dmlzaWJpbGl0eTogdmlzaWJsZTtcblx0XHRcdFx0Ym9yZGVyLWxlZnQtY29sb3I6ICR7YWN0aXZpdHlCYXJBY3RpdmVGb2N1c0JvcmRlckNvbG9yfTtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdGNvbnN0IGFjdGl2aXR5QmFyQWN0aXZlQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoQUNUSVZJVFlfQkFSX0FDVElWRV9CQUNLR1JPVU5EKTtcblx0aWYgKGFjdGl2aXR5QmFyQWN0aXZlQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5jaGVja2VkIC5hY3RpdmUtaXRlbS1pbmRpY2F0b3Ige1xuXHRcdFx0XHR6LWluZGV4OiAwO1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke2FjdGl2aXR5QmFyQWN0aXZlQmFja2dyb3VuZENvbG9yfTtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdC8vIFN0eWxpbmcgd2l0aCBPdXRsaW5lIGNvbG9yIChlLmcuIGhpZ2ggY29udHJhc3QgdGhlbWUpXG5cdGNvbnN0IG91dGxpbmUgPSB0aGVtZS5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcik7XG5cdGlmIChvdXRsaW5lKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbSAuYWN0aW9uLWxhYmVsOjpiZWZvcmV7XG5cdFx0XHRcdHBhZGRpbmc6IDZweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5hY3RpdmUgLmFjdGlvbi1sYWJlbDo6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5hY3RpdmU6aG92ZXIgLmFjdGlvbi1sYWJlbDo6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbS5jaGVja2VkIC5hY3Rpb24tbGFiZWw6OmJlZm9yZSxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5hY3Rpdml0eWJhciA+IC5jb250ZW50IDpub3QoLm1vbmFjby1tZW51KSA+IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW0uY2hlY2tlZDpob3ZlciAuYWN0aW9uLWxhYmVsOjpiZWZvcmUge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggc29saWQgJHtvdXRsaW5lfTtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbTpob3ZlciAuYWN0aW9uLWxhYmVsOjpiZWZvcmUge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggZGFzaGVkICR7b3V0bGluZX07XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5hY3Rpdml0eWJhciA+IC5jb250ZW50IDpub3QoLm1vbmFjby1tZW51KSA+IC5tb25hY28tYWN0aW9uLWJhciAuYWN0aW9uLWl0ZW06Zm9jdXMgLmFjdGl2ZS1pdGVtLWluZGljYXRvcjpiZWZvcmUge1xuXHRcdFx0XHRib3JkZXItbGVmdC1jb2xvcjogJHtvdXRsaW5lfTtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdC8vIFN0eWxpbmcgd2l0aG91dCBvdXRsaW5lIGNvbG9yXG5cdGVsc2Uge1xuXHRcdGNvbnN0IGZvY3VzQm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihmb2N1c0JvcmRlcik7XG5cdFx0aWYgKGZvY3VzQm9yZGVyQ29sb3IpIHtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmFjdGl2aXR5YmFyID4gLmNvbnRlbnQgOm5vdCgubW9uYWNvLW1lbnUpID4gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24taXRlbTpmb2N1cyAuYWN0aXZlLWl0ZW0taW5kaWNhdG9yOjpiZWZvcmUge1xuXHRcdFx0XHRcdFx0Ym9yZGVyLWxlZnQtY29sb3I6ICR7Zm9jdXNCb3JkZXJDb2xvcn07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRgKTtcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMscUJBQXFCLHlCQUF5QixnQkFBZ0IsT0FBTyxVQUFVLDZCQUE2QjtBQUNySCxTQUFTLDZCQUErQztBQUN4RCxTQUFTLGlCQUFpQix5QkFBeUI7QUFDbkQsU0FBUyw2QkFBNkIscUNBQXFDO0FBQzNFLFNBQVMsZUFBNEIsa0NBQWtDO0FBQ3ZFLFNBQVMseUJBQXlCLHFCQUFxQix5QkFBeUIsNEJBQTRCLCtCQUErQiwrQkFBK0Isa0NBQWtDLGdDQUFnQyxtQ0FBbUMsd0NBQXdDO0FBQ3ZULFNBQVMsc0JBQXNCLGdCQUFnQixtQkFBbUI7QUFDbEUsU0FBUyx1QkFBdUIsUUFBUSxXQUFXLFlBQVksR0FBRyxpQkFBaUI7QUFDbkYsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0Isb0JBQW9CO0FBQ25ELFNBQWtCLFdBQVcsZUFBZSxnQkFBZ0I7QUFDNUQsU0FBUyw2QkFBNkI7QUFDdEMs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
