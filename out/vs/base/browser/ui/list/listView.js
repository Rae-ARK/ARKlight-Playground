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
import { DataTransfers } from "../../dnd.js";
import { addDisposableListener, animate, getActiveElement, getContentHeight, getContentWidth, getDocument, getTopLeftOffset, getWindow, isAncestor, isHTMLElement, isSVGElement, scheduleAtNextAnimationFrame } from "../../dom.js";
import { DomEmitter } from "../../event.js";
import { EventType as TouchEventType, Gesture } from "../../touch.js";
import { SmoothScrollableElement } from "../scrollbar/scrollableElement.js";
import { distinct, equals, splice } from "../../../common/arrays.js";
import { Delayer, disposableTimeout } from "../../../common/async.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { Range } from "../../../common/range.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "./list.js";
import { RangeMap, shift } from "./rangeMap.js";
import { RowCache } from "./rowCache.js";
import { BugIndicatingError } from "../../../common/errors.js";
import { clamp } from "../../../common/numbers.js";
import { applyDragImage } from "../dnd/dnd.js";
const StaticDND = {
  CurrentDragAndDropData: void 0
};
var ListViewTargetSector = /* @__PURE__ */ ((ListViewTargetSector2) => {
  ListViewTargetSector2[ListViewTargetSector2["TOP"] = 0] = "TOP";
  ListViewTargetSector2[ListViewTargetSector2["CENTER_TOP"] = 1] = "CENTER_TOP";
  ListViewTargetSector2[ListViewTargetSector2["CENTER_BOTTOM"] = 2] = "CENTER_BOTTOM";
  ListViewTargetSector2[ListViewTargetSector2["BOTTOM"] = 3] = "BOTTOM";
  return ListViewTargetSector2;
})(ListViewTargetSector || {});
const DefaultOptions = {
  useShadows: true,
  verticalScrollMode: ScrollbarVisibility.Auto,
  setRowLineHeight: true,
  setRowHeight: true,
  supportDynamicHeights: false,
  dnd: {
    getDragElements(e) {
      return [e];
    },
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
  },
  horizontalScrolling: false,
  transformOptimization: true,
  alwaysConsumeMouseWheel: true
};
class ElementsDragAndDropData {
  get context() {
    return this._context;
  }
  set context(value) {
    this._context = value;
  }
  constructor(elements) {
    this.elements = elements;
  }
  update() {
  }
  getData() {
    return this.elements;
  }
}
class ExternalElementsDragAndDropData {
  constructor(elements) {
    this.elements = elements;
  }
  update() {
  }
  getData() {
    return this.elements;
  }
}
class NativeDragAndDropData {
  constructor() {
    this.types = [];
    this.files = [];
  }
  update(dataTransfer) {
    if (dataTransfer.types) {
      this.types.splice(0, this.types.length, ...dataTransfer.types);
    }
    if (dataTransfer.files) {
      this.files.splice(0, this.files.length);
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files.item(i);
        if (file && (file.size || file.type)) {
          this.files.push(file);
        }
      }
    }
  }
  getData() {
    return {
      types: this.types,
      files: this.files
    };
  }
}
function equalsDragFeedback(f1, f2) {
  if (Array.isArray(f1) && Array.isArray(f2)) {
    return equals(f1, f2);
  }
  return f1 === f2;
}
class ListViewAccessibilityProvider {
  constructor(accessibilityProvider) {
    if (accessibilityProvider?.getSetSize) {
      this.getSetSize = accessibilityProvider.getSetSize.bind(accessibilityProvider);
    } else {
      this.getSetSize = (e, i, l) => l;
    }
    if (accessibilityProvider?.getPosInSet) {
      this.getPosInSet = accessibilityProvider.getPosInSet.bind(accessibilityProvider);
    } else {
      this.getPosInSet = (e, i) => i + 1;
    }
    if (accessibilityProvider?.getRole) {
      this.getRole = accessibilityProvider.getRole.bind(accessibilityProvider);
    } else {
      this.getRole = (_) => "listitem";
    }
    if (accessibilityProvider?.isChecked) {
      this.isChecked = accessibilityProvider.isChecked.bind(accessibilityProvider);
    } else {
      this.isChecked = (_) => void 0;
    }
  }
}
const _ListView = class _ListView {
  constructor(container, virtualDelegate, renderers, options = DefaultOptions) {
    this.virtualDelegate = virtualDelegate;
    this.domId = `list_id_${++_ListView.InstanceCount}`;
    this.renderers = /* @__PURE__ */ new Map();
    this.renderWidth = 0;
    this._scrollHeight = 0;
    this.scrollableElementUpdateDisposable = null;
    this.scrollableElementWidthDelayer = new Delayer(50);
    this.splicing = false;
    this.dragOverAnimationStopDisposable = Disposable.None;
    this.dragOverMouseY = 0;
    this.canDrop = false;
    this.currentDragFeedbackDisposable = Disposable.None;
    this.onDragLeaveTimeout = Disposable.None;
    this.currentSelectionDisposable = Disposable.None;
    this.disposables = new DisposableStore();
    this._onDidChangeContentHeight = this.disposables.add(new Emitter());
    this._onDidChangeContentWidth = this.disposables.add(new Emitter());
    this.onDidChangeContentHeight = Event.latch(this._onDidChangeContentHeight.event, void 0, this.disposables);
    this.onDidChangeContentWidth = Event.latch(this._onDidChangeContentWidth.event, void 0, this.disposables);
    this._horizontalScrolling = false;
    if (options.horizontalScrolling && options.supportDynamicHeights) {
      throw new Error("Horizontal scrolling and dynamic heights not supported simultaneously");
    }
    this.items = [];
    this.itemId = 0;
    this.rangeMap = this.createRangeMap(options.paddingTop ?? 0);
    for (const renderer of renderers) {
      this.renderers.set(renderer.templateId, renderer);
    }
    this.cache = this.disposables.add(new RowCache(this.renderers));
    this.lastRenderTop = 0;
    this.lastRenderHeight = 0;
    this.domNode = document.createElement("div");
    this.domNode.className = "monaco-list";
    this.domNode.classList.add(this.domId);
    this.domNode.tabIndex = 0;
    this.domNode.classList.toggle("mouse-support", typeof options.mouseSupport === "boolean" ? options.mouseSupport : true);
    this._horizontalScrolling = options.horizontalScrolling ?? DefaultOptions.horizontalScrolling;
    this.domNode.classList.toggle("horizontal-scrolling", this._horizontalScrolling);
    this.paddingBottom = typeof options.paddingBottom === "undefined" ? 0 : options.paddingBottom;
    this.accessibilityProvider = new ListViewAccessibilityProvider(options.accessibilityProvider);
    this.rowsContainer = document.createElement("div");
    this.rowsContainer.className = "monaco-list-rows";
    const transformOptimization = options.transformOptimization ?? DefaultOptions.transformOptimization;
    if (transformOptimization) {
      this.rowsContainer.style.transform = "translate3d(0px, 0px, 0px)";
      this.rowsContainer.style.overflow = "hidden";
      this.rowsContainer.style.contain = "strict";
    }
    this.disposables.add(Gesture.addTarget(this.rowsContainer));
    this.scrollable = this.disposables.add(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: options.smoothScrolling ?? false ? 125 : 0,
      scheduleAtNextAnimationFrame: (cb) => scheduleAtNextAnimationFrame(getWindow(this.domNode), cb)
    }));
    this.scrollableElement = this.disposables.add(new SmoothScrollableElement(this.rowsContainer, {
      alwaysConsumeMouseWheel: options.alwaysConsumeMouseWheel ?? DefaultOptions.alwaysConsumeMouseWheel,
      horizontal: ScrollbarVisibility.Auto,
      vertical: options.verticalScrollMode ?? DefaultOptions.verticalScrollMode,
      useShadows: options.useShadows ?? DefaultOptions.useShadows,
      mouseWheelScrollSensitivity: options.mouseWheelScrollSensitivity,
      fastScrollSensitivity: options.fastScrollSensitivity,
      scrollByPage: options.scrollByPage
    }, this.scrollable));
    this.domNode.appendChild(this.scrollableElement.getDomNode());
    container.appendChild(this.domNode);
    this.scrollableElement.onScroll(this.onScroll, this, this.disposables);
    this.disposables.add(addDisposableListener(this.rowsContainer, TouchEventType.Change, (e) => this.onTouchChange(e)));
    this.disposables.add(addDisposableListener(this.scrollableElement.getDomNode(), "scroll", (e) => {
      const element = e.target;
      const scrollValue = element.scrollTop;
      element.scrollTop = 0;
      if (options.scrollToActiveElement) {
        this.setScrollTop(this.scrollTop + scrollValue);
      }
    }));
    this.disposables.add(addDisposableListener(this.domNode, "dragover", (e) => this.onDragOver(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "drop", (e) => this.onDrop(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "dragleave", (e) => this.onDragLeave(this.toDragEvent(e))));
    this.disposables.add(addDisposableListener(this.domNode, "dragend", (e) => this.onDragEnd(e)));
    if (options.userSelection) {
      if (options.dnd) {
        throw new Error("DND and user selection cannot be used simultaneously");
      }
      this.disposables.add(addDisposableListener(this.domNode, "mousedown", (e) => this.onPotentialSelectionStart(e)));
    }
    this.setRowLineHeight = options.setRowLineHeight ?? DefaultOptions.setRowLineHeight;
    this.setRowHeight = options.setRowHeight ?? DefaultOptions.setRowHeight;
    this.supportDynamicHeights = options.supportDynamicHeights ?? DefaultOptions.supportDynamicHeights;
    this.dnd = options.dnd ?? this.disposables.add(DefaultOptions.dnd);
    this.layout(options.initialSize?.height, options.initialSize?.width);
    if (options.scrollToActiveElement) {
      this._setupFocusObserver(container);
    }
  }
  get contentHeight() {
    return this.rangeMap.size;
  }
  get contentWidth() {
    return this.scrollWidth ?? 0;
  }
  get onDidScroll() {
    return this.scrollableElement.onScroll;
  }
  get onWillScroll() {
    return this.scrollableElement.onWillScroll;
  }
  get containerDomNode() {
    return this.rowsContainer;
  }
  get scrollableElementDomNode() {
    return this.scrollableElement.getDomNode();
  }
  get horizontalScrolling() {
    return this._horizontalScrolling;
  }
  set horizontalScrolling(value) {
    if (value === this._horizontalScrolling) {
      return;
    }
    if (value && this.supportDynamicHeights) {
      throw new Error("Horizontal scrolling and dynamic heights not supported simultaneously");
    }
    this._horizontalScrolling = value;
    this.domNode.classList.toggle("horizontal-scrolling", this._horizontalScrolling);
    if (this._horizontalScrolling) {
      this.measureItemWidths(this.items);
      this.updateScrollWidth();
      this.scrollableElement.setScrollDimensions({ width: getContentWidth(this.domNode) });
      this.rowsContainer.style.width = `${Math.max(this.scrollWidth || 0, this.renderWidth)}px`;
    } else {
      this.scrollableElementWidthDelayer.cancel();
      this.scrollableElement.setScrollDimensions({ width: this.renderWidth, scrollWidth: this.renderWidth });
      this.rowsContainer.style.width = "";
      this.domNode.style.removeProperty("--list-scroll-right-offset");
    }
  }
  _setupFocusObserver(container) {
    this.disposables.add(addDisposableListener(container, "focus", () => {
      const element = getActiveElement();
      if (this.activeElement !== element && element !== null) {
        this.activeElement = element;
        this._scrollToActiveElement(this.activeElement, container);
      }
    }, true));
  }
  _scrollToActiveElement(element, container) {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const topOffset = elementRect.top - containerRect.top;
    if (topOffset < 0) {
      this.setScrollTop(this.scrollTop + topOffset);
    }
  }
  updateOptions(options) {
    if (options.paddingBottom !== void 0) {
      this.paddingBottom = options.paddingBottom;
      this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
    }
    if (options.smoothScrolling !== void 0) {
      this.scrollable.setSmoothScrollDuration(options.smoothScrolling ? 125 : 0);
    }
    if (options.horizontalScrolling !== void 0) {
      this.horizontalScrolling = options.horizontalScrolling;
    }
    let scrollableOptions;
    if (options.scrollByPage !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, scrollByPage: options.scrollByPage };
    }
    if (options.mouseWheelScrollSensitivity !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, mouseWheelScrollSensitivity: options.mouseWheelScrollSensitivity };
    }
    if (options.fastScrollSensitivity !== void 0) {
      scrollableOptions = { ...scrollableOptions ?? {}, fastScrollSensitivity: options.fastScrollSensitivity };
    }
    if (scrollableOptions) {
      this.scrollableElement.updateOptions(scrollableOptions);
    }
    if (options.paddingTop !== void 0 && options.paddingTop !== this.rangeMap.paddingTop) {
      const lastRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
      const offset = options.paddingTop - this.rangeMap.paddingTop;
      this.rangeMap.paddingTop = options.paddingTop;
      this.render(lastRenderRange, Math.max(0, this.lastRenderTop + offset), this.lastRenderHeight, void 0, void 0, true);
      this.setScrollTop(this.lastRenderTop);
      this.eventuallyUpdateScrollDimensions();
      if (this.supportDynamicHeights) {
        this._rerender(this.lastRenderTop, this.lastRenderHeight);
      }
    }
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.scrollableElement.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this.scrollableElement.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  updateElementHeight(index, size, anchorIndex) {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    const originalSize = this.items[index].size;
    if (typeof size === "undefined") {
      if (!this.supportDynamicHeights) {
        console.warn("Dynamic heights not supported", new Error().stack);
        return;
      }
      this.items[index].lastDynamicHeightWidth = void 0;
      size = originalSize + this.probeDynamicHeight(index);
    }
    if (originalSize === size) {
      return;
    }
    const lastRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    let heightDiff = 0;
    if (index < lastRenderRange.start) {
      heightDiff = size - originalSize;
    } else {
      if (anchorIndex !== null && anchorIndex > index && anchorIndex < lastRenderRange.end) {
        heightDiff = size - originalSize;
      } else {
        heightDiff = 0;
      }
    }
    this.rangeMap.splice(index, 1, [{ size }]);
    this.items[index].size = size;
    this.render(lastRenderRange, Math.max(0, this.lastRenderTop + heightDiff), this.lastRenderHeight, void 0, void 0, true);
    this.setScrollTop(this.lastRenderTop);
    this.eventuallyUpdateScrollDimensions();
    if (this.supportDynamicHeights) {
      this._rerender(this.lastRenderTop, this.lastRenderHeight);
    } else {
      this._onDidChangeContentHeight.fire(this.contentHeight);
    }
  }
  createRangeMap(paddingTop) {
    return new RangeMap(paddingTop);
  }
  splice(start, deleteCount, elements = []) {
    if (this.splicing) {
      throw new Error("Can't run recursive splices.");
    }
    this.splicing = true;
    try {
      return this._splice(start, deleteCount, elements);
    } finally {
      this.splicing = false;
      this._onDidChangeContentHeight.fire(this.contentHeight);
    }
  }
  _splice(start, deleteCount, elements = []) {
    const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    const deleteRange = { start, end: start + deleteCount };
    const removeRange = Range.intersect(previousRenderRange, deleteRange);
    const rowsToDispose = /* @__PURE__ */ new Map();
    for (let i = removeRange.end - 1; i >= removeRange.start; i--) {
      const item = this.items[i];
      item.dragStartDisposable.dispose();
      item.checkedDisposable.dispose();
      if (item.row) {
        let rows = rowsToDispose.get(item.templateId);
        if (!rows) {
          rows = [];
          rowsToDispose.set(item.templateId, rows);
        }
        const renderer = this.renderers.get(item.templateId);
        if (renderer && renderer.disposeElement) {
          renderer.disposeElement(item.element, i, item.row.templateData, { height: item.size });
        }
        rows.unshift(item.row);
      }
      item.row = null;
      item.stale = true;
    }
    const previousRestRange = { start: start + deleteCount, end: this.items.length };
    const previousRenderedRestRange = Range.intersect(previousRestRange, previousRenderRange);
    const previousUnrenderedRestRanges = Range.relativeComplement(previousRestRange, previousRenderRange);
    const inserted = elements.map((element) => ({
      id: String(this.itemId++),
      element,
      templateId: this.virtualDelegate.getTemplateId(element),
      size: this.virtualDelegate.getHeight(element),
      width: void 0,
      hasDynamicHeight: !!this.virtualDelegate.hasDynamicHeight && this.virtualDelegate.hasDynamicHeight(element),
      lastDynamicHeightWidth: void 0,
      row: null,
      uri: void 0,
      dropTarget: false,
      dragStartDisposable: Disposable.None,
      checkedDisposable: Disposable.None,
      stale: false
    }));
    let deleted;
    if (start === 0 && deleteCount >= this.items.length) {
      this.rangeMap = this.createRangeMap(this.rangeMap.paddingTop);
      this.rangeMap.splice(0, 0, inserted);
      deleted = this.items;
      this.items = inserted;
    } else {
      this.rangeMap.splice(start, deleteCount, inserted);
      deleted = splice(this.items, start, deleteCount, inserted);
    }
    const delta = elements.length - deleteCount;
    const renderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    const renderedRestRange = shift(previousRenderedRestRange, delta);
    const updateRange = Range.intersect(renderRange, renderedRestRange);
    for (let i = updateRange.start; i < updateRange.end; i++) {
      this.updateItemInDOM(this.items[i], i);
    }
    const removeRanges = Range.relativeComplement(renderedRestRange, renderRange);
    for (const range of removeRanges) {
      for (let i = range.start; i < range.end; i++) {
        this.removeItemFromDOM(i);
      }
    }
    const unrenderedRestRanges = previousUnrenderedRestRanges.map((r) => shift(r, delta));
    const elementsRange = { start, end: start + elements.length };
    const insertRanges = [elementsRange, ...unrenderedRestRanges].map((r) => Range.intersect(renderRange, r)).reverse();
    const insertedItems = [];
    for (const range of insertRanges) {
      for (let i = range.end - 1; i >= range.start; i--) {
        const item = this.items[i];
        const rows = rowsToDispose.get(item.templateId);
        const row = rows?.pop();
        this.insertItemInDOM(i, row);
        insertedItems.push(item);
      }
    }
    for (const rows of rowsToDispose.values()) {
      for (const row of rows) {
        this.cache.release(row);
      }
    }
    if (this.horizontalScrolling && insertedItems.length > 0) {
      this.measureItemWidths(insertedItems);
      this.eventuallyUpdateScrollWidth();
    }
    this.eventuallyUpdateScrollDimensions();
    if (this.supportDynamicHeights) {
      this._rerender(this.scrollTop, this.renderHeight);
    }
    return deleted.map((i) => i.element);
  }
  eventuallyUpdateScrollDimensions() {
    this._scrollHeight = this.contentHeight;
    this.rowsContainer.style.height = `${this._scrollHeight}px`;
    if (!this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
        this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
        this.updateScrollWidth();
        this.scrollableElementUpdateDisposable = null;
      });
    }
  }
  eventuallyUpdateScrollWidth() {
    if (!this.horizontalScrolling) {
      this.scrollableElementWidthDelayer.cancel();
      return;
    }
    this.scrollableElementWidthDelayer.trigger(() => this.updateScrollWidth());
  }
  updateScrollWidth() {
    if (!this.horizontalScrolling) {
      return;
    }
    let scrollWidth = 0;
    for (const item of this.items) {
      if (typeof item.width !== "undefined") {
        scrollWidth = Math.max(scrollWidth, item.width);
      }
    }
    this.scrollWidth = scrollWidth;
    this.scrollableElement.setScrollDimensions({ scrollWidth: scrollWidth === 0 ? 0 : scrollWidth + 10 });
    this._onDidChangeContentWidth.fire(this.scrollWidth);
  }
  updateWidth(index) {
    if (!this.horizontalScrolling || typeof this.scrollWidth === "undefined") {
      return;
    }
    const item = this.items[index];
    this.measureItemWidths([item]);
    if (typeof item.width !== "undefined" && item.width > this.scrollWidth) {
      this.scrollWidth = item.width;
      this.scrollableElement.setScrollDimensions({ scrollWidth: this.scrollWidth + 10 });
      this._onDidChangeContentWidth.fire(this.scrollWidth);
    }
  }
  rerender() {
    if (!this.supportDynamicHeights) {
      return;
    }
    for (const item of this.items) {
      item.lastDynamicHeightWidth = void 0;
    }
    this._rerender(this.lastRenderTop, this.lastRenderHeight);
  }
  get length() {
    return this.items.length;
  }
  get renderHeight() {
    const scrollDimensions = this.scrollableElement.getScrollDimensions();
    return scrollDimensions.height;
  }
  get firstVisibleIndex() {
    const range = this.getVisibleRange(this.lastRenderTop, this.lastRenderHeight);
    return range.start;
  }
  get firstMostlyVisibleIndex() {
    const firstVisibleIndex = this.firstVisibleIndex;
    const firstElTop = this.rangeMap.positionAt(firstVisibleIndex);
    const nextElTop = this.rangeMap.positionAt(firstVisibleIndex + 1);
    if (nextElTop !== -1) {
      const firstElMidpoint = (nextElTop - firstElTop) / 2 + firstElTop;
      if (firstElMidpoint < this.scrollTop) {
        return firstVisibleIndex + 1;
      }
    }
    return firstVisibleIndex;
  }
  get lastVisibleIndex() {
    const range = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
    return range.end - 1;
  }
  element(index) {
    return this.items[index].element;
  }
  indexOf(element) {
    return this.items.findIndex((item) => item.element === element);
  }
  domElement(index) {
    const row = this.items[index].row;
    return row && row.domNode;
  }
  elementHeight(index) {
    return this.items[index].size;
  }
  elementTop(index) {
    return this.rangeMap.positionAt(index);
  }
  indexAt(position) {
    return this.rangeMap.indexAt(position);
  }
  indexAfter(position) {
    return this.rangeMap.indexAfter(position);
  }
  layout(height, width) {
    const scrollDimensions = {
      height: typeof height === "number" ? height : getContentHeight(this.domNode)
    };
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      scrollDimensions.scrollHeight = this.scrollHeight;
    }
    this.scrollableElement.setScrollDimensions(scrollDimensions);
    if (typeof width !== "undefined") {
      this.renderWidth = width;
      if (this.supportDynamicHeights) {
        this._rerender(this.scrollTop, this.renderHeight);
      }
    }
    if (this.horizontalScrolling) {
      this.scrollableElement.setScrollDimensions({
        width: typeof width === "number" ? width : getContentWidth(this.domNode)
      });
      const scrollPos = this.scrollableElement.getScrollPosition();
      const scrollDims = this.scrollableElement.getScrollDimensions();
      const rightOffset = Math.max(0, scrollDims.scrollWidth - scrollPos.scrollLeft - this.renderWidth);
      this.domNode.style.setProperty("--list-scroll-right-offset", `${Math.max(rightOffset - 12, 0)}px`);
    }
  }
  // Render
  render(previousRenderRange, renderTop, renderHeight, renderLeft, scrollWidth, updateItemsInDOM = false, onScroll = false) {
    const renderRange = this.getRenderRange(renderTop, renderHeight);
    const rangesToInsert = Range.relativeComplement(renderRange, previousRenderRange).reverse();
    const rangesToRemove = Range.relativeComplement(previousRenderRange, renderRange);
    if (updateItemsInDOM) {
      const rangesToUpdate = Range.intersect(previousRenderRange, renderRange);
      for (let i = rangesToUpdate.start; i < rangesToUpdate.end; i++) {
        this.updateItemInDOM(this.items[i], i);
      }
    }
    const insertedItems = [];
    this.cache.transact(() => {
      for (const range of rangesToRemove) {
        for (let i = range.start; i < range.end; i++) {
          this.removeItemFromDOM(i, onScroll);
        }
      }
      for (const range of rangesToInsert) {
        for (let i = range.end - 1; i >= range.start; i--) {
          this.insertItemInDOM(i);
          insertedItems.push(this.items[i]);
        }
      }
    });
    if (this.horizontalScrolling && insertedItems.length > 0) {
      this.measureItemWidths(insertedItems);
      this.eventuallyUpdateScrollWidth();
    }
    if (renderLeft !== void 0) {
      this.rowsContainer.style.left = `-${renderLeft}px`;
    }
    this.rowsContainer.style.top = `-${renderTop}px`;
    if (this.horizontalScrolling && scrollWidth !== void 0) {
      this.rowsContainer.style.width = `${Math.max(scrollWidth, this.renderWidth)}px`;
      const rightOffset = Math.max(0, scrollWidth - (renderLeft ?? 0) - this.renderWidth);
      this.domNode.style.setProperty("--list-scroll-right-offset", `${Math.max(rightOffset - 12, 0)}px`);
    }
    this.lastRenderTop = renderTop;
    this.lastRenderHeight = renderHeight;
  }
  // DOM operations
  insertItemInDOM(index, row) {
    const item = this.items[index];
    if (!item.row) {
      if (row) {
        item.row = row;
        item.stale = true;
      } else {
        const result = this.cache.alloc(item.templateId);
        item.row = result.row;
        item.stale ||= result.isReusingConnectedDomNode;
      }
    }
    const role = this.accessibilityProvider.getRole(item.element) || "listitem";
    item.row.domNode.setAttribute("role", role);
    const checked = this.accessibilityProvider.isChecked(item.element);
    const toAriaState = (value) => value === "mixed" ? "mixed" : String(!!value);
    if (typeof checked === "boolean" || checked === "mixed") {
      item.row.domNode.setAttribute("aria-checked", toAriaState(checked));
    } else if (checked) {
      const update = (value) => item.row.domNode.setAttribute("aria-checked", toAriaState(value));
      update(checked.value);
      item.checkedDisposable = checked.onDidChange(() => update(checked.value));
    }
    if (item.stale || !item.row.domNode.parentElement) {
      const referenceNode = this.items.at(index + 1)?.row?.domNode ?? null;
      if (item.row.domNode.parentElement !== this.rowsContainer || item.row.domNode.nextElementSibling !== referenceNode) {
        this.rowsContainer.insertBefore(item.row.domNode, referenceNode);
      }
      item.stale = false;
    }
    this.updateItemInDOM(item, index);
    const renderer = this.renderers.get(item.templateId);
    if (!renderer) {
      throw new Error(`No renderer found for template id ${item.templateId}`);
    }
    renderer?.renderElement(item.element, index, item.row.templateData, { height: item.size });
    const uri = this.dnd.getDragURI(item.element);
    item.dragStartDisposable.dispose();
    item.row.domNode.draggable = !!uri;
    if (uri) {
      item.dragStartDisposable = addDisposableListener(item.row.domNode, "dragstart", (event) => this.onDragStart(item.element, uri, event));
    }
  }
  measureItemWidths(items) {
    const itemsWithRows = [];
    for (const item of items) {
      if (item.row) {
        itemsWithRows.push({ item, domNode: item.row.domNode });
      }
    }
    for (const { domNode } of itemsWithRows) {
      domNode.style.width = "fit-content";
    }
    for (const { item, domNode } of itemsWithRows) {
      item.width = getContentWidth(domNode);
      const style = getWindow(domNode).getComputedStyle(domNode);
      if (style.paddingLeft) {
        item.width += parseFloat(style.paddingLeft);
      }
      if (style.paddingRight) {
        item.width += parseFloat(style.paddingRight);
      }
    }
    for (const { domNode } of itemsWithRows) {
      domNode.style.width = "";
    }
  }
  updateItemInDOM(item, index) {
    item.row.domNode.style.top = `${this.elementTop(index)}px`;
    if (this.setRowHeight) {
      item.row.domNode.style.height = `${item.size}px`;
    }
    if (this.setRowLineHeight) {
      item.row.domNode.style.lineHeight = `${item.size}px`;
    }
    item.row.domNode.setAttribute("data-index", `${index}`);
    item.row.domNode.setAttribute("data-last-element", index === this.length - 1 ? "true" : "false");
    item.row.domNode.setAttribute("data-parity", index % 2 === 0 ? "even" : "odd");
    item.row.domNode.setAttribute("aria-setsize", String(this.accessibilityProvider.getSetSize(item.element, index, this.length)));
    item.row.domNode.setAttribute("aria-posinset", String(this.accessibilityProvider.getPosInSet(item.element, index)));
    item.row.domNode.setAttribute("id", this.getElementDomId(index));
    item.row.domNode.classList.toggle("drop-target", item.dropTarget);
  }
  removeItemFromDOM(index, onScroll) {
    const item = this.items[index];
    item.dragStartDisposable.dispose();
    item.checkedDisposable.dispose();
    if (item.row) {
      const renderer = this.renderers.get(item.templateId);
      if (renderer && renderer.disposeElement) {
        renderer.disposeElement(item.element, index, item.row.templateData, { height: item.size, onScroll });
      }
      this.cache.release(item.row);
      item.row = null;
    }
    if (this.horizontalScrolling) {
      this.eventuallyUpdateScrollWidth();
    }
  }
  getScrollTop() {
    const scrollPosition = this.scrollableElement.getScrollPosition();
    return scrollPosition.scrollTop;
  }
  setScrollTop(scrollTop, reuseAnimation) {
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      this.scrollableElement.setScrollDimensions({ scrollHeight: this.scrollHeight });
    }
    this.scrollableElement.setScrollPosition({ scrollTop, reuseAnimation });
  }
  getScrollLeft() {
    const scrollPosition = this.scrollableElement.getScrollPosition();
    return scrollPosition.scrollLeft;
  }
  setScrollLeft(scrollLeft) {
    if (this.scrollableElementUpdateDisposable) {
      this.scrollableElementUpdateDisposable.dispose();
      this.scrollableElementUpdateDisposable = null;
      this.scrollableElement.setScrollDimensions({ scrollWidth: this.scrollWidth });
    }
    this.scrollableElement.setScrollPosition({ scrollLeft });
  }
  get scrollTop() {
    return this.getScrollTop();
  }
  set scrollTop(scrollTop) {
    this.setScrollTop(scrollTop);
  }
  get scrollHeight() {
    return this._scrollHeight + (this.horizontalScrolling ? 10 : 0) + this.paddingBottom;
  }
  get onMouseClick() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "click")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseDblClick() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "dblclick")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseMiddleClick() {
    return Event.filter(Event.map(this.disposables.add(new DomEmitter(this.domNode, "auxclick")).event, (e) => this.toMouseEvent(e), this.disposables), (e) => e.browserEvent.button === 1, this.disposables);
  }
  get onMouseUp() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseup")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseDown() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mousedown")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseOver() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseover")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseMove() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mousemove")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onMouseOut() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "mouseout")).event, (e) => this.toMouseEvent(e), this.disposables);
  }
  get onContextMenu() {
    return Event.any(Event.map(this.disposables.add(new DomEmitter(this.domNode, "contextmenu")).event, (e) => this.toMouseEvent(e), this.disposables), Event.map(this.disposables.add(new DomEmitter(this.domNode, TouchEventType.Contextmenu)).event, (e) => this.toGestureEvent(e), this.disposables));
  }
  get onTouchStart() {
    return Event.map(this.disposables.add(new DomEmitter(this.domNode, "touchstart")).event, (e) => this.toTouchEvent(e), this.disposables);
  }
  get onTap() {
    return Event.map(this.disposables.add(new DomEmitter(this.rowsContainer, TouchEventType.Tap)).event, (e) => this.toGestureEvent(e), this.disposables);
  }
  toMouseEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toTouchEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toGestureEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.initialTarget || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    return { browserEvent, index, element };
  }
  toDragEvent(browserEvent) {
    const index = this.getItemIndexFromEventTarget(browserEvent.target || null);
    const item = typeof index === "undefined" ? void 0 : this.items[index];
    const element = item && item.element;
    const sector = this.getTargetSector(browserEvent, index);
    return { browserEvent, index, element, sector };
  }
  onScroll(e) {
    try {
      const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
      this.render(previousRenderRange, e.scrollTop, e.height, e.scrollLeft, e.scrollWidth, void 0, true);
      if (this.supportDynamicHeights) {
        this._rerender(e.scrollTop, e.height, e.inSmoothScrolling);
      }
    } catch (err) {
      console.error("Got bad scroll event:", e);
      throw err;
    }
  }
  onTouchChange(event) {
    event.preventDefault();
    event.stopPropagation();
    this.scrollTop -= event.translationY;
  }
  // DND
  onDragStart(element, uri, event) {
    if (!event.dataTransfer) {
      return;
    }
    const elements = this.dnd.getDragElements(element);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(DataTransfers.TEXT, uri);
    let label;
    if (this.dnd.getDragLabel) {
      label = this.dnd.getDragLabel(elements, event);
    }
    if (typeof label === "undefined") {
      label = String(elements.length);
    }
    applyDragImage(event, this.domNode, label, [
      this.domId
      /* add domId to get list specific styling */
    ]);
    this.domNode.classList.add("dragging");
    this.currentDragData = new ElementsDragAndDropData(elements);
    StaticDND.CurrentDragAndDropData = new ExternalElementsDragAndDropData(elements);
    this.dnd.onDragStart?.(this.currentDragData, event);
  }
  onPotentialSelectionStart(e) {
    this.currentSelectionDisposable.dispose();
    const doc = getDocument(this.domNode);
    const selectionStore = this.currentSelectionDisposable = new DisposableStore();
    const movementStore = selectionStore.add(new DisposableStore());
    movementStore.add(addDisposableListener(this.domNode, "selectstart", () => {
      movementStore.add(addDisposableListener(doc, "mousemove", (e2) => {
        if (doc.getSelection()?.isCollapsed === false) {
          this.setupDragAndDropScrollTopAnimation(e2);
        }
      }));
      selectionStore.add(toDisposable(() => {
        const previousRenderRange = this.getRenderRange(this.lastRenderTop, this.lastRenderHeight);
        this.currentSelectionBounds = void 0;
        this.render(previousRenderRange, this.lastRenderTop, this.lastRenderHeight, void 0, void 0);
      }));
      selectionStore.add(addDisposableListener(doc, "selectionchange", () => {
        const selection = doc.getSelection();
        if (!selection || selection.isCollapsed) {
          if (movementStore.isDisposed) {
            selectionStore.dispose();
          }
          return;
        }
        let start = this.getIndexOfListElement(selection.anchorNode);
        let end = this.getIndexOfListElement(selection.focusNode);
        if (start !== void 0 && end !== void 0) {
          if (end < start) {
            [start, end] = [end, start];
          }
          this.currentSelectionBounds = { start, end };
        }
      }));
    }));
    movementStore.add(addDisposableListener(doc, "mouseup", () => {
      movementStore.dispose();
      this.teardownDragAndDropScrollTopAnimation();
      if (doc.getSelection()?.isCollapsed !== false) {
        selectionStore.dispose();
      }
    }));
  }
  getIndexOfListElement(element) {
    if (!element || !this.domNode.contains(element)) {
      return void 0;
    }
    while (element && element !== this.domNode) {
      if (element.dataset?.index) {
        return Number(element.dataset.index);
      }
      element = element.parentElement;
    }
    return void 0;
  }
  onDragOver(event) {
    event.browserEvent.preventDefault();
    this.onDragLeaveTimeout.dispose();
    if (StaticDND.CurrentDragAndDropData && StaticDND.CurrentDragAndDropData.getData() === "vscode-ui") {
      return false;
    }
    this.setupDragAndDropScrollTopAnimation(event.browserEvent);
    if (!event.browserEvent.dataTransfer) {
      return false;
    }
    if (!this.currentDragData) {
      if (StaticDND.CurrentDragAndDropData) {
        this.currentDragData = StaticDND.CurrentDragAndDropData;
      } else {
        if (!event.browserEvent.dataTransfer.types) {
          return false;
        }
        this.currentDragData = new NativeDragAndDropData();
      }
    }
    const result = this.dnd.onDragOver(this.currentDragData, event.element, event.index, event.sector, event.browserEvent);
    this.canDrop = typeof result === "boolean" ? result : result.accept;
    if (!this.canDrop) {
      this.currentDragFeedback = void 0;
      this.currentDragFeedbackDisposable.dispose();
      return false;
    }
    event.browserEvent.dataTransfer.dropEffect = typeof result !== "boolean" && result.effect?.type === ListDragOverEffectType.Copy ? "copy" : "move";
    let feedback;
    if (typeof result !== "boolean" && result.feedback) {
      feedback = result.feedback;
    } else {
      if (typeof event.index === "undefined") {
        feedback = [-1];
      } else {
        feedback = [event.index];
      }
    }
    feedback = distinct(feedback).filter((i) => i >= -1 && i < this.length).sort((a, b) => a - b);
    feedback = feedback[0] === -1 ? [-1] : feedback;
    let dragOverEffectPosition = typeof result !== "boolean" && result.effect && result.effect.position ? result.effect.position : ListDragOverEffectPosition.Over;
    if (equalsDragFeedback(this.currentDragFeedback, feedback) && this.currentDragFeedbackPosition === dragOverEffectPosition) {
      return true;
    }
    this.currentDragFeedback = feedback;
    this.currentDragFeedbackPosition = dragOverEffectPosition;
    this.currentDragFeedbackDisposable.dispose();
    if (feedback[0] === -1) {
      this.domNode.classList.add(dragOverEffectPosition);
      this.rowsContainer.classList.add(dragOverEffectPosition);
      this.currentDragFeedbackDisposable = toDisposable(() => {
        this.domNode.classList.remove(dragOverEffectPosition);
        this.rowsContainer.classList.remove(dragOverEffectPosition);
      });
    } else {
      if (feedback.length > 1 && dragOverEffectPosition !== ListDragOverEffectPosition.Over) {
        throw new Error("Can't use multiple feedbacks with position different than 'over'");
      }
      if (dragOverEffectPosition === ListDragOverEffectPosition.After) {
        if (feedback[0] < this.length - 1) {
          feedback[0] += 1;
          dragOverEffectPosition = ListDragOverEffectPosition.Before;
        }
      }
      for (const index of feedback) {
        const item = this.items[index];
        item.dropTarget = true;
        item.row?.domNode.classList.add(dragOverEffectPosition);
      }
      this.currentDragFeedbackDisposable = toDisposable(() => {
        for (const index of feedback) {
          const item = this.items[index];
          item.dropTarget = false;
          item.row?.domNode.classList.remove(dragOverEffectPosition);
        }
      });
    }
    return true;
  }
  onDragLeave(event) {
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = disposableTimeout(() => this.clearDragOverFeedback(), 100, this.disposables);
    if (this.currentDragData) {
      this.dnd.onDragLeave?.(this.currentDragData, event.element, event.index, event.browserEvent);
    }
  }
  onDrop(event) {
    if (!this.canDrop) {
      return;
    }
    const dragData = this.currentDragData;
    this.teardownDragAndDropScrollTopAnimation();
    this.clearDragOverFeedback();
    this.domNode.classList.remove("dragging");
    this.currentDragData = void 0;
    StaticDND.CurrentDragAndDropData = void 0;
    if (!dragData || !event.browserEvent.dataTransfer) {
      return;
    }
    event.browserEvent.preventDefault();
    dragData.update(event.browserEvent.dataTransfer);
    this.dnd.drop(dragData, event.element, event.index, event.sector, event.browserEvent);
  }
  onDragEnd(event) {
    this.canDrop = false;
    this.teardownDragAndDropScrollTopAnimation();
    this.clearDragOverFeedback();
    this.domNode.classList.remove("dragging");
    this.currentDragData = void 0;
    StaticDND.CurrentDragAndDropData = void 0;
    this.dnd.onDragEnd?.(event);
  }
  clearDragOverFeedback() {
    this.currentDragFeedback = void 0;
    this.currentDragFeedbackPosition = void 0;
    this.currentDragFeedbackDisposable.dispose();
    this.currentDragFeedbackDisposable = Disposable.None;
  }
  // DND scroll top animation
  setupDragAndDropScrollTopAnimation(event) {
    if (!this.dragOverAnimationDisposable) {
      const viewTop = getTopLeftOffset(this.domNode).top;
      this.dragOverAnimationDisposable = animate(getWindow(this.domNode), this.animateDragAndDropScrollTop.bind(this, viewTop));
    }
    this.dragOverAnimationStopDisposable.dispose();
    this.dragOverAnimationStopDisposable = disposableTimeout(() => {
      if (this.dragOverAnimationDisposable) {
        this.dragOverAnimationDisposable.dispose();
        this.dragOverAnimationDisposable = void 0;
      }
    }, 1e3, this.disposables);
    this.dragOverMouseY = event.pageY;
  }
  animateDragAndDropScrollTop(viewTop) {
    if (this.dragOverMouseY === void 0) {
      return;
    }
    const diff = this.dragOverMouseY - viewTop;
    const upperLimit = this.renderHeight - 35;
    if (diff < 35) {
      this.scrollTop += Math.max(-14, Math.floor(0.3 * (diff - 35)));
    } else if (diff > upperLimit) {
      this.scrollTop += Math.min(14, Math.floor(0.3 * (diff - upperLimit)));
    }
  }
  teardownDragAndDropScrollTopAnimation() {
    this.dragOverAnimationStopDisposable.dispose();
    if (this.dragOverAnimationDisposable) {
      this.dragOverAnimationDisposable.dispose();
      this.dragOverAnimationDisposable = void 0;
    }
  }
  // Util
  getTargetSector(browserEvent, targetIndex) {
    if (targetIndex === void 0) {
      return void 0;
    }
    const relativePosition = browserEvent.offsetY / this.items[targetIndex].size;
    const sector = Math.floor(relativePosition / 0.25);
    return clamp(sector, 0, 3);
  }
  getItemIndexFromEventTarget(target) {
    const scrollableElement = this.scrollableElement.getDomNode();
    let element = target;
    while ((isHTMLElement(element) || isSVGElement(element)) && element !== this.rowsContainer && scrollableElement.contains(element)) {
      const rawIndex = element.getAttribute("data-index");
      if (rawIndex) {
        const index = Number(rawIndex);
        if (!isNaN(index)) {
          return index;
        }
      }
      element = element.parentElement;
    }
    return void 0;
  }
  getVisibleRange(renderTop, renderHeight) {
    return {
      start: this.rangeMap.indexAt(renderTop),
      end: this.rangeMap.indexAfter(renderTop + renderHeight - 1)
    };
  }
  getRenderRange(renderTop, renderHeight) {
    const range = this.getVisibleRange(renderTop, renderHeight);
    if (this.currentSelectionBounds) {
      const max = this.rangeMap.count;
      range.start = Math.min(range.start, this.currentSelectionBounds.start, max);
      range.end = Math.min(Math.max(range.end, this.currentSelectionBounds.end + 1), max);
    }
    return range;
  }
  /**
   * Given a stable rendered state, checks every rendered element whether it needs
   * to be probed for dynamic height. Adjusts scroll height and top if necessary.
   */
  _rerender(renderTop, renderHeight, inSmoothScrolling) {
    const previousRenderRange = this.getRenderRange(renderTop, renderHeight);
    let anchorElementIndex;
    let anchorElementTopDelta;
    if (renderTop === this.elementTop(previousRenderRange.start)) {
      anchorElementIndex = previousRenderRange.start;
      anchorElementTopDelta = 0;
    } else if (previousRenderRange.end - previousRenderRange.start > 1) {
      anchorElementIndex = previousRenderRange.start + 1;
      anchorElementTopDelta = this.elementTop(anchorElementIndex) - renderTop;
    }
    let heightDiff = 0;
    while (true) {
      const renderRange = this.getRenderRange(renderTop, renderHeight);
      let didChange = false;
      for (let i = renderRange.start; i < renderRange.end; i++) {
        const diff = this.probeDynamicHeight(i);
        if (diff !== 0) {
          this.rangeMap.splice(i, 1, [this.items[i]]);
        }
        heightDiff += diff;
        didChange = didChange || diff !== 0;
      }
      if (!didChange) {
        if (heightDiff !== 0) {
          this.eventuallyUpdateScrollDimensions();
        }
        const unrenderRanges = Range.relativeComplement(previousRenderRange, renderRange);
        for (const range of unrenderRanges) {
          for (let i = range.start; i < range.end; i++) {
            if (this.items[i].row) {
              this.removeItemFromDOM(i);
            }
          }
        }
        const renderRanges = Range.relativeComplement(renderRange, previousRenderRange).reverse();
        const insertedItems = [];
        for (const range of renderRanges) {
          for (let i = range.end - 1; i >= range.start; i--) {
            this.insertItemInDOM(i);
            insertedItems.push(this.items[i]);
          }
        }
        if (this.horizontalScrolling && insertedItems.length > 0) {
          this.measureItemWidths(insertedItems);
          this.eventuallyUpdateScrollWidth();
        }
        for (let i = renderRange.start; i < renderRange.end; i++) {
          if (this.items[i].row) {
            this.updateItemInDOM(this.items[i], i);
          }
        }
        if (typeof anchorElementIndex === "number") {
          const deltaScrollTop = this.scrollable.getFutureScrollPosition().scrollTop - renderTop;
          const newScrollTop = this.elementTop(anchorElementIndex) - anchorElementTopDelta + deltaScrollTop;
          this.setScrollTop(newScrollTop, inSmoothScrolling);
        }
        this._onDidChangeContentHeight.fire(this.contentHeight);
        return;
      }
    }
  }
  probeDynamicHeight(index) {
    const item = this.items[index];
    return this.probeDynamicHeightForItem(item, index);
  }
  probeDynamicHeightForItem(item, index) {
    if (!!this.virtualDelegate.getDynamicHeight) {
      const newSize = this.virtualDelegate.getDynamicHeight(item.element);
      if (newSize !== null) {
        const size2 = item.size;
        item.size = newSize;
        item.lastDynamicHeightWidth = this.renderWidth;
        this.publishDynamicHeight(item);
        return newSize - size2;
      }
    }
    if (!item.hasDynamicHeight || item.lastDynamicHeightWidth === this.renderWidth) {
      return 0;
    }
    if (!!this.virtualDelegate.hasDynamicHeight && !this.virtualDelegate.hasDynamicHeight(item.element)) {
      return 0;
    }
    const size = item.size;
    if (item.row) {
      item.row.domNode.style.height = "";
      item.size = item.row.domNode.offsetHeight;
      if (item.size === 0) {
        if (!isAncestor(item.row.domNode, getWindow(item.row.domNode).document.body)) {
          console.warn("Measuring item node that is not in DOM! Add ListView to the DOM before measuring row height!", new Error().stack);
        } else {
          console.warn("Measured item node at 0px- ensure that ListView is not display:none before measuring row height!", new Error().stack);
        }
      }
      item.lastDynamicHeightWidth = this.renderWidth;
      this.publishDynamicHeight(item);
      return item.size - size;
    }
    const { row } = this.cache.alloc(item.templateId);
    row.domNode.style.height = "";
    this.rowsContainer.appendChild(row.domNode);
    const renderer = this.renderers.get(item.templateId);
    if (!renderer) {
      throw new BugIndicatingError("Missing renderer for templateId: " + item.templateId);
    }
    renderer.renderElement(item.element, index, row.templateData);
    item.size = row.domNode.offsetHeight;
    renderer.disposeElement?.(item.element, index, row.templateData);
    item.lastDynamicHeightWidth = this.renderWidth;
    this.publishDynamicHeight(item);
    row.domNode.remove();
    this.cache.release(row);
    return item.size - size;
  }
  publishDynamicHeight(item) {
    if (item.size > 0) {
      this.virtualDelegate.setDynamicHeight?.(item.element, item.size);
    }
  }
  getElementDomId(index) {
    return `${this.domId}_${index}`;
  }
  // Dispose
  dispose() {
    for (const item of this.items) {
      item.dragStartDisposable.dispose();
      item.checkedDisposable.dispose();
      if (item.row) {
        const renderer = this.renderers.get(item.row.templateId);
        if (renderer) {
          renderer.disposeElement?.(item.element, -1, item.row.templateData, void 0);
          renderer.disposeTemplate(item.row.templateData);
        }
      }
    }
    this.items = [];
    this.domNode?.remove();
    this.dragOverAnimationDisposable?.dispose();
    this.disposables.dispose();
  }
};
_ListView.InstanceCount = 0;
__decorateClass([
  memoize
], _ListView.prototype, "onMouseClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseDblClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseMiddleClick", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseUp", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseDown", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseOver", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseMove", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onMouseOut", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onContextMenu", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onTouchStart", 1);
__decorateClass([
  memoize
], _ListView.prototype, "onTap", 1);
let ListView = _ListView;
export {
  ElementsDragAndDropData,
  ExternalElementsDragAndDropData,
  ListView,
  ListViewTargetSector,
  NativeDragAndDropData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGF0YVRyYW5zZmVycywgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFuaW1hdGUsIERpbWVuc2lvbiwgZ2V0QWN0aXZlRWxlbWVudCwgZ2V0Q29udGVudEhlaWdodCwgZ2V0Q29udGVudFdpZHRoLCBnZXREb2N1bWVudCwgZ2V0VG9wTGVmdE9mZnNldCwgZ2V0V2luZG93LCBpc0FuY2VzdG9yLCBpc0hUTUxFbGVtZW50LCBpc1NWR0VsZW1lbnQsIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQgfSBmcm9tICcuLi8uLi9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZSwgR2VzdHVyZUV2ZW50IH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QsIGVxdWFscywgc3BsaWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIElWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU5ld1Njcm9sbERpbWVuc2lvbnMsIFNjcm9sbGFibGUsIFNjcm9sbGJhclZpc2liaWxpdHksIFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSVNwbGljZWFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgSUxpc3REcmFnQW5kRHJvcCwgSUxpc3REcmFnRXZlbnQsIElMaXN0R2VzdHVyZUV2ZW50LCBJTGlzdE1vdXNlRXZlbnQsIElMaXN0UmVuZGVyZXIsIElMaXN0VG91Y2hFdmVudCwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLCBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlIH0gZnJvbSAnLi9saXN0LmpzJztcbmltcG9ydCB7IElSYW5nZU1hcCwgUmFuZ2VNYXAsIHNoaWZ0IH0gZnJvbSAnLi9yYW5nZU1hcC5qcyc7XG5pbXBvcnQgeyBJUm93LCBSb3dDYWNoZSB9IGZyb20gJy4vcm93Q2FjaGUuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBcmlhUm9sZSB9IGZyb20gJy4uL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlRWxlbWVudENoYW5nZU9wdGlvbnMgfSBmcm9tICcuLi9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnRPcHRpb25zLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgYXBwbHlEcmFnSW1hZ2UgfSBmcm9tICcuLi9kbmQvZG5kLmpzJztcblxuaW50ZXJmYWNlIElJdGVtPFQ+IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZWxlbWVudDogVDtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nO1xuXHRyb3c6IElSb3cgfCBudWxsO1xuXHRzaXplOiBudW1iZXI7XG5cdHdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGhhc0R5bmFtaWNIZWlnaHQ6IGJvb2xlYW47XG5cdGxhc3REeW5hbWljSGVpZ2h0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0dXJpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGRyb3BUYXJnZXQ6IGJvb2xlYW47XG5cdGRyYWdTdGFydERpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRjaGVja2VkRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdHN0YWxlOiBib29sZWFuO1xufVxuXG5jb25zdCBTdGF0aWNETkQgPSB7XG5cdEN1cnJlbnREcmFnQW5kRHJvcERhdGE6IHVuZGVmaW5lZCBhcyBJRHJhZ0FuZERyb3BEYXRhIHwgdW5kZWZpbmVkXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0Vmlld0RyYWdBbmREcm9wPFQ+IGV4dGVuZHMgSUxpc3REcmFnQW5kRHJvcDxUPiB7XG5cdGdldERyYWdFbGVtZW50cyhlbGVtZW50OiBUKTogVFtdO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBMaXN0Vmlld1RhcmdldFNlY3RvciB7XG5cdC8vIGRyb3AgcG9zaXRpb24gcmVsYXRpdmUgdG8gdGhlIHRvcCBvZiB0aGUgaXRlbVxuXHRUT1AgPSAwLCBcdFx0XHRcdC8vIFswJS0yNSUpXG5cdENFTlRFUl9UT1AgPSAxLCBcdFx0Ly8gWzI1JS01MCUpXG5cdENFTlRFUl9CT1RUT00gPSAyLCBcdFx0Ly8gWzUwJS03NSUpXG5cdEJPVFRPTSA9IDNcdFx0XHRcdC8vIFs3NSUtMTAwJSlcbn1cblxuZXhwb3J0IHR5cGUgQ2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGUgPSBib29sZWFuIHwgJ21peGVkJztcblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4ge1xuXHRnZXRTZXRTaXplPyhlbGVtZW50OiBULCBpbmRleDogbnVtYmVyLCBsaXN0TGVuZ3RoOiBudW1iZXIpOiBudW1iZXI7XG5cdGdldFBvc0luU2V0PyhlbGVtZW50OiBULCBpbmRleDogbnVtYmVyKTogbnVtYmVyO1xuXHRnZXRSb2xlPyhlbGVtZW50OiBUKTogQXJpYVJvbGUgfCB1bmRlZmluZWQ7XG5cdGlzQ2hlY2tlZD8oZWxlbWVudDogVCk6IENoZWNrQm94QWNjZXNzaWJsZVN0YXRlIHwgSVZhbHVlV2l0aENoYW5nZUV2ZW50PENoZWNrQm94QWNjZXNzaWJsZVN0YXRlPiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdFZpZXdPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgc21vb3RoU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGluZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbEJ5UGFnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eT86IG51bWJlcjtcblx0cmVhZG9ubHkgZmFzdFNjcm9sbFNlbnNpdGl2aXR5PzogbnVtYmVyO1xuXHRyZWFkb25seSBwYWRkaW5nVG9wPzogbnVtYmVyO1xuXHRyZWFkb25seSBwYWRkaW5nQm90dG9tPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0Vmlld09wdGlvbnM8VD4gZXh0ZW5kcyBJTGlzdFZpZXdPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgZG5kPzogSUxpc3RWaWV3RHJhZ0FuZERyb3A8VD47XG5cdHJlYWRvbmx5IHVzZVNoYWRvd3M/OiBib29sZWFuO1xuXHRyZWFkb25seSB2ZXJ0aWNhbFNjcm9sbE1vZGU/OiBTY3JvbGxiYXJWaXNpYmlsaXR5O1xuXHRyZWFkb25seSBzZXRSb3dMaW5lSGVpZ2h0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2V0Um93SGVpZ2h0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3VwcG9ydER5bmFtaWNIZWlnaHRzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbW91c2VTdXBwb3J0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdXNlclNlbGVjdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IElMaXN0Vmlld0FjY2Vzc2liaWxpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkgdHJhbnNmb3JtT3B0aW1pemF0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbml0aWFsU2l6ZT86IERpbWVuc2lvbjtcblx0cmVhZG9ubHkgc2Nyb2xsVG9BY3RpdmVFbGVtZW50PzogYm9vbGVhbjtcbn1cblxuY29uc3QgRGVmYXVsdE9wdGlvbnMgPSB7XG5cdHVzZVNoYWRvd3M6IHRydWUsXG5cdHZlcnRpY2FsU2Nyb2xsTW9kZTogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRzZXRSb3dMaW5lSGVpZ2h0OiB0cnVlLFxuXHRzZXRSb3dIZWlnaHQ6IHRydWUsXG5cdHN1cHBvcnREeW5hbWljSGVpZ2h0czogZmFsc2UsXG5cdGRuZDoge1xuXHRcdGdldERyYWdFbGVtZW50czxUPihlOiBUKSB7IHJldHVybiBbZV07IH0sXG5cdFx0Z2V0RHJhZ1VSSSgpIHsgcmV0dXJuIG51bGw7IH0sXG5cdFx0b25EcmFnU3RhcnQoKTogdm9pZCB7IH0sXG5cdFx0b25EcmFnT3ZlcigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuXHRcdGRyb3AoKSB7IH0sXG5cdFx0ZGlzcG9zZSgpIHsgfVxuXHR9LFxuXHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0dHJhbnNmb3JtT3B0aW1pemF0aW9uOiB0cnVlLFxuXHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZSxcbn0gc2F0aXNmaWVzIElMaXN0Vmlld09wdGlvbnM8YW55PjtcblxuZXhwb3J0IGNsYXNzIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPFQsIFRDb250ZXh0ID0gdm9pZD4gaW1wbGVtZW50cyBJRHJhZ0FuZERyb3BEYXRhIHtcblxuXHRyZWFkb25seSBlbGVtZW50czogVFtdO1xuXG5cdHByaXZhdGUgX2NvbnRleHQ6IFRDb250ZXh0IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGNvbnRleHQoKTogVENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0O1xuXHR9XG5cdHB1YmxpYyBzZXQgY29udGV4dCh2YWx1ZTogVENvbnRleHQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9jb250ZXh0ID0gdmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihlbGVtZW50czogVFtdKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGVsZW1lbnRzO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQgeyB9XG5cblx0Z2V0RGF0YSgpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlcm5hbEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPFQ+IGltcGxlbWVudHMgSURyYWdBbmREcm9wRGF0YSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudHM6IFRbXTtcblxuXHRjb25zdHJ1Y3RvcihlbGVtZW50czogVFtdKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGVsZW1lbnRzO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQgeyB9XG5cblx0Z2V0RGF0YSgpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLmVsZW1lbnRzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVEcmFnQW5kRHJvcERhdGEgaW1wbGVtZW50cyBJRHJhZ0FuZERyb3BEYXRhIHtcblxuXHRyZWFkb25seSB0eXBlczogdW5rbm93bltdO1xuXHRyZWFkb25seSBmaWxlczogdW5rbm93bltdO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMudHlwZXMgPSBbXTtcblx0XHR0aGlzLmZpbGVzID0gW107XG5cdH1cblxuXHR1cGRhdGUoZGF0YVRyYW5zZmVyOiBEYXRhVHJhbnNmZXIpOiB2b2lkIHtcblx0XHRpZiAoZGF0YVRyYW5zZmVyLnR5cGVzKSB7XG5cdFx0XHR0aGlzLnR5cGVzLnNwbGljZSgwLCB0aGlzLnR5cGVzLmxlbmd0aCwgLi4uZGF0YVRyYW5zZmVyLnR5cGVzKTtcblx0XHR9XG5cblx0XHRpZiAoZGF0YVRyYW5zZmVyLmZpbGVzKSB7XG5cdFx0XHR0aGlzLmZpbGVzLnNwbGljZSgwLCB0aGlzLmZpbGVzLmxlbmd0aCk7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZGF0YVRyYW5zZmVyLmZpbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGUgPSBkYXRhVHJhbnNmZXIuZmlsZXMuaXRlbShpKTtcblxuXHRcdFx0XHRpZiAoZmlsZSAmJiAoZmlsZS5zaXplIHx8IGZpbGUudHlwZSkpIHtcblx0XHRcdFx0XHR0aGlzLmZpbGVzLnB1c2goZmlsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXREYXRhKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlczogdGhpcy50eXBlcyxcblx0XHRcdGZpbGVzOiB0aGlzLmZpbGVzXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBlcXVhbHNEcmFnRmVlZGJhY2soZjE6IG51bWJlcltdIHwgdW5kZWZpbmVkLCBmMjogbnVtYmVyW10gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKEFycmF5LmlzQXJyYXkoZjEpICYmIEFycmF5LmlzQXJyYXkoZjIpKSB7XG5cdFx0cmV0dXJuIGVxdWFscyhmMSwgZjIpO1xuXHR9XG5cblx0cmV0dXJuIGYxID09PSBmMjtcbn1cblxuY2xhc3MgTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4gaW1wbGVtZW50cyBSZXF1aXJlZDxJTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4+IHtcblxuXHRyZWFkb25seSBnZXRTZXRTaXplOiAoZWxlbWVudDogVCwgaW5kZXg6IG51bWJlciwgbGlzdExlbmd0aDogbnVtYmVyKSA9PiBudW1iZXI7XG5cdHJlYWRvbmx5IGdldFBvc0luU2V0OiAoZWxlbWVudDogVCwgaW5kZXg6IG51bWJlcikgPT4gbnVtYmVyO1xuXHRyZWFkb25seSBnZXRSb2xlOiAoZWxlbWVudDogVCkgPT4gQXJpYVJvbGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzQ2hlY2tlZDogKGVsZW1lbnQ6IFQpID0+IENoZWNrQm94QWNjZXNzaWJsZVN0YXRlIHwgSVZhbHVlV2l0aENoYW5nZUV2ZW50PENoZWNrQm94QWNjZXNzaWJsZVN0YXRlPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/OiBJTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4pIHtcblx0XHRpZiAoYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRTZXRTaXplKSB7XG5cdFx0XHR0aGlzLmdldFNldFNpemUgPSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0U2V0U2l6ZS5iaW5kKGFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZ2V0U2V0U2l6ZSA9IChlLCBpLCBsKSA9PiBsO1xuXHRcdH1cblxuXHRcdGlmIChhY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldFBvc0luU2V0KSB7XG5cdFx0XHR0aGlzLmdldFBvc0luU2V0ID0gYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFBvc0luU2V0LmJpbmQoYWNjZXNzaWJpbGl0eVByb3ZpZGVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nZXRQb3NJblNldCA9IChlLCBpKSA9PiBpICsgMTtcblx0XHR9XG5cblx0XHRpZiAoYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRSb2xlKSB7XG5cdFx0XHR0aGlzLmdldFJvbGUgPSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0Um9sZS5iaW5kKGFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZ2V0Um9sZSA9IF8gPT4gJ2xpc3RpdGVtJztcblx0XHR9XG5cblx0XHRpZiAoYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5pc0NoZWNrZWQpIHtcblx0XHRcdHRoaXMuaXNDaGVja2VkID0gYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmlzQ2hlY2tlZC5iaW5kKGFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaXNDaGVja2VkID0gXyA9PiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RWaWV3PFQ+IGV4dGVuZHMgSVNwbGljZWFibGU8VD4sIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZG9tSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvbnRhaW5lckRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzY3JvbGxhYmxlRWxlbWVudERvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0cmVhZG9ubHkgY29udGVudEhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBjb250ZW50V2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0OiBFdmVudDxudW1iZXI+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRXaWR0aDogRXZlbnQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgcmVuZGVySGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNjcm9sbEhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBmaXJzdFZpc2libGVJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBmaXJzdE1vc3RseVZpc2libGVJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBsYXN0VmlzaWJsZUluZGV4OiBudW1iZXI7XG5cdG9uRGlkU2Nyb2xsOiBFdmVudDxTY3JvbGxFdmVudD47XG5cdG9uV2lsbFNjcm9sbDogRXZlbnQ8U2Nyb2xsRXZlbnQ+O1xuXHRvbk1vdXNlQ2xpY2s6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uTW91c2VEYmxDbGljazogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Nb3VzZU1pZGRsZUNsaWNrOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+O1xuXHRvbk1vdXNlVXA6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uTW91c2VEb3duOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+O1xuXHRvbk1vdXNlT3ZlcjogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+Pjtcblx0b25Nb3VzZU1vdmU6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uTW91c2VPdXQ6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uQ29udGV4dE1lbnU6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj47XG5cdG9uVG91Y2hTdGFydDogRXZlbnQ8SUxpc3RUb3VjaEV2ZW50PFQ+Pjtcblx0b25UYXA6IEV2ZW50PElMaXN0R2VzdHVyZUV2ZW50PFQ+Pjtcblx0ZWxlbWVudChpbmRleDogbnVtYmVyKTogVDtcblx0ZG9tRWxlbWVudChpbmRleDogbnVtYmVyKTogSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRnZXRFbGVtZW50RG9tSWQoaW5kZXg6IG51bWJlcik6IHN0cmluZztcblx0ZWxlbWVudEhlaWdodChpbmRleDogbnVtYmVyKTogbnVtYmVyO1xuXHRlbGVtZW50VG9wKGluZGV4OiBudW1iZXIpOiBudW1iZXI7XG5cdGluZGV4T2YoZWxlbWVudDogVCk6IG51bWJlcjtcblx0aW5kZXhBdChwb3NpdGlvbjogbnVtYmVyKTogbnVtYmVyO1xuXHRpbmRleEFmdGVyKHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXI7XG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSUxpc3RWaWV3T3B0aW9uc1VwZGF0ZSk6IHZvaWQ7XG5cdGdldFNjcm9sbFRvcCgpOiBudW1iZXI7XG5cdHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlciwgcmV1c2VBbmltYXRpb24/OiBib29sZWFuKTogdm9pZDtcblx0Z2V0U2Nyb2xsTGVmdCgpOiBudW1iZXI7XG5cdHNldFNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKTogdm9pZDtcblx0ZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudDogSU1vdXNlV2hlZWxFdmVudCk6IHZvaWQ7XG5cdGRlbGVnYXRlVmVydGljYWxTY3JvbGxiYXJQb2ludGVyRG93bihicm93c2VyRXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQ7XG5cdHVwZGF0ZVdpZHRoKGluZGV4OiBudW1iZXIpOiB2b2lkO1xuXHR1cGRhdGVFbGVtZW50SGVpZ2h0KGluZGV4OiBudW1iZXIsIHNpemU6IG51bWJlciB8IHVuZGVmaW5lZCwgYW5jaG9ySW5kZXg6IG51bWJlciB8IG51bGwpOiB2b2lkO1xuXHRyZXJlbmRlcigpOiB2b2lkO1xuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQ7XG59XG5cbi8qKlxuICogVGhlIHtAbGluayBMaXN0Vmlld30gaXMgYSB2aXJ0dWFsIHNjcm9sbGluZyBlbmdpbmUuXG4gKlxuICogR2l2ZW4gdGhhdCBpdCBvbmx5IHJlbmRlcnMgZWxlbWVudHMgd2l0aGluIGl0cyB2aWV3cG9ydCwgaXQgY2FuIGhvbGQgbGFyZ2VcbiAqIGNvbGxlY3Rpb25zIG9mIGVsZW1lbnRzIGFuZCBzdGF5IHZlcnkgcGVyZm9ybWFudC4gVGhlIHBlcmZvcm1hbmNlIGJvdHRsZW5lY2tcbiAqIHVzdWFsbHkgbGllcyB3aXRoaW4gdGhlIHVzZXIncyByZW5kZXJpbmcgY29kZSBmb3IgZWFjaCBlbGVtZW50LlxuICpcbiAqIEByZW1hcmtzIEl0IGlzIGEgbG93LWxldmVsIHdpZGdldCwgbm90IG1lYW50IHRvIGJlIHVzZWQgZGlyZWN0bHkuIFJlZmVyIHRvIHRoZVxuICogTGlzdCB3aWRnZXQgaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGNsYXNzIExpc3RWaWV3PFQ+IGltcGxlbWVudHMgSUxpc3RWaWV3PFQ+IHtcblxuXHRwcml2YXRlIHN0YXRpYyBJbnN0YW5jZUNvdW50ID0gMDtcblx0cmVhZG9ubHkgZG9tSWQgPSBgbGlzdF9pZF8keysrTGlzdFZpZXcuSW5zdGFuY2VDb3VudH1gO1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgaXRlbXM6IElJdGVtPFQ+W107XG5cdHByaXZhdGUgaXRlbUlkOiBudW1iZXI7XG5cdHByb3RlY3RlZCByYW5nZU1hcDogSVJhbmdlTWFwO1xuXHRwcml2YXRlIGNhY2hlOiBSb3dDYWNoZTxUPjtcblx0cHJpdmF0ZSByZW5kZXJlcnMgPSBuZXcgTWFwPHN0cmluZywgSUxpc3RSZW5kZXJlcjxhbnkgLyogVE9ET0Bqb2FvICovLCBhbnk+PigpO1xuXHRwcm90ZWN0ZWQgbGFzdFJlbmRlclRvcDogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgbGFzdFJlbmRlckhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIHJlbmRlcldpZHRoID0gMDtcblx0cHJpdmF0ZSByb3dzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlOiBTY3JvbGxhYmxlO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50OiBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSBfc2Nyb2xsSGVpZ2h0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudFdpZHRoRGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwKTtcblx0cHJpdmF0ZSBzcGxpY2luZyA9IGZhbHNlO1xuXHRwcml2YXRlIGRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZHJhZ092ZXJBbmltYXRpb25TdG9wRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgZHJhZ092ZXJNb3VzZVk6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgc2V0Um93TGluZUhlaWdodDogYm9vbGVhbjtcblx0cHJpdmF0ZSBzZXRSb3dIZWlnaHQ6IGJvb2xlYW47XG5cdHByaXZhdGUgc3VwcG9ydER5bmFtaWNIZWlnaHRzOiBib29sZWFuO1xuXHRwcml2YXRlIHBhZGRpbmdCb3R0b206IG51bWJlcjtcblx0cHJpdmF0ZSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IExpc3RWaWV3QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRwcml2YXRlIHNjcm9sbFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBkbmQ6IElMaXN0Vmlld0RyYWdBbmREcm9wPFQ+O1xuXHRwcml2YXRlIGNhbkRyb3A6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBjdXJyZW50RHJhZ0RhdGE6IElEcmFnQW5kRHJvcERhdGEgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudERyYWdGZWVkYmFjazogbnVtYmVyW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudERyYWdGZWVkYmFja1Bvc2l0aW9uOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RHJhZ0ZlZWRiYWNrRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgb25EcmFnTGVhdmVUaW1lb3V0OiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBjdXJyZW50U2VsZWN0aW9uRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgY3VycmVudFNlbGVjdGlvbkJvdW5kczogSVJhbmdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjdGl2ZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRXaWR0aCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50LmxhdGNoKHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5ldmVudCwgdW5kZWZpbmVkLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50V2lkdGg6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5sYXRjaCh0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRXaWR0aC5ldmVudCwgdW5kZWZpbmVkLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMucmFuZ2VNYXAuc2l6ZTsgfVxuXHRnZXQgY29udGVudFdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnNjcm9sbFdpZHRoID8/IDA7IH1cblxuXHRnZXQgb25EaWRTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGw7IH1cblx0Z2V0IG9uV2lsbFNjcm9sbCgpOiBFdmVudDxTY3JvbGxFdmVudD4geyByZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5vbldpbGxTY3JvbGw7IH1cblx0Z2V0IGNvbnRhaW5lckRvbU5vZGUoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5yb3dzQ29udGFpbmVyOyB9XG5cdGdldCBzY3JvbGxhYmxlRWxlbWVudERvbU5vZGUoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7IH1cblxuXHRwcml2YXRlIF9ob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgZ2V0IGhvcml6b250YWxTY3JvbGxpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9ob3Jpem9udGFsU2Nyb2xsaW5nOyB9XG5cdHByaXZhdGUgc2V0IGhvcml6b250YWxTY3JvbGxpbmcodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAodmFsdWUgPT09IHRoaXMuX2hvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgJiYgdGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSG9yaXpvbnRhbCBzY3JvbGxpbmcgYW5kIGR5bmFtaWMgaGVpZ2h0cyBub3Qgc3VwcG9ydGVkIHNpbXVsdGFuZW91c2x5Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZyA9IHZhbHVlO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdob3Jpem9udGFsLXNjcm9sbGluZycsIHRoaXMuX2hvcml6b250YWxTY3JvbGxpbmcpO1xuXG5cdFx0aWYgKHRoaXMuX2hvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdHRoaXMubWVhc3VyZUl0ZW1XaWR0aHModGhpcy5pdGVtcyk7XG5cblx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsV2lkdGgoKTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHdpZHRoOiBnZXRDb250ZW50V2lkdGgodGhpcy5kb21Ob2RlKSB9KTtcblx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KHRoaXMuc2Nyb2xsV2lkdGggfHwgMCwgdGhpcy5yZW5kZXJXaWR0aCl9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50V2lkdGhEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgd2lkdGg6IHRoaXMucmVuZGVyV2lkdGgsIHNjcm9sbFdpZHRoOiB0aGlzLnJlbmRlcldpZHRoIH0pO1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLndpZHRoID0gJyc7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tbGlzdC1zY3JvbGwtcmlnaHQtb2Zmc2V0Jyk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPGFueSAvKiBUT0RPQGpvYW8gKi8sIGFueT5bXSxcblx0XHRvcHRpb25zOiBJTGlzdFZpZXdPcHRpb25zPFQ+ID0gRGVmYXVsdE9wdGlvbnNcblx0KSB7XG5cdFx0aWYgKG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyAmJiBvcHRpb25zLnN1cHBvcnREeW5hbWljSGVpZ2h0cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdIb3Jpem9udGFsIHNjcm9sbGluZyBhbmQgZHluYW1pYyBoZWlnaHRzIG5vdCBzdXBwb3J0ZWQgc2ltdWx0YW5lb3VzbHknKTtcblx0XHR9XG5cblx0XHR0aGlzLml0ZW1zID0gW107XG5cdFx0dGhpcy5pdGVtSWQgPSAwO1xuXHRcdHRoaXMucmFuZ2VNYXAgPSB0aGlzLmNyZWF0ZVJhbmdlTWFwKG9wdGlvbnMucGFkZGluZ1RvcCA/PyAwKTtcblxuXHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgcmVuZGVyZXJzKSB7XG5cdFx0XHR0aGlzLnJlbmRlcmVycy5zZXQocmVuZGVyZXIudGVtcGxhdGVJZCwgcmVuZGVyZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FjaGUgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgUm93Q2FjaGUodGhpcy5yZW5kZXJlcnMpKTtcblxuXHRcdHRoaXMubGFzdFJlbmRlclRvcCA9IDA7XG5cdFx0dGhpcy5sYXN0UmVuZGVySGVpZ2h0ID0gMDtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLWxpc3QnO1xuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQodGhpcy5kb21JZCk7XG5cdFx0dGhpcy5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdtb3VzZS1zdXBwb3J0JywgdHlwZW9mIG9wdGlvbnMubW91c2VTdXBwb3J0ID09PSAnYm9vbGVhbicgPyBvcHRpb25zLm1vdXNlU3VwcG9ydCA6IHRydWUpO1xuXG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGluZyA9IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA/PyBEZWZhdWx0T3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdob3Jpem9udGFsLXNjcm9sbGluZycsIHRoaXMuX2hvcml6b250YWxTY3JvbGxpbmcpO1xuXG5cdFx0dGhpcy5wYWRkaW5nQm90dG9tID0gdHlwZW9mIG9wdGlvbnMucGFkZGluZ0JvdHRvbSA9PT0gJ3VuZGVmaW5lZCcgPyAwIDogb3B0aW9ucy5wYWRkaW5nQm90dG9tO1xuXG5cdFx0dGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSBuZXcgTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXIob3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIpO1xuXG5cdFx0dGhpcy5yb3dzQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5yb3dzQ29udGFpbmVyLmNsYXNzTmFtZSA9ICdtb25hY28tbGlzdC1yb3dzJztcblxuXHRcdGNvbnN0IHRyYW5zZm9ybU9wdGltaXphdGlvbiA9IG9wdGlvbnMudHJhbnNmb3JtT3B0aW1pemF0aW9uID8/IERlZmF1bHRPcHRpb25zLnRyYW5zZm9ybU9wdGltaXphdGlvbjtcblx0XHRpZiAodHJhbnNmb3JtT3B0aW1pemF0aW9uKSB7XG5cdFx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUudHJhbnNmb3JtID0gJ3RyYW5zbGF0ZTNkKDBweCwgMHB4LCAwcHgpJztcblx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLmNvbnRhaW4gPSAnc3RyaWN0Jztcblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChHZXN0dXJlLmFkZFRhcmdldCh0aGlzLnJvd3NDb250YWluZXIpKTtcblxuXHRcdHRoaXMuc2Nyb2xsYWJsZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBTY3JvbGxhYmxlKHtcblx0XHRcdGZvcmNlSW50ZWdlclZhbHVlczogdHJ1ZSxcblx0XHRcdHNtb290aFNjcm9sbER1cmF0aW9uOiAob3B0aW9ucy5zbW9vdGhTY3JvbGxpbmcgPz8gZmFsc2UpID8gMTI1IDogMCxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IGNiID0+IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksIGNiKVxuXHRcdH0pKTtcblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFNtb290aFNjcm9sbGFibGVFbGVtZW50KHRoaXMucm93c0NvbnRhaW5lciwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IG9wdGlvbnMuYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWwgPz8gRGVmYXVsdE9wdGlvbnMuYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWwsXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR2ZXJ0aWNhbDogb3B0aW9ucy52ZXJ0aWNhbFNjcm9sbE1vZGUgPz8gRGVmYXVsdE9wdGlvbnMudmVydGljYWxTY3JvbGxNb2RlLFxuXHRcdFx0dXNlU2hhZG93czogb3B0aW9ucy51c2VTaGFkb3dzID8/IERlZmF1bHRPcHRpb25zLnVzZVNoYWRvd3MsXG5cdFx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IG9wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRcdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiBvcHRpb25zLmZhc3RTY3JvbGxTZW5zaXRpdml0eSxcblx0XHRcdHNjcm9sbEJ5UGFnZTogb3B0aW9ucy5zY3JvbGxCeVBhZ2Vcblx0XHR9LCB0aGlzLnNjcm9sbGFibGUpKTtcblxuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZG9tTm9kZSk7XG5cblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50Lm9uU2Nyb2xsKHRoaXMub25TY3JvbGwsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnJvd3NDb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLkNoYW5nZSwgZSA9PiB0aGlzLm9uVG91Y2hDaGFuZ2UoZSBhcyBHZXN0dXJlRXZlbnQpKSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCksICdzY3JvbGwnLCBlID0+IHtcblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGUgYWN0aXZlIGVsZW1lbnQgaXMgc2Nyb2xsZWQgaW50byB2aWV3XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50KTtcblx0XHRcdGNvbnN0IHNjcm9sbFZhbHVlID0gZWxlbWVudC5zY3JvbGxUb3A7XG5cdFx0XHRlbGVtZW50LnNjcm9sbFRvcCA9IDA7XG5cdFx0XHRpZiAob3B0aW9ucy5zY3JvbGxUb0FjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5zZXRTY3JvbGxUb3AodGhpcy5zY3JvbGxUb3AgKyBzY3JvbGxWYWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2RyYWdvdmVyJywgZSA9PiB0aGlzLm9uRHJhZ092ZXIodGhpcy50b0RyYWdFdmVudChlKSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnZHJvcCcsIGUgPT4gdGhpcy5vbkRyb3AodGhpcy50b0RyYWdFdmVudChlKSkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnZHJhZ2xlYXZlJywgZSA9PiB0aGlzLm9uRHJhZ0xlYXZlKHRoaXMudG9EcmFnRXZlbnQoZSkpKSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2RyYWdlbmQnLCBlID0+IHRoaXMub25EcmFnRW5kKGUpKSk7XG5cdFx0aWYgKG9wdGlvbnMudXNlclNlbGVjdGlvbikge1xuXHRcdFx0aWYgKG9wdGlvbnMuZG5kKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRE5EIGFuZCB1c2VyIHNlbGVjdGlvbiBjYW5ub3QgYmUgdXNlZCBzaW11bHRhbmVvdXNseScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ21vdXNlZG93bicsIGUgPT4gdGhpcy5vblBvdGVudGlhbFNlbGVjdGlvblN0YXJ0KGUpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRSb3dMaW5lSGVpZ2h0ID0gb3B0aW9ucy5zZXRSb3dMaW5lSGVpZ2h0ID8/IERlZmF1bHRPcHRpb25zLnNldFJvd0xpbmVIZWlnaHQ7XG5cdFx0dGhpcy5zZXRSb3dIZWlnaHQgPSBvcHRpb25zLnNldFJvd0hlaWdodCA/PyBEZWZhdWx0T3B0aW9ucy5zZXRSb3dIZWlnaHQ7XG5cdFx0dGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMgPSBvcHRpb25zLnN1cHBvcnREeW5hbWljSGVpZ2h0cyA/PyBEZWZhdWx0T3B0aW9ucy5zdXBwb3J0RHluYW1pY0hlaWdodHM7XG5cdFx0dGhpcy5kbmQgPSBvcHRpb25zLmRuZCA/PyB0aGlzLmRpc3Bvc2FibGVzLmFkZChEZWZhdWx0T3B0aW9ucy5kbmQpO1xuXG5cdFx0dGhpcy5sYXlvdXQob3B0aW9ucy5pbml0aWFsU2l6ZT8uaGVpZ2h0LCBvcHRpb25zLmluaXRpYWxTaXplPy53aWR0aCk7XG5cdFx0aWYgKG9wdGlvbnMuc2Nyb2xsVG9BY3RpdmVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9zZXR1cEZvY3VzT2JzZXJ2ZXIoY29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cEZvY3VzT2JzZXJ2ZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdmb2N1cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0aWYgKHRoaXMuYWN0aXZlRWxlbWVudCAhPT0gZWxlbWVudCAmJiBlbGVtZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZlRWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0XHRcdHRoaXMuX3Njcm9sbFRvQWN0aXZlRWxlbWVudCh0aGlzLmFjdGl2ZUVsZW1lbnQsIGNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fSwgdHJ1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Nyb2xsVG9BY3RpdmVFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Ly8gVGhlIHNjcm9sbCBldmVudCBvbiB0aGUgbGlzdCBvbmx5IGZpcmVzIHdoZW4gc2Nyb2xsaW5nIGRvd24uXG5cdFx0Ly8gSWYgdGhlIGFjdGl2ZSBlbGVtZW50IGlzIGFib3ZlIHRoZSB2aWV3cG9ydCwgd2UgbmVlZCB0byBzY3JvbGwgdXAuXG5cdFx0Y29uc3QgY29udGFpbmVyUmVjdCA9IGNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBlbGVtZW50UmVjdCA9IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0XHRjb25zdCB0b3BPZmZzZXQgPSBlbGVtZW50UmVjdC50b3AgLSBjb250YWluZXJSZWN0LnRvcDtcblxuXHRcdGlmICh0b3BPZmZzZXQgPCAwKSB7XG5cdFx0XHQvLyBTY3JvbGwgdXBcblx0XHRcdHRoaXMuc2V0U2Nyb2xsVG9wKHRoaXMuc2Nyb2xsVG9wICsgdG9wT2Zmc2V0KTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElMaXN0Vmlld09wdGlvbnNVcGRhdGUpIHtcblx0XHRpZiAob3B0aW9ucy5wYWRkaW5nQm90dG9tICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucGFkZGluZ0JvdHRvbSA9IG9wdGlvbnMucGFkZGluZ0JvdHRvbTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbEhlaWdodDogdGhpcy5zY3JvbGxIZWlnaHQgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuc21vb3RoU2Nyb2xsaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZS5zZXRTbW9vdGhTY3JvbGxEdXJhdGlvbihvcHRpb25zLnNtb290aFNjcm9sbGluZyA/IDEyNSA6IDApO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXHRcdH1cblxuXHRcdGxldCBzY3JvbGxhYmxlT3B0aW9uczogU2Nyb2xsYWJsZUVsZW1lbnRDaGFuZ2VPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKG9wdGlvbnMuc2Nyb2xsQnlQYWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNjcm9sbGFibGVPcHRpb25zID0geyAuLi4oc2Nyb2xsYWJsZU9wdGlvbnMgPz8ge30pLCBzY3JvbGxCeVBhZ2U6IG9wdGlvbnMuc2Nyb2xsQnlQYWdlIH07XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNjcm9sbGFibGVPcHRpb25zID0geyAuLi4oc2Nyb2xsYWJsZU9wdGlvbnMgPz8ge30pLCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IG9wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNjcm9sbGFibGVPcHRpb25zID0geyAuLi4oc2Nyb2xsYWJsZU9wdGlvbnMgPz8ge30pLCBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6IG9wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0fVxuXG5cdFx0aWYgKHNjcm9sbGFibGVPcHRpb25zKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnVwZGF0ZU9wdGlvbnMoc2Nyb2xsYWJsZU9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnBhZGRpbmdUb3AgIT09IHVuZGVmaW5lZCAmJiBvcHRpb25zLnBhZGRpbmdUb3AgIT09IHRoaXMucmFuZ2VNYXAucGFkZGluZ1RvcCkge1xuXHRcdFx0Ly8gdHJpZ2dlciBhIHJlcmVuZGVyXG5cdFx0XHRjb25zdCBsYXN0UmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRcdGNvbnN0IG9mZnNldCA9IG9wdGlvbnMucGFkZGluZ1RvcCAtIHRoaXMucmFuZ2VNYXAucGFkZGluZ1RvcDtcblx0XHRcdHRoaXMucmFuZ2VNYXAucGFkZGluZ1RvcCA9IG9wdGlvbnMucGFkZGluZ1RvcDtcblxuXHRcdFx0dGhpcy5yZW5kZXIobGFzdFJlbmRlclJhbmdlLCBNYXRoLm1heCgwLCB0aGlzLmxhc3RSZW5kZXJUb3AgKyBvZmZzZXQpLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdHRoaXMuc2V0U2Nyb2xsVG9wKHRoaXMubGFzdFJlbmRlclRvcCk7XG5cblx0XHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVNjcm9sbERpbWVuc2lvbnMoKTtcblxuXHRcdFx0aWYgKHRoaXMuc3VwcG9ydER5bmFtaWNIZWlnaHRzKSB7XG5cdFx0XHRcdHRoaXMuX3JlcmVuZGVyKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5kZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdGRlbGVnYXRlVmVydGljYWxTY3JvbGxiYXJQb2ludGVyRG93bihicm93c2VyRXZlbnQ6IFBvaW50ZXJFdmVudCkge1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHR1cGRhdGVFbGVtZW50SGVpZ2h0KGluZGV4OiBudW1iZXIsIHNpemU6IG51bWJlciB8IHVuZGVmaW5lZCwgYW5jaG9ySW5kZXg6IG51bWJlciB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxTaXplID0gdGhpcy5pdGVtc1tpbmRleF0uc2l6ZTtcblxuXHRcdGlmICh0eXBlb2Ygc2l6ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmICghdGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdEeW5hbWljIGhlaWdodHMgbm90IHN1cHBvcnRlZCcsIG5ldyBFcnJvcigpLnN0YWNrKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLml0ZW1zW2luZGV4XS5sYXN0RHluYW1pY0hlaWdodFdpZHRoID0gdW5kZWZpbmVkO1xuXHRcdFx0c2l6ZSA9IG9yaWdpbmFsU2l6ZSArIHRoaXMucHJvYmVEeW5hbWljSGVpZ2h0KGluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAob3JpZ2luYWxTaXplID09PSBzaXplKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFJlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZSh0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cblx0XHRsZXQgaGVpZ2h0RGlmZiA9IDA7XG5cblx0XHRpZiAoaW5kZXggPCBsYXN0UmVuZGVyUmFuZ2Uuc3RhcnQpIHtcblx0XHRcdC8vIGRvIG5vdCBzY3JvbGwgdGhlIHZpZXdwb3J0IGlmIHJlc2l6ZWQgZWxlbWVudCBpcyBvdXQgb2Ygdmlld3BvcnRcblx0XHRcdGhlaWdodERpZmYgPSBzaXplIC0gb3JpZ2luYWxTaXplO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoYW5jaG9ySW5kZXggIT09IG51bGwgJiYgYW5jaG9ySW5kZXggPiBpbmRleCAmJiBhbmNob3JJbmRleCA8IGxhc3RSZW5kZXJSYW5nZS5lbmQpIHtcblx0XHRcdFx0Ly8gYW5jaG9yIGluIHZpZXdwb3J0XG5cdFx0XHRcdC8vIHJlc2l6ZWQgZWxlbWVudCBpbiB2aWV3cG9ydCBhbmQgYWJvdmUgdGhlIGFuY2hvclxuXHRcdFx0XHRoZWlnaHREaWZmID0gc2l6ZSAtIG9yaWdpbmFsU2l6ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlaWdodERpZmYgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmFuZ2VNYXAuc3BsaWNlKGluZGV4LCAxLCBbeyBzaXplOiBzaXplIH1dKTtcblx0XHR0aGlzLml0ZW1zW2luZGV4XS5zaXplID0gc2l6ZTtcblxuXHRcdHRoaXMucmVuZGVyKGxhc3RSZW5kZXJSYW5nZSwgTWF0aC5tYXgoMCwgdGhpcy5sYXN0UmVuZGVyVG9wICsgaGVpZ2h0RGlmZiksIHRoaXMubGFzdFJlbmRlckhlaWdodCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdHRoaXMuc2V0U2Nyb2xsVG9wKHRoaXMubGFzdFJlbmRlclRvcCk7XG5cblx0XHR0aGlzLmV2ZW50dWFsbHlVcGRhdGVTY3JvbGxEaW1lbnNpb25zKCk7XG5cblx0XHRpZiAodGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdHRoaXMuX3JlcmVuZGVyKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUodGhpcy5jb250ZW50SGVpZ2h0KTsgLy8gb3RoZXJ3aXNlIGZpcmVkIGluIF9yZXJlbmRlcigpXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVJhbmdlTWFwKHBhZGRpbmdUb3A6IG51bWJlcik6IElSYW5nZU1hcCB7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZU1hcChwYWRkaW5nVG9wKTtcblx0fVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogcmVhZG9ubHkgVFtdID0gW10pOiBUW10ge1xuXHRcdGlmICh0aGlzLnNwbGljaW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgcnVuIHJlY3Vyc2l2ZSBzcGxpY2VzLicpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3BsaWNpbmcgPSB0cnVlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLl9zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3BsaWNpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKHRoaXMuY29udGVudEhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGVsZW1lbnRzOiByZWFkb25seSBUW10gPSBbXSk6IFRbXSB7XG5cdFx0Y29uc3QgcHJldmlvdXNSZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdGNvbnN0IGRlbGV0ZVJhbmdlID0geyBzdGFydCwgZW5kOiBzdGFydCArIGRlbGV0ZUNvdW50IH07XG5cdFx0Y29uc3QgcmVtb3ZlUmFuZ2UgPSBSYW5nZS5pbnRlcnNlY3QocHJldmlvdXNSZW5kZXJSYW5nZSwgZGVsZXRlUmFuZ2UpO1xuXG5cdFx0Ly8gdHJ5IHRvIHJldXNlIHJvd3MsIGF2b2lkIHJlbW92aW5nIHRoZW0gZnJvbSBET01cblx0XHRjb25zdCByb3dzVG9EaXNwb3NlID0gbmV3IE1hcDxzdHJpbmcsIElSb3dbXT4oKTtcblx0XHRmb3IgKGxldCBpID0gcmVtb3ZlUmFuZ2UuZW5kIC0gMTsgaSA+PSByZW1vdmVSYW5nZS5zdGFydDsgaS0tKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpXTtcblx0XHRcdGl0ZW0uZHJhZ1N0YXJ0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRpdGVtLmNoZWNrZWREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKGl0ZW0ucm93KSB7XG5cdFx0XHRcdGxldCByb3dzID0gcm93c1RvRGlzcG9zZS5nZXQoaXRlbS50ZW1wbGF0ZUlkKTtcblxuXHRcdFx0XHRpZiAoIXJvd3MpIHtcblx0XHRcdFx0XHRyb3dzID0gW107XG5cdFx0XHRcdFx0cm93c1RvRGlzcG9zZS5zZXQoaXRlbS50ZW1wbGF0ZUlkLCByb3dzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcnMuZ2V0KGl0ZW0udGVtcGxhdGVJZCk7XG5cblx0XHRcdFx0aWYgKHJlbmRlcmVyICYmIHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KSB7XG5cdFx0XHRcdFx0cmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQoaXRlbS5lbGVtZW50LCBpLCBpdGVtLnJvdy50ZW1wbGF0ZURhdGEsIHsgaGVpZ2h0OiBpdGVtLnNpemUgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyb3dzLnVuc2hpZnQoaXRlbS5yb3cpO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtLnJvdyA9IG51bGw7XG5cdFx0XHRpdGVtLnN0YWxlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1Jlc3RSYW5nZTogSVJhbmdlID0geyBzdGFydDogc3RhcnQgKyBkZWxldGVDb3VudCwgZW5kOiB0aGlzLml0ZW1zLmxlbmd0aCB9O1xuXHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyZWRSZXN0UmFuZ2UgPSBSYW5nZS5pbnRlcnNlY3QocHJldmlvdXNSZXN0UmFuZ2UsIHByZXZpb3VzUmVuZGVyUmFuZ2UpO1xuXHRcdGNvbnN0IHByZXZpb3VzVW5yZW5kZXJlZFJlc3RSYW5nZXMgPSBSYW5nZS5yZWxhdGl2ZUNvbXBsZW1lbnQocHJldmlvdXNSZXN0UmFuZ2UsIHByZXZpb3VzUmVuZGVyUmFuZ2UpO1xuXG5cdFx0Y29uc3QgaW5zZXJ0ZWQgPSBlbGVtZW50cy5tYXA8SUl0ZW08VD4+KGVsZW1lbnQgPT4gKHtcblx0XHRcdGlkOiBTdHJpbmcodGhpcy5pdGVtSWQrKyksXG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0dGVtcGxhdGVJZDogdGhpcy52aXJ0dWFsRGVsZWdhdGUuZ2V0VGVtcGxhdGVJZChlbGVtZW50KSxcblx0XHRcdHNpemU6IHRoaXMudmlydHVhbERlbGVnYXRlLmdldEhlaWdodChlbGVtZW50KSxcblx0XHRcdHdpZHRoOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNEeW5hbWljSGVpZ2h0OiAhIXRoaXMudmlydHVhbERlbGVnYXRlLmhhc0R5bmFtaWNIZWlnaHQgJiYgdGhpcy52aXJ0dWFsRGVsZWdhdGUuaGFzRHluYW1pY0hlaWdodChlbGVtZW50KSxcblx0XHRcdGxhc3REeW5hbWljSGVpZ2h0V2lkdGg6IHVuZGVmaW5lZCxcblx0XHRcdHJvdzogbnVsbCxcblx0XHRcdHVyaTogdW5kZWZpbmVkLFxuXHRcdFx0ZHJvcFRhcmdldDogZmFsc2UsXG5cdFx0XHRkcmFnU3RhcnREaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUsXG5cdFx0XHRjaGVja2VkRGlzcG9zYWJsZTogRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0c3RhbGU6IGZhbHNlXG5cdFx0fSkpO1xuXG5cdFx0bGV0IGRlbGV0ZWQ6IElJdGVtPFQ+W107XG5cblx0XHQvLyBUT0RPQGpvYW86IGltcHJvdmUgdGhpcyBvcHRpbWl6YXRpb24gdG8gY2F0Y2ggZXZlbiBtb3JlIGNhc2VzXG5cdFx0aWYgKHN0YXJ0ID09PSAwICYmIGRlbGV0ZUNvdW50ID49IHRoaXMuaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnJhbmdlTWFwID0gdGhpcy5jcmVhdGVSYW5nZU1hcCh0aGlzLnJhbmdlTWFwLnBhZGRpbmdUb3ApO1xuXHRcdFx0dGhpcy5yYW5nZU1hcC5zcGxpY2UoMCwgMCwgaW5zZXJ0ZWQpO1xuXHRcdFx0ZGVsZXRlZCA9IHRoaXMuaXRlbXM7XG5cdFx0XHR0aGlzLml0ZW1zID0gaW5zZXJ0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmFuZ2VNYXAuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgaW5zZXJ0ZWQpO1xuXHRcdFx0ZGVsZXRlZCA9IHNwbGljZSh0aGlzLml0ZW1zLCBzdGFydCwgZGVsZXRlQ291bnQsIGluc2VydGVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWx0YSA9IGVsZW1lbnRzLmxlbmd0aCAtIGRlbGV0ZUNvdW50O1xuXHRcdGNvbnN0IHJlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZSh0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cdFx0Y29uc3QgcmVuZGVyZWRSZXN0UmFuZ2UgPSBzaGlmdChwcmV2aW91c1JlbmRlcmVkUmVzdFJhbmdlLCBkZWx0YSk7XG5cdFx0Y29uc3QgdXBkYXRlUmFuZ2UgPSBSYW5nZS5pbnRlcnNlY3QocmVuZGVyUmFuZ2UsIHJlbmRlcmVkUmVzdFJhbmdlKTtcblxuXHRcdGZvciAobGV0IGkgPSB1cGRhdGVSYW5nZS5zdGFydDsgaSA8IHVwZGF0ZVJhbmdlLmVuZDsgaSsrKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUl0ZW1JbkRPTSh0aGlzLml0ZW1zW2ldLCBpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdmVSYW5nZXMgPSBSYW5nZS5yZWxhdGl2ZUNvbXBsZW1lbnQocmVuZGVyZWRSZXN0UmFuZ2UsIHJlbmRlclJhbmdlKTtcblxuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmVtb3ZlUmFuZ2VzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnQ7IGkgPCByYW5nZS5lbmQ7IGkrKykge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW1Gcm9tRE9NKGkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVucmVuZGVyZWRSZXN0UmFuZ2VzID0gcHJldmlvdXNVbnJlbmRlcmVkUmVzdFJhbmdlcy5tYXAociA9PiBzaGlmdChyLCBkZWx0YSkpO1xuXHRcdGNvbnN0IGVsZW1lbnRzUmFuZ2UgPSB7IHN0YXJ0LCBlbmQ6IHN0YXJ0ICsgZWxlbWVudHMubGVuZ3RoIH07XG5cdFx0Y29uc3QgaW5zZXJ0UmFuZ2VzID0gW2VsZW1lbnRzUmFuZ2UsIC4uLnVucmVuZGVyZWRSZXN0UmFuZ2VzXS5tYXAociA9PiBSYW5nZS5pbnRlcnNlY3QocmVuZGVyUmFuZ2UsIHIpKS5yZXZlcnNlKCk7XG5cdFx0Y29uc3QgaW5zZXJ0ZWRJdGVtczogSUl0ZW08VD5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiBpbnNlcnRSYW5nZXMpIHtcblx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5lbmQgLSAxOyBpID49IHJhbmdlLnN0YXJ0OyBpLS0pIHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaV07XG5cdFx0XHRcdGNvbnN0IHJvd3MgPSByb3dzVG9EaXNwb3NlLmdldChpdGVtLnRlbXBsYXRlSWQpO1xuXHRcdFx0XHRjb25zdCByb3cgPSByb3dzPy5wb3AoKTtcblx0XHRcdFx0dGhpcy5pbnNlcnRJdGVtSW5ET00oaSwgcm93KTtcblx0XHRcdFx0aW5zZXJ0ZWRJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgcm93cyBvZiByb3dzVG9EaXNwb3NlLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGUucmVsZWFzZShyb3cpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgJiYgaW5zZXJ0ZWRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLm1lYXN1cmVJdGVtV2lkdGhzKGluc2VydGVkSXRlbXMpO1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsV2lkdGgoKTtcblx0XHR9XG5cblx0XHR0aGlzLmV2ZW50dWFsbHlVcGRhdGVTY3JvbGxEaW1lbnNpb25zKCk7XG5cblx0XHRpZiAodGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdHRoaXMuX3JlcmVuZGVyKHRoaXMuc2Nyb2xsVG9wLCB0aGlzLnJlbmRlckhlaWdodCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlbGV0ZWQubWFwKGkgPT4gaS5lbGVtZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBldmVudHVhbGx5VXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxIZWlnaHQgPSB0aGlzLmNvbnRlbnRIZWlnaHQ7XG5cdFx0dGhpcy5yb3dzQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX3Njcm9sbEhlaWdodH1weGA7XG5cblx0XHRpZiAoIXRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSA9IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRTY3JvbGxEaW1lbnNpb25zKHsgc2Nyb2xsSGVpZ2h0OiB0aGlzLnNjcm9sbEhlaWdodCB9KTtcblx0XHRcdFx0dGhpcy51cGRhdGVTY3JvbGxXaWR0aCgpO1xuXHRcdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSA9IG51bGw7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGV2ZW50dWFsbHlVcGRhdGVTY3JvbGxXaWR0aCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudFdpZHRoRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50V2lkdGhEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVTY3JvbGxXaWR0aCgpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2Nyb2xsV2lkdGgoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2Nyb2xsV2lkdGggPSAwO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGlmICh0eXBlb2YgaXRlbS53aWR0aCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0c2Nyb2xsV2lkdGggPSBNYXRoLm1heChzY3JvbGxXaWR0aCwgaXRlbS53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zY3JvbGxXaWR0aCA9IHNjcm9sbFdpZHRoO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbFdpZHRoOiBzY3JvbGxXaWR0aCA9PT0gMCA/IDAgOiAoc2Nyb2xsV2lkdGggKyAxMCkgfSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50V2lkdGguZmlyZSh0aGlzLnNjcm9sbFdpZHRoKTtcblx0fVxuXG5cdHVwZGF0ZVdpZHRoKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyB8fCB0eXBlb2YgdGhpcy5zY3JvbGxXaWR0aCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XG5cdFx0dGhpcy5tZWFzdXJlSXRlbVdpZHRocyhbaXRlbV0pO1xuXG5cdFx0aWYgKHR5cGVvZiBpdGVtLndpZHRoICE9PSAndW5kZWZpbmVkJyAmJiBpdGVtLndpZHRoID4gdGhpcy5zY3JvbGxXaWR0aCkge1xuXHRcdFx0dGhpcy5zY3JvbGxXaWR0aCA9IGl0ZW0ud2lkdGg7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoeyBzY3JvbGxXaWR0aDogdGhpcy5zY3JvbGxXaWR0aCArIDEwIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50V2lkdGguZmlyZSh0aGlzLnNjcm9sbFdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRyZXJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc3VwcG9ydER5bmFtaWNIZWlnaHRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGl0ZW0ubGFzdER5bmFtaWNIZWlnaHRXaWR0aCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXJlbmRlcih0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cdH1cblxuXHRnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHNjcm9sbERpbWVuc2lvbnMgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRyZXR1cm4gc2Nyb2xsRGltZW5zaW9ucy5oZWlnaHQ7XG5cdH1cblxuXHRnZXQgZmlyc3RWaXNpYmxlSW5kZXgoKTogbnVtYmVyIHtcblx0XHRjb25zdCByYW5nZSA9IHRoaXMuZ2V0VmlzaWJsZVJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRyZXR1cm4gcmFuZ2Uuc3RhcnQ7XG5cdH1cblxuXHRnZXQgZmlyc3RNb3N0bHlWaXNpYmxlSW5kZXgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBmaXJzdFZpc2libGVJbmRleCA9IHRoaXMuZmlyc3RWaXNpYmxlSW5kZXg7XG5cdFx0Y29uc3QgZmlyc3RFbFRvcCA9IHRoaXMucmFuZ2VNYXAucG9zaXRpb25BdChmaXJzdFZpc2libGVJbmRleCk7XG5cdFx0Y29uc3QgbmV4dEVsVG9wID0gdGhpcy5yYW5nZU1hcC5wb3NpdGlvbkF0KGZpcnN0VmlzaWJsZUluZGV4ICsgMSk7XG5cdFx0aWYgKG5leHRFbFRvcCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IGZpcnN0RWxNaWRwb2ludCA9IChuZXh0RWxUb3AgLSBmaXJzdEVsVG9wKSAvIDIgKyBmaXJzdEVsVG9wO1xuXHRcdFx0aWYgKGZpcnN0RWxNaWRwb2ludCA8IHRoaXMuc2Nyb2xsVG9wKSB7XG5cdFx0XHRcdHJldHVybiBmaXJzdFZpc2libGVJbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpcnN0VmlzaWJsZUluZGV4O1xuXHR9XG5cblx0Z2V0IGxhc3RWaXNpYmxlSW5kZXgoKTogbnVtYmVyIHtcblx0XHRjb25zdCByYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UodGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQpO1xuXHRcdHJldHVybiByYW5nZS5lbmQgLSAxO1xuXHR9XG5cblx0ZWxlbWVudChpbmRleDogbnVtYmVyKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNbaW5kZXhdLmVsZW1lbnQ7XG5cdH1cblxuXHRpbmRleE9mKGVsZW1lbnQ6IFQpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0uZWxlbWVudCA9PT0gZWxlbWVudCk7XG5cdH1cblxuXHRkb21FbGVtZW50KGluZGV4OiBudW1iZXIpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdGNvbnN0IHJvdyA9IHRoaXMuaXRlbXNbaW5kZXhdLnJvdztcblx0XHRyZXR1cm4gcm93ICYmIHJvdy5kb21Ob2RlO1xuXHR9XG5cblx0ZWxlbWVudEhlaWdodChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtc1tpbmRleF0uc2l6ZTtcblx0fVxuXG5cdGVsZW1lbnRUb3AoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMucmFuZ2VNYXAucG9zaXRpb25BdChpbmRleCk7XG5cdH1cblxuXHRpbmRleEF0KHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnJhbmdlTWFwLmluZGV4QXQocG9zaXRpb24pO1xuXHR9XG5cblx0aW5kZXhBZnRlcihwb3NpdGlvbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5yYW5nZU1hcC5pbmRleEFmdGVyKHBvc2l0aW9uKTtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsRGltZW5zaW9uczogSU5ld1Njcm9sbERpbWVuc2lvbnMgPSB7XG5cdFx0XHRoZWlnaHQ6IHR5cGVvZiBoZWlnaHQgPT09ICdudW1iZXInID8gaGVpZ2h0IDogZ2V0Q29udGVudEhlaWdodCh0aGlzLmRvbU5vZGUpXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSkge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUgPSBudWxsO1xuXHRcdFx0c2Nyb2xsRGltZW5zaW9ucy5zY3JvbGxIZWlnaHQgPSB0aGlzLnNjcm9sbEhlaWdodDtcblx0XHR9XG5cblx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoc2Nyb2xsRGltZW5zaW9ucyk7XG5cblx0XHRpZiAodHlwZW9mIHdpZHRoICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5yZW5kZXJXaWR0aCA9IHdpZHRoO1xuXG5cdFx0XHRpZiAodGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdFx0dGhpcy5fcmVyZW5kZXIodGhpcy5zY3JvbGxUb3AsIHRoaXMucmVuZGVySGVpZ2h0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0XHR3aWR0aDogdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IHdpZHRoIDogZ2V0Q29udGVudFdpZHRoKHRoaXMuZG9tTm9kZSlcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzY3JvbGxQb3MgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBzY3JvbGxEaW1zID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0XHRjb25zdCByaWdodE9mZnNldCA9IE1hdGgubWF4KDAsIHNjcm9sbERpbXMuc2Nyb2xsV2lkdGggLSBzY3JvbGxQb3Muc2Nyb2xsTGVmdCAtIHRoaXMucmVuZGVyV2lkdGgpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnNldFByb3BlcnR5KCctLWxpc3Qtc2Nyb2xsLXJpZ2h0LW9mZnNldCcsIGAke01hdGgubWF4KHJpZ2h0T2Zmc2V0IC0gMTIsIDApfXB4YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gUmVuZGVyXG5cblx0cHJvdGVjdGVkIHJlbmRlcihwcmV2aW91c1JlbmRlclJhbmdlOiBJUmFuZ2UsIHJlbmRlclRvcDogbnVtYmVyLCByZW5kZXJIZWlnaHQ6IG51bWJlciwgcmVuZGVyTGVmdDogbnVtYmVyIHwgdW5kZWZpbmVkLCBzY3JvbGxXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkLCB1cGRhdGVJdGVtc0luRE9NOiBib29sZWFuID0gZmFsc2UsIG9uU2Nyb2xsOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCByZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UocmVuZGVyVG9wLCByZW5kZXJIZWlnaHQpO1xuXG5cdFx0Y29uc3QgcmFuZ2VzVG9JbnNlcnQgPSBSYW5nZS5yZWxhdGl2ZUNvbXBsZW1lbnQocmVuZGVyUmFuZ2UsIHByZXZpb3VzUmVuZGVyUmFuZ2UpLnJldmVyc2UoKTtcblx0XHRjb25zdCByYW5nZXNUb1JlbW92ZSA9IFJhbmdlLnJlbGF0aXZlQ29tcGxlbWVudChwcmV2aW91c1JlbmRlclJhbmdlLCByZW5kZXJSYW5nZSk7XG5cblx0XHRpZiAodXBkYXRlSXRlbXNJbkRPTSkge1xuXHRcdFx0Y29uc3QgcmFuZ2VzVG9VcGRhdGUgPSBSYW5nZS5pbnRlcnNlY3QocHJldmlvdXNSZW5kZXJSYW5nZSwgcmVuZGVyUmFuZ2UpO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gcmFuZ2VzVG9VcGRhdGUuc3RhcnQ7IGkgPCByYW5nZXNUb1VwZGF0ZS5lbmQ7IGkrKykge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUl0ZW1JbkRPTSh0aGlzLml0ZW1zW2ldLCBpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnNlcnRlZEl0ZW1zOiBJSXRlbTxUPltdID0gW107XG5cblx0XHR0aGlzLmNhY2hlLnRyYW5zYWN0KCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzVG9SZW1vdmUpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0OyBpIDwgcmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW1Gcm9tRE9NKGksIG9uU2Nyb2xsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlc1RvSW5zZXJ0KSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSByYW5nZS5lbmQgLSAxOyBpID49IHJhbmdlLnN0YXJ0OyBpLS0pIHtcblx0XHRcdFx0XHR0aGlzLmluc2VydEl0ZW1JbkRPTShpKTtcblx0XHRcdFx0XHRpbnNlcnRlZEl0ZW1zLnB1c2godGhpcy5pdGVtc1tpXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgJiYgaW5zZXJ0ZWRJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLm1lYXN1cmVJdGVtV2lkdGhzKGluc2VydGVkSXRlbXMpO1xuXHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsV2lkdGgoKTtcblx0XHR9XG5cblx0XHRpZiAocmVuZGVyTGVmdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUubGVmdCA9IGAtJHtyZW5kZXJMZWZ0fXB4YDtcblx0XHR9XG5cblx0XHR0aGlzLnJvd3NDb250YWluZXIuc3R5bGUudG9wID0gYC0ke3JlbmRlclRvcH1weGA7XG5cblx0XHRpZiAodGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nICYmIHNjcm9sbFdpZHRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke01hdGgubWF4KHNjcm9sbFdpZHRoLCB0aGlzLnJlbmRlcldpZHRoKX1weGA7XG5cdFx0XHRjb25zdCByaWdodE9mZnNldCA9IE1hdGgubWF4KDAsIHNjcm9sbFdpZHRoIC0gKHJlbmRlckxlZnQgPz8gMCkgLSB0aGlzLnJlbmRlcldpZHRoKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1saXN0LXNjcm9sbC1yaWdodC1vZmZzZXQnLCBgJHtNYXRoLm1heChyaWdodE9mZnNldCAtIDEyLCAwKX1weGApO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdFJlbmRlclRvcCA9IHJlbmRlclRvcDtcblx0XHR0aGlzLmxhc3RSZW5kZXJIZWlnaHQgPSByZW5kZXJIZWlnaHQ7XG5cdH1cblxuXHQvLyBET00gb3BlcmF0aW9uc1xuXG5cdHByaXZhdGUgaW5zZXJ0SXRlbUluRE9NKGluZGV4OiBudW1iZXIsIHJvdz86IElSb3cpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XG5cblx0XHRpZiAoIWl0ZW0ucm93KSB7XG5cdFx0XHRpZiAocm93KSB7XG5cdFx0XHRcdGl0ZW0ucm93ID0gcm93O1xuXHRcdFx0XHRpdGVtLnN0YWxlID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY2FjaGUuYWxsb2MoaXRlbS50ZW1wbGF0ZUlkKTtcblx0XHRcdFx0aXRlbS5yb3cgPSByZXN1bHQucm93O1xuXHRcdFx0XHRpdGVtLnN0YWxlIHx8PSByZXN1bHQuaXNSZXVzaW5nQ29ubmVjdGVkRG9tTm9kZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByb2xlID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0Um9sZShpdGVtLmVsZW1lbnQpIHx8ICdsaXN0aXRlbSc7XG5cdFx0aXRlbS5yb3cuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCByb2xlKTtcblxuXHRcdGNvbnN0IGNoZWNrZWQgPSB0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5pc0NoZWNrZWQoaXRlbS5lbGVtZW50KTtcblx0XHRjb25zdCB0b0FyaWFTdGF0ZSA9ICh2YWx1ZTogQ2hlY2tCb3hBY2Nlc3NpYmxlU3RhdGUpID0+IHZhbHVlID09PSAnbWl4ZWQnID8gJ21peGVkJyA6IFN0cmluZyghIXZhbHVlKTtcblxuXHRcdGlmICh0eXBlb2YgY2hlY2tlZCA9PT0gJ2Jvb2xlYW4nIHx8IGNoZWNrZWQgPT09ICdtaXhlZCcpIHtcblx0XHRcdGl0ZW0ucm93LmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCB0b0FyaWFTdGF0ZShjaGVja2VkKSk7XG5cdFx0fSBlbHNlIGlmIChjaGVja2VkKSB7XG5cdFx0XHRjb25zdCB1cGRhdGUgPSAodmFsdWU6IENoZWNrQm94QWNjZXNzaWJsZVN0YXRlKSA9PiBpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIHRvQXJpYVN0YXRlKHZhbHVlKSk7XG5cdFx0XHR1cGRhdGUoY2hlY2tlZC52YWx1ZSk7XG5cdFx0XHRpdGVtLmNoZWNrZWREaXNwb3NhYmxlID0gY2hlY2tlZC5vbkRpZENoYW5nZSgoKSA9PiB1cGRhdGUoY2hlY2tlZC52YWx1ZSkpO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnN0YWxlIHx8ICFpdGVtLnJvdy5kb21Ob2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHJlZmVyZW5jZU5vZGUgPSB0aGlzLml0ZW1zLmF0KGluZGV4ICsgMSk/LnJvdz8uZG9tTm9kZSA/PyBudWxsO1xuXHRcdFx0aWYgKGl0ZW0ucm93LmRvbU5vZGUucGFyZW50RWxlbWVudCAhPT0gdGhpcy5yb3dzQ29udGFpbmVyIHx8IGl0ZW0ucm93LmRvbU5vZGUubmV4dEVsZW1lbnRTaWJsaW5nICE9PSByZWZlcmVuY2VOb2RlKSB7XG5cdFx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5pbnNlcnRCZWZvcmUoaXRlbS5yb3cuZG9tTm9kZSwgcmVmZXJlbmNlTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHRpdGVtLnN0YWxlID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVJdGVtSW5ET00oaXRlbSwgaW5kZXgpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVycy5nZXQoaXRlbS50ZW1wbGF0ZUlkKTtcblxuXHRcdGlmICghcmVuZGVyZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcmVuZGVyZXIgZm91bmQgZm9yIHRlbXBsYXRlIGlkICR7aXRlbS50ZW1wbGF0ZUlkfWApO1xuXHRcdH1cblxuXHRcdHJlbmRlcmVyPy5yZW5kZXJFbGVtZW50KGl0ZW0uZWxlbWVudCwgaW5kZXgsIGl0ZW0ucm93LnRlbXBsYXRlRGF0YSwgeyBoZWlnaHQ6IGl0ZW0uc2l6ZSB9KTtcblxuXHRcdGNvbnN0IHVyaSA9IHRoaXMuZG5kLmdldERyYWdVUkkoaXRlbS5lbGVtZW50KTtcblx0XHRpdGVtLmRyYWdTdGFydERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGl0ZW0ucm93LmRvbU5vZGUuZHJhZ2dhYmxlID0gISF1cmk7XG5cblx0XHRpZiAodXJpKSB7XG5cdFx0XHRpdGVtLmRyYWdTdGFydERpc3Bvc2FibGUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbS5yb3cuZG9tTm9kZSwgJ2RyYWdzdGFydCcsIGV2ZW50ID0+IHRoaXMub25EcmFnU3RhcnQoaXRlbS5lbGVtZW50LCB1cmksIGV2ZW50KSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIG1lYXN1cmVJdGVtV2lkdGhzKGl0ZW1zOiByZWFkb25seSBJSXRlbTxUPltdKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXNXaXRoUm93czogeyBpdGVtOiBJSXRlbTxUPjsgZG9tTm9kZTogSFRNTEVsZW1lbnQgfVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnJvdykge1xuXHRcdFx0XHRpdGVtc1dpdGhSb3dzLnB1c2goeyBpdGVtLCBkb21Ob2RlOiBpdGVtLnJvdy5kb21Ob2RlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyBkb21Ob2RlIH0gb2YgaXRlbXNXaXRoUm93cykge1xuXHRcdFx0ZG9tTm9kZS5zdHlsZS53aWR0aCA9ICdmaXQtY29udGVudCc7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IGl0ZW0sIGRvbU5vZGUgfSBvZiBpdGVtc1dpdGhSb3dzKSB7XG5cdFx0XHRpdGVtLndpZHRoID0gZ2V0Q29udGVudFdpZHRoKGRvbU5vZGUpO1xuXHRcdFx0Y29uc3Qgc3R5bGUgPSBnZXRXaW5kb3coZG9tTm9kZSkuZ2V0Q29tcHV0ZWRTdHlsZShkb21Ob2RlKTtcblxuXHRcdFx0aWYgKHN0eWxlLnBhZGRpbmdMZWZ0KSB7XG5cdFx0XHRcdGl0ZW0ud2lkdGggKz0gcGFyc2VGbG9hdChzdHlsZS5wYWRkaW5nTGVmdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdHlsZS5wYWRkaW5nUmlnaHQpIHtcblx0XHRcdFx0aXRlbS53aWR0aCArPSBwYXJzZUZsb2F0KHN0eWxlLnBhZGRpbmdSaWdodCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IGRvbU5vZGUgfSBvZiBpdGVtc1dpdGhSb3dzKSB7XG5cdFx0XHRkb21Ob2RlLnN0eWxlLndpZHRoID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJdGVtSW5ET00oaXRlbTogSUl0ZW08VD4sIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zdHlsZS50b3AgPSBgJHt0aGlzLmVsZW1lbnRUb3AoaW5kZXgpfXB4YDtcblxuXHRcdGlmICh0aGlzLnNldFJvd0hlaWdodCkge1xuXHRcdFx0aXRlbS5yb3chLmRvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7aXRlbS5zaXplfXB4YDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZXRSb3dMaW5lSGVpZ2h0KSB7XG5cdFx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7aXRlbS5zaXplfXB4YDtcblx0XHR9XG5cblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2RhdGEtaW5kZXgnLCBgJHtpbmRleH1gKTtcblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2RhdGEtbGFzdC1lbGVtZW50JywgaW5kZXggPT09IHRoaXMubGVuZ3RoIC0gMSA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnZGF0YS1wYXJpdHknLCBpbmRleCAlIDIgPT09IDAgPyAnZXZlbicgOiAnb2RkJyk7XG5cdFx0aXRlbS5yb3chLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLXNldHNpemUnLCBTdHJpbmcodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0U2V0U2l6ZShpdGVtLmVsZW1lbnQsIGluZGV4LCB0aGlzLmxlbmd0aCkpKTtcblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcG9zaW5zZXQnLCBTdHJpbmcodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0UG9zSW5TZXQoaXRlbS5lbGVtZW50LCBpbmRleCkpKTtcblx0XHRpdGVtLnJvdyEuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2lkJywgdGhpcy5nZXRFbGVtZW50RG9tSWQoaW5kZXgpKTtcblxuXHRcdGl0ZW0ucm93IS5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2Ryb3AtdGFyZ2V0JywgaXRlbS5kcm9wVGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlSXRlbUZyb21ET00oaW5kZXg6IG51bWJlciwgb25TY3JvbGw/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdGl0ZW0uZHJhZ1N0YXJ0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0aXRlbS5jaGVja2VkRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAoaXRlbS5yb3cpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5yZW5kZXJlcnMuZ2V0KGl0ZW0udGVtcGxhdGVJZCk7XG5cblx0XHRcdGlmIChyZW5kZXJlciAmJiByZW5kZXJlci5kaXNwb3NlRWxlbWVudCkge1xuXHRcdFx0XHRyZW5kZXJlci5kaXNwb3NlRWxlbWVudChpdGVtLmVsZW1lbnQsIGluZGV4LCBpdGVtLnJvdy50ZW1wbGF0ZURhdGEsIHsgaGVpZ2h0OiBpdGVtLnNpemUsIG9uU2Nyb2xsIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNhY2hlLnJlbGVhc2UoaXRlbS5yb3cpO1xuXHRcdFx0aXRlbS5yb3cgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcpIHtcblx0XHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVNjcm9sbFdpZHRoKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgc2Nyb2xsUG9zaXRpb24gPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0cmV0dXJuIHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcDtcblx0fVxuXG5cdHNldFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlciwgcmV1c2VBbmltYXRpb24/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50VXBkYXRlRGlzcG9zYWJsZSA9IG51bGw7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoeyBzY3JvbGxIZWlnaHQ6IHRoaXMuc2Nyb2xsSGVpZ2h0IH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3AsIHJldXNlQW5pbWF0aW9uIH0pO1xuXHR9XG5cblx0Z2V0U2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHNjcm9sbFBvc2l0aW9uID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdHJldHVybiBzY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0O1xuXHR9XG5cblx0c2V0U2Nyb2xsTGVmdChzY3JvbGxMZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zY3JvbGxhYmxlRWxlbWVudFVwZGF0ZURpc3Bvc2FibGUpIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnRVcGRhdGVEaXNwb3NhYmxlID0gbnVsbDtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbFdpZHRoOiB0aGlzLnNjcm9sbFdpZHRoIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0IH0pO1xuXHR9XG5cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U2Nyb2xsVG9wKCk7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy5zZXRTY3JvbGxUb3Aoc2Nyb2xsVG9wKTtcblx0fVxuXG5cdGdldCBzY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Nyb2xsSGVpZ2h0ICsgKHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyA/IDEwIDogMCkgKyB0aGlzLnBhZGRpbmdCb3R0b207XG5cdH1cblxuXHQvLyBFdmVudHNcblxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZUNsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ2NsaWNrJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZURibENsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ2RibGNsaWNrJykpLmV2ZW50LCBlID0+IHRoaXMudG9Nb3VzZUV2ZW50KGUpLCB0aGlzLmRpc3Bvc2FibGVzKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Nb3VzZU1pZGRsZUNsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmRvbU5vZGUsICdhdXhjbGljaycpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlIGFzIE1vdXNlRXZlbnQpLCB0aGlzLmRpc3Bvc2FibGVzKSwgZSA9PiBlLmJyb3dzZXJFdmVudC5idXR0b24gPT09IDEsIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cdEBtZW1vaXplIGdldCBvbk1vdXNlVXAoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnbW91c2V1cCcpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uTW91c2VEb3duKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ21vdXNlZG93bicpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uTW91c2VPdmVyKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ21vdXNlb3ZlcicpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uTW91c2VNb3ZlKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ21vdXNlbW92ZScpKS5ldmVudCwgZSA9PiB0aGlzLnRvTW91c2VFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblx0QG1lbW9pemUgZ2V0IG9uTW91c2VPdXQoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnbW91c2VvdXQnKSkuZXZlbnQsIGUgPT4gdGhpcy50b01vdXNlRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cdEBtZW1vaXplIGdldCBvbkNvbnRleHRNZW51KCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0R2VzdHVyZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5hbnk8SUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdEdlc3R1cmVFdmVudDxhbnk+PihFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCAnY29udGV4dG1lbnUnKSkuZXZlbnQsIGUgPT4gdGhpcy50b01vdXNlRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpLCBFdmVudC5tYXAodGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5kb21Ob2RlLCBUb3VjaEV2ZW50VHlwZS5Db250ZXh0bWVudSkpLmV2ZW50LCBlID0+IHRoaXMudG9HZXN0dXJlRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpKTsgfVxuXHRAbWVtb2l6ZSBnZXQgb25Ub3VjaFN0YXJ0KCk6IEV2ZW50PElMaXN0VG91Y2hFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMuZG9tTm9kZSwgJ3RvdWNoc3RhcnQnKSkuZXZlbnQsIGUgPT4gdGhpcy50b1RvdWNoRXZlbnQoZSksIHRoaXMuZGlzcG9zYWJsZXMpOyB9XG5cdEBtZW1vaXplIGdldCBvblRhcCgpOiBFdmVudDxJTGlzdEdlc3R1cmVFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMucm93c0NvbnRhaW5lciwgVG91Y2hFdmVudFR5cGUuVGFwKSkuZXZlbnQsIGUgPT4gdGhpcy50b0dlc3R1cmVFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7IH1cblxuXHRwcml2YXRlIHRvTW91c2VFdmVudChicm93c2VyRXZlbnQ6IE1vdXNlRXZlbnQpOiBJTGlzdE1vdXNlRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJdGVtSW5kZXhGcm9tRXZlbnRUYXJnZXQoYnJvd3NlckV2ZW50LnRhcmdldCB8fCBudWxsKTtcblx0XHRjb25zdCBpdGVtID0gdHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBpdGVtICYmIGl0ZW0uZWxlbWVudDtcblx0XHRyZXR1cm4geyBicm93c2VyRXZlbnQsIGluZGV4LCBlbGVtZW50IH07XG5cdH1cblxuXHRwcml2YXRlIHRvVG91Y2hFdmVudChicm93c2VyRXZlbnQ6IFRvdWNoRXZlbnQpOiBJTGlzdFRvdWNoRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJdGVtSW5kZXhGcm9tRXZlbnRUYXJnZXQoYnJvd3NlckV2ZW50LnRhcmdldCB8fCBudWxsKTtcblx0XHRjb25zdCBpdGVtID0gdHlwZW9mIGluZGV4ID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IHRoaXMuaXRlbXNbaW5kZXhdO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBpdGVtICYmIGl0ZW0uZWxlbWVudDtcblx0XHRyZXR1cm4geyBicm93c2VyRXZlbnQsIGluZGV4LCBlbGVtZW50IH07XG5cdH1cblxuXHRwcml2YXRlIHRvR2VzdHVyZUV2ZW50KGJyb3dzZXJFdmVudDogR2VzdHVyZUV2ZW50KTogSUxpc3RHZXN0dXJlRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRJdGVtSW5kZXhGcm9tRXZlbnRUYXJnZXQoYnJvd3NlckV2ZW50LmluaXRpYWxUYXJnZXQgfHwgbnVsbCk7XG5cdFx0Y29uc3QgaXRlbSA9IHR5cGVvZiBpbmRleCA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHRjb25zdCBlbGVtZW50ID0gaXRlbSAmJiBpdGVtLmVsZW1lbnQ7XG5cdFx0cmV0dXJuIHsgYnJvd3NlckV2ZW50LCBpbmRleCwgZWxlbWVudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b0RyYWdFdmVudChicm93c2VyRXZlbnQ6IERyYWdFdmVudCk6IElMaXN0RHJhZ0V2ZW50PFQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZ2V0SXRlbUluZGV4RnJvbUV2ZW50VGFyZ2V0KGJyb3dzZXJFdmVudC50YXJnZXQgfHwgbnVsbCk7XG5cdFx0Y29uc3QgaXRlbSA9IHR5cGVvZiBpbmRleCA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHRjb25zdCBlbGVtZW50ID0gaXRlbSAmJiBpdGVtLmVsZW1lbnQ7XG5cdFx0Y29uc3Qgc2VjdG9yID0gdGhpcy5nZXRUYXJnZXRTZWN0b3IoYnJvd3NlckV2ZW50LCBpbmRleCk7XG5cdFx0cmV0dXJuIHsgYnJvd3NlckV2ZW50LCBpbmRleCwgZWxlbWVudCwgc2VjdG9yIH07XG5cdH1cblxuXHRwcml2YXRlIG9uU2Nyb2xsKGU6IFNjcm9sbEV2ZW50KTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHRoaXMubGFzdFJlbmRlclRvcCwgdGhpcy5sYXN0UmVuZGVySGVpZ2h0KTtcblx0XHRcdHRoaXMucmVuZGVyKHByZXZpb3VzUmVuZGVyUmFuZ2UsIGUuc2Nyb2xsVG9wLCBlLmhlaWdodCwgZS5zY3JvbGxMZWZ0LCBlLnNjcm9sbFdpZHRoLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRpZiAodGhpcy5zdXBwb3J0RHluYW1pY0hlaWdodHMpIHtcblx0XHRcdFx0dGhpcy5fcmVyZW5kZXIoZS5zY3JvbGxUb3AsIGUuaGVpZ2h0LCBlLmluU21vb3RoU2Nyb2xsaW5nKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0dvdCBiYWQgc2Nyb2xsIGV2ZW50OicsIGUpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Ub3VjaENoYW5nZShldmVudDogR2VzdHVyZUV2ZW50KTogdm9pZCB7XG5cdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdHRoaXMuc2Nyb2xsVG9wIC09IGV2ZW50LnRyYW5zbGF0aW9uWTtcblx0fVxuXG5cdC8vIERORFxuXG5cdHByaXZhdGUgb25EcmFnU3RhcnQoZWxlbWVudDogVCwgdXJpOiBzdHJpbmcsIGV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5kbmQuZ2V0RHJhZ0VsZW1lbnRzKGVsZW1lbnQpO1xuXG5cdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnY29weU1vdmUnO1xuXHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKERhdGFUcmFuc2ZlcnMuVEVYVCwgdXJpKTtcblxuXHRcdGxldCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmRuZC5nZXREcmFnTGFiZWwpIHtcblx0XHRcdGxhYmVsID0gdGhpcy5kbmQuZ2V0RHJhZ0xhYmVsKGVsZW1lbnRzLCBldmVudCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbGFiZWwgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRsYWJlbCA9IFN0cmluZyhlbGVtZW50cy5sZW5ndGgpO1xuXHRcdH1cblxuXHRcdGFwcGx5RHJhZ0ltYWdlKGV2ZW50LCB0aGlzLmRvbU5vZGUsIGxhYmVsLCBbdGhpcy5kb21JZCAvKiBhZGQgZG9tSWQgdG8gZ2V0IGxpc3Qgc3BlY2lmaWMgc3R5bGluZyAqL10pO1xuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2RyYWdnaW5nJyk7XG5cdFx0dGhpcy5jdXJyZW50RHJhZ0RhdGEgPSBuZXcgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEoZWxlbWVudHMpO1xuXHRcdFN0YXRpY0RORC5DdXJyZW50RHJhZ0FuZERyb3BEYXRhID0gbmV3IEV4dGVybmFsRWxlbWVudHNEcmFnQW5kRHJvcERhdGEoZWxlbWVudHMpO1xuXG5cdFx0dGhpcy5kbmQub25EcmFnU3RhcnQ/Lih0aGlzLmN1cnJlbnREcmFnRGF0YSwgZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblBvdGVudGlhbFNlbGVjdGlvblN0YXJ0KGU6IE1vdXNlRXZlbnQpIHtcblx0XHR0aGlzLmN1cnJlbnRTZWxlY3Rpb25EaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBkb2MgPSBnZXREb2N1bWVudCh0aGlzLmRvbU5vZGUpO1xuXG5cdFx0Ly8gU2V0IHVwIGJvdGggdGhlICdtb3ZlbWVudCBzdG9yZScgZm9yIHdhdGNoaW5nIHRoZSBtb3VzZSwgYW5kIHRoZVxuXHRcdC8vICdzZWxlY3Rpb24gc3RvcmUnIHdoaWNoIGxhc3RzIGFzIGxvbmcgYXMgdGhlcmUncyBhIHNlbGVjdGlvbiwgZXZlblxuXHRcdC8vIGFmdGVyIHRoZSB1c3IgaGFzIHN0b3BwZWQgbW9kaWZ5aW5nIGl0LlxuXHRcdGNvbnN0IHNlbGVjdGlvblN0b3JlID0gdGhpcy5jdXJyZW50U2VsZWN0aW9uRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb3ZlbWVudFN0b3JlID0gc2VsZWN0aW9uU3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHQvLyBUaGUgc2VsZWN0aW9uIGV2ZW50cyB3ZSBnZXQgZnJvbSB0aGUgRE9NIGFyZSBmYWlybHkgbGltaXRlZCBhbmQgd2UgbGFjayBhICdzZWxlY3Rpb24gZW5kJyBldmVudC5cblx0XHQvLyBTZWxlY3Rpb24gZXZlbnRzIGFsc28gZG9uJ3QgdGVsbCB1cyB3aGVyZSB0aGUgaW5wdXQgZG9pbmcgdGhlIHNlbGVjdGlvbiBpcy4gU28sIG1ha2UgYSBwb29yXG5cdFx0Ly8gYXNzdW1wdGlvbiB0aGF0IGEgdXNlciBpcyB1c2luZyB0aGUgbW91c2UsIGFuZCBiYXNlIG91ciBldmVudHMgb24gdGhhdC5cblx0XHRtb3ZlbWVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnc2VsZWN0c3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRtb3ZlbWVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9jLCAnbW91c2Vtb3ZlJywgZSA9PiB7XG5cdFx0XHRcdGlmIChkb2MuZ2V0U2VsZWN0aW9uKCk/LmlzQ29sbGFwc2VkID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0dXBEcmFnQW5kRHJvcFNjcm9sbFRvcEFuaW1hdGlvbihlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBUaGUgc2VsZWN0aW9uIGlzIGNsZWFyZWQgZWl0aGVyIG9uIG1vdXNldXAgaWYgdGhlcmUncyBubyBzZWxlY3Rpb24sIG9yIG9uIG5leHQgbW91c2Vkb3duXG5cdFx0XHQvLyB3aGVuIGB0aGlzLmN1cnJlbnRTZWxlY3Rpb25EaXNwb3NhYmxlYCBpcyByZXNldC5cblx0XHRcdHNlbGVjdGlvblN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c1JlbmRlclJhbmdlID0gdGhpcy5nZXRSZW5kZXJSYW5nZSh0aGlzLmxhc3RSZW5kZXJUb3AsIHRoaXMubGFzdFJlbmRlckhlaWdodCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGlvbkJvdW5kcyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5yZW5kZXIocHJldmlvdXNSZW5kZXJSYW5nZSwgdGhpcy5sYXN0UmVuZGVyVG9wLCB0aGlzLmxhc3RSZW5kZXJIZWlnaHQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdHNlbGVjdGlvblN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9jLCAnc2VsZWN0aW9uY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBkb2MuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdC8vIGlmIHRoZSBzZWxlY3Rpb24gY2hhbmdlZCBfYWZ0ZXJfIG1vdXNldXAsIGl0J3MgZnJvbSBjbGVhcmluZyB0aGUgbGlzdCBvciBzaW1pbGFyLCBzbyB0ZWFyZG93blxuXHRcdFx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24uaXNDb2xsYXBzZWQpIHtcblx0XHRcdFx0XHRpZiAobW92ZW1lbnRTdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25TdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBzdGFydCA9IHRoaXMuZ2V0SW5kZXhPZkxpc3RFbGVtZW50KHNlbGVjdGlvbi5hbmNob3JOb2RlIGFzIEhUTUxFbGVtZW50KTtcblx0XHRcdFx0bGV0IGVuZCA9IHRoaXMuZ2V0SW5kZXhPZkxpc3RFbGVtZW50KHNlbGVjdGlvbi5mb2N1c05vZGUgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdFx0XHRpZiAoc3RhcnQgIT09IHVuZGVmaW5lZCAmJiBlbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGlmIChlbmQgPCBzdGFydCkge1xuXHRcdFx0XHRcdFx0W3N0YXJ0LCBlbmRdID0gW2VuZCwgc3RhcnRdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRTZWxlY3Rpb25Cb3VuZHMgPSB7IHN0YXJ0LCBlbmQgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdG1vdmVtZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb2MsICdtb3VzZXVwJywgKCkgPT4ge1xuXHRcdFx0bW92ZW1lbnRTdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnRlYXJkb3duRHJhZ0FuZERyb3BTY3JvbGxUb3BBbmltYXRpb24oKTtcblxuXHRcdFx0aWYgKGRvYy5nZXRTZWxlY3Rpb24oKT8uaXNDb2xsYXBzZWQgIT09IGZhbHNlKSB7XG5cdFx0XHRcdHNlbGVjdGlvblN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGV4T2ZMaXN0RWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZWxlbWVudCB8fCAhdGhpcy5kb21Ob2RlLmNvbnRhaW5zKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHdoaWxlIChlbGVtZW50ICYmIGVsZW1lbnQgIT09IHRoaXMuZG9tTm9kZSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuZGF0YXNldD8uaW5kZXgpIHtcblx0XHRcdFx0cmV0dXJuIE51bWJlcihlbGVtZW50LmRhdGFzZXQuaW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHRlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ092ZXIoZXZlbnQ6IElMaXN0RHJhZ0V2ZW50PFQ+KTogYm9vbGVhbiB7XG5cdFx0ZXZlbnQuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7IC8vIG5lZWRlZCBzbyB0aGF0IHRoZSBkcm9wIGV2ZW50IGZpcmVzIChodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8yMTMzOTkyNC9kcm9wLWV2ZW50LW5vdC1maXJpbmctaW4tY2hyb21lKVxuXG5cdFx0dGhpcy5vbkRyYWdMZWF2ZVRpbWVvdXQuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKFN0YXRpY0RORC5DdXJyZW50RHJhZ0FuZERyb3BEYXRhICYmIFN0YXRpY0RORC5DdXJyZW50RHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKSA9PT0gJ3ZzY29kZS11aScpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNldHVwRHJhZ0FuZERyb3BTY3JvbGxUb3BBbmltYXRpb24oZXZlbnQuYnJvd3NlckV2ZW50KTtcblxuXHRcdGlmICghZXZlbnQuYnJvd3NlckV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERyYWcgb3ZlciBmcm9tIG91dHNpZGVcblx0XHRpZiAoIXRoaXMuY3VycmVudERyYWdEYXRhKSB7XG5cdFx0XHRpZiAoU3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGEpIHtcblx0XHRcdFx0Ly8gRHJhZyBvdmVyIGZyb20gYW5vdGhlciBsaXN0XG5cdFx0XHRcdHRoaXMuY3VycmVudERyYWdEYXRhID0gU3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGE7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERyYWcgb3ZlciBmcm9tIHRoZSBkZXNrdG9wXG5cdFx0XHRcdGlmICghZXZlbnQuYnJvd3NlckV2ZW50LmRhdGFUcmFuc2Zlci50eXBlcykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuY3VycmVudERyYWdEYXRhID0gbmV3IE5hdGl2ZURyYWdBbmREcm9wRGF0YSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZG5kLm9uRHJhZ092ZXIodGhpcy5jdXJyZW50RHJhZ0RhdGEsIGV2ZW50LmVsZW1lbnQsIGV2ZW50LmluZGV4LCBldmVudC5zZWN0b3IsIGV2ZW50LmJyb3dzZXJFdmVudCk7XG5cdFx0dGhpcy5jYW5Ecm9wID0gdHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nID8gcmVzdWx0IDogcmVzdWx0LmFjY2VwdDtcblxuXHRcdGlmICghdGhpcy5jYW5Ecm9wKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2sgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAodHlwZW9mIHJlc3VsdCAhPT0gJ2Jvb2xlYW4nICYmIHJlc3VsdC5lZmZlY3Q/LnR5cGUgPT09IExpc3REcmFnT3ZlckVmZmVjdFR5cGUuQ29weSkgPyAnY29weScgOiAnbW92ZSc7XG5cblx0XHRsZXQgZmVlZGJhY2s6IG51bWJlcltdO1xuXG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgIT09ICdib29sZWFuJyAmJiByZXN1bHQuZmVlZGJhY2spIHtcblx0XHRcdGZlZWRiYWNrID0gcmVzdWx0LmZlZWRiYWNrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodHlwZW9mIGV2ZW50LmluZGV4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRmZWVkYmFjayA9IFstMV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmZWVkYmFjayA9IFtldmVudC5pbmRleF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc2FuaXRpemUgZmVlZGJhY2sgbGlzdFxuXHRcdGZlZWRiYWNrID0gZGlzdGluY3QoZmVlZGJhY2spLmZpbHRlcihpID0+IGkgPj0gLTEgJiYgaSA8IHRoaXMubGVuZ3RoKS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cdFx0ZmVlZGJhY2sgPSBmZWVkYmFja1swXSA9PT0gLTEgPyBbLTFdIDogZmVlZGJhY2s7XG5cblx0XHRsZXQgZHJhZ092ZXJFZmZlY3RQb3NpdGlvbiA9IHR5cGVvZiByZXN1bHQgIT09ICdib29sZWFuJyAmJiByZXN1bHQuZWZmZWN0ICYmIHJlc3VsdC5lZmZlY3QucG9zaXRpb24gPyByZXN1bHQuZWZmZWN0LnBvc2l0aW9uIDogTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uT3ZlcjtcblxuXHRcdGlmIChlcXVhbHNEcmFnRmVlZGJhY2sodGhpcy5jdXJyZW50RHJhZ0ZlZWRiYWNrLCBmZWVkYmFjaykgJiYgdGhpcy5jdXJyZW50RHJhZ0ZlZWRiYWNrUG9zaXRpb24gPT09IGRyYWdPdmVyRWZmZWN0UG9zaXRpb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFjayA9IGZlZWRiYWNrO1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFja1Bvc2l0aW9uID0gZHJhZ092ZXJFZmZlY3RQb3NpdGlvbjtcblx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGlmIChmZWVkYmFja1swXSA9PT0gLTEpIHsgLy8gZW50aXJlIGxpc3QgZmVlZGJhY2tcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKGRyYWdPdmVyRWZmZWN0UG9zaXRpb24pO1xuXHRcdFx0dGhpcy5yb3dzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHRcdHRoaXMucm93c0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGRyYWdPdmVyRWZmZWN0UG9zaXRpb24pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0aWYgKGZlZWRiYWNrLmxlbmd0aCA+IDEgJiYgZHJhZ092ZXJFZmZlY3RQb3NpdGlvbiAhPT0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uT3Zlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgdXNlIG11bHRpcGxlIGZlZWRiYWNrcyB3aXRoIHBvc2l0aW9uIGRpZmZlcmVudCB0aGFuIFxcJ292ZXJcXCcnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZXJlIGlzIG5vIGZsaWNrZXIgd2hlbiBtb3ZpbmcgYmV0d2VlbiB0d28gaXRlbXNcblx0XHRcdC8vIEFsd2F5cyB1c2UgdGhlIGJlZm9yZSBmZWVkYmFjayBpZiBwb3NzaWJsZVxuXHRcdFx0aWYgKGRyYWdPdmVyRWZmZWN0UG9zaXRpb24gPT09IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkFmdGVyKSB7XG5cdFx0XHRcdGlmIChmZWVkYmFja1swXSA8IHRoaXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdGZlZWRiYWNrWzBdICs9IDE7XG5cdFx0XHRcdFx0ZHJhZ092ZXJFZmZlY3RQb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGZlZWRiYWNrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHRcdFx0aXRlbS5kcm9wVGFyZ2V0ID0gdHJ1ZTtcblxuXHRcdFx0XHRpdGVtLnJvdz8uZG9tTm9kZS5jbGFzc0xpc3QuYWRkKGRyYWdPdmVyRWZmZWN0UG9zaXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBmZWVkYmFjaykge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW2luZGV4XTtcblx0XHRcdFx0XHRpdGVtLmRyb3BUYXJnZXQgPSBmYWxzZTtcblxuXHRcdFx0XHRcdGl0ZW0ucm93Py5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoZHJhZ092ZXJFZmZlY3RQb3NpdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdMZWF2ZShldmVudDogSUxpc3REcmFnRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHR0aGlzLm9uRHJhZ0xlYXZlVGltZW91dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vbkRyYWdMZWF2ZVRpbWVvdXQgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB0aGlzLmNsZWFyRHJhZ092ZXJGZWVkYmFjaygpLCAxMDAsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdGlmICh0aGlzLmN1cnJlbnREcmFnRGF0YSkge1xuXHRcdFx0dGhpcy5kbmQub25EcmFnTGVhdmU/Lih0aGlzLmN1cnJlbnREcmFnRGF0YSwgZXZlbnQuZWxlbWVudCwgZXZlbnQuaW5kZXgsIGV2ZW50LmJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRyb3AoZXZlbnQ6IElMaXN0RHJhZ0V2ZW50PFQ+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhbkRyb3ApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkcmFnRGF0YSA9IHRoaXMuY3VycmVudERyYWdEYXRhO1xuXHRcdHRoaXMudGVhcmRvd25EcmFnQW5kRHJvcFNjcm9sbFRvcEFuaW1hdGlvbigpO1xuXHRcdHRoaXMuY2xlYXJEcmFnT3ZlckZlZWRiYWNrKCk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnaW5nJyk7XG5cdFx0dGhpcy5jdXJyZW50RHJhZ0RhdGEgPSB1bmRlZmluZWQ7XG5cdFx0U3RhdGljRE5ELkN1cnJlbnREcmFnQW5kRHJvcERhdGEgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIWRyYWdEYXRhIHx8ICFldmVudC5icm93c2VyRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZXZlbnQuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZHJhZ0RhdGEudXBkYXRlKGV2ZW50LmJyb3dzZXJFdmVudC5kYXRhVHJhbnNmZXIpO1xuXHRcdHRoaXMuZG5kLmRyb3AoZHJhZ0RhdGEsIGV2ZW50LmVsZW1lbnQsIGV2ZW50LmluZGV4LCBldmVudC5zZWN0b3IsIGV2ZW50LmJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ0VuZChldmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jYW5Ecm9wID0gZmFsc2U7XG5cdFx0dGhpcy50ZWFyZG93bkRyYWdBbmREcm9wU2Nyb2xsVG9wQW5pbWF0aW9uKCk7XG5cdFx0dGhpcy5jbGVhckRyYWdPdmVyRmVlZGJhY2soKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcblx0XHR0aGlzLmN1cnJlbnREcmFnRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRTdGF0aWNETkQuQ3VycmVudERyYWdBbmREcm9wRGF0YSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuZG5kLm9uRHJhZ0VuZD8uKGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEcmFnT3ZlckZlZWRiYWNrKCk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudERyYWdGZWVkYmFjayA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tQb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmN1cnJlbnREcmFnRmVlZGJhY2tEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0Ly8gRE5EIHNjcm9sbCB0b3AgYW5pbWF0aW9uXG5cblx0cHJpdmF0ZSBzZXR1cERyYWdBbmREcm9wU2Nyb2xsVG9wQW5pbWF0aW9uKGV2ZW50OiBEcmFnRXZlbnQgfCBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZSkge1xuXHRcdFx0Y29uc3Qgdmlld1RvcCA9IGdldFRvcExlZnRPZmZzZXQodGhpcy5kb21Ob2RlKS50b3A7XG5cdFx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZSA9IGFuaW1hdGUoZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksIHRoaXMuYW5pbWF0ZURyYWdBbmREcm9wU2Nyb2xsVG9wLmJpbmQodGhpcywgdmlld1RvcCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25TdG9wRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kcmFnT3ZlckFuaW1hdGlvblN0b3BEaXNwb3NhYmxlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlKSB7XG5cdFx0XHRcdHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5kcmFnT3ZlckFuaW1hdGlvbkRpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSwgMTAwMCwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLmRyYWdPdmVyTW91c2VZID0gZXZlbnQucGFnZVk7XG5cdH1cblxuXHRwcml2YXRlIGFuaW1hdGVEcmFnQW5kRHJvcFNjcm9sbFRvcCh2aWV3VG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kcmFnT3Zlck1vdXNlWSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZiA9IHRoaXMuZHJhZ092ZXJNb3VzZVkgLSB2aWV3VG9wO1xuXHRcdGNvbnN0IHVwcGVyTGltaXQgPSB0aGlzLnJlbmRlckhlaWdodCAtIDM1O1xuXG5cdFx0aWYgKGRpZmYgPCAzNSkge1xuXHRcdFx0dGhpcy5zY3JvbGxUb3AgKz0gTWF0aC5tYXgoLTE0LCBNYXRoLmZsb29yKDAuMyAqIChkaWZmIC0gMzUpKSk7XG5cdFx0fSBlbHNlIGlmIChkaWZmID4gdXBwZXJMaW1pdCkge1xuXHRcdFx0dGhpcy5zY3JvbGxUb3AgKz0gTWF0aC5taW4oMTQsIE1hdGguZmxvb3IoMC4zICogKGRpZmYgLSB1cHBlckxpbWl0KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdGVhcmRvd25EcmFnQW5kRHJvcFNjcm9sbFRvcEFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uU3RvcERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHRoaXMuZHJhZ092ZXJBbmltYXRpb25EaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmRyYWdPdmVyQW5pbWF0aW9uRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvLyBVdGlsXG5cblx0cHJpdmF0ZSBnZXRUYXJnZXRTZWN0b3IoYnJvd3NlckV2ZW50OiBEcmFnRXZlbnQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQpOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVsYXRpdmVQb3NpdGlvbiA9IGJyb3dzZXJFdmVudC5vZmZzZXRZIC8gdGhpcy5pdGVtc1t0YXJnZXRJbmRleF0uc2l6ZTtcblx0XHRjb25zdCBzZWN0b3IgPSBNYXRoLmZsb29yKHJlbGF0aXZlUG9zaXRpb24gLyAwLjI1KTtcblx0XHRyZXR1cm4gY2xhbXAoc2VjdG9yLCAwLCAzKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SXRlbUluZGV4RnJvbUV2ZW50VGFyZ2V0KHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzY3JvbGxhYmxlRWxlbWVudCA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpO1xuXHRcdGxldCBlbGVtZW50OiBIVE1MRWxlbWVudCB8IFNWR0VsZW1lbnQgfCBudWxsID0gdGFyZ2V0IGFzIChIVE1MRWxlbWVudCB8IFNWR0VsZW1lbnQgfCBudWxsKTtcblxuXHRcdHdoaWxlICgoaXNIVE1MRWxlbWVudChlbGVtZW50KSB8fCBpc1NWR0VsZW1lbnQoZWxlbWVudCkpICYmIGVsZW1lbnQgIT09IHRoaXMucm93c0NvbnRhaW5lciAmJiBzY3JvbGxhYmxlRWxlbWVudC5jb250YWlucyhlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmF3SW5kZXggPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1pbmRleCcpO1xuXG5cdFx0XHRpZiAocmF3SW5kZXgpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBOdW1iZXIocmF3SW5kZXgpO1xuXG5cdFx0XHRcdGlmICghaXNOYU4oaW5kZXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVsZW1lbnQgPSBlbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmlzaWJsZVJhbmdlKHJlbmRlclRvcDogbnVtYmVyLCByZW5kZXJIZWlnaHQ6IG51bWJlcik6IElSYW5nZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiB0aGlzLnJhbmdlTWFwLmluZGV4QXQocmVuZGVyVG9wKSxcblx0XHRcdGVuZDogdGhpcy5yYW5nZU1hcC5pbmRleEFmdGVyKHJlbmRlclRvcCArIHJlbmRlckhlaWdodCAtIDEpXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRSZW5kZXJSYW5nZShyZW5kZXJUb3A6IG51bWJlciwgcmVuZGVySGVpZ2h0OiBudW1iZXIpOiBJUmFuZ2Uge1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5nZXRWaXNpYmxlUmFuZ2UocmVuZGVyVG9wLCByZW5kZXJIZWlnaHQpO1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTZWxlY3Rpb25Cb3VuZHMpIHtcblx0XHRcdGNvbnN0IG1heCA9IHRoaXMucmFuZ2VNYXAuY291bnQ7XG5cdFx0XHRyYW5nZS5zdGFydCA9IE1hdGgubWluKHJhbmdlLnN0YXJ0LCB0aGlzLmN1cnJlbnRTZWxlY3Rpb25Cb3VuZHMuc3RhcnQsIG1heCk7XG5cdFx0XHRyYW5nZS5lbmQgPSBNYXRoLm1pbihNYXRoLm1heChyYW5nZS5lbmQsIHRoaXMuY3VycmVudFNlbGVjdGlvbkJvdW5kcy5lbmQgKyAxKSwgbWF4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmFuZ2U7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBzdGFibGUgcmVuZGVyZWQgc3RhdGUsIGNoZWNrcyBldmVyeSByZW5kZXJlZCBlbGVtZW50IHdoZXRoZXIgaXQgbmVlZHNcblx0ICogdG8gYmUgcHJvYmVkIGZvciBkeW5hbWljIGhlaWdodC4gQWRqdXN0cyBzY3JvbGwgaGVpZ2h0IGFuZCB0b3AgaWYgbmVjZXNzYXJ5LlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZXJlbmRlcihyZW5kZXJUb3A6IG51bWJlciwgcmVuZGVySGVpZ2h0OiBudW1iZXIsIGluU21vb3RoU2Nyb2xsaW5nPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzUmVuZGVyUmFuZ2UgPSB0aGlzLmdldFJlbmRlclJhbmdlKHJlbmRlclRvcCwgcmVuZGVySGVpZ2h0KTtcblxuXHRcdC8vIExldCdzIHJlbWVtYmVyIHRoZSBzZWNvbmQgZWxlbWVudCdzIHBvc2l0aW9uLCB0aGlzIGhlbHBzIGluIHNjcm9sbGluZyB1cFxuXHRcdC8vIGFuZCBwcmVzZXJ2aW5nIGEgbGluZWFyIHVwd2FyZHMgc2Nyb2xsIG1vdmVtZW50XG5cdFx0bGV0IGFuY2hvckVsZW1lbnRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhbmNob3JFbGVtZW50VG9wRGVsdGE6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChyZW5kZXJUb3AgPT09IHRoaXMuZWxlbWVudFRvcChwcmV2aW91c1JlbmRlclJhbmdlLnN0YXJ0KSkge1xuXHRcdFx0YW5jaG9yRWxlbWVudEluZGV4ID0gcHJldmlvdXNSZW5kZXJSYW5nZS5zdGFydDtcblx0XHRcdGFuY2hvckVsZW1lbnRUb3BEZWx0YSA9IDA7XG5cdFx0fSBlbHNlIGlmIChwcmV2aW91c1JlbmRlclJhbmdlLmVuZCAtIHByZXZpb3VzUmVuZGVyUmFuZ2Uuc3RhcnQgPiAxKSB7XG5cdFx0XHRhbmNob3JFbGVtZW50SW5kZXggPSBwcmV2aW91c1JlbmRlclJhbmdlLnN0YXJ0ICsgMTtcblx0XHRcdGFuY2hvckVsZW1lbnRUb3BEZWx0YSA9IHRoaXMuZWxlbWVudFRvcChhbmNob3JFbGVtZW50SW5kZXgpIC0gcmVuZGVyVG9wO1xuXHRcdH1cblxuXHRcdGxldCBoZWlnaHREaWZmID0gMDtcblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCByZW5kZXJSYW5nZSA9IHRoaXMuZ2V0UmVuZGVyUmFuZ2UocmVuZGVyVG9wLCByZW5kZXJIZWlnaHQpO1xuXG5cdFx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRcdGZvciAobGV0IGkgPSByZW5kZXJSYW5nZS5zdGFydDsgaSA8IHJlbmRlclJhbmdlLmVuZDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSB0aGlzLnByb2JlRHluYW1pY0hlaWdodChpKTtcblxuXHRcdFx0XHRpZiAoZGlmZiAhPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMucmFuZ2VNYXAuc3BsaWNlKGksIDEsIFt0aGlzLml0ZW1zW2ldXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRoZWlnaHREaWZmICs9IGRpZmY7XG5cdFx0XHRcdGRpZENoYW5nZSA9IGRpZENoYW5nZSB8fCBkaWZmICE9PSAwO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWRpZENoYW5nZSkge1xuXHRcdFx0XHRpZiAoaGVpZ2h0RGlmZiAhPT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuZXZlbnR1YWxseVVwZGF0ZVNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVucmVuZGVyUmFuZ2VzID0gUmFuZ2UucmVsYXRpdmVDb21wbGVtZW50KHByZXZpb3VzUmVuZGVyUmFuZ2UsIHJlbmRlclJhbmdlKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHVucmVuZGVyUmFuZ2VzKSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0OyBpIDwgcmFuZ2UuZW5kOyBpKyspIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLml0ZW1zW2ldLnJvdykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW1Gcm9tRE9NKGkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlbmRlclJhbmdlcyA9IFJhbmdlLnJlbGF0aXZlQ29tcGxlbWVudChyZW5kZXJSYW5nZSwgcHJldmlvdXNSZW5kZXJSYW5nZSkucmV2ZXJzZSgpO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRlZEl0ZW1zOiBJSXRlbTxUPltdID0gW107XG5cblx0XHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiByZW5kZXJSYW5nZXMpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gcmFuZ2UuZW5kIC0gMTsgaSA+PSByYW5nZS5zdGFydDsgaS0tKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmluc2VydEl0ZW1JbkRPTShpKTtcblx0XHRcdFx0XHRcdGluc2VydGVkSXRlbXMucHVzaCh0aGlzLml0ZW1zW2ldKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nICYmIGluc2VydGVkSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMubWVhc3VyZUl0ZW1XaWR0aHMoaW5zZXJ0ZWRJdGVtcyk7XG5cdFx0XHRcdFx0dGhpcy5ldmVudHVhbGx5VXBkYXRlU2Nyb2xsV2lkdGgoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAobGV0IGkgPSByZW5kZXJSYW5nZS5zdGFydDsgaSA8IHJlbmRlclJhbmdlLmVuZDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXRlbXNbaV0ucm93KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUl0ZW1JbkRPTSh0aGlzLml0ZW1zW2ldLCBpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIGFuY2hvckVsZW1lbnRJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHQvLyBUbyBjb21wdXRlIGEgZGVzdGluYXRpb24gc2Nyb2xsIHRvcCwgd2UgbmVlZCB0byB0YWtlIGludG8gYWNjb3VudCB0aGUgY3VycmVudCBzbW9vdGggc2Nyb2xsaW5nXG5cdFx0XHRcdFx0Ly8gYW5pbWF0aW9uLCBhbmQgdGhlbiByZXVzZSBpdCB3aXRoIGEgbmV3IHRhcmdldCAodG8gYXZvaWQgcHJvbG9uZ2luZyB0aGUgc2Nyb2xsKVxuXHRcdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA0MTQ0XG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTA0Mjg0XG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDc3MDRcblx0XHRcdFx0XHRjb25zdCBkZWx0YVNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsYWJsZS5nZXRGdXR1cmVTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcCAtIHJlbmRlclRvcDtcblx0XHRcdFx0XHRjb25zdCBuZXdTY3JvbGxUb3AgPSB0aGlzLmVsZW1lbnRUb3AoYW5jaG9yRWxlbWVudEluZGV4KSAtIGFuY2hvckVsZW1lbnRUb3BEZWx0YSEgKyBkZWx0YVNjcm9sbFRvcDtcblx0XHRcdFx0XHR0aGlzLnNldFNjcm9sbFRvcChuZXdTY3JvbGxUb3AsIGluU21vb3RoU2Nyb2xsaW5nKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKHRoaXMuY29udGVudEhlaWdodCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb2JlRHluYW1pY0hlaWdodChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1tpbmRleF07XG5cdFx0cmV0dXJuIHRoaXMucHJvYmVEeW5hbWljSGVpZ2h0Rm9ySXRlbShpdGVtLCBpbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIHByb2JlRHluYW1pY0hlaWdodEZvckl0ZW0oaXRlbTogSUl0ZW08VD4sIGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmICghIXRoaXMudmlydHVhbERlbGVnYXRlLmdldER5bmFtaWNIZWlnaHQpIHtcblx0XHRcdGNvbnN0IG5ld1NpemUgPSB0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5nZXREeW5hbWljSGVpZ2h0KGl0ZW0uZWxlbWVudCk7XG5cdFx0XHRpZiAobmV3U2l6ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBzaXplID0gaXRlbS5zaXplO1xuXHRcdFx0XHRpdGVtLnNpemUgPSBuZXdTaXplO1xuXHRcdFx0XHRpdGVtLmxhc3REeW5hbWljSGVpZ2h0V2lkdGggPSB0aGlzLnJlbmRlcldpZHRoO1xuXHRcdFx0XHR0aGlzLnB1Ymxpc2hEeW5hbWljSGVpZ2h0KGl0ZW0pO1xuXHRcdFx0XHRyZXR1cm4gbmV3U2l6ZSAtIHNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpdGVtLmhhc0R5bmFtaWNIZWlnaHQgfHwgaXRlbS5sYXN0RHluYW1pY0hlaWdodFdpZHRoID09PSB0aGlzLnJlbmRlcldpZHRoKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRpZiAoISF0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5oYXNEeW5hbWljSGVpZ2h0ICYmICF0aGlzLnZpcnR1YWxEZWxlZ2F0ZS5oYXNEeW5hbWljSGVpZ2h0KGl0ZW0uZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpemUgPSBpdGVtLnNpemU7XG5cblx0XHRpZiAoaXRlbS5yb3cpIHtcblx0XHRcdGl0ZW0ucm93LmRvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHRpdGVtLnNpemUgPSBpdGVtLnJvdy5kb21Ob2RlLm9mZnNldEhlaWdodDtcblx0XHRcdGlmIChpdGVtLnNpemUgPT09IDApIHtcblx0XHRcdFx0aWYgKCFpc0FuY2VzdG9yKGl0ZW0ucm93LmRvbU5vZGUsIGdldFdpbmRvdyhpdGVtLnJvdy5kb21Ob2RlKS5kb2N1bWVudC5ib2R5KSkge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybignTWVhc3VyaW5nIGl0ZW0gbm9kZSB0aGF0IGlzIG5vdCBpbiBET00hIEFkZCBMaXN0VmlldyB0byB0aGUgRE9NIGJlZm9yZSBtZWFzdXJpbmcgcm93IGhlaWdodCEnLCBuZXcgRXJyb3IoKS5zdGFjayk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdNZWFzdXJlZCBpdGVtIG5vZGUgYXQgMHB4LSBlbnN1cmUgdGhhdCBMaXN0VmlldyBpcyBub3QgZGlzcGxheTpub25lIGJlZm9yZSBtZWFzdXJpbmcgcm93IGhlaWdodCEnLCBuZXcgRXJyb3IoKS5zdGFjayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGl0ZW0ubGFzdER5bmFtaWNIZWlnaHRXaWR0aCA9IHRoaXMucmVuZGVyV2lkdGg7XG5cdFx0XHR0aGlzLnB1Ymxpc2hEeW5hbWljSGVpZ2h0KGl0ZW0pO1xuXHRcdFx0cmV0dXJuIGl0ZW0uc2l6ZSAtIHNpemU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByb3cgfSA9IHRoaXMuY2FjaGUuYWxsb2MoaXRlbS50ZW1wbGF0ZUlkKTtcblx0XHRyb3cuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHR0aGlzLnJvd3NDb250YWluZXIuYXBwZW5kQ2hpbGQocm93LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnJlbmRlcmVycy5nZXQoaXRlbS50ZW1wbGF0ZUlkKTtcblxuXHRcdGlmICghcmVuZGVyZXIpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ01pc3NpbmcgcmVuZGVyZXIgZm9yIHRlbXBsYXRlSWQ6ICcgKyBpdGVtLnRlbXBsYXRlSWQpO1xuXHRcdH1cblxuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQoaXRlbS5lbGVtZW50LCBpbmRleCwgcm93LnRlbXBsYXRlRGF0YSk7XG5cdFx0aXRlbS5zaXplID0gcm93LmRvbU5vZGUub2Zmc2V0SGVpZ2h0O1xuXHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50Py4oaXRlbS5lbGVtZW50LCBpbmRleCwgcm93LnRlbXBsYXRlRGF0YSk7XG5cblx0XHRpdGVtLmxhc3REeW5hbWljSGVpZ2h0V2lkdGggPSB0aGlzLnJlbmRlcldpZHRoO1xuXHRcdHRoaXMucHVibGlzaER5bmFtaWNIZWlnaHQoaXRlbSk7XG5cdFx0cm93LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0dGhpcy5jYWNoZS5yZWxlYXNlKHJvdyk7XG5cblx0XHRyZXR1cm4gaXRlbS5zaXplIC0gc2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgcHVibGlzaER5bmFtaWNIZWlnaHQoaXRlbTogSUl0ZW08VD4pOiB2b2lkIHtcblx0XHRpZiAoaXRlbS5zaXplID4gMCkge1xuXHRcdFx0dGhpcy52aXJ0dWFsRGVsZWdhdGUuc2V0RHluYW1pY0hlaWdodD8uKGl0ZW0uZWxlbWVudCwgaXRlbS5zaXplKTtcblx0XHR9XG5cdH1cblxuXHRnZXRFbGVtZW50RG9tSWQoaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuZG9tSWR9XyR7aW5kZXh9YDtcblx0fVxuXG5cdC8vIERpc3Bvc2VcblxuXHRkaXNwb3NlKCkge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLml0ZW1zKSB7XG5cdFx0XHRpdGVtLmRyYWdTdGFydERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0aXRlbS5jaGVja2VkRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRcdGlmIChpdGVtLnJvdykge1xuXHRcdFx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMucmVuZGVyZXJzLmdldChpdGVtLnJvdy50ZW1wbGF0ZUlkKTtcblx0XHRcdFx0aWYgKHJlbmRlcmVyKSB7XG5cdFx0XHRcdFx0cmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQ/LihpdGVtLmVsZW1lbnQsIC0xLCBpdGVtLnJvdy50ZW1wbGF0ZURhdGEsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKGl0ZW0ucm93LnRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLml0ZW1zID0gW107XG5cblx0XHR0aGlzLmRvbU5vZGU/LnJlbW92ZSgpO1xuXG5cdFx0dGhpcy5kcmFnT3ZlckFuaW1hdGlvbkRpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXVDO0FBQ2hELFNBQVMsdUJBQXVCLFNBQW9CLGtCQUFrQixrQkFBa0IsaUJBQWlCLGFBQWEsa0JBQWtCLFdBQVcsWUFBWSxlQUFlLGNBQWMsb0NBQW9DO0FBQ2hPLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsYUFBYSxnQkFBZ0IsZUFBNkI7QUFDbkUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxVQUFVLFFBQVEsY0FBYztBQUN6QyxTQUFTLFNBQVMseUJBQXlCO0FBQzNDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBb0M7QUFDdEQsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBaUIsYUFBYTtBQUM5QixTQUErQixZQUFZLDJCQUF3QztBQUVuRixTQUFxSSw0QkFBNEIsOEJBQThCO0FBQy9MLFNBQW9CLFVBQVUsYUFBYTtBQUMzQyxTQUFlLGdCQUFnQjtBQUMvQixTQUFTLDBCQUEwQjtBQUduQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFrQi9CLE1BQU0sWUFBWTtBQUFBLEVBQ2pCLHdCQUF3QjtBQUN6QjtBQU1PLElBQVcsdUJBQVgsa0JBQVdBLDBCQUFYO0FBRU4sRUFBQUEsNENBQUEsU0FBTSxLQUFOO0FBQ0EsRUFBQUEsNENBQUEsZ0JBQWEsS0FBYjtBQUNBLEVBQUFBLDRDQUFBLG1CQUFnQixLQUFoQjtBQUNBLEVBQUFBLDRDQUFBLFlBQVMsS0FBVDtBQUxpQixTQUFBQTtBQUFBLEdBQUE7QUEyQ2xCLE1BQU0saUJBQWlCO0FBQUEsRUFD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MUI7QUFDRDtBQS82Q2EsVUFFRyxnQkFBZ0I7QUFpMUJsQjtBQUFBLEVBQVo7QUFBQSxHQW4xQlcsVUFtMUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0FwMUJXLFVBbzFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBcjFCVyxVQXExQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQXQxQlcsVUFzMUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0F2MUJXLFVBdTFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBeDFCVyxVQXcxQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQXoxQlcsVUF5MUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0ExMUJXLFVBMDFCQztBQUNBO0FBQUEsRUFBWjtBQUFBLEdBMzFCVyxVQTIxQkM7QUFDQTtBQUFBLEVBQVo7QUFBQSxHQTUxQlcsVUE0MUJDO0FBQ0E7QUFBQSxFQUFaO0FBQUEsR0E3MUJXLFVBNjFCQztBQTcxQlAsSUFBTSxXQUFOOyIsCiAgIm5hbWVzIjogWyJMaXN0Vmlld1RhcmdldFNlY3RvciIsICJlIiwgInNpemUiXQp9Cg==
