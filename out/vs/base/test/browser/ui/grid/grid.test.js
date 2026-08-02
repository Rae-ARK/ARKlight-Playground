import assert from "assert";
import { createSerializedGrid, Direction, getRelativeLocation, Grid, isGridBranchNode, Orientation, sanitizeGridNodeDescriptor, SerializableGrid, Sizing } from "../../../../browser/ui/grid/grid.js";
import { Event } from "../../../../common/event.js";
import { deepClone } from "../../../../common/objects.js";
import { nodesToArrays, TestView } from "./util.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("Grid", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(function() {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = `${800}px`;
    container.style.height = `${600}px`;
  });
  test("getRelativeLocation", () => {
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Up), [0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Down), [1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Left), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Right), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Up), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Down), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Left), [0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Right), [1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Up), [4]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Down), [5]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Left), [4, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Right), [4, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Up), [0, 0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Down), [0, 0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Left), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Right), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Up), [1, 2, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Down), [1, 2, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Left), [1, 2]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Right), [1, 3]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Up), [1, 2, 3]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Down), [1, 2, 4]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Left), [1, 2, 3, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Right), [1, 2, 3, 1]);
  });
  test("empty", () => {
    const view1 = store.add(new TestView(100, Number.MAX_VALUE, 100, Number.MAX_VALUE));
    const gridview = store.add(new Grid(view1));
    container.appendChild(gridview.element);
    gridview.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
  });
  test("two views vertically", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    assert.deepStrictEqual(view1.size, [800, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
  });
  test("two views horizontally", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 300, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [500, 600]);
    assert.deepStrictEqual(view2.size, [300, 600]);
  });
  test("simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    assert.deepStrictEqual(view1.size, [800, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
  });
  test("another simple layout with automatic size distribution", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Left);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 600]);
    assert.deepStrictEqual(view3.size, [268, 600]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Down);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 600]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Distribute, view3, Direction.Up);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 300]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    assert.deepStrictEqual(view5.size, [268, 300]);
    const view6 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view6, Sizing.Distribute, view3, Direction.Down);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 200]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    assert.deepStrictEqual(view5.size, [268, 200]);
    assert.deepStrictEqual(view6.size, [268, 200]);
  });
  test("another simple layout with split size distribution", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Left);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    assert.deepStrictEqual(view3.size, [200, 600]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view2, Direction.Down);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 600]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Split, view3, Direction.Up);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
    const view6 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view6, Sizing.Split, view3, Direction.Down);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 150]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
    assert.deepStrictEqual(view6.size, [200, 150]);
  });
  test("3/2 layout with split", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [800, 300]);
    assert.deepStrictEqual(view2.size, [800, 300]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Right);
    assert.deepStrictEqual(view1.size, [800, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [400, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [200, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
  });
  test("sizing should be correct after branch demotion #50564", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view2, Direction.Right);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [200, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [200, 300]);
    grid.removeView(view3);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [200, 600]);
    assert.deepStrictEqual(view4.size, [200, 600]);
  });
  test("sizing should be correct after branch demotion #50675", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view3, Direction.Right);
    assert.deepStrictEqual(view1.size, [800, 200]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [400, 200]);
    assert.deepStrictEqual(view4.size, [400, 200]);
    grid.removeView(view3, Sizing.Distribute);
    assert.deepStrictEqual(view1.size, [800, 200]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view4.size, [800, 200]);
  });
  test("getNeighborViews should work on single view layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left, true), [view1]);
  });
  test("getNeighborViews should work on simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left, true), [view3]);
  });
  test("getNeighborViews should work on a complex layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Distribute, view4, Direction.Down);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), [view2, view4]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right), [view4, view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Down), [view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Left), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Up), [view4]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Left), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up), [view2, view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left), []);
  });
  test("getNeighborViews should work on another simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Left), [view2]);
  });
  test("getNeighborViews should only return immediate neighbors", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), [view2, view3]);
  });
  test("hiding splitviews and restoring sizes", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    const size1 = view1.size;
    const size2 = view2.size;
    const size3 = view3.size;
    const size4 = view4.size;
    grid.maximizeView(view1);
    assert.deepStrictEqual(view1.size, [800, 600]);
    assert.deepStrictEqual(view2.size, [0, 0]);
    assert.deepStrictEqual(view3.size, [0, 0]);
    assert.deepStrictEqual(view4.size, [0, 0]);
    grid.exitMaximizedView();
    assert.deepStrictEqual(view1.size, size1);
    assert.deepStrictEqual(view2.size, size2);
    assert.deepStrictEqual(view3.size, size3);
    assert.deepStrictEqual(view4.size, size4);
    grid.maximizeView(view2);
    assert.deepStrictEqual(view1.size, [0, 600]);
    assert.deepStrictEqual(view2.size, [800, 600]);
    assert.deepStrictEqual(view3.size, [800, 0]);
    assert.deepStrictEqual(view4.size, [0, 600]);
    grid.exitMaximizedView();
    assert.deepStrictEqual(view1.size, size1);
    assert.deepStrictEqual(view2.size, size2);
    assert.deepStrictEqual(view3.size, size3);
    assert.deepStrictEqual(view4.size, size4);
  });
  test("hasMaximizedView", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    function checkIsMaximized(view) {
      grid.maximizeView(view);
      assert.deepStrictEqual(grid.hasMaximizedView(), true);
      assert.deepStrictEqual(grid.isViewExpanded(view1), false);
      assert.deepStrictEqual(grid.isViewExpanded(view2), false);
      assert.deepStrictEqual(grid.isViewExpanded(view3), false);
      assert.deepStrictEqual(grid.isViewExpanded(view4), false);
      grid.exitMaximizedView();
      assert.deepStrictEqual(grid.hasMaximizedView(), false);
    }
    checkIsMaximized(view1);
    checkIsMaximized(view2);
    checkIsMaximized(view3);
    checkIsMaximized(view4);
  });
  test("Changes to the grid unmaximize the view", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.removeView(view4);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.setViewVisible(view3, true);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
  });
  test("Changes to the grid sizing unmaximize the view", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.maximizeView(view2);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    assert.deepStrictEqual(grid.isViewVisible(view1), false);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), false);
    assert.deepStrictEqual(grid.isViewVisible(view4), false);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.distributeViewSizes();
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.expandView(view2);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.expandView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
  });
});
class TestSerializableView extends TestView {
  constructor(name, minimumWidth, maximumWidth, minimumHeight, maximumHeight) {
    super(minimumWidth, maximumWidth, minimumHeight, maximumHeight);
    this.name = name;
  }
  toJSON() {
    return { name: this.name };
  }
}
class TestViewDeserializer {
  constructor(store) {
    this.store = store;
    this.views = /* @__PURE__ */ new Map();
  }
  fromJSON(json) {
    const view = this.store.add(new TestSerializableView(json.name, 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    this.views.set(json.name, view);
    return view;
  }
  getView(id) {
    const view = this.views.get(id);
    if (!view) {
      throw new Error("Unknown view");
    }
    return view;
  }
}
function nodesToNames(node) {
  if (isGridBranchNode(node)) {
    return node.children.map(nodesToNames);
  } else {
    return node.view.name;
  }
}
suite("SerializableGrid", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(function() {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = `${800}px`;
    container.style.height = `${600}px`;
  });
  test("serialize empty", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const actual = grid.serialize();
    assert.deepStrictEqual(actual, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            data: {
              name: "view1"
            },
            size: 600
          }
        ],
        size: 800
      }
    });
  });
  test("serialize simple layout", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(grid.serialize(), {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200 },
              { type: "leaf", data: { name: "view2" }, size: 600 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 300 },
                  { type: "leaf", data: { name: "view5" }, size: 100 }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
  });
  test("deserialize empty", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    grid2.layout(800, 600);
    assert.deepStrictEqual(nodesToNames(grid2.getViews()), ["view1"]);
  });
  test("deserialize simple layout", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
  });
  test("deserialize simple layout with scaling", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    grid2.layout(400, 800);
    assert.deepStrictEqual(view1Copy.size, [300, 400]);
    assert.deepStrictEqual(view2Copy.size, [300, 267]);
    assert.deepStrictEqual(view3Copy.size, [100, 533]);
    assert.deepStrictEqual(view4Copy.size, [100, 267]);
    assert.deepStrictEqual(view5Copy.size, [300, 133]);
  });
  test("deserialize 4 view layout (ben issue #2)", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Down);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view3, Direction.Right);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [800, 300]);
    assert.deepStrictEqual(view2Copy.size, [800, 150]);
    assert.deepStrictEqual(view3Copy.size, [400, 150]);
    assert.deepStrictEqual(view4Copy.size, [400, 150]);
  });
  test("deserialize 2 view layout (ben issue #3)", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [400, 600]);
    assert.deepStrictEqual(view2Copy.size, [400, 600]);
  });
  test("deserialize simple view layout #50609", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    grid.removeView(view1, Sizing.Split);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view2Copy.size, [800, 300]);
    assert.deepStrictEqual(view3Copy.size, [800, 300]);
  });
  test("sanitizeGridNodeDescriptor", () => {
    const nodeDescriptor = { groups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, groups: [{}, {}] }] };
    const nodeDescriptorCopy = deepClone(nodeDescriptor);
    sanitizeGridNodeDescriptor(nodeDescriptorCopy, true);
    assert.deepStrictEqual(nodeDescriptorCopy, { groups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, groups: [{ size: 0.5 }, { size: 0.5 }] }] });
  });
  test("createSerializedGrid", () => {
    const gridDescriptor = { orientation: Orientation.VERTICAL, groups: [{ size: 0.2, data: "a" }, { size: 0.2, data: "b" }, { size: 0.6, groups: [{ data: "c" }, { data: "d" }] }] };
    const serializedGrid = createSerializedGrid(gridDescriptor);
    assert.deepStrictEqual(serializedGrid, {
      root: {
        type: "branch",
        size: void 0,
        data: [
          { type: "leaf", size: 0.2, data: "a" },
          { type: "leaf", size: 0.2, data: "b" },
          {
            type: "branch",
            size: 0.6,
            data: [
              { type: "leaf", size: 0.5, data: "c" },
              { type: "leaf", size: 0.5, data: "d" }
            ]
          }
        ]
      },
      orientation: Orientation.VERTICAL,
      width: 1,
      height: 1
    });
  });
  test("createSerializedGrid - issue #85601, should not allow single children groups", () => {
    const serializedGrid = createSerializedGrid({ orientation: Orientation.HORIZONTAL, groups: [{ groups: [{}, {}], size: 0.5 }, { groups: [{}], size: 0.5 }] });
    const views = [];
    const deserializer = new class {
      fromJSON() {
        const view = {
          element: document.createElement("div"),
          layout: () => null,
          minimumWidth: 0,
          maximumWidth: Number.POSITIVE_INFINITY,
          minimumHeight: 0,
          maximumHeight: Number.POSITIVE_INFINITY,
          onDidChange: Event.None,
          toJSON: () => ({})
        };
        views.push(view);
        return view;
      }
    }();
    const grid = store.add(SerializableGrid.deserialize(serializedGrid, deserializer));
    assert.strictEqual(views.length, 3);
    grid.removeView(views[2]);
  });
  test("from", () => {
    const createView = () => ({
      element: document.createElement("div"),
      layout: () => null,
      minimumWidth: 0,
      maximumWidth: Number.POSITIVE_INFINITY,
      minimumHeight: 0,
      maximumHeight: Number.POSITIVE_INFINITY,
      onDidChange: Event.None,
      toJSON: () => ({})
    });
    const a = createView();
    const b = createView();
    const c = createView();
    const d = createView();
    const gridDescriptor = { orientation: Orientation.VERTICAL, groups: [{ size: 0.2, data: a }, { size: 0.2, data: b }, { size: 0.6, groups: [{ data: c }, { data: d }] }] };
    const grid = SerializableGrid.from(gridDescriptor);
    assert.deepStrictEqual(nodesToArrays(grid.getViews()), [a, b, [c, d]]);
    grid.dispose();
  });
  test("serialize should store visibility and previous size", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view5, false);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 0]);
    grid.setViewVisible(view5, true);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view5, false);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 0]);
    grid.setViewVisible(view5, false);
    const json = grid.serialize();
    assert.deepStrictEqual(json, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200 },
              { type: "leaf", data: { name: "view2" }, size: 600 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 400 },
                  { type: "leaf", data: { name: "view5" }, size: 100, visible: false }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 400]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 0]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), false);
    grid2.setViewVisible(view5Copy, true);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
  });
  test("serialize should store visibility and previous size even for first leaf", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view4, false);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [0, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    const json = grid.serialize();
    assert.deepStrictEqual(json, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200, visible: false },
              { type: "leaf", data: { name: "view2" }, size: 800 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 300 },
                  { type: "leaf", data: { name: "view5" }, size: 100 }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [800, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [0, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), false);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
    grid2.setViewVisible(view4Copy, true);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL3VpL2dyaWQvZ3JpZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY3JlYXRlU2VyaWFsaXplZEdyaWQsIERpcmVjdGlvbiwgZ2V0UmVsYXRpdmVMb2NhdGlvbiwgR3JpZCwgR3JpZE5vZGUsIEdyaWROb2RlRGVzY3JpcHRvciwgSVNlcmlhbGl6YWJsZVZpZXcsIGlzR3JpZEJyYW5jaE5vZGUsIElWaWV3RGVzZXJpYWxpemVyLCBPcmllbnRhdGlvbiwgc2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3IsIFNlcmlhbGl6YWJsZUdyaWQsIFNpemluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IG5vZGVzVG9BcnJheXMsIFRlc3RWaWV3IH0gZnJvbSAnLi91dGlsLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuLy8gU2ltcGxlIGV4YW1wbGU6XG4vL1xuLy8gICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG4vLyAgfCAgNCAgfCAgICAgIDIgICAgICAgIHxcbi8vICArLS0tLS0rLS0tLS0tLS0tKy0tLS0tK1xuLy8gIHwgICAgICAgIDEgICAgICB8ICAgICB8XG4vLyAgKy0tLS0tLS0tLS0tLS0tLSsgIDMgIHxcbi8vICB8ICAgICAgICA1ICAgICAgfCAgICAgfFxuLy8gICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG4vL1xuLy8gIFZcbi8vICArLUhcbi8vICB8ICstNFxuLy8gIHwgKy0yXG4vLyAgKy1IXG4vLyAgICArLVZcbi8vICAgIHwgKy0xXG4vLyAgICB8ICstNVxuLy8gICAgKy0zXG5cbnN1aXRlKCdHcmlkJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAkezgwMH1weGA7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAkezYwMH1weGA7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlbGF0aXZlTG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMF0sIERpcmVjdGlvbi5VcCksIFswXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMF0sIERpcmVjdGlvbi5Eb3duKSwgWzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswXSwgRGlyZWN0aW9uLkxlZnQpLCBbMCwgMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzBdLCBEaXJlY3Rpb24uUmlnaHQpLCBbMCwgMV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLkhPUklaT05UQUwsIFswXSwgRGlyZWN0aW9uLlVwKSwgWzAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uSE9SSVpPTlRBTCwgWzBdLCBEaXJlY3Rpb24uRG93biksIFswLCAxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLkhPUklaT05UQUwsIFswXSwgRGlyZWN0aW9uLkxlZnQpLCBbMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5IT1JJWk9OVEFMLCBbMF0sIERpcmVjdGlvbi5SaWdodCksIFsxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFs0XSwgRGlyZWN0aW9uLlVwKSwgWzRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFs0XSwgRGlyZWN0aW9uLkRvd24pLCBbNV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzRdLCBEaXJlY3Rpb24uTGVmdCksIFs0LCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbNF0sIERpcmVjdGlvbi5SaWdodCksIFs0LCAxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswLCAwXSwgRGlyZWN0aW9uLlVwKSwgWzAsIDAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswLCAwXSwgRGlyZWN0aW9uLkRvd24pLCBbMCwgMCwgMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzAsIDBdLCBEaXJlY3Rpb24uTGVmdCksIFswLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMCwgMF0sIERpcmVjdGlvbi5SaWdodCksIFswLCAxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyXSwgRGlyZWN0aW9uLlVwKSwgWzEsIDIsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyXSwgRGlyZWN0aW9uLkRvd24pLCBbMSwgMiwgMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzEsIDJdLCBEaXJlY3Rpb24uTGVmdCksIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMSwgMl0sIERpcmVjdGlvbi5SaWdodCksIFsxLCAzXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyLCAzXSwgRGlyZWN0aW9uLlVwKSwgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyLCAzXSwgRGlyZWN0aW9uLkRvd24pLCBbMSwgMiwgNF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzEsIDIsIDNdLCBEaXJlY3Rpb24uTGVmdCksIFsxLCAyLCAzLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMSwgMiwgM10sIERpcmVjdGlvbi5SaWdodCksIFsxLCAyLCAzLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygxMDAsIE51bWJlci5NQVhfVkFMVUUsIDEwMCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWR2aWV3ID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWR2aWV3LmVsZW1lbnQpO1xuXHRcdGdyaWR2aWV3LmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gdmlld3MgdmVydGljYWxseScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byB2aWV3cyBob3Jpem9udGFsbHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMzAwLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs1MDAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzMwMCwgNjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzYwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbODAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDQwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgMjAwLCB2aWV3MiwgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzYwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbm90aGVyIHNpbXBsZSBsYXlvdXQgd2l0aCBhdXRvbWF0aWMgc2l6ZSBkaXN0cmlidXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uTGVmdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNDAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzI2NiwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjY2LCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyNjgsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjY2LCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzI2OCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjY2LCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MywgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFsyNjYsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzI2NiwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjY4LCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzI2OCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc2LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzMsIERpcmVjdGlvbi5Eb3duKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFsyNjYsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzI2NiwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjY4LCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzI2OCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Ni5zaXplLCBbMjY4LCAyMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnYW5vdGhlciBzaW1wbGUgbGF5b3V0IHdpdGggc3BsaXQgc2l6ZSBkaXN0cmlidXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCA2MDBdKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbNDAwLCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIFNpemluZy5TcGxpdCwgdmlldzMsIERpcmVjdGlvbi5VcCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFsyMDAsIDMwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzYgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NiwgU2l6aW5nLlNwbGl0LCB2aWV3MywgRGlyZWN0aW9uLkRvd24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDE1MF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NS5zaXplLCBbMjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc2LnNpemUsIFsyMDAsIDE1MF0pO1xuXHR9KTtcblxuXHR0ZXN0KCczLzIgbGF5b3V0IHdpdGggc3BsaXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzgwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbODAwLCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5TcGxpdCwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbODAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NS5zaXplLCBbMjAwLCAzMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnc2l6aW5nIHNob3VsZCBiZSBjb3JyZWN0IGFmdGVyIGJyYW5jaCBkZW1vdGlvbiAjNTA1NjQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cblx0XHRncmlkLnJlbW92ZVZpZXcodmlldzMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDYwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaXppbmcgc2hvdWxkIGJlIGNvcnJlY3QgYWZ0ZXIgYnJhbmNoIGRlbW90aW9uICM1MDY3NScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MywgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbNDAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFs0MDAsIDIwMF0pO1xuXG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbODAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs4MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5laWdoYm9yVmlld3Mgc2hvdWxkIHdvcmsgb24gc2luZ2xlIHZpZXcgbGF5b3V0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlVwKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5Eb3duKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXAsIHRydWUpLCBbdmlldzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0LCB0cnVlKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5Eb3duLCB0cnVlKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5MZWZ0LCB0cnVlKSwgW3ZpZXcxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5laWdoYm9yVmlld3Mgc2hvdWxkIHdvcmsgb24gc2ltcGxlIGxheW91dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXApLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkxlZnQpLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlVwLCB0cnVlKSwgW3ZpZXczXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uRG93biwgdHJ1ZSksIFt2aWV3Ml0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uTGVmdCwgdHJ1ZSksIFt2aWV3MV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5VcCksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5Eb3duKSwgW3ZpZXczXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5MZWZ0KSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5VcCwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQsIHRydWUpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLkRvd24sIHRydWUpLCBbdmlldzNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLkxlZnQsIHRydWUpLCBbdmlldzJdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uVXApLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlJpZ2h0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uRG93biksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLkxlZnQpLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlVwLCB0cnVlKSwgW3ZpZXcyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzMsIERpcmVjdGlvbi5SaWdodCwgdHJ1ZSksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uRG93biwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uTGVmdCwgdHJ1ZSksIFt2aWV3M10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZWlnaGJvclZpZXdzIHNob3VsZCB3b3JrIG9uIGEgY29tcGxleCBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzQsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXApLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzIsIHZpZXc0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5MZWZ0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uVXApLCBbdmlldzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KSwgW3ZpZXc0LCB2aWV3NV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uRG93biksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLlVwKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzQsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzVdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLkxlZnQpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLlVwKSwgW3ZpZXc0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzUsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLkxlZnQpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlVwKSwgW3ZpZXcyLCB2aWV3NV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzMsIERpcmVjdGlvbi5Eb3duKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TmVpZ2hib3JWaWV3cyBzaG91bGQgd29yayBvbiBhbm90aGVyIHNpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzQsIERpcmVjdGlvbi5VcCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLlJpZ2h0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXc0LCBEaXJlY3Rpb24uRG93biksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXc0LCBEaXJlY3Rpb24uTGVmdCksIFt2aWV3Ml0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZWlnaGJvclZpZXdzIHNob3VsZCBvbmx5IHJldHVybiBpbW1lZGlhdGUgbmVpZ2hib3JzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpLCBbdmlldzIsIHZpZXczXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGluZyBzcGxpdHZpZXdzIGFuZCByZXN0b3Jpbmcgc2l6ZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3Qgc2l6ZTEgPSB2aWV3MS5zaXplO1xuXHRcdGNvbnN0IHNpemUyID0gdmlldzIuc2l6ZTtcblx0XHRjb25zdCBzaXplMyA9IHZpZXczLnNpemU7XG5cdFx0Y29uc3Qgc2l6ZTQgPSB2aWV3NC5zaXplO1xuXG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXG5cdFx0Ly8gVmlld3MgMiwgMywgNCBhcmUgaGlkZGVuXG5cdFx0Ly8gU3BsaXR2aWV3ICgyLDQpIGFuZCAoKDIsNCksMykgYXJlIGhpZGRlblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzgwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMCwgMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFswLCAwXSk7XG5cblx0XHRncmlkLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIHNpemUxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIHNpemUyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIHNpemUzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIHNpemU0KTtcblxuXHRcdC8vIFZpZXdzIDEsIDMsIDQgYXJlIGhpZGRlblxuXHRcdC8vIEFsbCBzcGxpdHZpZXdzIGFyZSBzdGlsbCB2aXNpYmxlID0+IG9ubHkgb3J0aG9nb25hbHNpemUgaXMgMFxuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbODAwLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMCwgNjAwXSk7XG5cblx0XHRncmlkLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIHNpemUxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIHNpemUyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIHNpemUzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIHNpemU0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFzTWF4aW1pemVkVmlldycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRmdW5jdGlvbiBjaGVja0lzTWF4aW1pemVkKHZpZXc6IFRlc3RWaWV3KSB7XG5cdFx0XHRncmlkLm1heGltaXplVmlldyh2aWV3KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFdoZW4gYSB2aWV3IGlzIG1heGltaXplZCwgbm8gdmlldyBjYW4gYmUgZXhwYW5kZWQgZXZlbiBpZiBpdCBpcyBtYXhpbWl6ZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3NCksIGZhbHNlKTtcblxuXHRcdFx0Z3JpZC5leGl0TWF4aW1pemVkVmlldygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3MSk7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3Mik7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3Myk7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3NCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXMgdG8gdGhlIGdyaWQgdW5tYXhpbWl6ZSB0aGUgdmlldycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cblx0XHQvLyBBZGRpbmcgYSB2aWV3IHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBSZW1vdmluZyBhIHZpZXcgdW5tYXhpbWl6ZXMgdGhlIHZpZXdcblx0XHRncmlkLm1heGltaXplVmlldyh2aWV3MSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgdHJ1ZSk7XG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXc0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzMpLCB0cnVlKTtcblxuXHRcdC8vIENoYW5naW5nIHRoZSB2aXNpYmlsaXR5IG9mIGFueSB2aWV3IHdoaWxlIGEgdmlldyBpcyBtYXhpbWl6ZWQsIHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuc2V0Vmlld1Zpc2libGUodmlldzMsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzIHRvIHRoZSBncmlkIHNpemluZyB1bm1heGltaXplIHRoZSB2aWV3JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdC8vIE1heGltaXppbmcgYSBkaWZmZXJlbnQgdmlldyB1bm1heGltaXplcyB0aGUgY3VycmVudCBvbmUgYW5kIG1heGltaXplcyB0aGUgbmV3IG9uZVxuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRncmlkLm1heGltaXplVmlldyh2aWV3Mik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MiksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXczKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgZmFsc2UpO1xuXG5cdFx0Ly8gRGlzdHJpYnV0aW5nIHRoZSBzaXplIHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBFeHBhbmRpbmcgYSBkaWZmZXJlbnQgdmlldyB1bm1heGltaXplcyB0aGUgdmlld1xuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRncmlkLmV4cGFuZFZpZXcodmlldzIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBFeHBhbmRpbmcgdGhlIG1heGltaXplZCB2aWV3IHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuZXhwYW5kVmlldyh2aWV3MSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzEpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MiksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXczKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzQpLCB0cnVlKTtcblx0fSk7XG59KTtcblxuY2xhc3MgVGVzdFNlcmlhbGl6YWJsZVZpZXcgZXh0ZW5kcyBUZXN0VmlldyBpbXBsZW1lbnRzIElTZXJpYWxpemFibGVWaWV3IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0bWluaW11bVdpZHRoOiBudW1iZXIsXG5cdFx0bWF4aW11bVdpZHRoOiBudW1iZXIsXG5cdFx0bWluaW11bUhlaWdodDogbnVtYmVyLFxuXHRcdG1heGltdW1IZWlnaHQ6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcihtaW5pbXVtV2lkdGgsIG1heGltdW1XaWR0aCwgbWluaW11bUhlaWdodCwgbWF4aW11bUhlaWdodCk7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHsgbmFtZTogdGhpcy5uYW1lIH07XG5cdH1cbn1cblxuY2xhc3MgVGVzdFZpZXdEZXNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJVmlld0Rlc2VyaWFsaXplcjxUZXN0U2VyaWFsaXphYmxlVmlldz4ge1xuXG5cdHByaXZhdGUgdmlld3MgPSBuZXcgTWFwPHN0cmluZywgVGVzdFNlcmlhbGl6YWJsZVZpZXc+KCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPikgeyB9XG5cblx0ZnJvbUpTT04oanNvbjogYW55KTogVGVzdFNlcmlhbGl6YWJsZVZpZXcge1xuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLnN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoanNvbi5uYW1lLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHR0aGlzLnZpZXdzLnNldChqc29uLm5hbWUsIHZpZXcpO1xuXHRcdHJldHVybiB2aWV3O1xuXHR9XG5cblx0Z2V0VmlldyhpZDogc3RyaW5nKTogVGVzdFNlcmlhbGl6YWJsZVZpZXcge1xuXHRcdGNvbnN0IHZpZXcgPSB0aGlzLnZpZXdzLmdldChpZCk7XG5cdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gdmlldycpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmlldztcblx0fVxufVxuXG5mdW5jdGlvbiBub2Rlc1RvTmFtZXMobm9kZTogR3JpZE5vZGU8VGVzdFNlcmlhbGl6YWJsZVZpZXc+KTogYW55IHtcblx0aWYgKGlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHRyZXR1cm4gbm9kZS5jaGlsZHJlbi5tYXAobm9kZXNUb05hbWVzKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbm9kZS52aWV3Lm5hbWU7XG5cdH1cbn1cblxuc3VpdGUoJ1NlcmlhbGl6YWJsZUdyaWQnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7ODAwfXB4YDtcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7NjAwfXB4YDtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplIGVtcHR5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gZ3JpZC5zZXJpYWxpemUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0b3JpZW50YXRpb246IDAsXG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2xlYWYnLFxuXHRcdFx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAndmlldzEnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHNpemU6IDYwMFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0c2l6ZTogODAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZSBzaW1wbGUgbGF5b3V0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzMnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc0JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCAyMDAsIHZpZXcyLCBEaXJlY3Rpb24uTGVmdCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc1JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuc2VyaWFsaXplKCksIHtcblx0XHRcdG9yaWVudGF0aW9uOiAwLFxuXHRcdFx0d2lkdGg6IDgwMCxcblx0XHRcdGhlaWdodDogNjAwLFxuXHRcdFx0cm9vdDoge1xuXHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzQnIH0sIHNpemU6IDIwMCB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzInIH0sIHNpemU6IDYwMCB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c2l6ZTogMjAwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3MScgfSwgc2l6ZTogMzAwIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzUnIH0sIHNpemU6IDEwMCB9XG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRzaXplOiA2MDBcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXczJyB9LCBzaXplOiAyMDAgfVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHNpemU6IDQwMFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0c2l6ZTogODAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIGVtcHR5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0Z3JpZC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBkZXNlcmlhbGl6ZXIgPSBuZXcgVGVzdFZpZXdEZXNlcmlhbGl6ZXIoc3RvcmUpO1xuXHRcdGNvbnN0IGdyaWQyID0gc3RvcmUuYWRkKFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoanNvbiwgZGVzZXJpYWxpemVyKSk7XG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9kZXNUb05hbWVzKGdyaWQyLmdldFZpZXdzKCkpLCBbJ3ZpZXcxJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6ZSBzaW1wbGUgbGF5b3V0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcyJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uVXApO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MycsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzQnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIDIwMCwgdmlldzIsIERpcmVjdGlvbi5MZWZ0KTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzUnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIDEwMCwgdmlldzEsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cdFx0Y29uc3QgdmlldzNDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXczJyk7XG5cdFx0Y29uc3QgdmlldzRDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc0Jyk7XG5cdFx0Y29uc3QgdmlldzVDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc1Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vZGVzVG9BcnJheXMoZ3JpZDIuZ2V0Vmlld3MoKSksIFtbdmlldzRDb3B5LCB2aWV3MkNvcHldLCBbW3ZpZXcxQ29weSwgdmlldzVDb3B5XSwgdmlldzNDb3B5XV0pO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzFDb3B5LnNpemUsIFs2MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzJDb3B5LnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzNDb3B5LnNpemUsIFsyMDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzRDb3B5LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzVDb3B5LnNpemUsIFs2MDAsIDEwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6ZSBzaW1wbGUgbGF5b3V0IHdpdGggc2NhbGluZycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcxJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgU2VyaWFsaXphYmxlR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzMnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc0JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCAyMDAsIHZpZXcyLCBEaXJlY3Rpb24uTGVmdCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc1JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCBqc29uID0gZ3JpZC5zZXJpYWxpemUoKTtcblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IHZpZXcxQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MScpO1xuXHRcdGNvbnN0IHZpZXcyQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MicpO1xuXHRcdGNvbnN0IHZpZXczQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MycpO1xuXHRcdGNvbnN0IHZpZXc0Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NCcpO1xuXHRcdGNvbnN0IHZpZXc1Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NScpO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDQwMCwgODAwKTsgLy8gWy8yLCAqNC8zXVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzFDb3B5LnNpemUsIFszMDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzJDb3B5LnNpemUsIFszMDAsIDI2N10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzNDb3B5LnNpemUsIFsxMDAsIDUzM10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzRDb3B5LnNpemUsIFsxMDAsIDI2N10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzVDb3B5LnNpemUsIFszMDAsIDEzM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6ZSA0IHZpZXcgbGF5b3V0IChiZW4gaXNzdWUgIzIpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MycsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLlNwbGl0LCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NCcsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLlNwbGl0LCB2aWV3MywgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cdFx0Y29uc3QgdmlldzNDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXczJyk7XG5cdFx0Y29uc3QgdmlldzRDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc0Jyk7XG5cblx0XHRncmlkMi5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzgwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzgwMCwgMTUwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzQwMCwgMTUwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzQwMCwgMTUwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIDIgdmlldyBsYXlvdXQgKGJlbiBpc3N1ZSAjMyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzInLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCBqc29uID0gZ3JpZC5zZXJpYWxpemUoKTtcblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IHZpZXcxQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MScpO1xuXHRcdGNvbnN0IHZpZXcyQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MicpO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzFDb3B5LnNpemUsIFs0MDAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzJDb3B5LnNpemUsIFs0MDAsIDYwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXNlcmlhbGl6ZSBzaW1wbGUgdmlldyBsYXlvdXQgIzUwNjA5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcyJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MycsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLlNwbGl0LCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXcxLCBTaXppbmcuU3BsaXQpO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0Z3JpZC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBkZXNlcmlhbGl6ZXIgPSBuZXcgVGVzdFZpZXdEZXNlcmlhbGl6ZXIoc3RvcmUpO1xuXHRcdGNvbnN0IGdyaWQyID0gc3RvcmUuYWRkKFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoanNvbiwgZGVzZXJpYWxpemVyKSk7XG5cblx0XHRjb25zdCB2aWV3MkNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzInKTtcblx0XHRjb25zdCB2aWV3M0NvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzMnKTtcblxuXHRcdGdyaWQyLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbODAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbODAwLCAzMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnc2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm9kZURlc2NyaXB0b3I6IEdyaWROb2RlRGVzY3JpcHRvcjxhbnk+ID0geyBncm91cHM6IFt7IHNpemU6IDAuMiB9LCB7IHNpemU6IDAuMiB9LCB7IHNpemU6IDAuNiwgZ3JvdXBzOiBbe30sIHt9XSB9XSB9O1xuXHRcdGNvbnN0IG5vZGVEZXNjcmlwdG9yQ29weSA9IGRlZXBDbG9uZShub2RlRGVzY3JpcHRvcik7XG5cdFx0c2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3Iobm9kZURlc2NyaXB0b3JDb3B5LCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vZGVEZXNjcmlwdG9yQ29weSwgeyBncm91cHM6IFt7IHNpemU6IDAuMiB9LCB7IHNpemU6IDAuMiB9LCB7IHNpemU6IDAuNiwgZ3JvdXBzOiBbeyBzaXplOiAwLjUgfSwgeyBzaXplOiAwLjUgfV0gfV0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVNlcmlhbGl6ZWRHcmlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGdyaWREZXNjcmlwdG9yID0geyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUwsIGdyb3VwczogW3sgc2l6ZTogMC4yLCBkYXRhOiAnYScgfSwgeyBzaXplOiAwLjIsIGRhdGE6ICdiJyB9LCB7IHNpemU6IDAuNiwgZ3JvdXBzOiBbeyBkYXRhOiAnYycgfSwgeyBkYXRhOiAnZCcgfV0gfV0gfTtcblx0XHRjb25zdCBzZXJpYWxpemVkR3JpZCA9IGNyZWF0ZVNlcmlhbGl6ZWRHcmlkKGdyaWREZXNjcmlwdG9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcmlhbGl6ZWRHcmlkLCB7XG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRzaXplOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgc2l6ZTogMC4yLCBkYXRhOiAnYScgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgc2l6ZTogMC4yLCBkYXRhOiAnYicgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJywgc2l6ZTogMC42LCBkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBzaXplOiAwLjUsIGRhdGE6ICdjJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgc2l6ZTogMC41LCBkYXRhOiAnZCcgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdHdpZHRoOiAxLFxuXHRcdFx0aGVpZ2h0OiAxXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVNlcmlhbGl6ZWRHcmlkIC0gaXNzdWUgIzg1NjAxLCBzaG91bGQgbm90IGFsbG93IHNpbmdsZSBjaGlsZHJlbiBncm91cHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZEdyaWQgPSBjcmVhdGVTZXJpYWxpemVkR3JpZCh7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMLCBncm91cHM6IFt7IGdyb3VwczogW3t9LCB7fV0sIHNpemU6IDAuNSB9LCB7IGdyb3VwczogW3t9XSwgc2l6ZTogMC41IH1dIH0pO1xuXHRcdGNvbnN0IHZpZXdzOiBJU2VyaWFsaXphYmxlVmlld1tdID0gW107XG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVZpZXdEZXNlcmlhbGl6ZXI8SVNlcmlhbGl6YWJsZVZpZXc+IHtcblx0XHRcdGZyb21KU09OKCk6IElTZXJpYWxpemFibGVWaWV3IHtcblx0XHRcdFx0Y29uc3QgdmlldzogSVNlcmlhbGl6YWJsZVZpZXcgPSB7XG5cdFx0XHRcdFx0ZWxlbWVudDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0XHRcdFx0bGF5b3V0OiAoKSA9PiBudWxsLFxuXHRcdFx0XHRcdG1pbmltdW1XaWR0aDogMCxcblx0XHRcdFx0XHRtYXhpbXVtV2lkdGg6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdFx0XHRtaW5pbXVtSGVpZ2h0OiAwLFxuXHRcdFx0XHRcdG1heGltdW1IZWlnaHQ6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0XHR0b0pTT046ICgpID0+ICh7fSlcblx0XHRcdFx0fTtcblx0XHRcdFx0dmlld3MucHVzaCh2aWV3KTtcblx0XHRcdFx0cmV0dXJuIHZpZXc7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShzZXJpYWxpemVkR3JpZCwgZGVzZXJpYWxpemVyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdzLmxlbmd0aCwgMyk7XG5cblx0XHQvLyBzaG91bGQgbm90IHRocm93XG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXdzWzJdKTtcblx0fSk7XG5cblx0dGVzdCgnZnJvbScsICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVWaWV3ID0gKCk6IElTZXJpYWxpemFibGVWaWV3ID0+ICh7XG5cdFx0XHRlbGVtZW50OiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdGxheW91dDogKCkgPT4gbnVsbCxcblx0XHRcdG1pbmltdW1XaWR0aDogMCxcblx0XHRcdG1heGltdW1XaWR0aDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0bWluaW11bUhlaWdodDogMCxcblx0XHRcdG1heGltdW1IZWlnaHQ6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0dG9KU09OOiAoKSA9PiAoe30pXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhID0gY3JlYXRlVmlldygpO1xuXHRcdGNvbnN0IGIgPSBjcmVhdGVWaWV3KCk7XG5cdFx0Y29uc3QgYyA9IGNyZWF0ZVZpZXcoKTtcblx0XHRjb25zdCBkID0gY3JlYXRlVmlldygpO1xuXG5cdFx0Y29uc3QgZ3JpZERlc2NyaXB0b3IgPSB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgZ3JvdXBzOiBbeyBzaXplOiAwLjIsIGRhdGE6IGEgfSwgeyBzaXplOiAwLjIsIGRhdGE6IGIgfSwgeyBzaXplOiAwLjYsIGdyb3VwczogW3sgZGF0YTogYyB9LCB7IGRhdGE6IGQgfV0gfV0gfTtcblx0XHRjb25zdCBncmlkID0gU2VyaWFsaXphYmxlR3JpZC5mcm9tKGdyaWREZXNjcmlwdG9yKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9kZXNUb0FycmF5cyhncmlkLmdldFZpZXdzKCkpLCBbYSwgYiwgW2MsIGRdXSk7XG5cdFx0Z3JpZC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZSBzaG91bGQgc3RvcmUgdmlzaWJpbGl0eSBhbmQgcHJldmlvdXMgc2l6ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcxJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgU2VyaWFsaXphYmxlR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzInLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5VcCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXczJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NCcsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgMjAwLCB2aWV3MiwgRGlyZWN0aW9uLkxlZnQpO1xuXG5cdFx0Y29uc3QgdmlldzUgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NSwgMTAwLCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3NSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDBdKTtcblxuXHRcdGdyaWQuc2V0Vmlld1Zpc2libGUodmlldzUsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3NSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDBdKTtcblxuXHRcdGdyaWQuc2V0Vmlld1Zpc2libGUodmlldzUsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbiwge1xuXHRcdFx0b3JpZW50YXRpb246IDAsXG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NCcgfSwgc2l6ZTogMjAwIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3MicgfSwgc2l6ZTogNjAwIH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzaXplOiAyMDBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXcxJyB9LCBzaXplOiA0MDAgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NScgfSwgc2l6ZTogMTAwLCB2aXNpYmxlOiBmYWxzZSB9XG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRzaXplOiA2MDBcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXczJyB9LCBzaXplOiAyMDAgfVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHNpemU6IDQwMFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0c2l6ZTogODAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IHZpZXcxQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MScpO1xuXHRcdGNvbnN0IHZpZXcyQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MicpO1xuXHRcdGNvbnN0IHZpZXczQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MycpO1xuXHRcdGNvbnN0IHZpZXc0Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NCcpO1xuXHRcdGNvbnN0IHZpZXc1Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub2Rlc1RvQXJyYXlzKGdyaWQyLmdldFZpZXdzKCkpLCBbW3ZpZXc0Q29weSwgdmlldzJDb3B5XSwgW1t2aWV3MUNvcHksIHZpZXc1Q29weV0sIHZpZXczQ29weV1dKTtcblxuXHRcdGdyaWQyLmxheW91dCg4MDAsIDYwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzYwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzYwMCwgMF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcxQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3MkNvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzNDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXc0Q29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3NUNvcHkpLCBmYWxzZSk7XG5cblx0XHRncmlkMi5zZXRWaWV3VmlzaWJsZSh2aWV3NUNvcHksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzYwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzFDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcyQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3M0NvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzRDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXc1Q29weSksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemUgc2hvdWxkIHN0b3JlIHZpc2liaWxpdHkgYW5kIHByZXZpb3VzIHNpemUgZXZlbiBmb3IgZmlyc3QgbGVhZicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcxJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgU2VyaWFsaXphYmxlR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzInLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5VcCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXczJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NCcsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgMjAwLCB2aWV3MiwgRGlyZWN0aW9uLkxlZnQpO1xuXG5cdFx0Y29uc3QgdmlldzUgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NSwgMTAwLCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3NCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs4MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NS5zaXplLCBbNjAwLCAxMDBdKTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoanNvbiwge1xuXHRcdFx0b3JpZW50YXRpb246IDAsXG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NCcgfSwgc2l6ZTogMjAwLCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzInIH0sIHNpemU6IDgwMCB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c2l6ZTogMjAwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3MScgfSwgc2l6ZTogMzAwIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzUnIH0sIHNpemU6IDEwMCB9XG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRzaXplOiA2MDBcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXczJyB9LCBzaXplOiAyMDAgfVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHNpemU6IDQwMFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0c2l6ZTogODAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IHZpZXcxQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MScpO1xuXHRcdGNvbnN0IHZpZXcyQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MicpO1xuXHRcdGNvbnN0IHZpZXczQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MycpO1xuXHRcdGNvbnN0IHZpZXc0Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NCcpO1xuXHRcdGNvbnN0IHZpZXc1Q29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3NScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub2Rlc1RvQXJyYXlzKGdyaWQyLmdldFZpZXdzKCkpLCBbW3ZpZXc0Q29weSwgdmlldzJDb3B5XSwgW1t2aWV3MUNvcHksIHZpZXc1Q29weV0sIHZpZXczQ29weV1dKTtcblxuXHRcdGdyaWQyLmxheW91dCg4MDAsIDYwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzYwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzVDb3B5LnNpemUsIFs2MDAsIDEwMF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcxQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3MkNvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzNDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXc0Q29weSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzVDb3B5KSwgdHJ1ZSk7XG5cblx0XHRncmlkMi5zZXRWaWV3VmlzaWJsZSh2aWV3NENvcHksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzYwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzFDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcyQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3M0NvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzRDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXc1Q29weSksIHRydWUpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsc0JBQXNCLFdBQVcscUJBQXFCLE1BQXVELGtCQUFxQyxhQUFhLDRCQUE0QixrQkFBa0IsY0FBYztBQUNwTyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlLGdCQUFnQjtBQUN4QyxTQUFTLCtDQUErQztBQXVCeEQsTUFBTSxRQUFRLFdBQVk7QUFFekIsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxNQUFJO0FBRUosUUFBTSxXQUFZO0FBQ2pCLGdCQUFZLFNBQVMsY0FBYyxLQUFLO0FBQ3hDLGNBQVUsTUFBTSxXQUFXO0FBQzNCLGNBQVUsTUFBTSxRQUFRLEdBQUcsR0FBRztBQUM5QixjQUFVLE1BQU0sU0FBUyxHQUFHLEdBQUc7QUFBQSxFQUNoQyxDQUFDO0FBRUQsT0FBSyx1QkFBdUIsTUFBTTtBQUNqQyxXQUFPLGdCQUFnQixvQkFBb0IsWUFBWSxVQUFVLENBQUMsQ0FBQyxHQUFHLFVBQVUsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3hGLFdBQU8sZ0JBQWdCLG9CQUFvQixZQUFZLFVBQVUsQ0FBQyxDQUFDLEdBQUcsVUFBVSxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDMUYsV0FBTyxnQkFBZ0Isb0JBQW9CLFlBQVksVUFBVSxDQUFDLENBQUMsR0FBRyxVQUFVLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzdGLFdBQU8sZ0JBQWdCLG9CQUFvQixZ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QUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxZQUFZLE9BQU8sVUFBVSxFQUFFO0FBQzFELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxZQUFZLE9BQU8sVUFBVSxJQUFJO0FBQzVELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDOUMsQ0FBQztBQUVELE9BQUssc0RBQXNELFdBQVk7QUFDdEUsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixVQUFNLE9BQU8sTUFBTSxJQUFJLElBQUksS0FBSyxLQUFLLENBQUM7QUFDdEMsY0FBVSxZQUFZLEtBQUssT0FBTztBQUVsQyxTQUFLLE9BQU8sS0FBSyxHQUFHO0FBQ3BCLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxPQUFPLE9BQU8sVUFBVSxJQUFJO0FBQ3ZELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxPQUFPLE9BQU8sVUFBVSxLQUFLO0FBQ3hELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxPQUFPLE9BQU8sVUFBVSxJQUFJO0FBQ3ZELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxPQUFPLE9BQU8sVUFBVSxFQUFFO0FBQ3JELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBRTdDLFVBQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLElBQUksT0FBTyxXQUFXLElBQUksT0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxPQUFPLE9BQU8sVUFBVSxJQUFJO0FBQ3ZELFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDOUMsQ0FBQztBQUVELE9BQUsseUJBQXlCLFdBQVk7QUFDekMsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFB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
