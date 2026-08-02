import { $, addDisposableListener, append, getWindow, scheduleAtNextAnimationFrame } from "../../dom.js";
import { DomEmitter } from "../../event.js";
import { Orientation, Sash, SashState } from "../sash/sash.js";
import { SmoothScrollableElement } from "../scrollbar/scrollableElement.js";
import { pushToEnd, pushToStart, range } from "../../../common/arrays.js";
import { Color } from "../../../common/color.js";
import { Emitter, Event } from "../../../common/event.js";
import { combinedDisposable, Disposable, dispose, toDisposable } from "../../../common/lifecycle.js";
import { clamp } from "../../../common/numbers.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import * as types from "../../../common/types.js";
import "./splitview.css";
import { Orientation as Orientation2 } from "../sash/sash.js";
const defaultStyles = {
  separatorBorder: Color.transparent
};
var LayoutPriority = /* @__PURE__ */ ((LayoutPriority2) => {
  LayoutPriority2[LayoutPriority2["Normal"] = 0] = "Normal";
  LayoutPriority2[LayoutPriority2["Low"] = 1] = "Low";
  LayoutPriority2[LayoutPriority2["High"] = 2] = "High";
  return LayoutPriority2;
})(LayoutPriority || {});
class ViewItem {
  constructor(container, view, size, disposable) {
    this.container = container;
    this.view = view;
    this.disposable = disposable;
    this._cachedVisibleSize = void 0;
    if (typeof size === "number") {
      this._size = size;
      this._cachedVisibleSize = void 0;
      container.classList.add("visible");
    } else {
      this._size = 0;
      this._cachedVisibleSize = size.cachedVisibleSize;
    }
  }
  set size(size) {
    this._size = size;
  }
  get size() {
    return this._size;
  }
  get cachedVisibleSize() {
    return this._cachedVisibleSize;
  }
  get visible() {
    return typeof this._cachedVisibleSize === "undefined";
  }
  setVisible(visible, size) {
    if (visible === this.visible) {
      return;
    }
    if (visible) {
      this.size = clamp(this._cachedVisibleSize, this.viewMinimumSize, this.viewMaximumSize);
      this._cachedVisibleSize = void 0;
    } else {
      this._cachedVisibleSize = typeof size === "number" ? size : this.size;
      this.size = 0;
    }
    this.container.classList.toggle("visible", visible);
    try {
      this.view.setVisible?.(visible);
    } catch (e) {
      console.error("Splitview: Failed to set visible view");
      console.error(e);
    }
  }
  get minimumSize() {
    return this.visible ? this.view.minimumSize : 0;
  }
  get viewMinimumSize() {
    return this.view.minimumSize;
  }
  get maximumSize() {
    return this.visible ? this.view.maximumSize : 0;
  }
  get viewMaximumSize() {
    return this.view.maximumSize;
  }
  get priority() {
    return this.view.priority;
  }
  get proportionalLayout() {
    return this.view.proportionalLayout ?? true;
  }
  get snap() {
    return !!this.view.snap;
  }
  set enabled(enabled) {
    this.container.style.pointerEvents = enabled ? "" : "none";
  }
  layout(offset, layoutContext) {
    this.layoutContainer(offset);
    try {
      this.view.layout(this.size, offset, layoutContext);
    } catch (e) {
      console.error("Splitview: Failed to layout view");
      console.error(e);
    }
  }
  dispose() {
    this.disposable.dispose();
  }
}
class VerticalViewItem extends ViewItem {
  layoutContainer(offset) {
    this.container.style.top = `${offset}px`;
    this.container.style.height = `${this.size}px`;
  }
}
class HorizontalViewItem extends ViewItem {
  layoutContainer(offset) {
    this.container.style.left = `${offset}px`;
    this.container.style.width = `${this.size}px`;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Idle"] = 0] = "Idle";
  State2[State2["Busy"] = 1] = "Busy";
  return State2;
})(State || {});
var Sizing;
((Sizing2) => {
  Sizing2.Distribute = { type: "distribute" };
  function Split(index) {
    return { type: "split", index };
  }
  Sizing2.Split = Split;
  function Auto(index) {
    return { type: "auto", index };
  }
  Sizing2.Auto = Auto;
  function Invisible(cachedVisibleSize) {
    return { type: "invisible", cachedVisibleSize };
  }
  Sizing2.Invisible = Invisible;
})(Sizing || (Sizing = {}));
class SplitView extends Disposable {
  /**
   * Create a new {@link SplitView} instance.
   */
  constructor(container, options = {}) {
    super();
    this.size = 0;
    this._contentSize = 0;
    this.proportions = void 0;
    this.viewItems = [];
    this.sashItems = [];
    this.state = 0 /* Idle */;
    this._onDidSashChange = this._register(new Emitter());
    this._onDidSashReset = this._register(new Emitter());
    this._startSnappingEnabled = true;
    this._endSnappingEnabled = true;
    /**
     * Fires whenever the user resizes a {@link Sash sash}.
     */
    this.onDidSashChange = this._onDidSashChange.event;
    /**
     * Fires whenever the user double clicks a {@link Sash sash}.
     */
    this.onDidSashReset = this._onDidSashReset.event;
    this.orientation = options.orientation ?? Orientation.VERTICAL;
    this.inverseAltBehavior = options.inverseAltBehavior ?? false;
    this.proportionalLayout = options.proportionalLayout ?? true;
    this.getSashOrthogonalSize = options.getSashOrthogonalSize;
    this.el = document.createElement("div");
    this.el.classList.add("monaco-split-view2");
    this.el.classList.add(this.orientation === Orientation.VERTICAL ? "vertical" : "horizontal");
    container.appendChild(this.el);
    this.sashContainer = append(this.el, $(".sash-container"));
    this.viewContainer = $(".split-view-container");
    this.scrollable = this._register(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 125,
      scheduleAtNextAnimationFrame: (callback) => scheduleAtNextAnimationFrame(getWindow(this.el), callback)
    }));
    this.scrollableElement = this._register(new SmoothScrollableElement(this.viewContainer, {
      vertical: this.orientation === Orientation.VERTICAL ? options.scrollbarVisibility ?? ScrollbarVisibility.Auto : ScrollbarVisibility.Hidden,
      horizontal: this.orientation === Orientation.HORIZONTAL ? options.scrollbarVisibility ?? ScrollbarVisibility.Auto : ScrollbarVisibility.Hidden
    }, this.scrollable));
    const onDidScrollViewContainer = this._register(new DomEmitter(this.viewContainer, "scroll")).event;
    this._register(onDidScrollViewContainer((_) => {
      const position = this.scrollableElement.getScrollPosition();
      const scrollLeft = Math.abs(this.viewContainer.scrollLeft - position.scrollLeft) <= 1 ? void 0 : this.viewContainer.scrollLeft;
      const scrollTop = Math.abs(this.viewContainer.scrollTop - position.scrollTop) <= 1 ? void 0 : this.viewContainer.scrollTop;
      if (scrollLeft !== void 0 || scrollTop !== void 0) {
        this.scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
      }
    }));
    this.onDidScroll = this.scrollableElement.onScroll;
    this._register(this.onDidScroll((e) => {
      if (e.scrollTopChanged) {
        this.viewContainer.scrollTop = e.scrollTop;
      }
      if (e.scrollLeftChanged) {
        this.viewContainer.scrollLeft = e.scrollLeft;
      }
    }));
    append(this.el, this.scrollableElement.getDomNode());
    this.style(options.styles || defaultStyles);
    if (options.descriptor) {
      this.size = options.descriptor.size;
      options.descriptor.views.forEach((viewDescriptor, index) => {
        const sizing = types.isUndefined(viewDescriptor.visible) || viewDescriptor.visible ? viewDescriptor.size : { type: "invisible", cachedVisibleSize: viewDescriptor.size };
        const view = viewDescriptor.view;
        this.doAddView(view, sizing, index, true);
      });
      this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
      this.saveProportions();
    }
  }
  /**
   * The sum of all views' sizes.
   */
  get contentSize() {
    return this._contentSize;
  }
  /**
   * The amount of views in this {@link SplitView}.
   */
  get length() {
    return this.viewItems.length;
  }
  /**
   * The minimum size of this {@link SplitView}.
   */
  get minimumSize() {
    return this.viewItems.reduce((r, item) => r + item.minimumSize, 0);
  }
  /**
   * The maximum size of this {@link SplitView}.
   */
  get maximumSize() {
    return this.length === 0 ? Number.POSITIVE_INFINITY : this.viewItems.reduce((r, item) => r + item.maximumSize, 0);
  }
  get orthogonalStartSash() {
    return this._orthogonalStartSash;
  }
  get orthogonalEndSash() {
    return this._orthogonalEndSash;
  }
  get startSnappingEnabled() {
    return this._startSnappingEnabled;
  }
  get endSnappingEnabled() {
    return this._endSnappingEnabled;
  }
  /**
   * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
   * located at the left- or top-most side of the SplitView.
   * Corner sashes will be created automatically at the intersections.
   */
  set orthogonalStartSash(sash) {
    for (const sashItem of this.sashItems) {
      sashItem.sash.orthogonalStartSash = sash;
    }
    this._orthogonalStartSash = sash;
  }
  /**
   * A reference to a sash, perpendicular to all sashes in this {@link SplitView},
   * located at the right- or bottom-most side of the SplitView.
   * Corner sashes will be created automatically at the intersections.
   */
  set orthogonalEndSash(sash) {
    for (const sashItem of this.sashItems) {
      sashItem.sash.orthogonalEndSash = sash;
    }
    this._orthogonalEndSash = sash;
  }
  /**
   * The internal sashes within this {@link SplitView}.
   */
  get sashes() {
    return this.sashItems.map((s) => s.sash);
  }
  /**
   * Enable/disable snapping at the beginning of this {@link SplitView}.
   */
  set startSnappingEnabled(startSnappingEnabled) {
    if (this._startSnappingEnabled === startSnappingEnabled) {
      return;
    }
    this._startSnappingEnabled = startSnappingEnabled;
    this.updateSashEnablement();
  }
  /**
   * Enable/disable snapping at the end of this {@link SplitView}.
   */
  set endSnappingEnabled(endSnappingEnabled) {
    if (this._endSnappingEnabled === endSnappingEnabled) {
      return;
    }
    this._endSnappingEnabled = endSnappingEnabled;
    this.updateSashEnablement();
  }
  style(styles) {
    if (styles.separatorBorder.isTransparent()) {
      this.el.classList.remove("separator-border");
      this.el.style.removeProperty("--separator-border");
    } else {
      this.el.classList.add("separator-border");
      this.el.style.setProperty("--separator-border", styles.separatorBorder.toString());
    }
  }
  /**
   * Add a {@link IView view} to this {@link SplitView}.
   *
   * @param view The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param index The index to insert the view on.
   * @param skipLayout Whether layout should be skipped.
   */
  addView(view, size, index = this.viewItems.length, skipLayout) {
    this.doAddView(view, size, index, skipLayout);
  }
  /**
   * Remove a {@link IView view} from this {@link SplitView}.
   *
   * @param index The index where the {@link IView view} is located.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(index, sizing) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      if (sizing?.type === "auto") {
        if (this.areViewsDistributed()) {
          sizing = { type: "distribute" };
        } else {
          sizing = { type: "split", index: sizing.index };
        }
      }
      const referenceViewItem = sizing?.type === "split" ? this.viewItems[sizing.index] : void 0;
      const viewItemToRemove = this.viewItems.splice(index, 1)[0];
      if (referenceViewItem) {
        referenceViewItem.size += viewItemToRemove.size;
      }
      if (this.viewItems.length >= 1) {
        const sashIndex = Math.max(index - 1, 0);
        const sashItem = this.sashItems.splice(sashIndex, 1)[0];
        sashItem.disposable.dispose();
      }
      this.relayout();
      if (sizing?.type === "distribute") {
        this.distributeViewSizes();
      }
      const result = viewItemToRemove.view;
      viewItemToRemove.dispose();
      return result;
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  removeAllViews() {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const viewItems = this.viewItems.splice(0, this.viewItems.length);
      for (const viewItem of viewItems) {
        viewItem.dispose();
      }
      const sashItems = this.sashItems.splice(0, this.sashItems.length);
      for (const sashItem of sashItems) {
        sashItem.disposable.dispose();
      }
      this.relayout();
      return viewItems.map((i) => i.view);
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  /**
   * Move a {@link IView view} to a different index.
   *
   * @param from The source index.
   * @param to The target index.
   */
  moveView(from, to) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    const cachedVisibleSize = this.getViewCachedVisibleSize(from);
    const sizing = typeof cachedVisibleSize === "undefined" ? this.getViewSize(from) : Sizing.Invisible(cachedVisibleSize);
    const view = this.removeView(from);
    this.addView(view, sizing, to);
  }
  /**
   * Swap two {@link IView views}.
   *
   * @param from The source index.
   * @param to The target index.
   */
  swapViews(from, to) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    if (from > to) {
      return this.swapViews(to, from);
    }
    const fromSize = this.getViewSize(from);
    const toSize = this.getViewSize(to);
    const toView = this.removeView(to);
    const fromView = this.removeView(from);
    this.addView(toView, fromSize, from);
    this.addView(fromView, toSize, to);
  }
  /**
   * Returns whether the {@link IView view} is visible.
   *
   * @param index The {@link IView view} index.
   */
  isViewVisible(index) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    return viewItem.visible;
  }
  /**
   * Set a {@link IView view}'s visibility.
   *
   * @param index The {@link IView view} index.
   * @param visible Whether the {@link IView view} should be visible.
   */
  setViewVisible(index, visible) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    viewItem.setVisible(visible);
    this.distributeEmptySpace(index);
    this.layoutViews();
    this.saveProportions();
  }
  /**
   * Returns the {@link IView view}'s size previously to being hidden.
   *
   * @param index The {@link IView view} index.
   */
  getViewCachedVisibleSize(index) {
    if (index < 0 || index >= this.viewItems.length) {
      throw new Error("Index out of bounds");
    }
    const viewItem = this.viewItems[index];
    return viewItem.cachedVisibleSize;
  }
  /**
   * Layout the {@link SplitView}.
   *
   * @param size The entire size of the {@link SplitView}.
   * @param layoutContext An optional layout context to pass along to {@link IView views}.
   */
  layout(size, layoutContext) {
    const previousSize = Math.max(this.size, this._contentSize);
    this.size = size;
    this.layoutContext = layoutContext;
    if (!this.proportions) {
      const indexes = range(this.viewItems.length);
      const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
      const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
      this.resize(this.viewItems.length - 1, size - previousSize, void 0, lowPriorityIndexes, highPriorityIndexes);
    } else {
      let total = 0;
      for (let i = 0; i < this.viewItems.length; i++) {
        const item = this.viewItems[i];
        const proportion = this.proportions[i];
        if (typeof proportion === "number") {
          total += proportion;
        } else {
          size -= item.size;
        }
      }
      for (let i = 0; i < this.viewItems.length; i++) {
        const item = this.viewItems[i];
        const proportion = this.proportions[i];
        if (typeof proportion === "number" && total > 0) {
          item.size = clamp(Math.round(proportion * size / total), item.minimumSize, item.maximumSize);
        }
      }
    }
    this.distributeEmptySpace();
    this.layoutViews();
  }
  saveProportions() {
    if (this.proportionalLayout && this._contentSize > 0) {
      this.proportions = this.viewItems.map((v) => v.proportionalLayout && v.visible ? v.size / this._contentSize : void 0);
    }
  }
  onSashStart({ sash, start, alt }) {
    for (const item of this.viewItems) {
      item.enabled = false;
    }
    const index = this.sashItems.findIndex((item) => item.sash === sash);
    const disposable = combinedDisposable(
      addDisposableListener(this.el.ownerDocument.body, "keydown", (e) => resetSashDragState(this.sashDragState.current, e.altKey)),
      addDisposableListener(this.el.ownerDocument.body, "keyup", () => resetSashDragState(this.sashDragState.current, false))
    );
    const resetSashDragState = (start2, alt2) => {
      const sizes = this.viewItems.map((i) => i.size);
      let minDelta = Number.NEGATIVE_INFINITY;
      let maxDelta = Number.POSITIVE_INFINITY;
      if (this.inverseAltBehavior) {
        alt2 = !alt2;
      }
      if (alt2) {
        const isLastSash = index === this.sashItems.length - 1;
        if (isLastSash) {
          const viewItem = this.viewItems[index];
          minDelta = (viewItem.minimumSize - viewItem.size) / 2;
          maxDelta = (viewItem.maximumSize - viewItem.size) / 2;
        } else {
          const viewItem = this.viewItems[index + 1];
          minDelta = (viewItem.size - viewItem.maximumSize) / 2;
          maxDelta = (viewItem.size - viewItem.minimumSize) / 2;
        }
      }
      let snapBefore;
      let snapAfter;
      if (!alt2) {
        const upIndexes = range(index, -1);
        const downIndexes = range(index + 1, this.viewItems.length);
        const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
        const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].viewMaximumSize - sizes[i]), 0);
        const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
        const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].viewMaximumSize), 0);
        const minDelta2 = Math.max(minDeltaUp, minDeltaDown);
        const maxDelta2 = Math.min(maxDeltaDown, maxDeltaUp);
        const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
        const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
        if (typeof snapBeforeIndex === "number") {
          const viewItem = this.viewItems[snapBeforeIndex];
          const halfSize = Math.floor(viewItem.viewMinimumSize / 2);
          snapBefore = {
            index: snapBeforeIndex,
            limitDelta: viewItem.visible ? minDelta2 - halfSize : minDelta2 + halfSize,
            size: viewItem.size
          };
        }
        if (typeof snapAfterIndex === "number") {
          const viewItem = this.viewItems[snapAfterIndex];
          const halfSize = Math.floor(viewItem.viewMinimumSize / 2);
          snapAfter = {
            index: snapAfterIndex,
            limitDelta: viewItem.visible ? maxDelta2 + halfSize : maxDelta2 - halfSize,
            size: viewItem.size
          };
        }
      }
      this.sashDragState = { start: start2, current: start2, index, sizes, minDelta, maxDelta, alt: alt2, snapBefore, snapAfter, disposable };
    };
    resetSashDragState(start, alt);
  }
  onSashChange({ current }) {
    const { index, start, sizes, alt, minDelta, maxDelta, snapBefore, snapAfter } = this.sashDragState;
    this.sashDragState.current = current;
    const delta = current - start;
    const newDelta = this.resize(index, delta, sizes, void 0, void 0, minDelta, maxDelta, snapBefore, snapAfter);
    if (alt) {
      const isLastSash = index === this.sashItems.length - 1;
      const newSizes = this.viewItems.map((i) => i.size);
      const viewItemIndex = isLastSash ? index : index + 1;
      const viewItem = this.viewItems[viewItemIndex];
      const newMinDelta = viewItem.size - viewItem.maximumSize;
      const newMaxDelta = viewItem.size - viewItem.minimumSize;
      const resizeIndex = isLastSash ? index - 1 : index + 1;
      this.resize(resizeIndex, -newDelta, newSizes, void 0, void 0, newMinDelta, newMaxDelta);
    }
    this.distributeEmptySpace();
    this.layoutViews();
  }
  onSashEnd(index) {
    this._onDidSashChange.fire(index);
    this.sashDragState.disposable.dispose();
    this.saveProportions();
    for (const item of this.viewItems) {
      item.enabled = true;
    }
  }
  onViewChange(item, size) {
    const index = this.viewItems.indexOf(item);
    if (index < 0 || index >= this.viewItems.length) {
      return;
    }
    size = typeof size === "number" ? size : item.size;
    size = clamp(size, item.minimumSize, item.maximumSize);
    if (this.inverseAltBehavior && index > 0) {
      this.resize(index - 1, Math.floor((item.size - size) / 2));
      this.distributeEmptySpace();
      this.layoutViews();
    } else {
      item.size = size;
      this.relayout([index], void 0);
    }
  }
  /**
   * Resize a {@link IView view} within the {@link SplitView}.
   *
   * @param index The {@link IView view} index.
   * @param size The {@link IView view} size.
   */
  resizeView(index, size) {
    if (index < 0 || index >= this.viewItems.length) {
      return;
    }
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const indexes = range(this.viewItems.length).filter((i) => i !== index);
      const lowPriorityIndexes = [...indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */), index];
      const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
      const item = this.viewItems[index];
      size = Math.round(size);
      size = clamp(size, item.minimumSize, Math.min(item.maximumSize, this.size));
      item.size = size;
      this.relayout(lowPriorityIndexes, highPriorityIndexes);
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   */
  isViewExpanded(index) {
    if (index < 0 || index >= this.viewItems.length) {
      return false;
    }
    for (const item of this.viewItems) {
      if (item !== this.viewItems[index] && item.size > item.minimumSize) {
        return false;
      }
    }
    return true;
  }
  /**
   * Distribute the entire {@link SplitView} size among all {@link IView views}.
   */
  distributeViewSizes() {
    const flexibleViewItems = [];
    let flexibleSize = 0;
    for (const item of this.viewItems) {
      if (item.maximumSize - item.minimumSize > 0) {
        flexibleViewItems.push(item);
        flexibleSize += item.size;
      }
    }
    const size = Math.floor(flexibleSize / flexibleViewItems.length);
    for (const item of flexibleViewItems) {
      item.size = clamp(size, item.minimumSize, item.maximumSize);
    }
    const indexes = range(this.viewItems.length);
    const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
    const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
    this.relayout(lowPriorityIndexes, highPriorityIndexes);
  }
  /**
   * Returns the size of a {@link IView view}.
   */
  getViewSize(index) {
    if (index < 0 || index >= this.viewItems.length) {
      return -1;
    }
    return this.viewItems[index].size;
  }
  doAddView(view, size, index = this.viewItems.length, skipLayout) {
    if (this.state !== 0 /* Idle */) {
      throw new Error("Cant modify splitview");
    }
    this.state = 1 /* Busy */;
    try {
      const container = $(".split-view-view");
      if (index === this.viewItems.length) {
        this.viewContainer.appendChild(container);
      } else {
        this.viewContainer.insertBefore(container, this.viewContainer.children.item(index));
      }
      const onChangeDisposable = view.onDidChange((size2) => this.onViewChange(item, size2));
      const containerDisposable = toDisposable(() => container.remove());
      const disposable = combinedDisposable(onChangeDisposable, containerDisposable);
      let viewSize;
      if (typeof size === "number") {
        viewSize = size;
      } else {
        if (size.type === "auto") {
          if (this.areViewsDistributed()) {
            size = { type: "distribute" };
          } else {
            size = { type: "split", index: size.index };
          }
        }
        if (size.type === "split") {
          viewSize = this.getViewSize(size.index) / 2;
        } else if (size.type === "invisible") {
          viewSize = { cachedVisibleSize: size.cachedVisibleSize };
        } else {
          viewSize = view.minimumSize;
        }
      }
      const item = this.orientation === Orientation.VERTICAL ? new VerticalViewItem(container, view, viewSize, disposable) : new HorizontalViewItem(container, view, viewSize, disposable);
      this.viewItems.splice(index, 0, item);
      if (this.viewItems.length > 1) {
        const opts = { orthogonalStartSash: this.orthogonalStartSash, orthogonalEndSash: this.orthogonalEndSash };
        const sash = this.orientation === Orientation.VERTICAL ? new Sash(this.sashContainer, { getHorizontalSashTop: (s) => this.getSashPosition(s), getHorizontalSashWidth: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.HORIZONTAL }) : new Sash(this.sashContainer, { getVerticalSashLeft: (s) => this.getSashPosition(s), getVerticalSashHeight: this.getSashOrthogonalSize }, { ...opts, orientation: Orientation.VERTICAL });
        const sashEventMapper = this.orientation === Orientation.VERTICAL ? (e) => ({ sash, start: e.startY, current: e.currentY, alt: e.altKey }) : (e) => ({ sash, start: e.startX, current: e.currentX, alt: e.altKey });
        const onStart = Event.map(sash.onDidStart, sashEventMapper);
        const onStartDisposable = onStart(this.onSashStart, this);
        const onChange = Event.map(sash.onDidChange, sashEventMapper);
        const onChangeDisposable2 = onChange(this.onSashChange, this);
        const onEnd = Event.map(sash.onDidEnd, () => this.sashItems.findIndex((item2) => item2.sash === sash));
        const onEndDisposable = onEnd(this.onSashEnd, this);
        const onDidResetDisposable = sash.onDidReset(() => {
          const index2 = this.sashItems.findIndex((item2) => item2.sash === sash);
          const upIndexes = range(index2, -1);
          const downIndexes = range(index2 + 1, this.viewItems.length);
          const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
          const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
          if (typeof snapBeforeIndex === "number" && !this.viewItems[snapBeforeIndex].visible) {
            return;
          }
          if (typeof snapAfterIndex === "number" && !this.viewItems[snapAfterIndex].visible) {
            return;
          }
          this._onDidSashReset.fire(index2);
        });
        const disposable2 = combinedDisposable(onStartDisposable, onChangeDisposable2, onEndDisposable, onDidResetDisposable, sash);
        const sashItem = { sash, disposable: disposable2 };
        this.sashItems.splice(index - 1, 0, sashItem);
      }
      container.appendChild(view.element);
      let highPriorityIndexes;
      if (typeof size !== "number" && size.type === "split") {
        highPriorityIndexes = [size.index];
      }
      if (!skipLayout) {
        this.relayout([index], highPriorityIndexes);
      }
      if (!skipLayout && typeof size !== "number" && size.type === "distribute") {
        this.distributeViewSizes();
      }
    } finally {
      this.state = 0 /* Idle */;
    }
  }
  relayout(lowPriorityIndexes, highPriorityIndexes) {
    const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    this.resize(this.viewItems.length - 1, this.size - contentSize, void 0, lowPriorityIndexes, highPriorityIndexes);
    this.distributeEmptySpace();
    this.layoutViews();
    this.saveProportions();
  }
  resize(index, delta, sizes = this.viewItems.map((i) => i.size), lowPriorityIndexes, highPriorityIndexes, overloadMinDelta = Number.NEGATIVE_INFINITY, overloadMaxDelta = Number.POSITIVE_INFINITY, snapBefore, snapAfter) {
    if (index < 0 || index >= this.viewItems.length) {
      return 0;
    }
    const upIndexes = range(index, -1);
    const downIndexes = range(index + 1, this.viewItems.length);
    if (highPriorityIndexes) {
      for (const index2 of highPriorityIndexes) {
        pushToStart(upIndexes, index2);
        pushToStart(downIndexes, index2);
      }
    }
    if (lowPriorityIndexes) {
      for (const index2 of lowPriorityIndexes) {
        pushToEnd(upIndexes, index2);
        pushToEnd(downIndexes, index2);
      }
    }
    const upItems = upIndexes.map((i) => this.viewItems[i]);
    const upSizes = upIndexes.map((i) => sizes[i]);
    const downItems = downIndexes.map((i) => this.viewItems[i]);
    const downSizes = downIndexes.map((i) => sizes[i]);
    const minDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].minimumSize - sizes[i]), 0);
    const maxDeltaUp = upIndexes.reduce((r, i) => r + (this.viewItems[i].maximumSize - sizes[i]), 0);
    const maxDeltaDown = downIndexes.length === 0 ? Number.POSITIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].minimumSize), 0);
    const minDeltaDown = downIndexes.length === 0 ? Number.NEGATIVE_INFINITY : downIndexes.reduce((r, i) => r + (sizes[i] - this.viewItems[i].maximumSize), 0);
    const minDelta = Math.max(minDeltaUp, minDeltaDown, overloadMinDelta);
    const maxDelta = Math.min(maxDeltaDown, maxDeltaUp, overloadMaxDelta);
    let snapped = false;
    if (snapBefore) {
      const snapView = this.viewItems[snapBefore.index];
      const visible = delta >= snapBefore.limitDelta;
      snapped = visible !== snapView.visible;
      snapView.setVisible(visible, snapBefore.size);
    }
    if (!snapped && snapAfter) {
      const snapView = this.viewItems[snapAfter.index];
      const visible = delta < snapAfter.limitDelta;
      snapped = visible !== snapView.visible;
      snapView.setVisible(visible, snapAfter.size);
    }
    if (snapped) {
      return this.resize(index, delta, sizes, lowPriorityIndexes, highPriorityIndexes, overloadMinDelta, overloadMaxDelta);
    }
    delta = clamp(delta, minDelta, maxDelta);
    for (let i = 0, deltaUp = delta; i < upItems.length; i++) {
      const item = upItems[i];
      const size = clamp(upSizes[i] + deltaUp, item.minimumSize, item.maximumSize);
      const viewDelta = size - upSizes[i];
      deltaUp -= viewDelta;
      item.size = size;
    }
    for (let i = 0, deltaDown = delta; i < downItems.length; i++) {
      const item = downItems[i];
      const size = clamp(downSizes[i] - deltaDown, item.minimumSize, item.maximumSize);
      const viewDelta = size - downSizes[i];
      deltaDown += viewDelta;
      item.size = size;
    }
    return delta;
  }
  distributeEmptySpace(lowPriorityIndex) {
    const contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    let emptyDelta = this.size - contentSize;
    const indexes = range(this.viewItems.length - 1, -1);
    const lowPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 1 /* Low */);
    const highPriorityIndexes = indexes.filter((i) => this.viewItems[i].priority === 2 /* High */);
    for (const index of highPriorityIndexes) {
      pushToStart(indexes, index);
    }
    for (const index of lowPriorityIndexes) {
      pushToEnd(indexes, index);
    }
    if (typeof lowPriorityIndex === "number") {
      pushToEnd(indexes, lowPriorityIndex);
    }
    for (let i = 0; emptyDelta !== 0 && i < indexes.length; i++) {
      const item = this.viewItems[indexes[i]];
      const size = clamp(item.size + emptyDelta, item.minimumSize, item.maximumSize);
      const viewDelta = size - item.size;
      emptyDelta -= viewDelta;
      item.size = size;
    }
  }
  layoutViews() {
    this._contentSize = this.viewItems.reduce((r, i) => r + i.size, 0);
    let offset = 0;
    for (const viewItem of this.viewItems) {
      viewItem.layout(offset, this.layoutContext);
      offset += viewItem.size;
    }
    this.sashItems.forEach((item) => item.sash.layout());
    this.updateSashEnablement();
    this.updateScrollableElement();
  }
  updateScrollableElement() {
    if (this.orientation === Orientation.VERTICAL) {
      this.scrollableElement.setScrollDimensions({
        height: this.size,
        scrollHeight: this._contentSize
      });
    } else {
      this.scrollableElement.setScrollDimensions({
        width: this.size,
        scrollWidth: this._contentSize
      });
    }
  }
  updateSashEnablement() {
    let previous = false;
    const collapsesDown = this.viewItems.map((i) => previous = i.size - i.minimumSize > 0 || previous);
    previous = false;
    const expandsDown = this.viewItems.map((i) => previous = i.maximumSize - i.size > 0 || previous);
    const reverseViews = [...this.viewItems].reverse();
    previous = false;
    const collapsesUp = reverseViews.map((i) => previous = i.size - i.minimumSize > 0 || previous).reverse();
    previous = false;
    const expandsUp = reverseViews.map((i) => previous = i.maximumSize - i.size > 0 || previous).reverse();
    let position = 0;
    for (let index = 0; index < this.sashItems.length; index++) {
      const { sash } = this.sashItems[index];
      const viewItem = this.viewItems[index];
      position += viewItem.size;
      const min = !(collapsesDown[index] && expandsUp[index + 1]);
      const max = !(expandsDown[index] && collapsesUp[index + 1]);
      if (min && max) {
        const upIndexes = range(index, -1);
        const downIndexes = range(index + 1, this.viewItems.length);
        const snapBeforeIndex = this.findFirstSnapIndex(upIndexes);
        const snapAfterIndex = this.findFirstSnapIndex(downIndexes);
        const snappedBefore = typeof snapBeforeIndex === "number" && !this.viewItems[snapBeforeIndex].visible;
        const snappedAfter = typeof snapAfterIndex === "number" && !this.viewItems[snapAfterIndex].visible;
        if (snappedBefore && collapsesUp[index] && (position > 0 || this.startSnappingEnabled)) {
          sash.state = SashState.AtMinimum;
        } else if (snappedAfter && collapsesDown[index] && (position < this._contentSize || this.endSnappingEnabled)) {
          sash.state = SashState.AtMaximum;
        } else {
          sash.state = SashState.Disabled;
        }
      } else if (min && !max) {
        sash.state = SashState.AtMinimum;
      } else if (!min && max) {
        sash.state = SashState.AtMaximum;
      } else {
        sash.state = SashState.Enabled;
      }
    }
  }
  getSashPosition(sash) {
    let position = 0;
    for (let i = 0; i < this.sashItems.length; i++) {
      position += this.viewItems[i].size;
      if (this.sashItems[i].sash === sash) {
        return position;
      }
    }
    return 0;
  }
  findFirstSnapIndex(indexes) {
    for (const index of indexes) {
      const viewItem = this.viewItems[index];
      if (!viewItem.visible) {
        continue;
      }
      if (viewItem.snap) {
        return index;
      }
    }
    for (const index of indexes) {
      const viewItem = this.viewItems[index];
      if (viewItem.visible && viewItem.maximumSize - viewItem.minimumSize > 0) {
        return void 0;
      }
      if (!viewItem.visible && viewItem.snap) {
        return index;
      }
    }
    return void 0;
  }
  areViewsDistributed() {
    let min = void 0, max = void 0;
    for (const view of this.viewItems) {
      min = min === void 0 ? view.size : Math.min(min, view.size);
      max = max === void 0 ? view.size : Math.max(max, view.size);
      if (max - min > 2) {
        return false;
      }
    }
    return true;
  }
  dispose() {
    this.sashDragState?.disposable.dispose();
    dispose(this.viewItems);
    this.viewItems = [];
    this.sashItems.forEach((i) => i.disposable.dispose());
    this.sashItems = [];
    super.dispose();
  }
}
export {
  LayoutPriority,
  Orientation2 as Orientation,
  Sizing,
  SplitView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGdldFdpbmRvdywgc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVNhc2hFdmVudCBhcyBJQmFzZVNhc2hFdmVudCwgT3JpZW50YXRpb24sIFNhc2gsIFNhc2hTdGF0ZSB9IGZyb20gJy4uL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBTbW9vdGhTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBwdXNoVG9FbmQsIHB1c2hUb1N0YXJ0LCByYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGUsIFNjcm9sbGJhclZpc2liaWxpdHksIFNjcm9sbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9zcGxpdHZpZXcuY3NzJztcbmV4cG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vc2FzaC9zYXNoLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU3BsaXRWaWV3U3R5bGVzIHtcblx0cmVhZG9ubHkgc2VwYXJhdG9yQm9yZGVyOiBDb2xvcjtcbn1cblxuY29uc3QgZGVmYXVsdFN0eWxlczogSVNwbGl0Vmlld1N0eWxlcyA9IHtcblx0c2VwYXJhdG9yQm9yZGVyOiBDb2xvci50cmFuc3BhcmVudFxufTtcblxuZXhwb3J0IGNvbnN0IGVudW0gTGF5b3V0UHJpb3JpdHkge1xuXHROb3JtYWwsXG5cdExvdyxcblx0SGlnaFxufVxuXG4vKipcbiAqIFRoZSBpbnRlcmZhY2UgdG8gaW1wbGVtZW50IGZvciB2aWV3cyB3aXRoaW4gYSB7QGxpbmsgU3BsaXRWaWV3fS5cbiAqXG4gKiBBbiBvcHRpb25hbCB7QGxpbmsgVExheW91dENvbnRleHQgbGF5b3V0IGNvbnRleHQgdHlwZX0gbWF5IGJlIHVzZWQgaW4gb3JkZXIgdG9cbiAqIHBhc3MgYWxvbmcgbGF5b3V0IGNvbnRleHR1YWwgZGF0YSBmcm9tIHRoZSB7QGxpbmsgU3BsaXRWaWV3LmxheW91dH0gbWV0aG9kIGRvd25cbiAqIHRvIGVhY2ggdmlldydzIHtAbGluayBJVmlldy5sYXlvdXR9IGNhbGxzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3PFRMYXlvdXRDb250ZXh0ID0gdW5kZWZpbmVkPiB7XG5cblx0LyoqXG5cdCAqIFRoZSBET00gZWxlbWVudCBmb3IgdGhpcyB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0LyoqXG5cdCAqIEEgbWluaW11bSBzaXplIGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgMGAuXG5cdCAqL1xuXHRyZWFkb25seSBtaW5pbXVtU2l6ZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBBIG1heGltdW0gc2l6ZSBmb3IgdGhpcyB2aWV3LlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJZiBub25lLCBzZXQgaXQgdG8gYE51bWJlci5QT1NJVElWRV9JTkZJTklUWWAuXG5cdCAqL1xuXHRyZWFkb25seSBtYXhpbXVtU2l6ZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBUaGUgcHJpb3JpdHkgb2YgdGhlIHZpZXcgd2hlbiB0aGUge0BsaW5rIFNwbGl0Vmlldy5yZXNpemUgbGF5b3V0fSBhbGdvcml0aG1cblx0ICogcnVucy4gVmlld3Mgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSByZXNpemVkIGZpcnN0LlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBPbmx5IHVzZWQgd2hlbiBgcHJvcG9ydGlvbmFsTGF5b3V0YCBpcyBmYWxzZS5cblx0ICovXG5cdHJlYWRvbmx5IHByaW9yaXR5PzogTGF5b3V0UHJpb3JpdHk7XG5cblx0LyoqXG5cdCAqIElmIHRoZSB7QGxpbmsgU3BsaXRWaWV3fSBzdXBwb3J0cyB7QGxpbmsgSVNwbGl0Vmlld09wdGlvbnMucHJvcG9ydGlvbmFsTGF5b3V0IHByb3BvcnRpb25hbCBsYXlvdXR9LFxuXHQgKiB0aGlzIHByb3BlcnR5IGFsbG93cyBmb3IgZmluZXIgY29udHJvbCBvdmVyIHRoZSBwcm9wb3J0aW9uYWwgbGF5b3V0IGFsZ29yaXRobSwgcGVyIHZpZXcuXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdCAqL1xuXHRyZWFkb25seSBwcm9wb3J0aW9uYWxMYXlvdXQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB2aWV3IHdpbGwgc25hcCB3aGVuZXZlciB0aGUgdXNlciByZWFjaGVzIGl0cyBtaW5pbXVtIHNpemUgb3Jcblx0ICogYXR0ZW1wdHMgdG8gZ3JvdyBpdCBiZXlvbmQgdGhlIG1pbmltdW0gc2l6ZS5cblx0ICpcblx0ICogQGRlZmF1bHRWYWx1ZSBgZmFsc2VgXG5cdCAqL1xuXHRyZWFkb25seSBzbmFwPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVmlldyBpbnN0YW5jZXMgYXJlIHN1cHBvc2VkIHRvIGZpcmUgdGhlIHtAbGluayBJVmlldy5vbkRpZENoYW5nZX0gZXZlbnQgd2hlbmV2ZXJcblx0ICogYW55IG9mIHRoZSBjb25zdHJhaW50IHByb3BlcnRpZXMgaGF2ZSBjaGFuZ2VkOlxuXHQgKlxuXHQgKiAtIHtAbGluayBJVmlldy5taW5pbXVtU2l6ZX1cblx0ICogLSB7QGxpbmsgSVZpZXcubWF4aW11bVNpemV9XG5cdCAqIC0ge0BsaW5rIElWaWV3LnByaW9yaXR5fVxuXHQgKiAtIHtAbGluayBJVmlldy5zbmFwfVxuXHQgKlxuXHQgKiBUaGUgU3BsaXRWaWV3IHdpbGwgcmVsYXlvdXQgd2hlbmV2ZXIgdGhhdCBoYXBwZW5zLiBUaGUgZXZlbnQgY2FuIG9wdGlvbmFsbHkgZW1pdFxuXHQgKiB0aGUgdmlldydzIHByZWZlcnJlZCBzaXplIGZvciB0aGF0IHJlbGF5b3V0LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFRoaXMgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIHtAbGluayBTcGxpdFZpZXd9IGR1cmluZyBsYXlvdXQuIEEgdmlldyBtZWFudCB0b1xuXHQgKiBwYXNzIGFsb25nIHRoZSBsYXlvdXQgaW5mb3JtYXRpb24gZG93biB0byBpdHMgZGVzY2VuZGFudHMuXG5cdCAqXG5cdCAqIEBwYXJhbSBzaXplIFRoZSBzaXplIG9mIHRoaXMgdmlldywgaW4gcGl4ZWxzLlxuXHQgKiBAcGFyYW0gb2Zmc2V0IFRoZSBvZmZzZXQgb2YgdGhpcyB2aWV3LCByZWxhdGl2ZSB0byB0aGUgc3RhcnQgb2YgdGhlIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKiBAcGFyYW0gY29udGV4dCBUaGUgb3B0aW9uYWwge0BsaW5rIElWaWV3IGxheW91dCBjb250ZXh0fSBwYXNzZWQgdG8ge0BsaW5rIFNwbGl0Vmlldy5sYXlvdXR9LlxuXHQgKi9cblx0bGF5b3V0KHNpemU6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGNvbnRleHQ6IFRMYXlvdXRDb250ZXh0IHwgdW5kZWZpbmVkKTogdm9pZDtcblxuXHQvKipcblx0ICogVGhpcyB3aWxsIGJlIGNhbGxlZCBieSB0aGUge0BsaW5rIFNwbGl0Vmlld30gd2hlbmV2ZXIgdGhpcyB2aWV3IGlzIG1hZGVcblx0ICogdmlzaWJsZSBvciBoaWRkZW4uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aXNpYmxlIFdoZXRoZXIgdGhlIHZpZXcgYmVjb21lcyB2aXNpYmxlLlxuXHQgKi9cblx0c2V0VmlzaWJsZT8odmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG59XG5cbi8qKlxuICogQSBkZXNjcmlwdG9yIGZvciBhIHtAbGluayBTcGxpdFZpZXd9IGluc3RhbmNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTcGxpdFZpZXdEZXNjcmlwdG9yPFRMYXlvdXRDb250ZXh0ID0gdW5kZWZpbmVkLCBUVmlldyBleHRlbmRzIElWaWV3PFRMYXlvdXRDb250ZXh0PiA9IElWaWV3PFRMYXlvdXRDb250ZXh0Pj4ge1xuXG5cdC8qKlxuXHQgKiBUaGUgbGF5b3V0IHNpemUgb2YgdGhlIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBEZXNjcmlwdG9ycyBmb3IgZWFjaCB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRyZWFkb25seSB2aWV3czoge1xuXG5cdFx0LyoqXG5cdFx0ICogV2hldGhlciB0aGUge0BsaW5rIElWaWV3IHZpZXd9IGlzIHZpc2libGUuXG5cdFx0ICpcblx0XHQgKiBAZGVmYXVsdFZhbHVlIGB0cnVlYFxuXHRcdCAqL1xuXHRcdHJlYWRvbmx5IHZpc2libGU/OiBib29sZWFuO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHNpemUgb2YgdGhlIHtAbGluayBJVmlldyB2aWV3fS5cblx0XHQgKlxuXHRcdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdFx0ICovXG5cdFx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xuXG5cdFx0LyoqXG5cdFx0ICogVGhlIHNpemUgb2YgdGhlIHtAbGluayBJVmlldyB2aWV3fS5cblx0XHQgKlxuXHRcdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdFx0ICovXG5cdFx0cmVhZG9ubHkgdmlldzogVFZpZXc7XG5cdH1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3BsaXRWaWV3T3B0aW9uczxUTGF5b3V0Q29udGV4dCA9IHVuZGVmaW5lZCwgVFZpZXcgZXh0ZW5kcyBJVmlldzxUTGF5b3V0Q29udGV4dD4gPSBJVmlldzxUTGF5b3V0Q29udGV4dD4+IHtcblxuXHQvKipcblx0ICogV2hpY2ggYXhpcyB0aGUgdmlld3MgYWxpZ24gb24uXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYE9yaWVudGF0aW9uLlZFUlRJQ0FMYFxuXHQgKi9cblx0cmVhZG9ubHkgb3JpZW50YXRpb24/OiBPcmllbnRhdGlvbjtcblxuXHQvKipcblx0ICogU3R5bGVzIG92ZXJyaWRpbmcgdGhlIHtAbGluayBkZWZhdWx0U3R5bGVzIGRlZmF1bHQgb25lc30uXG5cdCAqL1xuXHRyZWFkb25seSBzdHlsZXM/OiBJU3BsaXRWaWV3U3R5bGVzO1xuXG5cdC8qKlxuXHQgKiBNYWtlIEFsdC1kcmFnIHRoZSBkZWZhdWx0IGRyYWcgb3BlcmF0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgaW52ZXJzZUFsdEJlaGF2aW9yPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVzaXplIGVhY2ggdmlldyBwcm9wb3J0aW9uYWxseSB3aGVuIHJlc2l6aW5nIHRoZSBTcGxpdFZpZXcuXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdCAqL1xuXHRyZWFkb25seSBwcm9wb3J0aW9uYWxMYXlvdXQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBbiBpbml0aWFsIGRlc2NyaXB0aW9uIG9mIHRoaXMge0BsaW5rIFNwbGl0Vmlld30gaW5zdGFuY2UsIGFsbG93aW5nXG5cdCAqIHRvIGluaXRpYWx6ZSBhbGwgdmlld3Mgd2l0aGluIHRoZSBjdG9yLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVzY3JpcHRvcj86IElTcGxpdFZpZXdEZXNjcmlwdG9yPFRMYXlvdXRDb250ZXh0LCBUVmlldz47XG5cblx0LyoqXG5cdCAqIFRoZSBzY3JvbGxiYXIgdmlzaWJpbGl0eSBzZXR0aW5nIGZvciB3aGVuZXZlciB0aGUgdmlld3Mgd2l0aGluXG5cdCAqIHRoZSB7QGxpbmsgU3BsaXRWaWV3fSBvdmVyZmxvdy5cblx0ICovXG5cdHJlYWRvbmx5IHNjcm9sbGJhclZpc2liaWxpdHk/OiBTY3JvbGxiYXJWaXNpYmlsaXR5O1xuXG5cdC8qKlxuXHQgKiBPdmVycmlkZSB0aGUgb3J0aG9nb25hbCBzaXplIG9mIHNhc2hlcy5cblx0ICovXG5cdHJlYWRvbmx5IGdldFNhc2hPcnRob2dvbmFsU2l6ZT86ICgpID0+IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElTYXNoRXZlbnQge1xuXHRyZWFkb25seSBzYXNoOiBTYXNoO1xuXHRyZWFkb25seSBzdGFydDogbnVtYmVyO1xuXHRyZWFkb25seSBjdXJyZW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsdDogYm9vbGVhbjtcbn1cblxudHlwZSBWaWV3SXRlbVNpemUgPSBudW1iZXIgfCB7IGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfTtcblxuYWJzdHJhY3QgY2xhc3MgVmlld0l0ZW08VExheW91dENvbnRleHQsIFRWaWV3IGV4dGVuZHMgSVZpZXc8VExheW91dENvbnRleHQ+PiB7XG5cblx0cHJpdmF0ZSBfc2l6ZTogbnVtYmVyO1xuXHRzZXQgc2l6ZShzaXplOiBudW1iZXIpIHtcblx0XHR0aGlzLl9zaXplID0gc2l6ZTtcblx0fVxuXG5cdGdldCBzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZWRWaXNpYmxlU2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgY2FjaGVkVmlzaWJsZVNpemUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2NhY2hlZFZpc2libGVTaXplOyB9XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLl9jYWNoZWRWaXNpYmxlU2l6ZSA9PT0gJ3VuZGVmaW5lZCc7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4sIHNpemU/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodmlzaWJsZSA9PT0gdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMuc2l6ZSA9IGNsYW1wKHRoaXMuX2NhY2hlZFZpc2libGVTaXplISwgdGhpcy52aWV3TWluaW11bVNpemUsIHRoaXMudmlld01heGltdW1TaXplKTtcblx0XHRcdHRoaXMuX2NhY2hlZFZpc2libGVTaXplID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRWaXNpYmxlU2l6ZSA9IHR5cGVvZiBzaXplID09PSAnbnVtYmVyJyA/IHNpemUgOiB0aGlzLnNpemU7XG5cdFx0XHR0aGlzLnNpemUgPSAwO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB2aXNpYmxlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnZpZXcuc2V0VmlzaWJsZT8uKHZpc2libGUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ1NwbGl0dmlldzogRmFpbGVkIHRvIHNldCB2aXNpYmxlIHZpZXcnKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG1pbmltdW1TaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnZpc2libGUgPyB0aGlzLnZpZXcubWluaW11bVNpemUgOiAwOyB9XG5cdGdldCB2aWV3TWluaW11bVNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMudmlldy5taW5pbXVtU2l6ZTsgfVxuXG5cdGdldCBtYXhpbXVtU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy52aXNpYmxlID8gdGhpcy52aWV3Lm1heGltdW1TaXplIDogMDsgfVxuXHRnZXQgdmlld01heGltdW1TaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnZpZXcubWF4aW11bVNpemU7IH1cblxuXHRnZXQgcHJpb3JpdHkoKTogTGF5b3V0UHJpb3JpdHkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy52aWV3LnByaW9yaXR5OyB9XG5cdGdldCBwcm9wb3J0aW9uYWxMYXlvdXQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnZpZXcucHJvcG9ydGlvbmFsTGF5b3V0ID8/IHRydWU7IH1cblx0Z2V0IHNuYXAoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMudmlldy5zbmFwOyB9XG5cblx0c2V0IGVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbikge1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBlbmFibGVkID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSB2aWV3OiBUVmlldyxcblx0XHRzaXplOiBWaWV3SXRlbVNpemUsXG5cdFx0cHJpdmF0ZSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZVxuXHQpIHtcblx0XHRpZiAodHlwZW9mIHNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLl9zaXplID0gc2l6ZTtcblx0XHRcdHRoaXMuX2NhY2hlZFZpc2libGVTaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2l6ZSA9IDA7XG5cdFx0XHR0aGlzLl9jYWNoZWRWaXNpYmxlU2l6ZSA9IHNpemUuY2FjaGVkVmlzaWJsZVNpemU7XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KG9mZnNldDogbnVtYmVyLCBsYXlvdXRDb250ZXh0OiBUTGF5b3V0Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMubGF5b3V0Q29udGFpbmVyKG9mZnNldCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy52aWV3LmxheW91dCh0aGlzLnNpemUsIG9mZnNldCwgbGF5b3V0Q29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignU3BsaXR2aWV3OiBGYWlsZWQgdG8gbGF5b3V0IHZpZXcnKTtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgbGF5b3V0Q29udGFpbmVyKG9mZnNldDogbnVtYmVyKTogdm9pZDtcblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVmVydGljYWxWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXcgZXh0ZW5kcyBJVmlldzxUTGF5b3V0Q29udGV4dD4+IGV4dGVuZHMgVmlld0l0ZW08VExheW91dENvbnRleHQsIFRWaWV3PiB7XG5cblx0bGF5b3V0Q29udGFpbmVyKG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUudG9wID0gYCR7b2Zmc2V0fXB4YDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLnNpemV9cHhgO1xuXHR9XG59XG5cbmNsYXNzIEhvcml6b250YWxWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXcgZXh0ZW5kcyBJVmlldzxUTGF5b3V0Q29udGV4dD4+IGV4dGVuZHMgVmlld0l0ZW08VExheW91dENvbnRleHQsIFRWaWV3PiB7XG5cblx0bGF5b3V0Q29udGFpbmVyKG9mZnNldDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUubGVmdCA9IGAke29mZnNldH1weGA7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt0aGlzLnNpemV9cHhgO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2FzaEl0ZW0ge1xuXHRzYXNoOiBTYXNoO1xuXHRkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuaW50ZXJmYWNlIElTYXNoRHJhZ1NuYXBTdGF0ZSB7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbWl0RGVsdGE6IG51bWJlcjtcblx0cmVhZG9ubHkgc2l6ZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSVNhc2hEcmFnU3RhdGUge1xuXHRpbmRleDogbnVtYmVyO1xuXHRzdGFydDogbnVtYmVyO1xuXHRjdXJyZW50OiBudW1iZXI7XG5cdHNpemVzOiBudW1iZXJbXTtcblx0bWluRGVsdGE6IG51bWJlcjtcblx0bWF4RGVsdGE6IG51bWJlcjtcblx0YWx0OiBib29sZWFuO1xuXHRzbmFwQmVmb3JlOiBJU2FzaERyYWdTbmFwU3RhdGUgfCB1bmRlZmluZWQ7XG5cdHNuYXBBZnRlcjogSVNhc2hEcmFnU25hcFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuZW51bSBTdGF0ZSB7XG5cdElkbGUsXG5cdEJ1c3lcbn1cblxuLyoqXG4gKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgdW5pZm9ybWx5IGRpc3RyaWJ1dGUgdGhlIGVudGlyZSBzcGxpdCB2aWV3IHNwYWNlIGFtb25nXG4gKiBhbGwgdmlld3MuXG4gKi9cbmV4cG9ydCB0eXBlIERpc3RyaWJ1dGVTaXppbmcgPSB7IHR5cGU6ICdkaXN0cmlidXRlJyB9O1xuXG4vKipcbiAqIFdoZW4gYWRkaW5nIGEgdmlldywgbWFrZSBzcGFjZSBmb3IgaXQgYnkgcmVkdWNpbmcgdGhlIHNpemUgb2YgYW5vdGhlciB2aWV3LFxuICogaW5kZXhlZCBieSB0aGUgcHJvdmlkZWQgYGluZGV4YC5cbiAqL1xuZXhwb3J0IHR5cGUgU3BsaXRTaXppbmcgPSB7IHR5cGU6ICdzcGxpdCc7IGluZGV4OiBudW1iZXIgfTtcblxuLyoqXG4gKiBXaGVuIGFkZGluZyBhIHZpZXcsIHVzZSBEaXN0cmlidXRlU2l6aW5nIHdoZW4gYWxsIHByZS1leGlzdGluZyB2aWV3cyBhcmVcbiAqIGRpc3RyaWJ1dGVkIGV2ZW5seSwgb3RoZXJ3aXNlIHVzZSBTcGxpdFNpemluZy5cbiAqL1xuZXhwb3J0IHR5cGUgQXV0b1NpemluZyA9IHsgdHlwZTogJ2F1dG8nOyBpbmRleDogbnVtYmVyIH07XG5cbi8qKlxuICogV2hlbiBhZGRpbmcgb3IgcmVtb3Zpbmcgdmlld3MsIGFzc3VtZSB0aGUgdmlldyBpcyBpbnZpc2libGUuXG4gKi9cbmV4cG9ydCB0eXBlIEludmlzaWJsZVNpemluZyA9IHsgdHlwZTogJ2ludmlzaWJsZSc7IGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfTtcblxuLyoqXG4gKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgdGhlIHNpemluZyBwcm92aWRlcyBmaW5lIGdyYWluZWRcbiAqIGNvbnRyb2wgb3ZlciBob3cgb3RoZXIgdmlld3MgZ2V0IHJlc2l6ZWQuXG4gKi9cbmV4cG9ydCB0eXBlIFNpemluZyA9IERpc3RyaWJ1dGVTaXppbmcgfCBTcGxpdFNpemluZyB8IEF1dG9TaXppbmcgfCBJbnZpc2libGVTaXppbmc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2l6aW5nIHtcblxuXHQvKipcblx0ICogV2hlbiBhZGRpbmcgb3IgcmVtb3Zpbmcgdmlld3MsIGRpc3RyaWJ1dGUgdGhlIGRlbHRhIHNwYWNlIGFtb25nXG5cdCAqIGFsbCBvdGhlciB2aWV3cy5cblx0ICovXG5cdGV4cG9ydCBjb25zdCBEaXN0cmlidXRlOiBEaXN0cmlidXRlU2l6aW5nID0geyB0eXBlOiAnZGlzdHJpYnV0ZScgfTtcblxuXHQvKipcblx0ICogV2hlbiBhZGRpbmcgb3IgcmVtb3Zpbmcgdmlld3MsIHNwbGl0IHRoZSBkZWx0YSBzcGFjZSB3aXRoIGFub3RoZXJcblx0ICogc3BlY2lmaWMgdmlldywgaW5kZXhlZCBieSB0aGUgcHJvdmlkZWQgYGluZGV4YC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBTcGxpdChpbmRleDogbnVtYmVyKTogU3BsaXRTaXppbmcgeyByZXR1cm4geyB0eXBlOiAnc3BsaXQnLCBpbmRleCB9OyB9XG5cblx0LyoqXG5cdCAqIFdoZW4gYWRkaW5nIGEgdmlldywgdXNlIERpc3RyaWJ1dGVTaXppbmcgd2hlbiBhbGwgcHJlLWV4aXN0aW5nIHZpZXdzIGFyZVxuXHQgKiBkaXN0cmlidXRlZCBldmVubHksIG90aGVyd2lzZSB1c2UgU3BsaXRTaXppbmcuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gQXV0byhpbmRleDogbnVtYmVyKTogQXV0b1NpemluZyB7IHJldHVybiB7IHR5cGU6ICdhdXRvJywgaW5kZXggfTsgfVxuXG5cdC8qKlxuXHQgKiBXaGVuIGFkZGluZyBvciByZW1vdmluZyB2aWV3cywgYXNzdW1lIHRoZSB2aWV3IGlzIGludmlzaWJsZS5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBJbnZpc2libGUoY2FjaGVkVmlzaWJsZVNpemU6IG51bWJlcik6IEludmlzaWJsZVNpemluZyB7IHJldHVybiB7IHR5cGU6ICdpbnZpc2libGUnLCBjYWNoZWRWaXNpYmxlU2l6ZSB9OyB9XG59XG5cbi8qKlxuICogVGhlIHtAbGluayBTcGxpdFZpZXd9IGlzIHRoZSBVSSBjb21wb25lbnQgd2hpY2ggaW1wbGVtZW50cyBhIG9uZSBkaW1lbnNpb25hbFxuICogZmxleC1saWtlIGxheW91dCBhbGdvcml0aG0gZm9yIGEgY29sbGVjdGlvbiBvZiB7QGxpbmsgSVZpZXd9IGluc3RhbmNlcywgd2hpY2hcbiAqIGFyZSBlc3NlbnRpYWxseSBIVE1MRWxlbWVudCBpbnN0YW5jZXMgd2l0aCB0aGUgZm9sbG93aW5nIHNpemUgY29uc3RyYWludHM6XG4gKlxuICogLSB7QGxpbmsgSVZpZXcubWluaW11bVNpemV9XG4gKiAtIHtAbGluayBJVmlldy5tYXhpbXVtU2l6ZX1cbiAqIC0ge0BsaW5rIElWaWV3LnByaW9yaXR5fVxuICogLSB7QGxpbmsgSVZpZXcuc25hcH1cbiAqXG4gKiBJbiBjYXNlIHRoZSBTcGxpdFZpZXcgZG9lc24ndCBoYXZlIGVub3VnaCBzaXplIHRvIGZpdCBhbGwgdmlld3MsIGl0IHdpbGwgb3ZlcmZsb3dcbiAqIGl0cyBjb250ZW50IHdpdGggYSBzY3JvbGxiYXIuXG4gKlxuICogSW4gYmV0d2VlbiBlYWNoIHBhaXIgb2Ygdmlld3MgdGhlcmUgd2lsbCBiZSBhIHtAbGluayBTYXNofSBhbGxvd2luZyB0aGUgdXNlclxuICogdG8gcmVzaXplIHRoZSB2aWV3cywgbWFraW5nIHN1cmUgdGhlIGNvbnN0cmFpbnRzIGFyZSByZXNwZWN0ZWQuXG4gKlxuICogQW4gb3B0aW9uYWwge0BsaW5rIFRMYXlvdXRDb250ZXh0IGxheW91dCBjb250ZXh0IHR5cGV9IG1heSBiZSB1c2VkIGluIG9yZGVyIHRvXG4gKiBwYXNzIGFsb25nIGxheW91dCBjb250ZXh0dWFsIGRhdGEgZnJvbSB0aGUge0BsaW5rIFNwbGl0Vmlldy5sYXlvdXR9IG1ldGhvZCBkb3duXG4gKiB0byBlYWNoIHZpZXcncyB7QGxpbmsgSVZpZXcubGF5b3V0fSBjYWxscy5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gRmxleC1saWtlIGxheW91dCBhbGdvcml0aG1cbiAqIC0gU25hcCBzdXBwb3J0XG4gKiAtIE9ydGhvZ29uYWwgc2FzaCBzdXBwb3J0LCBmb3IgY29ybmVyIHNhc2hlc1xuICogLSBWaWV3IGhpZGUvc2hvdyBzdXBwb3J0XG4gKiAtIFZpZXcgc3dhcC9tb3ZlIHN1cHBvcnRcbiAqIC0gQWx0IGtleSBtb2RpZmllciBiZWhhdmlvciwgbWFjT1Mgc3R5bGVcbiAqL1xuZXhwb3J0IGNsYXNzIFNwbGl0VmlldzxUTGF5b3V0Q29udGV4dCA9IHVuZGVmaW5lZCwgVFZpZXcgZXh0ZW5kcyBJVmlldzxUTGF5b3V0Q29udGV4dD4gPSBJVmlldzxUTGF5b3V0Q29udGV4dD4+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIFRoaXMge0BsaW5rIFNwbGl0Vmlld30ncyBvcmllbnRhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbjtcblxuXHQvKipcblx0ICogVGhlIERPTSBlbGVtZW50IHJlcHJlc2VudGluZyB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0cmVhZG9ubHkgZWw6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgc2FzaENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdmlld0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2Nyb2xsYWJsZTogU2Nyb2xsYWJsZTtcblx0cHJpdmF0ZSBzY3JvbGxhYmxlRWxlbWVudDogU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgc2l6ZSA9IDA7XG5cdHByaXZhdGUgbGF5b3V0Q29udGV4dDogVExheW91dENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbnRlbnRTaXplID0gMDtcblx0cHJpdmF0ZSBwcm9wb3J0aW9uczogKG51bWJlciB8IHVuZGVmaW5lZClbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aWV3SXRlbXM6IFZpZXdJdGVtPFRMYXlvdXRDb250ZXh0LCBUVmlldz5bXSA9IFtdO1xuXHRzYXNoSXRlbXM6IElTYXNoSXRlbVtdID0gW107IC8vIHVzZWQgaW4gdGVzdHNcblx0cHJpdmF0ZSBzYXNoRHJhZ1N0YXRlOiBJU2FzaERyYWdTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGF0ZTogU3RhdGUgPSBTdGF0ZS5JZGxlO1xuXHRwcml2YXRlIGludmVyc2VBbHRCZWhhdmlvcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBwcm9wb3J0aW9uYWxMYXlvdXQ6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2V0U2FzaE9ydGhvZ29uYWxTaXplOiB7ICgpOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZFNhc2hDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRwcml2YXRlIF9vbkRpZFNhc2hSZXNldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHByaXZhdGUgX29ydGhvZ29uYWxTdGFydFNhc2g6IFNhc2ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29ydGhvZ29uYWxFbmRTYXNoOiBTYXNoIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFydFNuYXBwaW5nRW5hYmxlZCA9IHRydWU7XG5cdHByaXZhdGUgX2VuZFNuYXBwaW5nRW5hYmxlZCA9IHRydWU7XG5cblx0LyoqXG5cdCAqIFRoZSBzdW0gb2YgYWxsIHZpZXdzJyBzaXplcy5cblx0ICovXG5cdGdldCBjb250ZW50U2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fY29udGVudFNpemU7IH1cblxuXHQvKipcblx0ICogRmlyZXMgd2hlbmV2ZXIgdGhlIHVzZXIgcmVzaXplcyBhIHtAbGluayBTYXNoIHNhc2h9LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTYXNoQ2hhbmdlID0gdGhpcy5fb25EaWRTYXNoQ2hhbmdlLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgdXNlciBkb3VibGUgY2xpY2tzIGEge0BsaW5rIFNhc2ggc2FzaH0uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhc2hSZXNldCA9IHRoaXMuX29uRGlkU2FzaFJlc2V0LmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgc3BsaXQgdmlldyBpcyBzY3JvbGxlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2Nyb2xsOiBFdmVudDxTY3JvbGxFdmVudD47XG5cblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2Ygdmlld3MgaW4gdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICovXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3SXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIHNpemUgb2YgdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICovXG5cdGdldCBtaW5pbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtcy5yZWR1Y2UoKHIsIGl0ZW0pID0+IHIgKyBpdGVtLm1pbmltdW1TaXplLCAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBzaXplIG9mIHRoaXMge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRnZXQgbWF4aW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5sZW5ndGggPT09IDAgPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiB0aGlzLnZpZXdJdGVtcy5yZWR1Y2UoKHIsIGl0ZW0pID0+IHIgKyBpdGVtLm1heGltdW1TaXplLCAwKTtcblx0fVxuXG5cdGdldCBvcnRob2dvbmFsU3RhcnRTYXNoKCk6IFNhc2ggfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fb3J0aG9nb25hbFN0YXJ0U2FzaDsgfVxuXHRnZXQgb3J0aG9nb25hbEVuZFNhc2goKTogU2FzaCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcnRob2dvbmFsRW5kU2FzaDsgfVxuXHRnZXQgc3RhcnRTbmFwcGluZ0VuYWJsZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9zdGFydFNuYXBwaW5nRW5hYmxlZDsgfVxuXHRnZXQgZW5kU25hcHBpbmdFbmFibGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fZW5kU25hcHBpbmdFbmFibGVkOyB9XG5cblx0LyoqXG5cdCAqIEEgcmVmZXJlbmNlIHRvIGEgc2FzaCwgcGVycGVuZGljdWxhciB0byBhbGwgc2FzaGVzIGluIHRoaXMge0BsaW5rIFNwbGl0Vmlld30sXG5cdCAqIGxvY2F0ZWQgYXQgdGhlIGxlZnQtIG9yIHRvcC1tb3N0IHNpZGUgb2YgdGhlIFNwbGl0Vmlldy5cblx0ICogQ29ybmVyIHNhc2hlcyB3aWxsIGJlIGNyZWF0ZWQgYXV0b21hdGljYWxseSBhdCB0aGUgaW50ZXJzZWN0aW9ucy5cblx0ICovXG5cdHNldCBvcnRob2dvbmFsU3RhcnRTYXNoKHNhc2g6IFNhc2ggfCB1bmRlZmluZWQpIHtcblx0XHRmb3IgKGNvbnN0IHNhc2hJdGVtIG9mIHRoaXMuc2FzaEl0ZW1zKSB7XG5cdFx0XHRzYXNoSXRlbS5zYXNoLm9ydGhvZ29uYWxTdGFydFNhc2ggPSBzYXNoO1xuXHRcdH1cblxuXHRcdHRoaXMuX29ydGhvZ29uYWxTdGFydFNhc2ggPSBzYXNoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgcmVmZXJlbmNlIHRvIGEgc2FzaCwgcGVycGVuZGljdWxhciB0byBhbGwgc2FzaGVzIGluIHRoaXMge0BsaW5rIFNwbGl0Vmlld30sXG5cdCAqIGxvY2F0ZWQgYXQgdGhlIHJpZ2h0LSBvciBib3R0b20tbW9zdCBzaWRlIG9mIHRoZSBTcGxpdFZpZXcuXG5cdCAqIENvcm5lciBzYXNoZXMgd2lsbCBiZSBjcmVhdGVkIGF1dG9tYXRpY2FsbHkgYXQgdGhlIGludGVyc2VjdGlvbnMuXG5cdCAqL1xuXHRzZXQgb3J0aG9nb25hbEVuZFNhc2goc2FzaDogU2FzaCB8IHVuZGVmaW5lZCkge1xuXHRcdGZvciAoY29uc3Qgc2FzaEl0ZW0gb2YgdGhpcy5zYXNoSXRlbXMpIHtcblx0XHRcdHNhc2hJdGVtLnNhc2gub3J0aG9nb25hbEVuZFNhc2ggPSBzYXNoO1xuXHRcdH1cblxuXHRcdHRoaXMuX29ydGhvZ29uYWxFbmRTYXNoID0gc2FzaDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaW50ZXJuYWwgc2FzaGVzIHdpdGhpbiB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKi9cblx0Z2V0IHNhc2hlcygpOiByZWFkb25seSBTYXNoW10ge1xuXHRcdHJldHVybiB0aGlzLnNhc2hJdGVtcy5tYXAocyA9PiBzLnNhc2gpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuYWJsZS9kaXNhYmxlIHNuYXBwaW5nIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICovXG5cdHNldCBzdGFydFNuYXBwaW5nRW5hYmxlZChzdGFydFNuYXBwaW5nRW5hYmxlZDogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9zdGFydFNuYXBwaW5nRW5hYmxlZCA9PT0gc3RhcnRTbmFwcGluZ0VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGFydFNuYXBwaW5nRW5hYmxlZCA9IHN0YXJ0U25hcHBpbmdFbmFibGVkO1xuXHRcdHRoaXMudXBkYXRlU2FzaEVuYWJsZW1lbnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbmFibGUvZGlzYWJsZSBzbmFwcGluZyBhdCB0aGUgZW5kIG9mIHRoaXMge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRzZXQgZW5kU25hcHBpbmdFbmFibGVkKGVuZFNuYXBwaW5nRW5hYmxlZDogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9lbmRTbmFwcGluZ0VuYWJsZWQgPT09IGVuZFNuYXBwaW5nRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VuZFNuYXBwaW5nRW5hYmxlZCA9IGVuZFNuYXBwaW5nRW5hYmxlZDtcblx0XHR0aGlzLnVwZGF0ZVNhc2hFbmFibGVtZW50KCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHtAbGluayBTcGxpdFZpZXd9IGluc3RhbmNlLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogSVNwbGl0Vmlld09wdGlvbnM8VExheW91dENvbnRleHQsIFRWaWV3PiA9IHt9KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub3JpZW50YXRpb24gPSBvcHRpb25zLm9yaWVudGF0aW9uID8/IE9yaWVudGF0aW9uLlZFUlRJQ0FMO1xuXHRcdHRoaXMuaW52ZXJzZUFsdEJlaGF2aW9yID0gb3B0aW9ucy5pbnZlcnNlQWx0QmVoYXZpb3IgPz8gZmFsc2U7XG5cdFx0dGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQgPSBvcHRpb25zLnByb3BvcnRpb25hbExheW91dCA/PyB0cnVlO1xuXHRcdHRoaXMuZ2V0U2FzaE9ydGhvZ29uYWxTaXplID0gb3B0aW9ucy5nZXRTYXNoT3J0aG9nb25hbFNpemU7XG5cblx0XHR0aGlzLmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKCdtb25hY28tc3BsaXQtdmlldzInKTtcblx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyAndmVydGljYWwnIDogJ2hvcml6b250YWwnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbCk7XG5cblx0XHR0aGlzLnNhc2hDb250YWluZXIgPSBhcHBlbmQodGhpcy5lbCwgJCgnLnNhc2gtY29udGFpbmVyJykpO1xuXHRcdHRoaXMudmlld0NvbnRhaW5lciA9ICQoJy5zcGxpdC12aWV3LWNvbnRhaW5lcicpO1xuXG5cdFx0dGhpcy5zY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNjcm9sbGFibGUoe1xuXHRcdFx0Zm9yY2VJbnRlZ2VyVmFsdWVzOiB0cnVlLFxuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IDEyNSxcblx0XHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IGNhbGxiYWNrID0+IHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZ2V0V2luZG93KHRoaXMuZWwpLCBjYWxsYmFjayksXG5cdFx0fSkpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy52aWV3Q29udGFpbmVyLCB7XG5cdFx0XHR2ZXJ0aWNhbDogdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyAob3B0aW9ucy5zY3JvbGxiYXJWaXNpYmlsaXR5ID8/IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0bykgOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdGhvcml6b250YWw6IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyAob3B0aW9ucy5zY3JvbGxiYXJWaXNpYmlsaXR5ID8/IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0bykgOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlblxuXHRcdH0sIHRoaXMuc2Nyb2xsYWJsZSkpO1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1NzczN1xuXHRcdGNvbnN0IG9uRGlkU2Nyb2xsVmlld0NvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKHRoaXMudmlld0NvbnRhaW5lciwgJ3Njcm9sbCcpKS5ldmVudDtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZFNjcm9sbFZpZXdDb250YWluZXIoXyA9PiB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSBNYXRoLmFicyh0aGlzLnZpZXdDb250YWluZXIuc2Nyb2xsTGVmdCAtIHBvc2l0aW9uLnNjcm9sbExlZnQpIDw9IDEgPyB1bmRlZmluZWQgOiB0aGlzLnZpZXdDb250YWluZXIuc2Nyb2xsTGVmdDtcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IE1hdGguYWJzKHRoaXMudmlld0NvbnRhaW5lci5zY3JvbGxUb3AgLSBwb3NpdGlvbi5zY3JvbGxUb3ApIDw9IDEgPyB1bmRlZmluZWQgOiB0aGlzLnZpZXdDb250YWluZXIuc2Nyb2xsVG9wO1xuXG5cdFx0XHRpZiAoc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkIHx8IHNjcm9sbFRvcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0LCBzY3JvbGxUb3AgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5vbkRpZFNjcm9sbCA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQub25TY3JvbGw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFNjcm9sbChlID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy52aWV3Q29udGFpbmVyLnNjcm9sbFRvcCA9IGUuc2Nyb2xsVG9wO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5zY3JvbGxMZWZ0Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLnZpZXdDb250YWluZXIuc2Nyb2xsTGVmdCA9IGUuc2Nyb2xsTGVmdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhcHBlbmQodGhpcy5lbCwgdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCkpO1xuXG5cdFx0dGhpcy5zdHlsZShvcHRpb25zLnN0eWxlcyB8fCBkZWZhdWx0U3R5bGVzKTtcblxuXHRcdC8vIFdlIGhhdmUgYW4gZXhpc3Rpbmcgc2V0IG9mIHZpZXcsIGFkZCB0aGVtIG5vd1xuXHRcdGlmIChvcHRpb25zLmRlc2NyaXB0b3IpIHtcblx0XHRcdHRoaXMuc2l6ZSA9IG9wdGlvbnMuZGVzY3JpcHRvci5zaXplO1xuXHRcdFx0b3B0aW9ucy5kZXNjcmlwdG9yLnZpZXdzLmZvckVhY2goKHZpZXdEZXNjcmlwdG9yLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzaXppbmcgPSB0eXBlcy5pc1VuZGVmaW5lZCh2aWV3RGVzY3JpcHRvci52aXNpYmxlKSB8fCB2aWV3RGVzY3JpcHRvci52aXNpYmxlID8gdmlld0Rlc2NyaXB0b3Iuc2l6ZSA6IHsgdHlwZTogJ2ludmlzaWJsZScsIGNhY2hlZFZpc2libGVTaXplOiB2aWV3RGVzY3JpcHRvci5zaXplIH0gc2F0aXNmaWVzIEludmlzaWJsZVNpemluZztcblxuXHRcdFx0XHRjb25zdCB2aWV3ID0gdmlld0Rlc2NyaXB0b3Iudmlldztcblx0XHRcdFx0dGhpcy5kb0FkZFZpZXcodmlldywgc2l6aW5nLCBpbmRleCwgdHJ1ZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSW5pdGlhbGl6ZSBjb250ZW50IHNpemUgYW5kIHByb3BvcnRpb25zIGZvciBmaXJzdCBsYXlvdXRcblx0XHRcdHRoaXMuX2NvbnRlbnRTaXplID0gdGhpcy52aWV3SXRlbXMucmVkdWNlKChyLCBpKSA9PiByICsgaS5zaXplLCAwKTtcblx0XHRcdHRoaXMuc2F2ZVByb3BvcnRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJU3BsaXRWaWV3U3R5bGVzKTogdm9pZCB7XG5cdFx0aWYgKHN0eWxlcy5zZXBhcmF0b3JCb3JkZXIuaXNUcmFuc3BhcmVudCgpKSB7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5yZW1vdmUoJ3NlcGFyYXRvci1ib3JkZXInKTtcblx0XHRcdHRoaXMuZWwuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tc2VwYXJhdG9yLWJvcmRlcicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoJ3NlcGFyYXRvci1ib3JkZXInKTtcblx0XHRcdHRoaXMuZWwuc3R5bGUuc2V0UHJvcGVydHkoJy0tc2VwYXJhdG9yLWJvcmRlcicsIHN0eWxlcy5zZXBhcmF0b3JCb3JkZXIudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFkZCBhIHtAbGluayBJVmlldyB2aWV3fSB0byB0aGlzIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgdmlldyB0byBhZGQuXG5cdCAqIEBwYXJhbSBzaXplIEVpdGhlciBhIGZpeGVkIHNpemUsIG9yIGEgZHluYW1pYyB7QGxpbmsgU2l6aW5nfSBzdHJhdGVneS5cblx0ICogQHBhcmFtIGluZGV4IFRoZSBpbmRleCB0byBpbnNlcnQgdGhlIHZpZXcgb24uXG5cdCAqIEBwYXJhbSBza2lwTGF5b3V0IFdoZXRoZXIgbGF5b3V0IHNob3VsZCBiZSBza2lwcGVkLlxuXHQgKi9cblx0YWRkVmlldyh2aWV3OiBUVmlldywgc2l6ZTogbnVtYmVyIHwgU2l6aW5nLCBpbmRleCA9IHRoaXMudmlld0l0ZW1zLmxlbmd0aCwgc2tpcExheW91dD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmRvQWRkVmlldyh2aWV3LCBzaXplLCBpbmRleCwgc2tpcExheW91dCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IGZyb20gdGhpcyB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGluZGV4IFRoZSBpbmRleCB3aGVyZSB0aGUge0BsaW5rIElWaWV3IHZpZXd9IGlzIGxvY2F0ZWQuXG5cdCAqIEBwYXJhbSBzaXppbmcgV2hldGhlciB0byBkaXN0cmlidXRlIG90aGVyIHtAbGluayBJVmlldyB2aWV3fSdzIHNpemVzLlxuXHQgKi9cblx0cmVtb3ZlVmlldyhpbmRleDogbnVtYmVyLCBzaXppbmc/OiBTaXppbmcpOiBUVmlldyB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW5kZXggb3V0IG9mIGJvdW5kcycpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbnQgbW9kaWZ5IHNwbGl0dmlldycpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5CdXN5O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChzaXppbmc/LnR5cGUgPT09ICdhdXRvJykge1xuXHRcdFx0XHRpZiAodGhpcy5hcmVWaWV3c0Rpc3RyaWJ1dGVkKCkpIHtcblx0XHRcdFx0XHRzaXppbmcgPSB7IHR5cGU6ICdkaXN0cmlidXRlJyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNpemluZyA9IHsgdHlwZTogJ3NwbGl0JywgaW5kZXg6IHNpemluZy5pbmRleCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmUgcmVmZXJlbmUgdmlldywgaW4gY2FzZSBvZiBgc3BsaXRgIHNpemluZ1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlVmlld0l0ZW0gPSBzaXppbmc/LnR5cGUgPT09ICdzcGxpdCcgPyB0aGlzLnZpZXdJdGVtc1tzaXppbmcuaW5kZXhdIDogdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBSZW1vdmUgdmlld1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW1Ub1JlbW92ZSA9IHRoaXMudmlld0l0ZW1zLnNwbGljZShpbmRleCwgMSlbMF07XG5cblx0XHRcdC8vIFJlc2l6ZSByZWZlcmVuY2UgdmlldywgaW4gY2FzZSBvZiBgc3BsaXRgIHNpemluZ1xuXHRcdFx0aWYgKHJlZmVyZW5jZVZpZXdJdGVtKSB7XG5cdFx0XHRcdHJlZmVyZW5jZVZpZXdJdGVtLnNpemUgKz0gdmlld0l0ZW1Ub1JlbW92ZS5zaXplO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgc2FzaFxuXHRcdFx0aWYgKHRoaXMudmlld0l0ZW1zLmxlbmd0aCA+PSAxKSB7XG5cdFx0XHRcdGNvbnN0IHNhc2hJbmRleCA9IE1hdGgubWF4KGluZGV4IC0gMSwgMCk7XG5cdFx0XHRcdGNvbnN0IHNhc2hJdGVtID0gdGhpcy5zYXNoSXRlbXMuc3BsaWNlKHNhc2hJbmRleCwgMSlbMF07XG5cdFx0XHRcdHNhc2hJdGVtLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cblx0XHRcdGlmIChzaXppbmc/LnR5cGUgPT09ICdkaXN0cmlidXRlJykge1xuXHRcdFx0XHR0aGlzLmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdmlld0l0ZW1Ub1JlbW92ZS52aWV3O1xuXHRcdFx0dmlld0l0ZW1Ub1JlbW92ZS5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5JZGxlO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZUFsbFZpZXdzKCk6IFRWaWV3W10ge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbnQgbW9kaWZ5IHNwbGl0dmlldycpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5CdXN5O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZpZXdJdGVtcyA9IHRoaXMudmlld0l0ZW1zLnNwbGljZSgwLCB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHZpZXdJdGVtIG9mIHZpZXdJdGVtcykge1xuXHRcdFx0XHR2aWV3SXRlbS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNhc2hJdGVtcyA9IHRoaXMuc2FzaEl0ZW1zLnNwbGljZSgwLCB0aGlzLnNhc2hJdGVtcy5sZW5ndGgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNhc2hJdGVtIG9mIHNhc2hJdGVtcykge1xuXHRcdFx0XHRzYXNoSXRlbS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZWxheW91dCgpO1xuXHRcdFx0cmV0dXJuIHZpZXdJdGVtcy5tYXAoaSA9PiBpLnZpZXcpO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5JZGxlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIGEgZGlmZmVyZW50IGluZGV4LlxuXHQgKlxuXHQgKiBAcGFyYW0gZnJvbSBUaGUgc291cmNlIGluZGV4LlxuXHQgKiBAcGFyYW0gdG8gVGhlIHRhcmdldCBpbmRleC5cblx0ICovXG5cdG1vdmVWaWV3KGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbnQgbW9kaWZ5IHNwbGl0dmlldycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZFZpc2libGVTaXplID0gdGhpcy5nZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUoZnJvbSk7XG5cdFx0Y29uc3Qgc2l6aW5nID0gdHlwZW9mIGNhY2hlZFZpc2libGVTaXplID09PSAndW5kZWZpbmVkJyA/IHRoaXMuZ2V0Vmlld1NpemUoZnJvbSkgOiBTaXppbmcuSW52aXNpYmxlKGNhY2hlZFZpc2libGVTaXplKTtcblx0XHRjb25zdCB2aWV3ID0gdGhpcy5yZW1vdmVWaWV3KGZyb20pO1xuXHRcdHRoaXMuYWRkVmlldyh2aWV3LCBzaXppbmcsIHRvKTtcblx0fVxuXG5cblx0LyoqXG5cdCAqIFN3YXAgdHdvIHtAbGluayBJVmlldyB2aWV3c30uXG5cdCAqXG5cdCAqIEBwYXJhbSBmcm9tIFRoZSBzb3VyY2UgaW5kZXguXG5cdCAqIEBwYXJhbSB0byBUaGUgdGFyZ2V0IGluZGV4LlxuXHQgKi9cblx0c3dhcFZpZXdzKGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbnQgbW9kaWZ5IHNwbGl0dmlldycpO1xuXHRcdH1cblxuXHRcdGlmIChmcm9tID4gdG8pIHtcblx0XHRcdHJldHVybiB0aGlzLnN3YXBWaWV3cyh0bywgZnJvbSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJvbVNpemUgPSB0aGlzLmdldFZpZXdTaXplKGZyb20pO1xuXHRcdGNvbnN0IHRvU2l6ZSA9IHRoaXMuZ2V0Vmlld1NpemUodG8pO1xuXHRcdGNvbnN0IHRvVmlldyA9IHRoaXMucmVtb3ZlVmlldyh0byk7XG5cdFx0Y29uc3QgZnJvbVZpZXcgPSB0aGlzLnJlbW92ZVZpZXcoZnJvbSk7XG5cblx0XHR0aGlzLmFkZFZpZXcodG9WaWV3LCBmcm9tU2l6ZSwgZnJvbSk7XG5cdFx0dGhpcy5hZGRWaWV3KGZyb21WaWV3LCB0b1NpemUsIHRvKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHtAbGluayBJVmlldyB2aWV3fSBpcyB2aXNpYmxlLlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIHtAbGluayBJVmlldyB2aWV3fSBpbmRleC5cblx0ICovXG5cdGlzVmlld1Zpc2libGUoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0luZGV4IG91dCBvZiBib3VuZHMnKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW2luZGV4XTtcblx0XHRyZXR1cm4gdmlld0l0ZW0udmlzaWJsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgYSB7QGxpbmsgSVZpZXcgdmlld30ncyB2aXNpYmlsaXR5LlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXggVGhlIHtAbGluayBJVmlldyB2aWV3fSBpbmRleC5cblx0ICogQHBhcmFtIHZpc2libGUgV2hldGhlciB0aGUge0BsaW5rIElWaWV3IHZpZXd9IHNob3VsZCBiZSB2aXNpYmxlLlxuXHQgKi9cblx0c2V0Vmlld1Zpc2libGUoaW5kZXg6IG51bWJlciwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0luZGV4IG91dCBvZiBib3VuZHMnKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW2luZGV4XTtcblx0XHR2aWV3SXRlbS5zZXRWaXNpYmxlKHZpc2libGUpO1xuXG5cdFx0dGhpcy5kaXN0cmlidXRlRW1wdHlTcGFjZShpbmRleCk7XG5cdFx0dGhpcy5sYXlvdXRWaWV3cygpO1xuXHRcdHRoaXMuc2F2ZVByb3BvcnRpb25zKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUge0BsaW5rIElWaWV3IHZpZXd9J3Mgc2l6ZSBwcmV2aW91c2x5IHRvIGJlaW5nIGhpZGRlbi5cblx0ICpcblx0ICogQHBhcmFtIGluZGV4IFRoZSB7QGxpbmsgSVZpZXcgdmlld30gaW5kZXguXG5cdCAqL1xuXHRnZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUoaW5kZXg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW5kZXggb3V0IG9mIGJvdW5kcycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdHJldHVybiB2aWV3SXRlbS5jYWNoZWRWaXNpYmxlU2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKlxuXHQgKiBAcGFyYW0gc2l6ZSBUaGUgZW50aXJlIHNpemUgb2YgdGhlIHtAbGluayBTcGxpdFZpZXd9LlxuXHQgKiBAcGFyYW0gbGF5b3V0Q29udGV4dCBBbiBvcHRpb25hbCBsYXlvdXQgY29udGV4dCB0byBwYXNzIGFsb25nIHRvIHtAbGluayBJVmlldyB2aWV3c30uXG5cdCAqL1xuXHRsYXlvdXQoc2l6ZTogbnVtYmVyLCBsYXlvdXRDb250ZXh0PzogVExheW91dENvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c1NpemUgPSBNYXRoLm1heCh0aGlzLnNpemUsIHRoaXMuX2NvbnRlbnRTaXplKTtcblx0XHR0aGlzLnNpemUgPSBzaXplO1xuXHRcdHRoaXMubGF5b3V0Q29udGV4dCA9IGxheW91dENvbnRleHQ7XG5cblx0XHRpZiAoIXRoaXMucHJvcG9ydGlvbnMpIHtcblx0XHRcdGNvbnN0IGluZGV4ZXMgPSByYW5nZSh0aGlzLnZpZXdJdGVtcy5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbG93UHJpb3JpdHlJbmRleGVzID0gaW5kZXhlcy5maWx0ZXIoaSA9PiB0aGlzLnZpZXdJdGVtc1tpXS5wcmlvcml0eSA9PT0gTGF5b3V0UHJpb3JpdHkuTG93KTtcblx0XHRcdGNvbnN0IGhpZ2hQcmlvcml0eUluZGV4ZXMgPSBpbmRleGVzLmZpbHRlcihpID0+IHRoaXMudmlld0l0ZW1zW2ldLnByaW9yaXR5ID09PSBMYXlvdXRQcmlvcml0eS5IaWdoKTtcblxuXHRcdFx0dGhpcy5yZXNpemUodGhpcy52aWV3SXRlbXMubGVuZ3RoIC0gMSwgc2l6ZSAtIHByZXZpb3VzU2l6ZSwgdW5kZWZpbmVkLCBsb3dQcmlvcml0eUluZGV4ZXMsIGhpZ2hQcmlvcml0eUluZGV4ZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgdG90YWwgPSAwO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudmlld0l0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnZpZXdJdGVtc1tpXTtcblx0XHRcdFx0Y29uc3QgcHJvcG9ydGlvbiA9IHRoaXMucHJvcG9ydGlvbnNbaV07XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBwcm9wb3J0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHRvdGFsICs9IHByb3BvcnRpb247XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2l6ZSAtPSBpdGVtLnNpemU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnZpZXdJdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3SXRlbXNbaV07XG5cdFx0XHRcdGNvbnN0IHByb3BvcnRpb24gPSB0aGlzLnByb3BvcnRpb25zW2ldO1xuXG5cdFx0XHRcdGlmICh0eXBlb2YgcHJvcG9ydGlvbiA9PT0gJ251bWJlcicgJiYgdG90YWwgPiAwKSB7XG5cdFx0XHRcdFx0aXRlbS5zaXplID0gY2xhbXAoTWF0aC5yb3VuZChwcm9wb3J0aW9uICogc2l6ZSAvIHRvdGFsKSwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRpc3RyaWJ1dGVFbXB0eVNwYWNlKCk7XG5cdFx0dGhpcy5sYXlvdXRWaWV3cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlUHJvcG9ydGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucHJvcG9ydGlvbmFsTGF5b3V0ICYmIHRoaXMuX2NvbnRlbnRTaXplID4gMCkge1xuXHRcdFx0dGhpcy5wcm9wb3J0aW9ucyA9IHRoaXMudmlld0l0ZW1zLm1hcCh2ID0+IHYucHJvcG9ydGlvbmFsTGF5b3V0ICYmIHYudmlzaWJsZSA/IHYuc2l6ZSAvIHRoaXMuX2NvbnRlbnRTaXplIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uU2FzaFN0YXJ0KHsgc2FzaCwgc3RhcnQsIGFsdCB9OiBJU2FzaEV2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMudmlld0l0ZW1zKSB7XG5cdFx0XHRpdGVtLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuc2FzaEl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0uc2FzaCA9PT0gc2FzaCk7XG5cblx0XHQvLyBUaGlzIHdheSwgd2UgY2FuIHByZXNzIEFsdCB3aGlsZSB3ZSByZXNpemUgYSBzYXNoLCBtYWNPUyBzdHlsZSFcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0YWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWwub3duZXJEb2N1bWVudC5ib2R5LCAna2V5ZG93bicsIGUgPT4gcmVzZXRTYXNoRHJhZ1N0YXRlKHRoaXMuc2FzaERyYWdTdGF0ZSEuY3VycmVudCwgZS5hbHRLZXkpKSxcblx0XHRcdGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsLm93bmVyRG9jdW1lbnQuYm9keSwgJ2tleXVwJywgKCkgPT4gcmVzZXRTYXNoRHJhZ1N0YXRlKHRoaXMuc2FzaERyYWdTdGF0ZSEuY3VycmVudCwgZmFsc2UpKVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXNldFNhc2hEcmFnU3RhdGUgPSAoc3RhcnQ6IG51bWJlciwgYWx0OiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBzaXplcyA9IHRoaXMudmlld0l0ZW1zLm1hcChpID0+IGkuc2l6ZSk7XG5cdFx0XHRsZXQgbWluRGVsdGEgPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG5cdFx0XHRsZXQgbWF4RGVsdGEgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cblx0XHRcdGlmICh0aGlzLmludmVyc2VBbHRCZWhhdmlvcikge1xuXHRcdFx0XHRhbHQgPSAhYWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWx0KSB7XG5cdFx0XHRcdC8vIFdoZW4gd2UncmUgdXNpbmcgdGhlIGxhc3Qgc2FzaCB3aXRoIEFsdCwgd2UncmUgcmVzaXppbmdcblx0XHRcdFx0Ly8gdGhlIHZpZXcgdG8gdGhlIGxlZnQvdXAsIGluc3RlYWQgb2YgcmlnaHQvZG93biBhcyB1c3VhbFxuXHRcdFx0XHQvLyBUaHVzLCB3ZSBtdXN0IGRvIHRoZSBpbnZlcnNlIG9mIHRoZSB1c3VhbFxuXHRcdFx0XHRjb25zdCBpc0xhc3RTYXNoID0gaW5kZXggPT09IHRoaXMuc2FzaEl0ZW1zLmxlbmd0aCAtIDE7XG5cblx0XHRcdFx0aWYgKGlzTGFzdFNhc2gpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW2luZGV4XTtcblx0XHRcdFx0XHRtaW5EZWx0YSA9ICh2aWV3SXRlbS5taW5pbXVtU2l6ZSAtIHZpZXdJdGVtLnNpemUpIC8gMjtcblx0XHRcdFx0XHRtYXhEZWx0YSA9ICh2aWV3SXRlbS5tYXhpbXVtU2l6ZSAtIHZpZXdJdGVtLnNpemUpIC8gMjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW2luZGV4ICsgMV07XG5cdFx0XHRcdFx0bWluRGVsdGEgPSAodmlld0l0ZW0uc2l6ZSAtIHZpZXdJdGVtLm1heGltdW1TaXplKSAvIDI7XG5cdFx0XHRcdFx0bWF4RGVsdGEgPSAodmlld0l0ZW0uc2l6ZSAtIHZpZXdJdGVtLm1pbmltdW1TaXplKSAvIDI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHNuYXBCZWZvcmU6IElTYXNoRHJhZ1NuYXBTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzbmFwQWZ0ZXI6IElTYXNoRHJhZ1NuYXBTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCFhbHQpIHtcblx0XHRcdFx0Y29uc3QgdXBJbmRleGVzID0gcmFuZ2UoaW5kZXgsIC0xKTtcblx0XHRcdFx0Y29uc3QgZG93bkluZGV4ZXMgPSByYW5nZShpbmRleCArIDEsIHRoaXMudmlld0l0ZW1zLmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IG1pbkRlbHRhVXAgPSB1cEluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHRoaXMudmlld0l0ZW1zW2ldLm1pbmltdW1TaXplIC0gc2l6ZXNbaV0pLCAwKTtcblx0XHRcdFx0Y29uc3QgbWF4RGVsdGFVcCA9IHVwSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAodGhpcy52aWV3SXRlbXNbaV0udmlld01heGltdW1TaXplIC0gc2l6ZXNbaV0pLCAwKTtcblx0XHRcdFx0Y29uc3QgbWF4RGVsdGFEb3duID0gZG93bkluZGV4ZXMubGVuZ3RoID09PSAwID8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIDogZG93bkluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHNpemVzW2ldIC0gdGhpcy52aWV3SXRlbXNbaV0ubWluaW11bVNpemUpLCAwKTtcblx0XHRcdFx0Y29uc3QgbWluRGVsdGFEb3duID0gZG93bkluZGV4ZXMubGVuZ3RoID09PSAwID8gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZIDogZG93bkluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHNpemVzW2ldIC0gdGhpcy52aWV3SXRlbXNbaV0udmlld01heGltdW1TaXplKSwgMCk7XG5cdFx0XHRcdGNvbnN0IG1pbkRlbHRhID0gTWF0aC5tYXgobWluRGVsdGFVcCwgbWluRGVsdGFEb3duKTtcblx0XHRcdFx0Y29uc3QgbWF4RGVsdGEgPSBNYXRoLm1pbihtYXhEZWx0YURvd24sIG1heERlbHRhVXApO1xuXHRcdFx0XHRjb25zdCBzbmFwQmVmb3JlSW5kZXggPSB0aGlzLmZpbmRGaXJzdFNuYXBJbmRleCh1cEluZGV4ZXMpO1xuXHRcdFx0XHRjb25zdCBzbmFwQWZ0ZXJJbmRleCA9IHRoaXMuZmluZEZpcnN0U25hcEluZGV4KGRvd25JbmRleGVzKTtcblxuXHRcdFx0XHRpZiAodHlwZW9mIHNuYXBCZWZvcmVJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW3NuYXBCZWZvcmVJbmRleF07XG5cdFx0XHRcdFx0Y29uc3QgaGFsZlNpemUgPSBNYXRoLmZsb29yKHZpZXdJdGVtLnZpZXdNaW5pbXVtU2l6ZSAvIDIpO1xuXG5cdFx0XHRcdFx0c25hcEJlZm9yZSA9IHtcblx0XHRcdFx0XHRcdGluZGV4OiBzbmFwQmVmb3JlSW5kZXgsXG5cdFx0XHRcdFx0XHRsaW1pdERlbHRhOiB2aWV3SXRlbS52aXNpYmxlID8gbWluRGVsdGEgLSBoYWxmU2l6ZSA6IG1pbkRlbHRhICsgaGFsZlNpemUsXG5cdFx0XHRcdFx0XHRzaXplOiB2aWV3SXRlbS5zaXplXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2Ygc25hcEFmdGVySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSB0aGlzLnZpZXdJdGVtc1tzbmFwQWZ0ZXJJbmRleF07XG5cdFx0XHRcdFx0Y29uc3QgaGFsZlNpemUgPSBNYXRoLmZsb29yKHZpZXdJdGVtLnZpZXdNaW5pbXVtU2l6ZSAvIDIpO1xuXG5cdFx0XHRcdFx0c25hcEFmdGVyID0ge1xuXHRcdFx0XHRcdFx0aW5kZXg6IHNuYXBBZnRlckluZGV4LFxuXHRcdFx0XHRcdFx0bGltaXREZWx0YTogdmlld0l0ZW0udmlzaWJsZSA/IG1heERlbHRhICsgaGFsZlNpemUgOiBtYXhEZWx0YSAtIGhhbGZTaXplLFxuXHRcdFx0XHRcdFx0c2l6ZTogdmlld0l0ZW0uc2l6ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zYXNoRHJhZ1N0YXRlID0geyBzdGFydCwgY3VycmVudDogc3RhcnQsIGluZGV4LCBzaXplcywgbWluRGVsdGEsIG1heERlbHRhLCBhbHQsIHNuYXBCZWZvcmUsIHNuYXBBZnRlciwgZGlzcG9zYWJsZSB9O1xuXHRcdH07XG5cblx0XHRyZXNldFNhc2hEcmFnU3RhdGUoc3RhcnQsIGFsdCk7XG5cdH1cblxuXHRwcml2YXRlIG9uU2FzaENoYW5nZSh7IGN1cnJlbnQgfTogSVNhc2hFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgaW5kZXgsIHN0YXJ0LCBzaXplcywgYWx0LCBtaW5EZWx0YSwgbWF4RGVsdGEsIHNuYXBCZWZvcmUsIHNuYXBBZnRlciB9ID0gdGhpcy5zYXNoRHJhZ1N0YXRlITtcblx0XHR0aGlzLnNhc2hEcmFnU3RhdGUhLmN1cnJlbnQgPSBjdXJyZW50O1xuXG5cdFx0Y29uc3QgZGVsdGEgPSBjdXJyZW50IC0gc3RhcnQ7XG5cdFx0Y29uc3QgbmV3RGVsdGEgPSB0aGlzLnJlc2l6ZShpbmRleCwgZGVsdGEsIHNpemVzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbWluRGVsdGEsIG1heERlbHRhLCBzbmFwQmVmb3JlLCBzbmFwQWZ0ZXIpO1xuXG5cdFx0aWYgKGFsdCkge1xuXHRcdFx0Y29uc3QgaXNMYXN0U2FzaCA9IGluZGV4ID09PSB0aGlzLnNhc2hJdGVtcy5sZW5ndGggLSAxO1xuXHRcdFx0Y29uc3QgbmV3U2l6ZXMgPSB0aGlzLnZpZXdJdGVtcy5tYXAoaSA9PiBpLnNpemUpO1xuXHRcdFx0Y29uc3Qgdmlld0l0ZW1JbmRleCA9IGlzTGFzdFNhc2ggPyBpbmRleCA6IGluZGV4ICsgMTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbdmlld0l0ZW1JbmRleF07XG5cdFx0XHRjb25zdCBuZXdNaW5EZWx0YSA9IHZpZXdJdGVtLnNpemUgLSB2aWV3SXRlbS5tYXhpbXVtU2l6ZTtcblx0XHRcdGNvbnN0IG5ld01heERlbHRhID0gdmlld0l0ZW0uc2l6ZSAtIHZpZXdJdGVtLm1pbmltdW1TaXplO1xuXHRcdFx0Y29uc3QgcmVzaXplSW5kZXggPSBpc0xhc3RTYXNoID8gaW5kZXggLSAxIDogaW5kZXggKyAxO1xuXG5cdFx0XHR0aGlzLnJlc2l6ZShyZXNpemVJbmRleCwgLW5ld0RlbHRhLCBuZXdTaXplcywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG5ld01pbkRlbHRhLCBuZXdNYXhEZWx0YSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXN0cmlidXRlRW1wdHlTcGFjZSgpO1xuXHRcdHRoaXMubGF5b3V0Vmlld3MoKTtcblx0fVxuXG5cdHByaXZhdGUgb25TYXNoRW5kKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNhc2hDaGFuZ2UuZmlyZShpbmRleCk7XG5cdFx0dGhpcy5zYXNoRHJhZ1N0YXRlIS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnNhdmVQcm9wb3J0aW9ucygpO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMudmlld0l0ZW1zKSB7XG5cdFx0XHRpdGVtLmVuYWJsZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25WaWV3Q2hhbmdlKGl0ZW06IFZpZXdJdGVtPFRMYXlvdXRDb250ZXh0LCBUVmlldz4sIHNpemU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3SXRlbXMuaW5kZXhPZihpdGVtKTtcblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2l6ZSA9IHR5cGVvZiBzaXplID09PSAnbnVtYmVyJyA/IHNpemUgOiBpdGVtLnNpemU7XG5cdFx0c2l6ZSA9IGNsYW1wKHNpemUsIGl0ZW0ubWluaW11bVNpemUsIGl0ZW0ubWF4aW11bVNpemUpO1xuXG5cdFx0aWYgKHRoaXMuaW52ZXJzZUFsdEJlaGF2aW9yICYmIGluZGV4ID4gMCkge1xuXHRcdFx0Ly8gSW4gdGhpcyBjYXNlLCB3ZSB3YW50IHRoZSB2aWV3IHRvIGdyb3cgb3Igc2hyaW5rIGJvdGggc2lkZXMgZXF1YWxseVxuXHRcdFx0Ly8gc28gd2UganVzdCByZXNpemUgdGhlIFwibGVmdFwiIHNpZGUgYnkgaGFsZiBhbmQgbGV0IGByZXNpemVgIGRvIHRoZSBjbGFtcGluZyBtYWdpY1xuXHRcdFx0dGhpcy5yZXNpemUoaW5kZXggLSAxLCBNYXRoLmZsb29yKChpdGVtLnNpemUgLSBzaXplKSAvIDIpKTtcblx0XHRcdHRoaXMuZGlzdHJpYnV0ZUVtcHR5U3BhY2UoKTtcblx0XHRcdHRoaXMubGF5b3V0Vmlld3MoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aXRlbS5zaXplID0gc2l6ZTtcblx0XHRcdHRoaXMucmVsYXlvdXQoW2luZGV4XSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzaXplIGEge0BsaW5rIElWaWV3IHZpZXd9IHdpdGhpbiB0aGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSBpbmRleCBUaGUge0BsaW5rIElWaWV3IHZpZXd9IGluZGV4LlxuXHQgKiBAcGFyYW0gc2l6ZSBUaGUge0BsaW5rIElWaWV3IHZpZXd9IHNpemUuXG5cdCAqL1xuXHRyZXNpemVWaWV3KGluZGV4OiBudW1iZXIsIHNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGUgIT09IFN0YXRlLklkbGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FudCBtb2RpZnkgc3BsaXR2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGF0ZSA9IFN0YXRlLkJ1c3k7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5kZXhlcyA9IHJhbmdlKHRoaXMudmlld0l0ZW1zLmxlbmd0aCkuZmlsdGVyKGkgPT4gaSAhPT0gaW5kZXgpO1xuXHRcdFx0Y29uc3QgbG93UHJpb3JpdHlJbmRleGVzID0gWy4uLmluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5LkxvdyksIGluZGV4XTtcblx0XHRcdGNvbnN0IGhpZ2hQcmlvcml0eUluZGV4ZXMgPSBpbmRleGVzLmZpbHRlcihpID0+IHRoaXMudmlld0l0ZW1zW2ldLnByaW9yaXR5ID09PSBMYXlvdXRQcmlvcml0eS5IaWdoKTtcblxuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMudmlld0l0ZW1zW2luZGV4XTtcblx0XHRcdHNpemUgPSBNYXRoLnJvdW5kKHNpemUpO1xuXHRcdFx0c2l6ZSA9IGNsYW1wKHNpemUsIGl0ZW0ubWluaW11bVNpemUsIE1hdGgubWluKGl0ZW0ubWF4aW11bVNpemUsIHRoaXMuc2l6ZSkpO1xuXG5cdFx0XHRpdGVtLnNpemUgPSBzaXplO1xuXHRcdFx0dGhpcy5yZWxheW91dChsb3dQcmlvcml0eUluZGV4ZXMsIGhpZ2hQcmlvcml0eUluZGV4ZXMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gU3RhdGUuSWRsZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIGFsbCBvdGhlciB7QGxpbmsgSVZpZXcgdmlld3N9IGFyZSBhdCB0aGVpciBtaW5pbXVtIHNpemUuXG5cdCAqL1xuXHRpc1ZpZXdFeHBhbmRlZChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnZpZXdJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdGlmIChpdGVtICE9PSB0aGlzLnZpZXdJdGVtc1tpbmRleF0gJiYgaXRlbS5zaXplID4gaXRlbS5taW5pbXVtU2l6ZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogRGlzdHJpYnV0ZSB0aGUgZW50aXJlIHtAbGluayBTcGxpdFZpZXd9IHNpemUgYW1vbmcgYWxsIHtAbGluayBJVmlldyB2aWV3c30uXG5cdCAqL1xuXHRkaXN0cmlidXRlVmlld1NpemVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZsZXhpYmxlVmlld0l0ZW1zOiBWaWV3SXRlbTxUTGF5b3V0Q29udGV4dCwgVFZpZXc+W10gPSBbXTtcblx0XHRsZXQgZmxleGlibGVTaXplID0gMDtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLnZpZXdJdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0ubWF4aW11bVNpemUgLSBpdGVtLm1pbmltdW1TaXplID4gMCkge1xuXHRcdFx0XHRmbGV4aWJsZVZpZXdJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRmbGV4aWJsZVNpemUgKz0gaXRlbS5zaXplO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNpemUgPSBNYXRoLmZsb29yKGZsZXhpYmxlU2l6ZSAvIGZsZXhpYmxlVmlld0l0ZW1zLmxlbmd0aCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZmxleGlibGVWaWV3SXRlbXMpIHtcblx0XHRcdGl0ZW0uc2l6ZSA9IGNsYW1wKHNpemUsIGl0ZW0ubWluaW11bVNpemUsIGl0ZW0ubWF4aW11bVNpemUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluZGV4ZXMgPSByYW5nZSh0aGlzLnZpZXdJdGVtcy5sZW5ndGgpO1xuXHRcdGNvbnN0IGxvd1ByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5Lkxvdyk7XG5cdFx0Y29uc3QgaGlnaFByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5LkhpZ2gpO1xuXG5cdFx0dGhpcy5yZWxheW91dChsb3dQcmlvcml0eUluZGV4ZXMsIGhpZ2hQcmlvcml0eUluZGV4ZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHNpemUgb2YgYSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRnZXRWaWV3U2l6ZShpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtc1tpbmRleF0uc2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgZG9BZGRWaWV3KHZpZXc6IFRWaWV3LCBzaXplOiBudW1iZXIgfCBTaXppbmcsIGluZGV4ID0gdGhpcy52aWV3SXRlbXMubGVuZ3RoLCBza2lwTGF5b3V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlICE9PSBTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbnQgbW9kaWZ5IHNwbGl0dmlldycpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdGUgPSBTdGF0ZS5CdXN5O1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIEFkZCB2aWV3XG5cdFx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuc3BsaXQtdmlldy12aWV3Jyk7XG5cblx0XHRcdGlmIChpbmRleCA9PT0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudmlld0NvbnRhaW5lci5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52aWV3Q29udGFpbmVyLmluc2VydEJlZm9yZShjb250YWluZXIsIHRoaXMudmlld0NvbnRhaW5lci5jaGlsZHJlbi5pdGVtKGluZGV4KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9uQ2hhbmdlRGlzcG9zYWJsZSA9IHZpZXcub25EaWRDaGFuZ2Uoc2l6ZSA9PiB0aGlzLm9uVmlld0NoYW5nZShpdGVtLCBzaXplKSk7XG5cdFx0XHRjb25zdCBjb250YWluZXJEaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IGNvbnRhaW5lci5yZW1vdmUoKSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKG9uQ2hhbmdlRGlzcG9zYWJsZSwgY29udGFpbmVyRGlzcG9zYWJsZSk7XG5cblx0XHRcdGxldCB2aWV3U2l6ZTogVmlld0l0ZW1TaXplO1xuXG5cdFx0XHRpZiAodHlwZW9mIHNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHZpZXdTaXplID0gc2l6ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzaXplLnR5cGUgPT09ICdhdXRvJykge1xuXHRcdFx0XHRcdGlmICh0aGlzLmFyZVZpZXdzRGlzdHJpYnV0ZWQoKSkge1xuXHRcdFx0XHRcdFx0c2l6ZSA9IHsgdHlwZTogJ2Rpc3RyaWJ1dGUnIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNpemUgPSB7IHR5cGU6ICdzcGxpdCcsIGluZGV4OiBzaXplLmluZGV4IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHNpemUudHlwZSA9PT0gJ3NwbGl0Jykge1xuXHRcdFx0XHRcdHZpZXdTaXplID0gdGhpcy5nZXRWaWV3U2l6ZShzaXplLmluZGV4KSAvIDI7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2l6ZS50eXBlID09PSAnaW52aXNpYmxlJykge1xuXHRcdFx0XHRcdHZpZXdTaXplID0geyBjYWNoZWRWaXNpYmxlU2l6ZTogc2l6ZS5jYWNoZWRWaXNpYmxlU2l6ZSB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZpZXdTaXplID0gdmlldy5taW5pbXVtU2l6ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUxcblx0XHRcdFx0PyBuZXcgVmVydGljYWxWaWV3SXRlbShjb250YWluZXIsIHZpZXcsIHZpZXdTaXplLCBkaXNwb3NhYmxlKVxuXHRcdFx0XHQ6IG5ldyBIb3Jpem9udGFsVmlld0l0ZW0oY29udGFpbmVyLCB2aWV3LCB2aWV3U2l6ZSwgZGlzcG9zYWJsZSk7XG5cblx0XHRcdHRoaXMudmlld0l0ZW1zLnNwbGljZShpbmRleCwgMCwgaXRlbSk7XG5cblx0XHRcdC8vIEFkZCBzYXNoXG5cdFx0XHRpZiAodGhpcy52aWV3SXRlbXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBvcHRzID0geyBvcnRob2dvbmFsU3RhcnRTYXNoOiB0aGlzLm9ydGhvZ29uYWxTdGFydFNhc2gsIG9ydGhvZ29uYWxFbmRTYXNoOiB0aGlzLm9ydGhvZ29uYWxFbmRTYXNoIH07XG5cblx0XHRcdFx0Y29uc3Qgc2FzaCA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMXG5cdFx0XHRcdFx0PyBuZXcgU2FzaCh0aGlzLnNhc2hDb250YWluZXIsIHsgZ2V0SG9yaXpvbnRhbFNhc2hUb3A6IHMgPT4gdGhpcy5nZXRTYXNoUG9zaXRpb24ocyksIGdldEhvcml6b250YWxTYXNoV2lkdGg6IHRoaXMuZ2V0U2FzaE9ydGhvZ29uYWxTaXplIH0sIHsgLi4ub3B0cywgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwgfSlcblx0XHRcdFx0XHQ6IG5ldyBTYXNoKHRoaXMuc2FzaENvbnRhaW5lciwgeyBnZXRWZXJ0aWNhbFNhc2hMZWZ0OiBzID0+IHRoaXMuZ2V0U2FzaFBvc2l0aW9uKHMpLCBnZXRWZXJ0aWNhbFNhc2hIZWlnaHQ6IHRoaXMuZ2V0U2FzaE9ydGhvZ29uYWxTaXplIH0sIHsgLi4ub3B0cywgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMIH0pO1xuXG5cdFx0XHRcdGNvbnN0IHNhc2hFdmVudE1hcHBlciA9IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMXG5cdFx0XHRcdFx0PyAoZTogSUJhc2VTYXNoRXZlbnQpID0+ICh7IHNhc2gsIHN0YXJ0OiBlLnN0YXJ0WSwgY3VycmVudDogZS5jdXJyZW50WSwgYWx0OiBlLmFsdEtleSB9KVxuXHRcdFx0XHRcdDogKGU6IElCYXNlU2FzaEV2ZW50KSA9PiAoeyBzYXNoLCBzdGFydDogZS5zdGFydFgsIGN1cnJlbnQ6IGUuY3VycmVudFgsIGFsdDogZS5hbHRLZXkgfSk7XG5cblx0XHRcdFx0Y29uc3Qgb25TdGFydCA9IEV2ZW50Lm1hcChzYXNoLm9uRGlkU3RhcnQsIHNhc2hFdmVudE1hcHBlcik7XG5cdFx0XHRcdGNvbnN0IG9uU3RhcnREaXNwb3NhYmxlID0gb25TdGFydCh0aGlzLm9uU2FzaFN0YXJ0LCB0aGlzKTtcblx0XHRcdFx0Y29uc3Qgb25DaGFuZ2UgPSBFdmVudC5tYXAoc2FzaC5vbkRpZENoYW5nZSwgc2FzaEV2ZW50TWFwcGVyKTtcblx0XHRcdFx0Y29uc3Qgb25DaGFuZ2VEaXNwb3NhYmxlID0gb25DaGFuZ2UodGhpcy5vblNhc2hDaGFuZ2UsIHRoaXMpO1xuXHRcdFx0XHRjb25zdCBvbkVuZCA9IEV2ZW50Lm1hcChzYXNoLm9uRGlkRW5kLCAoKSA9PiB0aGlzLnNhc2hJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLnNhc2ggPT09IHNhc2gpKTtcblx0XHRcdFx0Y29uc3Qgb25FbmREaXNwb3NhYmxlID0gb25FbmQodGhpcy5vblNhc2hFbmQsIHRoaXMpO1xuXG5cdFx0XHRcdGNvbnN0IG9uRGlkUmVzZXREaXNwb3NhYmxlID0gc2FzaC5vbkRpZFJlc2V0KCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuc2FzaEl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0uc2FzaCA9PT0gc2FzaCk7XG5cdFx0XHRcdFx0Y29uc3QgdXBJbmRleGVzID0gcmFuZ2UoaW5kZXgsIC0xKTtcblx0XHRcdFx0XHRjb25zdCBkb3duSW5kZXhlcyA9IHJhbmdlKGluZGV4ICsgMSwgdGhpcy52aWV3SXRlbXMubGVuZ3RoKTtcblx0XHRcdFx0XHRjb25zdCBzbmFwQmVmb3JlSW5kZXggPSB0aGlzLmZpbmRGaXJzdFNuYXBJbmRleCh1cEluZGV4ZXMpO1xuXHRcdFx0XHRcdGNvbnN0IHNuYXBBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RTbmFwSW5kZXgoZG93bkluZGV4ZXMpO1xuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBzbmFwQmVmb3JlSW5kZXggPT09ICdudW1iZXInICYmICF0aGlzLnZpZXdJdGVtc1tzbmFwQmVmb3JlSW5kZXhdLnZpc2libGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHNuYXBBZnRlckluZGV4ID09PSAnbnVtYmVyJyAmJiAhdGhpcy52aWV3SXRlbXNbc25hcEFmdGVySW5kZXhdLnZpc2libGUpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNhc2hSZXNldC5maXJlKGluZGV4KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZShvblN0YXJ0RGlzcG9zYWJsZSwgb25DaGFuZ2VEaXNwb3NhYmxlLCBvbkVuZERpc3Bvc2FibGUsIG9uRGlkUmVzZXREaXNwb3NhYmxlLCBzYXNoKTtcblx0XHRcdFx0Y29uc3Qgc2FzaEl0ZW06IElTYXNoSXRlbSA9IHsgc2FzaCwgZGlzcG9zYWJsZSB9O1xuXG5cdFx0XHRcdHRoaXMuc2FzaEl0ZW1zLnNwbGljZShpbmRleCAtIDEsIDAsIHNhc2hJdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHZpZXcuZWxlbWVudCk7XG5cblx0XHRcdGxldCBoaWdoUHJpb3JpdHlJbmRleGVzOiBudW1iZXJbXSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHR5cGVvZiBzaXplICE9PSAnbnVtYmVyJyAmJiBzaXplLnR5cGUgPT09ICdzcGxpdCcpIHtcblx0XHRcdFx0aGlnaFByaW9yaXR5SW5kZXhlcyA9IFtzaXplLmluZGV4XTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFza2lwTGF5b3V0KSB7XG5cdFx0XHRcdHRoaXMucmVsYXlvdXQoW2luZGV4XSwgaGlnaFByaW9yaXR5SW5kZXhlcyk7XG5cdFx0XHR9XG5cblxuXHRcdFx0aWYgKCFza2lwTGF5b3V0ICYmIHR5cGVvZiBzaXplICE9PSAnbnVtYmVyJyAmJiBzaXplLnR5cGUgPT09ICdkaXN0cmlidXRlJykge1xuXHRcdFx0XHR0aGlzLmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHRcdH1cblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gU3RhdGUuSWRsZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbGF5b3V0KGxvd1ByaW9yaXR5SW5kZXhlcz86IG51bWJlcltdLCBoaWdoUHJpb3JpdHlJbmRleGVzPzogbnVtYmVyW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50U2l6ZSA9IHRoaXMudmlld0l0ZW1zLnJlZHVjZSgociwgaSkgPT4gciArIGkuc2l6ZSwgMCk7XG5cblx0XHR0aGlzLnJlc2l6ZSh0aGlzLnZpZXdJdGVtcy5sZW5ndGggLSAxLCB0aGlzLnNpemUgLSBjb250ZW50U2l6ZSwgdW5kZWZpbmVkLCBsb3dQcmlvcml0eUluZGV4ZXMsIGhpZ2hQcmlvcml0eUluZGV4ZXMpO1xuXHRcdHRoaXMuZGlzdHJpYnV0ZUVtcHR5U3BhY2UoKTtcblx0XHR0aGlzLmxheW91dFZpZXdzKCk7XG5cdFx0dGhpcy5zYXZlUHJvcG9ydGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzaXplKFxuXHRcdGluZGV4OiBudW1iZXIsXG5cdFx0ZGVsdGE6IG51bWJlcixcblx0XHRzaXplcyA9IHRoaXMudmlld0l0ZW1zLm1hcChpID0+IGkuc2l6ZSksXG5cdFx0bG93UHJpb3JpdHlJbmRleGVzPzogbnVtYmVyW10sXG5cdFx0aGlnaFByaW9yaXR5SW5kZXhlcz86IG51bWJlcltdLFxuXHRcdG92ZXJsb2FkTWluRGVsdGE6IG51bWJlciA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWSxcblx0XHRvdmVybG9hZE1heERlbHRhOiBudW1iZXIgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0c25hcEJlZm9yZT86IElTYXNoRHJhZ1NuYXBTdGF0ZSxcblx0XHRzbmFwQWZ0ZXI/OiBJU2FzaERyYWdTbmFwU3RhdGVcblx0KTogbnVtYmVyIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlld0l0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBJbmRleGVzID0gcmFuZ2UoaW5kZXgsIC0xKTtcblx0XHRjb25zdCBkb3duSW5kZXhlcyA9IHJhbmdlKGluZGV4ICsgMSwgdGhpcy52aWV3SXRlbXMubGVuZ3RoKTtcblxuXHRcdGlmIChoaWdoUHJpb3JpdHlJbmRleGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGhpZ2hQcmlvcml0eUluZGV4ZXMpIHtcblx0XHRcdFx0cHVzaFRvU3RhcnQodXBJbmRleGVzLCBpbmRleCk7XG5cdFx0XHRcdHB1c2hUb1N0YXJ0KGRvd25JbmRleGVzLCBpbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxvd1ByaW9yaXR5SW5kZXhlcykge1xuXHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBsb3dQcmlvcml0eUluZGV4ZXMpIHtcblx0XHRcdFx0cHVzaFRvRW5kKHVwSW5kZXhlcywgaW5kZXgpO1xuXHRcdFx0XHRwdXNoVG9FbmQoZG93bkluZGV4ZXMsIGluZGV4KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB1cEl0ZW1zID0gdXBJbmRleGVzLm1hcChpID0+IHRoaXMudmlld0l0ZW1zW2ldKTtcblx0XHRjb25zdCB1cFNpemVzID0gdXBJbmRleGVzLm1hcChpID0+IHNpemVzW2ldKTtcblxuXHRcdGNvbnN0IGRvd25JdGVtcyA9IGRvd25JbmRleGVzLm1hcChpID0+IHRoaXMudmlld0l0ZW1zW2ldKTtcblx0XHRjb25zdCBkb3duU2l6ZXMgPSBkb3duSW5kZXhlcy5tYXAoaSA9PiBzaXplc1tpXSk7XG5cblx0XHRjb25zdCBtaW5EZWx0YVVwID0gdXBJbmRleGVzLnJlZHVjZSgociwgaSkgPT4gciArICh0aGlzLnZpZXdJdGVtc1tpXS5taW5pbXVtU2l6ZSAtIHNpemVzW2ldKSwgMCk7XG5cdFx0Y29uc3QgbWF4RGVsdGFVcCA9IHVwSW5kZXhlcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyAodGhpcy52aWV3SXRlbXNbaV0ubWF4aW11bVNpemUgLSBzaXplc1tpXSksIDApO1xuXHRcdGNvbnN0IG1heERlbHRhRG93biA9IGRvd25JbmRleGVzLmxlbmd0aCA9PT0gMCA/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSA6IGRvd25JbmRleGVzLnJlZHVjZSgociwgaSkgPT4gciArIChzaXplc1tpXSAtIHRoaXMudmlld0l0ZW1zW2ldLm1pbmltdW1TaXplKSwgMCk7XG5cdFx0Y29uc3QgbWluRGVsdGFEb3duID0gZG93bkluZGV4ZXMubGVuZ3RoID09PSAwID8gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZIDogZG93bkluZGV4ZXMucmVkdWNlKChyLCBpKSA9PiByICsgKHNpemVzW2ldIC0gdGhpcy52aWV3SXRlbXNbaV0ubWF4aW11bVNpemUpLCAwKTtcblx0XHRjb25zdCBtaW5EZWx0YSA9IE1hdGgubWF4KG1pbkRlbHRhVXAsIG1pbkRlbHRhRG93biwgb3ZlcmxvYWRNaW5EZWx0YSk7XG5cdFx0Y29uc3QgbWF4RGVsdGEgPSBNYXRoLm1pbihtYXhEZWx0YURvd24sIG1heERlbHRhVXAsIG92ZXJsb2FkTWF4RGVsdGEpO1xuXG5cdFx0bGV0IHNuYXBwZWQgPSBmYWxzZTtcblxuXHRcdGlmIChzbmFwQmVmb3JlKSB7XG5cdFx0XHRjb25zdCBzbmFwVmlldyA9IHRoaXMudmlld0l0ZW1zW3NuYXBCZWZvcmUuaW5kZXhdO1xuXHRcdFx0Y29uc3QgdmlzaWJsZSA9IGRlbHRhID49IHNuYXBCZWZvcmUubGltaXREZWx0YTtcblx0XHRcdHNuYXBwZWQgPSB2aXNpYmxlICE9PSBzbmFwVmlldy52aXNpYmxlO1xuXHRcdFx0c25hcFZpZXcuc2V0VmlzaWJsZSh2aXNpYmxlLCBzbmFwQmVmb3JlLnNpemUpO1xuXHRcdH1cblxuXHRcdGlmICghc25hcHBlZCAmJiBzbmFwQWZ0ZXIpIHtcblx0XHRcdGNvbnN0IHNuYXBWaWV3ID0gdGhpcy52aWV3SXRlbXNbc25hcEFmdGVyLmluZGV4XTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSBkZWx0YSA8IHNuYXBBZnRlci5saW1pdERlbHRhO1xuXHRcdFx0c25hcHBlZCA9IHZpc2libGUgIT09IHNuYXBWaWV3LnZpc2libGU7XG5cdFx0XHRzbmFwVmlldy5zZXRWaXNpYmxlKHZpc2libGUsIHNuYXBBZnRlci5zaXplKTtcblx0XHR9XG5cblx0XHRpZiAoc25hcHBlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzaXplKGluZGV4LCBkZWx0YSwgc2l6ZXMsIGxvd1ByaW9yaXR5SW5kZXhlcywgaGlnaFByaW9yaXR5SW5kZXhlcywgb3ZlcmxvYWRNaW5EZWx0YSwgb3ZlcmxvYWRNYXhEZWx0YSk7XG5cdFx0fVxuXG5cdFx0ZGVsdGEgPSBjbGFtcChkZWx0YSwgbWluRGVsdGEsIG1heERlbHRhKTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBkZWx0YVVwID0gZGVsdGE7IGkgPCB1cEl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdXBJdGVtc1tpXTtcblx0XHRcdGNvbnN0IHNpemUgPSBjbGFtcCh1cFNpemVzW2ldICsgZGVsdGFVcCwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cdFx0XHRjb25zdCB2aWV3RGVsdGEgPSBzaXplIC0gdXBTaXplc1tpXTtcblxuXHRcdFx0ZGVsdGFVcCAtPSB2aWV3RGVsdGE7XG5cdFx0XHRpdGVtLnNpemUgPSBzaXplO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwLCBkZWx0YURvd24gPSBkZWx0YTsgaSA8IGRvd25JdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGRvd25JdGVtc1tpXTtcblx0XHRcdGNvbnN0IHNpemUgPSBjbGFtcChkb3duU2l6ZXNbaV0gLSBkZWx0YURvd24sIGl0ZW0ubWluaW11bVNpemUsIGl0ZW0ubWF4aW11bVNpemUpO1xuXHRcdFx0Y29uc3Qgdmlld0RlbHRhID0gc2l6ZSAtIGRvd25TaXplc1tpXTtcblxuXHRcdFx0ZGVsdGFEb3duICs9IHZpZXdEZWx0YTtcblx0XHRcdGl0ZW0uc2l6ZSA9IHNpemU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlbHRhO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXN0cmlidXRlRW1wdHlTcGFjZShsb3dQcmlvcml0eUluZGV4PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGVudFNpemUgPSB0aGlzLnZpZXdJdGVtcy5yZWR1Y2UoKHIsIGkpID0+IHIgKyBpLnNpemUsIDApO1xuXHRcdGxldCBlbXB0eURlbHRhID0gdGhpcy5zaXplIC0gY29udGVudFNpemU7XG5cblx0XHRjb25zdCBpbmRleGVzID0gcmFuZ2UodGhpcy52aWV3SXRlbXMubGVuZ3RoIC0gMSwgLTEpO1xuXHRcdGNvbnN0IGxvd1ByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5Lkxvdyk7XG5cdFx0Y29uc3QgaGlnaFByaW9yaXR5SW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy52aWV3SXRlbXNbaV0ucHJpb3JpdHkgPT09IExheW91dFByaW9yaXR5LkhpZ2gpO1xuXG5cdFx0Zm9yIChjb25zdCBpbmRleCBvZiBoaWdoUHJpb3JpdHlJbmRleGVzKSB7XG5cdFx0XHRwdXNoVG9TdGFydChpbmRleGVzLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpbmRleCBvZiBsb3dQcmlvcml0eUluZGV4ZXMpIHtcblx0XHRcdHB1c2hUb0VuZChpbmRleGVzLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBsb3dQcmlvcml0eUluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cHVzaFRvRW5kKGluZGV4ZXMsIGxvd1ByaW9yaXR5SW5kZXgpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBlbXB0eURlbHRhICE9PSAwICYmIGkgPCBpbmRleGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhlc1tpXV07XG5cdFx0XHRjb25zdCBzaXplID0gY2xhbXAoaXRlbS5zaXplICsgZW1wdHlEZWx0YSwgaXRlbS5taW5pbXVtU2l6ZSwgaXRlbS5tYXhpbXVtU2l6ZSk7XG5cdFx0XHRjb25zdCB2aWV3RGVsdGEgPSBzaXplIC0gaXRlbS5zaXplO1xuXG5cdFx0XHRlbXB0eURlbHRhIC09IHZpZXdEZWx0YTtcblx0XHRcdGl0ZW0uc2l6ZSA9IHNpemU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRWaWV3cygpOiB2b2lkIHtcblx0XHQvLyBTYXZlIG5ldyBjb250ZW50IHNpemVcblx0XHR0aGlzLl9jb250ZW50U2l6ZSA9IHRoaXMudmlld0l0ZW1zLnJlZHVjZSgociwgaSkgPT4gciArIGkuc2l6ZSwgMCk7XG5cblx0XHQvLyBMYXlvdXQgdmlld3Ncblx0XHRsZXQgb2Zmc2V0ID0gMDtcblxuXHRcdGZvciAoY29uc3Qgdmlld0l0ZW0gb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdHZpZXdJdGVtLmxheW91dChvZmZzZXQsIHRoaXMubGF5b3V0Q29udGV4dCk7XG5cdFx0XHRvZmZzZXQgKz0gdmlld0l0ZW0uc2l6ZTtcblx0XHR9XG5cblx0XHQvLyBMYXlvdXQgc2FzaGVzXG5cdFx0dGhpcy5zYXNoSXRlbXMuZm9yRWFjaChpdGVtID0+IGl0ZW0uc2FzaC5sYXlvdXQoKSk7XG5cdFx0dGhpcy51cGRhdGVTYXNoRW5hYmxlbWVudCgpO1xuXHRcdHRoaXMudXBkYXRlU2Nyb2xsYWJsZUVsZW1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2Nyb2xsYWJsZUVsZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0XHRoZWlnaHQ6IHRoaXMuc2l6ZSxcblx0XHRcdFx0c2Nyb2xsSGVpZ2h0OiB0aGlzLl9jb250ZW50U2l6ZVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHRcdHdpZHRoOiB0aGlzLnNpemUsXG5cdFx0XHRcdHNjcm9sbFdpZHRoOiB0aGlzLl9jb250ZW50U2l6ZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTYXNoRW5hYmxlbWVudCgpOiB2b2lkIHtcblx0XHRsZXQgcHJldmlvdXMgPSBmYWxzZTtcblx0XHRjb25zdCBjb2xsYXBzZXNEb3duID0gdGhpcy52aWV3SXRlbXMubWFwKGkgPT4gcHJldmlvdXMgPSAoaS5zaXplIC0gaS5taW5pbXVtU2l6ZSA+IDApIHx8IHByZXZpb3VzKTtcblxuXHRcdHByZXZpb3VzID0gZmFsc2U7XG5cdFx0Y29uc3QgZXhwYW5kc0Rvd24gPSB0aGlzLnZpZXdJdGVtcy5tYXAoaSA9PiBwcmV2aW91cyA9IChpLm1heGltdW1TaXplIC0gaS5zaXplID4gMCkgfHwgcHJldmlvdXMpO1xuXG5cdFx0Y29uc3QgcmV2ZXJzZVZpZXdzID0gWy4uLnRoaXMudmlld0l0ZW1zXS5yZXZlcnNlKCk7XG5cdFx0cHJldmlvdXMgPSBmYWxzZTtcblx0XHRjb25zdCBjb2xsYXBzZXNVcCA9IHJldmVyc2VWaWV3cy5tYXAoaSA9PiBwcmV2aW91cyA9IChpLnNpemUgLSBpLm1pbmltdW1TaXplID4gMCkgfHwgcHJldmlvdXMpLnJldmVyc2UoKTtcblxuXHRcdHByZXZpb3VzID0gZmFsc2U7XG5cdFx0Y29uc3QgZXhwYW5kc1VwID0gcmV2ZXJzZVZpZXdzLm1hcChpID0+IHByZXZpb3VzID0gKGkubWF4aW11bVNpemUgLSBpLnNpemUgPiAwKSB8fCBwcmV2aW91cykucmV2ZXJzZSgpO1xuXG5cdFx0bGV0IHBvc2l0aW9uID0gMDtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5zYXNoSXRlbXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCB7IHNhc2ggfSA9IHRoaXMuc2FzaEl0ZW1zW2luZGV4XTtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXHRcdFx0cG9zaXRpb24gKz0gdmlld0l0ZW0uc2l6ZTtcblxuXHRcdFx0Y29uc3QgbWluID0gIShjb2xsYXBzZXNEb3duW2luZGV4XSAmJiBleHBhbmRzVXBbaW5kZXggKyAxXSk7XG5cdFx0XHRjb25zdCBtYXggPSAhKGV4cGFuZHNEb3duW2luZGV4XSAmJiBjb2xsYXBzZXNVcFtpbmRleCArIDFdKTtcblxuXHRcdFx0aWYgKG1pbiAmJiBtYXgpIHtcblx0XHRcdFx0Y29uc3QgdXBJbmRleGVzID0gcmFuZ2UoaW5kZXgsIC0xKTtcblx0XHRcdFx0Y29uc3QgZG93bkluZGV4ZXMgPSByYW5nZShpbmRleCArIDEsIHRoaXMudmlld0l0ZW1zLmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IHNuYXBCZWZvcmVJbmRleCA9IHRoaXMuZmluZEZpcnN0U25hcEluZGV4KHVwSW5kZXhlcyk7XG5cdFx0XHRcdGNvbnN0IHNuYXBBZnRlckluZGV4ID0gdGhpcy5maW5kRmlyc3RTbmFwSW5kZXgoZG93bkluZGV4ZXMpO1xuXG5cdFx0XHRcdGNvbnN0IHNuYXBwZWRCZWZvcmUgPSB0eXBlb2Ygc25hcEJlZm9yZUluZGV4ID09PSAnbnVtYmVyJyAmJiAhdGhpcy52aWV3SXRlbXNbc25hcEJlZm9yZUluZGV4XS52aXNpYmxlO1xuXHRcdFx0XHRjb25zdCBzbmFwcGVkQWZ0ZXIgPSB0eXBlb2Ygc25hcEFmdGVySW5kZXggPT09ICdudW1iZXInICYmICF0aGlzLnZpZXdJdGVtc1tzbmFwQWZ0ZXJJbmRleF0udmlzaWJsZTtcblxuXHRcdFx0XHRpZiAoc25hcHBlZEJlZm9yZSAmJiBjb2xsYXBzZXNVcFtpbmRleF0gJiYgKHBvc2l0aW9uID4gMCB8fCB0aGlzLnN0YXJ0U25hcHBpbmdFbmFibGVkKSkge1xuXHRcdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuQXRNaW5pbXVtO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNuYXBwZWRBZnRlciAmJiBjb2xsYXBzZXNEb3duW2luZGV4XSAmJiAocG9zaXRpb24gPCB0aGlzLl9jb250ZW50U2l6ZSB8fCB0aGlzLmVuZFNuYXBwaW5nRW5hYmxlZCkpIHtcblx0XHRcdFx0XHRzYXNoLnN0YXRlID0gU2FzaFN0YXRlLkF0TWF4aW11bTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzYXNoLnN0YXRlID0gU2FzaFN0YXRlLkRpc2FibGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKG1pbiAmJiAhbWF4KSB7XG5cdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuQXRNaW5pbXVtO1xuXHRcdFx0fSBlbHNlIGlmICghbWluICYmIG1heCkge1xuXHRcdFx0XHRzYXNoLnN0YXRlID0gU2FzaFN0YXRlLkF0TWF4aW11bTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRW5hYmxlZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFNhc2hQb3NpdGlvbihzYXNoOiBTYXNoKTogbnVtYmVyIHtcblx0XHRsZXQgcG9zaXRpb24gPSAwO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnNhc2hJdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cG9zaXRpb24gKz0gdGhpcy52aWV3SXRlbXNbaV0uc2l6ZTtcblxuXHRcdFx0aWYgKHRoaXMuc2FzaEl0ZW1zW2ldLnNhc2ggPT09IHNhc2gpIHtcblx0XHRcdFx0cmV0dXJuIHBvc2l0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kRmlyc3RTbmFwSW5kZXgoaW5kZXhlczogbnVtYmVyW10pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdC8vIHZpc2libGUgdmlld3MgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGluZGV4ZXMpIHtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXG5cdFx0XHRpZiAoIXZpZXdJdGVtLnZpc2libGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2aWV3SXRlbS5zbmFwKSB7XG5cdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB0aGVuLCBoaWRkZW4gdmlld3Ncblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGluZGV4ZXMpIHtcblx0XHRcdGNvbnN0IHZpZXdJdGVtID0gdGhpcy52aWV3SXRlbXNbaW5kZXhdO1xuXG5cdFx0XHRpZiAodmlld0l0ZW0udmlzaWJsZSAmJiB2aWV3SXRlbS5tYXhpbXVtU2l6ZSAtIHZpZXdJdGVtLm1pbmltdW1TaXplID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXZpZXdJdGVtLnZpc2libGUgJiYgdmlld0l0ZW0uc25hcCkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXJlVmlld3NEaXN0cmlidXRlZCgpIHtcblx0XHRsZXQgbWluID0gdW5kZWZpbmVkLCBtYXggPSB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKGNvbnN0IHZpZXcgb2YgdGhpcy52aWV3SXRlbXMpIHtcblx0XHRcdG1pbiA9IG1pbiA9PT0gdW5kZWZpbmVkID8gdmlldy5zaXplIDogTWF0aC5taW4obWluLCB2aWV3LnNpemUpO1xuXHRcdFx0bWF4ID0gbWF4ID09PSB1bmRlZmluZWQgPyB2aWV3LnNpemUgOiBNYXRoLm1heChtYXgsIHZpZXcuc2l6ZSk7XG5cblx0XHRcdGlmIChtYXggLSBtaW4gPiAyKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zYXNoRHJhZ1N0YXRlPy5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGRpc3Bvc2UodGhpcy52aWV3SXRlbXMpO1xuXHRcdHRoaXMudmlld0l0ZW1zID0gW107XG5cblx0XHR0aGlzLnNhc2hJdGVtcy5mb3JFYWNoKGkgPT4gaS5kaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5zYXNoSXRlbXMgPSBbXTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxHQUFHLHVCQUF1QixRQUFRLFdBQVcsb0NBQW9DO0FBQzFGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXVDLGFBQWEsTUFBTSxpQkFBaUI7QUFDM0UsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxXQUFXLGFBQWEs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QUFJLENBQUMsU0FBUyxTQUFTO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFVBQUksU0FBUyxNQUFNO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUdBLGVBQVcsU0FBUyxTQUFTO0FBQzVCLFlBQU0sV0FBVyxLQUFLLFVBQVUsS0FBSztBQUVyQyxVQUFJLFNBQVMsV0FBVyxTQUFTLGNBQWMsU0FBUyxjQUFjLEdBQUc7QUFDeEUsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLENBQUMsU0FBUyxXQUFXLFNBQVMsTUFBTTtBQUN2QyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsc0JBQXNCO0FBQzdCLFFBQUksTUFBTSxRQUFXLE1BQU07QUFFM0IsZUFBVyxRQUFRLEtBQUssV0FBVztBQUNsQyxZQUFNLFFBQVEsU0FBWSxLQUFLLE9BQU8sS0FBSyxJQUFJLEtBQUssS0FBSyxJQUFJO0FBQzdELFlBQU0sUUFBUSxTQUFZLEtBQUssT0FBTyxLQUFLLElBQUksS0FBSyxLQUFLLElBQUk7QUFFN0QsVUFBSSxNQUFNLE1BQU0sR0FBRztBQUNsQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxlQUFlLFdBQVcsUUFBUTtBQUV2QyxZQUFRLEtBQUssU0FBUztBQUN0QixTQUFLLFlBQVksQ0FBQztBQUVsQixTQUFLLFVBQVUsUUFBUSxPQUFLLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFDbEQsU0FBSyxZQUFZLENBQUM7QUFFbEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEOyIsCiAgIm5hbWVzIjogWyJPcmllbnRhdGlvbiIsICJMYXlvdXRQcmlvcml0eSIsICJTdGF0ZSIsICJTaXppbmciLCAic3RhcnQiLCAiYWx0IiwgIm1pbkRlbHRhIiwgIm1heERlbHRhIiwgInNpemUiLCAib25DaGFuZ2VEaXNwb3NhYmxlIiwgIml0ZW0iLCAiaW5kZXgiLCAiZGlzcG9zYWJsZSJdCn0K
