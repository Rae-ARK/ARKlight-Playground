import { localize, localize2 } from "../../../nls.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../platform/actions/common/actions.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { alert } from "../../../base/browser/ui/aria/aria.js";
import { EditorActionsLocation, EditorTabsMode, IWorkbenchLayoutService, LayoutSettings, Parts, Position, ZenModeSettings, positionToString } from "../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { KeyMod, KeyCode } from "../../../base/common/keyCodes.js";
import { isWindows, isLinux, isWeb, isMacintosh, isNative } from "../../../base/common/platform.js";
import { IsMacNativeContext } from "../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IViewDescriptorService, ViewContainerLocation, ViewContainerLocationToString } from "../../common/views.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { ToggleAuxiliaryBarAction } from "../parts/auxiliarybar/auxiliaryBarActions.js";
import { TogglePanelAction } from "../parts/panel/panelActions.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { AuxiliaryBarVisibleContext, PanelAlignmentContext, PanelVisibleContext, SideBarVisibleContext, FocusedViewContext, InEditorZenModeContext, IsMainEditorCenteredLayoutContext, MainEditorAreaVisibleContext, IsMainWindowFullscreenContext, PanelPositionContext, IsAuxiliaryWindowFocusedContext, IsSessionsWindowContext, TitleBarStyleContext, IsAuxiliaryWindowContext } from "../../common/contextkeys.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { registerIcon } from "../../../platform/theme/common/iconRegistry.js";
import { mainWindow } from "../../../base/browser/window.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { MenuSettings, TitlebarStyle } from "../../../platform/window/common/window.js";
import { IPreferencesService } from "../../services/preferences/common/preferences.js";
import { QuickInputAlignmentContextKey } from "../../../platform/quickinput/browser/quickInput.js";
import { IEditorGroupsService } from "../../services/editor/common/editorGroupsService.js";
const menubarIcon = registerIcon("menuBar", Codicon.layoutMenubar, localize("menuBarIcon", "Represents the menu bar"));
const activityBarLeftIcon = registerIcon("activity-bar-left", Codicon.layoutActivitybarLeft, localize("activityBarLeft", "Represents the activity bar in the left position"));
const activityBarRightIcon = registerIcon("activity-bar-right", Codicon.layoutActivitybarRight, localize("activityBarRight", "Represents the activity bar in the right position"));
const panelLeftIcon = registerIcon("panel-left", Codicon.layoutSidebarLeft, localize("panelLeft", "Represents a side bar in the left position"));
const panelLeftOffIcon = registerIcon("panel-left-off", Codicon.layoutSidebarLeftOff, localize("panelLeftOff", "Represents a side bar in the left position toggled off"));
const panelRightIcon = registerIcon("panel-right", Codicon.layoutSidebarRight, localize("panelRight", "Represents side bar in the right position"));
const panelRightOffIcon = registerIcon("panel-right-off", Codicon.layoutSidebarRightOff, localize("panelRightOff", "Represents side bar in the right position toggled off"));
const panelIcon = registerIcon("panel-bottom", Codicon.layoutPanel, localize("panelBottom", "Represents the bottom panel"));
const statusBarIcon = registerIcon("statusBar", Codicon.layoutStatusbar, localize("statusBarIcon", "Represents the status bar"));
const panelAlignmentLeftIcon = registerIcon("panel-align-left", Codicon.layoutPanelLeft, localize("panelBottomLeft", "Represents the bottom panel alignment set to the left"));
const panelAlignmentRightIcon = registerIcon("panel-align-right", Codicon.layoutPanelRight, localize("panelBottomRight", "Represents the bottom panel alignment set to the right"));
const panelAlignmentCenterIcon = registerIcon("panel-align-center", Codicon.layoutPanelCenter, localize("panelBottomCenter", "Represents the bottom panel alignment set to the center"));
const panelAlignmentJustifyIcon = registerIcon("panel-align-justify", Codicon.layoutPanelJustify, localize("panelBottomJustify", "Represents the bottom panel alignment set to justified"));
const quickInputAlignmentTopIcon = registerIcon("quickInputAlignmentTop", Codicon.arrowUp, localize("quickInputAlignmentTop", "Represents quick input alignment set to the top"));
const quickInputAlignmentCenterIcon = registerIcon("quickInputAlignmentCenter", Codicon.circle, localize("quickInputAlignmentCenter", "Represents quick input alignment set to the center"));
const fullscreenIcon = registerIcon("fullscreen", Codicon.screenFull, localize("fullScreenIcon", "Represents full screen"));
const centerLayoutIcon = registerIcon("centerLayoutIcon", Codicon.layoutCentered, localize("centerLayoutIcon", "Represents centered layout mode"));
const zenModeIcon = registerIcon("zenMode", Codicon.target, localize("zenModeIcon", "Represents zen mode"));
const ToggleActivityBarVisibilityActionId = "workbench.action.toggleActivityBarVisibility";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleCenteredLayout",
      title: {
        ...localize2("toggleCenteredLayout", "Toggle Centered Layout"),
        mnemonicTitle: localize({ key: "miToggleCenteredLayout", comment: ["&& denotes a mnemonic"] }, "&&Centered Layout")
      },
      precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), IsSessionsWindowContext.negate()),
      category: Categories.View,
      f1: true,
      toggled: IsMainEditorCenteredLayoutContext,
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "1_toggle_view",
        order: 3,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const editorGroupService = accessor.get(IEditorGroupsService);
    layoutService.centerMainEditorLayout(!layoutService.isMainEditorLayoutCentered());
    editorGroupService.activeGroup.focus();
  }
});
const sidebarPositionConfigurationKey = "workbench.sideBar.location";
class MoveSidebarPositionAction extends Action2 {
  constructor(id, title, position) {
    super({
      id,
      title,
      f1: false
    });
    this.position = position;
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const position = layoutService.getSideBarPosition();
    if (position !== this.position) {
      return configurationService.updateValue(sidebarPositionConfigurationKey, positionToString(this.position));
    }
  }
}
const _MoveSidebarRightAction = class _MoveSidebarRightAction extends MoveSidebarPositionAction {
  constructor() {
    super(_MoveSidebarRightAction.ID, localize2("moveSidebarRight", "Move Primary Side Bar Right"), Position.RIGHT);
  }
};
_MoveSidebarRightAction.ID = "workbench.action.moveSideBarRight";
let MoveSidebarRightAction = _MoveSidebarRightAction;
const _MoveSidebarLeftAction = class _MoveSidebarLeftAction extends MoveSidebarPositionAction {
  constructor() {
    super(_MoveSidebarLeftAction.ID, localize2("moveSidebarLeft", "Move Primary Side Bar Left"), Position.LEFT);
  }
};
_MoveSidebarLeftAction.ID = "workbench.action.moveSideBarLeft";
let MoveSidebarLeftAction = _MoveSidebarLeftAction;
registerAction2(MoveSidebarRightAction);
registerAction2(MoveSidebarLeftAction);
const _ToggleSidebarPositionAction = class _ToggleSidebarPositionAction extends Action2 {
  static getLabel(layoutService) {
    return layoutService.getSideBarPosition() === Position.LEFT ? localize("moveSidebarRight", "Move Primary Side Bar Right") : localize("moveSidebarLeft", "Move Primary Side Bar Left");
  }
  constructor() {
    super({
      id: _ToggleSidebarPositionAction.ID,
      title: localize2("toggleSidebarPosition", "Toggle Primary Side Bar Position"),
      category: Categories.View,
      f1: true,
      precondition: IsSessionsWindowContext.negate()
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const position = layoutService.getSideBarPosition();
    const newPositionValue = position === Position.LEFT ? "right" : "left";
    return configurationService.updateValue(sidebarPositionConfigurationKey, newPositionValue);
  }
};
_ToggleSidebarPositionAction.ID = "workbench.action.toggleSidebarPosition";
_ToggleSidebarPositionAction.LABEL = localize("toggleSidebarPosition", "Toggle Primary Side Bar Position");
let ToggleSidebarPositionAction = _ToggleSidebarPositionAction;
registerAction2(ToggleSidebarPositionAction);
const configureLayoutIcon = registerIcon("configure-layout-icon", Codicon.layout, localize("cofigureLayoutIcon", "Icon represents workbench layout configuration."));
MenuRegistry.appendMenuItem(MenuId.LayoutControlMenu, {
  submenu: MenuId.LayoutControlMenuSubmenu,
  title: localize("configureLayout", "Configure Layout"),
  icon: configureLayoutIcon,
  group: "1_workbench_layout",
  when: ContextKeyExpr.and(
    IsAuxiliaryWindowContext.negate(),
    ContextKeyExpr.equals("config.workbench.layoutControl.type", "menu")
  )
});
MenuRegistry.appendMenuItems([{
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move side bar right", "Move Primary Side Bar Right")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move sidebar left", "Move Primary Side Bar Left")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move second sidebar left", "Move Secondary Side Bar Left")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
    order: 1
  }
}, {
  id: MenuId.ViewContainerTitleContext,
  item: {
    group: "3_workbench_layout_move",
    command: {
      id: ToggleSidebarPositionAction.ID,
      title: localize("move second sidebar right", "Move Secondary Side Bar Right")
    },
    when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar))),
    order: 1
  }
}]);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  group: "3_workbench_layout_move",
  command: {
    id: ToggleSidebarPositionAction.ID,
    title: localize({ key: "miMoveSidebarRight", comment: ["&& denotes a mnemonic"] }, "&&Move Primary Side Bar Right")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.notEquals("config.workbench.sideBar.location", "right"), IsSessionsWindowContext.negate()),
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  group: "3_workbench_layout_move",
  command: {
    id: ToggleSidebarPositionAction.ID,
    title: localize({ key: "miMoveSidebarLeft", comment: ["&& denotes a mnemonic"] }, "&&Move Primary Side Bar Left")
  },
  when: ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), IsSessionsWindowContext.negate()),
  order: 2
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleEditorVisibility",
      title: {
        ...localize2("toggleEditor", "Toggle Editor Area Visibility"),
        mnemonicTitle: localize({ key: "miShowEditorArea", comment: ["&& denotes a mnemonic"] }, "Show &&Editor Area")
      },
      category: Categories.View,
      f1: true,
      toggled: MainEditorAreaVisibleContext,
      // the workbench grid currently prevents us from supporting panel maximization with non-center panel alignment
      precondition: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.or(PanelAlignmentContext.isEqualTo("center"), PanelPositionContext.notEqualsTo("bottom")))
    });
  }
  run(accessor) {
    accessor.get(IWorkbenchLayoutService).toggleMaximizedPanel();
  }
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
  group: "2_appearance",
  title: localize({ key: "miAppearance", comment: ["&& denotes a mnemonic"] }, "&&Appearance"),
  submenu: MenuId.MenubarAppearanceMenu,
  when: IsSessionsWindowContext.negate(),
  order: 1
});
const _ToggleSidebarVisibilityAction = class _ToggleSidebarVisibilityAction extends Action2 {
  constructor() {
    super({
      id: _ToggleSidebarVisibilityAction.ID,
      title: localize2("toggleSidebar", "Toggle Primary Side Bar Visibility"),
      toggled: {
        condition: SideBarVisibleContext,
        title: localize("primary sidebar", "Primary Side Bar"),
        mnemonicTitle: localize({ key: "primary sidebar mnemonic", comment: ["&& denotes a mnemonic"] }, "&&Primary Side Bar")
      },
      metadata: {
        description: localize("openAndCloseSidebar", "Open/Show and Close/Hide Sidebar")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyB
      },
      menu: [
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "0_workbench_layout",
          order: 0
        },
        {
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 1
        }
      ]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const isCurrentlyVisible = layoutService.isVisible(Parts.SIDEBAR_PART);
    layoutService.setPartHidden(isCurrentlyVisible, Parts.SIDEBAR_PART);
    const alertMessage = isCurrentlyVisible ? localize("sidebarHidden", "Primary Side Bar hidden") : localize("sidebarVisible", "Primary Side Bar shown");
    alert(alertMessage);
  }
};
_ToggleSidebarVisibilityAction.ID = "workbench.action.toggleSidebarVisibility";
_ToggleSidebarVisibilityAction.LABEL = localize("compositePart.hideSideBarLabel", "Hide Primary Side Bar");
let ToggleSidebarVisibilityAction = _ToggleSidebarVisibilityAction;
registerAction2(ToggleSidebarVisibilityAction);
MenuRegistry.appendMenuItems([
  {
    id: MenuId.ViewContainerTitleContext,
    item: {
      group: "3_workbench_layout_move",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("compositePart.hideSideBarLabel", "Hide Primary Side Bar")
      },
      when: ContextKeyExpr.and(SideBarVisibleContext, ContextKeyExpr.equals("viewContainerLocation", ViewContainerLocationToString(ViewContainerLocation.Sidebar))),
      order: 2
    }
  },
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("toggleSideBar", "Toggle Primary Side Bar"),
        icon: panelLeftOffIcon,
        toggled: { condition: SideBarVisibleContext, icon: panelLeftIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        ),
        ContextKeyExpr.equals("config.workbench.sideBar.location", "left")
      ),
      order: 0
    }
  },
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: ToggleSidebarVisibilityAction.ID,
        title: localize("toggleSideBar", "Toggle Primary Side Bar"),
        icon: panelRightOffIcon,
        toggled: { condition: SideBarVisibleContext, icon: panelRightIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        ),
        ContextKeyExpr.equals("config.workbench.sideBar.location", "right")
      ),
      order: 2
    }
  }
]);
const _ToggleStatusbarVisibilityAction = class _ToggleStatusbarVisibilityAction extends Action2 {
  constructor() {
    super({
      id: _ToggleStatusbarVisibilityAction.ID,
      title: {
        ...localize2("toggleStatusbar", "Toggle Status Bar Visibility"),
        mnemonicTitle: localize({ key: "miStatusbar", comment: ["&& denotes a mnemonic"] }, "S&&tatus Bar")
      },
      category: Categories.View,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      toggled: ContextKeyExpr.equals("config.workbench.statusBar.visible", true),
      menu: [{
        id: MenuId.MenubarAppearanceMenu,
        group: "2_workbench_layout",
        order: 3,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const configurationService = accessor.get(IConfigurationService);
    const visibility = layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow);
    const newVisibilityValue = !visibility;
    return configurationService.updateValue(_ToggleStatusbarVisibilityAction.statusbarVisibleKey, newVisibilityValue);
  }
};
_ToggleStatusbarVisibilityAction.ID = "workbench.action.toggleStatusbarVisibility";
_ToggleStatusbarVisibilityAction.statusbarVisibleKey = "workbench.statusBar.visible";
let ToggleStatusbarVisibilityAction = _ToggleStatusbarVisibilityAction;
registerAction2(ToggleStatusbarVisibilityAction);
class AbstractSetShowTabsAction extends Action2 {
  constructor(settingName, value, title, id, precondition, description) {
    super({
      id,
      title,
      category: Categories.View,
      precondition: ContextKeyExpr.and(precondition, IsSessionsWindowContext.negate()),
      metadata: description ? { description } : void 0,
      f1: true
    });
    this.settingName = settingName;
    this.value = value;
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(this.settingName, this.value);
  }
}
const _HideEditorTabsAction = class _HideEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE).negate(), InEditorZenModeContext.negate());
    const title = localize2("hideEditorTabs", "Hide Editor Tabs");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.NONE, title, _HideEditorTabsAction.ID, precondition, localize2("hideEditorTabsDescription", "Hide Tab Bar"));
  }
};
_HideEditorTabsAction.ID = "workbench.action.hideEditorTabs";
let HideEditorTabsAction = _HideEditorTabsAction;
const _ZenHideEditorTabsAction = class _ZenHideEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.NONE).negate(), InEditorZenModeContext);
    const title = localize2("hideEditorTabsZenMode", "Hide Editor Tabs in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.NONE, title, _ZenHideEditorTabsAction.ID, precondition, localize2("hideEditorTabsZenModeDescription", "Hide Tab Bar in Zen Mode"));
  }
};
_ZenHideEditorTabsAction.ID = "workbench.action.zenHideEditorTabs";
let ZenHideEditorTabsAction = _ZenHideEditorTabsAction;
const _ShowMultipleEditorTabsAction = class _ShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.MULTIPLE).negate(), InEditorZenModeContext.negate());
    const title = localize2("showMultipleEditorTabs", "Show Multiple Editor Tabs");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.MULTIPLE, title, _ShowMultipleEditorTabsAction.ID, precondition, localize2("showMultipleEditorTabsDescription", "Show Tab Bar with multiple tabs"));
  }
};
_ShowMultipleEditorTabsAction.ID = "workbench.action.showMultipleEditorTabs";
let ShowMultipleEditorTabsAction = _ShowMultipleEditorTabsAction;
const _ZenShowMultipleEditorTabsAction = class _ZenShowMultipleEditorTabsAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.MULTIPLE).negate(), InEditorZenModeContext);
    const title = localize2("showMultipleEditorTabsZenMode", "Show Multiple Editor Tabs in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.MULTIPLE, title, _ZenShowMultipleEditorTabsAction.ID, precondition, localize2("showMultipleEditorTabsZenModeDescription", "Show Tab Bar in Zen Mode"));
  }
};
_ZenShowMultipleEditorTabsAction.ID = "workbench.action.zenShowMultipleEditorTabs";
let ZenShowMultipleEditorTabsAction = _ZenShowMultipleEditorTabsAction;
const _ShowSingleEditorTabAction = class _ShowSingleEditorTabAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.SINGLE).negate(), InEditorZenModeContext.negate());
    const title = localize2("showSingleEditorTab", "Show Single Editor Tab");
    super(LayoutSettings.EDITOR_TABS_MODE, EditorTabsMode.SINGLE, title, _ShowSingleEditorTabAction.ID, precondition, localize2("showSingleEditorTabDescription", "Show Tab Bar with one Tab"));
  }
};
_ShowSingleEditorTabAction.ID = "workbench.action.showEditorTab";
let ShowSingleEditorTabAction = _ShowSingleEditorTabAction;
registerAction2(HideEditorTabsAction);
registerAction2(ShowMultipleEditorTabsAction);
registerAction2(ShowSingleEditorTabAction);
const _ZenShowSingleEditorTabAction = class _ZenShowSingleEditorTabAction extends AbstractSetShowTabsAction {
  constructor() {
    const precondition = ContextKeyExpr.and(ContextKeyExpr.equals(`config.${ZenModeSettings.SHOW_TABS}`, EditorTabsMode.SINGLE).negate(), InEditorZenModeContext);
    const title = localize2("showSingleEditorTabZenMode", "Show Single Editor Tab in Zen Mode");
    super(ZenModeSettings.SHOW_TABS, EditorTabsMode.SINGLE, title, _ZenShowSingleEditorTabAction.ID, precondition, localize2("showSingleEditorTabZenModeDescription", "Show Tab Bar in Zen Mode with one Tab"));
  }
};
_ZenShowSingleEditorTabAction.ID = "workbench.action.zenShowEditorTab";
let ZenShowSingleEditorTabAction = _ZenShowSingleEditorTabAction;
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.EditorTabsBarShowTabsSubmenu,
  title: localize("tabBar", "Tab Bar"),
  group: "3_workbench_layout_move",
  order: 10,
  when: ContextKeyExpr.and(InEditorZenModeContext.negate(), IsSessionsWindowContext.negate())
});
const _EditorActionsTitleBarAction = class _EditorActionsTitleBarAction extends Action2 {
  constructor() {
    super({
      id: _EditorActionsTitleBarAction.ID,
      title: localize2("moveEditorActionsToTitleBar", "Move Editor Actions to Title Bar"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.TITLEBAR).negate(), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("moveEditorActionsToTitleBarDescription", "Move Editor Actions from the tab bar to the title bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.TITLEBAR);
  }
};
_EditorActionsTitleBarAction.ID = "workbench.action.editorActionsTitleBar";
let EditorActionsTitleBarAction = _EditorActionsTitleBarAction;
registerAction2(EditorActionsTitleBarAction);
const _EditorActionsDefaultAction = class _EditorActionsDefaultAction extends Action2 {
  constructor() {
    super({
      id: _EditorActionsDefaultAction.ID,
      title: localize2("moveEditorActionsToTabBar", "Move Editor Actions to Tab Bar"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.DEFAULT).negate(),
        ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE).negate(),
        IsSessionsWindowContext.negate()
      ),
      metadata: { description: localize2("moveEditorActionsToTabBarDescription", "Move Editor Actions from the title bar to the tab bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.DEFAULT);
  }
};
_EditorActionsDefaultAction.ID = "workbench.action.editorActionsDefault";
let EditorActionsDefaultAction = _EditorActionsDefaultAction;
registerAction2(EditorActionsDefaultAction);
const _HideEditorActionsAction = class _HideEditorActionsAction extends Action2 {
  constructor() {
    super({
      id: _HideEditorActionsAction.ID,
      title: localize2("hideEditorActons", "Hide Editor Actions"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.HIDDEN).negate(), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("hideEditorActonsDescription", "Hide Editor Actions in the tab and title bar") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.HIDDEN);
  }
};
_HideEditorActionsAction.ID = "workbench.action.hideEditorActions";
let HideEditorActionsAction = _HideEditorActionsAction;
registerAction2(HideEditorActionsAction);
const _ShowEditorActionsAction = class _ShowEditorActionsAction extends Action2 {
  constructor() {
    super({
      id: _ShowEditorActionsAction.ID,
      title: localize2("showEditorActons", "Show Editor Actions"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.HIDDEN), IsSessionsWindowContext.negate()),
      metadata: { description: localize2("showEditorActonsDescription", "Make Editor Actions visible.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    return configurationService.updateValue(LayoutSettings.EDITOR_ACTIONS_LOCATION, EditorActionsLocation.DEFAULT);
  }
};
_ShowEditorActionsAction.ID = "workbench.action.showEditorActions";
let ShowEditorActionsAction = _ShowEditorActionsAction;
registerAction2(ShowEditorActionsAction);
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.EditorActionsPositionSubmenu,
  title: localize("editorActionsPosition", "Editor Actions Position"),
  group: "3_workbench_layout_move",
  order: 11,
  when: IsSessionsWindowContext.negate()
});
const _ConfigureEditorTabsAction = class _ConfigureEditorTabsAction extends Action2 {
  constructor() {
    super({
      id: _ConfigureEditorTabsAction.ID,
      title: localize2("configureTabs", "Configure Tabs"),
      category: Categories.View
    });
  }
  run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    preferencesService.openSettings({ jsonEditor: false, query: "workbench.editor tab" });
  }
};
_ConfigureEditorTabsAction.ID = "workbench.action.configureEditorTabs";
let ConfigureEditorTabsAction = _ConfigureEditorTabsAction;
registerAction2(ConfigureEditorTabsAction);
const _ConfigureEditorAction = class _ConfigureEditorAction extends Action2 {
  constructor() {
    super({
      id: _ConfigureEditorAction.ID,
      title: localize2("configureEditors", "Configure Editors"),
      category: Categories.View
    });
  }
  run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    preferencesService.openSettings({ jsonEditor: false, query: "workbench.editor" });
  }
};
_ConfigureEditorAction.ID = "workbench.action.configureEditor";
let ConfigureEditorAction = _ConfigureEditorAction;
registerAction2(ConfigureEditorAction);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleSeparatePinnedEditorTabs",
      title: localize2("toggleSeparatePinnedEditorTabs", "Separate Pinned Editor Tabs"),
      category: Categories.View,
      precondition: ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.MULTIPLE),
      metadata: { description: localize2("toggleSeparatePinnedEditorTabsDescription", "Toggle whether pinned editor tabs are shown on a separate row above unpinned tabs.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const oldettingValue = configurationService.getValue("workbench.editor.pinnedTabsOnSeparateRow");
    const newSettingValue = !oldettingValue;
    return configurationService.updateValue("workbench.editor.pinnedTabsOnSeparateRow", newSettingValue);
  }
});
if (isWindows || isLinux || isWeb) {
  registerAction2(class ToggleMenubarAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.toggleMenuBar",
        title: {
          ...localize2("toggleMenuBar", "Toggle Menu Bar"),
          mnemonicTitle: localize({ key: "miMenuBar", comment: ["&& denotes a mnemonic"] }, "Menu &&Bar")
        },
        category: Categories.View,
        f1: true,
        precondition: IsSessionsWindowContext.negate(),
        toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact")),
        menu: [{
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 0,
          when: IsSessionsWindowContext.negate()
        }]
      });
    }
    run(accessor) {
      return accessor.get(IWorkbenchLayoutService).toggleMenuBar();
    }
  });
  for (const menuId of [MenuId.TitleBarContext, MenuId.TitleBarTitleContext]) {
    MenuRegistry.appendMenuItem(menuId, {
      command: {
        id: "workbench.action.toggleMenuBar",
        title: localize("miMenuBarNoMnemonic", "Menu Bar"),
        toggled: ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact"))
      },
      when: ContextKeyExpr.and(IsAuxiliaryWindowFocusedContext.toNegated(), ContextKeyExpr.notEquals(TitleBarStyleContext.key, TitlebarStyle.NATIVE), IsMainWindowFullscreenContext.negate()),
      group: "2_config",
      order: 0
    });
  }
}
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.resetViewLocations",
      title: localize2("resetViewLocations", "Reset View Locations"),
      category: Categories.View,
      f1: true
    });
  }
  run(accessor) {
    return accessor.get(IViewDescriptorService).reset();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.moveView",
      title: localize2("moveView", "Move View"),
      category: Categories.View,
      f1: true
    });
  }
  async run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const instantiationService = accessor.get(IInstantiationService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextKeyService = accessor.get(IContextKeyService);
    const paneCompositePartService = accessor.get(IPaneCompositePartService);
    const focusedViewId = FocusedViewContext.getValue(contextKeyService);
    let viewId;
    if (focusedViewId && viewDescriptorService.getViewDescriptorById(focusedViewId)?.canMoveView) {
      viewId = focusedViewId;
    }
    try {
      viewId = await this.getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId);
      if (!viewId) {
        return;
      }
      const moveFocusedViewAction = new MoveFocusedViewAction();
      instantiationService.invokeFunction((accessor2) => moveFocusedViewAction.run(accessor2, viewId));
    } catch {
    }
  }
  getViewItems(viewDescriptorService, paneCompositePartService) {
    const results = [];
    const viewlets = paneCompositePartService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);
    viewlets.forEach((viewletId) => {
      const container = viewDescriptorService.getViewContainerById(viewletId);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("sidebarContainer", "Side Bar / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    const panels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.Panel);
    panels.forEach((panel) => {
      const container = viewDescriptorService.getViewContainerById(panel);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("panelContainer", "Panel / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    const sidePanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar);
    sidePanels.forEach((panel) => {
      const container = viewDescriptorService.getViewContainerById(panel);
      const containerModel = viewDescriptorService.getViewContainerModel(container);
      let hasAddedView = false;
      containerModel.visibleViewDescriptors.forEach((viewDescriptor) => {
        if (viewDescriptor.canMoveView) {
          if (!hasAddedView) {
            results.push({
              type: "separator",
              label: localize("secondarySideBarContainer", "Secondary Side Bar / {0}", containerModel.title)
            });
            hasAddedView = true;
          }
          results.push({
            id: viewDescriptor.id,
            label: viewDescriptor.name.value
          });
        }
      });
    });
    return results;
  }
  async getView(quickInputService, viewDescriptorService, paneCompositePartService, viewId) {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = localize("moveFocusedView.selectView", "Select a View to Move");
    quickPick.items = this.getViewItems(viewDescriptorService, paneCompositePartService);
    quickPick.selectedItems = quickPick.items.filter((item) => item.id === viewId);
    return new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidAccept(() => {
        const viewId2 = quickPick.selectedItems[0];
        if (viewId2.id) {
          resolve(viewId2.id);
        } else {
          reject();
        }
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        reject();
      }));
      quickPick.show();
    });
  }
});
class MoveFocusedViewAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.moveFocusedView",
      title: localize2("moveFocusedView", "Move Focused View"),
      category: Categories.View,
      precondition: FocusedViewContext.notEqualsTo(""),
      f1: true
    });
  }
  run(accessor, viewId) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const viewsService = accessor.get(IViewsService);
    const quickInputService = accessor.get(IQuickInputService);
    const contextKeyService = accessor.get(IContextKeyService);
    const dialogService = accessor.get(IDialogService);
    const paneCompositePartService = accessor.get(IPaneCompositePartService);
    const focusedViewId = viewId || FocusedViewContext.getValue(contextKeyService);
    if (focusedViewId === void 0 || focusedViewId.trim() === "") {
      dialogService.error(localize("moveFocusedView.error.noFocusedView", "There is no view currently focused."));
      return;
    }
    const viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
    if (!viewDescriptor?.canMoveView) {
      dialogService.error(localize("moveFocusedView.error.nonMovableView", "The currently focused view is not movable."));
      return;
    }
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    quickPick.placeholder = localize("moveFocusedView.selectDestination", "Select a Destination for the View");
    quickPick.title = localize({ key: "moveFocusedView.title", comment: ["{0} indicates the title of the view the user has selected to move."] }, "View: Move {0}", viewDescriptor.name.value);
    const items = [];
    const currentContainer = viewDescriptorService.getViewContainerByViewId(focusedViewId);
    const currentLocation = viewDescriptorService.getViewLocationById(focusedViewId);
    const isViewSolo = viewDescriptorService.getViewContainerModel(currentContainer).allViewDescriptors.length === 1;
    if (!(isViewSolo && currentLocation === ViewContainerLocation.Panel)) {
      items.push({
        id: "_.panel.newcontainer",
        label: localize({ key: "moveFocusedView.newContainerInPanel", comment: ["Creates a new top-level tab in the panel."] }, "New Panel Entry")
      });
    }
    if (!(isViewSolo && currentLocation === ViewContainerLocation.Sidebar)) {
      items.push({
        id: "_.sidebar.newcontainer",
        label: localize("moveFocusedView.newContainerInSidebar", "New Side Bar Entry")
      });
    }
    if (!(isViewSolo && currentLocation === ViewContainerLocation.AuxiliaryBar)) {
      items.push({
        id: "_.auxiliarybar.newcontainer",
        label: localize("moveFocusedView.newContainerInSidePanel", "New Secondary Side Bar Entry")
      });
    }
    items.push({
      type: "separator",
      label: localize("sidebar", "Side Bar")
    });
    const pinnedViewlets = paneCompositePartService.getVisiblePaneCompositeIds(ViewContainerLocation.Sidebar);
    items.push(...pinnedViewlets.filter((viewletId) => {
      if (viewletId === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(viewletId).rejectAddedViews;
    }).map((viewletId) => {
      return {
        id: viewletId,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(viewletId)).title
      };
    }));
    items.push({
      type: "separator",
      label: localize("panel", "Panel")
    });
    const pinnedPanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.Panel);
    items.push(...pinnedPanels.filter((panel) => {
      if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
    }).map((panel) => {
      return {
        id: panel,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
      };
    }));
    items.push({
      type: "separator",
      label: localize("secondarySideBar", "Secondary Side Bar")
    });
    const pinnedAuxPanels = paneCompositePartService.getPinnedPaneCompositeIds(ViewContainerLocation.AuxiliaryBar);
    items.push(...pinnedAuxPanels.filter((panel) => {
      if (panel === viewDescriptorService.getViewContainerByViewId(focusedViewId).id) {
        return false;
      }
      return !viewDescriptorService.getViewContainerById(panel).rejectAddedViews;
    }).map((panel) => {
      return {
        id: panel,
        label: viewDescriptorService.getViewContainerModel(viewDescriptorService.getViewContainerById(panel)).title
      };
    }));
    quickPick.items = items;
    disposables.add(quickPick.onDidAccept(() => {
      const destination = quickPick.selectedItems[0];
      if (destination.id === "_.panel.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.Panel, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id === "_.sidebar.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.Sidebar, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id === "_.auxiliarybar.newcontainer") {
        viewDescriptorService.moveViewToLocation(viewDescriptor, ViewContainerLocation.AuxiliaryBar, this.desc.id);
        viewsService.openView(focusedViewId, true);
      } else if (destination.id) {
        viewDescriptorService.moveViewsToContainer([viewDescriptor], viewDescriptorService.getViewContainerById(destination.id), void 0, this.desc.id);
        viewsService.openView(focusedViewId, true);
      }
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    quickPick.show();
  }
}
registerAction2(MoveFocusedViewAction);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.resetFocusedViewLocation",
      title: localize2("resetFocusedViewLocation", "Reset Focused View Location"),
      category: Categories.View,
      f1: true,
      precondition: FocusedViewContext.notEqualsTo("")
    });
  }
  run(accessor) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const contextKeyService = accessor.get(IContextKeyService);
    const dialogService = accessor.get(IDialogService);
    const viewsService = accessor.get(IViewsService);
    const focusedViewId = FocusedViewContext.getValue(contextKeyService);
    let viewDescriptor = null;
    if (focusedViewId !== void 0 && focusedViewId.trim() !== "") {
      viewDescriptor = viewDescriptorService.getViewDescriptorById(focusedViewId);
    }
    if (!viewDescriptor) {
      dialogService.error(localize("resetFocusedView.error.noFocusedView", "There is no view currently focused."));
      return;
    }
    const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
    if (!defaultContainer || defaultContainer === viewDescriptorService.getViewContainerByViewId(viewDescriptor.id)) {
      return;
    }
    viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, void 0, this.desc.id);
    viewsService.openView(viewDescriptor.id, true);
  }
});
class BaseResizeViewAction extends Action2 {
  // This is a css pixel size
  resizePart(widthChange, heightChange, layoutService, partToResize) {
    if (layoutService.activeContainer !== layoutService.mainContainer) {
      return;
    }
    let part;
    if (partToResize === void 0) {
      const isEditorFocus = layoutService.hasFocus(Parts.EDITOR_PART);
      const isSidebarFocus = layoutService.hasFocus(Parts.SIDEBAR_PART);
      const isPanelFocus = layoutService.hasFocus(Parts.PANEL_PART);
      const isAuxiliaryBarFocus = layoutService.hasFocus(Parts.AUXILIARYBAR_PART);
      if (isSidebarFocus) {
        part = Parts.SIDEBAR_PART;
      } else if (isPanelFocus) {
        part = Parts.PANEL_PART;
      } else if (isEditorFocus) {
        part = Parts.EDITOR_PART;
      } else if (isAuxiliaryBarFocus) {
        part = Parts.AUXILIARYBAR_PART;
      }
    } else {
      part = partToResize;
    }
    if (part) {
      layoutService.resizePart(part, widthChange, heightChange);
    }
  }
}
BaseResizeViewAction.RESIZE_INCREMENT = 60;
class IncreaseViewSizeAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewSize",
      title: localize2("increaseViewSize", "Increase Current View Size"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
  }
}
class IncreaseViewWidthAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewWidth",
      title: localize2("increaseEditorWidth", "Increase Editor Width"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class IncreaseViewHeightAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.increaseViewHeight",
      title: localize2("increaseEditorHeight", "Increase Editor Height"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(0, BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class DecreaseViewSizeAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewSize",
      title: localize2("decreaseViewSize", "Decrease Current View Size"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService));
  }
}
class DecreaseViewWidthAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewWidth",
      title: localize2("decreaseEditorWidth", "Decrease Editor Width"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(-BaseResizeViewAction.RESIZE_INCREMENT, 0, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
class DecreaseViewHeightAction extends BaseResizeViewAction {
  constructor() {
    super({
      id: "workbench.action.decreaseViewHeight",
      title: localize2("decreaseEditorHeight", "Decrease Editor Height"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext.toNegated()
    });
  }
  run(accessor) {
    this.resizePart(0, -BaseResizeViewAction.RESIZE_INCREMENT, accessor.get(IWorkbenchLayoutService), Parts.EDITOR_PART);
  }
}
registerAction2(IncreaseViewSizeAction);
registerAction2(IncreaseViewWidthAction);
registerAction2(IncreaseViewHeightAction);
registerAction2(DecreaseViewSizeAction);
registerAction2(DecreaseViewWidthAction);
registerAction2(DecreaseViewHeightAction);
registerAction2(class AlignQuickInputTopAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.alignQuickInputTop",
      title: localize2("alignQuickInputTop", "Align Quick Input Top"),
      f1: false
    });
  }
  run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.setAlignment("top");
  }
});
registerAction2(class AlignQuickInputCenterAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.alignQuickInputCenter",
      title: localize2("alignQuickInputCenter", "Align Quick Input Center"),
      f1: false
    });
  }
  run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    quickInputService.setAlignment("center");
  }
});
function isContextualLayoutVisualIcon(icon) {
  return icon.iconA !== void 0;
}
const CreateToggleLayoutItem = (id, active, label, visualIcon) => {
  return {
    id,
    active,
    label,
    visualIcon,
    activeIcon: Codicon.eye,
    inactiveIcon: Codicon.eyeClosed,
    activeAriaLabel: localize("selectToHide", "Select to Hide"),
    inactiveAriaLabel: localize("selectToShow", "Select to Show"),
    useButtons: true
  };
};
const CreateOptionLayoutItem = (id, active, label, visualIcon) => {
  return {
    id,
    active,
    label,
    visualIcon,
    activeIcon: Codicon.check,
    activeAriaLabel: localize("active", "Active"),
    useButtons: false
  };
};
const MenuBarToggledContext = ContextKeyExpr.and(IsMacNativeContext.toNegated(), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "hidden"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "toggle"), ContextKeyExpr.notEquals(`config.${MenuSettings.MenuBarVisibility}`, "compact"));
const ToggleVisibilityActions = [];
if (!isMacintosh || !isNative) {
  ToggleVisibilityActions.push(CreateToggleLayoutItem("workbench.action.toggleMenuBar", MenuBarToggledContext, localize("menuBar", "Menu Bar"), menubarIcon));
}
ToggleVisibilityActions.push(...[
  CreateToggleLayoutItem(ToggleActivityBarVisibilityActionId, ContextKeyExpr.notEquals("config.workbench.activityBar.location", "hidden"), localize("activityBar", "Activity Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: activityBarLeftIcon, iconB: activityBarRightIcon }),
  CreateToggleLayoutItem(ToggleSidebarVisibilityAction.ID, SideBarVisibleContext, localize("sideBar", "Primary Side Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: panelLeftIcon, iconB: panelRightIcon }),
  CreateToggleLayoutItem(ToggleAuxiliaryBarAction.ID, AuxiliaryBarVisibleContext, localize("secondarySideBar", "Secondary Side Bar"), { whenA: ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), iconA: panelRightIcon, iconB: panelLeftIcon }),
  CreateToggleLayoutItem(TogglePanelAction.ID, PanelVisibleContext, localize("panel", "Panel"), panelIcon),
  CreateToggleLayoutItem(ToggleStatusbarVisibilityAction.ID, ContextKeyExpr.equals("config.workbench.statusBar.visible", true), localize("statusBar", "Status Bar"), statusBarIcon)
]);
const MoveSideBarActions = [
  CreateOptionLayoutItem(MoveSidebarLeftAction.ID, ContextKeyExpr.equals("config.workbench.sideBar.location", "left"), localize("leftSideBar", "Left"), panelLeftIcon),
  CreateOptionLayoutItem(MoveSidebarRightAction.ID, ContextKeyExpr.equals("config.workbench.sideBar.location", "right"), localize("rightSideBar", "Right"), panelRightIcon)
];
const AlignPanelActions = [
  CreateOptionLayoutItem("workbench.action.alignPanelLeft", PanelAlignmentContext.isEqualTo("left"), localize("leftPanel", "Left"), panelAlignmentLeftIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelRight", PanelAlignmentContext.isEqualTo("right"), localize("rightPanel", "Right"), panelAlignmentRightIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelCenter", PanelAlignmentContext.isEqualTo("center"), localize("centerPanel", "Center"), panelAlignmentCenterIcon),
  CreateOptionLayoutItem("workbench.action.alignPanelJustify", PanelAlignmentContext.isEqualTo("justify"), localize("justifyPanel", "Justify"), panelAlignmentJustifyIcon)
];
const QuickInputActions = [
  CreateOptionLayoutItem("workbench.action.alignQuickInputTop", QuickInputAlignmentContextKey.isEqualTo("top"), localize("top", "Top"), quickInputAlignmentTopIcon),
  CreateOptionLayoutItem("workbench.action.alignQuickInputCenter", QuickInputAlignmentContextKey.isEqualTo("center"), localize("center", "Center"), quickInputAlignmentCenterIcon)
];
const MiscLayoutOptions = [
  CreateOptionLayoutItem("workbench.action.toggleFullScreen", IsMainWindowFullscreenContext, localize("fullscreen", "Full Screen"), fullscreenIcon),
  CreateOptionLayoutItem("workbench.action.toggleZenMode", InEditorZenModeContext, localize("zenMode", "Zen Mode"), zenModeIcon),
  CreateOptionLayoutItem("workbench.action.toggleCenteredLayout", IsMainEditorCenteredLayoutContext, localize("centeredLayout", "Centered Layout"), centerLayoutIcon)
];
const LayoutContextKeySet = /* @__PURE__ */ new Set();
for (const { active } of [...ToggleVisibilityActions, ...MoveSideBarActions, ...AlignPanelActions, ...QuickInputActions, ...MiscLayoutOptions]) {
  for (const key of active.keys()) {
    LayoutContextKeySet.add(key);
  }
}
const EditorActionsInTitleBar = ContextKeyExpr.or(
  ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.TITLEBAR),
  ContextKeyExpr.and(
    ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_ACTIONS_LOCATION}`, EditorActionsLocation.DEFAULT),
    ContextKeyExpr.equals(`config.${LayoutSettings.EDITOR_TABS_MODE}`, EditorTabsMode.NONE)
  )
);
registerAction2(class CustomizeLayoutAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.customizeLayout",
      title: localize2("customizeLayout", "Customize Layout..."),
      f1: true,
      icon: configureLayoutIcon,
      menu: [
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "z_end"
        },
        {
          id: MenuId.LayoutControlMenu,
          when: ContextKeyExpr.and(
            IsAuxiliaryWindowContext.toNegated(),
            ContextKeyExpr.equals("config.workbench.layoutControl.type", "both"),
            EditorActionsInTitleBar.negate()
          ),
          group: "navigation"
        },
        {
          id: MenuId.LayoutControlMenu,
          when: ContextKeyExpr.and(
            IsAuxiliaryWindowContext.toNegated(),
            ContextKeyExpr.equals("config.workbench.layoutControl.type", "both"),
            EditorActionsInTitleBar
          ),
          group: "1_layout"
        }
      ]
    });
  }
  getItems(contextKeyService, keybindingService) {
    const toQuickPickItem = (item) => {
      const toggled = item.active.evaluate(contextKeyService.getContext(null));
      let label = item.useButtons ? item.label : item.label + (toggled && item.activeIcon ? ` $(${item.activeIcon.id})` : !toggled && item.inactiveIcon ? ` $(${item.inactiveIcon.id})` : "");
      const ariaLabel = item.label + (toggled && item.activeAriaLabel ? ` (${item.activeAriaLabel})` : !toggled && item.inactiveAriaLabel ? ` (${item.inactiveAriaLabel})` : "");
      if (item.visualIcon) {
        let icon2 = item.visualIcon;
        if (isContextualLayoutVisualIcon(icon2)) {
          const useIconA = icon2.whenA.evaluate(contextKeyService.getContext(null));
          icon2 = useIconA ? icon2.iconA : icon2.iconB;
        }
        label = `$(${icon2.id}) ${label}`;
      }
      const icon = toggled ? item.activeIcon : item.inactiveIcon;
      return {
        type: "item",
        id: item.id,
        label,
        ariaLabel,
        keybinding: keybindingService.lookupKeybinding(item.id, contextKeyService),
        buttons: !item.useButtons ? void 0 : [
          {
            alwaysVisible: false,
            tooltip: ariaLabel,
            iconClass: icon ? ThemeIcon.asClassName(icon) : void 0
          }
        ]
      };
    };
    return [
      {
        type: "separator",
        label: localize("toggleVisibility", "Visibility")
      },
      ...ToggleVisibilityActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("sideBarPosition", "Primary Side Bar Position")
      },
      ...MoveSideBarActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("panelAlignment", "Panel Alignment")
      },
      ...AlignPanelActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("quickOpen", "Quick Input Position")
      },
      ...QuickInputActions.map(toQuickPickItem),
      {
        type: "separator",
        label: localize("layoutModes", "Modes")
      },
      ...MiscLayoutOptions.map(toQuickPickItem)
    ];
  }
  run(accessor) {
    if (this._currentQuickPick) {
      this._currentQuickPick.hide();
      return;
    }
    const configurationService = accessor.get(IConfigurationService);
    const contextKeyService = accessor.get(IContextKeyService);
    const commandService = accessor.get(ICommandService);
    const quickInputService = accessor.get(IQuickInputService);
    const keybindingService = accessor.get(IKeybindingService);
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick({ useSeparators: true }));
    this._currentQuickPick = quickPick;
    quickPick.items = this.getItems(contextKeyService, keybindingService);
    quickPick.ignoreFocusOut = true;
    quickPick.hideInput = true;
    quickPick.title = localize("customizeLayoutQuickPickTitle", "Customize Layout");
    const closeButton = {
      alwaysVisible: true,
      iconClass: ThemeIcon.asClassName(Codicon.close),
      tooltip: localize("close", "Close")
    };
    const resetButton = {
      alwaysVisible: true,
      iconClass: ThemeIcon.asClassName(Codicon.discard),
      tooltip: localize("restore defaults", "Restore Defaults")
    };
    quickPick.buttons = [
      resetButton,
      closeButton
    ];
    let selectedItem = void 0;
    disposables.add(contextKeyService.onDidChangeContext((changeEvent) => {
      if (changeEvent.affectsSome(LayoutContextKeySet)) {
        quickPick.items = this.getItems(contextKeyService, keybindingService);
        if (selectedItem) {
          quickPick.activeItems = quickPick.items.filter((item) => item.id === selectedItem?.id);
        }
        setTimeout(() => quickInputService.focus(), 0);
      }
    }));
    disposables.add(quickPick.onDidAccept((event) => {
      if (quickPick.selectedItems.length) {
        selectedItem = quickPick.selectedItems[0];
        commandService.executeCommand(selectedItem.id);
      }
    }));
    disposables.add(quickPick.onDidTriggerItemButton((event) => {
      if (event.item) {
        selectedItem = event.item;
        commandService.executeCommand(selectedItem.id);
      }
    }));
    disposables.add(quickPick.onDidTriggerButton((button) => {
      if (button === closeButton) {
        quickPick.hide();
      } else if (button === resetButton) {
        const resetSetting = (id) => {
          const config = configurationService.inspect(id);
          configurationService.updateValue(id, config.defaultValue);
        };
        resetSetting("workbench.activityBar.location");
        resetSetting("workbench.sideBar.location");
        resetSetting("workbench.statusBar.visible");
        resetSetting("workbench.panel.defaultLocation");
        if (!isMacintosh || !isNative) {
          resetSetting("window.menuBarVisibility");
        }
        commandService.executeCommand("workbench.action.alignPanelCenter");
        commandService.executeCommand("workbench.action.alignQuickInputTop");
      }
    }));
    disposables.add(quickPick.onDidHide(() => {
      quickPick.dispose();
    }));
    disposables.add(quickPick.onDispose(() => {
      this._currentQuickPick = void 0;
      disposables.dispose();
    }));
    quickPick.show();
  }
});
export {
  AbstractSetShowTabsAction,
  ConfigureEditorAction,
  ConfigureEditorTabsAction,
  EditorActionsDefaultAction,
  EditorActionsTitleBarAction,
  HideEditorActionsAction,
  HideEditorTabsAction,
  ShowEditorActionsAction,
  ShowMultipleEditorTabsAction,
  ShowSingleEditorTabAction,
  ToggleActivityBarVisibilityActionId,
  ToggleSidebarPositionAction,
  ToggleSidebarVisibilityAction,
  ToggleStatusbarVisibilityAction,
  ZenHideEditorTabsAction,
  ZenShowMultipleEditorTabsAction,
  ZenShowSingleEditorTabAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvbGF5b3V0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcsIGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb25zTG9jYXRpb24sIEVkaXRvclRhYnNNb2RlLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgTGF5b3V0U2V0dGluZ3MsIFBhcnRzLCBQb3NpdGlvbiwgWmVuTW9kZVNldHRpbmdzLCBwb3NpdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgaXNMaW51eCwgaXNXZWIsIGlzTWFjaW50b3NoLCBpc05hdGl2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElzTWFjTmF0aXZlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3RGVzY3JpcHRvciwgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciwgSVF1aWNrUGljayB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBUb2dnbGVBdXhpbGlhcnlCYXJBY3Rpb24gfSBmcm9tICcuLi9wYXJ0cy9hdXhpbGlhcnliYXIvYXV4aWxpYXJ5QmFyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUb2dnbGVQYW5lbEFjdGlvbiB9IGZyb20gJy4uL3BhcnRzL3BhbmVsL3BhbmVsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQXV4aWxpYXJ5QmFyVmlzaWJsZUNvbnRleHQsIFBhbmVsQWxpZ25tZW50Q29udGV4dCwgUGFuZWxWaXNpYmxlQ29udGV4dCwgU2lkZUJhclZpc2libGVDb250ZXh0LCBGb2N1c2VkVmlld0NvbnRleHQsIEluRWRpdG9yWmVuTW9kZUNvbnRleHQsIElzTWFpbkVkaXRvckNlbnRlcmVkTGF5b3V0Q29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCwgSXNNYWluV2luZG93RnVsbHNjcmVlbkNvbnRleHQsIFBhbmVsUG9zaXRpb25Db250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgVGl0bGVCYXJTdHlsZUNvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uVGl0bGUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1lbnVTZXR0aW5ncywgVGl0bGViYXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5cbi8vIFJlZ2lzdGVyIEljb25zXG5jb25zdCBtZW51YmFySWNvbiA9IHJlZ2lzdGVySWNvbignbWVudUJhcicsIENvZGljb24ubGF5b3V0TWVudWJhciwgbG9jYWxpemUoJ21lbnVCYXJJY29uJywgXCJSZXByZXNlbnRzIHRoZSBtZW51IGJhclwiKSk7XG5jb25zdCBhY3Rpdml0eUJhckxlZnRJY29uID0gcmVnaXN0ZXJJY29uKCdhY3Rpdml0eS1iYXItbGVmdCcsIENvZGljb24ubGF5b3V0QWN0aXZpdHliYXJMZWZ0LCBsb2NhbGl6ZSgnYWN0aXZpdHlCYXJMZWZ0JywgXCJSZXByZXNlbnRzIHRoZSBhY3Rpdml0eSBiYXIgaW4gdGhlIGxlZnQgcG9zaXRpb25cIikpO1xuY29uc3QgYWN0aXZpdHlCYXJSaWdodEljb24gPSByZWdpc3Rlckljb24oJ2FjdGl2aXR5LWJhci1yaWdodCcsIENvZGljb24ubGF5b3V0QWN0aXZpdHliYXJSaWdodCwgbG9jYWxpemUoJ2FjdGl2aXR5QmFyUmlnaHQnLCBcIlJlcHJlc2VudHMgdGhlIGFjdGl2aXR5IGJhciBpbiB0aGUgcmlnaHQgcG9zaXRpb25cIikpO1xuY29uc3QgcGFuZWxMZWZ0SWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtbGVmdCcsIENvZGljb24ubGF5b3V0U2lkZWJhckxlZnQsIGxvY2FsaXplKCdwYW5lbExlZnQnLCBcIlJlcHJlc2VudHMgYSBzaWRlIGJhciBpbiB0aGUgbGVmdCBwb3NpdGlvblwiKSk7XG5jb25zdCBwYW5lbExlZnRPZmZJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1sZWZ0LW9mZicsIENvZGljb24ubGF5b3V0U2lkZWJhckxlZnRPZmYsIGxvY2FsaXplKCdwYW5lbExlZnRPZmYnLCBcIlJlcHJlc2VudHMgYSBzaWRlIGJhciBpbiB0aGUgbGVmdCBwb3NpdGlvbiB0b2dnbGVkIG9mZlwiKSk7XG5jb25zdCBwYW5lbFJpZ2h0SWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtcmlnaHQnLCBDb2RpY29uLmxheW91dFNpZGViYXJSaWdodCwgbG9jYWxpemUoJ3BhbmVsUmlnaHQnLCBcIlJlcHJlc2VudHMgc2lkZSBiYXIgaW4gdGhlIHJpZ2h0IHBvc2l0aW9uXCIpKTtcbmNvbnN0IHBhbmVsUmlnaHRPZmZJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1yaWdodC1vZmYnLCBDb2RpY29uLmxheW91dFNpZGViYXJSaWdodE9mZiwgbG9jYWxpemUoJ3BhbmVsUmlnaHRPZmYnLCBcIlJlcHJlc2VudHMgc2lkZSBiYXIgaW4gdGhlIHJpZ2h0IHBvc2l0aW9uIHRvZ2dsZWQgb2ZmXCIpKTtcbmNvbnN0IHBhbmVsSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtYm90dG9tJywgQ29kaWNvbi5sYXlvdXRQYW5lbCwgbG9jYWxpemUoJ3BhbmVsQm90dG9tJywgXCJSZXByZXNlbnRzIHRoZSBib3R0b20gcGFuZWxcIikpO1xuY29uc3Qgc3RhdHVzQmFySWNvbiA9IHJlZ2lzdGVySWNvbignc3RhdHVzQmFyJywgQ29kaWNvbi5sYXlvdXRTdGF0dXNiYXIsIGxvY2FsaXplKCdzdGF0dXNCYXJJY29uJywgXCJSZXByZXNlbnRzIHRoZSBzdGF0dXMgYmFyXCIpKTtcblxuY29uc3QgcGFuZWxBbGlnbm1lbnRMZWZ0SWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtYWxpZ24tbGVmdCcsIENvZGljb24ubGF5b3V0UGFuZWxMZWZ0LCBsb2NhbGl6ZSgncGFuZWxCb3R0b21MZWZ0JywgXCJSZXByZXNlbnRzIHRoZSBib3R0b20gcGFuZWwgYWxpZ25tZW50IHNldCB0byB0aGUgbGVmdFwiKSk7XG5jb25zdCBwYW5lbEFsaWdubWVudFJpZ2h0SWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtYWxpZ24tcmlnaHQnLCBDb2RpY29uLmxheW91dFBhbmVsUmlnaHQsIGxvY2FsaXplKCdwYW5lbEJvdHRvbVJpZ2h0JywgXCJSZXByZXNlbnRzIHRoZSBib3R0b20gcGFuZWwgYWxpZ25tZW50IHNldCB0byB0aGUgcmlnaHRcIikpO1xuY29uc3QgcGFuZWxBbGlnbm1lbnRDZW50ZXJJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1hbGlnbi1jZW50ZXInLCBDb2RpY29uLmxheW91dFBhbmVsQ2VudGVyLCBsb2NhbGl6ZSgncGFuZWxCb3R0b21DZW50ZXInLCBcIlJlcHJlc2VudHMgdGhlIGJvdHRvbSBwYW5lbCBhbGlnbm1lbnQgc2V0IHRvIHRoZSBjZW50ZXJcIikpO1xuY29uc3QgcGFuZWxBbGlnbm1lbnRKdXN0aWZ5SWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtYWxpZ24tanVzdGlmeScsIENvZGljb24ubGF5b3V0UGFuZWxKdXN0aWZ5LCBsb2NhbGl6ZSgncGFuZWxCb3R0b21KdXN0aWZ5JywgXCJSZXByZXNlbnRzIHRoZSBib3R0b20gcGFuZWwgYWxpZ25tZW50IHNldCB0byBqdXN0aWZpZWRcIikpO1xuXG5jb25zdCBxdWlja0lucHV0QWxpZ25tZW50VG9wSWNvbiA9IHJlZ2lzdGVySWNvbigncXVpY2tJbnB1dEFsaWdubWVudFRvcCcsIENvZGljb24uYXJyb3dVcCwgbG9jYWxpemUoJ3F1aWNrSW5wdXRBbGlnbm1lbnRUb3AnLCBcIlJlcHJlc2VudHMgcXVpY2sgaW5wdXQgYWxpZ25tZW50IHNldCB0byB0aGUgdG9wXCIpKTtcbmNvbnN0IHF1aWNrSW5wdXRBbGlnbm1lbnRDZW50ZXJJY29uID0gcmVnaXN0ZXJJY29uKCdxdWlja0lucHV0QWxpZ25tZW50Q2VudGVyJywgQ29kaWNvbi5jaXJjbGUsIGxvY2FsaXplKCdxdWlja0lucHV0QWxpZ25tZW50Q2VudGVyJywgXCJSZXByZXNlbnRzIHF1aWNrIGlucHV0IGFsaWdubWVudCBzZXQgdG8gdGhlIGNlbnRlclwiKSk7XG5cbmNvbnN0IGZ1bGxzY3JlZW5JY29uID0gcmVnaXN0ZXJJY29uKCdmdWxsc2NyZWVuJywgQ29kaWNvbi5zY3JlZW5GdWxsLCBsb2NhbGl6ZSgnZnVsbFNjcmVlbkljb24nLCBcIlJlcHJlc2VudHMgZnVsbCBzY3JlZW5cIikpO1xuY29uc3QgY2VudGVyTGF5b3V0SWNvbiA9IHJlZ2lzdGVySWNvbignY2VudGVyTGF5b3V0SWNvbicsIENvZGljb24ubGF5b3V0Q2VudGVyZWQsIGxvY2FsaXplKCdjZW50ZXJMYXlvdXRJY29uJywgXCJSZXByZXNlbnRzIGNlbnRlcmVkIGxheW91dCBtb2RlXCIpKTtcbmNvbnN0IHplbk1vZGVJY29uID0gcmVnaXN0ZXJJY29uKCd6ZW5Nb2RlJywgQ29kaWNvbi50YXJnZXQsIGxvY2FsaXplKCd6ZW5Nb2RlSWNvbicsIFwiUmVwcmVzZW50cyB6ZW4gbW9kZVwiKSk7XG5cbmV4cG9ydCBjb25zdCBUb2dnbGVBY3Rpdml0eUJhclZpc2liaWxpdHlBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUFjdGl2aXR5QmFyVmlzaWJpbGl0eSc7XG5cbi8vIC0tLSBUb2dnbGUgQ2VudGVyZWQgTGF5b3V0XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVDZW50ZXJlZExheW91dCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3RvZ2dsZUNlbnRlcmVkTGF5b3V0JywgXCJUb2dnbGUgQ2VudGVyZWQgTGF5b3V0XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVG9nZ2xlQ2VudGVyZWRMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDZW50ZXJlZCBMYXlvdXRcIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0dG9nZ2xlZDogSXNNYWluRWRpdG9yQ2VudGVyZWRMYXlvdXRDb250ZXh0LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnMV90b2dnbGVfdmlldycsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRsYXlvdXRTZXJ2aWNlLmNlbnRlck1haW5FZGl0b3JMYXlvdXQoIWxheW91dFNlcnZpY2UuaXNNYWluRWRpdG9yTGF5b3V0Q2VudGVyZWQoKSk7XG5cdFx0ZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdH1cbn0pO1xuXG4vLyAtLS0gU2V0IFNpZGViYXIgUG9zaXRpb25cbmNvbnN0IHNpZGViYXJQb3NpdGlvbkNvbmZpZ3VyYXRpb25LZXkgPSAnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nO1xuXG5jbGFzcyBNb3ZlU2lkZWJhclBvc2l0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHRpdGxlOiBJQ29tbWFuZEFjdGlvblRpdGxlLCBwcml2YXRlIHJlYWRvbmx5IHBvc2l0aW9uOiBQb3NpdGlvbikge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCk7XG5cdFx0aWYgKHBvc2l0aW9uICE9PSB0aGlzLnBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2lkZWJhclBvc2l0aW9uQ29uZmlndXJhdGlvbktleSwgcG9zaXRpb25Ub1N0cmluZyh0aGlzLnBvc2l0aW9uKSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE1vdmVTaWRlYmFyUmlnaHRBY3Rpb24gZXh0ZW5kcyBNb3ZlU2lkZWJhclBvc2l0aW9uQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVNpZGVCYXJSaWdodCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoTW92ZVNpZGViYXJSaWdodEFjdGlvbi5JRCwgbG9jYWxpemUyKCdtb3ZlU2lkZWJhclJpZ2h0JywgXCJNb3ZlIFByaW1hcnkgU2lkZSBCYXIgUmlnaHRcIiksIFBvc2l0aW9uLlJJR0hUKTtcblx0fVxufVxuXG5jbGFzcyBNb3ZlU2lkZWJhckxlZnRBY3Rpb24gZXh0ZW5kcyBNb3ZlU2lkZWJhclBvc2l0aW9uQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVNpZGVCYXJMZWZ0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihNb3ZlU2lkZWJhckxlZnRBY3Rpb24uSUQsIGxvY2FsaXplMignbW92ZVNpZGViYXJMZWZ0JywgXCJNb3ZlIFByaW1hcnkgU2lkZSBCYXIgTGVmdFwiKSwgUG9zaXRpb24uTEVGVCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE1vdmVTaWRlYmFyUmlnaHRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVTaWRlYmFyTGVmdEFjdGlvbik7XG5cbi8vIC0tLSBUb2dnbGUgU2lkZWJhciBQb3NpdGlvblxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU2lkZWJhclBvc2l0aW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ3RvZ2dsZVNpZGViYXJQb3NpdGlvbicsIFwiVG9nZ2xlIFByaW1hcnkgU2lkZSBCYXIgUG9zaXRpb25cIik7XG5cblx0c3RhdGljIGdldExhYmVsKGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IGxvY2FsaXplKCdtb3ZlU2lkZWJhclJpZ2h0JywgXCJNb3ZlIFByaW1hcnkgU2lkZSBCYXIgUmlnaHRcIikgOiBsb2NhbGl6ZSgnbW92ZVNpZGViYXJMZWZ0JywgXCJNb3ZlIFByaW1hcnkgU2lkZSBCYXIgTGVmdFwiKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVTaWRlYmFyUG9zaXRpb24nLCBcIlRvZ2dsZSBQcmltYXJ5IFNpZGUgQmFyIFBvc2l0aW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gbGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKTtcblx0XHRjb25zdCBuZXdQb3NpdGlvblZhbHVlID0gKHBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUKSA/ICdyaWdodCcgOiAnbGVmdCc7XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2lkZWJhclBvc2l0aW9uQ29uZmlndXJhdGlvbktleSwgbmV3UG9zaXRpb25WYWx1ZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbik7XG5cbmNvbnN0IGNvbmZpZ3VyZUxheW91dEljb24gPSByZWdpc3Rlckljb24oJ2NvbmZpZ3VyZS1sYXlvdXQtaWNvbicsIENvZGljb24ubGF5b3V0LCBsb2NhbGl6ZSgnY29maWd1cmVMYXlvdXRJY29uJywgJ0ljb24gcmVwcmVzZW50cyB3b3JrYmVuY2ggbGF5b3V0IGNvbmZpZ3VyYXRpb24uJykpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSwge1xuXHRzdWJtZW51OiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnVTdWJtZW51LFxuXHR0aXRsZTogbG9jYWxpemUoJ2NvbmZpZ3VyZUxheW91dCcsIFwiQ29uZmlndXJlIExheW91dFwiKSxcblx0aWNvbjogY29uZmlndXJlTGF5b3V0SWNvbixcblx0Z3JvdXA6ICcxX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAnbWVudScpXG5cdClcbn0pO1xuXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbXMoW3tcblx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGVDb250ZXh0LFxuXHRpdGVtOiB7XG5cdFx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbW92ZSBzaWRlIGJhciByaWdodCcsIFwiTW92ZSBQcmltYXJ5IFNpZGUgQmFyIFJpZ2h0XCIpXG5cdFx0fSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAncmlnaHQnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Q29udGFpbmVyTG9jYXRpb24nLCBWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikpKSxcblx0XHRvcmRlcjogMVxuXHR9XG59LCB7XG5cdGlkOiBNZW51SWQuVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCxcblx0aXRlbToge1xuXHRcdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRcdGNvbW1hbmQ6IHtcblx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21vdmUgc2lkZWJhciBsZWZ0JywgXCJNb3ZlIFByaW1hcnkgU2lkZSBCYXIgTGVmdFwiKVxuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lckxvY2F0aW9uJywgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpKSksXG5cdFx0b3JkZXI6IDFcblx0fVxufSwge1xuXHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZUNvbnRleHQsXG5cdGl0ZW06IHtcblx0XHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtb3ZlIHNlY29uZCBzaWRlYmFyIGxlZnQnLCBcIk1vdmUgU2Vjb25kYXJ5IFNpZGUgQmFyIExlZnRcIilcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXJMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpKSksXG5cdFx0b3JkZXI6IDFcblx0fVxufSwge1xuXHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZUNvbnRleHQsXG5cdGl0ZW06IHtcblx0XHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogVG9nZ2xlU2lkZWJhclBvc2l0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtb3ZlIHNlY29uZCBzaWRlYmFyIHJpZ2h0JywgXCJNb3ZlIFNlY29uZGFyeSBTaWRlIEJhciBSaWdodFwiKVxuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lckxvY2F0aW9uJywgVmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikpKSxcblx0XHRvcmRlcjogMVxuXHR9XG59XSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LCB7XG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFRvZ2dsZVNpZGViYXJQb3NpdGlvbkFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU1vdmVTaWRlYmFyUmlnaHQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZNb3ZlIFByaW1hcnkgU2lkZSBCYXIgUmlnaHRcIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpKSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUb2dnbGVTaWRlYmFyUG9zaXRpb25BY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlNb3ZlU2lkZWJhckxlZnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZNb3ZlIFByaW1hcnkgU2lkZSBCYXIgTGVmdFwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAncmlnaHQnKSwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCkpLFxuXHRvcmRlcjogMlxufSk7XG5cbi8vIC0tLSBUb2dnbGUgRWRpdG9yIFZpc2liaWxpdHlcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUVkaXRvclZpc2liaWxpdHknLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVFZGl0b3InLCBcIlRvZ2dsZSBFZGl0b3IgQXJlYSBWaXNpYmlsaXR5XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU2hvd0VkaXRvckFyZWEnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU2hvdyAmJkVkaXRvciBBcmVhXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHRvZ2dsZWQ6IE1haW5FZGl0b3JBcmVhVmlzaWJsZUNvbnRleHQsXG5cdFx0XHQvLyB0aGUgd29ya2JlbmNoIGdyaWQgY3VycmVudGx5IHByZXZlbnRzIHVzIGZyb20gc3VwcG9ydGluZyBwYW5lbCBtYXhpbWl6YXRpb24gd2l0aCBub24tY2VudGVyIHBhbmVsIGFsaWdubWVudFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgQ29udGV4dEtleUV4cHIub3IoUGFuZWxBbGlnbm1lbnRDb250ZXh0LmlzRXF1YWxUbygnY2VudGVyJyksIFBhbmVsUG9zaXRpb25Db250ZXh0Lm5vdEVxdWFsc1RvKCdib3R0b20nKSkpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJWaWV3TWVudSwge1xuXHRncm91cDogJzJfYXBwZWFyYW5jZScsXG5cdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQXBwZWFyYW5jZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFwcGVhcmFuY2VcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRvcmRlcjogMVxufSk7XG5cbi8vIFRvZ2dsZSBTaWRlYmFyIFZpc2liaWxpdHlcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU2lkZWJhclZpc2liaWxpdHknO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnY29tcG9zaXRlUGFydC5oaWRlU2lkZUJhckxhYmVsJywgXCJIaWRlIFByaW1hcnkgU2lkZSBCYXJcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU2lkZWJhcicsICdUb2dnbGUgUHJpbWFyeSBTaWRlIEJhciBWaXNpYmlsaXR5JyksXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogU2lkZUJhclZpc2libGVDb250ZXh0LFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3ByaW1hcnkgc2lkZWJhcicsIFwiUHJpbWFyeSBTaWRlIEJhclwiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdwcmltYXJ5IHNpZGViYXIgbW5lbW9uaWMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmltYXJ5IFNpZGUgQmFyXCIpLFxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnb3BlbkFuZENsb3NlU2lkZWJhcicsICdPcGVuL1Nob3cgYW5kIENsb3NlL0hpZGUgU2lkZWJhcicpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlCXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudVN1Ym1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcwX3dvcmtiZW5jaF9sYXlvdXQnLFxuXHRcdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0XHRncm91cDogJzJfd29ya2JlbmNoX2xheW91dCcsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgaXNDdXJyZW50bHlWaXNpYmxlID0gbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU0lERUJBUl9QQVJUKTtcblxuXHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihpc0N1cnJlbnRseVZpc2libGUsIFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cblx0XHQvLyBBbm5vdW5jZSB2aXNpYmlsaXR5IGNoYW5nZSB0byBzY3JlZW4gcmVhZGVyc1xuXHRcdGNvbnN0IGFsZXJ0TWVzc2FnZSA9IGlzQ3VycmVudGx5VmlzaWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnc2lkZWJhckhpZGRlbicsIFwiUHJpbWFyeSBTaWRlIEJhciBoaWRkZW5cIilcblx0XHRcdDogbG9jYWxpemUoJ3NpZGViYXJWaXNpYmxlJywgXCJQcmltYXJ5IFNpZGUgQmFyIHNob3duXCIpO1xuXHRcdGFsZXJ0KGFsZXJ0TWVzc2FnZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZVNpZGViYXJWaXNpYmlsaXR5QWN0aW9uKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhbXG5cdHtcblx0XHRpZDogTWVudUlkLlZpZXdDb250YWluZXJUaXRsZUNvbnRleHQsXG5cdFx0aXRlbToge1xuXHRcdFx0Z3JvdXA6ICczX3dvcmtiZW5jaF9sYXlvdXRfbW92ZScsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb21wb3NpdGVQYXJ0LmhpZGVTaWRlQmFyTGFiZWwnLCBcIkhpZGUgUHJpbWFyeSBTaWRlIEJhclwiKSxcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2lkZUJhclZpc2libGVDb250ZXh0LCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXdDb250YWluZXJMb2NhdGlvbicsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSkpLFxuXHRcdFx0b3JkZXI6IDJcblx0XHR9XG5cdH0sIHtcblx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdGl0ZW06IHtcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVTaWRlQmFyJywgXCJUb2dnbGUgUHJpbWFyeSBTaWRlIEJhclwiKSxcblx0XHRcdFx0aWNvbjogcGFuZWxMZWZ0T2ZmSWNvbixcblx0XHRcdFx0dG9nZ2xlZDogeyBjb25kaXRpb246IFNpZGVCYXJWaXNpYmxlQ29udGV4dCwgaWNvbjogcGFuZWxMZWZ0SWNvbiB9XG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAndG9nZ2xlcycpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAnYm90aCcpKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAnbGVmdCcpXG5cdFx0XHQpLFxuXHRcdFx0b3JkZXI6IDBcblx0XHR9XG5cdH0sIHtcblx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdGl0ZW06IHtcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUb2dnbGVTaWRlYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVTaWRlQmFyJywgXCJUb2dnbGUgUHJpbWFyeSBTaWRlIEJhclwiKSxcblx0XHRcdFx0aWNvbjogcGFuZWxSaWdodE9mZkljb24sXG5cdFx0XHRcdHRvZ2dsZWQ6IHsgY29uZGl0aW9uOiBTaWRlQmFyVmlzaWJsZUNvbnRleHQsIGljb246IHBhbmVsUmlnaHRJY29uIH1cblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZScsICd0b2dnbGVzJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZScsICdib3RoJykpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdyaWdodCcpXG5cdFx0XHQpLFxuXHRcdFx0b3JkZXI6IDJcblx0XHR9XG5cdH1cbl0pO1xuXG4vLyAtLS0gVG9nZ2xlIFN0YXR1c2JhciBWaXNpYmlsaXR5XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU3RhdHVzYmFyVmlzaWJpbGl0eSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc3RhdHVzYmFyVmlzaWJsZUtleSA9ICd3b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVTdGF0dXNiYXInLCBcIlRvZ2dsZSBTdGF0dXMgQmFyIFZpc2liaWxpdHlcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTdGF0dXNiYXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiUyYmdGF0dXMgQmFyXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUnLCB0cnVlKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzJfd29ya2JlbmNoX2xheW91dCcsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpO1xuXHRcdGNvbnN0IG5ld1Zpc2liaWxpdHlWYWx1ZSA9ICF2aXNpYmlsaXR5O1xuXG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRvZ2dsZVN0YXR1c2JhclZpc2liaWxpdHlBY3Rpb24uc3RhdHVzYmFyVmlzaWJsZUtleSwgbmV3VmlzaWJpbGl0eVZhbHVlKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlU3RhdHVzYmFyVmlzaWJpbGl0eUFjdGlvbik7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0gRWRpdG9yIFRhYnMgTGF5b3V0IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFNldFNob3dUYWJzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzZXR0aW5nTmFtZTogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IHZhbHVlOiBzdHJpbmcsIHRpdGxlOiBJQ29tbWFuZEFjdGlvblRpdGxlLCBpZDogc3RyaW5nLCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQocHJlY29uZGl0aW9uLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YTogZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodGhpcy5zZXR0aW5nTmFtZSwgdGhpcy52YWx1ZSk7XG5cdH1cbn1cblxuLy8gLS0tIEhpZGUgRWRpdG9yIFRhYnNcblxuZXhwb3J0IGNsYXNzIEhpZGVFZGl0b3JUYWJzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uaGlkZUVkaXRvclRhYnMnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuTk9ORSkubmVnYXRlKCksIEluRWRpdG9yWmVuTW9kZUNvbnRleHQubmVnYXRlKCkpITtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMignaGlkZUVkaXRvclRhYnMnLCAnSGlkZSBFZGl0b3IgVGFicycpO1xuXHRcdHN1cGVyKExheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREUsIEVkaXRvclRhYnNNb2RlLk5PTkUsIHRpdGxlLCBIaWRlRWRpdG9yVGFic0FjdGlvbi5JRCwgcHJlY29uZGl0aW9uLCBsb2NhbGl6ZTIoJ2hpZGVFZGl0b3JUYWJzRGVzY3JpcHRpb24nLCBcIkhpZGUgVGFiIEJhclwiKSk7XG5cdH1cbn1cblxuLy8gLS0tIEhpZGUgRWRpdG9yIFRhYnMgKFplbiBNb2RlKVxuXG5leHBvcnQgY2xhc3MgWmVuSGlkZUVkaXRvclRhYnNBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNldFNob3dUYWJzQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi56ZW5IaWRlRWRpdG9yVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7WmVuTW9kZVNldHRpbmdzLlNIT1dfVEFCU31gLCBFZGl0b3JUYWJzTW9kZS5OT05FKS5uZWdhdGUoKSwgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCkhO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUyKCdoaWRlRWRpdG9yVGFic1plbk1vZGUnLCAnSGlkZSBFZGl0b3IgVGFicyBpbiBaZW4gTW9kZScpO1xuXHRcdHN1cGVyKFplbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlMsIEVkaXRvclRhYnNNb2RlLk5PTkUsIHRpdGxlLCBaZW5IaWRlRWRpdG9yVGFic0FjdGlvbi5JRCwgcHJlY29uZGl0aW9uLCBsb2NhbGl6ZTIoJ2hpZGVFZGl0b3JUYWJzWmVuTW9kZURlc2NyaXB0aW9uJywgXCJIaWRlIFRhYiBCYXIgaW4gWmVuIE1vZGVcIikpO1xuXHR9XG59XG5cbi8vIC0tLSBTaG93IE11bHRpcGxlIEVkaXRvciBUYWJzXG5cbmV4cG9ydCBjbGFzcyBTaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd011bHRpcGxlRWRpdG9yVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERX1gLCBFZGl0b3JUYWJzTW9kZS5NVUxUSVBMRSkubmVnYXRlKCksIEluRWRpdG9yWmVuTW9kZUNvbnRleHQubmVnYXRlKCkpITtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplMignc2hvd011bHRpcGxlRWRpdG9yVGFicycsICdTaG93IE11bHRpcGxlIEVkaXRvciBUYWJzJyk7XG5cblx0XHRzdXBlcihMYXlvdXRTZXR0aW5ncy5FRElUT1JfVEFCU19NT0RFLCBFZGl0b3JUYWJzTW9kZS5NVUxUSVBMRSwgdGl0bGUsIFNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24uSUQsIHByZWNvbmRpdGlvbiwgbG9jYWxpemUyKCdzaG93TXVsdGlwbGVFZGl0b3JUYWJzRGVzY3JpcHRpb24nLCBcIlNob3cgVGFiIEJhciB3aXRoIG11bHRpcGxlIHRhYnNcIikpO1xuXHR9XG59XG5cbi8vIC0tLSBTaG93IE11bHRpcGxlIEVkaXRvciBUYWJzIChaZW4gTW9kZSlcblxuZXhwb3J0IGNsYXNzIFplblNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdFNldFNob3dUYWJzQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi56ZW5TaG93TXVsdGlwbGVFZGl0b3JUYWJzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTfWAsIEVkaXRvclRhYnNNb2RlLk1VTFRJUExFKS5uZWdhdGUoKSwgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCkhO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUyKCdzaG93TXVsdGlwbGVFZGl0b3JUYWJzWmVuTW9kZScsICdTaG93IE11bHRpcGxlIEVkaXRvciBUYWJzIGluIFplbiBNb2RlJyk7XG5cblx0XHRzdXBlcihaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTLCBFZGl0b3JUYWJzTW9kZS5NVUxUSVBMRSwgdGl0bGUsIFplblNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24uSUQsIHByZWNvbmRpdGlvbiwgbG9jYWxpemUyKCdzaG93TXVsdGlwbGVFZGl0b3JUYWJzWmVuTW9kZURlc2NyaXB0aW9uJywgXCJTaG93IFRhYiBCYXIgaW4gWmVuIE1vZGVcIikpO1xuXHR9XG59XG5cbi8vIC0tLSBTaG93IFNpbmdsZSBFZGl0b3IgVGFiXG5cbmV4cG9ydCBjbGFzcyBTaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RTZXRTaG93VGFic0FjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2hvd0VkaXRvclRhYic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERX1gLCBFZGl0b3JUYWJzTW9kZS5TSU5HTEUpLm5lZ2F0ZSgpLCBJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpKSE7XG5cdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZTIoJ3Nob3dTaW5nbGVFZGl0b3JUYWInLCAnU2hvdyBTaW5nbGUgRWRpdG9yIFRhYicpO1xuXG5cdFx0c3VwZXIoTGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERSwgRWRpdG9yVGFic01vZGUuU0lOR0xFLCB0aXRsZSwgU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbi5JRCwgcHJlY29uZGl0aW9uLCBsb2NhbGl6ZTIoJ3Nob3dTaW5nbGVFZGl0b3JUYWJEZXNjcmlwdGlvbicsIFwiU2hvdyBUYWIgQmFyIHdpdGggb25lIFRhYlwiKSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEhpZGVFZGl0b3JUYWJzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uKTtcblxuLy8gLS0tIFNob3cgU2luZ2xlIEVkaXRvciBUYWIgKFplbiBNb2RlKVxuXG5leHBvcnQgY2xhc3MgWmVuU2hvd1NpbmdsZUVkaXRvclRhYkFjdGlvbiBleHRlbmRzIEFic3RyYWN0U2V0U2hvd1RhYnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnplblNob3dFZGl0b3JUYWInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke1plbk1vZGVTZXR0aW5ncy5TSE9XX1RBQlN9YCwgRWRpdG9yVGFic01vZGUuU0lOR0xFKS5uZWdhdGUoKSwgSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCkhO1xuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemUyKCdzaG93U2luZ2xlRWRpdG9yVGFiWmVuTW9kZScsICdTaG93IFNpbmdsZSBFZGl0b3IgVGFiIGluIFplbiBNb2RlJyk7XG5cblx0XHRzdXBlcihaZW5Nb2RlU2V0dGluZ3MuU0hPV19UQUJTLCBFZGl0b3JUYWJzTW9kZS5TSU5HTEUsIHRpdGxlLCBaZW5TaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uLklELCBwcmVjb25kaXRpb24sIGxvY2FsaXplMignc2hvd1NpbmdsZUVkaXRvclRhYlplbk1vZGVEZXNjcmlwdGlvbicsIFwiU2hvdyBUYWIgQmFyIGluIFplbiBNb2RlIHdpdGggb25lIFRhYlwiKSk7XG5cdH1cbn1cblxuLy8gLS0tIFRhYiBCYXIgU3VibWVudSBpbiBWaWV3IEFwcGVhcmFuY2UgTWVudVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRzdWJtZW51OiBNZW51SWQuRWRpdG9yVGFic0JhclNob3dUYWJzU3VibWVudSxcblx0dGl0bGU6IGxvY2FsaXplKCd0YWJCYXInLCBcIlRhYiBCYXJcIiksXG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRvcmRlcjogMTAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSlcbn0pO1xuXG4vLyAtLS0gU2hvdyBFZGl0b3IgQWN0aW9ucyBpbiBUaXRsZSBCYXJcblxuZXhwb3J0IGNsYXNzIEVkaXRvckFjdGlvbnNUaXRsZUJhckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvckFjdGlvbnNUaXRsZUJhcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVkaXRvckFjdGlvbnNUaXRsZUJhckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JBY3Rpb25zVG9UaXRsZUJhcicsIFwiTW92ZSBFZGl0b3IgQWN0aW9ucyB0byBUaXRsZSBCYXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTn1gLCBFZGl0b3JBY3Rpb25zTG9jYXRpb24uVElUTEVCQVIpLm5lZ2F0ZSgpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdtb3ZlRWRpdG9yQWN0aW9uc1RvVGl0bGVCYXJEZXNjcmlwdGlvbicsIFwiTW92ZSBFZGl0b3IgQWN0aW9ucyBmcm9tIHRoZSB0YWIgYmFyIHRvIHRoZSB0aXRsZSBiYXJcIikgfSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTiwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSKTtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckFjdGlvbnNUaXRsZUJhckFjdGlvbik7XG5cbi8vIC0tLSBFZGl0b3IgQWN0aW9ucyBEZWZhdWx0IFBvc2l0aW9uXG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JBY3Rpb25zRGVmYXVsdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRvckFjdGlvbnNEZWZhdWx0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRWRpdG9yQWN0aW9uc0RlZmF1bHRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlRWRpdG9yQWN0aW9uc1RvVGFiQmFyJywgXCJNb3ZlIEVkaXRvciBBY3Rpb25zIHRvIFRhYiBCYXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT059YCwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQpLm5lZ2F0ZSgpLFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9UQUJTX01PREV9YCwgRWRpdG9yVGFic01vZGUuTk9ORSkubmVnYXRlKCksXG5cdFx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0KSxcblx0XHRcdG1ldGFkYXRhOiB7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ21vdmVFZGl0b3JBY3Rpb25zVG9UYWJCYXJEZXNjcmlwdGlvbicsIFwiTW92ZSBFZGl0b3IgQWN0aW9ucyBmcm9tIHRoZSB0aXRsZSBiYXIgdG8gdGhlIHRhYiBiYXJcIikgfSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTiwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yQWN0aW9uc0RlZmF1bHRBY3Rpb24pO1xuXG4vLyAtLS0gSGlkZSBFZGl0b3IgQWN0aW9uc1xuXG5leHBvcnQgY2xhc3MgSGlkZUVkaXRvckFjdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5oaWRlRWRpdG9yQWN0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEhpZGVFZGl0b3JBY3Rpb25zQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaGlkZUVkaXRvckFjdG9ucycsIFwiSGlkZSBFZGl0b3IgQWN0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OfWAsIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ISURERU4pLm5lZ2F0ZSgpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdoaWRlRWRpdG9yQWN0b25zRGVzY3JpcHRpb24nLCBcIkhpZGUgRWRpdG9yIEFjdGlvbnMgaW4gdGhlIHRhYiBhbmQgdGl0bGUgYmFyXCIpIH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT04sIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ISURERU4pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoSGlkZUVkaXRvckFjdGlvbnNBY3Rpb24pO1xuXG4vLyAtLS0gSGlkZSBFZGl0b3IgQWN0aW9uc1xuXG5leHBvcnQgY2xhc3MgU2hvd0VkaXRvckFjdGlvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5zaG93RWRpdG9yQWN0aW9ucyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNob3dFZGl0b3JBY3Rpb25zQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd0VkaXRvckFjdG9ucycsIFwiU2hvdyBFZGl0b3IgQWN0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0xheW91dFNldHRpbmdzLkVESVRPUl9BQ1RJT05TX0xPQ0FUSU9OfWAsIEVkaXRvckFjdGlvbnNMb2NhdGlvbi5ISURERU4pLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSksXG5cdFx0XHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdzaG93RWRpdG9yQWN0b25zRGVzY3JpcHRpb24nLCBcIk1ha2UgRWRpdG9yIEFjdGlvbnMgdmlzaWJsZS5cIikgfSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShMYXlvdXRTZXR0aW5ncy5FRElUT1JfQUNUSU9OU19MT0NBVElPTiwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoU2hvd0VkaXRvckFjdGlvbnNBY3Rpb24pO1xuXG4vLyAtLS0gRWRpdG9yIEFjdGlvbnMgUG9zaXRpb24gU3VibWVudSBpbiBWaWV3IEFwcGVhcmFuY2UgTWVudVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRzdWJtZW51OiBNZW51SWQuRWRpdG9yQWN0aW9uc1Bvc2l0aW9uU3VibWVudSxcblx0dGl0bGU6IGxvY2FsaXplKCdlZGl0b3JBY3Rpb25zUG9zaXRpb24nLCBcIkVkaXRvciBBY3Rpb25zIFBvc2l0aW9uXCIpLFxuXHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0b3JkZXI6IDExLFxuXHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxufSk7XG5cbi8vIC0tLSBDb25maWd1cmUgVGFicyBMYXlvdXRcblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyZUVkaXRvclRhYnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jb25maWd1cmVFZGl0b3JUYWJzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uZmlndXJlRWRpdG9yVGFic0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbmZpZ3VyZVRhYnMnLCBcIkNvbmZpZ3VyZSBUYWJzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblNldHRpbmdzKHsganNvbkVkaXRvcjogZmFsc2UsIHF1ZXJ5OiAnd29ya2JlbmNoLmVkaXRvciB0YWInIH0pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQ29uZmlndXJlRWRpdG9yVGFic0FjdGlvbik7XG5cbi8vIC0tLSBDb25maWd1cmUgRWRpdG9yXG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jb25maWd1cmVFZGl0b3InO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25maWd1cmVFZGl0b3JBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVFZGl0b3JzJywgXCJDb25maWd1cmUgRWRpdG9yc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogJ3dvcmtiZW5jaC5lZGl0b3InIH0pO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQ29uZmlndXJlRWRpdG9yQWN0aW9uKTtcblxuLy8gLS0tIFRvZ2dsZSBQaW5uZWQgVGFicyBPbiBTZXBhcmF0ZSBSb3dcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVNlcGFyYXRlUGlubmVkRWRpdG9yVGFicycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVTZXBhcmF0ZVBpbm5lZEVkaXRvclRhYnMnLCBcIlNlcGFyYXRlIFBpbm5lZCBFZGl0b3IgVGFic1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERX1gLCBFZGl0b3JUYWJzTW9kZS5NVUxUSVBMRSksXG5cdFx0XHRtZXRhZGF0YTogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUyKCd0b2dnbGVTZXBhcmF0ZVBpbm5lZEVkaXRvclRhYnNEZXNjcmlwdGlvbicsIFwiVG9nZ2xlIHdoZXRoZXIgcGlubmVkIGVkaXRvciB0YWJzIGFyZSBzaG93biBvbiBhIHNlcGFyYXRlIHJvdyBhYm92ZSB1bnBpbm5lZCB0YWJzLlwiKSB9LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBvbGRldHRpbmdWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5lZGl0b3IucGlubmVkVGFic09uU2VwYXJhdGVSb3cnKTtcblx0XHRjb25zdCBuZXdTZXR0aW5nVmFsdWUgPSAhb2xkZXR0aW5nVmFsdWU7XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ3dvcmtiZW5jaC5lZGl0b3IucGlubmVkVGFic09uU2VwYXJhdGVSb3cnLCBuZXdTZXR0aW5nVmFsdWUpO1xuXHR9XG59KTtcblxuLy8gLS0tIFRvZ2dsZSBNZW51IEJhclxuXG5pZiAoaXNXaW5kb3dzIHx8IGlzTGludXggfHwgaXNXZWIpIHtcblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZU1lbnViYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWVudUJhcicsXG5cdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0Li4ubG9jYWxpemUyKCd0b2dnbGVNZW51QmFyJywgXCJUb2dnbGUgTWVudSBCYXJcIiksXG5cdFx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaU1lbnVCYXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTWVudSAmJkJhclwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmFuZChJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICdoaWRkZW4nKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ3RvZ2dsZScpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnY29tcGFjdCcpKSxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0XHRncm91cDogJzJfd29ya2JlbmNoX2xheW91dCcsXG5cdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSkudG9nZ2xlTWVudUJhcigpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gQWRkIHNlcGFyYXRlbHkgdG8gdGl0bGUgYmFyIGNvbnRleHQgbWVudSBzbyB3ZSBjYW4gdXNlIGEgZGlmZmVyZW50IHRpdGxlXG5cdGZvciAoY29uc3QgbWVudUlkIG9mIFtNZW51SWQuVGl0bGVCYXJDb250ZXh0LCBNZW51SWQuVGl0bGVCYXJUaXRsZUNvbnRleHRdKSB7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKG1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWVudUJhcicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWlNZW51QmFyTm9NbmVtb25pYycsIFwiTWVudSBCYXJcIiksXG5cdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmFuZChJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICdoaWRkZW4nKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ3RvZ2dsZScpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnY29tcGFjdCcpKVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoVGl0bGVCYXJTdHlsZUNvbnRleHQua2V5LCBUaXRsZWJhclN0eWxlLk5BVElWRSksIElzTWFpbldpbmRvd0Z1bGxzY3JlZW5Db250ZXh0Lm5lZ2F0ZSgpKSxcblx0XHRcdGdyb3VwOiAnMl9jb25maWcnLFxuXHRcdFx0b3JkZXI6IDBcblx0XHR9KTtcblx0fVxufVxuXG4vLyAtLS0gUmVzZXQgVmlldyBMb2NhdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnJlc2V0Vmlld0xvY2F0aW9ucycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXNldFZpZXdMb2NhdGlvbnMnLCBcIlJlc2V0IFZpZXcgTG9jYXRpb25zXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpLnJlc2V0KCk7XG5cdH1cbn0pO1xuXG4vLyAtLS0gTW92ZSBWaWV3XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlVmlldycsIFwiTW92ZSBWaWV3XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZm9jdXNlZFZpZXdJZCA9IEZvY3VzZWRWaWV3Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bGV0IHZpZXdJZDogc3RyaW5nO1xuXG5cdFx0aWYgKGZvY3VzZWRWaWV3SWQgJiYgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZChmb2N1c2VkVmlld0lkKT8uY2FuTW92ZVZpZXcpIHtcblx0XHRcdHZpZXdJZCA9IGZvY3VzZWRWaWV3SWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHZpZXdJZCA9IGF3YWl0IHRoaXMuZ2V0VmlldyhxdWlja0lucHV0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsIHZpZXdJZCEpO1xuXHRcdFx0aWYgKCF2aWV3SWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb3ZlRm9jdXNlZFZpZXdBY3Rpb24gPSBuZXcgTW92ZUZvY3VzZWRWaWV3QWN0aW9uKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBtb3ZlRm9jdXNlZFZpZXdBY3Rpb24ucnVuKGFjY2Vzc29yLCB2aWV3SWQpKTtcblx0XHR9IGNhdGNoIHsgfVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3SXRlbXModmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpOiBBcnJheTxRdWlja1BpY2tJdGVtPiB7XG5cdFx0Y29uc3QgcmVzdWx0czogQXJyYXk8UXVpY2tQaWNrSXRlbT4gPSBbXTtcblxuXHRcdGNvbnN0IHZpZXdsZXRzID0gcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLmdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHR2aWV3bGV0cy5mb3JFYWNoKHZpZXdsZXRJZCA9PiB7XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQodmlld2xldElkKSE7XG5cdFx0XHRjb25zdCBjb250YWluZXJNb2RlbCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblxuXHRcdFx0bGV0IGhhc0FkZGVkVmlldyA9IGZhbHNlO1xuXHRcdFx0Y29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5mb3JFYWNoKHZpZXdEZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdFx0aWYgKCFoYXNBZGRlZFZpZXcpIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NpZGViYXJDb250YWluZXInLCBcIlNpZGUgQmFyIC8gezB9XCIsIGNvbnRhaW5lck1vZGVsLnRpdGxlKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRoYXNBZGRlZFZpZXcgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogdmlld0Rlc2NyaXB0b3IuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogdmlld0Rlc2NyaXB0b3IubmFtZS52YWx1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBhbmVscyA9IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0cGFuZWxzLmZvckVhY2gocGFuZWwgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSE7XG5cdFx0XHRjb25zdCBjb250YWluZXJNb2RlbCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblxuXHRcdFx0bGV0IGhhc0FkZGVkVmlldyA9IGZhbHNlO1xuXHRcdFx0Y29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5mb3JFYWNoKHZpZXdEZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdFx0aWYgKCFoYXNBZGRlZFZpZXcpIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BhbmVsQ29udGFpbmVyJywgXCJQYW5lbCAvIHswfVwiLCBjb250YWluZXJNb2RlbC50aXRsZSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0aGFzQWRkZWRWaWV3ID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblxuXHRcdGNvbnN0IHNpZGVQYW5lbHMgPSBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHRzaWRlUGFuZWxzLmZvckVhY2gocGFuZWwgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSE7XG5cdFx0XHRjb25zdCBjb250YWluZXJNb2RlbCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblxuXHRcdFx0bGV0IGhhc0FkZGVkVmlldyA9IGZhbHNlO1xuXHRcdFx0Y29udGFpbmVyTW9kZWwudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5mb3JFYWNoKHZpZXdEZXNjcmlwdG9yID0+IHtcblx0XHRcdFx0aWYgKHZpZXdEZXNjcmlwdG9yLmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdFx0aWYgKCFoYXNBZGRlZFZpZXcpIHtcblx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NlY29uZGFyeVNpZGVCYXJDb250YWluZXInLCBcIlNlY29uZGFyeSBTaWRlIEJhciAvIHswfVwiLCBjb250YWluZXJNb2RlbC50aXRsZSlcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0aGFzQWRkZWRWaWV3ID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yLm5hbWUudmFsdWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VmlldyhxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSwgdmlld0lkPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21vdmVGb2N1c2VkVmlldy5zZWxlY3RWaWV3JywgXCJTZWxlY3QgYSBWaWV3IHRvIE1vdmVcIik7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gdGhpcy5nZXRWaWV3SXRlbXModmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXHRcdHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zID0gcXVpY2tQaWNrLml0ZW1zLmZpbHRlcihpdGVtID0+IChpdGVtIGFzIElRdWlja1BpY2tJdGVtKS5pZCA9PT0gdmlld0lkKSBhcyBJUXVpY2tQaWNrSXRlbVtdO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB2aWV3SWQgPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0aWYgKHZpZXdJZC5pZCkge1xuXHRcdFx0XHRcdHJlc29sdmUodmlld0lkLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWplY3QoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbi8vIC0tLSBNb3ZlIEZvY3VzZWQgVmlld1xuXG5jbGFzcyBNb3ZlRm9jdXNlZFZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUZvY3VzZWRWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVGb2N1c2VkVmlldycsIFwiTW92ZSBGb2N1c2VkIFZpZXdcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBGb2N1c2VkVmlld0NvbnRleHQubm90RXF1YWxzVG8oJycpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgdmlld0lkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZm9jdXNlZFZpZXdJZCA9IHZpZXdJZCB8fCBGb2N1c2VkVmlld0NvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0aWYgKGZvY3VzZWRWaWV3SWQgPT09IHVuZGVmaW5lZCB8fCBmb2N1c2VkVmlld0lkLnRyaW0oKSA9PT0gJycpIHtcblx0XHRcdGRpYWxvZ1NlcnZpY2UuZXJyb3IobG9jYWxpemUoJ21vdmVGb2N1c2VkVmlldy5lcnJvci5ub0ZvY3VzZWRWaWV3JywgXCJUaGVyZSBpcyBubyB2aWV3IGN1cnJlbnRseSBmb2N1c2VkLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGZvY3VzZWRWaWV3SWQpO1xuXHRcdGlmICghdmlld0Rlc2NyaXB0b3I/LmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRkaWFsb2dTZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcuZXJyb3Iubm9uTW92YWJsZVZpZXcnLCBcIlRoZSBjdXJyZW50bHkgZm9jdXNlZCB2aWV3IGlzIG5vdCBtb3ZhYmxlLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcuc2VsZWN0RGVzdGluYXRpb24nLCBcIlNlbGVjdCBhIERlc3RpbmF0aW9uIGZvciB0aGUgVmlld1wiKTtcblx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSh7IGtleTogJ21vdmVGb2N1c2VkVmlldy50aXRsZScsIGNvbW1lbnQ6IFsnezB9IGluZGljYXRlcyB0aGUgdGl0bGUgb2YgdGhlIHZpZXcgdGhlIHVzZXIgaGFzIHNlbGVjdGVkIHRvIG1vdmUuJ10gfSwgXCJWaWV3OiBNb3ZlIHswfVwiLCB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlKTtcblxuXHRcdGNvbnN0IGl0ZW1zOiBBcnJheTxJUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cdFx0Y29uc3QgY3VycmVudENvbnRhaW5lciA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoZm9jdXNlZFZpZXdJZCkhO1xuXHRcdGNvbnN0IGN1cnJlbnRMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKGZvY3VzZWRWaWV3SWQpITtcblx0XHRjb25zdCBpc1ZpZXdTb2xvID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjdXJyZW50Q29udGFpbmVyKS5hbGxWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAxO1xuXG5cdFx0aWYgKCEoaXNWaWV3U29sbyAmJiBjdXJyZW50TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRpZDogJ18ucGFuZWwubmV3Y29udGFpbmVyJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnbW92ZUZvY3VzZWRWaWV3Lm5ld0NvbnRhaW5lckluUGFuZWwnLCBjb21tZW50OiBbJ0NyZWF0ZXMgYSBuZXcgdG9wLWxldmVsIHRhYiBpbiB0aGUgcGFuZWwuJ10gfSwgXCJOZXcgUGFuZWwgRW50cnlcIiksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIShpc1ZpZXdTb2xvICYmIGN1cnJlbnRMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0aWQ6ICdfLnNpZGViYXIubmV3Y29udGFpbmVyJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcubmV3Q29udGFpbmVySW5TaWRlYmFyJywgXCJOZXcgU2lkZSBCYXIgRW50cnlcIilcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghKGlzVmlld1NvbG8gJiYgY3VycmVudExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGlkOiAnXy5hdXhpbGlhcnliYXIubmV3Y29udGFpbmVyJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb3ZlRm9jdXNlZFZpZXcubmV3Q29udGFpbmVySW5TaWRlUGFuZWwnLCBcIk5ldyBTZWNvbmRhcnkgU2lkZSBCYXIgRW50cnlcIilcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NpZGViYXInLCBcIlNpZGUgQmFyXCIpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaW5uZWRWaWV3bGV0cyA9IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0aXRlbXMucHVzaCguLi5waW5uZWRWaWV3bGV0c1xuXHRcdFx0LmZpbHRlcih2aWV3bGV0SWQgPT4ge1xuXHRcdFx0XHRpZiAodmlld2xldElkID09PSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGZvY3VzZWRWaWV3SWQpIS5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAhdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdsZXRJZCkhLnJlamVjdEFkZGVkVmlld3M7XG5cdFx0XHR9KVxuXHRcdFx0Lm1hcCh2aWV3bGV0SWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiB2aWV3bGV0SWQsXG5cdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdsZXRJZCkhKS50aXRsZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGFuZWwnLCBcIlBhbmVsXCIpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaW5uZWRQYW5lbHMgPSBwYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UuZ2V0UGlubmVkUGFuZUNvbXBvc2l0ZUlkcyhWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGl0ZW1zLnB1c2goLi4ucGlubmVkUGFuZWxzXG5cdFx0XHQuZmlsdGVyKHBhbmVsID0+IHtcblx0XHRcdFx0aWYgKHBhbmVsID09PSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGZvY3VzZWRWaWV3SWQpIS5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAhdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSEucmVqZWN0QWRkZWRWaWV3cztcblx0XHRcdH0pXG5cdFx0XHQubWFwKHBhbmVsID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcGFuZWwsXG5cdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSEpLnRpdGxlXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZWNvbmRhcnlTaWRlQmFyJywgXCJTZWNvbmRhcnkgU2lkZSBCYXJcIilcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBpbm5lZEF1eFBhbmVscyA9IHBhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRQaW5uZWRQYW5lQ29tcG9zaXRlSWRzKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpO1xuXHRcdGl0ZW1zLnB1c2goLi4ucGlubmVkQXV4UGFuZWxzXG5cdFx0XHQuZmlsdGVyKHBhbmVsID0+IHtcblx0XHRcdFx0aWYgKHBhbmVsID09PSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGZvY3VzZWRWaWV3SWQpIS5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiAhdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSEucmVqZWN0QWRkZWRWaWV3cztcblx0XHRcdH0pXG5cdFx0XHQubWFwKHBhbmVsID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcGFuZWwsXG5cdFx0XHRcdFx0bGFiZWw6IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHBhbmVsKSEpLnRpdGxlXG5cdFx0XHRcdH07XG5cdFx0XHR9KSk7XG5cblx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVzdGluYXRpb24gPSBxdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblxuXHRcdFx0aWYgKGRlc3RpbmF0aW9uLmlkID09PSAnXy5wYW5lbC5uZXdjb250YWluZXInKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3IsIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3KGZvY3VzZWRWaWV3SWQsIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmIChkZXN0aW5hdGlvbi5pZCA9PT0gJ18uc2lkZWJhci5uZXdjb250YWluZXInKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3IsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHR2aWV3c1NlcnZpY2Uub3BlblZpZXcoZm9jdXNlZFZpZXdJZCwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGRlc3RpbmF0aW9uLmlkID09PSAnXy5hdXhpbGlhcnliYXIubmV3Y29udGFpbmVyJykge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdUb0xvY2F0aW9uKHZpZXdEZXNjcmlwdG9yLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHR2aWV3c1NlcnZpY2Uub3BlblZpZXcoZm9jdXNlZFZpZXdJZCwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGRlc3RpbmF0aW9uLmlkKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JdLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZGVzdGluYXRpb24uaWQpISwgdW5kZWZpbmVkLCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHR2aWV3c1NlcnZpY2Uub3BlblZpZXcoZm9jdXNlZFZpZXdJZCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRxdWlja1BpY2suc2hvdygpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRm9jdXNlZFZpZXdBY3Rpb24pO1xuXG4vLyAtLS0gUmVzZXQgRm9jdXNlZCBWaWV3IExvY2F0aW9uXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5yZXNldEZvY3VzZWRWaWV3TG9jYXRpb24nLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXRGb2N1c2VkVmlld0xvY2F0aW9uJywgXCJSZXNldCBGb2N1c2VkIFZpZXcgTG9jYXRpb25cIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEZvY3VzZWRWaWV3Q29udGV4dC5ub3RFcXVhbHNUbygnJylcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGZvY3VzZWRWaWV3SWQgPSBGb2N1c2VkVmlld0NvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0bGV0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoZm9jdXNlZFZpZXdJZCAhPT0gdW5kZWZpbmVkICYmIGZvY3VzZWRWaWV3SWQudHJpbSgpICE9PSAnJykge1xuXHRcdFx0dmlld0Rlc2NyaXB0b3IgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGZvY3VzZWRWaWV3SWQpO1xuXHRcdH1cblxuXHRcdGlmICghdmlld0Rlc2NyaXB0b3IpIHtcblx0XHRcdGRpYWxvZ1NlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3Jlc2V0Rm9jdXNlZFZpZXcuZXJyb3Iubm9Gb2N1c2VkVmlldycsIFwiVGhlcmUgaXMgbm8gdmlldyBjdXJyZW50bHkgZm9jdXNlZC5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRDb250YWluZXIgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdGlmICghZGVmYXVsdENvbnRhaW5lciB8fCBkZWZhdWx0Q29udGFpbmVyID09PSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yLmlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JdLCBkZWZhdWx0Q29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMuZGVzYy5pZCk7XG5cdFx0dmlld3NTZXJ2aWNlLm9wZW5WaWV3KHZpZXdEZXNjcmlwdG9yLmlkLCB0cnVlKTtcblx0fVxufSk7XG5cbi8vIC0tLSBSZXNpemUgVmlld1xuXG5hYnN0cmFjdCBjbGFzcyBCYXNlUmVzaXplVmlld0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByb3RlY3RlZCBzdGF0aWMgcmVhZG9ubHkgUkVTSVpFX0lOQ1JFTUVOVCA9IDYwOyAvLyBUaGlzIGlzIGEgY3NzIHBpeGVsIHNpemVcblxuXHRwcm90ZWN0ZWQgcmVzaXplUGFydCh3aWR0aENoYW5nZTogbnVtYmVyLCBoZWlnaHRDaGFuZ2U6IG51bWJlciwgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIHBhcnRUb1Jlc2l6ZT86IFBhcnRzKTogdm9pZCB7XG5cdFx0aWYgKGxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyICE9PSBsYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXIpIHtcblx0XHRcdHJldHVybjsgLy8gd2UgZG8gbm90IHN1cHBvcnQgcmVzaXppbmcgaW4gYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHR9XG5cblx0XHRsZXQgcGFydDogUGFydHMgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHBhcnRUb1Jlc2l6ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBpc0VkaXRvckZvY3VzID0gbGF5b3V0U2VydmljZS5oYXNGb2N1cyhQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdFx0XHRjb25zdCBpc1NpZGViYXJGb2N1cyA9IGxheW91dFNlcnZpY2UuaGFzRm9jdXMoUGFydHMuU0lERUJBUl9QQVJUKTtcblx0XHRcdGNvbnN0IGlzUGFuZWxGb2N1cyA9IGxheW91dFNlcnZpY2UuaGFzRm9jdXMoUGFydHMuUEFORUxfUEFSVCk7XG5cdFx0XHRjb25zdCBpc0F1eGlsaWFyeUJhckZvY3VzID0gbGF5b3V0U2VydmljZS5oYXNGb2N1cyhQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCk7XG5cblx0XHRcdGlmIChpc1NpZGViYXJGb2N1cykge1xuXHRcdFx0XHRwYXJ0ID0gUGFydHMuU0lERUJBUl9QQVJUO1xuXHRcdFx0fSBlbHNlIGlmIChpc1BhbmVsRm9jdXMpIHtcblx0XHRcdFx0cGFydCA9IFBhcnRzLlBBTkVMX1BBUlQ7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRWRpdG9yRm9jdXMpIHtcblx0XHRcdFx0cGFydCA9IFBhcnRzLkVESVRPUl9QQVJUO1xuXHRcdFx0fSBlbHNlIGlmIChpc0F1eGlsaWFyeUJhckZvY3VzKSB7XG5cdFx0XHRcdHBhcnQgPSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cGFydCA9IHBhcnRUb1Jlc2l6ZTtcblx0XHR9XG5cblx0XHRpZiAocGFydCkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5yZXNpemVQYXJ0KHBhcnQsIHdpZHRoQ2hhbmdlLCBoZWlnaHRDaGFuZ2UpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBJbmNyZWFzZVZpZXdTaXplQWN0aW9uIGV4dGVuZHMgQmFzZVJlc2l6ZVZpZXdBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5pbmNyZWFzZVZpZXdTaXplJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luY3JlYXNlVmlld1NpemUnLCAnSW5jcmVhc2UgQ3VycmVudCBWaWV3IFNpemUnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2l6ZVBhcnQoQmFzZVJlc2l6ZVZpZXdBY3Rpb24uUkVTSVpFX0lOQ1JFTUVOVCwgQmFzZVJlc2l6ZVZpZXdBY3Rpb24uUkVTSVpFX0lOQ1JFTUVOVCwgYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKSk7XG5cdH1cbn1cblxuY2xhc3MgSW5jcmVhc2VWaWV3V2lkdGhBY3Rpb24gZXh0ZW5kcyBCYXNlUmVzaXplVmlld0FjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmluY3JlYXNlVmlld1dpZHRoJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luY3JlYXNlRWRpdG9yV2lkdGgnLCAnSW5jcmVhc2UgRWRpdG9yIFdpZHRoJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNpemVQYXJ0KEJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIDAsIGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSksIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0fVxufVxuXG5jbGFzcyBJbmNyZWFzZVZpZXdIZWlnaHRBY3Rpb24gZXh0ZW5kcyBCYXNlUmVzaXplVmlld0FjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmluY3JlYXNlVmlld0hlaWdodCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbmNyZWFzZUVkaXRvckhlaWdodCcsICdJbmNyZWFzZSBFZGl0b3IgSGVpZ2h0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNpemVQYXJ0KDAsIEJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSksIFBhcnRzLkVESVRPUl9QQVJUKTtcblx0fVxufVxuXG5jbGFzcyBEZWNyZWFzZVZpZXdTaXplQWN0aW9uIGV4dGVuZHMgQmFzZVJlc2l6ZVZpZXdBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kZWNyZWFzZVZpZXdTaXplJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlY3JlYXNlVmlld1NpemUnLCAnRGVjcmVhc2UgQ3VycmVudCBWaWV3IFNpemUnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2l6ZVBhcnQoLUJhc2VSZXNpemVWaWV3QWN0aW9uLlJFU0laRV9JTkNSRU1FTlQsIC1CYXNlUmVzaXplVmlld0FjdGlvbi5SRVNJWkVfSU5DUkVNRU5ULCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpKTtcblx0fVxufVxuXG5jbGFzcyBEZWNyZWFzZVZpZXdXaWR0aEFjdGlvbiBleHRlbmRzIEJhc2VSZXNpemVWaWV3QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmRlY3JlYXNlVmlld1dpZHRoJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2RlY3JlYXNlRWRpdG9yV2lkdGgnLCAnRGVjcmVhc2UgRWRpdG9yIFdpZHRoJyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNBdXhpbGlhcnlXaW5kb3dGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNpemVQYXJ0KC1CYXNlUmVzaXplVmlld0FjdGlvbi5SRVNJWkVfSU5DUkVNRU5ULCAwLCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaExheW91dFNlcnZpY2UpLCBQYXJ0cy5FRElUT1JfUEFSVCk7XG5cdH1cbn1cblxuY2xhc3MgRGVjcmVhc2VWaWV3SGVpZ2h0QWN0aW9uIGV4dGVuZHMgQmFzZVJlc2l6ZVZpZXdBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kZWNyZWFzZVZpZXdIZWlnaHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZGVjcmVhc2VFZGl0b3JIZWlnaHQnLCAnRGVjcmVhc2UgRWRpdG9yIEhlaWdodCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKClcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMucmVzaXplUGFydCgwLCAtQmFzZVJlc2l6ZVZpZXdBY3Rpb24uUkVTSVpFX0lOQ1JFTUVOVCwgYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKSwgUGFydHMuRURJVE9SX1BBUlQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihJbmNyZWFzZVZpZXdTaXplQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihJbmNyZWFzZVZpZXdXaWR0aEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoSW5jcmVhc2VWaWV3SGVpZ2h0QWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKERlY3JlYXNlVmlld1NpemVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKERlY3JlYXNlVmlld1dpZHRoQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihEZWNyZWFzZVZpZXdIZWlnaHRBY3Rpb24pO1xuXG4vLyNyZWdpb24gUXVpY2sgSW5wdXQgQWxpZ25tZW50IEFjdGlvbnNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEFsaWduUXVpY2tJbnB1dFRvcEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5hbGlnblF1aWNrSW5wdXRUb3AnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWxpZ25RdWlja0lucHV0VG9wJywgJ0FsaWduIFF1aWNrIElucHV0IFRvcCcpLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnNldEFsaWdubWVudCgndG9wJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQWxpZ25RdWlja0lucHV0Q2VudGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFsaWduUXVpY2tJbnB1dENlbnRlcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhbGlnblF1aWNrSW5wdXRDZW50ZXInLCAnQWxpZ24gUXVpY2sgSW5wdXQgQ2VudGVyJyksXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0cXVpY2tJbnB1dFNlcnZpY2Uuc2V0QWxpZ25tZW50KCdjZW50ZXInKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG50eXBlIENvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uID0geyBpY29uQTogVGhlbWVJY29uOyBpY29uQjogVGhlbWVJY29uOyB3aGVuQTogQ29udGV4dEtleUV4cHJlc3Npb24gfTtcbnR5cGUgTGF5b3V0VmlzdWFsSWNvbiA9IFRoZW1lSWNvbiB8IENvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uO1xuXG5mdW5jdGlvbiBpc0NvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uKGljb246IExheW91dFZpc3VhbEljb24pOiBpY29uIGlzIENvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uIHtcblx0cmV0dXJuIChpY29uIGFzIENvbnRleHR1YWxMYXlvdXRWaXN1YWxJY29uKS5pY29uQSAhPT0gdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgQ3VzdG9taXplTGF5b3V0SXRlbSB7XG5cdGlkOiBzdHJpbmc7XG5cdGFjdGl2ZTogQ29udGV4dEtleUV4cHJlc3Npb247XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGFjdGl2ZUljb246IFRoZW1lSWNvbjtcblx0dmlzdWFsSWNvbj86IExheW91dFZpc3VhbEljb247XG5cdGFjdGl2ZUFyaWFMYWJlbDogc3RyaW5nO1xuXHRpbmFjdGl2ZUljb24/OiBUaGVtZUljb247XG5cdGluYWN0aXZlQXJpYUxhYmVsPzogc3RyaW5nO1xuXHR1c2VCdXR0b25zOiBib29sZWFuO1xufVxuXG5jb25zdCBDcmVhdGVUb2dnbGVMYXlvdXRJdGVtID0gKGlkOiBzdHJpbmcsIGFjdGl2ZTogQ29udGV4dEtleUV4cHJlc3Npb24sIGxhYmVsOiBzdHJpbmcsIHZpc3VhbEljb24/OiBMYXlvdXRWaXN1YWxJY29uKTogQ3VzdG9taXplTGF5b3V0SXRlbSA9PiB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0YWN0aXZlLFxuXHRcdGxhYmVsLFxuXHRcdHZpc3VhbEljb24sXG5cdFx0YWN0aXZlSWNvbjogQ29kaWNvbi5leWUsXG5cdFx0aW5hY3RpdmVJY29uOiBDb2RpY29uLmV5ZUNsb3NlZCxcblx0XHRhY3RpdmVBcmlhTGFiZWw6IGxvY2FsaXplKCdzZWxlY3RUb0hpZGUnLCBcIlNlbGVjdCB0byBIaWRlXCIpLFxuXHRcdGluYWN0aXZlQXJpYUxhYmVsOiBsb2NhbGl6ZSgnc2VsZWN0VG9TaG93JywgXCJTZWxlY3QgdG8gU2hvd1wiKSxcblx0XHR1c2VCdXR0b25zOiB0cnVlLFxuXHR9O1xufTtcblxuY29uc3QgQ3JlYXRlT3B0aW9uTGF5b3V0SXRlbSA9IChpZDogc3RyaW5nLCBhY3RpdmU6IENvbnRleHRLZXlFeHByZXNzaW9uLCBsYWJlbDogc3RyaW5nLCB2aXN1YWxJY29uPzogTGF5b3V0VmlzdWFsSWNvbik6IEN1c3RvbWl6ZUxheW91dEl0ZW0gPT4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdGFjdGl2ZSxcblx0XHRsYWJlbCxcblx0XHR2aXN1YWxJY29uLFxuXHRcdGFjdGl2ZUljb246IENvZGljb24uY2hlY2ssXG5cdFx0YWN0aXZlQXJpYUxhYmVsOiBsb2NhbGl6ZSgnYWN0aXZlJywgXCJBY3RpdmVcIiksXG5cdFx0dXNlQnV0dG9uczogZmFsc2Vcblx0fTtcbn07XG5cbmNvbnN0IE1lbnVCYXJUb2dnbGVkQ29udGV4dCA9IENvbnRleHRLZXlFeHByLmFuZChJc01hY05hdGl2ZUNvbnRleHQudG9OZWdhdGVkKCksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhgY29uZmlnLiR7TWVudVNldHRpbmdzLk1lbnVCYXJWaXNpYmlsaXR5fWAsICdoaWRkZW4nKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKGBjb25maWcuJHtNZW51U2V0dGluZ3MuTWVudUJhclZpc2liaWxpdHl9YCwgJ3RvZ2dsZScpLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke01lbnVTZXR0aW5ncy5NZW51QmFyVmlzaWJpbGl0eX1gLCAnY29tcGFjdCcpKSBhcyBDb250ZXh0S2V5RXhwcmVzc2lvbjtcbmNvbnN0IFRvZ2dsZVZpc2liaWxpdHlBY3Rpb25zOiBDdXN0b21pemVMYXlvdXRJdGVtW10gPSBbXTtcbmlmICghaXNNYWNpbnRvc2ggfHwgIWlzTmF0aXZlKSB7XG5cdFRvZ2dsZVZpc2liaWxpdHlBY3Rpb25zLnB1c2goQ3JlYXRlVG9nZ2xlTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVNZW51QmFyJywgTWVudUJhclRvZ2dsZWRDb250ZXh0LCBsb2NhbGl6ZSgnbWVudUJhcicsIFwiTWVudSBCYXJcIiksIG1lbnViYXJJY29uKSk7XG59XG5cblRvZ2dsZVZpc2liaWxpdHlBY3Rpb25zLnB1c2goLi4uW1xuXHRDcmVhdGVUb2dnbGVMYXlvdXRJdGVtKFRvZ2dsZUFjdGl2aXR5QmFyVmlzaWJpbGl0eUFjdGlvbklkLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guYWN0aXZpdHlCYXIubG9jYXRpb24nLCAnaGlkZGVuJyksIGxvY2FsaXplKCdhY3Rpdml0eUJhcicsIFwiQWN0aXZpdHkgQmFyXCIpLCB7IHdoZW5BOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdsZWZ0JyksIGljb25BOiBhY3Rpdml0eUJhckxlZnRJY29uLCBpY29uQjogYWN0aXZpdHlCYXJSaWdodEljb24gfSksXG5cdENyZWF0ZVRvZ2dsZUxheW91dEl0ZW0oVG9nZ2xlU2lkZWJhclZpc2liaWxpdHlBY3Rpb24uSUQsIFNpZGVCYXJWaXNpYmxlQ29udGV4dCwgbG9jYWxpemUoJ3NpZGVCYXInLCBcIlByaW1hcnkgU2lkZSBCYXJcIiksIHsgd2hlbkE6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ2xlZnQnKSwgaWNvbkE6IHBhbmVsTGVmdEljb24sIGljb25COiBwYW5lbFJpZ2h0SWNvbiB9KSxcblx0Q3JlYXRlVG9nZ2xlTGF5b3V0SXRlbShUb2dnbGVBdXhpbGlhcnlCYXJBY3Rpb24uSUQsIEF1eGlsaWFyeUJhclZpc2libGVDb250ZXh0LCBsb2NhbGl6ZSgnc2Vjb25kYXJ5U2lkZUJhcicsIFwiU2Vjb25kYXJ5IFNpZGUgQmFyXCIpLCB7IHdoZW5BOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guc2lkZUJhci5sb2NhdGlvbicsICdsZWZ0JyksIGljb25BOiBwYW5lbFJpZ2h0SWNvbiwgaWNvbkI6IHBhbmVsTGVmdEljb24gfSksXG5cdENyZWF0ZVRvZ2dsZUxheW91dEl0ZW0oVG9nZ2xlUGFuZWxBY3Rpb24uSUQsIFBhbmVsVmlzaWJsZUNvbnRleHQsIGxvY2FsaXplKCdwYW5lbCcsIFwiUGFuZWxcIiksIHBhbmVsSWNvbiksXG5cdENyZWF0ZVRvZ2dsZUxheW91dEl0ZW0oVG9nZ2xlU3RhdHVzYmFyVmlzaWJpbGl0eUFjdGlvbi5JRCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJywgdHJ1ZSksIGxvY2FsaXplKCdzdGF0dXNCYXInLCBcIlN0YXR1cyBCYXJcIiksIHN0YXR1c0Jhckljb24pLFxuXSk7XG5cbmNvbnN0IE1vdmVTaWRlQmFyQWN0aW9uczogQ3VzdG9taXplTGF5b3V0SXRlbVtdID0gW1xuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKE1vdmVTaWRlYmFyTGVmdEFjdGlvbi5JRCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nLCAnbGVmdCcpLCBsb2NhbGl6ZSgnbGVmdFNpZGVCYXInLCBcIkxlZnRcIiksIHBhbmVsTGVmdEljb24pLFxuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKE1vdmVTaWRlYmFyUmlnaHRBY3Rpb24uSUQsIENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJywgJ3JpZ2h0JyksIGxvY2FsaXplKCdyaWdodFNpZGVCYXInLCBcIlJpZ2h0XCIpLCBwYW5lbFJpZ2h0SWNvbiksXG5dO1xuXG5jb25zdCBBbGlnblBhbmVsQWN0aW9uczogQ3VzdG9taXplTGF5b3V0SXRlbVtdID0gW1xuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxMZWZ0JywgUGFuZWxBbGlnbm1lbnRDb250ZXh0LmlzRXF1YWxUbygnbGVmdCcpLCBsb2NhbGl6ZSgnbGVmdFBhbmVsJywgXCJMZWZ0XCIpLCBwYW5lbEFsaWdubWVudExlZnRJY29uKSxcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi5hbGlnblBhbmVsUmlnaHQnLCBQYW5lbEFsaWdubWVudENvbnRleHQuaXNFcXVhbFRvKCdyaWdodCcpLCBsb2NhbGl6ZSgncmlnaHRQYW5lbCcsIFwiUmlnaHRcIiksIHBhbmVsQWxpZ25tZW50UmlnaHRJY29uKSxcblx0Q3JlYXRlT3B0aW9uTGF5b3V0SXRlbSgnd29ya2JlbmNoLmFjdGlvbi5hbGlnblBhbmVsQ2VudGVyJywgUGFuZWxBbGlnbm1lbnRDb250ZXh0LmlzRXF1YWxUbygnY2VudGVyJyksIGxvY2FsaXplKCdjZW50ZXJQYW5lbCcsIFwiQ2VudGVyXCIpLCBwYW5lbEFsaWdubWVudENlbnRlckljb24pLFxuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxKdXN0aWZ5JywgUGFuZWxBbGlnbm1lbnRDb250ZXh0LmlzRXF1YWxUbygnanVzdGlmeScpLCBsb2NhbGl6ZSgnanVzdGlmeVBhbmVsJywgXCJKdXN0aWZ5XCIpLCBwYW5lbEFsaWdubWVudEp1c3RpZnlJY29uKSxcbl07XG5cbmNvbnN0IFF1aWNrSW5wdXRBY3Rpb25zOiBDdXN0b21pemVMYXlvdXRJdGVtW10gPSBbXG5cdENyZWF0ZU9wdGlvbkxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25RdWlja0lucHV0VG9wJywgUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkuaXNFcXVhbFRvKCd0b3AnKSwgbG9jYWxpemUoJ3RvcCcsIFwiVG9wXCIpLCBxdWlja0lucHV0QWxpZ25tZW50VG9wSWNvbiksXG5cdENyZWF0ZU9wdGlvbkxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25RdWlja0lucHV0Q2VudGVyJywgUXVpY2tJbnB1dEFsaWdubWVudENvbnRleHRLZXkuaXNFcXVhbFRvKCdjZW50ZXInKSwgbG9jYWxpemUoJ2NlbnRlcicsIFwiQ2VudGVyXCIpLCBxdWlja0lucHV0QWxpZ25tZW50Q2VudGVySWNvbiksXG5dO1xuXG5jb25zdCBNaXNjTGF5b3V0T3B0aW9uczogQ3VzdG9taXplTGF5b3V0SXRlbVtdID0gW1xuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUZ1bGxTY3JlZW4nLCBJc01haW5XaW5kb3dGdWxsc2NyZWVuQ29udGV4dCwgbG9jYWxpemUoJ2Z1bGxzY3JlZW4nLCBcIkZ1bGwgU2NyZWVuXCIpLCBmdWxsc2NyZWVuSWNvbiksXG5cdENyZWF0ZU9wdGlvbkxheW91dEl0ZW0oJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlWmVuTW9kZScsIEluRWRpdG9yWmVuTW9kZUNvbnRleHQsIGxvY2FsaXplKCd6ZW5Nb2RlJywgXCJaZW4gTW9kZVwiKSwgemVuTW9kZUljb24pLFxuXHRDcmVhdGVPcHRpb25MYXlvdXRJdGVtKCd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUNlbnRlcmVkTGF5b3V0JywgSXNNYWluRWRpdG9yQ2VudGVyZWRMYXlvdXRDb250ZXh0LCBsb2NhbGl6ZSgnY2VudGVyZWRMYXlvdXQnLCBcIkNlbnRlcmVkIExheW91dFwiKSwgY2VudGVyTGF5b3V0SWNvbiksXG5dO1xuXG5jb25zdCBMYXlvdXRDb250ZXh0S2V5U2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5mb3IgKGNvbnN0IHsgYWN0aXZlIH0gb2YgWy4uLlRvZ2dsZVZpc2liaWxpdHlBY3Rpb25zLCAuLi5Nb3ZlU2lkZUJhckFjdGlvbnMsIC4uLkFsaWduUGFuZWxBY3Rpb25zLCAuLi5RdWlja0lucHV0QWN0aW9ucywgLi4uTWlzY0xheW91dE9wdGlvbnNdKSB7XG5cdGZvciAoY29uc3Qga2V5IG9mIGFjdGl2ZS5rZXlzKCkpIHtcblx0XHRMYXlvdXRDb250ZXh0S2V5U2V0LmFkZChrZXkpO1xuXHR9XG59XG5cbi8qKlxuICogTWF0Y2hlcyB0aGUgdGl0bGUgYmFyJ3MgYGVkaXRvckFjdGlvbnNFbmFibGVkYCBnZXR0ZXI6IHRydWUgd2hlbiBlZGl0b3JcbiAqIGFjdGlvbnMgcmVuZGVyIGluIHRoZSB0aXRsZSBiYXIgKGVpdGhlciBleHBsaWNpdGx5LCBvciBiZWNhdXNlIHRhYnMgYXJlXG4gKiBoaWRkZW4gYW5kIHRoZSBsb2NhdGlvbiBkZWZhdWx0cyB0aGVyZSkuXG4gKi9cbmNvbnN0IEVkaXRvckFjdGlvbnNJblRpdGxlQmFyID0gQ29udGV4dEtleUV4cHIub3IoXG5cdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT059YCwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLlRJVExFQkFSKSxcblx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX0FDVElPTlNfTE9DQVRJT059YCwgRWRpdG9yQWN0aW9uc0xvY2F0aW9uLkRFRkFVTFQpLFxuXHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7TGF5b3V0U2V0dGluZ3MuRURJVE9SX1RBQlNfTU9ERX1gLCBFZGl0b3JUYWJzTW9kZS5OT05FKVxuXHQpXG4pITtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEN1c3RvbWl6ZUxheW91dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgX2N1cnJlbnRRdWlja1BpY2s/OiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmN1c3RvbWl6ZUxheW91dCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjdXN0b21pemVMYXlvdXQnLCBcIkN1c3RvbWl6ZSBMYXlvdXQuLi5cIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IGNvbmZpZ3VyZUxheW91dEljb24sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51U3VibWVudSxcblx0XHRcdFx0XHRncm91cDogJ3pfZW5kJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmxheW91dENvbnRyb2wudHlwZScsICdib3RoJyksXG5cdFx0XHRcdFx0XHRFZGl0b3JBY3Rpb25zSW5UaXRsZUJhci5uZWdhdGUoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2gubGF5b3V0Q29udHJvbC50eXBlJywgJ2JvdGgnKSxcblx0XHRcdFx0XHRcdEVkaXRvckFjdGlvbnNJblRpdGxlQmFyXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJzFfbGF5b3V0J1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRJdGVtcyhjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlKTogUXVpY2tQaWNrSXRlbVtdIHtcblx0XHRjb25zdCB0b1F1aWNrUGlja0l0ZW0gPSAoaXRlbTogQ3VzdG9taXplTGF5b3V0SXRlbSk6IElRdWlja1BpY2tJdGVtID0+IHtcblx0XHRcdGNvbnN0IHRvZ2dsZWQgPSBpdGVtLmFjdGl2ZS5ldmFsdWF0ZShjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KG51bGwpKTtcblx0XHRcdGxldCBsYWJlbCA9IGl0ZW0udXNlQnV0dG9ucyA/XG5cdFx0XHRcdGl0ZW0ubGFiZWwgOlxuXHRcdFx0XHRpdGVtLmxhYmVsICsgKHRvZ2dsZWQgJiYgaXRlbS5hY3RpdmVJY29uID8gYCAkKCR7aXRlbS5hY3RpdmVJY29uLmlkfSlgIDogKCF0b2dnbGVkICYmIGl0ZW0uaW5hY3RpdmVJY29uID8gYCAkKCR7aXRlbS5pbmFjdGl2ZUljb24uaWR9KWAgOiAnJykpO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID1cblx0XHRcdFx0aXRlbS5sYWJlbCArICh0b2dnbGVkICYmIGl0ZW0uYWN0aXZlQXJpYUxhYmVsID8gYCAoJHtpdGVtLmFjdGl2ZUFyaWFMYWJlbH0pYCA6ICghdG9nZ2xlZCAmJiBpdGVtLmluYWN0aXZlQXJpYUxhYmVsID8gYCAoJHtpdGVtLmluYWN0aXZlQXJpYUxhYmVsfSlgIDogJycpKTtcblxuXHRcdFx0aWYgKGl0ZW0udmlzdWFsSWNvbikge1xuXHRcdFx0XHRsZXQgaWNvbiA9IGl0ZW0udmlzdWFsSWNvbjtcblx0XHRcdFx0aWYgKGlzQ29udGV4dHVhbExheW91dFZpc3VhbEljb24oaWNvbikpIHtcblx0XHRcdFx0XHRjb25zdCB1c2VJY29uQSA9IGljb24ud2hlbkEuZXZhbHVhdGUoY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChudWxsKSk7XG5cdFx0XHRcdFx0aWNvbiA9IHVzZUljb25BID8gaWNvbi5pY29uQSA6IGljb24uaWNvbkI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsYWJlbCA9IGAkKCR7aWNvbi5pZH0pICR7bGFiZWx9YDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWNvbiA9IHRvZ2dsZWQgPyBpdGVtLmFjdGl2ZUljb24gOiBpdGVtLmluYWN0aXZlSWNvbjtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2l0ZW0nLFxuXHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGFyaWFMYWJlbCxcblx0XHRcdFx0a2V5YmluZGluZzoga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhpdGVtLmlkLCBjb250ZXh0S2V5U2VydmljZSksXG5cdFx0XHRcdGJ1dHRvbnM6ICFpdGVtLnVzZUJ1dHRvbnMgPyB1bmRlZmluZWQgOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YWx3YXlzVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBhcmlhTGFiZWwsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IGljb24gPyBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbikgOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cdFx0fTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0b2dnbGVWaXNpYmlsaXR5JywgXCJWaXNpYmlsaXR5XCIpXG5cdFx0XHR9LFxuXHRcdFx0Li4uVG9nZ2xlVmlzaWJpbGl0eUFjdGlvbnMubWFwKHRvUXVpY2tQaWNrSXRlbSksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NpZGVCYXJQb3NpdGlvbicsIFwiUHJpbWFyeSBTaWRlIEJhciBQb3NpdGlvblwiKVxuXHRcdFx0fSxcblx0XHRcdC4uLk1vdmVTaWRlQmFyQWN0aW9ucy5tYXAodG9RdWlja1BpY2tJdGVtKSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGFuZWxBbGlnbm1lbnQnLCBcIlBhbmVsIEFsaWdubWVudFwiKVxuXHRcdFx0fSxcblx0XHRcdC4uLkFsaWduUGFuZWxBY3Rpb25zLm1hcCh0b1F1aWNrUGlja0l0ZW0pLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc2VwYXJhdG9yJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdxdWlja09wZW4nLCBcIlF1aWNrIElucHV0IFBvc2l0aW9uXCIpXG5cdFx0XHR9LFxuXHRcdFx0Li4uUXVpY2tJbnB1dEFjdGlvbnMubWFwKHRvUXVpY2tQaWNrSXRlbSksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xheW91dE1vZGVzJywgXCJNb2Rlc1wiKSxcblx0XHRcdH0sXG5cdFx0XHQuLi5NaXNjTGF5b3V0T3B0aW9ucy5tYXAodG9RdWlja1BpY2tJdGVtKSxcblx0XHRdO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRRdWlja1BpY2spIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRRdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXG5cdFx0dGhpcy5fY3VycmVudFF1aWNrUGljayA9IHF1aWNrUGljaztcblx0XHRxdWlja1BpY2suaXRlbXMgPSB0aGlzLmdldEl0ZW1zKGNvbnRleHRLZXlTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSk7XG5cdFx0cXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2suaGlkZUlucHV0ID0gdHJ1ZTtcblx0XHRxdWlja1BpY2sudGl0bGUgPSBsb2NhbGl6ZSgnY3VzdG9taXplTGF5b3V0UXVpY2tQaWNrVGl0bGUnLCBcIkN1c3RvbWl6ZSBMYXlvdXRcIik7XG5cblx0XHRjb25zdCBjbG9zZUJ1dHRvbiA9IHtcblx0XHRcdGFsd2F5c1Zpc2libGU6IHRydWUsXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIilcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzZXRCdXR0b24gPSB7XG5cdFx0XHRhbHdheXNWaXNpYmxlOiB0cnVlLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kaXNjYXJkKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZXN0b3JlIGRlZmF1bHRzJywgXCJSZXN0b3JlIERlZmF1bHRzXCIpXG5cdFx0fTtcblxuXHRcdHF1aWNrUGljay5idXR0b25zID0gW1xuXHRcdFx0cmVzZXRCdXR0b24sXG5cdFx0XHRjbG9zZUJ1dHRvblxuXHRcdF07XG5cblx0XHRsZXQgc2VsZWN0ZWRJdGVtOiBDdXN0b21pemVMYXlvdXRJdGVtIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoY2hhbmdlRXZlbnQgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZUV2ZW50LmFmZmVjdHNTb21lKExheW91dENvbnRleHRLZXlTZXQpKSB7XG5cdFx0XHRcdHF1aWNrUGljay5pdGVtcyA9IHRoaXMuZ2V0SXRlbXMoY29udGV4dEtleVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkSXRlbSkge1xuXHRcdFx0XHRcdHF1aWNrUGljay5hY3RpdmVJdGVtcyA9IHF1aWNrUGljay5pdGVtcy5maWx0ZXIoaXRlbSA9PiAoaXRlbSBhcyBDdXN0b21pemVMYXlvdXRJdGVtKS5pZCA9PT0gc2VsZWN0ZWRJdGVtPy5pZCkgYXMgSVF1aWNrUGlja0l0ZW1bXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcXVpY2tJbnB1dFNlcnZpY2UuZm9jdXMoKSwgMCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChldmVudCA9PiB7XG5cdFx0XHRpZiAocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHNlbGVjdGVkSXRlbSA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdIGFzIEN1c3RvbWl6ZUxheW91dEl0ZW07XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNlbGVjdGVkSXRlbS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5pdGVtKSB7XG5cdFx0XHRcdHNlbGVjdGVkSXRlbSA9IGV2ZW50Lml0ZW0gYXMgQ3VzdG9taXplTGF5b3V0SXRlbTtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoc2VsZWN0ZWRJdGVtLmlkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkVHJpZ2dlckJ1dHRvbigoYnV0dG9uKSA9PiB7XG5cdFx0XHRpZiAoYnV0dG9uID09PSBjbG9zZUJ1dHRvbikge1xuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChidXR0b24gPT09IHJlc2V0QnV0dG9uKSB7XG5cblx0XHRcdFx0Y29uc3QgcmVzZXRTZXR0aW5nID0gKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGlkKTtcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShpZCwgY29uZmlnLmRlZmF1bHRWYWx1ZSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gUmVzZXQgYWxsIGxheW91dCBvcHRpb25zXG5cdFx0XHRcdHJlc2V0U2V0dGluZygnd29ya2JlbmNoLmFjdGl2aXR5QmFyLmxvY2F0aW9uJyk7XG5cdFx0XHRcdHJlc2V0U2V0dGluZygnd29ya2JlbmNoLnNpZGVCYXIubG9jYXRpb24nKTtcblx0XHRcdFx0cmVzZXRTZXR0aW5nKCd3b3JrYmVuY2guc3RhdHVzQmFyLnZpc2libGUnKTtcblx0XHRcdFx0cmVzZXRTZXR0aW5nKCd3b3JrYmVuY2gucGFuZWwuZGVmYXVsdExvY2F0aW9uJyk7XG5cblx0XHRcdFx0aWYgKCFpc01hY2ludG9zaCB8fCAhaXNOYXRpdmUpIHtcblx0XHRcdFx0XHRyZXNldFNldHRpbmcoJ3dpbmRvdy5tZW51QmFyVmlzaWJpbGl0eScpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbENlbnRlcicpO1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5hbGlnblF1aWNrSW5wdXRUb3AnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRxdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX2N1cnJlbnRRdWlja1BpY2sgPSB1bmRlZmluZWQ7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUEyQixVQUFVLGlCQUFpQjtBQUN0RCxTQUFTLFFBQVEsY0FBYyxpQkFBaUIsZUFBZTtBQUMvRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUIsZ0JBQWdCLHlCQUF5QixnQkFBZ0IsT0FBTyxVQUFVLGlCQUFpQix3QkFBd0I7QUFDbkosU0FBMkIsNkJBQTZCO0FBQ3hELFNBQVMsUUFBUSxlQUFlO0FBQ2hDLFNBQVMsV0FBVyxTQUFTLE9BQU8sYUFBYSxnQkFBZ0I7QUFDakUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBc0MsMEJBQTBCO0FBQ3pFLFNBQVMsd0JBQXdCLHVCQUF3QyxxQ0FBcUM7QUFDOUcsU0FBUyxxQkFBcUI7QUFDOUIsU0FBd0IsMEJBQTJFO0FBQ25HLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCLHVCQUF1QixxQkFBcUIsdUJBQXVCLG9CQUFvQix3QkFBd0IsbUNBQW1DLDhCQUE4QiwrQkFBK0Isc0JBQXNCLGlDQUFpQyx5QkFBeUIsc0JBQXNCLGdDQUFnQztBQUMxWCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMs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
