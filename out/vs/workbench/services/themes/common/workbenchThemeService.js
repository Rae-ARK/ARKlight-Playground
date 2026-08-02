import { refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isBoolean, isString } from "../../../../base/common/types.js";
const IWorkbenchThemeService = refineServiceDecorator(IThemeService);
const THEME_SCOPE_OPEN_PAREN = "[";
const THEME_SCOPE_CLOSE_PAREN = "]";
const THEME_SCOPE_WILDCARD = "*";
const themeScopeRegex = /\[(.+?)\]/g;
var ThemeSettings = /* @__PURE__ */ ((ThemeSettings2) => {
  ThemeSettings2["COLOR_THEME"] = "workbench.colorTheme";
  ThemeSettings2["FILE_ICON_THEME"] = "workbench.iconTheme";
  ThemeSettings2["PRODUCT_ICON_THEME"] = "workbench.productIconTheme";
  ThemeSettings2["COLOR_CUSTOMIZATIONS"] = "workbench.colorCustomizations";
  ThemeSettings2["TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.tokenColorCustomizations";
  ThemeSettings2["SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS"] = "editor.semanticTokenColorCustomizations";
  ThemeSettings2["PREFERRED_DARK_THEME"] = "workbench.preferredDarkColorTheme";
  ThemeSettings2["PREFERRED_LIGHT_THEME"] = "workbench.preferredLightColorTheme";
  ThemeSettings2["PREFERRED_HC_DARK_THEME"] = "workbench.preferredHighContrastColorTheme";
  ThemeSettings2["PREFERRED_HC_LIGHT_THEME"] = "workbench.preferredHighContrastLightColorTheme";
  ThemeSettings2["DETECT_COLOR_SCHEME"] = "window.autoDetectColorScheme";
  ThemeSettings2["DETECT_HC"] = "window.autoDetectHighContrast";
  ThemeSettings2["SYSTEM_COLOR_THEME"] = "window.systemColorTheme";
  return ThemeSettings2;
})(ThemeSettings || {});
var ThemeSettingDefaults;
((ThemeSettingDefaults2) => {
  ThemeSettingDefaults2.COLOR_THEME_DARK = "Dark 2026";
  ThemeSettingDefaults2.COLOR_THEME_LIGHT = "Light 2026";
  ThemeSettingDefaults2.COLOR_THEME_HC_DARK = "Default High Contrast";
  ThemeSettingDefaults2.COLOR_THEME_HC_LIGHT = "Default High Contrast Light";
  ThemeSettingDefaults2.FILE_ICON_THEME = "vs-seti";
  ThemeSettingDefaults2.PRODUCT_ICON_THEME = "Default";
})(ThemeSettingDefaults || (ThemeSettingDefaults = {}));
function migrateThemeSettingsId(settingsId) {
  switch (settingsId) {
    case "Default Dark Modern":
      return "Dark Modern";
    case "Default Light Modern":
      return "Light Modern";
    case "Default Dark+":
      return "Dark+";
    case "Default Light+":
      return "Light+";
    case "Experimental Dark":
    case "VS Code Dark":
      return ThemeSettingDefaults.COLOR_THEME_DARK;
    case "Experimental Light":
    case "VS Code Light":
      return ThemeSettingDefaults.COLOR_THEME_LIGHT;
  }
  return settingsId;
}
const COLOR_THEME_DARK_INITIAL_COLORS = {
  "actionBar.toggledBackground": "#383a49",
  "activityBar.activeBorder": "#0078D4",
  "activityBar.background": "#181818",
  "activityBar.border": "#2B2B2B",
  "activityBar.foreground": "#D7D7D7",
  "activityBar.inactiveForeground": "#868686",
  "activityBarBadge.background": "#0078D4",
  "activityBarBadge.foreground": "#FFFFFF",
  "badge.background": "#616161",
  "badge.foreground": "#F8F8F8",
  "button.background": "#0078D4",
  "button.border": "#FFFFFF12",
  "button.foreground": "#FFFFFF",
  "button.hoverBackground": "#026EC1",
  "button.secondaryBackground": "#313131",
  "button.secondaryForeground": "#CCCCCC",
  "button.secondaryHoverBackground": "#3C3C3C",
  "chat.slashCommandBackground": "#26477866",
  "chat.slashCommandForeground": "#85B6FF",
  "chat.editedFileForeground": "#E2C08D",
  "checkbox.background": "#313131",
  "checkbox.border": "#3C3C3C",
  "debugToolBar.background": "#181818",
  "descriptionForeground": "#9D9D9D",
  "dropdown.background": "#313131",
  "dropdown.border": "#3C3C3C",
  "dropdown.foreground": "#CCCCCC",
  "dropdown.listBackground": "#1F1F1F",
  "editor.background": "#1F1F1F",
  "editor.findMatchBackground": "#9E6A03",
  "editor.foreground": "#CCCCCC",
  "editor.inactiveSelectionBackground": "#3A3D41",
  "editor.selectionHighlightBackground": "#ADD6FF26",
  "editorGroup.border": "#FFFFFF17",
  "editorGroupHeader.tabsBackground": "#181818",
  "editorGroupHeader.tabsBorder": "#2B2B2B",
  "editorGutter.addedBackground": "#2EA043",
  "editorGutter.deletedBackground": "#F85149",
  "editorGutter.modifiedBackground": "#0078D4",
  "editorIndentGuide.activeBackground1": "#707070",
  "editorIndentGuide.background1": "#404040",
  "editorLineNumber.activeForeground": "#CCCCCC",
  "editorLineNumber.foreground": "#6E7681",
  "editorOverviewRuler.border": "#010409",
  "editorWidget.background": "#202020",
  "errorForeground": "#F85149",
  "focusBorder": "#0078D4",
  "foreground": "#CCCCCC",
  "icon.foreground": "#CCCCCC",
  "input.background": "#313131",
  "input.border": "#3C3C3C",
  "input.foreground": "#CCCCCC",
  "input.placeholderForeground": "#989898",
  "inputOption.activeBackground": "#2489DB82",
  "inputOption.activeBorder": "#2488DB",
  "keybindingLabel.foreground": "#CCCCCC",
  "list.activeSelectionIconForeground": "#FFF",
  "list.dropBackground": "#383B3D",
  "menu.background": "#1F1F1F",
  "menu.border": "#454545",
  "menu.foreground": "#CCCCCC",
  "menu.selectionBackground": "#0078d4",
  "menu.separatorBackground": "#454545",
  "notificationCenterHeader.background": "#1F1F1F",
  "notificationCenterHeader.foreground": "#CCCCCC",
  "notifications.background": "#1F1F1F",
  "notifications.border": "#2B2B2B",
  "notifications.foreground": "#CCCCCC",
  "panel.background": "#181818",
  "panel.border": "#2B2B2B",
  "panelInput.border": "#2B2B2B",
  "panelTitle.activeBorder": "#0078D4",
  "panelTitle.activeForeground": "#CCCCCC",
  "panelTitle.inactiveForeground": "#9D9D9D",
  "peekViewEditor.background": "#1F1F1F",
  "peekViewEditor.matchHighlightBackground": "#BB800966",
  "peekViewResult.background": "#1F1F1F",
  "peekViewResult.matchHighlightBackground": "#BB800966",
  "pickerGroup.border": "#3C3C3C",
  "ports.iconRunningProcessForeground": "#369432",
  "progressBar.background": "#0078D4",
  "quickInput.background": "#222222",
  "quickInput.foreground": "#CCCCCC",
  "settings.dropdownBackground": "#313131",
  "settings.dropdownBorder": "#3C3C3C",
  "settings.headerForeground": "#FFFFFF",
  "settings.modifiedItemIndicator": "#BB800966",
  "sideBar.background": "#181818",
  "sideBar.border": "#2B2B2B",
  "sideBar.foreground": "#CCCCCC",
  "sideBarSectionHeader.background": "#181818",
  "sideBarSectionHeader.border": "#2B2B2B",
  "sideBarSectionHeader.foreground": "#CCCCCC",
  "sideBarTitle.foreground": "#CCCCCC",
  "statusBar.background": "#181818",
  "statusBar.border": "#2B2B2B",
  "statusBar.debuggingBackground": "#0078D4",
  "statusBar.debuggingForeground": "#FFFFFF",
  "statusBar.focusBorder": "#0078D4",
  "statusBar.foreground": "#CCCCCC",
  "statusBar.noFolderBackground": "#1F1F1F",
  "statusBarItem.focusBorder": "#0078D4",
  "statusBarItem.prominentBackground": "#6E768166",
  "statusBarItem.remoteBackground": "#0078D4",
  "statusBarItem.remoteForeground": "#FFFFFF",
  "tab.activeBackground": "#1F1F1F",
  "tab.activeBorder": "#1F1F1F",
  "tab.activeBorderTop": "#0078D4",
  "tab.activeForeground": "#FFFFFF",
  "tab.border": "#2B2B2B",
  "tab.hoverBackground": "#1F1F1F",
  "tab.inactiveBackground": "#181818",
  "tab.inactiveForeground": "#9D9D9D",
  "tab.lastPinnedBorder": "#ccc3",
  "tab.selectedBackground": "#37373D",
  "tab.selectedBorderTop": "#6caddf",
  "tab.selectedForeground": "#FFFFFF",
  "tab.unfocusedActiveBorder": "#1F1F1F",
  "tab.unfocusedActiveBorderTop": "#2B2B2B",
  "tab.unfocusedHoverBackground": "#1F1F1F",
  "terminal.foreground": "#CCCCCC",
  "terminal.inactiveSelectionBackground": "#3A3D41",
  "terminal.tab.activeBorder": "#0078D4",
  "textBlockQuote.background": "#2B2B2B",
  "textBlockQuote.border": "#616161",
  "textCodeBlock.background": "#2B2B2B",
  "textLink.activeForeground": "#4daafc",
  "textLink.foreground": "#4daafc",
  "textPreformat.background": "#3C3C3C",
  "textPreformat.foreground": "#D0D0D0",
  "textSeparator.foreground": "#21262D",
  "titleBar.activeBackground": "#181818",
  "titleBar.activeForeground": "#CCCCCC",
  "titleBar.border": "#2B2B2B",
  "titleBar.inactiveBackground": "#1F1F1F",
  "titleBar.inactiveForeground": "#9D9D9D",
  "welcomePage.progress.foreground": "#0078D4",
  "welcomePage.tileBackground": "#2B2B2B",
  "widget.border": "#313131"
};
const COLOR_THEME_LIGHT_INITIAL_COLORS = {
  "actionBar.toggledBackground": "#dddddd",
  "activityBar.activeBorder": "#005FB8",
  "activityBar.background": "#F8F8F8",
  "activityBar.border": "#E5E5E5",
  "activityBar.foreground": "#1F1F1F",
  "activityBar.inactiveForeground": "#616161",
  "activityBarBadge.background": "#005FB8",
  "activityBarBadge.foreground": "#FFFFFF",
  "badge.background": "#CCCCCC",
  "badge.foreground": "#3B3B3B",
  "button.background": "#005FB8",
  "button.border": "#0000001a",
  "button.foreground": "#FFFFFF",
  "button.hoverBackground": "#0258A8",
  "button.secondaryBackground": "#E5E5E5",
  "button.secondaryForeground": "#3B3B3B",
  "button.secondaryHoverBackground": "#CCCCCC",
  "chat.slashCommandBackground": "#ADCEFF7A",
  "chat.slashCommandForeground": "#26569E",
  "chat.editedFileForeground": "#895503",
  "checkbox.background": "#F8F8F8",
  "checkbox.border": "#CECECE",
  "descriptionForeground": "#3B3B3B",
  "diffEditor.unchangedRegionBackground": "#f8f8f8",
  "dropdown.background": "#FFFFFF",
  "dropdown.border": "#CECECE",
  "dropdown.foreground": "#3B3B3B",
  "dropdown.listBackground": "#FFFFFF",
  "editor.background": "#FFFFFF",
  "editor.foreground": "#3B3B3B",
  "editor.inactiveSelectionBackground": "#E5EBF1",
  "editor.selectionHighlightBackground": "#ADD6FF80",
  "editorGroup.border": "#E5E5E5",
  "editorGroupHeader.tabsBackground": "#F8F8F8",
  "editorGroupHeader.tabsBorder": "#E5E5E5",
  "editorGutter.addedBackground": "#2EA043",
  "editorGutter.deletedBackground": "#F85149",
  "editorGutter.modifiedBackground": "#005FB8",
  "editorIndentGuide.activeBackground1": "#939393",
  "editorIndentGuide.background1": "#D3D3D3",
  "editorLineNumber.activeForeground": "#171184",
  "editorLineNumber.foreground": "#6E7681",
  "editorOverviewRuler.border": "#E5E5E5",
  "editorSuggestWidget.background": "#F8F8F8",
  "editorWidget.background": "#F8F8F8",
  "errorForeground": "#F85149",
  "focusBorder": "#005FB8",
  "foreground": "#3B3B3B",
  "icon.foreground": "#3B3B3B",
  "input.background": "#FFFFFF",
  "input.border": "#CECECE",
  "input.foreground": "#3B3B3B",
  "input.placeholderForeground": "#767676",
  "inputOption.activeBackground": "#BED6ED",
  "inputOption.activeBorder": "#005FB8",
  "inputOption.activeForeground": "#000000",
  "keybindingLabel.foreground": "#3B3B3B",
  "list.activeSelectionBackground": "#E8E8E8",
  "list.activeSelectionForeground": "#000000",
  "list.activeSelectionIconForeground": "#000000",
  "list.focusAndSelectionOutline": "#005FB8",
  "list.hoverBackground": "#F2F2F2",
  "menu.border": "#CECECE",
  "menu.selectionBackground": "#005FB8",
  "menu.selectionForeground": "#ffffff",
  "notebook.cellBorderColor": "#E5E5E5",
  "notebook.selectedCellBackground": "#C8DDF150",
  "notificationCenterHeader.background": "#FFFFFF",
  "notificationCenterHeader.foreground": "#3B3B3B",
  "notifications.background": "#FFFFFF",
  "notifications.border": "#E5E5E5",
  "notifications.foreground": "#3B3B3B",
  "panel.background": "#F8F8F8",
  "panel.border": "#E5E5E5",
  "panelInput.border": "#E5E5E5",
  "panelTitle.activeBorder": "#005FB8",
  "panelTitle.activeForeground": "#3B3B3B",
  "panelTitle.inactiveForeground": "#3B3B3B",
  "peekViewEditor.matchHighlightBackground": "#BB800966",
  "peekViewResult.background": "#FFFFFF",
  "peekViewResult.matchHighlightBackground": "#BB800966",
  "pickerGroup.border": "#E5E5E5",
  "pickerGroup.foreground": "#8B949E",
  "ports.iconRunningProcessForeground": "#369432",
  "progressBar.background": "#005FB8",
  "quickInput.background": "#F8F8F8",
  "quickInput.foreground": "#3B3B3B",
  "searchEditor.textInputBorder": "#CECECE",
  "settings.dropdownBackground": "#FFFFFF",
  "settings.dropdownBorder": "#CECECE",
  "settings.headerForeground": "#1F1F1F",
  "settings.modifiedItemIndicator": "#BB800966",
  "settings.numberInputBorder": "#CECECE",
  "settings.textInputBorder": "#CECECE",
  "sideBar.background": "#F8F8F8",
  "sideBar.border": "#E5E5E5",
  "sideBar.foreground": "#3B3B3B",
  "sideBarSectionHeader.background": "#F8F8F8",
  "sideBarSectionHeader.border": "#E5E5E5",
  "sideBarSectionHeader.foreground": "#3B3B3B",
  "sideBarTitle.foreground": "#3B3B3B",
  "statusBar.background": "#F8F8F8",
  "statusBar.border": "#E5E5E5",
  "statusBar.debuggingBackground": "#FD716C",
  "statusBar.debuggingForeground": "#000000",
  "statusBar.focusBorder": "#005FB8",
  "statusBar.foreground": "#3B3B3B",
  "statusBar.noFolderBackground": "#F8F8F8",
  "statusBarItem.compactHoverBackground": "#CCCCCC",
  "statusBarItem.errorBackground": "#C72E0F",
  "statusBarItem.focusBorder": "#005FB8",
  "statusBarItem.hoverBackground": "#B8B8B850",
  "statusBarItem.prominentBackground": "#6E768166",
  "statusBarItem.remoteBackground": "#005FB8",
  "statusBarItem.remoteForeground": "#FFFFFF",
  "tab.activeBackground": "#FFFFFF",
  "tab.activeBorder": "#F8F8F8",
  "tab.activeBorderTop": "#005FB8",
  "tab.activeForeground": "#3B3B3B",
  "tab.border": "#E5E5E5",
  "tab.hoverBackground": "#FFFFFF",
  "tab.inactiveBackground": "#F8F8F8",
  "tab.inactiveForeground": "#868686",
  "tab.lastPinnedBorder": "#D4D4D4",
  "tab.selectedBackground": "#E4E6F1",
  "tab.selectedBorderTop": "#68a3da",
  "tab.selectedForeground": "#333333",
  "tab.unfocusedActiveBorder": "#F8F8F8",
  "tab.unfocusedActiveBorderTop": "#E5E5E5",
  "tab.unfocusedHoverBackground": "#F8F8F8",
  "terminal.foreground": "#3B3B3B",
  "terminal.inactiveSelectionBackground": "#E5EBF1",
  "terminal.tab.activeBorder": "#005FB8",
  "terminalCursor.foreground": "#005FB8",
  "textBlockQuote.background": "#F8F8F8",
  "textBlockQuote.border": "#E5E5E5",
  "textCodeBlock.background": "#F8F8F8",
  "textLink.activeForeground": "#005FB8",
  "textLink.foreground": "#005FB8",
  "textPreformat.background": "#0000001F",
  "textPreformat.foreground": "#3B3B3B",
  "textSeparator.foreground": "#21262D",
  "titleBar.activeBackground": "#F8F8F8",
  "titleBar.activeForeground": "#1E1E1E",
  "titleBar.border": "#E5E5E5",
  "titleBar.inactiveBackground": "#F8F8F8",
  "titleBar.inactiveForeground": "#8B949E",
  "welcomePage.tileBackground": "#F3F3F3",
  "widget.border": "#E5E5E5"
};
var ExtensionData;
((ExtensionData2) => {
  function toJSONObject(d) {
    return d && { _extensionId: d.extensionId, _extensionIsBuiltin: d.extensionIsBuiltin, _extensionName: d.extensionName, _extensionPublisher: d.extensionPublisher };
  }
  ExtensionData2.toJSONObject = toJSONObject;
  function fromJSONObject(o) {
    if (o && isString(o._extensionId) && isBoolean(o._extensionIsBuiltin) && isString(o._extensionName) && isString(o._extensionPublisher)) {
      return { extensionId: o._extensionId, extensionIsBuiltin: o._extensionIsBuiltin, extensionName: o._extensionName, extensionPublisher: o._extensionPublisher };
    }
    return void 0;
  }
  ExtensionData2.fromJSONObject = fromJSONObject;
  function fromName(publisher, name, isBuiltin = false) {
    return { extensionPublisher: publisher, extensionId: `${publisher}.${name}`, extensionName: name, extensionIsBuiltin: isBuiltin };
  }
  ExtensionData2.fromName = fromName;
})(ExtensionData || (ExtensionData = {}));
export {
  COLOR_THEME_DARK_INITIAL_COLORS,
  COLOR_THEME_LIGHT_INITIAL_COLORS,
  ExtensionData,
  IWorkbenchThemeService,
  THEME_SCOPE_CLOSE_PAREN,
  THEME_SCOPE_OPEN_PAREN,
  THEME_SCOPE_WILDCARD,
  ThemeSettingDefaults,
  ThemeSettings,
  migrateThemeSettingsId,
  themeScopeRegex
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlZmluZVNlcnZpY2VEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSwgSUZpbGVJY29uVGhlbWUsIElQcm9kdWN0SWNvblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0Jvb2xlYW4sIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSWNvbkNvbnRyaWJ1dGlvbiwgSWNvbkRlZmluaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lLCBUaGVtZVR5cGVTZWxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlID0gcmVmaW5lU2VydmljZURlY29yYXRvcjxJVGhlbWVTZXJ2aWNlLCBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlPihJVGhlbWVTZXJ2aWNlKTtcblxuZXhwb3J0IGNvbnN0IFRIRU1FX1NDT1BFX09QRU5fUEFSRU4gPSAnWyc7XG5leHBvcnQgY29uc3QgVEhFTUVfU0NPUEVfQ0xPU0VfUEFSRU4gPSAnXSc7XG5leHBvcnQgY29uc3QgVEhFTUVfU0NPUEVfV0lMRENBUkQgPSAnKic7XG5cbmV4cG9ydCBjb25zdCB0aGVtZVNjb3BlUmVnZXggPSAvXFxbKC4rPylcXF0vZztcblxuZXhwb3J0IGVudW0gVGhlbWVTZXR0aW5ncyB7XG5cdENPTE9SX1RIRU1FID0gJ3dvcmtiZW5jaC5jb2xvclRoZW1lJyxcblx0RklMRV9JQ09OX1RIRU1FID0gJ3dvcmtiZW5jaC5pY29uVGhlbWUnLFxuXHRQUk9EVUNUX0lDT05fVEhFTUUgPSAnd29ya2JlbmNoLnByb2R1Y3RJY29uVGhlbWUnLFxuXHRDT0xPUl9DVVNUT01JWkFUSU9OUyA9ICd3b3JrYmVuY2guY29sb3JDdXN0b21pemF0aW9ucycsXG5cdFRPS0VOX0NPTE9SX0NVU1RPTUlaQVRJT05TID0gJ2VkaXRvci50b2tlbkNvbG9yQ3VzdG9taXphdGlvbnMnLFxuXHRTRU1BTlRJQ19UT0tFTl9DT0xPUl9DVVNUT01JWkFUSU9OUyA9ICdlZGl0b3Iuc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMnLFxuXG5cdFBSRUZFUlJFRF9EQVJLX1RIRU1FID0gJ3dvcmtiZW5jaC5wcmVmZXJyZWREYXJrQ29sb3JUaGVtZScsXG5cdFBSRUZFUlJFRF9MSUdIVF9USEVNRSA9ICd3b3JrYmVuY2gucHJlZmVycmVkTGlnaHRDb2xvclRoZW1lJyxcblx0UFJFRkVSUkVEX0hDX0RBUktfVEhFTUUgPSAnd29ya2JlbmNoLnByZWZlcnJlZEhpZ2hDb250cmFzdENvbG9yVGhlbWUnLCAvKiBpZCBrZXB0IGZvciBjb21wYXRpYmlsaXR5IHJlYXNvbnMgKi9cblx0UFJFRkVSUkVEX0hDX0xJR0hUX1RIRU1FID0gJ3dvcmtiZW5jaC5wcmVmZXJyZWRIaWdoQ29udHJhc3RMaWdodENvbG9yVGhlbWUnLFxuXHRERVRFQ1RfQ09MT1JfU0NIRU1FID0gJ3dpbmRvdy5hdXRvRGV0ZWN0Q29sb3JTY2hlbWUnLFxuXHRERVRFQ1RfSEMgPSAnd2luZG93LmF1dG9EZXRlY3RIaWdoQ29udHJhc3QnLFxuXG5cdFNZU1RFTV9DT0xPUl9USEVNRSA9ICd3aW5kb3cuc3lzdGVtQ29sb3JUaGVtZSdcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUaGVtZVNldHRpbmdEZWZhdWx0cyB7XG5cdGV4cG9ydCBjb25zdCBDT0xPUl9USEVNRV9EQVJLID0gJ0RhcmsgMjAyNic7XG5cdGV4cG9ydCBjb25zdCBDT0xPUl9USEVNRV9MSUdIVCA9ICdMaWdodCAyMDI2Jztcblx0ZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0hDX0RBUksgPSAnRGVmYXVsdCBIaWdoIENvbnRyYXN0Jztcblx0ZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0hDX0xJR0hUID0gJ0RlZmF1bHQgSGlnaCBDb250cmFzdCBMaWdodCc7XG5cblx0ZXhwb3J0IGNvbnN0IEZJTEVfSUNPTl9USEVNRSA9ICd2cy1zZXRpJztcblx0ZXhwb3J0IGNvbnN0IFBST0RVQ1RfSUNPTl9USEVNRSA9ICdEZWZhdWx0Jztcbn1cblxuLyoqXG4gKiBNaWdyYXRlcyBsZWdhY3kgdGhlbWUgc2V0dGluZ3MgSURzIHRvIHRoZWlyIGN1cnJlbnQgZXF1aXZhbGVudHMuXG4gKiBUaGVtZSBJRHMgd2VyZSBzaW1wbGlmaWVkOiBcIkRlZmF1bHRcIiBwcmVmaXggd2FzIHJlbW92ZWQgZnJvbSBidWlsdC1pbiB0aGVtZXMsXG4gKiBhbmQgXCJFeHBlcmltZW50YWxcIiBwcmVmaXggd2FzIHJlcGxhY2VkIHdoZW4gVlMgQ29kZSB0aGVtZXMgYmVjYW1lIEdBLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZVRoZW1lU2V0dGluZ3NJZChzZXR0aW5nc0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHNldHRpbmdzSWQpIHtcblx0XHRjYXNlICdEZWZhdWx0IERhcmsgTW9kZXJuJzogcmV0dXJuICdEYXJrIE1vZGVybic7XG5cdFx0Y2FzZSAnRGVmYXVsdCBMaWdodCBNb2Rlcm4nOiByZXR1cm4gJ0xpZ2h0IE1vZGVybic7XG5cdFx0Y2FzZSAnRGVmYXVsdCBEYXJrKyc6IHJldHVybiAnRGFyaysnO1xuXHRcdGNhc2UgJ0RlZmF1bHQgTGlnaHQrJzogcmV0dXJuICdMaWdodCsnO1xuXHRcdGNhc2UgJ0V4cGVyaW1lbnRhbCBEYXJrJzpcblx0XHRjYXNlICdWUyBDb2RlIERhcmsnOlxuXHRcdFx0cmV0dXJuIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUks7XG5cdFx0Y2FzZSAnRXhwZXJpbWVudGFsIExpZ2h0Jzpcblx0XHRjYXNlICdWUyBDb2RlIExpZ2h0Jzpcblx0XHRcdHJldHVybiBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVDtcblx0fVxuXHRyZXR1cm4gc2V0dGluZ3NJZDtcbn1cblxuZXhwb3J0IGNvbnN0IENPTE9SX1RIRU1FX0RBUktfSU5JVElBTF9DT0xPUlMgPSB7XG5cdCdhY3Rpb25CYXIudG9nZ2xlZEJhY2tncm91bmQnOiAnIzM4M2E0OScsXG5cdCdhY3Rpdml0eUJhci5hY3RpdmVCb3JkZXInOiAnIzAwNzhENCcsXG5cdCdhY3Rpdml0eUJhci5iYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQnYWN0aXZpdHlCYXIuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQnYWN0aXZpdHlCYXIuZm9yZWdyb3VuZCc6ICcjRDdEN0Q3Jyxcblx0J2FjdGl2aXR5QmFyLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjODY4Njg2Jyxcblx0J2FjdGl2aXR5QmFyQmFkZ2UuYmFja2dyb3VuZCc6ICcjMDA3OEQ0Jyxcblx0J2FjdGl2aXR5QmFyQmFkZ2UuZm9yZWdyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2JhZGdlLmJhY2tncm91bmQnOiAnIzYxNjE2MScsXG5cdCdiYWRnZS5mb3JlZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnYnV0dG9uLmJhY2tncm91bmQnOiAnIzAwNzhENCcsXG5cdCdidXR0b24uYm9yZGVyJzogJyNGRkZGRkYxMicsXG5cdCdidXR0b24uZm9yZWdyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2J1dHRvbi5ob3ZlckJhY2tncm91bmQnOiAnIzAyNkVDMScsXG5cdCdidXR0b24uc2Vjb25kYXJ5QmFja2dyb3VuZCc6ICcjMzEzMTMxJyxcblx0J2J1dHRvbi5zZWNvbmRhcnlGb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnYnV0dG9uLnNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCc6ICcjM0MzQzNDJyxcblx0J2NoYXQuc2xhc2hDb21tYW5kQmFja2dyb3VuZCc6ICcjMjY0Nzc4NjYnLFxuXHQnY2hhdC5zbGFzaENvbW1hbmRGb3JlZ3JvdW5kJzogJyM4NUI2RkYnLFxuXHQnY2hhdC5lZGl0ZWRGaWxlRm9yZWdyb3VuZCc6ICcjRTJDMDhEJyxcblx0J2NoZWNrYm94LmJhY2tncm91bmQnOiAnIzMxMzEzMScsXG5cdCdjaGVja2JveC5ib3JkZXInOiAnIzNDM0MzQycsXG5cdCdkZWJ1Z1Rvb2xCYXIuYmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J2Rlc2NyaXB0aW9uRm9yZWdyb3VuZCc6ICcjOUQ5RDlEJyxcblx0J2Ryb3Bkb3duLmJhY2tncm91bmQnOiAnIzMxMzEzMScsXG5cdCdkcm9wZG93bi5ib3JkZXInOiAnIzNDM0MzQycsXG5cdCdkcm9wZG93bi5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnZHJvcGRvd24ubGlzdEJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCdlZGl0b3IuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J2VkaXRvci5maW5kTWF0Y2hCYWNrZ3JvdW5kJzogJyM5RTZBMDMnLFxuXHQnZWRpdG9yLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdlZGl0b3IuaW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyMzQTNENDEnLFxuXHQnZWRpdG9yLnNlbGVjdGlvbkhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0FERDZGRjI2Jyxcblx0J2VkaXRvckdyb3VwLmJvcmRlcic6ICcjRkZGRkZGMTcnLFxuXHQnZWRpdG9yR3JvdXBIZWFkZXIudGFic0JhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCdlZGl0b3JHcm91cEhlYWRlci50YWJzQm9yZGVyJzogJyMyQjJCMkInLFxuXHQnZWRpdG9yR3V0dGVyLmFkZGVkQmFja2dyb3VuZCc6ICcjMkVBMDQzJyxcblx0J2VkaXRvckd1dHRlci5kZWxldGVkQmFja2dyb3VuZCc6ICcjRjg1MTQ5Jyxcblx0J2VkaXRvckd1dHRlci5tb2RpZmllZEJhY2tncm91bmQnOiAnIzAwNzhENCcsXG5cdCdlZGl0b3JJbmRlbnRHdWlkZS5hY3RpdmVCYWNrZ3JvdW5kMSc6ICcjNzA3MDcwJyxcblx0J2VkaXRvckluZGVudEd1aWRlLmJhY2tncm91bmQxJzogJyM0MDQwNDAnLFxuXHQnZWRpdG9yTGluZU51bWJlci5hY3RpdmVGb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnZWRpdG9yTGluZU51bWJlci5mb3JlZ3JvdW5kJzogJyM2RTc2ODEnLFxuXHQnZWRpdG9yT3ZlcnZpZXdSdWxlci5ib3JkZXInOiAnIzAxMDQwOScsXG5cdCdlZGl0b3JXaWRnZXQuYmFja2dyb3VuZCc6ICcjMjAyMDIwJyxcblx0J2Vycm9yRm9yZWdyb3VuZCc6ICcjRjg1MTQ5Jyxcblx0J2ZvY3VzQm9yZGVyJzogJyMwMDc4RDQnLFxuXHQnZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J2ljb24uZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J2lucHV0LmJhY2tncm91bmQnOiAnIzMxMzEzMScsXG5cdCdpbnB1dC5ib3JkZXInOiAnIzNDM0MzQycsXG5cdCdpbnB1dC5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnaW5wdXQucGxhY2Vob2xkZXJGb3JlZ3JvdW5kJzogJyM5ODk4OTgnLFxuXHQnaW5wdXRPcHRpb24uYWN0aXZlQmFja2dyb3VuZCc6ICcjMjQ4OURCODInLFxuXHQnaW5wdXRPcHRpb24uYWN0aXZlQm9yZGVyJzogJyMyNDg4REInLFxuXHQna2V5YmluZGluZ0xhYmVsLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdsaXN0LmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kJzogJyNGRkYnLFxuXHQnbGlzdC5kcm9wQmFja2dyb3VuZCc6ICcjMzgzQjNEJyxcblx0J21lbnUuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J21lbnUuYm9yZGVyJzogJyM0NTQ1NDUnLFxuXHQnbWVudS5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnbWVudS5zZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyMwMDc4ZDQnLFxuXHQnbWVudS5zZXBhcmF0b3JCYWNrZ3JvdW5kJzogJyM0NTQ1NDUnLFxuXHQnbm90aWZpY2F0aW9uQ2VudGVySGVhZGVyLmJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCdub3RpZmljYXRpb25DZW50ZXJIZWFkZXIuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J25vdGlmaWNhdGlvbnMuYmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J25vdGlmaWNhdGlvbnMuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQnbm90aWZpY2F0aW9ucy5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQncGFuZWwuYmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J3BhbmVsLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3BhbmVsSW5wdXQuYm9yZGVyJzogJyMyQjJCMkInLFxuXHQncGFuZWxUaXRsZS5hY3RpdmVCb3JkZXInOiAnIzAwNzhENCcsXG5cdCdwYW5lbFRpdGxlLmFjdGl2ZUZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdwYW5lbFRpdGxlLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjOUQ5RDlEJyxcblx0J3BlZWtWaWV3RWRpdG9yLmJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCdwZWVrVmlld0VkaXRvci5tYXRjaEhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0JCODAwOTY2Jyxcblx0J3BlZWtWaWV3UmVzdWx0LmJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCdwZWVrVmlld1Jlc3VsdC5tYXRjaEhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0JCODAwOTY2Jyxcblx0J3BpY2tlckdyb3VwLmJvcmRlcic6ICcjM0MzQzNDJyxcblx0J3BvcnRzLmljb25SdW5uaW5nUHJvY2Vzc0ZvcmVncm91bmQnOiAnIzM2OTQzMicsXG5cdCdwcm9ncmVzc0Jhci5iYWNrZ3JvdW5kJzogJyMwMDc4RDQnLFxuXHQncXVpY2tJbnB1dC5iYWNrZ3JvdW5kJzogJyMyMjIyMjInLFxuXHQncXVpY2tJbnB1dC5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnc2V0dGluZ3MuZHJvcGRvd25CYWNrZ3JvdW5kJzogJyMzMTMxMzEnLFxuXHQnc2V0dGluZ3MuZHJvcGRvd25Cb3JkZXInOiAnIzNDM0MzQycsXG5cdCdzZXR0aW5ncy5oZWFkZXJGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnc2V0dGluZ3MubW9kaWZpZWRJdGVtSW5kaWNhdG9yJzogJyNCQjgwMDk2NicsXG5cdCdzaWRlQmFyLmJhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCdzaWRlQmFyLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3NpZGVCYXIuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3NpZGVCYXJTZWN0aW9uSGVhZGVyLmJhY2tncm91bmQnOiAnIzE4MTgxOCcsXG5cdCdzaWRlQmFyU2VjdGlvbkhlYWRlci5ib3JkZXInOiAnIzJCMkIyQicsXG5cdCdzaWRlQmFyU2VjdGlvbkhlYWRlci5mb3JlZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnc2lkZUJhclRpdGxlLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6ICcjMTgxODE4Jyxcblx0J3N0YXR1c0Jhci5ib3JkZXInOiAnIzJCMkIyQicsXG5cdCdzdGF0dXNCYXIuZGVidWdnaW5nQmFja2dyb3VuZCc6ICcjMDA3OEQ0Jyxcblx0J3N0YXR1c0Jhci5kZWJ1Z2dpbmdGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnc3RhdHVzQmFyLmZvY3VzQm9yZGVyJzogJyMwMDc4RDQnLFxuXHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiAnI0NDQ0NDQycsXG5cdCdzdGF0dXNCYXIubm9Gb2xkZXJCYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQnc3RhdHVzQmFySXRlbS5mb2N1c0JvcmRlcic6ICcjMDA3OEQ0Jyxcblx0J3N0YXR1c0Jhckl0ZW0ucHJvbWluZW50QmFja2dyb3VuZCc6ICcjNkU3NjgxNjYnLFxuXHQnc3RhdHVzQmFySXRlbS5yZW1vdGVCYWNrZ3JvdW5kJzogJyMwMDc4RDQnLFxuXHQnc3RhdHVzQmFySXRlbS5yZW1vdGVGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLmFjdGl2ZUJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCd0YWIuYWN0aXZlQm9yZGVyJzogJyMxRjFGMUYnLFxuXHQndGFiLmFjdGl2ZUJvcmRlclRvcCc6ICcjMDA3OEQ0Jyxcblx0J3RhYi5hY3RpdmVGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3RhYi5ob3ZlckJhY2tncm91bmQnOiAnIzFGMUYxRicsXG5cdCd0YWIuaW5hY3RpdmVCYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQndGFiLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjOUQ5RDlEJyxcblx0J3RhYi5sYXN0UGlubmVkQm9yZGVyJzogJyNjY2MzJyxcblx0J3RhYi5zZWxlY3RlZEJhY2tncm91bmQnOiAnIzM3MzczRCcsXG5cdCd0YWIuc2VsZWN0ZWRCb3JkZXJUb3AnOiAnIzZjYWRkZicsXG5cdCd0YWIuc2VsZWN0ZWRGb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLnVuZm9jdXNlZEFjdGl2ZUJvcmRlcic6ICcjMUYxRjFGJyxcblx0J3RhYi51bmZvY3VzZWRBY3RpdmVCb3JkZXJUb3AnOiAnIzJCMkIyQicsXG5cdCd0YWIudW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQndGVybWluYWwuZm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3Rlcm1pbmFsLmluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCc6ICcjM0EzRDQxJyxcblx0J3Rlcm1pbmFsLnRhYi5hY3RpdmVCb3JkZXInOiAnIzAwNzhENCcsXG5cdCd0ZXh0QmxvY2tRdW90ZS5iYWNrZ3JvdW5kJzogJyMyQjJCMkInLFxuXHQndGV4dEJsb2NrUXVvdGUuYm9yZGVyJzogJyM2MTYxNjEnLFxuXHQndGV4dENvZGVCbG9jay5iYWNrZ3JvdW5kJzogJyMyQjJCMkInLFxuXHQndGV4dExpbmsuYWN0aXZlRm9yZWdyb3VuZCc6ICcjNGRhYWZjJyxcblx0J3RleHRMaW5rLmZvcmVncm91bmQnOiAnIzRkYWFmYycsXG5cdCd0ZXh0UHJlZm9ybWF0LmJhY2tncm91bmQnOiAnIzNDM0MzQycsXG5cdCd0ZXh0UHJlZm9ybWF0LmZvcmVncm91bmQnOiAnI0QwRDBEMCcsXG5cdCd0ZXh0U2VwYXJhdG9yLmZvcmVncm91bmQnOiAnIzIxMjYyRCcsXG5cdCd0aXRsZUJhci5hY3RpdmVCYWNrZ3JvdW5kJzogJyMxODE4MTgnLFxuXHQndGl0bGVCYXIuYWN0aXZlRm9yZWdyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3RpdGxlQmFyLmJvcmRlcic6ICcjMkIyQjJCJyxcblx0J3RpdGxlQmFyLmluYWN0aXZlQmFja2dyb3VuZCc6ICcjMUYxRjFGJyxcblx0J3RpdGxlQmFyLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjOUQ5RDlEJyxcblx0J3dlbGNvbWVQYWdlLnByb2dyZXNzLmZvcmVncm91bmQnOiAnIzAwNzhENCcsXG5cdCd3ZWxjb21lUGFnZS50aWxlQmFja2dyb3VuZCc6ICcjMkIyQjJCJyxcblx0J3dpZGdldC5ib3JkZXInOiAnIzMxMzEzMSdcbn07XG5cbmV4cG9ydCBjb25zdCBDT0xPUl9USEVNRV9MSUdIVF9JTklUSUFMX0NPTE9SUyA9IHtcblx0J2FjdGlvbkJhci50b2dnbGVkQmFja2dyb3VuZCc6ICcjZGRkZGRkJyxcblx0J2FjdGl2aXR5QmFyLmFjdGl2ZUJvcmRlcic6ICcjMDA1RkI4Jyxcblx0J2FjdGl2aXR5QmFyLmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdhY3Rpdml0eUJhci5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdhY3Rpdml0eUJhci5mb3JlZ3JvdW5kJzogJyMxRjFGMUYnLFxuXHQnYWN0aXZpdHlCYXIuaW5hY3RpdmVGb3JlZ3JvdW5kJzogJyM2MTYxNjEnLFxuXHQnYWN0aXZpdHlCYXJCYWRnZS5iYWNrZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQnYWN0aXZpdHlCYXJCYWRnZS5mb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnYmFkZ2UuYmFja2dyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J2JhZGdlLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdidXR0b24uYmFja2dyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J2J1dHRvbi5ib3JkZXInOiAnIzAwMDAwMDFhJyxcblx0J2J1dHRvbi5mb3JlZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnYnV0dG9uLmhvdmVyQmFja2dyb3VuZCc6ICcjMDI1OEE4Jyxcblx0J2J1dHRvbi5zZWNvbmRhcnlCYWNrZ3JvdW5kJzogJyNFNUU1RTUnLFxuXHQnYnV0dG9uLnNlY29uZGFyeUZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdidXR0b24uc2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kJzogJyNDQ0NDQ0MnLFxuXHQnY2hhdC5zbGFzaENvbW1hbmRCYWNrZ3JvdW5kJzogJyNBRENFRkY3QScsXG5cdCdjaGF0LnNsYXNoQ29tbWFuZEZvcmVncm91bmQnOiAnIzI2NTY5RScsXG5cdCdjaGF0LmVkaXRlZEZpbGVGb3JlZ3JvdW5kJzogJyM4OTU1MDMnLFxuXHQnY2hlY2tib3guYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J2NoZWNrYm94LmJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J2Rlc2NyaXB0aW9uRm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J2RpZmZFZGl0b3IudW5jaGFuZ2VkUmVnaW9uQmFja2dyb3VuZCc6ICcjZjhmOGY4Jyxcblx0J2Ryb3Bkb3duLmJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdkcm9wZG93bi5ib3JkZXInOiAnI0NFQ0VDRScsXG5cdCdkcm9wZG93bi5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnZHJvcGRvd24ubGlzdEJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdlZGl0b3IuYmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2VkaXRvci5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnZWRpdG9yLmluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCc6ICcjRTVFQkYxJyxcblx0J2VkaXRvci5zZWxlY3Rpb25IaWdobGlnaHRCYWNrZ3JvdW5kJzogJyNBREQ2RkY4MCcsXG5cdCdlZGl0b3JHcm91cC5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdlZGl0b3JHcm91cEhlYWRlci50YWJzQmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J2VkaXRvckdyb3VwSGVhZGVyLnRhYnNCb3JkZXInOiAnI0U1RTVFNScsXG5cdCdlZGl0b3JHdXR0ZXIuYWRkZWRCYWNrZ3JvdW5kJzogJyMyRUEwNDMnLFxuXHQnZWRpdG9yR3V0dGVyLmRlbGV0ZWRCYWNrZ3JvdW5kJzogJyNGODUxNDknLFxuXHQnZWRpdG9yR3V0dGVyLm1vZGlmaWVkQmFja2dyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J2VkaXRvckluZGVudEd1aWRlLmFjdGl2ZUJhY2tncm91bmQxJzogJyM5MzkzOTMnLFxuXHQnZWRpdG9ySW5kZW50R3VpZGUuYmFja2dyb3VuZDEnOiAnI0QzRDNEMycsXG5cdCdlZGl0b3JMaW5lTnVtYmVyLmFjdGl2ZUZvcmVncm91bmQnOiAnIzE3MTE4NCcsXG5cdCdlZGl0b3JMaW5lTnVtYmVyLmZvcmVncm91bmQnOiAnIzZFNzY4MScsXG5cdCdlZGl0b3JPdmVydmlld1J1bGVyLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J2VkaXRvclN1Z2dlc3RXaWRnZXQuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J2VkaXRvcldpZGdldC5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnZXJyb3JGb3JlZ3JvdW5kJzogJyNGODUxNDknLFxuXHQnZm9jdXNCb3JkZXInOiAnIzAwNUZCOCcsXG5cdCdmb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnaWNvbi5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnaW5wdXQuYmFja2dyb3VuZCc6ICcjRkZGRkZGJyxcblx0J2lucHV0LmJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J2lucHV0LmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdpbnB1dC5wbGFjZWhvbGRlckZvcmVncm91bmQnOiAnIzc2NzY3NicsXG5cdCdpbnB1dE9wdGlvbi5hY3RpdmVCYWNrZ3JvdW5kJzogJyNCRUQ2RUQnLFxuXHQnaW5wdXRPcHRpb24uYWN0aXZlQm9yZGVyJzogJyMwMDVGQjgnLFxuXHQnaW5wdXRPcHRpb24uYWN0aXZlRm9yZWdyb3VuZCc6ICcjMDAwMDAwJyxcblx0J2tleWJpbmRpbmdMYWJlbC5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnbGlzdC5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kJzogJyNFOEU4RTgnLFxuXHQnbGlzdC5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kJzogJyMwMDAwMDAnLFxuXHQnbGlzdC5hY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZCc6ICcjMDAwMDAwJyxcblx0J2xpc3QuZm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lJzogJyMwMDVGQjgnLFxuXHQnbGlzdC5ob3ZlckJhY2tncm91bmQnOiAnI0YyRjJGMicsXG5cdCdtZW51LmJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J21lbnUuc2VsZWN0aW9uQmFja2dyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J21lbnUuc2VsZWN0aW9uRm9yZWdyb3VuZCc6ICcjZmZmZmZmJyxcblx0J25vdGVib29rLmNlbGxCb3JkZXJDb2xvcic6ICcjRTVFNUU1Jyxcblx0J25vdGVib29rLnNlbGVjdGVkQ2VsbEJhY2tncm91bmQnOiAnI0M4RERGMTUwJyxcblx0J25vdGlmaWNhdGlvbkNlbnRlckhlYWRlci5iYWNrZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQnbm90aWZpY2F0aW9uQ2VudGVySGVhZGVyLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdub3RpZmljYXRpb25zLmJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdub3RpZmljYXRpb25zLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J25vdGlmaWNhdGlvbnMuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3BhbmVsLmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdwYW5lbC5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdwYW5lbElucHV0LmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3BhbmVsVGl0bGUuYWN0aXZlQm9yZGVyJzogJyMwMDVGQjgnLFxuXHQncGFuZWxUaXRsZS5hY3RpdmVGb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQncGFuZWxUaXRsZS5pbmFjdGl2ZUZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdwZWVrVmlld0VkaXRvci5tYXRjaEhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0JCODAwOTY2Jyxcblx0J3BlZWtWaWV3UmVzdWx0LmJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdwZWVrVmlld1Jlc3VsdC5tYXRjaEhpZ2hsaWdodEJhY2tncm91bmQnOiAnI0JCODAwOTY2Jyxcblx0J3BpY2tlckdyb3VwLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3BpY2tlckdyb3VwLmZvcmVncm91bmQnOiAnIzhCOTQ5RScsXG5cdCdwb3J0cy5pY29uUnVubmluZ1Byb2Nlc3NGb3JlZ3JvdW5kJzogJyMzNjk0MzInLFxuXHQncHJvZ3Jlc3NCYXIuYmFja2dyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J3F1aWNrSW5wdXQuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3F1aWNrSW5wdXQuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3NlYXJjaEVkaXRvci50ZXh0SW5wdXRCb3JkZXInOiAnI0NFQ0VDRScsXG5cdCdzZXR0aW5ncy5kcm9wZG93bkJhY2tncm91bmQnOiAnI0ZGRkZGRicsXG5cdCdzZXR0aW5ncy5kcm9wZG93bkJvcmRlcic6ICcjQ0VDRUNFJyxcblx0J3NldHRpbmdzLmhlYWRlckZvcmVncm91bmQnOiAnIzFGMUYxRicsXG5cdCdzZXR0aW5ncy5tb2RpZmllZEl0ZW1JbmRpY2F0b3InOiAnI0JCODAwOTY2Jyxcblx0J3NldHRpbmdzLm51bWJlcklucHV0Qm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnc2V0dGluZ3MudGV4dElucHV0Qm9yZGVyJzogJyNDRUNFQ0UnLFxuXHQnc2lkZUJhci5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnc2lkZUJhci5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCdzaWRlQmFyLmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCdzaWRlQmFyU2VjdGlvbkhlYWRlci5iYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQnc2lkZUJhclNlY3Rpb25IZWFkZXIuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQnc2lkZUJhclNlY3Rpb25IZWFkZXIuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3NpZGVCYXJUaXRsZS5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnc3RhdHVzQmFyLmJhY2tncm91bmQnOiAnI0Y4RjhGOCcsXG5cdCdzdGF0dXNCYXIuYm9yZGVyJzogJyNFNUU1RTUnLFxuXHQnc3RhdHVzQmFyLmRlYnVnZ2luZ0JhY2tncm91bmQnOiAnI0ZENzE2QycsXG5cdCdzdGF0dXNCYXIuZGVidWdnaW5nRm9yZWdyb3VuZCc6ICcjMDAwMDAwJyxcblx0J3N0YXR1c0Jhci5mb2N1c0JvcmRlcic6ICcjMDA1RkI4Jyxcblx0J3N0YXR1c0Jhci5mb3JlZ3JvdW5kJzogJyMzQjNCM0InLFxuXHQnc3RhdHVzQmFyLm5vRm9sZGVyQmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3N0YXR1c0Jhckl0ZW0uY29tcGFjdEhvdmVyQmFja2dyb3VuZCc6ICcjQ0NDQ0NDJyxcblx0J3N0YXR1c0Jhckl0ZW0uZXJyb3JCYWNrZ3JvdW5kJzogJyNDNzJFMEYnLFxuXHQnc3RhdHVzQmFySXRlbS5mb2N1c0JvcmRlcic6ICcjMDA1RkI4Jyxcblx0J3N0YXR1c0Jhckl0ZW0uaG92ZXJCYWNrZ3JvdW5kJzogJyNCOEI4Qjg1MCcsXG5cdCdzdGF0dXNCYXJJdGVtLnByb21pbmVudEJhY2tncm91bmQnOiAnIzZFNzY4MTY2Jyxcblx0J3N0YXR1c0Jhckl0ZW0ucmVtb3RlQmFja2dyb3VuZCc6ICcjMDA1RkI4Jyxcblx0J3N0YXR1c0Jhckl0ZW0ucmVtb3RlRm9yZWdyb3VuZCc6ICcjRkZGRkZGJyxcblx0J3RhYi5hY3RpdmVCYWNrZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLmFjdGl2ZUJvcmRlcic6ICcjRjhGOEY4Jyxcblx0J3RhYi5hY3RpdmVCb3JkZXJUb3AnOiAnIzAwNUZCOCcsXG5cdCd0YWIuYWN0aXZlRm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3RhYi5ib3JkZXInOiAnI0U1RTVFNScsXG5cdCd0YWIuaG92ZXJCYWNrZ3JvdW5kJzogJyNGRkZGRkYnLFxuXHQndGFiLmluYWN0aXZlQmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3RhYi5pbmFjdGl2ZUZvcmVncm91bmQnOiAnIzg2ODY4NicsXG5cdCd0YWIubGFzdFBpbm5lZEJvcmRlcic6ICcjRDRENEQ0Jyxcblx0J3RhYi5zZWxlY3RlZEJhY2tncm91bmQnOiAnI0U0RTZGMScsXG5cdCd0YWIuc2VsZWN0ZWRCb3JkZXJUb3AnOiAnIzY4YTNkYScsXG5cdCd0YWIuc2VsZWN0ZWRGb3JlZ3JvdW5kJzogJyMzMzMzMzMnLFxuXHQndGFiLnVuZm9jdXNlZEFjdGl2ZUJvcmRlcic6ICcjRjhGOEY4Jyxcblx0J3RhYi51bmZvY3VzZWRBY3RpdmVCb3JkZXJUb3AnOiAnI0U1RTVFNScsXG5cdCd0YWIudW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGVybWluYWwuZm9yZWdyb3VuZCc6ICcjM0IzQjNCJyxcblx0J3Rlcm1pbmFsLmluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCc6ICcjRTVFQkYxJyxcblx0J3Rlcm1pbmFsLnRhYi5hY3RpdmVCb3JkZXInOiAnIzAwNUZCOCcsXG5cdCd0ZXJtaW5hbEN1cnNvci5mb3JlZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQndGV4dEJsb2NrUXVvdGUuYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3RleHRCbG9ja1F1b3RlLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3RleHRDb2RlQmxvY2suYmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3RleHRMaW5rLmFjdGl2ZUZvcmVncm91bmQnOiAnIzAwNUZCOCcsXG5cdCd0ZXh0TGluay5mb3JlZ3JvdW5kJzogJyMwMDVGQjgnLFxuXHQndGV4dFByZWZvcm1hdC5iYWNrZ3JvdW5kJzogJyMwMDAwMDAxRicsXG5cdCd0ZXh0UHJlZm9ybWF0LmZvcmVncm91bmQnOiAnIzNCM0IzQicsXG5cdCd0ZXh0U2VwYXJhdG9yLmZvcmVncm91bmQnOiAnIzIxMjYyRCcsXG5cdCd0aXRsZUJhci5hY3RpdmVCYWNrZ3JvdW5kJzogJyNGOEY4RjgnLFxuXHQndGl0bGVCYXIuYWN0aXZlRm9yZWdyb3VuZCc6ICcjMUUxRTFFJyxcblx0J3RpdGxlQmFyLmJvcmRlcic6ICcjRTVFNUU1Jyxcblx0J3RpdGxlQmFyLmluYWN0aXZlQmFja2dyb3VuZCc6ICcjRjhGOEY4Jyxcblx0J3RpdGxlQmFyLmluYWN0aXZlRm9yZWdyb3VuZCc6ICcjOEI5NDlFJyxcblx0J3dlbGNvbWVQYWdlLnRpbGVCYWNrZ3JvdW5kJzogJyNGM0YzRjMnLFxuXHQnd2lkZ2V0LmJvcmRlcic6ICcjRTVFNUU1J1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoVGhlbWUge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25EYXRhPzogRXh0ZW5zaW9uRGF0YTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNldHRpbmdzSWQ6IHN0cmluZyB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaENvbG9yVGhlbWUgZXh0ZW5kcyBJV29ya2JlbmNoVGhlbWUsIElDb2xvclRoZW1lIHtcblx0cmVhZG9ubHkgc2V0dGluZ3NJZDogc3RyaW5nO1xuXHRyZWFkb25seSB0b2tlbkNvbG9yczogSVRleHRNYXRlVGhlbWluZ1J1bGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29sb3JNYXAge1xuXHRbaWQ6IHN0cmluZ106IENvbG9yO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hGaWxlSWNvblRoZW1lIGV4dGVuZHMgSVdvcmtiZW5jaFRoZW1lLCBJRmlsZUljb25UaGVtZSB7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUgZXh0ZW5kcyBJV29ya2JlbmNoVGhlbWUsIElQcm9kdWN0SWNvblRoZW1lIHtcblx0cmVhZG9ubHkgc2V0dGluZ3NJZDogc3RyaW5nO1xuXG5cdGdldEljb24oaWNvbjogSWNvbkNvbnRyaWJ1dGlvbik6IEljb25EZWZpbml0aW9uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgdHlwZSBUaGVtZVNldHRpbmdUYXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHwgJ2F1dG8nIHwgJ3ByZXZpZXcnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaFRoZW1lU2VydmljZSBleHRlbmRzIElUaGVtZVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHNldENvbG9yVGhlbWUodGhlbWVJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaENvbG9yVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hDb2xvclRoZW1lIHwgbnVsbD47XG5cdGdldENvbG9yVGhlbWUoKTogSVdvcmtiZW5jaENvbG9yVGhlbWU7XG5cdGdldENvbG9yVGhlbWVzKCk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWVbXT47XG5cdGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZVtdPjtcblx0cmVhZG9ubHkgb25EaWRDb2xvclRoZW1lQ2hhbmdlOiBFdmVudDxJV29ya2JlbmNoQ29sb3JUaGVtZT47XG5cblx0Z2V0UHJlZmVycmVkQ29sb3JTY2hlbWUoKTogQ29sb3JTY2hlbWUgfCB1bmRlZmluZWQ7XG5cblx0c2V0RmlsZUljb25UaGVtZShpY29uVGhlbWVJZDogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPjtcblx0Z2V0RmlsZUljb25UaGVtZSgpOiBJV29ya2JlbmNoRmlsZUljb25UaGVtZTtcblx0Z2V0RmlsZUljb25UaGVtZXMoKTogUHJvbWlzZTxJV29ya2JlbmNoRmlsZUljb25UaGVtZVtdPjtcblx0Z2V0TWFya2V0cGxhY2VGaWxlSWNvblRoZW1lcyhwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpOiBQcm9taXNlPElXb3JrYmVuY2hGaWxlSWNvblRoZW1lW10+O1xuXHRyZWFkb25seSBvbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2U6IEV2ZW50PElXb3JrYmVuY2hGaWxlSWNvblRoZW1lPjtcblxuXHRzZXRQcm9kdWN0SWNvblRoZW1lKGljb25UaGVtZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCk6IFByb21pc2U8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWU+O1xuXHRnZXRQcm9kdWN0SWNvblRoZW1lKCk6IElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lO1xuXHRnZXRQcm9kdWN0SWNvblRoZW1lcygpOiBQcm9taXNlPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lW10+O1xuXHRnZXRNYXJrZXRwbGFjZVByb2R1Y3RJY29uVGhlbWVzKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IFByb21pc2U8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWVbXT47XG5cdHJlYWRvbmx5IG9uRGlkUHJvZHVjdEljb25UaGVtZUNoYW5nZTogRXZlbnQ8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWU+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUaGVtZVNjb3BlZENvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbY29sb3JJZDogc3RyaW5nXTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2xvckN1c3RvbWl6YXRpb25zIHtcblx0W2NvbG9ySWRPclRoZW1lU2NvcGU6IHN0cmluZ106IElUaGVtZVNjb3BlZENvbG9yQ3VzdG9taXphdGlvbnMgfCBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lU2NvcGVkVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHtcblx0W2dyb3VwSWQ6IHN0cmluZ106IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nIHwgYm9vbGVhbiB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y29tbWVudHM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHRzdHJpbmdzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0bnVtYmVycz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdGtleXdvcmRzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0dHlwZXM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHRmdW5jdGlvbnM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHR2YXJpYWJsZXM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHR0ZXh0TWF0ZVJ1bGVzPzogSVRleHRNYXRlVGhlbWluZ1J1bGVbXTtcblx0c2VtYW50aWNIaWdobGlnaHRpbmc/OiBib29sZWFuOyAvLyBkZXByZWNhdGVkLCB1c2UgSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zLmVuYWJsZWQgaW5zdGVhZFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbZ3JvdXBJZE9yVGhlbWVTY29wZTogc3RyaW5nXTogSVRoZW1lU2NvcGVkVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHwgSVRleHRNYXRlVGhlbWluZ1J1bGVbXSB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmcgfCBib29sZWFuIHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb21tZW50cz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHN0cmluZ3M/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHRudW1iZXJzPzogc3RyaW5nIHwgSVRva2VuQ29sb3JpemF0aW9uU2V0dGluZztcblx0a2V5d29yZHM/OiBzdHJpbmcgfCBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xuXHR0eXBlcz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdGZ1bmN0aW9ucz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHZhcmlhYmxlcz86IHN0cmluZyB8IElUb2tlbkNvbG9yaXphdGlvblNldHRpbmc7XG5cdHRleHRNYXRlUnVsZXM/OiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdO1xuXHRzZW1hbnRpY0hpZ2hsaWdodGluZz86IGJvb2xlYW47IC8vIGRlcHJlY2F0ZWQsIHVzZSBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMuZW5hYmxlZCBpbnN0ZWFkXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lU2NvcGVkU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbc3R5bGVSdWxlOiBzdHJpbmddOiBJU2VtYW50aWNUb2tlblJ1bGVzIHwgYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdHJ1bGVzPzogSVNlbWFudGljVG9rZW5SdWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMge1xuXHRbc3R5bGVSdWxlT3JUaGVtZVNjb3BlOiBzdHJpbmddOiBJVGhlbWVTY29wZWRTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucyB8IElTZW1hbnRpY1Rva2VuUnVsZXMgfCBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblx0cnVsZXM/OiBJU2VtYW50aWNUb2tlblJ1bGVzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUaGVtZVNjb3BlZEV4cGVyaW1lbnRhbFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHtcblx0W3RoZW1lU2NvcGU6IHN0cmluZ106IElTZW1hbnRpY1Rva2VuUnVsZXMgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4cGVyaW1lbnRhbFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHtcblx0W3N0eWxlUnVsZU9yVGhlbWVTY29wZTogc3RyaW5nXTogSVRoZW1lU2NvcGVkRXhwZXJpbWVudGFsU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMgfCBJU2VtYW50aWNUb2tlblJ1bGVzIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgdHlwZSBJVGhlbWVTY29wZWRDdXN0b21pemF0aW9ucyA9XG5cdElUaGVtZVNjb3BlZENvbG9yQ3VzdG9taXphdGlvbnNcblx0fCBJVGhlbWVTY29wZWRUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnNcblx0fCBJVGhlbWVTY29wZWRFeHBlcmltZW50YWxTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9uc1xuXHR8IElUaGVtZVNjb3BlZFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zO1xuXG5leHBvcnQgdHlwZSBJVGhlbWVTY29wYWJsZUN1c3RvbWl6YXRpb25zID1cblx0SUNvbG9yQ3VzdG9taXphdGlvbnNcblx0fCBJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zXG5cdHwgSUV4cGVyaW1lbnRhbFNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zXG5cdHwgSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZW1hbnRpY1Rva2VuUnVsZXMge1xuXHRbc2VsZWN0b3I6IHN0cmluZ106IHN0cmluZyB8IElTZW1hbnRpY1Rva2VuQ29sb3JpemF0aW9uU2V0dGluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dE1hdGVUaGVtaW5nUnVsZSB7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdHNjb3BlPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdHNldHRpbmdzOiBJVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUb2tlbkNvbG9yaXphdGlvblNldHRpbmcge1xuXHRmb3JlZ3JvdW5kPzogc3RyaW5nO1xuXHRiYWNrZ3JvdW5kPzogc3RyaW5nO1xuXHRmb250U3R5bGU/OiBzdHJpbmc7IC8qIFtpdGFsaWN8Ym9sZHx1bmRlcmxpbmV8c3RyaWtldGhyb3VnaF0gKi9cblx0Zm9udEZhbWlseT86IHN0cmluZztcblx0Zm9udFNpemU/OiBudW1iZXI7XG5cdGxpbmVIZWlnaHQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nIHtcblx0Zm9yZWdyb3VuZD86IHN0cmluZztcblx0Zm9udFN0eWxlPzogc3RyaW5nOyAvKiBbaXRhbGljfGJvbGR8dW5kZXJsaW5lfHN0cmlrZXRocm91Z2hdICovXG5cdGJvbGQ/OiBib29sZWFuO1xuXHR1bmRlcmxpbmU/OiBib29sZWFuO1xuXHRzdHJpa2V0aHJvdWdoPzogYm9vbGVhbjtcblx0aXRhbGljPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBFeHRlbnNpb25EYXRhIHtcblx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0ZXh0ZW5zaW9uUHVibGlzaGVyOiBzdHJpbmc7XG5cdGV4dGVuc2lvbk5hbWU6IHN0cmluZztcblx0ZXh0ZW5zaW9uSXNCdWlsdGluOiBib29sZWFuO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIEV4dGVuc2lvbkRhdGEge1xuXHRleHBvcnQgZnVuY3Rpb24gdG9KU09OT2JqZWN0KGQ6IEV4dGVuc2lvbkRhdGEgfCB1bmRlZmluZWQpOiBhbnkge1xuXHRcdHJldHVybiBkICYmIHsgX2V4dGVuc2lvbklkOiBkLmV4dGVuc2lvbklkLCBfZXh0ZW5zaW9uSXNCdWlsdGluOiBkLmV4dGVuc2lvbklzQnVpbHRpbiwgX2V4dGVuc2lvbk5hbWU6IGQuZXh0ZW5zaW9uTmFtZSwgX2V4dGVuc2lvblB1Ymxpc2hlcjogZC5leHRlbnNpb25QdWJsaXNoZXIgfTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbUpTT05PYmplY3QobzogYW55KTogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG8gJiYgaXNTdHJpbmcoby5fZXh0ZW5zaW9uSWQpICYmIGlzQm9vbGVhbihvLl9leHRlbnNpb25Jc0J1aWx0aW4pICYmIGlzU3RyaW5nKG8uX2V4dGVuc2lvbk5hbWUpICYmIGlzU3RyaW5nKG8uX2V4dGVuc2lvblB1Ymxpc2hlcikpIHtcblx0XHRcdHJldHVybiB7IGV4dGVuc2lvbklkOiBvLl9leHRlbnNpb25JZCwgZXh0ZW5zaW9uSXNCdWlsdGluOiBvLl9leHRlbnNpb25Jc0J1aWx0aW4sIGV4dGVuc2lvbk5hbWU6IG8uX2V4dGVuc2lvbk5hbWUsIGV4dGVuc2lvblB1Ymxpc2hlcjogby5fZXh0ZW5zaW9uUHVibGlzaGVyIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21OYW1lKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGlzQnVpbHRpbiA9IGZhbHNlKTogRXh0ZW5zaW9uRGF0YSB7XG5cdFx0cmV0dXJuIHsgZXh0ZW5zaW9uUHVibGlzaGVyOiBwdWJsaXNoZXIsIGV4dGVuc2lvbklkOiBgJHtwdWJsaXNoZXJ9LiR7bmFtZX1gLCBleHRlbnNpb25OYW1lOiBuYW1lLCBleHRlbnNpb25Jc0J1aWx0aW46IGlzQnVpbHRpbiB9O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lRXh0ZW5zaW9uUG9pbnQge1xuXHRpZDogc3RyaW5nO1xuXHRsYWJlbD86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHBhdGg6IHN0cmluZztcblx0dWlUaGVtZT86IFRoZW1lVHlwZVNlbGVjdG9yO1xuXHRfd2F0Y2g6IGJvb2xlYW47IC8vIHVuc3VwcG9ydGVkIG9wdGlvbnMgdG8gd2F0Y2ggbG9jYXRpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsOEJBQThCO0FBR3ZDLFNBQXNCLHFCQUF3RDtBQUU5RSxTQUFTLFdBQVcsZ0JBQWdCO0FBSTdCLE1BQU0seUJBQXlCLHVCQUE4RCxhQUFhO0FBRTFHLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sdUJBQXVCO0FBRTdCLE1BQU0sa0JBQWtCO0FBRXhCLElBQUssZ0JBQUwsa0JBQUtBLG1CQUFMO0FBQ04sRUFBQUEsZUFBQSxpQkFBYztBQUNkLEVBQUFBLGVBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLGVBQUEsd0JBQXFCO0FBQ3JCLEVBQUFBLGVBQUEsMEJBQXVCO0FBQ3ZCLEVBQUFBLGVBQUEsZ0NBQTZCO0FBQzdCLEVBQUFBLGVBQUEseUNBQXNDO0FBRXRDLEVBQUFBLGVBQUEsMEJBQXVCO0FBQ3ZCLEVBQUFBLGVBQUEsMkJBQXdCO0FBQ3hCLEVBQUFBLGVBQUEsNkJBQTBCO0FBQzFCLEVBQUFBLGVBQUEsOEJBQTJCO0FBQzNCLEVBQUFBLGVBQUEseUJBQXNCO0FBQ3RCLEVBQUFBLGVBQUEsZUFBWTtBQUVaLEVBQUFBLGVBQUEsd0JBQXFCO0FB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
