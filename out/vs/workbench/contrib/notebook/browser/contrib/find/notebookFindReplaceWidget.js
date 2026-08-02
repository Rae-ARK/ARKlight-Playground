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
import * as nls from "../../../../../../nls.js";
import * as dom from "../../../../../../base/browser/dom.js";
import "./notebookFindReplaceWidget.css";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { AnchorAlignment } from "../../../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { FindInput } from "../../../../../../base/browser/ui/findinput/findInput.js";
import { ProgressBar } from "../../../../../../base/browser/ui/progressbar/progressbar.js";
import { Orientation, Sash } from "../../../../../../base/browser/ui/sash/sash.js";
import { Toggle } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { Widget } from "../../../../../../base/browser/ui/widget.js";
import { Action, ActionRunner, Separator } from "../../../../../../base/common/actions.js";
import { Delayer } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { isSafari } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { findNextMatchIcon, findPreviousMatchIcon, findReplaceAllIcon, findReplaceIcon, findSelectionIcon, SimpleButton } from "../../../../../../editor/contrib/find/browser/findWidget.js";
import { parseReplaceString, ReplacePattern } from "../../../../../../editor/contrib/find/browser/replacePattern.js";
import { getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ContextScopedReplaceInput, registerAndCreateHistoryNavigationContext } from "../../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { defaultInputBoxStyles, defaultProgressBarStyles, defaultToggleStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { registerIcon, widgetClose } from "../../../../../../platform/theme/common/iconRegistry.js";
import { registerThemingParticipant } from "../../../../../../platform/theme/common/themeService.js";
import { filterIcon } from "../../../../extensions/browser/extensionsIcons.js";
import { NotebookFindFilters } from "./findFilters.js";
import { NotebookFindScopeType, NotebookSetting } from "../../../common/notebookCommon.js";
const NLS_FIND_INPUT_LABEL = nls.localize("label.find", "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize("placeholder.find", "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize("label.previousMatchButton", "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize("label.nextMatchButton", "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize("label.toggleSelectionFind", "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize("label.closeButton", "Close");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize("label.toggleReplaceButton", "Toggle Replace");
const NLS_REPLACE_INPUT_LABEL = nls.localize("label.replace", "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize("placeholder.replace", "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize("label.replaceButton", "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize("label.replaceAllButton", "Replace All");
const findFilterButton = registerIcon("find-filter", Codicon.filter, nls.localize("findFilterIcon", "Icon for Find Filter in find widget."));
const NOTEBOOK_FIND_FILTERS = nls.localize("notebook.find.filter.filterAction", "Find Filters");
const NOTEBOOK_FIND_IN_MARKUP_INPUT = nls.localize("notebook.find.filter.findInMarkupInput", "Markdown Source");
const NOTEBOOK_FIND_IN_MARKUP_PREVIEW = nls.localize("notebook.find.filter.findInMarkupPreview", "Rendered Markdown");
const NOTEBOOK_FIND_IN_CODE_INPUT = nls.localize("notebook.find.filter.findInCodeInput", "Code Cell Source");
const NOTEBOOK_FIND_IN_CODE_OUTPUT = nls.localize("notebook.find.filter.findInCodeOutput", "Code Cell Output");
const NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH = 419;
const NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING = 4;
let NotebookFindFilterActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(filters, action, options, actionRunner, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    );
    this.filters = filters;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
  }
  getActions() {
    const markdownInput = {
      checked: this.filters.markupInput,
      class: void 0,
      enabled: true,
      id: "findInMarkdownInput",
      label: NOTEBOOK_FIND_IN_MARKUP_INPUT,
      run: async () => {
        this.filters.markupInput = !this.filters.markupInput;
      },
      tooltip: ""
    };
    const markdownPreview = {
      checked: this.filters.markupPreview,
      class: void 0,
      enabled: true,
      id: "findInMarkdownInput",
      label: NOTEBOOK_FIND_IN_MARKUP_PREVIEW,
      run: async () => {
        this.filters.markupPreview = !this.filters.markupPreview;
      },
      tooltip: ""
    };
    const codeInput = {
      checked: this.filters.codeInput,
      class: void 0,
      enabled: true,
      id: "findInCodeInput",
      label: NOTEBOOK_FIND_IN_CODE_INPUT,
      run: async () => {
        this.filters.codeInput = !this.filters.codeInput;
      },
      tooltip: ""
    };
    const codeOutput = {
      checked: this.filters.codeOutput,
      class: void 0,
      enabled: true,
      id: "findInCodeOutput",
      label: NOTEBOOK_FIND_IN_CODE_OUTPUT,
      run: async () => {
        this.filters.codeOutput = !this.filters.codeOutput;
      },
      tooltip: "",
      dispose: () => null
    };
    if (isSafari) {
      return [
        markdownInput,
        codeInput
      ];
    } else {
      return [
        markdownInput,
        markdownPreview,
        new Separator(),
        codeInput,
        codeOutput
      ];
    }
  }
  updateChecked() {
    this.element.classList.toggle("checked", this._action.checked);
  }
};
NotebookFindFilterActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], NotebookFindFilterActionViewItem);
class NotebookFindInputFilterButton extends Disposable {
  constructor(filters, contextMenuService, instantiationService, options, tooltip = NOTEBOOK_FIND_FILTERS) {
    super();
    this.filters = filters;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._actionbar = null;
    this._toggleStyles = options.toggleStyles;
    this._filtersAction = this._register(new Action("notebookFindFilterAction", tooltip, "notebook-filters " + ThemeIcon.asClassName(filterIcon)));
    this._filtersAction.checked = false;
    this._filterButtonContainer = dom.$(".find-filter-button");
    this._filterButtonContainer.classList.add("monaco-custom-toggle");
    this.createFilters(this._filterButtonContainer);
  }
  get container() {
    return this._filterButtonContainer;
  }
  width() {
    return 2 + 2 + 2 + 16;
  }
  enable() {
    this.container.setAttribute("aria-disabled", String(false));
  }
  disable() {
    this.container.setAttribute("aria-disabled", String(true));
  }
  set visible(visible) {
    this._filterButtonContainer.style.display = visible ? "" : "none";
  }
  get visible() {
    return this._filterButtonContainer.style.display !== "none";
  }
  applyStyles(filterChecked) {
    const toggleStyles = this._toggleStyles;
    this._filterButtonContainer.style.border = "1px solid transparent";
    this._filterButtonContainer.style.borderRadius = "3px";
    this._filterButtonContainer.style.borderColor = filterChecked && toggleStyles.inputActiveOptionBorder || "";
    this._filterButtonContainer.style.color = filterChecked && toggleStyles.inputActiveOptionForeground || "inherit";
    this._filterButtonContainer.style.backgroundColor = filterChecked && toggleStyles.inputActiveOptionBackground || "";
  }
  createFilters(container) {
    this._actionbar = this._register(new ActionBar(container, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this._filtersAction.id) {
          return this.instantiationService.createInstance(NotebookFindFilterActionViewItem, this.filters, action, options, this._register(new ActionRunner()));
        }
        return void 0;
      }
    }));
    this._actionbar.push(this._filtersAction, { icon: true, label: false });
  }
}
class NotebookFindInput extends FindInput {
  constructor(filters, contextKeyService, contextMenuService, instantiationService, parent, contextViewProvider, options) {
    super(parent, contextViewProvider, options);
    this.filters = filters;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._filterChecked = false;
    this._register(registerAndCreateHistoryNavigationContext(contextKeyService, this.inputBox));
    this._findFilter = this._register(new NotebookFindInputFilterButton(filters, contextMenuService, instantiationService, options));
    this.inputBox.paddingRight = (this.caseSensitive?.width() ?? 0) + (this.wholeWords?.width() ?? 0) + (this.regex?.width() ?? 0) + this._findFilter.width();
    this.controls.appendChild(this._findFilter.container);
  }
  setEnabled(enabled) {
    super.setEnabled(enabled);
    if (enabled && !this._filterChecked) {
      this.regex?.enable();
    } else {
      this.regex?.disable();
    }
  }
  updateFilterState(changed) {
    this._filterChecked = changed;
    if (this.regex) {
      if (this._filterChecked) {
        this.regex.disable();
        this.regex.domNode.tabIndex = -1;
        this.regex.domNode.classList.toggle("disabled", true);
      } else {
        this.regex.enable();
        this.regex.domNode.tabIndex = 0;
        this.regex.domNode.classList.toggle("disabled", false);
      }
    }
    this._findFilter.applyStyles(this._filterChecked);
  }
  getToggleDomNodes() {
    const nodes = super.getToggleDomNodes();
    nodes.push(this._findFilter.container);
    return nodes;
  }
  getCellToolbarActions(menu) {
    return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), (g) => /^inline/.test(g));
  }
}
let SimpleFindReplaceWidget = class extends Widget {
  constructor(_contextViewService, contextKeyService, _configurationService, contextMenuService, instantiationService, hoverService, _state = new FindReplaceState(), _notebookEditor, _findWidgetSearchHistory, _replaceWidgetHistory) {
    super();
    this._contextViewService = _contextViewService;
    this._configurationService = _configurationService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this._state = _state;
    this._notebookEditor = _notebookEditor;
    this._findWidgetSearchHistory = _findWidgetSearchHistory;
    this._replaceWidgetHistory = _replaceWidgetHistory;
    this._resizeOriginalWidth = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
    this._isVisible = false;
    this._isReplaceVisible = false;
    this.foundMatch = false;
    this.cellSelectionDecorationIds = [];
    this.textSelectionDecorationIds = [];
    this._register(this._state);
    const findFilters = this._configurationService.getValue(NotebookSetting.findFilters) ?? { markupSource: true, markupPreview: true, codeSource: true, codeOutput: true };
    const findHistoryConfig = this._configurationService.getValue("editor.find.history");
    const replaceHistoryConfig = this._configurationService.getValue("editor.find.replaceHistory");
    this._filters = this._register(new NotebookFindFilters(findFilters.markupSource, findFilters.markupPreview, findFilters.codeSource, findFilters.codeOutput, { findScopeType: NotebookFindScopeType.None }));
    this._state.change({ filters: this._filters }, false);
    this._register(this._filters.onDidChange(() => {
      this._state.change({ filters: this._filters }, false);
    }));
    this._domNode = document.createElement("div");
    this._domNode.classList.add("simple-fr-find-part-wrapper");
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(NotebookSetting.globalToolbar)) {
        if (this._notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
          this._domNode.style.top = "26px";
        } else {
          this._domNode.style.top = "0px";
        }
      }
    }));
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._scopedContextKeyService = this._register(contextKeyService.createScoped(this._domNode));
    const progressContainer = dom.$(".find-replace-progress");
    this._progressBar = this._register(new ProgressBar(progressContainer, defaultProgressBarStyles));
    this._domNode.appendChild(progressContainer);
    const isInteractiveWindow = contextKeyService.getContextKeyValue("notebookType") === "interactive";
    const hoverLifecycleOptions = { groupId: "simple-find-widget" };
    this._toggleReplaceBtn = this._register(new SimpleButton({
      label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
      className: "codicon toggle left",
      hoverLifecycleOptions,
      onTrigger: isInteractiveWindow ? () => {
      } : () => {
        this._isReplaceVisible = !this._isReplaceVisible;
        this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
        this._updateReplaceViewDisplay();
      }
    }, hoverService));
    this._toggleReplaceBtn.setEnabled(!isInteractiveWindow);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this._domNode.appendChild(this._toggleReplaceBtn.domNode);
    this._innerFindDomNode = document.createElement("div");
    this._innerFindDomNode.classList.add("simple-fr-find-part");
    this._findInput = this._register(new NotebookFindInput(
      this._filters,
      this._scopedContextKeyService,
      this.contextMenuService,
      this.instantiationService,
      null,
      this._contextViewService,
      {
        // width:FIND_INPUT_AREA_WIDTH,
        label: NLS_FIND_INPUT_LABEL,
        placeholder: NLS_FIND_INPUT_PLACEHOLDER,
        validation: (value) => {
          if (value.length === 0 || !this._findInput.getRegex()) {
            return null;
          }
          try {
            new RegExp(value);
            return null;
          } catch (e) {
            this.foundMatch = false;
            this.updateButtons(this.foundMatch);
            return { content: e.message };
          }
        },
        flexibleWidth: true,
        showCommonFindToggles: true,
        inputBoxStyles: defaultInputBoxStyles,
        toggleStyles: defaultToggleStyles,
        history: findHistoryConfig === "workspace" ? this._findWidgetSearchHistory : /* @__PURE__ */ new Set([])
      }
    ));
    this._updateFindHistoryDelayer = new Delayer(500);
    this.oninput(this._findInput.domNode, (e) => {
      this.foundMatch = this.onInputChanged();
      this.updateButtons(this.foundMatch);
      this._delayedUpdateFindHistory();
    });
    this._register(this._findInput.inputBox.onDidChange(() => {
      this._state.change({ searchString: this._findInput.getValue() }, true);
    }));
    this._findInput.setRegex(!!this._state.isRegex);
    this._findInput.setCaseSensitive(!!this._state.matchCase);
    this._findInput.setWholeWords(!!this._state.wholeWord);
    this._register(this._findInput.onDidOptionChange(() => {
      this._state.change({
        isRegex: this._findInput.getRegex(),
        wholeWord: this._findInput.getWholeWords(),
        matchCase: this._findInput.getCaseSensitive()
      }, true);
    }));
    this._register(this._state.onFindReplaceStateChange(() => {
      this._findInput.setRegex(this._state.isRegex);
      this._findInput.setWholeWords(this._state.wholeWord);
      this._findInput.setCaseSensitive(this._state.matchCase);
      this._replaceInput.setPreserveCase(this._state.preserveCase);
    }));
    this._matchesCount = document.createElement("div");
    this._matchesCount.className = "matchesCount";
    this._updateMatchesCount();
    this.prevBtn = this._register(new SimpleButton({
      label: NLS_PREVIOUS_MATCH_BTN_LABEL,
      icon: findPreviousMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(true);
      }
    }, hoverService));
    this.nextBtn = this._register(new SimpleButton({
      label: NLS_NEXT_MATCH_BTN_LABEL,
      icon: findNextMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.find(false);
      }
    }, hoverService));
    this.inSelectionToggle = this._register(new Toggle({
      icon: findSelectionIcon,
      title: NLS_TOGGLE_SELECTION_FIND_TITLE,
      isChecked: false,
      hoverLifecycleOptions,
      inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
      inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
      inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground)
    }));
    this.inSelectionToggle.domNode.style.display = "inline";
    this._register(this.inSelectionToggle.onChange(() => {
      const checked = this.inSelectionToggle.checked;
      if (checked) {
        const cellSelection = this._notebookEditor.getSelections();
        const textSelection = this._notebookEditor.getSelectionViewModels()[0].getSelections();
        if (cellSelection.length > 1 || cellSelection.some((range) => range.end - range.start > 1)) {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Cells,
            selectedCellRanges: cellSelection
          };
          this.setCellSelectionDecorations();
        } else if (textSelection.length > 1 || textSelection.some((range) => range.endLineNumber - range.startLineNumber >= 1)) {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Text,
            selectedCellRanges: cellSelection,
            selectedTextRanges: textSelection
          };
          this.setTextSelectionDecorations(textSelection, this._notebookEditor.getSelectionViewModels()[0]);
        } else {
          this._filters.findScope = {
            findScopeType: NotebookFindScopeType.Cells,
            selectedCellRanges: cellSelection
          };
          this.setCellSelectionDecorations();
        }
      } else {
        this._filters.findScope = {
          findScopeType: NotebookFindScopeType.None
        };
        this.clearCellSelectionDecorations();
        this.clearTextSelectionDecorations();
      }
    }));
    const closeBtn = this._register(new SimpleButton({
      label: NLS_CLOSE_BTN_LABEL,
      icon: widgetClose,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.hide();
      }
    }, hoverService));
    this._innerFindDomNode.appendChild(this._findInput.domNode);
    this._innerFindDomNode.appendChild(this._matchesCount);
    this._innerFindDomNode.appendChild(this.prevBtn.domNode);
    this._innerFindDomNode.appendChild(this.nextBtn.domNode);
    this._innerFindDomNode.appendChild(this.inSelectionToggle.domNode);
    this._innerFindDomNode.appendChild(closeBtn.domNode);
    this._domNode.appendChild(this._innerFindDomNode);
    this.onkeyup(this._innerFindDomNode, (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
        e.preventDefault();
        return;
      }
    });
    this._focusTracker = this._register(dom.trackFocus(this._domNode));
    this._register(this._focusTracker.onDidFocus(this.onFocusTrackerFocus.bind(this)));
    this._register(this._focusTracker.onDidBlur(this.onFocusTrackerBlur.bind(this)));
    this._findInputFocusTracker = this._register(dom.trackFocus(this._findInput.domNode));
    this._register(this._findInputFocusTracker.onDidFocus(this.onFindInputFocusTrackerFocus.bind(this)));
    this._register(this._findInputFocusTracker.onDidBlur(this.onFindInputFocusTrackerBlur.bind(this)));
    this._register(dom.addDisposableListener(this._innerFindDomNode, "click", (event) => {
      event.stopPropagation();
    }));
    this._innerReplaceDomNode = document.createElement("div");
    this._innerReplaceDomNode.classList.add("simple-fr-replace-part");
    this._replaceInput = this._register(new ContextScopedReplaceInput(null, void 0, {
      label: NLS_REPLACE_INPUT_LABEL,
      placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
      history: replaceHistoryConfig === "workspace" ? this._replaceWidgetHistory : /* @__PURE__ */ new Set([]),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      hoverLifecycleOptions
    }, contextKeyService, false));
    this._innerReplaceDomNode.appendChild(this._replaceInput.domNode);
    this._replaceInputFocusTracker = this._register(dom.trackFocus(this._replaceInput.domNode));
    this._register(this._replaceInputFocusTracker.onDidFocus(this.onReplaceInputFocusTrackerFocus.bind(this)));
    this._register(this._replaceInputFocusTracker.onDidBlur(this.onReplaceInputFocusTrackerBlur.bind(this)));
    this._updateReplaceHistoryDelayer = new Delayer(500);
    this.oninput(this._replaceInput.domNode, (e) => {
      this._delayedUpdateReplaceHistory();
    });
    this._register(this._replaceInput.inputBox.onDidChange(() => {
      this._state.change({ replaceString: this._replaceInput.getValue() }, true);
    }));
    this._domNode.appendChild(this._innerReplaceDomNode);
    this._updateReplaceViewDisplay();
    this._replaceBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_BTN_LABEL,
      icon: findReplaceIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.replaceOne();
      }
    }, hoverService));
    this._replaceAllBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_ALL_BTN_LABEL,
      icon: findReplaceAllIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this.replaceAll();
      }
    }, hoverService));
    this._innerReplaceDomNode.appendChild(this._replaceBtn.domNode);
    this._innerReplaceDomNode.appendChild(this._replaceAllBtn.domNode);
    this._resizeSash = this._register(new Sash(this._domNode, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL, size: 2 }));
    this._register(this._resizeSash.onDidStart(() => {
      this._resizeOriginalWidth = this._getDomWidth();
    }));
    this._register(this._resizeSash.onDidChange((evt) => {
      let width = this._resizeOriginalWidth + evt.startX - evt.currentX;
      if (width < NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
        width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
      }
      const maxWidth = this._getMaxWidth();
      if (width > maxWidth) {
        width = maxWidth;
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
    this._register(this._resizeSash.onDidReset(() => {
      const currentWidth = this._getDomWidth();
      let width = NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH;
      if (currentWidth <= NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH) {
        width = this._getMaxWidth();
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
  }
  _getMaxWidth() {
    return this._notebookEditor.getLayoutInfo().width - 64;
  }
  _getDomWidth() {
    return dom.getTotalWidth(this._domNode) - NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING * 2;
  }
  getCellToolbarActions(menu) {
    return getActionBarActions(menu.getActions({ shouldForwardArgs: true }), (g) => /^inline/.test(g));
  }
  get inputValue() {
    return this._findInput.getValue();
  }
  get replaceValue() {
    return this._replaceInput.getValue();
  }
  get replacePattern() {
    if (this._state.isRegex) {
      return parseReplaceString(this.replaceValue);
    }
    return ReplacePattern.fromStaticValue(this.replaceValue);
  }
  get focusTracker() {
    return this._focusTracker;
  }
  get isVisible() {
    return this._isVisible;
  }
  _onStateChanged(e) {
    this._updateButtons();
    this._updateMatchesCount();
  }
  _updateButtons() {
    this._findInput.setEnabled(this._isVisible);
    this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
    const findInputIsNonEmpty = this._state.searchString.length > 0;
    this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._domNode.classList.toggle("replaceToggled", this._isReplaceVisible);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this.foundMatch = this._state.matchesCount > 0;
    this.updateButtons(this.foundMatch);
  }
  setCellSelectionDecorations() {
    const cellHandles = [];
    this._notebookEditor.getSelectionViewModels().forEach((viewModel) => {
      cellHandles.push(viewModel.handle);
    });
    const decorations = [];
    for (const handle of cellHandles) {
      decorations.push({
        handle,
        options: { className: "nb-multiCellHighlight", outputClassName: "nb-multiCellHighlight" }
      });
    }
    this.cellSelectionDecorationIds = this._notebookEditor.deltaCellDecorations([], decorations);
  }
  clearCellSelectionDecorations() {
    this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
  }
  setTextSelectionDecorations(textRanges, cell) {
    this._notebookEditor.changeModelDecorations((changeAccessor) => {
      const decorations = [];
      for (const range of textRanges) {
        decorations.push({
          ownerId: cell.handle,
          decorations: [{
            range,
            options: {
              description: "text search range for notebook search scope",
              isWholeLine: true,
              className: "nb-findScope"
            }
          }]
        });
      }
      this.textSelectionDecorationIds = changeAccessor.deltaDecorations([], decorations);
    });
  }
  clearTextSelectionDecorations() {
    this._notebookEditor.changeModelDecorations((changeAccessor) => {
      changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
    });
  }
  _updateMatchesCount() {
  }
  dispose() {
    super.dispose();
    this._domNode.remove();
  }
  getDomNode() {
    return this._domNode;
  }
  reveal(initialInput) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    if (this._isVisible) {
      this._findInput.select();
      return;
    }
    this._isVisible = true;
    this.updateButtons(this.foundMatch);
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      this._findInput.select();
    }, 0);
  }
  focus() {
    this._findInput.focus();
  }
  show(initialInput, options) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    this._isVisible = true;
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      if (options?.focus ?? true) {
        this.focus();
      }
    }, 0);
  }
  showWithReplace(initialInput, replaceInput) {
    if (initialInput) {
      this._findInput.setValue(initialInput);
    }
    if (replaceInput) {
      this._replaceInput.setValue(replaceInput);
    }
    this._isVisible = true;
    this._isReplaceVisible = true;
    this._state.change({ isReplaceRevealed: this._isReplaceVisible }, false);
    this._updateReplaceViewDisplay();
    setTimeout(() => {
      this._domNode.classList.add("visible", "visible-transition");
      this._domNode.setAttribute("aria-hidden", "false");
      this._updateButtons();
      this._replaceInput.focus();
    }, 0);
  }
  _updateReplaceViewDisplay() {
    if (this._isReplaceVisible) {
      this._innerReplaceDomNode.style.display = "flex";
    } else {
      this._innerReplaceDomNode.style.display = "none";
    }
    this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
  }
  hide() {
    if (this._isVisible) {
      this.inSelectionToggle.checked = false;
      this._notebookEditor.deltaCellDecorations(this.cellSelectionDecorationIds, []);
      this._notebookEditor.changeModelDecorations((changeAccessor) => {
        changeAccessor.deltaDecorations(this.textSelectionDecorationIds, []);
      });
      this._domNode.classList.remove("visible-transition");
      this._domNode.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        this._isVisible = false;
        this.updateButtons(this.foundMatch);
        this._domNode.classList.remove("visible");
      }, 200);
    }
  }
  _delayedUpdateFindHistory() {
    this._updateFindHistoryDelayer.trigger(this._updateFindHistory.bind(this));
  }
  _updateFindHistory() {
    this._findInput.inputBox.addToHistory();
  }
  _delayedUpdateReplaceHistory() {
    this._updateReplaceHistoryDelayer.trigger(this._updateReplaceHistory.bind(this));
  }
  _updateReplaceHistory() {
    this._replaceInput.inputBox.addToHistory();
  }
  _getRegexValue() {
    return this._findInput.getRegex();
  }
  _getWholeWordValue() {
    return this._findInput.getWholeWords();
  }
  _getCaseSensitiveValue() {
    return this._findInput.getCaseSensitive();
  }
  updateButtons(foundMatch) {
    const hasInput = this.inputValue.length > 0;
    this.prevBtn.setEnabled(this._isVisible && hasInput && foundMatch);
    this.nextBtn.setEnabled(this._isVisible && hasInput && foundMatch);
  }
};
SimpleFindReplaceWidget = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IHoverService)
], SimpleFindReplaceWidget);
registerThemingParticipant((theme, collector) => {
  collector.addRule(`
	.notebook-editor {
		--notebook-find-width: ${NOTEBOOK_FIND_WIDGET_INITIAL_WIDTH}px;
		--notebook-find-horizontal-padding: ${NOTEBOOK_FIND_WIDGET_INITIAL_HORIZONTAL_PADDING}px;
	}
	`);
});
export {
  NotebookFindInput,
  NotebookFindInputFilterButton,
  SimpleFindReplaceWidget,
  findFilterButton
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL25vdGVib29rRmluZFJlcGxhY2VXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAnLi9ub3RlYm9va0ZpbmRSZXBsYWNlV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBJQ29udGV4dFZpZXdQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEZpbmRJbnB1dCwgSUZpbmRJbnB1dE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZmluZGlucHV0L2ZpbmRJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZmluZGlucHV0L3JlcGxhY2VJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTWVzc2FnZSBhcyBJbnB1dEJveE1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3NCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcHJvZ3Jlc3NiYXIvcHJvZ3Jlc3NiYXIuanMnO1xuaW1wb3J0IHsgSVNhc2hFdmVudCwgT3JpZW50YXRpb24sIFNhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElUb2dnbGVTdHlsZXMsIFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzU2FmYXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUhpc3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlLCBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBmaW5kTmV4dE1hdGNoSWNvbiwgZmluZFByZXZpb3VzTWF0Y2hJY29uLCBmaW5kUmVwbGFjZUFsbEljb24sIGZpbmRSZXBsYWNlSWNvbiwgZmluZFNlbGVjdGlvbkljb24sIFNpbXBsZUJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IHBhcnNlUmVwbGFjZVN0cmluZywgUmVwbGFjZVBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvcmVwbGFjZVBhdHRlcm4uanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRSZXBsYWNlSW5wdXQsIHJlZ2lzdGVyQW5kQ3JlYXRlSGlzdG9yeU5hdmlnYXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2NvbnRleHRTY29wZWRIaXN0b3J5V2lkZ2V0LmpzJztcblxuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcywgZGVmYXVsdFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsIGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyLCBpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24sIHdpZGdldENsb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZmlsdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zSWNvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tGaW5kRmlsdGVycyB9IGZyb20gJy4vZmluZEZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSVNob3dOb3RlYm9va0ZpbmRXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi9ub3RlYm9va0ZpbmRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNlbGxNb2RlbERlY29yYXRpb25zLCBJQ2VsbE1vZGVsRGVsdGFEZWNvcmF0aW9ucywgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0RlbHRhRGVjb3JhdGlvbiwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZFNjb3BlVHlwZSwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuXG5cbmNvbnN0IE5MU19GSU5EX0lOUFVUX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5maW5kJywgXCJGaW5kXCIpO1xuY29uc3QgTkxTX0ZJTkRfSU5QVVRfUExBQ0VIT0xERVIgPSBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLmZpbmQnLCBcIkZpbmRcIik7XG5jb25zdCBOTFNfUFJFVklPVVNfTUFUQ0hfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5wcmV2aW91c01hdGNoQnV0dG9uJywgXCJQcmV2aW91cyBNYXRjaFwiKTtcbmNvbnN0IE5MU19ORVhUX01BVENIX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwubmV4dE1hdGNoQnV0dG9uJywgXCJOZXh0IE1hdGNoXCIpO1xuY29uc3QgTkxTX1RPR0dMRV9TRUxFQ1RJT05fRklORF9USVRMRSA9IG5scy5sb2NhbGl6ZSgnbGFiZWwudG9nZ2xlU2VsZWN0aW9uRmluZCcsIFwiRmluZCBpbiBTZWxlY3Rpb25cIik7XG5jb25zdCBOTFNfQ0xPU0VfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5jbG9zZUJ1dHRvbicsIFwiQ2xvc2VcIik7XG5jb25zdCBOTFNfVE9HR0xFX1JFUExBQ0VfTU9ERV9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnRvZ2dsZVJlcGxhY2VCdXR0b24nLCBcIlRvZ2dsZSBSZXBsYWNlXCIpO1xuY29uc3QgTkxTX1JFUExBQ0VfSU5QVVRfTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnJlcGxhY2UnLCBcIlJlcGxhY2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9JTlBVVF9QTEFDRUhPTERFUiA9IG5scy5sb2NhbGl6ZSgncGxhY2Vob2xkZXIucmVwbGFjZScsIFwiUmVwbGFjZVwiKTtcbmNvbnN0IE5MU19SRVBMQUNFX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwucmVwbGFjZUJ1dHRvbicsIFwiUmVwbGFjZVwiKTtcbmNvbnN0IE5MU19SRVBMQUNFX0FMTF9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnJlcGxhY2VBbGxCdXR0b24nLCBcIlJlcGxhY2UgQWxsXCIpO1xuXG5leHBvcnQgY29uc3QgZmluZEZpbHRlckJ1dHRvbiA9IHJlZ2lzdGVySWNvbignZmluZC1maWx0ZXInLCBDb2RpY29uLmZpbHRlciwgbmxzLmxvY2FsaXplKCdmaW5kRmlsdGVySWNvbicsICdJY29uIGZvciBGaW5kIEZpbHRlciBpbiBmaW5kIHdpZGdldC4nKSk7XG5jb25zdCBOT1RFQk9PS19GSU5EX0ZJTFRFUlMgPSBubHMubG9jYWxpemUoJ25vdGVib29rLmZpbmQuZmlsdGVyLmZpbHRlckFjdGlvbicsIFwiRmluZCBGaWx0ZXJzXCIpO1xuY29uc3QgTk9URUJPT0tfRklORF9JTl9NQVJLVVBfSU5QVVQgPSBubHMubG9jYWxpemUoJ25vdGVib29rLmZpbmQuZmlsdGVyLmZpbmRJbk1hcmt1cElucHV0JywgXCJNYXJrZG93biBTb3VyY2VcIik7XG5jb25zdCBOT1RFQk9PS19GSU5EX0lOX01BUktVUF9QUkVWSUVXID0gbmxzLmxvY2FsaXplKCdub3RlYm9vay5maW5kLmZpbHRlci5maW5kSW5NYXJrdXBQcmV2aWV3JywgXCJSZW5kZXJlZCBNYXJrZG93blwiKTtcbmNvbnN0IE5PVEVCT09LX0ZJTkRfSU5fQ09ERV9JTlBVVCA9IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZmluZC5maWx0ZXIuZmluZEluQ29kZUlucHV0JywgXCJDb2RlIENlbGwgU291cmNlXCIpO1xuY29uc3QgTk9URUJPT0tfRklORF9JTl9DT0RFX09VVFBVVCA9IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suZmluZC5maWx0ZXIuZmluZEluQ29kZU91dHB1dCcsIFwiQ29kZSBDZWxsIE91dHB1dFwiKTtcblxuY29uc3QgTk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCA9IDQxOTtcbmNvbnN0IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfSE9SSVpPTlRBTF9QQURESU5HID0gNDtcbmNsYXNzIE5vdGVib29rRmluZEZpbHRlckFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBmaWx0ZXJzOiBOb3RlYm9va0ZpbmRGaWx0ZXJzLCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsIGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lciwgQElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoYWN0aW9uLFxuXHRcdFx0eyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldEFjdGlvbnMoKSB9LFxuXHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMudXBkYXRlQ2hlY2tlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgbWFya2Rvd25JbnB1dDogSUFjdGlvbiA9IHtcblx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5tYXJrdXBJbnB1dCxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdmaW5kSW5NYXJrZG93bklucHV0Jyxcblx0XHRcdGxhYmVsOiBOT1RFQk9PS19GSU5EX0lOX01BUktVUF9JTlBVVCxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZpbHRlcnMubWFya3VwSW5wdXQgPSAhdGhpcy5maWx0ZXJzLm1hcmt1cElucHV0O1xuXHRcdFx0fSxcblx0XHRcdHRvb2x0aXA6ICcnXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1hcmtkb3duUHJldmlldzogSUFjdGlvbiA9IHtcblx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5tYXJrdXBQcmV2aWV3LFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2ZpbmRJbk1hcmtkb3duSW5wdXQnLFxuXHRcdFx0bGFiZWw6IE5PVEVCT09LX0ZJTkRfSU5fTUFSS1VQX1BSRVZJRVcsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5maWx0ZXJzLm1hcmt1cFByZXZpZXcgPSAhdGhpcy5maWx0ZXJzLm1hcmt1cFByZXZpZXc7XG5cdFx0XHR9LFxuXHRcdFx0dG9vbHRpcDogJydcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29kZUlucHV0OiBJQWN0aW9uID0ge1xuXHRcdFx0Y2hlY2tlZDogdGhpcy5maWx0ZXJzLmNvZGVJbnB1dCxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWQ6ICdmaW5kSW5Db2RlSW5wdXQnLFxuXHRcdFx0bGFiZWw6IE5PVEVCT09LX0ZJTkRfSU5fQ09ERV9JTlBVVCxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZpbHRlcnMuY29kZUlucHV0ID0gIXRoaXMuZmlsdGVycy5jb2RlSW5wdXQ7XG5cdFx0XHR9LFxuXHRcdFx0dG9vbHRpcDogJydcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29kZU91dHB1dCA9IHtcblx0XHRcdGNoZWNrZWQ6IHRoaXMuZmlsdGVycy5jb2RlT3V0cHV0LFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2ZpbmRJbkNvZGVPdXRwdXQnLFxuXHRcdFx0bGFiZWw6IE5PVEVCT09LX0ZJTkRfSU5fQ09ERV9PVVRQVVQsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5maWx0ZXJzLmNvZGVPdXRwdXQgPSAhdGhpcy5maWx0ZXJzLmNvZGVPdXRwdXQ7XG5cdFx0XHR9LFxuXHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBudWxsXG5cdFx0fTtcblxuXHRcdGlmIChpc1NhZmFyaSkge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bWFya2Rvd25JbnB1dCxcblx0XHRcdFx0Y29kZUlucHV0XG5cdFx0XHRdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRtYXJrZG93bklucHV0LFxuXHRcdFx0XHRtYXJrZG93blByZXZpZXcsXG5cdFx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdFx0Y29kZUlucHV0LFxuXHRcdFx0XHRjb2RlT3V0cHV0LFxuXHRcdFx0XTtcblx0XHR9XG5cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCEuY2xhc3NMaXN0LnRvZ2dsZSgnY2hlY2tlZCcsIHRoaXMuX2FjdGlvbi5jaGVja2VkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tGaW5kSW5wdXRGaWx0ZXJCdXR0b24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZmlsdGVyQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfYWN0aW9uYmFyOiBBY3Rpb25CYXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZmlsdGVyc0FjdGlvbjogSUFjdGlvbjtcblx0cHJpdmF0ZSBfdG9nZ2xlU3R5bGVzOiBJVG9nZ2xlU3R5bGVzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGZpbHRlcnM6IE5vdGVib29rRmluZEZpbHRlcnMsXG5cdFx0cmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0b3B0aW9uczogSUZpbmRJbnB1dE9wdGlvbnMsXG5cdFx0dG9vbHRpcDogc3RyaW5nID0gTk9URUJPT0tfRklORF9GSUxURVJTLFxuXHQpIHtcblxuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdG9nZ2xlU3R5bGVzID0gb3B0aW9ucy50b2dnbGVTdHlsZXM7XG5cblx0XHR0aGlzLl9maWx0ZXJzQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbignbm90ZWJvb2tGaW5kRmlsdGVyQWN0aW9uJywgdG9vbHRpcCwgJ25vdGVib29rLWZpbHRlcnMgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShmaWx0ZXJJY29uKSkpO1xuXHRcdHRoaXMuX2ZpbHRlcnNBY3Rpb24uY2hlY2tlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lciA9IGRvbS4kKCcuZmluZC1maWx0ZXItYnV0dG9uJyk7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby1jdXN0b20tdG9nZ2xlJyk7XG5cdFx0dGhpcy5jcmVhdGVGaWx0ZXJzKHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lcik7XG5cdH1cblxuXHRnZXQgY29udGFpbmVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXI7XG5cdH1cblxuXHR3aWR0aCgpIHtcblx0XHRyZXR1cm4gMiAvKm1hcmdpbiBsZWZ0Ki8gKyAyIC8qYm9yZGVyKi8gKyAyIC8qcGFkZGluZyovICsgMTYgLyogaWNvbiB3aWR0aCAqLztcblx0fVxuXG5cdGVuYWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoZmFsc2UpKTtcblx0fVxuXG5cdGRpc2FibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWRpc2FibGVkJywgU3RyaW5nKHRydWUpKTtcblx0fVxuXG5cdHNldCB2aXNpYmxlKHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZpc2libGUgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdGdldCB2aXNpYmxlKCkge1xuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHR9XG5cblx0YXBwbHlTdHlsZXMoZmlsdGVyQ2hlY2tlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRvZ2dsZVN0eWxlcyA9IHRoaXMuX3RvZ2dsZVN0eWxlcztcblxuXHRcdHRoaXMuX2ZpbHRlckJ1dHRvbkNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHRyYW5zcGFyZW50Jztcblx0XHR0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzNweCc7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmJvcmRlckNvbG9yID0gKGZpbHRlckNoZWNrZWQgJiYgdG9nZ2xlU3R5bGVzLmlucHV0QWN0aXZlT3B0aW9uQm9yZGVyKSB8fCAnJztcblx0XHR0aGlzLl9maWx0ZXJCdXR0b25Db250YWluZXIuc3R5bGUuY29sb3IgPSAoZmlsdGVyQ2hlY2tlZCAmJiB0b2dnbGVTdHlsZXMuaW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kKSB8fCAnaW5oZXJpdCc7XG5cdFx0dGhpcy5fZmlsdGVyQnV0dG9uQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IChmaWx0ZXJDaGVja2VkICYmIHRvZ2dsZVN0eWxlcy5pbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQpIHx8ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVGaWx0ZXJzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3Rpb25iYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGNvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSB0aGlzLl9maWx0ZXJzQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tGaW5kRmlsdGVyQWN0aW9uVmlld0l0ZW0sIHRoaXMuZmlsdGVycywgYWN0aW9uLCBvcHRpb25zLCB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uUnVubmVyKCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9hY3Rpb25iYXIucHVzaCh0aGlzLl9maWx0ZXJzQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tGaW5kSW5wdXQgZXh0ZW5kcyBGaW5kSW5wdXQge1xuXHRwcml2YXRlIF9maW5kRmlsdGVyOiBOb3RlYm9va0ZpbmRJbnB1dEZpbHRlckJ1dHRvbjtcblx0cHJpdmF0ZSBfZmlsdGVyQ2hlY2tlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGZpbHRlcnM6IE5vdGVib29rRmluZEZpbHRlcnMsXG5cdFx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRyZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwYXJlbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCxcblx0XHRjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlcixcblx0XHRvcHRpb25zOiBJRmluZElucHV0T3B0aW9ucyxcblx0KSB7XG5cdFx0c3VwZXIocGFyZW50LCBjb250ZXh0Vmlld1Byb3ZpZGVyLCBvcHRpb25zKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQW5kQ3JlYXRlSGlzdG9yeU5hdmlnYXRpb25Db250ZXh0KGNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmlucHV0Qm94KSk7XG5cdFx0dGhpcy5fZmluZEZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0ZpbmRJbnB1dEZpbHRlckJ1dHRvbihmaWx0ZXJzLCBjb250ZXh0TWVudVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcHRpb25zKSk7XG5cblx0XHR0aGlzLmlucHV0Qm94LnBhZGRpbmdSaWdodCA9ICh0aGlzLmNhc2VTZW5zaXRpdmU/LndpZHRoKCkgPz8gMCkgKyAodGhpcy53aG9sZVdvcmRzPy53aWR0aCgpID8/IDApICsgKHRoaXMucmVnZXg/LndpZHRoKCkgPz8gMCkgKyB0aGlzLl9maW5kRmlsdGVyLndpZHRoKCk7XG5cdFx0dGhpcy5jb250cm9scy5hcHBlbmRDaGlsZCh0aGlzLl9maW5kRmlsdGVyLmNvbnRhaW5lcik7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHRzdXBlci5zZXRFbmFibGVkKGVuYWJsZWQpO1xuXHRcdGlmIChlbmFibGVkICYmICF0aGlzLl9maWx0ZXJDaGVja2VkKSB7XG5cdFx0XHR0aGlzLnJlZ2V4Py5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZWdleD8uZGlzYWJsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZUZpbHRlclN0YXRlKGNoYW5nZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9maWx0ZXJDaGVja2VkID0gY2hhbmdlZDtcblx0XHRpZiAodGhpcy5yZWdleCkge1xuXHRcdFx0aWYgKHRoaXMuX2ZpbHRlckNoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy5yZWdleC5kaXNhYmxlKCk7XG5cdFx0XHRcdHRoaXMucmVnZXguZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHR0aGlzLnJlZ2V4LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVnZXguZW5hYmxlKCk7XG5cdFx0XHRcdHRoaXMucmVnZXguZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0XHRcdHRoaXMucmVnZXguZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZmluZEZpbHRlci5hcHBseVN0eWxlcyh0aGlzLl9maWx0ZXJDaGVja2VkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb2dnbGVEb21Ob2RlcygpOiBIVE1MRWxlbWVudFtdIHtcblx0XHRjb25zdCBub2RlcyA9IHN1cGVyLmdldFRvZ2dsZURvbU5vZGVzKCk7XG5cdFx0bm9kZXMucHVzaCh0aGlzLl9maW5kRmlsdGVyLmNvbnRhaW5lcik7XG5cdFx0cmV0dXJuIG5vZGVzO1xuXHR9XG5cblx0Z2V0Q2VsbFRvb2xiYXJBY3Rpb25zKG1lbnU6IElNZW51KTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRcdHJldHVybiBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCBnID0+IC9eaW5saW5lLy50ZXN0KGcpKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU2ltcGxlRmluZFJlcGxhY2VXaWRnZXQgZXh0ZW5kcyBXaWRnZXQge1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2ZpbmRJbnB1dDogTm90ZWJvb2tGaW5kSW5wdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbm5lckZpbmREb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZmluZElucHV0Rm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlRmluZEhpc3RvcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX21hdGNoZXNDb3VudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZCdG46IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBuZXh0QnRuOiBTaW1wbGVCdXR0b247XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9yZXBsYWNlSW5wdXQhOiBSZXBsYWNlSW5wdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubmVyUmVwbGFjZURvbU5vZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdG9nZ2xlUmVwbGFjZUJ0biE6IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyITogZG9tLklGb2N1c1RyYWNrZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZVJlcGxhY2VIaXN0b3J5RGVsYXllcjogRGVsYXllcjx2b2lkPjtcblx0cHJvdGVjdGVkIF9yZXBsYWNlQnRuITogU2ltcGxlQnV0dG9uO1xuXHRwcm90ZWN0ZWQgX3JlcGxhY2VBbGxCdG4hOiBTaW1wbGVCdXR0b247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzaXplU2FzaDogU2FzaDtcblx0cHJpdmF0ZSBfcmVzaXplT3JpZ2luYWxXaWR0aCA9IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEg7XG5cblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUmVwbGFjZVZpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBmb3VuZE1hdGNoOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJvdGVjdGVkIF9wcm9ncmVzc0JhciE6IFByb2dyZXNzQmFyO1xuXHRwcm90ZWN0ZWQgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHJpdmF0ZSBfZmlsdGVyczogTm90ZWJvb2tGaW5kRmlsdGVycztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGluU2VsZWN0aW9uVG9nZ2xlOiBUb2dnbGU7XG5cdHByaXZhdGUgY2VsbFNlbGVjdGlvbkRlY29yYXRpb25JZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgdGV4dFNlbGVjdGlvbkRlY29yYXRpb25JZHM6IElDZWxsTW9kZWxEZWNvcmF0aW9uc1tdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zdGF0ZTogRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPiA9IG5ldyBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+KCksXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5OiBJSGlzdG9yeTxzdHJpbmc+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxhY2VXaWRnZXRIaXN0b3J5OiBJSGlzdG9yeTxzdHJpbmc+IHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGUpO1xuXG5cdFx0Y29uc3QgZmluZEZpbHRlcnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7XG5cdFx0XHRtYXJrdXBTb3VyY2U6IGJvb2xlYW47XG5cdFx0XHRtYXJrdXBQcmV2aWV3OiBib29sZWFuO1xuXHRcdFx0Y29kZVNvdXJjZTogYm9vbGVhbjtcblx0XHRcdGNvZGVPdXRwdXQ6IGJvb2xlYW47XG5cdFx0fT4oTm90ZWJvb2tTZXR0aW5nLmZpbmRGaWx0ZXJzKSA/PyB7IG1hcmt1cFNvdXJjZTogdHJ1ZSwgbWFya3VwUHJldmlldzogdHJ1ZSwgY29kZVNvdXJjZTogdHJ1ZSwgY29kZU91dHB1dDogdHJ1ZSB9O1xuXG5cdFx0Y29uc3QgZmluZEhpc3RvcnlDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnbmV2ZXInIHwgJ3dvcmtzcGFjZSc+KCdlZGl0b3IuZmluZC5oaXN0b3J5Jyk7XG5cdFx0Y29uc3QgcmVwbGFjZUhpc3RvcnlDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnbmV2ZXInIHwgJ3dvcmtzcGFjZSc+KCdlZGl0b3IuZmluZC5yZXBsYWNlSGlzdG9yeScpO1xuXG5cdFx0dGhpcy5fZmlsdGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0ZpbmRGaWx0ZXJzKGZpbmRGaWx0ZXJzLm1hcmt1cFNvdXJjZSwgZmluZEZpbHRlcnMubWFya3VwUHJldmlldywgZmluZEZpbHRlcnMuY29kZVNvdXJjZSwgZmluZEZpbHRlcnMuY29kZU91dHB1dCwgeyBmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuTm9uZSB9KSk7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgZmlsdGVyczogdGhpcy5fZmlsdGVycyB9LCBmYWxzZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maWx0ZXJzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGZpbHRlcnM6IHRoaXMuX2ZpbHRlcnMgfSwgZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3NpbXBsZS1mci1maW5kLXBhcnQtd3JhcHBlcicpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhcikpIHtcblx0XHRcdFx0aWYgKHRoaXMuX25vdGVib29rRWRpdG9yLm5vdGVib29rT3B0aW9ucy5nZXRMYXlvdXRDb25maWd1cmF0aW9uKCkuZ2xvYmFsVG9vbGJhcikge1xuXHRcdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUudG9wID0gJzI2cHgnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUudG9wID0gJzBweCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKGUpID0+IHRoaXMuX29uU3RhdGVDaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fZG9tTm9kZSkpO1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NDb250YWluZXIgPSBkb20uJCgnLmZpbmQtcmVwbGFjZS1wcm9ncmVzcycpO1xuXHRcdHRoaXMuX3Byb2dyZXNzQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2dyZXNzQmFyKHByb2dyZXNzQ29udGFpbmVyLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHByb2dyZXNzQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGlzSW50ZXJhY3RpdmVXaW5kb3cgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoJ25vdGVib29rVHlwZScpID09PSAnaW50ZXJhY3RpdmUnO1xuXG5cdFx0Y29uc3QgaG92ZXJMaWZlY3ljbGVPcHRpb25zOiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zID0geyBncm91cElkOiAnc2ltcGxlLWZpbmQtd2lkZ2V0JyB9O1xuXG5cdFx0Ly8gVG9nZ2xlIHJlcGxhY2UgYnV0dG9uXG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19UT0dHTEVfUkVQTEFDRV9NT0RFX0JUTl9MQUJFTCxcblx0XHRcdGNsYXNzTmFtZTogJ2NvZGljb24gdG9nZ2xlIGxlZnQnLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiBpc0ludGVyYWN0aXZlV2luZG93ID8gKCkgPT4geyB9IDpcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2lzUmVwbGFjZVZpc2libGUgPSAhdGhpcy5faXNSZXBsYWNlVmlzaWJsZTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JlcGxhY2VSZXZlYWxlZDogdGhpcy5faXNSZXBsYWNlVmlzaWJsZSB9LCBmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlUmVwbGFjZVZpZXdEaXNwbGF5KCk7XG5cdFx0XHRcdH1cblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnRuLnNldEVuYWJsZWQoIWlzSW50ZXJhY3RpdmVXaW5kb3cpO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4uc2V0RXhwYW5kZWQodGhpcy5faXNSZXBsYWNlVmlzaWJsZSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl90b2dnbGVSZXBsYWNlQnRuLmRvbU5vZGUpO1xuXG5cblxuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3NpbXBsZS1mci1maW5kLXBhcnQnKTtcblxuXHRcdHRoaXMuX2ZpbmRJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0ZpbmRJbnB1dChcblx0XHRcdHRoaXMuX2ZpbHRlcnMsXG5cdFx0XHR0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdG51bGwsXG5cdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC8vIHdpZHRoOkZJTkRfSU5QVVRfQVJFQV9XSURUSCxcblx0XHRcdFx0bGFiZWw6IE5MU19GSU5EX0lOUFVUX0xBQkVMLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogTkxTX0ZJTkRfSU5QVVRfUExBQ0VIT0xERVIsXG5cdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZTogc3RyaW5nKTogSW5wdXRCb3hNZXNzYWdlIHwgbnVsbCA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlLmxlbmd0aCA9PT0gMCB8fCAhdGhpcy5fZmluZElucHV0LmdldFJlZ2V4KCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0bmV3IFJlZ0V4cCh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmZvdW5kTWF0Y2ggPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLmZvdW5kTWF0Y2gpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogZS5tZXNzYWdlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmbGV4aWJsZVdpZHRoOiB0cnVlLFxuXHRcdFx0XHRzaG93Q29tbW9uRmluZFRvZ2dsZXM6IHRydWUsXG5cdFx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyxcblx0XHRcdFx0aGlzdG9yeTogZmluZEhpc3RvcnlDb25maWcgPT09ICd3b3Jrc3BhY2UnID8gdGhpcy5fZmluZFdpZGdldFNlYXJjaEhpc3RvcnkgOiBuZXcgU2V0KFtdKSxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdC8vIEZpbmQgSGlzdG9yeSB3aXRoIHVwZGF0ZSBkZWxheWVyXG5cdFx0dGhpcy5fdXBkYXRlRmluZEhpc3RvcnlEZWxheWVyID0gbmV3IERlbGF5ZXI8dm9pZD4oNTAwKTtcblxuXHRcdHRoaXMub25pbnB1dCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSwgKGUpID0+IHtcblx0XHRcdHRoaXMuZm91bmRNYXRjaCA9IHRoaXMub25JbnB1dENoYW5nZWQoKTtcblx0XHRcdHRoaXMudXBkYXRlQnV0dG9ucyh0aGlzLmZvdW5kTWF0Y2gpO1xuXHRcdFx0dGhpcy5fZGVsYXllZFVwZGF0ZUZpbmRIaXN0b3J5KCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3gub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiB0aGlzLl9maW5kSW5wdXQuZ2V0VmFsdWUoKSB9LCB0cnVlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0UmVnZXgoISF0aGlzLl9zdGF0ZS5pc1JlZ2V4KTtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSghIXRoaXMuX3N0YXRlLm1hdGNoQ2FzZSk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldFdob2xlV29yZHMoISF0aGlzLl9zdGF0ZS53aG9sZVdvcmQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Lm9uRGlkT3B0aW9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7XG5cdFx0XHRcdGlzUmVnZXg6IHRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX2ZpbmRJbnB1dC5nZXRXaG9sZVdvcmRzKCksXG5cdFx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fZmluZElucHV0LmdldENhc2VTZW5zaXRpdmUoKVxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRSZWdleCh0aGlzLl9zdGF0ZS5pc1JlZ2V4KTtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRXaG9sZVdvcmRzKHRoaXMuX3N0YXRlLndob2xlV29yZCk7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSh0aGlzLl9zdGF0ZS5tYXRjaENhc2UpO1xuXHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldFByZXNlcnZlQ2FzZSh0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21hdGNoZXNDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5jbGFzc05hbWUgPSAnbWF0Y2hlc0NvdW50Jztcblx0XHR0aGlzLl91cGRhdGVNYXRjaGVzQ291bnQoKTtcblxuXHRcdHRoaXMucHJldkJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19QUkVWSU9VU19NQVRDSF9CVE5fTEFCRUwsXG5cdFx0XHRpY29uOiBmaW5kUHJldmlvdXNNYXRjaEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5maW5kKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXG5cdFx0dGhpcy5uZXh0QnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX05FWFRfTUFUQ0hfQlROX0xBQkVMLFxuXHRcdFx0aWNvbjogZmluZE5leHRNYXRjaEljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5maW5kKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblxuXHRcdHRoaXMuaW5TZWxlY3Rpb25Ub2dnbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9nZ2xlKHtcblx0XHRcdGljb246IGZpbmRTZWxlY3Rpb25JY29uLFxuXHRcdFx0dGl0bGU6IE5MU19UT0dHTEVfU0VMRUNUSU9OX0ZJTkRfVElUTEUsXG5cdFx0XHRpc0NoZWNrZWQ6IGZhbHNlLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCksXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogYXNDc3NWYXJpYWJsZShpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlciksXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoaW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5pblNlbGVjdGlvblRvZ2dsZS5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5TZWxlY3Rpb25Ub2dnbGUub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hlY2tlZCA9IHRoaXMuaW5TZWxlY3Rpb25Ub2dnbGUuY2hlY2tlZDtcblx0XHRcdGlmIChjaGVja2VkKSB7XG5cdFx0XHRcdC8vIHNlbGVjdGlvbiBsb2dpYzpcblx0XHRcdFx0Ly8gMS4gaWYgdGhlcmUgYXJlIG11bHRpcGxlIGNlbGxzLCBkbyB0aGF0LlxuXHRcdFx0XHQvLyAyLiBpZiB0aGVyZSBpcyBvbmx5IG9uZSBjZWxsLCBkbyB0aGUgZm9sbG93aW5nOlxuXHRcdFx0XHQvLyBcdFx0LSBpZiB0aGVyZSBpcyBhIG11bHRpLWxpbmUgcmFuZ2UgaGlnaGxpZ2h0ZWQsIHRleHR1YWwgaW4gc2VsZWN0aW9uXG5cdFx0XHRcdC8vIFx0XHQtIGlmIHRoZXJlIGlzIG5vIHJhbmdlLCBjZWxsIGluIHNlbGVjdGlvbiBmb3IgdGhhdCBjZWxsXG5cblx0XHRcdFx0Y29uc3QgY2VsbFNlbGVjdGlvbjogSUNlbGxSYW5nZVtdID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRjb25zdCB0ZXh0U2VsZWN0aW9uOiBSYW5nZVtdID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0U2VsZWN0aW9uVmlld01vZGVscygpWzBdLmdldFNlbGVjdGlvbnMoKTtcblxuXHRcdFx0XHRpZiAoY2VsbFNlbGVjdGlvbi5sZW5ndGggPiAxIHx8IGNlbGxTZWxlY3Rpb24uc29tZShyYW5nZSA9PiByYW5nZS5lbmQgLSByYW5nZS5zdGFydCA+IDEpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVycy5maW5kU2NvcGUgPSB7XG5cdFx0XHRcdFx0XHRmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuQ2VsbHMsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZENlbGxSYW5nZXM6IGNlbGxTZWxlY3Rpb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuc2V0Q2VsbFNlbGVjdGlvbkRlY29yYXRpb25zKCk7XG5cblx0XHRcdFx0fSBlbHNlIGlmICh0ZXh0U2VsZWN0aW9uLmxlbmd0aCA+IDEgfHwgdGV4dFNlbGVjdGlvbi5zb21lKHJhbmdlID0+IHJhbmdlLmVuZExpbmVOdW1iZXIgLSByYW5nZS5zdGFydExpbmVOdW1iZXIgPj0gMSkpIHtcblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJzLmZpbmRTY29wZSA9IHtcblx0XHRcdFx0XHRcdGZpbmRTY29wZVR5cGU6IE5vdGVib29rRmluZFNjb3BlVHlwZS5UZXh0LFxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRDZWxsUmFuZ2VzOiBjZWxsU2VsZWN0aW9uLFxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRUZXh0UmFuZ2VzOiB0ZXh0U2VsZWN0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLnNldFRleHRTZWxlY3Rpb25EZWNvcmF0aW9ucyh0ZXh0U2VsZWN0aW9uLCB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRTZWxlY3Rpb25WaWV3TW9kZWxzKClbMF0pO1xuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVycy5maW5kU2NvcGUgPSB7XG5cdFx0XHRcdFx0XHRmaW5kU2NvcGVUeXBlOiBOb3RlYm9va0ZpbmRTY29wZVR5cGUuQ2VsbHMsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZENlbGxSYW5nZXM6IGNlbGxTZWxlY3Rpb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuc2V0Q2VsbFNlbGVjdGlvbkRlY29yYXRpb25zKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcnMuZmluZFNjb3BlID0ge1xuXHRcdFx0XHRcdGZpbmRTY29wZVR5cGU6IE5vdGVib29rRmluZFNjb3BlVHlwZS5Ob25lXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuY2xlYXJDZWxsU2VsZWN0aW9uRGVjb3JhdGlvbnMoKTtcblx0XHRcdFx0dGhpcy5jbGVhclRleHRTZWxlY3Rpb25EZWNvcmF0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNsb3NlQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX0NMT1NFX0JUTl9MQUJFTCxcblx0XHRcdGljb246IHdpZGdldENsb3NlLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0sIGhvdmVyU2VydmljZSkpO1xuXG5cdFx0dGhpcy5faW5uZXJGaW5kRG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0dGhpcy5faW5uZXJGaW5kRG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9tYXRjaGVzQ291bnQpO1xuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5wcmV2QnRuLmRvbU5vZGUpO1xuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5uZXh0QnRuLmRvbU5vZGUpO1xuXHRcdHRoaXMuX2lubmVyRmluZERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5pblNlbGVjdGlvblRvZ2dsZS5kb21Ob2RlKTtcblx0XHR0aGlzLl9pbm5lckZpbmREb21Ob2RlLmFwcGVuZENoaWxkKGNsb3NlQnRuLmRvbU5vZGUpO1xuXG5cdFx0Ly8gX2RvbU5vZGUgd3JhcHMgX2lubmVyRG9tTm9kZSwgZW5zdXJpbmcgdGhhdFxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faW5uZXJGaW5kRG9tTm9kZSk7XG5cblx0XHR0aGlzLm9ua2V5dXAodGhpcy5faW5uZXJGaW5kRG9tTm9kZSwgZSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2ZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2RvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mb2N1c1RyYWNrZXIub25EaWRGb2N1cyh0aGlzLm9uRm9jdXNUcmFja2VyRm9jdXMuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvY3VzVHJhY2tlci5vbkRpZEJsdXIodGhpcy5vbkZvY3VzVHJhY2tlckJsdXIuYmluZCh0aGlzKSkpO1xuXG5cdFx0dGhpcy5fZmluZElucHV0Rm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5fZmluZElucHV0LmRvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXRGb2N1c1RyYWNrZXIub25EaWRGb2N1cyh0aGlzLm9uRmluZElucHV0Rm9jdXNUcmFja2VyRm9jdXMuYmluZCh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dEZvY3VzVHJhY2tlci5vbkRpZEJsdXIodGhpcy5vbkZpbmRJbnB1dEZvY3VzVHJhY2tlckJsdXIuYmluZCh0aGlzKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbm5lckZpbmREb21Ob2RlLCAnY2xpY2snLCAoZXZlbnQpID0+IHtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlcGxhY2Vcblx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5faW5uZXJSZXBsYWNlRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzaW1wbGUtZnItcmVwbGFjZS1wYXJ0Jyk7XG5cblx0XHR0aGlzLl9yZXBsYWNlSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udGV4dFNjb3BlZFJlcGxhY2VJbnB1dChudWxsLCB1bmRlZmluZWQsIHtcblx0XHRcdGxhYmVsOiBOTFNfUkVQTEFDRV9JTlBVVF9MQUJFTCxcblx0XHRcdHBsYWNlaG9sZGVyOiBOTFNfUkVQTEFDRV9JTlBVVF9QTEFDRUhPTERFUixcblx0XHRcdGhpc3Rvcnk6IHJlcGxhY2VIaXN0b3J5Q29uZmlnID09PSAnd29ya3NwYWNlJyA/IHRoaXMuX3JlcGxhY2VXaWRnZXRIaXN0b3J5IDogbmV3IFNldChbXSksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0dG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdH0sIGNvbnRleHRLZXlTZXJ2aWNlLCBmYWxzZSkpO1xuXHRcdHRoaXMuX2lubmVyUmVwbGFjZURvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fcmVwbGFjZUlucHV0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX3JlcGxhY2VJbnB1dC5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXModGhpcy5vblJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlckZvY3VzLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIub25EaWRCbHVyKHRoaXMub25SZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXJCbHVyLmJpbmQodGhpcykpKTtcblxuXHRcdC8vIFJlcGxhY2UgSGlzdG9yeSB3aXRoIHVwZGF0ZSBkZWxheWVyXG5cdFx0dGhpcy5fdXBkYXRlUmVwbGFjZUhpc3RvcnlEZWxheWVyID0gbmV3IERlbGF5ZXI8dm9pZD4oNTAwKTtcblxuXHRcdHRoaXMub25pbnB1dCh0aGlzLl9yZXBsYWNlSW5wdXQuZG9tTm9kZSwgKGUpID0+IHtcblx0XHRcdHRoaXMuX2RlbGF5ZWRVcGRhdGVSZXBsYWNlSGlzdG9yeSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHJlcGxhY2VTdHJpbmc6IHRoaXMuX3JlcGxhY2VJbnB1dC5nZXRWYWx1ZSgpIH0sIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faW5uZXJSZXBsYWNlRG9tTm9kZSk7XG5cblx0XHR0aGlzLl91cGRhdGVSZXBsYWNlVmlld0Rpc3BsYXkoKTtcblxuXHRcdHRoaXMuX3JlcGxhY2VCdG4gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBOTFNfUkVQTEFDRV9CVE5fTEFCRUwsXG5cdFx0XHRpY29uOiBmaW5kUmVwbGFjZUljb24sXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZXBsYWNlT25lKCk7XG5cdFx0XHR9XG5cdFx0fSwgaG92ZXJTZXJ2aWNlKSk7XG5cblx0XHQvLyBSZXBsYWNlIGFsbCBidXR0b25cblx0XHR0aGlzLl9yZXBsYWNlQWxsQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfQUxMX0JUTl9MQUJFTCxcblx0XHRcdGljb246IGZpbmRSZXBsYWNlQWxsSWNvbixcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VBbGwoKTtcblx0XHRcdH1cblx0XHR9LCBob3ZlclNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2lubmVyUmVwbGFjZURvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fcmVwbGFjZUJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3JlcGxhY2VBbGxCdG4uZG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yZXNpemVTYXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNhc2godGhpcy5fZG9tTm9kZSwgeyBnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiAwIH0sIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBzaXplOiAyIH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRTdGFydCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNpemVPcmlnaW5hbFdpZHRoID0gdGhpcy5fZ2V0RG9tV2lkdGgoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVTYXNoLm9uRGlkQ2hhbmdlKChldnQ6IElTYXNoRXZlbnQpID0+IHtcblx0XHRcdGxldCB3aWR0aCA9IHRoaXMuX3Jlc2l6ZU9yaWdpbmFsV2lkdGggKyBldnQuc3RhcnRYIC0gZXZ0LmN1cnJlbnRYO1xuXHRcdFx0aWYgKHdpZHRoIDwgTk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHR3aWR0aCA9IE5PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEg7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1heFdpZHRoID0gdGhpcy5fZ2V0TWF4V2lkdGgoKTtcblx0XHRcdGlmICh3aWR0aCA+IG1heFdpZHRoKSB7XG5cdFx0XHRcdHdpZHRoID0gbWF4V2lkdGg7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cblx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC53aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LmxheW91dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRSZXNldCgoKSA9PiB7XG5cdFx0XHQvLyB1c2VycyBkb3VibGUgY2xpY2sgb24gdGhlIHNhc2hcblx0XHRcdC8vIHRyeSB0byBlbXVsYXRlIHdoYXQgaGFwcGVucyB3aXRoIGVkaXRvciBmaW5kV2lkZ2V0XG5cdFx0XHRjb25zdCBjdXJyZW50V2lkdGggPSB0aGlzLl9nZXREb21XaWR0aCgpO1xuXHRcdFx0bGV0IHdpZHRoID0gTk9URUJPT0tfRklORF9XSURHRVRfSU5JVElBTF9XSURUSDtcblxuXHRcdFx0aWYgKGN1cnJlbnRXaWR0aCA8PSBOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX1dJRFRIKSB7XG5cdFx0XHRcdHdpZHRoID0gdGhpcy5fZ2V0TWF4V2lkdGgoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC53aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LmxheW91dCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1heFdpZHRoKCkge1xuXHRcdHJldHVybiB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGggLSA2NDtcblx0fVxuXG5cdHByaXZhdGUgX2dldERvbVdpZHRoKCkge1xuXHRcdHJldHVybiBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9kb21Ob2RlKSAtIChOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX0hPUklaT05UQUxfUEFERElORyAqIDIpO1xuXHR9XG5cblx0Z2V0Q2VsbFRvb2xiYXJBY3Rpb25zKG1lbnU6IElNZW51KTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRcdHJldHVybiBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pLCBnID0+IC9eaW5saW5lLy50ZXN0KGcpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBvbklucHV0Q2hhbmdlZCgpOiBib29sZWFuO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZmluZChwcmV2aW91czogYm9vbGVhbik6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZXBsYWNlT25lKCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZXBsYWNlQWxsKCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBvbkZvY3VzVHJhY2tlckZvY3VzKCk6IHZvaWQ7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBvbkZvY3VzVHJhY2tlckJsdXIoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IG9uRmluZElucHV0Rm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IG9uRmluZElucHV0Rm9jdXNUcmFja2VyQmx1cigpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgb25SZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXJGb2N1cygpOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3Qgb25SZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXJCbHVyKCk6IHZvaWQ7XG5cblx0cHJvdGVjdGVkIGdldCBpbnB1dFZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl9maW5kSW5wdXQuZ2V0VmFsdWUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgcmVwbGFjZVZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl9yZXBsYWNlSW5wdXQuZ2V0VmFsdWUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgcmVwbGFjZVBhdHRlcm4oKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmlzUmVnZXgpIHtcblx0XHRcdHJldHVybiBwYXJzZVJlcGxhY2VTdHJpbmcodGhpcy5yZXBsYWNlVmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gUmVwbGFjZVBhdHRlcm4uZnJvbVN0YXRpY1ZhbHVlKHRoaXMucmVwbGFjZVZhbHVlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZm9jdXNUcmFja2VyKCk6IGRvbS5JRm9jdXNUcmFja2VyIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNUcmFja2VyO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVmlzaWJsZTtcblx0fVxuXG5cdHByaXZhdGUgX29uU3RhdGVDaGFuZ2VkKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cdFx0dGhpcy5fdXBkYXRlTWF0Y2hlc0NvdW50KCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVCdXR0b25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSk7XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0LnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2lzUmVwbGFjZVZpc2libGUpO1xuXHRcdGNvbnN0IGZpbmRJbnB1dElzTm9uRW1wdHkgPSAodGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLmxlbmd0aCA+IDApO1xuXHRcdHRoaXMuX3JlcGxhY2VCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgdGhpcy5faXNSZXBsYWNlVmlzaWJsZSAmJiBmaW5kSW5wdXRJc05vbkVtcHR5KTtcblx0XHR0aGlzLl9yZXBsYWNlQWxsQnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2lzUmVwbGFjZVZpc2libGUgJiYgZmluZElucHV0SXNOb25FbXB0eSk7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JlcGxhY2VUb2dnbGVkJywgdGhpcy5faXNSZXBsYWNlVmlzaWJsZSk7XG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5zZXRFeHBhbmRlZCh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblxuXHRcdHRoaXMuZm91bmRNYXRjaCA9IHRoaXMuX3N0YXRlLm1hdGNoZXNDb3VudCA+IDA7XG5cdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuZm91bmRNYXRjaCk7XG5cdH1cblxuXHRwcml2YXRlIHNldENlbGxTZWxlY3Rpb25EZWNvcmF0aW9ucygpIHtcblx0XHRjb25zdCBjZWxsSGFuZGxlczogbnVtYmVyW10gPSBbXTtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRTZWxlY3Rpb25WaWV3TW9kZWxzKCkuZm9yRWFjaCh2aWV3TW9kZWwgPT4ge1xuXHRcdFx0Y2VsbEhhbmRsZXMucHVzaCh2aWV3TW9kZWwuaGFuZGxlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTm90ZWJvb2tEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaGFuZGxlIG9mIGNlbGxIYW5kbGVzKSB7XG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0aGFuZGxlOiBoYW5kbGUsXG5cdFx0XHRcdG9wdGlvbnM6IHsgY2xhc3NOYW1lOiAnbmItbXVsdGlDZWxsSGlnaGxpZ2h0Jywgb3V0cHV0Q2xhc3NOYW1lOiAnbmItbXVsdGlDZWxsSGlnaGxpZ2h0JyB9XG5cdFx0XHR9IHNhdGlzZmllcyBJTm90ZWJvb2tEZWx0YURlY29yYXRpb24pO1xuXHRcdH1cblx0XHR0aGlzLmNlbGxTZWxlY3Rpb25EZWNvcmF0aW9uSWRzID0gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZGVsdGFDZWxsRGVjb3JhdGlvbnMoW10sIGRlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJDZWxsU2VsZWN0aW9uRGVjb3JhdGlvbnMoKSB7XG5cdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuZGVsdGFDZWxsRGVjb3JhdGlvbnModGhpcy5jZWxsU2VsZWN0aW9uRGVjb3JhdGlvbklkcywgW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRUZXh0U2VsZWN0aW9uRGVjb3JhdGlvbnModGV4dFJhbmdlczogUmFuZ2VbXSwgY2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jaGFuZ2VNb2RlbERlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJQ2VsbE1vZGVsRGVsdGFEZWNvcmF0aW9uc1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHRleHRSYW5nZXMpIHtcblx0XHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0b3duZXJJZDogY2VsbC5oYW5kbGUsXG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAndGV4dCBzZWFyY2ggcmFuZ2UgZm9yIG5vdGVib29rIHNlYXJjaCBzY29wZScsXG5cdFx0XHRcdFx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6ICduYi1maW5kU2NvcGUnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRleHRTZWxlY3Rpb25EZWNvcmF0aW9uSWRzID0gY2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhbXSwgZGVjb3JhdGlvbnMpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclRleHRTZWxlY3Rpb25EZWNvcmF0aW9ucygpIHtcblx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5jaGFuZ2VNb2RlbERlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yID0+IHtcblx0XHRcdGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnModGhpcy50ZXh0U2VsZWN0aW9uRGVjb3JhdGlvbklkcywgW10pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF91cGRhdGVNYXRjaGVzQ291bnQoKTogdm9pZCB7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUucmVtb3ZlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWwoaW5pdGlhbElucHV0Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGluaXRpYWxJbnB1dCkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKGluaXRpYWxJbnB1dCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuZm91bmRNYXRjaCk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScsICd2aXNpYmxlLXRyYW5zaXRpb24nKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICdmYWxzZScpO1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdH0sIDApO1xuXHR9XG5cblx0cHVibGljIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIHNob3coaW5pdGlhbElucHV0Pzogc3RyaW5nLCBvcHRpb25zPzogSVNob3dOb3RlYm9va0ZpbmRXaWRnZXRPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKGluaXRpYWxJbnB1dCkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKGluaXRpYWxJbnB1dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdHJ1ZTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJywgJ3Zpc2libGUtdHJhbnNpdGlvbicpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ2ZhbHNlJyk7XG5cblx0XHRcdGlmIChvcHRpb25zPy5mb2N1cyA/PyB0cnVlKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9LCAwKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93V2l0aFJlcGxhY2UoaW5pdGlhbElucHV0Pzogc3RyaW5nLCByZXBsYWNlSW5wdXQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoaW5pdGlhbElucHV0KSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0VmFsdWUoaW5pdGlhbElucHV0KTtcblx0XHR9XG5cblx0XHRpZiAocmVwbGFjZUlucHV0KSB7XG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuc2V0VmFsdWUocmVwbGFjZUlucHV0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuX2lzUmVwbGFjZVZpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzUmVwbGFjZVJldmVhbGVkOiB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlIH0sIGZhbHNlKTtcblx0XHR0aGlzLl91cGRhdGVSZXBsYWNlVmlld0Rpc3BsYXkoKTtcblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJywgJ3Zpc2libGUtdHJhbnNpdGlvbicpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ2ZhbHNlJyk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5mb2N1cygpO1xuXHRcdH0sIDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVwbGFjZVZpZXdEaXNwbGF5KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9pbm5lclJlcGxhY2VEb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lubmVyUmVwbGFjZURvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdH1cblxuXHRwdWJsaWMgaGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLmluU2VsZWN0aW9uVG9nZ2xlLmNoZWNrZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmRlbHRhQ2VsbERlY29yYXRpb25zKHRoaXMuY2VsbFNlbGVjdGlvbkRlY29yYXRpb25JZHMsIFtdKTtcblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmNoYW5nZU1vZGVsRGVjb3JhdGlvbnMoY2hhbmdlQWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKHRoaXMudGV4dFNlbGVjdGlvbkRlY29yYXRpb25JZHMsIFtdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUtdHJhbnNpdGlvbicpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdC8vIE5lZWQgdG8gZGVsYXkgdG9nZ2xpbmcgdmlzaWJpbGl0eSB1bnRpbCBhZnRlciBUcmFuc2l0aW9uLCB0aGVuIHZpc2liaWxpdHkgaGlkZGVuIC0gcmVtb3ZlcyBmcm9tIHRhYkluZGV4IGxpc3Rcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9pc1Zpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVCdXR0b25zKHRoaXMuZm91bmRNYXRjaCk7XG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdFx0fSwgMjAwKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RlbGF5ZWRVcGRhdGVGaW5kSGlzdG9yeSgpIHtcblx0XHR0aGlzLl91cGRhdGVGaW5kSGlzdG9yeURlbGF5ZXIudHJpZ2dlcih0aGlzLl91cGRhdGVGaW5kSGlzdG9yeS5iaW5kKHRoaXMpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfdXBkYXRlRmluZEhpc3RvcnkoKSB7XG5cdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LmFkZFRvSGlzdG9yeSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kZWxheWVkVXBkYXRlUmVwbGFjZUhpc3RvcnkoKSB7XG5cdFx0dGhpcy5fdXBkYXRlUmVwbGFjZUhpc3RvcnlEZWxheWVyLnRyaWdnZXIodGhpcy5fdXBkYXRlUmVwbGFjZUhpc3RvcnkuYmluZCh0aGlzKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3VwZGF0ZVJlcGxhY2VIaXN0b3J5KCkge1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5hZGRUb0hpc3RvcnkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UmVnZXhWYWx1ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZElucHV0LmdldFJlZ2V4KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFdob2xlV29yZFZhbHVlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maW5kSW5wdXQuZ2V0V2hvbGVXb3JkcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRDYXNlU2Vuc2l0aXZlVmFsdWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRJbnB1dC5nZXRDYXNlU2Vuc2l0aXZlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQnV0dG9ucyhmb3VuZE1hdGNoOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgaGFzSW5wdXQgPSB0aGlzLmlucHV0VmFsdWUubGVuZ3RoID4gMDtcblx0XHR0aGlzLnByZXZCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgaGFzSW5wdXQgJiYgZm91bmRNYXRjaCk7XG5cdFx0dGhpcy5uZXh0QnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIGhhc0lucHV0ICYmIGZvdW5kTWF0Y2gpO1xuXHR9XG59XG5cbi8vIHRoZW1pbmdcbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbGxlY3Rvci5hZGRSdWxlKGBcblx0Lm5vdGVib29rLWVkaXRvciB7XG5cdFx0LS1ub3RlYm9vay1maW5kLXdpZHRoOiAke05PVEVCT09LX0ZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEh9cHg7XG5cdFx0LS1ub3RlYm9vay1maW5kLWhvcml6b250YWwtcGFkZGluZzogJHtOT1RFQk9PS19GSU5EX1dJREdFVF9JTklUSUFMX0hPUklaT05UQUxfUEFERElOR31weDtcblx0fVxuXHRgKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLE9BQU87QUFDUCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHVCQUE2QztBQUN0RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlCQUFvQztBQUc3QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFxQixhQUFhLFlBQVk7QUFDOUMsU0FBd0IsY0FBYztBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxRQUFRLGNBQXNDLGlCQUFpQjtBQUN4RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx3QkFBc0Q7QUFDL0QsU0FBUyxtQkFBbUIsdUJBQXVCLG9CQUFvQixpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUMvSCxTQUFTLG9CQUFvQixzQkFBc0I7QUFDbkQsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsMkJBQTJCLGlEQUFpRDtBQUVyRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QiwwQkFBMEIsMkJBQTJCO0FBQ3JGLFNBQVMsZUFBZSw2QkFBNkIseUJBQXlCLG1DQUFtQztBQUNqSCxTQUFTLGNBQWMsbUJBQW1CO0FBQzFDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsa0JBQWtCO0FB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
