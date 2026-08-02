import assert from "assert";
import { CancellationTokenSource } from "../../../common/cancellation.js";
import { DisposableStore } from "../../../common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../utils.js";
import {
  createTraceRoot,
  createVirtualTimeApi,
  drainMicrotasksEmbedding,
  nextMacrotask,
  pushGlobalTimeApi,
  realTimeApi,
  runWithFakedTimers,
  TraceContext,
  untilIdle,
  untilTime,
  untilToken,
  VirtualClock,
  VirtualTimeProcessor
} from "./index.js";
function traceInfo(t) {
  const labels = [];
  for (let c = t; c; c = c.parent) {
    labels.push(c.label);
  }
  return { labels, rootLabel: t.root.label, depth: t.depth };
}
function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
const realSink = { afterMicrotaskClosure: (cb) => nextMacrotask(realTimeApi, cb) };
suite("virtualScheduling - Trace + TraceContext", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("Trace.describe builds causal chain from leaf to root", () => {
    const root = createTraceRoot("fixture");
    const t1 = root.child("setTimeout(100ms)");
    const t2 = t1.child("await continuation");
    assert.deepStrictEqual(traceInfo(t2), {
      labels: ["await continuation", "setTimeout(100ms)", "fixture"],
      rootLabel: "fixture",
      depth: 2
    });
  });
  test("runWithTrace installs and restores synchronously; supports nesting", () => {
    const a = createTraceRoot("a");
    const b = createTraceRoot("b");
    const observations = [];
    observations.push(TraceContext.instance.currentTrace().label);
    TraceContext.instance.runWithTrace(a, () => {
      observations.push(TraceContext.instance.currentTrace().label);
      TraceContext.instance.runWithTrace(b, () => {
        observations.push(TraceContext.instance.currentTrace().label);
      });
      observations.push(TraceContext.instance.currentTrace().label);
    });
    observations.push(TraceContext.instance.currentTrace().label);
    assert.deepStrictEqual(observations, ["<root>", "a", "b", "a", "<root>"]);
  });
  test("runAsHandler throws on sync re-entry", () => {
    const a = createTraceRoot("a");
    const b = createTraceRoot("b");
    assert.throws(
      () => TraceContext.instance.runAsHandler(
        a,
        () => TraceContext.instance.runAsHandler(b, () => {
        }, realSink),
        realSink
      ),
      /re-entrant/
    );
  });
  test("runAsHandler leaks trace across awaited microtasks", async () => {
    const root = createTraceRoot("fixture");
    const observed = [];
    await TraceContext.instance.runAsHandler(root, async () => {
      observed.push(TraceContext.instance.currentTrace().label);
      await Promise.resolve();
      observed.push(TraceContext.instance.currentTrace().label);
      await Promise.resolve().then(() => Promise.resolve());
      observed.push(TraceContext.instance.currentTrace().label);
    }, realSink);
    assert.deepStrictEqual(observed, ["fixture", "fixture", "fixture"]);
  });
});
suite("virtualScheduling - createVirtualTimeApi trace propagation", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("virtual setTimeout: callback fires under trace child of schedule-time trace", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      const observed = await promise;
      assert.deepStrictEqual(traceInfo(observed), {
        labels: ["setTimeout(0ms)", "root"],
        rootLabel: "root",
        depth: 1
      });
    });
  });
  test("virtual nested setTimeout preserves full causal chain", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        setTimeout(() => {
          setTimeout(() => resolve(TraceContext.instance.currentTrace()), 0);
        }, 0);
      }, realSink);
      const observed = await promise;
      assert.deepStrictEqual(traceInfo(observed), {
        labels: ["setTimeout(0ms)", "setTimeout(0ms)", "root"],
        rootLabel: "root",
        depth: 2
      });
    });
  });
  test("virtual setInterval: each tick gets a fresh child trace", async () => {
    await runWithFakedTimers({}, async () => {
      const root = createTraceRoot("root");
      const observed = [];
      const { promise, resolve } = deferred();
      TraceContext.instance.runAsHandler(root, () => {
        const id = setInterval(() => {
          observed.push(TraceContext.instance.currentTrace());
          if (observed.length === 3) {
            clearInterval(id);
            resolve();
          }
        }, 5);
      }, realSink);
      await promise;
      assert.deepStrictEqual(observed.map(traceInfo), [
        { labels: ["tick #1", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 },
        { labels: ["tick #2", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 },
        { labels: ["tick #3", "setInterval(5ms)", "root"], rootLabel: "root", depth: 2 }
      ]);
    });
  });
  test("concurrent runAsHandler via setTimeout(0): traces do not leak across handlers", async () => {
    await runWithFakedTimers({}, async () => {
      const a = createTraceRoot("a");
      const b = createTraceRoot("b");
      const { promise: doneA, resolve: resA } = deferred();
      const { promise: doneB, resolve: resB } = deferred();
      TraceContext.instance.runAsHandler(a, () => {
        setTimeout(() => resA(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      TraceContext.instance.runAsHandler(b, () => {
        setTimeout(() => resB(TraceContext.instance.currentTrace()), 0);
      }, realSink);
      const [tA, tB] = await Promise.all([doneA, doneB]);
      assert.deepStrictEqual({
        aRoot: tA.root.label,
        aLabels: traceInfo(tA).labels,
        bRoot: tB.root.label,
        bLabels: traceInfo(tB).labels
      }, {
        aRoot: "a",
        aLabels: ["setTimeout(0ms)", "a"],
        bRoot: "b",
        bLabels: ["setTimeout(0ms)", "b"]
      });
    });
  });
});
suite("virtualScheduling - VirtualTimeProcessor termination policies", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  function makeProcessor(store, clock) {
    return store.add(new VirtualTimeProcessor(
      clock,
      drainMicrotasksEmbedding(realTimeApi),
      realTimeApi,
      { defaultMaxEvents: 50 }
    ));
  }
  test("untilIdle: resolves when queue drains", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 5, source: { toString: () => "t1" }, run: () => log.push("a") });
    clock.schedule({ time: 10, source: { toString: () => "t2" }, run: () => log.push("b") });
    await p.run({ until: untilIdle });
    assert.deepStrictEqual(log, ["a", "b"]);
    store.dispose();
  });
  test("untilTime: resolves at deadline even when no events scheduled", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    await p.run({ until: untilTime(100) });
    assert.strictEqual(clock.now, 100);
    store.dispose();
  });
  test("untilTime: pre-scheduled events run before deadline", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 50, source: { toString: () => "t" }, run: () => log.push("a") });
    await p.run({ until: untilTime(100) });
    assert.deepStrictEqual({ log, virtualNow: clock.now }, { log: ["a"], virtualNow: 100 });
    store.dispose();
  });
  test("untilTime: events strictly past the deadline are NOT executed", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const log = [];
    clock.schedule({ time: 50, source: { toString: () => "a" }, run: () => log.push("a") });
    clock.schedule({ time: 100, source: { toString: () => "b" }, run: () => log.push("b") });
    clock.schedule({ time: 101, source: { toString: () => "c" }, run: () => log.push("c") });
    await p.run({ until: untilTime(100) });
    assert.deepStrictEqual(log, ["a", "b"]);
    store.dispose();
  });
  test("untilToken: resolves only after token cancellation AND drain", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const cts = store.add(new CancellationTokenSource());
    const log = [];
    const runP = p.run({ until: untilToken(cts.token) });
    await Promise.resolve();
    clock.schedule({ time: 5, source: { toString: () => "t" }, run: () => log.push("a") });
    cts.cancel();
    await runP;
    assert.deepStrictEqual(log, ["a"]);
    store.dispose();
  });
  test("maxEvents: rejects when too many events are executed", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const tick = (n) => {
      clock.schedule({
        time: clock.now + 1,
        source: { toString: () => `t${n}` },
        run: () => tick(n + 1)
      });
    };
    tick(0);
    await assert.rejects(
      p.run({ until: untilIdle, maxEvents: 5 }),
      /exceeded maxEvents/
    );
    store.dispose();
  });
  test("disposal rejects all active runs", async () => {
    const store = new DisposableStore();
    const clock = new VirtualClock();
    const p = makeProcessor(store, clock);
    const cts = store.add(new CancellationTokenSource());
    const runP = p.run({ until: untilToken(cts.token) });
    p.dispose();
    await assert.rejects(runP, /disposed/);
    store.dispose();
  });
});
suite("virtualScheduling - runWithFakedTimers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => TraceContext.instance._resetForTesting());
  test("drains queue after fn() resolves", async () => {
    const log = [];
    await runWithFakedTimers({}, async () => {
      setTimeout(() => log.push("a"), 100);
      setTimeout(() => log.push("b"), 50);
    });
    assert.deepStrictEqual(log, ["b", "a"]);
  });
  test("useFakeTimers=false bypasses virtual time", async () => {
    const before = globalThis.setTimeout;
    await runWithFakedTimers({ useFakeTimers: false }, async () => {
      assert.strictEqual(globalThis.setTimeout, before);
    });
  });
  test("promise chains awaited inside fn() resolve deterministically", async () => {
    const log = [];
    await runWithFakedTimers({}, async () => {
      await new Promise((resolve) => {
        setTimeout(async () => {
          log.push("1");
          await Promise.resolve();
          log.push("2");
          setTimeout(() => {
            log.push("3");
            resolve();
          }, 10);
        }, 5);
      });
    });
    assert.deepStrictEqual(log, ["1", "2", "3"]);
  });
});
suite("virtualScheduling - createVirtualTimeApi without processor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("virtual wall and monotonic clocks stay consistent", () => {
    const clock = new VirtualClock(12345);
    const api = createVirtualTimeApi(clock, { fakeRequestAnimationFrame: true });
    const originalPerformanceNow = performance.now;
    const originalPerformanceTimeOrigin = performance.timeOrigin;
    const restore = pushGlobalTimeApi(api);
    let animationFrameTime;
    let actual;
    try {
      requestAnimationFrame((time) => animationFrameTime = time);
      clock.runNext();
      actual = {
        dateNow: Date.now(),
        performanceNow: performance.now(),
        performanceTimeOrigin: performance.timeOrigin,
        animationFrameTime
      };
    } finally {
      restore.dispose();
    }
    assert.deepStrictEqual({
      actual,
      restoredPerformanceNow: performance.now === originalPerformanceNow,
      restoredPerformanceTimeOrigin: performance.timeOrigin
    }, {
      actual: {
        dateNow: 12361,
        performanceNow: 16,
        performanceTimeOrigin: 12345,
        animationFrameTime: 16
      },
      restoredPerformanceNow: true,
      restoredPerformanceTimeOrigin: originalPerformanceTimeOrigin
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vdmlydHVhbFNjaGVkdWxpbmcvdmlydHVhbFNjaGVkdWxpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdGNyZWF0ZVRyYWNlUm9vdCxcblx0Y3JlYXRlVmlydHVhbFRpbWVBcGksXG5cdGRyYWluTWljcm90YXNrc0VtYmVkZGluZyxcblx0bmV4dE1hY3JvdGFzayxcblx0cHVzaEdsb2JhbFRpbWVBcGksXG5cdHJlYWxUaW1lQXBpLFxuXHRydW5XaXRoRmFrZWRUaW1lcnMsXG5cdFRyYWNlLFxuXHRUcmFjZUNvbnRleHQsXG5cdHVudGlsSWRsZSxcblx0dW50aWxUaW1lLFxuXHR1bnRpbFRva2VuLFxuXHRWaXJ0dWFsQ2xvY2ssXG5cdFZpcnR1YWxUaW1lUHJvY2Vzc29yLFxufSBmcm9tICcuL2luZGV4LmpzJztcblxuZnVuY3Rpb24gdHJhY2VJbmZvKHQ6IFRyYWNlKTogeyBsYWJlbHM6IHN0cmluZ1tdOyByb290TGFiZWw6IHN0cmluZzsgZGVwdGg6IG51bWJlciB9IHtcblx0Y29uc3QgbGFiZWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGxldCBjOiBUcmFjZSB8IHVuZGVmaW5lZCA9IHQ7IGM7IGMgPSBjLnBhcmVudCkgeyBsYWJlbHMucHVzaChjLmxhYmVsKTsgfVxuXHRyZXR1cm4geyBsYWJlbHMsIHJvb3RMYWJlbDogdC5yb290LmxhYmVsLCBkZXB0aDogdC5kZXB0aCB9O1xufVxuXG5mdW5jdGlvbiBkZWZlcnJlZDxUPigpOiB7IHByb21pc2U6IFByb21pc2U8VD47IHJlc29sdmU6ICh2OiBUKSA9PiB2b2lkIH0ge1xuXHRsZXQgcmVzb2x2ZSE6ICh2OiBUKSA9PiB2b2lkO1xuXHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2U8VD4ocmVzID0+IHsgcmVzb2x2ZSA9IHJlczsgfSk7XG5cdHJldHVybiB7IHByb21pc2UsIHJlc29sdmUgfTtcbn1cblxuY29uc3QgcmVhbFNpbmsgPSB7IGFmdGVyTWljcm90YXNrQ2xvc3VyZTogKGNiOiAoKSA9PiB2b2lkKSA9PiBuZXh0TWFjcm90YXNrKHJlYWxUaW1lQXBpLCBjYikgfTtcblxuc3VpdGUoJ3ZpcnR1YWxTY2hlZHVsaW5nIC0gVHJhY2UgKyBUcmFjZUNvbnRleHQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBUcmFjZUNvbnRleHQuaW5zdGFuY2UuX3Jlc2V0Rm9yVGVzdGluZygpKTtcblxuXHR0ZXN0KCdUcmFjZS5kZXNjcmliZSBidWlsZHMgY2F1c2FsIGNoYWluIGZyb20gbGVhZiB0byByb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoJ2ZpeHR1cmUnKTtcblx0XHRjb25zdCB0MSA9IHJvb3QuY2hpbGQoJ3NldFRpbWVvdXQoMTAwbXMpJyk7XG5cdFx0Y29uc3QgdDIgPSB0MS5jaGlsZCgnYXdhaXQgY29udGludWF0aW9uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFjZUluZm8odDIpLCB7XG5cdFx0XHRsYWJlbHM6IFsnYXdhaXQgY29udGludWF0aW9uJywgJ3NldFRpbWVvdXQoMTAwbXMpJywgJ2ZpeHR1cmUnXSxcblx0XHRcdHJvb3RMYWJlbDogJ2ZpeHR1cmUnLFxuXHRcdFx0ZGVwdGg6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bldpdGhUcmFjZSBpbnN0YWxscyBhbmQgcmVzdG9yZXMgc3luY2hyb25vdXNseTsgc3VwcG9ydHMgbmVzdGluZycsICgpID0+IHtcblx0XHRjb25zdCBhID0gY3JlYXRlVHJhY2VSb290KCdhJyk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVRyYWNlUm9vdCgnYicpO1xuXHRcdGNvbnN0IG9ic2VydmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRvYnNlcnZhdGlvbnMucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5XaXRoVHJhY2UoYSwgKCkgPT4ge1xuXHRcdFx0b2JzZXJ2YXRpb25zLnB1c2goVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpLmxhYmVsKTtcblx0XHRcdFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5XaXRoVHJhY2UoYiwgKCkgPT4ge1xuXHRcdFx0XHRvYnNlcnZhdGlvbnMucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdFx0fSk7XG5cdFx0XHRvYnNlcnZhdGlvbnMucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdH0pO1xuXHRcdG9ic2VydmF0aW9ucy5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZhdGlvbnMsIFsnPHJvb3Q+JywgJ2EnLCAnYicsICdhJywgJzxyb290PiddKTtcblx0fSk7XG5cblx0dGVzdCgncnVuQXNIYW5kbGVyIHRocm93cyBvbiBzeW5jIHJlLWVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVUcmFjZVJvb3QoJ2EnKTtcblx0XHRjb25zdCBiID0gY3JlYXRlVHJhY2VSb290KCdiJyk7XG5cdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdCgpID0+IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIoYSxcblx0XHRcdFx0KCkgPT4gVHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihiLCAoKSA9PiB7IH0sIHJlYWxTaW5rKSxcblx0XHRcdFx0cmVhbFNpbmspLFxuXHRcdFx0L3JlLWVudHJhbnQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bkFzSGFuZGxlciBsZWFrcyB0cmFjZSBhY3Jvc3MgYXdhaXRlZCBtaWNyb3Rhc2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoJ2ZpeHR1cmUnKTtcblx0XHRjb25zdCBvYnNlcnZlZDogc3RyaW5nW10gPSBbXTtcblxuXHRcdGF3YWl0IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIocm9vdCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0b2JzZXJ2ZWQucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkubGFiZWwpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRvYnNlcnZlZC5wdXNoKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKS5sYWJlbCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKS50aGVuKCgpID0+IFByb21pc2UucmVzb2x2ZSgpKTtcblx0XHRcdG9ic2VydmVkLnB1c2goVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpLmxhYmVsKTtcblx0XHR9LCByZWFsU2luayk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9ic2VydmVkLCBbJ2ZpeHR1cmUnLCAnZml4dHVyZScsICdmaXh0dXJlJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndmlydHVhbFNjaGVkdWxpbmcgLSBjcmVhdGVWaXJ0dWFsVGltZUFwaSB0cmFjZSBwcm9wYWdhdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlYXJkb3duKCgpID0+IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5fcmVzZXRGb3JUZXN0aW5nKCkpO1xuXG5cdHRlc3QoJ3ZpcnR1YWwgc2V0VGltZW91dDogY2FsbGJhY2sgZmlyZXMgdW5kZXIgdHJhY2UgY2hpbGQgb2Ygc2NoZWR1bGUtdGltZSB0cmFjZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoJ3Jvb3QnKTtcblx0XHRcdGNvbnN0IHsgcHJvbWlzZSwgcmVzb2x2ZSB9ID0gZGVmZXJyZWQ8VHJhY2U+KCk7XG5cdFx0XHRUcmFjZUNvbnRleHQuaW5zdGFuY2UucnVuQXNIYW5kbGVyKHJvb3QsICgpID0+IHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiByZXNvbHZlKFRyYWNlQ29udGV4dC5pbnN0YW5jZS5jdXJyZW50VHJhY2UoKSksIDApO1xuXHRcdFx0fSwgcmVhbFNpbmspO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZWQgPSBhd2FpdCBwcm9taXNlO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFjZUluZm8ob2JzZXJ2ZWQpLCB7XG5cdFx0XHRcdGxhYmVsczogWydzZXRUaW1lb3V0KDBtcyknLCAncm9vdCddLFxuXHRcdFx0XHRyb290TGFiZWw6ICdyb290Jyxcblx0XHRcdFx0ZGVwdGg6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlydHVhbCBuZXN0ZWQgc2V0VGltZW91dCBwcmVzZXJ2ZXMgZnVsbCBjYXVzYWwgY2hhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gY3JlYXRlVHJhY2VSb290KCdyb290Jyk7XG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUgfSA9IGRlZmVycmVkPFRyYWNlPigpO1xuXHRcdFx0VHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihyb290LCAoKSA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZShUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkpLCAwKTtcblx0XHRcdFx0fSwgMCk7XG5cdFx0XHR9LCByZWFsU2luayk7XG5cdFx0XHRjb25zdCBvYnNlcnZlZCA9IGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNlSW5mbyhvYnNlcnZlZCksIHtcblx0XHRcdFx0bGFiZWxzOiBbJ3NldFRpbWVvdXQoMG1zKScsICdzZXRUaW1lb3V0KDBtcyknLCAncm9vdCddLFxuXHRcdFx0XHRyb290TGFiZWw6ICdyb290Jyxcblx0XHRcdFx0ZGVwdGg6IDIsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlydHVhbCBzZXRJbnRlcnZhbDogZWFjaCB0aWNrIGdldHMgYSBmcmVzaCBjaGlsZCB0cmFjZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBjcmVhdGVUcmFjZVJvb3QoJ3Jvb3QnKTtcblx0XHRcdGNvbnN0IG9ic2VydmVkOiBUcmFjZVtdID0gW107XG5cdFx0XHRjb25zdCB7IHByb21pc2UsIHJlc29sdmUgfSA9IGRlZmVycmVkPHZvaWQ+KCk7XG5cdFx0XHRUcmFjZUNvbnRleHQuaW5zdGFuY2UucnVuQXNIYW5kbGVyKHJvb3QsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWQgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdFx0b2JzZXJ2ZWQucHVzaChUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkpO1xuXHRcdFx0XHRcdGlmIChvYnNlcnZlZC5sZW5ndGggPT09IDMpIHsgY2xlYXJJbnRlcnZhbChpZCk7IHJlc29sdmUoKTsgfVxuXHRcdFx0XHR9LCA1KTtcblx0XHRcdH0sIHJlYWxTaW5rKTtcblx0XHRcdGF3YWl0IHByb21pc2U7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9ic2VydmVkLm1hcCh0cmFjZUluZm8pLCBbXG5cdFx0XHRcdHsgbGFiZWxzOiBbJ3RpY2sgIzEnLCAnc2V0SW50ZXJ2YWwoNW1zKScsICdyb290J10sIHJvb3RMYWJlbDogJ3Jvb3QnLCBkZXB0aDogMiB9LFxuXHRcdFx0XHR7IGxhYmVsczogWyd0aWNrICMyJywgJ3NldEludGVydmFsKDVtcyknLCAncm9vdCddLCByb290TGFiZWw6ICdyb290JywgZGVwdGg6IDIgfSxcblx0XHRcdFx0eyBsYWJlbHM6IFsndGljayAjMycsICdzZXRJbnRlcnZhbCg1bXMpJywgJ3Jvb3QnXSwgcm9vdExhYmVsOiAncm9vdCcsIGRlcHRoOiAyIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uY3VycmVudCBydW5Bc0hhbmRsZXIgdmlhIHNldFRpbWVvdXQoMCk6IHRyYWNlcyBkbyBub3QgbGVhayBhY3Jvc3MgaGFuZGxlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhID0gY3JlYXRlVHJhY2VSb290KCdhJyk7XG5cdFx0XHRjb25zdCBiID0gY3JlYXRlVHJhY2VSb290KCdiJyk7XG5cdFx0XHRjb25zdCB7IHByb21pc2U6IGRvbmVBLCByZXNvbHZlOiByZXNBIH0gPSBkZWZlcnJlZDxUcmFjZT4oKTtcblx0XHRcdGNvbnN0IHsgcHJvbWlzZTogZG9uZUIsIHJlc29sdmU6IHJlc0IgfSA9IGRlZmVycmVkPFRyYWNlPigpO1xuXHRcdFx0VHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihhLCAoKSA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gcmVzQShUcmFjZUNvbnRleHQuaW5zdGFuY2UuY3VycmVudFRyYWNlKCkpLCAwKTtcblx0XHRcdH0sIHJlYWxTaW5rKTtcblx0XHRcdFRyYWNlQ29udGV4dC5pbnN0YW5jZS5ydW5Bc0hhbmRsZXIoYiwgKCkgPT4ge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHJlc0IoVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpKSwgMCk7XG5cdFx0XHR9LCByZWFsU2luayk7XG5cdFx0XHRjb25zdCBbdEEsIHRCXSA9IGF3YWl0IFByb21pc2UuYWxsKFtkb25lQSwgZG9uZUJdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRhUm9vdDogdEEucm9vdC5sYWJlbCxcblx0XHRcdFx0YUxhYmVsczogdHJhY2VJbmZvKHRBKS5sYWJlbHMsXG5cdFx0XHRcdGJSb290OiB0Qi5yb290LmxhYmVsLFxuXHRcdFx0XHRiTGFiZWxzOiB0cmFjZUluZm8odEIpLmxhYmVscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0YVJvb3Q6ICdhJyxcblx0XHRcdFx0YUxhYmVsczogWydzZXRUaW1lb3V0KDBtcyknLCAnYSddLFxuXHRcdFx0XHRiUm9vdDogJ2InLFxuXHRcdFx0XHRiTGFiZWxzOiBbJ3NldFRpbWVvdXQoMG1zKScsICdiJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3ZpcnR1YWxTY2hlZHVsaW5nIC0gVmlydHVhbFRpbWVQcm9jZXNzb3IgdGVybWluYXRpb24gcG9saWNpZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZWFyZG93bigoKSA9PiBUcmFjZUNvbnRleHQuaW5zdGFuY2UuX3Jlc2V0Rm9yVGVzdGluZygpKTtcblxuXHRmdW5jdGlvbiBtYWtlUHJvY2Vzc29yKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIGNsb2NrOiBWaXJ0dWFsQ2xvY2spOiBWaXJ0dWFsVGltZVByb2Nlc3NvciB7XG5cdFx0cmV0dXJuIHN0b3JlLmFkZChuZXcgVmlydHVhbFRpbWVQcm9jZXNzb3IoXG5cdFx0XHRjbG9jayxcblx0XHRcdGRyYWluTWljcm90YXNrc0VtYmVkZGluZyhyZWFsVGltZUFwaSksXG5cdFx0XHRyZWFsVGltZUFwaSxcblx0XHRcdHsgZGVmYXVsdE1heEV2ZW50czogNTAgfSxcblx0XHQpKTtcblx0fVxuXG5cdHRlc3QoJ3VudGlsSWRsZTogcmVzb2x2ZXMgd2hlbiBxdWV1ZSBkcmFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblx0XHRjb25zdCBsb2c6IHN0cmluZ1tdID0gW107XG5cblx0XHRjbG9jay5zY2hlZHVsZSh7IHRpbWU6IDUsIHNvdXJjZTogeyB0b1N0cmluZzogKCkgPT4gJ3QxJyB9LCBydW46ICgpID0+IGxvZy5wdXNoKCdhJykgfSk7XG5cdFx0Y2xvY2suc2NoZWR1bGUoeyB0aW1lOiAxMCwgc291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiAndDInIH0sIHJ1bjogKCkgPT4gbG9nLnB1c2goJ2InKSB9KTtcblxuXHRcdGF3YWl0IHAucnVuKHsgdW50aWw6IHVudGlsSWRsZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZywgWydhJywgJ2InXSk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRpbFRpbWU6IHJlc29sdmVzIGF0IGRlYWRsaW5lIGV2ZW4gd2hlbiBubyBldmVudHMgc2NoZWR1bGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBkZWFkbGluZSBhbG9uZSBcdTIwMTQgd2l0aCBubyBvdGhlciBldmVudHMgcXVldWVkIFx1MjAxNCBtdXN0IHN0aWxsIGRyaXZlXG5cdFx0Ly8gdmlydHVhbCB0aW1lIHRvIHRoZSBkZWFkbGluZS4gVGhlIHByb2Nlc3NvciBpbnNlcnRzIGEgc2VudGluZWxcblx0XHQvLyBldmVudCBhdCB0aGUgZGVhZGxpbmUgdG8gZ3VhcmFudGVlIHRoaXMuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblxuXHRcdGF3YWl0IHAucnVuKHsgdW50aWw6IHVudGlsVGltZSgxMDApIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9jay5ub3csIDEwMCk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRpbFRpbWU6IHByZS1zY2hlZHVsZWQgZXZlbnRzIHJ1biBiZWZvcmUgZGVhZGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblx0XHRjb25zdCBsb2c6IHN0cmluZ1tdID0gW107XG5cblx0XHRjbG9jay5zY2hlZHVsZSh7IHRpbWU6IDUwLCBzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+ICd0JyB9LCBydW46ICgpID0+IGxvZy5wdXNoKCdhJykgfSk7XG5cblx0XHRhd2FpdCBwLnJ1bih7IHVudGlsOiB1bnRpbFRpbWUoMTAwKSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbG9nLCB2aXJ0dWFsTm93OiBjbG9jay5ub3cgfSwgeyBsb2c6IFsnYSddLCB2aXJ0dWFsTm93OiAxMDAgfSk7XG5cdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnRpbFRpbWU6IGV2ZW50cyBzdHJpY3RseSBwYXN0IHRoZSBkZWFkbGluZSBhcmUgTk9UIGV4ZWN1dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNsb2NrID0gbmV3IFZpcnR1YWxDbG9jaygpO1xuXHRcdGNvbnN0IHAgPSBtYWtlUHJvY2Vzc29yKHN0b3JlLCBjbG9jayk7XG5cdFx0Y29uc3QgbG9nOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y2xvY2suc2NoZWR1bGUoeyB0aW1lOiA1MCwgc291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiAnYScgfSwgcnVuOiAoKSA9PiBsb2cucHVzaCgnYScpIH0pO1xuXHRcdGNsb2NrLnNjaGVkdWxlKHsgdGltZTogMTAwLCBzb3VyY2U6IHsgdG9TdHJpbmc6ICgpID0+ICdiJyB9LCBydW46ICgpID0+IGxvZy5wdXNoKCdiJykgfSk7XG5cdFx0Y2xvY2suc2NoZWR1bGUoeyB0aW1lOiAxMDEsIHNvdXJjZTogeyB0b1N0cmluZzogKCkgPT4gJ2MnIH0sIHJ1bjogKCkgPT4gbG9nLnB1c2goJ2MnKSB9KTtcblxuXHRcdGF3YWl0IHAucnVuKHsgdW50aWw6IHVudGlsVGltZSgxMDApIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLCBbJ2EnLCAnYiddKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VudGlsVG9rZW46IHJlc29sdmVzIG9ubHkgYWZ0ZXIgdG9rZW4gY2FuY2VsbGF0aW9uIEFORCBkcmFpbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBWaXJ0dWFsQ2xvY2soKTtcblx0XHRjb25zdCBwID0gbWFrZVByb2Nlc3NvcihzdG9yZSwgY2xvY2spO1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgbG9nOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcnVuUCA9IHAucnVuKHsgdW50aWw6IHVudGlsVG9rZW4oY3RzLnRva2VuKSB9KTtcblxuXHRcdC8vIFdoaWxlIHJ1biBpcyBwYXJrZWQgKG5vIGV2ZW50cyksIHNjaGVkdWxlICsgY2FuY2VsLlxuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNsb2NrLnNjaGVkdWxlKHsgdGltZTogNSwgc291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiAndCcgfSwgcnVuOiAoKSA9PiBsb2cucHVzaCgnYScpIH0pO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IHJ1blA7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2csIFsnYSddKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21heEV2ZW50czogcmVqZWN0cyB3aGVuIHRvbyBtYW55IGV2ZW50cyBhcmUgZXhlY3V0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKCk7XG5cdFx0Y29uc3QgcCA9IG1ha2VQcm9jZXNzb3Ioc3RvcmUsIGNsb2NrKTtcblxuXHRcdC8vIFNlbGYtcmVzY2hlZHVsaW5nIHRpbWVyXG5cdFx0Y29uc3QgdGljayA9IChuOiBudW1iZXIpID0+IHtcblx0XHRcdGNsb2NrLnNjaGVkdWxlKHtcblx0XHRcdFx0dGltZTogY2xvY2subm93ICsgMSxcblx0XHRcdFx0c291cmNlOiB7IHRvU3RyaW5nOiAoKSA9PiBgdCR7bn1gIH0sXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGljayhuICsgMSksXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHRpY2soMCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdHAucnVuKHsgdW50aWw6IHVudGlsSWRsZSwgbWF4RXZlbnRzOiA1IH0pLFxuXHRcdFx0L2V4Y2VlZGVkIG1heEV2ZW50cy8sXG5cdFx0KTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2FsIHJlamVjdHMgYWxsIGFjdGl2ZSBydW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNsb2NrID0gbmV3IFZpcnR1YWxDbG9jaygpO1xuXHRcdGNvbnN0IHAgPSBtYWtlUHJvY2Vzc29yKHN0b3JlLCBjbG9jayk7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJ1blAgPSBwLnJ1bih7IHVudGlsOiB1bnRpbFRva2VuKGN0cy50b2tlbikgfSk7XG5cdFx0cC5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhydW5QLCAvZGlzcG9zZWQvKTtcblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCd2aXJ0dWFsU2NoZWR1bGluZyAtIHJ1bldpdGhGYWtlZFRpbWVycycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlYXJkb3duKCgpID0+IFRyYWNlQ29udGV4dC5pbnN0YW5jZS5fcmVzZXRGb3JUZXN0aW5nKCkpO1xuXG5cdHRlc3QoJ2RyYWlucyBxdWV1ZSBhZnRlciBmbigpIHJlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZzogc3RyaW5nW10gPSBbXTtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gbG9nLnB1c2goJ2EnKSwgMTAwKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gbG9nLnB1c2goJ2InKSwgNTApO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLCBbJ2InLCAnYSddKTtcblx0fSk7XG5cblx0dGVzdCgndXNlRmFrZVRpbWVycz1mYWxzZSBieXBhc3NlcyB2aXJ0dWFsIHRpbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gZ2xvYmFsVGhpcy5zZXRUaW1lb3V0O1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IGZhbHNlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iYWxUaGlzLnNldFRpbWVvdXQsIGJlZm9yZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21pc2UgY2hhaW5zIGF3YWl0ZWQgaW5zaWRlIGZuKCkgcmVzb2x2ZSBkZXRlcm1pbmlzdGljYWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2c6IHN0cmluZ1tdID0gW107XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0c2V0VGltZW91dChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0bG9nLnB1c2goJzEnKTtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHRsb2cucHVzaCgnMicpO1xuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4geyBsb2cucHVzaCgnMycpOyByZXNvbHZlKCk7IH0sIDEwKTtcblx0XHRcdFx0fSwgNSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZywgWycxJywgJzInLCAnMyddKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3ZpcnR1YWxTY2hlZHVsaW5nIC0gY3JlYXRlVmlydHVhbFRpbWVBcGkgd2l0aG91dCBwcm9jZXNzb3InLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3ZpcnR1YWwgd2FsbCBhbmQgbW9ub3RvbmljIGNsb2NrcyBzdGF5IGNvbnNpc3RlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKDEyMzQ1KTtcblx0XHRjb25zdCBhcGkgPSBjcmVhdGVWaXJ0dWFsVGltZUFwaShjbG9jaywgeyBmYWtlUmVxdWVzdEFuaW1hdGlvbkZyYW1lOiB0cnVlIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsUGVyZm9ybWFuY2VOb3cgPSBwZXJmb3JtYW5jZS5ub3c7XG5cdFx0Y29uc3Qgb3JpZ2luYWxQZXJmb3JtYW5jZVRpbWVPcmlnaW4gPSBwZXJmb3JtYW5jZS50aW1lT3JpZ2luO1xuXHRcdGNvbnN0IHJlc3RvcmUgPSBwdXNoR2xvYmFsVGltZUFwaShhcGkpO1xuXHRcdGxldCBhbmltYXRpb25GcmFtZVRpbWU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0dWFsOiBvYmplY3Q7XG5cdFx0dHJ5IHtcblx0XHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZSh0aW1lID0+IGFuaW1hdGlvbkZyYW1lVGltZSA9IHRpbWUpO1xuXHRcdFx0Y2xvY2sucnVuTmV4dCgpO1xuXHRcdFx0YWN0dWFsID0ge1xuXHRcdFx0XHRkYXRlTm93OiBEYXRlLm5vdygpLFxuXHRcdFx0XHRwZXJmb3JtYW5jZU5vdzogcGVyZm9ybWFuY2Uubm93KCksXG5cdFx0XHRcdHBlcmZvcm1hbmNlVGltZU9yaWdpbjogcGVyZm9ybWFuY2UudGltZU9yaWdpbixcblx0XHRcdFx0YW5pbWF0aW9uRnJhbWVUaW1lLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWN0dWFsLFxuXHRcdFx0cmVzdG9yZWRQZXJmb3JtYW5jZU5vdzogcGVyZm9ybWFuY2Uubm93ID09PSBvcmlnaW5hbFBlcmZvcm1hbmNlTm93LFxuXHRcdFx0cmVzdG9yZWRQZXJmb3JtYW5jZVRpbWVPcmlnaW46IHBlcmZvcm1hbmNlLnRpbWVPcmlnaW4sXG5cdFx0fSwge1xuXHRcdFx0YWN0dWFsOiB7XG5cdFx0XHRcdGRhdGVOb3c6IDEyMzYxLFxuXHRcdFx0XHRwZXJmb3JtYW5jZU5vdzogMTYsXG5cdFx0XHRcdHBlcmZvcm1hbmNlVGltZU9yaWdpbjogMTIzNDUsXG5cdFx0XHRcdGFuaW1hdGlvbkZyYW1lVGltZTogMTYsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdG9yZWRQZXJmb3JtYW5jZU5vdzogdHJ1ZSxcblx0XHRcdHJlc3RvcmVkUGVyZm9ybWFuY2VUaW1lT3JpZ2luOiBvcmlnaW5hbFBlcmZvcm1hbmNlVGltZU9yaWdpbixcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHVCQUF1QjtBQUNoQyxT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
