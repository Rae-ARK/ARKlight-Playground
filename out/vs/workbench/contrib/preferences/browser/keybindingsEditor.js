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
import "./media/keybindingsEditor.css";
import { localize } from "../../../../nls.js";
import { Delayer } from "../../../../base/common/async.js";
import * as DOM from "../../../../base/browser/dom.js";
import { isIOS, OS } from "../../../../base/common/platform.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ToggleActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { KEYBINDING_ENTRY_TEMPLATE_ID } from "../../../services/preferences/browser/keybindingsEditorModel.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { DefineKeybindingWidget, KeybindingsSearchWidget } from "./keybindingWidgets.js";
import { CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, CONTEXT_WHEN_FOCUS } from "../common/preferences.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingEditingService } from "../../../services/keybinding/common/keybindingEditing.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { badgeBackground, contrastBorder, badgeForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground, registerColor, tableOddRowsBackgroundColor, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MenuRegistry, MenuId, isIMenuItem } from "../../../../platform/actions/common/actions.js";
import { WORKBENCH_BACKGROUND } from "../../../common/theme.js";
import { keybindingsRecordKeysIcon, keybindingsSortIcon, keybindingsAddIcon, preferencesClearInputIcon, keybindingsEditIcon } from "./preferencesIcons.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { defaultKeybindingLabelStyles, defaultToggleStyles, getInputBoxStyle } from "../../../../platform/theme/browser/defaultStyles.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { isString } from "../../../../base/common/types.js";
import { SuggestEnabledInput } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { settingsTextInputBorder } from "../common/settingsEditorColorRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const $ = DOM.$;
let KeybindingsEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, keybindingsService, contextMenuService, keybindingEditingService, contextKeyService, notificationService, clipboardService, instantiationService, editorService, storageService, configurationService, accessibilityService) {
    super(KeybindingsEditor.ID, group, telemetryService, themeService, storageService);
    this.keybindingsService = keybindingsService;
    this.contextMenuService = contextMenuService;
    this.keybindingEditingService = keybindingEditingService;
    this.contextKeyService = contextKeyService;
    this.notificationService = notificationService;
    this.clipboardService = clipboardService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this._onDefineWhenExpression = this._register(new Emitter());
    this.onDefineWhenExpression = this._onDefineWhenExpression.event;
    this._onRejectWhenExpression = this._register(new Emitter());
    this.onRejectWhenExpression = this._onRejectWhenExpression.event;
    this._onAcceptWhenExpression = this._register(new Emitter());
    this.onAcceptWhenExpression = this._onAcceptWhenExpression.event;
    this._onLayout = this._register(new Emitter());
    this.onLayout = this._onLayout.event;
    this.keybindingsEditorModel = null;
    this.unAssignedKeybindingItemToRevealAndFocus = null;
    this.tableEntries = [];
    this.dimension = null;
    this.latestEmptyFilters = [];
    this.delayedFiltering = this._register(new Delayer(300));
    this._register(keybindingsService.onDidUpdateKeybindings(() => this.render(!!this.keybindingFocusContextKey.get())));
    this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
    this.searchFocusContextKey = CONTEXT_KEYBINDINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
    this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
    this.searchHasValueContextKey = CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE.bindTo(this.contextKeyService);
    this.searchHistoryDelayer = this._register(new Delayer(500));
    this.recordKeysAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, localize("recordKeysLabel", "Record Keys"), ThemeIcon.asClassName(keybindingsRecordKeysIcon)));
    this.recordKeysAction.checked = false;
    this.sortByPrecedenceAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, localize("sortByPrecedeneLabel", "Sort by Precedence (Highest first)"), ThemeIcon.asClassName(keybindingsSortIcon)));
    this.sortByPrecedenceAction.checked = false;
    this.overflowWidgetsDomNode = $(".keybindings-overflow-widgets-container.monaco-editor");
  }
  create(parent) {
    super.create(parent);
    this._register(registerNavigableContainer({
      name: "keybindingsEditor",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (this.searchWidget.hasFocus()) {
          this.focusKeybindings();
        }
      },
      focusPreviousWidget: () => {
        if (!this.searchWidget.hasFocus()) {
          this.focusSearch();
        }
      }
    }));
  }
  createEditor(parent) {
    const keybindingsEditorElement = DOM.append(parent, $("div", { class: "keybindings-editor" }));
    this.createAriaLabelElement(keybindingsEditorElement);
    this.createOverlayContainer(keybindingsEditorElement);
    this.createHeader(keybindingsEditorElement);
    this.createBody(keybindingsEditorElement);
  }
  setInput(input, options, context, token) {
    this.keybindingsEditorContextKey.set(true);
    return super.setInput(input, options, context, token).then(() => this.render(!!(options && options.preserveFocus)));
  }
  clearInput() {
    super.clearInput();
    this.keybindingsEditorContextKey.reset();
    this.keybindingFocusContextKey.reset();
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutSearchWidget(dimension);
    this.overlayContainer.style.width = dimension.width + "px";
    this.overlayContainer.style.height = dimension.height + "px";
    this.defineKeybindingWidget.layout(this.dimension);
    this.layoutKeybindingsTable();
    this._onLayout.fire();
  }
  focus() {
    super.focus();
    const activeKeybindingEntry = this.activeKeybindingEntry;
    if (activeKeybindingEntry) {
      this.selectEntry(activeKeybindingEntry);
    } else if (!isIOS) {
      this.searchWidget.focus();
    }
  }
  get activeKeybindingEntry() {
    const focusedElement = this.keybindingsTable.getFocusedElements()[0];
    return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? focusedElement : null;
  }
  async defineKeybinding(keybindingEntry, add) {
    this.selectEntry(keybindingEntry);
    this.showOverlayContainer();
    try {
      const key = await this.defineKeybindingWidget.define();
      if (key) {
        await this.updateKeybinding(keybindingEntry, key, keybindingEntry.keybindingItem.when, add);
      }
    } catch (error) {
      this.onKeybindingEditingError(error);
    } finally {
      this.hideOverlayContainer();
      this.selectEntry(keybindingEntry);
    }
  }
  defineWhenExpression(keybindingEntry) {
    if (keybindingEntry.keybindingItem.keybinding) {
      this.selectEntry(keybindingEntry);
      this._onDefineWhenExpression.fire(keybindingEntry);
    }
  }
  rejectWhenExpression(keybindingEntry) {
    this._onRejectWhenExpression.fire(keybindingEntry);
  }
  acceptWhenExpression(keybindingEntry) {
    this._onAcceptWhenExpression.fire(keybindingEntry);
  }
  async updateKeybinding(keybindingEntry, key, when, add) {
    const currentKey = keybindingEntry.keybindingItem.keybinding ? keybindingEntry.keybindingItem.keybinding.getUserSettingsLabel() : "";
    if (currentKey !== key || keybindingEntry.keybindingItem.when !== when) {
      if (add) {
        await this.keybindingEditingService.addKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || void 0);
      } else {
        await this.keybindingEditingService.editKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || void 0);
      }
      if (!keybindingEntry.keybindingItem.keybinding) {
        this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
      }
    }
  }
  async removeKeybinding(keybindingEntry) {
    this.selectEntry(keybindingEntry);
    if (keybindingEntry.keybindingItem.keybinding) {
      try {
        await this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem.keybindingItem);
        this.focus();
      } catch (error) {
        this.onKeybindingEditingError(error);
        this.selectEntry(keybindingEntry);
      }
    }
  }
  async resetKeybinding(keybindingEntry) {
    this.selectEntry(keybindingEntry);
    try {
      await this.keybindingEditingService.resetKeybinding(keybindingEntry.keybindingItem.keybindingItem);
      if (!keybindingEntry.keybindingItem.keybinding) {
        this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
      }
      this.selectEntry(keybindingEntry);
    } catch (error) {
      this.onKeybindingEditingError(error);
      this.selectEntry(keybindingEntry);
    }
  }
  async copyKeybinding(keybinding) {
    this.selectEntry(keybinding);
    const userFriendlyKeybinding = {
      key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUserSettingsLabel() || "" : "",
      command: keybinding.keybindingItem.command
    };
    if (keybinding.keybindingItem.when) {
      userFriendlyKeybinding.when = keybinding.keybindingItem.when;
    }
    await this.clipboardService.writeText(JSON.stringify(userFriendlyKeybinding, null, "  "));
  }
  async copyKeybindingCommand(keybinding) {
    this.selectEntry(keybinding);
    await this.clipboardService.writeText(keybinding.keybindingItem.command);
  }
  async copyKeybindingCommandTitle(keybinding) {
    this.selectEntry(keybinding);
    await this.clipboardService.writeText(keybinding.keybindingItem.commandLabel);
  }
  focusSearch() {
    this.searchWidget.focus();
  }
  search(filter) {
    this.focusSearch();
    this.searchWidget.setValue(filter);
    this.selectEntry(0);
  }
  clearSearchResults() {
    this.searchWidget.clear();
    this.searchHasValueContextKey.set(false);
  }
  showSimilarKeybindings(keybindingEntry) {
    const value = `"${keybindingEntry.keybindingItem.keybinding.getAriaLabel()}"`;
    if (value !== this.searchWidget.getValue()) {
      this.searchWidget.setValue(value);
    }
  }
  createAriaLabelElement(parent) {
    this.ariaLabelElement = DOM.append(parent, DOM.$(""));
    this.ariaLabelElement.setAttribute("id", "keybindings-editor-aria-label-element");
    this.ariaLabelElement.setAttribute("aria-live", "assertive");
    this.ariaLabelElement.style.position = "absolute";
    this.ariaLabelElement.style.width = "1px";
    this.ariaLabelElement.style.height = "1px";
    this.ariaLabelElement.style.overflow = "hidden";
    this.ariaLabelElement.style.clip = "rect(1px, 1px, 1px, 1px)";
    this.ariaLabelElement.style.clipPath = "inset(50%)";
    this.ariaLabelElement.style.whiteSpace = "nowrap";
  }
  createOverlayContainer(parent) {
    this.overlayContainer = DOM.append(parent, $(".overlay-container"));
    this.overlayContainer.style.position = "absolute";
    this.overlayContainer.style.zIndex = "40";
    this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
    this._register(this.defineKeybindingWidget.onDidChange((keybindingStr) => this.defineKeybindingWidget.printExisting(this.keybindingsEditorModel.fetch(`"${keybindingStr}"`).length)));
    this._register(this.defineKeybindingWidget.onShowExistingKeybidings((keybindingStr) => this.searchWidget.setValue(`"${keybindingStr}"`)));
    this.hideOverlayContainer();
  }
  showOverlayContainer() {
    this.overlayContainer.style.display = "block";
  }
  hideOverlayContainer() {
    this.overlayContainer.style.display = "none";
  }
  createHeader(parent) {
    this.headerContainer = DOM.append(parent, $(".keybindings-header"));
    const fullTextSearchPlaceholder = localize("SearchKeybindings.FullTextSearchPlaceholder", "Type to search in keybindings");
    const keybindingsSearchPlaceholder = localize("SearchKeybindings.KeybindingsSearchPlaceholder", "Recording Keys. Press Escape to exit");
    const clearInputAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize("clearInput", "Clear Keybindings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults()));
    const searchContainer = DOM.append(this.headerContainer, $(".search-container"));
    this.searchWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, searchContainer, {
      ariaLabel: fullTextSearchPlaceholder,
      placeholder: fullTextSearchPlaceholder,
      focusKey: this.searchFocusContextKey,
      ariaLabelledBy: "keybindings-editor-aria-label-element",
      recordEnter: true,
      quoteRecordedKeys: true,
      history: new Set(this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory ?? []),
      inputBoxStyles: getInputBoxStyle({
        inputBorder: settingsTextInputBorder
      })
    }));
    this._register(this.searchWidget.onDidChange((searchValue) => {
      const hasValue = !!searchValue;
      clearInputAction.enabled = hasValue;
      this.searchHasValueContextKey.set(hasValue);
      this.delayedFiltering.trigger(() => this.filterKeybindings());
      this.updateSearchOptions();
    }));
    this._register(this.searchWidget.onEscape(() => this.recordKeysAction.checked = false));
    this.actionsContainer = DOM.append(searchContainer, DOM.$(".keybindings-search-actions-container"));
    const recordingBadge = this.createRecordingBadge(this.actionsContainer);
    this._register(this.sortByPrecedenceAction.onDidChange((e) => {
      if (e.checked !== void 0) {
        this.renderKeybindingsEntries(false);
      }
      this.updateSearchOptions();
    }));
    this._register(this.recordKeysAction.onDidChange((e) => {
      if (e.checked !== void 0) {
        recordingBadge.classList.toggle("disabled", !e.checked);
        if (e.checked) {
          this.searchWidget.inputBox.setPlaceHolder(keybindingsSearchPlaceholder);
          this.searchWidget.inputBox.setAriaLabel(keybindingsSearchPlaceholder);
          this.searchWidget.startRecordingKeys();
          this.searchWidget.focus();
        } else {
          this.searchWidget.inputBox.setPlaceHolder(fullTextSearchPlaceholder);
          this.searchWidget.inputBox.setAriaLabel(fullTextSearchPlaceholder);
          this.searchWidget.stopRecordingKeys();
          this.searchWidget.focus();
        }
        this.updateSearchOptions();
      }
    }));
    const actions = [this.recordKeysAction, this.sortByPrecedenceAction, clearInputAction];
    const toolBar = this._register(new ToolBar(this.actionsContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this.sortByPrecedenceAction.id || action.id === this.recordKeysAction.id) {
          return new ToggleActionViewItem(null, action, { ...options, keybinding: this.keybindingsService.lookupKeybinding(action.id)?.getLabel(), toggleStyles: defaultToggleStyles });
        }
        return void 0;
      },
      getKeyBinding: (action) => this.keybindingsService.lookupKeybinding(action.id)
    }));
    toolBar.setActions(actions);
    this._register(this.keybindingsService.onDidUpdateKeybindings(() => toolBar.setActions(actions)));
  }
  updateSearchOptions() {
    const keybindingsEditorInput = this.input;
    if (keybindingsEditorInput) {
      keybindingsEditorInput.searchOptions = {
        searchValue: this.searchWidget.getValue(),
        recordKeybindings: !!this.recordKeysAction.checked,
        sortByPrecedence: !!this.sortByPrecedenceAction.checked
      };
    }
  }
  createRecordingBadge(container) {
    const recordingBadge = DOM.append(container, DOM.$(".recording-badge.monaco-count-badge.long.disabled"));
    recordingBadge.textContent = localize("recording", "Recording Keys");
    recordingBadge.style.backgroundColor = asCssVariable(badgeBackground);
    recordingBadge.style.color = asCssVariable(badgeForeground);
    recordingBadge.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    return recordingBadge;
  }
  layoutSearchWidget(dimension) {
    this.searchWidget.layout(dimension);
    this.headerContainer.classList.toggle("small", dimension.width < 400);
    this.searchWidget.inputBox.inputElement.style.paddingRight = `${DOM.getTotalWidth(this.actionsContainer) + 12}px`;
  }
  createBody(parent) {
    const bodyContainer = DOM.append(parent, $(".keybindings-body"));
    this.createTable(bodyContainer);
  }
  createTable(parent) {
    this.keybindingsTableContainer = DOM.append(parent, $(".keybindings-table-container"));
    this.keybindingsTable = this._register(this.instantiationService.createInstance(
      WorkbenchTable,
      "KeybindingsEditor",
      this.keybindingsTableContainer,
      new Delegate(),
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: 40,
          maximumWidth: 40,
          templateId: ActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("command", "Command"),
          tooltip: "",
          weight: 0.3,
          templateId: CommandColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("keybinding", "Keybinding"),
          tooltip: "",
          weight: 0.2,
          templateId: KeybindingColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("when", "When"),
          tooltip: "",
          weight: 0.35,
          templateId: WhenColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("source", "Source"),
          tooltip: "",
          weight: 0.15,
          templateId: SourceColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(ActionsColumnRenderer, this),
        this.instantiationService.createInstance(CommandColumnRenderer),
        this.instantiationService.createInstance(KeybindingColumnRenderer),
        this.instantiationService.createInstance(WhenColumnRenderer, this),
        this.instantiationService.createInstance(SourceColumnRenderer)
      ],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        accessibilityProvider: new AccessibilityProvider(this.configurationService),
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.keybindingItem.commandLabel || e.keybindingItem.command },
        overrideStyles: {
          listBackground: editorBackground
        },
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        openOnSingleClick: false,
        transformOptimization: false
        // disable transform optimization as it causes the editor overflow widgets to be mispositioned
      }
    ));
    this._register(this.keybindingsTable.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.keybindingsTable.onDidChangeFocus((e) => this.onFocusChange()));
    this._register(this.keybindingsTable.onDidFocus(() => {
      this.keybindingsTable.getHTMLElement().classList.add("focused");
      this.onFocusChange();
    }));
    this._register(this.keybindingsTable.onDidBlur(() => {
      this.keybindingsTable.getHTMLElement().classList.remove("focused");
      this.keybindingFocusContextKey.reset();
    }));
    this._register(this.keybindingsTable.onDidOpen((e) => {
      if (e.browserEvent?.defaultPrevented) {
        return;
      }
      const activeKeybindingEntry = this.activeKeybindingEntry;
      if (activeKeybindingEntry) {
        this.defineKeybinding(activeKeybindingEntry, false);
      }
    }));
    DOM.append(this.keybindingsTableContainer, this.overflowWidgetsDomNode);
  }
  async render(preserveFocus) {
    if (this.input) {
      const input = this.input;
      this.keybindingsEditorModel = await input.resolve();
      await this.keybindingsEditorModel.resolve(this.getActionsLabels());
      this.renderKeybindingsEntries(false, preserveFocus);
      if (input.searchOptions) {
        this.recordKeysAction.checked = input.searchOptions.recordKeybindings;
        this.sortByPrecedenceAction.checked = input.searchOptions.sortByPrecedence;
        this.searchWidget.setValue(input.searchOptions.searchValue);
      } else {
        this.updateSearchOptions();
      }
    }
  }
  getActionsLabels() {
    const actionsLabels = /* @__PURE__ */ new Map();
    for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
      actionsLabels.set(editorAction.id, editorAction.label);
    }
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
      if (isIMenuItem(menuItem)) {
        const title = typeof menuItem.command.title === "string" ? menuItem.command.title : menuItem.command.title.value;
        const category = menuItem.command.category ? typeof menuItem.command.category === "string" ? menuItem.command.category : menuItem.command.category.value : void 0;
        actionsLabels.set(menuItem.command.id, category ? `${category}: ${title}` : title);
      }
    }
    return actionsLabels;
  }
  filterKeybindings() {
    this.renderKeybindingsEntries(this.searchWidget.hasFocus());
    this.searchHistoryDelayer.trigger(() => {
      this.searchWidget.inputBox.addToHistory();
      this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory = this.searchWidget.inputBox.getHistory();
      this.saveState();
    });
  }
  clearKeyboardShortcutSearchHistory() {
    this.searchWidget.inputBox.clearHistory();
    this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory = this.searchWidget.inputBox.getHistory();
    this.saveState();
  }
  renderKeybindingsEntries(reset, preserveFocus) {
    if (this.keybindingsEditorModel) {
      const filter = this.searchWidget.getValue();
      const keybindingsEntries = this.keybindingsEditorModel.fetch(filter, this.sortByPrecedenceAction.checked);
      const ariaLabel = this.getAriaLabel(keybindingsEntries);
      this.accessibilityService.alert(ariaLabel);
      this.ariaLabelElement.textContent = ariaLabel;
      if (keybindingsEntries.length === 0) {
        this.latestEmptyFilters.push(filter);
      }
      const currentSelectedIndex = this.keybindingsTable.getSelection()[0];
      this.tableEntries = keybindingsEntries;
      this.keybindingsTable.splice(0, this.keybindingsTable.length, this.tableEntries);
      this.layoutKeybindingsTable();
      if (reset) {
        this.keybindingsTable.setSelection([]);
        this.keybindingsTable.setFocus([]);
      } else {
        if (this.unAssignedKeybindingItemToRevealAndFocus) {
          const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToRevealAndFocus);
          if (index !== -1) {
            this.keybindingsTable.reveal(index, 0.2);
            this.selectEntry(index);
          }
          this.unAssignedKeybindingItemToRevealAndFocus = null;
        } else if (currentSelectedIndex !== -1 && currentSelectedIndex < this.tableEntries.length) {
          this.selectEntry(currentSelectedIndex, preserveFocus);
        } else if (this.editorService.activeEditorPane === this && !preserveFocus) {
          this.focus();
        }
      }
    }
  }
  getAriaLabel(keybindingsEntries) {
    let label;
    if (this.sortByPrecedenceAction.checked) {
      label = localize("show sorted keybindings", "Showing {0} Keybindings in precedence order", keybindingsEntries.length);
    } else {
      label = localize("show keybindings", "Showing {0} Keybindings in alphabetical order", keybindingsEntries.length);
    }
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.KeybindingsEditor)) {
      const kb = this.keybindingsService.lookupKeybinding("widgetNavigation.focusNext")?.getAriaLabel();
      if (kb) {
        label += ". " + localize("navigateToResults", "Use {0} to navigate to the results table.", kb);
      }
    }
    return label;
  }
  layoutKeybindingsTable() {
    if (!this.dimension) {
      return;
    }
    const tableHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12);
    this.keybindingsTableContainer.style.height = `${tableHeight}px`;
    this.keybindingsTable.layout(tableHeight);
  }
  getIndexOf(listEntry) {
    const index = this.tableEntries.indexOf(listEntry);
    if (index === -1) {
      for (let i = 0; i < this.tableEntries.length; i++) {
        if (this.tableEntries[i].id === listEntry.id) {
          return i;
        }
      }
    }
    return index;
  }
  getNewIndexOfUnassignedKeybinding(unassignedKeybinding) {
    for (let index = 0; index < this.tableEntries.length; index++) {
      const entry = this.tableEntries[index];
      if (entry.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
        const keybindingItemEntry = entry;
        if (keybindingItemEntry.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
          return index;
        }
      }
    }
    return -1;
  }
  selectEntry(keybindingItemEntry, focus = true) {
    const index = typeof keybindingItemEntry === "number" ? keybindingItemEntry : this.getIndexOf(keybindingItemEntry);
    if (index !== -1 && index < this.keybindingsTable.length) {
      if (focus) {
        this.keybindingsTable.domFocus();
        this.keybindingsTable.setFocus([index]);
      }
      this.keybindingsTable.setSelection([index]);
    }
  }
  focusKeybindings() {
    this.keybindingsTable.domFocus();
    const currentFocusIndices = this.keybindingsTable.getFocus();
    this.keybindingsTable.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
  }
  selectKeybinding(keybindingItemEntry) {
    this.selectEntry(keybindingItemEntry);
  }
  recordSearchKeys() {
    this.recordKeysAction.checked = true;
  }
  toggleSortByPrecedence() {
    this.sortByPrecedenceAction.checked = !this.sortByPrecedenceAction.checked;
  }
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      const keybindingItemEntry = e.element;
      this.selectEntry(keybindingItemEntry);
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => [
          this.createCopyAction(keybindingItemEntry),
          this.createCopyCommandAction(keybindingItemEntry),
          this.createCopyCommandTitleAction(keybindingItemEntry),
          new Separator(),
          ...keybindingItemEntry.keybindingItem.keybinding ? [this.createDefineKeybindingAction(keybindingItemEntry), this.createAddKeybindingAction(keybindingItemEntry)] : [this.createDefineKeybindingAction(keybindingItemEntry)],
          new Separator(),
          this.createRemoveAction(keybindingItemEntry),
          this.createResetAction(keybindingItemEntry),
          new Separator(),
          this.createDefineWhenExpressionAction(keybindingItemEntry),
          new Separator(),
          this.createShowConflictsAction(keybindingItemEntry)
        ]
      });
    }
  }
  onFocusChange() {
    this.keybindingFocusContextKey.reset();
    const element = this.keybindingsTable.getFocusedElements()[0];
    if (!element) {
      return;
    }
    if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      this.keybindingFocusContextKey.set(true);
    }
  }
  createDefineKeybindingAction(keybindingItemEntry) {
    return {
      label: keybindingItemEntry.keybindingItem.keybinding ? localize("changeLabel", "Change Keybinding...") : localize("addLabel", "Add Keybinding..."),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
      run: () => this.defineKeybinding(keybindingItemEntry, false)
    };
  }
  createAddKeybindingAction(keybindingItemEntry) {
    return {
      label: localize("addLabel", "Add Keybinding..."),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_ADD,
      run: () => this.defineKeybinding(keybindingItemEntry, true)
    };
  }
  createDefineWhenExpressionAction(keybindingItemEntry) {
    return {
      label: localize("editWhen", "Change When Expression"),
      enabled: !!keybindingItemEntry.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
      run: () => this.defineWhenExpression(keybindingItemEntry)
    };
  }
  createRemoveAction(keybindingItem) {
    return {
      label: localize("removeLabel", "Remove Keybinding"),
      enabled: !!keybindingItem.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
      run: () => this.removeKeybinding(keybindingItem)
    };
  }
  createResetAction(keybindingItem) {
    return {
      label: localize("resetLabel", "Reset Keybinding"),
      enabled: !keybindingItem.keybindingItem.keybindingItem.isDefault,
      id: KEYBINDINGS_EDITOR_COMMAND_RESET,
      run: () => this.resetKeybinding(keybindingItem)
    };
  }
  createShowConflictsAction(keybindingItem) {
    return {
      label: localize("showSameKeybindings", "Show Same Keybindings"),
      enabled: !!keybindingItem.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
      run: () => this.showSimilarKeybindings(keybindingItem)
    };
  }
  createCopyAction(keybindingItem) {
    return {
      label: localize("copyLabel", "Copy"),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY,
      run: () => this.copyKeybinding(keybindingItem)
    };
  }
  createCopyCommandAction(keybinding) {
    return {
      label: localize("copyCommandLabel", "Copy Command ID"),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
      run: () => this.copyKeybindingCommand(keybinding)
    };
  }
  createCopyCommandTitleAction(keybinding) {
    return {
      label: localize("copyCommandTitleLabel", "Copy Command Title"),
      enabled: !!keybinding.keybindingItem.commandLabel,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
      run: () => this.copyKeybindingCommandTitle(keybinding)
    };
  }
  onKeybindingEditingError(error) {
    this.notificationService.error(typeof error === "string" ? error : localize("error", "Error '{0}' while editing the keybinding. Please open 'keybindings.json' file and check for errors.", `${error}`));
  }
};
KeybindingsEditor.ID = "workbench.editor.keybindings";
KeybindingsEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingEditingService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IAccessibilityService)
], KeybindingsEditor);
class Delegate {
  constructor() {
    this.headerRowHeight = 30;
  }
  getHeight(element) {
    if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      const commandIdMatched = element.keybindingItem.commandLabel && element.commandIdMatches;
      const commandDefaultLabelMatched = !!element.commandDefaultLabelMatches;
      const extensionIdMatched = !!element.extensionIdMatches;
      if (commandIdMatched && commandDefaultLabelMatched) {
        return 60;
      }
      if (extensionIdMatched || commandIdMatched || commandDefaultLabelMatched) {
        return 40;
      }
    }
    return 24;
  }
}
let ActionsColumnRenderer = class {
  constructor(keybindingsEditor, keybindingsService) {
    this.keybindingsEditor = keybindingsEditor;
    this.keybindingsService = keybindingsService;
    this.templateId = ActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".actions"));
    const actionBar = new ActionBar(element);
    return { actionBar };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.actionBar.clear();
    const actions = [];
    if (keybindingItemEntry.keybindingItem.keybinding) {
      actions.push(this.createEditAction(keybindingItemEntry));
    } else {
      actions.push(this.createAddAction(keybindingItemEntry));
    }
    templateData.actionBar.push(actions, { icon: true });
  }
  createEditAction(keybindingItemEntry) {
    return {
      class: ThemeIcon.asClassName(keybindingsEditIcon),
      enabled: true,
      id: "editKeybinding",
      tooltip: this.keybindingsService.appendKeybinding(localize("editKeybindingLabel", "Change Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
      run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
    };
  }
  createAddAction(keybindingItemEntry) {
    return {
      class: ThemeIcon.asClassName(keybindingsAddIcon),
      enabled: true,
      id: "addKeybinding",
      tooltip: this.keybindingsService.appendKeybinding(localize("addKeybindingLabel", "Add Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
      run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
    };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
ActionsColumnRenderer.TEMPLATE_ID = "actions";
ActionsColumnRenderer = __decorateClass([
  __decorateParam(1, IKeybindingService)
], ActionsColumnRenderer);
let CommandColumnRenderer = class {
  constructor(_hoverService) {
    this._hoverService = _hoverService;
    this.templateId = CommandColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const commandColumn = DOM.append(container, $(".command"));
    const commandColumnHover = this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), commandColumn, "");
    const commandLabelContainer = DOM.append(commandColumn, $(".command-label"));
    const commandLabel = new HighlightedLabel(commandLabelContainer);
    const commandDefaultLabelContainer = DOM.append(commandColumn, $(".command-default-label"));
    const commandDefaultLabel = new HighlightedLabel(commandDefaultLabelContainer);
    const commandIdLabelContainer = DOM.append(commandColumn, $(".command-id.code"));
    const commandIdLabel = new HighlightedLabel(commandIdLabelContainer);
    return { commandColumn, commandColumnHover, commandLabelContainer, commandLabel, commandDefaultLabelContainer, commandDefaultLabel, commandIdLabelContainer, commandIdLabel };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    const keybindingItem = keybindingItemEntry.keybindingItem;
    const commandIdMatched = !!(keybindingItem.commandLabel && keybindingItemEntry.commandIdMatches);
    const commandDefaultLabelMatched = !!keybindingItemEntry.commandDefaultLabelMatches;
    templateData.commandColumn.classList.toggle("vertical-align-column", commandIdMatched || commandDefaultLabelMatched);
    const title = keybindingItem.commandLabel ? localize("title", "{0} ({1})", keybindingItem.commandLabel, keybindingItem.command) : keybindingItem.command;
    templateData.commandColumn.setAttribute("aria-label", title);
    templateData.commandColumnHover.update(title);
    if (keybindingItem.commandLabel) {
      templateData.commandLabelContainer.classList.remove("hide");
      templateData.commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
    } else {
      templateData.commandLabelContainer.classList.add("hide");
      templateData.commandLabel.set(void 0);
    }
    if (keybindingItemEntry.commandDefaultLabelMatches) {
      templateData.commandDefaultLabelContainer.classList.remove("hide");
      templateData.commandDefaultLabel.set(keybindingItem.commandDefaultLabel, keybindingItemEntry.commandDefaultLabelMatches);
    } else {
      templateData.commandDefaultLabelContainer.classList.add("hide");
      templateData.commandDefaultLabel.set(void 0);
    }
    if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
      templateData.commandIdLabelContainer.classList.remove("hide");
      templateData.commandIdLabel.set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
    } else {
      templateData.commandIdLabelContainer.classList.add("hide");
      templateData.commandIdLabel.set(void 0);
    }
  }
  disposeTemplate(templateData) {
    templateData.commandColumnHover.dispose();
    templateData.commandDefaultLabel.dispose();
    templateData.commandIdLabel.dispose();
    templateData.commandLabel.dispose();
  }
};
CommandColumnRenderer.TEMPLATE_ID = "commands";
CommandColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], CommandColumnRenderer);
const _KeybindingColumnRenderer = class _KeybindingColumnRenderer {
  constructor() {
    this.templateId = _KeybindingColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".keybinding"));
    const keybindingLabel = new KeybindingLabel(DOM.append(element, $("div.keybinding-label")), OS, defaultKeybindingLabelStyles);
    return { keybindingLabel };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    if (keybindingItemEntry.keybindingItem.keybinding) {
      templateData.keybindingLabel.set(keybindingItemEntry.keybindingItem.keybinding, keybindingItemEntry.keybindingMatches);
    } else {
      templateData.keybindingLabel.set(void 0, void 0);
    }
  }
  disposeTemplate(templateData) {
    templateData.keybindingLabel.dispose();
  }
};
_KeybindingColumnRenderer.TEMPLATE_ID = "keybindings";
let KeybindingColumnRenderer = _KeybindingColumnRenderer;
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, DOM.finalHandler(callback)));
  disposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
