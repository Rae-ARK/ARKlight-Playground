import assert from "assert";
import * as arrays from "../../common/arrays.js";
import * as arraysFind from "../../common/arraysFind.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Arrays", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removeFastWithoutKeepingOrder", () => {
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    arrays.removeFastWithoutKeepingOrder(array, 1);
    assert.deepStrictEqual(array, [1, 69, 5, 7, 55, 59, 60, 61, 64]);
    arrays.removeFastWithoutKeepingOrder(array, 0);
    assert.deepStrictEqual(array, [64, 69, 5, 7, 55, 59, 60, 61]);
    arrays.removeFastWithoutKeepingOrder(array, 7);
    assert.deepStrictEqual(array, [64, 69, 5, 7, 55, 59, 60]);
  });
  test("findFirst", () => {
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    let idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 0);
    assert.strictEqual(array[idx], 1);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e > 1);
    assert.strictEqual(array[idx], 4);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 8);
    assert.strictEqual(array[idx], 55);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 61);
    assert.strictEqual(array[idx], 61);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 69);
    assert.strictEqual(array[idx], 69);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen(array, (e) => e >= 70);
    assert.strictEqual(idx, array.length);
    idx = arraysFind.findFirstIdxMonotonousOrArrLen([], (e) => e >= 0);
    assert.strictEqual(array[idx], 1);
  });
  test("quickSelect", () => {
    function assertMedian(expexted, data, nth = Math.floor(data.length / 2)) {
      const compare = (a, b) => a - b;
      const actual1 = arrays.quickSelect(nth, data, compare);
      assert.strictEqual(actual1, expexted);
      const actual2 = data.slice().sort(compare)[nth];
      assert.strictEqual(actual2, expexted);
    }
    assertMedian(5, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5]);
    assertMedian(8, [9, 1, 0, 2, 3, 4, 6, 8, 7, 10, 5], 8);
    assertMedian(8, [13, 4, 8]);
    assertMedian(4, [13, 4, 8, 4, 4]);
    assertMedian(13, [13, 4, 8], 2);
  });
  test("sortedDiff", () => {
    function compare(a, b) {
      return a - b;
    }
    let d = arrays.sortedDiff([1, 2, 4], [], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 3, toInsert: [] }
    ]);
    d = arrays.sortedDiff([], [1, 2, 4], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 0, toInsert: [1, 2, 4] }
    ]);
    d = arrays.sortedDiff([1, 2, 4], [1, 2, 4], compare);
    assert.deepStrictEqual(d, []);
    d = arrays.sortedDiff([1, 2, 4], [2, 3, 4, 5], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 1, toInsert: [] },
      { start: 2, deleteCount: 0, toInsert: [3] },
      { start: 3, deleteCount: 0, toInsert: [5] }
    ]);
    d = arrays.sortedDiff([2, 3, 4, 5], [1, 2, 4], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 0, toInsert: [1] },
      { start: 1, deleteCount: 1, toInsert: [] },
      { start: 3, deleteCount: 1, toInsert: [] }
    ]);
    d = arrays.sortedDiff([1, 3, 5, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 2, toInsert: [] },
      { start: 3, deleteCount: 1, toInsert: [9, 11] }
    ]);
    d = arrays.sortedDiff([1, 3, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d, [
      { start: 0, deleteCount: 3, toInsert: [5, 9, 11] }
    ]);
  });
  test("delta sorted arrays", function() {
    function compare(a, b) {
      return a - b;
    }
    let d = arrays.delta([1, 2, 4], [], compare);
    assert.deepStrictEqual(d.removed, [1, 2, 4]);
    assert.deepStrictEqual(d.added, []);
    d = arrays.delta([], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, []);
    assert.deepStrictEqual(d.added, [1, 2, 4]);
    d = arrays.delta([1, 2, 4], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, []);
    assert.deepStrictEqual(d.added, []);
    d = arrays.delta([1, 2, 4], [2, 3, 4, 5], compare);
    assert.deepStrictEqual(d.removed, [1]);
    assert.deepStrictEqual(d.added, [3, 5]);
    d = arrays.delta([2, 3, 4, 5], [1, 2, 4], compare);
    assert.deepStrictEqual(d.removed, [3, 5]);
    assert.deepStrictEqual(d.added, [1]);
    d = arrays.delta([1, 3, 5, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d.removed, [1, 3, 7]);
    assert.deepStrictEqual(d.added, [9, 11]);
    d = arrays.delta([1, 3, 7], [5, 9, 11], compare);
    assert.deepStrictEqual(d.removed, [1, 3, 7]);
    assert.deepStrictEqual(d.added, [5, 9, 11]);
  });
  test("binarySearch", () => {
    function compare(a, b) {
      return a - b;
    }
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    assert.strictEqual(arrays.binarySearch(array, 1, compare), 0);
    assert.strictEqual(arrays.binarySearch(array, 5, compare), 2);
    assert.strictEqual(arrays.binarySearch(array, 0, compare), ~0);
    assert.strictEqual(arrays.binarySearch(array, 6, compare), ~3);
    assert.strictEqual(arrays.binarySearch(array, 70, compare), ~10);
  });
  test("binarySearch2", () => {
    function compareTo(key) {
      return (index) => {
        return array[index] - key;
      };
    }
    const array = [1, 4, 5, 7, 55, 59, 60, 61, 64, 69];
    assert.strictEqual(arrays.binarySearch2(10, compareTo(1)), 0);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(5)), 2);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(0)), ~0);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(6)), ~3);
    assert.strictEqual(arrays.binarySearch2(10, compareTo(70)), ~10);
    assert.strictEqual(arrays.binarySearch2(2, compareTo(5)), ~2);
  });
  test("distinct", () => {
    function compare(a) {
      return a;
    }
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5"], compare), ["32", "4", "5"]);
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5", "4"], compare), ["32", "4", "5"]);
    assert.deepStrictEqual(arrays.distinct(["32", "constructor", "5", "1"], compare), ["32", "constructor", "5", "1"]);
    assert.deepStrictEqual(arrays.distinct(["32", "constructor", "proto", "proto", "constructor"], compare), ["32", "constructor", "proto"]);
    assert.deepStrictEqual(arrays.distinct(["32", "4", "5", "32", "4", "5", "32", "4", "5", "5"], compare), ["32", "4", "5"]);
  });
  test("top", () => {
    const cmp = (a, b) => {
      assert.strictEqual(typeof a, "number", "typeof a");
      assert.strictEqual(typeof b, "number", "typeof b");
      return a - b;
    };
    assert.deepStrictEqual(arrays.top([], cmp, 1), []);
    assert.deepStrictEqual(arrays.top([1], cmp, 0), []);
    assert.deepStrictEqual(arrays.top([1, 2], cmp, 1), [1]);
    assert.deepStrictEqual(arrays.top([2, 1], cmp, 1), [1]);
    assert.deepStrictEqual(arrays.top([1, 3, 2], cmp, 2), [1, 2]);
    assert.deepStrictEqual(arrays.top([3, 2, 1], cmp, 3), [1, 2, 3]);
    assert.deepStrictEqual(arrays.top([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3), [1, 2, 3]);
  });
  test("topAsync", async () => {
    const cmp = (a, b) => {
      assert.strictEqual(typeof a, "number", "typeof a");
      assert.strictEqual(typeof b, "number", "typeof b");
      return a - b;
    };
    await testTopAsync(cmp, 1);
    return testTopAsync(cmp, 2);
  });
  async function testTopAsync(cmp, m) {
    {
      const result = await arrays.topAsync([], cmp, 1, m);
      assert.deepStrictEqual(result, []);
    }
    {
      const result = await arrays.topAsync([1], cmp, 0, m);
      assert.deepStrictEqual(result, []);
    }
    {
      const result = await arrays.topAsync([1, 2], cmp, 1, m);
      assert.deepStrictEqual(result, [1]);
    }
    {
      const result = await arrays.topAsync([2, 1], cmp, 1, m);
      assert.deepStrictEqual(result, [1]);
    }
    {
      const result = await arrays.topAsync([1, 3, 2], cmp, 2, m);
      assert.deepStrictEqual(result, [1, 2]);
    }
    {
      const result = await arrays.topAsync([3, 2, 1], cmp, 3, m);
      assert.deepStrictEqual(result, [1, 2, 3]);
    }
    {
      const result = await arrays.topAsync([4, 6, 2, 7, 8, 3, 5, 1], cmp, 3, m);
      assert.deepStrictEqual(result, [1, 2, 3]);
    }
  }
  test("coalesce", () => {
    const a = arrays.coalesce([null, 1, null, 2, 3]);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    arrays.coalesce([null, 1, null, void 0, void 0, 2, 3]);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    let b = [];
    b[10] = 1;
    b[20] = 2;
    b[30] = 3;
    b = arrays.coalesce(b);
    assert.strictEqual(b.length, 3);
    assert.strictEqual(b[0], 1);
    assert.strictEqual(b[1], 2);
    assert.strictEqual(b[2], 3);
    let sparse = [];
    sparse[0] = 1;
    sparse[1] = 1;
    sparse[17] = 1;
    sparse[1e3] = 1;
    sparse[1001] = 1;
    assert.strictEqual(sparse.length, 1002);
    sparse = arrays.coalesce(sparse);
    assert.strictEqual(sparse.length, 5);
  });
  test("coalesce - inplace", function() {
    let a = [null, 1, null, 2, 3];
    arrays.coalesceInPlace(a);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    a = [null, 1, null, void 0, void 0, 2, 3];
    arrays.coalesceInPlace(a);
    assert.strictEqual(a.length, 3);
    assert.strictEqual(a[0], 1);
    assert.strictEqual(a[1], 2);
    assert.strictEqual(a[2], 3);
    const b = [];
    b[10] = 1;
    b[20] = 2;
    b[30] = 3;
    arrays.coalesceInPlace(b);
    assert.strictEqual(b.length, 3);
    assert.strictEqual(b[0], 1);
    assert.strictEqual(b[1], 2);
    assert.strictEqual(b[2], 3);
    const sparse = [];
    sparse[0] = 1;
    sparse[1] = 1;
    sparse[17] = 1;
    sparse[1e3] = 1;
    sparse[1001] = 1;
    assert.strictEqual(sparse.length, 1002);
    arrays.coalesceInPlace(sparse);
    assert.strictEqual(sparse.length, 5);
  });
  test("insert, remove", function() {
    const array = [];
    const remove = arrays.insert(array, "foo");
    assert.strictEqual(array[0], "foo");
    remove();
    assert.strictEqual(array.length, 0);
  });
  test("splice", function() {
    let array = [1, 2, 3, 4, 5];
    arrays.splice(array, -6, 3, [6, 7]);
    assert.strictEqual(array.length, 4);
    assert.strictEqual(array[0], 6);
    assert.strictEqual(array[1], 7);
    assert.strictEqual(array[2], 4);
    assert.strictEqual(array[3], 5);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, -3, 3, [6, 7]);
    assert.strictEqual(array.length, 4);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 6);
    assert.strictEqual(array[3], 7);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, 3, 3, [6, 7]);
    assert.strictEqual(array.length, 5);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 3);
    assert.strictEqual(array[3], 6);
    assert.strictEqual(array[4], 7);
    array = [1, 2, 3, 4, 5];
    arrays.splice(array, 6, 3, [6, 7]);
    assert.strictEqual(array.length, 7);
    assert.strictEqual(array[0], 1);
    assert.strictEqual(array[1], 2);
    assert.strictEqual(array[2], 3);
    assert.strictEqual(array[3], 4);
    assert.strictEqual(array[4], 5);
    assert.strictEqual(array[5], 6);
    assert.strictEqual(array[6], 7);
  });
  test("findMaxBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findFirstMax(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      1
    );
  });
  test("findLastMaxBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findLastMax(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      5
    );
  });
  test("findMinBy", () => {
    const array = [{ v: 3 }, { v: 5 }, { v: 2 }, { v: 2 }, { v: 2 }, { v: 5 }];
    assert.strictEqual(
      array.indexOf(arraysFind.findFirstMin(array, arrays.compareBy((v) => v.v, arrays.numberComparator))),
      2
    );
  });
  suite("ArrayQueue", () => {
    suite("takeWhile/takeFromEndWhile", () => {
      test("TakeWhile 1", () => {
        const queue1 = new arrays.ArrayQueue([9, 8, 1, 7, 6]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x > 5), [9, 8]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x < 7), [1]);
        assert.deepStrictEqual(queue1.takeWhile((x) => true), [7, 6]);
      });
      test("TakeFromEndWhile 1", () => {
        const queue1 = new arrays.ArrayQueue([9, 8, 1, 7, 6]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x > 5), [7, 6]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x < 2), [1]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => true), [9, 8]);
      });
      test("takeWhile and takeFromEndWhile mixed", () => {
        const queue1 = new arrays.ArrayQueue([1, 2, 3, 4, 5]);
        assert.deepStrictEqual(queue1.takeFromEndWhile((x) => x > 3), [4, 5]);
        assert.deepStrictEqual(queue1.takeWhile((x) => x > 0), [1, 2, 3]);
        const queue2 = new arrays.ArrayQueue([1, 2, 3, 4, 5]);
        assert.deepStrictEqual(queue2.takeWhile((x) => x < 3), [1, 2]);
        assert.deepStrictEqual(queue2.takeFromEndWhile((x) => x > 0), [3, 4, 5]);
      });
    });
    suite("takeWhile/takeFromEndWhile monotonous", () => {
      function testMonotonous(array3, predicate) {
        function normalize(arr) {
          if (arr.length === 0) {
            return null;
          }
          return arr;
        }
        const negatedPredicate = (a) => !predicate(a);
        {
          const queue1 = new arrays.ArrayQueue(array3);
          assert.deepStrictEqual(queue1.takeWhile(predicate), normalize(array3.filter(predicate)));
          assert.deepStrictEqual(queue1.length, array3.length - array3.filter(predicate).length);
          assert.deepStrictEqual(queue1.takeWhile(() => true), normalize(array3.filter(negatedPredicate)));
        }
        {
          const queue3 = new arrays.ArrayQueue(array3);
          assert.deepStrictEqual(queue3.takeFromEndWhile(negatedPredicate), normalize(array3.filter(negatedPredicate)));
          assert.deepStrictEqual(queue3.length, array3.length - array3.filter(negatedPredicate).length);
          assert.deepStrictEqual(queue3.takeFromEndWhile(() => true), normalize(array3.filter(predicate)));
        }
      }
      const array = [1, 1, 1, 2, 5, 5, 7, 8, 8];
      test("TakeWhile 1", () => testMonotonous(array, (value) => value <= 1));
      test("TakeWhile 2", () => testMonotonous(array, (value) => value < 5));
      test("TakeWhile 3", () => testMonotonous(array, (value) => value <= 5));
      test("TakeWhile 4", () => testMonotonous(array, (value) => true));
      test("TakeWhile 5", () => testMonotonous(array, (value) => false));
      const array2 = [1, 1, 1, 2, 5, 5, 7, 8, 8, 9, 9, 9, 9, 10, 10];
      test("TakeWhile 6", () => testMonotonous(array2, (value) => value < 10));
      test("TakeWhile 7", () => testMonotonous(array2, (value) => value < 7));
      test("TakeWhile 8", () => testMonotonous(array2, (value) => value < 5));
      test("TakeWhile Empty", () => testMonotonous([], (value) => value <= 5));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vYXJyYXlzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzRmluZCBmcm9tICcuLi8uLi9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0FycmF5cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZW1vdmVGYXN0V2l0aG91dEtlZXBpbmdPcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBhcnJheSA9IFsxLCA0LCA1LCA3LCA1NSwgNTksIDYwLCA2MSwgNjQsIDY5XTtcblx0XHRhcnJheXMucmVtb3ZlRmFzdFdpdGhvdXRLZWVwaW5nT3JkZXIoYXJyYXksIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXksIFsxLCA2OSwgNSwgNywgNTUsIDU5LCA2MCwgNjEsIDY0XSk7XG5cblx0XHRhcnJheXMucmVtb3ZlRmFzdFdpdGhvdXRLZWVwaW5nT3JkZXIoYXJyYXksIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXksIFs2NCwgNjksIDUsIDcsIDU1LCA1OSwgNjAsIDYxXSk7XG5cblx0XHRhcnJheXMucmVtb3ZlRmFzdFdpdGhvdXRLZWVwaW5nT3JkZXIoYXJyYXksIDcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXksIFs2NCwgNjksIDUsIDcsIDU1LCA1OSwgNjBdKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZEZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFycmF5ID0gWzEsIDQsIDUsIDcsIDU1LCA1OSwgNjAsIDYxLCA2NCwgNjldO1xuXG5cdFx0bGV0IGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGFycmF5LCBlID0+IGUgPj0gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5W2lkeF0sIDEpO1xuXG5cdFx0aWR4ID0gYXJyYXlzRmluZC5maW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oYXJyYXksIGUgPT4gZSA+IDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVtpZHhdLCA0KTtcblxuXHRcdGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGFycmF5LCBlID0+IGUgPj0gOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5W2lkeF0sIDU1KTtcblxuXHRcdGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKGFycmF5LCBlID0+IGUgPj0gNjEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVtpZHhdLCA2MSk7XG5cblx0XHRpZHggPSBhcnJheXNGaW5kLmZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihhcnJheSwgZSA9PiBlID49IDY5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbaWR4XSwgNjkpO1xuXG5cdFx0aWR4ID0gYXJyYXlzRmluZC5maW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4oYXJyYXksIGUgPT4gZSA+PSA3MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlkeCwgYXJyYXkubGVuZ3RoKTtcblxuXHRcdGlkeCA9IGFycmF5c0ZpbmQuZmluZEZpcnN0SWR4TW9ub3Rvbm91c09yQXJyTGVuKFtdLCBlID0+IGUgPj0gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5W2lkeF0sIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWlja1NlbGVjdCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydE1lZGlhbihleHBleHRlZDogbnVtYmVyLCBkYXRhOiBudW1iZXJbXSwgbnRoOiBudW1iZXIgPSBNYXRoLmZsb29yKGRhdGEubGVuZ3RoIC8gMikpIHtcblx0XHRcdGNvbnN0IGNvbXBhcmUgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgLSBiO1xuXHRcdFx0Y29uc3QgYWN0dWFsMSA9IGFycmF5cy5xdWlja1NlbGVjdChudGgsIGRhdGEsIGNvbXBhcmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEsIGV4cGV4dGVkKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsMiA9IGRhdGEuc2xpY2UoKS5zb3J0KGNvbXBhcmUpW250aF07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMiwgZXhwZXh0ZWQpO1xuXHRcdH1cblxuXHRcdGFzc2VydE1lZGlhbig1LCBbOSwgMSwgMCwgMiwgMywgNCwgNiwgOCwgNywgMTAsIDVdKTtcblx0XHRhc3NlcnRNZWRpYW4oOCwgWzksIDEsIDAsIDIsIDMsIDQsIDYsIDgsIDcsIDEwLCA1XSwgOCk7XG5cdFx0YXNzZXJ0TWVkaWFuKDgsIFsxMywgNCwgOF0pO1xuXHRcdGFzc2VydE1lZGlhbig0LCBbMTMsIDQsIDgsIDQsIDRdKTtcblx0XHRhc3NlcnRNZWRpYW4oMTMsIFsxMywgNCwgOF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0ZWREaWZmJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNvbXBhcmUoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIGEgLSBiO1xuXHRcdH1cblxuXHRcdGxldCBkID0gYXJyYXlzLnNvcnRlZERpZmYoWzEsIDIsIDRdLCBbXSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLCBbXG5cdFx0XHR7IHN0YXJ0OiAwLCBkZWxldGVDb3VudDogMywgdG9JbnNlcnQ6IFtdIH1cblx0XHRdKTtcblxuXHRcdGQgPSBhcnJheXMuc29ydGVkRGlmZihbXSwgWzEsIDIsIDRdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQsIFtcblx0XHRcdHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAwLCB0b0luc2VydDogWzEsIDIsIDRdIH1cblx0XHRdKTtcblxuXHRcdGQgPSBhcnJheXMuc29ydGVkRGlmZihbMSwgMiwgNF0sIFsxLCAyLCA0XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLCBbXSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoWzEsIDIsIDRdLCBbMiwgMywgNCwgNV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW1xuXHRcdFx0eyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDEsIHRvSW5zZXJ0OiBbXSB9LFxuXHRcdFx0eyBzdGFydDogMiwgZGVsZXRlQ291bnQ6IDAsIHRvSW5zZXJ0OiBbM10gfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGRlbGV0ZUNvdW50OiAwLCB0b0luc2VydDogWzVdIH0sXG5cdFx0XSk7XG5cblx0XHRkID0gYXJyYXlzLnNvcnRlZERpZmYoWzIsIDMsIDQsIDVdLCBbMSwgMiwgNF0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW1xuXHRcdFx0eyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDAsIHRvSW5zZXJ0OiBbMV0gfSxcblx0XHRcdHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiAxLCB0b0luc2VydDogW10gfSxcblx0XHRcdHsgc3RhcnQ6IDMsIGRlbGV0ZUNvdW50OiAxLCB0b0luc2VydDogW10gfSxcblx0XHRdKTtcblxuXHRcdGQgPSBhcnJheXMuc29ydGVkRGlmZihbMSwgMywgNSwgN10sIFs1LCA5LCAxMV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW1xuXHRcdFx0eyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDIsIHRvSW5zZXJ0OiBbXSB9LFxuXHRcdFx0eyBzdGFydDogMywgZGVsZXRlQ291bnQ6IDEsIHRvSW5zZXJ0OiBbOSwgMTFdIH1cblx0XHRdKTtcblxuXHRcdGQgPSBhcnJheXMuc29ydGVkRGlmZihbMSwgMywgN10sIFs1LCA5LCAxMV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZCwgW1xuXHRcdFx0eyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDMsIHRvSW5zZXJ0OiBbNSwgOSwgMTFdIH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsdGEgc29ydGVkIGFycmF5cycsIGZ1bmN0aW9uICgpIHtcblx0XHRmdW5jdGlvbiBjb21wYXJlKGE6IG51bWJlciwgYjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiBhIC0gYjtcblx0XHR9XG5cblx0XHRsZXQgZCA9IGFycmF5cy5kZWx0YShbMSwgMiwgNF0sIFtdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQucmVtb3ZlZCwgWzEsIDIsIDRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQuYWRkZWQsIFtdKTtcblxuXHRcdGQgPSBhcnJheXMuZGVsdGEoW10sIFsxLCAyLCA0XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQuYWRkZWQsIFsxLCAyLCA0XSk7XG5cblx0XHRkID0gYXJyYXlzLmRlbHRhKFsxLCAyLCA0XSwgWzEsIDIsIDRdLCBjb21wYXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGQucmVtb3ZlZCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5hZGRlZCwgW10pO1xuXG5cdFx0ZCA9IGFycmF5cy5kZWx0YShbMSwgMiwgNF0sIFsyLCAzLCA0LCA1XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFsxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLmFkZGVkLCBbMywgNV0pO1xuXG5cdFx0ZCA9IGFycmF5cy5kZWx0YShbMiwgMywgNCwgNV0sIFsxLCAyLCA0XSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFszLCA1XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLmFkZGVkLCBbMV0pO1xuXG5cdFx0ZCA9IGFycmF5cy5kZWx0YShbMSwgMywgNSwgN10sIFs1LCA5LCAxMV0sIGNvbXBhcmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5yZW1vdmVkLCBbMSwgMywgN10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZC5hZGRlZCwgWzksIDExXSk7XG5cblx0XHRkID0gYXJyYXlzLmRlbHRhKFsxLCAzLCA3XSwgWzUsIDksIDExXSwgY29tcGFyZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLnJlbW92ZWQsIFsxLCAzLCA3XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkLmFkZGVkLCBbNSwgOSwgMTFdKTtcblx0fSk7XG5cblx0dGVzdCgnYmluYXJ5U2VhcmNoJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNvbXBhcmUoYTogbnVtYmVyLCBiOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdFx0cmV0dXJuIGEgLSBiO1xuXHRcdH1cblx0XHRjb25zdCBhcnJheSA9IFsxLCA0LCA1LCA3LCA1NSwgNTksIDYwLCA2MSwgNjQsIDY5XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoKGFycmF5LCAxLCBjb21wYXJlKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2goYXJyYXksIDUsIGNvbXBhcmUpLCAyKTtcblxuXHRcdC8vIGluc2VydGlvbiBwb2ludFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoKGFycmF5LCAwLCBjb21wYXJlKSwgfjApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoKGFycmF5LCA2LCBjb21wYXJlKSwgfjMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheXMuYmluYXJ5U2VhcmNoKGFycmF5LCA3MCwgY29tcGFyZSksIH4xMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JpbmFyeVNlYXJjaDInLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY29tcGFyZVRvKGtleTogbnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gKGluZGV4OiBudW1iZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIGFycmF5W2luZGV4XSAtIGtleTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IGFycmF5ID0gWzEsIDQsIDUsIDcsIDU1LCA1OSwgNjAsIDYxLCA2NCwgNjldO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDEwLCBjb21wYXJlVG8oMSkpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaDIoMTAsIGNvbXBhcmVUbyg1KSksIDIpO1xuXG5cdFx0Ly8gaW5zZXJ0aW9uIHBvaW50XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDEwLCBjb21wYXJlVG8oMCkpLCB+MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDEwLCBjb21wYXJlVG8oNikpLCB+Myk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5cy5iaW5hcnlTZWFyY2gyKDEwLCBjb21wYXJlVG8oNzApKSwgfjEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlzLmJpbmFyeVNlYXJjaDIoMiwgY29tcGFyZVRvKDUpKSwgfjIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXN0aW5jdCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjb21wYXJlKGE6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gYTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5cy5kaXN0aW5jdChbJzMyJywgJzQnLCAnNSddLCBjb21wYXJlKSwgWyczMicsICc0JywgJzUnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMuZGlzdGluY3QoWyczMicsICc0JywgJzUnLCAnNCddLCBjb21wYXJlKSwgWyczMicsICc0JywgJzUnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMuZGlzdGluY3QoWyczMicsICdjb25zdHJ1Y3RvcicsICc1JywgJzEnXSwgY29tcGFyZSksIFsnMzInLCAnY29uc3RydWN0b3InLCAnNScsICcxJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLmRpc3RpbmN0KFsnMzInLCAnY29uc3RydWN0b3InLCAncHJvdG8nLCAncHJvdG8nLCAnY29uc3RydWN0b3InXSwgY29tcGFyZSksIFsnMzInLCAnY29uc3RydWN0b3InLCAncHJvdG8nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMuZGlzdGluY3QoWyczMicsICc0JywgJzUnLCAnMzInLCAnNCcsICc1JywgJzMyJywgJzQnLCAnNScsICc1J10sIGNvbXBhcmUpLCBbJzMyJywgJzQnLCAnNSddKTtcblx0fSk7XG5cblx0dGVzdCgndG9wJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNtcCA9IChhOiBudW1iZXIsIGI6IG51bWJlcikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBhLCAnbnVtYmVyJywgJ3R5cGVvZiBhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGIsICdudW1iZXInLCAndHlwZW9mIGInKTtcblx0XHRcdHJldHVybiBhIC0gYjtcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMudG9wKFtdLCBjbXAsIDEpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMudG9wKFsxXSwgY21wLCAwKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbMSwgMl0sIGNtcCwgMSksIFsxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMudG9wKFsyLCAxXSwgY21wLCAxKSwgWzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFycmF5cy50b3AoWzEsIDMsIDJdLCBjbXAsIDIpLCBbMSwgMl0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXJyYXlzLnRvcChbMywgMiwgMV0sIGNtcCwgMyksIFsxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcnJheXMudG9wKFs0LCA2LCAyLCA3LCA4LCAzLCA1LCAxXSwgY21wLCAzKSwgWzEsIDIsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgndG9wQXN5bmMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY21wID0gKGE6IG51bWJlciwgYjogbnVtYmVyKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGEsICdudW1iZXInLCAndHlwZW9mIGEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYiwgJ251bWJlcicsICd0eXBlb2YgYicpO1xuXHRcdFx0cmV0dXJuIGEgLSBiO1xuXHRcdH07XG5cblx0XHRhd2FpdCB0ZXN0VG9wQXN5bmMoY21wLCAxKTtcblx0XHRyZXR1cm4gdGVzdFRvcEFzeW5jKGNtcCwgMik7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHRlc3RUb3BBc3luYyhjbXA6IGFueSwgbTogbnVtYmVyKSB7XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXJyYXlzLnRvcEFzeW5jKFtdLCBjbXAsIDEsIG0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXJyYXlzLnRvcEFzeW5jKFsxXSwgY21wLCAwLCBtKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbMSwgMl0sIGNtcCwgMSwgbSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzFdKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXJyYXlzLnRvcEFzeW5jKFsyLCAxXSwgY21wLCAxLCBtKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMV0pO1xuXHRcdH1cblx0XHR7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhcnJheXMudG9wQXN5bmMoWzEsIDMsIDJdLCBjbXAsIDIsIG0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyXSk7XG5cdFx0fVxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFycmF5cy50b3BBc3luYyhbMywgMiwgMV0sIGNtcCwgMywgbSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXJyYXlzLnRvcEFzeW5jKFs0LCA2LCAyLCA3LCA4LCAzLCA1LCAxXSwgY21wLCAzLCBtKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgM10pO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2NvYWxlc2NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGE6IEFycmF5PG51bWJlciB8IG51bGw+ID0gYXJyYXlzLmNvYWxlc2NlKFtudWxsLCAxLCBudWxsLCAyLCAzXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzJdLCAzKTtcblxuXHRcdGFycmF5cy5jb2FsZXNjZShbbnVsbCwgMSwgbnVsbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIDIsIDNdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMl0sIDMpO1xuXG5cdFx0bGV0IGI6IG51bWJlcltdID0gW107XG5cdFx0YlsxMF0gPSAxO1xuXHRcdGJbMjBdID0gMjtcblx0XHRiWzMwXSA9IDM7XG5cdFx0YiA9IGFycmF5cy5jb2FsZXNjZShiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYlsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJbMl0sIDMpO1xuXG5cdFx0bGV0IHNwYXJzZTogbnVtYmVyW10gPSBbXTtcblx0XHRzcGFyc2VbMF0gPSAxO1xuXHRcdHNwYXJzZVsxXSA9IDE7XG5cdFx0c3BhcnNlWzE3XSA9IDE7XG5cdFx0c3BhcnNlWzEwMDBdID0gMTtcblx0XHRzcGFyc2VbMTAwMV0gPSAxO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYXJzZS5sZW5ndGgsIDEwMDIpO1xuXG5cdFx0c3BhcnNlID0gYXJyYXlzLmNvYWxlc2NlKHNwYXJzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYXJzZS5sZW5ndGgsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2FsZXNjZSAtIGlucGxhY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGE6IEFycmF5PG51bWJlciB8IG51bGw+ID0gW251bGwsIDEsIG51bGwsIDIsIDNdO1xuXHRcdGFycmF5cy5jb2FsZXNjZUluUGxhY2UoYSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMV0sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzJdLCAzKTtcblxuXHRcdGEgPSBbbnVsbCwgMSwgbnVsbCwgdW5kZWZpbmVkISwgdW5kZWZpbmVkISwgMiwgM107XG5cdFx0YXJyYXlzLmNvYWxlc2NlSW5QbGFjZShhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYVsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFbMl0sIDMpO1xuXG5cdFx0Y29uc3QgYjogbnVtYmVyW10gPSBbXTtcblx0XHRiWzEwXSA9IDE7XG5cdFx0YlsyMF0gPSAyO1xuXHRcdGJbMzBdID0gMztcblx0XHRhcnJheXMuY29hbGVzY2VJblBsYWNlKGIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiWzFdLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYlsyXSwgMyk7XG5cblx0XHRjb25zdCBzcGFyc2U6IG51bWJlcltdID0gW107XG5cdFx0c3BhcnNlWzBdID0gMTtcblx0XHRzcGFyc2VbMV0gPSAxO1xuXHRcdHNwYXJzZVsxN10gPSAxO1xuXHRcdHNwYXJzZVsxMDAwXSA9IDE7XG5cdFx0c3BhcnNlWzEwMDFdID0gMTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGFyc2UubGVuZ3RoLCAxMDAyKTtcblxuXHRcdGFycmF5cy5jb2FsZXNjZUluUGxhY2Uoc3BhcnNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BhcnNlLmxlbmd0aCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCwgcmVtb3ZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGFycmF5OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJlbW92ZSA9IGFycmF5cy5pbnNlcnQoYXJyYXksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMF0sICdmb28nKTtcblxuXHRcdHJlbW92ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gbmVnYXRpdmUgc3RhcnQgaW5kZXgsIGFic29sdXRlIHZhbHVlIGdyZWF0ZXIgdGhhbiB0aGUgbGVuZ3RoXG5cdFx0bGV0IGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdO1xuXHRcdGFycmF5cy5zcGxpY2UoYXJyYXksIC02LCAzLCBbNiwgN10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheS5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVswXSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzFdLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMl0sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVszXSwgNSk7XG5cblx0XHQvLyBuZWdhdGl2ZSBzdGFydCBpbmRleCwgYWJzb2x1dGUgdmFsdWUgbGVzcyB0aGFuIHRoZSBsZW5ndGhcblx0XHRhcnJheSA9IFsxLCAyLCAzLCA0LCA1XTtcblx0XHRhcnJheXMuc3BsaWNlKGFycmF5LCAtMywgMywgWzYsIDddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzJdLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbM10sIDcpO1xuXG5cdFx0Ly8gU3RhcnQgaW5kZXggbGVzcyB0aGFuIHRoZSBsZW5ndGhcblx0XHRhcnJheSA9IFsxLCAyLCAzLCA0LCA1XTtcblx0XHRhcnJheXMuc3BsaWNlKGFycmF5LCAzLCAzLCBbNiwgN10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheS5sZW5ndGgsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVswXSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzFdLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMl0sIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVszXSwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzRdLCA3KTtcblxuXHRcdC8vIFN0YXJ0IGluZGV4IGdyZWF0ZXIgdGhhbiB0aGUgbGVuZ3RoXG5cdFx0YXJyYXkgPSBbMSwgMiwgMywgNCwgNV07XG5cdFx0YXJyYXlzLnNwbGljZShhcnJheSwgNiwgMywgWzYsIDddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXkubGVuZ3RoLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbMF0sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVsxXSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzJdLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbM10sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcnJheVs0XSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5WzVdLCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXJyYXlbNl0sIDcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTWF4QnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXJyYXkgPSBbeyB2OiAzIH0sIHsgdjogNSB9LCB7IHY6IDIgfSwgeyB2OiAyIH0sIHsgdjogMiB9LCB7IHY6IDUgfV07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhcnJheS5pbmRleE9mKGFycmF5c0ZpbmQuZmluZEZpcnN0TWF4KGFycmF5LCBhcnJheXMuY29tcGFyZUJ5KHYgPT4gdi52LCBhcnJheXMubnVtYmVyQ29tcGFyYXRvcikpISksXG5cdFx0XHQxXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmluZExhc3RNYXhCeScsICgpID0+IHtcblx0XHRjb25zdCBhcnJheSA9IFt7IHY6IDMgfSwgeyB2OiA1IH0sIHsgdjogMiB9LCB7IHY6IDIgfSwgeyB2OiAyIH0sIHsgdjogNSB9XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFycmF5LmluZGV4T2YoYXJyYXlzRmluZC5maW5kTGFzdE1heChhcnJheSwgYXJyYXlzLmNvbXBhcmVCeSh2ID0+IHYudiwgYXJyYXlzLm51bWJlckNvbXBhcmF0b3IpKSEpLFxuXHRcdFx0NVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRNaW5CeScsICgpID0+IHtcblx0XHRjb25zdCBhcnJheSA9IFt7IHY6IDMgfSwgeyB2OiA1IH0sIHsgdjogMiB9LCB7IHY6IDIgfSwgeyB2OiAyIH0sIHsgdjogNSB9XTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFycmF5LmluZGV4T2YoYXJyYXlzRmluZC5maW5kRmlyc3RNaW4oYXJyYXksIGFycmF5cy5jb21wYXJlQnkodiA9PiB2LnYsIGFycmF5cy5udW1iZXJDb21wYXJhdG9yKSkhKSxcblx0XHRcdDJcblx0XHQpO1xuXHR9KTtcblxuXG5cblx0c3VpdGUoJ0FycmF5UXVldWUnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ3Rha2VXaGlsZS90YWtlRnJvbUVuZFdoaWxlJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDEnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1ZXVlMSA9IG5ldyBhcnJheXMuQXJyYXlRdWV1ZShbOSwgOCwgMSwgNywgNl0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlV2hpbGUoeCA9PiB4ID4gNSksIFs5LCA4XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VXaGlsZSh4ID0+IHggPCA3KSwgWzFdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZVdoaWxlKHggPT4gdHJ1ZSksIFs3LCA2XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnVGFrZUZyb21FbmRXaGlsZSAxJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWV1ZTEgPSBuZXcgYXJyYXlzLkFycmF5UXVldWUoWzksIDgsIDEsIDcsIDZdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZUZyb21FbmRXaGlsZSh4ID0+IHggPiA1KSwgWzcsIDZdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZUZyb21FbmRXaGlsZSh4ID0+IHggPCAyKSwgWzFdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEudGFrZUZyb21FbmRXaGlsZSh4ID0+IHRydWUpLCBbOSwgOF0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Rha2VXaGlsZSBhbmQgdGFrZUZyb21FbmRXaGlsZSBtaXhlZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVldWUxID0gbmV3IGFycmF5cy5BcnJheVF1ZXVlKFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VGcm9tRW5kV2hpbGUoeCA9PiB4ID4gMyksIFs0LCA1XSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VXaGlsZSh4ID0+IHggPiAwKSwgWzEsIDIsIDNdKTtcblxuXHRcdFx0XHRjb25zdCBxdWV1ZTIgPSBuZXcgYXJyYXlzLkFycmF5UXVldWUoWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTIudGFrZVdoaWxlKHggPT4geCA8IDMpLCBbMSwgMl0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMi50YWtlRnJvbUVuZFdoaWxlKHggPT4geCA+IDApLCBbMywgNCwgNV0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgndGFrZVdoaWxlL3Rha2VGcm9tRW5kV2hpbGUgbW9ub3Rvbm91cycsICgpID0+IHtcblx0XHRcdGZ1bmN0aW9uIHRlc3RNb25vdG9ub3VzKGFycmF5OiBudW1iZXJbXSwgcHJlZGljYXRlOiAoYTogbnVtYmVyKSA9PiBib29sZWFuKSB7XG5cdFx0XHRcdGZ1bmN0aW9uIG5vcm1hbGl6ZShhcnI6IG51bWJlcltdKTogbnVtYmVyW10gfCBudWxsIHtcblx0XHRcdFx0XHRpZiAoYXJyLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhcnI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZWdhdGVkUHJlZGljYXRlID0gKGE6IG51bWJlcikgPT4gIXByZWRpY2F0ZShhKTtcblxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29uc3QgcXVldWUxID0gbmV3IGFycmF5cy5BcnJheVF1ZXVlKGFycmF5KTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMS50YWtlV2hpbGUocHJlZGljYXRlKSwgbm9ybWFsaXplKGFycmF5LmZpbHRlcihwcmVkaWNhdGUpKSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWV1ZTEubGVuZ3RoLCBhcnJheS5sZW5ndGggLSBhcnJheS5maWx0ZXIocHJlZGljYXRlKS5sZW5ndGgpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUxLnRha2VXaGlsZSgoKSA9PiB0cnVlKSwgbm9ybWFsaXplKGFycmF5LmZpbHRlcihuZWdhdGVkUHJlZGljYXRlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdCBxdWV1ZTMgPSBuZXcgYXJyYXlzLkFycmF5UXVldWUoYXJyYXkpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUzLnRha2VGcm9tRW5kV2hpbGUobmVnYXRlZFByZWRpY2F0ZSksIG5vcm1hbGl6ZShhcnJheS5maWx0ZXIobmVnYXRlZFByZWRpY2F0ZSkpKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXVlMy5sZW5ndGgsIGFycmF5Lmxlbmd0aCAtIGFycmF5LmZpbHRlcihuZWdhdGVkUHJlZGljYXRlKS5sZW5ndGgpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVldWUzLnRha2VGcm9tRW5kV2hpbGUoKCkgPT4gdHJ1ZSksIG5vcm1hbGl6ZShhcnJheS5maWx0ZXIocHJlZGljYXRlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFycmF5ID0gWzEsIDEsIDEsIDIsIDUsIDUsIDcsIDgsIDhdO1xuXG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgMScsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5LCB2YWx1ZSA9PiB2YWx1ZSA8PSAxKSk7XG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgMicsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5LCB2YWx1ZSA9PiB2YWx1ZSA8IDUpKTtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSAzJywgKCkgPT4gdGVzdE1vbm90b25vdXMoYXJyYXksIHZhbHVlID0+IHZhbHVlIDw9IDUpKTtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSA0JywgKCkgPT4gdGVzdE1vbm90b25vdXMoYXJyYXksIHZhbHVlID0+IHRydWUpKTtcblx0XHRcdHRlc3QoJ1Rha2VXaGlsZSA1JywgKCkgPT4gdGVzdE1vbm90b25vdXMoYXJyYXksIHZhbHVlID0+IGZhbHNlKSk7XG5cblx0XHRcdGNvbnN0IGFycmF5MiA9IFsxLCAxLCAxLCAyLCA1LCA1LCA3LCA4LCA4LCA5LCA5LCA5LCA5LCAxMCwgMTBdO1xuXG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgNicsICgpID0+IHRlc3RNb25vdG9ub3VzKGFycmF5MiwgdmFsdWUgPT4gdmFsdWUgPCAxMCkpO1xuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDcnLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhhcnJheTIsIHZhbHVlID0+IHZhbHVlIDwgNykpO1xuXHRcdFx0dGVzdCgnVGFrZVdoaWxlIDgnLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhhcnJheTIsIHZhbHVlID0+IHZhbHVlIDwgNSkpO1xuXG5cdFx0XHR0ZXN0KCdUYWtlV2hpbGUgRW1wdHknLCAoKSA9PiB0ZXN0TW9ub3Rvbm91cyhbXSwgdmFsdWUgPT4gdmFsdWUgPD0gNSkpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFlBQVksWUFBWTtBQUN4QixZQUFZLGdCQUFnQjtBQUM1QixTQUFTLCtDQUErQztBQUV4RCxNQUFNLFVBQVUsTUFBTTtBQUVyQiwwQ0FBd0M7QUFFeEMsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxVQUFNLFFBQVEsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxFQUFFO0FBQ2pELFdBQU8sOEJBQThCLE9BQU8sQ0FBQztBQUM3QyxXQUFPLGdCQUFnQixPQUFPLENBQUMsR0FBRyxJQUFJLEdBQUcsR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUUsQ0FBQztBQUUvRCxXQUFPLDhCQUE4QixPQUFPLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLElBQUksSUFBSSxHQUFHLEdBQUcsSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDO0FBRTVELFdBQU8sOEJBQThCLE9BQU8sQ0FBQztBQUM3QyxXQUFPLGdCQUFnQixPQUFPLENBQUMsSUFBSSxJQUFJLEdBQUcsR0FBRyxJQUFJLElBQUksRUFBRSxDQUFDO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssYUFBYSxNQUFNO0FBQ3ZCLFVBQU0sUUFBUSxDQUFDLEdBQUcsR0FBRyxHQUFHLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7QUFFakQsUUFBSSxNQUFNLFdBQVcsK0JBQStCLE9BQU8sT0FBSyxLQUFLLENBQUM7QUFDdEUsV0FBTyxZQUFZLE1BQU0sR0FBRyxHQUFHLENBQUM7QUFFaEMsVUFBTSxXQUFXLCtCQUErQixPQUFPLE9BQUssSUFBSSxDQUFDO0FBQ2pFLFdBQU8sWUFBWSxNQUFNLEdBQUcsR0FBRyxDQUFDO0FBRWhDLFVBQU0sV0FBVywrQkFBK0IsT0FBTyxPQUFLLEtBQUss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
