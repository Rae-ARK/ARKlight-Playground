import assert from "assert";
import { setUnexpectedErrorHandler } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { autorun, autorunHandleChanges, autorunPerKeyedItem, autorunWithStoreHandleChanges, derived, derivedDisposable, keepObserved, observableFromEvent, observableSignal, observableValue, recordChanges, transaction, waitForState, derivedHandleChanges, runOnChange, DebugLocation } from "../../../common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../utils.js";
import { observableReducer } from "../../../common/observableInternal/experimental/reducer.js";
import { BaseObservable } from "../../../common/observableInternal/observables/baseObservable.js";
suite("observables", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("tutorial", () => {
    test("observable + autorun", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 1)"]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(3, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 3)"]);
    });
    test("derived + autorun", () => {
      const log = new Log();
      const observable1 = observableValue("myObservable1", 0);
      const observable2 = observableValue("myObservable2", 0);
      const myDerived = derived((reader) => {
        const value1 = observable1.read(reader);
        const value2 = observable2.read(reader);
        const sum = value1 + value2;
        log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
        return sum;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 0 + 0 = 0",
        "myAutorun(myDerived: 0)"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 1 + 0 = 1",
        "myAutorun(myDerived: 1)"
      ]);
      observable2.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 1 + 1 = 2",
        "myAutorun(myDerived: 2)"
      ]);
      transaction((tx) => {
        observable1.set(5, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        observable2.set(5, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 5 + 5 = 10",
        "myAutorun(myDerived: 10)"
      ]);
      transaction((tx) => {
        observable1.set(6, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        observable2.set(4, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived.recompute: 6 + 4 = 10"]);
    });
    test("read during transaction", () => {
      const log = new Log();
      const observable1 = observableValue("myObservable1", 0);
      const observable2 = observableValue("myObservable2", 0);
      const myDerived = derived((reader) => {
        const value1 = observable1.read(reader);
        const value2 = observable2.read(reader);
        const sum = value1 + value2;
        log.log(`myDerived.recompute: ${value1} + ${value2} = ${sum}`);
        return sum;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: 0 + 0 = 0",
        "myAutorun(myDerived: 0)"
      ]);
      transaction((tx) => {
        observable1.set(-10, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myDerived.get();
        assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived.recompute: -10 + 0 = -10"]);
        observable2.set(10, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.recompute: -10 + 10 = 0",
        "myAutorun(myDerived: 0)"
      ]);
    });
    test("get without observers", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value1 = observable1.read(reader);
        const result = value1 % 3;
        log.log(`recompute1: ${value1} % 3 = ${result}`);
        return result;
      });
      const computed2 = derived((reader) => {
        const value1 = computed1.read(reader);
        const result = value1 * 2;
        log.log(`recompute2: ${value1} * 2 = ${result}`);
        return result;
      });
      const computed3 = derived((reader) => {
        const value1 = computed1.read(reader);
        const result = value1 * 3;
        log.log(`recompute3: ${value1} * 3 = ${result}`);
        return result;
      });
      const computedSum = derived((reader) => {
        const value1 = computed2.read(reader);
        const value2 = computed3.read(reader);
        const result = value1 + value2;
        log.log(`recompute4: ${value1} + ${value2} = ${result}`);
        return result;
      });
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      const disposable = keepObserved(computedSum);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 1 % 3 = 1",
        "recompute2: 1 * 2 = 2",
        "recompute3: 1 * 3 = 3",
        "recompute4: 2 + 3 = 5",
        "value: 5"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "value: 5"
      ]);
      observable1.set(2, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), ["value: 10"]);
      disposable.dispose();
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
      log.log(`value: ${computedSum.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "recompute1: 2 % 3 = 2",
        "recompute2: 2 * 2 = 4",
        "recompute3: 2 * 3 = 6",
        "recompute4: 4 + 6 = 10",
        "value: 10"
      ]);
    });
    test("autorun that receives deltas of signals", () => {
      const log = new Log();
      const signal = observableSignal("signal");
      const disposable = autorunHandleChanges({
        changeTracker: {
          // The change summary is used to collect the changes
          createChangeSummary: () => ({ msgs: [] }),
          handleChange(context, changeSummary) {
            if (context.didChange(signal)) {
              changeSummary.msgs.push(context.change.msg);
            }
            return true;
          }
        }
      }, (reader, changeSummary) => {
        signal.read(reader);
        log.log("msgs: " + changeSummary.msgs.join(", "));
      });
      signal.trigger(void 0, { msg: "foobar" });
      transaction((tx) => {
        signal.trigger(tx, { msg: "hello" });
        signal.trigger(tx, { msg: "world" });
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "msgs: ",
        "msgs: foobar",
        "msgs: hello, world"
      ]);
      disposable.dispose();
    });
  });
  test("topological order", () => {
    const log = new Log();
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const myComputed1 = derived((reader) => {
      const value1 = myObservable1.read(reader);
      const value2 = myObservable2.read(reader);
      const sum = value1 + value2;
      log.log(`myComputed1.recompute(myObservable1: ${value1} + myObservable2: ${value2} = ${sum})`);
      return sum;
    });
    const myComputed2 = derived((reader) => {
      const value1 = myComputed1.read(reader);
      const value2 = myObservable1.read(reader);
      const value3 = myObservable2.read(reader);
      const sum = value1 + value2 + value3;
      log.log(`myComputed2.recompute(myComputed1: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
      return sum;
    });
    const myComputed3 = derived((reader) => {
      const value1 = myComputed2.read(reader);
      const value2 = myObservable1.read(reader);
      const value3 = myObservable2.read(reader);
      const sum = value1 + value2 + value3;
      log.log(`myComputed3.recompute(myComputed2: ${value1} + myObservable1: ${value2} + myObservable2: ${value3} = ${sum})`);
      return sum;
    });
    ds.add(autorun((reader) => {
      log.log(`myAutorun.run(myComputed3: ${myComputed3.read(reader)})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed1.recompute(myObservable1: 0 + myObservable2: 0 = 0)",
      "myComputed2.recompute(myComputed1: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
      "myComputed3.recompute(myComputed2: 0 + myObservable1: 0 + myObservable2: 0 = 0)",
      "myAutorun.run(myComputed3: 0)"
    ]);
    myObservable1.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed1.recompute(myObservable1: 1 + myObservable2: 0 = 1)",
      "myComputed2.recompute(myComputed1: 1 + myObservable1: 1 + myObservable2: 0 = 2)",
      "myComputed3.recompute(myComputed2: 2 + myObservable1: 1 + myObservable2: 0 = 3)",
      "myAutorun.run(myComputed3: 3)"
    ]);
    transaction((tx) => {
      myObservable1.set(2, tx);
      myComputed2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed1.recompute(myObservable1: 2 + myObservable2: 0 = 2)",
        "myComputed2.recompute(myComputed1: 2 + myObservable1: 2 + myObservable2: 0 = 4)"
      ]);
      myObservable1.set(3, tx);
      myComputed2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed1.recompute(myObservable1: 3 + myObservable2: 0 = 3)",
        "myComputed2.recompute(myComputed1: 3 + myObservable1: 3 + myObservable2: 0 = 6)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed3.recompute(myComputed2: 6 + myObservable1: 3 + myObservable2: 0 = 9)",
      "myAutorun.run(myComputed3: 9)"
    ]);
  });
  suite("from event", () => {
    function init() {
      const log = new Log();
      let value = 0;
      const eventEmitter = new Emitter();
      let id = 0;
      const observable = observableFromEvent(
        (handler) => {
          const curId = id++;
          log.log(`subscribed handler ${curId}`);
          const disposable = eventEmitter.event(handler);
          return {
            dispose: () => {
              log.log(`unsubscribed handler ${curId}`);
              disposable.dispose();
            }
          };
        },
        () => {
          log.log(`compute value ${value}`);
          return value;
        }
      );
      return {
        log,
        setValue: (newValue) => {
          value = newValue;
          eventEmitter.fire();
        },
        observable
      };
    }
    test("Handle undefined", () => {
      const { log, setValue, observable } = init();
      setValue(void 0);
      const autorunDisposable = autorun((reader) => {
        observable.read(reader);
        log.log(
          `autorun, value: ${observable.read(reader)}`
        );
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 0",
        "compute value undefined",
        "autorun, value: undefined"
      ]);
      setValue(1);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 1",
        "autorun, value: 1"
      ]);
      autorunDisposable.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "unsubscribed handler 0"
      ]);
    });
    test("basic", () => {
      const { log, setValue, observable } = init();
      const shouldReadObservable = observableValue("shouldReadObservable", true);
      const autorunDisposable = autorun((reader) => {
        if (shouldReadObservable.read(reader)) {
          observable.read(reader);
          log.log(
            `autorun, should read: true, value: ${observable.read(reader)}`
          );
        } else {
          log.log(`autorun, should read: false`);
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 0",
        "compute value 0",
        "autorun, should read: true, value: 0"
      ]);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), ["get value: 0"]);
      setValue(1);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 1",
        "autorun, should read: true, value: 1"
      ]);
      shouldReadObservable.set(false, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun, should read: false",
        "unsubscribed handler 0"
      ]);
      shouldReadObservable.set(true, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "subscribed handler 1",
        "compute value 1",
        "autorun, should read: true, value: 1"
      ]);
      autorunDisposable.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "unsubscribed handler 1"
      ]);
    });
    test("get without observers", () => {
      const { log, observable } = init();
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 0",
        "get value: 0"
      ]);
      log.log(`get value: ${observable.get()}`);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "compute value 0",
        "get value: 0"
      ]);
    });
  });
  test("reading derived in transaction unsubscribes unnecessary observables", () => {
    const log = new Log();
    const shouldReadObservable = observableValue("shouldReadMyObs1", true);
    const myObs1 = new LoggingObservableValue("myObs1", 0, log);
    const myComputed = derived((reader) => {
      log.log("myComputed.recompute");
      if (shouldReadObservable.read(reader)) {
        return myObs1.read(reader);
      }
      return 1;
    });
    ds.add(autorun((reader) => {
      const value = myComputed.read(reader);
      log.log(`myAutorun: ${value}`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myComputed.recompute",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myAutorun: 0"
    ]);
    transaction((tx) => {
      myObs1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), ["myObs1.set (value 1)"]);
      shouldReadObservable.set(false, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      myComputed.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myComputed.recompute",
        "myObs1.lastObserverRemoved"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun: 1"]);
  });
  test("avoid recomputation of deriveds that are no longer read", () => {
    const log = new Log();
    const myObsShouldRead = new LoggingObservableValue("myObsShouldRead", true, log);
    const myObs1 = new LoggingObservableValue("myObs1", 0, log);
    const myComputed1 = derived((reader) => {
      const myObs1Val = myObs1.read(reader);
      const result = myObs1Val % 10;
      log.log(`myComputed1(myObs1: ${myObs1Val}): Computed ${result}`);
      return myObs1Val;
    });
    ds.add(autorun((reader) => {
      const shouldRead = myObsShouldRead.read(reader);
      if (shouldRead) {
        const v = myComputed1.read(reader);
        log.log(`myAutorun(shouldRead: true, myComputed1: ${v}): run`);
      } else {
        log.log(`myAutorun(shouldRead: false): run`);
      }
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.firstObserverAdded",
      "myObsShouldRead.get",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myComputed1(myObs1: 0): Computed 0",
      "myAutorun(shouldRead: true, myComputed1: 0): run"
    ]);
    transaction((tx) => {
      myObsShouldRead.set(false, tx);
      myObs1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObsShouldRead.set (value false)",
        "myObs1.set (value 1)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.get",
      "myAutorun(shouldRead: false): run",
      "myObs1.lastObserverRemoved"
    ]);
    transaction((tx) => {
      myObsShouldRead.set(true, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObsShouldRead.set (value true)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObsShouldRead.get",
      "myObs1.firstObserverAdded",
      "myObs1.get",
      "myComputed1(myObs1: 1): Computed 1",
      "myAutorun(shouldRead: true, myComputed1: 1): run"
    ]);
  });
  suite("autorun rerun on neutral change", () => {
    test("autorun reruns on neutral observable double change", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myObservable: ${myObservable.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), ["myAutorun.run(myObservable: 0)"]);
    });
    test("autorun does not rerun on indirect neutral observable double change", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      const myDerived = derived((reader) => {
        const val = myObservable.read(reader);
        log.log(`myDerived.read(myObservable: ${val})`);
        return val;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)"
      ]);
    });
    test("autorun reruns on indirect neutral observable double change when changes propagate", () => {
      const log = new Log();
      const myObservable = observableValue("myObservable", 0);
      const myDerived = derived((reader) => {
        const val = myObservable.read(reader);
        log.log(`myDerived.read(myObservable: ${val})`);
        return val;
      });
      ds.add(autorun((reader) => {
        log.log(`myAutorun.run(myDerived: ${myDerived.read(reader)})`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
      transaction((tx) => {
        myObservable.set(2, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
        myDerived.get();
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myDerived.read(myObservable: 2)"
        ]);
        myObservable.set(0, tx);
        assert.deepStrictEqual(log.getAndClearEntries(), []);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myDerived.read(myObservable: 0)",
        "myAutorun.run(myDerived: 0)"
      ]);
    });
  });
  test("self-disposing autorun", () => {
    const log = new Log();
    const observable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myObservable3 = new LoggingObservableValue("myObservable3", 0, log);
    const d = autorun((reader) => {
      if (observable1.read(reader) >= 2) {
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable1.set (value 2)",
          "myObservable1.get"
        ]);
        myObservable2.read(reader);
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable2.firstObserverAdded",
          "myObservable2.get"
        ]);
        d.dispose();
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable1.lastObserverRemoved",
          "myObservable2.lastObserverRemoved"
        ]);
        myObservable3.read(reader);
        assert.deepStrictEqual(log.getAndClearEntries(), [
          "myObservable3.get"
        ]);
      }
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.firstObserverAdded",
      "myObservable1.get"
    ]);
    observable1.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.set (value 1)",
      "myObservable1.get"
    ]);
    observable1.set(2, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), []);
  });
  test("changing observables in endUpdate", () => {
    const log = new Log();
    const myObservable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myDerived1 = derived((reader) => {
      const val = myObservable1.read(reader);
      log.log(`myDerived1.read(myObservable: ${val})`);
      return val;
    });
    const myDerived2 = derived((reader) => {
      const val = myObservable2.read(reader);
      if (val === 1) {
        myDerived1.read(reader);
      }
      log.log(`myDerived2.read(myObservable: ${val})`);
      return val;
    });
    ds.add(autorun((reader) => {
      const myDerived1Val = myDerived1.read(reader);
      const myDerived2Val = myDerived2.read(reader);
      log.log(`myAutorun.run(myDerived1: ${myDerived1Val}, myDerived2: ${myDerived2Val})`);
    }));
    transaction((tx) => {
      myObservable2.set(1, tx);
      myObservable1.set(1, tx);
    });
  });
  test("set dependency in derived", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myComputed = derived((reader) => {
      let value = myObservable.read(reader);
      const origValue = value;
      log.log(`myComputed(myObservable: ${origValue}): start computing`);
      if (value % 3 !== 0) {
        value++;
        myObservable.set(value, void 0);
      }
      log.log(`myComputed(myObservable: ${origValue}): finished computing`);
      return value;
    });
    ds.add(autorun((reader) => {
      const value = myComputed.read(reader);
      log.log(`myAutorun(myComputed: ${value})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myComputed(myObservable: 0): start computing",
      "myComputed(myObservable: 0): finished computing",
      "myAutorun(myComputed: 0)"
    ]);
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.set (value 1)",
      "myObservable.get",
      "myComputed(myObservable: 1): start computing",
      "myObservable.set (value 2)",
      "myComputed(myObservable: 1): finished computing",
      "myObservable.get",
      "myComputed(myObservable: 2): start computing",
      "myObservable.set (value 3)",
      "myComputed(myObservable: 2): finished computing",
      "myObservable.get",
      "myComputed(myObservable: 3): start computing",
      "myComputed(myObservable: 3): finished computing",
      "myAutorun(myComputed: 3)"
    ]);
  });
  test("set dependency in autorun", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    ds.add(autorun((reader) => {
      const value = myObservable.read(reader);
      log.log(`myAutorun(myObservable: ${value}): start`);
      if (value !== 0 && value < 4) {
        myObservable.set(value + 1, void 0);
      }
      log.log(`myAutorun(myObservable: ${value}): end`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myAutorun(myObservable: 0): start",
      "myAutorun(myObservable: 0): end"
    ]);
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.set (value 1)",
      "myObservable.get",
      "myAutorun(myObservable: 1): start",
      "myObservable.set (value 2)",
      "myAutorun(myObservable: 1): end",
      "myObservable.get",
      "myAutorun(myObservable: 2): start",
      "myObservable.set (value 3)",
      "myAutorun(myObservable: 2): end",
      "myObservable.get",
      "myAutorun(myObservable: 3): start",
      "myObservable.set (value 4)",
      "myAutorun(myObservable: 3): end",
      "myObservable.get",
      "myAutorun(myObservable: 4): start",
      "myAutorun(myObservable: 4): end"
    ]);
  });
  test("get in transaction between sets", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myDerived1 = derived((reader) => {
      const value = myObservable.read(reader);
      log.log(`myDerived1(myObservable: ${value}): start computing`);
      return value;
    });
    const myDerived2 = derived((reader) => {
      const value = myDerived1.read(reader);
      log.log(`myDerived2(myDerived1: ${value}): start computing`);
      return value;
    });
    ds.add(autorun((reader) => {
      const value = myDerived2.read(reader);
      log.log(`myAutorun(myDerived2: ${value})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myDerived1(myObservable: 0): start computing",
      "myDerived2(myDerived1: 0): start computing",
      "myAutorun(myDerived2: 0)"
    ]);
    transaction((tx) => {
      myObservable.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)"
      ]);
      myDerived2.get();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.get",
        "myDerived1(myObservable: 1): start computing",
        "myDerived2(myDerived1: 1): start computing"
      ]);
      myObservable.set(2, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 2)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.get",
      "myDerived1(myObservable: 2): start computing",
      "myDerived2(myDerived1: 2): start computing",
      "myAutorun(myDerived2: 2)"
    ]);
  });
  test("bug: Dont reset states", () => {
    const log = new Log();
    const myObservable1 = new LoggingObservableValue("myObservable1", 0, log);
    const myObservable2 = new LoggingObservableValue("myObservable2", 0, log);
    const myDerived2 = derived((reader) => {
      const val = myObservable2.read(reader);
      log.log(`myDerived2.computed(myObservable2: ${val})`);
      return val % 10;
    });
    const myDerived3 = derived((reader) => {
      const val1 = myObservable1.read(reader);
      const val2 = myDerived2.read(reader);
      log.log(`myDerived3.computed(myDerived1: ${val1}, myDerived2: ${val2})`);
      return `${val1} + ${val2}`;
    });
    ds.add(autorun((reader) => {
      const val = myDerived3.read(reader);
      log.log(`myAutorun(myDerived3: ${val})`);
    }));
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.firstObserverAdded",
      "myObservable1.get",
      "myObservable2.firstObserverAdded",
      "myObservable2.get",
      "myDerived2.computed(myObservable2: 0)",
      "myDerived3.computed(myDerived1: 0, myDerived2: 0)",
      "myAutorun(myDerived3: 0 + 0)"
    ]);
    transaction((tx) => {
      myObservable1.set(1, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable1.set (value 1)"
      ]);
      myObservable2.set(10, tx);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable2.set (value 10)"
      ]);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable1.get",
      "myObservable2.get",
      "myDerived2.computed(myObservable2: 10)",
      "myDerived3.computed(myDerived1: 1, myDerived2: 0)",
      "myAutorun(myDerived3: 1 + 0)"
    ]);
  });
  test("bug: Add observable in endUpdate", () => {
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const myDerived1 = derived((reader) => {
      return myObservable1.read(reader);
    });
    const myDerived2 = derived((reader) => {
      return myObservable2.read(reader);
    });
    const myDerivedA1 = derived((reader) => {
      const d1 = myDerived1.read(reader);
      if (d1 === 1) {
        myDerived2.read(reader);
      }
    });
    ds.add(autorun((reader) => {
      myDerivedA1.read(reader);
    }));
    ds.add(autorun((reader) => {
      myDerived2.read(reader);
    }));
    transaction((tx) => {
      myObservable1.set(1, tx);
      myObservable2.set(1, tx);
    });
  });
  test("bug: fromObservableLight doesnt subscribe", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const myDerived = derived((reader) => {
      const val = myObservable.read(reader);
      log.log(`myDerived.computed(myObservable2: ${val})`);
      return val % 10;
    });
    const e = Event.fromObservableLight(myDerived);
    log.log("event created");
    e(() => {
      log.log("event fired");
    });
    myObservable.set(1, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "event created",
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myDerived.computed(myObservable2: 0)",
      "myObservable.set (value 1)",
      "myObservable.get",
      "myDerived.computed(myObservable2: 1)",
      "event fired"
    ]);
  });
  test("bug: Event.fromObservable always should get events", () => {
    const emitter = new Emitter();
    const log = new Log();
    let i = 0;
    const obs = observableFromEvent(emitter.event, () => i);
    i++;
    emitter.fire(1);
    const evt2 = Event.fromObservable(obs);
    const d = evt2((e) => {
      log.log(`event fired ${e}`);
    });
    i++;
    emitter.fire(2);
    assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 2"]);
    i++;
    emitter.fire(3);
    assert.deepStrictEqual(log.getAndClearEntries(), ["event fired 3"]);
    d.dispose();
  });
  test("dont run autorun after dispose", () => {
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    const d = autorun((reader) => {
      const v = myObservable.read(reader);
      log.log("autorun, myObservable:" + v);
    });
    transaction((tx) => {
      myObservable.set(1, tx);
      d.dispose();
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "autorun, myObservable:0",
      "myObservable.set (value 1)",
      "myObservable.lastObserverRemoved"
    ]);
  });
  suite("waitForState", () => {
    test("resolve", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "initializing" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set({ state: "ready" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'resolved {"state":"ready"}'
      ]);
    });
    test("resolveImmediate", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "ready" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      myObservable.set({ state: "error" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'resolved {"state":"ready"}'
      ]);
    });
    test("reject", async () => {
      const log = new Log();
      const myObservable = new LoggingObservableValue("myObservable", { state: "initializing" }, log);
      const p = waitForState(myObservable, (p2) => p2.state === "ready", (p2) => p2.state === "error").then((r) => {
        log.log(`resolved ${JSON.stringify(r)}`);
      }, (err) => {
        log.log(`rejected ${JSON.stringify(err)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set({ state: "error" }, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value [object Object])",
        "myObservable.get",
        "myObservable.lastObserverRemoved"
      ]);
      await p;
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'rejected {"state":"error"}'
      ]);
    });
    test("derived as lazy", () => {
      const store = new DisposableStore();
      const log = new Log();
      let i = 0;
      const d = derivedDisposable(() => {
        const id = i++;
        log.log("myDerived " + id);
        return {
          dispose: () => log.log(`disposed ${id}`)
        };
      });
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 0", "disposed 0"]);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 1", "disposed 1"]);
      d.keepObserved(store);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), ["myDerived 2"]);
      d.get();
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      store.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), ["disposed 2"]);
    });
  });
  test("observableValue", () => {
    const log = new Log();
    const myObservable1 = observableValue("myObservable1", 0);
    const myObservable2 = observableValue("myObservable2", 0);
    const d = autorun((reader) => {
      const v1 = myObservable1.read(reader);
      const v2 = myObservable2.read(reader);
      log.log("autorun, myObservable1:" + v1 + ", myObservable2:" + v2);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "autorun, myObservable1:0, myObservable2:0"
    ]);
    myObservable1.set(0, void 0);
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    myObservable2.set(0, void 0, { message: "change1" });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "autorun, myObservable1:0, myObservable2:0"
    ]);
    d.dispose();
  });
  suite("autorun error handling", () => {
    test("immediate throw", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(`error: ${e.message}`);
      });
      const myObservable = new LoggingObservableValue("myObservable", 0, log);
      const d = autorun((reader) => {
        myObservable.read(reader);
        throw new Error("foobar");
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get",
        "error: foobar"
      ]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)",
        "myObservable.get",
        "error: foobar"
      ]);
      d.dispose();
    });
    test("late throw", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(`error: ${e.message}`);
      });
      const myObservable = new LoggingObservableValue("myObservable", 0, log);
      const d = autorun((reader) => {
        const value = myObservable.read(reader);
        if (value >= 1) {
          throw new Error("foobar");
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.firstObserverAdded",
        "myObservable.get"
      ]);
      myObservable.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 1)",
        "myObservable.get",
        "error: foobar"
      ]);
      myObservable.set(2, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "myObservable.set (value 2)",
        "myObservable.get",
        "error: foobar"
      ]);
      d.dispose();
    });
  });
  test("recomputeInitiallyAndOnChange should work when a dependency sets an observable", () => {
    const store = new DisposableStore();
    const log = new Log();
    const myObservable = new LoggingObservableValue("myObservable", 0, log);
    let shouldUpdate = true;
    const myDerived = derived((reader) => {
      log.log("myDerived.computed start");
      const val = myObservable.read(reader);
      if (shouldUpdate) {
        shouldUpdate = false;
        myObservable.set(1, void 0);
      }
      log.log("myDerived.computed end");
      return val;
    });
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    myDerived.recomputeInitiallyAndOnChange(store, (val) => {
      log.log(`recomputeInitiallyAndOnChange, myDerived: ${val}`);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      "myDerived.computed start",
      "myObservable.firstObserverAdded",
      "myObservable.get",
      "myObservable.set (value 1)",
      "myDerived.computed end",
      "myDerived.computed start",
      "myObservable.get",
      "myDerived.computed end",
      "recomputeInitiallyAndOnChange, myDerived: 1"
    ]);
    myDerived.get();
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    store.dispose();
  });
  suite("prevent invalid usage", () => {
    suite("reading outside of compute function", () => {
      test("derived", () => {
        let fn = () => {
        };
        const obs = observableValue("obs", 0);
        const d = derived((reader) => {
          fn = () => {
            obs.read(reader);
          };
          return obs.read(reader);
        });
        const disp = autorun((reader) => {
          d.read(reader);
        });
        assert.throws(() => {
          fn();
        });
        disp.dispose();
      });
      test("autorun", () => {
        let fn = () => {
        };
        const obs = observableValue("obs", 0);
        const disp = autorun((reader) => {
          fn = () => {
            obs.read(reader);
          };
          obs.read(reader);
        });
        assert.throws(() => {
          fn();
        });
        disp.dispose();
      });
    });
    test.skip("catches cyclic dependencies", () => {
      const log = new Log();
      setUnexpectedErrorHandler((e) => {
        log.log(e.toString());
      });
      const obs = observableValue("obs", 0);
      const d1 = derived((reader) => {
        log.log("d1.computed start");
        const x = obs.read(reader) + d2.read(reader);
        log.log("d1.computed end");
        return x;
      });
      const d2 = derived((reader) => {
        log.log("d2.computed start");
        d1.read(reader);
        log.log("d2.computed end");
        return 0;
      });
      const disp = autorun((reader) => {
        log.log("autorun start");
        d1.read(reader);
        log.log("autorun end");
        return 0;
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun start",
        "d1.computed start",
        "d2.computed start",
        "Error: Cyclic deriveds are not supported yet!",
        "d1.computed end",
        "autorun end"
      ]);
      disp.dispose();
    });
  });
  suite("observableReducer", () => {
    test("main", () => {
      const store = new DisposableStore();
      const log = new Log();
      const myObservable1 = observableValue("myObservable1", 5);
      const myObservable2 = observableValue("myObservable2", 9);
      const sum = observableReducer(void 0, {
        initial: () => {
          log.log("createInitial");
          return myObservable1.get() + myObservable2.get();
        },
        disposeFinal: (values) => {
          log.log(`disposeFinal ${values}`);
        },
        changeTracker: recordChanges({ myObservable1, myObservable2 }),
        update: (reader, previousValue, changes) => {
          log.log(`update ${JSON.stringify(changes)}`);
          let delta = 0;
          for (const change of changes.changes) {
            delta += change.change;
          }
          reader.reportChange(delta);
          const resultValue = previousValue + delta;
          log.log(`update -> ${resultValue}`);
          return resultValue;
        }
      });
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      store.add(autorunWithStoreHandleChanges({
        changeTracker: recordChanges({ sum })
      }, (_reader, changes) => {
        log.log(`autorun ${JSON.stringify(changes)}`);
      }));
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "createInitial",
        'update {"changes":[],"myObservable1":5,"myObservable2":9}',
        "update -> 14",
        'autorun {"changes":[],"sum":14}'
      ]);
      transaction((tx) => {
        myObservable1.set(myObservable1.get() + 1, tx, 1);
        myObservable2.set(myObservable2.get() + 3, tx, 3);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'update {"changes":[{"key":"myObservable1","change":1},{"key":"myObservable2","change":3}],"myObservable1":6,"myObservable2":12}',
        "update -> 18",
        'autorun {"changes":[{"key":"sum","change":4}],"sum":18}'
      ]);
      transaction((tx) => {
        myObservable1.set(myObservable1.get() + 1, tx, 1);
        const s = sum.get();
        log.log(`sum.get() ${s}`);
        myObservable2.set(myObservable2.get() + 3, tx, 3);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        'update {"changes":[{"key":"myObservable1","change":1}],"myObservable1":7,"myObservable2":12}',
        "update -> 19",
        "sum.get() 19",
        'update {"changes":[{"key":"myObservable2","change":3}],"myObservable1":7,"myObservable2":15}',
        "update -> 22",
        'autorun {"changes":[{"key":"sum","change":1}],"sum":22}'
      ]);
      store.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "disposeFinal 22"
      ]);
    });
  });
  suite("disposableStores", () => {
    test("derived with store", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value = observable1.read(reader);
        log.log(`computed ${value}`);
        reader.store.add(toDisposable(() => {
          log.log(`computed1: ${value} disposed`);
        }));
        return value;
      });
      const a = autorun((reader) => {
        log.log(`a: ${computed1.read(reader)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 0",
        "a: 0"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 0 disposed",
        "computed 1",
        "a: 1"
      ]);
      a.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 1 disposed"
      ]);
    });
    test("derived with delayedStore", () => {
      const log = new Log();
      const observable1 = observableValue("myObservableValue1", 0);
      const computed1 = derived((reader) => {
        const value = observable1.read(reader);
        log.log(`computed ${value}`);
        reader.delayedStore.add(toDisposable(() => {
          log.log(`computed1: ${value} disposed`);
        }));
        return value;
      });
      const a = autorun((reader) => {
        log.log(`a: ${computed1.read(reader)}`);
      });
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 0",
        "a: 0"
      ]);
      observable1.set(1, void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed 1",
        "computed1: 0 disposed",
        "a: 1"
      ]);
      a.dispose();
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "computed1: 1 disposed"
      ]);
    });
  });
  test("derivedHandleChanges with reportChanges", () => {
    const log = new Log();
    const signal1 = observableSignal("signal1");
    const signal2 = observableSignal("signal2");
    const signal2Derived = derivedHandleChanges(
      { changeTracker: recordChanges({ signal2 }) },
      (reader, changeSummary) => {
        for (const c of changeSummary.changes) {
          reader.reportChange({ message: c.change.message + " (derived)" });
        }
      }
    );
    const d = derivedHandleChanges({
      changeTracker: recordChanges({ signal1, signal2Derived })
    }, (r, changes) => {
      const log2 = changes.changes.map((c) => `${c.key}: ${c.change.message}`).join(", ");
      r.reportChange(log2);
    });
    const disp = runOnChange(d, (_val, _prev, changes) => {
      log.log(`runOnChange ${JSON.stringify(changes)}`);
    });
    assert.deepStrictEqual(log.getAndClearEntries(), []);
    transaction((tx) => {
      signal1.trigger(tx, { message: "foo" });
      signal2.trigger(tx, { message: "bar" });
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'runOnChange ["signal1: foo, signal2Derived: bar (derived)"]'
    ]);
    transaction((tx) => {
      signal2.trigger(tx, { message: "baz" });
    });
    assert.deepStrictEqual(log.getAndClearEntries(), [
      'runOnChange ["signal2Derived: baz (derived)"]'
    ]);
    disp.dispose();
  });
  suite("autorunPerKeyedItem", () => {
    test("runs setup once per key, fires per-key observable on in-place value change, disposes on removal", () => {
      const log = new Log();
      const items = observableValue("items", []);
      const d = ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (key, value, store) => {
          log.log(`setup(${key})`);
          store.add(toDisposable(() => log.log(`dispose(${key})`)));
          store.add(autorun((reader) => {
            const v = value.read(reader);
            log.log(`autorun(${key}): v=${v.v}`);
          }));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      items.set([{ id: "a", v: 1 }, { id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "setup(a)",
        "autorun(a): v=1",
        "setup(b)",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "a", v: 2 }, { id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun(a): v=2",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "b", v: 1 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "dispose(a)",
        "autorun(b): v=1"
      ]);
      items.set([{ id: "b", v: 1 }, { id: "a", v: 9 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), [
        "autorun(b): v=1",
        "setup(a)",
        "autorun(a): v=9"
      ]);
      d.dispose();
      assert.deepStrictEqual(log.getAndClearEntries().sort(), [
        "dispose(a)",
        "dispose(b)"
      ]);
    });
    test("batches per-key value updates atomically across one items change", () => {
      const log = new Log();
      const items = observableValue("items", [
        { id: "a", v: 0 },
        { id: "b", v: 0 }
      ]);
      ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (key, value, store) => {
          store.add(autorun((reader) => {
            log.log(`${key}=${value.read(reader).v}`);
          }));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), ["a=0", "b=0"]);
      items.set([{ id: "a", v: 1 }, { id: "b", v: 2 }], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), ["a=1", "b=2"]);
    });
    test("does not fire per-key observable when same item identity is reused", () => {
      const log = new Log();
      const a = { id: "a", v: 1 };
      const items = observableValue("items", [a]);
      ds.add(autorunPerKeyedItem(
        items,
        (it) => it.id,
        (_key, value, store) => {
          store.add(autorun((reader) => log.log(`v=${value.read(reader).v}`)));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), ["v=1"]);
      items.set([a], void 0);
      assert.deepStrictEqual(log.getAndClearEntries(), []);
    });
    test("per-key setup fires when items derived through observableFromEvent chain updates", () => {
      const log = new Log();
      let current = void 0;
      const onChange = ds.add(new Emitter());
      const fakeSub = { value: void 0, onDidChange: onChange.event };
      const sessionState$ = observableFromEvent(void 0, fakeSub.onDidChange, () => fakeSub.value);
      const fire = (s) => {
        current = s;
        fakeSub.value = s;
        onChange.fire(s);
      };
      const turn$ = derived((reader) => sessionState$.read(reader)?.active);
      const parts$ = derived((reader) => turn$.read(reader)?.parts ?? []);
      ds.add(autorunPerKeyedItem(
        parts$,
        (p) => p.id,
        (key, p$, store) => {
          log.log(`setup(${key})`);
          store.add(autorun((reader) => log.log(`${key}=${p$.read(reader).content.length}`)));
        }
      ));
      assert.deepStrictEqual(log.getAndClearEntries(), []);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["setup(p1)", "p1=5"]);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello world" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["p1=11"]);
      fire({ active: { id: "t1", parts: [{ id: "p1", content: "hello world" }, { id: "p2", content: "reasoning" }] } });
      assert.deepStrictEqual(log.getAndClearEntries(), ["p1=11", "setup(p2)", "p2=9"]);
      void current;
    });
  });
});
class LoggingObserver {
  constructor(debugName, log) {
    this.debugName = debugName;
    this.log = log;
    this.count = 0;
  }
  beginUpdate(observable) {
    this.count++;
    this.log.log(`${this.debugName}.beginUpdate (count ${this.count})`);
  }
  endUpdate(observable) {
    this.log.log(`${this.debugName}.endUpdate (count ${this.count})`);
    this.count--;
  }
  handleChange(observable, change) {
    this.log.log(`${this.debugName}.handleChange (count ${this.count})`);
  }
  handlePossibleChange(observable) {
    this.log.log(`${this.debugName}.handlePossibleChange`);
  }
}
class LoggingObservableValue extends BaseObservable {
  constructor(debugName, initialValue, logger) {
    super(DebugLocation.ofCaller());
    this.debugName = debugName;
    this.logger = logger;
    this.value = initialValue;
  }
  onFirstObserverAdded() {
    this.logger.log(`${this.debugName}.firstObserverAdded`);
  }
  onLastObserverRemoved() {
    this.logger.log(`${this.debugName}.lastObserverRemoved`);
  }
  get() {
    this.logger.log(`${this.debugName}.get`);
    return this.value;
  }
  set(value, tx, change) {
    if (this.value === value) {
      return;
    }
    if (!tx) {
      transaction((tx2) => {
        this.set(value, tx2, change);
      }, () => `Setting ${this.debugName}`);
      return;
    }
    this.logger.log(`${this.debugName}.set (value ${value})`);
    this.value = value;
    for (const observer of this._observers) {
      tx.updateObserver(observer, this);
      observer.handleChange(this, change);
    }
  }
  toString() {
    return `${this.debugName}: ${this.value}`;
  }
}
class Log {
  constructor() {
    this.entries = [];
  }
  log(message) {
    this.entries.push(message);
  }
  getAndClearEntries() {
    const entries = [...this.entries];
    this.entries.length = 0;
    return entries;
  }
}
export {
  LoggingObservableValue,
  LoggingObserver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEZXJpdmVkUmVhZGVyLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIGF1dG9ydW4sIGF1dG9ydW5IYW5kbGVDaGFuZ2VzLCBhdXRvcnVuUGVyS2V5ZWRJdGVtLCBhdXRvcnVuV2l0aFN0b3JlSGFuZGxlQ2hhbmdlcywgZGVyaXZlZCwgZGVyaXZlZERpc3Bvc2FibGUsIElPYnNlcnZhYmxlLCBJT2JzZXJ2ZXIsIElTZXR0YWJsZU9ic2VydmFibGUsIElUcmFuc2FjdGlvbiwga2VlcE9ic2VydmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsLCBvYnNlcnZhYmxlVmFsdWUsIHJlY29yZENoYW5nZXMsIHRyYW5zYWN0aW9uLCB3YWl0Rm9yU3RhdGUsIGRlcml2ZWRIYW5kbGVDaGFuZ2VzLCBydW5PbkNoYW5nZSwgRGVidWdMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uL3V0aWxzLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRlZXAtaW1wb3J0LW9mLWludGVybmFsXG5pbXBvcnQgeyBvYnNlcnZhYmxlUmVkdWNlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vYnNlcnZhYmxlSW50ZXJuYWwvZXhwZXJpbWVudGFsL3JlZHVjZXIuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGVlcC1pbXBvcnQtb2YtaW50ZXJuYWxcbmltcG9ydCB7IEJhc2VPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9vYnNlcnZhYmxlcy9iYXNlT2JzZXJ2YWJsZS5qcyc7XG5cbnN1aXRlKCdvYnNlcnZhYmxlcycsICgpID0+IHtcblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogUmVhZHMgdGhlc2UgdGVzdHMgdG8gdW5kZXJzdGFuZCBob3cgdG8gdXNlIG9ic2VydmFibGVzLlxuXHQgKi9cblx0c3VpdGUoJ3R1dG9yaWFsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ29ic2VydmFibGUgKyBhdXRvcnVuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Ly8gVGhpcyBjcmVhdGVzIGEgdmFyaWFibGUgdGhhdCBzdG9yZXMgYSB2YWx1ZSBhbmQgd2hvc2UgdmFsdWUgY2hhbmdlcyBjYW4gYmUgb2JzZXJ2ZWQuXG5cdFx0XHQvLyBUaGUgbmFtZSBpcyBvbmx5IHVzZWQgZm9yIGRlYnVnZ2luZyBwdXJwb3Nlcy5cblx0XHRcdC8vIFRoZSBzZWNvbmQgYXJnIGlzIHRoZSBpbml0aWFsIHZhbHVlLlxuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwKTtcblxuXHRcdFx0Ly8gVGhpcyBjcmVhdGVzIGFuIGF1dG9ydW46IEl0IHJ1bnMgaW1tZWRpYXRlbHkgYW5kIHRoZW4gYWdhaW4gd2hlbmV2ZXIgYW55IG9mIHRoZVxuXHRcdFx0Ly8gZGVwZW5kZW5jaWVzIGNoYW5nZS4gRGVwZW5kZW5jaWVzIGFyZSB0cmFja2VkIGJ5IHJlYWRpbmcgb2JzZXJ2YWJsZXMgd2l0aCB0aGUgYHJlYWRlcmAgcGFyYW1ldGVyLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFRoZSBAZGVzY3JpcHRpb24gaXMgb25seSB1c2VkIGZvciBkZWJ1Z2dpbmcgcHVycG9zZXMuXG5cdFx0XHQvLyBUaGUgYXV0b3J1biBoYXMgdG8gYmUgZGlzcG9zZWQhIFRoaXMgaXMgdmVyeSBpbXBvcnRhbnQuXG5cdFx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXG5cdFx0XHRcdC8vIFRoaXMgY29kZSBpcyBydW4gaW1tZWRpYXRlbHkuXG5cblx0XHRcdFx0Ly8gVXNlIHRoZSBgcmVhZGVyYCB0byByZWFkIG9ic2VydmFibGUgdmFsdWVzIGFuZCB0cmFjayB0aGUgZGVwZW5kZW5jeSB0byB0aGVtLlxuXHRcdFx0XHQvLyBJZiB5b3UgdXNlIGBvYnNlcnZhYmxlLmdldCgpYCBpbnN0ZWFkIG9mIGBvYnNlcnZhYmxlLnJlYWQocmVhZGVyKWAsIHlvdSB3aWxsIGp1c3Rcblx0XHRcdFx0Ly8gZ2V0IHRoZSB2YWx1ZSBhbmQgbm90IHN1YnNjcmliZSB0byBpdC5cblx0XHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6ICR7bXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKX0pYCk7XG5cblx0XHRcdFx0Ly8gTm93IHRoYXQgYWxsIGRlcGVuZGVuY2llcyBhcmUgdHJhY2tlZCwgdGhlIGF1dG9ydW4gaXMgcmUtcnVuIHdoZW5ldmVyIGFueSBvZiB0aGVcblx0XHRcdFx0Ly8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cblx0XHRcdH0pKTtcblx0XHRcdC8vIFRoZSBhdXRvcnVuIHJ1bnMgaW1tZWRpYXRlbHlcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ215QXV0b3J1bi5ydW4obXlPYnNlcnZhYmxlOiAwKSddKTtcblxuXHRcdFx0Ly8gV2Ugc2V0IHRoZSBvYnNlcnZhYmxlLlxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gLT4gVGhlIGF1dG9ydW4gcnVucyBhZ2FpbiB3aGVuIGFueSByZWFkIG9ic2VydmFibGUgY2hhbmdlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6IDEpJ10pO1xuXG5cdFx0XHQvLyBXZSBzZXQgdGhlIG9ic2VydmFibGUgYWdhaW4uXG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyAtPiBUaGUgYXV0b3J1biBkb2VzIG5vdCBydW4gYWdhaW4sIGJlY2F1c2UgdGhlIG9ic2VydmFibGUgZGlkbid0IGNoYW5nZS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdC8vIFRyYW5zYWN0aW9ucyBiYXRjaCBhdXRvcnVuIHJ1bnNcblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDIsIHR4KTtcblx0XHRcdFx0Ly8gTm8gYXV0by1ydW4gcmFuIHlldCwgZXZlbiB0aG91Z2ggdGhlIHZhbHVlIGNoYW5nZWQhXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdFx0bXlPYnNlcnZhYmxlLnNldCgzLCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIE9ubHkgYXQgdGhlIGVuZCBvZiB0aGUgdHJhbnNhY3Rpb24gdGhlIGF1dG9ydW4gcmUtcnVuc1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6IDMpJ10pO1xuXG5cdFx0XHQvLyBOb3RlIHRoYXQgdGhlIGF1dG9ydW4gZGlkIG5vdCBzZWUgdGhlIGludGVybWVkaWF0ZSB2YWx1ZSBgMmAhXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXJpdmVkICsgYXV0b3J1bicsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUxJywgMCk7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlMiA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMicsIDApO1xuXG5cdFx0XHQvLyBBIGRlcml2ZWQgdmFsdWUgaXMgYW4gb2JzZXJ2YWJsZSB0aGF0IGlzIGRlcml2ZWQgZnJvbSBvdGhlciBvYnNlcnZhYmxlcy5cblx0XHRcdGNvbnN0IG15RGVyaXZlZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQgKi9cblx0XHRcdFx0Y29uc3QgdmFsdWUxID0gb2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpOyAvLyBVc2UgdGhlIHJlYWRlciB0byB0cmFjayBkZXBlbmRlbmNpZXMuXG5cdFx0XHRcdGNvbnN0IHZhbHVlMiA9IG9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3Qgc3VtID0gdmFsdWUxICsgdmFsdWUyO1xuXHRcdFx0XHRsb2cubG9nKGBteURlcml2ZWQucmVjb21wdXRlOiAke3ZhbHVlMX0gKyAke3ZhbHVlMn0gPSAke3N1bX1gKTtcblx0XHRcdFx0cmV0dXJuIHN1bTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBXZSBjcmVhdGUgYW4gYXV0b3J1biB0aGF0IHJlYWN0cyBvbiBjaGFuZ2VzIHRvIG91ciBkZXJpdmVkIHZhbHVlLlxuXHRcdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdFx0Ly8gQXV0b3J1bnMgd29yayB3aXRoIG9ic2VydmFibGUgdmFsdWVzIGFuZCBkZXJpdmVkcyAtIGluIHNob3J0LCB0aGV5IHdvcmsgd2l0aCBhbnkgb2JzZXJ2YWJsZS5cblx0XHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKG15RGVyaXZlZDogJHtteURlcml2ZWQucmVhZChyZWFkZXIpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdC8vIGF1dG9ydW4gcnVucyBpbW1lZGlhdGVseVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWNvbXB1dGU6IDAgKyAwID0gMCcsXG5cdFx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkOiAwKScsXG5cdFx0XHRdKTtcblxuXHRcdFx0b2JzZXJ2YWJsZTEuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBhbmQgb24gY2hhbmdlcy4uLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWNvbXB1dGU6IDEgKyAwID0gMScsXG5cdFx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkOiAxKScsXG5cdFx0XHRdKTtcblxuXHRcdFx0b2JzZXJ2YWJsZTIuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyAuLi4gb2YgYW55IGRlcGVuZGVuY3kuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlY29tcHV0ZTogMSArIDEgPSAyJyxcblx0XHRcdFx0J215QXV0b3J1bihteURlcml2ZWQ6IDIpJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBOb3cgd2UgY2hhbmdlIG11bHRpcGxlIG9ic2VydmFibGVzIGluIGEgdHJhbnNhY3Rpb24gdG8gYmF0Y2ggcHJvY2VzcyB0aGUgZWZmZWN0cy5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRvYnNlcnZhYmxlMS5zZXQoNSwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRcdG9ic2VydmFibGUyLnNldCg1LCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIFdoZW4gY2hhbmdpbmcgbXVsdGlwbGUgb2JzZXJ2YWJsZXMgaW4gYSB0cmFuc2FjdGlvbixcblx0XHRcdC8vIGRlcml2ZWRzIGFyZSBvbmx5IHJlY29tcHV0ZWQgb24gZGVtYW5kLlxuXHRcdFx0Ly8gKE5vdGUgdGhhdCB5b3UgY2Fubm90IHNlZSB0aGUgaW50ZXJtZWRpYXRlIHZhbHVlIHdoZW4gYG9iczEgPT0gNWAgYW5kIGBvYnMyID09IDFgKVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWNvbXB1dGU6IDUgKyA1ID0gMTAnLFxuXHRcdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDogMTApJyxcblx0XHRcdF0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdFx0b2JzZXJ2YWJsZTEuc2V0KDYsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0XHRvYnNlcnZhYmxlMi5zZXQoNCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBOb3cgdGhlIGF1dG9ydW4gZGlkbid0IHJ1biBhZ2FpbiwgYmVjYXVzZSBpdHMgZGVwZW5kZW5jeSBjaGFuZ2VkIGZyb20gMTAgdG8gMTAgKD0gbm8gY2hhbmdlKS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoWydteURlcml2ZWQucmVjb21wdXRlOiA2ICsgNCA9IDEwJ10pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWQgZHVyaW5nIHRyYW5zYWN0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZTEgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUyID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUyJywgMCk7XG5cblx0XHRcdGNvbnN0IG15RGVyaXZlZCA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZCAqL1xuXHRcdFx0XHRjb25zdCB2YWx1ZTEgPSBvYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHZhbHVlMiA9IG9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3Qgc3VtID0gdmFsdWUxICsgdmFsdWUyO1xuXHRcdFx0XHRsb2cubG9nKGBteURlcml2ZWQucmVjb21wdXRlOiAke3ZhbHVlMX0gKyAke3ZhbHVlMn0gPSAke3N1bX1gKTtcblx0XHRcdFx0cmV0dXJuIHN1bTtcblx0XHRcdH0pO1xuXG5cdFx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4obXlEZXJpdmVkOiAke215RGVyaXZlZC5yZWFkKHJlYWRlcil9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gYXV0b3J1biBydW5zIGltbWVkaWF0ZWx5XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlY29tcHV0ZTogMCArIDAgPSAwJyxcblx0XHRcdFx0J215QXV0b3J1bihteURlcml2ZWQ6IDApJyxcblx0XHRcdF0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdFx0b2JzZXJ2YWJsZTEuc2V0KC0xMCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRcdG15RGVyaXZlZC5nZXQoKTsgLy8gVGhpcyBmb3JjZXMgYSAoc3luYykgcmVjb21wdXRhdGlvbiBvZiB0aGUgY3VycmVudCB2YWx1ZSFcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbJ215RGVyaXZlZC5yZWNvbXB1dGU6IC0xMCArIDAgPSAtMTAnXSkpO1xuXHRcdFx0XHQvLyBUaGlzIG1lYW5zLCB0aGF0IGV2ZW4gaW4gdHJhbnNhY3Rpb25zIHlvdSBjYW4gYXNzdW1lIHRoYXQgYWxsIHZhbHVlcyB5b3UgY2FuIHJlYWQgd2l0aCBgZ2V0YCBhbmQgYHJlYWRgIGFyZSB1cC10by1kYXRlLlxuXHRcdFx0XHQvLyBSZWFkIHRoZXNlIHZhbHVlcyBqdXN0IG1pZ2h0IGNhdXNlIGFkZGl0aW9uYWwgKHBvdGVudGlhbGx5IHVubmVlZGVkKSByZWNvbXB1dGF0aW9ucy5cblxuXHRcdFx0XHRvYnNlcnZhYmxlMi5zZXQoMTAsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0Ly8gVGhpcyBhdXRvcnVuIHJ1bnMgYWdhaW4sIGJlY2F1c2UgaXRzIGRlcGVuZGVuY3kgY2hhbmdlZCBmcm9tIDAgdG8gLTEwIGFuZCB0aGVuIGJhY2sgdG8gMC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteURlcml2ZWQucmVjb21wdXRlOiAtMTAgKyAxMCA9IDAnLFxuXHRcdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDogMCknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXQgd2l0aG91dCBvYnNlcnZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlVmFsdWUxJywgMCk7XG5cblx0XHRcdC8vIFdlIHNldCB1cCBzb21lIGNvbXB1dGVkcy5cblx0XHRcdGNvbnN0IGNvbXB1dGVkMSA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbXB1dGVkICovXG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IG9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdmFsdWUxICUgMztcblx0XHRcdFx0bG9nLmxvZyhgcmVjb21wdXRlMTogJHt2YWx1ZTF9ICUgMyA9ICR7cmVzdWx0fWApO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjb21wdXRlZDIgPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBjb21wdXRlZCAqL1xuXHRcdFx0XHRjb25zdCB2YWx1ZTEgPSBjb21wdXRlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZTEgKiAyO1xuXHRcdFx0XHRsb2cubG9nKGByZWNvbXB1dGUyOiAke3ZhbHVlMX0gKiAyID0gJHtyZXN1bHR9YCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGNvbXB1dGVkMyA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGNvbXB1dGVkICovXG5cdFx0XHRcdGNvbnN0IHZhbHVlMSA9IGNvbXB1dGVkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHZhbHVlMSAqIDM7XG5cdFx0XHRcdGxvZy5sb2coYHJlY29tcHV0ZTM6ICR7dmFsdWUxfSAqIDMgPSAke3Jlc3VsdH1gKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY29tcHV0ZWRTdW0gPSBkZXJpdmVkKChyZWFkZXIpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBjb21wdXRlZCAqL1xuXHRcdFx0XHRjb25zdCB2YWx1ZTEgPSBjb21wdXRlZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZTIgPSBjb21wdXRlZDMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZTEgKyB2YWx1ZTI7XG5cdFx0XHRcdGxvZy5sb2coYHJlY29tcHV0ZTQ6ICR7dmFsdWUxfSArICR7dmFsdWUyfSA9ICR7cmVzdWx0fWApO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRvYnNlcnZhYmxlMS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdC8vIEFuZCBub3cgcmVhZCB0aGUgY29tcHV0ZWQgdGhhdCBkZXBlbmRlbnMgb24gYWxsIHRoZSBvdGhlcnMuXG5cdFx0XHRsb2cubG9nKGB2YWx1ZTogJHtjb21wdXRlZFN1bS5nZXQoKX1gKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZWNvbXB1dGUxOiAxICUgMyA9IDEnLFxuXHRcdFx0XHQncmVjb21wdXRlMjogMSAqIDIgPSAyJyxcblx0XHRcdFx0J3JlY29tcHV0ZTM6IDEgKiAzID0gMycsXG5cdFx0XHRcdCdyZWNvbXB1dGU0OiAyICsgMyA9IDUnLFxuXHRcdFx0XHQndmFsdWU6IDUnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0Ly8gQmVjYXVzZSB0aGVyZSBhcmUgbm8gb2JzZXJ2ZXJzLCB0aGUgZGVyaXZlZCB2YWx1ZXMgYXJlIG5vdCBjYWNoZWQgKCEpLCBidXQgY29tcHV0ZWQgZnJvbSBzY3JhdGNoLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDEgJSAzID0gMScsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAxICogMiA9IDInLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMSAqIDMgPSAzJyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDIgKyAzID0gNScsXG5cdFx0XHRcdCd2YWx1ZTogNScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGtlZXBPYnNlcnZlZChjb21wdXRlZFN1bSk7IC8vIFVzZSBrZWVwT2JzZXJ2ZWQgdG8ga2VlcCB0aGUgY2FjaGUuXG5cdFx0XHQvLyBZb3UgY2FuIGFsc28gdXNlIGBjb21wdXRlZFN1bS5rZWVwT2JzZXJ2ZWQoc3RvcmUpYCBmb3IgYW4gaW5saW5lIGV4cGVyaWVuY2UuXG5cdFx0XHRsb2cubG9nKGB2YWx1ZTogJHtjb21wdXRlZFN1bS5nZXQoKX1gKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZWNvbXB1dGUxOiAxICUgMyA9IDEnLFxuXHRcdFx0XHQncmVjb21wdXRlMjogMSAqIDIgPSAyJyxcblx0XHRcdFx0J3JlY29tcHV0ZTM6IDEgKiAzID0gMycsXG5cdFx0XHRcdCdyZWNvbXB1dGU0OiAyICsgMyA9IDUnLFxuXHRcdFx0XHQndmFsdWU6IDUnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3ZhbHVlOiA1Jyxcblx0XHRcdF0pO1xuXHRcdFx0Ly8gVGFkYSwgbm8gcmVjb21wdXRhdGlvbnMhXG5cblx0XHRcdG9ic2VydmFibGUxLnNldCgyLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gVGhlIGtlZXBPYnNlcnZlZCBkb2VzIG5vdCBmb3JjZSBkZXJpdmVkcyB0byBiZSByZWNvbXB1dGVkISBUaGV5IGFyZSBzdGlsbCBsYXp5LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXSkpO1xuXG5cdFx0XHRsb2cubG9nKGB2YWx1ZTogJHtjb21wdXRlZFN1bS5nZXQoKX1gKTtcblx0XHRcdC8vIFRob3NlIGRlcml2ZWRzIGFyZSByZWNvbXB1dGVkIG9uIGRlbWFuZCwgaS5lLiB3aGVuIHNvbWVvbmUgcmVhZHMgdGhlbS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZWNvbXB1dGUxOiAyICUgMyA9IDInLFxuXHRcdFx0XHQncmVjb21wdXRlMjogMiAqIDIgPSA0Jyxcblx0XHRcdFx0J3JlY29tcHV0ZTM6IDIgKiAzID0gNicsXG5cdFx0XHRcdCdyZWNvbXB1dGU0OiA0ICsgNiA9IDEwJyxcblx0XHRcdFx0J3ZhbHVlOiAxMCcsXG5cdFx0XHRdKTtcblx0XHRcdGxvZy5sb2coYHZhbHVlOiAke2NvbXB1dGVkU3VtLmdldCgpfWApO1xuXHRcdFx0Ly8gLi4uIGFuZCB0aGVuIGNhY2hlZCBhZ2FpblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbJ3ZhbHVlOiAxMCddKSk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpOyAvLyBEb24ndCBmb3JnZXQgdG8gZGlzcG9zZSB0aGUga2VlcEFsaXZlIHRvIHByZXZlbnQgbWVtb3J5IGxlYWtzIVxuXG5cdFx0XHRsb2cubG9nKGB2YWx1ZTogJHtjb21wdXRlZFN1bS5nZXQoKX1gKTtcblx0XHRcdC8vIFdoaWNoIGRpc2FibGVzIHRoZSBjYWNoZSBhZ2FpblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3JlY29tcHV0ZTE6IDIgJSAzID0gMicsXG5cdFx0XHRcdCdyZWNvbXB1dGUyOiAyICogMiA9IDQnLFxuXHRcdFx0XHQncmVjb21wdXRlMzogMiAqIDMgPSA2Jyxcblx0XHRcdFx0J3JlY29tcHV0ZTQ6IDQgKyA2ID0gMTAnLFxuXHRcdFx0XHQndmFsdWU6IDEwJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRsb2cubG9nKGB2YWx1ZTogJHtjb21wdXRlZFN1bS5nZXQoKX1gKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZWNvbXB1dGUxOiAyICUgMyA9IDInLFxuXHRcdFx0XHQncmVjb21wdXRlMjogMiAqIDIgPSA0Jyxcblx0XHRcdFx0J3JlY29tcHV0ZTM6IDIgKiAzID0gNicsXG5cdFx0XHRcdCdyZWNvbXB1dGU0OiA0ICsgNiA9IDEwJyxcblx0XHRcdFx0J3ZhbHVlOiAxMCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gV2h5IGRvbid0IHdlIGp1c3QgYWx3YXlzIGtlZXAgdGhlIGNhY2hlIGFsaXZlP1xuXHRcdFx0Ly8gVGhpcyBpcyBiZWNhdXNlIGluIG9yZGVyIHRvIGtlZXAgdGhlIGNhY2hlIGFsaXZlLCB3ZSBoYXZlIHRvIGtlZXAgb3VyIHN1YnNjcmlwdGlvbnMgdG8gb3VyIGRlcGVuZGVuY2llcyBhbGl2ZSxcblx0XHRcdC8vIHdoaWNoIGNvdWxkIGNhdXNlIG1lbW9yeS1sZWFrcy5cblx0XHRcdC8vIFNvIGluc3RlYWQsIHdoZW4gdGhlIGxhc3Qgb2JzZXJ2ZXIgb2YgYSBkZXJpdmVkIGlzIGRpc3Bvc2VkLCB3ZSBkaXNwb3NlIG91ciBzdWJzY3JpcHRpb25zIHRvIG91ciBkZXBlbmRlbmNpZXMuXG5cdFx0XHQvLyBga2VlcE9ic2VydmVkYCBqdXN0IHByZXZlbnRzIHRoaXMgZnJvbSBoYXBwZW5pbmcuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvcnVuIHRoYXQgcmVjZWl2ZXMgZGVsdGFzIG9mIHNpZ25hbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRcdC8vIEEgc2lnbmFsIGlzIGFuIG9ic2VydmFibGUgd2l0aG91dCBhIHZhbHVlLlxuXHRcdFx0Ly8gSG93ZXZlciwgaXQgY2FuIHNoaXAgY2hhbmdlIGluZm9ybWF0aW9uIHdoZW4gaXQgaXMgdHJpZ2dlcmVkLlxuXHRcdFx0Ly8gUmVhZGVycyBjYW4gcHJvY2Vzcy9hZ2dyZWdhdGUgdGhpcyBjaGFuZ2UgaW5mb3JtYXRpb24uXG5cdFx0XHRjb25zdCBzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsPHsgbXNnOiBzdHJpbmcgfT4oJ3NpZ25hbCcpO1xuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bkhhbmRsZUNoYW5nZXMoe1xuXHRcdFx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRcdFx0Ly8gVGhlIGNoYW5nZSBzdW1tYXJ5IGlzIHVzZWQgdG8gY29sbGVjdCB0aGUgY2hhbmdlc1xuXHRcdFx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnk6ICgpID0+ICh7IG1zZ3M6IFtdIGFzIHN0cmluZ1tdIH0pLFxuXHRcdFx0XHRcdGhhbmRsZUNoYW5nZShjb250ZXh0LCBjaGFuZ2VTdW1tYXJ5KSB7XG5cdFx0XHRcdFx0XHRpZiAoY29udGV4dC5kaWRDaGFuZ2Uoc2lnbmFsKSkge1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBqdXN0IHB1c2ggdGhlIGNoYW5nZXMgaW50byBhbiBhcnJheVxuXHRcdFx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5Lm1zZ3MucHVzaChjb250ZXh0LmNoYW5nZS5tc2cpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIFdlIHdhbnQgdG8gaGFuZGxlIHRoZSBjaGFuZ2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9LCAocmVhZGVyLCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0XHRcdC8vIFdoZW4gaGFuZGxpbmcgdGhlIGNoYW5nZSwgbWFrZSBzdXJlIHRvIHJlYWQgdGhlIHNpZ25hbCFcblx0XHRcdFx0c2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZygnbXNnczogJyArIGNoYW5nZVN1bW1hcnkubXNncy5qb2luKCcsICcpKTtcblx0XHRcdH0pO1xuXG5cblx0XHRcdHNpZ25hbC50cmlnZ2VyKHVuZGVmaW5lZCwgeyBtc2c6ICdmb29iYXInIH0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdC8vIFlvdSBjYW4gYmF0Y2ggdHJpZ2dlcmluZyBzaWduYWxzLlxuXHRcdFx0XHQvLyBObyBkZWx0YSBpbmZvcm1hdGlvbiBpcyBsb3N0IVxuXHRcdFx0XHRzaWduYWwudHJpZ2dlcih0eCwgeyBtc2c6ICdoZWxsbycgfSk7XG5cdFx0XHRcdHNpZ25hbC50cmlnZ2VyKHR4LCB7IG1zZzogJ3dvcmxkJyB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXNnczogJyxcblx0XHRcdFx0J21zZ3M6IGZvb2JhcicsXG5cdFx0XHRcdCdtc2dzOiBoZWxsbywgd29ybGQnXG5cdFx0XHRdKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBUaGF0IGlzIHRoZSBlbmQgb2YgdGhlIHR1dG9yaWFsLlxuXHRcdC8vIFRoZXJlIGFyZSBsb3RzIG9mIHV0aWxpdGllcyB5b3UgY2FuIGV4cGxvcmUgbm93LCBsaWtlIGBvYnNlcnZhYmxlRnJvbUV2ZW50YCwgYEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHRgLFxuXHRcdC8vIGF1dG9ydW5XaXRoU3RvcmUsIG9ic2VydmFibGVXaXRoU3RvcmUgYW5kIHNvIG9uLlxuXHR9KTtcblxuXHR0ZXN0KCd0b3BvbG9naWNhbCBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMScsIDApO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTInLCAwKTtcblxuXHRcdGNvbnN0IG15Q29tcHV0ZWQxID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUNvbXB1dGVkMSAqL1xuXHRcdFx0Y29uc3QgdmFsdWUxID0gbXlPYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2YWx1ZTIgPSBteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHN1bSA9IHZhbHVlMSArIHZhbHVlMjtcblx0XHRcdGxvZy5sb2coYG15Q29tcHV0ZWQxLnJlY29tcHV0ZShteU9ic2VydmFibGUxOiAke3ZhbHVlMX0gKyBteU9ic2VydmFibGUyOiAke3ZhbHVlMn0gPSAke3N1bX0pYCk7XG5cdFx0XHRyZXR1cm4gc3VtO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbXlDb21wdXRlZDIgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQyICovXG5cdFx0XHRjb25zdCB2YWx1ZTEgPSBteUNvbXB1dGVkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2YWx1ZTIgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbHVlMyA9IG15T2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3VtID0gdmFsdWUxICsgdmFsdWUyICsgdmFsdWUzO1xuXHRcdFx0bG9nLmxvZyhgbXlDb21wdXRlZDIucmVjb21wdXRlKG15Q29tcHV0ZWQxOiAke3ZhbHVlMX0gKyBteU9ic2VydmFibGUxOiAke3ZhbHVlMn0gKyBteU9ic2VydmFibGUyOiAke3ZhbHVlM30gPSAke3N1bX0pYCk7XG5cdFx0XHRyZXR1cm4gc3VtO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbXlDb21wdXRlZDMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQzICovXG5cdFx0XHRjb25zdCB2YWx1ZTEgPSBteUNvbXB1dGVkMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2YWx1ZTIgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbHVlMyA9IG15T2JzZXJ2YWJsZTIucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3VtID0gdmFsdWUxICsgdmFsdWUyICsgdmFsdWUzO1xuXHRcdFx0bG9nLmxvZyhgbXlDb21wdXRlZDMucmVjb21wdXRlKG15Q29tcHV0ZWQyOiAke3ZhbHVlMX0gKyBteU9ic2VydmFibGUxOiAke3ZhbHVlMn0gKyBteU9ic2VydmFibGUyOiAke3ZhbHVlM30gPSAke3N1bX0pYCk7XG5cdFx0XHRyZXR1cm4gc3VtO1xuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRsb2cubG9nKGBteUF1dG9ydW4ucnVuKG15Q29tcHV0ZWQzOiAke215Q29tcHV0ZWQzLnJlYWQocmVhZGVyKX0pYCk7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlDb21wdXRlZDEucmVjb21wdXRlKG15T2JzZXJ2YWJsZTE6IDAgKyBteU9ic2VydmFibGUyOiAwID0gMCknLFxuXHRcdFx0J215Q29tcHV0ZWQyLnJlY29tcHV0ZShteUNvbXB1dGVkMTogMCArIG15T2JzZXJ2YWJsZTE6IDAgKyBteU9ic2VydmFibGUyOiAwID0gMCknLFxuXHRcdFx0J215Q29tcHV0ZWQzLnJlY29tcHV0ZShteUNvbXB1dGVkMjogMCArIG15T2JzZXJ2YWJsZTE6IDAgKyBteU9ic2VydmFibGUyOiAwID0gMCknLFxuXHRcdFx0J215QXV0b3J1bi5ydW4obXlDb21wdXRlZDM6IDApJyxcblx0XHRdKTtcblxuXHRcdG15T2JzZXJ2YWJsZTEuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteUNvbXB1dGVkMS5yZWNvbXB1dGUobXlPYnNlcnZhYmxlMTogMSArIG15T2JzZXJ2YWJsZTI6IDAgPSAxKScsXG5cdFx0XHQnbXlDb21wdXRlZDIucmVjb21wdXRlKG15Q29tcHV0ZWQxOiAxICsgbXlPYnNlcnZhYmxlMTogMSArIG15T2JzZXJ2YWJsZTI6IDAgPSAyKScsXG5cdFx0XHQnbXlDb21wdXRlZDMucmVjb21wdXRlKG15Q29tcHV0ZWQyOiAyICsgbXlPYnNlcnZhYmxlMTogMSArIG15T2JzZXJ2YWJsZTI6IDAgPSAzKScsXG5cdFx0XHQnbXlBdXRvcnVuLnJ1bihteUNvbXB1dGVkMzogMyknLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRteU9ic2VydmFibGUxLnNldCgyLCB0eCk7XG5cdFx0XHRteUNvbXB1dGVkMi5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteUNvbXB1dGVkMS5yZWNvbXB1dGUobXlPYnNlcnZhYmxlMTogMiArIG15T2JzZXJ2YWJsZTI6IDAgPSAyKScsXG5cdFx0XHRcdCdteUNvbXB1dGVkMi5yZWNvbXB1dGUobXlDb21wdXRlZDE6IDIgKyBteU9ic2VydmFibGUxOiAyICsgbXlPYnNlcnZhYmxlMjogMCA9IDQpJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRteU9ic2VydmFibGUxLnNldCgzLCB0eCk7XG5cdFx0XHRteUNvbXB1dGVkMi5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteUNvbXB1dGVkMS5yZWNvbXB1dGUobXlPYnNlcnZhYmxlMTogMyArIG15T2JzZXJ2YWJsZTI6IDAgPSAzKScsXG5cdFx0XHRcdCdteUNvbXB1dGVkMi5yZWNvbXB1dGUobXlDb21wdXRlZDE6IDMgKyBteU9ic2VydmFibGUxOiAzICsgbXlPYnNlcnZhYmxlMjogMCA9IDYpJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlDb21wdXRlZDMucmVjb21wdXRlKG15Q29tcHV0ZWQyOiA2ICsgbXlPYnNlcnZhYmxlMTogMyArIG15T2JzZXJ2YWJsZTI6IDAgPSA5KScsXG5cdFx0XHQnbXlBdXRvcnVuLnJ1bihteUNvbXB1dGVkMzogOSknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZnJvbSBldmVudCcsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGluaXQoKTogeyBsb2c6IExvZzsgc2V0VmFsdWU6ICh2YWx1ZTogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB2b2lkOyBvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+IH0ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0XHRsZXQgdmFsdWU6IG51bWJlciB8IHVuZGVmaW5lZCA9IDA7XG5cdFx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXG5cdFx0XHRsZXQgaWQgPSAwO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZSA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHRcdChoYW5kbGVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY3VySWQgPSBpZCsrO1xuXHRcdFx0XHRcdGxvZy5sb2coYHN1YnNjcmliZWQgaGFuZGxlciAke2N1cklkfWApO1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBldmVudEVtaXR0ZXIuZXZlbnQoaGFuZGxlcik7XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRsb2cubG9nKGB1bnN1YnNjcmliZWQgaGFuZGxlciAke2N1cklkfWApO1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGxvZy5sb2coYGNvbXB1dGUgdmFsdWUgJHt2YWx1ZX1gKTtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxvZyxcblx0XHRcdFx0c2V0VmFsdWU6IChuZXdWYWx1ZSkgPT4ge1xuXHRcdFx0XHRcdHZhbHVlID0gbmV3VmFsdWU7XG5cdFx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b2JzZXJ2YWJsZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnSGFuZGxlIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9nLCBzZXRWYWx1ZSwgb2JzZXJ2YWJsZSB9ID0gaW5pdCgpO1xuXG5cdFx0XHRzZXRWYWx1ZSh1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBhdXRvcnVuRGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBNeUF1dG9ydW4gKi9cblx0XHRcdFx0b2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coXG5cdFx0XHRcdFx0YGF1dG9ydW4sIHZhbHVlOiAke29ic2VydmFibGUucmVhZChyZWFkZXIpfWBcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnc3Vic2NyaWJlZCBoYW5kbGVyIDAnLFxuXHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSB1bmRlZmluZWQnLFxuXHRcdFx0XHQnYXV0b3J1biwgdmFsdWU6IHVuZGVmaW5lZCcsXG5cdFx0XHRdKTtcblxuXHRcdFx0c2V0VmFsdWUoMSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdjb21wdXRlIHZhbHVlIDEnLFxuXHRcdFx0XHQnYXV0b3J1biwgdmFsdWU6IDEnXG5cdFx0XHRdKTtcblxuXHRcdFx0YXV0b3J1bkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQndW5zdWJzY3JpYmVkIGhhbmRsZXIgMCdcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYmFzaWMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGxvZywgc2V0VmFsdWUsIG9ic2VydmFibGUgfSA9IGluaXQoKTtcblxuXHRcdFx0Y29uc3Qgc2hvdWxkUmVhZE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3Nob3VsZFJlYWRPYnNlcnZhYmxlJywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGF1dG9ydW5EaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIE15QXV0b3J1biAqL1xuXHRcdFx0XHRpZiAoc2hvdWxkUmVhZE9ic2VydmFibGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0b2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0bG9nLmxvZyhcblx0XHRcdFx0XHRcdGBhdXRvcnVuLCBzaG91bGQgcmVhZDogdHJ1ZSwgdmFsdWU6ICR7b2JzZXJ2YWJsZS5yZWFkKHJlYWRlcil9YFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgYXV0b3J1biwgc2hvdWxkIHJlYWQ6IGZhbHNlYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3N1YnNjcmliZWQgaGFuZGxlciAwJyxcblx0XHRcdFx0J2NvbXB1dGUgdmFsdWUgMCcsXG5cdFx0XHRcdCdhdXRvcnVuLCBzaG91bGQgcmVhZDogdHJ1ZSwgdmFsdWU6IDAnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIENhY2hlZCBnZXRcblx0XHRcdGxvZy5sb2coYGdldCB2YWx1ZTogJHtvYnNlcnZhYmxlLmdldCgpfWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnZ2V0IHZhbHVlOiAwJ10pO1xuXG5cdFx0XHRzZXRWYWx1ZSgxKTtcblx0XHRcdC8vIFRyaWdnZXIgYXV0b3J1biwgbm8gdW5zdWIvc3ViXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAxJyxcblx0XHRcdFx0J2F1dG9ydW4sIHNob3VsZCByZWFkOiB0cnVlLCB2YWx1ZTogMScsXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gVW5zdWJzY3JpYmUgd2hlbiBub3QgcmVhZFxuXHRcdFx0c2hvdWxkUmVhZE9ic2VydmFibGUuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J2F1dG9ydW4sIHNob3VsZCByZWFkOiBmYWxzZScsXG5cdFx0XHRcdCd1bnN1YnNjcmliZWQgaGFuZGxlciAwJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRzaG91bGRSZWFkT2JzZXJ2YWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdzdWJzY3JpYmVkIGhhbmRsZXIgMScsXG5cdFx0XHRcdCdjb21wdXRlIHZhbHVlIDEnLFxuXHRcdFx0XHQnYXV0b3J1biwgc2hvdWxkIHJlYWQ6IHRydWUsIHZhbHVlOiAxJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRhdXRvcnVuRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQndW5zdWJzY3JpYmVkIGhhbmRsZXIgMScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldCB3aXRob3V0IG9ic2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgbG9nLCBvYnNlcnZhYmxlIH0gPSBpbml0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHRsb2cubG9nKGBnZXQgdmFsdWU6ICR7b2JzZXJ2YWJsZS5nZXQoKX1gKTtcblx0XHRcdC8vIE5vdCBjYWNoZWQgb3Igc3Vic2NyaWJlZFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J2NvbXB1dGUgdmFsdWUgMCcsXG5cdFx0XHRcdCdnZXQgdmFsdWU6IDAnLFxuXHRcdFx0XSk7XG5cblx0XHRcdGxvZy5sb2coYGdldCB2YWx1ZTogJHtvYnNlcnZhYmxlLmdldCgpfWApO1xuXHRcdFx0Ly8gU3RpbGwgbm90IGNhY2hlZCBvciBzdWJzY3JpYmVkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnY29tcHV0ZSB2YWx1ZSAwJyxcblx0XHRcdFx0J2dldCB2YWx1ZTogMCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZGluZyBkZXJpdmVkIGluIHRyYW5zYWN0aW9uIHVuc3Vic2NyaWJlcyB1bm5lY2Vzc2FyeSBvYnNlcnZhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBzaG91bGRSZWFkT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnc2hvdWxkUmVhZE15T2JzMScsIHRydWUpO1xuXHRcdGNvbnN0IG15T2JzMSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9iczEnLCAwLCBsb2cpO1xuXHRcdGNvbnN0IG15Q29tcHV0ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15Q29tcHV0ZWQgKi9cblx0XHRcdGxvZy5sb2coJ215Q29tcHV0ZWQucmVjb21wdXRlJyk7XG5cdFx0XHRpZiAoc2hvdWxkUmVhZE9ic2VydmFibGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBteU9iczEucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSk7XG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRjb25zdCB2YWx1ZSA9IG15Q29tcHV0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuOiAke3ZhbHVlfWApO1xuXHRcdH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215Q29tcHV0ZWQucmVjb21wdXRlJyxcblx0XHRcdCdteU9iczEuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9iczEuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW46IDAnLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnMxLnNldCgxLCB0eCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFsnbXlPYnMxLnNldCAodmFsdWUgMSknXSkpO1xuXG5cdFx0XHRzaG91bGRSZWFkT2JzZXJ2YWJsZS5zZXQoZmFsc2UsIHR4KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW10pKTtcblxuXHRcdFx0bXlDb21wdXRlZC5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteUNvbXB1dGVkLnJlY29tcHV0ZScsXG5cdFx0XHRcdCdteU9iczEubGFzdE9ic2VydmVyUmVtb3ZlZCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFsnbXlBdXRvcnVuOiAxJ10pKTtcblx0fSk7XG5cblx0dGVzdCgnYXZvaWQgcmVjb21wdXRhdGlvbiBvZiBkZXJpdmVkcyB0aGF0IGFyZSBubyBsb25nZXIgcmVhZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBteU9ic1Nob3VsZFJlYWQgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNTaG91bGRSZWFkJywgdHJ1ZSwgbG9nKTtcblx0XHRjb25zdCBteU9iczEgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnMxJywgMCwgbG9nKTtcblxuXHRcdGNvbnN0IG15Q29tcHV0ZWQxID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUNvbXB1dGVkMSAqL1xuXHRcdFx0Y29uc3QgbXlPYnMxVmFsID0gbXlPYnMxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG15T2JzMVZhbCAlIDEwO1xuXHRcdFx0bG9nLmxvZyhgbXlDb21wdXRlZDEobXlPYnMxOiAke215T2JzMVZhbH0pOiBDb21wdXRlZCAke3Jlc3VsdH1gKTtcblx0XHRcdHJldHVybiBteU9iczFWYWw7XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdGNvbnN0IHNob3VsZFJlYWQgPSBteU9ic1Nob3VsZFJlYWQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNob3VsZFJlYWQpIHtcblx0XHRcdFx0Y29uc3QgdiA9IG15Q29tcHV0ZWQxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKHNob3VsZFJlYWQ6IHRydWUsIG15Q29tcHV0ZWQxOiAke3Z9KTogcnVuYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4oc2hvdWxkUmVhZDogZmFsc2UpOiBydW5gKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic1Nob3VsZFJlYWQuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic1Nob3VsZFJlYWQuZ2V0Jyxcblx0XHRcdCdteU9iczEuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9iczEuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkMShteU9iczE6IDApOiBDb21wdXRlZCAwJyxcblx0XHRcdCdteUF1dG9ydW4oc2hvdWxkUmVhZDogdHJ1ZSwgbXlDb21wdXRlZDE6IDApOiBydW4nLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNTaG91bGRSZWFkLnNldChmYWxzZSwgdHgpO1xuXHRcdFx0bXlPYnMxLnNldCgxLCB0eCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNTaG91bGRSZWFkLnNldCAodmFsdWUgZmFsc2UpJyxcblx0XHRcdFx0J215T2JzMS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdC8vIG15Q29tcHV0ZWQxIHNob3VsZCBub3QgYmUgcmVjb21wdXRlZCBoZXJlLCBldmVuIHRob3VnaCBpdHMgZGVwZW5kZW5jeSBteU9iczEgY2hhbmdlZCFcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzU2hvdWxkUmVhZC5nZXQnLFxuXHRcdFx0J215QXV0b3J1bihzaG91bGRSZWFkOiBmYWxzZSk6IHJ1bicsXG5cdFx0XHQnbXlPYnMxLmxhc3RPYnNlcnZlclJlbW92ZWQnLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNTaG91bGRSZWFkLnNldCh0cnVlLCB0eCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNTaG91bGRSZWFkLnNldCAodmFsdWUgdHJ1ZSknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic1Nob3VsZFJlYWQuZ2V0Jyxcblx0XHRcdCdteU9iczEuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9iczEuZ2V0Jyxcblx0XHRcdCdteUNvbXB1dGVkMShteU9iczE6IDEpOiBDb21wdXRlZCAxJyxcblx0XHRcdCdteUF1dG9ydW4oc2hvdWxkUmVhZDogdHJ1ZSwgbXlDb21wdXRlZDE6IDEpOiBydW4nLFxuXHRcdF0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b3J1biByZXJ1biBvbiBuZXV0cmFsIGNoYW5nZScsICgpID0+IHtcblx0XHR0ZXN0KCdhdXRvcnVuIHJlcnVucyBvbiBuZXV0cmFsIG9ic2VydmFibGUgZG91YmxlIGNoYW5nZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRcdGxvZy5sb2coYG15QXV0b3J1bi5ydW4obXlPYnNlcnZhYmxlOiAke215T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcil9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6IDApJ10pO1xuXG5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDIsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDAsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlBdXRvcnVuLnJ1bihteU9ic2VydmFibGU6IDApJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0b3J1biBkb2VzIG5vdCByZXJ1biBvbiBpbmRpcmVjdCBuZXV0cmFsIG9ic2VydmFibGUgZG91YmxlIGNoYW5nZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCk7XG5cdFx0XHRjb25zdCBteURlcml2ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkICovXG5cdFx0XHRcdGNvbnN0IHZhbCA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coYG15RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogJHt2YWx9KWApO1xuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRcdGxvZy5sb2coYG15QXV0b3J1bi5ydW4obXlEZXJpdmVkOiAke215RGVyaXZlZC5yZWFkKHJlYWRlcil9KWApO1xuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogMCknLFxuXHRcdFx0XHQnbXlBdXRvcnVuLnJ1bihteURlcml2ZWQ6IDApJ1xuXHRcdFx0XSk7XG5cblx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDIsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KDAsIHR4KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogMCknXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG9ydW4gcmVydW5zIG9uIGluZGlyZWN0IG5ldXRyYWwgb2JzZXJ2YWJsZSBkb3VibGUgY2hhbmdlIHdoZW4gY2hhbmdlcyBwcm9wYWdhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBteU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIDApO1xuXHRcdFx0Y29uc3QgbXlEZXJpdmVkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZCAqL1xuXHRcdFx0XHRjb25zdCB2YWwgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKGBteURlcml2ZWQucmVhZChteU9ic2VydmFibGU6ICR7dmFsfSlgKTtcblx0XHRcdFx0cmV0dXJuIHZhbDtcblx0XHRcdH0pO1xuXG5cdFx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0XHRsb2cubG9nKGBteUF1dG9ydW4ucnVuKG15RGVyaXZlZDogJHtteURlcml2ZWQucmVhZChyZWFkZXIpfSlgKTtcblx0XHRcdH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteURlcml2ZWQucmVhZChteU9ic2VydmFibGU6IDApJyxcblx0XHRcdFx0J215QXV0b3J1bi5ydW4obXlEZXJpdmVkOiAwKSdcblx0XHRcdF0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdFx0bXlPYnNlcnZhYmxlLnNldCgyLCB0eCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdFx0bXlEZXJpdmVkLmdldCgpOyAvLyBUaGlzIG1hcmtzIHRoZSBhdXRvLXJ1biBhcyBjaGFuZ2VkXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdFx0J215RGVyaXZlZC5yZWFkKG15T2JzZXJ2YWJsZTogMiknXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMCwgdHgpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlEZXJpdmVkLnJlYWQobXlPYnNlcnZhYmxlOiAwKScsXG5cdFx0XHRcdCdteUF1dG9ydW4ucnVuKG15RGVyaXZlZDogMCknXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZi1kaXNwb3NpbmcgYXV0b3J1bicsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBvYnNlcnZhYmxlMSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUxJywgMCwgbG9nKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUyID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTInLCAwLCBsb2cpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTMgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMycsIDAsIGxvZyk7XG5cblx0XHRjb25zdCBkID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBhdXRvcnVuICovXG5cdFx0XHRpZiAob2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpID49IDIpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMS5zZXQgKHZhbHVlIDIpJyxcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMS5nZXQnLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRteU9ic2VydmFibGUyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Ly8gRmlyc3QgdGltZSB0aGlzIG9ic2VydmFibGUgaXMgcmVhZFxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHRcdCdteU9ic2VydmFibGUyLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHRcdFx0J215T2JzZXJ2YWJsZTIuZ2V0Jyxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdC8vIERpc3Bvc2luZyByZW1vdmVzIGFsbCBvYnNlcnZlcnNcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdFx0XHQnbXlPYnNlcnZhYmxlMi5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0bXlPYnNlcnZhYmxlMy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdC8vIFRoaXMgZG9lcyBub3Qgc3Vic2NyaWJlIHRoZSBvYnNlcnZhYmxlLCBiZWNhdXNlIHRoZSBhdXRvcnVuIGlzIGRpc3Bvc2VkXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdFx0J215T2JzZXJ2YWJsZTMuZ2V0Jyxcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUxLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlMS5nZXQnLFxuXHRcdF0pO1xuXG5cdFx0b2JzZXJ2YWJsZTEuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUxLnNldCAodmFsdWUgMSknLFxuXHRcdFx0J215T2JzZXJ2YWJsZTEuZ2V0Jyxcblx0XHRdKTtcblxuXHRcdG9ic2VydmFibGUxLnNldCgyLCB1bmRlZmluZWQpO1xuXHRcdC8vIFNlZSBhc3NlcnRzIGluIHRoZSBhdXRvcnVuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2luZyBvYnNlcnZhYmxlcyBpbiBlbmRVcGRhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUxJywgMCwgbG9nKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUyID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTInLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkMSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMSAqL1xuXHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteURlcml2ZWQxLnJlYWQobXlPYnNlcnZhYmxlOiAke3ZhbH0pYCk7XG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkMiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMiAqL1xuXHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodmFsID09PSAxKSB7XG5cdFx0XHRcdG15RGVyaXZlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0bG9nLmxvZyhgbXlEZXJpdmVkMi5yZWFkKG15T2JzZXJ2YWJsZTogJHt2YWx9KWApO1xuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9KTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0Y29uc3QgbXlEZXJpdmVkMVZhbCA9IG15RGVyaXZlZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbXlEZXJpdmVkMlZhbCA9IG15RGVyaXZlZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuLnJ1bihteURlcml2ZWQxOiAke215RGVyaXZlZDFWYWx9LCBteURlcml2ZWQyOiAke215RGVyaXZlZDJWYWx9KWApO1xuXHRcdH0pKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdG15T2JzZXJ2YWJsZTIuc2V0KDEsIHR4KTtcblx0XHRcdC8vIGVuZCB1cGRhdGUgb2YgdGhpcyBvYnNlcnZhYmxlIHdpbGwgdHJpZ2dlciBlbmRVcGRhdGUgb2YgbXlEZXJpdmVkMSBhbmRcblx0XHRcdC8vIHRoZSBhdXRvcnVuIGFuZCB0aGUgYXV0b3J1biB3aWxsIGFkZCBteURlcml2ZWQyIGFzIG9ic2VydmVyIHRvIG15RGVyaXZlZDFcblx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KDEsIHR4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0IGRlcGVuZGVuY3kgaW4gZGVyaXZlZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cblx0XHRjb25zdCBteU9ic2VydmFibGUgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCwgbG9nKTtcblx0XHRjb25zdCBteUNvbXB1dGVkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUNvbXB1dGVkICovXG5cdFx0XHRsZXQgdmFsdWUgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgb3JpZ1ZhbHVlID0gdmFsdWU7XG5cdFx0XHRsb2cubG9nKGBteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogJHtvcmlnVmFsdWV9KTogc3RhcnQgY29tcHV0aW5nYCk7XG5cdFx0XHRpZiAodmFsdWUgJSAzICE9PSAwKSB7XG5cdFx0XHRcdHZhbHVlKys7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZS5zZXQodmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRsb2cubG9nKGBteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogJHtvcmlnVmFsdWV9KTogZmluaXNoZWQgY29tcHV0aW5nYCk7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSk7XG5cblx0XHRkcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteUF1dG9ydW4gKi9cblx0XHRcdGNvbnN0IHZhbHVlID0gbXlDb21wdXRlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteUF1dG9ydW4obXlDb21wdXRlZDogJHt2YWx1ZX0pYCk7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDApOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAwKTogZmluaXNoZWQgY29tcHV0aW5nJyxcblx0XHRcdCdteUF1dG9ydW4obXlDb21wdXRlZDogMCknXG5cdFx0XSk7XG5cblx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDEpOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDIpJyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMSk6IGZpbmlzaGVkIGNvbXB1dGluZycsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDIpOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDMpJyxcblx0XHRcdCdteUNvbXB1dGVkKG15T2JzZXJ2YWJsZTogMik6IGZpbmlzaGVkIGNvbXB1dGluZycsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlDb21wdXRlZChteU9ic2VydmFibGU6IDMpOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215Q29tcHV0ZWQobXlPYnNlcnZhYmxlOiAzKTogZmluaXNoZWQgY29tcHV0aW5nJyxcblx0XHRcdCdteUF1dG9ydW4obXlDb21wdXRlZDogMyknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXQgZGVwZW5kZW5jeSBpbiBhdXRvcnVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCwgbG9nKTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0bG9nLmxvZyhgbXlBdXRvcnVuKG15T2JzZXJ2YWJsZTogJHt2YWx1ZX0pOiBzdGFydGApO1xuXHRcdFx0aWYgKHZhbHVlICE9PSAwICYmIHZhbHVlIDwgNCkge1xuXHRcdFx0XHRteU9ic2VydmFibGUuc2V0KHZhbHVlICsgMSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihteU9ic2VydmFibGU6ICR7dmFsdWV9KTogZW5kYCk7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlBdXRvcnVuKG15T2JzZXJ2YWJsZTogMCk6IHN0YXJ0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAwKTogZW5kJyxcblx0XHRdKTtcblxuXHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAxKTogc3RhcnQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDIpJyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAxKTogZW5kJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAyKTogc3RhcnQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDMpJyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAyKTogZW5kJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAzKTogc3RhcnQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDQpJyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiAzKTogZW5kJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteUF1dG9ydW4obXlPYnNlcnZhYmxlOiA0KTogc3RhcnQnLFxuXHRcdFx0J215QXV0b3J1bihteU9ic2VydmFibGU6IDQpOiBlbmQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgaW4gdHJhbnNhY3Rpb24gYmV0d2VlbiBzZXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCwgbG9nKTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZDEgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZDEgKi9cblx0XHRcdGNvbnN0IHZhbHVlID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZDEobXlPYnNlcnZhYmxlOiAke3ZhbHVlfSk6IHN0YXJ0IGNvbXB1dGluZ2ApO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkMiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMiAqL1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBteURlcml2ZWQxLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZDIobXlEZXJpdmVkMTogJHt2YWx1ZX0pOiBzdGFydCBjb21wdXRpbmdgKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9KTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1biAqL1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBteURlcml2ZWQyLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihteURlcml2ZWQyOiAke3ZhbHVlfSlgKTtcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteURlcml2ZWQxKG15T2JzZXJ2YWJsZTogMCk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlEZXJpdmVkMihteURlcml2ZWQxOiAwKTogc3RhcnQgY29tcHV0aW5nJyxcblx0XHRcdCdteUF1dG9ydW4obXlEZXJpdmVkMjogMCknLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB0eCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMSknLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15RGVyaXZlZDIuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRcdCdteURlcml2ZWQxKG15T2JzZXJ2YWJsZTogMSk6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHRcdCdteURlcml2ZWQyKG15RGVyaXZlZDE6IDEpOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMiwgdHgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDIpJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnbXlEZXJpdmVkMShteU9ic2VydmFibGU6IDIpOiBzdGFydCBjb21wdXRpbmcnLFxuXHRcdFx0J215RGVyaXZlZDIobXlEZXJpdmVkMTogMik6IHN0YXJ0IGNvbXB1dGluZycsXG5cdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDI6IDIpJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYnVnOiBEb250IHJlc2V0IHN0YXRlcycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0Y29uc3QgbXlPYnNlcnZhYmxlMSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUxJywgMCwgbG9nKTtcblxuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlMicsIDAsIGxvZyk7XG5cdFx0Y29uc3QgbXlEZXJpdmVkMiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkMiAqL1xuXHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKGBteURlcml2ZWQyLmNvbXB1dGVkKG15T2JzZXJ2YWJsZTI6ICR7dmFsfSlgKTtcblx0XHRcdHJldHVybiB2YWwgJSAxMDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG15RGVyaXZlZDMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZDMgKi9cblx0XHRcdGNvbnN0IHZhbDEgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZhbDIgPSBteURlcml2ZWQyLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZDMuY29tcHV0ZWQobXlEZXJpdmVkMTogJHt2YWwxfSwgbXlEZXJpdmVkMjogJHt2YWwyfSlgKTtcblx0XHRcdHJldHVybiBgJHt2YWwxfSArICR7dmFsMn1gO1xuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuICovXG5cdFx0XHRjb25zdCB2YWwgPSBteURlcml2ZWQzLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15QXV0b3J1bihteURlcml2ZWQzOiAke3ZhbH0pYCk7XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlMS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZTEuZ2V0Jyxcblx0XHRcdCdteU9ic2VydmFibGUyLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlMi5nZXQnLFxuXHRcdFx0J215RGVyaXZlZDIuY29tcHV0ZWQobXlPYnNlcnZhYmxlMjogMCknLFxuXHRcdFx0J215RGVyaXZlZDMuY29tcHV0ZWQobXlEZXJpdmVkMTogMCwgbXlEZXJpdmVkMjogMCknLFxuXHRcdFx0J215QXV0b3J1bihteURlcml2ZWQzOiAwICsgMCknLFxuXHRcdF0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNlcnZhYmxlMS5zZXQoMSwgdHgpOyAvLyBNYXJrIG15RGVyaXZlZCAzIGFzIHN0YWxlXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlMS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRteU9ic2VydmFibGUyLnNldCgxMCwgdHgpOyAvLyBUaGlzIGlzIGEgbm9uLWNoYW5nZS4gbXlEZXJpdmVkMyBzaG91bGQgbm90IGJlIG1hcmtlZCBhcyBwb3NzaWJseS1kZXBlZGVuY3ktY2hhbmdlZCFcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUyLnNldCAodmFsdWUgMTApJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlMS5nZXQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZTIuZ2V0Jyxcblx0XHRcdCdteURlcml2ZWQyLmNvbXB1dGVkKG15T2JzZXJ2YWJsZTI6IDEwKScsXG5cdFx0XHQnbXlEZXJpdmVkMy5jb21wdXRlZChteURlcml2ZWQxOiAxLCBteURlcml2ZWQyOiAwKScsXG5cdFx0XHQnbXlBdXRvcnVuKG15RGVyaXZlZDM6IDEgKyAwKScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZzogQWRkIG9ic2VydmFibGUgaW4gZW5kVXBkYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZTEgPSBvYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZTEnLCAwKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUyID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUyJywgMCk7XG5cblx0XHRjb25zdCBteURlcml2ZWQxID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQxICovXG5cdFx0XHRyZXR1cm4gbXlPYnNlcnZhYmxlMS5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteURlcml2ZWQyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQyICovXG5cdFx0XHRyZXR1cm4gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBteURlcml2ZWRBMSA9IGRlcml2ZWQocmVhZGVyID0+IC8qKiBAZGVzY3JpcHRpb24gbXlEZXJpdmVkQTEgKi8ge1xuXHRcdFx0Y29uc3QgZDEgPSBteURlcml2ZWQxLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChkMSA9PT0gMSkge1xuXHRcdFx0XHQvLyBUaGlzIGFkZHMgYW4gb2JzZXJ2ZXIgd2hpbGUgbXlEZXJpdmVkIGlzIHN0aWxsIGluIHVwZGF0ZSBtb2RlLlxuXHRcdFx0XHQvLyBXaGVuIG15RGVyaXZlZCBleGl0cyB1cGRhdGUgbW9kZSwgdGhlIG9ic2VydmVyIHNob3VsZG4ndCByZWNlaXZlXG5cdFx0XHRcdC8vIG1vcmUgZW5kVXBkYXRlIHRoYW4gYmVnaW5VcGRhdGUgY2FsbHMuXG5cdFx0XHRcdG15RGVyaXZlZDIucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZHMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbXlBdXRvcnVuMSAqL1xuXHRcdFx0bXlEZXJpdmVkQTEucmVhZChyZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdGRzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15QXV0b3J1bjIgKi9cblx0XHRcdG15RGVyaXZlZDIucmVhZChyZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KDEsIHR4KTtcblx0XHRcdG15T2JzZXJ2YWJsZTIuc2V0KDEsIHR4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnOiBmcm9tT2JzZXJ2YWJsZUxpZ2h0IGRvZXNudCBzdWJzY3JpYmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0Y29uc3QgbXlEZXJpdmVkID0gZGVyaXZlZChyZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBteURlcml2ZWQgKi8ge1xuXHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGxvZy5sb2coYG15RGVyaXZlZC5jb21wdXRlZChteU9ic2VydmFibGUyOiAke3ZhbH0pYCk7XG5cdFx0XHRyZXR1cm4gdmFsICUgMTA7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlID0gRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodChteURlcml2ZWQpO1xuXHRcdGxvZy5sb2coJ2V2ZW50IGNyZWF0ZWQnKTtcblx0XHRlKCgpID0+IHtcblx0XHRcdGxvZy5sb2coJ2V2ZW50IGZpcmVkJyk7XG5cdFx0fSk7XG5cblx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J2V2ZW50IGNyZWF0ZWQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5maXJzdE9ic2VydmVyQWRkZWQnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215RGVyaXZlZC5jb21wdXRlZChteU9ic2VydmFibGUyOiAwKScsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMSknLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0J215RGVyaXZlZC5jb21wdXRlZChteU9ic2VydmFibGUyOiAxKScsXG5cdFx0XHQnZXZlbnQgZmlyZWQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWc6IEV2ZW50LmZyb21PYnNlcnZhYmxlIGFsd2F5cyBzaG91bGQgZ2V0IGV2ZW50cycsICgpID0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXIoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdGNvbnN0IG9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQoZW1pdHRlci5ldmVudCwgKCkgPT4gaSk7XG5cblx0XHRpKys7XG5cdFx0ZW1pdHRlci5maXJlKDEpO1xuXG5cdFx0Y29uc3QgZXZ0MiA9IEV2ZW50LmZyb21PYnNlcnZhYmxlKG9icyk7XG5cdFx0Y29uc3QgZCA9IGV2dDIoZSA9PiB7XG5cdFx0XHRsb2cubG9nKGBldmVudCBmaXJlZCAke2V9YCk7XG5cdFx0fSk7XG5cblx0XHRpKys7XG5cdFx0ZW1pdHRlci5maXJlKDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ2V2ZW50IGZpcmVkIDInXSk7XG5cblx0XHRpKys7XG5cdFx0ZW1pdHRlci5maXJlKDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ2V2ZW50IGZpcmVkIDMnXSk7XG5cblx0XHRkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZG9udCBydW4gYXV0b3J1biBhZnRlciBkaXNwb3NlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUgPSBuZXcgTG9nZ2luZ09ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlJywgMCwgbG9nKTtcblxuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgdiA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKCdhdXRvcnVuLCBteU9ic2VydmFibGU6JyArIHYpO1xuXHRcdH0pO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB0eCk7XG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHQnYXV0b3J1biwgbXlPYnNlcnZhYmxlOjAnLFxuXHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdCdteU9ic2VydmFibGUubGFzdE9ic2VydmVyUmVtb3ZlZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd3YWl0Rm9yU3RhdGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCB7IHN0YXRlOiAnaW5pdGlhbGl6aW5nJyBhcyAnaW5pdGlhbGl6aW5nJyB8ICdyZWFkeScgfCAnZXJyb3InIH0sIGxvZyk7XG5cblx0XHRcdGNvbnN0IHAgPSB3YWl0Rm9yU3RhdGUobXlPYnNlcnZhYmxlLCBwID0+IHAuc3RhdGUgPT09ICdyZWFkeScsIHAgPT4gcC5zdGF0ZSA9PT0gJ2Vycm9yJykudGhlbihyID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVzb2x2ZWQgJHtKU09OLnN0cmluZ2lmeShyKX1gKTtcblx0XHRcdH0sIChlcnIpID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVqZWN0ZWQgJHtKU09OLnN0cmluZ2lmeShlcnIpfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoeyBzdGF0ZTogJ3JlYWR5JyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgW29iamVjdCBPYmplY3RdKScsXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRhd2FpdCBwO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQncmVzb2x2ZWQge1xcXCJzdGF0ZVxcXCI6XFxcInJlYWR5XFxcIn0nLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlSW1tZWRpYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlID0gbmV3IExvZ2dpbmdPYnNlcnZhYmxlVmFsdWUoJ215T2JzZXJ2YWJsZScsIHsgc3RhdGU6ICdyZWFkeScgYXMgJ2luaXRpYWxpemluZycgfCAncmVhZHknIHwgJ2Vycm9yJyB9LCBsb2cpO1xuXG5cdFx0XHRjb25zdCBwID0gd2FpdEZvclN0YXRlKG15T2JzZXJ2YWJsZSwgcCA9PiBwLnN0YXRlID09PSAncmVhZHknLCBwID0+IHAuc3RhdGUgPT09ICdlcnJvcicpLnRoZW4ociA9PiB7XG5cdFx0XHRcdGxvZy5sb2coYHJlc29sdmVkICR7SlNPTi5zdHJpbmdpZnkocil9YCk7XG5cdFx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRcdGxvZy5sb2coYHJlamVjdGVkICR7SlNPTi5zdHJpbmdpZnkoZXJyKX1gKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmZpcnN0T2JzZXJ2ZXJBZGRlZCcsXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRteU9ic2VydmFibGUuc2V0KHsgc3RhdGU6ICdlcnJvcicgfSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIFtvYmplY3QgT2JqZWN0XSknLFxuXHRcdFx0XSk7XG5cblx0XHRcdGF3YWl0IHA7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdyZXNvbHZlZCB7XFxcInN0YXRlXFxcIjpcXFwicmVhZHlcXFwifScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCB7IHN0YXRlOiAnaW5pdGlhbGl6aW5nJyBhcyAnaW5pdGlhbGl6aW5nJyB8ICdyZWFkeScgfCAnZXJyb3InIH0sIGxvZyk7XG5cblx0XHRcdGNvbnN0IHAgPSB3YWl0Rm9yU3RhdGUobXlPYnNlcnZhYmxlLCBwID0+IHAuc3RhdGUgPT09ICdyZWFkeScsIHAgPT4gcC5zdGF0ZSA9PT0gJ2Vycm9yJykudGhlbihyID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVzb2x2ZWQgJHtKU09OLnN0cmluZ2lmeShyKX1gKTtcblx0XHRcdH0sIChlcnIpID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgcmVqZWN0ZWQgJHtKU09OLnN0cmluZ2lmeShlcnIpfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoeyBzdGF0ZTogJ2Vycm9yJyB9LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgW29iamVjdCBPYmplY3RdKScsXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5sYXN0T2JzZXJ2ZXJSZW1vdmVkJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRhd2FpdCBwO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQncmVqZWN0ZWQge1xcXCJzdGF0ZVxcXCI6XFxcImVycm9yXFxcIn0nXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlcml2ZWQgYXMgbGF6eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0bGV0IGkgPSAwO1xuXHRcdFx0Y29uc3QgZCA9IGRlcml2ZWREaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgaWQgPSBpKys7XG5cdFx0XHRcdGxvZy5sb2coJ215RGVyaXZlZCAnICsgaWQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGxvZy5sb2coYGRpc3Bvc2VkICR7aWR9YClcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0XHRkLmdldCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnbXlEZXJpdmVkIDAnLCAnZGlzcG9zZWQgMCddKTtcblx0XHRcdGQuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydteURlcml2ZWQgMScsICdkaXNwb3NlZCAxJ10pO1xuXG5cdFx0XHRkLmtlZXBPYnNlcnZlZChzdG9yZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXHRcdFx0ZC5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ215RGVyaXZlZCAyJ10pO1xuXHRcdFx0ZC5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsnZGlzcG9zZWQgMiddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb2JzZXJ2YWJsZVZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4oJ215T2JzZXJ2YWJsZTEnLCAwKTtcblx0XHRjb25zdCBteU9ic2VydmFibGUyID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciwgeyBtZXNzYWdlOiBzdHJpbmcgfT4oJ215T2JzZXJ2YWJsZTInLCAwKTtcblxuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSAqL1xuXHRcdFx0Y29uc3QgdjEgPSBteU9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHYyID0gbXlPYnNlcnZhYmxlMi5yZWFkKHJlYWRlcik7XG5cdFx0XHRsb2cubG9nKCdhdXRvcnVuLCBteU9ic2VydmFibGUxOicgKyB2MSArICcsIG15T2JzZXJ2YWJsZTI6JyArIHYyKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnYXV0b3J1biwgbXlPYnNlcnZhYmxlMTowLCBteU9ic2VydmFibGUyOjAnXG5cdFx0XSk7XG5cblx0XHQvLyBEb2Vzbid0IHRyaWdnZXIgdGhlIGF1dG9ydW4sIGJlY2F1c2Ugbm8gZGVsdGEgd2FzIHByb3ZpZGVkIGFuZCB0aGUgdmFsdWUgZGlkIG5vdCBjaGFuZ2Vcblx0XHRteU9ic2VydmFibGUxLnNldCgwLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRdKTtcblxuXHRcdC8vIFRyaWdnZXJzIHRoZSBhdXRvcnVuLiBUaGUgdmFsdWUgZGlkIG5vdCBjaGFuZ2UsIGJ1dCBhIGRlbHRhIHZhbHVlIHdhcyBwcm92aWRlZFxuXHRcdG15T2JzZXJ2YWJsZTIuc2V0KDAsIHVuZGVmaW5lZCwgeyBtZXNzYWdlOiAnY2hhbmdlMScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0J2F1dG9ydW4sIG15T2JzZXJ2YWJsZTE6MCwgbXlPYnNlcnZhYmxlMjowJ1xuXHRcdF0pO1xuXG5cdFx0ZC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvcnVuIGVycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ltbWVkaWF0ZSB0aHJvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihlID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0XHRjb25zdCBkID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Zvb2JhcicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnZXJyb3I6IGZvb2Jhcidcblx0XHRcdF0pO1xuXG5cdFx0XHRteU9ic2VydmFibGUuc2V0KDEsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdFx0J2Vycm9yOiBmb29iYXInLFxuXHRcdFx0XSk7XG5cblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGF0ZSB0aHJvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihlID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgZXJyb3I6ICR7ZS5tZXNzYWdlfWApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0XHRjb25zdCBkID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IG15T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICh2YWx1ZSA+PSAxKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmb29iYXInKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XSk7XG5cblx0XHRcdG15T2JzZXJ2YWJsZS5zZXQoMSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5zZXQgKHZhbHVlIDEpJyxcblx0XHRcdFx0J215T2JzZXJ2YWJsZS5nZXQnLFxuXHRcdFx0XHQnZXJyb3I6IGZvb2JhcicsXG5cdFx0XHRdKTtcblxuXHRcdFx0bXlPYnNlcnZhYmxlLnNldCgyLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLnNldCAodmFsdWUgMiknLFxuXHRcdFx0XHQnbXlPYnNlcnZhYmxlLmdldCcsXG5cdFx0XHRcdCdlcnJvcjogZm9vYmFyJyxcblx0XHRcdF0pO1xuXG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2Ugc2hvdWxkIHdvcmsgd2hlbiBhIGRlcGVuZGVuY3kgc2V0cyBhbiBvYnNlcnZhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdGNvbnN0IG15T2JzZXJ2YWJsZSA9IG5ldyBMb2dnaW5nT2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGUnLCAwLCBsb2cpO1xuXG5cdFx0bGV0IHNob3VsZFVwZGF0ZSA9IHRydWU7XG5cblx0XHRjb25zdCBteURlcml2ZWQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIG15RGVyaXZlZCAqL1xuXG5cdFx0XHRsb2cubG9nKCdteURlcml2ZWQuY29tcHV0ZWQgc3RhcnQnKTtcblxuXHRcdFx0Y29uc3QgdmFsID0gbXlPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKHNob3VsZFVwZGF0ZSkge1xuXHRcdFx0XHRzaG91bGRVcGRhdGUgPSBmYWxzZTtcblx0XHRcdFx0bXlPYnNlcnZhYmxlLnNldCgxLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRsb2cubG9nKCdteURlcml2ZWQuY29tcHV0ZWQgZW5kJyk7XG5cblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtdKSk7XG5cblx0XHRteURlcml2ZWQucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2Uoc3RvcmUsIHZhbCA9PiB7XG5cdFx0XHRsb2cubG9nKGByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSwgbXlEZXJpdmVkOiAke3ZhbH1gKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHQnbXlEZXJpdmVkLmNvbXB1dGVkIHN0YXJ0Jyxcblx0XHRcdCdteU9ic2VydmFibGUuZmlyc3RPYnNlcnZlckFkZGVkJyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteU9ic2VydmFibGUuc2V0ICh2YWx1ZSAxKScsXG5cdFx0XHQnbXlEZXJpdmVkLmNvbXB1dGVkIGVuZCcsXG5cdFx0XHQnbXlEZXJpdmVkLmNvbXB1dGVkIHN0YXJ0Jyxcblx0XHRcdCdteU9ic2VydmFibGUuZ2V0Jyxcblx0XHRcdCdteURlcml2ZWQuY29tcHV0ZWQgZW5kJyxcblx0XHRcdCdyZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSwgbXlEZXJpdmVkOiAxJyxcblx0XHRdKTtcblxuXHRcdG15RGVyaXZlZC5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtdKSk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcmV2ZW50IGludmFsaWQgdXNhZ2UnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ3JlYWRpbmcgb3V0c2lkZSBvZiBjb21wdXRlIGZ1bmN0aW9uJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZGVyaXZlZCcsICgpID0+IHtcblx0XHRcdFx0bGV0IGZuOiAoKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXG5cdFx0XHRcdGNvbnN0IG9icyA9IG9ic2VydmFibGVWYWx1ZSgnb2JzJywgMCk7XG5cdFx0XHRcdGNvbnN0IGQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Zm4gPSAoKSA9PiB7IG9icy5yZWFkKHJlYWRlcik7IH07XG5cdFx0XHRcdFx0cmV0dXJuIG9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGRpc3AgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0ZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdGZuKCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGRpc3AuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2F1dG9ydW4nLCAoKSA9PiB7XG5cdFx0XHRcdGxldCBmbjogKCkgPT4gdm9pZCA9ICgpID0+IHsgfTtcblxuXHRcdFx0XHRjb25zdCBvYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ29icycsIDApO1xuXHRcdFx0XHRjb25zdCBkaXNwID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGZuID0gKCkgPT4geyBvYnMucmVhZChyZWFkZXIpOyB9O1xuXHRcdFx0XHRcdG9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdGZuKCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGRpc3AuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ2NhdGNoZXMgY3ljbGljIGRlcGVuZGVuY2llcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0c2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoZSkgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGUudG9TdHJpbmcoKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgb2JzID0gb2JzZXJ2YWJsZVZhbHVlKCdvYnMnLCAwKTtcblx0XHRcdGNvbnN0IGQxID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKCdkMS5jb21wdXRlZCBzdGFydCcpO1xuXHRcdFx0XHRjb25zdCB4ID0gb2JzLnJlYWQocmVhZGVyKSArIGQyLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZygnZDEuY29tcHV0ZWQgZW5kJyk7XG5cdFx0XHRcdHJldHVybiB4O1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBkMiA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0bG9nLmxvZygnZDIuY29tcHV0ZWQgc3RhcnQnKTtcblx0XHRcdFx0ZDEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKCdkMi5jb21wdXRlZCBlbmQnKTtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGlzcCA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0bG9nLmxvZygnYXV0b3J1biBzdGFydCcpO1xuXHRcdFx0XHRkMS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxvZy5sb2coJ2F1dG9ydW4gZW5kJyk7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnYXV0b3J1biBzdGFydCcsXG5cdFx0XHRcdCdkMS5jb21wdXRlZCBzdGFydCcsXG5cdFx0XHRcdCdkMi5jb21wdXRlZCBzdGFydCcsXG5cdFx0XHRcdCdFcnJvcjogQ3ljbGljIGRlcml2ZWRzIGFyZSBub3Qgc3VwcG9ydGVkIHlldCEnLFxuXHRcdFx0XHQnZDEuY29tcHV0ZWQgZW5kJyxcblx0XHRcdFx0J2F1dG9ydW4gZW5kJ1xuXHRcdFx0XSkpO1xuXG5cdFx0XHRkaXNwLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ29ic2VydmFibGVSZWR1Y2VyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ21haW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblxuXHRcdFx0Y29uc3QgbXlPYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXIsIG51bWJlcj4oJ215T2JzZXJ2YWJsZTEnLCA1KTtcblx0XHRcdGNvbnN0IG15T2JzZXJ2YWJsZTIgPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyLCBudW1iZXI+KCdteU9ic2VydmFibGUyJywgOSk7XG5cblx0XHRcdGNvbnN0IHN1bSA9IG9ic2VydmFibGVSZWR1Y2VyKHRoaXMsIHtcblx0XHRcdFx0aW5pdGlhbDogKCkgPT4ge1xuXHRcdFx0XHRcdGxvZy5sb2coJ2NyZWF0ZUluaXRpYWwnKTtcblx0XHRcdFx0XHRyZXR1cm4gbXlPYnNlcnZhYmxlMS5nZXQoKSArIG15T2JzZXJ2YWJsZTIuZ2V0KCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRpc3Bvc2VGaW5hbDogKHZhbHVlcykgPT4ge1xuXHRcdFx0XHRcdGxvZy5sb2coYGRpc3Bvc2VGaW5hbCAke3ZhbHVlc31gKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlcyh7IG15T2JzZXJ2YWJsZTEsIG15T2JzZXJ2YWJsZTIgfSksXG5cdFx0XHRcdHVwZGF0ZTogKHJlYWRlcjogSURlcml2ZWRSZWFkZXI8bnVtYmVyPiwgcHJldmlvdXNWYWx1ZSwgY2hhbmdlcykgPT4ge1xuXHRcdFx0XHRcdGxvZy5sb2coYHVwZGF0ZSAke0pTT04uc3RyaW5naWZ5KGNoYW5nZXMpfWApO1xuXHRcdFx0XHRcdGxldCBkZWx0YSA9IDA7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhbmdlcy5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRkZWx0YSArPSBjaGFuZ2UuY2hhbmdlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJlYWRlci5yZXBvcnRDaGFuZ2UoZGVsdGEpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdFZhbHVlID0gcHJldmlvdXNWYWx1ZSArIGRlbHRhO1xuXHRcdFx0XHRcdGxvZy5sb2coYHVwZGF0ZSAtPiAke3Jlc3VsdFZhbHVlfWApO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW10pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW5XaXRoU3RvcmVIYW5kbGVDaGFuZ2VzKHtcblx0XHRcdFx0Y2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlcyh7IHN1bSB9KVxuXHRcdFx0fSwgKF9yZWFkZXIsIGNoYW5nZXMpID0+IHtcblx0XHRcdFx0bG9nLmxvZyhgYXV0b3J1biAke0pTT04uc3RyaW5naWZ5KGNoYW5nZXMpfWApO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnY3JlYXRlSW5pdGlhbCcsXG5cdFx0XHRcdCd1cGRhdGUge1wiY2hhbmdlc1wiOltdLFwibXlPYnNlcnZhYmxlMVwiOjUsXCJteU9ic2VydmFibGUyXCI6OX0nLFxuXHRcdFx0XHQndXBkYXRlIC0+IDE0Jyxcblx0XHRcdFx0J2F1dG9ydW4ge1wiY2hhbmdlc1wiOltdLFwic3VtXCI6MTR9Jyxcblx0XHRcdF0pO1xuXG5cdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZTEuc2V0KG15T2JzZXJ2YWJsZTEuZ2V0KCkgKyAxLCB0eCwgMSk7XG5cdFx0XHRcdG15T2JzZXJ2YWJsZTIuc2V0KG15T2JzZXJ2YWJsZTIuZ2V0KCkgKyAzLCB0eCwgMyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCd1cGRhdGUge1wiY2hhbmdlc1wiOlt7XCJrZXlcIjpcIm15T2JzZXJ2YWJsZTFcIixcImNoYW5nZVwiOjF9LHtcImtleVwiOlwibXlPYnNlcnZhYmxlMlwiLFwiY2hhbmdlXCI6M31dLFwibXlPYnNlcnZhYmxlMVwiOjYsXCJteU9ic2VydmFibGUyXCI6MTJ9Jyxcblx0XHRcdFx0J3VwZGF0ZSAtPiAxOCcsXG5cdFx0XHRcdCdhdXRvcnVuIHtcImNoYW5nZXNcIjpbe1wia2V5XCI6XCJzdW1cIixcImNoYW5nZVwiOjR9XSxcInN1bVwiOjE4fSdcblx0XHRcdF0pKTtcblxuXHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRteU9ic2VydmFibGUxLnNldChteU9ic2VydmFibGUxLmdldCgpICsgMSwgdHgsIDEpO1xuXHRcdFx0XHRjb25zdCBzID0gc3VtLmdldCgpO1xuXHRcdFx0XHRsb2cubG9nKGBzdW0uZ2V0KCkgJHtzfWApO1xuXHRcdFx0XHRteU9ic2VydmFibGUyLnNldChteU9ic2VydmFibGUyLmdldCgpICsgMywgdHgsIDMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQndXBkYXRlIHtcImNoYW5nZXNcIjpbe1wia2V5XCI6XCJteU9ic2VydmFibGUxXCIsXCJjaGFuZ2VcIjoxfV0sXCJteU9ic2VydmFibGUxXCI6NyxcIm15T2JzZXJ2YWJsZTJcIjoxMn0nLFxuXHRcdFx0XHQndXBkYXRlIC0+IDE5Jyxcblx0XHRcdFx0J3N1bS5nZXQoKSAxOScsXG5cdFx0XHRcdCd1cGRhdGUge1wiY2hhbmdlc1wiOlt7XCJrZXlcIjpcIm15T2JzZXJ2YWJsZTJcIixcImNoYW5nZVwiOjN9XSxcIm15T2JzZXJ2YWJsZTFcIjo3LFwibXlPYnNlcnZhYmxlMlwiOjE1fScsXG5cdFx0XHRcdCd1cGRhdGUgLT4gMjInLFxuXHRcdFx0XHQnYXV0b3J1biB7XCJjaGFuZ2VzXCI6W3tcImtleVwiOlwic3VtXCIsXCJjaGFuZ2VcIjoxfV0sXCJzdW1cIjoyMn0nXG5cdFx0XHRdKSk7XG5cblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdkaXNwb3NlRmluYWwgMjInXG5cdFx0XHRdKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkaXNwb3NhYmxlU3RvcmVzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Rlcml2ZWQgd2l0aCBzdG9yZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IG9ic2VydmFibGUxID0gb2JzZXJ2YWJsZVZhbHVlKCdteU9ic2VydmFibGVWYWx1ZTEnLCAwKTtcblxuXHRcdFx0Y29uc3QgY29tcHV0ZWQxID0gZGVyaXZlZCgocmVhZGVyKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZTEucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRsb2cubG9nKGBjb21wdXRlZCAke3ZhbHVlfWApO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgY29tcHV0ZWQxOiAke3ZhbHVlfSBkaXNwb3NlZGApO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRsb2cubG9nKGBhOiAke2NvbXB1dGVkMS5yZWFkKHJlYWRlcil9YCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHRcdCdjb21wdXRlZCAwJyxcblx0XHRcdFx0J2E6IDAnXG5cdFx0XHRdKSk7XG5cblx0XHRcdG9ic2VydmFibGUxLnNldCgxLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2NvbXB1dGVkMTogMCBkaXNwb3NlZCcsXG5cdFx0XHRcdCdjb21wdXRlZCAxJyxcblx0XHRcdFx0J2E6IDEnXG5cdFx0XHRdKSk7XG5cblx0XHRcdGEuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2NvbXB1dGVkMTogMSBkaXNwb3NlZCdcblx0XHRcdF0pKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rlcml2ZWQgd2l0aCBkZWxheWVkU3RvcmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlMSA9IG9ic2VydmFibGVWYWx1ZSgnbXlPYnNlcnZhYmxlVmFsdWUxJywgMCk7XG5cblx0XHRcdGNvbnN0IGNvbXB1dGVkMSA9IGRlcml2ZWQoKHJlYWRlcikgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IG9ic2VydmFibGUxLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bG9nLmxvZyhgY29tcHV0ZWQgJHt2YWx1ZX1gKTtcblx0XHRcdFx0cmVhZGVyLmRlbGF5ZWRTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRsb2cubG9nKGBjb21wdXRlZDE6ICR7dmFsdWV9IGRpc3Bvc2VkYCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGEgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGxvZy5sb2coYGE6ICR7Y29tcHV0ZWQxLnJlYWQocmVhZGVyKX1gKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgKFtcblx0XHRcdFx0J2NvbXB1dGVkIDAnLFxuXHRcdFx0XHQnYTogMCdcblx0XHRcdF0pKTtcblxuXHRcdFx0b2JzZXJ2YWJsZTEuc2V0KDEsIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnY29tcHV0ZWQgMScsXG5cdFx0XHRcdCdjb21wdXRlZDE6IDAgZGlzcG9zZWQnLFxuXHRcdFx0XHQnYTogMSdcblx0XHRcdF0pKTtcblxuXHRcdFx0YS5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0XHQnY29tcHV0ZWQxOiAxIGRpc3Bvc2VkJ1xuXHRcdFx0XSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVkSGFuZGxlQ2hhbmdlcyB3aXRoIHJlcG9ydENoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXG5cdFx0Y29uc3Qgc2lnbmFsMSA9IG9ic2VydmFibGVTaWduYWw8eyBtZXNzYWdlOiBzdHJpbmcgfT4oJ3NpZ25hbDEnKTtcblx0XHRjb25zdCBzaWduYWwyID0gb2JzZXJ2YWJsZVNpZ25hbDx7IG1lc3NhZ2U6IHN0cmluZyB9Pignc2lnbmFsMicpO1xuXG5cdFx0Y29uc3Qgc2lnbmFsMkRlcml2ZWQgPSBkZXJpdmVkSGFuZGxlQ2hhbmdlcyhcblx0XHRcdHsgY2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlcyh7IHNpZ25hbDIgfSkgfSxcblx0XHRcdChyZWFkZXI6IElEZXJpdmVkUmVhZGVyPHsgbWVzc2FnZTogc3RyaW5nIH0+LCBjaGFuZ2VTdW1tYXJ5KSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgYyBvZiBjaGFuZ2VTdW1tYXJ5LmNoYW5nZXMpIHtcblx0XHRcdFx0XHRyZWFkZXIucmVwb3J0Q2hhbmdlKHsgbWVzc2FnZTogYy5jaGFuZ2UubWVzc2FnZSArICcgKGRlcml2ZWQpJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCBkID0gZGVyaXZlZEhhbmRsZUNoYW5nZXMoe1xuXHRcdFx0Y2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlcyh7IHNpZ25hbDEsIHNpZ25hbDJEZXJpdmVkIH0pLFxuXHRcdH0sIChyOiBJRGVyaXZlZFJlYWRlcjxzdHJpbmc+LCBjaGFuZ2VzKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBjaGFuZ2VzLmNoYW5nZXMubWFwKGMgPT4gYCR7Yy5rZXl9OiAke2MuY2hhbmdlLm1lc3NhZ2V9YCkuam9pbignLCAnKTtcblx0XHRcdHIucmVwb3J0Q2hhbmdlKGxvZyk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwID0gcnVuT25DaGFuZ2UoZCwgKF92YWwsIF9wcmV2LCBjaGFuZ2VzKSA9PiB7XG5cdFx0XHRsb2cubG9nKGBydW5PbkNoYW5nZSAke0pTT04uc3RyaW5naWZ5KGNoYW5nZXMpfWApO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXSkpO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0c2lnbmFsMS50cmlnZ2VyKHR4LCB7IG1lc3NhZ2U6ICdmb28nIH0pO1xuXHRcdFx0c2lnbmFsMi50cmlnZ2VyKHR4LCB7IG1lc3NhZ2U6ICdiYXInIH0pO1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIChbXG5cdFx0XHQncnVuT25DaGFuZ2UgW1wic2lnbmFsMTogZm9vLCBzaWduYWwyRGVyaXZlZDogYmFyIChkZXJpdmVkKVwiXSdcblx0XHRdKSk7XG5cblxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHNpZ25hbDIudHJpZ2dlcih0eCwgeyBtZXNzYWdlOiAnYmF6JyB9KTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCAoW1xuXHRcdFx0J3J1bk9uQ2hhbmdlIFtcInNpZ25hbDJEZXJpdmVkOiBiYXogKGRlcml2ZWQpXCJdJ1xuXHRcdF0pKTtcblxuXHRcdGRpc3AuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b3J1blBlcktleWVkSXRlbScsICgpID0+IHtcblx0XHR0ZXN0KCdydW5zIHNldHVwIG9uY2UgcGVyIGtleSwgZmlyZXMgcGVyLWtleSBvYnNlcnZhYmxlIG9uIGluLXBsYWNlIHZhbHVlIGNoYW5nZSwgZGlzcG9zZXMgb24gcmVtb3ZhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGxvZyA9IG5ldyBMb2coKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IHsgaWQ6IHN0cmluZzsgdjogbnVtYmVyIH1bXT4oJ2l0ZW1zJywgW10pO1xuXG5cdFx0XHRjb25zdCBkID0gZHMuYWRkKGF1dG9ydW5QZXJLZXllZEl0ZW0oXG5cdFx0XHRcdGl0ZW1zLFxuXHRcdFx0XHRpdCA9PiBpdC5pZCxcblx0XHRcdFx0KGtleSwgdmFsdWUsIHN0b3JlKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgc2V0dXAoJHtrZXl9KWApO1xuXHRcdFx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gbG9nLmxvZyhgZGlzcG9zZSgke2tleX0pYCkpKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdiA9IHZhbHVlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGxvZy5sb2coYGF1dG9ydW4oJHtrZXl9KTogdj0ke3Yudn1gKTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtdKTtcblxuXHRcdFx0aXRlbXMuc2V0KFt7IGlkOiAnYScsIHY6IDEgfSwgeyBpZDogJ2InLCB2OiAxIH1dLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFtcblx0XHRcdFx0J3NldHVwKGEpJyxcblx0XHRcdFx0J2F1dG9ydW4oYSk6IHY9MScsXG5cdFx0XHRcdCdzZXR1cChiKScsXG5cdFx0XHRcdCdhdXRvcnVuKGIpOiB2PTEnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIEluLXBsYWNlIHZhbHVlIGNoYW5nZSBvbiBgYWAgKHNhbWUga2V5LCBuZXcgaW1tdXRhYmxlIG9iamVjdCkgXHUyMTkyIGl0c1xuXHRcdFx0Ly8gcGVyLWtleSBvYnNlcnZhYmxlIGZpcmVzLiBgYmAgaXMgYWxzbyBhIG5ldyBvYmplY3QgbGl0ZXJhbCBoZXJlLCBzb1xuXHRcdFx0Ly8gaXRzIG9ic2VydmFibGUgZmlyZXMgdG9vOiBpZGVudGl0eSBjb21wYXJpc29uLCBub3QgZGVlcC1lcXVhbGl0eS5cblx0XHRcdGl0ZW1zLnNldChbeyBpZDogJ2EnLCB2OiAyIH0sIHsgaWQ6ICdiJywgdjogMSB9XSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdhdXRvcnVuKGEpOiB2PTInLFxuXHRcdFx0XHQnYXV0b3J1bihiKTogdj0xJyxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBSZW1vdmUgYGFgOiBpdHMgc3RvcmUgaXMgZGlzcG9zZWQ7IGBiYCBzdXJ2aXZlcyAoaXRzIG9ic2VydmFibGVcblx0XHRcdC8vIGFsc28gZmlyZXMgYmVjYXVzZSB0aGUgbmV3IGFycmF5IGNvbnRhaW5zIGEgZnJlc2ggb2JqZWN0IGxpdGVyYWxcblx0XHRcdC8vIGZvciBgYmApLlxuXHRcdFx0aXRlbXMuc2V0KFt7IGlkOiAnYicsIHY6IDEgfV0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW1xuXHRcdFx0XHQnZGlzcG9zZShhKScsXG5cdFx0XHRcdCdhdXRvcnVuKGIpOiB2PTEnLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIEFkZCBgYWAgYmFjazogc2V0dXAgcnVucyBhZ2FpbiBmcm9tIHNjcmF0Y2guIGBiYCBmaXJlcyBvbmNlIG1vcmVcblx0XHRcdC8vIGJlY2F1c2UgdGhlIG5ldyBhcnJheSBsaXRlcmFsIGNvbnRhaW5zIGEgZnJlc2ggYGJgIG9iamVjdC5cblx0XHRcdGl0ZW1zLnNldChbeyBpZDogJ2InLCB2OiAxIH0sIHsgaWQ6ICdhJywgdjogOSB9XSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXG5cdFx0XHRcdCdhdXRvcnVuKGIpOiB2PTEnLFxuXHRcdFx0XHQnc2V0dXAoYSknLFxuXHRcdFx0XHQnYXV0b3J1bihhKTogdj05Jyxcblx0XHRcdF0pO1xuXG5cdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdC8vIERpc3Bvc2luZyB0aGUgYXV0b3J1biBkaXNwb3NlcyBhbGwgcmVtYWluaW5nIHBlci1rZXkgc3RvcmVzLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCkuc29ydCgpLCBbXG5cdFx0XHRcdCdkaXNwb3NlKGEpJyxcblx0XHRcdFx0J2Rpc3Bvc2UoYiknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXRjaGVzIHBlci1rZXkgdmFsdWUgdXBkYXRlcyBhdG9taWNhbGx5IGFjcm9zcyBvbmUgaXRlbXMgY2hhbmdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9nID0gbmV3IExvZygpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgeyBpZDogc3RyaW5nOyB2OiBudW1iZXIgfVtdPignaXRlbXMnLCBbXG5cdFx0XHRcdHsgaWQ6ICdhJywgdjogMCB9LFxuXHRcdFx0XHR7IGlkOiAnYicsIHY6IDAgfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRkcy5hZGQoYXV0b3J1blBlcktleWVkSXRlbShcblx0XHRcdFx0aXRlbXMsXG5cdFx0XHRcdGl0ID0+IGl0LmlkLFxuXHRcdFx0XHQoa2V5LCB2YWx1ZSwgc3RvcmUpID0+IHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0bG9nLmxvZyhgJHtrZXl9PSR7dmFsdWUucmVhZChyZWFkZXIpLnZ9YCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ2E9MCcsICdiPTAnXSk7XG5cblx0XHRcdC8vIFNpbmdsZSB1cHN0cmVhbSBjaGFuZ2UgdXBkYXRlcyBib3RoIGtleXM7IHBlci1rZXkgYXV0b3J1bnMgZWFjaCBmaXJlXG5cdFx0XHQvLyBvbmNlIHdpdGggdGhlIHBvc3QtY2hhbmdlIHZhbHVlcy5cblx0XHRcdGl0ZW1zLnNldChbeyBpZDogJ2EnLCB2OiAxIH0sIHsgaWQ6ICdiJywgdjogMiB9XSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ2E9MScsICdiPTInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBmaXJlIHBlci1rZXkgb2JzZXJ2YWJsZSB3aGVuIHNhbWUgaXRlbSBpZGVudGl0eSBpcyByZXVzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRjb25zdCBhID0geyBpZDogJ2EnLCB2OiAxIH07XG5cdFx0XHRjb25zdCBpdGVtcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSB7IGlkOiBzdHJpbmc7IHY6IG51bWJlciB9W10+KCdpdGVtcycsIFthXSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuUGVyS2V5ZWRJdGVtKFxuXHRcdFx0XHRpdGVtcyxcblx0XHRcdFx0aXQgPT4gaXQuaWQsXG5cdFx0XHRcdChfa2V5LCB2YWx1ZSwgc3RvcmUpID0+IHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4gbG9nLmxvZyhgdj0ke3ZhbHVlLnJlYWQocmVhZGVyKS52fWApKSk7XG5cdFx0XHRcdH1cblx0XHRcdCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cuZ2V0QW5kQ2xlYXJFbnRyaWVzKCksIFsndj0xJ10pO1xuXG5cdFx0XHQvLyBTYW1lIGFycmF5IHNoYXBlLCBzYW1lIGl0ZW0gaWRlbnRpdHkgXHUyMTkyIG5vIHZhbHVlIGNoYW5nZSwgbm8gYXV0b3J1biBmaXJlLlxuXHRcdFx0aXRlbXMuc2V0KFthXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwZXIta2V5IHNldHVwIGZpcmVzIHdoZW4gaXRlbXMgZGVyaXZlZCB0aHJvdWdoIG9ic2VydmFibGVGcm9tRXZlbnQgY2hhaW4gdXBkYXRlcycsICgpID0+IHtcblx0XHRcdC8vIE1pcnJvcnMgaG93IGFnZW50SG9zdFNlc3Npb25IYW5kbGVyIHVzZXMgb2JzZXJ2YWJsZUZyb21FdmVudCBcdTIxOTJcblx0XHRcdC8vIGRlcml2ZWQoYWN0aXZlVHVybikgXHUyMTkyIGRlcml2ZWQocmVzcG9uc2VQYXJ0cykgXHUyMTkyIGF1dG9ydW5QZXJLZXllZEl0ZW0uXG5cdFx0XHQvLyBWZXJpZmllcyB0aGF0IGluY3JlbWVudGFsIHVwc3RyZWFtIEV2ZW50IGZpcmVzIHByb3BhZ2F0ZSB0aHJvdWdoXG5cdFx0XHQvLyB0aGUgY2hhaW4gYW5kIHRoZSBwZXIta2V5IHNldHVwIG9ic2VydmVzIHRoZSBuZXcgaXRlbXMuXG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgTG9nKCk7XG5cdFx0XHRpbnRlcmZhY2UgUGFydCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZyB9XG5cdFx0XHRpbnRlcmZhY2UgU3RhdGUgeyByZWFkb25seSBhY3RpdmU/OiB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHBhcnRzOiByZWFkb25seSBQYXJ0W10gfSB9XG5cblx0XHRcdGxldCBjdXJyZW50OiBTdGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9uQ2hhbmdlID0gZHMuYWRkKG5ldyBFbWl0dGVyPFN0YXRlPigpKTtcblx0XHRcdGNvbnN0IGZha2VTdWIgPSB7IHZhbHVlOiB1bmRlZmluZWQgYXMgU3RhdGUgfCB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlOiBvbkNoYW5nZS5ldmVudCB9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlJCA9IG9ic2VydmFibGVGcm9tRXZlbnQodW5kZWZpbmVkLCBmYWtlU3ViLm9uRGlkQ2hhbmdlLCAoKSA9PiBmYWtlU3ViLnZhbHVlKTtcblx0XHRcdGNvbnN0IGZpcmUgPSAoczogU3RhdGUpID0+IHsgY3VycmVudCA9IHM7IGZha2VTdWIudmFsdWUgPSBzOyBvbkNoYW5nZS5maXJlKHMpOyB9O1xuXG5cdFx0XHRjb25zdCB0dXJuJCA9IGRlcml2ZWQocmVhZGVyID0+IHNlc3Npb25TdGF0ZSQucmVhZChyZWFkZXIpPy5hY3RpdmUpO1xuXHRcdFx0Y29uc3QgcGFydHMkID0gZGVyaXZlZChyZWFkZXIgPT4gdHVybiQucmVhZChyZWFkZXIpPy5wYXJ0cyA/PyBbXSk7XG5cblx0XHRcdGRzLmFkZChhdXRvcnVuUGVyS2V5ZWRJdGVtKFxuXHRcdFx0XHRwYXJ0cyQsXG5cdFx0XHRcdHAgPT4gcC5pZCxcblx0XHRcdFx0KGtleSwgcCQsIHN0b3JlKSA9PiB7XG5cdFx0XHRcdFx0bG9nLmxvZyhgc2V0dXAoJHtrZXl9KWApO1xuXHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiBsb2cubG9nKGAke2tleX09JHtwJC5yZWFkKHJlYWRlcikuY29udGVudC5sZW5ndGh9YCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgW10pO1xuXG5cdFx0XHQvLyBGaXJzdCBzdGF0ZSB3aXRoIG9uZSBwYXJ0IFx1MjAxNCBzYW1lIHNoYXBlIGFzIGEgdHVybiBzdGFydGluZyB3aXRoIGNvbnRlbnQuXG5cdFx0XHRmaXJlKHsgYWN0aXZlOiB7IGlkOiAndDEnLCBwYXJ0czogW3sgaWQ6ICdwMScsIGNvbnRlbnQ6ICdoZWxsbycgfV0gfSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLmdldEFuZENsZWFyRW50cmllcygpLCBbJ3NldHVwKHAxKScsICdwMT01J10pO1xuXG5cdFx0XHQvLyBBcHBlbmQgbW9yZSBjb250ZW50IHRvIHAxLlxuXHRcdFx0ZmlyZSh7IGFjdGl2ZTogeyBpZDogJ3QxJywgcGFydHM6IFt7IGlkOiAncDEnLCBjb250ZW50OiAnaGVsbG8gd29ybGQnIH1dIH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydwMT0xMSddKTtcblxuXHRcdFx0Ly8gQWRkIGEgbmV3IHBhcnQgcDIuIHAxIGFsc28gZmlyZXMgYmVjYXVzZSB0aGUgbmV3IGFycmF5IGxpdGVyYWxcblx0XHRcdC8vIGFsbG9jYXRlcyBhIGZyZXNoIG9iamVjdCBmb3IgaXQgKGlkZW50aXR5IGRpZmZlcnMgZXZlbiB0aG91Z2hcblx0XHRcdC8vIGNvbnRlbnQgaXMgdGhlIHNhbWUpLlxuXHRcdFx0ZmlyZSh7IGFjdGl2ZTogeyBpZDogJ3QxJywgcGFydHM6IFt7IGlkOiAncDEnLCBjb250ZW50OiAnaGVsbG8gd29ybGQnIH0sIHsgaWQ6ICdwMicsIGNvbnRlbnQ6ICdyZWFzb25pbmcnIH1dIH0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy5nZXRBbmRDbGVhckVudHJpZXMoKSwgWydwMT0xMScsICdzZXR1cChwMiknLCAncDI9OSddKTtcblx0XHRcdHZvaWQgY3VycmVudDtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZXhwb3J0IGNsYXNzIExvZ2dpbmdPYnNlcnZlciBpbXBsZW1lbnRzIElPYnNlcnZlciB7XG5cdHByaXZhdGUgY291bnQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBkZWJ1Z05hbWU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBsb2c6IExvZykge1xuXHR9XG5cblx0YmVnaW5VcGRhdGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLmNvdW50Kys7XG5cdFx0dGhpcy5sb2cubG9nKGAke3RoaXMuZGVidWdOYW1lfS5iZWdpblVwZGF0ZSAoY291bnQgJHt0aGlzLmNvdW50fSlgKTtcblx0fVxuXHRlbmRVcGRhdGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLmxvZy5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LmVuZFVwZGF0ZSAoY291bnQgJHt0aGlzLmNvdW50fSlgKTtcblx0XHR0aGlzLmNvdW50LS07XG5cdH1cblx0aGFuZGxlQ2hhbmdlPFQsIFRDaGFuZ2U+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxULCBUQ2hhbmdlPiwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5sb2cubG9nKGAke3RoaXMuZGVidWdOYW1lfS5oYW5kbGVDaGFuZ2UgKGNvdW50ICR7dGhpcy5jb3VudH0pYCk7XG5cdH1cblx0aGFuZGxlUG9zc2libGVDaGFuZ2U8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLmxvZy5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LmhhbmRsZVBvc3NpYmxlQ2hhbmdlYCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExvZ2dpbmdPYnNlcnZhYmxlVmFsdWU8VCwgVENoYW5nZSA9IHZvaWQ+XG5cdGV4dGVuZHMgQmFzZU9ic2VydmFibGU8VCwgVENoYW5nZT5cblx0aW1wbGVtZW50cyBJU2V0dGFibGVPYnNlcnZhYmxlPFQsIFRDaGFuZ2U+IHtcblx0cHJpdmF0ZSB2YWx1ZTogVDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGVidWdOYW1lOiBzdHJpbmcsXG5cdFx0aW5pdGlhbFZhbHVlOiBULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBMb2dcblx0KSB7XG5cdFx0c3VwZXIoRGVidWdMb2NhdGlvbi5vZkNhbGxlcigpKTtcblx0XHR0aGlzLnZhbHVlID0gaW5pdGlhbFZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uRmlyc3RPYnNlcnZlckFkZGVkKCk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmxvZyhgJHt0aGlzLmRlYnVnTmFtZX0uZmlyc3RPYnNlcnZlckFkZGVkYCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25MYXN0T2JzZXJ2ZXJSZW1vdmVkKCk6IHZvaWQge1xuXHRcdHRoaXMubG9nZ2VyLmxvZyhgJHt0aGlzLmRlYnVnTmFtZX0ubGFzdE9ic2VydmVyUmVtb3ZlZGApO1xuXHR9XG5cblx0cHVibGljIGdldCgpOiBUIHtcblx0XHR0aGlzLmxvZ2dlci5sb2coYCR7dGhpcy5kZWJ1Z05hbWV9LmdldGApO1xuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG5cblx0cHVibGljIHNldCh2YWx1ZTogVCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmFsdWUgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0eCkge1xuXHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0KHZhbHVlLCB0eCwgY2hhbmdlKTtcblx0XHRcdH0sICgpID0+IGBTZXR0aW5nICR7dGhpcy5kZWJ1Z05hbWV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dnZXIubG9nKGAke3RoaXMuZGVidWdOYW1lfS5zZXQgKHZhbHVlICR7dmFsdWV9KWApO1xuXG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXG5cdFx0Zm9yIChjb25zdCBvYnNlcnZlciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdHR4LnVwZGF0ZU9ic2VydmVyKG9ic2VydmVyLCB0aGlzKTtcblx0XHRcdG9ic2VydmVyLmhhbmRsZUNoYW5nZSh0aGlzLCBjaGFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuZGVidWdOYW1lfTogJHt0aGlzLnZhbHVlfWA7XG5cdH1cbn1cblxuY2xhc3MgTG9nIHtcblx0cHJpdmF0ZSByZWFkb25seSBlbnRyaWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwdWJsaWMgbG9nKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZW50cmllcy5wdXNoKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldEFuZENsZWFyRW50cmllcygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLmVudHJpZXNdO1xuXHRcdHRoaXMuZW50cmllcy5sZW5ndGggPSAwO1xuXHRcdHJldHVybiBlbnRyaWVzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQWdELFNBQVMsc0JBQXNCLHFCQUFxQiwrQkFBK0IsU0FBUyxtQkFBOEUsY0FBYyxxQkFBcUIsa0JBQWtCLGlCQUFpQixlQUFlLGFBQWEsY0FBYyxzQkFBc0IsYUFBYSxxQkFBcUI7QUFDbFksU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxzQkFBc0I7QUFFL0IsTUFBTSxlQUFlLE1BQU07QUFDMUIsUUFBTSxLQUFLLHdDQUF3QztBQUtuRCxRQUFNLFlBQVksTUFBTTtBQUN2QixTQUFLLHdCQUF3QixNQUFNO0FBQ2xDLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFJcEIsWUFBTSxlQUFlLGdCQUFnQixnQkFBZ0IsQ0FBQztBQU90RCxTQUFHLElBQUksUUFBUSxZQUFVO0FBUXhCLFlBQUksSUFBSSwrQkFBK0IsYUFBYSxLQUFLLE1BQU0sQ0FBQyxHQUFHO0FBQUEsTUFJcEUsQ0FBQyxDQUFDO0FBRUYsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLGdDQUFnQyxDQUFDO0FBR25GLG1CQUFhLElBQUksR0FBRyxNQUFTO0FBRTdCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQztBQUduRixtQkFBYSxJQUFJLEdBQUcsTUFBUztBQUU3QixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUduRCxrQkFBWSxDQUFDLE9BQU87QUFDbkIscUJBQWEsSUFBSSxHQUFHLEVBQUU7QUFFdEIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQscUJBQWEsSUFBSSxHQUFHLEVBQUU7QUFDdEIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRCxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLGdDQUFnQyxDQUFDO0FBQUEsSUFHcEYsQ0FBQztBQUVELFNBQUsscUJBQXFCLE1BQU07QUFDL0IsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixZQUFNLGNBQWMsZ0JBQWdCLGlCQUFpQixDQUFDO0FBQ3RELFlBQU0sY0FBYyxnQkFBZ0IsaUJBQWlCLENBQUM7QUFHdEQsWUFBTSxZQUFZLFFBQVEsWUFBVTtBQUVuQyxjQUFNLFNBQVMsWUFBWSxLQUFLLE1BQU07QUFDdEMsY0FBTSxTQUFTLFlBQVksS0FBSyxNQUFNO0FBQ3RDLGNBQU0sTUFBTSxTQUFTO0FBQ3JCLFlBQUksSUFBSSx3QkFBd0IsTUFBTSxNQUFNLE1BQU0sTUFBTSxHQUFHLEVBQUU7QUFDN0QsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUdELFNBQUcsSUFBSSxRQUFRLFlBQVU7QUFHeEIsWUFBSSxJQUFJLHdCQUF3QixVQUFVLEtBQUssTUFBTSxDQUFDLEdBQUc7QUFBQSxNQUMxRCxDQUFDLENBQUM7QUFFRixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsa0JBQVksSUFBSSxHQUFHLE1BQVM7QUFFNUIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGtCQUFZLElBQUksR0FBRyxNQUFTO0FBRTVCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFHRCxrQkFBWSxDQUFDLE9BQU87QUFDbkIsb0JBQVksSUFBSSxHQUFHLEVBQUU7QUFDckIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsb0JBQVksSUFBSSxHQUFHLEVBQUU7QUFDckIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRCxDQUFDO0FBSUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGtCQUFZLENBQUMsT0FBTztBQUNuQixvQkFBWSxJQUFJLEdBQUcsRUFBRTtBQUNyQixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUVuRCxvQkFBWSxJQUFJLEdBQUcsRUFBRTtBQUNyQixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BELENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJLENBQUMsaUNBQWlDLENBQUU7QUFBQSxJQUN2RixDQUFDO0FBRUQsU0FBSywyQkFBMkIsTUFBTTtBQUNyQyxZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFlBQU0sY0FBYyxnQkFBZ0IsaUJBQWlCLENBQUM7QUFDdEQsWUFBTSxjQUFjLGdCQUFnQixpQkFBaUIsQ0FBQztBQUV0RCxZQUFNLFlBQVksUUFBUSxDQUFDLFdBQVc7QUFFckMsY0FBTSxTQUFTLFlBQVksS0FBSyxNQUFNO0FBQ3RDLGNBQU0sU0FBUyxZQUFZLEtBQUssTUFBTTtBQUN0QyxjQUFNLE1BQU0sU0FBUztBQUNyQixZQUFJLElBQUksd0JBQXdCLE1BQU0sTUFBTSxNQUFNLE1BQU0sR0FBRyxFQUFFO0FBQzdELGVBQU87QUFBQSxNQUNSLENBQUM7QUFFRCxTQUFHLElBQUksUUFBUSxZQUFVO0FBRXhCLFlBQUksSUFBSSx3QkFBd0IsVUFBVSxLQUFLLE1BQU0sQ0FBQyxHQUFHO0FBQUEsTUFDMUQsQ0FBQyxDQUFDO0FBRUYsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGtCQUFZLENBQUMsT0FBTztBQUNuQixvQkFBWSxJQUFJLEtBQUssRUFBRTtBQUN2QixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUVuRCxrQkFBVSxJQUFJO0FBQ2QsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSSxDQUFDLG9DQUFvQyxDQUFFO0FBSXpGLG9CQUFZLElBQUksSUFBSSxFQUFFO0FBQ3RCLGVBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHlCQUF5QixNQUFNO0FBQ25DLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsWUFBTSxjQUFjLGdCQUFnQixzQkFBc0IsQ0FBQztBQUczRCxZQUFNLFlBQVksUUFBUSxDQUFDLFdBQVc7QUFFckMsY0FBTSxTQUFTLFlBQVksS0FBSyxNQUFNO0FBQ3RDLGNBQU0sU0FBUyxTQUFTO0FBQ3hCLFlBQUksSUFBSSxlQUFlLE1BQU0sVUFBVSxNQUFNLEVBQUU7QUFDL0MsZUFBTztBQUFBLE1BQ1IsQ0FBQztBQUNELFlBQU0sWUFBWSxRQUFRLENBQUMsV0FBVztBQUVyQyxjQUFNLFNBQVMsVUFBVSxLQUFLLE1BQU07QUFDcEMsY0FBTSxTQUFTLFNBQVM7QUFDeEIsWUFBSSxJQUFJLGVBQWUsTUFBTSxVQUFVLE1BQU0sRUFBRTtBQUMvQyxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQ0QsWUFBTSxZQUFZLFFBQVEsQ0FBQyxXQUFXO0FBRXJDLGNBQU0sU0FBUyxVQUFVLEtBQUssTUFBTTtBQUNwQyxjQUFNLFNBQVMsU0FBUztBQUN4QixZQUFJLElBQUksZUFBZSxNQUFNLFVBQVUsTUFBTSxFQUFFO0FBQy9DLGVBQU87QUFBQSxNQUNSLENBQUM7QUFDRCxZQUFNLGNBQWMsUUFBUSxDQUFDLFdBQVc7QUFFdkMsY0FBTSxTQUFTLFVBQVUsS0FBSyxNQUFNO0FBQ3BDLGNBQU0sU0FBUyxVQUFVLEtBQUssTUFBTTtBQUNwQyxjQUFNLFNBQVMsU0FBUztBQUN4QixZQUFJLElBQUksZUFBZSxNQUFNLE1BQU0sTUFBTSxNQUFNLE1BQU0sRUFBRTtBQUN2RCxlQUFPO0FBQUEsTUFDUixDQUFDO0FBQ0QsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsa0JBQVksSUFBSSxHQUFHLE1BQVM7QUFDNUIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFHbkQsVUFBSSxJQUFJLFVBQVUsWUFBWSxJQUFJLENBQUMsRUFBRTtBQUNyQyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsVUFBSSxJQUFJLFVBQVUsWUFBWSxJQUFJLENBQUMsRUFBRTtBQUVyQyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsWUFBTSxhQUFhLGFBQWEsV0FBVztBQUUzQyxVQUFJLElBQUksVUFBVSxZQUFZLElBQUksQ0FBQyxFQUFFO0FBQ3JDLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLElBQUksVUFBVSxZQUFZLElBQUksQ0FBQyxFQUFFO0FBQ3JDLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLE1BQ0QsQ0FBQztBQUdELGtCQUFZLElBQUksR0FBRyxNQUFTO0FBRTVCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUksQ0FBQyxDQUFFO0FBRXJELFVBQUksSUFBSSxVQUFVLFlBQVksSUFBSSxDQUFDLEVBQUU7QUFFckMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUNELFVBQUksSUFBSSxVQUFVLFlBQVksSUFBSSxDQUFDLEVBQUU7QUFFckMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSSxDQUFDLFdBQVcsQ0FBRTtBQUVoRSxpQkFBVyxRQUFRO0FBRW5CLFVBQUksSUFBSSxVQUFVLFlBQVksSUFBSSxDQUFDLEVBQUU7QUFFckMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELFVBQUksSUFBSSxVQUFVLFlBQVksSUFBSSxDQUFDLEVBQUU7QUFDckMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBT0YsQ0FBQztBQUVELFNBQUssMkNBQTJDLE1BQU07QUFDckQsWUFBTSxNQUFNLElBQUksSUFBSTtBQUtwQixZQUFNLFNBQVMsaUJBQWtDLFFBQVE7QUFFekQsWUFBTSxhQUFhLHFCQUFxQjtBQUFBLFFBQ3ZDLGVBQWU7QUFBQTtBQUFBLFVBRWQscUJBQXFCLE9BQU8sRUFBRSxNQUFNLENBQUMsRUFBYztBQUFBLFVBQ25ELGFBQWEsU0FBUyxlQUFlO0FBQ3BDLGdCQUFJLFFBQVEsVUFBVSxNQUFNLEdBQUc7QUFFOUIsNEJBQWMsS0FBSyxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQUEsWUFDM0M7QUFDQSxtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRCxHQUFHLENBQUMsUUFBUSxrQkFBa0I7QUFFN0IsZUFBTyxLQUFLLE1BQU07QUFDbEIsWUFBSSxJQUFJLFdBQVcsY0FBYyxLQUFLLEtBQUssSUFBSSxDQUFDO0FBQUEsTUFDakQsQ0FBQztBQUdELGFBQU8sUUFBUSxRQUFXLEVBQUUsS0FBSyxTQUFTLENBQUM7QUFFM0Msa0JBQVksUUFBTTtBQUdqQixlQUFPLFFBQVEsSUFBSSxFQUFFLEtBQUssUUFBUSxDQUFDO0FBQ25DLGVBQU8sUUFBUSxJQUFJLEVBQUUsS0FBSyxRQUFRLENBQUM7QUFBQSxNQUNwQyxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBS0YsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFDL0IsVUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixVQUFNLGdCQUFnQixnQkFBZ0IsaUJBQWlCLENBQUM7QUFDeEQsVUFBTSxnQkFBZ0IsZ0JBQWdCLGlCQUFpQixDQUFDO0FBRXhELFVBQU0sY0FBYyxRQUFRLFlBQVU7QUFFckMsWUFBTSxTQUFTLGNBQWMsS0FBSyxNQUFNO0FBQ3hDLFlBQU0sU0FBUyxjQUFjLEtBQUssTUFBTTtBQUN4QyxZQUFNLE1BQU0sU0FBUztBQUNyQixVQUFJLElBQUksd0NBQXdDLE1BQU0scUJBQXFCLE1BQU0sTUFBTSxHQUFHLEdBQUc7QUFDN0YsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFVBQU0sY0FBYyxRQUFRLFlBQVU7QUFFckMsWUFBTSxTQUFTLFlBQVksS0FBSyxNQUFNO0FBQ3RDLFlBQU0sU0FBUyxjQUFjLEtBQUssTUFBTTtBQUN4QyxZQUFNLFNBQVMsY0FBYyxLQUFLLE1BQU07QUFDeEMsWUFBTSxNQUFNLFNBQVMsU0FBUztBQUM5QixVQUFJLElBQUksc0NBQXNDLE1BQU0scUJBQXFCLE1BQU0scUJBQXFCLE1BQU0sTUFBTSxHQUFHLEdBQUc7QUFDdEgsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFVBQU0sY0FBYyxRQUFRLFlBQVU7QUFFckMsWUFBTSxTQUFTLFlBQVksS0FBSyxNQUFNO0FBQ3RDLFlBQU0sU0FBUyxjQUFjLEtBQUssTUFBTTtBQUN4QyxZQUFNLFNBQVMsY0FBYyxLQUFLLE1BQU07QUFDeEMsWUFBTSxNQUFNLFNBQVMsU0FBUztBQUM5QixVQUFJLElBQUksc0NBQXNDLE1BQU0scUJBQXFCLE1BQU0scUJBQXFCLE1BQU0sTUFBTSxHQUFHLEdBQUc7QUFDdEgsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELE9BQUcsSUFBSSxRQUFRLFlBQVU7QUFFeEIsVUFBSSxJQUFJLDhCQUE4QixZQUFZLEtBQUssTUFBTSxDQUFDLEdBQUc7QUFBQSxJQUNsRSxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxrQkFBYyxJQUFJLEdBQUcsTUFBUztBQUM5QixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxnQkFBWSxDQUFDLE9BQU87QUFDbkIsb0JBQWMsSUFBSSxHQUFHLEVBQUU7QUFDdkIsa0JBQVksSUFBSTtBQUNoQixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsb0JBQWMsSUFBSSxHQUFHLEVBQUU7QUFDdkIsa0JBQVksSUFBSTtBQUNoQixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sY0FBYyxNQUFNO0FBRXpCLGFBQVMsT0FBaUg7QUFDekgsWUFBTSxNQUFNLElBQUksSUFBSTtBQUVwQixVQUFJLFFBQTRCO0FBQ2hDLFlBQU0sZUFBZSxJQUFJLFFBQWM7QUFFdkMsVUFBSSxLQUFLO0FBQ1QsWUFBTSxhQUFhO0FBQUEsUUFDbEIsQ0FBQyxZQUFZO0FBQ1osZ0JBQU0sUUFBUTtBQUNkLGNBQUksSUFBSSxzQkFBc0IsS0FBSyxFQUFFO0FBQ3JDLGdCQUFNLGFBQWEsYUFBYSxNQUFNLE9BQU87QUFFN0MsaUJBQU87QUFBQSxZQUNOLFNBQVMsTUFBTTtBQUNkLGtCQUFJLElBQUksd0JBQXdCLEtBQUssRUFBRTtBQUN2Qyx5QkFBVyxRQUFRO0FBQUEsWUFDcEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0EsTUFBTTtBQUNMLGNBQUksSUFBSSxpQkFBaUIsS0FBSyxFQUFFO0FBQ2hDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVSxDQUFDLGFBQWE7QUFDdkIsa0JBQVE7QUFDUix1QkFBYSxLQUFLO0FBQUEsUUFDbkI7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLG9CQUFvQixNQUFNO0FBQzlCLFlBQU0sRUFBRSxLQUFLLFVBQVUsV0FBVyxJQUFJLEtBQUs7QUFFM0MsZUFBUyxNQUFTO0FBRWxCLFlBQU0sb0JBQW9CLFFBQVEsWUFBVTtBQUUzQyxtQkFBVyxLQUFLLE1BQU07QUFDdEIsWUFBSTtBQUFBLFVBQ0gsbUJBQW1CLFdBQVcsS0FBSyxNQUFNLENBQUM7QUFBQSxRQUMzQztBQUFBLE1BQ0QsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsZUFBUyxDQUFDO0FBRVYsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELHdCQUFrQixRQUFRO0FBRTFCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssU0FBUyxNQUFNO0FBQ25CLFlBQU0sRUFBRSxLQUFLLFVBQVUsV0FBVyxJQUFJLEtBQUs7QUFFM0MsWUFBTSx1QkFBdUIsZ0JBQWdCLHdCQUF3QixJQUFJO0FBRXpFLFlBQU0sb0JBQW9CLFFBQVEsWUFBVTtBQUUzQyxZQUFJLHFCQUFxQixLQUFLLE1BQU0sR0FBRztBQUN0QyxxQkFBVyxLQUFLLE1BQU07QUFDdEIsY0FBSTtBQUFBLFlBQ0gsc0NBQXNDLFdBQVcsS0FBSyxNQUFNLENBQUM7QUFBQSxVQUM5RDtBQUFBLFFBQ0QsT0FBTztBQUNOLGNBQUksSUFBSSw2QkFBNkI7QUFBQSxRQUN0QztBQUFBLE1BQ0QsQ0FBQztBQUNELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBR0QsVUFBSSxJQUFJLGNBQWMsV0FBVyxJQUFJLENBQUMsRUFBRTtBQUN4QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsY0FBYyxDQUFDO0FBRWpFLGVBQVMsQ0FBQztBQUVWLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFHRCwyQkFBcUIsSUFBSSxPQUFPLE1BQVM7QUFDekMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELDJCQUFxQixJQUFJLE1BQU0sTUFBUztBQUN4QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELHdCQUFrQixRQUFRO0FBQzFCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsseUJBQXlCLE1BQU07QUFDbkMsWUFBTSxFQUFFLEtBQUssV0FBVyxJQUFJLEtBQUs7QUFDakMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsVUFBSSxJQUFJLGNBQWMsV0FBVyxJQUFJLENBQUMsRUFBRTtBQUV4QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsVUFBSSxJQUFJLGNBQWMsV0FBVyxJQUFJLENBQUMsRUFBRTtBQUV4QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLE1BQU0sSUFBSSxJQUFJO0FBRXBCLFVBQU0sdUJBQXVCLGdCQUFnQixvQkFBb0IsSUFBSTtBQUNyRSxVQUFNLFNBQVMsSUFBSSx1QkFBdUIsVUFBVSxHQUFHLEdBQUc7QUFDMUQsVUFBTSxhQUFhLFFBQVEsWUFBVTtBQUVwQyxVQUFJLElBQUksc0JBQXNCO0FBQzlCLFVBQUkscUJBQXFCLEtBQUssTUFBTSxHQUFHO0FBQ3RDLGVBQU8sT0FBTyxLQUFLLE1BQU07QUFBQSxNQUMxQjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxPQUFHLElBQUksUUFBUSxZQUFVO0FBRXhCLFlBQU0sUUFBUSxXQUFXLEtBQUssTUFBTTtBQUNwQyxVQUFJLElBQUksY0FBYyxLQUFLLEVBQUU7QUFBQSxJQUM5QixDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxnQkFBWSxRQUFNO0FBQ2pCLGFBQU8sSUFBSSxHQUFHLEVBQUU7QUFDaEIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSSxDQUFDLHNCQUFzQixDQUFFO0FBRTNFLDJCQUFxQixJQUFJLE9BQU8sRUFBRTtBQUNsQyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJLENBQUMsQ0FBRTtBQUVyRCxpQkFBVyxJQUFJO0FBQ2YsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUksQ0FBQyxjQUFjLENBQUU7QUFBQSxFQUNwRSxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUNyRSxVQUFNLE1BQU0sSUFBSSxJQUFJO0FBRXBCLFVBQU0sa0JBQWtCLElBQUksdUJBQXVCLG1CQUFtQixNQUFNLEdBQUc7QUFDL0UsVUFBTSxTQUFTLElBQUksdUJBQXVCLFVBQVUsR0FBRyxHQUFHO0FBRTFELFVBQU0sY0FBYyxRQUFRLFlBQVU7QUFFckMsWUFBTSxZQUFZLE9BQU8sS0FBSyxNQUFNO0FBQ3BDLFlBQU0sU0FBUyxZQUFZO0FBQzNCLFVBQUksSUFBSSx1QkFBdUIsU0FBUyxlQUFlLE1BQU0sRUFBRTtBQUMvRCxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsT0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixZQUFNLGFBQWEsZ0JBQWdCLEtBQUssTUFBTTtBQUM5QyxVQUFJLFlBQVk7QUFDZixjQUFNLElBQUksWUFBWSxLQUFLLE1BQU07QUFDakMsWUFBSSxJQUFJLDRDQUE0QyxDQUFDLFFBQVE7QUFBQSxNQUM5RCxPQUFPO0FBQ04sWUFBSSxJQUFJLG1DQUFtQztBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELGdCQUFZLFFBQU07QUFDakIsc0JBQWdCLElBQUksT0FBTyxFQUFFO0FBQzdCLGFBQU8sSUFBSSxHQUFHLEVBQUU7QUFDaEIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxNQUNoRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsZ0JBQVksUUFBTTtBQUNqQixzQkFBZ0IsSUFBSSxNQUFNLEVBQUU7QUFDNUIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sbUNBQW1DLE1BQU07QUFDOUMsU0FBSyxzREFBc0QsTUFBTTtBQUNoRSxZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFlBQU0sZUFBZSxnQkFBZ0IsZ0JBQWdCLENBQUM7QUFFdEQsU0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixZQUFJLElBQUksK0JBQStCLGFBQWEsS0FBSyxNQUFNLENBQUMsR0FBRztBQUFBLE1BQ3BFLENBQUMsQ0FBQztBQUNGLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxnQ0FBZ0MsQ0FBQztBQUduRixrQkFBWSxDQUFDLE9BQU87QUFDbkIscUJBQWEsSUFBSSxHQUFHLEVBQUU7QUFDdEIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQscUJBQWEsSUFBSSxHQUFHLEVBQUU7QUFDdEIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNwRCxDQUFDO0FBQ0QsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLGdDQUFnQyxDQUFDO0FBQUEsSUFDcEYsQ0FBQztBQUVELFNBQUssdUVBQXVFLE1BQU07QUFDakYsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixZQUFNLGVBQWUsZ0JBQWdCLGdCQUFnQixDQUFDO0FBQ3RELFlBQU0sWUFBWSxRQUFRLFlBQVU7QUFFbkMsY0FBTSxNQUFNLGFBQWEsS0FBSyxNQUFNO0FBQ3BDLFlBQUksSUFBSSxnQ0FBZ0MsR0FBRyxHQUFHO0FBQzlDLGVBQU87QUFBQSxNQUNSLENBQUM7QUFFRCxTQUFHLElBQUksUUFBUSxZQUFVO0FBRXhCLFlBQUksSUFBSSw0QkFBNEIsVUFBVSxLQUFLLE1BQU0sQ0FBQyxHQUFHO0FBQUEsTUFDOUQsQ0FBQyxDQUFDO0FBQ0YsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGtCQUFZLENBQUMsT0FBTztBQUNuQixxQkFBYSxJQUFJLEdBQUcsRUFBRTtBQUN0QixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUVuRCxxQkFBYSxJQUFJLEdBQUcsRUFBRTtBQUN0QixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BELENBQUM7QUFDRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsWUFBTSxlQUFlLGdCQUFnQixnQkFBZ0IsQ0FBQztBQUN0RCxZQUFNLFlBQVksUUFBUSxZQUFVO0FBRW5DLGNBQU0sTUFBTSxhQUFhLEtBQUssTUFBTTtBQUNwQyxZQUFJLElBQUksZ0NBQWdDLEdBQUcsR0FBRztBQUM5QyxlQUFPO0FBQUEsTUFDUixDQUFDO0FBRUQsU0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixZQUFJLElBQUksNEJBQTRCLFVBQVUsS0FBSyxNQUFNLENBQUMsR0FBRztBQUFBLE1BQzlELENBQUMsQ0FBQztBQUNGLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxrQkFBWSxDQUFDLE9BQU87QUFDbkIscUJBQWEsSUFBSSxHQUFHLEVBQUU7QUFDdEIsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsa0JBQVUsSUFBSTtBQUNkLGVBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxVQUNoRDtBQUFBLFFBQ0QsQ0FBQztBQUVELHFCQUFhLElBQUksR0FBRyxFQUFFO0FBQ3RCLGVBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEQsQ0FBQztBQUNELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsVUFBTSxjQUFjLElBQUksdUJBQXVCLGlCQUFpQixHQUFHLEdBQUc7QUFDdEUsVUFBTSxnQkFBZ0IsSUFBSSx1QkFBdUIsaUJBQWlCLEdBQUcsR0FBRztBQUN4RSxVQUFNLGdCQUFnQixJQUFJLHVCQUF1QixpQkFBaUIsR0FBRyxHQUFHO0FBRXhFLFVBQU0sSUFBSSxRQUFRLFlBQVU7QUFFM0IsVUFBSSxZQUFZLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFDbEMsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFVBQ2hEO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUVELHNCQUFjLEtBQUssTUFBTTtBQUV6QixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsVUFDaEQ7QUFBQSxVQUNBO0FBQUEsUUFDRCxDQUFDO0FBRUQsVUFBRSxRQUFRO0FBRVYsZUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFVBQ2hEO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUVELHNCQUFjLEtBQUssTUFBTTtBQUV6QixlQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsVUFDaEQ7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELGdCQUFZLElBQUksR0FBRyxNQUFTO0FBQzVCLFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxNQUNoRDtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxnQkFBWSxJQUFJLEdBQUcsTUFBUztBQUU1QixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJLENBQUMsQ0FBRTtBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLHFDQUFxQyxNQUFNO0FBQy9DLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsVUFBTSxnQkFBZ0IsSUFBSSx1QkFBdUIsaUJBQWlCLEdBQUcsR0FBRztBQUN4RSxVQUFNLGdCQUFnQixJQUFJLHVCQUF1QixpQkFBaUIsR0FBRyxHQUFHO0FBRXhFLFVBQU0sYUFBYSxRQUFRLFlBQVU7QUFFcEMsWUFBTSxNQUFNLGNBQWMsS0FBSyxNQUFNO0FBQ3JDLFVBQUksSUFBSSxpQ0FBaUMsR0FBRyxHQUFHO0FBQy9DLGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxVQUFNLGFBQWEsUUFBUSxZQUFVO0FBRXBDLFlBQU0sTUFBTSxjQUFjLEtBQUssTUFBTTtBQUNyQyxVQUFJLFFBQVEsR0FBRztBQUNkLG1CQUFXLEtBQUssTUFBTTtBQUFBLE1BQ3ZCO0FBQ0EsVUFBSSxJQUFJLGlDQUFpQyxHQUFHLEdBQUc7QUFDL0MsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELE9BQUcsSUFBSSxRQUFRLFlBQVU7QUFFeEIsWUFBTSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU07QUFDNUMsWUFBTSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU07QUFDNUMsVUFBSSxJQUFJLDZCQUE2QixhQUFhLGlCQUFpQixhQUFhLEdBQUc7QUFBQSxJQUNwRixDQUFDLENBQUM7QUFFRixnQkFBWSxRQUFNO0FBQ2pCLG9CQUFjLElBQUksR0FBRyxFQUFFO0FBR3ZCLG9CQUFjLElBQUksR0FBRyxFQUFFO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFBTSxNQUFNLElBQUksSUFBSTtBQUVwQixVQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEdBQUcsR0FBRztBQUN0RSxVQUFNLGFBQWEsUUFBUSxZQUFVO0FBRXBDLFVBQUksUUFBUSxhQUFhLEtBQUssTUFBTTtBQUNwQyxZQUFNLFlBQVk7QUFDbEIsVUFBSSxJQUFJLDRCQUE0QixTQUFTLG9CQUFvQjtBQUNqRSxVQUFJLFFBQVEsTUFBTSxHQUFHO0FBQ3BCO0FBQ0EscUJBQWEsSUFBSSxPQUFPLE1BQVM7QUFBQSxNQUNsQztBQUNBLFVBQUksSUFBSSw0QkFBNEIsU0FBUyx1QkFBdUI7QUFDcEUsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELE9BQUcsSUFBSSxRQUFRLFlBQVU7QUFFeEIsWUFBTSxRQUFRLFdBQVcsS0FBSyxNQUFNO0FBQ3BDLFVBQUksSUFBSSx5QkFBeUIsS0FBSyxHQUFHO0FBQUEsSUFDMUMsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELGlCQUFhLElBQUksR0FBRyxNQUFTO0FBQzdCLFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxNQUNoRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixVQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEdBQUcsR0FBRztBQUV0RSxPQUFHLElBQUksUUFBUSxZQUFVO0FBRXhCLFlBQU0sUUFBUSxhQUFhLEtBQUssTUFBTTtBQUN0QyxVQUFJLElBQUksMkJBQTJCLEtBQUssVUFBVTtBQUNsRCxVQUFJLFVBQVUsS0FBSyxRQUFRLEdBQUc7QUFDN0IscUJBQWEsSUFBSSxRQUFRLEdBQUcsTUFBUztBQUFBLE1BQ3RDO0FBQ0EsVUFBSSxJQUFJLDJCQUEyQixLQUFLLFFBQVE7QUFBQSxJQUNqRCxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxpQkFBYSxJQUFJLEdBQUcsTUFBUztBQUM3QixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsVUFBTSxlQUFlLElBQUksdUJBQXVCLGdCQUFnQixHQUFHLEdBQUc7QUFFdEUsVUFBTSxhQUFhLFFBQVEsWUFBVTtBQUVwQyxZQUFNLFFBQVEsYUFBYSxLQUFLLE1BQU07QUFDdEMsVUFBSSxJQUFJLDRCQUE0QixLQUFLLG9CQUFvQjtBQUM3RCxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsVUFBTSxhQUFhLFFBQVEsWUFBVTtBQUVwQyxZQUFNLFFBQVEsV0FBVyxLQUFLLE1BQU07QUFDcEMsVUFBSSxJQUFJLDBCQUEwQixLQUFLLG9CQUFvQjtBQUMzRCxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsT0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixZQUFNLFFBQVEsV0FBVyxLQUFLLE1BQU07QUFDcEMsVUFBSSxJQUFJLHlCQUF5QixLQUFLLEdBQUc7QUFBQSxJQUMxQyxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsZ0JBQVksUUFBTTtBQUNqQixtQkFBYSxJQUFJLEdBQUcsRUFBRTtBQUN0QixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFFRCxpQkFBVyxJQUFJO0FBQ2YsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxtQkFBYSxJQUFJLEdBQUcsRUFBRTtBQUN0QixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsVUFBTSxnQkFBZ0IsSUFBSSx1QkFBdUIsaUJBQWlCLEdBQUcsR0FBRztBQUV4RSxVQUFNLGdCQUFnQixJQUFJLHVCQUF1QixpQkFBaUIsR0FBRyxHQUFHO0FBQ3hFLFVBQU0sYUFBYSxRQUFRLFlBQVU7QUFFcEMsWUFBTSxNQUFNLGNBQWMsS0FBSyxNQUFNO0FBQ3JDLFVBQUksSUFBSSxzQ0FBc0MsR0FBRyxHQUFHO0FBQ3BELGFBQU8sTUFBTTtBQUFBLElBQ2QsQ0FBQztBQUVELFVBQU0sYUFBYSxRQUFRLFlBQVU7QUFFcEMsWUFBTSxPQUFPLGNBQWMsS0FBSyxNQUFNO0FBQ3RDLFlBQU0sT0FBTyxXQUFXLEtBQUssTUFBTTtBQUNuQyxVQUFJLElBQUksbUNBQW1DLElBQUksaUJBQWlCLElBQUksR0FBRztBQUN2RSxhQUFPLEdBQUcsSUFBSSxNQUFNLElBQUk7QUFBQSxJQUN6QixDQUFDO0FBRUQsT0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixZQUFNLE1BQU0sV0FBVyxLQUFLLE1BQU07QUFDbEMsVUFBSSxJQUFJLHlCQUF5QixHQUFHLEdBQUc7QUFBQSxJQUN4QyxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxnQkFBWSxRQUFNO0FBQ2pCLG9CQUFjLElBQUksR0FBRyxFQUFFO0FBQ3ZCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLE1BQ0QsQ0FBQztBQUVELG9CQUFjLElBQUksSUFBSSxFQUFFO0FBQ3hCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxNQUNoRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9DQUFvQyxNQUFNO0FBQzlDLFVBQU0sZ0JBQWdCLGdCQUFnQixpQkFBaUIsQ0FBQztBQUN4RCxVQUFNLGdCQUFnQixnQkFBZ0IsaUJBQWlCLENBQUM7QUFFeEQsVUFBTSxhQUFhLFFBQVEsWUFBVTtBQUVwQyxhQUFPLGNBQWMsS0FBSyxNQUFNO0FBQUEsSUFDakMsQ0FBQztBQUVELFVBQU0sYUFBYSxRQUFRLFlBQVU7QUFFcEMsYUFBTyxjQUFjLEtBQUssTUFBTTtBQUFBLElBQ2pDLENBQUM7QUFFRCxVQUFNLGNBQWMsUUFBUSxZQUEwQztBQUNyRSxZQUFNLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDakMsVUFBSSxPQUFPLEdBQUc7QUFJYixtQkFBVyxLQUFLLE1BQU07QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUVELE9BQUcsSUFBSSxRQUFRLFlBQVU7QUFFeEIsa0JBQVksS0FBSyxNQUFNO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsT0FBRyxJQUFJLFFBQVEsWUFBVTtBQUV4QixpQkFBVyxLQUFLLE1BQU07QUFBQSxJQUN2QixDQUFDLENBQUM7QUFFRixnQkFBWSxRQUFNO0FBQ2pCLG9CQUFjLElBQUksR0FBRyxFQUFFO0FBQ3ZCLG9CQUFjLElBQUksR0FBRyxFQUFFO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsVUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixVQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEdBQUcsR0FBRztBQUV0RSxVQUFNLFlBQVksUUFBUSxZQUF3QztBQUNqRSxZQUFNLE1BQU0sYUFBYSxLQUFLLE1BQU07QUFDcEMsVUFBSSxJQUFJLHFDQUFxQyxHQUFHLEdBQUc7QUFDbkQsYUFBTyxNQUFNO0FBQUEsSUFDZCxDQUFDO0FBRUQsVUFBTSxJQUFJLE1BQU0sb0JBQW9CLFNBQVM7QUFDN0MsUUFBSSxJQUFJLGVBQWU7QUFDdkIsTUFBRSxNQUFNO0FBQ1AsVUFBSSxJQUFJLGFBQWE7QUFBQSxJQUN0QixDQUFDO0FBRUQsaUJBQWEsSUFBSSxHQUFHLE1BQVM7QUFFN0IsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxVQUFVLElBQUksUUFBUTtBQUM1QixVQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFFBQUksSUFBSTtBQUNSLFVBQU0sTUFBTSxvQkFBb0IsUUFBUSxPQUFPLE1BQU0sQ0FBQztBQUV0RDtBQUNBLFlBQVEsS0FBSyxDQUFDO0FBRWQsVUFBTSxPQUFPLE1BQU0sZUFBZSxHQUFHO0FBQ3JDLFVBQU0sSUFBSSxLQUFLLE9BQUs7QUFDbkIsVUFBSSxJQUFJLGVBQWUsQ0FBQyxFQUFFO0FBQUEsSUFDM0IsQ0FBQztBQUVEO0FBQ0EsWUFBUSxLQUFLLENBQUM7QUFDZCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsZUFBZSxDQUFDO0FBRWxFO0FBQ0EsWUFBUSxLQUFLLENBQUM7QUFDZCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsZUFBZSxDQUFDO0FBRWxFLE1BQUUsUUFBUTtBQUFBLEVBQ1gsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsVUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixVQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEdBQUcsR0FBRztBQUV0RSxVQUFNLElBQUksUUFBUSxZQUFVO0FBRTNCLFlBQU0sSUFBSSxhQUFhLEtBQUssTUFBTTtBQUNsQyxVQUFJLElBQUksMkJBQTJCLENBQUM7QUFBQSxJQUNyQyxDQUFDO0FBRUQsZ0JBQVksUUFBTTtBQUNqQixtQkFBYSxJQUFJLEdBQUcsRUFBRTtBQUN0QixRQUFFLFFBQVE7QUFBQSxJQUNYLENBQUM7QUFFRCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxnQkFBZ0IsTUFBTTtBQUMzQixTQUFLLFdBQVcsWUFBWTtBQUMzQixZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFlBQU0sZUFBZSxJQUFJLHVCQUF1QixnQkFBZ0IsRUFBRSxPQUFPLGVBQXFELEdBQUcsR0FBRztBQUVwSSxZQUFNLElBQUksYUFBYSxjQUFjLENBQUFBLE9BQUtBLEdBQUUsVUFBVSxTQUFTLENBQUFBLE9BQUtBLEdBQUUsVUFBVSxPQUFPLEVBQUUsS0FBSyxPQUFLO0FBQ2xHLFlBQUksSUFBSSxZQUFZLEtBQUssVUFBVSxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQ3hDLEdBQUcsQ0FBQyxRQUFRO0FBQ1gsWUFBSSxJQUFJLFlBQVksS0FBSyxVQUFVLEdBQUcsQ0FBQyxFQUFFO0FBQUEsTUFDMUMsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxtQkFBYSxJQUFJLEVBQUUsT0FBTyxRQUFRLEdBQUcsTUFBUztBQUU5QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU07QUFFTixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9CQUFvQixZQUFZO0FBQ3BDLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsWUFBTSxlQUFlLElBQUksdUJBQXVCLGdCQUFnQixFQUFFLE9BQU8sUUFBOEMsR0FBRyxHQUFHO0FBRTdILFlBQU0sSUFBSSxhQUFhLGNBQWMsQ0FBQUEsT0FBS0EsR0FBRSxVQUFVLFNBQVMsQ0FBQUEsT0FBS0EsR0FBRSxVQUFVLE9BQU8sRUFBRSxLQUFLLE9BQUs7QUFDbEcsWUFBSSxJQUFJLFlBQVksS0FBSyxVQUFVLENBQUMsQ0FBQyxFQUFFO0FBQUEsTUFDeEMsR0FBRyxDQUFDLFFBQVE7QUFDWCxZQUFJLElBQUksWUFBWSxLQUFLLFVBQVUsR0FBRyxDQUFDLEVBQUU7QUFBQSxNQUMxQyxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxtQkFBYSxJQUFJLEVBQUUsT0FBTyxRQUFRLEdBQUcsTUFBUztBQUU5QyxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNO0FBRU4sYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxVQUFVLFlBQVk7QUFDMUIsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixZQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEVBQUUsT0FBTyxlQUFxRCxHQUFHLEdBQUc7QUFFcEksWUFBTSxJQUFJLGFBQWEsY0FBYyxDQUFBQSxPQUFLQSxHQUFFLFVBQVUsU0FBUyxDQUFBQSxPQUFLQSxHQUFFLFVBQVUsT0FBTyxFQUFFLEtBQUssT0FBSztBQUNsRyxZQUFJLElBQUksWUFBWSxLQUFLLFVBQVUsQ0FBQyxDQUFDLEVBQUU7QUFBQSxNQUN4QyxHQUFHLENBQUMsUUFBUTtBQUNYLFlBQUksSUFBSSxZQUFZLEtBQUssVUFBVSxHQUFHLENBQUMsRUFBRTtBQUFBLE1BQzFDLENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsbUJBQWEsSUFBSSxFQUFFLE9BQU8sUUFBUSxHQUFHLE1BQVM7QUFFOUMsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNO0FBRU4sYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxtQkFBbUIsTUFBTTtBQUM3QixZQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixVQUFJLElBQUk7QUFDUixZQUFNLElBQUksa0JBQWtCLE1BQU07QUFDakMsY0FBTSxLQUFLO0FBQ1gsWUFBSSxJQUFJLGVBQWUsRUFBRTtBQUN6QixlQUFPO0FBQUEsVUFDTixTQUFTLE1BQU0sSUFBSSxJQUFJLFlBQVksRUFBRSxFQUFFO0FBQUEsUUFDeEM7QUFBQSxNQUNELENBQUM7QUFFRCxRQUFFLElBQUk7QUFDTixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsZUFBZSxZQUFZLENBQUM7QUFDOUUsUUFBRSxJQUFJO0FBQ04sYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLGVBQWUsWUFBWSxDQUFDO0FBRTlFLFFBQUUsYUFBYSxLQUFLO0FBQ3BCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBQ25ELFFBQUUsSUFBSTtBQUNOLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxhQUFhLENBQUM7QUFDaEUsUUFBRSxJQUFJO0FBQ04sYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsWUFBTSxRQUFRO0FBRWQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLFlBQVksQ0FBQztBQUFBLElBQ2hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsVUFBTSxnQkFBZ0IsZ0JBQXdCLGlCQUFpQixDQUFDO0FBQ2hFLFVBQU0sZ0JBQWdCLGdCQUE2QyxpQkFBaUIsQ0FBQztBQUVyRixVQUFNLElBQUksUUFBUSxZQUFVO0FBRTNCLFlBQU0sS0FBSyxjQUFjLEtBQUssTUFBTTtBQUNwQyxZQUFNLEtBQUssY0FBYyxLQUFLLE1BQU07QUFDcEMsVUFBSSxJQUFJLDRCQUE0QixLQUFLLHFCQUFxQixFQUFFO0FBQUEsSUFDakUsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxNQUNoRDtBQUFBLElBQ0QsQ0FBQztBQUdELGtCQUFjLElBQUksR0FBRyxNQUFTO0FBRTlCLFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FDakQsQ0FBQztBQUdELGtCQUFjLElBQUksR0FBRyxRQUFXLEVBQUUsU0FBUyxVQUFVLENBQUM7QUFFdEQsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLE1BQ2hEO0FBQUEsSUFDRCxDQUFDO0FBRUQsTUFBRSxRQUFRO0FBQUEsRUFDWCxDQUFDO0FBRUQsUUFBTSwwQkFBMEIsTUFBTTtBQUNyQyxTQUFLLG1CQUFtQixNQUFNO0FBQzdCLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsZ0NBQTBCLE9BQUs7QUFDOUIsWUFBSSxJQUFJLFVBQVUsRUFBRSxPQUFPLEVBQUU7QUFBQSxNQUM5QixDQUFDO0FBRUQsWUFBTSxlQUFlLElBQUksdUJBQXVCLGdCQUFnQixHQUFHLEdBQUc7QUFFdEUsWUFBTSxJQUFJLFFBQVEsWUFBVTtBQUMzQixxQkFBYSxLQUFLLE1BQU07QUFDeEIsY0FBTSxJQUFJLE1BQU0sUUFBUTtBQUFBLE1BQ3pCLENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELG1CQUFhLElBQUksR0FBRyxNQUFTO0FBRTdCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsUUFBRSxRQUFRO0FBQUEsSUFDWCxDQUFDO0FBRUQsU0FBSyxjQUFjLE1BQU07QUFDeEIsWUFBTSxNQUFNLElBQUksSUFBSTtBQUVwQixnQ0FBMEIsT0FBSztBQUM5QixZQUFJLElBQUksVUFBVSxFQUFFLE9BQU8sRUFBRTtBQUFBLE1BQzlCLENBQUM7QUFFRCxZQUFNLGVBQWUsSUFBSSx1QkFBdUIsZ0JBQWdCLEdBQUcsR0FBRztBQUV0RSxZQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLGNBQU0sUUFBUSxhQUFhLEtBQUssTUFBTTtBQUN0QyxZQUFJLFNBQVMsR0FBRztBQUNmLGdCQUFNLElBQUksTUFBTSxRQUFRO0FBQUEsUUFDekI7QUFBQSxNQUNELENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBRUQsbUJBQWEsSUFBSSxHQUFHLE1BQVM7QUFFN0IsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxtQkFBYSxJQUFJLEdBQUcsTUFBUztBQUU3QixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELFFBQUUsUUFBUTtBQUFBLElBQ1gsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0ZBQWtGLE1BQU07QUFDNUYsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsVUFBTSxlQUFlLElBQUksdUJBQXVCLGdCQUFnQixHQUFHLEdBQUc7QUFFdEUsUUFBSSxlQUFlO0FBRW5CLFVBQU0sWUFBWSxRQUFRLFlBQVU7QUFHbkMsVUFBSSxJQUFJLDBCQUEwQjtBQUVsQyxZQUFNLE1BQU0sYUFBYSxLQUFLLE1BQU07QUFFcEMsVUFBSSxjQUFjO0FBQ2pCLHVCQUFlO0FBQ2YscUJBQWEsSUFBSSxHQUFHLE1BQVM7QUFBQSxNQUM5QjtBQUVBLFVBQUksSUFBSSx3QkFBd0I7QUFFaEMsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUksQ0FBQyxDQUFFO0FBRXJELGNBQVUsOEJBQThCLE9BQU8sU0FBTztBQUNyRCxVQUFJLElBQUksNkNBQTZDLEdBQUcsRUFBRTtBQUFBLElBQzNELENBQUM7QUFFRCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDaEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELGNBQVUsSUFBSTtBQUNkLFdBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUksQ0FBQyxDQUFFO0FBRXJELFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUVELFFBQU0seUJBQXlCLE1BQU07QUFDcEMsVUFBTSx1Q0FBdUMsTUFBTTtBQUNsRCxXQUFLLFdBQVcsTUFBTTtBQUNyQixZQUFJLEtBQWlCLE1BQU07QUFBQSxRQUFFO0FBRTdCLGNBQU0sTUFBTSxnQkFBZ0IsT0FBTyxDQUFDO0FBQ3BDLGNBQU0sSUFBSSxRQUFRLFlBQVU7QUFDM0IsZUFBSyxNQUFNO0FBQUUsZ0JBQUksS0FBSyxNQUFNO0FBQUEsVUFBRztBQUMvQixpQkFBTyxJQUFJLEtBQUssTUFBTTtBQUFBLFFBQ3ZCLENBQUM7QUFFRCxjQUFNLE9BQU8sUUFBUSxZQUFVO0FBQzlCLFlBQUUsS0FBSyxNQUFNO0FBQUEsUUFDZCxDQUFDO0FBRUQsZUFBTyxPQUFPLE1BQU07QUFDbkIsYUFBRztBQUFBLFFBQ0osQ0FBQztBQUVELGFBQUssUUFBUTtBQUFBLE1BQ2QsQ0FBQztBQUVELFdBQUssV0FBVyxNQUFNO0FBQ3JCLFlBQUksS0FBaUIsTUFBTTtBQUFBLFFBQUU7QUFFN0IsY0FBTSxNQUFNLGdCQUFnQixPQUFPLENBQUM7QUFDcEMsY0FBTSxPQUFPLFFBQVEsWUFBVTtBQUM5QixlQUFLLE1BQU07QUFBRSxnQkFBSSxLQUFLLE1BQU07QUFBQSxVQUFHO0FBQy9CLGNBQUksS0FBSyxNQUFNO0FBQUEsUUFDaEIsQ0FBQztBQUVELGVBQU8sT0FBTyxNQUFNO0FBQ25CLGFBQUc7QUFBQSxRQUNKLENBQUM7QUFFRCxhQUFLLFFBQVE7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLEtBQUssK0JBQStCLE1BQU07QUFDOUMsWUFBTSxNQUFNLElBQUksSUFBSTtBQUVwQixnQ0FBMEIsQ0FBQyxNQUFNO0FBQ2hDLFlBQUksSUFBSSxFQUFFLFNBQVMsQ0FBQztBQUFBLE1BQ3JCLENBQUM7QUFFRCxZQUFNLE1BQU0sZ0JBQWdCLE9BQU8sQ0FBQztBQUNwQyxZQUFNLEtBQUssUUFBUSxZQUFVO0FBQzVCLFlBQUksSUFBSSxtQkFBbUI7QUFDM0IsY0FBTSxJQUFJLElBQUksS0FBSyxNQUFNLElBQUksR0FBRyxLQUFLLE1BQU07QUFDM0MsWUFBSSxJQUFJLGlCQUFpQjtBQUN6QixlQUFPO0FBQUEsTUFDUixDQUFDO0FBQ0QsWUFBTSxLQUFLLFFBQVEsWUFBVTtBQUM1QixZQUFJLElBQUksbUJBQW1CO0FBQzNCLFdBQUcsS0FBSyxNQUFNO0FBQ2QsWUFBSSxJQUFJLGlCQUFpQjtBQUN6QixlQUFPO0FBQUEsTUFDUixDQUFDO0FBRUQsWUFBTSxPQUFPLFFBQVEsWUFBVTtBQUM5QixZQUFJLElBQUksZUFBZTtBQUN2QixXQUFHLEtBQUssTUFBTTtBQUNkLFlBQUksSUFBSSxhQUFhO0FBQ3JCLGVBQU87QUFBQSxNQUNSLENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJO0FBQUEsUUFDakQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBRTtBQUVGLFdBQUssUUFBUTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0scUJBQXFCLE1BQU07QUFDaEMsU0FBSyxRQUFRLE1BQU07QUFDbEIsWUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsWUFBTSxnQkFBZ0IsZ0JBQWdDLGlCQUFpQixDQUFDO0FBQ3hFLFlBQU0sZ0JBQWdCLGdCQUFnQyxpQkFBaUIsQ0FBQztBQUV4RSxZQUFNLE1BQU0sa0JBQWtCLFFBQU07QUFBQSxRQUNuQyxTQUFTLE1BQU07QUFDZCxjQUFJLElBQUksZUFBZTtBQUN2QixpQkFBTyxjQUFjLElBQUksSUFBSSxjQUFjLElBQUk7QUFBQSxRQUNoRDtBQUFBLFFBQ0EsY0FBYyxDQUFDLFdBQVc7QUFDekIsY0FBSSxJQUFJLGdCQUFnQixNQUFNLEVBQUU7QUFBQSxRQUNqQztBQUFBLFFBQ0EsZUFBZSxjQUFjLEVBQUUsZUFBZSxjQUFjLENBQUM7QUFBQSxRQUM3RCxRQUFRLENBQUMsUUFBZ0MsZUFBZSxZQUFZO0FBQ25FLGNBQUksSUFBSSxVQUFVLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRTtBQUMzQyxjQUFJLFFBQVE7QUFDWixxQkFBVyxVQUFVLFFBQVEsU0FBUztBQUNyQyxxQkFBUyxPQUFPO0FBQUEsVUFDakI7QUFFQSxpQkFBTyxhQUFhLEtBQUs7QUFDekIsZ0JBQU0sY0FBYyxnQkFBZ0I7QUFDcEMsY0FBSSxJQUFJLGFBQWEsV0FBVyxFQUFFO0FBQ2xDLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUksQ0FBQyxDQUFFO0FBRXJELFlBQU0sSUFBSSw4QkFBOEI7QUFBQSxRQUN2QyxlQUFlLGNBQWMsRUFBRSxJQUFJLENBQUM7QUFBQSxNQUNyQyxHQUFHLENBQUMsU0FBUyxZQUFZO0FBQ3hCLFlBQUksSUFBSSxXQUFXLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRTtBQUFBLE1BQzdDLENBQUMsQ0FBQztBQUVGLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUVELGtCQUFZLFFBQU07QUFDakIsc0JBQWMsSUFBSSxjQUFjLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQztBQUNoRCxzQkFBYyxJQUFJLGNBQWMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQUEsTUFDakQsQ0FBQztBQUVELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUk7QUFBQSxRQUNqRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFFO0FBRUYsa0JBQVksUUFBTTtBQUNqQixzQkFBYyxJQUFJLGNBQWMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBQ2hELGNBQU0sSUFBSSxJQUFJLElBQUk7QUFDbEIsWUFBSSxJQUFJLGFBQWEsQ0FBQyxFQUFFO0FBQ3hCLHNCQUFjLElBQUksY0FBYyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUM7QUFBQSxNQUNqRCxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLFFBQ2pEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUU7QUFFRixZQUFNLFFBQVE7QUFFZCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJO0FBQUEsUUFDakQ7QUFBQSxNQUNELENBQUU7QUFBQSxJQUNILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssc0JBQXNCLE1BQU07QUFDaEMsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixZQUFNLGNBQWMsZ0JBQWdCLHNCQUFzQixDQUFDO0FBRTNELFlBQU0sWUFBWSxRQUFRLENBQUMsV0FBVztBQUNyQyxjQUFNLFFBQVEsWUFBWSxLQUFLLE1BQU07QUFDckMsWUFBSSxJQUFJLFlBQVksS0FBSyxFQUFFO0FBQzNCLGVBQU8sTUFBTSxJQUFJLGFBQWEsTUFBTTtBQUNuQyxjQUFJLElBQUksY0FBYyxLQUFLLFdBQVc7QUFBQSxRQUN2QyxDQUFDLENBQUM7QUFDRixlQUFPO0FBQUEsTUFDUixDQUFDO0FBRUQsWUFBTSxJQUFJLFFBQVEsWUFBVTtBQUMzQixZQUFJLElBQUksTUFBTSxVQUFVLEtBQUssTUFBTSxDQUFDLEVBQUU7QUFBQSxNQUN2QyxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLFFBQ2pEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBRTtBQUVGLGtCQUFZLElBQUksR0FBRyxNQUFTO0FBRTVCLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUk7QUFBQSxRQUNqRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFFO0FBRUYsUUFBRSxRQUFRO0FBRVYsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLFFBQ2pEO0FBQUEsTUFDRCxDQUFFO0FBQUEsSUFDSCxDQUFDO0FBRUQsU0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFlBQU0sY0FBYyxnQkFBZ0Isc0JBQXNCLENBQUM7QUFFM0QsWUFBTSxZQUFZLFFBQVEsQ0FBQyxXQUFXO0FBQ3JDLGNBQU0sUUFBUSxZQUFZLEtBQUssTUFBTTtBQUNyQyxZQUFJLElBQUksWUFBWSxLQUFLLEVBQUU7QUFDM0IsZUFBTyxhQUFhLElBQUksYUFBYSxNQUFNO0FBQzFDLGNBQUksSUFBSSxjQUFjLEtBQUssV0FBVztBQUFBLFFBQ3ZDLENBQUMsQ0FBQztBQUNGLGVBQU87QUFBQSxNQUNSLENBQUM7QUFFRCxZQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFlBQUksSUFBSSxNQUFNLFVBQVUsS0FBSyxNQUFNLENBQUMsRUFBRTtBQUFBLE1BQ3ZDLENBQUM7QUFFRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJO0FBQUEsUUFDakQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFFO0FBRUYsa0JBQVksSUFBSSxHQUFHLE1BQVM7QUFFNUIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLFFBQ2pEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUU7QUFFRixRQUFFLFFBQVE7QUFFVixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJO0FBQUEsUUFDakQ7QUFBQSxNQUNELENBQUU7QUFBQSxJQUNILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sTUFBTSxJQUFJLElBQUk7QUFFcEIsVUFBTSxVQUFVLGlCQUFzQyxTQUFTO0FBQy9ELFVBQU0sVUFBVSxpQkFBc0MsU0FBUztBQUUvRCxVQUFNLGlCQUFpQjtBQUFBLE1BQ3RCLEVBQUUsZUFBZSxjQUFjLEVBQUUsUUFBUSxDQUFDLEVBQUU7QUFBQSxNQUM1QyxDQUFDLFFBQTZDLGtCQUFrQjtBQUMvRCxtQkFBVyxLQUFLLGNBQWMsU0FBUztBQUN0QyxpQkFBTyxhQUFhLEVBQUUsU0FBUyxFQUFFLE9BQU8sVUFBVSxhQUFhLENBQUM7QUFBQSxRQUNqRTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxJQUFJLHFCQUFxQjtBQUFBLE1BQzlCLGVBQWUsY0FBYyxFQUFFLFNBQVMsZUFBZSxDQUFDO0FBQUEsSUFDekQsR0FBRyxDQUFDLEdBQTJCLFlBQVk7QUFDMUMsWUFBTUMsT0FBTSxRQUFRLFFBQVEsSUFBSSxPQUFLLEdBQUcsRUFBRSxHQUFHLEtBQUssRUFBRSxPQUFPLE9BQU8sRUFBRSxFQUFFLEtBQUssSUFBSTtBQUMvRSxRQUFFLGFBQWFBLElBQUc7QUFBQSxJQUNuQixDQUFDO0FBRUQsVUFBTSxPQUFPLFlBQVksR0FBRyxDQUFDLE1BQU0sT0FBTyxZQUFZO0FBQ3JELFVBQUksSUFBSSxlQUFlLEtBQUssVUFBVSxPQUFPLENBQUMsRUFBRTtBQUFBLElBQ2pELENBQUM7QUFFRCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJLENBQUMsQ0FBRTtBQUVyRCxnQkFBWSxRQUFNO0FBQ2pCLGNBQVEsUUFBUSxJQUFJLEVBQUUsU0FBUyxNQUFNLENBQUM7QUFDdEMsY0FBUSxRQUFRLElBQUksRUFBRSxTQUFTLE1BQU0sQ0FBQztBQUFBLElBQ3ZDLENBQUM7QUFFRCxXQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFJO0FBQUEsTUFDakQ7QUFBQSxJQUNELENBQUU7QUFHRixnQkFBWSxRQUFNO0FBQ2pCLGNBQVEsUUFBUSxJQUFJLEVBQUUsU0FBUyxNQUFNLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBSTtBQUFBLE1BQ2pEO0FBQUEsSUFDRCxDQUFFO0FBRUYsU0FBSyxRQUFRO0FBQUEsRUFDZCxDQUFDO0FBRUQsUUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLG1HQUFtRyxNQUFNO0FBQzdHLFlBQU0sTUFBTSxJQUFJLElBQUk7QUFDcEIsWUFBTSxRQUFRLGdCQUFzRCxTQUFTLENBQUMsQ0FBQztBQUUvRSxZQUFNLElBQUksR0FBRyxJQUFJO0FBQUEsUUFDaEI7QUFBQSxRQUNBLFFBQU0sR0FBRztBQUFBLFFBQ1QsQ0FBQyxLQUFLLE9BQU8sVUFBVTtBQUN0QixjQUFJLElBQUksU0FBUyxHQUFHLEdBQUc7QUFDdkIsZ0JBQU0sSUFBSSxhQUFhLE1BQU0sSUFBSSxJQUFJLFdBQVcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUN4RCxnQkFBTSxJQUFJLFFBQVEsWUFBVTtBQUMzQixrQkFBTSxJQUFJLE1BQU0sS0FBSyxNQUFNO0FBQzNCLGdCQUFJLElBQUksV0FBVyxHQUFHLFFBQVEsRUFBRSxDQUFDLEVBQUU7QUFBQSxVQUNwQyxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRCxDQUFDO0FBQ0QsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFFbkQsWUFBTSxJQUFJLENBQUMsRUFBRSxJQUFJLEtBQUssR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxNQUFTO0FBQzNELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUtELFlBQU0sSUFBSSxDQUFDLEVBQUUsSUFBSSxLQUFLLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsTUFBUztBQUMzRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsUUFDaEQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBS0QsWUFBTSxJQUFJLENBQUMsRUFBRSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxNQUFTO0FBQ3hDLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUc7QUFBQSxRQUNoRDtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFJRCxZQUFNLElBQUksQ0FBQyxFQUFFLElBQUksS0FBSyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLE1BQVM7QUFDM0QsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFFRCxRQUFFLFFBQVE7QUFFVixhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixFQUFFLEtBQUssR0FBRztBQUFBLFFBQ3ZEO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssb0VBQW9FLE1BQU07QUFDOUUsWUFBTSxNQUFNLElBQUksSUFBSTtBQUNwQixZQUFNLFFBQVEsZ0JBQXNELFNBQVM7QUFBQSxRQUM1RSxFQUFFLElBQUksS0FBSyxHQUFHLEVBQUU7QUFBQSxRQUNoQixFQUFFLElBQUksS0FBSyxHQUFHLEVBQUU7QUFBQSxNQUNqQixDQUFDO0FBRUQsU0FBRyxJQUFJO0FBQUEsUUFDTjtBQUFBLFFBQ0EsUUFBTSxHQUFHO0FBQUEsUUFDVCxDQUFDLEtBQUssT0FBTyxVQUFVO0FBQ3RCLGdCQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLGdCQUFJLElBQUksR0FBRyxHQUFHLElBQUksTUFBTSxLQUFLLE1BQU0sRUFBRSxDQUFDLEVBQUU7QUFBQSxVQUN6QyxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRCxDQUFDO0FBQ0QsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBSS9ELFlBQU0sSUFBSSxDQUFDLEVBQUUsSUFBSSxLQUFLLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsTUFBUztBQUMzRCxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxJQUNoRSxDQUFDO0FBRUQsU0FBSyxzRUFBc0UsTUFBTTtBQUNoRixZQUFNLE1BQU0sSUFBSSxJQUFJO0FBQ3BCLFlBQU0sSUFBSSxFQUFFLElBQUksS0FBSyxHQUFHLEVBQUU7QUFDMUIsWUFBTSxRQUFRLGdCQUFzRCxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBRWhGLFNBQUcsSUFBSTtBQUFBLFFBQ047QUFBQSxRQUNBLFFBQU0sR0FBRztBQUFBLFFBQ1QsQ0FBQyxNQUFNLE9BQU8sVUFBVTtBQUN2QixnQkFBTSxJQUFJLFFBQVEsWUFBVSxJQUFJLElBQUksS0FBSyxNQUFNLEtBQUssTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7QUFBQSxRQUNsRTtBQUFBLE1BQ0QsQ0FBQztBQUNELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFHeEQsWUFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLE1BQVM7QUFDeEIsYUFBTyxnQkFBZ0IsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBRUQsU0FBSyxvRkFBb0YsTUFBTTtBQUs5RixZQUFNLE1BQU0sSUFBSSxJQUFJO0FBSXBCLFVBQUksVUFBNkI7QUFDakMsWUFBTSxXQUFXLEdBQUcsSUFBSSxJQUFJLFFBQWUsQ0FBQztBQUM1QyxZQUFNLFVBQVUsRUFBRSxPQUFPLFFBQWdDLGFBQWEsU0FBUyxNQUFNO0FBQ3JGLFlBQU0sZ0JBQWdCLG9CQUFvQixRQUFXLFFBQVEsYUFBYSxNQUFNLFFBQVEsS0FBSztBQUM3RixZQUFNLE9BQU8sQ0FBQyxNQUFhO0FBQUUsa0JBQVU7QUFBRyxnQkFBUSxRQUFRO0FBQUcsaUJBQVMsS0FBSyxDQUFDO0FBQUEsTUFBRztBQUUvRSxZQUFNLFFBQVEsUUFBUSxZQUFVLGNBQWMsS0FBSyxNQUFNLEdBQUcsTUFBTTtBQUNsRSxZQUFNLFNBQVMsUUFBUSxZQUFVLE1BQU0sS0FBSyxNQUFNLEdBQUcsU0FBUyxDQUFDLENBQUM7QUFFaEUsU0FBRyxJQUFJO0FBQUEsUUFDTjtBQUFBLFFBQ0EsT0FBSyxFQUFFO0FBQUEsUUFDUCxDQUFDLEtBQUssSUFBSSxVQUFVO0FBQ25CLGNBQUksSUFBSSxTQUFTLEdBQUcsR0FBRztBQUN2QixnQkFBTSxJQUFJLFFBQVEsWUFBVSxJQUFJLElBQUksR0FBRyxHQUFHLElBQUksR0FBRyxLQUFLLE1BQU0sRUFBRSxRQUFRLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFBQSxRQUNqRjtBQUFBLE1BQ0QsQ0FBQztBQUNELGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBR25ELFdBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxNQUFNLE9BQU8sQ0FBQyxFQUFFLElBQUksTUFBTSxTQUFTLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQztBQUN0RSxhQUFPLGdCQUFnQixJQUFJLG1CQUFtQixHQUFHLENBQUMsYUFBYSxNQUFNLENBQUM7QUFHdEUsV0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLE1BQU0sT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLFNBQVMsY0FBYyxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQzVFLGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFLMUQsV0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLE1BQU0sT0FBTyxDQUFDLEVBQUUsSUFBSSxNQUFNLFNBQVMsY0FBYyxHQUFHLEVBQUUsSUFBSSxNQUFNLFNBQVMsWUFBWSxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQ2hILGFBQU8sZ0JBQWdCLElBQUksbUJBQW1CLEdBQUcsQ0FBQyxTQUFTLGFBQWEsTUFBTSxDQUFDO0FBQy9FLFdBQUs7QUFBQSxJQUNOLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDO0FBRU0sTUFBTSxnQkFBcUM7QUFBQSxFQUdqRCxZQUE0QixXQUFvQyxLQUFVO0FBQTlDO0FBQW9DO0FBRmhFLFNBQVEsUUFBUTtBQUFBLEVBR2hCO0FBQUEsRUFFQSxZQUFlLFlBQWtDO0FBQ2hELFNBQUs7QUFDTCxTQUFLLElBQUksSUFBSSxHQUFHLEtBQUssU0FBUyx1QkFBdUIsS0FBSyxLQUFLLEdBQUc7QUFBQSxFQUNuRTtBQUFBLEVBQ0EsVUFBYSxZQUFrQztBQUM5QyxTQUFLLElBQUksSUFBSSxHQUFHLEtBQUssU0FBUyxxQkFBcUIsS0FBSyxLQUFLLEdBQUc7QUFDaEUsU0FBSztBQUFBLEVBQ047QUFBQSxFQUNBLGFBQXlCLFlBQStDLFFBQXVCO0FBQzlGLFNBQUssSUFBSSxJQUFJLEdBQUcsS0FBSyxTQUFTLHdCQUF3QixLQUFLLEtBQUssR0FBRztBQUFBLEVBQ3BFO0FBQUEsRUFDQSxxQkFBd0IsWUFBa0M7QUFDekQsU0FBSyxJQUFJLElBQUksR0FBRyxLQUFLLFNBQVMsdUJBQXVCO0FBQUEsRUFDdEQ7QUFDRDtBQUVPLE1BQU0sK0JBQ0osZUFDbUM7QUFBQSxFQUczQyxZQUNpQixXQUNoQixjQUNpQixRQUNoQjtBQUNELFVBQU0sY0FBYyxTQUFTLENBQUM7QUFKZDtBQUVDO0FBR2pCLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVtQix1QkFBNkI7QUFDL0MsU0FBSyxPQUFPLElBQUksR0FBRyxLQUFLLFNBQVMscUJBQXFCO0FBQUEsRUFDdkQ7QUFBQSxFQUVtQix3QkFBOEI7QUFDaEQsU0FBSyxPQUFPLElBQUksR0FBRyxLQUFLLFNBQVMsc0JBQXNCO0FBQUEsRUFDeEQ7QUFBQSxFQUVPLE1BQVM7QUFDZixTQUFLLE9BQU8sSUFBSSxHQUFHLEtBQUssU0FBUyxNQUFNO0FBQ3ZDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLElBQUksT0FBVSxJQUE4QixRQUF1QjtBQUN6RSxRQUFJLEtBQUssVUFBVSxPQUFPO0FBQ3pCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxJQUFJO0FBQ1Isa0JBQVksQ0FBQ0MsUUFBTztBQUNuQixhQUFLLElBQUksT0FBT0EsS0FBSSxNQUFNO0FBQUEsTUFDM0IsR0FBRyxNQUFNLFdBQVcsS0FBSyxTQUFTLEVBQUU7QUFDcEM7QUFBQSxJQUNEO0FBRUEsU0FBSyxPQUFPLElBQUksR0FBRyxLQUFLLFNBQVMsZUFBZSxLQUFLLEdBQUc7QUFFeEQsU0FBSyxRQUFRO0FBRWIsZUFBVyxZQUFZLEtBQUssWUFBWTtBQUN2QyxTQUFHLGVBQWUsVUFBVSxJQUFJO0FBQ2hDLGVBQVMsYUFBYSxNQUFNLE1BQU07QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVTLFdBQW1CO0FBQzNCLFdBQU8sR0FBRyxLQUFLLFNBQVMsS0FBSyxLQUFLLEtBQUs7QUFBQSxFQUN4QztBQUNEO0FBRUEsTUFBTSxJQUFJO0FBQUEsRUFBVjtBQUNDLFNBQWlCLFVBQW9CLENBQUM7QUFBQTtBQUFBLEVBQy9CLElBQUksU0FBdUI7QUFDakMsU0FBSyxRQUFRLEtBQUssT0FBTztBQUFBLEVBQzFCO0FBQUEsRUFFTyxxQkFBK0I7QUFDckMsVUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLE9BQU87QUFDaEMsU0FBSyxRQUFRLFNBQVM7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsicCIsICJsb2ciLCAidHgiXQp9Cg==
