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
import * as DOM from "../../../../../../base/browser/dom.js";
import { alert as alertFn } from "../../../../../../base/browser/ui/aria/aria.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import * as strings from "../../../../../../base/common/strings.js";
import { MATCHES_LIMIT, CONTEXT_FIND_WIDGET_VISIBLE } from "../../../../../../editor/contrib/find/browser/findModel.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { NLS_MATCHES_LOCATION, NLS_NO_RESULTS } from "../../../../../../editor/contrib/find/browser/findWidget.js";
import { FindWidgetSearchHistory } from "../../../../../../editor/contrib/find/browser/findWidgetSearchHistory.js";
import { ReplaceWidgetHistory } from "../../../../../../editor/contrib/find/browser/replaceWidgetHistory.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { FindModel } from "./findModel.js";
import { SimpleFindReplaceWidget } from "./notebookFindReplaceWidget.js";
import { CellEditState } from "../../notebookBrowser.js";
import { KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED } from "../../../common/notebookContextKeys.js";
const FIND_HIDE_TRANSITION = "find-hide-transition";
const FIND_SHOW_TRANSITION = "find-show-transition";
let MAX_MATCHES_COUNT_WIDTH = 69;
const PROGRESS_BAR_DELAY = 200;
let NotebookFindContrib = class extends Disposable {
  constructor(notebookEditor, instantiationService) {
    super();
    this.notebookEditor = notebookEditor;
    this.instantiationService = instantiationService;
    this._widget = new Lazy(() => this._register(this.instantiationService.createInstance(NotebookFindWidget, this.notebookEditor)));
  }
  get widget() {
    return this._widget.value;
  }
  show(initialInput, options) {
    return this._widget.value.show(initialInput, options);
  }
  hide() {
    this._widget.rawValue?.hide();
  }
  replace(searchString) {
    return this._widget.value.replace(searchString);
  }
  isVisible() {
    return this._widget.rawValue?.isVisible ?? false;
  }
  findNext() {
    if (this._widget.rawValue) {
      this._widget.value.findNext();
    }
  }
  findPrevious() {
    if (this._widget.rawValue) {
      this._widget.value.findPrevious();
    }
  }
};
NotebookFindContrib.id = "workbench.notebook.find";
NotebookFindContrib = __decorateClass([
  __decorateParam(1, IInstantiationService)
], NotebookFindContrib);
let NotebookFindWidget = class extends SimpleFindReplaceWidget {
  constructor(_notebookEditor, contextViewService, contextKeyService, configurationService, contextMenuService, hoverService, instantiationService, storageService) {
    const findSearchHistory = FindWidgetSearchHistory.getOrCreate(storageService);
    const replaceHistory = ReplaceWidgetHistory.getOrCreate(storageService);
    super(contextViewService, contextKeyService, configurationService, contextMenuService, instantiationService, hoverService, new FindReplaceState(), _notebookEditor, findSearchHistory, replaceHistory);
    this._isFocused = false;
    this._showTimeout = null;
    this._hideTimeout = null;
    this._findModel = new FindModel(this._notebookEditor, this._state, this._configurationService);
    DOM.append(this._notebookEditor.getDomNode(), this.getDomNode());
    this._findWidgetFocused = KEYBINDING_CONTEXT_NOTEBOOK_FIND_WIDGET_FOCUSED.bindTo(contextKeyService);
    this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
    this._register(this._findInput.onKeyDown((e) => this._onFindInputKeyDown(e)));
    this._register(this._replaceInput.onKeyDown((e) => this._onReplaceInputKeyDown(e)));
    this._register(this._state.onFindReplaceStateChange((e) => {
      this.onInputChanged();
      if (e.isSearching) {
        if (this._state.isSearching) {
          this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
        } else {
          this._progressBar.stop().hide();
        }
      }
      if (this._findModel.currentMatch >= 0) {
        const currentMatch = this._findModel.getCurrentMatch();
        this._replaceBtn.setEnabled(currentMatch.isModelMatch);
      }
      const matches = this._findModel.findMatches;
      this._replaceAllBtn.setEnabled(matches.length > 0 && matches.find((match) => match.webviewMatches.length > 0) === void 0);
      if (e.filters) {
        this._findInput.updateFilterState(this._state.filters?.isModified() ?? false);
      }
    }));
    this._register(DOM.addDisposableListener(this.getDomNode(), DOM.EventType.FOCUS, (e) => {
      this._previousFocusElement = DOM.isHTMLElement(e.relatedTarget) ? e.relatedTarget : void 0;
    }, true));
  }
  get findModel() {
    return this._findModel;
  }
  get isFocused() {
    return this._isFocused;
  }
  _onFindInputKeyDown(e) {
    if (e.equals(KeyCode.Enter)) {
      this.find(false);
      e.preventDefault();
      return;
    } else if (e.equals(KeyMod.Shift | KeyCode.Enter)) {
      this.find(true);
      e.preventDefault();
      return;
    }
  }
  _onReplaceInputKeyDown(e) {
    if (e.equals(KeyCode.Enter)) {
      this.replaceOne();
      e.preventDefault();
      return;
    }
  }
  onInputChanged() {
    this._state.change({ searchString: this.inputValue }, false);
    const findMatches = this._findModel.findMatches;
    if (findMatches && findMatches.length) {
      return true;
    }
    return false;
  }
  findIndex(index) {
    this._findModel.find({ index });
  }
  find(previous) {
    this._findModel.find({ previous });
  }
  findNext() {
    this.find(false);
  }
  findPrevious() {
    this.find(true);
  }
  replaceOne() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    if (!this._findModel.findMatches.length) {
      return;
    }
    this._findModel.ensureFindMatches();
    if (this._findModel.currentMatch < 0) {
      this._findModel.find({ previous: false });
    }
    const currentMatch = this._findModel.getCurrentMatch();
    const cell = currentMatch.cell;
    if (currentMatch.isModelMatch) {
      const match = currentMatch.match;
      this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
      const replacePattern = this.replacePattern;
      const replaceString = replacePattern.buildReplaceString(match.matches, this._state.preserveCase);
      const viewModel = this._notebookEditor.getViewModel();
      viewModel.replaceOne(cell, match.range, replaceString).then(() => {
        this._progressBar.stop();
      });
    } else {
      console.error("Replace does not work for output match");
    }
  }
  replaceAll() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    this._progressBar.infinite().show(PROGRESS_BAR_DELAY);
    const replacePattern = this.replacePattern;
    const cellFindMatches = this._findModel.findMatches;
    const replaceStrings = [];
    cellFindMatches.forEach((cellFindMatch) => {
      cellFindMatch.contentMatches.forEach((match) => {
        const matches = match.matches;
        replaceStrings.push(replacePattern.buildReplaceString(matches, this._state.preserveCase));
      });
    });
    const viewModel = this._notebookEditor.getViewModel();
    viewModel.replaceAll(this._findModel.findMatches, replaceStrings).then(() => {
      this._progressBar.stop();
    });
  }
  findFirst() {
  }
  onFocusTrackerFocus() {
    this._findWidgetFocused.set(true);
    this._isFocused = true;
  }
  onFocusTrackerBlur() {
    this._previousFocusElement = void 0;
    this._findWidgetFocused.reset();
    this._isFocused = false;
  }
  onReplaceInputFocusTrackerFocus() {
  }
  onReplaceInputFocusTrackerBlur() {
  }
  onFindInputFocusTrackerFocus() {
  }
  onFindInputFocusTrackerBlur() {
  }
  async show(initialInput, options) {
    const searchStringUpdate = this._state.searchString !== initialInput;
    super.show(initialInput, options);
    this._state.change({ searchString: initialInput ?? this._state.searchString, isRevealed: true }, false);
    this._findWidgetVisible.set(true);
    if (typeof options?.matchIndex === "number") {
      if (!this._findModel.findMatches.length) {
        await this._findModel.research();
      }
      this.findIndex(options.matchIndex);
    } else if (options?.focus !== false) {
      this._findInput.select();
    }
    if (!searchStringUpdate && options?.searchStringSeededFrom) {
      this._findModel.refreshCurrentMatch(options.searchStringSeededFrom);
    }
    if (this._showTimeout === null) {
      if (this._hideTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
      this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
        this._showTimeout = null;
      }, 200);
    } else {
    }
  }
  replace(initialFindInput, initialReplaceInput) {
    super.showWithReplace(initialFindInput, initialReplaceInput);
    this._state.change({ searchString: initialFindInput ?? "", replaceString: initialReplaceInput ?? "", isRevealed: true }, false);
    this._replaceInput.select();
    if (this._showTimeout === null) {
      if (this._hideTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._hideTimeout);
        this._hideTimeout = null;
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_SHOW_TRANSITION);
      this._showTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
        this._showTimeout = null;
      }, 200);
    } else {
    }
  }
  hide() {
    super.hide();
    this._state.change({ isRevealed: false }, false);
    this._findWidgetVisible.set(false);
    this._findModel.clear();
    this._notebookEditor.findStop();
    this._progressBar.stop();
    if (this._hideTimeout === null) {
      if (this._showTimeout !== null) {
        DOM.getWindow(this.getDomNode()).clearTimeout(this._showTimeout);
        this._showTimeout = null;
        this._notebookEditor.removeClassName(FIND_SHOW_TRANSITION);
      }
      this._notebookEditor.addClassName(FIND_HIDE_TRANSITION);
      this._hideTimeout = DOM.getWindow(this.getDomNode()).setTimeout(() => {
        this._notebookEditor.removeClassName(FIND_HIDE_TRANSITION);
      }, 200);
    } else {
    }
    if (this._previousFocusElement && this._previousFocusElement.offsetParent) {
      this._previousFocusElement.focus();
      this._previousFocusElement = void 0;
    }
    if (this._notebookEditor.hasModel()) {
      for (let i = 0; i < this._notebookEditor.getLength(); i++) {
        const cell = this._notebookEditor.cellAt(i);
        if (cell.getEditState() === CellEditState.Editing && cell.editStateSource === "find") {
          cell.updateEditState(CellEditState.Preview, "closeFind");
        }
      }
    }
  }
  _updateMatchesCount() {
    if (!this._findModel || !this._findModel.findMatches) {
      return;
    }
    this._matchesCount.style.minWidth = MAX_MATCHES_COUNT_WIDTH + "px";
    this._matchesCount.title = "";
    this._matchesCount.firstChild?.remove();
    let label;
    if (this._state.matchesCount > 0) {
      let matchesCount = String(this._state.matchesCount);
      if (this._state.matchesCount >= MATCHES_LIMIT) {
        matchesCount += "+";
      }
      const matchesPosition = this._findModel.currentMatch < 0 ? "?" : String(this._findModel.currentMatch + 1);
      label = strings.format(NLS_MATCHES_LOCATION, matchesPosition, matchesCount);
    } else {
      label = NLS_NO_RESULTS;
    }
    this._matchesCount.appendChild(document.createTextNode(label));
    alertFn(this._getAriaLabel(label, this._state.currentMatch, this._state.searchString));
    MAX_MATCHES_COUNT_WIDTH = Math.max(MAX_MATCHES_COUNT_WIDTH, this._matchesCount.clientWidth);
  }
  _getAriaLabel(label, currentMatch, searchString) {
    if (label === NLS_NO_RESULTS) {
      return searchString === "" ? localize("ariaSearchNoResultEmpty", "{0} found", label) : localize("ariaSearchNoResult", "{0} found for '{1}'", label, searchString);
    }
    return localize("ariaSearchNoResultWithLineNumNoCurrentMatch", "{0} found for '{1}'", label, searchString);
  }
  dispose() {
    this._notebookEditor?.removeClassName(FIND_SHOW_TRANSITION);
    this._notebookEditor?.removeClassName(FIND_HIDE_TRANSITION);
    this._findModel.dispose();
    super.dispose();
  }
};
NotebookFindWidget = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IStorageService)
], NotebookFindWidget);
export {
  NotebookFindContrib
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL25vdGVib29rRmluZFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgYWxlcnQgYXMgYWxlcnRGbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRmluZE1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNQVRDSEVTX0xJTUlULCBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IEZpbmRSZXBsYWNlU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZFN0YXRlLmpzJztcbmltcG9ydCB7IE5MU19NQVRDSEVTX0xPQ0FUSU9OLCBOTFNfTk9fUkVTVUxUUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kV2lkZ2V0LmpzJztcbmltcG9ydCB7IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5LmpzJztcbmltcG9ydCB7IFJlcGxhY2VXaWRnZXRIaXN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL3JlcGxhY2VXaWRnZXRIaXN0b3J5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZEZpbHRlcnMgfSBmcm9tICcuL2ZpbmRGaWx0ZXJzLmpzJztcbmltcG9ydCB7IEZpbmRNb2RlbCB9IGZyb20gJy4vZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IFNpbXBsZUZpbmRSZXBsYWNlV2lkZ2V0IH0gZnJvbSAnLi9ub3RlYm9va0ZpbmRSZXBsYWNlV2lkZ2V0LmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IsIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tGaW5kU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgS0VZQklORElOR19DT05URVhUX05PVEVCT09LX0ZJTkRfV0lER0VUX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5cbmNvbnN0IEZJTkRfSElERV9UUkFOU0lUSU9OID0gJ2ZpbmQtaGlkZS10cmFuc2l0aW9uJztcbmNvbnN0IEZJTkRfU0hPV19UUkFOU0lUSU9OID0gJ2ZpbmQtc2hvdy10cmFuc2l0aW9uJztcbmxldCBNQVhfTUFUQ0hFU19DT1VOVF9XSURUSCA9IDY5O1xuY29uc3QgUFJPR1JFU1NfQkFSX0RFTEFZID0gMjAwOyAvLyBzaG93IHByb2dyZXNzIGZvciBhdCBsZWFzdCAyMDBtc1xuXG5leHBvcnQgaW50ZXJmYWNlIElTaG93Tm90ZWJvb2tGaW5kV2lkZ2V0T3B0aW9ucyB7XG5cdGlzUmVnZXg/OiBib29sZWFuO1xuXHR3aG9sZVdvcmQ/OiBib29sZWFuO1xuXHRtYXRjaENhc2U/OiBib29sZWFuO1xuXHRtYXRjaEluZGV4PzogbnVtYmVyO1xuXHRmb2N1cz86IGJvb2xlYW47XG5cdHNlYXJjaFN0cmluZ1NlZWRlZEZyb20/OiB7IGNlbGw6IElDZWxsVmlld01vZGVsOyByYW5nZTogUmFuZ2UgfTtcblx0ZmluZFNjb3BlPzogSU5vdGVib29rRmluZFNjb3BlO1xufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tGaW5kQ29udHJpYiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBpZDogc3RyaW5nID0gJ3dvcmtiZW5jaC5ub3RlYm9vay5maW5kJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IExhenk8Tm90ZWJvb2tGaW5kV2lkZ2V0PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl93aWRnZXQgPSBuZXcgTGF6eSgoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRmluZFdpZGdldCwgdGhpcy5ub3RlYm9va0VkaXRvcikpKTtcblx0fVxuXG5cdGdldCB3aWRnZXQoKTogTm90ZWJvb2tGaW5kV2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnZhbHVlO1xuXHR9XG5cblx0c2hvdyhpbml0aWFsSW5wdXQ/OiBzdHJpbmcsIG9wdGlvbnM/OiBJU2hvd05vdGVib29rRmluZFdpZGdldE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnZhbHVlLnNob3coaW5pdGlhbElucHV0LCBvcHRpb25zKTtcblx0fVxuXG5cdGhpZGUoKSB7XG5cdFx0dGhpcy5fd2lkZ2V0LnJhd1ZhbHVlPy5oaWRlKCk7XG5cdH1cblxuXHRyZXBsYWNlKHNlYXJjaFN0cmluZzogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC52YWx1ZS5yZXBsYWNlKHNlYXJjaFN0cmluZyk7XG5cdH1cblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5yYXdWYWx1ZT8uaXNWaXNpYmxlID8/IGZhbHNlO1xuXHR9XG5cblx0ZmluZE5leHQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldC5yYXdWYWx1ZSkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnZhbHVlLmZpbmROZXh0KCk7XG5cdFx0fVxuXHR9XG5cblx0ZmluZFByZXZpb3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aWRnZXQucmF3VmFsdWUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC52YWx1ZS5maW5kUHJldmlvdXMoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tGaW5kV2lkZ2V0IGV4dGVuZHMgU2ltcGxlRmluZFJlcGxhY2VXaWRnZXQgaW1wbGVtZW50cyBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24ge1xuXHRwcm90ZWN0ZWQgX2ZpbmRXaWRnZXRGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJvdGVjdGVkIF9maW5kV2lkZ2V0VmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2lzRm9jdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zaG93VGltZW91dDogbnVtYmVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2hpZGVUaW1lb3V0OiBudW1iZXIgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfcHJldmlvdXNGb2N1c0VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZmluZE1vZGVsOiBGaW5kTW9kZWw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X25vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBmaW5kU2VhcmNoSGlzdG9yeSA9IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5LmdldE9yQ3JlYXRlKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCByZXBsYWNlSGlzdG9yeSA9IFJlcGxhY2VXaWRnZXRIaXN0b3J5LmdldE9yQ3JlYXRlKHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHN1cGVyKGNvbnRleHRWaWV3U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBob3ZlclNlcnZpY2UsIG5ldyBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+KCksIF9ub3RlYm9va0VkaXRvciwgZmluZFNlYXJjaEhpc3RvcnksIHJlcGxhY2VIaXN0b3J5KTtcblx0XHR0aGlzLl9maW5kTW9kZWwgPSBuZXcgRmluZE1vZGVsKHRoaXMuX25vdGVib29rRWRpdG9yLCB0aGlzLl9zdGF0ZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0RE9NLmFwcGVuZCh0aGlzLl9ub3RlYm9va0VkaXRvci5nZXREb21Ob2RlKCksIHRoaXMuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZCA9IEtFWUJJTkRJTkdfQ09OVEVYVF9OT1RFQk9PS19GSU5EX1dJREdFVF9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUgPSBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kSW5wdXQub25LZXlEb3duKChlKSA9PiB0aGlzLl9vbkZpbmRJbnB1dEtleURvd24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZXBsYWNlSW5wdXQub25LZXlEb3duKChlKSA9PiB0aGlzLl9vblJlcGxhY2VJbnB1dEtleURvd24oZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5vbklucHV0Q2hhbmdlZCgpO1xuXG5cdFx0XHRpZiAoZS5pc1NlYXJjaGluZykge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUuaXNTZWFyY2hpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coUFJPR1JFU1NfQkFSX0RFTEFZKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9maW5kTW9kZWwuY3VycmVudE1hdGNoID49IDApIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE1hdGNoID0gdGhpcy5fZmluZE1vZGVsLmdldEN1cnJlbnRNYXRjaCgpO1xuXHRcdFx0XHR0aGlzLl9yZXBsYWNlQnRuLnNldEVuYWJsZWQoY3VycmVudE1hdGNoLmlzTW9kZWxNYXRjaCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLl9maW5kTW9kZWwuZmluZE1hdGNoZXM7XG5cdFx0XHR0aGlzLl9yZXBsYWNlQWxsQnRuLnNldEVuYWJsZWQobWF0Y2hlcy5sZW5ndGggPiAwICYmIG1hdGNoZXMuZmluZChtYXRjaCA9PiBtYXRjaC53ZWJ2aWV3TWF0Y2hlcy5sZW5ndGggPiAwKSA9PT0gdW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKGUuZmlsdGVycykge1xuXHRcdFx0XHR0aGlzLl9maW5kSW5wdXQudXBkYXRlRmlsdGVyU3RhdGUodGhpcy5fc3RhdGUuZmlsdGVycz8uaXNNb2RpZmllZCgpID8/IGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZ2V0RG9tTm9kZSgpLCBET00uRXZlbnRUeXBlLkZPQ1VTLCBlID0+IHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRm9jdXNFbGVtZW50ID0gRE9NLmlzSFRNTEVsZW1lbnQoZS5yZWxhdGVkVGFyZ2V0KSA/IGUucmVsYXRlZFRhcmdldCA6IHVuZGVmaW5lZDtcblx0XHR9LCB0cnVlKSk7XG5cdH1cblxuXHRnZXQgZmluZE1vZGVsKCk6IEZpbmRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbmRNb2RlbDtcblx0fVxuXG5cdGdldCBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRm9jdXNlZDtcblx0fVxuXG5cdHByaXZhdGUgX29uRmluZElucHV0S2V5RG93bihlOiBJS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0dGhpcy5maW5kKGZhbHNlKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHR0aGlzLmZpbmQodHJ1ZSk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25SZXBsYWNlSW5wdXRLZXlEb3duKGU6IElLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHR0aGlzLnJlcGxhY2VPbmUoKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25JbnB1dENoYW5nZWQoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiB0aGlzLmlucHV0VmFsdWUgfSwgZmFsc2UpO1xuXHRcdC8vIHRoaXMuX2ZpbmRNb2RlbC5yZXNlYXJjaCgpO1xuXHRcdGNvbnN0IGZpbmRNYXRjaGVzID0gdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzO1xuXHRcdGlmIChmaW5kTWF0Y2hlcyAmJiBmaW5kTWF0Y2hlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZmluZEluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kTW9kZWwuZmluZCh7IGluZGV4IH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZpbmQocHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kTW9kZWwuZmluZCh7IHByZXZpb3VzIH0pO1xuXHR9XG5cblx0cHVibGljIGZpbmROZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuZmluZChmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgZmluZFByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZmluZCh0cnVlKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZXBsYWNlT25lKCkge1xuXHRcdGlmICghdGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZpbmRNb2RlbC5lbnN1cmVGaW5kTWF0Y2hlcygpO1xuXG5cdFx0aWYgKHRoaXMuX2ZpbmRNb2RlbC5jdXJyZW50TWF0Y2ggPCAwKSB7XG5cdFx0XHR0aGlzLl9maW5kTW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50TWF0Y2ggPSB0aGlzLl9maW5kTW9kZWwuZ2V0Q3VycmVudE1hdGNoKCk7XG5cdFx0Y29uc3QgY2VsbCA9IGN1cnJlbnRNYXRjaC5jZWxsO1xuXHRcdGlmIChjdXJyZW50TWF0Y2guaXNNb2RlbE1hdGNoKSB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGN1cnJlbnRNYXRjaC5tYXRjaCBhcyBGaW5kTWF0Y2g7XG5cblx0XHRcdHRoaXMuX3Byb2dyZXNzQmFyLmluZmluaXRlKCkuc2hvdyhQUk9HUkVTU19CQVJfREVMQVkpO1xuXG5cdFx0XHRjb25zdCByZXBsYWNlUGF0dGVybiA9IHRoaXMucmVwbGFjZVBhdHRlcm47XG5cdFx0XHRjb25zdCByZXBsYWNlU3RyaW5nID0gcmVwbGFjZVBhdHRlcm4uYnVpbGRSZXBsYWNlU3RyaW5nKG1hdGNoLm1hdGNoZXMsIHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSk7XG5cblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0dmlld01vZGVsLnJlcGxhY2VPbmUoY2VsbCwgbWF0Y2gucmFuZ2UsIHJlcGxhY2VTdHJpbmcpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm9ncmVzc0Jhci5zdG9wKCk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdGhpcyBzaG91bGQgbm90IHdvcmtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1JlcGxhY2UgZG9lcyBub3Qgd29yayBmb3Igb3V0cHV0IG1hdGNoJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlcGxhY2VBbGwoKSB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuaW5maW5pdGUoKS5zaG93KFBST0dSRVNTX0JBUl9ERUxBWSk7XG5cblx0XHRjb25zdCByZXBsYWNlUGF0dGVybiA9IHRoaXMucmVwbGFjZVBhdHRlcm47XG5cblx0XHRjb25zdCBjZWxsRmluZE1hdGNoZXMgPSB0aGlzLl9maW5kTW9kZWwuZmluZE1hdGNoZXM7XG5cdFx0Y29uc3QgcmVwbGFjZVN0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y2VsbEZpbmRNYXRjaGVzLmZvckVhY2goY2VsbEZpbmRNYXRjaCA9PiB7XG5cdFx0XHRjZWxsRmluZE1hdGNoLmNvbnRlbnRNYXRjaGVzLmZvckVhY2gobWF0Y2ggPT4ge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gbWF0Y2gubWF0Y2hlcztcblx0XHRcdFx0cmVwbGFjZVN0cmluZ3MucHVzaChyZXBsYWNlUGF0dGVybi5idWlsZFJlcGxhY2VTdHJpbmcobWF0Y2hlcywgdGhpcy5fc3RhdGUucHJlc2VydmVDYXNlKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdHZpZXdNb2RlbC5yZXBsYWNlQWxsKHRoaXMuX2ZpbmRNb2RlbC5maW5kTWF0Y2hlcywgcmVwbGFjZVN0cmluZ3MpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZpbmRGaXJzdCgpOiB2b2lkIHsgfVxuXG5cdHByb3RlY3RlZCBvbkZvY3VzVHJhY2tlckZvY3VzKCkge1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXRGb2N1c2VkLnNldCh0cnVlKTtcblx0XHR0aGlzLl9pc0ZvY3VzZWQgPSB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRm9jdXNUcmFja2VyQmx1cigpIHtcblx0XHR0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9maW5kV2lkZ2V0Rm9jdXNlZC5yZXNldCgpO1xuXHRcdHRoaXMuX2lzRm9jdXNlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uUmVwbGFjZUlucHV0Rm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZCB7XG5cdFx0Ly8gdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cdHByb3RlY3RlZCBvblJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlckJsdXIoKTogdm9pZCB7XG5cdFx0Ly8gdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRmluZElucHV0Rm9jdXNUcmFja2VyRm9jdXMoKTogdm9pZCB7IH1cblx0cHJvdGVjdGVkIG9uRmluZElucHV0Rm9jdXNUcmFja2VyQmx1cigpOiB2b2lkIHsgfVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNob3coaW5pdGlhbElucHV0Pzogc3RyaW5nLCBvcHRpb25zPzogSVNob3dOb3RlYm9va0ZpbmRXaWRnZXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VhcmNoU3RyaW5nVXBkYXRlID0gdGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nICE9PSBpbml0aWFsSW5wdXQ7XG5cdFx0c3VwZXIuc2hvdyhpbml0aWFsSW5wdXQsIG9wdGlvbnMpO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogaW5pdGlhbElucHV0ID8/IHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZywgaXNSZXZlYWxlZDogdHJ1ZSB9LCBmYWxzZSk7XG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zPy5tYXRjaEluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKCF0aGlzLl9maW5kTW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbmRNb2RlbC5yZXNlYXJjaCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5maW5kSW5kZXgob3B0aW9ucy5tYXRjaEluZGV4KTtcblx0XHR9IGVsc2UgaWYgKG9wdGlvbnM/LmZvY3VzICE9PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5fZmluZElucHV0LnNlbGVjdCgpO1xuXHRcdH1cblxuXHRcdGlmICghc2VhcmNoU3RyaW5nVXBkYXRlICYmIG9wdGlvbnM/LnNlYXJjaFN0cmluZ1NlZWRlZEZyb20pIHtcblx0XHRcdHRoaXMuX2ZpbmRNb2RlbC5yZWZyZXNoQ3VycmVudE1hdGNoKG9wdGlvbnMuc2VhcmNoU3RyaW5nU2VlZGVkRnJvbSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3Nob3dUaW1lb3V0ID09PSBudWxsKSB7XG5cdFx0XHRpZiAodGhpcy5faGlkZVRpbWVvdXQgIT09IG51bGwpIHtcblx0XHRcdFx0RE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuY2xlYXJUaW1lb3V0KHRoaXMuX2hpZGVUaW1lb3V0KTtcblx0XHRcdFx0dGhpcy5faGlkZVRpbWVvdXQgPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZW1vdmVDbGFzc05hbWUoRklORF9ISURFX1RSQU5TSVRJT04pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5hZGRDbGFzc05hbWUoRklORF9TSE9XX1RSQU5TSVRJT04pO1xuXHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQgPSBET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IucmVtb3ZlQ2xhc3NOYW1lKEZJTkRfU0hPV19UUkFOU0lUSU9OKTtcblx0XHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQgPSBudWxsO1xuXHRcdFx0fSwgMjAwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gbm8gb3Bcblx0XHR9XG5cdH1cblxuXHRyZXBsYWNlKGluaXRpYWxGaW5kSW5wdXQ/OiBzdHJpbmcsIGluaXRpYWxSZXBsYWNlSW5wdXQ/OiBzdHJpbmcpIHtcblx0XHRzdXBlci5zaG93V2l0aFJlcGxhY2UoaW5pdGlhbEZpbmRJbnB1dCwgaW5pdGlhbFJlcGxhY2VJbnB1dCk7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiBpbml0aWFsRmluZElucHV0ID8/ICcnLCByZXBsYWNlU3RyaW5nOiBpbml0aWFsUmVwbGFjZUlucHV0ID8/ICcnLCBpc1JldmVhbGVkOiB0cnVlIH0sIGZhbHNlKTtcblx0XHR0aGlzLl9yZXBsYWNlSW5wdXQuc2VsZWN0KCk7XG5cblx0XHRpZiAodGhpcy5fc2hvd1RpbWVvdXQgPT09IG51bGwpIHtcblx0XHRcdGlmICh0aGlzLl9oaWRlVGltZW91dCAhPT0gbnVsbCkge1xuXHRcdFx0XHRET00uZ2V0V2luZG93KHRoaXMuZ2V0RG9tTm9kZSgpKS5jbGVhclRpbWVvdXQodGhpcy5faGlkZVRpbWVvdXQpO1xuXHRcdFx0XHR0aGlzLl9oaWRlVGltZW91dCA9IG51bGw7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLnJlbW92ZUNsYXNzTmFtZShGSU5EX0hJREVfVFJBTlNJVElPTik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmFkZENsYXNzTmFtZShGSU5EX1NIT1dfVFJBTlNJVElPTik7XG5cdFx0XHR0aGlzLl9zaG93VGltZW91dCA9IERPTS5nZXRXaW5kb3codGhpcy5nZXREb21Ob2RlKCkpLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZW1vdmVDbGFzc05hbWUoRklORF9TSE9XX1RSQU5TSVRJT04pO1xuXHRcdFx0XHR0aGlzLl9zaG93VGltZW91dCA9IG51bGw7XG5cdFx0XHR9LCAyMDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBubyBvcFxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGhpZGUoKSB7XG5cdFx0c3VwZXIuaGlkZSgpO1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IGlzUmV2ZWFsZWQ6IGZhbHNlIH0sIGZhbHNlKTtcblx0XHR0aGlzLl9maW5kV2lkZ2V0VmlzaWJsZS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX2ZpbmRNb2RlbC5jbGVhcigpO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmZpbmRTdG9wKCk7XG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpO1xuXG5cdFx0aWYgKHRoaXMuX2hpZGVUaW1lb3V0ID09PSBudWxsKSB7XG5cdFx0XHRpZiAodGhpcy5fc2hvd1RpbWVvdXQgIT09IG51bGwpIHtcblx0XHRcdFx0RE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuY2xlYXJUaW1lb3V0KHRoaXMuX3Nob3dUaW1lb3V0KTtcblx0XHRcdFx0dGhpcy5fc2hvd1RpbWVvdXQgPSBudWxsO1xuXHRcdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5yZW1vdmVDbGFzc05hbWUoRklORF9TSE9XX1RSQU5TSVRJT04pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbm90ZWJvb2tFZGl0b3IuYWRkQ2xhc3NOYW1lKEZJTkRfSElERV9UUkFOU0lUSU9OKTtcblx0XHRcdHRoaXMuX2hpZGVUaW1lb3V0ID0gRE9NLmdldFdpbmRvdyh0aGlzLmdldERvbU5vZGUoKSkuc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX25vdGVib29rRWRpdG9yLnJlbW92ZUNsYXNzTmFtZShGSU5EX0hJREVfVFJBTlNJVElPTik7XG5cdFx0XHR9LCAyMDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBubyBvcFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudCAmJiB0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudC5vZmZzZXRQYXJlbnQpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRm9jdXNFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR0aGlzLl9wcmV2aW91c0ZvY3VzRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbm90ZWJvb2tFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5jZWxsQXQoaSk7XG5cblx0XHRcdFx0aWYgKGNlbGwuZ2V0RWRpdFN0YXRlKCkgPT09IENlbGxFZGl0U3RhdGUuRWRpdGluZyAmJiBjZWxsLmVkaXRTdGF0ZVNvdXJjZSA9PT0gJ2ZpbmQnKSB7XG5cdFx0XHRcdFx0Y2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCAnY2xvc2VGaW5kJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3VwZGF0ZU1hdGNoZXNDb3VudCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2ZpbmRNb2RlbCB8fCAhdGhpcy5fZmluZE1vZGVsLmZpbmRNYXRjaGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbWF0Y2hlc0NvdW50LnN0eWxlLm1pbldpZHRoID0gTUFYX01BVENIRVNfQ09VTlRfV0lEVEggKyAncHgnO1xuXHRcdHRoaXMuX21hdGNoZXNDb3VudC50aXRsZSA9ICcnO1xuXG5cdFx0Ly8gcmVtb3ZlIHByZXZpb3VzIGNvbnRlbnRcblx0XHR0aGlzLl9tYXRjaGVzQ291bnQuZmlyc3RDaGlsZD8ucmVtb3ZlKCk7XG5cblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblxuXHRcdGlmICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPiAwKSB7XG5cdFx0XHRsZXQgbWF0Y2hlc0NvdW50OiBzdHJpbmcgPSBTdHJpbmcodGhpcy5fc3RhdGUubWF0Y2hlc0NvdW50KTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZS5tYXRjaGVzQ291bnQgPj0gTUFUQ0hFU19MSU1JVCkge1xuXHRcdFx0XHRtYXRjaGVzQ291bnQgKz0gJysnO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF0Y2hlc1Bvc2l0aW9uOiBzdHJpbmcgPSB0aGlzLl9maW5kTW9kZWwuY3VycmVudE1hdGNoIDwgMCA/ICc/JyA6IFN0cmluZygodGhpcy5fZmluZE1vZGVsLmN1cnJlbnRNYXRjaCArIDEpKTtcblx0XHRcdGxhYmVsID0gc3RyaW5ncy5mb3JtYXQoTkxTX01BVENIRVNfTE9DQVRJT04sIG1hdGNoZXNQb3NpdGlvbiwgbWF0Y2hlc0NvdW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFiZWwgPSBOTFNfTk9fUkVTVUxUUztcblx0XHR9XG5cblx0XHR0aGlzLl9tYXRjaGVzQ291bnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobGFiZWwpKTtcblxuXHRcdGFsZXJ0Rm4odGhpcy5fZ2V0QXJpYUxhYmVsKGxhYmVsLCB0aGlzLl9zdGF0ZS5jdXJyZW50TWF0Y2gsIHRoaXMuX3N0YXRlLnNlYXJjaFN0cmluZykpO1xuXHRcdE1BWF9NQVRDSEVTX0NPVU5UX1dJRFRIID0gTWF0aC5tYXgoTUFYX01BVENIRVNfQ09VTlRfV0lEVEgsIHRoaXMuX21hdGNoZXNDb3VudC5jbGllbnRXaWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZywgY3VycmVudE1hdGNoOiBSYW5nZSB8IG51bGwsIHNlYXJjaFN0cmluZzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAobGFiZWwgPT09IE5MU19OT19SRVNVTFRTKSB7XG5cdFx0XHRyZXR1cm4gc2VhcmNoU3RyaW5nID09PSAnJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHRFbXB0eScsIFwiezB9IGZvdW5kXCIsIGxhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhcmlhU2VhcmNoTm9SZXN1bHQnLCBcInswfSBmb3VuZCBmb3IgJ3sxfSdcIiwgbGFiZWwsIHNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0ByZWJvcm5peCwgYXJpYSBmb3IgYGNlbGwgJHtpbmRleH0sIGxpbmUge2xpbmV9YFxuXHRcdHJldHVybiBsb2NhbGl6ZSgnYXJpYVNlYXJjaE5vUmVzdWx0V2l0aExpbmVOdW1Ob0N1cnJlbnRNYXRjaCcsIFwiezB9IGZvdW5kIGZvciAnezF9J1wiLCBsYWJlbCwgc2VhcmNoU3RyaW5nKTtcblx0fVxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yPy5yZW1vdmVDbGFzc05hbWUoRklORF9TSE9XX1RSQU5TSVRJT04pO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yPy5yZW1vdmVDbGFzc05hbWUoRklORF9ISURFX1RSQU5TSVRJT04pO1xuXHRcdHRoaXMuX2ZpbmRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxhQUFhO0FBR3pCLFNBQVMsZUFBZSxtQ0FBbUM7QUFDM0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0Isc0JBQXNCO0FBQ3JELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQkFB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
