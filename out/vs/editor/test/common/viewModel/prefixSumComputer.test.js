import assert from "assert";
import { toUint32 } from "../../../../base/common/uint.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ConstantTimePrefixSumComputer, PrefixSumComputer, PrefixSumIndexOfResult } from "../../../common/model/prefixSumComputer.js";
function toUint32Array(arr) {
  const len = arr.length;
  const r = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    r[i] = toUint32(arr[i]);
  }
  return r;
}
function createBoth(values) {
  const psc = new PrefixSumComputer(toUint32Array(values));
  const wrapped = {
    getTotalSum: () => psc.getTotalSum(),
    getPrefixSum: (count) => count === 0 ? 0 : psc.getPrefixSum(count - 1),
    getIndexOf: (sum) => psc.getIndexOf(sum),
    setValue: (index, value) => {
      psc.setValue(index, value);
    },
    insertValues: (insertIndex, insertArr) => {
      psc.insertValues(insertIndex, toUint32Array(insertArr));
    },
    removeValues: (start, deleteCount) => {
      psc.removeValues(start, deleteCount);
    }
  };
  const ct = new ConstantTimePrefixSumComputer([...values]);
  const wrappedCt = {
    getTotalSum: () => ct.getTotalSum(),
    getPrefixSum: (count) => ct.getPrefixSum(count),
    getIndexOf: (sum) => ct.getIndexOf(sum),
    setValue: (index, value) => {
      ct.setValue(index, value);
    },
    insertValues: (insertIndex, insertArr) => {
      ct.insertValues(insertIndex, insertArr);
    },
    removeValues: (start, deleteCount) => {
      ct.removeValues(start, deleteCount);
    }
  };
  return [wrapped, wrappedCt];
}
function forBoth(values, callback) {
  for (const psc of createBoth(values)) {
    callback(psc);
  }
}
suite("Editor ViewModel - PrefixSumComputer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("comprehensive setValue and getIndexOf", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 8);
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 4);
      assert.strictEqual(psc.getPrefixSum(4), 5);
      assert.strictEqual(psc.getPrefixSum(5), 8);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
      assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 5);
      assert.strictEqual(psc.getPrefixSum(4), 6);
      assert.strictEqual(psc.getPrefixSum(5), 9);
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 3);
      assert.strictEqual(psc.getPrefixSum(4), 4);
      assert.strictEqual(psc.getPrefixSum(5), 7);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(2, 0);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 2);
      assert.strictEqual(psc.getPrefixSum(5), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(3, 0);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 1);
      assert.strictEqual(psc.getPrefixSum(5), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 2));
      psc.setValue(1, 1);
      psc.setValue(3, 1);
      psc.setValue(4, 1);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 2);
      assert.strictEqual(psc.getPrefixSum(4), 3);
      assert.strictEqual(psc.getPrefixSum(5), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(4, 0));
    });
  });
  test("getTotalSum with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => assert.strictEqual(psc.getTotalSum(), 8));
    forBoth([10], (psc) => assert.strictEqual(psc.getTotalSum(), 10));
    forBoth([5, 5, 5], (psc) => assert.strictEqual(psc.getTotalSum(), 15));
  });
  test("getTotalSum with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
    forBoth([0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
  });
  test("getTotalSum with empty array", () => {
    forBoth([], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
  });
  test("getTotalSum with single element", () => {
    forBoth([0], (psc) => assert.strictEqual(psc.getTotalSum(), 0));
    forBoth([1], (psc) => assert.strictEqual(psc.getTotalSum(), 1));
    forBoth([100], (psc) => assert.strictEqual(psc.getTotalSum(), 100));
  });
  test("getPrefixSum with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 4);
      assert.strictEqual(psc.getPrefixSum(4), 5);
      assert.strictEqual(psc.getPrefixSum(5), 8);
    });
  });
  test("getPrefixSum with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 0);
      assert.strictEqual(psc.getPrefixSum(3), 0);
    });
  });
  test("getPrefixSum with single element", () => {
    forBoth([7], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 7);
    });
  });
  test("getPrefixSum with empty array", () => {
    forBoth([], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
    });
  });
  test("getPrefixSum with leading/trailing zeroes", () => {
    forBoth([0, 0, 3, 0, 0], (psc) => {
      assert.strictEqual(psc.getPrefixSum(0), 0);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 0);
      assert.strictEqual(psc.getPrefixSum(3), 3);
      assert.strictEqual(psc.getPrefixSum(4), 3);
      assert.strictEqual(psc.getPrefixSum(5), 3);
    });
  });
  test("getIndexOf with typical values", () => {
    forBoth([1, 1, 2, 1, 3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(4, 0));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(4, 1));
      assert.deepStrictEqual(psc.getIndexOf(7), new PrefixSumIndexOfResult(4, 2));
      assert.deepStrictEqual(psc.getIndexOf(8), new PrefixSumIndexOfResult(4, 3));
    });
  });
  test("getIndexOf with all zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("getIndexOf with single zero", () => {
    forBoth([0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
    });
  });
  test("getIndexOf with single element", () => {
    forBoth([5], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
    });
  });
  test("getIndexOf with leading zeroes", () => {
    forBoth([0, 0, 3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 1));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 2));
    });
  });
  test("getIndexOf with trailing zeroes", () => {
    forBoth([3, 0, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(0, 1));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(0, 2));
    });
  });
  test("getIndexOf with interleaved zeroes", () => {
    forBoth([0, 1, 0, 2, 0], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(3, 1));
    });
  });
  test("getIndexOf with all ones", () => {
    forBoth([1, 1, 1, 1, 1], (psc) => {
      for (let i = 0; i < 5; i++) {
        assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
      }
    });
  });
  test("getIndexOf with large value in single element", () => {
    forBoth([1e3], (psc) => {
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(500), new PrefixSumIndexOfResult(0, 500));
      assert.deepStrictEqual(psc.getIndexOf(999), new PrefixSumIndexOfResult(0, 999));
    });
  });
  test("setValue no-op when value unchanged", () => {
    forBoth([1, 2, 3], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 6);
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
    });
  });
  test("setValue increase", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(1, 5);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.strictEqual(psc.getPrefixSum(2), 6);
      assert.strictEqual(psc.getPrefixSum(3), 9);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue decrease", () => {
    forBoth([1, 5, 3], (psc) => {
      psc.setValue(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 1));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue to zero", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue from zero", () => {
    forBoth([0, 0, 0], (psc) => {
      psc.setValue(1, 3);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 2));
    });
  });
  test("setValue on first element", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(0, 10);
      assert.strictEqual(psc.getTotalSum(), 15);
      assert.strictEqual(psc.getPrefixSum(1), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(9), new PrefixSumIndexOfResult(0, 9));
      assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("setValue on last element", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(2, 10);
      assert.strictEqual(psc.getTotalSum(), 13);
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(2, 9));
    });
  });
  test("set all values to zero then restore", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.setValue(0, 0);
      psc.setValue(1, 0);
      psc.setValue(2, 0);
      assert.strictEqual(psc.getTotalSum(), 0);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(2, 0));
      psc.setValue(0, 4);
      assert.strictEqual(psc.getTotalSum(), 4);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(0, 3));
    });
  });
  test("setValue multiple times on same index", () => {
    forBoth([1, 1, 1], (psc) => {
      psc.setValue(1, 5);
      psc.setValue(1, 2);
      psc.setValue(1, 10);
      assert.strictEqual(psc.getTotalSum(), 12);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(10), new PrefixSumIndexOfResult(1, 9));
      assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("insertValues at beginning", () => {
    forBoth([3, 4], (psc) => {
      psc.insertValues(0, [1, 2]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("insertValues at end", () => {
    forBoth([1, 2], (psc) => {
      psc.insertValues(2, [3, 4]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
    });
  });
  test("insertValues in the middle", () => {
    forBoth([1, 4], (psc) => {
      psc.insertValues(1, [2, 3]);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
      assert.strictEqual(psc.getPrefixSum(3), 6);
      assert.strictEqual(psc.getPrefixSum(4), 10);
    });
  });
  test("insertValues with zeroes", () => {
    forBoth([1, 2], (psc) => {
      psc.insertValues(1, [0, 0]);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 1);
      assert.strictEqual(psc.getPrefixSum(3), 1);
      assert.strictEqual(psc.getPrefixSum(4), 3);
    });
  });
  test("insertValues into all-zeroes", () => {
    forBoth([0, 0, 0], (psc) => {
      psc.insertValues(1, [2, 3]);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 0);
      assert.strictEqual(psc.getPrefixSum(2), 2);
      assert.strictEqual(psc.getPrefixSum(3), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(2, 2));
    });
  });
  test("insertValues into empty computer", () => {
    forBoth([], (psc) => {
      psc.insertValues(0, [5, 3]);
      assert.strictEqual(psc.getTotalSum(), 8);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("removeValues from beginning", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(0, 2);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.strictEqual(psc.getPrefixSum(1), 3);
      assert.strictEqual(psc.getPrefixSum(2), 7);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("removeValues from end", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(2, 2);
      assert.strictEqual(psc.getTotalSum(), 3);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 3);
    });
  });
  test("removeValues from the middle", () => {
    forBoth([1, 2, 3, 4], (psc) => {
      psc.removeValues(1, 2);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.strictEqual(psc.getPrefixSum(1), 1);
      assert.strictEqual(psc.getPrefixSum(2), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(1, 3));
    });
  });
  test("removeValues all", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.removeValues(0, 3);
      assert.strictEqual(psc.getTotalSum(), 0);
    });
  });
  test("removeValues single element", () => {
    forBoth([5, 10, 15], (psc) => {
      psc.removeValues(1, 1);
      assert.strictEqual(psc.getTotalSum(), 20);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(19), new PrefixSumIndexOfResult(1, 14));
    });
  });
  test("removeValues zero-valued elements", () => {
    forBoth([0, 0, 5, 0, 0], (psc) => {
      psc.removeValues(0, 2);
      assert.strictEqual(psc.getTotalSum(), 5);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
    });
  });
  test("insert then remove", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.insertValues(1, [10, 20]);
      assert.strictEqual(psc.getTotalSum(), 36);
      psc.removeValues(1, 2);
      assert.strictEqual(psc.getTotalSum(), 6);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(3), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("remove then insert at same position", () => {
    forBoth([1, 2, 3], (psc) => {
      psc.removeValues(1, 1);
      psc.insertValues(1, [5]);
      assert.strictEqual(psc.getTotalSum(), 9);
      assert.deepStrictEqual(psc.getIndexOf(1), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 4));
      assert.deepStrictEqual(psc.getIndexOf(6), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("setValue then insert then remove", () => {
    forBoth([1, 1, 1], (psc) => {
      psc.setValue(0, 5);
      psc.insertValues(1, [10]);
      psc.removeValues(3, 1);
      assert.strictEqual(psc.getTotalSum(), 16);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(4), new PrefixSumIndexOfResult(0, 4));
      assert.deepStrictEqual(psc.getIndexOf(5), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(14), new PrefixSumIndexOfResult(1, 9));
      assert.deepStrictEqual(psc.getIndexOf(15), new PrefixSumIndexOfResult(2, 0));
    });
  });
  test("multiple queries between mutations are consistent", () => {
    forBoth([2, 3, 5], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      psc.setValue(1, 0);
      assert.strictEqual(psc.getTotalSum(), 7);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      psc.setValue(1, 3);
      assert.strictEqual(psc.getTotalSum(), 10);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(1, 0));
    });
  });
  test("large values", () => {
    forBoth([100, 200, 300], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 600);
      assert.strictEqual(psc.getPrefixSum(1), 100);
      assert.strictEqual(psc.getPrefixSum(2), 300);
      assert.strictEqual(psc.getPrefixSum(3), 600);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(0, 0));
      assert.deepStrictEqual(psc.getIndexOf(99), new PrefixSumIndexOfResult(0, 99));
      assert.deepStrictEqual(psc.getIndexOf(100), new PrefixSumIndexOfResult(1, 0));
      assert.deepStrictEqual(psc.getIndexOf(299), new PrefixSumIndexOfResult(1, 199));
      assert.deepStrictEqual(psc.getIndexOf(300), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(599), new PrefixSumIndexOfResult(2, 299));
    });
  });
  test("many elements", () => {
    forBoth(new Array(100).fill(1), (psc) => {
      assert.strictEqual(psc.getTotalSum(), 100);
      assert.strictEqual(psc.getPrefixSum(50), 50);
      for (let i = 0; i < 100; i++) {
        assert.deepStrictEqual(psc.getIndexOf(i), new PrefixSumIndexOfResult(i, 0));
      }
    });
  });
  test("many elements all zeroes", () => {
    forBoth(new Array(100).fill(0), (psc) => {
      assert.strictEqual(psc.getTotalSum(), 0);
      for (let i = 0; i <= 100; i++) {
        assert.strictEqual(psc.getPrefixSum(i), 0);
      }
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(99, 0));
    });
  });
  test("setValue between queries re-validates correctly", () => {
    forBoth([1, 1, 1, 1, 1], (psc) => {
      assert.strictEqual(psc.getTotalSum(), 5);
      psc.setValue(2, 10);
      assert.strictEqual(psc.getTotalSum(), 14);
      assert.strictEqual(psc.getPrefixSum(3), 12);
      assert.deepStrictEqual(psc.getIndexOf(2), new PrefixSumIndexOfResult(2, 0));
      assert.deepStrictEqual(psc.getIndexOf(11), new PrefixSumIndexOfResult(2, 9));
      assert.deepStrictEqual(psc.getIndexOf(12), new PrefixSumIndexOfResult(3, 0));
      assert.deepStrictEqual(psc.getIndexOf(13), new PrefixSumIndexOfResult(4, 0));
      psc.setValue(0, 0);
      assert.strictEqual(psc.getTotalSum(), 13);
      assert.deepStrictEqual(psc.getIndexOf(0), new PrefixSumIndexOfResult(1, 0));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi92aWV3TW9kZWwvcHJlZml4U3VtQ29tcHV0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRvVWludDMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnN0YW50VGltZVByZWZpeFN1bUNvbXB1dGVyLCBQcmVmaXhTdW1Db21wdXRlciwgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9wcmVmaXhTdW1Db21wdXRlci5qcyc7XG5cbmludGVyZmFjZSBJUHJlZml4U3VtQ29tcHV0ZXIge1xuXHRnZXRUb3RhbFN1bSgpOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHN1bSBvZiBmaXJzdCBgY291bnRgIHZhbHVlczogU1VNKDAgPD0gaiA8IGNvdW50LCB2YWx1ZXNbal0pLlxuXHQgKi9cblx0Z2V0UHJlZml4U3VtKGNvdW50OiBudW1iZXIpOiBudW1iZXI7XG5cdGdldEluZGV4T2Yoc3VtOiBudW1iZXIpOiBQcmVmaXhTdW1JbmRleE9mUmVzdWx0O1xuXHRzZXRWYWx1ZShpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKTogdm9pZDtcblx0aW5zZXJ0VmFsdWVzKGluc2VydEluZGV4OiBudW1iZXIsIGluc2VydEFycjogbnVtYmVyW10pOiB2b2lkO1xuXHRyZW1vdmVWYWx1ZXMoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlcik6IHZvaWQ7XG59XG5cbmZ1bmN0aW9uIHRvVWludDMyQXJyYXkoYXJyOiBudW1iZXJbXSk6IFVpbnQzMkFycmF5IHtcblx0Y29uc3QgbGVuID0gYXJyLmxlbmd0aDtcblx0Y29uc3QgciA9IG5ldyBVaW50MzJBcnJheShsZW4pO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0cltpXSA9IHRvVWludDMyKGFycltpXSk7XG5cdH1cblx0cmV0dXJuIHI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJvdGgodmFsdWVzOiBudW1iZXJbXSk6IElQcmVmaXhTdW1Db21wdXRlcltdIHtcblx0Y29uc3QgcHNjID0gbmV3IFByZWZpeFN1bUNvbXB1dGVyKHRvVWludDMyQXJyYXkodmFsdWVzKSk7XG5cdGNvbnN0IHdyYXBwZWQ6IElQcmVmaXhTdW1Db21wdXRlciA9IHtcblx0XHRnZXRUb3RhbFN1bTogKCkgPT4gcHNjLmdldFRvdGFsU3VtKCksXG5cdFx0Z2V0UHJlZml4U3VtOiAoY291bnQ6IG51bWJlcikgPT4gY291bnQgPT09IDAgPyAwIDogcHNjLmdldFByZWZpeFN1bShjb3VudCAtIDEpLFxuXHRcdGdldEluZGV4T2Y6IChzdW06IG51bWJlcikgPT4gcHNjLmdldEluZGV4T2Yoc3VtKSxcblx0XHRzZXRWYWx1ZTogKGluZGV4OiBudW1iZXIsIHZhbHVlOiBudW1iZXIpID0+IHsgcHNjLnNldFZhbHVlKGluZGV4LCB2YWx1ZSk7IH0sXG5cdFx0aW5zZXJ0VmFsdWVzOiAoaW5zZXJ0SW5kZXg6IG51bWJlciwgaW5zZXJ0QXJyOiBudW1iZXJbXSkgPT4geyBwc2MuaW5zZXJ0VmFsdWVzKGluc2VydEluZGV4LCB0b1VpbnQzMkFycmF5KGluc2VydEFycikpOyB9LFxuXHRcdHJlbW92ZVZhbHVlczogKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIpID0+IHsgcHNjLnJlbW92ZVZhbHVlcyhzdGFydCwgZGVsZXRlQ291bnQpOyB9LFxuXHR9O1xuXHRjb25zdCBjdCA9IG5ldyBDb25zdGFudFRpbWVQcmVmaXhTdW1Db21wdXRlcihbLi4udmFsdWVzXSk7XG5cdGNvbnN0IHdyYXBwZWRDdDogSVByZWZpeFN1bUNvbXB1dGVyID0ge1xuXHRcdGdldFRvdGFsU3VtOiAoKSA9PiBjdC5nZXRUb3RhbFN1bSgpLFxuXHRcdGdldFByZWZpeFN1bTogKGNvdW50OiBudW1iZXIpID0+IGN0LmdldFByZWZpeFN1bShjb3VudCksXG5cdFx0Z2V0SW5kZXhPZjogKHN1bTogbnVtYmVyKSA9PiBjdC5nZXRJbmRleE9mKHN1bSksXG5cdFx0c2V0VmFsdWU6IChpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKSA9PiB7IGN0LnNldFZhbHVlKGluZGV4LCB2YWx1ZSk7IH0sXG5cdFx0aW5zZXJ0VmFsdWVzOiAoaW5zZXJ0SW5kZXg6IG51bWJlciwgaW5zZXJ0QXJyOiBudW1iZXJbXSkgPT4geyBjdC5pbnNlcnRWYWx1ZXMoaW5zZXJ0SW5kZXgsIGluc2VydEFycik7IH0sXG5cdFx0cmVtb3ZlVmFsdWVzOiAoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlcikgPT4geyBjdC5yZW1vdmVWYWx1ZXMoc3RhcnQsIGRlbGV0ZUNvdW50KTsgfSxcblx0fTtcblx0cmV0dXJuIFt3cmFwcGVkLCB3cmFwcGVkQ3RdO1xufVxuXG5mdW5jdGlvbiBmb3JCb3RoKHZhbHVlczogbnVtYmVyW10sIGNhbGxiYWNrOiAocHNjOiBJUHJlZml4U3VtQ29tcHV0ZXIpID0+IHZvaWQpOiB2b2lkIHtcblx0Zm9yIChjb25zdCBwc2Mgb2YgY3JlYXRlQm90aCh2YWx1ZXMpKSB7XG5cdFx0Y2FsbGJhY2socHNjKTtcblx0fVxufVxuXG5zdWl0ZSgnRWRpdG9yIFZpZXdNb2RlbCAtIFByZWZpeFN1bUNvbXB1dGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbXByZWhlbnNpdmUgc2V0VmFsdWUgYW5kIGdldEluZGV4T2YnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMSwgMiwgMSwgM10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig2KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig3KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMikpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig4KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMykpO1xuXG5cdFx0XHQvLyBbMSwgMiwgMiwgMSwgM11cblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgOSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg1KSwgOSk7XG5cblx0XHRcdC8vIFsxLCAwLCAyLCAxLCAzXVxuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA3KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUpLCA3KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDMsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDIpKTtcblxuXHRcdFx0Ly8gWzEsIDAsIDAsIDEsIDNdXG5cdFx0XHRwc2Muc2V0VmFsdWUoMiwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoNCwgMikpO1xuXG5cdFx0XHQvLyBbMSwgMCwgMCwgMCwgM11cblx0XHRcdHBzYy5zZXRWYWx1ZSgzLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg1KSwgNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAyKSk7XG5cblx0XHRcdC8vIFsxLCAxLCAwLCAxLCAxXVxuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDEpO1xuXHRcdFx0cHNjLnNldFZhbHVlKDMsIDEpO1xuXHRcdFx0cHNjLnNldFZhbHVlKDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUpLCA0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDMsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDQsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIGdldFRvdGFsU3VtIC0tLVxuXG5cdHRlc3QoJ2dldFRvdGFsU3VtIHdpdGggdHlwaWNhbCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMSwgMiwgMSwgM10sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDgpKTtcblx0XHRmb3JCb3RoKFsxMF0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKSk7XG5cdFx0Zm9yQm90aChbNSwgNSwgNV0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDE1KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvdGFsU3VtIHdpdGggYWxsIHplcm9lcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFswLCAwLCAwXSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMCkpO1xuXHRcdGZvckJvdGgoWzBdLCBwc2MgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFRvdGFsU3VtIHdpdGggZW1wdHkgYXJyYXknLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbXSwgcHNjID0+IGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb3RhbFN1bSB3aXRoIHNpbmdsZSBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzBdLCBwc2MgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKSk7XG5cdFx0Zm9yQm90aChbMV0sIHBzYyA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEpKTtcblx0XHRmb3JCb3RoKFsxMDBdLCBwc2MgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxMDApKTtcblx0fSk7XG5cblx0Ly8gLS0tIGdldFByZWZpeFN1bSAtLS1cblxuXHR0ZXN0KCdnZXRQcmVmaXhTdW0gd2l0aCB0eXBpY2FsIHZhbHVlcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAyLCAxLCAzXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUpLCA4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UHJlZml4U3VtIHdpdGggYWxsIHplcm9lcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFswLCAwLCAwXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UHJlZml4U3VtIHdpdGggc2luZ2xlIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbN10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgNyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFByZWZpeFN1bSB3aXRoIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoW10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgwKSwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFByZWZpeFN1bSB3aXRoIGxlYWRpbmcvdHJhaWxpbmcgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDMsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNSksIDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gZ2V0SW5kZXhPZiAtLS1cblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggdHlwaWNhbCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMSwgMiwgMSwgM10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgzLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDYpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDcpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAyKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDgpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBhbGwgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggc2luZ2xlIHplcm8nLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMF0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBzaW5nbGUgZWxlbWVudCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFs1XSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0SW5kZXhPZiB3aXRoIGxlYWRpbmcgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDNdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggdHJhaWxpbmcgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzMsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggaW50ZXJsZWF2ZWQgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDEsIDAsIDIsIDBdLCBwc2MgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMywgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRJbmRleE9mIHdpdGggYWxsIG9uZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMSwgMSwgMSwgMV0sIHBzYyA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDU7IGkrKykge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKGkpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdChpLCAwKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEluZGV4T2Ygd2l0aCBsYXJnZSB2YWx1ZSBpbiBzaW5nbGUgZWxlbWVudCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxMDAwXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNTAwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgNTAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDk5OSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDk5OSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gc2V0VmFsdWUgLS0tXG5cblx0dGVzdCgnc2V0VmFsdWUgbm8tb3Agd2hlbiB2YWx1ZSB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDYpO1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA2KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgaW5jcmVhc2UnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgNCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig2KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBkZWNyZWFzZScsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCA1LCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIHRvIHplcm8nLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBmcm9tIHplcm8nLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMCwgMCwgMF0sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigyKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBvbiBmaXJzdCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDNdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnNldFZhbHVlKDAsIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoOSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIG9uIGxhc3QgZWxlbWVudCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgyLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCA5KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldCBhbGwgdmFsdWVzIHRvIHplcm8gdGhlbiByZXN0b3JlJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDNdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnNldFZhbHVlKDAsIDApO1xuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDApO1xuXHRcdFx0cHNjLnNldFZhbHVlKDIsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblxuXHRcdFx0cHNjLnNldFZhbHVlKDAsIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDMpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgbXVsdGlwbGUgdGltZXMgb24gc2FtZSBpbmRleCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAxXSwgcHNjID0+IHtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCA1KTtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAyKTtcblx0XHRcdHBzYy5zZXRWYWx1ZSgxLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCA5KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDExKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gaW5zZXJ0VmFsdWVzIC0tLVxuXG5cdHRlc3QoJ2luc2VydFZhbHVlcyBhdCBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMywgNF0sIHBzYyA9PiB7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDAsIFsxLCAyXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCAxMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFZhbHVlcyBhdCBlbmQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMl0sIHBzYyA9PiB7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDIsIFszLCA0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDQpLCAxMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFZhbHVlcyBpbiB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDRdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLmluc2VydFZhbHVlcygxLCBbMiwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSg0KSwgMTApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnRWYWx1ZXMgd2l0aCB6ZXJvZXMnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMl0sIHBzYyA9PiB7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDEsIFswLCAwXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMyksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oNCksIDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnRWYWx1ZXMgaW50byBhbGwtemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLmluc2VydFZhbHVlcygxLCBbMiwgM10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDIpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCA1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0VmFsdWVzIGludG8gZW1wdHkgY29tcHV0ZXInLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbXSwgcHNjID0+IHtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMCwgWzUsIDNdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgOCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCA0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSByZW1vdmVWYWx1ZXMgLS0tXG5cblx0dGVzdCgncmVtb3ZlVmFsdWVzIGZyb20gYmVnaW5uaW5nJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDMsIDRdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnJlbW92ZVZhbHVlcygwLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgNyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVZhbHVlcyBmcm9tIGVuZCcsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzLCA0XSwgcHNjID0+IHtcblx0XHRcdHBzYy5yZW1vdmVWYWx1ZXMoMiwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDMpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVWYWx1ZXMgZnJvbSB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzEsIDIsIDMsIDRdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnJlbW92ZVZhbHVlcygxLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgyKSwgNSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDEpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVZhbHVlcyBhbGwnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDAsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlVmFsdWVzIHNpbmdsZSBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzUsIDEwLCAxNV0sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDEsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAyMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDE5KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMTQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlVmFsdWVzIHplcm8tdmFsdWVkIGVsZW1lbnRzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgoWzAsIDAsIDUsIDAsIDBdLCBwc2MgPT4ge1xuXHRcdFx0cHNjLnJlbW92ZVZhbHVlcygwLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDQpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCA0KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBjb21iaW5lZCBvcGVyYXRpb25zIC0tLVxuXG5cdHRlc3QoJ2luc2VydCB0aGVuIHJlbW92ZScsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAyLCAzXSwgcHNjID0+IHtcblx0XHRcdHBzYy5pbnNlcnRWYWx1ZXMoMSwgWzEwLCAyMF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAzNik7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDEsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA2KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMyksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlIHRoZW4gaW5zZXJ0IGF0IHNhbWUgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMiwgM10sIHBzYyA9PiB7XG5cdFx0XHRwc2MucmVtb3ZlVmFsdWVzKDEsIDEpO1xuXHRcdFx0cHNjLmluc2VydFZhbHVlcygxLCBbNV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA5KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoNiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0VmFsdWUgdGhlbiBpbnNlcnQgdGhlbiByZW1vdmUnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMSwgMSwgMV0sIHBzYyA9PiB7XG5cdFx0XHRwc2Muc2V0VmFsdWUoMCwgNSk7XG5cdFx0XHRwc2MuaW5zZXJ0VmFsdWVzKDEsIFsxMF0pO1xuXHRcdFx0cHNjLnJlbW92ZVZhbHVlcygzLCAxKTtcblx0XHRcdC8vIFs1LCAxMCwgMV1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig0KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMCwgNCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZig1KSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMSwgMCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxNCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTUpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHF1ZXJpZXMgYmV0d2VlbiBtdXRhdGlvbnMgYXJlIGNvbnNpc3RlbnQnLCAoKSA9PiB7XG5cdFx0Zm9yQm90aChbMiwgMywgNV0sIHBzYyA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDEwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblxuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCA3KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDApKTtcblxuXHRcdFx0cHNjLnNldFZhbHVlKDEsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRUb3RhbFN1bSgpLCAxMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBlZGdlIGNhc2VzIC0tLVxuXG5cdHRlc3QoJ2xhcmdlIHZhbHVlcycsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxMDAsIDIwMCwgMzAwXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNjAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDEpLCAxMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBzYy5nZXRQcmVmaXhTdW0oMiksIDMwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bSgzKSwgNjAwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMCksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDAsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoOTkpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgwLCA5OSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgxLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDI5OSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDEsIDE5OSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigzMDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDU5OSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDIsIDI5OSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW55IGVsZW1lbnRzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgobmV3IEFycmF5KDEwMCkuZmlsbCgxKSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDUwKSwgNTApO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoaSksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KGksIDApKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFueSBlbGVtZW50cyBhbGwgemVyb2VzJywgKCkgPT4ge1xuXHRcdGZvckJvdGgobmV3IEFycmF5KDEwMCkuZmlsbCgwKSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8PSAxMDA7IGkrKykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFByZWZpeFN1bShpKSwgMCk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDApLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg5OSwgMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSBiZXR3ZWVuIHF1ZXJpZXMgcmUtdmFsaWRhdGVzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRmb3JCb3RoKFsxLCAxLCAxLCAxLCAxXSwgcHNjID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgNSk7XG5cblx0XHRcdHBzYy5zZXRWYWx1ZSgyLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHNjLmdldFRvdGFsU3VtKCksIDE0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0UHJlZml4U3VtKDMpLCAxMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDIpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCgyLCAwKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBzYy5nZXRJbmRleE9mKDExKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQoMiwgOSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigxMiksIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KDMsIDApKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHNjLmdldEluZGV4T2YoMTMpLCBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdCg0LCAwKSk7XG5cblx0XHRcdHBzYy5zZXRWYWx1ZSgwLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwc2MuZ2V0VG90YWxTdW0oKSwgMTMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwc2MuZ2V0SW5kZXhPZigwKSwgbmV3IFByZWZpeFN1bUluZGV4T2ZS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
