import "./media/actions.css";
import { URI } from "../../../base/common/uri.js";
import { localize, localize2 } from "../../../nls.js";
import { ApplyZoomTarget, MAX_ZOOM_LEVEL, MIN_ZOOM_LEVEL, applyZoom } from "../../../platform/window/electron-browser/window.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { getZoomLevel } from "../../../base/browser/browser.js";
import { FileKind } from "../../../platform/files/common/files.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { getIconClasses } from "../../../editor/common/services/getIconClasses.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { INativeHostService, FocusMode } from "../../../platform/native/common/native.js";
import { IHostService } from "../../services/host/browser/host.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../../platform/workspace/common/workspace.js";
import { Action2, MenuId } from "../../../platform/actions/common/actions.js";
import { Categories } from "../../../platform/action/common/actionCommonCategories.js";
import { KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { getActiveWindow } from "../../../base/browser/dom.js";
import { isOpenedAuxiliaryWindow } from "../../../platform/window/common/window.js";
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsWindowAlwaysOnTopContext } from "../../common/contextkeys.js";
import { isAuxiliaryWindow, mainWindow } from "../../../base/browser/window.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
const _CloseWindowAction = class _CloseWindowAction extends Action2 {
  constructor() {
    super({
      id: _CloseWindowAction.ID,
      title: {
        ...localize2("closeWindow", "Close Window"),
        mnemonicTitle: localize({ key: "miCloseWindow", comment: ["&& denotes a mnemonic"] }, "Clos&&e Window")
      },
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW },
        linux: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] },
        win: { primary: KeyMod.Alt | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyW] }
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "6_close",
        order: 4
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    return nativeHostService.closeWindow({ targetWindowId: getActiveWindow().vscodeWindowId });
  }
};
_CloseWindowAction.ID = "workbench.action.closeWindow";
let CloseWindowAction = _CloseWindowAction;
const _CloseOtherWindowsAction = class _CloseOtherWindowsAction extends Action2 {
  constructor() {
    super({
      id: _CloseOtherWindowsAction.ID,
      title: localize2("closeOtherWindows", "Close Other Windows"),
      f1: true
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const currentWindowId = getActiveWindow().vscodeWindowId;
    const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: false });
    for (const window of windows) {
      if (window.id !== currentWindowId) {
        nativeHostService.closeWindow({ targetWindowId: window.id });
      }
    }
  }
};
_CloseOtherWindowsAction.ID = "workbench.action.closeOtherWindows";
let CloseOtherWindowsAction = _CloseOtherWindowsAction;
const _BaseZoomAction = class _BaseZoomAction extends Action2 {
  async setZoomLevel(accessor, levelOrReset) {
    const configurationService = accessor.get(IConfigurationService);
    let target;
    if (configurationService.getValue(_BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY) !== false) {
      target = ApplyZoomTarget.ACTIVE_WINDOW;
    } else {
      target = ApplyZoomTarget.ALL_WINDOWS;
    }
    let level;
    if (typeof levelOrReset === "number") {
      level = Math.round(levelOrReset);
    } else {
      if (target === ApplyZoomTarget.ALL_WINDOWS) {
        level = 0;
      } else {
        const defaultLevel = configurationService.getValue(_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY);
        if (typeof defaultLevel === "number") {
          level = defaultLevel;
        } else {
          level = 0;
        }
      }
    }
    if (level > MAX_ZOOM_LEVEL || level < MIN_ZOOM_LEVEL) {
      return;
    }
    if (target === ApplyZoomTarget.ALL_WINDOWS) {
      await configurationService.updateValue(_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY, level);
    }
    applyZoom(level, target);
  }
};
_BaseZoomAction.ZOOM_LEVEL_SETTING_KEY = "window.zoomLevel";
_BaseZoomAction.ZOOM_PER_WINDOW_SETTING_KEY = "window.zoomPerWindow";
let BaseZoomAction = _BaseZoomAction;
class ZoomInAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomIn",
      title: {
        ...localize2("zoomIn", "Zoom In"),
        mnemonicTitle: localize({ key: "miZoomIn", comment: ["&& denotes a mnemonic"] }, "&&Zoom In")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Equal,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Equal, KeyMod.CtrlCmd | KeyCode.NumpadAdd]
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 1
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) + 1);
  }
}
class ZoomOutAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomOut",
      title: {
        ...localize2("zoomOut", "Zoom Out"),
        mnemonicTitle: localize({ key: "miZoomOut", comment: ["&& denotes a mnemonic"] }, "&&Zoom Out")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Minus,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Minus, KeyMod.CtrlCmd | KeyCode.NumpadSubtract],
        linux: {
          primary: KeyMod.CtrlCmd | KeyCode.Minus,
          secondary: [KeyMod.CtrlCmd | KeyCode.NumpadSubtract]
        }
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 2
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, getZoomLevel(getActiveWindow()) - 1);
  }
}
class ZoomResetAction extends BaseZoomAction {
  constructor() {
    super({
      id: "workbench.action.zoomReset",
      title: {
        ...localize2("zoomReset", "Reset Zoom"),
        mnemonicTitle: localize({ key: "miZoomReset", comment: ["&& denotes a mnemonic"] }, "&&Reset Zoom")
      },
      category: Categories.View,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Numpad0
      },
      menu: {
        id: MenuId.MenubarAppearanceMenu,
        group: "5_zoom",
        order: 3
      }
    });
  }
  run(accessor) {
    return super.setZoomLevel(accessor, true);
  }
}
class BaseSwitchWindow extends Action2 {
  constructor() {
    super(...arguments);
    this.closeWindowAction = {
      iconClass: ThemeIcon.asClassName(Codicon.removeClose),
      tooltip: localize("close", "Close Window")
    };
    this.closeDirtyWindowAction = {
      iconClass: "dirty-window " + ThemeIcon.asClassName(Codicon.closeDirty),
      tooltip: localize("close", "Close Window"),
      alwaysVisible: true
    };
    this.closeActiveWindowAction = {
      iconClass: "active-window " + ThemeIcon.asClassName(Codicon.windowActive),
      tooltip: localize("closeActive", "Close Active Window"),
      alwaysVisible: true
    };
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const keybindingService = accessor.get(IKeybindingService);
    const modelService = accessor.get(IModelService);
    const languageService = accessor.get(ILanguageService);
    const nativeHostService = accessor.get(INativeHostService);
    const currentWindowId = getActiveWindow().vscodeWindowId;
    const windows = await nativeHostService.getWindows({ includeAuxiliaryWindows: true });
    const mainWindows = /* @__PURE__ */ new Set();
    const mapMainWindowToAuxiliaryWindows = /* @__PURE__ */ new Map();
    for (const window of windows) {
      if (isOpenedAuxiliaryWindow(window)) {
        let auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.parentId);
        if (!auxiliaryWindows) {
          auxiliaryWindows = /* @__PURE__ */ new Set();
          mapMainWindowToAuxiliaryWindows.set(window.parentId, auxiliaryWindows);
        }
        auxiliaryWindows.add(window);
      } else {
        mainWindows.add(window);
      }
    }
    function isWindowPickItem(candidate) {
      const windowPickItem = candidate;
      return typeof windowPickItem?.windowId === "number";
    }
    const picks = [];
    for (const window of mainWindows) {
      const auxiliaryWindows = mapMainWindowToAuxiliaryWindows.get(window.id);
      if (mapMainWindowToAuxiliaryWindows.size > 0) {
        picks.push({ type: "separator", label: auxiliaryWindows ? localize("windowGroup", "window group") : void 0 });
      }
      const resource = window.filename ? URI.file(window.filename) : isSingleFolderWorkspaceIdentifier(window.workspace) ? window.workspace.uri : isWorkspaceIdentifier(window.workspace) ? window.workspace.configPath : void 0;
      const fileKind = window.filename ? FileKind.FILE : isSingleFolderWorkspaceIdentifier(window.workspace) ? FileKind.FOLDER : isWorkspaceIdentifier(window.workspace) ? FileKind.ROOT_FOLDER : FileKind.FILE;
      const pick2 = {
        windowId: window.id,
        label: window.title,
        ariaLabel: window.dirty ? localize("windowDirtyAriaLabel", "{0}, window with unsaved changes", window.title) : window.title,
        iconClasses: getIconClasses(modelService, languageService, resource, fileKind),
        description: currentWindowId === window.id ? localize("current", "Current Window") : void 0,
        buttons: window.dirty ? [this.closeDirtyWindowAction] : currentWindowId === window.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
      };
      picks.push(pick2);
      if (auxiliaryWindows) {
        for (const auxiliaryWindow of auxiliaryWindows) {
          const pick3 = {
            windowId: auxiliaryWindow.id,
            label: auxiliaryWindow.title,
            iconClasses: getIconClasses(modelService, languageService, auxiliaryWindow.filename ? URI.file(auxiliaryWindow.filename) : void 0, FileKind.FILE),
            description: currentWindowId === auxiliaryWindow.id ? localize("current", "Current Window") : void 0,
            buttons: currentWindowId === auxiliaryWindow.id ? [this.closeActiveWindowAction] : [this.closeWindowAction]
          };
          picks.push(pick3);
        }
      }
    }
    const pick = await quickInputService.pick(picks, {
      contextKey: "inWindowsPicker",
      activeItem: (() => {
        for (let i = 0; i < picks.length; i++) {
          const pick2 = picks[i];
          if (isWindowPickItem(pick2) && pick2.windowId === currentWindowId) {
            let nextPick = picks[i + 1];
            if (isWindowPickItem(nextPick)) {
              return nextPick;
            }
            nextPick = picks[i + 2];
            if (isWindowPickItem(nextPick)) {
              return nextPick;
            }
          }
        }
        return void 0;
      })(),
      placeHolder: localize("switchWindowPlaceHolder", "Select a window to switch to"),
      quickNavigate: this.isQuickNavigate() ? { keybindings: keybindingService.lookupKeybindings(this.desc.id) } : void 0,
      hideInput: this.isQuickNavigate(),
      onDidTriggerItemButton: async (context) => {
        await nativeHostService.closeWindow({ targetWindowId: context.item.windowId });
        context.removeItem();
      }
    });
    if (pick) {
      nativeHostService.focusWindow({ targetWindowId: pick.windowId });
    }
  }
}
class SwitchWindowAction extends BaseSwitchWindow {
  constructor() {
    super({
      id: "workbench.action.switchWindow",
      title: localize2("switchWindow", "Switch Window..."),
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: 0,
        mac: { primary: KeyMod.WinCtrl | KeyCode.KeyW }
      }
    });
  }
  isQuickNavigate() {
    return false;
  }
}
class QuickSwitchWindowAction extends BaseSwitchWindow {
  constructor() {
    super({
      id: "workbench.action.quickSwitchWindow",
      title: localize2("quickSwitchWindow", "Quick Switch Window..."),
      f1: false
      // hide quick pickers from command palette to not confuse with the other entry that shows a input field
    });
  }
  isQuickNavigate() {
    return true;
  }
}
class SwitchToMainWindowAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.switchToMainWindow",
      title: localize2("switchToMainWindow", "Switch to Main Window"),
      f1: true,
      precondition: IsAuxiliaryWindowContext
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    return nativeHostService.focusWindow({ targetWindowId: mainWindow.vscodeWindowId });
  }
}
const _FocusWindowAction = class _FocusWindowAction extends Action2 {
  constructor() {
    super({
      id: _FocusWindowAction.ID,
      title: localize2("focusWindow", "Focus Window"),
      f1: true
    });
  }
  async run(accessor) {
    const hostService = accessor.get(IHostService);
    await hostService.focus(getActiveWindow(), { mode: FocusMode.Force });
  }
};
_FocusWindowAction.ID = "workbench.action.focusWindow";
let FocusWindowAction = _FocusWindowAction;
function canRunNativeTabsHandler(accessor) {
  if (!isMacintosh) {
    return false;
  }
  const configurationService = accessor.get(IConfigurationService);
  return configurationService.getValue("window.nativeTabs") === true;
}
const NewWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).newWindowTab();
};
const ShowPreviousWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).showPreviousWindowTab();
};
const ShowNextWindowTabHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).showNextWindowTab();
};
const MoveWindowTabToNewWindowHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).moveWindowTabToNewWindow();
};
const MergeWindowTabsHandlerHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).mergeAllWindowTabs();
};
const ToggleWindowTabsBarHandler = function(accessor) {
  if (!canRunNativeTabsHandler(accessor)) {
    return;
  }
  return accessor.get(INativeHostService).toggleWindowTabsBar();
};
const _ToggleWindowAlwaysOnTopAction = class _ToggleWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _ToggleWindowAlwaysOnTopAction.ID,
      title: localize2("toggleWindowAlwaysOnTop", "Toggle Window Always on Top"),
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.toggleWindowAlwaysOnTop({ targetWindowId: getActiveWindow().vscodeWindowId });
  }
};
_ToggleWindowAlwaysOnTopAction.ID = "workbench.action.toggleWindowAlwaysOnTop";
let ToggleWindowAlwaysOnTopAction = _ToggleWindowAlwaysOnTopAction;
const _EnableWindowAlwaysOnTopAction = class _EnableWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _EnableWindowAlwaysOnTopAction.ID,
      title: localize("enableWindowAlwaysOnTop", "Turn On Always on Top"),
      icon: Codicon.pin,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext.toNegated(), IsAuxiliaryWindowContext),
        order: 1,
        group: "navigation"
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.setWindowAlwaysOnTop(true, { targetWindowId: targetWindow.vscodeWindowId });
  }
};
_EnableWindowAlwaysOnTopAction.ID = "workbench.action.enableWindowAlwaysOnTop";
let EnableWindowAlwaysOnTopAction = _EnableWindowAlwaysOnTopAction;
const _DisableWindowAlwaysOnTopAction = class _DisableWindowAlwaysOnTopAction extends Action2 {
  constructor() {
    super({
      id: _DisableWindowAlwaysOnTopAction.ID,
      title: localize("disableWindowAlwaysOnTop", "Turn Off Always on Top"),
      icon: Codicon.pinned,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsWindowAlwaysOnTopContext, IsAuxiliaryWindowContext),
        order: 1,
        group: "navigation"
      }
    });
  }
  async run(accessor) {
    const nativeHostService = accessor.get(INativeHostService);
    const targetWindow = getActiveWindow();
    if (!isAuxiliaryWindow(targetWindow.window)) {
      return;
    }
    return nativeHostService.setWindowAlwaysOnTop(false, { targetWindowId: targetWindow.vscodeWindowId });
  }
};
_DisableWindowAlwaysOnTopAction.ID = "workbench.action.disableWindowAlwaysOnTop";
let DisableWindowAlwaysOnTopAction = _DisableWindowAlwaysOnTopAction;
export {
  CloseOtherWindowsAction,
  CloseWindowAction,
  DisableWindowAlwaysOnTopAction,
  EnableWindowAlwaysOnTopAction,
  FocusWindowAction,
  MergeWindowTabsHandlerHandler,
  MoveWindowTabToNewWindowHandler,
  NewWindowTabHandler,
  QuickSwitchWindowAction,
  ShowNextWindowTabHandler,
  ShowPreviousWindowTabHandler,
  SwitchToMainWindowAction,
  SwitchWindowAction,
  ToggleWindowAlwaysOnTopAction,
  ToggleWindowTabsBarHandler,
  ZoomInAction,
  ZoomOutAction,
  ZoomResetAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hY3Rpb25zLmNzcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBcHBseVpvb21UYXJnZXQsIE1BWF9aT09NX0xFVkVMLCBNSU5fWk9PTV9MRVZFTCwgYXBwbHlab29tIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2VsZWN0cm9uLWJyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZ2V0Wm9vbUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSwgRm9jdXNNb2RlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzV29ya3NwYWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU9wZW5lZEF1eGlsaWFyeVdpbmRvdywgSU9wZW5lZE1haW5XaW5kb3csIGlzT3BlbmVkQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0LCBJc1dpbmRvd0Fsd2F5c09uVG9wQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBpc0F1eGlsaWFyeVdpbmRvdywgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuZXhwb3J0IGNsYXNzIENsb3NlV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VXaW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDbG9zZVdpbmRvd0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignY2xvc2VXaW5kb3cnLCBcIkNsb3NlIFdpbmRvd1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUNsb3NlV2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkNsb3MmJmUgV2luZG93XCIpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlXIH0sXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5V10gfSxcblx0XHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY0LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5V10gfVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRmlsZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNl9jbG9zZScsXG5cdFx0XHRcdG9yZGVyOiA0XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIG5hdGl2ZUhvc3RTZXJ2aWNlLmNsb3NlV2luZG93KHsgdGFyZ2V0V2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDbG9zZU90aGVyV2luZG93c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VPdGhlcldpbmRvd3MnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDbG9zZU90aGVyV2luZG93c0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlT3RoZXJXaW5kb3dzJywgXCJDbG9zZSBPdGhlciBXaW5kb3dzXCIpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSk7XG5cblx0XHRjb25zdCBjdXJyZW50V2luZG93SWQgPSBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZDtcblx0XHRjb25zdCB3aW5kb3dzID0gYXdhaXQgbmF0aXZlSG9zdFNlcnZpY2UuZ2V0V2luZG93cyh7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBmYWxzZSB9KTtcblxuXHRcdGZvciAoY29uc3Qgd2luZG93IG9mIHdpbmRvd3MpIHtcblx0XHRcdGlmICh3aW5kb3cuaWQgIT09IGN1cnJlbnRXaW5kb3dJZCkge1xuXHRcdFx0XHRuYXRpdmVIb3N0U2VydmljZS5jbG9zZVdpbmRvdyh7IHRhcmdldFdpbmRvd0lkOiB3aW5kb3cuaWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2Vab29tQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgWk9PTV9MRVZFTF9TRVRUSU5HX0tFWSA9ICd3aW5kb3cuem9vbUxldmVsJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgWk9PTV9QRVJfV0lORE9XX1NFVFRJTkdfS0VZID0gJ3dpbmRvdy56b29tUGVyV2luZG93JztcblxuXHRwcm90ZWN0ZWQgYXN5bmMgc2V0Wm9vbUxldmVsKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsZXZlbE9yUmVzZXQ6IG51bWJlciB8IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0bGV0IHRhcmdldDogQXBwbHlab29tVGFyZ2V0O1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShCYXNlWm9vbUFjdGlvbi5aT09NX1BFUl9XSU5ET1dfU0VUVElOR19LRVkpICE9PSBmYWxzZSkge1xuXHRcdFx0dGFyZ2V0ID0gQXBwbHlab29tVGFyZ2V0LkFDVElWRV9XSU5ET1c7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhcmdldCA9IEFwcGx5Wm9vbVRhcmdldC5BTExfV0lORE9XUztcblx0XHR9XG5cblx0XHRsZXQgbGV2ZWw6IG51bWJlcjtcblx0XHRpZiAodHlwZW9mIGxldmVsT3JSZXNldCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGxldmVsID0gTWF0aC5yb3VuZChsZXZlbE9yUmVzZXQpOyAvLyBwcmV2ZW50IGZyYWN0aW9uYWwgem9vbSBsZXZlbHNcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyByZXNldCB0byAwIHdoZW4gd2UgYXBwbHkgdG8gYWxsIHdpbmRvd3Ncblx0XHRcdGlmICh0YXJnZXQgPT09IEFwcGx5Wm9vbVRhcmdldC5BTExfV0lORE9XUykge1xuXHRcdFx0XHRsZXZlbCA9IDA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG90aGVyd2lzZSwgcmVzZXQgdG8gdGhlIGRlZmF1bHQgem9vbSBsZXZlbFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRMZXZlbCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEJhc2Vab29tQWN0aW9uLlpPT01fTEVWRUxfU0VUVElOR19LRVkpO1xuXHRcdFx0XHRpZiAodHlwZW9mIGRlZmF1bHRMZXZlbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRsZXZlbCA9IGRlZmF1bHRMZXZlbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXZlbCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGV2ZWwgPiBNQVhfWk9PTV9MRVZFTCB8fCBsZXZlbCA8IE1JTl9aT09NX0xFVkVMKSB7XG5cdFx0XHRyZXR1cm47IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80ODM1N1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXQgPT09IEFwcGx5Wm9vbVRhcmdldC5BTExfV0lORE9XUykge1xuXHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQmFzZVpvb21BY3Rpb24uWk9PTV9MRVZFTF9TRVRUSU5HX0tFWSwgbGV2ZWwpO1xuXHRcdH1cblxuXHRcdGFwcGx5Wm9vbShsZXZlbCwgdGFyZ2V0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgWm9vbUluQWN0aW9uIGV4dGVuZHMgQmFzZVpvb21BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi56b29tSW4nLFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCd6b29tSW4nLCBcIlpvb20gSW5cIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlab29tSW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZab29tIEluXCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FcXVhbCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVxdWFsLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkQWRkXVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNV96b29tJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBzdXBlci5zZXRab29tTGV2ZWwoYWNjZXNzb3IsIGdldFpvb21MZXZlbChnZXRBY3RpdmVXaW5kb3coKSkgKyAxKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgWm9vbU91dEFjdGlvbiBleHRlbmRzIEJhc2Vab29tQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uem9vbU91dCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3pvb21PdXQnLCBcIlpvb20gT3V0XCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pWm9vbU91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlpvb20gT3V0XCIpLFxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5NaW51cyxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLk1pbnVzLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkU3VidHJhY3RdLFxuXHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5NaW51cyxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkU3VidHJhY3RdXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LFxuXHRcdFx0XHRncm91cDogJzVfem9vbScsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gc3VwZXIuc2V0Wm9vbUxldmVsKGFjY2Vzc29yLCBnZXRab29tTGV2ZWwoZ2V0QWN0aXZlV2luZG93KCkpIC0gMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFpvb21SZXNldEFjdGlvbiBleHRlbmRzIEJhc2Vab29tQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uem9vbVJlc2V0Jyxcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdC4uLmxvY2FsaXplMignem9vbVJlc2V0JywgXCJSZXNldCBab29tXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pWm9vbVJlc2V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVzZXQgWm9vbVwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTnVtcGFkMFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNV96b29tJyxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBzdXBlci5zZXRab29tTGV2ZWwoYWNjZXNzb3IsIHRydWUpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhc2VTd2l0Y2hXaW5kb3cgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNsb3NlV2luZG93QWN0aW9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnJlbW92ZUNsb3NlKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlIFdpbmRvd1wiKVxuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2xvc2VEaXJ0eVdpbmRvd0FjdGlvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiAnZGlydHktd2luZG93ICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZURpcnR5KSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlIFdpbmRvd1wiKSxcblx0XHRhbHdheXNWaXNpYmxlOiB0cnVlXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbG9zZUFjdGl2ZVdpbmRvd0FjdGlvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0aWNvbkNsYXNzOiAnYWN0aXZlLXdpbmRvdyAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ud2luZG93QWN0aXZlKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2xvc2VBY3RpdmUnLCBcIkNsb3NlIEFjdGl2ZSBXaW5kb3dcIiksXG5cdFx0YWx3YXlzVmlzaWJsZTogdHJ1ZVxuXHR9O1xuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpc1F1aWNrTmF2aWdhdGUoKTogYm9vbGVhbjtcblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY3VycmVudFdpbmRvd0lkID0gZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWQ7XG5cblx0XHRjb25zdCB3aW5kb3dzID0gYXdhaXQgbmF0aXZlSG9zdFNlcnZpY2UuZ2V0V2luZG93cyh7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgbWFpbldpbmRvd3MgPSBuZXcgU2V0PElPcGVuZWRNYWluV2luZG93PigpO1xuXHRcdGNvbnN0IG1hcE1haW5XaW5kb3dUb0F1eGlsaWFyeVdpbmRvd3MgPSBuZXcgTWFwPG51bWJlciwgU2V0PElPcGVuZWRBdXhpbGlhcnlXaW5kb3c+PigpO1xuXHRcdGZvciAoY29uc3Qgd2luZG93IG9mIHdpbmRvd3MpIHtcblx0XHRcdGlmIChpc09wZW5lZEF1eGlsaWFyeVdpbmRvdyh3aW5kb3cpKSB7XG5cdFx0XHRcdGxldCBhdXhpbGlhcnlXaW5kb3dzID0gbWFwTWFpbldpbmRvd1RvQXV4aWxpYXJ5V2luZG93cy5nZXQod2luZG93LnBhcmVudElkKTtcblx0XHRcdFx0aWYgKCFhdXhpbGlhcnlXaW5kb3dzKSB7XG5cdFx0XHRcdFx0YXV4aWxpYXJ5V2luZG93cyA9IG5ldyBTZXQ8SU9wZW5lZEF1eGlsaWFyeVdpbmRvdz4oKTtcblx0XHRcdFx0XHRtYXBNYWluV2luZG93VG9BdXhpbGlhcnlXaW5kb3dzLnNldCh3aW5kb3cucGFyZW50SWQsIGF1eGlsaWFyeVdpbmRvd3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF1eGlsaWFyeVdpbmRvd3MuYWRkKHdpbmRvdyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYWluV2luZG93cy5hZGQod2luZG93KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpbnRlcmZhY2UgSVdpbmRvd1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0cmVhZG9ubHkgd2luZG93SWQ6IG51bWJlcjtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBpc1dpbmRvd1BpY2tJdGVtKGNhbmRpZGF0ZTogdW5rbm93bik6IGNhbmRpZGF0ZSBpcyBJV2luZG93UGlja0l0ZW0ge1xuXHRcdFx0Y29uc3Qgd2luZG93UGlja0l0ZW0gPSBjYW5kaWRhdGUgYXMgSVdpbmRvd1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4gdHlwZW9mIHdpbmRvd1BpY2tJdGVtPy53aW5kb3dJZCA9PT0gJ251bWJlcic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja3M6IEFycmF5PFF1aWNrUGlja0lucHV0PElXaW5kb3dQaWNrSXRlbT4+ID0gW107XG5cdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgbWFpbldpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvd3MgPSBtYXBNYWluV2luZG93VG9BdXhpbGlhcnlXaW5kb3dzLmdldCh3aW5kb3cuaWQpO1xuXHRcdFx0aWYgKG1hcE1haW5XaW5kb3dUb0F1eGlsaWFyeVdpbmRvd3Muc2l6ZSA+IDApIHtcblx0XHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogYXV4aWxpYXJ5V2luZG93cyA/IGxvY2FsaXplKCd3aW5kb3dHcm91cCcsIFwid2luZG93IGdyb3VwXCIpIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHdpbmRvdy5maWxlbmFtZSA/IFVSSS5maWxlKHdpbmRvdy5maWxlbmFtZSkgOiBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod2luZG93LndvcmtzcGFjZSkgPyB3aW5kb3cud29ya3NwYWNlLnVyaSA6IGlzV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cud29ya3NwYWNlKSA/IHdpbmRvdy53b3Jrc3BhY2UuY29uZmlnUGF0aCA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGZpbGVLaW5kID0gd2luZG93LmZpbGVuYW1lID8gRmlsZUtpbmQuRklMRSA6IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cud29ya3NwYWNlKSA/IEZpbGVLaW5kLkZPTERFUiA6IGlzV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cud29ya3NwYWNlKSA/IEZpbGVLaW5kLlJPT1RfRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblx0XHRcdGNvbnN0IHBpY2s6IElXaW5kb3dQaWNrSXRlbSA9IHtcblx0XHRcdFx0d2luZG93SWQ6IHdpbmRvdy5pZCxcblx0XHRcdFx0bGFiZWw6IHdpbmRvdy50aXRsZSxcblx0XHRcdFx0YXJpYUxhYmVsOiB3aW5kb3cuZGlydHkgPyBsb2NhbGl6ZSgnd2luZG93RGlydHlBcmlhTGFiZWwnLCBcInswfSwgd2luZG93IHdpdGggdW5zYXZlZCBjaGFuZ2VzXCIsIHdpbmRvdy50aXRsZSkgOiB3aW5kb3cudGl0bGUsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgcmVzb3VyY2UsIGZpbGVLaW5kKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IChjdXJyZW50V2luZG93SWQgPT09IHdpbmRvdy5pZCkgPyBsb2NhbGl6ZSgnY3VycmVudCcsIFwiQ3VycmVudCBXaW5kb3dcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJ1dHRvbnM6IHdpbmRvdy5kaXJ0eSA/IFt0aGlzLmNsb3NlRGlydHlXaW5kb3dBY3Rpb25dIDogY3VycmVudFdpbmRvd0lkID09PSB3aW5kb3cuaWQgPyBbdGhpcy5jbG9zZUFjdGl2ZVdpbmRvd0FjdGlvbl0gOiBbdGhpcy5jbG9zZVdpbmRvd0FjdGlvbl1cblx0XHRcdH07XG5cdFx0XHRwaWNrcy5wdXNoKHBpY2spO1xuXG5cdFx0XHRpZiAoYXV4aWxpYXJ5V2luZG93cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGF1eGlsaWFyeVdpbmRvdyBvZiBhdXhpbGlhcnlXaW5kb3dzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGljazogSVdpbmRvd1BpY2tJdGVtID0ge1xuXHRcdFx0XHRcdFx0d2luZG93SWQ6IGF1eGlsaWFyeVdpbmRvdy5pZCxcblx0XHRcdFx0XHRcdGxhYmVsOiBhdXhpbGlhcnlXaW5kb3cudGl0bGUsXG5cdFx0XHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXMobW9kZWxTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UsIGF1eGlsaWFyeVdpbmRvdy5maWxlbmFtZSA/IFVSSS5maWxlKGF1eGlsaWFyeVdpbmRvdy5maWxlbmFtZSkgOiB1bmRlZmluZWQsIEZpbGVLaW5kLkZJTEUpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IChjdXJyZW50V2luZG93SWQgPT09IGF1eGlsaWFyeVdpbmRvdy5pZCkgPyBsb2NhbGl6ZSgnY3VycmVudCcsIFwiQ3VycmVudCBXaW5kb3dcIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRidXR0b25zOiBjdXJyZW50V2luZG93SWQgPT09IGF1eGlsaWFyeVdpbmRvdy5pZCA/IFt0aGlzLmNsb3NlQWN0aXZlV2luZG93QWN0aW9uXSA6IFt0aGlzLmNsb3NlV2luZG93QWN0aW9uXVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cGlja3MucHVzaChwaWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7XG5cdFx0XHRjb250ZXh0S2V5OiAnaW5XaW5kb3dzUGlja2VyJyxcblx0XHRcdGFjdGl2ZUl0ZW06ICgoKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGlja3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBwaWNrID0gcGlja3NbaV07XG5cdFx0XHRcdFx0aWYgKGlzV2luZG93UGlja0l0ZW0ocGljaykgJiYgcGljay53aW5kb3dJZCA9PT0gY3VycmVudFdpbmRvd0lkKSB7XG5cdFx0XHRcdFx0XHRsZXQgbmV4dFBpY2sgPSBwaWNrc1tpICsgMV07IC8vIHRyeSB0byBzZWxlY3QgbmV4dCB3aW5kb3cgdW5sZXNzIGl0J3MgYSBzZXBhcmF0b3Jcblx0XHRcdFx0XHRcdGlmIChpc1dpbmRvd1BpY2tJdGVtKG5leHRQaWNrKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbmV4dFBpY2s7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdG5leHRQaWNrID0gcGlja3NbaSArIDJdOyAvLyBvdGhlcndpc2UgdHJ5IHRvIHNlbGVjdCB0aGUgbmV4dCB3aW5kb3cgYWZ0ZXIgdGhlIHNlcGFyYXRvclxuXHRcdFx0XHRcdFx0aWYgKGlzV2luZG93UGlja0l0ZW0obmV4dFBpY2spKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBuZXh0UGljaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSkoKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc3dpdGNoV2luZG93UGxhY2VIb2xkZXInLCBcIlNlbGVjdCBhIHdpbmRvdyB0byBzd2l0Y2ggdG9cIiksXG5cdFx0XHRxdWlja05hdmlnYXRlOiB0aGlzLmlzUXVpY2tOYXZpZ2F0ZSgpID8geyBrZXliaW5kaW5nczoga2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZ3ModGhpcy5kZXNjLmlkKSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0aGlkZUlucHV0OiB0aGlzLmlzUXVpY2tOYXZpZ2F0ZSgpLFxuXHRcdFx0b25EaWRUcmlnZ2VySXRlbUJ1dHRvbjogYXN5bmMgY29udGV4dCA9PiB7XG5cdFx0XHRcdGF3YWl0IG5hdGl2ZUhvc3RTZXJ2aWNlLmNsb3NlV2luZG93KHsgdGFyZ2V0V2luZG93SWQ6IGNvbnRleHQuaXRlbS53aW5kb3dJZCB9KTtcblx0XHRcdFx0Y29udGV4dC5yZW1vdmVJdGVtKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocGljaykge1xuXHRcdFx0bmF0aXZlSG9zdFNlcnZpY2UuZm9jdXNXaW5kb3coeyB0YXJnZXRXaW5kb3dJZDogcGljay53aW5kb3dJZCB9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN3aXRjaFdpbmRvd0FjdGlvbiBleHRlbmRzIEJhc2VTd2l0Y2hXaW5kb3cge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5zd2l0Y2hXaW5kb3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc3dpdGNoV2luZG93JywgJ1N3aXRjaCBXaW5kb3cuLi4nKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlXIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBpc1F1aWNrTmF2aWdhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBRdWlja1N3aXRjaFdpbmRvd0FjdGlvbiBleHRlbmRzIEJhc2VTd2l0Y2hXaW5kb3cge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5xdWlja1N3aXRjaFdpbmRvdycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdxdWlja1N3aXRjaFdpbmRvdycsICdRdWljayBTd2l0Y2ggV2luZG93Li4uJyksXG5cdFx0XHRmMTogZmFsc2UgLy8gaGlkZSBxdWljayBwaWNrZXJzIGZyb20gY29tbWFuZCBwYWxldHRlIHRvIG5vdCBjb25mdXNlIHdpdGggdGhlIG90aGVyIGVudHJ5IHRoYXQgc2hvd3MgYSBpbnB1dCBmaWVsZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzUXVpY2tOYXZpZ2F0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3dpdGNoVG9NYWluV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnN3aXRjaFRvTWFpbldpbmRvdycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzd2l0Y2hUb01haW5XaW5kb3cnLCBcIlN3aXRjaCB0byBNYWluIFdpbmRvd1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSk7XG5cdFx0cmV0dXJuIG5hdGl2ZUhvc3RTZXJ2aWNlLmZvY3VzV2luZG93KHsgdGFyZ2V0V2luZG93SWQ6IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNXaW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBGb2N1c1dpbmRvd0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzV2luZG93JywgXCJGb2N1cyBXaW5kb3dcIiksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblxuXHRcdC8vIEJyaW5nIHRoZSBjdXJyZW50IHdpbmRvdyB0byB0aGUgZm9yZWdyb3VuZCBhbmQgZm9jdXMgaXQuIGBGb2N1c01vZGUuRm9yY2VgIGlzIHVzZWQgYmVjYXVzZVxuXHRcdC8vIHRoZSBhcHBsaWNhdGlvbiBtYXkgbm90IGJlIGFjdGl2ZSAoZm9yIGV4YW1wbGUgd2hlbiB0aGlzIHJ1bnMgZnJvbSBhIHN5c3RlbS13aWRlIGtleWJpbmRpbmdcblx0XHQvLyB3aGlsZSBhbm90aGVyIGFwcCBvd25zIE9TIGZvY3VzKS4gVGhpcyBtYWtlcyBpdCB1c2FibGUgYXMgdGhlIGZpcnN0IHN0ZXAgb2YgYSBgcnVuQ29tbWFuZHNgXG5cdFx0Ly8gY2hhaW4gdGhhdCByZXZlYWxzIHRoZSB3aW5kb3cgYmVmb3JlIHJ1bm5pbmcgYSBjb21tYW5kIHdoaWNoIHN1cmZhY2VzIFVJIGluIGl0IChlLmcuIFF1aWNrXG5cdFx0Ly8gT3BlbikuXG5cdFx0YXdhaXQgaG9zdFNlcnZpY2UuZm9jdXMoZ2V0QWN0aXZlV2luZG93KCksIHsgbW9kZTogRm9jdXNNb2RlLkZvcmNlIH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNhblJ1bk5hdGl2ZVRhYnNIYW5kbGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogYm9vbGVhbiB7XG5cdGlmICghaXNNYWNpbnRvc2gpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8dW5rbm93bj4oJ3dpbmRvdy5uYXRpdmVUYWJzJykgPT09IHRydWU7XG59XG5cbmV4cG9ydCBjb25zdCBOZXdXaW5kb3dUYWJIYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIgPSBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0aWYgKCFjYW5SdW5OYXRpdmVUYWJzSGFuZGxlcihhY2Nlc3NvcikpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSkubmV3V2luZG93VGFiKCk7XG59O1xuXG5leHBvcnQgY29uc3QgU2hvd1ByZXZpb3VzV2luZG93VGFiSGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGlmICghY2FuUnVuTmF0aXZlVGFic0hhbmRsZXIoYWNjZXNzb3IpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpLnNob3dQcmV2aW91c1dpbmRvd1RhYigpO1xufTtcblxuZXhwb3J0IGNvbnN0IFNob3dOZXh0V2luZG93VGFiSGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGlmICghY2FuUnVuTmF0aXZlVGFic0hhbmRsZXIoYWNjZXNzb3IpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpLnNob3dOZXh0V2luZG93VGFiKCk7XG59O1xuXG5leHBvcnQgY29uc3QgTW92ZVdpbmRvd1RhYlRvTmV3V2luZG93SGFuZGxlcjogSUNvbW1hbmRIYW5kbGVyID0gZnVuY3Rpb24gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGlmICghY2FuUnVuTmF0aXZlVGFic0hhbmRsZXIoYWNjZXNzb3IpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpLm1vdmVXaW5kb3dUYWJUb05ld1dpbmRvdygpO1xufTtcblxuZXhwb3J0IGNvbnN0IE1lcmdlV2luZG93VGFic0hhbmRsZXJIYW5kbGVyOiBJQ29tbWFuZEhhbmRsZXIgPSBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0aWYgKCFjYW5SdW5OYXRpdmVUYWJzSGFuZGxlcihhY2Nlc3NvcikpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSkubWVyZ2VBbGxXaW5kb3dUYWJzKCk7XG59O1xuXG5leHBvcnQgY29uc3QgVG9nZ2xlV2luZG93VGFic0JhckhhbmRsZXI6IElDb21tYW5kSGFuZGxlciA9IGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRpZiAoIWNhblJ1bk5hdGl2ZVRhYnNIYW5kbGVyKGFjY2Vzc29yKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHJldHVybiBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKS50b2dnbGVXaW5kb3dUYWJzQmFyKCk7XG59O1xuXG5leHBvcnQgY2xhc3MgVG9nZ2xlV2luZG93QWx3YXlzT25Ub3BBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVXaW5kb3dBbHdheXNPblRvcCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlV2luZG93QWx3YXlzT25Ub3AnLCBcIlRvZ2dsZSBXaW5kb3cgQWx3YXlzIG9uIFRvcFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBJc0F1eGlsaWFyeVdpbmRvd0ZvY3VzZWRDb250ZXh0XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0aWYgKCFpc0F1eGlsaWFyeVdpbmRvdyh0YXJnZXRXaW5kb3cud2luZG93KSkge1xuXHRcdFx0cmV0dXJuOyAvLyBDdXJyZW50bHksIHdlIG9ubHkgc3VwcG9ydCB0b2dnbGluZyBhbHdheXMgb24gdG9wIGZvciBhdXhpbGlhcnkgd2luZG93c1xuXHRcdH1cblxuXHRcdHJldHVybiBuYXRpdmVIb3N0U2VydmljZS50b2dnbGVXaW5kb3dBbHdheXNPblRvcCh7IHRhcmdldFdpbmRvd0lkOiBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlV2luZG93QWx3YXlzT25Ub3BBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5lbmFibGVXaW5kb3dBbHdheXNPblRvcCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVuYWJsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdlbmFibGVXaW5kb3dBbHdheXNPblRvcCcsIFwiVHVybiBPbiBBbHdheXMgb24gVG9wXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5waW4sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1dpbmRvd0Fsd2F5c09uVG9wQ29udGV4dC50b05lZ2F0ZWQoKSwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRpZiAoIWlzQXV4aWxpYXJ5V2luZG93KHRhcmdldFdpbmRvdy53aW5kb3cpKSB7XG5cdFx0XHRyZXR1cm47IC8vIEN1cnJlbnRseSwgd2Ugb25seSBzdXBwb3J0IHRvZ2dsaW5nIGFsd2F5cyBvbiB0b3AgZm9yIGF1eGlsaWFyeSB3aW5kb3dzXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5hdGl2ZUhvc3RTZXJ2aWNlLnNldFdpbmRvd0Fsd2F5c09uVG9wKHRydWUsIHsgdGFyZ2V0V2luZG93SWQ6IHRhcmdldFdpbmRvdy52c2NvZGVXaW5kb3dJZCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZGlzYWJsZVdpbmRvd0Fsd2F5c09uVG9wJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRGlzYWJsZVdpbmRvd0Fsd2F5c09uVG9wQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdkaXNhYmxlV2luZG93QWx3YXlzT25Ub3AnLCBcIlR1cm4gT2ZmIEFsd2F5cyBvbiBUb3BcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnBpbm5lZCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzV2luZG93QWx3YXlzT25Ub3BDb250ZXh0LCBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQpLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGlmICghaXNBdXhpbGlhcnlXaW5kb3codGFyZ2V0V2luZG93LndpbmRvdykpIHtcblx0XHRcdHJldHVybjsgLy8gQ3VycmVudGx5LCB3ZSBvbmx5IHN1cHBvcnQgdG9nZ2xpbmcgYWx3YXlzIG9uIHRvcCBmb3IgYXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHR9XG5cblx0XHRyZXR1cm4gbmF0aXZlSG9zdFNlcnZpY2Uuc2V0V2luZG93QWx3YXlzT25Ub3AoZmFsc2UsIHsgdGFyZ2V0V2luZG93SWQ6IHRhcmdldFdpbmRvdy52c2NvZGVXaW5kb3dJZCB9KTtcblx0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
