import { $ } from "../../dom.js";
import { Orientation } from "../sash/sash.js";
import { LayoutPriority, Sizing, SplitView } from "../splitview/splitview.js";
import { equals as arrayEquals, tail } from "../../../common/arrays.js";
import { Color } from "../../../common/color.js";
import { Emitter, Event, Relay } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { rot } from "../../../common/numbers.js";
import { isUndefined } from "../../../common/types.js";
import "./gridview.css";
import { Orientation as Orientation2 } from "../sash/sash.js";
import { LayoutPriority as LayoutPriority2, Sizing as Sizing2 } from "../splitview/splitview.js";
const defaultStyles = {
  separatorBorder: Color.transparent
};
function orthogonal(orientation) {
  return orientation === Orientation.VERTICAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
}
function isGridBranchNode(node) {
  return !!node.children;
}
class LayoutController {
  constructor(isLayoutEnabled) {
    this.isLayoutEnabled = isLayoutEnabled;
  }
}
function toAbsoluteBoundarySashes(sashes, orientation) {
  if (orientation === Orientation.HORIZONTAL) {
    return { left: sashes.start, right: sashes.end, top: sashes.orthogonalStart, bottom: sashes.orthogonalEnd };
  } else {
    return { top: sashes.start, bottom: sashes.end, left: sashes.orthogonalStart, right: sashes.orthogonalEnd };
  }
}
function fromAbsoluteBoundarySashes(sashes, orientation) {
  if (orientation === Orientation.HORIZONTAL) {
    return { start: sashes.left, end: sashes.right, orthogonalStart: sashes.top, orthogonalEnd: sashes.bottom };
  } else {
    return { start: sashes.top, end: sashes.bottom, orthogonalStart: sashes.left, orthogonalEnd: sashes.right };
  }
}
function validateIndex(index, numChildren) {
  if (Math.abs(index) > numChildren) {
    throw new Error("Invalid index");
  }
  return rot(index, numChildren + 1);
}
class BranchNode {
  constructor(orientation, layoutController, styles, splitviewProportionalLayout, size = 0, orthogonalSize = 0, edgeSnapping = false, childDescriptors) {
    this.orientation = orientation;
    this.layoutController = layoutController;
    this.splitviewProportionalLayout = splitviewProportionalLayout;
    this.children = [];
    this._absoluteOffset = 0;
    this._absoluteOrthogonalOffset = 0;
    this.absoluteOrthogonalSize = 0;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._onDidVisibilityChange = new Emitter();
    this.onDidVisibilityChange = this._onDidVisibilityChange.event;
    this.childrenVisibilityChangeDisposable = new DisposableStore();
    this._onDidScroll = new Emitter();
    this.onDidScrollDisposable = Disposable.None;
    this.onDidScroll = this._onDidScroll.event;
    this.childrenChangeDisposable = Disposable.None;
    this._onDidSashReset = new Emitter();
    this.onDidSashReset = this._onDidSashReset.event;
    this.splitviewSashResetDisposable = Disposable.None;
    this.childrenSashResetDisposable = Disposable.None;
    this._boundarySashes = {};
    this._edgeSnapping = false;
    this._styles = styles;
    this._size = size;
    this._orthogonalSize = orthogonalSize;
    this.element = $(".monaco-grid-branch-node");
    if (!childDescriptors) {
      this.splitview = new SplitView(this.element, { orientation, styles, proportionalLayout: splitviewProportionalLayout });
      this.splitview.layout(size, { orthogonalSize, absoluteOffset: 0, absoluteOrthogonalOffset: 0, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
    } else {
      const descriptor = {
        views: childDescriptors.map((childDescriptor) => {
          return {
            view: childDescriptor.node,
            size: childDescriptor.node.size,
            visible: childDescriptor.visible !== false
          };
        }),
        size: this.orthogonalSize
      };
      const options = { proportionalLayout: splitviewProportionalLayout, orientation, styles };
      this.children = childDescriptors.map((c) => c.node);
      this.splitview = new SplitView(this.element, { ...options, descriptor });
      this.children.forEach((node, index) => {
        const first = index === 0;
        const last = index === this.children.length;
        node.boundarySashes = {
          start: this.boundarySashes.orthogonalStart,
          end: this.boundarySashes.orthogonalEnd,
          orthogonalStart: first ? this.boundarySashes.start : this.splitview.sashes[index - 1],
          orthogonalEnd: last ? this.boundarySashes.end : this.splitview.sashes[index]
        };
      });
    }
    const onDidSashReset = Event.map(this.splitview.onDidSashReset, (i) => [i]);
    this.splitviewSashResetDisposable = onDidSashReset(this._onDidSashReset.fire, this._onDidSashReset);
    this.updateChildrenEvents();
  }
  get size() {
    return this._size;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get absoluteOffset() {
    return this._absoluteOffset;
  }
  get absoluteOrthogonalOffset() {
    return this._absoluteOrthogonalOffset;
  }
  get styles() {
    return this._styles;
  }
  get width() {
    return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
  }
  get height() {
    return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
  }
  get top() {
    return this.orientation === Orientation.HORIZONTAL ? this._absoluteOffset : this._absoluteOrthogonalOffset;
  }
  get left() {
    return this.orientation === Orientation.HORIZONTAL ? this._absoluteOrthogonalOffset : this._absoluteOffset;
  }
  get minimumSize() {
    return this.children.length === 0 ? 0 : Math.max(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.minimumOrthogonalSize : 0));
  }
  get maximumSize() {
    return Math.min(...this.children.map((c, index) => this.splitview.isViewVisible(index) ? c.maximumOrthogonalSize : Number.POSITIVE_INFINITY));
  }
  get priority() {
    if (this.children.length === 0) {
      return LayoutPriority.Normal;
    }
    const priorities = this.children.map((c) => typeof c.priority === "undefined" ? LayoutPriority.Normal : c.priority);
    if (priorities.some((p) => p === LayoutPriority.High)) {
      return LayoutPriority.High;
    } else if (priorities.some((p) => p === LayoutPriority.Low)) {
      return LayoutPriority.Low;
    }
    return LayoutPriority.Normal;
  }
  get proportionalLayout() {
    if (this.children.length === 0) {
      return true;
    }
    return this.children.every((c) => c.proportionalLayout);
  }
  get minimumOrthogonalSize() {
    return this.splitview.minimumSize;
  }
  get maximumOrthogonalSize() {
    return this.splitview.maximumSize;
  }
  get minimumWidth() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumOrthogonalSize : this.minimumSize;
  }
  get minimumHeight() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumSize : this.minimumOrthogonalSize;
  }
  get maximumWidth() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumOrthogonalSize : this.maximumSize;
  }
  get maximumHeight() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumSize : this.maximumOrthogonalSize;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    if (this._boundarySashes.start === boundarySashes.start && this._boundarySashes.end === boundarySashes.end && this._boundarySashes.orthogonalStart === boundarySashes.orthogonalStart && this._boundarySashes.orthogonalEnd === boundarySashes.orthogonalEnd) {
      return;
    }
    this._boundarySashes = boundarySashes;
    this.splitview.orthogonalStartSash = boundarySashes.orthogonalStart;
    this.splitview.orthogonalEndSash = boundarySashes.orthogonalEnd;
    for (let index = 0; index < this.children.length; index++) {
      const child = this.children[index];
      const first = index === 0;
      const last = index === this.children.length - 1;
      child.boundarySashes = {
        start: boundarySashes.orthogonalStart,
        end: boundarySashes.orthogonalEnd,
        orthogonalStart: first ? boundarySashes.start : child.boundarySashes.orthogonalStart,
        orthogonalEnd: last ? boundarySashes.end : child.boundarySashes.orthogonalEnd
      };
    }
  }
  get edgeSnapping() {
    return this._edgeSnapping;
  }
  set edgeSnapping(edgeSnapping) {
    if (this._edgeSnapping === edgeSnapping) {
      return;
    }
    this._edgeSnapping = edgeSnapping;
    for (const child of this.children) {
      if (child instanceof BranchNode) {
        child.edgeSnapping = edgeSnapping;
      }
    }
    this.updateSplitviewEdgeSnappingEnablement();
  }
  style(styles) {
    this._styles = styles;
    this.splitview.style(styles);
    for (const child of this.children) {
      if (child instanceof BranchNode) {
        child.style(styles);
      }
    }
  }
  layout(size, offset, ctx) {
    if (!this.layoutController.isLayoutEnabled) {
      return;
    }
    if (typeof ctx === "undefined") {
      throw new Error("Invalid state");
    }
    this._size = ctx.orthogonalSize;
    this._orthogonalSize = size;
    this._absoluteOffset = ctx.absoluteOffset + offset;
    this._absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;
    this.absoluteOrthogonalSize = ctx.absoluteOrthogonalSize;
    this.splitview.layout(ctx.orthogonalSize, {
      orthogonalSize: size,
      absoluteOffset: this._absoluteOrthogonalOffset,
      absoluteOrthogonalOffset: this._absoluteOffset,
      absoluteSize: ctx.absoluteOrthogonalSize,
      absoluteOrthogonalSize: ctx.absoluteSize
    });
    this.updateSplitviewEdgeSnappingEnablement();
  }
  setVisible(visible) {
    for (const child of this.children) {
      child.setVisible(visible);
    }
  }
  addChild(node, size, index, skipLayout) {
    index = validateIndex(index, this.children.length);
    this.splitview.addView(node, size, index, skipLayout);
    this.children.splice(index, 0, node);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
  }
  removeChild(index, sizing) {
    index = validateIndex(index, this.children.length);
    const result = this.splitview.removeView(index, sizing);
    this.children.splice(index, 1);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
    return result;
  }
  removeAllChildren() {
    const result = this.splitview.removeAllViews();
    this.children.splice(0, this.children.length);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
    return result;
  }
  moveChild(from, to) {
    from = validateIndex(from, this.children.length);
    to = validateIndex(to, this.children.length);
    if (from === to) {
      return;
    }
    if (from < to) {
      to -= 1;
    }
    this.splitview.moveView(from, to);
    this.children.splice(to, 0, this.children.splice(from, 1)[0]);
    this.updateBoundarySashes();
    this.onDidChildrenChange();
  }
  swapChildren(from, to) {
    from = validateIndex(from, this.children.length);
    to = validateIndex(to, this.children.length);
    if (from === to) {
      return;
    }
    this.splitview.swapViews(from, to);
    [this.children[from].boundarySashes, this.children[to].boundarySashes] = [this.children[from].boundarySashes, this.children[to].boundarySashes];
    [this.children[from], this.children[to]] = [this.children[to], this.children[from]];
    this.onDidChildrenChange();
  }
  resizeChild(index, size) {
    index = validateIndex(index, this.children.length);
    this.splitview.resizeView(index, size);
  }
  isChildExpanded(index) {
    return this.splitview.isViewExpanded(index);
  }
  distributeViewSizes(recursive = false) {
    this.splitview.distributeViewSizes();
    if (recursive) {
      for (const child of this.children) {
        if (child instanceof BranchNode) {
          child.distributeViewSizes(true);
        }
      }
    }
  }
  getChildSize(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.getViewSize(index);
  }
  isChildVisible(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.isViewVisible(index);
  }
  setChildVisible(index, visible) {
    index = validateIndex(index, this.children.length);
    if (this.splitview.isViewVisible(index) === visible) {
      return;
    }
    const wereAllChildrenHidden = this.splitview.contentSize === 0;
    this.splitview.setViewVisible(index, visible);
    const areAllChildrenHidden = this.splitview.contentSize === 0;
    if (visible && wereAllChildrenHidden || !visible && areAllChildrenHidden) {
      this._onDidVisibilityChange.fire(visible);
    }
  }
  getChildCachedVisibleSize(index) {
    index = validateIndex(index, this.children.length);
    return this.splitview.getViewCachedVisibleSize(index);
  }
  updateBoundarySashes() {
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].boundarySashes = {
        start: this.boundarySashes.orthogonalStart,
        end: this.boundarySashes.orthogonalEnd,
        orthogonalStart: i === 0 ? this.boundarySashes.start : this.splitview.sashes[i - 1],
        orthogonalEnd: i === this.children.length - 1 ? this.boundarySashes.end : this.splitview.sashes[i]
      };
    }
  }
  onDidChildrenChange() {
    this.updateChildrenEvents();
    this._onDidChange.fire(void 0);
  }
  updateChildrenEvents() {
    const onDidChildrenChange = Event.map(Event.any(...this.children.map((c) => c.onDidChange)), () => void 0);
    this.childrenChangeDisposable.dispose();
    this.childrenChangeDisposable = onDidChildrenChange(this._onDidChange.fire, this._onDidChange);
    const onDidChildrenSashReset = Event.any(...this.children.map((c, i) => Event.map(c.onDidSashReset, (location) => [i, ...location])));
    this.childrenSashResetDisposable.dispose();
    this.childrenSashResetDisposable = onDidChildrenSashReset(this._onDidSashReset.fire, this._onDidSashReset);
    const onDidScroll = Event.any(Event.signal(this.splitview.onDidScroll), ...this.children.map((c) => c.onDidScroll));
    this.onDidScrollDisposable.dispose();
    this.onDidScrollDisposable = onDidScroll(this._onDidScroll.fire, this._onDidScroll);
    this.childrenVisibilityChangeDisposable.clear();
    this.children.forEach((child, index) => {
      if (child instanceof BranchNode) {
        this.childrenVisibilityChangeDisposable.add(child.onDidVisibilityChange((visible) => {
          this.setChildVisible(index, visible);
        }));
      }
    });
  }
  trySet2x2(other) {
    if (this.children.length !== 2 || other.children.length !== 2) {
      return Disposable.None;
    }
    if (this.getChildSize(0) !== other.getChildSize(0)) {
      return Disposable.None;
    }
    const [firstChild, secondChild] = this.children;
    const [otherFirstChild, otherSecondChild] = other.children;
    if (!(firstChild instanceof LeafNode) || !(secondChild instanceof LeafNode)) {
      return Disposable.None;
    }
    if (!(otherFirstChild instanceof LeafNode) || !(otherSecondChild instanceof LeafNode)) {
      return Disposable.None;
    }
    if (this.orientation === Orientation.VERTICAL) {
      secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = firstChild;
      firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = secondChild;
      otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = otherFirstChild;
      otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = otherSecondChild;
    } else {
      otherFirstChild.linkedWidthNode = secondChild.linkedHeightNode = firstChild;
      otherSecondChild.linkedWidthNode = firstChild.linkedHeightNode = secondChild;
      firstChild.linkedWidthNode = otherSecondChild.linkedHeightNode = otherFirstChild;
      secondChild.linkedWidthNode = otherFirstChild.linkedHeightNode = otherSecondChild;
    }
    const mySash = this.splitview.sashes[0];
    const otherSash = other.splitview.sashes[0];
    mySash.linkedSash = otherSash;
    otherSash.linkedSash = mySash;
    this._onDidChange.fire(void 0);
    other._onDidChange.fire(void 0);
    return toDisposable(() => {
      mySash.linkedSash = otherSash.linkedSash = void 0;
      firstChild.linkedHeightNode = firstChild.linkedWidthNode = void 0;
      secondChild.linkedHeightNode = secondChild.linkedWidthNode = void 0;
      otherFirstChild.linkedHeightNode = otherFirstChild.linkedWidthNode = void 0;
      otherSecondChild.linkedHeightNode = otherSecondChild.linkedWidthNode = void 0;
    });
  }
  updateSplitviewEdgeSnappingEnablement() {
    this.splitview.startSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset > 0;
    this.splitview.endSnappingEnabled = this._edgeSnapping || this._absoluteOrthogonalOffset + this._size < this.absoluteOrthogonalSize;
  }
  dispose() {
    for (const child of this.children) {
      child.dispose();
    }
    this._onDidChange.dispose();
    this._onDidScroll.dispose();
    this._onDidSashReset.dispose();
    this._onDidVisibilityChange.dispose();
    this.childrenVisibilityChangeDisposable.dispose();
    this.splitviewSashResetDisposable.dispose();
    this.childrenSashResetDisposable.dispose();
    this.childrenChangeDisposable.dispose();
    this.onDidScrollDisposable.dispose();
    this.splitview.dispose();
  }
}
function createLatchedOnDidChangeViewEvent(view) {
  const [onDidChangeViewConstraints, onDidSetViewSize] = Event.split(view.onDidChange, isUndefined);
  return Event.any(
    onDidSetViewSize,
    Event.map(
      Event.latch(
        Event.map(onDidChangeViewConstraints, (_) => [view.minimumWidth, view.maximumWidth, view.minimumHeight, view.maximumHeight]),
        arrayEquals
      ),
      (_) => void 0
    )
  );
}
class LeafNode {
  constructor(view, orientation, layoutController, orthogonalSize, size = 0) {
    this.view = view;
    this.orientation = orientation;
    this.layoutController = layoutController;
    this._size = 0;
    this.absoluteOffset = 0;
    this.absoluteOrthogonalOffset = 0;
    this.onDidScroll = Event.None;
    this.onDidSashReset = Event.None;
    this._onDidLinkedWidthNodeChange = new Relay();
    this._linkedWidthNode = void 0;
    this._onDidLinkedHeightNodeChange = new Relay();
    this._linkedHeightNode = void 0;
    this._onDidSetLinkedNode = new Emitter();
    this.disposables = new DisposableStore();
    this._boundarySashes = {};
    this.cachedWidth = 0;
    this.cachedHeight = 0;
    this.cachedTop = 0;
    this.cachedLeft = 0;
    this._orthogonalSize = orthogonalSize;
    this._size = size;
    const onDidChange = createLatchedOnDidChangeViewEvent(view);
    this._onDidViewChange = Event.map(onDidChange, (e) => e && (this.orientation === Orientation.VERTICAL ? e.width : e.height), this.disposables);
    this.onDidChange = Event.any(this._onDidViewChange, this._onDidSetLinkedNode.event, this._onDidLinkedWidthNodeChange.event, this._onDidLinkedHeightNodeChange.event);
  }
  get size() {
    return this._size;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  get linkedWidthNode() {
    return this._linkedWidthNode;
  }
  set linkedWidthNode(node) {
    this._onDidLinkedWidthNodeChange.input = node ? node._onDidViewChange : Event.None;
    this._linkedWidthNode = node;
    this._onDidSetLinkedNode.fire(void 0);
  }
  get linkedHeightNode() {
    return this._linkedHeightNode;
  }
  set linkedHeightNode(node) {
    this._onDidLinkedHeightNodeChange.input = node ? node._onDidViewChange : Event.None;
    this._linkedHeightNode = node;
    this._onDidSetLinkedNode.fire(void 0);
  }
  get width() {
    return this.orientation === Orientation.HORIZONTAL ? this.orthogonalSize : this.size;
  }
  get height() {
    return this.orientation === Orientation.HORIZONTAL ? this.size : this.orthogonalSize;
  }
  get top() {
    return this.orientation === Orientation.HORIZONTAL ? this.absoluteOffset : this.absoluteOrthogonalOffset;
  }
  get left() {
    return this.orientation === Orientation.HORIZONTAL ? this.absoluteOrthogonalOffset : this.absoluteOffset;
  }
  get element() {
    return this.view.element;
  }
  get minimumWidth() {
    return this.linkedWidthNode ? Math.max(this.linkedWidthNode.view.minimumWidth, this.view.minimumWidth) : this.view.minimumWidth;
  }
  get maximumWidth() {
    return this.linkedWidthNode ? Math.min(this.linkedWidthNode.view.maximumWidth, this.view.maximumWidth) : this.view.maximumWidth;
  }
  get minimumHeight() {
    return this.linkedHeightNode ? Math.max(this.linkedHeightNode.view.minimumHeight, this.view.minimumHeight) : this.view.minimumHeight;
  }
  get maximumHeight() {
    return this.linkedHeightNode ? Math.min(this.linkedHeightNode.view.maximumHeight, this.view.maximumHeight) : this.view.maximumHeight;
  }
  get minimumSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumHeight : this.minimumWidth;
  }
  get maximumSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumHeight : this.maximumWidth;
  }
  get priority() {
    return this.view.priority;
  }
  get proportionalLayout() {
    return this.view.proportionalLayout ?? true;
  }
  get snap() {
    return this.view.snap;
  }
  get minimumOrthogonalSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.minimumWidth : this.minimumHeight;
  }
  get maximumOrthogonalSize() {
    return this.orientation === Orientation.HORIZONTAL ? this.maximumWidth : this.maximumHeight;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    this._boundarySashes = boundarySashes;
    this.view.setBoundarySashes?.(toAbsoluteBoundarySashes(boundarySashes, this.orientation));
  }
  layout(size, offset, ctx) {
    if (!this.layoutController.isLayoutEnabled) {
      return;
    }
    if (typeof ctx === "undefined") {
      throw new Error("Invalid state");
    }
    this._size = size;
    this._orthogonalSize = ctx.orthogonalSize;
    this.absoluteOffset = ctx.absoluteOffset + offset;
    this.absoluteOrthogonalOffset = ctx.absoluteOrthogonalOffset;
    this._layout(this.width, this.height, this.top, this.left);
  }
  _layout(width, height, top, left) {
    if (this.cachedWidth === width && this.cachedHeight === height && this.cachedTop === top && this.cachedLeft === left) {
      return;
    }
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedTop = top;
    this.cachedLeft = left;
    this.view.layout(width, height, top, left);
  }
  setVisible(visible) {
    this.view.setVisible?.(visible);
  }
  dispose() {
    this._onDidSetLinkedNode.dispose();
    this.disposables.dispose();
  }
}
function flipNode(node, size, orthogonalSize) {
  if (node instanceof BranchNode) {
    const result = new BranchNode(orthogonal(node.orientation), node.layoutController, node.styles, node.splitviewProportionalLayout, size, orthogonalSize, node.edgeSnapping);
    let totalSize = 0;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      const childSize = child instanceof BranchNode ? child.orthogonalSize : child.size;
      let newSize = node.size === 0 ? 0 : Math.round(size * childSize / node.size);
      totalSize += newSize;
      if (i === 0) {
        newSize += size - totalSize;
      }
      result.addChild(flipNode(child, orthogonalSize, newSize), newSize, 0, true);
    }
    node.dispose();
    return result;
  } else {
    const result = new LeafNode(node.view, orthogonal(node.orientation), node.layoutController, orthogonalSize);
    node.dispose();
    return result;
  }
}
class GridView {
  /**
   * Create a new {@link GridView} instance.
   *
   * @remarks It's the caller's responsibility to append the
   * {@link GridView.element} to the page's DOM.
   */
  constructor(options = {}) {
    this.onDidSashResetRelay = new Relay();
    this._onDidScroll = new Relay();
    this._onDidChange = new Relay();
    this._boundarySashes = {};
    this.disposable2x2 = Disposable.None;
    /**
     * Fires whenever the user double clicks a {@link Sash sash}.
     */
    this.onDidSashReset = this.onDidSashResetRelay.event;
    /**
     * Fires whenever the user scrolls a {@link SplitView} within
     * the grid.
     */
    this.onDidScroll = this._onDidScroll.event;
    /**
     * Fires whenever a view within the grid changes its size constraints.
     */
    this.onDidChange = this._onDidChange.event;
    this.maximizedNode = void 0;
    this._onDidChangeViewMaximized = new Emitter();
    this.onDidChangeViewMaximized = this._onDidChangeViewMaximized.event;
    this.element = $(".monaco-grid-view");
    this.styles = options.styles || defaultStyles;
    this.proportionalLayout = typeof options.proportionalLayout !== "undefined" ? !!options.proportionalLayout : true;
    this.layoutController = new LayoutController(false);
    this.root = new BranchNode(Orientation.VERTICAL, this.layoutController, this.styles, this.proportionalLayout);
  }
  get root() {
    return this._root;
  }
  set root(root) {
    const oldRoot = this._root;
    if (oldRoot) {
      oldRoot.element.remove();
      oldRoot.dispose();
    }
    this._root = root;
    this.element.appendChild(root.element);
    this.onDidSashResetRelay.input = root.onDidSashReset;
    this._onDidChange.input = Event.map(root.onDidChange, () => void 0);
    this._onDidScroll.input = root.onDidScroll;
  }
  /**
   * The width of the grid.
   */
  get width() {
    return this.root.width;
  }
  /**
   * The height of the grid.
   */
  get height() {
    return this.root.height;
  }
  /**
   * The minimum width of the grid.
   */
  get minimumWidth() {
    return this.root.minimumWidth;
  }
  /**
   * The minimum height of the grid.
   */
  get minimumHeight() {
    return this.root.minimumHeight;
  }
  /**
   * The maximum width of the grid.
   */
  get maximumWidth() {
    return this.root.maximumHeight;
  }
  /**
   * The maximum height of the grid.
   */
  get maximumHeight() {
    return this.root.maximumHeight;
  }
  get orientation() {
    return this._root.orientation;
  }
  get boundarySashes() {
    return this._boundarySashes;
  }
  /**
   * The orientation of the grid. Matches the orientation of the root
   * {@link SplitView} in the grid's tree model.
   */
  set orientation(orientation) {
    if (this._root.orientation === orientation) {
      return;
    }
    const { size, orthogonalSize, absoluteOffset, absoluteOrthogonalOffset } = this._root;
    this.root = flipNode(this._root, orthogonalSize, size);
    this.root.layout(size, 0, { orthogonalSize, absoluteOffset: absoluteOrthogonalOffset, absoluteOrthogonalOffset: absoluteOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
    this.boundarySashes = this.boundarySashes;
  }
  /**
   * A collection of sashes perpendicular to each edge of the grid.
   * Corner sashes will be created for each intersection.
   */
  set boundarySashes(boundarySashes) {
    this._boundarySashes = boundarySashes;
    this.root.boundarySashes = fromAbsoluteBoundarySashes(boundarySashes, this.orientation);
  }
  /**
   * Enable/disable edge snapping across all grid views.
   */
  set edgeSnapping(edgeSnapping) {
    this.root.edgeSnapping = edgeSnapping;
  }
  style(styles) {
    this.styles = styles;
    this.root.style(styles);
  }
  /**
   * Layout the {@link GridView}.
   *
   * Optionally provide a `top` and `left` positions, those will propagate
   * as an origin for positions passed to {@link IView.layout}.
   *
   * @param width The width of the {@link GridView}.
   * @param height The height of the {@link GridView}.
   * @param top Optional, the top location of the {@link GridView}.
   * @param left Optional, the left location of the {@link GridView}.
   */
  layout(width, height, top = 0, left = 0) {
    this.layoutController.isLayoutEnabled = true;
    const [size, orthogonalSize, offset, orthogonalOffset] = this.root.orientation === Orientation.HORIZONTAL ? [height, width, top, left] : [width, height, left, top];
    this.root.layout(size, 0, { orthogonalSize, absoluteOffset: offset, absoluteOrthogonalOffset: orthogonalOffset, absoluteSize: size, absoluteOrthogonalSize: orthogonalSize });
  }
  /**
   * Add a {@link IView view} to this {@link GridView}.
   *
   * @param view The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param location The {@link GridLocation location} to insert the view on.
   */
  addView(view, size, location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (parent instanceof BranchNode) {
      const node = new LeafNode(view, orthogonal(parent.orientation), this.layoutController, parent.orthogonalSize);
      try {
        parent.addChild(node, size, index);
      } catch (err) {
        node.dispose();
        throw err;
      }
    } else {
      const [, grandParent] = tail(pathToParent);
      const [, parentIndex] = tail(rest);
      let newSiblingSize = 0;
      const newSiblingCachedVisibleSize = grandParent.getChildCachedVisibleSize(parentIndex);
      if (typeof newSiblingCachedVisibleSize === "number") {
        newSiblingSize = Sizing.Invisible(newSiblingCachedVisibleSize);
      }
      const oldChild = grandParent.removeChild(parentIndex);
      oldChild.dispose();
      const newParent = new BranchNode(parent.orientation, parent.layoutController, this.styles, this.proportionalLayout, parent.size, parent.orthogonalSize, grandParent.edgeSnapping);
      grandParent.addChild(newParent, parent.size, parentIndex);
      const newSibling = new LeafNode(parent.view, grandParent.orientation, this.layoutController, parent.size);
      newParent.addChild(newSibling, newSiblingSize, 0);
      if (typeof size !== "number" && size.type === "split") {
        size = Sizing.Split(0);
      }
      const node = new LeafNode(view, grandParent.orientation, this.layoutController, parent.size);
      newParent.addChild(node, size, index);
    }
    this.trySet2x2();
  }
  /**
   * Remove a {@link IView view} from this {@link GridView}.
   *
   * @param location The {@link GridLocation location} of the {@link IView view}.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(location, sizing) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    const node = parent.children[index];
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    parent.removeChild(index, sizing);
    node.dispose();
    if (parent.children.length === 0) {
      throw new Error("Invalid grid state");
    }
    if (parent.children.length > 1) {
      this.trySet2x2();
      return node.view;
    }
    if (pathToParent.length === 0) {
      const sibling2 = parent.children[0];
      if (sibling2 instanceof LeafNode) {
        return node.view;
      }
      parent.removeChild(0);
      parent.dispose();
      this.root = sibling2;
      this.boundarySashes = this.boundarySashes;
      this.trySet2x2();
      return node.view;
    }
    const [, grandParent] = tail(pathToParent);
    const [, parentIndex] = tail(rest);
    const isSiblingVisible = parent.isChildVisible(0);
    const sibling = parent.removeChild(0);
    const sizes = grandParent.children.map((_, i) => grandParent.getChildSize(i));
    grandParent.removeChild(parentIndex, sizing);
    parent.dispose();
    if (sibling instanceof BranchNode) {
      sizes.splice(parentIndex, 1, ...sibling.children.map((c) => c.size));
      const siblingChildren = sibling.removeAllChildren();
      for (let i = 0; i < siblingChildren.length; i++) {
        grandParent.addChild(siblingChildren[i], siblingChildren[i].size, parentIndex + i);
      }
    } else {
      const newSibling = new LeafNode(sibling.view, orthogonal(sibling.orientation), this.layoutController, sibling.size);
      const sizing2 = isSiblingVisible ? sibling.orthogonalSize : Sizing.Invisible(sibling.orthogonalSize);
      grandParent.addChild(newSibling, sizing2, parentIndex);
    }
    sibling.dispose();
    for (let i = 0; i < sizes.length; i++) {
      grandParent.resizeChild(i, sizes[i]);
    }
    this.trySet2x2();
    return node.view;
  }
  /**
   * Move a {@link IView view} within its parent.
   *
   * @param parentLocation The {@link GridLocation location} of the {@link IView view}'s parent.
   * @param from The index of the {@link IView view} to move.
   * @param to The index where the {@link IView view} should move to.
   */
  moveView(parentLocation, from, to) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [, parent] = this.getNode(parentLocation);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    parent.moveChild(from, to);
    this.trySet2x2();
  }
  /**
   * Swap two {@link IView views} within the {@link GridView}.
   *
   * @param from The {@link GridLocation location} of one view.
   * @param to The {@link GridLocation location} of another view.
   */
  swapViews(from, to) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [fromRest, fromIndex] = tail(from);
    const [, fromParent] = this.getNode(fromRest);
    if (!(fromParent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    const fromSize = fromParent.getChildSize(fromIndex);
    const fromNode = fromParent.children[fromIndex];
    if (!(fromNode instanceof LeafNode)) {
      throw new Error("Invalid from location");
    }
    const [toRest, toIndex] = tail(to);
    const [, toParent] = this.getNode(toRest);
    if (!(toParent instanceof BranchNode)) {
      throw new Error("Invalid to location");
    }
    const toSize = toParent.getChildSize(toIndex);
    const toNode = toParent.children[toIndex];
    if (!(toNode instanceof LeafNode)) {
      throw new Error("Invalid to location");
    }
    if (fromParent === toParent) {
      fromParent.swapChildren(fromIndex, toIndex);
    } else {
      fromParent.removeChild(fromIndex);
      toParent.removeChild(toIndex);
      fromParent.addChild(toNode, fromSize, fromIndex);
      toParent.addChild(fromNode, toSize, toIndex);
    }
    this.trySet2x2();
  }
  /**
   * Resize a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view.
   * @param size The size the view should be. Optionally provide a single dimension.
   */
  resizeView(location, size) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [rest, index] = tail(location);
    const [pathToParent, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    if (!size.width && !size.height) {
      return;
    }
    const [parentSize, grandParentSize] = parent.orientation === Orientation.HORIZONTAL ? [size.width, size.height] : [size.height, size.width];
    if (typeof grandParentSize === "number" && pathToParent.length > 0) {
      const [, grandParent] = tail(pathToParent);
      const [, parentIndex] = tail(rest);
      grandParent.resizeChild(parentIndex, grandParentSize);
    }
    if (typeof parentSize === "number") {
      parent.resizeChild(index, parentSize);
    }
    this.trySet2x2();
  }
  /**
   * Get the size of a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view. Provide `undefined` to get
   * the size of the grid itself.
   */
  getViewSize(location) {
    if (!location) {
      return { width: this.root.width, height: this.root.height };
    }
    const [, node] = this.getNode(location);
    return { width: node.width, height: node.height };
  }
  /**
   * Get the cached visible size of a {@link IView view}. This was the size
   * of the view at the moment it last became hidden.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  getViewCachedVisibleSize(location) {
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    return parent.getChildCachedVisibleSize(index);
  }
  /**
   * Maximize the size of a {@link IView view} by collapsing all other views
   * to their minimum sizes.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  expandView(location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const [ancestors, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    for (let i = 0; i < ancestors.length; i++) {
      ancestors[i].resizeChild(location[i], Number.POSITIVE_INFINITY);
    }
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewExpanded(location) {
    if (this.hasMaximizedView()) {
      return false;
    }
    const [ancestors, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Invalid location");
    }
    for (let i = 0; i < ancestors.length; i++) {
      if (!ancestors[i].isChildExpanded(location[i])) {
        return false;
      }
    }
    return true;
  }
  maximizeView(location, excludeViews = []) {
    const [, nodeToMaximize] = this.getNode(location);
    if (!(nodeToMaximize instanceof LeafNode)) {
      throw new Error("Location is not a LeafNode");
    }
    if (this.maximizedNode === nodeToMaximize) {
      return;
    }
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    const excludeViewSet = new Set(excludeViews);
    function hideAllViewsBut(parent, exclude) {
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child instanceof LeafNode) {
          if (child !== exclude && !excludeViewSet.has(child.view)) {
            parent.setChildVisible(i, false);
          }
        } else {
          hideAllViewsBut(child, exclude);
        }
      }
    }
    hideAllViewsBut(this.root, nodeToMaximize);
    this.maximizedNode = nodeToMaximize;
    this._onDidChangeViewMaximized.fire(true);
  }
  exitMaximizedView() {
    if (!this.maximizedNode) {
      return;
    }
    this.maximizedNode = void 0;
    function showViewsInReverseOrder(parent) {
      for (let index = parent.children.length - 1; index >= 0; index--) {
        const child = parent.children[index];
        if (child instanceof LeafNode) {
          parent.setChildVisible(index, true);
        } else {
          showViewsInReverseOrder(child);
        }
      }
    }
    showViewsInReverseOrder(this.root);
    this._onDidChangeViewMaximized.fire(false);
  }
  hasMaximizedView() {
    return this.maximizedNode !== void 0;
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewMaximized(location) {
    const [, node] = this.getNode(location);
    if (!(node instanceof LeafNode)) {
      throw new Error("Location is not a LeafNode");
    }
    return node === this.maximizedNode;
  }
  /**
   * Distribute the size among all {@link IView views} within the entire
   * grid or within a single {@link SplitView}.
   *
   * @param location The {@link GridLocation location} of a view containing
   * children views, which will have their sizes distributed within the parent
   * view's size. Provide `undefined` to recursively distribute all views' sizes
   * in the entire grid.
   */
  distributeViewSizes(location) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
    }
    if (!location) {
      this.root.distributeViewSizes(true);
      return;
    }
    const [, node] = this.getNode(location);
    if (!(node instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    node.distributeViewSizes();
    this.trySet2x2();
  }
  /**
   * Returns whether a {@link IView view} is visible.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  isViewVisible(location) {
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    return parent.isChildVisible(index);
  }
  /**
   * Set the visibility state of a {@link IView view}.
   *
   * @param location The {@link GridLocation location} of the view.
   */
  setViewVisible(location, visible) {
    if (this.hasMaximizedView()) {
      this.exitMaximizedView();
      return;
    }
    const [rest, index] = tail(location);
    const [, parent] = this.getNode(rest);
    if (!(parent instanceof BranchNode)) {
      throw new Error("Invalid from location");
    }
    parent.setChildVisible(index, visible);
  }
  getView(location) {
    const node = location ? this.getNode(location)[1] : this._root;
    return this._getViews(node, this.orientation);
  }
  /**
   * Construct a new {@link GridView} from a JSON object.
   *
   * @param json The JSON object.
   * @param deserializer A deserializer which can revive each view.
   * @returns A new {@link GridView} instance.
   */
  static deserialize(json, deserializer, options = {}) {
    if (typeof json.orientation !== "number") {
      throw new Error("Invalid JSON: 'orientation' property must be a number.");
    } else if (typeof json.width !== "number") {
      throw new Error("Invalid JSON: 'width' property must be a number.");
    } else if (typeof json.height !== "number") {
      throw new Error("Invalid JSON: 'height' property must be a number.");
    } else if (json.root?.type !== "branch") {
      throw new Error("Invalid JSON: 'root' property must have 'type' value of branch.");
    }
    const orientation = json.orientation;
    const height = json.height;
    const result = new GridView(options);
    result._deserialize(json.root, orientation, deserializer, height);
    return result;
  }
  _deserialize(root, orientation, deserializer, orthogonalSize) {
    this.root = this._deserializeNode(root, orientation, deserializer, orthogonalSize);
  }
  _deserializeNode(node, orientation, deserializer, orthogonalSize) {
    let result;
    if (node.type === "branch") {
      const serializedChildren = node.data;
      const children = serializedChildren.map((serializedChild) => {
        return {
          node: this._deserializeNode(serializedChild, orthogonal(orientation), deserializer, node.size),
          visible: serializedChild.visible
        };
      });
      result = new BranchNode(orientation, this.layoutController, this.styles, this.proportionalLayout, node.size, orthogonalSize, void 0, children);
    } else {
      result = new LeafNode(deserializer.fromJSON(node.data), orientation, this.layoutController, orthogonalSize, node.size);
      if (node.maximized && !this.maximizedNode) {
        this.maximizedNode = result;
        this._onDidChangeViewMaximized.fire(true);
      }
    }
    return result;
  }
  _getViews(node, orientation, cachedVisibleSize) {
    const box = { top: node.top, left: node.left, width: node.width, height: node.height };
    if (node instanceof LeafNode) {
      return { view: node.view, box, cachedVisibleSize, maximized: this.maximizedNode === node };
    }
    const children = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const cachedVisibleSize2 = node.getChildCachedVisibleSize(i);
      children.push(this._getViews(child, orthogonal(orientation), cachedVisibleSize2));
    }
    return { children, box };
  }
  getNode(location, node = this.root, path = []) {
    if (location.length === 0) {
      return [path, node];
    }
    if (!(node instanceof BranchNode)) {
      throw new Error("Invalid location");
    }
    const [index, ...rest] = location;
    if (index < 0 || index >= node.children.length) {
      throw new Error("Invalid location");
    }
    const child = node.children[index];
    path.push(node);
    return this.getNode(rest, child, path);
  }
  /**
   * Attempt to lock the {@link Sash sashes} in this {@link GridView} so
   * the grid behaves as a 2x2 matrix, with a corner sash in the middle.
   *
   * In case the grid isn't a 2x2 grid _and_ all sashes are not aligned,
   * this method is a no-op.
   */
  trySet2x2() {
    this.disposable2x2.dispose();
    this.disposable2x2 = Disposable.None;
    if (this.root.children.length !== 2) {
      return;
    }
    const [first, second] = this.root.children;
    if (!(first instanceof BranchNode) || !(second instanceof BranchNode)) {
      return;
    }
    this.disposable2x2 = first.trySet2x2(second);
  }
  /**
   * Populate a map with views to DOM nodes.
   * @remarks To be used internally only.
   */
  getViewMap(map, node) {
    if (!node) {
      node = this.root;
    }
    if (node instanceof BranchNode) {
      node.children.forEach((child) => this.getViewMap(map, child));
    } else {
      map.set(node.view, node.element);
    }
  }
  dispose() {
    this._onDidChangeViewMaximized.dispose();
    this.onDidSashResetRelay.dispose();
    this.root.dispose();
    this.element.remove();
  }
}
export {
  GridView,
  LayoutPriority2 as LayoutPriority,
  Orientation2 as Orientation,
  Sizing2 as Sizing,
  isGridBranchNode,
  orthogonal
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWR2aWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMsIE9yaWVudGF0aW9uLCBTYXNoIH0gZnJvbSAnLi4vc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IERpc3RyaWJ1dGVTaXppbmcsIElTcGxpdFZpZXdTdHlsZXMsIElWaWV3IGFzIElTcGxpdFZpZXcsIExheW91dFByaW9yaXR5LCBTaXppbmcsIEF1dG9TaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgZXF1YWxzIGFzIGFycmF5RXF1YWxzLCB0YWlsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgUmVsYXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByb3QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vZ3JpZHZpZXcuY3NzJztcblxuZXhwb3J0IHsgT3JpZW50YXRpb24gfSBmcm9tICcuLi9zYXNoL3Nhc2guanMnO1xuZXhwb3J0IHsgTGF5b3V0UHJpb3JpdHksIFNpemluZyB9IGZyb20gJy4uL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHcmlkVmlld1N0eWxlcyBleHRlbmRzIElTcGxpdFZpZXdTdHlsZXMgeyB9XG5cbmNvbnN0IGRlZmF1bHRTdHlsZXM6IElHcmlkVmlld1N0eWxlcyA9IHtcblx0c2VwYXJhdG9yQm9yZGVyOiBDb2xvci50cmFuc3BhcmVudFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJVmlld1NpemUge1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzIHtcblx0cmVhZG9ubHkgc3RhcnQ/OiBTYXNoO1xuXHRyZWFkb25seSBlbmQ/OiBTYXNoO1xuXHRyZWFkb25seSBvcnRob2dvbmFsU3RhcnQ/OiBTYXNoO1xuXHRyZWFkb25seSBvcnRob2dvbmFsRW5kPzogU2FzaDtcbn1cblxuLyoqXG4gKiBUaGUgaW50ZXJmYWNlIHRvIGltcGxlbWVudCBmb3Igdmlld3Mgd2l0aGluIGEge0BsaW5rIEdyaWRWaWV3fS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVmlldyB7XG5cblx0LyoqXG5cdCAqIFRoZSBET00gZWxlbWVudCBmb3IgdGhpcyB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0LyoqXG5cdCAqIEEgbWluaW11bSB3aWR0aCBmb3IgdGhpcyB2aWV3LlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJZiBub25lLCBzZXQgaXQgdG8gYDBgLlxuXHQgKi9cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEEgbWluaW11bSB3aWR0aCBmb3IgdGhpcyB2aWV3LlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJZiBub25lLCBzZXQgaXQgdG8gYE51bWJlci5QT1NJVElWRV9JTkZJTklUWWAuXG5cdCAqL1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogQSBtaW5pbXVtIGhlaWdodCBmb3IgdGhpcyB2aWV3LlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJZiBub25lLCBzZXQgaXQgdG8gYDBgLlxuXHQgKi9cblx0cmVhZG9ubHkgbWluaW11bUhlaWdodDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBBIG1pbmltdW0gaGVpZ2h0IGZvciB0aGlzIHZpZXcuXG5cdCAqXG5cdCAqIEByZW1hcmtzIElmIG5vbmUsIHNldCBpdCB0byBgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZYC5cblx0ICovXG5cdHJlYWRvbmx5IG1heGltdW1IZWlnaHQ6IG51bWJlcjtcblxuXHQvKipcblx0ICogVGhlIHByaW9yaXR5IG9mIHRoZSB2aWV3IHdoZW4gdGhlIHtAbGluayBHcmlkVmlld30gbGF5b3V0IGFsZ29yaXRobVxuXHQgKiBydW5zLiBWaWV3cyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIHJlc2l6ZWQgZmlyc3QuXG5cdCAqXG5cdCAqIEByZW1hcmtzIE9ubHkgdXNlZCB3aGVuIGBwcm9wb3J0aW9uYWxMYXlvdXRgIGlzIGZhbHNlLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJpb3JpdHk/OiBMYXlvdXRQcmlvcml0eTtcblxuXHQvKipcblx0ICogSWYgdGhlIHtAbGluayBHcmlkVmlld30gc3VwcG9ydHMgcHJvcG9ydGlvbmFsIGxheW91dCxcblx0ICogdGhpcyBwcm9wZXJ0eSBhbGxvd3MgZm9yIGZpbmVyIGNvbnRyb2wgb3ZlciB0aGUgcHJvcG9ydGlvbmFsIGxheW91dCBhbGdvcml0aG0sIHBlciB2aWV3LlxuXHQgKlxuXHQgKiBAZGVmYXVsdFZhbHVlIGB0cnVlYFxuXHQgKi9cblx0cmVhZG9ubHkgcHJvcG9ydGlvbmFsTGF5b3V0PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdmlldyB3aWxsIHNuYXAgd2hlbmV2ZXIgdGhlIHVzZXIgcmVhY2hlcyBpdHMgbWluaW11bSBzaXplIG9yXG5cdCAqIGF0dGVtcHRzIHRvIGdyb3cgaXQgYmV5b25kIHRoZSBtaW5pbXVtIHNpemUuXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYGZhbHNlYFxuXHQgKi9cblx0cmVhZG9ubHkgc25hcD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFZpZXcgaW5zdGFuY2VzIGFyZSBzdXBwb3NlZCB0byBmaXJlIHRoaXMgZXZlbnQgd2hlbmV2ZXIgYW55IG9mIHRoZSBjb25zdHJhaW50XG5cdCAqIHByb3BlcnRpZXMgaGF2ZSBjaGFuZ2VkOlxuXHQgKlxuXHQgKiAtIHtAbGluayBJVmlldy5taW5pbXVtV2lkdGh9XG5cdCAqIC0ge0BsaW5rIElWaWV3Lm1heGltdW1XaWR0aH1cblx0ICogLSB7QGxpbmsgSVZpZXcubWluaW11bUhlaWdodH1cblx0ICogLSB7QGxpbmsgSVZpZXcubWF4aW11bUhlaWdodH1cblx0ICogLSB7QGxpbmsgSVZpZXcucHJpb3JpdHl9XG5cdCAqIC0ge0BsaW5rIElWaWV3LnNuYXB9XG5cdCAqXG5cdCAqIFRoZSB7QGxpbmsgR3JpZFZpZXd9IHdpbGwgcmVsYXlvdXQgd2hlbmV2ZXIgdGhhdCBoYXBwZW5zLiBUaGUgZXZlbnQgY2FuXG5cdCAqIG9wdGlvbmFsbHkgZW1pdCB0aGUgdmlldydzIHByZWZlcnJlZCBzaXplIGZvciB0aGF0IHJlbGF5b3V0LlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElWaWV3U2l6ZSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFRoaXMgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIHtAbGluayBHcmlkVmlld30gZHVyaW5nIGxheW91dC4gQSB2aWV3IG1lYW50IHRvXG5cdCAqIHBhc3MgYWxvbmcgdGhlIGxheW91dCBpbmZvcm1hdGlvbiBkb3duIHRvIGl0cyBkZXNjZW5kYW50cy5cblx0ICovXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFRoaXMgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIHtAbGluayBHcmlkVmlld30gd2hlbmV2ZXIgdGhpcyB2aWV3IGlzIG1hZGVcblx0ICogdmlzaWJsZSBvciBoaWRkZW4uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aXNpYmxlIFdoZXRoZXIgdGhlIHZpZXcgYmVjb21lcyB2aXNpYmxlLlxuXHQgKi9cblx0c2V0VmlzaWJsZT8odmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFRoaXMgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIHtAbGluayBHcmlkVmlld30gd2hlbmV2ZXIgdGhpcyB2aWV3IGlzIG9uXG5cdCAqIGFuIGVkZ2Ugb2YgdGhlIGdyaWQgYW5kIHRoZSBncmlkJ3Ncblx0ICoge0BsaW5rIEdyaWRWaWV3LmJvdW5kYXJ5U2FzaGVzIGJvdW5kYXJ5IHNhc2hlc30gY2hhbmdlLlxuXHQgKi9cblx0c2V0Qm91bmRhcnlTYXNoZXM/KHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlVmlldyBleHRlbmRzIElWaWV3IHtcblx0dG9KU09OKCk6IG9iamVjdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVmlld0Rlc2VyaWFsaXplcjxUIGV4dGVuZHMgSVNlcmlhbGl6YWJsZVZpZXc+IHtcblx0ZnJvbUpTT04oanNvbjogYW55KTogVDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZExlYWZOb2RlIHtcblx0dHlwZTogJ2xlYWYnO1xuXHRkYXRhOiB1bmtub3duO1xuXHRzaXplOiBudW1iZXI7XG5cdHZpc2libGU/OiBib29sZWFuO1xuXHRtYXhpbWl6ZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkQnJhbmNoTm9kZSB7XG5cdHR5cGU6ICdicmFuY2gnO1xuXHRkYXRhOiBJU2VyaWFsaXplZE5vZGVbXTtcblx0c2l6ZTogbnVtYmVyO1xuXHR2aXNpYmxlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSVNlcmlhbGl6ZWROb2RlID0gSVNlcmlhbGl6ZWRMZWFmTm9kZSB8IElTZXJpYWxpemVkQnJhbmNoTm9kZTtcblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXplZEdyaWRWaWV3IHtcblx0cm9vdDogSVNlcmlhbGl6ZWROb2RlO1xuXHRvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHdpZHRoOiBudW1iZXI7XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb3J0aG9nb25hbChvcmllbnRhdGlvbjogT3JpZW50YXRpb24pOiBPcmllbnRhdGlvbiB7XG5cdHJldHVybiBvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQm94IHtcblx0cmVhZG9ubHkgdG9wOiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlZnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgd2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR3JpZExlYWZOb2RlIHtcblx0cmVhZG9ubHkgdmlldzogSVZpZXc7XG5cdHJlYWRvbmx5IGJveDogQm94O1xuXHRyZWFkb25seSBjYWNoZWRWaXNpYmxlU2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtYXhpbWl6ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR3JpZEJyYW5jaE5vZGUge1xuXHRyZWFkb25seSBjaGlsZHJlbjogR3JpZE5vZGVbXTtcblx0cmVhZG9ubHkgYm94OiBCb3g7XG59XG5cbmV4cG9ydCB0eXBlIEdyaWROb2RlID0gR3JpZExlYWZOb2RlIHwgR3JpZEJyYW5jaE5vZGU7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyaWRCcmFuY2hOb2RlKG5vZGU6IEdyaWROb2RlKTogbm9kZSBpcyBHcmlkQnJhbmNoTm9kZSB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRyZXR1cm4gISEobm9kZSBhcyBhbnkpLmNoaWxkcmVuO1xufVxuXG5jbGFzcyBMYXlvdXRDb250cm9sbGVyIHtcblx0Y29uc3RydWN0b3IocHVibGljIGlzTGF5b3V0RW5hYmxlZDogYm9vbGVhbikgeyB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyaWRWaWV3T3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFN0eWxlcyBvdmVycmlkaW5nIHRoZSB7QGxpbmsgZGVmYXVsdFN0eWxlcyBkZWZhdWx0IG9uZXN9LlxuXHQgKi9cblx0cmVhZG9ubHkgc3R5bGVzPzogSUdyaWRWaWV3U3R5bGVzO1xuXG5cdC8qKlxuXHQgKiBSZXNpemUgZWFjaCB2aWV3IHByb3BvcnRpb25hbGx5IHdoZW4gcmVzaXppbmcgdGhlIHtAbGluayBHcmlkVmlld30uXG5cdCAqXG5cdCAqIEBkZWZhdWx0VmFsdWUgYHRydWVgXG5cdCAqL1xuXHRyZWFkb25seSBwcm9wb3J0aW9uYWxMYXlvdXQ/OiBib29sZWFuOyAvLyBkZWZhdWx0IHRydWVcbn1cblxuaW50ZXJmYWNlIElMYXlvdXRDb250ZXh0IHtcblx0cmVhZG9ubHkgb3J0aG9nb25hbFNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgYWJzb2x1dGVPZmZzZXQ6IG51bWJlcjtcblx0cmVhZG9ubHkgYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFic29sdXRlU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBhYnNvbHV0ZU9ydGhvZ29uYWxTaXplOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHRvQWJzb2x1dGVCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24pOiBJQm91bmRhcnlTYXNoZXMge1xuXHRpZiAob3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRyZXR1cm4geyBsZWZ0OiBzYXNoZXMuc3RhcnQsIHJpZ2h0OiBzYXNoZXMuZW5kLCB0b3A6IHNhc2hlcy5vcnRob2dvbmFsU3RhcnQsIGJvdHRvbTogc2FzaGVzLm9ydGhvZ29uYWxFbmQgfTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4geyB0b3A6IHNhc2hlcy5zdGFydCwgYm90dG9tOiBzYXNoZXMuZW5kLCBsZWZ0OiBzYXNoZXMub3J0aG9nb25hbFN0YXJ0LCByaWdodDogc2FzaGVzLm9ydGhvZ29uYWxFbmQgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBmcm9tQWJzb2x1dGVCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcywgb3JpZW50YXRpb246IE9yaWVudGF0aW9uKTogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMge1xuXHRpZiAob3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRyZXR1cm4geyBzdGFydDogc2FzaGVzLmxlZnQsIGVuZDogc2FzaGVzLnJpZ2h0LCBvcnRob2dvbmFsU3RhcnQ6IHNhc2hlcy50b3AsIG9ydGhvZ29uYWxFbmQ6IHNhc2hlcy5ib3R0b20gfTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4geyBzdGFydDogc2FzaGVzLnRvcCwgZW5kOiBzYXNoZXMuYm90dG9tLCBvcnRob2dvbmFsU3RhcnQ6IHNhc2hlcy5sZWZ0LCBvcnRob2dvbmFsRW5kOiBzYXNoZXMucmlnaHQgfTtcblx0fVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUluZGV4KGluZGV4OiBudW1iZXIsIG51bUNoaWxkcmVuOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAoTWF0aC5hYnMoaW5kZXgpID4gbnVtQ2hpbGRyZW4pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaW5kZXgnKTtcblx0fVxuXG5cdHJldHVybiByb3QoaW5kZXgsIG51bUNoaWxkcmVuICsgMSk7XG59XG5cbmNsYXNzIEJyYW5jaE5vZGUgaW1wbGVtZW50cyBJU3BsaXRWaWV3PElMYXlvdXRDb250ZXh0PiwgSURpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjaGlsZHJlbjogTm9kZVtdID0gW107XG5cdHByaXZhdGUgc3BsaXR2aWV3OiBTcGxpdFZpZXc8SUxheW91dENvbnRleHQsIE5vZGU+O1xuXG5cdHByaXZhdGUgX3NpemU6IG51bWJlcjtcblx0Z2V0IHNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3NpemU7IH1cblxuXHRwcml2YXRlIF9vcnRob2dvbmFsU2l6ZTogbnVtYmVyO1xuXHRnZXQgb3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxTaXplOyB9XG5cblx0cHJpdmF0ZSBfYWJzb2x1dGVPZmZzZXQ6IG51bWJlciA9IDA7XG5cdGdldCBhYnNvbHV0ZU9mZnNldCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fYWJzb2x1dGVPZmZzZXQ7IH1cblxuXHRwcml2YXRlIF9hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IG51bWJlciA9IDA7XG5cdGdldCBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldDsgfVxuXG5cdHByaXZhdGUgYWJzb2x1dGVPcnRob2dvbmFsU2l6ZTogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9zdHlsZXM6IElHcmlkVmlld1N0eWxlcztcblx0Z2V0IHN0eWxlcygpOiBJR3JpZFZpZXdTdHlsZXMgeyByZXR1cm4gdGhpcy5fc3R5bGVzOyB9XG5cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLnNpemUgOiB0aGlzLm9ydGhvZ29uYWxTaXplO1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5vcnRob2dvbmFsU2l6ZSA6IHRoaXMuc2l6ZTtcblx0fVxuXG5cdGdldCB0b3AoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuX2Fic29sdXRlT2Zmc2V0IDogdGhpcy5fYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0O1xuXHR9XG5cblx0Z2V0IGxlZnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldCA6IHRoaXMuX2Fic29sdXRlT2Zmc2V0O1xuXHR9XG5cblx0Z2V0IG1pbmltdW1TaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwID8gMCA6IE1hdGgubWF4KC4uLnRoaXMuY2hpbGRyZW4ubWFwKChjLCBpbmRleCkgPT4gdGhpcy5zcGxpdHZpZXcuaXNWaWV3VmlzaWJsZShpbmRleCkgPyBjLm1pbmltdW1PcnRob2dvbmFsU2l6ZSA6IDApKTtcblx0fVxuXG5cdGdldCBtYXhpbXVtU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1pbiguLi50aGlzLmNoaWxkcmVuLm1hcCgoYywgaW5kZXgpID0+IHRoaXMuc3BsaXR2aWV3LmlzVmlld1Zpc2libGUoaW5kZXgpID8gYy5tYXhpbXVtT3J0aG9nb25hbFNpemUgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0fVxuXG5cdGdldCBwcmlvcml0eSgpOiBMYXlvdXRQcmlvcml0eSB7XG5cdFx0aWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gTGF5b3V0UHJpb3JpdHkuTm9ybWFsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaW9yaXRpZXMgPSB0aGlzLmNoaWxkcmVuLm1hcChjID0+IHR5cGVvZiBjLnByaW9yaXR5ID09PSAndW5kZWZpbmVkJyA/IExheW91dFByaW9yaXR5Lk5vcm1hbCA6IGMucHJpb3JpdHkpO1xuXG5cdFx0aWYgKHByaW9yaXRpZXMuc29tZShwID0+IHAgPT09IExheW91dFByaW9yaXR5LkhpZ2gpKSB7XG5cdFx0XHRyZXR1cm4gTGF5b3V0UHJpb3JpdHkuSGlnaDtcblx0XHR9IGVsc2UgaWYgKHByaW9yaXRpZXMuc29tZShwID0+IHAgPT09IExheW91dFByaW9yaXR5LkxvdykpIHtcblx0XHRcdHJldHVybiBMYXlvdXRQcmlvcml0eS5Mb3c7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIExheW91dFByaW9yaXR5Lk5vcm1hbDtcblx0fVxuXG5cdGdldCBwcm9wb3J0aW9uYWxMYXlvdXQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5ldmVyeShjID0+IGMucHJvcG9ydGlvbmFsTGF5b3V0KTtcblx0fVxuXG5cdGdldCBtaW5pbXVtT3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcubWluaW11bVNpemU7XG5cdH1cblxuXHRnZXQgbWF4aW11bU9ydGhvZ29uYWxTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuc3BsaXR2aWV3Lm1heGltdW1TaXplO1xuXHR9XG5cblx0Z2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5taW5pbXVtT3J0aG9nb25hbFNpemUgOiB0aGlzLm1pbmltdW1TaXplO1xuXHR9XG5cblx0Z2V0IG1pbmltdW1IZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWluaW11bVNpemUgOiB0aGlzLm1pbmltdW1PcnRob2dvbmFsU2l6ZTtcblx0fVxuXG5cdGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWF4aW11bU9ydGhvZ29uYWxTaXplIDogdGhpcy5tYXhpbXVtU2l6ZTtcblx0fVxuXG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm1heGltdW1TaXplIDogdGhpcy5tYXhpbXVtT3J0aG9nb25hbFNpemU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFZpc2liaWxpdHlDaGFuZ2UgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRyZWFkb25seSBvbkRpZFZpc2liaWxpdHlDaGFuZ2U6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25EaWRWaXNpYmlsaXR5Q2hhbmdlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoaWxkcmVuVmlzaWJpbGl0eUNoYW5nZURpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9vbkRpZFNjcm9sbCA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHByaXZhdGUgb25EaWRTY3JvbGxEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRTY3JvbGwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjaGlsZHJlbkNoYW5nZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2FzaFJlc2V0ID0gbmV3IEVtaXR0ZXI8R3JpZExvY2F0aW9uPigpO1xuXHRyZWFkb25seSBvbkRpZFNhc2hSZXNldDogRXZlbnQ8R3JpZExvY2F0aW9uPiA9IHRoaXMuX29uRGlkU2FzaFJlc2V0LmV2ZW50O1xuXHRwcml2YXRlIHNwbGl0dmlld1Nhc2hSZXNldERpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIGNoaWxkcmVuU2FzaFJlc2V0RGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0cHJpdmF0ZSBfYm91bmRhcnlTYXNoZXM6IElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzID0ge307XG5cdGdldCBib3VuZGFyeVNhc2hlcygpOiBJUmVsYXRpdmVCb3VuZGFyeVNhc2hlcyB7IHJldHVybiB0aGlzLl9ib3VuZGFyeVNhc2hlczsgfVxuXHRzZXQgYm91bmRhcnlTYXNoZXMoYm91bmRhcnlTYXNoZXM6IElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzKSB7XG5cdFx0aWYgKHRoaXMuX2JvdW5kYXJ5U2FzaGVzLnN0YXJ0ID09PSBib3VuZGFyeVNhc2hlcy5zdGFydFxuXHRcdFx0JiYgdGhpcy5fYm91bmRhcnlTYXNoZXMuZW5kID09PSBib3VuZGFyeVNhc2hlcy5lbmRcblx0XHRcdCYmIHRoaXMuX2JvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydCA9PT0gYm91bmRhcnlTYXNoZXMub3J0aG9nb25hbFN0YXJ0XG5cdFx0XHQmJiB0aGlzLl9ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kID09PSBib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYm91bmRhcnlTYXNoZXMgPSBib3VuZGFyeVNhc2hlcztcblxuXHRcdHRoaXMuc3BsaXR2aWV3Lm9ydGhvZ29uYWxTdGFydFNhc2ggPSBib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsU3RhcnQ7XG5cdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbEVuZFNhc2ggPSBib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kO1xuXG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baW5kZXhdO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBpbmRleCA9PT0gMDtcblx0XHRcdGNvbnN0IGxhc3QgPSBpbmRleCA9PT0gdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxO1xuXG5cdFx0XHRjaGlsZC5ib3VuZGFyeVNhc2hlcyA9IHtcblx0XHRcdFx0c3RhcnQ6IGJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxTdGFydCxcblx0XHRcdFx0ZW5kOiBib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kLFxuXHRcdFx0XHRvcnRob2dvbmFsU3RhcnQ6IGZpcnN0ID8gYm91bmRhcnlTYXNoZXMuc3RhcnQgOiBjaGlsZC5ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsU3RhcnQsXG5cdFx0XHRcdG9ydGhvZ29uYWxFbmQ6IGxhc3QgPyBib3VuZGFyeVNhc2hlcy5lbmQgOiBjaGlsZC5ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lZGdlU25hcHBpbmcgPSBmYWxzZTtcblx0Z2V0IGVkZ2VTbmFwcGluZygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2VkZ2VTbmFwcGluZzsgfVxuXHRzZXQgZWRnZVNuYXBwaW5nKGVkZ2VTbmFwcGluZzogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9lZGdlU25hcHBpbmcgPT09IGVkZ2VTbmFwcGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkZ2VTbmFwcGluZyA9IGVkZ2VTbmFwcGluZztcblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkge1xuXHRcdFx0XHRjaGlsZC5lZGdlU25hcHBpbmcgPSBlZGdlU25hcHBpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTcGxpdHZpZXdFZGdlU25hcHBpbmdFbmFibGVtZW50KCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBvcmllbnRhdGlvbjogT3JpZW50YXRpb24sXG5cdFx0cmVhZG9ubHkgbGF5b3V0Q29udHJvbGxlcjogTGF5b3V0Q29udHJvbGxlcixcblx0XHRzdHlsZXM6IElHcmlkVmlld1N0eWxlcyxcblx0XHRyZWFkb25seSBzcGxpdHZpZXdQcm9wb3J0aW9uYWxMYXlvdXQ6IGJvb2xlYW4sXG5cdFx0c2l6ZTogbnVtYmVyID0gMCxcblx0XHRvcnRob2dvbmFsU2l6ZTogbnVtYmVyID0gMCxcblx0XHRlZGdlU25hcHBpbmc6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRjaGlsZERlc2NyaXB0b3JzPzogSU5vZGVEZXNjcmlwdG9yW11cblx0KSB7XG5cdFx0dGhpcy5fc3R5bGVzID0gc3R5bGVzO1xuXHRcdHRoaXMuX3NpemUgPSBzaXplO1xuXHRcdHRoaXMuX29ydGhvZ29uYWxTaXplID0gb3J0aG9nb25hbFNpemU7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcubW9uYWNvLWdyaWQtYnJhbmNoLW5vZGUnKTtcblxuXHRcdGlmICghY2hpbGREZXNjcmlwdG9ycykge1xuXHRcdFx0Ly8gTm9ybWFsIGJlaGF2aW9yLCB3ZSBoYXZlIG5vIGNoaWxkcmVuIHlldCwganVzdCBzZXQgdXAgdGhlIHNwbGl0dmlld1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcgPSBuZXcgU3BsaXRWaWV3KHRoaXMuZWxlbWVudCwgeyBvcmllbnRhdGlvbiwgc3R5bGVzLCBwcm9wb3J0aW9uYWxMYXlvdXQ6IHNwbGl0dmlld1Byb3BvcnRpb25hbExheW91dCB9KTtcblx0XHRcdHRoaXMuc3BsaXR2aWV3LmxheW91dChzaXplLCB7IG9ydGhvZ29uYWxTaXplLCBhYnNvbHV0ZU9mZnNldDogMCwgYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0OiAwLCBhYnNvbHV0ZVNpemU6IHNpemUsIGFic29sdXRlT3J0aG9nb25hbFNpemU6IG9ydGhvZ29uYWxTaXplIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSZWNvbnN0cnVjdGlvbiBiZWhhdmlvciwgd2Ugd2FudCB0byByZWNvbnN0cnVjdCBhIHNwbGl0dmlld1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IHtcblx0XHRcdFx0dmlld3M6IGNoaWxkRGVzY3JpcHRvcnMubWFwKGNoaWxkRGVzY3JpcHRvciA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHZpZXc6IGNoaWxkRGVzY3JpcHRvci5ub2RlLFxuXHRcdFx0XHRcdFx0c2l6ZTogY2hpbGREZXNjcmlwdG9yLm5vZGUuc2l6ZSxcblx0XHRcdFx0XHRcdHZpc2libGU6IGNoaWxkRGVzY3JpcHRvci52aXNpYmxlICE9PSBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzaXplOiB0aGlzLm9ydGhvZ29uYWxTaXplXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBvcHRpb25zID0geyBwcm9wb3J0aW9uYWxMYXlvdXQ6IHNwbGl0dmlld1Byb3BvcnRpb25hbExheW91dCwgb3JpZW50YXRpb24sIHN0eWxlcyB9O1xuXG5cdFx0XHR0aGlzLmNoaWxkcmVuID0gY2hpbGREZXNjcmlwdG9ycy5tYXAoYyA9PiBjLm5vZGUpO1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcgPSBuZXcgU3BsaXRWaWV3KHRoaXMuZWxlbWVudCwgeyAuLi5vcHRpb25zLCBkZXNjcmlwdG9yIH0pO1xuXG5cdFx0XHR0aGlzLmNoaWxkcmVuLmZvckVhY2goKG5vZGUsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0ID0gaW5kZXggPT09IDA7XG5cdFx0XHRcdGNvbnN0IGxhc3QgPSBpbmRleCA9PT0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cblx0XHRcdFx0bm9kZS5ib3VuZGFyeVNhc2hlcyA9IHtcblx0XHRcdFx0XHRzdGFydDogdGhpcy5ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsU3RhcnQsXG5cdFx0XHRcdFx0ZW5kOiB0aGlzLmJvdW5kYXJ5U2FzaGVzLm9ydGhvZ29uYWxFbmQsXG5cdFx0XHRcdFx0b3J0aG9nb25hbFN0YXJ0OiBmaXJzdCA/IHRoaXMuYm91bmRhcnlTYXNoZXMuc3RhcnQgOiB0aGlzLnNwbGl0dmlldy5zYXNoZXNbaW5kZXggLSAxXSxcblx0XHRcdFx0XHRvcnRob2dvbmFsRW5kOiBsYXN0ID8gdGhpcy5ib3VuZGFyeVNhc2hlcy5lbmQgOiB0aGlzLnNwbGl0dmlldy5zYXNoZXNbaW5kZXhdLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25EaWRTYXNoUmVzZXQgPSBFdmVudC5tYXAodGhpcy5zcGxpdHZpZXcub25EaWRTYXNoUmVzZXQsIGkgPT4gW2ldKTtcblx0XHR0aGlzLnNwbGl0dmlld1Nhc2hSZXNldERpc3Bvc2FibGUgPSBvbkRpZFNhc2hSZXNldCh0aGlzLl9vbkRpZFNhc2hSZXNldC5maXJlLCB0aGlzLl9vbkRpZFNhc2hSZXNldCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuRXZlbnRzKCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElHcmlkVmlld1N0eWxlcyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0eWxlcyA9IHN0eWxlcztcblx0XHR0aGlzLnNwbGl0dmlldy5zdHlsZShzdHlsZXMpO1xuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRcdGNoaWxkLnN0eWxlKHN0eWxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KHNpemU6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGN0eDogSUxheW91dENvbnRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGF5b3V0Q29udHJvbGxlci5pc0xheW91dEVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGN0eCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdGF0ZScpO1xuXHRcdH1cblxuXHRcdC8vIGJyYW5jaCBub2RlcyBzaG91bGQgZmxpcCB0aGUgbm9ybWFsL29ydGhvZ29uYWwgZGlyZWN0aW9uc1xuXHRcdHRoaXMuX3NpemUgPSBjdHgub3J0aG9nb25hbFNpemU7XG5cdFx0dGhpcy5fb3J0aG9nb25hbFNpemUgPSBzaXplO1xuXHRcdHRoaXMuX2Fic29sdXRlT2Zmc2V0ID0gY3R4LmFic29sdXRlT2Zmc2V0ICsgb2Zmc2V0O1xuXHRcdHRoaXMuX2Fic29sdXRlT3J0aG9nb25hbE9mZnNldCA9IGN0eC5hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ7XG5cdFx0dGhpcy5hYnNvbHV0ZU9ydGhvZ29uYWxTaXplID0gY3R4LmFic29sdXRlT3J0aG9nb25hbFNpemU7XG5cblx0XHR0aGlzLnNwbGl0dmlldy5sYXlvdXQoY3R4Lm9ydGhvZ29uYWxTaXplLCB7XG5cdFx0XHRvcnRob2dvbmFsU2l6ZTogc2l6ZSxcblx0XHRcdGFic29sdXRlT2Zmc2V0OiB0aGlzLl9hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQsXG5cdFx0XHRhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IHRoaXMuX2Fic29sdXRlT2Zmc2V0LFxuXHRcdFx0YWJzb2x1dGVTaXplOiBjdHguYWJzb2x1dGVPcnRob2dvbmFsU2l6ZSxcblx0XHRcdGFic29sdXRlT3J0aG9nb25hbFNpemU6IGN0eC5hYnNvbHV0ZVNpemVcblx0XHR9KTtcblxuXHRcdHRoaXMudXBkYXRlU3BsaXR2aWV3RWRnZVNuYXBwaW5nRW5hYmxlbWVudCgpO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHRjaGlsZC5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdGFkZENoaWxkKG5vZGU6IE5vZGUsIHNpemU6IG51bWJlciB8IFNpemluZywgaW5kZXg6IG51bWJlciwgc2tpcExheW91dD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpbmRleCA9IHZhbGlkYXRlSW5kZXgoaW5kZXgsIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdHRoaXMuc3BsaXR2aWV3LmFkZFZpZXcobm9kZSwgc2l6ZSwgaW5kZXgsIHNraXBMYXlvdXQpO1xuXHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAwLCBub2RlKTtcblxuXHRcdHRoaXMudXBkYXRlQm91bmRhcnlTYXNoZXMoKTtcblx0XHR0aGlzLm9uRGlkQ2hpbGRyZW5DaGFuZ2UoKTtcblx0fVxuXG5cdHJlbW92ZUNoaWxkKGluZGV4OiBudW1iZXIsIHNpemluZz86IFNpemluZyk6IE5vZGUge1xuXHRcdGluZGV4ID0gdmFsaWRhdGVJbmRleChpbmRleCwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5zcGxpdHZpZXcucmVtb3ZlVmlldyhpbmRleCwgc2l6aW5nKTtcblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHR0aGlzLnVwZGF0ZUJvdW5kYXJ5U2FzaGVzKCk7XG5cdFx0dGhpcy5vbkRpZENoaWxkcmVuQ2hhbmdlKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cmVtb3ZlQWxsQ2hpbGRyZW4oKTogTm9kZVtdIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNwbGl0dmlldy5yZW1vdmVBbGxWaWV3cygpO1xuXG5cdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoMCwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0dGhpcy51cGRhdGVCb3VuZGFyeVNhc2hlcygpO1xuXHRcdHRoaXMub25EaWRDaGlsZHJlbkNoYW5nZSgpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdG1vdmVDaGlsZChmcm9tOiBudW1iZXIsIHRvOiBudW1iZXIpOiB2b2lkIHtcblx0XHRmcm9tID0gdmFsaWRhdGVJbmRleChmcm9tLCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cdFx0dG8gPSB2YWxpZGF0ZUluZGV4KHRvLCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHRpZiAoZnJvbSA9PT0gdG8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZnJvbSA8IHRvKSB7XG5cdFx0XHR0byAtPSAxO1xuXHRcdH1cblxuXHRcdHRoaXMuc3BsaXR2aWV3Lm1vdmVWaWV3KGZyb20sIHRvKTtcblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZSh0bywgMCwgdGhpcy5jaGlsZHJlbi5zcGxpY2UoZnJvbSwgMSlbMF0pO1xuXG5cdFx0dGhpcy51cGRhdGVCb3VuZGFyeVNhc2hlcygpO1xuXHRcdHRoaXMub25EaWRDaGlsZHJlbkNoYW5nZSgpO1xuXHR9XG5cblx0c3dhcENoaWxkcmVuKGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuXHRcdGZyb20gPSB2YWxpZGF0ZUluZGV4KGZyb20sIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblx0XHR0byA9IHZhbGlkYXRlSW5kZXgodG8sIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdGlmIChmcm9tID09PSB0bykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc3BsaXR2aWV3LnN3YXBWaWV3cyhmcm9tLCB0byk7XG5cblx0XHQvLyBzd2FwIGJvdW5kYXJ5IHNhc2hlc1xuXHRcdFt0aGlzLmNoaWxkcmVuW2Zyb21dLmJvdW5kYXJ5U2FzaGVzLCB0aGlzLmNoaWxkcmVuW3RvXS5ib3VuZGFyeVNhc2hlc11cblx0XHRcdD0gW3RoaXMuY2hpbGRyZW5bZnJvbV0uYm91bmRhcnlTYXNoZXMsIHRoaXMuY2hpbGRyZW5bdG9dLmJvdW5kYXJ5U2FzaGVzXTtcblxuXHRcdC8vIHN3YXAgY2hpbGRyZW5cblx0XHRbdGhpcy5jaGlsZHJlbltmcm9tXSwgdGhpcy5jaGlsZHJlblt0b11dID0gW3RoaXMuY2hpbGRyZW5bdG9dLCB0aGlzLmNoaWxkcmVuW2Zyb21dXTtcblxuXHRcdHRoaXMub25EaWRDaGlsZHJlbkNoYW5nZSgpO1xuXHR9XG5cblx0cmVzaXplQ2hpbGQoaW5kZXg6IG51bWJlciwgc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aW5kZXggPSB2YWxpZGF0ZUluZGV4KGluZGV4LCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHR0aGlzLnNwbGl0dmlldy5yZXNpemVWaWV3KGluZGV4LCBzaXplKTtcblx0fVxuXG5cdGlzQ2hpbGRFeHBhbmRlZChpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3BsaXR2aWV3LmlzVmlld0V4cGFuZGVkKGluZGV4KTtcblx0fVxuXG5cdGRpc3RyaWJ1dGVWaWV3U2l6ZXMocmVjdXJzaXZlID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLnNwbGl0dmlldy5kaXN0cmlidXRlVmlld1NpemVzKCk7XG5cblx0XHRpZiAocmVjdXJzaXZlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkge1xuXHRcdFx0XHRcdGNoaWxkLmRpc3RyaWJ1dGVWaWV3U2l6ZXModHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRDaGlsZFNpemUoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aW5kZXggPSB2YWxpZGF0ZUluZGV4KGluZGV4LCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcuZ2V0Vmlld1NpemUoaW5kZXgpO1xuXHR9XG5cblx0aXNDaGlsZFZpc2libGUoaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGluZGV4ID0gdmFsaWRhdGVJbmRleChpbmRleCwgdGhpcy5jaGlsZHJlbi5sZW5ndGgpO1xuXG5cdFx0cmV0dXJuIHRoaXMuc3BsaXR2aWV3LmlzVmlld1Zpc2libGUoaW5kZXgpO1xuXHR9XG5cblx0c2V0Q2hpbGRWaXNpYmxlKGluZGV4OiBudW1iZXIsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpbmRleCA9IHZhbGlkYXRlSW5kZXgoaW5kZXgsIHRoaXMuY2hpbGRyZW4ubGVuZ3RoKTtcblxuXHRcdGlmICh0aGlzLnNwbGl0dmlldy5pc1ZpZXdWaXNpYmxlKGluZGV4KSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdlcmVBbGxDaGlsZHJlbkhpZGRlbiA9IHRoaXMuc3BsaXR2aWV3LmNvbnRlbnRTaXplID09PSAwO1xuXHRcdHRoaXMuc3BsaXR2aWV3LnNldFZpZXdWaXNpYmxlKGluZGV4LCB2aXNpYmxlKTtcblx0XHRjb25zdCBhcmVBbGxDaGlsZHJlbkhpZGRlbiA9IHRoaXMuc3BsaXR2aWV3LmNvbnRlbnRTaXplID09PSAwO1xuXG5cdFx0Ly8gSWYgYWxsIGNoaWxkcmVuIGFyZSBoaWRkZW4gdGhlbiB0aGUgcGFyZW50IHNob3VsZCBoaWRlIHRoZSBlbnRpcmUgc3BsaXR2aWV3XG5cdFx0Ly8gSWYgdGhlIGVudGlyZSBzcGxpdHZpZXcgaXMgaGlkZGVuIHRoZW4gdGhlIHBhcmVudCBzaG91bGQgc2hvdyB0aGUgc3BsaXR2aWV3IHdoZW4gYSBjaGlsZCBpcyBzaG93blxuXHRcdGlmICgodmlzaWJsZSAmJiB3ZXJlQWxsQ2hpbGRyZW5IaWRkZW4pIHx8ICghdmlzaWJsZSAmJiBhcmVBbGxDaGlsZHJlbkhpZGRlbikpIHtcblx0XHRcdHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5maXJlKHZpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdGdldENoaWxkQ2FjaGVkVmlzaWJsZVNpemUoaW5kZXg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aW5kZXggPSB2YWxpZGF0ZUluZGV4KGluZGV4LCB0aGlzLmNoaWxkcmVuLmxlbmd0aCk7XG5cblx0XHRyZXR1cm4gdGhpcy5zcGxpdHZpZXcuZ2V0Vmlld0NhY2hlZFZpc2libGVTaXplKGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQm91bmRhcnlTYXNoZXMoKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuW2ldLmJvdW5kYXJ5U2FzaGVzID0ge1xuXHRcdFx0XHRzdGFydDogdGhpcy5ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsU3RhcnQsXG5cdFx0XHRcdGVuZDogdGhpcy5ib3VuZGFyeVNhc2hlcy5vcnRob2dvbmFsRW5kLFxuXHRcdFx0XHRvcnRob2dvbmFsU3RhcnQ6IGkgPT09IDAgPyB0aGlzLmJvdW5kYXJ5U2FzaGVzLnN0YXJ0IDogdGhpcy5zcGxpdHZpZXcuc2FzaGVzW2kgLSAxXSxcblx0XHRcdFx0b3J0aG9nb25hbEVuZDogaSA9PT0gdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxID8gdGhpcy5ib3VuZGFyeVNhc2hlcy5lbmQgOiB0aGlzLnNwbGl0dmlldy5zYXNoZXNbaV0sXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGlsZHJlbkNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZUNoaWxkcmVuRXZlbnRzKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGlsZHJlbkV2ZW50cygpOiB2b2lkIHtcblx0XHRjb25zdCBvbkRpZENoaWxkcmVuQ2hhbmdlID0gRXZlbnQubWFwKEV2ZW50LmFueSguLi50aGlzLmNoaWxkcmVuLm1hcChjID0+IGMub25EaWRDaGFuZ2UpKSwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR0aGlzLmNoaWxkcmVuQ2hhbmdlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jaGlsZHJlbkNoYW5nZURpc3Bvc2FibGUgPSBvbkRpZENoaWxkcmVuQ2hhbmdlKHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUsIHRoaXMuX29uRGlkQ2hhbmdlKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hpbGRyZW5TYXNoUmVzZXQgPSBFdmVudC5hbnkoLi4udGhpcy5jaGlsZHJlbi5tYXAoKGMsIGkpID0+IEV2ZW50Lm1hcChjLm9uRGlkU2FzaFJlc2V0LCBsb2NhdGlvbiA9PiBbaSwgLi4ubG9jYXRpb25dKSkpO1xuXHRcdHRoaXMuY2hpbGRyZW5TYXNoUmVzZXREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNoaWxkcmVuU2FzaFJlc2V0RGlzcG9zYWJsZSA9IG9uRGlkQ2hpbGRyZW5TYXNoUmVzZXQodGhpcy5fb25EaWRTYXNoUmVzZXQuZmlyZSwgdGhpcy5fb25EaWRTYXNoUmVzZXQpO1xuXG5cdFx0Y29uc3Qgb25EaWRTY3JvbGwgPSBFdmVudC5hbnkoRXZlbnQuc2lnbmFsKHRoaXMuc3BsaXR2aWV3Lm9uRGlkU2Nyb2xsKSwgLi4udGhpcy5jaGlsZHJlbi5tYXAoYyA9PiBjLm9uRGlkU2Nyb2xsKSk7XG5cdFx0dGhpcy5vbkRpZFNjcm9sbERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMub25EaWRTY3JvbGxEaXNwb3NhYmxlID0gb25EaWRTY3JvbGwodGhpcy5fb25EaWRTY3JvbGwuZmlyZSwgdGhpcy5fb25EaWRTY3JvbGwpO1xuXG5cdFx0dGhpcy5jaGlsZHJlblZpc2liaWxpdHlDaGFuZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0dGhpcy5jaGlsZHJlbi5mb3JFYWNoKChjaGlsZCwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHtcblx0XHRcdFx0dGhpcy5jaGlsZHJlblZpc2liaWxpdHlDaGFuZ2VEaXNwb3NhYmxlLmFkZChjaGlsZC5vbkRpZFZpc2liaWxpdHlDaGFuZ2UoKHZpc2libGUpID0+IHtcblx0XHRcdFx0XHR0aGlzLnNldENoaWxkVmlzaWJsZShpbmRleCwgdmlzaWJsZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHRyeVNldDJ4MihvdGhlcjogQnJhbmNoTm9kZSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggIT09IDIgfHwgb3RoZXIuY2hpbGRyZW4ubGVuZ3RoICE9PSAyKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdldENoaWxkU2l6ZSgwKSAhPT0gb3RoZXIuZ2V0Q2hpbGRTaXplKDApKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtmaXJzdENoaWxkLCBzZWNvbmRDaGlsZF0gPSB0aGlzLmNoaWxkcmVuO1xuXHRcdGNvbnN0IFtvdGhlckZpcnN0Q2hpbGQsIG90aGVyU2Vjb25kQ2hpbGRdID0gb3RoZXIuY2hpbGRyZW47XG5cblx0XHRpZiAoIShmaXJzdENoaWxkIGluc3RhbmNlb2YgTGVhZk5vZGUpIHx8ICEoc2Vjb25kQ2hpbGQgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cdFx0aWYgKCEob3RoZXJGaXJzdENoaWxkIGluc3RhbmNlb2YgTGVhZk5vZGUpIHx8ICEob3RoZXJTZWNvbmRDaGlsZCBpbnN0YW5jZW9mIExlYWZOb2RlKSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdHNlY29uZENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IG90aGVyRmlyc3RDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gZmlyc3RDaGlsZDtcblx0XHRcdGZpcnN0Q2hpbGQubGlua2VkV2lkdGhOb2RlID0gb3RoZXJTZWNvbmRDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gc2Vjb25kQ2hpbGQ7XG5cdFx0XHRvdGhlclNlY29uZENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IGZpcnN0Q2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IG90aGVyRmlyc3RDaGlsZDtcblx0XHRcdG90aGVyRmlyc3RDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSBzZWNvbmRDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gb3RoZXJTZWNvbmRDaGlsZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3RoZXJGaXJzdENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBmaXJzdENoaWxkO1xuXHRcdFx0b3RoZXJTZWNvbmRDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSBmaXJzdENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBzZWNvbmRDaGlsZDtcblx0XHRcdGZpcnN0Q2hpbGQubGlua2VkV2lkdGhOb2RlID0gb3RoZXJTZWNvbmRDaGlsZC5saW5rZWRIZWlnaHROb2RlID0gb3RoZXJGaXJzdENoaWxkO1xuXHRcdFx0c2Vjb25kQ2hpbGQubGlua2VkV2lkdGhOb2RlID0gb3RoZXJGaXJzdENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBvdGhlclNlY29uZENoaWxkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG15U2FzaCA9IHRoaXMuc3BsaXR2aWV3LnNhc2hlc1swXTtcblx0XHRjb25zdCBvdGhlclNhc2ggPSBvdGhlci5zcGxpdHZpZXcuc2FzaGVzWzBdO1xuXHRcdG15U2FzaC5saW5rZWRTYXNoID0gb3RoZXJTYXNoO1xuXHRcdG90aGVyU2FzaC5saW5rZWRTYXNoID0gbXlTYXNoO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdG90aGVyLl9vbkRpZENoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdG15U2FzaC5saW5rZWRTYXNoID0gb3RoZXJTYXNoLmxpbmtlZFNhc2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRmaXJzdENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBmaXJzdENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdHNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBzZWNvbmRDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRvdGhlckZpcnN0Q2hpbGQubGlua2VkSGVpZ2h0Tm9kZSA9IG90aGVyRmlyc3RDaGlsZC5saW5rZWRXaWR0aE5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRvdGhlclNlY29uZENoaWxkLmxpbmtlZEhlaWdodE5vZGUgPSBvdGhlclNlY29uZENoaWxkLmxpbmtlZFdpZHRoTm9kZSA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3BsaXR2aWV3RWRnZVNuYXBwaW5nRW5hYmxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLnNwbGl0dmlldy5zdGFydFNuYXBwaW5nRW5hYmxlZCA9IHRoaXMuX2VkZ2VTbmFwcGluZyB8fCB0aGlzLl9hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQgPiAwO1xuXHRcdHRoaXMuc3BsaXR2aWV3LmVuZFNuYXBwaW5nRW5hYmxlZCA9IHRoaXMuX2VkZ2VTbmFwcGluZyB8fCB0aGlzLl9hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQgKyB0aGlzLl9zaXplIDwgdGhpcy5hYnNvbHV0ZU9ydGhvZ29uYWxTaXplO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGNoaWxkLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRTY3JvbGwuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkU2FzaFJlc2V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFZpc2liaWxpdHlDaGFuZ2UuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5jaGlsZHJlblZpc2liaWxpdHlDaGFuZ2VEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnNwbGl0dmlld1Nhc2hSZXNldERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2hpbGRyZW5TYXNoUmVzZXREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNoaWxkcmVuQ2hhbmdlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vbkRpZFNjcm9sbERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuc3BsaXR2aWV3LmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBsYXRjaGVkIGV2ZW50IHRoYXQgYXZvaWRzIGJlaW5nIGZpcmVkIHdoZW4gdGhlIHZpZXdcbiAqIGNvbnN0cmFpbnRzIGRvIG5vdCBjaGFuZ2UgYXQgYWxsLlxuICovXG5mdW5jdGlvbiBjcmVhdGVMYXRjaGVkT25EaWRDaGFuZ2VWaWV3RXZlbnQodmlldzogSVZpZXcpOiBFdmVudDxJVmlld1NpemUgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgW29uRGlkQ2hhbmdlVmlld0NvbnN0cmFpbnRzLCBvbkRpZFNldFZpZXdTaXplXSA9IEV2ZW50LnNwbGl0PHVuZGVmaW5lZCwgSVZpZXdTaXplPih2aWV3Lm9uRGlkQ2hhbmdlLCBpc1VuZGVmaW5lZCk7XG5cblx0cmV0dXJuIEV2ZW50LmFueShcblx0XHRvbkRpZFNldFZpZXdTaXplLFxuXHRcdEV2ZW50Lm1hcChcblx0XHRcdEV2ZW50LmxhdGNoKFxuXHRcdFx0XHRFdmVudC5tYXAob25EaWRDaGFuZ2VWaWV3Q29uc3RyYWludHMsIF8gPT4gKFt2aWV3Lm1pbmltdW1XaWR0aCwgdmlldy5tYXhpbXVtV2lkdGgsIHZpZXcubWluaW11bUhlaWdodCwgdmlldy5tYXhpbXVtSGVpZ2h0XSkpLFxuXHRcdFx0XHRhcnJheUVxdWFsc1xuXHRcdFx0KSxcblx0XHRcdF8gPT4gdW5kZWZpbmVkXG5cdFx0KVxuXHQpO1xufVxuXG5jbGFzcyBMZWFmTm9kZSBpbXBsZW1lbnRzIElTcGxpdFZpZXc8SUxheW91dENvbnRleHQ+LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfc2l6ZTogbnVtYmVyID0gMDtcblx0Z2V0IHNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3NpemU7IH1cblxuXHRwcml2YXRlIF9vcnRob2dvbmFsU2l6ZTogbnVtYmVyO1xuXHRnZXQgb3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxTaXplOyB9XG5cblx0cHJpdmF0ZSBhYnNvbHV0ZU9mZnNldDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IG51bWJlciA9IDA7XG5cblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRTYXNoUmVzZXQ6IEV2ZW50PEdyaWRMb2NhdGlvbj4gPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgX29uRGlkTGlua2VkV2lkdGhOb2RlQ2hhbmdlID0gbmV3IFJlbGF5PG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0cHJpdmF0ZSBfbGlua2VkV2lkdGhOb2RlOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGxpbmtlZFdpZHRoTm9kZSgpOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9saW5rZWRXaWR0aE5vZGU7IH1cblx0c2V0IGxpbmtlZFdpZHRoTm9kZShub2RlOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29uRGlkTGlua2VkV2lkdGhOb2RlQ2hhbmdlLmlucHV0ID0gbm9kZSA/IG5vZGUuX29uRGlkVmlld0NoYW5nZSA6IEV2ZW50Lk5vbmU7XG5cdFx0dGhpcy5fbGlua2VkV2lkdGhOb2RlID0gbm9kZTtcblx0XHR0aGlzLl9vbkRpZFNldExpbmtlZE5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRMaW5rZWRIZWlnaHROb2RlQ2hhbmdlID0gbmV3IFJlbGF5PG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0cHJpdmF0ZSBfbGlua2VkSGVpZ2h0Tm9kZTogTGVhZk5vZGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBsaW5rZWRIZWlnaHROb2RlKCk6IExlYWZOb2RlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2xpbmtlZEhlaWdodE5vZGU7IH1cblx0c2V0IGxpbmtlZEhlaWdodE5vZGUobm9kZTogTGVhZk5vZGUgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9vbkRpZExpbmtlZEhlaWdodE5vZGVDaGFuZ2UuaW5wdXQgPSBub2RlID8gbm9kZS5fb25EaWRWaWV3Q2hhbmdlIDogRXZlbnQuTm9uZTtcblx0XHR0aGlzLl9saW5rZWRIZWlnaHROb2RlID0gbm9kZTtcblx0XHR0aGlzLl9vbkRpZFNldExpbmtlZE5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXRMaW5rZWROb2RlID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRwcml2YXRlIF9vbkRpZFZpZXdDaGFuZ2U6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxudW1iZXIgfCB1bmRlZmluZWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgdmlldzogSVZpZXcsXG5cdFx0cmVhZG9ubHkgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLFxuXHRcdHJlYWRvbmx5IGxheW91dENvbnRyb2xsZXI6IExheW91dENvbnRyb2xsZXIsXG5cdFx0b3J0aG9nb25hbFNpemU6IG51bWJlcixcblx0XHRzaXplOiBudW1iZXIgPSAwXG5cdCkge1xuXHRcdHRoaXMuX29ydGhvZ29uYWxTaXplID0gb3J0aG9nb25hbFNpemU7XG5cdFx0dGhpcy5fc2l6ZSA9IHNpemU7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IGNyZWF0ZUxhdGNoZWRPbkRpZENoYW5nZVZpZXdFdmVudCh2aWV3KTtcblx0XHR0aGlzLl9vbkRpZFZpZXdDaGFuZ2UgPSBFdmVudC5tYXAob25EaWRDaGFuZ2UsIGUgPT4gZSAmJiAodGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBlLndpZHRoIDogZS5oZWlnaHQpLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gRXZlbnQuYW55KHRoaXMuX29uRGlkVmlld0NoYW5nZSwgdGhpcy5fb25EaWRTZXRMaW5rZWROb2RlLmV2ZW50LCB0aGlzLl9vbkRpZExpbmtlZFdpZHRoTm9kZUNoYW5nZS5ldmVudCwgdGhpcy5fb25EaWRMaW5rZWRIZWlnaHROb2RlQ2hhbmdlLmV2ZW50KTtcblx0fVxuXG5cdGdldCB3aWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5vcnRob2dvbmFsU2l6ZSA6IHRoaXMuc2l6ZTtcblx0fVxuXG5cdGdldCBoZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuc2l6ZSA6IHRoaXMub3J0aG9nb25hbFNpemU7XG5cdH1cblxuXHRnZXQgdG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLmFic29sdXRlT2Zmc2V0IDogdGhpcy5hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ7XG5cdH1cblxuXHRnZXQgbGVmdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQgOiB0aGlzLmFic29sdXRlT2Zmc2V0O1xuXHR9XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpbmtlZFdpZHRoTm9kZSA/IE1hdGgubWF4KHRoaXMubGlua2VkV2lkdGhOb2RlLnZpZXcubWluaW11bVdpZHRoLCB0aGlzLnZpZXcubWluaW11bVdpZHRoKSA6IHRoaXMudmlldy5taW5pbXVtV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGdldCBtYXhpbXVtV2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saW5rZWRXaWR0aE5vZGUgPyBNYXRoLm1pbih0aGlzLmxpbmtlZFdpZHRoTm9kZS52aWV3Lm1heGltdW1XaWR0aCwgdGhpcy52aWV3Lm1heGltdW1XaWR0aCkgOiB0aGlzLnZpZXcubWF4aW11bVdpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpbmtlZEhlaWdodE5vZGUgPyBNYXRoLm1heCh0aGlzLmxpbmtlZEhlaWdodE5vZGUudmlldy5taW5pbXVtSGVpZ2h0LCB0aGlzLnZpZXcubWluaW11bUhlaWdodCkgOiB0aGlzLnZpZXcubWluaW11bUhlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IG1heGltdW1IZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saW5rZWRIZWlnaHROb2RlID8gTWF0aC5taW4odGhpcy5saW5rZWRIZWlnaHROb2RlLnZpZXcubWF4aW11bUhlaWdodCwgdGhpcy52aWV3Lm1heGltdW1IZWlnaHQpIDogdGhpcy52aWV3Lm1heGltdW1IZWlnaHQ7XG5cdH1cblxuXHRnZXQgbWluaW11bVNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWluaW11bUhlaWdodCA6IHRoaXMubWluaW11bVdpZHRoO1xuXHR9XG5cblx0Z2V0IG1heGltdW1TaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLm1heGltdW1IZWlnaHQgOiB0aGlzLm1heGltdW1XaWR0aDtcblx0fVxuXG5cdGdldCBwcmlvcml0eSgpOiBMYXlvdXRQcmlvcml0eSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5wcmlvcml0eTtcblx0fVxuXG5cdGdldCBwcm9wb3J0aW9uYWxMYXlvdXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5wcm9wb3J0aW9uYWxMYXlvdXQgPz8gdHJ1ZTtcblx0fVxuXG5cdGdldCBzbmFwKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuc25hcDtcblx0fVxuXG5cdGdldCBtaW5pbXVtT3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMubWluaW11bVdpZHRoIDogdGhpcy5taW5pbXVtSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IG1heGltdW1PcnRob2dvbmFsU2l6ZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5tYXhpbXVtV2lkdGggOiB0aGlzLm1heGltdW1IZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9ib3VuZGFyeVNhc2hlczogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMgPSB7fTtcblx0Z2V0IGJvdW5kYXJ5U2FzaGVzKCk6IElSZWxhdGl2ZUJvdW5kYXJ5U2FzaGVzIHsgcmV0dXJuIHRoaXMuX2JvdW5kYXJ5U2FzaGVzOyB9XG5cdHNldCBib3VuZGFyeVNhc2hlcyhib3VuZGFyeVNhc2hlczogSVJlbGF0aXZlQm91bmRhcnlTYXNoZXMpIHtcblx0XHR0aGlzLl9ib3VuZGFyeVNhc2hlcyA9IGJvdW5kYXJ5U2FzaGVzO1xuXG5cdFx0dGhpcy52aWV3LnNldEJvdW5kYXJ5U2FzaGVzPy4odG9BYnNvbHV0ZUJvdW5kYXJ5U2FzaGVzKGJvdW5kYXJ5U2FzaGVzLCB0aGlzLm9yaWVudGF0aW9uKSk7XG5cdH1cblxuXHRsYXlvdXQoc2l6ZTogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgY3R4OiBJTGF5b3V0Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXlvdXRDb250cm9sbGVyLmlzTGF5b3V0RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgY3R4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5fb3J0aG9nb25hbFNpemUgPSBjdHgub3J0aG9nb25hbFNpemU7XG5cdFx0dGhpcy5hYnNvbHV0ZU9mZnNldCA9IGN0eC5hYnNvbHV0ZU9mZnNldCArIG9mZnNldDtcblx0XHR0aGlzLmFic29sdXRlT3J0aG9nb25hbE9mZnNldCA9IGN0eC5hYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ7XG5cblx0XHR0aGlzLl9sYXlvdXQodGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIHRoaXMudG9wLCB0aGlzLmxlZnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWNoZWRXaWR0aDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBjYWNoZWRIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgY2FjaGVkVG9wOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGNhY2hlZExlZnQ6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGggPT09IHdpZHRoICYmIHRoaXMuY2FjaGVkSGVpZ2h0ID09PSBoZWlnaHQgJiYgdGhpcy5jYWNoZWRUb3AgPT09IHRvcCAmJiB0aGlzLmNhY2hlZExlZnQgPT09IGxlZnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNhY2hlZFdpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5jYWNoZWRIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5jYWNoZWRUb3AgPSB0b3A7XG5cdFx0dGhpcy5jYWNoZWRMZWZ0ID0gbGVmdDtcblx0XHR0aGlzLnZpZXcubGF5b3V0KHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCk7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcuc2V0VmlzaWJsZT8uKHZpc2libGUpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFNldExpbmtlZE5vZGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnR5cGUgTm9kZSA9IEJyYW5jaE5vZGUgfCBMZWFmTm9kZTtcblxuZXhwb3J0IGludGVyZmFjZSBJTm9kZURlc2NyaXB0b3Ige1xuXHRub2RlOiBOb2RlO1xuXHR2aXNpYmxlPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmxpcE5vZGUobm9kZTogQnJhbmNoTm9kZSwgc2l6ZTogbnVtYmVyLCBvcnRob2dvbmFsU2l6ZTogbnVtYmVyKTogQnJhbmNoTm9kZTtcbmZ1bmN0aW9uIGZsaXBOb2RlKG5vZGU6IExlYWZOb2RlLCBzaXplOiBudW1iZXIsIG9ydGhvZ29uYWxTaXplOiBudW1iZXIpOiBMZWFmTm9kZTtcbmZ1bmN0aW9uIGZsaXBOb2RlKG5vZGU6IE5vZGUsIHNpemU6IG51bWJlciwgb3J0aG9nb25hbFNpemU6IG51bWJlcik6IE5vZGU7XG5mdW5jdGlvbiBmbGlwTm9kZShub2RlOiBOb2RlLCBzaXplOiBudW1iZXIsIG9ydGhvZ29uYWxTaXplOiBudW1iZXIpOiBOb2RlIHtcblx0aWYgKG5vZGUgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEJyYW5jaE5vZGUob3J0aG9nb25hbChub2RlLm9yaWVudGF0aW9uKSwgbm9kZS5sYXlvdXRDb250cm9sbGVyLCBub2RlLnN0eWxlcywgbm9kZS5zcGxpdHZpZXdQcm9wb3J0aW9uYWxMYXlvdXQsIHNpemUsIG9ydGhvZ29uYWxTaXplLCBub2RlLmVkZ2VTbmFwcGluZyk7XG5cblx0XHRsZXQgdG90YWxTaXplID0gMDtcblxuXHRcdGZvciAobGV0IGkgPSBub2RlLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IG5vZGUuY2hpbGRyZW5baV07XG5cdFx0XHRjb25zdCBjaGlsZFNpemUgPSBjaGlsZCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUgPyBjaGlsZC5vcnRob2dvbmFsU2l6ZSA6IGNoaWxkLnNpemU7XG5cblx0XHRcdGxldCBuZXdTaXplID0gbm9kZS5zaXplID09PSAwID8gMCA6IE1hdGgucm91bmQoKHNpemUgKiBjaGlsZFNpemUpIC8gbm9kZS5zaXplKTtcblx0XHRcdHRvdGFsU2l6ZSArPSBuZXdTaXplO1xuXG5cdFx0XHQvLyBUaGUgbGFzdCB2aWV3IHRvIGFkZCBzaG91bGQgYWRqdXN0IHRvIHJvdW5kaW5nIGVycm9yc1xuXHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0bmV3U2l6ZSArPSBzaXplIC0gdG90YWxTaXplO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQuYWRkQ2hpbGQoZmxpcE5vZGUoY2hpbGQsIG9ydGhvZ29uYWxTaXplLCBuZXdTaXplKSwgbmV3U2l6ZSwgMCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0bm9kZS5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSBlbHNlIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTGVhZk5vZGUobm9kZS52aWV3LCBvcnRob2dvbmFsKG5vZGUub3JpZW50YXRpb24pLCBub2RlLmxheW91dENvbnRyb2xsZXIsIG9ydGhvZ29uYWxTaXplKTtcblx0XHRub2RlLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbi8qKlxuICogVGhlIGxvY2F0aW9uIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9IHdpdGhpbiBhIHtAbGluayBHcmlkVmlld30uXG4gKlxuICogQSBHcmlkVmlldyBpcyBhIHRyZWUgY29tcG9zaXRpb24gb2YgbXVsdGlwbGUge0BsaW5rIFNwbGl0Vmlld30gaW5zdGFuY2VzLCBvcnRob2dvbmFsXG4gKiBiZXR3ZWVuIG9uZSBhbm90aGVyLiBIZXJlJ3MgYW4gZXhhbXBsZTpcbiAqXG4gKiBgYGBcbiAqICArLS0tLS0rLS0tLS0tLS0tLS0tLS0tK1xuICogIHwgIEEgIHwgICAgICBCICAgICAgICB8XG4gKiAgKy0tLS0tKy0tLS0tLS0tLSstLS0tLStcbiAqICB8ICAgICAgICBDICAgICAgfCAgICAgfFxuICogICstLS0tLS0tLS0tLS0tLS0rICBEICB8XG4gKiAgfCAgICAgICAgRSAgICAgIHwgICAgIHxcbiAqICArLS0tLS0tLS0tLS0tLS0tKy0tLS0tK1xuICogYGBgXG4gKlxuICogVGhlIGFib3ZlIGdyaWQncyB0cmVlIHN0cnVjdHVyZSBpczpcbiAqXG4gKiBgYGBcbiAqICBWZXJ0aWNhbCBTcGxpdFZpZXdcbiAqICArLUhvcml6b250YWwgU3BsaXRWaWV3XG4gKiAgfCArLUFcbiAqICB8ICstQlxuICogICstIEhvcml6b250YWwgU3BsaXRWaWV3XG4gKiAgICArLVZlcnRpY2FsIFNwbGl0Vmlld1xuICogICAgfCArLUNcbiAqICAgIHwgKy1FXG4gKiAgICArLURcbiAqIGBgYFxuICpcbiAqIFNvLCB7QGxpbmsgSVZpZXcgdmlld3N9IHdpdGhpbiBhIHtAbGluayBHcmlkVmlld30gY2FuIGJlIHJlZmVyZW5jZWQgYnlcbiAqIGEgc2VxdWVuY2Ugb2YgaW5kZXhlcywgZWFjaCBpbmRleCByZWZlcmVuY2luZyBlYWNoIFNwbGl0Vmlldy4gSGVyZSBhcmVcbiAqIGVhY2ggdmlldydzIGxvY2F0aW9ucywgZnJvbSB0aGUgZXhhbXBsZSBhYm92ZTpcbiAqXG4gKiAtIGBBYDogYFswLDBdYFxuICogLSBgQmA6IGBbMCwxXWBcbiAqIC0gYENgOiBgWzEsMCwwXWBcbiAqIC0gYERgOiBgWzEsMV1gXG4gKiAtIGBFYDogYFsxLDAsMV1gXG4gKi9cbmV4cG9ydCB0eXBlIEdyaWRMb2NhdGlvbiA9IG51bWJlcltdO1xuXG4vKipcbiAqIFRoZSB7QGxpbmsgR3JpZFZpZXd9IGlzIHRoZSBVSSBjb21wb25lbnQgd2hpY2ggaW1wbGVtZW50cyBhIHR3byBkaW1lbnNpb25hbFxuICogZmxleC1saWtlIGxheW91dCBhbGdvcml0aG0gZm9yIGEgY29sbGVjdGlvbiBvZiB7QGxpbmsgSVZpZXd9IGluc3RhbmNlcywgd2hpY2hcbiAqIGFyZSBtb3N0bHkgSFRNTEVsZW1lbnQgaW5zdGFuY2VzIHdpdGggc2l6ZSBjb25zdHJhaW50cy4gQSB7QGxpbmsgR3JpZFZpZXd9IGlzIGFcbiAqIHRyZWUgY29tcG9zaXRpb24gb2YgbXVsdGlwbGUge0BsaW5rIFNwbGl0Vmlld30gaW5zdGFuY2VzLCBvcnRob2dvbmFsIGJldHdlZW5cbiAqIG9uZSBhbm90aGVyLiBJdCB3aWxsIHJlc3BlY3QgdmlldydzIHNpemUgY29udHJhaW50cywganVzdCBsaWtlIHRoZSBTcGxpdFZpZXcuXG4gKlxuICogSXQgaGFzIGEgbG93LWxldmVsIGluZGV4IGJhc2VkIEFQSSwgYWxsb3dpbmcgZm9yIGZpbmUgZ3JhaW4gcGVyZm9ybWFudCBvcGVyYXRpb25zLlxuICogTG9vayBpbnRvIHRoZSB7QGxpbmsgR3JpZH0gd2lkZ2V0IGZvciBhIGhpZ2hlci1sZXZlbCBBUEkuXG4gKlxuICogRmVhdHVyZXM6XG4gKiAtIGZsZXgtbGlrZSBsYXlvdXQgYWxnb3JpdGhtXG4gKiAtIHNuYXAgc3VwcG9ydFxuICogLSBjb3JuZXIgc2FzaCBzdXBwb3J0XG4gKiAtIEFsdCBrZXkgbW9kaWZpZXIgYmVoYXZpb3IsIG1hY09TIHN0eWxlXG4gKiAtIGxheW91dCAoZGUpc2VyaWFsaXphdGlvblxuICovXG5leHBvcnQgY2xhc3MgR3JpZFZpZXcgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIFRoZSBET00gZWxlbWVudCBmb3IgdGhpcyB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBzdHlsZXM6IElHcmlkVmlld1N0eWxlcztcblx0cHJpdmF0ZSBwcm9wb3J0aW9uYWxMYXlvdXQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX3Jvb3QhOiBCcmFuY2hOb2RlO1xuXHRwcml2YXRlIG9uRGlkU2FzaFJlc2V0UmVsYXkgPSBuZXcgUmVsYXk8R3JpZExvY2F0aW9uPigpO1xuXHRwcml2YXRlIF9vbkRpZFNjcm9sbCA9IG5ldyBSZWxheTx2b2lkPigpO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IG5ldyBSZWxheTxJVmlld1NpemUgfCB1bmRlZmluZWQ+KCk7XG5cdHByaXZhdGUgX2JvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMgPSB7fTtcblxuXHQvKipcblx0ICogVGhlIGxheW91dCBjb250cm9sbGVyIG1ha2VzIHN1cmUgbGF5b3V0IG9ubHkgcHJvcGFnYXRlc1xuXHQgKiB0byB0aGUgdmlld3MgYWZ0ZXIgdGhlIHZlcnkgZmlyc3QgY2FsbCB0byB7QGxpbmsgR3JpZFZpZXcubGF5b3V0fS5cblx0ICovXG5cdHByaXZhdGUgbGF5b3V0Q29udHJvbGxlcjogTGF5b3V0Q29udHJvbGxlcjtcblx0cHJpdmF0ZSBkaXNwb3NhYmxlMngyOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRwcml2YXRlIGdldCByb290KCk6IEJyYW5jaE5vZGUgeyByZXR1cm4gdGhpcy5fcm9vdDsgfVxuXG5cdHByaXZhdGUgc2V0IHJvb3Qocm9vdDogQnJhbmNoTm9kZSkge1xuXHRcdGNvbnN0IG9sZFJvb3QgPSB0aGlzLl9yb290O1xuXG5cdFx0aWYgKG9sZFJvb3QpIHtcblx0XHRcdG9sZFJvb3QuZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdG9sZFJvb3QuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jvb3QgPSByb290O1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChyb290LmVsZW1lbnQpO1xuXHRcdHRoaXMub25EaWRTYXNoUmVzZXRSZWxheS5pbnB1dCA9IHJvb3Qub25EaWRTYXNoUmVzZXQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuaW5wdXQgPSBFdmVudC5tYXAocm9vdC5vbkRpZENoYW5nZSwgKCkgPT4gdW5kZWZpbmVkKTsgLy8gVE9ET1xuXHRcdHRoaXMuX29uRGlkU2Nyb2xsLmlucHV0ID0gcm9vdC5vbkRpZFNjcm9sbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgdXNlciBkb3VibGUgY2xpY2tzIGEge0BsaW5rIFNhc2ggc2FzaH0uXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFNhc2hSZXNldCA9IHRoaXMub25EaWRTYXNoUmVzZXRSZWxheS5ldmVudDtcblxuXHQvKipcblx0ICogRmlyZXMgd2hlbmV2ZXIgdGhlIHVzZXIgc2Nyb2xscyBhIHtAbGluayBTcGxpdFZpZXd9IHdpdGhpblxuXHQgKiB0aGUgZ3JpZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkU2Nyb2xsID0gdGhpcy5fb25EaWRTY3JvbGwuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIGEgdmlldyB3aXRoaW4gdGhlIGdyaWQgY2hhbmdlcyBpdHMgc2l6ZSBjb25zdHJhaW50cy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFRoZSB3aWR0aCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCB3aWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5yb290LndpZHRoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBoZWlnaHQgb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgaGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3QuaGVpZ2h0OyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIHdpZHRoIG9mIHRoZSBncmlkLlxuXHQgKi9cblx0Z2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5yb290Lm1pbmltdW1XaWR0aDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWluaW11bSBoZWlnaHQgb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5yb290Lm1pbmltdW1IZWlnaHQ7IH1cblxuXHQvKipcblx0ICogVGhlIG1heGltdW0gd2lkdGggb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnJvb3QubWF4aW11bUhlaWdodDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBoZWlnaHQgb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5yb290Lm1heGltdW1IZWlnaHQ7IH1cblxuXHRnZXQgb3JpZW50YXRpb24oKTogT3JpZW50YXRpb24geyByZXR1cm4gdGhpcy5fcm9vdC5vcmllbnRhdGlvbjsgfVxuXHRnZXQgYm91bmRhcnlTYXNoZXMoKTogSUJvdW5kYXJ5U2FzaGVzIHsgcmV0dXJuIHRoaXMuX2JvdW5kYXJ5U2FzaGVzOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBvcmllbnRhdGlvbiBvZiB0aGUgZ3JpZC4gTWF0Y2hlcyB0aGUgb3JpZW50YXRpb24gb2YgdGhlIHJvb3Rcblx0ICoge0BsaW5rIFNwbGl0Vmlld30gaW4gdGhlIGdyaWQncyB0cmVlIG1vZGVsLlxuXHQgKi9cblx0c2V0IG9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbikge1xuXHRcdGlmICh0aGlzLl9yb290Lm9yaWVudGF0aW9uID09PSBvcmllbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2l6ZSwgb3J0aG9nb25hbFNpemUsIGFic29sdXRlT2Zmc2V0LCBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQgfSA9IHRoaXMuX3Jvb3Q7XG5cdFx0dGhpcy5yb290ID0gZmxpcE5vZGUodGhpcy5fcm9vdCwgb3J0aG9nb25hbFNpemUsIHNpemUpO1xuXHRcdHRoaXMucm9vdC5sYXlvdXQoc2l6ZSwgMCwgeyBvcnRob2dvbmFsU2l6ZSwgYWJzb2x1dGVPZmZzZXQ6IGFic29sdXRlT3J0aG9nb25hbE9mZnNldCwgYWJzb2x1dGVPcnRob2dvbmFsT2Zmc2V0OiBhYnNvbHV0ZU9mZnNldCwgYWJzb2x1dGVTaXplOiBzaXplLCBhYnNvbHV0ZU9ydGhvZ29uYWxTaXplOiBvcnRob2dvbmFsU2l6ZSB9KTtcblx0XHR0aGlzLmJvdW5kYXJ5U2FzaGVzID0gdGhpcy5ib3VuZGFyeVNhc2hlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGNvbGxlY3Rpb24gb2Ygc2FzaGVzIHBlcnBlbmRpY3VsYXIgdG8gZWFjaCBlZGdlIG9mIHRoZSBncmlkLlxuXHQgKiBDb3JuZXIgc2FzaGVzIHdpbGwgYmUgY3JlYXRlZCBmb3IgZWFjaCBpbnRlcnNlY3Rpb24uXG5cdCAqL1xuXHRzZXQgYm91bmRhcnlTYXNoZXMoYm91bmRhcnlTYXNoZXM6IElCb3VuZGFyeVNhc2hlcykge1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzID0gYm91bmRhcnlTYXNoZXM7XG5cdFx0dGhpcy5yb290LmJvdW5kYXJ5U2FzaGVzID0gZnJvbUFic29sdXRlQm91bmRhcnlTYXNoZXMoYm91bmRhcnlTYXNoZXMsIHRoaXMub3JpZW50YXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuYWJsZS9kaXNhYmxlIGVkZ2Ugc25hcHBpbmcgYWNyb3NzIGFsbCBncmlkIHZpZXdzLlxuXHQgKi9cblx0c2V0IGVkZ2VTbmFwcGluZyhlZGdlU25hcHBpbmc6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnJvb3QuZWRnZVNuYXBwaW5nID0gZWRnZVNuYXBwaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXhpbWl6ZWROb2RlOiBMZWFmTm9kZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB7QGxpbmsgR3JpZFZpZXd9IGluc3RhbmNlLlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJdCdzIHRoZSBjYWxsZXIncyByZXNwb25zaWJpbGl0eSB0byBhcHBlbmQgdGhlXG5cdCAqIHtAbGluayBHcmlkVmlldy5lbGVtZW50fSB0byB0aGUgcGFnZSdzIERPTS5cblx0ICovXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IElHcmlkVmlld09wdGlvbnMgPSB7fSkge1xuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5tb25hY28tZ3JpZC12aWV3Jyk7XG5cdFx0dGhpcy5zdHlsZXMgPSBvcHRpb25zLnN0eWxlcyB8fCBkZWZhdWx0U3R5bGVzO1xuXHRcdHRoaXMucHJvcG9ydGlvbmFsTGF5b3V0ID0gdHlwZW9mIG9wdGlvbnMucHJvcG9ydGlvbmFsTGF5b3V0ICE9PSAndW5kZWZpbmVkJyA/ICEhb3B0aW9ucy5wcm9wb3J0aW9uYWxMYXlvdXQgOiB0cnVlO1xuXHRcdHRoaXMubGF5b3V0Q29udHJvbGxlciA9IG5ldyBMYXlvdXRDb250cm9sbGVyKGZhbHNlKTtcblx0XHR0aGlzLnJvb3QgPSBuZXcgQnJhbmNoTm9kZShPcmllbnRhdGlvbi5WRVJUSUNBTCwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCB0aGlzLnN0eWxlcywgdGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQpO1xuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJR3JpZFZpZXdTdHlsZXMpOiB2b2lkIHtcblx0XHR0aGlzLnN0eWxlcyA9IHN0eWxlcztcblx0XHR0aGlzLnJvb3Quc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHtAbGluayBHcmlkVmlld30uXG5cdCAqXG5cdCAqIE9wdGlvbmFsbHkgcHJvdmlkZSBhIGB0b3BgIGFuZCBgbGVmdGAgcG9zaXRpb25zLCB0aG9zZSB3aWxsIHByb3BhZ2F0ZVxuXHQgKiBhcyBhbiBvcmlnaW4gZm9yIHBvc2l0aW9ucyBwYXNzZWQgdG8ge0BsaW5rIElWaWV3LmxheW91dH0uXG5cdCAqXG5cdCAqIEBwYXJhbSB3aWR0aCBUaGUgd2lkdGggb2YgdGhlIHtAbGluayBHcmlkVmlld30uXG5cdCAqIEBwYXJhbSBoZWlnaHQgVGhlIGhlaWdodCBvZiB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICogQHBhcmFtIHRvcCBPcHRpb25hbCwgdGhlIHRvcCBsb2NhdGlvbiBvZiB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICogQHBhcmFtIGxlZnQgT3B0aW9uYWwsIHRoZSBsZWZ0IGxvY2F0aW9uIG9mIHRoZSB7QGxpbmsgR3JpZFZpZXd9LlxuXHQgKi9cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciA9IDAsIGxlZnQ6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHR0aGlzLmxheW91dENvbnRyb2xsZXIuaXNMYXlvdXRFbmFibGVkID0gdHJ1ZTtcblxuXHRcdGNvbnN0IFtzaXplLCBvcnRob2dvbmFsU2l6ZSwgb2Zmc2V0LCBvcnRob2dvbmFsT2Zmc2V0XSA9IHRoaXMucm9vdC5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IFtoZWlnaHQsIHdpZHRoLCB0b3AsIGxlZnRdIDogW3dpZHRoLCBoZWlnaHQsIGxlZnQsIHRvcF07XG5cdFx0dGhpcy5yb290LmxheW91dChzaXplLCAwLCB7IG9ydGhvZ29uYWxTaXplLCBhYnNvbHV0ZU9mZnNldDogb2Zmc2V0LCBhYnNvbHV0ZU9ydGhvZ29uYWxPZmZzZXQ6IG9ydGhvZ29uYWxPZmZzZXQsIGFic29sdXRlU2l6ZTogc2l6ZSwgYWJzb2x1dGVPcnRob2dvbmFsU2l6ZTogb3J0aG9nb25hbFNpemUgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQWRkIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIHRoaXMge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHZpZXcgdG8gYWRkLlxuXHQgKiBAcGFyYW0gc2l6ZSBFaXRoZXIgYSBmaXhlZCBzaXplLCBvciBhIGR5bmFtaWMge0BsaW5rIFNpemluZ30gc3RyYXRlZ3kuXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gdG8gaW5zZXJ0IHRoZSB2aWV3IG9uLlxuXHQgKi9cblx0YWRkVmlldyh2aWV3OiBJVmlldywgc2l6ZTogbnVtYmVyIHwgU2l6aW5nLCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NhYmxlMngyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgW3BhdGhUb1BhcmVudCwgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmIChwYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRjb25zdCBub2RlID0gbmV3IExlYWZOb2RlKHZpZXcsIG9ydGhvZ29uYWwocGFyZW50Lm9yaWVudGF0aW9uKSwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCBwYXJlbnQub3J0aG9nb25hbFNpemUpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwYXJlbnQuYWRkQ2hpbGQobm9kZSwgc2l6ZSwgaW5kZXgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdG5vZGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IFssIGdyYW5kUGFyZW50XSA9IHRhaWwocGF0aFRvUGFyZW50KTtcblx0XHRcdGNvbnN0IFssIHBhcmVudEluZGV4XSA9IHRhaWwocmVzdCk7XG5cblx0XHRcdGxldCBuZXdTaWJsaW5nU2l6ZTogbnVtYmVyIHwgU2l6aW5nID0gMDtcblxuXHRcdFx0Y29uc3QgbmV3U2libGluZ0NhY2hlZFZpc2libGVTaXplID0gZ3JhbmRQYXJlbnQuZ2V0Q2hpbGRDYWNoZWRWaXNpYmxlU2l6ZShwYXJlbnRJbmRleCk7XG5cdFx0XHRpZiAodHlwZW9mIG5ld1NpYmxpbmdDYWNoZWRWaXNpYmxlU2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0bmV3U2libGluZ1NpemUgPSBTaXppbmcuSW52aXNpYmxlKG5ld1NpYmxpbmdDYWNoZWRWaXNpYmxlU2l6ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG9sZENoaWxkID0gZ3JhbmRQYXJlbnQucmVtb3ZlQ2hpbGQocGFyZW50SW5kZXgpO1xuXHRcdFx0b2xkQ2hpbGQuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBuZXdQYXJlbnQgPSBuZXcgQnJhbmNoTm9kZShwYXJlbnQub3JpZW50YXRpb24sIHBhcmVudC5sYXlvdXRDb250cm9sbGVyLCB0aGlzLnN0eWxlcywgdGhpcy5wcm9wb3J0aW9uYWxMYXlvdXQsIHBhcmVudC5zaXplLCBwYXJlbnQub3J0aG9nb25hbFNpemUsIGdyYW5kUGFyZW50LmVkZ2VTbmFwcGluZyk7XG5cdFx0XHRncmFuZFBhcmVudC5hZGRDaGlsZChuZXdQYXJlbnQsIHBhcmVudC5zaXplLCBwYXJlbnRJbmRleCk7XG5cblx0XHRcdGNvbnN0IG5ld1NpYmxpbmcgPSBuZXcgTGVhZk5vZGUocGFyZW50LnZpZXcsIGdyYW5kUGFyZW50Lm9yaWVudGF0aW9uLCB0aGlzLmxheW91dENvbnRyb2xsZXIsIHBhcmVudC5zaXplKTtcblx0XHRcdG5ld1BhcmVudC5hZGRDaGlsZChuZXdTaWJsaW5nLCBuZXdTaWJsaW5nU2l6ZSwgMCk7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2l6ZSAhPT0gJ251bWJlcicgJiYgc2l6ZS50eXBlID09PSAnc3BsaXQnKSB7XG5cdFx0XHRcdHNpemUgPSBTaXppbmcuU3BsaXQoMCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vZGUgPSBuZXcgTGVhZk5vZGUodmlldywgZ3JhbmRQYXJlbnQub3JpZW50YXRpb24sIHRoaXMubGF5b3V0Q29udHJvbGxlciwgcGFyZW50LnNpemUpO1xuXHRcdFx0bmV3UGFyZW50LmFkZENoaWxkKG5vZGUsIHNpemUsIGluZGV4KTtcblx0XHR9XG5cblx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZSBhIHtAbGluayBJVmlldyB2aWV3fSBmcm9tIHRoaXMge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKiBAcGFyYW0gc2l6aW5nIFdoZXRoZXIgdG8gZGlzdHJpYnV0ZSBvdGhlciB7QGxpbmsgSVZpZXcgdmlld30ncyBzaXplcy5cblx0ICovXG5cdHJlbW92ZVZpZXcobG9jYXRpb246IEdyaWRMb2NhdGlvbiwgc2l6aW5nPzogRGlzdHJpYnV0ZVNpemluZyB8IEF1dG9TaXppbmcpOiBJVmlldyB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NhYmxlMngyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgW3BhdGhUb1BhcmVudCwgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmICghKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gcGFyZW50LmNoaWxkcmVuW2luZGV4XTtcblxuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBMZWFmTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHBhcmVudC5yZW1vdmVDaGlsZChpbmRleCwgc2l6aW5nKTtcblx0XHRub2RlLmRpc3Bvc2UoKTtcblxuXHRcdGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZ3JpZCBzdGF0ZScpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID4gMSkge1xuXHRcdFx0dGhpcy50cnlTZXQyeDIoKTtcblx0XHRcdHJldHVybiBub2RlLnZpZXc7XG5cdFx0fVxuXG5cdFx0aWYgKHBhdGhUb1BhcmVudC5sZW5ndGggPT09IDApIHsgLy8gcGFyZW50IGlzIHJvb3Rcblx0XHRcdGNvbnN0IHNpYmxpbmcgPSBwYXJlbnQuY2hpbGRyZW5bMF07XG5cblx0XHRcdGlmIChzaWJsaW5nIGluc3RhbmNlb2YgTGVhZk5vZGUpIHtcblx0XHRcdFx0cmV0dXJuIG5vZGUudmlldztcblx0XHRcdH1cblxuXHRcdFx0Ly8gd2UgbXVzdCBwcm9tb3RlIHNpYmxpbmcgdG8gYmUgdGhlIG5ldyByb290XG5cdFx0XHRwYXJlbnQucmVtb3ZlQ2hpbGQoMCk7XG5cdFx0XHRwYXJlbnQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5yb290ID0gc2libGluZztcblx0XHRcdHRoaXMuYm91bmRhcnlTYXNoZXMgPSB0aGlzLmJvdW5kYXJ5U2FzaGVzO1xuXHRcdFx0dGhpcy50cnlTZXQyeDIoKTtcblx0XHRcdHJldHVybiBub2RlLnZpZXc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgZ3JhbmRQYXJlbnRdID0gdGFpbChwYXRoVG9QYXJlbnQpO1xuXHRcdGNvbnN0IFssIHBhcmVudEluZGV4XSA9IHRhaWwocmVzdCk7XG5cblx0XHRjb25zdCBpc1NpYmxpbmdWaXNpYmxlID0gcGFyZW50LmlzQ2hpbGRWaXNpYmxlKDApO1xuXHRcdGNvbnN0IHNpYmxpbmcgPSBwYXJlbnQucmVtb3ZlQ2hpbGQoMCk7XG5cblx0XHRjb25zdCBzaXplcyA9IGdyYW5kUGFyZW50LmNoaWxkcmVuLm1hcCgoXywgaSkgPT4gZ3JhbmRQYXJlbnQuZ2V0Q2hpbGRTaXplKGkpKTtcblx0XHRncmFuZFBhcmVudC5yZW1vdmVDaGlsZChwYXJlbnRJbmRleCwgc2l6aW5nKTtcblx0XHRwYXJlbnQuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHNpYmxpbmcgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSB7XG5cdFx0XHRzaXplcy5zcGxpY2UocGFyZW50SW5kZXgsIDEsIC4uLnNpYmxpbmcuY2hpbGRyZW4ubWFwKGMgPT4gYy5zaXplKSk7XG5cblx0XHRcdGNvbnN0IHNpYmxpbmdDaGlsZHJlbiA9IHNpYmxpbmcucmVtb3ZlQWxsQ2hpbGRyZW4oKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzaWJsaW5nQ2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Z3JhbmRQYXJlbnQuYWRkQ2hpbGQoc2libGluZ0NoaWxkcmVuW2ldLCBzaWJsaW5nQ2hpbGRyZW5baV0uc2l6ZSwgcGFyZW50SW5kZXggKyBpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV3U2libGluZyA9IG5ldyBMZWFmTm9kZShzaWJsaW5nLnZpZXcsIG9ydGhvZ29uYWwoc2libGluZy5vcmllbnRhdGlvbiksIHRoaXMubGF5b3V0Q29udHJvbGxlciwgc2libGluZy5zaXplKTtcblx0XHRcdGNvbnN0IHNpemluZyA9IGlzU2libGluZ1Zpc2libGUgPyBzaWJsaW5nLm9ydGhvZ29uYWxTaXplIDogU2l6aW5nLkludmlzaWJsZShzaWJsaW5nLm9ydGhvZ29uYWxTaXplKTtcblx0XHRcdGdyYW5kUGFyZW50LmFkZENoaWxkKG5ld1NpYmxpbmcsIHNpemluZywgcGFyZW50SW5kZXgpO1xuXHRcdH1cblxuXHRcdHNpYmxpbmcuZGlzcG9zZSgpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzaXplcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Z3JhbmRQYXJlbnQucmVzaXplQ2hpbGQoaSwgc2l6ZXNbaV0pO1xuXHRcdH1cblxuXHRcdHRoaXMudHJ5U2V0MngyKCk7XG5cdFx0cmV0dXJuIG5vZGUudmlldztcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIGEge0BsaW5rIElWaWV3IHZpZXd9IHdpdGhpbiBpdHMgcGFyZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gcGFyZW50TG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB7QGxpbmsgSVZpZXcgdmlld30ncyBwYXJlbnQuXG5cdCAqIEBwYXJhbSBmcm9tIFRoZSBpbmRleCBvZiB0aGUge0BsaW5rIElWaWV3IHZpZXd9IHRvIG1vdmUuXG5cdCAqIEBwYXJhbSB0byBUaGUgaW5kZXggd2hlcmUgdGhlIHtAbGluayBJVmlldyB2aWV3fSBzaG91bGQgbW92ZSB0by5cblx0ICovXG5cdG1vdmVWaWV3KHBhcmVudExvY2F0aW9uOiBHcmlkTG9jYXRpb24sIGZyb206IG51bWJlciwgdG86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmhhc01heGltaXplZFZpZXcoKSkge1xuXHRcdFx0dGhpcy5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IFssIHBhcmVudF0gPSB0aGlzLmdldE5vZGUocGFyZW50TG9jYXRpb24pO1xuXG5cdFx0aWYgKCEocGFyZW50IGluc3RhbmNlb2YgQnJhbmNoTm9kZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsb2NhdGlvbicpO1xuXHRcdH1cblxuXHRcdHBhcmVudC5tb3ZlQ2hpbGQoZnJvbSwgdG8pO1xuXG5cdFx0dGhpcy50cnlTZXQyeDIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTd2FwIHR3byB7QGxpbmsgSVZpZXcgdmlld3N9IHdpdGhpbiB0aGUge0BsaW5rIEdyaWRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGZyb20gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIG9uZSB2aWV3LlxuXHQgKiBAcGFyYW0gdG8gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIGFub3RoZXIgdmlldy5cblx0ICovXG5cdHN3YXBWaWV3cyhmcm9tOiBHcmlkTG9jYXRpb24sIHRvOiBHcmlkTG9jYXRpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBbZnJvbVJlc3QsIGZyb21JbmRleF0gPSB0YWlsKGZyb20pO1xuXHRcdGNvbnN0IFssIGZyb21QYXJlbnRdID0gdGhpcy5nZXROb2RlKGZyb21SZXN0KTtcblxuXHRcdGlmICghKGZyb21QYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZyb20gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tU2l6ZSA9IGZyb21QYXJlbnQuZ2V0Q2hpbGRTaXplKGZyb21JbmRleCk7XG5cdFx0Y29uc3QgZnJvbU5vZGUgPSBmcm9tUGFyZW50LmNoaWxkcmVuW2Zyb21JbmRleF07XG5cblx0XHRpZiAoIShmcm9tTm9kZSBpbnN0YW5jZW9mIExlYWZOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZyb20gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBbdG9SZXN0LCB0b0luZGV4XSA9IHRhaWwodG8pO1xuXHRcdGNvbnN0IFssIHRvUGFyZW50XSA9IHRoaXMuZ2V0Tm9kZSh0b1Jlc3QpO1xuXG5cdFx0aWYgKCEodG9QYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRvIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9TaXplID0gdG9QYXJlbnQuZ2V0Q2hpbGRTaXplKHRvSW5kZXgpO1xuXHRcdGNvbnN0IHRvTm9kZSA9IHRvUGFyZW50LmNoaWxkcmVuW3RvSW5kZXhdO1xuXG5cdFx0aWYgKCEodG9Ob2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdG8gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRpZiAoZnJvbVBhcmVudCA9PT0gdG9QYXJlbnQpIHtcblx0XHRcdGZyb21QYXJlbnQuc3dhcENoaWxkcmVuKGZyb21JbmRleCwgdG9JbmRleCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZyb21QYXJlbnQucmVtb3ZlQ2hpbGQoZnJvbUluZGV4KTtcblx0XHRcdHRvUGFyZW50LnJlbW92ZUNoaWxkKHRvSW5kZXgpO1xuXG5cdFx0XHRmcm9tUGFyZW50LmFkZENoaWxkKHRvTm9kZSwgZnJvbVNpemUsIGZyb21JbmRleCk7XG5cdFx0XHR0b1BhcmVudC5hZGRDaGlsZChmcm9tTm9kZSwgdG9TaXplLCB0b0luZGV4KTtcblx0XHR9XG5cblx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2l6ZSBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy5cblx0ICogQHBhcmFtIHNpemUgVGhlIHNpemUgdGhlIHZpZXcgc2hvdWxkIGJlLiBPcHRpb25hbGx5IHByb3ZpZGUgYSBzaW5nbGUgZGltZW5zaW9uLlxuXHQgKi9cblx0cmVzaXplVmlldyhsb2NhdGlvbjogR3JpZExvY2F0aW9uLCBzaXplOiBQYXJ0aWFsPElWaWV3U2l6ZT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBbcmVzdCwgaW5kZXhdID0gdGFpbChsb2NhdGlvbik7XG5cdFx0Y29uc3QgW3BhdGhUb1BhcmVudCwgcGFyZW50XSA9IHRoaXMuZ2V0Tm9kZShyZXN0KTtcblxuXHRcdGlmICghKHBhcmVudCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRpZiAoIXNpemUud2lkdGggJiYgIXNpemUuaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3BhcmVudFNpemUsIGdyYW5kUGFyZW50U2l6ZV0gPSBwYXJlbnQub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBbc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHRdIDogW3NpemUuaGVpZ2h0LCBzaXplLndpZHRoXTtcblxuXHRcdGlmICh0eXBlb2YgZ3JhbmRQYXJlbnRTaXplID09PSAnbnVtYmVyJyAmJiBwYXRoVG9QYXJlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgWywgZ3JhbmRQYXJlbnRdID0gdGFpbChwYXRoVG9QYXJlbnQpO1xuXHRcdFx0Y29uc3QgWywgcGFyZW50SW5kZXhdID0gdGFpbChyZXN0KTtcblxuXHRcdFx0Z3JhbmRQYXJlbnQucmVzaXplQ2hpbGQocGFyZW50SW5kZXgsIGdyYW5kUGFyZW50U2l6ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBwYXJlbnRTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0cGFyZW50LnJlc2l6ZUNoaWxkKGluZGV4LCBwYXJlbnRTaXplKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiB0aGUgdmlldy4gUHJvdmlkZSBgdW5kZWZpbmVkYCB0byBnZXRcblx0ICogdGhlIHNpemUgb2YgdGhlIGdyaWQgaXRzZWxmLlxuXHQgKi9cblx0Z2V0Vmlld1NpemUobG9jYXRpb24/OiBHcmlkTG9jYXRpb24pOiBJVmlld1NpemUge1xuXHRcdGlmICghbG9jYXRpb24pIHtcblx0XHRcdHJldHVybiB7IHdpZHRoOiB0aGlzLnJvb3Qud2lkdGgsIGhlaWdodDogdGhpcy5yb290LmhlaWdodCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IFssIG5vZGVdID0gdGhpcy5nZXROb2RlKGxvY2F0aW9uKTtcblx0XHRyZXR1cm4geyB3aWR0aDogbm9kZS53aWR0aCwgaGVpZ2h0OiBub2RlLmhlaWdodCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY2FjaGVkIHZpc2libGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fS4gVGhpcyB3YXMgdGhlIHNpemVcblx0ICogb2YgdGhlIHZpZXcgYXQgdGhlIG1vbWVudCBpdCBsYXN0IGJlY2FtZSBoaWRkZW4uXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRnZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemUobG9jYXRpb246IEdyaWRMb2NhdGlvbik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgW3Jlc3QsIGluZGV4XSA9IHRhaWwobG9jYXRpb24pO1xuXHRcdGNvbnN0IFssIHBhcmVudF0gPSB0aGlzLmdldE5vZGUocmVzdCk7XG5cblx0XHRpZiAoIShwYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcmVudC5nZXRDaGlsZENhY2hlZFZpc2libGVTaXplKGluZGV4KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXhpbWl6ZSB0aGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fSBieSBjb2xsYXBzaW5nIGFsbCBvdGhlciB2aWV3c1xuXHQgKiB0byB0aGVpciBtaW5pbXVtIHNpemVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB2aWV3LlxuXHQgKi9cblx0ZXhwYW5kVmlldyhsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2FuY2VzdG9ycywgbm9kZV0gPSB0aGlzLmdldE5vZGUobG9jYXRpb24pO1xuXG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIExlYWZOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhbmNlc3RvcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGFuY2VzdG9yc1tpXS5yZXNpemVDaGlsZChsb2NhdGlvbltpXSwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIGFsbCBvdGhlciB7QGxpbmsgSVZpZXcgdmlld3N9IGFyZSBhdCB0aGVpciBtaW5pbXVtIHNpemUuXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRpc1ZpZXdFeHBhbmRlZChsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHQvLyBObyB2aWV3IGNhbiBiZSBleHBhbmRlZCB3aGVuIGEgdmlldyBpcyBtYXhpbWl6ZWRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBbYW5jZXN0b3JzLCBub2RlXSA9IHRoaXMuZ2V0Tm9kZShsb2NhdGlvbik7XG5cblx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFuY2VzdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKCFhbmNlc3RvcnNbaV0uaXNDaGlsZEV4cGFuZGVkKGxvY2F0aW9uW2ldKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRtYXhpbWl6ZVZpZXcobG9jYXRpb246IEdyaWRMb2NhdGlvbiwgZXhjbHVkZVZpZXdzOiByZWFkb25seSBJVmlld1tdID0gW10pIHtcblx0XHRjb25zdCBbLCBub2RlVG9NYXhpbWl6ZV0gPSB0aGlzLmdldE5vZGUobG9jYXRpb24pO1xuXHRcdGlmICghKG5vZGVUb01heGltaXplIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xvY2F0aW9uIGlzIG5vdCBhIExlYWZOb2RlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWF4aW1pemVkTm9kZSA9PT0gbm9kZVRvTWF4aW1pemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRWaWV3KCkpIHtcblx0XHRcdHRoaXMuZXhpdE1heGltaXplZFZpZXcoKTtcblx0XHR9XG5cblx0XHRjb25zdCBleGNsdWRlVmlld1NldCA9IG5ldyBTZXQoZXhjbHVkZVZpZXdzKTtcblxuXHRcdGZ1bmN0aW9uIGhpZGVBbGxWaWV3c0J1dChwYXJlbnQ6IEJyYW5jaE5vZGUsIGV4Y2x1ZGU6IExlYWZOb2RlKTogdm9pZCB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHBhcmVudC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGlsZCA9IHBhcmVudC5jaGlsZHJlbltpXTtcblx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgTGVhZk5vZGUpIHtcblx0XHRcdFx0XHRpZiAoY2hpbGQgIT09IGV4Y2x1ZGUgJiYgIWV4Y2x1ZGVWaWV3U2V0LmhhcyhjaGlsZC52aWV3KSkge1xuXHRcdFx0XHRcdFx0cGFyZW50LnNldENoaWxkVmlzaWJsZShpLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhpZGVBbGxWaWV3c0J1dChjaGlsZCwgZXhjbHVkZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRoaWRlQWxsVmlld3NCdXQodGhpcy5yb290LCBub2RlVG9NYXhpbWl6ZSk7XG5cblx0XHR0aGlzLm1heGltaXplZE5vZGUgPSBub2RlVG9NYXhpbWl6ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQuZmlyZSh0cnVlKTtcblx0fVxuXG5cdGV4aXRNYXhpbWl6ZWRWaWV3KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tYXhpbWl6ZWROb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWF4aW1pemVkTm9kZSA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFdoZW4gaGlkaW5nIGEgdmlldywgaXQncyBwcmV2aW91cyBzaXplIGlzIGNhY2hlZC5cblx0XHQvLyBUbyByZXN0b3JlIHRoZSBzaXplcyBvZiBhbGwgdmlld3MsIHRoZXkgbmVlZCB0byBiZSBtYWRlIHZpc2libGUgaW4gcmV2ZXJzZSBvcmRlci5cblx0XHRmdW5jdGlvbiBzaG93Vmlld3NJblJldmVyc2VPcmRlcihwYXJlbnQ6IEJyYW5jaE5vZGUpOiB2b2lkIHtcblx0XHRcdGZvciAobGV0IGluZGV4ID0gcGFyZW50LmNoaWxkcmVuLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdFx0Y29uc3QgY2hpbGQgPSBwYXJlbnQuY2hpbGRyZW5baW5kZXhdO1xuXHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBMZWFmTm9kZSkge1xuXHRcdFx0XHRcdHBhcmVudC5zZXRDaGlsZFZpc2libGUoaW5kZXgsIHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNob3dWaWV3c0luUmV2ZXJzZU9yZGVyKGNoaWxkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNob3dWaWV3c0luUmV2ZXJzZU9yZGVyKHRoaXMucm9vdCk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNYXhpbWl6ZWQuZmlyZShmYWxzZSk7XG5cdH1cblxuXHRoYXNNYXhpbWl6ZWRWaWV3KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1heGltaXplZE5vZGUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHtAbGluayBJVmlldyB2aWV3fSBpcyBtYXhpbWl6ZWQuXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRpc1ZpZXdNYXhpbWl6ZWQobG9jYXRpb246IEdyaWRMb2NhdGlvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IFssIG5vZGVdID0gdGhpcy5nZXROb2RlKGxvY2F0aW9uKTtcblx0XHRpZiAoIShub2RlIGluc3RhbmNlb2YgTGVhZk5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xvY2F0aW9uIGlzIG5vdCBhIExlYWZOb2RlJyk7XG5cdFx0fVxuXHRcdHJldHVybiBub2RlID09PSB0aGlzLm1heGltaXplZE5vZGU7XG5cdH1cblxuXHQvKipcblx0ICogRGlzdHJpYnV0ZSB0aGUgc2l6ZSBhbW9uZyBhbGwge0BsaW5rIElWaWV3IHZpZXdzfSB3aXRoaW4gdGhlIGVudGlyZVxuXHQgKiBncmlkIG9yIHdpdGhpbiBhIHNpbmdsZSB7QGxpbmsgU3BsaXRWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIGxvY2F0aW9uIFRoZSB7QGxpbmsgR3JpZExvY2F0aW9uIGxvY2F0aW9ufSBvZiBhIHZpZXcgY29udGFpbmluZ1xuXHQgKiBjaGlsZHJlbiB2aWV3cywgd2hpY2ggd2lsbCBoYXZlIHRoZWlyIHNpemVzIGRpc3RyaWJ1dGVkIHdpdGhpbiB0aGUgcGFyZW50XG5cdCAqIHZpZXcncyBzaXplLiBQcm92aWRlIGB1bmRlZmluZWRgIHRvIHJlY3Vyc2l2ZWx5IGRpc3RyaWJ1dGUgYWxsIHZpZXdzJyBzaXplc1xuXHQgKiBpbiB0aGUgZW50aXJlIGdyaWQuXG5cdCAqL1xuXHRkaXN0cmlidXRlVmlld1NpemVzKGxvY2F0aW9uPzogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0dGhpcy5yb290LmRpc3RyaWJ1dGVWaWV3U2l6ZXModHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywgbm9kZV0gPSB0aGlzLmdldE5vZGUobG9jYXRpb24pO1xuXG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRub2RlLmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHR0aGlzLnRyeVNldDJ4MigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBhIHtAbGluayBJVmlldyB2aWV3fSBpcyB2aXNpYmxlLlxuXHQgKlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IG9mIHRoZSB2aWV3LlxuXHQgKi9cblx0aXNWaWV3VmlzaWJsZShsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgW3Jlc3QsIGluZGV4XSA9IHRhaWwobG9jYXRpb24pO1xuXHRcdGNvbnN0IFssIHBhcmVudF0gPSB0aGlzLmdldE5vZGUocmVzdCk7XG5cblx0XHRpZiAoIShwYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZyb20gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50LmlzQ2hpbGRWaXNpYmxlKGluZGV4KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIHZpc2liaWxpdHkgc3RhdGUgb2YgYSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHZpZXcuXG5cdCAqL1xuXHRzZXRWaWV3VmlzaWJsZShsb2NhdGlvbjogR3JpZExvY2F0aW9uLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGFzTWF4aW1pemVkVmlldygpKSB7XG5cdFx0XHR0aGlzLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3Jlc3QsIGluZGV4XSA9IHRhaWwobG9jYXRpb24pO1xuXHRcdGNvbnN0IFssIHBhcmVudF0gPSB0aGlzLmdldE5vZGUocmVzdCk7XG5cblx0XHRpZiAoIShwYXJlbnQgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGZyb20gbG9jYXRpb24nKTtcblx0XHR9XG5cblx0XHRwYXJlbnQuc2V0Q2hpbGRWaXNpYmxlKGluZGV4LCB2aXNpYmxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgZGVzY3JpcHRvciBmb3IgdGhlIGVudGlyZSBncmlkLlxuXHQgKi9cblx0Z2V0VmlldygpOiBHcmlkQnJhbmNoTm9kZTtcblxuXHQvKipcblx0ICogUmV0dXJucyBhIGRlc2NyaXB0b3IgZm9yIGEge0BsaW5rIEdyaWRMb2NhdGlvbiBzdWJ0cmVlfSB3aXRoaW4gdGhlXG5cdCAqIHtAbGluayBHcmlkVmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSBsb2NhdGlvbiBUaGUge0BsaW5rIEdyaWRMb2NhdGlvbiBsb2NhdGlvbn0gb2YgdGhlIHJvb3Qgb2Zcblx0ICogdGhlIHtAbGluayBHcmlkTG9jYXRpb24gc3VidHJlZX0uXG5cdCAqL1xuXHRnZXRWaWV3KGxvY2F0aW9uOiBHcmlkTG9jYXRpb24pOiBHcmlkTm9kZTtcblx0Z2V0Vmlldyhsb2NhdGlvbj86IEdyaWRMb2NhdGlvbik6IEdyaWROb2RlIHtcblx0XHRjb25zdCBub2RlID0gbG9jYXRpb24gPyB0aGlzLmdldE5vZGUobG9jYXRpb24pWzFdIDogdGhpcy5fcm9vdDtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Vmlld3Mobm9kZSwgdGhpcy5vcmllbnRhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogQ29uc3RydWN0IGEgbmV3IHtAbGluayBHcmlkVmlld30gZnJvbSBhIEpTT04gb2JqZWN0LlxuXHQgKlxuXHQgKiBAcGFyYW0ganNvbiBUaGUgSlNPTiBvYmplY3QuXG5cdCAqIEBwYXJhbSBkZXNlcmlhbGl6ZXIgQSBkZXNlcmlhbGl6ZXIgd2hpY2ggY2FuIHJldml2ZSBlYWNoIHZpZXcuXG5cdCAqIEByZXR1cm5zIEEgbmV3IHtAbGluayBHcmlkVmlld30gaW5zdGFuY2UuXG5cdCAqL1xuXHRzdGF0aWMgZGVzZXJpYWxpemU8VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3Pihqc29uOiBJU2VyaWFsaXplZEdyaWRWaWV3LCBkZXNlcmlhbGl6ZXI6IElWaWV3RGVzZXJpYWxpemVyPFQ+LCBvcHRpb25zOiBJR3JpZFZpZXdPcHRpb25zID0ge30pOiBHcmlkVmlldyB7XG5cdFx0aWYgKHR5cGVvZiBqc29uLm9yaWVudGF0aW9uICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ29yaWVudGF0aW9uXFwnIHByb3BlcnR5IG11c3QgYmUgYSBudW1iZXIuJyk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YganNvbi53aWR0aCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OOiBcXCd3aWR0aFxcJyBwcm9wZXJ0eSBtdXN0IGJlIGEgbnVtYmVyLicpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGpzb24uaGVpZ2h0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ2hlaWdodFxcJyBwcm9wZXJ0eSBtdXN0IGJlIGEgbnVtYmVyLicpO1xuXHRcdH0gZWxzZSBpZiAoanNvbi5yb290Py50eXBlICE9PSAnYnJhbmNoJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIEpTT046IFxcJ3Jvb3RcXCcgcHJvcGVydHkgbXVzdCBoYXZlIFxcJ3R5cGVcXCcgdmFsdWUgb2YgYnJhbmNoLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWVudGF0aW9uID0ganNvbi5vcmllbnRhdGlvbjtcblx0XHRjb25zdCBoZWlnaHQgPSBqc29uLmhlaWdodDtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBHcmlkVmlldyhvcHRpb25zKTtcblx0XHRyZXN1bHQuX2Rlc2VyaWFsaXplKGpzb24ucm9vdCwgb3JpZW50YXRpb24sIGRlc2VyaWFsaXplciwgaGVpZ2h0KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNlcmlhbGl6ZShyb290OiBJU2VyaWFsaXplZEJyYW5jaE5vZGUsIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiwgZGVzZXJpYWxpemVyOiBJVmlld0Rlc2VyaWFsaXplcjxJU2VyaWFsaXphYmxlVmlldz4sIG9ydGhvZ29uYWxTaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnJvb3QgPSB0aGlzLl9kZXNlcmlhbGl6ZU5vZGUocm9vdCwgb3JpZW50YXRpb24sIGRlc2VyaWFsaXplciwgb3J0aG9nb25hbFNpemUpIGFzIEJyYW5jaE5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNlcmlhbGl6ZU5vZGUobm9kZTogSVNlcmlhbGl6ZWROb2RlLCBvcmllbnRhdGlvbjogT3JpZW50YXRpb24sIGRlc2VyaWFsaXplcjogSVZpZXdEZXNlcmlhbGl6ZXI8SVNlcmlhbGl6YWJsZVZpZXc+LCBvcnRob2dvbmFsU2l6ZTogbnVtYmVyKTogTm9kZSB7XG5cdFx0bGV0IHJlc3VsdDogTm9kZTtcblx0XHRpZiAobm9kZS50eXBlID09PSAnYnJhbmNoJykge1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZENoaWxkcmVuID0gbm9kZS5kYXRhO1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBzZXJpYWxpemVkQ2hpbGRyZW4ubWFwKHNlcmlhbGl6ZWRDaGlsZCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bm9kZTogdGhpcy5fZGVzZXJpYWxpemVOb2RlKHNlcmlhbGl6ZWRDaGlsZCwgb3J0aG9nb25hbChvcmllbnRhdGlvbiksIGRlc2VyaWFsaXplciwgbm9kZS5zaXplKSxcblx0XHRcdFx0XHR2aXNpYmxlOiAoc2VyaWFsaXplZENoaWxkIGFzIHsgdmlzaWJsZT86IGJvb2xlYW4gfSkudmlzaWJsZVxuXHRcdFx0XHR9IHNhdGlzZmllcyBJTm9kZURlc2NyaXB0b3I7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmVzdWx0ID0gbmV3IEJyYW5jaE5vZGUob3JpZW50YXRpb24sIHRoaXMubGF5b3V0Q29udHJvbGxlciwgdGhpcy5zdHlsZXMsIHRoaXMucHJvcG9ydGlvbmFsTGF5b3V0LCBub2RlLnNpemUsIG9ydGhvZ29uYWxTaXplLCB1bmRlZmluZWQsIGNoaWxkcmVuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gbmV3IExlYWZOb2RlKGRlc2VyaWFsaXplci5mcm9tSlNPTihub2RlLmRhdGEpLCBvcmllbnRhdGlvbiwgdGhpcy5sYXlvdXRDb250cm9sbGVyLCBvcnRob2dvbmFsU2l6ZSwgbm9kZS5zaXplKTtcblx0XHRcdGlmIChub2RlLm1heGltaXplZCAmJiAhdGhpcy5tYXhpbWl6ZWROb2RlKSB7XG5cdFx0XHRcdHRoaXMubWF4aW1pemVkTm9kZSA9IHJlc3VsdDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkLmZpcmUodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFZpZXdzKG5vZGU6IE5vZGUsIG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiwgY2FjaGVkVmlzaWJsZVNpemU/OiBudW1iZXIpOiBHcmlkTm9kZSB7XG5cdFx0Y29uc3QgYm94ID0geyB0b3A6IG5vZGUudG9wLCBsZWZ0OiBub2RlLmxlZnQsIHdpZHRoOiBub2RlLndpZHRoLCBoZWlnaHQ6IG5vZGUuaGVpZ2h0IH07XG5cblx0XHRpZiAobm9kZSBpbnN0YW5jZW9mIExlYWZOb2RlKSB7XG5cdFx0XHRyZXR1cm4geyB2aWV3OiBub2RlLnZpZXcsIGJveCwgY2FjaGVkVmlzaWJsZVNpemUsIG1heGltaXplZDogdGhpcy5tYXhpbWl6ZWROb2RlID09PSBub2RlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGRyZW46IEdyaWROb2RlW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZS5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBub2RlLmNoaWxkcmVuW2ldO1xuXHRcdFx0Y29uc3QgY2FjaGVkVmlzaWJsZVNpemUgPSBub2RlLmdldENoaWxkQ2FjaGVkVmlzaWJsZVNpemUoaSk7XG5cblx0XHRcdGNoaWxkcmVuLnB1c2godGhpcy5fZ2V0Vmlld3MoY2hpbGQsIG9ydGhvZ29uYWwob3JpZW50YXRpb24pLCBjYWNoZWRWaXNpYmxlU2l6ZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGNoaWxkcmVuLCBib3ggfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Tm9kZShsb2NhdGlvbjogR3JpZExvY2F0aW9uLCBub2RlOiBOb2RlID0gdGhpcy5yb290LCBwYXRoOiBCcmFuY2hOb2RlW10gPSBbXSk6IFtCcmFuY2hOb2RlW10sIE5vZGVdIHtcblx0XHRpZiAobG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW3BhdGgsIG5vZGVdO1xuXHRcdH1cblxuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBCcmFuY2hOb2RlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2luZGV4LCAuLi5yZXN0XSA9IGxvY2F0aW9uO1xuXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSBub2RlLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvY2F0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hpbGQgPSBub2RlLmNoaWxkcmVuW2luZGV4XTtcblx0XHRwYXRoLnB1c2gobm9kZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXROb2RlKHJlc3QsIGNoaWxkLCBwYXRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRlbXB0IHRvIGxvY2sgdGhlIHtAbGluayBTYXNoIHNhc2hlc30gaW4gdGhpcyB7QGxpbmsgR3JpZFZpZXd9IHNvXG5cdCAqIHRoZSBncmlkIGJlaGF2ZXMgYXMgYSAyeDIgbWF0cml4LCB3aXRoIGEgY29ybmVyIHNhc2ggaW4gdGhlIG1pZGRsZS5cblx0ICpcblx0ICogSW4gY2FzZSB0aGUgZ3JpZCBpc24ndCBhIDJ4MiBncmlkIF9hbmRfIGFsbCBzYXNoZXMgYXJlIG5vdCBhbGlnbmVkLFxuXHQgKiB0aGlzIG1ldGhvZCBpcyBhIG5vLW9wLlxuXHQgKi9cblx0dHJ5U2V0MngyKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZTJ4Mi5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlMngyID0gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdFx0aWYgKHRoaXMucm9vdC5jaGlsZHJlbi5sZW5ndGggIT09IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSB0aGlzLnJvb3QuY2hpbGRyZW47XG5cblx0XHRpZiAoIShmaXJzdCBpbnN0YW5jZW9mIEJyYW5jaE5vZGUpIHx8ICEoc2Vjb25kIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2FibGUyeDIgPSBmaXJzdC50cnlTZXQyeDIoc2Vjb25kKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQb3B1bGF0ZSBhIG1hcCB3aXRoIHZpZXdzIHRvIERPTSBub2Rlcy5cblx0ICogQHJlbWFya3MgVG8gYmUgdXNlZCBpbnRlcm5hbGx5IG9ubHkuXG5cdCAqL1xuXHRnZXRWaWV3TWFwKG1hcDogTWFwPElWaWV3LCBIVE1MRWxlbWVudD4sIG5vZGU/OiBOb2RlKTogdm9pZCB7XG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRub2RlID0gdGhpcy5yb290O1xuXHRcdH1cblxuXHRcdGlmIChub2RlIGluc3RhbmNlb2YgQnJhbmNoTm9kZSkge1xuXHRcdFx0bm9kZS5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHRoaXMuZ2V0Vmlld01hcChtYXAsIGNoaWxkKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcC5zZXQobm9kZS52aWV3LCBub2RlLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm9uRGlkU2FzaFJlc2V0UmVsYXkuZGlzcG9zZSgpO1xuXHRcdHRoaXMucm9vdC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lbGVtZW50LnJlbW92ZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBMEIsbUJBQXlCO0FBQ25ELFNBQWtFLGdCQUFnQixRQUFvQixpQkFBaUI7QUFDdkgsU0FBUyxVQUFVLGFBQWEsWUFBWTtBQUM1QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLE9BQU8sYUFBYTtBQUN0QyxTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFDNUIsT0FBTztBQUVQLFNBQVMsZUFBQUEsb0JBQW1CO0FBQzVCLFNBQVMsa0JBQUFDLGlCQUFnQixVQUFBQyxlQUFjO0FBSXZDLE1BQU0sZ0JBQWlDO0FBQUEsRUFDdEMsaUJBQWlCLE1BQU07QUFDeEI7QUFrSk8sU0FBUyxXQUFXLGFBQXVDO0FBQ2pFLFNBQU8sZ0JBQWdCLFlBQVksV0FBVyxZQUFZLGFBQWEsWUFBWTtBQUNwRjtBQXVCTyxTQUFTLGlCQUFpQixNQUF3QztBQUV4RSxTQUFPLENBQUMsQ0FBRSxLQUFhO0FBQ3hCO0FBRUEsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QixZQUFtQixpQkFBMEI7QUFBMUI7QUFBQSxFQUE0QjtBQUNoRDtBQXlCQSxTQUFT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
