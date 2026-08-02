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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Action } from "../../../../base/common/actions.js";
import { Delayer, disposableTimeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { CONTEXT_FIND_WIDGET_NOT_VISIBLE } from "../../../../editor/contrib/find/browser/findModel.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ContextScopedReplaceInput } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { isSearchViewFocused, getSearchView } from "./searchActionsBase.js";
import * as Constants from "../common/constants.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { searchReplaceAllIcon, searchHideReplaceIcon, searchShowContextIcon, searchShowReplaceIcon } from "./searchIcons.js";
import { ToggleSearchEditorContextLinesCommandId } from "../../searchEditor/browser/constants.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { NotebookFindFilters } from "../../notebook/browser/contrib/find/findFilters.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { NotebookEditorInput } from "../../notebook/common/notebookEditorInput.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
import { SearchFindInput } from "./searchFindInput.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { NotebookFindScopeType } from "../../notebook/common/notebookCommon.js";
const SingleLineInputHeight = 26;
const _ReplaceAllAction = class _ReplaceAllAction extends Action {
  constructor(_searchWidget) {
    super(_ReplaceAllAction.ID, "", ThemeIcon.asClassName(searchReplaceAllIcon), false);
    this._searchWidget = _searchWidget;
  }
  set searchWidget(searchWidget) {
    this._searchWidget = searchWidget;
  }
  run() {
    if (this._searchWidget) {
      return this._searchWidget.triggerReplaceAll();
    }
    return Promise.resolve();
  }
};
_ReplaceAllAction.ID = "search.action.replaceAll";
let ReplaceAllAction = _ReplaceAllAction;
const hoverLifecycleOptions = { groupId: "search-widget" };
const ctrlKeyMod = isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
function stopPropagationForMultiLineUpwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionStart > 0) {
    event.stopPropagation();
    return;
  }
}
function stopPropagationForMultiLineDownwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && (isMultiline || textarea.clientHeight > SingleLineInputHeight) && textarea.selectionEnd < textarea.value.length) {
    event.stopPropagation();
    return;
  }
}
let SearchWidget = class extends Widget {
  constructor(container, options, contextViewService, contextKeyService, keybindingService, clipboardServce, configurationService, accessibilityService, contextMenuService, instantiationService, editorService) {
    super();
    this.contextViewService = contextViewService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this.clipboardServce = clipboardServce;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.ignoreGlobalFindBufferOnNextFocus = false;
    this.previousGlobalFindBufferValue = null;
    /**
     * Tracks whether the accessibility help hint has been announced in the ARIA label.
     * Reset when the widget loses focus, allowing the hint to be announced again
     * on the next focus.
     */
    this._accessibilityHelpHintAnnounced = false;
    this._onSearchSubmit = this._register(new Emitter());
    this.onSearchSubmit = this._onSearchSubmit.event;
    this._onSearchCancel = this._register(new Emitter());
    this.onSearchCancel = this._onSearchCancel.event;
    this._onReplaceToggled = this._register(new Emitter());
    this.onReplaceToggled = this._onReplaceToggled.event;
    this._onReplaceStateChange = this._register(new Emitter());
    this.onReplaceStateChange = this._onReplaceStateChange.event;
    this._onPreserveCaseChange = this._register(new Emitter());
    this.onPreserveCaseChange = this._onPreserveCaseChange.event;
    this._onReplaceValueChanged = this._register(new Emitter());
    this.onReplaceValueChanged = this._onReplaceValueChanged.event;
    this._onReplaceAll = this._register(new Emitter());
    this.onReplaceAll = this._onReplaceAll.event;
    this._onBlur = this._register(new Emitter());
    this.onBlur = this._onBlur.event;
    this._onDidHeightChange = this._register(new Emitter());
    this.onDidHeightChange = this._onDidHeightChange.event;
    this._onDidToggleContext = this._register(new Emitter());
    this.onDidToggleContext = this._onDidToggleContext.event;
    this.replaceActive = Constants.SearchContext.ReplaceActiveKey.bindTo(this.contextKeyService);
    this.searchInputBoxFocused = Constants.SearchContext.SearchInputBoxFocusedKey.bindTo(this.contextKeyService);
    this.replaceInputBoxFocused = Constants.SearchContext.ReplaceInputBoxFocusedKey.bindTo(this.contextKeyService);
    const notebookOptions = options.notebookOptions ?? {
      isInNotebookMarkdownInput: true,
      isInNotebookMarkdownPreview: true,
      isInNotebookCellInput: true,
      isInNotebookCellOutput: true
    };
    this._notebookFilters = this._register(
      new NotebookFindFilters(
        notebookOptions.isInNotebookMarkdownInput,
        notebookOptions.isInNotebookMarkdownPreview,
        notebookOptions.isInNotebookCellInput,
        notebookOptions.isInNotebookCellOutput,
        { findScopeType: NotebookFindScopeType.None }
      )
    );
    this._register(
      this._notebookFilters.onDidChange(() => {
        if (this.searchInput) {
          this.searchInput.updateFilterStyles();
        }
      })
    );
    this._register(this.editorService.onDidEditorsChange((e) => {
      if (this.searchInput && e.event.editor instanceof NotebookEditorInput && (e.event.kind === GroupModelChangeKind.EDITOR_OPEN || e.event.kind === GroupModelChangeKind.EDITOR_CLOSE)) {
        this.searchInput.filterVisible = this._hasNotebookOpen();
      }
    }));
    this._replaceHistoryDelayer = new Delayer(500);
    this._toggleReplaceButtonListener = this._register(new MutableDisposable());
    this.render(container, options);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.accessibilitySupport")) {
        this.updateAccessibilitySupport();
      }
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.updateAccessibilitySupport()));
    this.updateAccessibilitySupport();
  }
  _hasNotebookOpen() {
    const editors = this.editorService.editors;
    return editors.some((editor) => editor instanceof NotebookEditorInput);
  }
  getNotebookFilters() {
    return this._notebookFilters;
  }
  focus(select = true, focusReplace = false, suppressGlobalSearchBuffer = false) {
    this.ignoreGlobalFindBufferOnNextFocus = suppressGlobalSearchBuffer;
    if (focusReplace && this.isReplaceShown()) {
      if (this.replaceInput) {
        this._updateSearchInputAriaLabel(false);
        this.replaceInput.focus();
        if (select) {
          this.replaceInput.select();
        }
      }
    } else {
      if (this.searchInput) {
        this._updateSearchInputAriaLabel(true);
        this.searchInput.focus();
        if (select) {
          this.searchInput.select();
        }
      }
    }
  }
  /**
   * Updates the ARIA label of the search input box.
   * When a screen reader is active and the accessibility verbosity setting is enabled,
   * includes a hint about pressing Alt+F1 for accessibility help on first focus.
   * The hint is only announced once per focus cycle to prevent double-speak.
   * @param includeHint Whether to include the accessibility help hint in the label
   */
  _updateSearchInputAriaLabel(includeHint) {
    if (!this.searchInput) {
      return;
    }
    let searchLabel = nls.localize("label.Search", "Search: Type Search Term and press Enter to search");
    if (includeHint && !this._accessibilityHelpHintAnnounced && this.configurationService.getValue("accessibility.verbosity.find") && this.accessibilityService.isScreenReaderOptimized()) {
      const keybinding = this.keybindingService.lookupKeybinding("editor.action.accessibilityHelp")?.getAriaLabel();
      if (keybinding) {
        searchLabel += ", " + nls.localize("accessibilityHelpHintInLabel", "Press {0} for accessibility help", keybinding);
        this._accessibilityHelpHintAnnounced = true;
        this._labelResetTimeout?.dispose();
        this._labelResetTimeout = disposableTimeout(() => {
          if (this.searchInput) {
            this.searchInput.inputBox.setAriaLabel(nls.localize("label.Search", "Search: Type Search Term and press Enter to search"));
          }
        }, 1e3);
      }
    }
    this.searchInput.inputBox.setAriaLabel(searchLabel);
  }
  setWidth(width) {
    this.searchInput?.inputBox.layout();
    if (this.replaceInput) {
      this.replaceInput.width = width - 28;
      this.replaceInput.inputBox.layout();
    }
  }
  clear() {
    this.searchInput?.clear();
    this.replaceInput?.setValue("");
    this.setReplaceAllActionState(false);
  }
  isReplaceShown() {
    return this.replaceContainer ? !this.replaceContainer.classList.contains("disabled") : false;
  }
  isReplaceActive() {
    return !!this.replaceActive.get();
  }
  getReplaceValue() {
    return this.replaceInput?.getValue() ?? "";
  }
  toggleReplace(show) {
    if (show === void 0 || show !== this.isReplaceShown()) {
      this.onToggleReplaceButton();
    }
  }
  getSearchHistory() {
    return this.searchInput?.inputBox.getHistory() ?? [];
  }
  getReplaceHistory() {
    return this.replaceInput?.inputBox.getHistory() ?? [];
  }
  prependSearchHistory(history) {
    this.searchInput?.inputBox.prependHistory(history);
  }
  prependReplaceHistory(history) {
    this.replaceInput?.inputBox.prependHistory(history);
  }
  clearHistory() {
    this.searchInput?.inputBox.clearHistory();
    this.replaceInput?.inputBox.clearHistory();
  }
  showNextSearchTerm() {
    this.searchInput?.inputBox.showNextValue();
  }
  showPreviousSearchTerm() {
    this.searchInput?.inputBox.showPreviousValue();
  }
  showNextReplaceTerm() {
    this.replaceInput?.inputBox.showNextValue();
  }
  showPreviousReplaceTerm() {
    this.replaceInput?.inputBox.showPreviousValue();
  }
  searchInputHasFocus() {
    return !!this.searchInputBoxFocused.get();
  }
  replaceInputHasFocus() {
    return !!this.replaceInput?.inputBox.hasFocus();
  }
  focusReplaceAllAction() {
    this.replaceActionBar?.focus(true);
  }
  focusRegexAction() {
    this.searchInput?.focusOnRegex();
  }
  set replaceButtonVisibility(val) {
    if (this.toggleReplaceButton) {
      this.toggleReplaceButton.element.style.display = val ? "" : "none";
    }
  }
  render(container, options) {
    this.domNode = dom.append(container, dom.$(".search-widget"));
    this.domNode.style.position = "relative";
    if (!options._hideReplaceToggle) {
      this.renderToggleReplaceButton(this.domNode);
    }
    this.renderSearchInput(this.domNode, options);
    this.renderReplaceInput(this.domNode, options);
  }
  updateAccessibilitySupport() {
    this.searchInput?.setFocusInputOnOptionClick(!this.accessibilityService.isScreenReaderOptimized());
  }
  renderToggleReplaceButton(parent) {
    const opts = {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      title: nls.localize("search.replace.toggle.button.title", "Toggle Replace"),
      hoverDelegate: getDefaultHoverDelegate("element")
    };
    this.toggleReplaceButton = this._register(new Button(parent, opts));
    this.toggleReplaceButton.element.setAttribute("aria-expanded", "false");
    this.toggleReplaceButton.element.classList.add("toggle-replace-button");
    this.toggleReplaceButton.icon = searchHideReplaceIcon;
    this._toggleReplaceButtonListener.value = this.toggleReplaceButton.onDidClick(() => this.onToggleReplaceButton());
  }
  renderSearchInput(parent, options) {
    const history = options.searchHistory || [];
    const inputOptions = {
      label: nls.localize("label.Search", "Search: Type Search Term and press Enter to search"),
      validation: (value) => this.validateSearchInput(value),
      placeholder: nls.localize("search.placeHolder", "Search"),
      appendCaseSensitiveLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleCaseSensitiveCommandId),
      appendWholeWordsLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleWholeWordCommandId),
      appendRegexLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.ToggleRegexCommandId),
      history: new Set(history),
      showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
      flexibleHeight: true,
      flexibleMaxHeight: SearchWidget.INPUT_MAX_HEIGHT,
      showCommonFindToggles: true,
      inputBoxStyles: options.inputBoxStyles,
      toggleStyles: options.toggleStyles,
      hoverLifecycleOptions
    };
    const searchInputContainer = dom.append(parent, dom.$(".search-container.input-box"));
    this.searchInput = this._register(
      new SearchFindInput(
        searchInputContainer,
        this.contextViewService,
        inputOptions,
        this.contextKeyService,
        this.contextMenuService,
        this.instantiationService,
        this._notebookFilters,
        this._hasNotebookOpen()
      )
    );
    this._register(this.searchInput.onKeyDown((keyboardEvent) => this.onSearchInputKeyDown(keyboardEvent)));
    this.searchInput.setValue(options.value || "");
    this.searchInput.setRegex(!!options.isRegex);
    this.searchInput.setCaseSensitive(!!options.isCaseSensitive);
    this.searchInput.setWholeWords(!!options.isWholeWords);
    this._register(this.searchInput.onCaseSensitiveKeyDown((keyboardEvent) => this.onCaseSensitiveKeyDown(keyboardEvent)));
    this._register(this.searchInput.onRegexKeyDown((keyboardEvent) => this.onRegexKeyDown(keyboardEvent)));
    this._register(this.searchInput.inputBox.onDidChange(() => this.onSearchInputChanged()));
    this._register(this.searchInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
    this._register(this.onReplaceValueChanged(() => {
      this._replaceHistoryDelayer.trigger(() => this.replaceInput?.inputBox.addToHistory());
    }));
    this.searchInputFocusTracker = this._register(dom.trackFocus(this.searchInput.inputBox.inputElement));
    this._register(this.searchInputFocusTracker.onDidFocus(async () => {
      this.searchInputBoxFocused.set(true);
      const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
      if (!this.ignoreGlobalFindBufferOnNextFocus && useGlobalFindBuffer) {
        const globalBufferText = await this.clipboardServce.readFindText();
        if (globalBufferText && this.previousGlobalFindBufferValue !== globalBufferText) {
          this.searchInput?.inputBox.addToHistory();
          this.searchInput?.setValue(globalBufferText);
          this.searchInput?.select();
        }
        this.previousGlobalFindBufferValue = globalBufferText;
      }
      this.ignoreGlobalFindBufferOnNextFocus = false;
    }));
    this._register(this.searchInputFocusTracker.onDidBlur(() => this.searchInputBoxFocused.set(false)));
    this.showContextToggle = new Toggle({
      isChecked: false,
      title: this.keybindingService.appendKeybinding(nls.localize("showContext", "Toggle Context Lines"), ToggleSearchEditorContextLinesCommandId),
      icon: searchShowContextIcon,
      hoverLifecycleOptions,
      ...defaultToggleStyles
    });
    this._register(this.showContextToggle.onChange(() => this.onContextLinesChanged()));
    if (options.showContextToggle) {
      this.contextLinesInput = new InputBox(searchInputContainer, this.contextViewService, { type: "number", inputBoxStyles: defaultInputBoxStyles });
      this.contextLinesInput.element.classList.add("context-lines-input");
      this.contextLinesInput.value = "" + (this.configurationService.getValue("search").searchEditor.defaultNumberOfContextLines ?? 1);
      this._register(this.contextLinesInput.onDidChange((value) => {
        if (value !== "0") {
          this.showContextToggle.checked = true;
        }
        this.onContextLinesChanged();
      }));
      dom.append(searchInputContainer, this.showContextToggle.domNode);
    }
  }
  onContextLinesChanged() {
    this._onDidToggleContext.fire();
    if (this.contextLinesInput.value.includes("-")) {
      this.contextLinesInput.value = "0";
    }
    this._onDidToggleContext.fire();
  }
  setContextLines(lines) {
    if (!this.contextLinesInput) {
      return;
    }
    if (lines === 0) {
      this.showContextToggle.checked = false;
    } else {
      this.showContextToggle.checked = true;
      this.contextLinesInput.value = "" + lines;
    }
  }
  renderReplaceInput(parent, options) {
    this.replaceContainer = dom.append(parent, dom.$(".replace-container.disabled"));
    const replaceBox = dom.append(this.replaceContainer, dom.$(".replace-input"));
    this.replaceInput = this._register(new ContextScopedReplaceInput(replaceBox, this.contextViewService, {
      label: nls.localize("label.Replace", "Replace: Type replace term and press Enter to preview"),
      placeholder: nls.localize("search.replace.placeHolder", "Replace"),
      appendPreserveCaseLabel: this.keybindingService.appendKeybinding("", Constants.SearchCommandIds.TogglePreserveCaseId),
      history: new Set(options.replaceHistory),
      showHistoryHint: () => showHistoryKeybindingHint(this.keybindingService),
      flexibleHeight: true,
      flexibleMaxHeight: SearchWidget.INPUT_MAX_HEIGHT,
      inputBoxStyles: options.inputBoxStyles,
      toggleStyles: options.toggleStyles,
      hoverLifecycleOptions
    }, this.contextKeyService, true));
    this._register(this.replaceInput.onDidOptionChange((viaKeyboard) => {
      if (!viaKeyboard) {
        if (this.replaceInput) {
          this._onPreserveCaseChange.fire(this.replaceInput.getPreserveCase());
        }
      }
    }));
    this._register(this.replaceInput.onKeyDown((keyboardEvent) => this.onReplaceInputKeyDown(keyboardEvent)));
    this.replaceInput.setValue(options.replaceValue || "");
    this._register(this.replaceInput.inputBox.onDidChange(() => this._onReplaceValueChanged.fire()));
    this._register(this.replaceInput.inputBox.onDidHeightChange(() => this._onDidHeightChange.fire()));
    this.replaceAllAction = new ReplaceAllAction(this);
    this.replaceAllAction.label = SearchWidget.REPLACE_ALL_DISABLED_LABEL;
    this.replaceActionBar = this._register(new ActionBar(this.replaceContainer));
    this.replaceActionBar.push([this.replaceAllAction], { icon: true, label: false });
    this.onkeydown(this.replaceActionBar.domNode, (keyboardEvent) => this.onReplaceActionbarKeyDown(keyboardEvent));
    this.replaceInputFocusTracker = this._register(dom.trackFocus(this.replaceInput.inputBox.inputElement));
    this._register(this.replaceInputFocusTracker.onDidFocus(() => this.replaceInputBoxFocused.set(true)));
    this._register(this.replaceInputFocusTracker.onDidBlur(() => this.replaceInputBoxFocused.set(false)));
    this._register(this.replaceInput.onPreserveCaseKeyDown((keyboardEvent) => this.onPreserveCaseKeyDown(keyboardEvent)));
  }
  triggerReplaceAll() {
    this._onReplaceAll.fire();
    return Promise.resolve();
  }
  onToggleReplaceButton() {
    this.replaceContainer?.classList.toggle("disabled");
    if (this.isReplaceShown()) {
      this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
      this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
    } else {
      this.toggleReplaceButton?.element.classList.remove(...ThemeIcon.asClassNameArray(searchShowReplaceIcon));
      this.toggleReplaceButton?.element.classList.add(...ThemeIcon.asClassNameArray(searchHideReplaceIcon));
    }
    this.toggleReplaceButton?.element.setAttribute("aria-expanded", this.isReplaceShown() ? "true" : "false");
    this.updateReplaceActiveState();
    this._onReplaceToggled.fire();
  }
  setValue(value) {
    this.searchInput?.setValue(value);
  }
  setReplaceAllActionState(enabled) {
    if (this.replaceAllAction && this.replaceAllAction.enabled !== enabled) {
      this.replaceAllAction.enabled = enabled;
      this.replaceAllAction.label = enabled ? SearchWidget.REPLACE_ALL_ENABLED_LABEL(this.keybindingService) : SearchWidget.REPLACE_ALL_DISABLED_LABEL;
      this.updateReplaceActiveState();
    }
  }
  updateReplaceActiveState() {
    const currentState = this.isReplaceActive();
    const newState = this.isReplaceShown() && !!this.replaceAllAction?.enabled;
    if (currentState !== newState) {
      this.replaceActive.set(newState);
      this._onReplaceStateChange.fire(newState);
      this.replaceInput?.inputBox.layout();
    }
  }
  validateSearchInput(value) {
    if (value.length === 0) {
      return null;
    }
    if (!this.searchInput?.getRegex()) {
      return null;
    }
    try {
      new RegExp(value, "u");
    } catch (e) {
      return { content: e.message };
    }
    return null;
  }
  onSearchInputChanged() {
    this.searchInput?.clearMessage();
    this.setReplaceAllActionState(false);
    if (this.searchConfiguration.searchOnType) {
      if (this.searchInput?.getRegex()) {
        try {
          const regex = new RegExp(this.searchInput.getValue(), "ug");
          const matchienessHeuristic = `
								~!@#$%^&*()_+
								\`1234567890-=
								qwertyuiop[]\\
								QWERTYUIOP{}|
								asdfghjkl;'
								ASDFGHJKL:"
								zxcvbnm,./
								ZXCVBNM<>? `.match(regex)?.length ?? 0;
          const delayMultiplier = matchienessHeuristic < 50 ? 1 : matchienessHeuristic < 100 ? 5 : (
            // expressions like `.` or `\w`
            10
          );
          this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod * delayMultiplier);
        } catch {
        }
      } else {
        this.submitSearch(true, this.searchConfiguration.searchOnTypeDebouncePeriod);
      }
    }
  }
  onSearchInputKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(ctrlKeyMod | KeyCode.Enter)) {
      this.searchInput?.inputBox.insertAtCursor("\n");
      keyboardEvent.preventDefault();
    }
    if (keyboardEvent.equals(KeyCode.Enter)) {
      this.searchInput?.onSearchSubmit();
      this.submitSearch();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Escape)) {
      this._onSearchCancel.fire({ focus: true });
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focus();
      } else {
        this.searchInput?.focusOnCaseSensitive();
      }
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.UpArrow)) {
      stopPropagationForMultiLineUpwards(keyboardEvent, this.searchInput?.getValue() ?? "", this.searchInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.DownArrow)) {
      stopPropagationForMultiLineDownwards(keyboardEvent, this.searchInput?.getValue() ?? "", this.searchInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.PageUp)) {
      const inputElement = this.searchInput?.inputBox.inputElement;
      if (inputElement) {
        inputElement.setSelectionRange(0, 0);
        inputElement.focus();
        keyboardEvent.preventDefault();
      }
    } else if (keyboardEvent.equals(KeyCode.PageDown)) {
      const inputElement = this.searchInput?.inputBox.inputElement;
      if (inputElement) {
        const endOfText = inputElement.value.length;
        inputElement.setSelectionRange(endOfText, endOfText);
        inputElement.focus();
        keyboardEvent.preventDefault();
      }
    }
  }
  onCaseSensitiveKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focus();
        keyboardEvent.preventDefault();
      }
    }
  }
  onRegexKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceShown()) {
        this.replaceInput?.focusOnPreserve();
        keyboardEvent.preventDefault();
      }
    }
  }
  onPreserveCaseKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyCode.Tab)) {
      if (this.isReplaceActive()) {
        this.focusReplaceAllAction();
      } else {
        this._onBlur.fire();
      }
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.focusRegexAction();
      keyboardEvent.preventDefault();
    }
  }
  onReplaceInputKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(ctrlKeyMod | KeyCode.Enter)) {
      this.replaceInput?.inputBox.insertAtCursor("\n");
      keyboardEvent.preventDefault();
    }
    if (keyboardEvent.equals(KeyCode.Enter)) {
      this.submitSearch();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.Tab)) {
      this.searchInput?.focusOnCaseSensitive();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.searchInput?.focus();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.equals(KeyCode.UpArrow)) {
      stopPropagationForMultiLineUpwards(keyboardEvent, this.replaceInput?.getValue() ?? "", this.replaceInput?.domNode.querySelector("textarea") ?? null);
    } else if (keyboardEvent.equals(KeyCode.DownArrow)) {
      stopPropagationForMultiLineDownwards(keyboardEvent, this.replaceInput?.getValue() ?? "", this.replaceInput?.domNode.querySelector("textarea") ?? null);
    }
  }
  onReplaceActionbarKeyDown(keyboardEvent) {
    if (keyboardEvent.equals(KeyMod.Shift | KeyCode.Tab)) {
      this.focusRegexAction();
      keyboardEvent.preventDefault();
    }
  }
  async submitSearch(triggeredOnType = false, delay = 0) {
    this.searchInput?.validate();
    if (!this.searchInput?.inputBox.isInputValid()) {
      return;
    }
    const value = this.searchInput.getValue();
    const useGlobalFindBuffer = this.searchConfiguration.globalFindClipboard;
    if (value && useGlobalFindBuffer) {
      await this.clipboardServce.writeFindText(value);
    }
    this._onSearchSubmit.fire({ triggeredOnType, delay });
  }
  getContextLines() {
    return this.showContextToggle.checked ? +this.contextLinesInput.value : 0;
  }
  modifyContextLines(increase) {
    const current = +this.contextLinesInput.value;
    const modified = current + (increase ? 1 : -1);
    this.showContextToggle.checked = modified !== 0;
    this.contextLinesInput.value = "" + modified;
  }
  toggleContextLines() {
    this.showContextToggle.checked = !this.showContextToggle.checked;
    this.onContextLinesChanged();
  }
  dispose() {
    this.setReplaceAllActionState(false);
    super.dispose();
  }
  get searchConfiguration() {
    return this.configurationService.getValue("search");
  }
};
SearchWidget.INPUT_MAX_HEIGHT = 134;
SearchWidget.REPLACE_ALL_DISABLED_LABEL = nls.localize("search.action.replaceAll.disabled.label", "Replace All (Submit Search to Enable)");
SearchWidget.REPLACE_ALL_ENABLED_LABEL = (keyBindingService2) => {
  return keyBindingService2.appendKeybinding(nls.localize("search.action.replaceAll.enabled.label", "Replace All"), ReplaceAllAction.ID);
};
SearchWidget = __decorateClass([
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IClipboardService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorService)
], SearchWidget);
function registerContributions() {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: ReplaceAllAction.ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, CONTEXT_FIND_WIDGET_NOT_VISIBLE),
    primary: KeyMod.Alt | KeyMod.CtrlCmd | KeyCode.Enter,
    handler: (accessor) => {
      const viewsService = accessor.get(IViewsService);
      if (isSearchViewFocused(viewsService)) {
        const searchView = getSearchView(viewsService);
        if (searchView) {
          new ReplaceAllAction(searchView.searchAndReplaceWidget).run();
        }
      }
    }
  });
}
export {
  SearchWidget,
  registerContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIElCdXR0b25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUZpbmRJbnB1dE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZmluZGlucHV0L2ZpbmRJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZmluZGlucHV0L3JlcGxhY2VJbnB1dC5qcyc7XG5pbXBvcnQgeyBJSW5wdXRCb3hTdHlsZXMsIElNZXNzYWdlLCBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfRklORF9XSURHRVRfTk9UX1ZJU0lCTEUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRSZXBsYWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgaXNTZWFyY2hWaWV3Rm9jdXNlZCwgZ2V0U2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElUb2dnbGVTdHlsZXMsIFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNlYXJjaFJlcGxhY2VBbGxJY29uLCBzZWFyY2hIaWRlUmVwbGFjZUljb24sIHNlYXJjaFNob3dDb250ZXh0SWNvbiwgc2VhcmNoU2hvd1JlcGxhY2VJY29uIH0gZnJvbSAnLi9zZWFyY2hJY29ucy5qcyc7XG5pbXBvcnQgeyBUb2dnbGVTZWFyY2hFZGl0b3JDb250ZXh0TGluZXNDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9zZWFyY2hFZGl0b3IvYnJvd3Nlci9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9oaXN0b3J5V2lkZ2V0S2V5YmluZGluZ0hpbnQuanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZEZpbHRlcnMgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL2NvbnRyaWIvZmluZC9maW5kRmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBHcm91cE1vZGVsQ2hhbmdlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU2VhcmNoRmluZElucHV0IH0gZnJvbSAnLi9zZWFyY2hGaW5kSW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZFNjb3BlVHlwZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5cbi8qKiBTcGVjaWZpZWQgaW4gc2VhcmNodmlldy5jc3MgKi9cbmNvbnN0IFNpbmdsZUxpbmVJbnB1dEhlaWdodCA9IDI2O1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hXaWRnZXRPcHRpb25zIHtcblx0dmFsdWU/OiBzdHJpbmc7XG5cdHJlcGxhY2VWYWx1ZT86IHN0cmluZztcblx0aXNSZWdleD86IGJvb2xlYW47XG5cdGlzQ2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47XG5cdGlzV2hvbGVXb3Jkcz86IGJvb2xlYW47XG5cdHNlYXJjaEhpc3Rvcnk/OiBzdHJpbmdbXTtcblx0cmVwbGFjZUhpc3Rvcnk/OiBzdHJpbmdbXTtcblx0cHJlc2VydmVDYXNlPzogYm9vbGVhbjtcblx0X2hpZGVSZXBsYWNlVG9nZ2xlPzogYm9vbGVhbjsgLy8gVE9ETzogU2VhcmNoIEVkaXRvcidzIHJlcGxhY2UgZXhwZXJpZW5jZVxuXHRzaG93Q29udGV4dFRvZ2dsZT86IGJvb2xlYW47XG5cdGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG5cdHRvZ2dsZVN0eWxlczogSVRvZ2dsZVN0eWxlcztcblx0bm90ZWJvb2tPcHRpb25zPzogTm90ZWJvb2tUb2dnbGVTdGF0ZTtcbn1cblxuaW50ZXJmYWNlIE5vdGVib29rVG9nZ2xlU3RhdGUge1xuXHRpc0luTm90ZWJvb2tNYXJrZG93bklucHV0OiBib29sZWFuO1xuXHRpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXc6IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va0NlbGxJbnB1dDogYm9vbGVhbjtcblx0aXNJbk5vdGVib29rQ2VsbE91dHB1dDogYm9vbGVhbjtcbn1cblxuY2xhc3MgUmVwbGFjZUFsbEFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnc2VhcmNoLmFjdGlvbi5yZXBsYWNlQWxsJztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIF9zZWFyY2hXaWRnZXQ6IFNlYXJjaFdpZGdldCkge1xuXHRcdHN1cGVyKFJlcGxhY2VBbGxBY3Rpb24uSUQsICcnLCBUaGVtZUljb24uYXNDbGFzc05hbWUoc2VhcmNoUmVwbGFjZUFsbEljb24pLCBmYWxzZSk7XG5cdH1cblxuXHRzZXQgc2VhcmNoV2lkZ2V0KHNlYXJjaFdpZGdldDogU2VhcmNoV2lkZ2V0KSB7XG5cdFx0dGhpcy5fc2VhcmNoV2lkZ2V0ID0gc2VhcmNoV2lkZ2V0O1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zZWFyY2hXaWRnZXQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZWFyY2hXaWRnZXQudHJpZ2dlclJlcGxhY2VBbGwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmNvbnN0IGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyA9IHsgZ3JvdXBJZDogJ3NlYXJjaC13aWRnZXQnIH07XG5jb25zdCBjdHJsS2V5TW9kID0gKGlzTWFjaW50b3NoID8gS2V5TW9kLldpbkN0cmwgOiBLZXlNb2QuQ3RybENtZCk7XG5cbmZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZVVwd2FyZHMoZXZlbnQ6IElLZXlib2FyZEV2ZW50LCB2YWx1ZTogc3RyaW5nLCB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGwpIHtcblx0Y29uc3QgaXNNdWx0aWxpbmUgPSAhIXZhbHVlLm1hdGNoKC9cXG4vKTtcblx0aWYgKHRleHRhcmVhICYmIChpc011bHRpbGluZSB8fCB0ZXh0YXJlYS5jbGllbnRIZWlnaHQgPiBTaW5nbGVMaW5lSW5wdXRIZWlnaHQpICYmIHRleHRhcmVhLnNlbGVjdGlvblN0YXJ0ID4gMCkge1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5mdW5jdGlvbiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVEb3dud2FyZHMoZXZlbnQ6IElLZXlib2FyZEV2ZW50LCB2YWx1ZTogc3RyaW5nLCB0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCB8IG51bGwpIHtcblx0Y29uc3QgaXNNdWx0aWxpbmUgPSAhIXZhbHVlLm1hdGNoKC9cXG4vKTtcblx0aWYgKHRleHRhcmVhICYmIChpc011bHRpbGluZSB8fCB0ZXh0YXJlYS5jbGllbnRIZWlnaHQgPiBTaW5nbGVMaW5lSW5wdXRIZWlnaHQpICYmIHRleHRhcmVhLnNlbGVjdGlvbkVuZCA8IHRleHRhcmVhLnZhbHVlLmxlbmd0aCkge1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHJldHVybjtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hXaWRnZXQgZXh0ZW5kcyBXaWRnZXQge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJTlBVVF9NQVhfSEVJR0hUID0gMTM0O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFUExBQ0VfQUxMX0RJU0FCTEVEX0xBQkVMID0gbmxzLmxvY2FsaXplKCdzZWFyY2guYWN0aW9uLnJlcGxhY2VBbGwuZGlzYWJsZWQubGFiZWwnLCBcIlJlcGxhY2UgQWxsIChTdWJtaXQgU2VhcmNoIHRvIEVuYWJsZSlcIik7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFUExBQ0VfQUxMX0VOQUJMRURfTEFCRUwgPSAoa2V5QmluZGluZ1NlcnZpY2UyOiBJS2V5YmluZGluZ1NlcnZpY2UpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiBrZXlCaW5kaW5nU2VydmljZTIuYXBwZW5kS2V5YmluZGluZyhubHMubG9jYWxpemUoJ3NlYXJjaC5hY3Rpb24ucmVwbGFjZUFsbC5lbmFibGVkLmxhYmVsJywgXCJSZXBsYWNlIEFsbFwiKSwgUmVwbGFjZUFsbEFjdGlvbi5JRCk7XG5cdH07XG5cblx0ZG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0c2VhcmNoSW5wdXQ6IFNlYXJjaEZpbmRJbnB1dCB8IHVuZGVmaW5lZDtcblx0c2VhcmNoSW5wdXRGb2N1c1RyYWNrZXI6IGRvbS5JRm9jdXNUcmFja2VyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlYXJjaElucHV0Qm94Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZXBsYWNlQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cmVwbGFjZUlucHV0OiBSZXBsYWNlSW5wdXQgfCB1bmRlZmluZWQ7XG5cdHJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlcjogZG9tLklGb2N1c1RyYWNrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVwbGFjZUlucHV0Qm94Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdG9nZ2xlUmVwbGFjZUJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlcGxhY2VBbGxBY3Rpb246IFJlcGxhY2VBbGxBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVwbGFjZUFjdGl2ZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVwbGFjZUFjdGlvbkJhcjogQWN0aW9uQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXBsYWNlSGlzdG9yeURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgaWdub3JlR2xvYmFsRmluZEJ1ZmZlck9uTmV4dEZvY3VzID0gZmFsc2U7XG5cdHByaXZhdGUgcHJldmlvdXNHbG9iYWxGaW5kQnVmZmVyVmFsdWU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hldGhlciB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGhpbnQgaGFzIGJlZW4gYW5ub3VuY2VkIGluIHRoZSBBUklBIGxhYmVsLlxuXHQgKiBSZXNldCB3aGVuIHRoZSB3aWRnZXQgbG9zZXMgZm9jdXMsIGFsbG93aW5nIHRoZSBoaW50IHRvIGJlIGFubm91bmNlZCBhZ2FpblxuXHQgKiBvbiB0aGUgbmV4dCBmb2N1cy5cblx0ICovXG5cdHByaXZhdGUgX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9sYWJlbFJlc2V0VGltZW91dDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25TZWFyY2hTdWJtaXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHRyaWdnZXJlZE9uVHlwZTogYm9vbGVhbjsgZGVsYXk6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25TZWFyY2hTdWJtaXQ6IEV2ZW50PHsgdHJpZ2dlcmVkT25UeXBlOiBib29sZWFuOyBkZWxheTogbnVtYmVyIH0+ID0gdGhpcy5fb25TZWFyY2hTdWJtaXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25TZWFyY2hDYW5jZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGZvY3VzOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvblNlYXJjaENhbmNlbDogRXZlbnQ8eyBmb2N1czogYm9vbGVhbiB9PiA9IHRoaXMuX29uU2VhcmNoQ2FuY2VsLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUmVwbGFjZVRvZ2dsZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25SZXBsYWNlVG9nZ2xlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblJlcGxhY2VUb2dnbGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUmVwbGFjZVN0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uUmVwbGFjZVN0YXRlQ2hhbmdlOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uUmVwbGFjZVN0YXRlQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUHJlc2VydmVDYXNlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uUHJlc2VydmVDYXNlQ2hhbmdlOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uUHJlc2VydmVDYXNlQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUmVwbGFjZVZhbHVlQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlcGxhY2VWYWx1ZUNoYW5nZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25SZXBsYWNlVmFsdWVDaGFuZ2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUmVwbGFjZUFsbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlcGxhY2VBbGw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25SZXBsYWNlQWxsLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkJsdXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25CbHVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkSGVpZ2h0Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSGVpZ2h0Q2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkSGVpZ2h0Q2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVG9nZ2xlQ29udGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZUNvbnRleHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRUb2dnbGVDb250ZXh0LmV2ZW50O1xuXG5cdHByaXZhdGUgc2hvd0NvbnRleHRUb2dnbGUhOiBUb2dnbGU7XG5cdHB1YmxpYyBjb250ZXh0TGluZXNJbnB1dCE6IElucHV0Qm94O1xuXG5cdHByaXZhdGUgX25vdGVib29rRmlsdGVyczogTm90ZWJvb2tGaW5kRmlsdGVycztcblx0cHJpdmF0ZSByZWFkb25seSBfdG9nZ2xlUmVwbGFjZUJ1dHRvbkxpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJU2VhcmNoV2lkZ2V0T3B0aW9ucyxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2Y2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVwbGFjZUFjdGl2ZSA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlcGxhY2VBY3RpdmVLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXRCb3hGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoSW5wdXRCb3hGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlcGxhY2VJbnB1dEJveEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlSW5wdXRCb3hGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG5vdGVib29rT3B0aW9ucyA9IG9wdGlvbnMubm90ZWJvb2tPcHRpb25zID8/XG5cdFx0e1xuXHRcdFx0aXNJbk5vdGVib29rTWFya2Rvd25JbnB1dDogdHJ1ZSxcblx0XHRcdGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldzogdHJ1ZSxcblx0XHRcdGlzSW5Ob3RlYm9va0NlbGxJbnB1dDogdHJ1ZSxcblx0XHRcdGlzSW5Ob3RlYm9va0NlbGxPdXRwdXQ6IHRydWVcblx0XHR9O1xuXHRcdHRoaXMuX25vdGVib29rRmlsdGVycyA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0bmV3IE5vdGVib29rRmluZEZpbHRlcnMoXG5cdFx0XHRcdG5vdGVib29rT3B0aW9ucy5pc0luTm90ZWJvb2tNYXJrZG93bklucHV0LFxuXHRcdFx0XHRub3RlYm9va09wdGlvbnMuaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3LFxuXHRcdFx0XHRub3RlYm9va09wdGlvbnMuaXNJbk5vdGVib29rQ2VsbElucHV0LFxuXHRcdFx0XHRub3RlYm9va09wdGlvbnMuaXNJbk5vdGVib29rQ2VsbE91dHB1dCxcblx0XHRcdFx0eyBmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuTm9uZSB9XG5cdFx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5fbm90ZWJvb2tGaWx0ZXJzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoSW5wdXQpIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaElucHV0LnVwZGF0ZUZpbHRlclN0eWxlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkRWRpdG9yc0NoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2VhcmNoSW5wdXQgJiZcblx0XHRcdFx0ZS5ldmVudC5lZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0ICYmXG5cdFx0XHRcdChlLmV2ZW50LmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOIHx8IGUuZXZlbnQua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFKSkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaElucHV0LmZpbHRlclZpc2libGUgPSB0aGlzLl9oYXNOb3RlYm9va09wZW4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZXBsYWNlSGlzdG9yeURlbGF5ZXIgPSBuZXcgRGVsYXllcjx2b2lkPig1MDApO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdXR0b25MaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0XHR0aGlzLnJlbmRlcihjb250YWluZXIsIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKCkgPT4gdGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpKSk7XG5cdFx0dGhpcy51cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzTm90ZWJvb2tPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmVkaXRvclNlcnZpY2UuZWRpdG9ycztcblx0XHRyZXR1cm4gZWRpdG9ycy5zb21lKGVkaXRvciA9PiBlZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va0VkaXRvcklucHV0KTtcblx0fVxuXG5cdGdldE5vdGVib29rRmlsdGVycygpIHtcblx0XHRyZXR1cm4gdGhpcy5fbm90ZWJvb2tGaWx0ZXJzO1xuXHR9XG5cblx0Zm9jdXMoc2VsZWN0OiBib29sZWFuID0gdHJ1ZSwgZm9jdXNSZXBsYWNlOiBib29sZWFuID0gZmFsc2UsIHN1cHByZXNzR2xvYmFsU2VhcmNoQnVmZmVyID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLmlnbm9yZUdsb2JhbEZpbmRCdWZmZXJPbk5leHRGb2N1cyA9IHN1cHByZXNzR2xvYmFsU2VhcmNoQnVmZmVyO1xuXG5cdFx0aWYgKGZvY3VzUmVwbGFjZSAmJiB0aGlzLmlzUmVwbGFjZVNob3duKCkpIHtcblx0XHRcdGlmICh0aGlzLnJlcGxhY2VJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTZWFyY2hJbnB1dEFyaWFMYWJlbChmYWxzZSk7XG5cdFx0XHRcdHRoaXMucmVwbGFjZUlucHV0LmZvY3VzKCk7XG5cdFx0XHRcdGlmIChzZWxlY3QpIHtcblx0XHRcdFx0XHR0aGlzLnJlcGxhY2VJbnB1dC5zZWxlY3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTZWFyY2hJbnB1dEFyaWFMYWJlbCh0cnVlKTtcblx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRpZiAoc2VsZWN0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hJbnB1dC5zZWxlY3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBBUklBIGxhYmVsIG9mIHRoZSBzZWFyY2ggaW5wdXQgYm94LlxuXHQgKiBXaGVuIGEgc2NyZWVuIHJlYWRlciBpcyBhY3RpdmUgYW5kIHRoZSBhY2Nlc3NpYmlsaXR5IHZlcmJvc2l0eSBzZXR0aW5nIGlzIGVuYWJsZWQsXG5cdCAqIGluY2x1ZGVzIGEgaGludCBhYm91dCBwcmVzc2luZyBBbHQrRjEgZm9yIGFjY2Vzc2liaWxpdHkgaGVscCBvbiBmaXJzdCBmb2N1cy5cblx0ICogVGhlIGhpbnQgaXMgb25seSBhbm5vdW5jZWQgb25jZSBwZXIgZm9jdXMgY3ljbGUgdG8gcHJldmVudCBkb3VibGUtc3BlYWsuXG5cdCAqIEBwYXJhbSBpbmNsdWRlSGludCBXaGV0aGVyIHRvIGluY2x1ZGUgdGhlIGFjY2Vzc2liaWxpdHkgaGVscCBoaW50IGluIHRoZSBsYWJlbFxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlU2VhcmNoSW5wdXRBcmlhTGFiZWwoaW5jbHVkZUhpbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2VhcmNoSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2VhcmNoTGFiZWwgPSBubHMubG9jYWxpemUoJ2xhYmVsLlNlYXJjaCcsICdTZWFyY2g6IFR5cGUgU2VhcmNoIFRlcm0gYW5kIHByZXNzIEVudGVyIHRvIHNlYXJjaCcpO1xuXG5cdFx0Ly8gSW5jbHVkZSBhY2Nlc3NpYmlsaXR5IGhlbHAgaGludCB3aGVuIHJlcXVlc3RlZCwgc2NyZWVuIHJlYWRlciBpcyBhY3RpdmUsIGFuZCBzZXR0aW5nIGlzIGVuYWJsZWRcblx0XHQvLyBOb3RlOiBVc2luZyByYXcgc3RyaW5nIGZvciBzZXR0aW5nIElEIC0gdGhpcyBzZXR0aW5nIG1heSBub3QgYmUgcmVnaXN0ZXJlZCB5ZXRcblx0XHRpZiAoaW5jbHVkZUhpbnQgJiYgIXRoaXMuX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5maW5kJykgJiYgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdlZGl0b3IuYWN0aW9uLmFjY2Vzc2liaWxpdHlIZWxwJyk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0c2VhcmNoTGFiZWwgKz0gJywgJyArIG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eUhlbHBIaW50SW5MYWJlbCcsIFwiUHJlc3MgezB9IGZvciBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwga2V5YmluZGluZyk7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCA9IHRydWU7XG5cblx0XHRcdFx0Ly8gUmVzZXQgdG8gcGxhaW4gbGFiZWwgYWZ0ZXIgZGVsYXkgdG8gYXZvaWQgcmVwZWF0ZWQgYW5ub3VuY2VtZW50IG9uIGZvY3VzIGNoYW5nZXNcblx0XHRcdFx0dGhpcy5fbGFiZWxSZXNldFRpbWVvdXQ/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbGFiZWxSZXNldFRpbWVvdXQgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoSW5wdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQuaW5wdXRCb3guc2V0QXJpYUxhYmVsKG5scy5sb2NhbGl6ZSgnbGFiZWwuU2VhcmNoJywgJ1NlYXJjaDogVHlwZSBTZWFyY2ggVGVybSBhbmQgcHJlc3MgRW50ZXIgdG8gc2VhcmNoJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMTAwMCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5pbnB1dEJveC5zZXRBcmlhTGFiZWwoc2VhcmNoTGFiZWwpO1xuXHR9XG5cblx0c2V0V2lkdGgod2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LmxheW91dCgpO1xuXHRcdGlmICh0aGlzLnJlcGxhY2VJbnB1dCkge1xuXHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQud2lkdGggPSB3aWR0aCAtIDI4O1xuXHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQuaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKSB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uY2xlYXIoKTtcblx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKGZhbHNlKTtcblx0fVxuXG5cdGlzUmVwbGFjZVNob3duKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VDb250YWluZXIgPyAhdGhpcy5yZXBsYWNlQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSA6IGZhbHNlO1xuXHR9XG5cblx0aXNSZXBsYWNlQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMucmVwbGFjZUFjdGl2ZS5nZXQoKTtcblx0fVxuXG5cdGdldFJlcGxhY2VWYWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VJbnB1dD8uZ2V0VmFsdWUoKSA/PyAnJztcblx0fVxuXG5cdHRvZ2dsZVJlcGxhY2Uoc2hvdz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc2hvdyA9PT0gdW5kZWZpbmVkIHx8IHNob3cgIT09IHRoaXMuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0dGhpcy5vblRvZ2dsZVJlcGxhY2VCdXR0b24oKTtcblx0XHR9XG5cdH1cblxuXHRnZXRTZWFyY2hIaXN0b3J5KCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3guZ2V0SGlzdG9yeSgpID8/IFtdO1xuXHR9XG5cblx0Z2V0UmVwbGFjZUhpc3RvcnkoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guZ2V0SGlzdG9yeSgpID8/IFtdO1xuXHR9XG5cblx0cHJlcGVuZFNlYXJjaEhpc3RvcnkoaGlzdG9yeTogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5wcmVwZW5kSGlzdG9yeShoaXN0b3J5KTtcblx0fVxuXG5cdHByZXBlbmRSZXBsYWNlSGlzdG9yeShoaXN0b3J5OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMucmVwbGFjZUlucHV0Py5pbnB1dEJveC5wcmVwZW5kSGlzdG9yeShoaXN0b3J5KTtcblx0fVxuXG5cdGNsZWFySGlzdG9yeSgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5jbGVhckhpc3RvcnkoKTtcblx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guY2xlYXJIaXN0b3J5KCk7XG5cdH1cblxuXHRzaG93TmV4dFNlYXJjaFRlcm0oKSB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3guc2hvd05leHRWYWx1ZSgpO1xuXHR9XG5cblx0c2hvd1ByZXZpb3VzU2VhcmNoVGVybSgpIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5zaG93UHJldmlvdXNWYWx1ZSgpO1xuXHR9XG5cblx0c2hvd05leHRSZXBsYWNlVGVybSgpIHtcblx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uaW5wdXRCb3guc2hvd05leHRWYWx1ZSgpO1xuXHR9XG5cblx0c2hvd1ByZXZpb3VzUmVwbGFjZVRlcm0oKSB7XG5cdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94LnNob3dQcmV2aW91c1ZhbHVlKCk7XG5cdH1cblxuXHRzZWFyY2hJbnB1dEhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuc2VhcmNoSW5wdXRCb3hGb2N1c2VkLmdldCgpO1xuXHR9XG5cblx0cmVwbGFjZUlucHV0SGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94Lmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c1JlcGxhY2VBbGxBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsYWNlQWN0aW9uQmFyPy5mb2N1cyh0cnVlKTtcblx0fVxuXG5cdGZvY3VzUmVnZXhBY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uZm9jdXNPblJlZ2V4KCk7XG5cdH1cblxuXHRzZXQgcmVwbGFjZUJ1dHRvblZpc2liaWxpdHkodmFsOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbikge1xuXHRcdFx0dGhpcy50b2dnbGVSZXBsYWNlQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IHZhbCA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElTZWFyY2hXaWRnZXRPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2VhcmNoLXdpZGdldCcpKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXG5cdFx0aWYgKCFvcHRpb25zLl9oaWRlUmVwbGFjZVRvZ2dsZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJUb2dnbGVSZXBsYWNlQnV0dG9uKHRoaXMuZG9tTm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJTZWFyY2hJbnB1dCh0aGlzLmRvbU5vZGUsIG9wdGlvbnMpO1xuXHRcdHRoaXMucmVuZGVyUmVwbGFjZUlucHV0KHRoaXMuZG9tTm9kZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQ/LnNldEZvY3VzSW5wdXRPbk9wdGlvbkNsaWNrKCF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUb2dnbGVSZXBsYWNlQnV0dG9uKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRzOiBJQnV0dG9uT3B0aW9ucyA9IHtcblx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvbkJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlcGFyYXRvcjogdW5kZWZpbmVkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnJlcGxhY2UudG9nZ2xlLmJ1dHRvbi50aXRsZScsIFwiVG9nZ2xlIFJlcGxhY2VcIiksXG5cdFx0XHRob3ZlckRlbGVnYXRlOiBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLFxuXHRcdH07XG5cdFx0dGhpcy50b2dnbGVSZXBsYWNlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihwYXJlbnQsIG9wdHMpKTtcblx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd0b2dnbGUtcmVwbGFjZS1idXR0b24nKTtcblx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24uaWNvbiA9IHNlYXJjaEhpZGVSZXBsYWNlSWNvbjtcblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnV0dG9uTGlzdGVuZXIudmFsdWUgPSB0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm9uVG9nZ2xlUmVwbGFjZUJ1dHRvbigpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2VhcmNoSW5wdXQocGFyZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogSVNlYXJjaFdpZGdldE9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBoaXN0b3J5ID0gb3B0aW9ucy5zZWFyY2hIaXN0b3J5IHx8IFtdO1xuXHRcdGNvbnN0IGlucHV0T3B0aW9uczogSUZpbmRJbnB1dE9wdGlvbnMgPSB7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdsYWJlbC5TZWFyY2gnLCAnU2VhcmNoOiBUeXBlIFNlYXJjaCBUZXJtIGFuZCBwcmVzcyBFbnRlciB0byBzZWFyY2gnKSxcblx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZTogc3RyaW5nKSA9PiB0aGlzLnZhbGlkYXRlU2VhcmNoSW5wdXQodmFsdWUpLFxuXHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VhcmNoLnBsYWNlSG9sZGVyJywgXCJTZWFyY2hcIiksXG5cdFx0XHRhcHBlbmRDYXNlU2Vuc2l0aXZlTGFiZWw6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnJywgQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlQ2FzZVNlbnNpdGl2ZUNvbW1hbmRJZCksXG5cdFx0XHRhcHBlbmRXaG9sZVdvcmRzTGFiZWw6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnJywgQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZElkKSxcblx0XHRcdGFwcGVuZFJlZ2V4TGFiZWw6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnJywgQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlUmVnZXhDb21tYW5kSWQpLFxuXHRcdFx0aGlzdG9yeTogbmV3IFNldChoaXN0b3J5KSxcblx0XHRcdHNob3dIaXN0b3J5SGludDogKCkgPT4gc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlKSxcblx0XHRcdGZsZXhpYmxlSGVpZ2h0OiB0cnVlLFxuXHRcdFx0ZmxleGlibGVNYXhIZWlnaHQ6IFNlYXJjaFdpZGdldC5JTlBVVF9NQVhfSEVJR0hULFxuXHRcdFx0c2hvd0NvbW1vbkZpbmRUb2dnbGVzOiB0cnVlLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IG9wdGlvbnMuaW5wdXRCb3hTdHlsZXMsXG5cdFx0XHR0b2dnbGVTdHlsZXM6IG9wdGlvbnMudG9nZ2xlU3R5bGVzLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdH07XG5cblx0XHRjb25zdCBzZWFyY2hJbnB1dENvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLnNlYXJjaC1jb250YWluZXIuaW5wdXQtYm94JykpO1xuXG5cdFx0dGhpcy5zZWFyY2hJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0bmV3IFNlYXJjaEZpbmRJbnB1dChcblx0XHRcdFx0c2VhcmNoSW5wdXRDb250YWluZXIsXG5cdFx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0XHRpbnB1dE9wdGlvbnMsXG5cdFx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0ZpbHRlcnMsXG5cdFx0XHRcdHRoaXMuX2hhc05vdGVib29rT3BlbigpXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25LZXlEb3duKChrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkgPT4gdGhpcy5vblNlYXJjaElucHV0S2V5RG93bihrZXlib2FyZEV2ZW50KSkpO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQuc2V0VmFsdWUob3B0aW9ucy52YWx1ZSB8fCAnJyk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5zZXRSZWdleCghIW9wdGlvbnMuaXNSZWdleCk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5zZXRDYXNlU2Vuc2l0aXZlKCEhb3B0aW9ucy5pc0Nhc2VTZW5zaXRpdmUpO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQuc2V0V2hvbGVXb3JkcyghIW9wdGlvbnMuaXNXaG9sZVdvcmRzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaElucHV0Lm9uQ2FzZVNlbnNpdGl2ZUtleURvd24oKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSA9PiB0aGlzLm9uQ2FzZVNlbnNpdGl2ZUtleURvd24oa2V5Ym9hcmRFdmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaElucHV0Lm9uUmVnZXhLZXlEb3duKChrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkgPT4gdGhpcy5vblJlZ2V4S2V5RG93bihrZXlib2FyZEV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQuaW5wdXRCb3gub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5vblNlYXJjaElucHV0Q2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dC5pbnB1dEJveC5vbkRpZEhlaWdodENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZEhlaWdodENoYW5nZS5maXJlKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25SZXBsYWNlVmFsdWVDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcGxhY2VIaXN0b3J5RGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMucmVwbGFjZUlucHV0Py5pbnB1dEJveC5hZGRUb0hpc3RvcnkoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZWFyY2hJbnB1dEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuc2VhcmNoSW5wdXQuaW5wdXRCb3guaW5wdXRFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hJbnB1dEZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuc2VhcmNoSW5wdXRCb3hGb2N1c2VkLnNldCh0cnVlKTtcblxuXHRcdFx0Y29uc3QgdXNlR2xvYmFsRmluZEJ1ZmZlciA9IHRoaXMuc2VhcmNoQ29uZmlndXJhdGlvbi5nbG9iYWxGaW5kQ2xpcGJvYXJkO1xuXHRcdFx0aWYgKCF0aGlzLmlnbm9yZUdsb2JhbEZpbmRCdWZmZXJPbk5leHRGb2N1cyAmJiB1c2VHbG9iYWxGaW5kQnVmZmVyKSB7XG5cdFx0XHRcdGNvbnN0IGdsb2JhbEJ1ZmZlclRleHQgPSBhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZjZS5yZWFkRmluZFRleHQoKTtcblx0XHRcdFx0aWYgKGdsb2JhbEJ1ZmZlclRleHQgJiYgdGhpcy5wcmV2aW91c0dsb2JhbEZpbmRCdWZmZXJWYWx1ZSAhPT0gZ2xvYmFsQnVmZmVyVGV4dCkge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LmFkZFRvSGlzdG9yeSgpO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LnNldFZhbHVlKGdsb2JhbEJ1ZmZlclRleHQpO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoSW5wdXQ/LnNlbGVjdCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5wcmV2aW91c0dsb2JhbEZpbmRCdWZmZXJWYWx1ZSA9IGdsb2JhbEJ1ZmZlclRleHQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaWdub3JlR2xvYmFsRmluZEJ1ZmZlck9uTmV4dEZvY3VzID0gZmFsc2U7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXRGb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuc2VhcmNoSW5wdXRCb3hGb2N1c2VkLnNldChmYWxzZSkpKTtcblxuXG5cdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZSA9IG5ldyBUb2dnbGUoe1xuXHRcdFx0aXNDaGVja2VkOiBmYWxzZSxcblx0XHRcdHRpdGxlOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobmxzLmxvY2FsaXplKCdzaG93Q29udGV4dCcsIFwiVG9nZ2xlIENvbnRleHQgTGluZXNcIiksIFRvZ2dsZVNlYXJjaEVkaXRvckNvbnRleHRMaW5lc0NvbW1hbmRJZCksXG5cdFx0XHRpY29uOiBzZWFyY2hTaG93Q29udGV4dEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHQuLi5kZWZhdWx0VG9nZ2xlU3R5bGVzXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zaG93Q29udGV4dFRvZ2dsZS5vbkNoYW5nZSgoKSA9PiB0aGlzLm9uQ29udGV4dExpbmVzQ2hhbmdlZCgpKSk7XG5cblx0XHRpZiAob3B0aW9ucy5zaG93Q29udGV4dFRvZ2dsZSkge1xuXHRcdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dCA9IG5ldyBJbnB1dEJveChzZWFyY2hJbnB1dENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHsgdHlwZTogJ251bWJlcicsIGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSk7XG5cdFx0XHR0aGlzLmNvbnRleHRMaW5lc0lucHV0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29udGV4dC1saW5lcy1pbnB1dCcpO1xuXHRcdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dC52YWx1ZSA9ICcnICsgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykuc2VhcmNoRWRpdG9yLmRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcyA/PyAxKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dExpbmVzSW5wdXQub25EaWRDaGFuZ2UoKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKHZhbHVlICE9PSAnMCcpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmNoZWNrZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMub25Db250ZXh0TGluZXNDaGFuZ2VkKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkb20uYXBwZW5kKHNlYXJjaElucHV0Q29udGFpbmVyLCB0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmRvbU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TGluZXNDaGFuZ2VkKCkge1xuXHRcdHRoaXMuX29uRGlkVG9nZ2xlQ29udGV4dC5maXJlKCk7XG5cblx0XHRpZiAodGhpcy5jb250ZXh0TGluZXNJbnB1dC52YWx1ZS5pbmNsdWRlcygnLScpKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRMaW5lc0lucHV0LnZhbHVlID0gJzAnO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkVG9nZ2xlQ29udGV4dC5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29udGV4dExpbmVzKGxpbmVzOiBudW1iZXIpIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dExpbmVzSW5wdXQpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKGxpbmVzID09PSAwKSB7XG5cdFx0XHR0aGlzLnNob3dDb250ZXh0VG9nZ2xlLmNoZWNrZWQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMuY29udGV4dExpbmVzSW5wdXQudmFsdWUgPSAnJyArIGxpbmVzO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmVwbGFjZUlucHV0KHBhcmVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElTZWFyY2hXaWRnZXRPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBsYWNlQ29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcucmVwbGFjZS1jb250YWluZXIuZGlzYWJsZWQnKSk7XG5cdFx0Y29uc3QgcmVwbGFjZUJveCA9IGRvbS5hcHBlbmQodGhpcy5yZXBsYWNlQ29udGFpbmVyLCBkb20uJCgnLnJlcGxhY2UtaW5wdXQnKSk7XG5cblx0XHR0aGlzLnJlcGxhY2VJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb250ZXh0U2NvcGVkUmVwbGFjZUlucHV0KHJlcGxhY2VCb3gsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdsYWJlbC5SZXBsYWNlJywgJ1JlcGxhY2U6IFR5cGUgcmVwbGFjZSB0ZXJtIGFuZCBwcmVzcyBFbnRlciB0byBwcmV2aWV3JyksXG5cdFx0XHRwbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCdzZWFyY2gucmVwbGFjZS5wbGFjZUhvbGRlcicsIFwiUmVwbGFjZVwiKSxcblx0XHRcdGFwcGVuZFByZXNlcnZlQ2FzZUxhYmVsOiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoJycsIENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlRvZ2dsZVByZXNlcnZlQ2FzZUlkKSxcblx0XHRcdGhpc3Rvcnk6IG5ldyBTZXQob3B0aW9ucy5yZXBsYWNlSGlzdG9yeSksXG5cdFx0XHRzaG93SGlzdG9yeUhpbnQ6ICgpID0+IHNob3dIaXN0b3J5S2V5YmluZGluZ0hpbnQodGhpcy5rZXliaW5kaW5nU2VydmljZSksXG5cdFx0XHRmbGV4aWJsZUhlaWdodDogdHJ1ZSxcblx0XHRcdGZsZXhpYmxlTWF4SGVpZ2h0OiBTZWFyY2hXaWRnZXQuSU5QVVRfTUFYX0hFSUdIVCxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBvcHRpb25zLmlucHV0Qm94U3R5bGVzLFxuXHRcdFx0dG9nZ2xlU3R5bGVzOiBvcHRpb25zLnRvZ2dsZVN0eWxlcyxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9uc1xuXHRcdH0sIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRydWUpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbGFjZUlucHV0Lm9uRGlkT3B0aW9uQ2hhbmdlKHZpYUtleWJvYXJkID0+IHtcblx0XHRcdGlmICghdmlhS2V5Ym9hcmQpIHtcblx0XHRcdFx0aWYgKHRoaXMucmVwbGFjZUlucHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25QcmVzZXJ2ZUNhc2VDaGFuZ2UuZmlyZSh0aGlzLnJlcGxhY2VJbnB1dC5nZXRQcmVzZXJ2ZUNhc2UoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxhY2VJbnB1dC5vbktleURvd24oKGtleWJvYXJkRXZlbnQpID0+IHRoaXMub25SZXBsYWNlSW5wdXRLZXlEb3duKGtleWJvYXJkRXZlbnQpKSk7XG5cdFx0dGhpcy5yZXBsYWNlSW5wdXQuc2V0VmFsdWUob3B0aW9ucy5yZXBsYWNlVmFsdWUgfHwgJycpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbGFjZUlucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uUmVwbGFjZVZhbHVlQ2hhbmdlZC5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZEhlaWdodENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZEhlaWdodENoYW5nZS5maXJlKCkpKTtcblxuXHRcdHRoaXMucmVwbGFjZUFsbEFjdGlvbiA9IG5ldyBSZXBsYWNlQWxsQWN0aW9uKHRoaXMpO1xuXHRcdHRoaXMucmVwbGFjZUFsbEFjdGlvbi5sYWJlbCA9IFNlYXJjaFdpZGdldC5SRVBMQUNFX0FMTF9ESVNBQkxFRF9MQUJFTDtcblx0XHR0aGlzLnJlcGxhY2VBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMucmVwbGFjZUNvbnRhaW5lcikpO1xuXHRcdHRoaXMucmVwbGFjZUFjdGlvbkJhci5wdXNoKFt0aGlzLnJlcGxhY2VBbGxBY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR0aGlzLm9ua2V5ZG93bih0aGlzLnJlcGxhY2VBY3Rpb25CYXIuZG9tTm9kZSwgKGtleWJvYXJkRXZlbnQpID0+IHRoaXMub25SZXBsYWNlQWN0aW9uYmFyS2V5RG93bihrZXlib2FyZEV2ZW50KSk7XG5cblx0XHR0aGlzLnJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMucmVwbGFjZUlucHV0LmlucHV0Qm94LmlucHV0RWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5yZXBsYWNlSW5wdXRCb3hGb2N1c2VkLnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLnJlcGxhY2VJbnB1dEJveEZvY3VzZWQuc2V0KGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVwbGFjZUlucHV0Lm9uUHJlc2VydmVDYXNlS2V5RG93bigoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpID0+IHRoaXMub25QcmVzZXJ2ZUNhc2VLZXlEb3duKGtleWJvYXJkRXZlbnQpKSk7XG5cdH1cblxuXHR0cmlnZ2VyUmVwbGFjZUFsbCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9vblJlcGxhY2VBbGwuZmlyZSgpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Ub2dnbGVSZXBsYWNlQnV0dG9uKCk6IHZvaWQge1xuXHRcdHRoaXMucmVwbGFjZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnKTtcblx0XHRpZiAodGhpcy5pc1JlcGxhY2VTaG93bigpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24/LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShzZWFyY2hIaWRlUmVwbGFjZUljb24pKTtcblx0XHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbj8uZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNlYXJjaFNob3dSZXBsYWNlSWNvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24/LmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShzZWFyY2hTaG93UmVwbGFjZUljb24pKTtcblx0XHRcdHRoaXMudG9nZ2xlUmVwbGFjZUJ1dHRvbj8uZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNlYXJjaEhpZGVSZXBsYWNlSWNvbikpO1xuXHRcdH1cblx0XHR0aGlzLnRvZ2dsZVJlcGxhY2VCdXR0b24/LmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgdGhpcy5pc1JlcGxhY2VTaG93bigpID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0dGhpcy51cGRhdGVSZXBsYWNlQWN0aXZlU3RhdGUoKTtcblx0XHR0aGlzLl9vblJlcGxhY2VUb2dnbGVkLmZpcmUoKTtcblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py5zZXRWYWx1ZSh2YWx1ZSk7XG5cdH1cblxuXHRzZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJlcGxhY2VBbGxBY3Rpb24gJiYgKHRoaXMucmVwbGFjZUFsbEFjdGlvbi5lbmFibGVkICE9PSBlbmFibGVkKSkge1xuXHRcdFx0dGhpcy5yZXBsYWNlQWxsQWN0aW9uLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0dGhpcy5yZXBsYWNlQWxsQWN0aW9uLmxhYmVsID0gZW5hYmxlZCA/IFNlYXJjaFdpZGdldC5SRVBMQUNFX0FMTF9FTkFCTEVEX0xBQkVMKHRoaXMua2V5YmluZGluZ1NlcnZpY2UpIDogU2VhcmNoV2lkZ2V0LlJFUExBQ0VfQUxMX0RJU0FCTEVEX0xBQkVMO1xuXHRcdFx0dGhpcy51cGRhdGVSZXBsYWNlQWN0aXZlU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlcGxhY2VBY3RpdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLmlzUmVwbGFjZUFjdGl2ZSgpO1xuXHRcdGNvbnN0IG5ld1N0YXRlID0gdGhpcy5pc1JlcGxhY2VTaG93bigpICYmICEhdGhpcy5yZXBsYWNlQWxsQWN0aW9uPy5lbmFibGVkO1xuXHRcdGlmIChjdXJyZW50U3RhdGUgIT09IG5ld1N0YXRlKSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VBY3RpdmUuc2V0KG5ld1N0YXRlKTtcblx0XHRcdHRoaXMuX29uUmVwbGFjZVN0YXRlQ2hhbmdlLmZpcmUobmV3U3RhdGUpO1xuXHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94LmxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVTZWFyY2hJbnB1dCh2YWx1ZTogc3RyaW5nKTogSU1lc3NhZ2UgfCBudWxsIHtcblx0XHRpZiAodmFsdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCEodGhpcy5zZWFyY2hJbnB1dD8uZ2V0UmVnZXgoKSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0bmV3IFJlZ0V4cCh2YWx1ZSwgJ3UnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBlLm1lc3NhZ2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgb25TZWFyY2hJbnB1dENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dD8uY2xlYXJNZXNzYWdlKCk7XG5cdFx0dGhpcy5zZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZmFsc2UpO1xuXG5cdFx0aWYgKHRoaXMuc2VhcmNoQ29uZmlndXJhdGlvbi5zZWFyY2hPblR5cGUpIHtcblx0XHRcdGlmICh0aGlzLnNlYXJjaElucHV0Py5nZXRSZWdleCgpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKHRoaXMuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKSwgJ3VnJyk7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hpZW5lc3NIZXVyaXN0aWMgPSBgXG5cdFx0XHRcdFx0XHRcdFx0fiFAIyQlXiYqKClfK1xuXHRcdFx0XHRcdFx0XHRcdFxcYDEyMzQ1Njc4OTAtPVxuXHRcdFx0XHRcdFx0XHRcdHF3ZXJ0eXVpb3BbXVxcXFxcblx0XHRcdFx0XHRcdFx0XHRRV0VSVFlVSU9Qe318XG5cdFx0XHRcdFx0XHRcdFx0YXNkZmdoamtsOydcblx0XHRcdFx0XHRcdFx0XHRBU0RGR0hKS0w6XCJcblx0XHRcdFx0XHRcdFx0XHR6eGN2Ym5tLC4vXG5cdFx0XHRcdFx0XHRcdFx0WlhDVkJOTTw+PyBgLm1hdGNoKHJlZ2V4KT8ubGVuZ3RoID8/IDA7XG5cblx0XHRcdFx0XHRjb25zdCBkZWxheU11bHRpcGxpZXIgPVxuXHRcdFx0XHRcdFx0bWF0Y2hpZW5lc3NIZXVyaXN0aWMgPCA1MCA/IDEgOlxuXHRcdFx0XHRcdFx0XHRtYXRjaGllbmVzc0hldXJpc3RpYyA8IDEwMCA/IDUgOiAvLyBleHByZXNzaW9ucyBsaWtlIGAuYCBvciBgXFx3YFxuXHRcdFx0XHRcdFx0XHRcdDEwOyAvLyBvbmx5IHRoaW5ncyBtYXRjaGluZyBlbXB0eSBzdHJpbmdcblxuXG5cdFx0XHRcdFx0dGhpcy5zdWJtaXRTZWFyY2godHJ1ZSwgdGhpcy5zZWFyY2hDb25maWd1cmF0aW9uLnNlYXJjaE9uVHlwZURlYm91bmNlUGVyaW9kICogZGVsYXlNdWx0aXBsaWVyKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gcGFzc1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnN1Ym1pdFNlYXJjaCh0cnVlLCB0aGlzLnNlYXJjaENvbmZpZ3VyYXRpb24uc2VhcmNoT25UeXBlRGVib3VuY2VQZXJpb2QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TZWFyY2hJbnB1dEtleURvd24oa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoY3RybEtleU1vZCB8IEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5pbnNlcnRBdEN1cnNvcignXFxuJyk7XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0Py5vblNlYXJjaFN1Ym1pdCgpO1xuXHRcdFx0dGhpcy5zdWJtaXRTZWFyY2goKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdHRoaXMuX29uU2VhcmNoQ2FuY2VsLmZpcmUoeyBmb2N1czogdHJ1ZSB9KTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdGlmICh0aGlzLmlzUmVwbGFjZVNob3duKCkpIHtcblx0XHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNlYXJjaElucHV0Py5mb2N1c09uQ2FzZVNlbnNpdGl2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0c3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lVXB3YXJkcyhrZXlib2FyZEV2ZW50LCB0aGlzLnNlYXJjaElucHV0Py5nZXRWYWx1ZSgpID8/ICcnLCB0aGlzLnNlYXJjaElucHV0Py5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykgPz8gbnVsbCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZURvd253YXJkcyhrZXlib2FyZEV2ZW50LCB0aGlzLnNlYXJjaElucHV0Py5nZXRWYWx1ZSgpID8/ICcnLCB0aGlzLnNlYXJjaElucHV0Py5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykgPz8gbnVsbCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5QYWdlVXApKSB7XG5cdFx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSB0aGlzLnNlYXJjaElucHV0Py5pbnB1dEJveC5pbnB1dEVsZW1lbnQ7XG5cdFx0XHRpZiAoaW5wdXRFbGVtZW50KSB7XG5cdFx0XHRcdGlucHV0RWxlbWVudC5zZXRTZWxlY3Rpb25SYW5nZSgwLCAwKTtcblx0XHRcdFx0aW5wdXRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlBhZ2VEb3duKSkge1xuXHRcdFx0Y29uc3QgaW5wdXRFbGVtZW50ID0gdGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3guaW5wdXRFbGVtZW50O1xuXHRcdFx0aWYgKGlucHV0RWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBlbmRPZlRleHQgPSBpbnB1dEVsZW1lbnQudmFsdWUubGVuZ3RoO1xuXHRcdFx0XHRpbnB1dEVsZW1lbnQuc2V0U2VsZWN0aW9uUmFuZ2UoZW5kT2ZUZXh0LCBlbmRPZlRleHQpO1xuXHRcdFx0XHRpbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25DYXNlU2Vuc2l0aXZlS2V5RG93bihrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYikpIHtcblx0XHRcdGlmICh0aGlzLmlzUmVwbGFjZVNob3duKCkpIHtcblx0XHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmZvY3VzKCk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUmVnZXhLZXlEb3duKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSB7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0aWYgKHRoaXMuaXNSZXBsYWNlU2hvd24oKSkge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VJbnB1dD8uZm9jdXNPblByZXNlcnZlKCk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUHJlc2VydmVDYXNlS2V5RG93bihrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCkge1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdGlmICh0aGlzLmlzUmVwbGFjZUFjdGl2ZSgpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNSZXBsYWNlQWxsQWN0aW9uKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkJsdXIuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYikpIHtcblx0XHRcdHRoaXMuZm9jdXNSZWdleEFjdGlvbigpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25SZXBsYWNlSW5wdXRLZXlEb3duKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KSB7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKGN0cmxLZXlNb2QgfCBLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0dGhpcy5yZXBsYWNlSW5wdXQ/LmlucHV0Qm94Lmluc2VydEF0Q3Vyc29yKCdcXG4nKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdHRoaXMuc3VibWl0U2VhcmNoKCk7XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0Py5mb2N1c09uQ2FzZVNlbnNpdGl2ZSgpO1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0dGhpcy5zZWFyY2hJbnB1dD8uZm9jdXMoKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZVVwd2FyZHMoa2V5Ym9hcmRFdmVudCwgdGhpcy5yZXBsYWNlSW5wdXQ/LmdldFZhbHVlKCkgPz8gJycsIHRoaXMucmVwbGFjZUlucHV0Py5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykgPz8gbnVsbCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZURvd253YXJkcyhrZXlib2FyZEV2ZW50LCB0aGlzLnJlcGxhY2VJbnB1dD8uZ2V0VmFsdWUoKSA/PyAnJywgdGhpcy5yZXBsYWNlSW5wdXQ/LmRvbU5vZGUucXVlcnlTZWxlY3RvcigndGV4dGFyZWEnKSA/PyBudWxsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUmVwbGFjZUFjdGlvbmJhcktleURvd24oa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHR0aGlzLmZvY3VzUmVnZXhBY3Rpb24oKTtcblx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdFNlYXJjaCh0cmlnZ2VyZWRPblR5cGUgPSBmYWxzZSwgZGVsYXk6IG51bWJlciA9IDApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlYXJjaElucHV0Py52YWxpZGF0ZSgpO1xuXHRcdGlmICghdGhpcy5zZWFyY2hJbnB1dD8uaW5wdXRCb3guaXNJbnB1dFZhbGlkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKTtcblx0XHRjb25zdCB1c2VHbG9iYWxGaW5kQnVmZmVyID0gdGhpcy5zZWFyY2hDb25maWd1cmF0aW9uLmdsb2JhbEZpbmRDbGlwYm9hcmQ7XG5cdFx0aWYgKHZhbHVlICYmIHVzZUdsb2JhbEZpbmRCdWZmZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmNlLndyaXRlRmluZFRleHQodmFsdWUpO1xuXHRcdH1cblx0XHR0aGlzLl9vblNlYXJjaFN1Ym1pdC5maXJlKHsgdHJpZ2dlcmVkT25UeXBlLCBkZWxheSB9KTtcblx0fVxuXG5cdGdldENvbnRleHRMaW5lcygpIHtcblx0XHRyZXR1cm4gdGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID8gK3RoaXMuY29udGV4dExpbmVzSW5wdXQudmFsdWUgOiAwO1xuXHR9XG5cblx0bW9kaWZ5Q29udGV4dExpbmVzKGluY3JlYXNlOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgY3VycmVudCA9ICt0aGlzLmNvbnRleHRMaW5lc0lucHV0LnZhbHVlO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gY3VycmVudCArIChpbmNyZWFzZSA/IDEgOiAtMSk7XG5cdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID0gbW9kaWZpZWQgIT09IDA7XG5cdFx0dGhpcy5jb250ZXh0TGluZXNJbnB1dC52YWx1ZSA9ICcnICsgbW9kaWZpZWQ7XG5cdH1cblxuXHR0b2dnbGVDb250ZXh0TGluZXMoKSB7XG5cdFx0dGhpcy5zaG93Q29udGV4dFRvZ2dsZS5jaGVja2VkID0gIXRoaXMuc2hvd0NvbnRleHRUb2dnbGUuY2hlY2tlZDtcblx0XHR0aGlzLm9uQ29udGV4dExpbmVzQ2hhbmdlZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNldFJlcGxhY2VBbGxBY3Rpb25TdGF0ZShmYWxzZSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2VhcmNoQ29uZmlndXJhdGlvbigpOiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbnRyaWJ1dGlvbnMoKSB7XG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBSZXBsYWNlQWxsQWN0aW9uLklELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVwbGFjZUFjdGl2ZUtleSwgQ09OVEVYVF9GSU5EX1dJREdFVF9OT1RfVklTSUJMRSksXG5cdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRpZiAoaXNTZWFyY2hWaWV3Rm9jdXNlZCh2aWV3c1NlcnZpY2UpKSB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cdFx0XHRcdGlmIChzZWFyY2hWaWV3KSB7XG5cdFx0XHRcdFx0bmV3IFJlcGxhY2VBbGxBY3Rpb24oc2VhcmNoVmlldy5zZWFyY2hBbmRSZXBsYWNlV2lkZ2V0KS5ydW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFFckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUE4QjtBQUd2QyxTQUFvQyxnQkFBZ0I7QUFDcEQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMseUJBQXlCO0FBQzNDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFFdEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FB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
