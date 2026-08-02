import * as dom from "../../../../base/browser/dom.js";
import { alert as alertFn } from "../../../../base/browser/ui/aria/aria.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { Orientation, Sash } from "../../../../base/browser/ui/sash/sash.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Delayer, disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import "./findWidget.css";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_FOCUSED, CONTEXT_REPLACE_INPUT_FOCUSED, FIND_IDS, MATCHES_LIMIT } from "./findModel.js";
import * as nls from "../../../../nls.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextScopedFindInput, ContextScopedReplaceInput } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { asCssVariable, contrastBorder, editorFindMatchForeground, editorFindMatchHighlightBorder, editorFindMatchHighlightForeground, editorFindRangeHighlightBorder, inputActiveOptionBackground, inputActiveOptionBorder, inputActiveOptionForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerIcon, widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
const findCollapsedIcon = registerIcon("find-collapsed", Codicon.chevronRight, nls.localize("findCollapsedIcon", "Icon to indicate that the editor find widget is collapsed."));
const findExpandedIcon = registerIcon("find-expanded", Codicon.chevronDown, nls.localize("findExpandedIcon", "Icon to indicate that the editor find widget is expanded."));
const findSelectionIcon = registerIcon("find-selection", Codicon.selection, nls.localize("findSelectionIcon", "Icon for 'Find in Selection' in the editor find widget."));
const findReplaceIcon = registerIcon("find-replace", Codicon.replace, nls.localize("findReplaceIcon", "Icon for 'Replace' in the editor find widget."));
const findReplaceAllIcon = registerIcon("find-replace-all", Codicon.replaceAll, nls.localize("findReplaceAllIcon", "Icon for 'Replace All' in the editor find widget."));
const findPreviousMatchIcon = registerIcon("find-previous-match", Codicon.arrowUp, nls.localize("findPreviousMatchIcon", "Icon for 'Find Previous' in the editor find widget."));
const findNextMatchIcon = registerIcon("find-next-match", Codicon.arrowDown, nls.localize("findNextMatchIcon", "Icon for 'Find Next' in the editor find widget."));
const NLS_FIND_DIALOG_LABEL = nls.localize("label.findDialog", "Find / Replace");
const NLS_FIND_INPUT_LABEL = nls.localize("label.find", "Find");
const NLS_FIND_INPUT_PLACEHOLDER = nls.localize("placeholder.find", "Find");
const NLS_PREVIOUS_MATCH_BTN_LABEL = nls.localize("label.previousMatchButton", "Previous Match");
const NLS_NEXT_MATCH_BTN_LABEL = nls.localize("label.nextMatchButton", "Next Match");
const NLS_TOGGLE_SELECTION_FIND_TITLE = nls.localize("label.toggleSelectionFind", "Find in Selection");
const NLS_CLOSE_BTN_LABEL = nls.localize("label.closeButton", "Close");
const NLS_REPLACE_INPUT_LABEL = nls.localize("label.replace", "Replace");
const NLS_REPLACE_INPUT_PLACEHOLDER = nls.localize("placeholder.replace", "Replace");
const NLS_REPLACE_BTN_LABEL = nls.localize("label.replaceButton", "Replace");
const NLS_REPLACE_ALL_BTN_LABEL = nls.localize("label.replaceAllButton", "Replace All");
const NLS_TOGGLE_REPLACE_MODE_BTN_LABEL = nls.localize("label.toggleReplaceButton", "Toggle Replace");
const NLS_MATCHES_COUNT_LIMIT_TITLE = nls.localize("title.matchesCountLimit", "Only the first {0} results are highlighted, but all find operations work on the entire text.", MATCHES_LIMIT);
const NLS_MATCHES_LOCATION = nls.localize("label.matchesLocation", "{0} of {1}");
const NLS_NO_RESULTS = nls.localize("label.noResults", "No results");
const FIND_WIDGET_INITIAL_WIDTH = 419;
const PART_WIDTH = 275;
const FIND_INPUT_AREA_WIDTH = PART_WIDTH - 54;
let MAX_MATCHES_COUNT_WIDTH = 69;
const FIND_INPUT_AREA_HEIGHT = 33;
const ctrlKeyMod = platform.isMacintosh ? KeyMod.WinCtrl : KeyMod.CtrlCmd;
class FindWidgetViewZone {
  constructor(afterLineNumber) {
    this.afterLineNumber = afterLineNumber;
    this.heightInPx = FIND_INPUT_AREA_HEIGHT;
    this.suppressMouseDown = false;
    this.domNode = document.createElement("div");
    this.domNode.className = "dock-find-viewzone";
  }
}
function stopPropagationForMultiLineUpwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && isMultiline && textarea.selectionStart > 0) {
    event.stopPropagation();
    return;
  }
}
function stopPropagationForMultiLineDownwards(event, value, textarea) {
  const isMultiline = !!value.match(/\n/);
  if (textarea && isMultiline && textarea.selectionEnd < textarea.value.length) {
    event.stopPropagation();
    return;
  }
}
const _FindWidget = class _FindWidget extends Widget {
  constructor(codeEditor, controller, state, contextViewProvider, keybindingService, contextKeyService, _hoverService, _findWidgetSearchHistory, _replaceWidgetHistory, _configurationService, _accessibilityService) {
    super();
    this._hoverService = _hoverService;
    this._findWidgetSearchHistory = _findWidgetSearchHistory;
    this._replaceWidgetHistory = _replaceWidgetHistory;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._cachedHeight = null;
    this._lastFocusedInputWasReplace = false;
    this._lastFocusedElement = null;
    this._revealTimeouts = [];
    this._codeEditor = codeEditor;
    this._controller = controller;
    this._state = state;
    this._contextViewProvider = contextViewProvider;
    this._keybindingService = keybindingService;
    this._contextKeyService = contextKeyService;
    this._isVisible = false;
    this._isReplaceVisible = false;
    this._ignoreChangeEvent = false;
    this._accessibilityHelpHintAnnounced = false;
    this._updateHistoryDelayer = new Delayer(500);
    this._register(toDisposable(() => this._updateHistoryDelayer.cancel()));
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._buildDomNode();
    this._updateButtons();
    this._tryUpdateWidgetWidth();
    this._findInput.inputBox.layout();
    this._register(this._codeEditor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.readOnly)) {
        if (this._codeEditor.getOption(EditorOption.readOnly)) {
          this._state.change({ isReplaceRevealed: false }, false);
        }
        this._updateButtons();
      }
      if (e.hasChanged(EditorOption.layoutInfo)) {
        this._tryUpdateWidgetWidth();
      }
      if (e.hasChanged(EditorOption.accessibilitySupport)) {
        this.updateAccessibilitySupport();
      }
      if (e.hasChanged(EditorOption.find)) {
        const supportLoop = this._codeEditor.getOption(EditorOption.find).loop;
        this._state.change({ loop: supportLoop }, false);
        const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
        if (addExtraSpaceOnTop && !this._viewZone) {
          this._viewZone = new FindWidgetViewZone(0);
          this._showViewZone();
        }
        if (!addExtraSpaceOnTop && this._viewZone) {
          this._removeViewZone();
        }
      }
    }));
    this.updateAccessibilitySupport();
    this._register(this._codeEditor.onDidChangeCursorSelection(() => {
      if (this._isVisible) {
        this._updateToggleSelectionFindButton();
      }
    }));
    this._register(this._codeEditor.onDidFocusEditorWidget(async () => {
      if (this._isVisible) {
        const globalBufferTerm = await this._controller.getGlobalBufferTerm();
        if (globalBufferTerm && globalBufferTerm !== this._state.searchString) {
          this._state.change({ searchString: globalBufferTerm }, false);
          this._findInput.select();
        }
      }
    }));
    this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeyService);
    this._findFocusTracker = this._register(dom.trackFocus(this._findInput.inputBox.inputElement));
    this._register(this._findFocusTracker.onDidFocus(() => {
      this._findInputFocused.set(true);
      this._lastFocusedInputWasReplace = false;
      this._updateSearchScope();
    }));
    this._register(this._findFocusTracker.onDidBlur(() => {
      this._findInputFocused.set(false);
    }));
    this._replaceInputFocused = CONTEXT_REPLACE_INPUT_FOCUSED.bindTo(contextKeyService);
    this._replaceFocusTracker = this._register(dom.trackFocus(this._replaceInput.inputBox.inputElement));
    this._register(this._replaceFocusTracker.onDidFocus(() => {
      this._replaceInputFocused.set(true);
      this._lastFocusedInputWasReplace = true;
      this._updateSearchScope();
    }));
    this._register(this._replaceFocusTracker.onDidBlur(() => {
      this._replaceInputFocused.set(false);
    }));
    this._findWidgetFocused = CONTEXT_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
    this._widgetFocusTracker = this._register(dom.trackFocus(this._domNode));
    this._register(this._widgetFocusTracker.onDidFocus(() => {
      this._findWidgetFocused.set(true);
    }));
    this._register(this._widgetFocusTracker.onDidBlur(() => {
      this._findWidgetFocused.set(false);
    }));
    this._register(dom.addDisposableListener(this._domNode, "focusin", (e) => {
      if (dom.isHTMLElement(e.target)) {
        this._lastFocusedElement = e.target;
      }
    }));
    this._codeEditor.addOverlayWidget(this);
    if (this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop) {
      this._viewZone = new FindWidgetViewZone(0);
    }
    this._register(this._codeEditor.onDidChangeModel(() => {
      if (!this._isVisible) {
        return;
      }
      this._viewZoneId = void 0;
    }));
    this._register(this._codeEditor.onDidScrollChange((e) => {
      if (e.scrollTopChanged) {
        this._layoutViewZone();
        return;
      }
      setTimeout(() => {
        this._layoutViewZone();
      }, 0);
    }));
  }
  // ----- IOverlayWidget API
  getId() {
    return _FindWidget.ID;
  }
  getDomNode() {
    return this._domNode;
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   * This persists even after focus leaves the widget, allowing external code to know
   * which input to restore focus to.
   */
  get lastFocusedInputWasReplace() {
    return this._lastFocusedInputWasReplace;
  }
  /**
   * Returns the last focused element within the Find widget.
   * This is useful for restoring focus to the exact element after
   * accessibility help or other overlays are dismissed.
   */
  get lastFocusedElement() {
    return this._lastFocusedElement;
  }
  /**
   * Focuses the last focused element in the Find widget.
   * Falls back to the Find or Replace input based on lastFocusedInputWasReplace.
   */
  focusLastElement() {
    if (!this._isVisible) {
      return;
    }
    if (this._lastFocusedElement && this._domNode.contains(this._lastFocusedElement) && dom.getWindow(this._lastFocusedElement).document.body.contains(this._lastFocusedElement)) {
      this._lastFocusedElement.focus();
    } else if (this._lastFocusedInputWasReplace) {
      this.focusReplaceInput();
    } else {
      this.focusFindInput();
    }
  }
  getPosition() {
    if (this._isVisible) {
      return {
        preference: OverlayWidgetPositionPreference.TOP_RIGHT_CORNER
      };
    }
    return null;
  }
  // ----- React to state changes
  _onStateChanged(e) {
    if (e.searchString) {
      try {
        this._ignoreChangeEvent = true;
        this._findInput.setValue(this._state.searchString);
      } finally {
        this._ignoreChangeEvent = false;
      }
      this._updateButtons();
    }
    if (e.replaceString) {
      this._replaceInput.inputBox.value = this._state.replaceString;
    }
    if (e.isRevealed) {
      if (this._state.isRevealed) {
        this._reveal();
      } else {
        this._hide(true);
      }
    }
    if (e.isReplaceRevealed) {
      if (this._state.isReplaceRevealed) {
        if (!this._codeEditor.getOption(EditorOption.readOnly) && !this._isReplaceVisible) {
          this._isReplaceVisible = true;
          this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
          this._updateButtons();
          this._replaceInput.inputBox.layout();
        }
      } else {
        if (this._isReplaceVisible) {
          this._isReplaceVisible = false;
          this._updateButtons();
        }
      }
    }
    if ((e.isRevealed || e.isReplaceRevealed) && (this._state.isRevealed || this._state.isReplaceRevealed)) {
      if (this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }
    if (e.isRegex) {
      this._findInput.setRegex(this._state.isRegex);
    }
    if (e.wholeWord) {
      this._findInput.setWholeWords(this._state.wholeWord);
    }
    if (e.matchCase) {
      this._findInput.setCaseSensitive(this._state.matchCase);
    }
    if (e.preserveCase) {
      this._replaceInput.setPreserveCase(this._state.preserveCase);
    }
    if (e.searchScope) {
      if (this._state.searchScope) {
        this._toggleSelectionFind.checked = true;
      } else {
        this._toggleSelectionFind.checked = false;
      }
      this._updateToggleSelectionFindButton();
    }
    if (e.searchString || e.matchesCount || e.matchesPosition) {
      const showRedOutline = this._state.searchString.length > 0 && this._state.matchesCount === 0;
      this._domNode.classList.toggle("no-results", showRedOutline);
      this._updateMatchesCount();
      this._updateButtons();
    }
    if (e.searchString || e.currentMatch) {
      this._layoutViewZone();
    }
    if (e.updateHistory) {
      this._delayedUpdateHistory();
    }
    if (e.loop) {
      this._updateButtons();
    }
  }
  _delayedUpdateHistory() {
    this._updateHistoryDelayer.trigger(this._updateHistory.bind(this)).then(void 0, onUnexpectedError);
  }
  _updateHistory() {
    if (this._state.searchString) {
      this._findInput.inputBox.addToHistory();
    }
    if (this._state.replaceString) {
      this._replaceInput.inputBox.addToHistory();
    }
  }
  _updateMatchesCount() {
    this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + "px";
    if (this._state.matchesCount >= MATCHES_LIMIT) {
      this._matchesCount.title = NLS_MATCHES_COUNT_LIMIT_TITLE;
    } else {
      this._matchesCount.title = "";
    }
    this._matchesCount.firstChild?.remove();
    let label;
    if (this._state.matchesCount > 0) {
      let matchesCount = String(this._state.matchesCount);
      if (this._state.matchesCount >= MATCHES_LIMIT) {
        matchesCount += "+";
      }
      let matchesPosition = String(this._state.matchesPosition);
      if (matchesPosition === "0") {
        matchesPosition = "?";
      }
      label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
    } else {
      label = NLS_NO_RESULTS;
    }
    this._matchesCount.appendChild(document.createTextNode(label));
    alertFn(this._getAriaLabel(label, this._state.currentMatch, this._state.searchString));
    MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
  }
  // ----- actions
  _getAriaLabel(label, currentMatch, searchString) {
    let result;
    if (label === NLS_NO_RESULTS) {
      result = searchString === "" ? nls.localize("ariaSearchNoResultEmpty", "{0} found", label) : nls.localize("ariaSearchNoResult", "{0} found for '{1}'", label, searchString);
    } else if (currentMatch) {
      const ariaLabel = nls.localize("ariaSearchNoResultWithLineNum", "{0} found for '{1}', at {2}", label, searchString, currentMatch.startLineNumber + ":" + currentMatch.startColumn);
      const model = this._codeEditor.getModel();
      if (model && currentMatch.startLineNumber <= model.getLineCount() && currentMatch.startLineNumber >= 1) {
        const lineContent = model.getLineContent(currentMatch.startLineNumber);
        result = `${lineContent}, ${ariaLabel}`;
      } else {
        result = ariaLabel;
      }
    } else {
      result = nls.localize("ariaSearchNoResultWithLineNumNoCurrentMatch", "{0} found for '{1}'", label, searchString);
    }
    return result;
  }
  /**
   * If 'selection find' is ON we should not disable the button (its function is to cancel 'selection find').
   * If 'selection find' is OFF we enable the button only if there is a selection.
   */
  _updateToggleSelectionFindButton() {
    const selection = this._codeEditor.getSelection();
    const isSelection = selection ? selection.startLineNumber !== selection.endLineNumber || selection.startColumn !== selection.endColumn : false;
    const isChecked = this._toggleSelectionFind.checked;
    if (this._isVisible && (isChecked || isSelection)) {
      this._toggleSelectionFind.enable();
    } else {
      this._toggleSelectionFind.disable();
    }
  }
  _updateButtons() {
    this._findInput.setEnabled(this._isVisible);
    this._replaceInput.setEnabled(this._isVisible && this._isReplaceVisible);
    this._updateToggleSelectionFindButton();
    this._closeBtn.setEnabled(this._isVisible);
    const findInputIsNonEmpty = this._state.searchString.length > 0;
    const matchesCount = this._state.matchesCount ? true : false;
    this._prevBtn.setEnabled(this._isVisible && findInputIsNonEmpty && matchesCount && this._state.canNavigateBack());
    this._nextBtn.setEnabled(this._isVisible && findInputIsNonEmpty && matchesCount && this._state.canNavigateForward());
    this._replaceBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._replaceAllBtn.setEnabled(this._isVisible && this._isReplaceVisible && findInputIsNonEmpty);
    this._domNode.classList.toggle("replaceToggled", this._isReplaceVisible);
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    const canReplace = !this._codeEditor.getOption(EditorOption.readOnly);
    this._toggleReplaceBtn.setEnabled(this._isVisible && canReplace);
  }
  _reveal() {
    this._revealTimeouts.forEach((e) => {
      clearTimeout(e);
    });
    this._revealTimeouts = [];
    if (!this._isVisible) {
      this._isVisible = true;
      const selection = this._codeEditor.getSelection();
      switch (this._codeEditor.getOption(EditorOption.find).autoFindInSelection) {
        case "always":
          this._toggleSelectionFind.checked = true;
          break;
        case "never":
          this._toggleSelectionFind.checked = false;
          break;
        case "multiline": {
          const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
          this._toggleSelectionFind.checked = isSelectionMultipleLine;
          break;
        }
        default:
          break;
      }
      this._tryUpdateWidgetWidth();
      this._updateButtons();
      this._revealTimeouts.push(setTimeout(() => {
        this._domNode.classList.add("visible");
        this._domNode.setAttribute("aria-hidden", "false");
        this._updateFindInputAriaLabel();
      }, 0));
      this._revealTimeouts.push(setTimeout(() => {
        this._findInput.validate();
      }, 200));
      this._codeEditor.layoutOverlayWidget(this);
      let adjustEditorScrollTop = true;
      if (this._codeEditor.getOption(EditorOption.find).seedSearchStringFromSelection && selection) {
        const domNode = this._codeEditor.getDomNode();
        if (domNode) {
          const editorCoords = dom.getDomNodePagePosition(domNode);
          const startCoords = this._codeEditor.getScrolledVisiblePosition(selection.getStartPosition());
          const startLeft = editorCoords.left + (startCoords ? startCoords.left : 0);
          const startTop = startCoords ? startCoords.top : 0;
          if (this._viewZone && startTop < this._viewZone.heightInPx) {
            if (selection.endLineNumber > selection.startLineNumber) {
              adjustEditorScrollTop = false;
            }
            const leftOfFindWidget = dom.getTopLeftOffset(this._domNode).left;
            if (startLeft > leftOfFindWidget) {
              adjustEditorScrollTop = false;
            }
            const endCoords = this._codeEditor.getScrolledVisiblePosition(selection.getEndPosition());
            const endLeft = editorCoords.left + (endCoords ? endCoords.left : 0);
            if (endLeft > leftOfFindWidget) {
              adjustEditorScrollTop = false;
            }
          }
        }
      }
      this._showViewZone(adjustEditorScrollTop);
    }
  }
  _hide(focusTheEditor) {
    this._revealTimeouts.forEach((e) => {
      clearTimeout(e);
    });
    this._revealTimeouts = [];
    if (this._isVisible) {
      this._isVisible = false;
      this._accessibilityHelpHintAnnounced = false;
      this._updateButtons();
      this._domNode.classList.remove("visible");
      this._domNode.setAttribute("aria-hidden", "true");
      this._findInput.clearMessage();
      if (focusTheEditor) {
        this._codeEditor.focus();
      }
      this._codeEditor.layoutOverlayWidget(this);
      this._removeViewZone();
    }
  }
  _layoutViewZone(targetScrollTop) {
    const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
    if (!addExtraSpaceOnTop) {
      this._removeViewZone();
      return;
    }
    if (!this._isVisible) {
      return;
    }
    const viewZone = this._viewZone;
    if (this._viewZoneId !== void 0 || !viewZone) {
      return;
    }
    this._codeEditor.changeViewZones((accessor) => {
      viewZone.heightInPx = this._getHeight();
      this._viewZoneId = accessor.addZone(viewZone);
      this._codeEditor.setScrollTop(targetScrollTop || this._codeEditor.getScrollTop() + viewZone.heightInPx);
    });
  }
  _showViewZone(adjustScroll = true) {
    if (!this._isVisible) {
      return;
    }
    const addExtraSpaceOnTop = this._codeEditor.getOption(EditorOption.find).addExtraSpaceOnTop;
    if (!addExtraSpaceOnTop) {
      return;
    }
    if (this._viewZone === void 0) {
      this._viewZone = new FindWidgetViewZone(0);
    }
    const viewZone = this._viewZone;
    this._codeEditor.changeViewZones((accessor) => {
      if (this._viewZoneId !== void 0) {
        const newHeight = this._getHeight();
        if (newHeight === viewZone.heightInPx) {
          return;
        }
        const scrollAdjustment = newHeight - viewZone.heightInPx;
        viewZone.heightInPx = newHeight;
        accessor.layoutZone(this._viewZoneId);
        if (adjustScroll) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() + scrollAdjustment);
        }
        return;
      } else {
        let scrollAdjustment = this._getHeight();
        scrollAdjustment -= this._codeEditor.getOption(EditorOption.padding).top;
        if (scrollAdjustment <= 0) {
          return;
        }
        viewZone.heightInPx = scrollAdjustment;
        this._viewZoneId = accessor.addZone(viewZone);
        if (adjustScroll) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() + scrollAdjustment);
        }
      }
    });
  }
  _removeViewZone() {
    this._codeEditor.changeViewZones((accessor) => {
      if (this._viewZoneId !== void 0) {
        accessor.removeZone(this._viewZoneId);
        this._viewZoneId = void 0;
        if (this._viewZone) {
          this._codeEditor.setScrollTop(this._codeEditor.getScrollTop() - this._viewZone.heightInPx);
          this._viewZone = void 0;
        }
      }
    });
  }
  _tryUpdateWidgetWidth() {
    if (!this._isVisible) {
      return;
    }
    if (!this._domNode.isConnected) {
      return;
    }
    const layoutInfo = this._codeEditor.getLayoutInfo();
    const editorContentWidth = layoutInfo.contentWidth;
    if (editorContentWidth <= 0) {
      this._domNode.classList.add("hiddenEditor");
      return;
    } else if (this._domNode.classList.contains("hiddenEditor")) {
      this._domNode.classList.remove("hiddenEditor");
    }
    const editorWidth = layoutInfo.width;
    const minimapWidth = layoutInfo.minimap.minimapWidth;
    let collapsedFindWidget = false;
    let reducedFindWidget = false;
    let narrowFindWidget = false;
    if (this._resized) {
      const widgetWidth = dom.getTotalWidth(this._domNode);
      if (widgetWidth > FIND_WIDGET_INITIAL_WIDTH) {
        this._domNode.style.maxWidth = `${editorWidth - 28 - minimapWidth - 15}px`;
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
        return;
      }
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth >= editorWidth) {
      reducedFindWidget = true;
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editorWidth) {
      narrowFindWidget = true;
    }
    if (FIND_WIDGET_INITIAL_WIDTH + 28 + minimapWidth - MAX_MATCHES_COUNT_WIDTH >= editorWidth + 50) {
      collapsedFindWidget = true;
    }
    this._domNode.classList.toggle("collapsed-find-widget", collapsedFindWidget);
    this._domNode.classList.toggle("narrow-find-widget", narrowFindWidget);
    this._domNode.classList.toggle("reduced-find-widget", reducedFindWidget);
    if (!narrowFindWidget && !collapsedFindWidget) {
      this._domNode.style.maxWidth = `${editorWidth - 28 - minimapWidth - 15}px`;
    }
    this._findInput.layout({ collapsedFindWidget, narrowFindWidget, reducedFindWidget });
    if (this._resized) {
      const findInputWidth = this._findInput.inputBox.element.clientWidth;
      if (findInputWidth > 0) {
        this._replaceInput.width = findInputWidth;
      }
    } else if (this._isReplaceVisible) {
      this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
    }
  }
  _getHeight() {
    let totalheight = 0;
    totalheight += 4;
    totalheight += this._findInput.inputBox.height + 2;
    if (this._isReplaceVisible) {
      totalheight += 4;
      totalheight += this._replaceInput.inputBox.height + 2;
    }
    totalheight += 4;
    return totalheight;
  }
  _tryUpdateHeight() {
    const totalHeight = this._getHeight();
    if (this._cachedHeight !== null && this._cachedHeight === totalHeight) {
      return false;
    }
    this._cachedHeight = totalHeight;
    this._domNode.style.height = `${totalHeight}px`;
    return true;
  }
  // ----- Public
  focusFindInput() {
    this._findInput.select();
    this._findInput.focus();
  }
  focusReplaceInput() {
    this._replaceInput.select();
    this._replaceInput.focus();
  }
  highlightFindOptions() {
    this._findInput.highlightFindOptions();
  }
  _updateSearchScope() {
    if (!this._codeEditor.hasModel()) {
      return;
    }
    if (this._toggleSelectionFind.checked) {
      const selections = this._codeEditor.getSelections();
      selections.map((selection) => {
        if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
          selection = selection.setEndPosition(
            selection.endLineNumber - 1,
            this._codeEditor.getModel().getLineMaxColumn(selection.endLineNumber - 1)
          );
        }
        const currentMatch = this._state.currentMatch;
        if (selection.startLineNumber !== selection.endLineNumber) {
          if (!Range.equalsRange(selection, currentMatch)) {
            return selection;
          }
        }
        return null;
      }).filter((element) => !!element);
      if (selections.length) {
        this._state.change({ searchScope: selections }, true);
      }
    }
  }
  _onFindInputMouseDown(e) {
    if (e.middleButton) {
      e.stopPropagation();
    }
  }
  _onFindInputKeyDown(e) {
    if (e.equals(ctrlKeyMod | KeyCode.Enter)) {
      if (this._keybindingService.dispatchEvent(e, e.target)) {
        e.preventDefault();
        return;
      } else {
        this._findInput.inputBox.insertAtCursor("\n");
        e.preventDefault();
        return;
      }
    }
    if (e.equals(KeyCode.Tab)) {
      if (this._isReplaceVisible) {
        this._replaceInput.focus();
      } else {
        this._findInput.focusOnCaseSensitive();
      }
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
      this._codeEditor.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyCode.UpArrow)) {
      return stopPropagationForMultiLineUpwards(e, this._findInput.getValue(), this._findInput.domNode.querySelector("textarea"));
    }
    if (e.equals(KeyCode.DownArrow)) {
      return stopPropagationForMultiLineDownwards(e, this._findInput.getValue(), this._findInput.domNode.querySelector("textarea"));
    }
  }
  _onReplaceInputKeyDown(e) {
    if (e.equals(ctrlKeyMod | KeyCode.Enter)) {
      if (this._keybindingService.dispatchEvent(e, e.target)) {
        e.preventDefault();
        return;
      } else {
        this._replaceInput.inputBox.insertAtCursor("\n");
        e.preventDefault();
        return;
      }
    }
    if (e.equals(KeyCode.Tab)) {
      this._findInput.focusOnCaseSensitive();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
      this._findInput.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyMod.CtrlCmd | KeyCode.DownArrow)) {
      this._codeEditor.focus();
      e.preventDefault();
      return;
    }
    if (e.equals(KeyCode.UpArrow)) {
      return stopPropagationForMultiLineUpwards(e, this._replaceInput.inputBox.value, this._replaceInput.inputBox.element.querySelector("textarea"));
    }
    if (e.equals(KeyCode.DownArrow)) {
      return stopPropagationForMultiLineDownwards(e, this._replaceInput.inputBox.value, this._replaceInput.inputBox.element.querySelector("textarea"));
    }
  }
  // ----- sash
  getVerticalSashLeft(_sash) {
    return 0;
  }
  // ----- initialization
  _keybindingLabelFor(actionId) {
    return this._keybindingService.appendKeybinding("", actionId);
  }
  _buildDomNode() {
    const flexibleHeight = true;
    const flexibleWidth = true;
    const findSearchHistoryConfig = this._codeEditor.getOption(EditorOption.find).history;
    const replaceHistoryConfig = this._codeEditor.getOption(EditorOption.find).replaceHistory;
    this._findInput = this._register(new ContextScopedFindInput(null, this._contextViewProvider, {
      width: FIND_INPUT_AREA_WIDTH,
      label: NLS_FIND_INPUT_LABEL,
      placeholder: NLS_FIND_INPUT_PLACEHOLDER,
      appendCaseSensitiveLabel: this._keybindingLabelFor(FIND_IDS.ToggleCaseSensitiveCommand),
      appendWholeWordsLabel: this._keybindingLabelFor(FIND_IDS.ToggleWholeWordCommand),
      appendRegexLabel: this._keybindingLabelFor(FIND_IDS.ToggleRegexCommand),
      validation: (value) => {
        if (value.length === 0 || !this._findInput.getRegex()) {
          return null;
        }
        try {
          new RegExp(value, "gu");
          return null;
        } catch (e) {
          return { content: e.message };
        }
      },
      flexibleHeight,
      flexibleWidth,
      flexibleMaxHeight: 118,
      showCommonFindToggles: true,
      showHistoryHint: () => showHistoryKeybindingHint(this._keybindingService),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      history: findSearchHistoryConfig === "workspace" ? this._findWidgetSearchHistory : /* @__PURE__ */ new Set([])
    }, this._contextKeyService));
    this._findInput.setRegex(!!this._state.isRegex);
    this._findInput.setCaseSensitive(!!this._state.matchCase);
    this._findInput.setWholeWords(!!this._state.wholeWord);
    this._register(this._findInput.onKeyDown((e) => {
      if (e.equals(KeyCode.Enter) && !this._codeEditor.getOption(EditorOption.find).findOnType) {
        this._state.change({ searchString: this._findInput.getValue() }, true);
      }
      this._onFindInputKeyDown(e);
    }));
    this._register(this._findInput.inputBox.onDidChange(() => {
      if (this._ignoreChangeEvent || !this._codeEditor.getOption(EditorOption.find).findOnType) {
        return;
      }
      this._state.change({ searchString: this._findInput.getValue() }, true);
    }));
    this._register(this._findInput.onDidOptionChange(() => {
      this._state.change({
        isRegex: this._findInput.getRegex(),
        wholeWord: this._findInput.getWholeWords(),
        matchCase: this._findInput.getCaseSensitive()
      }, true);
    }));
    this._register(this._findInput.onCaseSensitiveKeyDown((e) => {
      if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this._isReplaceVisible) {
          this._replaceInput.focus();
          e.preventDefault();
        }
      }
    }));
    this._register(this._findInput.onRegexKeyDown((e) => {
      if (e.equals(KeyCode.Tab)) {
        if (this._isReplaceVisible) {
          this._replaceInput.focusOnPreserve();
          e.preventDefault();
        }
      }
    }));
    this._register(this._findInput.inputBox.onDidHeightChange((e) => {
      if (this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }));
    if (platform.isLinux) {
      this._register(this._findInput.onMouseDown((e) => this._onFindInputMouseDown(e)));
    }
    this._matchesCount = document.createElement("div");
    this._matchesCount.className = "matchesCount";
    this._updateMatchesCount();
    const hoverLifecycleOptions = { groupId: "find-widget" };
    this._prevBtn = this._register(new SimpleButton({
      label: NLS_PREVIOUS_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.PreviousMatchFindAction),
      icon: findPreviousMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        assertReturnsDefined(this._codeEditor.getAction(FIND_IDS.PreviousMatchFindAction)).run().then(void 0, onUnexpectedError);
      }
    }, this._hoverService));
    this._nextBtn = this._register(new SimpleButton({
      label: NLS_NEXT_MATCH_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.NextMatchFindAction),
      icon: findNextMatchIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        assertReturnsDefined(this._codeEditor.getAction(FIND_IDS.NextMatchFindAction)).run().then(void 0, onUnexpectedError);
      }
    }, this._hoverService));
    const findPart = document.createElement("div");
    findPart.className = "find-part";
    findPart.appendChild(this._findInput.domNode);
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "find-actions";
    findPart.appendChild(actionsContainer);
    actionsContainer.appendChild(this._matchesCount);
    actionsContainer.appendChild(this._prevBtn.domNode);
    actionsContainer.appendChild(this._nextBtn.domNode);
    this._toggleSelectionFind = this._register(new Toggle({
      icon: findSelectionIcon,
      title: NLS_TOGGLE_SELECTION_FIND_TITLE + this._keybindingLabelFor(FIND_IDS.ToggleSearchScopeCommand),
      isChecked: false,
      hoverLifecycleOptions,
      inputActiveOptionBackground: asCssVariable(inputActiveOptionBackground),
      inputActiveOptionBorder: asCssVariable(inputActiveOptionBorder),
      inputActiveOptionForeground: asCssVariable(inputActiveOptionForeground)
    }));
    this._register(this._toggleSelectionFind.onChange(() => {
      if (this._toggleSelectionFind.checked) {
        if (this._codeEditor.hasModel()) {
          let selections = this._codeEditor.getSelections();
          selections = selections.map((selection) => {
            if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
              selection = selection.setEndPosition(selection.endLineNumber - 1, this._codeEditor.getModel().getLineMaxColumn(selection.endLineNumber - 1));
            }
            if (!selection.isEmpty()) {
              return selection;
            }
            return null;
          }).filter((element) => !!element);
          if (selections.length) {
            this._state.change({ searchScope: selections }, true);
          }
        }
      } else {
        this._state.change({ searchScope: null }, true);
      }
    }));
    actionsContainer.appendChild(this._toggleSelectionFind.domNode);
    this._closeBtn = this._register(new SimpleButton({
      label: NLS_CLOSE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.CloseFindWidgetCommand),
      icon: widgetClose,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._state.change({ isRevealed: false, searchScope: null }, false);
      },
      onKeyDown: (e) => {
        if (e.equals(KeyCode.Tab)) {
          if (this._isReplaceVisible) {
            if (this._replaceBtn.isEnabled()) {
              this._replaceBtn.focus();
            } else {
              this._codeEditor.focus();
            }
            e.preventDefault();
          }
        }
      }
    }, this._hoverService));
    this._replaceInput = this._register(new ContextScopedReplaceInput(null, void 0, {
      label: NLS_REPLACE_INPUT_LABEL,
      placeholder: NLS_REPLACE_INPUT_PLACEHOLDER,
      appendPreserveCaseLabel: this._keybindingLabelFor(FIND_IDS.TogglePreserveCaseCommand),
      history: replaceHistoryConfig === "workspace" ? this._replaceWidgetHistory : /* @__PURE__ */ new Set([]),
      flexibleHeight,
      flexibleWidth,
      flexibleMaxHeight: 118,
      showHistoryHint: () => showHistoryKeybindingHint(this._keybindingService),
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      hoverLifecycleOptions
    }, this._contextKeyService, true));
    this._replaceInput.setPreserveCase(!!this._state.preserveCase);
    this._register(this._replaceInput.onKeyDown((e) => this._onReplaceInputKeyDown(e)));
    this._register(this._replaceInput.inputBox.onDidChange(() => {
      this._state.change({ replaceString: this._replaceInput.inputBox.value }, false);
    }));
    this._register(this._replaceInput.inputBox.onDidHeightChange((e) => {
      if (this._isReplaceVisible && this._tryUpdateHeight()) {
        this._showViewZone();
      }
    }));
    this._register(this._replaceInput.onDidOptionChange(() => {
      this._state.change({
        preserveCase: this._replaceInput.getPreserveCase()
      }, true);
    }));
    this._register(this._replaceInput.onPreserveCaseKeyDown((e) => {
      if (e.equals(KeyCode.Tab)) {
        if (this._prevBtn.isEnabled()) {
          this._prevBtn.focus();
        } else if (this._nextBtn.isEnabled()) {
          this._nextBtn.focus();
        } else if (this._toggleSelectionFind.enabled) {
          this._toggleSelectionFind.focus();
        } else if (this._closeBtn.isEnabled()) {
          this._closeBtn.focus();
        }
        e.preventDefault();
      }
    }));
    this._replaceBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceOneAction),
      icon: findReplaceIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._controller.replace();
      },
      onKeyDown: (e) => {
        if (e.equals(KeyMod.Shift | KeyCode.Tab)) {
          this._closeBtn.focus();
          e.preventDefault();
        }
      }
    }, this._hoverService));
    this._replaceAllBtn = this._register(new SimpleButton({
      label: NLS_REPLACE_ALL_BTN_LABEL + this._keybindingLabelFor(FIND_IDS.ReplaceAllAction),
      icon: findReplaceAllIcon,
      hoverLifecycleOptions,
      onTrigger: () => {
        this._controller.replaceAll();
      }
    }, this._hoverService));
    const replacePart = document.createElement("div");
    replacePart.className = "replace-part";
    replacePart.appendChild(this._replaceInput.domNode);
    const replaceActionsContainer = document.createElement("div");
    replaceActionsContainer.className = "replace-actions";
    replacePart.appendChild(replaceActionsContainer);
    replaceActionsContainer.appendChild(this._replaceBtn.domNode);
    replaceActionsContainer.appendChild(this._replaceAllBtn.domNode);
    this._toggleReplaceBtn = this._register(new SimpleButton({
      label: NLS_TOGGLE_REPLACE_MODE_BTN_LABEL,
      className: "codicon toggle left",
      onTrigger: () => {
        this._state.change({ isReplaceRevealed: !this._isReplaceVisible }, false);
        if (this._isReplaceVisible) {
          this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
          this._replaceInput.inputBox.layout();
        }
        this._showViewZone();
      }
    }, this._hoverService));
    this._toggleReplaceBtn.setExpanded(this._isReplaceVisible);
    this._domNode = document.createElement("div");
    this._domNode.className = "editor-widget find-widget";
    this._domNode.setAttribute("aria-hidden", "true");
    this._domNode.ariaLabel = NLS_FIND_DIALOG_LABEL;
    this._domNode.role = "dialog";
    this._domNode.style.width = `${FIND_WIDGET_INITIAL_WIDTH}px`;
    this._domNode.appendChild(this._toggleReplaceBtn.domNode);
    this._domNode.appendChild(findPart);
    this._domNode.appendChild(this._closeBtn.domNode);
    this._domNode.appendChild(replacePart);
    this._resizeSash = this._register(new Sash(this._domNode, this, { orientation: Orientation.VERTICAL, size: 2 }));
    this._resized = false;
    let originalWidth = FIND_WIDGET_INITIAL_WIDTH;
    this._register(this._resizeSash.onDidStart(() => {
      originalWidth = dom.getTotalWidth(this._domNode);
    }));
    this._register(this._resizeSash.onDidChange((evt) => {
      this._resized = true;
      const width = originalWidth + evt.startX - evt.currentX;
      if (width < FIND_WIDGET_INITIAL_WIDTH) {
        return;
      }
      const maxWidth = parseFloat(dom.getComputedStyle(this._domNode).maxWidth) || 0;
      if (width > maxWidth) {
        return;
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
      this._tryUpdateHeight();
    }));
    this._register(this._resizeSash.onDidReset(() => {
      const currentWidth = dom.getTotalWidth(this._domNode);
      if (currentWidth < FIND_WIDGET_INITIAL_WIDTH) {
        return;
      }
      let width = FIND_WIDGET_INITIAL_WIDTH;
      if (!this._resized || currentWidth === FIND_WIDGET_INITIAL_WIDTH) {
        const layoutInfo = this._codeEditor.getLayoutInfo();
        width = layoutInfo.width - 28 - layoutInfo.minimap.minimapWidth - 15;
        this._resized = true;
      } else {
      }
      this._domNode.style.width = `${width}px`;
      if (this._isReplaceVisible) {
        this._replaceInput.width = dom.getTotalWidth(this._findInput.domNode);
      }
      this._findInput.inputBox.layout();
    }));
  }
  updateAccessibilitySupport() {
    const value = this._codeEditor.getOption(EditorOption.accessibilitySupport);
    this._findInput.setFocusInputOnOptionClick(value !== AccessibilitySupport.Enabled);
    this._updateFindInputAriaLabel();
  }
  _updateFindInputAriaLabel() {
    let findLabel = NLS_FIND_INPUT_LABEL;
    let replaceLabel = NLS_REPLACE_INPUT_LABEL;
    if (!this._accessibilityHelpHintAnnounced && this._configurationService.getValue("accessibility.verbosity.find") && this._accessibilityService.isScreenReaderOptimized()) {
      const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding("editor.action.accessibilityHelp")?.getAriaLabel();
      if (accessibilityHelpKeybinding) {
        const hint = nls.localize("accessibilityHelpHintInLabel", "Press {0} for accessibility help", accessibilityHelpKeybinding);
        findLabel = nls.localize("findInputAriaLabelWithHint", "{0}, {1}", findLabel, hint);
        replaceLabel = nls.localize("replaceInputAriaLabelWithHint", "{0}, {1}", replaceLabel, hint);
      }
      this._accessibilityHelpHintAnnounced = true;
      this._labelResetTimeout?.dispose();
      this._labelResetTimeout = disposableTimeout(() => {
        if (this._isVisible) {
          this._findInput.inputBox.setAriaLabel(NLS_FIND_INPUT_LABEL);
          this._replaceInput.inputBox.setAriaLabel(NLS_REPLACE_INPUT_LABEL);
        }
      }, 1e3);
    }
    this._findInput.inputBox.setAriaLabel(findLabel);
    this._replaceInput.inputBox.setAriaLabel(replaceLabel);
  }
  getViewState() {
    let widgetViewZoneVisible = false;
    if (this._viewZone && this._viewZoneId) {
      widgetViewZoneVisible = this._viewZone.heightInPx > this._codeEditor.getScrollTop();
    }
    return {
      widgetViewZoneVisible,
      scrollTop: this._codeEditor.getScrollTop()
    };
  }
  setViewState(state) {
    if (!state) {
      return;
    }
    if (state.widgetViewZoneVisible) {
      this._layoutViewZone(state.scrollTop);
    }
  }
};
_FindWidget.ID = "editor.contrib.findWidget";
let FindWidget = _FindWidget;
class SimpleButton extends Widget {
  constructor(opts, hoverService) {
    super();
    this._opts = opts;
    let className = "button";
    if (this._opts.className) {
      className = className + " " + this._opts.className;
    }
    if (this._opts.icon) {
      className = className + " " + ThemeIcon.asClassName(this._opts.icon);
    }
    this._domNode = document.createElement("div");
    this._domNode.tabIndex = 0;
    this._domNode.className = className;
    this._domNode.setAttribute("role", "button");
    this._domNode.setAttribute("aria-label", this._opts.label);
    this._register(hoverService.setupDelayedHover(this._domNode, {
      content: this._opts.label,
      style: HoverStyle.Pointer
    }, opts.hoverLifecycleOptions));
    this.onclick(this._domNode, (e) => {
      this._opts.onTrigger();
      e.preventDefault();
    });
    this.onkeydown(this._domNode, (e) => {
      if (e.equals(KeyCode.Space) || e.equals(KeyCode.Enter)) {
        this._opts.onTrigger();
        e.preventDefault();
        return;
      }
      this._opts.onKeyDown?.(e);
    });
  }
  get domNode() {
    return this._domNode;
  }
  isEnabled() {
    return this._domNode.tabIndex >= 0;
  }
  focus() {
    this._domNode.focus();
  }
  setEnabled(enabled) {
    this._domNode.classList.toggle("disabled", !enabled);
    this._domNode.setAttribute("aria-disabled", String(!enabled));
    this._domNode.tabIndex = enabled ? 0 : -1;
  }
  setExpanded(expanded) {
    this._domNode.setAttribute("aria-expanded", String(!!expanded));
    if (expanded) {
      this._domNode.classList.remove(...ThemeIcon.asClassNameArray(findCollapsedIcon));
      this._domNode.classList.add(...ThemeIcon.asClassNameArray(findExpandedIcon));
    } else {
      this._domNode.classList.remove(...ThemeIcon.asClassNameArray(findExpandedIcon));
      this._domNode.classList.add(...ThemeIcon.asClassNameArray(findCollapsedIcon));
    }
  }
}
registerThemingParticipant((theme, collector) => {
  const findMatchHighlightBorder = theme.getColor(editorFindMatchHighlightBorder);
  if (findMatchHighlightBorder) {
    collector.addRule(`.monaco-editor .findMatch { border: 1px ${isHighContrast(theme.type) ? "dotted" : "solid"} ${findMatchHighlightBorder}; box-sizing: border-box; }`);
  }
  const findRangeHighlightBorder = theme.getColor(editorFindRangeHighlightBorder);
  if (findRangeHighlightBorder) {
    collector.addRule(`.monaco-editor .findScope { border: 1px ${isHighContrast(theme.type) ? "dashed" : "solid"} ${findRangeHighlightBorder}; }`);
  }
  const hcBorder = theme.getColor(contrastBorder);
  if (hcBorder) {
    collector.addRule(`.monaco-editor .find-widget { border: 1px solid ${hcBorder}; }`);
  }
  const findMatchForeground = theme.getColor(editorFindMatchForeground);
  if (findMatchForeground) {
    collector.addRule(`.monaco-editor .findMatchInline { color: ${findMatchForeground}; }`);
  }
  const findMatchHighlightForeground = theme.getColor(editorFindMatchHighlightForeground);
  if (findMatchHighlightForeground) {
    collector.addRule(`.monaco-editor .currentFindMatchInline { color: ${findMatchHighlightForeground}; }`);
  }
});
export {
  FindWidget,
  FindWidgetViewZone,
  NLS_MATCHES_LOCATION,
  NLS_NO_RESULTS,
  SimpleButton,
  findNextMatchIcon,
  findPreviousMatchIcon,
  findReplaceAllIcon,
  findReplaceIcon,
  findSelectionIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGFsZXJ0IGFzIGFsZXJ0Rm4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IEZpbmRJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9maW5kaW5wdXQvZmluZElucHV0LmpzJztcbmltcG9ydCB7IFJlcGxhY2VJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9maW5kaW5wdXQvcmVwbGFjZUlucHV0LmpzJztcbmltcG9ydCB7IElNZXNzYWdlIGFzIElucHV0Qm94TWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJU2FzaEV2ZW50LCBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIsIE9yaWVudGF0aW9uLCBTYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAnLi9maW5kV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIElWaWV3Wm9uZSwgT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0ZJTkRfSU5QVVRfRk9DVVNFRCwgQ09OVEVYVF9GSU5EX1dJREdFVF9GT0NVU0VELCBDT05URVhUX1JFUExBQ0VfSU5QVVRfRk9DVVNFRCwgRklORF9JRFMsIE1BVENIRVNfTElNSVQgfSBmcm9tICcuL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlLCBGaW5kUmVwbGFjZVN0YXRlQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi9maW5kU3RhdGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U3VwcG9ydCwgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0U2NvcGVkRmluZElucHV0LCBDb250ZXh0U2NvcGVkUmVwbGFjZUlucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2NvbnRleHRTY29wZWRIaXN0b3J5V2lkZ2V0LmpzJztcbmltcG9ydCB7IHNob3dIaXN0b3J5S2V5YmluZGluZ0hpbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvaGlzdG9yeVdpZGdldEtleWJpbmRpbmdIaW50LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgY29udHJhc3RCb3JkZXIsIGVkaXRvckZpbmRNYXRjaEZvcmVncm91bmQsIGVkaXRvckZpbmRNYXRjaEhpZ2hsaWdodEJvcmRlciwgZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZCwgZWRpdG9yRmluZFJhbmdlSGlnaGxpZ2h0Qm9yZGVyLCBpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsIGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyLCBpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24sIHdpZGdldENsb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSwgdHlwZSBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuXG5jb25zdCBmaW5kQ29sbGFwc2VkSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1jb2xsYXBzZWQnLCBDb2RpY29uLmNoZXZyb25SaWdodCwgbmxzLmxvY2FsaXplKCdmaW5kQ29sbGFwc2VkSWNvbicsICdJY29uIHRvIGluZGljYXRlIHRoYXQgdGhlIGVkaXRvciBmaW5kIHdpZGdldCBpcyBjb2xsYXBzZWQuJykpO1xuY29uc3QgZmluZEV4cGFuZGVkSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1leHBhbmRlZCcsIENvZGljb24uY2hldnJvbkRvd24sIG5scy5sb2NhbGl6ZSgnZmluZEV4cGFuZGVkSWNvbicsICdJY29uIHRvIGluZGljYXRlIHRoYXQgdGhlIGVkaXRvciBmaW5kIHdpZGdldCBpcyBleHBhbmRlZC4nKSk7XG5cbmV4cG9ydCBjb25zdCBmaW5kU2VsZWN0aW9uSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1zZWxlY3Rpb24nLCBDb2RpY29uLnNlbGVjdGlvbiwgbmxzLmxvY2FsaXplKCdmaW5kU2VsZWN0aW9uSWNvbicsICdJY29uIGZvciBcXCdGaW5kIGluIFNlbGVjdGlvblxcJyBpbiB0aGUgZWRpdG9yIGZpbmQgd2lkZ2V0LicpKTtcbmV4cG9ydCBjb25zdCBmaW5kUmVwbGFjZUljb24gPSByZWdpc3Rlckljb24oJ2ZpbmQtcmVwbGFjZScsIENvZGljb24ucmVwbGFjZSwgbmxzLmxvY2FsaXplKCdmaW5kUmVwbGFjZUljb24nLCAnSWNvbiBmb3IgXFwnUmVwbGFjZVxcJyBpbiB0aGUgZWRpdG9yIGZpbmQgd2lkZ2V0LicpKTtcbmV4cG9ydCBjb25zdCBmaW5kUmVwbGFjZUFsbEljb24gPSByZWdpc3Rlckljb24oJ2ZpbmQtcmVwbGFjZS1hbGwnLCBDb2RpY29uLnJlcGxhY2VBbGwsIG5scy5sb2NhbGl6ZSgnZmluZFJlcGxhY2VBbGxJY29uJywgJ0ljb24gZm9yIFxcJ1JlcGxhY2UgQWxsXFwnIGluIHRoZSBlZGl0b3IgZmluZCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGZpbmRQcmV2aW91c01hdGNoSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1wcmV2aW91cy1tYXRjaCcsIENvZGljb24uYXJyb3dVcCwgbmxzLmxvY2FsaXplKCdmaW5kUHJldmlvdXNNYXRjaEljb24nLCAnSWNvbiBmb3IgXFwnRmluZCBQcmV2aW91c1xcJyBpbiB0aGUgZWRpdG9yIGZpbmQgd2lkZ2V0LicpKTtcbmV4cG9ydCBjb25zdCBmaW5kTmV4dE1hdGNoSWNvbiA9IHJlZ2lzdGVySWNvbignZmluZC1uZXh0LW1hdGNoJywgQ29kaWNvbi5hcnJvd0Rvd24sIG5scy5sb2NhbGl6ZSgnZmluZE5leHRNYXRjaEljb24nLCAnSWNvbiBmb3IgXFwnRmluZCBOZXh0XFwnIGluIHRoZSBlZGl0b3IgZmluZCB3aWRnZXQuJykpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElGaW5kQ29udHJvbGxlciB7XG5cdHJlcGxhY2UoKTogdm9pZDtcblx0cmVwbGFjZUFsbCgpOiB2b2lkO1xuXHRnZXRHbG9iYWxCdWZmZXJUZXJtKCk6IFByb21pc2U8c3RyaW5nPjtcbn1cblxuY29uc3QgTkxTX0ZJTkRfRElBTE9HX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5maW5kRGlhbG9nJywgXCJGaW5kIC8gUmVwbGFjZVwiKTtcbmNvbnN0IE5MU19GSU5EX0lOUFVUX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5maW5kJywgXCJGaW5kXCIpO1xuY29uc3QgTkxTX0ZJTkRfSU5QVVRfUExBQ0VIT0xERVIgPSBubHMubG9jYWxpemUoJ3BsYWNlaG9sZGVyLmZpbmQnLCBcIkZpbmRcIik7XG5jb25zdCBOTFNfUFJFVklPVVNfTUFUQ0hfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5wcmV2aW91c01hdGNoQnV0dG9uJywgXCJQcmV2aW91cyBNYXRjaFwiKTtcbmNvbnN0IE5MU19ORVhUX01BVENIX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwubmV4dE1hdGNoQnV0dG9uJywgXCJOZXh0IE1hdGNoXCIpO1xuY29uc3QgTkxTX1RPR0dMRV9TRUxFQ1RJT05fRklORF9USVRMRSA9IG5scy5sb2NhbGl6ZSgnbGFiZWwudG9nZ2xlU2VsZWN0aW9uRmluZCcsIFwiRmluZCBpbiBTZWxlY3Rpb25cIik7XG5jb25zdCBOTFNfQ0xPU0VfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5jbG9zZUJ1dHRvbicsIFwiQ2xvc2VcIik7XG5jb25zdCBOTFNfUkVQTEFDRV9JTlBVVF9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwucmVwbGFjZScsIFwiUmVwbGFjZVwiKTtcbmNvbnN0IE5MU19SRVBMQUNFX0lOUFVUX1BMQUNFSE9MREVSID0gbmxzLmxvY2FsaXplKCdwbGFjZWhvbGRlci5yZXBsYWNlJywgXCJSZXBsYWNlXCIpO1xuY29uc3QgTkxTX1JFUExBQ0VfQlROX0xBQkVMID0gbmxzLmxvY2FsaXplKCdsYWJlbC5yZXBsYWNlQnV0dG9uJywgXCJSZXBsYWNlXCIpO1xuY29uc3QgTkxTX1JFUExBQ0VfQUxMX0JUTl9MQUJFTCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwucmVwbGFjZUFsbEJ1dHRvbicsIFwiUmVwbGFjZSBBbGxcIik7XG5jb25zdCBOTFNfVE9HR0xFX1JFUExBQ0VfTU9ERV9CVE5fTEFCRUwgPSBubHMubG9jYWxpemUoJ2xhYmVsLnRvZ2dsZVJlcGxhY2VCdXR0b24nLCBcIlRvZ2dsZSBSZXBsYWNlXCIpO1xuY29uc3QgTkxTX01BVENIRVNfQ09VTlRfTElNSVRfVElUTEUgPSBubHMubG9jYWxpemUoJ3RpdGxlLm1hdGNoZXNDb3VudExpbWl0JywgXCJPbmx5IHRoZSBmaXJzdCB7MH0gcmVzdWx0cyBhcmUgaGlnaGxpZ2h0ZWQsIGJ1dCBhbGwgZmluZCBvcGVyYXRpb25zIHdvcmsgb24gdGhlIGVudGlyZSB0ZXh0LlwiLCBNQVRDSEVTX0xJTUlUKTtcbmV4cG9ydCBjb25zdCBOTFNfTUFUQ0hFU19MT0NBVElPTiA9IG5scy5sb2NhbGl6ZSgnbGFiZWwubWF0Y2hlc0xvY2F0aW9uJywgXCJ7MH0gb2YgezF9XCIpO1xuZXhwb3J0IGNvbnN0IE5MU19OT19SRVNVTFRTID0gbmxzLmxvY2FsaXplKCdsYWJlbC5ub1Jlc3VsdHMnLCBcIk5vIHJlc3VsdHNcIik7XG5cbmNvbnN0IEZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEggPSA0MTk7XG5jb25zdCBQQVJUX1dJRFRIID0gMjc1O1xuY29uc3QgRklORF9JTlBVVF9BUkVBX1dJRFRIID0gUEFSVF9XSURUSCAtIDU0O1xuXG5sZXQgTUFYX01BVENIRVNfQ09VTlRfV0lEVEggPSA2OTtcbi8vIGxldCBGSU5EX0FMTF9DT05UUk9MU19XSURUSCA9IDE3LyoqIEZpbmQgSW5wdXQgbWFyZ2luLWxlZnQgKi8gKyAoTUFYX01BVENIRVNfQ09VTlRfV0lEVEggKyAzICsgMSkgLyoqIE1hdGNoIFJlc3VsdHMgKi8gKyAyMyAvKiogQnV0dG9uICovICogNCArIDIvKiogc2FzaCAqLztcblxuY29uc3QgRklORF9JTlBVVF9BUkVBX0hFSUdIVCA9IDMzOyAvLyBUaGUgaGVpZ2h0IG9mIEZpbmQgV2lkZ2V0IHdoZW4gUmVwbGFjZSBJbnB1dCBpcyBub3QgdmlzaWJsZS5cblxuY29uc3QgY3RybEtleU1vZCA9IChwbGF0Zm9ybS5pc01hY2ludG9zaCA/IEtleU1vZC5XaW5DdHJsIDogS2V5TW9kLkN0cmxDbWQpO1xuZXhwb3J0IGNsYXNzIEZpbmRXaWRnZXRWaWV3Wm9uZSBpbXBsZW1lbnRzIElWaWV3Wm9uZSB7XG5cdHB1YmxpYyByZWFkb25seSBhZnRlckxpbmVOdW1iZXI6IG51bWJlcjtcblx0cHVibGljIGhlaWdodEluUHg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHN1cHByZXNzTW91c2VEb3duOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoYWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIpIHtcblx0XHR0aGlzLmFmdGVyTGluZU51bWJlciA9IGFmdGVyTGluZU51bWJlcjtcblxuXHRcdHRoaXMuaGVpZ2h0SW5QeCA9IEZJTkRfSU5QVVRfQVJFQV9IRUlHSFQ7XG5cdFx0dGhpcy5zdXBwcmVzc01vdXNlRG93biA9IGZhbHNlO1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc05hbWUgPSAnZG9jay1maW5kLXZpZXd6b25lJztcblx0fVxufVxuXG5mdW5jdGlvbiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVVcHdhcmRzKGV2ZW50OiBJS2V5Ym9hcmRFdmVudCwgdmFsdWU6IHN0cmluZywgdGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsKSB7XG5cdGNvbnN0IGlzTXVsdGlsaW5lID0gISF2YWx1ZS5tYXRjaCgvXFxuLyk7XG5cdGlmICh0ZXh0YXJlYSAmJiBpc011bHRpbGluZSAmJiB0ZXh0YXJlYS5zZWxlY3Rpb25TdGFydCA+IDApIHtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRyZXR1cm47XG5cdH1cbn1cblxuZnVuY3Rpb24gc3RvcFByb3BhZ2F0aW9uRm9yTXVsdGlMaW5lRG93bndhcmRzKGV2ZW50OiBJS2V5Ym9hcmRFdmVudCwgdmFsdWU6IHN0cmluZywgdGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCBudWxsKSB7XG5cdGNvbnN0IGlzTXVsdGlsaW5lID0gISF2YWx1ZS5tYXRjaCgvXFxuLyk7XG5cdGlmICh0ZXh0YXJlYSAmJiBpc011bHRpbGluZSAmJiB0ZXh0YXJlYS5zZWxlY3Rpb25FbmQgPCB0ZXh0YXJlYS52YWx1ZS5sZW5ndGgpIHtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRyZXR1cm47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRXaWRnZXQgZXh0ZW5kcyBXaWRnZXQgaW1wbGVtZW50cyBJT3ZlcmxheVdpZGdldCwgSVZlcnRpY2FsU2FzaExheW91dFByb3ZpZGVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuZmluZFdpZGdldCc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogRmluZFJlcGxhY2VTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJvbGxlcjogSUZpbmRDb250cm9sbGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRwcml2YXRlIF9kb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2NhY2hlZEhlaWdodDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2ZpbmRJbnB1dCE6IEZpbmRJbnB1dDtcblx0cHJpdmF0ZSBfcmVwbGFjZUlucHV0ITogUmVwbGFjZUlucHV0O1xuXG5cdHByaXZhdGUgX3RvZ2dsZVJlcGxhY2VCdG4hOiBTaW1wbGVCdXR0b247XG5cdHByaXZhdGUgX21hdGNoZXNDb3VudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9wcmV2QnRuITogU2ltcGxlQnV0dG9uO1xuXHRwcml2YXRlIF9uZXh0QnRuITogU2ltcGxlQnV0dG9uO1xuXHRwcml2YXRlIF90b2dnbGVTZWxlY3Rpb25GaW5kITogVG9nZ2xlO1xuXHRwcml2YXRlIF9jbG9zZUJ0biE6IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSBfcmVwbGFjZUJ0biE6IFNpbXBsZUJ1dHRvbjtcblx0cHJpdmF0ZSBfcmVwbGFjZUFsbEJ0biE6IFNpbXBsZUJ1dHRvbjtcblxuXHRwcml2YXRlIF9pc1Zpc2libGU6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzUmVwbGFjZVZpc2libGU6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lnbm9yZUNoYW5nZUV2ZW50OiBib29sZWFuO1xuXHRwcml2YXRlIF9hY2Nlc3NpYmlsaXR5SGVscEhpbnRBbm5vdW5jZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2xhYmVsUmVzZXRUaW1lb3V0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEZvY3VzZWRJbnB1dFdhc1JlcGxhY2U6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kRm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZmluZElucHV0Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcGxhY2VGb2N1c1RyYWNrZXI6IGRvbS5JRm9jdXNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBsYWNlSW5wdXRGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfd2lkZ2V0Rm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmluZFdpZGdldEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9sYXN0Rm9jdXNlZEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3ZpZXdab25lPzogRmluZFdpZGdldFZpZXdab25lO1xuXHRwcml2YXRlIF92aWV3Wm9uZUlkPzogc3RyaW5nO1xuXG5cdHByaXZhdGUgX3Jlc2l6ZVNhc2ghOiBTYXNoO1xuXHRwcml2YXRlIF9yZXNpemVkITogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlSGlzdG9yeURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29kZUVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0Y29udHJvbGxlcjogSUZpbmRDb250cm9sbGVyLFxuXHRcdHN0YXRlOiBGaW5kUmVwbGFjZVN0YXRlLFxuXHRcdGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZmluZFdpZGdldFNlYXJjaEhpc3Rvcnk6IElIaXN0b3J5PHN0cmluZz4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVwbGFjZVdpZGdldEhpc3Rvcnk6IElIaXN0b3J5PHN0cmluZz4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3IgPSBjb2RlRWRpdG9yO1xuXHRcdHRoaXMuX2NvbnRyb2xsZXIgPSBjb250cm9sbGVyO1xuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5fY29udGV4dFZpZXdQcm92aWRlciA9IGNvbnRleHRWaWV3UHJvdmlkZXI7XG5cdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UgPSBrZXliaW5kaW5nU2VydmljZTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IGNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5faXNSZXBsYWNlVmlzaWJsZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkID0gZmFsc2U7XG5cblx0XHR0aGlzLl91cGRhdGVIaXN0b3J5RGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3VwZGF0ZUhpc3RvcnlEZWxheWVyLmNhbmNlbCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKChlKSA9PiB0aGlzLl9vblN0YXRlQ2hhbmdlZChlKSkpO1xuXHRcdHRoaXMuX2J1aWxkRG9tTm9kZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblx0XHR0aGlzLl90cnlVcGRhdGVXaWRnZXRXaWR0aCgpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5sYXlvdXQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkpIHtcblx0XHRcdFx0XHQvLyBIaWRlIHJlcGxhY2UgcGFydCBpZiBlZGl0b3IgYmVjb21lcyByZWFkIG9ubHlcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JlcGxhY2VSZXZlYWxlZDogZmFsc2UgfSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuX3RyeVVwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZpbmQpKSB7XG5cdFx0XHRcdGNvbnN0IHN1cHBvcnRMb29wID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmxvb3A7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGxvb3A6IHN1cHBvcnRMb29wIH0sIGZhbHNlKTtcblx0XHRcdFx0Y29uc3QgYWRkRXh0cmFTcGFjZU9uVG9wID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmFkZEV4dHJhU3BhY2VPblRvcDtcblx0XHRcdFx0aWYgKGFkZEV4dHJhU3BhY2VPblRvcCAmJiAhdGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdFx0XHR0aGlzLl92aWV3Wm9uZSA9IG5ldyBGaW5kV2lkZ2V0Vmlld1pvbmUoMCk7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd1ZpZXdab25lKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFhZGRFeHRyYVNwYWNlT25Ub3AgJiYgdGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW1vdmVWaWV3Wm9uZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlQWNjZXNzaWJpbGl0eVN1cHBvcnQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb2RlRWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9nZ2xlU2VsZWN0aW9uRmluZEJ1dHRvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb2RlRWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHRjb25zdCBnbG9iYWxCdWZmZXJUZXJtID0gYXdhaXQgdGhpcy5fY29udHJvbGxlci5nZXRHbG9iYWxCdWZmZXJUZXJtKCk7XG5cdFx0XHRcdGlmIChnbG9iYWxCdWZmZXJUZXJtICYmIGdsb2JhbEJ1ZmZlclRlcm0gIT09IHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZykge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogZ2xvYmFsQnVmZmVyVGVybSB9LCBmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWQgPSBDT05URVhUX0ZJTkRfSU5QVVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2ZpbmRGb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3Rlcihkb20udHJhY2tGb2N1cyh0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guaW5wdXRFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZEZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWQuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fbGFzdEZvY3VzZWRJbnB1dFdhc1JlcGxhY2UgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlYXJjaFNjb3BlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRGb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWQuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZXBsYWNlSW5wdXRGb2N1c2VkID0gQ09OVEVYVF9SRVBMQUNFX0lOUFVUX0ZPQ1VTRUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXBsYWNlRm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LmlucHV0RWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VGb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX2xhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlYXJjaFNjb3BlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VGb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dEZvY3VzZWQuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBmb2N1cyBvbiB0aGUgZW50aXJlIEZpbmQgd2lkZ2V0IGZvciBhY2Nlc3NpYmlsaXR5IGhlbHBcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZCA9IENPTlRFWFRfRklORF9XSURHRVRfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3dpZGdldEZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuX2RvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aWRnZXRGb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpZGdldEZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmluZFdpZGdldEZvY3VzZWQuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayB3aGljaCBlbGVtZW50IHdhcyBsYXN0IGZvY3VzZWQgd2l0aGluIHRoZSB3aWRnZXQgdXNpbmcgZm9jdXNpbiAod2hpY2ggYnViYmxlcylcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsICdmb2N1c2luJywgKGU6IEZvY3VzRXZlbnQpID0+IHtcblx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChlLnRhcmdldCkpIHtcblx0XHRcdFx0dGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50ID0gZS50YXJnZXQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29kZUVkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuYWRkRXh0cmFTcGFjZU9uVG9wKSB7XG5cdFx0XHR0aGlzLl92aWV3Wm9uZSA9IG5ldyBGaW5kV2lkZ2V0Vmlld1pvbmUoMCk7IC8vIFB1dCBpdCBiZWZvcmUgdGhlIGZpcnN0IGxpbmUgdGhlbiB1c2VycyBjYW4gc2Nyb2xsIGJleW9uZCB0aGUgZmlyc3QgbGluZS5cblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb2RlRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdmlld1pvbmVJZCA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0Vmlld1pvbmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmb3Igb3RoZXIgc2Nyb2xsIGNoYW5nZXMsIGxheW91dCB0aGUgdmlld3pvbmUgaW4gbmV4dCB0aWNrIHRvIGF2b2lkIHJ1aW5pbmcgY3VycmVudCByZW5kZXJpbmcuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0Vmlld1pvbmUoKTtcblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLS0tIElPdmVybGF5V2lkZ2V0IEFQSVxuXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBGaW5kV2lkZ2V0LklEO1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgUmVwbGFjZSBpbnB1dCB3YXMgdGhlIGxhc3QgZm9jdXNlZCBpbnB1dCBpbiB0aGUgZmluZCB3aWRnZXQuXG5cdCAqIFRoaXMgcGVyc2lzdHMgZXZlbiBhZnRlciBmb2N1cyBsZWF2ZXMgdGhlIHdpZGdldCwgYWxsb3dpbmcgZXh0ZXJuYWwgY29kZSB0byBrbm93XG5cdCAqIHdoaWNoIGlucHV0IHRvIHJlc3RvcmUgZm9jdXMgdG8uXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGxhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Rm9jdXNlZElucHV0V2FzUmVwbGFjZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsYXN0IGZvY3VzZWQgZWxlbWVudCB3aXRoaW4gdGhlIEZpbmQgd2lkZ2V0LlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCBmb3IgcmVzdG9yaW5nIGZvY3VzIHRvIHRoZSBleGFjdCBlbGVtZW50IGFmdGVyXG5cdCAqIGFjY2Vzc2liaWxpdHkgaGVscCBvciBvdGhlciBvdmVybGF5cyBhcmUgZGlzbWlzc2VkLlxuXHQgKi9cblx0cHVibGljIGdldCBsYXN0Rm9jdXNlZEVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50IGluIHRoZSBGaW5kIHdpZGdldC5cblx0ICogRmFsbHMgYmFjayB0byB0aGUgRmluZCBvciBSZXBsYWNlIGlucHV0IGJhc2VkIG9uIGxhc3RGb2N1c2VkSW5wdXRXYXNSZXBsYWNlLlxuXHQgKi9cblx0cHVibGljIGZvY3VzTGFzdEVsZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xhc3RGb2N1c2VkRWxlbWVudCAmJiB0aGlzLl9kb21Ob2RlLmNvbnRhaW5zKHRoaXMuX2xhc3RGb2N1c2VkRWxlbWVudCkgJiYgZG9tLmdldFdpbmRvdyh0aGlzLl9sYXN0Rm9jdXNlZEVsZW1lbnQpLmRvY3VtZW50LmJvZHkuY29udGFpbnModGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50KSkge1xuXHRcdFx0dGhpcy5fbGFzdEZvY3VzZWRFbGVtZW50LmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9sYXN0Rm9jdXNlZElucHV0V2FzUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5mb2N1c1JlcGxhY2VJbnB1dCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZvY3VzRmluZElucHV0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwcmVmZXJlbmNlOiBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLlRPUF9SSUdIVF9DT1JORVJcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Ly8gLS0tLS0gUmVhY3QgdG8gc3RhdGUgY2hhbmdlc1xuXG5cdHByaXZhdGUgX29uU3RhdGVDaGFuZ2VkKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5zZWFyY2hTdHJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2lnbm9yZUNoYW5nZUV2ZW50ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZmluZElucHV0LnNldFZhbHVlKHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9pZ25vcmVDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdH1cblx0XHRpZiAoZS5yZXBsYWNlU3RyaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gudmFsdWUgPSB0aGlzLl9zdGF0ZS5yZXBsYWNlU3RyaW5nO1xuXHRcdH1cblx0XHRpZiAoZS5pc1JldmVhbGVkKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0XHR0aGlzLl9yZXZlYWwoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2hpZGUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChlLmlzUmVwbGFjZVJldmVhbGVkKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZXBsYWNlUmV2ZWFsZWQpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpICYmICF0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5faXNSZXBsYWNlVmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5faXNSZXBsYWNlVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoKGUuaXNSZXZlYWxlZCB8fCBlLmlzUmVwbGFjZVJldmVhbGVkKSAmJiAodGhpcy5fc3RhdGUuaXNSZXZlYWxlZCB8fCB0aGlzLl9zdGF0ZS5pc1JlcGxhY2VSZXZlYWxlZCkpIHtcblx0XHRcdGlmICh0aGlzLl90cnlVcGRhdGVIZWlnaHQoKSkge1xuXHRcdFx0XHR0aGlzLl9zaG93Vmlld1pvbmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZS5pc1JlZ2V4KSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0UmVnZXgodGhpcy5fc3RhdGUuaXNSZWdleCk7XG5cdFx0fVxuXHRcdGlmIChlLndob2xlV29yZCkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNldFdob2xlV29yZHModGhpcy5fc3RhdGUud2hvbGVXb3JkKTtcblx0XHR9XG5cdFx0aWYgKGUubWF0Y2hDYXNlKSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuc2V0Q2FzZVNlbnNpdGl2ZSh0aGlzLl9zdGF0ZS5tYXRjaENhc2UpO1xuXHRcdH1cblx0XHRpZiAoZS5wcmVzZXJ2ZUNhc2UpIHtcblx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZXRQcmVzZXJ2ZUNhc2UodGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKTtcblx0XHR9XG5cdFx0aWYgKGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5zZWFyY2hTY29wZSkge1xuXHRcdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVUb2dnbGVTZWxlY3Rpb25GaW5kQnV0dG9uKCk7XG5cdFx0fVxuXHRcdGlmIChlLnNlYXJjaFN0cmluZyB8fCBlLm1hdGNoZXNDb3VudCB8fCBlLm1hdGNoZXNQb3NpdGlvbikge1xuXHRcdFx0Y29uc3Qgc2hvd1JlZE91dGxpbmUgPSAodGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nLmxlbmd0aCA+IDAgJiYgdGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID09PSAwKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnbm8tcmVzdWx0cycsIHNob3dSZWRPdXRsaW5lKTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlTWF0Y2hlc0NvdW50KCk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25zKCk7XG5cdFx0fVxuXHRcdGlmIChlLnNlYXJjaFN0cmluZyB8fCBlLmN1cnJlbnRNYXRjaCkge1xuXHRcdFx0dGhpcy5fbGF5b3V0Vmlld1pvbmUoKTtcblx0XHR9XG5cdFx0aWYgKGUudXBkYXRlSGlzdG9yeSkge1xuXHRcdFx0dGhpcy5fZGVsYXllZFVwZGF0ZUhpc3RvcnkoKTtcblx0XHR9XG5cdFx0aWYgKGUubG9vcCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RlbGF5ZWRVcGRhdGVIaXN0b3J5KCkge1xuXHRcdHRoaXMuX3VwZGF0ZUhpc3RvcnlEZWxheWVyLnRyaWdnZXIodGhpcy5fdXBkYXRlSGlzdG9yeS5iaW5kKHRoaXMpKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGlzdG9yeSgpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nKSB7XG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZS5yZXBsYWNlU3RyaW5nKSB7XG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWF0Y2hlc0NvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5zdHlsZS5taW5XaWR0aCA9IE1BWF9NQVRDSEVTX0NPVU5UX1dJRFRIICsgJ3B4Jztcblx0XHRpZiAodGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID49IE1BVENIRVNfTElNSVQpIHtcblx0XHRcdHRoaXMuX21hdGNoZXNDb3VudC50aXRsZSA9IE5MU19NQVRDSEVTX0NPVU5UX0xJTUlUX1RJVExFO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tYXRjaGVzQ291bnQudGl0bGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyByZW1vdmUgcHJldmlvdXMgY29udGVudFxuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5maXJzdENoaWxkPy5yZW1vdmUoKTtcblxuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPiAwKSB7XG5cdFx0XHRsZXQgbWF0Y2hlc0NvdW50OiBzdHJpbmcgPSBTdHJpbmcodGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50KTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPj0gTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0XHRtYXRjaGVzQ291bnQgKz0gJysnO1xuXHRcdFx0fVxuXHRcdFx0bGV0IG1hdGNoZXNQb3NpdGlvbjogc3RyaW5nID0gU3RyaW5nKHRoaXMuX3N0YXRlLm1hdGNoZXNQb3NpdGlvbik7XG5cdFx0XHRpZiAobWF0Y2hlc1Bvc2l0aW9uID09PSAnMCcpIHtcblx0XHRcdFx0bWF0Y2hlc1Bvc2l0aW9uID0gJz8nO1xuXHRcdFx0fVxuXHRcdFx0bGFiZWwgPSBzdHJpbmdzLmZvcm1hdChOTFNfTUFUQ0hFU19MT0NBVElPTiwgbWF0Y2hlc1Bvc2l0aW9uLCBtYXRjaGVzQ291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbCA9IE5MU19OT19SRVNVTFRTO1xuXHRcdH1cblxuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsYWJlbCkpO1xuXG5cdFx0YWxlcnRGbih0aGlzLl9nZXRBcmlhTGFiZWwobGFiZWwsIHRoaXMuX3N0YXRlLmN1cnJlbnRNYXRjaCwgdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nKSk7XG5cdFx0TUFYX01BVENIRVNfQ09VTlRfV0lEVEggPSBNYXRoLm1heChNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCwgdGhpcy5fbWF0Y2hlc0NvdW50LmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdC8vIC0tLS0tIGFjdGlvbnNcblxuXHRwcml2YXRlIF9nZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZywgY3VycmVudE1hdGNoOiBSYW5nZSB8IG51bGwsIHNlYXJjaFN0cmluZzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmc7XG5cdFx0aWYgKGxhYmVsID09PSBOTFNfTk9fUkVTVUxUUykge1xuXHRcdFx0cmVzdWx0ID0gc2VhcmNoU3RyaW5nID09PSAnJ1xuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0RW1wdHknLCBcInswfSBmb3VuZFwiLCBsYWJlbClcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdCcsIFwiezB9IGZvdW5kIGZvciAnezF9J1wiLCBsYWJlbCwgc2VhcmNoU3RyaW5nKTtcblx0XHR9IGVsc2UgaWYgKGN1cnJlbnRNYXRjaCkge1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gbmxzLmxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHRXaXRoTGluZU51bScsIFwiezB9IGZvdW5kIGZvciAnezF9JywgYXQgezJ9XCIsIGxhYmVsLCBzZWFyY2hTdHJpbmcsIGN1cnJlbnRNYXRjaC5zdGFydExpbmVOdW1iZXIgKyAnOicgKyBjdXJyZW50TWF0Y2guc3RhcnRDb2x1bW4pO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWwgJiYgKGN1cnJlbnRNYXRjaC5zdGFydExpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCkpICYmIChjdXJyZW50TWF0Y2guc3RhcnRMaW5lTnVtYmVyID49IDEpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoY3VycmVudE1hdGNoLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdHJlc3VsdCA9IGAke2xpbmVDb250ZW50fSwgJHthcmlhTGFiZWx9YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdCA9IGFyaWFMYWJlbDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gbmxzLmxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHRXaXRoTGluZU51bU5vQ3VycmVudE1hdGNoJywgXCJ7MH0gZm91bmQgZm9yICd7MX0nXCIsIGxhYmVsLCBzZWFyY2hTdHJpbmcpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogSWYgJ3NlbGVjdGlvbiBmaW5kJyBpcyBPTiB3ZSBzaG91bGQgbm90IGRpc2FibGUgdGhlIGJ1dHRvbiAoaXRzIGZ1bmN0aW9uIGlzIHRvIGNhbmNlbCAnc2VsZWN0aW9uIGZpbmQnKS5cblx0ICogSWYgJ3NlbGVjdGlvbiBmaW5kJyBpcyBPRkYgd2UgZW5hYmxlIHRoZSBidXR0b24gb25seSBpZiB0aGVyZSBpcyBhIHNlbGVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVRvZ2dsZVNlbGVjdGlvbkZpbmRCdXR0b24oKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fY29kZUVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBpc1NlbGVjdGlvbiA9IHNlbGVjdGlvbiA/IChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICE9PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlciB8fCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4gIT09IHNlbGVjdGlvbi5lbmRDb2x1bW4pIDogZmFsc2U7XG5cdFx0Y29uc3QgaXNDaGVja2VkID0gdGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkO1xuXG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSAmJiAoaXNDaGVja2VkIHx8IGlzU2VsZWN0aW9uKSkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5kaXNhYmxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQnV0dG9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kSW5wdXQuc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUpO1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZXRFbmFibGVkKHRoaXMuX2lzVmlzaWJsZSAmJiB0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblx0XHR0aGlzLl91cGRhdGVUb2dnbGVTZWxlY3Rpb25GaW5kQnV0dG9uKCk7XG5cdFx0dGhpcy5fY2xvc2VCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUpO1xuXG5cdFx0Y29uc3QgZmluZElucHV0SXNOb25FbXB0eSA9ICh0aGlzLl9zdGF0ZS5zZWFyY2hTdHJpbmcubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgbWF0Y2hlc0NvdW50ID0gdGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50ID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdHRoaXMuX3ByZXZCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgZmluZElucHV0SXNOb25FbXB0eSAmJiBtYXRjaGVzQ291bnQgJiYgdGhpcy5fc3RhdGUuY2FuTmF2aWdhdGVCYWNrKCkpO1xuXHRcdHRoaXMuX25leHRCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgZmluZElucHV0SXNOb25FbXB0eSAmJiBtYXRjaGVzQ291bnQgJiYgdGhpcy5fc3RhdGUuY2FuTmF2aWdhdGVGb3J3YXJkKCkpO1xuXHRcdHRoaXMuX3JlcGxhY2VCdG4uc2V0RW5hYmxlZCh0aGlzLl9pc1Zpc2libGUgJiYgdGhpcy5faXNSZXBsYWNlVmlzaWJsZSAmJiBmaW5kSW5wdXRJc05vbkVtcHR5KTtcblx0XHR0aGlzLl9yZXBsYWNlQWxsQnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2lzUmVwbGFjZVZpc2libGUgJiYgZmluZElucHV0SXNOb25FbXB0eSk7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JlcGxhY2VUb2dnbGVkJywgdGhpcy5faXNSZXBsYWNlVmlzaWJsZSk7XG5cdFx0dGhpcy5fdG9nZ2xlUmVwbGFjZUJ0bi5zZXRFeHBhbmRlZCh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKTtcblxuXHRcdGNvbnN0IGNhblJlcGxhY2UgPSAhdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnJlYWRPbmx5KTtcblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnRuLnNldEVuYWJsZWQodGhpcy5faXNWaXNpYmxlICYmIGNhblJlcGxhY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsVGltZW91dHM6IFRpbWVvdXRbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3JldmVhbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KGUpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmV2ZWFsVGltZW91dHMgPSBbXTtcblxuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9jb2RlRWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0XHRzd2l0Y2ggKHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5hdXRvRmluZEluU2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNhc2UgJ2Fsd2F5cyc6XG5cdFx0XHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnbmV2ZXInOlxuXHRcdFx0XHRcdHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQuY2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtdWx0aWxpbmUnOiB7XG5cdFx0XHRcdFx0Y29uc3QgaXNTZWxlY3Rpb25NdWx0aXBsZUxpbmUgPSAhIXNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICE9PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHR0aGlzLl90b2dnbGVTZWxlY3Rpb25GaW5kLmNoZWNrZWQgPSBpc1NlbGVjdGlvbk11bHRpcGxlTGluZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl90cnlVcGRhdGVXaWRnZXRXaWR0aCgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9ucygpO1xuXG5cdFx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cy5wdXNoKHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUZpbmRJbnB1dEFyaWFMYWJlbCgpO1xuXHRcdFx0fSwgMCkpO1xuXG5cdFx0XHQvLyB2YWxpZGF0ZSBxdWVyeSBhZ2FpbiBhcyBpdCdzIGJlaW5nIGRpc21pc3NlZCB3aGVuIHdlIGhpZGUgdGhlIGZpbmQgd2lkZ2V0LlxuXHRcdFx0dGhpcy5fcmV2ZWFsVGltZW91dHMucHVzaChzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZmluZElucHV0LnZhbGlkYXRlKCk7XG5cdFx0XHR9LCAyMDApKTtcblxuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXG5cdFx0XHRsZXQgYWRqdXN0RWRpdG9yU2Nyb2xsVG9wID0gdHJ1ZTtcblx0XHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gJiYgc2VsZWN0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGRvbU5vZGUgPSB0aGlzLl9jb2RlRWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRcdFx0aWYgKGRvbU5vZGUpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JDb29yZHMgPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihkb21Ob2RlKTtcblx0XHRcdFx0XHRjb25zdCBzdGFydENvb3JkcyA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsZWRWaXNpYmxlUG9zaXRpb24oc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRMZWZ0ID0gZWRpdG9yQ29vcmRzLmxlZnQgKyAoc3RhcnRDb29yZHMgPyBzdGFydENvb3Jkcy5sZWZ0IDogMCk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRUb3AgPSBzdGFydENvb3JkcyA/IHN0YXJ0Q29vcmRzLnRvcCA6IDA7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5fdmlld1pvbmUgJiYgc3RhcnRUb3AgPCB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJblB4KSB7XG5cdFx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdGFkanVzdEVkaXRvclNjcm9sbFRvcCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBsZWZ0T2ZGaW5kV2lkZ2V0ID0gZG9tLmdldFRvcExlZnRPZmZzZXQodGhpcy5fZG9tTm9kZSkubGVmdDtcblx0XHRcdFx0XHRcdGlmIChzdGFydExlZnQgPiBsZWZ0T2ZGaW5kV2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdGFkanVzdEVkaXRvclNjcm9sbFRvcCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZW5kQ29vcmRzID0gdGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbihzZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmRMZWZ0ID0gZWRpdG9yQ29vcmRzLmxlZnQgKyAoZW5kQ29vcmRzID8gZW5kQ29vcmRzLmxlZnQgOiAwKTtcblx0XHRcdFx0XHRcdGlmIChlbmRMZWZ0ID4gbGVmdE9mRmluZFdpZGdldCkge1xuXHRcdFx0XHRcdFx0XHRhZGp1c3RFZGl0b3JTY3JvbGxUb3AgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nob3dWaWV3Wm9uZShhZGp1c3RFZGl0b3JTY3JvbGxUb3ApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hpZGUoZm9jdXNUaGVFZGl0b3I6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxUaW1lb3V0cy5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KGUpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmV2ZWFsVGltZW91dHMgPSBbXTtcblxuXHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkID0gZmFsc2U7XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUJ1dHRvbnMoKTtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5fZmluZElucHV0LmNsZWFyTWVzc2FnZSgpO1xuXHRcdFx0aWYgKGZvY3VzVGhlRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3IuZm9jdXMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvZGVFZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRcdHRoaXMuX3JlbW92ZVZpZXdab25lKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Vmlld1pvbmUodGFyZ2V0U2Nyb2xsVG9wPzogbnVtYmVyKSB7XG5cdFx0Y29uc3QgYWRkRXh0cmFTcGFjZU9uVG9wID0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmFkZEV4dHJhU3BhY2VPblRvcDtcblxuXHRcdGlmICghYWRkRXh0cmFTcGFjZU9uVG9wKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVWaWV3Wm9uZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdab25lID0gdGhpcy5fdmlld1pvbmU7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lSWQgIT09IHVuZGVmaW5lZCB8fCAhdmlld1pvbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yLmNoYW5nZVZpZXdab25lcygoYWNjZXNzb3IpID0+IHtcblx0XHRcdHZpZXdab25lLmhlaWdodEluUHggPSB0aGlzLl9nZXRIZWlnaHQoKTtcblx0XHRcdHRoaXMuX3ZpZXdab25lSWQgPSBhY2Nlc3Nvci5hZGRab25lKHZpZXdab25lKTtcblx0XHRcdC8vIHNjcm9sbCB0b3AgYWRqdXN0IHRvIG1ha2Ugc3VyZSB0aGUgZWRpdG9yIGRvZXNuJ3Qgc2Nyb2xsIHdoZW4gYWRkaW5nIHZpZXd6b25lIGF0IHRoZSBiZWdpbm5pbmcuXG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnNldFNjcm9sbFRvcCh0YXJnZXRTY3JvbGxUb3AgfHwgdGhpcy5fY29kZUVkaXRvci5nZXRTY3JvbGxUb3AoKSArIHZpZXdab25lLmhlaWdodEluUHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1ZpZXdab25lKGFkanVzdFNjcm9sbDogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZEV4dHJhU3BhY2VPblRvcCA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5hZGRFeHRyYVNwYWNlT25Ub3A7XG5cblx0XHRpZiAoIWFkZEV4dHJhU3BhY2VPblRvcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl92aWV3Wm9uZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl92aWV3Wm9uZSA9IG5ldyBGaW5kV2lkZ2V0Vmlld1pvbmUoMCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld1pvbmUgPSB0aGlzLl92aWV3Wm9uZTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3IuY2hhbmdlVmlld1pvbmVzKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyB0aGUgdmlldyB6b25lIGFscmVhZHkgZXhpc3RzLCB3ZSBuZWVkIHRvIHVwZGF0ZSB0aGUgaGVpZ2h0XG5cdFx0XHRcdGNvbnN0IG5ld0hlaWdodCA9IHRoaXMuX2dldEhlaWdodCgpO1xuXHRcdFx0XHRpZiAobmV3SGVpZ2h0ID09PSB2aWV3Wm9uZS5oZWlnaHRJblB4KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2Nyb2xsQWRqdXN0bWVudCA9IG5ld0hlaWdodCAtIHZpZXdab25lLmhlaWdodEluUHg7XG5cdFx0XHRcdHZpZXdab25lLmhlaWdodEluUHggPSBuZXdIZWlnaHQ7XG5cdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUodGhpcy5fdmlld1pvbmVJZCk7XG5cblx0XHRcdFx0aWYgKGFkanVzdFNjcm9sbCkge1xuXHRcdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsVG9wKCkgKyBzY3JvbGxBZGp1c3RtZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBzY3JvbGxBZGp1c3RtZW50ID0gdGhpcy5fZ2V0SGVpZ2h0KCk7XG5cblx0XHRcdFx0Ly8gaWYgdGhlIGVkaXRvciBoYXMgdG9wIHBhZGRpbmcsIGZhY3RvciB0aGF0IGludG8gdGhlIHpvbmUgaGVpZ2h0XG5cdFx0XHRcdHNjcm9sbEFkanVzdG1lbnQgLT0gdGhpcy5fY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnBhZGRpbmcpLnRvcDtcblx0XHRcdFx0aWYgKHNjcm9sbEFkanVzdG1lbnQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZpZXdab25lLmhlaWdodEluUHggPSBzY3JvbGxBZGp1c3RtZW50O1xuXHRcdFx0XHR0aGlzLl92aWV3Wm9uZUlkID0gYWNjZXNzb3IuYWRkWm9uZSh2aWV3Wm9uZSk7XG5cblx0XHRcdFx0aWYgKGFkanVzdFNjcm9sbCkge1xuXHRcdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsVG9wKCkgKyBzY3JvbGxBZGp1c3RtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlVmlld1pvbmUoKSB7XG5cdFx0dGhpcy5fY29kZUVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdmlld1pvbmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy5fdmlld1pvbmVJZCk7XG5cdFx0XHRcdHRoaXMuX3ZpZXdab25lSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsVG9wKCkgLSB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJblB4KTtcblx0XHRcdFx0XHR0aGlzLl92aWV3Wm9uZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5VXBkYXRlV2lkZ2V0V2lkdGgoKSB7XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHQvLyB0aGUgd2lkZ2V0IGlzIG5vdCBpbiB0aGUgRE9NXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRlbnRXaWR0aCA9IGxheW91dEluZm8uY29udGVudFdpZHRoO1xuXG5cdFx0aWYgKGVkaXRvckNvbnRlbnRXaWR0aCA8PSAwKSB7XG5cdFx0XHQvLyBmb3IgZXhhbXBsZSwgZGlmZiB2aWV3IG9yaWdpbmFsIGVkaXRvclxuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdoaWRkZW5FZGl0b3InKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW5FZGl0b3InKSkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW5FZGl0b3InKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IGxheW91dEluZm8ud2lkdGg7XG5cdFx0Y29uc3QgbWluaW1hcFdpZHRoID0gbGF5b3V0SW5mby5taW5pbWFwLm1pbmltYXBXaWR0aDtcblx0XHRsZXQgY29sbGFwc2VkRmluZFdpZGdldCA9IGZhbHNlO1xuXHRcdGxldCByZWR1Y2VkRmluZFdpZGdldCA9IGZhbHNlO1xuXHRcdGxldCBuYXJyb3dGaW5kV2lkZ2V0ID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy5fcmVzaXplZCkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0V2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9kb21Ob2RlKTtcblxuXHRcdFx0aWYgKHdpZGdldFdpZHRoID4gRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHQvLyBhcyB0aGUgd2lkZ2V0IGlzIHJlc2l6ZWQgYnkgdXNlcnMsIHdlIG1heSBuZWVkIHRvIGNoYW5nZSB0aGUgbWF4IHdpZHRoIG9mIHRoZSB3aWRnZXQgYXMgdGhlIGVkaXRvciB3aWR0aCBjaGFuZ2VzLlxuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLm1heFdpZHRoID0gYCR7ZWRpdG9yV2lkdGggLSAyOCAtIG1pbmltYXBXaWR0aCAtIDE1fXB4YDtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKEZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEggKyAyOCArIG1pbmltYXBXaWR0aCA+PSBlZGl0b3JXaWR0aCkge1xuXHRcdFx0cmVkdWNlZEZpbmRXaWRnZXQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoRklORF9XSURHRVRfSU5JVElBTF9XSURUSCArIDI4ICsgbWluaW1hcFdpZHRoIC0gTUFYX01BVENIRVNfQ09VTlRfV0lEVEggPj0gZWRpdG9yV2lkdGgpIHtcblx0XHRcdG5hcnJvd0ZpbmRXaWRnZXQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoRklORF9XSURHRVRfSU5JVElBTF9XSURUSCArIDI4ICsgbWluaW1hcFdpZHRoIC0gTUFYX01BVENIRVNfQ09VTlRfV0lEVEggPj0gZWRpdG9yV2lkdGggKyA1MCkge1xuXHRcdFx0Y29sbGFwc2VkRmluZFdpZGdldCA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkLWZpbmQtd2lkZ2V0JywgY29sbGFwc2VkRmluZFdpZGdldCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCduYXJyb3ctZmluZC13aWRnZXQnLCBuYXJyb3dGaW5kV2lkZ2V0KTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JlZHVjZWQtZmluZC13aWRnZXQnLCByZWR1Y2VkRmluZFdpZGdldCk7XG5cblx0XHRpZiAoIW5hcnJvd0ZpbmRXaWRnZXQgJiYgIWNvbGxhcHNlZEZpbmRXaWRnZXQpIHtcblx0XHRcdC8vIHRoZSBtaW5pbWFsIGxlZnQgb2Zmc2V0IG9mIGZpbmR3aWRnZXQgaXMgMTVweC5cblx0XHRcdHRoaXMuX2RvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHtlZGl0b3JXaWR0aCAtIDI4IC0gbWluaW1hcFdpZHRoIC0gMTV9cHhgO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZpbmRJbnB1dC5sYXlvdXQoeyBjb2xsYXBzZWRGaW5kV2lkZ2V0LCBuYXJyb3dGaW5kV2lkZ2V0LCByZWR1Y2VkRmluZFdpZGdldCB9KTtcblx0XHRpZiAodGhpcy5fcmVzaXplZCkge1xuXHRcdFx0Y29uc3QgZmluZElucHV0V2lkdGggPSB0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guZWxlbWVudC5jbGllbnRXaWR0aDtcblx0XHRcdGlmIChmaW5kSW5wdXRXaWR0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZmluZElucHV0V2lkdGg7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0bGV0IHRvdGFsaGVpZ2h0ID0gMDtcblxuXHRcdC8vIGZpbmQgaW5wdXQgbWFyZ2luIHRvcFxuXHRcdHRvdGFsaGVpZ2h0ICs9IDQ7XG5cblx0XHQvLyBmaW5kIGlucHV0IGhlaWdodFxuXHRcdHRvdGFsaGVpZ2h0ICs9IHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5oZWlnaHQgKyAyIC8qKiBpbnB1dCBib3ggYm9yZGVyICovO1xuXG5cdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdC8vIHJlcGxhY2UgaW5wdXQgbWFyZ2luXG5cdFx0XHR0b3RhbGhlaWdodCArPSA0O1xuXG5cdFx0XHR0b3RhbGhlaWdodCArPSB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guaGVpZ2h0ICsgMiAvKiogaW5wdXQgYm94IGJvcmRlciAqLztcblx0XHR9XG5cblx0XHQvLyBtYXJnaW4gYm90dG9tXG5cdFx0dG90YWxoZWlnaHQgKz0gNDtcblx0XHRyZXR1cm4gdG90YWxoZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF90cnlVcGRhdGVIZWlnaHQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdG90YWxIZWlnaHQgPSB0aGlzLl9nZXRIZWlnaHQoKTtcblx0XHRpZiAodGhpcy5fY2FjaGVkSGVpZ2h0ICE9PSBudWxsICYmIHRoaXMuX2NhY2hlZEhlaWdodCA9PT0gdG90YWxIZWlnaHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9jYWNoZWRIZWlnaHQgPSB0b3RhbEhlaWdodDtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke3RvdGFsSGVpZ2h0fXB4YDtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tLS0gUHVibGljXG5cblx0cHVibGljIGZvY3VzRmluZElucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5zZWxlY3QoKTtcblx0XHQvLyBFZGdlIGJyb3dzZXIgcmVxdWlyZXMgZm9jdXMoKSBpbiBhZGRpdGlvbiB0byBzZWxlY3QoKVxuXHRcdHRoaXMuX2ZpbmRJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzUmVwbGFjZUlucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZWxlY3QoKTtcblx0XHQvLyBFZGdlIGJyb3dzZXIgcmVxdWlyZXMgZm9jdXMoKSBpbiBhZGRpdGlvbiB0byBzZWxlY3QoKVxuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGhpZ2hsaWdodEZpbmRPcHRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2VhcmNoU2NvcGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5jaGVja2VkKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fY29kZUVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cblx0XHRcdHNlbGVjdGlvbnMubWFwKHNlbGVjdGlvbiA9PiB7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxICYmIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID4gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdHNlbGVjdGlvbiA9IHNlbGVjdGlvbi5zZXRFbmRQb3NpdGlvbihcblx0XHRcdFx0XHRcdHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyIC0gMSxcblx0XHRcdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZU1heENvbHVtbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIDEpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJyZW50TWF0Y2ggPSB0aGlzLl9zdGF0ZS5jdXJyZW50TWF0Y2g7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyICE9PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGlmICghUmFuZ2UuZXF1YWxzUmFuZ2Uoc2VsZWN0aW9uLCBjdXJyZW50TWF0Y2gpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0pLmZpbHRlcihlbGVtZW50ID0+ICEhZWxlbWVudCk7XG5cblx0XHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTY29wZTogc2VsZWN0aW9ucyBhcyBSYW5nZVtdIH0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRmluZElucHV0TW91c2VEb3duKGU6IElNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Ly8gb24gbGludXgsIG1pZGRsZSBrZXkgZG9lcyBwYXN0aW5nLlxuXHRcdGlmIChlLm1pZGRsZUJ1dHRvbikge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkZpbmRJbnB1dEtleURvd24oZTogSUtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5lcXVhbHMoY3RybEtleU1vZCB8IEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRpZiAodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuZGlzcGF0Y2hFdmVudChlLCBlLnRhcmdldCkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3guaW5zZXJ0QXRDdXJzb3IoJ1xcbicpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5mb2N1c09uQ2FzZVNlbnNpdGl2ZSgpO1xuXHRcdFx0fVxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVxdWFscyhLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93KSkge1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHJldHVybiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVVcHdhcmRzKGUsIHRoaXMuX2ZpbmRJbnB1dC5nZXRWYWx1ZSgpLCB0aGlzLl9maW5kSW5wdXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCd0ZXh0YXJlYScpKTtcblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHJldHVybiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVEb3dud2FyZHMoZSwgdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCksIHRoaXMuX2ZpbmRJbnB1dC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJ3RleHRhcmVhJykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uUmVwbGFjZUlucHV0S2V5RG93bihlOiBJS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVxdWFscyhjdHJsS2V5TW9kIHwgS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdGlmICh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5kaXNwYXRjaEV2ZW50KGUsIGUudGFyZ2V0KSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5pbnNlcnRBdEN1cnNvcignXFxuJyk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LmZvY3VzT25DYXNlU2Vuc2l0aXZlKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0cmV0dXJuIHN0b3BQcm9wYWdhdGlvbkZvck11bHRpTGluZVVwd2FyZHMoZSwgdGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LnZhbHVlLCB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guZWxlbWVudC5xdWVyeVNlbGVjdG9yKCd0ZXh0YXJlYScpKTtcblx0XHR9XG5cblx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHJldHVybiBzdG9wUHJvcGFnYXRpb25Gb3JNdWx0aUxpbmVEb3dud2FyZHMoZSwgdGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LnZhbHVlLCB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3guZWxlbWVudC5xdWVyeVNlbGVjdG9yKCd0ZXh0YXJlYScpKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tLSBzYXNoXG5cdHB1YmxpYyBnZXRWZXJ0aWNhbFNhc2hMZWZ0KF9zYXNoOiBTYXNoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHQvLyAtLS0tLSBpbml0aWFsaXphdGlvblxuXG5cdHByaXZhdGUgX2tleWJpbmRpbmdMYWJlbEZvcihhY3Rpb25JZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZygnJywgYWN0aW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGREb21Ob2RlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZsZXhpYmxlSGVpZ2h0ID0gdHJ1ZTtcblx0XHRjb25zdCBmbGV4aWJsZVdpZHRoID0gdHJ1ZTtcblx0XHQvLyBGaW5kIGlucHV0XG5cdFx0Y29uc3QgZmluZFNlYXJjaEhpc3RvcnlDb25maWcgPSB0aGlzLl9jb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuaGlzdG9yeTtcblx0XHRjb25zdCByZXBsYWNlSGlzdG9yeUNvbmZpZyA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5yZXBsYWNlSGlzdG9yeTtcblx0XHR0aGlzLl9maW5kSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udGV4dFNjb3BlZEZpbmRJbnB1dChudWxsLCB0aGlzLl9jb250ZXh0Vmlld1Byb3ZpZGVyLCB7XG5cdFx0XHR3aWR0aDogRklORF9JTlBVVF9BUkVBX1dJRFRILFxuXHRcdFx0bGFiZWw6IE5MU19GSU5EX0lOUFVUX0xBQkVMLFxuXHRcdFx0cGxhY2Vob2xkZXI6IE5MU19GSU5EX0lOUFVUX1BMQUNFSE9MREVSLFxuXHRcdFx0YXBwZW5kQ2FzZVNlbnNpdGl2ZUxhYmVsOiB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuVG9nZ2xlQ2FzZVNlbnNpdGl2ZUNvbW1hbmQpLFxuXHRcdFx0YXBwZW5kV2hvbGVXb3Jkc0xhYmVsOiB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZCksXG5cdFx0XHRhcHBlbmRSZWdleExhYmVsOiB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuVG9nZ2xlUmVnZXhDb21tYW5kKSxcblx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZTogc3RyaW5nKTogSW5wdXRCb3hNZXNzYWdlIHwgbnVsbCA9PiB7XG5cdFx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDAgfHwgIXRoaXMuX2ZpbmRJbnB1dC5nZXRSZWdleCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyB1c2UgYGdgIGFuZCBgdWAgd2hpY2ggYXJlIGFsc28gdXNlZCBieSB0aGUgVGV4dE1vZGVsIHNlYXJjaFxuXHRcdFx0XHRcdG5ldyBSZWdFeHAodmFsdWUsICdndScpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogZS5tZXNzYWdlIH07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmbGV4aWJsZUhlaWdodCxcblx0XHRcdGZsZXhpYmxlV2lkdGgsXG5cdFx0XHRmbGV4aWJsZU1heEhlaWdodDogMTE4LFxuXHRcdFx0c2hvd0NvbW1vbkZpbmRUb2dnbGVzOiB0cnVlLFxuXHRcdFx0c2hvd0hpc3RvcnlIaW50OiAoKSA9PiBzaG93SGlzdG9yeUtleWJpbmRpbmdIaW50KHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0XHR0b2dnbGVTdHlsZXM6IGRlZmF1bHRUb2dnbGVTdHlsZXMsXG5cdFx0XHRoaXN0b3J5OiBmaW5kU2VhcmNoSGlzdG9yeUNvbmZpZyA9PT0gJ3dvcmtzcGFjZScgPyB0aGlzLl9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSA6IG5ldyBTZXQoW10pLFxuXHRcdH0sIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldFJlZ2V4KCEhdGhpcy5fc3RhdGUuaXNSZWdleCk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldENhc2VTZW5zaXRpdmUoISF0aGlzLl9zdGF0ZS5tYXRjaENhc2UpO1xuXHRcdHRoaXMuX2ZpbmRJbnB1dC5zZXRXaG9sZVdvcmRzKCEhdGhpcy5fc3RhdGUud2hvbGVXb3JkKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25LZXlEb3duKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5FbnRlcikgJiYgIXRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5maW5kT25UeXBlKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCkgfSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkZpbmRJbnB1dEtleURvd24oZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgfHwgIXRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5maW5kT25UeXBlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogdGhpcy5fZmluZElucHV0LmdldFZhbHVlKCkgfSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5vbkRpZE9wdGlvbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2Uoe1xuXHRcdFx0XHRpc1JlZ2V4OiB0aGlzLl9maW5kSW5wdXQuZ2V0UmVnZXgoKSxcblx0XHRcdFx0d2hvbGVXb3JkOiB0aGlzLl9maW5kSW5wdXQuZ2V0V2hvbGVXb3JkcygpLFxuXHRcdFx0XHRtYXRjaENhc2U6IHRoaXMuX2ZpbmRJbnB1dC5nZXRDYXNlU2Vuc2l0aXZlKClcblx0XHRcdH0sIHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25DYXNlU2Vuc2l0aXZlS2V5RG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNSZXBsYWNlVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25SZWdleEtleURvd24oKGUpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlRhYikpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuZm9jdXNPblByZXNlcnZlKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5vbkRpZEhlaWdodENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RyeVVwZGF0ZUhlaWdodCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dWaWV3Wm9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAocGxhdGZvcm0uaXNMaW51eCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmluZElucHV0Lm9uTW91c2VEb3duKChlKSA9PiB0aGlzLl9vbkZpbmRJbnB1dE1vdXNlRG93bihlKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX21hdGNoZXNDb3VudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX21hdGNoZXNDb3VudC5jbGFzc05hbWUgPSAnbWF0Y2hlc0NvdW50Jztcblx0XHR0aGlzLl91cGRhdGVNYXRjaGVzQ291bnQoKTtcblxuXHRcdGNvbnN0IGhvdmVyTGlmZWN5Y2xlT3B0aW9uczogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyA9IHsgZ3JvdXBJZDogJ2ZpbmQtd2lkZ2V0JyB9O1xuXG5cdFx0Ly8gUHJldmlvdXMgYnV0dG9uXG5cdFx0dGhpcy5fcHJldkJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19QUkVWSU9VU19NQVRDSF9CVE5fTEFCRUwgKyB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuUHJldmlvdXNNYXRjaEZpbmRBY3Rpb24pLFxuXHRcdFx0aWNvbjogZmluZFByZXZpb3VzTWF0Y2hJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX2NvZGVFZGl0b3IuZ2V0QWN0aW9uKEZJTkRfSURTLlByZXZpb3VzTWF0Y2hGaW5kQWN0aW9uKSkucnVuKCkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblxuXHRcdC8vIE5leHQgYnV0dG9uXG5cdFx0dGhpcy5fbmV4dEJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19ORVhUX01BVENIX0JUTl9MQUJFTCArIHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5OZXh0TWF0Y2hGaW5kQWN0aW9uKSxcblx0XHRcdGljb246IGZpbmROZXh0TWF0Y2hJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX2NvZGVFZGl0b3IuZ2V0QWN0aW9uKEZJTkRfSURTLk5leHRNYXRjaEZpbmRBY3Rpb24pKS5ydW4oKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZmluZFBhcnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRmaW5kUGFydC5jbGFzc05hbWUgPSAnZmluZC1wYXJ0Jztcblx0XHRmaW5kUGFydC5hcHBlbmRDaGlsZCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGFjdGlvbnNDb250YWluZXIuY2xhc3NOYW1lID0gJ2ZpbmQtYWN0aW9ucyc7XG5cdFx0ZmluZFBhcnQuYXBwZW5kQ2hpbGQoYWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0YWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9tYXRjaGVzQ291bnQpO1xuXHRcdGFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fcHJldkJ0bi5kb21Ob2RlKTtcblx0XHRhY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX25leHRCdG4uZG9tTm9kZSk7XG5cblx0XHQvLyBUb2dnbGUgc2VsZWN0aW9uIGJ1dHRvblxuXHRcdHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9nZ2xlKHtcblx0XHRcdGljb246IGZpbmRTZWxlY3Rpb25JY29uLFxuXHRcdFx0dGl0bGU6IE5MU19UT0dHTEVfU0VMRUNUSU9OX0ZJTkRfVElUTEUgKyB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuVG9nZ2xlU2VhcmNoU2NvcGVDb21tYW5kKSxcblx0XHRcdGlzQ2hlY2tlZDogZmFsc2UsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoaW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kKSxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiBhc0Nzc1ZhcmlhYmxlKGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyKSxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogYXNDc3NWYXJpYWJsZShpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQpLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQuY2hlY2tlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29kZUVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0bGV0IHNlbGVjdGlvbnMgPSB0aGlzLl9jb2RlRWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdFx0XHRzZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0XHRcdGlmIChzZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxICYmIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID4gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb24gPSBzZWxlY3Rpb24uc2V0RW5kUG9zaXRpb24oc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSAxLCB0aGlzLl9jb2RlRWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVNYXhDb2x1bW4oc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSAxKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH0pLmZpbHRlcigoZWxlbWVudCk6IGVsZW1lbnQgaXMgU2VsZWN0aW9uID0+ICEhZWxlbWVudCk7XG5cblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFNjb3BlOiBzZWxlY3Rpb25zIGFzIFJhbmdlW10gfSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTY29wZTogbnVsbCB9LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3RvZ2dsZVNlbGVjdGlvbkZpbmQuZG9tTm9kZSk7XG5cblx0XHQvLyBDbG9zZSBidXR0b25cblx0XHR0aGlzLl9jbG9zZUJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTaW1wbGVCdXR0b24oe1xuXHRcdFx0bGFiZWw6IE5MU19DTE9TRV9CVE5fTEFCRUwgKyB0aGlzLl9rZXliaW5kaW5nTGFiZWxGb3IoRklORF9JRFMuQ2xvc2VGaW5kV2lkZ2V0Q29tbWFuZCksXG5cdFx0XHRpY29uOiB3aWRnZXRDbG9zZSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiBmYWxzZSwgc2VhcmNoU2NvcGU6IG51bGwgfSwgZmFsc2UpO1xuXHRcdFx0fSxcblx0XHRcdG9uS2V5RG93bjogKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcmVwbGFjZUJ0bi5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlQnRuLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cblx0XHQvLyBSZXBsYWNlIGlucHV0XG5cdFx0dGhpcy5fcmVwbGFjZUlucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbnRleHRTY29wZWRSZXBsYWNlSW5wdXQobnVsbCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfSU5QVVRfTEFCRUwsXG5cdFx0XHRwbGFjZWhvbGRlcjogTkxTX1JFUExBQ0VfSU5QVVRfUExBQ0VIT0xERVIsXG5cdFx0XHRhcHBlbmRQcmVzZXJ2ZUNhc2VMYWJlbDogdGhpcy5fa2V5YmluZGluZ0xhYmVsRm9yKEZJTkRfSURTLlRvZ2dsZVByZXNlcnZlQ2FzZUNvbW1hbmQpLFxuXHRcdFx0aGlzdG9yeTogcmVwbGFjZUhpc3RvcnlDb25maWcgPT09ICd3b3Jrc3BhY2UnID8gdGhpcy5fcmVwbGFjZVdpZGdldEhpc3RvcnkgOiBuZXcgU2V0KFtdKSxcblx0XHRcdGZsZXhpYmxlSGVpZ2h0LFxuXHRcdFx0ZmxleGlibGVXaWR0aCxcblx0XHRcdGZsZXhpYmxlTWF4SGVpZ2h0OiAxMTgsXG5cdFx0XHRzaG93SGlzdG9yeUhpbnQ6ICgpID0+IHNob3dIaXN0b3J5S2V5YmluZGluZ0hpbnQodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHR9LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdHJ1ZSkpO1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5zZXRQcmVzZXJ2ZUNhc2UoISF0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5vbktleURvd24oKGUpID0+IHRoaXMuX29uUmVwbGFjZUlucHV0S2V5RG93bihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyByZXBsYWNlU3RyaW5nOiB0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gudmFsdWUgfSwgZmFsc2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXBsYWNlSW5wdXQuaW5wdXRCb3gub25EaWRIZWlnaHRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc1JlcGxhY2VWaXNpYmxlICYmIHRoaXMuX3RyeVVwZGF0ZUhlaWdodCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dWaWV3Wm9uZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXBsYWNlSW5wdXQub25EaWRPcHRpb25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHtcblx0XHRcdFx0cHJlc2VydmVDYXNlOiB0aGlzLl9yZXBsYWNlSW5wdXQuZ2V0UHJlc2VydmVDYXNlKClcblx0XHRcdH0sIHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXBsYWNlSW5wdXQub25QcmVzZXJ2ZUNhc2VLZXlEb3duKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmV2QnRuLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJldkJ0bi5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX25leHRCdG4uaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9uZXh0QnRuLmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5lbmFibGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdG9nZ2xlU2VsZWN0aW9uRmluZC5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2Nsb3NlQnRuLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xvc2VCdG4uZm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXBsYWNlIG9uZSBidXR0b25cblx0XHR0aGlzLl9yZXBsYWNlQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfQlROX0xBQkVMICsgdGhpcy5fa2V5YmluZGluZ0xhYmVsRm9yKEZJTkRfSURTLlJlcGxhY2VPbmVBY3Rpb24pLFxuXHRcdFx0aWNvbjogZmluZFJlcGxhY2VJY29uLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0b25UcmlnZ2VyOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xsZXIucmVwbGFjZSgpO1xuXHRcdFx0fSxcblx0XHRcdG9uS2V5RG93bjogKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Nsb3NlQnRuLmZvY3VzKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5faG92ZXJTZXJ2aWNlKSk7XG5cblx0XHQvLyBSZXBsYWNlIGFsbCBidXR0b25cblx0XHR0aGlzLl9yZXBsYWNlQWxsQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1JFUExBQ0VfQUxMX0JUTl9MQUJFTCArIHRoaXMuX2tleWJpbmRpbmdMYWJlbEZvcihGSU5EX0lEUy5SZXBsYWNlQWxsQWN0aW9uKSxcblx0XHRcdGljb246IGZpbmRSZXBsYWNlQWxsSWNvbixcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLnJlcGxhY2VBbGwoKTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHJlcGxhY2VQYXJ0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0cmVwbGFjZVBhcnQuY2xhc3NOYW1lID0gJ3JlcGxhY2UtcGFydCc7XG5cdFx0cmVwbGFjZVBhcnQuYXBwZW5kQ2hpbGQodGhpcy5fcmVwbGFjZUlucHV0LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgcmVwbGFjZUFjdGlvbnNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRyZXBsYWNlQWN0aW9uc0NvbnRhaW5lci5jbGFzc05hbWUgPSAncmVwbGFjZS1hY3Rpb25zJztcblx0XHRyZXBsYWNlUGFydC5hcHBlbmRDaGlsZChyZXBsYWNlQWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHRyZXBsYWNlQWN0aW9uc0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9yZXBsYWNlQnRuLmRvbU5vZGUpO1xuXHRcdHJlcGxhY2VBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3JlcGxhY2VBbGxCdG4uZG9tTm9kZSk7XG5cblx0XHQvLyBUb2dnbGUgcmVwbGFjZSBidXR0b25cblx0XHR0aGlzLl90b2dnbGVSZXBsYWNlQnRuID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZUJ1dHRvbih7XG5cdFx0XHRsYWJlbDogTkxTX1RPR0dMRV9SRVBMQUNFX01PREVfQlROX0xBQkVMLFxuXHRcdFx0Y2xhc3NOYW1lOiAnY29kaWNvbiB0b2dnbGUgbGVmdCcsXG5cdFx0XHRvblRyaWdnZXI6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgaXNSZXBsYWNlUmV2ZWFsZWQ6ICF0aGlzLl9pc1JlcGxhY2VWaXNpYmxlIH0sIGZhbHNlKTtcblx0XHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXBsYWNlSW5wdXQud2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9maW5kSW5wdXQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LmlucHV0Qm94LmxheW91dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Nob3dWaWV3Wm9uZSgpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXHRcdHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4uc2V0RXhwYW5kZWQodGhpcy5faXNSZXBsYWNlVmlzaWJsZSk7XG5cblx0XHQvLyBXaWRnZXRcblx0XHR0aGlzLl9kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAnZWRpdG9yLXdpZGdldCBmaW5kLXdpZGdldCc7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFyaWFMYWJlbCA9IE5MU19GSU5EX0RJQUxPR19MQUJFTDtcblx0XHR0aGlzLl9kb21Ob2RlLnJvbGUgPSAnZGlhbG9nJztcblxuXHRcdC8vIFdlIG5lZWQgdG8gc2V0IHRoaXMgZXhwbGljaXRseSwgb3RoZXJ3aXNlIG9uIElFMTEsIHRoZSB3aWR0aCBpbmhlcml0ZW5jZSBvZiBmbGV4IGRvZXNuJ3Qgd29yay5cblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7RklORF9XSURHRVRfSU5JVElBTF9XSURUSH1weGA7XG5cblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3RvZ2dsZVJlcGxhY2VCdG4uZG9tTm9kZSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZChmaW5kUGFydCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9jbG9zZUJ0bi5kb21Ob2RlKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHJlcGxhY2VQYXJ0KTtcblxuXHRcdHRoaXMuX3Jlc2l6ZVNhc2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgU2FzaCh0aGlzLl9kb21Ob2RlLCB0aGlzLCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgc2l6ZTogMiB9KSk7XG5cdFx0dGhpcy5fcmVzaXplZCA9IGZhbHNlO1xuXHRcdGxldCBvcmlnaW5hbFdpZHRoID0gRklORF9XSURHRVRfSU5JVElBTF9XSURUSDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc2l6ZVNhc2gub25EaWRTdGFydCgoKSA9PiB7XG5cdFx0XHRvcmlnaW5hbFdpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZG9tTm9kZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVzaXplU2FzaC5vbkRpZENoYW5nZSgoZXZ0OiBJU2FzaEV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNpemVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHdpZHRoID0gb3JpZ2luYWxXaWR0aCArIGV2dC5zdGFydFggLSBldnQuY3VycmVudFg7XG5cblx0XHRcdGlmICh3aWR0aCA8IEZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEgpIHtcblx0XHRcdFx0Ly8gbmFycm93IGRvd24gdGhlIGZpbmQgd2lkZ2V0IHNob3VsZCBiZSBoYW5kbGVkIGJ5IENTUy5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXhXaWR0aCA9IHBhcnNlRmxvYXQoZG9tLmdldENvbXB1dGVkU3R5bGUodGhpcy5fZG9tTm9kZSkubWF4V2lkdGgpIHx8IDA7XG5cdFx0XHRpZiAod2lkdGggPiBtYXhXaWR0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0XHR0aGlzLl90cnlVcGRhdGVIZWlnaHQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXNpemVTYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0Ly8gdXNlcnMgZG91YmxlIGNsaWNrIG9uIHRoZSBzYXNoXG5cdFx0XHRjb25zdCBjdXJyZW50V2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLl9kb21Ob2RlKTtcblxuXHRcdFx0aWYgKGN1cnJlbnRXaWR0aCA8IEZJTkRfV0lER0VUX0lOSVRJQUxfV0lEVEgpIHtcblx0XHRcdFx0Ly8gVGhlIGVkaXRvciBpcyBuYXJyb3cgYW5kIHRoZSB3aWR0aCBvZiB0aGUgZmluZCB3aWRnZXQgaXMgY29udHJvbGxlZCBmdWxseSBieSBDU1MuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHdpZHRoID0gRklORF9XSURHRVRfSU5JVElBTF9XSURUSDtcblxuXHRcdFx0aWYgKCF0aGlzLl9yZXNpemVkIHx8IGN1cnJlbnRXaWR0aCA9PT0gRklORF9XSURHRVRfSU5JVElBTF9XSURUSCkge1xuXHRcdFx0XHQvLyAxLiBuZXZlciByZXNpemVkIGJlZm9yZSwgZG91YmxlIGNsaWNrIHNob3VsZCBtYXhpbWl6ZXMgaXRcblx0XHRcdFx0Ly8gMi4gdXNlcnMgcmVzaXplZCBpdCBhbHJlYWR5IGJ1dCBpdHMgd2lkdGggaXMgdGhlIHNhbWUgYXMgZGVmYXVsdFxuXHRcdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fY29kZUVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRcdHdpZHRoID0gbGF5b3V0SW5mby53aWR0aCAtIDI4IC0gbGF5b3V0SW5mby5taW5pbWFwLm1pbmltYXBXaWR0aCAtIDE1O1xuXHRcdFx0XHR0aGlzLl9yZXNpemVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBubyBvcCwgdGhlIGZpbmQgd2lkZ2V0IHNob3VsZCBiZSBzaHJpbmtlZCB0byBpdHMgZGVmYXVsdCBzaXplLlxuXHRcdFx0XHQgKi9cblx0XHRcdH1cblxuXG5cdFx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0aWYgKHRoaXMuX2lzUmVwbGFjZVZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fcmVwbGFjZUlucHV0LndpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5fZmluZElucHV0LmRvbU5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9maW5kSW5wdXQuaW5wdXRCb3gubGF5b3V0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBY2Nlc3NpYmlsaXR5U3VwcG9ydCgpOiB2b2lkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2NvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCk7XG5cdFx0dGhpcy5fZmluZElucHV0LnNldEZvY3VzSW5wdXRPbk9wdGlvbkNsaWNrKHZhbHVlICE9PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkKTtcblx0XHR0aGlzLl91cGRhdGVGaW5kSW5wdXRBcmlhTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZpbmRJbnB1dEFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRsZXQgZmluZExhYmVsID0gTkxTX0ZJTkRfSU5QVVRfTEFCRUw7XG5cdFx0bGV0IHJlcGxhY2VMYWJlbCA9IE5MU19SRVBMQUNFX0lOUFVUX0xBQkVMO1xuXHRcdGlmICghdGhpcy5fYWNjZXNzaWJpbGl0eUhlbHBIaW50QW5ub3VuY2VkICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5maW5kJykgJiYgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0Y29uc3QgYWNjZXNzaWJpbGl0eUhlbHBLZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnZWRpdG9yLmFjdGlvbi5hY2Nlc3NpYmlsaXR5SGVscCcpPy5nZXRBcmlhTGFiZWwoKTtcblx0XHRcdGlmIChhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcpIHtcblx0XHRcdFx0Y29uc3QgaGludCA9IG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eUhlbHBIaW50SW5MYWJlbCcsIFwiUHJlc3MgezB9IGZvciBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwgYWNjZXNzaWJpbGl0eUhlbHBLZXliaW5kaW5nKTtcblx0XHRcdFx0ZmluZExhYmVsID0gbmxzLmxvY2FsaXplKCdmaW5kSW5wdXRBcmlhTGFiZWxXaXRoSGludCcsIFwiezB9LCB7MX1cIiwgZmluZExhYmVsLCBoaW50KTtcblx0XHRcdFx0cmVwbGFjZUxhYmVsID0gbmxzLmxvY2FsaXplKCdyZXBsYWNlSW5wdXRBcmlhTGFiZWxXaXRoSGludCcsIFwiezB9LCB7MX1cIiwgcmVwbGFjZUxhYmVsLCBoaW50KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlIZWxwSGludEFubm91bmNlZCA9IHRydWU7XG5cdFx0XHQvLyBTY2hlZHVsZSByZXNldCB0byBwbGFpbiBsYWJlbHMgYWZ0ZXIgaW5pdGlhbCBhbm5vdW5jZW1lbnRcblx0XHRcdHRoaXMuX2xhYmVsUmVzZXRUaW1lb3V0Py5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sYWJlbFJlc2V0VGltZW91dCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbmRJbnB1dC5pbnB1dEJveC5zZXRBcmlhTGFiZWwoTkxTX0ZJTkRfSU5QVVRfTEFCRUwpO1xuXHRcdFx0XHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5zZXRBcmlhTGFiZWwoTkxTX1JFUExBQ0VfSU5QVVRfTEFCRUwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDAwKTtcblx0XHR9XG5cdFx0dGhpcy5fZmluZElucHV0LmlucHV0Qm94LnNldEFyaWFMYWJlbChmaW5kTGFiZWwpO1xuXHRcdHRoaXMuX3JlcGxhY2VJbnB1dC5pbnB1dEJveC5zZXRBcmlhTGFiZWwocmVwbGFjZUxhYmVsKTtcblx0fVxuXG5cdGdldFZpZXdTdGF0ZSgpIHtcblx0XHRsZXQgd2lkZ2V0Vmlld1pvbmVWaXNpYmxlID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lICYmIHRoaXMuX3ZpZXdab25lSWQpIHtcblx0XHRcdHdpZGdldFZpZXdab25lVmlzaWJsZSA9IHRoaXMuX3ZpZXdab25lLmhlaWdodEluUHggPiB0aGlzLl9jb2RlRWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR3aWRnZXRWaWV3Wm9uZVZpc2libGUsXG5cdFx0XHRzY3JvbGxUb3A6IHRoaXMuX2NvZGVFZGl0b3IuZ2V0U2Nyb2xsVG9wKClcblx0XHR9O1xuXHR9XG5cblx0c2V0Vmlld1N0YXRlKHN0YXRlPzogeyB3aWRnZXRWaWV3Wm9uZVZpc2libGU6IGJvb2xlYW47IHNjcm9sbFRvcDogbnVtYmVyIH0pIHtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlLndpZGdldFZpZXdab25lVmlzaWJsZSkge1xuXHRcdFx0Ly8gd2Ugc2hvdWxkIGFkZCB0aGUgdmlldyB6b25lXG5cdFx0XHR0aGlzLl9sYXlvdXRWaWV3Wm9uZShzdGF0ZS5zY3JvbGxUb3ApO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVCdXR0b25PcHRzIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgY2xhc3NOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBob3ZlckxpZmVjeWNsZU9wdGlvbnM/OiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zO1xuXHRyZWFkb25seSBvblRyaWdnZXI6ICgpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uS2V5RG93bj86IChlOiBJS2V5Ym9hcmRFdmVudCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIFNpbXBsZUJ1dHRvbiBleHRlbmRzIFdpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3B0czogSVNpbXBsZUJ1dHRvbk9wdHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdHM6IElTaW1wbGVCdXR0b25PcHRzLFxuXHRcdGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX29wdHMgPSBvcHRzO1xuXG5cdFx0bGV0IGNsYXNzTmFtZSA9ICdidXR0b24nO1xuXHRcdGlmICh0aGlzLl9vcHRzLmNsYXNzTmFtZSkge1xuXHRcdFx0Y2xhc3NOYW1lID0gY2xhc3NOYW1lICsgJyAnICsgdGhpcy5fb3B0cy5jbGFzc05hbWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcHRzLmljb24pIHtcblx0XHRcdGNsYXNzTmFtZSA9IGNsYXNzTmFtZSArICcgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZSh0aGlzLl9vcHRzLmljb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuX29wdHMubGFiZWwpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLl9kb21Ob2RlLCB7XG5cdFx0XHRjb250ZW50OiB0aGlzLl9vcHRzLmxhYmVsLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9LCBvcHRzLmhvdmVyTGlmZWN5Y2xlT3B0aW9ucykpO1xuXG5cdFx0dGhpcy5vbmNsaWNrKHRoaXMuX2RvbU5vZGUsIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vcHRzLm9uVHJpZ2dlcigpO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5vbmtleWRvd24odGhpcy5fZG9tTm9kZSwgKGUpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHR0aGlzLl9vcHRzLm9uVHJpZ2dlcigpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29wdHMub25LZXlEb3duPy4oZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuX2RvbU5vZGUudGFiSW5kZXggPj0gMCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhZW5hYmxlZCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoIWVuYWJsZWQpKTtcblx0XHR0aGlzLl9kb21Ob2RlLnRhYkluZGV4ID0gZW5hYmxlZCA/IDAgOiAtMTtcblx0fVxuXG5cdHB1YmxpYyBzZXRFeHBhbmRlZChleHBhbmRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCEhZXhwYW5kZWQpKTtcblx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShmaW5kQ29sbGFwc2VkSWNvbikpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGZpbmRFeHBhbmRlZEljb24pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGZpbmRFeHBhbmRlZEljb24pKTtcblx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShmaW5kQ29sbGFwc2VkSWNvbikpO1xuXHRcdH1cblx0fVxufVxuXG4vLyB0aGVtaW5nXG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGZpbmRNYXRjaEhpZ2hsaWdodEJvcmRlciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckZpbmRNYXRjaEhpZ2hsaWdodEJvcmRlcik7XG5cdGlmIChmaW5kTWF0Y2hIaWdobGlnaHRCb3JkZXIpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLmZpbmRNYXRjaCB7IGJvcmRlcjogMXB4ICR7aXNIaWdoQ29udHJhc3QodGhlbWUudHlwZSkgPyAnZG90dGVkJyA6ICdzb2xpZCd9ICR7ZmluZE1hdGNoSGlnaGxpZ2h0Qm9yZGVyfTsgYm94LXNpemluZzogYm9yZGVyLWJveDsgfWApO1xuXHR9XG5cblx0Y29uc3QgZmluZFJhbmdlSGlnaGxpZ2h0Qm9yZGVyID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRmluZFJhbmdlSGlnaGxpZ2h0Qm9yZGVyKTtcblx0aWYgKGZpbmRSYW5nZUhpZ2hsaWdodEJvcmRlcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuZmluZFNjb3BlIHsgYm9yZGVyOiAxcHggJHtpc0hpZ2hDb250cmFzdCh0aGVtZS50eXBlKSA/ICdkYXNoZWQnIDogJ3NvbGlkJ30gJHtmaW5kUmFuZ2VIaWdobGlnaHRCb3JkZXJ9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBoY0JvcmRlciA9IHRoZW1lLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKTtcblx0aWYgKGhjQm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5maW5kLXdpZGdldCB7IGJvcmRlcjogMXB4IHNvbGlkICR7aGNCb3JkZXJ9OyB9YCk7XG5cdH1cblx0Y29uc3QgZmluZE1hdGNoRm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvckZpbmRNYXRjaEZvcmVncm91bmQpO1xuXHRpZiAoZmluZE1hdGNoRm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuZmluZE1hdGNoSW5saW5lIHsgY29sb3I6ICR7ZmluZE1hdGNoRm9yZWdyb3VuZH07IH1gKTtcblx0fVxuXHRjb25zdCBmaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZCk7XG5cdGlmIChmaW5kTWF0Y2hIaWdobGlnaHRGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5jdXJyZW50RmluZE1hdGNoSW5saW5lIHsgY29sb3I6ICR7ZmluZE1hdGNoSGlnaGxpZ2h0Rm9yZWdyb3VuZH07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFHckIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxjQUFjO0FBS3ZCLFNBQWtELGFBQWEsWUFBWTtBQUMzRSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLHlCQUF5QjtBQUMzQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxvQkFBaUM7QUFDMUMsWUFBWSxjQUFjO0FBQzFCLFlBQVksYUFBYTtBQUN6QixPQUFPO0FBQ1AsU0FBeUUsdUNBQXVDO0FBQ2hILFNBQW9DLG9CQUFvQjtBQUN4RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyw0QkFBNEIsNkJBQTZCLCtCQUErQixVQUFVLHFCQUFxQjtBQUVoSSxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBbUQ7QUFDNUQsU0FBUyx3QkFBd0IsaUNBQWlDO0FBQ2xFLFNBQVMsaUNBQWlDO0FBRzFDLFNBQVMsZUFBZSxnQkFBZ0IsMkJB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
