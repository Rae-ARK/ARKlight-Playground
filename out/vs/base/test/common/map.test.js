import assert from "assert";
import { BidirectionalMap, LinkedMap, LRUCache, mapsStrictEqualIgnoreOrder, MRUCache, NKeyMap, ResourceMap, SetMap, Touch } from "../../common/map.js";
import { extUriIgnorePathCase } from "../../common/resources.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Map", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("LinkedMap - Simple", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    assert.deepStrictEqual([...map.keys()], ["ak", "bk"]);
    assert.deepStrictEqual([...map.values()], ["av", "bv"]);
    assert.strictEqual(map.first, "av");
    assert.strictEqual(map.last, "bv");
  });
  test("LinkedMap - Touch Old one", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("ak", "av", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["ak"]);
    assert.deepStrictEqual([...map.values()], ["av"]);
  });
  test("LinkedMap - Touch New one", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("ak", "av", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["ak"]);
    assert.deepStrictEqual([...map.values()], ["av"]);
  });
  test("LinkedMap - Touch Old two", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("bk", "bv", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av"]);
  });
  test("LinkedMap - Touch New two", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ak", "av", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av"]);
  });
  test("LinkedMap - Touch Old from middle", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    map.set("bk", "bv", Touch.AsOld);
    assert.deepStrictEqual([...map.keys()], ["bk", "ak", "ck"]);
    assert.deepStrictEqual([...map.values()], ["bv", "av", "cv"]);
  });
  test("LinkedMap - Touch New from middle", () => {
    const map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    map.set("bk", "bv", Touch.AsNew);
    assert.deepStrictEqual([...map.keys()], ["ak", "ck", "bk"]);
    assert.deepStrictEqual([...map.values()], ["av", "cv", "bv"]);
  });
  test("LinkedMap - basics", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", "2");
    map.set("3", true);
    const obj = /* @__PURE__ */ Object.create(null);
    map.set("4", obj);
    const date = Date.now();
    map.set("5", date);
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.get("2"), "2");
    assert.strictEqual(map.get("3"), true);
    assert.strictEqual(map.get("4"), obj);
    assert.strictEqual(map.get("5"), date);
    assert.ok(!map.get("6"));
    map.delete("6");
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.delete("1"), true);
    assert.strictEqual(map.delete("2"), true);
    assert.strictEqual(map.delete("3"), true);
    assert.strictEqual(map.delete("4"), true);
    assert.strictEqual(map.delete("5"), true);
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get("5"));
    assert.ok(!map.get("4"));
    assert.ok(!map.get("3"));
    assert.ok(!map.get("2"));
    assert.ok(!map.get("1"));
    map.set("1", 1);
    map.set("2", "2");
    map.set("3", true);
    assert.ok(map.has("1"));
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.get("2"), "2");
    assert.strictEqual(map.get("3"), true);
    map.clear();
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get("1"));
    assert.ok(!map.get("2"));
    assert.ok(!map.get("3"));
    assert.ok(!map.has("1"));
  });
  test("LinkedMap - Iterators", () => {
    const map = new LinkedMap();
    map.set(1, 1);
    map.set(2, 2);
    map.set(3, 3);
    for (const elem of map.keys()) {
      assert.ok(elem);
    }
    for (const elem of map.values()) {
      assert.ok(elem);
    }
    for (const elem of map.entries()) {
      assert.ok(elem);
    }
    {
      const keys = map.keys();
      const values = map.values();
      const entries = map.entries();
      map.get(1);
      keys.next();
      values.next();
      entries.next();
    }
    {
      const keys = map.keys();
      const values = map.values();
      const entries = map.entries();
      map.get(1, Touch.AsNew);
      let exceptions = 0;
      try {
        keys.next();
      } catch (err) {
        exceptions++;
      }
      try {
        values.next();
      } catch (err) {
        exceptions++;
      }
      try {
        entries.next();
      } catch (err) {
        exceptions++;
      }
      assert.strictEqual(exceptions, 3);
    }
  });
  test("LinkedMap - LRU Cache simple", () => {
    const cache = new LRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    cache.set(6, 6);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [2, 3, 4, 5, 6]);
    cache.set(7, 7);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [3, 4, 5, 6, 7]);
    const values = [];
    [3, 4, 5, 6, 7].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [3, 4, 5, 6, 7]);
  });
  test("LinkedMap - LRU Cache get", () => {
    const cache = new LRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 5]);
    cache.get(3);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    cache.peek(4);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    const values = [];
    [1, 2, 3, 4, 5].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
  });
  test("LinkedMap - LRU Cache limit", () => {
    const cache = new LRUCache(10);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.limit = 5;
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [6, 7, 8, 9, 10]);
    cache.limit = 20;
    assert.strictEqual(cache.size, 5);
    for (let i = 11; i <= 20; i++) {
      cache.set(i, i);
    }
    assert.deepStrictEqual(cache.size, 15);
    const values = [];
    for (let i = 6; i <= 20; i++) {
      values.push(cache.get(i));
      assert.strictEqual(cache.get(i), i);
    }
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - LRU Cache limit with ratio", () => {
    const cache = new LRUCache(10, 0.5);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.set(11, 11);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [7, 8, 9, 10, 11]);
    const values = [];
    [...cache.keys()].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [7, 8, 9, 10, 11]);
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - MRU Cache simple", () => {
    const cache = new MRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    cache.set(6, 6);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 6]);
    cache.set(7, 7);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 7]);
    const values = [];
    [1, 2, 3, 4, 7].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 7]);
  });
  test("LinkedMap - MRU Cache get", () => {
    const cache = new MRUCache(5);
    [1, 2, 3, 4, 5].forEach((value) => cache.set(value, value));
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 5]);
    cache.get(3);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    cache.peek(4);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 4, 5, 3]);
    const values = [];
    [1, 2, 3, 4, 5].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 5]);
  });
  test("LinkedMap - MRU Cache limit with ratio", () => {
    const cache = new MRUCache(10, 0.5);
    for (let i = 1; i <= 10; i++) {
      cache.set(i, i);
    }
    assert.strictEqual(cache.size, 10);
    cache.set(11, 11);
    assert.strictEqual(cache.size, 5);
    assert.deepStrictEqual([...cache.keys()], [1, 2, 3, 4, 11]);
    const values = [];
    [...cache.keys()].forEach((key) => values.push(cache.get(key)));
    assert.deepStrictEqual(values, [1, 2, 3, 4, 11]);
    assert.deepStrictEqual([...cache.values()], values);
  });
  test("LinkedMap - toJSON / fromJSON", () => {
    let map = new LinkedMap();
    map.set("ak", "av");
    map.set("bk", "bv");
    map.set("ck", "cv");
    const json = map.toJSON();
    map = new LinkedMap();
    map.fromJSON(json);
    let i = 0;
    map.forEach((value, key) => {
      if (i === 0) {
        assert.strictEqual(key, "ak");
        assert.strictEqual(value, "av");
      } else if (i === 1) {
        assert.strictEqual(key, "bk");
        assert.strictEqual(value, "bv");
      } else if (i === 2) {
        assert.strictEqual(key, "ck");
        assert.strictEqual(value, "cv");
      }
      i++;
    });
  });
  test("LinkedMap - delete Head and Tail", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    assert.strictEqual(map.size, 1);
    map.delete("1");
    assert.strictEqual(map.get("1"), void 0);
    assert.strictEqual(map.size, 0);
    assert.strictEqual([...map.keys()].length, 0);
  });
  test("LinkedMap - delete Head", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", 2);
    assert.strictEqual(map.size, 2);
    map.delete("1");
    assert.strictEqual(map.get("2"), 2);
    assert.strictEqual(map.size, 1);
    assert.strictEqual([...map.keys()].length, 1);
    assert.strictEqual([...map.keys()][0], "2");
  });
  test("LinkedMap - delete Tail", function() {
    const map = new LinkedMap();
    assert.strictEqual(map.size, 0);
    map.set("1", 1);
    map.set("2", 2);
    assert.strictEqual(map.size, 2);
    map.delete("2");
    assert.strictEqual(map.get("1"), 1);
    assert.strictEqual(map.size, 1);
    assert.strictEqual([...map.keys()].length, 1);
    assert.strictEqual([...map.keys()][0], "1");
  });
  test("ResourceMap - basics", function() {
    const map = new ResourceMap();
    const resource1 = URI.parse("some://1");
    const resource2 = URI.parse("some://2");
    const resource3 = URI.parse("some://3");
    const resource4 = URI.parse("some://4");
    const resource5 = URI.parse("some://5");
    const resource6 = URI.parse("some://6");
    assert.strictEqual(map.size, 0);
    const res = map.set(resource1, 1);
    assert.ok(res === map);
    map.set(resource2, "2");
    map.set(resource3, true);
    const values = [...map.values()];
    assert.strictEqual(values[0], 1);
    assert.strictEqual(values[1], "2");
    assert.strictEqual(values[2], true);
    let counter = 0;
    map.forEach((value, key, mapObj) => {
      assert.strictEqual(value, values[counter++]);
      assert.ok(URI.isUri(key));
      assert.ok(map === mapObj);
    });
    const obj = /* @__PURE__ */ Object.create(null);
    map.set(resource4, obj);
    const date = Date.now();
    map.set(resource5, date);
    assert.strictEqual(map.size, 5);
    assert.strictEqual(map.get(resource1), 1);
    assert.strictEqual(map.get(resource2), "2");
    assert.strictEqual(map.get(resource3), true);
    assert.strictEqual(map.get(resource4), obj);
    assert.strictEqual(map.get(resource5), date);
    assert.ok(!map.get(resource6));
    map.delete(resource6);
    assert.strictEqual(map.size, 5);
    assert.ok(map.delete(resource1));
    assert.ok(map.delete(resource2));
    assert.ok(map.delete(resource3));
    assert.ok(map.delete(resource4));
    assert.ok(map.delete(resource5));
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get(resource5));
    assert.ok(!map.get(resource4));
    assert.ok(!map.get(resource3));
    assert.ok(!map.get(resource2));
    assert.ok(!map.get(resource1));
    map.set(resource1, 1);
    map.set(resource2, "2");
    map.set(resource3, true);
    assert.ok(map.has(resource1));
    assert.strictEqual(map.get(resource1), 1);
    assert.strictEqual(map.get(resource2), "2");
    assert.strictEqual(map.get(resource3), true);
    map.clear();
    assert.strictEqual(map.size, 0);
    assert.ok(!map.get(resource1));
    assert.ok(!map.get(resource2));
    assert.ok(!map.get(resource3));
    assert.ok(!map.has(resource1));
    map.set(resource1, false);
    map.set(resource2, 0);
    assert.ok(map.has(resource1));
    assert.ok(map.has(resource2));
  });
  test("ResourceMap - files (do NOT ignorecase)", function() {
    const map = new ResourceMap();
    const fileA = URI.parse("file://some/filea");
    const fileB = URI.parse("some://some/other/fileb");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, "true");
    assert.strictEqual(map.get(fileA), "true");
    assert.ok(!map.get(fileAUpper));
    assert.ok(!map.get(fileB));
    map.set(fileAUpper, "false");
    assert.strictEqual(map.get(fileAUpper), "false");
    assert.strictEqual(map.get(fileA), "true");
    const windowsFile = URI.file("c:\\test with %25\\c#code");
    const uncFile = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
    map.set(windowsFile, "true");
    map.set(uncFile, "true");
    assert.strictEqual(map.get(windowsFile), "true");
    assert.strictEqual(map.get(uncFile), "true");
  });
  test("ResourceMap - files (ignorecase)", function() {
    const map = new ResourceMap((uri) => extUriIgnorePathCase.getComparisonKey(uri));
    const fileA = URI.parse("file://some/filea");
    const fileB = URI.parse("some://some/other/fileb");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, "true");
    assert.strictEqual(map.get(fileA), "true");
    assert.strictEqual(map.get(fileAUpper), "true");
    assert.ok(!map.get(fileB));
    map.set(fileAUpper, "false");
    assert.strictEqual(map.get(fileAUpper), "false");
    assert.strictEqual(map.get(fileA), "false");
    const windowsFile = URI.file("c:\\test with %25\\c#code");
    const uncFile = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
    map.set(windowsFile, "true");
    map.set(uncFile, "true");
    assert.strictEqual(map.get(windowsFile), "true");
    assert.strictEqual(map.get(uncFile), "true");
  });
  test("ResourceMap - files (ignorecase, BUT preservecase)", function() {
    const map = new ResourceMap((uri) => extUriIgnorePathCase.getComparisonKey(uri));
    const fileA = URI.parse("file://some/filea");
    const fileAUpper = URI.parse("file://SOME/FILEA");
    map.set(fileA, 1);
    assert.strictEqual(map.get(fileA), 1);
    assert.strictEqual(map.get(fileAUpper), 1);
    assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileA].map(String));
    assert.deepStrictEqual(Array.from(map), [[fileA, 1]]);
    map.set(fileAUpper, 1);
    assert.strictEqual(map.get(fileA), 1);
    assert.strictEqual(map.get(fileAUpper), 1);
    assert.deepStrictEqual(Array.from(map.keys()).map(String), [fileAUpper].map(String));
    assert.deepStrictEqual(Array.from(map), [[fileAUpper, 1]]);
  });
  test("mapsStrictEqualIgnoreOrder", () => {
    const map1 = /* @__PURE__ */ new Map();
    const map2 = /* @__PURE__ */ new Map();
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
    map1.set("foo", "bar");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), false);
    map2.set("foo", "bar");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
    map2.set("bar", "foo");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), false);
    map1.set("bar", "foo");
    assert.strictEqual(mapsStrictEqualIgnoreOrder(map1, map2), true);
  });
});
suite("BidirectionalMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should set and get values correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.get("one"), 1);
    assert.strictEqual(map.get("two"), 2);
    assert.strictEqual(map.get("three"), 3);
  });
  test("should get keys by value correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.getKey(1), "one");
    assert.strictEqual(map.getKey(2), "two");
    assert.strictEqual(map.getKey(3), "three");
  });
  test("should delete values correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.delete("one"), true);
    assert.strictEqual(map.get("one"), void 0);
    assert.strictEqual(map.getKey(1), void 0);
    assert.strictEqual(map.delete("two"), true);
    assert.strictEqual(map.get("two"), void 0);
    assert.strictEqual(map.getKey(2), void 0);
    assert.strictEqual(map.delete("three"), true);
    assert.strictEqual(map.get("three"), void 0);
    assert.strictEqual(map.getKey(3), void 0);
  });
  test("should handle non-existent keys correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    assert.strictEqual(map.get("four"), void 0);
    assert.strictEqual(map.getKey(4), void 0);
    assert.strictEqual(map.delete("four"), false);
  });
  test("should not leave a stale reverse entry when a key value is updated", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("one", 2);
    assert.strictEqual(map.get("one"), 2);
    assert.strictEqual(map.getKey(2), "one");
    assert.strictEqual(map.getKey(1), void 0);
  });
  test("should handle forEach correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    const keys = [];
    const values = [];
    map.forEach((value, key) => {
      keys.push(key);
      values.push(value);
    });
    assert.deepStrictEqual(keys, ["one", "two", "three"]);
    assert.deepStrictEqual(values, [1, 2, 3]);
  });
  test("should handle clear correctly", () => {
    const map = new BidirectionalMap();
    map.set("one", 1);
    map.set("two", 2);
    map.set("three", 3);
    map.clear();
    assert.strictEqual(map.get("one"), void 0);
    assert.strictEqual(map.get("two"), void 0);
    assert.strictEqual(map.get("three"), void 0);
    assert.strictEqual(map.getKey(1), void 0);
    assert.strictEqual(map.getKey(2), void 0);
    assert.strictEqual(map.getKey(3), void 0);
  });
});
suite("SetMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add and get", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    assert.deepStrictEqual([...setMap.get("a")], [1, 2]);
    assert.deepStrictEqual([...setMap.get("b")], [3]);
  });
  test("delete", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    setMap.delete("a", 1);
    assert.deepStrictEqual([...setMap.get("a")], [2]);
    setMap.delete("a", 2);
    assert.deepStrictEqual([...setMap.get("a")], []);
  });
  test("forEach", () => {
    const setMap = new SetMap();
    setMap.add("a", 1);
    setMap.add("a", 2);
    setMap.add("b", 3);
    let sum = 0;
    setMap.forEach("a", (value) => sum += value);
    assert.strictEqual(sum, 3);
  });
  test("get empty set", () => {
    const setMap = new SetMap();
    assert.deepStrictEqual([...setMap.get("a")], []);
  });
});
suite("NKeyMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("set and get", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    assert.strictEqual(map.get("a", "b", "c", "d"), 1);
    assert.strictEqual(map.get("a", "c", "c", "d"), 2);
    assert.strictEqual(map.get("b", "e", "f", "g"), 3);
    assert.strictEqual(map.get("a", "b", "c", "a"), void 0);
  });
  test("clear", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    map.clear();
    assert.strictEqual(map.get("a", "b", "c", "d"), void 0);
    assert.strictEqual(map.get("a", "c", "c", "d"), void 0);
    assert.strictEqual(map.get("b", "e", "f", "g"), void 0);
  });
  test("values", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c", "d");
    map.set(2, "a", "c", "c", "d");
    map.set(3, "b", "e", "f", "g");
    assert.deepStrictEqual(Array.from(map.values()), [1, 2, 3]);
  });
  test("getAll", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "a", "e", "f");
    map.set(4, "g", "h", "i");
    assert.deepStrictEqual(Array.from(map.getAll("a", "b")), [1, 2]);
    assert.deepStrictEqual(Array.from(map.getAll("a")), [1, 2, 3]);
    assert.deepStrictEqual(Array.from(map.getAll("missing")), []);
  });
  test("delete", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "x", "y", "z");
    assert.strictEqual(map.delete("a", "b", "c"), true);
    assert.strictEqual(map.delete("a", "b", "c"), false);
    assert.deepStrictEqual(Array.from(map.values()), [2, 3]);
  });
  test("deleteAll", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "a", "b", "d");
    map.set(3, "a", "e", "f");
    map.set(4, "g", "h", "i");
    assert.strictEqual(map.deleteAll("a", "b"), true);
    assert.deepStrictEqual(Array.from(map.values()), [3, 4]);
    assert.strictEqual(map.deleteAll("missing"), false);
    assert.strictEqual(map.deleteAll(), true);
    assert.deepStrictEqual(Array.from(map.values()), []);
  });
  test("deleteAll cleans empty parent maps", () => {
    const map = new NKeyMap();
    map.set(1, "a", "b", "c");
    map.set(2, "x", "y", "z");
    assert.strictEqual(map.deleteAll("a", "b"), true);
    assert.strictEqual(map.deleteAll("a"), false);
    assert.deepStrictEqual(Array.from(map.values()), [2]);
  });
  test("toString", () => {
    const map = new NKeyMap();
    map.set(1, "f", "o", "o");
    map.set(2, "b", "a", "r");
    map.set(3, "b", "a", "z");
    map.set(3, "b", "o", "o");
    assert.strictEqual(map.toString(), [
      "f: ",
      "  o: ",
      "    o: 1",
      "b: ",
      "  a: ",
      "    r: 2",
      "    z: 3",
      "  o: ",
      "    o: 3",
      ""
    ].join("\n"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vbWFwLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBCaWRpcmVjdGlvbmFsTWFwLCBMaW5rZWRNYXAsIExSVUNhY2hlLCBtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlciwgTVJVQ2FjaGUsIE5LZXlNYXAsIFJlc291cmNlTWFwLCBTZXRNYXAsIFRvdWNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBleHRVcmlJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ01hcCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBTaW1wbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRtYXAuc2V0KCdhaycsICdhdicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYWsnLCAnYmsnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydhdicsICdididdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmZpcnN0LCAnYXYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmxhc3QsICdidicpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBUb3VjaCBPbGQgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdhaycsICdhdicsIFRvdWNoLkFzT2xkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXSwgWydhayddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAudmFsdWVzKCldLCBbJ2F2J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBUb3VjaCBOZXcgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdhaycsICdhdicsIFRvdWNoLkFzTmV3KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXSwgWydhayddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5tYXAudmFsdWVzKCldLCBbJ2F2J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBUb3VjaCBPbGQgdHdvJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2JywgVG91Y2guQXNPbGQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLCBbJ2JrJywgJ2FrJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLm1hcC52YWx1ZXMoKV0sIFsnYnYnLCAnYXYnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIFRvdWNoIE5ldyB0d28nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRtYXAuc2V0KCdhaycsICdhdicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2Jyk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnLCBUb3VjaC5Bc05ldyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYmsnLCAnYWsnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydidicsICdhdiddKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gVG91Y2ggT2xkIGZyb20gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdG1hcC5zZXQoJ2NrJywgJ2N2Jyk7XG5cdFx0bWFwLnNldCgnYmsnLCAnYnYnLCBUb3VjaC5Bc09sZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYmsnLCAnYWsnLCAnY2snXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydidicsICdhdicsICdjdiddKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gVG91Y2ggTmV3IGZyb20gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0bWFwLnNldCgnYWsnLCAnYXYnKTtcblx0XHRtYXAuc2V0KCdiaycsICdidicpO1xuXHRcdG1hcC5zZXQoJ2NrJywgJ2N2Jyk7XG5cdFx0bWFwLnNldCgnYmsnLCAnYnYnLCBUb3VjaC5Bc05ldyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV0sIFsnYWsnLCAnY2snLCAnYmsnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ubWFwLnZhbHVlcygpXSwgWydhdicsICdjdicsICdididdKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gYmFzaWNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8c3RyaW5nLCBhbnk+KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXG5cdFx0bWFwLnNldCgnMScsIDEpO1xuXHRcdG1hcC5zZXQoJzInLCAnMicpO1xuXHRcdG1hcC5zZXQoJzMnLCB0cnVlKTtcblxuXHRcdGNvbnN0IG9iaiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0bWFwLnNldCgnNCcsIG9iaik7XG5cblx0XHRjb25zdCBkYXRlID0gRGF0ZS5ub3coKTtcblx0XHRtYXAuc2V0KCc1JywgZGF0ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcxJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcyJyksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzQnKSwgb2JqKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnNScpLCBkYXRlKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzYnKSk7XG5cblx0XHRtYXAuZGVsZXRlKCc2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnMScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnMicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnMycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnNCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgnNScpLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCc1JykpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnNCcpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzMnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCcyJykpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnMScpKTtcblxuXHRcdG1hcC5zZXQoJzEnLCAxKTtcblx0XHRtYXAuc2V0KCcyJywgJzInKTtcblx0XHRtYXAuc2V0KCczJywgdHJ1ZSk7XG5cblx0XHRhc3NlcnQub2sobWFwLmhhcygnMScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMScpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMicpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCczJyksIHRydWUpO1xuXG5cdFx0bWFwLmNsZWFyKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXHRcdGFzc2VydC5vayghbWFwLmdldCgnMScpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQoJzInKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KCczJykpO1xuXHRcdGFzc2VydC5vayghbWFwLmhhcygnMScpKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gSXRlcmF0b3JzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBMaW5rZWRNYXA8bnVtYmVyLCBhbnk+KCk7XG5cdFx0bWFwLnNldCgxLCAxKTtcblx0XHRtYXAuc2V0KDIsIDIpO1xuXHRcdG1hcC5zZXQoMywgMyk7XG5cblx0XHRmb3IgKGNvbnN0IGVsZW0gb2YgbWFwLmtleXMoKSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGVsZW0pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZWxlbSBvZiBtYXAudmFsdWVzKCkpIHtcblx0XHRcdGFzc2VydC5vayhlbGVtKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVsZW0gb2YgbWFwLmVudHJpZXMoKSkge1xuXHRcdFx0YXNzZXJ0Lm9rKGVsZW0pO1xuXHRcdH1cblxuXHRcdHtcblx0XHRcdGNvbnN0IGtleXMgPSBtYXAua2V5cygpO1xuXHRcdFx0Y29uc3QgdmFsdWVzID0gbWFwLnZhbHVlcygpO1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IG1hcC5lbnRyaWVzKCk7XG5cdFx0XHRtYXAuZ2V0KDEpO1xuXHRcdFx0a2V5cy5uZXh0KCk7XG5cdFx0XHR2YWx1ZXMubmV4dCgpO1xuXHRcdFx0ZW50cmllcy5uZXh0KCk7XG5cdFx0fVxuXG5cdFx0e1xuXHRcdFx0Y29uc3Qga2V5cyA9IG1hcC5rZXlzKCk7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSBtYXAudmFsdWVzKCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gbWFwLmVudHJpZXMoKTtcblx0XHRcdG1hcC5nZXQoMSwgVG91Y2guQXNOZXcpO1xuXG5cdFx0XHRsZXQgZXhjZXB0aW9uczogbnVtYmVyID0gMDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGtleXMubmV4dCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGV4Y2VwdGlvbnMrKztcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHZhbHVlcy5uZXh0KCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXhjZXB0aW9ucysrO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZW50cmllcy5uZXh0KCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0ZXhjZXB0aW9ucysrO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhjZXB0aW9ucywgMyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBMUlUgQ2FjaGUgc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IExSVUNhY2hlPG51bWJlciwgbnVtYmVyPig1KTtcblxuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKHZhbHVlID0+IGNhY2hlLnNldCh2YWx1ZSwgdmFsdWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0Y2FjaGUuc2V0KDYsIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMiwgMywgNCwgNSwgNl0pO1xuXHRcdGNhY2hlLnNldCg3LCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzMsIDQsIDUsIDYsIDddKTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0WzMsIDQsIDUsIDYsIDddLmZvckVhY2goa2V5ID0+IHZhbHVlcy5wdXNoKGNhY2hlLmdldChrZXkpISkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbMywgNCwgNSwgNiwgN10pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBMUlUgQ2FjaGUgZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IExSVUNhY2hlPG51bWJlciwgbnVtYmVyPig1KTtcblxuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKHZhbHVlID0+IGNhY2hlLnNldCh2YWx1ZSwgdmFsdWUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRjYWNoZS5nZXQoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDQsIDUsIDNdKTtcblx0XHRjYWNoZS5wZWVrKDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCA0LCA1LCAzXSk7XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFsxLCAyLCAzLCA0LCA1XS5mb3JFYWNoKGtleSA9PiB2YWx1ZXMucHVzaChjYWNoZS5nZXQoa2V5KSEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzEsIDIsIDMsIDQsIDVdKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gTFJVIENhY2hlIGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhY2hlID0gbmV3IExSVUNhY2hlPG51bWJlciwgbnVtYmVyPigxMCk7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSAxMDsgaSsrKSB7XG5cdFx0XHRjYWNoZS5zZXQoaSwgaSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCAxMCk7XG5cdFx0Y2FjaGUubGltaXQgPSA1O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbNiwgNywgOCwgOSwgMTBdKTtcblx0XHRjYWNoZS5saW1pdCA9IDIwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRmb3IgKGxldCBpID0gMTE7IGkgPD0gMjA7IGkrKykge1xuXHRcdFx0Y2FjaGUuc2V0KGksIGkpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDE1KTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDY7IGkgPD0gMjA7IGkrKykge1xuXHRcdFx0dmFsdWVzLnB1c2goY2FjaGUuZ2V0KGkpISk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FjaGUuZ2V0KGkpLCBpKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUudmFsdWVzKCldLCB2YWx1ZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBMUlUgQ2FjaGUgbGltaXQgd2l0aCByYXRpbycsICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBMUlVDYWNoZTxudW1iZXIsIG51bWJlcj4oMTAsIDAuNSk7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSAxMDsgaSsrKSB7XG5cdFx0XHRjYWNoZS5zZXQoaSwgaSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCAxMCk7XG5cdFx0Y2FjaGUuc2V0KDExLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFs3LCA4LCA5LCAxMCwgMTFdKTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0Wy4uLmNhY2hlLmtleXMoKV0uZm9yRWFjaChrZXkgPT4gdmFsdWVzLnB1c2goY2FjaGUuZ2V0KGtleSkhKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZXMsIFs3LCA4LCA5LCAxMCwgMTFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS52YWx1ZXMoKV0sIHZhbHVlcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIE1SVSBDYWNoZSBzaW1wbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTVJVQ2FjaGU8bnVtYmVyLCBudW1iZXI+KDUpO1xuXG5cdFx0WzEsIDIsIDMsIDQsIDVdLmZvckVhY2godmFsdWUgPT4gY2FjaGUuc2V0KHZhbHVlLCB2YWx1ZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRjYWNoZS5zZXQoNiwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCAzLCA0LCA2XSk7XG5cdFx0Y2FjaGUuc2V0KDcsIDcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgMywgNCwgN10pO1xuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRbMSwgMiwgMywgNCwgN10uZm9yRWFjaChrZXkgPT4gdmFsdWVzLnB1c2goY2FjaGUuZ2V0KGtleSkhKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZXMsIFsxLCAyLCAzLCA0LCA3XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xpbmtlZE1hcCAtIE1SVSBDYWNoZSBnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FjaGUgPSBuZXcgTVJVQ2FjaGU8bnVtYmVyLCBudW1iZXI+KDUpO1xuXG5cdFx0WzEsIDIsIDMsIDQsIDVdLmZvckVhY2godmFsdWUgPT4gY2FjaGUuc2V0KHZhbHVlLCB2YWx1ZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdGNhY2hlLmdldCgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jYWNoZS5rZXlzKCldLCBbMSwgMiwgNCwgNSwgM10pO1xuXHRcdGNhY2hlLnBlZWsoNCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUua2V5cygpXSwgWzEsIDIsIDQsIDUsIDNdKTtcblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0WzEsIDIsIDMsIDQsIDVdLmZvckVhY2goa2V5ID0+IHZhbHVlcy5wdXNoKGNhY2hlLmdldChrZXkpISkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbMSwgMiwgMywgNCwgNV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBNUlUgQ2FjaGUgbGltaXQgd2l0aCByYXRpbycsICgpID0+IHtcblx0XHRjb25zdCBjYWNoZSA9IG5ldyBNUlVDYWNoZTxudW1iZXIsIG51bWJlcj4oMTAsIDAuNSk7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8PSAxMDsgaSsrKSB7XG5cdFx0XHRjYWNoZS5zZXQoaSwgaSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWNoZS5zaXplLCAxMCk7XG5cdFx0Y2FjaGUuc2V0KDExLCAxMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhY2hlLnNpemUsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNhY2hlLmtleXMoKV0sIFsxLCAyLCAzLCA0LCAxMV0pO1xuXHRcdGNvbnN0IHZhbHVlczogbnVtYmVyW10gPSBbXTtcblx0XHRbLi4uY2FjaGUua2V5cygpXS5mb3JFYWNoKGtleSA9PiB2YWx1ZXMucHVzaChjYWNoZS5nZXQoa2V5KSEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZhbHVlcywgWzEsIDIsIDMsIDQsIDExXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uY2FjaGUudmFsdWVzKCldLCB2YWx1ZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSB0b0pTT04gLyBmcm9tSlNPTicsICgpID0+IHtcblx0XHRsZXQgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRtYXAuc2V0KCdhaycsICdhdicpO1xuXHRcdG1hcC5zZXQoJ2JrJywgJ2J2Jyk7XG5cdFx0bWFwLnNldCgnY2snLCAnY3YnKTtcblxuXHRcdGNvbnN0IGpzb24gPSBtYXAudG9KU09OKCk7XG5cdFx0bWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRtYXAuZnJvbUpTT04oanNvbik7XG5cblx0XHRsZXQgaSA9IDA7XG5cdFx0bWFwLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChrZXksICdhaycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdhdicpO1xuXHRcdFx0fSBlbHNlIGlmIChpID09PSAxKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChrZXksICdiaycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdidicpO1xuXHRcdFx0fSBlbHNlIGlmIChpID09PSAyKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChrZXksICdjaycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdjdicpO1xuXHRcdFx0fVxuXHRcdFx0aSsrO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBkZWxldGUgSGVhZCBhbmQgVGFpbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblxuXHRcdG1hcC5zZXQoJzEnLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDEpO1xuXHRcdG1hcC5kZWxldGUoJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnMScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5rZWRNYXAgLSBkZWxldGUgSGVhZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblxuXHRcdG1hcC5zZXQoJzEnLCAxKTtcblx0XHRtYXAuc2V0KCcyJywgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAyKTtcblx0XHRtYXAuZGVsZXRlKCcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJzInKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoWy4uLm1hcC5rZXlzKCldLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXVswXSwgJzInKTtcblx0fSk7XG5cblx0dGVzdCgnTGlua2VkTWFwIC0gZGVsZXRlIFRhaWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IExpbmtlZE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cblx0XHRtYXAuc2V0KCcxJywgMSk7XG5cdFx0bWFwLnNldCgnMicsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMik7XG5cdFx0bWFwLmRlbGV0ZSgnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCcxJyksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFsuLi5tYXAua2V5cygpXS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChbLi4ubWFwLmtleXMoKV1bMF0sICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc291cmNlTWFwIC0gYmFzaWNzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBSZXNvdXJjZU1hcDxhbnk+KCk7XG5cblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkucGFyc2UoJ3NvbWU6Ly8xJyk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLnBhcnNlKCdzb21lOi8vMicpO1xuXHRcdGNvbnN0IHJlc291cmNlMyA9IFVSSS5wYXJzZSgnc29tZTovLzMnKTtcblx0XHRjb25zdCByZXNvdXJjZTQgPSBVUkkucGFyc2UoJ3NvbWU6Ly80Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2U1ID0gVVJJLnBhcnNlKCdzb21lOi8vNScpO1xuXHRcdGNvbnN0IHJlc291cmNlNiA9IFVSSS5wYXJzZSgnc29tZTovLzYnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgMCk7XG5cblx0XHRjb25zdCByZXMgPSBtYXAuc2V0KHJlc291cmNlMSwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlcyA9PT0gbWFwKTtcblx0XHRtYXAuc2V0KHJlc291cmNlMiwgJzInKTtcblx0XHRtYXAuc2V0KHJlc291cmNlMywgdHJ1ZSk7XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBbLi4ubWFwLnZhbHVlcygpXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzBdLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzWzFdLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXNbMl0sIHRydWUpO1xuXG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdG1hcC5mb3JFYWNoKCh2YWx1ZSwga2V5LCBtYXBPYmopID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgdmFsdWVzW2NvdW50ZXIrK10pO1xuXHRcdFx0YXNzZXJ0Lm9rKFVSSS5pc1VyaShrZXkpKTtcblx0XHRcdGFzc2VydC5vayhtYXAgPT09IG1hcE9iaik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvYmogPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdG1hcC5zZXQocmVzb3VyY2U0LCBvYmopO1xuXG5cdFx0Y29uc3QgZGF0ZSA9IERhdGUubm93KCk7XG5cdFx0bWFwLnNldChyZXNvdXJjZTUsIGRhdGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChyZXNvdXJjZTEpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChyZXNvdXJjZTIpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHJlc291cmNlMyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHJlc291cmNlNCksIG9iaik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2U1KSwgZGF0ZSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlNikpO1xuXG5cdFx0bWFwLmRlbGV0ZShyZXNvdXJjZTYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuc2l6ZSwgNSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5kZWxldGUocmVzb3VyY2UxKSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5kZWxldGUocmVzb3VyY2UyKSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5kZWxldGUocmVzb3VyY2UzKSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5kZWxldGUocmVzb3VyY2U0KSk7XG5cdFx0YXNzZXJ0Lm9rKG1hcC5kZWxldGUocmVzb3VyY2U1KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLnNpemUsIDApO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTUpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2U0KSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlMykpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTIpKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2UxKSk7XG5cblx0XHRtYXAuc2V0KHJlc291cmNlMSwgMSk7XG5cdFx0bWFwLnNldChyZXNvdXJjZTIsICcyJyk7XG5cdFx0bWFwLnNldChyZXNvdXJjZTMsIHRydWUpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1hcC5oYXMocmVzb3VyY2UxKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2UxKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQocmVzb3VyY2UyKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChyZXNvdXJjZTMpLCB0cnVlKTtcblxuXHRcdG1hcC5jbGVhcigpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQub2soIW1hcC5nZXQocmVzb3VyY2UxKSk7XG5cdFx0YXNzZXJ0Lm9rKCFtYXAuZ2V0KHJlc291cmNlMikpO1xuXHRcdGFzc2VydC5vayghbWFwLmdldChyZXNvdXJjZTMpKTtcblx0XHRhc3NlcnQub2soIW1hcC5oYXMocmVzb3VyY2UxKSk7XG5cblx0XHRtYXAuc2V0KHJlc291cmNlMSwgZmFsc2UpO1xuXHRcdG1hcC5zZXQocmVzb3VyY2UyLCAwKTtcblxuXHRcdGFzc2VydC5vayhtYXAuaGFzKHJlc291cmNlMSkpO1xuXHRcdGFzc2VydC5vayhtYXAuaGFzKHJlc291cmNlMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvdXJjZU1hcCAtIGZpbGVzIChkbyBOT1QgaWdub3JlY2FzZSknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IFJlc291cmNlTWFwPGFueT4oKTtcblxuXHRcdGNvbnN0IGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vc29tZS9maWxlYScpO1xuXHRcdGNvbnN0IGZpbGVCID0gVVJJLnBhcnNlKCdzb21lOi8vc29tZS9vdGhlci9maWxlYicpO1xuXHRcdGNvbnN0IGZpbGVBVXBwZXIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9TT01FL0ZJTEVBJyk7XG5cblx0XHRtYXAuc2V0KGZpbGVBLCAndHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBKSwgJ3RydWUnKTtcblxuXHRcdGFzc2VydC5vayghbWFwLmdldChmaWxlQVVwcGVyKSk7XG5cblx0XHRhc3NlcnQub2soIW1hcC5nZXQoZmlsZUIpKTtcblxuXHRcdG1hcC5zZXQoZmlsZUFVcHBlciwgJ2ZhbHNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUFVcHBlciksICdmYWxzZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUEpLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3Qgd2luZG93c0ZpbGUgPSBVUkkuZmlsZSgnYzpcXFxcdGVzdCB3aXRoICUyNVxcXFxjI2NvZGUnKTtcblx0XHRjb25zdCB1bmNGaWxlID0gVVJJLmZpbGUoJ1xcXFxcXFxcc2hcdTAwRTRyZXNcXFxccGF0aFxcXFxjI1xcXFxwbHVnaW4uanNvbicpO1xuXG5cdFx0bWFwLnNldCh3aW5kb3dzRmlsZSwgJ3RydWUnKTtcblx0XHRtYXAuc2V0KHVuY0ZpbGUsICd0cnVlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCh3aW5kb3dzRmlsZSksICd0cnVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQodW5jRmlsZSksICd0cnVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Jlc291cmNlTWFwIC0gZmlsZXMgKGlnbm9yZWNhc2UpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBSZXNvdXJjZU1hcDxhbnk+KHVyaSA9PiBleHRVcmlJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXG5cdFx0Y29uc3QgZmlsZUEgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9zb21lL2ZpbGVhJyk7XG5cdFx0Y29uc3QgZmlsZUIgPSBVUkkucGFyc2UoJ3NvbWU6Ly9zb21lL290aGVyL2ZpbGViJyk7XG5cdFx0Y29uc3QgZmlsZUFVcHBlciA9IFVSSS5wYXJzZSgnZmlsZTovL1NPTUUvRklMRUEnKTtcblxuXHRcdG1hcC5zZXQoZmlsZUEsICd0cnVlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUEpLCAndHJ1ZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUFVcHBlciksICd0cnVlJyk7XG5cblx0XHRhc3NlcnQub2soIW1hcC5nZXQoZmlsZUIpKTtcblxuXHRcdG1hcC5zZXQoZmlsZUFVcHBlciwgJ2ZhbHNlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUFVcHBlciksICdmYWxzZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoZmlsZUEpLCAnZmFsc2UnKTtcblxuXHRcdGNvbnN0IHdpbmRvd3NGaWxlID0gVVJJLmZpbGUoJ2M6XFxcXHRlc3Qgd2l0aCAlMjVcXFxcYyNjb2RlJyk7XG5cdFx0Y29uc3QgdW5jRmlsZSA9IFVSSS5maWxlKCdcXFxcXFxcXHNoXHUwMEU0cmVzXFxcXHBhdGhcXFxcYyNcXFxccGx1Z2luLmpzb24nKTtcblxuXHRcdG1hcC5zZXQod2luZG93c0ZpbGUsICd0cnVlJyk7XG5cdFx0bWFwLnNldCh1bmNGaWxlLCAndHJ1ZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQod2luZG93c0ZpbGUpLCAndHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KHVuY0ZpbGUpLCAndHJ1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXNvdXJjZU1hcCAtIGZpbGVzIChpZ25vcmVjYXNlLCBCVVQgcHJlc2VydmVjYXNlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPih1cmkgPT4gZXh0VXJpSWdub3JlUGF0aENhc2UuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblxuXHRcdGNvbnN0IGZpbGVBID0gVVJJLnBhcnNlKCdmaWxlOi8vc29tZS9maWxlYScpO1xuXHRcdGNvbnN0IGZpbGVBVXBwZXIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9TT01FL0ZJTEVBJyk7XG5cblx0XHRtYXAuc2V0KGZpbGVBLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChmaWxlQSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBVXBwZXIpLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLmtleXMoKSkubWFwKFN0cmluZyksIFtmaWxlQV0ubWFwKFN0cmluZykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXApLCBbW2ZpbGVBLCAxXV0pO1xuXG5cdFx0bWFwLnNldChmaWxlQVVwcGVyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldChmaWxlQSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KGZpbGVBVXBwZXIpLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLmtleXMoKSkubWFwKFN0cmluZyksIFtmaWxlQVVwcGVyXS5tYXAoU3RyaW5nKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcCksIFtbZmlsZUFVcHBlciwgMV1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwMSA9IG5ldyBNYXAoKTtcblx0XHRjb25zdCBtYXAyID0gbmV3IE1hcCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyKG1hcDEsIG1hcDIpLCB0cnVlKTtcblxuXHRcdG1hcDEuc2V0KCdmb28nLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcHNTdHJpY3RFcXVhbElnbm9yZU9yZGVyKG1hcDEsIG1hcDIpLCBmYWxzZSk7XG5cblx0XHRtYXAyLnNldCgnZm9vJywgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlcihtYXAxLCBtYXAyKSwgdHJ1ZSk7XG5cblx0XHRtYXAyLnNldCgnYmFyJywgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXBzU3RyaWN0RXF1YWxJZ25vcmVPcmRlcihtYXAxLCBtYXAyKSwgZmFsc2UpO1xuXG5cdFx0bWFwMS5zZXQoJ2JhcicsICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwc1N0cmljdEVxdWFsSWdub3JlT3JkZXIobWFwMSwgbWFwMiksIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQmlkaXJlY3Rpb25hbE1hcCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvdWxkIHNldCBhbmQgZ2V0IHZhbHVlcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdvbmUnKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3R3bycpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgndGhyZWUnKSwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBnZXQga2V5cyBieSB2YWx1ZSBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDEpLCAnb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMiksICd0d28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgzKSwgJ3RocmVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBkZWxldGUgdmFsdWVzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgQmlkaXJlY3Rpb25hbE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRtYXAuc2V0KCdvbmUnLCAxKTtcblx0XHRtYXAuc2V0KCd0d28nLCAyKTtcblx0XHRtYXAuc2V0KCd0aHJlZScsIDMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJ29uZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnb25lJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMSksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmRlbGV0ZSgndHdvJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCd0d28nKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgyKSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlKCd0aHJlZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgndGhyZWUnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldEtleSgzKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBub24tZXhpc3RlbnQga2V5cyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdmb3VyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoNCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJ2ZvdXInKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGxlYXZlIGEgc3RhbGUgcmV2ZXJzZSBlbnRyeSB3aGVuIGEga2V5IHZhbHVlIGlzIHVwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgnb25lJywgMik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnb25lJyksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDIpLCAnb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXRLZXkoMSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZm9yRWFjaCBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IEJpZGlyZWN0aW9uYWxNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0bWFwLnNldCgnb25lJywgMSk7XG5cdFx0bWFwLnNldCgndHdvJywgMik7XG5cdFx0bWFwLnNldCgndGhyZWUnLCAzKTtcblxuXHRcdGNvbnN0IGtleXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdmFsdWVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdG1hcC5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRrZXlzLnB1c2goa2V5KTtcblx0XHRcdHZhbHVlcy5wdXNoKHZhbHVlKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoa2V5cywgWydvbmUnLCAndHdvJywgJ3RocmVlJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbMSwgMiwgM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNsZWFyIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgQmlkaXJlY3Rpb25hbE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRtYXAuc2V0KCdvbmUnLCAxKTtcblx0XHRtYXAuc2V0KCd0d28nLCAyKTtcblx0XHRtYXAuc2V0KCd0aHJlZScsIDMpO1xuXG5cdFx0bWFwLmNsZWFyKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnb25lJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ3R3bycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCd0aHJlZScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDEpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDIpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0S2V5KDMpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU2V0TWFwJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FkZCBhbmQgZ2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldE1hcCA9IG5ldyBTZXRNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0c2V0TWFwLmFkZCgnYScsIDEpO1xuXHRcdHNldE1hcC5hZGQoJ2EnLCAyKTtcblx0XHRzZXRNYXAuYWRkKCdiJywgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0TWFwLmdldCgnYScpXSwgWzEsIDJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zZXRNYXAuZ2V0KCdiJyldLCBbM10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0TWFwID0gbmV3IFNldE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRzZXRNYXAuYWRkKCdhJywgMSk7XG5cdFx0c2V0TWFwLmFkZCgnYScsIDIpO1xuXHRcdHNldE1hcC5hZGQoJ2InLCAzKTtcblx0XHRzZXRNYXAuZGVsZXRlKCdhJywgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0TWFwLmdldCgnYScpXSwgWzJdKTtcblx0XHRzZXRNYXAuZGVsZXRlKCdhJywgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0TWFwLmdldCgnYScpXSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JFYWNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldE1hcCA9IG5ldyBTZXRNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0c2V0TWFwLmFkZCgnYScsIDEpO1xuXHRcdHNldE1hcC5hZGQoJ2EnLCAyKTtcblx0XHRzZXRNYXAuYWRkKCdiJywgMyk7XG5cdFx0bGV0IHN1bSA9IDA7XG5cdFx0c2V0TWFwLmZvckVhY2goJ2EnLCB2YWx1ZSA9PiBzdW0gKz0gdmFsdWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW0sIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgZW1wdHkgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldE1hcCA9IG5ldyBTZXRNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2V0TWFwLmdldCgnYScpXSwgW10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTktleU1hcCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2V0IGFuZCBnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdhJywgJ2InLCAnYycsICdkJyk7XG5cdFx0bWFwLnNldCgyLCAnYScsICdjJywgJ2MnLCAnZCcpO1xuXHRcdG1hcC5zZXQoMywgJ2InLCAnZScsICdmJywgJ2cnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYScsICdiJywgJ2MnLCAnZCcpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYScsICdjJywgJ2MnLCAnZCcpLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYicsICdlJywgJ2YnLCAnZycpLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYScsICdiJywgJ2MnLCAnYScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcicsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTktleU1hcDxudW1iZXIsIFtzdHJpbmcsIHN0cmluZywgc3RyaW5nLCBzdHJpbmddPigpO1xuXHRcdG1hcC5zZXQoMSwgJ2EnLCAnYicsICdjJywgJ2QnKTtcblx0XHRtYXAuc2V0KDIsICdhJywgJ2MnLCAnYycsICdkJyk7XG5cdFx0bWFwLnNldCgzLCAnYicsICdlJywgJ2YnLCAnZycpO1xuXHRcdG1hcC5jbGVhcigpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZ2V0KCdhJywgJ2InLCAnYycsICdkJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5nZXQoJ2EnLCAnYycsICdjJywgJ2QnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFwLmdldCgnYicsICdlJywgJ2YnLCAnZycpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdhJywgJ2InLCAnYycsICdkJyk7XG5cdFx0bWFwLnNldCgyLCAnYScsICdjJywgJ2MnLCAnZCcpO1xuXHRcdG1hcC5zZXQoMywgJ2InLCAnZScsICdmJywgJ2cnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLnZhbHVlcygpKSwgWzEsIDIsIDNdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBOS2V5TWFwPG51bWJlciwgW3N0cmluZywgc3RyaW5nLCBzdHJpbmddPigpO1xuXHRcdG1hcC5zZXQoMSwgJ2EnLCAnYicsICdjJyk7XG5cdFx0bWFwLnNldCgyLCAnYScsICdiJywgJ2QnKTtcblx0XHRtYXAuc2V0KDMsICdhJywgJ2UnLCAnZicpO1xuXHRcdG1hcC5zZXQoNCwgJ2cnLCAnaCcsICdpJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC5nZXRBbGwoJ2EnLCAnYicpKSwgWzEsIDJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLmdldEFsbCgnYScpKSwgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20obWFwLmdldEFsbCgnbWlzc2luZycpKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnYScsICdiJywgJ2MnKTtcblx0XHRtYXAuc2V0KDIsICdhJywgJ2InLCAnZCcpO1xuXHRcdG1hcC5zZXQoMywgJ3gnLCAneScsICd6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGUoJ2EnLCAnYicsICdjJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlKCdhJywgJ2InLCAnYycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC52YWx1ZXMoKSksIFsyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUFsbCcsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTktleU1hcDxudW1iZXIsIFtzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdhJywgJ2InLCAnYycpO1xuXHRcdG1hcC5zZXQoMiwgJ2EnLCAnYicsICdkJyk7XG5cdFx0bWFwLnNldCgzLCAnYScsICdlJywgJ2YnKTtcblx0XHRtYXAuc2V0KDQsICdnJywgJ2gnLCAnaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlQWxsKCdhJywgJ2InKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKG1hcC52YWx1ZXMoKSksIFszLCA0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGVBbGwoJ21pc3NpbmcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlQWxsKCksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUFsbCBjbGVhbnMgZW1wdHkgcGFyZW50IG1hcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE5LZXlNYXA8bnVtYmVyLCBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10+KCk7XG5cdFx0bWFwLnNldCgxLCAnYScsICdiJywgJ2MnKTtcblx0XHRtYXAuc2V0KDIsICd4JywgJ3knLCAneicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAuZGVsZXRlQWxsKCdhJywgJ2InKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcC5kZWxldGVBbGwoJ2EnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpLCBbMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0b1N0cmluZycsICgpID0+IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTktleU1hcDxudW1iZXIsIFtzdHJpbmcsIHN0cmluZywgc3RyaW5nXT4oKTtcblx0XHRtYXAuc2V0KDEsICdmJywgJ28nLCAnbycpO1xuXHRcdG1hcC5zZXQoMiwgJ2InLCAnYScsICdyJyk7XG5cdFx0bWFwLnNldCgzLCAnYicsICdhJywgJ3onKTtcblx0XHRtYXAuc2V0KDMsICdiJywgJ28nLCAnbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXAudG9TdHJpbmcoKSwgW1xuXHRcdFx0J2Y6ICcsXG5cdFx0XHQnICBvOiAnLFxuXHRcdFx0JyAgICBvOiAxJyxcblx0XHRcdCdiOiAnLFxuXHRcdFx0JyAgYTogJyxcblx0XHRcdCcgICAgcjogMicsXG5cdFx0XHQnICAgIHo6IDMnLFxuXHRcdFx0JyAgbzogJyxcblx0XHRcdCcgICAgbzogMycsXG5cdFx0XHQnJyxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQixXQUFXLFVBQVUsNEJBQTRCLFVBQVUsU0FBUyxhQUFhLFFBQVEsYUFBYTtBQUNqSSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxPQUFPLE1BQU07QUFFbEIsMENBQXdDO0FBRXhDLE9BQUssc0JBQXNCLE1BQU07QUFDaEMsVUFBTSxNQUFNLElBQUksVUFBMEI7QUFDMUMsUUFBSSxJQUFJLE1BQU0sSUFBSTtBQUNsQixRQUFJLElBQUksTUFBTSxJQUFJO0FBQ2xCLFdBQU8sZ0JBQWdCLENBQUMsR0FBRyxJQUFJLEtBQUssQ0FBQyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUM7QUFDcEQsV0FBTyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQztBQUN0RCxXQUFPLFlBQVksSUFBSSxPQUFPLElBQUk7QUFDbEMsV0FBTyxZQUFZLElBQUksTUFBTSxJQUFJO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFB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
