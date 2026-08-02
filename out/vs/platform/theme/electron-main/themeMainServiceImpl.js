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
import electron from "electron";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IStateService } from "../../state/node/state.js";
import { ThemeTypeSelector } from "../common/theme.js";
import { coalesce } from "../../../base/common/arrays.js";
import { getAllWindowsExcludingOffscreen } from "../../windows/electron-main/windows.js";
import { ILogService, LogLevel } from "../../log/common/log.js";
const DEFAULT_BG_LIGHT = "#FFFFFF";
const DEFAULT_BG_DARK = "#1F1F1F";
const DEFAULT_BG_HC_BLACK = "#000000";
const DEFAULT_BG_HC_LIGHT = "#FFFFFF";
const THEME_STORAGE_KEY = "theme";
const THEME_BG_STORAGE_KEY = "themeBackground";
const THEME_WINDOW_SPLASH_KEY = "windowSplash";
const THEME_WINDOW_SPLASH_OVERRIDE_KEY = "windowSplashWorkspaceOverride";
class Setting {
  constructor(key, defaultValue) {
    this.key = key;
    this.defaultValue = defaultValue;
  }
  getValue(configurationService) {
    return configurationService.getValue(this.key) ?? this.defaultValue;
  }
}
((Setting2) => {
  Setting2.DETECT_COLOR_SCHEME = new Setting2("window.autoDetectColorScheme", false);
  Setting2.DETECT_HC = new Setting2("window.autoDetectHighContrast", true);
  Setting2.SYSTEM_COLOR_THEME = new Setting2("window.systemColorTheme", "default");
  Setting2.AUXILIARYBAR_DEFAULT_VISIBILITY = new Setting2("workbench.secondarySideBar.defaultVisibility", "visibleInWorkspace");
  Setting2.STARTUP_EDITOR = new Setting2("workbench.startupEditor", "welcomePage");
})(Setting || (Setting = {}));
let ThemeMainService = class extends Disposable {
  constructor(stateService, configurationService, logService) {
    super();
    this.stateService = stateService;
    this.configurationService = configurationService;
    this.logService = logService;
    this._onDidChangeColorScheme = this._register(new Emitter());
    this.onDidChangeColorScheme = this._onDidChangeColorScheme.event;
    if (!isLinux) {
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(Setting.SYSTEM_COLOR_THEME.key) || e.affectsConfiguration(Setting.DETECT_COLOR_SCHEME.key)) {
          this.updateSystemColorTheme();
          this.logThemeSettings();
        }
      }));
    }
    this.updateSystemColorTheme();
    this.logThemeSettings();
    this._register(Event.fromNodeEventEmitter(electron.nativeTheme, "updated")(() => {
      this.logThemeSettings();
      this._onDidChangeColorScheme.fire(this.getColorScheme());
    }));
  }
  logThemeSettings() {
    if (this.logService.getLevel() >= LogLevel.Debug) {
      const logSetting = (setting) => `${setting.key}=${setting.getValue(this.configurationService)}`;
      this.logService.debug(`[theme main service] ${logSetting(Setting.DETECT_COLOR_SCHEME)}, ${logSetting(Setting.DETECT_HC)}, ${logSetting(Setting.SYSTEM_COLOR_THEME)}`);
      const logProperty = (property) => `${String(property)}=${electron.nativeTheme[property]}`;
      this.logService.debug(`[theme main service] electron.nativeTheme: ${logProperty("themeSource")}, ${logProperty("shouldUseDarkColors")}, ${logProperty("shouldUseHighContrastColors")}, ${logProperty("shouldUseInvertedColorScheme")}, ${logProperty("shouldUseDarkColorsForSystemIntegratedUI")}	`);
      this.logService.debug(`[theme main service] New color scheme: ${JSON.stringify(this.getColorScheme())}`);
    }
  }
  updateSystemColorTheme() {
    if (isLinux || this.isAutoDetectColorScheme()) {
      electron.nativeTheme.themeSource = "system";
    } else {
      switch (Setting.SYSTEM_COLOR_THEME.getValue(this.configurationService)) {
        case "dark":
          electron.nativeTheme.themeSource = "dark";
          break;
        case "light":
          electron.nativeTheme.themeSource = "light";
          break;
        case "auto":
          switch (this.getPreferredBaseTheme() ?? this.getStoredBaseTheme()) {
            case ThemeTypeSelector.VS:
              electron.nativeTheme.themeSource = "light";
              break;
            case ThemeTypeSelector.VS_DARK:
              electron.nativeTheme.themeSource = "dark";
              break;
            default:
              electron.nativeTheme.themeSource = "system";
          }
          break;
        default:
          electron.nativeTheme.themeSource = "system";
          break;
      }
    }
  }
  getColorScheme() {
    if (isWindows) {
      if (electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: electron.nativeTheme.shouldUseInvertedColorScheme, highContrast: true };
      }
    } else if (isMacintosh) {
      if (electron.nativeTheme.shouldUseInvertedColorScheme || electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: electron.nativeTheme.shouldUseDarkColors, highContrast: true };
      }
    } else if (isLinux) {
      if (electron.nativeTheme.shouldUseHighContrastColors) {
        return { dark: true, highContrast: true };
      }
    }
    return {
      dark: electron.nativeTheme.shouldUseDarkColors,
      highContrast: false
    };
  }
  getPreferredBaseTheme() {
    const colorScheme = this.getColorScheme();
    if (Setting.DETECT_HC.getValue(this.configurationService) && colorScheme.highContrast) {
      return colorScheme.dark ? ThemeTypeSelector.HC_BLACK : ThemeTypeSelector.HC_LIGHT;
    }
    if (this.isAutoDetectColorScheme()) {
      return colorScheme.dark ? ThemeTypeSelector.VS_DARK : ThemeTypeSelector.VS;
    }
    return void 0;
  }
  isAutoDetectColorScheme() {
    if (Setting.DETECT_COLOR_SCHEME.getValue(this.configurationService)) {
      return true;
    }
    return false;
  }
  getBackgroundColor() {
    const preferred = this.getPreferredBaseTheme();
    const stored = this.getStoredBaseTheme();
    if (preferred === void 0 || preferred === stored) {
      const storedBackground = this.stateService.getItem(THEME_BG_STORAGE_KEY, null);
      if (storedBackground) {
        return storedBackground;
      }
    }
    switch (preferred ?? stored) {
      case ThemeTypeSelector.VS:
        return DEFAULT_BG_LIGHT;
      case ThemeTypeSelector.HC_BLACK:
        return DEFAULT_BG_HC_BLACK;
      case ThemeTypeSelector.HC_LIGHT:
        return DEFAULT_BG_HC_LIGHT;
      default:
        return DEFAULT_BG_DARK;
    }
  }
  getStoredBaseTheme() {
    const baseTheme = this.stateService.getItem(THEME_STORAGE_KEY, ThemeTypeSelector.VS_DARK).split(" ")[0];
    switch (baseTheme) {
      case ThemeTypeSelector.VS:
        return ThemeTypeSelector.VS;
      case ThemeTypeSelector.HC_BLACK:
        return ThemeTypeSelector.HC_BLACK;
      case ThemeTypeSelector.HC_LIGHT:
        return ThemeTypeSelector.HC_LIGHT;
      default:
        return ThemeTypeSelector.VS_DARK;
    }
  }
  saveWindowSplash(windowId, workspace, splash) {
    const splashOverride = this.updateWindowSplashOverride(workspace, splash);
    this.stateService.setItems(coalesce([
      { key: THEME_STORAGE_KEY, data: splash.baseTheme },
      { key: THEME_BG_STORAGE_KEY, data: splash.colorInfo.background },
      { key: THEME_WINDOW_SPLASH_KEY, data: splash },
      splashOverride ? { key: THEME_WINDOW_SPLASH_OVERRIDE_KEY, data: splashOverride } : void 0
    ]));
    if (typeof windowId === "number") {
      this.updateBackgroundColor(windowId, splash);
    }
    this.updateSystemColorTheme();
  }
  updateWindowSplashOverride(workspace, splash) {
    let splashOverride = void 0;
    let changed = false;
    if (workspace) {
      splashOverride = { ...this.getWindowSplashOverride() };
      changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, "sideBar");
      changed = this.doUpdateWindowSplashOverride(workspace, splash, splashOverride, "auxiliaryBar") || changed;
    }
    return changed ? splashOverride : void 0;
  }
  doUpdateWindowSplashOverride(workspace, splash, splashOverride, part) {
    const currentWidth = part === "sideBar" ? splash.layoutInfo?.sideBarWidth : splash.layoutInfo?.auxiliaryBarWidth;
    const overrideWidth = part === "sideBar" ? splashOverride.layoutInfo.sideBarWidth : splashOverride.layoutInfo.auxiliaryBarWidth;
    let changed = false;
    if (typeof currentWidth !== "number") {
      if (splashOverride.layoutInfo.workspaces[workspace.id]) {
        delete splashOverride.layoutInfo.workspaces[workspace.id];
        changed = true;
      }
      return changed;
    }
    let workspaceOverride = splashOverride.layoutInfo.workspaces[workspace.id];
    if (!workspaceOverride) {
      const workspaceEntries = Object.keys(splashOverride.layoutInfo.workspaces);
      if (workspaceEntries.length >= ThemeMainService.WORKSPACE_OVERRIDE_LIMIT) {
        delete splashOverride.layoutInfo.workspaces[workspaceEntries[0]];
        changed = true;
      }
      workspaceOverride = { sideBarVisible: false, auxiliaryBarVisible: false };
      splashOverride.layoutInfo.workspaces[workspace.id] = workspaceOverride;
      changed = true;
    }
    if (currentWidth > 0) {
      if (overrideWidth !== currentWidth) {
        splashOverride.layoutInfo[part === "sideBar" ? "sideBarWidth" : "auxiliaryBarWidth"] = currentWidth;
        changed = true;
      }
      switch (part) {
        case "sideBar":
          if (!workspaceOverride.sideBarVisible) {
            workspaceOverride.sideBarVisible = true;
            changed = true;
          }
          break;
        case "auxiliaryBar":
          if (!workspaceOverride.auxiliaryBarVisible) {
            workspaceOverride.auxiliaryBarVisible = true;
            changed = true;
          }
          break;
      }
    } else {
      switch (part) {
        case "sideBar":
          if (workspaceOverride.sideBarVisible) {
            workspaceOverride.sideBarVisible = false;
            changed = true;
          }
          break;
        case "auxiliaryBar":
          if (workspaceOverride.auxiliaryBarVisible) {
            workspaceOverride.auxiliaryBarVisible = false;
            changed = true;
          }
          break;
      }
    }
    return changed;
  }
  updateBackgroundColor(windowId, splash) {
    for (const window of getAllWindowsExcludingOffscreen()) {
      if (window.id === windowId) {
        window.setBackgroundColor(splash.colorInfo.background);
        break;
      }
    }
  }
  getWindowSplash(workspace) {
    try {
      return this.doGetWindowSplash(workspace);
    } catch (error) {
      this.logService.error("[theme main service] Failed to get window splash", error);
      return void 0;
    }
  }
  doGetWindowSplash(workspace) {
    const partSplash = this.stateService.getItem(THEME_WINDOW_SPLASH_KEY);
    if (!partSplash?.layoutInfo) {
      return partSplash;
    }
    const override = this.getWindowSplashOverride();
    let sideBarWidth;
    if (workspace) {
      if (override.layoutInfo.workspaces[workspace.id]?.sideBarVisible === false) {
        sideBarWidth = 0;
      } else {
        sideBarWidth = override.layoutInfo.sideBarWidth || partSplash.layoutInfo.sideBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
      }
    } else {
      sideBarWidth = 0;
    }
    const auxiliaryBarDefaultVisibility = Setting.AUXILIARYBAR_DEFAULT_VISIBILITY.getValue(this.configurationService);
    const startupEditor = Setting.STARTUP_EDITOR.getValue(this.configurationService);
    let auxiliaryBarWidth;
    if (workspace) {
      const auxiliaryBarVisible = override.layoutInfo.workspaces[workspace.id]?.auxiliaryBarVisible;
      if (auxiliaryBarVisible === true) {
        auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
      } else if (auxiliaryBarVisible === false) {
        auxiliaryBarWidth = 0;
      } else {
        if (startupEditor !== "agentSessionsWelcomePage" && (auxiliaryBarDefaultVisibility === "visible" || auxiliaryBarDefaultVisibility === "visibleInWorkspace")) {
          auxiliaryBarWidth = override.layoutInfo.auxiliaryBarWidth || partSplash.layoutInfo.auxiliaryBarWidth || ThemeMainService.DEFAULT_BAR_WIDTH;
        } else if (startupEditor !== "agentSessionsWelcomePage" && (auxiliaryBarDefaultVisibility === "maximized" || auxiliaryBarDefaultVisibility === "maximizedInWorkspace")) {
          auxiliaryBarWidth = Number.MAX_SAFE_INTEGER;
        } else {
          auxiliaryBarWidth = 0;
        }
      }
    } else {
      auxiliaryBarWidth = 0;
    }
    const partBounds = sideBarWidth === partSplash.layoutInfo.sideBarWidth && auxiliaryBarWidth === partSplash.layoutInfo.auxiliaryBarWidth ? partSplash.layoutInfo.partBounds : void 0;
    return {
      ...partSplash,
      layoutInfo: {
        ...partSplash.layoutInfo,
        sideBarWidth,
        auxiliaryBarWidth,
        partBounds
      }
    };
  }
  getWindowSplashOverride() {
    let override = this.stateService.getItem(THEME_WINDOW_SPLASH_OVERRIDE_KEY);
    if (!override?.layoutInfo) {
      override = {
        layoutInfo: {
          sideBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
          auxiliaryBarWidth: ThemeMainService.DEFAULT_BAR_WIDTH,
          workspaces: {}
        }
      };
    }
    if (!override.layoutInfo.sideBarWidth) {
      override.layoutInfo.sideBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
    }
    if (!override.layoutInfo.auxiliaryBarWidth) {
      override.layoutInfo.auxiliaryBarWidth = ThemeMainService.DEFAULT_BAR_WIDTH;
    }
    if (!override.layoutInfo.workspaces) {
      override.layoutInfo.workspaces = {};
    }
    return override;
  }
};
ThemeMainService.DEFAULT_BAR_WIDTH = 300;
ThemeMainService.WORKSPACE_OVERRIDE_LIMIT = 50;
ThemeMainService = __decorateClass([
  __decorateParam(0, IStateService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], ThemeMainService);
export {
  ThemeMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RoZW1lL2VsZWN0cm9uLW1haW4vdGhlbWVNYWluU2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgZWxlY3Ryb24gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IElQYXJ0c1NwbGFzaCB9IGZyb20gJy4uL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgVGhlbWVUeXBlU2VsZWN0b3IgfSBmcm9tICcuLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbiB9IGZyb20gJy4uLy4uL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUaGVtZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi90aGVtZU1haW5TZXJ2aWNlLmpzJztcblxuLy8gVGhlc2UgZGVmYXVsdCBjb2xvcnMgbWF0Y2ggb3VyIGRlZmF1bHQgdGhlbWVzXG4vLyBlZGl0b3IgYmFja2dyb3VuZCBjb2xvciAoXCJEYXJrIE1vZGVyblwiLCBldGMuLi4pXG5jb25zdCBERUZBVUxUX0JHX0xJR0hUID0gJyNGRkZGRkYnO1xuY29uc3QgREVGQVVMVF9CR19EQVJLID0gJyMxRjFGMUYnO1xuY29uc3QgREVGQVVMVF9CR19IQ19CTEFDSyA9ICcjMDAwMDAwJztcbmNvbnN0IERFRkFVTFRfQkdfSENfTElHSFQgPSAnI0ZGRkZGRic7XG5cbmNvbnN0IFRIRU1FX1NUT1JBR0VfS0VZID0gJ3RoZW1lJztcbmNvbnN0IFRIRU1FX0JHX1NUT1JBR0VfS0VZID0gJ3RoZW1lQmFja2dyb3VuZCc7XG5cbmNvbnN0IFRIRU1FX1dJTkRPV19TUExBU0hfS0VZID0gJ3dpbmRvd1NwbGFzaCc7XG5jb25zdCBUSEVNRV9XSU5ET1dfU1BMQVNIX09WRVJSSURFX0tFWSA9ICd3aW5kb3dTcGxhc2hXb3Jrc3BhY2VPdmVycmlkZSc7XG5cbmNsYXNzIFNldHRpbmc8VD4ge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkga2V5OiBzdHJpbmcsIHB1YmxpYyByZWFkb25seSBkZWZhdWx0VmFsdWU6IFQpIHtcblx0fVxuXHRnZXRWYWx1ZShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogVCB7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFQ+KHRoaXMua2V5KSA/PyB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxufVxuXG4vLyBpbiB0aGUgbWFpbiBwcm9jZXNzLCBkZWZhdWx0cyBhcmUgbm90IGtub3duIHRvIHRoZSBjb25maWd1cmF0aW9uIHNlcnZpY2UsIHNvIHdlIG5lZWQgdG8gZGVmaW5lIHRoZW0gaGVyZVxubmFtZXNwYWNlIFNldHRpbmcge1xuXHRleHBvcnQgY29uc3QgREVURUNUX0NPTE9SX1NDSEVNRSA9IG5ldyBTZXR0aW5nPGJvb2xlYW4+KCd3aW5kb3cuYXV0b0RldGVjdENvbG9yU2NoZW1lJywgZmFsc2UpO1xuXHRleHBvcnQgY29uc3QgREVURUNUX0hDID0gbmV3IFNldHRpbmc8Ym9vbGVhbj4oJ3dpbmRvdy5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0JywgdHJ1ZSk7XG5cdGV4cG9ydCBjb25zdCBTWVNURU1fQ09MT1JfVEhFTUUgPSBuZXcgU2V0dGluZzwnZGVmYXVsdCcgfCAnYXV0bycgfCAnbGlnaHQnIHwgJ2RhcmsnPignd2luZG93LnN5c3RlbUNvbG9yVGhlbWUnLCAnZGVmYXVsdCcpO1xuXHRleHBvcnQgY29uc3QgQVVYSUxJQVJZQkFSX0RFRkFVTFRfVklTSUJJTElUWSA9IG5ldyBTZXR0aW5nPCdoaWRkZW4nIHwgJ3Zpc2libGVJbldvcmtzcGFjZScgfCAndmlzaWJsZScgfCAnbWF4aW1pemVkSW5Xb3Jrc3BhY2UnIHwgJ21heGltaXplZCc+KCd3b3JrYmVuY2guc2Vjb25kYXJ5U2lkZUJhci5kZWZhdWx0VmlzaWJpbGl0eScsICd2aXNpYmxlSW5Xb3Jrc3BhY2UnKTtcblx0ZXhwb3J0IGNvbnN0IFNUQVJUVVBfRURJVE9SID0gbmV3IFNldHRpbmc8J25vbmUnIHwgJ3dlbGNvbWVQYWdlJyB8ICdyZWFkbWUnIHwgJ25ld1VudGl0bGVkRmlsZScgfCAnd2VsY29tZVBhZ2VJbkVtcHR5V29ya2JlbmNoJyB8ICd0ZXJtaW5hbCcgfCAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJz4oJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yJywgJ3dlbGNvbWVQYWdlJyk7XG59XG5cbmludGVyZmFjZSBJUGFydFNwbGFzaE92ZXJyaWRlV29ya3NwYWNlcyB7XG5cdFt3b3Jrc3BhY2VJZDogc3RyaW5nXToge1xuXHRcdHNpZGVCYXJWaXNpYmxlOiBib29sZWFuO1xuXHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGJvb2xlYW47XG5cdH07XG59XG5cbmludGVyZmFjZSBJUGFydHNTcGxhc2hPdmVycmlkZSB7XG5cdGxheW91dEluZm86IHtcblx0XHRzaWRlQmFyV2lkdGg6IG51bWJlcjtcblx0XHRhdXhpbGlhcnlCYXJXaWR0aDogbnVtYmVyO1xuXG5cdFx0d29ya3NwYWNlczogSVBhcnRTcGxhc2hPdmVycmlkZVdvcmtzcGFjZXM7XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBUaGVtZU1haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUaGVtZU1haW5TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX0JBUl9XSURUSCA9IDMwMDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBXT1JLU1BBQ0VfT1ZFUlJJREVfTElNSVQgPSA1MDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbG9yU2NoZW1lID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvbG9yU2NoZW1lPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb2xvclNjaGVtZSA9IHRoaXMuX29uRGlkQ2hhbmdlQ29sb3JTY2hlbWUuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdGF0ZVNlcnZpY2UgcHJpdmF0ZSBzdGF0ZVNlcnZpY2U6IElTdGF0ZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFN5c3RlbSBUaGVtZVxuXHRcdGlmICghaXNMaW51eCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFNldHRpbmcuU1lTVEVNX0NPTE9SX1RIRU1FLmtleSkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihTZXR0aW5nLkRFVEVDVF9DT0xPUl9TQ0hFTUUua2V5KSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3lzdGVtQ29sb3JUaGVtZSgpO1xuXHRcdFx0XHRcdHRoaXMubG9nVGhlbWVTZXR0aW5ncygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlU3lzdGVtQ29sb3JUaGVtZSgpO1xuXHRcdHRoaXMubG9nVGhlbWVTZXR0aW5ncygpO1xuXG5cdFx0Ly8gQ29sb3IgU2NoZW1lIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcihlbGVjdHJvbi5uYXRpdmVUaGVtZSwgJ3VwZGF0ZWQnKSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1RoZW1lU2V0dGluZ3MoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29sb3JTY2hlbWUuZmlyZSh0aGlzLmdldENvbG9yU2NoZW1lKCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nVGhlbWVTZXR0aW5ncygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sb2dTZXJ2aWNlLmdldExldmVsKCkgPj0gTG9nTGV2ZWwuRGVidWcpIHtcblx0XHRcdGNvbnN0IGxvZ1NldHRpbmcgPSAoc2V0dGluZzogU2V0dGluZzxzdHJpbmcgfCBib29sZWFuPikgPT4gYCR7c2V0dGluZy5rZXl9PSR7c2V0dGluZy5nZXRWYWx1ZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKX1gO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBbdGhlbWUgbWFpbiBzZXJ2aWNlXSAke2xvZ1NldHRpbmcoU2V0dGluZy5ERVRFQ1RfQ09MT1JfU0NIRU1FKX0sICR7bG9nU2V0dGluZyhTZXR0aW5nLkRFVEVDVF9IQyl9LCAke2xvZ1NldHRpbmcoU2V0dGluZy5TWVNURU1fQ09MT1JfVEhFTUUpfWApO1xuXG5cdFx0XHRjb25zdCBsb2dQcm9wZXJ0eSA9IChwcm9wZXJ0eToga2V5b2YgRWxlY3Ryb24uTmF0aXZlVGhlbWUpID0+IGAke1N0cmluZyhwcm9wZXJ0eSl9PSR7ZWxlY3Ryb24ubmF0aXZlVGhlbWVbcHJvcGVydHldfWA7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFt0aGVtZSBtYWluIHNlcnZpY2VdIGVsZWN0cm9uLm5hdGl2ZVRoZW1lOiAke2xvZ1Byb3BlcnR5KCd0aGVtZVNvdXJjZScpfSwgJHtsb2dQcm9wZXJ0eSgnc2hvdWxkVXNlRGFya0NvbG9ycycpfSwgJHtsb2dQcm9wZXJ0eSgnc2hvdWxkVXNlSGlnaENvbnRyYXN0Q29sb3JzJyl9LCAke2xvZ1Byb3BlcnR5KCdzaG91bGRVc2VJbnZlcnRlZENvbG9yU2NoZW1lJyl9LCAke2xvZ1Byb3BlcnR5KCdzaG91bGRVc2VEYXJrQ29sb3JzRm9yU3lzdGVtSW50ZWdyYXRlZFVJJyl9XHRgKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW3RoZW1lIG1haW4gc2VydmljZV0gTmV3IGNvbG9yIHNjaGVtZTogJHtKU09OLnN0cmluZ2lmeSh0aGlzLmdldENvbG9yU2NoZW1lKCkpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3lzdGVtQ29sb3JUaGVtZSgpOiB2b2lkIHtcblx0XHRpZiAoaXNMaW51eCB8fCB0aGlzLmlzQXV0b0RldGVjdENvbG9yU2NoZW1lKCkpIHtcblx0XHRcdGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnRoZW1lU291cmNlID0gJ3N5c3RlbSc7IC8vIG9ubHkgd2l0aCBgc3lzdGVtYCB3ZSBjYW4gZGV0ZWN0IHRoZSBzeXN0ZW0gY29sb3Igc2NoZW1lXG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAoU2V0dGluZy5TWVNURU1fQ09MT1JfVEhFTUUuZ2V0VmFsdWUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0Y2FzZSAnZGFyayc6XG5cdFx0XHRcdFx0ZWxlY3Ryb24ubmF0aXZlVGhlbWUudGhlbWVTb3VyY2UgPSAnZGFyayc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xpZ2h0Jzpcblx0XHRcdFx0XHRlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdsaWdodCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2F1dG8nOlxuXHRcdFx0XHRcdHN3aXRjaCAodGhpcy5nZXRQcmVmZXJyZWRCYXNlVGhlbWUoKSA/PyB0aGlzLmdldFN0b3JlZEJhc2VUaGVtZSgpKSB7XG5cdFx0XHRcdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTOiBlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdsaWdodCc7IGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLOiBlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdkYXJrJzsgYnJlYWs7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdzeXN0ZW0nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRlbGVjdHJvbi5uYXRpdmVUaGVtZS50aGVtZVNvdXJjZSA9ICdzeXN0ZW0nO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldENvbG9yU2NoZW1lKCk6IElDb2xvclNjaGVtZSB7XG5cblx0XHQvLyBoaWdoIGNvbnRyYXN0IGlzIHJlZmxlY3RlZCBieSB0aGUgc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZSBwcm9wZXJ0eVxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGlmIChlbGVjdHJvbi5uYXRpdmVUaGVtZS5zaG91bGRVc2VIaWdoQ29udHJhc3RDb2xvcnMpIHtcblx0XHRcdFx0Ly8gc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZSBpcyBkYXJrLCAhc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZSBpcyBsaWdodFxuXHRcdFx0XHRyZXR1cm4geyBkYXJrOiBlbGVjdHJvbi5uYXRpdmVUaGVtZS5zaG91bGRVc2VJbnZlcnRlZENvbG9yU2NoZW1lLCBoaWdoQ29udHJhc3Q6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBoaWdoIGNvbnRyYXN0IGlzIHNldCBpZiBvbmUgb2Ygc2hvdWxkVXNlSW52ZXJ0ZWRDb2xvclNjaGVtZSBvciBzaG91bGRVc2VIaWdoQ29udHJhc3RDb2xvcnMgaXMgc2V0LFxuXHRcdC8vIHJlZmxlY3RpbmcgdGhlICdJbnZlcnQgY29sb3VycycgYW5kIGBJbmNyZWFzZSBjb250cmFzdGAgc2V0dGluZ3MgaW4gTWFjT1Ncblx0XHRlbHNlIGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0aWYgKGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnNob3VsZFVzZUludmVydGVkQ29sb3JTY2hlbWUgfHwgZWxlY3Ryb24ubmF0aXZlVGhlbWUuc2hvdWxkVXNlSGlnaENvbnRyYXN0Q29sb3JzKSB7XG5cdFx0XHRcdHJldHVybiB7IGRhcms6IGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnNob3VsZFVzZURhcmtDb2xvcnMsIGhpZ2hDb250cmFzdDogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHVidW50dSBnbm9tZSBzZWVtcyB0byBoYXZlIDMgc3RhdGVzLCBsaWdodCBkYXJrIGFuZCBoaWdoIGNvbnRyYXN0XG5cdFx0ZWxzZSBpZiAoaXNMaW51eCkge1xuXHRcdFx0aWYgKGVsZWN0cm9uLm5hdGl2ZVRoZW1lLnNob3VsZFVzZUhpZ2hDb250cmFzdENvbG9ycykge1xuXHRcdFx0XHRyZXR1cm4geyBkYXJrOiB0cnVlLCBoaWdoQ29udHJhc3Q6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGFyazogZWxlY3Ryb24ubmF0aXZlVGhlbWUuc2hvdWxkVXNlRGFya0NvbG9ycyxcblx0XHRcdGhpZ2hDb250cmFzdDogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0Z2V0UHJlZmVycmVkQmFzZVRoZW1lKCk6IFRoZW1lVHlwZVNlbGVjdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb2xvclNjaGVtZSA9IHRoaXMuZ2V0Q29sb3JTY2hlbWUoKTtcblx0XHRpZiAoU2V0dGluZy5ERVRFQ1RfSEMuZ2V0VmFsdWUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgJiYgY29sb3JTY2hlbWUuaGlnaENvbnRyYXN0KSB7XG5cdFx0XHRyZXR1cm4gY29sb3JTY2hlbWUuZGFyayA/IFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLIDogVGhlbWVUeXBlU2VsZWN0b3IuSENfTElHSFQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNBdXRvRGV0ZWN0Q29sb3JTY2hlbWUoKSkge1xuXHRcdFx0cmV0dXJuIGNvbG9yU2NoZW1lLmRhcmsgPyBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLIDogVGhlbWVUeXBlU2VsZWN0b3IuVlM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzQXV0b0RldGVjdENvbG9yU2NoZW1lKCk6IGJvb2xlYW4ge1xuXHRcdGlmIChTZXR0aW5nLkRFVEVDVF9DT0xPUl9TQ0hFTUUuZ2V0VmFsdWUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRCYWNrZ3JvdW5kQ29sb3IoKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLmdldFByZWZlcnJlZEJhc2VUaGVtZSgpO1xuXHRcdGNvbnN0IHN0b3JlZCA9IHRoaXMuZ2V0U3RvcmVkQmFzZVRoZW1lKCk7XG5cblx0XHQvLyBJZiB0aGUgc3RvcmVkIHRoZW1lIGhhcyB0aGUgc2FtZSBiYXNlIGFzIHRoZSBwcmVmZXJyZWQsIHdlIGNhbiByZXR1cm4gdGhlIHN0b3JlZCBiYWNrZ3JvdW5kXG5cdFx0aWYgKHByZWZlcnJlZCA9PT0gdW5kZWZpbmVkIHx8IHByZWZlcnJlZCA9PT0gc3RvcmVkKSB7XG5cdFx0XHRjb25zdCBzdG9yZWRCYWNrZ3JvdW5kID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxzdHJpbmcgfCBudWxsPihUSEVNRV9CR19TVE9SQUdFX0tFWSwgbnVsbCk7XG5cdFx0XHRpZiAoc3RvcmVkQmFja2dyb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gc3RvcmVkQmFja2dyb3VuZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugd2UgcmV0dXJuIHRoZSBkZWZhdWx0IGJhY2tncm91bmQgZm9yIHRoZSBwcmVmZXJyZWQgYmFzZSB0aGVtZS4gSWYgdGhlcmUncyBubyBwcmVmZXJyZWQsIHVzZSB0aGUgc3RvcmVkIG9uZS5cblx0XHRzd2l0Y2ggKHByZWZlcnJlZCA/PyBzdG9yZWQpIHtcblx0XHRcdGNhc2UgVGhlbWVUeXBlU2VsZWN0b3IuVlM6IHJldHVybiBERUZBVUxUX0JHX0xJR0hUO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSzogcmV0dXJuIERFRkFVTFRfQkdfSENfQkxBQ0s7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUOiByZXR1cm4gREVGQVVMVF9CR19IQ19MSUdIVDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBERUZBVUxUX0JHX0RBUks7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRCYXNlVGhlbWUoKTogVGhlbWVUeXBlU2VsZWN0b3Ige1xuXHRcdGNvbnN0IGJhc2VUaGVtZSA9IHRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW08VGhlbWVUeXBlU2VsZWN0b3I+KFRIRU1FX1NUT1JBR0VfS0VZLCBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLKS5zcGxpdCgnICcpWzBdO1xuXHRcdHN3aXRjaCAoYmFzZVRoZW1lKSB7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTOiByZXR1cm4gVGhlbWVUeXBlU2VsZWN0b3IuVlM7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLOiByZXR1cm4gVGhlbWVUeXBlU2VsZWN0b3IuSENfQkxBQ0s7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUOiByZXR1cm4gVGhlbWVUeXBlU2VsZWN0b3IuSENfTElHSFQ7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gVGhlbWVUeXBlU2VsZWN0b3IuVlNfREFSSztcblx0XHR9XG5cdH1cblxuXHRzYXZlV2luZG93U3BsYXNoKHdpbmRvd0lkOiBudW1iZXIgfCB1bmRlZmluZWQsIHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgc3BsYXNoOiBJUGFydHNTcGxhc2gpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBvdmVycmlkZSBhcyBuZWVkZWRcblx0XHRjb25zdCBzcGxhc2hPdmVycmlkZSA9IHRoaXMudXBkYXRlV2luZG93U3BsYXNoT3ZlcnJpZGUod29ya3NwYWNlLCBzcGxhc2gpO1xuXG5cdFx0Ly8gVXBkYXRlIGluIHN0b3JhZ2Vcblx0XHR0aGlzLnN0YXRlU2VydmljZS5zZXRJdGVtcyhjb2FsZXNjZShbXG5cdFx0XHR7IGtleTogVEhFTUVfU1RPUkFHRV9LRVksIGRhdGE6IHNwbGFzaC5iYXNlVGhlbWUgfSxcblx0XHRcdHsga2V5OiBUSEVNRV9CR19TVE9SQUdFX0tFWSwgZGF0YTogc3BsYXNoLmNvbG9ySW5mby5iYWNrZ3JvdW5kIH0sXG5cdFx0XHR7IGtleTogVEhFTUVfV0lORE9XX1NQTEFTSF9LRVksIGRhdGE6IHNwbGFzaCB9LFxuXHRcdFx0c3BsYXNoT3ZlcnJpZGUgPyB7IGtleTogVEhFTUVfV0lORE9XX1NQTEFTSF9PVkVSUklERV9LRVksIGRhdGE6IHNwbGFzaE92ZXJyaWRlIH0gOiB1bmRlZmluZWRcblx0XHRdKSk7XG5cblx0XHQvLyBVcGRhdGUgaW4gb3BlbmVkIHdpbmRvd3Ncblx0XHRpZiAodHlwZW9mIHdpbmRvd0lkID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy51cGRhdGVCYWNrZ3JvdW5kQ29sb3Iod2luZG93SWQsIHNwbGFzaCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHN5c3RlbSB0aGVtZVxuXHRcdHRoaXMudXBkYXRlU3lzdGVtQ29sb3JUaGVtZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXaW5kb3dTcGxhc2hPdmVycmlkZSh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCB1bmRlZmluZWQsIHNwbGFzaDogSVBhcnRzU3BsYXNoKTogSVBhcnRzU3BsYXNoT3ZlcnJpZGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBzcGxhc2hPdmVycmlkZTogSVBhcnRzU3BsYXNoT3ZlcnJpZGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRzcGxhc2hPdmVycmlkZSA9IHsgLi4udGhpcy5nZXRXaW5kb3dTcGxhc2hPdmVycmlkZSgpIH07IC8vIG1ha2UgYSBjb3B5IGZvciBtb2RpZmljYXRpb25zXG5cblx0XHRcdGNoYW5nZWQgPSB0aGlzLmRvVXBkYXRlV2luZG93U3BsYXNoT3ZlcnJpZGUod29ya3NwYWNlLCBzcGxhc2gsIHNwbGFzaE92ZXJyaWRlLCAnc2lkZUJhcicpO1xuXHRcdFx0Y2hhbmdlZCA9IHRoaXMuZG9VcGRhdGVXaW5kb3dTcGxhc2hPdmVycmlkZSh3b3Jrc3BhY2UsIHNwbGFzaCwgc3BsYXNoT3ZlcnJpZGUsICdhdXhpbGlhcnlCYXInKSB8fCBjaGFuZ2VkO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGFuZ2VkID8gc3BsYXNoT3ZlcnJpZGUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlV2luZG93U3BsYXNoT3ZlcnJpZGUod29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBzcGxhc2g6IElQYXJ0c1NwbGFzaCwgc3BsYXNoT3ZlcnJpZGU6IElQYXJ0c1NwbGFzaE92ZXJyaWRlLCBwYXJ0OiAnc2lkZUJhcicgfCAnYXV4aWxpYXJ5QmFyJyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IHBhcnQgPT09ICdzaWRlQmFyJyA/IHNwbGFzaC5sYXlvdXRJbmZvPy5zaWRlQmFyV2lkdGggOiBzcGxhc2gubGF5b3V0SW5mbz8uYXV4aWxpYXJ5QmFyV2lkdGg7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVXaWR0aCA9IHBhcnQgPT09ICdzaWRlQmFyJyA/IHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm8uc2lkZUJhcldpZHRoIDogc3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aDtcblxuXHRcdC8vIE5vIGxheW91dCBpbmZvOiByZW1vdmUgb3ZlcnJpZGVcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmICh0eXBlb2YgY3VycmVudFdpZHRoICE9PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm8ud29ya3NwYWNlc1t3b3Jrc3BhY2UuaWRdKSB7XG5cdFx0XHRcdGRlbGV0ZSBzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXNbd29ya3NwYWNlLmlkXTtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGFuZ2VkO1xuXHRcdH1cblxuXHRcdGxldCB3b3Jrc3BhY2VPdmVycmlkZSA9IHNwbGFzaE92ZXJyaWRlLmxheW91dEluZm8ud29ya3NwYWNlc1t3b3Jrc3BhY2UuaWRdO1xuXHRcdGlmICghd29ya3NwYWNlT3ZlcnJpZGUpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUVudHJpZXMgPSBPYmplY3Qua2V5cyhzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXMpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUVudHJpZXMubGVuZ3RoID49IFRoZW1lTWFpblNlcnZpY2UuV09SS1NQQUNFX09WRVJSSURFX0xJTUlUKSB7XG5cdFx0XHRcdGRlbGV0ZSBzcGxhc2hPdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXNbd29ya3NwYWNlRW50cmllc1swXV07XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR3b3Jrc3BhY2VPdmVycmlkZSA9IHsgc2lkZUJhclZpc2libGU6IGZhbHNlLCBhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSB9O1xuXHRcdFx0c3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzW3dvcmtzcGFjZS5pZF0gPSB3b3Jrc3BhY2VPdmVycmlkZTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFBhcnQgaGFzIHdpZHRoOiB1cGRhdGUgd2lkdGggJiB2aXNpYmlsaXR5IG92ZXJyaWRlXG5cdFx0aWYgKGN1cnJlbnRXaWR0aCA+IDApIHtcblx0XHRcdGlmIChvdmVycmlkZVdpZHRoICE9PSBjdXJyZW50V2lkdGgpIHtcblx0XHRcdFx0c3BsYXNoT3ZlcnJpZGUubGF5b3V0SW5mb1twYXJ0ID09PSAnc2lkZUJhcicgPyAnc2lkZUJhcldpZHRoJyA6ICdhdXhpbGlhcnlCYXJXaWR0aCddID0gY3VycmVudFdpZHRoO1xuXHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRcdGNhc2UgJ3NpZGVCYXInOlxuXHRcdFx0XHRcdGlmICghd29ya3NwYWNlT3ZlcnJpZGUuc2lkZUJhclZpc2libGUpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZU92ZXJyaWRlLnNpZGVCYXJWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYXV4aWxpYXJ5QmFyJzpcblx0XHRcdFx0XHRpZiAoIXdvcmtzcGFjZU92ZXJyaWRlLmF1eGlsaWFyeUJhclZpc2libGUpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZU92ZXJyaWRlLmF1eGlsaWFyeUJhclZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBhcnQgaXMgaGlkZGVuOiB1cGRhdGUgdmlzaWJpbGl0eSBvdmVycmlkZVxuXHRcdGVsc2Uge1xuXHRcdFx0c3dpdGNoIChwYXJ0KSB7XG5cdFx0XHRcdGNhc2UgJ3NpZGVCYXInOlxuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VPdmVycmlkZS5zaWRlQmFyVmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlT3ZlcnJpZGUuc2lkZUJhclZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnYXV4aWxpYXJ5QmFyJzpcblx0XHRcdFx0XHRpZiAod29ya3NwYWNlT3ZlcnJpZGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlT3ZlcnJpZGUuYXV4aWxpYXJ5QmFyVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjaGFuZ2VkO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCYWNrZ3JvdW5kQ29sb3Iod2luZG93SWQ6IG51bWJlciwgc3BsYXNoOiBJUGFydHNTcGxhc2gpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdpbmRvdyBvZiBnZXRBbGxXaW5kb3dzRXhjbHVkaW5nT2Zmc2NyZWVuKCkpIHtcblx0XHRcdGlmICh3aW5kb3cuaWQgPT09IHdpbmRvd0lkKSB7XG5cdFx0XHRcdHdpbmRvdy5zZXRCYWNrZ3JvdW5kQ29sb3Ioc3BsYXNoLmNvbG9ySW5mby5iYWNrZ3JvdW5kKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0V2luZG93U3BsYXNoKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZCk6IElQYXJ0c1NwbGFzaCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLmRvR2V0V2luZG93U3BsYXNoKHdvcmtzcGFjZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW3RoZW1lIG1haW4gc2VydmljZV0gRmFpbGVkIHRvIGdldCB3aW5kb3cgc3BsYXNoJywgZXJyb3IpO1xuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9HZXRXaW5kb3dTcGxhc2god29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkKTogSVBhcnRzU3BsYXNoIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJ0U3BsYXNoID0gdGhpcy5zdGF0ZVNlcnZpY2UuZ2V0SXRlbTxJUGFydHNTcGxhc2g+KFRIRU1FX1dJTkRPV19TUExBU0hfS0VZKTtcblx0XHRpZiAoIXBhcnRTcGxhc2g/LmxheW91dEluZm8pIHtcblx0XHRcdHJldHVybiBwYXJ0U3BsYXNoOyAvLyByZXR1cm4gZWFybHk6IG92ZXJyaWRlcyBjdXJyZW50bHkgb25seSBhcHBseSB0byBsYXlvdXQgaW5mb1xuXHRcdH1cblxuXHRcdGNvbnN0IG92ZXJyaWRlID0gdGhpcy5nZXRXaW5kb3dTcGxhc2hPdmVycmlkZSgpO1xuXG5cdFx0Ly8gRmlndXJlIG91dCBzaWRlIGJhciB3aWR0aCBiYXNlZCBvbiB3b3Jrc3BhY2UgYW5kIG92ZXJyaWRlc1xuXHRcdGxldCBzaWRlQmFyV2lkdGg6IG51bWJlcjtcblx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRpZiAob3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzW3dvcmtzcGFjZS5pZF0/LnNpZGVCYXJWaXNpYmxlID09PSBmYWxzZSkge1xuXHRcdFx0XHRzaWRlQmFyV2lkdGggPSAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2lkZUJhcldpZHRoID0gb3ZlcnJpZGUubGF5b3V0SW5mby5zaWRlQmFyV2lkdGggfHwgcGFydFNwbGFzaC5sYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCB8fCBUaGVtZU1haW5TZXJ2aWNlLkRFRkFVTFRfQkFSX1dJRFRIO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzaWRlQmFyV2lkdGggPSAwO1xuXHRcdH1cblxuXHRcdC8vIEZpZ3VyZSBvdXQgYXV4aWxpYXJ5IGJhciB3aWR0aCBiYXNlZCBvbiB3b3Jrc3BhY2UsIGNvbmZpZ3VyYXRpb24gYW5kIG92ZXJyaWRlc1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckRlZmF1bHRWaXNpYmlsaXR5ID0gU2V0dGluZy5BVVhJTElBUllCQVJfREVGQVVMVF9WSVNJQklMSVRZLmdldFZhbHVlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHN0YXJ0dXBFZGl0b3IgPSBTZXR0aW5nLlNUQVJUVVBfRURJVE9SLmdldFZhbHVlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBhdXhpbGlhcnlCYXJXaWR0aDogbnVtYmVyO1xuXHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IGF1eGlsaWFyeUJhclZpc2libGUgPSBvdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXNbd29ya3NwYWNlLmlkXT8uYXV4aWxpYXJ5QmFyVmlzaWJsZTtcblx0XHRcdGlmIChhdXhpbGlhcnlCYXJWaXNpYmxlID09PSB0cnVlKSB7XG5cdFx0XHRcdGF1eGlsaWFyeUJhcldpZHRoID0gb3ZlcnJpZGUubGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCB8fCBwYXJ0U3BsYXNoLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggfHwgVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSDtcblx0XHRcdH0gZWxzZSBpZiAoYXV4aWxpYXJ5QmFyVmlzaWJsZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGggPSAwO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHN0YXJ0dXBFZGl0b3IgIT09ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnICYmIChhdXhpbGlhcnlCYXJEZWZhdWx0VmlzaWJpbGl0eSA9PT0gJ3Zpc2libGUnIHx8IGF1eGlsaWFyeUJhckRlZmF1bHRWaXNpYmlsaXR5ID09PSAndmlzaWJsZUluV29ya3NwYWNlJykpIHtcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aCA9IG92ZXJyaWRlLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggfHwgcGFydFNwbGFzaC5sYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoIHx8IFRoZW1lTWFpblNlcnZpY2UuREVGQVVMVF9CQVJfV0lEVEg7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc3RhcnR1cEVkaXRvciAhPT0gJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScgJiYgKGF1eGlsaWFyeUJhckRlZmF1bHRWaXNpYmlsaXR5ID09PSAnbWF4aW1pemVkJyB8fCBhdXhpbGlhcnlCYXJEZWZhdWx0VmlzaWJpbGl0eSA9PT0gJ21heGltaXplZEluV29ya3NwYWNlJykpIHtcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aCA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSOyAvLyBtYXJrZXIgZm9yIGEgbWF4aW1pc2VkIGF1eGlsaWFyeSBiYXJcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aCA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXV4aWxpYXJ5QmFyV2lkdGggPSAwOyAvLyB0ZWNobmljYWxseSBub3QgdHJ1ZSBpZiBjb25maWd1cmVkICd2aXNpYmxlJywgYnV0IHdlIG5ldmVyIHN0b3JlIHNwbGFzaCBwZXIgZW1wdHkgd2luZG93LCBzbyB3ZSBkZWNpZGUgb24gYSBkZWZhdWx0IGhlcmVcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0Qm91bmRzID0gc2lkZUJhcldpZHRoID09PSBwYXJ0U3BsYXNoLmxheW91dEluZm8uc2lkZUJhcldpZHRoICYmIGF1eGlsaWFyeUJhcldpZHRoID09PSBwYXJ0U3BsYXNoLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGhcblx0XHRcdD8gcGFydFNwbGFzaC5sYXlvdXRJbmZvLnBhcnRCb3VuZHNcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnBhcnRTcGxhc2gsXG5cdFx0XHRsYXlvdXRJbmZvOiB7XG5cdFx0XHRcdC4uLnBhcnRTcGxhc2gubGF5b3V0SW5mbyxcblx0XHRcdFx0c2lkZUJhcldpZHRoLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdFx0cGFydEJvdW5kc1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldFdpbmRvd1NwbGFzaE92ZXJyaWRlKCk6IElQYXJ0c1NwbGFzaE92ZXJyaWRlIHtcblx0XHRsZXQgb3ZlcnJpZGUgPSB0aGlzLnN0YXRlU2VydmljZS5nZXRJdGVtPElQYXJ0c1NwbGFzaE92ZXJyaWRlPihUSEVNRV9XSU5ET1dfU1BMQVNIX09WRVJSSURFX0tFWSk7XG5cblx0XHRpZiAoIW92ZXJyaWRlPy5sYXlvdXRJbmZvKSB7XG5cdFx0XHRvdmVycmlkZSA9IHtcblx0XHRcdFx0bGF5b3V0SW5mbzoge1xuXHRcdFx0XHRcdHNpZGVCYXJXaWR0aDogVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSCxcblx0XHRcdFx0XHRhdXhpbGlhcnlCYXJXaWR0aDogVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSCxcblx0XHRcdFx0XHR3b3Jrc3BhY2VzOiB7fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghb3ZlcnJpZGUubGF5b3V0SW5mby5zaWRlQmFyV2lkdGgpIHtcblx0XHRcdG92ZXJyaWRlLmxheW91dEluZm8uc2lkZUJhcldpZHRoID0gVGhlbWVNYWluU2VydmljZS5ERUZBVUxUX0JBUl9XSURUSDtcblx0XHR9XG5cblx0XHRpZiAoIW92ZXJyaWRlLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGgpIHtcblx0XHRcdG92ZXJyaWRlLmxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggPSBUaGVtZU1haW5TZXJ2aWNlLkRFRkFVTFRfQkFSX1dJRFRIO1xuXHRcdH1cblxuXHRcdGlmICghb3ZlcnJpZGUubGF5b3V0SW5mby53b3Jrc3BhY2VzKSB7XG5cdFx0XHRvdmVycmlkZS5sYXlvdXRJbmZvLndvcmtzcGFjZXMgPSB7fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3ZlcnJpZGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxhQUFhLGlCQUFpQjtBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUc5QixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGFBQWEsZ0JBQWdCO0FBS3RDLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sc0JBQXNCO0FBRTVCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sdUJBQXVCO0FBRTdCLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sbUNBQW1DO0FBRXpDLE1BQU0sUUFBVztBQUFBLEVBQ2hCLFlBQTRCLEtBQTZCLGNBQWlCO0FBQTlDO0FBQTZCO0FBQUEsRUFDekQ7QUFBQSxFQUNBLFNBQVMsc0JBQWdEO0FBQ3hELFdBQU8scUJBQXFCLFNBQVksS0FBSyxHQUFHLEtBQUssS0FBSztBQUFBLEVBQzNEO0FBQ0Q7QUFBQSxDQUdBLENBQVVBLGFBQVY7QUFDUSxFQUFNQSxTQUFBLHNCQUFzQixJQUFJQSxTQUFpQixnQ0FBZ0MsS0FBSztBQUN0RixFQUFNQSxTQUFBLFlBQVksSUFBSUEsU0FBaUIsaUNBQWlDLElBQUk7QUFDNUUsRUFBTUEsU0FBQSxxQkFBcUIsSUFBSUEsU0FBK0MsMkJBQTJCLFNBQVM7QUFDbEgsRUFBTUEsU0FBQSxrQ0FBa0MsSUFBSUEsU0FBNEYsZ0RBQWdELG9CQUFvQjtBQUM1TSxFQUFNQSxTQUFBLGlCQUFpQixJQUFJQSxTQUF5SSwyQkFBMkIsYUFBYTtBQUFBLEdBTDFNO0FBd0JILElBQU0sbUJBQU4sY0FBK0IsV0FBd0M7QUFBQSxFQVc3RSxZQUN3QixjQUNRLHNCQUNWLFlBQ3BCO0FBQ0QsVUFBTTtBQUppQjtBQUNRO0FBQ1Y7QUFOdEIsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQXNCLENBQUM7QUFDckYsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFVOUQsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsWUFBSSxFQUFFLHFCQUFxQixRQUFRLG1CQUFtQixHQUFHLEtBQUssRUFBRSxxQkFBcUIsUUFBUSxvQkFBb0IsR0FBRyxHQUFHO0FBQ3RILGVBQUssdUJBQXVCO0FBQzVCLGVBQUssaUJBQWlCO0FBQUEsUUFDdkI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxTQUFLLHVCQUF1QjtBQUM1QixTQUFLLGlCQUFpQjtBQUd0QixTQUFLLFVBQVUsTUFBTSxxQkFBcUIsU0FBUyxhQUFhLFNBQVMsRUFBRSxNQUFNO0FBQ2hGLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssd0JBQXdCLEtBQUssS0FBSyxlQUFlLENBQUM7QUFBQSxJQUN4RCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxtQkFBeUI7QUFDaEMsUUFBSSxLQUFLLFdBQVcsU0FBUyxLQUFLLFNBQVMsT0FBTztBQUNqRCxZQUFNLGFBQWEsQ0FBQyxZQUF1QyxHQUFHLFFBQVEsR0FBRyxJQUFJLFFBQVEsU0FBUyxLQUFLLG9CQUFvQixDQUFDO0FBQ3hILFdBQUssV0FBVyxNQUFNLHdCQUF3QixXQUFXLFFBQVEsbUJBQW1CLENBQUMsS0FBSyxXQUFXLFFBQVEsU0FBUyxDQUFDLEtBQUssV0FBVyxRQUFRLGtCQUFrQixDQUFDLEVBQUU7QUFFcEssWUFBTSxjQUFjLENBQUMsYUFBeUMsR0FBRyxPQUFPLFFBQVEsQ0FBQyxJQUFJLFNBQVMsWUFBWSxRQUFRLENBQUM7QUFDbkgsV0FBSyxXQUFXLE1BQU0sOENBQThDLFlBQVksYUFBYSxDQUFDLEtBQUssWUFBWSxxQkFBcUIsQ0FBQyxLQUFLLFlBQVksNkJBQTZCLENBQUMsS0FBSyxZQUFZLDhCQUE4QixDQUFDLEtBQUssWUFBWSwwQ0FBMEMsQ0FBQyxHQUFHO0FBQ25TLFdBQUssV0FBVyxNQUFNLDBDQUEwQyxLQUFLLFVBQVUsS0FBSyxlQUFlLENBQUMsQ0FBQyxFQUFFO0FBQUEsSUFDeEc7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBK0I7QUFDdEMsUUFBSSxXQUFXLEtBQUssd0JBQXdCLEdBQUc7QUFDOUMsZUFBUyxZQUFZLGNBQWM7QUFBQSxJQUNwQyxPQUFPO0FBQ04sY0FBUSxRQUFRLG1CQUFtQixTQUFTLEtBQUssb0JBQW9CLEdBQUc7QUFBQSxRQUN2RSxLQUFLO0FBQ0osbUJBQVMsWUFBWSxjQUFjO0FBQ25DO0FBQUEsUUFDRCxLQUFLO0FBQ0osbUJBQVMsWUFBWSxjQUFjO0FBQ25DO0FBQUEsUUFDRCxLQUFLO0FBQ0osa0JBQVEsS0FBSyxzQkFBc0IsS0FBSyxLQUFLLG1CQUFtQixHQUFHO0FBQUEsWUFDbEUsS0FBSyxrQkFBa0I7QUFBSSx1QkFBUyxZQUFZLGNBQWM7QUFBUztBQUFBLFlBQ3ZFLEtBQUssa0JBQWtCO0FBQVMsdUJBQVMsWUFBWSxjQUFjO0FBQVE7QUFBQSxZQUMzRTtBQUFTLHVCQUFTLFlBQVksY0FBYztBQUFBLFVBQzdDO0FBQ0E7QUFBQSxRQUNEO0FBQ0MsbUJBQVMsWUFBWSxjQUFjO0FBQ25DO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxpQkFBK0I7QUFHOUIsUUFBSSxXQUFXO0FBQ2QsVUFBSSxTQUFTLFlBQVksNkJBQTZCO0FBRXJELGVBQU8sRUFBRSxNQUFNLFNBQVMsWUFBWSw4QkFBOEIsY0FBYyxLQUFLO0FBQUEsTUFDdEY7QUFBQSxJQUNELFdBSVMsYUFBYTtBQUNyQixVQUFJLFNBQVMsWUFBWSxnQ0FBZ0MsU0FBUyxZQUFZLDZCQUE2QjtBQUMxRyxlQUFPLEVBQUUsTUFBTSxTQUFTLFlBQVkscUJBQXFCLGNBQWMsS0FBSztBQUFBLE1BQzdFO0FBQUEsSUFDRCxXQUdTLFNBQVM7QUFDakIsVUFBSSxTQUFTLFlBQVksNkJBQTZCO0FBQ3JELGVBQU8sRUFBRSxNQUFNLE1BQU0sY0FBYyxLQUFLO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sTUFBTSxTQUFTLFlBQVk7QUFBQSxNQUMzQixjQUFjO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHdCQUF1RDtBQUN0RCxVQUFNLGNBQWMsS0FBSyxlQUFlO0FBQ3hDLFFBQUksUUFBUSxVQUFVLFNBQVMsS0FBSyxvQkFBb0IsS0FBSyxZQUFZLGNBQWM7QUFDdEYsYUFBTyxZQUFZLE9BQU8sa0JBQWtCLFdBQVcsa0JBQWtCO0FBQUEsSUFDMUU7QUFFQSxRQUFJLEtBQUssd0JBQXdCLEdBQUc7QUFDbkMsYUFBTyxZQUFZLE9BQU8sa0JBQWtCLFVBQVUsa0JBQWtCO0FBQUEsSUFDekU7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsMEJBQW1DO0FBQ2xDLFFBQUksUUFBUSxvQkFBb0IsU0FBUyxLQUFLLG9CQUFvQixHQUFHO0FBQ3BFLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHFCQUE2QjtBQUM1QixVQUFNLFlBQVksS0FBSyxzQkFBc0I7QUFDN0MsVUFBTSxTQUFTLEtBQUssbUJBQW1CO0FBR3ZDLFFBQUksY0FBYyxVQUFhLGNBQWMsUUFBUTtBQUNwRCxZQUFNLG1CQUFtQixLQUFLLGFBQWEsUUFBdUIsc0JBQXNCLElBQUk7QUFDNUYsVUFBSSxrQkFBa0I7QUFDckIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBR0EsWUFBUSxhQUFhLFFBQVE7QUFBQSxNQUM1QixLQUFLLGtCQUFrQjtBQUFJLGVBQU87QUFBQSxNQUNsQyxLQUFLLGtCQUFrQjtBQUFVLGVBQU87QUFBQSxNQUN4QyxLQUFLLGtCQUFrQjtBQUFVLGVBQU87QUFBQSxNQUN4QztBQUFTLGVBQU87QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUF3QztBQUMvQyxVQUFNLFlBQVksS0FBSyxhQUFhLFFBQTJCLG1CQUFtQixrQkFBa0IsT0FBTyxFQUFFLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFDekgsWUFBUSxXQUFXO0FBQUEsTUFDbEIsS0FBSyxrQkFBa0I7QUFBSSxlQUFPLGtCQUFrQjtBQUFBLE1BQ3BELEtBQUssa0JBQWtCO0FBQVUsZUFBTyxrQkFBa0I7QUFBQSxNQUMxRCxLQUFLLGtCQUFrQjtBQUFVLGVBQU8sa0JBQWtCO0FBQUEsTUFDMUQ7QUFBUyxlQUFPLGtCQUFrQjtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsaUJBQWlCLFVBQThCLFdBQWdGLFFBQTRCO0FBRzFKLFVBQU0saUJBQWlCLEtBQUssMkJBQTJCLFdBQVcsTUFBTTtBQUd4RSxTQUFLLGFBQWEsU0FBUyxTQUFTO0FBQUEsTUFDbkMsRUFBRSxLQUFLLG1CQUFtQixNQUFNLE9BQU8sVUFBVTtBQUFBLE1BQ2pELEVBQUUsS0FBSyxzQkFBc0IsTUFBTSxPQUFPLFVBQVUsV0FBVztBQUFBLE1BQy9ELEVBQUUsS0FBSyx5QkFBeUIsTUFBTSxPQUFPO0FBQUEsTUFDN0MsaUJBQWlCLEVBQUUsS0FBSyxrQ0FBa0MsTUFBTSxlQUFlLElBQUk7QUFBQSxJQUNwRixDQUFDLENBQUM7QUFHRixRQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDLFdBQUssc0JBQXNCLFVBQVUsTUFBTTtBQUFBLElBQzVDO0FBR0EsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRVEsMkJBQTJCLFdBQWdGLFFBQXdEO0FBQzFLLFFBQUksaUJBQW1EO0FBQ3ZELFFBQUksVUFBVTtBQUNkLFFBQUksV0FBVztBQUNkLHVCQUFpQixFQUFFLEdBQUcsS0FBSyx3QkFBd0IsRUFBRTtBQUVyRCxnQkFBVSxLQUFLLDZCQUE2QixXQUFXLFFBQVEsZ0JBQWdCLFNBQVM7QUFDeEYsZ0JBQVUsS0FBSyw2QkFBNkIsV0FBVyxRQUFRLGdCQUFnQixjQUFjLEtBQUs7QUFBQSxJQUNuRztBQUVBLFdBQU8sVUFBVSxpQkFBaUI7QUFBQSxFQUNuQztBQUFBLEVBRVEsNkJBQTZCLFdBQW9FLFFBQXNCLGdCQUFzQyxNQUEyQztBQUMvTSxVQUFNLGVBQWUsU0FBUyxZQUFZLE9BQU8sWUFBWSxlQUFlLE9BQU8sWUFBWTtBQUMvRixVQUFNLGdCQUFnQixTQUFTLFlBQVksZUFBZSxXQUFXLGVBQWUsZUFBZSxXQUFXO0FBRzlHLFFBQUksVUFBVTtBQUNkLFFBQUksT0FBTyxpQkFBaUIsVUFBVTtBQUNyQyxVQUFJLGVBQWUsV0FBVyxXQUFXLFVBQVUsRUFBRSxHQUFHO0FBQ3ZELGVBQU8sZUFBZSxXQUFXLFdBQVcsVUFBVSxFQUFFO0FBQ3hELGtCQUFVO0FBQUEsTUFDWDtBQUVBLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxvQkFBb0IsZUFBZSxXQUFXLFdBQVcsVUFBVSxFQUFFO0FBQ3pFLFFBQUksQ0FBQyxtQkFBbUI7QUFDdkIsWUFBTSxtQkFBbUIsT0FBTyxLQUFLLGVBQWUsV0FBVyxVQUFVO0FBQ3pFLFVBQUksaUJBQWlCLFVBQVUsaUJBQWlCLDBCQUEwQjtBQUN6RSxlQUFPLGVBQWUsV0FBVyxXQUFXLGlCQUFpQixDQUFDLENBQUM7QUFDL0Qsa0JBQVU7QUFBQSxNQUNYO0FBRUEsMEJBQW9CLEVBQUUsZ0JBQWdCLE9BQU8scUJBQXFCLE1BQU07QUFDeEUscUJBQWUsV0FBVyxXQUFXLFVBQVUsRUFBRSxJQUFJO0FBQ3JELGdCQUFVO0FBQUEsSUFDWDtBQUdBLFFBQUksZUFBZSxHQUFHO0FBQ3JCLFVBQUksa0JBQWtCLGNBQWM7QUFDbkMsdUJBQWUsV0FBVyxTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixJQUFJO0FBQ3ZGLGtCQUFVO0FBQUEsTUFDWDtBQUVBLGNBQVEsTUFBTTtBQUFBLFFBQ2IsS0FBSztBQUNKLGNBQUksQ0FBQyxrQkFBa0IsZ0JBQWdCO0FBQ3RDLDhCQUFrQixpQkFBaUI7QUFDbkMsc0JBQVU7QUFBQSxVQUNYO0FBQ0E7QUFBQSxRQUNELEtBQUs7QUFDSixjQUFJLENBQUMsa0JBQWtCLHFCQUFxQjtBQUMzQyw4QkFBa0Isc0JBQXNCO0FBQ3hDLHNCQUFVO0FBQUEsVUFDWDtBQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FHSztBQUNKLGNBQVEsTUFBTTtBQUFBLFFBQ2IsS0FBSztBQUNKLGNBQUksa0JBQWtCLGdCQUFnQjtBQUNyQyw4QkFBa0IsaUJBQWlCO0FBQ25DLHNCQUFVO0FBQUEsVUFDWDtBQUNBO0FBQUEsUUFDRCxLQUFLO0FBQ0osY0FBSSxrQkFBa0IscUJBQXFCO0FBQzFDLDhCQUFrQixzQkFBc0I7QUFDeEMsc0JBQVU7QUFBQSxVQUNYO0FBQ0E7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBc0IsVUFBa0IsUUFBNEI7QUFDM0UsZUFBVyxVQUFVLGdDQUFnQyxHQUFHO0FBQ3ZELFVBQUksT0FBTyxPQUFPLFVBQVU7QUFDM0IsZUFBTyxtQkFBbUIsT0FBTyxVQUFVLFVBQVU7QUFDckQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGdCQUFnQixXQUEwRztBQUN6SCxRQUFJO0FBQ0gsYUFBTyxLQUFLLGtCQUFrQixTQUFTO0FBQUEsSUFDeEMsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sb0RBQW9ELEtBQUs7QUFFL0UsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsV0FBMEc7QUFDbkksVUFBTSxhQUFhLEtBQUssYUFBYSxRQUFzQix1QkFBdUI7QUFDbEYsUUFBSSxDQUFDLFlBQVksWUFBWTtBQUM1QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBVyxLQUFLLHdCQUF3QjtBQUc5QyxRQUFJO0FBQ0osUUFBSSxXQUFXO0FBQ2QsVUFBSSxTQUFTLFdBQVcsV0FBVyxVQUFVLEVBQUUsR0FBRyxtQkFBbUIsT0FBTztBQUMzRSx1QkFBZTtBQUFBLE1BQ2hCLE9BQU87QUFDTix1QkFBZSxTQUFTLFdBQVcsZ0JBQWdCLFdBQVcsV0FBVyxnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDM0c7QUFBQSxJQUNELE9BQU87QUFDTixxQkFBZTtBQUFBLElBQ2hCO0FBR0EsVUFBTSxnQ0FBZ0MsUUFBUSxnQ0FBZ0MsU0FBUyxLQUFLLG9CQUFvQjtBQUNoSCxVQUFNLGdCQUFnQixRQUFRLGVBQWUsU0FBUyxLQUFLLG9CQUFvQjtBQUMvRSxRQUFJO0FBQ0osUUFBSSxXQUFXO0FBQ2QsWUFBTSxzQkFBc0IsU0FBUyxXQUFXLFdBQVcsVUFBVSxFQUFFLEdBQUc7QUFDMUUsVUFBSSx3QkFBd0IsTUFBTTtBQUNqQyw0QkFBb0IsU0FBUyxXQUFXLHFCQUFxQixXQUFXLFdBQVcscUJBQXFCLGlCQUFpQjtBQUFBLE1BQzFILFdBQVcsd0JBQXdCLE9BQU87QUFDekMsNEJBQW9CO0FBQUEsTUFDckIsT0FBTztBQUNOLFlBQUksa0JBQWtCLCtCQUErQixrQ0FBa0MsYUFBYSxrQ0FBa0MsdUJBQXVCO0FBQzVKLDhCQUFvQixTQUFTLFdBQVcscUJBQXFCLFdBQVcsV0FBVyxxQkFBcUIsaUJBQWlCO0FBQUEsUUFDMUgsV0FBVyxrQkFBa0IsK0JBQStCLGtDQUFrQyxlQUFlLGtDQUFrQyx5QkFBeUI7QUFDdkssOEJBQW9CLE9BQU87QUFBQSxRQUM1QixPQUFPO0FBQ04sOEJBQW9CO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBQ04sMEJBQW9CO0FBQUEsSUFDckI7QUFFQSxVQUFNLGFBQWEsaUJBQWlCLFdBQVcsV0FBVyxnQkFBZ0Isc0JBQXNCLFdBQVcsV0FBVyxvQkFDbkgsV0FBVyxXQUFXLGFBQ3RCO0FBRUgsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsWUFBWTtBQUFBLFFBQ1gsR0FBRyxXQUFXO0FBQUEsUUFDZDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQkFBZ0Q7QUFDdkQsUUFBSSxXQUFXLEtBQUssYUFBYSxRQUE4QixnQ0FBZ0M7QUFFL0YsUUFBSSxDQUFDLFVBQVUsWUFBWTtBQUMxQixpQkFBVztBQUFBLFFBQ1YsWUFBWTtBQUFBLFVBQ1gsY0FBYyxpQkFBaUI7QUFBQSxVQUMvQixtQkFBbUIsaUJBQWlCO0FBQUEsVUFDcEMsWUFBWSxDQUFDO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLFNBQVMsV0FBVyxjQUFjO0FBQ3RDLGVBQVMsV0FBVyxlQUFlLGlCQUFpQjtBQUFBLElBQ3JEO0FBRUEsUUFBSSxDQUFDLFNBQVMsV0FBVyxtQkFBbUI7QUFDM0MsZUFBUyxXQUFXLG9CQUFvQixpQkFBaUI7QUFBQSxJQUMxRDtBQUVBLFFBQUksQ0FBQyxTQUFTLFdBQVcsWUFBWTtBQUNwQyxlQUFTLFdBQVcsYUFBYSxDQUFDO0FBQUEsSUFDbkM7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBOVdhLGlCQUlZLG9CQUFvQjtBQUpoQyxpQkFNWSwyQkFBMkI7QUFOdkMsbUJBQU47QUFBQSxFQVlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWRVOyIsCiAgIm5hbWVzIjogWyJTZXR0aW5nIl0KfQo=
