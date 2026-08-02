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
import * as types from "../../../../base/common/types.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkbenchThemeService, ExtensionData, ThemeSettings, ThemeSettingDefaults, COLOR_THEME_DARK_INITIAL_COLORS, COLOR_THEME_LIGHT_INITIAL_COLORS, migrateThemeSettingsId } from "../common/workbenchThemeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import * as errors from "../../../../base/common/errors.js";
import { IConfigurationService, ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ColorThemeData } from "../common/colorThemeData.js";
import { Extensions as ThemingExtensions } from "../../../../platform/theme/common/themeService.js";
import { Emitter } from "../../../../base/common/event.js";
import { registerFileIconThemeSchemas } from "../common/fileIconThemeSchema.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileIconThemeData, FileIconThemeLoader } from "./fileIconThemeData.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { IFileService, FileChangeType } from "../../../../platform/files/common/files.js";
import * as resources from "../../../../base/common/resources.js";
import { registerColorThemeSchemas } from "../common/colorThemeSchema.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { getRemoteAuthority } from "../../../../platform/remote/common/remoteHosts.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { ThemeRegistry, registerColorThemeExtensionPoint, registerFileIconThemeExtensionPoint, registerProductIconThemeExtensionPoint } from "../common/themeExtensionPoints.js";
import { updateColorThemeConfigurationSchemas, updateFileIconThemeConfigurationSchemas, ThemeConfiguration, updateProductIconThemeConfigurationSchemas } from "../common/themeConfiguration.js";
import { ProductIconThemeData, DEFAULT_PRODUCT_ICON_THEME_ID } from "./productIconThemeData.js";
import { registerProductIconThemeSchemas } from "../common/productIconThemeSchema.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isWeb } from "../../../../base/common/platform.js";
import { ColorScheme, ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { IHostColorSchemeService } from "../common/hostColorSchemeService.js";
import { RunOnceScheduler, Sequencer } from "../../../../base/common/async.js";
import { IUserDataInitializationService } from "../../userData/browser/userDataInit.js";
import { getIconsStyleSheet } from "../../../../platform/theme/browser/iconsStyleSheet.js";
import { getColorRegistry } from "../../../../platform/theme/common/colorRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { generateColorThemeCSS } from "./colorThemeCss.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { toAction } from "../../../../base/common/actions.js";
const defaultThemeExtensionId = "vscode-theme-defaults";
const DEFAULT_FILE_ICON_THEME_ID = "vscode.vscode-theme-seti-vs-seti";
const fileIconsEnabledClass = "file-icons-enabled";
const colorThemeRulesClassName = "contributedColorTheme";
const fileIconThemeRulesClassName = "contributedFileIconTheme";
const productIconThemeRulesClassName = "contributedProductIconTheme";
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
function validateThemeId(theme) {
  switch (theme) {
    case ThemeTypeSelector.VS:
      return `vs ${defaultThemeExtensionId}-themes-light_vs-json`;
    case ThemeTypeSelector.VS_DARK:
      return `vs-dark ${defaultThemeExtensionId}-themes-dark_vs-json`;
    case ThemeTypeSelector.HC_BLACK:
      return `hc-black ${defaultThemeExtensionId}-themes-hc_black-json`;
    case ThemeTypeSelector.HC_LIGHT:
      return `hc-light ${defaultThemeExtensionId}-themes-hc_light-json`;
  }
  return theme;
}
const colorThemesExtPoint = registerColorThemeExtensionPoint();
const fileIconThemesExtPoint = registerFileIconThemeExtensionPoint();
const productIconThemesExtPoint = registerProductIconThemeExtensionPoint();
let WorkbenchThemeService = class extends Disposable {
  constructor(extensionService, storageService, configurationService, telemetryService, environmentService, fileService, extensionResourceLoaderService, layoutService, logService, hostColorService, userDataInitializationService, languageService, notificationService, hostService) {
    super();
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.environmentService = environmentService;
    this.extensionResourceLoaderService = extensionResourceLoaderService;
    this.logService = logService;
    this.hostColorService = hostColorService;
    this.userDataInitializationService = userDataInitializationService;
    this.languageService = languageService;
    this.notificationService = notificationService;
    this.hostService = hostService;
    this.themeExtensionsActivated = /* @__PURE__ */ new Map();
    this.container = layoutService.mainContainer;
    this.settings = new ThemeConfiguration(configurationService, hostColorService);
    this.colorThemeRegistry = this._register(new ThemeRegistry(colorThemesExtPoint, ColorThemeData.fromExtensionTheme));
    this.colorThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentColorTheme.bind(this)));
    this.onColorThemeChange = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ThemeService.onColorThemeChange" }));
    this.currentColorTheme = ColorThemeData.createUnloadedTheme("");
    this.colorThemeSequencer = new Sequencer();
    this.fileIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentFileIconTheme.bind(this)));
    this.fileIconThemeRegistry = this._register(new ThemeRegistry(fileIconThemesExtPoint, FileIconThemeData.fromExtensionTheme, true, FileIconThemeData.noIconTheme));
    this.fileIconThemeLoader = new FileIconThemeLoader(extensionResourceLoaderService, languageService);
    this.onFileIconThemeChange = this._register(new Emitter({ leakWarningThreshold: 400, leakWarningName: "ThemeService.onFileIconThemeChange" }));
    this.currentFileIconTheme = FileIconThemeData.createUnloadedTheme("");
    this.fileIconThemeSequencer = new Sequencer();
    this.productIconThemeWatcher = this._register(new ThemeFileWatcher(fileService, environmentService, this.reloadCurrentProductIconTheme.bind(this)));
    this.productIconThemeRegistry = this._register(new ThemeRegistry(productIconThemesExtPoint, ProductIconThemeData.fromExtensionTheme, true, ProductIconThemeData.defaultTheme));
    this.onProductIconThemeChange = this._register(new Emitter());
    this.currentProductIconTheme = ProductIconThemeData.createUnloadedTheme("");
    this.productIconThemeSequencer = new Sequencer();
    this._register(this.onDidColorThemeChange((theme) => getColorRegistry().notifyThemeUpdate(theme)));
    let themeData = ColorThemeData.fromStorageData(this.storageService);
    const previousColorThemeSetting = themeData?.settingsId;
    const colorThemeSetting = this.settings.colorTheme;
    if (themeData && colorThemeSetting !== themeData.settingsId) {
      themeData = void 0;
    }
    const defaultColorMap = colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_LIGHT ? COLOR_THEME_LIGHT_INITIAL_COLORS : colorThemeSetting === ThemeSettingDefaults.COLOR_THEME_DARK ? COLOR_THEME_DARK_INITIAL_COLORS : void 0;
    if (!themeData) {
      const initialColorTheme = environmentService.options?.initialColorTheme;
      if (initialColorTheme) {
        themeData = ColorThemeData.createUnloadedThemeForThemeType(initialColorTheme.themeType, initialColorTheme.colors ?? defaultColorMap);
      }
    }
    if (!themeData) {
      const colorScheme = this.settings.getPreferredColorScheme() ?? (isWeb ? ColorScheme.LIGHT : ColorScheme.DARK);
      themeData = ColorThemeData.createUnloadedThemeForThemeType(colorScheme, defaultColorMap);
    }
    themeData.setCustomizations(this.settings);
    this.applyTheme(themeData, void 0, true);
    const fileIconData = FileIconThemeData.fromStorageData(this.storageService);
    if (fileIconData) {
      this.applyAndSetFileIconTheme(fileIconData, true);
    }
    const productIconData = ProductIconThemeData.fromStorageData(this.storageService);
    if (productIconData) {
      this.applyAndSetProductIconTheme(productIconData, true);
    }
    extensionService.whenInstalledExtensionsRegistered().then((_) => {
      this.installConfigurationListener();
      this.installPreferredSchemeListener();
      this.installRegistryListeners();
      this.initialize(previousColorThemeSetting).catch(errors.onUnexpectedError);
    });
    const codiconStyleSheet = createStyleSheet();
    codiconStyleSheet.id = "codiconStyles";
    const iconsStyleSheet = this._register(getIconsStyleSheet(this));
    function updateAll() {
      codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
    }
    const delayer = this._register(new RunOnceScheduler(updateAll, 0));
    this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
    delayer.schedule();
  }
  async initialize(themePreviousSettingsId) {
    const extDevLocs = this.environmentService.extensionDevelopmentLocationURI;
    const extDevLoc = extDevLocs && extDevLocs.length === 1 ? extDevLocs[0] : void 0;
    const initializeColorTheme = async () => {
      const devThemes = this.colorThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        const matchedColorTheme = devThemes.find((theme2) => theme2.type === this.currentColorTheme.type);
        return this.setColorTheme(matchedColorTheme ? matchedColorTheme.id : devThemes[0].id, void 0);
      }
      let theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, void 0);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        const fallbackTheme = this.currentColorTheme.type === ColorScheme.LIGHT ? ThemeSettingDefaults.COLOR_THEME_LIGHT : ThemeSettingDefaults.COLOR_THEME_DARK;
        theme = this.colorThemeRegistry.findThemeBySettingsId(this.settings.colorTheme, fallbackTheme);
      }
      return this.setColorTheme(theme && theme.id, void 0);
    };
    const initializeFileIconTheme = async () => {
      const devThemes = this.fileIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        return this.setFileIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
      }
      let theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        theme = this.fileIconThemeRegistry.findThemeBySettingsId(this.settings.fileIconTheme);
      }
      return this.setFileIconTheme(theme ? theme.id : DEFAULT_FILE_ICON_THEME_ID, void 0);
    };
    const initializeProductIconTheme = async () => {
      const devThemes = this.productIconThemeRegistry.findThemeByExtensionLocation(extDevLoc);
      if (devThemes.length) {
        return this.setProductIconTheme(devThemes[0].id, ConfigurationTarget.MEMORY);
      }
      let theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
      if (!theme) {
        await this.userDataInitializationService.whenInitializationFinished();
        theme = this.productIconThemeRegistry.findThemeBySettingsId(this.settings.productIconTheme);
      }
      return this.setProductIconTheme(theme ? theme.id : DEFAULT_PRODUCT_ICON_THEME_ID, void 0);
    };
    this.migrateColorThemeSettings();
    const result = await Promise.all([initializeColorTheme(), initializeFileIconTheme(), initializeProductIconTheme()]);
    await this.showNewDefaultThemeNotification(themePreviousSettingsId);
    return result;
  }
  async showNewDefaultThemeNotification(previousSettingsId) {
    if (this.storageService.getBoolean(WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY, StorageScope.APPLICATION)) {
      return;
    }
    if (!await this.hostService.hadLastFocus() || this.environmentService.isSessionsWindow) {
      return;
    }
    try {
      if (!this.settings.isDefaultColorTheme() || !previousSettingsId) {
        return;
      }
      previousSettingsId = migrateThemeSettingsId(previousSettingsId);
      if (!["Dark Modern", "Light Modern"].includes(previousSettingsId)) {
        return;
      }
      if (![ThemeSettingDefaults.COLOR_THEME_DARK, ThemeSettingDefaults.COLOR_THEME_LIGHT].includes(this.settings.colorTheme)) {
        return;
      }
    } finally {
      this.storageService.store(WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
    }
    const keepTheme = await new Promise((resolve) => {
      this.notificationService.prompt(
        Severity.Info,
        nls.localize({ key: "themeUpdatedNotification", comment: ["{0} is the name of the new default theme"] }, "VS Code has a new default theme: '{0}'.", this.getColorTheme().label),
        [
          toAction({
            id: "themeUpdated.tryItOut",
            label: nls.localize("tryNewTheme", "Keep It"),
            run: () => resolve(true)
          }),
          toAction({
            id: "themeUpdated.noThanks",
            label: nls.localize("noThanks", "No Thanks"),
            run: () => resolve(false)
          })
        ],
        {
          onCancel: () => resolve(false)
        }
      );
    });
    if (!keepTheme) {
      const previousTheme = this.colorThemeRegistry.findThemeBySettingsId(previousSettingsId);
      if (previousTheme) {
        this.setColorTheme(previousTheme.id, "auto");
      }
    }
  }
  /**
   * Migrates legacy theme setting values to their current equivalents,
   * writing back the migrated value so settings sync distributes the correct ID.
   */
  migrateColorThemeSettings() {
    const themeSettings = [
      ThemeSettings.COLOR_THEME,
      ThemeSettings.PREFERRED_DARK_THEME,
      ThemeSettings.PREFERRED_LIGHT_THEME,
      ThemeSettings.PREFERRED_HC_DARK_THEME,
      ThemeSettings.PREFERRED_HC_LIGHT_THEME
    ];
    for (const key of themeSettings) {
      const inspection = this.configurationService.inspect(key);
      for (const [target, value] of [
        [ConfigurationTarget.USER, inspection.userValue],
        [ConfigurationTarget.USER_REMOTE, inspection.userRemoteValue],
        [ConfigurationTarget.WORKSPACE, inspection.workspaceValue]
      ]) {
        if (value) {
          const migrated = migrateThemeSettingsId(value);
          if (migrated !== value) {
            this.configurationService.updateValue(key, migrated, target);
          }
        }
      }
    }
  }
  installConfigurationListener() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ThemeSettings.COLOR_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_DARK_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_LIGHT_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_DARK_THEME) || e.affectsConfiguration(ThemeSettings.PREFERRED_HC_LIGHT_THEME) || e.affectsConfiguration(ThemeSettings.DETECT_COLOR_SCHEME) || e.affectsConfiguration(ThemeSettings.DETECT_HC) || e.affectsConfiguration(ThemeSettings.SYSTEM_COLOR_THEME)) {
        this.restoreColorTheme();
      }
      if (e.affectsConfiguration(ThemeSettings.FILE_ICON_THEME)) {
        this.restoreFileIconTheme();
      }
      if (e.affectsConfiguration(ThemeSettings.PRODUCT_ICON_THEME)) {
        this.restoreProductIconTheme();
      }
      if (this.currentColorTheme) {
        let hasColorChanges = false;
        if (e.affectsConfiguration(ThemeSettings.COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomColors(this.settings.colorCustomizations);
          hasColorChanges = true;
        }
        if (e.affectsConfiguration(ThemeSettings.TOKEN_COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomTokenColors(this.settings.tokenColorCustomizations);
          hasColorChanges = true;
        }
        if (e.affectsConfiguration(ThemeSettings.SEMANTIC_TOKEN_COLOR_CUSTOMIZATIONS)) {
          this.currentColorTheme.setCustomSemanticTokenColors(this.settings.semanticTokenColorCustomizations);
          hasColorChanges = true;
        }
        if (hasColorChanges) {
          this.updateDynamicCSSRules(this.currentColorTheme);
          this.onColorThemeChange.fire(this.currentColorTheme);
        }
      }
    }));
  }
  installRegistryListeners() {
    let prevColorId = void 0;
    this._register(this.colorThemeRegistry.onDidChange(async (event) => {
      updateColorThemeConfigurationSchemas(event.themes);
      if (await this.restoreColorTheme()) {
        if (this.currentColorTheme.settingsId === ThemeSettingDefaults.COLOR_THEME_DARK && !types.isUndefined(prevColorId) && await this.colorThemeRegistry.findThemeById(prevColorId)) {
          await this.setColorTheme(prevColorId, "auto");
          prevColorId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentColorTheme.settingsId)) {
          await this.reloadCurrentColorTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentColorTheme.settingsId)) {
        prevColorId = this.currentColorTheme.id;
        const defaultTheme = this.colorThemeRegistry.findThemeBySettingsId(ThemeSettingDefaults.COLOR_THEME_DARK);
        await this.setColorTheme(defaultTheme, "auto");
      }
    }));
    let prevFileIconId = void 0;
    this._register(this._register(this.fileIconThemeRegistry.onDidChange(async (event) => {
      updateFileIconThemeConfigurationSchemas(event.themes);
      if (await this.restoreFileIconTheme()) {
        if (this.currentFileIconTheme.id === DEFAULT_FILE_ICON_THEME_ID && !types.isUndefined(prevFileIconId) && this.fileIconThemeRegistry.findThemeById(prevFileIconId)) {
          await this.setFileIconTheme(prevFileIconId, "auto");
          prevFileIconId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentFileIconTheme.settingsId)) {
          await this.reloadCurrentFileIconTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentFileIconTheme.settingsId)) {
        prevFileIconId = this.currentFileIconTheme.id;
        await this.setFileIconTheme(DEFAULT_FILE_ICON_THEME_ID, "auto");
      }
    })));
    let prevProductIconId = void 0;
    this._register(this.productIconThemeRegistry.onDidChange(async (event) => {
      updateProductIconThemeConfigurationSchemas(event.themes);
      if (await this.restoreProductIconTheme()) {
        if (this.currentProductIconTheme.id === DEFAULT_PRODUCT_ICON_THEME_ID && !types.isUndefined(prevProductIconId) && this.productIconThemeRegistry.findThemeById(prevProductIconId)) {
          await this.setProductIconTheme(prevProductIconId, "auto");
          prevProductIconId = void 0;
        } else if (event.added.some((t) => t.settingsId === this.currentProductIconTheme.settingsId)) {
          await this.reloadCurrentProductIconTheme();
        }
      } else if (event.removed.some((t) => t.settingsId === this.currentProductIconTheme.settingsId)) {
        prevProductIconId = this.currentProductIconTheme.id;
        await this.setProductIconTheme(DEFAULT_PRODUCT_ICON_THEME_ID, "auto");
      }
    }));
    this._register(this.languageService.onDidChange(() => this.reloadCurrentFileIconTheme()));
    return Promise.all([this.getColorThemes(), this.getFileIconThemes(), this.getProductIconThemes()]).then(([ct, fit, pit]) => {
      updateColorThemeConfigurationSchemas(ct);
      updateFileIconThemeConfigurationSchemas(fit);
      updateProductIconThemeConfigurationSchemas(pit);
    });
  }
  // preferred scheme handling
  installPreferredSchemeListener() {
    let previous = { dark: this.hostColorService.dark, highContrast: this.hostColorService.highContrast };
    this._register(this.hostColorService.onDidChangeColorScheme(() => {
      const restoreColorTheme = this.settings.isPreferredColorSchemeChange(previous);
      previous = { dark: this.hostColorService.dark, highContrast: this.hostColorService.highContrast };
      if (restoreColorTheme) {
        this.restoreColorTheme();
      }
    }));
  }
  getColorTheme() {
    return this.currentColorTheme;
  }
  async getColorThemes() {
    return this.colorThemeRegistry.getThemes();
  }
  getPreferredColorScheme() {
    return this.settings.getPreferredColorScheme();
  }
  async getMarketplaceColorThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.colorThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  get onDidColorThemeChange() {
    return this.onColorThemeChange.event;
  }
  setColorTheme(themeIdOrTheme, settingsTarget) {
    return this.colorThemeSequencer.queue(async () => {
      return this.internalSetColorTheme(themeIdOrTheme, settingsTarget);
    });
  }
  async internalSetColorTheme(themeIdOrTheme, settingsTarget) {
    if (!themeIdOrTheme) {
      return null;
    }
    const themeId = types.isString(themeIdOrTheme) ? validateThemeId(themeIdOrTheme) : themeIdOrTheme.id;
    if (this.currentColorTheme.isLoaded && themeId === this.currentColorTheme.id) {
      if (settingsTarget !== "preview") {
        this.currentColorTheme.toStorage(this.storageService);
      }
      return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
    }
    let themeData = this.colorThemeRegistry.findThemeById(themeId);
    if (!themeData) {
      if (themeIdOrTheme instanceof ColorThemeData) {
        themeData = themeIdOrTheme;
      } else {
        return null;
      }
    }
    try {
      await themeData.ensureLoaded(this.extensionResourceLoaderService);
      themeData.setCustomizations(this.settings);
      return this.applyTheme(themeData, settingsTarget);
    } catch (error) {
      throw new Error(nls.localize("error.cannotloadtheme", "Unable to load {0}: {1}", themeData.location?.toString(), error.message));
    }
  }
  reloadCurrentColorTheme() {
    return this.colorThemeSequencer.queue(async () => {
      try {
        const theme = this.colorThemeRegistry.findThemeBySettingsId(this.currentColorTheme.settingsId) || this.currentColorTheme;
        await theme.reload(this.extensionResourceLoaderService);
        theme.setCustomizations(this.settings);
        await this.applyTheme(theme, void 0, false);
      } catch (error) {
        this.logService.info("Unable to reload {0}: {1}", this.currentColorTheme.location?.toString());
      }
    });
  }
  async restoreColorTheme() {
    return this.colorThemeSequencer.queue(async () => {
      const settingId = this.settings.colorTheme;
      const theme = this.colorThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentColorTheme.settingsId) {
          await this.internalSetColorTheme(theme.id, void 0);
        } else if (theme !== this.currentColorTheme) {
          await theme.ensureLoaded(this.extensionResourceLoaderService);
          theme.setCustomizations(this.settings);
          await this.applyTheme(theme, void 0, true);
        }
        return true;
      }
      return false;
    });
  }
  updateDynamicCSSRules(themeData) {
    const css = generateColorThemeCSS(
      themeData,
      ".monaco-workbench",
      themingRegistry.getThemingParticipants(),
      this.environmentService
    );
    _applyRules(css.code, colorThemeRulesClassName);
  }
  applyTheme(newTheme, settingsTarget, silent = false) {
    this.updateDynamicCSSRules(newTheme);
    if (this.currentColorTheme.id) {
      this.container.classList.remove(...this.currentColorTheme.classNames);
    } else {
      this.container.classList.remove(ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT);
    }
    this.container.classList.add(...newTheme.classNames);
    this.currentColorTheme.clearCaches();
    this.currentColorTheme = newTheme;
    if (!this.colorThemingParticipantChangeListener) {
      this.colorThemingParticipantChangeListener = themingRegistry.onThemingParticipantAdded((_) => this.updateDynamicCSSRules(this.currentColorTheme));
    }
    this.colorThemeWatcher.update(newTheme);
    this.sendTelemetry(newTheme.id, newTheme.extensionData, "color");
    if (silent) {
      return Promise.resolve(null);
    }
    this.onColorThemeChange.fire(this.currentColorTheme);
    if (newTheme.isLoaded && settingsTarget !== "preview") {
      newTheme.toStorage(this.storageService);
    }
    return this.settings.setColorTheme(this.currentColorTheme, settingsTarget);
  }
  sendTelemetry(themeId, themeData, themeType) {
    if (themeData) {
      const key = themeType + themeData.extensionId;
      if (!this.themeExtensionsActivated.get(key)) {
        this.telemetryService.publicLog2("activateThemeExtension", {
          id: themeData.extensionId,
          name: themeData.extensionName,
          isBuiltin: themeData.extensionIsBuiltin,
          publisherDisplayName: themeData.extensionPublisher,
          themeId
        });
        this.themeExtensionsActivated.set(key, true);
      }
    }
  }
  async getFileIconThemes() {
    return this.fileIconThemeRegistry.getThemes();
  }
  getFileIconTheme() {
    return this.currentFileIconTheme;
  }
  get onDidFileIconThemeChange() {
    return this.onFileIconThemeChange.event;
  }
  async setFileIconTheme(iconThemeOrId, settingsTarget) {
    return this.fileIconThemeSequencer.queue(async () => {
      return this.internalSetFileIconTheme(iconThemeOrId, settingsTarget);
    });
  }
  async internalSetFileIconTheme(iconThemeOrId, settingsTarget) {
    if (iconThemeOrId === void 0) {
      iconThemeOrId = "";
    }
    const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
    if (themeId !== this.currentFileIconTheme.id || !this.currentFileIconTheme.isLoaded) {
      let newThemeData = this.fileIconThemeRegistry.findThemeById(themeId);
      if (!newThemeData && iconThemeOrId instanceof FileIconThemeData) {
        newThemeData = iconThemeOrId;
      }
      if (!newThemeData) {
        newThemeData = FileIconThemeData.noIconTheme;
      }
      await newThemeData.ensureLoaded(this.fileIconThemeLoader);
      this.applyAndSetFileIconTheme(newThemeData);
    }
    const themeData = this.currentFileIconTheme;
    if (themeData.isLoaded && settingsTarget !== "preview" && (!themeData.location || !getRemoteAuthority(themeData.location))) {
      themeData.toStorage(this.storageService);
    }
    await this.settings.setFileIconTheme(this.currentFileIconTheme, settingsTarget);
    return themeData;
  }
  async getMarketplaceFileIconThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.fileIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  async reloadCurrentFileIconTheme() {
    return this.fileIconThemeSequencer.queue(async () => {
      await this.currentFileIconTheme.reload(this.fileIconThemeLoader);
      this.applyAndSetFileIconTheme(this.currentFileIconTheme);
    });
  }
  async restoreFileIconTheme() {
    return this.fileIconThemeSequencer.queue(async () => {
      const settingId = this.settings.fileIconTheme;
      const theme = this.fileIconThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentFileIconTheme.settingsId) {
          await this.internalSetFileIconTheme(theme.id, void 0);
        } else if (theme !== this.currentFileIconTheme) {
          await theme.ensureLoaded(this.fileIconThemeLoader);
          this.applyAndSetFileIconTheme(theme, true);
        }
        return true;
      }
      return false;
    });
  }
  applyAndSetFileIconTheme(iconThemeData, silent = false) {
    this.currentFileIconTheme = iconThemeData;
    _applyRules(iconThemeData.styleSheetContent, fileIconThemeRulesClassName);
    if (iconThemeData.id) {
      this.container.classList.add(fileIconsEnabledClass);
    } else {
      this.container.classList.remove(fileIconsEnabledClass);
    }
    this.fileIconThemeWatcher.update(iconThemeData);
    if (iconThemeData.id) {
      this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, "fileIcon");
    }
    if (!silent) {
      this.onFileIconThemeChange.fire(this.currentFileIconTheme);
    }
  }
  async getProductIconThemes() {
    return this.productIconThemeRegistry.getThemes();
  }
  getProductIconTheme() {
    return this.currentProductIconTheme;
  }
  get onDidProductIconThemeChange() {
    return this.onProductIconThemeChange.event;
  }
  async setProductIconTheme(iconThemeOrId, settingsTarget) {
    return this.productIconThemeSequencer.queue(async () => {
      return this.internalSetProductIconTheme(iconThemeOrId, settingsTarget);
    });
  }
  async internalSetProductIconTheme(iconThemeOrId, settingsTarget) {
    if (iconThemeOrId === void 0) {
      iconThemeOrId = "";
    }
    const themeId = types.isString(iconThemeOrId) ? iconThemeOrId : iconThemeOrId.id;
    if (themeId !== this.currentProductIconTheme.id || !this.currentProductIconTheme.isLoaded) {
      let newThemeData = this.productIconThemeRegistry.findThemeById(themeId);
      if (!newThemeData && iconThemeOrId instanceof ProductIconThemeData) {
        newThemeData = iconThemeOrId;
      }
      if (!newThemeData) {
        newThemeData = ProductIconThemeData.defaultTheme;
      }
      await newThemeData.ensureLoaded(this.extensionResourceLoaderService, this.logService);
      this.applyAndSetProductIconTheme(newThemeData);
    }
    const themeData = this.currentProductIconTheme;
    if (themeData.isLoaded && settingsTarget !== "preview" && (!themeData.location || !getRemoteAuthority(themeData.location))) {
      themeData.toStorage(this.storageService);
    }
    await this.settings.setProductIconTheme(this.currentProductIconTheme, settingsTarget);
    return themeData;
  }
  async getMarketplaceProductIconThemes(publisher, name, version) {
    const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({ publisher, name, version }, "extension");
    if (extensionLocation) {
      try {
        const manifestContent = await this.extensionResourceLoaderService.readExtensionResource(resources.joinPath(extensionLocation, "package.json"));
        return this.productIconThemeRegistry.getMarketplaceThemes(JSON.parse(manifestContent), extensionLocation, ExtensionData.fromName(publisher, name));
      } catch (e) {
        this.logService.error("Problem loading themes from marketplace", e);
      }
    }
    return [];
  }
  async reloadCurrentProductIconTheme() {
    return this.productIconThemeSequencer.queue(async () => {
      await this.currentProductIconTheme.reload(this.extensionResourceLoaderService, this.logService);
      this.applyAndSetProductIconTheme(this.currentProductIconTheme);
    });
  }
  async restoreProductIconTheme() {
    return this.productIconThemeSequencer.queue(async () => {
      const settingId = this.settings.productIconTheme;
      const theme = this.productIconThemeRegistry.findThemeBySettingsId(settingId);
      if (theme) {
        if (settingId !== this.currentProductIconTheme.settingsId) {
          await this.internalSetProductIconTheme(theme.id, void 0);
        } else if (theme !== this.currentProductIconTheme) {
          await theme.ensureLoaded(this.extensionResourceLoaderService, this.logService);
          this.applyAndSetProductIconTheme(theme, true);
        }
        return true;
      }
      return false;
    });
  }
  applyAndSetProductIconTheme(iconThemeData, silent = false) {
    this.currentProductIconTheme = iconThemeData;
    _applyRules(iconThemeData.styleSheetContent, productIconThemeRulesClassName);
    this.productIconThemeWatcher.update(iconThemeData);
    if (iconThemeData.id) {
      this.sendTelemetry(iconThemeData.id, iconThemeData.extensionData, "productIcon");
    }
    if (!silent) {
      this.onProductIconThemeChange.fire(this.currentProductIconTheme);
    }
  }
};
WorkbenchThemeService.NEW_THEME_NOTIFICATION_KEY = "workbench.newDefaultThemeNotification";
WorkbenchThemeService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IExtensionResourceLoaderService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IHostColorSchemeService),
  __decorateParam(10, IUserDataInitializationService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IHostService)
], WorkbenchThemeService);
class ThemeFileWatcher {
  constructor(fileService, environmentService, onUpdate) {
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.onUpdate = onUpdate;
    this.watcherDisposables = new DisposableStore();
  }
  update(theme) {
    if (!resources.isEqual(theme.location, this.watchedLocation)) {
      this.watchedLocation = void 0;
      this.watcherDisposables.clear();
      if (theme.location && (theme.watch || this.environmentService.isExtensionDevelopment)) {
        this.watchedLocation = theme.location;
        this.watcherDisposables.add(this.fileService.watch(theme.location));
        this.watcherDisposables.add(this.fileService.onDidFilesChange((e) => {
          if (this.watchedLocation && e.contains(this.watchedLocation, FileChangeType.UPDATED)) {
            this.onUpdate();
          }
        }));
      }
    }
  }
  dispose() {
    this.watcherDisposables.dispose();
    this.watchedLocation = void 0;
  }
}
function _applyRules(styleSheetContent, rulesClassName) {
  const themeStyles = mainWindow.document.head.getElementsByClassName(rulesClassName);
  if (themeStyles.length === 0) {
    const elStyle = createStyleSheet();
    elStyle.className = rulesClassName;
    elStyle.textContent = styleSheetContent;
  } else {
    themeStyles[0].textContent = styleSheetContent;
  }
}
registerColorThemeSchemas();
registerFileIconThemeSchemas();
registerProductIconThemeSchemas();
registerSingleton(IWorkbenchThemeService, WorkbenchThemeService, InstantiationType.Eager);
export {
  WorkbenchThemeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvYnJvd3Nlci93b3JrYmVuY2hUaGVtZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIEV4dGVuc2lvbkRhdGEsIFRoZW1lU2V0dGluZ3MsIElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lLCBUaGVtZVNldHRpbmdUYXJnZXQsIFRoZW1lU2V0dGluZ0RlZmF1bHRzLCBDT0xPUl9USEVNRV9EQVJLX0lOSVRJQUxfQ09MT1JTLCBDT0xPUl9USEVNRV9MSUdIVF9JTklUSUFMX0NPTE9SUywgbWlncmF0ZVRoZW1lU2V0dGluZ3NJZCB9IGZyb20gJy4uL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgZXJyb3JzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yVGhlbWVEYXRhIH0gZnJvbSAnLi4vY29tbW9uL2NvbG9yVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBFeHRlbnNpb25zIGFzIFRoZW1pbmdFeHRlbnNpb25zLCBJVGhlbWluZ1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRmlsZUljb25UaGVtZVNjaGVtYXMgfSBmcm9tICcuLi9jb21tb24vZmlsZUljb25UaGVtZVNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVJY29uVGhlbWVEYXRhLCBGaWxlSWNvblRoZW1lTG9hZGVyIH0gZnJvbSAnLi9maWxlSWNvblRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yVGhlbWVTY2hlbWFzIH0gZnJvbSAnLi4vY29tbW9uL2NvbG9yVGhlbWVTY2hlbWEuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRSZW1vdGVBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUhvc3RzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IFRoZW1lUmVnaXN0cnksIHJlZ2lzdGVyQ29sb3JUaGVtZUV4dGVuc2lvblBvaW50LCByZWdpc3RlckZpbGVJY29uVGhlbWVFeHRlbnNpb25Qb2ludCwgcmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lRXh0ZW5zaW9uUG9pbnQgfSBmcm9tICcuLi9jb21tb24vdGhlbWVFeHRlbnNpb25Qb2ludHMuanMnO1xuaW1wb3J0IHsgdXBkYXRlQ29sb3JUaGVtZUNvbmZpZ3VyYXRpb25TY2hlbWFzLCB1cGRhdGVGaWxlSWNvblRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMsIFRoZW1lQ29uZmlndXJhdGlvbiwgdXBkYXRlUHJvZHVjdEljb25UaGVtZUNvbmZpZ3VyYXRpb25TY2hlbWFzIH0gZnJvbSAnLi4vY29tbW9uL3RoZW1lQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQcm9kdWN0SWNvblRoZW1lRGF0YSwgREVGQVVMVF9QUk9EVUNUX0lDT05fVEhFTUVfSUQgfSBmcm9tICcuL3Byb2R1Y3RJY29uVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyUHJvZHVjdEljb25UaGVtZVNjaGVtYXMgfSBmcm9tICcuLi9jb21tb24vcHJvZHVjdEljb25UaGVtZVNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUsIFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElIb3N0Q29sb3JTY2hlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2hvc3RDb2xvclNjaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgU2VxdWVuY2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGEvYnJvd3Nlci91c2VyRGF0YUluaXQuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbnNTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9pY29uc1N0eWxlU2hlZXQuanMnO1xuaW1wb3J0IHsgZ2V0Q29sb3JSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUNvbG9yVGhlbWVDU1MgfSBmcm9tICcuL2NvbG9yVGhlbWVDc3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcblxuLy8gaW1wbGVtZW50YXRpb25cblxuY29uc3QgZGVmYXVsdFRoZW1lRXh0ZW5zaW9uSWQgPSAndnNjb2RlLXRoZW1lLWRlZmF1bHRzJztcblxuY29uc3QgREVGQVVMVF9GSUxFX0lDT05fVEhFTUVfSUQgPSAndnNjb2RlLnZzY29kZS10aGVtZS1zZXRpLXZzLXNldGknO1xuY29uc3QgZmlsZUljb25zRW5hYmxlZENsYXNzID0gJ2ZpbGUtaWNvbnMtZW5hYmxlZCc7XG5cbmNvbnN0IGNvbG9yVGhlbWVSdWxlc0NsYXNzTmFtZSA9ICdjb250cmlidXRlZENvbG9yVGhlbWUnO1xuY29uc3QgZmlsZUljb25UaGVtZVJ1bGVzQ2xhc3NOYW1lID0gJ2NvbnRyaWJ1dGVkRmlsZUljb25UaGVtZSc7XG5jb25zdCBwcm9kdWN0SWNvblRoZW1lUnVsZXNDbGFzc05hbWUgPSAnY29udHJpYnV0ZWRQcm9kdWN0SWNvblRoZW1lJztcblxuY29uc3QgdGhlbWluZ1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVRoZW1pbmdSZWdpc3RyeT4oVGhlbWluZ0V4dGVuc2lvbnMuVGhlbWluZ0NvbnRyaWJ1dGlvbik7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlVGhlbWVJZCh0aGVtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gbWlncmF0aW9uc1xuXHRzd2l0Y2ggKHRoZW1lKSB7XG5cdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WUzogcmV0dXJuIGB2cyAke2RlZmF1bHRUaGVtZUV4dGVuc2lvbklkfS10aGVtZXMtbGlnaHRfdnMtanNvbmA7XG5cdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLOiByZXR1cm4gYHZzLWRhcmsgJHtkZWZhdWx0VGhlbWVFeHRlbnNpb25JZH0tdGhlbWVzLWRhcmtfdnMtanNvbmA7XG5cdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSzogcmV0dXJuIGBoYy1ibGFjayAke2RlZmF1bHRUaGVtZUV4dGVuc2lvbklkfS10aGVtZXMtaGNfYmxhY2stanNvbmA7XG5cdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVDogcmV0dXJuIGBoYy1saWdodCAke2RlZmF1bHRUaGVtZUV4dGVuc2lvbklkfS10aGVtZXMtaGNfbGlnaHQtanNvbmA7XG5cdH1cblx0cmV0dXJuIHRoZW1lO1xufVxuXG5jb25zdCBjb2xvclRoZW1lc0V4dFBvaW50ID0gcmVnaXN0ZXJDb2xvclRoZW1lRXh0ZW5zaW9uUG9pbnQoKTtcbmNvbnN0IGZpbGVJY29uVGhlbWVzRXh0UG9pbnQgPSByZWdpc3RlckZpbGVJY29uVGhlbWVFeHRlbnNpb25Qb2ludCgpO1xuY29uc3QgcHJvZHVjdEljb25UaGVtZXNFeHRQb2ludCA9IHJlZ2lzdGVyUHJvZHVjdEljb25UaGVtZUV4dGVuc2lvblBvaW50KCk7XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hUaGVtZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaFRoZW1lU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZXR0aW5nczogVGhlbWVDb25maWd1cmF0aW9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29sb3JUaGVtZVJlZ2lzdHJ5OiBUaGVtZVJlZ2lzdHJ5PENvbG9yVGhlbWVEYXRhPjtcblx0cHJpdmF0ZSBjdXJyZW50Q29sb3JUaGVtZTogQ29sb3JUaGVtZURhdGE7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25Db2xvclRoZW1lQ2hhbmdlOiBFbWl0dGVyPElXb3JrYmVuY2hDb2xvclRoZW1lPjtcblx0cHJpdmF0ZSByZWFkb25seSBjb2xvclRoZW1lV2F0Y2hlcjogVGhlbWVGaWxlV2F0Y2hlcjtcblx0cHJpdmF0ZSBjb2xvclRoZW1pbmdQYXJ0aWNpcGFudENoYW5nZUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBjb2xvclRoZW1lU2VxdWVuY2VyOiBTZXF1ZW5jZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlSWNvblRoZW1lUmVnaXN0cnk6IFRoZW1lUmVnaXN0cnk8RmlsZUljb25UaGVtZURhdGE+O1xuXHRwcml2YXRlIGN1cnJlbnRGaWxlSWNvblRoZW1lOiBGaWxlSWNvblRoZW1lRGF0YTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkZpbGVJY29uVGhlbWVDaGFuZ2U6IEVtaXR0ZXI8SVdvcmtiZW5jaEZpbGVJY29uVGhlbWU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVJY29uVGhlbWVMb2FkZXI6IEZpbGVJY29uVGhlbWVMb2FkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUljb25UaGVtZVdhdGNoZXI6IFRoZW1lRmlsZVdhdGNoZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUljb25UaGVtZVNlcXVlbmNlcjogU2VxdWVuY2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5OiBUaGVtZVJlZ2lzdHJ5PFByb2R1Y3RJY29uVGhlbWVEYXRhPjtcblx0cHJpdmF0ZSBjdXJyZW50UHJvZHVjdEljb25UaGVtZTogUHJvZHVjdEljb25UaGVtZURhdGE7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlOiBFbWl0dGVyPElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lPjtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0SWNvblRoZW1lV2F0Y2hlcjogVGhlbWVGaWxlV2F0Y2hlcjtcblx0cHJpdmF0ZSByZWFkb25seSBwcm9kdWN0SWNvblRoZW1lU2VxdWVuY2VyOiBTZXF1ZW5jZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUhvc3RDb2xvclNjaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0Q29sb3JTZXJ2aWNlOiBJSG9zdENvbG9yU2NoZW1lU2VydmljZSxcblx0XHRASVVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFJbml0aWFsaXphdGlvblNlcnZpY2U6IElVc2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyO1xuXHRcdHRoaXMuc2V0dGluZ3MgPSBuZXcgVGhlbWVDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBob3N0Q29sb3JTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRoZW1lUmVnaXN0cnkoY29sb3JUaGVtZXNFeHRQb2ludCwgQ29sb3JUaGVtZURhdGEuZnJvbUV4dGVuc2lvblRoZW1lKSk7XG5cdFx0dGhpcy5jb2xvclRoZW1lV2F0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaGVtZUZpbGVXYXRjaGVyKGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMucmVsb2FkQ3VycmVudENvbG9yVGhlbWUuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMub25Db2xvclRoZW1lQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtiZW5jaENvbG9yVGhlbWU+KHsgbGVha1dhcm5pbmdUaHJlc2hvbGQ6IDQwMCwgbGVha1dhcm5pbmdOYW1lOiAnVGhlbWVTZXJ2aWNlLm9uQ29sb3JUaGVtZUNoYW5nZScgfSkpO1xuXHRcdHRoaXMuY3VycmVudENvbG9yVGhlbWUgPSBDb2xvclRoZW1lRGF0YS5jcmVhdGVVbmxvYWRlZFRoZW1lKCcnKTtcblx0XHR0aGlzLmNvbG9yVGhlbWVTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0XHR0aGlzLmZpbGVJY29uVGhlbWVXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRoZW1lRmlsZVdhdGNoZXIoZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdGhpcy5yZWxvYWRDdXJyZW50RmlsZUljb25UaGVtZS5iaW5kKHRoaXMpKSk7XG5cdFx0dGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhlbWVSZWdpc3RyeShmaWxlSWNvblRoZW1lc0V4dFBvaW50LCBGaWxlSWNvblRoZW1lRGF0YS5mcm9tRXh0ZW5zaW9uVGhlbWUsIHRydWUsIEZpbGVJY29uVGhlbWVEYXRhLm5vSWNvblRoZW1lKSk7XG5cdFx0dGhpcy5maWxlSWNvblRoZW1lTG9hZGVyID0gbmV3IEZpbGVJY29uVGhlbWVMb2FkZXIoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdHRoaXMub25GaWxlSWNvblRoZW1lQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtiZW5jaEZpbGVJY29uVGhlbWU+KHsgbGVha1dhcm5pbmdUaHJlc2hvbGQ6IDQwMCwgbGVha1dhcm5pbmdOYW1lOiAnVGhlbWVTZXJ2aWNlLm9uRmlsZUljb25UaGVtZUNoYW5nZScgfSkpO1xuXHRcdHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUgPSBGaWxlSWNvblRoZW1lRGF0YS5jcmVhdGVVbmxvYWRlZFRoZW1lKCcnKTtcblx0XHR0aGlzLmZpbGVJY29uVGhlbWVTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0XHR0aGlzLnByb2R1Y3RJY29uVGhlbWVXYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRoZW1lRmlsZVdhdGNoZXIoZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgdGhpcy5yZWxvYWRDdXJyZW50UHJvZHVjdEljb25UaGVtZS5iaW5kKHRoaXMpKSk7XG5cdFx0dGhpcy5wcm9kdWN0SWNvblRoZW1lUmVnaXN0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhlbWVSZWdpc3RyeShwcm9kdWN0SWNvblRoZW1lc0V4dFBvaW50LCBQcm9kdWN0SWNvblRoZW1lRGF0YS5mcm9tRXh0ZW5zaW9uVGhlbWUsIHRydWUsIFByb2R1Y3RJY29uVGhlbWVEYXRhLmRlZmF1bHRUaGVtZSkpO1xuXHRcdHRoaXMub25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWU+KCkpO1xuXHRcdHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUgPSBQcm9kdWN0SWNvblRoZW1lRGF0YS5jcmVhdGVVbmxvYWRlZFRoZW1lKCcnKTtcblx0XHR0aGlzLnByb2R1Y3RJY29uVGhlbWVTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGVtZSA9PiBnZXRDb2xvclJlZ2lzdHJ5KCkubm90aWZ5VGhlbWVVcGRhdGUodGhlbWUpKSk7XG5cblx0XHQvLyBJbiBvcmRlciB0byBhdm9pZCBwYWludCBmbGFzaGluZyBmb3IgdG9rZW5zLCBiZWNhdXNlXG5cdFx0Ly8gdGhlbWVzIGFyZSBsb2FkZWQgYXN5bmNocm9ub3VzbHksIHdlIG5lZWQgdG8gaW5pdGlhbGl6ZVxuXHRcdC8vIGEgY29sb3IgdGhlbWUgZG9jdW1lbnQgd2l0aCBnb29kIGRlZmF1bHRzIHVudGlsIHRoZSB0aGVtZSBpcyBsb2FkZWRcblx0XHRsZXQgdGhlbWVEYXRhOiBDb2xvclRoZW1lRGF0YSB8IHVuZGVmaW5lZCA9IENvbG9yVGhlbWVEYXRhLmZyb21TdG9yYWdlRGF0YSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBwcmV2aW91c0NvbG9yVGhlbWVTZXR0aW5nID0gdGhlbWVEYXRhPy5zZXR0aW5nc0lkO1xuXHRcdGNvbnN0IGNvbG9yVGhlbWVTZXR0aW5nID0gdGhpcy5zZXR0aW5ncy5jb2xvclRoZW1lO1xuXHRcdGlmICh0aGVtZURhdGEgJiYgY29sb3JUaGVtZVNldHRpbmcgIT09IHRoZW1lRGF0YS5zZXR0aW5nc0lkKSB7XG5cdFx0XHR0aGVtZURhdGEgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdENvbG9yTWFwID0gY29sb3JUaGVtZVNldHRpbmcgPT09IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0xJR0hUID8gQ09MT1JfVEhFTUVfTElHSFRfSU5JVElBTF9DT0xPUlMgOiBjb2xvclRoZW1lU2V0dGluZyA9PT0gVGhlbWVTZXR0aW5nRGVmYXVsdHMuQ09MT1JfVEhFTUVfREFSSyA/IENPTE9SX1RIRU1FX0RBUktfSU5JVElBTF9DT0xPUlMgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0aGVtZURhdGEpIHtcblx0XHRcdGNvbnN0IGluaXRpYWxDb2xvclRoZW1lID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LmluaXRpYWxDb2xvclRoZW1lO1xuXHRcdFx0aWYgKGluaXRpYWxDb2xvclRoZW1lKSB7XG5cdFx0XHRcdHRoZW1lRGF0YSA9IENvbG9yVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWVGb3JUaGVtZVR5cGUoaW5pdGlhbENvbG9yVGhlbWUudGhlbWVUeXBlLCBpbml0aWFsQ29sb3JUaGVtZS5jb2xvcnMgPz8gZGVmYXVsdENvbG9yTWFwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGVtZURhdGEpIHtcblx0XHRcdGNvbnN0IGNvbG9yU2NoZW1lID0gdGhpcy5zZXR0aW5ncy5nZXRQcmVmZXJyZWRDb2xvclNjaGVtZSgpID8/IChpc1dlYiA/IENvbG9yU2NoZW1lLkxJR0hUIDogQ29sb3JTY2hlbWUuREFSSyk7XG5cdFx0XHR0aGVtZURhdGEgPSBDb2xvclRoZW1lRGF0YS5jcmVhdGVVbmxvYWRlZFRoZW1lRm9yVGhlbWVUeXBlKGNvbG9yU2NoZW1lLCBkZWZhdWx0Q29sb3JNYXApO1xuXHRcdH1cblx0XHR0aGVtZURhdGEuc2V0Q3VzdG9taXphdGlvbnModGhpcy5zZXR0aW5ncyk7XG5cdFx0dGhpcy5hcHBseVRoZW1lKHRoZW1lRGF0YSwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdGNvbnN0IGZpbGVJY29uRGF0YSA9IEZpbGVJY29uVGhlbWVEYXRhLmZyb21TdG9yYWdlRGF0YSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpZiAoZmlsZUljb25EYXRhKSB7XG5cdFx0XHR0aGlzLmFwcGx5QW5kU2V0RmlsZUljb25UaGVtZShmaWxlSWNvbkRhdGEsIHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2R1Y3RJY29uRGF0YSA9IFByb2R1Y3RJY29uVGhlbWVEYXRhLmZyb21TdG9yYWdlRGF0YSh0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRpZiAocHJvZHVjdEljb25EYXRhKSB7XG5cdFx0XHR0aGlzLmFwcGx5QW5kU2V0UHJvZHVjdEljb25UaGVtZShwcm9kdWN0SWNvbkRhdGEsIHRydWUpO1xuXHRcdH1cblxuXHRcdGV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbihfID0+IHtcblx0XHRcdHRoaXMuaW5zdGFsbENvbmZpZ3VyYXRpb25MaXN0ZW5lcigpO1xuXHRcdFx0dGhpcy5pbnN0YWxsUHJlZmVycmVkU2NoZW1lTGlzdGVuZXIoKTtcblx0XHRcdHRoaXMuaW5zdGFsbFJlZ2lzdHJ5TGlzdGVuZXJzKCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemUocHJldmlvdXNDb2xvclRoZW1lU2V0dGluZykuY2F0Y2goZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvZGljb25TdHlsZVNoZWV0ID0gY3JlYXRlU3R5bGVTaGVldCgpO1xuXHRcdGNvZGljb25TdHlsZVNoZWV0LmlkID0gJ2NvZGljb25TdHlsZXMnO1xuXG5cdFx0Y29uc3QgaWNvbnNTdHlsZVNoZWV0ID0gdGhpcy5fcmVnaXN0ZXIoZ2V0SWNvbnNTdHlsZVNoZWV0KHRoaXMpKTtcblx0XHRmdW5jdGlvbiB1cGRhdGVBbGwoKSB7XG5cdFx0XHRjb2RpY29uU3R5bGVTaGVldC50ZXh0Q29udGVudCA9IGljb25zU3R5bGVTaGVldC5nZXRDU1MoKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIodXBkYXRlQWxsLCAwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaWNvbnNTdHlsZVNoZWV0Lm9uRGlkQ2hhbmdlKCgpID0+IGRlbGF5ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdGRlbGF5ZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSh0aGVtZVByZXZpb3VzU2V0dGluZ3NJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxbSVdvcmtiZW5jaENvbG9yVGhlbWUgfCBudWxsLCBJV29ya2JlbmNoRmlsZUljb25UaGVtZSB8IG51bGwsIElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lIHwgbnVsbF0+IHtcblx0XHRjb25zdCBleHREZXZMb2NzID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSTtcblx0XHRjb25zdCBleHREZXZMb2MgPSBleHREZXZMb2NzICYmIGV4dERldkxvY3MubGVuZ3RoID09PSAxID8gZXh0RGV2TG9jc1swXSA6IHVuZGVmaW5lZDsgLy8gaW4gZGV2IG1vZGUsIHN3aXRjaCB0byBhIHRoZW1lIHByb3ZpZGVkIGJ5IHRoZSBleHRlbnNpb24gdW5kZXIgZGV2LlxuXG5cdFx0Y29uc3QgaW5pdGlhbGl6ZUNvbG9yVGhlbWUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXZUaGVtZXMgPSB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUV4dGVuc2lvbkxvY2F0aW9uKGV4dERldkxvYyk7XG5cdFx0XHRpZiAoZGV2VGhlbWVzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVkQ29sb3JUaGVtZSA9IGRldlRoZW1lcy5maW5kKHRoZW1lID0+IHRoZW1lLnR5cGUgPT09IHRoaXMuY3VycmVudENvbG9yVGhlbWUudHlwZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldENvbG9yVGhlbWUobWF0Y2hlZENvbG9yVGhlbWUgPyBtYXRjaGVkQ29sb3JUaGVtZS5pZCA6IGRldlRoZW1lc1swXS5pZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGxldCB0aGVtZSA9IHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZCh0aGlzLnNldHRpbmdzLmNvbG9yVGhlbWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoIXRoZW1lKSB7XG5cdFx0XHRcdC8vIElmIHRoZSBjdXJyZW50IHRoZW1lIGlzIG5vdCBhdmFpbGFibGUsIGZpcnN0IG1ha2Ugc3VyZSBzZXR0aW5nIHN5bmMgaXMgY29tcGxldGVcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZS53aGVuSW5pdGlhbGl6YXRpb25GaW5pc2hlZCgpO1xuXHRcdFx0XHQvLyB0cnkgdG8gZ2V0IHRoZSB0aGVtZSBhZ2Fpbiwgbm93IHdpdGggYSBmYWxsYmFjayB0byB0aGUgZGVmYXVsdCB0aGVtZXNcblx0XHRcdFx0Y29uc3QgZmFsbGJhY2tUaGVtZSA9IHRoaXMuY3VycmVudENvbG9yVGhlbWUudHlwZSA9PT0gQ29sb3JTY2hlbWUuTElHSFQgPyBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVCA6IFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUks7XG5cdFx0XHRcdHRoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuc2V0dGluZ3MuY29sb3JUaGVtZSwgZmFsbGJhY2tUaGVtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRDb2xvclRoZW1lKHRoZW1lICYmIHRoZW1lLmlkLCB1bmRlZmluZWQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbml0aWFsaXplRmlsZUljb25UaGVtZSA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRldlRoZW1lcyA9IHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5RXh0ZW5zaW9uTG9jYXRpb24oZXh0RGV2TG9jKTtcblx0XHRcdGlmIChkZXZUaGVtZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNldEZpbGVJY29uVGhlbWUoZGV2VGhlbWVzWzBdLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWSk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdGhlbWUgPSB0aGlzLmZpbGVJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQodGhpcy5zZXR0aW5ncy5maWxlSWNvblRoZW1lKTtcblx0XHRcdGlmICghdGhlbWUpIHtcblx0XHRcdFx0Ly8gSWYgdGhlIGN1cnJlbnQgdGhlbWUgaXMgbm90IGF2YWlsYWJsZSwgZmlyc3QgbWFrZSBzdXJlIHNldHRpbmcgc3luYyBpcyBjb21wbGV0ZVxuXHRcdFx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhSW5pdGlhbGl6YXRpb25TZXJ2aWNlLndoZW5Jbml0aWFsaXphdGlvbkZpbmlzaGVkKCk7XG5cdFx0XHRcdHRoZW1lID0gdGhpcy5maWxlSWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuc2V0dGluZ3MuZmlsZUljb25UaGVtZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRGaWxlSWNvblRoZW1lKHRoZW1lID8gdGhlbWUuaWQgOiBERUZBVUxUX0ZJTEVfSUNPTl9USEVNRV9JRCwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW5pdGlhbGl6ZVByb2R1Y3RJY29uVGhlbWUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXZUaGVtZXMgPSB0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUV4dGVuc2lvbkxvY2F0aW9uKGV4dERldkxvYyk7XG5cdFx0XHRpZiAoZGV2VGhlbWVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXRQcm9kdWN0SWNvblRoZW1lKGRldlRoZW1lc1swXS5pZCwgQ29uZmlndXJhdGlvblRhcmdldC5NRU1PUlkpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHRoZW1lID0gdGhpcy5wcm9kdWN0SWNvblRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHRoaXMuc2V0dGluZ3MucHJvZHVjdEljb25UaGVtZSk7XG5cdFx0XHRpZiAoIXRoZW1lKSB7XG5cdFx0XHRcdC8vIElmIHRoZSBjdXJyZW50IHRoZW1lIGlzIG5vdCBhdmFpbGFibGUsIGZpcnN0IG1ha2Ugc3VyZSBzZXR0aW5nIHN5bmMgaXMgY29tcGxldGVcblx0XHRcdFx0YXdhaXQgdGhpcy51c2VyRGF0YUluaXRpYWxpemF0aW9uU2VydmljZS53aGVuSW5pdGlhbGl6YXRpb25GaW5pc2hlZCgpO1xuXHRcdFx0XHR0aGVtZSA9IHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZCh0aGlzLnNldHRpbmdzLnByb2R1Y3RJY29uVGhlbWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuc2V0UHJvZHVjdEljb25UaGVtZSh0aGVtZSA/IHRoZW1lLmlkIDogREVGQVVMVF9QUk9EVUNUX0lDT05fVEhFTUVfSUQsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblxuXG5cdFx0dGhpcy5taWdyYXRlQ29sb3JUaGVtZVNldHRpbmdzKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoW2luaXRpYWxpemVDb2xvclRoZW1lKCksIGluaXRpYWxpemVGaWxlSWNvblRoZW1lKCksIGluaXRpYWxpemVQcm9kdWN0SWNvblRoZW1lKCldKTtcblx0XHRhd2FpdCB0aGlzLnNob3dOZXdEZWZhdWx0VGhlbWVOb3RpZmljYXRpb24odGhlbWVQcmV2aW91c1NldHRpbmdzSWQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBORVdfVEhFTUVfTk9USUZJQ0FUSU9OX0tFWSA9ICd3b3JrYmVuY2gubmV3RGVmYXVsdFRoZW1lTm90aWZpY2F0aW9uJztcblxuXHRwcml2YXRlIGFzeW5jIHNob3dOZXdEZWZhdWx0VGhlbWVOb3RpZmljYXRpb24ocHJldmlvdXNTZXR0aW5nc0lkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFdvcmtiZW5jaFRoZW1lU2VydmljZS5ORVdfVEhFTUVfTk9USUZJQ0FUSU9OX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IHNob3duXG5cdFx0fVxuXHRcdGlmICghKGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuaGFkTGFzdEZvY3VzKCkpIHx8IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5zZXR0aW5ncy5pc0RlZmF1bHRDb2xvclRoZW1lKCkgfHwgIXByZXZpb3VzU2V0dGluZ3NJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c1NldHRpbmdzSWQgPSBtaWdyYXRlVGhlbWVTZXR0aW5nc0lkKHByZXZpb3VzU2V0dGluZ3NJZCk7XG5cdFx0XHRpZiAoIVsnRGFyayBNb2Rlcm4nLCAnTGlnaHQgTW9kZXJuJ10uaW5jbHVkZXMocHJldmlvdXNTZXR0aW5nc0lkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIVtUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLLCBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9MSUdIVF0uaW5jbHVkZXModGhpcy5zZXR0aW5ncy5jb2xvclRoZW1lKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIHJlbWViZXIgdG8gbm90IHNob3cgdGhlIGRpYWxvZyBhZ2FpblxuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShXb3JrYmVuY2hUaGVtZVNlcnZpY2UuTkVXX1RIRU1FX05PVElGSUNBVElPTl9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cblx0XHRjb25zdCBrZWVwVGhlbWUgPSBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGtleTogJ3RoZW1lVXBkYXRlZE5vdGlmaWNhdGlvbicsIGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBuYW1lIG9mIHRoZSBuZXcgZGVmYXVsdCB0aGVtZSddIH0sIFwiVlMgQ29kZSBoYXMgYSBuZXcgZGVmYXVsdCB0aGVtZTogJ3swfScuXCIsIHRoaXMuZ2V0Q29sb3JUaGVtZSgpLmxhYmVsKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAndGhlbWVVcGRhdGVkLnRyeUl0T3V0Jyxcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3RyeU5ld1RoZW1lJywgXCJLZWVwIEl0XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiByZXNvbHZlKHRydWUpXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICd0aGVtZVVwZGF0ZWQubm9UaGFua3MnLFxuXHRcdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbm9UaGFua3MnLCBcIk5vIFRoYW5rc1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gcmVzb2x2ZShmYWxzZSlcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0b25DYW5jZWw6ICgpID0+IHJlc29sdmUoZmFsc2UpXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWtlZXBUaGVtZSkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNUaGVtZSA9IHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZChwcmV2aW91c1NldHRpbmdzSWQpO1xuXHRcdFx0aWYgKHByZXZpb3VzVGhlbWUpIHtcblx0XHRcdFx0dGhpcy5zZXRDb2xvclRoZW1lKHByZXZpb3VzVGhlbWUuaWQsICdhdXRvJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1pZ3JhdGVzIGxlZ2FjeSB0aGVtZSBzZXR0aW5nIHZhbHVlcyB0byB0aGVpciBjdXJyZW50IGVxdWl2YWxlbnRzLFxuXHQgKiB3cml0aW5nIGJhY2sgdGhlIG1pZ3JhdGVkIHZhbHVlIHNvIHNldHRpbmdzIHN5bmMgZGlzdHJpYnV0ZXMgdGhlIGNvcnJlY3QgSUQuXG5cdCAqL1xuXHRwcml2YXRlIG1pZ3JhdGVDb2xvclRoZW1lU2V0dGluZ3MoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhlbWVTZXR0aW5ncyA9IFtcblx0XHRcdFRoZW1lU2V0dGluZ3MuQ09MT1JfVEhFTUUsXG5cdFx0XHRUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9EQVJLX1RIRU1FLFxuXHRcdFx0VGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfTElHSFRfVEhFTUUsXG5cdFx0XHRUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19EQVJLX1RIRU1FLFxuXHRcdFx0VGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfSENfTElHSFRfVEhFTUUsXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGVtZVNldHRpbmdzKSB7XG5cdFx0XHRjb25zdCBpbnNwZWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oa2V5KTtcblx0XHRcdGZvciAoY29uc3QgW3RhcmdldCwgdmFsdWVdIG9mIFtcblx0XHRcdFx0W0NvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUiwgaW5zcGVjdGlvbi51c2VyVmFsdWVdLFxuXHRcdFx0XHRbQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSwgaW5zcGVjdGlvbi51c2VyUmVtb3RlVmFsdWVdLFxuXHRcdFx0XHRbQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UsIGluc3BlY3Rpb24ud29ya3NwYWNlVmFsdWVdLFxuXHRcdFx0XSBhcyBjb25zdCkge1xuXHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBtaWdyYXRlZCA9IG1pZ3JhdGVUaGVtZVNldHRpbmdzSWQodmFsdWUpO1xuXHRcdFx0XHRcdGlmIChtaWdyYXRlZCAhPT0gdmFsdWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoa2V5LCBtaWdyYXRlZCwgdGFyZ2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluc3RhbGxDb25maWd1cmF0aW9uTGlzdGVuZXIoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLkNPTE9SX1RIRU1FKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuUFJFRkVSUkVEX0RBUktfVEhFTUUpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfTElHSFRfVEhFTUUpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5QUkVGRVJSRURfSENfREFSS19USEVNRSlcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLlBSRUZFUlJFRF9IQ19MSUdIVF9USEVNRSlcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLkRFVEVDVF9DT0xPUl9TQ0hFTUUpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5ERVRFQ1RfSEMpXG5cdFx0XHRcdHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5TWVNURU1fQ09MT1JfVEhFTUUpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5yZXN0b3JlQ29sb3JUaGVtZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGhlbWVTZXR0aW5ncy5GSUxFX0lDT05fVEhFTUUpKSB7XG5cdFx0XHRcdHRoaXMucmVzdG9yZUZpbGVJY29uVGhlbWUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuUFJPRFVDVF9JQ09OX1RIRU1FKSkge1xuXHRcdFx0XHR0aGlzLnJlc3RvcmVQcm9kdWN0SWNvblRoZW1lKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50Q29sb3JUaGVtZSkge1xuXHRcdFx0XHRsZXQgaGFzQ29sb3JDaGFuZ2VzID0gZmFsc2U7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuQ09MT1JfQ1VTVE9NSVpBVElPTlMpKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXRDdXN0b21Db2xvcnModGhpcy5zZXR0aW5ncy5jb2xvckN1c3RvbWl6YXRpb25zKTtcblx0XHRcdFx0XHRoYXNDb2xvckNoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRoZW1lU2V0dGluZ3MuVE9LRU5fQ09MT1JfQ1VTVE9NSVpBVElPTlMpKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXRDdXN0b21Ub2tlbkNvbG9ycyh0aGlzLnNldHRpbmdzLnRva2VuQ29sb3JDdXN0b21pemF0aW9ucyk7XG5cdFx0XHRcdFx0aGFzQ29sb3JDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUaGVtZVNldHRpbmdzLlNFTUFOVElDX1RPS0VOX0NPTE9SX0NVU1RPTUlaQVRJT05TKSkge1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudENvbG9yVGhlbWUuc2V0Q3VzdG9tU2VtYW50aWNUb2tlbkNvbG9ycyh0aGlzLnNldHRpbmdzLnNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKTtcblx0XHRcdFx0XHRoYXNDb2xvckNoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoYXNDb2xvckNoYW5nZXMpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUR5bmFtaWNDU1NSdWxlcyh0aGlzLmN1cnJlbnRDb2xvclRoZW1lKTtcblx0XHRcdFx0XHR0aGlzLm9uQ29sb3JUaGVtZUNoYW5nZS5maXJlKHRoaXMuY3VycmVudENvbG9yVGhlbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbnN0YWxsUmVnaXN0cnlMaXN0ZW5lcnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRsZXQgcHJldkNvbG9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIHVwZGF0ZSBzZXR0aW5ncyBzY2hlbWEgc2V0dGluZyBmb3IgdGhlbWUgc3BlY2lmaWMgc2V0dGluZ3Ncblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5vbkRpZENoYW5nZShhc3luYyBldmVudCA9PiB7XG5cdFx0XHR1cGRhdGVDb2xvclRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMoZXZlbnQudGhlbWVzKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLnJlc3RvcmVDb2xvclRoZW1lKCkpIHsgLy8gY2hlY2tzIGlmIHRoZW1lIGZyb20gc2V0dGluZ3MgZXhpc3RzIGFuZCBpcyBzZXRcblx0XHRcdFx0Ly8gcmVzdG9yZSB0aGVtZVxuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXR0aW5nc0lkID09PSBUaGVtZVNldHRpbmdEZWZhdWx0cy5DT0xPUl9USEVNRV9EQVJLICYmICF0eXBlcy5pc1VuZGVmaW5lZChwcmV2Q29sb3JJZCkgJiYgYXdhaXQgdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlJZChwcmV2Q29sb3JJZCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNldENvbG9yVGhlbWUocHJldkNvbG9ySWQsICdhdXRvJyk7XG5cdFx0XHRcdFx0cHJldkNvbG9ySWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuYWRkZWQuc29tZSh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXR0aW5nc0lkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkQ3VycmVudENvbG9yVGhlbWUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChldmVudC5yZW1vdmVkLnNvbWUodCA9PiB0LnNldHRpbmdzSWQgPT09IHRoaXMuY3VycmVudENvbG9yVGhlbWUuc2V0dGluZ3NJZCkpIHtcblx0XHRcdFx0Ly8gY3VycmVudCB0aGVtZSBpcyBubyBsb25nZXIgYXZhaWxhYmxlXG5cdFx0XHRcdHByZXZDb2xvcklkID0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS5pZDtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFRoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKFRoZW1lU2V0dGluZ0RlZmF1bHRzLkNPTE9SX1RIRU1FX0RBUkspO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNldENvbG9yVGhlbWUoZGVmYXVsdFRoZW1lLCAnYXV0bycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBwcmV2RmlsZUljb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKGFzeW5jIGV2ZW50ID0+IHtcblx0XHRcdHVwZGF0ZUZpbGVJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhldmVudC50aGVtZXMpO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMucmVzdG9yZUZpbGVJY29uVGhlbWUoKSkgeyAvLyBjaGVja3MgaWYgdGhlbWUgZnJvbSBzZXR0aW5ncyBleGlzdHMgYW5kIGlzIHNldFxuXHRcdFx0XHQvLyByZXN0b3JlIHRoZW1lXG5cdFx0XHRcdGlmICh0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lLmlkID09PSBERUZBVUxUX0ZJTEVfSUNPTl9USEVNRV9JRCAmJiAhdHlwZXMuaXNVbmRlZmluZWQocHJldkZpbGVJY29uSWQpICYmIHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5SWQocHJldkZpbGVJY29uSWQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zZXRGaWxlSWNvblRoZW1lKHByZXZGaWxlSWNvbklkLCAnYXV0bycpO1xuXHRcdFx0XHRcdHByZXZGaWxlSWNvbklkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmFkZGVkLnNvbWUodCA9PiB0LnNldHRpbmdzSWQgPT09IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuc2V0dGluZ3NJZCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlbG9hZEN1cnJlbnRGaWxlSWNvblRoZW1lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQucmVtb3ZlZC5zb21lKHQgPT4gdC5zZXR0aW5nc0lkID09PSB0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lLnNldHRpbmdzSWQpKSB7XG5cdFx0XHRcdC8vIGN1cnJlbnQgdGhlbWUgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZVxuXHRcdFx0XHRwcmV2RmlsZUljb25JZCA9IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuaWQ7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2V0RmlsZUljb25UaGVtZShERUZBVUxUX0ZJTEVfSUNPTl9USEVNRV9JRCwgJ2F1dG8nKTtcblx0XHRcdH1cblxuXHRcdH0pKSk7XG5cblx0XHRsZXQgcHJldlByb2R1Y3RJY29uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5vbkRpZENoYW5nZShhc3luYyBldmVudCA9PiB7XG5cdFx0XHR1cGRhdGVQcm9kdWN0SWNvblRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMoZXZlbnQudGhlbWVzKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLnJlc3RvcmVQcm9kdWN0SWNvblRoZW1lKCkpIHsgLy8gY2hlY2tzIGlmIHRoZW1lIGZyb20gc2V0dGluZ3MgZXhpc3RzIGFuZCBpcyBzZXRcblx0XHRcdFx0Ly8gcmVzdG9yZSB0aGVtZVxuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZS5pZCA9PT0gREVGQVVMVF9QUk9EVUNUX0lDT05fVEhFTUVfSUQgJiYgIXR5cGVzLmlzVW5kZWZpbmVkKHByZXZQcm9kdWN0SWNvbklkKSAmJiB0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUlkKHByZXZQcm9kdWN0SWNvbklkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2V0UHJvZHVjdEljb25UaGVtZShwcmV2UHJvZHVjdEljb25JZCwgJ2F1dG8nKTtcblx0XHRcdFx0XHRwcmV2UHJvZHVjdEljb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5hZGRlZC5zb21lKHQgPT4gdC5zZXR0aW5nc0lkID09PSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLnNldHRpbmdzSWQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRDdXJyZW50UHJvZHVjdEljb25UaGVtZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LnJlbW92ZWQuc29tZSh0ID0+IHQuc2V0dGluZ3NJZCA9PT0gdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZS5zZXR0aW5nc0lkKSkge1xuXHRcdFx0XHQvLyBjdXJyZW50IHRoZW1lIGlzIG5vIGxvbmdlciBhdmFpbGFibGVcblx0XHRcdFx0cHJldlByb2R1Y3RJY29uSWQgPSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLmlkO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNldFByb2R1Y3RJY29uVGhlbWUoREVGQVVMVF9QUk9EVUNUX0lDT05fVEhFTUVfSUQsICdhdXRvJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVsb2FkQ3VycmVudEZpbGVJY29uVGhlbWUoKSkpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKFt0aGlzLmdldENvbG9yVGhlbWVzKCksIHRoaXMuZ2V0RmlsZUljb25UaGVtZXMoKSwgdGhpcy5nZXRQcm9kdWN0SWNvblRoZW1lcygpXSkudGhlbigoW2N0LCBmaXQsIHBpdF0pID0+IHtcblx0XHRcdHVwZGF0ZUNvbG9yVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhjdCk7XG5cdFx0XHR1cGRhdGVGaWxlSWNvblRoZW1lQ29uZmlndXJhdGlvblNjaGVtYXMoZml0KTtcblx0XHRcdHVwZGF0ZVByb2R1Y3RJY29uVGhlbWVDb25maWd1cmF0aW9uU2NoZW1hcyhwaXQpO1xuXHRcdH0pO1xuXHR9XG5cblxuXHQvLyBwcmVmZXJyZWQgc2NoZW1lIGhhbmRsaW5nXG5cblx0cHJpdmF0ZSBpbnN0YWxsUHJlZmVycmVkU2NoZW1lTGlzdGVuZXIoKSB7XG5cdFx0bGV0IHByZXZpb3VzID0geyBkYXJrOiB0aGlzLmhvc3RDb2xvclNlcnZpY2UuZGFyaywgaGlnaENvbnRyYXN0OiB0aGlzLmhvc3RDb2xvclNlcnZpY2UuaGlnaENvbnRyYXN0IH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3N0Q29sb3JTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29sb3JTY2hlbWUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdG9yZUNvbG9yVGhlbWUgPSB0aGlzLnNldHRpbmdzLmlzUHJlZmVycmVkQ29sb3JTY2hlbWVDaGFuZ2UocHJldmlvdXMpO1xuXHRcdFx0cHJldmlvdXMgPSB7IGRhcms6IHRoaXMuaG9zdENvbG9yU2VydmljZS5kYXJrLCBoaWdoQ29udHJhc3Q6IHRoaXMuaG9zdENvbG9yU2VydmljZS5oaWdoQ29udHJhc3QgfTtcblx0XHRcdGlmIChyZXN0b3JlQ29sb3JUaGVtZSkge1xuXHRcdFx0XHR0aGlzLnJlc3RvcmVDb2xvclRoZW1lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldENvbG9yVGhlbWUoKTogSVdvcmtiZW5jaENvbG9yVGhlbWUge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRDb2xvclRoZW1lO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldENvbG9yVGhlbWVzKCk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWVbXT4ge1xuXHRcdHJldHVybiB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5nZXRUaGVtZXMoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQcmVmZXJyZWRDb2xvclNjaGVtZSgpOiBDb2xvclNjaGVtZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3MuZ2V0UHJlZmVycmVkQ29sb3JTY2hlbWUoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRNYXJrZXRwbGFjZUNvbG9yVGhlbWVzKHB1Ymxpc2hlcjogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWVbXT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlVVJMKHsgcHVibGlzaGVyLCBuYW1lLCB2ZXJzaW9uIH0sICdleHRlbnNpb24nKTtcblx0XHRpZiAoZXh0ZW5zaW9uTG9jYXRpb24pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1hbmlmZXN0Q29udGVudCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShyZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sICdwYWNrYWdlLmpzb24nKSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNvbG9yVGhlbWVSZWdpc3RyeS5nZXRNYXJrZXRwbGFjZVRoZW1lcyhKU09OLnBhcnNlKG1hbmlmZXN0Q29udGVudCksIGV4dGVuc2lvbkxvY2F0aW9uLCBFeHRlbnNpb25EYXRhLmZyb21OYW1lKHB1Ymxpc2hlciwgbmFtZSkpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1Byb2JsZW0gbG9hZGluZyB0aGVtZXMgZnJvbSBtYXJrZXRwbGFjZScsIGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ29sb3JUaGVtZUNoYW5nZSgpOiBFdmVudDxJV29ya2JlbmNoQ29sb3JUaGVtZT4ge1xuXHRcdHJldHVybiB0aGlzLm9uQ29sb3JUaGVtZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb2xvclRoZW1lKHRoZW1lSWRPclRoZW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWUgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29sb3JUaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnRlcm5hbFNldENvbG9yVGhlbWUodGhlbWVJZE9yVGhlbWUsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW50ZXJuYWxTZXRDb2xvclRoZW1lKHRoZW1lSWRPclRoZW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgc2V0dGluZ3NUYXJnZXQ6IFRoZW1lU2V0dGluZ1RhcmdldCk6IFByb21pc2U8SVdvcmtiZW5jaENvbG9yVGhlbWUgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGVtZUlkT3JUaGVtZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHRoZW1lSWQgPSB0eXBlcy5pc1N0cmluZyh0aGVtZUlkT3JUaGVtZSkgPyB2YWxpZGF0ZVRoZW1lSWQodGhlbWVJZE9yVGhlbWUpIDogdGhlbWVJZE9yVGhlbWUuaWQ7XG5cdFx0aWYgKHRoaXMuY3VycmVudENvbG9yVGhlbWUuaXNMb2FkZWQgJiYgdGhlbWVJZCA9PT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS5pZCkge1xuXHRcdFx0aWYgKHNldHRpbmdzVGFyZ2V0ICE9PSAncHJldmlldycpIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZS50b1N0b3JhZ2UodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXR0aW5ncy5zZXRDb2xvclRoZW1lKHRoaXMuY3VycmVudENvbG9yVGhlbWUsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHR9XG5cblx0XHRsZXQgdGhlbWVEYXRhID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlJZCh0aGVtZUlkKTtcblx0XHRpZiAoIXRoZW1lRGF0YSkge1xuXHRcdFx0aWYgKHRoZW1lSWRPclRoZW1lIGluc3RhbmNlb2YgQ29sb3JUaGVtZURhdGEpIHtcblx0XHRcdFx0dGhlbWVEYXRhID0gdGhlbWVJZE9yVGhlbWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoZW1lRGF0YS5lbnN1cmVMb2FkZWQodGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXHRcdFx0dGhlbWVEYXRhLnNldEN1c3RvbWl6YXRpb25zKHRoaXMuc2V0dGluZ3MpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYXBwbHlUaGVtZSh0aGVtZURhdGEsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXJyb3IuY2Fubm90bG9hZHRoZW1lJywgXCJVbmFibGUgdG8gbG9hZCB7MH06IHsxfVwiLCB0aGVtZURhdGEubG9jYXRpb24/LnRvU3RyaW5nKCksIGVycm9yLm1lc3NhZ2UpKTtcblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgcmVsb2FkQ3VycmVudENvbG9yVGhlbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29sb3JUaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMuY29sb3JUaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZCh0aGlzLmN1cnJlbnRDb2xvclRoZW1lLnNldHRpbmdzSWQpIHx8IHRoaXMuY3VycmVudENvbG9yVGhlbWU7XG5cdFx0XHRcdGF3YWl0IHRoZW1lLnJlbG9hZCh0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk7XG5cdFx0XHRcdHRoZW1lLnNldEN1c3RvbWl6YXRpb25zKHRoaXMuc2V0dGluZ3MpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFwcGx5VGhlbWUodGhlbWUsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1VuYWJsZSB0byByZWxvYWQgezB9OiB7MX0nLCB0aGlzLmN1cnJlbnRDb2xvclRoZW1lLmxvY2F0aW9uPy50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXN0b3JlQ29sb3JUaGVtZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5jb2xvclRoZW1lU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNldHRpbmdJZCA9IHRoaXMuc2V0dGluZ3MuY29sb3JUaGVtZTtcblx0XHRcdGNvbnN0IHRoZW1lID0gdGhpcy5jb2xvclRoZW1lUmVnaXN0cnkuZmluZFRoZW1lQnlTZXR0aW5nc0lkKHNldHRpbmdJZCk7XG5cdFx0XHRpZiAodGhlbWUpIHtcblx0XHRcdFx0aWYgKHNldHRpbmdJZCAhPT0gdGhpcy5jdXJyZW50Q29sb3JUaGVtZS5zZXR0aW5nc0lkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnRlcm5hbFNldENvbG9yVGhlbWUodGhlbWUuaWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhlbWUgIT09IHRoaXMuY3VycmVudENvbG9yVGhlbWUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGVtZS5lbnN1cmVMb2FkZWQodGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXHRcdFx0XHRcdHRoZW1lLnNldEN1c3RvbWl6YXRpb25zKHRoaXMuc2V0dGluZ3MpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYXBwbHlUaGVtZSh0aGVtZSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRHluYW1pY0NTU1J1bGVzKHRoZW1lRGF0YTogSUNvbG9yVGhlbWUpIHtcblx0XHRjb25zdCBjc3MgPSBnZW5lcmF0ZUNvbG9yVGhlbWVDU1MoXG5cdFx0XHR0aGVtZURhdGEsXG5cdFx0XHQnLm1vbmFjby13b3JrYmVuY2gnLFxuXHRcdFx0dGhlbWluZ1JlZ2lzdHJ5LmdldFRoZW1pbmdQYXJ0aWNpcGFudHMoKSxcblx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlXG5cdFx0KTtcblx0XHRfYXBwbHlSdWxlcyhjc3MuY29kZSwgY29sb3JUaGVtZVJ1bGVzQ2xhc3NOYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlUaGVtZShuZXdUaGVtZTogQ29sb3JUaGVtZURhdGEsIHNldHRpbmdzVGFyZ2V0OiBUaGVtZVNldHRpbmdUYXJnZXQsIHNpbGVudCA9IGZhbHNlKTogUHJvbWlzZTxJV29ya2JlbmNoQ29sb3JUaGVtZSB8IG51bGw+IHtcblx0XHR0aGlzLnVwZGF0ZUR5bmFtaWNDU1NSdWxlcyhuZXdUaGVtZSk7XG5cblx0XHRpZiAodGhpcy5jdXJyZW50Q29sb3JUaGVtZS5pZCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSguLi50aGlzLmN1cnJlbnRDb2xvclRoZW1lLmNsYXNzTmFtZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKFRoZW1lVHlwZVNlbGVjdG9yLlZTLCBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLLCBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSywgVGhlbWVUeXBlU2VsZWN0b3IuSENfTElHSFQpO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKC4uLm5ld1RoZW1lLmNsYXNzTmFtZXMpO1xuXG5cdFx0dGhpcy5jdXJyZW50Q29sb3JUaGVtZS5jbGVhckNhY2hlcygpO1xuXHRcdHRoaXMuY3VycmVudENvbG9yVGhlbWUgPSBuZXdUaGVtZTtcblx0XHRpZiAoIXRoaXMuY29sb3JUaGVtaW5nUGFydGljaXBhbnRDaGFuZ2VMaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5jb2xvclRoZW1pbmdQYXJ0aWNpcGFudENoYW5nZUxpc3RlbmVyID0gdGhlbWluZ1JlZ2lzdHJ5Lm9uVGhlbWluZ1BhcnRpY2lwYW50QWRkZWQoXyA9PiB0aGlzLnVwZGF0ZUR5bmFtaWNDU1NSdWxlcyh0aGlzLmN1cnJlbnRDb2xvclRoZW1lKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb2xvclRoZW1lV2F0Y2hlci51cGRhdGUobmV3VGhlbWUpO1xuXG5cdFx0dGhpcy5zZW5kVGVsZW1ldHJ5KG5ld1RoZW1lLmlkLCBuZXdUaGVtZS5leHRlbnNpb25EYXRhLCAnY29sb3InKTtcblxuXHRcdGlmIChzaWxlbnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5vbkNvbG9yVGhlbWVDaGFuZ2UuZmlyZSh0aGlzLmN1cnJlbnRDb2xvclRoZW1lKTtcblxuXHRcdC8vIHJlbWVtYmVyIHRoZW1lIGRhdGEgZm9yIGEgcXVpY2sgcmVzdG9yZVxuXHRcdGlmIChuZXdUaGVtZS5pc0xvYWRlZCAmJiBzZXR0aW5nc1RhcmdldCAhPT0gJ3ByZXZpZXcnKSB7XG5cdFx0XHRuZXdUaGVtZS50b1N0b3JhZ2UodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3Muc2V0Q29sb3JUaGVtZSh0aGlzLmN1cnJlbnRDb2xvclRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cdH1cblxuXG5cdHByaXZhdGUgdGhlbWVFeHRlbnNpb25zQWN0aXZhdGVkID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdHByaXZhdGUgc2VuZFRlbGVtZXRyeSh0aGVtZUlkOiBzdHJpbmcsIHRoZW1lRGF0YTogRXh0ZW5zaW9uRGF0YSB8IHVuZGVmaW5lZCwgdGhlbWVUeXBlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhlbWVEYXRhKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGVtZVR5cGUgKyB0aGVtZURhdGEuZXh0ZW5zaW9uSWQ7XG5cdFx0XHRpZiAoIXRoaXMudGhlbWVFeHRlbnNpb25zQWN0aXZhdGVkLmdldChrZXkpKSB7XG5cdFx0XHRcdHR5cGUgQWN0aXZhdGVQbHVnaW5DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRvd25lcjogJ2Flc2NobGknO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdBbiBldmVudCBpcyBmaXJlZCB3aGVuIGFuIGNvbG9yIHRoZW1lIGV4dGVuc2lvbiBpcyBmaXJzdCB1c2VkIGFzIGl0IHByb3ZpZGVzIHRoZSBjdXJyZW50bHkgc2hvd24gY29sb3IgdGhlbWUuJztcblx0XHRcdFx0XHRpZDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZXh0ZW5zaW9uIGlkLicgfTtcblx0XHRcdFx0XHRuYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gbmFtZS4nIH07XG5cdFx0XHRcdFx0aXNCdWlsdGluOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgZXh0ZW5zaW9uIGlzIGEgYnVpbHQtaW4gZXh0ZW5zaW9uLicgfTtcblx0XHRcdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gcHVibGlzaGVyIGlkLicgfTtcblx0XHRcdFx0XHR0aGVtZUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZCBvZiB0aGUgdGhlbWUgdGhhdCB0cmlnZ2VyZWQgdGhlIGZpcnN0IGV4dGVuc2lvbiB1c2UuJyB9O1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0eXBlIEFjdGl2YXRlUGx1Z2luRXZlbnQgPSB7XG5cdFx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHRcdFx0aXNCdWlsdGluOiBib29sZWFuO1xuXHRcdFx0XHRcdHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0XHRcdFx0dGhlbWVJZDogc3RyaW5nO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBY3RpdmF0ZVBsdWdpbkV2ZW50LCBBY3RpdmF0ZVBsdWdpbkNsYXNzaWZpY2F0aW9uPignYWN0aXZhdGVUaGVtZUV4dGVuc2lvbicsIHtcblx0XHRcdFx0XHRpZDogdGhlbWVEYXRhLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdG5hbWU6IHRoZW1lRGF0YS5leHRlbnNpb25OYW1lLFxuXHRcdFx0XHRcdGlzQnVpbHRpbjogdGhlbWVEYXRhLmV4dGVuc2lvbklzQnVpbHRpbixcblx0XHRcdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogdGhlbWVEYXRhLmV4dGVuc2lvblB1Ymxpc2hlcixcblx0XHRcdFx0XHR0aGVtZUlkOiB0aGVtZUlkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLnRoZW1lRXh0ZW5zaW9uc0FjdGl2YXRlZC5zZXQoa2V5LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RmlsZUljb25UaGVtZXMoKTogUHJvbWlzZTxJV29ya2JlbmNoRmlsZUljb25UaGVtZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmdldFRoZW1lcygpO1xuXHR9XG5cblx0cHVibGljIGdldEZpbGVJY29uVGhlbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSgpOiBFdmVudDxJV29ya2JlbmNoRmlsZUljb25UaGVtZT4ge1xuXHRcdHJldHVybiB0aGlzLm9uRmlsZUljb25UaGVtZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRGaWxlSWNvblRoZW1lKGljb25UaGVtZU9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hGaWxlSWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoRmlsZUljb25UaGVtZT4ge1xuXHRcdHJldHVybiB0aGlzLmZpbGVJY29uVGhlbWVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW50ZXJuYWxTZXRGaWxlSWNvblRoZW1lKGljb25UaGVtZU9ySWQsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW50ZXJuYWxTZXRGaWxlSWNvblRoZW1lKGljb25UaGVtZU9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hGaWxlSWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoRmlsZUljb25UaGVtZT4ge1xuXHRcdGlmIChpY29uVGhlbWVPcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGljb25UaGVtZU9ySWQgPSAnJztcblx0XHR9XG5cdFx0Y29uc3QgdGhlbWVJZCA9IHR5cGVzLmlzU3RyaW5nKGljb25UaGVtZU9ySWQpID8gaWNvblRoZW1lT3JJZCA6IGljb25UaGVtZU9ySWQuaWQ7XG5cdFx0aWYgKHRoZW1lSWQgIT09IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuaWQgfHwgIXRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuaXNMb2FkZWQpIHtcblxuXHRcdFx0bGV0IG5ld1RoZW1lRGF0YSA9IHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5SWQodGhlbWVJZCk7XG5cdFx0XHRpZiAoIW5ld1RoZW1lRGF0YSAmJiBpY29uVGhlbWVPcklkIGluc3RhbmNlb2YgRmlsZUljb25UaGVtZURhdGEpIHtcblx0XHRcdFx0bmV3VGhlbWVEYXRhID0gaWNvblRoZW1lT3JJZDtcblx0XHRcdH1cblx0XHRcdGlmICghbmV3VGhlbWVEYXRhKSB7XG5cdFx0XHRcdG5ld1RoZW1lRGF0YSA9IEZpbGVJY29uVGhlbWVEYXRhLm5vSWNvblRoZW1lO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgbmV3VGhlbWVEYXRhLmVuc3VyZUxvYWRlZCh0aGlzLmZpbGVJY29uVGhlbWVMb2FkZXIpO1xuXG5cdFx0XHR0aGlzLmFwcGx5QW5kU2V0RmlsZUljb25UaGVtZShuZXdUaGVtZURhdGEpOyAvLyB1cGRhdGVzIHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWVcblx0XHR9XG5cblx0XHRjb25zdCB0aGVtZURhdGEgPSB0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lO1xuXG5cdFx0Ly8gcmVtZW1iZXIgdGhlbWUgZGF0YSBmb3IgYSBxdWljayByZXN0b3JlXG5cdFx0aWYgKHRoZW1lRGF0YS5pc0xvYWRlZCAmJiBzZXR0aW5nc1RhcmdldCAhPT0gJ3ByZXZpZXcnICYmICghdGhlbWVEYXRhLmxvY2F0aW9uIHx8ICFnZXRSZW1vdGVBdXRob3JpdHkodGhlbWVEYXRhLmxvY2F0aW9uKSkpIHtcblx0XHRcdHRoZW1lRGF0YS50b1N0b3JhZ2UodGhpcy5zdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2V0dGluZ3Muc2V0RmlsZUljb25UaGVtZSh0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldCk7XG5cblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldE1hcmtldHBsYWNlRmlsZUljb25UaGVtZXMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogUHJvbWlzZTxJV29ya2JlbmNoRmlsZUljb25UaGVtZVtdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoeyBwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24gfSwgJ2V4dGVuc2lvbicpO1xuXHRcdGlmIChleHRlbnNpb25Mb2NhdGlvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3RDb250ZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmdldE1hcmtldHBsYWNlVGhlbWVzKEpTT04ucGFyc2UobWFuaWZlc3RDb250ZW50KSwgZXh0ZW5zaW9uTG9jYXRpb24sIEV4dGVuc2lvbkRhdGEuZnJvbU5hbWUocHVibGlzaGVyLCBuYW1lKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignUHJvYmxlbSBsb2FkaW5nIHRoZW1lcyBmcm9tIG1hcmtldHBsYWNlJywgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkQ3VycmVudEZpbGVJY29uVGhlbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lLnJlbG9hZCh0aGlzLmZpbGVJY29uVGhlbWVMb2FkZXIpO1xuXHRcdFx0dGhpcy5hcHBseUFuZFNldEZpbGVJY29uVGhlbWUodGhpcy5jdXJyZW50RmlsZUljb25UaGVtZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzdG9yZUZpbGVJY29uVGhlbWUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZUljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXR0aW5nSWQgPSB0aGlzLnNldHRpbmdzLmZpbGVJY29uVGhlbWU7XG5cdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMuZmlsZUljb25UaGVtZVJlZ2lzdHJ5LmZpbmRUaGVtZUJ5U2V0dGluZ3NJZChzZXR0aW5nSWQpO1xuXHRcdFx0aWYgKHRoZW1lKSB7XG5cdFx0XHRcdGlmIChzZXR0aW5nSWQgIT09IHRoaXMuY3VycmVudEZpbGVJY29uVGhlbWUuc2V0dGluZ3NJZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW50ZXJuYWxTZXRGaWxlSWNvblRoZW1lKHRoZW1lLmlkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoZW1lICE9PSB0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhlbWUuZW5zdXJlTG9hZGVkKHRoaXMuZmlsZUljb25UaGVtZUxvYWRlcik7XG5cdFx0XHRcdFx0dGhpcy5hcHBseUFuZFNldEZpbGVJY29uVGhlbWUodGhlbWUsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUFuZFNldEZpbGVJY29uVGhlbWUoaWNvblRoZW1lRGF0YTogRmlsZUljb25UaGVtZURhdGEsIHNpbGVudCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5jdXJyZW50RmlsZUljb25UaGVtZSA9IGljb25UaGVtZURhdGE7XG5cblx0XHRfYXBwbHlSdWxlcyhpY29uVGhlbWVEYXRhLnN0eWxlU2hlZXRDb250ZW50ISwgZmlsZUljb25UaGVtZVJ1bGVzQ2xhc3NOYW1lKTtcblxuXHRcdGlmIChpY29uVGhlbWVEYXRhLmlkKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGZpbGVJY29uc0VuYWJsZWRDbGFzcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoZmlsZUljb25zRW5hYmxlZENsYXNzKTtcblx0XHR9XG5cblx0XHR0aGlzLmZpbGVJY29uVGhlbWVXYXRjaGVyLnVwZGF0ZShpY29uVGhlbWVEYXRhKTtcblxuXHRcdGlmIChpY29uVGhlbWVEYXRhLmlkKSB7XG5cdFx0XHR0aGlzLnNlbmRUZWxlbWV0cnkoaWNvblRoZW1lRGF0YS5pZCwgaWNvblRoZW1lRGF0YS5leHRlbnNpb25EYXRhLCAnZmlsZUljb24nKTtcblx0XHR9XG5cblx0XHRpZiAoIXNpbGVudCkge1xuXHRcdFx0dGhpcy5vbkZpbGVJY29uVGhlbWVDaGFuZ2UuZmlyZSh0aGlzLmN1cnJlbnRGaWxlSWNvblRoZW1lKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0UHJvZHVjdEljb25UaGVtZXMoKTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmdldFRoZW1lcygpO1xuXHR9XG5cblx0cHVibGljIGdldFByb2R1Y3RJY29uVGhlbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkUHJvZHVjdEljb25UaGVtZUNoYW5nZSgpOiBFdmVudDxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT4ge1xuXHRcdHJldHVybiB0aGlzLm9uUHJvZHVjdEljb25UaGVtZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZXRQcm9kdWN0SWNvblRoZW1lKGljb25UaGVtZU9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT4ge1xuXHRcdHJldHVybiB0aGlzLnByb2R1Y3RJY29uVGhlbWVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW50ZXJuYWxTZXRQcm9kdWN0SWNvblRoZW1lKGljb25UaGVtZU9ySWQsIHNldHRpbmdzVGFyZ2V0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW50ZXJuYWxTZXRQcm9kdWN0SWNvblRoZW1lKGljb25UaGVtZU9ySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB8IElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lLCBzZXR0aW5nc1RhcmdldDogVGhlbWVTZXR0aW5nVGFyZ2V0KTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZT4ge1xuXHRcdGlmIChpY29uVGhlbWVPcklkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGljb25UaGVtZU9ySWQgPSAnJztcblx0XHR9XG5cdFx0Y29uc3QgdGhlbWVJZCA9IHR5cGVzLmlzU3RyaW5nKGljb25UaGVtZU9ySWQpID8gaWNvblRoZW1lT3JJZCA6IGljb25UaGVtZU9ySWQuaWQ7XG5cdFx0aWYgKHRoZW1lSWQgIT09IHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUuaWQgfHwgIXRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUuaXNMb2FkZWQpIHtcblx0XHRcdGxldCBuZXdUaGVtZURhdGEgPSB0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeUlkKHRoZW1lSWQpO1xuXHRcdFx0aWYgKCFuZXdUaGVtZURhdGEgJiYgaWNvblRoZW1lT3JJZCBpbnN0YW5jZW9mIFByb2R1Y3RJY29uVGhlbWVEYXRhKSB7XG5cdFx0XHRcdG5ld1RoZW1lRGF0YSA9IGljb25UaGVtZU9ySWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5ld1RoZW1lRGF0YSkge1xuXHRcdFx0XHRuZXdUaGVtZURhdGEgPSBQcm9kdWN0SWNvblRoZW1lRGF0YS5kZWZhdWx0VGhlbWU7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXdUaGVtZURhdGEuZW5zdXJlTG9hZGVkKHRoaXMuZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0XHR0aGlzLmFwcGx5QW5kU2V0UHJvZHVjdEljb25UaGVtZShuZXdUaGVtZURhdGEpOyAvLyB1cGRhdGVzIHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWVcblx0XHR9XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZTtcblxuXHRcdC8vIHJlbWVtYmVyIHRoZW1lIGRhdGEgZm9yIGEgcXVpY2sgcmVzdG9yZVxuXHRcdGlmICh0aGVtZURhdGEuaXNMb2FkZWQgJiYgc2V0dGluZ3NUYXJnZXQgIT09ICdwcmV2aWV3JyAmJiAoIXRoZW1lRGF0YS5sb2NhdGlvbiB8fCAhZ2V0UmVtb3RlQXV0aG9yaXR5KHRoZW1lRGF0YS5sb2NhdGlvbikpKSB7XG5cdFx0XHR0aGVtZURhdGEudG9TdG9yYWdlKHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnNldHRpbmdzLnNldFByb2R1Y3RJY29uVGhlbWUodGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSwgc2V0dGluZ3NUYXJnZXQpO1xuXG5cdFx0cmV0dXJuIHRoZW1lRGF0YTtcblxuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldE1hcmtldHBsYWNlUHJvZHVjdEljb25UaGVtZXMocHVibGlzaGVyOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgdmVyc2lvbjogc3RyaW5nKTogUHJvbWlzZTxJV29ya2JlbmNoUHJvZHVjdEljb25UaGVtZVtdPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5nZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoeyBwdWJsaXNoZXIsIG5hbWUsIHZlcnNpb24gfSwgJ2V4dGVuc2lvbicpO1xuXHRcdGlmIChleHRlbnNpb25Mb2NhdGlvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWFuaWZlc3RDb250ZW50ID0gYXdhaXQgdGhpcy5leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgJ3BhY2thZ2UuanNvbicpKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvZHVjdEljb25UaGVtZVJlZ2lzdHJ5LmdldE1hcmtldHBsYWNlVGhlbWVzKEpTT04ucGFyc2UobWFuaWZlc3RDb250ZW50KSwgZXh0ZW5zaW9uTG9jYXRpb24sIEV4dGVuc2lvbkRhdGEuZnJvbU5hbWUocHVibGlzaGVyLCBuYW1lKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignUHJvYmxlbSBsb2FkaW5nIHRoZW1lcyBmcm9tIG1hcmtldHBsYWNlJywgZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkQ3VycmVudFByb2R1Y3RJY29uVGhlbWUoKSB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZHVjdEljb25UaGVtZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLnJlbG9hZCh0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuYXBwbHlBbmRTZXRQcm9kdWN0SWNvblRoZW1lKHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc3RvcmVQcm9kdWN0SWNvblRoZW1lKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLnByb2R1Y3RJY29uVGhlbWVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0lkID0gdGhpcy5zZXR0aW5ncy5wcm9kdWN0SWNvblRoZW1lO1xuXHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLnByb2R1Y3RJY29uVGhlbWVSZWdpc3RyeS5maW5kVGhlbWVCeVNldHRpbmdzSWQoc2V0dGluZ0lkKTtcblx0XHRcdGlmICh0aGVtZSkge1xuXHRcdFx0XHRpZiAoc2V0dGluZ0lkICE9PSB0aGlzLmN1cnJlbnRQcm9kdWN0SWNvblRoZW1lLnNldHRpbmdzSWQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmludGVybmFsU2V0UHJvZHVjdEljb25UaGVtZSh0aGVtZS5pZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGVtZSAhPT0gdGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoZW1lLmVuc3VyZUxvYWRlZCh0aGlzLmV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHR0aGlzLmFwcGx5QW5kU2V0UHJvZHVjdEljb25UaGVtZSh0aGVtZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5QW5kU2V0UHJvZHVjdEljb25UaGVtZShpY29uVGhlbWVEYXRhOiBQcm9kdWN0SWNvblRoZW1lRGF0YSwgc2lsZW50ID0gZmFsc2UpOiB2b2lkIHtcblxuXHRcdHRoaXMuY3VycmVudFByb2R1Y3RJY29uVGhlbWUgPSBpY29uVGhlbWVEYXRhO1xuXG5cdFx0X2FwcGx5UnVsZXMoaWNvblRoZW1lRGF0YS5zdHlsZVNoZWV0Q29udGVudCEsIHByb2R1Y3RJY29uVGhlbWVSdWxlc0NsYXNzTmFtZSk7XG5cblx0XHR0aGlzLnByb2R1Y3RJY29uVGhlbWVXYXRjaGVyLnVwZGF0ZShpY29uVGhlbWVEYXRhKTtcblxuXHRcdGlmIChpY29uVGhlbWVEYXRhLmlkKSB7XG5cdFx0XHR0aGlzLnNlbmRUZWxlbWV0cnkoaWNvblRoZW1lRGF0YS5pZCwgaWNvblRoZW1lRGF0YS5leHRlbnNpb25EYXRhLCAncHJvZHVjdEljb24nKTtcblx0XHR9XG5cdFx0aWYgKCFzaWxlbnQpIHtcblx0XHRcdHRoaXMub25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlLmZpcmUodGhpcy5jdXJyZW50UHJvZHVjdEljb25UaGVtZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRoZW1lRmlsZVdhdGNoZXIge1xuXG5cdHByaXZhdGUgd2F0Y2hlZExvY2F0aW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2F0Y2hlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvblVwZGF0ZTogKCkgPT4gdm9pZFxuXHQpIHsgfVxuXG5cdHVwZGF0ZSh0aGVtZTogeyBsb2NhdGlvbj86IFVSSTsgd2F0Y2g/OiBib29sZWFuIH0pIHtcblx0XHRpZiAoIXJlc291cmNlcy5pc0VxdWFsKHRoZW1lLmxvY2F0aW9uLCB0aGlzLndhdGNoZWRMb2NhdGlvbikpIHtcblx0XHRcdHRoaXMud2F0Y2hlZExvY2F0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53YXRjaGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0aWYgKHRoZW1lLmxvY2F0aW9uICYmICh0aGVtZS53YXRjaCB8fCB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSkge1xuXHRcdFx0XHR0aGlzLndhdGNoZWRMb2NhdGlvbiA9IHRoZW1lLmxvY2F0aW9uO1xuXHRcdFx0XHR0aGlzLndhdGNoZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS53YXRjaCh0aGVtZS5sb2NhdGlvbikpO1xuXHRcdFx0XHR0aGlzLndhdGNoZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLndhdGNoZWRMb2NhdGlvbiAmJiBlLmNvbnRhaW5zKHRoaXMud2F0Y2hlZExvY2F0aW9uLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5vblVwZGF0ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy53YXRjaGVyRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMud2F0Y2hlZExvY2F0aW9uID0gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9hcHBseVJ1bGVzKHN0eWxlU2hlZXRDb250ZW50OiBzdHJpbmcsIHJ1bGVzQ2xhc3NOYW1lOiBzdHJpbmcpIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGNvbnN0IHRoZW1lU3R5bGVzID0gbWFpbldpbmRvdy5kb2N1bWVudC5oZWFkLmdldEVsZW1lbnRzQnlDbGFzc05hbWUocnVsZXNDbGFzc05hbWUpO1xuXHRpZiAodGhlbWVTdHlsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0Y29uc3QgZWxTdHlsZSA9IGNyZWF0ZVN0eWxlU2hlZXQoKTtcblx0XHRlbFN0eWxlLmNsYXNzTmFtZSA9IHJ1bGVzQ2xhc3NOYW1lO1xuXHRcdGVsU3R5bGUudGV4dENvbnRlbnQgPSBzdHlsZVNoZWV0Q29udGVudDtcblx0fSBlbHNlIHtcblx0XHQoPEhUTUxTdHlsZUVsZW1lbnQ+dGhlbWVTdHlsZXNbMF0pLnRleHRDb250ZW50ID0gc3R5bGVTaGVldENvbnRlbnQ7XG5cdH1cbn1cblxucmVnaXN0ZXJDb2xvclRoZW1lU2NoZW1hcygpO1xucmVnaXN0ZXJGaWxlSWNvblRoZW1lU2NoZW1hcygpO1xucmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lU2NoZW1hcygpO1xuXG4vLyBUaGUgV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHNob3VsZCBzdGF5IGVhZ2VyIGFzIHRoZSBjb25zdHJ1Y3RvciByZXN0b3JlcyB0aGVcbi8vIGxhc3QgdXNlZCBjb2xvcnMgLyBpY29ucyBmcm9tIHN0b3JhZ2UuIFRoaXMgbmVlZHMgdG8gaGFwcGVuIGFzIHF1aWNrbHkgYXMgcG9zc2libGVcbi8vIGZvciBhIGZsaWNrZXItZnJlZSBzdGFydHVwIGV4cGVyaWVuY2UuXG5yZWdpc3RlclNpbmdsZXRvbihJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLCBXb3JrYmVuY2hUaGVtZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBw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
