import assert from "assert";
import { HistoryNavigator, HistoryNavigator2 } from "../../common/history.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("History Navigator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("create reduces the input to limit", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 2);
    assert.deepStrictEqual(["3", "4"], toArray(testObject));
  });
  test("create sets the position after last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 100);
    assert.strictEqual(testObject.current(), null);
    assert.strictEqual(testObject.isNowhere(), true);
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), false);
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.isNowhere(), false);
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), true);
  });
  test("last returns last element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 100);
    assert.strictEqual(testObject.first(), "1");
    assert.strictEqual(testObject.last(), "4");
    assert.strictEqual(testObject.isFirst(), false);
    assert.strictEqual(testObject.isLast(), true);
  });
  test("first returns first element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    assert.strictEqual("2", testObject.first());
    assert.strictEqual(testObject.isFirst(), true);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("next returns next element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    assert.strictEqual(testObject.next(), "3");
    assert.strictEqual(testObject.next(), "4");
    assert.strictEqual(testObject.next(), null);
  });
  test("previous returns previous element", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), null);
  });
  test("next on last element returns null and remains on last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    testObject.last();
    assert.strictEqual(testObject.isLast(), true);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("previous on first element returns null and remains on first", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    assert.strictEqual(testObject.isFirst(), true);
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.previous(), null);
    assert.strictEqual(testObject.isFirst(), true);
  });
  test("add reduces the input to limit", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 2);
    testObject.add("5");
    assert.deepStrictEqual(toArray(testObject), ["4", "5"]);
  });
  test("adding existing element changes the position", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 5);
    testObject.add("2");
    assert.deepStrictEqual(toArray(testObject), ["1", "3", "4", "2"]);
  });
  test("add resets the navigator to last", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3", "4"]), 3);
    testObject.first();
    testObject.add("5");
    assert.strictEqual(testObject.previous(), "5");
    assert.strictEqual(testObject.isLast(), true);
    assert.strictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("adding an existing item changes the order", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.add("1");
    assert.deepStrictEqual(["2", "3", "1"], toArray(testObject));
  });
  test("previous returns null if the current position is the first one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.first();
    assert.deepStrictEqual(testObject.previous(), null);
    assert.strictEqual(testObject.isFirst(), true);
  });
  test("previous returns object if the current position is not the first one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.first();
    testObject.next();
    assert.deepStrictEqual(testObject.previous(), "1");
  });
  test("next returns null if the current position is the last one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.last();
    assert.strictEqual(testObject.isLast(), true);
    assert.deepStrictEqual(testObject.next(), null);
    assert.strictEqual(testObject.isLast(), false);
  });
  test("next returns object if the current position is not the last one", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["1", "2", "3"]));
    testObject.last();
    testObject.previous();
    assert.deepStrictEqual(testObject.next(), "3");
  });
  test("clear", () => {
    const testObject = new HistoryNavigator(/* @__PURE__ */ new Set(["a", "b", "c"]));
    assert.strictEqual(testObject.previous(), "c");
    testObject.clear();
    assert.strictEqual(testObject.current(), null);
    assert.strictEqual(testObject.isNowhere(), true);
  });
  function toArray(historyNavigator) {
    const result = [];
    historyNavigator.first();
    if (historyNavigator.current()) {
      do {
        result.push(historyNavigator.current());
      } while (historyNavigator.next());
    }
    return result;
  }
});
suite("History Navigator 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("constructor", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("constructor - initial history is not empty", () => {
    assert.throws(() => new HistoryNavigator2([]));
  });
  test("constructor - capacity limit", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"], 3);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("1"), false);
  });
  test("constructor - duplicate values", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4", "3", "2", "1"]);
    assert.strictEqual(testObject.current(), "1");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("navigation", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.next(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), "1");
    assert.strictEqual(testObject.previous(), "1");
    assert.strictEqual(testObject.current(), "1");
    assert.strictEqual(testObject.next(), "2");
    assert.strictEqual(testObject.resetCursor(), "4");
  });
  test("add", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.add("5");
    assert.strictEqual(testObject.current(), "5");
    assert.strictEqual(testObject.isAtEnd(), true);
  });
  test("add - existing value", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.add("2");
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.previous(), "4");
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("replaceLast", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.replaceLast("5");
    assert.strictEqual(testObject.current(), "5");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("4"), false);
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "2");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("replaceLast - existing value", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    testObject.replaceLast("2");
    assert.strictEqual(testObject.current(), "2");
    assert.strictEqual(testObject.isAtEnd(), true);
    assert.strictEqual(testObject.has("4"), false);
    assert.strictEqual(testObject.previous(), "3");
    assert.strictEqual(testObject.previous(), "1");
  });
  test("prepend", () => {
    const testObject = new HistoryNavigator2(["1", "2", "3", "4"]);
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["1", "2", "3", "4"]);
    testObject.prepend("0");
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["0", "1", "2", "3", "4"]);
    testObject.prepend("2");
    assert.strictEqual(testObject.current(), "4");
    assert.ok(testObject.isAtEnd());
    assert.deepStrictEqual(Array.from(testObject), ["0", "1", "2", "3", "4"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vaGlzdG9yeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEhpc3RvcnlOYXZpZ2F0b3IsIEhpc3RvcnlOYXZpZ2F0b3IyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdIaXN0b3J5IE5hdmlnYXRvcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjcmVhdGUgcmVkdWNlcyB0aGUgaW5wdXQgdG8gbGltaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWyczJywgJzQnXSwgdG9BcnJheSh0ZXN0T2JqZWN0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZSBzZXRzIHRoZSBwb3NpdGlvbiBhZnRlciBsYXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNOb3doZXJlKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzRmlyc3QoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTm93aGVyZSgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNGaXJzdCgpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNMYXN0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsYXN0IHJldHVybnMgbGFzdCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmZpcnN0KCksICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubGFzdCgpLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzRmlyc3QoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgcmV0dXJucyBmaXJzdCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJzInLCB0ZXN0T2JqZWN0LmZpcnN0KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzRmlyc3QoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNMYXN0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbmV4dCByZXR1cm5zIG5leHQgZWxlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDMpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QubmV4dCgpLCAnMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm5leHQoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmV2aW91cyByZXR1cm5zIHByZXZpb3VzIGVsZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXh0IG9uIGxhc3QgZWxlbWVudCByZXR1cm5zIG51bGwgYW5kIHJlbWFpbnMgb24gbGFzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDMpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXHRcdHRlc3RPYmplY3QubGFzdCgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNMYXN0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCBmYWxzZSk7IC8vIFN0ZXBwaW5nIHBhc3QgdGhlIGxhc3QgZWxlbWVudCwgaXMgbm8gbG9uZ2VyIFwibGFzdFwiXG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXZpb3VzIG9uIGZpcnN0IGVsZW1lbnQgcmV0dXJucyBudWxsIGFuZCByZW1haW5zIG9uIGZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnLCAnNCddKSwgMyk7XG5cblx0XHR0ZXN0T2JqZWN0LmZpcnN0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0ZpcnN0KCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0ZpcnN0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQgcmVkdWNlcyB0aGUgaW5wdXQgdG8gbGltaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMycsICc0J10pLCAyKTtcblxuXHRcdHRlc3RPYmplY3QuYWRkKCc1Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkodGVzdE9iamVjdCksIFsnNCcsICc1J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRpbmcgZXhpc3RpbmcgZWxlbWVudCBjaGFuZ2VzIHRoZSBwb3NpdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDUpO1xuXG5cdFx0dGVzdE9iamVjdC5hZGQoJzInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheSh0ZXN0T2JqZWN0KSwgWycxJywgJzMnLCAnNCcsICcyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQgcmVzZXRzIHRoZSBuYXZpZ2F0b3IgdG8gbGFzdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IobmV3IFNldChbJzEnLCAnMicsICczJywgJzQnXSksIDMpO1xuXG5cdFx0dGVzdE9iamVjdC5maXJzdCgpO1xuXHRcdHRlc3RPYmplY3QuYWRkKCc1Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzTGFzdCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZGluZyBhbiBleGlzdGluZyBpdGVtIGNoYW5nZXMgdGhlIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnXSkpO1xuXG5cdFx0dGVzdE9iamVjdC5hZGQoJzEnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWycyJywgJzMnLCAnMSddLCB0b0FycmF5KHRlc3RPYmplY3QpKTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlvdXMgcmV0dXJucyBudWxsIGlmIHRoZSBjdXJyZW50IHBvc2l0aW9uIGlzIHRoZSBmaXJzdCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMyddKSk7XG5cblx0XHR0ZXN0T2JqZWN0LmZpcnN0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNGaXJzdCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncHJldmlvdXMgcmV0dXJucyBvYmplY3QgaWYgdGhlIGN1cnJlbnQgcG9zaXRpb24gaXMgbm90IHRoZSBmaXJzdCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWycxJywgJzInLCAnMyddKSk7XG5cblx0XHR0ZXN0T2JqZWN0LmZpcnN0KCk7XG5cdFx0dGVzdE9iamVjdC5uZXh0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzEnKTtcblx0fSk7XG5cblx0dGVzdCgnbmV4dCByZXR1cm5zIG51bGwgaWYgdGhlIGN1cnJlbnQgcG9zaXRpb24gaXMgdGhlIGxhc3Qgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnXSkpO1xuXG5cdFx0dGVzdE9iamVjdC5sYXN0KCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0xhc3QoKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm5leHQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNMYXN0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnbmV4dCByZXR1cm5zIG9iamVjdCBpZiB0aGUgY3VycmVudCBwb3NpdGlvbiBpcyBub3QgdGhlIGxhc3Qgb25lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcihuZXcgU2V0KFsnMScsICcyJywgJzMnXSkpO1xuXG5cdFx0dGVzdE9iamVjdC5sYXN0KCk7XG5cdFx0dGVzdE9iamVjdC5wcmV2aW91cygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm5leHQoKSwgJzMnKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yKG5ldyBTZXQoWydhJywgJ2InLCAnYyddKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJ2MnKTtcblx0XHR0ZXN0T2JqZWN0LmNsZWFyKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY3VycmVudCgpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc05vd2hlcmUoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRvQXJyYXkoaGlzdG9yeU5hdmlnYXRvcjogSGlzdG9yeU5hdmlnYXRvcjxzdHJpbmc+KTogQXJyYXk8c3RyaW5nIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlc3VsdDogQXJyYXk8c3RyaW5nIHwgbnVsbD4gPSBbXTtcblx0XHRoaXN0b3J5TmF2aWdhdG9yLmZpcnN0KCk7XG5cdFx0aWYgKGhpc3RvcnlOYXZpZ2F0b3IuY3VycmVudCgpKSB7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGhpc3RvcnlOYXZpZ2F0b3IuY3VycmVudCgpISk7XG5cdFx0XHR9IHdoaWxlIChoaXN0b3J5TmF2aWdhdG9yLm5leHQoKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn0pO1xuXG5zdWl0ZSgnSGlzdG9yeSBOYXZpZ2F0b3IgMicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3RvcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25zdHJ1Y3RvciAtIGluaXRpYWwgaGlzdG9yeSBpcyBub3QgZW1wdHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoW10pKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0b3IgLSBjYXBhY2l0eSBsaW1pdCcsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddLCAzKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmhhcygnMScpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdG9yIC0gZHVwbGljYXRlIHZhbHVlcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCcsICczJywgJzInLCAnMSddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCduYXZpZ2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycxJywgJzInLCAnMycsICc0J10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY3VycmVudCgpLCAnNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmlzQXRFbmQoKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzEnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5uZXh0KCksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucmVzZXRDdXJzb3IoKSwgJzQnKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycxJywgJzInLCAnMycsICc0J10pO1xuXHRcdHRlc3RPYmplY3QuYWRkKCc1Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICc1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkIC0gZXhpc3RpbmcgdmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBIaXN0b3J5TmF2aWdhdG9yMihbJzEnLCAnMicsICczJywgJzQnXSk7XG5cdFx0dGVzdE9iamVjdC5hZGQoJzInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VMYXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycxJywgJzInLCAnMycsICc0J10pO1xuXHRcdHRlc3RPYmplY3QucmVwbGFjZUxhc3QoJzUnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc0F0RW5kKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmhhcygnNCcpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnByZXZpb3VzKCksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzEnKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZUxhc3QgLSBleGlzdGluZyB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEhpc3RvcnlOYXZpZ2F0b3IyKFsnMScsICcyJywgJzMnLCAnNCddKTtcblx0XHR0ZXN0T2JqZWN0LnJlcGxhY2VMYXN0KCcyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5jdXJyZW50KCksICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNBdEVuZCgpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5oYXMoJzQnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QucHJldmlvdXMoKSwgJzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5wcmV2aW91cygpLCAnMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVwZW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgSGlzdG9yeU5hdmlnYXRvcjIoWycxJywgJzInLCAnMycsICc0J10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQub2sodGVzdE9iamVjdC5pc0F0RW5kKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbSh0ZXN0T2JqZWN0KSwgWycxJywgJzInLCAnMycsICc0J10pO1xuXG5cdFx0dGVzdE9iamVjdC5wcmVwZW5kKCcwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuY3VycmVudCgpLCAnNCcpO1xuXHRcdGFzc2VydC5vayh0ZXN0T2JqZWN0LmlzQXRFbmQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKHRlc3RPYmplY3QpLCBbJzAnLCAnMScsICcyJywgJzMnLCAnNCddKTtcblxuXHRcdHRlc3RPYmplY3QucHJlcGVuZCgnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmN1cnJlbnQoKSwgJzQnKTtcblx0XHRhc3NlcnQub2sodGVzdE9iamVjdC5pc0F0RW5kKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbSh0ZXN0T2JqZWN0KSwgWycwJywgJzEnLCAnMicsICczJywgJzQnXSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQix5QkFBeUI7QUFDcEQsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxxQkFBcUIsTUFBTTtBQUVoQywwQ0FBd0M7QUFFeEMsT0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxVQUFNLGFBQWEsSUFBSSxpQkFBaUIsb0JBQUksSUFBSSxD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
