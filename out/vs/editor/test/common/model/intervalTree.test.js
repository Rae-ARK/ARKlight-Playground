import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { IntervalNode, IntervalTree, NodeColor, SENTINEL, getNodeColor, intervalCompare, nodeAcceptEdit, setNodeStickiness } from "../../../common/model/intervalTree.js";
const GENERATE_TESTS = false;
const TEST_COUNT = GENERATE_TESTS ? 1e4 : 0;
const PRINT_TREE = false;
const MIN_INTERVAL_START = 1;
const MAX_INTERVAL_END = 100;
const MIN_INSERTS = 1;
const MAX_INSERTS = 30;
const MIN_CHANGE_CNT = 10;
const MAX_CHANGE_CNT = 20;
suite("IntervalTree 1", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class Interval {
    constructor(start, end) {
      this._intervalBrand = void 0;
      this.start = start;
      this.end = end;
    }
  }
  class Oracle {
    constructor() {
      this.intervals = [];
    }
    insert(interval) {
      this.intervals.push(interval);
      this.intervals.sort((a, b) => {
        if (a.start === b.start) {
          return a.end - b.end;
        }
        return a.start - b.start;
      });
      return interval;
    }
    delete(interval) {
      for (let i = 0, len = this.intervals.length; i < len; i++) {
        if (this.intervals[i] === interval) {
          this.intervals.splice(i, 1);
          return;
        }
      }
    }
    search(interval) {
      const result = [];
      for (let i = 0, len = this.intervals.length; i < len; i++) {
        const int = this.intervals[i];
        if (int.start <= interval.end && int.end >= interval.start) {
          result.push(int);
        }
      }
      return result;
    }
  }
  class TestState {
    constructor() {
      this._oracle = new Oracle();
      this._tree = new IntervalTree();
      this._lastNodeId = -1;
      this._treeNodes = [];
      this._oracleNodes = [];
    }
    acceptOp(op) {
      if (op.type === "insert") {
        if (PRINT_TREE) {
          console.log(`insert: {${JSON.stringify(new Interval(op.begin, op.end))}}`);
        }
        const nodeId = ++this._lastNodeId;
        this._treeNodes[nodeId] = new IntervalNode(null, op.begin, op.end);
        this._tree.insert(this._treeNodes[nodeId]);
        this._oracleNodes[nodeId] = this._oracle.insert(new Interval(op.begin, op.end));
      } else if (op.type === "delete") {
        if (PRINT_TREE) {
          console.log(`delete: {${JSON.stringify(this._oracleNodes[op.id])}}`);
        }
        this._tree.delete(this._treeNodes[op.id]);
        this._oracle.delete(this._oracleNodes[op.id]);
        this._treeNodes[op.id] = null;
        this._oracleNodes[op.id] = null;
      } else if (op.type === "change") {
        this._tree.delete(this._treeNodes[op.id]);
        this._treeNodes[op.id].reset(0, op.begin, op.end, null);
        this._tree.insert(this._treeNodes[op.id]);
        this._oracle.delete(this._oracleNodes[op.id]);
        this._oracleNodes[op.id].start = op.begin;
        this._oracleNodes[op.id].end = op.end;
        this._oracle.insert(this._oracleNodes[op.id]);
      } else {
        const actualNodes = this._tree.intervalSearch(op.begin, op.end, 0, false, false, 0, false);
        const actual2 = actualNodes.map((n) => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
        const expected2 = this._oracle.search(new Interval(op.begin, op.end));
        assert.deepStrictEqual(actual2, expected2);
        return;
      }
      if (PRINT_TREE) {
        printTree(this._tree);
      }
      assertTreeInvariants(this._tree);
      const actual = this._tree.getAllInOrder().map((n) => new Interval(n.cachedAbsoluteStart, n.cachedAbsoluteEnd));
      const expected = this._oracle.intervals;
      assert.deepStrictEqual(actual, expected);
    }
    getExistingNodeId(index) {
      let currIndex = -1;
      for (let i = 0; i < this._treeNodes.length; i++) {
        if (this._treeNodes[i] === null) {
          continue;
        }
        currIndex++;
        if (currIndex === index) {
          return i;
        }
      }
      throw new Error("unexpected");
    }
  }
  function testIntervalTree(ops) {
    const state = new TestState();
    for (let i = 0; i < ops.length; i++) {
      state.acceptOp(ops[i]);
    }
  }
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function getRandomRange(min, max) {
    const begin = getRandomInt(min, max);
    let length;
    if (getRandomInt(1, 10) <= 2) {
      length = getRandomInt(0, max - begin);
    } else {
      length = getRandomInt(0, Math.min(max - begin, 10));
    }
    return [begin, begin + length];
  }
  class AutoTest {
    constructor() {
      this._ops = [];
      this._state = new TestState();
      this._insertCnt = getRandomInt(MIN_INSERTS, MAX_INSERTS);
      this._changeCnt = getRandomInt(MIN_CHANGE_CNT, MAX_CHANGE_CNT);
      this._deleteCnt = 0;
    }
    _doRandomInsert() {
      const range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
      this._run({
        type: "insert",
        begin: range[0],
        end: range[1]
      });
    }
    _doRandomDelete() {
      const idx = getRandomInt(Math.floor(this._deleteCnt / 2), this._deleteCnt - 1);
      this._run({
        type: "delete",
        id: this._state.getExistingNodeId(idx)
      });
    }
    _doRandomChange() {
      const idx = getRandomInt(0, this._deleteCnt - 1);
      const range = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
      this._run({
        type: "change",
        id: this._state.getExistingNodeId(idx),
        begin: range[0],
        end: range[1]
      });
    }
    run() {
      while (this._insertCnt > 0 || this._deleteCnt > 0 || this._changeCnt > 0) {
        if (this._insertCnt > 0) {
          this._doRandomInsert();
          this._insertCnt--;
          this._deleteCnt++;
        } else if (this._changeCnt > 0) {
          this._doRandomChange();
          this._changeCnt--;
        } else {
          this._doRandomDelete();
          this._deleteCnt--;
        }
        const searchRange = getRandomRange(MIN_INTERVAL_START, MAX_INTERVAL_END);
        this._run({
          type: "search",
          begin: searchRange[0],
          end: searchRange[1]
        });
      }
    }
    _run(op) {
      this._ops.push(op);
      this._state.acceptOp(op);
    }
    print() {
      console.log(`testIntervalTree(${JSON.stringify(this._ops)})`);
    }
  }
  suite("generated", () => {
    test("gen01", () => {
      testIntervalTree([
        { type: "insert", begin: 28, end: 35 },
        { type: "insert", begin: 52, end: 54 },
        { type: "insert", begin: 63, end: 69 }
      ]);
    });
    test("gen02", () => {
      testIntervalTree([
        { type: "insert", begin: 80, end: 89 },
        { type: "insert", begin: 92, end: 100 },
        { type: "insert", begin: 99, end: 99 }
      ]);
    });
    test("gen03", () => {
      testIntervalTree([
        { type: "insert", begin: 89, end: 96 },
        { type: "insert", begin: 71, end: 74 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen04", () => {
      testIntervalTree([
        { type: "insert", begin: 44, end: 46 },
        { type: "insert", begin: 85, end: 88 },
        { type: "delete", id: 0 }
      ]);
    });
    test("gen05", () => {
      testIntervalTree([
        { type: "insert", begin: 82, end: 90 },
        { type: "insert", begin: 69, end: 73 },
        { type: "delete", id: 0 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen06", () => {
      testIntervalTree([
        { type: "insert", begin: 41, end: 63 },
        { type: "insert", begin: 98, end: 98 },
        { type: "insert", begin: 47, end: 51 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen07", () => {
      testIntervalTree([
        { type: "insert", begin: 24, end: 26 },
        { type: "insert", begin: 11, end: 28 },
        { type: "insert", begin: 27, end: 30 },
        { type: "insert", begin: 80, end: 85 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen08", () => {
      testIntervalTree([
        { type: "insert", begin: 100, end: 100 },
        { type: "insert", begin: 100, end: 100 }
      ]);
    });
    test("gen09", () => {
      testIntervalTree([
        { type: "insert", begin: 58, end: 65 },
        { type: "insert", begin: 82, end: 96 },
        { type: "insert", begin: 58, end: 65 }
      ]);
    });
    test("gen10", () => {
      testIntervalTree([
        { type: "insert", begin: 32, end: 40 },
        { type: "insert", begin: 25, end: 29 },
        { type: "insert", begin: 24, end: 32 }
      ]);
    });
    test("gen11", () => {
      testIntervalTree([
        { type: "insert", begin: 25, end: 70 },
        { type: "insert", begin: 99, end: 100 },
        { type: "insert", begin: 46, end: 51 },
        { type: "insert", begin: 57, end: 57 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen12", () => {
      testIntervalTree([
        { type: "insert", begin: 20, end: 26 },
        { type: "insert", begin: 10, end: 18 },
        { type: "insert", begin: 99, end: 99 },
        { type: "insert", begin: 37, end: 59 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen13", () => {
      testIntervalTree([
        { type: "insert", begin: 3, end: 91 },
        { type: "insert", begin: 57, end: 57 },
        { type: "insert", begin: 35, end: 44 },
        { type: "insert", begin: 72, end: 81 },
        { type: "delete", id: 2 }
      ]);
    });
    test("gen14", () => {
      testIntervalTree([
        { type: "insert", begin: 58, end: 61 },
        { type: "insert", begin: 34, end: 35 },
        { type: "insert", begin: 56, end: 62 },
        { type: "insert", begin: 69, end: 78 },
        { type: "delete", id: 0 }
      ]);
    });
    test("gen15", () => {
      testIntervalTree([
        { type: "insert", begin: 63, end: 69 },
        { type: "insert", begin: 17, end: 24 },
        { type: "insert", begin: 3, end: 13 },
        { type: "insert", begin: 84, end: 94 },
        { type: "insert", begin: 18, end: 23 },
        { type: "insert", begin: 96, end: 98 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen16", () => {
      testIntervalTree([
        { type: "insert", begin: 27, end: 27 },
        { type: "insert", begin: 42, end: 87 },
        { type: "insert", begin: 42, end: 49 },
        { type: "insert", begin: 69, end: 71 },
        { type: "insert", begin: 20, end: 27 },
        { type: "insert", begin: 8, end: 9 },
        { type: "insert", begin: 42, end: 49 },
        { type: "delete", id: 1 }
      ]);
    });
    test("gen17", () => {
      testIntervalTree([
        { type: "insert", begin: 21, end: 23 },
        { type: "insert", begin: 83, end: 87 },
        { type: "insert", begin: 56, end: 58 },
        { type: "insert", begin: 1, end: 55 },
        { type: "insert", begin: 56, end: 59 },
        { type: "insert", begin: 58, end: 60 },
        { type: "insert", begin: 56, end: 65 },
        { type: "delete", id: 1 },
        { type: "delete", id: 0 },
        { type: "delete", id: 6 }
      ]);
    });
    test("gen18", () => {
      testIntervalTree([
        { type: "insert", begin: 25, end: 25 },
        { type: "insert", begin: 67, end: 79 },
        { type: "delete", id: 0 },
        { type: "search", begin: 65, end: 75 }
      ]);
    });
    test("force delta overflow", () => {
      testIntervalTree([
        { type: "insert", begin: 686081138593427, end: 733009856502260 },
        { type: "insert", begin: 591031326181669, end: 591031326181672 },
        { type: "insert", begin: 940037682731896, end: 940037682731903 },
        { type: "insert", begin: 598413641151120, end: 598413641151128 },
        { type: "insert", begin: 800564156553344, end: 800564156553351 },
        { type: "insert", begin: 894198957565481, end: 894198957565491 }
      ]);
    });
  });
  for (let i = 0; i < TEST_COUNT; i++) {
    if (i % 100 === 0) {
      console.log(`TEST ${i + 1}/${TEST_COUNT}`);
    }
    const test2 = new AutoTest();
    try {
      test2.run();
    } catch (err) {
      console.log(err);
      test2.print();
      return;
    }
  }
  suite("searching", () => {
    function createCormenTree() {
      const r = new IntervalTree();
      const data = [
        [16, 21],
        [8, 9],
        [25, 30],
        [5, 8],
        [15, 23],
        [17, 19],
        [26, 26],
        [0, 3],
        [6, 10],
        [19, 20]
      ];
      data.forEach((int) => {
        const node = new IntervalNode(null, int[0], int[1]);
        r.insert(node);
      });
      return r;
    }
    const T = createCormenTree();
    function assertIntervalSearch(start, end, expected) {
      const actualNodes = T.intervalSearch(start, end, 0, false, false, 0, false);
      const actual = actualNodes.map((n) => [n.cachedAbsoluteStart, n.cachedAbsoluteEnd]);
      assert.deepStrictEqual(actual, expected);
    }
    test("cormen 1->2", () => {
      assertIntervalSearch(
        1,
        2,
        [
          [0, 3]
        ]
      );
    });
    test("cormen 4->8", () => {
      assertIntervalSearch(
        4,
        8,
        [
          [5, 8],
          [6, 10],
          [8, 9]
        ]
      );
    });
    test("cormen 10->15", () => {
      assertIntervalSearch(
        10,
        15,
        [
          [6, 10],
          [15, 23]
        ]
      );
    });
    test("cormen 21->25", () => {
      assertIntervalSearch(
        21,
        25,
        [
          [15, 23],
          [16, 21],
          [25, 30]
        ]
      );
    });
    test("cormen 24->24", () => {
      assertIntervalSearch(
        24,
        24,
        []
      );
    });
  });
});
suite("IntervalTree 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertNodeAcceptEdit(msg, nodeStart, nodeEnd, nodeStickiness, start, end, textLength, forceMoveMarkers, expectedNodeStart, expectedNodeEnd) {
    const node = new IntervalNode("", nodeStart, nodeEnd);
    setNodeStickiness(node, nodeStickiness);
    nodeAcceptEdit(node, start, end, textLength, forceMoveMarkers);
    assert.deepStrictEqual([node.start, node.end], [expectedNodeStart, expectedNodeEnd], msg);
  }
  test("nodeAcceptEdit", () => {
    {
      assertNodeAcceptEdit("A.000", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.001", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.002", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.003", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, false, 0, 0);
      assertNodeAcceptEdit("A.004", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.005", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.006", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.007", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, true, 0, 0);
      assertNodeAcceptEdit("A.008", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, false, 0, 1);
      assertNodeAcceptEdit("A.009", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, false, 1, 1);
      assertNodeAcceptEdit("A.010", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, false, 0, 0);
      assertNodeAcceptEdit("A.011", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, false, 1, 1);
      assertNodeAcceptEdit("A.012", 0, 0, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.013", 0, 0, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.014", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, true, 1, 1);
      assertNodeAcceptEdit("A.015", 0, 0, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, true, 1, 1);
    }
    {
      assertNodeAcceptEdit("B.000", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.001", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.002", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.003", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, false, 0, 5);
      assertNodeAcceptEdit("B.004", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.005", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.006", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.007", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 0, true, 0, 5);
      assertNodeAcceptEdit("B.008", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, false, 0, 6);
      assertNodeAcceptEdit("B.009", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, false, 1, 6);
      assertNodeAcceptEdit("B.010", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, false, 0, 6);
      assertNodeAcceptEdit("B.011", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, false, 1, 6);
      assertNodeAcceptEdit("B.012", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.013", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.014", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.015", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 0, 0, 1, true, 1, 6);
      assertNodeAcceptEdit("B.016", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.017", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.018", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.019", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 2, 2, 1, false, 0, 6);
      assertNodeAcceptEdit("B.020", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.021", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.022", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.023", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 2, 2, 1, true, 0, 6);
      assertNodeAcceptEdit("B.024", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 5, 1, false, 0, 6);
      assertNodeAcceptEdit("B.025", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 5, 1, false, 0, 5);
      assertNodeAcceptEdit("B.026", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 5, 1, false, 0, 5);
      assertNodeAcceptEdit("B.027", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 5, 1, false, 0, 6);
      assertNodeAcceptEdit("B.028", 0, 5, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.029", 0, 5, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.030", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.031", 0, 5, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 5, 1, true, 0, 6);
      assertNodeAcceptEdit("B.032", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 2, false, 5, 11);
      assertNodeAcceptEdit("B.033", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 2, false, 6, 11);
      assertNodeAcceptEdit("B.034", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 2, false, 5, 11);
      assertNodeAcceptEdit("B.035", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 2, false, 6, 11);
      assertNodeAcceptEdit("B.036", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.037", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.038", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.039", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 2, true, 6, 11);
      assertNodeAcceptEdit("B.040", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.041", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.042", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.043", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 3, 5, 1, false, 4, 9);
      assertNodeAcceptEdit("B.044", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.045", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.046", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.047", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 3, 5, 1, true, 4, 9);
      assertNodeAcceptEdit("B.048", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.049", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.050", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.051", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 3, false, 5, 11);
      assertNodeAcceptEdit("B.052", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.053", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.054", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.055", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 3, true, 7, 11);
      assertNodeAcceptEdit("B.056", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.057", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.058", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.059", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 1, false, 5, 9);
      assertNodeAcceptEdit("B.060", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.061", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.062", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.063", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 1, true, 5, 9);
      assertNodeAcceptEdit("B.064", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.065", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.066", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.067", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 2, false, 5, 11);
      assertNodeAcceptEdit("B.068", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.069", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.070", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.071", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 2, true, 7, 11);
      assertNodeAcceptEdit("B.072", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.073", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.074", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.075", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 7, 1, false, 5, 9);
      assertNodeAcceptEdit("B.076", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.077", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.078", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.079", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 7, 1, true, 6, 9);
      assertNodeAcceptEdit("B.080", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 2, false, 5, 11);
      assertNodeAcceptEdit("B.081", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 2, false, 5, 10);
      assertNodeAcceptEdit("B.082", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 2, false, 5, 10);
      assertNodeAcceptEdit("B.083", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 2, false, 5, 11);
      assertNodeAcceptEdit("B.084", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.085", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.086", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.087", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 2, true, 5, 11);
      assertNodeAcceptEdit("B.088", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.089", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.090", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.091", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 8, 10, 1, false, 5, 9);
      assertNodeAcceptEdit("B.092", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.093", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.094", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.095", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 8, 10, 1, true, 5, 9);
      assertNodeAcceptEdit("B.096", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.097", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.098", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.099", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.100", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.101", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.102", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.103", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 3, true, 5, 12);
      assertNodeAcceptEdit("B.104", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.105", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.106", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.107", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 1, false, 5, 10);
      assertNodeAcceptEdit("B.108", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.109", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.110", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.111", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 1, true, 5, 10);
      assertNodeAcceptEdit("B.112", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.113", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.114", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.115", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 3, false, 5, 10);
      assertNodeAcceptEdit("B.116", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.117", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.118", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.119", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 3, true, 5, 13);
      assertNodeAcceptEdit("B.120", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.121", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.122", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.123", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 12, 1, false, 5, 10);
      assertNodeAcceptEdit("B.124", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.125", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.126", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.127", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 12, 1, true, 5, 11);
      assertNodeAcceptEdit("B.128", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.129", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.130", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.131", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 0, false, 4, 9);
      assertNodeAcceptEdit("B.132", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.133", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.134", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.135", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 5, 0, true, 4, 9);
      assertNodeAcceptEdit("B.136", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.137", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.138", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.139", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 0, false, 4, 8);
      assertNodeAcceptEdit("B.140", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.141", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.142", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.143", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 4, 6, 0, true, 4, 8);
      assertNodeAcceptEdit("B.144", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.145", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.146", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.147", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 0, false, 5, 9);
      assertNodeAcceptEdit("B.148", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.149", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.150", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.151", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 6, 0, true, 5, 9);
      assertNodeAcceptEdit("B.152", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.153", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.154", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.155", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 0, false, 5, 9);
      assertNodeAcceptEdit("B.156", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.157", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.158", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.159", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 10, 0, true, 5, 9);
      assertNodeAcceptEdit("B.160", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.161", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.162", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.163", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 0, false, 5, 9);
      assertNodeAcceptEdit("B.164", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.165", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.166", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.167", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 9, 11, 0, true, 5, 9);
      assertNodeAcceptEdit("B.168", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.169", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.170", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.171", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 0, false, 5, 10);
      assertNodeAcceptEdit("B.172", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.173", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.174", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.175", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 10, 11, 0, true, 5, 10);
      assertNodeAcceptEdit("B.176", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.177", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.178", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.179", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 3, false, 5, 8);
      assertNodeAcceptEdit("B.180", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.181", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.182", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.183", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 3, true, 8, 8);
      assertNodeAcceptEdit("B.184", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 7, false, 5, 12);
      assertNodeAcceptEdit("B.185", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 7, false, 5, 10);
      assertNodeAcceptEdit("B.186", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 7, false, 5, 10);
      assertNodeAcceptEdit("B.187", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 7, false, 5, 12);
      assertNodeAcceptEdit("B.188", 5, 10, TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.189", 5, 10, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.190", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingBefore, 5, 10, 7, true, 12, 12);
      assertNodeAcceptEdit("B.191", 5, 10, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter, 5, 10, 7, true, 12, 12);
    }
  });
});
function printTree(T) {
  if (T.root === SENTINEL) {
    console.log(`~~ empty`);
    return;
  }
  const out = [];
  _printTree(T, T.root, "", 0, out);
  console.log(out.join(""));
}
function _printTree(T, n, indent, delta, out) {
  out.push(`${indent}[${getNodeColor(n) === NodeColor.Red ? "R" : "B"},${n.delta}, ${n.start}->${n.end}, ${n.maxEnd}] : {${delta + n.start}->${delta + n.end}}, maxEnd: ${n.maxEnd + delta}
`);
  if (n.left !== SENTINEL) {
    _printTree(T, n.left, indent + "    ", delta, out);
  } else {
    out.push(`${indent}    NIL
`);
  }
  if (n.right !== SENTINEL) {
    _printTree(T, n.right, indent + "    ", delta + n.delta, out);
  } else {
    out.push(`${indent}    NIL
`);
  }
}
function assertTreeInvariants(T) {
  assert(getNodeColor(SENTINEL) === NodeColor.Black);
  assert(SENTINEL.parent === SENTINEL);
  assert(SENTINEL.left === SENTINEL);
  assert(SENTINEL.right === SENTINEL);
  assert(SENTINEL.start === 0);
  assert(SENTINEL.end === 0);
  assert(SENTINEL.delta === 0);
  assert(T.root.parent === SENTINEL);
  assertValidTree(T);
}
function depth(n) {
  if (n === SENTINEL) {
    return 1;
  }
  assert(depth(n.left) === depth(n.right));
  return (getNodeColor(n) === NodeColor.Black ? 1 : 0) + depth(n.left);
}
function assertValidNode(n, delta) {
  if (n === SENTINEL) {
    return;
  }
  const l = n.left;
  const r = n.right;
  if (getNodeColor(n) === NodeColor.Red) {
    assert(getNodeColor(l) === NodeColor.Black);
    assert(getNodeColor(r) === NodeColor.Black);
  }
  let expectedMaxEnd = n.end;
  if (l !== SENTINEL) {
    assert(intervalCompare(l.start + delta, l.end + delta, n.start + delta, n.end + delta) <= 0);
    expectedMaxEnd = Math.max(expectedMaxEnd, l.maxEnd);
  }
  if (r !== SENTINEL) {
    assert(intervalCompare(n.start + delta, n.end + delta, r.start + delta + n.delta, r.end + delta + n.delta) <= 0);
    expectedMaxEnd = Math.max(expectedMaxEnd, r.maxEnd + n.delta);
  }
  assert(n.maxEnd === expectedMaxEnd);
  assertValidNode(l, delta);
  assertValidNode(r, delta + n.delta);
}
function assertValidTree(T) {
  if (T.root === SENTINEL) {
    return;
  }
  assert(getNodeColor(T.root) === NodeColor.Black);
  assert(depth(T.root.left) === depth(T.root.right));
  assertValidNode(T.root, 0);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC9pbnRlcnZhbFRyZWUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbE5vZGUsIEludGVydmFsVHJlZSwgTm9kZUNvbG9yLCBTRU5USU5FTCwgZ2V0Tm9kZUNvbG9yLCBpbnRlcnZhbENvbXBhcmUsIG5vZGVBY2NlcHRFZGl0LCBzZXROb2RlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9pbnRlcnZhbFRyZWUuanMnO1xuXG5jb25zdCBHRU5FUkFURV9URVNUUyA9IGZhbHNlO1xuY29uc3QgVEVTVF9DT1VOVCA9IEdFTkVSQVRFX1RFU1RTID8gMTAwMDAgOiAwO1xuY29uc3QgUFJJTlRfVFJFRSA9IGZhbHNlO1xuY29uc3QgTUlOX0lOVEVSVkFMX1NUQVJUID0gMTtcbmNvbnN0IE1BWF9JTlRFUlZBTF9FTkQgPSAxMDA7XG5jb25zdCBNSU5fSU5TRVJUUyA9IDE7XG5jb25zdCBNQVhfSU5TRVJUUyA9IDMwO1xuY29uc3QgTUlOX0NIQU5HRV9DTlQgPSAxMDtcbmNvbnN0IE1BWF9DSEFOR0VfQ05UID0gMjA7XG5cbnN1aXRlKCdJbnRlcnZhbFRyZWUgMScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBJbnRlcnZhbCB7XG5cdFx0X2ludGVydmFsQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0XHRwdWJsaWMgc3RhcnQ6IG51bWJlcjtcblx0XHRwdWJsaWMgZW5kOiBudW1iZXI7XG5cblx0XHRjb25zdHJ1Y3RvcihzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlcikge1xuXHRcdFx0dGhpcy5zdGFydCA9IHN0YXJ0O1xuXHRcdFx0dGhpcy5lbmQgPSBlbmQ7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgT3JhY2xlIHtcblx0XHRwdWJsaWMgaW50ZXJ2YWxzOiBJbnRlcnZhbFtdO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHR0aGlzLmludGVydmFscyA9IFtdO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBpbnNlcnQoaW50ZXJ2YWw6IEludGVydmFsKTogSW50ZXJ2YWwge1xuXHRcdFx0dGhpcy5pbnRlcnZhbHMucHVzaChpbnRlcnZhbCk7XG5cdFx0XHR0aGlzLmludGVydmFscy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLnN0YXJ0ID09PSBiLnN0YXJ0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEuZW5kIC0gYi5lbmQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEuc3RhcnQgLSBiLnN0YXJ0O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gaW50ZXJ2YWw7XG5cdFx0fVxuXG5cdFx0cHVibGljIGRlbGV0ZShpbnRlcnZhbDogSW50ZXJ2YWwpOiB2b2lkIHtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmludGVydmFscy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5pbnRlcnZhbHNbaV0gPT09IGludGVydmFsKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnRlcnZhbHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHB1YmxpYyBzZWFyY2goaW50ZXJ2YWw6IEludGVydmFsKTogSW50ZXJ2YWxbXSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IEludGVydmFsW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLmludGVydmFscy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBpbnQgPSB0aGlzLmludGVydmFsc1tpXTtcblx0XHRcdFx0aWYgKGludC5zdGFydCA8PSBpbnRlcnZhbC5lbmQgJiYgaW50LmVuZCA+PSBpbnRlcnZhbC5zdGFydCkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGludCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgVGVzdFN0YXRlIHtcblx0XHRwcml2YXRlIF9vcmFjbGU6IE9yYWNsZSA9IG5ldyBPcmFjbGUoKTtcblx0XHRwcml2YXRlIF90cmVlOiBJbnRlcnZhbFRyZWUgPSBuZXcgSW50ZXJ2YWxUcmVlKCk7XG5cdFx0cHJpdmF0ZSBfbGFzdE5vZGVJZCA9IC0xO1xuXHRcdHByaXZhdGUgX3RyZWVOb2RlczogQXJyYXk8SW50ZXJ2YWxOb2RlIHwgbnVsbD4gPSBbXTtcblx0XHRwcml2YXRlIF9vcmFjbGVOb2RlczogQXJyYXk8SW50ZXJ2YWwgfCBudWxsPiA9IFtdO1xuXG5cdFx0cHVibGljIGFjY2VwdE9wKG9wOiBJT3BlcmF0aW9uKTogdm9pZCB7XG5cblx0XHRcdGlmIChvcC50eXBlID09PSAnaW5zZXJ0Jykge1xuXHRcdFx0XHRpZiAoUFJJTlRfVFJFRSkge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGBpbnNlcnQ6IHske0pTT04uc3RyaW5naWZ5KG5ldyBJbnRlcnZhbChvcC5iZWdpbiwgb3AuZW5kKSl9fWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5vZGVJZCA9ICgrK3RoaXMuX2xhc3ROb2RlSWQpO1xuXHRcdFx0XHR0aGlzLl90cmVlTm9kZXNbbm9kZUlkXSA9IG5ldyBJbnRlcnZhbE5vZGUobnVsbCEsIG9wLmJlZ2luLCBvcC5lbmQpO1xuXHRcdFx0XHR0aGlzLl90cmVlLmluc2VydCh0aGlzLl90cmVlTm9kZXNbbm9kZUlkXSEpO1xuXHRcdFx0XHR0aGlzLl9vcmFjbGVOb2Rlc1tub2RlSWRdID0gdGhpcy5fb3JhY2xlLmluc2VydChuZXcgSW50ZXJ2YWwob3AuYmVnaW4sIG9wLmVuZCkpO1xuXHRcdFx0fSBlbHNlIGlmIChvcC50eXBlID09PSAnZGVsZXRlJykge1xuXHRcdFx0XHRpZiAoUFJJTlRfVFJFRSkge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKGBkZWxldGU6IHske0pTT04uc3RyaW5naWZ5KHRoaXMuX29yYWNsZU5vZGVzW29wLmlkXSl9fWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3RyZWUuZGVsZXRlKHRoaXMuX3RyZWVOb2Rlc1tvcC5pZF0hKTtcblx0XHRcdFx0dGhpcy5fb3JhY2xlLmRlbGV0ZSh0aGlzLl9vcmFjbGVOb2Rlc1tvcC5pZF0hKTtcblxuXHRcdFx0XHR0aGlzLl90cmVlTm9kZXNbb3AuaWRdID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdID0gbnVsbDtcblx0XHRcdH0gZWxzZSBpZiAob3AudHlwZSA9PT0gJ2NoYW5nZScpIHtcblxuXHRcdFx0XHR0aGlzLl90cmVlLmRlbGV0ZSh0aGlzLl90cmVlTm9kZXNbb3AuaWRdISk7XG5cdFx0XHRcdHRoaXMuX3RyZWVOb2Rlc1tvcC5pZF0hLnJlc2V0KDAsIG9wLmJlZ2luLCBvcC5lbmQsIG51bGwhKTtcblx0XHRcdFx0dGhpcy5fdHJlZS5pbnNlcnQodGhpcy5fdHJlZU5vZGVzW29wLmlkXSEpO1xuXG5cdFx0XHRcdHRoaXMuX29yYWNsZS5kZWxldGUodGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdISk7XG5cdFx0XHRcdHRoaXMuX29yYWNsZU5vZGVzW29wLmlkXSEuc3RhcnQgPSBvcC5iZWdpbjtcblx0XHRcdFx0dGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdIS5lbmQgPSBvcC5lbmQ7XG5cdFx0XHRcdHRoaXMuX29yYWNsZS5pbnNlcnQodGhpcy5fb3JhY2xlTm9kZXNbb3AuaWRdISk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbE5vZGVzID0gdGhpcy5fdHJlZS5pbnRlcnZhbFNlYXJjaChvcC5iZWdpbiwgb3AuZW5kLCAwLCBmYWxzZSwgZmFsc2UsIDAsIGZhbHNlKTtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gYWN0dWFsTm9kZXMubWFwKG4gPT4gbmV3IEludGVydmFsKG4uY2FjaGVkQWJzb2x1dGVTdGFydCwgbi5jYWNoZWRBYnNvbHV0ZUVuZCkpO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IHRoaXMuX29yYWNsZS5zZWFyY2gobmV3IEludGVydmFsKG9wLmJlZ2luLCBvcC5lbmQpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoUFJJTlRfVFJFRSkge1xuXHRcdFx0XHRwcmludFRyZWUodGhpcy5fdHJlZSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydFRyZWVJbnZhcmlhbnRzKHRoaXMuX3RyZWUpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSB0aGlzLl90cmVlLmdldEFsbEluT3JkZXIoKS5tYXAobiA9PiBuZXcgSW50ZXJ2YWwobi5jYWNoZWRBYnNvbHV0ZVN0YXJ0LCBuLmNhY2hlZEFic29sdXRlRW5kKSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IHRoaXMuX29yYWNsZS5pbnRlcnZhbHM7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBnZXRFeGlzdGluZ05vZGVJZChpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdGxldCBjdXJySW5kZXggPSAtMTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fdHJlZU5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl90cmVlTm9kZXNbaV0gPT09IG51bGwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJySW5kZXgrKztcblx0XHRcdFx0aWYgKGN1cnJJbmRleCA9PT0gaW5kZXgpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd1bmV4cGVjdGVkJyk7XG5cdFx0fVxuXHR9XG5cblx0aW50ZXJmYWNlIElJbnNlcnRPcGVyYXRpb24ge1xuXHRcdHR5cGU6ICdpbnNlcnQnO1xuXHRcdGJlZ2luOiBudW1iZXI7XG5cdFx0ZW5kOiBudW1iZXI7XG5cdH1cblxuXHRpbnRlcmZhY2UgSURlbGV0ZU9wZXJhdGlvbiB7XG5cdFx0dHlwZTogJ2RlbGV0ZSc7XG5cdFx0aWQ6IG51bWJlcjtcblx0fVxuXG5cdGludGVyZmFjZSBJQ2hhbmdlT3BlcmF0aW9uIHtcblx0XHR0eXBlOiAnY2hhbmdlJztcblx0XHRpZDogbnVtYmVyO1xuXHRcdGJlZ2luOiBudW1iZXI7XG5cdFx0ZW5kOiBudW1iZXI7XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNlYXJjaE9wZXJhdGlvbiB7XG5cdFx0dHlwZTogJ3NlYXJjaCc7XG5cdFx0YmVnaW46IG51bWJlcjtcblx0XHRlbmQ6IG51bWJlcjtcblx0fVxuXG5cdHR5cGUgSU9wZXJhdGlvbiA9IElJbnNlcnRPcGVyYXRpb24gfCBJRGVsZXRlT3BlcmF0aW9uIHwgSUNoYW5nZU9wZXJhdGlvbiB8IElTZWFyY2hPcGVyYXRpb247XG5cblx0ZnVuY3Rpb24gdGVzdEludGVydmFsVHJlZShvcHM6IElPcGVyYXRpb25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IFRlc3RTdGF0ZSgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3BzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdGF0ZS5hY2NlcHRPcChvcHNbaV0pO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGdldFJhbmRvbUludChtaW46IG51bWJlciwgbWF4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpICsgbWluO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0UmFuZG9tUmFuZ2UobWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XG5cdFx0Y29uc3QgYmVnaW4gPSBnZXRSYW5kb21JbnQobWluLCBtYXgpO1xuXHRcdGxldCBsZW5ndGg6IG51bWJlcjtcblx0XHRpZiAoZ2V0UmFuZG9tSW50KDEsIDEwKSA8PSAyKSB7XG5cdFx0XHQvLyBsYXJnZSByYW5nZVxuXHRcdFx0bGVuZ3RoID0gZ2V0UmFuZG9tSW50KDAsIG1heCAtIGJlZ2luKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gc21hbGwgcmFuZ2Vcblx0XHRcdGxlbmd0aCA9IGdldFJhbmRvbUludCgwLCBNYXRoLm1pbihtYXggLSBiZWdpbiwgMTApKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtiZWdpbiwgYmVnaW4gKyBsZW5ndGhdO1xuXHR9XG5cblx0Y2xhc3MgQXV0b1Rlc3Qge1xuXHRcdHByaXZhdGUgX29wczogSU9wZXJhdGlvbltdID0gW107XG5cdFx0cHJpdmF0ZSBfc3RhdGU6IFRlc3RTdGF0ZSA9IG5ldyBUZXN0U3RhdGUoKTtcblx0XHRwcml2YXRlIF9pbnNlcnRDbnQ6IG51bWJlcjtcblx0XHRwcml2YXRlIF9kZWxldGVDbnQ6IG51bWJlcjtcblx0XHRwcml2YXRlIF9jaGFuZ2VDbnQ6IG51bWJlcjtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0dGhpcy5faW5zZXJ0Q250ID0gZ2V0UmFuZG9tSW50KE1JTl9JTlNFUlRTLCBNQVhfSU5TRVJUUyk7XG5cdFx0XHR0aGlzLl9jaGFuZ2VDbnQgPSBnZXRSYW5kb21JbnQoTUlOX0NIQU5HRV9DTlQsIE1BWF9DSEFOR0VfQ05UKTtcblx0XHRcdHRoaXMuX2RlbGV0ZUNudCA9IDA7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZG9SYW5kb21JbnNlcnQoKTogdm9pZCB7XG5cdFx0XHRjb25zdCByYW5nZSA9IGdldFJhbmRvbVJhbmdlKE1JTl9JTlRFUlZBTF9TVEFSVCwgTUFYX0lOVEVSVkFMX0VORCk7XG5cdFx0XHR0aGlzLl9ydW4oe1xuXHRcdFx0XHR0eXBlOiAnaW5zZXJ0Jyxcblx0XHRcdFx0YmVnaW46IHJhbmdlWzBdLFxuXHRcdFx0XHRlbmQ6IHJhbmdlWzFdXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9kb1JhbmRvbURlbGV0ZSgpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGlkeCA9IGdldFJhbmRvbUludChNYXRoLmZsb29yKHRoaXMuX2RlbGV0ZUNudCAvIDIpLCB0aGlzLl9kZWxldGVDbnQgLSAxKTtcblx0XHRcdHRoaXMuX3J1bih7XG5cdFx0XHRcdHR5cGU6ICdkZWxldGUnLFxuXHRcdFx0XHRpZDogdGhpcy5fc3RhdGUuZ2V0RXhpc3RpbmdOb2RlSWQoaWR4KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZG9SYW5kb21DaGFuZ2UoKTogdm9pZCB7XG5cdFx0XHRjb25zdCBpZHggPSBnZXRSYW5kb21JbnQoMCwgdGhpcy5fZGVsZXRlQ250IC0gMSk7XG5cdFx0XHRjb25zdCByYW5nZSA9IGdldFJhbmRvbVJhbmdlKE1JTl9JTlRFUlZBTF9TVEFSVCwgTUFYX0lOVEVSVkFMX0VORCk7XG5cdFx0XHR0aGlzLl9ydW4oe1xuXHRcdFx0XHR0eXBlOiAnY2hhbmdlJyxcblx0XHRcdFx0aWQ6IHRoaXMuX3N0YXRlLmdldEV4aXN0aW5nTm9kZUlkKGlkeCksXG5cdFx0XHRcdGJlZ2luOiByYW5nZVswXSxcblx0XHRcdFx0ZW5kOiByYW5nZVsxXVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bigpIHtcblx0XHRcdHdoaWxlICh0aGlzLl9pbnNlcnRDbnQgPiAwIHx8IHRoaXMuX2RlbGV0ZUNudCA+IDAgfHwgdGhpcy5fY2hhbmdlQ250ID4gMCkge1xuXHRcdFx0XHRpZiAodGhpcy5faW5zZXJ0Q250ID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2RvUmFuZG9tSW5zZXJ0KCk7XG5cdFx0XHRcdFx0dGhpcy5faW5zZXJ0Q250LS07XG5cdFx0XHRcdFx0dGhpcy5fZGVsZXRlQ250Kys7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fY2hhbmdlQ250ID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2RvUmFuZG9tQ2hhbmdlKCk7XG5cdFx0XHRcdFx0dGhpcy5fY2hhbmdlQ250LS07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9SYW5kb21EZWxldGUoKTtcblx0XHRcdFx0XHR0aGlzLl9kZWxldGVDbnQtLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIExldCdzIGFsc28gc2VhcmNoIGZvciBzb21ldGhpbmcuLi5cblx0XHRcdFx0Y29uc3Qgc2VhcmNoUmFuZ2UgPSBnZXRSYW5kb21SYW5nZShNSU5fSU5URVJWQUxfU1RBUlQsIE1BWF9JTlRFUlZBTF9FTkQpO1xuXHRcdFx0XHR0aGlzLl9ydW4oe1xuXHRcdFx0XHRcdHR5cGU6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdGJlZ2luOiBzZWFyY2hSYW5nZVswXSxcblx0XHRcdFx0XHRlbmQ6IHNlYXJjaFJhbmdlWzFdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByaXZhdGUgX3J1bihvcDogSU9wZXJhdGlvbik6IHZvaWQge1xuXHRcdFx0dGhpcy5fb3BzLnB1c2gob3ApO1xuXHRcdFx0dGhpcy5fc3RhdGUuYWNjZXB0T3Aob3ApO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBwcmludCgpOiB2b2lkIHtcblx0XHRcdGNvbnNvbGUubG9nKGB0ZXN0SW50ZXJ2YWxUcmVlKCR7SlNPTi5zdHJpbmdpZnkodGhpcy5fb3BzKX0pYCk7XG5cdFx0fVxuXG5cdH1cblxuXHRzdWl0ZSgnZ2VuZXJhdGVkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2dlbjAxJywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyOCwgZW5kOiAzNSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTIsIGVuZDogNTQgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDYzLCBlbmQ6IDY5IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMDInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDgwLCBlbmQ6IDg5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA5MiwgZW5kOiAxMDAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDk5LCBlbmQ6IDk5IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMDMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDg5LCBlbmQ6IDk2IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA3MSwgZW5kOiA3NCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjA0JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0NCwgZW5kOiA0NiB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODUsIGVuZDogODggfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDAgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wNScsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODIsIGVuZDogOTAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDY5LCBlbmQ6IDczIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAxIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMDYnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDQxLCBlbmQ6IDYzIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA5OCwgZW5kOiA5OCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNDcsIGVuZDogNTEgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDIgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wNycsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjQsIGVuZDogMjYgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDExLCBlbmQ6IDI4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyNywgZW5kOiAzMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODAsIGVuZDogODUgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDEgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4wOCcsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMTAwLCBlbmQ6IDEwMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMTAwLCBlbmQ6IDEwMCB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjA5JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1OCwgZW5kOiA2NSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODIsIGVuZDogOTYgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU4LCBlbmQ6IDY1IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTAnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDMyLCBlbmQ6IDQwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyNSwgZW5kOiAyOSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjQsIGVuZDogMzIgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xMScsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMjUsIGVuZDogNzAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDk5LCBlbmQ6IDEwMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNDYsIGVuZDogNTEgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU3LCBlbmQ6IDU3IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAyIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDIwLCBlbmQ6IDI2IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAxMCwgZW5kOiAxOCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogOTksIGVuZDogOTkgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDM3LCBlbmQ6IDU5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAyIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDMsIGVuZDogOTEgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU3LCBlbmQ6IDU3IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAzNSwgZW5kOiA0NCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNzIsIGVuZDogODEgfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDIgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xNCcsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTgsIGVuZDogNjEgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDM0LCBlbmQ6IDM1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1NiwgZW5kOiA2MiB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNjksIGVuZDogNzggfSxcblx0XHRcdFx0eyB0eXBlOiAnZGVsZXRlJywgaWQ6IDAgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW4xNScsICgpID0+IHtcblx0XHRcdHRlc3RJbnRlcnZhbFRyZWUoW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNjMsIGVuZDogNjkgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDE3LCBlbmQ6IDI0IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAzLCBlbmQ6IDEzIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4NCwgZW5kOiA5NCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogMTgsIGVuZDogMjMgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDk2LCBlbmQ6IDk4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAxIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTYnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDI3LCBlbmQ6IDI3IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0MiwgZW5kOiA4NyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNDIsIGVuZDogNDkgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDY5LCBlbmQ6IDcxIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyMCwgZW5kOiAyNyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogOCwgZW5kOiA5IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA0MiwgZW5kOiA0OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbjE3JywgKCkgPT4ge1xuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAyMSwgZW5kOiAyMyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogODMsIGVuZDogODcgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU2LCBlbmQ6IDU4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiAxLCBlbmQ6IDU1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1NiwgZW5kOiA1OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdpbnNlcnQnLCBiZWdpbjogNTgsIGVuZDogNjAgfSxcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDU2LCBlbmQ6IDY1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAxIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2RlbGV0ZScsIGlkOiA2IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2VuMTgnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0SW50ZXJ2YWxUcmVlKFtcblx0XHRcdFx0eyB0eXBlOiAnaW5zZXJ0JywgYmVnaW46IDI1LCBlbmQ6IDI1IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA2NywgZW5kOiA3OSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdkZWxldGUnLCBpZDogMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzZWFyY2gnLCBiZWdpbjogNjUsIGVuZDogNzUgfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3JjZSBkZWx0YSBvdmVyZmxvdycsICgpID0+IHtcblx0XHRcdC8vIFNlYXJjaCB0aGUgSW50ZXJ2YWxOb2RlIGN0b3IgZm9yIEZPUkNFX09WRVJGTE9XSU5HX1RFU1Rcblx0XHRcdC8vIHRvIGZvcmNlIHRoYXQgdGhpcyB0ZXN0IGxlYWRzIHRvIGEgZGVsdGEgbm9ybWFsaXphdGlvblxuXHRcdFx0dGVzdEludGVydmFsVHJlZShbXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA2ODYwODExMzg1OTM0MjcsIGVuZDogNzMzMDA5ODU2NTAyMjYwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1OTEwMzEzMjYxODE2NjksIGVuZDogNTkxMDMxMzI2MTgxNjcyIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA5NDAwMzc2ODI3MzE4OTYsIGVuZDogOTQwMDM3NjgyNzMxOTAzIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA1OTg0MTM2NDExNTExMjAsIGVuZDogNTk4NDEzNjQxMTUxMTI4IH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4MDA1NjQxNTY1NTMzNDQsIGVuZDogODAwNTY0MTU2NTUzMzUxIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2luc2VydCcsIGJlZ2luOiA4OTQxOTg5NTc1NjU0ODEsIGVuZDogODk0MTk4OTU3NTY1NDkxIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBURVNUX0NPVU5UID0gMDtcblx0Ly8gUFJJTlRfVFJFRSA9IHRydWU7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBURVNUX0NPVU5UOyBpKyspIHtcblx0XHRpZiAoaSAlIDEwMCA9PT0gMCkge1xuXHRcdFx0Y29uc29sZS5sb2coYFRFU1QgJHtpICsgMX0vJHtURVNUX0NPVU5UfWApO1xuXHRcdH1cblx0XHRjb25zdCB0ZXN0ID0gbmV3IEF1dG9UZXN0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGVzdC5ydW4oKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHR0ZXN0LnByaW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0c3VpdGUoJ3NlYXJjaGluZycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUNvcm1lblRyZWUoKTogSW50ZXJ2YWxUcmVlIHtcblx0XHRcdGNvbnN0IHIgPSBuZXcgSW50ZXJ2YWxUcmVlKCk7XG5cdFx0XHRjb25zdCBkYXRhOiBbbnVtYmVyLCBudW1iZXJdW10gPSBbXG5cdFx0XHRcdFsxNiwgMjFdLFxuXHRcdFx0XHRbOCwgOV0sXG5cdFx0XHRcdFsyNSwgMzBdLFxuXHRcdFx0XHRbNSwgOF0sXG5cdFx0XHRcdFsxNSwgMjNdLFxuXHRcdFx0XHRbMTcsIDE5XSxcblx0XHRcdFx0WzI2LCAyNl0sXG5cdFx0XHRcdFswLCAzXSxcblx0XHRcdFx0WzYsIDEwXSxcblx0XHRcdFx0WzE5LCAyMF1cblx0XHRcdF07XG5cdFx0XHRkYXRhLmZvckVhY2goKGludCkgPT4ge1xuXHRcdFx0XHRjb25zdCBub2RlID0gbmV3IEludGVydmFsTm9kZShudWxsISwgaW50WzBdLCBpbnRbMV0pO1xuXHRcdFx0XHRyLmluc2VydChub2RlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgVCA9IGNyZWF0ZUNvcm1lblRyZWUoKTtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydEludGVydmFsU2VhcmNoKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBleHBlY3RlZDogW251bWJlciwgbnVtYmVyXVtdKTogdm9pZCB7XG5cdFx0XHRjb25zdCBhY3R1YWxOb2RlcyA9IFQuaW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgMCwgZmFsc2UsIGZhbHNlLCAwLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhY3R1YWxOb2Rlcy5tYXAoKG4pID0+IDxbbnVtYmVyLCBudW1iZXJdPltuLmNhY2hlZEFic29sdXRlU3RhcnQsIG4uY2FjaGVkQWJzb2x1dGVFbmRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnY29ybWVuIDEtPjInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRJbnRlcnZhbFNlYXJjaChcblx0XHRcdFx0MSwgMixcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFswLCAzXSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nvcm1lbiA0LT44JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0SW50ZXJ2YWxTZWFyY2goXG5cdFx0XHRcdDQsIDgsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRbNSwgOF0sXG5cdFx0XHRcdFx0WzYsIDEwXSxcblx0XHRcdFx0XHRbOCwgOV0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3JtZW4gMTAtPjE1JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0SW50ZXJ2YWxTZWFyY2goXG5cdFx0XHRcdDEwLCAxNSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFs2LCAxMF0sXG5cdFx0XHRcdFx0WzE1LCAyM10sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3JtZW4gMjEtPjI1JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0SW50ZXJ2YWxTZWFyY2goXG5cdFx0XHRcdDIxLCAyNSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdFsxNSwgMjNdLFxuXHRcdFx0XHRcdFsxNiwgMjFdLFxuXHRcdFx0XHRcdFsyNSwgMzBdLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29ybWVuIDI0LT4yNCcsICgpID0+IHtcblx0XHRcdGFzc2VydEludGVydmFsU2VhcmNoKFxuXHRcdFx0XHQyNCwgMjQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0ludGVydmFsVHJlZSAyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydE5vZGVBY2NlcHRFZGl0KG1zZzogc3RyaW5nLCBub2RlU3RhcnQ6IG51bWJlciwgbm9kZUVuZDogbnVtYmVyLCBub2RlU3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcywgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIHRleHRMZW5ndGg6IG51bWJlciwgZm9yY2VNb3ZlTWFya2VyczogYm9vbGVhbiwgZXhwZWN0ZWROb2RlU3RhcnQ6IG51bWJlciwgZXhwZWN0ZWROb2RlRW5kOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gbmV3IEludGVydmFsTm9kZSgnJywgbm9kZVN0YXJ0LCBub2RlRW5kKTtcblx0XHRzZXROb2RlU3RpY2tpbmVzcyhub2RlLCBub2RlU3RpY2tpbmVzcyk7XG5cdFx0bm9kZUFjY2VwdEVkaXQobm9kZSwgc3RhcnQsIGVuZCwgdGV4dExlbmd0aCwgZm9yY2VNb3ZlTWFya2Vycyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbbm9kZS5zdGFydCwgbm9kZS5lbmRdLCBbZXhwZWN0ZWROb2RlU3RhcnQsIGV4cGVjdGVkTm9kZUVuZF0sIG1zZyk7XG5cdH1cblxuXHR0ZXN0KCdub2RlQWNjZXB0RWRpdCcsICgpID0+IHtcblx0XHQvLyBBLiBjb2xsYXBzZWQgZGVjb3JhdGlvblxuXHRcdHtcblx0XHRcdC8vIG5vLW9wXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDAnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDAsIGZhbHNlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwMScsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAwLCBmYWxzZSwgMCwgMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDInLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDAsIGZhbHNlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwMycsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAwLCBmYWxzZSwgMCwgMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDQnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDAsIHRydWUsIDAsIDApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDA1JywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDAsIHRydWUsIDAsIDApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDA2JywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAwLCAwLCAwLCB0cnVlLCAwLCAwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAwNycsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAwLCB0cnVlLCAwLCAwKTtcblx0XHRcdC8vIGluc2VydGlvblxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDA4JywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAxLCBmYWxzZSwgMCwgMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMDknLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMSwgZmFsc2UsIDEsIDEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDEwJywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAwLCAwLCAxLCBmYWxzZSwgMCwgMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMTEnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMCwgMCwgMSwgZmFsc2UsIDEsIDEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0EuMDEyJywgMCwgMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAxLCB0cnVlLCAxLCAxKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAxMycsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAxLCB0cnVlLCAxLCAxKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdBLjAxNCcsIDAsIDAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMCwgMCwgMSwgdHJ1ZSwgMSwgMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQS4wMTUnLCAwLCAwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMCwgMCwgMSwgdHJ1ZSwgMSwgMSk7XG5cdFx0fVxuXG5cdFx0Ly8gQi4gbm9uIGNvbGxhcHNlZCBkZWNvcmF0aW9uXG5cdFx0e1xuXHRcdFx0Ly8gbm8tb3Bcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwMCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgZmFsc2UsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDAxJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDAsIGZhbHNlLCAwLCA1KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwMicsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMCwgMCwgMCwgZmFsc2UsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDAzJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDAsIGZhbHNlLCAwLCA1KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwNCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgdHJ1ZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDUnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMCwgMCwgMCwgdHJ1ZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDYnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDAsIHRydWUsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDA3JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDAsIDAsIDAsIHRydWUsIDAsIDUpO1xuXHRcdFx0Ly8gaW5zZXJ0aW9uIGF0IHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMDgnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIGZhbHNlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAwOScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAwLCAwLCAxLCBmYWxzZSwgMSwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTAnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDAsIDAsIDEsIGZhbHNlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxMScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAxLCBmYWxzZSwgMSwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMTInLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIHRydWUsIDEsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDEzJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDAsIDAsIDEsIHRydWUsIDEsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE0JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAwLCAwLCAxLCB0cnVlLCAxLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxNScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAwLCAwLCAxLCB0cnVlLCAxLCA2KTtcblx0XHRcdC8vIGluc2VydGlvbiBpbiBtaWRkbGVcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxNicsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMiwgMiwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE3JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDIsIDIsIDEsIGZhbHNlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAxOCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMiwgMiwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDE5JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDIsIDIsIDEsIGZhbHNlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyMCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMiwgMiwgMSwgdHJ1ZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjEnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMiwgMiwgMSwgdHJ1ZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjInLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDIsIDIsIDEsIHRydWUsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDIzJywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDIsIDIsIDEsIHRydWUsIDAsIDYpO1xuXHRcdFx0Ly8gaW5zZXJ0aW9uIGF0IGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDI0JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA1LCAxLCBmYWxzZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjUnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNSwgMSwgZmFsc2UsIDAsIDUpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDI2JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA1LCAxLCBmYWxzZSwgMCwgNSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMjcnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgNSwgMSwgZmFsc2UsIDAsIDYpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDI4JywgMCwgNSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA1LCAxLCB0cnVlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAyOScsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA1LCAxLCB0cnVlLCAwLCA2KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzMCcsIDAsIDUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNSwgNSwgMSwgdHJ1ZSwgMCwgNik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMzEnLCAwLCA1LCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgNSwgMSwgdHJ1ZSwgMCwgNik7XG5cblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBsYXJnZXIgdGV4dCB1bnRpbCBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDMyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMiwgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzMycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMiwgZmFsc2UsIDYsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzNCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDUsIDIsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMzUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDQsIDUsIDIsIGZhbHNlLCA2LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMzYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA1LCAyLCB0cnVlLCA2LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wMzcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDUsIDIsIHRydWUsIDYsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzOCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDUsIDIsIHRydWUsIDYsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjAzOScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNSwgMiwgdHJ1ZSwgNiwgMTEpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCB1bnRpbCBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMywgNSwgMSwgZmFsc2UsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAzLCA1LCAxLCBmYWxzZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAzLCA1LCAxLCBmYWxzZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNDMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDMsIDUsIDEsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA0NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDMsIDUsIDEsIHRydWUsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAzLCA1LCAxLCB0cnVlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA0NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDMsIDUsIDEsIHRydWUsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAzLCA1LCAxLCB0cnVlLCA0LCA5KTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IHNlbGVjdCBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDQ4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMywgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA0OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMywgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDYsIDMsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNTEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDQsIDYsIDMsIGZhbHNlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNTInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAzLCB0cnVlLCA3LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNTMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDMsIHRydWUsIDcsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDYsIDMsIHRydWUsIDcsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNiwgMywgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCBzZWxlY3Qgc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA1NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNiwgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDU5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA0LCA2LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNjAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAxLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2MScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMSwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNjInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA0LCA2LCAxLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNiwgMSwgdHJ1ZSwgNSwgOSk7XG5cblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBsYXJnZXIgdGV4dCBmcm9tIHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNjQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDY1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDY2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNSwgNiwgMiwgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgNiwgMiwgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDIsIHRydWUsIDcsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA2OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNiwgMiwgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDcwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNSwgNiwgMiwgdHJ1ZSwgNywgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDcxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA2LCAyLCB0cnVlLCA3LCAxMSk7XG5cdFx0XHQvLyByZXBsYWNlIHdpdGggc21hbGxlciB0ZXh0IGZyb20gc3RhcnRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDcsIDEsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNywgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDc0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNSwgNywgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDc1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA3LCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA3LCAxLCB0cnVlLCA2LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNywgMSwgdHJ1ZSwgNiwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wNzgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA3LCAxLCB0cnVlLCA2LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA3OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgNywgMSwgdHJ1ZSwgNiwgOSk7XG5cblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBsYXJnZXIgdGV4dCB0byBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAyLCBmYWxzZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDgxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMCwgMiwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDEwLCAyLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDgzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMCwgMiwgZmFsc2UsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAyLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAyLCB0cnVlLCA1LCAxMSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA5LCAxMCwgMiwgdHJ1ZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDg3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMCwgMiwgdHJ1ZSwgNSwgMTEpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCB0byBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA4OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDgsIDEwLCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wODknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDgsIDEwLCAxLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA4LCAxMCwgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDkxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA4LCAxMCwgMSwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDkyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOCwgMTAsIDEsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDkzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA4LCAxMCwgMSwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA4LCAxMCwgMSwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4wOTUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDgsIDEwLCAxLCB0cnVlLCA1LCA5KTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IHNlbGVjdCBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA5NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDk3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjA5OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMDk5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMSwgMywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwMCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAzLCB0cnVlLCA1LCAxMik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAzLCB0cnVlLCA1LCAxMik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA5LCAxMSwgMywgdHJ1ZSwgNSwgMTIpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTAzJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA5LCAxMSwgMywgdHJ1ZSwgNSwgMTIpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCBzZWxlY3QgZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwNScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDEsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA5LCAxMSwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEwNycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTEsIDEsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMDgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMSwgdHJ1ZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTA5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMSwgdHJ1ZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTEwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgOSwgMTEsIDEsIHRydWUsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExMScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTEsIDEsIHRydWUsIDUsIDEwKTtcblxuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIGxhcmdlciB0ZXh0IGZyb20gZW5kXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTEsIDMsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMSwgMywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExNCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDEwLCAxMSwgMywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjExNScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMTAsIDExLCAzLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTE2JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAzLCB0cnVlLCA1LCAxMyk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMSwgMywgdHJ1ZSwgNSwgMTMpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTE4JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMTAsIDExLCAzLCB0cnVlLCA1LCAxMyk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMTknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDEwLCAxMSwgMywgdHJ1ZSwgNSwgMTMpO1xuXHRcdFx0Ly8gcmVwbGFjZSB3aXRoIHNtYWxsZXIgdGV4dCBmcm9tIGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTIwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDEyLCAxLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTIxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTIsIDEsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAxMCwgMTIsIDEsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDEwLCAxMiwgMSwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyNCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMiwgMSwgdHJ1ZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTI1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTIsIDEsIHRydWUsIDUsIDExKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEyNicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDEwLCAxMiwgMSwgdHJ1ZSwgNSwgMTEpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTI3JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAxMCwgMTIsIDEsIHRydWUsIDUsIDExKTtcblxuXHRcdFx0Ly8gZGVsZXRlIHVudGlsIHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA1LCAwLCBmYWxzZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMjknLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDUsIDAsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzMCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDUsIDAsIGZhbHNlLCA0LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzMScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNSwgMCwgZmFsc2UsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTMyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNSwgMCwgdHJ1ZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDUsIDAsIHRydWUsIDQsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTM0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNSwgMCwgdHJ1ZSwgNCwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDQsIDUsIDAsIHRydWUsIDQsIDkpO1xuXG5cdFx0XHQvLyBkZWxldGUgc2VsZWN0IHN0YXJ0XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA0LCA2LCAwLCBmYWxzZSwgNCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xMzcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDAsIGZhbHNlLCA0LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzOCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDQsIDYsIDAsIGZhbHNlLCA0LCA4KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjEzOScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNCwgNiwgMCwgZmFsc2UsIDQsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNCwgNiwgMCwgdHJ1ZSwgNCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDEnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDQsIDYsIDAsIHRydWUsIDQsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgNCwgNiwgMCwgdHJ1ZSwgNCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDQsIDYsIDAsIHRydWUsIDQsIDgpO1xuXG5cdFx0XHQvLyBkZWxldGUgZnJvbSBzdGFydFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQ0JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgNiwgMCwgZmFsc2UsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQ1JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCA2LCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNDcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDYsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE0OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDYsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTQ5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCA2LCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1MCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDUsIDYsIDAsIHRydWUsIDUsIDkpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTUxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCA2LCAwLCB0cnVlLCA1LCA5KTtcblxuXHRcdFx0Ly8gZGVsZXRlIHRvIGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTUyJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTAsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1NCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDEwLCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNTUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDEwLCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNTYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMCwgMCwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNTcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDEwLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDEwLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE1OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTAsIDAsIHRydWUsIDUsIDkpO1xuXG5cdFx0XHQvLyBkZWxldGUgc2VsZWN0IGVuZFxuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTYwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2MScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgOSwgMTEsIDAsIGZhbHNlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2MicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDExLCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNjMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDksIDExLCAwLCBmYWxzZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNjQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA5LCAxMSwgMCwgdHJ1ZSwgNSwgOSk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNjUnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDksIDExLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdCZWZvcmUsIDksIDExLCAwLCB0cnVlLCA1LCA5KTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgOSwgMTEsIDAsIHRydWUsIDUsIDkpO1xuXG5cdFx0XHQvLyBkZWxldGUgZnJvbSBlbmRcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2OCcsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDEwLCAxMSwgMCwgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE2OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAwLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTcwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZSwgMTAsIDExLCAwLCBmYWxzZSwgNSwgMTApO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTcxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCAxMCwgMTEsIDAsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCAxMCwgMTEsIDAsIHRydWUsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3MycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgMTAsIDExLCAwLCB0cnVlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCAxMCwgMTEsIDAsIHRydWUsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgMTAsIDExLCAwLCB0cnVlLCA1LCAxMCk7XG5cblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBsYXJnZXIgdGV4dCBlbnRpcmVcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE3NicsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDEwLCAzLCBmYWxzZSwgNSwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzcnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIDUsIDEwLCAzLCBmYWxzZSwgNSwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xNzgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCAxMCwgMywgZmFsc2UsIDUsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTc5JywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyLCA1LCAxMCwgMywgZmFsc2UsIDUsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTgwJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgMTAsIDMsIHRydWUsIDgsIDgpO1xuXHRcdFx0YXNzZXJ0Tm9kZUFjY2VwdEVkaXQoJ0IuMTgxJywgNSwgMTAsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgMywgdHJ1ZSwgOCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODInLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCAxMCwgMywgdHJ1ZSwgOCwgOCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODMnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIsIDUsIDEwLCAzLCB0cnVlLCA4LCA4KTtcblx0XHRcdC8vIHJlcGxhY2Ugd2l0aCBzbWFsbGVyIHRleHQgZW50aXJlXG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODQnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgNywgZmFsc2UsIDUsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4NScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgMTAsIDcsIGZhbHNlLCA1LCAxMCk7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODYnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCAxMCwgNywgZmFsc2UsIDUsIDEwKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4NycsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgMTAsIDcsIGZhbHNlLCA1LCAxMik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xODgnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCA1LCAxMCwgNywgdHJ1ZSwgMTIsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE4OScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgNSwgMTAsIDcsIHRydWUsIDEyLCAxMik7XG5cdFx0XHRhc3NlcnROb2RlQWNjZXB0RWRpdCgnQi4xOTAnLCA1LCAxMCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlLCA1LCAxMCwgNywgdHJ1ZSwgMTIsIDEyKTtcblx0XHRcdGFzc2VydE5vZGVBY2NlcHRFZGl0KCdCLjE5MScsIDUsIDEwLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciwgNSwgMTAsIDcsIHRydWUsIDEyLCAxMik7XG5cblx0XHR9XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIHByaW50VHJlZShUOiBJbnRlcnZhbFRyZWUpOiB2b2lkIHtcblx0aWYgKFQucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRjb25zb2xlLmxvZyhgfn4gZW1wdHlgKTtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuXHRfcHJpbnRUcmVlKFQsIFQucm9vdCwgJycsIDAsIG91dCk7XG5cdGNvbnNvbGUubG9nKG91dC5qb2luKCcnKSk7XG59XG5cbmZ1bmN0aW9uIF9wcmludFRyZWUoVDogSW50ZXJ2YWxUcmVlLCBuOiBJbnRlcnZhbE5vZGUsIGluZGVudDogc3RyaW5nLCBkZWx0YTogbnVtYmVyLCBvdXQ6IHN0cmluZ1tdKTogdm9pZCB7XG5cdG91dC5wdXNoKGAke2luZGVudH1bJHtnZXROb2RlQ29sb3IobikgPT09IE5vZGVDb2xvci5SZWQgPyAnUicgOiAnQid9LCR7bi5kZWx0YX0sICR7bi5zdGFydH0tPiR7bi5lbmR9LCAke24ubWF4RW5kfV0gOiB7JHtkZWx0YSArIG4uc3RhcnR9LT4ke2RlbHRhICsgbi5lbmR9fSwgbWF4RW5kOiAke24ubWF4RW5kICsgZGVsdGF9XFxuYCk7XG5cdGlmIChuLmxlZnQgIT09IFNFTlRJTkVMKSB7XG5cdFx0X3ByaW50VHJlZShULCBuLmxlZnQsIGluZGVudCArICcgICAgJywgZGVsdGEsIG91dCk7XG5cdH0gZWxzZSB7XG5cdFx0b3V0LnB1c2goYCR7aW5kZW50fSAgICBOSUxcXG5gKTtcblx0fVxuXHRpZiAobi5yaWdodCAhPT0gU0VOVElORUwpIHtcblx0XHRfcHJpbnRUcmVlKFQsIG4ucmlnaHQsIGluZGVudCArICcgICAgJywgZGVsdGEgKyBuLmRlbHRhLCBvdXQpO1xuXHR9IGVsc2Uge1xuXHRcdG91dC5wdXNoKGAke2luZGVudH0gICAgTklMXFxuYCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIEFzc2VydGlvblxuXG5mdW5jdGlvbiBhc3NlcnRUcmVlSW52YXJpYW50cyhUOiBJbnRlcnZhbFRyZWUpOiB2b2lkIHtcblx0YXNzZXJ0KGdldE5vZGVDb2xvcihTRU5USU5FTCkgPT09IE5vZGVDb2xvci5CbGFjayk7XG5cdGFzc2VydChTRU5USU5FTC5wYXJlbnQgPT09IFNFTlRJTkVMKTtcblx0YXNzZXJ0KFNFTlRJTkVMLmxlZnQgPT09IFNFTlRJTkVMKTtcblx0YXNzZXJ0KFNFTlRJTkVMLnJpZ2h0ID09PSBTRU5USU5FTCk7XG5cdGFzc2VydChTRU5USU5FTC5zdGFydCA9PT0gMCk7XG5cdGFzc2VydChTRU5USU5FTC5lbmQgPT09IDApO1xuXHRhc3NlcnQoU0VOVElORUwuZGVsdGEgPT09IDApO1xuXHRhc3NlcnQoVC5yb290LnBhcmVudCA9PT0gU0VOVElORUwpO1xuXHRhc3NlcnRWYWxpZFRyZWUoVCk7XG59XG5cbmZ1bmN0aW9uIGRlcHRoKG46IEludGVydmFsTm9kZSk6IG51bWJlciB7XG5cdGlmIChuID09PSBTRU5USU5FTCkge1xuXHRcdC8vIFRoZSBsZWFmcyBhcmUgYmxhY2tcblx0XHRyZXR1cm4gMTtcblx0fVxuXHRhc3NlcnQoZGVwdGgobi5sZWZ0KSA9PT0gZGVwdGgobi5yaWdodCkpO1xuXHRyZXR1cm4gKGdldE5vZGVDb2xvcihuKSA9PT0gTm9kZUNvbG9yLkJsYWNrID8gMSA6IDApICsgZGVwdGgobi5sZWZ0KTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0VmFsaWROb2RlKG46IEludGVydmFsTm9kZSwgZGVsdGE6IG51bWJlcik6IHZvaWQge1xuXHRpZiAobiA9PT0gU0VOVElORUwpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBsID0gbi5sZWZ0O1xuXHRjb25zdCByID0gbi5yaWdodDtcblxuXHRpZiAoZ2V0Tm9kZUNvbG9yKG4pID09PSBOb2RlQ29sb3IuUmVkKSB7XG5cdFx0YXNzZXJ0KGdldE5vZGVDb2xvcihsKSA9PT0gTm9kZUNvbG9yLkJsYWNrKTtcblx0XHRhc3NlcnQoZ2V0Tm9kZUNvbG9yKHIpID09PSBOb2RlQ29sb3IuQmxhY2spO1xuXHR9XG5cblx0bGV0IGV4cGVjdGVkTWF4RW5kID0gbi5lbmQ7XG5cdGlmIChsICE9PSBTRU5USU5FTCkge1xuXHRcdGFzc2VydChpbnRlcnZhbENvbXBhcmUobC5zdGFydCArIGRlbHRhLCBsLmVuZCArIGRlbHRhLCBuLnN0YXJ0ICsgZGVsdGEsIG4uZW5kICsgZGVsdGEpIDw9IDApO1xuXHRcdGV4cGVjdGVkTWF4RW5kID0gTWF0aC5tYXgoZXhwZWN0ZWRNYXhFbmQsIGwubWF4RW5kKTtcblx0fVxuXHRpZiAociAhPT0gU0VOVElORUwpIHtcblx0XHRhc3NlcnQoaW50ZXJ2YWxDb21wYXJlKG4uc3RhcnQgKyBkZWx0YSwgbi5lbmQgKyBkZWx0YSwgci5zdGFydCArIGRlbHRhICsgbi5kZWx0YSwgci5lbmQgKyBkZWx0YSArIG4uZGVsdGEpIDw9IDApO1xuXHRcdGV4cGVjdGVkTWF4RW5kID0gTWF0aC5tYXgoZXhwZWN0ZWRNYXhFbmQsIHIubWF4RW5kICsgbi5kZWx0YSk7XG5cdH1cblx0YXNzZXJ0KG4ubWF4RW5kID09PSBleHBlY3RlZE1heEVuZCk7XG5cblx0YXNzZXJ0VmFsaWROb2RlKGwsIGRlbHRhKTtcblx0YXNzZXJ0VmFsaWROb2RlKHIsIGRlbHRhICsgbi5kZWx0YSk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFZhbGlkVHJlZShUOiBJbnRlcnZhbFRyZWUpOiB2b2lkIHtcblx0aWYgKFQucm9vdCA9PT0gU0VOVElORUwpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0YXNzZXJ0KGdldE5vZGVDb2xvcihULnJvb3QpID09PSBOb2RlQ29sb3IuQmxhY2spO1xuXHRhc3NlcnQoZGVwdGgoVC5yb290LmxlZnQpID09PSBkZXB0aChULnJvb3QucmlnaHQpKTtcblx0YXNzZXJ0VmFsaWROb2RlKFQucm9vdCwgMCk7XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsY0FBYyxjQUFjLFdBQVcsVUFBVSxjQUFjLGlCQUFpQixnQkFBZ0IseUJBQXlCO0FBRWxJLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sYUFBYSxpQkFBaUIsTUFBUTtBQUM1QyxNQUFNLGFBQWE7QUFDbkIsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sY0FBYztBQUNwQixNQUFNLGlCQUFpQjtBQUN2QixNQUFNLGlCQUFpQjtBQUV2QixNQUFNLGtCQUFrQixNQUFNO0FBRTdCLDBDQUF3QztBQUFBLEVBRXhDLE1BQU0sU0FBUztBQUFBLElBTWQsWUFBWSxPQUFlLEtBQWE7QUFMeEMsNEJBQXVCO0FBTXRCLFdBQUssUUFBUTtBQUNiLFdBQUssTUFBTTtBQUFBLElBQ1o7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLE9BQU87QUFBQSxJQUdaLGNBQWM7QUFDYixXQUFLLFlBQVksQ0FBQztBQUFBLElBQ25CO0FBQUEsSUFFTyxPQUFPLFVBQThCO0FBQzNDLFdBQUssVUFBVSxLQUFLLFFBQVE7QUFDNUIsV0FBSyxVQUFVLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDN0IsWUFBSSxFQUFFLFVBQVUsRUFBRSxPQUFPO0FBQ3hCLGlCQUFP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dUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRXhHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsSUFDekc7QUFHQTtBQUVDLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRXhHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRXhHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRXhHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQ3pHLDJCQUFxQixTQUFTLEdBQUcsR0FBRyx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3hHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2pILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRTVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2pILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsR0FBRyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBR3pHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRzFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2pILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLElBQUksSUFBSSxHQUFHLE1BQU0sR0FBRyxFQUFFO0FBRzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzVHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzlHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQzNHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBRTFHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsOEJBQThCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQ2hILDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsNkJBQTZCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQy9HLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMkJBQTJCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzdHLDJCQUFxQixTQUFTLEdBQUcsSUFBSSx1QkFBdUIsMEJBQTBCLEdBQUcsSUFBSSxHQUFHLE9BQU8sR0FBRyxFQUFFO0FBQzVHLDJCQUFxQixTQUFT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
