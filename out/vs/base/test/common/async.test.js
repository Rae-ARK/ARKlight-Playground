import assert from "assert";
import * as async from "../../common/async.js";
import * as MicrotaskDelay from "../../common/symbols.js";
import { CancellationTokenSource } from "../../common/cancellation.js";
import { isCancellationError } from "../../common/errors.js";
import { Event } from "../../common/event.js";
import { URI } from "../../common/uri.js";
import { runWithFakedTimers } from "./timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { DisposableStore } from "../../common/lifecycle.js";
import { Iterable } from "../../common/iterator.js";
suite("Async", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("cancelablePromise", function() {
    test("set token, don't wait for inner promise", function() {
      let canceled = 0;
      const promise = async.createCancelablePromise((token) => {
        store.add(token.onCancellationRequested((_) => {
          canceled += 1;
        }));
        return new Promise((resolve) => {
        });
      });
      const result = promise.then((_) => assert.ok(false), (err) => {
        assert.strictEqual(canceled, 1);
        assert.ok(isCancellationError(err));
      });
      promise.cancel();
      promise.cancel();
      return result;
    });
    test("cancel despite inner promise being resolved", function() {
      let canceled = 0;
      const promise = async.createCancelablePromise((token) => {
        store.add(token.onCancellationRequested((_) => {
          canceled += 1;
        }));
        return Promise.resolve(1234);
      });
      const result = promise.then((_) => assert.ok(false), (err) => {
        assert.strictEqual(canceled, 1);
        assert.ok(isCancellationError(err));
      });
      promise.cancel();
      return result;
    });
    test("cancel disposes result", function() {
      const store2 = new DisposableStore();
      const promise = async.createCancelablePromise(async (token) => {
        return store2;
      });
      promise.then((_) => assert.ok(false), (err) => {
        assert.ok(isCancellationError(err));
        assert.ok(store2.isDisposed);
      });
      promise.cancel();
    });
    test("execution order (sync)", function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise((token) => {
        order.push("in callback");
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        return Promise.resolve(1234);
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      cancellablePromise.cancel();
      order.push("afterCancel");
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("execution order (async)", function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise((token) => {
        order.push("in callback");
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        return new Promise((c) => setTimeout(c.bind(1234), 0));
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      cancellablePromise.cancel();
      order.push("afterCancel");
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("execution order (async with late listener)", async function() {
      const order = [];
      const cancellablePromise = async.createCancelablePromise(async (token) => {
        order.push("in callback");
        await async.timeout(0);
        store.add(token.onCancellationRequested((_) => order.push("cancelled")));
        cancellablePromise.cancel();
        order.push("afterCancel");
      });
      order.push("afterCreate");
      const promise = cancellablePromise.then(void 0, (err) => null).then(() => order.push("finally"));
      return promise.then(() => assert.deepStrictEqual(order, ["in callback", "afterCreate", "cancelled", "afterCancel", "finally"]));
    });
    test("get inner result", async function() {
      const promise = async.createCancelablePromise((token) => {
        return async.timeout(12).then((_) => 1234);
      });
      const result = await promise;
      assert.strictEqual(result, 1234);
    });
  });
  suite("Throttler", function() {
    test("non async", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const throttler = new async.Throttler();
      return Promise.all([
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 1);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        })
      ]).then(() => assert.strictEqual(count, 2));
    });
    test("async", () => {
      let count = 0;
      const factory = () => async.timeout(0).then(() => ++count);
      const throttler = new async.Throttler();
      return Promise.all([
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 1);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        }),
        throttler.queue(factory).then((result) => {
          assert.strictEqual(result, 2);
        })
      ]).then(() => {
        return Promise.all([
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 3);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          }),
          throttler.queue(factory).then((result) => {
            assert.strictEqual(result, 4);
          })
        ]);
      });
    });
    test("last factory should be the one getting called", function() {
      const factoryFactory = (n) => () => {
        return async.timeout(0).then(() => n);
      };
      const throttler = new async.Throttler();
      const promises = [];
      promises.push(throttler.queue(factoryFactory(1)).then((n) => {
        assert.strictEqual(n, 1);
      }));
      promises.push(throttler.queue(factoryFactory(2)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(throttler.queue(factoryFactory(3)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      return Promise.all(promises);
    });
    test("disposal after queueing", async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return async.timeout(0);
      };
      const throttler = new async.Throttler();
      const promises = [];
      promises.push(throttler.queue(factory));
      promises.push(throttler.queue(factory));
      throttler.dispose();
      await Promise.all(promises);
      assert.strictEqual(factoryCalls, 1);
    });
    test("disposal before queueing", async () => {
      let factoryCalls = 0;
      const factory = async () => {
        factoryCalls++;
        return async.timeout(0);
      };
      const throttler = new async.Throttler();
      const promises = [];
      throttler.dispose();
      promises.push(throttler.queue(factory));
      try {
        await Promise.all(promises);
        assert.fail("should fail");
      } catch (err) {
        assert.strictEqual(factoryCalls, 0);
      }
    });
  });
  suite("Delayer", function() {
    test("simple", () => {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    test("microtask delay simple", () => {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
      }));
      assert(delayer.isTriggered());
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    suite("ThrottledDelayer", () => {
      test("promise should resolve if disposed", async () => {
        const throttledDelayer = new async.ThrottledDelayer(100);
        const promise = throttledDelayer.trigger(async () => {
        }, 0);
        throttledDelayer.dispose();
        try {
          await promise;
          assert.fail("SHOULD NOT BE HERE");
        } catch (err) {
        }
      });
      test("trigger after dispose throws", async () => {
        const throttledDelayer = new async.ThrottledDelayer(100);
        throttledDelayer.dispose();
        await assert.rejects(() => throttledDelayer.trigger(async () => {
        }, 0));
      });
    });
    test("simple cancel", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then(() => {
        assert(false);
      }, () => {
        assert(true, "yes, it was cancelled");
      });
      assert(delayer.isTriggered());
      delayer.cancel();
      assert(!delayer.isTriggered());
      return p;
    });
    test("simple cancel microtask", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(MicrotaskDelay.MicrotaskDelay);
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then(() => {
        assert(false);
      }, () => {
        assert(true, "yes, it was cancelled");
      });
      assert(delayer.isTriggered());
      delayer.cancel();
      assert(!delayer.isTriggered());
      return p;
    });
    test("cancel should cancel all calls to trigger", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      promises.push(delayer.trigger(factory).then(void 0, () => {
        assert(true, "yes, it was cancelled");
      }));
      assert(delayer.isTriggered());
      delayer.cancel();
      return Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
    });
    test("trigger, cancel, then trigger again", function() {
      let count = 0;
      const factory = () => {
        return Promise.resolve(++count);
      };
      const delayer = new async.Delayer(0);
      let promises = [];
      assert(!delayer.isTriggered());
      const p = delayer.trigger(factory).then((result) => {
        assert.strictEqual(result, 1);
        assert(!delayer.isTriggered());
        promises.push(delayer.trigger(factory).then(void 0, () => {
          assert(true, "yes, it was cancelled");
        }));
        assert(delayer.isTriggered());
        promises.push(delayer.trigger(factory).then(void 0, () => {
          assert(true, "yes, it was cancelled");
        }));
        assert(delayer.isTriggered());
        delayer.cancel();
        const p2 = Promise.all(promises).then(() => {
          promises = [];
          assert(!delayer.isTriggered());
          promises.push(delayer.trigger(factory).then(() => {
            assert.strictEqual(result, 1);
            assert(!delayer.isTriggered());
          }));
          assert(delayer.isTriggered());
          promises.push(delayer.trigger(factory).then(() => {
            assert.strictEqual(result, 1);
            assert(!delayer.isTriggered());
          }));
          assert(delayer.isTriggered());
          const p3 = Promise.all(promises).then(() => {
            assert(!delayer.isTriggered());
          });
          assert(delayer.isTriggered());
          return p3;
        });
        return p2;
      });
      assert(delayer.isTriggered());
      return p;
    });
    test("last task should be the one getting called", function() {
      const factoryFactory = (n) => () => {
        return Promise.resolve(n);
      };
      const delayer = new async.Delayer(0);
      const promises = [];
      assert(!delayer.isTriggered());
      promises.push(delayer.trigger(factoryFactory(1)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(delayer.trigger(factoryFactory(2)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      promises.push(delayer.trigger(factoryFactory(3)).then((n) => {
        assert.strictEqual(n, 3);
      }));
      const p = Promise.all(promises).then(() => {
        assert(!delayer.isTriggered());
      });
      assert(delayer.isTriggered());
      return p;
    });
  });
  suite("sequence", () => {
    test("simple", () => {
      const factoryFactory = (n) => () => {
        return Promise.resolve(n);
      };
      return async.sequence([
        factoryFactory(1),
        factoryFactory(2),
        factoryFactory(3),
        factoryFactory(4),
        factoryFactory(5)
      ]).then((result) => {
        assert.strictEqual(5, result.length);
        assert.strictEqual(1, result[0]);
        assert.strictEqual(2, result[1]);
        assert.strictEqual(3, result[2]);
        assert.strictEqual(4, result[3]);
        assert.strictEqual(5, result[4]);
      });
    });
  });
  suite("Limiter", () => {
    test("assert degree of paralellism", function() {
      let activePromises = 0;
      const factoryFactory = (n) => () => {
        activePromises++;
        assert(activePromises < 6);
        return async.timeout(0).then(() => {
          activePromises--;
          return n;
        });
      };
      const limiter = new async.Limiter(5);
      const promises = [];
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((n) => promises.push(limiter.queue(factoryFactory(n))));
      return Promise.all(promises).then((res) => {
        assert.strictEqual(10, res.length);
        assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], res);
      });
    });
  });
  suite("Queue", () => {
    test("simple", function() {
      const queue = new async.Queue();
      let syncPromise = false;
      const f1 = () => Promise.resolve(true).then(() => syncPromise = true);
      let asyncPromise = false;
      const f2 = () => async.timeout(10).then(() => asyncPromise = true);
      assert.strictEqual(queue.size, 0);
      queue.queue(f1);
      assert.strictEqual(queue.size, 1);
      const p = queue.queue(f2);
      assert.strictEqual(queue.size, 2);
      return p.then(() => {
        assert.strictEqual(queue.size, 0);
        assert.ok(syncPromise);
        assert.ok(asyncPromise);
      });
    });
    test("stop processing on dispose", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.dispose();
      };
      const p1 = queue.queue(task);
      queue.queue(task);
      queue.queue(task);
      assert.strictEqual(queue.size, 3);
      await p1;
      assert.strictEqual(workCounter, 1);
    });
    test("stop on clear", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.clear();
        assert.strictEqual(queue.size, 1);
      };
      const p1 = queue.queue(task);
      queue.queue(task);
      queue.queue(task);
      assert.strictEqual(queue.size, 3);
      await p1;
      assert.strictEqual(workCounter, 1);
      assert.strictEqual(queue.size, 0);
      const p2 = queue.queue(task);
      await p2;
      assert.strictEqual(workCounter, 2);
    });
    test("clear and drain (1)", async function() {
      const queue = new async.Queue();
      let workCounter = 0;
      const task = async () => {
        await async.timeout(0);
        workCounter++;
        queue.clear();
      };
      const p0 = Event.toPromise(queue.onDrained);
      const p1 = queue.queue(task);
      await p1;
      await p0;
      assert.strictEqual(workCounter, 1);
      queue.dispose();
    });
    test("clear and drain (2)", async function() {
      const queue = new async.Queue();
      let didFire = false;
      const d = queue.onDrained(() => {
        didFire = true;
      });
      queue.clear();
      assert.strictEqual(didFire, false);
      d.dispose();
      queue.dispose();
    });
    test("drain timing", async function() {
      const queue = new async.Queue();
      const logicClock = new class {
        constructor() {
          this.time = 0;
        }
        tick() {
          return this.time++;
        }
      }();
      let didDrainTime = 0;
      let didFinishTime1 = 0;
      let didFinishTime2 = 0;
      const d = queue.onDrained(() => {
        didDrainTime = logicClock.tick();
      });
      const p1 = queue.queue(() => {
        didFinishTime1 = logicClock.tick();
        return Promise.resolve();
      });
      const p2 = queue.queue(async () => {
        await async.timeout(10);
        didFinishTime2 = logicClock.tick();
      });
      await Promise.all([p1, p2]);
      assert.strictEqual(didFinishTime1, 0);
      assert.strictEqual(didFinishTime2, 1);
      assert.strictEqual(didDrainTime, 2);
      d.dispose();
      queue.dispose();
    });
    test("drain event is send only once", async function() {
      const queue = new async.Queue();
      let drainCount = 0;
      const d = queue.onDrained(() => {
        drainCount++;
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      queue.queue(async () => {
      });
      assert.strictEqual(drainCount, 0);
      assert.strictEqual(queue.size, 4);
      await queue.whenIdle();
      assert.strictEqual(drainCount, 1);
      d.dispose();
      queue.dispose();
    });
    test("order is kept", function() {
      return runWithFakedTimers({}, () => {
        const queue = new async.Queue();
        const res = [];
        const f1 = () => Promise.resolve(true).then(() => res.push(1));
        const f2 = () => async.timeout(10).then(() => res.push(2));
        const f3 = () => Promise.resolve(true).then(() => res.push(3));
        const f4 = () => async.timeout(20).then(() => res.push(4));
        const f5 = () => async.timeout(0).then(() => res.push(5));
        queue.queue(f1);
        queue.queue(f2);
        queue.queue(f3);
        queue.queue(f4);
        return queue.queue(f5).then(() => {
          assert.strictEqual(res[0], 1);
          assert.strictEqual(res[1], 2);
          assert.strictEqual(res[2], 3);
          assert.strictEqual(res[3], 4);
          assert.strictEqual(res[4], 5);
        });
      });
    });
    test("errors bubble individually but not cause stop", function() {
      const queue = new async.Queue();
      const res = [];
      let error = false;
      const f1 = () => Promise.resolve(true).then(() => res.push(1));
      const f2 = () => async.timeout(10).then(() => res.push(2));
      const f3 = () => Promise.resolve(true).then(() => Promise.reject(new Error("error")));
      const f4 = () => async.timeout(20).then(() => res.push(4));
      const f5 = () => async.timeout(0).then(() => res.push(5));
      queue.queue(f1);
      queue.queue(f2);
      queue.queue(f3).then(void 0, () => error = true);
      queue.queue(f4);
      return queue.queue(f5).then(() => {
        assert.strictEqual(res[0], 1);
        assert.strictEqual(res[1], 2);
        assert.ok(error);
        assert.strictEqual(res[2], 4);
        assert.strictEqual(res[3], 5);
      });
    });
    test("order is kept (chained)", function() {
      const queue = new async.Queue();
      const res = [];
      const f1 = () => Promise.resolve(true).then(() => res.push(1));
      const f2 = () => async.timeout(10).then(() => res.push(2));
      const f3 = () => Promise.resolve(true).then(() => res.push(3));
      const f4 = () => async.timeout(20).then(() => res.push(4));
      const f5 = () => async.timeout(0).then(() => res.push(5));
      return queue.queue(f1).then(() => {
        return queue.queue(f2).then(() => {
          return queue.queue(f3).then(() => {
            return queue.queue(f4).then(() => {
              return queue.queue(f5).then(() => {
                assert.strictEqual(res[0], 1);
                assert.strictEqual(res[1], 2);
                assert.strictEqual(res[2], 3);
                assert.strictEqual(res[3], 4);
                assert.strictEqual(res[4], 5);
              });
            });
          });
        });
      });
    });
    test("events", async function() {
      const queue = new async.Queue();
      let drained = false;
      const onDrained = Event.toPromise(queue.onDrained).then(() => drained = true);
      const res = [];
      const f1 = () => async.timeout(10).then(() => res.push(2));
      const f2 = () => async.timeout(20).then(() => res.push(4));
      const f3 = () => async.timeout(0).then(() => res.push(5));
      const q1 = queue.queue(f1);
      const q2 = queue.queue(f2);
      queue.queue(f3);
      q1.then(() => {
        assert.ok(!drained);
        q2.then(() => {
          assert.ok(!drained);
        });
      });
      await onDrained;
      assert.ok(drained);
    });
  });
  suite("ResourceQueue", () => {
    test("simple", async function() {
      const queue = new async.ResourceQueue();
      await queue.whenDrained();
      let done1 = false;
      queue.queueFor(URI.file("/some/path"), async () => {
        done1 = true;
      });
      await queue.whenDrained();
      assert.strictEqual(done1, true);
      let done2 = false;
      queue.queueFor(URI.file("/some/other/path"), async () => {
        done2 = true;
      });
      await queue.whenDrained();
      assert.strictEqual(done2, true);
      const w1 = new async.DeferredPromise();
      queue.queueFor(URI.file("/some/path"), () => w1.p);
      let drained = false;
      queue.whenDrained().then(() => drained = true);
      assert.strictEqual(drained, false);
      await w1.complete();
      await async.timeout(0);
      assert.strictEqual(drained, true);
      const w2 = new async.DeferredPromise();
      const w3 = new async.DeferredPromise();
      queue.queueFor(URI.file("/some/path"), () => w2.p);
      queue.queueFor(URI.file("/some/other/path"), () => w3.p);
      drained = false;
      queue.whenDrained().then(() => drained = true);
      queue.dispose();
      await async.timeout(0);
      assert.strictEqual(drained, true);
    });
  });
  suite("retry", () => {
    test("success case", async () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let counter = 0;
        const res = await async.retry(() => {
          counter++;
          if (counter < 2) {
            return Promise.reject(new Error("fail"));
          }
          return Promise.resolve(true);
        }, 10, 3);
        assert.strictEqual(res, true);
      });
    });
    test("error case", async () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        const expectedError = new Error("fail");
        try {
          await async.retry(() => {
            return Promise.reject(expectedError);
          }, 10, 3);
        } catch (error) {
          assert.strictEqual(error, error);
        }
      });
    });
  });
  suite("TaskSequentializer", () => {
    test("execution basics", async function() {
      const sequentializer = new async.TaskSequentializer();
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.hasQueued());
      assert.ok(!sequentializer.isRunning(2323));
      assert.ok(!sequentializer.running);
      await sequentializer.run(1, Promise.resolve());
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.isRunning(1));
      assert.ok(!sequentializer.running);
      assert.ok(!sequentializer.hasQueued());
      sequentializer.run(2, async.timeout(1));
      assert.ok(sequentializer.isRunning());
      assert.ok(sequentializer.isRunning(2));
      assert.ok(!sequentializer.hasQueued());
      assert.strictEqual(sequentializer.isRunning(1), false);
      assert.ok(sequentializer.running);
      await async.timeout(2);
      assert.strictEqual(sequentializer.isRunning(), false);
      assert.strictEqual(sequentializer.isRunning(2), false);
      assert.ok(!sequentializer.running);
    });
    test("executing and queued (finishes instantly)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      const res = sequentializer.queue(() => Promise.resolve(null).then(() => {
        queuedDone = true;
        return;
      }));
      assert.ok(sequentializer.hasQueued());
      await res;
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.hasQueued());
    });
    test("executing and queued (finishes after timeout)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      const res = sequentializer.queue(() => async.timeout(1).then(() => {
        queuedDone = true;
        return;
      }));
      await res;
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.hasQueued());
    });
    test("join (without executing or queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      await sequentializer.join();
      assert.ok(!sequentializer.hasQueued());
    });
    test("join (without queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      await sequentializer.join();
      assert.ok(pendingDone);
      assert.ok(!sequentializer.isRunning());
    });
    test("join (with executing and queued)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let queuedDone = false;
      sequentializer.queue(() => async.timeout(1).then(() => {
        queuedDone = true;
        return;
      }));
      await sequentializer.join();
      assert.ok(pendingDone);
      assert.ok(queuedDone);
      assert.ok(!sequentializer.isRunning());
      assert.ok(!sequentializer.hasQueued());
    });
    test("executing and multiple queued (last one wins)", async function() {
      const sequentializer = new async.TaskSequentializer();
      let pendingDone = false;
      sequentializer.run(1, async.timeout(1).then(() => {
        pendingDone = true;
        return;
      }));
      let firstDone = false;
      const firstRes = sequentializer.queue(() => async.timeout(2).then(() => {
        firstDone = true;
        return;
      }));
      let secondDone = false;
      const secondRes = sequentializer.queue(() => async.timeout(3).then(() => {
        secondDone = true;
        return;
      }));
      let thirdDone = false;
      const thirdRes = sequentializer.queue(() => async.timeout(4).then(() => {
        thirdDone = true;
        return;
      }));
      await Promise.all([firstRes, secondRes, thirdRes]);
      assert.ok(pendingDone);
      assert.ok(!firstDone);
      assert.ok(!secondDone);
      assert.ok(thirdDone);
    });
    test("cancel executing", async function() {
      const sequentializer = new async.TaskSequentializer();
      const ctsTimeout = store.add(new CancellationTokenSource());
      let pendingCancelled = false;
      const timeout = async.timeout(1, ctsTimeout.token);
      sequentializer.run(1, timeout, () => pendingCancelled = true);
      sequentializer.cancelRunning();
      assert.ok(pendingCancelled);
      ctsTimeout.cancel();
    });
  });
  suite("disposableTimeout", () => {
    test("handler only success", async () => {
      let cb = false;
      const t = async.disposableTimeout(() => cb = true);
      await async.timeout(0);
      assert.strictEqual(cb, true);
      t.dispose();
    });
    test("handler only cancel", async () => {
      let cb = false;
      const t = async.disposableTimeout(() => cb = true);
      t.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
    });
    test("store managed success", async () => {
      let cb = false;
      const s = new DisposableStore();
      async.disposableTimeout(() => cb = true, 0, s);
      await async.timeout(0);
      assert.strictEqual(cb, true);
      s.dispose();
    });
    test("store managed cancel via disposable", async () => {
      let cb = false;
      const s = new DisposableStore();
      const t = async.disposableTimeout(() => cb = true, 0, s);
      t.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
      s.dispose();
    });
    test("store managed cancel via store", async () => {
      let cb = false;
      const s = new DisposableStore();
      async.disposableTimeout(() => cb = true, 0, s);
      s.dispose();
      await async.timeout(0);
      assert.strictEqual(cb, false);
    });
  });
  suite("disposableLongTimeout", () => {
    test("fires after a delay larger than the setTimeout maximum", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const t = async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2 + 1e3);
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2 + 2e3);
        assert.strictEqual(cb, true);
        t.dispose();
      });
    });
    test("does not fire after disposal mid-wait", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const t = async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2);
        await async.timeout(async.MAX_TIMEOUT_DELAY);
        t.dispose();
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2);
        assert.strictEqual(cb, false);
      });
    });
    test("store managed success evicts on fire", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const s = new DisposableStore();
        async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY + 500, s);
        await async.timeout(async.MAX_TIMEOUT_DELAY + 1e3);
        assert.strictEqual(cb, true);
        s.dispose();
      });
    });
    test("store managed cancel via store", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        let cb = false;
        const s = new DisposableStore();
        async.disposableLongTimeout(() => cb = true, async.MAX_TIMEOUT_DELAY * 2, s);
        s.dispose();
        await async.timeout(async.MAX_TIMEOUT_DELAY * 2);
        assert.strictEqual(cb, false);
      });
    });
  });
  test("raceCancellation", async () => {
    const cts = store.add(new CancellationTokenSource());
    const ctsTimeout = store.add(new CancellationTokenSource());
    let triggered = false;
    const timeout = async.timeout(100, ctsTimeout.token);
    const p = async.raceCancellation(timeout.then(() => triggered = true), cts.token);
    cts.cancel();
    await p;
    assert.ok(!triggered);
    ctsTimeout.cancel();
  });
  test("raceTimeout", async () => {
    const cts = store.add(new CancellationTokenSource());
    let timedout = false;
    let triggered = false;
    const ctsTimeout1 = store.add(new CancellationTokenSource());
    const timeout1 = async.timeout(100, ctsTimeout1.token);
    const p1 = async.raceTimeout(timeout1.then(() => triggered = true), 1, () => timedout = true);
    cts.cancel();
    await p1;
    assert.ok(!triggered);
    assert.strictEqual(timedout, true);
    ctsTimeout1.cancel();
    timedout = false;
    const ctsTimeout2 = store.add(new CancellationTokenSource());
    const timeout2 = async.timeout(1, ctsTimeout2.token);
    const p2 = async.raceTimeout(timeout2.then(() => triggered = true), 100, () => timedout = true);
    cts.cancel();
    await p2;
    assert.ok(triggered);
    assert.strictEqual(timedout, false);
    ctsTimeout2.cancel();
  });
  test("SequencerByKey", async () => {
    const s = new async.SequencerByKey();
    const r1 = await s.queue("key1", () => Promise.resolve("hello"));
    assert.strictEqual(r1, "hello");
    await s.queue("key2", () => Promise.reject(new Error("failed"))).then(() => {
      throw new Error("should not be resolved");
    }, (err) => {
      assert.strictEqual(err.message, "failed");
    });
    const r3 = await s.queue("key2", () => Promise.resolve("hello"));
    assert.strictEqual(r3, "hello");
  });
  test("IntervalCounter", async () => {
    let now = 0;
    const counter = new async.IntervalCounter(5, () => now);
    assert.strictEqual(counter.increment(), 1);
    assert.strictEqual(counter.increment(), 2);
    assert.strictEqual(counter.increment(), 3);
    now = 10;
    assert.strictEqual(counter.increment(), 1);
    assert.strictEqual(counter.increment(), 2);
    assert.strictEqual(counter.increment(), 3);
  });
  suite("firstParallel", () => {
    test("simple", async () => {
      const a = await async.firstParallel([
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3)
      ], (v) => v === 2);
      assert.strictEqual(a, 2);
    });
    test("uses null default", async () => {
      assert.strictEqual(await async.firstParallel([Promise.resolve(1)], (v) => v === 2), null);
    });
    test("uses value default", async () => {
      assert.strictEqual(await async.firstParallel([Promise.resolve(1)], (v) => v === 2, 4), 4);
    });
    test("empty", async () => {
      assert.strictEqual(await async.firstParallel([], (v) => v === 2, 4), 4);
    });
    test("cancels", async () => {
      let ct1;
      const p1 = async.createCancelablePromise(async (ct) => {
        ct1 = ct;
        await async.timeout(200, ct);
        return 1;
      });
      let ct2;
      const p2 = async.createCancelablePromise(async (ct) => {
        ct2 = ct;
        await async.timeout(2, ct);
        return 2;
      });
      assert.strictEqual(await async.firstParallel([p1, p2], (v) => v === 2, 4), 2);
      assert.strictEqual(ct1.isCancellationRequested, true, "should cancel a");
      assert.strictEqual(ct2.isCancellationRequested, true, "should cancel b");
    });
    test("rejection handling", async () => {
      let ct1;
      const p1 = async.createCancelablePromise(async (ct) => {
        ct1 = ct;
        await async.timeout(200, ct);
        return 1;
      });
      let ct2;
      const p2 = async.createCancelablePromise(async (ct) => {
        ct2 = ct;
        await async.timeout(2, ct);
        throw new Error("oh no");
      });
      assert.strictEqual(await async.firstParallel([p1, p2], (v) => v === 2, 4).catch(() => "ok"), "ok");
      assert.strictEqual(ct1.isCancellationRequested, true, "should cancel a");
      assert.strictEqual(ct2.isCancellationRequested, true, "should cancel b");
    });
  });
  suite("DeferredPromise", () => {
    test("resolves", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isResolved, false);
      deferred.complete(42);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.isResolved, true);
    });
    test("rejects", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isRejected, false);
      const err = new Error("oh no!");
      deferred.error(err);
      assert.strictEqual(await deferred.p.catch((e) => e), err);
      assert.strictEqual(deferred.isRejected, true);
    });
    test("cancels", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isRejected, false);
      deferred.cancel();
      assert.strictEqual((await deferred.p.catch((e) => e)).name, "Canceled");
      assert.strictEqual(deferred.isRejected, true);
    });
    test("retains the original settled value", async () => {
      const deferred = new async.DeferredPromise();
      assert.strictEqual(deferred.isResolved, false);
      assert.strictEqual(deferred.value, void 0);
      deferred.complete(42);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.value, 42);
      assert.strictEqual(deferred.isResolved, true);
      deferred.complete(-1);
      assert.strictEqual(await deferred.p, 42);
      assert.strictEqual(deferred.value, 42);
      assert.strictEqual(deferred.isResolved, true);
    });
  });
  suite("Promises.settled", () => {
    test("resolves", async () => {
      const p1 = Promise.resolve(1);
      const p2 = async.timeout(1).then(() => 2);
      const p3 = async.timeout(2).then(() => 3);
      const result = await async.Promises.settled([p1, p2, p3]);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], 1);
      assert.deepStrictEqual(result[1], 2);
      assert.deepStrictEqual(result[2], 3);
    });
    test("resolves in order", async () => {
      const p1 = async.timeout(2).then(() => 1);
      const p2 = async.timeout(1).then(() => 2);
      const p3 = Promise.resolve(3);
      const result = await async.Promises.settled([p1, p2, p3]);
      assert.strictEqual(result.length, 3);
      assert.deepStrictEqual(result[0], 1);
      assert.deepStrictEqual(result[1], 2);
      assert.deepStrictEqual(result[2], 3);
    });
    test("rejects with first error but handles all promises (all errors)", async () => {
      const p1 = Promise.reject(1);
      let p2Handled = false;
      const p2Error = new Error("2");
      const p2 = async.timeout(1).then(() => {
        p2Handled = true;
        throw p2Error;
      });
      let p3Handled = false;
      const p3Error = new Error("3");
      const p3 = async.timeout(2).then(() => {
        p3Handled = true;
        throw p3Error;
      });
      let error = void 0;
      try {
        await async.Promises.settled([p1, p2, p3]);
      } catch (e) {
        error = e;
      }
      assert.ok(error);
      assert.notStrictEqual(error, p2Error);
      assert.notStrictEqual(error, p3Error);
      assert.ok(p2Handled);
      assert.ok(p3Handled);
    });
    test("rejects with first error but handles all promises (1 error)", async () => {
      const p1 = Promise.resolve(1);
      let p2Handled = false;
      const p2Error = new Error("2");
      const p2 = async.timeout(1).then(() => {
        p2Handled = true;
        throw p2Error;
      });
      let p3Handled = false;
      const p3 = async.timeout(2).then(() => {
        p3Handled = true;
        return 3;
      });
      let error = void 0;
      try {
        await async.Promises.settled([p1, p2, p3]);
      } catch (e) {
        error = e;
      }
      assert.strictEqual(error, p2Error);
      assert.ok(p2Handled);
      assert.ok(p3Handled);
    });
  });
  suite("Promises.withAsyncBody", () => {
    test("basics", async () => {
      const p1 = async.Promises.withAsyncBody(async (resolve, reject) => {
        resolve(1);
      });
      const p2 = async.Promises.withAsyncBody(async (resolve, reject) => {
        reject(new Error("error"));
      });
      const p3 = async.Promises.withAsyncBody(async (resolve, reject) => {
        throw new Error("error");
      });
      const r1 = await p1;
      assert.strictEqual(r1, 1);
      let e2 = void 0;
      try {
        await p2;
      } catch (error) {
        e2 = error;
      }
      assert.ok(e2 instanceof Error);
      let e3 = void 0;
      try {
        await p3;
      } catch (error) {
        e3 = error;
      }
      assert.ok(e3 instanceof Error);
    });
  });
  suite("ThrottledWorker", () => {
    function assertArrayEquals(actual, expected) {
      assert.strictEqual(actual.length, expected.length);
      for (let i = 0; i < actual.length; i++) {
        assert.strictEqual(actual[i], expected[i]);
      }
    }
    test("basics", async () => {
      let handled = [];
      let handledCallback;
      let handledPromise = new Promise((resolve) => handledCallback = resolve);
      let handledCounterToResolve = 1;
      let currentHandledCounter = 0;
      const handler = (units) => {
        handled.push(...units);
        currentHandledCounter++;
        if (currentHandledCounter === handledCounterToResolve) {
          handledCallback();
          handledPromise = new Promise((resolve) => handledCallback = resolve);
          currentHandledCounter = 0;
        }
      };
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: void 0,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3]);
      assertArrayEquals(handled, [1, 2, 3]);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, true);
      worker.work([4, 5]);
      worked = worker.work([6]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6]);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, true);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 2);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7]);
      handled = [];
      handledCounterToResolve = 4;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 14);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 5);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      handled = [];
      handledCounterToResolve = 3;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 2);
      assert.strictEqual(worked, true);
      worker.work([8]);
      worked = worker.work([9, 10, 11]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worker.pending, 6);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.strictEqual(worker.pending, 0);
      handled = [];
      handledCounterToResolve = 2;
      worked = worker.work([1, 2, 3, 4, 5, 6, 7]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worked, true);
      worker.work([8]);
      worked = worker.work([9, 10]);
      assertArrayEquals(handled, [1, 2, 3, 4, 5]);
      assert.strictEqual(worked, true);
      await handledPromise;
      assertArrayEquals(handled, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
    test("do not accept too much work", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: 5,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3]);
      assert.strictEqual(worked, true);
      worked = worker.work([1, 2, 3, 4, 5, 6]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 1);
      worked = worker.work([7]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 2);
      worked = worker.work([8, 9, 10, 11]);
      assert.strictEqual(worked, false);
      assert.strictEqual(worker.pending, 2);
    });
    test("do not accept too much work (account for max chunk size", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: 5,
        throttleDelay: 1
      }, handler));
      let worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.strictEqual(worked, false);
      assert.strictEqual(worker.pending, 0);
      worked = worker.work([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      assert.strictEqual(worked, true);
      assert.strictEqual(worker.pending, 5);
    });
    test("disposed", async () => {
      const handled = [];
      const handler = (units) => handled.push(...units);
      const worker = store.add(new async.ThrottledWorker({
        maxWorkChunkSize: 5,
        maxBufferedWork: void 0,
        throttleDelay: 1
      }, handler));
      worker.dispose();
      const worked = worker.work([1, 2, 3]);
      assertArrayEquals(handled, []);
      assert.strictEqual(worker.pending, 0);
      assert.strictEqual(worked, false);
    });
  });
  suite("LimitedQueue", () => {
    test("basics (with long running task)", async () => {
      const limitedQueue = new async.LimitedQueue();
      let counter = 0;
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(limitedQueue.queue(async () => {
          counter = i;
          await async.timeout(1);
        }));
      }
      await Promise.all(promises);
      assert.strictEqual(counter, 4);
    });
    test("basics (with sync running task)", async () => {
      const limitedQueue = new async.LimitedQueue();
      let counter = 0;
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(limitedQueue.queue(async () => {
          counter = i;
        }));
      }
      await Promise.all(promises);
      assert.strictEqual(counter, 4);
    });
  });
  suite("AsyncIterableObject", function() {
    test("onReturn NOT called", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      for await (const item of iter) {
        assert.strictEqual(typeof item, "number");
      }
      assert.strictEqual(calledOnReturn, false);
    });
    test("onReturn called on break", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      for await (const item of iter) {
        assert.strictEqual(item, 1);
        break;
      }
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn called on return", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      await (async function test2() {
        for await (const item of iter) {
          assert.strictEqual(item, 1);
          return;
        }
      })();
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn called on throwing", async function() {
      let calledOnReturn = false;
      const iter = new async.AsyncIterableObject((writer) => {
        writer.emitMany([1, 2, 3, 4, 5]);
      }, () => {
        calledOnReturn = true;
      });
      try {
        for await (const item of iter) {
          assert.strictEqual(item, 1);
          throw new Error();
        }
      } catch (e) {
      }
      assert.strictEqual(calledOnReturn, true);
    });
  });
  suite("AsyncIterableSource", function() {
    test("onReturn is wired up", async function() {
      let calledOnReturn = false;
      const source = new async.AsyncIterableSource(() => {
        calledOnReturn = true;
      });
      source.emitOne(1);
      source.emitOne(2);
      source.emitOne(3);
      source.resolve();
      for await (const item of source.asyncIterable) {
        assert.strictEqual(item, 1);
        break;
      }
      assert.strictEqual(calledOnReturn, true);
    });
    test("onReturn is wired up 2", async function() {
      let calledOnReturn = false;
      const source = new async.AsyncIterableSource(() => {
        calledOnReturn = true;
      });
      source.emitOne(1);
      source.emitOne(2);
      source.emitOne(3);
      source.resolve();
      for await (const item of source.asyncIterable) {
        assert.strictEqual(typeof item, "number");
      }
      assert.strictEqual(calledOnReturn, false);
    });
    test("emitMany emits all items", async function() {
      const source = new async.AsyncIterableSource();
      const values = [10, 20, 30, 40];
      source.emitMany(values);
      source.resolve();
      const result = [];
      for await (const item of source.asyncIterable) {
        result.push(item);
      }
      assert.deepStrictEqual(result, values);
    });
  });
  suite("cancellableIterable", () => {
    let cts;
    setup(() => {
      cts = store.add(new CancellationTokenSource());
    });
    test("should iterate through all values when not canceled", async function() {
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          yield "a";
          yield "b";
          yield "c";
        }
      };
      const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
      const result = await Iterable.asyncToArray(cancelableIterable);
      assert.deepStrictEqual(result, ["a", "b", "c"]);
    });
    test("should stop iteration immediately when cancelled before starting", async function() {
      const values = [];
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          values.push("iterator created");
          yield "a";
          values.push("after a");
          yield "b";
          values.push("after b");
          yield "c";
          values.push("after c");
        }
      };
      cts.cancel();
      const cancelableIterable = async.cancellableIterable(asyncIterable, cts.token);
      const result = await Iterable.asyncToArray(cancelableIterable);
      assert.deepStrictEqual(result, []);
      assert.deepStrictEqual(values, []);
    });
    test("should stop iteration when cancelled during iteration", async function() {
      const cts2 = new CancellationTokenSource();
      const deferredA = new async.DeferredPromise();
      const deferredB = new async.DeferredPromise();
      const deferredC = new async.DeferredPromise();
      const values = [];
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          values.push("a yielded");
          yield "a";
          await deferredA.p;
          values.push("b yielded");
          yield "b";
          await deferredB.p;
          values.push("c yielded");
          yield "c";
          await deferredC.p;
        }
      };
      for await (const value of async.cancellableIterable(asyncIterable, cts2.token)) {
        if (value === "a") {
          deferredA.complete();
        } else if (value === "b") {
          cts2.cancel();
          deferredB.complete();
        } else {
          throw new Error("Unexpected value");
        }
      }
      assert.deepStrictEqual(values, ["a yielded", "b yielded"]);
    });
    test("should handle return method correctly", async function() {
      let returnCalled = false;
      let n = 0;
      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          try {
            yield "a";
            n++;
            yield "b";
            n++;
            yield "c";
            n++;
          } finally {
            returnCalled = true;
          }
        }
      };
      const originalIterable = asyncIterable[Symbol.asyncIterator]();
      originalIterable.return = async function() {
        returnCalled = true;
        return Promise.resolve({ done: true, value: void 0 });
      };
      const testIterable = {
        [Symbol.asyncIterator]: () => originalIterable
      };
      for await (const value of async.cancellableIterable(testIterable, cts.token)) {
        if (value === "b") {
          break;
        }
      }
      assert.strictEqual(returnCalled, true);
      assert.strictEqual(n < 2, true);
    });
  });
  suite("AsyncIterableProducer", () => {
    test("emitOne produces single values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        emitter.emitOne(3);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("emitMany produces multiple values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
        emitter.emitMany([4, 5]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4, 5]);
    });
    test("mixed emitOne and emitMany", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitMany([2, 3]);
        emitter.emitOne(4);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("async executor with emitOne", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        await async.timeout(1);
        emitter.emitOne(2);
        await async.timeout(1);
        emitter.emitOne(3);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3]);
    });
    test("async executor with emitMany", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitMany([1, 2]);
        await async.timeout(1);
        emitter.emitMany([3, 4]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2, 3, 4]);
    });
    test("reject with error", async () => {
      const expectedError = new Error("test error");
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.reject(expectedError);
      });
      const result = [];
      let caughtError;
      try {
        for await (const item of producer) {
          result.push(item);
        }
      } catch (error) {
        caughtError = error;
      }
      assert.deepStrictEqual(result, [1]);
      assert.strictEqual(caughtError, expectedError);
    });
    test("async executor throws error", async () => {
      const expectedError = new Error("executor error");
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        throw expectedError;
      });
      const result = [];
      let caughtError;
      try {
        for await (const item of producer) {
          result.push(item);
        }
      } catch (error) {
        caughtError = error;
      }
      assert.deepStrictEqual(result, [1]);
      assert.strictEqual(caughtError, expectedError);
    });
    test("empty producer", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, []);
    });
    test("async executor resolves without emitting", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        await async.timeout(1);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, []);
    });
    test("multiple iterators on same producer", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
      });
      const result1 = [];
      for await (const item of producer) {
        result1.push(item);
      }
      const result2 = [];
      for await (const item of producer) {
        result2.push(item);
      }
      assert.deepStrictEqual(result1, [1, 2, 3]);
      assert.deepStrictEqual(result2, []);
    });
    test("concurrent iteration", async () => {
      const producer = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        await async.timeout(1);
        emitter.emitOne(2);
        await async.timeout(1);
        emitter.emitOne(3);
      });
      const iterator1 = producer[Symbol.asyncIterator]();
      const iterator2 = producer[Symbol.asyncIterator]();
      const first1 = await iterator1.next();
      const first2 = await iterator2.next();
      const second1 = await iterator1.next();
      const second2 = await iterator2.next();
      assert.strictEqual(first1.value, 1);
      assert.strictEqual(first2.value, 2);
      assert.strictEqual(second1.value, 3);
      assert.strictEqual(second2.done, true);
    });
    test("executor with promise return value", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        return Promise.resolve();
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("executor with non-promise return value", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        return "some value";
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("emitMany with empty array", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne(1);
        emitter.emitMany([]);
        emitter.emitOne(2);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [1, 2]);
    });
    test("reject immediately without emitting", async () => {
      const expectedError = new Error("immediate error");
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.reject(expectedError);
      });
      let caughtError;
      try {
        for await (const _item of producer) {
          assert.fail("Should not iterate when rejected immediately");
        }
      } catch (error) {
        caughtError = error;
      }
      assert.strictEqual(caughtError, expectedError);
    });
    test("string values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne("hello");
        emitter.emitMany(["world", "test"]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, ["hello", "world", "test"]);
    });
    test("object values", async () => {
      const producer = new async.AsyncIterableProducer((emitter) => {
        emitter.emitOne({ id: 1, name: "first" });
        emitter.emitMany([
          { id: 2, name: "second" },
          { id: 3, name: "third" }
        ]);
      });
      const result = [];
      for await (const item of producer) {
        result.push(item);
      }
      assert.deepStrictEqual(result, [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
        { id: 3, name: "third" }
      ]);
    });
    test("tee - both iterators receive all values", async () => {
      async function* sourceGenerator() {
        yield 1;
        yield 2;
        yield 3;
        yield 4;
        yield 5;
      }
      const [iter1, iter2] = async.AsyncIterableProducer.tee(sourceGenerator());
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          for await (const item of iter1) {
            result1.push(item);
          }
        })(),
        (async () => {
          for await (const item of iter2) {
            result2.push(item);
          }
        })()
      ]);
      assert.deepStrictEqual(result1, [1, 2, 3, 4, 5]);
      assert.deepStrictEqual(result2, [1, 2, 3, 4, 5]);
    });
    test("tee - sequential consumption", async () => {
      const source = new async.AsyncIterableProducer((emitter) => {
        emitter.emitMany([1, 2, 3]);
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      const result1 = [];
      for await (const item of iter1) {
        result1.push(item);
      }
      const result2 = [];
      for await (const item of iter2) {
        result2.push(item);
      }
      assert.deepStrictEqual(result1, [1, 2, 3]);
      assert.deepStrictEqual(result2, [1, 2, 3]);
    });
    test.skip("tee - empty source", async () => {
      const source = new async.AsyncIterableProducer((emitter) => {
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          for await (const item of iter1) {
            result1.push(item);
          }
        })(),
        (async () => {
          for await (const item of iter2) {
            result2.push(item);
          }
        })()
      ]);
      assert.deepStrictEqual(result1, []);
      assert.deepStrictEqual(result2, []);
    });
    test.skip("tee - handles errors in source", async () => {
      const expectedError = new Error("source error");
      const source = new async.AsyncIterableProducer(async (emitter) => {
        emitter.emitOne(1);
        emitter.emitOne(2);
        throw expectedError;
      });
      const [iter1, iter2] = async.AsyncIterableProducer.tee(source);
      let error1;
      let error2;
      const result1 = [];
      const result2 = [];
      await Promise.all([
        (async () => {
          try {
            for await (const item of iter1) {
              result1.push(item);
            }
          } catch (e) {
            error1 = e;
          }
        })(),
        (async () => {
          try {
            for await (const item of iter2) {
              result2.push(item);
            }
          } catch (e) {
            error2 = e;
          }
        })()
      ]);
      assert.deepStrictEqual(result1, [1, 2]);
      assert.deepStrictEqual(result2, [1, 2]);
      assert.strictEqual(error1, expectedError);
      assert.strictEqual(error2, expectedError);
    });
  });
  suite("AsyncReader", () => {
    async function* createAsyncIterator(values) {
      for (const value of values) {
        yield value;
      }
    }
    async function* createDelayedAsyncIterator(values, delayMs = 1) {
      for (const value of values) {
        await async.timeout(delayMs);
        yield value;
      }
    }
    test("read - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      assert.strictEqual(await reader.read(), 3);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("read - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("endOfStream property", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2]));
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, false);
      await reader.read();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("peek - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.peek(), 2);
      assert.strictEqual(await reader.read(), 2);
    });
    test("peek - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      assert.strictEqual(await reader.peek(), async.AsyncReaderEndOfStream);
    });
    test("readSyncOrThrow - throws when no data available", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      await reader.read();
      assert.throws(() => reader.readBufferedOrThrow());
    });
    test("readSyncOrThrow - returns end of stream when at end", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.read();
      assert.strictEqual(reader.readBufferedOrThrow(), async.AsyncReaderEndOfStream);
    });
    test("peekSyncOrThrow - with buffered data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      await reader.peek();
      assert.strictEqual(reader.peekBufferedOrThrow(), 1);
      assert.strictEqual(reader.peekBufferedOrThrow(), 1);
    });
    test("peekSyncOrThrow - throws when no data available", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      assert.throws(() => reader.peekBufferedOrThrow());
    });
    test("peekSyncOrThrow - returns end of stream when at end", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.peek();
      assert.strictEqual(reader.peekBufferedOrThrow(), async.AsyncReaderEndOfStream);
    });
    test("consumeToEnd - consumes all remaining data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("consumeToEnd - on empty reader", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("readWhile - basic functionality", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5]));
      const collected = [];
      await reader.readWhile(
        (value) => value < 4,
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, [1, 2, 3]);
      assert.strictEqual(await reader.read(), 4);
    });
    test("readWhile - stops at end of stream", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const collected = [];
      await reader.readWhile(
        (value) => value < 10,
        // Always true
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, [1, 2, 3]);
      assert.strictEqual(reader.endOfStream, true);
    });
    test("readWhile - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      const collected = [];
      await reader.readWhile(
        (value) => true,
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, []);
    });
    test("readWhile - predicate returns false immediately", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const collected = [];
      await reader.readWhile(
        (value) => false,
        // Always false
        async (value) => {
          collected.push(value);
        }
      );
      assert.deepStrictEqual(collected, []);
      assert.strictEqual(await reader.read(), 1);
    });
    test("peekTimeout - with immediate data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3]));
      const result = await reader.peekTimeout(100);
      assert.strictEqual(result, 1);
    });
    test("peekTimeout - with delayed data", async () => {
      const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 10));
      const result = await reader.peekTimeout(50);
      assert.strictEqual(result, 1);
    });
    test("peekTimeout - timeout occurs", async () => {
      return runWithFakedTimers({}, async () => {
        const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 50));
        const result = await reader.peekTimeout(10);
        assert.strictEqual(result, void 0);
        await reader.consumeToEnd();
      });
    });
    test("peekTimeout - empty iterator", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([]));
      const result = await reader.peekTimeout(10);
      assert.strictEqual(result, async.AsyncReaderEndOfStream);
    });
    test("peekTimeout - after consuming all data", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1]));
      await reader.consumeToEnd();
      const result = await reader.peekTimeout(10);
      assert.strictEqual(result, async.AsyncReaderEndOfStream);
    });
    test("mixed operations - complex scenario", async () => {
      const reader = new async.AsyncReader(createAsyncIterator([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
      assert.strictEqual(await reader.peek(), 1);
      assert.strictEqual(await reader.read(), 1);
      assert.strictEqual(await reader.read(), 2);
      assert.strictEqual(await reader.peek(), 3);
      const collected = [];
      await reader.readWhile(
        (value) => value <= 5,
        async (value) => collected.push(value)
      );
      assert.deepStrictEqual(collected, [3, 4, 5]);
      assert.strictEqual(await reader.peek(), 6);
      assert.strictEqual(reader.peekBufferedOrThrow(), 6);
      assert.strictEqual(reader.readBufferedOrThrow(), 6);
      await reader.consumeToEnd();
      assert.strictEqual(reader.endOfStream, true);
    });
    test("string values", async () => {
      const reader = new async.AsyncReader(createAsyncIterator(["hello", "world", "test"]));
      assert.strictEqual(await reader.read(), "hello");
      assert.strictEqual(await reader.peek(), "world");
      assert.strictEqual(await reader.read(), "world");
      assert.strictEqual(await reader.read(), "test");
      assert.strictEqual(await reader.read(), async.AsyncReaderEndOfStream);
    });
    test("object values", async () => {
      const objects = [
        { id: 1, name: "first" },
        { id: 2, name: "second" },
        { id: 3, name: "third" }
      ];
      const reader = new async.AsyncReader(createAsyncIterator(objects));
      assert.deepStrictEqual(await reader.read(), { id: 1, name: "first" });
      assert.deepStrictEqual(await reader.peek(), { id: 2, name: "second" });
      assert.deepStrictEqual(await reader.read(), { id: 2, name: "second" });
    });
    test("concurrent operations", async () => {
      const reader = new async.AsyncReader(createDelayedAsyncIterator([1, 2, 3], 5));
      const peekPromise = reader.peek();
      const readPromise = reader.read();
      const [peekResult, readResult] = await Promise.all([peekPromise, readPromise]);
      assert.strictEqual(peekResult, 1);
      assert.strictEqual(readResult, 1);
      assert.strictEqual(await reader.read(), 2);
    });
    test("buffer management - single extend buffer call", async () => {
      let nextCallCount = 0;
      const mockIterator = {
        async next() {
          nextCallCount++;
          if (nextCallCount === 1) {
            await async.timeout(1);
            return { value: 1, done: false };
          }
          return { value: void 0, done: true };
        }
      };
      const reader = new async.AsyncReader(mockIterator);
      const promises = [
        reader.peek(),
        reader.peek(),
        reader.read()
      ];
      await Promise.all(promises);
      assert.strictEqual(nextCallCount, 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vYXN5bmMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGFzeW5jIGZyb20gJy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgKiBhcyBNaWNyb3Rhc2tEZWxheSBmcm9tICcuLi8uLi9jb21tb24vc3ltYm9scy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5cbnN1aXRlKCdBc3luYycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjYW5jZWxhYmxlUHJvbWlzZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdzZXQgdG9rZW4sIGRvblxcJ3Qgd2FpdCBmb3IgaW5uZXIgcHJvbWlzZScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjYW5jZWxlZCA9IDA7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoXyA9PiB7IGNhbmNlbGVkICs9IDE7IH0pKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4geyAvKm5ldmVyKi8gfSk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHByb21pc2UudGhlbihfID0+IGFzc2VydC5vayhmYWxzZSksIGVyciA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxlZCwgMSk7XG5cdFx0XHRcdGFzc2VydC5vayhpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0cHJvbWlzZS5jYW5jZWwoKTsgLy8gY2FuY2VsIG9ubHkgb25jZVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBkZXNwaXRlIGlubmVyIHByb21pc2UgYmVpbmcgcmVzb2x2ZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY2FuY2VsZWQgPSAwO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKF8gPT4geyBjYW5jZWxlZCArPSAxOyB9KSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoMTIzNCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHByb21pc2UudGhlbihfID0+IGFzc2VydC5vayhmYWxzZSksIGVyciA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxlZCwgMSk7XG5cdFx0XHRcdGFzc2VydC5vayhpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpO1xuXHRcdFx0fSk7XG5cdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBkaXNwb3NlcyByZXN1bHQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBwcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdG9rZW4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gc3RvcmU7XG5cdFx0XHR9KTtcblx0XHRcdHByb21pc2UudGhlbihfID0+IGFzc2VydC5vayhmYWxzZSksIGVyciA9PiB7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSk7XG5cdFx0XHRcdGFzc2VydC5vayhzdG9yZS5pc0Rpc3Bvc2VkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ2FuY2VsbGluZyBhIHN5bmMgY2FuY2VsYWJsZSBwcm9taXNlIHdpbGwgZmlyZSB0aGUgY2FuY2VsbGVkIHRva2VuLlxuXHRcdC8vIEFsc28sIGV2ZXJ5IGB0aGVuYCBjYWxsYmFjayBydW5zIGluIGFub3RoZXIgZXhlY3V0aW9uIGZyYW1lLlxuXHRcdHRlc3QoJ2V4ZWN1dGlvbiBvcmRlciAoc3luYyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsbGFibGVQcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0XHRvcmRlci5wdXNoKCdpbiBjYWxsYmFjaycpO1xuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoXyA9PiBvcmRlci5wdXNoKCdjYW5jZWxsZWQnKSkpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDEyMzQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdG9yZGVyLnB1c2goJ2FmdGVyQ3JlYXRlJyk7XG5cblx0XHRcdGNvbnN0IHByb21pc2UgPSBjYW5jZWxsYWJsZVByb21pc2Vcblx0XHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gbnVsbClcblx0XHRcdFx0LnRoZW4oKCkgPT4gb3JkZXIucHVzaCgnZmluYWxseScpKTtcblxuXHRcdFx0Y2FuY2VsbGFibGVQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0b3JkZXIucHVzaCgnYWZ0ZXJDYW5jZWwnKTtcblxuXHRcdFx0cmV0dXJuIHByb21pc2UudGhlbigoKSA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbJ2luIGNhbGxiYWNrJywgJ2FmdGVyQ3JlYXRlJywgJ2NhbmNlbGxlZCcsICdhZnRlckNhbmNlbCcsICdmaW5hbGx5J10pKTtcblx0XHR9KTtcblxuXHRcdC8vIENhbmNlbGxpbmcgYW4gYXN5bmMgY2FuY2VsYWJsZSBwcm9taXNlIGlzIGp1c3QgdGhlIHNhbWUgYXMgYSBzeW5jIGNhbmNlbGxhYmxlIHByb21pc2UuXG5cdFx0dGVzdCgnZXhlY3V0aW9uIG9yZGVyIChhc3luYyknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBvcmRlcjogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsbGFibGVQcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0XHRvcmRlci5wdXNoKCdpbiBjYWxsYmFjaycpO1xuXHRcdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoXyA9PiBvcmRlci5wdXNoKCdjYW5jZWxsZWQnKSkpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoYyA9PiBzZXRUaW1lb3V0KGMuYmluZCgxMjM0KSwgMCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdG9yZGVyLnB1c2goJ2FmdGVyQ3JlYXRlJyk7XG5cblx0XHRcdGNvbnN0IHByb21pc2UgPSBjYW5jZWxsYWJsZVByb21pc2Vcblx0XHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gbnVsbClcblx0XHRcdFx0LnRoZW4oKCkgPT4gb3JkZXIucHVzaCgnZmluYWxseScpKTtcblxuXHRcdFx0Y2FuY2VsbGFibGVQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0b3JkZXIucHVzaCgnYWZ0ZXJDYW5jZWwnKTtcblxuXHRcdFx0cmV0dXJuIHByb21pc2UudGhlbigoKSA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbJ2luIGNhbGxiYWNrJywgJ2FmdGVyQ3JlYXRlJywgJ2NhbmNlbGxlZCcsICdhZnRlckNhbmNlbCcsICdmaW5hbGx5J10pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4ZWN1dGlvbiBvcmRlciAoYXN5bmMgd2l0aCBsYXRlIGxpc3RlbmVyKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IG9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBjYW5jZWxsYWJsZVByb21pc2UgPSBhc3luYy5jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdG9yZGVyLnB1c2goJ2luIGNhbGxiYWNrJyk7XG5cblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKF8gPT4gb3JkZXIucHVzaCgnY2FuY2VsbGVkJykpKTtcblx0XHRcdFx0Y2FuY2VsbGFibGVQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHRvcmRlci5wdXNoKCdhZnRlckNhbmNlbCcpO1xuXHRcdFx0fSk7XG5cblx0XHRcdG9yZGVyLnB1c2goJ2FmdGVyQ3JlYXRlJyk7XG5cblx0XHRcdGNvbnN0IHByb21pc2UgPSBjYW5jZWxsYWJsZVByb21pc2Vcblx0XHRcdFx0LnRoZW4odW5kZWZpbmVkLCBlcnIgPT4gbnVsbClcblx0XHRcdFx0LnRoZW4oKCkgPT4gb3JkZXIucHVzaCgnZmluYWxseScpKTtcblxuXHRcdFx0cmV0dXJuIHByb21pc2UudGhlbigoKSA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9yZGVyLCBbJ2luIGNhbGxiYWNrJywgJ2FmdGVyQ3JlYXRlJywgJ2NhbmNlbGxlZCcsICdhZnRlckNhbmNlbCcsICdmaW5hbGx5J10pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldCBpbm5lciByZXN1bHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gYXN5bmMudGltZW91dCgxMikudGhlbihfID0+IDEyMzQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxMjM0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rocm90dGxlcicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdub24gYXN5bmMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRocm90dGxlciA9IG5ldyBhc3luYy5UaHJvdHRsZXIoKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pLFxuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDIpOyB9KSxcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAyKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pXG5cdFx0XHRdKS50aGVuKCgpID0+IGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMikpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXN5bmMnLCAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiArK2NvdW50KTtcblxuXHRcdFx0Y29uc3QgdGhyb3R0bGVyID0gbmV3IGFzeW5jLlRocm90dGxlcigpO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyB9KSxcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAyKTsgfSksXG5cdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMik7IH0pLFxuXHRcdFx0XHR0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDIpOyB9KSxcblx0XHRcdFx0dGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAyKTsgfSlcblx0XHRcdF0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMyk7IH0pLFxuXHRcdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgNCk7IH0pLFxuXHRcdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgNCk7IH0pLFxuXHRcdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgNCk7IH0pLFxuXHRcdFx0XHRcdHRocm90dGxlci5xdWV1ZShmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgNCk7IH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYXN0IGZhY3Rvcnkgc2hvdWxkIGJlIHRoZSBvbmUgZ2V0dGluZyBjYWxsZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBmYWN0b3J5RmFjdG9yeSA9IChuOiBudW1iZXIpID0+ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiBuKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRocm90dGxlciA9IG5ldyBhc3luYy5UaHJvdHRsZXIoKTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRcdHByb21pc2VzLnB1c2godGhyb3R0bGVyLnF1ZXVlKGZhY3RvcnlGYWN0b3J5KDEpKS50aGVuKChuKSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChuLCAxKTsgfSkpO1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aHJvdHRsZXIucXVldWUoZmFjdG9yeUZhY3RvcnkoMikpLnRoZW4oKG4pID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKG4sIDMpOyB9KSk7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHRocm90dGxlci5xdWV1ZShmYWN0b3J5RmFjdG9yeSgzKSkudGhlbigobikgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwobiwgMyk7IH0pKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2FsIGFmdGVyIHF1ZXVlaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGZhY3RvcnlDYWxscyA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRmYWN0b3J5Q2FsbHMrKztcblx0XHRcdFx0cmV0dXJuIGFzeW5jLnRpbWVvdXQoMCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0aHJvdHRsZXIgPSBuZXcgYXN5bmMuVGhyb3R0bGVyKCk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaCh0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkpO1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkpO1xuXHRcdFx0dGhyb3R0bGVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhY3RvcnlDYWxscywgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3NhbCBiZWZvcmUgcXVldWVpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgZmFjdG9yeUNhbGxzID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGZhY3RvcnlDYWxscysrO1xuXHRcdFx0XHRyZXR1cm4gYXN5bmMudGltZW91dCgwKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRocm90dGxlciA9IG5ldyBhc3luYy5UaHJvdHRsZXIoKTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHR0aHJvdHRsZXIuZGlzcG9zZSgpO1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aHJvdHRsZXIucXVldWUoZmFjdG9yeSkpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdzaG91bGQgZmFpbCcpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWN0b3J5Q2FsbHMsIDApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGVsYXllcicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcigwKTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyBhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWljcm90YXNrIGRlbGF5IHNpbXBsZScsICgpID0+IHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCsrY291bnQpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVsYXllciA9IG5ldyBhc3luYy5EZWxheWVyKE1pY3JvdGFza0RlbGF5Lk1pY3JvdGFza0RlbGF5KTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKHJlc3VsdCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyBhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKChyZXN1bHQpID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7IGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ1Rocm90dGxlZERlbGF5ZXInLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdwcm9taXNlIHNob3VsZCByZXNvbHZlIGlmIGRpc3Bvc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0aHJvdHRsZWREZWxheWVyID0gbmV3IGFzeW5jLlRocm90dGxlZERlbGF5ZXI8dm9pZD4oMTAwKTtcblx0XHRcdFx0Y29uc3QgcHJvbWlzZSA9IHRocm90dGxlZERlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7IH0sIDApO1xuXHRcdFx0XHR0aHJvdHRsZWREZWxheWVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHRcdFx0YXNzZXJ0LmZhaWwoJ1NIT1VMRCBOT1QgQkUgSEVSRScpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHQvLyBPS1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgndHJpZ2dlciBhZnRlciBkaXNwb3NlIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGhyb3R0bGVkRGVsYXllciA9IG5ldyBhc3luYy5UaHJvdHRsZWREZWxheWVyPHZvaWQ+KDEwMCk7XG5cdFx0XHRcdHRocm90dGxlZERlbGF5ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiB0aHJvdHRsZWREZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4geyB9LCAwKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbXBsZSBjYW5jZWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Y29uc3QgZmFjdG9yeSA9ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgrK2NvdW50KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlbGF5ZXIgPSBuZXcgYXN5bmMuRGVsYXllcigwKTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRjb25zdCBwID0gZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoZmFsc2UpO1xuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQodHJ1ZSwgJ3llcywgaXQgd2FzIGNhbmNlbGxlZCcpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgY2FuY2VsIG1pY3JvdGFzaycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCsrY291bnQpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVsYXllciA9IG5ldyBhc3luYy5EZWxheWVyKE1pY3JvdGFza0RlbGF5Lk1pY3JvdGFza0RlbGF5KTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRjb25zdCBwID0gZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQoZmFsc2UpO1xuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQodHJ1ZSwgJ3llcywgaXQgd2FzIGNhbmNlbGxlZCcpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWwgc2hvdWxkIGNhbmNlbCBhbGwgY2FsbHMgdG8gdHJpZ2dlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCsrY291bnQpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVsYXllciA9IG5ldyBhc3luYy5EZWxheWVyKDApO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbih1bmRlZmluZWQsICgpID0+IHsgYXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTsgfSkpO1xuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4odW5kZWZpbmVkLCAoKSA9PiB7IGFzc2VydCh0cnVlLCAneWVzLCBpdCB3YXMgY2FuY2VsbGVkJyk7IH0pKTtcblx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyBhc3NlcnQodHJ1ZSwgJ3llcywgaXQgd2FzIGNhbmNlbGxlZCcpOyB9KSk7XG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmlnZ2VyLCBjYW5jZWwsIHRoZW4gdHJpZ2dlciBhZ2FpbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjb3VudCA9IDA7XG5cdFx0XHRjb25zdCBmYWN0b3J5ID0gKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCsrY291bnQpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZGVsYXllciA9IG5ldyBhc3luYy5EZWxheWVyKDApO1xuXHRcdFx0bGV0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdGNvbnN0IHAgPSBkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpO1xuXHRcdFx0XHRhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbih1bmRlZmluZWQsICgpID0+IHsgYXNzZXJ0KHRydWUsICd5ZXMsIGl0IHdhcyBjYW5jZWxsZWQnKTsgfSkpO1xuXHRcdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5KS50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyBhc3NlcnQodHJ1ZSwgJ3llcywgaXQgd2FzIGNhbmNlbGxlZCcpOyB9KSk7XG5cdFx0XHRcdGFzc2VydChkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRcdGRlbGF5ZXIuY2FuY2VsKCk7XG5cblx0XHRcdFx0Y29uc3QgcCA9IFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRwcm9taXNlcyA9IFtdO1xuXG5cdFx0XHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeSkudGhlbigoKSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIDEpOyBhc3NlcnQoIWRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7IH0pKTtcblx0XHRcdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnkpLnRoZW4oKCkgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTsgYXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpOyB9KSk7XG5cdFx0XHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdFx0XHRjb25zdCBwID0gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcDtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHA7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0KGRlbGF5ZXIuaXNUcmlnZ2VyZWQoKSk7XG5cblx0XHRcdHJldHVybiBwO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGFzdCB0YXNrIHNob3VsZCBiZSB0aGUgb25lIGdldHRpbmcgY2FsbGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgZmFjdG9yeUZhY3RvcnkgPSAobjogbnVtYmVyKSA9PiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobik7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkZWxheWVyID0gbmV3IGFzeW5jLkRlbGF5ZXIoMCk7XG5cdFx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxhbnk+W10gPSBbXTtcblxuXHRcdFx0YXNzZXJ0KCFkZWxheWVyLmlzVHJpZ2dlcmVkKCkpO1xuXG5cdFx0XHRwcm9taXNlcy5wdXNoKGRlbGF5ZXIudHJpZ2dlcihmYWN0b3J5RmFjdG9yeSgxKSkudGhlbigobikgPT4geyBhc3NlcnQuc3RyaWN0RXF1YWwobiwgMyk7IH0pKTtcblx0XHRcdHByb21pc2VzLnB1c2goZGVsYXllci50cmlnZ2VyKGZhY3RvcnlGYWN0b3J5KDIpKS50aGVuKChuKSA9PiB7IGFzc2VydC5zdHJpY3RFcXVhbChuLCAzKTsgfSkpO1xuXHRcdFx0cHJvbWlzZXMucHVzaChkZWxheWVyLnRyaWdnZXIoZmFjdG9yeUZhY3RvcnkoMykpLnRoZW4oKG4pID0+IHsgYXNzZXJ0LnN0cmljdEVxdWFsKG4sIDMpOyB9KSk7XG5cblx0XHRcdGNvbnN0IHAgPSBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydCghZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQoZGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblxuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXF1ZW5jZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWN0b3J5RmFjdG9yeSA9IChuOiBudW1iZXIpID0+ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShuKTtcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiBhc3luYy5zZXF1ZW5jZShbXG5cdFx0XHRcdGZhY3RvcnlGYWN0b3J5KDEpLFxuXHRcdFx0XHRmYWN0b3J5RmFjdG9yeSgyKSxcblx0XHRcdFx0ZmFjdG9yeUZhY3RvcnkoMyksXG5cdFx0XHRcdGZhY3RvcnlGYWN0b3J5KDQpLFxuXHRcdFx0XHRmYWN0b3J5RmFjdG9yeSg1KSxcblx0XHRcdF0pLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoNSwgcmVzdWx0Lmxlbmd0aCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgxLCByZXN1bHRbMF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMiwgcmVzdWx0WzFdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIHJlc3VsdFsyXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCg0LCByZXN1bHRbM10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoNSwgcmVzdWx0WzRdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTGltaXRlcicsICgpID0+IHtcblx0XHR0ZXN0KCdhc3NlcnQgZGVncmVlIG9mIHBhcmFsZWxsaXNtJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGFjdGl2ZVByb21pc2VzID0gMDtcblx0XHRcdGNvbnN0IGZhY3RvcnlGYWN0b3J5ID0gKG46IG51bWJlcikgPT4gKCkgPT4ge1xuXHRcdFx0XHRhY3RpdmVQcm9taXNlcysrO1xuXHRcdFx0XHRhc3NlcnQoYWN0aXZlUHJvbWlzZXMgPCA2KTtcblx0XHRcdFx0cmV0dXJuIGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiB7IGFjdGl2ZVByb21pc2VzLS07IHJldHVybiBuOyB9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgYXN5bmMuTGltaXRlcig1KTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8YW55PltdID0gW107XG5cdFx0XHRbMCwgMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOV0uZm9yRWFjaChuID0+IHByb21pc2VzLnB1c2gobGltaXRlci5xdWV1ZShmYWN0b3J5RmFjdG9yeShuKSkpKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKChyZXMpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEwLCByZXMubGVuZ3RoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbMCwgMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOV0sIHJlcyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnUXVldWUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0bGV0IHN5bmNQcm9taXNlID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmMSA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHN5bmNQcm9taXNlID0gdHJ1ZSk7XG5cblx0XHRcdGxldCBhc3luY1Byb21pc2UgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGYyID0gKCkgPT4gYXN5bmMudGltZW91dCgxMCkudGhlbigoKSA9PiBhc3luY1Byb21pc2UgPSB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDApO1xuXG5cdFx0XHRxdWV1ZS5xdWV1ZShmMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVldWUuc2l6ZSwgMSk7XG5cblx0XHRcdGNvbnN0IHAgPSBxdWV1ZS5xdWV1ZShmMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVldWUuc2l6ZSwgMik7XG5cdFx0XHRyZXR1cm4gcC50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDApO1xuXHRcdFx0XHRhc3NlcnQub2soc3luY1Byb21pc2UpO1xuXHRcdFx0XHRhc3NlcnQub2soYXN5bmNQcm9taXNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcCBwcm9jZXNzaW5nIG9uIGRpc3Bvc2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRsZXQgd29ya0NvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgdGFzayA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdFx0d29ya0NvdW50ZXIrKztcblx0XHRcdFx0cXVldWUuZGlzcG9zZSgpOyAvLyBESVNQT1NFIEhFUkVcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHAxID0gcXVldWUucXVldWUodGFzayk7XG5cdFx0XHRxdWV1ZS5xdWV1ZSh0YXNrKTtcblx0XHRcdHF1ZXVlLnF1ZXVlKHRhc2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDMpO1xuXG5cblx0XHRcdGF3YWl0IHAxO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya0NvdW50ZXIsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcCBvbiBjbGVhcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGxldCB3b3JrQ291bnRlciA9IDA7XG5cdFx0XHRjb25zdCB0YXNrID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDApO1xuXHRcdFx0XHR3b3JrQ291bnRlcisrO1xuXHRcdFx0XHRxdWV1ZS5jbGVhcigpOyAvLyBDTEVBUiBIRVJFXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCAxKTsgLy8gVEhJUyB0YXNrIGlzIHN0aWxsIHJ1bm5pbmdcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHAxID0gcXVldWUucXVldWUodGFzayk7XG5cdFx0XHRxdWV1ZS5xdWV1ZSh0YXNrKTtcblx0XHRcdHF1ZXVlLnF1ZXVlKHRhc2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXVlLnNpemUsIDMpO1xuXG5cdFx0XHRhd2FpdCBwMTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVldWUuc2l6ZSwgMCk7IC8vIGhhcyBiZWVuIGNsZWFyZWRcblxuXG5cdFx0XHRjb25zdCBwMiA9IHF1ZXVlLnF1ZXVlKHRhc2spO1xuXHRcdFx0YXdhaXQgcDI7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya0NvdW50ZXIsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xlYXIgYW5kIGRyYWluICgxKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGxldCB3b3JrQ291bnRlciA9IDA7XG5cdFx0XHRjb25zdCB0YXNrID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDApO1xuXHRcdFx0XHR3b3JrQ291bnRlcisrO1xuXHRcdFx0XHRxdWV1ZS5jbGVhcigpOyAvLyBDTEVBUiBIRVJFXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwMCA9IEV2ZW50LnRvUHJvbWlzZShxdWV1ZS5vbkRyYWluZWQpO1xuXHRcdFx0Y29uc3QgcDEgPSBxdWV1ZS5xdWV1ZSh0YXNrKTtcblxuXHRcdFx0YXdhaXQgcDE7XG5cdFx0XHRhd2FpdCBwMDsgLy8gZXhwZWN0IGRyYWluIHRvIGZpcmUgYmVjYXVzZSBhIHRhc2sgd2FzIHJ1bm5pbmdcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrQ291bnRlciwgMSk7XG5cdFx0XHRxdWV1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhciBhbmQgZHJhaW4gKDIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0bGV0IGRpZEZpcmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGQgPSBxdWV1ZS5vbkRyYWluZWQoKCkgPT4ge1xuXHRcdFx0XHRkaWRGaXJlID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRxdWV1ZS5jbGVhcigpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkRmlyZSwgZmFsc2UpOyAvLyBubyB3b3JrLCBubyBkcmFpbiFcblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0cXVldWUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJhaW4gdGltaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0Y29uc3QgbG9naWNDbG9jayA9IG5ldyBjbGFzcyB7XG5cdFx0XHRcdHByaXZhdGUgdGltZSA9IDA7XG5cdFx0XHRcdHRpY2soKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudGltZSsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgZGlkRHJhaW5UaW1lID0gMDtcblx0XHRcdGxldCBkaWRGaW5pc2hUaW1lMSA9IDA7XG5cdFx0XHRsZXQgZGlkRmluaXNoVGltZTIgPSAwO1xuXHRcdFx0Y29uc3QgZCA9IHF1ZXVlLm9uRHJhaW5lZCgoKSA9PiB7XG5cdFx0XHRcdGRpZERyYWluVGltZSA9IGxvZ2ljQ2xvY2sudGljaygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHAxID0gcXVldWUucXVldWUoKCkgPT4ge1xuXHRcdFx0XHQvLyBhd2FpdCBhc3luYy50aW1lb3V0KDEwKTtcblx0XHRcdFx0ZGlkRmluaXNoVGltZTEgPSBsb2dpY0Nsb2NrLnRpY2soKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHAyID0gcXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEwKTtcblx0XHRcdFx0ZGlkRmluaXNoVGltZTIgPSBsb2dpY0Nsb2NrLnRpY2soKTtcblx0XHRcdH0pO1xuXG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtwMSwgcDJdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZEZpbmlzaFRpbWUxLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRGaW5pc2hUaW1lMiwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkRHJhaW5UaW1lLCAyKTtcblxuXHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRxdWV1ZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcmFpbiBldmVudCBpcyBzZW5kIG9ubHkgb25jZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGxldCBkcmFpbkNvdW50ID0gMDtcblx0XHRcdGNvbnN0IGQgPSBxdWV1ZS5vbkRyYWluZWQoKCkgPT4geyBkcmFpbkNvdW50Kys7IH0pO1xuXHRcdFx0cXVldWUucXVldWUoYXN5bmMgKCkgPT4geyB9KTtcblx0XHRcdHF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHsgfSk7XG5cdFx0XHRxdWV1ZS5xdWV1ZShhc3luYyAoKSA9PiB7IH0pO1xuXHRcdFx0cXVldWUucXVldWUoYXN5bmMgKCkgPT4geyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbkNvdW50LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWV1ZS5zaXplLCA0KTtcblxuXHRcdFx0YXdhaXQgcXVldWUud2hlbklkbGUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRyYWluQ291bnQsIDEpO1xuXG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdHF1ZXVlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29yZGVyIGlzIGtlcHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdFx0Y29uc3QgcmVzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRcdGNvbnN0IGYxID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHRydWUpLnRoZW4oKCkgPT4gcmVzLnB1c2goMSkpO1xuXHRcdFx0XHRjb25zdCBmMiA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMTApLnRoZW4oKCkgPT4gcmVzLnB1c2goMikpO1xuXHRcdFx0XHRjb25zdCBmMyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHJlcy5wdXNoKDMpKTtcblx0XHRcdFx0Y29uc3QgZjQgPSAoKSA9PiBhc3luYy50aW1lb3V0KDIwKS50aGVuKCgpID0+IHJlcy5wdXNoKDQpKTtcblx0XHRcdFx0Y29uc3QgZjUgPSAoKSA9PiBhc3luYy50aW1lb3V0KDApLnRoZW4oKCkgPT4gcmVzLnB1c2goNSkpO1xuXG5cdFx0XHRcdHF1ZXVlLnF1ZXVlKGYxKTtcblx0XHRcdFx0cXVldWUucXVldWUoZjIpO1xuXHRcdFx0XHRxdWV1ZS5xdWV1ZShmMyk7XG5cdFx0XHRcdHF1ZXVlLnF1ZXVlKGY0KTtcblx0XHRcdFx0cmV0dXJuIHF1ZXVlLnF1ZXVlKGY1KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzBdLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzFdLCAyKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCAzKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzNdLCA0KTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzRdLCA1KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Vycm9ycyBidWJibGUgaW5kaXZpZHVhbGx5IGJ1dCBub3QgY2F1c2Ugc3RvcCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlF1ZXVlKCk7XG5cblx0XHRcdGNvbnN0IHJlczogbnVtYmVyW10gPSBbXTtcblx0XHRcdGxldCBlcnJvciA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBmMSA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHJlcy5wdXNoKDEpKTtcblx0XHRcdGNvbnN0IGYyID0gKCkgPT4gYXN5bmMudGltZW91dCgxMCkudGhlbigoKSA9PiByZXMucHVzaCgyKSk7XG5cdFx0XHRjb25zdCBmMyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZXJyb3InKSkpO1xuXHRcdFx0Y29uc3QgZjQgPSAoKSA9PiBhc3luYy50aW1lb3V0KDIwKS50aGVuKCgpID0+IHJlcy5wdXNoKDQpKTtcblx0XHRcdGNvbnN0IGY1ID0gKCkgPT4gYXN5bmMudGltZW91dCgwKS50aGVuKCgpID0+IHJlcy5wdXNoKDUpKTtcblxuXHRcdFx0cXVldWUucXVldWUoZjEpO1xuXHRcdFx0cXVldWUucXVldWUoZjIpO1xuXHRcdFx0cXVldWUucXVldWUoZjMpLnRoZW4odW5kZWZpbmVkLCAoKSA9PiBlcnJvciA9IHRydWUpO1xuXHRcdFx0cXVldWUucXVldWUoZjQpO1xuXHRcdFx0cmV0dXJuIHF1ZXVlLnF1ZXVlKGY1KS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNbMV0sIDIpO1xuXHRcdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzWzJdLCA0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1szXSwgNSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29yZGVyIGlzIGtlcHQgKGNoYWluZWQpJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgcXVldWUgPSBuZXcgYXN5bmMuUXVldWUoKTtcblxuXHRcdFx0Y29uc3QgcmVzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBmMSA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHJlcy5wdXNoKDEpKTtcblx0XHRcdGNvbnN0IGYyID0gKCkgPT4gYXN5bmMudGltZW91dCgxMCkudGhlbigoKSA9PiByZXMucHVzaCgyKSk7XG5cdFx0XHRjb25zdCBmMyA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh0cnVlKS50aGVuKCgpID0+IHJlcy5wdXNoKDMpKTtcblx0XHRcdGNvbnN0IGY0ID0gKCkgPT4gYXN5bmMudGltZW91dCgyMCkudGhlbigoKSA9PiByZXMucHVzaCg0KSk7XG5cdFx0XHRjb25zdCBmNSA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiByZXMucHVzaCg1KSk7XG5cblx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmMSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmMikudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHF1ZXVlLnF1ZXVlKGYzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmNCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBxdWV1ZS5xdWV1ZShmNSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1swXSwgMSk7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1sxXSwgMik7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1syXSwgMyk7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1szXSwgNCk7XG5cdFx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc1s0XSwgNSk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmVudHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBxdWV1ZSA9IG5ldyBhc3luYy5RdWV1ZSgpO1xuXG5cdFx0XHRsZXQgZHJhaW5lZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgb25EcmFpbmVkID0gRXZlbnQudG9Qcm9taXNlKHF1ZXVlLm9uRHJhaW5lZCkudGhlbigoKSA9PiBkcmFpbmVkID0gdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHJlczogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgZjEgPSAoKSA9PiBhc3luYy50aW1lb3V0KDEwKS50aGVuKCgpID0+IHJlcy5wdXNoKDIpKTtcblx0XHRcdGNvbnN0IGYyID0gKCkgPT4gYXN5bmMudGltZW91dCgyMCkudGhlbigoKSA9PiByZXMucHVzaCg0KSk7XG5cdFx0XHRjb25zdCBmMyA9ICgpID0+IGFzeW5jLnRpbWVvdXQoMCkudGhlbigoKSA9PiByZXMucHVzaCg1KSk7XG5cblx0XHRcdGNvbnN0IHExID0gcXVldWUucXVldWUoZjEpO1xuXHRcdFx0Y29uc3QgcTIgPSBxdWV1ZS5xdWV1ZShmMik7XG5cdFx0XHRxdWV1ZS5xdWV1ZShmMyk7XG5cblx0XHRcdHExLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2soIWRyYWluZWQpO1xuXHRcdFx0XHRxMi50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnQub2soIWRyYWluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBvbkRyYWluZWQ7XG5cdFx0XHRhc3NlcnQub2soZHJhaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdSZXNvdXJjZVF1ZXVlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbXBsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHF1ZXVlID0gbmV3IGFzeW5jLlJlc291cmNlUXVldWUoKTtcblxuXHRcdFx0YXdhaXQgcXVldWUud2hlbkRyYWluZWQoKTsgLy8gcmV0dXJucyBpbW1lZGlhdGVseSBzaW5jZSBlbXB0eVxuXG5cdFx0XHRsZXQgZG9uZTEgPSBmYWxzZTtcblx0XHRcdHF1ZXVlLnF1ZXVlRm9yKFVSSS5maWxlKCcvc29tZS9wYXRoJyksIGFzeW5jICgpID0+IHsgZG9uZTEgPSB0cnVlOyB9KTtcblx0XHRcdGF3YWl0IHF1ZXVlLndoZW5EcmFpbmVkKCk7IC8vIHJldHVybnMgaW1tZWRpYXRlbHkgc2luY2Ugbm8gd29yayBzY2hlZHVsZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb25lMSwgdHJ1ZSk7XG5cblx0XHRcdGxldCBkb25lMiA9IGZhbHNlO1xuXHRcdFx0cXVldWUucXVldWVGb3IoVVJJLmZpbGUoJy9zb21lL290aGVyL3BhdGgnKSwgYXN5bmMgKCkgPT4geyBkb25lMiA9IHRydWU7IH0pO1xuXHRcdFx0YXdhaXQgcXVldWUud2hlbkRyYWluZWQoKTsgLy8gcmV0dXJucyBpbW1lZGlhdGVseSBzaW5jZSBubyB3b3JrIHNjaGVkdWxlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvbmUyLCB0cnVlKTtcblxuXHRcdFx0Ly8gc2NoZWR1bGUgc29tZSB3b3JrXG5cdFx0XHRjb25zdCB3MSA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdHF1ZXVlLnF1ZXVlRm9yKFVSSS5maWxlKCcvc29tZS9wYXRoJyksICgpID0+IHcxLnApO1xuXG5cdFx0XHRsZXQgZHJhaW5lZCA9IGZhbHNlO1xuXHRcdFx0cXVldWUud2hlbkRyYWluZWQoKS50aGVuKCgpID0+IGRyYWluZWQgPSB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbmVkLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3MS5jb21wbGV0ZSgpO1xuXHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbmVkLCB0cnVlKTtcblxuXHRcdFx0Ly8gc2NoZWR1bGUgc29tZSB3b3JrXG5cdFx0XHRjb25zdCB3MiA9IG5ldyBhc3luYy5EZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHczID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0cXVldWUucXVldWVGb3IoVVJJLmZpbGUoJy9zb21lL3BhdGgnKSwgKCkgPT4gdzIucCk7XG5cdFx0XHRxdWV1ZS5xdWV1ZUZvcihVUkkuZmlsZSgnL3NvbWUvb3RoZXIvcGF0aCcpLCAoKSA9PiB3My5wKTtcblxuXHRcdFx0ZHJhaW5lZCA9IGZhbHNlO1xuXHRcdFx0cXVldWUud2hlbkRyYWluZWQoKS50aGVuKCgpID0+IGRyYWluZWQgPSB0cnVlKTtcblxuXHRcdFx0cXVldWUuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkcmFpbmVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JldHJ5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N1Y2Nlc3MgY2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IGNvdW50ZXIgPSAwO1xuXG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGFzeW5jLnJldHJ5KCgpID0+IHtcblx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0aWYgKGNvdW50ZXIgPCAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdmYWlsJykpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0XHRcdH0sIDEwLCAzKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLCB0cnVlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXJyb3IgY2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRFcnJvciA9IG5ldyBFcnJvcignZmFpbCcpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGFzeW5jLnJldHJ5KCgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChleHBlY3RlZEVycm9yKTtcblx0XHRcdFx0XHR9LCAxMCwgMyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yLCBlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGFza1NlcXVlbnRpYWxpemVyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2V4ZWN1dGlvbiBiYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmhhc1F1ZXVlZCgpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKDIzMjMpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIucnVubmluZyk7XG5cblx0XHRcdC8vIHBlbmRpbmcgcmVtb3ZlcyBpdHNlbGYgYWZ0ZXIgZG9uZVxuXHRcdFx0YXdhaXQgc2VxdWVudGlhbGl6ZXIucnVuKDEsIFByb21pc2UucmVzb2x2ZSgpKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoMSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5ydW5uaW5nKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaGFzUXVldWVkKCkpO1xuXG5cdFx0XHQvLyBwZW5kaW5nIHJlbW92ZXMgaXRzZWxmIGFmdGVyIGRvbmUgKHVzZSBhc3luYy50aW1lb3V0KVxuXHRcdFx0c2VxdWVudGlhbGl6ZXIucnVuKDIsIGFzeW5jLnRpbWVvdXQoMSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlcXVlbnRpYWxpemVyLmlzUnVubmluZygpKTtcblx0XHRcdGFzc2VydC5vayhzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoMikpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKDEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQub2soc2VxdWVudGlhbGl6ZXIucnVubmluZyk7XG5cblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoMiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIucnVubmluZyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRpbmcgYW5kIHF1ZXVlZCAoZmluaXNoZXMgaW5zdGFudGx5KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcXVlbnRpYWxpemVyID0gbmV3IGFzeW5jLlRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdFx0XHRsZXQgcGVuZGluZ0RvbmUgPSBmYWxzZTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLnJ1bigxLCBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBwZW5kaW5nRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHQvLyBxdWV1ZWQgZmluaXNoZXMgaW5zdGFudGx5XG5cdFx0XHRsZXQgcXVldWVkRG9uZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVzID0gc2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKG51bGwpLnRoZW4oKCkgPT4geyBxdWV1ZWREb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGFzc2VydC5vayhzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cblx0XHRcdGF3YWl0IHJlcztcblx0XHRcdGFzc2VydC5vayhwZW5kaW5nRG9uZSk7XG5cdFx0XHRhc3NlcnQub2socXVldWVkRG9uZSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmhhc1F1ZXVlZCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4ZWN1dGluZyBhbmQgcXVldWVkIChmaW5pc2hlcyBhZnRlciB0aW1lb3V0KScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcXVlbnRpYWxpemVyID0gbmV3IGFzeW5jLlRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdFx0XHRsZXQgcGVuZGluZ0RvbmUgPSBmYWxzZTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLnJ1bigxLCBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBwZW5kaW5nRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHQvLyBxdWV1ZWQgZmluaXNoZXMgYWZ0ZXIgYXN5bmMudGltZW91dFxuXHRcdFx0bGV0IHF1ZXVlZERvbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJlcyA9IHNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IGFzeW5jLnRpbWVvdXQoMSkudGhlbigoKSA9PiB7IHF1ZXVlZERvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0YXdhaXQgcmVzO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlbmRpbmdEb25lKTtcblx0XHRcdGFzc2VydC5vayhxdWV1ZWREb25lKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaGFzUXVldWVkKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnam9pbiAod2l0aG91dCBleGVjdXRpbmcgb3IgcXVldWVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcXVlbnRpYWxpemVyID0gbmV3IGFzeW5jLlRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdFx0XHRhd2FpdCBzZXF1ZW50aWFsaXplci5qb2luKCk7XG5cdFx0XHRhc3NlcnQub2soIXNlcXVlbnRpYWxpemVyLmhhc1F1ZXVlZCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2pvaW4gKHdpdGhvdXQgcXVldWVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcXVlbnRpYWxpemVyID0gbmV3IGFzeW5jLlRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdFx0XHRsZXQgcGVuZGluZ0RvbmUgPSBmYWxzZTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLnJ1bigxLCBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBwZW5kaW5nRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHRhd2FpdCBzZXF1ZW50aWFsaXplci5qb2luKCk7XG5cdFx0XHRhc3NlcnQub2socGVuZGluZ0RvbmUpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5pc1J1bm5pbmcoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdqb2luICh3aXRoIGV4ZWN1dGluZyBhbmQgcXVldWVkKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNlcXVlbnRpYWxpemVyID0gbmV3IGFzeW5jLlRhc2tTZXF1ZW50aWFsaXplcigpO1xuXG5cdFx0XHRsZXQgcGVuZGluZ0RvbmUgPSBmYWxzZTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLnJ1bigxLCBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4geyBwZW5kaW5nRG9uZSA9IHRydWU7IHJldHVybjsgfSkpO1xuXG5cdFx0XHQvLyBxdWV1ZWQgZmluaXNoZXMgYWZ0ZXIgYXN5bmMudGltZW91dFxuXHRcdFx0bGV0IHF1ZXVlZERvbmUgPSBmYWxzZTtcblx0XHRcdHNlcXVlbnRpYWxpemVyLnF1ZXVlKCgpID0+IGFzeW5jLnRpbWVvdXQoMSkudGhlbigoKSA9PiB7IHF1ZXVlZERvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0YXdhaXQgc2VxdWVudGlhbGl6ZXIuam9pbigpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlbmRpbmdEb25lKTtcblx0XHRcdGFzc2VydC5vayhxdWV1ZWREb25lKTtcblx0XHRcdGFzc2VydC5vayghc2VxdWVudGlhbGl6ZXIuaXNSdW5uaW5nKCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZXF1ZW50aWFsaXplci5oYXNRdWV1ZWQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRpbmcgYW5kIG11bHRpcGxlIHF1ZXVlZCAobGFzdCBvbmUgd2lucyknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblxuXHRcdFx0bGV0IHBlbmRpbmdEb25lID0gZmFsc2U7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgYXN5bmMudGltZW91dCgxKS50aGVuKCgpID0+IHsgcGVuZGluZ0RvbmUgPSB0cnVlOyByZXR1cm47IH0pKTtcblxuXHRcdFx0Ly8gcXVldWVkIGZpbmlzaGVzIGFmdGVyIGFzeW5jLnRpbWVvdXRcblx0XHRcdGxldCBmaXJzdERvbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpcnN0UmVzID0gc2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gYXN5bmMudGltZW91dCgyKS50aGVuKCgpID0+IHsgZmlyc3REb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGxldCBzZWNvbmREb25lID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzZWNvbmRSZXMgPSBzZXF1ZW50aWFsaXplci5xdWV1ZSgoKSA9PiBhc3luYy50aW1lb3V0KDMpLnRoZW4oKCkgPT4geyBzZWNvbmREb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGxldCB0aGlyZERvbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRoaXJkUmVzID0gc2VxdWVudGlhbGl6ZXIucXVldWUoKCkgPT4gYXN5bmMudGltZW91dCg0KS50aGVuKCgpID0+IHsgdGhpcmREb25lID0gdHJ1ZTsgcmV0dXJuOyB9KSk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtmaXJzdFJlcywgc2Vjb25kUmVzLCB0aGlyZFJlc10pO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlbmRpbmdEb25lKTtcblx0XHRcdGFzc2VydC5vayghZmlyc3REb25lKTtcblx0XHRcdGFzc2VydC5vayghc2Vjb25kRG9uZSk7XG5cdFx0XHRhc3NlcnQub2sodGhpcmREb25lKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbCBleGVjdXRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBzZXF1ZW50aWFsaXplciA9IG5ldyBhc3luYy5UYXNrU2VxdWVudGlhbGl6ZXIoKTtcblx0XHRcdGNvbnN0IGN0c1RpbWVvdXQgPSBzdG9yZS5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0XHRsZXQgcGVuZGluZ0NhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgdGltZW91dCA9IGFzeW5jLnRpbWVvdXQoMSwgY3RzVGltZW91dC50b2tlbik7XG5cdFx0XHRzZXF1ZW50aWFsaXplci5ydW4oMSwgdGltZW91dCwgKCkgPT4gcGVuZGluZ0NhbmNlbGxlZCA9IHRydWUpO1xuXHRcdFx0c2VxdWVudGlhbGl6ZXIuY2FuY2VsUnVubmluZygpO1xuXG5cdFx0XHRhc3NlcnQub2socGVuZGluZ0NhbmNlbGxlZCk7XG5cdFx0XHRjdHNUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlzcG9zYWJsZVRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaGFuZGxlciBvbmx5IHN1Y2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHQgPSBhc3luYy5kaXNwb3NhYmxlVGltZW91dCgoKSA9PiBjYiA9IHRydWUpO1xuXG5cdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIHRydWUpO1xuXG5cdFx0XHR0LmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXIgb25seSBjYW5jZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHQgPSBhc3luYy5kaXNwb3NhYmxlVGltZW91dCgoKSA9PiBjYiA9IHRydWUpO1xuXHRcdFx0dC5kaXNwb3NlKCk7XG5cblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmUgbWFuYWdlZCBzdWNjZXNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNiID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0YXN5bmMuZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gY2IgPSB0cnVlLCAwLCBzKTtcblxuXHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCB0cnVlKTtcblxuXHRcdFx0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9yZSBtYW5hZ2VkIGNhbmNlbCB2aWEgZGlzcG9zYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHQgPSBhc3luYy5kaXNwb3NhYmxlVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIDAsIHMpO1xuXHRcdFx0dC5kaXNwb3NlKCk7XG5cblx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgZmFsc2UpO1xuXG5cdFx0XHRzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3JlIG1hbmFnZWQgY2FuY2VsIHZpYSBzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGFzeW5jLmRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IGNiID0gdHJ1ZSwgMCwgcyk7XG5cdFx0XHRzLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NhYmxlTG9uZ1RpbWVvdXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZmlyZXMgYWZ0ZXIgYSBkZWxheSBsYXJnZXIgdGhhbiB0aGUgc2V0VGltZW91dCBtYXhpbXVtJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgdCA9IGFzeW5jLmRpc3Bvc2FibGVMb25nVGltZW91dCgoKSA9PiBjYiA9IHRydWUsIGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZICogMiArIDEwMDApO1xuXG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKiAyICsgMjAwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNiLCB0cnVlKTtcblx0XHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZpcmUgYWZ0ZXIgZGlzcG9zYWwgbWlkLXdhaXQnLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxldCBjYiA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCB0ID0gYXN5bmMuZGlzcG9zYWJsZUxvbmdUaW1lb3V0KCgpID0+IGNiID0gdHJ1ZSwgYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKiAyKTtcblxuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KGFzeW5jLk1BWF9USU1FT1VUX0RFTEFZKTsgLy8gYWR2YW5jZSBvbmUgY2h1bmssIHRoZW4gcmUtYXJtZWRcblx0XHRcdFx0dC5kaXNwb3NlKCk7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKiAyKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIGZhbHNlKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmUgbWFuYWdlZCBzdWNjZXNzIGV2aWN0cyBvbiBmaXJlJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0YXN5bmMuZGlzcG9zYWJsZUxvbmdUaW1lb3V0KCgpID0+IGNiID0gdHJ1ZSwgYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKyA1MDAsIHMpO1xuXG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKyAxMDAwKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2IsIHRydWUpO1xuXHRcdFx0XHRzLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RvcmUgbWFuYWdlZCBjYW5jZWwgdmlhIHN0b3JlJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgY2IgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0YXN5bmMuZGlzcG9zYWJsZUxvbmdUaW1lb3V0KCgpID0+IGNiID0gdHJ1ZSwgYXN5bmMuTUFYX1RJTUVPVVRfREVMQVkgKiAyLCBzKTtcblx0XHRcdFx0cy5kaXNwb3NlKCk7XG5cblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dChhc3luYy5NQVhfVElNRU9VVF9ERUxBWSAqIDIpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYiwgZmFsc2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhY2VDYW5jZWxsYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCBjdHNUaW1lb3V0ID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGxldCB0cmlnZ2VyZWQgPSBmYWxzZTtcblx0XHRjb25zdCB0aW1lb3V0ID0gYXN5bmMudGltZW91dCgxMDAsIGN0c1RpbWVvdXQudG9rZW4pO1xuXHRcdGNvbnN0IHAgPSBhc3luYy5yYWNlQ2FuY2VsbGF0aW9uKHRpbWVvdXQudGhlbigoKSA9PiB0cmlnZ2VyZWQgPSB0cnVlKSwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBwO1xuXG5cdFx0YXNzZXJ0Lm9rKCF0cmlnZ2VyZWQpO1xuXHRcdGN0c1RpbWVvdXQuY2FuY2VsKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhY2VUaW1lb3V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0XHQvLyB0aW1lb3V0IHdpbnNcblx0XHRsZXQgdGltZWRvdXQgPSBmYWxzZTtcblx0XHRsZXQgdHJpZ2dlcmVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBjdHNUaW1lb3V0MSA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdGltZW91dDEgPSBhc3luYy50aW1lb3V0KDEwMCwgY3RzVGltZW91dDEudG9rZW4pO1xuXHRcdGNvbnN0IHAxID0gYXN5bmMucmFjZVRpbWVvdXQodGltZW91dDEudGhlbigoKSA9PiB0cmlnZ2VyZWQgPSB0cnVlKSwgMSwgKCkgPT4gdGltZWRvdXQgPSB0cnVlKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBwMTtcblxuXHRcdGFzc2VydC5vayghdHJpZ2dlcmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGltZWRvdXQsIHRydWUpO1xuXHRcdGN0c1RpbWVvdXQxLmNhbmNlbCgpO1xuXG5cdFx0Ly8gcHJvbWlzZSB3aW5zXG5cdFx0dGltZWRvdXQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGN0c1RpbWVvdXQyID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjb25zdCB0aW1lb3V0MiA9IGFzeW5jLnRpbWVvdXQoMSwgY3RzVGltZW91dDIudG9rZW4pO1xuXHRcdGNvbnN0IHAyID0gYXN5bmMucmFjZVRpbWVvdXQodGltZW91dDIudGhlbigoKSA9PiB0cmlnZ2VyZWQgPSB0cnVlKSwgMTAwLCAoKSA9PiB0aW1lZG91dCA9IHRydWUpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IHAyO1xuXG5cdFx0YXNzZXJ0Lm9rKHRyaWdnZXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpbWVkb3V0LCBmYWxzZSk7XG5cdFx0Y3RzVGltZW91dDIuY2FuY2VsKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlcXVlbmNlckJ5S2V5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHMgPSBuZXcgYXN5bmMuU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgcjEgPSBhd2FpdCBzLnF1ZXVlKCdrZXkxJywgKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdoZWxsbycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjEsICdoZWxsbycpO1xuXG5cdFx0YXdhaXQgcy5xdWV1ZSgna2V5MicsICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignZmFpbGVkJykpKS50aGVuKCgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignc2hvdWxkIG5vdCBiZSByZXNvbHZlZCcpO1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHQvLyBFeHBlY3RlZCBlcnJvclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVyci5tZXNzYWdlLCAnZmFpbGVkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBTdGlsbCB3b3JrcyBhZnRlciBhIHF1ZXVlZCBwcm9taXNlIGlzIHJlamVjdGVkXG5cdFx0Y29uc3QgcjMgPSBhd2FpdCBzLnF1ZXVlKCdrZXkyJywgKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCdoZWxsbycpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjMsICdoZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnRlcnZhbENvdW50ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IG5vdyA9IDA7XG5cdFx0Y29uc3QgY291bnRlciA9IG5ldyBhc3luYy5JbnRlcnZhbENvdW50ZXIoNSwgKCkgPT4gbm93KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmluY3JlbWVudCgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5pbmNyZW1lbnQoKSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuaW5jcmVtZW50KCksIDMpO1xuXG5cdFx0bm93ID0gMTA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlci5pbmNyZW1lbnQoKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50ZXIuaW5jcmVtZW50KCksIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyLmluY3JlbWVudCgpLCAzKTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpcnN0UGFyYWxsZWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IGF3YWl0IGFzeW5jLmZpcnN0UGFyYWxsZWwoW1xuXHRcdFx0XHRQcm9taXNlLnJlc29sdmUoMSksXG5cdFx0XHRcdFByb21pc2UucmVzb2x2ZSgyKSxcblx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKDMpLFxuXHRcdFx0XSwgdiA9PiB2ID09PSAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgbnVsbCBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFzeW5jLmZpcnN0UGFyYWxsZWwoW1Byb21pc2UucmVzb2x2ZSgxKV0sIHYgPT4gdiA9PT0gMiksIG51bGwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB2YWx1ZSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGFzeW5jLmZpcnN0UGFyYWxsZWwoW1Byb21pc2UucmVzb2x2ZSgxKV0sIHYgPT4gdiA9PT0gMiwgNCksIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYXN5bmMuZmlyc3RQYXJhbGxlbChbXSwgdiA9PiB2ID09PSAyLCA0KSwgNCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGN0MTogQ2FuY2VsbGF0aW9uVG9rZW47XG5cdFx0XHRjb25zdCBwMSA9IGFzeW5jLmNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jIChjdCkgPT4ge1xuXHRcdFx0XHRjdDEgPSBjdDtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgyMDAsIGN0KTtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9KTtcblx0XHRcdGxldCBjdDI6IENhbmNlbGxhdGlvblRva2VuO1xuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy5jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyAoY3QpID0+IHtcblx0XHRcdFx0Y3QyID0gY3Q7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMiwgY3QpO1xuXHRcdFx0XHRyZXR1cm4gMjtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgYXN5bmMuZmlyc3RQYXJhbGxlbChbcDEsIHAyXSwgdiA9PiB2ID09PSAyLCA0KSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3QxIS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSwgJ3Nob3VsZCBjYW5jZWwgYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN0MiEuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUsICdzaG91bGQgY2FuY2VsIGInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdGlvbiBoYW5kbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjdDE6IENhbmNlbGxhdGlvblRva2VuO1xuXHRcdFx0Y29uc3QgcDEgPSBhc3luYy5jcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyAoY3QpID0+IHtcblx0XHRcdFx0Y3QxID0gY3Q7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoMjAwLCBjdCk7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSk7XG5cdFx0XHRsZXQgY3QyOiBDYW5jZWxsYXRpb25Ub2tlbjtcblx0XHRcdGNvbnN0IHAyID0gYXN5bmMuY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKGN0KSA9PiB7XG5cdFx0XHRcdGN0MiA9IGN0O1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDIsIGN0KTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdvaCBubycpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBhc3luYy5maXJzdFBhcmFsbGVsKFtwMSwgcDJdLCB2ID0+IHYgPT09IDIsIDQpLmNhdGNoKCgpID0+ICdvaycpLCAnb2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjdDEhLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkLCB0cnVlLCAnc2hvdWxkIGNhbmNlbCBhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3QyIS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgdHJ1ZSwgJ3Nob3VsZCBjYW5jZWwgYicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRGVmZXJyZWRQcm9taXNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Jlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgYXN5bmMuRGVmZXJyZWRQcm9taXNlPG51bWJlcj4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1Jlc29sdmVkLCBmYWxzZSk7XG5cdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSg0Mik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGVmZXJyZWQucCwgNDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVzb2x2ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTxudW1iZXI+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZWplY3RlZCwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdvaCBubyEnKTtcblx0XHRcdGRlZmVycmVkLmVycm9yKGVycik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZGVmZXJyZWQucC5jYXRjaChlID0+IGUpLCBlcnIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVqZWN0ZWQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FuY2VscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTxudW1iZXI+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZWplY3RlZCwgZmFsc2UpO1xuXHRcdFx0ZGVmZXJyZWQuY2FuY2VsKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGRlZmVycmVkLnAuY2F0Y2goZSA9PiBlKSkubmFtZSwgJ0NhbmNlbGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQuaXNSZWplY3RlZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXRhaW5zIHRoZSBvcmlnaW5hbCBzZXR0bGVkIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgYXN5bmMuRGVmZXJyZWRQcm9taXNlPG51bWJlcj4oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1Jlc29sdmVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQudmFsdWUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKDQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBkZWZlcnJlZC5wLCA0Mik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWQudmFsdWUsIDQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC5pc1Jlc29sdmVkLCB0cnVlKTtcblxuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGRlZmVycmVkLnAsIDQyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZlcnJlZC52YWx1ZSwgNDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmVycmVkLmlzUmVzb2x2ZWQsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUHJvbWlzZXMuc2V0dGxlZCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHAxID0gUHJvbWlzZS5yZXNvbHZlKDEpO1xuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4gMik7XG5cdFx0XHRjb25zdCBwMyA9IGFzeW5jLnRpbWVvdXQoMikudGhlbigoKSA9PiAzKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXN5bmMuUHJvbWlzZXMuc2V0dGxlZDxudW1iZXI+KFtwMSwgcDIsIHAzXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzFdLCAyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzJdLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGluIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcDEgPSBhc3luYy50aW1lb3V0KDIpLnRoZW4oKCkgPT4gMSk7XG5cdFx0XHRjb25zdCBwMiA9IGFzeW5jLnRpbWVvdXQoMSkudGhlbigoKSA9PiAyKTtcblx0XHRcdGNvbnN0IHAzID0gUHJvbWlzZS5yZXNvbHZlKDMpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhc3luYy5Qcm9taXNlcy5zZXR0bGVkPG51bWJlcj4oW3AxLCBwMiwgcDNdKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMV0sIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMl0sIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB3aXRoIGZpcnN0IGVycm9yIGJ1dCBoYW5kbGVzIGFsbCBwcm9taXNlcyAoYWxsIGVycm9ycyknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwMSA9IFByb21pc2UucmVqZWN0KDEpO1xuXG5cdFx0XHRsZXQgcDJIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBwMkVycm9yID0gbmV3IEVycm9yKCcyJyk7XG5cdFx0XHRjb25zdCBwMiA9IGFzeW5jLnRpbWVvdXQoMSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHAySGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdHRocm93IHAyRXJyb3I7XG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IHAzSGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcDNFcnJvciA9IG5ldyBFcnJvcignMycpO1xuXHRcdFx0Y29uc3QgcDMgPSBhc3luYy50aW1lb3V0KDIpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRwM0hhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aHJvdyBwM0Vycm9yO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBhc3luYy5Qcm9taXNlcy5zZXR0bGVkPG51bWJlcj4oW3AxLCBwMiwgcDNdKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZXJyb3IgPSBlO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZXJyb3IpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGVycm9yLCBwMkVycm9yKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlcnJvciwgcDNFcnJvcik7XG5cdFx0XHRhc3NlcnQub2socDJIYW5kbGVkKTtcblx0XHRcdGFzc2VydC5vayhwM0hhbmRsZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB3aXRoIGZpcnN0IGVycm9yIGJ1dCBoYW5kbGVzIGFsbCBwcm9taXNlcyAoMSBlcnJvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwMSA9IFByb21pc2UucmVzb2x2ZSgxKTtcblxuXHRcdFx0bGV0IHAySGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcDJFcnJvciA9IG5ldyBFcnJvcignMicpO1xuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy50aW1lb3V0KDEpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRwMkhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aHJvdyBwMkVycm9yO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBwM0hhbmRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHAzID0gYXN5bmMudGltZW91dCgyKS50aGVuKCgpID0+IHtcblx0XHRcdFx0cDNIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIDM7XG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLlByb21pc2VzLnNldHRsZWQ8bnVtYmVyPihbcDEsIHAyLCBwM10pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRlcnJvciA9IGU7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvciwgcDJFcnJvcik7XG5cdFx0XHRhc3NlcnQub2socDJIYW5kbGVkKTtcblx0XHRcdGFzc2VydC5vayhwM0hhbmRsZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUHJvbWlzZXMud2l0aEFzeW5jQm9keScsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpY3MnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IHAxID0gYXN5bmMuUHJvbWlzZXMud2l0aEFzeW5jQm9keShhc3luYyAocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHJlc29sdmUoMSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcDIgPSBhc3luYy5Qcm9taXNlcy53aXRoQXN5bmNCb2R5KGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignZXJyb3InKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcDMgPSBhc3luYy5Qcm9taXNlcy53aXRoQXN5bmNCb2R5KGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdlcnJvcicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHIxID0gYXdhaXQgcDE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjEsIDEpO1xuXG5cdFx0XHRsZXQgZTI6IEVycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcDI7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRlMiA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQub2soZTIgaW5zdGFuY2VvZiBFcnJvcik7XG5cblx0XHRcdGxldCBlMzogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwMztcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGUzID0gZXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5vayhlMyBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rocm90dGxlZFdvcmtlcicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGFzc2VydEFycmF5RXF1YWxzKGFjdHVhbDogdW5rbm93bltdLCBleHBlY3RlZDogdW5rbm93bltdKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxlbmd0aCwgZXhwZWN0ZWQubGVuZ3RoKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3R1YWwubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFtpXSwgZXhwZWN0ZWRbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ2Jhc2ljcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBoYW5kbGVkOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0XHRsZXQgaGFuZGxlZENhbGxiYWNrOiBGdW5jdGlvbjtcblx0XHRcdGxldCBoYW5kbGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlZENhbGxiYWNrID0gcmVzb2x2ZSk7XG5cdFx0XHRsZXQgaGFuZGxlZENvdW50ZXJUb1Jlc29sdmUgPSAxO1xuXHRcdFx0bGV0IGN1cnJlbnRIYW5kbGVkQ291bnRlciA9IDA7XG5cblx0XHRcdGNvbnN0IGhhbmRsZXIgPSAodW5pdHM6IHJlYWRvbmx5IG51bWJlcltdKSA9PiB7XG5cdFx0XHRcdGhhbmRsZWQucHVzaCguLi51bml0cyk7XG5cblx0XHRcdFx0Y3VycmVudEhhbmRsZWRDb3VudGVyKys7XG5cdFx0XHRcdGlmIChjdXJyZW50SGFuZGxlZENvdW50ZXIgPT09IGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlKSB7XG5cdFx0XHRcdFx0aGFuZGxlZENhbGxiYWNrKCk7XG5cblx0XHRcdFx0XHRoYW5kbGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlZENhbGxiYWNrID0gcmVzb2x2ZSk7XG5cdFx0XHRcdFx0Y3VycmVudEhhbmRsZWRDb3VudGVyID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgd29ya2VyID0gc3RvcmUuYWRkKG5ldyBhc3luYy5UaHJvdHRsZWRXb3JrZXI8bnVtYmVyPih7XG5cdFx0XHRcdG1heFdvcmtDaHVua1NpemU6IDUsXG5cdFx0XHRcdG1heEJ1ZmZlcmVkV29yazogdW5kZWZpbmVkLFxuXHRcdFx0XHR0aHJvdHRsZURlbGF5OiAxXG5cdFx0XHR9LCBoYW5kbGVyKSk7XG5cblx0XHRcdC8vIFdvcmsgbGVzcyB0aGFuIGNodW5rIHNpemVcblxuXHRcdFx0bGV0IHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzXSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdHdvcmtlci53b3JrKFs0LCA1XSk7XG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbNl0pO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNSwgNl0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXG5cdFx0XHQvLyBXb3JrIG1vcmUgdGhhbiBjaHVuayBzaXplICh2YXJpYW50IDEpXG5cblx0XHRcdGhhbmRsZWQgPSBbXTtcblx0XHRcdGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gMjtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDYsIDddKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1LCA2LCA3XSk7XG5cblx0XHRcdGhhbmRsZWQgPSBbXTtcblx0XHRcdGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gNDtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsIDE2LCAxNywgMTgsIDE5XSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDE0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVkUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwLCAxMSwgMTIsIDEzLCAxNCwgMTUsIDE2LCAxNywgMTgsIDE5XSk7XG5cblx0XHRcdC8vIFdvcmsgbW9yZSB0aGFuIGNodW5rIHNpemUgKHZhcmlhbnQgMilcblxuXHRcdFx0aGFuZGxlZCA9IFtdO1xuXHRcdFx0aGFuZGxlZENvdW50ZXJUb1Jlc29sdmUgPSAyO1xuXG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMF0pO1xuXG5cdFx0XHQvLyBXb3JrIG1vcmUgd2hpbGUgdGhyb3R0bGVkICh2YXJpYW50IDEpXG5cblx0XHRcdGhhbmRsZWQgPSBbXTtcblx0XHRcdGhhbmRsZWRDb3VudGVyVG9SZXNvbHZlID0gMztcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDYsIDddKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0d29ya2VyLndvcmsoWzhdKTtcblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFs5LCAxMCwgMTFdKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgNik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0YXdhaXQgaGFuZGxlZFByb21pc2U7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTFdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMCk7XG5cblx0XHRcdC8vIFdvcmsgbW9yZSB3aGlsZSB0aHJvdHRsZWQgKHZhcmlhbnQgMilcblxuXHRcdFx0aGFuZGxlZCA9IFtdO1xuXHRcdFx0aGFuZGxlZENvdW50ZXJUb1Jlc29sdmUgPSAyO1xuXG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgMywgNCwgNSwgNiwgN10pO1xuXG5cdFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cblx0XHRcdHdvcmtlci53b3JrKFs4XSk7XG5cdFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbOSwgMTBdKTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXG5cdFx0XHRhd2FpdCBoYW5kbGVkUHJvbWlzZTtcblxuXHRcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDUsIDYsIDcsIDgsIDksIDEwXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkbyBub3QgYWNjZXB0IHRvbyBtdWNoIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaGFuZGxlciA9ICh1bml0czogcmVhZG9ubHkgbnVtYmVyW10pID0+IGhhbmRsZWQucHVzaCguLi51bml0cyk7XG5cblx0XHRcdGNvbnN0IHdvcmtlciA9IHN0b3JlLmFkZChuZXcgYXN5bmMuVGhyb3R0bGVkV29ya2VyPG51bWJlcj4oe1xuXHRcdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiA1LFxuXHRcdFx0XHRtYXhCdWZmZXJlZFdvcms6IDUsXG5cdFx0XHRcdHRocm90dGxlRGVsYXk6IDFcblx0XHRcdH0sIGhhbmRsZXIpKTtcblxuXHRcdFx0bGV0IHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzEsIDIsIDMsIDQsIDUsIDZdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAxKTtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAyKTtcblxuXHRcdFx0d29ya2VkID0gd29ya2VyLndvcmsoWzgsIDksIDEwLCAxMV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlci5wZW5kaW5nLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvIG5vdCBhY2NlcHQgdG9vIG11Y2ggd29yayAoYWNjb3VudCBmb3IgbWF4IGNodW5rIHNpemUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaGFuZGxlciA9ICh1bml0czogcmVhZG9ubHkgbnVtYmVyW10pID0+IGhhbmRsZWQucHVzaCguLi51bml0cyk7XG5cblx0XHRcdGNvbnN0IHdvcmtlciA9IHN0b3JlLmFkZChuZXcgYXN5bmMuVGhyb3R0bGVkV29ya2VyPG51bWJlcj4oe1xuXHRcdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiA1LFxuXHRcdFx0XHRtYXhCdWZmZXJlZFdvcms6IDUsXG5cdFx0XHRcdHRocm90dGxlRGVsYXk6IDFcblx0XHRcdH0sIGhhbmRsZXIpKTtcblxuXHRcdFx0bGV0IHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMCwgMTFdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZWQsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMCk7XG5cblx0XHRcdHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5LCAxMF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VyLnBlbmRpbmcsIDUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYW5kbGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgaGFuZGxlciA9ICh1bml0czogcmVhZG9ubHkgbnVtYmVyW10pID0+IGhhbmRsZWQucHVzaCguLi51bml0cyk7XG5cblx0XHRcdGNvbnN0IHdvcmtlciA9IHN0b3JlLmFkZChuZXcgYXN5bmMuVGhyb3R0bGVkV29ya2VyPG51bWJlcj4oe1xuXHRcdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiA1LFxuXHRcdFx0XHRtYXhCdWZmZXJlZFdvcms6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGhyb3R0bGVEZWxheTogMVxuXHRcdFx0fSwgaGFuZGxlcikpO1xuXHRcdFx0d29ya2VyLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHdvcmtlZCA9IHdvcmtlci53b3JrKFsxLCAyLCAzXSk7XG5cblx0XHRcdGFzc2VydEFycmF5RXF1YWxzKGhhbmRsZWQsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3JrZXIucGVuZGluZywgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHQvLyAgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIzMDM2NlxuXHRcdC8vIFx0dGVzdCgnd2FpdFRocm90dGxlRGVsYXlCZXR3ZWVuV29ya1VuaXRzIG9wdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBcdFx0Y29uc3QgaGFuZGxlZDogbnVtYmVyW10gPSBbXTtcblx0XHQvLyBcdFx0bGV0IGhhbmRsZWRDYWxsYmFjazogRnVuY3Rpb247XG5cdFx0Ly8gXHRcdGxldCBoYW5kbGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gaGFuZGxlZENhbGxiYWNrID0gcmVzb2x2ZSk7XG5cdFx0Ly8gXHRcdGxldCBjdXJyZW50VGltZSA9IDA7XG5cblx0XHQvLyBcdFx0Y29uc3QgaGFuZGxlciA9ICh1bml0czogcmVhZG9ubHkgbnVtYmVyW10pID0+IHtcblx0XHQvLyBcdFx0XHRoYW5kbGVkLnB1c2goLi4udW5pdHMpO1xuXHRcdC8vIFx0XHRcdGhhbmRsZWRDYWxsYmFjaygpO1xuXHRcdC8vIFx0XHRcdGhhbmRsZWRQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBoYW5kbGVkQ2FsbGJhY2sgPSByZXNvbHZlKTtcblx0XHQvLyBcdFx0fTtcblxuXHRcdC8vIFx0XHRjb25zdCB3b3JrZXIgPSBzdG9yZS5hZGQobmV3IGFzeW5jLlRocm90dGxlZFdvcmtlcjxudW1iZXI+KHtcblx0XHQvLyBcdFx0XHRtYXhXb3JrQ2h1bmtTaXplOiA1LFxuXHRcdC8vIFx0XHRcdG1heEJ1ZmZlcmVkV29yazogdW5kZWZpbmVkLFxuXHRcdC8vIFx0XHRcdHRocm90dGxlRGVsYXk6IDUsXG5cdFx0Ly8gXHRcdFx0d2FpdFRocm90dGxlRGVsYXlCZXR3ZWVuV29ya1VuaXRzOiB0cnVlXG5cdFx0Ly8gXHRcdH0sIGhhbmRsZXIpKTtcblxuXHRcdC8vIFx0XHQvLyBTY2hlZHVsZSB3b3JrLCBpdCBzaG91bGQgZXhlY3V0ZSBpbW1lZGlhdGVseVxuXHRcdC8vIFx0XHRjdXJyZW50VGltZSA9IERhdGUubm93KCk7XG5cdFx0Ly8gXHRcdGxldCB3b3JrZWQgPSB3b3JrZXIud29yayhbMSwgMiwgM10pO1xuXHRcdC8vIFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblx0XHQvLyBcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDNdKTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKERhdGUubm93KCkgLSBjdXJyZW50VGltZSA8IDUsIHRydWUpO1xuXG5cdFx0Ly8gXHRcdC8vIFNjaGVkdWxlIHdvcmsgYWdhaW4sIGl0IHNob3VsZCB3YWl0IGF0IGxlYXN0IHRocm90dGxlIGRlbGF5IGJlZm9yZSBleGVjdXRpbmdcblx0XHQvLyBcdFx0Y3VycmVudFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdC8vIFx0XHR3b3JrZWQgPSB3b3JrZXIud29yayhbNCwgNV0pO1xuXHRcdC8vIFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya2VkLCB0cnVlKTtcblx0XHQvLyBcdFx0Ly8gVGhyb3R0bGUgZGVsYXkgaGFzbid0IHJlc2V0IHNvIHdlIHN0aWxsIG11c3Qgd2FpdFxuXHRcdC8vIFx0XHRhc3NlcnRBcnJheUVxdWFscyhoYW5kbGVkLCBbMSwgMiwgM10pO1xuXHRcdC8vIFx0XHRhd2FpdCBoYW5kbGVkUHJvbWlzZTtcblx0XHQvLyBcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKERhdGUubm93KCkgLSBjdXJyZW50VGltZSA+PSA1LCB0cnVlKTtcblx0XHQvLyBcdFx0YXNzZXJ0QXJyYXlFcXVhbHMoaGFuZGxlZCwgWzEsIDIsIDMsIDQsIDVdKTtcblx0XHQvLyBcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTGltaXRlZFF1ZXVlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYmFzaWNzICh3aXRoIGxvbmcgcnVubmluZyB0YXNrKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxpbWl0ZWRRdWV1ZSA9IG5ldyBhc3luYy5MaW1pdGVkUXVldWUoKTtcblxuXHRcdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgNTsgaSsrKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2gobGltaXRlZFF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb3VudGVyID0gaTtcblx0XHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdFx0Ly8gb25seSB0aGUgbGFzdCB0YXNrIGV4ZWN1dGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgNCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpY3MgKHdpdGggc3luYyBydW5uaW5nIHRhc2spJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGltaXRlZFF1ZXVlID0gbmV3IGFzeW5jLkxpbWl0ZWRRdWV1ZSgpO1xuXG5cdFx0XHRsZXQgY291bnRlciA9IDA7XG5cdFx0XHRjb25zdCBwcm9taXNlcyA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1OyBpKyspIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChsaW1pdGVkUXVldWUucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvdW50ZXIgPSBpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdFx0Ly8gb25seSB0aGUgbGFzdCB0YXNrIGV4ZWN1dGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlciwgNCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdBc3luY0l0ZXJhYmxlT2JqZWN0JywgZnVuY3Rpb24gKCkge1xuXG5cblx0XHR0ZXN0KCdvblJldHVybiBOT1QgY2FsbGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRsZXQgY2FsbGVkT25SZXR1cm4gPSBmYWxzZTtcblx0XHRcdGNvbnN0IGl0ZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZU9iamVjdDxudW1iZXI+KHdyaXRlciA9PiB7XG5cdFx0XHRcdHdyaXRlci5lbWl0TWFueShbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsZWRPblJldHVybiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBpdGVtLCAnbnVtYmVyJyk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWRPblJldHVybiwgZmFsc2UpO1xuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblJldHVybiBjYWxsZWQgb24gYnJlYWsnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRcdGxldCBjYWxsZWRPblJldHVybiA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgaXRlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlT2JqZWN0PG51bWJlcj4od3JpdGVyID0+IHtcblx0XHRcdFx0d3JpdGVyLmVtaXRNYW55KFsxLCAyLCAzLCA0LCA1XSk7XG5cdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdGNhbGxlZE9uUmV0dXJuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcikge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbSwgMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkT25SZXR1cm4sIHRydWUpO1xuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblJldHVybiBjYWxsZWQgb24gcmV0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0XHRsZXQgY2FsbGVkT25SZXR1cm4gPSBmYWxzZTtcblx0XHRcdGNvbnN0IGl0ZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZU9iamVjdDxudW1iZXI+KHdyaXRlciA9PiB7XG5cdFx0XHRcdHdyaXRlci5lbWl0TWFueShbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0fSwgKCkgPT4ge1xuXHRcdFx0XHRjYWxsZWRPblJldHVybiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgKGFzeW5jIGZ1bmN0aW9uIHRlc3QoKSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIDEpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkT25SZXR1cm4sIHRydWUpO1xuXG5cdFx0fSk7XG5cblxuXHRcdHRlc3QoJ29uUmV0dXJuIGNhbGxlZCBvbiB0aHJvd2luZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdFx0bGV0IGNhbGxlZE9uUmV0dXJuID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpdGVyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVPYmplY3Q8bnVtYmVyPih3cml0ZXIgPT4ge1xuXHRcdFx0XHR3cml0ZXIuZW1pdE1hbnkoWzEsIDIsIDMsIDQsIDVdKTtcblx0XHRcdH0sICgpID0+IHtcblx0XHRcdFx0Y2FsbGVkT25SZXR1cm4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0sIDEpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxlZE9uUmV0dXJuLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FzeW5jSXRlcmFibGVTb3VyY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHR0ZXN0KCdvblJldHVybiBpcyB3aXJlZCB1cCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGxldCBjYWxsZWRPblJldHVybiA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVTb3VyY2U8bnVtYmVyPigoKSA9PiB7IGNhbGxlZE9uUmV0dXJuID0gdHJ1ZTsgfSk7XG5cblx0XHRcdHNvdXJjZS5lbWl0T25lKDEpO1xuXHRcdFx0c291cmNlLmVtaXRPbmUoMik7XG5cdFx0XHRzb3VyY2UuZW1pdE9uZSgzKTtcblx0XHRcdHNvdXJjZS5yZXNvbHZlKCk7XG5cblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBzb3VyY2UuYXN5bmNJdGVyYWJsZSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbSwgMSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkT25SZXR1cm4sIHRydWUpO1xuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblJldHVybiBpcyB3aXJlZCB1cCAyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IGNhbGxlZE9uUmV0dXJuID0gZmFsc2U7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVNvdXJjZTxudW1iZXI+KCgpID0+IHsgY2FsbGVkT25SZXR1cm4gPSB0cnVlOyB9KTtcblxuXHRcdFx0c291cmNlLmVtaXRPbmUoMSk7XG5cdFx0XHRzb3VyY2UuZW1pdE9uZSgyKTtcblx0XHRcdHNvdXJjZS5lbWl0T25lKDMpO1xuXHRcdFx0c291cmNlLnJlc29sdmUoKTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHNvdXJjZS5hc3luY0l0ZXJhYmxlKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgaXRlbSwgJ251bWJlcicpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkT25SZXR1cm4sIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtaXRNYW55IGVtaXRzIGFsbCBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlU291cmNlPG51bWJlcj4oKTtcblx0XHRcdGNvbnN0IHZhbHVlcyA9IFsxMCwgMjAsIDMwLCA0MF07XG5cdFx0XHRzb3VyY2UuZW1pdE1hbnkodmFsdWVzKTtcblx0XHRcdHNvdXJjZS5yZXNvbHZlKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBzb3VyY2UuYXN5bmNJdGVyYWJsZSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHZhbHVlcyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjYW5jZWxsYWJsZUl0ZXJhYmxlJywgKCkgPT4ge1xuXHRcdGxldCBjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaXRlcmF0ZSB0aHJvdWdoIGFsbCB2YWx1ZXMgd2hlbiBub3QgY2FuY2VsZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBhc3luY0l0ZXJhYmxlID0ge1xuXHRcdFx0XHRhc3luYyAqW1N5bWJvbC5hc3luY0l0ZXJhdG9yXSgpIHtcblx0XHRcdFx0XHR5aWVsZCAnYSc7XG5cdFx0XHRcdFx0eWllbGQgJ2InO1xuXHRcdFx0XHRcdHlpZWxkICdjJztcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsYWJsZUl0ZXJhYmxlID0gYXN5bmMuY2FuY2VsbGFibGVJdGVyYWJsZShhc3luY0l0ZXJhYmxlLCBjdHMudG9rZW4pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBJdGVyYWJsZS5hc3luY1RvQXJyYXkoY2FuY2VsYWJsZUl0ZXJhYmxlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbJ2EnLCAnYicsICdjJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0b3AgaXRlcmF0aW9uIGltbWVkaWF0ZWx5IHdoZW4gY2FuY2VsbGVkIGJlZm9yZSBzdGFydGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHZhbHVlczogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgYXN5bmNJdGVyYWJsZSA9IHtcblx0XHRcdFx0YXN5bmMgKltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2l0ZXJhdG9yIGNyZWF0ZWQnKTtcblx0XHRcdFx0XHR5aWVsZCAnYSc7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2FmdGVyIGEnKTtcblx0XHRcdFx0XHR5aWVsZCAnYic7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2FmdGVyIGInKTtcblx0XHRcdFx0XHR5aWVsZCAnYyc7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2FmdGVyIGMnKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ2FuY2VsIGJlZm9yZSBpdGVyYXRpb24gc3RhcnRzXG5cdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRjb25zdCBjYW5jZWxhYmxlSXRlcmFibGUgPSBhc3luYy5jYW5jZWxsYWJsZUl0ZXJhYmxlKGFzeW5jSXRlcmFibGUsIGN0cy50b2tlbik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IEl0ZXJhYmxlLmFzeW5jVG9BcnJheShjYW5jZWxhYmxlSXRlcmFibGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3RvcCBpdGVyYXRpb24gd2hlbiBjYW5jZWxsZWQgZHVyaW5nIGl0ZXJhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgZGVmZXJyZWRBID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgZGVmZXJyZWRCID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgZGVmZXJyZWRDID0gbmV3IGFzeW5jLkRlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0XHRjb25zdCB2YWx1ZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGNvbnN0IGFzeW5jSXRlcmFibGUgPSB7XG5cdFx0XHRcdGFzeW5jICpbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKCdhIHlpZWxkZWQnKTtcblx0XHRcdFx0XHR5aWVsZCAnYSc7XG5cdFx0XHRcdFx0YXdhaXQgZGVmZXJyZWRBLnA7XG5cblx0XHRcdFx0XHR2YWx1ZXMucHVzaCgnYiB5aWVsZGVkJyk7XG5cdFx0XHRcdFx0eWllbGQgJ2InO1xuXHRcdFx0XHRcdGF3YWl0IGRlZmVycmVkQi5wO1xuXG5cdFx0XHRcdFx0dmFsdWVzLnB1c2goJ2MgeWllbGRlZCcpO1xuXHRcdFx0XHRcdHlpZWxkICdjJztcblx0XHRcdFx0XHRhd2FpdCBkZWZlcnJlZEMucDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCB2YWx1ZSBvZiBhc3luYy5jYW5jZWxsYWJsZUl0ZXJhYmxlKGFzeW5jSXRlcmFibGUsIGN0cy50b2tlbikpIHtcblx0XHRcdFx0aWYgKHZhbHVlID09PSAnYScpIHtcblx0XHRcdFx0XHRkZWZlcnJlZEEuY29tcGxldGUoKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2InKSB7XG5cdFx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdGRlZmVycmVkQi5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB2YWx1ZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmFsdWVzLCBbJ2EgeWllbGRlZCcsICdiIHlpZWxkZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJldHVybiBtZXRob2QgY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdFx0bGV0IHJldHVybkNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IG4gPSAwO1xuXHRcdFx0Y29uc3QgYXN5bmNJdGVyYWJsZSA9IHtcblx0XHRcdFx0YXN5bmMgKltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHlpZWxkICdhJzsgbisrO1xuXHRcdFx0XHRcdFx0eWllbGQgJ2InOyBuKys7XG5cdFx0XHRcdFx0XHR5aWVsZCAnYyc7IG4rKztcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0cmV0dXJuQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBBZGQgYSByZXR1cm4gbWV0aG9kIHRvIHRoZSBpdGVyYXRvclxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxJdGVyYWJsZSA9IGFzeW5jSXRlcmFibGVbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cdFx0XHRvcmlnaW5hbEl0ZXJhYmxlLnJldHVybiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmV0dXJuQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGRvbmU6IHRydWUsIHZhbHVlOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBDcmVhdGUgYSB0ZXN0LXNwZWNpZmljIGl0ZXJhYmxlIHdpdGggb3VyIG1vY2tlZCBpdGVyYXRvclxuXHRcdFx0Y29uc3QgdGVzdEl0ZXJhYmxlID0ge1xuXHRcdFx0XHRbU3ltYm9sLmFzeW5jSXRlcmF0b3JdOiAoKSA9PiBvcmlnaW5hbEl0ZXJhYmxlXG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHZhbHVlIG9mIGFzeW5jLmNhbmNlbGxhYmxlSXRlcmFibGUodGVzdEl0ZXJhYmxlLCBjdHMudG9rZW4pKSB7XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ2InKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldHVybkNhbGxlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobiA8IDIsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHN1aXRlKCdBc3luY0l0ZXJhYmxlUHJvZHVjZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnZW1pdE9uZSBwcm9kdWNlcyBzaW5nbGUgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtaXRNYW55IHByb2R1Y2VzIG11bHRpcGxlIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFsxLCAyLCAzXSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoWzQsIDVdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWl4ZWQgZW1pdE9uZSBhbmQgZW1pdE1hbnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDEpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFsyLCAzXSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSg0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMiwgMywgNF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXN5bmMgZXhlY3V0b3Igd2l0aCBlbWl0T25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDNdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jIGV4ZWN1dG9yIHdpdGggZW1pdE1hbnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMSwgMl0pO1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFszLCA0XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDIsIDMsIDRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdCB3aXRoIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRFcnJvciA9IG5ldyBFcnJvcigndGVzdCBlcnJvcicpO1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5yZWplY3QoZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0bGV0IGNhdWdodEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNhdWdodEVycm9yID0gZXJyb3IgYXMgRXJyb3I7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhdWdodEVycm9yLCBleHBlY3RlZEVycm9yKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FzeW5jIGV4ZWN1dG9yIHRocm93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkRXJyb3IgPSBuZXcgRXJyb3IoJ2V4ZWN1dG9yIGVycm9yJyk7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDEpO1xuXHRcdFx0XHR0aHJvdyBleHBlY3RlZEVycm9yO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGxldCBjYXVnaHRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjYXVnaHRFcnJvciA9IGVycm9yIGFzIEVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzFdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXVnaHRFcnJvciwgZXhwZWN0ZWRFcnJvcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbXB0eSBwcm9kdWNlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHQvLyBEb24ndCBlbWl0IGFueXRoaW5nXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXN5bmMgZXhlY3V0b3IgcmVzb2x2ZXMgd2l0aG91dCBlbWl0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGFzeW5jIGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHQvLyBEb24ndCBlbWl0IGFueXRoaW5nXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgaXRlcmF0b3JzIG9uIHNhbWUgcHJvZHVjZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9kdWNlciA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbMSwgMiwgM10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEZpcnN0IGl0ZXJhdG9yIHNob3VsZCBjb25zdW1lIGFsbCB2YWx1ZXNcblx0XHRcdGNvbnN0IHJlc3VsdDE6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0MS5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZWNvbmQgaXRlcmF0b3Igc2hvdWxkIG5vdCBzZWUgYW55IHZhbHVlcyAoYWxyZWFkeSBjb25zdW1lZClcblx0XHRcdGNvbnN0IHJlc3VsdDI6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0Mi5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEsIFsxLCAyLCAzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmN1cnJlbnQgaXRlcmF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0YXdhaXQgYXN5bmMudGltZW91dCgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaXRlcmF0b3IxID0gcHJvZHVjZXJbU3ltYm9sLmFzeW5jSXRlcmF0b3JdKCk7XG5cdFx0XHRjb25zdCBpdGVyYXRvcjIgPSBwcm9kdWNlcltTeW1ib2wuYXN5bmNJdGVyYXRvcl0oKTtcblxuXHRcdFx0Ly8gQm90aCBpdGVyYXRvcnMgc2hhcmUgdGhlIHNhbWUgdW5kZXJseWluZyBwcm9kdWNlclxuXHRcdFx0Y29uc3QgZmlyc3QxID0gYXdhaXQgaXRlcmF0b3IxLm5leHQoKTtcblx0XHRcdGNvbnN0IGZpcnN0MiA9IGF3YWl0IGl0ZXJhdG9yMi5uZXh0KCk7XG5cdFx0XHRjb25zdCBzZWNvbmQxID0gYXdhaXQgaXRlcmF0b3IxLm5leHQoKTtcblx0XHRcdGNvbnN0IHNlY29uZDIgPSBhd2FpdCBpdGVyYXRvcjIubmV4dCgpO1xuXG5cdFx0XHQvLyBTaW5jZSB0aGV5IHNoYXJlIHRoZSBzYW1lIHByb2R1Y2VyLCB2YWx1ZXMgYXJlIGNvbnN1bWVkIGluIG9yZGVyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QxLnZhbHVlLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdDIudmFsdWUsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZDEudmFsdWUsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZDIuZG9uZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGVjdXRvciB3aXRoIHByb21pc2UgcmV0dXJuIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIHByb2R1Y2VyKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgWzEsIDJdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4ZWN1dG9yIHdpdGggbm9uLXByb21pc2UgcmV0dXJuIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDIpO1xuXHRcdFx0XHRyZXR1cm4gJ3NvbWUgdmFsdWUnO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsxLCAyXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0TWFueSB3aXRoIGVtcHR5IGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPG51bWJlcj4oZW1pdHRlciA9PiB7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgxKTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbXSk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE9uZSgyKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgcHJvZHVjZXIpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbMSwgMl0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0IGltbWVkaWF0ZWx5IHdpdGhvdXQgZW1pdHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZEVycm9yID0gbmV3IEVycm9yKCdpbW1lZGlhdGUgZXJyb3InKTtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLnJlamVjdChleHBlY3RlZEVycm9yKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgY2F1Z2h0RXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBfaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRcdGFzc2VydC5mYWlsKCdTaG91bGQgbm90IGl0ZXJhdGUgd2hlbiByZWplY3RlZCBpbW1lZGlhdGVseScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRjYXVnaHRFcnJvciA9IGVycm9yIGFzIEVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2F1Z2h0RXJyb3IsIGV4cGVjdGVkRXJyb3IpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5nIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2R1Y2VyID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxzdHJpbmc+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoJ2hlbGxvJyk7XG5cdFx0XHRcdGVtaXR0ZXIuZW1pdE1hbnkoWyd3b3JsZCcsICd0ZXN0J10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFsnaGVsbG8nLCAnd29ybGQnLCAndGVzdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29iamVjdCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgVGVzdE9iamVjdCB7XG5cdFx0XHRcdGlkOiBudW1iZXI7XG5cdFx0XHRcdG5hbWU6IHN0cmluZztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvZHVjZXIgPSBuZXcgYXN5bmMuQXN5bmNJdGVyYWJsZVByb2R1Y2VyPFRlc3RPYmplY3Q+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoeyBpZDogMSwgbmFtZTogJ2ZpcnN0JyB9KTtcblx0XHRcdFx0ZW1pdHRlci5lbWl0TWFueShbXG5cdFx0XHRcdFx0eyBpZDogMiwgbmFtZTogJ3NlY29uZCcgfSxcblx0XHRcdFx0XHR7IGlkOiAzLCBuYW1lOiAndGhpcmQnIH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBUZXN0T2JqZWN0W10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBwcm9kdWNlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtcblx0XHRcdFx0eyBpZDogMSwgbmFtZTogJ2ZpcnN0JyB9LFxuXHRcdFx0XHR7IGlkOiAyLCBuYW1lOiAnc2Vjb25kJyB9LFxuXHRcdFx0XHR7IGlkOiAzLCBuYW1lOiAndGhpcmQnIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVlIC0gYm90aCBpdGVyYXRvcnMgcmVjZWl2ZSBhbGwgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVE9ETzogSW1wbGVtZW50YXRpb24gYnVnIC0gZXhlY3V0b3JzIGRvbid0IGF3YWl0IHN0YXJ0KCksIGNhdXNpbmcgcHJvZHVjZXJzIHRvIGZpbmFsaXplIGVhcmx5XG5cdFx0XHRhc3luYyBmdW5jdGlvbiogc291cmNlR2VuZXJhdG9yKCkge1xuXHRcdFx0XHR5aWVsZCAxO1xuXHRcdFx0XHR5aWVsZCAyO1xuXHRcdFx0XHR5aWVsZCAzO1xuXHRcdFx0XHR5aWVsZCA0O1xuXHRcdFx0XHR5aWVsZCA1O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBbaXRlcjEsIGl0ZXIyXSA9IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlci50ZWUoc291cmNlR2VuZXJhdG9yKCkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQxOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzdWx0MjogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0Ly8gQ29uc3VtZSBib3RoIGl0ZXJhYmxlcyBjb25jdXJyZW50bHlcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjEpIHtcblx0XHRcdFx0XHRcdHJlc3VsdDEucHVzaChpdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCksXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIyKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQyLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCBbMSwgMiwgMywgNCwgNV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVlIC0gc2VxdWVudGlhbCBjb25zdW1wdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEltcGxlbWVudGF0aW9uIGJ1ZyAtIGV4ZWN1dG9ycyBkb24ndCBhd2FpdCBzdGFydCgpLCBjYXVzaW5nIHByb2R1Y2VycyB0byBmaW5hbGl6ZSBlYXJseVxuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRNYW55KFsxLCAyLCAzXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgW2l0ZXIxLCBpdGVyMl0gPSBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXIudGVlKHNvdXJjZSk7XG5cblx0XHRcdC8vIENvbnN1bWUgZmlyc3QgaXRlcmF0b3IgY29tcGxldGVseVxuXHRcdFx0Y29uc3QgcmVzdWx0MTogbnVtYmVyW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgaXRlbSBvZiBpdGVyMSkge1xuXHRcdFx0XHRyZXN1bHQxLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZW4gY29uc3VtZSBzZWNvbmQgaXRlcmF0b3Jcblx0XHRcdGNvbnN0IHJlc3VsdDI6IG51bWJlcltdID0gW107XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjIpIHtcblx0XHRcdFx0cmVzdWx0Mi5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDEsIFsxLCAyLCAzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIFsxLCAyLCAzXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ3RlZSAtIGVtcHR5IHNvdXJjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEltcGxlbWVudGF0aW9uIGJ1ZyAtIGV4ZWN1dG9ycyBkb24ndCBhd2FpdCBzdGFydCgpLCBjYXVzaW5nIHByb2R1Y2VycyB0byBmaW5hbGl6ZSBlYXJseVxuXHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlcjxudW1iZXI+KGVtaXR0ZXIgPT4ge1xuXHRcdFx0XHQvLyBFbWl0IG5vdGhpbmdcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBbaXRlcjEsIGl0ZXIyXSA9IGFzeW5jLkFzeW5jSXRlcmFibGVQcm9kdWNlci50ZWUoc291cmNlKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0MTogbnVtYmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlc3VsdDI6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjEpIHtcblx0XHRcdFx0XHRcdHJlc3VsdDEucHVzaChpdGVtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCksXG5cdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBpdGVtIG9mIGl0ZXIyKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQyLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpXG5cdFx0XHRdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3Quc2tpcCgndGVlIC0gaGFuZGxlcyBlcnJvcnMgaW4gc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVE9ETzogSW1wbGVtZW50YXRpb24gYnVnIC0gZXhlY3V0b3JzIGRvbid0IGF3YWl0IHN0YXJ0KCksIGNhdXNpbmcgcHJvZHVjZXJzIHRvIGZpbmFsaXplIGVhcmx5XG5cdFx0XHRjb25zdCBleHBlY3RlZEVycm9yID0gbmV3IEVycm9yKCdzb3VyY2UgZXJyb3InKTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXI8bnVtYmVyPihhc3luYyBlbWl0dGVyID0+IHtcblx0XHRcdFx0ZW1pdHRlci5lbWl0T25lKDEpO1xuXHRcdFx0XHRlbWl0dGVyLmVtaXRPbmUoMik7XG5cdFx0XHRcdHRocm93IGV4cGVjdGVkRXJyb3I7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgW2l0ZXIxLCBpdGVyMl0gPSBhc3luYy5Bc3luY0l0ZXJhYmxlUHJvZHVjZXIudGVlKHNvdXJjZSk7XG5cblx0XHRcdGxldCBlcnJvcjE6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGVycm9yMjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXN1bHQxOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcmVzdWx0MjogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjEpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0MS5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGVycm9yMSA9IGUgYXMgRXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpLFxuXHRcdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGl0ZW0gb2YgaXRlcjIpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0Mi5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGVycm9yMiA9IGUgYXMgRXJyb3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQm90aCBpdGVyYXRvcnMgc2hvdWxkIGhhdmUgcmVjZWl2ZWQgdGhlIHNhbWUgdmFsdWVzIGJlZm9yZSBlcnJvclxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCBbMSwgMl0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQyLCBbMSwgMl0pO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCBoYXZlIHJlY2VpdmVkIHRoZSBlcnJvclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yMSwgZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3IyLCBleHBlY3RlZEVycm9yKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FzeW5jUmVhZGVyJywgKCkgPT4ge1xuXHRcdGFzeW5jIGZ1bmN0aW9uKiBjcmVhdGVBc3luY0l0ZXJhdG9yPFQ+KHZhbHVlczogVFtdKTogQXN5bmNJdGVyYXRvcjxUPiB7XG5cdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHR5aWVsZCB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3luYyBmdW5jdGlvbiogY3JlYXRlRGVsYXllZEFzeW5jSXRlcmF0b3I8VD4odmFsdWVzOiBUW10sIGRlbGF5TXM6IG51bWJlciA9IDEpOiBBc3luY0l0ZXJhdG9yPFQ+IHtcblx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdGF3YWl0IGFzeW5jLnRpbWVvdXQoZGVsYXlNcyk7XG5cdFx0XHRcdHlpZWxkIHZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlc3QoJ3JlYWQgLSBiYXNpYyBmdW5jdGlvbmFsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWQgLSBlbXB0eSBpdGVyYXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuZE9mU3RyZWFtIHByb3BlcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDJdKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIuZW5kT2ZTdHJlYW0sIGZhbHNlKTtcblxuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWQoKTsgLy8gMVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgZmFsc2UpO1xuXG5cdFx0XHRhd2FpdCByZWFkZXIucmVhZCgpOyAvLyAyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLmVuZE9mU3RyZWFtLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkKCk7IC8vIGVuZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrIC0gYmFzaWMgZnVuY3Rpb25hbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgMSk7IC8vIFNob3VsZCByZXR1cm4gc2FtZSB2YWx1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIDEpOyAvLyBTaG91bGQgY29uc3VtZSB0aGUgcGVla2VkIHZhbHVlXG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWsgLSBlbXB0eSBpdGVyYXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRTeW5jT3JUaHJvdyAtIHRocm93cyB3aGVuIG5vIGRhdGEgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzFdKSk7XG5cblx0XHRcdC8vIFJlYWQgdGhlIG9ubHkgaXRlbVxuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWQoKTtcblxuXHRcdFx0Ly8gU2hvdWxkIHRocm93IHNpbmNlIG5vIG1vcmUgZGF0YSBhbmQgbm90IGF0IGVuZCB5ZXRcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gcmVhZGVyLnJlYWRCdWZmZXJlZE9yVGhyb3coKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkU3luY09yVGhyb3cgLSByZXR1cm5zIGVuZCBvZiBzdHJlYW0gd2hlbiBhdCBlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbXSkpO1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGVuZCBkZXRlY3Rpb25cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIucmVhZEJ1ZmZlcmVkT3JUaHJvdygpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWtTeW5jT3JUaHJvdyAtIHdpdGggYnVmZmVyZWQgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFsxLCAyLCAzXSkpO1xuXG5cdFx0XHQvLyBGaXJzdCBwZWVrIHRvIHBvcHVsYXRlIGJ1ZmZlclxuXHRcdFx0YXdhaXQgcmVhZGVyLnBlZWsoKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGJlIGFibGUgdG8gcGVlayBzeW5jIG5vd1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5wZWVrQnVmZmVyZWRPclRocm93KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5wZWVrQnVmZmVyZWRPclRocm93KCksIDEpOyAvLyBTaG91bGQgcmV0dXJuIHNhbWUgdmFsdWVcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWtTeW5jT3JUaHJvdyAtIHRocm93cyB3aGVuIG5vIGRhdGEgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzFdKSk7XG5cblx0XHRcdC8vIFNob3VsZCB0aHJvdyBzaW5jZSBidWZmZXIgaXMgZW1wdHkgYW5kIHdlIGhhdmVuJ3QgbG9hZGVkIGFueXRoaW5nXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHJlYWRlci5wZWVrQnVmZmVyZWRPclRocm93KCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVla1N5bmNPclRocm93IC0gcmV0dXJucyBlbmQgb2Ygc3RyZWFtIHdoZW4gYXQgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoW10pKTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBlbmQgZGV0ZWN0aW9uXG5cdFx0XHRhd2FpdCByZWFkZXIucGVlaygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLnBlZWtCdWZmZXJlZE9yVGhyb3coKSwgYXN5bmMuQXN5bmNSZWFkZXJFbmRPZlN0cmVhbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb25zdW1lVG9FbmQgLSBjb25zdW1lcyBhbGwgcmVtYWluaW5nIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgMywgNCwgNV0pKTtcblxuXHRcdFx0Ly8gUmVhZCBzb21lIGRhdGEgZmlyc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCAyKTtcblxuXHRcdFx0Ly8gQ29uc3VtZSB0aGUgcmVzdFxuXHRcdFx0YXdhaXQgcmVhZGVyLmNvbnN1bWVUb0VuZCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLmVuZE9mU3RyZWFtLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbnN1bWVUb0VuZCAtIG9uIGVtcHR5IHJlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVBc3luY0l0ZXJhdG9yKFtdKSk7XG5cblx0XHRcdGF3YWl0IHJlYWRlci5jb25zdW1lVG9FbmQoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRlci5lbmRPZlN0cmVhbSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkV2hpbGUgLSBiYXNpYyBmdW5jdGlvbmFsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDMsIDQsIDVdKSk7XG5cdFx0XHRjb25zdCBjb2xsZWN0ZWQ6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkV2hpbGUoXG5cdFx0XHRcdHZhbHVlID0+IHZhbHVlIDwgNCxcblx0XHRcdFx0YXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbGxlY3RlZC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0ZWQsIFsxLCAyLCAzXSk7XG5cblx0XHRcdC8vIE5leHQgcmVhZCBzaG91bGQgcmV0dXJuIDRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCA0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRXaGlsZSAtIHN0b3BzIGF0IGVuZCBvZiBzdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgM10pKTtcblx0XHRcdGNvbnN0IGNvbGxlY3RlZDogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWRXaGlsZShcblx0XHRcdFx0dmFsdWUgPT4gdmFsdWUgPCAxMCwgLy8gQWx3YXlzIHRydWVcblx0XHRcdFx0YXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbGxlY3RlZC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0ZWQsIFsxLCAyLCAzXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLmVuZE9mU3RyZWFtLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRXaGlsZSAtIGVtcHR5IGl0ZXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoW10pKTtcblx0XHRcdGNvbnN0IGNvbGxlY3RlZDogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWRXaGlsZShcblx0XHRcdFx0dmFsdWUgPT4gdHJ1ZSxcblx0XHRcdFx0YXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbGxlY3RlZC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0ZWQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRXaGlsZSAtIHByZWRpY2F0ZSByZXR1cm5zIGZhbHNlIGltbWVkaWF0ZWx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdKSk7XG5cdFx0XHRjb25zdCBjb2xsZWN0ZWQ6IG51bWJlcltdID0gW107XG5cblx0XHRcdGF3YWl0IHJlYWRlci5yZWFkV2hpbGUoXG5cdFx0XHRcdHZhbHVlID0+IGZhbHNlLCAvLyBBbHdheXMgZmFsc2Vcblx0XHRcdFx0YXN5bmMgdmFsdWUgPT4ge1xuXHRcdFx0XHRcdGNvbGxlY3RlZC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0ZWQsIFtdKTtcblxuXHRcdFx0Ly8gRmlyc3QgaXRlbSBzaG91bGQgc3RpbGwgYmUgYXZhaWxhYmxlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrVGltZW91dCAtIHdpdGggaW1tZWRpYXRlIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgM10pKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZGVyLnBlZWtUaW1lb3V0KDEwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZWtUaW1lb3V0IC0gd2l0aCBkZWxheWVkIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlRGVsYXllZEFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdLCAxMCkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkZXIucGVla1RpbWVvdXQoNTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrVGltZW91dCAtIHRpbWVvdXQgb2NjdXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlRGVsYXllZEFzeW5jSXRlcmF0b3IoWzEsIDIsIDNdLCA1MCkpO1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRlci5wZWVrVGltZW91dCgxMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0YXdhaXQgcmVhZGVyLmNvbnN1bWVUb0VuZCgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZWVrVGltZW91dCAtIGVtcHR5IGl0ZXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3IoW10pKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZGVyLnBlZWtUaW1lb3V0KDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGFzeW5jLkFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGVla1RpbWVvdXQgLSBhZnRlciBjb25zdW1pbmcgYWxsIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMV0pKTtcblxuXHRcdFx0YXdhaXQgcmVhZGVyLmNvbnN1bWVUb0VuZCgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZGVyLnBlZWtUaW1lb3V0KDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGFzeW5jLkFzeW5jUmVhZGVyRW5kT2ZTdHJlYW0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWl4ZWQgb3BlcmF0aW9ucyAtIGNvbXBsZXggc2NlbmFyaW8nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTBdKSk7XG5cblx0XHRcdC8vIFBlZWsgZmlyc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCAxKTtcblxuXHRcdFx0Ly8gUmVhZCBzb21lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgMik7XG5cblx0XHRcdC8vIFBlZWsgYWdhaW5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCAzKTtcblxuXHRcdFx0Ly8gUmVhZCB3aGlsZVxuXHRcdFx0Y29uc3QgY29sbGVjdGVkOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0YXdhaXQgcmVhZGVyLnJlYWRXaGlsZShcblx0XHRcdFx0dmFsdWUgPT4gdmFsdWUgPD0gNSxcblx0XHRcdFx0YXN5bmMgdmFsdWUgPT4gY29sbGVjdGVkLnB1c2godmFsdWUpXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0ZWQsIFszLCA0LCA1XSk7XG5cblx0XHRcdC8vIFVzZSBzeW5jIG9wZXJhdGlvbnNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucGVlaygpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIucGVla0J1ZmZlcmVkT3JUaHJvdygpLCA2KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkZXIucmVhZEJ1ZmZlcmVkT3JUaHJvdygpLCA2KTtcblxuXHRcdFx0Ly8gQ29uc3VtZSByZXN0XG5cdFx0XHRhd2FpdCByZWFkZXIuY29uc3VtZVRvRW5kKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZGVyLmVuZE9mU3RyZWFtLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZyB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgYXN5bmMuQXN5bmNSZWFkZXIoY3JlYXRlQXN5bmNJdGVyYXRvcihbJ2hlbGxvJywgJ3dvcmxkJywgJ3Rlc3QnXSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgJ2hlbGxvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnBlZWsoKSwgJ3dvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgJ3dvcmxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZGVyLnJlYWQoKSwgJ3Rlc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCBhc3luYy5Bc3luY1JlYWRlckVuZE9mU3RyZWFtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29iamVjdCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgVGVzdE9iaiB7XG5cdFx0XHRcdGlkOiBudW1iZXI7XG5cdFx0XHRcdG5hbWU6IHN0cmluZztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2JqZWN0czogVGVzdE9ialtdID0gW1xuXHRcdFx0XHR7IGlkOiAxLCBuYW1lOiAnZmlyc3QnIH0sXG5cdFx0XHRcdHsgaWQ6IDIsIG5hbWU6ICdzZWNvbmQnIH0sXG5cdFx0XHRcdHsgaWQ6IDMsIG5hbWU6ICd0aGlyZCcgfVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKGNyZWF0ZUFzeW5jSXRlcmF0b3Iob2JqZWN0cykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIHsgaWQ6IDEsIG5hbWU6ICdmaXJzdCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5wZWVrKCksIHsgaWQ6IDIsIG5hbWU6ICdzZWNvbmQnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkZXIucmVhZCgpLCB7IGlkOiAyLCBuYW1lOiAnc2Vjb25kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmN1cnJlbnQgb3BlcmF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBhc3luYy5Bc3luY1JlYWRlcihjcmVhdGVEZWxheWVkQXN5bmNJdGVyYXRvcihbMSwgMiwgM10sIDUpKTtcblxuXHRcdFx0Ly8gU3RhcnQgbXVsdGlwbGUgb3BlcmF0aW9ucyBjb25jdXJyZW50bHlcblx0XHRcdGNvbnN0IHBlZWtQcm9taXNlID0gcmVhZGVyLnBlZWsoKTtcblx0XHRcdGNvbnN0IHJlYWRQcm9taXNlID0gcmVhZGVyLnJlYWQoKTtcblxuXHRcdFx0Y29uc3QgW3BlZWtSZXN1bHQsIHJlYWRSZXN1bHRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3BlZWtQcm9taXNlLCByZWFkUHJvbWlzZV0pO1xuXG5cdFx0XHQvLyBCb3RoIHNob3VsZCByZXR1cm4gdGhlIHNhbWUgZmlyc3QgdmFsdWVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZWVrUmVzdWx0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkUmVzdWx0LCAxKTtcblxuXHRcdFx0Ly8gTmV4dCByZWFkIHNob3VsZCBnZXQgdGhlIHNlY29uZCB2YWx1ZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRlci5yZWFkKCksIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYnVmZmVyIG1hbmFnZW1lbnQgLSBzaW5nbGUgZXh0ZW5kIGJ1ZmZlciBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IG5leHRDYWxsQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgbW9ja0l0ZXJhdG9yOiBBc3luY0l0ZXJhdG9yPG51bWJlcj4gPSB7XG5cdFx0XHRcdGFzeW5jIG5leHQoKSB7XG5cdFx0XHRcdFx0bmV4dENhbGxDb3VudCsrO1xuXHRcdFx0XHRcdGlmIChuZXh0Q2FsbENvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBhc3luYy50aW1lb3V0KDEpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IDEsIGRvbmU6IGZhbHNlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiB1bmRlZmluZWQsIGRvbmU6IHRydWUgfTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IGFzeW5jLkFzeW5jUmVhZGVyKG1vY2tJdGVyYXRvcik7XG5cblx0XHRcdC8vIE11bHRpcGxlIGNvbmN1cnJlbnQgb3BlcmF0aW9ucyBzaG91bGQgb25seSB0cmlnZ2VyIG9uZSBleHRlbmQgYnVmZmVyIGNhbGxcblx0XHRcdGNvbnN0IHByb21pc2VzID0gW1xuXHRcdFx0XHRyZWFkZXIucGVlaygpLFxuXHRcdFx0XHRyZWFkZXIucGVlaygpLFxuXHRcdFx0XHRyZWFkZXIucmVhZCgpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cblx0XHRcdC8vIFNob3VsZCBoYXZlIGNhbGxlZCBuZXh0KCkgb25seSBvbmNlIGRlc3BpdGUgbXVsdGlwbGUgY29uY3VycmVudCBvcGVyYXRpb25zXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmV4dENhbGxDb3VudCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksb0JBQW9CO0FBQ2hDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBRXpCLE1BQU0sU0FBUyxNQUFNO0FBRXBCLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsUUFBTSxxQkFBcUIsV0FBWTtBQUN0QyxTQUFLLDJDQUE0QyxXQUFZO0FBQzVELFVBQUksV0FBVztBQUNmLFlBQU0sVUFBVSxNQUFNLHdCQUF3QixXQUFTO0FBQ3RELGNBQU0sSUFBSSxNQUFNLHdCQUF3QixPQUFLO0FBQUUsc0JBQVk7QUFBQSxR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LEVBQUUsSUFBSSxHQUFHLE1BQU0sU0FBUztBQUFBLFFBQ3hCLEVBQUUsSUFBSSxHQUFHLE1BQU0sUUFBUTtBQUFBLE1BQ3hCO0FBRUEsWUFBTSxTQUFTLElBQUksTUFBTSxZQUFZLG9CQUFvQixPQUFPLENBQUM7QUFFakUsYUFBTyxnQkFBZ0IsTUFBTSxPQUFPLEtBQUssR0FBRyxFQUFFLElBQUksR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUNwRSxhQUFPLGdCQUFnQixNQUFNLE9BQU8sS0FBSyxHQUFHLEVBQUUsSUFBSSxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBQ3JFLGFBQU8sZ0JBQWdCLE1BQU0sT0FBTyxLQUFLLEdBQUcsRUFBRSxJQUFJLEdBQUcsTUFBTSxTQUFTLENBQUM7QUFBQSxJQUN0RSxDQUFDO0FBRUQsU0FBSyx5QkFBeUIsWUFBWTtBQUN6QyxZQUFNLFNBQVMsSUFBSSxNQUFNLFlBQVksMkJBQTJCLENBQUMsR0FBRyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7QUFHN0UsWUFBTSxjQUFjLE9BQU8sS0FBSztBQUNoQyxZQUFNLGNBQWMsT0FBTyxLQUFLO0FBRWhDLFlBQU0sQ0FBQyxZQUFZLFVBQVUsSUFBSSxNQUFNLFFBQVEsSUFBSSxDQUFDLGFBQWEsV0FBVyxDQUFDO0FBRzdFLGFBQU8sWUFBWSxZQUFZLENBQUM7QUFDaEMsYUFBTyxZQUFZLFlBQVksQ0FBQztBQUdoQyxhQUFPLFlBQVksTUFBTSxPQUFPLEtBQUssR0FBRyxDQUFDO0FBQUEsSUFDMUMsQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsVUFBSSxnQkFBZ0I7QUFDcEIsWUFBTSxlQUFzQztBQUFBLFFBQzNDLE1BQU0sT0FBTztBQUNaO0FBQ0EsY0FBSSxrQkFBa0IsR0FBRztBQUN4QixrQkFBTSxNQUFNLFFBQVEsQ0FBQztBQUNyQixtQkFBTyxFQUFFLE9BQU8sR0FBRyxNQUFNLE1BQU07QUFBQSxVQUNoQztBQUNBLGlCQUFPLEVBQUUsT0FBTyxRQUFXLE1BQU0sS0FBSztBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxJQUFJLE1BQU0sWUFBWSxZQUFZO0FBR2pELFlBQU0sV0FBVztBQUFBLFFBQ2hCLE9BQU8sS0FBSztBQUFBLFFBQ1osT0FBTyxLQUFLO0FBQUEsUUFDWixPQUFPLEtBQUs7QUFBQSxNQUNiO0FBRUEsWUFBTSxRQUFRLElBQUksUUFBUTtBQUcxQixhQUFPLFlBQVksZUFBZSxDQUFDO0FBQUEsSUFDcEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInN0b3JlIiwgInAiLCAidGVzdCIsICJjdHMiXQp9Cg==
