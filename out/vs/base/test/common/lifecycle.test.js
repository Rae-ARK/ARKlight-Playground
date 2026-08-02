import assert from "assert";
import { Emitter } from "../../common/event.js";
import { DisposableSet, DisposableStore, dispose, markAsSingleton, ReferenceCollection, thenIfNotDisposed, toDisposable } from "../../common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite, throwIfDisposablesAreLeaked } from "./utils.js";
class Disposable {
  constructor() {
    this.isDisposed = false;
  }
  dispose() {
    this.isDisposed = true;
  }
}
suite("Lifecycle", () => {
  test("dispose single disposable", () => {
    const disposable = new Disposable();
    assert(!disposable.isDisposed);
    dispose(disposable);
    assert(disposable.isDisposed);
  });
  test("dispose disposable array", () => {
    const disposable = new Disposable();
    const disposable2 = new Disposable();
    assert(!disposable.isDisposed);
    assert(!disposable2.isDisposed);
    dispose([disposable, disposable2]);
    assert(disposable.isDisposed);
    assert(disposable2.isDisposed);
  });
  test("dispose disposables", () => {
    const disposable = new Disposable();
    const disposable2 = new Disposable();
    assert(!disposable.isDisposed);
    assert(!disposable2.isDisposed);
    dispose(disposable);
    dispose(disposable2);
    assert(disposable.isDisposed);
    assert(disposable2.isDisposed);
  });
  test("dispose array should dispose all if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    let thrownError;
    try {
      dispose([
        toDisposable(() => {
          disposedValues.add(1);
        }),
        toDisposable(() => {
          throw new Error("I am error");
        }),
        toDisposable(() => {
          disposedValues.add(3);
        })
      ]);
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("dispose array should rethrow composite error if multiple entries throw on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    let thrownError;
    try {
      dispose([
        toDisposable(() => {
          disposedValues.add(1);
        }),
        toDisposable(() => {
          throw new Error("I am error 1");
        }),
        toDisposable(() => {
          throw new Error("I am error 2");
        }),
        toDisposable(() => {
          disposedValues.add(4);
        })
      ]);
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(4));
    assert.ok(thrownError instanceof AggregateError);
    assert.strictEqual(thrownError.errors.length, 2);
    assert.strictEqual(thrownError.errors[0].message, "I am error 1");
    assert.strictEqual(thrownError.errors[1].message, "I am error 2");
  });
  test("Action bar has broken accessibility #100273", function() {
    const array = [{ dispose() {
    } }, { dispose() {
    } }];
    const array2 = dispose(array);
    assert.strictEqual(array.length, 2);
    assert.strictEqual(array2.length, 0);
    assert.ok(array !== array2);
    const set = /* @__PURE__ */ new Set([{ dispose() {
    } }, { dispose() {
    } }]);
    const setValues = set.values();
    const setValues2 = dispose(setValues);
    assert.ok(setValues === setValues2);
  });
});
suite("DisposableStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose should call all child disposes even if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error");
    }));
    store.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    let thrownError;
    try {
      store.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("dispose should throw composite error if multiple children throw on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error 1");
    }));
    store.add(toDisposable(() => {
      throw new Error("I am error 2");
    }));
    store.add(toDisposable(() => {
      disposedValues.add(4);
    }));
    let thrownError;
    try {
      store.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(4));
    assert.ok(thrownError instanceof AggregateError);
    assert.strictEqual(thrownError.errors.length, 2);
    assert.strictEqual(thrownError.errors[0].message, "I am error 1");
    assert.strictEqual(thrownError.errors[1].message, "I am error 2");
  });
  test("delete should evict and dispose of the disposables", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const disposables = [
      toDisposable(() => {
        disposedValues.add(1);
      }),
      toDisposable(() => {
        disposedValues.add(2);
      })
    ];
    const store = new DisposableStore();
    store.add(disposables[0]);
    store.add(disposables[1]);
    store.delete(disposables[0]);
    assert.ok(disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    store.dispose();
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(2));
  });
  test("deleteAndLeak should evict and not dispose of the disposables", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const disposables = [
      toDisposable(() => {
        disposedValues.add(1);
      }),
      toDisposable(() => {
        disposedValues.add(2);
      })
    ];
    const store = new DisposableStore();
    store.add(disposables[0]);
    store.add(disposables[1]);
    store.deleteAndLeak(disposables[0]);
    assert.ok(!disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    store.dispose();
    assert.ok(!disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    disposables[0].dispose();
  });
});
suite("DisposableSet", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose should dispose all values and mark as disposed", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    set.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    set.add(toDisposable(() => {
      disposedValues.add(2);
    }));
    set.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    assert.strictEqual(set.size, 3);
    set.dispose();
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(set.size, 0);
  });
  test("dispose should call all child disposes even if a child throws on dispose", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    set.add(toDisposable(() => {
      disposedValues.add(1);
    }));
    set.add(toDisposable(() => {
      throw new Error("I am error");
    }));
    set.add(toDisposable(() => {
      disposedValues.add(3);
    }));
    let thrownError;
    try {
      set.dispose();
    } catch (e) {
      thrownError = e;
    }
    assert.ok(disposedValues.has(1));
    assert.ok(disposedValues.has(3));
    assert.strictEqual(thrownError.message, "I am error");
  });
  test("clearAndDisposeAll should dispose values but not mark as disposed", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    set.add(d1);
    set.clearAndDisposeAll();
    assert.ok(disposedValues.has(1));
    assert.strictEqual(set.size, 0);
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d2);
    assert.strictEqual(set.size, 1);
    set.dispose();
    assert.ok(disposedValues.has(2));
  });
  test("has should return true if value exists", () => {
    const set = new DisposableSet();
    const d = toDisposable(() => {
    });
    set.add(d);
    const other = toDisposable(() => {
    });
    assert.ok(set.has(d));
    assert.ok(!set.has(other));
    set.dispose();
    other.dispose();
  });
  test("deleteAndDispose should remove and dispose the value", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d1);
    set.add(d2);
    set.deleteAndDispose(d1);
    assert.ok(disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    assert.strictEqual(set.size, 1);
    assert.ok(!set.has(d1));
    assert.ok(set.has(d2));
    set.dispose();
    assert.ok(disposedValues.has(2));
  });
  test("deleteAndLeak should remove but not dispose the value", () => {
    const disposedValues = /* @__PURE__ */ new Set();
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
      disposedValues.add(1);
    });
    const d2 = toDisposable(() => {
      disposedValues.add(2);
    });
    set.add(d1);
    set.add(d2);
    const leaked = set.deleteAndLeak(d1);
    assert.strictEqual(leaked, d1);
    assert.ok(!disposedValues.has(1));
    assert.ok(!disposedValues.has(2));
    assert.strictEqual(set.size, 1);
    set.dispose();
    assert.ok(!disposedValues.has(1));
    assert.ok(disposedValues.has(2));
    d1.dispose();
  });
  test("deleteAndLeak should return undefined if value not in set", () => {
    const set = new DisposableSet();
    const d = toDisposable(() => {
    });
    const leaked = set.deleteAndLeak(d);
    assert.strictEqual(leaked, void 0);
    set.dispose();
    d.dispose();
  });
  test("values should iterate over all values", () => {
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
    });
    const d2 = toDisposable(() => {
    });
    set.add(d1);
    set.add(d2);
    const values = [...set.values()];
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(d1));
    assert.ok(values.includes(d2));
    set.dispose();
  });
  test("Symbol.iterator should allow for-of iteration", () => {
    const set = new DisposableSet();
    const d1 = toDisposable(() => {
    });
    const d2 = toDisposable(() => {
    });
    set.add(d1);
    set.add(d2);
    const values = [];
    for (const v of set) {
      values.push(v);
    }
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(d1));
    assert.ok(values.includes(d2));
    set.dispose();
  });
});
suite("Reference Collection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class Collection extends ReferenceCollection {
    constructor() {
      super(...arguments);
      this._count = 0;
    }
    get count() {
      return this._count;
    }
    createReferencedObject(key) {
      this._count++;
      return key.length;
    }
    destroyReferencedObject(key, object) {
      this._count--;
    }
  }
  test("simple", () => {
    const collection = new Collection();
    const ref1 = collection.acquire("test");
    assert(ref1);
    assert.strictEqual(ref1.object, 4);
    assert.strictEqual(collection.count, 1);
    ref1.dispose();
    assert.strictEqual(collection.count, 0);
    const ref2 = collection.acquire("test");
    const ref3 = collection.acquire("test");
    assert.strictEqual(ref2.object, ref3.object);
    assert.strictEqual(collection.count, 1);
    const ref4 = collection.acquire("monkey");
    assert.strictEqual(ref4.object, 6);
    assert.strictEqual(collection.count, 2);
    ref2.dispose();
    assert.strictEqual(collection.count, 2);
    ref3.dispose();
    assert.strictEqual(collection.count, 1);
    ref4.dispose();
    assert.strictEqual(collection.count, 0);
  });
});
function assertThrows(fn, test2) {
  try {
    fn();
    assert.fail("Expected function to throw, but it did not.");
  } catch (e) {
    assert.ok(test2(e));
  }
}
suite("No Leakage Utilities", () => {
  suite("throwIfDisposablesAreLeaked", () => {
    test("throws if an event subscription is not cleaned up", () => {
      const eventEmitter = new Emitter();
      assertThrows(() => {
        throwIfDisposablesAreLeaked(() => {
          eventEmitter.event(() => {
          });
        }, false);
      }, (e) => e.message.indexOf("undisposed disposables") !== -1);
    });
    test("throws if a disposable is not disposed", () => {
      assertThrows(() => {
        throwIfDisposablesAreLeaked(() => {
          new DisposableStore();
        }, false);
      }, (e) => e.message.indexOf("undisposed disposables") !== -1);
    });
    test("does not throw if all event subscriptions are cleaned up", () => {
      const eventEmitter = new Emitter();
      throwIfDisposablesAreLeaked(() => {
        eventEmitter.event(() => {
        }).dispose();
      });
    });
    test("does not throw if all disposables are disposed", () => {
      toDisposable(() => {
      });
      throwIfDisposablesAreLeaked(() => {
        markAsSingleton(toDisposable(() => {
        }));
        const disposableStore = new DisposableStore();
        disposableStore.add(toDisposable(() => {
        }));
        markAsSingleton(disposableStore);
        toDisposable(() => {
        }).dispose();
      });
    });
  });
  suite("ensureNoDisposablesAreLeakedInTest", () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test("Basic Test", () => {
      toDisposable(() => {
      }).dispose();
    });
  });
  suite("thenIfNotDisposed", () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    test("normal case", async () => {
      let called = false;
      store.add(thenIfNotDisposed(Promise.resolve(123), (result) => {
        assert.strictEqual(result, 123);
        called = true;
      }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(called, true);
    });
    test("disposed before promise resolves", async () => {
      let called = false;
      const disposable = thenIfNotDisposed(Promise.resolve(123), () => {
        called = true;
      });
      disposable.dispose();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.strictEqual(called, false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vbGlmZWN5Y2xlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTZXQsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIG1hcmtBc1NpbmdsZXRvbiwgUmVmZXJlbmNlQ29sbGVjdGlvbiwgdGhlbklmTm90RGlzcG9zZWQsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlLCB0aHJvd0lmRGlzcG9zYWJsZXNBcmVMZWFrZWQgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuY2xhc3MgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0aXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRkaXNwb3NlKCkgeyB0aGlzLmlzRGlzcG9zZWQgPSB0cnVlOyB9XG59XG5cbi8vIExlYWtzIGFyZSBhbGxvd2VkIGhlcmUgc2luY2Ugd2UgdGVzdCBsaWZlY3ljbGUgc3R1ZmY6XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1lbnN1cmUtbm8tZGlzcG9zYWJsZXMtbGVhay1pbi10ZXN0XG5zdWl0ZSgnTGlmZWN5Y2xlJywgKCkgPT4ge1xuXHR0ZXN0KCdkaXNwb3NlIHNpbmdsZSBkaXNwb3NhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZSgpO1xuXG5cdFx0YXNzZXJ0KCFkaXNwb3NhYmxlLmlzRGlzcG9zZWQpO1xuXG5cdFx0ZGlzcG9zZShkaXNwb3NhYmxlKTtcblxuXHRcdGFzc2VydChkaXNwb3NhYmxlLmlzRGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGRpc3Bvc2FibGUgYXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSBuZXcgRGlzcG9zYWJsZSgpO1xuXG5cdFx0YXNzZXJ0KCFkaXNwb3NhYmxlLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydCghZGlzcG9zYWJsZTIuaXNEaXNwb3NlZCk7XG5cblx0XHRkaXNwb3NlKFtkaXNwb3NhYmxlLCBkaXNwb3NhYmxlMl0pO1xuXG5cdFx0YXNzZXJ0KGRpc3Bvc2FibGUuaXNEaXNwb3NlZCk7XG5cdFx0YXNzZXJ0KGRpc3Bvc2FibGUyLmlzRGlzcG9zZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGRpc3Bvc2FibGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZSgpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUyID0gbmV3IERpc3Bvc2FibGUoKTtcblxuXHRcdGFzc2VydCghZGlzcG9zYWJsZS5pc0Rpc3Bvc2VkKTtcblx0XHRhc3NlcnQoIWRpc3Bvc2FibGUyLmlzRGlzcG9zZWQpO1xuXG5cdFx0ZGlzcG9zZShkaXNwb3NhYmxlKTtcblx0XHRkaXNwb3NlKGRpc3Bvc2FibGUyKTtcblxuXHRcdGFzc2VydChkaXNwb3NhYmxlLmlzRGlzcG9zZWQpO1xuXHRcdGFzc2VydChkaXNwb3NhYmxlMi5pc0Rpc3Bvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBhcnJheSBzaG91bGQgZGlzcG9zZSBhbGwgaWYgYSBjaGlsZCB0aHJvd3Mgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0bGV0IHRocm93bkVycm9yOiBhbnk7XG5cdFx0dHJ5IHtcblx0XHRcdGRpc3Bvc2UoW1xuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pLFxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0kgYW0gZXJyb3InKTsgfSksXG5cdFx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgzKTsgfSksXG5cdFx0XHRdKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvd25FcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocm93bkVycm9yLm1lc3NhZ2UsICdJIGFtIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgYXJyYXkgc2hvdWxkIHJldGhyb3cgY29tcG9zaXRlIGVycm9yIGlmIG11bHRpcGxlIGVudHJpZXMgdGhyb3cgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0bGV0IHRocm93bkVycm9yOiBhbnk7XG5cdFx0dHJ5IHtcblx0XHRcdGRpc3Bvc2UoW1xuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pLFxuXHRcdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0kgYW0gZXJyb3IgMScpOyB9KSxcblx0XHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJIGFtIGVycm9yIDInKTsgfSksXG5cdFx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCg0KTsgfSksXG5cdFx0XHRdKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvd25FcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcyg0KSk7XG5cdFx0YXNzZXJ0Lm9rKHRocm93bkVycm9yIGluc3RhbmNlb2YgQWdncmVnYXRlRXJyb3IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodGhyb3duRXJyb3IgYXMgQWdncmVnYXRlRXJyb3IpLmVycm9ycy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodGhyb3duRXJyb3IgYXMgQWdncmVnYXRlRXJyb3IpLmVycm9yc1swXS5tZXNzYWdlLCAnSSBhbSBlcnJvciAxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0aHJvd25FcnJvciBhcyBBZ2dyZWdhdGVFcnJvcikuZXJyb3JzWzFdLm1lc3NhZ2UsICdJIGFtIGVycm9yIDInKTtcblx0fSk7XG5cblx0dGVzdCgnQWN0aW9uIGJhciBoYXMgYnJva2VuIGFjY2Vzc2liaWxpdHkgIzEwMDI3MycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBhcnJheSA9IFt7IGRpc3Bvc2UoKSB7IH0gfSwgeyBkaXNwb3NlKCkgeyB9IH1dO1xuXHRcdGNvbnN0IGFycmF5MiA9IGRpc3Bvc2UoYXJyYXkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFycmF5Mi5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5vayhhcnJheSAhPT0gYXJyYXkyKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SURpc3Bvc2FibGU+KFt7IGRpc3Bvc2UoKSB7IH0gfSwgeyBkaXNwb3NlKCkgeyB9IH1dKTtcblx0XHRjb25zdCBzZXRWYWx1ZXMgPSBzZXQudmFsdWVzKCk7XG5cdFx0Y29uc3Qgc2V0VmFsdWVzMiA9IGRpc3Bvc2Uoc2V0VmFsdWVzKTtcblx0XHRhc3NlcnQub2soc2V0VmFsdWVzID09PSBzZXRWYWx1ZXMyKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Rpc3Bvc2FibGVTdG9yZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZGlzcG9zZSBzaG91bGQgY2FsbCBhbGwgY2hpbGQgZGlzcG9zZXMgZXZlbiBpZiBhIGNoaWxkIHRocm93cyBvbiBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VkVmFsdWVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSSBhbSBlcnJvcicpOyB9KSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgzKTsgfSkpO1xuXG5cdFx0bGV0IHRocm93bkVycm9yOiBhbnk7XG5cdFx0dHJ5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvd25FcnJvciA9IGU7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygzKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocm93bkVycm9yLm1lc3NhZ2UsICdJIGFtIGVycm9yJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc2hvdWxkIHRocm93IGNvbXBvc2l0ZSBlcnJvciBpZiBtdWx0aXBsZSBjaGlsZHJlbiB0aHJvdyBvbiBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VkVmFsdWVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSSBhbSBlcnJvciAxJyk7IH0pKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdJIGFtIGVycm9yIDInKTsgfSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoNCk7IH0pKTtcblxuXHRcdGxldCB0aHJvd25FcnJvcjogYW55O1xuXHRcdHRyeSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhyb3duRXJyb3IgPSBlO1xuXHRcdH1cblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoNCkpO1xuXHRcdGFzc2VydC5vayh0aHJvd25FcnJvciBpbnN0YW5jZW9mIEFnZ3JlZ2F0ZUVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRocm93bkVycm9yIGFzIEFnZ3JlZ2F0ZUVycm9yKS5lcnJvcnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRocm93bkVycm9yIGFzIEFnZ3JlZ2F0ZUVycm9yKS5lcnJvcnNbMF0ubWVzc2FnZSwgJ0kgYW0gZXJyb3IgMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodGhyb3duRXJyb3IgYXMgQWdncmVnYXRlRXJyb3IpLmVycm9yc1sxXS5tZXNzYWdlLCAnSSBhbSBlcnJvciAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBzaG91bGQgZXZpY3QgYW5kIGRpc3Bvc2Ugb2YgdGhlIGRpc3Bvc2FibGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VkVmFsdWVzID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pLFxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDIpOyB9KVxuXHRcdF07XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZXNbMF0pO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlc1sxXSk7XG5cblx0XHRzdG9yZS5kZWxldGUoZGlzcG9zYWJsZXNbMF0pO1xuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKCFkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUFuZExlYWsgc2hvdWxkIGV2aWN0IGFuZCBub3QgZGlzcG9zZSBvZiB0aGUgZGlzcG9zYWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtcblx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgxKTsgfSksXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMik7IH0pXG5cdFx0XTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlc1swXSk7XG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVzWzFdKTtcblxuXHRcdHN0b3JlLmRlbGV0ZUFuZExlYWsoZGlzcG9zYWJsZXNbMF0pO1xuXG5cdFx0YXNzZXJ0Lm9rKCFkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblxuXHRcdGRpc3Bvc2FibGVzWzBdLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Rpc3Bvc2FibGVTZXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc2hvdWxkIGRpc3Bvc2UgYWxsIHZhbHVlcyBhbmQgbWFyayBhcyBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc2V0ID0gbmV3IERpc3Bvc2FibGVTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdFx0c2V0LmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pKTtcblx0XHRzZXQuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgyKTsgfSkpO1xuXHRcdHNldC5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDMpOyB9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnNpemUsIDMpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc2hvdWxkIGNhbGwgYWxsIGNoaWxkIGRpc3Bvc2VzIGV2ZW4gaWYgYSBjaGlsZCB0aHJvd3Mgb24gZGlzcG9zZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc2V0ID0gbmV3IERpc3Bvc2FibGVTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdFx0c2V0LmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pKTtcblx0XHRzZXQuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IHRocm93IG5ldyBFcnJvcignSSBhbSBlcnJvcicpOyB9KSk7XG5cdFx0c2V0LmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMyk7IH0pKTtcblxuXHRcdGxldCB0aHJvd25FcnJvcjogYW55O1xuXHRcdHRyeSB7XG5cdFx0XHRzZXQuZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93bkVycm9yID0gZTtcblx0XHR9XG5cblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDEpKTtcblx0XHRhc3NlcnQub2soZGlzcG9zZWRWYWx1ZXMuaGFzKDMpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyb3duRXJyb3IubWVzc2FnZSwgJ0kgYW0gZXJyb3InKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJBbmREaXNwb3NlQWxsIHNob3VsZCBkaXNwb3NlIHZhbHVlcyBidXQgbm90IG1hcmsgYXMgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zZWRWYWx1ZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQxID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDEpOyB9KTtcblx0XHRzZXQuYWRkKGQxKTtcblxuXHRcdHNldC5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMCk7XG5cblx0XHQvLyBDYW4gc3RpbGwgYWRkIG5ldyB2YWx1ZXNcblx0XHRjb25zdCBkMiA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkVmFsdWVzLmFkZCgyKTsgfSk7XG5cdFx0c2V0LmFkZChkMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldC5zaXplLCAxKTtcblxuXHRcdHNldC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0Lm9rKGRpc3Bvc2VkVmFsdWVzLmhhcygyKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhcyBzaG91bGQgcmV0dXJuIHRydWUgaWYgdmFsdWUgZXhpc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHRzZXQuYWRkKGQpO1xuXG5cdFx0Y29uc3Qgb3RoZXIgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHRhc3NlcnQub2soc2V0LmhhcyhkKSk7XG5cdFx0YXNzZXJ0Lm9rKCFzZXQuaGFzKG90aGVyKSk7XG5cblx0XHRzZXQuZGlzcG9zZSgpO1xuXHRcdG90aGVyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlQW5kRGlzcG9zZSBzaG91bGQgcmVtb3ZlIGFuZCBkaXNwb3NlIHRoZSB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc2V0ID0gbmV3IERpc3Bvc2FibGVTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdFx0Y29uc3QgZDEgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pO1xuXHRcdGNvbnN0IGQyID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDIpOyB9KTtcblx0XHRzZXQuYWRkKGQxKTtcblx0XHRzZXQuYWRkKGQyKTtcblxuXHRcdHNldC5kZWxldGVBbmREaXNwb3NlKGQxKTtcblxuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayghZGlzcG9zZWRWYWx1ZXMuaGFzKDIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0LnNpemUsIDEpO1xuXHRcdGFzc2VydC5vayghc2V0LmhhcyhkMSkpO1xuXHRcdGFzc2VydC5vayhzZXQuaGFzKGQyKSk7XG5cblx0XHRzZXQuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVBbmRMZWFrIHNob3VsZCByZW1vdmUgYnV0IG5vdCBkaXNwb3NlIHRoZSB2YWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NlZFZhbHVlcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXG5cdFx0Y29uc3Qgc2V0ID0gbmV3IERpc3Bvc2FibGVTZXQ8SURpc3Bvc2FibGU+KCk7XG5cdFx0Y29uc3QgZDEgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyBkaXNwb3NlZFZhbHVlcy5hZGQoMSk7IH0pO1xuXHRcdGNvbnN0IGQyID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgZGlzcG9zZWRWYWx1ZXMuYWRkKDIpOyB9KTtcblx0XHRzZXQuYWRkKGQxKTtcblx0XHRzZXQuYWRkKGQyKTtcblxuXHRcdGNvbnN0IGxlYWtlZCA9IHNldC5kZWxldGVBbmRMZWFrKGQxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWFrZWQsIGQxKTtcblx0XHRhc3NlcnQub2soIWRpc3Bvc2VkVmFsdWVzLmhhcygxKSk7XG5cdFx0YXNzZXJ0Lm9rKCFkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXQuc2l6ZSwgMSk7XG5cblx0XHRzZXQuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFkaXNwb3NlZFZhbHVlcy5oYXMoMSkpO1xuXHRcdGFzc2VydC5vayhkaXNwb3NlZFZhbHVlcy5oYXMoMikpO1xuXG5cdFx0Ly8gQ2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciBkaXNwb3Npbmdcblx0XHRkMS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUFuZExlYWsgc2hvdWxkIHJldHVybiB1bmRlZmluZWQgaWYgdmFsdWUgbm90IGluIHNldCcsICgpID0+IHtcblx0XHRjb25zdCBzZXQgPSBuZXcgRGlzcG9zYWJsZVNldDxJRGlzcG9zYWJsZT4oKTtcblx0XHRjb25zdCBkID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cblx0XHRjb25zdCBsZWFrZWQgPSBzZXQuZGVsZXRlQW5kTGVhayhkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsZWFrZWQsIHVuZGVmaW5lZCk7XG5cblx0XHRzZXQuZGlzcG9zZSgpO1xuXHRcdGQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWx1ZXMgc2hvdWxkIGl0ZXJhdGUgb3ZlciBhbGwgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQxID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0Y29uc3QgZDIgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHRzZXQuYWRkKGQxKTtcblx0XHRzZXQuYWRkKGQyKTtcblxuXHRcdGNvbnN0IHZhbHVlcyA9IFsuLi5zZXQudmFsdWVzKCldO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sodmFsdWVzLmluY2x1ZGVzKGQxKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlcy5pbmNsdWRlcyhkMikpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnU3ltYm9sLml0ZXJhdG9yIHNob3VsZCBhbGxvdyBmb3Itb2YgaXRlcmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBEaXNwb3NhYmxlU2V0PElEaXNwb3NhYmxlPigpO1xuXHRcdGNvbnN0IGQxID0gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdFx0Y29uc3QgZDIgPSB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHRzZXQuYWRkKGQxKTtcblx0XHRzZXQuYWRkKGQyKTtcblxuXHRcdGNvbnN0IHZhbHVlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdiBvZiBzZXQpIHtcblx0XHRcdHZhbHVlcy5wdXNoKHYpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sodmFsdWVzLmluY2x1ZGVzKGQxKSk7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlcy5pbmNsdWRlcyhkMikpO1xuXG5cdFx0c2V0LmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1JlZmVyZW5jZSBDb2xsZWN0aW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBDb2xsZWN0aW9uIGV4dGVuZHMgUmVmZXJlbmNlQ29sbGVjdGlvbjxudW1iZXI+IHtcblx0XHRwcml2YXRlIF9jb3VudCA9IDA7XG5cdFx0Z2V0IGNvdW50KCkgeyByZXR1cm4gdGhpcy5fY291bnQ7IH1cblx0XHRwcm90ZWN0ZWQgY3JlYXRlUmVmZXJlbmNlZE9iamVjdChrZXk6IHN0cmluZyk6IG51bWJlciB7IHRoaXMuX2NvdW50Kys7IHJldHVybiBrZXkubGVuZ3RoOyB9XG5cdFx0cHJvdGVjdGVkIGRlc3Ryb3lSZWZlcmVuY2VkT2JqZWN0KGtleTogc3RyaW5nLCBvYmplY3Q6IG51bWJlcik6IHZvaWQgeyB0aGlzLl9jb3VudC0tOyB9XG5cdH1cblxuXHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBDb2xsZWN0aW9uKCk7XG5cblx0XHRjb25zdCByZWYxID0gY29sbGVjdGlvbi5hY3F1aXJlKCd0ZXN0Jyk7XG5cdFx0YXNzZXJ0KHJlZjEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWYxLm9iamVjdCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDEpO1xuXHRcdHJlZjEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2xsZWN0aW9uLmNvdW50LCAwKTtcblxuXHRcdGNvbnN0IHJlZjIgPSBjb2xsZWN0aW9uLmFjcXVpcmUoJ3Rlc3QnKTtcblx0XHRjb25zdCByZWYzID0gY29sbGVjdGlvbi5hY3F1aXJlKCd0ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZjIub2JqZWN0LCByZWYzLm9iamVjdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbGxlY3Rpb24uY291bnQsIDEpO1xuXG5cdFx0Y29uc3QgcmVmNCA9IGNvbGxlY3Rpb24uYWNxdWlyZSgnbW9ua2V5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZjQub2JqZWN0LCA2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5jb3VudCwgMik7XG5cblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5jb3VudCwgMik7XG5cblx0XHRyZWYzLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5jb3VudCwgMSk7XG5cblx0XHRyZWY0LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29sbGVjdGlvbi5jb3VudCwgMCk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGFzc2VydFRocm93cyhmbjogKCkgPT4gdm9pZCwgdGVzdDogKGVycm9yOiBhbnkpID0+IHZvaWQpIHtcblx0dHJ5IHtcblx0XHRmbigpO1xuXHRcdGFzc2VydC5mYWlsKCdFeHBlY3RlZCBmdW5jdGlvbiB0byB0aHJvdywgYnV0IGl0IGRpZCBub3QuJyk7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRhc3NlcnQub2sodGVzdChlKSk7XG5cdH1cbn1cblxuc3VpdGUoJ05vIExlYWthZ2UgVXRpbGl0aWVzJywgKCkgPT4ge1xuXHRzdWl0ZSgndGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Rocm93cyBpZiBhbiBldmVudCBzdWJzY3JpcHRpb24gaXMgbm90IGNsZWFuZWQgdXAnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBuZXcgRW1pdHRlcigpO1xuXG5cdFx0XHRhc3NlcnRUaHJvd3MoKCkgPT4ge1xuXHRcdFx0XHR0aHJvd0lmRGlzcG9zYWJsZXNBcmVMZWFrZWQoKCkgPT4ge1xuXHRcdFx0XHRcdGV2ZW50RW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sIGZhbHNlKTtcblx0XHRcdH0sIGUgPT4gZS5tZXNzYWdlLmluZGV4T2YoJ3VuZGlzcG9zZWQgZGlzcG9zYWJsZXMnKSAhPT0gLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIGlmIGEgZGlzcG9zYWJsZSBpcyBub3QgZGlzcG9zZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnRUaHJvd3MoKCkgPT4ge1xuXHRcdFx0XHR0aHJvd0lmRGlzcG9zYWJsZXNBcmVMZWFrZWQoKCkgPT4ge1xuXHRcdFx0XHRcdG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0fSwgZmFsc2UpO1xuXHRcdFx0fSwgZSA9PiBlLm1lc3NhZ2UuaW5kZXhPZigndW5kaXNwb3NlZCBkaXNwb3NhYmxlcycpICE9PSAtMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB0aHJvdyBpZiBhbGwgZXZlbnQgc3Vic2NyaXB0aW9ucyBhcmUgY2xlYW5lZCB1cCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50RW1pdHRlciA9IG5ldyBFbWl0dGVyKCk7XG5cdFx0XHR0aHJvd0lmRGlzcG9zYWJsZXNBcmVMZWFrZWQoKCkgPT4ge1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIG5vb3Bcblx0XHRcdFx0fSkuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCB0aHJvdyBpZiBhbGwgZGlzcG9zYWJsZXMgYXJlIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyBkaXNwb3NhYmxlIGlzIHJlcG9ydGVkIGJlZm9yZSB0aGUgdGVzdCBhbmQgbm90IHRyYWNrZWQuXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KTtcblxuXHRcdFx0dGhyb3dJZkRpc3Bvc2FibGVzQXJlTGVha2VkKCgpID0+IHtcblx0XHRcdFx0Ly8gVGhpcyBkaXNwb3NhYmxlIGlzIG1hcmtlZCBhcyBzaW5nbGV0b25cblx0XHRcdFx0bWFya0FzU2luZ2xldG9uKHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pKTtcblxuXHRcdFx0XHQvLyBUaGVzZSBkaXNwb3NhYmxlcyBhcmUgYWxzbyBtYXJrZWQgYXMgc2luZ2xldG9uXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSk7XG5cdFx0XHRcdG1hcmtBc1NpbmdsZXRvbihkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdFx0XHRcdHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdCcsICgpID0+IHtcblx0XHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRcdHRlc3QoJ0Jhc2ljIFRlc3QnLCAoKSA9PiB7XG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0aGVuSWZOb3REaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0dGVzdCgnbm9ybWFsIGNhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FsbGVkID0gZmFsc2U7XG5cdFx0XHRzdG9yZS5hZGQodGhlbklmTm90RGlzcG9zZWQoUHJvbWlzZS5yZXNvbHZlKDEyMyksIChyZXN1bHQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxMjMpO1xuXHRcdFx0XHRjYWxsZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NlZCBiZWZvcmUgcHJvbWlzZSByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYWxsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGVuSWZOb3REaXNwb3NlZChQcm9taXNlLnJlc29sdmUoMTIzKSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsZWQgPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlLGlCQUFpQixTQUFzQixpQkFBaUIscUJBQXFCLG1CQUFtQixvQkFBb0I7QUFDNUksU0FBUyx5Q0FBeUMsbUNBQW1DO0FBRXJGLE1BQU0sV0FBa0M7QUFBQSxFQUF4QztBQUNDLHNCQUFhO0FBQUE7QUFBQSxFQUNiLFVBQVU7QUFBRSxTQUFLLGFBQWE7QUFBQSxFQUFNO0FBQ3JDO0FBSUEsTUFBTSxhQUFhLE1BQU07QUFDeEIsT0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxVQUFNLGFBQWEsSUFBSSxXQUFXO0FBRWxDLFdBQU8sQ0FBQyxXQUFXLFVBQVU7QUFFN0IsWUFBUSxVQUFVO0FBRWxCLFdBQU8sV0FBVyxVQUFVO0FB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
