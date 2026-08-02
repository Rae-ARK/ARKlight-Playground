var _a;
import "./media/panelpart.css";
import { localize, localize2 } from "../../../../nls.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuId, MenuRegistry, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { isHorizontal, IWorkbenchLayoutService, Parts, Position, positionToString } from "../../../services/layout/browser/layoutService.js";
import { IsAuxiliaryWindowContext, PanelAlignmentContext, PanelMaximizedContext, PanelPositionContext, PanelVisibleContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { SwitchCompositeViewAction } from "../compositeBarActions.js";
const maximizeIcon = registerIcon("panel-maximize", Codicon.screenFull, localize("maximizeIcon", "Icon to maximize a panel."));
const closeIcon = registerIcon("panel-close", Codicon.close, localize("closeIcon", "Icon to close a panel."));
const panelIcon = registerIcon("panel-layout-icon", Codicon.layoutPanel, localize("togglePanelOffIcon", "Icon to toggle the panel off when it is on."));
const panelOffIcon = registerIcon("panel-layout-icon-off", Codicon.layoutPanelOff, localize("togglePanelOnIcon", "Icon to toggle the panel on when it is off."));
const _TogglePanelAction = class _TogglePanelAction extends Action2 {
  constructor() {
    super({
      id: _TogglePanelAction.ID,
      title: _TogglePanelAction.LABEL,
      toggled: {
        condition: PanelVisibleContext,
        title: localize("closePanel", "Hide Panel"),
        icon: closeIcon,
        mnemonicTitle: localize({ key: "miTogglePanelMnemonic", comment: ["&& denotes a mnemonic"] }, "&&Panel")
      },
      icon: closeIcon,
      f1: true,
      category: Categories.View,
      metadata: {
        description: localize("openAndClosePanel", "Open/Show and Close/Hide Panel")
      },
      keybinding: { primary: KeyMod.CtrlCmd | KeyCode.KeyJ, weight: KeybindingWeight.WorkbenchContrib },
      menu: [
        {
          id: MenuId.MenubarAppearanceMenu,
          group: "2_workbench_layout",
          order: 5
        },
        {
          id: MenuId.LayoutControlMenuSubmenu,
          group: "0_workbench_layout",
          order: 4
        }
      ]
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    layoutService.setPartHidden(layoutService.isVisible(Parts.PANEL_PART), Parts.PANEL_PART);
  }
};
_TogglePanelAction.ID = "workbench.action.togglePanel";
_TogglePanelAction.LABEL = localize2("togglePanelVisibility", "Toggle Panel Visibility");
let TogglePanelAction = _TogglePanelAction;
registerAction2(TogglePanelAction);
MenuRegistry.appendMenuItem(MenuId.PanelTitle, {
  command: {
    id: TogglePanelAction.ID,
    title: localize("closePanel", "Hide Panel"),
    icon: closeIcon
  },
  group: "navigation",
  order: 2
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.closePanel",
      title: localize2("closePanel", "Hide Panel"),
      category: Categories.View,
      precondition: PanelVisibleContext,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IWorkbenchLayoutService).setPartHidden(true, Parts.PANEL_PART);
  }
});
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.focusPanel",
      title: localize2("focusPanel", "Focus into Panel"),
      category: Categories.View,
      f1: true
    });
  }
  async run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    if (!layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
    }
    const panel = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
    panel?.focus();
  }
}, _a.ID = "workbench.action.focusPanel", _a.LABEL = localize("focusPanel", "Focus into Panel"), _a));
const PositionPanelActionId = {
  LEFT: "workbench.action.positionPanelLeft",
  RIGHT: "workbench.action.positionPanelRight",
  BOTTOM: "workbench.action.positionPanelBottom",
  TOP: "workbench.action.positionPanelTop"
};
const AlignPanelActionId = {
  LEFT: "workbench.action.alignPanelLeft",
  RIGHT: "workbench.action.alignPanelRight",
  CENTER: "workbench.action.alignPanelCenter",
  JUSTIFY: "workbench.action.alignPanelJustify"
};
function createPanelActionConfig(id, title, shortLabel, value, when) {
  return {
    id,
    title,
    shortLabel,
    value,
    when
  };
}
function createPositionPanelActionConfig(id, title, shortLabel, position) {
  return createPanelActionConfig(id, title, shortLabel, position, PanelPositionContext.notEqualsTo(positionToString(position)));
}
function createAlignmentPanelActionConfig(id, title, shortLabel, alignment) {
  return createPanelActionConfig(id, title, shortLabel, alignment, PanelAlignmentContext.notEqualsTo(alignment));
}
const PositionPanelActionConfigs = [
  createPositionPanelActionConfig(PositionPanelActionId.TOP, localize2("positionPanelTop", "Move Panel To Top"), localize("positionPanelTopShort", "Top"), Position.TOP),
  createPositionPanelActionConfig(PositionPanelActionId.LEFT, localize2("positionPanelLeft", "Move Panel Left"), localize("positionPanelLeftShort", "Left"), Position.LEFT),
  createPositionPanelActionConfig(PositionPanelActionId.RIGHT, localize2("positionPanelRight", "Move Panel Right"), localize("positionPanelRightShort", "Right"), Position.RIGHT),
  createPositionPanelActionConfig(PositionPanelActionId.BOTTOM, localize2("positionPanelBottom", "Move Panel To Bottom"), localize("positionPanelBottomShort", "Bottom"), Position.BOTTOM)
];
const AlignPanelActionConfigs = [
  createAlignmentPanelActionConfig(AlignPanelActionId.LEFT, localize2("alignPanelLeft", "Set Panel Alignment to Left"), localize("alignPanelLeftShort", "Left"), "left"),
  createAlignmentPanelActionConfig(AlignPanelActionId.RIGHT, localize2("alignPanelRight", "Set Panel Alignment to Right"), localize("alignPanelRightShort", "Right"), "right"),
  createAlignmentPanelActionConfig(AlignPanelActionId.CENTER, localize2("alignPanelCenter", "Set Panel Alignment to Center"), localize("alignPanelCenterShort", "Center"), "center"),
  createAlignmentPanelActionConfig(AlignPanelActionId.JUSTIFY, localize2("alignPanelJustify", "Set Panel Alignment to Justify"), localize("alignPanelJustifyShort", "Justify"), "justify")
];
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.PanelPositionMenu,
  title: localize("positionPanel", "Panel Position"),
  group: "3_workbench_layout_move",
  order: 4
});
PositionPanelActionConfigs.forEach((positionPanelAction, index) => {
  const { id, title, shortLabel, value, when } = positionPanelAction;
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id,
        title,
        category: Categories.View,
        f1: true
      });
    }
    run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.setPanelPosition(value === void 0 ? Position.BOTTOM : value);
    }
  });
  MenuRegistry.appendMenuItem(MenuId.PanelPositionMenu, {
    command: {
      id,
      title: shortLabel,
      toggled: when.negate()
    },
    order: 5 + index
  });
});
MenuRegistry.appendMenuItem(MenuId.MenubarAppearanceMenu, {
  submenu: MenuId.PanelAlignmentMenu,
  title: localize("alignPanel", "Align Panel"),
  group: "3_workbench_layout_move",
  order: 5
});
AlignPanelActionConfigs.forEach((alignPanelAction) => {
  const { id, title, shortLabel, value, when } = alignPanelAction;
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id,
        title,
        category: Categories.View,
        toggled: when.negate(),
        f1: true
      });
    }
    run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      layoutService.setPanelAlignment(value === void 0 ? "center" : value);
    }
  });
  MenuRegistry.appendMenuItem(MenuId.PanelAlignmentMenu, {
    command: {
      id,
      title: shortLabel,
      toggled: when.negate()
    },
    order: 5
  });
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.previousPanelView",
      title: localize2("previousPanelView", "Previous Panel View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Panel, -1);
  }
});
registerAction2(class extends SwitchCompositeViewAction {
  constructor() {
    super({
      id: "workbench.action.nextPanelView",
      title: localize2("nextPanelView", "Next Panel View"),
      category: Categories.View,
      f1: true
    }, ViewContainerLocation.Panel, 1);
  }
});
const panelMaximizationSupportedWhen = ContextKeyExpr.or(PanelAlignmentContext.isEqualTo("center"), ContextKeyExpr.and(PanelPositionContext.notEqualsTo("bottom"), PanelPositionContext.notEqualsTo("top")));
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleMaximizedPanel",
      title: localize2("toggleMaximizedPanel", "Toggle Maximized Panel"),
      tooltip: localize("maximizePanel", "Maximize Panel"),
      category: Categories.View,
      f1: true,
      icon: maximizeIcon,
      precondition: panelMaximizationSupportedWhen,
      toggled: {
        condition: PanelMaximizedContext,
        tooltip: localize("minimizePanel", "Restore Panel")
      },
      menu: [{
        id: MenuId.PanelTitle,
        group: "navigation",
        order: 1,
        when: panelMaximizationSupportedWhen
      }]
    });
  }
  run(accessor) {
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const notificationService = accessor.get(INotificationService);
    if (layoutService.getPanelAlignment() !== "center" && isHorizontal(layoutService.getPanelPosition())) {
      notificationService.warn(localize("panelMaxNotSupported", "Maximizing the panel is only supported when it is center aligned."));
      return;
    }
    if (!layoutService.isVisible(Parts.PANEL_PART)) {
      layoutService.setPartHidden(false, Parts.PANEL_PART);
      if (!layoutService.isPanelMaximized()) {
        layoutService.toggleMaximizedPanel();
      }
    } else {
      layoutService.toggleMaximizedPanel();
    }
  }
});
MenuRegistry.appendMenuItems([
  {
    id: MenuId.LayoutControlMenu,
    item: {
      group: "navigation",
      command: {
        id: TogglePanelAction.ID,
        title: localize("togglePanel", "Toggle Panel"),
        icon: panelOffIcon,
        toggled: { condition: PanelVisibleContext, icon: panelIcon }
      },
      when: ContextKeyExpr.and(
        IsAuxiliaryWindowContext.negate(),
        ContextKeyExpr.or(
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "toggles"),
          ContextKeyExpr.equals("config.workbench.layoutControl.type", "both")
        )
      ),
      order: 1
    }
  }
]);
class MoveViewsBetweenPanelsAction extends Action2 {
  constructor(source, destination, desc) {
    super(desc);
    this.source = source;
    this.destination = destination;
  }
  run(accessor, ...args) {
    const viewDescriptorService = accessor.get(IViewDescriptorService);
    const layoutService = accessor.get(IWorkbenchLayoutService);
    const viewsService = accessor.get(IViewsService);
    const srcContainers = viewDescriptorService.getViewContainersByLocation(this.source);
    const destContainers = viewDescriptorService.getViewContainersByLocation(this.destination);
    if (srcContainers.length) {
      const activeViewContainer = viewsService.getVisibleViewContainer(this.source);
      srcContainers.forEach((viewContainer) => viewDescriptorService.moveViewContainerToLocation(viewContainer, this.destination, void 0, this.desc.id));
      layoutService.setPartHidden(false, this.destination === ViewContainerLocation.Panel ? Parts.PANEL_PART : Parts.AUXILIARYBAR_PART);
      if (activeViewContainer && destContainers.length === 0) {
        viewsService.openViewContainer(activeViewContainer.id, true);
      }
    }
  }
}
const _MovePanelToSidePanelAction = class _MovePanelToSidePanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
      id: _MovePanelToSidePanelAction.ID,
      title: localize2("movePanelToSecondarySideBar", "Move Panel Views To Secondary Side Bar"),
      category: Categories.View,
      f1: false
    });
  }
};
_MovePanelToSidePanelAction.ID = "workbench.action.movePanelToSidePanel";
let MovePanelToSidePanelAction = _MovePanelToSidePanelAction;
const _MovePanelToSecondarySideBarAction = class _MovePanelToSecondarySideBarAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.Panel, ViewContainerLocation.AuxiliaryBar, {
      id: _MovePanelToSecondarySideBarAction.ID,
      title: localize2("movePanelToSecondarySideBar", "Move Panel Views To Secondary Side Bar"),
      category: Categories.View,
      f1: true
    });
  }
};
_MovePanelToSecondarySideBarAction.ID = "workbench.action.movePanelToSecondarySideBar";
let MovePanelToSecondarySideBarAction = _MovePanelToSecondarySideBarAction;
registerAction2(MovePanelToSidePanelAction);
registerAction2(MovePanelToSecondarySideBarAction);
const _MoveSidePanelToPanelAction = class _MoveSidePanelToPanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
      id: _MoveSidePanelToPanelAction.ID,
      title: localize2("moveSidePanelToPanel", "Move Secondary Side Bar Views To Panel"),
      category: Categories.View,
      f1: false
    });
  }
};
_MoveSidePanelToPanelAction.ID = "workbench.action.moveSidePanelToPanel";
let MoveSidePanelToPanelAction = _MoveSidePanelToPanelAction;
const _MoveSecondarySideBarToPanelAction = class _MoveSecondarySideBarToPanelAction extends MoveViewsBetweenPanelsAction {
  constructor() {
    super(ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel, {
      id: _MoveSecondarySideBarToPanelAction.ID,
      title: localize2("moveSidePanelToPanel", "Move Secondary Side Bar Views To Panel"),
      category: Categories.View,
      f1: true
    });
  }
};
_MoveSecondarySideBarToPanelAction.ID = "workbench.action.moveSecondarySideBarToPanel";
let MoveSecondarySideBarToPanelAction = _MoveSecondarySideBarToPanelAction;
registerAction2(MoveSidePanelToPanelAction);
registerAction2(MoveSecondarySideBarToPanelAction);
export {
  MovePanelToSecondarySideBarAction,
  MoveSecondarySideBarToPanelAction,
  TogglePanelAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3BhbmVsL3BhbmVsQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9wYW5lbHBhcnQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiwgSUFjdGlvbjJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IGlzSG9yaXpvbnRhbCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhbmVsQWxpZ25tZW50LCBQYXJ0cywgUG9zaXRpb24sIHBvc2l0aW9uVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgUGFuZWxBbGlnbm1lbnRDb250ZXh0LCBQYW5lbE1heGltaXplZENvbnRleHQsIFBhbmVsUG9zaXRpb25Db250ZXh0LCBQYW5lbFZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uVGl0bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTd2l0Y2hDb21wb3NpdGVWaWV3QWN0aW9uIH0gZnJvbSAnLi4vY29tcG9zaXRlQmFyQWN0aW9ucy5qcyc7XG5cbmNvbnN0IG1heGltaXplSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtbWF4aW1pemUnLCBDb2RpY29uLnNjcmVlbkZ1bGwsIGxvY2FsaXplKCdtYXhpbWl6ZUljb24nLCAnSWNvbiB0byBtYXhpbWl6ZSBhIHBhbmVsLicpKTtcbmNvbnN0IGNsb3NlSWNvbiA9IHJlZ2lzdGVySWNvbigncGFuZWwtY2xvc2UnLCBDb2RpY29uLmNsb3NlLCBsb2NhbGl6ZSgnY2xvc2VJY29uJywgJ0ljb24gdG8gY2xvc2UgYSBwYW5lbC4nKSk7XG5jb25zdCBwYW5lbEljb24gPSByZWdpc3Rlckljb24oJ3BhbmVsLWxheW91dC1pY29uJywgQ29kaWNvbi5sYXlvdXRQYW5lbCwgbG9jYWxpemUoJ3RvZ2dsZVBhbmVsT2ZmSWNvbicsICdJY29uIHRvIHRvZ2dsZSB0aGUgcGFuZWwgb2ZmIHdoZW4gaXQgaXMgb24uJykpO1xuY29uc3QgcGFuZWxPZmZJY29uID0gcmVnaXN0ZXJJY29uKCdwYW5lbC1sYXlvdXQtaWNvbi1vZmYnLCBDb2RpY29uLmxheW91dFBhbmVsT2ZmLCBsb2NhbGl6ZSgndG9nZ2xlUGFuZWxPbkljb24nLCAnSWNvbiB0byB0b2dnbGUgdGhlIHBhbmVsIG9uIHdoZW4gaXQgaXMgb2ZmLicpKTtcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVBhbmVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlUGFuZWwnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZTIoJ3RvZ2dsZVBhbmVsVmlzaWJpbGl0eScsIFwiVG9nZ2xlIFBhbmVsIFZpc2liaWxpdHlcIik7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZVBhbmVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IFRvZ2dsZVBhbmVsQWN0aW9uLkxBQkVMLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IFBhbmVsVmlzaWJsZUNvbnRleHQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VQYW5lbCcsICdIaWRlIFBhbmVsJyksXG5cdFx0XHRcdGljb246IGNsb3NlSWNvbixcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRvZ2dsZVBhbmVsTW5lbW9uaWMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQYW5lbFwiKSxcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBjbG9zZUljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ29wZW5BbmRDbG9zZVBhbmVsJywgJ09wZW4vU2hvdyBhbmQgQ2xvc2UvSGlkZSBQYW5lbCcpLFxuXHRcdFx0fSxcblx0XHRcdGtleWJpbmRpbmc6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUosIHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliIH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSxcblx0XHRcdFx0XHRncm91cDogJzJfd29ya2JlbmNoX2xheW91dCcsXG5cdFx0XHRcdFx0b3JkZXI6IDVcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnVTdWJtZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnMF93b3JrYmVuY2hfbGF5b3V0Jyxcblx0XHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4obGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCksIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVQYW5lbEFjdGlvbik7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuUGFuZWxUaXRsZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFRvZ2dsZVBhbmVsQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VQYW5lbCcsICdIaWRlIFBhbmVsJyksXG5cdFx0aWNvbjogY2xvc2VJY29uXG5cdH0sXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAyXG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZVBhbmVsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlUGFuZWwnLCAnSGlkZSBQYW5lbCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogUGFuZWxWaXNpYmxlQ29udGV4dCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSkuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzUGFuZWwnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZm9jdXNQYW5lbCcsIFwiRm9jdXMgaW50byBQYW5lbFwiKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNQYW5lbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c1BhbmVsJywgXCJGb2N1cyBpbnRvIFBhbmVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3QgcGFuZUNvbXBvc2l0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSk7XG5cblx0XHQvLyBTaG93IHBhbmVsXG5cdFx0aWYgKCFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHR9XG5cblx0XHQvLyBGb2N1cyBpbnRvIGFjdGl2ZSBwYW5lbFxuXHRcdGNvbnN0IHBhbmVsID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdHBhbmVsPy5mb2N1cygpO1xuXHR9XG59KTtcblxuY29uc3QgUG9zaXRpb25QYW5lbEFjdGlvbklkID0ge1xuXHRMRUZUOiAnd29ya2JlbmNoLmFjdGlvbi5wb3NpdGlvblBhbmVsTGVmdCcsXG5cdFJJR0hUOiAnd29ya2JlbmNoLmFjdGlvbi5wb3NpdGlvblBhbmVsUmlnaHQnLFxuXHRCT1RUT006ICd3b3JrYmVuY2guYWN0aW9uLnBvc2l0aW9uUGFuZWxCb3R0b20nLFxuXHRUT1A6ICd3b3JrYmVuY2guYWN0aW9uLnBvc2l0aW9uUGFuZWxUb3AnXG59O1xuXG5jb25zdCBBbGlnblBhbmVsQWN0aW9uSWQgPSB7XG5cdExFRlQ6ICd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxMZWZ0Jyxcblx0UklHSFQ6ICd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxSaWdodCcsXG5cdENFTlRFUjogJ3dvcmtiZW5jaC5hY3Rpb24uYWxpZ25QYW5lbENlbnRlcicsXG5cdEpVU1RJRlk6ICd3b3JrYmVuY2guYWN0aW9uLmFsaWduUGFuZWxKdXN0aWZ5Jyxcbn07XG5cbmludGVyZmFjZSBQYW5lbEFjdGlvbkNvbmZpZzxUPiB7XG5cdGlkOiBzdHJpbmc7XG5cdHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHR0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZTtcblx0c2hvcnRMYWJlbDogc3RyaW5nO1xuXHR2YWx1ZTogVDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUGFuZWxBY3Rpb25Db25maWc8VD4oaWQ6IHN0cmluZywgdGl0bGU6IElDb21tYW5kQWN0aW9uVGl0bGUsIHNob3J0TGFiZWw6IHN0cmluZywgdmFsdWU6IFQsIHdoZW46IENvbnRleHRLZXlFeHByZXNzaW9uKTogUGFuZWxBY3Rpb25Db25maWc8VD4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdHRpdGxlLFxuXHRcdHNob3J0TGFiZWwsXG5cdFx0dmFsdWUsXG5cdFx0d2hlbixcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZyhpZDogc3RyaW5nLCB0aXRsZTogSUNvbW1hbmRBY3Rpb25UaXRsZSwgc2hvcnRMYWJlbDogc3RyaW5nLCBwb3NpdGlvbjogUG9zaXRpb24pOiBQYW5lbEFjdGlvbkNvbmZpZzxQb3NpdGlvbj4ge1xuXHRyZXR1cm4gY3JlYXRlUGFuZWxBY3Rpb25Db25maWc8UG9zaXRpb24+KGlkLCB0aXRsZSwgc2hvcnRMYWJlbCwgcG9zaXRpb24sIFBhbmVsUG9zaXRpb25Db250ZXh0Lm5vdEVxdWFsc1RvKHBvc2l0aW9uVG9TdHJpbmcocG9zaXRpb24pKSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFsaWdubWVudFBhbmVsQWN0aW9uQ29uZmlnKGlkOiBzdHJpbmcsIHRpdGxlOiBJQ29tbWFuZEFjdGlvblRpdGxlLCBzaG9ydExhYmVsOiBzdHJpbmcsIGFsaWdubWVudDogUGFuZWxBbGlnbm1lbnQpOiBQYW5lbEFjdGlvbkNvbmZpZzxQYW5lbEFsaWdubWVudD4ge1xuXHRyZXR1cm4gY3JlYXRlUGFuZWxBY3Rpb25Db25maWc8UGFuZWxBbGlnbm1lbnQ+KGlkLCB0aXRsZSwgc2hvcnRMYWJlbCwgYWxpZ25tZW50LCBQYW5lbEFsaWdubWVudENvbnRleHQubm90RXF1YWxzVG8oYWxpZ25tZW50KSk7XG59XG5cbmNvbnN0IFBvc2l0aW9uUGFuZWxBY3Rpb25Db25maWdzOiBQYW5lbEFjdGlvbkNvbmZpZzxQb3NpdGlvbj5bXSA9IFtcblx0Y3JlYXRlUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZyhQb3NpdGlvblBhbmVsQWN0aW9uSWQuVE9QLCBsb2NhbGl6ZTIoJ3Bvc2l0aW9uUGFuZWxUb3AnLCBcIk1vdmUgUGFuZWwgVG8gVG9wXCIpLCBsb2NhbGl6ZSgncG9zaXRpb25QYW5lbFRvcFNob3J0JywgXCJUb3BcIiksIFBvc2l0aW9uLlRPUCksXG5cdGNyZWF0ZVBvc2l0aW9uUGFuZWxBY3Rpb25Db25maWcoUG9zaXRpb25QYW5lbEFjdGlvbklkLkxFRlQsIGxvY2FsaXplMigncG9zaXRpb25QYW5lbExlZnQnLCBcIk1vdmUgUGFuZWwgTGVmdFwiKSwgbG9jYWxpemUoJ3Bvc2l0aW9uUGFuZWxMZWZ0U2hvcnQnLCBcIkxlZnRcIiksIFBvc2l0aW9uLkxFRlQpLFxuXHRjcmVhdGVQb3NpdGlvblBhbmVsQWN0aW9uQ29uZmlnKFBvc2l0aW9uUGFuZWxBY3Rpb25JZC5SSUdIVCwgbG9jYWxpemUyKCdwb3NpdGlvblBhbmVsUmlnaHQnLCBcIk1vdmUgUGFuZWwgUmlnaHRcIiksIGxvY2FsaXplKCdwb3NpdGlvblBhbmVsUmlnaHRTaG9ydCcsIFwiUmlnaHRcIiksIFBvc2l0aW9uLlJJR0hUKSxcblx0Y3JlYXRlUG9zaXRpb25QYW5lbEFjdGlvbkNvbmZpZyhQb3NpdGlvblBhbmVsQWN0aW9uSWQuQk9UVE9NLCBsb2NhbGl6ZTIoJ3Bvc2l0aW9uUGFuZWxCb3R0b20nLCBcIk1vdmUgUGFuZWwgVG8gQm90dG9tXCIpLCBsb2NhbGl6ZSgncG9zaXRpb25QYW5lbEJvdHRvbVNob3J0JywgXCJCb3R0b21cIiksIFBvc2l0aW9uLkJPVFRPTSksXG5dO1xuXG5cbmNvbnN0IEFsaWduUGFuZWxBY3Rpb25Db25maWdzOiBQYW5lbEFjdGlvbkNvbmZpZzxQYW5lbEFsaWdubWVudD5bXSA9IFtcblx0Y3JlYXRlQWxpZ25tZW50UGFuZWxBY3Rpb25Db25maWcoQWxpZ25QYW5lbEFjdGlvbklkLkxFRlQsIGxvY2FsaXplMignYWxpZ25QYW5lbExlZnQnLCBcIlNldCBQYW5lbCBBbGlnbm1lbnQgdG8gTGVmdFwiKSwgbG9jYWxpemUoJ2FsaWduUGFuZWxMZWZ0U2hvcnQnLCBcIkxlZnRcIiksICdsZWZ0JyksXG5cdGNyZWF0ZUFsaWdubWVudFBhbmVsQWN0aW9uQ29uZmlnKEFsaWduUGFuZWxBY3Rpb25JZC5SSUdIVCwgbG9jYWxpemUyKCdhbGlnblBhbmVsUmlnaHQnLCBcIlNldCBQYW5lbCBBbGlnbm1lbnQgdG8gUmlnaHRcIiksIGxvY2FsaXplKCdhbGlnblBhbmVsUmlnaHRTaG9ydCcsIFwiUmlnaHRcIiksICdyaWdodCcpLFxuXHRjcmVhdGVBbGlnbm1lbnRQYW5lbEFjdGlvbkNvbmZpZyhBbGlnblBhbmVsQWN0aW9uSWQuQ0VOVEVSLCBsb2NhbGl6ZTIoJ2FsaWduUGFuZWxDZW50ZXInLCBcIlNldCBQYW5lbCBBbGlnbm1lbnQgdG8gQ2VudGVyXCIpLCBsb2NhbGl6ZSgnYWxpZ25QYW5lbENlbnRlclNob3J0JywgXCJDZW50ZXJcIiksICdjZW50ZXInKSxcblx0Y3JlYXRlQWxpZ25tZW50UGFuZWxBY3Rpb25Db25maWcoQWxpZ25QYW5lbEFjdGlvbklkLkpVU1RJRlksIGxvY2FsaXplMignYWxpZ25QYW5lbEp1c3RpZnknLCBcIlNldCBQYW5lbCBBbGlnbm1lbnQgdG8gSnVzdGlmeVwiKSwgbG9jYWxpemUoJ2FsaWduUGFuZWxKdXN0aWZ5U2hvcnQnLCBcIkp1c3RpZnlcIiksICdqdXN0aWZ5JyksXG5dO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRzdWJtZW51OiBNZW51SWQuUGFuZWxQb3NpdGlvbk1lbnUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgncG9zaXRpb25QYW5lbCcsIFwiUGFuZWwgUG9zaXRpb25cIiksXG5cdGdyb3VwOiAnM193b3JrYmVuY2hfbGF5b3V0X21vdmUnLFxuXHRvcmRlcjogNFxufSk7XG5cblBvc2l0aW9uUGFuZWxBY3Rpb25Db25maWdzLmZvckVhY2goKHBvc2l0aW9uUGFuZWxBY3Rpb24sIGluZGV4KSA9PiB7XG5cdGNvbnN0IHsgaWQsIHRpdGxlLCBzaG9ydExhYmVsLCB2YWx1ZSwgd2hlbiB9ID0gcG9zaXRpb25QYW5lbEFjdGlvbjtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhbmVsUG9zaXRpb24odmFsdWUgPT09IHVuZGVmaW5lZCA/IFBvc2l0aW9uLkJPVFRPTSA6IHZhbHVlKTtcblx0XHR9XG5cdH0pO1xuXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuUGFuZWxQb3NpdGlvbk1lbnUsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlOiBzaG9ydExhYmVsLFxuXHRcdFx0dG9nZ2xlZDogd2hlbi5uZWdhdGUoKVxuXHRcdH0sXG5cdFx0b3JkZXI6IDUgKyBpbmRleFxuXHR9KTtcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJBcHBlYXJhbmNlTWVudSwge1xuXHRzdWJtZW51OiBNZW51SWQuUGFuZWxBbGlnbm1lbnRNZW51LFxuXHR0aXRsZTogbG9jYWxpemUoJ2FsaWduUGFuZWwnLCBcIkFsaWduIFBhbmVsXCIpLFxuXHRncm91cDogJzNfd29ya2JlbmNoX2xheW91dF9tb3ZlJyxcblx0b3JkZXI6IDVcbn0pO1xuXG5BbGlnblBhbmVsQWN0aW9uQ29uZmlncy5mb3JFYWNoKGFsaWduUGFuZWxBY3Rpb24gPT4ge1xuXHRjb25zdCB7IGlkLCB0aXRsZSwgc2hvcnRMYWJlbCwgdmFsdWUsIHdoZW4gfSA9IGFsaWduUGFuZWxBY3Rpb247XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHRvZ2dsZWQ6IHdoZW4ubmVnYXRlKCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFuZWxBbGlnbm1lbnQodmFsdWUgPT09IHVuZGVmaW5lZCA/ICdjZW50ZXInIDogdmFsdWUpO1xuXHRcdH1cblx0fSk7XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5QYW5lbEFsaWdubWVudE1lbnUsIHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZCxcblx0XHRcdHRpdGxlOiBzaG9ydExhYmVsLFxuXHRcdFx0dG9nZ2xlZDogd2hlbi5uZWdhdGUoKVxuXHRcdH0sXG5cdFx0b3JkZXI6IDVcblx0fSk7XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgU3dpdGNoQ29tcG9zaXRlVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c1BhbmVsVmlldycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdwcmV2aW91c1BhbmVsVmlldycsIFwiUHJldmlvdXMgUGFuZWwgVmlld1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgLTEpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgU3dpdGNoQ29tcG9zaXRlVmlld0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXh0UGFuZWxWaWV3Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25leHRQYW5lbFZpZXcnLCBcIk5leHQgUGFuZWwgVmlld1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgMSk7XG5cdH1cbn0pO1xuXG5jb25zdCBwYW5lbE1heGltaXphdGlvblN1cHBvcnRlZFdoZW4gPSBDb250ZXh0S2V5RXhwci5vcihQYW5lbEFsaWdubWVudENvbnRleHQuaXNFcXVhbFRvKCdjZW50ZXInKSwgQ29udGV4dEtleUV4cHIuYW5kKFBhbmVsUG9zaXRpb25Db250ZXh0Lm5vdEVxdWFsc1RvKCdib3R0b20nKSwgUGFuZWxQb3NpdGlvbkNvbnRleHQubm90RXF1YWxzVG8oJ3RvcCcpKSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWF4aW1pemVkUGFuZWwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlTWF4aW1pemVkUGFuZWwnLCAnVG9nZ2xlIE1heGltaXplZCBQYW5lbCcpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21heGltaXplUGFuZWwnLCBcIk1heGltaXplIFBhbmVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0aWNvbjogbWF4aW1pemVJY29uLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBwYW5lbE1heGltaXphdGlvblN1cHBvcnRlZFdoZW4sXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogUGFuZWxNYXhpbWl6ZWRDb250ZXh0LFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbWluaW1pemVQYW5lbCcsIFwiUmVzdG9yZSBQYW5lbFwiKVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuUGFuZWxUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IHBhbmVsTWF4aW1pemF0aW9uU3VwcG9ydGVkV2hlblxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAobGF5b3V0U2VydmljZS5nZXRQYW5lbEFsaWdubWVudCgpICE9PSAnY2VudGVyJyAmJiBpc0hvcml6b250YWwobGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3BhbmVsTWF4Tm90U3VwcG9ydGVkJywgXCJNYXhpbWl6aW5nIHRoZSBwYW5lbCBpcyBvbmx5IHN1cHBvcnRlZCB3aGVuIGl0IGlzIGNlbnRlciBhbGlnbmVkLlwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFsYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKSkge1xuXHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKGZhbHNlLCBQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHRcdC8vIElmIHRoZSBwYW5lbCBpcyBub3QgYWxyZWFkeSBtYXhpbWl6ZWQsIG1heGltaXplIGl0XG5cdFx0XHRpZiAoIWxheW91dFNlcnZpY2UuaXNQYW5lbE1heGltaXplZCgpKSB7XG5cdFx0XHRcdGxheW91dFNlcnZpY2UudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRsYXlvdXRTZXJ2aWNlLnRvZ2dsZU1heGltaXplZFBhbmVsKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtcyhbXG5cdHtcblx0XHRpZDogTWVudUlkLkxheW91dENvbnRyb2xNZW51LFxuXHRcdGl0ZW06IHtcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBUb2dnbGVQYW5lbEFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVQYW5lbCcsIFwiVG9nZ2xlIFBhbmVsXCIpLFxuXHRcdFx0XHRpY29uOiBwYW5lbE9mZkljb24sXG5cdFx0XHRcdHRvZ2dsZWQ6IHsgY29uZGl0aW9uOiBQYW5lbFZpc2libGVDb250ZXh0LCBpY29uOiBwYW5lbEljb24gfVxuXHRcdFx0fSxcblx0XHRcdHdoZW46XG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2gubGF5b3V0Q29udHJvbC50eXBlJywgJ3RvZ2dsZXMnKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5sYXlvdXRDb250cm9sLnR5cGUnLCAnYm90aCcpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpLFxuXHRcdFx0b3JkZXI6IDFcblx0XHR9XG5cdH1cbl0pO1xuXG5jbGFzcyBNb3ZlVmlld3NCZXR3ZWVuUGFuZWxzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc291cmNlOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sIHByaXZhdGUgcmVhZG9ubHkgZGVzdGluYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPikge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3JjQ29udGFpbmVycyA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24odGhpcy5zb3VyY2UpO1xuXHRcdGNvbnN0IGRlc3RDb250YWluZXJzID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbih0aGlzLmRlc3RpbmF0aW9uKTtcblxuXHRcdGlmIChzcmNDb250YWluZXJzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld0NvbnRhaW5lciA9IHZpZXdzU2VydmljZS5nZXRWaXNpYmxlVmlld0NvbnRhaW5lcih0aGlzLnNvdXJjZSk7XG5cblx0XHRcdHNyY0NvbnRhaW5lcnMuZm9yRWFjaCh2aWV3Q29udGFpbmVyID0+IHZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24odmlld0NvbnRhaW5lciwgdGhpcy5kZXN0aW5hdGlvbiwgdW5kZWZpbmVkLCB0aGlzLmRlc2MuaWQpKTtcblx0XHRcdGxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgdGhpcy5kZXN0aW5hdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsID8gUGFydHMuUEFORUxfUEFSVCA6IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTtcblxuXHRcdFx0aWYgKGFjdGl2ZVZpZXdDb250YWluZXIgJiYgZGVzdENvbnRhaW5lcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihhY3RpdmVWaWV3Q29udGFpbmVyLmlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tIE1vdmUgUGFuZWwgVmlld3MgVG8gU2Vjb25kYXJ5IFNpZGUgQmFyXG5cbmNsYXNzIE1vdmVQYW5lbFRvU2lkZVBhbmVsQWN0aW9uIGV4dGVuZHMgTW92ZVZpZXdzQmV0d2VlblBhbmVsc0FjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVQYW5lbFRvU2lkZVBhbmVsJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCB7XG5cdFx0XHRpZDogTW92ZVBhbmVsVG9TaWRlUGFuZWxBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXInLCBcIk1vdmUgUGFuZWwgVmlld3MgVG8gU2Vjb25kYXJ5IFNpZGUgQmFyXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3ZlUGFuZWxUb1NlY29uZGFyeVNpZGVCYXJBY3Rpb24gZXh0ZW5kcyBNb3ZlVmlld3NCZXR3ZWVuUGFuZWxzQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZVBhbmVsVG9TZWNvbmRhcnlTaWRlQmFyJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCB7XG5cdFx0XHRpZDogTW92ZVBhbmVsVG9TZWNvbmRhcnlTaWRlQmFyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZVBhbmVsVG9TZWNvbmRhcnlTaWRlQmFyJywgXCJNb3ZlIFBhbmVsIFZpZXdzIFRvIFNlY29uZGFyeSBTaWRlIEJhclwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlUGFuZWxUb1NpZGVQYW5lbEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZVBhbmVsVG9TZWNvbmRhcnlTaWRlQmFyQWN0aW9uKTtcblxuLy8gLS0tIE1vdmUgU2Vjb25kYXJ5IFNpZGUgQmFyIFZpZXdzIFRvIFBhbmVsXG5cbmNsYXNzIE1vdmVTaWRlUGFuZWxUb1BhbmVsQWN0aW9uIGV4dGVuZHMgTW92ZVZpZXdzQmV0d2VlblBhbmVsc0FjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVTaWRlUGFuZWxUb1BhbmVsJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIHtcblx0XHRcdGlkOiBNb3ZlU2lkZVBhbmVsVG9QYW5lbEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVTaWRlUGFuZWxUb1BhbmVsJywgXCJNb3ZlIFNlY29uZGFyeSBTaWRlIEJhciBWaWV3cyBUbyBQYW5lbFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW92ZVNlY29uZGFyeVNpZGVCYXJUb1BhbmVsQWN0aW9uIGV4dGVuZHMgTW92ZVZpZXdzQmV0d2VlblBhbmVsc0FjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVTZWNvbmRhcnlTaWRlQmFyVG9QYW5lbCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsLCB7XG5cdFx0XHRpZDogTW92ZVNlY29uZGFyeVNpZGVCYXJUb1BhbmVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZVNpZGVQYW5lbFRvUGFuZWwnLCBcIk1vdmUgU2Vjb25kYXJ5IFNpZGUgQmFyIFZpZXdzIFRvIFBhbmVsXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlU2lkZVBhbmVsVG9QYW5lbEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZVNlY29uZGFyeVNpZGVCYXJUb1BhbmVsQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUFBO0FBS0Es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
