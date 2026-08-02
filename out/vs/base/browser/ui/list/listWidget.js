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
import { EventHelper, getActiveElement, getWindow, isActiveElement, isEditableElement, isHTMLElement, isMouseEvent } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { asCssValueWithDefault } from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { Gesture } from "../../touch.js";
import { alert } from "../aria/aria.js";
import { CombinedSpliceable } from "./splice.js";
import { binarySearch, range } from "../../../common/arrays.js";
import { timeout } from "../../../common/async.js";
import { Color } from "../../../common/color.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter, Event, EventBufferer } from "../../../common/event.js";
import { matchesFuzzy2, matchesPrefix } from "../../../common/filters.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { DisposableStore, dispose } from "../../../common/lifecycle.js";
import { clamp } from "../../../common/numbers.js";
import * as platform from "../../../common/platform.js";
import { isNumber } from "../../../common/types.js";
import "./list.css";
import { ListError, NotSelectableGroupId } from "./list.js";
import { ListView } from "./listView.js";
import { StandardMouseEvent } from "../../mouseEvent.js";
import { autorun, constObservable } from "../../../common/observable.js";
class TraitRenderer {
  constructor(trait) {
    this.trait = trait;
    this.renderedElements = [];
  }
  get templateId() {
    return `template:${this.trait.name}`;
  }
  renderTemplate(container) {
    return container;
  }
  renderElement(element, index, templateData) {
    const renderedElementIndex = this.renderedElements.findIndex((el) => el.templateData === templateData);
    if (renderedElementIndex >= 0) {
      const rendered = this.renderedElements[renderedElementIndex];
      this.trait.unrender(templateData);
      rendered.index = index;
    } else {
      const rendered = { index, templateData };
      this.renderedElements.push(rendered);
    }
    this.trait.renderIndex(index, templateData);
  }
  splice(start, deleteCount, insertCount) {
    const rendered = [];
    for (const renderedElement of this.renderedElements) {
      if (renderedElement.index < start) {
        rendered.push(renderedElement);
      } else if (renderedElement.index >= start + deleteCount) {
        rendered.push({
          index: renderedElement.index + insertCount - deleteCount,
          templateData: renderedElement.templateData
        });
      }
    }
    this.renderedElements = rendered;
  }
  renderIndexes(indexes) {
    for (const { index, templateData } of this.renderedElements) {
      if (indexes.indexOf(index) > -1) {
        this.trait.renderIndex(index, templateData);
      }
    }
  }
  disposeTemplate(templateData) {
    const index = this.renderedElements.findIndex((el) => el.templateData === templateData);
    if (index < 0) {
      return;
    }
    this.renderedElements.splice(index, 1);
  }
}
class Trait {
  constructor(_trait) {
    this._trait = _trait;
    this.indexes = [];
    this.sortedIndexes = [];
    this._onChange = new Emitter();
  }
  get onChange() {
    return this._onChange.event;
  }
  get name() {
    return this._trait;
  }
  get renderer() {
    return new TraitRenderer(this);
  }
  splice(start, deleteCount, elements) {
    const diff = elements.length - deleteCount;
    const end = start + deleteCount;
    const sortedIndexes = [];
    let i = 0;
    while (i < this.sortedIndexes.length && this.sortedIndexes[i] < start) {
      sortedIndexes.push(this.sortedIndexes[i++]);
    }
    for (let j = 0; j < elements.length; j++) {
      if (elements[j]) {
        sortedIndexes.push(j + start);
      }
    }
    while (i < this.sortedIndexes.length && this.sortedIndexes[i] >= end) {
      sortedIndexes.push(this.sortedIndexes[i++] + diff);
    }
    this.renderer.splice(start, deleteCount, elements.length);
    this._set(sortedIndexes, sortedIndexes);
  }
  renderIndex(index, container) {
    container.classList.toggle(this._trait, this.contains(index));
  }
  unrender(container) {
    container.classList.remove(this._trait);
  }
  /**
   * Sets the indexes which should have this trait.
   *
   * @param indexes Indexes which should have this trait.
   * @return The old indexes which had this trait.
   */
  set(indexes, browserEvent) {
    return this._set(indexes, [...indexes].sort(numericSort), browserEvent);
  }
  _set(indexes, sortedIndexes, browserEvent) {
    const result = this.indexes;
    const sortedResult = this.sortedIndexes;
    this.indexes = indexes;
    this.sortedIndexes = sortedIndexes;
    const toRender = disjunction(sortedResult, indexes);
    this.renderer.renderIndexes(toRender);
    this._onChange.fire({ indexes, browserEvent });
    return result;
  }
  get() {
    return this.indexes;
  }
  contains(index) {
    return binarySearch(this.sortedIndexes, index, numericSort) >= 0;
  }
  dispose() {
    dispose(this._onChange);
  }
}
__decorateClass([
  memoize
], Trait.prototype, "renderer", 1);
class SelectionTrait extends Trait {
  constructor(setAriaSelected) {
    super("selected");
    this.setAriaSelected = setAriaSelected;
  }
  renderIndex(index, container) {
    super.renderIndex(index, container);
    if (this.setAriaSelected) {
      if (this.contains(index)) {
        container.setAttribute("aria-selected", "true");
      } else {
        container.setAttribute("aria-selected", "false");
      }
    }
  }
}
class TraitSpliceable {
  constructor(trait, view, identityProvider) {
    this.trait = trait;
    this.view = view;
    this.identityProvider = identityProvider;
  }
  splice(start, deleteCount, elements) {
    if (!this.identityProvider) {
      return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
    }
    const pastElementsWithTrait = this.trait.get().map((i) => this.identityProvider.getId(this.view.element(i)).toString());
    if (pastElementsWithTrait.length === 0) {
      return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
    }
    const pastElementsWithTraitSet = new Set(pastElementsWithTrait);
    const elementsWithTrait = elements.map((e) => pastElementsWithTraitSet.has(this.identityProvider.getId(e).toString()));
    this.trait.splice(start, deleteCount, elementsWithTrait);
  }
}
function isListElementDescendantOfClass(e, className) {
  if (e.classList.contains(className)) {
    return true;
  }
  if (e.classList.contains("monaco-list")) {
    return false;
  }
  if (!e.parentElement) {
    return false;
  }
  return isListElementDescendantOfClass(e.parentElement, className);
}
function isMonacoEditor(e) {
  return isListElementDescendantOfClass(e, "monaco-editor");
}
function isMonacoCustomToggle(e) {
  return isListElementDescendantOfClass(e, "monaco-custom-toggle");
}
function isActionItem(e) {
  return isListElementDescendantOfClass(e, "action-item");
}
function isMonacoTwistie(e) {
  return isListElementDescendantOfClass(e, "monaco-tl-twistie");
}
function isStickyScrollElement(e) {
  return isListElementDescendantOfClass(e, "monaco-tree-sticky-row");
}
function isStickyScrollContainer(e) {
  return e.classList.contains("monaco-tree-sticky-container");
}
function isButton(e) {
  if (e.tagName === "A" && e.classList.contains("monaco-button") || e.tagName === "DIV" && e.classList.contains("monaco-button-dropdown")) {
    return true;
  }
  if (e.classList.contains("monaco-list")) {
    return false;
  }
  if (!e.parentElement) {
    return false;
  }
  return isButton(e.parentElement);
}
class KeyboardController {
  constructor(list, view, options) {
    this.list = list;
    this.view = view;
    this.disposables = new DisposableStore();
    this.multipleSelectionDisposables = new DisposableStore();
    this.multipleSelectionSupport = options.multipleSelectionSupport;
    this.disposables.add(this.onKeyDown((e) => {
      switch (e.keyCode) {
        case KeyCode.Enter:
          return this.onEnter(e);
        case KeyCode.UpArrow:
          return this.onUpArrow(e);
        case KeyCode.DownArrow:
          return this.onDownArrow(e);
        case KeyCode.PageUp:
          return this.onPageUpArrow(e);
        case KeyCode.PageDown:
          return this.onPageDownArrow(e);
        case KeyCode.Escape:
          return this.onEscape(e);
        case KeyCode.KeyA:
          if (this.multipleSelectionSupport && (platform.isMacintosh ? e.metaKey : e.ctrlKey)) {
            this.onCtrlA(e);
          }
      }
    }));
  }
  get onKeyDown() {
    return Event.chain(
      this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
    );
  }
  updateOptions(optionsUpdate) {
    if (optionsUpdate.multipleSelectionSupport !== void 0) {
      this.multipleSelectionSupport = optionsUpdate.multipleSelectionSupport;
    }
  }
  onEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.setSelection(this.list.getFocus(), e.browserEvent);
  }
  onUpArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusPrevious(1, false, e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onDownArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusNext(1, false, e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onPageUpArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusPreviousPage(e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onPageDownArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusNextPage(e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onCtrlA(e) {
    e.preventDefault();
    e.stopPropagation();
    let selection = range(this.list.length);
    const focusedElements = this.list.getFocus();
    const referenceGroupId = focusedElements.length > 0 ? this.list.getElementGroupId(focusedElements[0]) : void 0;
    if (referenceGroupId !== void 0) {
      selection = this.list.filterIndicesByGroup(selection, referenceGroupId);
    }
    this.list.setSelection(selection, e.browserEvent);
    this.list.setAnchor(void 0);
    this.view.domNode.focus();
  }
  onEscape(e) {
    if (this.list.getSelection().length) {
      e.preventDefault();
      e.stopPropagation();
      this.list.setSelection([], e.browserEvent);
      this.list.setAnchor(void 0);
      this.view.domNode.focus();
    }
  }
  dispose() {
    this.disposables.dispose();
    this.multipleSelectionDisposables.dispose();
  }
}
__decorateClass([
  memoize
], KeyboardController.prototype, "onKeyDown", 1);
var TypeNavigationMode = /* @__PURE__ */ ((TypeNavigationMode2) => {
  TypeNavigationMode2[TypeNavigationMode2["Automatic"] = 0] = "Automatic";
  TypeNavigationMode2[TypeNavigationMode2["Trigger"] = 1] = "Trigger";
  return TypeNavigationMode2;
})(TypeNavigationMode || {});
var TypeNavigationControllerState = /* @__PURE__ */ ((TypeNavigationControllerState2) => {
  TypeNavigationControllerState2[TypeNavigationControllerState2["Idle"] = 0] = "Idle";
  TypeNavigationControllerState2[TypeNavigationControllerState2["Typing"] = 1] = "Typing";
  return TypeNavigationControllerState2;
})(TypeNavigationControllerState || {});
const DefaultKeyboardNavigationDelegate = new class {
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    return event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ || event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9 || event.keyCode >= KeyCode.Numpad0 && event.keyCode <= KeyCode.Numpad9 || event.keyCode >= KeyCode.Semicolon && event.keyCode <= KeyCode.Quote;
  }
}();
class TypeNavigationController {
  constructor(list, view, keyboardNavigationLabelProvider, keyboardNavigationEventFilter, delegate) {
    this.list = list;
    this.view = view;
    this.keyboardNavigationLabelProvider = keyboardNavigationLabelProvider;
    this.keyboardNavigationEventFilter = keyboardNavigationEventFilter;
    this.delegate = delegate;
    this.enabled = false;
    this.state = 0 /* Idle */;
    this.mode = 0 /* Automatic */;
    this.triggered = false;
    this.previouslyFocused = -1;
    this.enabledDisposables = new DisposableStore();
    this.disposables = new DisposableStore();
    this.updateOptions(list.options);
  }
  updateOptions(options) {
    if (options.typeNavigationEnabled ?? true) {
      this.enable();
    } else {
      this.disable();
    }
    this.mode = options.typeNavigationMode ?? 0 /* Automatic */;
  }
  trigger() {
    this.triggered = !this.triggered;
  }
  enable() {
    if (this.enabled) {
      return;
    }
    let typing = false;
    const onChar = Event.chain(
      this.enabledDisposables.add(new DomEmitter(this.view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).filter(() => this.mode === 0 /* Automatic */ || this.triggered).map((event) => new StandardKeyboardEvent(event)).filter((e) => typing || this.keyboardNavigationEventFilter(e)).filter((e) => this.delegate.mightProducePrintableCharacter(e)).forEach((e) => EventHelper.stop(e, true)).map((event) => event.browserEvent.key)
    );
    const onClear = Event.debounce(onChar, () => null, 800, void 0, void 0, void 0, this.enabledDisposables);
    const onInput = Event.reduce(Event.any(onChar, onClear), (r, i) => i === null ? null : (r || "") + i, void 0, this.enabledDisposables);
    onInput(this.onInput, this, this.enabledDisposables);
    onClear(this.onClear, this, this.enabledDisposables);
    onChar(() => typing = true, void 0, this.enabledDisposables);
    onClear(() => typing = false, void 0, this.enabledDisposables);
    this.enabled = true;
    this.triggered = false;
  }
  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabledDisposables.clear();
    this.enabled = false;
    this.triggered = false;
  }
  onClear() {
    const focus = this.list.getFocus();
    if (focus.length > 0 && focus[0] === this.previouslyFocused) {
      const ariaLabel = this.list.options.accessibilityProvider?.getAriaLabel(this.list.element(focus[0]));
      if (typeof ariaLabel === "string") {
        alert(ariaLabel);
      } else if (ariaLabel) {
        alert(ariaLabel.get());
      }
    }
    this.previouslyFocused = -1;
  }
  onInput(word) {
    if (!word) {
      this.state = 0 /* Idle */;
      this.triggered = false;
      return;
    }
    const focus = this.list.getFocus();
    const start = focus.length > 0 ? focus[0] : 0;
    const delta = this.state === 0 /* Idle */ ? 1 : 0;
    this.state = 1 /* Typing */;
    for (let i = 0; i < this.list.length; i++) {
      const index = (start + i + delta) % this.list.length;
      const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(this.view.element(index));
      const labelStr = label && label.toString();
      if (this.list.options.typeNavigationEnabled) {
        if (typeof labelStr !== "undefined") {
          if (matchesPrefix(word, labelStr)) {
            this.previouslyFocused = start;
            this.list.setFocus([index]);
            this.list.reveal(index);
            return;
          }
          const fuzzy = matchesFuzzy2(word, labelStr);
          if (fuzzy) {
            const fuzzyScore = fuzzy[0].end - fuzzy[0].start;
            if (fuzzyScore > 1 && fuzzy.length === 1) {
              this.previouslyFocused = start;
              this.list.setFocus([index]);
              this.list.reveal(index);
              return;
            }
          }
        }
      } else if (typeof labelStr === "undefined" || matchesPrefix(word, labelStr)) {
        this.previouslyFocused = start;
        this.list.setFocus([index]);
        this.list.reveal(index);
        return;
      }
    }
  }
  dispose() {
    this.disable();
    this.enabledDisposables.dispose();
    this.disposables.dispose();
  }
}
class DOMFocusController {
  constructor(list, view) {
    this.list = list;
    this.view = view;
    this.disposables = new DisposableStore();
    const onKeyDown = Event.chain(
      this.disposables.add(new DomEmitter(view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
    );
    const onTab = Event.chain(onKeyDown, ($) => $.filter((e) => e.keyCode === KeyCode.Tab && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey));
    onTab(this.onTab, this, this.disposables);
  }
  onTab(e) {
    if (e.target !== this.view.domNode) {
      return;
    }
    const focus = this.list.getFocus();
    if (focus.length === 0) {
      return;
    }
    const focusedDomElement = this.view.domElement(focus[0]);
    if (!focusedDomElement) {
      return;
    }
    const tabIndexElement = focusedDomElement.querySelector("[tabIndex]");
    if (!tabIndexElement || !isHTMLElement(tabIndexElement) || tabIndexElement.tabIndex === -1) {
      return;
    }
    const style = getWindow(tabIndexElement).getComputedStyle(tabIndexElement);
    if (style.visibility === "hidden" || style.display === "none") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    tabIndexElement.focus();
  }
  dispose() {
    this.disposables.dispose();
  }
}
function isSelectionSingleChangeEvent(event) {
  return platform.isMacintosh ? event.browserEvent.metaKey : event.browserEvent.ctrlKey;
}
function isSelectionRangeChangeEvent(event) {
  return event.browserEvent.shiftKey;
}
function isMouseRightClick(event) {
  return isMouseEvent(event) && event.button === 2;
}
const DefaultMultipleSelectionController = {
  isSelectionSingleChangeEvent,
  isSelectionRangeChangeEvent
};
class MouseController {
  constructor(list) {
    this.list = list;
    this.disposables = new DisposableStore();
    this._onPointer = this.disposables.add(new Emitter());
    if (list.options.multipleSelectionSupport !== false) {
      this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
    }
    this.mouseSupport = typeof list.options.mouseSupport === "undefined" || !!list.options.mouseSupport;
    if (this.mouseSupport) {
      list.onMouseDown(this.onMouseDown, this, this.disposables);
      list.onContextMenu(this.onContextMenu, this, this.disposables);
      list.onMouseDblClick(this.onDoubleClick, this, this.disposables);
      list.onTouchStart(this.onMouseDown, this, this.disposables);
      this.disposables.add(Gesture.addTarget(list.getHTMLElement()));
    }
    Event.any(list.onMouseClick, list.onMouseMiddleClick, list.onTap)(this.onViewPointer, this, this.disposables);
  }
  get onPointer() {
    return this._onPointer.event;
  }
  updateOptions(optionsUpdate) {
    if (optionsUpdate.multipleSelectionSupport !== void 0) {
      this.multipleSelectionController = void 0;
      if (optionsUpdate.multipleSelectionSupport) {
        this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
      }
    }
  }
  isSelectionSingleChangeEvent(event) {
    if (!this.multipleSelectionController) {
      return false;
    }
    return this.multipleSelectionController.isSelectionSingleChangeEvent(event);
  }
  isSelectionRangeChangeEvent(event) {
    if (!this.multipleSelectionController) {
      return false;
    }
    return this.multipleSelectionController.isSelectionRangeChangeEvent(event);
  }
  isSelectionChangeEvent(event) {
    return this.isSelectionSingleChangeEvent(event) || this.isSelectionRangeChangeEvent(event);
  }
  onMouseDown(e) {
    if (isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (getActiveElement() !== e.browserEvent.target) {
      this.list.domFocus();
    }
  }
  onContextMenu(e) {
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    const focus = typeof e.index === "undefined" ? [] : [e.index];
    this.list.setFocus(focus, e.browserEvent);
  }
  onViewPointer(e) {
    if (!this.mouseSupport) {
      return;
    }
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    e.browserEvent.isHandledByList = true;
    const focus = e.index;
    if (typeof focus === "undefined") {
      this.list.setFocus([], e.browserEvent);
      this.list.setSelection([], e.browserEvent);
      this.list.setAnchor(void 0);
      return;
    }
    if (this.isSelectionChangeEvent(e)) {
      return this.changeSelection(e);
    }
    this.list.setFocus([focus], e.browserEvent);
    this.list.setAnchor(focus);
    if (!isMouseRightClick(e.browserEvent)) {
      const focusGroupId = this.list.getElementGroupId(focus);
      if (focusGroupId !== NotSelectableGroupId) {
        this.list.setSelection([focus], e.browserEvent);
      }
    }
    this._onPointer.fire(e);
  }
  onDoubleClick(e) {
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (this.isSelectionChangeEvent(e)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    e.browserEvent.isHandledByList = true;
    const focus = this.list.getFocus();
    this.list.setSelection(focus, e.browserEvent);
  }
  changeSelection(e) {
    const focus = e.index;
    let anchor = this.list.getAnchor();
    if (this.isSelectionRangeChangeEvent(e)) {
      if (typeof anchor === "undefined") {
        const currentFocus = this.list.getFocus()[0];
        anchor = currentFocus ?? focus;
        this.list.setAnchor(anchor);
      }
      const min = Math.min(anchor, focus);
      const max = Math.max(anchor, focus);
      let rangeSelection = range(min, max + 1);
      const selectedElement = this.list.getSelection()[0];
      if (selectedElement !== void 0) {
        const referenceGroupId = this.list.getElementGroupId(selectedElement);
        if (referenceGroupId !== void 0) {
          rangeSelection = this.list.filterIndicesByGroup(rangeSelection, referenceGroupId);
        }
      }
      const selection = this.list.getSelection();
      const contiguousRange = getContiguousRangeContaining(disjunction(selection, [anchor]), anchor);
      if (contiguousRange.length === 0) {
        return;
      }
      const newSelection = disjunction(rangeSelection, relativeComplement(selection, contiguousRange));
      this.list.setSelection(newSelection, e.browserEvent);
      this.list.setFocus([focus], e.browserEvent);
    } else if (this.isSelectionSingleChangeEvent(e)) {
      const selection = this.list.getSelection();
      const newSelection = selection.filter((i) => i !== focus);
      this.list.setFocus([focus]);
      this.list.setAnchor(focus);
      const focusGroupId = this.list.getElementGroupId(focus);
      if (focusGroupId === NotSelectableGroupId) {
        return;
      }
      if (selection.length === newSelection.length) {
        const itemsToBeSelected = focusGroupId !== void 0 ? this.list.filterIndicesByGroup([...newSelection, focus], focusGroupId) : [...newSelection, focus];
        this.list.setSelection(itemsToBeSelected, e.browserEvent);
      } else {
        this.list.setSelection(newSelection, e.browserEvent);
      }
    }
  }
  dispose() {
    this.disposables.dispose();
  }
}
class DefaultStyleController {
  constructor(styleElement, selectorSuffix) {
    this.styleElement = styleElement;
    this.selectorSuffix = selectorSuffix;
  }
  style(styles) {
    const suffix = this.selectorSuffix && `.${this.selectorSuffix}`;
    const content = [];
    if (styles.listBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-rows { background: ${styles.listBackground}; }`);
    }
    if (styles.listFocusBackground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
    }
    if (styles.listActiveSelectionBackground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
    }
    if (styles.listActiveSelectionForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
    }
    if (styles.listActiveSelectionIconForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected .codicon { color: ${styles.listActiveSelectionIconForeground}; }`);
    }
    if (styles.listFocusAndSelectionBackground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
    }
    if (styles.listFocusAndSelectionForeground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
    }
    if (styles.listInactiveFocusForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { color:  ${styles.listInactiveFocusForeground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { color:  ${styles.listInactiveFocusForeground}; }`);
    }
    if (styles.listInactiveSelectionIconForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused .codicon { color:  ${styles.listInactiveSelectionIconForeground}; }`);
    }
    if (styles.listInactiveFocusBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`);
    }
    if (styles.listInactiveSelectionBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`);
    }
    if (styles.listInactiveSelectionForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
    }
    if (styles.listHoverBackground) {
      content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { background-color: ${styles.listHoverBackground}; }`);
    }
    if (styles.listHoverForeground) {
      content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
    }
    const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ""));
    if (focusAndSelectionOutline) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
    }
    if (styles.listFocusOutline) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.focused,
				.context-menu-visible .monaco-list${suffix}.last-focused .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
    }
    const inactiveFocusAndSelectionOutline = asCssValueWithDefault(styles.listSelectionOutline, styles.listInactiveFocusOutline ?? "");
    if (inactiveFocusAndSelectionOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused.selected { outline: 1px dotted ${inactiveFocusAndSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listSelectionOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listInactiveFocusOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
    }
    if (styles.listHoverOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
    }
    if (styles.listDropOverBackground) {
      content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} .monaco-list-rows.drop-target,
				.monaco-list${suffix} .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
    }
    if (styles.listDropBetweenBackground) {
      content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-before .monaco-list-row:first-child::before,
			.monaco-list${suffix} .monaco-list-row.drop-target-before::before {
				content: ""; position: absolute; top: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
      content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-after .monaco-list-row:last-child::after,
			.monaco-list${suffix} .monaco-list-row.drop-target-after::after {
				content: ""; position: absolute; bottom: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
    }
    if (styles.tableColumnsBorder) {
      content.push(`
				.monaco-table > .monaco-split-view2,
				.monaco-table > .monaco-split-view2 .monaco-sash.vertical::before,
				.monaco-enable-motion .monaco-table:hover > .monaco-split-view2,
				.monaco-enable-motion .monaco-table:hover > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: ${styles.tableColumnsBorder};
				}

				.monaco-enable-motion .monaco-table > .monaco-split-view2,
				.monaco-enable-motion .monaco-table > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: transparent;
				}
			`);
    }
    if (styles.tableOddRowsBackgroundColor) {
      content.push(`
				.monaco-table .monaco-list-row[data-parity=odd]:not(.focused):not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(:focus) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(.focused) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr {
					background-color: ${styles.tableOddRowsBackgroundColor};
				}
			`);
    }
    this.styleElement.textContent = content.join("\n");
  }
}
const unthemedListStyles = {
  listFocusBackground: "#7FB0D0",
  listActiveSelectionBackground: "#0E639C",
  listActiveSelectionForeground: "#FFFFFF",
  listActiveSelectionIconForeground: "#FFFFFF",
  listFocusAndSelectionOutline: "#90C2F9",
  listFocusAndSelectionBackground: "#094771",
  listFocusAndSelectionForeground: "#FFFFFF",
  listInactiveSelectionBackground: "#3F3F46",
  listInactiveSelectionIconForeground: "#FFFFFF",
  listHoverBackground: "#2A2D2E",
  listDropOverBackground: "#383B3D",
  listDropBetweenBackground: "#EEEEEE",
  treeIndentGuidesStroke: "#a9a9a9",
  treeInactiveIndentGuidesStroke: Color.fromHex("#a9a9a9").transparent(0.4).toString(),
  tableColumnsBorder: Color.fromHex("#cccccc").transparent(0.2).toString(),
  tableOddRowsBackgroundColor: Color.fromHex("#cccccc").transparent(0.04).toString(),
  listBackground: void 0,
  listFocusForeground: void 0,
  listInactiveSelectionForeground: void 0,
  listInactiveFocusForeground: void 0,
  listInactiveFocusBackground: void 0,
  listHoverForeground: void 0,
  listFocusOutline: void 0,
  listInactiveFocusOutline: void 0,
  listSelectionOutline: void 0,
  listHoverOutline: void 0,
  treeStickyScrollBackground: void 0,
  treeStickyScrollBorder: void 0,
  treeStickyScrollShadow: void 0
};
const DefaultOptions = {
  keyboardSupport: true,
  mouseSupport: true,
  multipleSelectionSupport: true,
  dnd: {
    getDragURI() {
      return null;
    },
    onDragStart() {
    },
    onDragOver() {
      return false;
    },
    drop() {
    },
    dispose() {
    }
  }
};
function getContiguousRangeContaining(range2, value) {
  const index = range2.indexOf(value);
  if (index === -1) {
    return [];
  }
  const result = [];
  let i = index - 1;
  while (i >= 0 && range2[i] === value - (index - i)) {
    result.push(range2[i--]);
  }
  result.reverse();
  i = index;
  while (i < range2.length && range2[i] === value + (i - index)) {
    result.push(range2[i++]);
  }
  return result;
}
function disjunction(one, other) {
  const result = [];
  let i = 0, j = 0;
  while (i < one.length || j < other.length) {
    if (i >= one.length) {
      result.push(other[j++]);
    } else if (j >= other.length) {
      result.push(one[i++]);
    } else if (one[i] === other[j]) {
      result.push(one[i]);
      i++;
      j++;
      continue;
    } else if (one[i] < other[j]) {
      result.push(one[i++]);
    } else {
      result.push(other[j++]);
    }
  }
  return result;
}
function relativeComplement(one, other) {
  const result = [];
  let i = 0, j = 0;
  while (i < one.length || j < other.length) {
    if (i >= one.length) {
      result.push(other[j++]);
    } else if (j >= other.length) {
      result.push(one[i++]);
    } else if (one[i] === other[j]) {
      i++;
      j++;
      continue;
    } else if (one[i] < other[j]) {
      result.push(one[i++]);
    } else {
      j++;
    }
  }
  return result;
}
const numericSort = (a, b) => a - b;
class PipelineRenderer {
  constructor(_templateId, renderers) {
    this._templateId = _templateId;
    this.renderers = renderers;
  }
  get templateId() {
    return this._templateId;
  }
  renderTemplate(container) {
    return this.renderers.map((r) => r.renderTemplate(container));
  }
  renderElement(element, index, templateData, renderDetails) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.renderElement(element, index, templateData[i++], renderDetails);
    }
  }
  disposeElement(element, index, templateData, renderDetails) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.disposeElement?.(element, index, templateData[i], renderDetails);
      i += 1;
    }
  }
  disposeTemplate(templateData) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.disposeTemplate(templateData[i++]);
    }
  }
}
class AccessibiltyRenderer {
  constructor(accessibilityProvider) {
    this.accessibilityProvider = accessibilityProvider;
    this.templateId = "a18n";
  }
  renderTemplate(container) {
    return { container, disposables: new DisposableStore() };
  }
  renderElement(element, index, data) {
    const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
    const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
    data.disposables.add(autorun((reader) => {
      this.setAriaLabel(reader.readObservable(observable), data.container);
    }));
    const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);
    if (typeof ariaLevel === "number") {
      data.container.setAttribute("aria-level", `${ariaLevel}`);
    } else {
      data.container.removeAttribute("aria-level");
    }
  }
  setAriaLabel(ariaLabel, element) {
    if (ariaLabel) {
      element.setAttribute("aria-label", ariaLabel);
    } else {
      element.removeAttribute("aria-label");
    }
  }
  disposeElement(element, index, templateData) {
    templateData.disposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class ListViewDragAndDrop {
  constructor(list, dnd) {
    this.list = list;
    this.dnd = dnd;
  }
  getDragElements(element) {
    const selection = this.list.getSelectedElements();
    const elements = selection.indexOf(element) > -1 ? selection : [element];
    return elements;
  }
  getDragURI(element) {
    return this.dnd.getDragURI(element);
  }
  getDragLabel(elements, originalEvent) {
    if (this.dnd.getDragLabel) {
      return this.dnd.getDragLabel(elements, originalEvent);
    }
    return void 0;
  }
  onDragStart(data, originalEvent) {
    this.dnd.onDragStart?.(data, originalEvent);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return this.dnd.onDragOver(data, targetElement, targetIndex, targetSector, originalEvent);
  }
  onDragLeave(data, targetElement, targetIndex, originalEvent) {
    this.dnd.onDragLeave?.(data, targetElement, targetIndex, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
    this.dnd.drop(data, targetElement, targetIndex, targetSector, originalEvent);
  }
  dispose() {
    this.dnd.dispose();
  }
}
class List {
  constructor(user, container, virtualDelegate, renderers, _options = DefaultOptions) {
    this.user = user;
    this._options = _options;
    this.focus = new Trait("focused");
    this.anchor = new Trait("anchor");
    this.eventBufferer = new EventBufferer();
    this._ariaLabel = "";
    this.disposables = new DisposableStore();
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    const role = this._options.accessibilityProvider && this._options.accessibilityProvider.getWidgetRole ? this._options.accessibilityProvider?.getWidgetRole() : "list";
    this.selection = new SelectionTrait(role !== "listbox");
    const baseRenderers = [this.focus.renderer, this.selection.renderer];
    this.accessibilityProvider = _options.accessibilityProvider;
    if (this.accessibilityProvider) {
      baseRenderers.push(new AccessibiltyRenderer(this.accessibilityProvider));
      this.accessibilityProvider.onDidChangeActiveDescendant?.(this.onDidChangeActiveDescendant, this, this.disposables);
    }
    renderers = renderers.map((r) => new PipelineRenderer(r.templateId, [...baseRenderers, r]));
    const viewOptions = {
      ..._options,
      dnd: _options.dnd && new ListViewDragAndDrop(this, _options.dnd)
    };
    this.view = this.createListView(container, virtualDelegate, renderers, viewOptions);
    this.view.domNode.setAttribute("role", role);
    if (_options.styleController) {
      this.styleController = _options.styleController(this.view.domId);
    } else {
      const styleElement = createStyleSheet(this.view.domNode);
      this.styleController = new DefaultStyleController(styleElement, this.view.domId);
    }
    this.spliceable = new CombinedSpliceable([
      new TraitSpliceable(this.focus, this.view, _options.identityProvider),
      new TraitSpliceable(this.selection, this.view, _options.identityProvider),
      new TraitSpliceable(this.anchor, this.view, _options.identityProvider),
      this.view
    ]);
    this.disposables.add(this.focus);
    this.disposables.add(this.selection);
    this.disposables.add(this.anchor);
    this.disposables.add(this.view);
    this.disposables.add(this._onDidDispose);
    this.disposables.add(new DOMFocusController(this, this.view));
    if (typeof _options.keyboardSupport !== "boolean" || _options.keyboardSupport) {
      this.keyboardController = new KeyboardController(this, this.view, _options);
      this.disposables.add(this.keyboardController);
    }
    if (_options.keyboardNavigationLabelProvider) {
      const delegate = _options.keyboardNavigationDelegate || DefaultKeyboardNavigationDelegate;
      this.typeNavigationController = new TypeNavigationController(this, this.view, _options.keyboardNavigationLabelProvider, _options.keyboardNavigationEventFilter ?? (() => true), delegate);
      this.disposables.add(this.typeNavigationController);
    }
    this.mouseController = this.createMouseController(_options);
    this.disposables.add(this.mouseController);
    this.onDidChangeFocus(this._onFocusChange, this, this.disposables);
    this.onDidChangeSelection(this._onSelectionChange, this, this.disposables);
    if (this.accessibilityProvider) {
      const ariaLabel = this.accessibilityProvider.getWidgetAriaLabel();
      const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
      this.disposables.add(autorun((reader) => {
        this.ariaLabel = reader.readObservable(observable);
      }));
    }
    if (this._options.multipleSelectionSupport !== false) {
      this.view.domNode.setAttribute("aria-multiselectable", "true");
    }
  }
  get onDidChangeFocus() {
    return Event.map(this.eventBufferer.wrapEvent(this.focus.onChange), (e) => this.toListEvent(e), this.disposables);
  }
  get onDidChangeSelection() {
    return Event.map(this.eventBufferer.wrapEvent(this.selection.onChange), (e) => this.toListEvent(e), this.disposables);
  }
  get domId() {
    return this.view.domId;
  }
  get onDidScroll() {
    return this.view.onDidScroll;
  }
  get onMouseClick() {
    return this.view.onMouseClick;
  }
  get onMouseDblClick() {
    return this.view.onMouseDblClick;
  }
  get onMouseMiddleClick() {
    return this.view.onMouseMiddleClick;
  }
  get onPointer() {
    return this.mouseController.onPointer;
  }
  get onMouseUp() {
    return this.view.onMouseUp;
  }
  get onMouseDown() {
    return this.view.onMouseDown;
  }
  get onMouseOver() {
    return this.view.onMouseOver;
  }
  get onMouseMove() {
    return this.view.onMouseMove;
  }
  get onMouseOut() {
    return this.view.onMouseOut;
  }
  get onTouchStart() {
    return this.view.onTouchStart;
  }
  get onTap() {
    return this.view.onTap;
  }
  get onContextMenu() {
    let didJustPressContextMenuKey = false;
    const fromKeyDown = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event, ($) => $.map((e) => new StandardKeyboardEvent(e)).filter((e) => didJustPressContextMenuKey = e.keyCode === KeyCode.ContextMenu || e.shiftKey && e.keyCode === KeyCode.F10).map((e) => EventHelper.stop(e, true)).filter(() => false));
    const fromKeyUp = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, "keyup")).event, ($) => $.forEach(() => didJustPressContextMenuKey = false).map((e) => new StandardKeyboardEvent(e)).filter((e) => e.keyCode === KeyCode.ContextMenu || e.shiftKey && e.keyCode === KeyCode.F10).map((e) => EventHelper.stop(e, true)).map(({ browserEvent }) => {
      const focus = this.getFocus();
      const index = focus.length ? focus[0] : void 0;
      const element = typeof index !== "undefined" ? this.view.element(index) : void 0;
      const anchor = typeof index !== "undefined" ? this.view.domElement(index) : this.view.domNode;
      return { index, element, anchor, browserEvent };
    }));
    const fromMouse = Event.chain(
      this.view.onContextMenu,
      ($) => $.filter((_) => !didJustPressContextMenuKey).map(({ element, index, browserEvent }) => ({ element, index, anchor: new StandardMouseEvent(getWindow(this.view.domNode), browserEvent), browserEvent }))
    );
    return Event.any(fromKeyDown, fromKeyUp, fromMouse);
  }
  get onKeyDown() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event;
  }
  get onKeyUp() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keyup")).event;
  }
  get onKeyPress() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keypress")).event;
  }
  get onDidFocus() {
    return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, "focus", true)).event);
  }
  get onDidBlur() {
    return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, "blur", true)).event);
  }
  createListView(container, virtualDelegate, renderers, viewOptions) {
    return new ListView(container, virtualDelegate, renderers, viewOptions);
  }
  createMouseController(options) {
    return new MouseController(this);
  }
  updateOptions(optionsUpdate = {}) {
    this._options = { ...this._options, ...optionsUpdate };
    this.typeNavigationController?.updateOptions(this._options);
    if (this._options.multipleSelectionController !== void 0) {
      if (this._options.multipleSelectionSupport) {
        this.view.domNode.setAttribute("aria-multiselectable", "true");
      } else {
        this.view.domNode.removeAttribute("aria-multiselectable");
      }
    }
    this.mouseController.updateOptions(optionsUpdate);
    this.keyboardController?.updateOptions(optionsUpdate);
    this.view.updateOptions(optionsUpdate);
  }
  get options() {
    return this._options;
  }
  splice(start, deleteCount, elements = []) {
    if (start < 0 || start > this.view.length) {
      throw new ListError(this.user, `Invalid start index: ${start}`);
    }
    if (deleteCount < 0) {
      throw new ListError(this.user, `Invalid delete count: ${deleteCount}`);
    }
    if (deleteCount === 0 && elements.length === 0) {
      return;
    }
    this.eventBufferer.bufferEvents(() => this.spliceable.splice(start, deleteCount, elements));
  }
  updateWidth(index) {
    this.view.updateWidth(index);
  }
  updateElementHeight(index, size) {
    this.view.updateElementHeight(index, size, null);
  }
  rerender() {
    this.view.rerender();
  }
  element(index) {
    return this.view.element(index);
  }
  indexOf(element) {
    return this.view.indexOf(element);
  }
  indexAt(position) {
    return this.view.indexAt(position);
  }
  get length() {
    return this.view.length;
  }
  get contentHeight() {
    return this.view.contentHeight;
  }
  get contentWidth() {
    return this.view.contentWidth;
  }
  get onDidChangeContentHeight() {
    return this.view.onDidChangeContentHeight;
  }
  get onDidChangeContentWidth() {
    return this.view.onDidChangeContentWidth;
  }
  get scrollTop() {
    return this.view.getScrollTop();
  }
  set scrollTop(scrollTop) {
    this.view.setScrollTop(scrollTop);
  }
  get scrollLeft() {
    return this.view.getScrollLeft();
  }
  set scrollLeft(scrollLeft) {
    this.view.setScrollLeft(scrollLeft);
  }
  get scrollHeight() {
    return this.view.scrollHeight;
  }
  get renderHeight() {
    return this.view.renderHeight;
  }
  get firstVisibleIndex() {
    return this.view.firstVisibleIndex;
  }
  get firstMostlyVisibleIndex() {
    return this.view.firstMostlyVisibleIndex;
  }
  get lastVisibleIndex() {
    return this.view.lastVisibleIndex;
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  set ariaLabel(value) {
    this._ariaLabel = value;
    this.view.domNode.setAttribute("aria-label", value);
  }
  domFocus() {
    this.view.domNode.focus({ preventScroll: true });
  }
  layout(height, width) {
    this.view.layout(height, width);
  }
  triggerTypeNavigation() {
    this.typeNavigationController?.trigger();
  }
  setSelection(indexes, browserEvent) {
    for (const index of indexes) {
      if (index < 0 || index >= this.length) {
        throw new ListError(this.user, `Invalid index ${index}`);
      }
    }
    indexes = indexes.filter((i) => this.getElementGroupId(i) !== NotSelectableGroupId);
    this.selection.set(indexes, browserEvent);
  }
  getSelection() {
    return this.selection.get();
  }
  getSelectedElements() {
    return this.getSelection().map((i) => this.view.element(i));
  }
  setAnchor(index) {
    if (typeof index === "undefined") {
      this.anchor.set([]);
      return;
    }
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    this.anchor.set([index]);
  }
  getAnchor() {
    return this.anchor.get().at(0);
  }
  getAnchorElement() {
    const anchor = this.getAnchor();
    return typeof anchor === "undefined" ? void 0 : this.element(anchor);
  }
  /**
   * Gets the group ID for an element at the given index.
   * Returns undefined if no identity provider, no getGroupId method, or if the group ID is undefined.
   */
  getElementGroupId(index) {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return void 0;
    }
    const element = this.element(index);
    return identityProvider.getGroupId(element);
  }
  /**
   * Filters the given indices to only include those with a matching group ID.
   * If no identity provider or getGroupId method exists, returns the original indices.
   * If referenceGroupId is undefined, returns an empty array (elements without group IDs are not selectable).
   */
  filterIndicesByGroup(indices, referenceGroupId) {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return indices;
    }
    if (referenceGroupId === NotSelectableGroupId) {
      return [];
    }
    return indices.filter((index) => {
      const element = this.element(index);
      const groupId = identityProvider.getGroupId(element);
      return groupId === referenceGroupId;
    });
  }
  setFocus(indexes, browserEvent) {
    for (const index of indexes) {
      if (index < 0 || index >= this.length) {
        throw new ListError(this.user, `Invalid index ${index}`);
      }
    }
    this.focus.set(indexes, browserEvent);
  }
  focusNext(n = 1, loop = false, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const focus = this.focus.get();
    const index = this.findNextIndex(focus.length > 0 ? focus[0] + n : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  focusPrevious(n = 1, loop = false, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const focus = this.focus.get();
    const index = this.findPreviousIndex(focus.length > 0 ? focus[0] - n : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  async focusNextPage(browserEvent, filter) {
    let lastPageIndex = this.view.indexAt(this.view.getScrollTop() + this.view.renderHeight);
    lastPageIndex = lastPageIndex === 0 ? 0 : lastPageIndex - 1;
    const currentlyFocusedElementIndex = this.getFocus()[0];
    if (currentlyFocusedElementIndex !== lastPageIndex && (currentlyFocusedElementIndex === void 0 || lastPageIndex > currentlyFocusedElementIndex)) {
      const lastGoodPageIndex = this.findPreviousIndex(lastPageIndex, false, filter);
      if (lastGoodPageIndex > -1 && currentlyFocusedElementIndex !== lastGoodPageIndex) {
        this.setFocus([lastGoodPageIndex], browserEvent);
      } else {
        this.setFocus([lastPageIndex], browserEvent);
      }
    } else {
      const previousScrollTop = this.view.getScrollTop();
      let nextpageScrollTop = previousScrollTop + this.view.renderHeight;
      if (lastPageIndex > currentlyFocusedElementIndex) {
        nextpageScrollTop -= this.view.elementHeight(lastPageIndex);
      }
      this.view.setScrollTop(nextpageScrollTop);
      if (this.view.getScrollTop() !== previousScrollTop) {
        this.setFocus([]);
        await timeout(0);
        await this.focusNextPage(browserEvent, filter);
      }
    }
  }
  async focusPreviousPage(browserEvent, filter, getPaddingTop = () => 0) {
    let firstPageIndex;
    const paddingTop = getPaddingTop();
    const scrollTop = this.view.getScrollTop() + paddingTop;
    if (scrollTop === 0) {
      firstPageIndex = this.view.indexAt(scrollTop);
    } else {
      firstPageIndex = this.view.indexAfter(scrollTop - 1);
    }
    const currentlyFocusedElementIndex = this.getFocus()[0];
    if (currentlyFocusedElementIndex !== firstPageIndex && (currentlyFocusedElementIndex === void 0 || currentlyFocusedElementIndex >= firstPageIndex)) {
      const firstGoodPageIndex = this.findNextIndex(firstPageIndex, false, filter);
      if (firstGoodPageIndex > -1 && currentlyFocusedElementIndex !== firstGoodPageIndex) {
        this.setFocus([firstGoodPageIndex], browserEvent);
      } else {
        this.setFocus([firstPageIndex], browserEvent);
      }
    } else {
      const previousScrollTop = scrollTop;
      this.view.setScrollTop(scrollTop - this.view.renderHeight - paddingTop);
      if (this.view.getScrollTop() + getPaddingTop() !== previousScrollTop) {
        this.setFocus([]);
        await timeout(0);
        await this.focusPreviousPage(browserEvent, filter, getPaddingTop);
      }
    }
  }
  focusLast(browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const index = this.findPreviousIndex(this.length - 1, false, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  focusFirst(browserEvent, filter) {
    this.focusNth(0, browserEvent, filter);
  }
  focusNth(n, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const index = this.findNextIndex(n, false, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  findNextIndex(index, loop = false, filter) {
    for (let i = 0; i < this.length; i++) {
      if (index >= this.length && !loop) {
        return -1;
      }
      index = index % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }
      index++;
    }
    return -1;
  }
  findPreviousIndex(index, loop = false, filter) {
    for (let i = 0; i < this.length; i++) {
      if (index < 0 && !loop) {
        return -1;
      }
      index = (this.length + index % this.length) % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }
      index--;
    }
    return -1;
  }
  getFocus() {
    return this.focus.get();
  }
  getFocusedElements() {
    return this.getFocus().map((i) => this.view.element(i));
  }
  reveal(index, relativeTop, paddingTop = 0) {
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    const scrollTop = this.view.getScrollTop();
    const elementTop = this.view.elementTop(index);
    const elementHeight = this.view.elementHeight(index);
    if (isNumber(relativeTop)) {
      const m = elementHeight - this.view.renderHeight + paddingTop;
      this.view.setScrollTop(m * clamp(relativeTop, 0, 1) + elementTop - paddingTop);
    } else {
      const viewItemBottom = elementTop + elementHeight;
      const scrollBottom = scrollTop + this.view.renderHeight;
      if (elementTop < scrollTop + paddingTop && viewItemBottom >= scrollBottom) {
      } else if (elementTop < scrollTop + paddingTop || viewItemBottom >= scrollBottom && elementHeight >= this.view.renderHeight) {
        this.view.setScrollTop(elementTop - paddingTop);
      } else if (viewItemBottom >= scrollBottom) {
        this.view.setScrollTop(viewItemBottom - this.view.renderHeight);
      }
    }
  }
  /**
   * Returns the relative position of an element rendered in the list.
   * Returns `null` if the element isn't *entirely* in the visible viewport.
   */
  getRelativeTop(index, paddingTop = 0) {
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    const scrollTop = this.view.getScrollTop();
    const elementTop = this.view.elementTop(index);
    const elementHeight = this.view.elementHeight(index);
    if (elementTop < scrollTop + paddingTop || elementTop + elementHeight > scrollTop + this.view.renderHeight) {
      return null;
    }
    const m = elementHeight - this.view.renderHeight + paddingTop;
    return Math.abs((scrollTop + paddingTop - elementTop) / m);
  }
  isDOMFocused() {
    return isActiveElement(this.view.domNode);
  }
  getHTMLElement() {
    return this.view.domNode;
  }
  getScrollableElement() {
    return this.view.scrollableElementDomNode;
  }
  getElementID(index) {
    return this.view.getElementDomId(index);
  }
  getElementTop(index) {
    return this.view.elementTop(index);
  }
  style(styles) {
    this.styleController.style(styles);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  toListEvent({ indexes, browserEvent }) {
    return { indexes, elements: indexes.map((i) => this.view.element(i)), browserEvent };
  }
  _onFocusChange() {
    const focus = this.focus.get();
    this.view.domNode.classList.toggle("element-focused", focus.length > 0);
    this.onDidChangeActiveDescendant();
  }
  onDidChangeActiveDescendant() {
    const focus = this.focus.get();
    if (focus.length > 0) {
      let id;
      if (this.accessibilityProvider?.getActiveDescendantId) {
        id = this.accessibilityProvider.getActiveDescendantId(this.view.element(focus[0]));
      }
      this.view.domNode.setAttribute("aria-activedescendant", id || this.view.getElementDomId(focus[0]));
    } else {
      this.view.domNode.removeAttribute("aria-activedescendant");
    }
  }
  _onSelectionChange() {
    const selection = this.selection.get();
    this.view.domNode.classList.toggle("selection-none", selection.length === 0);
    this.view.domNode.classList.toggle("selection-single", selection.length === 1);
    this.view.domNode.classList.toggle("selection-multiple", selection.length > 1);
  }
  dispose() {
    this._onDidDispose.fire();
    this.disposables.dispose();
    this._onDidDispose.dispose();
  }
}
__decorateClass([
  memoize
], List.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], List.prototype, "onDidChangeSelection", 1);
__decorateClass([
  memoize
], List.prototype, "onContextMenu", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyDown", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyUp", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyPress", 1);
__decorateClass([
  memoize
], List.prototype, "onDidFocus", 1);
__decorateClass([
  memoize
], List.prototype, "onDidBlur", 1);
export {
  DefaultKeyboardNavigationDelegate,
  DefaultStyleController,
  List,
  MouseController,
  TypeNavigationMode,
  isActionItem,
  isButton,
  isMonacoCustomToggle,
  isMonacoEditor,
  isMonacoTwistie,
  isSelectionRangeChangeEvent,
  isSelectionSingleChangeEvent,
  isStickyScrollContainer,
  isStickyScrollElement,
  unthemedListStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgRXZlbnRIZWxwZXIsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgaXNBY3RpdmVFbGVtZW50LCBpc0VkaXRhYmxlRWxlbWVudCwgaXNIVE1MRWxlbWVudCwgaXNNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQgfSBmcm9tICcuLi8uLi9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQsIFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSB9IGZyb20gJy4uLy4uL3RvdWNoLmpzJztcbmltcG9ydCB7IGFsZXJ0LCBBcmlhUm9sZSB9IGZyb20gJy4uL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDb21iaW5lZFNwbGljZWFibGUgfSBmcm9tICcuL3NwbGljZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlRWxlbWVudENoYW5nZU9wdGlvbnMgfSBmcm9tICcuLi9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnRPcHRpb25zLmpzJztcbmltcG9ydCB7IGJpbmFyeVNlYXJjaCwgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudEJ1ZmZlcmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1hdGNoZXNGdXp6eTIsIG1hdGNoZXNQcmVmaXggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHksIFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSVNwbGljZWFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL2xpc3QuY3NzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJS2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGUsIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQsIElMaXN0RHJhZ0FuZERyb3AsIElMaXN0RHJhZ092ZXJSZWFjdGlvbiwgSUxpc3RFdmVudCwgSUxpc3RHZXN0dXJlRXZlbnQsIElMaXN0TW91c2VFdmVudCwgSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscywgSUxpc3RSZW5kZXJlciwgSUxpc3RUb3VjaEV2ZW50LCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgTGlzdEVycm9yLCBOb3RTZWxlY3RhYmxlR3JvdXBJZCwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlIH0gZnJvbSAnLi9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0VmlldywgSUxpc3RWaWV3QWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBJTGlzdFZpZXdEcmFnQW5kRHJvcCwgSUxpc3RWaWV3T3B0aW9ucywgSUxpc3RWaWV3T3B0aW9uc1VwZGF0ZSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IsIExpc3RWaWV3IH0gZnJvbSAnLi9saXN0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50LCBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbmludGVyZmFjZSBJVHJhaXRDaGFuZ2VFdmVudCB7XG5cdGluZGV4ZXM6IG51bWJlcltdO1xuXHRicm93c2VyRXZlbnQ/OiBVSUV2ZW50O1xufVxuXG50eXBlIElUcmFpdFRlbXBsYXRlRGF0YSA9IEhUTUxFbGVtZW50O1xuXG50eXBlIElBY2Nlc3NpYmlsaXR5VGVtcGxhdGVEYXRhID0ge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufTtcblxuaW50ZXJmYWNlIElSZW5kZXJlZENvbnRhaW5lciB7XG5cdHRlbXBsYXRlRGF0YTogSVRyYWl0VGVtcGxhdGVEYXRhO1xuXHRpbmRleDogbnVtYmVyO1xufVxuXG5jbGFzcyBUcmFpdFJlbmRlcmVyPFQ+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxULCBJVHJhaXRUZW1wbGF0ZURhdGE+IHtcblx0cHJpdmF0ZSByZW5kZXJlZEVsZW1lbnRzOiBJUmVuZGVyZWRDb250YWluZXJbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdHJhaXQ6IFRyYWl0PFQ+KSB7IH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgdGVtcGxhdGU6JHt0aGlzLnRyYWl0Lm5hbWV9YDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVHJhaXRUZW1wbGF0ZURhdGEge1xuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRyYWl0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWRFbGVtZW50SW5kZXggPSB0aGlzLnJlbmRlcmVkRWxlbWVudHMuZmluZEluZGV4KGVsID0+IGVsLnRlbXBsYXRlRGF0YSA9PT0gdGVtcGxhdGVEYXRhKTtcblxuXHRcdGlmIChyZW5kZXJlZEVsZW1lbnRJbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMucmVuZGVyZWRFbGVtZW50c1tyZW5kZXJlZEVsZW1lbnRJbmRleF07XG5cdFx0XHR0aGlzLnRyYWl0LnVucmVuZGVyKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZW5kZXJlZC5pbmRleCA9IGluZGV4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHsgaW5kZXgsIHRlbXBsYXRlRGF0YSB9O1xuXHRcdFx0dGhpcy5yZW5kZXJlZEVsZW1lbnRzLnB1c2gocmVuZGVyZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhaXQucmVuZGVySW5kZXgoaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRzcGxpY2Uoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgaW5zZXJ0Q291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkOiBJUmVuZGVyZWRDb250YWluZXJbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCByZW5kZXJlZEVsZW1lbnQgb2YgdGhpcy5yZW5kZXJlZEVsZW1lbnRzKSB7XG5cblx0XHRcdGlmIChyZW5kZXJlZEVsZW1lbnQuaW5kZXggPCBzdGFydCkge1xuXHRcdFx0XHRyZW5kZXJlZC5wdXNoKHJlbmRlcmVkRWxlbWVudCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlbmRlcmVkRWxlbWVudC5pbmRleCA+PSBzdGFydCArIGRlbGV0ZUNvdW50KSB7XG5cdFx0XHRcdHJlbmRlcmVkLnB1c2goe1xuXHRcdFx0XHRcdGluZGV4OiByZW5kZXJlZEVsZW1lbnQuaW5kZXggKyBpbnNlcnRDb3VudCAtIGRlbGV0ZUNvdW50LFxuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YTogcmVuZGVyZWRFbGVtZW50LnRlbXBsYXRlRGF0YVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMgPSByZW5kZXJlZDtcblx0fVxuXG5cdHJlbmRlckluZGV4ZXMoaW5kZXhlczogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgaW5kZXgsIHRlbXBsYXRlRGF0YSB9IG9mIHRoaXMucmVuZGVyZWRFbGVtZW50cykge1xuXHRcdFx0aWYgKGluZGV4ZXMuaW5kZXhPZihpbmRleCkgPiAtMSkge1xuXHRcdFx0XHR0aGlzLnRyYWl0LnJlbmRlckluZGV4KGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUcmFpdFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5yZW5kZXJlZEVsZW1lbnRzLmZpbmRJbmRleChlbCA9PiBlbC50ZW1wbGF0ZURhdGEgPT09IHRlbXBsYXRlRGF0YSk7XG5cblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJlZEVsZW1lbnRzLnNwbGljZShpbmRleCwgMSk7XG5cdH1cbn1cblxuY2xhc3MgVHJhaXQ8VD4gaW1wbGVtZW50cyBJU3BsaWNlYWJsZTxib29sZWFuPiwgSURpc3Bvc2FibGUge1xuXG5cdHByb3RlY3RlZCBpbmRleGVzOiBudW1iZXJbXSA9IFtdO1xuXHRwcm90ZWN0ZWQgc29ydGVkSW5kZXhlczogbnVtYmVyW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZSA9IG5ldyBFbWl0dGVyPElUcmFpdENoYW5nZUV2ZW50PigpO1xuXHRnZXQgb25DaGFuZ2UoKTogRXZlbnQ8SVRyYWl0Q2hhbmdlRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uQ2hhbmdlLmV2ZW50OyB9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3RyYWl0OyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHJlbmRlcmVyKCk6IFRyYWl0UmVuZGVyZXI8VD4ge1xuXHRcdHJldHVybiBuZXcgVHJhaXRSZW5kZXJlcjxUPih0aGlzKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3RyYWl0OiBzdHJpbmcpIHsgfVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogYm9vbGVhbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlmZiA9IGVsZW1lbnRzLmxlbmd0aCAtIGRlbGV0ZUNvdW50O1xuXHRcdGNvbnN0IGVuZCA9IHN0YXJ0ICsgZGVsZXRlQ291bnQ7XG5cdFx0Y29uc3Qgc29ydGVkSW5kZXhlczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgaSA9IDA7XG5cblx0XHR3aGlsZSAoaSA8IHRoaXMuc29ydGVkSW5kZXhlcy5sZW5ndGggJiYgdGhpcy5zb3J0ZWRJbmRleGVzW2ldIDwgc3RhcnQpIHtcblx0XHRcdHNvcnRlZEluZGV4ZXMucHVzaCh0aGlzLnNvcnRlZEluZGV4ZXNbaSsrXSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBlbGVtZW50cy5sZW5ndGg7IGorKykge1xuXHRcdFx0aWYgKGVsZW1lbnRzW2pdKSB7XG5cdFx0XHRcdHNvcnRlZEluZGV4ZXMucHVzaChqICsgc3RhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdoaWxlIChpIDwgdGhpcy5zb3J0ZWRJbmRleGVzLmxlbmd0aCAmJiB0aGlzLnNvcnRlZEluZGV4ZXNbaV0gPj0gZW5kKSB7XG5cdFx0XHRzb3J0ZWRJbmRleGVzLnB1c2godGhpcy5zb3J0ZWRJbmRleGVzW2krK10gKyBkaWZmKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcmVyLnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzLmxlbmd0aCk7XG5cdFx0dGhpcy5fc2V0KHNvcnRlZEluZGV4ZXMsIHNvcnRlZEluZGV4ZXMpO1xuXHR9XG5cblx0cmVuZGVySW5kZXgoaW5kZXg6IG51bWJlciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKHRoaXMuX3RyYWl0LCB0aGlzLmNvbnRhaW5zKGluZGV4KSk7XG5cdH1cblxuXHR1bnJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUodGhpcy5fdHJhaXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGluZGV4ZXMgd2hpY2ggc2hvdWxkIGhhdmUgdGhpcyB0cmFpdC5cblx0ICpcblx0ICogQHBhcmFtIGluZGV4ZXMgSW5kZXhlcyB3aGljaCBzaG91bGQgaGF2ZSB0aGlzIHRyYWl0LlxuXHQgKiBAcmV0dXJuIFRoZSBvbGQgaW5kZXhlcyB3aGljaCBoYWQgdGhpcyB0cmFpdC5cblx0ICovXG5cdHNldChpbmRleGVzOiBudW1iZXJbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fc2V0KGluZGV4ZXMsIFsuLi5pbmRleGVzXS5zb3J0KG51bWVyaWNTb3J0KSwgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldChpbmRleGVzOiBudW1iZXJbXSwgc29ydGVkSW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiBudW1iZXJbXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5pbmRleGVzO1xuXHRcdGNvbnN0IHNvcnRlZFJlc3VsdCA9IHRoaXMuc29ydGVkSW5kZXhlcztcblxuXHRcdHRoaXMuaW5kZXhlcyA9IGluZGV4ZXM7XG5cdFx0dGhpcy5zb3J0ZWRJbmRleGVzID0gc29ydGVkSW5kZXhlcztcblxuXHRcdGNvbnN0IHRvUmVuZGVyID0gZGlzanVuY3Rpb24oc29ydGVkUmVzdWx0LCBpbmRleGVzKTtcblx0XHR0aGlzLnJlbmRlcmVyLnJlbmRlckluZGV4ZXModG9SZW5kZXIpO1xuXG5cdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh7IGluZGV4ZXMsIGJyb3dzZXJFdmVudCB9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0KCk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleGVzO1xuXHR9XG5cblx0Y29udGFpbnMoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBiaW5hcnlTZWFyY2godGhpcy5zb3J0ZWRJbmRleGVzLCBpbmRleCwgbnVtZXJpY1NvcnQpID49IDA7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdGRpc3Bvc2UodGhpcy5fb25DaGFuZ2UpO1xuXHR9XG59XG5cbmNsYXNzIFNlbGVjdGlvblRyYWl0PFQ+IGV4dGVuZHMgVHJhaXQ8VD4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc2V0QXJpYVNlbGVjdGVkOiBib29sZWFuKSB7XG5cdFx0c3VwZXIoJ3NlbGVjdGVkJyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJJbmRleChpbmRleDogbnVtYmVyLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVySW5kZXgoaW5kZXgsIGNvbnRhaW5lcik7XG5cblx0XHRpZiAodGhpcy5zZXRBcmlhU2VsZWN0ZWQpIHtcblx0XHRcdGlmICh0aGlzLmNvbnRhaW5zKGluZGV4KSkge1xuXHRcdFx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ3RydWUnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgVHJhaXRTcGxpY2VhYmxlIGlzIHVzZWQgYXMgYSB1dGlsIGNsYXNzIHRvIGJlIGFibGVcbiAqIHRvIHByZXNlcnZlIHRyYWl0cyBhY3Jvc3Mgc3BsaWNlIGNhbGxzLCBnaXZlbiBhbiBpZGVudGl0eVxuICogcHJvdmlkZXIuXG4gKi9cbmNsYXNzIFRyYWl0U3BsaWNlYWJsZTxUPiBpbXBsZW1lbnRzIElTcGxpY2VhYmxlPFQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHRyYWl0OiBUcmFpdDxUPixcblx0XHRwcml2YXRlIHZpZXc6IElMaXN0VmlldzxUPixcblx0XHRwcml2YXRlIGlkZW50aXR5UHJvdmlkZXI/OiBJSWRlbnRpdHlQcm92aWRlcjxUPlxuXHQpIHsgfVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogVFtdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLnRyYWl0LnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIG5ldyBBcnJheShlbGVtZW50cy5sZW5ndGgpLmZpbGwoZmFsc2UpKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXN0RWxlbWVudHNXaXRoVHJhaXQgPSB0aGlzLnRyYWl0LmdldCgpLm1hcChpID0+IHRoaXMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQodGhpcy52aWV3LmVsZW1lbnQoaSkpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChwYXN0RWxlbWVudHNXaXRoVHJhaXQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50cmFpdC5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCBuZXcgQXJyYXkoZWxlbWVudHMubGVuZ3RoKS5maWxsKGZhbHNlKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFzdEVsZW1lbnRzV2l0aFRyYWl0U2V0ID0gbmV3IFNldChwYXN0RWxlbWVudHNXaXRoVHJhaXQpO1xuXHRcdGNvbnN0IGVsZW1lbnRzV2l0aFRyYWl0ID0gZWxlbWVudHMubWFwKGUgPT4gcGFzdEVsZW1lbnRzV2l0aFRyYWl0U2V0Lmhhcyh0aGlzLmlkZW50aXR5UHJvdmlkZXIhLmdldElkKGUpLnRvU3RyaW5nKCkpKTtcblx0XHR0aGlzLnRyYWl0LnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzV2l0aFRyYWl0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0xpc3RFbGVtZW50RGVzY2VuZGFudE9mQ2xhc3MoZTogSFRNTEVsZW1lbnQsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChlLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoZS5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1saXN0JykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIWUucGFyZW50RWxlbWVudCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBpc0xpc3RFbGVtZW50RGVzY2VuZGFudE9mQ2xhc3MoZS5wYXJlbnRFbGVtZW50LCBjbGFzc05hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb25hY29FZGl0b3IoZTogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlLCAnbW9uYWNvLWVkaXRvcicpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb25hY29DdXN0b21Ub2dnbGUoZTogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlLCAnbW9uYWNvLWN1c3RvbS10b2dnbGUnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWN0aW9uSXRlbShlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNMaXN0RWxlbWVudERlc2NlbmRhbnRPZkNsYXNzKGUsICdhY3Rpb24taXRlbScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb25hY29Ud2lzdGllKGU6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0xpc3RFbGVtZW50RGVzY2VuZGFudE9mQ2xhc3MoZSwgJ21vbmFjby10bC10d2lzdGllJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0aWNreVNjcm9sbEVsZW1lbnQoZTogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlLCAnbW9uYWNvLXRyZWUtc3RpY2t5LXJvdycpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdGlja3lTY3JvbGxDb250YWluZXIoZTogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0J1dHRvbihlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRpZiAoKGUudGFnTmFtZSA9PT0gJ0EnICYmIGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tYnV0dG9uJykpIHx8XG5cdFx0KGUudGFnTmFtZSA9PT0gJ0RJVicgJiYgZS5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1idXR0b24tZHJvcGRvd24nKSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChlLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWxpc3QnKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmICghZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGlzQnV0dG9uKGUucGFyZW50RWxlbWVudCk7XG59XG5cbmNsYXNzIEtleWJvYXJkQ29udHJvbGxlcjxUPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG11bHRpcGxlU2VsZWN0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgbXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IG9uS2V5RG93bigpOiBFdmVudDxTdGFuZGFyZEtleWJvYXJkRXZlbnQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuY2hhaW4oXG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2tleWRvd24nKSkuZXZlbnQsICQgPT5cblx0XHRcdCQuZmlsdGVyKGUgPT4gIWlzRWRpdGFibGVFbGVtZW50KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSlcblx0XHRcdFx0Lm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGlzdDogTGlzdDxUPixcblx0XHRwcml2YXRlIHZpZXc6IElMaXN0VmlldzxUPixcblx0XHRvcHRpb25zOiBJTGlzdE9wdGlvbnM8VD5cblx0KSB7XG5cdFx0dGhpcy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgPSBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uS2V5RG93bihlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5rZXlDb2RlKSB7XG5cdFx0XHRcdGNhc2UgS2V5Q29kZS5FbnRlcjpcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vbkVudGVyKGUpO1xuXHRcdFx0XHRjYXNlIEtleUNvZGUuVXBBcnJvdzpcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vblVwQXJyb3coZSk7XG5cdFx0XHRcdGNhc2UgS2V5Q29kZS5Eb3duQXJyb3c6XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub25Eb3duQXJyb3coZSk7XG5cdFx0XHRcdGNhc2UgS2V5Q29kZS5QYWdlVXA6XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub25QYWdlVXBBcnJvdyhlKTtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLlBhZ2VEb3duOlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9uUGFnZURvd25BcnJvdyhlKTtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLkVzY2FwZTpcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vbkVzY2FwZShlKTtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLktleUE6XG5cdFx0XHRcdFx0aWYgKHRoaXMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICYmIChwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGUubWV0YUtleSA6IGUuY3RybEtleSkpIHtcblx0XHRcdFx0XHRcdHRoaXMub25DdHJsQShlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlOiBJTGlzdE9wdGlvbnNVcGRhdGUpOiB2b2lkIHtcblx0XHRpZiAob3B0aW9uc1VwZGF0ZS5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgPSBvcHRpb25zVXBkYXRlLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRW50ZXIoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbih0aGlzLmxpc3QuZ2V0Rm9jdXMoKSwgZS5icm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblVwQXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5saXN0LmZvY3VzUHJldmlvdXMoMSwgZmFsc2UsIGUuYnJvd3NlckV2ZW50KTtcblx0XHRjb25zdCBlbCA9IHRoaXMubGlzdC5nZXRGb2N1cygpWzBdO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZWwpO1xuXHRcdHRoaXMubGlzdC5yZXZlYWwoZWwpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRG93bkFycm93KGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHRoaXMubGlzdC5mb2N1c05leHQoMSwgZmFsc2UsIGUuYnJvd3NlckV2ZW50KTtcblx0XHRjb25zdCBlbCA9IHRoaXMubGlzdC5nZXRGb2N1cygpWzBdO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZWwpO1xuXHRcdHRoaXMubGlzdC5yZXZlYWwoZWwpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUGFnZVVwQXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5saXN0LmZvY3VzUHJldmlvdXNQYWdlKGUuYnJvd3NlckV2ZW50KTtcblx0XHRjb25zdCBlbCA9IHRoaXMubGlzdC5nZXRGb2N1cygpWzBdO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZWwpO1xuXHRcdHRoaXMubGlzdC5yZXZlYWwoZWwpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUGFnZURvd25BcnJvdyhlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLmxpc3QuZm9jdXNOZXh0UGFnZShlLmJyb3dzZXJFdmVudCk7XG5cdFx0Y29uc3QgZWwgPSB0aGlzLmxpc3QuZ2V0Rm9jdXMoKVswXTtcblx0XHR0aGlzLmxpc3Quc2V0QW5jaG9yKGVsKTtcblx0XHR0aGlzLmxpc3QucmV2ZWFsKGVsKTtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkN0cmxBKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0bGV0IHNlbGVjdGlvbiA9IHJhbmdlKHRoaXMubGlzdC5sZW5ndGgpO1xuXG5cdFx0Ly8gRmlsdGVyIGJ5IGdyb3VwIGlmIGlkZW50aXR5IHByb3ZpZGVyIGhhcyBnZXRHcm91cElkXG5cdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnRzID0gdGhpcy5saXN0LmdldEZvY3VzKCk7XG5cdFx0Y29uc3QgcmVmZXJlbmNlR3JvdXBJZCA9IGZvY3VzZWRFbGVtZW50cy5sZW5ndGggPiAwID8gdGhpcy5saXN0LmdldEVsZW1lbnRHcm91cElkKGZvY3VzZWRFbGVtZW50c1swXSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlZmVyZW5jZUdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2VsZWN0aW9uID0gdGhpcy5saXN0LmZpbHRlckluZGljZXNCeUdyb3VwKHNlbGVjdGlvbiwgcmVmZXJlbmNlR3JvdXBJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihzZWxlY3Rpb24sIGUuYnJvd3NlckV2ZW50KTtcblx0XHR0aGlzLmxpc3Quc2V0QW5jaG9yKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Fc2NhcGUoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGlzdC5nZXRTZWxlY3Rpb24oKS5sZW5ndGgpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtdLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHR0aGlzLmxpc3Quc2V0QW5jaG9yKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5tdWx0aXBsZVNlbGVjdGlvbkRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBUeXBlTmF2aWdhdGlvbk1vZGUge1xuXHRBdXRvbWF0aWMsXG5cdFRyaWdnZXJcbn1cblxuZW51bSBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXJTdGF0ZSB7XG5cdElkbGUsXG5cdFR5cGluZ1xufVxuXG5leHBvcnQgY29uc3QgRGVmYXVsdEtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlIHtcblx0bWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKGV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChldmVudC5jdHJsS2V5IHx8IGV2ZW50Lm1ldGFLZXkgfHwgZXZlbnQuYWx0S2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChldmVudC5rZXlDb2RlID49IEtleUNvZGUuS2V5QSAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuS2V5Wilcblx0XHRcdHx8IChldmVudC5rZXlDb2RlID49IEtleUNvZGUuRGlnaXQwICYmIGV2ZW50LmtleUNvZGUgPD0gS2V5Q29kZS5EaWdpdDkpXG5cdFx0XHR8fCAoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLk51bXBhZDAgJiYgZXZlbnQua2V5Q29kZSA8PSBLZXlDb2RlLk51bXBhZDkpXG5cdFx0XHR8fCAoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLlNlbWljb2xvbiAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuUXVvdGUpO1xuXHR9XG59O1xuXG5jbGFzcyBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXI8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBlbmFibGVkID0gZmFsc2U7XG5cdHByaXZhdGUgc3RhdGU6IFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlclN0YXRlID0gVHlwZU5hdmlnYXRpb25Db250cm9sbGVyU3RhdGUuSWRsZTtcblxuXHRwcml2YXRlIG1vZGUgPSBUeXBlTmF2aWdhdGlvbk1vZGUuQXV0b21hdGljO1xuXHRwcml2YXRlIHRyaWdnZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHByZXZpb3VzbHlGb2N1c2VkID0gLTE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlbmFibGVkRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsaXN0OiBMaXN0PFQ+LFxuXHRcdHByaXZhdGUgdmlldzogSUxpc3RWaWV3PFQ+LFxuXHRcdHByaXZhdGUga2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VD4sXG5cdFx0cHJpdmF0ZSBrZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcjogSUtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyLFxuXHRcdHByaXZhdGUgZGVsZWdhdGU6IElLZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZVxuXHQpIHtcblx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMobGlzdC5vcHRpb25zKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSUxpc3RPcHRpb25zPFQ+KTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnMudHlwZU5hdmlnYXRpb25FbmFibGVkID8/IHRydWUpIHtcblx0XHRcdHRoaXMuZW5hYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlzYWJsZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZSA9IG9wdGlvbnMudHlwZU5hdmlnYXRpb25Nb2RlID8/IFR5cGVOYXZpZ2F0aW9uTW9kZS5BdXRvbWF0aWM7XG5cdH1cblxuXHR0cmlnZ2VyKCk6IHZvaWQge1xuXHRcdHRoaXMudHJpZ2dlcmVkID0gIXRoaXMudHJpZ2dlcmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBlbmFibGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0eXBpbmcgPSBmYWxzZTtcblxuXHRcdGNvbnN0IG9uQ2hhciA9IEV2ZW50LmNoYWluKHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2tleWRvd24nKSkuZXZlbnQsICQgPT5cblx0XHRcdCQuZmlsdGVyKGUgPT4gIWlzRWRpdGFibGVFbGVtZW50KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSlcblx0XHRcdFx0LmZpbHRlcigoKSA9PiB0aGlzLm1vZGUgPT09IFR5cGVOYXZpZ2F0aW9uTW9kZS5BdXRvbWF0aWMgfHwgdGhpcy50cmlnZ2VyZWQpXG5cdFx0XHRcdC5tYXAoZXZlbnQgPT4gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCkpXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiB0eXBpbmcgfHwgdGhpcy5rZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcihlKSlcblx0XHRcdFx0LmZpbHRlcihlID0+IHRoaXMuZGVsZWdhdGUubWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKGUpKVxuXHRcdFx0XHQuZm9yRWFjaChlID0+IEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSkpXG5cdFx0XHRcdC5tYXAoZXZlbnQgPT4gZXZlbnQuYnJvd3NlckV2ZW50LmtleSlcblx0XHQpO1xuXG5cdFx0Y29uc3Qgb25DbGVhciA9IEV2ZW50LmRlYm91bmNlPHN0cmluZywgbnVsbD4ob25DaGFyLCAoKSA9PiBudWxsLCA4MDAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBvbklucHV0ID0gRXZlbnQucmVkdWNlPHN0cmluZyB8IG51bGwsIHN0cmluZyB8IG51bGw+KEV2ZW50LmFueShvbkNoYXIsIG9uQ2xlYXIpLCAociwgaSkgPT4gaSA9PT0gbnVsbCA/IG51bGwgOiAoKHIgfHwgJycpICsgaSksIHVuZGVmaW5lZCwgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXG5cdFx0b25JbnB1dCh0aGlzLm9uSW5wdXQsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblx0XHRvbkNsZWFyKHRoaXMub25DbGVhciwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXG5cdFx0b25DaGFyKCgpID0+IHR5cGluZyA9IHRydWUsIHVuZGVmaW5lZCwgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdG9uQ2xlYXIoKCkgPT4gdHlwaW5nID0gZmFsc2UsIHVuZGVmaW5lZCwgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLnRyaWdnZXJlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNhYmxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmFibGVkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLnRyaWdnZXJlZCA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNsZWFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDAgJiYgZm9jdXNbMF0gPT09IHRoaXMucHJldmlvdXNseUZvY3VzZWQpIHtcblx0XHRcdC8vIExpc3Q6IHJlLWFubm91bmNlIGVsZW1lbnQgb24gdHlwaW5nIGVuZCBzaW5jZSB0eXBlZCBrZXlzIHdpbGwgaW50ZXJydXB0IGFyaWEgbGFiZWwgb2YgZm9jdXNlZCBlbGVtZW50XG5cdFx0XHQvLyBEbyBub3QgYW5ub3VuY2UgaWYgdGhlcmUgd2FzIGEgZm9jdXMgY2hhbmdlIGF0IHRoZSBlbmQgdG8gcHJldmVudCBkdXBsaWNhdGlvbiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTU5NjFcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMubGlzdC5vcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcj8uZ2V0QXJpYUxhYmVsKHRoaXMubGlzdC5lbGVtZW50KGZvY3VzWzBdKSk7XG5cblx0XHRcdGlmICh0eXBlb2YgYXJpYUxhYmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRhbGVydChhcmlhTGFiZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChhcmlhTGFiZWwpIHtcblx0XHRcdFx0YWxlcnQoYXJpYUxhYmVsLmdldCgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZCA9IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBvbklucHV0KHdvcmQ6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoIXdvcmQpIHtcblx0XHRcdHRoaXMuc3RhdGUgPSBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXJTdGF0ZS5JZGxlO1xuXHRcdFx0dGhpcy50cmlnZ2VyZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IHRoaXMubGlzdC5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gZm9jdXMubGVuZ3RoID4gMCA/IGZvY3VzWzBdIDogMDtcblx0XHRjb25zdCBkZWx0YSA9IHRoaXMuc3RhdGUgPT09IFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlclN0YXRlLklkbGUgPyAxIDogMDtcblx0XHR0aGlzLnN0YXRlID0gVHlwZU5hdmlnYXRpb25Db250cm9sbGVyU3RhdGUuVHlwaW5nO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gKHN0YXJ0ICsgaSArIGRlbHRhKSAlIHRoaXMubGlzdC5sZW5ndGg7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlci5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbCh0aGlzLnZpZXcuZWxlbWVudChpbmRleCkpO1xuXHRcdFx0Y29uc3QgbGFiZWxTdHIgPSBsYWJlbCAmJiBsYWJlbC50b1N0cmluZygpO1xuXG5cdFx0XHRpZiAodGhpcy5saXN0Lm9wdGlvbnMudHlwZU5hdmlnYXRpb25FbmFibGVkKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbGFiZWxTdHIgIT09ICd1bmRlZmluZWQnKSB7XG5cblx0XHRcdFx0XHQvLyBJZiBwcmVmaXggaXMgZm91bmQsIGZvY3VzIGFuZCByZXR1cm4gZWFybHlcblx0XHRcdFx0XHRpZiAobWF0Y2hlc1ByZWZpeCh3b3JkLCBsYWJlbFN0cikpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWQgPSBzdGFydDtcblx0XHRcdFx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0XHRcdHRoaXMubGlzdC5yZXZlYWwoaW5kZXgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGZ1enp5ID0gbWF0Y2hlc0Z1enp5Mih3b3JkLCBsYWJlbFN0cik7XG5cblx0XHRcdFx0XHRpZiAoZnV6enkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZ1enp5U2NvcmUgPSBmdXp6eVswXS5lbmQgLSBmdXp6eVswXS5zdGFydDtcblx0XHRcdFx0XHRcdC8vIGVuc3VyZXMgdGhhdCB3aGVuIGZ1enp5IG1hdGNoaW5nLCBkb2Vzbid0IGNsYXNoIHdpdGggcHJlZml4IG1hdGNoaW5nICgxIGlucHV0IHZzIDErIHNob3VsZCBiZSBwcmVmaXggYW5kIGZ1enp5IHJlc3BlY2l0dmVseSkuIEFsc28gbWFrZXMgc3VyZSB0aGF0IGV4YWN0IG1hdGNoZXMgYXJlIHByaW9yaXRpemVkLlxuXHRcdFx0XHRcdFx0aWYgKGZ1enp5U2NvcmUgPiAxICYmIGZ1enp5Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnByZXZpb3VzbHlGb2N1c2VkID0gc3RhcnQ7XG5cdFx0XHRcdFx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5saXN0LnJldmVhbChpbmRleCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGxhYmVsU3RyID09PSAndW5kZWZpbmVkJyB8fCBtYXRjaGVzUHJlZml4KHdvcmQsIGxhYmVsU3RyKSkge1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzbHlGb2N1c2VkID0gc3RhcnQ7XG5cdFx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbaW5kZXhdKTtcblx0XHRcdFx0dGhpcy5saXN0LnJldmVhbChpbmRleCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzYWJsZSgpO1xuXHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBET01Gb2N1c0NvbnRyb2xsZXI8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxpc3Q6IExpc3Q8VD4sXG5cdFx0cHJpdmF0ZSB2aWV3OiBJTGlzdFZpZXc8VD5cblx0KSB7XG5cdFx0Y29uc3Qgb25LZXlEb3duID0gRXZlbnQuY2hhaW4odGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodmlldy5kb21Ob2RlLCAna2V5ZG93bicpKS5ldmVudCwgJCA9PiAkXG5cdFx0XHQuZmlsdGVyKGUgPT4gIWlzRWRpdGFibGVFbGVtZW50KGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSlcblx0XHRcdC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKVxuXHRcdCk7XG5cblx0XHRjb25zdCBvblRhYiA9IEV2ZW50LmNoYWluKG9uS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5UYWIgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5ICYmICFlLnNoaWZ0S2V5ICYmICFlLmFsdEtleSkpO1xuXG5cdFx0b25UYWIodGhpcy5vblRhYiwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIG9uVGFiKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLnRhcmdldCAhPT0gdGhpcy52aWV3LmRvbU5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IHRoaXMubGlzdC5nZXRGb2N1cygpO1xuXG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzZWREb21FbGVtZW50ID0gdGhpcy52aWV3LmRvbUVsZW1lbnQoZm9jdXNbMF0pO1xuXG5cdFx0aWYgKCFmb2N1c2VkRG9tRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhYkluZGV4RWxlbWVudCA9IGZvY3VzZWREb21FbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1t0YWJJbmRleF0nKTtcblxuXHRcdGlmICghdGFiSW5kZXhFbGVtZW50IHx8ICEoaXNIVE1MRWxlbWVudCh0YWJJbmRleEVsZW1lbnQpKSB8fCB0YWJJbmRleEVsZW1lbnQudGFiSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3R5bGUgPSBnZXRXaW5kb3codGFiSW5kZXhFbGVtZW50KS5nZXRDb21wdXRlZFN0eWxlKHRhYkluZGV4RWxlbWVudCk7XG5cdFx0aWYgKHN0eWxlLnZpc2liaWxpdHkgPT09ICdoaWRkZW4nIHx8IHN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHRhYkluZGV4RWxlbWVudC5mb2N1cygpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdFRvdWNoRXZlbnQ8YW55Pik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBldmVudC5icm93c2VyRXZlbnQubWV0YUtleSA6IGV2ZW50LmJyb3dzZXJFdmVudC5jdHJsS2V5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0VG91Y2hFdmVudDxhbnk+KTogYm9vbGVhbiB7XG5cdHJldHVybiBldmVudC5icm93c2VyRXZlbnQuc2hpZnRLZXk7XG59XG5cbmZ1bmN0aW9uIGlzTW91c2VSaWdodENsaWNrKGV2ZW50OiBVSUV2ZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc01vdXNlRXZlbnQoZXZlbnQpICYmIGV2ZW50LmJ1dHRvbiA9PT0gMjtcbn1cblxuY29uc3QgRGVmYXVsdE11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciA9IHtcblx0aXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudCxcblx0aXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50XG59O1xuXG5leHBvcnQgY2xhc3MgTW91c2VDb250cm9sbGVyPFQ+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgbXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyOiBJTXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyPFQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vdXNlU3VwcG9ydDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblBvaW50ZXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJTGlzdE1vdXNlRXZlbnQ8VD4+KCkpO1xuXHRnZXQgb25Qb2ludGVyKCkgeyByZXR1cm4gdGhpcy5fb25Qb2ludGVyLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IocHJvdGVjdGVkIGxpc3Q6IExpc3Q8VD4pIHtcblx0XHRpZiAobGlzdC5vcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gZmFsc2UpIHtcblx0XHRcdHRoaXMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyID0gdGhpcy5saXN0Lm9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyIHx8IERlZmF1bHRNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI7XG5cdFx0fVxuXG5cdFx0dGhpcy5tb3VzZVN1cHBvcnQgPSB0eXBlb2YgbGlzdC5vcHRpb25zLm1vdXNlU3VwcG9ydCA9PT0gJ3VuZGVmaW5lZCcgfHwgISFsaXN0Lm9wdGlvbnMubW91c2VTdXBwb3J0O1xuXG5cdFx0aWYgKHRoaXMubW91c2VTdXBwb3J0KSB7XG5cdFx0XHRsaXN0Lm9uTW91c2VEb3duKHRoaXMub25Nb3VzZURvd24sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdFx0bGlzdC5vbkNvbnRleHRNZW51KHRoaXMub25Db250ZXh0TWVudSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRsaXN0Lm9uTW91c2VEYmxDbGljayh0aGlzLm9uRG91YmxlQ2xpY2ssIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdFx0bGlzdC5vblRvdWNoU3RhcnQodGhpcy5vbk1vdXNlRG93biwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChHZXN0dXJlLmFkZFRhcmdldChsaXN0LmdldEhUTUxFbGVtZW50KCkpKTtcblx0XHR9XG5cblx0XHRFdmVudC5hbnk8SUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdEdlc3R1cmVFdmVudDxhbnk+PihsaXN0Lm9uTW91c2VDbGljaywgbGlzdC5vbk1vdXNlTWlkZGxlQ2xpY2ssIGxpc3Qub25UYXApKHRoaXMub25WaWV3UG9pbnRlciwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElMaXN0T3B0aW9uc1VwZGF0ZSk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zVXBkYXRlLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciA9IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKG9wdGlvbnNVcGRhdGUubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0KSB7XG5cdFx0XHRcdHRoaXMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyID0gdGhpcy5saXN0Lm9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyIHx8IERlZmF1bHRNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZXZlbnQ6IElMaXN0TW91c2VFdmVudDxhbnk+IHwgSUxpc3RUb3VjaEV2ZW50PGFueT4pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZXZlbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdFRvdWNoRXZlbnQ8YW55Pik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIuaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgaXNTZWxlY3Rpb25DaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdFRvdWNoRXZlbnQ8YW55Pik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZXZlbnQpIHx8IHRoaXMuaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbk1vdXNlRG93bihlOiBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoaXNNb25hY29FZGl0b3IoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChnZXRBY3RpdmVFbGVtZW50KCkgIT09IGUuYnJvd3NlckV2ZW50LnRhcmdldCkge1xuXHRcdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG9uQ29udGV4dE1lbnUoZTogSUxpc3RDb250ZXh0TWVudUV2ZW50PFQ+KTogdm9pZCB7XG5cdFx0aWYgKGlzRWRpdGFibGVFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkgfHwgaXNNb25hY29FZGl0b3IoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdHlwZW9mIGUuaW5kZXggPT09ICd1bmRlZmluZWQnID8gW10gOiBbZS5pbmRleF07XG5cdFx0dGhpcy5saXN0LnNldEZvY3VzKGZvY3VzLCBlLmJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25WaWV3UG9pbnRlcihlOiBJTGlzdE1vdXNlRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubW91c2VTdXBwb3J0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzRWRpdGFibGVFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkgfHwgaXNNb25hY29FZGl0b3IoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmJyb3dzZXJFdmVudC5pc0hhbmRsZWRCeUxpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLmJyb3dzZXJFdmVudC5pc0hhbmRsZWRCeUxpc3QgPSB0cnVlO1xuXHRcdGNvbnN0IGZvY3VzID0gZS5pbmRleDtcblxuXHRcdGlmICh0eXBlb2YgZm9jdXMgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoW10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24oW10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdHRoaXMubGlzdC5zZXRBbmNob3IodW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1NlbGVjdGlvbkNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGFuZ2VTZWxlY3Rpb24oZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5saXN0LnNldEZvY3VzKFtmb2N1c10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHR0aGlzLmxpc3Quc2V0QW5jaG9yKGZvY3VzKTtcblxuXHRcdGlmICghaXNNb3VzZVJpZ2h0Q2xpY2soZS5icm93c2VyRXZlbnQpKSB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpcyBzZWxlY3RhYmxlIChnZXRHcm91cElkIG11c3Qgbm90IHJldHVybiB1bmRlZmluZWQpXG5cdFx0XHRjb25zdCBmb2N1c0dyb3VwSWQgPSB0aGlzLmxpc3QuZ2V0RWxlbWVudEdyb3VwSWQoZm9jdXMpO1xuXHRcdFx0aWYgKGZvY3VzR3JvdXBJZCAhPT0gTm90U2VsZWN0YWJsZUdyb3VwSWQpIHtcblx0XHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihbZm9jdXNdLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25Qb2ludGVyLmZpcmUoZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25Eb3VibGVDbGljayhlOiBJTGlzdE1vdXNlRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoaXNFZGl0YWJsZUVsZW1lbnQoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSB8fCBpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNTZWxlY3Rpb25DaGFuZ2VFdmVudChlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmJyb3dzZXJFdmVudC5pc0hhbmRsZWRCeUxpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLmJyb3dzZXJFdmVudC5pc0hhbmRsZWRCeUxpc3QgPSB0cnVlO1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5saXN0LmdldEZvY3VzKCk7XG5cdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihmb2N1cywgZS5icm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjaGFuZ2VTZWxlY3Rpb24oZTogSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXMgPSBlLmluZGV4ITtcblx0XHRsZXQgYW5jaG9yID0gdGhpcy5saXN0LmdldEFuY2hvcigpO1xuXG5cdFx0aWYgKHRoaXMuaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRpZiAodHlwZW9mIGFuY2hvciA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvY3VzID0gdGhpcy5saXN0LmdldEZvY3VzKClbMF07XG5cdFx0XHRcdGFuY2hvciA9IGN1cnJlbnRGb2N1cyA/PyBmb2N1cztcblx0XHRcdFx0dGhpcy5saXN0LnNldEFuY2hvcihhbmNob3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtaW4gPSBNYXRoLm1pbihhbmNob3IsIGZvY3VzKTtcblx0XHRcdGNvbnN0IG1heCA9IE1hdGgubWF4KGFuY2hvciwgZm9jdXMpO1xuXHRcdFx0bGV0IHJhbmdlU2VsZWN0aW9uID0gcmFuZ2UobWluLCBtYXggKyAxKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRFbGVtZW50ID0gdGhpcy5saXN0LmdldFNlbGVjdGlvbigpWzBdO1xuXHRcdFx0aWYgKHNlbGVjdGVkRWxlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZUdyb3VwSWQgPSB0aGlzLmxpc3QuZ2V0RWxlbWVudEdyb3VwSWQoc2VsZWN0ZWRFbGVtZW50KTtcblx0XHRcdFx0aWYgKHJlZmVyZW5jZUdyb3VwSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJhbmdlU2VsZWN0aW9uID0gdGhpcy5saXN0LmZpbHRlckluZGljZXNCeUdyb3VwKHJhbmdlU2VsZWN0aW9uLCByZWZlcmVuY2VHcm91cElkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmxpc3QuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRjb25zdCBjb250aWd1b3VzUmFuZ2UgPSBnZXRDb250aWd1b3VzUmFuZ2VDb250YWluaW5nKGRpc2p1bmN0aW9uKHNlbGVjdGlvbiwgW2FuY2hvcl0pLCBhbmNob3IpO1xuXG5cdFx0XHRpZiAoY29udGlndW91c1JhbmdlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbiA9IGRpc2p1bmN0aW9uKHJhbmdlU2VsZWN0aW9uLCByZWxhdGl2ZUNvbXBsZW1lbnQoc2VsZWN0aW9uLCBjb250aWd1b3VzUmFuZ2UpKTtcblx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24obmV3U2VsZWN0aW9uLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoW2ZvY3VzXSwgZS5icm93c2VyRXZlbnQpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMubGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbiA9IHNlbGVjdGlvbi5maWx0ZXIoaSA9PiBpICE9PSBmb2N1cyk7XG5cblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbZm9jdXNdKTtcblx0XHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZm9jdXMpO1xuXG5cdFx0XHRjb25zdCBmb2N1c0dyb3VwSWQgPSB0aGlzLmxpc3QuZ2V0RWxlbWVudEdyb3VwSWQoZm9jdXMpO1xuXHRcdFx0aWYgKGZvY3VzR3JvdXBJZCA9PT0gTm90U2VsZWN0YWJsZUdyb3VwSWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBDYW5ub3Qgc2VsZWN0IHRoaXMgZWxlbWVudCwgZG8gbm90aGluZ1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCA9PT0gbmV3U2VsZWN0aW9uLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBpdGVtc1RvQmVTZWxlY3RlZCA9IGZvY3VzR3JvdXBJZCAhPT0gdW5kZWZpbmVkID9cblx0XHRcdFx0XHR0aGlzLmxpc3QuZmlsdGVySW5kaWNlc0J5R3JvdXAoWy4uLm5ld1NlbGVjdGlvbiwgZm9jdXNdLCBmb2N1c0dyb3VwSWQpXG5cdFx0XHRcdFx0OiBbLi4ubmV3U2VsZWN0aW9uLCBmb2N1c107XG5cdFx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24oaXRlbXNUb0JlU2VsZWN0ZWQsIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24obmV3U2VsZWN0aW9uLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI8VD4ge1xuXHRpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pOiBib29sZWFuO1xuXHRpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQ6IElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0eWxlQ29udHJvbGxlciB7XG5cdHN0eWxlKHN0eWxlczogSUxpc3RTdHlsZXMpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+IGV4dGVuZHMgSUxpc3RWaWV3QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+IHtcblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFQpOiBzdHJpbmcgfCBJT2JzZXJ2YWJsZTxzdHJpbmc+IHwgbnVsbDtcblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdGdldFdpZGdldFJvbGU/KCk6IEFyaWFSb2xlO1xuXHRnZXRBcmlhTGV2ZWw/KGVsZW1lbnQ6IFQpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlRGVzY2VuZGFudD86IEV2ZW50PHZvaWQ+O1xuXHRnZXRBY3RpdmVEZXNjZW5kYW50SWQ/KGVsZW1lbnQ6IFQpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0U3R5bGVDb250cm9sbGVyIGltcGxlbWVudHMgSVN0eWxlQ29udHJvbGxlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQsIHByaXZhdGUgc2VsZWN0b3JTdWZmaXg6IHN0cmluZykgeyB9XG5cblx0c3R5bGUoc3R5bGVzOiBJTGlzdFN0eWxlcyk6IHZvaWQge1xuXHRcdGNvbnN0IHN1ZmZpeCA9IHRoaXMuc2VsZWN0b3JTdWZmaXggJiYgYC4ke3RoaXMuc2VsZWN0b3JTdWZmaXh9YDtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKHN0eWxlcy5saXN0QmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvd3MgeyBiYWNrZ3JvdW5kOiAke3N0eWxlcy5saXN0QmFja2dyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0JhY2tncm91bmR9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQ6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0Rm9jdXNCYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGNvbG9yOiAke3N0eWxlcy5saXN0Rm9jdXNGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQ6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZH07IH1gKTsgLy8gb3ZlcndyaXRlIDpob3ZlciBzdHlsZSBpbiB0aGlzIGNhc2UhXG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGNvbG9yOiAke3N0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCAuY29kaWNvbiB7IGNvbG9yOiAke3N0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25CYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0XHQubW9uYWNvLWRyYWctaW1hZ2Uke3N1ZmZpeH0sXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkLmZvY3VzZWQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0XHQubW9uYWNvLWRyYWctaW1hZ2Uke3N1ZmZpeH0sXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkLmZvY3VzZWQgeyBjb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZH07IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBjb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgLmNvZGljb24geyBjb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZH07IH1gKTsgLy8gb3ZlcndyaXRlIDpob3ZlciBzdHlsZSBpbiB0aGlzIGNhc2UhXG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIHsgYmFja2dyb3VuZC1jb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmR9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogICR7c3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGNvbG9yOiAke3N0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEhvdmVyQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06bm90KC5kcm9wLXRhcmdldCk6bm90KC5kcmFnZ2luZykgLm1vbmFjby1saXN0LXJvdzpob3Zlcjpub3QoLnNlbGVjdGVkKTpub3QoLmZvY3VzZWQpIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEhvdmVyQmFja2dyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RIb3ZlckZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9Om5vdCguZHJvcC10YXJnZXQpOm5vdCguZHJhZ2dpbmcpIC5tb25hY28tbGlzdC1yb3c6aG92ZXI6bm90KC5zZWxlY3RlZCk6bm90KC5mb2N1c2VkKSB7IGNvbG9yOiAgJHtzdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHQvKipcblx0XHQgKiBPdXRsaW5lc1xuXHRcdCAqL1xuXHRcdGNvbnN0IGZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZSA9IGFzQ3NzVmFsdWVXaXRoRGVmYXVsdChzdHlsZXMubGlzdEZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZSwgYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5saXN0U2VsZWN0aW9uT3V0bGluZSwgc3R5bGVzLmxpc3RGb2N1c091dGxpbmUgPz8gJycpKTtcblx0XHRpZiAoZm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lKSB7IC8vIGRlZmF1bHQ6IGxpc3RGb2N1c091dGxpbmVcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZC5zZWxlY3RlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke2ZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4O31gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHsgLy8gZGVmYXVsdDogc2V0XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0XHQubW9uYWNvLWRyYWctaW1hZ2Uke3N1ZmZpeH0sXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQsXG5cdFx0XHRcdC5jb250ZXh0LW1lbnUtdmlzaWJsZSAubW9uYWNvLWxpc3Qke3N1ZmZpeH0ubGFzdC1mb2N1c2VkIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke3N0eWxlcy5saXN0Rm9jdXNPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluYWN0aXZlRm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lID0gYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5saXN0U2VsZWN0aW9uT3V0bGluZSwgc3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZSA/PyAnJyk7XG5cdFx0aWYgKGluYWN0aXZlRm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQuc2VsZWN0ZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7aW5hY3RpdmVGb2N1c0FuZFNlbGVjdGlvbk91dGxpbmV9OyBvdXRsaW5lLW9mZnNldDogLTFweDsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdFNlbGVjdGlvbk91dGxpbmUpIHsgLy8gZGVmYXVsdDogYWN0aXZlQ29udHJhc3RCb3JkZXJcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZSkgeyAvLyBkZWZhdWx0OiBudWxsXG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBvdXRsaW5lOiAxcHggZG90dGVkICR7c3R5bGVzLmxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SG92ZXJPdXRsaW5lKSB7ICAvLyBkZWZhdWx0OiBhY3RpdmVDb250cmFzdEJvcmRlclxuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdzpob3ZlciB7IG91dGxpbmU6IDFweCBkYXNoZWQgJHtzdHlsZXMubGlzdEhvdmVyT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0RHJvcE92ZXJCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH0uZHJvcC10YXJnZXQsXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93cy5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZHJvcC10YXJnZXQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0RHJvcE92ZXJCYWNrZ3JvdW5kfSAhaW1wb3J0YW50OyBjb2xvcjogaW5oZXJpdCAhaW1wb3J0YW50OyB9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3REcm9wQmV0d2VlbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvd3MuZHJvcC10YXJnZXQtYmVmb3JlIC5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQ6OmJlZm9yZSxcblx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmRyb3AtdGFyZ2V0LWJlZm9yZTo6YmVmb3JlIHtcblx0XHRcdFx0Y29udGVudDogXCJcIjsgcG9zaXRpb246IGFic29sdXRlOyB0b3A6IDBweDsgbGVmdDogMHB4OyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxcHg7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3REcm9wQmV0d2VlbkJhY2tncm91bmR9O1xuXHRcdFx0fWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93cy5kcm9wLXRhcmdldC1hZnRlciAubW9uYWNvLWxpc3Qtcm93Omxhc3QtY2hpbGQ6OmFmdGVyLFxuXHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZHJvcC10YXJnZXQtYWZ0ZXI6OmFmdGVyIHtcblx0XHRcdFx0Y29udGVudDogXCJcIjsgcG9zaXRpb246IGFic29sdXRlOyBib3R0b206IDBweDsgbGVmdDogMHB4OyB3aWR0aDogMTAwJTsgaGVpZ2h0OiAxcHg7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3REcm9wQmV0d2VlbkJhY2tncm91bmR9O1xuXHRcdFx0fWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMudGFibGVDb2x1bW5zQm9yZGVyKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0XHQubW9uYWNvLXRhYmxlID4gLm1vbmFjby1zcGxpdC12aWV3Mixcblx0XHRcdFx0Lm1vbmFjby10YWJsZSA+IC5tb25hY28tc3BsaXQtdmlldzIgLm1vbmFjby1zYXNoLnZlcnRpY2FsOjpiZWZvcmUsXG5cdFx0XHRcdC5tb25hY28tZW5hYmxlLW1vdGlvbiAubW9uYWNvLXRhYmxlOmhvdmVyID4gLm1vbmFjby1zcGxpdC12aWV3Mixcblx0XHRcdFx0Lm1vbmFjby1lbmFibGUtbW90aW9uIC5tb25hY28tdGFibGU6aG92ZXIgPiAubW9uYWNvLXNwbGl0LXZpZXcyIC5tb25hY28tc2FzaC52ZXJ0aWNhbDo6YmVmb3JlIHtcblx0XHRcdFx0XHRib3JkZXItY29sb3I6ICR7c3R5bGVzLnRhYmxlQ29sdW1uc0JvcmRlcn07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQubW9uYWNvLWVuYWJsZS1tb3Rpb24gLm1vbmFjby10YWJsZSA+IC5tb25hY28tc3BsaXQtdmlldzIsXG5cdFx0XHRcdC5tb25hY28tZW5hYmxlLW1vdGlvbiAubW9uYWNvLXRhYmxlID4gLm1vbmFjby1zcGxpdC12aWV3MiAubW9uYWNvLXNhc2gudmVydGljYWw6OmJlZm9yZSB7XG5cdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB0cmFuc3BhcmVudDtcblx0XHRcdFx0fVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy50YWJsZU9kZFJvd3NCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tdGFibGUgLm1vbmFjby1saXN0LXJvd1tkYXRhLXBhcml0eT1vZGRdOm5vdCguZm9jdXNlZCk6bm90KC5zZWxlY3RlZCk6bm90KDpob3ZlcikgLm1vbmFjby10YWJsZS10cixcblx0XHRcdFx0Lm1vbmFjby10YWJsZSAubW9uYWNvLWxpc3Q6bm90KDpmb2N1cykgLm1vbmFjby1saXN0LXJvd1tkYXRhLXBhcml0eT1vZGRdLmZvY3VzZWQ6bm90KC5zZWxlY3RlZCk6bm90KDpob3ZlcikgLm1vbmFjby10YWJsZS10cixcblx0XHRcdFx0Lm1vbmFjby10YWJsZSAubW9uYWNvLWxpc3Q6bm90KC5mb2N1c2VkKSAubW9uYWNvLWxpc3Qtcm93W2RhdGEtcGFyaXR5PW9kZF0uZm9jdXNlZDpub3QoLnNlbGVjdGVkKTpub3QoOmhvdmVyKSAubW9uYWNvLXRhYmxlLXRyIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy50YWJsZU9kZFJvd3NCYWNrZ3JvdW5kQ29sb3J9O1xuXHRcdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXIge1xuXHQoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdE9wdGlvbnNVcGRhdGUgZXh0ZW5kcyBJTGlzdFZpZXdPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgdHlwZU5hdmlnYXRpb25FbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHlwZU5hdmlnYXRpb25Nb2RlPzogVHlwZU5hdmlnYXRpb25Nb2RlO1xuXHRyZWFkb25seSBtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0T3B0aW9uczxUPiBleHRlbmRzIElMaXN0T3B0aW9uc1VwZGF0ZSB7XG5cdHJlYWRvbmx5IGlkZW50aXR5UHJvdmlkZXI/OiBJSWRlbnRpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkgZG5kPzogSUxpc3REcmFnQW5kRHJvcDxUPjtcblx0cmVhZG9ubHkga2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcj86IElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBrZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZT86IElLZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZTtcblx0cmVhZG9ubHkga2V5Ym9hcmRTdXBwb3J0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyPzogSU11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjxUPjtcblx0cmVhZG9ubHkgc3R5bGVDb250cm9sbGVyPzogKHN1ZmZpeDogc3RyaW5nKSA9PiBJU3R5bGVDb250cm9sbGVyO1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/OiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkga2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXI/OiBJS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXI7XG5cblx0Ly8gbGlzdCB2aWV3IG9wdGlvbnNcblx0cmVhZG9ubHkgdXNlU2hhZG93cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZlcnRpY2FsU2Nyb2xsTW9kZT86IFNjcm9sbGJhclZpc2liaWxpdHk7XG5cdHJlYWRvbmx5IHNldFJvd0xpbmVIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzZXRSb3dIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdXBwb3J0RHluYW1pY0hlaWdodHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBtb3VzZVN1cHBvcnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB1c2VyU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGluZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbEJ5UGFnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRyYW5zZm9ybU9wdGltaXphdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNtb290aFNjcm9sbGluZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucz86IFNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucztcblx0cmVhZG9ubHkgYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbml0aWFsU2l6ZT86IERpbWVuc2lvbjtcblx0cmVhZG9ubHkgcGFkZGluZ1RvcD86IG51bWJlcjtcblx0cmVhZG9ubHkgcGFkZGluZ0JvdHRvbT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdFN0eWxlcyB7XG5cdGxpc3RCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RGb2N1c0JhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZvY3VzRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0QWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEhvdmVyQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3REcm9wT3ZlckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdERyb3BCZXR3ZWVuQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0Rm9jdXNPdXRsaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0U2VsZWN0aW9uT3V0bGluZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SG92ZXJPdXRsaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRyZWVJbmRlbnRHdWlkZXNTdHJva2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dHJlZUluYWN0aXZlSW5kZW50R3VpZGVzU3Ryb2tlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRyZWVTdGlja3lTY3JvbGxCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRyZWVTdGlja3lTY3JvbGxCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dHJlZVN0aWNreVNjcm9sbFNoYWRvdzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0YWJsZUNvbHVtbnNCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dGFibGVPZGRSb3dzQmFja2dyb3VuZENvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjb25zdCB1bnRoZW1lZExpc3RTdHlsZXM6IElMaXN0U3R5bGVzID0ge1xuXHRsaXN0Rm9jdXNCYWNrZ3JvdW5kOiAnIzdGQjBEMCcsXG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiAnIzBFNjM5QycsXG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiAnI0ZGRkZGRicsXG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogJyNGRkZGRkYnLFxuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lOiAnIzkwQzJGOScsXG5cdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6ICcjMDk0NzcxJyxcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZDogJyNGRkZGRkYnLFxuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiAnIzNGM0Y0NicsXG5cdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiAnI0ZGRkZGRicsXG5cdGxpc3RIb3ZlckJhY2tncm91bmQ6ICcjMkEyRDJFJyxcblx0bGlzdERyb3BPdmVyQmFja2dyb3VuZDogJyMzODNCM0QnLFxuXHRsaXN0RHJvcEJldHdlZW5CYWNrZ3JvdW5kOiAnI0VFRUVFRScsXG5cdHRyZWVJbmRlbnRHdWlkZXNTdHJva2U6ICcjYTlhOWE5Jyxcblx0dHJlZUluYWN0aXZlSW5kZW50R3VpZGVzU3Ryb2tlOiBDb2xvci5mcm9tSGV4KCcjYTlhOWE5JykudHJhbnNwYXJlbnQoMC40KS50b1N0cmluZygpLFxuXHR0YWJsZUNvbHVtbnNCb3JkZXI6IENvbG9yLmZyb21IZXgoJyNjY2NjY2MnKS50cmFuc3BhcmVudCgwLjIpLnRvU3RyaW5nKCksXG5cdHRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvcjogQ29sb3IuZnJvbUhleCgnI2NjY2NjYycpLnRyYW5zcGFyZW50KDAuMDQpLnRvU3RyaW5nKCksXG5cdGxpc3RCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGxpc3RGb2N1c0ZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0bGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRsaXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0bGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGxpc3RIb3ZlckZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0bGlzdEZvY3VzT3V0bGluZTogdW5kZWZpbmVkLFxuXHRsaXN0SW5hY3RpdmVGb2N1c091dGxpbmU6IHVuZGVmaW5lZCxcblx0bGlzdFNlbGVjdGlvbk91dGxpbmU6IHVuZGVmaW5lZCxcblx0bGlzdEhvdmVyT3V0bGluZTogdW5kZWZpbmVkLFxuXHR0cmVlU3RpY2t5U2Nyb2xsQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHR0cmVlU3RpY2t5U2Nyb2xsQm9yZGVyOiB1bmRlZmluZWQsXG5cdHRyZWVTdGlja3lTY3JvbGxTaGFkb3c6IHVuZGVmaW5lZFxufTtcblxuY29uc3QgRGVmYXVsdE9wdGlvbnM6IElMaXN0T3B0aW9uczxhbnk+ID0ge1xuXHRrZXlib2FyZFN1cHBvcnQ6IHRydWUsXG5cdG1vdXNlU3VwcG9ydDogdHJ1ZSxcblx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRkbmQ6IHtcblx0XHRnZXREcmFnVVJJKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0XHRvbkRyYWdTdGFydCgpOiB2b2lkIHsgfSxcblx0XHRvbkRyYWdPdmVyKCkgeyByZXR1cm4gZmFsc2U7IH0sXG5cdFx0ZHJvcCgpIHsgfSxcblx0XHRkaXNwb3NlKCkgeyB9XG5cdH1cbn07XG5cbi8vIFRPRE9ASm9hbzogbW92ZSB0aGVzZSB1dGlscyBpbnRvIGEgU29ydGVkQXJyYXkgY2xhc3NcblxuZnVuY3Rpb24gZ2V0Q29udGlndW91c1JhbmdlQ29udGFpbmluZyhyYW5nZTogbnVtYmVyW10sIHZhbHVlOiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdGNvbnN0IGluZGV4ID0gcmFuZ2UuaW5kZXhPZih2YWx1ZSk7XG5cblx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0bGV0IGkgPSBpbmRleCAtIDE7XG5cdHdoaWxlIChpID49IDAgJiYgcmFuZ2VbaV0gPT09IHZhbHVlIC0gKGluZGV4IC0gaSkpIHtcblx0XHRyZXN1bHQucHVzaChyYW5nZVtpLS1dKTtcblx0fVxuXG5cdHJlc3VsdC5yZXZlcnNlKCk7XG5cdGkgPSBpbmRleDtcblx0d2hpbGUgKGkgPCByYW5nZS5sZW5ndGggJiYgcmFuZ2VbaV0gPT09IHZhbHVlICsgKGkgLSBpbmRleCkpIHtcblx0XHRyZXN1bHQucHVzaChyYW5nZVtpKytdKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogR2l2ZW4gdHdvIHNvcnRlZCBjb2xsZWN0aW9ucyBvZiBudW1iZXJzLCByZXR1cm5zIHRoZSBpbnRlcnNlY3Rpb25cbiAqIGJldHdlZW4gdGhlbSAoT1IpLlxuICovXG5mdW5jdGlvbiBkaXNqdW5jdGlvbihvbmU6IG51bWJlcltdLCBvdGhlcjogbnVtYmVyW10pOiBudW1iZXJbXSB7XG5cdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0bGV0IGkgPSAwLCBqID0gMDtcblxuXHR3aGlsZSAoaSA8IG9uZS5sZW5ndGggfHwgaiA8IG90aGVyLmxlbmd0aCkge1xuXHRcdGlmIChpID49IG9uZS5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKG90aGVyW2orK10pO1xuXHRcdH0gZWxzZSBpZiAoaiA+PSBvdGhlci5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9uZVtpKytdKTtcblx0XHR9IGVsc2UgaWYgKG9uZVtpXSA9PT0gb3RoZXJbal0pIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9uZVtpXSk7XG5cdFx0XHRpKys7XG5cdFx0XHRqKys7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9IGVsc2UgaWYgKG9uZVtpXSA8IG90aGVyW2pdKSB7XG5cdFx0XHRyZXN1bHQucHVzaChvbmVbaSsrXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5wdXNoKG90aGVyW2orK10pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogR2l2ZW4gdHdvIHNvcnRlZCBjb2xsZWN0aW9ucyBvZiBudW1iZXJzLCByZXR1cm5zIHRoZSByZWxhdGl2ZVxuICogY29tcGxlbWVudCBiZXR3ZWVuIHRoZW0gKFhPUikuXG4gKi9cbmZ1bmN0aW9uIHJlbGF0aXZlQ29tcGxlbWVudChvbmU6IG51bWJlcltdLCBvdGhlcjogbnVtYmVyW10pOiBudW1iZXJbXSB7XG5cdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0bGV0IGkgPSAwLCBqID0gMDtcblxuXHR3aGlsZSAoaSA8IG9uZS5sZW5ndGggfHwgaiA8IG90aGVyLmxlbmd0aCkge1xuXHRcdGlmIChpID49IG9uZS5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKG90aGVyW2orK10pO1xuXHRcdH0gZWxzZSBpZiAoaiA+PSBvdGhlci5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9uZVtpKytdKTtcblx0XHR9IGVsc2UgaWYgKG9uZVtpXSA9PT0gb3RoZXJbal0pIHtcblx0XHRcdGkrKztcblx0XHRcdGorKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH0gZWxzZSBpZiAob25lW2ldIDwgb3RoZXJbal0pIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9uZVtpKytdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aisrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IG51bWVyaWNTb3J0ID0gKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiBhIC0gYjtcblxuY2xhc3MgUGlwZWxpbmVSZW5kZXJlcjxUPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8VCwgYW55PiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfdGVtcGxhdGVJZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPGFueSAvKiBUT0RPQGpvYW8gKi8sIGFueT5bXVxuXHQpIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3RlbXBsYXRlSWQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogYW55W10ge1xuXHRcdHJldHVybiB0aGlzLnJlbmRlcmVycy5tYXAociA9PiByLnJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcikpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IGFueVtdLCByZW5kZXJEZXRhaWxzPzogSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdGxldCBpID0gMDtcblxuXHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgdGhpcy5yZW5kZXJlcnMpIHtcblx0XHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YVtpKytdLCByZW5kZXJEZXRhaWxzKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IGFueVtdLCByZW5kZXJEZXRhaWxzPzogSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdGxldCBpID0gMDtcblxuXHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgdGhpcy5yZW5kZXJlcnMpIHtcblx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50Py4oZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YVtpXSwgcmVuZGVyRGV0YWlscyk7XG5cblx0XHRcdGkgKz0gMTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRsZXQgaSA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IHJlbmRlcmVyIG9mIHRoaXMucmVuZGVyZXJzKSB7XG5cdFx0XHRyZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhW2krK10pO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBBY2Nlc3NpYmlsdHlSZW5kZXJlcjxUPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8VCwgSUFjY2Vzc2liaWxpdHlUZW1wbGF0ZURhdGE+IHtcblxuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnYTE4bic7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFjY2Vzc2liaWxpdHlUZW1wbGF0ZURhdGEge1xuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCBkYXRhOiBJQWNjZXNzaWJpbGl0eVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBvYnNlcnZhYmxlID0gKGFyaWFMYWJlbCAmJiB0eXBlb2YgYXJpYUxhYmVsICE9PSAnc3RyaW5nJykgPyBhcmlhTGFiZWwgOiBjb25zdE9ic2VydmFibGUoYXJpYUxhYmVsKTtcblxuXHRcdGRhdGEuZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuc2V0QXJpYUxhYmVsKHJlYWRlci5yZWFkT2JzZXJ2YWJsZShvYnNlcnZhYmxlKSwgZGF0YS5jb250YWluZXIpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFyaWFMZXZlbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMZXZlbCAmJiB0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRBcmlhTGV2ZWwoZWxlbWVudCk7XG5cblx0XHRpZiAodHlwZW9mIGFyaWFMZXZlbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sZXZlbCcsIGAke2FyaWFMZXZlbH1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5jb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxldmVsJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRBcmlhTGFiZWwoYXJpYUxhYmVsOiBzdHJpbmcgfCBudWxsLCBlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmIChhcmlhTGFiZWwpIHtcblx0XHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY2Nlc3NpYmlsaXR5VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQWNjZXNzaWJpbGl0eVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTGlzdFZpZXdEcmFnQW5kRHJvcDxUPiBpbXBsZW1lbnRzIElMaXN0Vmlld0RyYWdBbmREcm9wPFQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGxpc3Q6IExpc3Q8VD4sIHByaXZhdGUgZG5kOiBJTGlzdERyYWdBbmREcm9wPFQ+KSB7IH1cblxuXHRnZXREcmFnRWxlbWVudHMoZWxlbWVudDogVCk6IFRbXSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5saXN0LmdldFNlbGVjdGVkRWxlbWVudHMoKTtcblx0XHRjb25zdCBlbGVtZW50cyA9IHNlbGVjdGlvbi5pbmRleE9mKGVsZW1lbnQpID4gLTEgPyBzZWxlY3Rpb24gOiBbZWxlbWVudF07XG5cdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHR9XG5cblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBUKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuZG5kLmdldERyYWdVUkkoZWxlbWVudCk7XG5cdH1cblxuXHRnZXREcmFnTGFiZWw/KGVsZW1lbnRzOiBUW10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuZG5kLmdldERyYWdMYWJlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG5kLmdldERyYWdMYWJlbChlbGVtZW50cywgb3JpZ2luYWxFdmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLm9uRHJhZ1N0YXJ0Py4oZGF0YSwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFQsIHRhcmdldEluZGV4OiBudW1iZXIsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4gfCBJTGlzdERyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdHJldHVybiB0aGlzLmRuZC5vbkRyYWdPdmVyKGRhdGEsIHRhcmdldEVsZW1lbnQsIHRhcmdldEluZGV4LCB0YXJnZXRTZWN0b3IsIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0b25EcmFnTGVhdmUoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVCwgdGFyZ2V0SW5kZXg6IG51bWJlciwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQub25EcmFnTGVhdmU/LihkYXRhLCB0YXJnZXRFbGVtZW50LCB0YXJnZXRJbmRleCwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRvbkRyYWdFbmQob3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQub25EcmFnRW5kPy4ob3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFQsIHRhcmdldEluZGV4OiBudW1iZXIsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLmRyb3AoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0SW5kZXgsIHRhcmdldFNlY3Rvciwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSB7QGxpbmsgTGlzdH0gaXMgYSB2aXJ0dWFsIHNjcm9sbGluZyB3aWRnZXQsIGJ1aWx0IG9uIHRvcCBvZiB0aGUge0BsaW5rIExpc3RWaWV3fVxuICogd2lkZ2V0LlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBDdXN0b21pemFibGUga2V5Ym9hcmQgYW5kIG1vdXNlIHN1cHBvcnRcbiAqIC0gRWxlbWVudCB0cmFpdHM6IGZvY3VzLCBzZWxlY3Rpb24sIGFjaG9yXG4gKiAtIEFjY2Vzc2liaWxpdHkgc3VwcG9ydFxuICogLSBUb3VjaCBzdXBwb3J0XG4gKiAtIFBlcmZvcm1hbnQgdGVtcGxhdGUtYmFzZWQgcmVuZGVyaW5nXG4gKiAtIEhvcml6b250YWwgc2Nyb2xsaW5nXG4gKiAtIFZhcmlhYmxlIGVsZW1lbnQgaGVpZ2h0IHN1cHBvcnRcbiAqIC0gRHluYW1pYyBlbGVtZW50IGhlaWdodCBzdXBwb3J0XG4gKiAtIERyYWctYW5kLWRyb3Agc3VwcG9ydFxuICovXG5leHBvcnQgY2xhc3MgTGlzdDxUPiBpbXBsZW1lbnRzIElTcGxpY2VhYmxlPFQ+LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBmb2N1cyA9IG5ldyBUcmFpdDxUPignZm9jdXNlZCcpO1xuXHRwcml2YXRlIHNlbGVjdGlvbjogVHJhaXQ8VD47XG5cdHByaXZhdGUgYW5jaG9yID0gbmV3IFRyYWl0PFQ+KCdhbmNob3InKTtcblx0cHJpdmF0ZSBldmVudEJ1ZmZlcmVyID0gbmV3IEV2ZW50QnVmZmVyZXIoKTtcblx0cHJvdGVjdGVkIHZpZXc6IElMaXN0VmlldzxUPjtcblx0cHJpdmF0ZSBzcGxpY2VhYmxlOiBJU3BsaWNlYWJsZTxUPjtcblx0cHJpdmF0ZSBzdHlsZUNvbnRyb2xsZXI6IElTdHlsZUNvbnRyb2xsZXI7XG5cdHByaXZhdGUgdHlwZU5hdmlnYXRpb25Db250cm9sbGVyPzogVHlwZU5hdmlnYXRpb25Db250cm9sbGVyPFQ+O1xuXHRwcml2YXRlIGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRwcml2YXRlIGtleWJvYXJkQ29udHJvbGxlcjogS2V5Ym9hcmRDb250cm9sbGVyPFQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1vdXNlQ29udHJvbGxlcjogTW91c2VDb250cm9sbGVyPFQ+O1xuXHRwcml2YXRlIF9hcmlhTGFiZWw6IHN0cmluZyA9ICcnO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRAbWVtb2l6ZSBnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxJTGlzdEV2ZW50PFQ+PiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcCh0aGlzLmV2ZW50QnVmZmVyZXIud3JhcEV2ZW50KHRoaXMuZm9jdXMub25DaGFuZ2UpLCBlID0+IHRoaXMudG9MaXN0RXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0QG1lbW9pemUgZ2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uKCk6IEV2ZW50PElMaXN0RXZlbnQ8VD4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5zZWxlY3Rpb24ub25DaGFuZ2UpLCBlID0+IHRoaXMudG9MaXN0RXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0Z2V0IGRvbUlkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLnZpZXcuZG9tSWQ7IH1cblx0Z2V0IG9uRGlkU2Nyb2xsKCk6IEV2ZW50PFNjcm9sbEV2ZW50PiB7IHJldHVybiB0aGlzLnZpZXcub25EaWRTY3JvbGw7IH1cblx0Z2V0IG9uTW91c2VDbGljaygpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlQ2xpY2s7IH1cblx0Z2V0IG9uTW91c2VEYmxDbGljaygpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlRGJsQ2xpY2s7IH1cblx0Z2V0IG9uTW91c2VNaWRkbGVDbGljaygpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlTWlkZGxlQ2xpY2s7IH1cblx0Z2V0IG9uUG9pbnRlcigpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMubW91c2VDb250cm9sbGVyLm9uUG9pbnRlcjsgfVxuXHRnZXQgb25Nb3VzZVVwKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VVcDsgfVxuXHRnZXQgb25Nb3VzZURvd24oKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiB0aGlzLnZpZXcub25Nb3VzZURvd247IH1cblx0Z2V0IG9uTW91c2VPdmVyKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VPdmVyOyB9XG5cdGdldCBvbk1vdXNlTW92ZSgpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlTW92ZTsgfVxuXHRnZXQgb25Nb3VzZU91dCgpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlT3V0OyB9XG5cdGdldCBvblRvdWNoU3RhcnQoKTogRXZlbnQ8SUxpc3RUb3VjaEV2ZW50PFQ+PiB7IHJldHVybiB0aGlzLnZpZXcub25Ub3VjaFN0YXJ0OyB9XG5cdGdldCBvblRhcCgpOiBFdmVudDxJTGlzdEdlc3R1cmVFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uVGFwOyB9XG5cblx0LyoqXG5cdCAqIFBvc3NpYmxlIGNvbnRleHQgbWVudSB0cmlnZ2VyIGV2ZW50czpcblx0ICogLSBDb250ZXh0TWVudSBrZXlcblx0ICogLSBTaGlmdCBGMTBcblx0ICogLSBDdHJsIE9wdGlvbiBTaGlmdCBNIChtYWNPUyB3aXRoIFZvaWNlT3Zlcilcblx0ICogLSBNb3VzZSByaWdodCBjbGlja1xuXHQgKi9cblx0QG1lbW9pemUgZ2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SUxpc3RDb250ZXh0TWVudUV2ZW50PFQ+PiB7XG5cdFx0bGV0IGRpZEp1c3RQcmVzc0NvbnRleHRNZW51S2V5ID0gZmFsc2U7XG5cblx0XHRjb25zdCBmcm9tS2V5RG93bjogRXZlbnQ8YW55PiA9IEV2ZW50LmNoYWluKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAna2V5ZG93bicpKS5ldmVudCwgJCA9PlxuXHRcdFx0JC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKVxuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZGlkSnVzdFByZXNzQ29udGV4dE1lbnVLZXkgPSBlLmtleUNvZGUgPT09IEtleUNvZGUuQ29udGV4dE1lbnUgfHwgKGUuc2hpZnRLZXkgJiYgZS5rZXlDb2RlID09PSBLZXlDb2RlLkYxMCkpXG5cdFx0XHRcdC5tYXAoZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKVxuXHRcdFx0XHQuZmlsdGVyKCgpID0+IGZhbHNlKSk7XG5cblx0XHRjb25zdCBmcm9tS2V5VXAgPSBFdmVudC5jaGFpbih0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2tleXVwJykpLmV2ZW50LCAkID0+XG5cdFx0XHQkLmZvckVhY2goKCkgPT4gZGlkSnVzdFByZXNzQ29udGV4dE1lbnVLZXkgPSBmYWxzZSlcblx0XHRcdFx0Lm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuQ29udGV4dE1lbnUgfHwgKGUuc2hpZnRLZXkgJiYgZS5rZXlDb2RlID09PSBLZXlDb2RlLkYxMCkpXG5cdFx0XHRcdC5tYXAoZSA9PiBFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpKVxuXHRcdFx0XHQubWFwKCh7IGJyb3dzZXJFdmVudCB9KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmdldEZvY3VzKCk7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBmb2N1cy5sZW5ndGggPyBmb2N1c1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBlbGVtZW50ID0gdHlwZW9mIGluZGV4ICE9PSAndW5kZWZpbmVkJyA/IHRoaXMudmlldy5lbGVtZW50KGluZGV4KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBhbmNob3IgPSB0eXBlb2YgaW5kZXggIT09ICd1bmRlZmluZWQnID8gdGhpcy52aWV3LmRvbUVsZW1lbnQoaW5kZXgpIGFzIEhUTUxFbGVtZW50IDogdGhpcy52aWV3LmRvbU5vZGU7XG5cdFx0XHRcdFx0cmV0dXJuIHsgaW5kZXgsIGVsZW1lbnQsIGFuY2hvciwgYnJvd3NlckV2ZW50IH07XG5cdFx0XHRcdH0pKTtcblxuXHRcdGNvbnN0IGZyb21Nb3VzZSA9IEV2ZW50LmNoYWluKHRoaXMudmlldy5vbkNvbnRleHRNZW51LCAkID0+XG5cdFx0XHQkLmZpbHRlcihfID0+ICFkaWRKdXN0UHJlc3NDb250ZXh0TWVudUtleSlcblx0XHRcdFx0Lm1hcCgoeyBlbGVtZW50LCBpbmRleCwgYnJvd3NlckV2ZW50IH0pID0+ICh7IGVsZW1lbnQsIGluZGV4LCBhbmNob3I6IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMudmlldy5kb21Ob2RlKSwgYnJvd3NlckV2ZW50KSwgYnJvd3NlckV2ZW50IH0pKVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gRXZlbnQuYW55PElMaXN0Q29udGV4dE1lbnVFdmVudDxUPj4oZnJvbUtleURvd24sIGZyb21LZXlVcCwgZnJvbU1vdXNlKTtcblx0fVxuXG5cdEBtZW1vaXplIGdldCBvbktleURvd24oKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy52aWV3LmRvbU5vZGUsICdrZXlkb3duJykpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbktleVVwKCk6IEV2ZW50PEtleWJvYXJkRXZlbnQ+IHsgcmV0dXJuIHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAna2V5dXAnKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uS2V5UHJlc3MoKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy52aWV3LmRvbU5vZGUsICdrZXlwcmVzcycpKS5ldmVudDsgfVxuXG5cdEBtZW1vaXplIGdldCBvbkRpZEZvY3VzKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIEV2ZW50LnNpZ25hbCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2ZvY3VzJywgdHJ1ZSkpLmV2ZW50KTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25EaWRCbHVyKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIEV2ZW50LnNpZ25hbCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2JsdXInLCB0cnVlKSkuZXZlbnQpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPGFueSAvKiBUT0RPQGpvYW8gKi8sIGFueT5bXSxcblx0XHRwcml2YXRlIF9vcHRpb25zOiBJTGlzdE9wdGlvbnM8VD4gPSBEZWZhdWx0T3B0aW9uc1xuXHQpIHtcblx0XHRjb25zdCByb2xlID0gdGhpcy5fb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYgdGhpcy5fb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0V2lkZ2V0Um9sZSA/IHRoaXMuX29wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRXaWRnZXRSb2xlKCkgOiAnbGlzdCc7XG5cdFx0dGhpcy5zZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uVHJhaXQocm9sZSAhPT0gJ2xpc3Rib3gnKTtcblxuXHRcdGNvbnN0IGJhc2VSZW5kZXJlcnM6IElMaXN0UmVuZGVyZXI8VCwgdW5rbm93bj5bXSA9IFt0aGlzLmZvY3VzLnJlbmRlcmVyLCB0aGlzLnNlbGVjdGlvbi5yZW5kZXJlcl07XG5cblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlciA9IF9vcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcjtcblxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcikge1xuXHRcdFx0YmFzZVJlbmRlcmVycy5wdXNoKG5ldyBBY2Nlc3NpYmlsdHlSZW5kZXJlcjxUPih0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcikpO1xuXG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5vbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQ/Lih0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlRGVzY2VuZGFudCwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0cmVuZGVyZXJzID0gcmVuZGVyZXJzLm1hcChyID0+IG5ldyBQaXBlbGluZVJlbmRlcmVyKHIudGVtcGxhdGVJZCwgWy4uLmJhc2VSZW5kZXJlcnMsIHJdKSk7XG5cblx0XHRjb25zdCB2aWV3T3B0aW9uczogSUxpc3RWaWV3T3B0aW9uczxUPiA9IHtcblx0XHRcdC4uLl9vcHRpb25zLFxuXHRcdFx0ZG5kOiBfb3B0aW9ucy5kbmQgJiYgbmV3IExpc3RWaWV3RHJhZ0FuZERyb3AodGhpcywgX29wdGlvbnMuZG5kKVxuXHRcdH07XG5cblx0XHR0aGlzLnZpZXcgPSB0aGlzLmNyZWF0ZUxpc3RWaWV3KGNvbnRhaW5lciwgdmlydHVhbERlbGVnYXRlLCByZW5kZXJlcnMsIHZpZXdPcHRpb25zKTtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCByb2xlKTtcblxuXHRcdGlmIChfb3B0aW9ucy5zdHlsZUNvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuc3R5bGVDb250cm9sbGVyID0gX29wdGlvbnMuc3R5bGVDb250cm9sbGVyKHRoaXMudmlldy5kb21JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0eWxlRWxlbWVudCA9IGNyZWF0ZVN0eWxlU2hlZXQodGhpcy52aWV3LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5zdHlsZUNvbnRyb2xsZXIgPSBuZXcgRGVmYXVsdFN0eWxlQ29udHJvbGxlcihzdHlsZUVsZW1lbnQsIHRoaXMudmlldy5kb21JZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpY2VhYmxlID0gbmV3IENvbWJpbmVkU3BsaWNlYWJsZShbXG5cdFx0XHRuZXcgVHJhaXRTcGxpY2VhYmxlKHRoaXMuZm9jdXMsIHRoaXMudmlldywgX29wdGlvbnMuaWRlbnRpdHlQcm92aWRlciksXG5cdFx0XHRuZXcgVHJhaXRTcGxpY2VhYmxlKHRoaXMuc2VsZWN0aW9uLCB0aGlzLnZpZXcsIF9vcHRpb25zLmlkZW50aXR5UHJvdmlkZXIpLFxuXHRcdFx0bmV3IFRyYWl0U3BsaWNlYWJsZSh0aGlzLmFuY2hvciwgdGhpcy52aWV3LCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKSxcblx0XHRcdHRoaXMudmlld1xuXHRcdF0pO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5mb2N1cyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5zZWxlY3Rpb24pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuYW5jaG9yKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnZpZXcpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkRGlzcG9zZSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRE9NRm9jdXNDb250cm9sbGVyKHRoaXMsIHRoaXMudmlldykpO1xuXG5cdFx0aWYgKHR5cGVvZiBfb3B0aW9ucy5rZXlib2FyZFN1cHBvcnQgIT09ICdib29sZWFuJyB8fCBfb3B0aW9ucy5rZXlib2FyZFN1cHBvcnQpIHtcblx0XHRcdHRoaXMua2V5Ym9hcmRDb250cm9sbGVyID0gbmV3IEtleWJvYXJkQ29udHJvbGxlcih0aGlzLCB0aGlzLnZpZXcsIF9vcHRpb25zKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMua2V5Ym9hcmRDb250cm9sbGVyKTtcblx0XHR9XG5cblx0XHRpZiAoX29wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcikge1xuXHRcdFx0Y29uc3QgZGVsZWdhdGUgPSBfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZSB8fCBEZWZhdWx0S2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGU7XG5cdFx0XHR0aGlzLnR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlciA9IG5ldyBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXIodGhpcywgdGhpcy52aWV3LCBfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlciA/PyAoKCkgPT4gdHJ1ZSksIGRlbGVnYXRlKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudHlwZU5hdmlnYXRpb25Db250cm9sbGVyKTtcblx0XHR9XG5cblx0XHR0aGlzLm1vdXNlQ29udHJvbGxlciA9IHRoaXMuY3JlYXRlTW91c2VDb250cm9sbGVyKF9vcHRpb25zKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm1vdXNlQ29udHJvbGxlcik7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlRm9jdXModGhpcy5fb25Gb2N1c0NoYW5nZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbih0aGlzLl9vblNlbGVjdGlvbkNoYW5nZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFdpZGdldEFyaWFMYWJlbCgpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZSA9IChhcmlhTGFiZWwgJiYgdHlwZW9mIGFyaWFMYWJlbCAhPT0gJ3N0cmluZycpID8gYXJpYUxhYmVsIDogY29uc3RPYnNlcnZhYmxlKGFyaWFMYWJlbCk7XG5cblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0dGhpcy5hcmlhTGFiZWwgPSByZWFkZXIucmVhZE9ic2VydmFibGUob2JzZXJ2YWJsZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSBmYWxzZSkge1xuXHRcdFx0dGhpcy52aWV3LmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLW11bHRpc2VsZWN0YWJsZScsICd0cnVlJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUxpc3RWaWV3KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sIHJlbmRlcmVyczogSUxpc3RSZW5kZXJlcjxhbnksIGFueT5bXSwgdmlld09wdGlvbnM6IElMaXN0Vmlld09wdGlvbnM8VD4pOiBJTGlzdFZpZXc8VD4ge1xuXHRcdHJldHVybiBuZXcgTGlzdFZpZXcoY29udGFpbmVyLCB2aXJ0dWFsRGVsZWdhdGUsIHJlbmRlcmVycywgdmlld09wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZU1vdXNlQ29udHJvbGxlcihvcHRpb25zOiBJTGlzdE9wdGlvbnM8VD4pOiBNb3VzZUNvbnRyb2xsZXI8VD4ge1xuXHRcdHJldHVybiBuZXcgTW91c2VDb250cm9sbGVyKHRoaXMpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlOiBJTGlzdE9wdGlvbnNVcGRhdGUgPSB7fSk6IHZvaWQge1xuXHRcdHRoaXMuX29wdGlvbnMgPSB7IC4uLnRoaXMuX29wdGlvbnMsIC4uLm9wdGlvbnNVcGRhdGUgfTtcblxuXHRcdHRoaXMudHlwZU5hdmlnYXRpb25Db250cm9sbGVyPy51cGRhdGVPcHRpb25zKHRoaXMuX29wdGlvbnMpO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCkge1xuXHRcdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbXVsdGlzZWxlY3RhYmxlJywgJ3RydWUnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudmlldy5kb21Ob2RlLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1tdWx0aXNlbGVjdGFibGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm1vdXNlQ29udHJvbGxlci51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdHRoaXMua2V5Ym9hcmRDb250cm9sbGVyPy51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdHRoaXMudmlldy51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHR9XG5cblx0Z2V0IG9wdGlvbnMoKTogSUxpc3RPcHRpb25zPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucztcblx0fVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogcmVhZG9ubHkgVFtdID0gW10pOiB2b2lkIHtcblx0XHRpZiAoc3RhcnQgPCAwIHx8IHN0YXJ0ID4gdGhpcy52aWV3Lmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IExpc3RFcnJvcih0aGlzLnVzZXIsIGBJbnZhbGlkIHN0YXJ0IGluZGV4OiAke3N0YXJ0fWApO1xuXHRcdH1cblxuXHRcdGlmIChkZWxldGVDb3VudCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy51c2VyLCBgSW52YWxpZCBkZWxldGUgY291bnQ6ICR7ZGVsZXRlQ291bnR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlbGV0ZUNvdW50ID09PSAwICYmIGVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4gdGhpcy5zcGxpY2VhYmxlLnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzKSk7XG5cdH1cblxuXHR1cGRhdGVXaWR0aChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3LnVwZGF0ZVdpZHRoKGluZGV4KTtcblx0fVxuXG5cdHVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5kZXg6IG51bWJlciwgc2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3LnVwZGF0ZUVsZW1lbnRIZWlnaHQoaW5kZXgsIHNpemUsIG51bGwpO1xuXHR9XG5cblx0cmVyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3LnJlcmVuZGVyKCk7XG5cdH1cblxuXHRlbGVtZW50KGluZGV4OiBudW1iZXIpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmVsZW1lbnQoaW5kZXgpO1xuXHR9XG5cblx0aW5kZXhPZihlbGVtZW50OiBUKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmluZGV4T2YoZWxlbWVudCk7XG5cdH1cblxuXHRpbmRleEF0KHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuaW5kZXhBdChwb3NpdGlvbik7XG5cdH1cblxuXHRnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgY29udGVudEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuY29udGVudEhlaWdodDtcblx0fVxuXG5cdGdldCBjb250ZW50V2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmNvbnRlbnRXaWR0aDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKTogRXZlbnQ8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb250ZW50V2lkdGgoKTogRXZlbnQ8bnVtYmVyPiB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5vbkRpZENoYW5nZUNvbnRlbnRXaWR0aDtcblx0fVxuXG5cdGdldCBzY3JvbGxUb3AoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmdldFNjcm9sbFRvcCgpO1xuXHR9XG5cblx0c2V0IHNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcikge1xuXHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wKTtcblx0fVxuXG5cdGdldCBzY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5nZXRTY3JvbGxMZWZ0KCk7XG5cdH1cblxuXHRzZXQgc2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpIHtcblx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0KTtcblx0fVxuXG5cdGdldCBzY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnNjcm9sbEhlaWdodDtcblx0fVxuXG5cdGdldCByZW5kZXJIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnJlbmRlckhlaWdodDtcblx0fVxuXG5cdGdldCBmaXJzdFZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZmlyc3RWaXNpYmxlSW5kZXg7XG5cdH1cblxuXHRnZXQgZmlyc3RNb3N0bHlWaXNpYmxlSW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmZpcnN0TW9zdGx5VmlzaWJsZUluZGV4O1xuXHR9XG5cblx0Z2V0IGxhc3RWaXNpYmxlSW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Lmxhc3RWaXNpYmxlSW5kZXg7XG5cdH1cblxuXHRnZXQgYXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyaWFMYWJlbDtcblx0fVxuXG5cdHNldCBhcmlhTGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuX2FyaWFMYWJlbCA9IHZhbHVlO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHZhbHVlKTtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKHsgcHJldmVudFNjcm9sbDogdHJ1ZSB9KTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHRyaWdnZXJUeXBlTmF2aWdhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlcj8udHJpZ2dlcigpO1xuXHR9XG5cblx0c2V0U2VsZWN0aW9uKGluZGV4ZXM6IG51bWJlcltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpbmRleCBvZiBpbmRleGVzKSB7XG5cdFx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy51c2VyLCBgSW52YWxpZCBpbmRleCAke2luZGV4fWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGluZGV4ZXMgPSBpbmRleGVzLmZpbHRlcihpID0+IHRoaXMuZ2V0RWxlbWVudEdyb3VwSWQoaSkgIT09IE5vdFNlbGVjdGFibGVHcm91cElkKTtcblxuXHRcdHRoaXMuc2VsZWN0aW9uLnNldChpbmRleGVzLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5zZWxlY3Rpb24uZ2V0KCk7XG5cdH1cblxuXHRnZXRTZWxlY3RlZEVsZW1lbnRzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2VsZWN0aW9uKCkubWFwKGkgPT4gdGhpcy52aWV3LmVsZW1lbnQoaSkpO1xuXHR9XG5cblx0c2V0QW5jaG9yKGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5hbmNob3Iuc2V0KFtdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMudXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHR9XG5cblx0XHR0aGlzLmFuY2hvci5zZXQoW2luZGV4XSk7XG5cdH1cblxuXHRnZXRBbmNob3IoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5hbmNob3IuZ2V0KCkuYXQoMCk7XG5cdH1cblxuXHRnZXRBbmNob3JFbGVtZW50KCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuZ2V0QW5jaG9yKCk7XG5cdFx0cmV0dXJuIHR5cGVvZiBhbmNob3IgPT09ICd1bmRlZmluZWQnID8gdW5kZWZpbmVkIDogdGhpcy5lbGVtZW50KGFuY2hvcik7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgZ3JvdXAgSUQgZm9yIGFuIGVsZW1lbnQgYXQgdGhlIGdpdmVuIGluZGV4LlxuXHQgKiBSZXR1cm5zIHVuZGVmaW5lZCBpZiBubyBpZGVudGl0eSBwcm92aWRlciwgbm8gZ2V0R3JvdXBJZCBtZXRob2QsIG9yIGlmIHRoZSBncm91cCBJRCBpcyB1bmRlZmluZWQuXG5cdCAqL1xuXHRnZXRFbGVtZW50R3JvdXBJZChpbmRleDogbnVtYmVyKTogbnVtYmVyIHwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpZGVudGl0eVByb3ZpZGVyID0gdGhpcy5vcHRpb25zLmlkZW50aXR5UHJvdmlkZXI7XG5cdFx0aWYgKCFpZGVudGl0eVByb3ZpZGVyPy5nZXRHcm91cElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQoaW5kZXgpO1xuXHRcdHJldHVybiBpZGVudGl0eVByb3ZpZGVyLmdldEdyb3VwSWQoZWxlbWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogRmlsdGVycyB0aGUgZ2l2ZW4gaW5kaWNlcyB0byBvbmx5IGluY2x1ZGUgdGhvc2Ugd2l0aCBhIG1hdGNoaW5nIGdyb3VwIElELlxuXHQgKiBJZiBubyBpZGVudGl0eSBwcm92aWRlciBvciBnZXRHcm91cElkIG1ldGhvZCBleGlzdHMsIHJldHVybnMgdGhlIG9yaWdpbmFsIGluZGljZXMuXG5cdCAqIElmIHJlZmVyZW5jZUdyb3VwSWQgaXMgdW5kZWZpbmVkLCByZXR1cm5zIGFuIGVtcHR5IGFycmF5IChlbGVtZW50cyB3aXRob3V0IGdyb3VwIElEcyBhcmUgbm90IHNlbGVjdGFibGUpLlxuXHQgKi9cblx0ZmlsdGVySW5kaWNlc0J5R3JvdXAoaW5kaWNlczogbnVtYmVyW10sIHJlZmVyZW5jZUdyb3VwSWQ6IG51bWJlciB8IE5vdFNlbGVjdGFibGVHcm91cElkVHlwZSk6IG51bWJlcltdIHtcblx0XHRjb25zdCBpZGVudGl0eVByb3ZpZGVyID0gdGhpcy5vcHRpb25zLmlkZW50aXR5UHJvdmlkZXI7XG5cdFx0aWYgKCFpZGVudGl0eVByb3ZpZGVyPy5nZXRHcm91cElkKSB7XG5cdFx0XHRyZXR1cm4gaW5kaWNlcztcblx0XHR9XG5cblx0XHRpZiAocmVmZXJlbmNlR3JvdXBJZCA9PT0gTm90U2VsZWN0YWJsZUdyb3VwSWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kaWNlcy5maWx0ZXIoaW5kZXggPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudChpbmRleCk7XG5cdFx0XHRjb25zdCBncm91cElkID0gaWRlbnRpdHlQcm92aWRlci5nZXRHcm91cElkIShlbGVtZW50KTtcblx0XHRcdHJldHVybiBncm91cElkID09PSByZWZlcmVuY2VHcm91cElkO1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0Rm9jdXMoaW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGluZGV4ZXMpIHtcblx0XHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IExpc3RFcnJvcih0aGlzLnVzZXIsIGBJbnZhbGlkIGluZGV4ICR7aW5kZXh9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5mb2N1cy5zZXQoaW5kZXhlcywgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdGZvY3VzTmV4dChuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5mb2N1cy5nZXQoKTtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZmluZE5leHRJbmRleChmb2N1cy5sZW5ndGggPiAwID8gZm9jdXNbMF0gKyBuIDogMCwgbG9vcCwgZmlsdGVyKTtcblxuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLnNldEZvY3VzKFtpbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNQcmV2aW91cyhuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5mb2N1cy5nZXQoKTtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZmluZFByZXZpb3VzSW5kZXgoZm9jdXMubGVuZ3RoID4gMCA/IGZvY3VzWzBdIC0gbiA6IDAsIGxvb3AsIGZpbHRlcik7XG5cblx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0dGhpcy5zZXRGb2N1cyhbaW5kZXhdLCBicm93c2VyRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgbGFzdFBhZ2VJbmRleCA9IHRoaXMudmlldy5pbmRleEF0KHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKSArIHRoaXMudmlldy5yZW5kZXJIZWlnaHQpO1xuXHRcdGxhc3RQYWdlSW5kZXggPSBsYXN0UGFnZUluZGV4ID09PSAwID8gMCA6IGxhc3RQYWdlSW5kZXggLSAxO1xuXHRcdGNvbnN0IGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggPSB0aGlzLmdldEZvY3VzKClbMF07XG5cblx0XHRpZiAoY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCAhPT0gbGFzdFBhZ2VJbmRleCAmJiAoY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCA9PT0gdW5kZWZpbmVkIHx8IGxhc3RQYWdlSW5kZXggPiBjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4KSkge1xuXHRcdFx0Y29uc3QgbGFzdEdvb2RQYWdlSW5kZXggPSB0aGlzLmZpbmRQcmV2aW91c0luZGV4KGxhc3RQYWdlSW5kZXgsIGZhbHNlLCBmaWx0ZXIpO1xuXG5cdFx0XHRpZiAobGFzdEdvb2RQYWdlSW5kZXggPiAtMSAmJiBjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4ICE9PSBsYXN0R29vZFBhZ2VJbmRleCkge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKFtsYXN0R29vZFBhZ2VJbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKFtsYXN0UGFnZUluZGV4XSwgYnJvd3NlckV2ZW50KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNTY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0XHRsZXQgbmV4dHBhZ2VTY3JvbGxUb3AgPSBwcmV2aW91c1Njcm9sbFRvcCArIHRoaXMudmlldy5yZW5kZXJIZWlnaHQ7XG5cdFx0XHRpZiAobGFzdFBhZ2VJbmRleCA+IGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXgpIHtcblx0XHRcdFx0Ly8gc2Nyb2xsIGxhc3QgcGFnZSBlbGVtZW50IHRvIHRoZSB0b3Agb25seSBpZiB0aGUgbGFzdCBwYWdlIGVsZW1lbnQgaXMgYmVsb3cgdGhlIGZvY3VzZWQgZWxlbWVudFxuXHRcdFx0XHRuZXh0cGFnZVNjcm9sbFRvcCAtPSB0aGlzLnZpZXcuZWxlbWVudEhlaWdodChsYXN0UGFnZUluZGV4KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChuZXh0cGFnZVNjcm9sbFRvcCk7XG5cblx0XHRcdGlmICh0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCkgIT09IHByZXZpb3VzU2Nyb2xsVG9wKSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW10pO1xuXG5cdFx0XHRcdC8vIExldCB0aGUgc2Nyb2xsIGV2ZW50IGxpc3RlbmVyIHJ1blxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZpbHRlcj86IChlbGVtZW50OiBUKSA9PiBib29sZWFuLCBnZXRQYWRkaW5nVG9wOiAoKSA9PiBudW1iZXIgPSAoKSA9PiAwKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGZpcnN0UGFnZUluZGV4OiBudW1iZXI7XG5cdFx0Y29uc3QgcGFkZGluZ1RvcCA9IGdldFBhZGRpbmdUb3AoKTtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCkgKyBwYWRkaW5nVG9wO1xuXG5cdFx0aWYgKHNjcm9sbFRvcCA9PT0gMCkge1xuXHRcdFx0Zmlyc3RQYWdlSW5kZXggPSB0aGlzLnZpZXcuaW5kZXhBdChzY3JvbGxUb3ApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaXJzdFBhZ2VJbmRleCA9IHRoaXMudmlldy5pbmRleEFmdGVyKHNjcm9sbFRvcCAtIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggPSB0aGlzLmdldEZvY3VzKClbMF07XG5cblx0XHRpZiAoY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCAhPT0gZmlyc3RQYWdlSW5kZXggJiYgKGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggPT09IHVuZGVmaW5lZCB8fCBjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4ID49IGZpcnN0UGFnZUluZGV4KSkge1xuXHRcdFx0Y29uc3QgZmlyc3RHb29kUGFnZUluZGV4ID0gdGhpcy5maW5kTmV4dEluZGV4KGZpcnN0UGFnZUluZGV4LCBmYWxzZSwgZmlsdGVyKTtcblxuXHRcdFx0aWYgKGZpcnN0R29vZFBhZ2VJbmRleCA+IC0xICYmIGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggIT09IGZpcnN0R29vZFBhZ2VJbmRleCkge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKFtmaXJzdEdvb2RQYWdlSW5kZXhdLCBicm93c2VyRXZlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZXRGb2N1cyhbZmlyc3RQYWdlSW5kZXhdLCBicm93c2VyRXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1Njcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wIC0gdGhpcy52aWV3LnJlbmRlckhlaWdodCAtIHBhZGRpbmdUb3ApO1xuXG5cdFx0XHRpZiAodGhpcy52aWV3LmdldFNjcm9sbFRvcCgpICsgZ2V0UGFkZGluZ1RvcCgpICE9PSBwcmV2aW91c1Njcm9sbFRvcCkge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKFtdKTtcblxuXHRcdFx0XHQvLyBMZXQgdGhlIHNjcm9sbCBldmVudCBsaXN0ZW5lciBydW5cblx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5mb2N1c1ByZXZpb3VzUGFnZShicm93c2VyRXZlbnQsIGZpbHRlciwgZ2V0UGFkZGluZ1RvcCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNMYXN0KGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZpbHRlcj86IChlbGVtZW50OiBUKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmZpbmRQcmV2aW91c0luZGV4KHRoaXMubGVuZ3RoIC0gMSwgZmFsc2UsIGZpbHRlcik7XG5cblx0XHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdFx0dGhpcy5zZXRGb2N1cyhbaW5kZXhdLCBicm93c2VyRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzRmlyc3QoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzTnRoKDAsIGJyb3dzZXJFdmVudCwgZmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzTnRoKG46IG51bWJlciwgYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZmluZE5leHRJbmRleChuLCBmYWxzZSwgZmlsdGVyKTtcblxuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLnNldEZvY3VzKFtpbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaW5kTmV4dEluZGV4KGluZGV4OiBudW1iZXIsIGxvb3AgPSBmYWxzZSwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4pOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKGluZGV4ID49IHRoaXMubGVuZ3RoICYmICFsb29wKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblxuXHRcdFx0aW5kZXggPSBpbmRleCAlIHRoaXMubGVuZ3RoO1xuXG5cdFx0XHRpZiAoIWZpbHRlciB8fCBmaWx0ZXIodGhpcy5lbGVtZW50KGluZGV4KSkpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHRpbmRleCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgZmluZFByZXZpb3VzSW5kZXgoaW5kZXg6IG51bWJlciwgbG9vcCA9IGZhbHNlLCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaW5kZXggPCAwICYmICFsb29wKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblxuXHRcdFx0aW5kZXggPSAodGhpcy5sZW5ndGggKyAoaW5kZXggJSB0aGlzLmxlbmd0aCkpICUgdGhpcy5sZW5ndGg7XG5cblx0XHRcdGlmICghZmlsdGVyIHx8IGZpbHRlcih0aGlzLmVsZW1lbnQoaW5kZXgpKSkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGluZGV4LS07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLmZvY3VzLmdldCgpO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZEVsZW1lbnRzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Rm9jdXMoKS5tYXAoaSA9PiB0aGlzLnZpZXcuZWxlbWVudChpKSk7XG5cdH1cblxuXHRyZXZlYWwoaW5kZXg6IG51bWJlciwgcmVsYXRpdmVUb3A/OiBudW1iZXIsIHBhZGRpbmdUb3A6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMudXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0Y29uc3QgZWxlbWVudFRvcCA9IHRoaXMudmlldy5lbGVtZW50VG9wKGluZGV4KTtcblx0XHRjb25zdCBlbGVtZW50SGVpZ2h0ID0gdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQoaW5kZXgpO1xuXG5cdFx0aWYgKGlzTnVtYmVyKHJlbGF0aXZlVG9wKSkge1xuXHRcdFx0Ly8geSA9IG14ICsgYlxuXHRcdFx0Y29uc3QgbSA9IGVsZW1lbnRIZWlnaHQgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0ICsgcGFkZGluZ1RvcDtcblx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AobSAqIGNsYW1wKHJlbGF0aXZlVG9wLCAwLCAxKSArIGVsZW1lbnRUb3AgLSBwYWRkaW5nVG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW1Cb3R0b20gPSBlbGVtZW50VG9wICsgZWxlbWVudEhlaWdodDtcblx0XHRcdGNvbnN0IHNjcm9sbEJvdHRvbSA9IHNjcm9sbFRvcCArIHRoaXMudmlldy5yZW5kZXJIZWlnaHQ7XG5cblx0XHRcdGlmIChlbGVtZW50VG9wIDwgc2Nyb2xsVG9wICsgcGFkZGluZ1RvcCAmJiB2aWV3SXRlbUJvdHRvbSA+PSBzY3JvbGxCb3R0b20pIHtcblx0XHRcdFx0Ly8gVGhlIGVsZW1lbnQgaXMgYWxyZWFkeSBvdmVyZmxvd2luZyB0aGUgdmlld3BvcnQsIG5vLW9wXG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnRUb3AgPCBzY3JvbGxUb3AgKyBwYWRkaW5nVG9wIHx8ICh2aWV3SXRlbUJvdHRvbSA+PSBzY3JvbGxCb3R0b20gJiYgZWxlbWVudEhlaWdodCA+PSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0KSkge1xuXHRcdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKGVsZW1lbnRUb3AgLSBwYWRkaW5nVG9wKTtcblx0XHRcdH0gZWxzZSBpZiAodmlld0l0ZW1Cb3R0b20gPj0gc2Nyb2xsQm90dG9tKSB7XG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3Aodmlld0l0ZW1Cb3R0b20gLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVsYXRpdmUgcG9zaXRpb24gb2YgYW4gZWxlbWVudCByZW5kZXJlZCBpbiB0aGUgbGlzdC5cblx0ICogUmV0dXJucyBgbnVsbGAgaWYgdGhlIGVsZW1lbnQgaXNuJ3QgKmVudGlyZWx5KiBpbiB0aGUgdmlzaWJsZSB2aWV3cG9ydC5cblx0ICovXG5cdGdldFJlbGF0aXZlVG9wKGluZGV4OiBudW1iZXIsIHBhZGRpbmdUb3A6IG51bWJlciA9IDApOiBudW1iZXIgfCBudWxsIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMudXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0Y29uc3QgZWxlbWVudFRvcCA9IHRoaXMudmlldy5lbGVtZW50VG9wKGluZGV4KTtcblx0XHRjb25zdCBlbGVtZW50SGVpZ2h0ID0gdGhpcy52aWV3LmVsZW1lbnRIZWlnaHQoaW5kZXgpO1xuXG5cdFx0aWYgKGVsZW1lbnRUb3AgPCBzY3JvbGxUb3AgKyBwYWRkaW5nVG9wIHx8IGVsZW1lbnRUb3AgKyBlbGVtZW50SGVpZ2h0ID4gc2Nyb2xsVG9wICsgdGhpcy52aWV3LnJlbmRlckhlaWdodCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8geSA9IG14ICsgYlxuXHRcdGNvbnN0IG0gPSBlbGVtZW50SGVpZ2h0IC0gdGhpcy52aWV3LnJlbmRlckhlaWdodCArIHBhZGRpbmdUb3A7XG5cdFx0cmV0dXJuIE1hdGguYWJzKChzY3JvbGxUb3AgKyBwYWRkaW5nVG9wIC0gZWxlbWVudFRvcCkgLyBtKTtcblx0fVxuXG5cdGlzRE9NRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY3RpdmVFbGVtZW50KHRoaXMudmlldy5kb21Ob2RlKTtcblx0fVxuXG5cdGdldEhUTUxFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmRvbU5vZGU7XG5cdH1cblxuXHRnZXRTY3JvbGxhYmxlRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxhYmxlRWxlbWVudERvbU5vZGU7XG5cdH1cblxuXHRnZXRFbGVtZW50SUQoaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5nZXRFbGVtZW50RG9tSWQoaW5kZXgpO1xuXHR9XG5cblx0Z2V0RWxlbWVudFRvcChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJTGlzdFN0eWxlcyk6IHZvaWQge1xuXHRcdHRoaXMuc3R5bGVDb250cm9sbGVyLnN0eWxlKHN0eWxlcyk7XG5cdH1cblxuXHRkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy52aWV3LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0xpc3RFdmVudCh7IGluZGV4ZXMsIGJyb3dzZXJFdmVudCB9OiBJVHJhaXRDaGFuZ2VFdmVudCkge1xuXHRcdHJldHVybiB7IGluZGV4ZXMsIGVsZW1lbnRzOiBpbmRleGVzLm1hcChpID0+IHRoaXMudmlldy5lbGVtZW50KGkpKSwgYnJvd3NlckV2ZW50IH07XG5cdH1cblxuXHRwcml2YXRlIF9vbkZvY3VzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5mb2N1cy5nZXQoKTtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdlbGVtZW50LWZvY3VzZWQnLCBmb2N1cy5sZW5ndGggPiAwKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlRGVzY2VuZGFudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmZvY3VzLmdldCgpO1xuXG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdGxldCBpZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldEFjdGl2ZURlc2NlbmRhbnRJZCkge1xuXHRcdFx0XHRpZCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFjdGl2ZURlc2NlbmRhbnRJZCh0aGlzLnZpZXcuZWxlbWVudChmb2N1c1swXSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcsIGlkIHx8IHRoaXMudmlldy5nZXRFbGVtZW50RG9tSWQoZm9jdXNbMF0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3LmRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vblNlbGVjdGlvbkNoYW5nZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbi5nZXQoKTtcblxuXHRcdHRoaXMudmlldy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGlvbi1ub25lJywgc2VsZWN0aW9uLmxlbmd0aCA9PT0gMCk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0aW9uLXNpbmdsZScsIHNlbGVjdGlvbi5sZW5ndGggPT09IDEpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGlvbi1tdWx0aXBsZScsIHNlbGVjdGlvbi5sZW5ndGggPiAxKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFvQixhQUFhLGtCQUFrQixXQUFXLGlCQUFpQixtQkFBbUIsZUFBZSxvQkFBb0I7QUFDckksU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBeUIsNkJBQTZCO0FBQ3RELFNB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
