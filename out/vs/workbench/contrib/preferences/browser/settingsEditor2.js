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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { ToggleActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../base/common/actions.js";
import { createCancelablePromise, Delayer, raceTimeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Color } from "../../../../base/common/color.js";
import { fromNow } from "../../../../base/common/date.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncStatus } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING, IPreferencesService, SettingMatchType, SettingValueType, validateSettingsEditorOptions } from "../../../services/preferences/common/preferences.js";
import { nullRange, Settings2EditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IUserDataSyncWorkbenchService } from "../../../services/userDataSync/common/userDataSync.js";
import { SuggestEnabledInputWithHistory } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { ADVANCED_SETTING_TAG, AGENTS_WINDOW_SETTING_TAG, CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_FIRST_ROW_FOCUS, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, EMBEDDINGS_SEARCH_PROVIDER_NAME, ENABLE_LANGUAGE_FILTER, EXTENSION_FETCH_TIMEOUT_MS, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, FILTER_MODEL_SEARCH_PROVIDER_NAME, getExperimentalExtensionToggleData, ID_SETTING_TAG, IPreferencesSearchService, LANGUAGE_SETTING_TAG, LLM_RANKED_SEARCH_PROVIDER_NAME, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS, SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME, WorkbenchSettingsEditorSettings, WORKSPACE_TRUST_SETTING_TAG } from "../common/preferences.js";
import { settingsHeaderBorder, settingsSashBorder, settingsTextInputBorder } from "../common/settingsEditorColorRegistry.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import "./media/settingsEditor2.css";
import { preferencesAiResultsIcon, preferencesClearInputIcon, preferencesFilterIcon } from "./preferencesIcons.js";
import { SettingsTargetsWidget } from "./preferencesWidgets.js";
import { getCommonlyUsedData, tocData } from "./settingsLayout.js";
import { SettingsSearchFilterDropdownMenuActionViewItem } from "./settingsSearchMenu.js";
import { AbstractSettingRenderer, createTocTreeForExtensionSettings, resolveConfiguredUntrustedSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from "./settingsTree.js";
import { parseQuery, SearchResultIdx, SearchResultModel, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from "./settingsTreeModels.js";
import { createTOCIterator, TOCTree, TOCTreeModel } from "./tocTree.js";
var SettingsFocusContext = /* @__PURE__ */ ((SettingsFocusContext2) => {
  SettingsFocusContext2[SettingsFocusContext2["Search"] = 0] = "Search";
  SettingsFocusContext2[SettingsFocusContext2["TableOfContents"] = 1] = "TableOfContents";
  SettingsFocusContext2[SettingsFocusContext2["SettingTree"] = 2] = "SettingTree";
  SettingsFocusContext2[SettingsFocusContext2["SettingControl"] = 3] = "SettingControl";
  return SettingsFocusContext2;
})(SettingsFocusContext || {});
function createGroupIterator(group) {
  return Iterable.map(group.children, (g) => {
    return {
      element: g,
      children: g instanceof SettingsTreeGroupElement ? createGroupIterator(g) : void 0
    };
  });
}
const $ = DOM.$;
const searchBoxLabel = localize("SearchSettings.AriaLabel", "Search settings");
const searchBoxPlaceholderWithHistory = localize({
  key: "SearchSettings.PlaceholderWithHistory",
  comment: ["Placeholder for the settings search input hinting that the up and down arrow keys navigate the search history. The character inserted for {0} is \u21C5 to represent the up and down arrow keys."]
}, "Search settings ({0} for history)", "\u21C5");
const SEARCH_TOC_BEHAVIOR_KEY = "workbench.settings.settingsSearchTocBehavior";
const SHOW_AI_RESULTS_ENABLED_LABEL = localize("showAiResultsEnabled", "Show AI-recommended results");
const SHOW_AI_RESULTS_DISABLED_LABEL = localize("showAiResultsDisabled", "No AI results available at this time...");
const SETTINGS_EDITOR_STATE_KEY = "settingsEditorState";
let SettingsEditor2 = class extends EditorPane {
  constructor(group, telemetryService, configurationService, textResourceConfigurationService, themeService, preferencesService, instantiationService, preferencesSearchService, logService, contextKeyService, storageService, editorGroupService, userDataSyncWorkbenchService, userDataSyncEnablementService, workspaceTrustManagementService, extensionService, languageService, extensionManagementService, productService, extensionGalleryService, editorProgressService, userDataProfileService, keybindingService, chatEntitlementService, environmentService) {
    super(SettingsEditor2.ID, group, telemetryService, themeService, storageService);
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
    this.instantiationService = instantiationService;
    this.preferencesSearchService = preferencesSearchService;
    this.logService = logService;
    this.storageService = storageService;
    this.editorGroupService = editorGroupService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.extensionService = extensionService;
    this.languageService = languageService;
    this.extensionManagementService = extensionManagementService;
    this.productService = productService;
    this.extensionGalleryService = extensionGalleryService;
    this.editorProgressService = editorProgressService;
    this.keybindingService = keybindingService;
    this.chatEntitlementService = chatEntitlementService;
    this.environmentService = environmentService;
    this.searchContainer = null;
    this.settingsTreeModel = this._register(new MutableDisposable());
    this.searchInProgress = null;
    this.aiSearchPromise = null;
    /**
     * The trimmed query value that the currently rendered results reflect. Used to determine
     * whether the displayed results are up to date with the current search input value before
     * moving focus into the results.
     */
    this.renderedSearchQuery = "";
    this.showAiResultsAction = null;
    this.pendingSettingUpdate = null;
    this._searchResultModel = this._register(new MutableDisposable());
    this.searchResultLabel = null;
    this.lastSyncedLabel = null;
    this.settingsOrderByTocIndex = null;
    this._currentFocusContext = 0 /* Search */;
    /** Don't spam warnings */
    this.hasWarnedMissingSettings = false;
    this.tocTreeDisposed = false;
    this.tocFocusedElement = null;
    this.treeFocusedElement = null;
    this.settingsTreeScrollTop = 0;
    this.installedExtensionIds = [];
    this.dismissedExtensionSettings = [];
    this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY = "settingsEditor2.dismissedExtensionSettings";
    this.DISMISSED_EXTENSION_SETTINGS_DELIMITER = "	";
    this.SEARCH_HISTORY_STORAGE_KEY = "settingsEditor2.searchHistory";
    this.searchInputActionBar = null;
    this.searchDelayer = this._register(new Delayer(200));
    this.viewState = { settingsTarget: ConfigurationTarget.USER_LOCAL };
    this.settingFastUpdateDelayer = this._register(new Delayer(SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE));
    this.settingSlowUpdateDelayer = this._register(new Delayer(SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE));
    this.searchInputDelayer = this._register(new Delayer(SettingsEditor2.SEARCH_DEBOUNCE));
    this.updatedConfigSchemaDelayer = this._register(new Delayer(SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER));
    this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
    this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
    this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);
    this.settingRowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);
    this.settingFirstRowFocused = CONTEXT_SETTINGS_FIRST_ROW_FOCUS.bindTo(contextKeyService);
    this.aiResultsAvailable = CONTEXT_AI_SETTING_RESULTS_AVAILABLE.bindTo(contextKeyService);
    this.scheduledRefreshes = /* @__PURE__ */ new Map();
    this.editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, SETTINGS_EDITOR_STATE_KEY);
    this.dismissedExtensionSettings = this.storageService.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, "").split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(WorkbenchSettingsEditorSettings.ShowAISearchToggle) || e.affectedKeys.has(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch)) {
        this.updateAiSearchToggleVisibility();
      }
      if (e.affectsConfiguration(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING)) {
        this.onConfigUpdate(void 0, true, true);
      }
      if (e.source !== ConfigurationTarget.DEFAULT) {
        this.onConfigUpdate(e.affectedKeys);
      }
    }));
    this._register(chatEntitlementService.onDidChangeSentiment(() => {
      this.updateAiSearchToggleVisibility();
    }));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      e.join(this.whenCurrentProfileChanged());
    }));
    this._register(workspaceTrustManagementService.onDidChangeTrust(() => {
      this.searchResultModel?.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
      if (this.settingsTreeModel.value) {
        this.settingsTreeModel.value.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
        this.renderTree();
      }
    }));
    this._register(configurationService.onDidChangeRestrictedSettings((e) => {
      if (e.default.length && this.currentSettingsModel) {
        this.updateElementsByKey(new Set(e.default));
      }
    }));
    this._register(extensionManagementService.onDidInstallExtensions(() => {
      this.refreshInstalledExtensionsList();
    }));
    this._register(extensionManagementService.onDidUninstallExtension(() => {
      this.refreshInstalledExtensionsList();
    }));
    this.modelDisposables = this._register(new DisposableStore());
    if (ENABLE_LANGUAGE_FILTER && !SettingsEditor2.SUGGESTIONS.includes(`@${LANGUAGE_SETTING_TAG}`)) {
      SettingsEditor2.SUGGESTIONS.push(`@${LANGUAGE_SETTING_TAG}`);
    }
    if (this.environmentService.isSessionsWindow && !SettingsEditor2.SUGGESTIONS.includes(`@${AGENTS_WINDOW_SETTING_TAG}`)) {
      SettingsEditor2.SUGGESTIONS.push(`@${AGENTS_WINDOW_SETTING_TAG}`);
    }
    this.inputChangeListener = this._register(new MutableDisposable());
  }
  static shouldSettingUpdateFast(type) {
    if (Array.isArray(type)) {
      return false;
    }
    return type === SettingValueType.Enum || type === SettingValueType.Array || type === SettingValueType.BooleanObject || type === SettingValueType.Object || type === SettingValueType.Complex || type === SettingValueType.Boolean || type === SettingValueType.Exclude || type === SettingValueType.Include;
  }
  async whenCurrentProfileChanged() {
    this.updatedConfigSchemaDelayer.trigger(() => {
      this.dismissedExtensionSettings = this.storageService.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, "").split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
      this.onConfigUpdate(void 0, true);
    });
  }
  canShowAdvancedSettings() {
    if (this.configurationService.getValue(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING) ?? false) {
      return true;
    }
    return this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG) ?? false;
  }
  /**
   * Determines whether a setting should be shown even when advanced settings are filtered out.
   * Returns true if:
   * - The setting is not tagged as advanced, OR
   * - The setting matches an ID filter (@id:settingKey), OR
   * - The setting key appears in the search query, OR
   * - The @hasPolicy filter is active (policy settings should always be shown when filtering by policy)
   */
  shouldShowSetting(setting) {
    if (!setting.tags?.includes(ADVANCED_SETTING_TAG)) {
      return true;
    }
    if (this.viewState.idFilters?.has(setting.key)) {
      return true;
    }
    if (this.viewState.query?.toLowerCase().includes(setting.key.toLowerCase())) {
      return true;
    }
    if (this.viewState.tagFilters?.has(POLICY_SETTING_TAG)) {
      return true;
    }
    return false;
  }
  disableAiSearchToggle() {
    if (this.showAiResultsAction) {
      this.showAiResultsAction.checked = false;
      this.showAiResultsAction.enabled = false;
      this.aiResultsAvailable.set(false);
      this.showAiResultsAction.label = SHOW_AI_RESULTS_DISABLED_LABEL;
    }
  }
  updateAiSearchToggleVisibility() {
    if (!this.searchContainer || !this.showAiResultsAction || !this.searchInputActionBar) {
      return;
    }
    const showAiToggle = this.configurationService.getValue(WorkbenchSettingsEditorSettings.ShowAISearchToggle);
    const enableNaturalLanguageSearch = this.configurationService.getValue(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch);
    const chatHidden = this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabled;
    const canShowToggle = showAiToggle && enableNaturalLanguageSearch && !chatHidden;
    const alreadyVisible = this.searchInputActionBar.hasAction(this.showAiResultsAction);
    if (!alreadyVisible && canShowToggle) {
      this.searchInputActionBar.push(this.showAiResultsAction, {
        index: 0,
        label: false,
        icon: true
      });
      this.searchContainer.classList.add("with-ai-toggle");
    } else if (alreadyVisible) {
      this.searchInputActionBar.pull(0);
      this.searchContainer.classList.remove("with-ai-toggle");
      this.showAiResultsAction.checked = false;
    }
  }
  get minimumWidth() {
    return SettingsEditor2.EDITOR_MIN_WIDTH;
  }
  get maximumWidth() {
    return Number.POSITIVE_INFINITY;
  }
  get minimumHeight() {
    return 180;
  }
  // these setters need to exist because this extends from EditorPane
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  get currentSettingsModel() {
    return this.searchResultModel || this.settingsTreeModel.value;
  }
  get searchResultModel() {
    return this._searchResultModel.value ?? null;
  }
  set searchResultModel(value) {
    this._searchResultModel.value = value ?? void 0;
    this.rootElement.classList.toggle("search-mode", !!this._searchResultModel.value);
  }
  get focusedSettingDOMElement() {
    const focused = this.settingsTree.getFocus()[0];
    if (!(focused instanceof SettingsTreeSettingElement)) {
      return;
    }
    return this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), focused.setting.key)[0];
  }
  get currentFocusContext() {
    return this._currentFocusContext;
  }
  createEditor(parent) {
    parent.setAttribute("tabindex", "-1");
    this.rootElement = DOM.append(parent, $(".settings-editor", { tabindex: "-1" }));
    this.createHeader(this.rootElement);
    this.createBody(this.rootElement);
    this.addCtrlAInterceptor(this.rootElement);
    this.updateStyles();
    this._register(registerNavigableContainer({
      name: "settingsEditor2",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (this.searchWidget.inputWidget.hasWidgetFocus()) {
          this.focusTOC();
        }
      },
      focusPreviousWidget: () => {
        if (!this.searchWidget.inputWidget.hasWidgetFocus()) {
          this.focusSearch();
        }
      }
    }));
  }
  async setInput(input, options, context, token) {
    this.inSettingsEditorContextKey.set(true);
    await super.setInput(input, options, context, token);
    if (!this.input) {
      return;
    }
    const model = await this.input.resolve();
    if (token.isCancellationRequested || !(model instanceof Settings2EditorModel)) {
      return;
    }
    this.modelDisposables.clear();
    this.modelDisposables.add(model.onDidChangeGroups(() => {
      this.updatedConfigSchemaDelayer.trigger(() => {
        this.onConfigUpdate(void 0, false, true);
      });
    }));
    this.defaultSettingsEditorModel = model;
    options = options || validateSettingsEditorOptions({});
    if (!this.viewState.settingsTarget || !this.settingsTargetsWidget.settingsTarget) {
      const optionsHasViewStateTarget = options.viewState && options.viewState.settingsTarget;
      if (!options.target && !optionsHasViewStateTarget) {
        options.target = ConfigurationTarget.USER_LOCAL;
      }
    }
    this._setOptions(options);
    this.onConfigUpdate(void 0, true).then(() => {
      this.inputChangeListener.value = input.onWillDispose(() => {
        this.searchWidget.setValue("");
      });
      this.updateTreeScrollSync();
    });
    await this.refreshInstalledExtensionsList();
  }
  async refreshInstalledExtensionsList() {
    const installedExtensions = await this.extensionManagementService.getInstalled();
    this.installedExtensionIds = installedExtensions.filter((ext) => ext.manifest.contributes?.configuration).map((ext) => ext.identifier.id);
  }
  restoreCachedState() {
    const cachedState = this.input && this.editorMemento.loadEditorState(this.group, this.input);
    if (cachedState && typeof cachedState.target === "object") {
      cachedState.target = URI.revive(cachedState.target);
    }
    if (cachedState) {
      const settingsTarget = cachedState.target;
      this.settingsTargetsWidget.settingsTarget = settingsTarget;
      this.viewState.settingsTarget = settingsTarget;
      if (!this.searchWidget.getValue()) {
        this.searchWidget.setValue(cachedState.searchQuery);
      }
    }
    if (this.input) {
      this.editorMemento.clearEditorState(this.input, this.group);
    }
    return cachedState ?? null;
  }
  getViewState() {
    return this.viewState;
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      this._setOptions(options);
    }
  }
  _setOptions(options) {
    if (options.focusSearch && !platform.isIOS) {
      this.focusSearch();
    }
    const recoveredViewState = options.viewState ? options.viewState : void 0;
    const query = recoveredViewState?.query ?? options.query;
    if (query !== void 0) {
      this.searchWidget.setValue(query);
      this.viewState.query = query;
    }
    const target = options.folderUri ?? recoveredViewState?.settingsTarget ?? options.target;
    if (target) {
      this.settingsTargetsWidget.updateTarget(target);
    }
  }
  clearInput() {
    this.inSettingsEditorContextKey.set(false);
    super.clearInput();
  }
  layout(dimension) {
    this.dimension = dimension;
    if (!this.isVisible()) {
      return;
    }
    this.layoutSplitView(dimension);
    const innerWidth = Math.min(this.headerContainer.clientWidth, dimension.width) - 24 * 2;
    const monacoWidth = innerWidth - 10 - this.controlsElement.clientWidth - 12;
    this.searchWidget.layout(new DOM.Dimension(monacoWidth, 20));
    this.rootElement.classList.toggle("narrow-width", dimension.width < SettingsEditor2.NARROW_TOTAL_WIDTH);
  }
  focus() {
    super.focus();
    if (this._currentFocusContext === 0 /* Search */) {
      if (!platform.isIOS) {
        this.focusSearch();
      }
    } else if (this._currentFocusContext === 3 /* SettingControl */) {
      const element = this.focusedSettingDOMElement;
      if (element) {
        const control = element.querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
        if (control) {
          control.focus();
          return;
        }
      }
    } else if (this._currentFocusContext === 2 /* SettingTree */) {
      this.settingsTree.domFocus();
    } else if (this._currentFocusContext === 1 /* TableOfContents */) {
      this.tocTree.domFocus();
    }
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (!visible) {
      setTimeout(() => {
        this.searchWidget.onHide();
        this.settingRenderers.cancelSuggesters();
      }, 0);
    }
  }
  focusSettings(focusSettingInput = false) {
    const focused = this.settingsTree.getFocus();
    if (!focused.length) {
      this.settingsTree.focusFirst();
    }
    this.settingsTree.domFocus();
    if (focusSettingInput) {
      const controlInFocusedRow = this.settingsTree.getHTMLElement().querySelector(`.focused ${AbstractSettingRenderer.CONTROL_SELECTOR}`);
      if (controlInFocusedRow) {
        controlInFocusedRow.focus();
      }
    }
  }
  focusTOC() {
    this.tocTree.domFocus();
  }
  /**
   * Invoked when the user presses the down arrow while the search input is focused.
   * Navigates forward through the search history first; only once there are no more
   * recent history entries does focus move down into the settings results.
   */
  navigateSearchHistoryNextOrFocusSettings() {
    if (this.searchWidget.isNavigatingHistory()) {
      this.searchWidget.showNextValue();
    } else {
      this.focusFirstSettingFromSearch();
    }
  }
  /**
   * Invoked when the user presses the up arrow while the search input is focused.
   * Navigates backward through the search history.
   */
  navigateSearchHistoryPrevious() {
    this.searchWidget.showPreviousValue();
  }
  /**
   * Whether the currently rendered results reflect the current search input value.
   * Returns false while a search is still pending (debounced) or in progress, so that
   * focus is not moved into stale results.
   */
  isSearchUpToDate() {
    return !this.searchInputDelayer.isTriggered && this.renderedSearchQuery === this.searchWidget.getValue().trim();
  }
  /**
   * Moves focus from the search input into the first settings result, but only when the
   * displayed results are up to date with the current search input. If the results are
   * stale (a search is still pending or in progress), this does nothing so that focus does
   * not land on results from a previous query.
   */
  focusFirstSettingFromSearch() {
    if (!this.isSearchUpToDate()) {
      return;
    }
    this.focusSettings();
  }
  updateSettingFirstRowFocusedContext(element) {
    this.settingFirstRowFocused.set(!!element && element === this.settingsTree.navigate().first());
  }
  showContextMenu() {
    const focused = this.settingsTree.getFocus()[0];
    const rowElement = this.focusedSettingDOMElement;
    if (rowElement && focused instanceof SettingsTreeSettingElement) {
      this.settingRenderers.showContextMenu(focused, rowElement);
    }
  }
  focusSearch(filter, selectAll = true) {
    if (filter && this.searchWidget) {
      this.searchWidget.setValue(filter);
    }
    this.searchWidget.focus(selectAll && !this.searchInputDelayer.isTriggered);
  }
  clearSearchResults() {
    this.disableAiSearchToggle();
    this.searchWidget.setValue("");
    this.focusSearch();
  }
  clearSearchFilters() {
    const query = this.searchWidget.getValue();
    const splitQuery = query.split(" ").filter((word) => {
      return word.length && !SettingsEditor2.SUGGESTIONS.some((suggestion) => word.startsWith(suggestion));
    });
    this.searchWidget.setValue(splitQuery.join(" "));
  }
  /**
   * Updates the search input placeholder so that it hints at history navigation
   * (up/down arrows) once the user has search history, similar to the keyboard
   * shortcuts editor.
   */
  updateSearchPlaceholder() {
    const hasHistory = this.searchWidget.getHistory().length > 0;
    this.searchWidget.setPlaceHolder(hasHistory ? searchBoxPlaceholderWithHistory : searchBoxLabel);
  }
  updateInputAriaLabel() {
    let label = searchBoxLabel;
    if (this.searchResultLabel) {
      label += `. ${this.searchResultLabel}`;
    }
    if (this.lastSyncedLabel) {
      label += `. ${this.lastSyncedLabel}`;
    }
    this.searchWidget.updateAriaLabel(label);
  }
  /**
   * Render the header of the Settings editor, which includes the content above the splitview.
   */
  createHeader(parent) {
    this.headerContainer = DOM.append(parent, $(".settings-header"));
    this.searchContainer = DOM.append(this.headerContainer, $(".search-container"));
    const clearInputAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
      localize("clearInput", "Clear Settings Search Input"),
      ThemeIcon.asClassName(preferencesClearInputIcon),
      false,
      async () => this.clearSearchResults()
    ));
    const showAiResultActionClassNames = ["action-label", ThemeIcon.asClassName(preferencesAiResultsIcon)];
    this.showAiResultsAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS,
      SHOW_AI_RESULTS_DISABLED_LABEL,
      showAiResultActionClassNames.join(" "),
      true
    ));
    this._register(this.showAiResultsAction.onDidChange(async () => {
      await this.onDidToggleAiSearch();
    }));
    const filterAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS,
      localize("filterInput", "Filter Settings"),
      ThemeIcon.asClassName(preferencesFilterIcon)
    ));
    this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInputWithHistory, {
      id: `${SettingsEditor2.ID}.searchbox`,
      parent: this.searchContainer,
      ariaLabel: searchBoxLabel,
      resourceHandle: "settingseditor:searchinput" + SettingsEditor2.NUM_INSTANCES++,
      suggestionProvider: {
        triggerCharacters: ["@", ":"],
        provideResults: (query) => {
          const queryParts = query.split(/\s/g);
          if (queryParts[queryParts.length - 1].startsWith(`@${LANGUAGE_SETTING_TAG}`)) {
            const sortedLanguages = this.languageService.getRegisteredLanguageIds().map((languageId) => {
              return `@${LANGUAGE_SETTING_TAG}${languageId} `;
            }).sort();
            return sortedLanguages.filter((langFilter) => !query.includes(langFilter));
          } else if (queryParts[queryParts.length - 1].startsWith(`@${EXTENSION_SETTING_TAG}`)) {
            const installedExtensionsTags = this.installedExtensionIds.map((extensionId) => {
              return `@${EXTENSION_SETTING_TAG}${extensionId} `;
            }).sort();
            return installedExtensionsTags.filter((extFilter) => !query.includes(extFilter));
          } else if (query === "" || queryParts[queryParts.length - 1].startsWith("@")) {
            return SettingsEditor2.SUGGESTIONS.filter((tag) => !query.includes(tag)).map((tag) => tag.endsWith(":") ? tag : tag + " ");
          }
          return [];
        }
      },
      suggestOptions: {
        placeholderText: searchBoxLabel,
        focusContextKey: this.searchFocusContextKey,
        styleOverrides: {
          inputBorder: settingsTextInputBorder
        }
        // TODO: Aria-live
      },
      history: this.loadSearchHistory()
    }));
    this._register(this.searchWidget.onDidFocus(() => {
      this._currentFocusContext = 0 /* Search */;
    }));
    this.updateSearchPlaceholder();
    this._register(this.searchWidget.onInputDidChange(() => {
      const searchVal = this.searchWidget.getValue();
      clearInputAction.enabled = !!searchVal;
      this.searchInputDelayer.trigger(() => this.onSearchInputChanged(true));
    }));
    const headerControlsContainer = DOM.append(this.headerContainer, $(".settings-header-controls"));
    headerControlsContainer.style.borderColor = asCssVariable(settingsHeaderBorder);
    const targetWidgetContainer = DOM.append(headerControlsContainer, $(".settings-target-container"));
    this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer, { enableRemoteSettings: true }));
    this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER_LOCAL;
    this._register(this.settingsTargetsWidget.onDidTargetChange((target) => this.onDidSettingsTargetChange(target)));
    this._register(DOM.addDisposableListener(targetWidgetContainer, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.DownArrow) {
        this.focusSettings();
      }
    }));
    if (this.userDataSyncWorkbenchService.enabled && this.userDataSyncEnablementService.canToggleEnablement()) {
      const syncControls = this._register(this.instantiationService.createInstance(SyncControls, this.window, headerControlsContainer));
      this._register(syncControls.onDidChangeLastSyncedLabel((lastSyncedLabel) => {
        this.lastSyncedLabel = lastSyncedLabel;
        this.updateInputAriaLabel();
      }));
    }
    this.controlsElement = DOM.append(this.searchContainer, DOM.$(".search-container-widgets"));
    this.countElement = DOM.append(this.controlsElement, DOM.$(".settings-count-widget.monaco-count-badge.long"));
    this.searchInputActionBar = this._register(new ActionBar(this.controlsElement, {
      actionViewItemProvider: (action, options) => {
        if (action.id === filterAction.id) {
          return this.instantiationService.createInstance(SettingsSearchFilterDropdownMenuActionViewItem, action, options, this.actionRunner, this.searchWidget);
        }
        if (this.showAiResultsAction && action.id === this.showAiResultsAction.id) {
          const keybindingLabel = this.keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH)?.getLabel();
          return new ToggleActionViewItem(null, action, { ...options, keybinding: keybindingLabel, toggleStyles: defaultToggleStyles });
        }
        return void 0;
      }
    }));
    const actionsToPush = [clearInputAction, filterAction];
    this.searchInputActionBar.push(actionsToPush, { label: false, icon: true });
    this.disableAiSearchToggle();
    this.updateAiSearchToggleVisibility();
  }
  toggleAiSearch() {
    if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
      if (!this.showAiResultsAction.enabled) {
        aria.status(localize("noAiResults", "No AI results available at this time."));
      }
      this.showAiResultsAction.checked = !this.showAiResultsAction.checked;
    }
  }
  async onDidToggleAiSearch() {
    if (this.searchResultModel && this.showAiResultsAction) {
      this.searchResultModel.showAiResults = this.showAiResultsAction.checked ?? false;
      this.renderResultCountMessages(false);
      this.onDidFinishSearch(true, void 0);
    }
  }
  onDidSettingsTargetChange(target) {
    this.viewState.settingsTarget = target;
    this.onConfigUpdate(void 0, true);
  }
  onDidDismissExtensionSetting(extensionId) {
    if (!this.dismissedExtensionSettings.includes(extensionId)) {
      this.dismissedExtensionSettings.push(extensionId);
    }
    this.storageService.store(
      this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY,
      this.dismissedExtensionSettings.join(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    this.onConfigUpdate(void 0, true);
  }
  onDidClickSetting(evt, recursed) {
    const targetElement = this.currentSettingsModel?.getElementsByName(evt.targetKey)?.[0];
    let revealFailed = false;
    if (targetElement) {
      let sourceTop = 0.5;
      try {
        const _sourceTop = this.settingsTree.getRelativeTop(evt.source);
        if (_sourceTop !== null) {
          sourceTop = _sourceTop;
        }
      } catch {
      }
      if (this.viewState.categoryFilter && evt.source.displayCategory !== targetElement.displayCategory) {
        this.tocTree.setFocus([]);
      }
      try {
        this.settingsTree.reveal(targetElement, sourceTop);
      } catch (_) {
        revealFailed = true;
      }
      if (!revealFailed) {
        setTimeout(() => {
          this.settingsTree.setFocus([targetElement]);
        }, 50);
        const domElements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), evt.targetKey);
        if (domElements && domElements[0]) {
          const control = domElements[0].querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
          if (control) {
            control.focus();
          }
        }
      }
    }
    if (!recursed && (!targetElement || revealFailed)) {
      const idQuery = `@id:${evt.targetKey}`;
      this.searchWidget.setValue(idQuery);
      this.searchInputDelayer.cancel();
      const p = this.triggerSearch(idQuery, true);
      p.then(() => {
        this.onDidClickSetting(evt, true);
      });
    }
  }
  switchToSettingsFile() {
    const query = parseQuery(this.searchWidget.getValue()).query;
    return this.openSettingsFile({ query });
  }
  async openSettingsFile(options) {
    const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;
    const openOptions = { jsonEditor: true, groupId: this.group.id, ...options };
    if (currentSettingsTarget === ConfigurationTarget.USER_LOCAL) {
      if (options?.revealSetting) {
        const configurationProperties = Registry.as(Extensions.Configuration).getConfigurationProperties();
        const configurationScope = configurationProperties[options?.revealSetting.key]?.scope;
        if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
          return this.preferencesService.openApplicationSettings(openOptions);
        }
      }
      return this.preferencesService.openUserSettings(openOptions);
    } else if (currentSettingsTarget === ConfigurationTarget.USER_REMOTE) {
      return this.preferencesService.openRemoteSettings(openOptions);
    } else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
      return this.preferencesService.openWorkspaceSettings(openOptions);
    } else if (URI.isUri(currentSettingsTarget)) {
      return this.preferencesService.openFolderSettings({ folderUri: currentSettingsTarget, ...openOptions });
    }
    return void 0;
  }
  createBody(parent) {
    this.bodyContainer = DOM.append(parent, $(".settings-body"));
    this.noResultsMessage = DOM.append(this.bodyContainer, $(".no-results-message"));
    this.noResultsMessage.innerText = localize("noResults", "No Settings Found");
    this.clearFilterLinkContainer = $("span.clear-search-filters");
    this.clearFilterLinkContainer.textContent = " - ";
    const clearFilterLink = DOM.append(this.clearFilterLinkContainer, $("a.pointer.prominent", { tabindex: 0 }, localize("clearSearchFilters", "Clear Filters")));
    this._register(DOM.addDisposableListener(clearFilterLink, DOM.EventType.CLICK, (e) => {
      DOM.EventHelper.stop(e, false);
      this.clearSearchFilters();
    }));
    DOM.append(this.noResultsMessage, this.clearFilterLinkContainer);
    this.noResultsMessage.style.color = asCssVariable(editorForeground);
    this.tocTreeContainer = $(".settings-toc-container");
    this.settingsTreeContainer = $(".settings-tree-container");
    this.createTOC(this.tocTreeContainer);
    this.createSettingsTree(this.settingsTreeContainer);
    this.splitView = this._register(new SplitView(this.bodyContainer, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    const startingWidth = this.storageService.getNumber("settingsEditor2.splitViewWidth", StorageScope.PROFILE, SettingsEditor2.TOC_RESET_WIDTH);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.tocTreeContainer,
      minimumSize: SettingsEditor2.TOC_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.tocTreeContainer.style.width = `${width}px`;
        this.tocTree.layout(height, width);
      }
    }, startingWidth, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.settingsTreeContainer,
      minimumSize: SettingsEditor2.EDITOR_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.settingsTreeContainer.style.width = `${width}px`;
        this.settingsTree.layout(height, width);
      }
    }, Sizing.Distribute, void 0, true);
    this._register(this.splitView.onDidSashReset(() => {
      const totalSize = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
      this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
      this.splitView.resizeView(1, totalSize - SettingsEditor2.TOC_RESET_WIDTH);
    }));
    this._register(this.splitView.onDidSashChange(() => {
      const width = this.splitView.getViewSize(0);
      this.storageService.store("settingsEditor2.splitViewWidth", width, StorageScope.PROFILE, StorageTarget.USER);
    }));
    const borderColor = this.theme.getColor(settingsSashBorder);
    this.splitView.style({ separatorBorder: borderColor });
  }
  addCtrlAInterceptor(container) {
    this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, (e) => {
      if (e.keyCode === KeyCode.KeyA && (platform.isMacintosh ? e.metaKey : e.ctrlKey) && !DOM.isEditableElement(e.target)) {
        e.browserEvent.stopPropagation();
        e.browserEvent.preventDefault();
      }
    }));
  }
  createTOC(container) {
    this.tocTreeModel = this.instantiationService.createInstance(TOCTreeModel, this.viewState);
    this.tocTree = this._register(this.instantiationService.createInstance(
      TOCTree,
      DOM.append(container, $(".settings-toc-wrapper", {
        "role": "navigation",
        "aria-label": localize("settings", "Settings")
      })),
      this.viewState
    ));
    this.tocTreeDisposed = false;
    this._register(this.tocTree.onDidFocus(() => {
      this._currentFocusContext = 1 /* TableOfContents */;
    }));
    this._register(this.tocTree.onDidChangeFocus((e) => {
      const element = e.elements?.[0] ?? null;
      if (this.tocFocusedElement === element) {
        return;
      }
      this.tocFocusedElement = element;
      this.tocTree.setSelection(element ? [element] : []);
      if (this.viewState.categoryFilter !== element) {
        this.viewState.categoryFilter = element ?? void 0;
        this.renderTree(void 0, true);
        this.settingsTree.scrollTop = 0;
      }
    }));
    this._register(this.tocTree.onDidFocus(() => {
      this.tocRowFocused.set(true);
    }));
    this._register(this.tocTree.onDidBlur(() => {
      this.tocRowFocused.set(false);
    }));
    this._register(this.tocTree.onDidDispose(() => {
      this.tocTreeDisposed = true;
    }));
  }
  applyFilter(filter) {
    if (this.searchWidget && !this.searchWidget.getValue().includes(filter)) {
      const newQuery = `${filter} ${this.searchWidget.getValue().trimStart()}`;
      this.focusSearch(newQuery, false);
    }
  }
  removeLanguageFilters() {
    if (this.searchWidget && this.searchWidget.getValue().includes(`@${LANGUAGE_SETTING_TAG}`)) {
      const query = this.searchWidget.getValue().split(" ");
      const newQuery = query.filter((word) => !word.startsWith(`@${LANGUAGE_SETTING_TAG}`)).join(" ");
      this.focusSearch(newQuery, false);
    }
  }
  createSettingsTree(container) {
    this.settingRenderers = this._register(this.instantiationService.createInstance(SettingTreeRenderers));
    this._register(this.settingRenderers.onDidChangeSetting((e) => this.onDidChangeSetting(e.key, e.value, e.type, e.manualReset, e.scope)));
    this._register(this.settingRenderers.onDidDismissExtensionSetting((e) => this.onDidDismissExtensionSetting(e)));
    this._register(this.settingRenderers.onDidOpenSettings((settingKey) => {
      this.openSettingsFile({ revealSetting: { key: settingKey, edit: true } });
    }));
    this._register(this.settingRenderers.onDidClickSettingLink((settingName) => this.onDidClickSetting(settingName)));
    this._register(this.settingRenderers.onDidFocusSetting((element) => {
      this.settingsTree.setFocus([element]);
      this._currentFocusContext = 3 /* SettingControl */;
      this.settingRowFocused.set(false);
    }));
    this._register(this.settingRenderers.onDidChangeSettingHeight((params) => {
      const { element, height } = params;
      try {
        this.settingsTree.updateElementHeight(element, height);
      } catch (e) {
      }
    }));
    this._register(this.settingRenderers.onApplyFilter((filter) => this.applyFilter(filter)));
    this._register(this.settingRenderers.onDidClickOverrideElement((element) => {
      this.removeLanguageFilters();
      if (element.language) {
        this.applyFilter(`@${LANGUAGE_SETTING_TAG}${element.language}`);
      }
      if (element.scope === "workspace") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.WORKSPACE);
      } else if (element.scope === "user") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_LOCAL);
      } else if (element.scope === "remote") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_REMOTE);
      }
      this.applyFilter(`@${ID_SETTING_TAG}${element.settingKey}`);
    }));
    this.settingsTree = this._register(this.instantiationService.createInstance(
      SettingsTree,
      container,
      this.viewState,
      this.settingRenderers.allRenderers
    ));
    this._register(this.settingsTree.onDidScroll(() => {
      if (this.settingsTree.scrollTop === this.settingsTreeScrollTop) {
        return;
      }
      this.settingsTreeScrollTop = this.settingsTree.scrollTop;
      setTimeout(() => {
        this.updateTreeScrollSync();
      }, 0);
    }));
    this._register(this.settingsTree.onDidFocus(() => {
      const classList = container.ownerDocument.activeElement?.classList;
      if (classList && classList.contains("monaco-list") && classList.contains("settings-editor-tree")) {
        this._currentFocusContext = 2 /* SettingTree */;
        this.settingRowFocused.set(true);
        this.treeFocusedElement ??= this.settingsTree.firstVisibleElement ?? null;
        if (this.treeFocusedElement) {
          this.treeFocusedElement.tabbable = true;
        }
        this.updateSettingFirstRowFocusedContext(this.treeFocusedElement);
      }
    }));
    this._register(this.settingsTree.onDidBlur(() => {
      this.settingRowFocused.set(false);
      this.settingFirstRowFocused.set(false);
      this.treeFocusedElement = null;
    }));
    this._register(this.settingsTree.onDidChangeFocus((e) => {
      const element = e.elements[0];
      this.updateSettingFirstRowFocusedContext(element ?? null);
      if (this.treeFocusedElement === element) {
        return;
      }
      if (this.treeFocusedElement) {
        this.treeFocusedElement.tabbable = false;
      }
      this.treeFocusedElement = element;
      if (this.treeFocusedElement) {
        this.treeFocusedElement.tabbable = true;
      }
      this.settingsTree.setSelection(element ? [element] : []);
    }));
  }
  onDidChangeSetting(key, value, type, manualReset, scope) {
    const parsedQuery = parseQuery(this.searchWidget.getValue());
    const languageFilter = parsedQuery.languageFilter;
    if (manualReset || this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
      this.updateChangedSetting(key, value, manualReset, languageFilter, scope);
    }
    this.pendingSettingUpdate = { key, value, languageFilter };
    if (SettingsEditor2.shouldSettingUpdateFast(type)) {
      this.settingFastUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
    } else {
      this.settingSlowUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
    }
  }
  updateTreeScrollSync() {
    this.settingRenderers.cancelSuggesters();
  }
  updateChangedSetting(key, value, manualReset, languageFilter, scope) {
    const settingsTarget = this.settingsTargetsWidget.settingsTarget;
    const resource = URI.isUri(settingsTarget) ? settingsTarget : void 0;
    const configurationTarget = (resource ? ConfigurationTarget.WORKSPACE_FOLDER : settingsTarget) ?? ConfigurationTarget.USER_LOCAL;
    const overrides = { resource, overrideIdentifiers: languageFilter ? [languageFilter] : void 0 };
    const configurationTargetIsWorkspace = configurationTarget === ConfigurationTarget.WORKSPACE || configurationTarget === ConfigurationTarget.WORKSPACE_FOLDER;
    const userPassedInManualReset = configurationTargetIsWorkspace || !!languageFilter;
    const isManualReset = userPassedInManualReset ? manualReset : value === void 0;
    const inspected = this.configurationService.inspect(key, overrides);
    if (!userPassedInManualReset && inspected.defaultValue === value) {
      value = void 0;
    }
    return this.configurationService.updateValue(key, value, overrides, configurationTarget, { handleDirtyFile: "save" }).then(() => {
      const query = this.searchWidget.getValue();
      if (query.includes(`@${MODIFIED_SETTING_TAG}`)) {
        this.refreshTOCTree();
      }
      this.renderTree(key, isManualReset);
      this.pendingSettingUpdate = null;
      const reportModifiedProps = {
        key,
        query,
        searchResults: this.searchResultModel?.getUniqueSearchResults() ?? null,
        rawResults: this.searchResultModel?.getRawResults() ?? null,
        showConfiguredOnly: !!this.viewState.tagFilters && this.viewState.tagFilters.has(MODIFIED_SETTING_TAG),
        isReset: typeof value === "undefined",
        settingsTarget: this.settingsTargetsWidget.settingsTarget
      };
      return this.reportModifiedSetting(reportModifiedProps);
    });
  }
  reportModifiedSetting(props) {
    let groupId = void 0;
    let providerName = void 0;
    let nlpIndex = void 0;
    let displayIndex = void 0;
    if (props.searchResults) {
      displayIndex = props.searchResults.filterMatches.findIndex((m) => m.setting.key === props.key);
      if (this.searchResultModel) {
        providerName = props.searchResults.filterMatches.find((m) => m.setting.key === props.key)?.providerName;
        const rawResults = this.searchResultModel.getRawResults();
        if (rawResults[SearchResultIdx.Local] && displayIndex >= 0) {
          const settingInLocalResults = rawResults[SearchResultIdx.Local].filterMatches.some((m) => m.setting.key === props.key);
          groupId = settingInLocalResults ? "local" : "remote";
        }
        if (rawResults[SearchResultIdx.Remote]) {
          const _nlpIndex = rawResults[SearchResultIdx.Remote].filterMatches.findIndex((m) => m.setting.key === props.key);
          nlpIndex = _nlpIndex >= 0 ? _nlpIndex : void 0;
        }
      }
    }
    const reportedTarget = props.settingsTarget === ConfigurationTarget.USER_LOCAL ? "user" : props.settingsTarget === ConfigurationTarget.USER_REMOTE ? "user_remote" : props.settingsTarget === ConfigurationTarget.WORKSPACE ? "workspace" : "folder";
    const data = {
      key: props.key,
      groupId,
      providerName,
      nlpIndex,
      displayIndex,
      showConfiguredOnly: props.showConfiguredOnly,
      isReset: props.isReset,
      target: reportedTarget
    };
    this.telemetryService.publicLog2("settingsEditor.settingModified", data);
  }
  scheduleRefresh(element, key = "") {
    if (key && this.scheduledRefreshes.has(key)) {
      return;
    }
    if (!key) {
      dispose(this.scheduledRefreshes.values());
      this.scheduledRefreshes.clear();
    }
    const store = new DisposableStore();
    const scheduledRefreshTracker = DOM.trackFocus(element);
    store.add(scheduledRefreshTracker);
    store.add(scheduledRefreshTracker.onDidBlur(() => {
      this.scheduledRefreshes.get(key)?.dispose();
      this.scheduledRefreshes.delete(key);
      this.onConfigUpdate(/* @__PURE__ */ new Set([key]));
    }));
    this.scheduledRefreshes.set(key, store);
  }
  createSettingsOrderByTocIndex(resolvedSettingsRoot) {
    const index = /* @__PURE__ */ new Map();
    function indexSettings(resolvedSettingsRoot2, counter = 0) {
      if (resolvedSettingsRoot2.settings) {
        for (const setting of resolvedSettingsRoot2.settings) {
          if (!index.has(setting.key)) {
            index.set(setting.key, counter++);
          }
        }
      }
      if (resolvedSettingsRoot2.children) {
        for (const child of resolvedSettingsRoot2.children) {
          counter = indexSettings(child, counter);
        }
      }
      return counter;
    }
    indexSettings(resolvedSettingsRoot);
    return index;
  }
  refreshModels(resolvedSettingsRoot) {
    this.settingsTreeModel.value.update(resolvedSettingsRoot);
    this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.value.root;
    this.settingsOrderByTocIndex = this.createSettingsOrderByTocIndex(resolvedSettingsRoot);
  }
  async onConfigUpdate(keys, forceRefresh = false, triggerSearch = false) {
    if (keys && this.settingsTreeModel) {
      return this.updateElementsByKey(keys);
    }
    if (!this.defaultSettingsEditorModel) {
      return;
    }
    const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1);
    const coreSettingsGroups = [], extensionSettingsGroups = [];
    for (const group of groups) {
      if (group.extensionInfo) {
        extensionSettingsGroups.push(group);
      } else {
        coreSettingsGroups.push(group);
      }
    }
    const filter = this.canShowAdvancedSettings() ? void 0 : { exclude: { tags: [ADVANCED_SETTING_TAG] } };
    const settingsResult = resolveSettingsTree(tocData, coreSettingsGroups, filter, this.logService);
    const resolvedSettingsRoot = settingsResult.tree;
    if (settingsResult.leftoverSettings.size && !this.hasWarnedMissingSettings) {
      const settingKeyList = [];
      settingsResult.leftoverSettings.forEach((s) => {
        settingKeyList.push(s.key);
      });
      this.logService.warn(`SettingsEditor2: Settings not included in settingsLayout.ts: ${settingKeyList.join(", ")}`);
      this.hasWarnedMissingSettings = true;
    }
    const additionalGroups = [];
    let setAdditionalGroups = false;
    const toggleData = await getExperimentalExtensionToggleData(this.chatEntitlementService, this.extensionGalleryService, this.productService);
    if (toggleData && groups.filter((g) => g.extensionInfo).length && Object.keys(toggleData.settingsEditorRecommendedExtensions).length) {
      await this.refreshInstalledExtensionsList();
      for (const key in toggleData.settingsEditorRecommendedExtensions) {
        const extension = toggleData.recommendedExtensionsGalleryInfo[key];
        if (!extension) {
          continue;
        }
        const extensionId = extension.identifier.id;
        const extensionInstalled = this.installedExtensionIds.includes(extensionId);
        const matchingGroupIndex = groups.findIndex(
          (g) => g.extensionInfo && g.extensionInfo.id.toLowerCase() === extensionId.toLowerCase() && g.sections.length === 1 && g.sections[0].settings.length === 1 && g.sections[0].settings[0].displayExtensionId
        );
        if (extensionInstalled || this.dismissedExtensionSettings.includes(extensionId)) {
          if (matchingGroupIndex !== -1) {
            groups.splice(matchingGroupIndex, 1);
            setAdditionalGroups = true;
          }
          continue;
        }
        if (matchingGroupIndex !== -1) {
          continue;
        }
        let manifest = null;
        try {
          manifest = await raceTimeout(
            this.extensionGalleryService.getManifest(extension, CancellationToken.None),
            EXTENSION_FETCH_TIMEOUT_MS
          ) ?? null;
        } catch (e) {
          continue;
        }
        if (manifest === null) {
          continue;
        }
        const contributesConfiguration = manifest?.contributes?.configuration;
        let groupTitle;
        if (!Array.isArray(contributesConfiguration)) {
          groupTitle = contributesConfiguration?.title;
        } else if (contributesConfiguration.length === 1) {
          groupTitle = contributesConfiguration[0].title;
        }
        const recommendationInfo = toggleData.settingsEditorRecommendedExtensions[key];
        const extensionName = extension.displayName ?? extension.name ?? extensionId;
        const settingKey = `${key}.manageExtension`;
        const setting = {
          range: nullRange,
          key: settingKey,
          keyRange: nullRange,
          value: null,
          valueRange: nullRange,
          description: [recommendationInfo.onSettingsEditorOpen?.descriptionOverride ?? extension.description],
          descriptionIsMarkdown: false,
          descriptionRanges: [],
          scope: ConfigurationScope.WINDOW,
          type: "null",
          displayExtensionId: extensionId,
          extensionGroupTitle: groupTitle ?? extensionName,
          categoryLabel: "Extensions",
          title: extensionName
        };
        const additionalGroup = {
          sections: [{
            settings: [setting]
          }],
          id: extensionId,
          title: setting.extensionGroupTitle,
          titleRange: nullRange,
          range: nullRange,
          extensionInfo: {
            id: extensionId,
            displayName: extension.displayName
          }
        };
        groups.push(additionalGroup);
        additionalGroups.push(additionalGroup);
        setAdditionalGroups = true;
      }
    }
    resolvedSettingsRoot.children.push(await createTocTreeForExtensionSettings(this.extensionService, extensionSettingsGroups, filter));
    resolvedSettingsRoot.children.unshift(getCommonlyUsedData(groups));
    if (toggleData && setAdditionalGroups) {
      this.defaultSettingsEditorModel.setAdditionalGroups(additionalGroups);
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && (this.viewState.settingsTarget instanceof URI || this.viewState.settingsTarget === ConfigurationTarget.WORKSPACE)) {
      const configuredUntrustedWorkspaceSettings = resolveConfiguredUntrustedSettings(groups, this.viewState.settingsTarget, this.viewState.languageFilter, this.configurationService);
      if (configuredUntrustedWorkspaceSettings.length) {
        resolvedSettingsRoot.children.unshift({
          id: "workspaceTrust",
          label: localize("settings require trust", "Workspace Trust"),
          settings: configuredUntrustedWorkspaceSettings
        });
      }
    }
    this.searchResultModel?.updateChildren();
    const firstVisibleElement = this.settingsTree.firstVisibleElement;
    let anchorId;
    if (firstVisibleElement instanceof SettingsTreeSettingElement) {
      anchorId = firstVisibleElement.setting.key;
    } else if (firstVisibleElement instanceof SettingsTreeGroupElement) {
      anchorId = firstVisibleElement.id;
    }
    if (this.settingsTreeModel.value) {
      this.refreshModels(resolvedSettingsRoot);
      if (triggerSearch && this.searchResultModel) {
        return await this.onSearchInputChanged(false);
      }
      this.refreshTOCTree();
      this.renderTree(void 0, forceRefresh);
      if (anchorId) {
        const newModel = this.settingsTreeModel.value;
        let newElement;
        const settings = newModel.getElementsByName(anchorId);
        if (settings && settings.length > 0) {
          newElement = settings[0];
        } else {
          const findGroup = (roots) => {
            for (const g of roots) {
              if (g.id === anchorId) {
                return g;
              }
              if (g.children) {
                for (const child of g.children) {
                  if (child instanceof SettingsTreeGroupElement) {
                    const found = findGroup([child]);
                    if (found) {
                      return found;
                    }
                  }
                }
              }
            }
            return void 0;
          };
          newElement = findGroup([newModel.root]);
        }
        if (newElement) {
          try {
            this.settingsTree.reveal(newElement, 0);
          } catch (e) {
          }
        }
      }
    } else {
      this.settingsTreeModel.value = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
      this.refreshModels(resolvedSettingsRoot);
      const cachedState = !this.viewState.query ? this.restoreCachedState() : void 0;
      if (cachedState?.searchQuery || this.searchWidget.getValue()) {
        await this.onSearchInputChanged(true);
      } else {
        this.refreshTOCTree();
        const rootChildren = this.settingsTreeModel.value.root.children;
        if (Array.isArray(rootChildren) && rootChildren.length > 0) {
          const firstCategory = rootChildren[0];
          if (firstCategory instanceof SettingsTreeGroupElement) {
            this.viewState.categoryFilter = firstCategory;
            this.tocTree.setFocus([firstCategory]);
            this.tocTree.setSelection([firstCategory]);
          }
        }
        this.refreshTree();
        this.tocTree.collapseAll();
      }
    }
  }
  updateElementsByKey(keys) {
    if (keys.size) {
      if (this.searchResultModel) {
        keys.forEach((key) => this.searchResultModel.updateElementsByName(key));
      }
      if (this.settingsTreeModel.value) {
        keys.forEach((key) => this.settingsTreeModel.value.updateElementsByName(key));
      }
      keys.forEach((key) => this.renderTree(key));
    } else {
      this.renderTree();
    }
  }
  getActiveControlInSettingsTree() {
    const element = this.settingsTree.getHTMLElement();
    const activeElement = element.ownerDocument.activeElement;
    return activeElement && DOM.isAncestorOfActiveElement(element) ? activeElement : null;
  }
  renderTree(key, force = false) {
    if (!force && key && this.scheduledRefreshes.has(key)) {
      this.updateModifiedLabelForKey(key);
      return;
    }
    if (this.contextViewFocused()) {
      const element = this.window.document.querySelector(".context-view");
      if (element) {
        this.scheduleRefresh(element, key);
      }
      return;
    }
    const activeElement = this.getActiveControlInSettingsTree();
    const focusedSetting = activeElement && this.settingRenderers.getSettingDOMElementForDOMElement(activeElement);
    if (focusedSetting && !force) {
      if (key) {
        const focusedKey = focusedSetting.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
        if (focusedKey === key && // update `list`s live, as they have a separate "submit edit" step built in before this
        (focusedSetting.parentElement && !focusedSetting.parentElement.classList.contains("setting-item-list"))) {
          this.updateModifiedLabelForKey(key);
          this.scheduleRefresh(focusedSetting, key);
          return;
        }
      } else {
        this.scheduleRefresh(focusedSetting);
        return;
      }
    }
    this.renderResultCountMessages(false);
    if (key) {
      const elements = this.currentSettingsModel?.getElementsByName(key);
      if (elements?.length) {
        if (elements.length >= 2) {
          console.warn("More than one setting with key " + key + " found");
        }
        this.refreshSingleElement(elements[0]);
      } else {
        return;
      }
    } else {
      this.refreshTree();
    }
    return;
  }
  contextViewFocused() {
    return !!DOM.findParentWithClass(this.rootElement.ownerDocument.activeElement, "context-view");
  }
  refreshSingleElement(element) {
    if (this.isVisible() && this.settingsTree.hasElement(element) && (!element.setting.deprecationMessage || element.isConfigured)) {
      this.settingsTree.rerender(element);
    }
  }
  refreshTree() {
    if (this.isVisible() && this.currentSettingsModel) {
      this.settingsTree.setChildren(null, createGroupIterator(this.currentSettingsModel.root));
    }
  }
  refreshTOCTree() {
    if (this.isVisible()) {
      this.tocTreeModel.update();
      this.tocTree.setChildren(null, createTOCIterator(this.tocTreeModel, this.tocTree));
    }
  }
  updateModifiedLabelForKey(key) {
    if (!this.currentSettingsModel) {
      return;
    }
    const dataElements = this.currentSettingsModel.getElementsByName(key);
    const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured;
    const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
    if (elements && elements[0]) {
      elements[0].classList.toggle("is-configured", !!isModified);
    }
  }
  async onSearchInputChanged(expandResults) {
    if (!this.currentSettingsModel) {
      return;
    }
    const query = this.searchWidget.getValue().trim();
    this.viewState.query = query;
    if (query) {
      this.searchWidget.addToHistory();
      this.updateSearchPlaceholder();
      this.saveSearchHistory();
    }
    await this.triggerSearch(query.replace(/\u203A/g, " "), expandResults);
  }
  loadSearchHistory() {
    const raw = this.storageService.get(this.SEARCH_HISTORY_STORAGE_KEY, StorageScope.PROFILE);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }
  saveSearchHistory() {
    if (!this.searchWidget) {
      return;
    }
    const history = this.searchWidget.getHistory();
    if (history.length) {
      this.storageService.store(this.SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history), StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(this.SEARCH_HISTORY_STORAGE_KEY, StorageScope.PROFILE);
    }
  }
  parseSettingFromJSON(query) {
    const match = query.match(/"([a-zA-Z.]+)": /);
    return match && match[1];
  }
  /**
   * Toggles the visibility of the Settings editor table of contents during a search
   * depending on the behavior.
   */
  toggleTocBySearchBehaviorType() {
    const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
    const hideToc = tocBehavior === "hide";
    if (hideToc) {
      this.splitView.setViewVisible(0, false);
      this.splitView.style({
        separatorBorder: Color.transparent
      });
    } else {
      this.layoutSplitView(this.dimension);
    }
  }
  async triggerSearch(query, expandResults) {
    const progressRunner = this.editorProgressService.show(true, 800);
    const showAdvanced = this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG);
    this.viewState.tagFilters = /* @__PURE__ */ new Set();
    this.viewState.extensionFilters = /* @__PURE__ */ new Set();
    this.viewState.featureFilters = /* @__PURE__ */ new Set();
    this.viewState.idFilters = /* @__PURE__ */ new Set();
    this.viewState.languageFilter = void 0;
    if (query) {
      const parsedQuery = parseQuery(query);
      query = parsedQuery.query;
      parsedQuery.tags.forEach((tag) => this.viewState.tagFilters.add(tag));
      parsedQuery.extensionFilters.forEach((extensionId) => this.viewState.extensionFilters.add(extensionId));
      parsedQuery.featureFilters.forEach((feature) => this.viewState.featureFilters.add(feature));
      parsedQuery.idFilters.forEach((id) => this.viewState.idFilters.add(id));
      this.viewState.languageFilter = parsedQuery.languageFilter;
    }
    if (showAdvanced !== this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG)) {
      await this.onConfigUpdate();
    }
    this.settingsTargetsWidget.updateLanguageFilterIndicators(this.viewState.languageFilter);
    if (query && query !== "@") {
      query = this.parseSettingFromJSON(query) || query;
      await this.triggerFilterPreferences(query, expandResults, progressRunner);
      this.toggleTocBySearchBehaviorType();
    } else {
      if (this.viewState.tagFilters.size || this.viewState.extensionFilters.size || this.viewState.featureFilters.size || this.viewState.idFilters.size || this.viewState.languageFilter) {
        this.searchResultModel = this.createFilterModel();
      } else {
        this.searchResultModel = null;
      }
      this.searchDelayer.cancel();
      if (this.searchInProgress) {
        this.searchInProgress.dispose(true);
        this.searchInProgress = null;
      }
      if (expandResults) {
        this.tocTree.setFocus([]);
        this.viewState.categoryFilter = void 0;
      }
      this.tocTreeModel.currentSearchModel = this.searchResultModel;
      this.renderedSearchQuery = this.viewState.query;
      if (this.searchResultModel) {
        if (expandResults) {
          this.tocTree.setSelection([]);
          this.tocTree.expandAll();
        }
        this.refreshTOCTree();
        this.renderResultCountMessages(false);
        this.refreshTree();
        this.toggleTocBySearchBehaviorType();
      } else if (!this.tocTreeDisposed) {
        this.tocTree.collapseAll();
        this.refreshTOCTree();
        this.renderResultCountMessages(false);
        this.refreshTree();
        this.layoutSplitView(this.dimension);
      }
      progressRunner.done();
    }
  }
  /**
   * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
   */
  createFilterModel() {
    const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
    const fullResult = {
      filterMatches: [],
      exactMatch: false
    };
    const shouldShowAdvanced = this.canShowAdvancedSettings();
    for (const g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
      for (const sect of g.sections) {
        for (const setting of sect.settings) {
          if (!shouldShowAdvanced && !this.shouldShowSetting(setting)) {
            continue;
          }
          fullResult.filterMatches.push({
            setting,
            matches: [],
            matchType: SettingMatchType.None,
            keyMatchScore: 0,
            score: 0,
            providerName: FILTER_MODEL_SEARCH_PROVIDER_NAME
          });
        }
      }
    }
    filterModel.setResult(0, fullResult);
    return filterModel;
  }
  async triggerFilterPreferences(query, expandResults, progressRunner) {
    if (this.searchInProgress) {
      this.searchInProgress.dispose(true);
      this.searchInProgress = null;
    }
    const searchInProgress = this.searchInProgress = new CancellationTokenSource();
    return this.searchDelayer.trigger(async () => {
      if (searchInProgress.token.isCancellationRequested) {
        return;
      }
      this.disableAiSearchToggle();
      const localResults = await this.doLocalSearch(query, searchInProgress.token);
      if (!this.searchResultModel || searchInProgress.token.isCancellationRequested) {
        return;
      }
      this.searchResultModel.showAiResults = false;
      if (localResults && localResults.filterMatches.length > 0) {
        this.onDidFinishSearch(expandResults, void 0);
      }
      if (!localResults || !localResults.exactMatch) {
        await this.doRemoteSearch(query, searchInProgress.token);
      }
      if (searchInProgress.token.isCancellationRequested) {
        return;
      }
      if (this.aiSearchPromise) {
        this.aiSearchPromise.cancel();
      }
      if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
        this.aiSearchPromise = createCancelablePromise((token) => {
          return this.doAiSearch(query, token).then((results) => {
            if (results && this.showAiResultsAction) {
              this.showAiResultsAction.enabled = true;
              this.aiResultsAvailable.set(true);
              this.showAiResultsAction.label = SHOW_AI_RESULTS_ENABLED_LABEL;
              this.renderResultCountMessages(true);
            }
          }).catch((e) => {
            if (!isCancellationError(e)) {
              this.logService.trace("Error during AI settings search:", e);
            }
          });
        });
      }
      this.onDidFinishSearch(expandResults, progressRunner);
    });
  }
  onDidFinishSearch(expandResults, progressRunner) {
    this.tocTreeModel.currentSearchModel = this.searchResultModel;
    this.renderedSearchQuery = this.viewState.query;
    if (expandResults) {
      this.tocTree.setFocus([]);
      this.viewState.categoryFilter = void 0;
      this.tocTree.expandAll();
      this.settingsTree.scrollTop = 0;
    }
    this.refreshTOCTree();
    this.renderTree(void 0, true);
    progressRunner?.done();
  }
  doLocalSearch(query, token) {
    const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
    return this.searchWithProvider(SearchResultIdx.Local, localSearchProvider, STRING_MATCH_SEARCH_PROVIDER_NAME, token);
  }
  doRemoteSearch(query, token) {
    const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
    if (!remoteSearchProvider) {
      return Promise.resolve(null);
    }
    return this.searchWithProvider(SearchResultIdx.Remote, remoteSearchProvider, TF_IDF_SEARCH_PROVIDER_NAME, token);
  }
  async doAiSearch(query, token) {
    const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
    if (!aiSearchProvider) {
      return null;
    }
    const embeddingsResults = await this.searchWithProvider(SearchResultIdx.Embeddings, aiSearchProvider, EMBEDDINGS_SEARCH_PROVIDER_NAME, token);
    if (!embeddingsResults || token.isCancellationRequested) {
      return null;
    }
    const llmResults = await this.getLLMRankedResults(query, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return {
      filterMatches: embeddingsResults.filterMatches.concat(llmResults?.filterMatches ?? []),
      exactMatch: false
    };
  }
  async getLLMRankedResults(query, token) {
    const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
    if (!aiSearchProvider) {
      return null;
    }
    const stopWatch = new StopWatch(false);
    const result = await aiSearchProvider.getLLMRankedResults(token);
    stopWatch.stop();
    if (token.isCancellationRequested) {
      return null;
    }
    if (result && result.filterMatches.length > 0) {
      const elapsed = stopWatch.elapsed();
      this.logSearchPerformance(LLM_RANKED_SEARCH_PROVIDER_NAME, elapsed);
    }
    this.searchResultModel.setResult(SearchResultIdx.AiSelected, result);
    return result;
  }
  async searchWithProvider(type, searchProvider, providerName, token) {
    const stopWatch = new StopWatch(false);
    const result = await this._searchPreferencesModel(this.defaultSettingsEditorModel, searchProvider, token);
    stopWatch.stop();
    if (token.isCancellationRequested) {
      return null;
    }
    if (result && !this.canShowAdvancedSettings()) {
      result.filterMatches = result.filterMatches.filter((match) => this.shouldShowSetting(match.setting));
    }
    if (result && result.filterMatches.length > 0) {
      const elapsed = stopWatch.elapsed();
      this.logSearchPerformance(providerName, elapsed);
    }
    this.searchResultModel ??= this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
    this.searchResultModel.setResult(type, result);
    return result;
  }
  logSearchPerformance(providerName, elapsed) {
    this.telemetryService.publicLog2("settingsEditor.searchPerformance", {
      providerName,
      elapsedMs: elapsed
    });
  }
  renderResultCountMessages(showAiResultsMessage) {
    if (!this.currentSettingsModel) {
      return;
    }
    this.clearFilterLinkContainer.style.display = this.viewState.tagFilters && this.viewState.tagFilters.size > 0 ? "initial" : "none";
    if (!this.searchResultModel) {
      if (this.countElement.style.display !== "none") {
        this.searchResultLabel = null;
        this.updateInputAriaLabel();
        this.countElement.style.display = "none";
        this.countElement.innerText = "";
        this.layout(this.dimension);
      }
      this.rootElement.classList.remove("no-results");
      this.splitView.el.style.visibility = "visible";
      return;
    } else {
      const count = this.searchResultModel.getUniqueResultsCount();
      let resultString;
      if (showAiResultsMessage) {
        switch (count) {
          case 0:
            resultString = localize("noResultsWithAiAvailable", "No Settings Found. AI Results Available");
            break;
          case 1:
            resultString = localize("oneResultWithAiAvailable", "1 Setting Found. AI Results Available");
            break;
          default:
            resultString = localize("moreThanOneResultWithAiAvailable", "{0} Settings Found. AI Results Available", count);
        }
      } else {
        switch (count) {
          case 0:
            resultString = localize("noResults", "No Settings Found");
            break;
          case 1:
            resultString = localize("oneResult", "1 Setting Found");
            break;
          default:
            resultString = localize("moreThanOneResult", "{0} Settings Found", count);
        }
      }
      this.searchResultLabel = resultString;
      this.updateInputAriaLabel();
      this.countElement.innerText = resultString;
      aria.status(resultString);
      if (this.countElement.style.display !== "block") {
        this.countElement.style.display = "block";
      }
      this.layout(this.dimension);
      this.rootElement.classList.toggle("no-results", count === 0);
      this.splitView.el.style.visibility = count === 0 ? "hidden" : "visible";
    }
  }
  async _searchPreferencesModel(model, provider, token) {
    try {
      return await provider.searchModel(model, token);
    } catch (err) {
      if (isCancellationError(err)) {
        return Promise.reject(err);
      } else {
        return null;
      }
    }
  }
  layoutSplitView(dimension) {
    if (!this.isVisible()) {
      return;
    }
    const listHeight = dimension.height - (72 + 11 + 14);
    this.splitView.el.style.height = `${listHeight}px`;
    this.splitView.layout(this.bodyContainer.clientWidth, listHeight);
    const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
    const hideTocForSearch = tocBehavior === "hide" && this.searchResultModel;
    if (!hideTocForSearch) {
      const firstViewWasVisible = this.splitView.isViewVisible(0);
      const firstViewVisible = this.bodyContainer.clientWidth >= SettingsEditor2.NARROW_TOTAL_WIDTH;
      this.splitView.setViewVisible(0, firstViewVisible);
      if (!firstViewWasVisible && firstViewVisible && this.bodyContainer.clientWidth >= SettingsEditor2.EDITOR_MIN_WIDTH + SettingsEditor2.TOC_RESET_WIDTH) {
        this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
      }
      this.splitView.style({
        separatorBorder: firstViewVisible ? this.theme.getColor(settingsSashBorder) : Color.transparent
      });
    }
  }
  saveState() {
    this.saveSearchHistory();
    if (this.isVisible()) {
      const searchQuery = this.searchWidget.getValue().trim();
      const target = this.settingsTargetsWidget.settingsTarget;
      if (this.input) {
        this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
      }
    } else if (this.input) {
      this.editorMemento.clearEditorState(this.input, this.group);
    }
    super.saveState();
  }
};
SettingsEditor2.ID = "workbench.editor.settings2";
SettingsEditor2.NUM_INSTANCES = 0;
SettingsEditor2.SEARCH_DEBOUNCE = 200;
SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE = 200;
SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE = 1e3;
SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER = 500;
SettingsEditor2.TOC_MIN_WIDTH = 100;
SettingsEditor2.TOC_RESET_WIDTH = 200;
SettingsEditor2.EDITOR_MIN_WIDTH = 500;
// Below NARROW_TOTAL_WIDTH, we only render the editor rather than the ToC.
SettingsEditor2.NARROW_TOTAL_WIDTH = SettingsEditor2.TOC_RESET_WIDTH + SettingsEditor2.EDITOR_MIN_WIDTH;
SettingsEditor2.SUGGESTIONS = [
  `@${MODIFIED_SETTING_TAG}`,
  "@tag:notebookLayout",
  "@tag:notebookOutputLayout",
  `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}`,
  `@tag:${WORKSPACE_TRUST_SETTING_TAG}`,
  "@tag:sync",
  "@tag:usesOnlineServices",
  "@tag:telemetry",
  "@tag:accessibility",
  "@tag:preview",
  "@tag:experimental",
  `@tag:${ADVANCED_SETTING_TAG}`,
  `@${ID_SETTING_TAG}`,
  `@${EXTENSION_SETTING_TAG}`,
  `@${FEATURE_SETTING_TAG}scm`,
  `@${FEATURE_SETTING_TAG}explorer`,
  `@${FEATURE_SETTING_TAG}search`,
  `@${FEATURE_SETTING_TAG}debug`,
  `@${FEATURE_SETTING_TAG}extensions`,
  `@${FEATURE_SETTING_TAG}terminal`,
  `@${FEATURE_SETTING_TAG}task`,
  `@${FEATURE_SETTING_TAG}problems`,
  `@${FEATURE_SETTING_TAG}output`,
  `@${FEATURE_SETTING_TAG}comments`,
  `@${FEATURE_SETTING_TAG}remote`,
  `@${FEATURE_SETTING_TAG}timeline`,
  `@${FEATURE_SETTING_TAG}notebook`,
  `@${FEATURE_SETTING_TAG}chat`,
  `@${POLICY_SETTING_TAG}`
];
SettingsEditor2 = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, ITextResourceConfigurationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IPreferencesService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IPreferencesSearchService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IEditorGroupsService),
  __decorateParam(12, IUserDataSyncWorkbenchService),
  __decorateParam(13, IUserDataSyncEnablementService),
  __decorateParam(14, IWorkspaceTrustManagementService),
  __decorateParam(15, IExtensionService),
  __decorateParam(16, ILanguageService),
  __decorateParam(17, IExtensionManagementService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IExtensionGalleryService),
  __decorateParam(20, IEditorProgressService),
  __decorateParam(21, IUserDataProfileService),
  __decorateParam(22, IKeybindingService),
  __decorateParam(23, IChatEntitlementService),
  __decorateParam(24, IWorkbenchEnvironmentService)
], SettingsEditor2);
let SyncControls = class extends Disposable {
  constructor(window, container, commandService, userDataSyncService, userDataSyncEnablementService, telemetryService) {
    super();
    this.commandService = commandService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this._onDidChangeLastSyncedLabel = this._register(new Emitter());
    this.onDidChangeLastSyncedLabel = this._onDidChangeLastSyncedLabel.event;
    const headerRightControlsContainer = DOM.append(container, $(".settings-right-controls"));
    const turnOnSyncButtonContainer = DOM.append(headerRightControlsContainer, $(".turn-on-sync"));
    this.turnOnSyncButton = this._register(new Button(turnOnSyncButtonContainer, { title: true, ...defaultButtonStyles }));
    this.lastSyncedLabel = DOM.append(headerRightControlsContainer, $(".last-synced-label"));
    DOM.hide(this.lastSyncedLabel);
    this.turnOnSyncButton.enabled = true;
    this.turnOnSyncButton.label = localize("turnOnSyncButton", "Backup and Sync Settings");
    DOM.hide(this.turnOnSyncButton.element);
    this._register(this.turnOnSyncButton.onDidClick(async () => {
      await this.commandService.executeCommand("workbench.userDataSync.actions.turnOn");
    }));
    this.updateLastSyncedTime();
    this._register(this.userDataSyncService.onDidChangeLastSyncTime(() => {
      this.updateLastSyncedTime();
    }));
    const updateLastSyncedTimer = this._register(new DOM.WindowIntervalTimer());
    updateLastSyncedTimer.cancelAndSet(() => this.updateLastSyncedTime(), 60 * 1e3, window);
    this.update();
    this._register(this.userDataSyncService.onDidChangeStatus(() => {
      this.update();
    }));
    this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
      this.update();
    }));
  }
  updateLastSyncedTime() {
    const last = this.userDataSyncService.lastSyncTime;
    let label;
    if (typeof last === "number") {
      const d = fromNow(last, true, void 0, true);
      label = localize("lastSyncedLabel", "Last synced: {0}", d);
    } else {
      label = "";
    }
    this.lastSyncedLabel.textContent = label;
    this._onDidChangeLastSyncedLabel.fire(label);
  }
  update() {
    if (this.userDataSyncService.status === SyncStatus.Uninitialized) {
      return;
    }
    if (this.userDataSyncEnablementService.isEnabled() || this.userDataSyncService.status !== SyncStatus.Idle) {
      DOM.show(this.lastSyncedLabel);
      DOM.hide(this.turnOnSyncButton.element);
    } else {
      DOM.hide(this.lastSyncedLabel);
      DOM.show(this.turnOnSyncButton.element);
    }
  }
};
SyncControls = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IUserDataSyncService),
  __decorateParam(4, IUserDataSyncEnablementService),
  __decorateParam(5, ITelemetryService)
], SyncControls);
export {
  SettingsEditor2,
  SettingsFocusContext,
  createGroupIterator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NFZGl0b3IyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uLCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IFRvZ2dsZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSVRyZWVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVsYXllciwgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCB0eXBlIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NSdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBlZGl0b3JGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU2VydmljZSwgU3luY1N0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1lbWVudG8sIElFZGl0b3JPcGVuQ29udGV4dCwgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBUFBMSUNBVElPTl9TQ09QRVMsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQUxXQVlTX1NIT1dfQURWQU5DRURfU0VUVElOR1NfU0VUVElORywgSU9wZW5TZXR0aW5nc09wdGlvbnMsIElQcmVmZXJlbmNlc1NlcnZpY2UsIElTZWFyY2hSZXN1bHQsIElTZXR0aW5nLCBJU2V0dGluZ3NFZGl0b3JNb2RlbCwgSVNldHRpbmdzRWRpdG9yT3B0aW9ucywgSVNldHRpbmdzR3JvdXAsIFNldHRpbmdNYXRjaFR5cGUsIFNldHRpbmdWYWx1ZVR5cGUsIHZhbGlkYXRlU2V0dGluZ3NFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IFNldHRpbmdzRWRpdG9yMklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgbnVsbFJhbmdlLCBTZXR0aW5nczJFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc01vZGVscy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5IH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3N1Z2dlc3RFbmFibGVkSW5wdXQvc3VnZ2VzdEVuYWJsZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBBRFZBTkNFRF9TRVRUSU5HX1RBRywgQUdFTlRTX1dJTkRPV19TRVRUSU5HX1RBRywgQ09OVEVYVF9BSV9TRVRUSU5HX1JFU1VMVFNfQVZBSUxBQkxFLCBDT05URVhUX1NFVFRJTkdTX0VESVRPUiwgQ09OVEVYVF9TRVRUSU5HU19GSVJTVF9ST1dfRk9DVVMsIENPTlRFWFRfU0VUVElOR1NfUk9XX0ZPQ1VTLCBDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUywgQ09OVEVYVF9UT0NfUk9XX0ZPQ1VTLCBFTUJFRERJTkdTX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBFTkFCTEVfTEFOR1VBR0VfRklMVEVSLCBFWFRFTlNJT05fRkVUQ0hfVElNRU9VVF9NUywgRVhURU5TSU9OX1NFVFRJTkdfVEFHLCBGRUFUVVJFX1NFVFRJTkdfVEFHLCBGSUxURVJfTU9ERUxfU0VBUkNIX1BST1ZJREVSX05BTUUsIGdldEV4cGVyaW1lbnRhbEV4dGVuc2lvblRvZ2dsZURhdGEsIElEX1NFVFRJTkdfVEFHLCBJUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlLCBJU2VhcmNoUHJvdmlkZXIsIExBTkdVQUdFX1NFVFRJTkdfVEFHLCBMTE1fUkFOS0VEX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBNT0RJRklFRF9TRVRUSU5HX1RBRywgUE9MSUNZX1NFVFRJTkdfVEFHLCBSRVFVSVJFX1RSVVNURURfV09SS1NQQUNFX1NFVFRJTkdfVEFHLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUywgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19BSV9SRVNVTFRTLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TVUdHRVNUX0ZJTFRFUlMsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1RPR0dMRV9BSV9TRUFSQ0gsIFNUUklOR19NQVRDSF9TRUFSQ0hfUFJPVklERVJfTkFNRSwgVEZfSURGX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBXb3JrYmVuY2hTZXR0aW5nc0VkaXRvclNldHRpbmdzLCBXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUcgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgc2V0dGluZ3NIZWFkZXJCb3JkZXIsIHNldHRpbmdzU2FzaEJvcmRlciwgc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXIgfSBmcm9tICcuLi9jb21tb24vc2V0dGluZ3NFZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zZXR0aW5nc0VkaXRvcjIuY3NzJztcbmltcG9ydCB7IHByZWZlcmVuY2VzQWlSZXN1bHRzSWNvbiwgcHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiwgcHJlZmVyZW5jZXNGaWx0ZXJJY29uIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0ljb25zLmpzJztcbmltcG9ydCB7IFNldHRpbmdzVGFyZ2V0LCBTZXR0aW5nc1RhcmdldHNXaWRnZXQgfSBmcm9tICcuL3ByZWZlcmVuY2VzV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudCB9IGZyb20gJy4vc2V0dGluZ3NFZGl0b3JTZXR0aW5nSW5kaWNhdG9ycy5qcyc7XG5pbXBvcnQgeyBnZXRDb21tb25seVVzZWREYXRhLCBJVE9DRW50cnksIHRvY0RhdGEgfSBmcm9tICcuL3NldHRpbmdzTGF5b3V0LmpzJztcbmltcG9ydCB7IFNldHRpbmdzU2VhcmNoRmlsdGVyRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL3NldHRpbmdzU2VhcmNoTWVudS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFNldHRpbmdSZW5kZXJlciwgY3JlYXRlVG9jVHJlZUZvckV4dGVuc2lvblNldHRpbmdzLCBIZWlnaHRDaGFuZ2VQYXJhbXMsIElTZXR0aW5nTGlua0NsaWNrRXZlbnQsIHJlc29sdmVDb25maWd1cmVkVW50cnVzdGVkU2V0dGluZ3MsIHJlc29sdmVTZXR0aW5nc1RyZWUsIFNldHRpbmdzVHJlZSwgU2V0dGluZ1RyZWVSZW5kZXJlcnMgfSBmcm9tICcuL3NldHRpbmdzVHJlZS5qcyc7XG5pbXBvcnQgeyBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUsIHBhcnNlUXVlcnksIFNlYXJjaFJlc3VsdElkeCwgU2VhcmNoUmVzdWx0TW9kZWwsIFNldHRpbmdzVHJlZUVsZW1lbnQsIFNldHRpbmdzVHJlZUdyb3VwQ2hpbGQsIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCwgU2V0dGluZ3NUcmVlTW9kZWwsIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50IH0gZnJvbSAnLi9zZXR0aW5nc1RyZWVNb2RlbHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlVE9DSXRlcmF0b3IsIFRPQ1RyZWUsIFRPQ1RyZWVNb2RlbCB9IGZyb20gJy4vdG9jVHJlZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNldHRpbmdzRm9jdXNDb250ZXh0IHtcblx0U2VhcmNoLFxuXHRUYWJsZU9mQ29udGVudHMsXG5cdFNldHRpbmdUcmVlLFxuXHRTZXR0aW5nQ29udHJvbFxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlR3JvdXBJdGVyYXRvcihncm91cDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50KTogSXRlcmFibGU8SVRyZWVFbGVtZW50PFNldHRpbmdzVHJlZUdyb3VwQ2hpbGQ+PiB7XG5cdHJldHVybiBJdGVyYWJsZS5tYXAoZ3JvdXAuY2hpbGRyZW4sIGcgPT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBnLFxuXHRcdFx0Y2hpbGRyZW46IGcgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgP1xuXHRcdFx0XHRjcmVhdGVHcm91cEl0ZXJhdG9yKGcpIDpcblx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0fTtcblx0fSk7XG59XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3Qgc2VhcmNoQm94TGFiZWwgPSBsb2NhbGl6ZSgnU2VhcmNoU2V0dGluZ3MuQXJpYUxhYmVsJywgXCJTZWFyY2ggc2V0dGluZ3NcIik7XG5jb25zdCBzZWFyY2hCb3hQbGFjZWhvbGRlcldpdGhIaXN0b3J5ID0gbG9jYWxpemUoe1xuXHRrZXk6ICdTZWFyY2hTZXR0aW5ncy5QbGFjZWhvbGRlcldpdGhIaXN0b3J5Jyxcblx0Y29tbWVudDogWydQbGFjZWhvbGRlciBmb3IgdGhlIHNldHRpbmdzIHNlYXJjaCBpbnB1dCBoaW50aW5nIHRoYXQgdGhlIHVwIGFuZCBkb3duIGFycm93IGtleXMgbmF2aWdhdGUgdGhlIHNlYXJjaCBoaXN0b3J5LiBUaGUgY2hhcmFjdGVyIGluc2VydGVkIGZvciB7MH0gaXMgXFx1MjFDNSB0byByZXByZXNlbnQgdGhlIHVwIGFuZCBkb3duIGFycm93IGtleXMuJ11cbn0sIFwiU2VhcmNoIHNldHRpbmdzICh7MH0gZm9yIGhpc3RvcnkpXCIsICdcXHUyMUM1Jyk7XG5jb25zdCBTRUFSQ0hfVE9DX0JFSEFWSU9SX0tFWSA9ICd3b3JrYmVuY2guc2V0dGluZ3Muc2V0dGluZ3NTZWFyY2hUb2NCZWhhdmlvcic7XG5cbmNvbnN0IFNIT1dfQUlfUkVTVUxUU19FTkFCTEVEX0xBQkVMID0gbG9jYWxpemUoJ3Nob3dBaVJlc3VsdHNFbmFibGVkJywgXCJTaG93IEFJLXJlY29tbWVuZGVkIHJlc3VsdHNcIik7XG5jb25zdCBTSE9XX0FJX1JFU1VMVFNfRElTQUJMRURfTEFCRUwgPSBsb2NhbGl6ZSgnc2hvd0FpUmVzdWx0c0Rpc2FibGVkJywgXCJObyBBSSByZXN1bHRzIGF2YWlsYWJsZSBhdCB0aGlzIHRpbWUuLi5cIik7XG5cbmNvbnN0IFNFVFRJTkdTX0VESVRPUl9TVEFURV9LRVkgPSAnc2V0dGluZ3NFZGl0b3JTdGF0ZSc7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc0VkaXRvcjIgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLnNldHRpbmdzMic7XG5cdHByaXZhdGUgc3RhdGljIE5VTV9JTlNUQU5DRVM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc3RhdGljIFNFQVJDSF9ERUJPVU5DRTogbnVtYmVyID0gMjAwO1xuXHRwcml2YXRlIHN0YXRpYyBTRVRUSU5HX1VQREFURV9GQVNUX0RFQk9VTkNFOiBudW1iZXIgPSAyMDA7XG5cdHByaXZhdGUgc3RhdGljIFNFVFRJTkdfVVBEQVRFX1NMT1dfREVCT1VOQ0U6IG51bWJlciA9IDEwMDA7XG5cdHByaXZhdGUgc3RhdGljIENPTkZJR19TQ0hFTUFfVVBEQVRFX0RFTEFZRVIgPSA1MDA7XG5cdHByaXZhdGUgc3RhdGljIFRPQ19NSU5fV0lEVEg6IG51bWJlciA9IDEwMDtcblx0cHJpdmF0ZSBzdGF0aWMgVE9DX1JFU0VUX1dJRFRIOiBudW1iZXIgPSAyMDA7XG5cdHByaXZhdGUgc3RhdGljIEVESVRPUl9NSU5fV0lEVEg6IG51bWJlciA9IDUwMDtcblx0Ly8gQmVsb3cgTkFSUk9XX1RPVEFMX1dJRFRILCB3ZSBvbmx5IHJlbmRlciB0aGUgZWRpdG9yIHJhdGhlciB0aGFuIHRoZSBUb0MuXG5cdHByaXZhdGUgc3RhdGljIE5BUlJPV19UT1RBTF9XSURUSDogbnVtYmVyID0gdGhpcy5UT0NfUkVTRVRfV0lEVEggKyB0aGlzLkVESVRPUl9NSU5fV0lEVEg7XG5cblx0cHJpdmF0ZSBzdGF0aWMgU1VHR0VTVElPTlM6IHN0cmluZ1tdID0gW1xuXHRcdGBAJHtNT0RJRklFRF9TRVRUSU5HX1RBR31gLFxuXHRcdCdAdGFnOm5vdGVib29rTGF5b3V0Jyxcblx0XHQnQHRhZzpub3RlYm9va091dHB1dExheW91dCcsXG5cdFx0YEB0YWc6JHtSRVFVSVJFX1RSVVNURURfV09SS1NQQUNFX1NFVFRJTkdfVEFHfWAsXG5cdFx0YEB0YWc6JHtXT1JLU1BBQ0VfVFJVU1RfU0VUVElOR19UQUd9YCxcblx0XHQnQHRhZzpzeW5jJyxcblx0XHQnQHRhZzp1c2VzT25saW5lU2VydmljZXMnLFxuXHRcdCdAdGFnOnRlbGVtZXRyeScsXG5cdFx0J0B0YWc6YWNjZXNzaWJpbGl0eScsXG5cdFx0J0B0YWc6cHJldmlldycsXG5cdFx0J0B0YWc6ZXhwZXJpbWVudGFsJyxcblx0XHRgQHRhZzoke0FEVkFOQ0VEX1NFVFRJTkdfVEFHfWAsXG5cdFx0YEAke0lEX1NFVFRJTkdfVEFHfWAsXG5cdFx0YEAke0VYVEVOU0lPTl9TRVRUSU5HX1RBR31gLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfXNjbWAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9ZXhwbG9yZXJgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfXNlYXJjaGAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9ZGVidWdgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfWV4dGVuc2lvbnNgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfXRlcm1pbmFsYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR310YXNrYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31wcm9ibGVtc2AsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9b3V0cHV0YCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31jb21tZW50c2AsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9cmVtb3RlYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR310aW1lbGluZWAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9bm90ZWJvb2tgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfWNoYXRgLFxuXHRcdGBAJHtQT0xJQ1lfU0VUVElOR19UQUd9YFxuXHRdO1xuXG5cdHByaXZhdGUgc3RhdGljIHNob3VsZFNldHRpbmdVcGRhdGVGYXN0KHR5cGU6IFNldHRpbmdWYWx1ZVR5cGUgfCBTZXR0aW5nVmFsdWVUeXBlW10pOiBib29sZWFuIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh0eXBlKSkge1xuXHRcdFx0Ly8gbnVsbGFibGUgaW50ZWdlci9udW1iZXIgb3IgY29tcGxleFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5FbnVtIHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkFycmF5IHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkJvb2xlYW5PYmplY3QgfHxcblx0XHRcdHR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuT2JqZWN0IHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkNvbXBsZXggfHxcblx0XHRcdHR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuQm9vbGVhbiB8fFxuXHRcdFx0dHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5FeGNsdWRlIHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkluY2x1ZGU7XG5cdH1cblxuXHQvLyAoISkgTG90cyBvZiBwcm9wcyB0aGF0IGFyZSBzZXQgb25jZSBvbiB0aGUgZmlyc3QgcmVuZGVyXG5cdHByaXZhdGUgZGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwhOiBTZXR0aW5nczJFZGl0b3JNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cblx0cHJpdmF0ZSByb290RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGhlYWRlckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBib2R5Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoV2lkZ2V0ITogU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5O1xuXHRwcml2YXRlIGNvdW50RWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRyb2xzRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNldHRpbmdzVGFyZ2V0c1dpZGdldCE6IFNldHRpbmdzVGFyZ2V0c1dpZGdldDtcblxuXHRwcml2YXRlIHNwbGl0VmlldyE6IFNwbGl0VmlldzxudW1iZXI+O1xuXG5cdHByaXZhdGUgc2V0dGluZ3NUcmVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2V0dGluZ3NUcmVlITogU2V0dGluZ3NUcmVlO1xuXHRwcml2YXRlIHNldHRpbmdSZW5kZXJlcnMhOiBTZXR0aW5nVHJlZVJlbmRlcmVycztcblx0cHJpdmF0ZSB0b2NUcmVlTW9kZWwhOiBUT0NUcmVlTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3NUcmVlTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8U2V0dGluZ3NUcmVlTW9kZWw+KCkpO1xuXHRwcml2YXRlIG5vUmVzdWx0c01lc3NhZ2UhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjbGVhckZpbHRlckxpbmtDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHRvY1RyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0b2NUcmVlITogVE9DVHJlZTtcblxuXHRwcml2YXRlIHNlYXJjaERlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgc2VhcmNoSW5Qcm9ncmVzczogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBhaVNlYXJjaFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgbnVsbCA9IG51bGw7XG5cblx0LyoqXG5cdCAqIFRoZSB0cmltbWVkIHF1ZXJ5IHZhbHVlIHRoYXQgdGhlIGN1cnJlbnRseSByZW5kZXJlZCByZXN1bHRzIHJlZmxlY3QuIFVzZWQgdG8gZGV0ZXJtaW5lXG5cdCAqIHdoZXRoZXIgdGhlIGRpc3BsYXllZCByZXN1bHRzIGFyZSB1cCB0byBkYXRlIHdpdGggdGhlIGN1cnJlbnQgc2VhcmNoIGlucHV0IHZhbHVlIGJlZm9yZVxuXHQgKiBtb3ZpbmcgZm9jdXMgaW50byB0aGUgcmVzdWx0cy5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyZWRTZWFyY2hRdWVyeTogc3RyaW5nIHwgdW5kZWZpbmVkID0gJyc7XG5cblx0cHJpdmF0ZSBzaG93QWlSZXN1bHRzQWN0aW9uOiBBY3Rpb24gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHNlYXJjaElucHV0RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSB1cGRhdGVkQ29uZmlnU2NoZW1hRGVsYXllcjogRGVsYXllcjx2b2lkPjtcblxuXHRwcml2YXRlIHNldHRpbmdGYXN0VXBkYXRlRGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBzZXR0aW5nU2xvd1VwZGF0ZURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgcGVuZGluZ1NldHRpbmdVcGRhdGU6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiB1bmtub3duOyBsYW5ndWFnZUZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdTdGF0ZTogSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWFyY2hSZXN1bHRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxTZWFyY2hSZXN1bHRNb2RlbD4oKSk7XG5cdHByaXZhdGUgc2VhcmNoUmVzdWx0TGFiZWw6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGxhc3RTeW5jZWRMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXg6IE1hcDxzdHJpbmcsIG51bWJlcj4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHRvY1Jvd0ZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNldHRpbmdSb3dGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBzZXR0aW5nRmlyc3RSb3dGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpblNldHRpbmdzRWRpdG9yQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2VhcmNoRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBhaVJlc3VsdHNBdmFpbGFibGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgc2NoZWR1bGVkUmVmcmVzaGVzOiBNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+O1xuXHRwcml2YXRlIF9jdXJyZW50Rm9jdXNDb250ZXh0OiBTZXR0aW5nc0ZvY3VzQ29udGV4dCA9IFNldHRpbmdzRm9jdXNDb250ZXh0LlNlYXJjaDtcblxuXHQvKiogRG9uJ3Qgc3BhbSB3YXJuaW5ncyAqL1xuXHRwcml2YXRlIGhhc1dhcm5lZE1pc3NpbmdTZXR0aW5ncyA9IGZhbHNlO1xuXHRwcml2YXRlIHRvY1RyZWVEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdC8qKiBQZXJzaXN0IHRoZSBzZWFyY2ggcXVlcnkgdXBvbiByZWxvYWRzICovXG5cdHByaXZhdGUgZWRpdG9yTWVtZW50bzogSUVkaXRvck1lbWVudG88SVNldHRpbmdzRWRpdG9yMlN0YXRlPjtcblxuXHRwcml2YXRlIHRvY0ZvY3VzZWRFbGVtZW50OiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0cmVlRm9jdXNlZEVsZW1lbnQ6IFNldHRpbmdzVHJlZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzZXR0aW5nc1RyZWVTY3JvbGxUb3AgPSAwO1xuXHRwcml2YXRlIGRpbWVuc2lvbiE6IERPTS5EaW1lbnNpb247XG5cblx0cHJpdmF0ZSBpbnN0YWxsZWRFeHRlbnNpb25JZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3M6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX1NUT1JBR0VfS0VZID0gJ3NldHRpbmdzRWRpdG9yMi5kaXNtaXNzZWRFeHRlbnNpb25TZXR0aW5ncyc7XG5cdHByaXZhdGUgcmVhZG9ubHkgRElTTUlTU0VEX0VYVEVOU0lPTl9TRVRUSU5HU19ERUxJTUlURVIgPSAnXFx0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IFNFQVJDSF9ISVNUT1JZX1NUT1JBR0VfS0VZID0gJ3NldHRpbmdzRWRpdG9yMi5zZWFyY2hIaXN0b3J5JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0Q2hhbmdlTGlzdGVuZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPjtcblxuXHRwcml2YXRlIHNlYXJjaElucHV0QWN0aW9uQmFyOiBBY3Rpb25CYXIgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZWFyY2hTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJvdGVjdGVkIGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZTogSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTZXR0aW5nc0VkaXRvcjIuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcigyMDApKTtcblx0XHR0aGlzLnZpZXdTdGF0ZSA9IHsgc2V0dGluZ3NUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCB9O1xuXG5cdFx0dGhpcy5zZXR0aW5nRmFzdFVwZGF0ZURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPihTZXR0aW5nc0VkaXRvcjIuU0VUVElOR19VUERBVEVfRkFTVF9ERUJPVU5DRSkpO1xuXHRcdHRoaXMuc2V0dGluZ1Nsb3dVcGRhdGVEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oU2V0dGluZ3NFZGl0b3IyLlNFVFRJTkdfVVBEQVRFX1NMT1dfREVCT1VOQ0UpKTtcblxuXHRcdHRoaXMuc2VhcmNoSW5wdXREZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oU2V0dGluZ3NFZGl0b3IyLlNFQVJDSF9ERUJPVU5DRSkpO1xuXHRcdHRoaXMudXBkYXRlZENvbmZpZ1NjaGVtYURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPihTZXR0aW5nc0VkaXRvcjIuQ09ORklHX1NDSEVNQV9VUERBVEVfREVMQVlFUikpO1xuXG5cdFx0dGhpcy5pblNldHRpbmdzRWRpdG9yQ29udGV4dEtleSA9IENPTlRFWFRfU0VUVElOR1NfRURJVE9SLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hGb2N1c0NvbnRleHRLZXkgPSBDT05URVhUX1NFVFRJTkdTX1NFQVJDSF9GT0NVUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudG9jUm93Rm9jdXNlZCA9IENPTlRFWFRfVE9DX1JPV19GT0NVUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2V0dGluZ1Jvd0ZvY3VzZWQgPSBDT05URVhUX1NFVFRJTkdTX1JPV19GT0NVUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2V0dGluZ0ZpcnN0Um93Rm9jdXNlZCA9IENPTlRFWFRfU0VUVElOR1NfRklSU1RfUk9XX0ZPQ1VTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5haVJlc3VsdHNBdmFpbGFibGUgPSBDT05URVhUX0FJX1NFVFRJTkdfUkVTVUxUU19BVkFJTEFCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuc2NoZWR1bGVkUmVmcmVzaGVzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRcdHRoaXMuZWRpdG9yTWVtZW50byA9IHRoaXMuZ2V0RWRpdG9yTWVtZW50bzxJU2V0dGluZ3NFZGl0b3IyU3RhdGU+KGVkaXRvckdyb3VwU2VydmljZSwgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIFNFVFRJTkdTX0VESVRPUl9TVEFURV9LRVkpO1xuXG5cdFx0dGhpcy5kaXNtaXNzZWRFeHRlbnNpb25TZXR0aW5ncyA9IHRoaXMuc3RvcmFnZVNlcnZpY2Vcblx0XHRcdC5nZXQodGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJycpXG5cdFx0XHQuc3BsaXQodGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX0RFTElNSVRFUik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RlZEtleXMuaGFzKFdvcmtiZW5jaFNldHRpbmdzRWRpdG9yU2V0dGluZ3MuU2hvd0FJU2VhcmNoVG9nZ2xlKVxuXHRcdFx0XHR8fCBlLmFmZmVjdGVkS2V5cy5oYXMoV29ya2JlbmNoU2V0dGluZ3NFZGl0b3JTZXR0aW5ncy5FbmFibGVOYXR1cmFsTGFuZ3VhZ2VTZWFyY2gpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWlTZWFyY2hUb2dnbGVWaXNpYmlsaXR5KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBTFdBWVNfU0hPV19BRFZBTkNFRF9TRVRUSU5HU19TRVRUSU5HKSkge1xuXHRcdFx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKHVuZGVmaW5lZCwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5zb3VyY2UgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKGUuYWZmZWN0ZWRLZXlzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQWlTZWFyY2hUb2dnbGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKGUgPT4ge1xuXHRcdFx0ZS5qb2luKHRoaXMud2hlbkN1cnJlbnRQcm9maWxlQ2hhbmdlZCgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbD8udXBkYXRlV29ya3NwYWNlVHJ1c3Qod29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cblx0XHRcdGlmICh0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUudXBkYXRlV29ya3NwYWNlVHJ1c3Qod29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cdFx0XHRcdHRoaXMucmVuZGVyVHJlZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzKGUgPT4ge1xuXHRcdFx0aWYgKGUuZGVmYXVsdC5sZW5ndGggJiYgdGhpcy5jdXJyZW50U2V0dGluZ3NNb2RlbCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVsZW1lbnRzQnlLZXkobmV3IFNldChlLmRlZmF1bHQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKCgpID0+IHtcblx0XHRcdHRoaXMucmVmcmVzaEluc3RhbGxlZEV4dGVuc2lvbnNMaXN0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKCgpID0+IHtcblx0XHRcdHRoaXMucmVmcmVzaEluc3RhbGxlZEV4dGVuc2lvbnNMaXN0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGlmIChFTkFCTEVfTEFOR1VBR0VfRklMVEVSICYmICFTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMuaW5jbHVkZXMoYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMucHVzaChgQCR7TEFOR1VBR0VfU0VUVElOR19UQUd9YCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmICFTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMuaW5jbHVkZXMoYEAke0FHRU5UU19XSU5ET1dfU0VUVElOR19UQUd9YCkpIHtcblx0XHRcdFNldHRpbmdzRWRpdG9yMi5TVUdHRVNUSU9OUy5wdXNoKGBAJHtBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHfWApO1xuXHRcdH1cblx0XHR0aGlzLmlucHV0Q2hhbmdlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdoZW5DdXJyZW50UHJvZmlsZUNoYW5nZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVkQ29uZmlnU2NoZW1hRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlXG5cdFx0XHRcdC5nZXQodGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJycpXG5cdFx0XHRcdC5zcGxpdCh0aGlzLkRJU01JU1NFRF9FWFRFTlNJT05fU0VUVElOR1NfREVMSU1JVEVSKTtcblx0XHRcdHRoaXMub25Db25maWdVcGRhdGUodW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2FuU2hvd0FkdmFuY2VkU2V0dGluZ3MoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUxXQVlTX1NIT1dfQURWQU5DRURfU0VUVElOR1NfU0VUVElORykgPz8gZmFsc2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy52aWV3U3RhdGUudGFnRmlsdGVycz8uaGFzKEFEVkFOQ0VEX1NFVFRJTkdfVEFHKSA/PyBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmVzIHdoZXRoZXIgYSBzZXR0aW5nIHNob3VsZCBiZSBzaG93biBldmVuIHdoZW4gYWR2YW5jZWQgc2V0dGluZ3MgYXJlIGZpbHRlcmVkIG91dC5cblx0ICogUmV0dXJucyB0cnVlIGlmOlxuXHQgKiAtIFRoZSBzZXR0aW5nIGlzIG5vdCB0YWdnZWQgYXMgYWR2YW5jZWQsIE9SXG5cdCAqIC0gVGhlIHNldHRpbmcgbWF0Y2hlcyBhbiBJRCBmaWx0ZXIgKEBpZDpzZXR0aW5nS2V5KSwgT1Jcblx0ICogLSBUaGUgc2V0dGluZyBrZXkgYXBwZWFycyBpbiB0aGUgc2VhcmNoIHF1ZXJ5LCBPUlxuXHQgKiAtIFRoZSBAaGFzUG9saWN5IGZpbHRlciBpcyBhY3RpdmUgKHBvbGljeSBzZXR0aW5ncyBzaG91bGQgYWx3YXlzIGJlIHNob3duIHdoZW4gZmlsdGVyaW5nIGJ5IHBvbGljeSlcblx0ICovXG5cdHByaXZhdGUgc2hvdWxkU2hvd1NldHRpbmcoc2V0dGluZzogSVNldHRpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXNldHRpbmcudGFncz8uaW5jbHVkZXMoQURWQU5DRURfU0VUVElOR19UQUcpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld1N0YXRlLmlkRmlsdGVycz8uaGFzKHNldHRpbmcua2V5KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdTdGF0ZS5xdWVyeT8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhzZXR0aW5nLmtleS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5oYXMoUE9MSUNZX1NFVFRJTkdfVEFHKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZGlzYWJsZUFpU2VhcmNoVG9nZ2xlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24pIHtcblx0XHRcdHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5haVJlc3VsdHNBdmFpbGFibGUuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5sYWJlbCA9IFNIT1dfQUlfUkVTVUxUU19ESVNBQkxFRF9MQUJFTDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFpU2VhcmNoVG9nZ2xlVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2VhcmNoQ29udGFpbmVyIHx8ICF0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24gfHwgIXRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG93QWlUb2dnbGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFdvcmtiZW5jaFNldHRpbmdzRWRpdG9yU2V0dGluZ3MuU2hvd0FJU2VhcmNoVG9nZ2xlKTtcblx0XHRjb25zdCBlbmFibGVOYXR1cmFsTGFuZ3VhZ2VTZWFyY2ggPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFdvcmtiZW5jaFNldHRpbmdzRWRpdG9yU2V0dGluZ3MuRW5hYmxlTmF0dXJhbExhbmd1YWdlU2VhcmNoKTtcblx0XHRjb25zdCBjaGF0SGlkZGVuID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW4gfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5kaXNhYmxlZDtcblx0XHRjb25zdCBjYW5TaG93VG9nZ2xlID0gc2hvd0FpVG9nZ2xlICYmIGVuYWJsZU5hdHVyYWxMYW5ndWFnZVNlYXJjaCAmJiAhY2hhdEhpZGRlbjtcblxuXHRcdGNvbnN0IGFscmVhZHlWaXNpYmxlID0gdGhpcy5zZWFyY2hJbnB1dEFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKTtcblx0XHRpZiAoIWFscmVhZHlWaXNpYmxlICYmIGNhblNob3dUb2dnbGUpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIucHVzaCh0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24sIHtcblx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdGxhYmVsOiBmYWxzZSxcblx0XHRcdFx0aWNvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLnNlYXJjaENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd3aXRoLWFpLXRvZ2dsZScpO1xuXHRcdH0gZWxzZSBpZiAoYWxyZWFkeVZpc2libGUpIHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIucHVsbCgwKTtcblx0XHRcdHRoaXMuc2VhcmNoQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3dpdGgtYWktdG9nZ2xlJyk7XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldCBtaW5pbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIFNldHRpbmdzRWRpdG9yMi5FRElUT1JfTUlOX1dJRFRIOyB9XG5cdG92ZXJyaWRlIGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXHRvdmVycmlkZSBnZXQgbWluaW11bUhlaWdodCgpIHsgcmV0dXJuIDE4MDsgfVxuXG5cdC8vIHRoZXNlIHNldHRlcnMgbmVlZCB0byBleGlzdCBiZWNhdXNlIHRoaXMgZXh0ZW5kcyBmcm9tIEVkaXRvclBhbmVcblx0b3ZlcnJpZGUgc2V0IG1pbmltdW1XaWR0aCh2YWx1ZTogbnVtYmVyKSB7IC8qbm9vcCovIH1cblx0b3ZlcnJpZGUgc2V0IG1heGltdW1XaWR0aCh2YWx1ZTogbnVtYmVyKSB7IC8qbm9vcCovIH1cblxuXHRwcml2YXRlIGdldCBjdXJyZW50U2V0dGluZ3NNb2RlbCgpOiBTZXR0aW5nc1RyZWVNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwgfHwgdGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHNlYXJjaFJlc3VsdE1vZGVsKCk6IFNlYXJjaFJlc3VsdE1vZGVsIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFJlc3VsdE1vZGVsLnZhbHVlID8/IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHNldCBzZWFyY2hSZXN1bHRNb2RlbCh2YWx1ZTogU2VhcmNoUmVzdWx0TW9kZWwgfCBudWxsKSB7XG5cdFx0dGhpcy5fc2VhcmNoUmVzdWx0TW9kZWwudmFsdWUgPSB2YWx1ZSA/PyB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnJvb3RFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlYXJjaC1tb2RlJywgISF0aGlzLl9zZWFyY2hSZXN1bHRNb2RlbC52YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBmb2N1c2VkU2V0dGluZ0RPTUVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRGb2N1cygpWzBdO1xuXHRcdGlmICghKGZvY3VzZWQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zZXR0aW5nUmVuZGVyZXJzLmdldERPTUVsZW1lbnRzRm9yU2V0dGluZ0tleSh0aGlzLnNldHRpbmdzVHJlZS5nZXRIVE1MRWxlbWVudCgpLCBmb2N1c2VkLnNldHRpbmcua2V5KVswXTtcblx0fVxuXG5cdGdldCBjdXJyZW50Rm9jdXNDb250ZXh0KCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0cGFyZW50LnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTtcblx0XHR0aGlzLnJvb3RFbGVtZW50ID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5zZXR0aW5ncy1lZGl0b3InLCB7IHRhYmluZGV4OiAnLTEnIH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlSGVhZGVyKHRoaXMucm9vdEVsZW1lbnQpO1xuXHRcdHRoaXMuY3JlYXRlQm9keSh0aGlzLnJvb3RFbGVtZW50KTtcblx0XHR0aGlzLmFkZEN0cmxBSW50ZXJjZXB0b3IodGhpcy5yb290RWxlbWVudCk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyKHtcblx0XHRcdG5hbWU6ICdzZXR0aW5nc0VkaXRvcjInLFxuXHRcdFx0Zm9jdXNOb3RpZmllcnM6IFt0aGlzXSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRXaWRnZXQuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNUT0MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZvY3VzUHJldmlvdXNXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLnNlYXJjaFdpZGdldC5pbnB1dFdpZGdldC5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFNldHRpbmdzRWRpdG9yMklucHV0LCBvcHRpb25zOiBJU2V0dGluZ3NFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuaW5TZXR0aW5nc0VkaXRvckNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKCF0aGlzLmlucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmlucHV0LnJlc29sdmUoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIShtb2RlbCBpbnN0YW5jZW9mIFNldHRpbmdzMkVkaXRvck1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VHcm91cHMoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVkQ29uZmlnU2NoZW1hRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZSh1bmRlZmluZWQsIGZhbHNlLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsID0gbW9kZWw7XG5cblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB2YWxpZGF0ZVNldHRpbmdzRWRpdG9yT3B0aW9ucyh7fSk7XG5cdFx0aWYgKCF0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCB8fCAhdGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQuc2V0dGluZ3NUYXJnZXQpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnNIYXNWaWV3U3RhdGVUYXJnZXQgPSBvcHRpb25zLnZpZXdTdGF0ZSAmJiAob3B0aW9ucy52aWV3U3RhdGUgYXMgSVNldHRpbmdzRWRpdG9yVmlld1N0YXRlKS5zZXR0aW5nc1RhcmdldDtcblx0XHRcdGlmICghb3B0aW9ucy50YXJnZXQgJiYgIW9wdGlvbnNIYXNWaWV3U3RhdGVUYXJnZXQpIHtcblx0XHRcdFx0b3B0aW9ucy50YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldE9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHQvLyBEb24ndCBibG9jayBzZXRJbnB1dCBvbiByZW5kZXIgKHdoaWNoIGNhbiB0cmlnZ2VyIGFuIGFzeW5jIHNlYXJjaClcblx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKHVuZGVmaW5lZCwgdHJ1ZSkudGhlbigoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIGV2ZW50IHJ1bnMgd2hlbiB0aGUgZWRpdG9yIGNsb3Nlcy5cblx0XHRcdHRoaXMuaW5wdXRDaGFuZ2VMaXN0ZW5lci52YWx1ZSA9IGlucHV0Lm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSW5pdCBUT0Mgc2VsZWN0aW9uXG5cdFx0XHR0aGlzLnVwZGF0ZVRyZWVTY3JvbGxTeW5jKCk7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aGlzLnJlZnJlc2hJbnN0YWxsZWRFeHRlbnNpb25zTGlzdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoSW5zdGFsbGVkRXh0ZW5zaW9uc0xpc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0dGhpcy5pbnN0YWxsZWRFeHRlbnNpb25JZHMgPSBpbnN0YWxsZWRFeHRlbnNpb25zXG5cdFx0XHQuZmlsdGVyKGV4dCA9PiBleHQubWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbmZpZ3VyYXRpb24pXG5cdFx0XHQubWFwKGV4dCA9PiBleHQuaWRlbnRpZmllci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVDYWNoZWRTdGF0ZSgpOiBJU2V0dGluZ3NFZGl0b3IyU3RhdGUgfCBudWxsIHtcblx0XHRjb25zdCBjYWNoZWRTdGF0ZSA9IHRoaXMuaW5wdXQgJiYgdGhpcy5lZGl0b3JNZW1lbnRvLmxvYWRFZGl0b3JTdGF0ZSh0aGlzLmdyb3VwLCB0aGlzLmlucHV0KTtcblx0XHRpZiAoY2FjaGVkU3RhdGUgJiYgdHlwZW9mIGNhY2hlZFN0YXRlLnRhcmdldCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdGNhY2hlZFN0YXRlLnRhcmdldCA9IFVSSS5yZXZpdmUoY2FjaGVkU3RhdGUudGFyZ2V0KTtcblx0XHR9XG5cblx0XHRpZiAoY2FjaGVkU3RhdGUpIHtcblx0XHRcdGNvbnN0IHNldHRpbmdzVGFyZ2V0ID0gY2FjaGVkU3RhdGUudGFyZ2V0O1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQuc2V0dGluZ3NUYXJnZXQgPSBzZXR0aW5nc1RhcmdldDtcblx0XHRcdHRoaXMudmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0ID0gc2V0dGluZ3NUYXJnZXQ7XG5cdFx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoY2FjaGVkU3RhdGUuc2VhcmNoUXVlcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHR0aGlzLmVkaXRvck1lbWVudG8uY2xlYXJFZGl0b3JTdGF0ZSh0aGlzLmlucHV0LCB0aGlzLmdyb3VwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FjaGVkU3RhdGUgPz8gbnVsbDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZpZXdTdGF0ZSgpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdTdGF0ZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucykge1xuXHRcdFx0dGhpcy5fc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRPcHRpb25zKG9wdGlvbnM6IElTZXR0aW5nc0VkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAob3B0aW9ucy5mb2N1c1NlYXJjaCAmJiAhcGxhdGZvcm0uaXNJT1MpIHtcblx0XHRcdC8vIGlzSU9TIC0gIzEyMjA0NFxuXHRcdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlY292ZXJlZFZpZXdTdGF0ZSA9IG9wdGlvbnMudmlld1N0YXRlID9cblx0XHRcdG9wdGlvbnMudmlld1N0YXRlIGFzIElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHF1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQgPSByZWNvdmVyZWRWaWV3U3RhdGU/LnF1ZXJ5ID8/IG9wdGlvbnMucXVlcnk7XG5cdFx0aWYgKHF1ZXJ5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHF1ZXJ5KTtcblx0XHRcdHRoaXMudmlld1N0YXRlLnF1ZXJ5ID0gcXVlcnk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0OiBTZXR0aW5nc1RhcmdldCB8IHVuZGVmaW5lZCA9IG9wdGlvbnMuZm9sZGVyVXJpID8/IHJlY292ZXJlZFZpZXdTdGF0ZT8uc2V0dGluZ3NUYXJnZXQgPz8gPFNldHRpbmdzVGFyZ2V0IHwgdW5kZWZpbmVkPm9wdGlvbnMudGFyZ2V0O1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXRzV2lkZ2V0LnVwZGF0ZVRhcmdldCh0YXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5pblNldHRpbmdzRWRpdG9yQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblxuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KGRpbWVuc2lvbik7XG5cblx0XHRjb25zdCBpbm5lcldpZHRoID0gTWF0aC5taW4odGhpcy5oZWFkZXJDb250YWluZXIuY2xpZW50V2lkdGgsIGRpbWVuc2lvbi53aWR0aCkgLSAyNCAqIDI7IC8vIDI0cHggcGFkZGluZyBvbiBsZWZ0IGFuZCByaWdodDtcblx0XHQvLyBtaW51cyBwYWRkaW5nIGluc2lkZSBpbnB1dGJveCwgY29udHJvbHMgd2lkdGgsIGFuZCBleHRyYSBwYWRkaW5nIGJlZm9yZSBjb3VudEVsZW1lbnRcblx0XHRjb25zdCBtb25hY29XaWR0aCA9IGlubmVyV2lkdGggLSAxMCAtIHRoaXMuY29udHJvbHNFbGVtZW50LmNsaWVudFdpZHRoIC0gMTI7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQubGF5b3V0KG5ldyBET00uRGltZW5zaW9uKG1vbmFjb1dpZHRoLCAyMCkpO1xuXG5cdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduYXJyb3ctd2lkdGgnLCBkaW1lbnNpb24ud2lkdGggPCBTZXR0aW5nc0VkaXRvcjIuTkFSUk9XX1RPVEFMX1dJRFRIKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHRpZiAodGhpcy5fY3VycmVudEZvY3VzQ29udGV4dCA9PT0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2VhcmNoKSB7XG5cdFx0XHRpZiAoIXBsYXRmb3JtLmlzSU9TKSB7XG5cdFx0XHRcdC8vICMxMjIwNDRcblx0XHRcdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudEZvY3VzQ29udGV4dCA9PT0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2V0dGluZ0NvbnRyb2wpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmZvY3VzZWRTZXR0aW5nRE9NRWxlbWVudDtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBjb250cm9sID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLkNPTlRST0xfU0VMRUNUT1IpO1xuXHRcdFx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0XHRcdCg8SFRNTEVsZW1lbnQ+Y29udHJvbCkuZm9jdXMoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlNldHRpbmdUcmVlKSB7XG5cdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5kb21Gb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudEZvY3VzQ29udGV4dCA9PT0gU2V0dGluZ3NGb2N1c0NvbnRleHQuVGFibGVPZkNvbnRlbnRzKSB7XG5cdFx0XHR0aGlzLnRvY1RyZWUuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblxuXHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0Ly8gV2FpdCBmb3IgZWRpdG9yIHRvIGJlIHJlbW92ZWQgZnJvbSBET00gIzEwNjMwM1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0Lm9uSGlkZSgpO1xuXHRcdFx0XHR0aGlzLnNldHRpbmdSZW5kZXJlcnMuY2FuY2VsU3VnZ2VzdGVycygpO1xuXHRcdFx0fSwgMCk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNTZXR0aW5ncyhmb2N1c1NldHRpbmdJbnB1dCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuc2V0dGluZ3NUcmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKCFmb2N1c2VkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0dGluZ3NUcmVlLmRvbUZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXNTZXR0aW5nSW5wdXQpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgY29udHJvbEluRm9jdXNlZFJvdyA9IHRoaXMuc2V0dGluZ3NUcmVlLmdldEhUTUxFbGVtZW50KCkucXVlcnlTZWxlY3RvcihgLmZvY3VzZWQgJHtBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX1NFTEVDVE9SfWApO1xuXHRcdFx0aWYgKGNvbnRyb2xJbkZvY3VzZWRSb3cpIHtcblx0XHRcdFx0KDxIVE1MRWxlbWVudD5jb250cm9sSW5Gb2N1c2VkUm93KS5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZvY3VzVE9DKCk6IHZvaWQge1xuXHRcdHRoaXMudG9jVHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbiB0aGUgdXNlciBwcmVzc2VzIHRoZSBkb3duIGFycm93IHdoaWxlIHRoZSBzZWFyY2ggaW5wdXQgaXMgZm9jdXNlZC5cblx0ICogTmF2aWdhdGVzIGZvcndhcmQgdGhyb3VnaCB0aGUgc2VhcmNoIGhpc3RvcnkgZmlyc3Q7IG9ubHkgb25jZSB0aGVyZSBhcmUgbm8gbW9yZVxuXHQgKiByZWNlbnQgaGlzdG9yeSBlbnRyaWVzIGRvZXMgZm9jdXMgbW92ZSBkb3duIGludG8gdGhlIHNldHRpbmdzIHJlc3VsdHMuXG5cdCAqL1xuXHRuYXZpZ2F0ZVNlYXJjaEhpc3RvcnlOZXh0T3JGb2N1c1NldHRpbmdzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5pc05hdmlnYXRpbmdIaXN0b3J5KCkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNob3dOZXh0VmFsdWUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mb2N1c0ZpcnN0U2V0dGluZ0Zyb21TZWFyY2goKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW52b2tlZCB3aGVuIHRoZSB1c2VyIHByZXNzZXMgdGhlIHVwIGFycm93IHdoaWxlIHRoZSBzZWFyY2ggaW5wdXQgaXMgZm9jdXNlZC5cblx0ICogTmF2aWdhdGVzIGJhY2t3YXJkIHRocm91Z2ggdGhlIHNlYXJjaCBoaXN0b3J5LlxuXHQgKi9cblx0bmF2aWdhdGVTZWFyY2hIaXN0b3J5UHJldmlvdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2hvd1ByZXZpb3VzVmFsdWUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgcmVzdWx0cyByZWZsZWN0IHRoZSBjdXJyZW50IHNlYXJjaCBpbnB1dCB2YWx1ZS5cblx0ICogUmV0dXJucyBmYWxzZSB3aGlsZSBhIHNlYXJjaCBpcyBzdGlsbCBwZW5kaW5nIChkZWJvdW5jZWQpIG9yIGluIHByb2dyZXNzLCBzbyB0aGF0XG5cdCAqIGZvY3VzIGlzIG5vdCBtb3ZlZCBpbnRvIHN0YWxlIHJlc3VsdHMuXG5cdCAqL1xuXHRwcml2YXRlIGlzU2VhcmNoVXBUb0RhdGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLnNlYXJjaElucHV0RGVsYXllci5pc1RyaWdnZXJlZCAmJiB0aGlzLnJlbmRlcmVkU2VhcmNoUXVlcnkgPT09IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkudHJpbSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIGZvY3VzIGZyb20gdGhlIHNlYXJjaCBpbnB1dCBpbnRvIHRoZSBmaXJzdCBzZXR0aW5ncyByZXN1bHQsIGJ1dCBvbmx5IHdoZW4gdGhlXG5cdCAqIGRpc3BsYXllZCByZXN1bHRzIGFyZSB1cCB0byBkYXRlIHdpdGggdGhlIGN1cnJlbnQgc2VhcmNoIGlucHV0LiBJZiB0aGUgcmVzdWx0cyBhcmVcblx0ICogc3RhbGUgKGEgc2VhcmNoIGlzIHN0aWxsIHBlbmRpbmcgb3IgaW4gcHJvZ3Jlc3MpLCB0aGlzIGRvZXMgbm90aGluZyBzbyB0aGF0IGZvY3VzIGRvZXNcblx0ICogbm90IGxhbmQgb24gcmVzdWx0cyBmcm9tIGEgcHJldmlvdXMgcXVlcnkuXG5cdCAqL1xuXHRmb2N1c0ZpcnN0U2V0dGluZ0Zyb21TZWFyY2goKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzU2VhcmNoVXBUb0RhdGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmZvY3VzU2V0dGluZ3MoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2V0dGluZ0ZpcnN0Um93Rm9jdXNlZENvbnRleHQoZWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLnNldHRpbmdGaXJzdFJvd0ZvY3VzZWQuc2V0KCEhZWxlbWVudCAmJiBlbGVtZW50ID09PSB0aGlzLnNldHRpbmdzVHJlZS5uYXZpZ2F0ZSgpLmZpcnN0KCkpO1xuXHR9XG5cblx0c2hvd0NvbnRleHRNZW51KCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRGb2N1cygpWzBdO1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSB0aGlzLmZvY3VzZWRTZXR0aW5nRE9NRWxlbWVudDtcblx0XHRpZiAocm93RWxlbWVudCAmJiBmb2N1c2VkIGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRcdHRoaXMuc2V0dGluZ1JlbmRlcmVycy5zaG93Q29udGV4dE1lbnUoZm9jdXNlZCwgcm93RWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNTZWFyY2goZmlsdGVyPzogc3RyaW5nLCBzZWxlY3RBbGwgPSB0cnVlKTogdm9pZCB7XG5cdFx0aWYgKGZpbHRlciAmJiB0aGlzLnNlYXJjaFdpZGdldCkge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoZmlsdGVyKTtcblx0XHR9XG5cblx0XHQvLyBEbyBub3Qgc2VsZWN0IGFsbCBpZiB0aGUgdXNlciBpcyBhbHJlYWR5IHNlYXJjaGluZy5cblx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyhzZWxlY3RBbGwgJiYgIXRoaXMuc2VhcmNoSW5wdXREZWxheWVyLmlzVHJpZ2dlcmVkKTtcblx0fVxuXG5cdGNsZWFyU2VhcmNoUmVzdWx0cygpOiB2b2lkIHtcblx0XHR0aGlzLmRpc2FibGVBaVNlYXJjaFRvZ2dsZSgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLmZvY3VzU2VhcmNoKCk7XG5cdH1cblxuXHRjbGVhclNlYXJjaEZpbHRlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXG5cdFx0Y29uc3Qgc3BsaXRRdWVyeSA9IHF1ZXJ5LnNwbGl0KCcgJykuZmlsdGVyKHdvcmQgPT4ge1xuXHRcdFx0cmV0dXJuIHdvcmQubGVuZ3RoICYmICFTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMuc29tZShzdWdnZXN0aW9uID0+IHdvcmQuc3RhcnRzV2l0aChzdWdnZXN0aW9uKSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShzcGxpdFF1ZXJ5LmpvaW4oJyAnKSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgc2VhcmNoIGlucHV0IHBsYWNlaG9sZGVyIHNvIHRoYXQgaXQgaGludHMgYXQgaGlzdG9yeSBuYXZpZ2F0aW9uXG5cdCAqICh1cC9kb3duIGFycm93cykgb25jZSB0aGUgdXNlciBoYXMgc2VhcmNoIGhpc3RvcnksIHNpbWlsYXIgdG8gdGhlIGtleWJvYXJkXG5cdCAqIHNob3J0Y3V0cyBlZGl0b3IuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNlYXJjaFBsYWNlaG9sZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc0hpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRIaXN0b3J5KCkubGVuZ3RoID4gMDtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRQbGFjZUhvbGRlcihoYXNIaXN0b3J5ID8gc2VhcmNoQm94UGxhY2Vob2xkZXJXaXRoSGlzdG9yeSA6IHNlYXJjaEJveExhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5wdXRBcmlhTGFiZWwoKSB7XG5cdFx0bGV0IGxhYmVsID0gc2VhcmNoQm94TGFiZWw7XG5cdFx0aWYgKHRoaXMuc2VhcmNoUmVzdWx0TGFiZWwpIHtcblx0XHRcdGxhYmVsICs9IGAuICR7dGhpcy5zZWFyY2hSZXN1bHRMYWJlbH1gO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxhc3RTeW5jZWRMYWJlbCkge1xuXHRcdFx0bGFiZWwgKz0gYC4gJHt0aGlzLmxhc3RTeW5jZWRMYWJlbH1gO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnVwZGF0ZUFyaWFMYWJlbChsYWJlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBoZWFkZXIgb2YgdGhlIFNldHRpbmdzIGVkaXRvciwgd2hpY2ggaW5jbHVkZXMgdGhlIGNvbnRlbnQgYWJvdmUgdGhlIHNwbGl0dmlldy5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlSGVhZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuc2V0dGluZ3MtaGVhZGVyJykpO1xuXHRcdHRoaXMuc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnNlYXJjaC1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBjbGVhcklucHV0QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihTRVRUSU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUyxcblx0XHRcdGxvY2FsaXplKCdjbGVhcklucHV0JywgXCJDbGVhciBTZXR0aW5ncyBTZWFyY2ggSW5wdXRcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShwcmVmZXJlbmNlc0NsZWFySW5wdXRJY29uKSwgZmFsc2UsXG5cdFx0XHRhc3luYyAoKSA9PiB0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpXG5cdFx0KSk7XG5cblx0XHRjb25zdCBzaG93QWlSZXN1bHRBY3Rpb25DbGFzc05hbWVzID0gWydhY3Rpb24tbGFiZWwnLCBUaGVtZUljb24uYXNDbGFzc05hbWUocHJlZmVyZW5jZXNBaVJlc3VsdHNJY29uKV07XG5cdFx0dGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0FJX1JFU1VMVFMsXG5cdFx0XHRTSE9XX0FJX1JFU1VMVFNfRElTQUJMRURfTEFCRUwsIHNob3dBaVJlc3VsdEFjdGlvbkNsYXNzTmFtZXMuam9pbignICcpLCB0cnVlXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLm9uRGlkQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMub25EaWRUb2dnbGVBaVNlYXJjaCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGZpbHRlckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU1VHR0VTVF9GSUxURVJTLFxuXHRcdFx0bG9jYWxpemUoJ2ZpbHRlcklucHV0JywgXCJGaWx0ZXIgU2V0dGluZ3NcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShwcmVmZXJlbmNlc0ZpbHRlckljb24pXG5cdFx0KSk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5LCB7XG5cdFx0XHRpZDogYCR7U2V0dGluZ3NFZGl0b3IyLklEfS5zZWFyY2hib3hgLFxuXHRcdFx0cGFyZW50OiB0aGlzLnNlYXJjaENvbnRhaW5lcixcblx0XHRcdGFyaWFMYWJlbDogc2VhcmNoQm94TGFiZWwsXG5cdFx0XHRyZXNvdXJjZUhhbmRsZTogJ3NldHRpbmdzZWRpdG9yOnNlYXJjaGlucHV0JyArIFNldHRpbmdzRWRpdG9yMi5OVU1fSU5TVEFOQ0VTKyssXG5cdFx0XHRzdWdnZXN0aW9uUHJvdmlkZXI6IHtcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnQCcsICc6J10sXG5cdFx0XHRcdHByb3ZpZGVSZXN1bHRzOiAocXVlcnk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdC8vIEJhc2VkIG9uIHRlc3RpbmcsIHRoZSB0cmlnZ2VyIGNoYXJhY3RlciBpcyBhbHdheXMgYXQgdGhlIGVuZCBvZiB0aGUgcXVlcnkuXG5cdFx0XHRcdFx0Ly8gZm9yIHRoZSAnOicgdHJpZ2dlciwgb25seSByZXR1cm4gc3VnZ2VzdGlvbnMgaWYgdGhlcmUgd2FzIGEgJ0AnIGJlZm9yZSBpdCBpbiB0aGUgc2FtZSB3b3JkLlxuXHRcdFx0XHRcdGNvbnN0IHF1ZXJ5UGFydHMgPSBxdWVyeS5zcGxpdCgvXFxzL2cpO1xuXHRcdFx0XHRcdGlmIChxdWVyeVBhcnRzW3F1ZXJ5UGFydHMubGVuZ3RoIC0gMV0uc3RhcnRzV2l0aChgQCR7TEFOR1VBR0VfU0VUVElOR19UQUd9YCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvcnRlZExhbmd1YWdlcyA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldFJlZ2lzdGVyZWRMYW5ndWFnZUlkcygpLm1hcChsYW5ndWFnZUlkID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR30ke2xhbmd1YWdlSWR9IGA7XG5cdFx0XHRcdFx0XHR9KS5zb3J0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc29ydGVkTGFuZ3VhZ2VzLmZpbHRlcihsYW5nRmlsdGVyID0+ICFxdWVyeS5pbmNsdWRlcyhsYW5nRmlsdGVyKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChxdWVyeVBhcnRzW3F1ZXJ5UGFydHMubGVuZ3RoIC0gMV0uc3RhcnRzV2l0aChgQCR7RVhURU5TSU9OX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zVGFncyA9IHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uSWRzLm1hcChleHRlbnNpb25JZCA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgQCR7RVhURU5TSU9OX1NFVFRJTkdfVEFHfSR7ZXh0ZW5zaW9uSWR9IGA7XG5cdFx0XHRcdFx0XHR9KS5zb3J0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9uc1RhZ3MuZmlsdGVyKGV4dEZpbHRlciA9PiAhcXVlcnkuaW5jbHVkZXMoZXh0RmlsdGVyKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChxdWVyeSA9PT0gJycgfHwgcXVlcnlQYXJ0c1txdWVyeVBhcnRzLmxlbmd0aCAtIDFdLnN0YXJ0c1dpdGgoJ0AnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFNldHRpbmdzRWRpdG9yMi5TVUdHRVNUSU9OUy5maWx0ZXIodGFnID0+ICFxdWVyeS5pbmNsdWRlcyh0YWcpKS5tYXAodGFnID0+IHRhZy5lbmRzV2l0aCgnOicpID8gdGFnIDogdGFnICsgJyAnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c3VnZ2VzdE9wdGlvbnM6IHtcblx0XHRcdFx0cGxhY2Vob2xkZXJUZXh0OiBzZWFyY2hCb3hMYWJlbCxcblx0XHRcdFx0Zm9jdXNDb250ZXh0S2V5OiB0aGlzLnNlYXJjaEZvY3VzQ29udGV4dEtleSxcblx0XHRcdFx0c3R5bGVPdmVycmlkZXM6IHtcblx0XHRcdFx0XHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUT0RPOiBBcmlhLWxpdmVcblx0XHRcdH0sXG5cdFx0XHRoaXN0b3J5OiB0aGlzLmxvYWRTZWFyY2hIaXN0b3J5KClcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2VhcmNoO1xuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZVNlYXJjaFBsYWNlaG9sZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25JbnB1dERpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWFyY2hWYWwgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXHRcdFx0Y2xlYXJJbnB1dEFjdGlvbi5lbmFibGVkID0gISFzZWFyY2hWYWw7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0RGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMub25TZWFyY2hJbnB1dENoYW5nZWQodHJ1ZSkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGhlYWRlckNvbnRyb2xzQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnNldHRpbmdzLWhlYWRlci1jb250cm9scycpKTtcblx0XHRoZWFkZXJDb250cm9sc0NvbnRhaW5lci5zdHlsZS5ib3JkZXJDb2xvciA9IGFzQ3NzVmFyaWFibGUoc2V0dGluZ3NIZWFkZXJCb3JkZXIpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2lkZ2V0Q29udGFpbmVyID0gRE9NLmFwcGVuZChoZWFkZXJDb250cm9sc0NvbnRhaW5lciwgJCgnLnNldHRpbmdzLXRhcmdldC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVGFyZ2V0c1dpZGdldCwgdGFyZ2V0V2lkZ2V0Q29udGFpbmVyLCB7IGVuYWJsZVJlbW90ZVNldHRpbmdzOiB0cnVlIH0pKTtcblx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5vbkRpZFRhcmdldENoYW5nZSh0YXJnZXQgPT4gdGhpcy5vbkRpZFNldHRpbmdzVGFyZ2V0Q2hhbmdlKHRhcmdldCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpZGdldENvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1NldHRpbmdzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5lbmFibGVkICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuY2FuVG9nZ2xlRW5hYmxlbWVudCgpKSB7XG5cdFx0XHRjb25zdCBzeW5jQ29udHJvbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN5bmNDb250cm9scywgdGhpcy53aW5kb3csIGhlYWRlckNvbnRyb2xzQ29udGFpbmVyKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzeW5jQ29udHJvbHMub25EaWRDaGFuZ2VMYXN0U3luY2VkTGFiZWwobGFzdFN5bmNlZExhYmVsID0+IHtcblx0XHRcdFx0dGhpcy5sYXN0U3luY2VkTGFiZWwgPSBsYXN0U3luY2VkTGFiZWw7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRyb2xzRWxlbWVudCA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hDb250YWluZXIsIERPTS4kKCcuc2VhcmNoLWNvbnRhaW5lci13aWRnZXRzJykpO1xuXG5cdFx0dGhpcy5jb3VudEVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMuY29udHJvbHNFbGVtZW50LCBET00uJCgnLnNldHRpbmdzLWNvdW50LXdpZGdldC5tb25hY28tY291bnQtYmFkZ2UubG9uZycpKTtcblxuXHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuY29udHJvbHNFbGVtZW50LCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IGZpbHRlckFjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzU2VhcmNoRmlsdGVyRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucywgdGhpcy5hY3Rpb25SdW5uZXIsIHRoaXMuc2VhcmNoV2lkZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uICYmIGFjdGlvbi5pZCA9PT0gdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1RPR0dMRV9BSV9TRUFSQ0gpPy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgVG9nZ2xlQWN0aW9uVmlld0l0ZW0obnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGtleWJpbmRpbmc6IGtleWJpbmRpbmdMYWJlbCwgdG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc1RvUHVzaCA9IFtjbGVhcklucHV0QWN0aW9uLCBmaWx0ZXJBY3Rpb25dO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIucHVzaChhY3Rpb25zVG9QdXNoLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblxuXHRcdHRoaXMuZGlzYWJsZUFpU2VhcmNoVG9nZ2xlKCk7XG5cdFx0dGhpcy51cGRhdGVBaVNlYXJjaFRvZ2dsZVZpc2liaWxpdHkoKTtcblx0fVxuXG5cdHRvZ2dsZUFpU2VhcmNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyICYmIHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbiAmJiB0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyLmhhc0FjdGlvbih0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24pKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRcdGFyaWEuc3RhdHVzKGxvY2FsaXplKCdub0FpUmVzdWx0cycsIFwiTm8gQUkgcmVzdWx0cyBhdmFpbGFibGUgYXQgdGhpcyB0aW1lLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA9ICF0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkVG9nZ2xlQWlTZWFyY2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwgJiYgdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFJlc3VsdE1vZGVsLnNob3dBaVJlc3VsdHMgPSB0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA/PyBmYWxzZTtcblx0XHRcdHRoaXMucmVuZGVyUmVzdWx0Q291bnRNZXNzYWdlcyhmYWxzZSk7XG5cdFx0XHR0aGlzLm9uRGlkRmluaXNoU2VhcmNoKHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNldHRpbmdzVGFyZ2V0Q2hhbmdlKHRhcmdldDogU2V0dGluZ3NUYXJnZXQpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCA9IHRhcmdldDtcblxuXHRcdC8vIFRPRE8gSW5zdGVhZCBvZiByZWJ1aWxkaW5nIHRoZSB3aG9sZSBtb2RlbCwgcmVmcmVzaCBhbmQgdW5jYWNoZSB0aGUgaW5zcGVjdGVkIHNldHRpbmcgdmFsdWVcblx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcoZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaXNtaXNzZWRFeHRlbnNpb25TZXR0aW5ncy5pbmNsdWRlcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MucHVzaChleHRlbnNpb25JZCk7XG5cdFx0fVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHR0aGlzLkRJU01JU1NFRF9FWFRFTlNJT05fU0VUVElOR1NfU1RPUkFHRV9LRVksXG5cdFx0XHR0aGlzLmRpc21pc3NlZEV4dGVuc2lvblNldHRpbmdzLmpvaW4odGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX0RFTElNSVRFUiksXG5cdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUlxuXHRcdCk7XG5cdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZSh1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENsaWNrU2V0dGluZyhldnQ6IElTZXR0aW5nTGlua0NsaWNrRXZlbnQsIHJlY3Vyc2VkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldEVsZW1lbnQgPSB0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsPy5nZXRFbGVtZW50c0J5TmFtZShldnQudGFyZ2V0S2V5KT8uWzBdO1xuXHRcdGxldCByZXZlYWxGYWlsZWQgPSBmYWxzZTtcblx0XHRpZiAodGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0bGV0IHNvdXJjZVRvcCA9IDAuNTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IF9zb3VyY2VUb3AgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRSZWxhdGl2ZVRvcChldnQuc291cmNlKTtcblx0XHRcdFx0aWYgKF9zb3VyY2VUb3AgIT09IG51bGwpIHtcblx0XHRcdFx0XHRzb3VyY2VUb3AgPSBfc291cmNlVG9wO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gZS5nLiBjbGlja2VkIGEgc2VhcmNoZWQgZWxlbWVudCwgbm93IHRoZSBzZWFyY2ggaGFzIGJlZW4gY2xlYXJlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzZWFyY2ggZm9yIHNvbWV0aGluZyBhbmQgZm9jdXMgb24gYSBjYXRlZ29yeSwgdGhlIHNldHRpbmdzIHRyZWVcblx0XHRcdC8vIG9ubHkgcmVuZGVycyBzZXR0aW5ncyBpbiB0aGF0IGNhdGVnb3J5LlxuXHRcdFx0Ly8gSWYgdGhlIHRhcmdldCBkaXNwbGF5IGNhdGVnb3J5IGlzIGRpZmZlcmVudCB0aGFuIHRoZSBzb3VyY2UncywgdW5mb2N1cyB0aGUgY2F0ZWdvcnlcblx0XHRcdC8vIHNvIHRoYXQgd2UgY2FuIHJlbmRlciBhbGwgZm91bmQgc2V0dGluZ3MgYWdhaW4uXG5cdFx0XHQvLyBUaGVuLCB0aGUgcmV2ZWFsIGNhbGwgd2lsbCBjb3JyZWN0bHkgZmluZCB0aGUgdGFyZ2V0IHNldHRpbmcuXG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIgJiYgZXZ0LnNvdXJjZS5kaXNwbGF5Q2F0ZWdvcnkgIT09IHRhcmdldEVsZW1lbnQuZGlzcGxheUNhdGVnb3J5KSB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5yZXZlYWwodGFyZ2V0RWxlbWVudCwgc291cmNlVG9wKTtcblx0XHRcdH0gY2F0Y2ggKF8pIHtcblx0XHRcdFx0Ly8gVGhlIGxpc3R3aWRnZXQgY291bGRuJ3QgZmluZCB0aGUgc2V0dGluZyB0byByZXZlYWwsXG5cdFx0XHRcdC8vIGV2ZW4gdGhvdWdoIGl0J3MgaW4gdGhlIG1vZGVsLCBtZWFuaW5nIHRoZXJlIG1pZ2h0IGJlIGEgZmlsdGVyXG5cdFx0XHRcdC8vIHByZXZlbnRpbmcgaXQgZnJvbSBzaG93aW5nIHVwLlxuXHRcdFx0XHRyZXZlYWxGYWlsZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXJldmVhbEZhaWxlZCkge1xuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIHNoaWZ0IGZvY3VzIGZyb20gdGhlIHNldHRpbmcgdGhhdCBjb250YWlucyB0aGUgbGluayB0byB0aGUgc2V0dGluZyB0aGF0J3Ncblx0XHRcdFx0Ly8gbGlua2VkLiBDbGlja2luZyBvbiB0aGUgbGluayBzZXRzIGZvY3VzIG9uIHRoZSBzZXR0aW5nIHRoYXQgY29udGFpbnMgdGhlIGxpbmssXG5cdFx0XHRcdC8vIHdoaWNoIGlzIHdoeSB3ZSBuZWVkIHRoZSBzZXRUaW1lb3V0LlxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5zZXRGb2N1cyhbdGFyZ2V0RWxlbWVudF0pO1xuXHRcdFx0XHR9LCA1MCk7XG5cblx0XHRcdFx0Y29uc3QgZG9tRWxlbWVudHMgPSB0aGlzLnNldHRpbmdSZW5kZXJlcnMuZ2V0RE9NRWxlbWVudHNGb3JTZXR0aW5nS2V5KHRoaXMuc2V0dGluZ3NUcmVlLmdldEhUTUxFbGVtZW50KCksIGV2dC50YXJnZXRLZXkpO1xuXHRcdFx0XHRpZiAoZG9tRWxlbWVudHMgJiYgZG9tRWxlbWVudHNbMF0pIHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRjb25zdCBjb250cm9sID0gZG9tRWxlbWVudHNbMF0ucXVlcnlTZWxlY3RvcihBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX1NFTEVDVE9SKTtcblx0XHRcdFx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0XHRcdFx0KDxIVE1MRWxlbWVudD5jb250cm9sKS5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVjdXJzZWQgJiYgKCF0YXJnZXRFbGVtZW50IHx8IHJldmVhbEZhaWxlZCkpIHtcblx0XHRcdC8vIFNlYXJjaCBmb3IgdGhlIHRhcmdldCBzZXR0aW5nIGJ5IElEIHNvIGl0IGJlY29tZXMgdmlzaWJsZSxcblx0XHRcdC8vIGV2ZW4gaWYgaXQncyBhbiBhZHZhbmNlZCBzZXR0aW5nIHRoYXQgd291bGQgYmUgaGlkZGVuIHdpdGggYW4gZW1wdHkgcXVlcnkuXG5cdFx0XHRjb25zdCBpZFF1ZXJ5ID0gYEBpZDoke2V2dC50YXJnZXRLZXl9YDtcblx0XHRcdC8vIFNldCB0aGUgd2lkZ2V0IHZhbHVlIGZpcnN0LCB0aGVuIGNhbmNlbCB0aGUgZGVib3VuY2VkIHNlYXJjaCBpdCB0cmlnZ2Vycyxcblx0XHRcdC8vIHNvIHRoYXQgb25seSB0aGUgZGlyZWN0IHRyaWdnZXJTZWFyY2ggY2FsbCBiZWxvdyBydW5zLlxuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoaWRRdWVyeSk7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0RGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGNvbnN0IHAgPSB0aGlzLnRyaWdnZXJTZWFyY2goaWRRdWVyeSwgdHJ1ZSk7XG5cdFx0XHRwLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2xpY2tTZXR0aW5nKGV2dCwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRzd2l0Y2hUb1NldHRpbmdzRmlsZSgpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJzZVF1ZXJ5KHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkpLnF1ZXJ5O1xuXHRcdHJldHVybiB0aGlzLm9wZW5TZXR0aW5nc0ZpbGUoeyBxdWVyeSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlblNldHRpbmdzRmlsZShvcHRpb25zPzogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjdXJyZW50U2V0dGluZ3NUYXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldDtcblxuXHRcdGNvbnN0IG9wZW5PcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHsganNvbkVkaXRvcjogdHJ1ZSwgZ3JvdXBJZDogdGhpcy5ncm91cC5pZCwgLi4ub3B0aW9ucyB9O1xuXHRcdGlmIChjdXJyZW50U2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnJldmVhbFNldHRpbmcpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TY29wZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW29wdGlvbnM/LnJldmVhbFNldHRpbmcua2V5XT8uc2NvcGU7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uU2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKGNvbmZpZ3VyYXRpb25TY29wZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3Mob3Blbk9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyhvcGVuT3B0aW9ucyk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50U2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdHJldHVybiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuUmVtb3RlU2V0dGluZ3Mob3Blbk9wdGlvbnMpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudFNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyhvcGVuT3B0aW9ucyk7XG5cdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkoY3VycmVudFNldHRpbmdzVGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogY3VycmVudFNldHRpbmdzVGFyZ2V0LCAuLi5vcGVuT3B0aW9ucyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmJvZHlDb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLnNldHRpbmdzLWJvZHknKSk7XG5cblx0XHR0aGlzLm5vUmVzdWx0c01lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMuYm9keUNvbnRhaW5lciwgJCgnLm5vLXJlc3VsdHMtbWVzc2FnZScpKTtcblxuXHRcdHRoaXMubm9SZXN1bHRzTWVzc2FnZS5pbm5lclRleHQgPSBsb2NhbGl6ZSgnbm9SZXN1bHRzJywgXCJObyBTZXR0aW5ncyBGb3VuZFwiKTtcblxuXHRcdHRoaXMuY2xlYXJGaWx0ZXJMaW5rQ29udGFpbmVyID0gJCgnc3Bhbi5jbGVhci1zZWFyY2gtZmlsdGVycycpO1xuXG5cdFx0dGhpcy5jbGVhckZpbHRlckxpbmtDb250YWluZXIudGV4dENvbnRlbnQgPSAnIC0gJztcblx0XHRjb25zdCBjbGVhckZpbHRlckxpbmsgPSBET00uYXBwZW5kKHRoaXMuY2xlYXJGaWx0ZXJMaW5rQ29udGFpbmVyLCAkKCdhLnBvaW50ZXIucHJvbWluZW50JywgeyB0YWJpbmRleDogMCB9LCBsb2NhbGl6ZSgnY2xlYXJTZWFyY2hGaWx0ZXJzJywgJ0NsZWFyIEZpbHRlcnMnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2xlYXJGaWx0ZXJMaW5rLCBET00uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy5jbGVhclNlYXJjaEZpbHRlcnMoKTtcblx0XHR9KSk7XG5cblx0XHRET00uYXBwZW5kKHRoaXMubm9SZXN1bHRzTWVzc2FnZSwgdGhpcy5jbGVhckZpbHRlckxpbmtDb250YWluZXIpO1xuXG5cdFx0dGhpcy5ub1Jlc3VsdHNNZXNzYWdlLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZShlZGl0b3JGb3JlZ3JvdW5kKTtcblxuXHRcdHRoaXMudG9jVHJlZUNvbnRhaW5lciA9ICQoJy5zZXR0aW5ncy10b2MtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5zZXR0aW5nc1RyZWVDb250YWluZXIgPSAkKCcuc2V0dGluZ3MtdHJlZS1jb250YWluZXInKTtcblxuXHRcdHRoaXMuY3JlYXRlVE9DKHRoaXMudG9jVHJlZUNvbnRhaW5lcik7XG5cdFx0dGhpcy5jcmVhdGVTZXR0aW5nc1RyZWUodGhpcy5zZXR0aW5nc1RyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuYm9keUNvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRwcm9wb3J0aW9uYWxMYXlvdXQ6IHRydWVcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc3RhcnRpbmdXaWR0aCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKCdzZXR0aW5nc0VkaXRvcjIuc3BsaXRWaWV3V2lkdGgnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHRoaXMudG9jVHJlZUNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiBTZXR0aW5nc0VkaXRvcjIuVE9DX01JTl9XSURUSCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZUNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0dGhpcy50b2NUcmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHRcdH1cblx0XHR9LCBzdGFydGluZ1dpZHRoLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0aGlzLnNldHRpbmdzVHJlZUNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiBTZXR0aW5nc0VkaXRvcjIuRURJVE9SX01JTl9XSURUSCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zcGxpdFZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWxTaXplID0gdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMCkgKyB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgxKTtcblx0XHRcdHRoaXMuc3BsaXRWaWV3LnJlc2l6ZVZpZXcoMCwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHRvdGFsU2l6ZSAtIFNldHRpbmdzRWRpdG9yMi5UT0NfUkVTRVRfV0lEVEgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NldHRpbmdzRWRpdG9yMi5zcGxpdFZpZXdXaWR0aCcsIHdpZHRoLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLnRoZW1lLmdldENvbG9yKHNldHRpbmdzU2FzaEJvcmRlcikhO1xuXHRcdHRoaXMuc3BsaXRWaWV3LnN0eWxlKHsgc2VwYXJhdG9yQm9yZGVyOiBib3JkZXJDb2xvciB9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ3RybEFJbnRlcmNlcHRvcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmtleUNvZGUgPT09IEtleUNvZGUuS2V5QSAmJlxuXHRcdFx0XHQocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBlLm1ldGFLZXkgOiBlLmN0cmxLZXkpICYmXG5cdFx0XHRcdCFET00uaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQpXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gQXZvaWQgYnJvd3NlciBjdHJsK2Fcblx0XHRcdFx0ZS5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUT0MoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMudG9jVHJlZU1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUT0NUcmVlTW9kZWwsIHRoaXMudmlld1N0YXRlKTtcblxuXHRcdHRoaXMudG9jVHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVE9DVHJlZSxcblx0XHRcdERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZ3MtdG9jLXdyYXBwZXInLCB7XG5cdFx0XHRcdCdyb2xlJzogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdzZXR0aW5ncycsIFwiU2V0dGluZ3NcIiksXG5cdFx0XHR9KSksXG5cdFx0XHR0aGlzLnZpZXdTdGF0ZSkpO1xuXHRcdHRoaXMudG9jVHJlZURpc3Bvc2VkID0gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvY1RyZWUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuVGFibGVPZkNvbnRlbnRzO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9jVHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHwgbnVsbCA9IGUuZWxlbWVudHM/LlswXSA/PyBudWxsO1xuXHRcdFx0aWYgKHRoaXMudG9jRm9jdXNlZEVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRvY0ZvY3VzZWRFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdHRoaXMudG9jVHJlZS5zZXRTZWxlY3Rpb24oZWxlbWVudCA/IFtlbGVtZW50XSA6IFtdKTtcblxuXHRcdFx0Ly8gRmlsdGVyIHRvIHNob3cgb25seSB0aGUgc2VsZWN0ZWQgY2F0ZWdvcnlcblx0XHRcdGlmICh0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlciAhPT0gZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlciA9IGVsZW1lbnQgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBGb3JjZSByZW5kZXIgaW4gdGhpcyBjYXNlLCBiZWNhdXNlXG5cdFx0XHRcdC8vIG9uRGlkQ2xpY2tTZXR0aW5nIHJlbGllcyBvbiB0aGUgdXBkYXRlZCB2aWV3LlxuXHRcdFx0XHR0aGlzLnJlbmRlclRyZWUodW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvY1RyZWUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvY1Jvd0ZvY3VzZWQuc2V0KHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9jVHJlZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50b2NSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50b2NUcmVlLm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRvY1RyZWVEaXNwb3NlZCA9IHRydWU7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUZpbHRlcihmaWx0ZXI6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldCAmJiAhdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5pbmNsdWRlcyhmaWx0ZXIpKSB7XG5cdFx0XHQvLyBQcmVwZW5kIHRoZSBmaWx0ZXIgdG8gdGhlIHF1ZXJ5LlxuXHRcdFx0Y29uc3QgbmV3UXVlcnkgPSBgJHtmaWx0ZXJ9ICR7dGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltU3RhcnQoKX1gO1xuXHRcdFx0dGhpcy5mb2N1c1NlYXJjaChuZXdRdWVyeSwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTGFuZ3VhZ2VGaWx0ZXJzKCkge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldCAmJiB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLmluY2x1ZGVzKGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR31gKSkge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJyk7XG5cdFx0XHRjb25zdCBuZXdRdWVyeSA9IHF1ZXJ5LmZpbHRlcih3b3JkID0+ICF3b3JkLnN0YXJ0c1dpdGgoYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfWApKS5qb2luKCcgJyk7XG5cdFx0XHR0aGlzLmZvY3VzU2VhcmNoKG5ld1F1ZXJ5LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXR0aW5nc1RyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0dGluZ1JlbmRlcmVycyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ1RyZWVSZW5kZXJlcnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdSZW5kZXJlcnMub25EaWRDaGFuZ2VTZXR0aW5nKGUgPT4gdGhpcy5vbkRpZENoYW5nZVNldHRpbmcoZS5rZXksIGUudmFsdWUsIGUudHlwZSwgZS5tYW51YWxSZXNldCwgZS5zY29wZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdSZW5kZXJlcnMub25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZygoZSkgPT4gdGhpcy5vbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nUmVuZGVyZXJzLm9uRGlkT3BlblNldHRpbmdzKHNldHRpbmdLZXkgPT4ge1xuXHRcdFx0dGhpcy5vcGVuU2V0dGluZ3NGaWxlKHsgcmV2ZWFsU2V0dGluZzogeyBrZXk6IHNldHRpbmdLZXksIGVkaXQ6IHRydWUgfSB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nUmVuZGVyZXJzLm9uRGlkQ2xpY2tTZXR0aW5nTGluayhzZXR0aW5nTmFtZSA9PiB0aGlzLm9uRGlkQ2xpY2tTZXR0aW5nKHNldHRpbmdOYW1lKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZEZvY3VzU2V0dGluZyhlbGVtZW50ID0+IHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnNldEZvY3VzKFtlbGVtZW50XSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2V0dGluZ0NvbnRyb2w7XG5cdFx0XHR0aGlzLnNldHRpbmdSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQoKHBhcmFtczogSGVpZ2h0Q2hhbmdlUGFyYW1zKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQsIGhlaWdodCB9ID0gcGFyYW1zO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUudXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50LCBoZWlnaHQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyB0aGUgZWxlbWVudCB3YXMgbm90IGZvdW5kXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkFwcGx5RmlsdGVyKChmaWx0ZXIpID0+IHRoaXMuYXBwbHlGaWx0ZXIoZmlsdGVyKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50KChlbGVtZW50OiBJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5yZW1vdmVMYW5ndWFnZUZpbHRlcnMoKTtcblx0XHRcdGlmIChlbGVtZW50Lmxhbmd1YWdlKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHlGaWx0ZXIoYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfSR7ZWxlbWVudC5sYW5ndWFnZX1gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXRzV2lkZ2V0LnVwZGF0ZVRhcmdldChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuc2NvcGUgPT09ICd1c2VyJykge1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC51cGRhdGVUYXJnZXQoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5zY29wZSA9PT0gJ3JlbW90ZScpIHtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQudXBkYXRlVGFyZ2V0KENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hcHBseUZpbHRlcihgQCR7SURfU0VUVElOR19UQUd9JHtlbGVtZW50LnNldHRpbmdLZXl9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZXR0aW5nc1RyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVHJlZSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHRoaXMudmlld1N0YXRlLFxuXHRcdFx0dGhpcy5zZXR0aW5nUmVuZGVyZXJzLmFsbFJlbmRlcmVycykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nc1RyZWUub25EaWRTY3JvbGwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3NUcmVlLnNjcm9sbFRvcCA9PT0gdGhpcy5zZXR0aW5nc1RyZWVTY3JvbGxUb3ApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldHRpbmdzVHJlZVNjcm9sbFRvcCA9IHRoaXMuc2V0dGluZ3NUcmVlLnNjcm9sbFRvcDtcblxuXHRcdFx0Ly8gc2V0VGltZW91dCBiZWNhdXNlIGNhbGxpbmcgc2V0Q2hpbGRyZW4gb24gdGhlIHNldHRpbmdzVHJlZSBjYW4gdHJpZ2dlciBvbkRpZFNjcm9sbCwgc28gaXQgZmlyZXMgd2hlblxuXHRcdFx0Ly8gc2V0Q2hpbGRyZW4gaGFzIGNhbGxlZCBvbiB0aGUgc2V0dGluZ3MgdHJlZSBidXQgbm90IHRoZSB0b2MgdHJlZSB5ZXQsIHNvIHRoZWlyIHJlbmRlcmVkIGVsZW1lbnRzIGFyZSBvdXQgb2Ygc3luY1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVHJlZVNjcm9sbFN5bmMoKTtcblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ3NUcmVlLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NMaXN0ID0gY29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudD8uY2xhc3NMaXN0O1xuXHRcdFx0aWYgKGNsYXNzTGlzdCAmJiBjbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1saXN0JykgJiYgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZXR0aW5ncy1lZGl0b3ItdHJlZScpKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZXR0aW5nVHJlZTtcblx0XHRcdFx0dGhpcy5zZXR0aW5nUm93Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID8/PSB0aGlzLnNldHRpbmdzVHJlZS5maXJzdFZpc2libGVFbGVtZW50ID8/IG51bGw7XG5cdFx0XHRcdGlmICh0aGlzLnRyZWVGb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZVNldHRpbmdGaXJzdFJvd0ZvY3VzZWRDb250ZXh0KHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdzVHJlZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXR0aW5nUm93Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXR0aW5nRmlyc3RSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0XHQvLyBDbGVhciBvdXQgdGhlIGZvY3VzZWQgZWxlbWVudCwgb3RoZXJ3aXNlIGl0IGNvdWxkIGJlXG5cdFx0XHQvLyBvdXQgb2YgZGF0ZSBkdXJpbmcgdGhlIG5leHQgb25EaWRGb2N1cyBldmVudC5cblx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID0gbnVsbDtcblx0XHR9KSk7XG5cblx0XHQvLyBUaGVyZSBpcyBubyBkaWZmZXJlbnQgc2VsZWN0IHN0YXRlIGluIHRoZSBzZXR0aW5ncyB0cmVlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nc1RyZWUub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnRzWzBdO1xuXHRcdFx0dGhpcy51cGRhdGVTZXR0aW5nRmlyc3RSb3dGb2N1c2VkQ29udGV4dChlbGVtZW50ID8/IG51bGwpO1xuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID0gZWxlbWVudDtcblxuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2V0U2VsZWN0aW9uKGVsZW1lbnQgPyBbZWxlbWVudF0gOiBbXSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVNldHRpbmcoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0eXBlOiBTZXR0aW5nVmFsdWVUeXBlIHwgU2V0dGluZ1ZhbHVlVHlwZVtdLCBtYW51YWxSZXNldDogYm9vbGVhbiwgc2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcnNlZFF1ZXJ5ID0gcGFyc2VRdWVyeSh0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHRjb25zdCBsYW5ndWFnZUZpbHRlciA9IHBhcnNlZFF1ZXJ5Lmxhbmd1YWdlRmlsdGVyO1xuXHRcdGlmIChtYW51YWxSZXNldCB8fCAodGhpcy5wZW5kaW5nU2V0dGluZ1VwZGF0ZSAmJiB0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlLmtleSAhPT0ga2V5KSkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKTtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlID0geyBrZXksIHZhbHVlLCBsYW5ndWFnZUZpbHRlciB9O1xuXHRcdGlmIChTZXR0aW5nc0VkaXRvcjIuc2hvdWxkU2V0dGluZ1VwZGF0ZUZhc3QodHlwZSkpIHtcblx0XHRcdHRoaXMuc2V0dGluZ0Zhc3RVcGRhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0dGluZ1Nsb3dVcGRhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUcmVlU2Nyb2xsU3luYygpOiB2b2lkIHtcblx0XHR0aGlzLnNldHRpbmdSZW5kZXJlcnMuY2FuY2VsU3VnZ2VzdGVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIG1hbnVhbFJlc2V0OiBib29sZWFuLCBsYW5ndWFnZUZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBzY29wZTogQ29uZmlndXJhdGlvblNjb3BlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ29uZmlndXJhdGlvblNlcnZpY2UgZGlzcGxheXMgdGhlIGVycm9yIGlmIHRoaXMgZmFpbHMuXG5cdFx0Ly8gRm9yY2UgYSByZW5kZXIgYWZ0ZXJ3YXJkcyBiZWNhdXNlIG9uRGlkQ29uZmlndXJhdGlvblVwZGF0ZSBkb2Vzbid0IGZpcmUgaWYgdGhlIHVwZGF0ZSBkb2Vzbid0IHJlc3VsdCBpbiBhbiBlZmZlY3RpdmUgc2V0dGluZyB2YWx1ZSBjaGFuZ2UuXG5cdFx0Y29uc3Qgc2V0dGluZ3NUYXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldDtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5pc1VyaShzZXR0aW5nc1RhcmdldCkgPyBzZXR0aW5nc1RhcmdldCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uVGFyZ2V0ID0gPENvbmZpZ3VyYXRpb25UYXJnZXQgfCBudWxsPihyZXNvdXJjZSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiA6IHNldHRpbmdzVGFyZ2V0KSA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyA9IHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcnM6IGxhbmd1YWdlRmlsdGVyID8gW2xhbmd1YWdlRmlsdGVyXSA6IHVuZGVmaW5lZCB9O1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRhcmdldElzV29ya3NwYWNlID0gY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgfHwgY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXG5cdFx0Y29uc3QgdXNlclBhc3NlZEluTWFudWFsUmVzZXQgPSBjb25maWd1cmF0aW9uVGFyZ2V0SXNXb3Jrc3BhY2UgfHwgISFsYW5ndWFnZUZpbHRlcjtcblx0XHRjb25zdCBpc01hbnVhbFJlc2V0ID0gdXNlclBhc3NlZEluTWFudWFsUmVzZXQgPyBtYW51YWxSZXNldCA6IHZhbHVlID09PSB1bmRlZmluZWQ7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBpcyBjaGFuZ2luZyB0aGUgdmFsdWUgYmFjayB0byB0aGUgZGVmYXVsdCwgYW5kIHdlJ3JlIG5vdCB0YXJnZXRpbmcgYSB3b3Jrc3BhY2Ugc2NvcGUsIGRvIGEgJ3Jlc2V0JyBpbnN0ZWFkXG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSwgb3ZlcnJpZGVzKTtcblx0XHRpZiAoIXVzZXJQYXNzZWRJbk1hbnVhbFJlc2V0ICYmIGluc3BlY3RlZC5kZWZhdWx0VmFsdWUgPT09IHZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCBvdmVycmlkZXMsIGNvbmZpZ3VyYXRpb25UYXJnZXQsIHsgaGFuZGxlRGlydHlGaWxlOiAnc2F2ZScgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRpZiAocXVlcnkuaW5jbHVkZXMoYEAke01PRElGSUVEX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHVzZXIgbWlnaHQgaGF2ZSByZXNldCBhIHNldHRpbmcuXG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucmVuZGVyVHJlZShrZXksIGlzTWFudWFsUmVzZXQpO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlID0gbnVsbDtcblxuXHRcdFx0XHRjb25zdCByZXBvcnRNb2RpZmllZFByb3BzID0ge1xuXHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRxdWVyeSxcblx0XHRcdFx0XHRzZWFyY2hSZXN1bHRzOiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsPy5nZXRVbmlxdWVTZWFyY2hSZXN1bHRzKCkgPz8gbnVsbCxcblx0XHRcdFx0XHRyYXdSZXN1bHRzOiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsPy5nZXRSYXdSZXN1bHRzKCkgPz8gbnVsbCxcblx0XHRcdFx0XHRzaG93Q29uZmlndXJlZE9ubHk6ICEhdGhpcy52aWV3U3RhdGUudGFnRmlsdGVycyAmJiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzLmhhcyhNT0RJRklFRF9TRVRUSU5HX1RBRyksXG5cdFx0XHRcdFx0aXNSZXNldDogdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyxcblx0XHRcdFx0XHRzZXR0aW5nc1RhcmdldDogdGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQuc2V0dGluZ3NUYXJnZXQgYXMgU2V0dGluZ3NUYXJnZXRcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVwb3J0TW9kaWZpZWRTZXR0aW5nKHJlcG9ydE1vZGlmaWVkUHJvcHMpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydE1vZGlmaWVkU2V0dGluZyhwcm9wczogeyBrZXk6IHN0cmluZzsgcXVlcnk6IHN0cmluZzsgc2VhcmNoUmVzdWx0czogSVNlYXJjaFJlc3VsdCB8IG51bGw7IHJhd1Jlc3VsdHM6IElTZWFyY2hSZXN1bHRbXSB8IG51bGw7IHNob3dDb25maWd1cmVkT25seTogYm9vbGVhbjsgaXNSZXNldDogYm9vbGVhbjsgc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0IH0pOiB2b2lkIHtcblx0XHR0eXBlIFNldHRpbmdzRWRpdG9yTW9kaWZpZWRTZXR0aW5nRXZlbnQgPSB7XG5cdFx0XHRrZXk6IHN0cmluZztcblx0XHRcdGdyb3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHByb3ZpZGVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bmxwSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGRpc3BsYXlJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0c2hvd0NvbmZpZ3VyZWRPbmx5OiBib29sZWFuO1xuXHRcdFx0aXNSZXNldDogYm9vbGVhbjtcblx0XHRcdHRhcmdldDogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0a2V5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNldHRpbmcgdGhhdCBpcyBiZWluZyBtb2RpZmllZC4nIH07XG5cdFx0XHRncm91cElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgc2V0dGluZyBpcyBmcm9tIHRoZSBsb2NhbCBzZWFyY2ggb3IgcmVtb3RlIHNlYXJjaCBwcm92aWRlciwgaWYgYXBwbGljYWJsZS4nIH07XG5cdFx0XHRwcm92aWRlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgc2VhcmNoIHByb3ZpZGVyLCBpZiBhcHBsaWNhYmxlLicgfTtcblx0XHRcdG5scEluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGluZGV4IG9mIHRoZSBzZXR0aW5nIGluIHRoZSByZW1vdGUgc2VhcmNoIHByb3ZpZGVyIHJlc3VsdHMsIGlmIGFwcGxpY2FibGUuJyB9O1xuXHRcdFx0ZGlzcGxheUluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGluZGV4IG9mIHRoZSBzZXR0aW5nIGluIHRoZSBjb21iaW5lZCBzZWFyY2ggcmVzdWx0cywgaWYgYXBwbGljYWJsZS4nIH07XG5cdFx0XHRzaG93Q29uZmlndXJlZE9ubHk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGlzIGluIHRoZSBtb2RpZmllZCB2aWV3LCB3aGljaCBzaG93cyBjb25maWd1cmVkIHNldHRpbmdzIG9ubHkuJyB9O1xuXHRcdFx0aXNSZXNldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkZW50aWZpZXMgd2hldGhlciBhIHNldHRpbmcgd2FzIHJlc2V0IHRvIGl0cyBkZWZhdWx0IHZhbHVlLicgfTtcblx0XHRcdHRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzY29wZSBvZiB0aGUgc2V0dGluZywgc3VjaCBhcyB1c2VyIG9yIHdvcmtzcGFjZS4nIH07XG5cdFx0XHRvd25lcjogJ3J6aGFvMjcxJztcblx0XHRcdGNvbW1lbnQ6ICdFdmVudCBlbWl0dGVkIHdoZW4gdGhlIHVzZXIgbW9kaWZpZXMgYSBzZXR0aW5nIGluIHRoZSBTZXR0aW5ncyBlZGl0b3InO1xuXHRcdH07XG5cblx0XHRsZXQgZ3JvdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBwcm92aWRlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbmxwSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzcGxheUluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3BzLnNlYXJjaFJlc3VsdHMpIHtcblx0XHRcdGRpc3BsYXlJbmRleCA9IHByb3BzLnNlYXJjaFJlc3VsdHMuZmlsdGVyTWF0Y2hlcy5maW5kSW5kZXgobSA9PiBtLnNldHRpbmcua2V5ID09PSBwcm9wcy5rZXkpO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHRwcm92aWRlck5hbWUgPSBwcm9wcy5zZWFyY2hSZXN1bHRzLmZpbHRlck1hdGNoZXMuZmluZChtID0+IG0uc2V0dGluZy5rZXkgPT09IHByb3BzLmtleSk/LnByb3ZpZGVyTmFtZTtcblx0XHRcdFx0Y29uc3QgcmF3UmVzdWx0cyA9IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuZ2V0UmF3UmVzdWx0cygpO1xuXHRcdFx0XHRpZiAocmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguTG9jYWxdICYmIGRpc3BsYXlJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ0luTG9jYWxSZXN1bHRzID0gcmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguTG9jYWxdLmZpbHRlck1hdGNoZXMuc29tZShtID0+IG0uc2V0dGluZy5rZXkgPT09IHByb3BzLmtleSk7XG5cdFx0XHRcdFx0Z3JvdXBJZCA9IHNldHRpbmdJbkxvY2FsUmVzdWx0cyA/ICdsb2NhbCcgOiAncmVtb3RlJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguUmVtb3RlXSkge1xuXHRcdFx0XHRcdGNvbnN0IF9ubHBJbmRleCA9IHJhd1Jlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LlJlbW90ZV0uZmlsdGVyTWF0Y2hlcy5maW5kSW5kZXgobSA9PiBtLnNldHRpbmcua2V5ID09PSBwcm9wcy5rZXkpO1xuXHRcdFx0XHRcdG5scEluZGV4ID0gX25scEluZGV4ID49IDAgPyBfbmxwSW5kZXggOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXBvcnRlZFRhcmdldCA9IHByb3BzLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgPyAndXNlcicgOlxuXHRcdFx0cHJvcHMuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgPyAndXNlcl9yZW1vdGUnIDpcblx0XHRcdFx0cHJvcHMuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gJ3dvcmtzcGFjZScgOlxuXHRcdFx0XHRcdCdmb2xkZXInO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdGtleTogcHJvcHMua2V5LFxuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdHByb3ZpZGVyTmFtZSxcblx0XHRcdG5scEluZGV4LFxuXHRcdFx0ZGlzcGxheUluZGV4LFxuXHRcdFx0c2hvd0NvbmZpZ3VyZWRPbmx5OiBwcm9wcy5zaG93Q29uZmlndXJlZE9ubHksXG5cdFx0XHRpc1Jlc2V0OiBwcm9wcy5pc1Jlc2V0LFxuXHRcdFx0dGFyZ2V0OiByZXBvcnRlZFRhcmdldFxuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0V2ZW50LCBTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0NsYXNzaWZpY2F0aW9uPignc2V0dGluZ3NFZGl0b3Iuc2V0dGluZ01vZGlmaWVkJywgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUmVmcmVzaChlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5ID0gJycpOiB2b2lkIHtcblx0XHRpZiAoa2V5ICYmIHRoaXMuc2NoZWR1bGVkUmVmcmVzaGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMudmFsdWVzKCkpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzY2hlZHVsZWRSZWZyZXNoVHJhY2tlciA9IERPTS50cmFja0ZvY3VzKGVsZW1lbnQpO1xuXHRcdHN0b3JlLmFkZChzY2hlZHVsZWRSZWZyZXNoVHJhY2tlcik7XG5cdFx0c3RvcmUuYWRkKHNjaGVkdWxlZFJlZnJlc2hUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLnNjaGVkdWxlZFJlZnJlc2hlcy5nZXQoa2V5KT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKG5ldyBTZXQoW2tleV0pKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuc2V0KGtleSwgc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXR0aW5nc09yZGVyQnlUb2NJbmRleChyZXNvbHZlZFNldHRpbmdzUm9vdDogSVRPQ0VudHJ5PElTZXR0aW5nPik6IE1hcDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGNvbnN0IGluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRmdW5jdGlvbiBpbmRleFNldHRpbmdzKHJlc29sdmVkU2V0dGluZ3NSb290OiBJVE9DRW50cnk8SVNldHRpbmc+LCBjb3VudGVyID0gMCk6IG51bWJlciB7XG5cdFx0XHRpZiAocmVzb2x2ZWRTZXR0aW5nc1Jvb3Quc2V0dGluZ3MpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHJlc29sdmVkU2V0dGluZ3NSb290LnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0aWYgKCFpbmRleC5oYXMoc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdFx0XHRpbmRleC5zZXQoc2V0dGluZy5rZXksIGNvdW50ZXIrKyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXNvbHZlZFNldHRpbmdzUm9vdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvdW50ZXIgPSBpbmRleFNldHRpbmdzKGNoaWxkLCBjb3VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvdW50ZXI7XG5cdFx0fVxuXHRcdGluZGV4U2V0dGluZ3MocmVzb2x2ZWRTZXR0aW5nc1Jvb3QpO1xuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaE1vZGVscyhyZXNvbHZlZFNldHRpbmdzUm9vdDogSVRPQ0VudHJ5PElTZXR0aW5nPikge1xuXHRcdC8vIEJvdGggY2FsbHMgdG8gcmVmcmVzaE1vZGVscyByZXF1aXJlIGEgdmFsaWQgc2V0dGluZ3NUcmVlTW9kZWwuXG5cdFx0dGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSEudXBkYXRlKHJlc29sdmVkU2V0dGluZ3NSb290KTtcblx0XHR0aGlzLnRvY1RyZWVNb2RlbC5zZXR0aW5nc1RyZWVSb290ID0gdGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSEucm9vdDtcblx0XHR0aGlzLnNldHRpbmdzT3JkZXJCeVRvY0luZGV4ID0gdGhpcy5jcmVhdGVTZXR0aW5nc09yZGVyQnlUb2NJbmRleChyZXNvbHZlZFNldHRpbmdzUm9vdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uQ29uZmlnVXBkYXRlKGtleXM/OiBSZWFkb25seVNldDxzdHJpbmc+LCBmb3JjZVJlZnJlc2ggPSBmYWxzZSwgdHJpZ2dlclNlYXJjaCA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGtleXMgJiYgdGhpcy5zZXR0aW5nc1RyZWVNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlRWxlbWVudHNCeUtleShrZXlzKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cHMgPSB0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldHRpbmdzR3JvdXBzLnNsaWNlKDEpOyAvLyBXaXRob3V0IGNvbW1vbmx5VXNlZFxuXHRcdGNvbnN0IGNvcmVTZXR0aW5nc0dyb3VwcyA9IFtdLCBleHRlbnNpb25TZXR0aW5nc0dyb3VwcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuZXh0ZW5zaW9uSW5mbykge1xuXHRcdFx0XHRleHRlbnNpb25TZXR0aW5nc0dyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvcmVTZXR0aW5nc0dyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZmlsdGVyID0gdGhpcy5jYW5TaG93QWR2YW5jZWRTZXR0aW5ncygpID8gdW5kZWZpbmVkIDogeyBleGNsdWRlOiB7IHRhZ3M6IFtBRFZBTkNFRF9TRVRUSU5HX1RBR10gfSB9O1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXN1bHQgPSByZXNvbHZlU2V0dGluZ3NUcmVlKHRvY0RhdGEsIGNvcmVTZXR0aW5nc0dyb3VwcywgZmlsdGVyLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkU2V0dGluZ3NSb290ID0gc2V0dGluZ3NSZXN1bHQudHJlZTtcblxuXHRcdC8vIFdhcm4gZm9yIHNldHRpbmdzIG5vdCBpbmNsdWRlZCBpbiBsYXlvdXRcblx0XHRpZiAoc2V0dGluZ3NSZXN1bHQubGVmdG92ZXJTZXR0aW5ncy5zaXplICYmICF0aGlzLmhhc1dhcm5lZE1pc3NpbmdTZXR0aW5ncykge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0tleUxpc3Q6IHN0cmluZ1tdID0gW107XG5cdFx0XHRzZXR0aW5nc1Jlc3VsdC5sZWZ0b3ZlclNldHRpbmdzLmZvckVhY2gocyA9PiB7XG5cdFx0XHRcdHNldHRpbmdLZXlMaXN0LnB1c2gocy5rZXkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBTZXR0aW5nc0VkaXRvcjI6IFNldHRpbmdzIG5vdCBpbmNsdWRlZCBpbiBzZXR0aW5nc0xheW91dC50czogJHtzZXR0aW5nS2V5TGlzdC5qb2luKCcsICcpfWApO1xuXHRcdFx0dGhpcy5oYXNXYXJuZWRNaXNzaW5nU2V0dGluZ3MgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGl0aW9uYWxHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0XHRsZXQgc2V0QWRkaXRpb25hbEdyb3VwcyA9IGZhbHNlO1xuXHRcdGNvbnN0IHRvZ2dsZURhdGEgPSBhd2FpdCBnZXRFeHBlcmltZW50YWxFeHRlbnNpb25Ub2dnbGVEYXRhKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSwgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0aWYgKHRvZ2dsZURhdGEgJiYgZ3JvdXBzLmZpbHRlcihnID0+IGcuZXh0ZW5zaW9uSW5mbykubGVuZ3RoICYmIE9iamVjdC5rZXlzKHRvZ2dsZURhdGEuc2V0dGluZ3NFZGl0b3JSZWNvbW1lbmRlZEV4dGVuc2lvbnMpLmxlbmd0aCkge1xuXHRcdFx0Ly8gUmVmcmVzaCBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBvbmNlIHBlciBvbkNvbmZpZ1VwZGF0ZSBpbnZvY2F0aW9uIGZvciBwZXJmb3JtYW5jZSxcblx0XHRcdC8vIGluc3RlYWQgb2YgcGVyIGV4dGVuc2lvbi4gVGhlIGluc3RhbGxlZCBsaXN0IG1heSBzdGlsbCBjaGFuZ2Ugd2hpbGUgaXRlcmF0aW5nLlxuXHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoSW5zdGFsbGVkRXh0ZW5zaW9uc0xpc3QoKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHRvZ2dsZURhdGEuc2V0dGluZ3NFZGl0b3JSZWNvbW1lbmRlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiA9IHRvZ2dsZURhdGEucmVjb21tZW5kZWRFeHRlbnNpb25zR2FsbGVyeUluZm9ba2V5XTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluc3RhbGxlZCA9IHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uSWRzLmluY2x1ZGVzKGV4dGVuc2lvbklkKTtcblxuXHRcdFx0XHQvLyBEcmlsbCBkb3duIHRvIHNlZSB3aGV0aGVyIHRoZSBncm91cCBhbmQgc2V0dGluZyBhbHJlYWR5IGV4aXN0XG5cdFx0XHRcdC8vIGFuZCBuZWVkIHRvIGJlIHJlbW92ZWQuXG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nR3JvdXBJbmRleCA9IGdyb3Vwcy5maW5kSW5kZXgoZyA9PlxuXHRcdFx0XHRcdGcuZXh0ZW5zaW9uSW5mbyAmJiBnLmV4dGVuc2lvbkluZm8hLmlkLnRvTG93ZXJDYXNlKCkgPT09IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkgJiZcblx0XHRcdFx0XHRnLnNlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBnLnNlY3Rpb25zWzBdLnNldHRpbmdzLmxlbmd0aCA9PT0gMSAmJiBnLnNlY3Rpb25zWzBdLnNldHRpbmdzWzBdLmRpc3BsYXlFeHRlbnNpb25JZFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5zdGFsbGVkIHx8IHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MuaW5jbHVkZXMoZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdFx0aWYgKG1hdGNoaW5nR3JvdXBJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGdyb3Vwcy5zcGxpY2UobWF0Y2hpbmdHcm91cEluZGV4LCAxKTtcblx0XHRcdFx0XHRcdHNldEFkZGl0aW9uYWxHcm91cHMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaGluZ0dyb3VwSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDcmVhdGUgdGhlIGVudHJ5LiBleHRlbnNpb25JbnN0YWxsZWQgaXMgZmFsc2UgaW4gdGhpcyBjYXNlLlxuXHRcdFx0XHRsZXQgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRFWFRFTlNJT05fRkVUQ0hfVElNRU9VVF9NU1xuXHRcdFx0XHRcdCkgPz8gbnVsbDtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIExpa2VseSBhIG5ldHdvcmtpbmcgaXNzdWUuXG5cdFx0XHRcdFx0Ly8gU2tpcCBhZGRpbmcgYSBidXR0b24gZm9yIHRoaXMgZXh0ZW5zaW9uIHRvIHRoZSBTZXR0aW5ncyBlZGl0b3IuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWFuaWZlc3QgPT09IG51bGwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzQ29uZmlndXJhdGlvbiA9IG1hbmlmZXN0Py5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbjtcblxuXHRcdFx0XHRsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY29udHJpYnV0ZXNDb25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHRcdGdyb3VwVGl0bGUgPSBjb250cmlidXRlc0NvbmZpZ3VyYXRpb24/LnRpdGxlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvbnRyaWJ1dGVzQ29uZmlndXJhdGlvbi5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRncm91cFRpdGxlID0gY29udHJpYnV0ZXNDb25maWd1cmF0aW9uWzBdLnRpdGxlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25JbmZvID0gdG9nZ2xlRGF0YS5zZXR0aW5nc0VkaXRvclJlY29tbWVuZGVkRXh0ZW5zaW9uc1trZXldO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25OYW1lID0gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lID8/IGV4dGVuc2lvbklkO1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nS2V5ID0gYCR7a2V5fS5tYW5hZ2VFeHRlbnNpb25gO1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nOiBJU2V0dGluZyA9IHtcblx0XHRcdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdGtleTogc2V0dGluZ0tleSxcblx0XHRcdFx0XHRrZXlSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdHZhbHVlOiBudWxsLFxuXHRcdFx0XHRcdHZhbHVlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogW3JlY29tbWVuZGF0aW9uSW5mby5vblNldHRpbmdzRWRpdG9yT3Blbj8uZGVzY3JpcHRpb25PdmVycmlkZSA/PyBleHRlbnNpb24uZGVzY3JpcHRpb25dLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogZmFsc2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdLFxuXHRcdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdFx0XHRcdHR5cGU6ICdudWxsJyxcblx0XHRcdFx0XHRkaXNwbGF5RXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkdyb3VwVGl0bGU6IGdyb3VwVGl0bGUgPz8gZXh0ZW5zaW9uTmFtZSxcblx0XHRcdFx0XHRjYXRlZ29yeUxhYmVsOiAnRXh0ZW5zaW9ucycsXG5cdFx0XHRcdFx0dGl0bGU6IGV4dGVuc2lvbk5hbWVcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEdyb3VwOiBJU2V0dGluZ3NHcm91cCA9IHtcblx0XHRcdFx0XHRzZWN0aW9uczogW3tcblx0XHRcdFx0XHRcdHNldHRpbmdzOiBbc2V0dGluZ10sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdHRpdGxlOiBzZXR0aW5nLmV4dGVuc2lvbkdyb3VwVGl0bGUhLFxuXHRcdFx0XHRcdHRpdGxlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkluZm86IHtcblx0XHRcdFx0XHRcdGlkOiBleHRlbnNpb25JZCxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRncm91cHMucHVzaChhZGRpdGlvbmFsR3JvdXApO1xuXHRcdFx0XHRhZGRpdGlvbmFsR3JvdXBzLnB1c2goYWRkaXRpb25hbEdyb3VwKTtcblx0XHRcdFx0c2V0QWRkaXRpb25hbEdyb3VwcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnB1c2goYXdhaXQgY3JlYXRlVG9jVHJlZUZvckV4dGVuc2lvblNldHRpbmdzKHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgZXh0ZW5zaW9uU2V0dGluZ3NHcm91cHMsIGZpbHRlcikpO1xuXG5cdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnVuc2hpZnQoZ2V0Q29tbW9ubHlVc2VkRGF0YShncm91cHMpKTtcblxuXHRcdGlmICh0b2dnbGVEYXRhICYmIHNldEFkZGl0aW9uYWxHcm91cHMpIHtcblx0XHRcdC8vIEFkZCB0aGUgYWRkaXRpb25hbCBncm91cHMgdG8gdGhlIG1vZGVsIHRvIGhlbHAgd2l0aCBzZWFyY2hpbmcuXG5cdFx0XHR0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldEFkZGl0aW9uYWxHcm91cHMoYWRkaXRpb25hbEdyb3Vwcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgJiYgKHRoaXMudmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJIHx8IHRoaXMudmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRVbnRydXN0ZWRXb3Jrc3BhY2VTZXR0aW5ncyA9IHJlc29sdmVDb25maWd1cmVkVW50cnVzdGVkU2V0dGluZ3MoZ3JvdXBzLCB0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCwgdGhpcy52aWV3U3RhdGUubGFuZ3VhZ2VGaWx0ZXIsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0aWYgKGNvbmZpZ3VyZWRVbnRydXN0ZWRXb3Jrc3BhY2VTZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnVuc2hpZnQoe1xuXHRcdFx0XHRcdGlkOiAnd29ya3NwYWNlVHJ1c3QnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2V0dGluZ3MgcmVxdWlyZSB0cnVzdCcsIFwiV29ya3NwYWNlIFRydXN0XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBjb25maWd1cmVkVW50cnVzdGVkV29ya3NwYWNlU2V0dGluZ3Ncblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbD8udXBkYXRlQ2hpbGRyZW4oKTtcblxuXHRcdGNvbnN0IGZpcnN0VmlzaWJsZUVsZW1lbnQgPSB0aGlzLnNldHRpbmdzVHJlZS5maXJzdFZpc2libGVFbGVtZW50O1xuXHRcdGxldCBhbmNob3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGZpcnN0VmlzaWJsZUVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0YW5jaG9ySWQgPSBmaXJzdFZpc2libGVFbGVtZW50LnNldHRpbmcua2V5O1xuXHRcdH0gZWxzZSBpZiAoZmlyc3RWaXNpYmxlRWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0YW5jaG9ySWQgPSBmaXJzdFZpc2libGVFbGVtZW50LmlkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hNb2RlbHMocmVzb2x2ZWRTZXR0aW5nc1Jvb3QpO1xuXG5cdFx0XHRpZiAodHJpZ2dlclNlYXJjaCAmJiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsKSB7XG5cdFx0XHRcdC8vIElmIGFuIGV4dGVuc2lvbidzIHNldHRpbmdzIHdlcmUganVzdCBsb2FkZWQgYW5kIGEgc2VhcmNoIGlzIGFjdGl2ZSwgcmV0cmlnZ2VyIHRoZSBzZWFyY2ggc28gaXQgc2hvd3MgdXBcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMub25TZWFyY2hJbnB1dENoYW5nZWQoZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlZnJlc2hUT0NUcmVlKCk7XG5cdFx0XHR0aGlzLnJlbmRlclRyZWUodW5kZWZpbmVkLCBmb3JjZVJlZnJlc2gpO1xuXG5cdFx0XHRpZiAoYW5jaG9ySWQpIHtcblx0XHRcdFx0Y29uc3QgbmV3TW9kZWwgPSB0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlO1xuXHRcdFx0XHRsZXQgbmV3RWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXdNb2RlbC5nZXRFbGVtZW50c0J5TmFtZShhbmNob3JJZCk7XG5cdFx0XHRcdGlmIChzZXR0aW5ncyAmJiBzZXR0aW5ncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0bmV3RWxlbWVudCA9IHNldHRpbmdzWzBdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpbmRHcm91cCA9IChyb290czogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50W10pOiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBnIG9mIHJvb3RzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChnLmlkID09PSBhbmNob3JJZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBnO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChnLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBnLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZm91bmQgPSBmaW5kR3JvdXAoW2NoaWxkXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmb3VuZDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG5ld0VsZW1lbnQgPSBmaW5kR3JvdXAoW25ld01vZGVsLnJvb3RdKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChuZXdFbGVtZW50KSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnJldmVhbChuZXdFbGVtZW50LCAwKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmUgdGhlIGVycm9yXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVHJlZU1vZGVsLCB0aGlzLnZpZXdTdGF0ZSwgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblx0XHRcdHRoaXMucmVmcmVzaE1vZGVscyhyZXNvbHZlZFNldHRpbmdzUm9vdCk7XG5cblx0XHRcdC8vIERvbid0IHJlc3RvcmUgdGhlIGNhY2hlZCBzdGF0ZSBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBxdWVyeSB2YWx1ZSBmcm9tIGNhbGxpbmcgX3NldE9wdGlvbnMoKS5cblx0XHRcdGNvbnN0IGNhY2hlZFN0YXRlID0gIXRoaXMudmlld1N0YXRlLnF1ZXJ5ID8gdGhpcy5yZXN0b3JlQ2FjaGVkU3RhdGUoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjYWNoZWRTdGF0ZT8uc2VhcmNoUXVlcnkgfHwgdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9uU2VhcmNoSW5wdXRDaGFuZ2VkKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXG5cdFx0XHRcdC8vIFNldCBpbml0aWFsIGNhdGVnb3J5IHRvIHRoZSBmaXJzdCBvbmUgKENvbW1vbmx5IFVzZWQpXG5cdFx0XHRcdGNvbnN0IHJvb3RDaGlsZHJlbiA9IHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUucm9vdC5jaGlsZHJlbjtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocm9vdENoaWxkcmVuKSAmJiByb290Q2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0Q2F0ZWdvcnkgPSByb290Q2hpbGRyZW5bMF07XG5cdFx0XHRcdFx0aWYgKGZpcnN0Q2F0ZWdvcnkgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gZmlyc3RDYXRlZ29yeTtcblx0XHRcdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbZmlyc3RDYXRlZ29yeV0pO1xuXHRcdFx0XHRcdFx0dGhpcy50b2NUcmVlLnNldFNlbGVjdGlvbihbZmlyc3RDYXRlZ29yeV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVmcmVzaFRyZWUoKTtcblx0XHRcdFx0dGhpcy50b2NUcmVlLmNvbGxhcHNlQWxsKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbGVtZW50c0J5S2V5KGtleXM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHRpZiAoa2V5cy5zaXplKSB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwhLnVwZGF0ZUVsZW1lbnRzQnlOYW1lKGtleSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSkge1xuXHRcdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUhLnVwZGF0ZUVsZW1lbnRzQnlOYW1lKGtleSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMucmVuZGVyVHJlZShrZXkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJUcmVlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVDb250cm9sSW5TZXR0aW5nc1RyZWUoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5zZXR0aW5nc1RyZWUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0cmV0dXJuIChhY3RpdmVFbGVtZW50ICYmIERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSA/XG5cdFx0XHQ8SFRNTEVsZW1lbnQ+YWN0aXZlRWxlbWVudCA6XG5cdFx0XHRudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUcmVlKGtleT86IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghZm9yY2UgJiYga2V5ICYmIHRoaXMuc2NoZWR1bGVkUmVmcmVzaGVzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZU1vZGlmaWVkTGFiZWxGb3JLZXkoa2V5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgY29udGV4dCB2aWV3IGlzIGZvY3VzZWQsIGRlbGF5IHJlbmRlcmluZyBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLmNvbnRleHRWaWV3Rm9jdXNlZCgpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29udGV4dC12aWV3Jyk7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlUmVmcmVzaChlbGVtZW50IGFzIEhUTUxFbGVtZW50LCBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIGEgc2V0dGluZyBjb250cm9sIGlzIGN1cnJlbnRseSBmb2N1c2VkLCBzY2hlZHVsZSBhIHJlZnJlc2ggZm9yIGxhdGVyXG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IHRoaXMuZ2V0QWN0aXZlQ29udHJvbEluU2V0dGluZ3NUcmVlKCk7XG5cdFx0Y29uc3QgZm9jdXNlZFNldHRpbmcgPSBhY3RpdmVFbGVtZW50ICYmIHRoaXMuc2V0dGluZ1JlbmRlcmVycy5nZXRTZXR0aW5nRE9NRWxlbWVudEZvckRPTUVsZW1lbnQoYWN0aXZlRWxlbWVudCk7XG5cdFx0aWYgKGZvY3VzZWRTZXR0aW5nICYmICFmb3JjZSkge1xuXHRcdFx0Ly8gSWYgYSBzaW5nbGUgc2V0dGluZyBpcyBiZWluZyByZWZyZXNoZWQsIGl0J3Mgb2sgdG8gcmVmcmVzaCBub3cgaWYgdGhhdCBpcyBub3QgdGhlIGZvY3VzZWQgc2V0dGluZ1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkS2V5ID0gZm9jdXNlZFNldHRpbmcuZ2V0QXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLlNFVFRJTkdfS0VZX0FUVFIpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZEtleSA9PT0ga2V5ICYmXG5cdFx0XHRcdFx0Ly8gdXBkYXRlIGBsaXN0YHMgbGl2ZSwgYXMgdGhleSBoYXZlIGEgc2VwYXJhdGUgXCJzdWJtaXQgZWRpdFwiIHN0ZXAgYnVpbHQgaW4gYmVmb3JlIHRoaXNcblx0XHRcdFx0XHQoZm9jdXNlZFNldHRpbmcucGFyZW50RWxlbWVudCAmJiAhZm9jdXNlZFNldHRpbmcucGFyZW50RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3NldHRpbmctaXRlbS1saXN0JykpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlTW9kaWZpZWRMYWJlbEZvcktleShrZXkpO1xuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVSZWZyZXNoKGZvY3VzZWRTZXR0aW5nLCBrZXkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZVJlZnJlc2goZm9jdXNlZFNldHRpbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJSZXN1bHRDb3VudE1lc3NhZ2VzKGZhbHNlKTtcblxuXHRcdGlmIChrZXkpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsPy5nZXRFbGVtZW50c0J5TmFtZShrZXkpO1xuXHRcdFx0aWYgKGVsZW1lbnRzPy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdNb3JlIHRoYW4gb25lIHNldHRpbmcgd2l0aCBrZXkgJyArIGtleSArICcgZm91bmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2hTaW5nbGVFbGVtZW50KGVsZW1lbnRzWzBdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFJlZnJlc2ggcmVxdWVzdGVkIGZvciBhIGtleSB0aGF0IHdlIGRvbid0IGtub3cgYWJvdXRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hUcmVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250ZXh0Vmlld0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhRE9NLmZpbmRQYXJlbnRXaXRoQ2xhc3MoPEhUTUxFbGVtZW50PnRoaXMucm9vdEVsZW1lbnQub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50LCAnY29udGV4dC12aWV3Jyk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hTaW5nbGVFbGVtZW50KGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKClcblx0XHRcdCYmIHRoaXMuc2V0dGluZ3NUcmVlLmhhc0VsZW1lbnQoZWxlbWVudClcblx0XHRcdCYmICghZWxlbWVudC5zZXR0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZSB8fCBlbGVtZW50LmlzQ29uZmlndXJlZCkpIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnJlcmVuZGVyKGVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFRyZWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkgJiYgdGhpcy5jdXJyZW50U2V0dGluZ3NNb2RlbCkge1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY3JlYXRlR3JvdXBJdGVyYXRvcih0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsLnJvb3QpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hUT0NUcmVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLnRvY1RyZWVNb2RlbC51cGRhdGUoKTtcblx0XHRcdHRoaXMudG9jVHJlZS5zZXRDaGlsZHJlbihudWxsLCBjcmVhdGVUT0NJdGVyYXRvcih0aGlzLnRvY1RyZWVNb2RlbCwgdGhpcy50b2NUcmVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb2RpZmllZExhYmVsRm9yS2V5KGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRhdGFFbGVtZW50cyA9IHRoaXMuY3VycmVudFNldHRpbmdzTW9kZWwuZ2V0RWxlbWVudHNCeU5hbWUoa2V5KTtcblx0XHRjb25zdCBpc01vZGlmaWVkID0gZGF0YUVsZW1lbnRzICYmIGRhdGFFbGVtZW50c1swXSAmJiBkYXRhRWxlbWVudHNbMF0uaXNDb25maWd1cmVkOyAvLyBhbGwgZWxlbWVudHMgYXJlIGVpdGhlciBjb25maWd1cmVkIG9yIG5vdFxuXHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5zZXR0aW5nUmVuZGVyZXJzLmdldERPTUVsZW1lbnRzRm9yU2V0dGluZ0tleSh0aGlzLnNldHRpbmdzVHJlZS5nZXRIVE1MRWxlbWVudCgpLCBrZXkpO1xuXHRcdGlmIChlbGVtZW50cyAmJiBlbGVtZW50c1swXSkge1xuXHRcdFx0ZWxlbWVudHNbMF0uY2xhc3NMaXN0LnRvZ2dsZSgnaXMtY29uZmlndXJlZCcsICEhaXNNb2RpZmllZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaElucHV0Q2hhbmdlZChleHBhbmRSZXN1bHRzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsKSB7XG5cdFx0XHQvLyBJbml0aWFsaXppbmcgc2VhcmNoIHdpZGdldCB2YWx1ZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltKCk7XG5cdFx0dGhpcy52aWV3U3RhdGUucXVlcnkgPSBxdWVyeTtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmFkZFRvSGlzdG9yeSgpO1xuXHRcdFx0dGhpcy51cGRhdGVTZWFyY2hQbGFjZWhvbGRlcigpO1xuXHRcdFx0dGhpcy5zYXZlU2VhcmNoSGlzdG9yeSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnRyaWdnZXJTZWFyY2gocXVlcnkucmVwbGFjZSgvXFx1MjAzQS9nLCAnICcpLCBleHBhbmRSZXN1bHRzKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZFNlYXJjaEhpc3RvcnkoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgc3RyaW5nID0+IHR5cGVvZiBlbnRyeSA9PT0gJ3N0cmluZycpIDogW107XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU2VhcmNoSGlzdG9yeSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRIaXN0b3J5KCk7XG5cdFx0aWYgKGhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUodGhpcy5TRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTZXR0aW5nRnJvbUpTT04ocXVlcnk6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IG1hdGNoID0gcXVlcnkubWF0Y2goL1wiKFthLXpBLVouXSspXCI6IC8pO1xuXHRcdHJldHVybiBtYXRjaCAmJiBtYXRjaFsxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBTZXR0aW5ncyBlZGl0b3IgdGFibGUgb2YgY29udGVudHMgZHVyaW5nIGEgc2VhcmNoXG5cdCAqIGRlcGVuZGluZyBvbiB0aGUgYmVoYXZpb3IuXG5cdCAqL1xuXHRwcml2YXRlIHRvZ2dsZVRvY0J5U2VhcmNoQmVoYXZpb3JUeXBlKCkge1xuXHRcdGNvbnN0IHRvY0JlaGF2aW9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmlsdGVyJyB8ICdoaWRlJz4oU0VBUkNIX1RPQ19CRUhBVklPUl9LRVkpO1xuXHRcdGNvbnN0IGhpZGVUb2MgPSB0b2NCZWhhdmlvciA9PT0gJ2hpZGUnO1xuXHRcdGlmIChoaWRlVG9jKSB7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zZXRWaWV3VmlzaWJsZSgwLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zdHlsZSh7XG5cdFx0XHRcdHNlcGFyYXRvckJvcmRlcjogQ29sb3IudHJhbnNwYXJlbnRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxheW91dFNwbGl0Vmlldyh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmlnZ2VyU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIGV4cGFuZFJlc3VsdHM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9ncmVzc1J1bm5lciA9IHRoaXMuZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLnNob3codHJ1ZSwgODAwKTtcblx0XHRjb25zdCBzaG93QWR2YW5jZWQgPSB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5oYXMoQURWQU5DRURfU0VUVElOR19UQUcpO1xuXHRcdHRoaXMudmlld1N0YXRlLnRhZ0ZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5leHRlbnNpb25GaWx0ZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlciA9IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdGNvbnN0IHBhcnNlZFF1ZXJ5ID0gcGFyc2VRdWVyeShxdWVyeSk7XG5cdFx0XHRxdWVyeSA9IHBhcnNlZFF1ZXJ5LnF1ZXJ5O1xuXHRcdFx0cGFyc2VkUXVlcnkudGFncy5mb3JFYWNoKHRhZyA9PiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzIS5hZGQodGFnKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5leHRlbnNpb25GaWx0ZXJzLmZvckVhY2goZXh0ZW5zaW9uSWQgPT4gdGhpcy52aWV3U3RhdGUuZXh0ZW5zaW9uRmlsdGVycyEuYWRkKGV4dGVuc2lvbklkKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5mZWF0dXJlRmlsdGVycy5mb3JFYWNoKGZlYXR1cmUgPT4gdGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMhLmFkZChmZWF0dXJlKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5pZEZpbHRlcnMuZm9yRWFjaChpZCA9PiB0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMhLmFkZChpZCkpO1xuXHRcdFx0dGhpcy52aWV3U3RhdGUubGFuZ3VhZ2VGaWx0ZXIgPSBwYXJzZWRRdWVyeS5sYW5ndWFnZUZpbHRlcjtcblx0XHR9XG5cblx0XHRpZiAoc2hvd0FkdmFuY2VkICE9PSB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5oYXMoQURWQU5DRURfU0VUVElOR19UQUcpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9uQ29uZmlnVXBkYXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQudXBkYXRlTGFuZ3VhZ2VGaWx0ZXJJbmRpY2F0b3JzKHRoaXMudmlld1N0YXRlLmxhbmd1YWdlRmlsdGVyKTtcblxuXHRcdGlmIChxdWVyeSAmJiBxdWVyeSAhPT0gJ0AnKSB7XG5cdFx0XHRxdWVyeSA9IHRoaXMucGFyc2VTZXR0aW5nRnJvbUpTT04ocXVlcnkpIHx8IHF1ZXJ5O1xuXHRcdFx0YXdhaXQgdGhpcy50cmlnZ2VyRmlsdGVyUHJlZmVyZW5jZXMocXVlcnksIGV4cGFuZFJlc3VsdHMsIHByb2dyZXNzUnVubmVyKTtcblx0XHRcdHRoaXMudG9nZ2xlVG9jQnlTZWFyY2hCZWhhdmlvclR5cGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudmlld1N0YXRlLnRhZ0ZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5leHRlbnNpb25GaWx0ZXJzLnNpemUgfHwgdGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlcikge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdE1vZGVsID0gdGhpcy5jcmVhdGVGaWx0ZXJNb2RlbCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2VhcmNoRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGlmICh0aGlzLnNlYXJjaEluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hJblByb2dyZXNzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHBhbmRSZXN1bHRzKSB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50b2NUcmVlTW9kZWwuY3VycmVudFNlYXJjaE1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRNb2RlbDtcblx0XHRcdHRoaXMucmVuZGVyZWRTZWFyY2hRdWVyeSA9IHRoaXMudmlld1N0YXRlLnF1ZXJ5O1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHQvLyBBZGRlZCBhIGZpbHRlciBtb2RlbFxuXHRcdFx0XHRpZiAoZXhwYW5kUmVzdWx0cykge1xuXHRcdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHRcdHRoaXMudG9jVHJlZS5leHBhbmRBbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2hUT0NUcmVlKCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyUmVzdWx0Q291bnRNZXNzYWdlcyhmYWxzZSk7XG5cdFx0XHRcdHRoaXMucmVmcmVzaFRyZWUoKTtcblx0XHRcdFx0dGhpcy50b2dnbGVUb2NCeVNlYXJjaEJlaGF2aW9yVHlwZSgpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy50b2NUcmVlRGlzcG9zZWQpIHtcblx0XHRcdFx0Ly8gTGVhdmluZyBzZWFyY2ggbW9kZVxuXHRcdFx0XHR0aGlzLnRvY1RyZWUuY29sbGFwc2VBbGwoKTtcblx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclJlc3VsdENvdW50TWVzc2FnZXMoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hUcmVlKCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdHByb2dyZXNzUnVubmVyLmRvbmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGEgZmFrZSBTZWFyY2hSZXN1bHRNb2RlbCB3aGljaCBjYW4gaG9sZCBhIGZsYXQgbGlzdCBvZiBhbGwgc2V0dGluZ3MsIHRvIGJlIGZpbHRlcmVkIChAbW9kaWZpZWQgZXRjKVxuXHQgKi9cblx0cHJpdmF0ZSBjcmVhdGVGaWx0ZXJNb2RlbCgpOiBTZWFyY2hSZXN1bHRNb2RlbCB7XG5cdFx0Y29uc3QgZmlsdGVyTW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFJlc3VsdE1vZGVsLCB0aGlzLnZpZXdTdGF0ZSwgdGhpcy5zZXR0aW5nc09yZGVyQnlUb2NJbmRleCwgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblxuXHRcdGNvbnN0IGZ1bGxSZXN1bHQ6IElTZWFyY2hSZXN1bHQgPSB7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBbXSxcblx0XHRcdGV4YWN0TWF0Y2g6IGZhbHNlLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0FkdmFuY2VkID0gdGhpcy5jYW5TaG93QWR2YW5jZWRTZXR0aW5ncygpO1xuXHRcdGZvciAoY29uc3QgZyBvZiB0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldHRpbmdzR3JvdXBzLnNsaWNlKDEpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Qgb2YgZy5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdC5zZXR0aW5ncykge1xuXHRcdFx0XHRcdGlmICghc2hvdWxkU2hvd0FkdmFuY2VkICYmICF0aGlzLnNob3VsZFNob3dTZXR0aW5nKHNldHRpbmcpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnVsbFJlc3VsdC5maWx0ZXJNYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0c2V0dGluZyxcblx0XHRcdFx0XHRcdG1hdGNoZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWF0Y2hUeXBlOiBTZXR0aW5nTWF0Y2hUeXBlLk5vbmUsXG5cdFx0XHRcdFx0XHRrZXlNYXRjaFNjb3JlOiAwLFxuXHRcdFx0XHRcdFx0c2NvcmU6IDAsXG5cdFx0XHRcdFx0XHRwcm92aWRlck5hbWU6IEZJTFRFUl9NT0RFTF9TRUFSQ0hfUFJPVklERVJfTkFNRVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZmlsdGVyTW9kZWwuc2V0UmVzdWx0KDAsIGZ1bGxSZXN1bHQpO1xuXHRcdHJldHVybiBmaWx0ZXJNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJpZ2dlckZpbHRlclByZWZlcmVuY2VzKHF1ZXJ5OiBzdHJpbmcsIGV4cGFuZFJlc3VsdHM6IGJvb2xlYW4sIHByb2dyZXNzUnVubmVyOiBJUHJvZ3Jlc3NSdW5uZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zZWFyY2hJblByb2dyZXNzKSB7XG5cdFx0XHR0aGlzLnNlYXJjaEluUHJvZ3Jlc3MuZGlzcG9zZSh0cnVlKTtcblx0XHRcdHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoSW5Qcm9ncmVzcyA9IHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaERlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoc2VhcmNoSW5Qcm9ncmVzcy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc2FibGVBaVNlYXJjaFRvZ2dsZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxSZXN1bHRzID0gYXdhaXQgdGhpcy5kb0xvY2FsU2VhcmNoKHF1ZXJ5LCBzZWFyY2hJblByb2dyZXNzLnRva2VuKTtcblx0XHRcdGlmICghdGhpcy5zZWFyY2hSZXN1bHRNb2RlbCB8fCBzZWFyY2hJblByb2dyZXNzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuc2hvd0FpUmVzdWx0cyA9IGZhbHNlO1xuXG5cdFx0XHRpZiAobG9jYWxSZXN1bHRzICYmIGxvY2FsUmVzdWx0cy5maWx0ZXJNYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gVGhlIHJlbW90ZSByZXN1bHRzIG1pZ2h0IHRha2UgYSB3aGlsZSBhbmRcblx0XHRcdFx0Ly8gYXJlIGFsd2F5cyBhcHBlbmRlZCB0byB0aGUgZW5kIGFueXdheSwgc29cblx0XHRcdFx0Ly8gc2hvdyBzb21lIHJlc3VsdHMgbm93LlxuXHRcdFx0XHR0aGlzLm9uRGlkRmluaXNoU2VhcmNoKGV4cGFuZFJlc3VsdHMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbG9jYWxSZXN1bHRzIHx8ICFsb2NhbFJlc3VsdHMuZXhhY3RNYXRjaCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvUmVtb3RlU2VhcmNoKHF1ZXJ5LCBzZWFyY2hJblByb2dyZXNzLnRva2VuKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZWFyY2hJblByb2dyZXNzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuYWlTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuYWlTZWFyY2hQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLaWNrIG9mZiBhbiBBSSBzZWFyY2ggaW4gdGhlIGJhY2tncm91bmQgaWYgdGhlIHRvZ2dsZSBpcyBzaG93bi5cblx0XHRcdC8vIFdlIHB1cnBvc2VseSBkbyBub3QgYXdhaXQgaXQuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dEFjdGlvbkJhciAmJiB0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24gJiYgdGhpcy5zZWFyY2hJbnB1dEFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLmFpU2VhcmNoUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0FpU2VhcmNoKHF1ZXJ5LCB0b2tlbikudGhlbigocmVzdWx0cykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdHMgJiYgdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5haVJlc3VsdHNBdmFpbGFibGUuc2V0KHRydWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24ubGFiZWwgPSBTSE9XX0FJX1JFU1VMVFNfRU5BQkxFRF9MQUJFTDtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJSZXN1bHRDb3VudE1lc3NhZ2VzKHRydWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXJyb3IgZHVyaW5nIEFJIHNldHRpbmdzIHNlYXJjaDonLCBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub25EaWRGaW5pc2hTZWFyY2goZXhwYW5kUmVzdWx0cywgcHJvZ3Jlc3NSdW5uZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbmlzaFNlYXJjaChleHBhbmRSZXN1bHRzOiBib29sZWFuLCBwcm9ncmVzc1J1bm5lcjogSVByb2dyZXNzUnVubmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy50b2NUcmVlTW9kZWwuY3VycmVudFNlYXJjaE1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRNb2RlbDtcblx0XHR0aGlzLnJlbmRlcmVkU2VhcmNoUXVlcnkgPSB0aGlzLnZpZXdTdGF0ZS5xdWVyeTtcblx0XHRpZiAoZXhwYW5kUmVzdWx0cykge1xuXHRcdFx0dGhpcy50b2NUcmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50b2NUcmVlLmV4cGFuZEFsbCgpO1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHR9XG5cdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdHRoaXMucmVuZGVyVHJlZSh1bmRlZmluZWQsIHRydWUpO1xuXHRcdHByb2dyZXNzUnVubmVyPy5kb25lKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvTG9jYWxTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGxvY2FsU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRMb2NhbFNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hXaXRoUHJvdmlkZXIoU2VhcmNoUmVzdWx0SWR4LkxvY2FsLCBsb2NhbFNlYXJjaFByb3ZpZGVyLCBTVFJJTkdfTUFUQ0hfU0VBUkNIX1BST1ZJREVSX05BTUUsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZW1vdGVTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlbW90ZVNlYXJjaFByb3ZpZGVyID0gdGhpcy5wcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UuZ2V0UmVtb3RlU2VhcmNoUHJvdmlkZXIocXVlcnkpO1xuXHRcdGlmICghcmVtb3RlU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNlYXJjaFdpdGhQcm92aWRlcihTZWFyY2hSZXN1bHRJZHguUmVtb3RlLCByZW1vdGVTZWFyY2hQcm92aWRlciwgVEZfSURGX1NFQVJDSF9QUk9WSURFUl9OQU1FLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQWlTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGFpU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRBaVNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRpZiAoIWFpU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtYmVkZGluZ3NSZXN1bHRzID0gYXdhaXQgdGhpcy5zZWFyY2hXaXRoUHJvdmlkZXIoU2VhcmNoUmVzdWx0SWR4LkVtYmVkZGluZ3MsIGFpU2VhcmNoUHJvdmlkZXIsIEVNQkVERElOR1NfU0VBUkNIX1BST1ZJREVSX05BTUUsIHRva2VuKTtcblx0XHRpZiAoIWVtYmVkZGluZ3NSZXN1bHRzIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsbG1SZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRMTE1SYW5rZWRSZXN1bHRzKHF1ZXJ5LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmlsdGVyTWF0Y2hlczogZW1iZWRkaW5nc1Jlc3VsdHMuZmlsdGVyTWF0Y2hlcy5jb25jYXQobGxtUmVzdWx0cz8uZmlsdGVyTWF0Y2hlcyA/PyBbXSksXG5cdFx0XHRleGFjdE1hdGNoOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExMTVJhbmtlZFJlc3VsdHMocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGFpU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRBaVNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRpZiAoIWFpU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goZmFsc2UpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFpU2VhcmNoUHJvdmlkZXIuZ2V0TExNUmFua2VkUmVzdWx0cyh0b2tlbik7XG5cdFx0c3RvcFdhdGNoLnN0b3AoKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBsb2cgdGhlIGVsYXBzZWQgdGltZSBpZiB0aGVyZSBhcmUgYWN0dWFsIHJlc3VsdHMuXG5cdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuZmlsdGVyTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gc3RvcFdhdGNoLmVsYXBzZWQoKTtcblx0XHRcdHRoaXMubG9nU2VhcmNoUGVyZm9ybWFuY2UoTExNX1JBTktFRF9TRUFSQ0hfUFJPVklERVJfTkFNRSwgZWxhcHNlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCEuc2V0UmVzdWx0KFNlYXJjaFJlc3VsdElkeC5BaVNlbGVjdGVkLCByZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlYXJjaFdpdGhQcm92aWRlcih0eXBlOiBTZWFyY2hSZXN1bHRJZHgsIHNlYXJjaFByb3ZpZGVyOiBJU2VhcmNoUHJvdmlkZXIsIHByb3ZpZGVyTmFtZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc2VhcmNoUHJlZmVyZW5jZXNNb2RlbCh0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLCBzZWFyY2hQcm92aWRlciwgdG9rZW4pO1xuXHRcdHN0b3BXYXRjaC5zdG9wKCk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIEhhbmRsZSBjYW5jZWxsYXRpb24gbGlrZSB0aGlzIGJlY2F1c2UgY2FuY2VsbGF0aW9uIGlzIGxvc3QgaW5zaWRlIHRoZSBzZWFyY2ggcHJvdmlkZXIgZHVlIHRvIGFzeW5jL2F3YWl0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgb3V0IGFkdmFuY2VkIHNldHRpbmdzIHVubGVzcyB0aGUgYWR2YW5jZWQgdGFnIGlzIGV4cGxpY2l0bHkgc2V0IG9yIHNldHRpbmcgbWF0Y2hlcyBhbiBJRCBmaWx0ZXJcblx0XHRpZiAocmVzdWx0ICYmICF0aGlzLmNhblNob3dBZHZhbmNlZFNldHRpbmdzKCkpIHtcblx0XHRcdHJlc3VsdC5maWx0ZXJNYXRjaGVzID0gcmVzdWx0LmZpbHRlck1hdGNoZXMuZmlsdGVyKG1hdGNoID0+IHRoaXMuc2hvdWxkU2hvd1NldHRpbmcobWF0Y2guc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgbG9nIHRoZSBlbGFwc2VkIHRpbWUgaWYgdGhlcmUgYXJlIGFjdHVhbCByZXN1bHRzLlxuXHRcdGlmIChyZXN1bHQgJiYgcmVzdWx0LmZpbHRlck1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZWxhcHNlZCA9IHN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0XHR0aGlzLmxvZ1NlYXJjaFBlcmZvcm1hbmNlKHByb3ZpZGVyTmFtZSwgZWxhcHNlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCA/Pz0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hSZXN1bHRNb2RlbCwgdGhpcy52aWV3U3RhdGUsIHRoaXMuc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXgsIHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbC5zZXRSZXN1bHQodHlwZSwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBsb2dTZWFyY2hQZXJmb3JtYW5jZShwcm92aWRlck5hbWU6IHN0cmluZywgZWxhcHNlZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvclNlYXJjaFBlcmZvcm1hbmNlRXZlbnQgPSB7XG5cdFx0XHRwcm92aWRlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGVsYXBzZWRNczogbnVtYmVyO1xuXHRcdH07XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvclNlYXJjaFBlcmZvcm1hbmNlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRwcm92aWRlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgc2VhcmNoIHByb3ZpZGVyLCBpZiBhcHBsaWNhYmxlLicgfTtcblx0XHRcdGVsYXBzZWRNczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0aW1lIHRha2VuIHRvIHBlcmZvcm0gdGhlIHNlYXJjaCwgaW4gbWlsbGlzZWNvbmRzLicgfTtcblx0XHRcdG93bmVyOiAncnpoYW8yNzEnO1xuXHRcdFx0Y29tbWVudDogJ0V2ZW50IGVtaXR0ZWQgd2hlbiB0aGUgU2V0dGluZ3MgZWRpdG9yIGNhbGxzIGEgc2VhcmNoIHByb3ZpZGVyIHRvIHNlYXJjaCBmb3IgYSBzZXR0aW5nJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNldHRpbmdzRWRpdG9yU2VhcmNoUGVyZm9ybWFuY2VFdmVudCwgU2V0dGluZ3NFZGl0b3JTZWFyY2hQZXJmb3JtYW5jZUNsYXNzaWZpY2F0aW9uPignc2V0dGluZ3NFZGl0b3Iuc2VhcmNoUGVyZm9ybWFuY2UnLCB7XG5cdFx0XHRwcm92aWRlck5hbWUsXG5cdFx0XHRlbGFwc2VkTXM6IGVsYXBzZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJlc3VsdENvdW50TWVzc2FnZXMoc2hvd0FpUmVzdWx0c01lc3NhZ2U6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNldHRpbmdzTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNsZWFyRmlsdGVyTGlua0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdGhpcy52aWV3U3RhdGUudGFnRmlsdGVycyAmJiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzLnNpemUgPiAwXG5cdFx0XHQ/ICdpbml0aWFsJ1xuXHRcdFx0OiAnbm9uZSc7XG5cblx0XHRpZiAoIXRoaXMuc2VhcmNoUmVzdWx0TW9kZWwpIHtcblx0XHRcdGlmICh0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRMYWJlbCA9IG51bGw7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCduby1yZXN1bHRzJyk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5lbC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb3VudCA9IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuZ2V0VW5pcXVlUmVzdWx0c0NvdW50KCk7XG5cdFx0XHRsZXQgcmVzdWx0U3RyaW5nOiBzdHJpbmc7XG5cblx0XHRcdGlmIChzaG93QWlSZXN1bHRzTWVzc2FnZSkge1xuXHRcdFx0XHRzd2l0Y2ggKGNvdW50KSB7XG5cdFx0XHRcdFx0Y2FzZSAwOiByZXN1bHRTdHJpbmcgPSBsb2NhbGl6ZSgnbm9SZXN1bHRzV2l0aEFpQXZhaWxhYmxlJywgXCJObyBTZXR0aW5ncyBGb3VuZC4gQUkgUmVzdWx0cyBBdmFpbGFibGVcIik7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgMTogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ29uZVJlc3VsdFdpdGhBaUF2YWlsYWJsZScsIFwiMSBTZXR0aW5nIEZvdW5kLiBBSSBSZXN1bHRzIEF2YWlsYWJsZVwiKTsgYnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ21vcmVUaGFuT25lUmVzdWx0V2l0aEFpQXZhaWxhYmxlJywgXCJ7MH0gU2V0dGluZ3MgRm91bmQuIEFJIFJlc3VsdHMgQXZhaWxhYmxlXCIsIGNvdW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3dpdGNoIChjb3VudCkge1xuXHRcdFx0XHRcdGNhc2UgMDogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ25vUmVzdWx0cycsIFwiTm8gU2V0dGluZ3MgRm91bmRcIik7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgMTogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ29uZVJlc3VsdCcsIFwiMSBTZXR0aW5nIEZvdW5kXCIpOyBicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OiByZXN1bHRTdHJpbmcgPSBsb2NhbGl6ZSgnbW9yZVRoYW5PbmVSZXN1bHQnLCBcInswfSBTZXR0aW5ncyBGb3VuZFwiLCBjb3VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRMYWJlbCA9IHJlc3VsdFN0cmluZztcblx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50LmlubmVyVGV4dCA9IHJlc3VsdFN0cmluZztcblx0XHRcdGFyaWEuc3RhdHVzKHJlc3VsdFN0cmluZyk7XG5cblx0XHRcdGlmICh0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnYmxvY2snKSB7XG5cdFx0XHRcdHRoaXMuY291bnRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduby1yZXN1bHRzJywgY291bnQgPT09IDApO1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcuZWwuc3R5bGUudmlzaWJpbGl0eSA9IGNvdW50ID09PSAwID8gJ2hpZGRlbicgOiAndmlzaWJsZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VhcmNoUHJlZmVyZW5jZXNNb2RlbChtb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsIHByb3ZpZGVyOiBJU2VhcmNoUHJvdmlkZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyLnNlYXJjaE1vZGVsKG1vZGVsLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRTcGxpdFZpZXcoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBkaW1lbnNpb24uaGVpZ2h0IC0gKDcyICsgMTEgKyAxNCAvKiBoZWFkZXIgaGVpZ2h0ICsgZWRpdG9yIHBhZGRpbmcgKi8pO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcuZWwuc3R5bGUuaGVpZ2h0ID0gYCR7bGlzdEhlaWdodH1weGA7XG5cblx0XHQvLyBXZSBjYWxsIGxheW91dCBmaXJzdCBzbyB0aGUgc3BsaXRWaWV3IGhhcyBhbiBpZGVhIG9mIGhvdyBtdWNoXG5cdFx0Ly8gc3BhY2UgaXQgaGFzLCBvdGhlcndpc2Ugc2V0Vmlld1Zpc2libGUgcmVzdWx0cyBpbiB0aGUgZmlyc3QgcGFuZWxcblx0XHQvLyBzaG93aW5nIHVwIGF0IHRoZSBtaW5pbXVtIHNpemUgd2hlbmV2ZXIgdGhlIFNldHRpbmdzIGVkaXRvclxuXHRcdC8vIG9wZW5zIGZvciB0aGUgZmlyc3QgdGltZS5cblx0XHR0aGlzLnNwbGl0Vmlldy5sYXlvdXQodGhpcy5ib2R5Q29udGFpbmVyLmNsaWVudFdpZHRoLCBsaXN0SGVpZ2h0KTtcblxuXHRcdGNvbnN0IHRvY0JlaGF2aW9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmlsdGVyJyB8ICdoaWRlJz4oU0VBUkNIX1RPQ19CRUhBVklPUl9LRVkpO1xuXHRcdGNvbnN0IGhpZGVUb2NGb3JTZWFyY2ggPSB0b2NCZWhhdmlvciA9PT0gJ2hpZGUnICYmIHRoaXMuc2VhcmNoUmVzdWx0TW9kZWw7XG5cdFx0aWYgKCFoaWRlVG9jRm9yU2VhcmNoKSB7XG5cdFx0XHRjb25zdCBmaXJzdFZpZXdXYXNWaXNpYmxlID0gdGhpcy5zcGxpdFZpZXcuaXNWaWV3VmlzaWJsZSgwKTtcblx0XHRcdGNvbnN0IGZpcnN0Vmlld1Zpc2libGUgPSB0aGlzLmJvZHlDb250YWluZXIuY2xpZW50V2lkdGggPj0gU2V0dGluZ3NFZGl0b3IyLk5BUlJPV19UT1RBTF9XSURUSDtcblxuXHRcdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUoMCwgZmlyc3RWaWV3VmlzaWJsZSk7XG5cdFx0XHQvLyBJZiB0aGUgZmlyc3QgdmlldyBpcyBhZ2FpbiB2aXNpYmxlLCBhbmQgd2UgaGF2ZSBlbm91Z2ggc3BhY2UsIGltbWVkaWF0ZWx5IHNldCB0aGVcblx0XHRcdC8vIGVkaXRvciB0byB1c2UgdGhlIHJlc2V0IHdpZHRoIHJhdGhlciB0aGFuIHRoZSBjYWNoZWQgbWluIHdpZHRoXG5cdFx0XHRpZiAoIWZpcnN0Vmlld1dhc1Zpc2libGUgJiYgZmlyc3RWaWV3VmlzaWJsZSAmJiB0aGlzLmJvZHlDb250YWluZXIuY2xpZW50V2lkdGggPj0gU2V0dGluZ3NFZGl0b3IyLkVESVRPUl9NSU5fV0lEVEggKyBTZXR0aW5nc0VkaXRvcjIuVE9DX1JFU0VUX1dJRFRIKSB7XG5cdFx0XHRcdHRoaXMuc3BsaXRWaWV3LnJlc2l6ZVZpZXcoMCwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zdHlsZSh7XG5cdFx0XHRcdHNlcGFyYXRvckJvcmRlcjogZmlyc3RWaWV3VmlzaWJsZSA/IHRoaXMudGhlbWUuZ2V0Q29sb3Ioc2V0dGluZ3NTYXNoQm9yZGVyKSEgOiBDb2xvci50cmFuc3BhcmVudFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVTZWFyY2hIaXN0b3J5KCk7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltKCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldCBhcyBTZXR0aW5nc1RhcmdldDtcblx0XHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgdGhpcy5pbnB1dCwgeyBzZWFyY2hRdWVyeSwgdGFyZ2V0IH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0dGhpcy5lZGl0b3JNZW1lbnRvLmNsZWFyRWRpdG9yU3RhdGUodGhpcy5pbnB1dCwgdGhpcy5ncm91cCk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgU3luY0NvbnRyb2xzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFzdFN5bmNlZExhYmVsITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHVybk9uU3luY0J1dHRvbiE6IEJ1dHRvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbCA9IHRoaXMuX29uRGlkQ2hhbmdlTGFzdFN5bmNlZExhYmVsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdpbmRvdzogQ29kZVdpbmRvdyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhlYWRlclJpZ2h0Q29udHJvbHNDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmdzLXJpZ2h0LWNvbnRyb2xzJykpO1xuXHRcdGNvbnN0IHR1cm5PblN5bmNCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGhlYWRlclJpZ2h0Q29udHJvbHNDb250YWluZXIsICQoJy50dXJuLW9uLXN5bmMnKSk7XG5cdFx0dGhpcy50dXJuT25TeW5jQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0dXJuT25TeW5jQnV0dG9uQ29udGFpbmVyLCB7IHRpdGxlOiB0cnVlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHR0aGlzLmxhc3RTeW5jZWRMYWJlbCA9IERPTS5hcHBlbmQoaGVhZGVyUmlnaHRDb250cm9sc0NvbnRhaW5lciwgJCgnLmxhc3Qtc3luY2VkLWxhYmVsJykpO1xuXHRcdERPTS5oaWRlKHRoaXMubGFzdFN5bmNlZExhYmVsKTtcblxuXHRcdHRoaXMudHVybk9uU3luY0J1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLnR1cm5PblN5bmNCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgndHVybk9uU3luY0J1dHRvbicsIFwiQmFja3VwIGFuZCBTeW5jIFNldHRpbmdzXCIpO1xuXHRcdERPTS5oaWRlKHRoaXMudHVybk9uU3luY0J1dHRvbi5lbGVtZW50KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHVybk9uU3luY0J1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT24nKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUxhc3RTeW5jZWRUaW1lKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFzdFN5bmNUaW1lKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlTGFzdFN5bmNlZFRpbWUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVMYXN0U3luY2VkVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRE9NLldpbmRvd0ludGVydmFsVGltZXIoKSk7XG5cdFx0dXBkYXRlTGFzdFN5bmNlZFRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLnVwZGF0ZUxhc3RTeW5jZWRUaW1lKCksIDYwICogMTAwMCwgd2luZG93KTtcblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RTeW5jZWRUaW1lKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3QgPSB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UubGFzdFN5bmNUaW1lO1xuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgbGFzdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGQgPSBmcm9tTm93KGxhc3QsIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYXN0U3luY2VkTGFiZWwnLCBcIkxhc3Qgc3luY2VkOiB7MH1cIiwgZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsID0gJyc7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0U3luY2VkTGFiZWwudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbC5maXJlKGxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzID09PSBTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSB8fCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzICE9PSBTeW5jU3RhdHVzLklkbGUpIHtcblx0XHRcdERPTS5zaG93KHRoaXMubGFzdFN5bmNlZExhYmVsKTtcblx0XHRcdERPTS5oaWRlKHRoaXMudHVybk9uU3luY0J1dHRvbi5lbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0RE9NLmhpZGUodGhpcy5sYXN0U3luY2VkTGFiZWwpO1xuXHRcdFx0RE9NLnNob3codGhpcy50dXJuT25TeW5jQnV0dG9uLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdzRWRpdG9yMlN0YXRlIHtcblx0c2VhcmNoUXVlcnk6IHN0cmluZztcblx0dGFyZ2V0OiBTZXR0aW5nc1RhcmdldDtcbn1cbiJdLAogICJtYXBwaW5ncyI6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QixDQUFDO0FBQ3ZGLFFBQUksS0FBSyxLQUFLLGVBQWU7QUFFN0IsU0FBSyxpQkFBaUIsVUFBVTtBQUNoQyxTQUFLLGlCQUFpQixRQUFRLFNBQVMsb0JBQW9CLDBCQUEwQjtBQUNyRixRQUFJLEtBQUssS0FBSyxpQkFBaUIsT0FBTztBQUV0QyxTQUFLLFVBQVUsS0FBSyxpQkFBaUIsV0FBVyxZQUFZO0FBQzNELFlBQU0sS0FBSyxlQUFlLGVBQWUsdUNBQXVDO0FBQUEsSUFDakYsQ0FBQyxDQUFDO0FBRUYsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxVQUFVLEtBQUssb0JBQW9CLHdCQUF3QixNQUFNO0FBQ3JFLFdBQUsscUJBQXFCO0FBQUEsSUFDM0IsQ0FBQyxDQUFDO0FBRUYsVUFBTSx3QkFBd0IsS0FBSyxVQUFVLElBQUksSUFBSSxvQkFBb0IsQ0FBQztBQUMxRSwwQkFBc0IsYUFBYSxNQUFNLEtBQUsscUJBQXFCLEdBQUcsS0FBSyxLQUFNLE1BQU07QUFFdkYsU0FBSyxPQUFPO0FBQ1osU0FBSyxVQUFVLEtBQUssb0JBQW9CLGtCQUFrQixNQUFNO0FBQy9ELFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssOEJBQThCLHNCQUFzQixNQUFNO0FBQzdFLFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsdUJBQTZCO0FBQ3BDLFVBQU0sT0FBTyxLQUFLLG9CQUFvQjtBQUN0QyxRQUFJO0FBQ0osUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixZQUFNLElBQUksUUFBUSxNQUFNLE1BQU0sUUFBVyxJQUFJO0FBQzdDLGNBQVEsU0FBUyxtQkFBbUIsb0JBQW9CLENBQUM7QUFBQSxJQUMxRCxPQUFPO0FBQ04sY0FBUTtBQUFBLElBQ1Q7QUFFQSxTQUFLLGdCQUFnQixjQUFjO0FBQ25DLFNBQUssNEJBQTRCLEtBQUssS0FBSztBQUFBLEVBQzVDO0FBQUEsRUFFUSxTQUFlO0FBQ3RCLFFBQUksS0FBSyxvQkFBb0IsV0FBVyxXQUFXLGVBQWU7QUFDakU7QUFBQSxJQUNEO0FBRUEsUUFBSSxLQUFLLDhCQUE4QixVQUFVLEtBQUssS0FBSyxvQkFBb0IsV0FBVyxXQUFXLE1BQU07QUFDMUcsVUFBSSxLQUFLLEtBQUssZUFBZTtBQUM3QixVQUFJLEtBQUssS0FBSyxpQkFBaUIsT0FBTztBQUFBLElBQ3ZDLE9BQU87QUFDTixVQUFJLEtBQUssS0FBSyxlQUFlO0FBQzdCLFVBQUksS0FBSyxLQUFLLGlCQUFpQixPQUFPO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQ0Q7QUE1RU0sZUFBTjtBQUFBLEVBVUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWJHOyIsCiAgIm5hbWVzIjogWyJTZXR0aW5nc0ZvY3VzQ29udGV4dCIsICJyZXNvbHZlZFNldHRpbmdzUm9vdCJdCn0K