let SourceColumnRenderer = class {
  constructor(extensionsWorkbenchService, hoverService) {
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hoverService = hoverService;
    this.templateId = SourceColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const sourceColumn = DOM.append(container, $(".source"));
    const sourceColumnHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), sourceColumn, "");
    const sourceLabel = new HighlightedLabel(DOM.append(sourceColumn, $(".source-label")));
    const extensionContainer = DOM.append(sourceColumn, $(".extension-container"));
    const extensionLabel = DOM.append(extensionContainer, $("a.extension-label", { tabindex: 0 }));
    const extensionId = new HighlightedLabel(DOM.append(extensionContainer, $(".extension-id-container.code")));
    return { sourceColumn, sourceColumnHover, sourceLabel, extensionLabel, extensionContainer, extensionId, disposables: new DisposableStore() };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.disposables.clear();
    if (isString(keybindingItemEntry.keybindingItem.source)) {
      templateData.extensionContainer.classList.add("hide");
      templateData.sourceLabel.element.classList.remove("hide");
      templateData.sourceColumnHover.update("");
      templateData.sourceLabel.set(keybindingItemEntry.keybindingItem.source || "-", keybindingItemEntry.sourceMatches);
    } else {
      templateData.extensionContainer.classList.remove("hide");
      templateData.sourceLabel.element.classList.add("hide");
      const extension = keybindingItemEntry.keybindingItem.source;
      const extensionLabel = extension.displayName ?? extension.identifier.value;
      templateData.sourceColumnHover.update(localize("extension label", "Extension ({0})", extensionLabel));
      templateData.extensionLabel.textContent = extensionLabel;
      templateData.disposables.add(onClick(templateData.extensionLabel, () => {
        this.extensionsWorkbenchService.open(extension.identifier.value);
      }));
      if (keybindingItemEntry.extensionIdMatches) {
        templateData.extensionId.element.classList.remove("hide");
        templateData.extensionId.set(extension.identifier.value, keybindingItemEntry.extensionIdMatches);
      } else {
        templateData.extensionId.element.classList.add("hide");
        templateData.extensionId.set(void 0);
      }
    }
  }
  disposeTemplate(templateData) {
    templateData.sourceColumnHover.dispose();
    templateData.disposables.dispose();
    templateData.sourceLabel.dispose();
    templateData.extensionId.dispose();
  }
};
SourceColumnRenderer.TEMPLATE_ID = "source";
SourceColumnRenderer = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IHoverService)
], SourceColumnRenderer);
let WhenInputWidget = class extends Disposable {
  constructor(parent, keybindingsEditor, instantiationService, contextKeyService) {
    super();
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._onDidReject = this._register(new Emitter());
    this.onDidReject = this._onDidReject.event;
    const focusContextKey = CONTEXT_WHEN_FOCUS.bindTo(contextKeyService);
    this.input = this._register(instantiationService.createInstance(SuggestEnabledInput, "keyboardshortcutseditor#wheninput", parent, {
      provideResults: () => {
        const result = [];
        for (const contextKey of RawContextKey.all()) {
          result.push({ label: contextKey.key, documentation: contextKey.description, detail: contextKey.type, kind: CompletionItemKind.Constant });
        }
        return result;
      },
      triggerCharacters: ["!", " "],
      wordDefinition: /[a-zA-Z.]+/,
      alwaysShowSuggestions: true
    }, "", `keyboardshortcutseditor#wheninput`, { focusContextKey, overflowWidgetsDomNode: keybindingsEditor.overflowWidgetsDomNode }));
    this._register(DOM.addDisposableListener(this.input.element, DOM.EventType.DBLCLICK, (e) => DOM.EventHelper.stop(e)));
    this._register(toDisposable(() => focusContextKey.reset()));
    this._register(keybindingsEditor.onAcceptWhenExpression(() => this._onDidAccept.fire(this.input.getValue())));
    this._register(Event.any(keybindingsEditor.onRejectWhenExpression, this.input.onDidBlur)(() => this._onDidReject.fire()));
  }
  layout(dimension) {
    this.input.layout(dimension);
  }
  show(value) {
    this.input.setValue(value);
    this.input.focus(true);
  }
};
WhenInputWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService)
], WhenInputWidget);
let WhenColumnRenderer = class {
  constructor(keybindingsEditor, hoverService, instantiationService) {
    this.keybindingsEditor = keybindingsEditor;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.templateId = WhenColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".when"));
    const whenLabelContainer = DOM.append(element, $("div.when-label"));
    const whenLabel = new HighlightedLabel(whenLabelContainer);
    const whenInputContainer = DOM.append(element, $("div.when-input-container"));
    return {
      element,
      whenLabelContainer,
      whenLabel,
      whenInputContainer,
      disposables: new DisposableStore()
    };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.disposables.clear();
    const whenInputDisposables = templateData.disposables.add(new DisposableStore());
    templateData.disposables.add(this.keybindingsEditor.onDefineWhenExpression((e) => {
      if (keybindingItemEntry === e) {
        templateData.element.classList.add("input-mode");
        const inputWidget = whenInputDisposables.add(this.instantiationService.createInstance(WhenInputWidget, templateData.whenInputContainer, this.keybindingsEditor));
        inputWidget.layout(new DOM.Dimension(templateData.element.parentElement.clientWidth, 18));
        inputWidget.show(keybindingItemEntry.keybindingItem.when || "");
        const hideInputWidget = () => {
          whenInputDisposables.clear();
          templateData.element.classList.remove("input-mode");
          templateData.element.parentElement.style.paddingLeft = "10px";
          DOM.clearNode(templateData.whenInputContainer);
        };
        whenInputDisposables.add(inputWidget.onDidAccept((value) => {
          hideInputWidget();
          this.keybindingsEditor.updateKeybinding(keybindingItemEntry, keybindingItemEntry.keybindingItem.keybinding ? keybindingItemEntry.keybindingItem.keybinding.getUserSettingsLabel() || "" : "", value);
          this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
        }));
        whenInputDisposables.add(inputWidget.onDidReject(() => {
          hideInputWidget();
          this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
        }));
        templateData.element.parentElement.style.paddingLeft = "0px";
      }
    }));
    templateData.whenLabelContainer.classList.toggle("code", !!keybindingItemEntry.keybindingItem.when);
    templateData.whenLabelContainer.classList.toggle("empty", !keybindingItemEntry.keybindingItem.when);
    if (keybindingItemEntry.keybindingItem.when) {
      templateData.whenLabel.set(keybindingItemEntry.keybindingItem.when, keybindingItemEntry.whenMatches, keybindingItemEntry.keybindingItem.when);
      templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), templateData.element, keybindingItemEntry.keybindingItem.when));
    } else {
      templateData.whenLabel.set("-");
    }
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.whenLabel.dispose();
  }
};
WhenColumnRenderer.TEMPLATE_ID = "when";
WhenColumnRenderer = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IInstantiationService)
], WhenColumnRenderer);
class AccessibilityProvider {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getWidgetAriaLabel() {
    return localize("keybindingsLabel", "Keybindings");
  }
  getAriaLabel({ keybindingItem }) {
    const ariaLabel = [
      keybindingItem.commandLabel ? keybindingItem.commandLabel : keybindingItem.command,
      keybindingItem.keybinding?.getAriaLabel() || localize("noKeybinding", "No keybinding assigned"),
      keybindingItem.when ? keybindingItem.when : localize("noWhen", "No when context"),
      isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.description ?? keybindingItem.source.identifier.value
    ];
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.KeybindingsEditor)) {
      const kbEditorAriaLabel = localize("keyboard shortcuts aria label", "use space or enter to change the keybinding.");
      ariaLabel.push(kbEditorAriaLabel);
    }
    return ariaLabel.join(", ");
  }
}
registerColor("keybindingTable.headerBackground", tableOddRowsBackgroundColor, "Background color for the keyboard shortcuts table header.");
registerColor("keybindingTable.rowsBackground", tableOddRowsBackgroundColor, "Background color for the keyboard shortcuts table alternating rows.");
registerThemingParticipant((theme, collector) => {
  const foregroundColor = theme.getColor(foreground);
  if (foregroundColor) {
    const whenForegroundColor = foregroundColor.transparent(0.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
  const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
  if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
    const whenForegroundColor = listActiveSelectionForegroundColor.transparent(0.8).makeOpaque(listActiveSelectionBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
  const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
  if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
    const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(0.8).makeOpaque(listInactiveSelectionBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listFocusForegroundColor = theme.getColor(listFocusForeground);
  const listFocusBackgroundColor = theme.getColor(listFocusBackground);
  if (listFocusForegroundColor && listFocusBackgroundColor) {
    const whenForegroundColor = listFocusForegroundColor.transparent(0.8).makeOpaque(listFocusBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.focused .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listHoverForegroundColor = theme.getColor(listHoverForeground);
  const listHoverBackgroundColor = theme.getColor(listHoverBackground);
  if (listHoverForegroundColor && listHoverBackgroundColor) {
    const whenForegroundColor = listHoverForegroundColor.transparent(0.8).makeOpaque(listHoverBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row:hover:not(.focused):not(.selected) .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
});
export {
  KeybindingsEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5YmluZGluZ3NFZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuLyogZXNsaW50LWRpc2FibGUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zICovXG5cbmltcG9ydCAnLi9tZWRpYS9rZXliaW5kaW5nc0VkaXRvci5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGlzSU9TLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUb2dnbGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIEFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NFZGl0b3JNb2RlbCwgS0VZQklORElOR19FTlRSWV9URU1QTEFURV9JRCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5YmluZGluZ3NFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSwgSVVzZXJGcmllbmRseUtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IERlZmluZUtleWJpbmRpbmdXaWRnZXQsIEtleWJpbmRpbmdzU2VhcmNoV2lkZ2V0IH0gZnJvbSAnLi9rZXliaW5kaW5nV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMsIENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9GT0NVUywgQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfSEFTX1ZBTFVFLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRUNPUkRfU0VBUkNIX0tFWVMsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NPUlRCWV9QUkVDRURFTkNFLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9ERUZJTkUsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFTU9WRSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVTRVQsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFksIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ0xFQVJfU0VBUkNIX1JFU1VMVFMsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORV9XSEVOLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9TSE9XX1NJTUlMQVIsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0FERCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5EX1RJVExFLCBDT05URVhUX1dIRU5fRk9DVVMgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdFZGl0aW5nLmpzJztcbmltcG9ydCB7IElMaXN0Q29udGV4dE1lbnVFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQsIElDb2xvclRoZW1lLCBJQ3NzU3R5bGVDb2xsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgYmFkZ2VCYWNrZ3JvdW5kLCBjb250cmFzdEJvcmRlciwgYmFkZ2VGb3JlZ3JvdW5kLCBsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZCwgbGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZCwgbGlzdEhvdmVyRm9yZWdyb3VuZCwgbGlzdEZvY3VzRm9yZWdyb3VuZCwgZWRpdG9yQmFja2dyb3VuZCwgZm9yZWdyb3VuZCwgbGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQsIGxpc3RGb2N1c0JhY2tncm91bmQsIGxpc3RIb3ZlckJhY2tncm91bmQsIHJlZ2lzdGVyQ29sb3IsIHRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvciwgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCwgaXNJTWVudUl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBXT1JLQkVOQ0hfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ0l0ZW1FbnRyeSwgSUtleWJpbmRpbmdzRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBrZXliaW5kaW5nc1JlY29yZEtleXNJY29uLCBrZXliaW5kaW5nc1NvcnRJY29uLCBrZXliaW5kaW5nc0FkZEljb24sIHByZWZlcmVuY2VzQ2xlYXJJbnB1dEljb24sIGtleWJpbmRpbmdzRWRpdEljb24gfSBmcm9tICcuL3ByZWZlcmVuY2VzSWNvbnMuanMnO1xuaW1wb3J0IHsgSVRhYmxlUmVuZGVyZXIsIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcywgZGVmYXVsdFRvZ2dsZVN0eWxlcywgZ2V0SW5wdXRCb3hTdHlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dCB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXIgfSBmcm9tICcuLi9jb21tb24vc2V0dGluZ3NFZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aWRnZXROYXZpZ2F0aW9uQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuaW50ZXJmYWNlIElLZXliaW5kaW5nc0VkaXRvck1lbWVudG8ge1xuXHRzZWFyY2hIaXN0b3J5Pzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nc0VkaXRvciBleHRlbmRzIEVkaXRvclBhbmU8SUtleWJpbmRpbmdzRWRpdG9yTWVtZW50bz4gaW1wbGVtZW50cyBJS2V5YmluZGluZ3NFZGl0b3JQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9ICd3b3JrYmVuY2guZWRpdG9yLmtleWJpbmRpbmdzJztcblxuXHRwcml2YXRlIF9vbkRlZmluZVdoZW5FeHByZXNzaW9uOiBFbWl0dGVyPElLZXliaW5kaW5nSXRlbUVudHJ5PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElLZXliaW5kaW5nSXRlbUVudHJ5PigpKTtcblx0cmVhZG9ubHkgb25EZWZpbmVXaGVuRXhwcmVzc2lvbjogRXZlbnQ8SUtleWJpbmRpbmdJdGVtRW50cnk+ID0gdGhpcy5fb25EZWZpbmVXaGVuRXhwcmVzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIF9vblJlamVjdFdoZW5FeHByZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUtleWJpbmRpbmdJdGVtRW50cnk+KCkpO1xuXHRyZWFkb25seSBvblJlamVjdFdoZW5FeHByZXNzaW9uID0gdGhpcy5fb25SZWplY3RXaGVuRXhwcmVzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIF9vbkFjY2VwdFdoZW5FeHByZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUtleWJpbmRpbmdJdGVtRW50cnk+KCkpO1xuXHRyZWFkb25seSBvbkFjY2VwdFdoZW5FeHByZXNzaW9uID0gdGhpcy5fb25BY2NlcHRXaGVuRXhwcmVzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIF9vbkxheW91dDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkxheW91dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkxheW91dC5ldmVudDtcblxuXHRwcml2YXRlIGtleWJpbmRpbmdzRWRpdG9yTW9kZWw6IEtleWJpbmRpbmdzRWRpdG9yTW9kZWwgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGhlYWRlckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGFjdGlvbnNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWFyY2hXaWRnZXQhOiBLZXliaW5kaW5nc1NlYXJjaFdpZGdldDtcblx0cHJpdmF0ZSBzZWFyY2hIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblxuXHRwcml2YXRlIG92ZXJsYXlDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkZWZpbmVLZXliaW5kaW5nV2lkZ2V0ITogRGVmaW5lS2V5YmluZGluZ1dpZGdldDtcblxuXHRwcml2YXRlIHVuQXNzaWduZWRLZXliaW5kaW5nSXRlbVRvUmV2ZWFsQW5kRm9jdXM6IElLZXliaW5kaW5nSXRlbUVudHJ5IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdGFibGVFbnRyaWVzOiBJS2V5YmluZGluZ0l0ZW1FbnRyeVtdID0gW107XG5cdHByaXZhdGUga2V5YmluZGluZ3NUYWJsZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGtleWJpbmRpbmdzVGFibGUhOiBXb3JrYmVuY2hUYWJsZTxJS2V5YmluZGluZ0l0ZW1FbnRyeT47XG5cblx0cHJpdmF0ZSBkaW1lbnNpb246IERPTS5EaW1lbnNpb24gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBkZWxheWVkRmlsdGVyaW5nOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIGxhdGVzdEVtcHR5RmlsdGVyczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBrZXliaW5kaW5nc0VkaXRvckNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNlYXJjaEZvY3VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2VhcmNoSGFzVmFsdWVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNvcnRCeVByZWNlZGVuY2VBY3Rpb246IEFjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSByZWNvcmRLZXlzQWN0aW9uOiBBY3Rpb247XG5cblx0cHJpdmF0ZSBhcmlhTGFiZWxFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ3NTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nRWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nRWRpdGluZ1NlcnZpY2U6IElLZXliaW5kaW5nRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKEtleWJpbmRpbmdzRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5kZWxheWVkRmlsdGVyaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMzAwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoa2V5YmluZGluZ3NTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4gdGhpcy5yZW5kZXIoISF0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkuZ2V0KCkpKSk7XG5cblx0XHR0aGlzLmtleWJpbmRpbmdzRWRpdG9yQ29udGV4dEtleSA9IENPTlRFWFRfS0VZQklORElOR1NfRURJVE9SLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaEZvY3VzQ29udGV4dEtleSA9IENPTlRFWFRfS0VZQklORElOR1NfU0VBUkNIX0ZPQ1VTLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkgPSBDT05URVhUX0tFWUJJTkRJTkdfRk9DVVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoSGFzVmFsdWVDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfSEFTX1ZBTFVFLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaEhpc3RvcnlEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oNTAwKSk7XG5cblx0XHR0aGlzLnJlY29yZEtleXNBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFQ09SRF9TRUFSQ0hfS0VZUywgbG9jYWxpemUoJ3JlY29yZEtleXNMYWJlbCcsIFwiUmVjb3JkIEtleXNcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShrZXliaW5kaW5nc1JlY29yZEtleXNJY29uKSkpO1xuXHRcdHRoaXMucmVjb3JkS2V5c0FjdGlvbi5jaGVja2VkID0gZmFsc2U7XG5cblx0XHR0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NPUlRCWV9QUkVDRURFTkNFLCBsb2NhbGl6ZSgnc29ydEJ5UHJlY2VkZW5lTGFiZWwnLCBcIlNvcnQgYnkgUHJlY2VkZW5jZSAoSGlnaGVzdCBmaXJzdClcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShrZXliaW5kaW5nc1NvcnRJY29uKSkpO1xuXHRcdHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5jaGVja2VkID0gZmFsc2U7XG5cdFx0dGhpcy5vdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gJCgnLmtleWJpbmRpbmdzLW92ZXJmbG93LXdpZGdldHMtY29udGFpbmVyLm1vbmFjby1lZGl0b3InKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuY3JlYXRlKHBhcmVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ2tleWJpbmRpbmdzRWRpdG9yJyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbdGhpc10sXG5cdFx0XHRmb2N1c05leHRXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzS2V5YmluZGluZ3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZvY3VzUHJldmlvdXNXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLnNlYXJjaFdpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3NFZGl0b3JFbGVtZW50ID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJ2RpdicsIHsgY2xhc3M6ICdrZXliaW5kaW5ncy1lZGl0b3InIH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlQXJpYUxhYmVsRWxlbWVudChrZXliaW5kaW5nc0VkaXRvckVsZW1lbnQpO1xuXHRcdHRoaXMuY3JlYXRlT3ZlcmxheUNvbnRhaW5lcihrZXliaW5kaW5nc0VkaXRvckVsZW1lbnQpO1xuXHRcdHRoaXMuY3JlYXRlSGVhZGVyKGtleWJpbmRpbmdzRWRpdG9yRWxlbWVudCk7XG5cdFx0dGhpcy5jcmVhdGVCb2R5KGtleWJpbmRpbmdzRWRpdG9yRWxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRJbnB1dChpbnB1dDogS2V5YmluZGluZ3NFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5rZXliaW5kaW5nc0VkaXRvckNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHJldHVybiBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLnJlbmRlcighIShvcHRpb25zICYmIG9wdGlvbnMucHJlc2VydmVGb2N1cykpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHRcdHRoaXMua2V5YmluZGluZ3NFZGl0b3JDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5rZXliaW5kaW5nRm9jdXNDb250ZXh0S2V5LnJlc2V0KCk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5sYXlvdXRTZWFyY2hXaWRnZXQoZGltZW5zaW9uKTtcblxuXHRcdHRoaXMub3ZlcmxheUNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGRpbWVuc2lvbi53aWR0aCArICdweCc7XG5cdFx0dGhpcy5vdmVybGF5Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGRpbWVuc2lvbi5oZWlnaHQgKyAncHgnO1xuXHRcdHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldC5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXG5cdFx0dGhpcy5sYXlvdXRLZXliaW5kaW5nc1RhYmxlKCk7XG5cdFx0dGhpcy5fb25MYXlvdXQuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUtleWJpbmRpbmdFbnRyeSA9IHRoaXMuYWN0aXZlS2V5YmluZGluZ0VudHJ5O1xuXHRcdGlmIChhY3RpdmVLZXliaW5kaW5nRW50cnkpIHtcblx0XHRcdHRoaXMuc2VsZWN0RW50cnkoYWN0aXZlS2V5YmluZGluZ0VudHJ5KTtcblx0XHR9IGVsc2UgaWYgKCFpc0lPUykge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYWN0aXZlS2V5YmluZGluZ0VudHJ5KCk6IElLZXliaW5kaW5nSXRlbUVudHJ5IHwgbnVsbCB7XG5cdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSB0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF07XG5cdFx0cmV0dXJuIGZvY3VzZWRFbGVtZW50ICYmIGZvY3VzZWRFbGVtZW50LnRlbXBsYXRlSWQgPT09IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQgPyA8SUtleWJpbmRpbmdJdGVtRW50cnk+Zm9jdXNlZEVsZW1lbnQgOiBudWxsO1xuXHR9XG5cblx0YXN5bmMgZGVmaW5lS2V5YmluZGluZyhrZXliaW5kaW5nRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBhZGQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0dGhpcy5zaG93T3ZlcmxheUNvbnRhaW5lcigpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBrZXkgPSBhd2FpdCB0aGlzLmRlZmluZUtleWJpbmRpbmdXaWRnZXQuZGVmaW5lKCk7XG5cdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlS2V5YmluZGluZyhrZXliaW5kaW5nRW50cnksIGtleSwga2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4sIGFkZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMub25LZXliaW5kaW5nRWRpdGluZ0Vycm9yKGVycm9yKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5oaWRlT3ZlcmxheUNvbnRhaW5lcigpO1xuXHRcdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdGRlZmluZVdoZW5FeHByZXNzaW9uKGtleWJpbmRpbmdFbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiB2b2lkIHtcblx0XHRpZiAoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZ0VudHJ5KTtcblx0XHRcdHRoaXMuX29uRGVmaW5lV2hlbkV4cHJlc3Npb24uZmlyZShrZXliaW5kaW5nRW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdHJlamVjdFdoZW5FeHByZXNzaW9uKGtleWJpbmRpbmdFbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLl9vblJlamVjdFdoZW5FeHByZXNzaW9uLmZpcmUoa2V5YmluZGluZ0VudHJ5KTtcblx0fVxuXG5cdGFjY2VwdFdoZW5FeHByZXNzaW9uKGtleWJpbmRpbmdFbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkFjY2VwdFdoZW5FeHByZXNzaW9uLmZpcmUoa2V5YmluZGluZ0VudHJ5KTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSwga2V5OiBzdHJpbmcsIHdoZW46IHN0cmluZyB8IHVuZGVmaW5lZCwgYWRkPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRLZXkgPSBrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyA/IGtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgOiAnJztcblx0XHRpZiAoY3VycmVudEtleSAhPT0ga2V5IHx8IGtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS53aGVuICE9PSB3aGVuKSB7XG5cdFx0XHRpZiAoYWRkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMua2V5YmluZGluZ0VkaXRpbmdTZXJ2aWNlLmFkZEtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtLCBrZXksIHdoZW4gfHwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMua2V5YmluZGluZ0VkaXRpbmdTZXJ2aWNlLmVkaXRLZXliaW5kaW5nKGtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nSXRlbSwga2V5LCB3aGVuIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nKSB7IC8vIHJldmVhbCBvbmx5IGlmIGtleWJpbmRpbmcgd2FzIGFkZGVkIHRvIHVuYXNzaW5nZWQuIEJlY2F1c2UgdGhlIGVudHJ5IHdpbGwgYmUgcGxhY2VkIGluIGRpZmZlcmVudCBwb3NpdGlvbiBhZnRlciByZW5kZXJpbmdcblx0XHRcdFx0dGhpcy51bkFzc2lnbmVkS2V5YmluZGluZ0l0ZW1Ub1JldmVhbEFuZEZvY3VzID0ga2V5YmluZGluZ0VudHJ5O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbW92ZUtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZ0VudHJ5KTtcblx0XHRpZiAoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHsgLy8gVGhpcyBzaG91bGQgYmUgYSBwcmUtY29uZGl0aW9uXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmtleWJpbmRpbmdFZGl0aW5nU2VydmljZS5yZW1vdmVLZXliaW5kaW5nKGtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nSXRlbSk7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMub25LZXliaW5kaW5nRWRpdGluZ0Vycm9yKGVycm9yKTtcblx0XHRcdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc2V0S2V5YmluZGluZyhrZXliaW5kaW5nRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmtleWJpbmRpbmdFZGl0aW5nU2VydmljZS5yZXNldEtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtKTtcblx0XHRcdGlmICgha2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHsgLy8gcmV2ZWFsIG9ubHkgaWYga2V5YmluZGluZyB3YXMgYWRkZWQgdG8gdW5hc3NpbmdlZC4gQmVjYXVzZSB0aGUgZW50cnkgd2lsbCBiZSBwbGFjZWQgaW4gZGlmZmVyZW50IHBvc2l0aW9uIGFmdGVyIHJlbmRlcmluZ1xuXHRcdFx0XHR0aGlzLnVuQXNzaWduZWRLZXliaW5kaW5nSXRlbVRvUmV2ZWFsQW5kRm9jdXMgPSBrZXliaW5kaW5nRW50cnk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMub25LZXliaW5kaW5nRWRpdGluZ0Vycm9yKGVycm9yKTtcblx0XHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZ0VudHJ5KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb3B5S2V5YmluZGluZyhrZXliaW5kaW5nOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZyk7XG5cdFx0Y29uc3QgdXNlckZyaWVuZGx5S2V5YmluZGluZzogSVVzZXJGcmllbmRseUtleWJpbmRpbmcgPSB7XG5cdFx0XHRrZXk6IGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyA/IGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpIHx8ICcnIDogJycsXG5cdFx0XHRjb21tYW5kOiBrZXliaW5kaW5nLmtleWJpbmRpbmdJdGVtLmNvbW1hbmRcblx0XHR9O1xuXHRcdGlmIChrZXliaW5kaW5nLmtleWJpbmRpbmdJdGVtLndoZW4pIHtcblx0XHRcdHVzZXJGcmllbmRseUtleWJpbmRpbmcud2hlbiA9IGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0ud2hlbjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChKU09OLnN0cmluZ2lmeSh1c2VyRnJpZW5kbHlLZXliaW5kaW5nLCBudWxsLCAnICAnKSk7XG5cdH1cblxuXHRhc3luYyBjb3B5S2V5YmluZGluZ0NvbW1hbmQoa2V5YmluZGluZzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmcpO1xuXHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoa2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS5jb21tYW5kKTtcblx0fVxuXG5cdGFzeW5jIGNvcHlLZXliaW5kaW5nQ29tbWFuZFRpdGxlKGtleWJpbmRpbmc6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nKTtcblx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsKTtcblx0fVxuXG5cdGZvY3VzU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRzZWFyY2goZmlsdGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzU2VhcmNoKCk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoZmlsdGVyKTtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KDApO1xuXHR9XG5cblx0Y2xlYXJTZWFyY2hSZXN1bHRzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmNsZWFyKCk7XG5cdFx0dGhpcy5zZWFyY2hIYXNWYWx1ZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0fVxuXG5cdHNob3dTaW1pbGFyS2V5YmluZGluZ3Moa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gYFwiJHtrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZy5nZXRBcmlhTGFiZWwoKX1cImA7XG5cdFx0aWYgKHZhbHVlICE9PSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBcmlhTGFiZWxFbGVtZW50KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQgPSBET00uYXBwZW5kKHBhcmVudCwgRE9NLiQoJycpKTtcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQuc2V0QXR0cmlidXRlKCdpZCcsICdrZXliaW5kaW5ncy1lZGl0b3ItYXJpYS1sYWJlbC1lbGVtZW50Jyk7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ2Fzc2VydGl2ZScpO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLndpZHRoID0gJzFweCc7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLmhlaWdodCA9ICcxcHgnO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zdHlsZS5jbGlwID0gJ3JlY3QoMXB4LCAxcHgsIDFweCwgMXB4KSc7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLmNsaXBQYXRoID0gJ2luc2V0KDUwJSknO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zdHlsZS53aGl0ZVNwYWNlID0gJ25vd3JhcCc7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU92ZXJsYXlDb250YWluZXIocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMub3ZlcmxheUNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcub3ZlcmxheS1jb250YWluZXInKSk7XG5cdFx0dGhpcy5vdmVybGF5Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0aGlzLm92ZXJsYXlDb250YWluZXIuc3R5bGUuekluZGV4ID0gJzQwJzsgLy8gaGFzIHRvIGdyZWF0ZXIgdGhhbiBzYXNoIHotaW5kZXggd2hpY2ggaXMgMzVcblx0XHR0aGlzLmRlZmluZUtleWJpbmRpbmdXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlZmluZUtleWJpbmRpbmdXaWRnZXQsIHRoaXMub3ZlcmxheUNvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldC5vbkRpZENoYW5nZShrZXliaW5kaW5nU3RyID0+IHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldC5wcmludEV4aXN0aW5nKHRoaXMua2V5YmluZGluZ3NFZGl0b3JNb2RlbCEuZmV0Y2goYFwiJHtrZXliaW5kaW5nU3RyfVwiYCkubGVuZ3RoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldC5vblNob3dFeGlzdGluZ0tleWJpZGluZ3Moa2V5YmluZGluZ1N0ciA9PiB0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShgXCIke2tleWJpbmRpbmdTdHJ9XCJgKSkpO1xuXHRcdHRoaXMuaGlkZU92ZXJsYXlDb250YWluZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd092ZXJsYXlDb250YWluZXIoKSB7XG5cdFx0dGhpcy5vdmVybGF5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlT3ZlcmxheUNvbnRhaW5lcigpIHtcblx0XHR0aGlzLm92ZXJsYXlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSGVhZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcua2V5YmluZGluZ3MtaGVhZGVyJykpO1xuXHRcdGNvbnN0IGZ1bGxUZXh0U2VhcmNoUGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnU2VhcmNoS2V5YmluZGluZ3MuRnVsbFRleHRTZWFyY2hQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2ggaW4ga2V5YmluZGluZ3NcIik7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3NTZWFyY2hQbGFjZWhvbGRlciA9IGxvY2FsaXplKCdTZWFyY2hLZXliaW5kaW5ncy5LZXliaW5kaW5nc1NlYXJjaFBsYWNlaG9sZGVyJywgXCJSZWNvcmRpbmcgS2V5cy4gUHJlc3MgRXNjYXBlIHRvIGV4aXRcIik7XG5cblx0XHRjb25zdCBjbGVhcklucHV0QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUywgbG9jYWxpemUoJ2NsZWFySW5wdXQnLCBcIkNsZWFyIEtleWJpbmRpbmdzIFNlYXJjaCBJbnB1dFwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHByZWZlcmVuY2VzQ2xlYXJJbnB1dEljb24pLCBmYWxzZSwgYXN5bmMgKCkgPT4gdGhpcy5jbGVhclNlYXJjaFJlc3VsdHMoKSkpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnNlYXJjaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzU2VhcmNoV2lkZ2V0LCBzZWFyY2hDb250YWluZXIsIHtcblx0XHRcdGFyaWFMYWJlbDogZnVsbFRleHRTZWFyY2hQbGFjZWhvbGRlcixcblx0XHRcdHBsYWNlaG9sZGVyOiBmdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyLFxuXHRcdFx0Zm9jdXNLZXk6IHRoaXMuc2VhcmNoRm9jdXNDb250ZXh0S2V5LFxuXHRcdFx0YXJpYUxhYmVsbGVkQnk6ICdrZXliaW5kaW5ncy1lZGl0b3ItYXJpYS1sYWJlbC1lbGVtZW50Jyxcblx0XHRcdHJlY29yZEVudGVyOiB0cnVlLFxuXHRcdFx0cXVvdGVSZWNvcmRlZEtleXM6IHRydWUsXG5cdFx0XHRoaXN0b3J5OiBuZXcgU2V0PHN0cmluZz4oKHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKSkuc2VhcmNoSGlzdG9yeSA/PyBbXSksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZ2V0SW5wdXRCb3hTdHlsZSh7XG5cdFx0XHRcdGlucHV0Qm9yZGVyOiBzZXR0aW5nc1RleHRJbnB1dEJvcmRlclxuXHRcdFx0fSlcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25EaWRDaGFuZ2Uoc2VhcmNoVmFsdWUgPT4ge1xuXHRcdFx0Y29uc3QgaGFzVmFsdWUgPSAhIXNlYXJjaFZhbHVlO1xuXHRcdFx0Y2xlYXJJbnB1dEFjdGlvbi5lbmFibGVkID0gaGFzVmFsdWU7XG5cdFx0XHR0aGlzLnNlYXJjaEhhc1ZhbHVlQ29udGV4dEtleS5zZXQoaGFzVmFsdWUpO1xuXHRcdFx0dGhpcy5kZWxheWVkRmlsdGVyaW5nLnRyaWdnZXIoKCkgPT4gdGhpcy5maWx0ZXJLZXliaW5kaW5ncygpKTtcblx0XHRcdHRoaXMudXBkYXRlU2VhcmNoT3B0aW9ucygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vbkVzY2FwZSgoKSA9PiB0aGlzLnJlY29yZEtleXNBY3Rpb24uY2hlY2tlZCA9IGZhbHNlKSk7XG5cblx0XHR0aGlzLmFjdGlvbnNDb250YWluZXIgPSBET00uYXBwZW5kKHNlYXJjaENvbnRhaW5lciwgRE9NLiQoJy5rZXliaW5kaW5ncy1zZWFyY2gtYWN0aW9ucy1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgcmVjb3JkaW5nQmFkZ2UgPSB0aGlzLmNyZWF0ZVJlY29yZGluZ0JhZGdlKHRoaXMuYWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5jaGVja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJLZXliaW5kaW5nc0VudHJpZXMoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVTZWFyY2hPcHRpb25zKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWNvcmRLZXlzQWN0aW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY2hlY2tlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlY29yZGluZ0JhZGdlLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWUuY2hlY2tlZCk7XG5cdFx0XHRcdGlmIChlLmNoZWNrZWQpIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5zZXRQbGFjZUhvbGRlcihrZXliaW5kaW5nc1NlYXJjaFBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5zZXRBcmlhTGFiZWwoa2V5YmluZGluZ3NTZWFyY2hQbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc3RhcnRSZWNvcmRpbmdLZXlzKCk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5zZXRQbGFjZUhvbGRlcihmdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5zZXRBcmlhTGFiZWwoZnVsbFRleHRTZWFyY2hQbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc3RvcFJlY29yZGluZ0tleXMoKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VhcmNoT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBbdGhpcy5yZWNvcmRLZXlzQWN0aW9uLCB0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24sIGNsZWFySW5wdXRBY3Rpb25dO1xuXHRcdGNvbnN0IHRvb2xCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9vbEJhcih0aGlzLmFjdGlvbnNDb250YWluZXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5pZCB8fCBhY3Rpb24uaWQgPT09IHRoaXMucmVjb3JkS2V5c0FjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgVG9nZ2xlQWN0aW9uVmlld0l0ZW0obnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGtleWJpbmRpbmc6IHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKT8uZ2V0TGFiZWwoKSwgdG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0S2V5QmluZGluZzogYWN0aW9uID0+IHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKVxuXHRcdH0pKTtcblx0XHR0b29sQmFyLnNldEFjdGlvbnMoYWN0aW9ucyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nc1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncygoKSA9PiB0b29sQmFyLnNldEFjdGlvbnMoYWN0aW9ucykpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2VhcmNoT3B0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBrZXliaW5kaW5nc0VkaXRvcklucHV0ID0gdGhpcy5pbnB1dCBhcyBLZXliaW5kaW5nc0VkaXRvcklucHV0O1xuXHRcdGlmIChrZXliaW5kaW5nc0VkaXRvcklucHV0KSB7XG5cdFx0XHRrZXliaW5kaW5nc0VkaXRvcklucHV0LnNlYXJjaE9wdGlvbnMgPSB7XG5cdFx0XHRcdHNlYXJjaFZhbHVlOiB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRyZWNvcmRLZXliaW5kaW5nczogISF0aGlzLnJlY29yZEtleXNBY3Rpb24uY2hlY2tlZCxcblx0XHRcdFx0c29ydEJ5UHJlY2VkZW5jZTogISF0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24uY2hlY2tlZFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlY29yZGluZ0JhZGdlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgcmVjb3JkaW5nQmFkZ2UgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJy5yZWNvcmRpbmctYmFkZ2UubW9uYWNvLWNvdW50LWJhZGdlLmxvbmcuZGlzYWJsZWQnKSk7XG5cdFx0cmVjb3JkaW5nQmFkZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmVjb3JkaW5nJywgXCJSZWNvcmRpbmcgS2V5c1wiKTtcblxuXHRcdHJlY29yZGluZ0JhZGdlLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGFzQ3NzVmFyaWFibGUoYmFkZ2VCYWNrZ3JvdW5kKTtcblx0XHRyZWNvcmRpbmdCYWRnZS5zdHlsZS5jb2xvciA9IGFzQ3NzVmFyaWFibGUoYmFkZ2VGb3JlZ3JvdW5kKTtcblx0XHRyZWNvcmRpbmdCYWRnZS5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShjb250cmFzdEJvcmRlcil9YDtcblxuXHRcdHJldHVybiByZWNvcmRpbmdCYWRnZTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0U2VhcmNoV2lkZ2V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmxheW91dChkaW1lbnNpb24pO1xuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3NtYWxsJywgZGltZW5zaW9uLndpZHRoIDwgNDAwKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5pbnB1dEVsZW1lbnQuc3R5bGUucGFkZGluZ1JpZ2h0ID0gYCR7RE9NLmdldFRvdGFsV2lkdGgodGhpcy5hY3Rpb25zQ29udGFpbmVyKSArIDEyfXB4YDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYm9keUNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcua2V5YmluZGluZ3MtYm9keScpKTtcblx0XHR0aGlzLmNyZWF0ZVRhYmxlKGJvZHlDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUYWJsZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlQ29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5rZXliaW5kaW5ncy10YWJsZS1jb250YWluZXInKSk7XG5cdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUYWJsZSxcblx0XHRcdCdLZXliaW5kaW5nc0VkaXRvcicsXG5cdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGVDb250YWluZXIsXG5cdFx0XHRuZXcgRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiA0MCxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IDQwLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IEFjdGlvbnNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29tbWFuZCcsIFwiQ29tbWFuZFwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAuMyxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBDb21tYW5kQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUtleWJpbmRpbmdJdGVtRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2tleWJpbmRpbmcnLCBcIktleWJpbmRpbmdcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAwLjIsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogS2V5YmluZGluZ0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElLZXliaW5kaW5nSXRlbUVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3aGVuJywgXCJXaGVuXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMC4zNSxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBXaGVuQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUtleWJpbmRpbmdJdGVtRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NvdXJjZScsIFwiU291cmNlXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMC4xNSxcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBTb3VyY2VDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aW9uc0NvbHVtblJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kQ29sdW1uUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2hlbkNvbHVtblJlbmRlcmVyLCB0aGlzKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTb3VyY2VDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZTogSUtleWJpbmRpbmdJdGVtRW50cnkpID0+IGUuaWQgfSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IEFjY2Vzc2liaWxpdHlQcm92aWRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogeyBnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGU6IElLZXliaW5kaW5nSXRlbUVudHJ5KSA9PiBlLmtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCB8fCBlLmtleWJpbmRpbmdJdGVtLmNvbW1hbmQgfSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IGZhbHNlLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IGZhbHNlIC8vIGRpc2FibGUgdHJhbnNmb3JtIG9wdGltaXphdGlvbiBhcyBpdCBjYXVzZXMgdGhlIGVkaXRvciBvdmVyZmxvdyB3aWRnZXRzIHRvIGJlIG1pc3Bvc2l0aW9uZWRcblx0XHRcdH1cblx0XHQpKSBhcyBXb3JrYmVuY2hUYWJsZTxJS2V5YmluZGluZ0l0ZW1FbnRyeT47XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdzVGFibGUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5YmluZGluZ3NUYWJsZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5vbkZvY3VzQ2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdzVGFibGUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyk7XG5cdFx0XHR0aGlzLm9uRm9jdXNDaGFuZ2UoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nc1RhYmxlLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0XHR0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkucmVzZXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nc1RhYmxlLm9uRGlkT3BlbigoZSkgPT4ge1xuXHRcdFx0Ly8gc3RvcCBkb3VibGUgY2xpY2sgYWN0aW9uIG9uIHRoZSBpbnB1dCAjMTQ4NDkzXG5cdFx0XHRpZiAoZS5icm93c2VyRXZlbnQ/LmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlS2V5YmluZGluZ0VudHJ5ID0gdGhpcy5hY3RpdmVLZXliaW5kaW5nRW50cnk7XG5cdFx0XHRpZiAoYWN0aXZlS2V5YmluZGluZ0VudHJ5KSB7XG5cdFx0XHRcdHRoaXMuZGVmaW5lS2V5YmluZGluZyhhY3RpdmVLZXliaW5kaW5nRW50cnksIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRET00uYXBwZW5kKHRoaXMua2V5YmluZGluZ3NUYWJsZUNvbnRhaW5lciwgdGhpcy5vdmVyZmxvd1dpZGdldHNEb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyKHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0Y29uc3QgaW5wdXQ6IEtleWJpbmRpbmdzRWRpdG9ySW5wdXQgPSB0aGlzLmlucHV0IGFzIEtleWJpbmRpbmdzRWRpdG9ySW5wdXQ7XG5cdFx0XHR0aGlzLmtleWJpbmRpbmdzRWRpdG9yTW9kZWwgPSBhd2FpdCBpbnB1dC5yZXNvbHZlKCk7XG5cdFx0XHRhd2FpdCB0aGlzLmtleWJpbmRpbmdzRWRpdG9yTW9kZWwucmVzb2x2ZSh0aGlzLmdldEFjdGlvbnNMYWJlbHMoKSk7XG5cdFx0XHR0aGlzLnJlbmRlcktleWJpbmRpbmdzRW50cmllcyhmYWxzZSwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRpZiAoaW5wdXQuc2VhcmNoT3B0aW9ucykge1xuXHRcdFx0XHR0aGlzLnJlY29yZEtleXNBY3Rpb24uY2hlY2tlZCA9IGlucHV0LnNlYXJjaE9wdGlvbnMucmVjb3JkS2V5YmluZGluZ3M7XG5cdFx0XHRcdHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5jaGVja2VkID0gaW5wdXQuc2VhcmNoT3B0aW9ucy5zb3J0QnlQcmVjZWRlbmNlO1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShpbnB1dC5zZWFyY2hPcHRpb25zLnNlYXJjaFZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VhcmNoT3B0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9uc0xhYmVscygpOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCBhY3Rpb25zTGFiZWxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvckFjdGlvbiBvZiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQWN0aW9ucygpKSB7XG5cdFx0XHRhY3Rpb25zTGFiZWxzLnNldChlZGl0b3JBY3Rpb24uaWQsIGVkaXRvckFjdGlvbi5sYWJlbCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbWVudUl0ZW0gb2YgTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuQ29tbWFuZFBhbGV0dGUpKSB7XG5cdFx0XHRpZiAoaXNJTWVudUl0ZW0obWVudUl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gdHlwZW9mIG1lbnVJdGVtLmNvbW1hbmQudGl0bGUgPT09ICdzdHJpbmcnID8gbWVudUl0ZW0uY29tbWFuZC50aXRsZSA6IG1lbnVJdGVtLmNvbW1hbmQudGl0bGUudmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gbWVudUl0ZW0uY29tbWFuZC5jYXRlZ29yeSA/IHR5cGVvZiBtZW51SXRlbS5jb21tYW5kLmNhdGVnb3J5ID09PSAnc3RyaW5nJyA/IG1lbnVJdGVtLmNvbW1hbmQuY2F0ZWdvcnkgOiBtZW51SXRlbS5jb21tYW5kLmNhdGVnb3J5LnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRhY3Rpb25zTGFiZWxzLnNldChtZW51SXRlbS5jb21tYW5kLmlkLCBjYXRlZ29yeSA/IGAke2NhdGVnb3J5fTogJHt0aXRsZX1gIDogdGl0bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9uc0xhYmVscztcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyS2V5YmluZGluZ3MoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJLZXliaW5kaW5nc0VudHJpZXModGhpcy5zZWFyY2hXaWRnZXQuaGFzRm9jdXMoKSk7XG5cdFx0dGhpcy5zZWFyY2hIaXN0b3J5RGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LmFkZFRvSGlzdG9yeSgpO1xuXHRcdFx0KHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKSkuc2VhcmNoSGlzdG9yeSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LmdldEhpc3RvcnkoKTtcblx0XHRcdHRoaXMuc2F2ZVN0YXRlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJLZXlib2FyZFNob3J0Y3V0U2VhcmNoSGlzdG9yeSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5jbGVhckhpc3RvcnkoKTtcblx0XHQodGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpKS5zZWFyY2hIaXN0b3J5ID0gdGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRCb3guZ2V0SGlzdG9yeSgpO1xuXHRcdHRoaXMuc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcktleWJpbmRpbmdzRW50cmllcyhyZXNldDogYm9vbGVhbiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5rZXliaW5kaW5nc0VkaXRvck1vZGVsKSB7XG5cdFx0XHRjb25zdCBmaWx0ZXIgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ3NFbnRyaWVzOiBJS2V5YmluZGluZ0l0ZW1FbnRyeVtdID0gdGhpcy5rZXliaW5kaW5nc0VkaXRvck1vZGVsLmZldGNoKGZpbHRlciwgdGhpcy5zb3J0QnlQcmVjZWRlbmNlQWN0aW9uLmNoZWNrZWQpO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5nZXRBcmlhTGFiZWwoa2V5YmluZGluZ3NFbnRyaWVzKTtcblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQoYXJpYUxhYmVsKTtcblx0XHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGFyaWFMYWJlbDtcblxuXHRcdFx0aWYgKGtleWJpbmRpbmdzRW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5sYXRlc3RFbXB0eUZpbHRlcnMucHVzaChmaWx0ZXIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudFNlbGVjdGVkSW5kZXggPSB0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0U2VsZWN0aW9uKClbMF07XG5cdFx0XHR0aGlzLnRhYmxlRW50cmllcyA9IGtleWJpbmRpbmdzRW50cmllcztcblx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5zcGxpY2UoMCwgdGhpcy5rZXliaW5kaW5nc1RhYmxlLmxlbmd0aCwgdGhpcy50YWJsZUVudHJpZXMpO1xuXHRcdFx0dGhpcy5sYXlvdXRLZXliaW5kaW5nc1RhYmxlKCk7XG5cblx0XHRcdGlmIChyZXNldCkge1xuXHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnNldEZvY3VzKFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLnVuQXNzaWduZWRLZXliaW5kaW5nSXRlbVRvUmV2ZWFsQW5kRm9jdXMpIHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0TmV3SW5kZXhPZlVuYXNzaWduZWRLZXliaW5kaW5nKHRoaXMudW5Bc3NpZ25lZEtleWJpbmRpbmdJdGVtVG9SZXZlYWxBbmRGb2N1cyk7XG5cdFx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnJldmVhbChpbmRleCwgMC4yKTtcblx0XHRcdFx0XHRcdHRoaXMuc2VsZWN0RW50cnkoaW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnVuQXNzaWduZWRLZXliaW5kaW5nSXRlbVRvUmV2ZWFsQW5kRm9jdXMgPSBudWxsO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRTZWxlY3RlZEluZGV4ICE9PSAtMSAmJiBjdXJyZW50U2VsZWN0ZWRJbmRleCA8IHRoaXMudGFibGVFbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0RW50cnkoY3VycmVudFNlbGVjdGVkSW5kZXgsIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lID09PSB0aGlzICYmICFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBcmlhTGFiZWwoa2V5YmluZGluZ3NFbnRyaWVzOiBJS2V5YmluZGluZ0l0ZW1FbnRyeVtdKTogc3RyaW5nIHtcblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRpZiAodGhpcy5zb3J0QnlQcmVjZWRlbmNlQWN0aW9uLmNoZWNrZWQpIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3Nob3cgc29ydGVkIGtleWJpbmRpbmdzJywgXCJTaG93aW5nIHswfSBLZXliaW5kaW5ncyBpbiBwcmVjZWRlbmNlIG9yZGVyXCIsIGtleWJpbmRpbmdzRW50cmllcy5sZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdzaG93IGtleWJpbmRpbmdzJywgXCJTaG93aW5nIHswfSBLZXliaW5kaW5ncyBpbiBhbHBoYWJldGljYWwgb3JkZXJcIiwga2V5YmluZGluZ3NFbnRyaWVzLmxlbmd0aCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuS2V5YmluZGluZ3NFZGl0b3IpKSB7XG5cdFx0XHRjb25zdCBrYiA9IHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ3dpZGdldE5hdmlnYXRpb24uZm9jdXNOZXh0Jyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0aWYgKGtiKSB7XG5cdFx0XHRcdGxhYmVsICs9ICcuICcgKyBsb2NhbGl6ZSgnbmF2aWdhdGVUb1Jlc3VsdHMnLCBcIlVzZSB7MH0gdG8gbmF2aWdhdGUgdG8gdGhlIHJlc3VsdHMgdGFibGUuXCIsIGtiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRLZXliaW5kaW5nc1RhYmxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YWJsZUhlaWdodCA9IHRoaXMuZGltZW5zaW9uLmhlaWdodCAtIChET00uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLmhlYWRlckNvbnRhaW5lcikuaGVpZ2h0ICsgMTIgLypwYWRkaW5nKi8pO1xuXHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0YWJsZUhlaWdodH1weGA7XG5cdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLmxheW91dCh0YWJsZUhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4T2YobGlzdEVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnRhYmxlRW50cmllcy5pbmRleE9mKGxpc3RFbnRyeSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnRhYmxlRW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy50YWJsZUVudHJpZXNbaV0uaWQgPT09IGxpc3RFbnRyeS5pZCkge1xuXHRcdFx0XHRcdHJldHVybiBpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV3SW5kZXhPZlVuYXNzaWduZWRLZXliaW5kaW5nKHVuYXNzaWduZWRLZXliaW5kaW5nOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMudGFibGVFbnRyaWVzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLnRhYmxlRW50cmllc1tpbmRleF07XG5cdFx0XHRpZiAoZW50cnkudGVtcGxhdGVJZCA9PT0gS0VZQklORElOR19FTlRSWV9URU1QTEFURV9JRCkge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nSXRlbUVudHJ5ID0gKDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lbnRyeSk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmNvbW1hbmQgPT09IHVuYXNzaWduZWRLZXliaW5kaW5nLmtleWJpbmRpbmdJdGVtLmNvbW1hbmQpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RFbnRyeShrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSB8IG51bWJlciwgZm9jdXM6IGJvb2xlYW4gPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0eXBlb2Yga2V5YmluZGluZ0l0ZW1FbnRyeSA9PT0gJ251bWJlcicgPyBrZXliaW5kaW5nSXRlbUVudHJ5IDogdGhpcy5nZXRJbmRleE9mKGtleWJpbmRpbmdJdGVtRW50cnkpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEgJiYgaW5kZXggPCB0aGlzLmtleWJpbmRpbmdzVGFibGUubGVuZ3RoKSB7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdH1cblx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5zZXRTZWxlY3Rpb24oW2luZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNLZXliaW5kaW5ncygpOiB2b2lkIHtcblx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuZG9tRm9jdXMoKTtcblx0XHRjb25zdCBjdXJyZW50Rm9jdXNJbmRpY2VzID0gdGhpcy5rZXliaW5kaW5nc1RhYmxlLmdldEZvY3VzKCk7XG5cdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnNldEZvY3VzKFtjdXJyZW50Rm9jdXNJbmRpY2VzLmxlbmd0aCA/IGN1cnJlbnRGb2N1c0luZGljZXNbMF0gOiAwXSk7XG5cdH1cblxuXHRzZWxlY3RLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nSXRlbUVudHJ5KTtcblx0fVxuXG5cdHJlY29yZFNlYXJjaEtleXMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWNvcmRLZXlzQWN0aW9uLmNoZWNrZWQgPSB0cnVlO1xuXHR9XG5cblx0dG9nZ2xlU29ydEJ5UHJlY2VkZW5jZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24uY2hlY2tlZCA9ICF0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24uY2hlY2tlZDtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SUtleWJpbmRpbmdJdGVtRW50cnk+KTogdm9pZCB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZS5lbGVtZW50LnRlbXBsYXRlSWQgPT09IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtRW50cnkgPSA8SUtleWJpbmRpbmdJdGVtRW50cnk+ZS5lbGVtZW50O1xuXHRcdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nSXRlbUVudHJ5KTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFtcblx0XHRcdFx0XHR0aGlzLmNyZWF0ZUNvcHlBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSksXG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVDb3B5Q29tbWFuZEFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSxcblx0XHRcdFx0XHR0aGlzLmNyZWF0ZUNvcHlDb21tYW5kVGl0bGVBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSksXG5cdFx0XHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0XHRcdC4uLihrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdcblx0XHRcdFx0XHRcdD8gW3RoaXMuY3JlYXRlRGVmaW5lS2V5YmluZGluZ0FjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSwgdGhpcy5jcmVhdGVBZGRLZXliaW5kaW5nQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpXVxuXHRcdFx0XHRcdFx0OiBbdGhpcy5jcmVhdGVEZWZpbmVLZXliaW5kaW5nQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpXSksXG5cdFx0XHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0XHRcdHRoaXMuY3JlYXRlUmVtb3ZlQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpLFxuXHRcdFx0XHRcdHRoaXMuY3JlYXRlUmVzZXRBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSksXG5cdFx0XHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0XHRcdHRoaXMuY3JlYXRlRGVmaW5lV2hlbkV4cHJlc3Npb25BY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSksXG5cdFx0XHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0XHRcdHRoaXMuY3JlYXRlU2hvd0NvbmZsaWN0c0FjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KV1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1c0NoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkucmVzZXQoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5rZXliaW5kaW5nc1RhYmxlLmdldEZvY3VzZWRFbGVtZW50cygpWzBdO1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC50ZW1wbGF0ZUlkID09PSBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEKSB7XG5cdFx0XHR0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGVmaW5lS2V5YmluZGluZ0FjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDoga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nID8gbG9jYWxpemUoJ2NoYW5nZUxhYmVsJywgXCJDaGFuZ2UgS2V5YmluZGluZy4uLlwiKSA6IGxvY2FsaXplKCdhZGRMYWJlbCcsIFwiQWRkIEtleWJpbmRpbmcuLi5cIiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWZpbmVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnksIGZhbHNlKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFkZEtleWJpbmRpbmdBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZGRMYWJlbCcsIFwiQWRkIEtleWJpbmRpbmcuLi5cIiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0FERCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5kZWZpbmVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnksIHRydWUpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRGVmaW5lV2hlbkV4cHJlc3Npb25BY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdlZGl0V2hlbicsIFwiQ2hhbmdlIFdoZW4gRXhwcmVzc2lvblwiKSxcblx0XHRcdGVuYWJsZWQ6ICEha2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORV9XSEVOLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlZmluZVdoZW5FeHByZXNzaW9uKGtleWJpbmRpbmdJdGVtRW50cnkpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVtb3ZlQWN0aW9uKGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbW92ZUxhYmVsJywgXCJSZW1vdmUgS2V5YmluZGluZ1wiKSxcblx0XHRcdGVuYWJsZWQ6ICEha2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyxcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRU1PVkUsXG5cdFx0XHRydW46ICgpID0+IHRoaXMucmVtb3ZlS2V5YmluZGluZyhrZXliaW5kaW5nSXRlbSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZXNldEFjdGlvbihrZXliaW5kaW5nSXRlbTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXNldExhYmVsJywgXCJSZXNldCBLZXliaW5kaW5nXCIpLFxuXHRcdFx0ZW5hYmxlZDogIWtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtLmlzRGVmYXVsdCxcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRVNFVCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5yZXNldEtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2hvd0NvbmZsaWN0c0FjdGlvbihrZXliaW5kaW5nSXRlbTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93U2FtZUtleWJpbmRpbmdzJywgXCJTaG93IFNhbWUgS2V5YmluZGluZ3NcIiksXG5cdFx0XHRlbmFibGVkOiAhIWtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU0hPV19TSU1JTEFSLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnNob3dTaW1pbGFyS2V5YmluZGluZ3Moa2V5YmluZGluZ0l0ZW0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29weUFjdGlvbihrZXliaW5kaW5nSXRlbTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb3B5TGFiZWwnLCBcIkNvcHlcIiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuY29weUtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29weUNvbW1hbmRBY3Rpb24oa2V5YmluZGluZzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb3B5Q29tbWFuZExhYmVsJywgXCJDb3B5IENvbW1hbmQgSURcIiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb3B5S2V5YmluZGluZ0NvbW1hbmQoa2V5YmluZGluZylcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb3B5Q29tbWFuZFRpdGxlQWN0aW9uKGtleWJpbmRpbmc6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIDxJQWN0aW9uPntcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29weUNvbW1hbmRUaXRsZUxhYmVsJywgXCJDb3B5IENvbW1hbmQgVGl0bGVcIiksXG5cdFx0XHRlbmFibGVkOiAhIWtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NPUFlfQ09NTUFORF9USVRMRSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb3B5S2V5YmluZGluZ0NvbW1hbmRUaXRsZShrZXliaW5kaW5nKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIG9uS2V5YmluZGluZ0VkaXRpbmdFcnJvcihlcnJvcjogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcih0eXBlb2YgZXJyb3IgPT09ICdzdHJpbmcnID8gZXJyb3IgOiBsb2NhbGl6ZSgnZXJyb3InLCBcIkVycm9yICd7MH0nIHdoaWxlIGVkaXRpbmcgdGhlIGtleWJpbmRpbmcuIFBsZWFzZSBvcGVuICdrZXliaW5kaW5ncy5qc29uJyBmaWxlIGFuZCBjaGVjayBmb3IgZXJyb3JzLlwiLCBgJHtlcnJvcn1gKSk7XG5cdH1cbn1cblxuY2xhc3MgRGVsZWdhdGUgaW1wbGVtZW50cyBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8SUtleWJpbmRpbmdJdGVtRW50cnk+IHtcblxuXHRyZWFkb25seSBoZWFkZXJSb3dIZWlnaHQgPSAzMDtcblxuXHRnZXRIZWlnaHQoZWxlbWVudDogSUtleWJpbmRpbmdJdGVtRW50cnkpIHtcblx0XHRpZiAoZWxlbWVudC50ZW1wbGF0ZUlkID09PSBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kSWRNYXRjaGVkID0gKDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lbGVtZW50KS5rZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgJiYgKDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lbGVtZW50KS5jb21tYW5kSWRNYXRjaGVzO1xuXHRcdFx0Y29uc3QgY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZWQgPSAhISg8SUtleWJpbmRpbmdJdGVtRW50cnk+ZWxlbWVudCkuY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXM7XG5cdFx0XHRjb25zdCBleHRlbnNpb25JZE1hdGNoZWQgPSAhISg8SUtleWJpbmRpbmdJdGVtRW50cnk+ZWxlbWVudCkuZXh0ZW5zaW9uSWRNYXRjaGVzO1xuXHRcdFx0aWYgKGNvbW1hbmRJZE1hdGNoZWQgJiYgY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIDYwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4dGVuc2lvbklkTWF0Y2hlZCB8fCBjb21tYW5kSWRNYXRjaGVkIHx8IGNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVkKSB7XG5cdFx0XHRcdHJldHVybiA0MDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIDI0O1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG59XG5cbmNsYXNzIEFjdGlvbnNDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPElLZXliaW5kaW5nSXRlbUVudHJ5LCBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdhY3Rpb25zJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nc0VkaXRvcjogS2V5YmluZGluZ3NFZGl0b3IsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdzU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHsgYWN0aW9uQmFyIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZUVkaXRBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb25zLnB1c2godGhpcy5jcmVhdGVBZGRBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSkpO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFZGl0QWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIDxJQWN0aW9uPntcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoa2V5YmluZGluZ3NFZGl0SWNvbiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdlZGl0S2V5YmluZGluZycsXG5cdFx0XHR0b29sdGlwOiB0aGlzLmtleWJpbmRpbmdzU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGxvY2FsaXplKCdlZGl0S2V5YmluZGluZ0xhYmVsJywgXCJDaGFuZ2UgS2V5YmluZGluZ1wiKSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5rZXliaW5kaW5nc0VkaXRvci5kZWZpbmVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnksIGZhbHNlKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFkZEFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGtleWJpbmRpbmdzQWRkSWNvbiksXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdhZGRLZXliaW5kaW5nJyxcblx0XHRcdHRvb2x0aXA6IHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobG9jYWxpemUoJ2FkZEtleWJpbmRpbmdMYWJlbCcsIFwiQWRkIEtleWJpbmRpbmdcIiksIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORSksXG5cdFx0XHRydW46ICgpID0+IHRoaXMua2V5YmluZGluZ3NFZGl0b3IuZGVmaW5lS2V5YmluZGluZyhrZXliaW5kaW5nSXRlbUVudHJ5LCBmYWxzZSlcblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmludGVyZmFjZSBJQ29tbWFuZENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdGNvbW1hbmRDb2x1bW46IEhUTUxFbGVtZW50O1xuXHRjb21tYW5kQ29sdW1uSG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdGNvbW1hbmRMYWJlbENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvbW1hbmRMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0Y29tbWFuZERlZmF1bHRMYWJlbENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvbW1hbmREZWZhdWx0TGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdGNvbW1hbmRJZExhYmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0Y29tbWFuZElkTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG59XG5cbmNsYXNzIENvbW1hbmRDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPElLZXliaW5kaW5nSXRlbUVudHJ5LCBJQ29tbWFuZENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjb21tYW5kcyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gQ29tbWFuZENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQ29tbWFuZENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgY29tbWFuZENvbHVtbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY29tbWFuZCcpKTtcblx0XHRjb25zdCBjb21tYW5kQ29sdW1uSG92ZXIgPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGNvbW1hbmRDb2x1bW4sICcnKTtcblx0XHRjb25zdCBjb21tYW5kTGFiZWxDb250YWluZXIgPSBET00uYXBwZW5kKGNvbW1hbmRDb2x1bW4sICQoJy5jb21tYW5kLWxhYmVsJykpO1xuXHRcdGNvbnN0IGNvbW1hbmRMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbW1hbmRMYWJlbENvbnRhaW5lcik7XG5cdFx0Y29uc3QgY29tbWFuZERlZmF1bHRMYWJlbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29tbWFuZENvbHVtbiwgJCgnLmNvbW1hbmQtZGVmYXVsdC1sYWJlbCcpKTtcblx0XHRjb25zdCBjb21tYW5kRGVmYXVsdExhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoY29tbWFuZERlZmF1bHRMYWJlbENvbnRhaW5lcik7XG5cdFx0Y29uc3QgY29tbWFuZElkTGFiZWxDb250YWluZXIgPSBET00uYXBwZW5kKGNvbW1hbmRDb2x1bW4sICQoJy5jb21tYW5kLWlkLmNvZGUnKSk7XG5cdFx0Y29uc3QgY29tbWFuZElkTGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb21tYW5kSWRMYWJlbENvbnRhaW5lcik7XG5cdFx0cmV0dXJuIHsgY29tbWFuZENvbHVtbiwgY29tbWFuZENvbHVtbkhvdmVyLCBjb21tYW5kTGFiZWxDb250YWluZXIsIGNvbW1hbmRMYWJlbCwgY29tbWFuZERlZmF1bHRMYWJlbENvbnRhaW5lciwgY29tbWFuZERlZmF1bHRMYWJlbCwgY29tbWFuZElkTGFiZWxDb250YWluZXIsIGNvbW1hbmRJZExhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDb21tYW5kQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ0l0ZW0gPSBrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtO1xuXHRcdGNvbnN0IGNvbW1hbmRJZE1hdGNoZWQgPSAhIShrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgJiYga2V5YmluZGluZ0l0ZW1FbnRyeS5jb21tYW5kSWRNYXRjaGVzKTtcblx0XHRjb25zdCBjb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlZCA9ICEha2V5YmluZGluZ0l0ZW1FbnRyeS5jb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlcztcblxuXHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kQ29sdW1uLmNsYXNzTGlzdC50b2dnbGUoJ3ZlcnRpY2FsLWFsaWduLWNvbHVtbicsIGNvbW1hbmRJZE1hdGNoZWQgfHwgY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZWQpO1xuXHRcdGNvbnN0IHRpdGxlID0ga2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsID8gbG9jYWxpemUoJ3RpdGxlJywgXCJ7MH0gKHsxfSlcIiwga2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kKSA6IGtleWJpbmRpbmdJdGVtLmNvbW1hbmQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRDb2x1bW4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kQ29sdW1uSG92ZXIudXBkYXRlKHRpdGxlKTtcblxuXHRcdGlmIChrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kTGFiZWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRMYWJlbC5zZXQoa2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsLCBrZXliaW5kaW5nSXRlbUVudHJ5LmNvbW1hbmRMYWJlbE1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZExhYmVsQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kTGFiZWwuc2V0KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkuY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXMpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kRGVmYXVsdExhYmVsQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kRGVmYXVsdExhYmVsLnNldChrZXliaW5kaW5nSXRlbS5jb21tYW5kRGVmYXVsdExhYmVsLCBrZXliaW5kaW5nSXRlbUVudHJ5LmNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmREZWZhdWx0TGFiZWxDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmREZWZhdWx0TGFiZWwuc2V0KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkuY29tbWFuZElkTWF0Y2hlcyB8fCAha2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZElkTGFiZWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRJZExhYmVsLnNldChrZXliaW5kaW5nSXRlbS5jb21tYW5kLCBrZXliaW5kaW5nSXRlbUVudHJ5LmNvbW1hbmRJZE1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZElkTGFiZWxDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRJZExhYmVsLnNldCh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElDb21tYW5kQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRDb2x1bW5Ib3Zlci5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmREZWZhdWx0TGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kSWRMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRMYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElLZXliaW5kaW5nQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0a2V5YmluZGluZ0xhYmVsOiBLZXliaW5kaW5nTGFiZWw7XG59XG5cbmNsYXNzIEtleWJpbmRpbmdDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPElLZXliaW5kaW5nSXRlbUVudHJ5LCBJS2V5YmluZGluZ0NvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdrZXliaW5kaW5ncyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gS2V5YmluZGluZ0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElLZXliaW5kaW5nQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5rZXliaW5kaW5nJykpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IG5ldyBLZXliaW5kaW5nTGFiZWwoRE9NLmFwcGVuZChlbGVtZW50LCAkKCdkaXYua2V5YmluZGluZy1sYWJlbCcpKSwgT1MsIGRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMpO1xuXHRcdHJldHVybiB7IGtleWJpbmRpbmdMYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJS2V5YmluZGluZ0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGlmIChrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5rZXliaW5kaW5nTGFiZWwuc2V0KGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZywga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nTWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5rZXliaW5kaW5nTGFiZWwuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJS2V5YmluZGluZ0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5rZXliaW5kaW5nTGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU291cmNlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0c291cmNlQ29sdW1uOiBIVE1MRWxlbWVudDtcblx0c291cmNlQ29sdW1uSG92ZXI6IElNYW5hZ2VkSG92ZXI7XG5cdHNvdXJjZUxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRleHRlbnNpb25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRleHRlbnNpb25MYWJlbDogSFRNTEFuY2hvckVsZW1lbnQ7XG5cdGV4dGVuc2lvbklkOiBIaWdobGlnaHRlZExhYmVsO1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5mdW5jdGlvbiBvbkNsaWNrKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIERPTS5FdmVudFR5cGUuQ0xJQ0ssIERPTS5maW5hbEhhbmRsZXIoY2FsbGJhY2spKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH1cblx0fSkpO1xuXHRyZXR1cm4gZGlzcG9zYWJsZXM7XG59XG5cbmNsYXNzIFNvdXJjZUNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SUtleWJpbmRpbmdJdGVtRW50cnksIElTb3VyY2VDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc291cmNlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBTb3VyY2VDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNvdXJjZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3Qgc291cmNlQ29sdW1uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zb3VyY2UnKSk7XG5cdFx0Y29uc3Qgc291cmNlQ29sdW1uSG92ZXIgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgc291cmNlQ29sdW1uLCAnJyk7XG5cdFx0Y29uc3Qgc291cmNlTGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChET00uYXBwZW5kKHNvdXJjZUNvbHVtbiwgJCgnLnNvdXJjZS1sYWJlbCcpKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChzb3VyY2VDb2x1bW4sICQoJy5leHRlbnNpb24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkxhYmVsID0gRE9NLmFwcGVuZDxIVE1MQW5jaG9yRWxlbWVudD4oZXh0ZW5zaW9uQ29udGFpbmVyLCAkKCdhLmV4dGVuc2lvbi1sYWJlbCcsIHsgdGFiaW5kZXg6IDAgfSkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoRE9NLmFwcGVuZChleHRlbnNpb25Db250YWluZXIsICQoJy5leHRlbnNpb24taWQtY29udGFpbmVyLmNvZGUnKSkpO1xuXHRcdHJldHVybiB7IHNvdXJjZUNvbHVtbiwgc291cmNlQ29sdW1uSG92ZXIsIHNvdXJjZUxhYmVsLCBleHRlbnNpb25MYWJlbCwgZXh0ZW5zaW9uQ29udGFpbmVyLCBleHRlbnNpb25JZCwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU291cmNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKGlzU3RyaW5nKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0uc291cmNlKSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmV4dGVuc2lvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlTGFiZWwuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlQ29sdW1uSG92ZXIudXBkYXRlKCcnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VMYWJlbC5zZXQoa2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5zb3VyY2UgfHwgJy0nLCBrZXliaW5kaW5nSXRlbUVudHJ5LnNvdXJjZU1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0uc291cmNlO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uTGFiZWwgPSBleHRlbnNpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWU7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlQ29sdW1uSG92ZXIudXBkYXRlKGxvY2FsaXplKCdleHRlbnNpb24gbGFiZWwnLCBcIkV4dGVuc2lvbiAoezB9KVwiLCBleHRlbnNpb25MYWJlbCkpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmV4dGVuc2lvbkxhYmVsLnRleHRDb250ZW50ID0gZXh0ZW5zaW9uTGFiZWw7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2sodGVtcGxhdGVEYXRhLmV4dGVuc2lvbkxhYmVsLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAoa2V5YmluZGluZ0l0ZW1FbnRyeS5leHRlbnNpb25JZE1hdGNoZXMpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmV4dGVuc2lvbklkLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uSWQuc2V0KGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlLCBrZXliaW5kaW5nSXRlbUVudHJ5LmV4dGVuc2lvbklkTWF0Y2hlcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uSWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5leHRlbnNpb25JZC5zZXQodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJU291cmNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUNvbHVtbkhvdmVyLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmV4dGVuc2lvbklkLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBXaGVuSW5wdXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0OiBTdWdnZXN0RW5hYmxlZElucHV0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRBY2NlcHQgPSB0aGlzLl9vbkRpZEFjY2VwdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlamVjdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlamVjdCA9IHRoaXMuX29uRGlkUmVqZWN0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0a2V5YmluZGluZ3NFZGl0b3I6IEtleWJpbmRpbmdzRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZm9jdXNDb250ZXh0S2V5ID0gQ09OVEVYVF9XSEVOX0ZPQ1VTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3RFbmFibGVkSW5wdXQsICdrZXlib2FyZHNob3J0Y3V0c2VkaXRvciN3aGVuaW5wdXQnLCBwYXJlbnQsIHtcblx0XHRcdHByb3ZpZGVSZXN1bHRzOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRleHRLZXkgb2YgUmF3Q29udGV4dEtleS5hbGwoKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgbGFiZWw6IGNvbnRleHRLZXkua2V5LCBkb2N1bWVudGF0aW9uOiBjb250ZXh0S2V5LmRlc2NyaXB0aW9uLCBkZXRhaWw6IGNvbnRleHRLZXkudHlwZSwga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0YW50IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnIScsICcgJ10sXG5cdFx0XHR3b3JkRGVmaW5pdGlvbjogL1thLXpBLVouXSsvLFxuXHRcdFx0YWx3YXlzU2hvd1N1Z2dlc3Rpb25zOiB0cnVlLFxuXHRcdH0sICcnLCBga2V5Ym9hcmRzaG9ydGN1dHNlZGl0b3Ijd2hlbmlucHV0YCwgeyBmb2N1c0NvbnRleHRLZXksIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IGtleWJpbmRpbmdzRWRpdG9yLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dC5lbGVtZW50LCBET00uRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IERPTS5FdmVudEhlbHBlci5zdG9wKGUpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBmb2N1c0NvbnRleHRLZXkucmVzZXQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoa2V5YmluZGluZ3NFZGl0b3Iub25BY2NlcHRXaGVuRXhwcmVzc2lvbigoKSA9PiB0aGlzLl9vbkRpZEFjY2VwdC5maXJlKHRoaXMuaW5wdXQuZ2V0VmFsdWUoKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoa2V5YmluZGluZ3NFZGl0b3Iub25SZWplY3RXaGVuRXhwcmVzc2lvbiwgdGhpcy5pbnB1dC5vbkRpZEJsdXIpKCgpID0+IHRoaXMuX29uRGlkUmVqZWN0LmZpcmUoKSkpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQubGF5b3V0KGRpbWVuc2lvbik7XG5cdH1cblxuXHRzaG93KHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LnNldFZhbHVlKHZhbHVlKTtcblx0XHR0aGlzLmlucHV0LmZvY3VzKHRydWUpO1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElXaGVuQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHdoZW5MYWJlbENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHdoZW5JbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHdoZW5MYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgV2hlbkNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SUtleWJpbmRpbmdJdGVtRW50cnksIElXaGVuQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3doZW4nO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFdoZW5Db2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdzRWRpdG9yOiBLZXliaW5kaW5nc0VkaXRvcixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVdoZW5Db2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLndoZW4nKSk7XG5cblx0XHRjb25zdCB3aGVuTGFiZWxDb250YWluZXIgPSBET00uYXBwZW5kKGVsZW1lbnQsICQoJ2Rpdi53aGVuLWxhYmVsJykpO1xuXHRcdGNvbnN0IHdoZW5MYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKHdoZW5MYWJlbENvbnRhaW5lcik7XG5cblx0XHRjb25zdCB3aGVuSW5wdXRDb250YWluZXIgPSBET00uYXBwZW5kKGVsZW1lbnQsICQoJ2Rpdi53aGVuLWlucHV0LWNvbnRhaW5lcicpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0d2hlbkxhYmVsQ29udGFpbmVyLFxuXHRcdFx0d2hlbkxhYmVsLFxuXHRcdFx0d2hlbklucHV0Q29udGFpbmVyLFxuXHRcdFx0ZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSxcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJV2hlbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IHdoZW5JbnB1dERpc3Bvc2FibGVzID0gdGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5hZGQodGhpcy5rZXliaW5kaW5nc0VkaXRvci5vbkRlZmluZVdoZW5FeHByZXNzaW9uKGUgPT4ge1xuXHRcdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkgPT09IGUpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW5wdXQtbW9kZScpO1xuXG5cdFx0XHRcdGNvbnN0IGlucHV0V2lkZ2V0ID0gd2hlbklucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2hlbklucHV0V2lkZ2V0LCB0ZW1wbGF0ZURhdGEud2hlbklucHV0Q29udGFpbmVyLCB0aGlzLmtleWJpbmRpbmdzRWRpdG9yKSk7XG5cdFx0XHRcdGlucHV0V2lkZ2V0LmxheW91dChuZXcgRE9NLkRpbWVuc2lvbih0ZW1wbGF0ZURhdGEuZWxlbWVudC5wYXJlbnRFbGVtZW50IS5jbGllbnRXaWR0aCwgMTgpKTtcblx0XHRcdFx0aW5wdXRXaWRnZXQuc2hvdyhrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4gfHwgJycpO1xuXG5cdFx0XHRcdGNvbnN0IGhpZGVJbnB1dFdpZGdldCA9ICgpID0+IHtcblx0XHRcdFx0XHR3aGVuSW5wdXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2lucHV0LW1vZGUnKTtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5wYWRkaW5nTGVmdCA9ICcxMHB4Jztcblx0XHRcdFx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS53aGVuSW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHdoZW5JbnB1dERpc3Bvc2FibGVzLmFkZChpbnB1dFdpZGdldC5vbkRpZEFjY2VwdCh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aGlkZUlucHV0V2lkZ2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc0VkaXRvci51cGRhdGVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnksIGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyA/IGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZy5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpIHx8ICcnIDogJycsIHZhbHVlKTtcblx0XHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzRWRpdG9yLnNlbGVjdEtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHR3aGVuSW5wdXREaXNwb3NhYmxlcy5hZGQoaW5wdXRXaWRnZXQub25EaWRSZWplY3QoKCkgPT4ge1xuXHRcdFx0XHRcdGhpZGVJbnB1dFdpZGdldCgpO1xuXHRcdFx0XHRcdHRoaXMua2V5YmluZGluZ3NFZGl0b3Iuc2VsZWN0S2V5YmluZGluZyhrZXliaW5kaW5nSXRlbUVudHJ5KTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LnBhcmVudEVsZW1lbnQhLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzBweCc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLndoZW5MYWJlbENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb2RlJywgISFrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4pO1xuXHRcdHRlbXBsYXRlRGF0YS53aGVuTGFiZWxDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCAha2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS53aGVuKTtcblxuXHRcdGlmIChrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS53aGVuTGFiZWwuc2V0KGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbiwga2V5YmluZGluZ0l0ZW1FbnRyeS53aGVuTWF0Y2hlcywga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS53aGVuKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRlbXBsYXRlRGF0YS5lbGVtZW50LCBrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLndoZW5MYWJlbC5zZXQoJy0nKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJV2hlbkNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLndoZW5MYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUtleWJpbmRpbmdJdGVtRW50cnk+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHsgfVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgna2V5YmluZGluZ3NMYWJlbCcsIFwiS2V5YmluZGluZ3NcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoeyBrZXliaW5kaW5nSXRlbSB9OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gW1xuXHRcdFx0a2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsID8ga2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsIDoga2V5YmluZGluZ0l0ZW0uY29tbWFuZCxcblx0XHRcdGtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmc/LmdldEFyaWFMYWJlbCgpIHx8IGxvY2FsaXplKCdub0tleWJpbmRpbmcnLCBcIk5vIGtleWJpbmRpbmcgYXNzaWduZWRcIiksXG5cdFx0XHRrZXliaW5kaW5nSXRlbS53aGVuID8ga2V5YmluZGluZ0l0ZW0ud2hlbiA6IGxvY2FsaXplKCdub1doZW4nLCBcIk5vIHdoZW4gY29udGV4dFwiKSxcblx0XHRcdGlzU3RyaW5nKGtleWJpbmRpbmdJdGVtLnNvdXJjZSkgPyBrZXliaW5kaW5nSXRlbS5zb3VyY2UgOiBrZXliaW5kaW5nSXRlbS5zb3VyY2UuZGVzY3JpcHRpb24gPz8ga2V5YmluZGluZ0l0ZW0uc291cmNlLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XTtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLktleWJpbmRpbmdzRWRpdG9yKSkge1xuXHRcdFx0Y29uc3Qga2JFZGl0b3JBcmlhTGFiZWwgPSBsb2NhbGl6ZSgna2V5Ym9hcmQgc2hvcnRjdXRzIGFyaWEgbGFiZWwnLCBcInVzZSBzcGFjZSBvciBlbnRlciB0byBjaGFuZ2UgdGhlIGtleWJpbmRpbmcuXCIpO1xuXHRcdFx0YXJpYUxhYmVsLnB1c2goa2JFZGl0b3JBcmlhTGFiZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJpYUxhYmVsLmpvaW4oJywgJyk7XG5cdH1cbn1cblxucmVnaXN0ZXJDb2xvcigna2V5YmluZGluZ1RhYmxlLmhlYWRlckJhY2tncm91bmQnLCB0YWJsZU9kZFJvd3NCYWNrZ3JvdW5kQ29sb3IsICdCYWNrZ3JvdW5kIGNvbG9yIGZvciB0aGUga2V5Ym9hcmQgc2hvcnRjdXRzIHRhYmxlIGhlYWRlci4nKTtcbnJlZ2lzdGVyQ29sb3IoJ2tleWJpbmRpbmdUYWJsZS5yb3dzQmFja2dyb3VuZCcsIHRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvciwgJ0JhY2tncm91bmQgY29sb3IgZm9yIHRoZSBrZXlib2FyZCBzaG9ydGN1dHMgdGFibGUgYWx0ZXJuYXRpbmcgcm93cy4nKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lOiBJQ29sb3JUaGVtZSwgY29sbGVjdG9yOiBJQ3NzU3R5bGVDb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZm9yZWdyb3VuZCk7XG5cdGlmIChmb3JlZ3JvdW5kQ29sb3IpIHtcblx0XHRjb25zdCB3aGVuRm9yZWdyb3VuZENvbG9yID0gZm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KC44KS5tYWtlT3BhcXVlKFdPUktCRU5DSF9CQUNLR1JPVU5EKHRoZW1lKSk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5rZXliaW5kaW5ncy1lZGl0b3IgPiAua2V5YmluZGluZ3MtYm9keSA+IC5rZXliaW5kaW5ncy10YWJsZS1jb250YWluZXIgLm1vbmFjby10YWJsZSAubW9uYWNvLXRhYmxlLXRyIC5tb25hY28tdGFibGUtdGQgLmNvZGUgeyBjb2xvcjogJHt3aGVuRm9yZWdyb3VuZENvbG9yfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgbGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKTtcblx0Y29uc3QgbGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kKTtcblx0aWYgKGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgJiYgbGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmRDb2xvcikge1xuXHRcdGNvbnN0IHdoZW5Gb3JlZ3JvdW5kQ29sb3IgPSBsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KC44KS5tYWtlT3BhcXVlKGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAua2V5YmluZGluZ3MtZWRpdG9yID4gLmtleWJpbmRpbmdzLWJvZHkgPiAua2V5YmluZGluZ3MtdGFibGUtY29udGFpbmVyIC5tb25hY28tdGFibGUuZm9jdXNlZCAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIC5tb25hY28tdGFibGUtdHIgLm1vbmFjby10YWJsZS10ZCAuY29kZSB7IGNvbG9yOiAke3doZW5Gb3JlZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKTtcblx0Y29uc3QgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCk7XG5cdGlmIChsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgJiYgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29uc3Qgd2hlbkZvcmVncm91bmRDb2xvciA9IGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCguOCkubWFrZU9wYXF1ZShsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAua2V5YmluZGluZ3MtZWRpdG9yID4gLmtleWJpbmRpbmdzLWJvZHkgPiAua2V5YmluZGluZ3MtdGFibGUtY29udGFpbmVyIC5tb25hY28tdGFibGUgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCAubW9uYWNvLXRhYmxlLXRyIC5tb25hY28tdGFibGUtdGQgLmNvZGUgeyBjb2xvcjogJHt3aGVuRm9yZWdyb3VuZENvbG9yfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgbGlzdEZvY3VzRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEZvY3VzRm9yZWdyb3VuZCk7XG5cdGNvbnN0IGxpc3RGb2N1c0JhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3RGb2N1c0JhY2tncm91bmQpO1xuXHRpZiAobGlzdEZvY3VzRm9yZWdyb3VuZENvbG9yICYmIGxpc3RGb2N1c0JhY2tncm91bmRDb2xvcikge1xuXHRcdGNvbnN0IHdoZW5Gb3JlZ3JvdW5kQ29sb3IgPSBsaXN0Rm9jdXNGb3JlZ3JvdW5kQ29sb3IudHJhbnNwYXJlbnQoLjgpLm1ha2VPcGFxdWUobGlzdEZvY3VzQmFja2dyb3VuZENvbG9yKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmtleWJpbmRpbmdzLWVkaXRvciA+IC5rZXliaW5kaW5ncy1ib2R5ID4gLmtleWJpbmRpbmdzLXRhYmxlLWNvbnRhaW5lciAubW9uYWNvLXRhYmxlLmZvY3VzZWQgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIC5tb25hY28tdGFibGUtdHIgLm1vbmFjby10YWJsZS10ZCAuY29kZSB7IGNvbG9yOiAke3doZW5Gb3JlZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBsaXN0SG92ZXJGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0SG92ZXJGb3JlZ3JvdW5kKTtcblx0Y29uc3QgbGlzdEhvdmVyQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEhvdmVyQmFja2dyb3VuZCk7XG5cdGlmIChsaXN0SG92ZXJGb3JlZ3JvdW5kQ29sb3IgJiYgbGlzdEhvdmVyQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29uc3Qgd2hlbkZvcmVncm91bmRDb2xvciA9IGxpc3RIb3ZlckZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCguOCkubWFrZU9wYXF1ZShsaXN0SG92ZXJCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAua2V5YmluZGluZ3MtZWRpdG9yID4gLmtleWJpbmRpbmdzLWJvZHkgPiAua2V5YmluZGluZ3MtdGFibGUtY29udGFpbmVyIC5tb25hY28tdGFibGUuZm9jdXNlZCAubW9uYWNvLWxpc3Qtcm93OmhvdmVyOm5vdCguZm9jdXNlZCk6bm90KC5zZWxlY3RlZCkgLm1vbmFjby10YWJsZS10ciAubW9uYWNvLXRhYmxlLXRkIC5jb2RlIHsgY29sb3I6ICR7d2hlbkZvcmVncm91bmRDb2xvcn07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLE9BQU87QUFDUCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsT0FBTyxVQUFVO0FBQzFCLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQWtCLFFBQVEsaUJBQWlCO0FBQzNDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlDLG9DQUFvQztBQUNyRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUFtRDtBQUM1RCxTQUFTLHdCQUF3QiwrQkFBK0I7QUFDaEUsU0FBUywwQkFBMEIsNEJBQTRCLGtDQUFrQyxzQ0FBc0MsK0NBQStDLDhDQUE4QyxtQ0FBbUMsbUNBQW1DLGtDQUFrQyxpQ0FBaUMseUNBQXlDLGlEQUFpRCx3Q0FBd0MseUNBQXlDLGdDQUFnQywrQ0FBK0MsMEJBQTBCO0FBQ2pvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFpQztBQUUxQyxTQUFTLGVBQWUsa0NBQW1FO0FBQzNGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQWlDLHFCQUFxQjtBQUMvRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsZ0JBQWdCLGlC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
