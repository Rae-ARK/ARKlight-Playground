import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  BrowserFaviconsStore,
  BrowserHistoryEntriesStore,
  BrowserHistoryStore
} from "../../common/browserHistory.js";
suite("BrowserHistoryEntriesStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add assigns monotonic ids and exposes items oldest-first", () => {
    const store = new BrowserHistoryEntriesStore();
    const a = store.add("https://a/", "A", void 0, false);
    const b = store.add("https://b/", "B", "icon-b", true);
    const c = store.add("https://c/", "C", void 0, false);
    assert.deepStrictEqual([a.id, b.id, c.id], [1, 2, 3]);
    assert.deepStrictEqual(store.items.map((e) => ({ id: e.id, url: e.url, icon: e.icon, explicit: e.explicit })), [
      { id: 1, url: "https://a/", icon: void 0, explicit: void 0 },
      { id: 2, url: "https://b/", icon: "icon-b", explicit: true },
      { id: 3, url: "https://c/", icon: void 0, explicit: void 0 }
    ]);
    store.dispose();
  });
  test("explicit is omitted from the entry when false", () => {
    const store = new BrowserHistoryEntriesStore();
    const e = store.add("https://a/", "A", void 0, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(e, "explicit"), false);
    store.dispose();
  });
  test("update changes title and icon, returns whether anything changed", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "", void 0, false);
    assert.strictEqual(store.update(1, { title: "A" }), true);
    assert.strictEqual(store.update(1, { faviconHash: "icon-a" }), true);
    assert.strictEqual(store.update(1, { title: "A", faviconHash: "icon-a" }), false);
    assert.deepStrictEqual(store.items[0].title, "A");
    assert.deepStrictEqual(store.items[0].icon, "icon-a");
    store.dispose();
  });
  test("update ignores empty title", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    assert.strictEqual(store.update(1, { title: "" }), false);
    assert.strictEqual(store.items[0].title, "A");
    store.dispose();
  });
  test("update of an unknown id is a no-op", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    assert.strictEqual(store.update(999, { title: "X" }), false);
    store.dispose();
  });
  test("delete removes the targeted entry and leaves ids of others intact", () => {
    const store = new BrowserHistoryEntriesStore();
    const a = store.add("https://a/", "A", void 0, false);
    const b = store.add("https://b/", "B", void 0, false);
    const c = store.add("https://c/", "C", void 0, false);
    assert.strictEqual(store.delete(b.id), true);
    assert.strictEqual(store.delete(b.id), false);
    assert.deepStrictEqual(store.items.map((e) => e.id), [a.id, c.id]);
    store.dispose();
  });
  test("add beyond maxEntries evicts oldest", () => {
    const store = new BrowserHistoryEntriesStore(2);
    store.add("https://a/", "A", void 0, false);
    store.add("https://b/", "B", void 0, false);
    store.add("https://c/", "C", void 0, false);
    assert.deepStrictEqual(store.items.map((e) => e.url), ["https://b/", "https://c/"]);
    store.dispose();
  });
  test("onDidChange fires for add, update, delete, clear", () => {
    const store = new BrowserHistoryEntriesStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.add("https://a/", "A", void 0, false);
    store.update(1, { title: "A2" });
    store.delete(1);
    store.clear();
    store.clear();
    assert.strictEqual(count, 4);
    sub.dispose();
    store.dispose();
  });
  test("serialize then hydrate round-trips", () => {
    const a = new BrowserHistoryEntriesStore();
    a.add("https://a/", "A", "icon-a", true);
    a.add("https://b/", "B", void 0, false);
    const snapshot = a.serialize();
    const b = new BrowserHistoryEntriesStore();
    b.hydrate(snapshot);
    assert.deepStrictEqual(b.serialize(), snapshot);
    a.dispose();
    b.dispose();
  });
  test("hydrate seeds the id counter from the max restored id", () => {
    const store = new BrowserHistoryEntriesStore();
    store.hydrate({
      items: [
        { id: 7, url: "https://a/", time: 100, title: "A" },
        { id: 12, url: "https://b/", time: 200, title: "B" }
      ]
    });
    const next = store.add("https://c/", "C", void 0, false);
    assert.strictEqual(next.id, 13);
    store.dispose();
  });
});
suite("BrowserHistoryEntriesStore.hydrate backwards-compat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts data matching prior snapshot shapes", () => {
    const raw = {
      items: [
        { id: 1, url: "https://a/", time: 100, title: "A" },
        { id: 2, url: "https://b/", time: 200, title: "B", icon: "h1" },
        { id: 4, url: "https://c/", time: 300, title: "C", explicit: true }
      ]
    };
    const store = new BrowserHistoryEntriesStore();
    store.hydrate(raw);
    assert.deepStrictEqual(store.items, [
      { id: 1, url: "https://a/", time: 100, title: "A" },
      { id: 2, url: "https://b/", time: 200, title: "B", icon: "h1" },
      { id: 4, url: "https://c/", time: 300, title: "C", explicit: true }
    ]);
    assert.strictEqual(store.add("https://d/", "D", void 0, false).id, 5);
    store.dispose();
  });
  test("drops malformed entries and accepts the rest", () => {
    const raw = {
      items: [
        { id: 1, url: "https://a/", time: 100, title: "A" },
        { id: "bad", url: "https://b/", time: 200, title: "B" },
        null,
        { id: 2 },
        // missing required fields
        { id: 3, url: "https://c/", time: 300, title: "C", explicit: "yes" }
        // bad explicit
      ]
    };
    const store = new BrowserHistoryEntriesStore();
    store.hydrate(raw);
    assert.deepStrictEqual(store.items.map((e) => e.id), [1]);
    store.dispose();
  });
  test("undefined snapshot resets to an empty store", () => {
    const store = new BrowserHistoryEntriesStore();
    store.add("https://a/", "A", void 0, false);
    store.hydrate(void 0);
    assert.deepStrictEqual(store.items, []);
    assert.strictEqual(store.add("https://b/", "B", void 0, false).id, 1);
    store.dispose();
  });
});
suite("BrowserFaviconsStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("register dedups by content and returns the same hash", () => {
    const store = new BrowserFaviconsStore();
    const h1 = store.register("data:image/png;base64,AAA");
    const h2 = store.register("data:image/png;base64,AAA");
    const h3 = store.register("data:image/png;base64,BBB");
    assert.strictEqual(h1, h2);
    assert.notStrictEqual(h1, h3);
    assert.strictEqual(store.get(h1), "data:image/png;base64,AAA");
    assert.strictEqual(store.get(h3), "data:image/png;base64,BBB");
    store.dispose();
  });
  test("onDidChange fires only when a new favicon is added", () => {
    const store = new BrowserFaviconsStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.register("a");
    store.register("a");
    store.register("b");
    assert.strictEqual(count, 2);
    sub.dispose();
    store.dispose();
  });
  test("gc drops orphans and fires onDidChange only when something changes", () => {
    const store = new BrowserFaviconsStore();
    const h1 = store.register("a");
    const h2 = store.register("b");
    let count = 0;
    const sub = store.onDidChange(() => count++);
    store.gc(/* @__PURE__ */ new Set([h1]));
    assert.strictEqual(store.get(h2), void 0);
    assert.strictEqual(store.get(h1), "a");
    assert.strictEqual(count, 1);
    store.gc(/* @__PURE__ */ new Set([h1]));
    assert.strictEqual(count, 1);
    sub.dispose();
    store.dispose();
  });
  test("serialize then hydrate round-trips", () => {
    const a = new BrowserFaviconsStore();
    a.register("one");
    a.register("two");
    const snapshot = a.serialize();
    const b = new BrowserFaviconsStore();
    b.hydrate(snapshot);
    assert.deepStrictEqual(b.serialize(), snapshot);
    a.dispose();
    b.dispose();
  });
  test("hydrate accepts unknown-typed data matching the current snapshot shape", () => {
    const raw = {
      map: {
        abc: "data:image/png;base64,AAA",
        def: "data:image/png;base64,BBB",
        // non-string values dropped silently
        bad: 123
      }
    };
    const store = new BrowserFaviconsStore();
    store.hydrate(raw);
    assert.strictEqual(store.get("abc"), "data:image/png;base64,AAA");
    assert.strictEqual(store.get("def"), "data:image/png;base64,BBB");
    assert.strictEqual(store.get("bad"), void 0);
    store.dispose();
  });
});
suite("BrowserHistoryStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("add returns a handle whose id matches the underlying entry", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A");
    assert.strictEqual(handle.id, store.entries.items[0].id);
    store.dispose();
  });
  test("add is a no-op when max entries is 0", () => {
    const store = new BrowserHistoryStore(0);
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    assert.deepStrictEqual(store.entries.items, []);
    assert.deepStrictEqual(store.favicons.serialize().map, {});
    handle.update({ title: "B" });
    handle.delete();
    store.dispose();
  });
  test("handle.update propagates to entry and registers the favicon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "");
    handle.update({ title: "A", favicon: "data:image/png;base64,XXX" });
    const entry = store.entries.items[0];
    assert.strictEqual(entry.title, "A");
    assert.notStrictEqual(entry.icon, void 0);
    assert.strictEqual(store.favicons.get(entry.icon), "data:image/png;base64,XXX");
    store.dispose();
  });
  test("handle.update with explicit `favicon: null` clears the entry icon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    assert.notStrictEqual(store.entries.items[0].icon, void 0);
    handle.update({ favicon: null });
    assert.strictEqual(store.entries.items[0].icon, void 0);
    store.dispose();
  });
  test("handle.delete removes the entry and GCs the orphaned favicon", () => {
    const store = new BrowserHistoryStore();
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    const iconHash = store.entries.items[0].icon;
    assert.strictEqual(store.favicons.get(iconHash), "data:image/png;base64,XXX");
    handle.delete();
    assert.deepStrictEqual(store.entries.items, []);
    assert.strictEqual(store.favicons.get(iconHash), void 0);
    store.dispose();
  });
  test("favicons referenced by other entries are kept on delete", () => {
    const store = new BrowserHistoryStore();
    const a = store.add("https://a/", "A", "data:image/png;base64,XXX");
    store.add("https://b/", "B", "data:image/png;base64,XXX");
    const iconHash = store.entries.items[0].icon;
    a.delete();
    assert.strictEqual(store.favicons.get(iconHash), "data:image/png;base64,XXX");
    store.dispose();
  });
  test("clear wipes entries and favicons together", () => {
    const store = new BrowserHistoryStore();
    store.add("https://a/", "A", "data:image/png;base64,XXX");
    store.add("https://b/", "B", "data:image/png;base64,YYY");
    store.clear();
    assert.deepStrictEqual(store.entries.items, []);
    assert.deepStrictEqual(store.favicons.serialize().map, {});
    store.dispose();
  });
  test("onDidChange fires for changes in either sub-store", () => {
    const store = new BrowserHistoryStore();
    let count = 0;
    const sub = store.onDidChange(() => count++);
    const handle = store.add("https://a/", "A", "data:image/png;base64,XXX");
    const after1 = count;
    assert.ok(after1 >= 2);
    handle.update({ title: "A2" });
    assert.ok(count > after1);
    sub.dispose();
    store.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L3Rlc3QvY29tbW9uL2Jyb3dzZXJIaXN0b3J5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdEJyb3dzZXJGYXZpY29uc1N0b3JlLFxuXHRCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSxcblx0QnJvd3Nlckhpc3RvcnlTdG9yZSxcblx0SVNlcmlhbGl6ZWRCcm93c2VyRmF2aWNvbnNTbmFwc2hvdCxcblx0SVNlcmlhbGl6ZWRCcm93c2VySGlzdG9yeUVudHJpZXNTbmFwc2hvdCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJIaXN0b3J5LmpzJztcblxuc3VpdGUoJ0Jyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FkZCBhc3NpZ25zIG1vbm90b25pYyBpZHMgYW5kIGV4cG9zZXMgaXRlbXMgb2xkZXN0LWZpcnN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0Y29uc3QgYSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0Y29uc3QgYiA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgJ2ljb24tYicsIHRydWUpO1xuXHRcdGNvbnN0IGMgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYy8nLCAnQycsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbYS5pZCwgYi5pZCwgYy5pZF0sIFsxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtcy5tYXAoZSA9PiAoeyBpZDogZS5pZCwgdXJsOiBlLnVybCwgaWNvbjogZS5pY29uLCBleHBsaWNpdDogZS5leHBsaWNpdCB9KSksIFtcblx0XHRcdHsgaWQ6IDEsIHVybDogJ2h0dHBzOi8vYS8nLCBpY29uOiB1bmRlZmluZWQsIGV4cGxpY2l0OiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaWQ6IDIsIHVybDogJ2h0dHBzOi8vYi8nLCBpY29uOiAnaWNvbi1iJywgZXhwbGljaXQ6IHRydWUgfSxcblx0XHRcdHsgaWQ6IDMsIHVybDogJ2h0dHBzOi8vYy8nLCBpY29uOiB1bmRlZmluZWQsIGV4cGxpY2l0OiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwbGljaXQgaXMgb21pdHRlZCBmcm9tIHRoZSBlbnRyeSB3aGVuIGZhbHNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0Y29uc3QgZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGUsICdleHBsaWNpdCcpLCBmYWxzZSk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBjaGFuZ2VzIHRpdGxlIGFuZCBpY29uLCByZXR1cm5zIHdoZXRoZXIgYW55dGhpbmcgY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICcnLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUudXBkYXRlKDEsIHsgdGl0bGU6ICdBJyB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnVwZGF0ZSgxLCB7IGZhdmljb25IYXNoOiAnaWNvbi1hJyB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnVwZGF0ZSgxLCB7IHRpdGxlOiAnQScsIGZhdmljb25IYXNoOiAnaWNvbi1hJyB9KSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtc1swXS50aXRsZSwgJ0EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zWzBdLmljb24sICdpY29uLWEnKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlIGlnbm9yZXMgZW1wdHkgdGl0bGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS51cGRhdGUoMSwgeyB0aXRsZTogJycgfSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaXRlbXNbMF0udGl0bGUsICdBJyk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSBvZiBhbiB1bmtub3duIGlkIGlzIGEgbm8tb3AnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS51cGRhdGUoOTk5LCB7IHRpdGxlOiAnWCcgfSksIGZhbHNlKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHJlbW92ZXMgdGhlIHRhcmdldGVkIGVudHJ5IGFuZCBsZWF2ZXMgaWRzIG9mIG90aGVycyBpbnRhY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRjb25zdCBhID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRjb25zdCBiID0gc3RvcmUuYWRkKCdodHRwczovL2IvJywgJ0InLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRjb25zdCBjID0gc3RvcmUuYWRkKCdodHRwczovL2MvJywgJ0MnLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5kZWxldGUoYi5pZCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5kZWxldGUoYi5pZCksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLml0ZW1zLm1hcChlID0+IGUuaWQpLCBbYS5pZCwgYy5pZF0pO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQgYmV5b25kIG1heEVudHJpZXMgZXZpY3RzIG9sZGVzdCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgyKTtcblx0XHRzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2MvJywgJ0MnLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuaXRlbXMubWFwKGUgPT4gZS51cmwpLCBbJ2h0dHBzOi8vYi8nLCAnaHR0cHM6Ly9jLyddKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2UgZmlyZXMgZm9yIGFkZCwgdXBkYXRlLCBkZWxldGUsIGNsZWFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBzdWIgPSBzdG9yZS5vbkRpZENoYW5nZSgoKSA9PiBjb3VudCsrKTtcblxuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0c3RvcmUudXBkYXRlKDEsIHsgdGl0bGU6ICdBMicgfSk7XG5cdFx0c3RvcmUuZGVsZXRlKDEpO1xuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0Ly8gY2xlYXIgb24gYWxyZWFkeS1lbXB0eSBzdG9yZSBzaG91bGQgYmUgYSBuby1vcFxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDQpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZSB0aGVuIGh5ZHJhdGUgcm91bmQtdHJpcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdGEuYWRkKCdodHRwczovL2EvJywgJ0EnLCAnaWNvbi1hJywgdHJ1ZSk7XG5cdFx0YS5hZGQoJ2h0dHBzOi8vYi8nLCAnQicsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gYS5zZXJpYWxpemUoKTtcblxuXHRcdGNvbnN0IGIgPSBuZXcgQnJvd3Nlckhpc3RvcnlFbnRyaWVzU3RvcmUoKTtcblx0XHRiLmh5ZHJhdGUoc25hcHNob3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYi5zZXJpYWxpemUoKSwgc25hcHNob3QpO1xuXG5cdFx0YS5kaXNwb3NlKCk7XG5cdFx0Yi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2h5ZHJhdGUgc2VlZHMgdGhlIGlkIGNvdW50ZXIgZnJvbSB0aGUgbWF4IHJlc3RvcmVkIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0c3RvcmUuaHlkcmF0ZSh7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7IGlkOiA3LCB1cmw6ICdodHRwczovL2EvJywgdGltZTogMTAwLCB0aXRsZTogJ0EnIH0sXG5cdFx0XHRcdHsgaWQ6IDEyLCB1cmw6ICdodHRwczovL2IvJywgdGltZTogMjAwLCB0aXRsZTogJ0InIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG5leHQgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYy8nLCAnQycsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXh0LmlkLCAxMyk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZS5oeWRyYXRlIGJhY2t3YXJkcy1jb21wYXQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWNjZXB0cyBkYXRhIG1hdGNoaW5nIHByaW9yIHNuYXBzaG90IHNoYXBlcycsICgpID0+IHtcblx0XHQvLyBQcmV0ZW5kIHRoaXMgY2FtZSBvZmYgZGlzazogdHlwZWQgYXMgYHVua25vd25gLCBkZWxpYmVyYXRlbHkgdW50cnVzdGVkXG5cdFx0Ly8gc28gdGhlIHRlc3QgZ3VhcmRzIGFnYWluc3QgYWNjaWRlbnRhbCBmdXR1cmUgY2hhbmdlcyB0byByZXF1aXJlZCBmaWVsZHMuXG5cdFx0Ly8gSU1QT1JUQU5UOiBEb24ndCBjaGFuZ2UgdGhlIHNoYXBlIG9mIHRoaXMuIEl0IGVuc3VyZXMgY29tcGF0aWJpbGl0eSB3aXRoIHRoZSBlYXJsaWVzdCB2ZXJzaW9ucyBvZiB0aGUgaGlzdG9yeSBpbnRlcmZhY2UuXG5cdFx0Ly8gICAgICAgICAgICBXaGVuIHVwZGF0aW5nIHRoZSBpbnRlcmZhY2UsIHNpbXBseSBleHRlbmQgb3IgYWRkIGEgdGVzdCBmb3IgdGhlIG5ldyBzaGFwZS5cblx0XHRjb25zdCByYXc6IHVua25vd24gPSB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHR7IGlkOiAxLCB1cmw6ICdodHRwczovL2EvJywgdGltZTogMTAwLCB0aXRsZTogJ0EnIH0sXG5cdFx0XHRcdHsgaWQ6IDIsIHVybDogJ2h0dHBzOi8vYi8nLCB0aW1lOiAyMDAsIHRpdGxlOiAnQicsIGljb246ICdoMScgfSxcblx0XHRcdFx0eyBpZDogNCwgdXJsOiAnaHR0cHM6Ly9jLycsIHRpbWU6IDMwMCwgdGl0bGU6ICdDJywgZXhwbGljaXQ6IHRydWUgfSxcblx0XHRcdF0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0c3RvcmUuaHlkcmF0ZShyYXcgYXMgSVNlcmlhbGl6ZWRCcm93c2VySGlzdG9yeUVudHJpZXNTbmFwc2hvdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtcywgW1xuXHRcdFx0eyBpZDogMSwgdXJsOiAnaHR0cHM6Ly9hLycsIHRpbWU6IDEwMCwgdGl0bGU6ICdBJyB9LFxuXHRcdFx0eyBpZDogMiwgdXJsOiAnaHR0cHM6Ly9iLycsIHRpbWU6IDIwMCwgdGl0bGU6ICdCJywgaWNvbjogJ2gxJyB9LFxuXHRcdFx0eyBpZDogNCwgdXJsOiAnaHR0cHM6Ly9jLycsIHRpbWU6IDMwMCwgdGl0bGU6ICdDJywgZXhwbGljaXQ6IHRydWUgfSxcblx0XHRdKTtcblx0XHQvLyBOZXh0IGFkZCBtdXN0IG5vdCBjb2xsaWRlIHdpdGggcmVzdG9yZWQgaWRzLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5hZGQoJ2h0dHBzOi8vZC8nLCAnRCcsIHVuZGVmaW5lZCwgZmFsc2UpLmlkLCA1KTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgbWFsZm9ybWVkIGVudHJpZXMgYW5kIGFjY2VwdHMgdGhlIHJlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmF3OiB1bmtub3duID0ge1xuXHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0eyBpZDogMSwgdXJsOiAnaHR0cHM6Ly9hLycsIHRpbWU6IDEwMCwgdGl0bGU6ICdBJyB9LFxuXHRcdFx0XHR7IGlkOiAnYmFkJywgdXJsOiAnaHR0cHM6Ly9iLycsIHRpbWU6IDIwMCwgdGl0bGU6ICdCJyB9LFxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHR7IGlkOiAyIH0sIC8vIG1pc3NpbmcgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRcdHsgaWQ6IDMsIHVybDogJ2h0dHBzOi8vYy8nLCB0aW1lOiAzMDAsIHRpdGxlOiAnQycsIGV4cGxpY2l0OiAneWVzJyB9LCAvLyBiYWQgZXhwbGljaXRcblx0XHRcdF0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5RW50cmllc1N0b3JlKCk7XG5cdFx0c3RvcmUuaHlkcmF0ZShyYXcgYXMgSVNlcmlhbGl6ZWRCcm93c2VySGlzdG9yeUVudHJpZXNTbmFwc2hvdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtcy5tYXAoZSA9PiBlLmlkKSwgWzFdKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndW5kZWZpbmVkIHNuYXBzaG90IHJlc2V0cyB0byBhbiBlbXB0eSBzdG9yZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeUVudHJpZXNTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgdW5kZWZpbmVkLCBmYWxzZSk7XG5cblx0XHRzdG9yZS5oeWRyYXRlKHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5pdGVtcywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5hZGQoJ2h0dHBzOi8vYi8nLCAnQicsIHVuZGVmaW5lZCwgZmFsc2UpLmlkLCAxKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Jyb3dzZXJGYXZpY29uc1N0b3JlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyIGRlZHVwcyBieSBjb250ZW50IGFuZCByZXR1cm5zIHRoZSBzYW1lIGhhc2gnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3NlckZhdmljb25zU3RvcmUoKTtcblx0XHRjb25zdCBoMSA9IHN0b3JlLnJlZ2lzdGVyKCdkYXRhOmltYWdlL3BuZztiYXNlNjQsQUFBJyk7XG5cdFx0Y29uc3QgaDIgPSBzdG9yZS5yZWdpc3RlcignZGF0YTppbWFnZS9wbmc7YmFzZTY0LEFBQScpO1xuXHRcdGNvbnN0IGgzID0gc3RvcmUucmVnaXN0ZXIoJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxCQkInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoMSwgaDIpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChoMSwgaDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoaDEpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEFBQScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5nZXQoaDMpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEJCQicpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZSBmaXJlcyBvbmx5IHdoZW4gYSBuZXcgZmF2aWNvbiBpcyBhZGRlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VyRmF2aWNvbnNTdG9yZSgpO1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3ViID0gc3RvcmUub25EaWRDaGFuZ2UoKCkgPT4gY291bnQrKyk7XG5cblx0XHRzdG9yZS5yZWdpc3RlcignYScpO1xuXHRcdHN0b3JlLnJlZ2lzdGVyKCdhJyk7IC8vIGR1cGxpY2F0ZSBcdTIwMTQgbm8gZXZlbnRcblx0XHRzdG9yZS5yZWdpc3RlcignYicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAyKTtcblxuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnYyBkcm9wcyBvcnBoYW5zIGFuZCBmaXJlcyBvbkRpZENoYW5nZSBvbmx5IHdoZW4gc29tZXRoaW5nIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3NlckZhdmljb25zU3RvcmUoKTtcblx0XHRjb25zdCBoMSA9IHN0b3JlLnJlZ2lzdGVyKCdhJyk7XG5cdFx0Y29uc3QgaDIgPSBzdG9yZS5yZWdpc3RlcignYicpO1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3ViID0gc3RvcmUub25EaWRDaGFuZ2UoKCkgPT4gY291bnQrKyk7XG5cblx0XHRzdG9yZS5nYyhuZXcgU2V0KFtoMV0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZ2V0KGgyKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZ2V0KGgxKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXG5cdFx0Ly8gTm90aGluZyB0byByZW1vdmUgXHUyMTkyIG5vIGV2ZW50LlxuXHRcdHN0b3JlLmdjKG5ldyBTZXQoW2gxXSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplIHRoZW4gaHlkcmF0ZSByb3VuZC10cmlwcycsICgpID0+IHtcblx0XHRjb25zdCBhID0gbmV3IEJyb3dzZXJGYXZpY29uc1N0b3JlKCk7XG5cdFx0YS5yZWdpc3Rlcignb25lJyk7XG5cdFx0YS5yZWdpc3RlcigndHdvJyk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhLnNlcmlhbGl6ZSgpO1xuXG5cdFx0Y29uc3QgYiA9IG5ldyBCcm93c2VyRmF2aWNvbnNTdG9yZSgpO1xuXHRcdGIuaHlkcmF0ZShzbmFwc2hvdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChiLnNlcmlhbGl6ZSgpLCBzbmFwc2hvdCk7XG5cblx0XHRhLmRpc3Bvc2UoKTtcblx0XHRiLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaHlkcmF0ZSBhY2NlcHRzIHVua25vd24tdHlwZWQgZGF0YSBtYXRjaGluZyB0aGUgY3VycmVudCBzbmFwc2hvdCBzaGFwZScsICgpID0+IHtcblx0XHRjb25zdCByYXc6IHVua25vd24gPSB7XG5cdFx0XHRtYXA6IHtcblx0XHRcdFx0YWJjOiAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LEFBQScsXG5cdFx0XHRcdGRlZjogJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxCQkInLFxuXHRcdFx0XHQvLyBub24tc3RyaW5nIHZhbHVlcyBkcm9wcGVkIHNpbGVudGx5XG5cdFx0XHRcdGJhZDogMTIzLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3NlckZhdmljb25zU3RvcmUoKTtcblx0XHRzdG9yZS5oeWRyYXRlKHJhdyBhcyBJU2VyaWFsaXplZEJyb3dzZXJGYXZpY29uc1NuYXBzaG90KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZ2V0KCdhYmMnKSwgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxBQUEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZ2V0KCdkZWYnKSwgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxCQkInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZ2V0KCdiYWQnKSwgdW5kZWZpbmVkKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Jyb3dzZXJIaXN0b3J5U3RvcmUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWRkIHJldHVybnMgYSBoYW5kbGUgd2hvc2UgaWQgbWF0Y2hlcyB0aGUgdW5kZXJseWluZyBlbnRyeScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCk7XG5cdFx0Y29uc3QgaGFuZGxlID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYW5kbGUuaWQsIHN0b3JlLmVudHJpZXMuaXRlbXNbMF0uaWQpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGQgaXMgYSBuby1vcCB3aGVuIG1heCBlbnRyaWVzIGlzIDAnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlTdG9yZSgwKTtcblx0XHRjb25zdCBoYW5kbGUgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLmVudHJpZXMuaXRlbXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3JlLmZhdmljb25zLnNlcmlhbGl6ZSgpLm1hcCwge30pO1xuXHRcdC8vIEhhbmRsZSBzaG91bGQgYmUgc2FmZWx5IGNhbGxhYmxlLlxuXHRcdGhhbmRsZS51cGRhdGUoeyB0aXRsZTogJ0InIH0pO1xuXHRcdGhhbmRsZS5kZWxldGUoKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlLnVwZGF0ZSBwcm9wYWdhdGVzIHRvIGVudHJ5IGFuZCByZWdpc3RlcnMgdGhlIGZhdmljb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICcnKTtcblx0XHRoYW5kbGUudXBkYXRlKHsgdGl0bGU6ICdBJywgZmF2aWNvbjogJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnIH0pO1xuXG5cdFx0Y29uc3QgZW50cnkgPSBzdG9yZS5lbnRyaWVzLml0ZW1zWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS50aXRsZSwgJ0EnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoZW50cnkuaWNvbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuZmF2aWNvbnMuZ2V0KGVudHJ5Lmljb24hKSwgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlLnVwZGF0ZSB3aXRoIGV4cGxpY2l0IGBmYXZpY29uOiBudWxsYCBjbGVhcnMgdGhlIGVudHJ5IGljb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgQnJvd3Nlckhpc3RvcnlTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc3RvcmUuZW50cmllcy5pdGVtc1swXS5pY29uLCB1bmRlZmluZWQpO1xuXG5cdFx0aGFuZGxlLnVwZGF0ZSh7IGZhdmljb246IG51bGwgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmVudHJpZXMuaXRlbXNbMF0uaWNvbiwgdW5kZWZpbmVkKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlLmRlbGV0ZSByZW1vdmVzIHRoZSBlbnRyeSBhbmQgR0NzIHRoZSBvcnBoYW5lZCBmYXZpY29uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKTtcblx0XHRjb25zdCBoYW5kbGUgPSBzdG9yZS5hZGQoJ2h0dHBzOi8vYS8nLCAnQScsICdkYXRhOmltYWdlL3BuZztiYXNlNjQsWFhYJyk7XG5cdFx0Y29uc3QgaWNvbkhhc2ggPSBzdG9yZS5lbnRyaWVzLml0ZW1zWzBdLmljb24hO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5mYXZpY29ucy5nZXQoaWNvbkhhc2gpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXG5cdFx0aGFuZGxlLmRlbGV0ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RvcmUuZW50cmllcy5pdGVtcywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5mYXZpY29ucy5nZXQoaWNvbkhhc2gpLCB1bmRlZmluZWQpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYXZpY29ucyByZWZlcmVuY2VkIGJ5IG90aGVyIGVudHJpZXMgYXJlIGtlcHQgb24gZGVsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IEJyb3dzZXJIaXN0b3J5U3RvcmUoKTtcblx0XHRjb25zdCBhID0gc3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblx0XHRjb25zdCBpY29uSGFzaCA9IHN0b3JlLmVudHJpZXMuaXRlbXNbMF0uaWNvbiE7XG5cblx0XHRhLmRlbGV0ZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5mYXZpY29ucy5nZXQoaWNvbkhhc2gpLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhciB3aXBlcyBlbnRyaWVzIGFuZCBmYXZpY29ucyB0b2dldGhlcicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKCdodHRwczovL2EvJywgJ0EnLCAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LFhYWCcpO1xuXHRcdHN0b3JlLmFkZCgnaHR0cHM6Ly9iLycsICdCJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxZWVknKTtcblxuXHRcdHN0b3JlLmNsZWFyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5lbnRyaWVzLml0ZW1zLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdG9yZS5mYXZpY29ucy5zZXJpYWxpemUoKS5tYXAsIHt9KTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnb25EaWRDaGFuZ2UgZmlyZXMgZm9yIGNoYW5nZXMgaW4gZWl0aGVyIHN1Yi1zdG9yZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBCcm93c2VySGlzdG9yeVN0b3JlKCk7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBzdWIgPSBzdG9yZS5vbkRpZENoYW5nZSgoKSA9PiBjb3VudCsrKTtcblxuXHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZCgnaHR0cHM6Ly9hLycsICdBJywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxYWFgnKTtcblx0XHQvLyBhZGQgZmlyZWQ6IHJlZ2lzdGVyIGZhdmljb24gKCsxKSwgYWRkIGVudHJ5ICgrMSksIGZhdmljb24gR0MgbWF5IGFsc28gZmlyZVxuXHRcdGNvbnN0IGFmdGVyMSA9IGNvdW50O1xuXHRcdGFzc2VydC5vayhhZnRlcjEgPj0gMik7XG5cblx0XHRoYW5kbGUudXBkYXRlKHsgdGl0bGU6ICdBMicgfSk7IC8vIGVudHJ5IGNoYW5nZSBcdTIxOTIgYXQgbGVhc3Qgb25lIG1vcmVcblx0XHRhc3NlcnQub2soY291bnQgPiBhZnRlcjEpO1xuXG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUdNO0FBRVAsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QywwQ0FBd0M7QUFFeEMsT0FBSyw0REFBNEQsTUFBTTtBQUN0RSxVQUFNLFFBQVEsSUFBSSwyQkFBMkI7QUFDN0MsVUFBTSxJQUFJLE1BQU0sSUFBSSxjQUFjLEtBQUssUUFBVyxLQUFLO0FBQ3ZELFVBQU0sSUFBSSxN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
