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
import { localize, localize2 } from "../../../../nls.js";
import { KeyMod, KeyChord, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuRegistry, MenuId, Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { equalsIgnoreCase } from "../../../../base/common/strings.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IWorkbenchThemeService, ThemeSettings, ThemeSettingDefaults } from "../../../services/themes/common/workbenchThemeService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { Extensions as ColorRegistryExtensions } from "../../../../platform/theme/common/colorRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Color } from "../../../../base/common/color.js";
import { ColorScheme, isHighContrast } from "../../../../platform/theme/common/theme.js";
import { colorThemeSchemaId } from "../../../services/themes/common/colorThemeSchema.js";
import { isCancellationError, onUnexpectedError } from "../../../../base/common/errors.js";
import { IQuickInputService, QuickInputButtonLocation } from "../../../../platform/quickinput/common/quickInput.js";
import { DEFAULT_PRODUCT_ICON_THEME_ID, ProductIconThemeData } from "../../../services/themes/browser/productIconThemeData.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { FileIconThemeData } from "../../../services/themes/browser/fileIconThemeData.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
const manageExtensionIcon = registerIcon("theme-selection-manage-extension", Codicon.gear, localize("manageExtensionIcon", "Icon for the 'Manage' action in the theme selection quick pick."));
var ConfigureItem = /* @__PURE__ */ ((ConfigureItem2) => {
  ConfigureItem2["BROWSE_GALLERY"] = "marketplace";
  ConfigureItem2["EXTENSIONS_VIEW"] = "extensions";
  ConfigureItem2["CUSTOM_TOP_ENTRY"] = "customTopEntry";
  return ConfigureItem2;
})(ConfigureItem || {});
let MarketplaceThemesPicker = class {
  constructor(getMarketplaceColorThemes, marketplaceQuery, extensionGalleryService, extensionManagementService, quickInputService, logService, progressService, extensionsWorkbenchService, dialogService, environmentService) {
    this.getMarketplaceColorThemes = getMarketplaceColorThemes;
    this.marketplaceQuery = marketplaceQuery;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionManagementService = extensionManagementService;
    this.quickInputService = quickInputService;
    this.logService = logService;
    this.progressService = progressService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.environmentService = environmentService;
    this._marketplaceExtensions = /* @__PURE__ */ new Set();
    this._marketplaceThemes = [];
    this._searchOngoing = false;
    this._searchError = void 0;
    this._onDidChange = new Emitter();
    this._queryDelayer = new ThrottledDelayer(200);
    this._installedExtensions = extensionManagementService.getInstalled().then((installed) => {
      const result = /* @__PURE__ */ new Set();
      for (const ext of installed) {
        result.add(ext.identifier.id);
      }
      return result;
    });
  }
  get themes() {
    return this._marketplaceThemes;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  trigger(value) {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource = void 0;
    }
    this._queryDelayer.trigger(() => {
      this._tokenSource = new CancellationTokenSource();
      return this.doSearch(value, this._tokenSource.token);
    });
  }
  async doSearch(value, token) {
    this._searchOngoing = true;
    this._onDidChange.fire();
    try {
      const installedExtensions = await this._installedExtensions;
      const options = { text: `${this.marketplaceQuery} ${value}`, pageSize: 20 };
      const pager = await this.extensionGalleryService.query(options, token);
      for (let i = 0; i < pager.total && i < 1; i++) {
        if (token.isCancellationRequested) {
          break;
        }
        const nThemes = this._marketplaceThemes.length;
        const gallery = i === 0 ? pager.firstPage : await pager.getPage(i, token);
        const promises = [];
        const promisesGalleries = [];
        for (let i2 = 0; i2 < gallery.length; i2++) {
          if (token.isCancellationRequested) {
            break;
          }
          const ext = gallery[i2];
          if (this.environmentService.isSessionsWindow && ext.properties.executesCode) {
            continue;
          }
          if (!installedExtensions.has(ext.identifier.id) && !this._marketplaceExtensions.has(ext.identifier.id)) {
            this._marketplaceExtensions.add(ext.identifier.id);
            promises.push(this.getMarketplaceColorThemes(ext.publisher, ext.name, ext.version));
            promisesGalleries.push(ext);
          }
        }
        const allThemes = await Promise.all(promises);
        for (let i2 = 0; i2 < allThemes.length; i2++) {
          const ext = promisesGalleries[i2];
          for (const theme of allThemes[i2]) {
            this._marketplaceThemes.push({ id: theme.id, theme, label: theme.label, description: `${ext.displayName} \xB7 ${ext.publisherDisplayName}`, galleryExtension: ext, buttons: [configureButton] });
          }
        }
        if (nThemes !== this._marketplaceThemes.length) {
          this._marketplaceThemes.sort((t1, t2) => t1.label.localeCompare(t2.label));
          this._onDidChange.fire();
        }
      }
    } catch (e) {
      if (!isCancellationError(e)) {
        this.logService.error(`Error while searching for themes:`, e);
        this._searchError = "message" in e ? e.message : String(e);
      }
    } finally {
      this._searchOngoing = false;
      this._onDidChange.fire();
    }
  }
  openQuickPick(value, currentTheme, selectTheme) {
    let result = void 0;
    const disposables = new DisposableStore();
    return new Promise((s, _) => {
      const quickpick = disposables.add(this.quickInputService.createQuickPick());
      quickpick.items = [];
      quickpick.sortByLabel = false;
      quickpick.matchOnDescription = true;
      quickpick.buttons = [this.quickInputService.backButton];
      quickpick.title = "Marketplace Themes";
      quickpick.placeholder = localize("themes.selectMarketplaceTheme", "Type to Search More. Select to Install. Up/Down Keys to Preview");
      quickpick.canSelectMany = false;
      disposables.add(quickpick.onDidChangeValue(() => this.trigger(quickpick.value)));
      disposables.add(quickpick.onDidAccept(async (_2) => {
        const themeItem = quickpick.selectedItems[0];
        if (themeItem?.galleryExtension) {
          result = "selected";
          quickpick.hide();
          const success = await this.installExtension(themeItem.galleryExtension);
          if (success) {
            selectTheme(themeItem.theme, true);
          } else {
            selectTheme(currentTheme, true);
          }
        }
      }));
      disposables.add(quickpick.onDidTriggerItemButton((e) => {
        if (isItem(e.item)) {
          const extensionId = e.item.theme?.extensionData?.extensionId;
          if (extensionId) {
            this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
          } else {
            this.extensionsWorkbenchService.openSearch(`${this.marketplaceQuery} ${quickpick.value}`);
          }
        }
      }));
      disposables.add(quickpick.onDidChangeActive((themes) => {
        if (result === void 0) {
          selectTheme(themes[0]?.theme, false);
        }
      }));
      disposables.add(quickpick.onDidHide(() => {
        if (result === void 0) {
          selectTheme(currentTheme, true);
          result = "cancelled";
        }
        s(result);
      }));
      disposables.add(quickpick.onDidTriggerButton((e) => {
        if (e === this.quickInputService.backButton) {
          result = "back";
          quickpick.hide();
        }
      }));
      disposables.add(this.onDidChange(() => {
        let items = this.themes;
        if (this._searchOngoing) {
          items = items.concat({ label: "$(loading~spin) Searching for themes...", id: void 0, alwaysShow: true });
        } else if (items.length === 0 && this._searchError) {
          items = [{ label: `$(error) ${localize("search.error", "Error while searching for themes: {0}", this._searchError)}`, id: void 0, alwaysShow: true }];
        }
        const activeItemId = quickpick.activeItems[0]?.id;
        const newActiveItem = activeItemId ? items.find((i) => isItem(i) && i.id === activeItemId) : void 0;
        quickpick.items = items;
        if (newActiveItem) {
          quickpick.activeItems = [newActiveItem];
        }
      }));
      this.trigger(value);
      quickpick.show();
    }).finally(() => {
      disposables.dispose();
    });
  }
  async installExtension(galleryExtension) {
    this.extensionsWorkbenchService.openSearch(`@id:${galleryExtension.identifier.id}`);
    const result = await this.dialogService.confirm({
      message: localize("installExtension.confirm", "This will install extension '{0}' published by '{1}'. Do you want to continue?", galleryExtension.displayName, galleryExtension.publisherDisplayName),
      primaryButton: localize("installExtension.button.ok", "OK")
    });
    if (!result.confirmed) {
      return false;
    }
    try {
      await this.progressService.withProgress({
        location: ProgressLocation.Notification,
        title: localize("installing extensions", "Installing Extension {0}...", galleryExtension.displayName)
      }, async () => {
        await this.extensionManagementService.installFromGallery(galleryExtension, {
          // Setting this to false is how you get the extension to be synced with Settings Sync (if enabled).
          isMachineScoped: false
        });
      });
      return true;
    } catch (e) {
      this.logService.error(`Problem installing extension ${galleryExtension.identifier.id}`, e);
      return false;
    }
  }
  dispose() {
    if (this._tokenSource) {
      this._tokenSource.cancel();
      this._tokenSource = void 0;
    }
    this._queryDelayer.dispose();
    this._marketplaceExtensions.clear();
    this._marketplaceThemes.length = 0;
    this._onDidChange.dispose();
  }
};
MarketplaceThemesPicker = __decorateClass([
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IExtensionManagementService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IExtensionsWorkbenchService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkbenchEnvironmentService)
], MarketplaceThemesPicker);
let InstalledThemesPicker = class {
  constructor(options, setTheme, getMarketplaceColorThemes, quickInputService, extensionGalleryService, extensionsWorkbenchService, extensionResourceLoaderService, instantiationService) {
    this.options = options;
    this.setTheme = setTheme;
    this.getMarketplaceColorThemes = getMarketplaceColorThemes;
    this.quickInputService = quickInputService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.instantiationService = instantiationService;
  }
  async openQuickPick(picks, currentTheme) {
    let marketplaceThemePicker;
    if (this.extensionGalleryService.isEnabled()) {
      if (await this.extensionResourceLoaderService.supportsExtensionGalleryResources() && this.options.browseMessage) {
        marketplaceThemePicker = this.instantiationService.createInstance(MarketplaceThemesPicker, this.getMarketplaceColorThemes.bind(this), this.options.marketplaceTag);
        picks = [configurationEntry(this.options.browseMessage, "marketplace" /* BROWSE_GALLERY */), ...picks];
      } else {
        picks = [...picks, { type: "separator" }, configurationEntry(this.options.installMessage, "extensions" /* EXTENSIONS_VIEW */)];
      }
    }
    let selectThemeTimeout;
    const selectTheme = (theme, applyTheme) => {
      if (selectThemeTimeout) {
        clearTimeout(selectThemeTimeout);
      }
      selectThemeTimeout = mainWindow.setTimeout(() => {
        selectThemeTimeout = void 0;
        const newTheme = theme ?? currentTheme;
        this.setTheme(newTheme, applyTheme ? "auto" : "preview").then(
          void 0,
          (err) => {
            onUnexpectedError(err);
            this.setTheme(currentTheme, void 0);
          }
        );
      }, applyTheme ? 0 : 200);
    };
    const pickInstalledThemes = (activeItemId) => {
      const disposables = new DisposableStore();
      return new Promise((s, _) => {
        let isCompleted = false;
        const autoFocusIndex = picks.findIndex((p) => isItem(p) && p.id === activeItemId);
        const quickpick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
        quickpick.items = picks;
        quickpick.title = this.options.title;
        quickpick.description = this.options.description;
        quickpick.placeholder = this.options.placeholderMessage;
        quickpick.activeItems = [picks[autoFocusIndex]];
        quickpick.canSelectMany = false;
        quickpick.buttons = this.options.buttons ?? [];
        disposables.add(quickpick.onDidTriggerButton((button) => this.options.onButton?.(button, quickpick)));
        quickpick.matchOnDescription = true;
        disposables.add(quickpick.onDidAccept(async (_2) => {
          isCompleted = true;
          const theme = quickpick.selectedItems[0];
          if (!theme || theme.configureItem) {
            if (!theme || theme.configureItem === "extensions" /* EXTENSIONS_VIEW */) {
              this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
            } else if (theme.configureItem === "marketplace" /* BROWSE_GALLERY */) {
              if (marketplaceThemePicker) {
                const res = await marketplaceThemePicker.openQuickPick(quickpick.value, currentTheme, selectTheme);
                if (res === "back") {
                  await pickInstalledThemes(void 0);
                }
              }
            }
          } else {
            selectTheme(theme.theme, true);
          }
          quickpick.hide();
          s();
        }));
        disposables.add(quickpick.onDidChangeActive((themes) => selectTheme(themes[0]?.theme, false)));
        disposables.add(quickpick.onDidHide(() => {
          if (!isCompleted) {
            selectTheme(currentTheme, true);
            s();
          }
          quickpick.dispose();
        }));
        disposables.add(quickpick.onDidTriggerItemButton((e) => {
          if (isItem(e.item)) {
            const extensionId = e.item.theme?.extensionData?.extensionId;
            if (extensionId) {
              this.extensionsWorkbenchService.openSearch(`@id:${extensionId}`);
            } else {
              this.extensionsWorkbenchService.openSearch(`${this.options.marketplaceTag} ${quickpick.value}`);
            }
          }
        }));
        quickpick.show();
      }).finally(() => {
        disposables.dispose();
      });
    };
    await pickInstalledThemes(currentTheme.id);
    marketplaceThemePicker?.dispose();
  }
};
InstalledThemesPicker = __decorateClass([
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IInstantiationService)
], InstalledThemesPicker);
const SelectColorThemeCommandId = "workbench.action.selectTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectColorThemeCommandId,
      title: localize2("selectTheme.label", "Color Theme"),
      category: Categories.Preferences,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyT)
      }
    });
  }
  getTitle(colorScheme) {
    switch (colorScheme) {
      case ColorScheme.DARK:
        return localize("themes.selectTheme.darkScheme", "Select Color Theme for System Dark Mode");
      case ColorScheme.LIGHT:
        return localize("themes.selectTheme.lightScheme", "Select Color Theme for System Light Mode");
      case ColorScheme.HIGH_CONTRAST_DARK:
        return localize("themes.selectTheme.darkHC", "Select Color Theme for High Contrast Dark Mode");
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        return localize("themes.selectTheme.lightHC", "Select Color Theme for High Contrast Light Mode");
      default:
        return localize("themes.selectTheme.default", "Select Color Theme (detect system color mode disabled)");
    }
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const preferencesService = accessor.get(IPreferencesService);
    const preferredColorScheme = themeService.getPreferredColorScheme();
    const modeConfigureButton = {
      tooltip: preferredColorScheme ? localize("themes.configure.switchingEnabled", "Detect system color mode enabled. Click to configure.") : localize("themes.configure.switchingDisabled", "Detect system color mode disabled. Click to configure."),
      iconClass: ThemeIcon.asClassName(Codicon.colorMode),
      location: QuickInputButtonLocation.Inline
    };
    const options = {
      installMessage: localize("installColorThemes", "Install Additional Color Themes..."),
      browseMessage: "$(plus) " + localize("browseColorThemes", "Browse Additional Color Themes..."),
      placeholderMessage: this.getTitle(preferredColorScheme),
      marketplaceTag: "category:themes",
      buttons: [modeConfigureButton],
      onButton: async (_button, picker2) => {
        picker2.hide();
        await preferencesService.openSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
      }
    };
    const setTheme = (theme, settingsTarget) => themeService.setColorTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const themes = await themeService.getColorThemes();
    const currentTheme = themeService.getColorTheme();
    const lightEntries = toEntries(themes.filter((t) => t.type === ColorScheme.LIGHT), localize("themes.category.light", "light themes"));
    const darkEntries = toEntries(themes.filter((t) => t.type === ColorScheme.DARK), localize("themes.category.dark", "dark themes"));
    const hcEntries = toEntries(themes.filter((t) => isHighContrast(t.type)), localize("themes.category.hc", "high contrast themes"));
    let picks;
    switch (preferredColorScheme) {
      case ColorScheme.DARK:
        picks = [...darkEntries, ...lightEntries, ...hcEntries];
        break;
      case ColorScheme.HIGH_CONTRAST_DARK:
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        picks = [...hcEntries, ...lightEntries, ...darkEntries];
        break;
      case ColorScheme.LIGHT:
      default:
        picks = [...lightEntries, ...darkEntries, ...hcEntries];
        break;
    }
    await picker.openQuickPick(picks, currentTheme);
  }
});
const SelectFileIconThemeCommandId = "workbench.action.selectIconTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectFileIconThemeCommandId,
      title: localize2("selectIconTheme.label", "File Icon Theme"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const options = {
      installMessage: localize("installIconThemes", "Install Additional File Icon Themes..."),
      placeholderMessage: localize("themes.selectIconTheme", "Select File Icon Theme (Up/Down Keys to Preview)"),
      marketplaceTag: "tag:icon-theme"
    };
    const setTheme = (theme, settingsTarget) => themeService.setFileIconTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceFileIconThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const picks = [
      { type: "separator", label: localize("fileIconThemeCategory", "file icon themes") },
      { id: "", theme: FileIconThemeData.noIconTheme, label: localize("noIconThemeLabel", "None"), description: localize("noIconThemeDesc", "Disable File Icons") },
      ...toEntries(await themeService.getFileIconThemes())
    ];
    await picker.openQuickPick(picks, themeService.getFileIconTheme());
  }
});
const SelectProductIconThemeCommandId = "workbench.action.selectProductIconTheme";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: SelectProductIconThemeCommandId,
      title: localize2("selectProductIconTheme.label", "Product Icon Theme"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const options = {
      installMessage: localize("installProductIconThemes", "Install Additional Product Icon Themes..."),
      browseMessage: "$(plus) " + localize("browseProductIconThemes", "Browse Additional Product Icon Themes..."),
      placeholderMessage: localize("themes.selectProductIconTheme", "Select Product Icon Theme (Up/Down Keys to Preview)"),
      marketplaceTag: "tag:product-icon-theme"
    };
    const setTheme = (theme, settingsTarget) => themeService.setProductIconTheme(theme, settingsTarget);
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceProductIconThemes(publisher, name, version);
    const instantiationService = accessor.get(IInstantiationService);
    const picker = instantiationService.createInstance(InstalledThemesPicker, options, setTheme, getMarketplaceColorThemes);
    const picks = [
      { type: "separator", label: localize("productIconThemeCategory", "product icon themes") },
      { id: DEFAULT_PRODUCT_ICON_THEME_ID, theme: ProductIconThemeData.defaultTheme, label: localize("defaultProductIconThemeLabel", "Default") },
      ...toEntries(await themeService.getProductIconThemes())
    ];
    await picker.openQuickPick(picks, themeService.getProductIconTheme());
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.tryNewDefaultThemes",
      title: localize2("tryNewDefaultThemes", "Try New Default Themes"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const previousTheme = themeService.getColorTheme();
    const allThemes = await themeService.getColorThemes();
    const newThemeSettingsIds = /* @__PURE__ */ new Set([ThemeSettingDefaults.COLOR_THEME_LIGHT, ThemeSettingDefaults.COLOR_THEME_DARK]);
    const themes = allThemes.filter((t) => newThemeSettingsIds.has(t.settingsId));
    const items = themes.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description
    }));
    const disposables = new DisposableStore();
    const picker = disposables.add(quickInputService.createQuickPick());
    picker.items = items;
    picker.placeholder = localize("pickNewTheme", "Pick a new default theme");
    picker.canSelectMany = false;
    const preferredId = previousTheme.type === ColorScheme.LIGHT || previousTheme.type === ColorScheme.HIGH_CONTRAST_LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
    const activeItem = items.find((i) => themes.find((t) => t.id === i.id)?.settingsId === preferredId);
    if (activeItem) {
      picker.activeItems = [activeItem];
    }
    disposables.add(picker.onDidChangeActive((selected) => {
      if (selected[0]) {
        const theme = themes.find((t) => t.id === selected[0].id);
        if (theme) {
          themeService.setColorTheme(theme, "preview");
        }
      }
    }));
    disposables.add(picker.onDidAccept(() => {
      const selected = picker.activeItems[0];
      const theme = selected ? themes.find((t) => t.id === selected.id) : void 0;
      picker.hide();
      if (!theme) {
        return;
      }
      (async () => {
        try {
          await themeService.setColorTheme(theme, "auto");
          await configurationService.updateValue(ThemeSettings.PREFERRED_LIGHT_THEME, ThemeSettingDefaults.COLOR_THEME_LIGHT);
          await configurationService.updateValue(ThemeSettings.PREFERRED_DARK_THEME, ThemeSettingDefaults.COLOR_THEME_DARK);
        } catch (error) {
          if (!isCancellationError(error)) {
            onUnexpectedError(error);
          }
        }
      })();
    }));
    const result = new Promise((resolve) => {
      disposables.add(picker.onDidHide(() => {
        if (!picker.selectedItems.length) {
          themeService.setColorTheme(previousTheme, void 0);
        }
        resolve();
      }));
    }).finally(() => disposables.dispose());
    picker.show();
    return result;
  }
});
CommandsRegistry.registerCommand("workbench.action.previewColorTheme", async function(accessor, extension, themeSettingsId) {
  const themeService = accessor.get(IWorkbenchThemeService);
  let themes = findBuiltInThemes(await themeService.getColorThemes(), extension);
  if (themes.length === 0) {
    themes = await themeService.getMarketplaceColorThemes(extension.publisher, extension.name, extension.version);
  }
  for (const theme of themes) {
    if (!themeSettingsId || theme.settingsId === themeSettingsId) {
      await themeService.setColorTheme(theme, "preview");
      return theme.settingsId;
    }
  }
  return void 0;
});
function findBuiltInThemes(themes, extension) {
  return themes.filter(({ extensionData }) => extensionData && extensionData.extensionIsBuiltin && equalsIgnoreCase(extensionData.extensionPublisher, extension.publisher) && equalsIgnoreCase(extensionData.extensionName, extension.name));
}
function configurationEntry(label, configureItem) {
  return {
    id: void 0,
    label,
    alwaysShow: true,
    buttons: [configureButton],
    configureItem
  };
}
function isItem(i) {
  return i["type"] !== "separator";
}
const defaultThemeDescriptions = {
  [ThemeSettingDefaults.COLOR_THEME_LIGHT]: localize("defaultLight", "Default Light"),
  [ThemeSettingDefaults.COLOR_THEME_DARK]: localize("defaultDark", "Default Dark")
};
function toEntry(theme) {
  const settingId = theme.settingsId ?? void 0;
  const item = {
    id: theme.id,
    theme,
    label: theme.label,
    description: defaultThemeDescriptions[settingId ?? ""] ?? theme.description ?? (theme.label === settingId ? void 0 : settingId)
  };
  if (theme.extensionData) {
    item.buttons = [configureButton];
  }
  return item;
}
function toEntries(themes, label) {
  const pinnedIds = /* @__PURE__ */ new Set([ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT]);
  const sorter = (t1, t2) => {
    const pin1 = pinnedIds.has(t1.theme?.settingsId ?? "");
    const pin2 = pinnedIds.has(t2.theme?.settingsId ?? "");
    if (pin1 !== pin2) {
      return pin1 ? -1 : 1;
    }
    return t1.label.localeCompare(t2.label);
  };
  const entries = themes.map(toEntry).sort(sorter);
  if (entries.length > 0 && label) {
    entries.unshift({ type: "separator", label });
  }
  return entries;
}
const configureButton = {
  iconClass: ThemeIcon.asClassName(manageExtensionIcon),
  tooltip: localize("manage extension", "Manage Extension")
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.generateColorTheme",
      title: localize2("generateColorTheme.label", "Generate Color Theme From Current Settings"),
      category: Categories.Developer,
      f1: true
    });
  }
  run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const theme = themeService.getColorTheme();
    const colors = Registry.as(ColorRegistryExtensions.ColorContribution).getColors();
    const colorIds = colors.filter((c) => !c.deprecationMessage).map((c) => c.id).sort();
    const resultingColors = {};
    const inherited = [];
    for (const colorId of colorIds) {
      const color = theme.getColor(colorId, false);
      if (color) {
        resultingColors[colorId] = Color.Format.CSS.formatHexA(color, true);
      } else {
        inherited.push(colorId);
      }
    }
    const nullDefaults = [];
    for (const id of inherited) {
      const color = theme.getColor(id);
      if (color) {
        resultingColors["__" + id] = Color.Format.CSS.formatHexA(color, true);
      } else {
        nullDefaults.push(id);
      }
    }
    for (const id of nullDefaults) {
      resultingColors["__" + id] = null;
    }
    let contents = JSON.stringify({
      "$schema": colorThemeSchemaId,
      type: theme.type,
      colors: resultingColors,
      tokenColors: theme.tokenColors.filter((t) => !!t.scope)
    }, null, "	");
    contents = contents.replace(/\"__/g, '//"');
    const editorService = accessor.get(IEditorService);
    return editorService.openEditor({ resource: void 0, contents, languageId: "jsonc", options: { pinned: true } });
  }
});
const toggleLightDarkThemesCommandId = "workbench.action.toggleLightDarkThemes";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: toggleLightDarkThemesCommandId,
      title: localize2("toggleLightDarkThemes.label", "Toggle between Light/Dark Themes"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const themeService = accessor.get(IWorkbenchThemeService);
    const configurationService = accessor.get(IConfigurationService);
    const notificationService = accessor.get(INotificationService);
    const preferencesService = accessor.get(IPreferencesService);
    if (configurationService.getValue(ThemeSettings.DETECT_COLOR_SCHEME)) {
      const message = localize({ key: "cannotToggle", comment: ["{0} is a setting name"] }, "Cannot toggle between light and dark themes when `{0}` is enabled in settings.", ThemeSettings.DETECT_COLOR_SCHEME);
      notificationService.prompt(Severity.Info, message, [
        {
          label: localize("goToSetting", "Open Settings"),
          run: () => {
            return preferencesService.openUserSettings({ query: ThemeSettings.DETECT_COLOR_SCHEME });
          }
        }
      ]);
      return;
    }
    const currentTheme = themeService.getColorTheme();
    let newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
    switch (currentTheme.type) {
      case ColorScheme.LIGHT:
        newSettingsId = ThemeSettings.PREFERRED_DARK_THEME;
        break;
      case ColorScheme.DARK:
        newSettingsId = ThemeSettings.PREFERRED_LIGHT_THEME;
        break;
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        newSettingsId = ThemeSettings.PREFERRED_HC_DARK_THEME;
        break;
      case ColorScheme.HIGH_CONTRAST_DARK:
        newSettingsId = ThemeSettings.PREFERRED_HC_LIGHT_THEME;
        break;
    }
    const themeSettingId = configurationService.getValue(newSettingsId);
    if (themeSettingId && typeof themeSettingId === "string") {
      const theme = (await themeService.getColorThemes()).find((t) => t.settingsId === themeSettingId);
      if (theme) {
        themeService.setColorTheme(theme.id, "auto");
      }
    }
  }
});
const browseColorThemesInMarketplaceCommandId = "workbench.action.browseColorThemesInMarketplace";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: browseColorThemesInMarketplaceCommandId,
      title: localize2("browseColorThemeInMarketPlace.label", "Browse Color Themes in Marketplace"),
      category: Categories.Preferences,
      f1: true
    });
  }
  async run(accessor) {
    const marketplaceTag = "category:themes";
    const themeService = accessor.get(IWorkbenchThemeService);
    const extensionGalleryService = accessor.get(IExtensionGalleryService);
    const extensionResourceLoaderService = accessor.get(IExtensionResourceLoaderService);
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const instantiationService = accessor.get(IInstantiationService);
    if (!extensionGalleryService.isEnabled()) {
      return;
    }
    if (!await extensionResourceLoaderService.supportsExtensionGalleryResources()) {
      await extensionsWorkbenchService.openSearch(marketplaceTag);
      return;
    }
    const currentTheme = themeService.getColorTheme();
    const getMarketplaceColorThemes = (publisher, name, version) => themeService.getMarketplaceColorThemes(publisher, name, version);
    let selectThemeTimeout;
    const selectTheme = (theme, applyTheme) => {
      if (selectThemeTimeout) {
        clearTimeout(selectThemeTimeout);
      }
      selectThemeTimeout = mainWindow.setTimeout(() => {
        selectThemeTimeout = void 0;
        const newTheme = theme ?? currentTheme;
        themeService.setColorTheme(newTheme, applyTheme ? "auto" : "preview").then(
          void 0,
          (err) => {
            onUnexpectedError(err);
            themeService.setColorTheme(currentTheme, void 0);
          }
        );
      }, applyTheme ? 0 : 200);
    };
    const marketplaceThemePicker = instantiationService.createInstance(MarketplaceThemesPicker, getMarketplaceColorThemes, marketplaceTag);
    await marketplaceThemePicker.openQuickPick("", themeService.getColorTheme(), selectTheme).then(void 0, onUnexpectedError);
  }
});
const ThemesSubMenu = new MenuId("ThemesSubMenu");
MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
  title: localize("themes", "Themes"),
  submenu: ThemesSubMenu,
  group: "2_configuration",
  order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
  title: localize({ key: "miSelectTheme", comment: ["&& denotes a mnemonic"] }, "&&Themes"),
  submenu: ThemesSubMenu,
  group: "2_configuration",
  order: 7
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectColorThemeCommandId,
    title: localize("selectTheme.label", "Color Theme")
  },
  order: 1
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectFileIconThemeCommandId,
    title: localize("themes.selectIconTheme.label", "File Icon Theme")
  },
  order: 2
});
MenuRegistry.appendMenuItem(ThemesSubMenu, {
  command: {
    id: SelectProductIconThemeCommandId,
    title: localize("themes.selectProductIconTheme.label", "Product Icon Theme")
  },
  order: 3
});
export {
  manageExtensionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3RoZW1lcy9icm93c2VyL3RoZW1lcy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q2hvcmQsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCwgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yLCBJU3VibWVudUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGVxdWFsc0lnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFRoZW1lU2VydmljZSwgSVdvcmtiZW5jaFRoZW1lLCBUaGVtZVNldHRpbmdUYXJnZXQsIElXb3JrYmVuY2hDb2xvclRoZW1lLCBJV29ya2JlbmNoRmlsZUljb25UaGVtZSwgSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWUsIFRoZW1lU2V0dGluZ3MsIFRoZW1lU2V0dGluZ0RlZmF1bHRzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdhbGxlcnlFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDb2xvclJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbG9yUmVnaXN0cnlFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSwgaXNIaWdoQ29udHJhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgY29sb3JUaGVtZVNjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi9jb2xvclRoZW1lU2NoZW1hLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtLCBRdWlja0lucHV0QnV0dG9uTG9jYXRpb24sIFF1aWNrUGlja0lucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1BST0RVQ1RfSUNPTl9USEVNRV9JRCwgUHJvZHVjdEljb25UaGVtZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci9wcm9kdWN0SWNvblRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEZpbGVJY29uVGhlbWVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2Jyb3dzZXIvZmlsZUljb25UaGVtZURhdGEuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuXG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgbWFuYWdlRXh0ZW5zaW9uSWNvbiA9IHJlZ2lzdGVySWNvbigndGhlbWUtc2VsZWN0aW9uLW1hbmFnZS1leHRlbnNpb24nLCBDb2RpY29uLmdlYXIsIGxvY2FsaXplKCdtYW5hZ2VFeHRlbnNpb25JY29uJywgJ0ljb24gZm9yIHRoZSBcXCdNYW5hZ2VcXCcgYWN0aW9uIGluIHRoZSB0aGVtZSBzZWxlY3Rpb24gcXVpY2sgcGljay4nKSk7XG5cbnR5cGUgUGlja2VyUmVzdWx0ID0gJ2JhY2snIHwgJ3NlbGVjdGVkJyB8ICdjYW5jZWxsZWQnO1xuXG5lbnVtIENvbmZpZ3VyZUl0ZW0ge1xuXHRCUk9XU0VfR0FMTEVSWSA9ICdtYXJrZXRwbGFjZScsXG5cdEVYVEVOU0lPTlNfVklFVyA9ICdleHRlbnNpb25zJyxcblx0Q1VTVE9NX1RPUF9FTlRSWSA9ICdjdXN0b21Ub3BFbnRyeSdcbn1cblxuY2xhc3MgTWFya2V0cGxhY2VUaGVtZXNQaWNrZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbGxlZEV4dGVuc2lvbnM6IFByb21pc2U8U2V0PHN0cmluZz4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXRwbGFjZUV4dGVuc2lvbnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXRwbGFjZVRoZW1lczogVGhlbWVJdGVtW10gPSBbXTtcblxuXHRwcml2YXRlIF9zZWFyY2hPbmdvaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3NlYXJjaEVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblxuXHRwcml2YXRlIF90b2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXJ5RGVsYXllciA9IG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDIwMCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzOiAocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKSA9PiBQcm9taXNlPElXb3JrYmVuY2hUaGVtZVtdPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hcmtldHBsYWNlUXVlcnk6IHN0cmluZyxcblxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9pbnN0YWxsZWRFeHRlbnNpb25zID0gZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCkudGhlbihpbnN0YWxsZWQgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBpbnN0YWxsZWQpIHtcblx0XHRcdFx0cmVzdWx0LmFkZChleHQuaWRlbnRpZmllci5pZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCB0aGVtZXMoKTogVGhlbWVJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLl9tYXJrZXRwbGFjZVRoZW1lcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHRyaWdnZXIodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl90b2tlblNvdXJjZSkge1xuXHRcdFx0dGhpcy5fdG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl90b2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcXVlcnlEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHJldHVybiB0aGlzLmRvU2VhcmNoKHZhbHVlLCB0aGlzLl90b2tlblNvdXJjZS50b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2VhcmNoKHZhbHVlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3NlYXJjaE9uZ29pbmcgPSB0cnVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX2luc3RhbGxlZEV4dGVuc2lvbnM7XG5cblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7IHRleHQ6IGAke3RoaXMubWFya2V0cGxhY2VRdWVyeX0gJHt2YWx1ZX1gLCBwYWdlU2l6ZTogMjAgfTtcblx0XHRcdGNvbnN0IHBhZ2VyID0gYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5xdWVyeShvcHRpb25zLCB0b2tlbik7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhZ2VyLnRvdGFsICYmIGkgPCAxOyBpKyspIHsgLy8gbG9hZGluZyBtdWx0aXBsZSBwYWdlcyBpcyB0dXJuZWQgb2YgZm9yIG5vdyB0byBhdm9pZCBmbGlja2VyaW5nXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgblRoZW1lcyA9IHRoaXMuX21hcmtldHBsYWNlVGhlbWVzLmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgZ2FsbGVyeSA9IGkgPT09IDAgPyBwYWdlci5maXJzdFBhZ2UgOiBhd2FpdCBwYWdlci5nZXRQYWdlKGksIHRva2VuKTtcblxuXHRcdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJV29ya2JlbmNoVGhlbWVbXT5bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBwcm9taXNlc0dhbGxlcmllcyA9IFtdO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGdhbGxlcnkubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBleHQgPSBnYWxsZXJ5W2ldO1xuXHRcdFx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmIGV4dC5wcm9wZXJ0aWVzLmV4ZWN1dGVzQ29kZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIElkZWFsbHkgd291bGQgYmUgaW4gc3luYyB3aXRoIGNhbkV4ZWN1dGVPblNlc3Npb25zV2luZG93XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghaW5zdGFsbGVkRXh0ZW5zaW9ucy5oYXMoZXh0LmlkZW50aWZpZXIuaWQpICYmICF0aGlzLl9tYXJrZXRwbGFjZUV4dGVuc2lvbnMuaGFzKGV4dC5pZGVudGlmaWVyLmlkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbWFya2V0cGxhY2VFeHRlbnNpb25zLmFkZChleHQuaWRlbnRpZmllci5pZCk7XG5cdFx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyhleHQucHVibGlzaGVyLCBleHQubmFtZSwgZXh0LnZlcnNpb24pKTtcblx0XHRcdFx0XHRcdHByb21pc2VzR2FsbGVyaWVzLnB1c2goZXh0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWxsVGhlbWVzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFsbFRoZW1lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGV4dCA9IHByb21pc2VzR2FsbGVyaWVzW2ldO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdGhlbWUgb2YgYWxsVGhlbWVzW2ldKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9tYXJrZXRwbGFjZVRoZW1lcy5wdXNoKHsgaWQ6IHRoZW1lLmlkLCB0aGVtZTogdGhlbWUsIGxhYmVsOiB0aGVtZS5sYWJlbCwgZGVzY3JpcHRpb246IGAke2V4dC5kaXNwbGF5TmFtZX0gXHUwMEI3ICR7ZXh0LnB1Ymxpc2hlckRpc3BsYXlOYW1lfWAsIGdhbGxlcnlFeHRlbnNpb246IGV4dCwgYnV0dG9uczogW2NvbmZpZ3VyZUJ1dHRvbl0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5UaGVtZXMgIT09IHRoaXMuX21hcmtldHBsYWNlVGhlbWVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX21hcmtldHBsYWNlVGhlbWVzLnNvcnQoKHQxLCB0MikgPT4gdDEubGFiZWwubG9jYWxlQ29tcGFyZSh0Mi5sYWJlbCkpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIHNlYXJjaGluZyBmb3IgdGhlbWVzOmAsIGUpO1xuXHRcdFx0XHR0aGlzLl9zZWFyY2hFcnJvciA9ICdtZXNzYWdlJyBpbiBlID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zZWFyY2hPbmdvaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXG5cdH1cblxuXHRwdWJsaWMgb3BlblF1aWNrUGljayh2YWx1ZTogc3RyaW5nLCBjdXJyZW50VGhlbWU6IElXb3JrYmVuY2hUaGVtZSB8IHVuZGVmaW5lZCwgc2VsZWN0VGhlbWU6ICh0aGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBhcHBseVRoZW1lOiBib29sZWFuKSA9PiB2b2lkKTogUHJvbWlzZTxQaWNrZXJSZXN1bHQ+IHtcblx0XHRsZXQgcmVzdWx0OiBQaWNrZXJSZXN1bHQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPFBpY2tlclJlc3VsdD4oKHMsIF8pID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxUaGVtZUl0ZW0+KCkpO1xuXHRcdFx0cXVpY2twaWNrLml0ZW1zID0gW107XG5cdFx0XHRxdWlja3BpY2suc29ydEJ5TGFiZWwgPSBmYWxzZTtcblx0XHRcdHF1aWNrcGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdFx0cXVpY2twaWNrLmJ1dHRvbnMgPSBbdGhpcy5xdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uXTtcblx0XHRcdHF1aWNrcGljay50aXRsZSA9ICdNYXJrZXRwbGFjZSBUaGVtZXMnO1xuXHRcdFx0cXVpY2twaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RNYXJrZXRwbGFjZVRoZW1lJywgXCJUeXBlIHRvIFNlYXJjaCBNb3JlLiBTZWxlY3QgdG8gSW5zdGFsbC4gVXAvRG93biBLZXlzIHRvIFByZXZpZXdcIik7XG5cdFx0XHRxdWlja3BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZENoYW5nZVZhbHVlKCgpID0+IHRoaXMudHJpZ2dlcihxdWlja3BpY2sudmFsdWUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkQWNjZXB0KGFzeW5jIF8gPT4ge1xuXHRcdFx0XHRjb25zdCB0aGVtZUl0ZW0gPSBxdWlja3BpY2suc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0aWYgKHRoZW1lSXRlbT8uZ2FsbGVyeUV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHJlc3VsdCA9ICdzZWxlY3RlZCc7XG5cdFx0XHRcdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRcdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5pbnN0YWxsRXh0ZW5zaW9uKHRoZW1lSXRlbS5nYWxsZXJ5RXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0c2VsZWN0VGhlbWUodGhlbWVJdGVtLnRoZW1lLCB0cnVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZWN0VGhlbWUoY3VycmVudFRoZW1lLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoaXNJdGVtKGUuaXRlbSkpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGUuaXRlbS50aGVtZT8uZXh0ZW5zaW9uRGF0YT8uZXh0ZW5zaW9uSWQ7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBpZDoke2V4dGVuc2lvbklkfWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYCR7dGhpcy5tYXJrZXRwbGFjZVF1ZXJ5fSAke3F1aWNrcGljay52YWx1ZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRDaGFuZ2VBY3RpdmUodGhlbWVzID0+IHtcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c2VsZWN0VGhlbWUodGhlbWVzWzBdPy50aGVtZSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c2VsZWN0VGhlbWUoY3VycmVudFRoZW1lLCB0cnVlKTtcblx0XHRcdFx0XHRyZXN1bHQgPSAnY2FuY2VsbGVkJztcblxuXHRcdFx0XHR9XG5cdFx0XHRcdHMocmVzdWx0KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZFRyaWdnZXJCdXR0b24oZSA9PiB7XG5cdFx0XHRcdGlmIChlID09PSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmJhY2tCdXR0b24pIHtcblx0XHRcdFx0XHRyZXN1bHQgPSAnYmFjayc7XG5cdFx0XHRcdFx0cXVpY2twaWNrLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdGxldCBpdGVtcyA9IHRoaXMudGhlbWVzO1xuXHRcdFx0XHRpZiAodGhpcy5fc2VhcmNoT25nb2luZykge1xuXHRcdFx0XHRcdGl0ZW1zID0gaXRlbXMuY29uY2F0KHsgbGFiZWw6ICckKGxvYWRpbmd+c3BpbikgU2VhcmNoaW5nIGZvciB0aGVtZXMuLi4nLCBpZDogdW5kZWZpbmVkLCBhbHdheXNTaG93OiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl9zZWFyY2hFcnJvcikge1xuXHRcdFx0XHRcdGl0ZW1zID0gW3sgbGFiZWw6IGAkKGVycm9yKSAke2xvY2FsaXplKCdzZWFyY2guZXJyb3InLCAnRXJyb3Igd2hpbGUgc2VhcmNoaW5nIGZvciB0aGVtZXM6IHswfScsIHRoaXMuX3NlYXJjaEVycm9yKX1gLCBpZDogdW5kZWZpbmVkLCBhbHdheXNTaG93OiB0cnVlIH1dO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUl0ZW1JZCA9IHF1aWNrcGljay5hY3RpdmVJdGVtc1swXT8uaWQ7XG5cdFx0XHRcdGNvbnN0IG5ld0FjdGl2ZUl0ZW0gPSBhY3RpdmVJdGVtSWQgPyBpdGVtcy5maW5kKGkgPT4gaXNJdGVtKGkpICYmIGkuaWQgPT09IGFjdGl2ZUl0ZW1JZCkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0cXVpY2twaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdGlmIChuZXdBY3RpdmVJdGVtKSB7XG5cdFx0XHRcdFx0cXVpY2twaWNrLmFjdGl2ZUl0ZW1zID0gW25ld0FjdGl2ZUl0ZW0gYXMgVGhlbWVJdGVtXTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy50cmlnZ2VyKHZhbHVlKTtcblx0XHRcdHF1aWNrcGljay5zaG93KCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluc3RhbGxFeHRlbnNpb24oZ2FsbGVyeUV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24pIHtcblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW5TZWFyY2goYEBpZDoke2dhbGxlcnlFeHRlbnNpb24uaWRlbnRpZmllci5pZH1gKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnaW5zdGFsbEV4dGVuc2lvbi5jb25maXJtJywgXCJUaGlzIHdpbGwgaW5zdGFsbCBleHRlbnNpb24gJ3swfScgcHVibGlzaGVkIGJ5ICd7MX0nLiBEbyB5b3Ugd2FudCB0byBjb250aW51ZT9cIiwgZ2FsbGVyeUV4dGVuc2lvbi5kaXNwbGF5TmFtZSwgZ2FsbGVyeUV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnaW5zdGFsbEV4dGVuc2lvbi5idXR0b24ub2snLCBcIk9LXCIpXG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaW5zdGFsbGluZyBleHRlbnNpb25zJywgXCJJbnN0YWxsaW5nIEV4dGVuc2lvbiB7MH0uLi5cIiwgZ2FsbGVyeUV4dGVuc2lvbi5kaXNwbGF5TmFtZSlcblx0XHRcdH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeUV4dGVuc2lvbiwge1xuXHRcdFx0XHRcdC8vIFNldHRpbmcgdGhpcyB0byBmYWxzZSBpcyBob3cgeW91IGdldCB0aGUgZXh0ZW5zaW9uIHRvIGJlIHN5bmNlZCB3aXRoIFNldHRpbmdzIFN5bmMgKGlmIGVuYWJsZWQpLlxuXHRcdFx0XHRcdGlzTWFjaGluZVNjb3BlZDogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFByb2JsZW0gaW5zdGFsbGluZyBleHRlbnNpb24gJHtnYWxsZXJ5RXh0ZW5zaW9uLmlkZW50aWZpZXIuaWR9YCwgZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5fdG9rZW5Tb3VyY2UpIHtcblx0XHRcdHRoaXMuX3Rva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fdG9rZW5Tb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3F1ZXJ5RGVsYXllci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbWFya2V0cGxhY2VFeHRlbnNpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbWFya2V0cGxhY2VUaGVtZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEluc3RhbGxlZFRoZW1lc1BpY2tlck9wdGlvbnMge1xuXHRyZWFkb25seSBpbnN0YWxsTWVzc2FnZTogc3RyaW5nO1xuXHRyZWFkb25seSBicm93c2VNZXNzYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwbGFjZWhvbGRlck1lc3NhZ2U6IHN0cmluZztcblx0cmVhZG9ubHkgbWFya2V0cGxhY2VUYWc6IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBidXR0b25zPzogSVF1aWNrSW5wdXRCdXR0b25bXTtcblx0cmVhZG9ubHkgb25CdXR0b24/OiAoYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiwgcXVpY2tJbnB1dDogSVF1aWNrUGljazxUaGVtZUl0ZW0sIHsgdXNlU2VwYXJhdG9yczogYm9vbGVhbiB9PikgPT4gUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgSW5zdGFsbGVkVGhlbWVzUGlja2VyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJbnN0YWxsZWRUaGVtZXNQaWNrZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0VGhlbWU6ICh0aGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KSA9PiBQcm9taXNlPHVua25vd24+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lczogKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZykgPT4gUHJvbWlzZTxJV29ya2JlbmNoVGhlbWVbXT4sXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgb3BlblF1aWNrUGljayhwaWNrczogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPltdLCBjdXJyZW50VGhlbWU6IElXb3JrYmVuY2hUaGVtZSkge1xuXG5cdFx0bGV0IG1hcmtldHBsYWNlVGhlbWVQaWNrZXI6IE1hcmtldHBsYWNlVGhlbWVzUGlja2VyIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2Uuc3VwcG9ydHNFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VzKCkgJiYgdGhpcy5vcHRpb25zLmJyb3dzZU1lc3NhZ2UpIHtcblx0XHRcdFx0bWFya2V0cGxhY2VUaGVtZVBpY2tlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2V0cGxhY2VUaGVtZXNQaWNrZXIsIHRoaXMuZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcy5iaW5kKHRoaXMpLCB0aGlzLm9wdGlvbnMubWFya2V0cGxhY2VUYWcpO1xuXHRcdFx0XHRwaWNrcyA9IFtjb25maWd1cmF0aW9uRW50cnkodGhpcy5vcHRpb25zLmJyb3dzZU1lc3NhZ2UsIENvbmZpZ3VyZUl0ZW0uQlJPV1NFX0dBTExFUlkpLCAuLi5waWNrc107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwaWNrcyA9IFsuLi5waWNrcywgeyB0eXBlOiAnc2VwYXJhdG9yJyB9LCBjb25maWd1cmF0aW9uRW50cnkodGhpcy5vcHRpb25zLmluc3RhbGxNZXNzYWdlLCBDb25maWd1cmVJdGVtLkVYVEVOU0lPTlNfVklFVyldO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBzZWxlY3RUaGVtZVRpbWVvdXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHNlbGVjdFRoZW1lID0gKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIGFwcGx5VGhlbWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChzZWxlY3RUaGVtZVRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHNlbGVjdFRoZW1lVGltZW91dCk7XG5cdFx0XHR9XG5cdFx0XHRzZWxlY3RUaGVtZVRpbWVvdXQgPSBtYWluV2luZG93LnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRzZWxlY3RUaGVtZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG5ld1RoZW1lID0gKHRoZW1lID8/IGN1cnJlbnRUaGVtZSkgYXMgSVdvcmtiZW5jaFRoZW1lO1xuXHRcdFx0XHR0aGlzLnNldFRoZW1lKG5ld1RoZW1lLCBhcHBseVRoZW1lID8gJ2F1dG8nIDogJ3ByZXZpZXcnKS50aGVuKHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0VGhlbWUoY3VycmVudFRoZW1lLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblx0XHRcdH0sIGFwcGx5VGhlbWUgPyAwIDogMjAwKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGlja0luc3RhbGxlZFRoZW1lcyA9IChhY3RpdmVJdGVtSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHMsIF8pID0+IHtcblx0XHRcdFx0bGV0IGlzQ29tcGxldGVkID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGF1dG9Gb2N1c0luZGV4ID0gcGlja3MuZmluZEluZGV4KHAgPT4gaXNJdGVtKHApICYmIHAuaWQgPT09IGFjdGl2ZUl0ZW1JZCk7XG5cdFx0XHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxUaGVtZUl0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KSk7XG5cdFx0XHRcdHF1aWNrcGljay5pdGVtcyA9IHBpY2tzO1xuXHRcdFx0XHRxdWlja3BpY2sudGl0bGUgPSB0aGlzLm9wdGlvbnMudGl0bGU7XG5cdFx0XHRcdHF1aWNrcGljay5kZXNjcmlwdGlvbiA9IHRoaXMub3B0aW9ucy5kZXNjcmlwdGlvbjtcblx0XHRcdFx0cXVpY2twaWNrLnBsYWNlaG9sZGVyID0gdGhpcy5vcHRpb25zLnBsYWNlaG9sZGVyTWVzc2FnZTtcblx0XHRcdFx0cXVpY2twaWNrLmFjdGl2ZUl0ZW1zID0gW3BpY2tzW2F1dG9Gb2N1c0luZGV4XSBhcyBUaGVtZUl0ZW1dO1xuXHRcdFx0XHRxdWlja3BpY2suY2FuU2VsZWN0TWFueSA9IGZhbHNlO1xuXHRcdFx0XHRxdWlja3BpY2suYnV0dG9ucyA9IHRoaXMub3B0aW9ucy5idXR0b25zID8/IFtdO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkVHJpZ2dlckJ1dHRvbihidXR0b24gPT4gdGhpcy5vcHRpb25zLm9uQnV0dG9uPy4oYnV0dG9uLCBxdWlja3BpY2spKSk7XG5cdFx0XHRcdHF1aWNrcGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkQWNjZXB0KGFzeW5jIF8gPT4ge1xuXHRcdFx0XHRcdGlzQ29tcGxldGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCB0aGVtZSA9IHF1aWNrcGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0XHRcdGlmICghdGhlbWUgfHwgdGhlbWUuY29uZmlndXJlSXRlbSkgeyAvLyAncGljayBpbiBtYXJrZXRwbGFjZScgZW50cnlcblx0XHRcdFx0XHRcdGlmICghdGhlbWUgfHwgdGhlbWUuY29uZmlndXJlSXRlbSA9PT0gQ29uZmlndXJlSXRlbS5FWFRFTlNJT05TX1ZJRVcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGAke3RoaXMub3B0aW9ucy5tYXJrZXRwbGFjZVRhZ30gJHtxdWlja3BpY2sudmFsdWV9YCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoZW1lLmNvbmZpZ3VyZUl0ZW0gPT09IENvbmZpZ3VyZUl0ZW0uQlJPV1NFX0dBTExFUlkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKG1hcmtldHBsYWNlVGhlbWVQaWNrZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBtYXJrZXRwbGFjZVRoZW1lUGlja2VyLm9wZW5RdWlja1BpY2socXVpY2twaWNrLnZhbHVlLCBjdXJyZW50VGhlbWUsIHNlbGVjdFRoZW1lKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocmVzID09PSAnYmFjaycpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IHBpY2tJbnN0YWxsZWRUaGVtZXModW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZWN0VGhlbWUodGhlbWUudGhlbWUsIHRydWUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHF1aWNrcGljay5oaWRlKCk7XG5cdFx0XHRcdFx0cygpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRDaGFuZ2VBY3RpdmUodGhlbWVzID0+IHNlbGVjdFRoZW1lKHRoZW1lc1swXT8udGhlbWUsIGZhbHNlKSkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc0NvbXBsZXRlZCkge1xuXHRcdFx0XHRcdFx0c2VsZWN0VGhlbWUoY3VycmVudFRoZW1lLCB0cnVlKTtcblx0XHRcdFx0XHRcdHMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cXVpY2twaWNrLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2twaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzSXRlbShlLml0ZW0pKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IGUuaXRlbS50aGVtZT8uZXh0ZW5zaW9uRGF0YT8uZXh0ZW5zaW9uSWQ7XG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAaWQ6JHtleHRlbnNpb25JZH1gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgJHt0aGlzLm9wdGlvbnMubWFya2V0cGxhY2VUYWd9ICR7cXVpY2twaWNrLnZhbHVlfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRxdWlja3BpY2suc2hvdygpO1xuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdFx0YXdhaXQgcGlja0luc3RhbGxlZFRoZW1lcyhjdXJyZW50VGhlbWUuaWQpO1xuXG5cdFx0bWFya2V0cGxhY2VUaGVtZVBpY2tlcj8uZGlzcG9zZSgpO1xuXG5cdH1cbn1cblxuY29uc3QgU2VsZWN0Q29sb3JUaGVtZUNvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnNlbGVjdFRoZW1lJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlbGVjdENvbG9yVGhlbWVDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWxlY3RUaGVtZS5sYWJlbCcsICdDb2xvciBUaGVtZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuUHJlZmVyZW5jZXMsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5VClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGl0bGUoY29sb3JTY2hlbWU6IENvbG9yU2NoZW1lIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGNvbG9yU2NoZW1lKSB7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkRBUks6IHJldHVybiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdFRoZW1lLmRhcmtTY2hlbWUnLCBcIlNlbGVjdCBDb2xvciBUaGVtZSBmb3IgU3lzdGVtIERhcmsgTW9kZVwiKTtcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuTElHSFQ6IHJldHVybiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdFRoZW1lLmxpZ2h0U2NoZW1lJywgXCJTZWxlY3QgQ29sb3IgVGhlbWUgZm9yIFN5c3RlbSBMaWdodCBNb2RlXCIpO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0RBUks6IHJldHVybiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdFRoZW1lLmRhcmtIQycsIFwiU2VsZWN0IENvbG9yIFRoZW1lIGZvciBIaWdoIENvbnRyYXN0IERhcmsgTW9kZVwiKTtcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9MSUdIVDogcmV0dXJuIGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0VGhlbWUubGlnaHRIQycsIFwiU2VsZWN0IENvbG9yIFRoZW1lIGZvciBIaWdoIENvbnRyYXN0IExpZ2h0IE1vZGVcIik7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RUaGVtZS5kZWZhdWx0JywgXCJTZWxlY3QgQ29sb3IgVGhlbWUgKGRldGVjdCBzeXN0ZW0gY29sb3IgbW9kZSBkaXNhYmxlZClcIik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByZWZlcnJlZENvbG9yU2NoZW1lID0gdGhlbWVTZXJ2aWNlLmdldFByZWZlcnJlZENvbG9yU2NoZW1lKCk7XG5cblx0XHRjb25zdCBtb2RlQ29uZmlndXJlQnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0XHRcdHRvb2x0aXA6IHByZWZlcnJlZENvbG9yU2NoZW1lXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3RoZW1lcy5jb25maWd1cmUuc3dpdGNoaW5nRW5hYmxlZCcsICdEZXRlY3Qgc3lzdGVtIGNvbG9yIG1vZGUgZW5hYmxlZC4gQ2xpY2sgdG8gY29uZmlndXJlLicpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3RoZW1lcy5jb25maWd1cmUuc3dpdGNoaW5nRGlzYWJsZWQnLCAnRGV0ZWN0IHN5c3RlbSBjb2xvciBtb2RlIGRpc2FibGVkLiBDbGljayB0byBjb25maWd1cmUuJyksXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNvbG9yTW9kZSksXG5cdFx0XHRsb2NhdGlvbjogUXVpY2tJbnB1dEJ1dHRvbkxvY2F0aW9uLklubGluZVxuXHRcdH07XG5cblx0XHRjb25zdCBvcHRpb25zID0ge1xuXHRcdFx0aW5zdGFsbE1lc3NhZ2U6IGxvY2FsaXplKCdpbnN0YWxsQ29sb3JUaGVtZXMnLCBcIkluc3RhbGwgQWRkaXRpb25hbCBDb2xvciBUaGVtZXMuLi5cIiksXG5cdFx0XHRicm93c2VNZXNzYWdlOiAnJChwbHVzKSAnICsgbG9jYWxpemUoJ2Jyb3dzZUNvbG9yVGhlbWVzJywgXCJCcm93c2UgQWRkaXRpb25hbCBDb2xvciBUaGVtZXMuLi5cIiksXG5cdFx0XHRwbGFjZWhvbGRlck1lc3NhZ2U6IHRoaXMuZ2V0VGl0bGUocHJlZmVycmVkQ29sb3JTY2hlbWUpLFxuXHRcdFx0bWFya2V0cGxhY2VUYWc6ICdjYXRlZ29yeTp0aGVtZXMnLFxuXHRcdFx0YnV0dG9uczogW21vZGVDb25maWd1cmVCdXR0b25dLFxuXHRcdFx0b25CdXR0b246IGFzeW5jIChfYnV0dG9uLCBwaWNrZXIpID0+IHtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0YXdhaXQgcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IHF1ZXJ5OiBUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUgfSk7XG5cdFx0XHR9XG5cdFx0fSBzYXRpc2ZpZXMgSW5zdGFsbGVkVGhlbWVzUGlja2VyT3B0aW9ucztcblx0XHRjb25zdCBzZXRUaGVtZSA9ICh0aGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KSA9PiB0aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZSBhcyBJV29ya2JlbmNoQ29sb3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdGNvbnN0IGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMgPSAocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKSA9PiB0aGVtZVNlcnZpY2UuZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyhwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwaWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsZWRUaGVtZXNQaWNrZXIsIG9wdGlvbnMsIHNldFRoZW1lLCBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKTtcblxuXHRcdGNvbnN0IHRoZW1lcyA9IGF3YWl0IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpO1xuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cblx0XHRjb25zdCBsaWdodEVudHJpZXMgPSB0b0VudHJpZXModGhlbWVzLmZpbHRlcih0ID0+IHQudHlwZSA9PT0gQ29sb3JTY2hlbWUuTElHSFQpLCBsb2NhbGl6ZSgndGhlbWVzLmNhdGVnb3J5LmxpZ2h0JywgXCJsaWdodCB0aGVtZXNcIikpO1xuXHRcdGNvbnN0IGRhcmtFbnRyaWVzID0gdG9FbnRyaWVzKHRoZW1lcy5maWx0ZXIodCA9PiB0LnR5cGUgPT09IENvbG9yU2NoZW1lLkRBUkspLCBsb2NhbGl6ZSgndGhlbWVzLmNhdGVnb3J5LmRhcmsnLCBcImRhcmsgdGhlbWVzXCIpKTtcblx0XHRjb25zdCBoY0VudHJpZXMgPSB0b0VudHJpZXModGhlbWVzLmZpbHRlcih0ID0+IGlzSGlnaENvbnRyYXN0KHQudHlwZSkpLCBsb2NhbGl6ZSgndGhlbWVzLmNhdGVnb3J5LmhjJywgXCJoaWdoIGNvbnRyYXN0IHRoZW1lc1wiKSk7XG5cblx0XHRsZXQgcGlja3M7XG5cdFx0c3dpdGNoIChwcmVmZXJyZWRDb2xvclNjaGVtZSkge1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5EQVJLOlxuXHRcdFx0XHRwaWNrcyA9IFsuLi5kYXJrRW50cmllcywgLi4ubGlnaHRFbnRyaWVzLCAuLi5oY0VudHJpZXNdO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLOlxuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUOlxuXHRcdFx0XHRwaWNrcyA9IFsuLi5oY0VudHJpZXMsIC4uLmxpZ2h0RW50cmllcywgLi4uZGFya0VudHJpZXNdO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuTElHSFQ6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRwaWNrcyA9IFsuLi5saWdodEVudHJpZXMsIC4uLmRhcmtFbnRyaWVzLCAuLi5oY0VudHJpZXNdO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0YXdhaXQgcGlja2VyLm9wZW5RdWlja1BpY2socGlja3MsIGN1cnJlbnRUaGVtZSk7XG5cblx0fVxufSk7XG5cbmNvbnN0IFNlbGVjdEZpbGVJY29uVGhlbWVDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi5zZWxlY3RJY29uVGhlbWUnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2VsZWN0RmlsZUljb25UaGVtZUNvbW1hbmRJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3NlbGVjdEljb25UaGVtZS5sYWJlbCcsICdGaWxlIEljb24gVGhlbWUnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlByZWZlcmVuY2VzLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRpbnN0YWxsTWVzc2FnZTogbG9jYWxpemUoJ2luc3RhbGxJY29uVGhlbWVzJywgXCJJbnN0YWxsIEFkZGl0aW9uYWwgRmlsZSBJY29uIFRoZW1lcy4uLlwiKSxcblx0XHRcdHBsYWNlaG9sZGVyTWVzc2FnZTogbG9jYWxpemUoJ3RoZW1lcy5zZWxlY3RJY29uVGhlbWUnLCBcIlNlbGVjdCBGaWxlIEljb24gVGhlbWUgKFVwL0Rvd24gS2V5cyB0byBQcmV2aWV3KVwiKSxcblx0XHRcdG1hcmtldHBsYWNlVGFnOiAndGFnOmljb24tdGhlbWUnXG5cdFx0fTtcblx0XHRjb25zdCBzZXRUaGVtZSA9ICh0aGVtZTogSVdvcmtiZW5jaFRoZW1lIHwgdW5kZWZpbmVkLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KSA9PiB0aGVtZVNlcnZpY2Uuc2V0RmlsZUljb25UaGVtZSh0aGVtZSBhcyBJV29ya2JlbmNoRmlsZUljb25UaGVtZSwgc2V0dGluZ3NUYXJnZXQpO1xuXHRcdGNvbnN0IGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMgPSAocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKSA9PiB0aGVtZVNlcnZpY2UuZ2V0TWFya2V0cGxhY2VGaWxlSWNvblRoZW1lcyhwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBwaWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsZWRUaGVtZXNQaWNrZXIsIG9wdGlvbnMsIHNldFRoZW1lLCBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKTtcblxuXHRcdGNvbnN0IHBpY2tzOiBRdWlja1BpY2tJbnB1dDxUaGVtZUl0ZW0+W10gPSBbXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2ZpbGVJY29uVGhlbWVDYXRlZ29yeScsICdmaWxlIGljb24gdGhlbWVzJykgfSxcblx0XHRcdHsgaWQ6ICcnLCB0aGVtZTogRmlsZUljb25UaGVtZURhdGEubm9JY29uVGhlbWUsIGxhYmVsOiBsb2NhbGl6ZSgnbm9JY29uVGhlbWVMYWJlbCcsICdOb25lJyksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm9JY29uVGhlbWVEZXNjJywgJ0Rpc2FibGUgRmlsZSBJY29ucycpIH0sXG5cdFx0XHQuLi50b0VudHJpZXMoYXdhaXQgdGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWVzKCkpLFxuXHRcdF07XG5cblx0XHRhd2FpdCBwaWNrZXIub3BlblF1aWNrUGljayhwaWNrcywgdGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWUoKSk7XG5cdH1cbn0pO1xuXG5jb25zdCBTZWxlY3RQcm9kdWN0SWNvblRoZW1lQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24uc2VsZWN0UHJvZHVjdEljb25UaGVtZSc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTZWxlY3RQcm9kdWN0SWNvblRoZW1lQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2VsZWN0UHJvZHVjdEljb25UaGVtZS5sYWJlbCcsICdQcm9kdWN0IEljb24gVGhlbWUnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlByZWZlcmVuY2VzLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRpbnN0YWxsTWVzc2FnZTogbG9jYWxpemUoJ2luc3RhbGxQcm9kdWN0SWNvblRoZW1lcycsIFwiSW5zdGFsbCBBZGRpdGlvbmFsIFByb2R1Y3QgSWNvbiBUaGVtZXMuLi5cIiksXG5cdFx0XHRicm93c2VNZXNzYWdlOiAnJChwbHVzKSAnICsgbG9jYWxpemUoJ2Jyb3dzZVByb2R1Y3RJY29uVGhlbWVzJywgXCJCcm93c2UgQWRkaXRpb25hbCBQcm9kdWN0IEljb24gVGhlbWVzLi4uXCIpLFxuXHRcdFx0cGxhY2Vob2xkZXJNZXNzYWdlOiBsb2NhbGl6ZSgndGhlbWVzLnNlbGVjdFByb2R1Y3RJY29uVGhlbWUnLCBcIlNlbGVjdCBQcm9kdWN0IEljb24gVGhlbWUgKFVwL0Rvd24gS2V5cyB0byBQcmV2aWV3KVwiKSxcblx0XHRcdG1hcmtldHBsYWNlVGFnOiAndGFnOnByb2R1Y3QtaWNvbi10aGVtZSdcblx0XHR9O1xuXHRcdGNvbnN0IHNldFRoZW1lID0gKHRoZW1lOiBJV29ya2JlbmNoVGhlbWUgfCB1bmRlZmluZWQsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQpID0+IHRoZW1lU2VydmljZS5zZXRQcm9kdWN0SWNvblRoZW1lKHRoZW1lIGFzIElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cdFx0Y29uc3QgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyA9IChwdWJsaXNoZXI6IHN0cmluZywgbmFtZTogc3RyaW5nLCB2ZXJzaW9uOiBzdHJpbmcpID0+IHRoZW1lU2VydmljZS5nZXRNYXJrZXRwbGFjZVByb2R1Y3RJY29uVGhlbWVzKHB1Ymxpc2hlciwgbmFtZSwgdmVyc2lvbik7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxlZFRoZW1lc1BpY2tlciwgb3B0aW9ucywgc2V0VGhlbWUsIGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMpO1xuXG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0PFRoZW1lSXRlbT5bXSA9IFtcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgncHJvZHVjdEljb25UaGVtZUNhdGVnb3J5JywgJ3Byb2R1Y3QgaWNvbiB0aGVtZXMnKSB9LFxuXHRcdFx0eyBpZDogREVGQVVMVF9QUk9EVUNUX0lDT05fVEhFTUVfSUQsIHRoZW1lOiBQcm9kdWN0SWNvblRoZW1lRGF0YS5kZWZhdWx0VGhlbWUsIGxhYmVsOiBsb2NhbGl6ZSgnZGVmYXVsdFByb2R1Y3RJY29uVGhlbWVMYWJlbCcsICdEZWZhdWx0JykgfSxcblx0XHRcdC4uLnRvRW50cmllcyhhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZXMoKSksXG5cdFx0XTtcblxuXHRcdGF3YWl0IHBpY2tlci5vcGVuUXVpY2tQaWNrKHBpY2tzLCB0aGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZSgpKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udHJ5TmV3RGVmYXVsdFRoZW1lcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0cnlOZXdEZWZhdWx0VGhlbWVzJywgXCJUcnkgTmV3IERlZmF1bHQgVGhlbWVzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuUHJlZmVyZW5jZXMsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNUaGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgYWxsVGhlbWVzID0gYXdhaXQgdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0Y29uc3QgbmV3VGhlbWVTZXR0aW5nc0lkcyA9IG5ldyBTZXQoW1RoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hULCBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLXSk7XG5cdFx0Y29uc3QgdGhlbWVzID0gYWxsVGhlbWVzLmZpbHRlcih0ID0+IG5ld1RoZW1lU2V0dGluZ3NJZHMuaGFzKHQuc2V0dGluZ3NJZCkpO1xuXG5cdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSB0aGVtZXMubWFwKHQgPT4gKHtcblx0XHRcdGlkOiB0LmlkLFxuXHRcdFx0bGFiZWw6IHQubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogdC5kZXNjcmlwdGlvbixcblx0XHR9KSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPigpKTtcblx0XHRwaWNrZXIuaXRlbXMgPSBpdGVtcztcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgncGlja05ld1RoZW1lJywgXCJQaWNrIGEgbmV3IGRlZmF1bHQgdGhlbWVcIik7XG5cdFx0cGlja2VyLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHByZWZlcnJlZElkID0gKHByZXZpb3VzVGhlbWUudHlwZSA9PT0gQ29sb3JTY2hlbWUuTElHSFQgfHwgcHJldmlvdXNUaGVtZS50eXBlID09PSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUKSA/IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUIDogVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSztcblx0XHRjb25zdCBhY3RpdmVJdGVtID0gaXRlbXMuZmluZChpID0+IHRoZW1lcy5maW5kKHQgPT4gdC5pZCA9PT0gaS5pZCk/LnNldHRpbmdzSWQgPT09IHByZWZlcnJlZElkKTtcblx0XHRpZiAoYWN0aXZlSXRlbSkge1xuXHRcdFx0cGlja2VyLmFjdGl2ZUl0ZW1zID0gW2FjdGl2ZUl0ZW1dO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRDaGFuZ2VBY3RpdmUoc2VsZWN0ZWQgPT4ge1xuXHRcdFx0aWYgKHNlbGVjdGVkWzBdKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lID0gdGhlbWVzLmZpbmQodCA9PiB0LmlkID09PSBzZWxlY3RlZFswXS5pZCk7XG5cdFx0XHRcdGlmICh0aGVtZSkge1xuXHRcdFx0XHRcdHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKHRoZW1lLCAncHJldmlldycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHBpY2tlci5hY3RpdmVJdGVtc1swXTtcblx0XHRcdGNvbnN0IHRoZW1lID0gc2VsZWN0ZWQgPyB0aGVtZXMuZmluZCh0ID0+IHQuaWQgPT09IHNlbGVjdGVkLmlkKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0cGlja2VyLmhpZGUoKTtcblxuXHRcdFx0aWYgKCF0aGVtZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWUsICdhdXRvJyk7XG5cdFx0XHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfTElHSFRfVEhFTUUsIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUKTtcblx0XHRcdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9EQVJLX1RIRU1FLCBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXBpY2tlci5zZWxlY3RlZEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKHByZXZpb3VzVGhlbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHBpY2tlci5zaG93KCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ucHJldmlld0NvbG9yVGhlbWUnLCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGV4dGVuc2lvbjogeyBwdWJsaXNoZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nOyB2ZXJzaW9uOiBzdHJpbmcgfSwgdGhlbWVTZXR0aW5nc0lkPzogc3RyaW5nKSB7XG5cdGNvbnN0IHRoZW1lU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoVGhlbWVTZXJ2aWNlKTtcblxuXHRsZXQgdGhlbWVzID0gZmluZEJ1aWx0SW5UaGVtZXMoYXdhaXQgdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCksIGV4dGVuc2lvbik7XG5cdGlmICh0aGVtZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhlbWVzID0gYXdhaXQgdGhlbWVTZXJ2aWNlLmdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMoZXh0ZW5zaW9uLnB1Ymxpc2hlciwgZXh0ZW5zaW9uLm5hbWUsIGV4dGVuc2lvbi52ZXJzaW9uKTtcblx0fVxuXHRmb3IgKGNvbnN0IHRoZW1lIG9mIHRoZW1lcykge1xuXHRcdGlmICghdGhlbWVTZXR0aW5nc0lkIHx8IHRoZW1lLnNldHRpbmdzSWQgPT09IHRoZW1lU2V0dGluZ3NJZCkge1xuXHRcdFx0YXdhaXQgdGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUodGhlbWUsICdwcmV2aWV3Jyk7XG5cdFx0XHRyZXR1cm4gdGhlbWUuc2V0dGluZ3NJZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn0pO1xuXG5mdW5jdGlvbiBmaW5kQnVpbHRJblRoZW1lcyh0aGVtZXM6IElXb3JrYmVuY2hDb2xvclRoZW1lW10sIGV4dGVuc2lvbjogeyBwdWJsaXNoZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0pOiBJV29ya2JlbmNoQ29sb3JUaGVtZVtdIHtcblx0cmV0dXJuIHRoZW1lcy5maWx0ZXIoKHsgZXh0ZW5zaW9uRGF0YSB9KSA9PiBleHRlbnNpb25EYXRhICYmIGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uSXNCdWlsdGluICYmIGVxdWFsc0lnbm9yZUNhc2UoZXh0ZW5zaW9uRGF0YS5leHRlbnNpb25QdWJsaXNoZXIsIGV4dGVuc2lvbi5wdWJsaXNoZXIpICYmIGVxdWFsc0lnbm9yZUNhc2UoZXh0ZW5zaW9uRGF0YS5leHRlbnNpb25OYW1lLCBleHRlbnNpb24ubmFtZSkpO1xufVxuXG5mdW5jdGlvbiBjb25maWd1cmF0aW9uRW50cnkobGFiZWw6IHN0cmluZywgY29uZmlndXJlSXRlbTogQ29uZmlndXJlSXRlbSk6IFF1aWNrUGlja0lucHV0PFRoZW1lSXRlbT4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiB1bmRlZmluZWQsXG5cdFx0bGFiZWw6IGxhYmVsLFxuXHRcdGFsd2F5c1Nob3c6IHRydWUsXG5cdFx0YnV0dG9uczogW2NvbmZpZ3VyZUJ1dHRvbl0sXG5cdFx0Y29uZmlndXJlSXRlbTogY29uZmlndXJlSXRlbVxuXHR9O1xufVxuXG5pbnRlcmZhY2UgVGhlbWVJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0aGVtZT86IElXb3JrYmVuY2hUaGVtZTtcblx0cmVhZG9ubHkgZ2FsbGVyeUV4dGVuc2lvbj86IElHYWxsZXJ5RXh0ZW5zaW9uO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgYWx3YXlzU2hvdz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNvbmZpZ3VyZUl0ZW0/OiBDb25maWd1cmVJdGVtO1xufVxuXG5mdW5jdGlvbiBpc0l0ZW0oaTogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPik6IGkgaXMgVGhlbWVJdGVtIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHJldHVybiAoPGFueT5pKVsndHlwZSddICE9PSAnc2VwYXJhdG9yJztcbn1cblxuY29uc3QgZGVmYXVsdFRoZW1lRGVzY3JpcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRbVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfTElHSFRdOiBsb2NhbGl6ZSgnZGVmYXVsdExpZ2h0JywgXCJEZWZhdWx0IExpZ2h0XCIpLFxuXHRbVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSS106IGxvY2FsaXplKCdkZWZhdWx0RGFyaycsIFwiRGVmYXVsdCBEYXJrXCIpLFxufTtcblxuZnVuY3Rpb24gdG9FbnRyeSh0aGVtZTogSVdvcmtiZW5jaFRoZW1lKTogVGhlbWVJdGVtIHtcblx0Y29uc3Qgc2V0dGluZ0lkID0gdGhlbWUuc2V0dGluZ3NJZCA/PyB1bmRlZmluZWQ7XG5cdGNvbnN0IGl0ZW06IFRoZW1lSXRlbSA9IHtcblx0XHRpZDogdGhlbWUuaWQsXG5cdFx0dGhlbWU6IHRoZW1lLFxuXHRcdGxhYmVsOiB0aGVtZS5sYWJlbCxcblx0XHRkZXNjcmlwdGlvbjogZGVmYXVsdFRoZW1lRGVzY3JpcHRpb25zW3NldHRpbmdJZCA/PyAnJ10gPz8gdGhlbWUuZGVzY3JpcHRpb24gPz8gKHRoZW1lLmxhYmVsID09PSBzZXR0aW5nSWQgPyB1bmRlZmluZWQgOiBzZXR0aW5nSWQpLFxuXHR9O1xuXHRpZiAodGhlbWUuZXh0ZW5zaW9uRGF0YSkge1xuXHRcdGl0ZW0uYnV0dG9ucyA9IFtjb25maWd1cmVCdXR0b25dO1xuXHR9XG5cdHJldHVybiBpdGVtO1xufVxuXG5mdW5jdGlvbiB0b0VudHJpZXModGhlbWVzOiBBcnJheTxJV29ya2JlbmNoVGhlbWU+LCBsYWJlbD86IHN0cmluZyk6IFF1aWNrUGlja0lucHV0PFRoZW1lSXRlbT5bXSB7XG5cdGNvbnN0IHBpbm5lZElkcyA9IG5ldyBTZXQoW1RoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUkssIFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUXSk7XG5cdGNvbnN0IHNvcnRlciA9ICh0MTogVGhlbWVJdGVtLCB0MjogVGhlbWVJdGVtKSA9PiB7XG5cdFx0Y29uc3QgcGluMSA9IHBpbm5lZElkcy5oYXModDEudGhlbWU/LnNldHRpbmdzSWQgPz8gJycpO1xuXHRcdGNvbnN0IHBpbjIgPSBwaW5uZWRJZHMuaGFzKHQyLnRoZW1lPy5zZXR0aW5nc0lkID8/ICcnKTtcblx0XHRpZiAocGluMSAhPT0gcGluMikge1xuXHRcdFx0cmV0dXJuIHBpbjEgPyAtMSA6IDE7XG5cdFx0fVxuXHRcdHJldHVybiB0MS5sYWJlbC5sb2NhbGVDb21wYXJlKHQyLmxhYmVsKTtcblx0fTtcblx0Y29uc3QgZW50cmllczogUXVpY2tQaWNrSW5wdXQ8VGhlbWVJdGVtPltdID0gdGhlbWVzLm1hcCh0b0VudHJ5KS5zb3J0KHNvcnRlcik7XG5cdGlmIChlbnRyaWVzLmxlbmd0aCA+IDAgJiYgbGFiZWwpIHtcblx0XHRlbnRyaWVzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWwgfSk7XG5cdH1cblx0cmV0dXJuIGVudHJpZXM7XG59XG5cbmNvbnN0IGNvbmZpZ3VyZUJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1hbmFnZUV4dGVuc2lvbkljb24pLFxuXHR0b29sdGlwOiBsb2NhbGl6ZSgnbWFuYWdlIGV4dGVuc2lvbicsIFwiTWFuYWdlIEV4dGVuc2lvblwiKSxcbn07XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uZ2VuZXJhdGVDb2xvclRoZW1lJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlQ29sb3JUaGVtZS5sYWJlbCcsICdHZW5lcmF0ZSBDb2xvciBUaGVtZSBGcm9tIEN1cnJlbnQgU2V0dGluZ3MnKSxcblx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cblx0XHRjb25zdCB0aGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgY29sb3JzID0gUmVnaXN0cnkuYXM8SUNvbG9yUmVnaXN0cnk+KENvbG9yUmVnaXN0cnlFeHRlbnNpb25zLkNvbG9yQ29udHJpYnV0aW9uKS5nZXRDb2xvcnMoKTtcblx0XHRjb25zdCBjb2xvcklkcyA9IGNvbG9ycy5maWx0ZXIoYyA9PiAhYy5kZXByZWNhdGlvbk1lc3NhZ2UpLm1hcChjID0+IGMuaWQpLnNvcnQoKTtcblx0XHRjb25zdCByZXN1bHRpbmdDb2xvcnM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgbnVsbCB9ID0ge307XG5cdFx0Y29uc3QgaW5oZXJpdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29sb3JJZCBvZiBjb2xvcklkcykge1xuXHRcdFx0Y29uc3QgY29sb3IgPSB0aGVtZS5nZXRDb2xvcihjb2xvcklkLCBmYWxzZSk7XG5cdFx0XHRpZiAoY29sb3IpIHtcblx0XHRcdFx0cmVzdWx0aW5nQ29sb3JzW2NvbG9ySWRdID0gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGNvbG9yLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluaGVyaXRlZC5wdXNoKGNvbG9ySWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBudWxsRGVmYXVsdHMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGluaGVyaXRlZCkge1xuXHRcdFx0Y29uc3QgY29sb3IgPSB0aGVtZS5nZXRDb2xvcihpZCk7XG5cdFx0XHRpZiAoY29sb3IpIHtcblx0XHRcdFx0cmVzdWx0aW5nQ29sb3JzWydfXycgKyBpZF0gPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoY29sb3IsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bnVsbERlZmF1bHRzLnB1c2goaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGlkIG9mIG51bGxEZWZhdWx0cykge1xuXHRcdFx0cmVzdWx0aW5nQ29sb3JzWydfXycgKyBpZF0gPSBudWxsO1xuXHRcdH1cblx0XHRsZXQgY29udGVudHMgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQnJHNjaGVtYSc6IGNvbG9yVGhlbWVTY2hlbWFJZCxcblx0XHRcdHR5cGU6IHRoZW1lLnR5cGUsXG5cdFx0XHRjb2xvcnM6IHJlc3VsdGluZ0NvbG9ycyxcblx0XHRcdHRva2VuQ29sb3JzOiB0aGVtZS50b2tlbkNvbG9ycy5maWx0ZXIodCA9PiAhIXQuc2NvcGUpXG5cdFx0fSwgbnVsbCwgJ1xcdCcpO1xuXHRcdGNvbnRlbnRzID0gY29udGVudHMucmVwbGFjZSgvXFxcIl9fL2csICcvL1wiJyk7XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRyZXR1cm4gZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVuZGVmaW5lZCwgY29udGVudHMsIGxhbmd1YWdlSWQ6ICdqc29uYycsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH0gfSk7XG5cdH1cbn0pO1xuXG5jb25zdCB0b2dnbGVMaWdodERhcmtUaGVtZXNDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVMaWdodERhcmtUaGVtZXMnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogdG9nZ2xlTGlnaHREYXJrVGhlbWVzQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlTGlnaHREYXJrVGhlbWVzLmxhYmVsJywgJ1RvZ2dsZSBiZXR3ZWVuIExpZ2h0L0RhcmsgVGhlbWVzJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5QcmVmZXJlbmNlcyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgdGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRoZW1lU2V0dGluZ3MuREVURUNUX0NPTE9SX1NDSEVNRSkpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSh7IGtleTogJ2Nhbm5vdFRvZ2dsZScsIGNvbW1lbnQ6IFsnezB9IGlzIGEgc2V0dGluZyBuYW1lJ10gfSwgXCJDYW5ub3QgdG9nZ2xlIGJldHdlZW4gbGlnaHQgYW5kIGRhcmsgdGhlbWVzIHdoZW4gYHswfWAgaXMgZW5hYmxlZCBpbiBzZXR0aW5ncy5cIiwgVGhlbWVTZXR0aW5ncy5ERVRFQ1RfQ09MT1JfU0NIRU1FKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkluZm8sIG1lc3NhZ2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ29Ub1NldHRpbmcnLCBcIk9wZW4gU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3MoeyBxdWVyeTogVGhlbWVTZXR0aW5ncy5ERVRFQ1RfQ09MT1JfU0NIRU1FIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRsZXQgbmV3U2V0dGluZ3NJZDogc3RyaW5nID0gVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfREFSS19USEVNRTtcblx0XHRzd2l0Y2ggKGN1cnJlbnRUaGVtZS50eXBlKSB7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkxJR0hUOlxuXHRcdFx0XHRuZXdTZXR0aW5nc0lkID0gVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfREFSS19USEVNRTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkRBUks6XG5cdFx0XHRcdG5ld1NldHRpbmdzSWQgPSBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9MSUdIVF9USEVNRTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFQ6XG5cdFx0XHRcdG5ld1NldHRpbmdzSWQgPSBUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19EQVJLX1RIRU1FO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLOlxuXHRcdFx0XHRuZXdTZXR0aW5nc0lkID0gVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfSENfTElHSFRfVEhFTUU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRoZW1lU2V0dGluZ0lkOiBzdHJpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShuZXdTZXR0aW5nc0lkKTtcblxuXHRcdGlmICh0aGVtZVNldHRpbmdJZCAmJiB0eXBlb2YgdGhlbWVTZXR0aW5nSWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCB0aGVtZSA9IChhd2FpdCB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKSkuZmluZCh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhlbWVTZXR0aW5nSWQpO1xuXHRcdFx0aWYgKHRoZW1lKSB7XG5cdFx0XHRcdHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKHRoZW1lLmlkLCAnYXV0bycpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IGJyb3dzZUNvbG9yVGhlbWVzSW5NYXJrZXRwbGFjZUNvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLmJyb3dzZUNvbG9yVGhlbWVzSW5NYXJrZXRwbGFjZSc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBicm93c2VDb2xvclRoZW1lc0luTWFya2V0cGxhY2VDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VDb2xvclRoZW1lSW5NYXJrZXRQbGFjZS5sYWJlbCcsICdCcm93c2UgQ29sb3IgVGhlbWVzIGluIE1hcmtldHBsYWNlJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5QcmVmZXJlbmNlcyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2VUYWcgPSAnY2F0ZWdvcnk6dGhlbWVzJztcblx0XHRjb25zdCB0aGVtZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaFRoZW1lU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlKTtcblx0XHRjb25zdCBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKCFleHRlbnNpb25HYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnN1cHBvcnRzRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlcygpKSB7XG5cdFx0XHRhd2FpdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKG1hcmtldHBsYWNlVGFnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VGhlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGdldE1hcmtldHBsYWNlQ29sb3JUaGVtZXMgPSAocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKSA9PiB0aGVtZVNlcnZpY2UuZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcyhwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24pO1xuXG5cdFx0bGV0IHNlbGVjdFRoZW1lVGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2VsZWN0VGhlbWUgPSAodGhlbWU6IElXb3JrYmVuY2hUaGVtZSB8IHVuZGVmaW5lZCwgYXBwbHlUaGVtZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKHNlbGVjdFRoZW1lVGltZW91dCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQoc2VsZWN0VGhlbWVUaW1lb3V0KTtcblx0XHRcdH1cblx0XHRcdHNlbGVjdFRoZW1lVGltZW91dCA9IG1haW5XaW5kb3cuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHNlbGVjdFRoZW1lVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgbmV3VGhlbWUgPSAodGhlbWUgPz8gY3VycmVudFRoZW1lKSBhcyBJV29ya2JlbmNoVGhlbWU7XG5cdFx0XHRcdHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKG5ld1RoZW1lIGFzIElXb3JrYmVuY2hDb2xvclRoZW1lLCBhcHBseVRoZW1lID8gJ2F1dG8nIDogJ3ByZXZpZXcnKS50aGVuKHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdHRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKGN1cnJlbnRUaGVtZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9LCBhcHBseVRoZW1lID8gMCA6IDIwMCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hcmtldHBsYWNlVGhlbWVQaWNrZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXRwbGFjZVRoZW1lc1BpY2tlciwgZ2V0TWFya2V0cGxhY2VDb2xvclRoZW1lcywgbWFya2V0cGxhY2VUYWcpO1xuXHRcdGF3YWl0IG1hcmtldHBsYWNlVGhlbWVQaWNrZXIub3BlblF1aWNrUGljaygnJywgdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSwgc2VsZWN0VGhlbWUpLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cbn0pO1xuXG5jb25zdCBUaGVtZXNTdWJNZW51ID0gbmV3IE1lbnVJZCgnVGhlbWVzU3ViTWVudScpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5HbG9iYWxBY3Rpdml0eSwge1xuXHR0aXRsZTogbG9jYWxpemUoJ3RoZW1lcycsIFwiVGhlbWVzXCIpLFxuXHRzdWJtZW51OiBUaGVtZXNTdWJNZW51LFxuXHRncm91cDogJzJfY29uZmlndXJhdGlvbicsXG5cdG9yZGVyOiA3XG59IHNhdGlzZmllcyBJU3VibWVudUl0ZW0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU2VsZWN0VGhlbWUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUaGVtZXNcIiksXG5cdHN1Ym1lbnU6IFRoZW1lc1N1Yk1lbnUsXG5cdGdyb3VwOiAnMl9jb25maWd1cmF0aW9uJyxcblx0b3JkZXI6IDdcbn0gc2F0aXNmaWVzIElTdWJtZW51SXRlbSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShUaGVtZXNTdWJNZW51LCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2VsZWN0Q29sb3JUaGVtZUNvbW1hbmRJZCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3NlbGVjdFRoZW1lLmxhYmVsJywgJ0NvbG9yIFRoZW1lJylcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oVGhlbWVzU3ViTWVudSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNlbGVjdEZpbGVJY29uVGhlbWVDb21tYW5kSWQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0SWNvblRoZW1lLmxhYmVsJywgXCJGaWxlIEljb24gVGhlbWVcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oVGhlbWVzU3ViTWVudSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNlbGVjdFByb2R1Y3RJY29uVGhlbWVDb21tYW5kSWQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0aGVtZXMuc2VsZWN0UHJvZHVjdEljb25UaGVtZS5sYWJlbCcsIFwiUHJvZHVjdCBJY29uIFRoZW1lXCIpXG5cdH0sXG5cdG9yZGVyOiAzXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFFBQVEsVUFBVSxlQUFlO0FBQzFDLFNBQVMsY0FBYyxRQUFRLFNBQVMsdUJBQXFDO0FBQzdFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdJLGVBQWUsNEJBQTRCO0FBQzVMLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTBCLG1DQUFzRDtBQUN6RixTQUF5QixjQUFjLCtCQUErQjtBQUN0RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQix5QkFBeUI7QUFDdkQsU0FBNEIsb0JBQWdELGdDQUFnRDtBQUM1SCxTQUFTLCtCQUErQiw0QkFBNEI7QUFDcEUsU0FBUyx3QkFBd0I7QUFDakMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pD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LFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLFVBQVU7QUFBQSxFQUN4RixTQUFTO0FBQUEsRUFDVCxPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQ1IsQ0FBd0I7QUFFeEIsYUFBYSxlQUFlLGVBQWU7QUFBQSxFQUMxQyxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLFNBQVMscUJBQXFCLGFBQWE7QUFBQSxFQUNuRDtBQUFBLEVBQ0EsT0FBTztBQUNSLENBQUM7QUFFRCxhQUFhLGVBQWUsZUFBZTtBQUFBLEVBQzFDLFNBQVM7QUFBQSxJQUNSLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyxnQ0FBZ0MsaUJBQWlCO0FBQUEsRUFDbEU7QUFBQSxFQUNBLE9BQU87QUFDUixDQUFDO0FBRUQsYUFBYSxlQUFlLGVBQWU7QUFBQSxFQUMxQyxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLFNBQVMsdUNBQXVDLG9CQUFvQjtBQUFBLEVBQzVFO0FBQUEsRUFDQSxPQUFPO0FBQ1IsQ0FBQzsiLAogICJuYW1lcyI6IFsiQ29uZmlndXJlSXRlbSIsICJpIiwgIl8iLCAicGlja2VyIl0KfQo=
