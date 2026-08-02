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
import * as dom from "../../../../base/browser/dom.js";
import "../../../../base/browser/ui/codicons/codiconStyles.js";
import { List } from "../../../../base/browser/ui/list/listWidget.js";
import { createCancelablePromise, disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, PauseableEmitter } from "../../../../base/common/event.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import * as strings from "../../../../base/common/strings.js";
import "./media/suggest.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { SuggestWidgetStatus } from "./suggestWidgetStatus.js";
import "../../symbolIcons/browser/symbolIcons.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { activeContrastBorder, editorForeground, editorWidgetBackground, editorWidgetBorder, listFocusHighlightForeground, listHighlightForeground, quickInputListFocusBackground, quickInputListFocusForeground, quickInputListFocusIconForeground, registerColor, transparent } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { Context as SuggestContext, suggestWidgetStatusbarMenu } from "./suggest.js";
import { canExpandCompletionItem, SuggestDetailsOverlay, SuggestDetailsWidget } from "./suggestWidgetDetails.js";
import { ItemRenderer } from "./suggestWidgetRenderer.js";
import { getListStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { CompletionItemKinds } from "../../../common/languages.js";
import { isWindows } from "../../../../base/common/platform.js";
const editorSuggestWidgetBackground = registerColor("editorSuggestWidget.background", editorWidgetBackground, nls.localize("editorSuggestWidgetBackground", "Background color of the suggest widget."));
registerColor("editorSuggestWidget.border", editorWidgetBorder, nls.localize("editorSuggestWidgetBorder", "Border color of the suggest widget."));
const editorSuggestWidgetForeground = registerColor("editorSuggestWidget.foreground", editorForeground, nls.localize("editorSuggestWidgetForeground", "Foreground color of the suggest widget."));
const editorSuggestWidgetSelectedForeground = registerColor("editorSuggestWidget.selectedForeground", { dark: quickInputListFocusForeground, light: quickInputListFocusForeground, hcDark: editorSuggestWidgetBackground, hcLight: editorSuggestWidgetBackground }, nls.localize("editorSuggestWidgetSelectedForeground", "Foreground color of the selected entry in the suggest widget."));
registerColor("editorSuggestWidget.selectedIconForeground", { dark: quickInputListFocusIconForeground, light: quickInputListFocusIconForeground, hcDark: editorSuggestWidgetBackground, hcLight: editorSuggestWidgetBackground }, nls.localize("editorSuggestWidgetSelectedIconForeground", "Icon foreground color of the selected entry in the suggest widget."));
const editorSuggestWidgetSelectedBackground = registerColor("editorSuggestWidget.selectedBackground", { dark: quickInputListFocusBackground, light: quickInputListFocusBackground, hcDark: editorSuggestWidgetForeground, hcLight: editorSuggestWidgetForeground }, nls.localize("editorSuggestWidgetSelectedBackground", "Background color of the selected entry in the suggest widget."));
const editorSuggestWidgetFocusOutline = registerColor("editorSuggestWidget.focusOutline", activeContrastBorder, nls.localize("editorSuggestWidgetFocusOutline", "Outline color of the focused (keyboard-navigated) entry in the suggest widget."));
registerColor("editorSuggestWidget.highlightForeground", listHighlightForeground, nls.localize("editorSuggestWidgetHighlightForeground", "Color of the match highlights in the suggest widget."));
registerColor("editorSuggestWidget.focusHighlightForeground", { dark: listFocusHighlightForeground, light: listFocusHighlightForeground, hcDark: editorSuggestWidgetSelectedForeground, hcLight: editorSuggestWidgetSelectedForeground }, nls.localize("editorSuggestWidgetFocusHighlightForeground", "Color of the match highlights in the suggest widget when an item is focused."));
registerColor("editorSuggestWidgetStatus.foreground", transparent(editorSuggestWidgetForeground, 0.5), nls.localize("editorSuggestWidgetStatusForeground", "Foreground color of the suggest widget status."));
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Hidden"] = 0] = "Hidden";
  State2[State2["Loading"] = 1] = "Loading";
  State2[State2["Empty"] = 2] = "Empty";
  State2[State2["Open"] = 3] = "Open";
  State2[State2["Frozen"] = 4] = "Frozen";
  State2[State2["Details"] = 5] = "Details";
  State2[State2["onDetailsKeyDown"] = 6] = "onDetailsKeyDown";
  return State2;
})(State || {});
class PersistedWidgetSize {
  constructor(_service, editor) {
    this._service = _service;
    this._key = `suggestWidget.size/${editor.getEditorType()}/${editor instanceof EmbeddedCodeEditorWidget}`;
  }
  restore() {
    const raw = this._service.get(this._key, StorageScope.PROFILE) ?? "";
    try {
      const obj = JSON.parse(raw);
      if (dom.Dimension.is(obj)) {
        return dom.Dimension.lift(obj);
      }
    } catch {
    }
    return void 0;
  }
  store(size) {
    this._service.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  reset() {
    this._service.remove(this._key, StorageScope.PROFILE);
  }
}
let SuggestWidget = class {
  constructor(editor, _storageService, _contextKeyService, _themeService, instantiationService) {
    this.editor = editor;
    this._storageService = _storageService;
    this._state = 0 /* Hidden */;
    this._isAuto = false;
    this._loadingTimeout = new MutableDisposable();
    this._pendingLayout = new MutableDisposable();
    this._pendingShowDetails = new MutableDisposable();
    this._ignoreFocusEvents = false;
    this._forceRenderingAbove = false;
    this._explainMode = false;
    this._showTimeout = new TimeoutTimer();
    this._disposables = new DisposableStore();
    this._onDidSelect = new PauseableEmitter();
    this._onDidFocus = new PauseableEmitter();
    this._onDidHide = new Emitter();
    this._onDidShow = new Emitter();
    this.onDidSelect = this._onDidSelect.event;
    this.onDidFocus = this._onDidFocus.event;
    this.onDidHide = this._onDidHide.event;
    this.onDidShow = this._onDidShow.event;
    this._onDetailsKeydown = new Emitter();
    this.onDetailsKeyDown = this._onDetailsKeydown.event;
    this.element = new ResizableHTMLElement();
    this.element.domNode.classList.add("editor-widget", "suggest-widget");
    this._contentWidget = new SuggestContentWidget(this, editor);
    this._persistedSize = new PersistedWidgetSize(_storageService, editor);
    class ResizeState {
      constructor(persistedSize, currentSize, persistHeight = false, persistWidth = false) {
        this.persistedSize = persistedSize;
        this.currentSize = currentSize;
        this.persistHeight = persistHeight;
        this.persistWidth = persistWidth;
      }
    }
    let state;
    this._disposables.add(this.element.onDidWillResize(() => {
      this._contentWidget.lockPreference();
      state = new ResizeState(this._persistedSize.restore(), this.element.size);
    }));
    this._disposables.add(this.element.onDidResize((e) => {
      this._resize(e.dimension.width, e.dimension.height);
      if (state) {
        state.persistHeight = state.persistHeight || !!e.north || !!e.south;
        state.persistWidth = state.persistWidth || !!e.east || !!e.west;
      }
      if (!e.done) {
        return;
      }
      if (state) {
        const { itemHeight, defaultSize } = this.getLayoutInfo();
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
      this._contentWidget.unlockPreference();
      state = void 0;
    }));
    this._messageElement = dom.append(this.element.domNode, dom.$(".message"));
    this._listElement = dom.append(this.element.domNode, dom.$(".tree"));
    const details = this._disposables.add(instantiationService.createInstance(SuggestDetailsWidget, this.editor));
    details.onDidClose(() => this.toggleDetails(), this, this._disposables);
    this._details = new SuggestDetailsOverlay(details, this.editor);
    const applyIconStyle = () => this.element.domNode.classList.toggle("no-icons", !this.editor.getOption(EditorOption.suggest).showIcons);
    applyIconStyle();
    const applyFitWidthStyle = () => this.element.domNode.classList.toggle("fit-width-to-details", this.editor.getOption(EditorOption.suggest).fitWidthToDetails);
    applyFitWidthStyle();
    const renderer = instantiationService.createInstance(ItemRenderer, this.editor);
    this._disposables.add(renderer);
    this._disposables.add(renderer.onDidToggleDetails(() => this.toggleDetails()));
    this._list = new List("SuggestWidget", this._listElement, {
      getHeight: (_element) => this.getLayoutInfo().itemHeight,
      getTemplateId: (_element) => "suggestion"
    }, [renderer], {
      alwaysConsumeMouseWheel: true,
      useShadows: false,
      mouseSupport: false,
      multipleSelectionSupport: false,
      accessibilityProvider: {
        getRole: () => isWindows ? "listitem" : "option",
        getWidgetAriaLabel: () => nls.localize("suggest", "Suggest"),
        getWidgetRole: () => "listbox",
        getAriaLabel: (item) => {
          let label = item.textLabel;
          const kindLabel = CompletionItemKinds.toLabel(item.completion.kind);
          if (typeof item.completion.label !== "string") {
            const { detail: detail2, description } = item.completion.label;
            if (detail2 && description) {
              label = nls.localize("label.full", "{0} {1}, {2}, {3}", label, detail2, description, kindLabel);
            } else if (detail2) {
              label = nls.localize("label.detail", "{0} {1}, {2}", label, detail2, kindLabel);
            } else if (description) {
              label = nls.localize("label.desc", "{0}, {1}, {2}", label, description, kindLabel);
            }
          } else {
            label = nls.localize("label", "{0}, {1}", label, kindLabel);
          }
          if (!item.isResolved || !this._isDetailsVisible()) {
            return label;
          }
          const { documentation, detail } = item.completion;
          const docs = strings.format(
            "{0}{1}",
            detail || "",
            documentation ? typeof documentation === "string" ? documentation : documentation.value : ""
          );
          return nls.localize("ariaCurrenttSuggestionReadDetails", "{0}, docs: {1}", label, docs);
        }
      }
    });
    this._list.style(getListStyles({
      listInactiveFocusBackground: editorSuggestWidgetSelectedBackground,
      listInactiveFocusOutline: editorSuggestWidgetFocusOutline
    }));
    this._status = instantiationService.createInstance(SuggestWidgetStatus, this.element.domNode, suggestWidgetStatusbarMenu, void 0);
    const applyStatusBarStyle = () => this.element.domNode.classList.toggle("with-status-bar", this.editor.getOption(EditorOption.suggest).showStatusBar);
    applyStatusBarStyle();
    this._disposables.add(this._list.onMouseDown((e) => this._onListMouseDownOrTap(e)));
    this._disposables.add(this._list.onTap((e) => this._onListMouseDownOrTap(e)));
    this._disposables.add(this._list.onDidChangeSelection((e) => this._onListSelection(e)));
    this._disposables.add(this._list.onDidChangeFocus((e) => this._onListFocus(e)));
    this._disposables.add(this.editor.onDidChangeCursorSelection(() => this._onCursorSelectionChanged()));
    this._disposables.add(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.suggest)) {
        applyStatusBarStyle();
        applyIconStyle();
        applyFitWidthStyle();
      }
      if (this._completionModel && (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.suggestFontSize) || e.hasChanged(EditorOption.suggestLineHeight))) {
        this._list.splice(0, this._list.length, this._completionModel.items);
      }
    }));
    this._ctxSuggestWidgetVisible = SuggestContext.Visible.bindTo(_contextKeyService);
    this._ctxSuggestWidgetDetailsVisible = SuggestContext.DetailsVisible.bindTo(_contextKeyService);
    this._ctxSuggestWidgetMultipleSuggestions = SuggestContext.MultipleSuggestions.bindTo(_contextKeyService);
    this._ctxSuggestWidgetHasFocusedSuggestion = SuggestContext.HasFocusedSuggestion.bindTo(_contextKeyService);
    this._ctxSuggestWidgetDetailsFocused = SuggestContext.DetailsFocused.bindTo(_contextKeyService);
    const detailsFocusTracker = dom.trackFocus(this._details.widget.domNode);
    this._disposables.add(detailsFocusTracker);
    this._disposables.add(detailsFocusTracker.onDidFocus(() => this._ctxSuggestWidgetDetailsFocused.set(true)));
    this._disposables.add(detailsFocusTracker.onDidBlur(() => this._ctxSuggestWidgetDetailsFocused.set(false)));
    this._disposables.add(dom.addStandardDisposableListener(this._details.widget.domNode, "keydown", (e) => {
      this._onDetailsKeydown.fire(e);
    }));
    this._disposables.add(this.editor.onMouseDown((e) => this._onEditorMouseDown(e)));
  }
  dispose() {
    this._details.widget.dispose();
    this._details.dispose();
    this._list.dispose();
    this._status.dispose();
    this._disposables.dispose();
    this._loadingTimeout.dispose();
    this._pendingLayout.dispose();
    this._pendingShowDetails.dispose();
    this._showTimeout.dispose();
    this._contentWidget.dispose();
    this.element.dispose();
    this._onDidSelect.dispose();
    this._onDidFocus.dispose();
    this._onDidHide.dispose();
    this._onDidShow.dispose();
    this._onDetailsKeydown.dispose();
  }
  _onEditorMouseDown(mouseEvent) {
    if (this._details.widget.domNode.contains(mouseEvent.target.element)) {
      this._details.widget.domNode.focus();
    } else {
      if (this.element.domNode.contains(mouseEvent.target.element)) {
        this.editor.focus();
      }
    }
  }
  _onCursorSelectionChanged() {
    if (this._state !== 0 /* Hidden */) {
      this._contentWidget.layout();
    }
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
      this.editor.focus();
    }
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
      }
      this.editor.setAriaOptions({ activeDescendant: void 0 });
      this._ctxSuggestWidgetHasFocusedSuggestion.set(false);
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
      this._currentSuggestionDetails = createCancelablePromise(async (token) => {
        const loading = disposableTimeout(() => {
          if (this._isDetailsVisible()) {
            this._showDetails(true, false);
          }
        }, 250);
        const sub = token.onCancellationRequested(() => loading.dispose());
        try {
          return await item.resolve(token);
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
        this.editor.setAriaOptions({ activeDescendant: this._list.getElementID(index) });
      }).catch(onUnexpectedError);
    }
    this._onDidFocus.fire({ item, index, model: this._completionModel });
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
        dom.hide(this._messageElement, this._listElement, this._status.element);
        this._details.hide(true);
        this._status.hide();
        this._contentWidget.hide();
        this._ctxSuggestWidgetVisible.reset();
        this._ctxSuggestWidgetMultipleSuggestions.reset();
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
        this._messageElement.textContent = SuggestWidget.LOADING_MESSAGE;
        dom.hide(this._listElement, this._status.element);
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SuggestWidget.LOADING_MESSAGE);
        break;
      case 2 /* Empty */:
        this.element.domNode.classList.add("message");
        this._messageElement.textContent = SuggestWidget.NO_SUGGESTIONS_MESSAGE;
        dom.hide(this._listElement, this._status.element);
        dom.show(this._messageElement);
        this._details.hide();
        this._show();
        this._focusedItem = void 0;
        status(SuggestWidget.NO_SUGGESTIONS_MESSAGE);
        break;
      case 3 /* Open */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._show();
        break;
      case 4 /* Frozen */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._show();
        break;
      case 5 /* Details */:
        dom.hide(this._messageElement);
        dom.show(this._listElement, this._status.element);
        this._details.show();
        this._show();
        this._details.widget.focus();
        break;
    }
  }
  _show() {
    this._status.show();
    this._contentWidget.show();
    this._layout(this._persistedSize.restore());
    this._ctxSuggestWidgetVisible.set(true);
    this._showTimeout.cancelAndSet(() => {
      this.element.domNode.classList.add("visible");
      this._onDidShow.fire(this);
    }, 100);
  }
  showTriggered(auto, delay) {
    if (this._state !== 0 /* Hidden */) {
      return;
    }
    this._contentWidget.setPosition(this.editor.getPosition());
    this._isAuto = !!auto;
    if (!this._isAuto) {
      this._loadingTimeout.value = disposableTimeout(() => this._setState(1 /* Loading */), delay);
    }
  }
  showSuggestions(completionModel, selectionIndex, isFrozen, isAuto, noFocus) {
    this._contentWidget.setPosition(this.editor.getPosition());
    this._loadingTimeout.clear();
    this._currentSuggestionDetails?.cancel();
    this._currentSuggestionDetails = void 0;
    if (this._completionModel !== completionModel) {
      this._completionModel = completionModel;
    }
    if (isFrozen && this._state !== 2 /* Empty */ && this._state !== 0 /* Hidden */) {
      this._setState(4 /* Frozen */);
      return;
    }
    const visibleCount = this._completionModel.items.length;
    const isEmpty = visibleCount === 0;
    this._ctxSuggestWidgetMultipleSuggestions.set(visibleCount > 1);
    if (isEmpty) {
      this._setState(isAuto ? 0 /* Hidden */ : 2 /* Empty */);
      this._completionModel = void 0;
      return;
    }
    this._focusedItem = void 0;
    this._onDidFocus.pause();
    this._onDidSelect.pause();
    try {
      this._list.splice(0, this._list.length, this._completionModel.items);
      this._setState(isFrozen ? 4 /* Frozen */ : 3 /* Open */);
      this._list.reveal(selectionIndex, 0, selectionIndex === 0 ? 0 : this.getLayoutInfo().itemHeight * 0.33);
      this._list.setFocus(noFocus ? [] : [selectionIndex]);
    } finally {
      this._onDidFocus.resume();
      this._onDidSelect.resume();
    }
    this._pendingLayout.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.element.domNode), () => {
      this._pendingLayout.clear();
      this._layout(this.element.size);
      this._details.widget.domNode.classList.remove("focused");
    });
  }
  focusSelected() {
    if (this._list.length > 0) {
      this._list.setFocus([0]);
    }
  }
  selectNextPage() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.pageDown();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusNextPage();
        return true;
    }
  }
  selectNext() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusNext(1, true);
        return true;
    }
  }
  selectLast() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.scrollBottom();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusLast();
        return true;
    }
  }
  selectPreviousPage() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.pageUp();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusPreviousPage();
        return true;
    }
  }
  selectPrevious() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusPrevious(1, true);
        return false;
    }
  }
  selectFirst() {
    switch (this._state) {
      case 0 /* Hidden */:
        return false;
      case 5 /* Details */:
        this._details.widget.scrollTop();
        return true;
      case 1 /* Loading */:
        return !this._isAuto;
      default:
        this._list.focusFirst();
        return true;
    }
  }
  getFocusedItem() {
    if (this._state !== 0 /* Hidden */ && this._state !== 2 /* Empty */ && this._state !== 1 /* Loading */ && this._completionModel && this._list.getFocus().length > 0) {
      return {
        item: this._list.getFocusedElements()[0],
        index: this._list.getFocus()[0],
        model: this._completionModel
      };
    }
    return void 0;
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
      this._ctxSuggestWidgetDetailsVisible.set(false);
      this._setDetailsVisible(false);
      this._details.hide();
      this.element.domNode.classList.remove("shows-details");
    } else if ((canExpandCompletionItem(this._list.getFocusedElements()[0]) || this._explainMode) && (this._state === 3 /* Open */ || this._state === 5 /* Details */ || this._state === 4 /* Frozen */)) {
      this._ctxSuggestWidgetDetailsVisible.set(true);
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
        this.editor.focus();
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
  resetPersistedSize() {
    this._persistedSize.reset();
  }
  hideWidget() {
    this._pendingLayout.clear();
    this._pendingShowDetails.clear();
    this._loadingTimeout.clear();
    this._setState(0 /* Hidden */);
    this._onDidHide.fire(this);
    this.element.clearSashHoverState();
    const dim = this._persistedSize.restore();
    const minPersistedHeight = Math.ceil(this.getLayoutInfo().itemHeight * 4.3);
    if (dim && dim.height < minPersistedHeight) {
      this._persistedSize.store(dim.with(void 0, minPersistedHeight));
    }
  }
  isFrozen() {
    return this._state === 4 /* Frozen */;
  }
  _afterRender(position) {
    if (position === null) {
      if (this._isDetailsVisible()) {
        this._details.hide();
      }
      return;
    }
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      return;
    }
    if (this._isDetailsVisible() && !this._details.widget.isEmpty) {
      this._details.show();
    }
    this._positionDetails();
  }
  _layout(size) {
    if (!this.editor.hasModel()) {
      return;
    }
    if (!this.editor.getDomNode()) {
      return;
    }
    const bodyBox = dom.getClientArea(this.element.domNode.ownerDocument.body);
    const info = this.getLayoutInfo();
    if (!size) {
      size = info.defaultSize;
    }
    let height = size.height;
    let width = size.width;
    this._status.element.style.height = `${info.itemHeight}px`;
    if (this._state === 2 /* Empty */ || this._state === 1 /* Loading */) {
      height = info.itemHeight + info.borderHeight;
      width = info.defaultSize.width / 2;
      this.element.enableSashes(false, false, false, false);
      this.element.minSize = this.element.maxSize = new dom.Dimension(width, height);
      this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
    } else {
      const maxWidth = bodyBox.width - info.borderHeight - 2 * info.horizontalPadding;
      if (width > maxWidth) {
        width = maxWidth;
      }
      let preferredWidth = this._completionModel ? this._completionModel.stats.pLabelLen * info.typicalHalfwidthCharacterWidth : width;
      if (this.editor.getOption(EditorOption.suggest).fitWidthToDetails && this._completionModel && !this._persistedSize.restore()) {
        const cap = Math.min(maxWidth, this.editor.getLayoutInfo().width);
        const fitWidth = Math.min(cap, this._measureContentWidth(info));
        width = Math.max(width, fitWidth);
        preferredWidth = Math.max(preferredWidth, fitWidth);
      }
      const fullHeight = info.statusBarHeight + this._list.contentHeight + info.borderHeight;
      const minHeight = info.itemHeight + info.statusBarHeight;
      const editorBox = dom.getDomNodePagePosition(this.editor.getDomNode());
      const cursorBox = this.editor.getScrolledVisiblePosition(this.editor.getPosition());
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
        this._contentWidget.setPreference(ContentWidgetPositionPreference.ABOVE);
        this.element.enableSashes(true, true, false, false);
        maxHeight = maxHeightAbove;
      } else {
        this._contentWidget.setPreference(ContentWidgetPositionPreference.BELOW);
        this.element.enableSashes(false, true, true, false);
        maxHeight = maxHeightBelow;
      }
      this.element.preferredSize = new dom.Dimension(preferredWidth, info.defaultSize.height);
      this.element.maxSize = new dom.Dimension(maxWidth, maxHeight);
      this.element.minSize = new dom.Dimension(220, minHeight);
      this._cappedHeight = height === fullHeight ? { wanted: this._cappedHeight?.wanted ?? size.height, capped: height } : void 0;
    }
    this._resize(width, height);
  }
  _resize(width, height) {
    const { width: maxWidth, height: maxHeight } = this.element.maxSize;
    width = Math.min(maxWidth, width);
    height = Math.min(maxHeight, height);
    const { statusBarHeight } = this.getLayoutInfo();
    this._list.layout(height - statusBarHeight, width);
    this._listElement.style.height = `${height - statusBarHeight}px`;
    this.element.layout(height, width);
    this._contentWidget.layout();
    this._positionDetails();
  }
  _positionDetails() {
    if (this._isDetailsVisible()) {
      this._details.placeAtAnchor(this.element.domNode, this._contentWidget.getPosition()?.preference[0] === ContentWidgetPositionPreference.BELOW);
    }
  }
  /**
   * Measures the pixel width needed to show the widest item's label together with
   * its inline detail text (signature + description), plus the surrounding chrome
   * (icon, inter-column gap, read-more affordance, padding and scrollbar). Cached
   * per completion model.
   */
  _measureContentWidth(info) {
    const model = this._completionModel;
    if (!model) {
      return 0;
    }
    if (this._fitContentWidth?.model === model) {
      return this._fitContentWidth.width;
    }
    if (this._measureContext === void 0) {
      this._measureContext = this.element.domNode.ownerDocument.createElement("canvas").getContext("2d");
    }
    let maxTextWidth;
    if (this._measureContext) {
      const options = this.editor.getOptions();
      const fontInfo = options.get(EditorOption.fontInfo);
      const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
      this._measureContext.font = `${fontInfo.fontWeight} ${fontSize}px ${fontInfo.getMassagedFontFamily()}`;
      maxTextWidth = 0;
      for (const item of model.items) {
        const { completion } = item;
        let text = item.textLabel;
        if (typeof completion.label === "string") {
          text += completion.detail ?? "";
        } else {
          text += (completion.label.detail ?? "") + (completion.label.description ?? "");
        }
        maxTextWidth = Math.max(maxTextWidth, this._measureContext.measureText(text).width);
      }
    } else {
      maxTextWidth = model.stats.pLabelLen * info.typicalHalfwidthCharacterWidth;
    }
    const chrome = 2 * info.itemHeight + 2 * info.horizontalPadding + 20;
    const width = maxTextWidth + chrome;
    this._fitContentWidth = { model, width };
    return width;
  }
  getLayoutInfo() {
    const fontInfo = this.editor.getOption(EditorOption.fontInfo);
    const itemHeight = clamp(this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1e3);
    const statusBarHeight = !this.editor.getOption(EditorOption.suggest).showStatusBar || this._state === 2 /* Empty */ || this._state === 1 /* Loading */ ? 0 : itemHeight;
    const borderWidth = this._details.widget.getLayoutInfo().borderWidth;
    const borderHeight = 2 * borderWidth;
    return {
      itemHeight,
      statusBarHeight,
      borderWidth,
      borderHeight,
      typicalHalfwidthCharacterWidth: fontInfo.typicalHalfwidthCharacterWidth,
      verticalPadding: 22,
      horizontalPadding: 14,
      defaultSize: new dom.Dimension(430, statusBarHeight + 12 * itemHeight)
    };
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
SuggestWidget.LOADING_MESSAGE = nls.localize("suggestWidget.loading", "Loading...");
SuggestWidget.NO_SUGGESTIONS_MESSAGE = nls.localize("suggestWidget.noSuggestions", "No suggestions.");
SuggestWidget = __decorateClass([
  __decorateParam(1, IStorageService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IInstantiationService)
], SuggestWidget);
class SuggestContentWidget {
  constructor(_widget, _editor) {
    this._widget = _widget;
    this._editor = _editor;
    this.allowEditorOverflow = true;
    this.suppressMouseDown = false;
    this._preferenceLocked = false;
    this._added = false;
    this._hidden = false;
  }
  dispose() {
    if (this._added) {
      this._added = false;
      this._editor.removeContentWidget(this);
    }
  }
  getId() {
    return "editor.widget.suggestWidget";
  }
  getDomNode() {
    return this._widget.element.domNode;
  }
  show() {
    this._hidden = false;
    if (!this._added) {
      this._added = true;
      this._editor.addContentWidget(this);
    }
  }
  hide() {
    if (!this._hidden) {
      this._hidden = true;
      this.layout();
    }
  }
  layout() {
    this._editor.layoutContentWidget(this);
  }
  getPosition() {
    if (this._hidden || !this._position || !this._preference) {
      return null;
    }
    return {
      position: this._position,
      preference: [this._preference]
    };
  }
  beforeRender() {
    const { height, width } = this._widget.element.size;
    const { borderWidth, horizontalPadding } = this._widget.getLayoutInfo();
    return new dom.Dimension(width + 2 * borderWidth + horizontalPadding, height + 2 * borderWidth);
  }
  afterRender(position) {
    this._widget._afterRender(position);
  }
  setPreference(preference) {
    if (!this._preferenceLocked) {
      this._preference = preference;
    }
  }
  lockPreference() {
    this._preferenceLocked = true;
  }
  unlockPreference() {
    this._preferenceLocked = false;
  }
  setPosition(position) {
    this._position = position;
  }
}
export {
  SuggestContentWidget,
  SuggestWidget,
  editorSuggestWidgetFocusOutline,
  editorSuggestWidgetForeground,
  editorSuggestWidgetSelectedBackground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb2RpY29ucy9jb2RpY29uU3R5bGVzLmpzJzsgLy8gVGhlIGNvZGljb24gc3ltYm9sIHN0eWxlcyBhcmUgZGVmaW5lZCBoZXJlIGFuZCBtdXN0IGJlIGxvYWRlZFxuaW1wb3J0IHsgSUxpc3RFdmVudCwgSUxpc3RHZXN0dXJlRXZlbnQsIElMaXN0TW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgVGltZW91dFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zdWdnZXN0LmNzcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24sIElFZGl0b3JNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0V2lkZ2V0U3RhdHVzIH0gZnJvbSAnLi9zdWdnZXN0V2lkZ2V0U3RhdHVzLmpzJztcbmltcG9ydCAnLi4vLi4vc3ltYm9sSWNvbnMvYnJvd3Nlci9zeW1ib2xJY29ucy5qcyc7IC8vIFRoZSBjb2RpY29uIHN5bWJvbCBjb2xvcnMgYXJlIGRlZmluZWQgaGVyZSBhbmQgbXVzdCBiZSBsb2FkZWQgdG8gZ2V0IGNvbG9yc1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgZWRpdG9yRm9yZWdyb3VuZCwgZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCwgZWRpdG9yV2lkZ2V0Qm9yZGVyLCBsaXN0Rm9jdXNIaWdobGlnaHRGb3JlZ3JvdW5kLCBsaXN0SGlnaGxpZ2h0Rm9yZWdyb3VuZCwgcXVpY2tJbnB1dExpc3RGb2N1c0JhY2tncm91bmQsIHF1aWNrSW5wdXRMaXN0Rm9jdXNGb3JlZ3JvdW5kLCBxdWlja0lucHV0TGlzdEZvY3VzSWNvbkZvcmVncm91bmQsIHJlZ2lzdGVyQ29sb3IsIHRyYW5zcGFyZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi9jb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgUmVzaXphYmxlSFRNTEVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmVzaXphYmxlL3Jlc2l6YWJsZS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbSwgQ29udGV4dCBhcyBTdWdnZXN0Q29udGV4dCwgc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUgfSBmcm9tICcuL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgY2FuRXhwYW5kQ29tcGxldGlvbkl0ZW0sIFN1Z2dlc3REZXRhaWxzT3ZlcmxheSwgU3VnZ2VzdERldGFpbHNXaWRnZXQgfSBmcm9tICcuL3N1Z2dlc3RXaWRnZXREZXRhaWxzLmpzJztcbmltcG9ydCB7IEl0ZW1SZW5kZXJlciB9IGZyb20gJy4vc3VnZ2VzdFdpZGdldFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGdldExpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbi8qKlxuICogU3VnZ2VzdCB3aWRnZXQgY29sb3JzXG4gKi9cbmNvbnN0IGVkaXRvclN1Z2dlc3RXaWRnZXRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5iYWNrZ3JvdW5kJywgZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0QmFja2dyb3VuZCcsICdCYWNrZ3JvdW5kIGNvbG9yIG9mIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5yZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LmJvcmRlcicsIGVkaXRvcldpZGdldEJvcmRlciwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0Qm9yZGVyJywgJ0JvcmRlciBjb2xvciBvZiB0aGUgc3VnZ2VzdCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGVkaXRvclN1Z2dlc3RXaWRnZXRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5mb3JlZ3JvdW5kJywgZWRpdG9yRm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5jb25zdCBlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5zZWxlY3RlZEZvcmVncm91bmQnLCB7IGRhcms6IHF1aWNrSW5wdXRMaXN0Rm9jdXNGb3JlZ3JvdW5kLCBsaWdodDogcXVpY2tJbnB1dExpc3RGb2N1c0ZvcmVncm91bmQsIGhjRGFyazogZWRpdG9yU3VnZ2VzdFdpZGdldEJhY2tncm91bmQsIGhjTGlnaHQ6IGVkaXRvclN1Z2dlc3RXaWRnZXRCYWNrZ3JvdW5kIH0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkRm9yZWdyb3VuZCcsICdGb3JlZ3JvdW5kIGNvbG9yIG9mIHRoZSBzZWxlY3RlZCBlbnRyeSBpbiB0aGUgc3VnZ2VzdCB3aWRnZXQuJykpO1xucmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5zZWxlY3RlZEljb25Gb3JlZ3JvdW5kJywgeyBkYXJrOiBxdWlja0lucHV0TGlzdEZvY3VzSWNvbkZvcmVncm91bmQsIGxpZ2h0OiBxdWlja0lucHV0TGlzdEZvY3VzSWNvbkZvcmVncm91bmQsIGhjRGFyazogZWRpdG9yU3VnZ2VzdFdpZGdldEJhY2tncm91bmQsIGhjTGlnaHQ6IGVkaXRvclN1Z2dlc3RXaWRnZXRCYWNrZ3JvdW5kIH0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkSWNvbkZvcmVncm91bmQnLCAnSWNvbiBmb3JlZ3JvdW5kIGNvbG9yIG9mIHRoZSBzZWxlY3RlZCBlbnRyeSBpbiB0aGUgc3VnZ2VzdCB3aWRnZXQuJykpO1xuZXhwb3J0IGNvbnN0IGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LnNlbGVjdGVkQmFja2dyb3VuZCcsIHsgZGFyazogcXVpY2tJbnB1dExpc3RGb2N1c0JhY2tncm91bmQsIGxpZ2h0OiBxdWlja0lucHV0TGlzdEZvY3VzQmFja2dyb3VuZCwgaGNEYXJrOiBlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9yZWdyb3VuZCwgaGNMaWdodDogZWRpdG9yU3VnZ2VzdFdpZGdldEZvcmVncm91bmQgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0U2VsZWN0ZWRCYWNrZ3JvdW5kJywgJ0JhY2tncm91bmQgY29sb3Igb2YgdGhlIHNlbGVjdGVkIGVudHJ5IGluIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5leHBvcnQgY29uc3QgZWRpdG9yU3VnZ2VzdFdpZGdldEZvY3VzT3V0bGluZSA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvclN1Z2dlc3RXaWRnZXQuZm9jdXNPdXRsaW5lJywgYWN0aXZlQ29udHJhc3RCb3JkZXIsIG5scy5sb2NhbGl6ZSgnZWRpdG9yU3VnZ2VzdFdpZGdldEZvY3VzT3V0bGluZScsICdPdXRsaW5lIGNvbG9yIG9mIHRoZSBmb2N1c2VkIChrZXlib2FyZC1uYXZpZ2F0ZWQpIGVudHJ5IGluIHRoZSBzdWdnZXN0IHdpZGdldC4nKSk7XG5yZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0LmhpZ2hsaWdodEZvcmVncm91bmQnLCBsaXN0SGlnaGxpZ2h0Rm9yZWdyb3VuZCwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0SGlnaGxpZ2h0Rm9yZWdyb3VuZCcsICdDb2xvciBvZiB0aGUgbWF0Y2ggaGlnaGxpZ2h0cyBpbiB0aGUgc3VnZ2VzdCB3aWRnZXQuJykpO1xucmVnaXN0ZXJDb2xvcignZWRpdG9yU3VnZ2VzdFdpZGdldC5mb2N1c0hpZ2hsaWdodEZvcmVncm91bmQnLCB7IGRhcms6IGxpc3RGb2N1c0hpZ2hsaWdodEZvcmVncm91bmQsIGxpZ2h0OiBsaXN0Rm9jdXNIaWdobGlnaHRGb3JlZ3JvdW5kLCBoY0Rhcms6IGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEZvcmVncm91bmQsIGhjTGlnaHQ6IGVkaXRvclN1Z2dlc3RXaWRnZXRTZWxlY3RlZEZvcmVncm91bmQgfSwgbmxzLmxvY2FsaXplKCdlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9jdXNIaWdobGlnaHRGb3JlZ3JvdW5kJywgJ0NvbG9yIG9mIHRoZSBtYXRjaCBoaWdobGlnaHRzIGluIHRoZSBzdWdnZXN0IHdpZGdldCB3aGVuIGFuIGl0ZW0gaXMgZm9jdXNlZC4nKSk7XG5yZWdpc3RlckNvbG9yKCdlZGl0b3JTdWdnZXN0V2lkZ2V0U3RhdHVzLmZvcmVncm91bmQnLCB0cmFuc3BhcmVudChlZGl0b3JTdWdnZXN0V2lkZ2V0Rm9yZWdyb3VuZCwgLjUpLCBubHMubG9jYWxpemUoJ2VkaXRvclN1Z2dlc3RXaWRnZXRTdGF0dXNGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0IHN0YXR1cy4nKSk7XG5cbmNvbnN0IGVudW0gU3RhdGUge1xuXHRIaWRkZW4sXG5cdExvYWRpbmcsXG5cdEVtcHR5LFxuXHRPcGVuLFxuXHRGcm96ZW4sXG5cdERldGFpbHMsXG5cdG9uRGV0YWlsc0tleURvd25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VsZWN0ZWRTdWdnZXN0aW9uIHtcblx0aXRlbTogQ29tcGxldGlvbkl0ZW07XG5cdGluZGV4OiBudW1iZXI7XG5cdG1vZGVsOiBDb21wbGV0aW9uTW9kZWw7XG59XG5cbmNsYXNzIFBlcnNpc3RlZFdpZGdldFNpemUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yXG5cdCkge1xuXHRcdHRoaXMuX2tleSA9IGBzdWdnZXN0V2lkZ2V0LnNpemUvJHtlZGl0b3IuZ2V0RWRpdG9yVHlwZSgpfS8ke2VkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldH1gO1xuXHR9XG5cblx0cmVzdG9yZSgpOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zZXJ2aWNlLmdldCh0aGlzLl9rZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSA/PyAnJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb2JqID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0aWYgKGRvbS5EaW1lbnNpb24uaXMob2JqKSkge1xuXHRcdFx0XHRyZXR1cm4gZG9tLkRpbWVuc2lvbi5saWZ0KG9iaik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHN0b3JlKHNpemU6IGRvbS5EaW1lbnNpb24pIHtcblx0XHR0aGlzLl9zZXJ2aWNlLnN0b3JlKHRoaXMuX2tleSwgSlNPTi5zdHJpbmdpZnkoc2l6ZSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmljZS5yZW1vdmUodGhpcy5fa2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RXaWRnZXQgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgTE9BRElOR19NRVNTQUdFOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXQubG9hZGluZycsIFwiTG9hZGluZy4uLlwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgTk9fU1VHR0VTVElPTlNfTUVTU0FHRTogc3RyaW5nID0gbmxzLmxvY2FsaXplKCdzdWdnZXN0V2lkZ2V0Lm5vU3VnZ2VzdGlvbnMnLCBcIk5vIHN1Z2dlc3Rpb25zLlwiKTtcblxuXHRwcml2YXRlIF9zdGF0ZTogU3RhdGUgPSBTdGF0ZS5IaWRkZW47XG5cdHByaXZhdGUgX2lzQXV0bzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2FkaW5nVGltZW91dCA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nTGF5b3V0ID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTaG93RGV0YWlscyA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRwcml2YXRlIF9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/OiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfZm9jdXNlZEl0ZW0/OiBDb21wbGV0aW9uSXRlbTtcblx0cHJpdmF0ZSBfaWdub3JlRm9jdXNFdmVudHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29tcGxldGlvbk1vZGVsPzogQ29tcGxldGlvbk1vZGVsO1xuXHRwcml2YXRlIF9jYXBwZWRIZWlnaHQ/OiB7IHdhbnRlZDogbnVtYmVyOyBjYXBwZWQ6IG51bWJlciB9O1xuXHRwcml2YXRlIF9mb3JjZVJlbmRlcmluZ0Fib3ZlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2V4cGxhaW5Nb2RlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX21lYXN1cmVDb250ZXh0PzogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEIHwgbnVsbDtcblx0cHJpdmF0ZSBfZml0Q29udGVudFdpZHRoPzogeyBtb2RlbDogQ29tcGxldGlvbk1vZGVsOyB3aWR0aDogbnVtYmVyIH07XG5cblx0cmVhZG9ubHkgZWxlbWVudDogUmVzaXphYmxlSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdEVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0OiBMaXN0PENvbXBsZXRpb25JdGVtPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzOiBTdWdnZXN0V2lkZ2V0U3RhdHVzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXRhaWxzOiBTdWdnZXN0RGV0YWlsc092ZXJsYXk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRlbnRXaWRnZXQ6IFN1Z2dlc3RDb250ZW50V2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJzaXN0ZWRTaXplOiBQZXJzaXN0ZWRXaWRnZXRTaXplO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eFN1Z2dlc3RXaWRnZXRWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldERldGFpbHNWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3R4U3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhTdWdnZXN0V2lkZ2V0SGFzRm9jdXNlZFN1Z2dlc3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc0ZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dUaW1lb3V0ID0gbmV3IFRpbWVvdXRUaW1lcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0ID0gbmV3IFBhdXNlYWJsZUVtaXR0ZXI8SVNlbGVjdGVkU3VnZ2VzdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IG5ldyBQYXVzZWFibGVFbWl0dGVyPElTZWxlY3RlZFN1Z2dlc3Rpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZSA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2hvdyA9IG5ldyBFbWl0dGVyPHRoaXM+KCk7XG5cblx0cmVhZG9ubHkgb25EaWRTZWxlY3Q6IEV2ZW50PElTZWxlY3RlZFN1Z2dlc3Rpb24+ID0gdGhpcy5fb25EaWRTZWxlY3QuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXM6IEV2ZW50PElTZWxlY3RlZFN1Z2dlc3Rpb24+ID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRIaWRlOiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkSGlkZS5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRTaG93OiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkU2hvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRldGFpbHNLZXlkb3duID0gbmV3IEVtaXR0ZXI8SUtleWJvYXJkRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGV0YWlsc0tleURvd246IEV2ZW50PElLZXlib2FyZEV2ZW50PiA9IHRoaXMuX29uRGV0YWlsc0tleWRvd24uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVsZW1lbnQgPSBuZXcgUmVzaXphYmxlSFRNTEVsZW1lbnQoKTtcblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdlZGl0b3Itd2lkZ2V0JywgJ3N1Z2dlc3Qtd2lkZ2V0Jyk7XG5cblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0ID0gbmV3IFN1Z2dlc3RDb250ZW50V2lkZ2V0KHRoaXMsIGVkaXRvcik7XG5cdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZSA9IG5ldyBQZXJzaXN0ZWRXaWRnZXRTaXplKF9zdG9yYWdlU2VydmljZSwgZWRpdG9yKTtcblxuXHRcdGNsYXNzIFJlc2l6ZVN0YXRlIHtcblx0XHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0XHRyZWFkb25seSBwZXJzaXN0ZWRTaXplOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWFkb25seSBjdXJyZW50U2l6ZTogZG9tLkRpbWVuc2lvbixcblx0XHRcdFx0cHVibGljIHBlcnNpc3RIZWlnaHQgPSBmYWxzZSxcblx0XHRcdFx0cHVibGljIHBlcnNpc3RXaWR0aCA9IGZhbHNlLFxuXHRcdFx0KSB7IH1cblx0XHR9XG5cblx0XHRsZXQgc3RhdGU6IFJlc2l6ZVN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmVsZW1lbnQub25EaWRXaWxsUmVzaXplKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbnRlbnRXaWRnZXQubG9ja1ByZWZlcmVuY2UoKTtcblx0XHRcdHN0YXRlID0gbmV3IFJlc2l6ZVN0YXRlKHRoaXMuX3BlcnNpc3RlZFNpemUucmVzdG9yZSgpLCB0aGlzLmVsZW1lbnQuc2l6ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmVsZW1lbnQub25EaWRSZXNpemUoZSA9PiB7XG5cblx0XHRcdHRoaXMuX3Jlc2l6ZShlLmRpbWVuc2lvbi53aWR0aCwgZS5kaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdHN0YXRlLnBlcnNpc3RIZWlnaHQgPSBzdGF0ZS5wZXJzaXN0SGVpZ2h0IHx8ICEhZS5ub3J0aCB8fCAhIWUuc291dGg7XG5cdFx0XHRcdHN0YXRlLnBlcnNpc3RXaWR0aCA9IHN0YXRlLnBlcnNpc3RXaWR0aCB8fCAhIWUuZWFzdCB8fCAhIWUud2VzdDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlLmRvbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0Ly8gb25seSBzdG9yZSB3aWR0aCBvciBoZWlnaHQgdmFsdWUgdGhhdCBoYXZlIGNoYW5nZWQgYW5kIGFsc29cblx0XHRcdFx0Ly8gb25seSBzdG9yZSBjaGFuZ2VzIHRoYXQgYXJlIGFib3ZlIGEgY2VydGFpbiB0aHJlc2hvbGRcblx0XHRcdFx0Y29uc3QgeyBpdGVtSGVpZ2h0LCBkZWZhdWx0U2l6ZSB9ID0gdGhpcy5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0XHRcdGNvbnN0IHRocmVzaG9sZCA9IE1hdGgucm91bmQoaXRlbUhlaWdodCAvIDIpO1xuXHRcdFx0XHRsZXQgeyB3aWR0aCwgaGVpZ2h0IH0gPSB0aGlzLmVsZW1lbnQuc2l6ZTtcblx0XHRcdFx0aWYgKCFzdGF0ZS5wZXJzaXN0SGVpZ2h0IHx8IE1hdGguYWJzKHN0YXRlLmN1cnJlbnRTaXplLmhlaWdodCAtIGhlaWdodCkgPD0gdGhyZXNob2xkKSB7XG5cdFx0XHRcdFx0aGVpZ2h0ID0gc3RhdGUucGVyc2lzdGVkU2l6ZT8uaGVpZ2h0ID8/IGRlZmF1bHRTaXplLmhlaWdodDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXN0YXRlLnBlcnNpc3RXaWR0aCB8fCBNYXRoLmFicyhzdGF0ZS5jdXJyZW50U2l6ZS53aWR0aCAtIHdpZHRoKSA8PSB0aHJlc2hvbGQpIHtcblx0XHRcdFx0XHR3aWR0aCA9IHN0YXRlLnBlcnNpc3RlZFNpemU/LndpZHRoID8/IGRlZmF1bHRTaXplLndpZHRoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RlZFNpemUuc3RvcmUobmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZXNldCB3b3JraW5nIHN0YXRlXG5cdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnVubG9ja1ByZWZlcmVuY2UoKTtcblx0XHRcdHN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21lc3NhZ2VFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQuZG9tTm9kZSwgZG9tLiQoJy5tZXNzYWdlJykpO1xuXHRcdHRoaXMuX2xpc3RFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQuZG9tTm9kZSwgZG9tLiQoJy50cmVlJykpO1xuXG5cdFx0Y29uc3QgZGV0YWlscyA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0RGV0YWlsc1dpZGdldCwgdGhpcy5lZGl0b3IpKTtcblx0XHRkZXRhaWxzLm9uRGlkQ2xvc2UoKCkgPT4gdGhpcy50b2dnbGVEZXRhaWxzKCksIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl9kZXRhaWxzID0gbmV3IFN1Z2dlc3REZXRhaWxzT3ZlcmxheShkZXRhaWxzLCB0aGlzLmVkaXRvcik7XG5cblx0XHRjb25zdCBhcHBseUljb25TdHlsZSA9ICgpID0+IHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ25vLWljb25zJywgIXRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuc2hvd0ljb25zKTtcblx0XHRhcHBseUljb25TdHlsZSgpO1xuXG5cdFx0Y29uc3QgYXBwbHlGaXRXaWR0aFN0eWxlID0gKCkgPT4gdGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZml0LXdpZHRoLXRvLWRldGFpbHMnLCB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLmZpdFdpZHRoVG9EZXRhaWxzKTtcblx0XHRhcHBseUZpdFdpZHRoU3R5bGUoKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSXRlbVJlbmRlcmVyLCB0aGlzLmVkaXRvcik7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVyKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIub25EaWRUb2dnbGVEZXRhaWxzKCgpID0+IHRoaXMudG9nZ2xlRGV0YWlscygpKSk7XG5cblx0XHR0aGlzLl9saXN0ID0gbmV3IExpc3QoJ1N1Z2dlc3RXaWRnZXQnLCB0aGlzLl9saXN0RWxlbWVudCwge1xuXHRcdFx0Z2V0SGVpZ2h0OiAoX2VsZW1lbnQ6IENvbXBsZXRpb25JdGVtKTogbnVtYmVyID0+IHRoaXMuZ2V0TGF5b3V0SW5mbygpLml0ZW1IZWlnaHQsXG5cdFx0XHRnZXRUZW1wbGF0ZUlkOiAoX2VsZW1lbnQ6IENvbXBsZXRpb25JdGVtKTogc3RyaW5nID0+ICdzdWdnZXN0aW9uJ1xuXHRcdH0sIFtyZW5kZXJlcl0sIHtcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRSb2xlOiAoKSA9PiBpc1dpbmRvd3MgPyAnbGlzdGl0ZW0nIDogJ29wdGlvbicsXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbmxzLmxvY2FsaXplKCdzdWdnZXN0JywgXCJTdWdnZXN0XCIpLFxuXHRcdFx0XHRnZXRXaWRnZXRSb2xlOiAoKSA9PiAnbGlzdGJveCcsXG5cdFx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW06IENvbXBsZXRpb25JdGVtKSA9PiB7XG5cblx0XHRcdFx0XHRsZXQgbGFiZWwgPSBpdGVtLnRleHRMYWJlbDtcblx0XHRcdFx0XHRjb25zdCBraW5kTGFiZWwgPSBDb21wbGV0aW9uSXRlbUtpbmRzLnRvTGFiZWwoaXRlbS5jb21wbGV0aW9uLmtpbmQpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaXRlbS5jb21wbGV0aW9uLmxhYmVsICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBkZXRhaWwsIGRlc2NyaXB0aW9uIH0gPSBpdGVtLmNvbXBsZXRpb24ubGFiZWw7XG5cdFx0XHRcdFx0XHRpZiAoZGV0YWlsICYmIGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbmxzLmxvY2FsaXplKCdsYWJlbC5mdWxsJywgJ3swfSB7MX0sIHsyfSwgezN9JywgbGFiZWwsIGRldGFpbCwgZGVzY3JpcHRpb24sIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGRldGFpbCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IG5scy5sb2NhbGl6ZSgnbGFiZWwuZGV0YWlsJywgJ3swfSB7MX0sIHsyfScsIGxhYmVsLCBkZXRhaWwsIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbmxzLmxvY2FsaXplKCdsYWJlbC5kZXNjJywgJ3swfSwgezF9LCB7Mn0nLCBsYWJlbCwgZGVzY3JpcHRpb24sIGtpbmRMYWJlbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxhYmVsID0gbmxzLmxvY2FsaXplKCdsYWJlbCcsICd7MH0sIHsxfScsIGxhYmVsLCBraW5kTGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWl0ZW0uaXNSZXNvbHZlZCB8fCAhdGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgeyBkb2N1bWVudGF0aW9uLCBkZXRhaWwgfSA9IGl0ZW0uY29tcGxldGlvbjtcblx0XHRcdFx0XHRjb25zdCBkb2NzID0gc3RyaW5ncy5mb3JtYXQoXG5cdFx0XHRcdFx0XHQnezB9ezF9Jyxcblx0XHRcdFx0XHRcdGRldGFpbCB8fCAnJyxcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb24gPyAodHlwZW9mIGRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnID8gZG9jdW1lbnRhdGlvbiA6IGRvY3VtZW50YXRpb24udmFsdWUpIDogJycpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYXJpYUN1cnJlbnR0U3VnZ2VzdGlvblJlYWREZXRhaWxzJywgXCJ7MH0sIGRvY3M6IHsxfVwiLCBsYWJlbCwgZG9jcyk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fbGlzdC5zdHlsZShnZXRMaXN0U3R5bGVzKHtcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogZWRpdG9yU3VnZ2VzdFdpZGdldFNlbGVjdGVkQmFja2dyb3VuZCxcblx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogZWRpdG9yU3VnZ2VzdFdpZGdldEZvY3VzT3V0bGluZVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0YXR1cyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3RXaWRnZXRTdGF0dXMsIHRoaXMuZWxlbWVudC5kb21Ob2RlLCBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBhcHBseVN0YXR1c0JhclN0eWxlID0gKCkgPT4gdGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnd2l0aC1zdGF0dXMtYmFyJywgdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5zaG93U3RhdHVzQmFyKTtcblx0XHRhcHBseVN0YXR1c0JhclN0eWxlKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbGlzdC5vbk1vdXNlRG93bihlID0+IHRoaXMuX29uTGlzdE1vdXNlRG93bk9yVGFwKGUpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xpc3Qub25UYXAoZSA9PiB0aGlzLl9vbkxpc3RNb3VzZURvd25PclRhcChlKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9saXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4gdGhpcy5fb25MaXN0U2VsZWN0aW9uKGUpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHRoaXMuX29uTGlzdEZvY3VzKGUpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKCgpID0+IHRoaXMuX29uQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnN1Z2dlc3QpKSB7XG5cdFx0XHRcdGFwcGx5U3RhdHVzQmFyU3R5bGUoKTtcblx0XHRcdFx0YXBwbHlJY29uU3R5bGUoKTtcblx0XHRcdFx0YXBwbHlGaXRXaWR0aFN0eWxlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29tcGxldGlvbk1vZGVsICYmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnN1Z2dlc3RGb250U2l6ZSkgfHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zdWdnZXN0TGluZUhlaWdodCkpKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoLCB0aGlzLl9jb21wbGV0aW9uTW9kZWwuaXRlbXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRWaXNpYmxlID0gU3VnZ2VzdENvbnRleHQuVmlzaWJsZS5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc1Zpc2libGUgPSBTdWdnZXN0Q29udGV4dC5EZXRhaWxzVmlzaWJsZS5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0TXVsdGlwbGVTdWdnZXN0aW9ucyA9IFN1Z2dlc3RDb250ZXh0Lk11bHRpcGxlU3VnZ2VzdGlvbnMuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uID0gU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24uYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldERldGFpbHNGb2N1c2VkID0gU3VnZ2VzdENvbnRleHQuRGV0YWlsc0ZvY3VzZWQuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBkZXRhaWxzRm9jdXNUcmFja2VyID0gZG9tLnRyYWNrRm9jdXModGhpcy5fZGV0YWlscy53aWRnZXQuZG9tTm9kZSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRldGFpbHNGb2N1c1RyYWNrZXIpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkZXRhaWxzRm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5fY3R4U3VnZ2VzdFdpZGdldERldGFpbHNGb2N1c2VkLnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkZXRhaWxzRm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc0ZvY3VzZWQuc2V0KGZhbHNlKSkpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kZXRhaWxzLndpZGdldC5kb21Ob2RlLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EZXRhaWxzS2V5ZG93bi5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlRG93bigoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHRoaXMuX29uRWRpdG9yTW91c2VEb3duKGUpKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kZXRhaWxzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9saXN0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGF0dXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9sb2FkaW5nVGltZW91dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0xheW91dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1Nob3dEZXRhaWxzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zaG93VGltZW91dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY29udGVudFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lbGVtZW50LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNlbGVjdC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRGb2N1cy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRIaWRlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFNob3cuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGV0YWlsc0tleWRvd24uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25FZGl0b3JNb3VzZURvd24obW91c2VFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGV0YWlscy53aWRnZXQuZG9tTm9kZS5jb250YWlucyhtb3VzZUV2ZW50LnRhcmdldC5lbGVtZW50KSkge1xuXHRcdFx0Ly8gQ2xpY2tpbmcgaW5zaWRlIGRldGFpbHNcblx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmRvbU5vZGUuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ2xpY2tpbmcgb3V0c2lkZSBkZXRhaWxzIGFuZCBpbnNpZGUgc3VnZ2VzdFxuXHRcdFx0aWYgKHRoaXMuZWxlbWVudC5kb21Ob2RlLmNvbnRhaW5zKG1vdXNlRXZlbnQudGFyZ2V0LmVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25DdXJzb3JTZWxlY3Rpb25DaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gU3RhdGUuSGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LmxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uTGlzdE1vdXNlRG93bk9yVGFwKGU6IElMaXN0TW91c2VFdmVudDxDb21wbGV0aW9uSXRlbT4gfCBJTGlzdEdlc3R1cmVFdmVudDxDb21wbGV0aW9uSXRlbT4pOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGUuZWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIGUuaW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gcHJldmVudCBzdGVhbGluZyBicm93c2VyIGZvY3VzIGZyb20gdGhlIGVkaXRvclxuXHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHR0aGlzLl9zZWxlY3QoZS5lbGVtZW50LCBlLmluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX29uTGlzdFNlbGVjdGlvbihlOiBJTGlzdEV2ZW50PENvbXBsZXRpb25JdGVtPik6IHZvaWQge1xuXHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fc2VsZWN0KGUuZWxlbWVudHNbMF0sIGUuaW5kZXhlc1swXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2VsZWN0KGl0ZW06IENvbXBsZXRpb25JdGVtLCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbk1vZGVsID0gdGhpcy5fY29tcGxldGlvbk1vZGVsO1xuXHRcdGlmIChjb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUoeyBpdGVtLCBpbmRleCwgbW9kZWw6IGNvbXBsZXRpb25Nb2RlbCB9KTtcblx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25MaXN0Rm9jdXMoZTogSUxpc3RFdmVudDxDb21wbGV0aW9uSXRlbT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faWdub3JlRm9jdXNFdmVudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLkRldGFpbHMpIHtcblx0XHRcdC8vIFRoaXMgY2FuIGhhcHBlbiB3aGVuIGZvY3VzIGlzIGluIHRoZSBkZXRhaWxzLXBhbmVsIGFuZCB3aGVuXG5cdFx0XHQvLyBhcnJvdyBrZXlzIGFyZSBwcmVzc2VkIHRvIHNlbGVjdCBuZXh0L3ByZXYgaXRlbXNcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLk9wZW4pO1xuXHRcdH1cblxuXHRcdGlmICghZS5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVkaXRvci5zZXRBcmlhT3B0aW9ucyh7IGFjdGl2ZURlc2NlbmRhbnQ6IHVuZGVmaW5lZCB9KTtcblx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbi5zZXQoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29tcGxldGlvbk1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3R4U3VnZ2VzdFdpZGdldEhhc0ZvY3VzZWRTdWdnZXN0aW9uLnNldCh0cnVlKTtcblx0XHRjb25zdCBpdGVtID0gZS5lbGVtZW50c1swXTtcblx0XHRjb25zdCBpbmRleCA9IGUuaW5kZXhlc1swXTtcblxuXHRcdGlmIChpdGVtICE9PSB0aGlzLl9mb2N1c2VkSXRlbSkge1xuXG5cdFx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IGl0ZW07XG5cblx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGluZGV4KTtcblxuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRjb25zdCBsb2FkaW5nID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dEZXRhaWxzKHRydWUsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDI1MCk7XG5cdFx0XHRcdGNvbnN0IHN1YiA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGxvYWRpbmcuZGlzcG9zZSgpKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgaXRlbS5yZXNvbHZlKHRva2VuKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRsb2FkaW5nLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoaW5kZXggPj0gdGhpcy5fbGlzdC5sZW5ndGggfHwgaXRlbSAhPT0gdGhpcy5fbGlzdC5lbGVtZW50KGluZGV4KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGl0ZW0gY2FuIGhhdmUgZXh0cmEgaW5mb3JtYXRpb24sIHNvIHJlLXJlbmRlclxuXHRcdFx0XHR0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKGluZGV4LCAxLCBbaXRlbV0pO1xuXHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0XHR0aGlzLl9pZ25vcmVGb2N1c0V2ZW50cyA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2RvY3Mtc2lkZScpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5lZGl0b3Iuc2V0QXJpYU9wdGlvbnMoeyBhY3RpdmVEZXNjZW5kYW50OiB0aGlzLl9saXN0LmdldEVsZW1lbnRJRChpbmRleCkgfSk7XG5cdFx0XHR9KS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gZW1pdCBhbiBldmVudFxuXHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSh7IGl0ZW0sIGluZGV4LCBtb2RlbDogdGhpcy5fY29tcGxldGlvbk1vZGVsIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U3RhdGUoc3RhdGU6IFN0YXRlKTogdm9pZCB7XG5cblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IHN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlID0gc3RhdGU7XG5cblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdmcm96ZW4nLCBzdGF0ZSA9PT0gU3RhdGUuRnJvemVuKTtcblx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdtZXNzYWdlJyk7XG5cblx0XHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0XHRjYXNlIFN0YXRlLkhpZGRlbjpcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQsIHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuaGlkZSh0cnVlKTtcblx0XHRcdFx0dGhpcy5fc3RhdHVzLmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fY29udGVudFdpZGdldC5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRWaXNpYmxlLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRNdWx0aXBsZVN1Z2dlc3Rpb25zLnJlc2V0KCk7XG5cdFx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbi5yZXNldCgpO1xuXHRcdFx0XHR0aGlzLl9zaG93VGltZW91dC5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdFx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCk7XG5cdFx0XHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9jYXBwZWRIZWlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2V4cGxhaW5Nb2RlID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Mb2FkaW5nOlxuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0XHRcdHRoaXMuX21lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gU3VnZ2VzdFdpZGdldC5MT0FESU5HX01FU1NBR0U7XG5cdFx0XHRcdGRvbS5oaWRlKHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX21lc3NhZ2VFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHN0YXR1cyhTdWdnZXN0V2lkZ2V0LkxPQURJTkdfTUVTU0FHRSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5FbXB0eTpcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbWVzc2FnZScpO1xuXHRcdFx0XHR0aGlzLl9tZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IFN1Z2dlc3RXaWRnZXQuTk9fU1VHR0VTVElPTlNfTUVTU0FHRTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbGlzdEVsZW1lbnQsIHRoaXMuX3N0YXR1cy5lbGVtZW50KTtcblx0XHRcdFx0ZG9tLnNob3codGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhdHVzKFN1Z2dlc3RXaWRnZXQuTk9fU1VHR0VTVElPTlNfTUVTU0FHRSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5PcGVuOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3Nob3coKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFN0YXRlLkZyb3plbjpcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fbWVzc2FnZUVsZW1lbnQpO1xuXHRcdFx0XHRkb20uc2hvdyh0aGlzLl9saXN0RWxlbWVudCwgdGhpcy5fc3RhdHVzLmVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTdGF0ZS5EZXRhaWxzOlxuXHRcdFx0XHRkb20uaGlkZSh0aGlzLl9tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX2xpc3RFbGVtZW50LCB0aGlzLl9zdGF0dXMuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMuc2hvdygpO1xuXHRcdFx0XHR0aGlzLl9zaG93KCk7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3coKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHVzLnNob3coKTtcblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0LnNob3coKTtcblx0XHR0aGlzLl9sYXlvdXQodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCkpO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuX3Nob3dUaW1lb3V0LmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0XHR0aGlzLl9vbkRpZFNob3cuZmlyZSh0aGlzKTtcblx0XHR9LCAxMDApO1xuXHR9XG5cblx0c2hvd1RyaWdnZXJlZChhdXRvOiBib29sZWFuLCBkZWxheTogbnVtYmVyKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5IaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29udGVudFdpZGdldC5zZXRQb3NpdGlvbih0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHR0aGlzLl9pc0F1dG8gPSAhIWF1dG87XG5cblx0XHRpZiAoIXRoaXMuX2lzQXV0bykge1xuXHRcdFx0dGhpcy5fbG9hZGluZ1RpbWVvdXQudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB0aGlzLl9zZXRTdGF0ZShTdGF0ZS5Mb2FkaW5nKSwgZGVsYXkpO1xuXHRcdH1cblx0fVxuXG5cdHNob3dTdWdnZXN0aW9ucyhjb21wbGV0aW9uTW9kZWw6IENvbXBsZXRpb25Nb2RlbCwgc2VsZWN0aW9uSW5kZXg6IG51bWJlciwgaXNGcm96ZW46IGJvb2xlYW4sIGlzQXV0bzogYm9vbGVhbiwgbm9Gb2N1czogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0dGhpcy5fY29udGVudFdpZGdldC5zZXRQb3NpdGlvbih0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHR0aGlzLl9sb2FkaW5nVGltZW91dC5jbGVhcigpO1xuXG5cdFx0dGhpcy5fY3VycmVudFN1Z2dlc3Rpb25EZXRhaWxzPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9jdXJyZW50U3VnZ2VzdGlvbkRldGFpbHMgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5fY29tcGxldGlvbk1vZGVsICE9PSBjb21wbGV0aW9uTW9kZWwpIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbCA9IGNvbXBsZXRpb25Nb2RlbDtcblx0XHR9XG5cblx0XHRpZiAoaXNGcm96ZW4gJiYgdGhpcy5fc3RhdGUgIT09IFN0YXRlLkVtcHR5ICYmIHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5IaWRkZW4pIHtcblx0XHRcdHRoaXMuX3NldFN0YXRlKFN0YXRlLkZyb3plbik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy5fY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aDtcblx0XHRjb25zdCBpc0VtcHR5ID0gdmlzaWJsZUNvdW50ID09PSAwO1xuXHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXRNdWx0aXBsZVN1Z2dlc3Rpb25zLnNldCh2aXNpYmxlQ291bnQgPiAxKTtcblxuXHRcdGlmIChpc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShpc0F1dG8gPyBTdGF0ZS5IaWRkZW4gOiBTdGF0ZS5FbXB0eSk7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uTW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZm9jdXNlZEl0ZW0gPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBjYWxsaW5nIGxpc3Quc3BsaWNlIHRyaWdnZXJzIGZvY3VzIGV2ZW50IHdoaWNoIHRoaXMgd2lkZ2V0IGZvcndhcmRzLiBUaGF0IGNhbiBsZWFkIHRvXG5cdFx0Ly8gc3VnZ2VzdGlvbnMgYmVpbmcgY2FuY2VsbGVkIGFuZCB0aGUgd2lkZ2V0IGJlaW5nIGNsZWFyZWQgKGFuZCBoaWRkZW4pLiBBbGwgdGhpcyBoYXBwZW5zXG5cdFx0Ly8gYmVmb3JlIHJldmVhbGluZyBhbmQgZm9jdXNpbmcgaXMgZG9uZSB3aGljaCBtZWFucyByZXZlYWxpbmcgYW5kIGZvY3VzaW5nIHdpbGwgZmFpbCB3aGVuXG5cdFx0Ly8gdGhleSBnZXQgcnVuLlxuXHRcdHRoaXMuX29uRGlkRm9jdXMucGF1c2UoKTtcblx0XHR0aGlzLl9vbkRpZFNlbGVjdC5wYXVzZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgdGhpcy5fY29tcGxldGlvbk1vZGVsLml0ZW1zKTtcblx0XHRcdHRoaXMuX3NldFN0YXRlKGlzRnJvemVuID8gU3RhdGUuRnJvemVuIDogU3RhdGUuT3Blbik7XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChzZWxlY3Rpb25JbmRleCwgMCwgc2VsZWN0aW9uSW5kZXggPT09IDAgPyAwIDogdGhpcy5nZXRMYXlvdXRJbmZvKCkuaXRlbUhlaWdodCAqIDAuMzMpO1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhub0ZvY3VzID8gW10gOiBbc2VsZWN0aW9uSW5kZXhdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5yZXN1bWUoKTtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LnJlc3VtZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQudmFsdWUgPSBkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGhpcy5lbGVtZW50LmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTGF5b3V0LmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9sYXlvdXQodGhpcy5lbGVtZW50LnNpemUpO1xuXHRcdFx0Ly8gUmVzZXQgZm9jdXMgYm9yZGVyXG5cdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHR9KTtcblx0fVxuXG5cdGZvY3VzU2VsZWN0ZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xpc3QubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdE5leHRQYWdlKCk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIFN0YXRlLkRldGFpbHM6XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LnBhZ2VEb3duKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Mb2FkaW5nOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2lzQXV0bztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNOZXh0UGFnZSgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRzZWxlY3ROZXh0KCk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5faXNBdXRvO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c05leHQoMSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdExhc3QoKTogYm9vbGVhbiB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y2FzZSBTdGF0ZS5IaWRkZW46XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdGNhc2UgU3RhdGUuRGV0YWlsczpcblx0XHRcdFx0dGhpcy5fZGV0YWlscy53aWRnZXQuc2Nyb2xsQm90dG9tKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Mb2FkaW5nOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2lzQXV0bztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNMYXN0KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdFByZXZpb3VzUGFnZSgpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3N0YXRlKSB7XG5cdFx0XHRjYXNlIFN0YXRlLkhpZGRlbjpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5EZXRhaWxzOlxuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5wYWdlVXAoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFN0YXRlLkxvYWRpbmc6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5faXNBdXRvO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5fbGlzdC5mb2N1c1ByZXZpb3VzUGFnZSgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRzZWxlY3RQcmV2aW91cygpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3N0YXRlKSB7XG5cdFx0XHRjYXNlIFN0YXRlLkhpZGRlbjpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBTdGF0ZS5Mb2FkaW5nOlxuXHRcdFx0XHRyZXR1cm4gIXRoaXMuX2lzQXV0bztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNQcmV2aW91cygxLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdEZpcnN0KCk6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNhc2UgU3RhdGUuSGlkZGVuOlxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRjYXNlIFN0YXRlLkRldGFpbHM6XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LnNjcm9sbFRvcCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgU3RhdGUuTG9hZGluZzpcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9pc0F1dG87XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzRmlyc3QoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9jdXNlZEl0ZW0oKTogSVNlbGVjdGVkU3VnZ2VzdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5IaWRkZW5cblx0XHRcdCYmIHRoaXMuX3N0YXRlICE9PSBTdGF0ZS5FbXB0eVxuXHRcdFx0JiYgdGhpcy5fc3RhdGUgIT09IFN0YXRlLkxvYWRpbmdcblx0XHRcdCYmIHRoaXMuX2NvbXBsZXRpb25Nb2RlbFxuXHRcdFx0JiYgdGhpcy5fbGlzdC5nZXRGb2N1cygpLmxlbmd0aCA+IDBcblx0XHQpIHtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXRlbTogdGhpcy5fbGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKVswXSxcblx0XHRcdFx0aW5kZXg6IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKVswXSxcblx0XHRcdFx0bW9kZWw6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHRvZ2dsZURldGFpbHNGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IFN0YXRlLkRldGFpbHMpIHtcblx0XHRcdC8vIFNob3VsZCByZXR1cm4gdGhlIGZvY3VzIHRvIHRoZSBsaXN0IGl0ZW0uXG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKSk7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5PcGVuKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5PcGVuKSB7XG5cdFx0XHR0aGlzLl9zZXRTdGF0ZShTdGF0ZS5EZXRhaWxzKTtcblx0XHRcdGlmICghdGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRGV0YWlscyh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlRGV0YWlscyhmb2N1c2VkOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEZXRhaWxzVmlzaWJsZSgpKSB7XG5cdFx0XHQvLyBoaWRlIGRldGFpbHMgd2lkZ2V0XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2N0eFN1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZS5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5fc2V0RGV0YWlsc1Zpc2libGUoZmFsc2UpO1xuXHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdzaG93cy1kZXRhaWxzJyk7XG5cblx0XHR9IGVsc2UgaWYgKChjYW5FeHBhbmRDb21wbGV0aW9uSXRlbSh0aGlzLl9saXN0LmdldEZvY3VzZWRFbGVtZW50cygpWzBdKSB8fCB0aGlzLl9leHBsYWluTW9kZSkgJiYgKHRoaXMuX3N0YXRlID09PSBTdGF0ZS5PcGVuIHx8IHRoaXMuX3N0YXRlID09PSBTdGF0ZS5EZXRhaWxzIHx8IHRoaXMuX3N0YXRlID09PSBTdGF0ZS5Gcm96ZW4pKSB7XG5cdFx0XHQvLyBzaG93IGRldGFpbHMgd2lkZ2V0IChpZmYgcG9zc2libGUpXG5cdFx0XHR0aGlzLl9jdHhTdWdnZXN0V2lkZ2V0RGV0YWlsc1Zpc2libGUuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fc2V0RGV0YWlsc1Zpc2libGUodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZm9jdXNlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0RldGFpbHMobG9hZGluZzogYm9vbGVhbiwgZm9jdXNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy52YWx1ZSA9IGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTaG93RGV0YWlscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fZGV0YWlscy5zaG93KCk7XG5cdFx0XHRsZXQgZGlkRm9jdXNEZXRhaWxzID0gZmFsc2U7XG5cdFx0XHRpZiAobG9hZGluZykge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5yZW5kZXJMb2FkaW5nKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLndpZGdldC5yZW5kZXJJdGVtKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0sIHRoaXMuX2V4cGxhaW5Nb2RlKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fZGV0YWlscy53aWRnZXQuaXNFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9wb3NpdGlvbkRldGFpbHMoKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc2hvd3MtZGV0YWlscycpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2RldGFpbHMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHRcdFx0ZGlkRm9jdXNEZXRhaWxzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZGV0YWlscy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWRpZEZvY3VzRGV0YWlscykge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0dG9nZ2xlRXhwbGFpbk1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xpc3QuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF0pIHtcblx0XHRcdHRoaXMuX2V4cGxhaW5Nb2RlID0gIXRoaXMuX2V4cGxhaW5Nb2RlO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVEZXRhaWxzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zaG93RGV0YWlscyhmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlc2V0UGVyc2lzdGVkU2l6ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc2V0KCk7XG5cdH1cblxuXHRoaWRlV2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdMYXlvdXQuY2xlYXIoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2hvd0RldGFpbHMuY2xlYXIoKTtcblx0XHR0aGlzLl9sb2FkaW5nVGltZW91dC5jbGVhcigpO1xuXG5cdFx0dGhpcy5fc2V0U3RhdGUoU3RhdGUuSGlkZGVuKTtcblx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSh0aGlzKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xlYXJTYXNoSG92ZXJTdGF0ZSgpO1xuXG5cdFx0Ly8gZW5zdXJlIHRoYXQgYSByZWFzb25hYmxlIHdpZGdldCBoZWlnaHQgaXMgcGVyc2lzdGVkIHNvIHRoYXRcblx0XHQvLyBhY2NpZGVudGlhbCBcInJlc2l6ZS10by1zaW5nbGUtaXRlbXNcIiBjYXNlcyBhcmVuJ3QgaGFwcGVuaW5nXG5cdFx0Y29uc3QgZGltID0gdGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCk7XG5cdFx0Y29uc3QgbWluUGVyc2lzdGVkSGVpZ2h0ID0gTWF0aC5jZWlsKHRoaXMuZ2V0TGF5b3V0SW5mbygpLml0ZW1IZWlnaHQgKiA0LjMpO1xuXHRcdGlmIChkaW0gJiYgZGltLmhlaWdodCA8IG1pblBlcnNpc3RlZEhlaWdodCkge1xuXHRcdFx0dGhpcy5fcGVyc2lzdGVkU2l6ZS5zdG9yZShkaW0ud2l0aCh1bmRlZmluZWQsIG1pblBlcnNpc3RlZEhlaWdodCkpO1xuXHRcdH1cblx0fVxuXG5cdGlzRnJvemVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRnJvemVuO1xuXHR9XG5cblx0X2FmdGVyUmVuZGVyKHBvc2l0aW9uOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgbnVsbCkge1xuXHRcdGlmIChwb3NpdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGV0YWlsc1Zpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLl9kZXRhaWxzLmhpZGUoKTsgLy90b2RvQGpyaWVrZW4gc29mdC1oaWRlXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcpIHtcblx0XHRcdC8vIG5vIHNwZWNpYWwgcG9zaXRpb25pbmcgd2hlbiB3aWRnZXQgaXNuJ3Qgc2hvd2luZyBsaXN0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkgJiYgIXRoaXMuX2RldGFpbHMud2lkZ2V0LmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX2RldGFpbHMuc2hvdygpO1xuXHRcdH1cblx0XHR0aGlzLl9wb3NpdGlvbkRldGFpbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2xheW91dChzaXplOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpKSB7XG5cdFx0XHQvLyBoYXBwZW5zIHdoZW4gcnVubmluZyB0ZXN0c1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHlCb3ggPSBkb20uZ2V0Q2xpZW50QXJlYSh0aGlzLmVsZW1lbnQuZG9tTm9kZS5vd25lckRvY3VtZW50LmJvZHkpO1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldExheW91dEluZm8oKTtcblxuXHRcdGlmICghc2l6ZSkge1xuXHRcdFx0c2l6ZSA9IGluZm8uZGVmYXVsdFNpemU7XG5cdFx0fVxuXG5cdFx0bGV0IGhlaWdodCA9IHNpemUuaGVpZ2h0O1xuXHRcdGxldCB3aWR0aCA9IHNpemUud2lkdGg7XG5cblx0XHQvLyBzdGF0dXMgYmFyXG5cdFx0dGhpcy5fc3RhdHVzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aW5mby5pdGVtSGVpZ2h0fXB4YDtcblxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gU3RhdGUuRW1wdHkgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkxvYWRpbmcpIHtcblx0XHRcdC8vIHNob3dpbmcgYSBtZXNzYWdlIG9ubHlcblx0XHRcdGhlaWdodCA9IGluZm8uaXRlbUhlaWdodCArIGluZm8uYm9yZGVySGVpZ2h0O1xuXHRcdFx0d2lkdGggPSBpbmZvLmRlZmF1bHRTaXplLndpZHRoIC8gMjtcblx0XHRcdHRoaXMuZWxlbWVudC5lbmFibGVTYXNoZXMoZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy5lbGVtZW50Lm1pblNpemUgPSB0aGlzLmVsZW1lbnQubWF4U2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0dGhpcy5fY29udGVudFdpZGdldC5zZXRQcmVmZXJlbmNlKENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1cpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHNob3dpbmcgaXRlbXNcblxuXHRcdFx0Ly8gd2lkdGggbWF0aFxuXHRcdFx0Y29uc3QgbWF4V2lkdGggPSBib2R5Qm94LndpZHRoIC0gaW5mby5ib3JkZXJIZWlnaHQgLSAyICogaW5mby5ob3Jpem9udGFsUGFkZGluZztcblx0XHRcdGlmICh3aWR0aCA+IG1heFdpZHRoKSB7XG5cdFx0XHRcdHdpZHRoID0gbWF4V2lkdGg7XG5cdFx0XHR9XG5cdFx0XHRsZXQgcHJlZmVycmVkV2lkdGggPSB0aGlzLl9jb21wbGV0aW9uTW9kZWwgPyB0aGlzLl9jb21wbGV0aW9uTW9kZWwuc3RhdHMucExhYmVsTGVuICogaW5mby50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggOiB3aWR0aDtcblxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuZml0V2lkdGhUb0RldGFpbHMgJiYgdGhpcy5fY29tcGxldGlvbk1vZGVsICYmICF0aGlzLl9wZXJzaXN0ZWRTaXplLnJlc3RvcmUoKSkge1xuXHRcdFx0XHQvLyBHcm93IHRvIGZpdCB0aGUgaW5saW5lIGRldGFpbCB0ZXh0LCBjYXBwZWQgYXQgdGhlIGVkaXRvciB3aWRnZXQncyB3aWR0aC4gUmVzcGVjdHMgYSB1c2VyLWRyYWdnZWQgc2l6ZS5cblx0XHRcdFx0Y29uc3QgY2FwID0gTWF0aC5taW4obWF4V2lkdGgsIHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCk7XG5cdFx0XHRcdGNvbnN0IGZpdFdpZHRoID0gTWF0aC5taW4oY2FwLCB0aGlzLl9tZWFzdXJlQ29udGVudFdpZHRoKGluZm8pKTtcblx0XHRcdFx0d2lkdGggPSBNYXRoLm1heCh3aWR0aCwgZml0V2lkdGgpO1xuXHRcdFx0XHRwcmVmZXJyZWRXaWR0aCA9IE1hdGgubWF4KHByZWZlcnJlZFdpZHRoLCBmaXRXaWR0aCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGhlaWdodCBtYXRoXG5cdFx0XHRjb25zdCBmdWxsSGVpZ2h0ID0gaW5mby5zdGF0dXNCYXJIZWlnaHQgKyB0aGlzLl9saXN0LmNvbnRlbnRIZWlnaHQgKyBpbmZvLmJvcmRlckhlaWdodDtcblx0XHRcdGNvbnN0IG1pbkhlaWdodCA9IGluZm8uaXRlbUhlaWdodCArIGluZm8uc3RhdHVzQmFySGVpZ2h0O1xuXHRcdFx0Y29uc3QgZWRpdG9yQm94ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5lZGl0b3IuZ2V0RG9tTm9kZSgpKTtcblx0XHRcdGNvbnN0IGN1cnNvckJveCA9IHRoaXMuZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0Y29uc3QgY3Vyc29yQm90dG9tID0gZWRpdG9yQm94LnRvcCArIGN1cnNvckJveC50b3AgKyBjdXJzb3JCb3guaGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0QmVsb3cgPSBNYXRoLm1pbihib2R5Qm94LmhlaWdodCAtIGN1cnNvckJvdHRvbSAtIGluZm8udmVydGljYWxQYWRkaW5nLCBmdWxsSGVpZ2h0KTtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZVNwYWNlQWJvdmUgPSBlZGl0b3JCb3gudG9wICsgY3Vyc29yQm94LnRvcCAtIGluZm8udmVydGljYWxQYWRkaW5nO1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0QWJvdmUgPSBNYXRoLm1pbihhdmFpbGFibGVTcGFjZUFib3ZlLCBmdWxsSGVpZ2h0KTtcblx0XHRcdGxldCBtYXhIZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1heChtYXhIZWlnaHRBYm92ZSwgbWF4SGVpZ2h0QmVsb3cpICsgaW5mby5ib3JkZXJIZWlnaHQsIGZ1bGxIZWlnaHQpO1xuXG5cdFx0XHRpZiAoaGVpZ2h0ID09PSB0aGlzLl9jYXBwZWRIZWlnaHQ/LmNhcHBlZCkge1xuXHRcdFx0XHQvLyBSZXN0b3JlIHRoZSBvbGQgKHdhbnRlZCkgaGVpZ2h0IHdoZW4gdGhlIGN1cnJlbnRcblx0XHRcdFx0Ly8gaGVpZ2h0IGlzIGNhcHBlZCB0byBmaXRcblx0XHRcdFx0aGVpZ2h0ID0gdGhpcy5fY2FwcGVkSGVpZ2h0LndhbnRlZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhlaWdodCA8IG1pbkhlaWdodCkge1xuXHRcdFx0XHRoZWlnaHQgPSBtaW5IZWlnaHQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGVpZ2h0ID4gbWF4SGVpZ2h0KSB7XG5cdFx0XHRcdGhlaWdodCA9IG1heEhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9yY2VSZW5kZXJpbmdBYm92ZVJlcXVpcmVkU3BhY2UgPSAxNTA7XG5cdFx0XHRpZiAoKGhlaWdodCA+IG1heEhlaWdodEJlbG93ICYmIG1heEhlaWdodEFib3ZlID4gbWF4SGVpZ2h0QmVsb3cpIHx8ICh0aGlzLl9mb3JjZVJlbmRlcmluZ0Fib3ZlICYmIGF2YWlsYWJsZVNwYWNlQWJvdmUgPiBmb3JjZVJlbmRlcmluZ0Fib3ZlUmVxdWlyZWRTcGFjZSkpIHtcblx0XHRcdFx0dGhpcy5fY29udGVudFdpZGdldC5zZXRQcmVmZXJlbmNlKENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZW5hYmxlU2FzaGVzKHRydWUsIHRydWUsIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdG1heEhlaWdodCA9IG1heEhlaWdodEFib3ZlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY29udGVudFdpZGdldC5zZXRQcmVmZXJlbmNlKENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1cpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuZW5hYmxlU2FzaGVzKGZhbHNlLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cdFx0XHRcdG1heEhlaWdodCA9IG1heEhlaWdodEJlbG93O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbGVtZW50LnByZWZlcnJlZFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihwcmVmZXJyZWRXaWR0aCwgaW5mby5kZWZhdWx0U2l6ZS5oZWlnaHQpO1xuXHRcdFx0dGhpcy5lbGVtZW50Lm1heFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihtYXhXaWR0aCwgbWF4SGVpZ2h0KTtcblx0XHRcdHRoaXMuZWxlbWVudC5taW5TaXplID0gbmV3IGRvbS5EaW1lbnNpb24oMjIwLCBtaW5IZWlnaHQpO1xuXG5cdFx0XHQvLyBLbm93IHdoZW4gdGhlIGhlaWdodCB3YXMgY2FwcGVkIHRvIGZpdCBhbmQgcmVtZW1iZXJcblx0XHRcdC8vIHRoZSB3YW50ZWQgaGVpZ2h0IGZvciBsYXRlci4gVGhpcyBpcyByZXF1aXJlZCB3aGVuIGdvaW5nXG5cdFx0XHQvLyBsZWZ0IHRvIHdpZGVuIHN1Z2dlc3Rpb25zLlxuXHRcdFx0dGhpcy5fY2FwcGVkSGVpZ2h0ID0gaGVpZ2h0ID09PSBmdWxsSGVpZ2h0XG5cdFx0XHRcdD8geyB3YW50ZWQ6IHRoaXMuX2NhcHBlZEhlaWdodD8ud2FudGVkID8/IHNpemUuaGVpZ2h0LCBjYXBwZWQ6IGhlaWdodCB9XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNpemUod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNpemUod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdGNvbnN0IHsgd2lkdGg6IG1heFdpZHRoLCBoZWlnaHQ6IG1heEhlaWdodCB9ID0gdGhpcy5lbGVtZW50Lm1heFNpemU7XG5cdFx0d2lkdGggPSBNYXRoLm1pbihtYXhXaWR0aCwgd2lkdGgpO1xuXHRcdGhlaWdodCA9IE1hdGgubWluKG1heEhlaWdodCwgaGVpZ2h0KTtcblxuXHRcdGNvbnN0IHsgc3RhdHVzQmFySGVpZ2h0IH0gPSB0aGlzLmdldExheW91dEluZm8oKTtcblx0XHR0aGlzLl9saXN0LmxheW91dChoZWlnaHQgLSBzdGF0dXNCYXJIZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl9saXN0RWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHQgLSBzdGF0dXNCYXJIZWlnaHR9cHhgO1xuXHRcdHRoaXMuZWxlbWVudC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5fY29udGVudFdpZGdldC5sYXlvdXQoKTtcblxuXHRcdHRoaXMuX3Bvc2l0aW9uRGV0YWlscygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9zaXRpb25EZXRhaWxzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0RldGFpbHNWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuX2RldGFpbHMucGxhY2VBdEFuY2hvcih0aGlzLmVsZW1lbnQuZG9tTm9kZSwgdGhpcy5fY29udGVudFdpZGdldC5nZXRQb3NpdGlvbigpPy5wcmVmZXJlbmNlWzBdID09PSBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJFTE9XKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTWVhc3VyZXMgdGhlIHBpeGVsIHdpZHRoIG5lZWRlZCB0byBzaG93IHRoZSB3aWRlc3QgaXRlbSdzIGxhYmVsIHRvZ2V0aGVyIHdpdGhcblx0ICogaXRzIGlubGluZSBkZXRhaWwgdGV4dCAoc2lnbmF0dXJlICsgZGVzY3JpcHRpb24pLCBwbHVzIHRoZSBzdXJyb3VuZGluZyBjaHJvbWVcblx0ICogKGljb24sIGludGVyLWNvbHVtbiBnYXAsIHJlYWQtbW9yZSBhZmZvcmRhbmNlLCBwYWRkaW5nIGFuZCBzY3JvbGxiYXIpLiBDYWNoZWRcblx0ICogcGVyIGNvbXBsZXRpb24gbW9kZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9tZWFzdXJlQ29udGVudFdpZHRoKGluZm86IFJldHVyblR5cGU8U3VnZ2VzdFdpZGdldFsnZ2V0TGF5b3V0SW5mbyddPik6IG51bWJlciB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9maXRDb250ZW50V2lkdGg/Lm1vZGVsID09PSBtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpdENvbnRlbnRXaWR0aC53aWR0aDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbWVhc3VyZUNvbnRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbWVhc3VyZUNvbnRleHQgPSB0aGlzLmVsZW1lbnQuZG9tTm9kZS5vd25lckRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpLmdldENvbnRleHQoJzJkJyk7XG5cdFx0fVxuXG5cdFx0bGV0IG1heFRleHRXaWR0aDogbnVtYmVyO1xuXHRcdGlmICh0aGlzLl9tZWFzdXJlQ29udGV4dCkge1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0XHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRcdGNvbnN0IGZvbnRTaXplID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN1Z2dlc3RGb250U2l6ZSkgfHwgZm9udEluZm8uZm9udFNpemU7XG5cdFx0XHR0aGlzLl9tZWFzdXJlQ29udGV4dC5mb250ID0gYCR7Zm9udEluZm8uZm9udFdlaWdodH0gJHtmb250U2l6ZX1weCAke2ZvbnRJbmZvLmdldE1hc3NhZ2VkRm9udEZhbWlseSgpfWA7XG5cdFx0XHRtYXhUZXh0V2lkdGggPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1vZGVsLml0ZW1zKSB7XG5cdFx0XHRcdGNvbnN0IHsgY29tcGxldGlvbiB9ID0gaXRlbTtcblx0XHRcdFx0bGV0IHRleHQgPSBpdGVtLnRleHRMYWJlbDtcblx0XHRcdFx0aWYgKHR5cGVvZiBjb21wbGV0aW9uLmxhYmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRleHQgKz0gY29tcGxldGlvbi5kZXRhaWwgPz8gJyc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGV4dCArPSAoY29tcGxldGlvbi5sYWJlbC5kZXRhaWwgPz8gJycpICsgKGNvbXBsZXRpb24ubGFiZWwuZGVzY3JpcHRpb24gPz8gJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1heFRleHRXaWR0aCA9IE1hdGgubWF4KG1heFRleHRXaWR0aCwgdGhpcy5fbWVhc3VyZUNvbnRleHQubWVhc3VyZVRleHQodGV4dCkud2lkdGgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDYW52YXMgaXMgdW5hdmFpbGFibGUgKGUuZy4gc29tZSB0ZXN0IGVudmlyb25tZW50cyk6IGZhbGwgYmFjayB0byBhIGNoYXItY291bnQgZXN0aW1hdGUuXG5cdFx0XHRtYXhUZXh0V2lkdGggPSBtb2RlbC5zdGF0cy5wTGFiZWxMZW4gKiBpbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHR9XG5cblx0XHQvLyBDaHJvbWUgYXJvdW5kIHRoZSB0ZXh0OiBpY29uLCByZWFkLW1vcmUgYWZmb3JkYW5jZSwgaW50ZXItY29sdW1uIGdhcCwgaG9yaXpvbnRhbCBwYWRkaW5nIGFuZCBzY3JvbGxiYXIuXG5cdFx0Y29uc3QgY2hyb21lID0gMiAqIGluZm8uaXRlbUhlaWdodCArIDIgKiBpbmZvLmhvcml6b250YWxQYWRkaW5nICsgMjA7XG5cdFx0Y29uc3Qgd2lkdGggPSBtYXhUZXh0V2lkdGggKyBjaHJvbWU7XG5cdFx0dGhpcy5fZml0Q29udGVudFdpZHRoID0geyBtb2RlbCwgd2lkdGggfTtcblx0XHRyZXR1cm4gd2lkdGg7XG5cdH1cblxuXHRnZXRMYXlvdXRJbmZvKCkge1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3QgaXRlbUhlaWdodCA9IGNsYW1wKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdExpbmVIZWlnaHQpIHx8IGZvbnRJbmZvLmxpbmVIZWlnaHQsIDgsIDEwMDApO1xuXHRcdGNvbnN0IHN0YXR1c0JhckhlaWdodCA9ICF0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLnNob3dTdGF0dXNCYXIgfHwgdGhpcy5fc3RhdGUgPT09IFN0YXRlLkVtcHR5IHx8IHRoaXMuX3N0YXRlID09PSBTdGF0ZS5Mb2FkaW5nID8gMCA6IGl0ZW1IZWlnaHQ7XG5cdFx0Y29uc3QgYm9yZGVyV2lkdGggPSB0aGlzLl9kZXRhaWxzLndpZGdldC5nZXRMYXlvdXRJbmZvKCkuYm9yZGVyV2lkdGg7XG5cdFx0Y29uc3QgYm9yZGVySGVpZ2h0ID0gMiAqIGJvcmRlcldpZHRoO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW1IZWlnaHQsXG5cdFx0XHRzdGF0dXNCYXJIZWlnaHQsXG5cdFx0XHRib3JkZXJXaWR0aCxcblx0XHRcdGJvcmRlckhlaWdodCxcblx0XHRcdHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoLFxuXHRcdFx0dmVydGljYWxQYWRkaW5nOiAyMixcblx0XHRcdGhvcml6b250YWxQYWRkaW5nOiAxNCxcblx0XHRcdGRlZmF1bHRTaXplOiBuZXcgZG9tLkRpbWVuc2lvbig0MzAsIHN0YXR1c0JhckhlaWdodCArIDEyICogaXRlbUhlaWdodClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEZXRhaWxzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZXhwYW5kU3VnZ2VzdGlvbkRvY3MnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RGV0YWlsc1Zpc2libGUodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSgnZXhwYW5kU3VnZ2VzdGlvbkRvY3MnLCB2YWx1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRmb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdGlmICghdGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSkge1xuXHRcdFx0dGhpcy5fZm9yY2VSZW5kZXJpbmdBYm92ZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9sYXlvdXQodGhpcy5fcGVyc2lzdGVkU2l6ZS5yZXN0b3JlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHN0b3BGb3JjZVJlbmRlcmluZ0Fib3ZlKCkge1xuXHRcdHRoaXMuX2ZvcmNlUmVuZGVyaW5nQWJvdmUgPSBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdENvbnRlbnRXaWRnZXQgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdyA9IHRydWU7XG5cdHJlYWRvbmx5IHN1cHByZXNzTW91c2VEb3duID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfcG9zaXRpb24/OiBJUG9zaXRpb24gfCBudWxsO1xuXHRwcml2YXRlIF9wcmVmZXJlbmNlPzogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZTtcblx0cHJpdmF0ZSBfcHJlZmVyZW5jZUxvY2tlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2FkZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hpZGRlbjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogU3VnZ2VzdFdpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yXG5cdCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYWRkZWQpIHtcblx0XHRcdHRoaXMuX2FkZGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnZWRpdG9yLndpZGdldC5zdWdnZXN0V2lkZ2V0Jztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuZWxlbWVudC5kb21Ob2RlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWRkZW4gPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMuX2FkZGVkKSB7XG5cdFx0XHR0aGlzLl9hZGRlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9oaWRkZW4gPSB0cnVlO1xuXHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRnZXRQb3NpdGlvbigpOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2hpZGRlbiB8fCAhdGhpcy5fcG9zaXRpb24gfHwgIXRoaXMuX3ByZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHRoaXMuX3Bvc2l0aW9uLFxuXHRcdFx0cHJlZmVyZW5jZTogW3RoaXMuX3ByZWZlcmVuY2VdXG5cdFx0fTtcblx0fVxuXG5cdGJlZm9yZVJlbmRlcigpIHtcblx0XHRjb25zdCB7IGhlaWdodCwgd2lkdGggfSA9IHRoaXMuX3dpZGdldC5lbGVtZW50LnNpemU7XG5cdFx0Y29uc3QgeyBib3JkZXJXaWR0aCwgaG9yaXpvbnRhbFBhZGRpbmcgfSA9IHRoaXMuX3dpZGdldC5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0cmV0dXJuIG5ldyBkb20uRGltZW5zaW9uKHdpZHRoICsgMiAqIGJvcmRlcldpZHRoICsgaG9yaXpvbnRhbFBhZGRpbmcsIGhlaWdodCArIDIgKiBib3JkZXJXaWR0aCk7XG5cdH1cblxuXHRhZnRlclJlbmRlcihwb3NpdGlvbjogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB8IG51bGwpIHtcblx0XHR0aGlzLl93aWRnZXQuX2FmdGVyUmVuZGVyKHBvc2l0aW9uKTtcblx0fVxuXG5cdHNldFByZWZlcmVuY2UocHJlZmVyZW5jZTogQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSkge1xuXHRcdGlmICghdGhpcy5fcHJlZmVyZW5jZUxvY2tlZCkge1xuXHRcdFx0dGhpcy5fcHJlZmVyZW5jZSA9IHByZWZlcmVuY2U7XG5cdFx0fVxuXHR9XG5cblx0bG9ja1ByZWZlcmVuY2UoKSB7XG5cdFx0dGhpcy5fcHJlZmVyZW5jZUxvY2tlZCA9IHRydWU7XG5cdH1cblxuXHR1bmxvY2tQcmVmZXJlbmNlKCkge1xuXHRcdHRoaXMuX3ByZWZlcmVuY2VMb2NrZWQgPSBmYWxzZTtcblx0fVxuXG5cdHNldFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9zaXRpb24gPSBwb3NpdGlvbjtcblx0fVxufVxuIl0sCiAg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
