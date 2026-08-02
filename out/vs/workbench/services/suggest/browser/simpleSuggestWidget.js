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
import "./media/suggest.css";
import * as dom from "../../../../base/browser/dom.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { getAriaId, SimpleSuggestWidgetItemRenderer } from "./simpleSuggestWidgetRenderer.js";
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { Emitter, PauseableEmitter } from "../../../../base/common/event.js";
import { MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SuggestWidgetStatus } from "../../../../editor/contrib/suggest/browser/suggestWidgetStatus.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { canExpandCompletionItem, SimpleSuggestDetailsOverlay, SimpleSuggestDetailsWidget } from "./simpleSuggestWidgetDetails.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import * as strings from "../../../../base/common/strings.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { isWindows } from "../../../../base/common/platform.js";
import { editorSuggestWidgetForeground, editorSuggestWidgetSelectedBackground } from "../../../../editor/contrib/suggest/browser/suggestWidget.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { activeContrastBorder, focusBorder } from "../../../../platform/theme/common/colorRegistry.js";
const $ = dom.$;
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Hidden"] = 0] = "Hidden";
  State2[State2["Loading"] = 1] = "Loading";
  State2[State2["Empty"] = 2] = "Empty";
  State2[State2["Open"] = 3] = "Open";
  State2[State2["Frozen"] = 4] = "Frozen";
  State2[State2["Details"] = 5] = "Details";
  return State2;
})(State || {});
var WidgetPositionPreference = /* @__PURE__ */ ((WidgetPositionPreference2) => {
  WidgetPositionPreference2[WidgetPositionPreference2["Above"] = 0] = "Above";
  WidgetPositionPreference2[WidgetPositionPreference2["Below"] = 1] = "Below";
  return WidgetPositionPreference2;
})(WidgetPositionPreference || {});
const SimpleSuggestContext = {
  HasFocusedSuggestion: new RawContextKey("simpleSuggestWidgetHasFocusedSuggestion", false, localize("simpleSuggestWidgetHasFocusedSuggestion", "Whether any simple suggestion is focused")),
  HasNavigated: new RawContextKey("simpleSuggestWidgetHasNavigated", false, localize("simpleSuggestWidgetHasNavigated", "Whether the simple suggestion widget has been navigated downwards")),
  FirstSuggestionFocused: new RawContextKey("simpleSuggestWidgetFirstSuggestionFocused", false, localize("simpleSuggestWidgetFirstSuggestionFocused", "Whether the first simple suggestion is focused")),
  ExplicitlyInvoked: new RawContextKey("simpleSuggestWidgetExplicitlyInvoked", false, localize("simpleSuggestWidgetExplicitlyInvoked", "Whether the simple suggestion widget was explicitly invoked"))
};
var SuggestSelectionMode = /* @__PURE__ */ ((SuggestSelectionMode2) => {
  SuggestSelectionMode2["Partial"] = "partial";
  SuggestSelectionMode2["Always"] = "always";
  SuggestSelectionMode2["Never"] = "never";
  return SuggestSelectionMode2;
})(SuggestSelectionMode || {});
var Classes = /* @__PURE__ */ ((Classes2) => {
  Classes2["PartialSelection"] = "partial-selection";
  return Classes2;
})(Classes || {});
let SimpleSuggestWidget = class extends Disposable {
  constructor(_container, _persistedSize, _options, _getFontInfo, _onDidFontConfigurationChange, _getAdvancedExplainModeDetails, _instantiationService, _configurationService, _storageService, _contextKeyService) {
    super();
    this._container = _container;
    this._persistedSize = _persistedSize;
    this._options = _options;
    this._getFontInfo = _getFontInfo;
    this._onDidFontConfigurationChange = _onDidFontConfigurationChange;
    this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._state = 0 /* Hidden */;
    this._forceRenderingAbove = false;
    this._explainMode = false;
    this._pendingShowDetails = this._register(new MutableDisposable());
    this._pendingLayout = this._register(new MutableDisposable());
    this._ignoreFocusEvents = false;
    this._showTimeout = this._register(new TimeoutTimer());
    this._onDidSelect = this._register(new Emitter());
    this.onDidSelect = this._onDidSelect.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidFocus = new PauseableEmitter();
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlurDetails = this._register(new Emitter());
    this.onDidBlurDetails = this._onDidBlurDetails.event;
    this.element = this._register(new ResizableHTMLElement());
    this.element.domNode.classList.add("workbench-suggest-widget");
    this._container.appendChild(this.element.domNode);
    this._ctxSuggestWidgetHasFocusedSuggestion = SimpleSuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
    this._ctxSuggestWidgetHasBeenNavigated = SimpleSuggestContext.HasNavigated.bindTo(_contextKeyService);
    this._ctxFirstSuggestionFocused = SimpleSuggestContext.FirstSuggestionFocused.bindTo(_contextKeyService);
    this._ctxSuggestWidgetExplicitlyInvoked = SimpleSuggestContext.ExplicitlyInvoked.bindTo(_contextKeyService);
    class ResizeState {
      constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
        this.persistedSize = persistedSize;
        this.currentSize = currentSize;
        this.persistHeight = persistHeight;
        this.persistWidth = persistWidth;
      }
    }
    let state;
    this._register(this.element.onDidWillResize(() => {
      state = new ResizeState(this._persistedSize.restore(), this.element.size);
    }));
    this._register(this.element.onDidResize((e) => {
      this._resize(e.dimension.width, e.dimension.height);
      if (state) {
        state.persistHeight = state.persistHeight || !!e.north || !!e.south;
        state.persistWidth = state.persistWidth || !!e.east || !!e.west;
      }
      if (!e.done) {
        return;
      }
      if (state) {
        const { itemHeight, defaultSize } = this._getLayoutInfo();
        const threshold = Math.round(itemHeight / 2);
        let { width, height } = this.element.size;
        if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
          height = state.persistedSize?.height ?? defaultSize.height;
        }
        if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
          width = state.persistedSize?.width ?? defaultSize.width;
        }
        this._persistedSize.store(new dom.Dimension(width, height));
      }
      state = void 0;
    }));
    const applyIconStyle = () => this.element.domNode.classList.toggle("no-icons", !_configurationService.getValue("editor.suggest.showIcons"));
    applyIconStyle();
    const renderer = this._instantiationService.createInstance(SimpleSuggestWidgetItemRenderer, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this));
    this._register(renderer);
    this._listElement = dom.append(this.element.domNode, $(".tree"));
    this._list = this._register(new List("SuggestWidget", this._listElement, {
      getHeight: () => this._getLayoutInfo().itemHeight,
      getTemplateId: () => "suggestion"
    }, [renderer], {
      alwaysConsumeMouseWheel: true,
      useShadows: false,
      mouseSupport: false,
      multipleSelectionSupport: false,
      accessibilityProvider: {
        getRole: () => isWindows ? "listitem" : "option",
        getWidgetAriaLabel: () => localize("suggest", "Suggest"),
        getWidgetRole: () => "listbox",
        getAriaLabel: (item) => {
          let label = item.textLabel;
          const kindLabel = item.completion.kindLabel ?? "";
          if (typeof item.completion.label !== "string") {
            const { detail: detail2, description } = item.completion.label;
            if (detail2 && description) {
              label = localize("label.full", "{0}{1}, {2} {3}", label, detail2, description, kindLabel);
            } else if (detail2) {
              label = localize("label.detail", "{0}{1} {2}", label, detail2, kindLabel);
            } else if (description) {
              label = localize("label.desc", "{0}, {1} {2}", label, description, kindLabel);
            }
          } else {
            label = localize("label", "{0}, {1}", label, kindLabel);
          }
          const { documentation, detail } = item.completion;
          const docs = strings.format(
            "{0}{1}",
            detail || "",
            documentation ? typeof documentation === "string" ? documentation : documentation.value : ""
          );
          return localize("ariaCurrenttSuggestionReadDetails", "{0}, docs: {1}", label, docs);
        }
      }
    }));
    this._register(this._list.onDidChangeFocus((e) => {
      if (e.indexes.length && e.indexes[0] !== 0) {
        this._ctxSuggestWidgetHasBeenNavigated.set(true);
      }
    }));
    this._messageElement = dom.append(this.element.domNode, dom.$(".message"));
    const details = this._register(_instantiationService.createInstance(SimpleSuggestDetailsWidget, this._getFontInfo.bind(this), this._onDidFontConfigurationChange.bind(this), this._getAdvancedExplainModeDetails.bind(this)));
    this._register(details.onDidClose(() => this.toggleDetails()));
    this._details = this._register(new SimpleSuggestDetailsOverlay(details, this._listElement, this._options.preventDetailsPlacements));
    this._register(dom.addDisposableListener(this._details.widget.domNode, "blur", (e) => this._onDidBlurDetails.fire(e)));
    if (_options.statusBarMenuId && _options.showStatusBarSettingId && _configurationService.getValue(_options.showStatusBarSettingId)) {
      this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
      this.element.domNode.classList.toggle("with-status-bar", true);
    }
    this._register(this._list.onMouseDown((e) => this._onListMouseDownOrTap(e)));
    this._register(this._list.onTap((e) => this._onListMouseDownOrTap(e)));
    this._register(this._list.onDidChangeFocus((e) => this._onListFocus(e)));
    this._register(this._list.onDidChangeSelection((e) => this._onListSelection(e)));
    this._register(this._onDidFontConfigurationChange(() => {
      if (this._completionModel) {
        this._list.splice(0, this._completionModel.items.length, this._completionModel.items);
      }
    }));
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.suggest.showIcons")) {
        applyIconStyle();
      }
      if (_options.statusBarMenuId && _options.showStatusBarSettingId && e.affectsConfiguration(_options.showStatusBarSettingId)) {
        const showStatusBar = _configurationService.getValue(_options.showStatusBarSettingId);
        if (showStatusBar && !this._status) {
          this._status = this._register(_instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, _options.statusBarMenuId, { showIconsNoKeybindings: true }));
          this._status.show();
        } else if (showStatusBar && this._status) {
          this._status.show();
        } else if (this._status) {
          this._status.element.remove();
          this._status.dispose();
          this._status = void 0;
          this._layout(void 0);
        }
        this.element.domNode.classList.toggle("with-status-bar", showStatusBar);
      }
    }));
  }
  get list() {
    return this._list;
  }
  _onListFocus(e) {
    if (this._ignoreFocusEvents) {
      return;
    }
    if (this._state === 5 /* Details */) {
      this._setState(3 /* Open */);
    }
    if (!e.elements.length) {
      if (this._currentSuggestionDetails) {
        this._currentSuggestionDetails.cancel();
        this._currentSuggestionDetails = void 0;
        this._focusedItem = void 0;
        this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
      }
      this._clearAriaActiveDescendant();
      return;
    }
    if (!this._completionModel) {
      return;
    }
    this._ctxSuggestWidgetHasFocusedSuggestion.set(true);
    const item = e.elements[0];
    const index = e.indexes[0];
    if (item !== this._focusedItem) {
      this._currentSuggestionDetails?.cancel();
      this._currentSuggestionDetails = void 0;
      this._focusedItem = item;
      this._list.reveal(index);
      const id = getAriaId(index);
      const node = dom.getActiveWindow().document.activeElement;
      if (node && id) {
        node.setAttribute("aria-haspopup", "true");
        node.setAttribute("aria-autocomplete", "list");
        node.setAttribute("aria-activedescendant", id);
      } else {
        this._clearAriaActiveDescendant();
      }
      this._currentSuggestionDetails = createCancelablePromise(async (token) => {
        const loading = disposableTimeout(() => {
          if (this._isDetailsVisible()) {
            this._showDetails(true, false);
          }
        }, 250);
        const sub = token.onCancellationRequested(() => loading.dispose());
        try {
          return await Promise.resolve();
        } finally {
          loading.dispose();
          sub.dispose();
        }
      });
      this._currentSuggestionDetails.then(() => {
        if (index >= this._list.length || item !== this._list.element(index)) {
          return;
        }
        this._ignoreFocusEvents = true;
        this._list.splice(index, 1, [item]);
        this._list.setFocus([index]);
        this._ignoreFocusEvents = false;
        if (this._isDetailsVisible()) {
          this._showDetails(false, false);
        } else {
          this.element.domNode.classList.remove("docs-side");
        }
      }).catch();
    }
    this._ctxFirstSuggestionFocused.set(index === 0);
    this._onDidFocus.fire({ item, index, model: this._completionModel });
  }
  _clearAriaActiveDescendant() {
    const node = dom.getActiveWindow().document.activeElement;
    if (!node) {
      return;
    }
    node.setAttribute("aria-haspopup", "false");
    node.setAttribute("aria-autocomplete", "both");
    node.removeAttribute("aria-activedescendant");
  }
  setCompletionModel(completionModel) {
    this._completionModel = completionModel;
  }
  hasCompletions() {
    return this._completionModel?.items.length !== 0;
  }
  resetWidgetSize() {
    this._persistedSize.reset();
  }
  relayout(cursorPosition) {
    if (this._state === 0 /* Hidden */) {
      return;
    }
    this._cursorPosition = cursorPosition;
    this._layout(this.element.size);
    this._afterRender();
  }
  showTriggered(explicitlyInvoked, cursorPosition) {
    if (this._state !== 0 /* Hidden */) {
      return;
    }
    this._cursorPosition = cursorPosition;
    this._ctxSuggestWidgetExplicitlyInvoked.set(!!explicitlyInvoked);
    if (this._ctxSuggestWidgetExplicitlyInvoked.get()) {
      this._loadingTimeout = disposableTimeout(() => this._setState(1 /* Loading */), 250);
    }
  }
  showSuggestions(selectionIndex, isFrozen, isAuto, cursorPosition) {
    this._cursorPosition = cursorPosition;
    this._loadingTimeout?.dispose();
    const selectionMode = this._options?.selectionModeSettingId ? this._configurationService.getValue(this._options.selectionModeSettingId) : void 0;
    const noFocus = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "never" /* Never */;
    if (isFrozen && this._state !== 2 /* Empty */ && this._state !== 0 /* Hidden */) {
      this._setState(4 /* Frozen */);
      return;
    }
    const visibleCount = this._completionModel?.items.length ?? 0;
    const isEmpty = visibleCount === 0;
    if (isEmpty) {
      this._setState(isAuto ? 0 /* Hidden */ : 2 /* Empty */);
      this._completionModel = void 0;
      return;
    }
    try {
      this._list.splice(0, this._list.length, this._completionModel?.items ?? []);
      this._setState(isFrozen ? 4 /* Frozen */ : 3 /* Open */);
      this._list.reveal(selectionIndex, 0);
      this._list.setFocus(noFocus ? [] : [selectionIndex]);
    } finally {
    }
    this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingLayout.clear();
      this._layout(this.element.size);
    });
    this._updateListStyles();
    this._afterRender();
  }
  _updateListStyles() {
    if (this._options.selectionModeSettingId) {
      const selectionMode = this._configurationService.getValue(this._options.selectionModeSettingId);
      const usePartialStyle = !this._ctxSuggestWidgetExplicitlyInvoked.get() && selectionMode === "partial" /* Partial */;
      this._list.style(getListStylesWithMode(usePartialStyle));
      this.element.domNode.classList.toggle("partial-selection" /* PartialSelection */, usePartialStyle);
    }
  }
  setLineContext(lineContext) {
    if (this._completionModel) {
      this._completionModel.lineContext = lineContext;
    }
  }
  _setState(state) {
    if (this._state === state) {
      return;
    }
    this._state = state;
    this.element.domNode.classList.toggle("frozen", state === 4 /* Frozen */);
    this.element.domNode.classList.remove("message");
    switch (state) {
      case 0 /* Hidden */:
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.hide(this._listElement);
        dom.hide(this._messageElement);
        dom.hide(this.element.domNode);
        this._details.hide(true);
        this._status?.hide();
        this._ctxSuggestWidgetHasFocusedSuggestion.reset();
        this._showTimeout.cancel();
        this.element.domNode.classList.remove("visible");
        this._list.splice(0, this._list.length);
        this._focusedItem = void 0;
        this._cappedHeight = void 0;
        this._explainMode = false;
        break;
      case 1 /* Loading */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SimpleSuggestWidget.LOADING_MESSAGE;
        dom.hide(this._listElement);
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SimpleSuggestWidget.LOADING_MESSAGE);
        break;
      case 2 /* Empty */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE;
        dom.hide(this._listElement);
        if (this._status) {
          dom.hide(this._status.element);
        }
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE);
        break;
      case 3 /* Open */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._show();
        break;
      case 4 /* Frozen */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._show();
        break;
      case 5 /* Details */:
        dom.hide(this._messageElement);
        this._showListAndStatus();
        this._details.show();
        this._show();
        break;
    }
  }
  _showListAndStatus() {
    if (this._status) {
      dom.show(this._listElement, this._status.element);
    } else {
      dom.show(this._listElement);
    }
  }
  _show() {
    this._status?.show();
    dom.show(this.element.domNode);
    this._layout(this._persistedSize.restore());
    this._onDidShow.fire(this);
    this._showTimeout.cancelAndSet(() => {
      this.element.domNode.classList.add("visible");
    }, 100);
  }
  toggleDetailsFocus() {
    if (this._state === 5 /* Details */) {
      this._list.setFocus(this._list.getFocus());
      this._setState(3 /* Open */);
    } else if (this._state === 3 /* Open */) {
      this._setState(5 /* Details */);
      if (!this._isDetailsVisible()) {
        this.toggleDetails(true);
      } else {
        this._details.widget.focus();
      }
    }
  }
  toggleDetails(focused = false) {
    if (this._isDetailsVisible()) {
      this._pendingShowDetails.clear();
      this._setDetailsVisible(false);
      this._details.hide();
      this.element.domNode.classList.remove("shows-details");
    } else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* Open */ || this._state === 5 /* Details */ || this._state === 4 /* Frozen */)) {
      this._setDetailsVisible(true);
      this._showDetails(false, focused);
    }
  }
  _showDetails(loading, focused) {
    this._pendingShowDetails.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingShowDetails.clear();
      this._details.show();
      let didFocusDetails = false;
      if (loading) {
        this._details.widget.renderLoading();
      } else {
        this._details.widget.renderItem(this._list.getFocusedElements()[0], this._explainMode);
      }
      if (!this._details.widget.isEmpty) {
        this._positionDetails();
        this.element.domNode.classList.add("shows-details");
        if (focused) {
          this._details.widget.focus();
          didFocusDetails = true;
        }
      } else {
        this._details.hide();
      }
      if (!didFocusDetails) {
      }
    });
  }
  toggleExplainMode() {
    if (this._list.getFocusedElements()[0]) {
      this._explainMode = !this._explainMode;
      if (!this._isDetailsVisible()) {
        this.toggleDetails();
      } else {
        this._showDetails(false, false);
      }
    }
  }
  hide() {
    this._pendingLayout.clear();
    this._pendingShowDetails.clear();
    this._loadingTimeout?.dispose();
    this._ctxSuggestWidgetHasBeenNavigated.reset();
    this._ctxFirstSuggestionFocused.reset();
    this._ctxSuggestWidgetExplicitlyInvoked.reset();
    this._setState(0 /* Hidden */);
    this._onDidHide.fire(this);
    dom.hide(this.element.domNode);
    this.element.clearSashHoverState();
    const dim = this._persistedSize.restore();
    const minPersistedHeight = Math.ceil(this._getLayoutInfo().itemHeight * 4.3);
    if (dim && dim.height < minPersistedHeight) {
      this._persistedSize.store(dim.with(void 0, minPersistedHeight));
    }
  }
  _layout(size) {
    if (!this._cursorPosition) {
      return;
    }
    const bodyBox = dom.getClientArea(this._container.ownerDocument.body);
    const info = this._getLayoutInfo();
    if (!size) {
      size = info.defaultSize;
    }
    let height = size.height;
    let width = size.width;
    if (this._status) {
      this._status.element.style.height = `${info.itemHeight}px`;
    }
    const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
    if (width > maxWidth) {
      width = maxWidth;
    }
    const preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;
    const cappedListContentHeight = Math.min(this._list.contentHeight, info.itemHeight * 12);
    const fullHeight = info.statusBarHeight + cappedListContentHeight + this._messageElement.clientHeight + info.borderHeight;
    const minHeight = info.itemHeight + info.statusBarHeight;
    const editorBox = dom.getDomNodePagePosition(this._container);
    const cursorBox = {
      top: this._cursorPosition.top - editorBox.top,
      left: this._cursorPosition.left,
      height: this._cursorPosition.height
    };
    const cursorBottom = editorBox.top + cursorBox.top + cursorBox.height;
    const maxHeightBelow = Math.min(bodyBox.height - cursorBottom - info.verticalPadding, fullHeight);
    const availableSpaceAbove = editorBox.top + cursorBox.top - info.verticalPadding;
    const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
    let maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow) + info.borderHeight, fullHeight);
    if (height === this._cappedHeight?.capped) {
      height = this._cappedHeight.wanted;
    }
    if (height < minHeight) {
      height = minHeight;
    }
    if (height > maxHeight) {
      height = maxHeight;
    }
    const forceRenderingAboveRequiredSpace = 150;
    if (height > maxHeightBelow && maxHeightAbove > maxHeightBelow || this._forceRenderingAbove && availableSpaceAbove > forceRenderingAboveRequiredSpace) {
      this._preference = 0 /* Above */;
      this.element.enableSashes(true, true, false, false);
      maxHeight = maxHeightAbove;
    } else {
      this._preference = 1 /* Below */;
      this.element.enableSashes(false, true, true, false);
      maxHeight = maxHeightBelow;
    }
    this.element.preferredSize = new dom.Dimension(preferredWidth, info.defaultSize.height);
    this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
    this.element.minSize = new dom.Dimension(220, minHeight);
    this._cappedHeight = height === fullHeight ? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height } : void 0;
    let anchorLeft = this._cursorPosition.left;
    const wouldOverflowRight = anchorLeft + width > bodyBox.width;
    if (wouldOverflowRight) {
      anchorLeft = this._cursorPosition.left - width;
    }
    this.element.domNode.style.left = `${anchorLeft}px`;
    if (this._preference === 0 /* Above */) {
      this.element.domNode.style.top = `${this._cursorPosition.top - height - info.borderHeight}px`;
    } else {
      this.element.domNode.style.top = `${this._cursorPosition.top + this._cursorPosition.height}px`;
    }
    this._resize(width, height);
  }
  _afterRender() {
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      return;
    }
    if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
      this._details.show();
    }
    this._positionDetails();
  }
  _resize(width, height) {
    const { width: maxWidth, height: maxHeight } = this.element.maxSize;
    width = Math.min(maxWidth, width);
    if (maxHeight) {
      height = Math.min(maxHeight, height);
    }
    const { statusBarHeight } = this._getLayoutInfo();
    this._list.layout(height - statusBarHeight, width);
    this._listElement.style.height = `${height - statusBarHeight}px`;
    this._listElement.style.width = `${width}px`;
    this.element.layout(height, width);
    if (this._cursorPosition && this._preference === 0 /* Above */) {
      this.element.domNode.style.top = `${this._cursorPosition.top - height}px`;
    }
    this._positionDetails();
  }
  _positionDetails() {
    if (this._isDetailsVisible()) {
      this._details.placeAtAnchor(this.element.domNode);
    }
  }
  _getLayoutInfo() {
    const fontInfo = this._getFontInfo();
    const itemHeight = clamp(fontInfo.lineHeight, 8, 1e3);
    const statusBarHeight = !this._options.statusBarMenuId || !this._options.showStatusBarSettingId || !this._configurationService.getValue(this._options.showStatusBarSettingId) || this._state === 2 /* Empty */ || this._state === 1 /* Loading */ ? 0 : itemHeight;
    const borderWidth = this._details.widget.borderWidth;
    const borderHeight = 2 * borderWidth;
    return {
      itemHeight,
      statusBarHeight,
      borderWidth,
      borderHeight,
      typicalHalfwidthCharacterWidth: 10,
      verticalPadding: 22,
      horizontalPadding: 14,
      defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight + borderHeight)
    };
  }
  _onListMouseDownOrTap(e) {
    if (typeof e.element === "undefined" || typeof e.index === "undefined") {
      return;
    }
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    this._select(e.element, e.index);
  }
  _onListSelection(e) {
    if (e.elements.length) {
      this._select(e.elements[0], e.indexes[0]);
    }
  }
  _select(item, index) {
    const completionModel = this._completionModel;
    if (completionModel) {
      this._onDidSelect.fire({ item, index, model: completionModel });
    }
  }
  selectNext() {
    this._clearPartialSelectionState();
    this._list.focusNext(1, true);
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectNextPage() {
    this._clearPartialSelectionState();
    this._list.focusNextPage();
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectPrevious() {
    this._clearPartialSelectionState();
    this._list.focusPrevious(1, true);
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  selectPreviousPage() {
    this._clearPartialSelectionState();
    this._list.focusPreviousPage();
    const focus = this._list.getFocus();
    if (focus.length > 0) {
      this._list.reveal(focus[0]);
    }
    return true;
  }
  _clearPartialSelectionState() {
    this._list.style(getListStylesWithMode(false));
    this.element.domNode.classList.remove("partial-selection" /* PartialSelection */);
  }
  getFocusedItem() {
    if (this._completionModel) {
      return {
        item: this._list.getFocusedElements()[0],
        index: this._list.getFocus()[0],
        model: this._completionModel
      };
    }
    return void 0;
  }
  _isDetailsVisible() {
    return this._storageService.getBoolean("expandSuggestionDocs", StorageScope.PROFILE, false);
  }
  _setDetailsVisible(value) {
    this._storageService.store("expandSuggestionDocs", value, StorageScope.PROFILE, StorageTarget.USER);
  }
  forceRenderingAbove() {
    if (!this._forceRenderingAbove) {
      this._forceRenderingAbove = true;
      this._layout(this._persistedSize.restore());
    }
  }
  stopForceRenderingAbove() {
    this._forceRenderingAbove = false;
  }
};
SimpleSuggestWidget.LOADING_MESSAGE = localize("suggestWidget.loading", "Loading...");
SimpleSuggestWidget.NO_SUGGESTIONS_MESSAGE = localize("suggestWidget.noSuggestions", "No suggestions.");
SimpleSuggestWidget = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, IContextKeyService)
], SimpleSuggestWidget);
function getListStylesWithMode(partial) {
  if (partial) {
    return getListStyles({
      listInactiveFocusOutline: focusBorder,
      listInactiveFocusForeground: editorSuggestWidgetForeground
    });
  } else {
    return getListStyles({
      listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
      listInactiveFocusOutline: activeContrastBorder
    });
  }
}
export {
  SimpleSuggestContext,
  SimpleSuggestWidget,
  SuggestSelectionMode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zdWdnZXN0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTGlzdEV2ZW50LCBJTGlzdEdlc3R1cmVFdmVudCwgSUxpc3RNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdFN0eWxlcywgTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgUmVzaXphYmxlSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmVzaXphYmxlL3Jlc2l6YWJsZS5qcyc7XG5pbXBvcnQgeyBTaW1wbGVDb21wbGV0aW9uSXRlbSB9IGZyb20gJy4vc2ltcGxlQ29tcGxldGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgTGluZUNvbnRleHQsIFNpbXBsZUNvbXBsZXRpb25Nb2RlbCB9IGZyb20gJy4vc2ltcGxlQ29tcGxldGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IGdldEFyaWFJZCwgU2ltcGxlU3VnZ2VzdFdpZGdldEl0ZW1SZW5kZXJlciwgdHlwZSBJU2ltcGxlU3VnZ2VzdFdpZGdldEZvbnRJbmZvIH0gZnJvbSAnLi9zaW1wbGVTdWdnZXN0V2lkZ2V0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU3VnZ2VzdFdpZGdldFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0V2lkZ2V0U3RhdHVzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0sIFNpbXBsZVN1Z2dlc3REZXRhaWxzT3ZlcmxheSwgU2ltcGxlU3VnZ2VzdERldGFpbHNXaWRnZXQsIHR5cGUgU2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnQgfSBmcm9tICcuL3NpbXBsZVN1Z2dlc3RXaWRnZXREZXRhaWxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVkaXRvclN1Z2dlc3RXaWRnZXRGb3JlZ3JvdW5kLCBlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgZ2V0TGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgZm9jdXNCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgZW51bSBTdGF0ZSB7XG5cdEhpZGRlbixcblx0TG9hZGluZyxcblx0RW1wdHksXG5cdE9wZW4sXG5cdEZyb3plbixcblx0RGV0YWlsc1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb248VCBleHRlbmRzIFNpbXBsZUNvbXBsZXRpb25JdGVtPiB7XG5cdGl0ZW06IFQ7XG5cdGluZGV4OiBudW1iZXI7XG5cdG1vZGVsOiBTaW1wbGVDb21wbGV0aW9uTW9kZWw8VD47XG59XG5cbmludGVyZmFjZSBJUGVyc2lzdGVkV2lkZ2V0U2l6ZURlbGVnYXRlIHtcblx0cmVzdG9yZSgpOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRzdG9yZShzaXplOiBkb20uRGltZW5zaW9uKTogdm9pZDtcblx0cmVzZXQoKTogdm9pZDtcbn1cblxuY29uc3QgZW51bSBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2Uge1xuXHRBYm92ZSxcblx0QmVsb3dcbn1cblxuZXhwb3J0IGNvbnN0IFNpbXBsZVN1Z2dlc3RDb250ZXh0ID0ge1xuXHRIYXNGb2N1c2VkU3VnZ2VzdGlvbjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NpbXBsZVN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbicsIGZhbHNlLCBsb2NhbGl6ZSgnc2ltcGxlU3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uJywgXCJXaGV0aGVyIGFueSBzaW1wbGUgc3VnZ2VzdGlvbiBpcyBmb2N1c2VkXCIpKSxcblx0SGFzTmF2aWdhdGVkOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2ltcGxlU3VnZ2VzdFdpZGdldEhhc05hdmlnYXRlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnc2ltcGxlU3VnZ2VzdFdpZGdldEhhc05hdmlnYXRlZCcsIFwiV2hldGhlciB0aGUgc2ltcGxlIHN1Z2dlc3Rpb24gd2lkZ2V0IGhhcyBiZWVuIG5hdmlnYXRlZCBkb3dud2FyZHNcIikpLFxuXHRGaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2ltcGxlU3VnZ2VzdFdpZGdldEZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQnLCBmYWxzZSwgbG9jYWxpemUoJ3NpbXBsZVN1Z2dlc3RXaWRnZXRGaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkJywgXCJXaGV0aGVyIHRoZSBmaXJzdCBzaW1wbGUgc3VnZ2VzdGlvbiBpcyBmb2N1c2VkXCIpKSxcblx0RXhwbGljaXRseUludm9rZWQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzaW1wbGVTdWdnZXN0V2lkZ2V0RXhwbGljaXRseUludm9rZWQnLCBmYWxzZSwgbG9jYWxpemUoJ3NpbXBsZVN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZCcsIFwiV2hldGhlciB0aGUgc2ltcGxlIHN1Z2dlc3Rpb24gd2lkZ2V0IHdhcyBleHBsaWNpdGx5IGludm9rZWRcIikpLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoU3VnZ2VzdFdpZGdldE9wdGlvbnMge1xuXHQvKipcblx0ICogVGhlIHtAbGluayBNZW51SWR9IHRvIHVzZSBmb3IgdGhlIHN0YXR1cyBiYXIuIEl0ZW1zIG9uIHRoZSBtZW51IG11c3QgdXNlIHRoZSBncm91cHMgYCdsZWZ0J2Bcblx0ICogYW5kIGAncmlnaHQnYC5cblx0ICovXG5cdHN0YXR1c0Jhck1lbnVJZD86IE1lbnVJZDtcblxuXHQvKipcblx0ICogVGhlIHNldHRpbmcgZm9yIHNob3dpbmcgdGhlIHN0YXR1cyBiYXIuXG5cdCAqL1xuXHRzaG93U3RhdHVzQmFyU2V0dGluZ0lkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgc2V0dGluZyBmb3Igc2VsZWN0aW9uIG1vZGUuXG5cdCAqL1xuXHRzZWxlY3Rpb25Nb2RlU2V0dGluZ0lkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBEaXNhYmxlcyBzcGVjaWZpYyBkZXRhaWwgcGxhY2VtZW50cyB3aGVuIHBvc2l0aW9uaW5nIHRoZSBkZXRhaWxzIG92ZXJsYXkuXG5cdCAqL1xuXHRwcmV2ZW50RGV0YWlsc1BsYWNlbWVudHM/OiByZWFkb25seSBTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudFtdO1xufVxuXG4vKipcbiAqIENvbnRyb2xzIGhvdyBzdWdnZXN0IHNlbGVjdGlvbiB3b3Jrc1xuKi9cbmV4cG9ydCBjb25zdCBlbnVtIFN1Z2dlc3RTZWxlY3Rpb25Nb2RlIHtcblx0LyoqXG5cdCAqIERlZmF1bHQuIFdpbGwgc2hvdyBhIGJvcmRlciBhbmQgb25seSBhY2NlcHQgdmlhIFRhYiB1bnRpbCBuYXZpZ2F0aW9uIGhhcyBvY2N1cnJlZC4gQWZ0ZXIgdGhhdCwgaXQgd2lsbCBzaG93IHNlbGVjdGlvbiBhbmQgYWNjZXB0IHZpYSBFbnRlciBvciBUYWIuXG5cdCAqL1xuXHRQYXJ0aWFsID0gJ3BhcnRpYWwnLFxuXHQvKipcblx0ICogQWx3YXlzIHNlbGVjdCwgd2hhdCBlbnRlciBkb2VzIGRlcGVuZHMgb24gcnVuT25FbnRlci5cblx0ICovXG5cdEFsd2F5cyA9ICdhbHdheXMnLFxuXHQvKipcblx0ICogVXNlciBuZWVkcyB0byBwcmVzcyBkb3duIHRvIHNlbGVjdC5cblx0ICovXG5cdE5ldmVyID0gJ25ldmVyJ1xufVxuXG5jb25zdCBlbnVtIENsYXNzZXMge1xuXHRQYXJ0aWFsU2VsZWN0aW9uID0gJ3BhcnRpYWwtc2VsZWN0aW9uJyxcbn1cblxuZXhwb3J0IGNsYXNzIFNpbXBsZVN1Z2dlc3RXaWRnZXQ8VE1vZGVsIGV4dGVuZHMgU2ltcGxlQ29tcGxldGlvbk1vZGVsPFRJdGVtPiwgVEl0ZW0gZXh0ZW5kcyBTaW1wbGVDb21wbGV0aW9uSXRlbT4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBMT0FESU5HX01FU1NBR0U6IHN0cmluZyA9IGxvY2FsaXplKCdzdWdnZXN0V2lkZ2V0LmxvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIik7XG5cdHByaXZhdGUgc3RhdGljIE5PX1NVR0dFU1RJT05TX01FU1NBR0U6IHN0cmluZyA9IGxvY2FsaXplKCdzdWdnZXN0V2lkZ2V0Lm5vU3VnZ2VzdGlvbnMnLCBcIk5vIHN1Z2dlc3Rpb25zLlwiKTtcblxuXHRwcml2YXRlIF9zdGF0ZTogU3RhdGUgPSBTdGF0ZS5IaWRkZW47XG5cdHByaXZhdGUgX2xvYWRpbmdUaW1lb3V0PzogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgX2NvbXBsZXRpb25Nb2RlbD86IFRNb2RlbDtcblx0cHJpdmF0ZSBfY2FwcGVkSGVpZ2h0PzogeyB3YW50ZWQ6IG51bWJlcjsgY2FwcGVkOiBudW1iZXIgfTtcblx0cHJpdmF0ZSBfZm9yY2VSZW5kZXJpbmdBYm92ZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9leHBsYWluTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX3ByZWZlcmVuY2U/OiBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTaG93RGV0YWlscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0xheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzPzogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX2ZvY3VzZWRJdGVtPzogVEl0ZW07XG5cdHByaXZhdGUgX2lnbm9yZUZvY3VzRXZlbnRzOiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IFJlc2l6YWJsZUhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdDogTGlzdDxUSXRlbT47XG5cdHByaXZhdGUgX3N0YXR1cz86IFN1Z2dlc3RXaWRnZXRTdGF0dXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RldGFpbHM6IFNpbXBsZVN1Z2dlc3REZXRhaWxzT3ZlcmxheTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG93VGltZW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaW1lb3V0VGltZXIoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRJdGVtPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0OiBFdmVudDxJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRJdGVtPj4gPSB0aGlzLl9vbkRpZFNlbGVjdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRIaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dGhpcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSGlkZTogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2hvdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHRoaXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNob3c6IEV2ZW50PHRoaXM+ID0gdGhpcy5fb25EaWRTaG93LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gbmV3IFBhdXNlYWJsZUVtaXR0ZXI8SVNpbXBsZVNlbGVjdGVkU3VnZ2VzdGlvbjxUSXRlbT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXM6IEV2ZW50PElTaW1wbGVTZWxlY3RlZFN1Z2dlc3Rpb248VEl0ZW0+PiA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1ckRldGFpbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxGb2N1c0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyRGV0YWlscyA9IHRoaXMuX29uRGlkQmx1ckRldGFpbHMuZXZlbnQ7XG5cblx0Z2V0IGxpc3QoKTogTGlzdDxUSXRlbT4geyByZXR1cm4gdGhpcy5fbGlzdDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXRIYXNCZWVuTmF2aWdhdGVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4Rmlyc3RTdWdnZXN0aW9uRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZXJzaXN0ZWRTaXplOiBJUGVyc2lzdGVkV2lkZ2V0U2l6ZURlbGVnYXRlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElXb3JrYmVuY2hTdWdnZXN0V2lkZ2V0T3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRGb250SW5mbzogKCkgPT4gSVNpbXBsZVN1Z2dlc3RXaWRnZXRGb250SW5mbyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlOiBFdmVudDx2b2lkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRBZHZhbmNlZEV4cGxhaW5Nb2RlRGV0YWlsczogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXNpemFibGVIVE1MRWxlbWVudCgpKTtcblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd3b3JrYmVuY2gtc3VnZ2VzdC13aWRnZXQnKTtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50LmRvbU5vZGUpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbiA9IFNpbXBsZVN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNCZWVuTmF2aWdhdGVkID0gU2ltcGxlU3VnZ2VzdENvbnRleHQuSGFzTmF2aWdhdGVkLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eEZpcnN0U3VnZ2VzdGlvbkZvY3VzZWQgPSBTaW1wbGVTdWdnZXN0Q29udGV4dC5GaXJzdFN1Z2dlc3Rpb25Gb2N1c2VkLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZCA9IFNpbXBsZVN1Z2dlc3RDb250ZXh0LkV4cGxpY2l0bHlJbnZva2VkLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y2xhc3MgUmVzaXplU3RhdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHJlYWRvbmx5IHBlcnNpc3RlZFNpemU6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQsXG5cdFx0XHRcdHJlYWRvbmx5IGN1cnJlbnRTaXplOiBkb20uRGltZW5zaW9uLFxuXHRcdFx0XHRwdWJsaWMgcGVyc2lzdEhlaWdodCA9IGZhbHNlLFxuXHRcdFx0XHRwdWJsaWMgcGVyc2lzdFdpZHRoID0gZmFsc2UsXG5cdFx0XHQpIHsgfVxuXHRcdH1cblxuXHRcdGxldCBzdGF0ZTogUmVzaXplU3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lbGVtZW50Lm9uRGlkV2lsbFJlc2l6ZSgoKSA9PiB7XG5cdFx0XHQvLyB0aGlzLl9wcmVmZXJlbmNlTG9ja2VkID0gdHJ1ZTtcblx0XHRcdHN0YXRlID0gbmV3IFJlc2l6ZVN0YXRlKHRoaXMuX3BlcnNpc3RlZFNpemUucmVzdG9yZSgpLCB0aGlzLmVsZW1lbnQuc2l6ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWxlbWVudC5vbkRpZFJlc2l6ZShlID0+IHtcblxuXHRcdFx0dGhpcy5fcmVzaXplKGUuZGltZW5zaW9uLndpZHRoLCBlLmRpbWVuc2lvbi5oZWlnaHQpO1xuXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0c3RhdGUucGVyc2lzdEhlaWdodCA9IHN0YXRlLnBlcnNpc3RIZWlnaHQgfHwgISFlLm5vcnRoIHx8ICEhZS5zb3V0aDtcblx0XHRcdFx0c3RhdGUucGVyc2lzdFdpZHRoID0gc3RhdGUucGVyc2lzdFdpZHRoIHx8ICEhZS5lYXN0IHx8ICEhZS53ZXN0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWUuZG9uZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHQvLyBvbmx5IHN0b3JlIHdpZHRoIG9yIGhlaWdodCB2YWx1ZSB0aGF0IGhhdmUgY2hhbmdlZCBhbmQgYWxzb1xuXHRcdFx0XHQvLyBvbmx5IHN0b3JlIGNoYW5nZXMgdGhhdCBhcmUgYWJvdmUgYSBjZXJ0YWluIHRocmVzaG9sZFxuXHRcdFx0XHRjb25zdCB7IGl0ZW1IZWlnaHQsIGRlZmF1bHRTaXplIH0gPSB0aGlzLl9nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRcdGNvbnN0IHRocmVzaG9sZCA9IE1hdGgucm91bmQoaXRlbUhlaWdodCAvIDIpO1xuXHRcdFx0XHRsZXQgeyB3aWR0aCwgaGVpZ2h0IH0gPSB0aGlzLmVsZW1lbnQuc2l6ZTtcblx0XHRcdFx0aWYgKCFzdGF0ZS5wZXJzaXN0SGVpZ2h0IHx8IE1hdGguYWJzKHN0YXRlLmN1cnJlbnRTaXplLmhlaWdodCAtIGhlaWdodCkgPD0gdGhyZXNob2xkKSB7XG5cdFx0XHRcdFx0aGVpZ2h0ID0gc3RhdGUucGVyc2lzdGVkU2l6ZT8uaGVpZ2h0ID8/IGRlZmF1bHRTaXplLmhlaWdodDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXN0YXRlLnBlcnNpc3RXaWR0aCB8fCBNYXRoLmFicyhzdGF0ZS5jdXJyZW50U2l6ZS53aWR0aCAtIHdpZHRoKSA8PSB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHR3aWR0aCA9IHN0YXRlLnBlcnNpc3RlZFNpemU/LndpZHRoID8/IGRlZmF1bHRTaXplLndpZHRoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RlZFNpemUuc3RvcmUobmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZXNldCB3b3JraW5nIHN0YXRlXG5cdFx0XHQvLyB0aGlzLl9wcmVmZXJlbmNlTG9ja2VkID0gZmFsc2U7XG5cdFx0XHRzdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBhcHBseUljb25TdHlsZSA9ICgpID0+IHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ25vLWljb25zJywgIV9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0ljb25zJykpO1xuXHRcdGFwcGx5SWNvblN0eWxlKCk7XG5cblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZVN1Z2dlc3RXaWRnZXRJdGVtUmVuZGVyZXIsIHRoaXMuX2dldEZvbnRJbmZvLmJpbmQodGhpcyksIHRoaXMuX29uRGlkRm9udENvbmZpZ3VyYXRpb25DaGFuZ2UuYmluZCh0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIpO1xuXHRcdHRoaXMuX2xpc3RFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQuZG9tTm9kZSwgJCgnLnRyZWUnKSk7XG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaXN0PFRJdGVtPignU3VnZ2VzdFdpZGdldCcsIHRoaXMuX2xpc3RFbGVtZW50LCB7XG5cdFx0XHRnZXRIZWlnaHQ6ICgpOiBudW1iZXIgPT4gdGhpcy5fZ2V0TGF5b3V0SW5mbygpLml0ZW1IZWlnaHQsXG5cdFx0XHRnZXRUZW1wbGF0ZUlkOiAoKTogc3RyaW5nID0+ICdzdWdnZXN0aW9uJ1xuXHRcdH0sIFtyZW5kZXJlcl0sIHtcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRSb2xlOiAoKSA9PiBpc1dpbmRvd3MgPyAnbGlzdGl0ZW0nIDogJ29wdGlvbicsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3N1Z2dlc3QnLCBcIlN1Z2dlc3RcIiksXG5cdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdsaXN0Ym94Jyxcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbTogU2ltcGxlQ29tcGxldGlvbkl0ZW0pID0+IHtcblx0XHRcdFx0XHRsZXQgbGFiZWwgPSBpdGVtLnRleHRMYWJlbDtcblx0XHRcdFx0XHRjb25zdCBraW5kTGFiZWwgPSBpdGVtLmNvbXBsZXRpb24ua2luZExhYmVsID8/ICcnO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaXRlbS5jb21wbGV0aW9uLmxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBkZXRhaWwsIGRlc2NyaXB0aW9uIH0gPSBpdGVtLmNvbXBsZXRpb24ubGFiZWw7XG5cdFx0XHRcdFx0XHRpZiAoZGV0YWlsICYmIGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsLmZ1bGwnLCAnezB9ezF9LCB7Mn0gezN9JywgbGFiZWwsIGRldGFpbCwgZGVzY3JpcHRpb24sIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGRldGFpbCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYWJlbC5kZXRhaWwnLCAnezB9ezF9IHsyfScsIGxhYmVsLCBkZXRhaWwsIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsLmRlc2MnLCAnezB9LCB7MX0gezJ9JywgbGFiZWwsIGRlc2NyaXB0aW9uLCBraW5kTGFiZWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYWJlbCcsICd7MH0sIHsxfScsIGxhYmVsLCBraW5kTGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB7IGRvY3VtZW50YXRpb24sIGRldGFpbCB9ID0gaXRlbS5jb21wbGV0aW9uO1xuXHRcdFx0XHRcdGNvbnN0IGRvY3MgPSBzdHJpbmdzLmZvcm1hdChcblx0XHRcdFx0XHRcdCd7MH17MX0nLFxuXHRcdFx0XHRcdFx0ZGV0YWlsIHx8ICcnLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbiA/ICh0eXBlb2YgZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycgPyBkb2N1bWVudGF0aW9uIDogZG9jdW1lbnRhdGlvbi52YWx1ZSkgOiAnJyk7XG5cblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FyaWFDdXJyZW50dFN1Z2dlc3Rpb25SZWFkRGV0YWlscycsIFwiezB9LCBkb2NzOiB7MX1cIiwgbGFiZWwsIGRvY3MpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRpZiAoZS5pbmRleGVzLmxlbmd0aCAmJiBlLmluZGV4ZXNbMF0gIT09IDApIHtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0JlZW5OYXZpZ2F0ZWQuc2V0KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9tZXNzYWdlRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LmRvbU5vZGUsIGRvbS4kKCcubWVzc2FnZScpKTtcblxuXHRcdGNvbnN0IGRldGFpbHM6IFNpbXBsZVN1Z2dlc3REZXRhaWxzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpbXBsZVN1Z2dlc3REZXRhaWxzV2lkZ2V0LCB0aGlzLl9nZXRGb250SW5mby5iaW5kKHRoaXMpLCB0aGlzLl9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlLmJpbmQodGhpcyksIHRoaXMuX2dldEFkdmFuY2VkRXhwbGFpbk1vZGVEZXRhaWxzLmJpbmQodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZXRhaWxzLm9uRGlkQ2xvc2UoKCkgPT4gdGhpcy50b2dnbGVEZXRhaWxzKCkpKTtcblx0XHR0aGlzLl9kZXRhaWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNpbXBsZVN1Z2dlc3REZXRhaWxzT3ZlcmxheShkZXRhaWxzLCB0aGlzLl9saXN0RWxlbWVudCwgdGhpcy5fb3B0aW9ucy5wcmV2ZW50RGV0YWlsc1BsYWNlbWVudHMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RldGFpbHMud2lkZ2V0LmRvbU5vZGUsICdibHVyJywgKGUpID0+IHRoaXMuX29uRGlkQmx1ckRldGFpbHMuZmlyZShlKSkpO1xuXG5cdFx0aWYgKF9vcHRpb25zLnN0YXR1c0Jhck1lbnVJZCAmJiBfb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkICYmIF9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShfb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkKSkge1xuXHRcdFx0dGhpcy5fc3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3RXaWRnZXRTdGF0dXMsIHRoaXMuZWxlbWVudC5kb21Ob2RlLCBfb3B0aW9ucy5zdGF0dXNCYXJNZW51SWQsIHsgc2hvd0ljb25zTm9LZXliaW5kaW5nczogdHJ1ZSB9KSk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd3aXRoLXN0YXR1cy1iYXInLCB0cnVlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VEb3duKGUgPT4gdGhpcy5fb25MaXN0TW91c2VEb3duT3JUYXAoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uVGFwKGUgPT4gdGhpcy5fb25MaXN0TW91c2VEb3duT3JUYXAoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB0aGlzLl9vbkxpc3RGb2N1cyhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLl9vbkxpc3RTZWxlY3Rpb24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZEZvbnRDb25maWd1cmF0aW9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdGhpcy5fY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCwgdGhpcy5fY29tcGxldGlvbk1vZGVsIS5pdGVtcyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnN1Z2dlc3Quc2hvd0ljb25zJykpIHtcblx0XHRcdFx0YXBwbHlJY29uU3R5bGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChfb3B0aW9ucy5zdGF0dXNCYXJNZW51SWQgJiYgX29wdGlvbnMuc2hvd1N0YXR1c0JhclNldHRpbmdJZCAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKF9vcHRpb25zLnNob3dTdGF0dXNCYXJTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGNvbnN0IHNob3dTdGF0dXNCYXI6IGJvb2xlYW4gPSBfY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoX29wdGlvbnMuc2hvd1N0YXR1c0JhclNldHRpbmdJZCk7XG5cdFx0XHRcdGlmIChzaG93U3RhdHVzQmFyICYmICF0aGlzLl9zdGF0dXMpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdFdpZGdldFN0YXR1cywgdGhpcy5lbGVtZW50LmRvbU5vZGUsIF9vcHRpb25zLnN0YXR1c0Jhck1lbnVJZCwgeyBzaG93SWNvbnNOb0tleWJpbmRpbmdzOiB0cnVlIH0pKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXMuc2hvdygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNob3dTdGF0dXNCYXIgJiYgdGhpcy5fc3RhdHVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzLnNob3coKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zdGF0dXMpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXMuZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXQodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd3aXRoLXN0YXR1cy1iYXInLCBzaG93U3RhdHVzQmFyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkxpc3RGb2N1cyhlOiBJTGlzdEV2ZW50PFRJdGVtPik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRGV0YWlscykge1xuXHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIHdoZW4gZm9jdXMgaXMgaW4gdGhlIGRldGFpbHMtcGFuZWwgYW5kIHdoZW5cblx0XHRcdC8vIGFycm93IGtleXMgYXJlIHByZXNzZWQgdG8gc2VsZWN0IG5leHQvcHJldiBpdGVtc1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuT3Blbik7XG5cdFx0fVxuXG5cdFx0aWYgKCFlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscykge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbi5zZXQoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2xlYXJBcmlhQWN0aXZlRGVzY2VuZGFudCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29tcGxldGlvbk1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnNldCh0cnVlKTtcblx0XHRjb25zdCBpdGVtID0gZS5lbGVtZW50c1swXTtcblx0XHRjb25zdCBpbmRleCA9IGUuaW5kZXhlc1swXTtcblxuXHRcdGlmIChpdGVtICE9PSB0aGlzLl9mb2N1c2VkSXRlbSkge1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IGl0ZW07XG5cblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGluZGV4KTtcblxuXHRcdFx0Y29uc3QgaWQgPSBnZXRBcmlhSWQoaW5kZXgpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IGRvbS5nZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdFx0aWYgKG5vZGUgJiYgaWQpIHtcblx0XHRcdFx0bm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAndHJ1ZScpO1xuXHRcdFx0XHRub2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1hdXRvY29tcGxldGUnLCAnbGlzdCcpO1xuXHRcdFx0XHRub2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50JywgaWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJBcmlhQWN0aXZlRGVzY2VuZGFudCgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmcgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd0RldGFpbHModHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMjUwKTtcblx0XHRcdFx0Y29uc3Qgc3ViID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gbG9hZGluZy5kaXNwb3NlKCkpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRsb2FkaW5nLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoaW5kZXggPj0gdGhpcy5fbGlzdC5sZW5ndGggfHwgaXRlbSAhPT0gdGhpcy5fbGlzdC5lbGVtZW50KGluZGV4KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGl0ZW0gY2FuIGhhdmUgZXh0cmEgaW5mb3JtYXRpb24sIHNvIHJlLXJlbmRlclxuXHRcdFx0XHR0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKGluZGV4LCAxLCBbaXRlbV0pO1xuXHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0XHR0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cyA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2RvY3Mtc2lkZScpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0pLmNhdGNoKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3R4Rmlyc3RTdWdnZXN0aW9uRm9jdXNlZC5zZXQoaW5kZXggPT09IDApO1xuXHRcdC8vIGVtaXQgYW4gZXZlbnRcblx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoeyBpdGVtLCBpbmRleCwgbW9kZWw6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQXJpYUFjdGl2ZURlc2NlbmRhbnQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZSA9IGRvbS5nZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRub2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICdmYWxzZScpO1xuXHRcdG5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWF1dG9jb21wbGV0ZScsICdib3RoJyk7XG5cdFx0bm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3Vyc29yUG9zaXRpb24/OiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG5cblx0c2V0Q29tcGxldGlvbk1vZGVsKGNvbXBsZXRpb25Nb2RlbDogVE1vZGVsKSB7XG5cdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsID0gY29tcGxldGlvbk1vZGVsO1xuXHR9XG5cblx0aGFzQ29tcGxldGlvbnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXBsZXRpb25Nb2RlbD8uaXRlbXMubGVuZ3RoICE9PSAwO1xuXHR9XG5cblx0cmVzZXRXaWRnZXRTaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RlZFNpemUucmVzZXQoKTtcblx0fVxuXG5cdHJlbGF5b3V0KGN1cnNvclBvc2l0aW9uOiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLkhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbiA9IGN1cnNvclBvc2l0aW9uO1xuXHRcdHRoaXMuX2xheW91dCh0aGlzLmVsZW1lbnQuc2l6ZSk7XG5cdFx0dGhpcy5fYWZ0ZXJSZW5kZXIoKTtcblx0fVxuXG5cdHNob3dUcmlnZ2VyZWQoZXhwbGljaXRseUludm9rZWQ6IGJvb2xlYW4sIGN1cnNvclBvc2l0aW9uOiB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IFN0YXRlLkhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbiA9IGN1cnNvclBvc2l0aW9uO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZC5zZXQoISFleHBsaWNpdGx5SW52b2tlZCk7XG5cblx0XHRpZiAodGhpcy5fY3R4U3VnZ2VzdFdpZGdldEV4cGxpY2l0bHlJbnZva2VkLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9sb2FkaW5nVGltZW91dCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMuX3NldFN0YXRlKFN0YXRlLkxvYWRpbmcpLCAyNTApO1xuXHRcdH1cblx0fVxuXG5cdHNob3dTdWdnZXN0aW9ucyhzZWxlY3Rpb25JbmRleDogbnVtYmVyLCBpc0Zyb3plbjogYm9vbGVhbiwgaXNBdXRvOiBib29sZWFuLCBjdXJzb3JQb3NpdGlvbjogeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9KTogdm9pZCB7XG5cdFx0dGhpcy5fY3Vyc29yUG9zaXRpb24gPSBjdXJzb3JQb3NpdGlvbjtcblxuXHRcdHRoaXMuX2xvYWRpbmdUaW1lb3V0Py5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb25Nb2RlID0gdGhpcy5fb3B0aW9ucz8uc2VsZWN0aW9uTW9kZVNldHRpbmdJZCA/IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFN1Z2dlc3RTZWxlY3Rpb25Nb2RlPih0aGlzLl9vcHRpb25zLnNlbGVjdGlvbk1vZGVTZXR0aW5nSWQpIDogdW5kZWZpbmVkO1xuXHRcdC8vIFdoZW4gZXhwbGljaXRseSBpbnZva2VkIChub3QgYXV0byksIGFsd2F5cyBzZWxlY3QgdGhlIGZpcnN0IGl0ZW0gcmVnYXJkbGVzcyBvZiBzZWxlY3Rpb25Nb2RlXG5cdFx0Y29uc3Qgbm9Gb2N1cyA9ICF0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RXhwbGljaXRseUludm9rZWQuZ2V0KCkgJiYgc2VsZWN0aW9uTW9kZSA9PT0gU3VnZ2VzdFNlbGVjdGlvbk1vZGUuTmV2ZXI7XG5cblx0XHQvLyB0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/LmNhbmNlbCgpO1xuXHRcdC8vIHRoaXMuX2N1cnJlbnRTdWdnZXN0aW9uRGV0YWlscyA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpc0Zyb3plbiAmJiB0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuRW1wdHkgJiYgdGhpcy5fc3RhdGUgIT09IFN0YXRlLkhpZGRlbikge1xuXHRcdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuRnJvemVuKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWw/Lml0ZW1zLmxlbmd0aCA/PyAwO1xuXHRcdGNvbnN0IGlzRW1wdHkgPSB2aXNpYmxlQ291bnQgPT09IDA7XG5cdFx0Ly8gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMuc2V0KHZpc2libGVDb3VudCA+IDEpO1xuXG5cdFx0aWYgKGlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKGlzQXV0byA/IFN0YXRlLkhpZGRlbiA6IFN0YXRlLkVtcHR5KTtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyB0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIGNhbGxpbmcgbGlzdC5zcGxpY2UgdHJpZ2dlcnMgZm9jdXMgZXZlbnQgd2hpY2ggdGhpcyB3aWRnZXQgZm9yd2FyZHMuIFRoYXQgY2FuIGxlYWQgdG9cblx0XHQvLyBzdWdnZXN0aW9ucyBiZWluZyBjYW5jZWxsZWQgYW5kIHRoZSB3aWRnZXQgYmVpbmcgY2xlYXJlZCAoYW5kIGhpZGRlbikuIEFsbCB0aGlzIGhhcHBlbnNcblx0XHQvLyBiZWZvcmUgcmV2ZWFsaW5nIGFuZCBmb2N1c2luZyBpcyBkb25lIHdoaWNoIG1lYW5zIHJldmVhbGluZyBhbmQgZm9jdXNpbmcgd2lsbCBmYWlsIHdoZW5cblx0XHQvLyB0aGV5IGdldCBydW4uXG5cdFx0Ly8gdGhpcy5fb25EaWRGb2N1cy5wYXVzZSgpO1xuXHRcdC8vIHRoaXMuX29uRGlkU2VsZWN0LnBhdXNlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoLCB0aGlzLl9jb21wbGV0aW9uTW9kZWw/Lml0ZW1zID8/IFtdKTtcblx0XHRcdHRoaXMuX3NldFN0YXRlKGlzRnJvemVuID8gU3RhdGUuRnJvemVuIDogU3RhdGUuT3Blbik7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChzZWxlY3Rpb25JbmRleCwgMCk7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKG5vRm9jdXMgPyBbXSA6IFtzZWxlY3Rpb25JbmRleF0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyB0aGlzLl9vbkRpZEZvY3VzLnJlc3VtZSgpO1xuXHRcdFx0Ly8gdGhpcy5fb25EaWRTZWxlY3QucmVzdW1lKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dC52YWx1ZSA9IGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2xheW91dCh0aGlzLmVsZW1lbnQuc2l6ZSk7XG5cdFx0XHQvLyBSZXNldCBmb2N1cyBib3JkZXJcblx0XHRcdC8vIHRoaXMuX2RldGFpbHMud2lkZ2V0LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXNlZCcpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3VwZGF0ZUxpc3RTdHlsZXMoKTtcblx0XHR0aGlzLl9hZnRlclJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGlzdFN0eWxlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucy5zZWxlY3Rpb25Nb2RlU2V0dGluZ0lkKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Nb2RlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8U3VnZ2VzdFNlbGVjdGlvbk1vZGU+KHRoaXMuX29wdGlvbnMuc2VsZWN0aW9uTW9kZVNldHRpbmdJZCk7XG5cdFx0XHQvLyBXaGVuIGV4cGxpY2l0bHkgaW52b2tlZCwgYWx3YXlzIHNob3cgZnVsbCBzZWxlY3Rpb24gKGJhY2tncm91bmQpIGluc3RlYWQgb2YgcGFydGlhbCAoYm9yZGVyKVxuXHRcdFx0Y29uc3QgdXNlUGFydGlhbFN0eWxlID0gIXRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZC5nZXQoKSAmJiBzZWxlY3Rpb25Nb2RlID09PSBTdWdnZXN0U2VsZWN0aW9uTW9kZS5QYXJ0aWFsO1xuXHRcdFx0dGhpcy5fbGlzdC5zdHlsZShnZXRMaXN0U3R5bGVzV2l0aE1vZGUodXNlUGFydGlhbFN0eWxlKSk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKENsYXNzZXMuUGFydGlhbFNlbGVjdGlvbiwgdXNlUGFydGlhbFN0eWxlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRMaW5lQ29udGV4dChsaW5lQ29udGV4dDogTGluZUNvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29tcGxldGlvbk1vZGVsKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uTW9kZWwubGluZUNvbnRleHQgPSBsaW5lQ29udGV4dDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTdGF0ZShzdGF0ZTogU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IHN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdmcm96ZW4nLCBzdGF0ZSA9PT0gU3RhdGUuRnJvemVuKTtcblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdtZXNzYWdlJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRjYXNlIFN0YXRlLkhpZGRlbjpcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXR1cykge1xuXHRcdFx0XHRcdGRvbS5oaWRlKHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9saXN0RWxlbWVudCk7XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5lbGVtZW50LmRvbU5vZGUpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX3N0YXR1cz8uaGlkZSgpO1xuXHRcdFx0XHQvLyB0aGlzLl9jb250ZW50V2lkZ2V0LmhpZGUoKTtcblx0XHRcdFx0Ly8gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldFZpc2libGUucmVzZXQoKTtcblx0XHRcdFx0Ly8gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX3Nob3dUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2NhcHBlZEhlaWdodCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fZXhwbGFpbk1vZGUgPSBmYWxzZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ21lc3NhZ2UnKTtcblx0XHRcdFx0dGhpcy5fbWVzc2FnZUVsZW1lbnQudGV4dENvbnRlbnQgPSBTaW1wbGVTdWdnZXN0V2lkZ2V0LkxPQURJTkdfTUVTU0FHRTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbGlzdEVsZW1lbnQpO1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdHVzKSB7XG5cdFx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHN0YXR1cyhTaW1wbGVTdWdnZXN0V2lkZ2V0LkxPQURJTkdfTUVTU0FHRSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5FbXB0eTpcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdFx0XHR0aGlzLl9tZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IFNpbXBsZVN1Z2dlc3RXaWRnZXQuTk9fU1VHR0VTVElPTlNfTUVTU0FHRTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbGlzdEVsZW1lbnQpO1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdHVzKSB7XG5cdFx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHN0YXR1cyhTaW1wbGVTdWdnZXN0V2lkZ2V0Lk5PX1NVR0dFU1RJT05TX01FU1NBR0UpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGUuT3Blbjpcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9zaG93TGlzdEFuZFN0YXR1cygpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Gcm96ZW46XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fc2hvd0xpc3RBbmRTdGF0dXMoKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU3RhdGUuRGV0YWlsczpcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9zaG93TGlzdEFuZFN0YXR1cygpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLnNob3coKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93TGlzdEFuZFN0YXR1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdHVzKSB7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl9saXN0RWxlbWVudCwgdGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl9saXN0RWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdygpOiB2b2lkIHtcblx0XHQvLyB0aGlzLl9sYXlvdXQodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCkpO1xuXHRcdC8vIGRvbS5zaG93KHRoaXMuZWxlbWVudC5kb21Ob2RlKTtcblx0XHQvLyB0aGlzLl9vbkRpZFNob3cuZmlyZSgpO1xuXG5cblx0XHR0aGlzLl9zdGF0dXM/LnNob3coKTtcblx0XHQvLyB0aGlzLl9jb250ZW50V2lkZ2V0LnNob3coKTtcblx0XHRkb20uc2hvdyh0aGlzLmVsZW1lbnQuZG9tTm9kZSk7XG5cdFx0dGhpcy5fbGF5b3V0KHRoaXMuX3BlcnNpc3RlZFNpemUucmVzdG9yZSgpKTtcblx0XHQvLyB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0VmlzaWJsZS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLl9vbkRpZFNob3cuZmlyZSh0aGlzKTtcblx0XHR0aGlzLl9zaG93VGltZW91dC5jYW5jZWxBbmRTZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdH0sIDEwMCk7XG5cdH1cblxuXG5cdHRvZ2dsZURldGFpbHNGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLkRldGFpbHMpIHtcblx0XHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIGZvY3VzIHRvIHRoZSBsaXN0IGl0ZW0uXG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKSk7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5PcGVuKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5PcGVuKSB7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5EZXRhaWxzKTtcblx0XHRcdGlmICghdGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRGV0YWlscyh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlRGV0YWlscyhmb2N1c2VkOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHQvLyBoaWRlIGRldGFpbHMgd2lkZ2V0XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuY2xlYXIoKTtcblx0XHRcdC8vIHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZS5zZXQoZmFsc2UpO1xuXG5cdFx0XHR0aGlzLl9zZXREZXRhaWxzVmlzaWJsZShmYWxzZSk7XG5cdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3dzLWRldGFpbHMnKTtcblxuXHRcdH0gZWxzZSBpZiAoKGNhbkV4cGFuZENvbXBsZXRpb25JdGVtKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0pIHx8IHRoaXMuX2V4cGxhaW5Nb2RlKSAmJiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLk9wZW4gfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkRldGFpbHMgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkZyb3plbikpIHtcblx0XHRcdC8vIHNob3cgZGV0YWlscyB3aWRnZXQgKGlmZiBwb3NzaWJsZSlcblx0XHRcdC8vIHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZS5zZXQodHJ1ZSk7XG5cblx0XHRcdHRoaXMuX3NldERldGFpbHNWaXNpYmxlKHRydWUpO1xuXHRcdFx0dGhpcy5fc2hvd0RldGFpbHMoZmFsc2UsIGZvY3VzZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3dEZXRhaWxzKGxvYWRpbmc6IGJvb2xlYW4sIGZvY3VzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMudmFsdWUgPSBkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGhpcy5lbGVtZW50LmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2RldGFpbHMuc2hvdygpO1xuXHRcdFx0bGV0IGRpZEZvY3VzRGV0YWlscyA9IGZhbHNlO1xuXHRcdFx0aWYgKGxvYWRpbmcpIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQucmVuZGVyTG9hZGluZygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQucmVuZGVySXRlbSh0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdLCB0aGlzLl9leHBsYWluTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2RldGFpbHMud2lkZ2V0LmlzRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5fcG9zaXRpb25EZXRhaWxzKCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Nob3dzLWRldGFpbHMnKTtcblx0XHRcdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5mb2N1cygpO1xuXHRcdFx0XHRcdGRpZEZvY3VzRGV0YWlscyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFkaWRGb2N1c0RldGFpbHMpIHtcblx0XHRcdFx0Ly8gdGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHRvZ2dsZUV4cGxhaW5Nb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdKSB7XG5cdFx0XHR0aGlzLl9leHBsYWluTW9kZSA9ICF0aGlzLl9leHBsYWluTW9kZTtcblx0XHRcdGlmICghdGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRGV0YWlscygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2hvd0RldGFpbHMoZmFsc2UsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQuY2xlYXIoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuY2xlYXIoKTtcblx0XHR0aGlzLl9sb2FkaW5nVGltZW91dD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNCZWVuTmF2aWdhdGVkLnJlc2V0KCk7XG5cdFx0dGhpcy5fY3R4Rmlyc3RTdWdnZXN0aW9uRm9jdXNlZC5yZXNldCgpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRFeHBsaWNpdGx5SW52b2tlZC5yZXNldCgpO1xuXHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLkhpZGRlbik7XG5cdFx0dGhpcy5fb25EaWRIaWRlLmZpcmUodGhpcyk7XG5cdFx0ZG9tLmhpZGUodGhpcy5lbGVtZW50LmRvbU5vZGUpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGVhclNhc2hIb3ZlclN0YXRlKCk7XG5cdFx0Ly8gZW5zdXJlIHRoYXQgYSByZWFzb25hYmxlIHdpZGdldCBoZWlnaHQgaXMgcGVyc2lzdGVkIHNvIHRoYXRcblx0XHQvLyBhY2NpZGVudGlhbCBcInJlc2l6ZS10by1zaW5nbGUtaXRlbXNcIiBjYXNlcyBhcmVuJ3QgaGFwcGVuaW5nXG5cdFx0Y29uc3QgZGltID0gdGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCk7XG5cdFx0Y29uc3QgbWluUGVyc2lzdGVkSGVpZ2h0ID0gTWF0aC5jZWlsKHRoaXMuX2dldExheW91dEluZm8oKS5pdGVtSGVpZ2h0ICogNC4zKTtcblx0XHRpZiAoZGltICYmIGRpbS5oZWlnaHQgPCBtaW5QZXJzaXN0ZWRIZWlnaHQpIHtcblx0XHRcdHRoaXMuX3BlcnNpc3RlZFNpemUuc3RvcmUoZGltLndpdGgodW5kZWZpbmVkLCBtaW5QZXJzaXN0ZWRIZWlnaHQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXQoc2l6ZTogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY3Vyc29yUG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gaWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0Ly8gXHRyZXR1cm47XG5cdFx0Ly8gfVxuXHRcdC8vIGlmICghdGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpKSB7XG5cdFx0Ly8gXHQvLyBoYXBwZW5zIHdoZW4gcnVubmluZyB0ZXN0c1xuXHRcdC8vIFx0cmV0dXJuO1xuXHRcdC8vIH1cblxuXHRcdGNvbnN0IGJvZHlCb3ggPSBkb20uZ2V0Q2xpZW50QXJlYSh0aGlzLl9jb250YWluZXIub3duZXJEb2N1bWVudC5ib2R5KTtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fZ2V0TGF5b3V0SW5mbygpO1xuXG5cdFx0aWYgKCFzaXplKSB7XG5cdFx0XHRzaXplID0gaW5mby5kZWZhdWx0U2l6ZTtcblx0XHR9XG5cblx0XHRsZXQgaGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG5cdFx0bGV0IHdpZHRoID0gc2l6ZS53aWR0aDtcblxuXHRcdC8vIHN0YXR1cyBiYXJcblx0XHRpZiAodGhpcy5fc3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtpbmZvLml0ZW1IZWlnaHR9cHhgO1xuXHRcdH1cblxuXHRcdC8vIGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcpIHtcblx0XHQvLyBcdC8vIHNob3dpbmcgYSBtZXNzYWdlIG9ubHlcblx0XHQvLyBcdGhlaWdodCA9IGluZm8uaXRlbUhlaWdodCArIGluZm8uYm9yZGVySGVpZ2h0O1xuXHRcdC8vIFx0d2lkdGggPSBpbmZvLmRlZmF1bHRTaXplLndpZHRoIC8gMjtcblx0XHQvLyBcdHRoaXMuZWxlbWVudC5lbmFibGVTYXNoZXMoZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdC8vIFx0dGhpcy5lbGVtZW50Lm1pblNpemUgPSB0aGlzLmVsZW1lbnQubWF4U2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdC8vIFx0dGhpcy5fcHJlZmVyZW5jZSA9IFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CZWxvdztcblxuXHRcdC8vIH0gZWxzZSB7XG5cdFx0Ly8gc2hvd2luZyBpdGVtc1xuXG5cdFx0Ly8gd2lkdGggbWF0aFxuXHRcdGNvbnN0IG1heFdpZHRoID0gYm9keUJveC53aWR0aCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gMiAqIGluZm8uaG9yaXpvbnRhbFBhZGRpbmc7XG5cdFx0aWYgKHdpZHRoID4gbWF4V2lkdGgpIHtcblx0XHRcdHdpZHRoID0gbWF4V2lkdGg7XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZlcnJlZFdpZHRoID0gdGhpcy5fY29tcGxldGlvbk1vZGVsID8gdGhpcy5fY29tcGxldGlvbk1vZGVsLnN0YXRzLnBMYWJlbExlbiAqIGluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoIDogd2lkdGg7XG5cblx0XHQvLyBoZWlnaHQgbWF0aFxuXHRcdC8vIENhcCBsaXN0IGNvbnRlbnQgaGVpZ2h0IHRvIGEgcmVhc29uYWJsZSBtYXhpbXVtICgxMiBpdGVtcyB3b3J0aCksIG1hdGNoaW5nIHN1Z2dlc3RXaWRnZXQgYmVoYXZpb3Jcblx0XHRjb25zdCBjYXBwZWRMaXN0Q29udGVudEhlaWdodCA9IE1hdGgubWluKHRoaXMuX2xpc3QuY29udGVudEhlaWdodCwgaW5mby5pdGVtSGVpZ2h0ICogMTIpO1xuXHRcdGNvbnN0IGZ1bGxIZWlnaHQgPSBpbmZvLnN0YXR1c0JhckhlaWdodCArIGNhcHBlZExpc3RDb250ZW50SGVpZ2h0ICsgdGhpcy5fbWVzc2FnZUVsZW1lbnQuY2xpZW50SGVpZ2h0ICsgaW5mby5ib3JkZXJIZWlnaHQ7XG5cdFx0Y29uc3QgbWluSGVpZ2h0ID0gaW5mby5pdGVtSGVpZ2h0ICsgaW5mby5zdGF0dXNCYXJIZWlnaHQ7XG5cdFx0Ly8gY29uc3QgZWRpdG9yQm94ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblx0XHQvLyBjb25zdCBjdXJzb3JCb3ggPSB0aGlzLmVkaXRvci5nZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbih0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHRjb25zdCBlZGl0b3JCb3ggPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLl9jb250YWluZXIpO1xuXHRcdC8vIENvbnZlcnQgYWJzb2x1dGUgY3Vyc29yIHBvc2l0aW9uIHRvIHJlbGF0aXZlIHBvc2l0aW9uIChyZWxhdGl2ZSB0byBjb250YWluZXIpXG5cdFx0Y29uc3QgY3Vyc29yQm94ID0ge1xuXHRcdFx0dG9wOiB0aGlzLl9jdXJzb3JQb3NpdGlvbi50b3AgLSBlZGl0b3JCb3gudG9wLFxuXHRcdFx0bGVmdDogdGhpcy5fY3Vyc29yUG9zaXRpb24ubGVmdCxcblx0XHRcdGhlaWdodDogdGhpcy5fY3Vyc29yUG9zaXRpb24uaGVpZ2h0XG5cdFx0fTtcblx0XHRjb25zdCBjdXJzb3JCb3R0b20gPSBlZGl0b3JCb3gudG9wICsgY3Vyc29yQm94LnRvcCArIGN1cnNvckJveC5oZWlnaHQ7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0QmVsb3cgPSBNYXRoLm1pbihib2R5Qm94LmhlaWdodCAtIGN1cnNvckJvdHRvbSAtIGluZm8udmVydGljYWxQYWRkaW5nLCBmdWxsSGVpZ2h0KTtcblx0XHRjb25zdCBhdmFpbGFibGVTcGFjZUFib3ZlID0gZWRpdG9yQm94LnRvcCArIGN1cnNvckJveC50b3AgLSBpbmZvLnZlcnRpY2FsUGFkZGluZztcblx0XHRjb25zdCBtYXhIZWlnaHRBYm92ZSA9IE1hdGgubWluKGF2YWlsYWJsZVNwYWNlQWJvdmUsIGZ1bGxIZWlnaHQpO1xuXHRcdGxldCBtYXhIZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1heChtYXhIZWlnaHRBYm92ZSwgbWF4SGVpZ2h0QmVsb3cpICsgaW5mby5ib3JkZXJIZWlnaHQsIGZ1bGxIZWlnaHQpO1xuXG5cdFx0aWYgKGhlaWdodCA9PT0gdGhpcy5fY2FwcGVkSGVpZ2h0Py5jYXBwZWQpIHtcblx0XHRcdC8vIFJlc3RvcmUgdGhlIG9sZCAod2FudGVkKSBoZWlnaHQgd2hlbiB0aGUgY3VycmVudFxuXHRcdFx0Ly8gaGVpZ2h0IGlzIGNhcHBlZCB0byBmaXRcblx0XHRcdGhlaWdodCA9IHRoaXMuX2NhcHBlZEhlaWdodC53YW50ZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGhlaWdodCA8IG1pbkhlaWdodCkge1xuXHRcdFx0aGVpZ2h0ID0gbWluSGVpZ2h0O1xuXHRcdH1cblx0XHRpZiAoaGVpZ2h0ID4gbWF4SGVpZ2h0KSB7XG5cdFx0XHRoZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9yY2VSZW5kZXJpbmdBYm92ZVJlcXVpcmVkU3BhY2UgPSAxNTA7XG5cdFx0aWYgKChoZWlnaHQgPiBtYXhIZWlnaHRCZWxvdyAmJiBtYXhIZWlnaHRBYm92ZSA+IG1heEhlaWdodEJlbG93KSB8fCAodGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSAmJiBhdmFpbGFibGVTcGFjZUFib3ZlID4gZm9yY2VSZW5kZXJpbmdBYm92ZVJlcXVpcmVkU3BhY2UpKSB7XG5cdFx0XHR0aGlzLl9wcmVmZXJlbmNlID0gV2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFib3ZlO1xuXHRcdFx0dGhpcy5lbGVtZW50LmVuYWJsZVNhc2hlcyh0cnVlLCB0cnVlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0bWF4SGVpZ2h0ID0gbWF4SGVpZ2h0QWJvdmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3ByZWZlcmVuY2UgPSBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQmVsb3c7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZW5hYmxlU2FzaGVzKGZhbHNlLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHRtYXhIZWlnaHQgPSBtYXhIZWlnaHRCZWxvdztcblx0XHR9XG5cdFx0dGhpcy5lbGVtZW50LnByZWZlcnJlZFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihwcmVmZXJyZWRXaWR0aCwgaW5mby5kZWZhdWx0U2l6ZS5oZWlnaHQpO1xuXHRcdHRoaXMuZWxlbWVudC5tYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24obWF4V2lkdGgsIG1heEhlaWdodCk7XG5cdFx0dGhpcy5lbGVtZW50Lm1pblNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbigyMjAsIG1pbkhlaWdodCk7XG5cblx0XHQvLyBLbm93IHdoZW4gdGhlIGhlaWdodCB3YXMgY2FwcGVkIHRvIGZpdCBhbmQgcmVtZW1iZXJcblx0XHQvLyB0aGUgd2FudGVkIGhlaWdodCBmb3IgbGF0ZXIuIFRoaXMgaXMgcmVxdWlyZWQgd2hlbiBnb2luZ1xuXHRcdC8vIGxlZnQgdG8gd2lkZW4gc3VnZ2VzdGlvbnMuXG5cdFx0dGhpcy5fY2FwcGVkSGVpZ2h0ID0gaGVpZ2h0ID09PSBmdWxsSGVpZ2h0XG5cdFx0XHQ/IHsgd2FudGVkOiB0aGlzLl9jYXBwZWRIZWlnaHQ/LndhbnRlZCA/PyBzaXplLmhlaWdodCwgY2FwcGVkOiBoZWlnaHQgfVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Ly8gfVxuXHRcdC8vIEhvcml6b250YWwgcG9zaXRpb25pbmc6IFBvc2l0aW9uIHdpZGdldCBhdCBjdXJzb3IsIGZsaXAgdG8gbGVmdCBpZiB3b3VsZCBvdmVyZmxvdyByaWdodFxuXHRcdGxldCBhbmNob3JMZWZ0ID0gdGhpcy5fY3Vyc29yUG9zaXRpb24ubGVmdDtcblx0XHRjb25zdCB3b3VsZE92ZXJmbG93UmlnaHQgPSBhbmNob3JMZWZ0ICsgd2lkdGggPiBib2R5Qm94LndpZHRoO1xuXG5cdFx0aWYgKHdvdWxkT3ZlcmZsb3dSaWdodCkge1xuXHRcdFx0Ly8gUG9zaXRpb24gcmlnaHQgZWRnZSBhdCBjdXJzb3IgKGV4dGVuZHMgbGVmdClcblx0XHRcdGFuY2hvckxlZnQgPSB0aGlzLl9jdXJzb3JQb3NpdGlvbi5sZWZ0IC0gd2lkdGg7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuc3R5bGUubGVmdCA9IGAke2FuY2hvckxlZnR9cHhgO1xuXHRcdGlmICh0aGlzLl9wcmVmZXJlbmNlID09PSBXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQWJvdmUpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke3RoaXMuX2N1cnNvclBvc2l0aW9uLnRvcCAtIGhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0fXB4YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dGhpcy5fY3Vyc29yUG9zaXRpb24udG9wICsgdGhpcy5fY3Vyc29yUG9zaXRpb24uaGVpZ2h0fXB4YDtcblx0XHR9XG5cdFx0Ly8gfVxuXHRcdHRoaXMuX3Jlc2l6ZSh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdF9hZnRlclJlbmRlcigpIHtcblx0XHQvLyBpZiAocG9zaXRpb24gPT09IG51bGwpIHtcblx0XHQvLyBcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHQvLyBcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7IC8vdG9kb0Bqcmlla2VuIHNvZnQtaGlkZVxuXHRcdC8vIFx0fVxuXHRcdC8vIFx0cmV0dXJuO1xuXHRcdC8vIH1cblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLkVtcHR5IHx8IHRoaXMuX3N0YXRlID09PSBTdGF0ZS5Mb2FkaW5nKSB7XG5cdFx0XHQvLyBubyBzcGVjaWFsIHBvc2l0aW9uaW5nIHdoZW4gd2lkZ2V0IGlzbid0IHNob3dpbmcgbGlzdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpICYmICF0aGlzLl9kZXRhaWxzLndpZGdldC5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9kZXRhaWxzLnNob3coKTtcblx0XHR9XG5cdFx0dGhpcy5fcG9zaXRpb25EZXRhaWxzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNpemUod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB7IHdpZHRoOiBtYXhXaWR0aCwgaGVpZ2h0OiBtYXhIZWlnaHQgfSA9IHRoaXMuZWxlbWVudC5tYXhTaXplO1xuXHRcdHdpZHRoID0gTWF0aC5taW4obWF4V2lkdGgsIHdpZHRoKTtcblx0XHRpZiAobWF4SGVpZ2h0KSB7XG5cdFx0XHRoZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIGhlaWdodCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBzdGF0dXNCYXJIZWlnaHQgfSA9IHRoaXMuX2dldExheW91dEluZm8oKTtcblx0XHR0aGlzLl9saXN0LmxheW91dChoZWlnaHQgLSBzdGF0dXNCYXJIZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl9saXN0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHQgLSBzdGF0dXNCYXJIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5fbGlzdEVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0dGhpcy5lbGVtZW50LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHRpZiAodGhpcy5fY3Vyc29yUG9zaXRpb24gJiYgdGhpcy5fcHJlZmVyZW5jZSA9PT0gV2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkFib3ZlKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5zdHlsZS50b3AgPSBgJHt0aGlzLl9jdXJzb3JQb3NpdGlvbi50b3AgLSBoZWlnaHR9cHhgO1xuXHRcdH1cblx0XHR0aGlzLl9wb3NpdGlvbkRldGFpbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Bvc2l0aW9uRGV0YWlscygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLl9kZXRhaWxzLnBsYWNlQXRBbmNob3IodGhpcy5lbGVtZW50LmRvbU5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLl9nZXRGb250SW5mbygpO1xuXHRcdGNvbnN0IGl0ZW1IZWlnaHQgPSBjbGFtcChmb250SW5mby5saW5lSGVpZ2h0LCA4LCAxMDAwKTtcblx0XHRjb25zdCBzdGF0dXNCYXJIZWlnaHQgPSAhdGhpcy5fb3B0aW9ucy5zdGF0dXNCYXJNZW51SWQgfHwgIXRoaXMuX29wdGlvbnMuc2hvd1N0YXR1c0JhclNldHRpbmdJZCB8fCAhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodGhpcy5fb3B0aW9ucy5zaG93U3RhdHVzQmFyU2V0dGluZ0lkKSB8fCB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcgPyAwIDogaXRlbUhlaWdodDtcblx0XHRjb25zdCBib3JkZXJXaWR0aCA9IHRoaXMuX2RldGFpbHMud2lkZ2V0LmJvcmRlcldpZHRoO1xuXHRcdGNvbnN0IGJvcmRlckhlaWdodCA9IDIgKiBib3JkZXJXaWR0aDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtSGVpZ2h0LFxuXHRcdFx0c3RhdHVzQmFySGVpZ2h0LFxuXHRcdFx0Ym9yZGVyV2lkdGgsXG5cdFx0XHRib3JkZXJIZWlnaHQsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IDEwLFxuXHRcdFx0dmVydGljYWxQYWRkaW5nOiAyMixcblx0XHRcdGhvcml6b250YWxQYWRkaW5nOiAxNCxcblx0XHRcdGRlZmF1bHRTaXplOiBuZXcgZG9tLkRpbWVuc2lvbig0MzAsIHN0YXR1c0JhckhlaWdodCArIDEyICogaXRlbUhlaWdodCArIGJvcmRlckhlaWdodClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfb25MaXN0TW91c2VEb3duT3JUYXAoZTogSUxpc3RNb3VzZUV2ZW50PFRJdGVtPiB8IElMaXN0R2VzdHVyZUV2ZW50PFRJdGVtPik6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgZS5lbGVtZW50ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgZS5pbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBwcmV2ZW50IHN0ZWFsaW5nIGJyb3dzZXIgZm9jdXMgZnJvbSB0aGUgdGVybWluYWxcblx0XHRlLmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuYnJvd3NlckV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0dGhpcy5fc2VsZWN0KGUuZWxlbWVudCwgZS5pbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkxpc3RTZWxlY3Rpb24oZTogSUxpc3RFdmVudDxUSXRlbT4pOiB2b2lkIHtcblx0XHRpZiAoZS5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3NlbGVjdChlLmVsZW1lbnRzWzBdLCBlLmluZGV4ZXNbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlbGVjdChpdGVtOiBUSXRlbSwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25Nb2RlbCA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbDtcblx0XHRpZiAoY29tcGxldGlvbk1vZGVsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdC5maXJlKHsgaXRlbSwgaW5kZXgsIG1vZGVsOiBjb21wbGV0aW9uTW9kZWwgfSk7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0TmV4dCgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9jbGVhclBhcnRpYWxTZWxlY3Rpb25TdGF0ZSgpO1xuXHRcdHRoaXMuX2xpc3QuZm9jdXNOZXh0KDEsIHRydWUpO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VsZWN0TmV4dFBhZ2UoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY2xlYXJQYXJ0aWFsU2VsZWN0aW9uU3RhdGUoKTtcblx0XHR0aGlzLl9saXN0LmZvY3VzTmV4dFBhZ2UoKTtcblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNbMF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNlbGVjdFByZXZpb3VzKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NsZWFyUGFydGlhbFNlbGVjdGlvblN0YXRlKCk7XG5cdFx0dGhpcy5fbGlzdC5mb2N1c1ByZXZpb3VzKDEsIHRydWUpO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VsZWN0UHJldmlvdXNQYWdlKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NsZWFyUGFydGlhbFNlbGVjdGlvblN0YXRlKCk7XG5cdFx0dGhpcy5fbGlzdC5mb2N1c1ByZXZpb3VzUGFnZSgpO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c1swXSk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJQYXJ0aWFsU2VsZWN0aW9uU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5zdHlsZShnZXRMaXN0U3R5bGVzV2l0aE1vZGUoZmFsc2UpKTtcblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKENsYXNzZXMuUGFydGlhbFNlbGVjdGlvbik7XG5cdH1cblxuXHRnZXRGb2N1c2VkSXRlbSgpOiBJU2ltcGxlU2VsZWN0ZWRTdWdnZXN0aW9uPFRJdGVtPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXRlbTogdGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXSxcblx0XHRcdFx0aW5kZXg6IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKVswXSxcblx0XHRcdFx0bW9kZWw6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGV0YWlsc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2V4cGFuZFN1Z2dlc3Rpb25Eb2NzJywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldERldGFpbHNWaXNpYmxlKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2V4cGFuZFN1Z2dlc3Rpb25Eb2NzJywgdmFsdWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0Zm9yY2VSZW5kZXJpbmdBYm92ZSgpIHtcblx0XHRpZiAoIXRoaXMuX2ZvcmNlUmVuZGVyaW5nQWJvdmUpIHtcblx0XHRcdHRoaXMuX2ZvcmNlUmVuZGVyaW5nQWJvdmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fbGF5b3V0KHRoaXMuX3BlcnNpc3RlZFNpemUucmVzdG9yZSgpKTtcblx0XHR9XG5cdH1cblxuXHRzdG9wRm9yY2VSZW5kZXJpbmdBYm92ZSgpIHtcblx0XHR0aGlzLl9mb3JjZVJlbmRlcmluZ0Fib3ZlID0gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0TGlzdFN0eWxlc1dpdGhNb2RlKHBhcnRpYWw/OiBib29sZWFuKTogSUxpc3RTdHlsZXMge1xuXHQvLyBUaGUgc3VnZ2VzdCB3aWRnZXQgdXNlcyB0aGUgbGlzdCdzIGluYWN0aXZlIGZvY3VzIHRvIG1lYW4gc2VsZWN0aW9uIHNpbmNlIGl0J3Mgbm90IGFjdHVhbGx5XG5cdC8vIGZvY3VzZWQuXG5cdGlmIChwYXJ0aWFsKSB7XG5cdFx0cmV0dXJuIGdldExpc3RTdHlsZXMoe1xuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lOiBmb2N1c0JvcmRlcixcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZDogZWRpdG9yU3VnZ2VzdFdpZGdldEZvcmVncm91bmQsXG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGdldExpc3RTdHlsZXMoe1xuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiBlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRCYWNrZ3JvdW5kLFxuXHRcdFx0bGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lOiBhY3RpdmVDb250cmFzdEJvcmRlclxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFFckIsU0FBc0IsWUFBWTtBQUNsQyxTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLFdBQVcsdUNBQTBFO0FBQzlGLFNBQTRCLHlCQUF5QixtQkFBbUIsb0JBQW9CO0FBQzVGLFNBQVMsU0FBZ0Isd0JBQXdCO0FBQ2pELFNBQVMsbUJBQW1CLGtCQUErQjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUIsNkJBQTZCLGtDQUFzRTtBQUNySSxT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QU8sTUFBTSxDQUFDLENBQUM7QUFBQSxJQUMzQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxxQkFBOEI7QUFDN0IsU0FBSyw0QkFBNEI7QUFDakMsU0FBSyxNQUFNLGtCQUFrQjtBQUM3QixVQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVM7QUFDbEMsUUFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQixXQUFLLE1BQU0sT0FBTyxNQUFNLENBQUMsQ0FBQztBQUFBLElBQzNCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDhCQUFvQztBQUMzQyxTQUFLLE1BQU0sTUFBTSxzQkFBc0IsS0FBSyxDQUFDO0FBQzdDLFNBQUssUUFBUSxRQUFRLFVBQVUsT0FBTywwQ0FBd0I7QUFBQSxFQUMvRDtBQUFBLEVBRUEsaUJBQStEO0FBQzlELFFBQUksS0FBSyxrQkFBa0I7QUFDMUIsYUFBTztBQUFBLFFBQ04sTUFBTSxLQUFLLE1BQU0sbUJBQW1CLEVBQUUsQ0FBQztBQUFBLFFBQ3ZDLE9BQU8sS0FBSyxNQUFNLFNBQVMsRUFBRSxDQUFDO0FBQUEsUUFDOUIsT0FBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsb0JBQTZCO0FBQ3BDLFdBQU8sS0FBSyxnQkFBZ0IsV0FBVyx3QkFBd0IsYUFBYSxTQUFTLEtBQUs7QUFBQSxFQUMzRjtBQUFBLEVBRVEsbUJBQW1CLE9BQWdCO0FBQzFDLFNBQUssZ0JBQWdCLE1BQU0sd0JBQXdCLE9BQU8sYUFBYSxTQUFTLGNBQWMsSUFBSTtBQUFBLEVBQ25HO0FBQUEsRUFFQSxzQkFBc0I7QUFDckIsUUFBSSxDQUFDLEtBQUssc0JBQXNCO0FBQy9CLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssUUFBUSxLQUFLLGVBQWUsUUFBUSxDQUFDO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUEsRUFFQSwwQkFBMEI7QUFDekIsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUNEO0FBajNCYSxvQkFFRyxrQkFBMEIsU0FBUyx5QkFBeUIsWUFBWTtBQUYzRSxvQkFHRyx5QkFBaUMsU0FBUywrQkFBK0IsaUJBQWlCO0FBSDdGLHNCQUFOO0FBQUEsRUFvREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZEVTtBQW0zQmIsU0FBUyxzQkFBc0IsU0FBZ0M7QUFHOUQsTUFBSSxTQUFTO0FBQ1osV0FBTyxjQUFjO0FBQUEsTUFDcEIsMEJBQTBCO0FBQUEsTUFDMUIsNkJBQTZCO0FBQUEsSUFDOUIsQ0FBQztBQUFBLEVBQ0YsT0FBTztBQUNOLFdBQU8sY0FBYztBQUFBLE1BQ3BCLDZCQUE2QjtBQUFBLE1BQzdCLDBCQUEwQjtBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlN0YXRlIiwgIldpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSIsICJTdWdnZXN0U2VsZWN0aW9uTW9kZSIsICJDbGFzc2VzIiwgImRldGFpbCJdCn0K
