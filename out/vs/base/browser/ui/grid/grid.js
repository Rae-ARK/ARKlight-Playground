import { Orientation } from "../sash/sash.js";
import { equals, tail } from "../../../common/arrays.js";
import { Disposable } from "../../../common/lifecycle.js";
import "./gridview.css";
import { GridView, orthogonal, Sizing as GridViewSizing } from "./gridview.js";
import { LayoutPriority, Orientation as Orientation2, orthogonal as orthogonal2 } from "./gridview.js";
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["Up"] = 0] = "Up";
  Direction2[Direction2["Down"] = 1] = "Down";
  Direction2[Direction2["Left"] = 2] = "Left";
  Direction2[Direction2["Right"] = 3] = "Right";
  return Direction2;
})(Direction || {});
function oppositeDirection(direction) {
  switch (direction) {
    case 0 /* Up */:
      return 1 /* Down */;
    case 1 /* Down */:
      return 0 /* Up */;
    case 2 /* Left */:
      return 3 /* Right */;
    case 3 /* Right */:
      return 2 /* Left */;
  }
}
function isGridBranchNode(node) {
  return !!node.children;
}
function getGridNode(node, location) {
  if (location.length === 0) {
    return node;
  }
  if (!isGridBranchNode(node)) {
    throw new Error("Invalid location");
  }
  const [index, ...rest] = location;
  return getGridNode(node.children[index], rest);
}
function intersects(one, other) {
  return !(one.start >= other.end || other.start >= one.end);
}
function getBoxBoundary(box, direction) {
  const orientation = getDirectionOrientation(direction);
  const offset = direction === 0 /* Up */ ? box.top : direction === 3 /* Right */ ? box.left + box.width : direction === 1 /* Down */ ? box.top + box.height : box.left;
  const range = {
    start: orientation === Orientation.HORIZONTAL ? box.top : box.left,
    end: orientation === Orientation.HORIZONTAL ? box.top + box.height : box.left + box.width
  };
  return { offset, range };
}
function findAdjacentBoxLeafNodes(boxNode, direction, boundary) {
  const result = [];
  function _(boxNode2, direction2, boundary2) {
    if (isGridBranchNode(boxNode2)) {
      for (const child of boxNode2.children) {
        _(child, direction2, boundary2);
      }
    } else {
      const { offset, range } = getBoxBoundary(boxNode2.box, direction2);
      if (offset === boundary2.offset && intersects(range, boundary2.range)) {
        result.push(boxNode2);
      }
    }
  }
  _(boxNode, direction, boundary);
  return result;
}
function getLocationOrientation(rootOrientation, location) {
  return location.length % 2 === 0 ? orthogonal(rootOrientation) : rootOrientation;
}
function getDirectionOrientation(direction) {
  return direction === 0 /* Up */ || direction === 1 /* Down */ ? Orientation.VERTICAL : Orientation.HORIZONTAL;
}
function getRelativeLocation(rootOrientation, location, direction) {
  const orientation = getLocationOrientation(rootOrientation, location);
  const directionOrientation = getDirectionOrientation(direction);
  if (orientation === directionOrientation) {
    let [rest, index] = tail(location);
    if (direction === 3 /* Right */ || direction === 1 /* Down */) {
      index += 1;
    }
    return [...rest, index];
  } else {
    const index = direction === 3 /* Right */ || direction === 1 /* Down */ ? 1 : 0;
    return [...location, index];
  }
}
function indexInParent(element) {
  const parentElement = element.parentElement;
  if (!parentElement) {
    throw new Error("Invalid grid element");
  }
  let el = parentElement.firstElementChild;
  let index = 0;
  while (el !== element && el !== parentElement.lastElementChild && el) {
    el = el.nextElementSibling;
    index++;
  }
  return index;
}
function getGridLocation(element) {
  const parentElement = element.parentElement;
  if (!parentElement) {
    throw new Error("Invalid grid element");
  }
  if (/\bmonaco-grid-view\b/.test(parentElement.className)) {
    return [];
  }
  const index = indexInParent(parentElement);
  const ancestor = parentElement.parentElement.parentElement.parentElement.parentElement;
  return [...getGridLocation(ancestor), index];
}
var Sizing;
((Sizing2) => {
  Sizing2.Distribute = { type: "distribute" };
  Sizing2.Split = { type: "split" };
  Sizing2.Auto = { type: "auto" };
  function Invisible(cachedVisibleSize) {
    return { type: "invisible", cachedVisibleSize };
  }
  Sizing2.Invisible = Invisible;
})(Sizing || (Sizing = {}));
class Grid extends Disposable {
  /**
   * Create a new {@link Grid}. A grid must *always* have a view
   * inside.
   *
   * @param view An initial view for this Grid.
   */
  constructor(view, options = {}) {
    super();
    this.views = /* @__PURE__ */ new Map();
    this.didLayout = false;
    if (view instanceof GridView) {
      this.gridview = view;
      this.gridview.getViewMap(this.views);
    } else {
      this.gridview = new GridView(options);
    }
    this._register(this.gridview);
    this._register(this.gridview.onDidSashReset(this.onDidSashReset, this));
    if (!(view instanceof GridView)) {
      this._addView(view, 0, [0]);
    }
    this.onDidChange = this.gridview.onDidChange;
    this.onDidScroll = this.gridview.onDidScroll;
    this.onDidChangeViewMaximized = this.gridview.onDidChangeViewMaximized;
  }
  /**
   * The orientation of the grid. Matches the orientation of the root
   * {@link SplitView} in the grid's {@link GridLocation} model.
   */
  get orientation() {
    return this.gridview.orientation;
  }
  set orientation(orientation) {
    this.gridview.orientation = orientation;
  }
  /**
   * The width of the grid.
   */
  get width() {
    return this.gridview.width;
  }
  /**
   * The height of the grid.
   */
  get height() {
    return this.gridview.height;
  }
  /**
   * The minimum width of the grid.
   */
  get minimumWidth() {
    return this.gridview.minimumWidth;
  }
  /**
   * The minimum height of the grid.
   */
  get minimumHeight() {
    return this.gridview.minimumHeight;
  }
  /**
   * The maximum width of the grid.
   */
  get maximumWidth() {
    return this.gridview.maximumWidth;
  }
  /**
   * The maximum height of the grid.
   */
  get maximumHeight() {
    return this.gridview.maximumHeight;
  }
  /**
   * A collection of sashes perpendicular to each edge of the grid.
   * Corner sashes will be created for each intersection.
   */
  get boundarySashes() {
    return this.gridview.boundarySashes;
  }
  set boundarySashes(boundarySashes) {
    this.gridview.boundarySashes = boundarySashes;
  }
  /**
   * Enable/disable edge snapping across all grid views.
   */
  set edgeSnapping(edgeSnapping) {
    this.gridview.edgeSnapping = edgeSnapping;
  }
  /**
   * The DOM element for this view.
   */
  get element() {
    return this.gridview.element;
  }
  style(styles) {
    this.gridview.style(styles);
  }
  /**
   * Layout the {@link Grid}.
   *
   * Optionally provide a `top` and `left` positions, those will propagate
   * as an origin for positions passed to {@link IView.layout}.
   *
   * @param width The width of the {@link Grid}.
   * @param height The height of the {@link Grid}.
   * @param top Optional, the top location of the {@link Grid}.
   * @param left Optional, the left location of the {@link Grid}.
   */
  layout(width, height, top = 0, left = 0) {
    this.gridview.layout(width, height, top, left);
    this.didLayout = true;
  }
  /**
   * Add a {@link IView view} to this {@link Grid}, based on another reference view.
   *
   * Take this grid as an example:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+---------+-----+
   *  |        C      |     |
   *  +---------------+  D  |
   *  |        E      |     |
   *  +---------------+-----+
   * ```
   *
   * Calling `addView(X, Sizing.Distribute, C, Direction.Right)` will make the following
   * changes:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+-+-------+-----+
   *  |   C   |   X   |     |
   *  +-------+-------+  D  |
   *  |        E      |     |
   *  +---------------+-----+
   * ```
   *
   * Or `addView(X, Sizing.Distribute, D, Direction.Down)`:
   *
   * ```
   *  +-----+---------------+
   *  |  A  |      B        |
   *  +-----+---------+-----+
   *  |        C      |  D  |
   *  +---------------+-----+
   *  |        E      |  X  |
   *  +---------------+-----+
   * ```
   *
   * @param newView The view to add.
   * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param referenceView Another view to place this new view next to.
   * @param direction The direction the new view should be placed next to the reference view.
   */
  addView(newView, size, referenceView, direction) {
    if (this.views.has(newView)) {
      throw new Error("Can't add same view twice");
    }
    const orientation = getDirectionOrientation(direction);
    if (this.views.size === 1 && this.orientation !== orientation) {
      this.orientation = orientation;
    }
    const referenceLocation = this.getViewLocation(referenceView);
    const location = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
    let viewSize;
    if (typeof size === "number") {
      viewSize = size;
    } else if (size.type === "split") {
      const [, index] = tail(referenceLocation);
      viewSize = GridViewSizing.Split(index);
    } else if (size.type === "distribute") {
      viewSize = GridViewSizing.Distribute;
    } else if (size.type === "auto") {
      const [, index] = tail(referenceLocation);
      viewSize = GridViewSizing.Auto(index);
    } else {
      viewSize = size;
    }
    this._addView(newView, viewSize, location);
  }
  addViewAt(newView, size, location) {
    if (this.views.has(newView)) {
      throw new Error("Can't add same view twice");
    }
    let viewSize;
    if (typeof size === "number") {
      viewSize = size;
    } else if (size.type === "distribute") {
      viewSize = GridViewSizing.Distribute;
    } else {
      viewSize = size;
    }
    this._addView(newView, viewSize, location);
  }
  _addView(newView, size, location) {
    this.views.set(newView, newView.element);
    this.gridview.addView(newView, size, location);
  }
  /**
   * Remove a {@link IView view} from this {@link Grid}.
   *
   * @param view The {@link IView view} to remove.
   * @param sizing Whether to distribute other {@link IView view}'s sizes.
   */
  removeView(view, sizing) {
    if (this.views.size === 1) {
      throw new Error("Can't remove last view");
    }
    const location = this.getViewLocation(view);
    let gridViewSizing;
    if (sizing?.type === "distribute") {
      gridViewSizing = GridViewSizing.Distribute;
    } else if (sizing?.type === "auto") {
      const index = location[location.length - 1];
      gridViewSizing = GridViewSizing.Auto(index === 0 ? 1 : index - 1);
    }
    this.gridview.removeView(location, gridViewSizing);
    this.views.delete(view);
  }
  /**
   * Move a {@link IView view} to another location in the grid.
   *
   * @remarks See {@link Grid.addView}.
   *
   * @param view The {@link IView view} to move.
   * @param sizing Either a fixed size, or a dynamic {@link Sizing} strategy.
   * @param referenceView Another view to place the view next to.
   * @param direction The direction the view should be placed next to the reference view.
   */
  moveView(view, sizing, referenceView, direction) {
    const sourceLocation = this.getViewLocation(view);
    const [sourceParentLocation, from] = tail(sourceLocation);
    const referenceLocation = this.getViewLocation(referenceView);
    const targetLocation = getRelativeLocation(this.gridview.orientation, referenceLocation, direction);
    const [targetParentLocation, to] = tail(targetLocation);
    if (equals(sourceParentLocation, targetParentLocation)) {
      this.gridview.moveView(sourceParentLocation, from, to);
    } else {
      this.removeView(view, typeof sizing === "number" ? void 0 : sizing);
      this.addView(view, sizing, referenceView, direction);
    }
  }
  /**
   * Move a {@link IView view} to another location in the grid.
   *
   * @remarks Internal method, do not use without knowing what you're doing.
   * @remarks See {@link GridView.moveView}.
   *
   * @param view The {@link IView view} to move.
   * @param location The {@link GridLocation location} to insert the view on.
   */
  moveViewTo(view, location) {
    const sourceLocation = this.getViewLocation(view);
    const [sourceParentLocation, from] = tail(sourceLocation);
    const [targetParentLocation, to] = tail(location);
    if (equals(sourceParentLocation, targetParentLocation)) {
      this.gridview.moveView(sourceParentLocation, from, to);
    } else {
      const size = this.getViewSize(view);
      const orientation = getLocationOrientation(this.gridview.orientation, sourceLocation);
      const cachedViewSize = this.getViewCachedVisibleSize(view);
      const sizing = typeof cachedViewSize === "undefined" ? orientation === Orientation.HORIZONTAL ? size.width : size.height : Sizing.Invisible(cachedViewSize);
      this.removeView(view);
      this.addViewAt(view, sizing, location);
    }
  }
  /**
   * Swap two {@link IView views} within the {@link Grid}.
   *
   * @param from One {@link IView view}.
   * @param to Another {@link IView view}.
   */
  swapViews(from, to) {
    const fromLocation = this.getViewLocation(from);
    const toLocation = this.getViewLocation(to);
    return this.gridview.swapViews(fromLocation, toLocation);
  }
  /**
   * Resize a {@link IView view}.
   *
   * @param view The {@link IView view} to resize.
   * @param size The size the view should be.
   */
  resizeView(view, size) {
    const location = this.getViewLocation(view);
    return this.gridview.resizeView(location, size);
  }
  /**
   * Returns whether all other {@link IView views} are at their minimum size.
   *
   * @param view The reference {@link IView view}.
   */
  isViewExpanded(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewExpanded(location);
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param view The reference {@link IView view}.
   */
  isViewMaximized(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewMaximized(location);
  }
  /**
   * Returns whether the {@link IView view} is maximized.
   *
   * @param view The reference {@link IView view}.
   */
  hasMaximizedView() {
    return this.gridview.hasMaximizedView();
  }
  /**
   * Get the size of a {@link IView view}.
   *
   * @param view The {@link IView view}. Provide `undefined` to get the size
   * of the grid itself.
   */
  getViewSize(view) {
    if (!view) {
      return this.gridview.getViewSize();
    }
    const location = this.getViewLocation(view);
    return this.gridview.getViewSize(location);
  }
  /**
   * Get the cached visible size of a {@link IView view}. This was the size
   * of the view at the moment it last became hidden.
   *
   * @param view The {@link IView view}.
   */
  getViewCachedVisibleSize(view) {
    const location = this.getViewLocation(view);
    return this.gridview.getViewCachedVisibleSize(location);
  }
  /**
   * Maximizes the specified view and hides all other views.
   * @param view The view to maximize.
   * @param excludeViews Optional array of views to exclude from being hidden.
   */
  maximizeView(view, excludeViews = []) {
    if (this.views.size < 2) {
      throw new Error("At least two views are required to maximize a view");
    }
    const location = this.getViewLocation(view);
    this.gridview.maximizeView(location, excludeViews);
  }
  exitMaximizedView() {
    this.gridview.exitMaximizedView();
  }
  /**
   * Expand the size of a {@link IView view} by collapsing all other views
   * to their minimum sizes.
   *
   * @param view The {@link IView view}.
   */
  expandView(view) {
    const location = this.getViewLocation(view);
    this.gridview.expandView(location);
  }
  /**
   * Distribute the size among all {@link IView views} within the entire
   * grid or within a single {@link SplitView}.
   */
  distributeViewSizes() {
    this.gridview.distributeViewSizes();
  }
  /**
   * Returns whether a {@link IView view} is visible.
   *
   * @param view The {@link IView view}.
   */
  isViewVisible(view) {
    const location = this.getViewLocation(view);
    return this.gridview.isViewVisible(location);
  }
  /**
   * Set the visibility state of a {@link IView view}.
   *
   * @param view The {@link IView view}.
   */
  setViewVisible(view, visible) {
    const location = this.getViewLocation(view);
    this.gridview.setViewVisible(location, visible);
  }
  /**
   * Returns a descriptor for the entire grid.
   */
  getViews() {
    return this.gridview.getView();
  }
  /**
   * Utility method to return the collection all views which intersect
   * a view's edge.
   *
   * @param view The {@link IView view}.
   * @param direction Which direction edge to be considered.
   * @param wrap Whether the grid wraps around (from right to left, from bottom to top).
   */
  getNeighborViews(view, direction, wrap = false) {
    if (!this.didLayout) {
      throw new Error("Can't call getNeighborViews before first layout");
    }
    const location = this.getViewLocation(view);
    const root = this.getViews();
    const node = getGridNode(root, location);
    let boundary = getBoxBoundary(node.box, direction);
    if (wrap) {
      if (direction === 0 /* Up */ && node.box.top === 0) {
        boundary = { offset: root.box.top + root.box.height, range: boundary.range };
      } else if (direction === 3 /* Right */ && node.box.left + node.box.width === root.box.width) {
        boundary = { offset: 0, range: boundary.range };
      } else if (direction === 1 /* Down */ && node.box.top + node.box.height === root.box.height) {
        boundary = { offset: 0, range: boundary.range };
      } else if (direction === 2 /* Left */ && node.box.left === 0) {
        boundary = { offset: root.box.left + root.box.width, range: boundary.range };
      }
    }
    return findAdjacentBoxLeafNodes(root, oppositeDirection(direction), boundary).map((node2) => node2.view);
  }
  getViewLocation(view) {
    const element = this.views.get(view);
    if (!element) {
      throw new Error("View not found");
    }
    return getGridLocation(element);
  }
  onDidSashReset(location) {
    const resizeToPreferredSize = (location2) => {
      const node = this.gridview.getView(location2);
      if (isGridBranchNode(node)) {
        return false;
      }
      const direction = getLocationOrientation(this.orientation, location2);
      const size = direction === Orientation.HORIZONTAL ? node.view.preferredWidth : node.view.preferredHeight;
      if (typeof size !== "number") {
        return false;
      }
      const viewSize = direction === Orientation.HORIZONTAL ? { width: Math.round(size) } : { height: Math.round(size) };
      this.gridview.resizeView(location2, viewSize);
      return true;
    };
    if (resizeToPreferredSize(location)) {
      return;
    }
    const [parentLocation, index] = tail(location);
    if (resizeToPreferredSize([...parentLocation, index + 1])) {
      return;
    }
    this.gridview.distributeViewSizes(parentLocation);
  }
}
class SerializableGrid extends Grid {
  constructor() {
    super(...arguments);
    /**
     * Useful information in order to proportionally restore view sizes
     * upon the very first layout call.
     */
    this.initialLayoutContext = true;
  }
  static serializeNode(node, orientation) {
    const size = orientation === Orientation.VERTICAL ? node.box.width : node.box.height;
    if (!isGridBranchNode(node)) {
      const serializedLeafNode = { type: "leaf", data: node.view.toJSON(), size };
      if (typeof node.cachedVisibleSize === "number") {
        serializedLeafNode.size = node.cachedVisibleSize;
        serializedLeafNode.visible = false;
      } else if (node.maximized) {
        serializedLeafNode.maximized = true;
      }
      return serializedLeafNode;
    }
    const data = node.children.map((c) => SerializableGrid.serializeNode(c, orthogonal(orientation)));
    if (data.some((c) => c.visible !== false)) {
      return { type: "branch", data, size };
    }
    return { type: "branch", data, size, visible: false };
  }
  /**
   * Construct a new {@link SerializableGrid} from a JSON object.
   *
   * @param json The JSON object.
   * @param deserializer A deserializer which can revive each view.
   * @returns A new {@link SerializableGrid} instance.
   */
  static deserialize(json, deserializer, options = {}) {
    if (typeof json.orientation !== "number") {
      throw new Error("Invalid JSON: 'orientation' property must be a number.");
    } else if (typeof json.width !== "number") {
      throw new Error("Invalid JSON: 'width' property must be a number.");
    } else if (typeof json.height !== "number") {
      throw new Error("Invalid JSON: 'height' property must be a number.");
    }
    const gridview = GridView.deserialize(json, deserializer, options);
    const result = new SerializableGrid(gridview, options);
    return result;
  }
  /**
   * Construct a new {@link SerializableGrid} from a grid descriptor.
   *
   * @param gridDescriptor A grid descriptor in which leaf nodes point to actual views.
   * @returns A new {@link SerializableGrid} instance.
   */
  static from(gridDescriptor, options = {}) {
    return SerializableGrid.deserialize(createSerializedGrid(gridDescriptor), { fromJSON: (view) => view }, options);
  }
  /**
   * Serialize this grid into a JSON object.
   */
  serialize() {
    return {
      root: SerializableGrid.serializeNode(this.getViews(), this.orientation),
      orientation: this.orientation,
      width: this.width,
      height: this.height
    };
  }
  layout(width, height, top = 0, left = 0) {
    super.layout(width, height, top, left);
    if (this.initialLayoutContext) {
      this.initialLayoutContext = false;
      this.gridview.trySet2x2();
    }
  }
}
function isGridBranchNodeDescriptor(nodeDescriptor) {
  return !!nodeDescriptor.groups;
}
function sanitizeGridNodeDescriptor(nodeDescriptor, rootNode) {
  if (!rootNode && nodeDescriptor.groups && nodeDescriptor.groups.length <= 1) {
    nodeDescriptor.groups = void 0;
  }
  if (!isGridBranchNodeDescriptor(nodeDescriptor)) {
    return;
  }
  let totalDefinedSize = 0;
  let totalDefinedSizeCount = 0;
  for (const child of nodeDescriptor.groups) {
    sanitizeGridNodeDescriptor(child, false);
    if (child.size) {
      totalDefinedSize += child.size;
      totalDefinedSizeCount++;
    }
  }
  const totalUndefinedSize = totalDefinedSizeCount > 0 ? totalDefinedSize : 1;
  const totalUndefinedSizeCount = nodeDescriptor.groups.length - totalDefinedSizeCount;
  const eachUndefinedSize = totalUndefinedSize / totalUndefinedSizeCount;
  for (const child of nodeDescriptor.groups) {
    if (!child.size) {
      child.size = eachUndefinedSize;
    }
  }
}
function createSerializedNode(nodeDescriptor) {
  if (isGridBranchNodeDescriptor(nodeDescriptor)) {
    return { type: "branch", data: nodeDescriptor.groups.map((c) => createSerializedNode(c)), size: nodeDescriptor.size };
  } else {
    return { type: "leaf", data: nodeDescriptor.data, size: nodeDescriptor.size };
  }
}
function getDimensions(node, orientation) {
  if (node.type === "branch") {
    const childrenDimensions = node.data.map((c) => getDimensions(c, orthogonal(orientation)));
    if (orientation === Orientation.VERTICAL) {
      const width = node.size || (childrenDimensions.length === 0 ? void 0 : Math.max(...childrenDimensions.map((d) => d.width || 0)));
      const height = childrenDimensions.length === 0 ? void 0 : childrenDimensions.reduce((r, d) => r + (d.height || 0), 0);
      return { width, height };
    } else {
      const width = childrenDimensions.length === 0 ? void 0 : childrenDimensions.reduce((r, d) => r + (d.width || 0), 0);
      const height = node.size || (childrenDimensions.length === 0 ? void 0 : Math.max(...childrenDimensions.map((d) => d.height || 0)));
      return { width, height };
    }
  } else {
    const width = orientation === Orientation.VERTICAL ? node.size : void 0;
    const height = orientation === Orientation.VERTICAL ? void 0 : node.size;
    return { width, height };
  }
}
function createSerializedGrid(gridDescriptor) {
  sanitizeGridNodeDescriptor(gridDescriptor, true);
  const root = createSerializedNode(gridDescriptor);
  const { width, height } = getDimensions(root, gridDescriptor.orientation);
  return {
    root,
    orientation: gridDescriptor.orientation,
    width: width || 1,
    height: height || 1
  };
}
export {
  Direction,
  Grid,
  LayoutPriority,
  Orientation2 as Orientation,
  SerializableGrid,
  Sizing,
  createSerializedGrid,
  getRelativeLocation,
  isGridBranchNode,
  orthogonal2 as orthogonal,
  sanitizeGridNodeDescriptor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9ncmlkL2dyaWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMsIE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IGVxdWFscywgdGFpbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICcuL2dyaWR2aWV3LmNzcyc7XG5pbXBvcnQgeyBCb3gsIEdyaWRWaWV3LCBJR3JpZFZpZXdPcHRpb25zLCBJR3JpZFZpZXdTdHlsZXMsIElWaWV3IGFzIElHcmlkVmlld1ZpZXcsIElWaWV3U2l6ZSwgb3J0aG9nb25hbCwgU2l6aW5nIGFzIEdyaWRWaWV3U2l6aW5nLCBHcmlkTG9jYXRpb24gfSBmcm9tICcuL2dyaWR2aWV3LmpzJztcbmltcG9ydCB0eXBlIHsgU3BsaXRWaWV3LCBBdXRvU2l6aW5nIGFzIFNwbGl0Vmlld0F1dG9TaXppbmcgfSBmcm9tICcuLi9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcblxuZXhwb3J0IHR5cGUgeyBJVmlld1NpemUgfTtcbmV4cG9ydCB7IExheW91dFByaW9yaXR5LCBPcmllbnRhdGlvbiwgb3J0aG9nb25hbCB9IGZyb20gJy4vZ3JpZHZpZXcuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBEaXJlY3Rpb24ge1xuXHRVcCxcblx0RG93bixcblx0TGVmdCxcblx0UmlnaHRcbn1cblxuZnVuY3Rpb24gb3Bwb3NpdGVEaXJlY3Rpb24oZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBEaXJlY3Rpb24ge1xuXHRzd2l0Y2ggKGRpcmVjdGlvbikge1xuXHRcdGNhc2UgRGlyZWN0aW9uLlVwOiByZXR1cm4gRGlyZWN0aW9uLkRvd247XG5cdFx0Y2FzZSBEaXJlY3Rpb24uRG93bjogcmV0dXJuIERpcmVjdGlvbi5VcDtcblx0XHRjYXNlIERpcmVjdGlvbi5MZWZ0OiByZXR1cm4gRGlyZWN0aW9uLlJpZ2h0O1xuXHRcdGNhc2UgRGlyZWN0aW9uLlJpZ2h0OiByZXR1cm4gRGlyZWN0aW9uLkxlZnQ7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgaW50ZXJmYWNlIHRvIGltcGxlbWVudCBmb3Igdmlld3Mgd2l0aGluIGEge0BsaW5rIEdyaWR9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3IGV4dGVuZHMgSUdyaWRWaWV3VmlldyB7XG5cblx0LyoqXG5cdCAqIFRoZSBwcmVmZXJyZWQgd2lkdGggZm9yIHdoZW4gdGhlIHVzZXIgZG91YmxlIGNsaWNrcyBhIHNhc2hcblx0ICogYWRqYWNlbnQgdG8gdGhpcyB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgcHJlZmVycmVkV2lkdGg/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBwcmVmZXJyZWQgaGVpZ2h0IGZvciB3aGVuIHRoZSB1c2VyIGRvdWJsZSBjbGlja3MgYSBzYXNoXG5cdCAqIGFkamFjZW50IHRvIHRoaXMgdmlldy5cblx0ICovXG5cdHJlYWRvbmx5IHByZWZlcnJlZEhlaWdodD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHcmlkTGVhZk5vZGU8VCBleHRlbmRzIElWaWV3PiB7XG5cdHJlYWRvbmx5IHZpZXc6IFQ7XG5cdHJlYWRvbmx5IGJveDogQm94O1xuXHRyZWFkb25seSBjYWNoZWRWaXNpYmxlU2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtYXhpbWl6ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR3JpZEJyYW5jaE5vZGU8VCBleHRlbmRzIElWaWV3PiB7XG5cdHJlYWRvbmx5IGNoaWxkcmVuOiBHcmlkTm9kZTxUPltdO1xuXHRyZWFkb25seSBib3g6IEJveDtcbn1cblxuZXhwb3J0IHR5cGUgR3JpZE5vZGU8VCBleHRlbmRzIElWaWV3PiA9IEdyaWRMZWFmTm9kZTxUPiB8IEdyaWRCcmFuY2hOb2RlPFQ+O1xuXG5leHBvcnQgZnVuY3Rpb24gaXNHcmlkQnJhbmNoTm9kZTxUIGV4dGVuZHMgSVZpZXc+KG5vZGU6IEdyaWROb2RlPFQ+KTogbm9kZSBpcyBHcmlkQnJhbmNoTm9kZTxUPiB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRyZXR1cm4gISEobm9kZSBhcyBhbnkpLmNoaWxkcmVuO1xufVxuXG5mdW5jdGlvbiBnZXRHcmlkTm9kZTxUIGV4dGVuZHMgSVZpZXc+KG5vZGU6IEdyaWROb2RlPFQ+LCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogR3JpZE5vZGU8VD4ge1xuXHRpZiAobG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRpZiAoIWlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbG9jYXRpb24nKTtcblx0fVxuXG5cdGNvbnN0IFtpbmRleCwgLi4ucmVzdF0gPSBsb2NhdGlvbjtcblx0cmV0dXJuIGdldEdyaWROb2RlKG5vZGUuY2hpbGRyZW5baW5kZXhdLCByZXN0KTtcbn1cblxuaW50ZXJmYWNlIFJhbmdlIHtcblx0cmVhZG9ubHkgc3RhcnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZW5kOiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdHMob25lOiBSYW5nZSwgb3RoZXI6IFJhbmdlKTogYm9vbGVhbiB7XG5cdHJldHVybiAhKG9uZS5zdGFydCA+PSBvdGhlci5lbmQgfHwgb3RoZXIuc3RhcnQgPj0gb25lLmVuZCk7XG59XG5cbmludGVyZmFjZSBCb3VuZGFyeSB7XG5cdHJlYWRvbmx5IG9mZnNldDogbnVtYmVyO1xuXHRyZWFkb25seSByYW5nZTogUmFuZ2U7XG59XG5cbmZ1bmN0aW9uIGdldEJveEJvdW5kYXJ5KGJveDogQm94LCBkaXJlY3Rpb246IERpcmVjdGlvbik6IEJvdW5kYXJ5IHtcblx0Y29uc3Qgb3JpZW50YXRpb24gPSBnZXREaXJlY3Rpb25PcmllbnRhdGlvbihkaXJlY3Rpb24pO1xuXHRjb25zdCBvZmZzZXQgPSBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5VcCA/IGJveC50b3AgOlxuXHRcdGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlJpZ2h0ID8gYm94LmxlZnQgKyBib3gud2lkdGggOlxuXHRcdFx0ZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uRG93biA/IGJveC50b3AgKyBib3guaGVpZ2h0IDpcblx0XHRcdFx0Ym94LmxlZnQ7XG5cblx0Y29uc3QgcmFuZ2UgPSB7XG5cdFx0c3RhcnQ6IG9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gYm94LnRvcCA6IGJveC5sZWZ0LFxuXHRcdGVuZDogb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBib3gudG9wICsgYm94LmhlaWdodCA6IGJveC5sZWZ0ICsgYm94LndpZHRoXG5cdH07XG5cblx0cmV0dXJuIHsgb2Zmc2V0LCByYW5nZSB9O1xufVxuXG5mdW5jdGlvbiBmaW5kQWRqYWNlbnRCb3hMZWFmTm9kZXM8VCBleHRlbmRzIElWaWV3Pihib3hOb2RlOiBHcmlkTm9kZTxUPiwgZGlyZWN0aW9uOiBEaXJlY3Rpb24sIGJvdW5kYXJ5OiBCb3VuZGFyeSk6IEdyaWRMZWFmTm9kZTxUPltdIHtcblx0Y29uc3QgcmVzdWx0OiBHcmlkTGVhZk5vZGU8VD5bXSA9IFtdO1xuXG5cdGZ1bmN0aW9uIF8oYm94Tm9kZTogR3JpZE5vZGU8VD4sIGRpcmVjdGlvbjogRGlyZWN0aW9uLCBib3VuZGFyeTogQm91bmRhcnkpOiB2b2lkIHtcblx0XHRpZiAoaXNHcmlkQnJhbmNoTm9kZShib3hOb2RlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBib3hOb2RlLmNoaWxkcmVuKSB7XG5cdFx0XHRcdF8oY2hpbGQsIGRpcmVjdGlvbiwgYm91bmRhcnkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB7IG9mZnNldCwgcmFuZ2UgfSA9IGdldEJveEJvdW5kYXJ5KGJveE5vZGUuYm94LCBkaXJlY3Rpb24pO1xuXG5cdFx0XHRpZiAob2Zmc2V0ID09PSBib3VuZGFyeS5vZmZzZXQgJiYgaW50ZXJzZWN0cyhyYW5nZSwgYm91bmRhcnkucmFuZ2UpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGJveE5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdF8oYm94Tm9kZSwgZGlyZWN0aW9uLCBib3VuZGFyeSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGdldExvY2F0aW9uT3JpZW50YXRpb24ocm9vdE9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiwgbG9jYXRpb246IEdyaWRMb2NhdGlvbik6IE9yaWVudGF0aW9uIHtcblx0cmV0dXJuIGxvY2F0aW9uLmxlbmd0aCAlIDIgPT09IDAgPyBvcnRob2dvbmFsKHJvb3RPcmllbnRhdGlvbikgOiByb290T3JpZW50YXRpb247XG59XG5cbmZ1bmN0aW9uIGdldERpcmVjdGlvbk9yaWVudGF0aW9uKGRpcmVjdGlvbjogRGlyZWN0aW9uKTogT3JpZW50YXRpb24ge1xuXHRyZXR1cm4gZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uVXAgfHwgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uRG93biA/IE9yaWVudGF0aW9uLlZFUlRJQ0FMIDogT3JpZW50YXRpb24uSE9SSVpPTlRBTDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbGF0aXZlTG9jYXRpb24ocm9vdE9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiwgbG9jYXRpb246IEdyaWRMb2NhdGlvbiwgZGlyZWN0aW9uOiBEaXJlY3Rpb24pOiBHcmlkTG9jYXRpb24ge1xuXHRjb25zdCBvcmllbnRhdGlvbiA9IGdldExvY2F0aW9uT3JpZW50YXRpb24ocm9vdE9yaWVudGF0aW9uLCBsb2NhdGlvbik7XG5cdGNvbnN0IGRpcmVjdGlvbk9yaWVudGF0aW9uID0gZ2V0RGlyZWN0aW9uT3JpZW50YXRpb24oZGlyZWN0aW9uKTtcblxuXHRpZiAob3JpZW50YXRpb24gPT09IGRpcmVjdGlvbk9yaWVudGF0aW9uKSB7XG5cdFx0bGV0IFtyZXN0LCBpbmRleF0gPSB0YWlsKGxvY2F0aW9uKTtcblxuXHRcdGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5SaWdodCB8fCBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Eb3duKSB7XG5cdFx0XHRpbmRleCArPSAxO1xuXHRcdH1cblxuXHRcdHJldHVybiBbLi4ucmVzdCwgaW5kZXhdO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGluZGV4ID0gKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlJpZ2h0IHx8IGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkRvd24pID8gMSA6IDA7XG5cdFx0cmV0dXJuIFsuLi5sb2NhdGlvbiwgaW5kZXhdO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGluZGV4SW5QYXJlbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRjb25zdCBwYXJlbnRFbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXG5cdGlmICghcGFyZW50RWxlbWVudCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBncmlkIGVsZW1lbnQnKTtcblx0fVxuXG5cdGxldCBlbCA9IHBhcmVudEVsZW1lbnQuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdGxldCBpbmRleCA9IDA7XG5cblx0d2hpbGUgKGVsICE9PSBlbGVtZW50ICYmIGVsICE9PSBwYXJlbnRFbGVtZW50Lmxhc3RFbGVtZW50Q2hpbGQgJiYgZWwpIHtcblx0XHRlbCA9IGVsLm5leHRFbGVtZW50U2libGluZztcblx0XHRpbmRleCsrO1xuXHR9XG5cblx0cmV0dXJuIGluZGV4O1xufVxuXG4vKipcbiAqIEZpbmQgdGhlIGdyaWQgbG9jYXRpb24gb2YgYSBzcGVjaWZpYyBET00gZWxlbWVudCBieSB0cmF2ZXJzaW5nIHRoZSBwYXJlbnRcbiAqIGNoYWluIGFuZCBmaW5kaW5nIGVhY2ggY2hpbGQgaW5kZXggb24gdGhlIHdheS5cbiAqXG4gKiBUaGlzIHdpbGwgYnJlYWsgYXMgc29vbiBhcyBET00gc3RydWN0dXJlcyBvZiB0aGUgU3BsaXR2aWV3IG9yIEdyaWR2aWV3IGNoYW5nZS5cbiAqL1xuZnVuY3Rpb24gZ2V0R3JpZExvY2F0aW9uKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogR3JpZExvY2F0aW9uIHtcblx0Y29uc3QgcGFyZW50RWxlbWVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcblxuXHRpZiAoIXBhcmVudEVsZW1lbnQpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZ3JpZCBlbGVtZW50Jyk7XG5cdH1cblxuXHRpZiAoL1xcYm1vbmFjby1ncmlkLXZpZXdcXGIvLnRlc3QocGFyZW50RWxlbWVudC5jbGFzc05hbWUpKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgaW5kZXggPSBpbmRleEluUGFyZW50KHBhcmVudEVsZW1lbnQpO1xuXHRjb25zdCBhbmNlc3RvciA9IHBhcmVudEVsZW1lbnQucGFyZW50RWxlbWVudCEucGFyZW50RWxlbWVudCEucGFyZW50RWxlbWVudCEucGFyZW50RWxlbWVudCE7XG5cdHJldHVybiBbLi4uZ2V0R3JpZExvY2F0aW9uKGFuY2VzdG9yKSwgaW5kZXhdO1xufVxuXG5leHBvcnQgdHlwZSBEaXN0cmlidXRlU2l6aW5nID0geyB0eXBlOiAnZGlzdHJpYnV0ZScgfTtcbmV4cG9ydCB0eXBlIFNwbGl0U2l6aW5nID0geyB0eXBlOiAnc3BsaXQnIH07XG5leHBvcnQgdHlwZSBBdXRvU2l6aW5nID0geyB0eXBlOiAnYXV0bycgfTtcbmV4cG9ydCB0eXBlIEludmlzaWJsZVNpemluZyA9IHsgdHlwZTogJ2ludmlzaWJsZSc7IGNhY2hlZFZpc2libGVTaXplOiBudW1iZXIgfTtcbmV4cG9ydCB0eXBlIFNpemluZyA9IERpc3RyaWJ1dGVTaXppbmcgfCBTcGxpdFNpemluZyB8IEF1dG9TaXppbmcgfCBJbnZpc2libGVTaXppbmc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2l6aW5nIHtcblx0ZXhwb3J0IGNvbnN0IERpc3RyaWJ1dGU6IERpc3RyaWJ1dGVTaXppbmcgPSB7IHR5cGU6ICdkaXN0cmlidXRlJyB9O1xuXHRleHBvcnQgY29uc3QgU3BsaXQ6IFNwbGl0U2l6aW5nID0geyB0eXBlOiAnc3BsaXQnIH07XG5cdGV4cG9ydCBjb25zdCBBdXRvOiBBdXRvU2l6aW5nID0geyB0eXBlOiAnYXV0bycgfTtcblx0ZXhwb3J0IGZ1bmN0aW9uIEludmlzaWJsZShjYWNoZWRWaXNpYmxlU2l6ZTogbnVtYmVyKTogSW52aXNpYmxlU2l6aW5nIHsgcmV0dXJuIHsgdHlwZTogJ2ludmlzaWJsZScsIGNhY2hlZFZpc2libGVTaXplIH07IH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JpZFN0eWxlcyBleHRlbmRzIElHcmlkVmlld1N0eWxlcyB7IH1cbmV4cG9ydCBpbnRlcmZhY2UgSUdyaWRPcHRpb25zIGV4dGVuZHMgSUdyaWRWaWV3T3B0aW9ucyB7IH1cblxuLyoqXG4gKiBUaGUge0BsaW5rIEdyaWR9IGV4cG9zZXMgYSBHcmlkIHdpZGdldCBpbiBhIGZyaWVuZGxpZXIgQVBJIHRoYW4gdGhlIHVuZGVybHlpbmdcbiAqIHtAbGluayBHcmlkVmlld30gd2lkZ2V0LiBOYW1lbHksIGFsbCBtdXRhdGlvbiBvcGVyYXRpb25zIGFyZSBhZGRyZXNzZWQgYnkgdGhlXG4gKiBtb2RlbCBlbGVtZW50cywgcmF0aGVyIHRoYW4gaW5kZXhlcy5cbiAqXG4gKiBJdCBzdXBwb3J0IHRoZSBzYW1lIGZlYXR1cmVzIGFzIHRoZSB7QGxpbmsgR3JpZFZpZXd9LlxuICovXG5leHBvcnQgY2xhc3MgR3JpZDxUIGV4dGVuZHMgSVZpZXcgPSBJVmlldz4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcm90ZWN0ZWQgZ3JpZHZpZXc6IEdyaWRWaWV3O1xuXHRwcml2YXRlIHZpZXdzID0gbmV3IE1hcDxULCBIVE1MRWxlbWVudD4oKTtcblxuXHQvKipcblx0ICogVGhlIG9yaWVudGF0aW9uIG9mIHRoZSBncmlkLiBNYXRjaGVzIHRoZSBvcmllbnRhdGlvbiBvZiB0aGUgcm9vdFxuXHQgKiB7QGxpbmsgU3BsaXRWaWV3fSBpbiB0aGUgZ3JpZCdzIHtAbGluayBHcmlkTG9jYXRpb259IG1vZGVsLlxuXHQgKi9cblx0Z2V0IG9yaWVudGF0aW9uKCk6IE9yaWVudGF0aW9uIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcub3JpZW50YXRpb247IH1cblx0c2V0IG9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbikgeyB0aGlzLmdyaWR2aWV3Lm9yaWVudGF0aW9uID0gb3JpZW50YXRpb247IH1cblxuXHQvKipcblx0ICogVGhlIHdpZHRoIG9mIHRoZSBncmlkLlxuXHQgKi9cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWR2aWV3LndpZHRoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBoZWlnaHQgb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgaGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWR2aWV3LmhlaWdodDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWluaW11bSB3aWR0aCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtaW5pbXVtV2lkdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcubWluaW11bVdpZHRoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIGhlaWdodCBvZiB0aGUgZ3JpZC5cblx0ICovXG5cdGdldCBtaW5pbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWR2aWV3Lm1pbmltdW1IZWlnaHQ7IH1cblxuXHQvKipcblx0ICogVGhlIG1heGltdW0gd2lkdGggb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWR2aWV3Lm1heGltdW1XaWR0aDsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBoZWlnaHQgb2YgdGhlIGdyaWQuXG5cdCAqL1xuXHRnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkdmlldy5tYXhpbXVtSGVpZ2h0OyB9XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW5ldmVyIGEgdmlldyB3aXRoaW4gdGhlIGdyaWQgY2hhbmdlcyBpdHMgc2l6ZSBjb25zdHJhaW50cy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuZXZlciB0aGUgdXNlciBzY3JvbGxzIGEge0BsaW5rIFNwbGl0Vmlld30gd2l0aGluXG5cdCAqIHRoZSBncmlkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTY3JvbGw6IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBBIGNvbGxlY3Rpb24gb2Ygc2FzaGVzIHBlcnBlbmRpY3VsYXIgdG8gZWFjaCBlZGdlIG9mIHRoZSBncmlkLlxuXHQgKiBDb3JuZXIgc2FzaGVzIHdpbGwgYmUgY3JlYXRlZCBmb3IgZWFjaCBpbnRlcnNlY3Rpb24uXG5cdCAqL1xuXHRnZXQgYm91bmRhcnlTYXNoZXMoKTogSUJvdW5kYXJ5U2FzaGVzIHsgcmV0dXJuIHRoaXMuZ3JpZHZpZXcuYm91bmRhcnlTYXNoZXM7IH1cblx0c2V0IGJvdW5kYXJ5U2FzaGVzKGJvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpIHsgdGhpcy5ncmlkdmlldy5ib3VuZGFyeVNhc2hlcyA9IGJvdW5kYXJ5U2FzaGVzOyB9XG5cblx0LyoqXG5cdCAqIEVuYWJsZS9kaXNhYmxlIGVkZ2Ugc25hcHBpbmcgYWNyb3NzIGFsbCBncmlkIHZpZXdzLlxuXHQgKi9cblx0c2V0IGVkZ2VTbmFwcGluZyhlZGdlU25hcHBpbmc6IGJvb2xlYW4pIHsgdGhpcy5ncmlkdmlldy5lZGdlU25hcHBpbmcgPSBlZGdlU25hcHBpbmc7IH1cblxuXHQvKipcblx0ICogVGhlIERPTSBlbGVtZW50IGZvciB0aGlzIHZpZXcuXG5cdCAqL1xuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLmdyaWR2aWV3LmVsZW1lbnQ7IH1cblxuXHRwcml2YXRlIGRpZExheW91dCA9IGZhbHNlO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld01heGltaXplZDogRXZlbnQ8Ym9vbGVhbj47XG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcge0BsaW5rIEdyaWR9LiBBIGdyaWQgbXVzdCAqYWx3YXlzKiBoYXZlIGEgdmlld1xuXHQgKiBpbnNpZGUuXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IEFuIGluaXRpYWwgdmlldyBmb3IgdGhpcyBHcmlkLlxuXHQgKi9cblx0Y29uc3RydWN0b3IodmlldzogVCB8IEdyaWRWaWV3LCBvcHRpb25zOiBJR3JpZE9wdGlvbnMgPSB7fSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAodmlldyBpbnN0YW5jZW9mIEdyaWRWaWV3KSB7XG5cdFx0XHR0aGlzLmdyaWR2aWV3ID0gdmlldztcblx0XHRcdHRoaXMuZ3JpZHZpZXcuZ2V0Vmlld01hcCh0aGlzLnZpZXdzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ncmlkdmlldyA9IG5ldyBHcmlkVmlldyhvcHRpb25zKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyaWR2aWV3KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdyaWR2aWV3Lm9uRGlkU2FzaFJlc2V0KHRoaXMub25EaWRTYXNoUmVzZXQsIHRoaXMpKTtcblxuXHRcdGlmICghKHZpZXcgaW5zdGFuY2VvZiBHcmlkVmlldykpIHtcblx0XHRcdHRoaXMuX2FkZFZpZXcodmlldywgMCwgWzBdKTtcblx0XHR9XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gdGhpcy5ncmlkdmlldy5vbkRpZENoYW5nZTtcblx0XHR0aGlzLm9uRGlkU2Nyb2xsID0gdGhpcy5ncmlkdmlldy5vbkRpZFNjcm9sbDtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmlld01heGltaXplZCA9IHRoaXMuZ3JpZHZpZXcub25EaWRDaGFuZ2VWaWV3TWF4aW1pemVkO1xuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJR3JpZFN0eWxlcyk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZHZpZXcuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHtAbGluayBHcmlkfS5cblx0ICpcblx0ICogT3B0aW9uYWxseSBwcm92aWRlIGEgYHRvcGAgYW5kIGBsZWZ0YCBwb3NpdGlvbnMsIHRob3NlIHdpbGwgcHJvcGFnYXRlXG5cdCAqIGFzIGFuIG9yaWdpbiBmb3IgcG9zaXRpb25zIHBhc3NlZCB0byB7QGxpbmsgSVZpZXcubGF5b3V0fS5cblx0ICpcblx0ICogQHBhcmFtIHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKiBAcGFyYW0gaGVpZ2h0IFRoZSBoZWlnaHQgb2YgdGhlIHtAbGluayBHcmlkfS5cblx0ICogQHBhcmFtIHRvcCBPcHRpb25hbCwgdGhlIHRvcCBsb2NhdGlvbiBvZiB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKiBAcGFyYW0gbGVmdCBPcHRpb25hbCwgdGhlIGxlZnQgbG9jYXRpb24gb2YgdGhlIHtAbGluayBHcmlkfS5cblx0ICovXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIgPSAwLCBsZWZ0OiBudW1iZXIgPSAwKTogdm9pZCB7XG5cdFx0dGhpcy5ncmlkdmlldy5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblx0XHR0aGlzLmRpZExheW91dCA9IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQWRkIGEge0BsaW5rIElWaWV3IHZpZXd9IHRvIHRoaXMge0BsaW5rIEdyaWR9LCBiYXNlZCBvbiBhbm90aGVyIHJlZmVyZW5jZSB2aWV3LlxuXHQgKlxuXHQgKiBUYWtlIHRoaXMgZ3JpZCBhcyBhbiBleGFtcGxlOlxuXHQgKlxuXHQgKiBgYGBcblx0ICogICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG5cdCAqICB8ICBBICB8ICAgICAgQiAgICAgICAgfFxuXHQgKiAgKy0tLS0tKy0tLS0tLS0tLSstLS0tLStcblx0ICogIHwgICAgICAgIEMgICAgICB8ICAgICB8XG5cdCAqICArLS0tLS0tLS0tLS0tLS0tKyAgRCAgfFxuXHQgKiAgfCAgICAgICAgRSAgICAgIHwgICAgIHxcblx0ICogICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBDYWxsaW5nIGBhZGRWaWV3KFgsIFNpemluZy5EaXN0cmlidXRlLCBDLCBEaXJlY3Rpb24uUmlnaHQpYCB3aWxsIG1ha2UgdGhlIGZvbGxvd2luZ1xuXHQgKiBjaGFuZ2VzOlxuXHQgKlxuXHQgKiBgYGBcblx0ICogICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG5cdCAqICB8ICBBICB8ICAgICAgQiAgICAgICAgfFxuXHQgKiAgKy0tLS0tKy0rLS0tLS0tLSstLS0tLStcblx0ICogIHwgICBDICAgfCAgIFggICB8ICAgICB8XG5cdCAqICArLS0tLS0tLSstLS0tLS0tKyAgRCAgfFxuXHQgKiAgfCAgICAgICAgRSAgICAgIHwgICAgIHxcblx0ICogICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBPciBgYWRkVmlldyhYLCBTaXppbmcuRGlzdHJpYnV0ZSwgRCwgRGlyZWN0aW9uLkRvd24pYDpcblx0ICpcblx0ICogYGBgXG5cdCAqICArLS0tLS0rLS0tLS0tLS0tLS0tLS0tK1xuXHQgKiAgfCAgQSAgfCAgICAgIEIgICAgICAgIHxcblx0ICogICstLS0tLSstLS0tLS0tLS0rLS0tLS0rXG5cdCAqICB8ICAgICAgICBDICAgICAgfCAgRCAgfFxuXHQgKiAgKy0tLS0tLS0tLS0tLS0tLSstLS0tLStcblx0ICogIHwgICAgICAgIEUgICAgICB8ICBYICB8XG5cdCAqICArLS0tLS0tLS0tLS0tLS0tKy0tLS0tK1xuXHQgKiBgYGBcblx0ICpcblx0ICogQHBhcmFtIG5ld1ZpZXcgVGhlIHZpZXcgdG8gYWRkLlxuXHQgKiBAcGFyYW0gc2l6ZSBFaXRoZXIgYSBmaXhlZCBzaXplLCBvciBhIGR5bmFtaWMge0BsaW5rIFNpemluZ30gc3RyYXRlZ3kuXG5cdCAqIEBwYXJhbSByZWZlcmVuY2VWaWV3IEFub3RoZXIgdmlldyB0byBwbGFjZSB0aGlzIG5ldyB2aWV3IG5leHQgdG8uXG5cdCAqIEBwYXJhbSBkaXJlY3Rpb24gVGhlIGRpcmVjdGlvbiB0aGUgbmV3IHZpZXcgc2hvdWxkIGJlIHBsYWNlZCBuZXh0IHRvIHRoZSByZWZlcmVuY2Ugdmlldy5cblx0ICovXG5cdGFkZFZpZXcobmV3VmlldzogVCwgc2l6ZTogbnVtYmVyIHwgU2l6aW5nLCByZWZlcmVuY2VWaWV3OiBULCBkaXJlY3Rpb246IERpcmVjdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdzLmhhcyhuZXdWaWV3KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IGFkZCBzYW1lIHZpZXcgdHdpY2UnKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcmllbnRhdGlvbiA9IGdldERpcmVjdGlvbk9yaWVudGF0aW9uKGRpcmVjdGlvbik7XG5cblx0XHRpZiAodGhpcy52aWV3cy5zaXplID09PSAxICYmIHRoaXMub3JpZW50YXRpb24gIT09IG9yaWVudGF0aW9uKSB7XG5cdFx0XHR0aGlzLm9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbihyZWZlcmVuY2VWaWV3KTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGdldFJlbGF0aXZlTG9jYXRpb24odGhpcy5ncmlkdmlldy5vcmllbnRhdGlvbiwgcmVmZXJlbmNlTG9jYXRpb24sIGRpcmVjdGlvbik7XG5cblx0XHRsZXQgdmlld1NpemU6IG51bWJlciB8IEdyaWRWaWV3U2l6aW5nO1xuXG5cdFx0aWYgKHR5cGVvZiBzaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0dmlld1NpemUgPSBzaXplO1xuXHRcdH0gZWxzZSBpZiAoc2l6ZS50eXBlID09PSAnc3BsaXQnKSB7XG5cdFx0XHRjb25zdCBbLCBpbmRleF0gPSB0YWlsKHJlZmVyZW5jZUxvY2F0aW9uKTtcblx0XHRcdHZpZXdTaXplID0gR3JpZFZpZXdTaXppbmcuU3BsaXQoaW5kZXgpO1xuXHRcdH0gZWxzZSBpZiAoc2l6ZS50eXBlID09PSAnZGlzdHJpYnV0ZScpIHtcblx0XHRcdHZpZXdTaXplID0gR3JpZFZpZXdTaXppbmcuRGlzdHJpYnV0ZTtcblx0XHR9IGVsc2UgaWYgKHNpemUudHlwZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRjb25zdCBbLCBpbmRleF0gPSB0YWlsKHJlZmVyZW5jZUxvY2F0aW9uKTtcblx0XHRcdHZpZXdTaXplID0gR3JpZFZpZXdTaXppbmcuQXV0byhpbmRleCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXdTaXplID0gc2l6ZTtcblx0XHR9XG5cblx0XHR0aGlzLl9hZGRWaWV3KG5ld1ZpZXcsIHZpZXdTaXplLCBsb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGFkZFZpZXdBdChuZXdWaWV3OiBULCBzaXplOiBudW1iZXIgfCBEaXN0cmlidXRlU2l6aW5nIHwgSW52aXNpYmxlU2l6aW5nLCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld3MuaGFzKG5ld1ZpZXcpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhblxcJ3QgYWRkIHNhbWUgdmlldyB0d2ljZScpO1xuXHRcdH1cblxuXHRcdGxldCB2aWV3U2l6ZTogbnVtYmVyIHwgR3JpZFZpZXdTaXppbmc7XG5cblx0XHRpZiAodHlwZW9mIHNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHR2aWV3U2l6ZSA9IHNpemU7XG5cdFx0fSBlbHNlIGlmIChzaXplLnR5cGUgPT09ICdkaXN0cmlidXRlJykge1xuXHRcdFx0dmlld1NpemUgPSBHcmlkVmlld1NpemluZy5EaXN0cmlidXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2aWV3U2l6ZSA9IHNpemU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWRkVmlldyhuZXdWaWV3LCB2aWV3U2l6ZSwgbG9jYXRpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hZGRWaWV3KG5ld1ZpZXc6IFQsIHNpemU6IG51bWJlciB8IEdyaWRWaWV3U2l6aW5nLCBsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3cy5zZXQobmV3VmlldywgbmV3Vmlldy5lbGVtZW50KTtcblx0XHR0aGlzLmdyaWR2aWV3LmFkZFZpZXcobmV3Vmlldywgc2l6ZSwgbG9jYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZSBhIHtAbGluayBJVmlldyB2aWV3fSBmcm9tIHRoaXMge0BsaW5rIEdyaWR9LlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9IHRvIHJlbW92ZS5cblx0ICogQHBhcmFtIHNpemluZyBXaGV0aGVyIHRvIGRpc3RyaWJ1dGUgb3RoZXIge0BsaW5rIElWaWV3IHZpZXd9J3Mgc2l6ZXMuXG5cdCAqL1xuXHRyZW1vdmVWaWV3KHZpZXc6IFQsIHNpemluZz86IFNpemluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdzLnNpemUgPT09IDEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuXFwndCByZW1vdmUgbGFzdCB2aWV3Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblxuXHRcdGxldCBncmlkVmlld1NpemluZzogRGlzdHJpYnV0ZVNpemluZyB8IFNwbGl0Vmlld0F1dG9TaXppbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoc2l6aW5nPy50eXBlID09PSAnZGlzdHJpYnV0ZScpIHtcblx0XHRcdGdyaWRWaWV3U2l6aW5nID0gR3JpZFZpZXdTaXppbmcuRGlzdHJpYnV0ZTtcblx0XHR9IGVsc2UgaWYgKHNpemluZz8udHlwZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IGxvY2F0aW9uW2xvY2F0aW9uLmxlbmd0aCAtIDFdO1xuXHRcdFx0Z3JpZFZpZXdTaXppbmcgPSBHcmlkVmlld1NpemluZy5BdXRvKGluZGV4ID09PSAwID8gMSA6IGluZGV4IC0gMSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ncmlkdmlldy5yZW1vdmVWaWV3KGxvY2F0aW9uLCBncmlkVmlld1NpemluZyk7XG5cdFx0dGhpcy52aWV3cy5kZWxldGUodmlldyk7XG5cdH1cblxuXHQvKipcblx0ICogTW92ZSBhIHtAbGluayBJVmlldyB2aWV3fSB0byBhbm90aGVyIGxvY2F0aW9uIGluIHRoZSBncmlkLlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBTZWUge0BsaW5rIEdyaWQuYWRkVmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30gdG8gbW92ZS5cblx0ICogQHBhcmFtIHNpemluZyBFaXRoZXIgYSBmaXhlZCBzaXplLCBvciBhIGR5bmFtaWMge0BsaW5rIFNpemluZ30gc3RyYXRlZ3kuXG5cdCAqIEBwYXJhbSByZWZlcmVuY2VWaWV3IEFub3RoZXIgdmlldyB0byBwbGFjZSB0aGUgdmlldyBuZXh0IHRvLlxuXHQgKiBAcGFyYW0gZGlyZWN0aW9uIFRoZSBkaXJlY3Rpb24gdGhlIHZpZXcgc2hvdWxkIGJlIHBsYWNlZCBuZXh0IHRvIHRoZSByZWZlcmVuY2Ugdmlldy5cblx0ICovXG5cdG1vdmVWaWV3KHZpZXc6IFQsIHNpemluZzogbnVtYmVyIHwgU2l6aW5nLCByZWZlcmVuY2VWaWV3OiBULCBkaXJlY3Rpb246IERpcmVjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNvdXJjZUxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0Y29uc3QgW3NvdXJjZVBhcmVudExvY2F0aW9uLCBmcm9tXSA9IHRhaWwoc291cmNlTG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgcmVmZXJlbmNlTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbihyZWZlcmVuY2VWaWV3KTtcblx0XHRjb25zdCB0YXJnZXRMb2NhdGlvbiA9IGdldFJlbGF0aXZlTG9jYXRpb24odGhpcy5ncmlkdmlldy5vcmllbnRhdGlvbiwgcmVmZXJlbmNlTG9jYXRpb24sIGRpcmVjdGlvbik7XG5cdFx0Y29uc3QgW3RhcmdldFBhcmVudExvY2F0aW9uLCB0b10gPSB0YWlsKHRhcmdldExvY2F0aW9uKTtcblxuXHRcdGlmIChlcXVhbHMoc291cmNlUGFyZW50TG9jYXRpb24sIHRhcmdldFBhcmVudExvY2F0aW9uKSkge1xuXHRcdFx0dGhpcy5ncmlkdmlldy5tb3ZlVmlldyhzb3VyY2VQYXJlbnRMb2NhdGlvbiwgZnJvbSwgdG8pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlbW92ZVZpZXcodmlldywgdHlwZW9mIHNpemluZyA9PT0gJ251bWJlcicgPyB1bmRlZmluZWQgOiBzaXppbmcpO1xuXHRcdFx0dGhpcy5hZGRWaWV3KHZpZXcsIHNpemluZywgcmVmZXJlbmNlVmlldywgZGlyZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTW92ZSBhIHtAbGluayBJVmlldyB2aWV3fSB0byBhbm90aGVyIGxvY2F0aW9uIGluIHRoZSBncmlkLlxuXHQgKlxuXHQgKiBAcmVtYXJrcyBJbnRlcm5hbCBtZXRob2QsIGRvIG5vdCB1c2Ugd2l0aG91dCBrbm93aW5nIHdoYXQgeW91J3JlIGRvaW5nLlxuXHQgKiBAcmVtYXJrcyBTZWUge0BsaW5rIEdyaWRWaWV3Lm1vdmVWaWV3fS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fSB0byBtb3ZlLlxuXHQgKiBAcGFyYW0gbG9jYXRpb24gVGhlIHtAbGluayBHcmlkTG9jYXRpb24gbG9jYXRpb259IHRvIGluc2VydCB0aGUgdmlldyBvbi5cblx0ICovXG5cdG1vdmVWaWV3VG8odmlldzogVCwgbG9jYXRpb246IEdyaWRMb2NhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNvdXJjZUxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0Y29uc3QgW3NvdXJjZVBhcmVudExvY2F0aW9uLCBmcm9tXSA9IHRhaWwoc291cmNlTG9jYXRpb24pO1xuXHRcdGNvbnN0IFt0YXJnZXRQYXJlbnRMb2NhdGlvbiwgdG9dID0gdGFpbChsb2NhdGlvbik7XG5cblx0XHRpZiAoZXF1YWxzKHNvdXJjZVBhcmVudExvY2F0aW9uLCB0YXJnZXRQYXJlbnRMb2NhdGlvbikpIHtcblx0XHRcdHRoaXMuZ3JpZHZpZXcubW92ZVZpZXcoc291cmNlUGFyZW50TG9jYXRpb24sIGZyb20sIHRvKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc2l6ZSA9IHRoaXMuZ2V0Vmlld1NpemUodmlldyk7XG5cdFx0XHRjb25zdCBvcmllbnRhdGlvbiA9IGdldExvY2F0aW9uT3JpZW50YXRpb24odGhpcy5ncmlkdmlldy5vcmllbnRhdGlvbiwgc291cmNlTG9jYXRpb24pO1xuXHRcdFx0Y29uc3QgY2FjaGVkVmlld1NpemUgPSB0aGlzLmdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh2aWV3KTtcblx0XHRcdGNvbnN0IHNpemluZyA9IHR5cGVvZiBjYWNoZWRWaWV3U2l6ZSA9PT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0PyAob3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBzaXplLndpZHRoIDogc2l6ZS5oZWlnaHQpXG5cdFx0XHRcdDogU2l6aW5nLkludmlzaWJsZShjYWNoZWRWaWV3U2l6ZSk7XG5cblx0XHRcdHRoaXMucmVtb3ZlVmlldyh2aWV3KTtcblx0XHRcdHRoaXMuYWRkVmlld0F0KHZpZXcsIHNpemluZywgbG9jYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTd2FwIHR3byB7QGxpbmsgSVZpZXcgdmlld3N9IHdpdGhpbiB0aGUge0BsaW5rIEdyaWR9LlxuXHQgKlxuXHQgKiBAcGFyYW0gZnJvbSBPbmUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKiBAcGFyYW0gdG8gQW5vdGhlciB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRzd2FwVmlld3MoZnJvbTogVCwgdG86IFQpOiB2b2lkIHtcblx0XHRjb25zdCBmcm9tTG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbihmcm9tKTtcblx0XHRjb25zdCB0b0xvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odG8pO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LnN3YXBWaWV3cyhmcm9tTG9jYXRpb24sIHRvTG9jYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2l6ZSBhIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fSB0byByZXNpemUuXG5cdCAqIEBwYXJhbSBzaXplIFRoZSBzaXplIHRoZSB2aWV3IHNob3VsZCBiZS5cblx0ICovXG5cdHJlc2l6ZVZpZXcodmlldzogVCwgc2l6ZTogSVZpZXdTaXplKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRyZXR1cm4gdGhpcy5ncmlkdmlldy5yZXNpemVWaWV3KGxvY2F0aW9uLCBzaXplKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgYWxsIG90aGVyIHtAbGluayBJVmlldyB2aWV3c30gYXJlIGF0IHRoZWlyIG1pbmltdW0gc2l6ZS5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHJlZmVyZW5jZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRpc1ZpZXdFeHBhbmRlZCh2aWV3OiBUKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRyZXR1cm4gdGhpcy5ncmlkdmlldy5pc1ZpZXdFeHBhbmRlZChsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSB7QGxpbmsgSVZpZXcgdmlld30gaXMgbWF4aW1pemVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgcmVmZXJlbmNlIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGlzVmlld01heGltaXplZCh2aWV3OiBUKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRyZXR1cm4gdGhpcy5ncmlkdmlldy5pc1ZpZXdNYXhpbWl6ZWQobG9jYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUge0BsaW5rIElWaWV3IHZpZXd9IGlzIG1heGltaXplZC5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHJlZmVyZW5jZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRoYXNNYXhpbWl6ZWRWaWV3KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3Lmhhc01heGltaXplZFZpZXcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHNpemUgb2YgYSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30uIFByb3ZpZGUgYHVuZGVmaW5lZGAgdG8gZ2V0IHRoZSBzaXplXG5cdCAqIG9mIHRoZSBncmlkIGl0c2VsZi5cblx0ICovXG5cdGdldFZpZXdTaXplKHZpZXc/OiBUKTogSVZpZXdTaXplIHtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmdldFZpZXdTaXplKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRyZXR1cm4gdGhpcy5ncmlkdmlldy5nZXRWaWV3U2l6ZShsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjYWNoZWQgdmlzaWJsZSBzaXplIG9mIGEge0BsaW5rIElWaWV3IHZpZXd9LiBUaGlzIHdhcyB0aGUgc2l6ZVxuXHQgKiBvZiB0aGUgdmlldyBhdCB0aGUgbW9tZW50IGl0IGxhc3QgYmVjYW1lIGhpZGRlbi5cblx0ICpcblx0ICogQHBhcmFtIHZpZXcgVGhlIHtAbGluayBJVmlldyB2aWV3fS5cblx0ICovXG5cdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh2aWV3OiBUKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZShsb2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogTWF4aW1pemVzIHRoZSBzcGVjaWZpZWQgdmlldyBhbmQgaGlkZXMgYWxsIG90aGVyIHZpZXdzLlxuXHQgKiBAcGFyYW0gdmlldyBUaGUgdmlldyB0byBtYXhpbWl6ZS5cblx0ICogQHBhcmFtIGV4Y2x1ZGVWaWV3cyBPcHRpb25hbCBhcnJheSBvZiB2aWV3cyB0byBleGNsdWRlIGZyb20gYmVpbmcgaGlkZGVuLlxuXHQgKi9cblx0bWF4aW1pemVWaWV3KHZpZXc6IFQsIGV4Y2x1ZGVWaWV3czogcmVhZG9ubHkgVFtdID0gW10pIHtcblx0XHRpZiAodGhpcy52aWV3cy5zaXplIDwgMikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdCBsZWFzdCB0d28gdmlld3MgYXJlIHJlcXVpcmVkIHRvIG1heGltaXplIGEgdmlldycpO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuZ2V0Vmlld0xvY2F0aW9uKHZpZXcpO1xuXHRcdHRoaXMuZ3JpZHZpZXcubWF4aW1pemVWaWV3KGxvY2F0aW9uLCBleGNsdWRlVmlld3MpO1xuXHR9XG5cblx0ZXhpdE1heGltaXplZFZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5ncmlkdmlldy5leGl0TWF4aW1pemVkVmlldygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGFuZCB0aGUgc2l6ZSBvZiBhIHtAbGluayBJVmlldyB2aWV3fSBieSBjb2xsYXBzaW5nIGFsbCBvdGhlciB2aWV3c1xuXHQgKiB0byB0aGVpciBtaW5pbXVtIHNpemVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKi9cblx0ZXhwYW5kVmlldyh2aWV3OiBUKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHR0aGlzLmdyaWR2aWV3LmV4cGFuZFZpZXcobG9jYXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3RyaWJ1dGUgdGhlIHNpemUgYW1vbmcgYWxsIHtAbGluayBJVmlldyB2aWV3c30gd2l0aGluIHRoZSBlbnRpcmVcblx0ICogZ3JpZCBvciB3aXRoaW4gYSBzaW5nbGUge0BsaW5rIFNwbGl0Vmlld30uXG5cdCAqL1xuXHRkaXN0cmlidXRlVmlld1NpemVzKCk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZHZpZXcuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBhIHtAbGluayBJVmlldyB2aWV3fSBpcyB2aXNpYmxlLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKi9cblx0aXNWaWV3VmlzaWJsZSh2aWV3OiBUKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHRyZXR1cm4gdGhpcy5ncmlkdmlldy5pc1ZpZXdWaXNpYmxlKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIHZpc2liaWxpdHkgc3RhdGUgb2YgYSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqXG5cdCAqIEBwYXJhbSB2aWV3IFRoZSB7QGxpbmsgSVZpZXcgdmlld30uXG5cdCAqL1xuXHRzZXRWaWV3VmlzaWJsZSh2aWV3OiBULCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmdldFZpZXdMb2NhdGlvbih2aWV3KTtcblx0XHR0aGlzLmdyaWR2aWV3LnNldFZpZXdWaXNpYmxlKGxvY2F0aW9uLCB2aXNpYmxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgZGVzY3JpcHRvciBmb3IgdGhlIGVudGlyZSBncmlkLlxuXHQgKi9cblx0Z2V0Vmlld3MoKTogR3JpZEJyYW5jaE5vZGU8VD4ge1xuXHRcdHJldHVybiB0aGlzLmdyaWR2aWV3LmdldFZpZXcoKSBhcyBHcmlkQnJhbmNoTm9kZTxUPjtcblx0fVxuXG5cdC8qKlxuXHQgKiBVdGlsaXR5IG1ldGhvZCB0byByZXR1cm4gdGhlIGNvbGxlY3Rpb24gYWxsIHZpZXdzIHdoaWNoIGludGVyc2VjdFxuXHQgKiBhIHZpZXcncyBlZGdlLlxuXHQgKlxuXHQgKiBAcGFyYW0gdmlldyBUaGUge0BsaW5rIElWaWV3IHZpZXd9LlxuXHQgKiBAcGFyYW0gZGlyZWN0aW9uIFdoaWNoIGRpcmVjdGlvbiBlZGdlIHRvIGJlIGNvbnNpZGVyZWQuXG5cdCAqIEBwYXJhbSB3cmFwIFdoZXRoZXIgdGhlIGdyaWQgd3JhcHMgYXJvdW5kIChmcm9tIHJpZ2h0IHRvIGxlZnQsIGZyb20gYm90dG9tIHRvIHRvcCkuXG5cdCAqL1xuXHRnZXROZWlnaGJvclZpZXdzKHZpZXc6IFQsIGRpcmVjdGlvbjogRGlyZWN0aW9uLCB3cmFwOiBib29sZWFuID0gZmFsc2UpOiBUW10ge1xuXHRcdGlmICghdGhpcy5kaWRMYXlvdXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2FuXFwndCBjYWxsIGdldE5laWdoYm9yVmlld3MgYmVmb3JlIGZpcnN0IGxheW91dCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRWaWV3TG9jYXRpb24odmlldyk7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZ2V0Vmlld3MoKTtcblx0XHRjb25zdCBub2RlID0gZ2V0R3JpZE5vZGUocm9vdCwgbG9jYXRpb24pO1xuXHRcdGxldCBib3VuZGFyeSA9IGdldEJveEJvdW5kYXJ5KG5vZGUuYm94LCBkaXJlY3Rpb24pO1xuXG5cdFx0aWYgKHdyYXApIHtcblx0XHRcdGlmIChkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5VcCAmJiBub2RlLmJveC50b3AgPT09IDApIHtcblx0XHRcdFx0Ym91bmRhcnkgPSB7IG9mZnNldDogcm9vdC5ib3gudG9wICsgcm9vdC5ib3guaGVpZ2h0LCByYW5nZTogYm91bmRhcnkucmFuZ2UgfTtcblx0XHRcdH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uUmlnaHQgJiYgbm9kZS5ib3gubGVmdCArIG5vZGUuYm94LndpZHRoID09PSByb290LmJveC53aWR0aCkge1xuXHRcdFx0XHRib3VuZGFyeSA9IHsgb2Zmc2V0OiAwLCByYW5nZTogYm91bmRhcnkucmFuZ2UgfTtcblx0XHRcdH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uRG93biAmJiBub2RlLmJveC50b3AgKyBub2RlLmJveC5oZWlnaHQgPT09IHJvb3QuYm94LmhlaWdodCkge1xuXHRcdFx0XHRib3VuZGFyeSA9IHsgb2Zmc2V0OiAwLCByYW5nZTogYm91bmRhcnkucmFuZ2UgfTtcblx0XHRcdH0gZWxzZSBpZiAoZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uTGVmdCAmJiBub2RlLmJveC5sZWZ0ID09PSAwKSB7XG5cdFx0XHRcdGJvdW5kYXJ5ID0geyBvZmZzZXQ6IHJvb3QuYm94LmxlZnQgKyByb290LmJveC53aWR0aCwgcmFuZ2U6IGJvdW5kYXJ5LnJhbmdlIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbmRBZGphY2VudEJveExlYWZOb2Rlcyhyb290LCBvcHBvc2l0ZURpcmVjdGlvbihkaXJlY3Rpb24pLCBib3VuZGFyeSlcblx0XHRcdC5tYXAobm9kZSA9PiBub2RlLnZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3TG9jYXRpb24odmlldzogVCk6IEdyaWRMb2NhdGlvbiB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudmlld3MuZ2V0KHZpZXcpO1xuXG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ZpZXcgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdldEdyaWRMb2NhdGlvbihlbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRTYXNoUmVzZXQobG9jYXRpb246IEdyaWRMb2NhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlc2l6ZVRvUHJlZmVycmVkU2l6ZSA9IChsb2NhdGlvbjogR3JpZExvY2F0aW9uKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5ncmlkdmlldy5nZXRWaWV3KGxvY2F0aW9uKSBhcyBHcmlkTm9kZTxUPjtcblxuXHRcdFx0aWYgKGlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXJlY3Rpb24gPSBnZXRMb2NhdGlvbk9yaWVudGF0aW9uKHRoaXMub3JpZW50YXRpb24sIGxvY2F0aW9uKTtcblx0XHRcdGNvbnN0IHNpemUgPSBkaXJlY3Rpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBub2RlLnZpZXcucHJlZmVycmVkV2lkdGggOiBub2RlLnZpZXcucHJlZmVycmVkSGVpZ2h0O1xuXG5cdFx0XHRpZiAodHlwZW9mIHNpemUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld1NpemUgPSBkaXJlY3Rpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB7IHdpZHRoOiBNYXRoLnJvdW5kKHNpemUpIH0gOiB7IGhlaWdodDogTWF0aC5yb3VuZChzaXplKSB9O1xuXHRcdFx0dGhpcy5ncmlkdmlldy5yZXNpemVWaWV3KGxvY2F0aW9uLCB2aWV3U2l6ZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0aWYgKHJlc2l6ZVRvUHJlZmVycmVkU2l6ZShsb2NhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbcGFyZW50TG9jYXRpb24sIGluZGV4XSA9IHRhaWwobG9jYXRpb24pO1xuXG5cdFx0aWYgKHJlc2l6ZVRvUHJlZmVycmVkU2l6ZShbLi4ucGFyZW50TG9jYXRpb24sIGluZGV4ICsgMV0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ncmlkdmlldy5kaXN0cmlidXRlVmlld1NpemVzKHBhcmVudExvY2F0aW9uKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVWaWV3IGV4dGVuZHMgSVZpZXcge1xuXHR0b0pTT04oKTogb2JqZWN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWaWV3RGVzZXJpYWxpemVyPFQgZXh0ZW5kcyBJU2VyaWFsaXphYmxlVmlldz4ge1xuXHRmcm9tSlNPTihqc29uOiBhbnkpOiBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkTGVhZk5vZGUge1xuXHR0eXBlOiAnbGVhZic7XG5cdGRhdGE6IHVua25vd247XG5cdHNpemU6IG51bWJlcjtcblx0dmlzaWJsZT86IGJvb2xlYW47XG5cdG1heGltaXplZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRCcmFuY2hOb2RlIHtcblx0dHlwZTogJ2JyYW5jaCc7XG5cdGRhdGE6IElTZXJpYWxpemVkTm9kZVtdO1xuXHRzaXplOiBudW1iZXI7XG5cdHZpc2libGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBJU2VyaWFsaXplZE5vZGUgPSBJU2VyaWFsaXplZExlYWZOb2RlIHwgSVNlcmlhbGl6ZWRCcmFuY2hOb2RlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkR3JpZCB7XG5cdHJvb3Q6IElTZXJpYWxpemVkTm9kZTtcblx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uO1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIHtAbGluayBHcmlkfSB3aGljaCBjYW4gc2VyaWFsaXplIGl0c2VsZi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNlcmlhbGl6YWJsZUdyaWQ8VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3PiBleHRlbmRzIEdyaWQ8VD4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHNlcmlhbGl6ZU5vZGU8VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3Pihub2RlOiBHcmlkTm9kZTxUPiwgb3JpZW50YXRpb246IE9yaWVudGF0aW9uKTogSVNlcmlhbGl6ZWROb2RlIHtcblx0XHRjb25zdCBzaXplID0gb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gbm9kZS5ib3gud2lkdGggOiBub2RlLmJveC5oZWlnaHQ7XG5cblx0XHRpZiAoIWlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRMZWFmTm9kZTogSVNlcmlhbGl6ZWRMZWFmTm9kZSA9IHsgdHlwZTogJ2xlYWYnLCBkYXRhOiBub2RlLnZpZXcudG9KU09OKCksIHNpemUgfTtcblxuXHRcdFx0aWYgKHR5cGVvZiBub2RlLmNhY2hlZFZpc2libGVTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRzZXJpYWxpemVkTGVhZk5vZGUuc2l6ZSA9IG5vZGUuY2FjaGVkVmlzaWJsZVNpemU7XG5cdFx0XHRcdHNlcmlhbGl6ZWRMZWFmTm9kZS52aXNpYmxlID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKG5vZGUubWF4aW1pemVkKSB7XG5cdFx0XHRcdHNlcmlhbGl6ZWRMZWFmTm9kZS5tYXhpbWl6ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gc2VyaWFsaXplZExlYWZOb2RlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBub2RlLmNoaWxkcmVuLm1hcChjID0+IFNlcmlhbGl6YWJsZUdyaWQuc2VyaWFsaXplTm9kZShjLCBvcnRob2dvbmFsKG9yaWVudGF0aW9uKSkpO1xuXHRcdGlmIChkYXRhLnNvbWUoYyA9PiBjLnZpc2libGUgIT09IGZhbHNlKSkge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ2JyYW5jaCcsIGRhdGE6IGRhdGEsIHNpemUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdHlwZTogJ2JyYW5jaCcsIGRhdGE6IGRhdGEsIHNpemUsIHZpc2libGU6IGZhbHNlIH07XG5cdH1cblxuXHQvKipcblx0ICogQ29uc3RydWN0IGEgbmV3IHtAbGluayBTZXJpYWxpemFibGVHcmlkfSBmcm9tIGEgSlNPTiBvYmplY3QuXG5cdCAqXG5cdCAqIEBwYXJhbSBqc29uIFRoZSBKU09OIG9iamVjdC5cblx0ICogQHBhcmFtIGRlc2VyaWFsaXplciBBIGRlc2VyaWFsaXplciB3aGljaCBjYW4gcmV2aXZlIGVhY2ggdmlldy5cblx0ICogQHJldHVybnMgQSBuZXcge0BsaW5rIFNlcmlhbGl6YWJsZUdyaWR9IGluc3RhbmNlLlxuXHQgKi9cblx0c3RhdGljIGRlc2VyaWFsaXplPFQgZXh0ZW5kcyBJU2VyaWFsaXphYmxlVmlldz4oanNvbjogSVNlcmlhbGl6ZWRHcmlkLCBkZXNlcmlhbGl6ZXI6IElWaWV3RGVzZXJpYWxpemVyPFQ+LCBvcHRpb25zOiBJR3JpZE9wdGlvbnMgPSB7fSk6IFNlcmlhbGl6YWJsZUdyaWQ8VD4ge1xuXHRcdGlmICh0eXBlb2YganNvbi5vcmllbnRhdGlvbiAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OOiBcXCdvcmllbnRhdGlvblxcJyBwcm9wZXJ0eSBtdXN0IGJlIGEgbnVtYmVyLicpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGpzb24ud2lkdGggIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgSlNPTjogXFwnd2lkdGhcXCcgcHJvcGVydHkgbXVzdCBiZSBhIG51bWJlci4nKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBqc29uLmhlaWdodCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBKU09OOiBcXCdoZWlnaHRcXCcgcHJvcGVydHkgbXVzdCBiZSBhIG51bWJlci4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBncmlkdmlldyA9IEdyaWRWaWV3LmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplciwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFNlcmlhbGl6YWJsZUdyaWQ8VD4oZ3JpZHZpZXcsIG9wdGlvbnMpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdHJ1Y3QgYSBuZXcge0BsaW5rIFNlcmlhbGl6YWJsZUdyaWR9IGZyb20gYSBncmlkIGRlc2NyaXB0b3IuXG5cdCAqXG5cdCAqIEBwYXJhbSBncmlkRGVzY3JpcHRvciBBIGdyaWQgZGVzY3JpcHRvciBpbiB3aGljaCBsZWFmIG5vZGVzIHBvaW50IHRvIGFjdHVhbCB2aWV3cy5cblx0ICogQHJldHVybnMgQSBuZXcge0BsaW5rIFNlcmlhbGl6YWJsZUdyaWR9IGluc3RhbmNlLlxuXHQgKi9cblx0c3RhdGljIGZyb208VCBleHRlbmRzIElTZXJpYWxpemFibGVWaWV3PihncmlkRGVzY3JpcHRvcjogR3JpZERlc2NyaXB0b3I8VD4sIG9wdGlvbnM6IElHcmlkT3B0aW9ucyA9IHt9KTogU2VyaWFsaXphYmxlR3JpZDxUPiB7XG5cdFx0cmV0dXJuIFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoY3JlYXRlU2VyaWFsaXplZEdyaWQoZ3JpZERlc2NyaXB0b3IpLCB7IGZyb21KU09OOiB2aWV3ID0+IHZpZXcgfSwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogVXNlZnVsIGluZm9ybWF0aW9uIGluIG9yZGVyIHRvIHByb3BvcnRpb25hbGx5IHJlc3RvcmUgdmlldyBzaXplc1xuXHQgKiB1cG9uIHRoZSB2ZXJ5IGZpcnN0IGxheW91dCBjYWxsLlxuXHQgKi9cblx0cHJpdmF0ZSBpbml0aWFsTGF5b3V0Q29udGV4dDogYm9vbGVhbiA9IHRydWU7XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZSB0aGlzIGdyaWQgaW50byBhIEpTT04gb2JqZWN0LlxuXHQgKi9cblx0c2VyaWFsaXplKCk6IElTZXJpYWxpemVkR3JpZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvb3Q6IFNlcmlhbGl6YWJsZUdyaWQuc2VyaWFsaXplTm9kZSh0aGlzLmdldFZpZXdzKCksIHRoaXMub3JpZW50YXRpb24pLFxuXHRcdFx0b3JpZW50YXRpb246IHRoaXMub3JpZW50YXRpb24sXG5cdFx0XHR3aWR0aDogdGhpcy53aWR0aCxcblx0XHRcdGhlaWdodDogdGhpcy5oZWlnaHRcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciA9IDAsIGxlZnQ6IG51bWJlciA9IDApOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblxuXHRcdGlmICh0aGlzLmluaXRpYWxMYXlvdXRDb250ZXh0KSB7XG5cdFx0XHR0aGlzLmluaXRpYWxMYXlvdXRDb250ZXh0ID0gZmFsc2U7XG5cdFx0XHR0aGlzLmdyaWR2aWV3LnRyeVNldDJ4MigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgdHlwZSBHcmlkTGVhZk5vZGVEZXNjcmlwdG9yPFQ+ID0geyBzaXplPzogbnVtYmVyOyBkYXRhPzogYW55IH07XG5leHBvcnQgdHlwZSBHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3I8VD4gPSB7IHNpemU/OiBudW1iZXI7IGdyb3VwczogR3JpZE5vZGVEZXNjcmlwdG9yPFQ+W10gfTtcbmV4cG9ydCB0eXBlIEdyaWROb2RlRGVzY3JpcHRvcjxUPiA9IEdyaWRCcmFuY2hOb2RlRGVzY3JpcHRvcjxUPiB8IEdyaWRMZWFmTm9kZURlc2NyaXB0b3I8VD47XG5leHBvcnQgdHlwZSBHcmlkRGVzY3JpcHRvcjxUPiA9IHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uIH0gJiBHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3I8VD47XG5cbmZ1bmN0aW9uIGlzR3JpZEJyYW5jaE5vZGVEZXNjcmlwdG9yPFQ+KG5vZGVEZXNjcmlwdG9yOiBHcmlkTm9kZURlc2NyaXB0b3I8VD4pOiBub2RlRGVzY3JpcHRvciBpcyBHcmlkQnJhbmNoTm9kZURlc2NyaXB0b3I8VD4ge1xuXHRyZXR1cm4gISEobm9kZURlc2NyaXB0b3IgYXMgR3JpZEJyYW5jaE5vZGVEZXNjcmlwdG9yPFQ+KS5ncm91cHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUdyaWROb2RlRGVzY3JpcHRvcjxUPihub2RlRGVzY3JpcHRvcjogR3JpZE5vZGVEZXNjcmlwdG9yPFQ+LCByb290Tm9kZTogYm9vbGVhbik6IHZvaWQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aWYgKCFyb290Tm9kZSAmJiAobm9kZURlc2NyaXB0b3IgYXMgYW55KS5ncm91cHMgJiYgKG5vZGVEZXNjcmlwdG9yIGFzIGFueSkuZ3JvdXBzLmxlbmd0aCA8PSAxKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KG5vZGVEZXNjcmlwdG9yIGFzIGFueSkuZ3JvdXBzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKCFpc0dyaWRCcmFuY2hOb2RlRGVzY3JpcHRvcihub2RlRGVzY3JpcHRvcikpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRsZXQgdG90YWxEZWZpbmVkU2l6ZSA9IDA7XG5cdGxldCB0b3RhbERlZmluZWRTaXplQ291bnQgPSAwO1xuXG5cdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZURlc2NyaXB0b3IuZ3JvdXBzKSB7XG5cdFx0c2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3IoY2hpbGQsIGZhbHNlKTtcblxuXHRcdGlmIChjaGlsZC5zaXplKSB7XG5cdFx0XHR0b3RhbERlZmluZWRTaXplICs9IGNoaWxkLnNpemU7XG5cdFx0XHR0b3RhbERlZmluZWRTaXplQ291bnQrKztcblx0XHR9XG5cdH1cblxuXHRjb25zdCB0b3RhbFVuZGVmaW5lZFNpemUgPSB0b3RhbERlZmluZWRTaXplQ291bnQgPiAwID8gdG90YWxEZWZpbmVkU2l6ZSA6IDE7XG5cdGNvbnN0IHRvdGFsVW5kZWZpbmVkU2l6ZUNvdW50ID0gbm9kZURlc2NyaXB0b3IuZ3JvdXBzLmxlbmd0aCAtIHRvdGFsRGVmaW5lZFNpemVDb3VudDtcblx0Y29uc3QgZWFjaFVuZGVmaW5lZFNpemUgPSB0b3RhbFVuZGVmaW5lZFNpemUgLyB0b3RhbFVuZGVmaW5lZFNpemVDb3VudDtcblxuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGVEZXNjcmlwdG9yLmdyb3Vwcykge1xuXHRcdGlmICghY2hpbGQuc2l6ZSkge1xuXHRcdFx0Y2hpbGQuc2l6ZSA9IGVhY2hVbmRlZmluZWRTaXplO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXJpYWxpemVkTm9kZTxUPihub2RlRGVzY3JpcHRvcjogR3JpZE5vZGVEZXNjcmlwdG9yPFQ+KTogSVNlcmlhbGl6ZWROb2RlIHtcblx0aWYgKGlzR3JpZEJyYW5jaE5vZGVEZXNjcmlwdG9yKG5vZGVEZXNjcmlwdG9yKSkge1xuXHRcdHJldHVybiB7IHR5cGU6ICdicmFuY2gnLCBkYXRhOiBub2RlRGVzY3JpcHRvci5ncm91cHMubWFwKGMgPT4gY3JlYXRlU2VyaWFsaXplZE5vZGUoYykpLCBzaXplOiBub2RlRGVzY3JpcHRvci5zaXplISB9O1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB7IHR5cGU6ICdsZWFmJywgZGF0YTogbm9kZURlc2NyaXB0b3IuZGF0YSwgc2l6ZTogbm9kZURlc2NyaXB0b3Iuc2l6ZSEgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXREaW1lbnNpb25zKG5vZGU6IElTZXJpYWxpemVkTm9kZSwgb3JpZW50YXRpb246IE9yaWVudGF0aW9uKTogeyB3aWR0aD86IG51bWJlcjsgaGVpZ2h0PzogbnVtYmVyIH0ge1xuXHRpZiAobm9kZS50eXBlID09PSAnYnJhbmNoJykge1xuXHRcdGNvbnN0IGNoaWxkcmVuRGltZW5zaW9ucyA9IG5vZGUuZGF0YS5tYXAoYyA9PiBnZXREaW1lbnNpb25zKGMsIG9ydGhvZ29uYWwob3JpZW50YXRpb24pKSk7XG5cblx0XHRpZiAob3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IG5vZGUuc2l6ZSB8fCAoY2hpbGRyZW5EaW1lbnNpb25zLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IE1hdGgubWF4KC4uLmNoaWxkcmVuRGltZW5zaW9ucy5tYXAoZCA9PiBkLndpZHRoIHx8IDApKSk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBjaGlsZHJlbkRpbWVuc2lvbnMubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogY2hpbGRyZW5EaW1lbnNpb25zLnJlZHVjZSgociwgZCkgPT4gciArIChkLmhlaWdodCB8fCAwKSwgMCk7XG5cdFx0XHRyZXR1cm4geyB3aWR0aCwgaGVpZ2h0IH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gY2hpbGRyZW5EaW1lbnNpb25zLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IGNoaWxkcmVuRGltZW5zaW9ucy5yZWR1Y2UoKHIsIGQpID0+IHIgKyAoZC53aWR0aCB8fCAwKSwgMCk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBub2RlLnNpemUgfHwgKGNoaWxkcmVuRGltZW5zaW9ucy5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiBNYXRoLm1heCguLi5jaGlsZHJlbkRpbWVuc2lvbnMubWFwKGQgPT4gZC5oZWlnaHQgfHwgMCkpKTtcblx0XHRcdHJldHVybiB7IHdpZHRoLCBoZWlnaHQgfTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3Qgd2lkdGggPSBvcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwgPyBub2RlLnNpemUgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gb3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gdW5kZWZpbmVkIDogbm9kZS5zaXplO1xuXHRcdHJldHVybiB7IHdpZHRoLCBoZWlnaHQgfTtcblx0fVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgSlNPTiBvYmplY3QgZnJvbSBhIHtAbGluayBHcmlkRGVzY3JpcHRvcn0sIHdoaWNoIGNhblxuICogYmUgZGVzZXJpYWxpemVkIGJ5IHtAbGluayBTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlcmlhbGl6ZWRHcmlkPFQ+KGdyaWREZXNjcmlwdG9yOiBHcmlkRGVzY3JpcHRvcjxUPik6IElTZXJpYWxpemVkR3JpZCB7XG5cdHNhbml0aXplR3JpZE5vZGVEZXNjcmlwdG9yKGdyaWREZXNjcmlwdG9yLCB0cnVlKTtcblxuXHRjb25zdCByb290ID0gY3JlYXRlU2VyaWFsaXplZE5vZGUoZ3JpZERlc2NyaXB0b3IpO1xuXHRjb25zdCB7IHdpZHRoLCBoZWlnaHQgfSA9IGdldERpbWVuc2lvbnMocm9vdCwgZ3JpZERlc2NyaXB0b3Iub3JpZW50YXRpb24pO1xuXG5cdHJldHVybiB7XG5cdFx0cm9vdCxcblx0XHRvcmllbnRhdGlvbjogZ3JpZERlc2NyaXB0b3Iub3JpZW50YXRpb24sXG5cdFx0d2lkdGg6IHdpZHRoIHx8IDEsXG5cdFx0aGVpZ2h0OiBoZWlnaHQgfHwgMVxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBMEIsbUJBQW1CO0FBQzdDLFNBQVMsUUFBUSxZQUFZO0FBRTdCLFNBQVMsa0JBQWtCO0FBQzNCLE9BQU87QUFDUCxTQUFjLFVBQWdGLFlBQVksVUFBVSxzQkFBb0M7QUFJeEosU0FBUyxnQkFBZ0IsZUFBQUEsY0FBYSxjQUFBQyxtQkFBa0I7QUFFakQsSUFBVyxZQUFYLGtCQUFXQyxlQUFYO0FBQ04sRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUNBLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFKaUIsU0FBQUE7QUFBQSxHQUFBO0FBT2xCLFNBQVMsa0JBQWtCLFdBQWlDO0FBQzNELFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUs7QUFBYyxhQUFPO0FBQUEsSUFDMUIsS0FBSztBQUFnQixhQUFPO0FBQUEsSUFDNUIsS0FBSztBQUFnQixhQUFPO0FB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QUFTLG1CQUFtQixXQUFXLElBQUksU0FBWSxtQkFBbUIsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLEVBQUUsVUFBVSxJQUFJLENBQUM7QUFDdkgsYUFBTyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3hCLE9BQU87QUFDTixZQUFNLFFBQVEsbUJBQW1CLFdBQVcsSUFBSSxTQUFZLG1CQUFtQixPQUFPLENBQUMsR0FBRyxNQUFNLEtBQUssRUFBRSxTQUFTLElBQUksQ0FBQztBQUNySCxZQUFNLFNBQVMsS0FBSyxTQUFTLG1CQUFtQixXQUFXLElBQUksU0FBWSxLQUFLLElBQUksR0FBRyxtQkFBbUIsSUFBSSxPQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7QUFDakksYUFBTyxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3hCO0FBQUEsRUFDRCxPQUFPO0FBQ04sVUFBTSxRQUFRLGdCQUFnQixZQUFZLFdBQVcsS0FBSyxPQUFPO0FBQ2pFLFVBQU0sU0FBUyxnQkFBZ0IsWUFBWSxXQUFXLFNBQVksS0FBSztBQUN2RSxXQUFPLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDeEI7QUFDRDtBQU1PLFNBQVMscUJBQXdCLGdCQUFvRDtBQUMzRiw2QkFBMkIsZ0JBQWdCLElBQUk7QUFFL0MsUUFBTSxPQUFPLHFCQUFxQixjQUFjO0FBQ2hELFFBQU0sRUFBRSxPQUFPLE9BQU8sSUFBSSxjQUFjLE1BQU0sZUFBZSxXQUFXO0FBRXhFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxhQUFhLGVBQWU7QUFBQSxJQUM1QixPQUFPLFNBQVM7QUFBQSxJQUNoQixRQUFRLFVBQVU7QUFBQSxFQUNuQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJPcmllbnRhdGlvbiIsICJvcnRob2dvbmFsIiwgIkRpcmVjdGlvbiIsICJib3hOb2RlIiwgImRpcmVjdGlvbiIsICJib3VuZGFyeSIsICJTaXppbmciLCAibm9kZSIsICJsb2NhdGlvbiJdCn0K
