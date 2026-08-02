import assert from "assert";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { ResourcePool, KeyedResourcePool } from "../../../../browser/widget/chatContentParts/chatCollections.js";
class MockPoolItem {
  constructor() {
    this.isDisposed = false;
  }
  dispose() {
    this.isDisposed = true;
  }
}
suite("ResourcePool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let createCount;
  setup(() => {
    disposables = store.add(new DisposableStore());
    createCount = 0;
  });
  function createPool(options) {
    const pool = new ResourcePool(() => {
      createCount++;
      return new MockPoolItem();
    }, options);
    disposables.add(pool);
    return pool;
  }
  test("creates new items on get", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    assert.notStrictEqual(a, b);
    assert.strictEqual(createCount, 2);
    assert.strictEqual(pool.inUse.size, 2);
  });
  test("reuses released items", () => {
    const pool = createPool();
    const a = pool.get();
    pool.release(a);
    const b = pool.get();
    assert.strictEqual(a, b);
    assert.strictEqual(createCount, 1);
  });
  test("clear disposes idle items but not in-use items", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    pool.release(b);
    pool.clear();
    assert.ok(b.isDisposed, "idle item should be disposed");
    assert.ok(!a.isDisposed, "in-use item should not be disposed");
    assert.strictEqual(pool.inUse.size, 1);
  });
  test("dispose disposes all items including in-use", () => {
    const pool = createPool();
    const a = pool.get();
    const b = pool.get();
    pool.release(b);
    disposables.delete(pool);
    pool.dispose();
    assert.ok(a.isDisposed, "in-use item should be disposed");
    assert.ok(b.isDisposed, "idle item should be disposed");
  });
  test("trimming disposes excess idle items after delay", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });
    const a = pool.get();
    const b = pool.get();
    const c = pool.get();
    pool.release(a);
    pool.release(b);
    pool.release(c);
    assert.ok(!a.isDisposed);
    assert.ok(!b.isDisposed);
    assert.ok(!c.isDisposed);
    await timeout(100);
    const disposedCount = [a, b, c].filter((x) => x.isDisposed).length;
    assert.strictEqual(disposedCount, 2, "should dispose 2 excess items");
  }));
  test("trim timer is debounced on rapid releases", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 100 });
    const a = pool.get();
    pool.release(a);
    assert.ok(!a.isDisposed, "should not be disposed immediately");
    const b = pool.get();
    pool.release(b);
    await timeout(50);
    assert.ok(!a.isDisposed, "should not be disposed yet (timer was debounced)");
    await timeout(100);
    assert.ok(a.isDisposed, "should be disposed after debounce completes");
  }));
  test("no trimming when maxIdleSize is not set", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool();
    const items = [];
    for (let i = 0; i < 10; i++) {
      items.push(pool.get());
    }
    for (const item of items) {
      pool.release(item);
    }
    await timeout(50);
    assert.ok(items.every((i) => !i.isDisposed), "no items should be disposed without maxIdleSize");
  }));
});
suite("KeyedResourcePool", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let createCount;
  setup(() => {
    disposables = store.add(new DisposableStore());
    createCount = 0;
  });
  function createPool(options) {
    const pool = new KeyedResourcePool(() => {
      createCount++;
      return new MockPoolItem();
    }, options);
    disposables.add(pool);
    return pool;
  }
  test("creates new items on get", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    assert.notStrictEqual(a, b);
    assert.strictEqual(createCount, 2);
    assert.strictEqual(pool.inUse.size, 2);
  });
  test("keyed get returns item previously released with same key", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    const c = pool.get("key2");
    assert.strictEqual(c, b, "should return the item released with key2");
    const d = pool.get("key1");
    assert.strictEqual(d, a, "should return the item released with key1");
    assert.strictEqual(createCount, 2);
  });
  test("keyed get falls back to any idle item when key not found", () => {
    const pool = createPool();
    const a = pool.get("key1");
    pool.release(a, "key1");
    const b = pool.get("unknown-key");
    assert.strictEqual(b, a, "should return the idle item even with a different key");
  });
  test("multiple items can share the same key", () => {
    const pool = createPool();
    const a = pool.get("shared");
    const b = pool.get("shared");
    assert.notStrictEqual(a, b, "should create separate items");
    pool.release(a, "shared");
    pool.release(b, "shared");
    const c = pool.get("shared");
    assert.ok(c === a || c === b, "should return one of the keyed items");
  });
  test("key reassignment removes old key association", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    const reused = pool.get("key1");
    assert.strictEqual(reused, a);
    pool.release(reused, "key2");
    const c = pool.get("key1");
    pool.release(c, "key1");
    const d = pool.get("key2");
    assert.ok(d === a || d === b);
  });
  test("clear disposes idle items and clears key map", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(a, "key1");
    pool.release(b, "key2");
    pool.clear();
    assert.ok(a.isDisposed);
    assert.ok(b.isDisposed);
    const c = pool.get("key1");
    assert.notStrictEqual(c, a, "should create new item after clear");
  });
  test("dispose disposes all items including in-use", () => {
    const pool = createPool();
    const a = pool.get("key1");
    const b = pool.get("key2");
    pool.release(b, "key2");
    disposables.delete(pool);
    pool.dispose();
    assert.ok(a.isDisposed);
    assert.ok(b.isDisposed);
  });
  test("trimming disposes excess idle items", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 1, trimIdleDelay: 50 });
    const a = pool.get("a");
    const b = pool.get("b");
    const c = pool.get("c");
    pool.release(a, "a");
    pool.release(b, "b");
    pool.release(c, "c");
    await timeout(100);
    const disposedCount = [a, b, c].filter((x) => x.isDisposed).length;
    assert.strictEqual(disposedCount, 2, "should dispose 2 excess items");
  }));
  test("trimming cleans up key associations for disposed items", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const pool = createPool({ maxIdleSize: 0, trimIdleDelay: 50 });
    const a = pool.get("key1");
    pool.release(a, "key1");
    await timeout(100);
    assert.ok(a.isDisposed);
    const b = pool.get("key1");
    assert.notStrictEqual(a, b, "should create new item since keyed item was trimmed");
    assert.strictEqual(createCount, 2);
  }));
  test("repeated key reassignment does not grow stale associations", () => {
    const pool = createPool();
    const item = pool.get("key-0");
    for (let i = 0; i < 100; i++) {
      pool.release(item, `key-${i}`);
      const reused = pool.get(`key-${i}`);
      assert.strictEqual(reused, item);
    }
    pool.release(item, "final-key");
    const result = pool.get("final-key");
    assert.strictEqual(result, item);
    assert.strictEqual(createCount, 1, "should have only created one item");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL3Jlc291cmNlUG9vbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VQb29sLCBLZXllZFJlc291cmNlUG9vbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxlY3Rpb25zLmpzJztcblxuY2xhc3MgTW9ja1Bvb2xJdGVtIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuXG5zdWl0ZSgnUmVzb3VyY2VQb29sJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGNyZWF0ZUNvdW50OiBudW1iZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y3JlYXRlQ291bnQgPSAwO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVQb29sKG9wdGlvbnM/OiB7IG1heElkbGVTaXplPzogbnVtYmVyOyB0cmltSWRsZURlbGF5PzogbnVtYmVyIH0pOiBSZXNvdXJjZVBvb2w8TW9ja1Bvb2xJdGVtPiB7XG5cdFx0Y29uc3QgcG9vbCA9IG5ldyBSZXNvdXJjZVBvb2w8TW9ja1Bvb2xJdGVtPigoKSA9PiB7XG5cdFx0XHRjcmVhdGVDb3VudCsrO1xuXHRcdFx0cmV0dXJuIG5ldyBNb2NrUG9vbEl0ZW0oKTtcblx0XHR9LCBvcHRpb25zKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocG9vbCk7XG5cdFx0cmV0dXJuIHBvb2w7XG5cdH1cblxuXHR0ZXN0KCdjcmVhdGVzIG5ldyBpdGVtcyBvbiBnZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYSwgYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUNvdW50LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9vbC5pblVzZS5zaXplLCAyKTtcblx0fSk7XG5cblx0dGVzdCgncmV1c2VzIHJlbGVhc2VkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCk7XG5cdFx0cG9vbC5yZWxlYXNlKGEpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLCBiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGVhciBkaXNwb3NlcyBpZGxlIGl0ZW1zIGJ1dCBub3QgaW4tdXNlIGl0ZW1zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCk7XG5cdFx0cG9vbC5yZWxlYXNlKGIpO1xuXG5cdFx0cG9vbC5jbGVhcigpO1xuXG5cdFx0YXNzZXJ0Lm9rKGIuaXNEaXNwb3NlZCwgJ2lkbGUgaXRlbSBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQub2soIWEuaXNEaXNwb3NlZCwgJ2luLXVzZSBpdGVtIHNob3VsZCBub3QgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9vbC5pblVzZS5zaXplLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBkaXNwb3NlcyBhbGwgaXRlbXMgaW5jbHVkaW5nIGluLXVzZScsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgpO1xuXHRcdHBvb2wucmVsZWFzZShiKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRlbGV0ZShwb29sKTtcblx0XHRwb29sLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayhhLmlzRGlzcG9zZWQsICdpbi11c2UgaXRlbSBzaG91bGQgYmUgZGlzcG9zZWQnKTtcblx0XHRhc3NlcnQub2soYi5pc0Rpc3Bvc2VkLCAnaWRsZSBpdGVtIHNob3VsZCBiZSBkaXNwb3NlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmltbWluZyBkaXNwb3NlcyBleGNlc3MgaWRsZSBpdGVtcyBhZnRlciBkZWxheScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKHsgbWF4SWRsZVNpemU6IDEsIHRyaW1JZGxlRGVsYXk6IDUwIH0pO1xuXG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCk7XG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCk7XG5cdFx0cG9vbC5yZWxlYXNlKGEpO1xuXHRcdHBvb2wucmVsZWFzZShiKTtcblx0XHRwb29sLnJlbGVhc2UoYyk7XG5cblx0XHRhc3NlcnQub2soIWEuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0Lm9rKCFiLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayghYy5pc0Rpc3Bvc2VkKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VkQ291bnQgPSBbYSwgYiwgY10uZmlsdGVyKHggPT4geC5pc0Rpc3Bvc2VkKS5sZW5ndGg7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VkQ291bnQsIDIsICdzaG91bGQgZGlzcG9zZSAyIGV4Y2VzcyBpdGVtcycpO1xuXHR9KSk7XG5cblx0dGVzdCgndHJpbSB0aW1lciBpcyBkZWJvdW5jZWQgb24gcmFwaWQgcmVsZWFzZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCh7IG1heElkbGVTaXplOiAwLCB0cmltSWRsZURlbGF5OiAxMDAgfSk7XG5cblx0XHRjb25zdCBhID0gcG9vbC5nZXQoKTtcblx0XHRwb29sLnJlbGVhc2UoYSk7XG5cdFx0YXNzZXJ0Lm9rKCFhLmlzRGlzcG9zZWQsICdzaG91bGQgbm90IGJlIGRpc3Bvc2VkIGltbWVkaWF0ZWx5Jyk7XG5cblx0XHRjb25zdCBiID0gcG9vbC5nZXQoKTtcblx0XHRwb29sLnJlbGVhc2UoYik7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblx0XHRhc3NlcnQub2soIWEuaXNEaXNwb3NlZCwgJ3Nob3VsZCBub3QgYmUgZGlzcG9zZWQgeWV0ICh0aW1lciB3YXMgZGVib3VuY2VkKScpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdGFzc2VydC5vayhhLmlzRGlzcG9zZWQsICdzaG91bGQgYmUgZGlzcG9zZWQgYWZ0ZXIgZGVib3VuY2UgY29tcGxldGVzJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdubyB0cmltbWluZyB3aGVuIG1heElkbGVTaXplIGlzIG5vdCBzZXQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXG5cdFx0Y29uc3QgaXRlbXMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwOyBpKyspIHtcblx0XHRcdGl0ZW1zLnB1c2gocG9vbC5nZXQoKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0cG9vbC5yZWxlYXNlKGl0ZW0pO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXHRcdGFzc2VydC5vayhpdGVtcy5ldmVyeShpID0+ICFpLmlzRGlzcG9zZWQpLCAnbm8gaXRlbXMgc2hvdWxkIGJlIGRpc3Bvc2VkIHdpdGhvdXQgbWF4SWRsZVNpemUnKTtcblx0fSkpO1xufSk7XG5cbnN1aXRlKCdLZXllZFJlc291cmNlUG9vbCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBjcmVhdGVDb3VudDogbnVtYmVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNyZWF0ZUNvdW50ID0gMDtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlUG9vbChvcHRpb25zPzogeyBtYXhJZGxlU2l6ZT86IG51bWJlcjsgdHJpbUlkbGVEZWxheT86IG51bWJlciB9KTogS2V5ZWRSZXNvdXJjZVBvb2w8TW9ja1Bvb2xJdGVtPiB7XG5cdFx0Y29uc3QgcG9vbCA9IG5ldyBLZXllZFJlc291cmNlUG9vbDxNb2NrUG9vbEl0ZW0+KCgpID0+IHtcblx0XHRcdGNyZWF0ZUNvdW50Kys7XG5cdFx0XHRyZXR1cm4gbmV3IE1vY2tQb29sSXRlbSgpO1xuXHRcdH0sIG9wdGlvbnMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwb29sKTtcblx0XHRyZXR1cm4gcG9vbDtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZXMgbmV3IGl0ZW1zIG9uIGdldCcsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhLCBiKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3JlYXRlQ291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwb29sLmluVXNlLnNpemUsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZXllZCBnZXQgcmV0dXJucyBpdGVtIHByZXZpb3VzbHkgcmVsZWFzZWQgd2l0aCBzYW1lIGtleScsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdHBvb2wucmVsZWFzZShhLCAna2V5MScpO1xuXHRcdHBvb2wucmVsZWFzZShiLCAna2V5MicpO1xuXG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCdrZXkyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGMsIGIsICdzaG91bGQgcmV0dXJuIHRoZSBpdGVtIHJlbGVhc2VkIHdpdGgga2V5MicpO1xuXG5cdFx0Y29uc3QgZCA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQsIGEsICdzaG91bGQgcmV0dXJuIHRoZSBpdGVtIHJlbGVhc2VkIHdpdGgga2V5MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2tleWVkIGdldCBmYWxscyBiYWNrIHRvIGFueSBpZGxlIGl0ZW0gd2hlbiBrZXkgbm90IGZvdW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdrZXkxJyk7XG5cblx0XHRjb25zdCBiID0gcG9vbC5nZXQoJ3Vua25vd24ta2V5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIsIGEsICdzaG91bGQgcmV0dXJuIHRoZSBpZGxlIGl0ZW0gZXZlbiB3aXRoIGEgZGlmZmVyZW50IGtleScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBpdGVtcyBjYW4gc2hhcmUgdGhlIHNhbWUga2V5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKCk7XG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdzaGFyZWQnKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoJ3NoYXJlZCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhLCBiLCAnc2hvdWxkIGNyZWF0ZSBzZXBhcmF0ZSBpdGVtcycpO1xuXHRcdHBvb2wucmVsZWFzZShhLCAnc2hhcmVkJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGIsICdzaGFyZWQnKTtcblxuXHRcdGNvbnN0IGMgPSBwb29sLmdldCgnc2hhcmVkJyk7XG5cdFx0YXNzZXJ0Lm9rKGMgPT09IGEgfHwgYyA9PT0gYiwgJ3Nob3VsZCByZXR1cm4gb25lIG9mIHRoZSBrZXllZCBpdGVtcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZXkgcmVhc3NpZ25tZW50IHJlbW92ZXMgb2xkIGtleSBhc3NvY2lhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwb29sID0gY3JlYXRlUG9vbCgpO1xuXHRcdGNvbnN0IGEgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MicpO1xuXHRcdHBvb2wucmVsZWFzZShhLCAna2V5MScpO1xuXHRcdHBvb2wucmVsZWFzZShiLCAna2V5MicpO1xuXG5cdFx0Ly8gUmV1c2UgYSB2aWEga2V5MSwgdGhlbiByZWxlYXNlIGl0IHVuZGVyIGtleTJcblx0XHRjb25zdCByZXVzZWQgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXVzZWQsIGEpO1xuXHRcdHBvb2wucmVsZWFzZShyZXVzZWQsICdrZXkyJyk7XG5cblx0XHQvLyBrZXkxIHNob3VsZCBub3QgZmluZCBhIGFueW1vcmUgXHUyMDE0IG9ubHkgYiBpcyBhc3NvY2lhdGVkIHdpdGggaXRzIG9yaWdpbmFsIGtleTJcblx0XHQvLyBCdXQgYSB3YXMgcmVhc3NpZ25lZCB0byBrZXkyLCBzbyBrZXkyIG5vdyBoYXMgYm90aCBhIGFuZCBiXG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0Ly8ga2V5MSBoYXMgbm8gYXNzb2NpYXRpb25zLCBmYWxscyBiYWNrIHRvIGdlbmVyaWMgXHUyMDE0IGdldHMgd2hhdGV2ZXIgaXMgb24gdG9wXG5cdFx0cG9vbC5yZWxlYXNlKGMsICdrZXkxJyk7XG5cblx0XHQvLyBrZXkyIHNob3VsZCBzdGlsbCBmaW5kIG9uZSBvZiB7YSwgYn1cblx0XHRjb25zdCBkID0gcG9vbC5nZXQoJ2tleTInKTtcblx0XHRhc3NlcnQub2soZCA9PT0gYSB8fCBkID09PSBiKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXIgZGlzcG9zZXMgaWRsZSBpdGVtcyBhbmQgY2xlYXJzIGtleSBtYXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoJ2tleTInKTtcblx0XHRwb29sLnJlbGVhc2UoYSwgJ2tleTEnKTtcblx0XHRwb29sLnJlbGVhc2UoYiwgJ2tleTInKTtcblxuXHRcdHBvb2wuY2xlYXIoKTtcblxuXHRcdGFzc2VydC5vayhhLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayhiLmlzRGlzcG9zZWQpO1xuXG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGMsIGEsICdzaG91bGQgY3JlYXRlIG5ldyBpdGVtIGFmdGVyIGNsZWFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgZGlzcG9zZXMgYWxsIGl0ZW1zIGluY2x1ZGluZyBpbi11c2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBhID0gcG9vbC5nZXQoJ2tleTEnKTtcblx0XHRjb25zdCBiID0gcG9vbC5nZXQoJ2tleTInKTtcblx0XHRwb29sLnJlbGVhc2UoYiwgJ2tleTInKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRlbGV0ZShwb29sKTtcblx0XHRwb29sLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayhhLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydC5vayhiLmlzRGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmltbWluZyBkaXNwb3NlcyBleGNlc3MgaWRsZSBpdGVtcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKHsgbWF4SWRsZVNpemU6IDEsIHRyaW1JZGxlRGVsYXk6IDUwIH0pO1xuXG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdhJyk7XG5cdFx0Y29uc3QgYiA9IHBvb2wuZ2V0KCdiJyk7XG5cdFx0Y29uc3QgYyA9IHBvb2wuZ2V0KCdjJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdhJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGIsICdiJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGMsICdjJyk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cblx0XHRjb25zdCBkaXNwb3NlZENvdW50ID0gW2EsIGIsIGNdLmZpbHRlcih4ID0+IHguaXNEaXNwb3NlZCkubGVuZ3RoO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlZENvdW50LCAyLCAnc2hvdWxkIGRpc3Bvc2UgMiBleGNlc3MgaXRlbXMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3RyaW1taW5nIGNsZWFucyB1cCBrZXkgYXNzb2NpYXRpb25zIGZvciBkaXNwb3NlZCBpdGVtcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBvb2wgPSBjcmVhdGVQb29sKHsgbWF4SWRsZVNpemU6IDAsIHRyaW1JZGxlRGVsYXk6IDUwIH0pO1xuXG5cdFx0Y29uc3QgYSA9IHBvb2wuZ2V0KCdrZXkxJyk7XG5cdFx0cG9vbC5yZWxlYXNlKGEsICdrZXkxJyk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cblx0XHRhc3NlcnQub2soYS5pc0Rpc3Bvc2VkKTtcblxuXHRcdGNvbnN0IGIgPSBwb29sLmdldCgna2V5MScpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhLCBiLCAnc2hvdWxkIGNyZWF0ZSBuZXcgaXRlbSBzaW5jZSBrZXllZCBpdGVtIHdhcyB0cmltbWVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZUNvdW50LCAyKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlcGVhdGVkIGtleSByZWFzc2lnbm1lbnQgZG9lcyBub3QgZ3JvdyBzdGFsZSBhc3NvY2lhdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcG9vbCA9IGNyZWF0ZVBvb2woKTtcblx0XHRjb25zdCBpdGVtID0gcG9vbC5nZXQoJ2tleS0wJyk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG5cdFx0XHRwb29sLnJlbGVhc2UoaXRlbSwgYGtleS0ke2l9YCk7XG5cdFx0XHRjb25zdCByZXVzZWQgPSBwb29sLmdldChga2V5LSR7aX1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXVzZWQsIGl0ZW0pO1xuXHRcdH1cblxuXHRcdHBvb2wucmVsZWFzZShpdGVtLCAnZmluYWwta2V5Jyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcG9vbC5nZXQoJ2ZpbmFsLWtleScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGl0ZW0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVDb3VudCwgMSwgJ3Nob3VsZCBoYXZlIG9ubHkgY3JlYXRlZCBvbmUgaXRlbScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FB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
