import assert from "assert";
import { stub } from "sinon";
import { timeout } from "../../common/async.js";
import { CancellationToken } from "../../common/cancellation.js";
import { errorHandler, setUnexpectedErrorHandler } from "../../common/errors.js";
import { AsyncEmitter, DebounceEmitter, DynamicListEventMultiplexer, Emitter, Event, EventBufferer, EventMultiplexer, ListenerLeakError, ListenerRefusalError, MicrotaskEmitter, PauseableEmitter, Relay, createEventDeliveryQueue } from "../../common/event.js";
import { DisposableStore, isDisposable, setDisposableTracker, DisposableTracker } from "../../common/lifecycle.js";
import { observableValue, transaction } from "../../common/observable.js";
import { MicrotaskDelay } from "../../common/symbols.js";
import { runWithFakedTimers } from "./timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { tail } from "../../common/arrays.js";
var Samples;
((Samples2) => {
  class EventCounter {
    constructor() {
      this.count = 0;
    }
    reset() {
      this.count = 0;
    }
    onEvent() {
      this.count += 1;
    }
  }
  Samples2.EventCounter = EventCounter;
  class Document3 {
    constructor() {
      this._onDidChange = new Emitter();
      this.onDidChange = this._onDidChange.event;
    }
    setText(value) {
      this._onDidChange.fire(value);
    }
    dispose() {
      this._onDidChange.dispose();
    }
  }
  Samples2.Document3 = Document3;
})(Samples || (Samples = {}));
suite("Event utils dispose", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let tracker = new DisposableTracker();
  function assertDisposablesCount(expected) {
    if (Array.isArray(expected)) {
      const instances = new Set(expected);
      const actualInstances = tracker.getTrackedDisposables();
      assert.strictEqual(actualInstances.length, expected.length);
      for (const item of actualInstances) {
        assert.ok(instances.has(item));
      }
    } else {
      assert.strictEqual(tracker.getTrackedDisposables().length, expected);
    }
  }
  setup(() => {
    tracker = new DisposableTracker();
    setDisposableTracker(tracker);
  });
  teardown(function() {
    setDisposableTracker(null);
  });
  test("no leak with snapshot-utils", function() {
    const store = new DisposableStore();
    const emitter = ds.add(new Emitter());
    const evens = Event.filter(emitter.event, (n) => n % 2 === 0, store);
    assertDisposablesCount(1);
    let all = 0;
    const leaked = evens((n) => all += n);
    assert.ok(isDisposable(leaked));
    assertDisposablesCount(3);
    emitter.dispose();
    store.dispose();
    assertDisposablesCount([leaked]);
  });
  test("no leak with debounce-util", function() {
    const store = new DisposableStore();
    const emitter = ds.add(new Emitter());
    const debounced = Event.debounce(emitter.event, (l) => 0, void 0, void 0, void 0, void 0, store);
    assertDisposablesCount(1);
    let all = 0;
    const leaked = debounced((n) => all += n);
    assert.ok(isDisposable(leaked));
    assertDisposablesCount(3);
    emitter.dispose();
    store.dispose();
    assertDisposablesCount([leaked]);
  });
});
suite("Event", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  const counter = new Samples.EventCounter();
  setup(() => counter.reset());
  test("Emitter plain", function() {
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter);
    doc.setText("far");
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("Emitter duplicate functions", () => {
    const calls = [];
    const a = (v) => calls.push(`a${v}`);
    const b = (v) => calls.push(`b${v}`);
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(a));
    ds.add(emitter.event(b));
    const s2 = emitter.event(a);
    emitter.fire("1");
    assert.deepStrictEqual(calls, ["a1", "b1", "a1"]);
    s2.dispose();
    calls.length = 0;
    emitter.fire("2");
    assert.deepStrictEqual(calls, ["a2", "b2"]);
  });
  test("Emitter, dispose listener during emission", () => {
    for (let keepFirstMod = 1; keepFirstMod < 4; keepFirstMod++) {
      const emitter = ds.add(new Emitter());
      const calls = [];
      const disposables = Array.from({ length: 25 }, (_, n) => ds.add(emitter.event(() => {
        if (n % keepFirstMod === 0) {
          disposables[n].dispose();
        }
        calls.push(n);
      })));
      emitter.fire();
      assert.deepStrictEqual(calls, Array.from({ length: 25 }, (_, n) => n));
    }
  });
  test("Emitter, dispose emitter during emission", () => {
    const emitter = ds.add(new Emitter());
    const calls = [];
    const disposables = Array.from({ length: 25 }, (_, n) => ds.add(emitter.event(() => {
      if (n === 10) {
        emitter.dispose();
      }
      calls.push(n);
    })));
    emitter.fire();
    disposables.forEach((d) => d.dispose());
    assert.deepStrictEqual(calls, Array.from({ length: 11 }, (_, n) => n));
  });
  test("Emitter, shared delivery queue", () => {
    const deliveryQueue = createEventDeliveryQueue();
    const emitter1 = ds.add(new Emitter({ deliveryQueue }));
    const emitter2 = ds.add(new Emitter({ deliveryQueue }));
    const calls = [];
    ds.add(emitter1.event((d) => {
      calls.push(`${d}a`);
      if (d === 1) {
        emitter2.fire(2);
      }
    }));
    ds.add(emitter1.event((d) => {
      calls.push(`${d}b`);
    }));
    ds.add(emitter2.event((d) => {
      calls.push(`${d}c`);
      emitter1.dispose();
    }));
    ds.add(emitter2.event((d) => {
      calls.push(`${d}d`);
    }));
    emitter1.fire(1);
    assert.deepStrictEqual(calls, ["1a", "1b", "2c", "2d"]);
  });
  test("Emitter, handles removal during 3", () => {
    const fn1 = stub();
    const fn2 = stub();
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(fn1));
    const h = emitter.event(() => {
      h.dispose();
    });
    ds.add(emitter.event(fn2));
    emitter.fire("foo");
    assert.deepStrictEqual(fn2.args, [["foo"]]);
    assert.deepStrictEqual(fn1.args, [["foo"]]);
  });
  test("Emitter, handles removal during 2", () => {
    const fn1 = stub();
    const emitter = ds.add(new Emitter());
    ds.add(emitter.event(fn1));
    const h = emitter.event(() => {
      h.dispose();
    });
    emitter.fire("foo");
    assert.deepStrictEqual(fn1.args, [["foo"]]);
  });
  test("Emitter, bucket", function() {
    const bucket = [];
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter, bucket);
    doc.setText("far");
    doc.setText("boo");
    while (bucket.length) {
      bucket.pop().dispose();
    }
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("Emitter, store", function() {
    const bucket = ds.add(new DisposableStore());
    const doc = ds.add(new Samples.Document3());
    const subscription = doc.onDidChange(counter.onEvent, counter, bucket);
    doc.setText("far");
    doc.setText("boo");
    bucket.clear();
    doc.setText("boo");
    subscription.dispose();
    doc.setText("boo");
    assert.strictEqual(counter.count, 2);
  });
  test("onFirstAdd|onLastRemove", () => {
    let firstCount = 0;
    let lastCount = 0;
    const a = ds.add(new Emitter({
      onWillAddFirstListener() {
        firstCount += 1;
      },
      onDidRemoveLastListener() {
        lastCount += 1;
      }
    }));
    assert.strictEqual(firstCount, 0);
    assert.strictEqual(lastCount, 0);
    let subscription1 = ds.add(a.event(function() {
    }));
    const subscription2 = ds.add(a.event(function() {
    }));
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 0);
    subscription1.dispose();
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 0);
    subscription2.dispose();
    assert.strictEqual(firstCount, 1);
    assert.strictEqual(lastCount, 1);
    subscription1 = ds.add(a.event(function() {
    }));
    assert.strictEqual(firstCount, 2);
    assert.strictEqual(lastCount, 1);
  });
  test("onDidAddListener", () => {
    let count = 0;
    const a = ds.add(new Emitter({
      onDidAddListener() {
        count += 1;
      }
    }));
    assert.strictEqual(count, 0);
    let subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 1);
    subscription.dispose();
    assert.strictEqual(count, 1);
    subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 2);
    subscription.dispose();
    assert.strictEqual(count, 2);
  });
  test("onWillRemoveListener", () => {
    let count = 0;
    const a = ds.add(new Emitter({
      onWillRemoveListener() {
        count += 1;
      }
    }));
    assert.strictEqual(count, 0);
    let subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 0);
    subscription.dispose();
    assert.strictEqual(count, 1);
    subscription = ds.add(a.event(function() {
    }));
    assert.strictEqual(count, 1);
  });
  test("throwingListener", () => {
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => null);
    try {
      const a = ds.add(new Emitter());
      let hit = false;
      ds.add(a.event(function() {
        throw 9;
      }));
      ds.add(a.event(function() {
        hit = true;
      }));
      a.fire(void 0);
      assert.strictEqual(hit, true);
    } finally {
      setUnexpectedErrorHandler(origErrorHandler);
    }
  });
  test("throwingListener (custom handler)", () => {
    const allError = [];
    const a = ds.add(new Emitter({
      onListenerError(e) {
        allError.push(e);
      }
    }));
    let hit = false;
    ds.add(a.event(function() {
      throw 9;
    }));
    ds.add(a.event(function() {
      hit = true;
    }));
    a.fire(void 0);
    assert.strictEqual(hit, true);
    assert.deepStrictEqual(allError, [9]);
  });
  test("throw ListenerLeakError", () => {
    const store = new DisposableStore();
    const allError = [];
    const a = ds.add(new Emitter({
      onListenerError(e) {
        allError.push(e);
      },
      leakWarningThreshold: 3
    }));
    for (let i = 0; i < 11; i++) {
      a.event(() => {
      }, void 0, store);
    }
    assert.deepStrictEqual(allError.length, 5);
    const [start, rest] = tail(allError);
    assert.ok(rest instanceof ListenerRefusalError);
    for (const item of start) {
      assert.ok(item instanceof ListenerLeakError);
    }
    store.dispose();
  });
  test("reusing event function and context", function() {
    let counter2 = 0;
    function listener() {
      counter2 += 1;
    }
    const context = {};
    const emitter = ds.add(new Emitter());
    const reg1 = emitter.event(listener, context);
    const reg2 = emitter.event(listener, context);
    emitter.fire(void 0);
    assert.strictEqual(counter2, 2);
    reg1.dispose();
    emitter.fire(void 0);
    assert.strictEqual(counter2, 3);
    reg2.dispose();
    emitter.fire(void 0);
    assert.strictEqual(counter2, 3);
  });
  test("DebounceEmitter", async function() {
    return runWithFakedTimers({}, async function() {
      let callCount = 0;
      let sum = 0;
      const emitter = new DebounceEmitter({
        merge: (arr) => {
          callCount += 1;
          return arr.reduce((p2, c) => p2 + c);
        }
      });
      ds.add(emitter.event((e) => {
        sum = e;
      }));
      const p = Event.toPromise(emitter.event);
      emitter.fire(1);
      emitter.fire(2);
      await p;
      assert.strictEqual(callCount, 1);
      assert.strictEqual(sum, 3);
    });
  });
  suite("Event.toPromise", () => {
    class DisposableStoreWithSize extends DisposableStore {
      constructor() {
        super(...arguments);
        this.size = 0;
      }
      add(o) {
        this.size++;
        return super.add(o);
      }
      delete(o) {
        this.size--;
        return super.delete(o);
      }
    }
    test("resolves on first event", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      emitter.fire(42);
      const result = await promise;
      assert.strictEqual(result, 42);
    });
    test("disposes listener after resolution", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      emitter.fire(1);
      await promise;
      emitter.fire(2);
      assert.ok(true);
    });
    test("adds to DisposableStore", async () => {
      const emitter = ds.add(new Emitter());
      const store = ds.add(new DisposableStoreWithSize());
      const promise = Event.toPromise(emitter.event, store);
      assert.strictEqual(store.size, 1);
      emitter.fire(42);
      await promise;
      assert.strictEqual(store.size, 0);
    });
    test("adds to disposables array", async () => {
      const emitter = ds.add(new Emitter());
      const disposables = [];
      const promise = Event.toPromise(emitter.event, disposables);
      assert.strictEqual(disposables.length, 1);
      emitter.fire(42);
      await promise;
      assert.strictEqual(disposables.length, 0);
    });
    test("cancel removes from DisposableStore", () => {
      const emitter = ds.add(new Emitter());
      const store = ds.add(new DisposableStoreWithSize());
      const promise = Event.toPromise(emitter.event, store);
      assert.strictEqual(store.size, 1);
      promise.cancel();
      assert.strictEqual(store.size, 0);
    });
    test("cancel removes from disposables array", () => {
      const emitter = ds.add(new Emitter());
      const disposables = [];
      const promise = Event.toPromise(emitter.event, disposables);
      assert.strictEqual(disposables.length, 1);
      promise.cancel();
      assert.strictEqual(disposables.length, 0);
    });
    test("cancel does not resolve promise", async () => {
      const emitter = ds.add(new Emitter());
      const promise = Event.toPromise(emitter.event);
      promise.cancel();
      emitter.fire(42);
      let resolved = false;
      promise.then(() => resolved = true);
      await timeout(10);
      assert.strictEqual(resolved, false);
    });
  });
  test("Microtask Emitter", (done) => {
    let count = 0;
    assert.strictEqual(count, 0);
    const emitter = new MicrotaskEmitter();
    const listener = emitter.event(() => {
      count++;
    });
    emitter.fire();
    assert.strictEqual(count, 0);
    emitter.fire();
    assert.strictEqual(count, 0);
    setTimeout(() => {
      assert.strictEqual(count, 3);
      done();
    }, 0);
    queueMicrotask(() => {
      assert.strictEqual(count, 2);
      count++;
      listener.dispose();
    });
  });
  test("Emitter - In Order Delivery", function() {
    const a = ds.add(new Emitter());
    const listener2Events = [];
    ds.add(a.event(function listener1(event) {
      if (event === "e1") {
        a.fire("e2");
        assert.deepStrictEqual(listener2Events, ["e1", "e2"]);
      }
    }));
    ds.add(a.event(function listener2(event) {
      listener2Events.push(event);
    }));
    a.fire("e1");
    assert.deepStrictEqual(listener2Events, ["e1", "e2"]);
  });
  test("Emitter, - In Order Delivery 3x", function() {
    const a = ds.add(new Emitter());
    const listener2Events = [];
    ds.add(a.event(function listener1(event) {
      if (event === "e2") {
        a.fire("e3");
        assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
      }
    }));
    ds.add(a.event(function listener1(event) {
      if (event === "e1") {
        a.fire("e2");
        assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
      }
    }));
    ds.add(a.event(function listener2(event) {
      listener2Events.push(event);
    }));
    a.fire("e1");
    assert.deepStrictEqual(listener2Events, ["e1", "e2", "e3"]);
  });
});
suite("AsyncEmitter", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("event has waitUntil-function", async function() {
    const emitter = new AsyncEmitter();
    ds.add(emitter.event((e) => {
      assert.strictEqual(e.foo, true);
      assert.strictEqual(e.bar, 1);
      assert.strictEqual(typeof e.waitUntil, "function");
    }));
    emitter.fireAsync({ foo: true, bar: 1 }, CancellationToken.None);
    emitter.dispose();
  });
  test("sequential delivery", async function() {
    return runWithFakedTimers({}, async function() {
      let globalState = 0;
      const emitter = new AsyncEmitter();
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(10).then((_) => {
          assert.strictEqual(globalState, 0);
          globalState += 1;
        }));
      }));
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(1).then((_) => {
          assert.strictEqual(globalState, 1);
          globalState += 1;
        }));
      }));
      await emitter.fireAsync({ foo: true }, CancellationToken.None);
      assert.strictEqual(globalState, 2);
    });
  });
  test("sequential, in-order delivery", async function() {
    return runWithFakedTimers({}, async function() {
      const events = [];
      let done = false;
      const emitter = new AsyncEmitter();
      ds.add(emitter.event((e) => {
        e.waitUntil(timeout(10).then(async (_) => {
          if (e.foo === 1) {
            await emitter.fireAsync({ foo: 2 }, CancellationToken.None);
            assert.deepStrictEqual(events, [1, 2]);
            done = true;
          }
        }));
      }));
      ds.add(emitter.event((e) => {
        events.push(e.foo);
        e.waitUntil(timeout(7));
      }));
      await emitter.fireAsync({ foo: 1 }, CancellationToken.None);
      assert.ok(done);
    });
  });
  test("catch errors", async function() {
    const origErrorHandler = errorHandler.getUnexpectedErrorHandler();
    setUnexpectedErrorHandler(() => null);
    let globalState = 0;
    const emitter = new AsyncEmitter();
    ds.add(emitter.event((e) => {
      globalState += 1;
      e.waitUntil(new Promise((_r, reject) => reject(new Error())));
    }));
    ds.add(emitter.event((e) => {
      globalState += 1;
      e.waitUntil(timeout(10));
      e.waitUntil(timeout(20).then(() => globalState++));
    }));
    await emitter.fireAsync({ foo: true }, CancellationToken.None).then(() => {
      assert.strictEqual(globalState, 3);
    }).catch((e) => {
      console.log(e);
      assert.ok(false);
    });
    setUnexpectedErrorHandler(origErrorHandler);
  });
});
suite("PausableEmitter", function() {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("basic", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
  });
  test("pause/resume - no merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
    emitter.fire(5);
    assert.deepStrictEqual(data, [1, 2, 3, 4, 5]);
  });
  test("pause/resume - merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter({ merge: (a) => a.reduce((p, c) => p + c, 0) }));
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 7]);
    emitter.fire(5);
    assert.deepStrictEqual(data, [1, 2, 7, 5]);
  });
  test("double pause/resume", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.pause();
    emitter.pause();
    emitter.fire(3);
    emitter.fire(4);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 2, 3, 4]);
  });
  test("resume, no pause", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    ds.add(emitter.event((e) => data.push(e)));
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, [1, 2]);
    emitter.resume();
    emitter.fire(3);
    assert.deepStrictEqual(data, [1, 2, 3]);
  });
  test("nested pause", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter());
    let once = true;
    ds.add(emitter.event((e) => {
      data.push(e);
      if (once) {
        emitter.pause();
        once = false;
      }
    }));
    ds.add(emitter.event((e) => {
      data.push(e);
    }));
    emitter.pause();
    emitter.fire(1);
    emitter.fire(2);
    assert.deepStrictEqual(data, []);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 1]);
    emitter.resume();
    assert.deepStrictEqual(data, [1, 1, 2, 2]);
    emitter.fire(3);
    assert.deepStrictEqual(data, [1, 1, 2, 2, 3, 3]);
  });
  test("empty pause with merge", function() {
    const data = [];
    const emitter = ds.add(new PauseableEmitter({ merge: (a) => a[0] }));
    ds.add(emitter.event((e) => data.push(1)));
    emitter.pause();
    emitter.resume();
    assert.deepStrictEqual(data, []);
  });
});
suite("Event utils - ensureNoDisposablesAreLeakedInTestSuite", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fromObservable", function() {
    const obs = observableValue("test", 12);
    const event = Event.fromObservable(obs);
    const values = [];
    const d = event((n) => {
      values.push(n);
    });
    obs.set(3, void 0);
    obs.set(13, void 0);
    obs.set(3, void 0);
    obs.set(33, void 0);
    obs.set(1, void 0);
    transaction((tx) => {
      obs.set(334, tx);
      obs.set(99, tx);
    });
    assert.deepStrictEqual(values, [3, 13, 3, 33, 1, 99]);
    d.dispose();
  });
});
suite("Event utils", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("EventBufferer", () => {
    test("should not buffer when not wrapped", () => {
      const bufferer = new EventBufferer();
      const counter = new Samples.EventCounter();
      const emitter = ds.add(new Emitter());
      const event = bufferer.wrapEvent(emitter.event);
      const listener = event(counter.onEvent, counter);
      assert.strictEqual(counter.count, 0);
      emitter.fire();
      assert.strictEqual(counter.count, 1);
      emitter.fire();
      assert.strictEqual(counter.count, 2);
      emitter.fire();
      assert.strictEqual(counter.count, 3);
      listener.dispose();
    });
    test("should buffer when wrapped", () => {
      const bufferer = new EventBufferer();
      const counter = new Samples.EventCounter();
      const emitter = ds.add(new Emitter());
      const event = bufferer.wrapEvent(emitter.event);
      const listener = event(counter.onEvent, counter);
      assert.strictEqual(counter.count, 0);
      emitter.fire();
      assert.strictEqual(counter.count, 1);
      bufferer.bufferEvents(() => {
        emitter.fire();
        assert.strictEqual(counter.count, 1);
        emitter.fire();
        assert.strictEqual(counter.count, 1);
      });
      assert.strictEqual(counter.count, 3);
      emitter.fire();
      assert.strictEqual(counter.count, 4);
      listener.dispose();
    });
    test("once", () => {
      const emitter = ds.add(new Emitter());
      let counter1 = 0, counter2 = 0, counter3 = 0;
      const listener1 = emitter.event(() => counter1++);
      const listener2 = Event.once(emitter.event)(() => counter2++);
      const listener3 = Event.once(emitter.event)(() => counter3++);
      assert.strictEqual(counter1, 0);
      assert.strictEqual(counter2, 0);
      assert.strictEqual(counter3, 0);
      listener3.dispose();
      emitter.fire();
      assert.strictEqual(counter1, 1);
      assert.strictEqual(counter2, 1);
      assert.strictEqual(counter3, 0);
      emitter.fire();
      assert.strictEqual(counter1, 2);
      assert.strictEqual(counter2, 1);
      assert.strictEqual(counter3, 0);
      listener1.dispose();
      listener2.dispose();
    });
  });
  suite("buffer", () => {
    test("should buffer events", () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test");
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      const listener = bufferedEvent((num) => result.push(num));
      assert.deepStrictEqual(result, [1, 2, 3]);
      emitter.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
      listener.dispose();
      emitter.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("should buffer events on next tick", async () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test", true);
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      const listener = bufferedEvent((num) => result.push(num));
      assert.deepStrictEqual(result, []);
      await timeout(10);
      emitter.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
      listener.dispose();
      emitter.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("should fire initial buffer events", () => {
      const result = [];
      const emitter = ds.add(new Emitter());
      const event = emitter.event;
      const bufferedEvent = Event.buffer(event, "test", false, [-2, -1, 0]);
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(result, []);
      ds.add(bufferedEvent((num) => result.push(num)));
      assert.deepStrictEqual(result, [-2, -1, 0, 1, 2, 3]);
    });
  });
  suite("EventMultiplexer", () => {
    test("works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("multiplexer dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      m.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("event dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      e1.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("mutliplexer event dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      const l1 = m.add(e1.event);
      assert.deepStrictEqual(result, []);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
      l1.dispose();
      assert.deepStrictEqual(result, [0]);
      e1.fire(0);
      assert.deepStrictEqual(result, [0]);
    });
    test("hot start works", () => {
      const result = [];
      const m = new EventMultiplexer();
      ds.add(m.event((r) => result.push(r)));
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      e1.fire(1);
      e2.fire(2);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("cold start works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("late add works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      const e3 = ds.add(new Emitter());
      ds.add(m.add(e3.event));
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("add dispose works", () => {
      const result = [];
      const m = new EventMultiplexer();
      const e1 = ds.add(new Emitter());
      ds.add(m.add(e1.event));
      const e2 = ds.add(new Emitter());
      ds.add(m.add(e2.event));
      ds.add(m.event((r) => result.push(r)));
      e1.fire(1);
      e2.fire(2);
      const e3 = ds.add(new Emitter());
      const l3 = m.add(e3.event);
      e3.fire(3);
      assert.deepStrictEqual(result, [1, 2, 3]);
      l3.dispose();
      e3.fire(4);
      assert.deepStrictEqual(result, [1, 2, 3]);
      e2.fire(4);
      e1.fire(5);
      assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
    });
  });
  suite("DynamicListEventMultiplexer", () => {
    let addEmitter;
    let removeEmitter;
    const recordedEvents = [];
    class TestItem {
      constructor() {
        this.onTestEventEmitter = ds.add(new Emitter());
        this.onTestEvent = this.onTestEventEmitter.event;
      }
    }
    let items;
    let m;
    setup(() => {
      addEmitter = ds.add(new Emitter());
      removeEmitter = ds.add(new Emitter());
      items = [new TestItem(), new TestItem()];
      for (const [i, item] of items.entries()) {
        ds.add(item.onTestEvent((e) => `${i}:${e}`));
      }
      m = new DynamicListEventMultiplexer(items, addEmitter.event, removeEmitter.event, (e) => e.onTestEvent);
      ds.add(m.event((e) => recordedEvents.push(e)));
      recordedEvents.length = 0;
    });
    teardown(() => m.dispose());
    test("should fire events for initial items", () => {
      items[0].onTestEventEmitter.fire(1);
      items[1].onTestEventEmitter.fire(2);
      items[0].onTestEventEmitter.fire(3);
      items[1].onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
    });
    test("should fire events for added items", () => {
      const addedItem = new TestItem();
      addEmitter.fire(addedItem);
      addedItem.onTestEventEmitter.fire(1);
      items[0].onTestEventEmitter.fire(2);
      items[1].onTestEventEmitter.fire(3);
      addedItem.onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [1, 2, 3, 4]);
    });
    test("should not fire events for removed items", () => {
      removeEmitter.fire(items[0]);
      items[0].onTestEventEmitter.fire(1);
      items[1].onTestEventEmitter.fire(2);
      items[0].onTestEventEmitter.fire(3);
      items[1].onTestEventEmitter.fire(4);
      assert.deepStrictEqual(recordedEvents, [2, 4]);
    });
  });
  test("latch", () => {
    const emitter = ds.add(new Emitter());
    const event = Event.latch(emitter.event);
    const result = [];
    const listener = ds.add(event((num) => result.push(num)));
    assert.deepStrictEqual(result, []);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1]);
    emitter.fire(2);
    assert.deepStrictEqual(result, [1, 2]);
    emitter.fire(2);
    assert.deepStrictEqual(result, [1, 2]);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1, 2, 1]);
    emitter.fire(1);
    assert.deepStrictEqual(result, [1, 2, 1]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    emitter.fire(3);
    assert.deepStrictEqual(result, [1, 2, 1, 3]);
    listener.dispose();
  });
  test("dispose is reentrant", () => {
    const emitter = ds.add(new Emitter({
      onDidRemoveLastListener: () => {
        emitter.dispose();
      }
    }));
    const listener = emitter.event(() => void 0);
    listener.dispose();
  });
  suite("Relay", () => {
    test("should input work", () => {
      const e1 = ds.add(new Emitter());
      const e2 = ds.add(new Emitter());
      const relay = new Relay();
      const result = [];
      const listener = (num) => result.push(num);
      const subscription = relay.event(listener);
      e1.fire(1);
      assert.deepStrictEqual(result, []);
      relay.input = e1.event;
      e1.fire(2);
      assert.deepStrictEqual(result, [2]);
      relay.input = e2.event;
      e1.fire(3);
      e2.fire(4);
      assert.deepStrictEqual(result, [2, 4]);
      subscription.dispose();
      e1.fire(5);
      e2.fire(6);
      assert.deepStrictEqual(result, [2, 4]);
    });
    test("should Relay dispose work", () => {
      const e1 = ds.add(new Emitter());
      const e2 = ds.add(new Emitter());
      const relay = new Relay();
      const result = [];
      const listener = (num) => result.push(num);
      ds.add(relay.event(listener));
      e1.fire(1);
      assert.deepStrictEqual(result, []);
      relay.input = e1.event;
      e1.fire(2);
      assert.deepStrictEqual(result, [2]);
      relay.input = e2.event;
      e1.fire(3);
      e2.fire(4);
      assert.deepStrictEqual(result, [2, 4]);
      relay.dispose();
      e1.fire(5);
      e2.fire(6);
      assert.deepStrictEqual(result, [2, 4]);
    });
  });
  suite("accumulate", () => {
    test("should not fire after a listener is disposed with undefined or []", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const calls1 = [];
      const calls2 = [];
      const listener1 = ds.add(accumulated((e) => calls1.push(e)));
      ds.add(accumulated((e) => calls2.push(e)));
      eventEmitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls1, [[1]]);
      assert.deepStrictEqual(calls2, [[1]]);
      listener1.dispose();
      await timeout(1);
      assert.deepStrictEqual(calls1, [[1]]);
      assert.deepStrictEqual(calls2, [[1]], "should not fire after a listener is disposed with undefined or []");
    });
    test("should accumulate a single event", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const results1 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(1);
      });
      assert.deepStrictEqual(results1, [1]);
      const results2 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(2);
      });
      assert.deepStrictEqual(results2, [2]);
    });
    test("should accumulate multiple events", async () => {
      const eventEmitter = ds.add(new Emitter());
      const event = eventEmitter.event;
      const accumulated = Event.accumulate(event, 0);
      const results1 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(1);
        eventEmitter.fire(2);
        eventEmitter.fire(3);
      });
      assert.deepStrictEqual(results1, [1, 2, 3]);
      const results2 = await new Promise((r) => {
        ds.add(accumulated(r));
        eventEmitter.fire(4);
        eventEmitter.fire(5);
        eventEmitter.fire(6);
        eventEmitter.fire(7);
        eventEmitter.fire(8);
      });
      assert.deepStrictEqual(results2, [4, 5, 6, 7, 8]);
    });
  });
  suite("debounce", () => {
    test("simple", function(done) {
      const doc = ds.add(new Samples.Document3());
      const onDocDidChange = Event.debounce(doc.onDidChange, (prev, cur) => {
        if (!prev) {
          prev = [cur];
        } else if (prev.indexOf(cur) < 0) {
          prev.push(cur);
        }
        return prev;
      }, 10);
      let count = 0;
      ds.add(onDocDidChange((keys) => {
        count++;
        assert.ok(keys, "was not expecting keys.");
        if (count === 1) {
          doc.setText("4");
          assert.deepStrictEqual(keys, ["1", "2", "3"]);
        } else if (count === 2) {
          assert.deepStrictEqual(keys, ["4"]);
          done();
        }
      }));
      doc.setText("1");
      doc.setText("2");
      doc.setText("3");
    });
    test("microtask", function(done) {
      const doc = ds.add(new Samples.Document3());
      const onDocDidChange = Event.debounce(doc.onDidChange, (prev, cur) => {
        if (!prev) {
          prev = [cur];
        } else if (prev.indexOf(cur) < 0) {
          prev.push(cur);
        }
        return prev;
      }, MicrotaskDelay);
      let count = 0;
      ds.add(onDocDidChange((keys) => {
        count++;
        assert.ok(keys, "was not expecting keys.");
        if (count === 1) {
          doc.setText("4");
          assert.deepStrictEqual(keys, ["1", "2", "3"]);
        } else if (count === 2) {
          assert.deepStrictEqual(keys, ["4"]);
          done();
        }
      }));
      doc.setText("1");
      doc.setText("2");
      doc.setText("3");
    });
    test("leading", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => e,
        0,
        /*leading=*/
        true
      );
      let calls = 0;
      ds.add(debounced(() => {
        calls++;
      }));
      emitter.fire();
      await timeout(1);
      assert.strictEqual(calls, 1);
    });
    test("leading (2)", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => e,
        0,
        /*leading=*/
        true
      );
      let calls = 0;
      ds.add(debounced(() => {
        calls++;
      }));
      emitter.fire();
      emitter.fire();
      emitter.fire();
      await timeout(1);
      assert.strictEqual(calls, 2);
    });
    test("leading reset", async function() {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(
        emitter.event,
        (l, e) => l ? l + 1 : 1,
        0,
        /*leading=*/
        true
      );
      const calls = [];
      ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, [1, 1]);
    });
    test("should not flush events when a listener is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);
      const calls = [];
      const listener = ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      listener.dispose();
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, []);
    });
    test("flushOnListenerRemove - should flush events when a listener is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0, void 0, true);
      const calls = [];
      const listener = ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      listener.dispose();
      emitter.fire(1);
      await timeout(1);
      assert.deepStrictEqual(calls, [1], "should fire with the first event, not the second (after listener dispose)");
    });
    test("should flush events when the emitter is disposed", async () => {
      const emitter = ds.add(new Emitter());
      const debounced = Event.debounce(emitter.event, (l, e) => l ? l + 1 : 1, 0);
      const calls = [];
      ds.add(debounced((e) => calls.push(e)));
      emitter.fire(1);
      emitter.dispose();
      await timeout(1);
      assert.deepStrictEqual(calls, [1]);
    });
  });
  suite("throttle", () => {
    test("leading only", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1], "no trailing edge fire with trailing=false");
        emitter.fire(4);
        assert.deepStrictEqual(calls, [1, 1]);
      });
    });
    test("trailing only", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          false,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, []);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, []);
        await timeout(15);
        assert.deepStrictEqual(calls, [3]);
        emitter.fire(4);
        emitter.fire(5);
        assert.deepStrictEqual(calls, [3]);
        await timeout(15);
        assert.deepStrictEqual(calls, [3, 2]);
      });
    });
    test("both leading and trailing", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2]);
      });
    });
    test("only leading edge if no subsequent events", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1]);
      });
    });
    test("microtask delay", function(done) {
      const emitter = ds.add(new Emitter());
      const throttled = Event.throttle(emitter.event, (l, e) => l ? l + 1 : 1, MicrotaskDelay);
      const calls = [];
      ds.add(throttled((e) => calls.push(e)));
      emitter.fire(1);
      assert.deepStrictEqual(calls, [1]);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepStrictEqual(calls, [1]);
      queueMicrotask(() => {
        assert.deepStrictEqual(calls, [1, 2]);
        done();
      });
    });
    test("merge function accumulates values", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (last, cur) => (last || 0) + cur,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 5]);
      });
    });
    test("rapid consecutive throttle periods", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => e,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          true
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2]);
        emitter.fire(3);
        emitter.fire(4);
        assert.deepStrictEqual(calls, [1, 2, 3]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2, 3, 4]);
        emitter.fire(5);
        assert.deepStrictEqual(calls, [1, 2, 3, 4, 5]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1, 2, 3, 4, 5]);
      });
    });
    test("default parameters", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(emitter.event, (l, e) => e);
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1], "should fire leading edge by default");
        emitter.fire(2);
        await timeout(110);
        assert.deepStrictEqual(calls, [1, 2], "should fire trailing edge by default");
      });
    });
    test("disposal cleans up", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(emitter.event, (l, e) => e, 10);
        const calls = [];
        const listener = throttled((e) => calls.push(e));
        emitter.fire(1);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1]);
        listener.dispose();
        await timeout(15);
        emitter.fire(3);
        assert.deepStrictEqual(calls, [1]);
      });
    });
    test("no events during throttle with trailing=false", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => l ? l + 1 : 1,
          10,
          /*leading=*/
          true,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        assert.deepStrictEqual(calls, [1]);
        await timeout(15);
        assert.deepStrictEqual(calls, [1]);
        emitter.fire(2);
        assert.deepStrictEqual(calls, [1, 1]);
      });
    });
    test("neither leading nor trailing", async function() {
      return runWithFakedTimers({}, async function() {
        const emitter = ds.add(new Emitter());
        const throttled = Event.throttle(
          emitter.event,
          (l, e) => e,
          10,
          /*leading=*/
          false,
          /*trailing=*/
          false
        );
        const calls = [];
        ds.add(throttled((e) => calls.push(e)));
        emitter.fire(1);
        emitter.fire(2);
        emitter.fire(3);
        assert.deepStrictEqual(calls, []);
        await timeout(15);
        assert.deepStrictEqual(calls, [], "no events should fire with both leading and trailing false");
      });
    });
  });
  test("issue #230401", () => {
    let count = 0;
    const emitter = ds.add(new Emitter());
    const disposables = ds.add(new DisposableStore());
    ds.add(emitter.event(() => {
      count++;
      disposables.add(emitter.event(() => {
        count++;
      }));
      disposables.add(emitter.event(() => {
        count++;
      }));
      disposables.clear();
    }));
    ds.add(emitter.event(() => {
      count++;
    }));
    emitter.fire();
    assert.deepStrictEqual(count, 2);
  });
  suite("chain2", () => {
    let em;
    let calls;
    setup(() => {
      em = ds.add(new Emitter());
      calls = [];
    });
    test("maps", () => {
      const ev = Event.chain(em.event, ($) => $.map((v) => v * 2));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      assert.deepStrictEqual(calls, [2, 4, 6]);
    });
    test("filters", () => {
      const ev = Event.chain(em.event, ($) => $.filter((v) => v % 2 === 0));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      assert.deepStrictEqual(calls, [2, 4]);
    });
    test("reduces", () => {
      const ev = Event.chain(em.event, ($) => $.reduce((acc, v) => acc + v, 0));
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      assert.deepStrictEqual(calls, [1, 3, 6, 10]);
    });
    test("latches", () => {
      const ev = Event.chain(em.event, ($) => $.latch());
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(1);
      em.fire(2);
      em.fire(2);
      em.fire(3);
      em.fire(3);
      em.fire(1);
      assert.deepStrictEqual(calls, [1, 2, 3, 1]);
    });
    test("does everything", () => {
      const ev = Event.chain(
        em.event,
        ($) => $.filter((v) => v % 2 === 0).map((v) => v * 2).reduce((acc, v) => acc + v, 0).latch()
      );
      ds.add(ev((v) => calls.push(v)));
      em.fire(1);
      em.fire(2);
      em.fire(3);
      em.fire(4);
      em.fire(0);
      assert.deepStrictEqual(calls, [4, 12]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vZXZlbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBzdHViIH0gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZXJyb3JIYW5kbGVyLCBzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBc3luY0VtaXR0ZXIsIERlYm91bmNlRW1pdHRlciwgRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyLCBFbWl0dGVyLCBFdmVudCwgRXZlbnRCdWZmZXJlciwgRXZlbnRNdWx0aXBsZXhlciwgSVdhaXRVbnRpbCwgTGlzdGVuZXJMZWFrRXJyb3IsIExpc3RlbmVyUmVmdXNhbEVycm9yLCBNaWNyb3Rhc2tFbWl0dGVyLCBQYXVzZWFibGVFbWl0dGVyLCBSZWxheSwgY3JlYXRlRXZlbnREZWxpdmVyeVF1ZXVlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSwgc2V0RGlzcG9zYWJsZVRyYWNrZXIsIERpc3Bvc2FibGVUcmFja2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgTWljcm90YXNrRGVsYXkgfSBmcm9tICcuLi8uLi9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5pbXBvcnQgeyB0YWlsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FycmF5cy5qcyc7XG5cbm5hbWVzcGFjZSBTYW1wbGVzIHtcblxuXHRleHBvcnQgY2xhc3MgRXZlbnRDb3VudGVyIHtcblxuXHRcdGNvdW50ID0gMDtcblxuXHRcdHJlc2V0KCkge1xuXHRcdFx0dGhpcy5jb3VudCA9IDA7XG5cdFx0fVxuXG5cdFx0b25FdmVudCgpIHtcblx0XHRcdHRoaXMuY291bnQgKz0gMTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY2xhc3MgRG9jdW1lbnQzIHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRcdHNldFRleHQodmFsdWU6IHN0cmluZykge1xuXHRcdFx0Ly8uLi5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodmFsdWUpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdH1cbn1cblxuc3VpdGUoJ0V2ZW50IHV0aWxzIGRpc3Bvc2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdHJhY2tlciA9IG5ldyBEaXNwb3NhYmxlVHJhY2tlcigpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydERpc3Bvc2FibGVzQ291bnQoZXhwZWN0ZWQ6IG51bWJlciB8IEFycmF5PElEaXNwb3NhYmxlPikge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGV4cGVjdGVkKSkge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2VzID0gbmV3IFNldChleHBlY3RlZCk7XG5cdFx0XHRjb25zdCBhY3R1YWxJbnN0YW5jZXMgPSB0cmFja2VyLmdldFRyYWNrZWREaXNwb3NhYmxlcygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbEluc3RhbmNlcy5sZW5ndGgsIGV4cGVjdGVkLmxlbmd0aCk7XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBhY3R1YWxJbnN0YW5jZXMpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKGluc3RhbmNlcy5oYXMoaXRlbSkpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmdldFRyYWNrZWREaXNwb3NhYmxlcygpLmxlbmd0aCwgZXhwZWN0ZWQpO1xuXHRcdH1cblxuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRyYWNrZXIgPSBuZXcgRGlzcG9zYWJsZVRyYWNrZXIoKTtcblx0XHRzZXREaXNwb3NhYmxlVHJhY2tlcih0cmFja2VyKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdHNldERpc3Bvc2FibGVUcmFja2VyKG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdubyBsZWFrIHdpdGggc25hcHNob3QtdXRpbHMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0Y29uc3QgZXZlbnMgPSBFdmVudC5maWx0ZXIoZW1pdHRlci5ldmVudCwgbiA9PiBuICUgMiA9PT0gMCwgc3RvcmUpO1xuXHRcdGFzc2VydERpc3Bvc2FibGVzQ291bnQoMSk7IC8vIHNuYXBob3Qgb25seSBsaXN0ZW4gd2hlbiBgZXZlbnNgIGlzIGJlaW5nIGxpc3RlbmVkIG9uXG5cblx0XHRsZXQgYWxsID0gMDtcblx0XHRjb25zdCBsZWFrZWQgPSBldmVucyhuID0+IGFsbCArPSBuKTtcblx0XHRhc3NlcnQub2soaXNEaXNwb3NhYmxlKGxlYWtlZCkpO1xuXHRcdGFzc2VydERpc3Bvc2FibGVzQ291bnQoMyk7XG5cblx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0RGlzcG9zYWJsZXNDb3VudChbbGVha2VkXSk7IC8vIGxlYWtlZCBpcyBzdGlsbCB0aGVyZVxuXHR9KTtcblxuXHR0ZXN0KCdubyBsZWFrIHdpdGggZGVib3VuY2UtdXRpbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0Y29uc3QgZGVib3VuY2VkID0gRXZlbnQuZGVib3VuY2UoZW1pdHRlci5ldmVudCwgKGwpID0+IDAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGFzc2VydERpc3Bvc2FibGVzQ291bnQoMSk7IC8vIGRlYm91bmNlIG9ubHkgbGlzdGVucyB3aGVuIGBkZWJvdW5jZWAgaXMgYmVpbmcgbGlzdGVuZWQgb25cblxuXHRcdGxldCBhbGwgPSAwO1xuXHRcdGNvbnN0IGxlYWtlZCA9IGRlYm91bmNlZChuID0+IGFsbCArPSBuKTtcblx0XHRhc3NlcnQub2soaXNEaXNwb3NhYmxlKGxlYWtlZCkpO1xuXHRcdGFzc2VydERpc3Bvc2FibGVzQ291bnQoMyk7XG5cblx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnREaXNwb3NhYmxlc0NvdW50KFtsZWFrZWRdKTsgLy8gbGVha2VkIGlzIHN0aWxsIHRoZXJlXG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFdmVudCcsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvdW50ZXIgPSBuZXcgU2FtcGxlcy5FdmVudENvdW50ZXIoKTtcblxuXHRzZXR1cCgoKSA9PiBjb3VudGVyLnJlc2V0KCkpO1xuXG5cdHRlc3QoJ0VtaXR0ZXIgcGxhaW4nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBkb2MgPSBkcy5hZGQobmV3IFNhbXBsZXMuRG9jdW1lbnQzKCkpO1xuXG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gZG9jLm9uRGlkQ2hhbmdlKGNvdW50ZXIub25FdmVudCwgY291bnRlcik7XG5cblx0XHRkb2Muc2V0VGV4dCgnZmFyJyk7XG5cdFx0ZG9jLnNldFRleHQoJ2JvbycpO1xuXG5cdFx0Ly8gdW5ob29rIGxpc3RlbmVyXG5cdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyIGR1cGxpY2F0ZSBmdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgYSA9ICh2OiBzdHJpbmcpID0+IGNhbGxzLnB1c2goYGEke3Z9YCk7XG5cdFx0Y29uc3QgYiA9ICh2OiBzdHJpbmcpID0+IGNhbGxzLnB1c2goYGIke3Z9YCk7XG5cblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChhKSk7XG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoYikpO1xuXHRcdGNvbnN0IHMyID0gZW1pdHRlci5ldmVudChhKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgnMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnYTEnLCAnYjEnLCAnYTEnXSk7XG5cblx0XHRzMi5kaXNwb3NlKCk7XG5cdFx0Y2FsbHMubGVuZ3RoID0gMDtcblx0XHRlbWl0dGVyLmZpcmUoJzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2EyJywgJ2IyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyLCBkaXNwb3NlIGxpc3RlbmVyIGR1cmluZyBlbWlzc2lvbicsICgpID0+IHtcblx0XHRmb3IgKGxldCBrZWVwRmlyc3RNb2QgPSAxOyBrZWVwRmlyc3RNb2QgPCA0OyBrZWVwRmlyc3RNb2QrKykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgbikgPT4gZHMuYWRkKGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAobiAlIGtlZXBGaXJzdE1vZCA9PT0gMCkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzW25dLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYWxscy5wdXNoKG4pO1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBBcnJheS5mcm9tKHsgbGVuZ3RoOiAyNSB9LCAoXywgbikgPT4gbikpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgZGlzcG9zZSBlbWl0dGVyIGR1cmluZyBlbWlzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjUgfSwgKF8sIG4pID0+IGRzLmFkZChlbWl0dGVyLmV2ZW50KCgpID0+IHtcblx0XHRcdGlmIChuID09PSAxMCkge1xuXHRcdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGNhbGxzLnB1c2gobik7XG5cdFx0fSkpKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmZvckVhY2goZCA9PiBkLmRpc3Bvc2UoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgQXJyYXkuZnJvbSh7IGxlbmd0aDogMTEgfSwgKF8sIG4pID0+IG4pKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgc2hhcmVkIGRlbGl2ZXJ5IHF1ZXVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRlbGl2ZXJ5UXVldWUgPSBjcmVhdGVFdmVudERlbGl2ZXJ5UXVldWUoKTtcblx0XHRjb25zdCBlbWl0dGVyMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KHsgZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdFx0Y29uc3QgZW1pdHRlcjIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPih7IGRlbGl2ZXJ5UXVldWUgfSkpO1xuXG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZHMuYWRkKGVtaXR0ZXIxLmV2ZW50KGQgPT4geyBjYWxscy5wdXNoKGAke2R9YWApOyBpZiAoZCA9PT0gMSkgeyBlbWl0dGVyMi5maXJlKDIpOyB9IH0pKTtcblx0XHRkcy5hZGQoZW1pdHRlcjEuZXZlbnQoZCA9PiB7IGNhbGxzLnB1c2goYCR7ZH1iYCk7IH0pKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyMi5ldmVudChkID0+IHsgY2FsbHMucHVzaChgJHtkfWNgKTsgZW1pdHRlcjEuZGlzcG9zZSgpOyB9KSk7XG5cdFx0ZHMuYWRkKGVtaXR0ZXIyLmV2ZW50KGQgPT4geyBjYWxscy5wdXNoKGAke2R9ZGApOyB9KSk7XG5cblx0XHRlbWl0dGVyMS5maXJlKDEpO1xuXG5cdFx0Ly8gMS4gQ2hlY2sgdGhhdCAyIGlzIG5vdCBkZWxpdmVyZWQgYmVmb3JlIDEgZmluaXNoZXNcblx0XHQvLyAyLiBDaGVjayB0aGF0IDIgZmluaXNoZXMgZ2V0dGluZyBkZWxpdmVyZWQgZXZlbiBpZiBvbmUgZW1pdHRlciBpcyBkaXNwb3NlZFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnMWEnLCAnMWInLCAnMmMnLCAnMmQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIsIGhhbmRsZXMgcmVtb3ZhbCBkdXJpbmcgMycsICgpID0+IHtcblx0XHRjb25zdCBmbjEgPSBzdHViKCk7XG5cdFx0Y29uc3QgZm4yID0gc3R1YigpO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGZuMSkpO1xuXHRcdGNvbnN0IGggPSBlbWl0dGVyLmV2ZW50KCgpID0+IHtcblx0XHRcdGguZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGZuMikpO1xuXHRcdGVtaXR0ZXIuZmlyZSgnZm9vJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZuMi5hcmdzLCBbWydmb28nXV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm4xLmFyZ3MsIFtbJ2ZvbyddXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIsIGhhbmRsZXMgcmVtb3ZhbCBkdXJpbmcgMicsICgpID0+IHtcblx0XHRjb25zdCBmbjEgPSBzdHViKCk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZm4xKSk7XG5cdFx0Y29uc3QgaCA9IGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0aC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdFx0ZW1pdHRlci5maXJlKCdmb28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZm4xLmFyZ3MsIFtbJ2ZvbyddXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIsIGJ1Y2tldCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGJ1Y2tldDogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRcdGNvbnN0IGRvYyA9IGRzLmFkZChuZXcgU2FtcGxlcy5Eb2N1bWVudDMoKSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gZG9jLm9uRGlkQ2hhbmdlKGNvdW50ZXIub25FdmVudCwgY291bnRlciwgYnVja2V0KTtcblxuXHRcdGRvYy5zZXRUZXh0KCdmYXInKTtcblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cblx0XHQvLyB1bmhvb2sgbGlzdGVuZXJcblx0XHR3aGlsZSAoYnVja2V0Lmxlbmd0aCkge1xuXHRcdFx0YnVja2V0LnBvcCgpIS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGRvYy5zZXRUZXh0KCdib28nKTtcblxuXHRcdC8vIG5vb3Bcblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXG5cdFx0ZG9jLnNldFRleHQoJ2JvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnRW1pdHRlciwgc3RvcmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBidWNrZXQgPSBkcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBkb2MgPSBkcy5hZGQobmV3IFNhbXBsZXMuRG9jdW1lbnQzKCkpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGRvYy5vbkRpZENoYW5nZShjb3VudGVyLm9uRXZlbnQsIGNvdW50ZXIsIGJ1Y2tldCk7XG5cblx0XHRkb2Muc2V0VGV4dCgnZmFyJyk7XG5cdFx0ZG9jLnNldFRleHQoJ2JvbycpO1xuXG5cdFx0Ly8gdW5ob29rIGxpc3RlbmVyXG5cdFx0YnVja2V0LmNsZWFyKCk7XG5cdFx0ZG9jLnNldFRleHQoJ2JvbycpO1xuXG5cdFx0Ly8gbm9vcFxuXHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRkb2Muc2V0VGV4dCgnYm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkZpcnN0QWRkfG9uTGFzdFJlbW92ZScsICgpID0+IHtcblxuXHRcdGxldCBmaXJzdENvdW50ID0gMDtcblx0XHRsZXQgbGFzdENvdW50ID0gMDtcblx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyKHtcblx0XHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXIoKSB7IGZpcnN0Q291bnQgKz0gMTsgfSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyKCkgeyBsYXN0Q291bnQgKz0gMTsgfVxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENvdW50LCAwKTtcblxuXHRcdGxldCBzdWJzY3JpcHRpb24xID0gZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkgeyB9KSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uMiA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENvdW50LCAwKTtcblxuXHRcdHN1YnNjcmlwdGlvbjEuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENvdW50LCAwKTtcblxuXHRcdHN1YnNjcmlwdGlvbjIuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENvdW50LCAxKTtcblxuXHRcdHN1YnNjcmlwdGlvbjEgPSBkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7IH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDb3VudCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RDb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQWRkTGlzdGVuZXInLCAoKSA9PiB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyKHtcblx0XHRcdG9uRGlkQWRkTGlzdGVuZXIoKSB7IGNvdW50ICs9IDE7IH1cblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXG5cdFx0bGV0IHN1YnNjcmlwdGlvbiA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHRzdWJzY3JpcHRpb24gPSBkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7IH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXG5cdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbldpbGxSZW1vdmVMaXN0ZW5lcicsICgpID0+IHtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IGEgPSBkcy5hZGQobmV3IEVtaXR0ZXIoe1xuXHRcdFx0b25XaWxsUmVtb3ZlTGlzdGVuZXIoKSB7IGNvdW50ICs9IDE7IH1cblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXG5cdFx0bGV0IHN1YnNjcmlwdGlvbiA9IGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHsgfSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cblx0XHRzdWJzY3JpcHRpb24gPSBkcy5hZGQoYS5ldmVudChmdW5jdGlvbiAoKSB7IH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd2luZ0xpc3RlbmVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4gbnVsbCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYSA9IGRzLmFkZChuZXcgRW1pdHRlcjx1bmRlZmluZWQ+KCkpO1xuXHRcdFx0bGV0IGhpdCA9IGZhbHNlO1xuXHRcdFx0ZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdGhyb3ctbGl0ZXJhbFxuXHRcdFx0XHR0aHJvdyA5O1xuXHRcdFx0fSkpO1xuXHRcdFx0ZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRoaXQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXHRcdFx0YS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGl0LCB0cnVlKTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndGhyb3dpbmdMaXN0ZW5lciAoY3VzdG9tIGhhbmRsZXIpJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWxsRXJyb3I6IGFueVtdID0gW107XG5cblx0XHRjb25zdCBhID0gZHMuYWRkKG5ldyBFbWl0dGVyPHVuZGVmaW5lZD4oe1xuXHRcdFx0b25MaXN0ZW5lckVycm9yKGUpIHsgYWxsRXJyb3IucHVzaChlKTsgfVxuXHRcdH0pKTtcblx0XHRsZXQgaGl0ID0gZmFsc2U7XG5cdFx0ZHMuYWRkKGEuZXZlbnQoZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXRocm93LWxpdGVyYWxcblx0XHRcdHRocm93IDk7XG5cdFx0fSkpO1xuXHRcdGRzLmFkZChhLmV2ZW50KGZ1bmN0aW9uICgpIHtcblx0XHRcdGhpdCA9IHRydWU7XG5cdFx0fSkpO1xuXHRcdGEuZmlyZSh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsRXJyb3IsIFs5XSk7XG5cblx0fSk7XG5cblx0dGVzdCgndGhyb3cgTGlzdGVuZXJMZWFrRXJyb3InLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhbGxFcnJvcjogYW55W10gPSBbXTtcblxuXHRcdGNvbnN0IGEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dW5kZWZpbmVkPih7XG5cdFx0XHRvbkxpc3RlbmVyRXJyb3IoZSkgeyBhbGxFcnJvci5wdXNoKGUpOyB9LFxuXHRcdFx0bGVha1dhcm5pbmdUaHJlc2hvbGQ6IDMsXG5cdFx0fSkpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMTsgaSsrKSB7XG5cdFx0XHRhLmV2ZW50KCgpID0+IHsgfSwgdW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGxFcnJvci5sZW5ndGgsIDUpO1xuXHRcdGNvbnN0IFtzdGFydCwgcmVzdF0gPSB0YWlsKGFsbEVycm9yKTtcblx0XHRhc3NlcnQub2socmVzdCBpbnN0YW5jZW9mIExpc3RlbmVyUmVmdXNhbEVycm9yKTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBzdGFydCkge1xuXHRcdFx0YXNzZXJ0Lm9rKGl0ZW0gaW5zdGFuY2VvZiBMaXN0ZW5lckxlYWtFcnJvcik7XG5cdFx0fVxuXG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzaW5nIGV2ZW50IGZ1bmN0aW9uIGFuZCBjb250ZXh0JywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRmdW5jdGlvbiBsaXN0ZW5lcigpIHtcblx0XHRcdGNvdW50ZXIgKz0gMTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dCA9IHt9O1xuXG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx1bmRlZmluZWQ+KCkpO1xuXHRcdGNvbnN0IHJlZzEgPSBlbWl0dGVyLmV2ZW50KGxpc3RlbmVyLCBjb250ZXh0KTtcblx0XHRjb25zdCByZWcyID0gZW1pdHRlci5ldmVudChsaXN0ZW5lciwgY29udGV4dCk7XG5cblx0XHRlbWl0dGVyLmZpcmUodW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMik7XG5cblx0XHRyZWcxLmRpc3Bvc2UoKTtcblx0XHRlbWl0dGVyLmZpcmUodW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMyk7XG5cblx0XHRyZWcyLmRpc3Bvc2UoKTtcblx0XHRlbWl0dGVyLmZpcmUodW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlYm91bmNlRW1pdHRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdFx0bGV0IHN1bSA9IDA7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IERlYm91bmNlRW1pdHRlcjxudW1iZXI+KHtcblx0XHRcdFx0bWVyZ2U6IGFyciA9PiB7XG5cdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0cmV0dXJuIGFyci5yZWR1Y2UoKHAsIGMpID0+IHAgKyBjKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4geyBzdW0gPSBlOyB9KSk7XG5cblx0XHRcdGNvbnN0IHAgPSBFdmVudC50b1Byb21pc2UoZW1pdHRlci5ldmVudCk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblxuXHRcdFx0YXdhaXQgcDtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtLCAzKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0V2ZW50LnRvUHJvbWlzZScsICgpID0+IHtcblx0XHRjbGFzcyBEaXNwb3NhYmxlU3RvcmVXaXRoU2l6ZSBleHRlbmRzIERpc3Bvc2FibGVTdG9yZSB7XG5cdFx0XHRwdWJsaWMgc2l6ZSA9IDA7XG5cdFx0XHRwdWJsaWMgb3ZlcnJpZGUgYWRkPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4obzogVCk6IFQge1xuXHRcdFx0XHR0aGlzLnNpemUrKztcblx0XHRcdFx0cmV0dXJuIHN1cGVyLmFkZChvKTtcblx0XHRcdH1cblxuXHRcdFx0cHVibGljIG92ZXJyaWRlIGRlbGV0ZTxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KG86IFQpOiB2b2lkIHtcblx0XHRcdFx0dGhpcy5zaXplLS07XG5cdFx0XHRcdHJldHVybiBzdXBlci5kZWxldGUobyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRlc3QoJ3Jlc29sdmVzIG9uIGZpcnN0IGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShlbWl0dGVyLmV2ZW50KTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDQyKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb21pc2U7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDQyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2VzIGxpc3RlbmVyIGFmdGVyIHJlc29sdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0XHQvLyBMaXN0ZW5lciBzaG91bGQgYmUgZGlzcG9zZWQsIGZpcmluZyBhZ2FpbiBzaG91bGQgbm90IGFmZmVjdCBhbnl0aGluZ1xuXHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHRydWUpOyAvLyBObyBlcnJvcnNcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZHMgdG8gRGlzcG9zYWJsZVN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBkcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZVdpdGhTaXplKCkpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShlbWl0dGVyLmV2ZW50LCBzdG9yZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5zaXplLCAxKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDQyKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cblx0XHRcdC8vIFNob3VsZCBiZSByZW1vdmVkIGZyb20gc3RvcmUgYWZ0ZXIgcmVzb2x1dGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnNpemUsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWRkcyB0byBkaXNwb3NhYmxlcyBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2FibGVzLmxlbmd0aCwgMSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSg0Mik7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgcmVtb3ZlZCBmcm9tIGFycmF5IGFmdGVyIHJlc29sdXRpb25cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NhYmxlcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIHJlbW92ZXMgZnJvbSBEaXNwb3NhYmxlU3RvcmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IGRzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlV2l0aFNpemUoKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQsIHN0b3JlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnNpemUsIDEpO1xuXG5cdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXG5cdFx0XHQvLyBTaG91bGQgYmUgcmVtb3ZlZCBmcm9tIHN0b3JlIGFmdGVyIGNhbmNlbGxhdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnNpemUsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VsIHJlbW92ZXMgZnJvbSBkaXNwb3NhYmxlcyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2FibGVzLmxlbmd0aCwgMSk7XG5cblx0XHRcdHByb21pc2UuY2FuY2VsKCk7XG5cblx0XHRcdC8vIFNob3VsZCBiZSByZW1vdmVkIGZyb20gYXJyYXkgYWZ0ZXIgY2FuY2VsbGF0aW9uXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zYWJsZXMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBkb2VzIG5vdCByZXNvbHZlIHByb21pc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGVtaXR0ZXIuZXZlbnQpO1xuXG5cdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDQyKTtcblxuXHRcdFx0Ly8gUHJvbWlzZSBzaG91bGQgbm90IHJlc29sdmUgYWZ0ZXIgY2FuY2VsbGF0aW9uXG5cdFx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdHByb21pc2UudGhlbigoKSA9PiByZXNvbHZlZCA9IHRydWUpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNaWNyb3Rhc2sgRW1pdHRlcicsIChkb25lKSA9PiB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDApO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgTWljcm90YXNrRW1pdHRlcjx2b2lkPigpO1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRjb3VudCsrO1xuXHRcdH0pO1xuXHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMCk7XG5cdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAwKTtcblx0XHQvLyBTaG91bGQgd2FpdCB1bnRpbCB0aGUgZXZlbnQgbG9vcCBlbmRzIGFuZCB0aGVyZWZvcmUgYmUgdGhlIGxhc3QgdGhpbmcgY2FsbGVkXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQsIDMpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0sIDApO1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMik7XG5cdFx0XHRjb3VudCsrO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbWl0dGVyIC0gSW4gT3JkZXIgRGVsaXZlcnknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgYSA9IGRzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGxpc3RlbmVyMkV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiBsaXN0ZW5lcjEoZXZlbnQpIHtcblx0XHRcdGlmIChldmVudCA9PT0gJ2UxJykge1xuXHRcdFx0XHRhLmZpcmUoJ2UyJyk7XG5cdFx0XHRcdC8vIGFzc2VydCB0aGF0IGFsbCBldmVudHMgYXJlIGRlbGl2ZXJlZCBhdCB0aGlzIHBvaW50XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdGVuZXIyRXZlbnRzLCBbJ2UxJywgJ2UyJ10pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiBsaXN0ZW5lcjIoZXZlbnQpIHtcblx0XHRcdGxpc3RlbmVyMkV2ZW50cy5wdXNoKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0YS5maXJlKCdlMScpO1xuXG5cdFx0Ly8gYXNzZXJ0IHRoYXQgYWxsIGV2ZW50cyBhcmUgZGVsaXZlcmVkIGluIG9yZGVyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0ZW5lcjJFdmVudHMsIFsnZTEnLCAnZTInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VtaXR0ZXIsIC0gSW4gT3JkZXIgRGVsaXZlcnkgM3gnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgYSA9IGRzLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGxpc3RlbmVyMkV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiBsaXN0ZW5lcjEoZXZlbnQpIHtcblx0XHRcdGlmIChldmVudCA9PT0gJ2UyJykge1xuXHRcdFx0XHRhLmZpcmUoJ2UzJyk7XG5cdFx0XHRcdC8vIGFzc2VydCB0aGF0IGFsbCBldmVudHMgYXJlIGRlbGl2ZXJlZCBhdCB0aGlzIHBvaW50XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdGVuZXIyRXZlbnRzLCBbJ2UxJywgJ2UyJywgJ2UzJ10pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiBsaXN0ZW5lcjEoZXZlbnQpIHtcblx0XHRcdGlmIChldmVudCA9PT0gJ2UxJykge1xuXHRcdFx0XHRhLmZpcmUoJ2UyJyk7XG5cdFx0XHRcdC8vIGFzc2VydCB0aGF0IGFsbCBldmVudHMgYXJlIGRlbGl2ZXJlZCBhdCB0aGlzIHBvaW50XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdGVuZXIyRXZlbnRzLCBbJ2UxJywgJ2UyJywgJ2UzJ10pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkcy5hZGQoYS5ldmVudChmdW5jdGlvbiBsaXN0ZW5lcjIoZXZlbnQpIHtcblx0XHRcdGxpc3RlbmVyMkV2ZW50cy5wdXNoKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0YS5maXJlKCdlMScpO1xuXG5cdFx0Ly8gYXNzZXJ0IHRoYXQgYWxsIGV2ZW50cyBhcmUgZGVsaXZlcmVkIGluIG9yZGVyXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0ZW5lcjJFdmVudHMsIFsnZTEnLCAnZTInLCAnZTMnXSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBc3luY0VtaXR0ZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdldmVudCBoYXMgd2FpdFVudGlsLWZ1bmN0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0aW50ZXJmYWNlIEUgZXh0ZW5kcyBJV2FpdFVudGlsIHtcblx0XHRcdGZvbzogYm9vbGVhbjtcblx0XHRcdGJhcjogbnVtYmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgQXN5bmNFbWl0dGVyPEU+KCk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmZvbywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5iYXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBlLndhaXRVbnRpbCwgJ2Z1bmN0aW9uJyk7XG5cdFx0fSkpO1xuXG5cdFx0ZW1pdHRlci5maXJlQXN5bmMoeyBmb286IHRydWUsIGJhcjogMSwgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0ZW1pdHRlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcXVlbnRpYWwgZGVsaXZlcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRpbnRlcmZhY2UgRSBleHRlbmRzIElXYWl0VW50aWwge1xuXHRcdFx0XHRmb286IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBnbG9iYWxTdGF0ZSA9IDA7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEFzeW5jRW1pdHRlcjxFPigpO1xuXG5cdFx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdFx0ZS53YWl0VW50aWwodGltZW91dCgxMCkudGhlbihfID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsU3RhdGUsIDApO1xuXHRcdFx0XHRcdGdsb2JhbFN0YXRlICs9IDE7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGUud2FpdFVudGlsKHRpbWVvdXQoMSkudGhlbihfID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsU3RhdGUsIDEpO1xuXHRcdFx0XHRcdGdsb2JhbFN0YXRlICs9IDE7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0YXdhaXQgZW1pdHRlci5maXJlQXN5bmMoeyBmb286IHRydWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYmFsU3RhdGUsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXF1ZW50aWFsLCBpbi1vcmRlciBkZWxpdmVyeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGludGVyZmFjZSBFIGV4dGVuZHMgSVdhaXRVbnRpbCB7XG5cdFx0XHRcdGZvbzogbnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXZlbnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0bGV0IGRvbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgQXN5bmNFbWl0dGVyPEU+KCk7XG5cblx0XHRcdC8vIGUxXG5cdFx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdFx0ZS53YWl0VW50aWwodGltZW91dCgxMCkudGhlbihhc3luYyBfID0+IHtcblx0XHRcdFx0XHRpZiAoZS5mb28gPT09IDEpIHtcblx0XHRcdFx0XHRcdGF3YWl0IGVtaXR0ZXIuZmlyZUFzeW5jKHsgZm9vOiAyIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFsxLCAyXSk7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gZTJcblx0XHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaChlLmZvbyk7XG5cdFx0XHRcdGUud2FpdFVudGlsKHRpbWVvdXQoNykpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhd2FpdCBlbWl0dGVyLmZpcmVBc3luYyh7IGZvbzogMSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5vayhkb25lKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2F0Y2ggZXJyb3JzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBlcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdHNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4gbnVsbCk7XG5cblx0XHRpbnRlcmZhY2UgRSBleHRlbmRzIElXYWl0VW50aWwge1xuXHRcdFx0Zm9vOiBib29sZWFuO1xuXHRcdH1cblxuXHRcdGxldCBnbG9iYWxTdGF0ZSA9IDA7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBBc3luY0VtaXR0ZXI8RT4oKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0Z2xvYmFsU3RhdGUgKz0gMTtcblx0XHRcdGUud2FpdFVudGlsKG5ldyBQcm9taXNlKChfciwgcmVqZWN0KSA9PiByZWplY3QobmV3IEVycm9yKCkpKSk7XG5cdFx0fSkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiB7XG5cdFx0XHRnbG9iYWxTdGF0ZSArPSAxO1xuXHRcdFx0ZS53YWl0VW50aWwodGltZW91dCgxMCkpO1xuXHRcdFx0ZS53YWl0VW50aWwodGltZW91dCgyMCkudGhlbigoKSA9PiBnbG9iYWxTdGF0ZSsrKSk7IC8vIG11bHRpcGxlIGB3YWl0VW50aWxgIGFyZSBzdXBwb3J0ZWQgYW5kIGF3YWl0ZWQgb25cblx0XHR9KSk7XG5cblx0XHRhd2FpdCBlbWl0dGVyLmZpcmVBc3luYyh7IGZvbzogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKCgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxTdGF0ZSwgMyk7XG5cdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRjb25zb2xlLmxvZyhlKTtcblx0XHRcdGFzc2VydC5vayhmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHRzZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUGF1c2FibGVFbWl0dGVyJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYmFzaWMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YTogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBQYXVzZWFibGVFbWl0dGVyPG51bWJlcj4oKSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IGRhdGEucHVzaChlKSkpO1xuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdXNlL3Jlc3VtZSAtIG5vIG1lcmdlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRhdGE6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgUGF1c2VhYmxlRW1pdHRlcjxudW1iZXI+KCkpO1xuXG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoZSA9PiBkYXRhLnB1c2goZSkpKTtcblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucGF1c2UoKTtcblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMiwgMywgNF0pO1xuXHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdXNlL3Jlc3VtZSAtIG1lcmdlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRhdGE6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgUGF1c2VhYmxlRW1pdHRlcjxudW1iZXI+KHsgbWVyZ2U6IChhKSA9PiBhLnJlZHVjZSgocCwgYykgPT4gcCArIGMsIDApIH0pKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4gZGF0YS5wdXNoKGUpKSk7XG5cdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLnBhdXNlKCk7XG5cdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdGVtaXR0ZXIuZmlyZSg0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDddKTtcblxuXHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyLCA3LCA1XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvdWJsZSBwYXVzZS9yZXN1bWUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YTogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBQYXVzZWFibGVFbWl0dGVyPG51bWJlcj4oKSk7XG5cblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IGRhdGEucHVzaChlKSkpO1xuXHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMl0pO1xuXG5cdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdGVtaXR0ZXIucGF1c2UoKTtcblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDJdKTtcblxuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMl0pO1xuXG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyLCAzLCA0XSk7XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgWzEsIDIsIDMsIDRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdW1lLCBubyBwYXVzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkYXRhOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IFBhdXNlYWJsZUVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4gZGF0YS5wdXNoKGUpKSk7XG5cdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLnJlc3VtZSgpO1xuXHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25lc3RlZCBwYXVzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBkYXRhOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IFBhdXNlYWJsZUVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRcdGxldCBvbmNlID0gdHJ1ZTtcblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IHtcblx0XHRcdGRhdGEucHVzaChlKTtcblxuXHRcdFx0aWYgKG9uY2UpIHtcblx0XHRcdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdFx0XHRvbmNlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRzLmFkZChlbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0ZGF0YS5wdXNoKGUpO1xuXHRcdH0pKTtcblxuXHRcdGVtaXR0ZXIucGF1c2UoKTtcblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGF0YSwgW10pO1xuXG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAxXSk7IC8vIHBhdXNlZCBhZnRlciBmaXJzdCBldmVudFxuXG5cdFx0ZW1pdHRlci5yZXN1bWUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsxLCAxLCAyLCAyXSk7IC8vIHJlbWFpbmcgZXZlbnQgZGVsaXZlcmVkXG5cblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbMSwgMSwgMiwgMiwgMywgM10pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IHBhdXNlIHdpdGggbWVyZ2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZGF0YTogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBQYXVzZWFibGVFbWl0dGVyPG51bWJlcj4oeyBtZXJnZTogYSA9PiBhWzBdIH0pKTtcblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudChlID0+IGRhdGEucHVzaCgxKSkpO1xuXG5cdFx0ZW1pdHRlci5wYXVzZSgpO1xuXHRcdGVtaXR0ZXIucmVzdW1lKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbXSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ0V2ZW50IHV0aWxzIC0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlJywgZnVuY3Rpb24gKCkge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmcm9tT2JzZXJ2YWJsZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG9icyA9IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIDEyKTtcblx0XHRjb25zdCBldmVudCA9IEV2ZW50LmZyb21PYnNlcnZhYmxlKG9icyk7XG5cblx0XHRjb25zdCB2YWx1ZXM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgZCA9IGV2ZW50KG4gPT4geyB2YWx1ZXMucHVzaChuKTsgfSk7XG5cblx0XHRvYnMuc2V0KDMsIHVuZGVmaW5lZCk7XG5cdFx0b2JzLnNldCgxMywgdW5kZWZpbmVkKTtcblx0XHRvYnMuc2V0KDMsIHVuZGVmaW5lZCk7XG5cdFx0b2JzLnNldCgzMywgdW5kZWZpbmVkKTtcblx0XHRvYnMuc2V0KDEsIHVuZGVmaW5lZCk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRvYnMuc2V0KDMzNCwgdHgpO1xuXHRcdFx0b2JzLnNldCg5OSwgdHgpO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2YWx1ZXMsIChbMywgMTMsIDMsIDMzLCAxLCA5OV0pKTtcblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0V2ZW50IHV0aWxzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ0V2ZW50QnVmZmVyZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGJ1ZmZlciB3aGVuIG5vdCB3cmFwcGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyZXIgPSBuZXcgRXZlbnRCdWZmZXJlcigpO1xuXHRcdFx0Y29uc3QgY291bnRlciA9IG5ldyBTYW1wbGVzLkV2ZW50Q291bnRlcigpO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gYnVmZmVyZXIud3JhcEV2ZW50KGVtaXR0ZXIuZXZlbnQpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBldmVudChjb3VudGVyLm9uRXZlbnQsIGNvdW50ZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAxKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuY291bnQsIDIpO1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMyk7XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBidWZmZXIgd2hlbiB3cmFwcGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYnVmZmVyZXIgPSBuZXcgRXZlbnRCdWZmZXJlcigpO1xuXHRcdFx0Y29uc3QgY291bnRlciA9IG5ldyBTYW1wbGVzLkV2ZW50Q291bnRlcigpO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gYnVmZmVyZXIud3JhcEV2ZW50KGVtaXR0ZXIuZXZlbnQpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBldmVudChjb3VudGVyLm9uRXZlbnQsIGNvdW50ZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAxKTtcblxuXHRcdFx0YnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAxKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5jb3VudCwgMyk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmNvdW50LCA0KTtcblxuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25jZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0XHRcdGxldCBjb3VudGVyMSA9IDAsIGNvdW50ZXIyID0gMCwgY291bnRlcjMgPSAwO1xuXG5cdFx0XHRjb25zdCBsaXN0ZW5lcjEgPSBlbWl0dGVyLmV2ZW50KCgpID0+IGNvdW50ZXIxKyspO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIyID0gRXZlbnQub25jZShlbWl0dGVyLmV2ZW50KSgoKSA9PiBjb3VudGVyMisrKTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyMyA9IEV2ZW50Lm9uY2UoZW1pdHRlci5ldmVudCkoKCkgPT4gY291bnRlcjMrKyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjIsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIzLCAwKTtcblxuXHRcdFx0bGlzdGVuZXIzLmRpc3Bvc2UoKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIxLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMiwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjMsIDApO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyMSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcjIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIzLCAwKTtcblxuXHRcdFx0bGlzdGVuZXIxLmRpc3Bvc2UoKTtcblx0XHRcdGxpc3RlbmVyMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWZmZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaG91bGQgYnVmZmVyIGV2ZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gZW1pdHRlci5ldmVudDtcblx0XHRcdGNvbnN0IGJ1ZmZlcmVkRXZlbnQgPSBFdmVudC5idWZmZXIoZXZlbnQsICd0ZXN0Jyk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSBhcyBudW1iZXJbXSk7XG5cblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gYnVmZmVyZWRFdmVudChudW0gPT4gcmVzdWx0LnB1c2gobnVtKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzLCA0XSk7XG5cblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgMywgNF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJ1ZmZlciBldmVudHMgb24gbmV4dCB0aWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdFx0Y29uc3QgYnVmZmVyZWRFdmVudCA9IEV2ZW50LmJ1ZmZlcihldmVudCwgJ3Rlc3QnLCB0cnVlKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdIGFzIG51bWJlcltdKTtcblxuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBidWZmZXJlZEV2ZW50KG51bSA9PiByZXN1bHQucHVzaChudW0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0ZW1pdHRlci5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzLCA0XSk7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoNSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmaXJlIGluaXRpYWwgYnVmZmVyIGV2ZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gZW1pdHRlci5ldmVudDtcblx0XHRcdGNvbnN0IGJ1ZmZlcmVkRXZlbnQgPSBFdmVudC5idWZmZXIoZXZlbnQsICd0ZXN0JywgZmFsc2UsIFstMiwgLTEsIDBdKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdIGFzIG51bWJlcltdKTtcblxuXHRcdFx0ZHMuYWRkKGJ1ZmZlcmVkRXZlbnQobnVtID0+IHJlc3VsdC5wdXNoKG51bSkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbLTIsIC0xLCAwLCAxLCAyLCAzXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFdmVudE11bHRpcGxleGVyJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnd29ya3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBtID0gbmV3IEV2ZW50TXVsdGlwbGV4ZXI8bnVtYmVyPigpO1xuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRjb25zdCBlMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUxLmV2ZW50KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cblx0XHRcdGUxLmZpcmUoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzBdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxleGVyIGRpc3Bvc2Ugd29ya3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBtID0gbmV3IEV2ZW50TXVsdGlwbGV4ZXI8bnVtYmVyPigpO1xuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRjb25zdCBlMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUxLmV2ZW50KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cblx0XHRcdGUxLmZpcmUoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzBdKTtcblxuXHRcdFx0bS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzBdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZlbnQgZGlzcG9zZSB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRlMS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzBdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXV0bGlwbGV4ZXIgZXZlbnQgZGlzcG9zZSB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cdFx0XHRkcy5hZGQobS5ldmVudChyID0+IHJlc3VsdC5wdXNoKHIpKSk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBsMSA9IG0uYWRkKGUxLmV2ZW50KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXG5cdFx0XHRsMS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzBdKTtcblxuXHRcdFx0ZTEuZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG90IHN0YXJ0IHdvcmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbSA9IG5ldyBFdmVudE11bHRpcGxleGVyPG51bWJlcj4oKTtcblx0XHRcdGRzLmFkZChtLmV2ZW50KHIgPT4gcmVzdWx0LnB1c2gocikpKTtcblxuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMS5ldmVudCkpO1xuXHRcdFx0Y29uc3QgZTIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMi5ldmVudCkpO1xuXHRcdFx0Y29uc3QgZTMgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMy5ldmVudCkpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0ZTIuZmlyZSgyKTtcblx0XHRcdGUzLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbGQgc3RhcnQgd29ya3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBtID0gbmV3IEV2ZW50TXVsdGlwbGV4ZXI8bnVtYmVyPigpO1xuXG5cdFx0XHRjb25zdCBlMSA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUxLmV2ZW50KSk7XG5cdFx0XHRjb25zdCBlMiA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUyLmV2ZW50KSk7XG5cdFx0XHRjb25zdCBlMyA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0ZHMuYWRkKG0uYWRkKGUzLmV2ZW50KSk7XG5cblx0XHRcdGRzLmFkZChtLmV2ZW50KHIgPT4gcmVzdWx0LnB1c2gocikpKTtcblxuXHRcdFx0ZTEuZmlyZSgxKTtcblx0XHRcdGUyLmZpcmUoMik7XG5cdFx0XHRlMy5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXRlIGFkZCB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblx0XHRcdGNvbnN0IGUyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTIuZXZlbnQpKTtcblxuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0ZTIuZmlyZSgyKTtcblxuXHRcdFx0Y29uc3QgZTMgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGRzLmFkZChtLmFkZChlMy5ldmVudCkpO1xuXHRcdFx0ZTMuZmlyZSgzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGQgZGlzcG9zZSB3b3JrcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IG0gPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjxudW1iZXI+KCk7XG5cblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTEuZXZlbnQpKTtcblx0XHRcdGNvbnN0IGUyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRkcy5hZGQobS5hZGQoZTIuZXZlbnQpKTtcblxuXHRcdFx0ZHMuYWRkKG0uZXZlbnQociA9PiByZXN1bHQucHVzaChyKSkpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0ZTIuZmlyZSgyKTtcblxuXHRcdFx0Y29uc3QgZTMgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGwzID0gbS5hZGQoZTMuZXZlbnQpO1xuXHRcdFx0ZTMuZmlyZSgzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgM10pO1xuXG5cdFx0XHRsMy5kaXNwb3NlKCk7XG5cdFx0XHRlMy5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzXSk7XG5cblx0XHRcdGUyLmZpcmUoNCk7XG5cdFx0XHRlMS5maXJlKDUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXInLCAoKSA9PiB7XG5cdFx0bGV0IGFkZEVtaXR0ZXI6IEVtaXR0ZXI8VGVzdEl0ZW0+O1xuXHRcdGxldCByZW1vdmVFbWl0dGVyOiBFbWl0dGVyPFRlc3RJdGVtPjtcblx0XHRjb25zdCByZWNvcmRlZEV2ZW50czogbnVtYmVyW10gPSBbXTtcblx0XHRjbGFzcyBUZXN0SXRlbSB7XG5cdFx0XHRyZWFkb25seSBvblRlc3RFdmVudEVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdHJlYWRvbmx5IG9uVGVzdEV2ZW50ID0gdGhpcy5vblRlc3RFdmVudEVtaXR0ZXIuZXZlbnQ7XG5cdFx0fVxuXHRcdGxldCBpdGVtczogVGVzdEl0ZW1bXTtcblx0XHRsZXQgbTogRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyPFRlc3RJdGVtLCBudW1iZXI+O1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGFkZEVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8VGVzdEl0ZW0+KCkpO1xuXHRcdFx0cmVtb3ZlRW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxUZXN0SXRlbT4oKSk7XG5cdFx0XHRpdGVtcyA9IFtuZXcgVGVzdEl0ZW0oKSwgbmV3IFRlc3RJdGVtKCldO1xuXHRcdFx0Zm9yIChjb25zdCBbaSwgaXRlbV0gb2YgaXRlbXMuZW50cmllcygpKSB7XG5cdFx0XHRcdGRzLmFkZChpdGVtLm9uVGVzdEV2ZW50KGUgPT4gYCR7aX06JHtlfWApKTtcblx0XHRcdH1cblx0XHRcdG0gPSBuZXcgRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyKGl0ZW1zLCBhZGRFbWl0dGVyLmV2ZW50LCByZW1vdmVFbWl0dGVyLmV2ZW50LCBlID0+IGUub25UZXN0RXZlbnQpO1xuXHRcdFx0ZHMuYWRkKG0uZXZlbnQoZSA9PiByZWNvcmRlZEV2ZW50cy5wdXNoKGUpKSk7XG5cdFx0XHRyZWNvcmRlZEV2ZW50cy5sZW5ndGggPSAwO1xuXHRcdH0pO1xuXHRcdHRlYXJkb3duKCgpID0+IG0uZGlzcG9zZSgpKTtcblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBldmVudHMgZm9yIGluaXRpYWwgaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRpdGVtc1swXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGl0ZW1zWzFdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDIpO1xuXHRcdFx0aXRlbXNbMF0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRpdGVtc1sxXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSg0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjb3JkZWRFdmVudHMsIFsxLCAyLCAzLCA0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGZpcmUgZXZlbnRzIGZvciBhZGRlZCBpdGVtcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFkZGVkSXRlbSA9IG5ldyBUZXN0SXRlbSgpO1xuXHRcdFx0YWRkRW1pdHRlci5maXJlKGFkZGVkSXRlbSk7XG5cdFx0XHRhZGRlZEl0ZW0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRpdGVtc1swXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdGl0ZW1zWzFdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDMpO1xuXHRcdFx0YWRkZWRJdGVtLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZEV2ZW50cywgWzEsIDIsIDMsIDRdKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgbm90IGZpcmUgZXZlbnRzIGZvciByZW1vdmVkIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0cmVtb3ZlRW1pdHRlci5maXJlKGl0ZW1zWzBdKTtcblx0XHRcdGl0ZW1zWzBdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDEpO1xuXHRcdFx0aXRlbXNbMV0ub25UZXN0RXZlbnRFbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRpdGVtc1swXS5vblRlc3RFdmVudEVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdGl0ZW1zWzFdLm9uVGVzdEV2ZW50RW1pdHRlci5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNvcmRlZEV2ZW50cywgWzIsIDRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdGNvbnN0IGV2ZW50ID0gRXZlbnQubGF0Y2goZW1pdHRlci5ldmVudCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBkcy5hZGQoZXZlbnQobnVtID0+IHJlc3VsdC5wdXNoKG51bSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAxXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAxXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAxLCAzXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAxLCAzXSk7XG5cblx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyLCAxLCAzXSk7XG5cblx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgaXMgcmVlbnRyYW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPih7XG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IGVtaXR0ZXIuZXZlbnQoKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7IC8vIHNob3VsZCBub3QgY3Jhc2hcblx0fSk7XG5cblx0c3VpdGUoJ1JlbGF5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBpbnB1dCB3b3JrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZTEgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdGNvbnN0IGUyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCByZWxheSA9IG5ldyBSZWxheTxudW1iZXI+KCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gKG51bTogbnVtYmVyKSA9PiByZXN1bHQucHVzaChudW0pO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcmVsYXkuZXZlbnQobGlzdGVuZXIpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0cmVsYXkuaW5wdXQgPSBlMS5ldmVudDtcblx0XHRcdGUxLmZpcmUoMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzJdKTtcblxuXHRcdFx0cmVsYXkuaW5wdXQgPSBlMi5ldmVudDtcblx0XHRcdGUxLmZpcmUoMyk7XG5cdFx0XHRlMi5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsyLCA0XSk7XG5cblx0XHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRlMS5maXJlKDUpO1xuXHRcdFx0ZTIuZmlyZSg2KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMiwgNF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIFJlbGF5IGRpc3Bvc2Ugd29yaycsICgpID0+IHtcblx0XHRcdGNvbnN0IGUxID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBlMiA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgcmVsYXkgPSBuZXcgUmVsYXk8bnVtYmVyPigpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IChudW06IG51bWJlcikgPT4gcmVzdWx0LnB1c2gobnVtKTtcblx0XHRcdGRzLmFkZChyZWxheS5ldmVudChsaXN0ZW5lcikpO1xuXG5cdFx0XHRlMS5maXJlKDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblxuXHRcdFx0cmVsYXkuaW5wdXQgPSBlMS5ldmVudDtcblx0XHRcdGUxLmZpcmUoMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzJdKTtcblxuXHRcdFx0cmVsYXkuaW5wdXQgPSBlMi5ldmVudDtcblx0XHRcdGUxLmZpcmUoMyk7XG5cdFx0XHRlMi5maXJlKDQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsyLCA0XSk7XG5cblx0XHRcdHJlbGF5LmRpc3Bvc2UoKTtcblx0XHRcdGUxLmZpcmUoNSk7XG5cdFx0XHRlMi5maXJlKDYpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsyLCA0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhY2N1bXVsYXRlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZmlyZSBhZnRlciBhIGxpc3RlbmVyIGlzIGRpc3Bvc2VkIHdpdGggdW5kZWZpbmVkIG9yIFtdJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGV2ZW50RW1pdHRlci5ldmVudDtcblx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkID0gRXZlbnQuYWNjdW11bGF0ZShldmVudCwgMCk7XG5cblx0XHRcdGNvbnN0IGNhbGxzMTogbnVtYmVyW11bXSA9IFtdO1xuXHRcdFx0Y29uc3QgY2FsbHMyOiBudW1iZXJbXVtdID0gW107XG5cdFx0XHRjb25zdCBsaXN0ZW5lcjEgPSBkcy5hZGQoYWNjdW11bGF0ZWQoKGUpID0+IGNhbGxzMS5wdXNoKGUpKSk7XG5cdFx0XHRkcy5hZGQoYWNjdW11bGF0ZWQoKGUpID0+IGNhbGxzMi5wdXNoKGUpKSk7XG5cblx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDEpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMxLCBbWzFdXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzMiwgW1sxXV0pO1xuXG5cdFx0XHRsaXN0ZW5lcjEuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMxLCBbWzFdXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzMiwgW1sxXV0sICdzaG91bGQgbm90IGZpcmUgYWZ0ZXIgYSBsaXN0ZW5lciBpcyBkaXNwb3NlZCB3aXRoIHVuZGVmaW5lZCBvciBbXScpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBhY2N1bXVsYXRlIGEgc2luZ2xlIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRFbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBldmVudCA9IGV2ZW50RW1pdHRlci5ldmVudDtcblx0XHRcdGNvbnN0IGFjY3VtdWxhdGVkID0gRXZlbnQuYWNjdW11bGF0ZShldmVudCwgMCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdHMxID0gYXdhaXQgbmV3IFByb21pc2U8bnVtYmVyW10+KHIgPT4ge1xuXHRcdFx0XHRkcy5hZGQoYWNjdW11bGF0ZWQocikpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzMSwgWzFdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0czIgPSBhd2FpdCBuZXcgUHJvbWlzZTxudW1iZXJbXT4ociA9PiB7XG5cdFx0XHRcdGRzLmFkZChhY2N1bXVsYXRlZChyKSk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDIpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMyLCBbMl0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBhY2N1bXVsYXRlIG11bHRpcGxlIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50RW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBldmVudEVtaXR0ZXIuZXZlbnQ7XG5cdFx0XHRjb25zdCBhY2N1bXVsYXRlZCA9IEV2ZW50LmFjY3VtdWxhdGUoZXZlbnQsIDApO1xuXG5cdFx0XHRjb25zdCByZXN1bHRzMSA9IGF3YWl0IG5ldyBQcm9taXNlPG51bWJlcltdPihyID0+IHtcblx0XHRcdFx0ZHMuYWRkKGFjY3VtdWxhdGVkKHIpKTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzMSwgWzEsIDIsIDNdKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0czIgPSBhd2FpdCBuZXcgUHJvbWlzZTxudW1iZXJbXT4ociA9PiB7XG5cdFx0XHRcdGRzLmFkZChhY2N1bXVsYXRlZChyKSk7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDQpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSg1KTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoNik7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKDcpO1xuXHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSg4KTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzMiwgWzQsIDUsIDYsIDcsIDhdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlYm91bmNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZScsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0XHRjb25zdCBkb2MgPSBkcy5hZGQobmV3IFNhbXBsZXMuRG9jdW1lbnQzKCkpO1xuXG5cdFx0XHRjb25zdCBvbkRvY0RpZENoYW5nZSA9IEV2ZW50LmRlYm91bmNlKGRvYy5vbkRpZENoYW5nZSwgKHByZXY6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBjdXIpID0+IHtcblx0XHRcdFx0aWYgKCFwcmV2KSB7XG5cdFx0XHRcdFx0cHJldiA9IFtjdXJdO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZXYuaW5kZXhPZihjdXIpIDwgMCkge1xuXHRcdFx0XHRcdHByZXYucHVzaChjdXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwcmV2O1xuXHRcdFx0fSwgMTApO1xuXG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXG5cdFx0XHRkcy5hZGQob25Eb2NEaWRDaGFuZ2Uoa2V5cyA9PiB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdGFzc2VydC5vayhrZXlzLCAnd2FzIG5vdCBleHBlY3Rpbmcga2V5cy4nKTtcblx0XHRcdFx0aWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0ZG9jLnNldFRleHQoJzQnKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtleXMsIFsnMScsICcyJywgJzMnXSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY291bnQgPT09IDIpIHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtleXMsIFsnNCddKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZG9jLnNldFRleHQoJzEnKTtcblx0XHRcdGRvYy5zZXRUZXh0KCcyJyk7XG5cdFx0XHRkb2Muc2V0VGV4dCgnMycpO1xuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdtaWNyb3Rhc2snLCBmdW5jdGlvbiAoZG9uZTogKCkgPT4gdm9pZCkge1xuXHRcdFx0Y29uc3QgZG9jID0gZHMuYWRkKG5ldyBTYW1wbGVzLkRvY3VtZW50MygpKTtcblxuXHRcdFx0Y29uc3Qgb25Eb2NEaWRDaGFuZ2UgPSBFdmVudC5kZWJvdW5jZShkb2Mub25EaWRDaGFuZ2UsIChwcmV2OiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgY3VyKSA9PiB7XG5cdFx0XHRcdGlmICghcHJldikge1xuXHRcdFx0XHRcdHByZXYgPSBbY3VyXTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcmV2LmluZGV4T2YoY3VyKSA8IDApIHtcblx0XHRcdFx0XHRwcmV2LnB1c2goY3VyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcHJldjtcblx0XHRcdH0sIE1pY3JvdGFza0RlbGF5KTtcblxuXHRcdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdFx0ZHMuYWRkKG9uRG9jRGlkQ2hhbmdlKGtleXMgPT4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHRhc3NlcnQub2soa2V5cywgJ3dhcyBub3QgZXhwZWN0aW5nIGtleXMuJyk7XG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdGRvYy5zZXRUZXh0KCc0Jyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChrZXlzLCBbJzEnLCAnMicsICczJ10pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvdW50ID09PSAyKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChrZXlzLCBbJzQnXSk7XG5cdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRvYy5zZXRUZXh0KCcxJyk7XG5cdFx0XHRkb2Muc2V0VGV4dCgnMicpO1xuXHRcdFx0ZG9jLnNldFRleHQoJzMnKTtcblx0XHR9KTtcblxuXG5cdFx0dGVzdCgnbGVhZGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gZSwgMCwgLypsZWFkaW5nPSovdHJ1ZSk7XG5cblx0XHRcdGxldCBjYWxscyA9IDA7XG5cdFx0XHRkcy5hZGQoZGVib3VuY2VkKCgpID0+IHtcblx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSWYgdGhlIHNvdXJjZSBldmVudCBpcyBmaXJlZCBvbmNlLCB0aGUgZGVib3VuY2VkIChvbiB0aGUgbGVhZGluZyBlZGdlKSBldmVudCBzaG91bGQgYmUgZmlyZWQgb25seSBvbmNlXG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWFkaW5nICgyKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gZSwgMCwgLypsZWFkaW5nPSovdHJ1ZSk7XG5cblx0XHRcdGxldCBjYWxscyA9IDA7XG5cdFx0XHRkcy5hZGQoZGVib3VuY2VkKCgpID0+IHtcblx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gSWYgdGhlIHNvdXJjZSBldmVudCBpcyBmaXJlZCBtdWx0aXBsZSB0aW1lcywgdGhlIGRlYm91bmNlZCAob24gdGhlIGxlYWRpbmcgZWRnZSkgZXZlbnQgc2hvdWxkIGJlIGZpcmVkIHR3aWNlXG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYWRpbmcgcmVzZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCBkZWJvdW5jZWQgPSBFdmVudC5kZWJvdW5jZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMCwgLypsZWFkaW5nPSovdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0ZHMuYWRkKGRlYm91bmNlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBmbHVzaCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZGVib3VuY2VkID0gRXZlbnQuZGVib3VuY2UoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDApO1xuXG5cdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gZHMuYWRkKGRlYm91bmNlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZsdXNoT25MaXN0ZW5lclJlbW92ZSAtIHNob3VsZCBmbHVzaCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZGVib3VuY2VkID0gRXZlbnQuZGVib3VuY2UoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDAsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkcy5hZGQoZGVib3VuY2VkKChlKSA9PiBjYWxscy5wdXNoKGUpKSk7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdLCAnc2hvdWxkIGZpcmUgd2l0aCB0aGUgZmlyc3QgZXZlbnQsIG5vdCB0aGUgc2Vjb25kIChhZnRlciBsaXN0ZW5lciBkaXNwb3NlKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGZsdXNoIGV2ZW50cyB3aGVuIHRoZSBlbWl0dGVyIGlzIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0Y29uc3QgZGVib3VuY2VkID0gRXZlbnQuZGVib3VuY2UoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDApO1xuXG5cdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGRzLmFkZChkZWJvdW5jZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0ZW1pdHRlci5kaXNwb3NlKCk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGhyb3R0bGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbGVhZGluZyBvbmx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCAxMCwgLypsZWFkaW5nPSovdHJ1ZSwgLyp0cmFpbGluZz0qL2ZhbHNlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIEZpcnN0IGV2ZW50IGZpcmVzIGltbWVkaWF0ZWx5XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBTdWJzZXF1ZW50IGV2ZW50cyBkdXJpbmcgdGhyb3R0bGUgcGVyaW9kIGFyZSBpZ25vcmVkXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRocm90dGxlIHBlcmlvZCB0byBlbmRcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSwgJ25vIHRyYWlsaW5nIGVkZ2UgZmlyZSB3aXRoIHRyYWlsaW5nPWZhbHNlJyk7XG5cblx0XHRcdFx0Ly8gQWZ0ZXIgdGhyb3R0bGUgcGVyaW9kLCBuZXh0IGV2ZW50IGZpcmVzIGltbWVkaWF0ZWx5XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSg0KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDFdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhaWxpbmcgb25seScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMTAsIC8qbGVhZGluZz0qL2ZhbHNlLCAvKnRyYWlsaW5nPSovdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGRzLmFkZCh0aHJvdHRsZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0XHQvLyBGaXJzdCBldmVudCBkb2VzIG5vdCBmaXJlIGltbWVkaWF0ZWx5XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10pO1xuXG5cdFx0XHRcdC8vIE11bHRpcGxlIGV2ZW50cyBkdXJpbmcgdGhyb3R0bGUgcGVyaW9kXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhyb3R0bGUgcGVyaW9kIC0gc2hvdWxkIGZpcmUgd2l0aCBhY2N1bXVsYXRlZCB2YWx1ZVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzNdKTtcblxuXHRcdFx0XHQvLyBOZXcgZXZlbnRzIHN0YXJ0IGEgbmV3IHRocm90dGxlIHBlcmlvZFxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoNCk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSg1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzNdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzMsIDJdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm90aCBsZWFkaW5nIGFuZCB0cmFpbGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgMTAsIC8qbGVhZGluZz0qL3RydWUsIC8qdHJhaWxpbmc9Ki90cnVlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIEZpcnN0IGV2ZW50IGZpcmVzIGltbWVkaWF0ZWx5IChsZWFkaW5nKVxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0Ly8gRXZlbnRzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2QgYXJlIGFjY3VtdWxhdGVkXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdC8vIFdhaXQgZm9yIHRocm90dGxlIHBlcmlvZCAtIHNob3VsZCBmaXJlIHRyYWlsaW5nIGVkZ2Ugd2l0aCBhY2N1bXVsYXRlZCB2YWx1ZVxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDJdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25seSBsZWFkaW5nIGVkZ2UgaWYgbm8gc3Vic2VxdWVudCBldmVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGwgPyBsICsgMSA6IDEsIDEwLCAvKmxlYWRpbmc9Ki90cnVlLCAvKnRyYWlsaW5nPSovdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGRzLmFkZCh0aHJvdHRsZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0XHQvLyBTaW5nbGUgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHkgKGxlYWRpbmcpXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBObyBtb3JlIGV2ZW50cyBkdXJpbmcgdGhyb3R0bGUgcGVyaW9kXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHQvLyBTaG91bGQgbm90IGZpcmUgdHJhaWxpbmcgZWRnZSBzaW5jZSB0aGVyZSB3ZXJlIG5vIG1vcmUgZXZlbnRzXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pY3JvdGFzayBkZWxheScsIGZ1bmN0aW9uIChkb25lOiAoKSA9PiB2b2lkKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gbCA/IGwgKyAxIDogMSwgTWljcm90YXNrRGVsYXkpO1xuXG5cdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGRzLmFkZCh0aHJvdHRsZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0Ly8gRmlyc3QgZXZlbnQgZmlyZXMgaW1tZWRpYXRlbHkgKGxlYWRpbmcgYnkgZGVmYXVsdClcblx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdC8vIEV2ZW50cyBkdXJpbmcgbWljcm90YXNrXG5cdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHQvLyBDaGVjayBhZnRlciBtaWNyb3Rhc2tcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0Ly8gU2hvdWxkIGhhdmUgZmlyZWQgdHJhaWxpbmcgZWRnZVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMl0pO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21lcmdlIGZ1bmN0aW9uIGFjY3VtdWxhdGVzIHZhbHVlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShcblx0XHRcdFx0XHRlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdChsYXN0LCBjdXIpID0+IChsYXN0IHx8IDApICsgY3VyLFxuXHRcdFx0XHRcdDEwLFxuXHRcdFx0XHRcdC8qbGVhZGluZz0qL3RydWUsXG5cdFx0XHRcdFx0Lyp0cmFpbGluZz0qL3RydWVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdC8vIEZpcnN0IGV2ZW50IGZpcmVzIGltbWVkaWF0ZWx5IHdpdGggdmFsdWUgMVxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0Ly8gQWNjdW11bGF0ZSBtb3JlIHZhbHVlczogMiArIDMgPSA1XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMV0pO1xuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTUpO1xuXHRcdFx0XHQvLyBUcmFpbGluZyBlZGdlIGZpcmVzIHdpdGggYWNjdW11bGF0ZWQgc3VtXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCA1XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JhcGlkIGNvbnNlY3V0aXZlIHRocm90dGxlIHBlcmlvZHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGUsIDEwLCAvKmxlYWRpbmc9Ki90cnVlLCAvKnRyYWlsaW5nPSovdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgY2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRcdGRzLmFkZCh0aHJvdHRsZWQoKGUpID0+IGNhbGxzLnB1c2goZSkpKTtcblxuXHRcdFx0XHQvLyBQZXJpb2QgMVxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMSk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDJdKTtcblxuXHRcdFx0XHQvLyBQZXJpb2QgMlxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSg0KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDIsIDNdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDIsIDMsIDRdKTtcblxuXHRcdFx0XHQvLyBQZXJpb2QgM1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoNSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAyLCAzLCA0LCA1XSk7XG5cblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNSk7XG5cdFx0XHRcdC8vIE5vIHRyYWlsaW5nIGZpcmUgc2luY2Ugb25seSBvbmUgZXZlbnRcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmYXVsdCBwYXJhbWV0ZXJzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdC8vIERlZmF1bHQ6IGRlbGF5PTEwMCwgbGVhZGluZz10cnVlLCB0cmFpbGluZz10cnVlXG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdLCAnc2hvdWxkIGZpcmUgbGVhZGluZyBlZGdlIGJ5IGRlZmF1bHQnKTtcblxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTEwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzEsIDJdLCAnc2hvdWxkIGZpcmUgdHJhaWxpbmcgZWRnZSBieSBkZWZhdWx0Jyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2FsIGNsZWFucyB1cCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgZW1pdHRlciA9IGRzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWQgPSBFdmVudC50aHJvdHRsZShlbWl0dGVyLmV2ZW50LCAobCwgZSkgPT4gZSwgMTApO1xuXG5cdFx0XHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSk7XG5cblx0XHRcdFx0ZW1pdHRlci5maXJlKDEpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxXSk7XG5cblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdC8vIEV2ZW50cyBhZnRlciBkaXNwb3NhbCBzaG91bGQgbm90IGZpcmVcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNSk7XG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gZXZlbnRzIGR1cmluZyB0aHJvdHRsZSB3aXRoIHRyYWlsaW5nPWZhbHNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBlbWl0dGVyID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRcdGNvbnN0IHRocm90dGxlZCA9IEV2ZW50LnRocm90dGxlKGVtaXR0ZXIuZXZlbnQsIChsLCBlKSA9PiBsID8gbCArIDEgOiAxLCAxMCwgLypsZWFkaW5nPSovdHJ1ZSwgLyp0cmFpbGluZz0qL2ZhbHNlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBObyBtb3JlIGV2ZW50c1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzFdKTtcblxuXHRcdFx0XHQvLyBOZXh0IGV2ZW50IGFmdGVyIHRocm90dGxlIHBlcmlvZFxuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAxXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25laXRoZXIgbGVhZGluZyBub3IgdHJhaWxpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkID0gRXZlbnQudGhyb3R0bGUoZW1pdHRlci5ldmVudCwgKGwsIGUpID0+IGUsIDEwLCAvKmxlYWRpbmc9Ki9mYWxzZSwgLyp0cmFpbGluZz0qL2ZhbHNlKTtcblxuXHRcdFx0XHRjb25zdCBjYWxsczogbnVtYmVyW10gPSBbXTtcblx0XHRcdFx0ZHMuYWRkKHRocm90dGxlZCgoZSkgPT4gY2FsbHMucHVzaChlKSkpO1xuXG5cdFx0XHRcdGVtaXR0ZXIuZmlyZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUoMyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtdKTtcblxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDE1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW10sICdubyBldmVudHMgc2hvdWxkIGZpcmUgd2l0aCBib3RoIGxlYWRpbmcgYW5kIHRyYWlsaW5nIGZhbHNlJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIzMDQwMScsICgpID0+IHtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBkcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRkcy5hZGQoZW1pdHRlci5ldmVudCgoKSA9PiB7XG5cdFx0XHRjb3VudCsrO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0fSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KSk7XG5cdFx0ZHMuYWRkKGVtaXR0ZXIuZXZlbnQoKCkgPT4ge1xuXHRcdFx0Y291bnQrKztcblx0XHR9KSk7XG5cdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb3VudCwgMik7XG5cdH0pO1xuXG5cdHN1aXRlKCdjaGFpbjInLCAoKSA9PiB7XG5cdFx0bGV0IGVtOiBFbWl0dGVyPG51bWJlcj47XG5cdFx0bGV0IGNhbGxzOiBudW1iZXJbXTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGVtID0gZHMuYWRkKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdFx0XHRjYWxscyA9IFtdO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFwcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gRXZlbnQuY2hhaW4oZW0uZXZlbnQsICQgPT4gJC5tYXAodiA9PiB2ICogMikpO1xuXHRcdFx0ZHMuYWRkKGV2KHYgPT4gY2FsbHMucHVzaCh2KSkpO1xuXHRcdFx0ZW0uZmlyZSgxKTtcblx0XHRcdGVtLmZpcmUoMik7XG5cdFx0XHRlbS5maXJlKDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgWzIsIDQsIDZdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBldiA9IEV2ZW50LmNoYWluKGVtLmV2ZW50LCAkID0+ICQuZmlsdGVyKHYgPT4gdiAlIDIgPT09IDApKTtcblx0XHRcdGRzLmFkZChldih2ID0+IGNhbGxzLnB1c2godikpKTtcblx0XHRcdGVtLmZpcmUoMSk7XG5cdFx0XHRlbS5maXJlKDIpO1xuXHRcdFx0ZW0uZmlyZSgzKTtcblx0XHRcdGVtLmZpcmUoNCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMiwgNF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVkdWNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gRXZlbnQuY2hhaW4oZW0uZXZlbnQsICQgPT4gJC5yZWR1Y2UoKGFjYywgdikgPT4gYWNjICsgdiwgMCkpO1xuXHRcdFx0ZHMuYWRkKGV2KHYgPT4gY2FsbHMucHVzaCh2KSkpO1xuXHRcdFx0ZW0uZmlyZSgxKTtcblx0XHRcdGVtLmZpcmUoMik7XG5cdFx0XHRlbS5maXJlKDMpO1xuXHRcdFx0ZW0uZmlyZSg0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsxLCAzLCA2LCAxMF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGF0Y2hlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gRXZlbnQuY2hhaW4oZW0uZXZlbnQsICQgPT4gJC5sYXRjaCgpKTtcblx0XHRcdGRzLmFkZChldih2ID0+IGNhbGxzLnB1c2godikpKTtcblx0XHRcdGVtLmZpcmUoMSk7XG5cdFx0XHRlbS5maXJlKDEpO1xuXHRcdFx0ZW0uZmlyZSgyKTtcblx0XHRcdGVtLmZpcmUoMik7XG5cdFx0XHRlbS5maXJlKDMpO1xuXHRcdFx0ZW0uZmlyZSgzKTtcblx0XHRcdGVtLmZpcmUoMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMiwgMywgMV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBldmVyeXRoaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSBFdmVudC5jaGFpbihlbS5ldmVudCwgJCA9PiAkXG5cdFx0XHRcdC5maWx0ZXIodiA9PiB2ICUgMiA9PT0gMClcblx0XHRcdFx0Lm1hcCh2ID0+IHYgKiAyKVxuXHRcdFx0XHQucmVkdWNlKChhY2MsIHYpID0+IGFjYyArIHYsIDApXG5cdFx0XHRcdC5sYXRjaCgpXG5cdFx0XHQpO1xuXG5cdFx0XHRkcy5hZGQoZXYodiA9PiBjYWxscy5wdXNoKHYpKSk7XG5cdFx0XHRlbS5maXJlKDEpO1xuXHRcdFx0ZW0uZmlyZSgyKTtcblx0XHRcdGVtLmZpcmUoMyk7XG5cdFx0XHRlbS5maXJlKDQpO1xuXHRcdFx0ZW0uZmlyZSgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFs0LCAxMl0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjLGlDQUFpQztBQUN4RCxT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
