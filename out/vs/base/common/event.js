import { diffSets } from "./collections.js";
import { onUnexpectedError } from "./errors.js";
import { createSingleCallFunction } from "./functional.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from "./lifecycle.js";
import { LinkedList } from "./linkedList.js";
import { env } from "./process.js";
import { StopWatch } from "./stopwatch.js";
const _enableDisposeWithListenerWarning = false;
const _enableSnapshotPotentialLeakWarning = false;
const _bufferLeakWarnCountThreshold = 100;
const _bufferLeakWarnTimeThreshold = 6e4;
function _isBufferLeakWarningEnabled() {
  return !!env["VSCODE_DEV"];
}
var Event;
((Event2) => {
  Event2.None = () => Disposable.None;
  function _addLeakageTraceLogic(options) {
    if (_enableSnapshotPotentialLeakWarning) {
      const { onDidAddListener: origListenerDidAdd } = options;
      const stack = Stacktrace.create();
      let count = 0;
      options.onDidAddListener = () => {
        if (++count === 2) {
          console.warn("snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here");
          stack.print();
        }
        origListenerDidAdd?.();
      };
    }
  }
  function defer(event, flushOnListenerRemove, disposable) {
    return debounce(event, () => void 0, 0, void 0, flushOnListenerRemove ?? true, void 0, disposable);
  }
  Event2.defer = defer;
  function once(event) {
    return (listener, thisArgs = null, disposables) => {
      let didFire = false;
      let result = void 0;
      result = event((e) => {
        if (didFire) {
          return;
        } else if (result) {
          result.dispose();
        } else {
          didFire = true;
        }
        return listener.call(thisArgs, e);
      }, null, disposables);
      if (didFire) {
        result.dispose();
      }
      return result;
    };
  }
  Event2.once = once;
  function onceIf(event, condition) {
    return Event2.once(Event2.filter(event, condition));
  }
  Event2.onceIf = onceIf;
  function map(event, map2, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((i) => listener.call(thisArgs, map2(i)), null, disposables), disposable);
  }
  Event2.map = map;
  function forEach(event, each, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((i) => {
      each(i);
      listener.call(thisArgs, i);
    }, null, disposables), disposable);
  }
  Event2.forEach = forEach;
  function filter(event, filter2, disposable) {
    return snapshot((listener, thisArgs = null, disposables) => event((e) => filter2(e) && listener.call(thisArgs, e), null, disposables), disposable);
  }
  Event2.filter = filter;
  function signal(event) {
    return event;
  }
  Event2.signal = signal;
  function any(...events) {
    return (listener, thisArgs = null, disposables) => {
      const disposable = combinedDisposable(...events.map((event) => event((e) => listener.call(thisArgs, e))));
      return addAndReturnDisposable(disposable, disposables);
    };
  }
  Event2.any = any;
  function reduce(event, merge, initial, disposable) {
    let output = initial;
    return map(event, (e) => {
      output = merge(output, e);
      return output;
    }, disposable);
  }
  Event2.reduce = reduce;
  function snapshot(event, disposable) {
    let listener;
    const options = {
      onWillAddFirstListener() {
        listener = event(emitter.fire, emitter);
      },
      onDidRemoveLastListener() {
        listener?.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  function addAndReturnDisposable(d, store) {
    if (store instanceof Array) {
      store.push(d);
    } else if (store) {
      store.add(d);
    }
    return d;
  }
  function debounce(event, merge, delay = 100, leading = false, flushOnListenerRemove = false, leakWarningThreshold, disposable) {
    let subscription;
    let output = void 0;
    let handle = void 0;
    let numDebouncedCalls = 0;
    let doFire;
    const options = {
      leakWarningThreshold,
      onWillAddFirstListener() {
        subscription = event((cur) => {
          numDebouncedCalls++;
          output = merge(output, cur);
          if (leading && !handle) {
            emitter.fire(output);
            output = void 0;
          }
          doFire = () => {
            const _output = output;
            output = void 0;
            handle = void 0;
            if (!leading || numDebouncedCalls > 1) {
              emitter.fire(_output);
            }
            numDebouncedCalls = 0;
          };
          if (typeof delay === "number") {
            if (handle) {
              clearTimeout(handle);
            }
            handle = setTimeout(doFire, delay);
          } else {
            if (handle === void 0) {
              handle = null;
              queueMicrotask(doFire);
            }
          }
        });
      },
      onWillRemoveListener() {
        if (flushOnListenerRemove && numDebouncedCalls > 0) {
          doFire?.();
        }
      },
      onDidRemoveLastListener() {
        doFire = void 0;
        subscription.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  Event2.debounce = debounce;
  function accumulate(event, delay = 0, flushOnListenerRemove, disposable) {
    return Event2.debounce(event, (last, e) => {
      if (!last) {
        return [e];
      }
      last.push(e);
      return last;
    }, delay, void 0, flushOnListenerRemove ?? true, void 0, disposable);
  }
  Event2.accumulate = accumulate;
  function throttle(event, merge, delay = 100, leading = true, trailing = true, leakWarningThreshold, disposable) {
    let subscription;
    let output = void 0;
    let handle = void 0;
    let numThrottledCalls = 0;
    const options = {
      leakWarningThreshold,
      onWillAddFirstListener() {
        subscription = event((cur) => {
          numThrottledCalls++;
          output = merge(output, cur);
          if (handle === void 0) {
            if (leading) {
              emitter.fire(output);
              output = void 0;
              numThrottledCalls = 0;
            }
            if (typeof delay === "number") {
              handle = setTimeout(() => {
                if (trailing && numThrottledCalls > 0) {
                  emitter.fire(output);
                }
                output = void 0;
                handle = void 0;
                numThrottledCalls = 0;
              }, delay);
            } else {
              handle = 0;
              queueMicrotask(() => {
                if (trailing && numThrottledCalls > 0) {
                  emitter.fire(output);
                }
                output = void 0;
                handle = void 0;
                numThrottledCalls = 0;
              });
            }
          }
        });
      },
      onDidRemoveLastListener() {
        subscription.dispose();
      }
    };
    if (!disposable) {
      _addLeakageTraceLogic(options);
    }
    const emitter = new Emitter(options);
    disposable?.add(emitter);
    return emitter.event;
  }
  Event2.throttle = throttle;
  function latch(event, equals = (a, b) => a === b, disposable) {
    let firstCall = true;
    let cache;
    return filter(event, (value) => {
      const shouldEmit = firstCall || !equals(value, cache);
      firstCall = false;
      cache = value;
      return shouldEmit;
    }, disposable);
  }
  Event2.latch = latch;
  function split(event, isT, disposable) {
    return [
      Event2.filter(event, isT, disposable),
      Event2.filter(event, (e) => !isT(e), disposable)
    ];
  }
  Event2.split = split;
  function buffer(event, debugName, flushAfterTimeout = false, _buffer = [], disposable) {
    let buffer2 = _buffer.slice();
    let bufferLeakWarningData;
    if (_isBufferLeakWarningEnabled()) {
      bufferLeakWarningData = {
        stack: Stacktrace.create(),
        timerId: setTimeout(() => {
          if (buffer2 && buffer2.length > 0 && bufferLeakWarningData && !bufferLeakWarningData.warned) {
            bufferLeakWarningData.warned = true;
            console.warn(`[Event.buffer][${debugName}] potential LEAK detected: ${buffer2.length} events buffered for ${_bufferLeakWarnTimeThreshold / 1e3}s without being consumed. Buffered here:`);
            bufferLeakWarningData.stack.print();
          }
        }, _bufferLeakWarnTimeThreshold),
        warned: false
      };
      if (disposable) {
        disposable.add(toDisposable(() => clearTimeout(bufferLeakWarningData.timerId)));
      }
    }
    const clearLeakWarningTimer = () => {
      if (bufferLeakWarningData) {
        clearTimeout(bufferLeakWarningData.timerId);
      }
    };
    let listener = event((e) => {
      if (buffer2) {
        buffer2.push(e);
        if (_isBufferLeakWarningEnabled() && bufferLeakWarningData && !bufferLeakWarningData.warned && buffer2.length >= _bufferLeakWarnCountThreshold) {
          bufferLeakWarningData.warned = true;
          console.warn(`[Event.buffer][${debugName}] potential LEAK detected: ${buffer2.length} events buffered without being consumed. Buffered here:`);
          bufferLeakWarningData.stack.print();
        }
      } else {
        emitter.fire(e);
      }
    });
    if (disposable) {
      disposable.add(listener);
    }
    const flush = () => {
      buffer2?.forEach((e) => emitter.fire(e));
      buffer2 = null;
      clearLeakWarningTimer();
    };
    const emitter = new Emitter({
      onWillAddFirstListener() {
        if (!listener) {
          listener = event((e) => emitter.fire(e));
          if (disposable) {
            disposable.add(listener);
          }
        }
      },
      onDidAddFirstListener() {
        if (buffer2) {
          if (flushAfterTimeout) {
            setTimeout(flush);
          } else {
            flush();
          }
        }
      },
      onDidRemoveLastListener() {
        if (listener) {
          listener.dispose();
        }
        listener = null;
        clearLeakWarningTimer();
      }
    });
    if (disposable) {
      disposable.add(emitter);
    }
    return emitter.event;
  }
  Event2.buffer = buffer;
  function chain(event, sythensize) {
    const fn = (listener, thisArgs, disposables) => {
      const cs = sythensize(new ChainableSynthesis());
      return event(function(value) {
        const result = cs.evaluate(value);
        if (result !== HaltChainable) {
          listener.call(thisArgs, result);
        }
      }, void 0, disposables);
    };
    return fn;
  }
  Event2.chain = chain;
  const HaltChainable = /* @__PURE__ */ Symbol("HaltChainable");
  class ChainableSynthesis {
    constructor() {
      this.steps = [];
    }
    map(fn) {
      this.steps.push(fn);
      return this;
    }
    forEach(fn) {
      this.steps.push((v) => {
        fn(v);
        return v;
      });
      return this;
    }
    filter(fn) {
      this.steps.push((v) => fn(v) ? v : HaltChainable);
      return this;
    }
    reduce(merge, initial) {
      let last = initial;
      this.steps.push((v) => {
        last = merge(last, v);
        return last;
      });
      return this;
    }
    latch(equals = (a, b) => a === b) {
      let firstCall = true;
      let cache;
      this.steps.push((value) => {
        const shouldEmit = firstCall || !equals(value, cache);
        firstCall = false;
        cache = value;
        return shouldEmit ? value : HaltChainable;
      });
      return this;
    }
    evaluate(value) {
      for (const step of this.steps) {
        value = step(value);
        if (value === HaltChainable) {
          break;
        }
      }
      return value;
    }
  }
  function fromNodeEventEmitter(emitter, eventName, map2 = (id2) => id2) {
    const fn = (...args) => result.fire(map2(...args));
    const onFirstListenerAdd = () => emitter.on(eventName, fn);
    const onLastListenerRemove = () => emitter.removeListener(eventName, fn);
    const result = new Emitter({ onWillAddFirstListener: onFirstListenerAdd, onDidRemoveLastListener: onLastListenerRemove });
    return result.event;
  }
  Event2.fromNodeEventEmitter = fromNodeEventEmitter;
  function fromDOMEventEmitter(emitter, eventName, map2 = (id2) => id2) {
    const fn = (...args) => result.fire(map2(...args));
    const onFirstListenerAdd = () => emitter.addEventListener(eventName, fn);
    const onLastListenerRemove = () => emitter.removeEventListener(eventName, fn);
    const result = new Emitter({ onWillAddFirstListener: onFirstListenerAdd, onDidRemoveLastListener: onLastListenerRemove });
    return result.event;
  }
  Event2.fromDOMEventEmitter = fromDOMEventEmitter;
  function toPromise(event, disposables) {
    let cancelRef;
    let listener;
    const promise = new Promise((resolve) => {
      listener = once(event)(resolve);
      addToDisposables(listener, disposables);
      cancelRef = () => {
        disposeAndRemove(listener, disposables);
      };
    });
    promise.cancel = cancelRef;
    if (disposables) {
      promise.finally(() => disposeAndRemove(listener, disposables));
    }
    return promise;
  }
  Event2.toPromise = toPromise;
  function forward(from, to) {
    return from((e) => to.fire(e));
  }
  Event2.forward = forward;
  function runAndSubscribe(event, handler, initial) {
    handler(initial);
    return event((e) => handler(e));
  }
  Event2.runAndSubscribe = runAndSubscribe;
  class EmitterObserver {
    constructor(_observable, store) {
      this._observable = _observable;
      this._counter = 0;
      this._hasChanged = false;
      const options = {
        onWillAddFirstListener: () => {
          _observable.addObserver(this);
          this._observable.reportChanges();
        },
        onDidRemoveLastListener: () => {
          _observable.removeObserver(this);
        }
      };
      if (!store) {
        _addLeakageTraceLogic(options);
      }
      this.emitter = new Emitter(options);
      if (store) {
        store.add(this.emitter);
      }
    }
    beginUpdate(_observable) {
      this._counter++;
    }
    handlePossibleChange(_observable) {
    }
    handleChange(_observable, _change) {
      this._hasChanged = true;
    }
    endUpdate(_observable) {
      this._counter--;
      if (this._counter === 0) {
        this._observable.reportChanges();
        if (this._hasChanged) {
          this._hasChanged = false;
          this.emitter.fire(this._observable.get());
        }
      }
    }
  }
  function fromObservable(obs, store) {
    const observer = new EmitterObserver(obs, store);
    return observer.emitter.event;
  }
  Event2.fromObservable = fromObservable;
  function fromObservableLight(observable) {
    return (listener, thisArgs, disposables) => {
      let count = 0;
      let didChange = false;
      const observer = {
        beginUpdate() {
          count++;
        },
        endUpdate() {
          count--;
          if (count === 0) {
            observable.reportChanges();
            if (didChange) {
              didChange = false;
              listener.call(thisArgs);
            }
          }
        },
        handlePossibleChange() {
        },
        handleChange() {
          didChange = true;
        }
      };
      observable.addObserver(observer);
      observable.reportChanges();
      const disposable = {
        dispose() {
          observable.removeObserver(observer);
        }
      };
      addToDisposables(disposable, disposables);
      return disposable;
    };
  }
  Event2.fromObservableLight = fromObservableLight;
})(Event || (Event = {}));
const _EventProfiling = class _EventProfiling {
  constructor(name) {
    this.listenerCount = 0;
    this.invocationCount = 0;
    this.elapsedOverall = 0;
    this.durations = [];
    this.name = `${name}_${_EventProfiling._idPool++}`;
    _EventProfiling.all.add(this);
  }
  start(listenerCount) {
    this._stopWatch = new StopWatch();
    this.listenerCount = listenerCount;
  }
  stop() {
    if (this._stopWatch) {
      const elapsed = this._stopWatch.elapsed();
      this.durations.push(elapsed);
      this.elapsedOverall += elapsed;
      this.invocationCount += 1;
      this._stopWatch = void 0;
    }
  }
};
_EventProfiling.all = /* @__PURE__ */ new Set();
_EventProfiling._idPool = 0;
let EventProfiling = _EventProfiling;
let _globalLeakWarningThreshold = -1;
function setGlobalLeakWarningThreshold(n) {
  const oldValue = _globalLeakWarningThreshold;
  _globalLeakWarningThreshold = n;
  return {
    dispose() {
      _globalLeakWarningThreshold = oldValue;
    }
  };
}
const _LeakageMonitor = class _LeakageMonitor {
  constructor(_errorHandler, threshold, name = (_LeakageMonitor._idPool++).toString(16).padStart(3, "0")) {
    this._errorHandler = _errorHandler;
    this.threshold = threshold;
    this.name = name;
    this._warnCountdown = 0;
  }
  dispose() {
    this._stacks?.clear();
  }
  check(stack, listenerCount) {
    const threshold = this.threshold;
    if (threshold <= 0 || listenerCount < threshold) {
      return void 0;
    }
    if (!this._stacks) {
      this._stacks = /* @__PURE__ */ new Map();
    }
    const count = this._stacks.get(stack.value) || 0;
    this._stacks.set(stack.value, count + 1);
    this._warnCountdown -= 1;
    if (this._warnCountdown <= 0) {
      this._warnCountdown = threshold * 0.5;
      const [topStack, topCount] = this.getMostFrequentStack();
      const emitterName = /^[0-9a-f]+$/i.test(this.name) ? void 0 : this.name;
      const message = `[${this.name}] potential listener LEAK detected, having ${listenerCount} listeners already. MOST frequent listener (${topCount}):`;
      console.warn(message);
      console.warn(topStack);
      const kind = topCount / listenerCount > 0.3 ? "dominated" : "popular";
      const error = new ListenerLeakError(kind, message, topStack, listenerCount, emitterName);
      this._errorHandler(error);
    }
    return () => {
      const count2 = this._stacks.get(stack.value) || 0;
      this._stacks.set(stack.value, count2 - 1);
    };
  }
  getMostFrequentStack() {
    if (!this._stacks) {
      return void 0;
    }
    let topStack;
    let topCount = 0;
    for (const [stack, count] of this._stacks) {
      if (!topStack || topCount < count) {
        topStack = [stack, count];
        topCount = count;
      }
    }
    return topStack;
  }
};
_LeakageMonitor._idPool = 1;
let LeakageMonitor = _LeakageMonitor;
class Stacktrace {
  constructor(value) {
    this.value = value;
  }
  static create() {
    const err = new Error();
    return new Stacktrace(err.stack ?? "");
  }
  print() {
    console.warn(this.value.split("\n").slice(2).join("\n"));
  }
}
class ListenerLeakError extends Error {
  constructor(kind, details, stack, listenerCount, emitterName) {
    super(emitterName ? `[${emitterName}] potential listener LEAK detected, ${kind}` : `potential listener LEAK detected, ${kind}`);
    this.name = "ListenerLeakError";
    this.kind = kind;
    this.listenerCount = listenerCount;
    this.details = details;
    this.stack = stack;
  }
  static is(err) {
    return err instanceof ListenerLeakError || err instanceof Error && typeof err.kind === "string" && typeof err.listenerCount === "number";
  }
}
class ListenerRefusalError extends ListenerLeakError {
  constructor(kind, details, stack, listenerCount, emitterName) {
    super(kind, details, stack, listenerCount, emitterName);
    this.name = "ListenerRefusalError";
  }
}
let id = 0;
class UniqueContainer {
  constructor(value) {
    this.value = value;
    this.id = id++;
  }
}
const compactionThreshold = 2;
const forEachListener = (listeners, fn) => {
  if (listeners instanceof UniqueContainer) {
    fn(listeners);
  } else {
    for (let i = 0; i < listeners.length; i++) {
      const l = listeners[i];
      if (l) {
        fn(l);
      }
    }
  }
};
class Emitter {
  constructor(options) {
    this._size = 0;
    this._options = options;
    this._leakageMon = _globalLeakWarningThreshold > 0 || this._options?.leakWarningThreshold ? new LeakageMonitor(options?.onListenerError ?? onUnexpectedError, this._options?.leakWarningThreshold ?? _globalLeakWarningThreshold, this._options?.leakWarningName) : void 0;
    this._perfMon = this._options?._profName ? new EventProfiling(this._options._profName) : void 0;
    this._deliveryQueue = this._options?.deliveryQueue;
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      if (this._deliveryQueue?.current === this) {
        this._deliveryQueue.reset();
      }
      if (this._listeners) {
        if (_enableDisposeWithListenerWarning) {
          const listeners = this._listeners;
          queueMicrotask(() => {
            forEachListener(listeners, (l) => l.stack?.print());
          });
        }
        this._listeners = void 0;
        this._size = 0;
      }
      this._options?.onDidRemoveLastListener?.();
      this._leakageMon?.dispose();
    }
  }
  /**
   * For the public to allow to subscribe
   * to events from this Emitter
   */
  get event() {
    this._event ??= (callback, thisArgs, disposables) => {
      if (this._leakageMon && this._size > this._leakageMon.threshold ** 2) {
        const message = `[${this._leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${this._leakageMon.threshold})`;
        console.warn(message);
        const tuple = this._leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1];
        const kind = tuple[1] / this._size > 0.3 ? "dominated" : "popular";
        const error = new ListenerRefusalError(kind, `${message}. HINT: Stack shows most frequent listener (${tuple[1]}-times)`, tuple[0], this._size, this._options?.leakWarningName);
        const errorHandler = this._options?.onListenerError || onUnexpectedError;
        errorHandler(error);
        return Disposable.None;
      }
      if (this._disposed) {
        return Disposable.None;
      }
      if (thisArgs) {
        callback = callback.bind(thisArgs);
      }
      const contained = new UniqueContainer(callback);
      let removeMonitor;
      let stack;
      if (this._leakageMon && this._size >= Math.ceil(this._leakageMon.threshold * 0.2)) {
        contained.stack = Stacktrace.create();
        removeMonitor = this._leakageMon.check(contained.stack, this._size + 1);
      }
      if (_enableDisposeWithListenerWarning) {
        contained.stack = stack ?? Stacktrace.create();
      }
      if (!this._listeners) {
        this._options?.onWillAddFirstListener?.(this);
        this._listeners = contained;
        this._options?.onDidAddFirstListener?.(this);
      } else if (this._listeners instanceof UniqueContainer) {
        this._deliveryQueue ??= new EventDeliveryQueuePrivate();
        this._listeners = [this._listeners, contained];
      } else {
        this._listeners.push(contained);
      }
      this._options?.onDidAddListener?.(this);
      this._size++;
      const result = toDisposable(() => {
        removeMonitor?.();
        this._removeListener(contained);
      });
      addToDisposables(result, disposables);
      return result;
    };
    return this._event;
  }
  _removeListener(listener) {
    this._options?.onWillRemoveListener?.(this);
    if (!this._listeners) {
      return;
    }
    if (this._size === 1) {
      this._listeners = void 0;
      this._options?.onDidRemoveLastListener?.(this);
      this._size = 0;
      return;
    }
    const listeners = this._listeners;
    const index = listeners.indexOf(listener);
    if (index === -1) {
      console.log("disposed?", this._disposed);
      console.log("size?", this._size);
      console.log("arr?", JSON.stringify(this._listeners));
      throw new Error("Attempted to dispose unknown listener");
    }
    this._size--;
    listeners[index] = void 0;
    const adjustDeliveryQueue = this._deliveryQueue.current === this;
    if (this._size * compactionThreshold <= listeners.length) {
      let n = 0;
      for (let i = 0; i < listeners.length; i++) {
        if (listeners[i]) {
          listeners[n++] = listeners[i];
        } else if (adjustDeliveryQueue && n < this._deliveryQueue.end) {
          this._deliveryQueue.end--;
          if (n < this._deliveryQueue.i) {
            this._deliveryQueue.i--;
          }
        }
      }
      listeners.length = n;
    }
  }
  _deliver(listener, value) {
    if (!listener) {
      return;
    }
    const errorHandler = this._options?.onListenerError || onUnexpectedError;
    if (!errorHandler) {
      listener.value(value);
      return;
    }
    try {
      listener.value(value);
    } catch (e) {
      errorHandler(e);
    }
  }
  /** Delivers items in the queue. Assumes the queue is ready to go. */
  _deliverQueue(dq) {
    const listeners = dq.current._listeners;
    while (dq.i < dq.end) {
      this._deliver(listeners[dq.i++], dq.value);
    }
    dq.reset();
  }
  /**
   * To be kept private to fire an event to
   * subscribers
   */
  fire(event) {
    if (this._deliveryQueue?.current) {
      this._deliverQueue(this._deliveryQueue);
      this._perfMon?.stop();
    }
    this._perfMon?.start(this._size);
    if (!this._listeners) {
    } else if (this._listeners instanceof UniqueContainer) {
      this._deliver(this._listeners, event);
    } else {
      const dq = this._deliveryQueue;
      dq.enqueue(this, event, this._listeners.length);
      this._deliverQueue(dq);
    }
    this._perfMon?.stop();
  }
  hasListeners() {
    return this._size > 0;
  }
}
const createEventDeliveryQueue = () => new EventDeliveryQueuePrivate();
class EventDeliveryQueuePrivate {
  constructor() {
    /**
     * Index in current's listener list.
     */
    this.i = -1;
    /**
     * The last index in the listener's list to deliver.
     */
    this.end = 0;
  }
  enqueue(emitter, value, end) {
    this.i = 0;
    this.end = end;
    this.current = emitter;
    this.value = value;
  }
  reset() {
    this.i = this.end;
    this.current = void 0;
    this.value = void 0;
  }
}
class AsyncEmitter extends Emitter {
  async fireAsync(data, token, promiseJoin) {
    if (!this._listeners) {
      return;
    }
    if (!this._asyncDeliveryQueue) {
      this._asyncDeliveryQueue = new LinkedList();
    }
    forEachListener(this._listeners, (listener) => this._asyncDeliveryQueue.push([listener.value, data]));
    while (this._asyncDeliveryQueue.size > 0 && !token.isCancellationRequested) {
      const [listener, data2] = this._asyncDeliveryQueue.shift();
      const thenables = [];
      const event = {
        ...data2,
        token,
        waitUntil: (p) => {
          if (Object.isFrozen(thenables)) {
            throw new Error("waitUntil can NOT be called asynchronous");
          }
          if (promiseJoin) {
            p = promiseJoin(p, listener);
          }
          thenables.push(p);
        }
      };
      try {
        listener(event);
      } catch (e) {
        onUnexpectedError(e);
        continue;
      }
      Object.freeze(thenables);
      await Promise.allSettled(thenables).then((values) => {
        for (const value of values) {
          if (value.status === "rejected") {
            onUnexpectedError(value.reason);
          }
        }
      });
    }
  }
}
class PauseableEmitter extends Emitter {
  constructor(options) {
    super(options);
    this._isPaused = 0;
    this._eventQueue = new LinkedList();
    this._mergeFn = options?.merge;
  }
  get isPaused() {
    return this._isPaused !== 0;
  }
  pause() {
    this._isPaused++;
  }
  resume() {
    if (this._isPaused !== 0 && --this._isPaused === 0) {
      if (this._mergeFn) {
        if (this._eventQueue.size > 0) {
          const events = Array.from(this._eventQueue);
          this._eventQueue.clear();
          super.fire(this._mergeFn(events));
        }
      } else {
        while (!this._isPaused && this._eventQueue.size !== 0) {
          super.fire(this._eventQueue.shift());
        }
      }
    }
  }
  fire(event) {
    if (this._size) {
      if (this._isPaused !== 0) {
        this._eventQueue.push(event);
      } else {
        super.fire(event);
      }
    }
  }
}
class DebounceEmitter extends PauseableEmitter {
  constructor(options) {
    super(options);
    this._delay = options.delay ?? 100;
  }
  fire(event) {
    if (!this._handle) {
      this.pause();
      this._handle = setTimeout(() => {
        this._handle = void 0;
        this.resume();
      }, this._delay);
    }
    super.fire(event);
  }
}
class MicrotaskEmitter extends Emitter {
  constructor(options) {
    super(options);
    this._queuedEvents = [];
    this._mergeFn = options?.merge;
  }
  fire(event) {
    if (!this.hasListeners()) {
      return;
    }
    this._queuedEvents.push(event);
    if (this._queuedEvents.length === 1) {
      queueMicrotask(() => {
        if (this._mergeFn) {
          super.fire(this._mergeFn(this._queuedEvents));
        } else {
          this._queuedEvents.forEach((e) => super.fire(e));
        }
        this._queuedEvents = [];
      });
    }
  }
}
class EventMultiplexer {
  constructor() {
    this.hasListeners = false;
    this.events = [];
    this.emitter = new Emitter({
      onWillAddFirstListener: () => this.onFirstListenerAdd(),
      onDidRemoveLastListener: () => this.onLastListenerRemove()
    });
  }
  get event() {
    return this.emitter.event;
  }
  add(event) {
    const e = { event, listener: null };
    this.events.push(e);
    if (this.hasListeners) {
      this.hook(e);
    }
    const dispose = () => {
      if (this.hasListeners) {
        this.unhook(e);
      }
      const idx = this.events.indexOf(e);
      this.events.splice(idx, 1);
    };
    return toDisposable(createSingleCallFunction(dispose));
  }
  onFirstListenerAdd() {
    this.hasListeners = true;
    this.events.forEach((e) => this.hook(e));
  }
  onLastListenerRemove() {
    this.hasListeners = false;
    this.events.forEach((e) => this.unhook(e));
  }
  hook(e) {
    e.listener = e.event((r) => this.emitter.fire(r));
  }
  unhook(e) {
    e.listener?.dispose();
    e.listener = null;
  }
  dispose() {
    this.emitter.dispose();
    for (const e of this.events) {
      e.listener?.dispose();
    }
    this.events = [];
  }
}
class DynamicListEventMultiplexer {
  constructor(items, onAddItem, onRemoveItem, getEvent) {
    this._store = new DisposableStore();
    const multiplexer = this._store.add(new EventMultiplexer());
    const itemListeners = this._store.add(new DisposableMap());
    function addItem(instance) {
      itemListeners.set(instance, multiplexer.add(getEvent(instance)));
    }
    for (const instance of items) {
      addItem(instance);
    }
    this._store.add(onAddItem((instance) => {
      addItem(instance);
    }));
    this._store.add(onRemoveItem((instance) => {
      itemListeners.deleteAndDispose(instance);
    }));
    this.event = multiplexer.event;
  }
  dispose() {
    this._store.dispose();
  }
}
class EventBufferer {
  constructor() {
    this.data = [];
  }
  wrapEvent(event, reduce, initial) {
    return (listener, thisArgs, disposables) => {
      return event((i) => {
        const data = this.data[this.data.length - 1];
        if (!reduce) {
          if (data) {
            data.buffers.push(() => listener.call(thisArgs, i));
          } else {
            listener.call(thisArgs, i);
          }
          return;
        }
        const reduceData = data;
        if (!reduceData) {
          listener.call(thisArgs, reduce(initial, i));
          return;
        }
        reduceData.items ??= [];
        reduceData.items.push(i);
        if (reduceData.buffers.length === 0) {
          data.buffers.push(() => {
            reduceData.reducedResult ??= initial ? reduceData.items.reduce(reduce, initial) : reduceData.items.reduce(reduce);
            listener.call(thisArgs, reduceData.reducedResult);
          });
        }
      }, void 0, disposables);
    };
  }
  bufferEvents(fn) {
    const data = { buffers: new Array() };
    this.data.push(data);
    const r = fn();
    this.data.pop();
    data.buffers.forEach((flush) => flush());
    return r;
  }
}
class Relay {
  constructor() {
    this.listening = false;
    this.inputEvent = Event.None;
    this.inputEventListener = Disposable.None;
    this.emitter = new Emitter({
      onDidAddFirstListener: () => {
        this.listening = true;
        this.inputEventListener = this.inputEvent(this.emitter.fire, this.emitter);
      },
      onDidRemoveLastListener: () => {
        this.listening = false;
        this.inputEventListener.dispose();
      }
    });
    this.event = this.emitter.event;
  }
  set input(event) {
    this.inputEvent = event;
    if (this.listening) {
      this.inputEventListener.dispose();
      this.inputEventListener = event(this.emitter.fire, this.emitter);
    }
  }
  dispose() {
    this.inputEventListener.dispose();
    this.emitter.dispose();
  }
}
class ValueWithChangeEvent {
  constructor(_value) {
    this._value = _value;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  static const(value) {
    return new ConstValueWithChangeEvent(value);
  }
  get value() {
    return this._value;
  }
  set value(value) {
    if (value !== this._value) {
      this._value = value;
      this._onDidChange.fire(void 0);
    }
  }
}
class ConstValueWithChangeEvent {
  constructor(value) {
    this.value = value;
    this.onDidChange = Event.None;
  }
}
function trackSetChanges(getData, onDidChangeData, handleItem) {
  const map = new DisposableMap();
  let oldData = new Set(getData());
  for (const d of oldData) {
    map.set(d, handleItem(d));
  }
  const store = new DisposableStore();
  store.add(onDidChangeData(() => {
    const newData = getData();
    const diff = diffSets(oldData, newData);
    for (const r of diff.removed) {
      map.deleteAndDispose(r);
    }
    for (const a of diff.added) {
      map.set(a, handleItem(a));
    }
    oldData = new Set(newData);
  }));
  store.add(map);
  return store;
}
function addToDisposables(result, disposables) {
  if (disposables instanceof DisposableStore) {
    disposables.add(result);
  } else if (Array.isArray(disposables)) {
    disposables.push(result);
  }
}
function disposeAndRemove(result, disposables) {
  if (disposables instanceof DisposableStore) {
    disposables.delete(result);
  } else if (Array.isArray(disposables)) {
    const index = disposables.indexOf(result);
    if (index !== -1) {
      disposables.splice(index, 1);
    }
  }
  result.dispose();
}
export {
  AsyncEmitter,
  DebounceEmitter,
  DynamicListEventMultiplexer,
  Emitter,
  Event,
  EventBufferer,
  EventMultiplexer,
  EventProfiling,
  ListenerLeakError,
  ListenerRefusalError,
  MicrotaskEmitter,
  PauseableEmitter,
  Relay,
  ValueWithChangeEvent,
  createEventDeliveryQueue,
  setGlobalLeakWarningThreshold,
  trackSetChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL2V2ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZGlmZlNldHMgfSBmcm9tICcuL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJT2JzZXJ2ZXIgfSBmcm9tICcuL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZW52IH0gZnJvbSAnLi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0RlbGF5IH0gZnJvbSAnLi9zeW1ib2xzLmpzJztcblxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVW5jb21tZW50IHRoZSBuZXh0IGxpbmUgdG8gcHJpbnQgd2FybmluZ3Mgd2hlbmV2ZXIgYW4gZW1pdHRlciB3aXRoIGxpc3RlbmVycyBpcyBkaXNwb3NlZC4gVGhhdCBpcyBhIHNpZ24gb2YgY29kZSBzbWVsbC5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5jb25zdCBfZW5hYmxlRGlzcG9zZVdpdGhMaXN0ZW5lcldhcm5pbmcgPSBmYWxzZVxuXHQvLyB8fCBCb29sZWFuKFwiVFJVRVwiKSAvLyBjYXVzZXMgYSBsaW50ZXIgd2FybmluZyBzbyB0aGF0IGl0IGNhbm5vdCBiZSBwdXNoZWRcblx0O1xuXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBVbmNvbW1lbnQgdGhlIG5leHQgbGluZSB0byBwcmludCB3YXJuaW5ncyB3aGVuZXZlciBhIHNuYXBzaG90dGVkIGV2ZW50IGlzIHVzZWQgcmVwZWF0ZWRseSB3aXRob3V0IGNsZWFudXAuXG4vLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0Mjg1MVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbmNvbnN0IF9lbmFibGVTbmFwc2hvdFBvdGVudGlhbExlYWtXYXJuaW5nID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcIlRSVUVcIikgLy8gY2F1c2VzIGEgbGludGVyIHdhcm5pbmcgc28gdGhhdCBpdCBjYW5ub3QgYmUgcHVzaGVkXG5cdDtcblxuXG5jb25zdCBfYnVmZmVyTGVha1dhcm5Db3VudFRocmVzaG9sZCA9IDEwMDtcbmNvbnN0IF9idWZmZXJMZWFrV2FyblRpbWVUaHJlc2hvbGQgPSA2MF8wMDA7IC8vIDEgbWludXRlXG5cbmZ1bmN0aW9uIF9pc0J1ZmZlckxlYWtXYXJuaW5nRW5hYmxlZCgpOiBib29sZWFuIHtcblx0cmV0dXJuICEhZW52WydWU0NPREVfREVWJ107XG59XG5cbi8qKlxuICogQW4gZXZlbnQgd2l0aCB6ZXJvIG9yIG9uZSBwYXJhbWV0ZXJzIHRoYXQgY2FuIGJlIHN1YnNjcmliZWQgdG8uIFRoZSBldmVudCBpcyBhIGZ1bmN0aW9uIGl0c2VsZi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFdmVudDxUPiB7XG5cdChsaXN0ZW5lcjogKGU6IFQpID0+IHVua25vd24sIHRoaXNBcmdzPzogYW55LCBkaXNwb3NhYmxlcz86IElEaXNwb3NhYmxlW10gfCBEaXNwb3NhYmxlU3RvcmUpOiBJRGlzcG9zYWJsZTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFdmVudCB7XG5cdGV4cG9ydCBjb25zdCBOb25lOiBFdmVudDxhbnk+ID0gKCkgPT4gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdGZ1bmN0aW9uIF9hZGRMZWFrYWdlVHJhY2VMb2dpYyhvcHRpb25zOiBFbWl0dGVyT3B0aW9ucykge1xuXHRcdGlmIChfZW5hYmxlU25hcHNob3RQb3RlbnRpYWxMZWFrV2FybmluZykge1xuXHRcdFx0Y29uc3QgeyBvbkRpZEFkZExpc3RlbmVyOiBvcmlnTGlzdGVuZXJEaWRBZGQgfSA9IG9wdGlvbnM7XG5cdFx0XHRjb25zdCBzdGFjayA9IFN0YWNrdHJhY2UuY3JlYXRlKCk7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0b3B0aW9ucy5vbkRpZEFkZExpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoKytjb3VudCA9PT0gMikge1xuXHRcdFx0XHRcdGNvbnNvbGUud2Fybignc25hcHNob3R0ZWQgZW1pdHRlciBMSUtFTFkgdXNlZCBwdWJsaWMgYW5kIFNIT1VMRCBIQVZFIEJFRU4gY3JlYXRlZCB3aXRoIERpc3Bvc2FibGVTdG9yZS4gc25hcHNob3R0ZWQgaGVyZScpO1xuXHRcdFx0XHRcdHN0YWNrLnByaW50KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3JpZ0xpc3RlbmVyRGlkQWRkPy4oKTtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIGFub3RoZXIgZXZlbnQgd2hpY2ggZGVib3VuY2VzIGNhbGxzIGFuZCBkZWZlcnMgdGhlIGxpc3RlbmVycyB0byBhIGxhdGVyIHRhc2sgdmlhIGEgc2hhcmVkXG5cdCAqIGBzZXRUaW1lb3V0YC4gVGhlIGV2ZW50IGlzIGNvbnZlcnRlZCBpbnRvIGEgc2lnbmFsIChgRXZlbnQ8dm9pZD5gKSB0byBhdm9pZCBhZGRpdGlvbmFsIG9iamVjdCBjcmVhdGlvbiBhcyBhXG5cdCAqIHJlc3VsdCBvZiBtZXJnaW5nIGV2ZW50cyBhbmQgdG8gdHJ5IHByZXZlbnQgcmFjZSBjb25kaXRpb25zIHRoYXQgY291bGQgYXJpc2Ugd2hlbiB1c2luZyByZWxhdGVkIGRlZmVycmVkIGFuZFxuXHQgKiBub24tZGVmZXJyZWQgZXZlbnRzLlxuXHQgKlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCBmb3IgZGVmZXJyaW5nIG5vbi1jcml0aWNhbCB3b3JrIChlZy4gZ2VuZXJhbCBVSSB1cGRhdGVzKSB0byBlbnN1cmUgaXQgZG9lcyBub3QgYmxvY2sgY3JpdGljYWwgd29ya1xuXHQgKiAoZWcuIGxhdGVuY3kgb2Yga2V5cHJlc3MgdG8gdGV4dCByZW5kZXJlZCkuXG5cdCAqXG5cdCAqICpOT1RFKiB0aGF0IHRoaXMgZnVuY3Rpb24gcmV0dXJucyBhbiBgRXZlbnRgIGFuZCBpdCBNVVNUIGJlIGNhbGxlZCB3aXRoIGEgYERpc3Bvc2FibGVTdG9yZWAgd2hlbmV2ZXIgdGhlIHJldHVybmVkXG5cdCAqIGV2ZW50IGlzIGFjY2Vzc2libGUgdG8gXCJ0aGlyZCBwYXJ0aWVzXCIsIGUuZyB0aGUgZXZlbnQgaXMgYSBwdWJsaWMgcHJvcGVydHkuIE90aGVyd2lzZSBhIGxlYWtlZCBsaXN0ZW5lciBvbiB0aGVcblx0ICogcmV0dXJuZWQgZXZlbnQgY2F1c2VzIHRoaXMgdXRpbGl0eSB0byBsZWFrIGEgbGlzdGVuZXIgb24gdGhlIG9yaWdpbmFsIGV2ZW50LlxuXHQgKlxuXHQgKiBAcGFyYW0gZXZlbnQgVGhlIGV2ZW50IHNvdXJjZSBmb3IgdGhlIG5ldyBldmVudC5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZGVmZXIoZXZlbnQ6IEV2ZW50PHVua25vd24+LCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiBkZWJvdW5jZTx1bmtub3duLCB2b2lkPihldmVudCwgKCkgPT4gdm9pZCAwLCAwLCB1bmRlZmluZWQsIGZsdXNoT25MaXN0ZW5lclJlbW92ZSA/PyB0cnVlLCB1bmRlZmluZWQsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIGFub3RoZXIgZXZlbnQgd2hpY2ggb25seSBmaXJlcyBvbmNlLlxuXHQgKlxuXHQgKiBAcGFyYW0gZXZlbnQgVGhlIGV2ZW50IHNvdXJjZSBmb3IgdGhlIG5ldyBldmVudC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBvbmNlPFQ+KGV2ZW50OiBFdmVudDxUPik6IEV2ZW50PFQ+IHtcblx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0Ly8gd2UgbmVlZCB0aGlzLCBpbiBjYXNlIHRoZSBldmVudCBmaXJlcyBkdXJpbmcgdGhlIGxpc3RlbmVyIGNhbGxcblx0XHRcdGxldCBkaWRGaXJlID0gZmFsc2U7XG5cdFx0XHRsZXQgcmVzdWx0OiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHJlc3VsdCA9IGV2ZW50KGUgPT4ge1xuXHRcdFx0XHRpZiAoZGlkRmlyZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRpZEZpcmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpO1xuXHRcdFx0fSwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRpZiAoZGlkRmlyZSkge1xuXHRcdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYW4gZXZlbnQsIHJldHVybnMgYW5vdGhlciBldmVudCB3aGljaCBvbmx5IGZpcmVzIG9uY2UsIGFuZCBvbmx5IHdoZW4gdGhlIGNvbmRpdGlvbiBpcyBtZXQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIG9uY2VJZjxUPihldmVudDogRXZlbnQ8VD4sIGNvbmRpdGlvbjogKGU6IFQpID0+IGJvb2xlYW4pOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIEV2ZW50Lm9uY2UoRXZlbnQuZmlsdGVyKGV2ZW50LCBjb25kaXRpb24pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXBzIGFuIGV2ZW50IG9mIG9uZSB0eXBlIGludG8gYW4gZXZlbnQgb2YgYW5vdGhlciB0eXBlIHVzaW5nIGEgbWFwcGluZyBmdW5jdGlvbiwgc2ltaWxhciB0byBob3dcblx0ICogYEFycmF5LnByb3RvdHlwZS5tYXBgIHdvcmtzLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBtYXAgVGhlIG1hcHBpbmcgZnVuY3Rpb24uXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gbWFwPEksIE8+KGV2ZW50OiBFdmVudDxJPiwgbWFwOiAoaTogSSkgPT4gTywgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PE8+IHtcblx0XHRyZXR1cm4gc25hcHNob3QoKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4gZXZlbnQoaSA9PiBsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCBtYXAoaSkpLCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyYXBzIGFuIGV2ZW50IGluIGFub3RoZXIgZXZlbnQgdGhhdCBwZXJmb3JtcyBzb21lIGZ1bmN0aW9uIG9uIHRoZSBldmVudCBvYmplY3QgYmVmb3JlIGZpcmluZy5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gZWFjaCBUaGUgZnVuY3Rpb24gdG8gcGVyZm9ybSBvbiB0aGUgZXZlbnQgb2JqZWN0LlxuXHQgKiBAcGFyYW0gZGlzcG9zYWJsZSBBIGRpc3Bvc2FibGUgc3RvcmUgdG8gYWRkIHRoZSBuZXcgRXZlbnRFbWl0dGVyIHRvLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZvckVhY2g8ST4oZXZlbnQ6IEV2ZW50PEk+LCBlYWNoOiAoaTogSSkgPT4gdm9pZCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PEk+IHtcblx0XHRyZXR1cm4gc25hcHNob3QoKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4gZXZlbnQoaSA9PiB7IGVhY2goaSk7IGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGkpOyB9LCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdyYXBzIGFuIGV2ZW50IGluIGFub3RoZXIgZXZlbnQgdGhhdCBmaXJlcyBvbmx5IHdoZW4gc29tZSBjb25kaXRpb24gaXMgbWV0LlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBmaWx0ZXIgVGhlIGZpbHRlciBmdW5jdGlvbiB0aGF0IGRlZmluZXMgdGhlIGNvbmRpdGlvbi4gVGhlIGV2ZW50IHdpbGwgZmlyZSBmb3IgdGhlIG9iamVjdCBpZiB0aGlzIGZ1bmN0aW9uXG5cdCAqIHJldHVybnMgdHJ1ZS5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIGFkZCB0aGUgbmV3IEV2ZW50RW1pdHRlciB0by5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWx0ZXI8VCwgVT4oZXZlbnQ6IEV2ZW50PFQgfCBVPiwgZmlsdGVyOiAoZTogVCB8IFUpID0+IGUgaXMgVCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZmlsdGVyPFQ+KGV2ZW50OiBFdmVudDxUPiwgZmlsdGVyOiAoZTogVCkgPT4gYm9vbGVhbiwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZmlsdGVyPFQsIFI+KGV2ZW50OiBFdmVudDxUIHwgUj4sIGZpbHRlcjogKGU6IFQgfCBSKSA9PiBlIGlzIFIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxSPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbHRlcjxUPihldmVudDogRXZlbnQ8VD4sIGZpbHRlcjogKGU6IFQpID0+IGJvb2xlYW4sIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIHNuYXBzaG90KChsaXN0ZW5lciwgdGhpc0FyZ3MgPSBudWxsLCBkaXNwb3NhYmxlcz8pID0+IGV2ZW50KGUgPT4gZmlsdGVyKGUpICYmIGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpLCBudWxsLCBkaXNwb3NhYmxlcyksIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGFuIGV2ZW50LCByZXR1cm5zIHRoZSBzYW1lIGV2ZW50IGJ1dCB0eXBlZCBhcyBgRXZlbnQ8dm9pZD5gLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHNpZ25hbDxUPihldmVudDogRXZlbnQ8VD4pOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIGV2ZW50IGFzIEV2ZW50PGFueT4gYXMgRXZlbnQ8dm9pZD47XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBjb2xsZWN0aW9uIG9mIGV2ZW50cywgcmV0dXJucyBhIHNpbmdsZSBldmVudCB3aGljaCBlbWl0cyB3aGVuZXZlciBhbnkgb2YgdGhlIHByb3ZpZGVkIGV2ZW50cyBlbWl0LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGFueTxUPiguLi5ldmVudHM6IEV2ZW50PFQ+W10pOiBFdmVudDxUPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIGFueSguLi5ldmVudHM6IEV2ZW50PGFueT5bXSk6IEV2ZW50PHZvaWQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gYW55PFQ+KC4uLmV2ZW50czogRXZlbnQ8VD5bXSk6IEV2ZW50PFQ+IHtcblx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncyA9IG51bGwsIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNvbWJpbmVkRGlzcG9zYWJsZSguLi5ldmVudHMubWFwKGV2ZW50ID0+IGV2ZW50KGUgPT4gbGlzdGVuZXIuY2FsbCh0aGlzQXJncywgZSkpKSk7XG5cdFx0XHRyZXR1cm4gYWRkQW5kUmV0dXJuRGlzcG9zYWJsZShkaXNwb3NhYmxlLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiByZWR1Y2U8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBpbml0aWFsPzogTywgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PE8+IHtcblx0XHRsZXQgb3V0cHV0OiBPIHwgdW5kZWZpbmVkID0gaW5pdGlhbDtcblxuXHRcdHJldHVybiBtYXA8SSwgTz4oZXZlbnQsIGUgPT4ge1xuXHRcdFx0b3V0cHV0ID0gbWVyZ2Uob3V0cHV0LCBlKTtcblx0XHRcdHJldHVybiBvdXRwdXQ7XG5cdFx0fSwgZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzbmFwc2hvdDxUPihldmVudDogRXZlbnQ8VD4sIGRpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCk6IEV2ZW50PFQ+IHtcblx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogRW1pdHRlck9wdGlvbnMgfCB1bmRlZmluZWQgPSB7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRsaXN0ZW5lciA9IGV2ZW50KGVtaXR0ZXIuZmlyZSwgZW1pdHRlcik7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXIoKSB7XG5cdFx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGlmICghZGlzcG9zYWJsZSkge1xuXHRcdFx0X2FkZExlYWthZ2VUcmFjZUxvZ2ljKG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPihvcHRpb25zKTtcblxuXHRcdGRpc3Bvc2FibGU/LmFkZChlbWl0dGVyKTtcblxuXHRcdHJldHVybiBlbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgdGhlIElEaXNwb3NhYmxlIHRvIHRoZSBzdG9yZSBpZiBpdCdzIHNldCwgYW5kIHJldHVybnMgaXQuIFVzZWZ1bCB0b1xuXHQgKiBFdmVudCBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIGFkZEFuZFJldHVybkRpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkOiBULCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgSURpc3Bvc2FibGVbXSB8IHVuZGVmaW5lZCk6IFQge1xuXHRcdGlmIChzdG9yZSBpbnN0YW5jZW9mIEFycmF5KSB7XG5cdFx0XHRzdG9yZS5wdXNoKGQpO1xuXHRcdH0gZWxzZSBpZiAoc3RvcmUpIHtcblx0XHRcdHN0b3JlLmFkZChkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGQ7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYW4gZXZlbnQsIGNyZWF0ZXMgYSBuZXcgZW1pdHRlciB0aGF0IGV2ZW50IHRoYXQgd2lsbCBkZWJvdW5jZSBldmVudHMgYmFzZWQgb24ge0BsaW5rIGRlbGF5fSBhbmQgZ2l2ZSBhblxuXHQgKiBhcnJheSBldmVudCBvYmplY3Qgb2YgYWxsIGV2ZW50cyB0aGF0IGZpcmVkLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBvcmlnaW5hbCBldmVudCB0byBkZWJvdW5jZS5cblx0ICogQHBhcmFtIG1lcmdlIEEgZnVuY3Rpb24gdGhhdCByZWR1Y2VzIGFsbCBldmVudHMgaW50byBhIHNpbmdsZSBldmVudC5cblx0ICogQHBhcmFtIGRlbGF5IFRoZSBudW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIGRlYm91bmNlLlxuXHQgKiBAcGFyYW0gbGVhZGluZyBXaGV0aGVyIHRvIGZpcmUgYSBsZWFkaW5nIGV2ZW50IHdpdGhvdXQgZGVib3VuY2luZy5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBsZWFrV2FybmluZ1RocmVzaG9sZCBTZWUge0BsaW5rIEVtaXR0ZXJPcHRpb25zLmxlYWtXYXJuaW5nVGhyZXNob2xkfS5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIHJlZ2lzdGVyIHRoZSBkZWJvdW5jZSBlbWl0dGVyIHRvLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlPFQ+KGV2ZW50OiBFdmVudDxUPiwgbWVyZ2U6IChsYXN0OiBUIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gVCwgZGVsYXk/OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXksIGxlYWRpbmc/OiBib29sZWFuLCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBsZWFrV2FybmluZ1RocmVzaG9sZD86IG51bWJlciwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gZGVib3VuY2U8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBkZWxheT86IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSwgbGVhZGluZz86IGJvb2xlYW4sIGZsdXNoT25MaXN0ZW5lclJlbW92ZT86IGJvb2xlYW4sIGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8Tz47XG5cdGV4cG9ydCBmdW5jdGlvbiBkZWJvdW5jZTxJLCBPPihldmVudDogRXZlbnQ8ST4sIG1lcmdlOiAobGFzdDogTyB8IHVuZGVmaW5lZCwgZXZlbnQ6IEkpID0+IE8sIGRlbGF5OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXkgPSAxMDAsIGxlYWRpbmcgPSBmYWxzZSwgZmx1c2hPbkxpc3RlbmVyUmVtb3ZlID0gZmFsc2UsIGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8Tz4ge1xuXHRcdGxldCBzdWJzY3JpcHRpb246IElEaXNwb3NhYmxlO1xuXHRcdGxldCBvdXRwdXQ6IE8gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGhhbmRsZTogVGltZW91dCB8IHVuZGVmaW5lZCB8IG51bGwgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IG51bURlYm91bmNlZENhbGxzID0gMDtcblx0XHRsZXQgZG9GaXJlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBvcHRpb25zOiBFbWl0dGVyT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHtcblx0XHRcdGxlYWtXYXJuaW5nVGhyZXNob2xkLFxuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9uID0gZXZlbnQoY3VyID0+IHtcblx0XHRcdFx0XHRudW1EZWJvdW5jZWRDYWxscysrO1xuXHRcdFx0XHRcdG91dHB1dCA9IG1lcmdlKG91dHB1dCwgY3VyKTtcblxuXHRcdFx0XHRcdGlmIChsZWFkaW5nICYmICFoYW5kbGUpIHtcblx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShvdXRwdXQpO1xuXHRcdFx0XHRcdFx0b3V0cHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvRmlyZSA9ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IF9vdXRwdXQgPSBvdXRwdXQ7XG5cdFx0XHRcdFx0XHRvdXRwdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoIWxlYWRpbmcgfHwgbnVtRGVib3VuY2VkQ2FsbHMgPiAxKSB7XG5cdFx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShfb3V0cHV0ISk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRudW1EZWJvdW5jZWRDYWxscyA9IDA7XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgZGVsYXkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdFx0XHRcdGNsZWFyVGltZW91dChoYW5kbGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aGFuZGxlID0gc2V0VGltZW91dChkb0ZpcmUsIGRlbGF5KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGhhbmRsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZSA9IG51bGw7XG5cdFx0XHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKGRvRmlyZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbldpbGxSZW1vdmVMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGZsdXNoT25MaXN0ZW5lclJlbW92ZSAmJiBudW1EZWJvdW5jZWRDYWxscyA+IDApIHtcblx0XHRcdFx0XHRkb0ZpcmU/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXIoKSB7XG5cdFx0XHRcdGRvRmlyZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKCFkaXNwb3NhYmxlKSB7XG5cdFx0XHRfYWRkTGVha2FnZVRyYWNlTG9naWMob3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPE8+KG9wdGlvbnMpO1xuXG5cdFx0ZGlzcG9zYWJsZT8uYWRkKGVtaXR0ZXIpO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVib3VuY2VzIGFuIGV2ZW50LCBmaXJpbmcgYWZ0ZXIgc29tZSBkZWxheSAoZGVmYXVsdD0wKSB3aXRoIGFuIGFycmF5IG9mIGFsbCBldmVudCBvcmlnaW5hbCBvYmplY3RzLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBkZWxheSBUaGUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byBkZWJvdW5jZS5cblx0ICogQHBhcmFtIGZsdXNoT25MaXN0ZW5lclJlbW92ZSBXaGV0aGVyIHRvIGZpcmUgYWxsIGRlYm91bmNlZCBldmVudHMgd2hlbiBhIGxpc3RlbmVyIGlzIHJlbW92ZWQuIElmIHRoaXMgaXMgbm90XG5cdCAqIHNwZWNpZmllZCwgc29tZSBldmVudHMgY291bGQgZ28gbWlzc2luZy4gVXNlIHRoaXMgaWYgaXQncyBpbXBvcnRhbnQgdGhhdCBhbGwgZXZlbnRzIGFyZSBwcm9jZXNzZWQsIGV2ZW4gaWYgdGhlXG5cdCAqIGxpc3RlbmVyIGdldHMgZGlzcG9zZWQgYmVmb3JlIHRoZSBkZWJvdW5jZWQgZXZlbnQgZmlyZXMuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gYWNjdW11bGF0ZTxUPihldmVudDogRXZlbnQ8VD4sIGRlbGF5OiBudW1iZXIgfCB0eXBlb2YgTWljcm90YXNrRGVsYXkgPSAwLCBmbHVzaE9uTGlzdGVuZXJSZW1vdmU/OiBib29sZWFuLCBkaXNwb3NhYmxlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8VFtdPiB7XG5cdFx0cmV0dXJuIEV2ZW50LmRlYm91bmNlPFQsIFRbXT4oZXZlbnQsIChsYXN0LCBlKSA9PiB7XG5cdFx0XHRpZiAoIWxhc3QpIHtcblx0XHRcdFx0cmV0dXJuIFtlXTtcblx0XHRcdH1cblx0XHRcdGxhc3QucHVzaChlKTtcblx0XHRcdHJldHVybiBsYXN0O1xuXHRcdH0sIGRlbGF5LCB1bmRlZmluZWQsIGZsdXNoT25MaXN0ZW5lclJlbW92ZSA/PyB0cnVlLCB1bmRlZmluZWQsIGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRocm90dGxlcyBhbiBldmVudCwgZW5zdXJpbmcgdGhlIGV2ZW50IGlzIGZpcmVkIGF0IG1vc3Qgb25jZSBkdXJpbmcgdGhlIHNwZWNpZmllZCBkZWxheSBwZXJpb2QuXG5cdCAqIFVubGlrZSBkZWJvdW5jZSwgdGhyb3R0bGUgd2lsbCBmaXJlIGltbWVkaWF0ZWx5IG9uIHRoZSBsZWFkaW5nIGVkZ2UgYW5kL29yIGFmdGVyIHRoZSBkZWxheSBvbiB0aGUgdHJhaWxpbmcgZWRnZS5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gbWVyZ2UgQW4gYWNjdW11bGF0b3IgZnVuY3Rpb24gdGhhdCBtZXJnZXMgZXZlbnRzIGlmIG11bHRpcGxlIG9jY3VyIGR1cmluZyB0aGUgdGhyb3R0bGUgcGVyaW9kLlxuXHQgKiBAcGFyYW0gZGVsYXkgVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gdGhyb3R0bGUuXG5cdCAqIEBwYXJhbSBsZWFkaW5nIFdoZXRoZXIgdG8gZmlyZSBvbiB0aGUgbGVhZGluZyBlZGdlIChpbW1lZGlhdGVseSBvbiBmaXJzdCBldmVudCkuXG5cdCAqIEBwYXJhbSB0cmFpbGluZyBXaGV0aGVyIHRvIGZpcmUgb24gdGhlIHRyYWlsaW5nIGVkZ2UgKGFmdGVyIGRlbGF5IHdpdGggdGhlIGxhc3QgdmFsdWUpLlxuXHQgKiBAcGFyYW0gbGVha1dhcm5pbmdUaHJlc2hvbGQgU2VlIHtAbGluayBFbWl0dGVyT3B0aW9ucy5sZWFrV2FybmluZ1RocmVzaG9sZH0uXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byByZWdpc3RlciB0aGUgdGhyb3R0bGUgZW1pdHRlciB0by5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZTxUPihldmVudDogRXZlbnQ8VD4sIG1lcmdlOiAobGFzdDogVCB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IFQsIGRlbGF5PzogbnVtYmVyIHwgdHlwZW9mIE1pY3JvdGFza0RlbGF5LCBsZWFkaW5nPzogYm9vbGVhbiwgdHJhaWxpbmc/OiBib29sZWFuLCBsZWFrV2FybmluZ1RocmVzaG9sZD86IG51bWJlciwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+O1xuXHRleHBvcnQgZnVuY3Rpb24gdGhyb3R0bGU8SSwgTz4oZXZlbnQ6IEV2ZW50PEk+LCBtZXJnZTogKGxhc3Q6IE8gfCB1bmRlZmluZWQsIGV2ZW50OiBJKSA9PiBPLCBkZWxheT86IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSwgbGVhZGluZz86IGJvb2xlYW4sIHRyYWlsaW5nPzogYm9vbGVhbiwgbGVha1dhcm5pbmdUaHJlc2hvbGQ/OiBudW1iZXIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxPPjtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRocm90dGxlPEksIE8+KGV2ZW50OiBFdmVudDxJPiwgbWVyZ2U6IChsYXN0OiBPIHwgdW5kZWZpbmVkLCBldmVudDogSSkgPT4gTywgZGVsYXk6IG51bWJlciB8IHR5cGVvZiBNaWNyb3Rhc2tEZWxheSA9IDEwMCwgbGVhZGluZyA9IHRydWUsIHRyYWlsaW5nID0gdHJ1ZSwgbGVha1dhcm5pbmdUaHJlc2hvbGQ/OiBudW1iZXIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxPPiB7XG5cdFx0bGV0IHN1YnNjcmlwdGlvbjogSURpc3Bvc2FibGU7XG5cdFx0bGV0IG91dHB1dDogTyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaGFuZGxlOiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBudW1UaHJvdHRsZWRDYWxscyA9IDA7XG5cblx0XHRjb25zdCBvcHRpb25zOiBFbWl0dGVyT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHtcblx0XHRcdGxlYWtXYXJuaW5nVGhyZXNob2xkLFxuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0c3Vic2NyaXB0aW9uID0gZXZlbnQoY3VyID0+IHtcblx0XHRcdFx0XHRudW1UaHJvdHRsZWRDYWxscysrO1xuXHRcdFx0XHRcdG91dHB1dCA9IG1lcmdlKG91dHB1dCwgY3VyKTtcblxuXHRcdFx0XHRcdC8vIElmIG5vdCBjdXJyZW50bHkgdGhyb3R0bGluZywgZmlyZSBpbW1lZGlhdGVseSBpZiBsZWFkaW5nIGlzIGVuYWJsZWRcblx0XHRcdFx0XHRpZiAoaGFuZGxlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGlmIChsZWFkaW5nKSB7XG5cdFx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShvdXRwdXQpO1xuXHRcdFx0XHRcdFx0XHRvdXRwdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdG51bVRocm90dGxlZENhbGxzID0gMDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gU2V0IHVwIHRoZSB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZGVsYXkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEZpcmUgb24gdHJhaWxpbmcgZWRnZSBpZiB0aGVyZSB3ZXJlIGNhbGxzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdFx0XHRpZiAodHJhaWxpbmcgJiYgbnVtVGhyb3R0bGVkQ2FsbHMgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlbWl0dGVyLmZpcmUob3V0cHV0ISk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdG91dHB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0bnVtVGhyb3R0bGVkQ2FsbHMgPSAwO1xuXHRcdFx0XHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBVc2UgYSBzcGVjaWFsIG1hcmtlciB0byBpbmRpY2F0ZSBtaWNyb3Rhc2sgaXMgcGVuZGluZ1xuXHRcdFx0XHRcdFx0XHRoYW5kbGUgPSAwIGFzIHVua25vd24gYXMgVGltZW91dDtcblx0XHRcdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEZpcmUgb24gdHJhaWxpbmcgZWRnZSBpZiB0aGVyZSB3ZXJlIGNhbGxzIGR1cmluZyB0aHJvdHRsZSBwZXJpb2Rcblx0XHRcdFx0XHRcdFx0XHRpZiAodHJhaWxpbmcgJiYgbnVtVGhyb3R0bGVkQ2FsbHMgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRlbWl0dGVyLmZpcmUob3V0cHV0ISk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdG91dHB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0bnVtVGhyb3R0bGVkQ2FsbHMgPSAwO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gSWYgYWxyZWFkeSB0aHJvdHRsaW5nLCBqdXN0IGFjY3VtdWxhdGUgdGhlIHZhbHVlIGZvciB0cmFpbGluZyBlZGdlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoIWRpc3Bvc2FibGUpIHtcblx0XHRcdF9hZGRMZWFrYWdlVHJhY2VMb2dpYyhvcHRpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8Tz4ob3B0aW9ucyk7XG5cblx0XHRkaXNwb3NhYmxlPy5hZGQoZW1pdHRlcik7XG5cblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaWx0ZXJzIGFuIGV2ZW50IHN1Y2ggdGhhdCBzb21lIGNvbmRpdGlvbiBpcyBfbm90XyBtZXQgbW9yZSB0aGFuIG9uY2UgaW4gYSByb3csIGVmZmVjdGl2ZWx5IGVuc3VyaW5nIGR1cGxpY2F0ZVxuXHQgKiBldmVudCBvYmplY3RzIGZyb20gZGlmZmVyZW50IHNvdXJjZXMgZG8gbm90IGZpcmUgdGhlIHNhbWUgZXZlbnQgb2JqZWN0LlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQHBhcmFtIGV2ZW50IFRoZSBldmVudCBzb3VyY2UgZm9yIHRoZSBuZXcgZXZlbnQuXG5cdCAqIEBwYXJhbSBlcXVhbHMgVGhlIGVxdWFsaXR5IGNvbmRpdGlvbi5cblx0ICogQHBhcmFtIGRpc3Bvc2FibGUgQSBkaXNwb3NhYmxlIHN0b3JlIHRvIGFkZCB0aGUgbmV3IEV2ZW50RW1pdHRlciB0by5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIC8vIEZpcmUgb25seSBvbmUgdGltZSB3aGVuIGEgc2luZ2xlIHdpbmRvdyBpcyBvcGVuZWQgb3IgZm9jdXNlZFxuXHQgKiBFdmVudC5sYXRjaChFdmVudC5hbnkob25EaWRPcGVuV2luZG93LCBvbkRpZEZvY3VzV2luZG93KSlcblx0ICogYGBgXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gbGF0Y2g8VD4oZXZlbnQ6IEV2ZW50PFQ+LCBlcXVhbHM6IChhOiBULCBiOiBUKSA9PiBib29sZWFuID0gKGEsIGIpID0+IGEgPT09IGIsIGRpc3Bvc2FibGU/OiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxUPiB7XG5cdFx0bGV0IGZpcnN0Q2FsbCA9IHRydWU7XG5cdFx0bGV0IGNhY2hlOiBUO1xuXG5cdFx0cmV0dXJuIGZpbHRlcihldmVudCwgdmFsdWUgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvdWxkRW1pdCA9IGZpcnN0Q2FsbCB8fCAhZXF1YWxzKHZhbHVlLCBjYWNoZSk7XG5cdFx0XHRmaXJzdENhbGwgPSBmYWxzZTtcblx0XHRcdGNhY2hlID0gdmFsdWU7XG5cdFx0XHRyZXR1cm4gc2hvdWxkRW1pdDtcblx0XHR9LCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTcGxpdHMgYW4gZXZlbnQgd2hvc2UgcGFyYW1ldGVyIGlzIGEgdW5pb24gdHlwZSBpbnRvIDIgc2VwYXJhdGUgZXZlbnRzIGZvciBlYWNoIHR5cGUgaW4gdGhlIHVuaW9uLlxuXHQgKlxuXHQgKiAqTk9URSogdGhhdCB0aGlzIGZ1bmN0aW9uIHJldHVybnMgYW4gYEV2ZW50YCBhbmQgaXQgTVVTVCBiZSBjYWxsZWQgd2l0aCBhIGBEaXNwb3NhYmxlU3RvcmVgIHdoZW5ldmVyIHRoZSByZXR1cm5lZFxuXHQgKiBldmVudCBpcyBhY2Nlc3NpYmxlIHRvIFwidGhpcmQgcGFydGllc1wiLCBlLmcgdGhlIGV2ZW50IGlzIGEgcHVibGljIHByb3BlcnR5LiBPdGhlcndpc2UgYSBsZWFrZWQgbGlzdGVuZXIgb24gdGhlXG5cdCAqIHJldHVybmVkIGV2ZW50IGNhdXNlcyB0aGlzIHV0aWxpdHkgdG8gbGVhayBhIGxpc3RlbmVyIG9uIHRoZSBvcmlnaW5hbCBldmVudC5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50RW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCkuZXZlbnQ7XG5cdCAqIGNvbnN0IFtudW1iZXJFdmVudCwgdW5kZWZpbmVkRXZlbnRdID0gRXZlbnQuc3BsaXQoZXZlbnQsIGlzVW5kZWZpbmVkKTtcblx0ICogYGBgXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gaXNUIEEgZnVuY3Rpb24gdGhhdCBkZXRlcm1pbmVzIHdoYXQgZXZlbnQgaXMgb2YgdGhlIGZpcnN0IHR5cGUuXG5cdCAqIEBwYXJhbSBkaXNwb3NhYmxlIEEgZGlzcG9zYWJsZSBzdG9yZSB0byBhZGQgdGhlIG5ldyBFdmVudEVtaXR0ZXIgdG8uXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gc3BsaXQ8VCwgVT4oZXZlbnQ6IEV2ZW50PFQgfCBVPiwgaXNUOiAoZTogVCB8IFUpID0+IGUgaXMgVCwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IFtFdmVudDxUPiwgRXZlbnQ8VT5dIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0RXZlbnQuZmlsdGVyKGV2ZW50LCBpc1QsIGRpc3Bvc2FibGUpLFxuXHRcdFx0RXZlbnQuZmlsdGVyKGV2ZW50LCBlID0+ICFpc1QoZSksIGRpc3Bvc2FibGUpIGFzIEV2ZW50PFU+LFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogQnVmZmVycyBhbiBldmVudCB1bnRpbCBpdCBoYXMgYSBsaXN0ZW5lciBhdHRhY2hlZC5cblx0ICpcblx0ICogKk5PVEUqIHRoYXQgdGhpcyBmdW5jdGlvbiByZXR1cm5zIGFuIGBFdmVudGAgYW5kIGl0IE1VU1QgYmUgY2FsbGVkIHdpdGggYSBgRGlzcG9zYWJsZVN0b3JlYCB3aGVuZXZlciB0aGUgcmV0dXJuZWRcblx0ICogZXZlbnQgaXMgYWNjZXNzaWJsZSB0byBcInRoaXJkIHBhcnRpZXNcIiwgZS5nIHRoZSBldmVudCBpcyBhIHB1YmxpYyBwcm9wZXJ0eS4gT3RoZXJ3aXNlIGEgbGVha2VkIGxpc3RlbmVyIG9uIHRoZVxuXHQgKiByZXR1cm5lZCBldmVudCBjYXVzZXMgdGhpcyB1dGlsaXR5IHRvIGxlYWsgYSBsaXN0ZW5lciBvbiB0aGUgb3JpZ2luYWwgZXZlbnQuXG5cdCAqXG5cdCAqIEBwYXJhbSBldmVudCBUaGUgZXZlbnQgc291cmNlIGZvciB0aGUgbmV3IGV2ZW50LlxuXHQgKiBAcGFyYW0gZGVidWdOYW1lIEEgbmFtZSBmb3IgdGhpcyBidWZmZXIsIHVzZWQgaW4gbGVhayBkZXRlY3Rpb24gd2FybmluZ3MuXG5cdCAqIEBwYXJhbSBmbHVzaEFmdGVyVGltZW91dCBEZXRlcm1pbmVzIHdoZXRoZXIgdG8gZmx1c2ggdGhlIGJ1ZmZlciBhZnRlciBhIHRpbWVvdXQgaW1tZWRpYXRlbHkgb3IgYWZ0ZXIgYVxuXHQgKiBgc2V0VGltZW91dGAgd2hlbiB0aGUgZmlyc3QgZXZlbnQgbGlzdGVuZXIgaXMgYWRkZWQuXG5cdCAqIEBwYXJhbSBfYnVmZmVyIEludGVybmFsOiBBIHNvdXJjZSBldmVudCBhcnJheSB1c2VkIGZvciB0ZXN0cy5cblx0ICpcblx0ICogQGV4YW1wbGVcblx0ICogYGBgXG5cdCAqIC8vIFN0YXJ0IGFjY3VtdWxhdGluZyBldmVudHMsIHdoZW4gdGhlIGZpcnN0IGxpc3RlbmVyIGlzIGF0dGFjaGVkLCBmbHVzaFxuXHQgKiAvLyB0aGUgZXZlbnQgYWZ0ZXIgYSB0aW1lb3V0IHN1Y2ggdGhhdCBtdWx0aXBsZSBsaXN0ZW5lcnMgYXR0YWNoZWQgYmVmb3JlXG5cdCAqIC8vIHRoZSB0aW1lb3V0IHdvdWxkIHJlY2VpdmUgdGhlIGV2ZW50XG5cdCAqIHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uID0gRXZlbnQuYnVmZmVyKHNlcnZpY2Uub25JbnN0YWxsRXh0ZW5zaW9uLCAnb25JbnN0YWxsRXh0ZW5zaW9uJywgdHJ1ZSk7XG5cdCAqIGBgYFxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGJ1ZmZlcjxUPihldmVudDogRXZlbnQ8VD4sIGRlYnVnTmFtZTogc3RyaW5nLCBmbHVzaEFmdGVyVGltZW91dCA9IGZhbHNlLCBfYnVmZmVyOiBUW10gPSBbXSwgZGlzcG9zYWJsZT86IERpc3Bvc2FibGVTdG9yZSk6IEV2ZW50PFQ+IHtcblx0XHRsZXQgYnVmZmVyOiBUW10gfCBudWxsID0gX2J1ZmZlci5zbGljZSgpO1xuXG5cdFx0Ly8gRGV2LW9ubHkgbGVhayBkZXRlY3Rpb246IHRyYWNrIHdoZW4gYnVmZmVyIHdhcyBjcmVhdGVkIGFuZCB3YXJuXG5cdFx0Ly8gaWYgZXZlbnRzIGFjY3VtdWxhdGUgd2l0aG91dCBldmVyIGJlaW5nIGNvbnN1bWVkLlxuXHRcdGxldCBidWZmZXJMZWFrV2FybmluZ0RhdGE6IHsgc3RhY2s6IFN0YWNrdHJhY2U7IHRpbWVySWQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+OyB3YXJuZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoX2lzQnVmZmVyTGVha1dhcm5pbmdFbmFibGVkKCkpIHtcblx0XHRcdGJ1ZmZlckxlYWtXYXJuaW5nRGF0YSA9IHtcblx0XHRcdFx0c3RhY2s6IFN0YWNrdHJhY2UuY3JlYXRlKCksXG5cdFx0XHRcdHRpbWVySWQ6IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChidWZmZXIgJiYgYnVmZmVyLmxlbmd0aCA+IDAgJiYgYnVmZmVyTGVha1dhcm5pbmdEYXRhICYmICFidWZmZXJMZWFrV2FybmluZ0RhdGEud2FybmVkKSB7XG5cdFx0XHRcdFx0XHRidWZmZXJMZWFrV2FybmluZ0RhdGEud2FybmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgW0V2ZW50LmJ1ZmZlcl1bJHtkZWJ1Z05hbWV9XSBwb3RlbnRpYWwgTEVBSyBkZXRlY3RlZDogJHtidWZmZXIubGVuZ3RofSBldmVudHMgYnVmZmVyZWQgZm9yICR7X2J1ZmZlckxlYWtXYXJuVGltZVRocmVzaG9sZCAvIDEwMDB9cyB3aXRob3V0IGJlaW5nIGNvbnN1bWVkLiBCdWZmZXJlZCBoZXJlOmApO1xuXHRcdFx0XHRcdFx0YnVmZmVyTGVha1dhcm5pbmdEYXRhLnN0YWNrLnByaW50KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBfYnVmZmVyTGVha1dhcm5UaW1lVGhyZXNob2xkKSxcblx0XHRcdFx0d2FybmVkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQoYnVmZmVyTGVha1dhcm5pbmdEYXRhIS50aW1lcklkKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNsZWFyTGVha1dhcm5pbmdUaW1lciA9ICgpID0+IHtcblx0XHRcdGlmIChidWZmZXJMZWFrV2FybmluZ0RhdGEpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KGJ1ZmZlckxlYWtXYXJuaW5nRGF0YS50aW1lcklkKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGwgPSBldmVudChlID0+IHtcblx0XHRcdGlmIChidWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyLnB1c2goZSk7XG5cdFx0XHRcdGlmIChfaXNCdWZmZXJMZWFrV2FybmluZ0VuYWJsZWQoKSAmJiBidWZmZXJMZWFrV2FybmluZ0RhdGEgJiYgIWJ1ZmZlckxlYWtXYXJuaW5nRGF0YS53YXJuZWQgJiYgYnVmZmVyLmxlbmd0aCA+PSBfYnVmZmVyTGVha1dhcm5Db3VudFRocmVzaG9sZCkge1xuXHRcdFx0XHRcdGJ1ZmZlckxlYWtXYXJuaW5nRGF0YS53YXJuZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgW0V2ZW50LmJ1ZmZlcl1bJHtkZWJ1Z05hbWV9XSBwb3RlbnRpYWwgTEVBSyBkZXRlY3RlZDogJHtidWZmZXIubGVuZ3RofSBldmVudHMgYnVmZmVyZWQgd2l0aG91dCBiZWluZyBjb25zdW1lZC4gQnVmZmVyZWQgaGVyZTpgKTtcblx0XHRcdFx0XHRidWZmZXJMZWFrV2FybmluZ0RhdGEuc3RhY2sucHJpbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW1pdHRlci5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGxpc3RlbmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBmbHVzaCA9ICgpID0+IHtcblx0XHRcdGJ1ZmZlcj8uZm9yRWFjaChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdFx0XHRidWZmZXIgPSBudWxsO1xuXHRcdFx0Y2xlYXJMZWFrV2FybmluZ1RpbWVyKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPih7XG5cdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyKCkge1xuXHRcdFx0XHRpZiAoIWxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIgPSBldmVudChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuYWRkKGxpc3RlbmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGJ1ZmZlcikge1xuXHRcdFx0XHRcdGlmIChmbHVzaEFmdGVyVGltZW91dCkge1xuXHRcdFx0XHRcdFx0c2V0VGltZW91dChmbHVzaCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZsdXNoKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcigpIHtcblx0XHRcdFx0aWYgKGxpc3RlbmVyKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxpc3RlbmVyID0gbnVsbDtcblx0XHRcdFx0Y2xlYXJMZWFrV2FybmluZ1RpbWVyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoZW1pdHRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblx0LyoqXG5cdCAqIFdyYXBzIHRoZSBldmVudCBpbiBhbiB7QGxpbmsgSUNoYWluYWJsZUV2ZW50fSwgYWxsb3dpbmcgYSBtb3JlIGZ1bmN0aW9uYWwgcHJvZ3JhbW1pbmcgc3R5bGUuXG5cdCAqXG5cdCAqIEBleGFtcGxlXG5cdCAqIGBgYFxuXHQgKiAvLyBOb3JtYWxcblx0ICogY29uc3Qgb25FbnRlclByZXNzTm9ybWFsID0gRXZlbnQuZmlsdGVyKFxuXHQgKiAgIEV2ZW50Lm1hcChvbktleVByZXNzLmV2ZW50LCBlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpLFxuXHQgKiAgIGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlclxuXHQgKiApLmV2ZW50O1xuXHQgKlxuXHQgKiAvLyBVc2luZyBjaGFpblxuXHQgKiBjb25zdCBvbkVudGVyUHJlc3NDaGFpbiA9IEV2ZW50LmNoYWluKG9uS2V5UHJlc3MuZXZlbnQsICQgPT4gJFxuXHQgKiAgIC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKVxuXHQgKiAgIC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpXG5cdCAqICk7XG5cdCAqIGBgYFxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGNoYWluPFQsIFI+KGV2ZW50OiBFdmVudDxUPiwgc3l0aGVuc2l6ZTogKCQ6IElDaGFpbmFibGVTeXRoZW5zaXM8VD4pID0+IElDaGFpbmFibGVTeXRoZW5zaXM8Uj4pOiBFdmVudDxSPiB7XG5cdFx0Y29uc3QgZm46IEV2ZW50PFI+ID0gKGxpc3RlbmVyLCB0aGlzQXJncywgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdGNvbnN0IGNzID0gc3l0aGVuc2l6ZShuZXcgQ2hhaW5hYmxlU3ludGhlc2lzKCkpIGFzIENoYWluYWJsZVN5bnRoZXNpcztcblx0XHRcdHJldHVybiBldmVudChmdW5jdGlvbiAodmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gY3MuZXZhbHVhdGUodmFsdWUpO1xuXHRcdFx0XHRpZiAocmVzdWx0ICE9PSBIYWx0Q2hhaW5hYmxlKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuY2FsbCh0aGlzQXJncywgcmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblxuXHRcdHJldHVybiBmbjtcblx0fVxuXG5cdGNvbnN0IEhhbHRDaGFpbmFibGUgPSBTeW1ib2woJ0hhbHRDaGFpbmFibGUnKTtcblxuXHRjbGFzcyBDaGFpbmFibGVTeW50aGVzaXMgaW1wbGVtZW50cyBJQ2hhaW5hYmxlU3l0aGVuc2lzPGFueT4ge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RlcHM6ICgoaW5wdXQ6IGFueSkgPT4gdW5rbm93bilbXSA9IFtdO1xuXG5cdFx0bWFwPE8+KGZuOiAoaTogYW55KSA9PiBPKTogdGhpcyB7XG5cdFx0XHR0aGlzLnN0ZXBzLnB1c2goZm4pO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0Zm9yRWFjaChmbjogKGk6IGFueSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4ge1xuXHRcdFx0XHRmbih2KTtcblx0XHRcdFx0cmV0dXJuIHY7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGZpbHRlcihmbjogKGU6IGFueSkgPT4gYm9vbGVhbik6IHRoaXMge1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4gZm4odikgPyB2IDogSGFsdENoYWluYWJsZSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRyZWR1Y2U8Uj4obWVyZ2U6IChsYXN0OiBSIHwgdW5kZWZpbmVkLCBldmVudDogYW55KSA9PiBSLCBpbml0aWFsPzogUiB8IHVuZGVmaW5lZCk6IHRoaXMge1xuXHRcdFx0bGV0IGxhc3QgPSBpbml0aWFsO1xuXHRcdFx0dGhpcy5zdGVwcy5wdXNoKHYgPT4ge1xuXHRcdFx0XHRsYXN0ID0gbWVyZ2UobGFzdCwgdik7XG5cdFx0XHRcdHJldHVybiBsYXN0O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRsYXRjaChlcXVhbHM6IChhOiBhbnksIGI6IGFueSkgPT4gYm9vbGVhbiA9IChhLCBiKSA9PiBhID09PSBiKTogQ2hhaW5hYmxlU3ludGhlc2lzIHtcblx0XHRcdGxldCBmaXJzdENhbGwgPSB0cnVlO1xuXHRcdFx0bGV0IGNhY2hlOiBhbnk7XG5cdFx0XHR0aGlzLnN0ZXBzLnB1c2godmFsdWUgPT4ge1xuXHRcdFx0XHRjb25zdCBzaG91bGRFbWl0ID0gZmlyc3RDYWxsIHx8ICFlcXVhbHModmFsdWUsIGNhY2hlKTtcblx0XHRcdFx0Zmlyc3RDYWxsID0gZmFsc2U7XG5cdFx0XHRcdGNhY2hlID0gdmFsdWU7XG5cdFx0XHRcdHJldHVybiBzaG91bGRFbWl0ID8gdmFsdWUgOiBIYWx0Q2hhaW5hYmxlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBldmFsdWF0ZSh2YWx1ZTogYW55KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHN0ZXAgb2YgdGhpcy5zdGVwcykge1xuXHRcdFx0XHR2YWx1ZSA9IHN0ZXAodmFsdWUpO1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IEhhbHRDaGFpbmFibGUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJQ2hhaW5hYmxlU3l0aGVuc2lzPFQ+IHtcblx0XHRtYXA8Tz4oZm46IChpOiBUKSA9PiBPKTogSUNoYWluYWJsZVN5dGhlbnNpczxPPjtcblx0XHRmb3JFYWNoKGZuOiAoaTogVCkgPT4gdm9pZCk6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdFx0ZmlsdGVyPFIgZXh0ZW5kcyBUPihmbjogKGU6IFQpID0+IGUgaXMgUik6IElDaGFpbmFibGVTeXRoZW5zaXM8Uj47XG5cdFx0ZmlsdGVyKGZuOiAoZTogVCkgPT4gYm9vbGVhbik6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdFx0cmVkdWNlPFI+KG1lcmdlOiAobGFzdDogUiwgZXZlbnQ6IFQpID0+IFIsIGluaXRpYWw6IFIpOiBJQ2hhaW5hYmxlU3l0aGVuc2lzPFI+O1xuXHRcdHJlZHVjZTxSPihtZXJnZTogKGxhc3Q6IFIgfCB1bmRlZmluZWQsIGV2ZW50OiBUKSA9PiBSKTogSUNoYWluYWJsZVN5dGhlbnNpczxSPjtcblx0XHRsYXRjaChlcXVhbHM/OiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbik6IElDaGFpbmFibGVTeXRoZW5zaXM8VD47XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIE5vZGVFdmVudEVtaXR0ZXIge1xuXHRcdG9uKGV2ZW50OiBzdHJpbmcgfCBzeW1ib2wsIGxpc3RlbmVyOiBGdW5jdGlvbik6IHVua25vd247XG5cdFx0cmVtb3ZlTGlzdGVuZXIoZXZlbnQ6IHN0cmluZyB8IHN5bWJvbCwgbGlzdGVuZXI6IEZ1bmN0aW9uKTogdW5rbm93bjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIHtAbGluayBFdmVudH0gZnJvbSBhIG5vZGUgZXZlbnQgZW1pdHRlci5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tTm9kZUV2ZW50RW1pdHRlcjxUPihlbWl0dGVyOiBOb2RlRXZlbnRFbWl0dGVyLCBldmVudE5hbWU6IHN0cmluZywgbWFwOiAoLi4uYXJnczogYW55W10pID0+IFQgPSBpZCA9PiBpZCk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCBmbiA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHJlc3VsdC5maXJlKG1hcCguLi5hcmdzKSk7XG5cdFx0Y29uc3Qgb25GaXJzdExpc3RlbmVyQWRkID0gKCkgPT4gZW1pdHRlci5vbihldmVudE5hbWUsIGZuKTtcblx0XHRjb25zdCBvbkxhc3RMaXN0ZW5lclJlbW92ZSA9ICgpID0+IGVtaXR0ZXIucmVtb3ZlTGlzdGVuZXIoZXZlbnROYW1lLCBmbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEVtaXR0ZXI8VD4oeyBvbldpbGxBZGRGaXJzdExpc3RlbmVyOiBvbkZpcnN0TGlzdGVuZXJBZGQsIG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiBvbkxhc3RMaXN0ZW5lclJlbW92ZSB9KTtcblxuXHRcdHJldHVybiByZXN1bHQuZXZlbnQ7XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIERPTUV2ZW50RW1pdHRlciB7XG5cdFx0YWRkRXZlbnRMaXN0ZW5lcihldmVudDogc3RyaW5nIHwgc3ltYm9sLCBsaXN0ZW5lcjogRnVuY3Rpb24pOiB2b2lkO1xuXHRcdHJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQ6IHN0cmluZyB8IHN5bWJvbCwgbGlzdGVuZXI6IEZ1bmN0aW9uKTogdm9pZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGFuIHtAbGluayBFdmVudH0gZnJvbSBhIERPTSBldmVudCBlbWl0dGVyLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21ET01FdmVudEVtaXR0ZXI8VD4oZW1pdHRlcjogRE9NRXZlbnRFbWl0dGVyLCBldmVudE5hbWU6IHN0cmluZywgbWFwOiAoLi4uYXJnczogYW55W10pID0+IFQgPSBpZCA9PiBpZCk6IEV2ZW50PFQ+IHtcblx0XHRjb25zdCBmbiA9ICguLi5hcmdzOiB1bmtub3duW10pID0+IHJlc3VsdC5maXJlKG1hcCguLi5hcmdzKSk7XG5cdFx0Y29uc3Qgb25GaXJzdExpc3RlbmVyQWRkID0gKCkgPT4gZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZm4pO1xuXHRcdGNvbnN0IG9uTGFzdExpc3RlbmVyUmVtb3ZlID0gKCkgPT4gZW1pdHRlci5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgZm4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBFbWl0dGVyPFQ+KHsgb25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogb25GaXJzdExpc3RlbmVyQWRkLCBvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogb25MYXN0TGlzdGVuZXJSZW1vdmUgfSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0LmV2ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBwcm9taXNlIG91dCBvZiBhbiBldmVudCwgdXNpbmcgdGhlIHtAbGluayBFdmVudC5vbmNlfSBoZWxwZXIuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gdG9Qcm9taXNlPFQ+KGV2ZW50OiBFdmVudDxUPiwgZGlzcG9zYWJsZXM/OiBJRGlzcG9zYWJsZVtdIHwgRGlzcG9zYWJsZVN0b3JlKTogQ2FuY2VsYWJsZVByb21pc2U8VD4ge1xuXHRcdGxldCBjYW5jZWxSZWY6ICgpID0+IHZvaWQ7XG5cdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0XHRjb25zdCBwcm9taXNlID0gbmV3IFByb21pc2UoKHJlc29sdmUpID0+IHtcblx0XHRcdGxpc3RlbmVyID0gb25jZShldmVudCkocmVzb2x2ZSk7XG5cdFx0XHRhZGRUb0Rpc3Bvc2FibGVzKGxpc3RlbmVyLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRcdC8vIG5vdCByZXNvbHZlZCwgbWF0Y2hpbmcgdGhlIGJlaGF2aW9yIG9mIGEgbm9ybWFsIGRpc3Bvc2FsXG5cdFx0XHRjYW5jZWxSZWYgPSAoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2VBbmRSZW1vdmUobGlzdGVuZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdH07XG5cdFx0fSkgYXMgQ2FuY2VsYWJsZVByb21pc2U8VD47XG5cdFx0cHJvbWlzZS5jYW5jZWwgPSBjYW5jZWxSZWYhO1xuXG5cdFx0aWYgKGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRwcm9taXNlLmZpbmFsbHkoKCkgPT4gZGlzcG9zZUFuZFJlbW92ZShsaXN0ZW5lciwgZGlzcG9zYWJsZXMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGNvbnZlbmllbmNlIGZ1bmN0aW9uIGZvciBmb3J3YXJkaW5nIGFuIGV2ZW50IHRvIGFub3RoZXIgZW1pdHRlciB3aGljaFxuXHQgKiBpbXByb3ZlcyByZWFkYWJpbGl0eS5cblx0ICpcblx0ICogVGhpcyBpcyBzaW1pbGFyIHRvIHtAbGluayBSZWxheX0gYnV0IGFsbG93cyBpbnN0YW50aWF0aW5nIGFuZCBmb3J3YXJkaW5nXG5cdCAqIG9uIGEgc2luZ2xlIGxpbmUgYW5kIGFsc28gYWxsb3dzIGZvciBtdWx0aXBsZSBzb3VyY2UgZXZlbnRzLlxuXHQgKiBAcGFyYW0gZnJvbSBUaGUgZXZlbnQgdG8gZm9yd2FyZC5cblx0ICogQHBhcmFtIHRvIFRoZSBlbWl0dGVyIHRvIGZvcndhcmQgdGhlIGV2ZW50IHRvLlxuXHQgKiBAZXhhbXBsZVxuXHQgKiBFdmVudC5mb3J3YXJkKGV2ZW50LCBlbWl0dGVyKTtcblx0ICogLy8gZXF1aXZhbGVudCB0b1xuXHQgKiBldmVudChlID0+IGVtaXR0ZXIuZmlyZShlKSk7XG5cdCAqIC8vIGVxdWl2YWxlbnQgdG9cblx0ICogZXZlbnQoZW1pdHRlci5maXJlLCBlbWl0dGVyKTtcblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBmb3J3YXJkPFQ+KGZyb206IEV2ZW50PFQ+LCB0bzogRW1pdHRlcjxUPik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gZnJvbShlID0+IHRvLmZpcmUoZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYSBsaXN0ZW5lciB0byBhbiBldmVudCBhbmQgY2FsbHMgdGhlIGxpc3RlbmVyIGltbWVkaWF0ZWx5IHdpdGggdW5kZWZpbmVkIGFzIHRoZSBldmVudCBvYmplY3QuXG5cdCAqXG5cdCAqIEBleGFtcGxlXG5cdCAqIGBgYFxuXHQgKiAvLyBJbml0aWFsaXplIHRoZSBVSSBhbmQgdXBkYXRlIGl0IHdoZW4gZGF0YUNoYW5nZUV2ZW50IGZpcmVzXG5cdCAqIHJ1bkFuZFN1YnNjcmliZShkYXRhQ2hhbmdlRXZlbnQsICgpID0+IHRoaXMuX3VwZGF0ZVVJKCkpO1xuXHQgKiBgYGBcblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBydW5BbmRTdWJzY3JpYmU8VD4oZXZlbnQ6IEV2ZW50PFQ+LCBoYW5kbGVyOiAoZTogVCkgPT4gdW5rbm93biwgaW5pdGlhbDogVCk6IElEaXNwb3NhYmxlO1xuXHRleHBvcnQgZnVuY3Rpb24gcnVuQW5kU3Vic2NyaWJlPFQ+KGV2ZW50OiBFdmVudDxUPiwgaGFuZGxlcjogKGU6IFQgfCB1bmRlZmluZWQpID0+IHVua25vd24pOiBJRGlzcG9zYWJsZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIHJ1bkFuZFN1YnNjcmliZTxUPihldmVudDogRXZlbnQ8VD4sIGhhbmRsZXI6IChlOiBUIHwgdW5kZWZpbmVkKSA9PiB1bmtub3duLCBpbml0aWFsPzogVCk6IElEaXNwb3NhYmxlIHtcblx0XHRoYW5kbGVyKGluaXRpYWwpO1xuXHRcdHJldHVybiBldmVudChlID0+IGhhbmRsZXIoZSkpO1xuXHR9XG5cblx0Y2xhc3MgRW1pdHRlck9ic2VydmVyPFQ+IGltcGxlbWVudHMgSU9ic2VydmVyIHtcblxuXHRcdHJlYWRvbmx5IGVtaXR0ZXI6IEVtaXR0ZXI8VD47XG5cblx0XHRwcml2YXRlIF9jb3VudGVyID0gMDtcblx0XHRwcml2YXRlIF9oYXNDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRjb25zdHJ1Y3RvcihyZWFkb25seSBfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnM6IEVtaXR0ZXJPcHRpb25zID0ge1xuXHRcdFx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdFx0X29ic2VydmFibGUuYWRkT2JzZXJ2ZXIodGhpcyk7XG5cblx0XHRcdFx0XHQvLyBDb21tdW5pY2F0ZSB0byB0aGUgb2JzZXJ2YWJsZSB0aGF0IHdlIHJlY2VpdmVkIGl0cyBjdXJyZW50IHZhbHVlIGFuZCB3b3VsZCBsaWtlIHRvIGJlIG5vdGlmaWVkIGFib3V0IGZ1dHVyZSBjaGFuZ2VzLlxuXHRcdFx0XHRcdHRoaXMuX29ic2VydmFibGUucmVwb3J0Q2hhbmdlcygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRcdF9vYnNlcnZhYmxlLnJlbW92ZU9ic2VydmVyKHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0aWYgKCFzdG9yZSkge1xuXHRcdFx0XHRfYWRkTGVha2FnZVRyYWNlTG9naWMob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxUPihvcHRpb25zKTtcblx0XHRcdGlmIChzdG9yZSkge1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5lbWl0dGVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRiZWdpblVwZGF0ZTxUPihfb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHRcdC8vIGFzc2VydChfb2JzZXJ2YWJsZSA9PT0gdGhpcy5vYnMpO1xuXHRcdFx0dGhpcy5fY291bnRlcisrO1xuXHRcdH1cblxuXHRcdGhhbmRsZVBvc3NpYmxlQ2hhbmdlPFQ+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdFx0Ly8gYXNzZXJ0KF9vYnNlcnZhYmxlID09PSB0aGlzLm9icyk7XG5cdFx0fVxuXG5cdFx0aGFuZGxlQ2hhbmdlPFQsIFRDaGFuZ2U+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8VCwgVENoYW5nZT4sIF9jaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRcdC8vIGFzc2VydChfb2JzZXJ2YWJsZSA9PT0gdGhpcy5vYnMpO1xuXHRcdFx0dGhpcy5faGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0ZW5kVXBkYXRlPFQ+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdFx0Ly8gYXNzZXJ0KF9vYnNlcnZhYmxlID09PSB0aGlzLm9icyk7XG5cdFx0XHR0aGlzLl9jb3VudGVyLS07XG5cdFx0XHRpZiAodGhpcy5fY291bnRlciA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9vYnNlcnZhYmxlLnJlcG9ydENoYW5nZXMoKTtcblx0XHRcdFx0aWYgKHRoaXMuX2hhc0NoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9oYXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5lbWl0dGVyLmZpcmUodGhpcy5fb2JzZXJ2YWJsZS5nZXQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBldmVudCBlbWl0dGVyIHRoYXQgaXMgZmlyZWQgd2hlbiB0aGUgb2JzZXJ2YWJsZSBjaGFuZ2VzLlxuXHQgKiBFYWNoIGxpc3RlbmVycyBzdWJzY3JpYmVzIHRvIHRoZSBlbWl0dGVyLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21PYnNlcnZhYmxlPFQ+KG9iczogSU9ic2VydmFibGU8VD4sIHN0b3JlPzogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8VD4ge1xuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IEVtaXR0ZXJPYnNlcnZlcihvYnMsIHN0b3JlKTtcblx0XHRyZXR1cm4gb2JzZXJ2ZXIuZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFYWNoIGxpc3RlbmVyIGlzIGF0dGFjaGVkIHRvIHRoZSBvYnNlcnZhYmxlIGRpcmVjdGx5LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21PYnNlcnZhYmxlTGlnaHQob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8dW5rbm93bj4pOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIChsaXN0ZW5lciwgdGhpc0FyZ3MsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXI6IElPYnNlcnZlciA9IHtcblx0XHRcdFx0YmVnaW5VcGRhdGUoKSB7XG5cdFx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kVXBkYXRlKCkge1xuXHRcdFx0XHRcdGNvdW50LS07XG5cdFx0XHRcdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0XHRvYnNlcnZhYmxlLnJlcG9ydENoYW5nZXMoKTtcblx0XHRcdFx0XHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0ZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0aGFuZGxlUG9zc2libGVDaGFuZ2UoKSB7XG5cdFx0XHRcdFx0Ly8gbm9vcFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRoYW5kbGVDaGFuZ2UoKSB7XG5cdFx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdG9ic2VydmFibGUuYWRkT2JzZXJ2ZXIob2JzZXJ2ZXIpO1xuXHRcdFx0b2JzZXJ2YWJsZS5yZXBvcnRDaGFuZ2VzKCk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0ge1xuXHRcdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRcdG9ic2VydmFibGUucmVtb3ZlT2JzZXJ2ZXIob2JzZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRhZGRUb0Rpc3Bvc2FibGVzKGRpc3Bvc2FibGUsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEVtaXR0ZXJPcHRpb25zIHtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmJlZm9yZSogdGhlIHZlcnkgZmlyc3QgbGlzdGVuZXIgaXMgYWRkZWRcblx0ICovXG5cdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmFmdGVyKiB0aGUgdmVyeSBmaXJzdCBsaXN0ZW5lciBpcyBhZGRlZFxuXHQgKi9cblx0b25EaWRBZGRGaXJzdExpc3RlbmVyPzogRnVuY3Rpb247XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBmdW5jdGlvbiB0aGF0J3MgY2FsbGVkIGFmdGVyIGEgbGlzdGVuZXIgaXMgYWRkZWRcblx0ICovXG5cdG9uRGlkQWRkTGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmFmdGVyKiByZW1vdmUgdGhlIHZlcnkgbGFzdCBsaXN0ZW5lclxuXHQgKi9cblx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI/OiBGdW5jdGlvbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGZ1bmN0aW9uIHRoYXQncyBjYWxsZWQgKmJlZm9yZSogYSBsaXN0ZW5lciBpcyByZW1vdmVkXG5cdCAqL1xuXHRvbldpbGxSZW1vdmVMaXN0ZW5lcj86IEZ1bmN0aW9uO1xuXHQvKipcblx0ICogT3B0aW9uYWwgZnVuY3Rpb24gdGhhdCdzIGNhbGxlZCB3aGVuIGEgbGlzdGVuZXIgdGhyb3dzIGFuIGVycm9yLiBEZWZhdWx0cyB0b1xuXHQgKiB7QGxpbmsgb25VbmV4cGVjdGVkRXJyb3J9XG5cdCAqL1xuXHRvbkxpc3RlbmVyRXJyb3I/OiAoZTogYW55KSA9PiB2b2lkO1xuXHQvKipcblx0ICogTnVtYmVyIG9mIGxpc3RlbmVycyB0aGF0IGFyZSBhbGxvd2VkIGJlZm9yZSBhc3N1bWluZyBhIGxlYWsuIERlZmF1bHQgdG9cblx0ICogYSBnbG9iYWxseSBjb25maWd1cmVkIHZhbHVlXG5cdCAqXG5cdCAqIEBzZWUgc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGRcblx0ICovXG5cdGxlYWtXYXJuaW5nVGhyZXNob2xkPzogbnVtYmVyO1xuXHQvKipcblx0ICogSHVtYW4tcmVhZGFibGUgbmFtZSBmb3IgdGhlIGVtaXR0ZXIsIGluY2x1ZGVkIGluIGxlYWsgd2FybmluZyBlcnJvclxuXHQgKiBtZXNzYWdlcyB0byBoZWxwIGlkZW50aWZ5IHdoaWNoIGVtaXR0ZXIgaXMgbGVha2luZyBpbiB0ZWxlbWV0cnkuXG5cdCAqL1xuXHRsZWFrV2FybmluZ05hbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBQYXNzIGluIGEgZGVsaXZlcnkgcXVldWUsIHdoaWNoIGlzIHVzZWZ1bCBmb3IgZW5zdXJpbmdcblx0ICogaW4gb3JkZXIgZXZlbnQgZGVsaXZlcnkgYWNyb3NzIG11bHRpcGxlIGVtaXR0ZXJzLlxuXHQgKi9cblx0ZGVsaXZlcnlRdWV1ZT86IEV2ZW50RGVsaXZlcnlRdWV1ZTtcblxuXHQvKiogT05MWSBlbmFibGUgdGhpcyBkdXJpbmcgZGV2ZWxvcG1lbnQgKi9cblx0X3Byb2ZOYW1lPzogc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBFdmVudFByb2ZpbGluZyB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGFsbCA9IG5ldyBTZXQ8RXZlbnRQcm9maWxpbmc+KCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDA7XG5cblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRwdWJsaWMgbGlzdGVuZXJDb3VudDogbnVtYmVyID0gMDtcblx0cHVibGljIGludm9jYXRpb25Db3VudCA9IDA7XG5cdHB1YmxpYyBlbGFwc2VkT3ZlcmFsbCA9IDA7XG5cdHB1YmxpYyBkdXJhdGlvbnM6IG51bWJlcltdID0gW107XG5cblx0cHJpdmF0ZSBfc3RvcFdhdGNoPzogU3RvcFdhdGNoO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMubmFtZSA9IGAke25hbWV9XyR7RXZlbnRQcm9maWxpbmcuX2lkUG9vbCsrfWA7XG5cdFx0RXZlbnRQcm9maWxpbmcuYWxsLmFkZCh0aGlzKTtcblx0fVxuXG5cdHN0YXJ0KGxpc3RlbmVyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHR0aGlzLmxpc3RlbmVyQ291bnQgPSBsaXN0ZW5lckNvdW50O1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcFdhdGNoKSB7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gdGhpcy5fc3RvcFdhdGNoLmVsYXBzZWQoKTtcblx0XHRcdHRoaXMuZHVyYXRpb25zLnB1c2goZWxhcHNlZCk7XG5cdFx0XHR0aGlzLmVsYXBzZWRPdmVyYWxsICs9IGVsYXBzZWQ7XG5cdFx0XHR0aGlzLmludm9jYXRpb25Db3VudCArPSAxO1xuXHRcdFx0dGhpcy5fc3RvcFdhdGNoID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5sZXQgX2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gLTE7XG5leHBvcnQgZnVuY3Rpb24gc2V0R2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQobjogbnVtYmVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBvbGRWYWx1ZSA9IF9nbG9iYWxMZWFrV2FybmluZ1RocmVzaG9sZDtcblx0X2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gbjtcblx0cmV0dXJuIHtcblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0X2dsb2JhbExlYWtXYXJuaW5nVGhyZXNob2xkID0gb2xkVmFsdWU7XG5cdFx0fVxuXHR9O1xufVxuXG5jbGFzcyBMZWFrYWdlTW9uaXRvciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDE7XG5cblx0cHJpdmF0ZSBfc3RhY2tzOiBNYXA8c3RyaW5nLCBudW1iZXI+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93YXJuQ291bnRkb3duOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Vycm9ySGFuZGxlcjogKGVycjogRXJyb3IpID0+IHZvaWQsXG5cdFx0cmVhZG9ubHkgdGhyZXNob2xkOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nID0gKExlYWthZ2VNb25pdG9yLl9pZFBvb2wrKykudG9TdHJpbmcoMTYpLnBhZFN0YXJ0KDMsICcwJylcblx0KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YWNrcz8uY2xlYXIoKTtcblx0fVxuXG5cdGNoZWNrKHN0YWNrOiBTdGFja3RyYWNlLCBsaXN0ZW5lckNvdW50OiBudW1iZXIpOiB1bmRlZmluZWQgfCAoKCkgPT4gdm9pZCkge1xuXG5cdFx0Y29uc3QgdGhyZXNob2xkID0gdGhpcy50aHJlc2hvbGQ7XG5cdFx0aWYgKHRocmVzaG9sZCA8PSAwIHx8IGxpc3RlbmVyQ291bnQgPCB0aHJlc2hvbGQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9zdGFja3MpIHtcblx0XHRcdHRoaXMuX3N0YWNrcyA9IG5ldyBNYXAoKTtcblx0XHR9XG5cdFx0Y29uc3QgY291bnQgPSAodGhpcy5fc3RhY2tzLmdldChzdGFjay52YWx1ZSkgfHwgMCk7XG5cdFx0dGhpcy5fc3RhY2tzLnNldChzdGFjay52YWx1ZSwgY291bnQgKyAxKTtcblx0XHR0aGlzLl93YXJuQ291bnRkb3duIC09IDE7XG5cblx0XHRpZiAodGhpcy5fd2FybkNvdW50ZG93biA8PSAwKSB7XG5cdFx0XHQvLyBvbmx5IHdhcm4gb24gZmlyc3QgZXhjZWVkIGFuZCB0aGVuIGV2ZXJ5IHRpbWUgdGhlIGxpbWl0XG5cdFx0XHQvLyBpcyBleGNlZWRlZCBieSA1MCUgYWdhaW5cblx0XHRcdHRoaXMuX3dhcm5Db3VudGRvd24gPSB0aHJlc2hvbGQgKiAwLjU7XG5cblx0XHRcdGNvbnN0IFt0b3BTdGFjaywgdG9wQ291bnRdID0gdGhpcy5nZXRNb3N0RnJlcXVlbnRTdGFjaygpITtcblx0XHRcdGNvbnN0IGVtaXR0ZXJOYW1lID0gL15bMC05YS1mXSskL2kudGVzdCh0aGlzLm5hbWUpID8gdW5kZWZpbmVkIDogdGhpcy5uYW1lO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBbJHt0aGlzLm5hbWV9XSBwb3RlbnRpYWwgbGlzdGVuZXIgTEVBSyBkZXRlY3RlZCwgaGF2aW5nICR7bGlzdGVuZXJDb3VudH0gbGlzdGVuZXJzIGFscmVhZHkuIE1PU1QgZnJlcXVlbnQgbGlzdGVuZXIgKCR7dG9wQ291bnR9KTpgO1xuXHRcdFx0Y29uc29sZS53YXJuKG1lc3NhZ2UpO1xuXHRcdFx0Y29uc29sZS53YXJuKHRvcFN0YWNrKTtcblxuXHRcdFx0Y29uc3Qga2luZCA9IHRvcENvdW50IC8gbGlzdGVuZXJDb3VudCA+IDAuMyA/ICdkb21pbmF0ZWQnIDogJ3BvcHVsYXInO1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgTGlzdGVuZXJMZWFrRXJyb3Ioa2luZCwgbWVzc2FnZSwgdG9wU3RhY2ssIGxpc3RlbmVyQ291bnQsIGVtaXR0ZXJOYW1lKTtcblx0XHRcdHRoaXMuX2Vycm9ySGFuZGxlcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICgpID0+IHtcblx0XHRcdGNvbnN0IGNvdW50ID0gKHRoaXMuX3N0YWNrcyEuZ2V0KHN0YWNrLnZhbHVlKSB8fCAwKTtcblx0XHRcdHRoaXMuX3N0YWNrcyEuc2V0KHN0YWNrLnZhbHVlLCBjb3VudCAtIDEpO1xuXHRcdH07XG5cdH1cblxuXHRnZXRNb3N0RnJlcXVlbnRTdGFjaygpOiBbc3RyaW5nLCBudW1iZXJdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3N0YWNrcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHRvcFN0YWNrOiBbc3RyaW5nLCBudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0b3BDb3VudDogbnVtYmVyID0gMDtcblx0XHRmb3IgKGNvbnN0IFtzdGFjaywgY291bnRdIG9mIHRoaXMuX3N0YWNrcykge1xuXHRcdFx0aWYgKCF0b3BTdGFjayB8fCB0b3BDb3VudCA8IGNvdW50KSB7XG5cdFx0XHRcdHRvcFN0YWNrID0gW3N0YWNrLCBjb3VudF07XG5cdFx0XHRcdHRvcENvdW50ID0gY291bnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0b3BTdGFjaztcblx0fVxufVxuXG5jbGFzcyBTdGFja3RyYWNlIHtcblxuXHRzdGF0aWMgY3JlYXRlKCkge1xuXHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcigpO1xuXHRcdHJldHVybiBuZXcgU3RhY2t0cmFjZShlcnIuc3RhY2sgPz8gJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihyZWFkb25seSB2YWx1ZTogc3RyaW5nKSB7IH1cblxuXHRwcmludCgpIHtcblx0XHRjb25zb2xlLndhcm4odGhpcy52YWx1ZS5zcGxpdCgnXFxuJykuc2xpY2UoMikuam9pbignXFxuJykpO1xuXHR9XG59XG5cbi8vIGVycm9yIHRoYXQgaXMgbG9nZ2VkIHdoZW4gZ29pbmcgb3ZlciB0aGUgY29uZmlndXJlZCBsaXN0ZW5lciB0aHJlc2hvbGRcbmV4cG9ydCBjbGFzcyBMaXN0ZW5lckxlYWtFcnJvciBleHRlbmRzIEVycm9yIHtcblx0cmVhZG9ubHkga2luZDogc3RyaW5nO1xuXHRyZWFkb25seSBsaXN0ZW5lckNvdW50OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgZGV0YWlsZWQgbWVzc2FnZSBpbmNsdWRpbmcgbGlzdGVuZXIgY291bnQgYW5kIG1vc3QgZnJlcXVlbnQgc3RhY2suXG5cdCAqIEF2YWlsYWJsZSBsb2NhbGx5IGZvciBkZWJ1Z2dpbmcgYnV0IGludGVudGlvbmFsbHkgbm90IHVzZWQgYXMgdGhlIGVycm9yXG5cdCAqIGBtZXNzYWdlYC4gV2hlbiBgZW1pdHRlck5hbWVgIGlzIHByb3ZpZGVkLCBlcnJvcnMgZ3JvdXAgYnkgZW1pdHRlciBuYW1lXG5cdCAqIGFuZCBraW5kIGluIHRlbGVtZXRyeTsgb3RoZXJ3aXNlIHRoZXkgZ3JvdXAgYnkga2luZCBhbG9uZS5cblx0ICovXG5cdHJlYWRvbmx5IGRldGFpbHM6IHN0cmluZztcblx0Y29uc3RydWN0b3Ioa2luZDogJ2RvbWluYXRlZCcgfCAncG9wdWxhcicsIGRldGFpbHM6IHN0cmluZywgc3RhY2s6IHN0cmluZywgbGlzdGVuZXJDb3VudDogbnVtYmVyLCBlbWl0dGVyTmFtZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGVtaXR0ZXJOYW1lXG5cdFx0XHQ/IGBbJHtlbWl0dGVyTmFtZX1dIHBvdGVudGlhbCBsaXN0ZW5lciBMRUFLIGRldGVjdGVkLCAke2tpbmR9YFxuXHRcdFx0OiBgcG90ZW50aWFsIGxpc3RlbmVyIExFQUsgZGV0ZWN0ZWQsICR7a2luZH1gKTtcblx0XHR0aGlzLm5hbWUgPSAnTGlzdGVuZXJMZWFrRXJyb3InO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5saXN0ZW5lckNvdW50ID0gbGlzdGVuZXJDb3VudDtcblx0XHR0aGlzLmRldGFpbHMgPSBkZXRhaWxzO1xuXHRcdHRoaXMuc3RhY2sgPSBzdGFjaztcblx0fVxuXG5cdHN0YXRpYyBpcyhlcnI6IHVua25vd24pOiBlcnIgaXMgTGlzdGVuZXJMZWFrRXJyb3Ige1xuXHRcdHJldHVybiBlcnIgaW5zdGFuY2VvZiBMaXN0ZW5lckxlYWtFcnJvclxuXHRcdFx0fHwgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIHR5cGVvZiAoZXJyIGFzIEVycm9yICYgeyBraW5kOiB1bmtub3duOyBsaXN0ZW5lckNvdW50OiB1bmtub3duIH0pLmtpbmQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiAoZXJyIGFzIEVycm9yICYgeyBraW5kOiB1bmtub3duOyBsaXN0ZW5lckNvdW50OiB1bmtub3duIH0pLmxpc3RlbmVyQ291bnQgPT09ICdudW1iZXInKTtcblx0fVxufVxuXG4vLyBTRVZFUkUgZXJyb3IgdGhhdCBpcyBsb2dnZWQgd2hlbiBoYXZpbmcgZ29uZSB3YXkgb3ZlciB0aGUgY29uZmlndXJlZCBsaXN0ZW5lclxuLy8gdGhyZXNob2xkIHNvIHRoYXQgdGhlIGVtaXR0ZXIgcmVmdXNlcyB0byBhY2NlcHQgbW9yZSBsaXN0ZW5lcnNcbmV4cG9ydCBjbGFzcyBMaXN0ZW5lclJlZnVzYWxFcnJvciBleHRlbmRzIExpc3RlbmVyTGVha0Vycm9yIHtcblx0Y29uc3RydWN0b3Ioa2luZDogJ2RvbWluYXRlZCcgfCAncG9wdWxhcicsIGRldGFpbHM6IHN0cmluZywgc3RhY2s6IHN0cmluZywgbGlzdGVuZXJDb3VudDogbnVtYmVyLCBlbWl0dGVyTmFtZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGtpbmQsIGRldGFpbHMsIHN0YWNrLCBsaXN0ZW5lckNvdW50LCBlbWl0dGVyTmFtZSk7XG5cdFx0dGhpcy5uYW1lID0gJ0xpc3RlbmVyUmVmdXNhbEVycm9yJztcblx0fVxufVxuXG5sZXQgaWQgPSAwO1xuY2xhc3MgVW5pcXVlQ29udGFpbmVyPFQ+IHtcblx0c3RhY2s/OiBTdGFja3RyYWNlO1xuXHRwdWJsaWMgaWQgPSBpZCsrO1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgdmFsdWU6IFQpIHsgfVxufVxuY29uc3QgY29tcGFjdGlvblRocmVzaG9sZCA9IDI7XG5cbnR5cGUgTGlzdGVuZXJDb250YWluZXI8VD4gPSBVbmlxdWVDb250YWluZXI8KGRhdGE6IFQpID0+IHZvaWQ+O1xudHlwZSBMaXN0ZW5lck9yTGlzdGVuZXJzPFQ+ID0gKExpc3RlbmVyQ29udGFpbmVyPFQ+IHwgdW5kZWZpbmVkKVtdIHwgTGlzdGVuZXJDb250YWluZXI8VD47XG5cbmNvbnN0IGZvckVhY2hMaXN0ZW5lciA9IDxUPihsaXN0ZW5lcnM6IExpc3RlbmVyT3JMaXN0ZW5lcnM8VD4sIGZuOiAoYzogTGlzdGVuZXJDb250YWluZXI8VD4pID0+IHZvaWQpID0+IHtcblx0aWYgKGxpc3RlbmVycyBpbnN0YW5jZW9mIFVuaXF1ZUNvbnRhaW5lcikge1xuXHRcdGZuKGxpc3RlbmVycyk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGwgPSBsaXN0ZW5lcnNbaV07XG5cdFx0XHRpZiAobCkge1xuXHRcdFx0XHRmbihsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogVGhlIEVtaXR0ZXIgY2FuIGJlIHVzZWQgdG8gZXhwb3NlIGFuIEV2ZW50IHRvIHRoZSBwdWJsaWNcbiAqIHRvIGZpcmUgaXQgZnJvbSB0aGUgaW5zaWRlcy5cbiAqIFNhbXBsZTpcblx0Y2xhc3MgRG9jdW1lbnQge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjwodmFsdWU6c3RyaW5nKT0+YW55PigpO1xuXG5cdFx0cHVibGljIG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0XHQvLyBnZXR0ZXItc3R5bGVcblx0XHQvLyBnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8KHZhbHVlOnN0cmluZyk9PmFueT4ge1xuXHRcdC8vIFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXHRcdC8vIH1cblxuXHRcdHByaXZhdGUgX2RvSXQoKSB7XG5cdFx0XHQvLy4uLlxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG4gKi9cbmV4cG9ydCBjbGFzcyBFbWl0dGVyPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zPzogRW1pdHRlck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlYWthZ2VNb24/OiBMZWFrYWdlTW9uaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVyZk1vbj86IEV2ZW50UHJvZmlsaW5nO1xuXHRwcml2YXRlIF9kaXNwb3NlZD86IHRydWU7XG5cdHByaXZhdGUgX2V2ZW50PzogRXZlbnQ8VD47XG5cblx0LyoqXG5cdCAqIEEgbGlzdGVuZXIsIG9yIGxpc3Qgb2YgbGlzdGVuZXJzLiBBIHNpbmdsZSBsaXN0ZW5lciBpcyB0aGUgbW9zdCBjb21tb25cblx0ICogZm9yIGV2ZW50IGVtaXR0ZXJzICgjMTg1Nzg5KSwgc28gd2Ugb3B0aW1pemUgdGhhdCBzcGVjaWFsIGNhc2UgdG8gYXZvaWRcblx0ICogd3JhcHBpbmcgaXQgaW4gYW4gYXJyYXkgKGp1c3QgbGlrZSBOb2RlLmpzIGl0c2VsZi4pXG5cdCAqXG5cdCAqIEEgbGlzdCBvZiBsaXN0ZW5lcnMgbmV2ZXIgJ2Rvd25ncmFkZXMnIGJhY2sgdG8gYSBwbGFpbiBmdW5jdGlvbiBpZlxuXHQgKiBsaXN0ZW5lcnMgYXJlIHJlbW92ZWQsIGZvciB0d28gcmVhc29uczpcblx0ICpcblx0ICogIDEuIFRoYXQncyBjb21wbGljYXRlZCAoZXNwZWNpYWxseSB3aXRoIHRoZSBkZWxpdmVyeVF1ZXVlKVxuXHQgKiAgMi4gQSBsaXN0ZW5lciB3aXRoID4xIGxpc3RlbmVyIGlzIGxpa2VseSB0byBoYXZlID4xIGxpc3RlbmVyIGFnYWluIGF0XG5cdCAqICAgICBzb21lIHBvaW50LCBhbmQgc3dhcHBpbmcgYmV0d2VlbiBhcnJheXMgYW5kIGZ1bmN0aW9ucyBtYXlbY2l0YXRpb24gbmVlZGVkXVxuXHQgKiAgICAgaW50cm9kdWNlIHVubmVjZXNzYXJ5IHdvcmsgYW5kIGdhcmJhZ2UuXG5cdCAqXG5cdCAqIFRoZSBhcnJheSBsaXN0ZW5lcnMgY2FuIGJlICdzcGFyc2UnLCB0byBhdm9pZCByZWFsbG9jYXRpbmcgdGhlIGFycmF5XG5cdCAqIHdoZW5ldmVyIGFueSBsaXN0ZW5lciBpcyBhZGRlZCBvciByZW1vdmVkLiBJZiBtb3JlIHRoYW4gYDEgLyBjb21wYWN0aW9uVGhyZXNob2xkYFxuXHQgKiBvZiB0aGUgYXJyYXkgaXMgZW1wdHksIG9ubHkgdGhlbiBpcyBpdCByZXNpemVkLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9saXN0ZW5lcnM/OiBMaXN0ZW5lck9yTGlzdGVuZXJzPFQ+O1xuXG5cdC8qKlxuXHQgKiBBbHdheXMgdG8gYmUgZGVmaW5lZCBpZiBfbGlzdGVuZXJzIGlzIGFuIGFycmF5LiBJdCdzIG5vIGxvbmdlciBhIHRydWVcblx0ICogcXVldWUsIGJ1dCBob2xkcyB0aGUgZGlzcGF0Y2hpbmcgJ3N0YXRlJy4gSWYgYGZpcmUoKWAgaXMgY2FsbGVkIG9uIGFuXG5cdCAqIGVtaXR0ZXIsIGFueSB3b3JrIGxlZnQgaW4gdGhlIF9kZWxpdmVyeVF1ZXVlIGlzIGZpbmlzaGVkIGZpcnN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVsaXZlcnlRdWV1ZT86IEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGU7XG5cdHByb3RlY3RlZCBfc2l6ZSA9IDA7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9ucz86IEVtaXR0ZXJPcHRpb25zKSB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5fbGVha2FnZU1vbiA9IChfZ2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQgPiAwIHx8IHRoaXMuX29wdGlvbnM/LmxlYWtXYXJuaW5nVGhyZXNob2xkKVxuXHRcdFx0PyBuZXcgTGVha2FnZU1vbml0b3Iob3B0aW9ucz8ub25MaXN0ZW5lckVycm9yID8/IG9uVW5leHBlY3RlZEVycm9yLCB0aGlzLl9vcHRpb25zPy5sZWFrV2FybmluZ1RocmVzaG9sZCA/PyBfZ2xvYmFsTGVha1dhcm5pbmdUaHJlc2hvbGQsIHRoaXMuX29wdGlvbnM/LmxlYWtXYXJuaW5nTmFtZSkgOlxuXHRcdFx0dW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BlcmZNb24gPSB0aGlzLl9vcHRpb25zPy5fcHJvZk5hbWUgPyBuZXcgRXZlbnRQcm9maWxpbmcodGhpcy5fb3B0aW9ucy5fcHJvZk5hbWUpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2RlbGl2ZXJ5UXVldWUgPSB0aGlzLl9vcHRpb25zPy5kZWxpdmVyeVF1ZXVlIGFzIEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGUgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdGlmICghdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gSXQgaXMgYmFkIHRvIGhhdmUgbGlzdGVuZXJzIGF0IHRoZSB0aW1lIG9mIGRpc3Bvc2luZyBhbiBlbWl0dGVyLCBpdCBpcyB3b3JzdCB0byBoYXZlIGxpc3RlbmVycyBrZWVwIHRoZSBlbWl0dGVyXG5cdFx0XHQvLyBhbGl2ZSB2aWEgdGhlIHJlZmVyZW5jZSB0aGF0J3MgZW1iZWRkZWQgaW4gdGhlaXIgZGlzcG9zYWJsZXMuIFRoZXJlZm9yZSB3ZSBsb29wIG92ZXIgYWxsIHJlbWFpbmluZyBsaXN0ZW5lcnMgYW5kXG5cdFx0XHQvLyB1bnNldCB0aGVpciBzdWJzY3JpcHRpb25zL2Rpc3Bvc2FibGVzLiBMb29waW5nIGFuZCBibGFtaW5nIHJlbWFpbmluZyBsaXN0ZW5lcnMgaXMgZG9uZSBvbiBuZXh0IHRpY2sgYmVjYXVzZSB0aGVcblx0XHRcdC8vIHRoZSBmb2xsb3dpbmcgcHJvZ3JhbW1pbmcgcGF0dGVybiBpcyB2ZXJ5IHBvcHVsYXI6XG5cdFx0XHQvL1xuXHRcdFx0Ly8gY29uc3Qgc29tZU1vZGVsID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2RlbE9iamVjdCgpKTsgLy8gKDEpIGNyZWF0ZSBhbmQgcmVnaXN0ZXIgbW9kZWxcblx0XHRcdC8vIHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChzb21lTW9kZWwub25EaWRDaGFuZ2UoKCkgPT4geyAuLi4gfSk7IC8vICgyKSBzdWJzY3JpYmUgYW5kIHJlZ2lzdGVyIG1vZGVsLWV2ZW50IGxpc3RlbmVyXG5cdFx0XHQvLyAuLi5sYXRlci4uLlxuXHRcdFx0Ly8gdGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpOyBkaXNwb3NlcyAoMSkgdGhlbiAoMik6IGRvbid0IHdhcm4gYWZ0ZXIgKDEpIGJ1dCBhZnRlciB0aGUgXCJvdmVyYWxsIGRpc3Bvc2VcIiBpcyBkb25lXG5cblx0XHRcdGlmICh0aGlzLl9kZWxpdmVyeVF1ZXVlPy5jdXJyZW50ID09PSB0aGlzKSB7XG5cdFx0XHRcdHRoaXMuX2RlbGl2ZXJ5UXVldWUucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9saXN0ZW5lcnMpIHtcblx0XHRcdFx0aWYgKF9lbmFibGVEaXNwb3NlV2l0aExpc3RlbmVyV2FybmluZykge1xuXHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycztcblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRmb3JFYWNoTGlzdGVuZXIobGlzdGVuZXJzLCBsID0+IGwuc3RhY2s/LnByaW50KCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9zaXplID0gMDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29wdGlvbnM/Lm9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyPy4oKTtcblx0XHRcdHRoaXMuX2xlYWthZ2VNb24/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9yIHRoZSBwdWJsaWMgdG8gYWxsb3cgdG8gc3Vic2NyaWJlXG5cdCAqIHRvIGV2ZW50cyBmcm9tIHRoaXMgRW1pdHRlclxuXHQgKi9cblx0Z2V0IGV2ZW50KCk6IEV2ZW50PFQ+IHtcblx0XHR0aGlzLl9ldmVudCA/Pz0gKGNhbGxiYWNrOiAoZTogVCkgPT4gdW5rbm93biwgdGhpc0FyZ3M/OiBhbnksIGRpc3Bvc2FibGVzPzogSURpc3Bvc2FibGVbXSB8IERpc3Bvc2FibGVTdG9yZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xlYWthZ2VNb24gJiYgdGhpcy5fc2l6ZSA+IHRoaXMuX2xlYWthZ2VNb24udGhyZXNob2xkICoqIDIpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBbJHt0aGlzLl9sZWFrYWdlTW9uLm5hbWV9XSBSRUZVU0VTIHRvIGFjY2VwdCBuZXcgbGlzdGVuZXJzIGJlY2F1c2UgaXQgZXhjZWVkZWQgaXRzIHRocmVzaG9sZCBieSBmYXIgKCR7dGhpcy5fc2l6ZX0gdnMgJHt0aGlzLl9sZWFrYWdlTW9uLnRocmVzaG9sZH0pYDtcblx0XHRcdFx0Y29uc29sZS53YXJuKG1lc3NhZ2UpO1xuXG5cdFx0XHRcdGNvbnN0IHR1cGxlID0gdGhpcy5fbGVha2FnZU1vbi5nZXRNb3N0RnJlcXVlbnRTdGFjaygpID8/IFsnVU5LTk9XTiBzdGFjaycsIC0xXTtcblx0XHRcdFx0Y29uc3Qga2luZCA9IHR1cGxlWzFdIC8gdGhpcy5fc2l6ZSA+IDAuMyA/ICdkb21pbmF0ZWQnIDogJ3BvcHVsYXInO1xuXHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBMaXN0ZW5lclJlZnVzYWxFcnJvcihraW5kLCBgJHttZXNzYWdlfS4gSElOVDogU3RhY2sgc2hvd3MgbW9zdCBmcmVxdWVudCBsaXN0ZW5lciAoJHt0dXBsZVsxXX0tdGltZXMpYCwgdHVwbGVbMF0sIHRoaXMuX3NpemUsIHRoaXMuX29wdGlvbnM/LmxlYWtXYXJuaW5nTmFtZSk7XG5cdFx0XHRcdGNvbnN0IGVycm9ySGFuZGxlciA9IHRoaXMuX29wdGlvbnM/Lm9uTGlzdGVuZXJFcnJvciB8fCBvblVuZXhwZWN0ZWRFcnJvcjtcblx0XHRcdFx0ZXJyb3JIYW5kbGVyKGVycm9yKTtcblxuXHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0Ly8gdG9kbzogc2hvdWxkIHdlIHdhcm4gaWYgYSBsaXN0ZW5lciBpcyBhZGRlZCB0byBhIGRpc3Bvc2VkIGVtaXR0ZXI/IFRoaXMgaGFwcGVucyBvZnRlblxuXHRcdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpc0FyZ3MpIHtcblx0XHRcdFx0Y2FsbGJhY2sgPSBjYWxsYmFjay5iaW5kKHRoaXNBcmdzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGFpbmVkID0gbmV3IFVuaXF1ZUNvbnRhaW5lcihjYWxsYmFjayk7XG5cblx0XHRcdGxldCByZW1vdmVNb25pdG9yOiBGdW5jdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzdGFjazogU3RhY2t0cmFjZSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9sZWFrYWdlTW9uICYmIHRoaXMuX3NpemUgPj0gTWF0aC5jZWlsKHRoaXMuX2xlYWthZ2VNb24udGhyZXNob2xkICogMC4yKSkge1xuXHRcdFx0XHQvLyBjaGVjayBhbmQgcmVjb3JkIHRoaXMgZW1pdHRlciBmb3IgcG90ZW50aWFsIGxlYWthZ2Vcblx0XHRcdFx0Y29udGFpbmVkLnN0YWNrID0gU3RhY2t0cmFjZS5jcmVhdGUoKTtcblx0XHRcdFx0cmVtb3ZlTW9uaXRvciA9IHRoaXMuX2xlYWthZ2VNb24uY2hlY2soY29udGFpbmVkLnN0YWNrLCB0aGlzLl9zaXplICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChfZW5hYmxlRGlzcG9zZVdpdGhMaXN0ZW5lcldhcm5pbmcpIHtcblx0XHRcdFx0Y29udGFpbmVkLnN0YWNrID0gc3RhY2sgPz8gU3RhY2t0cmFjZS5jcmVhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9saXN0ZW5lcnMpIHtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucz8ub25XaWxsQWRkRmlyc3RMaXN0ZW5lcj8uKHRoaXMpO1xuXHRcdFx0XHR0aGlzLl9saXN0ZW5lcnMgPSBjb250YWluZWQ7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnM/Lm9uRGlkQWRkRmlyc3RMaXN0ZW5lcj8uKHRoaXMpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9saXN0ZW5lcnMgaW5zdGFuY2VvZiBVbmlxdWVDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5fZGVsaXZlcnlRdWV1ZSA/Pz0gbmV3IEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGUoKTtcblx0XHRcdFx0dGhpcy5fbGlzdGVuZXJzID0gW3RoaXMuX2xpc3RlbmVycywgY29udGFpbmVkXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xpc3RlbmVycy5wdXNoKGNvbnRhaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vcHRpb25zPy5vbkRpZEFkZExpc3RlbmVyPy4odGhpcyk7XG5cblx0XHRcdHRoaXMuX3NpemUrKztcblxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRyZW1vdmVNb25pdG9yPy4oKTtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlTGlzdGVuZXIoY29udGFpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0YWRkVG9EaXNwb3NhYmxlcyhyZXN1bHQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX2V2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTGlzdGVuZXIobGlzdGVuZXI6IExpc3RlbmVyQ29udGFpbmVyPFQ+KSB7XG5cdFx0dGhpcy5fb3B0aW9ucz8ub25XaWxsUmVtb3ZlTGlzdGVuZXI/Lih0aGlzKTtcblxuXHRcdGlmICghdGhpcy5fbGlzdGVuZXJzKSB7XG5cdFx0XHRyZXR1cm47IC8vIGV4cGVjdGVkIGlmIGEgbGlzdGVuZXIgZ2V0cyBkaXNwb3NlZFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaXplID09PSAxKSB7XG5cdFx0XHR0aGlzLl9saXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vcHRpb25zPy5vbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcj8uKHRoaXMpO1xuXHRcdFx0dGhpcy5fc2l6ZSA9IDA7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gc2l6ZSA+IDEgd2hpY2ggcmVxdWlyZXMgdGhhdCBsaXN0ZW5lcnMgYmUgYSBsaXN0OlxuXHRcdGNvbnN0IGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycyBhcyAoTGlzdGVuZXJDb250YWluZXI8VD4gfCB1bmRlZmluZWQpW107XG5cblx0XHRjb25zdCBpbmRleCA9IGxpc3RlbmVycy5pbmRleE9mKGxpc3RlbmVyKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnZGlzcG9zZWQ/JywgdGhpcy5fZGlzcG9zZWQpO1xuXHRcdFx0Y29uc29sZS5sb2coJ3NpemU/JywgdGhpcy5fc2l6ZSk7XG5cdFx0XHRjb25zb2xlLmxvZygnYXJyPycsIEpTT04uc3RyaW5naWZ5KHRoaXMuX2xpc3RlbmVycykpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBdHRlbXB0ZWQgdG8gZGlzcG9zZSB1bmtub3duIGxpc3RlbmVyJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2l6ZS0tO1xuXHRcdGxpc3RlbmVyc1tpbmRleF0gPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBhZGp1c3REZWxpdmVyeVF1ZXVlID0gdGhpcy5fZGVsaXZlcnlRdWV1ZSEuY3VycmVudCA9PT0gdGhpcztcblx0XHRpZiAodGhpcy5fc2l6ZSAqIGNvbXBhY3Rpb25UaHJlc2hvbGQgPD0gbGlzdGVuZXJzLmxlbmd0aCkge1xuXHRcdFx0bGV0IG4gPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0ZW5lcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGxpc3RlbmVyc1tpXSkge1xuXHRcdFx0XHRcdGxpc3RlbmVyc1tuKytdID0gbGlzdGVuZXJzW2ldO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFkanVzdERlbGl2ZXJ5UXVldWUgJiYgbiA8IHRoaXMuX2RlbGl2ZXJ5UXVldWUhLmVuZCkge1xuXHRcdFx0XHRcdHRoaXMuX2RlbGl2ZXJ5UXVldWUhLmVuZC0tO1xuXHRcdFx0XHRcdGlmIChuIDwgdGhpcy5fZGVsaXZlcnlRdWV1ZSEuaSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVsaXZlcnlRdWV1ZSEuaS0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bGlzdGVuZXJzLmxlbmd0aCA9IG47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsaXZlcihsaXN0ZW5lcjogdW5kZWZpbmVkIHwgVW5pcXVlQ29udGFpbmVyPCh2YWx1ZTogVCkgPT4gdm9pZD4sIHZhbHVlOiBUKSB7XG5cdFx0aWYgKCFsaXN0ZW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVycm9ySGFuZGxlciA9IHRoaXMuX29wdGlvbnM/Lm9uTGlzdGVuZXJFcnJvciB8fCBvblVuZXhwZWN0ZWRFcnJvcjtcblx0XHRpZiAoIWVycm9ySGFuZGxlcikge1xuXHRcdFx0bGlzdGVuZXIudmFsdWUodmFsdWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRsaXN0ZW5lci52YWx1ZSh2YWx1ZSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0ZXJyb3JIYW5kbGVyKGUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBEZWxpdmVycyBpdGVtcyBpbiB0aGUgcXVldWUuIEFzc3VtZXMgdGhlIHF1ZXVlIGlzIHJlYWR5IHRvIGdvLiAqL1xuXHRwcml2YXRlIF9kZWxpdmVyUXVldWUoZHE6IEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGUpIHtcblx0XHRjb25zdCBsaXN0ZW5lcnMgPSBkcS5jdXJyZW50IS5fbGlzdGVuZXJzISBhcyAoTGlzdGVuZXJDb250YWluZXI8VD4gfCB1bmRlZmluZWQpW107XG5cdFx0d2hpbGUgKGRxLmkgPCBkcS5lbmQpIHtcblx0XHRcdC8vIGltcG9ydGFudDogZHEuaSBpcyBpbmNyZW1lbnRlZCBiZWZvcmUgY2FsbGluZyBkZWxpdmVyKCkgYmVjYXVzZSBpdCBtaWdodCByZWVudGVyIGRlbGl2ZXJRdWV1ZSgpXG5cdFx0XHR0aGlzLl9kZWxpdmVyKGxpc3RlbmVyc1tkcS5pKytdLCBkcS52YWx1ZSBhcyBUKTtcblx0XHR9XG5cdFx0ZHEucmVzZXQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUbyBiZSBrZXB0IHByaXZhdGUgdG8gZmlyZSBhbiBldmVudCB0b1xuXHQgKiBzdWJzY3JpYmVyc1xuXHQgKi9cblx0ZmlyZShldmVudDogVCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWxpdmVyeVF1ZXVlPy5jdXJyZW50KSB7XG5cdFx0XHR0aGlzLl9kZWxpdmVyUXVldWUodGhpcy5fZGVsaXZlcnlRdWV1ZSk7XG5cdFx0XHR0aGlzLl9wZXJmTW9uPy5zdG9wKCk7IC8vIGxhc3QgZmlyZSgpIHdpbGwgaGF2ZSBzdGFydGluZyBwZXJmbW9uLCBzdG9wIGl0IGJlZm9yZSBzdGFydGluZyB0aGUgbmV4dCBkaXNwYXRjaFxuXHRcdH1cblxuXHRcdHRoaXMuX3BlcmZNb24/LnN0YXJ0KHRoaXMuX3NpemUpO1xuXG5cdFx0aWYgKCF0aGlzLl9saXN0ZW5lcnMpIHtcblx0XHRcdC8vIG5vLW9wXG5cdFx0fSBlbHNlIGlmICh0aGlzLl9saXN0ZW5lcnMgaW5zdGFuY2VvZiBVbmlxdWVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX2RlbGl2ZXIodGhpcy5fbGlzdGVuZXJzLCBldmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRxID0gdGhpcy5fZGVsaXZlcnlRdWV1ZSE7XG5cdFx0XHRkcS5lbnF1ZXVlKHRoaXMsIGV2ZW50LCB0aGlzLl9saXN0ZW5lcnMubGVuZ3RoKTtcblx0XHRcdHRoaXMuX2RlbGl2ZXJRdWV1ZShkcSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVyZk1vbj8uc3RvcCgpO1xuXHR9XG5cblx0aGFzTGlzdGVuZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zaXplID4gMDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV2ZW50RGVsaXZlcnlRdWV1ZSB7XG5cdF9pc0V2ZW50RGVsaXZlcnlRdWV1ZTogdHJ1ZTtcbn1cblxuZXhwb3J0IGNvbnN0IGNyZWF0ZUV2ZW50RGVsaXZlcnlRdWV1ZSA9ICgpOiBFdmVudERlbGl2ZXJ5UXVldWUgPT4gbmV3IEV2ZW50RGVsaXZlcnlRdWV1ZVByaXZhdGUoKTtcblxuY2xhc3MgRXZlbnREZWxpdmVyeVF1ZXVlUHJpdmF0ZSBpbXBsZW1lbnRzIEV2ZW50RGVsaXZlcnlRdWV1ZSB7XG5cdGRlY2xhcmUgX2lzRXZlbnREZWxpdmVyeVF1ZXVlOiB0cnVlO1xuXG5cdC8qKlxuXHQgKiBJbmRleCBpbiBjdXJyZW50J3MgbGlzdGVuZXIgbGlzdC5cblx0ICovXG5cdHB1YmxpYyBpID0gLTE7XG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IGluZGV4IGluIHRoZSBsaXN0ZW5lcidzIGxpc3QgdG8gZGVsaXZlci5cblx0ICovXG5cdHB1YmxpYyBlbmQgPSAwO1xuXG5cdC8qKlxuXHQgKiBFbWl0dGVyIGN1cnJlbnRseSBiZWluZyBkaXNwYXRjaGVkIG9uLiBFbWl0dGVyLl9saXN0ZW5lcnMgaXMgYWx3YXlzIGFuIGFycmF5LlxuXHQgKi9cblx0cHVibGljIGN1cnJlbnQ/OiBFbWl0dGVyPGFueT47XG5cdC8qKlxuXHQgKiBDdXJyZW50bHkgZW1pdHRpbmcgdmFsdWUuIERlZmluZWQgd2hlbmV2ZXIgYGN1cnJlbnRgIGlzLlxuXHQgKi9cblx0cHVibGljIHZhbHVlPzogdW5rbm93bjtcblxuXHRwdWJsaWMgZW5xdWV1ZTxUPihlbWl0dGVyOiBFbWl0dGVyPFQ+LCB2YWx1ZTogVCwgZW5kOiBudW1iZXIpIHtcblx0XHR0aGlzLmkgPSAwO1xuXHRcdHRoaXMuZW5kID0gZW5kO1xuXHRcdHRoaXMuY3VycmVudCA9IGVtaXR0ZXI7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIHJlc2V0KCkge1xuXHRcdHRoaXMuaSA9IHRoaXMuZW5kOyAvLyBmb3JjZSBhbnkgY3VycmVudCBlbWlzc2lvbiBsb29wIHRvIHN0b3AsIG1haW5seSBmb3IgZHVyaW5nIGRpc3Bvc2Vcblx0XHR0aGlzLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy52YWx1ZSA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXYWl0VW50aWwge1xuXHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW47XG5cdHdhaXRVbnRpbCh0aGVuYWJsZTogUHJvbWlzZTx1bmtub3duPik6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIElXYWl0VW50aWxEYXRhPFQ+ID0gT21pdDxPbWl0PFQsICd3YWl0VW50aWwnPiwgJ3Rva2VuJz47XG5cbmV4cG9ydCBjbGFzcyBBc3luY0VtaXR0ZXI8VCBleHRlbmRzIElXYWl0VW50aWw+IGV4dGVuZHMgRW1pdHRlcjxUPiB7XG5cblx0cHJpdmF0ZSBfYXN5bmNEZWxpdmVyeVF1ZXVlPzogTGlua2VkTGlzdDxbKGV2OiBUKSA9PiB2b2lkLCBJV2FpdFVudGlsRGF0YTxUPl0+O1xuXG5cdGFzeW5jIGZpcmVBc3luYyhkYXRhOiBJV2FpdFVudGlsRGF0YTxUPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBwcm9taXNlSm9pbj86IChwOiBQcm9taXNlPHVua25vd24+LCBsaXN0ZW5lcjogRnVuY3Rpb24pID0+IFByb21pc2U8dW5rbm93bj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2xpc3RlbmVycykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fYXN5bmNEZWxpdmVyeVF1ZXVlKSB7XG5cdFx0XHR0aGlzLl9hc3luY0RlbGl2ZXJ5UXVldWUgPSBuZXcgTGlua2VkTGlzdCgpO1xuXHRcdH1cblxuXHRcdGZvckVhY2hMaXN0ZW5lcih0aGlzLl9saXN0ZW5lcnMsIGxpc3RlbmVyID0+IHRoaXMuX2FzeW5jRGVsaXZlcnlRdWV1ZSEucHVzaChbbGlzdGVuZXIudmFsdWUsIGRhdGFdKSk7XG5cblx0XHR3aGlsZSAodGhpcy5fYXN5bmNEZWxpdmVyeVF1ZXVlLnNpemUgPiAwICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXG5cdFx0XHRjb25zdCBbbGlzdGVuZXIsIGRhdGFdID0gdGhpcy5fYXN5bmNEZWxpdmVyeVF1ZXVlLnNoaWZ0KCkhO1xuXHRcdFx0Y29uc3QgdGhlbmFibGVzOiBQcm9taXNlPHVua25vd24+W10gPSBbXTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0Y29uc3QgZXZlbnQgPSA8VD57XG5cdFx0XHRcdC4uLmRhdGEsXG5cdFx0XHRcdHRva2VuLFxuXHRcdFx0XHR3YWl0VW50aWw6IChwOiBQcm9taXNlPHVua25vd24+KTogdm9pZCA9PiB7XG5cdFx0XHRcdFx0aWYgKE9iamVjdC5pc0Zyb3plbih0aGVuYWJsZXMpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3dhaXRVbnRpbCBjYW4gTk9UIGJlIGNhbGxlZCBhc3luY2hyb25vdXMnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHByb21pc2VKb2luKSB7XG5cdFx0XHRcdFx0XHRwID0gcHJvbWlzZUpvaW4ocCwgbGlzdGVuZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGVuYWJsZXMucHVzaChwKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGlzdGVuZXIoZXZlbnQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZyZWV6ZSB0aGVuYWJsZXMtY29sbGVjdGlvbiB0byBlbmZvcmNlIHN5bmMtY2FsbHMgdG9cblx0XHRcdC8vIHdhaXQgdW50aWwgYW5kIHRoZW4gd2FpdCBmb3IgYWxsIHRoZW5hYmxlcyB0byByZXNvbHZlXG5cdFx0XHRPYmplY3QuZnJlZXplKHRoZW5hYmxlcyk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGVuYWJsZXMpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcih2YWx1ZS5yZWFzb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFBhdXNlYWJsZUVtaXR0ZXI8VD4gZXh0ZW5kcyBFbWl0dGVyPFQ+IHtcblxuXHRwcml2YXRlIF9pc1BhdXNlZCA9IDA7XG5cdHByb3RlY3RlZCBfZXZlbnRRdWV1ZSA9IG5ldyBMaW5rZWRMaXN0PFQ+KCk7XG5cdHByaXZhdGUgX21lcmdlRm4/OiAoaW5wdXQ6IFRbXSkgPT4gVDtcblxuXHRwdWJsaWMgZ2V0IGlzUGF1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1BhdXNlZCAhPT0gMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBFbWl0dGVyT3B0aW9ucyAmIHsgbWVyZ2U/OiAoaW5wdXQ6IFRbXSkgPT4gVCB9KSB7XG5cdFx0c3VwZXIob3B0aW9ucyk7XG5cdFx0dGhpcy5fbWVyZ2VGbiA9IG9wdGlvbnM/Lm1lcmdlO1xuXHR9XG5cblx0cGF1c2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNQYXVzZWQrKztcblx0fVxuXG5cdHJlc3VtZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNQYXVzZWQgIT09IDAgJiYgLS10aGlzLl9pc1BhdXNlZCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX21lcmdlRm4pIHtcblx0XHRcdFx0Ly8gdXNlIHRoZSBtZXJnZSBmdW5jdGlvbiB0byBjcmVhdGUgYSBzaW5nbGUgY29tcG9zaXRlXG5cdFx0XHRcdC8vIGV2ZW50LiBtYWtlIGEgY29weSBpbiBjYXNlIGZpcmluZyBwYXVzZXMgdGhpcyBlbWl0dGVyXG5cdFx0XHRcdGlmICh0aGlzLl9ldmVudFF1ZXVlLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXZlbnRzID0gQXJyYXkuZnJvbSh0aGlzLl9ldmVudFF1ZXVlKTtcblx0XHRcdFx0XHR0aGlzLl9ldmVudFF1ZXVlLmNsZWFyKCk7XG5cdFx0XHRcdFx0c3VwZXIuZmlyZSh0aGlzLl9tZXJnZUZuKGV2ZW50cykpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG5vIG1lcmdpbmcsIGZpcmUgZWFjaCBldmVudCBpbmRpdmlkdWFsbHkgYW5kIHRlc3Rcblx0XHRcdFx0Ly8gdGhhdCB0aGlzIGVtaXR0ZXIgaXNuJ3QgcGF1c2VkIGhhbGZ3YXkgdGhyb3VnaFxuXHRcdFx0XHR3aGlsZSAoIXRoaXMuX2lzUGF1c2VkICYmIHRoaXMuX2V2ZW50UXVldWUuc2l6ZSAhPT0gMCkge1xuXHRcdFx0XHRcdHN1cGVyLmZpcmUodGhpcy5fZXZlbnRRdWV1ZS5zaGlmdCgpISk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmaXJlKGV2ZW50OiBUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NpemUpIHtcblx0XHRcdGlmICh0aGlzLl9pc1BhdXNlZCAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLl9ldmVudFF1ZXVlLnB1c2goZXZlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3VwZXIuZmlyZShldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWJvdW5jZUVtaXR0ZXI8VD4gZXh0ZW5kcyBQYXVzZWFibGVFbWl0dGVyPFQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWxheTogbnVtYmVyO1xuXHRwcml2YXRlIF9oYW5kbGU6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogRW1pdHRlck9wdGlvbnMgJiB7IG1lcmdlOiAoaW5wdXQ6IFRbXSkgPT4gVDsgZGVsYXk/OiBudW1iZXIgfSkge1xuXHRcdHN1cGVyKG9wdGlvbnMpO1xuXHRcdHRoaXMuX2RlbGF5ID0gb3B0aW9ucy5kZWxheSA/PyAxMDA7XG5cdH1cblxuXHRvdmVycmlkZSBmaXJlKGV2ZW50OiBUKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYW5kbGUpIHtcblx0XHRcdHRoaXMucGF1c2UoKTtcblx0XHRcdHRoaXMuX2hhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMucmVzdW1lKCk7XG5cdFx0XHR9LCB0aGlzLl9kZWxheSk7XG5cdFx0fVxuXHRcdHN1cGVyLmZpcmUoZXZlbnQpO1xuXHR9XG59XG5cbi8qKlxuICogQW4gZW1pdHRlciB3aGljaCBxdWV1ZSBhbGwgZXZlbnRzIGFuZCB0aGVuIHByb2Nlc3MgdGhlbSBhdCB0aGVcbiAqIGVuZCBvZiB0aGUgZXZlbnQgbG9vcC5cbiAqL1xuZXhwb3J0IGNsYXNzIE1pY3JvdGFza0VtaXR0ZXI8VD4gZXh0ZW5kcyBFbWl0dGVyPFQ+IHtcblx0cHJpdmF0ZSBfcXVldWVkRXZlbnRzOiBUW10gPSBbXTtcblx0cHJpdmF0ZSBfbWVyZ2VGbj86IChpbnB1dDogVFtdKSA9PiBUO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM/OiBFbWl0dGVyT3B0aW9ucyAmIHsgbWVyZ2U/OiAoaW5wdXQ6IFRbXSkgPT4gVCB9KSB7XG5cdFx0c3VwZXIob3B0aW9ucyk7XG5cdFx0dGhpcy5fbWVyZ2VGbiA9IG9wdGlvbnM/Lm1lcmdlO1xuXHR9XG5cdG92ZXJyaWRlIGZpcmUoZXZlbnQ6IFQpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5oYXNMaXN0ZW5lcnMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3F1ZXVlZEV2ZW50cy5wdXNoKGV2ZW50KTtcblx0XHRpZiAodGhpcy5fcXVldWVkRXZlbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fbWVyZ2VGbikge1xuXHRcdFx0XHRcdHN1cGVyLmZpcmUodGhpcy5fbWVyZ2VGbih0aGlzLl9xdWV1ZWRFdmVudHMpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9xdWV1ZWRFdmVudHMuZm9yRWFjaChlID0+IHN1cGVyLmZpcmUoZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3F1ZXVlZEV2ZW50cyA9IFtdO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQW4gZXZlbnQgZW1pdHRlciB0aGF0IG11bHRpcGxleGVzIG1hbnkgZXZlbnRzIGludG8gYSBzaW5nbGUgZXZlbnQuXG4gKlxuICogQGV4YW1wbGUgTGlzdGVuIHRvIHRoZSBgb25EYXRhYCBldmVudCBvZiBhbGwgYFRoaW5nYHMsIGR5bmFtaWNhbGx5IGFkZGluZyBhbmQgcmVtb3ZpbmcgYFRoaW5nYHNcbiAqIHRvIHRoZSBtdWx0aXBsZXhlciBhcyBuZWVkZWQuXG4gKlxuICogYGBgdHlwZXNjcmlwdFxuICogY29uc3QgYW55dGhpbmdEYXRhTXVsdGlwbGV4ZXIgPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjx7IGRhdGE6IHN0cmluZyB9PigpO1xuICpcbiAqIGNvbnN0IHRoaW5nTGlzdGVuZXJzID0gRGlzcG9zYWJsZU1hcDxUaGluZywgSURpc3Bvc2FibGU+KCk7XG4gKlxuICogdGhpbmdTZXJ2aWNlLm9uRGlkQWRkVGhpbmcodGhpbmcgPT4ge1xuICogICB0aGluZ0xpc3RlbmVycy5zZXQodGhpbmcsIGFueXRoaW5nRGF0YU11bHRpcGxleGVyLmFkZCh0aGluZy5vbkRhdGEpO1xuICogfSk7XG4gKiB0aGluZ1NlcnZpY2Uub25EaWRSZW1vdmVUaGluZyh0aGluZyA9PiB7XG4gKiAgIHRoaW5nTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UodGhpbmcpO1xuICogfSk7XG4gKlxuICogYW55dGhpbmdEYXRhTXVsdGlwbGV4ZXIuZXZlbnQoZSA9PiB7XG4gKiAgIGNvbnNvbGUubG9nKCdTb21ldGhpbmcgZmlyZWQgZGF0YSAnICsgZS5kYXRhKVxuICogfSk7XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIEV2ZW50TXVsdGlwbGV4ZXI8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlbWl0dGVyOiBFbWl0dGVyPFQ+O1xuXHRwcml2YXRlIGhhc0xpc3RlbmVycyA9IGZhbHNlO1xuXHRwcml2YXRlIGV2ZW50czogeyBldmVudDogRXZlbnQ8VD47IGxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGwgfVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5lbWl0dGVyID0gbmV3IEVtaXR0ZXI8VD4oe1xuXHRcdFx0b25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4gdGhpcy5vbkZpcnN0TGlzdGVuZXJBZGQoKSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB0aGlzLm9uTGFzdExpc3RlbmVyUmVtb3ZlKClcblx0XHR9KTtcblx0fVxuXG5cdGdldCBldmVudCgpOiBFdmVudDxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdGFkZChldmVudDogRXZlbnQ8VD4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZSA9IHsgZXZlbnQ6IGV2ZW50LCBsaXN0ZW5lcjogbnVsbCB9O1xuXHRcdHRoaXMuZXZlbnRzLnB1c2goZSk7XG5cblx0XHRpZiAodGhpcy5oYXNMaXN0ZW5lcnMpIHtcblx0XHRcdHRoaXMuaG9vayhlKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaGFzTGlzdGVuZXJzKSB7XG5cdFx0XHRcdHRoaXMudW5ob29rKGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLmV2ZW50cy5pbmRleE9mKGUpO1xuXHRcdFx0dGhpcy5ldmVudHMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0fTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKGRpc3Bvc2UpKTtcblx0fVxuXG5cdHByaXZhdGUgb25GaXJzdExpc3RlbmVyQWRkKCk6IHZvaWQge1xuXHRcdHRoaXMuaGFzTGlzdGVuZXJzID0gdHJ1ZTtcblx0XHR0aGlzLmV2ZW50cy5mb3JFYWNoKGUgPT4gdGhpcy5ob29rKGUpKTtcblx0fVxuXG5cdHByaXZhdGUgb25MYXN0TGlzdGVuZXJSZW1vdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5oYXNMaXN0ZW5lcnMgPSBmYWxzZTtcblx0XHR0aGlzLmV2ZW50cy5mb3JFYWNoKGUgPT4gdGhpcy51bmhvb2soZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBob29rKGU6IHsgZXZlbnQ6IEV2ZW50PFQ+OyBsaXN0ZW5lcjogSURpc3Bvc2FibGUgfCBudWxsIH0pOiB2b2lkIHtcblx0XHRlLmxpc3RlbmVyID0gZS5ldmVudChyID0+IHRoaXMuZW1pdHRlci5maXJlKHIpKTtcblx0fVxuXG5cdHByaXZhdGUgdW5ob29rKGU6IHsgZXZlbnQ6IEV2ZW50PFQ+OyBsaXN0ZW5lcjogSURpc3Bvc2FibGUgfCBudWxsIH0pOiB2b2lkIHtcblx0XHRlLmxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0ZS5saXN0ZW5lciA9IG51bGw7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW1pdHRlci5kaXNwb3NlKCk7XG5cblx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy5ldmVudHMpIHtcblx0XHRcdGUubGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5ldmVudHMgPSBbXTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXI8VEV2ZW50VHlwZT4gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGV2ZW50OiBFdmVudDxURXZlbnRUeXBlPjtcbn1cbmV4cG9ydCBjbGFzcyBEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXI8VEl0ZW0sIFRFdmVudFR5cGU+IGltcGxlbWVudHMgSUR5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcjxURXZlbnRUeXBlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHJlYWRvbmx5IGV2ZW50OiBFdmVudDxURXZlbnRUeXBlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpdGVtczogVEl0ZW1bXSxcblx0XHRvbkFkZEl0ZW06IEV2ZW50PFRJdGVtPixcblx0XHRvblJlbW92ZUl0ZW06IEV2ZW50PFRJdGVtPixcblx0XHRnZXRFdmVudDogKGl0ZW06IFRJdGVtKSA9PiBFdmVudDxURXZlbnRUeXBlPlxuXHQpIHtcblx0XHRjb25zdCBtdWx0aXBsZXhlciA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRXZlbnRNdWx0aXBsZXhlcjxURXZlbnRUeXBlPigpKTtcblx0XHRjb25zdCBpdGVtTGlzdGVuZXJzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlTWFwPFRJdGVtLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0XHRmdW5jdGlvbiBhZGRJdGVtKGluc3RhbmNlOiBUSXRlbSkge1xuXHRcdFx0aXRlbUxpc3RlbmVycy5zZXQoaW5zdGFuY2UsIG11bHRpcGxleGVyLmFkZChnZXRFdmVudChpbnN0YW5jZSkpKTtcblx0XHR9XG5cblx0XHQvLyBFeGlzdGluZyBpdGVtc1xuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgaXRlbXMpIHtcblx0XHRcdGFkZEl0ZW0oaW5zdGFuY2UpO1xuXHRcdH1cblxuXHRcdC8vIEFkZGVkIGl0ZW1zXG5cdFx0dGhpcy5fc3RvcmUuYWRkKG9uQWRkSXRlbShpbnN0YW5jZSA9PiB7XG5cdFx0XHRhZGRJdGVtKGluc3RhbmNlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZW1vdmVkIGl0ZW1zXG5cdFx0dGhpcy5fc3RvcmUuYWRkKG9uUmVtb3ZlSXRlbShpbnN0YW5jZSA9PiB7XG5cdFx0XHRpdGVtTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaW5zdGFuY2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZXZlbnQgPSBtdWx0aXBsZXhlci5ldmVudDtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIEV2ZW50QnVmZmVyZXIgaXMgdXNlZnVsIGluIHNpdHVhdGlvbnMgaW4gd2hpY2ggeW91IHdhbnRcbiAqIHRvIGRlbGF5IGZpcmluZyB5b3VyIGV2ZW50cyBkdXJpbmcgc29tZSBjb2RlLlxuICogWW91IGNhbiB3cmFwIHRoYXQgY29kZSBhbmQgYmUgc3VyZSB0aGF0IHRoZSBldmVudCB3aWxsIG5vdFxuICogYmUgZmlyZWQgZHVyaW5nIHRoYXQgd3JhcC5cbiAqXG4gKiBgYGBcbiAqIGNvbnN0IGVtaXR0ZXI6IEVtaXR0ZXI7XG4gKiBjb25zdCBkZWxheWVyID0gbmV3IEV2ZW50RGVsYXllcigpO1xuICogY29uc3QgZGVsYXllZEV2ZW50ID0gZGVsYXllci53cmFwRXZlbnQoZW1pdHRlci5ldmVudCk7XG4gKlxuICogZGVsYXllZEV2ZW50KGNvbnNvbGUubG9nKTtcbiAqXG4gKiBkZWxheWVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG4gKiAgIGVtaXR0ZXIuZmlyZSgpOyAvLyBldmVudCB3aWxsIG5vdCBiZSBmaXJlZCB5ZXRcbiAqIH0pO1xuICpcbiAqIC8vIGV2ZW50IHdpbGwgb25seSBiZSBmaXJlZCBhdCB0aGlzIHBvaW50XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGNsYXNzIEV2ZW50QnVmZmVyZXIge1xuXG5cdHByaXZhdGUgZGF0YTogeyBidWZmZXJzOiBGdW5jdGlvbltdIH1bXSA9IFtdO1xuXG5cdHdyYXBFdmVudDxUPihldmVudDogRXZlbnQ8VD4pOiBFdmVudDxUPjtcblx0d3JhcEV2ZW50PFQ+KGV2ZW50OiBFdmVudDxUPiwgcmVkdWNlOiAobGFzdDogVCB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IFQpOiBFdmVudDxUPjtcblx0d3JhcEV2ZW50PFQsIE8+KGV2ZW50OiBFdmVudDxUPiwgcmVkdWNlOiAobGFzdDogTyB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IE8sIGluaXRpYWw6IE8pOiBFdmVudDxPPjtcblx0d3JhcEV2ZW50PFQsIE8+KGV2ZW50OiBFdmVudDxUPiwgcmVkdWNlPzogKGxhc3Q6IFQgfCBPIHwgdW5kZWZpbmVkLCBldmVudDogVCkgPT4gVCB8IE8sIGluaXRpYWw/OiBPKTogRXZlbnQ8TyB8IFQ+IHtcblx0XHRyZXR1cm4gKGxpc3RlbmVyLCB0aGlzQXJncz8sIGRpc3Bvc2FibGVzPykgPT4ge1xuXHRcdFx0cmV0dXJuIGV2ZW50KGkgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5kYXRhW3RoaXMuZGF0YS5sZW5ndGggLSAxXTtcblxuXHRcdFx0XHQvLyBOb24tcmVkdWNlIHNjZW5hcmlvXG5cdFx0XHRcdGlmICghcmVkdWNlKSB7XG5cdFx0XHRcdFx0Ly8gQnVmZmVyaW5nIGNhc2Vcblx0XHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdFx0ZGF0YS5idWZmZXJzLnB1c2goKCkgPT4gbGlzdGVuZXIuY2FsbCh0aGlzQXJncywgaSkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBOb3QgYnVmZmVyaW5nIGNhc2Vcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZWR1Y2Ugc2NlbmFyaW9cblx0XHRcdFx0Y29uc3QgcmVkdWNlRGF0YSA9IGRhdGEgYXMgdHlwZW9mIGRhdGEgJiB7XG5cdFx0XHRcdFx0LyoqXG5cdFx0XHRcdFx0ICogVGhlIGFjY3VtdWxhdGVkIGl0ZW1zIHRoYXQgd2lsbCBiZSByZWR1Y2VkLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdGl0ZW1zPzogVFtdO1xuXHRcdFx0XHRcdC8qKlxuXHRcdFx0XHRcdCAqIFRoZSByZWR1Y2VkIHJlc3VsdCBjYWNoZWQgdG8gYmUgc2hhcmVkIHdpdGggb3RoZXIgbGlzdGVuZXJzLlxuXHRcdFx0XHRcdCAqL1xuXHRcdFx0XHRcdHJlZHVjZWRSZXN1bHQ/OiBUIHwgTztcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBOb3QgYnVmZmVyaW5nIGNhc2Vcblx0XHRcdFx0aWYgKCFyZWR1Y2VEYXRhKSB7XG5cdFx0XHRcdFx0Ly8gVE9ETzogSXMgdGhlcmUgYSB3YXkgdG8gY2FjaGUgdGhpcyByZWR1Y2UgY2FsbCBmb3IgYWxsIGxpc3RlbmVycz9cblx0XHRcdFx0XHRsaXN0ZW5lci5jYWxsKHRoaXNBcmdzLCByZWR1Y2UoaW5pdGlhbCwgaSkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEJ1ZmZlcmluZyBjYXNlXG5cdFx0XHRcdHJlZHVjZURhdGEuaXRlbXMgPz89IFtdO1xuXHRcdFx0XHRyZWR1Y2VEYXRhLml0ZW1zLnB1c2goaSk7XG5cdFx0XHRcdGlmIChyZWR1Y2VEYXRhLmJ1ZmZlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gSW5jbHVkZSBhIHNpbmdsZSBidWZmZXJlZCBmdW5jdGlvbiB0aGF0IHdpbGwgcmVkdWNlIGFsbCBldmVudHMgd2hlbiB3ZSdyZSBkb25lIGJ1ZmZlcmluZyBldmVudHNcblx0XHRcdFx0XHRkYXRhLmJ1ZmZlcnMucHVzaCgoKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBjYWNoZSB0aGUgcmVkdWNlZCByZXN1bHQgc28gdGhhdCB0aGUgdmFsdWUgY2FuIGJlIHNoYXJlZCBhY3Jvc3MgYWxsIGxpc3RlbmVyc1xuXHRcdFx0XHRcdFx0cmVkdWNlRGF0YS5yZWR1Y2VkUmVzdWx0ID8/PSBpbml0aWFsXG5cdFx0XHRcdFx0XHRcdD8gcmVkdWNlRGF0YS5pdGVtcyEucmVkdWNlKHJlZHVjZSBhcyAobGFzdDogTyB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IE8sIGluaXRpYWwpXG5cdFx0XHRcdFx0XHRcdDogcmVkdWNlRGF0YS5pdGVtcyEucmVkdWNlKHJlZHVjZSBhcyAobGFzdDogVCB8IHVuZGVmaW5lZCwgZXZlbnQ6IFQpID0+IFQpO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuY2FsbCh0aGlzQXJncywgcmVkdWNlRGF0YS5yZWR1Y2VkUmVzdWx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fTtcblx0fVxuXG5cdGJ1ZmZlckV2ZW50czxSID0gdm9pZD4oZm46ICgpID0+IFIpOiBSIHtcblx0XHRjb25zdCBkYXRhID0geyBidWZmZXJzOiBuZXcgQXJyYXk8RnVuY3Rpb24+KCkgfTtcblx0XHR0aGlzLmRhdGEucHVzaChkYXRhKTtcblx0XHRjb25zdCByID0gZm4oKTtcblx0XHR0aGlzLmRhdGEucG9wKCk7XG5cdFx0ZGF0YS5idWZmZXJzLmZvckVhY2goZmx1c2ggPT4gZmx1c2goKSk7XG5cdFx0cmV0dXJuIHI7XG5cdH1cbn1cblxuLyoqXG4gKiBBIFJlbGF5IGlzIGFuIGV2ZW50IGZvcndhcmRlciB3aGljaCBmdW5jdGlvbnMgYXMgYSByZXBsdWdhYmJsZSBldmVudCBwaXBlLlxuICogT25jZSBjcmVhdGVkLCB5b3UgY2FuIGNvbm5lY3QgYW4gaW5wdXQgZXZlbnQgdG8gaXQgYW5kIGl0IHdpbGwgc2ltcGx5IGZvcndhcmRcbiAqIGV2ZW50cyBmcm9tIHRoYXQgaW5wdXQgZXZlbnQgdGhyb3VnaCBpdHMgb3duIGBldmVudGAgcHJvcGVydHkuIFRoZSBgaW5wdXRgXG4gKiBjYW4gYmUgY2hhbmdlZCBhdCBhbnkgcG9pbnQgaW4gdGltZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlbGF5PFQ+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgbGlzdGVuaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgaW5wdXRFdmVudDogRXZlbnQ8VD4gPSBFdmVudC5Ob25lO1xuXHRwcml2YXRlIGlucHV0RXZlbnRMaXN0ZW5lcjogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8VD4oe1xuXHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0dGhpcy5saXN0ZW5pbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5pbnB1dEV2ZW50TGlzdGVuZXIgPSB0aGlzLmlucHV0RXZlbnQodGhpcy5lbWl0dGVyLmZpcmUsIHRoaXMuZW1pdHRlcik7XG5cdFx0fSxcblx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0dGhpcy5saXN0ZW5pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuaW5wdXRFdmVudExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlYWRvbmx5IGV2ZW50OiBFdmVudDxUPiA9IHRoaXMuZW1pdHRlci5ldmVudDtcblxuXHRzZXQgaW5wdXQoZXZlbnQ6IEV2ZW50PFQ+KSB7XG5cdFx0dGhpcy5pbnB1dEV2ZW50ID0gZXZlbnQ7XG5cblx0XHRpZiAodGhpcy5saXN0ZW5pbmcpIHtcblx0XHRcdHRoaXMuaW5wdXRFdmVudExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuaW5wdXRFdmVudExpc3RlbmVyID0gZXZlbnQodGhpcy5lbWl0dGVyLmZpcmUsIHRoaXMuZW1pdHRlcik7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmlucHV0RXZlbnRMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5lbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0Z2V0IHZhbHVlKCk6IFQ7XG59XG5cbmV4cG9ydCBjbGFzcyBWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiBpbXBsZW1lbnRzIElWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiB7XG5cdHB1YmxpYyBzdGF0aWMgY29uc3Q8VD4odmFsdWU6IFQpOiBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQ29uc3RWYWx1ZVdpdGhDaGFuZ2VFdmVudCh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgX3ZhbHVlOiBUKSB7IH1cblxuXHRnZXQgdmFsdWUoKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlO1xuXHR9XG5cblx0c2V0IHZhbHVlKHZhbHVlOiBUKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB0aGlzLl92YWx1ZSkge1xuXHRcdFx0dGhpcy5fdmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ29uc3RWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiBpbXBsZW1lbnRzIElWYWx1ZVdpdGhDaGFuZ2VFdmVudDxUPiB7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHZhbHVlOiBUKSB7IH1cbn1cblxuLyoqXG4gKiBAcGFyYW0gaGFuZGxlSXRlbSBJcyBjYWxsZWQgZm9yIGVhY2ggaXRlbSBpbiB0aGUgc2V0IChidXQgb25seSB0aGUgZmlyc3QgdGltZSB0aGUgaXRlbSBpcyBzZWVuIGluIHRoZSBzZXQpLlxuICogXHRUaGUgcmV0dXJuZWQgZGlzcG9zYWJsZSBpcyBkaXNwb3NlZCBpZiB0aGUgaXRlbSBpcyBubyBsb25nZXIgaW4gdGhlIHNldC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyYWNrU2V0Q2hhbmdlczxUPihnZXREYXRhOiAoKSA9PiBSZWFkb25seVNldDxUPiwgb25EaWRDaGFuZ2VEYXRhOiBFdmVudDx1bmtub3duPiwgaGFuZGxlSXRlbTogKGQ6IFQpID0+IElEaXNwb3NhYmxlKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBtYXAgPSBuZXcgRGlzcG9zYWJsZU1hcDxULCBJRGlzcG9zYWJsZT4oKTtcblx0bGV0IG9sZERhdGEgPSBuZXcgU2V0KGdldERhdGEoKSk7XG5cdGZvciAoY29uc3QgZCBvZiBvbGREYXRhKSB7XG5cdFx0bWFwLnNldChkLCBoYW5kbGVJdGVtKGQpKTtcblx0fVxuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRzdG9yZS5hZGQob25EaWRDaGFuZ2VEYXRhKCgpID0+IHtcblx0XHRjb25zdCBuZXdEYXRhID0gZ2V0RGF0YSgpO1xuXHRcdGNvbnN0IGRpZmYgPSBkaWZmU2V0cyhvbGREYXRhLCBuZXdEYXRhKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgZGlmZi5yZW1vdmVkKSB7XG5cdFx0XHRtYXAuZGVsZXRlQW5kRGlzcG9zZShyKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBhIG9mIGRpZmYuYWRkZWQpIHtcblx0XHRcdG1hcC5zZXQoYSwgaGFuZGxlSXRlbShhKSk7XG5cdFx0fVxuXHRcdG9sZERhdGEgPSBuZXcgU2V0KG5ld0RhdGEpO1xuXHR9KSk7XG5cdHN0b3JlLmFkZChtYXApO1xuXHRyZXR1cm4gc3RvcmU7XG59XG5cblxuZnVuY3Rpb24gYWRkVG9EaXNwb3NhYmxlcyhyZXN1bHQ6IElEaXNwb3NhYmxlLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIHwgSURpc3Bvc2FibGVbXSB8IHVuZGVmaW5lZCkge1xuXHRpZiAoZGlzcG9zYWJsZXMgaW5zdGFuY2VvZiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVzdWx0KTtcblx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRpc3Bvc2FibGVzKSkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2gocmVzdWx0KTtcblx0fVxufVxuXG5mdW5jdGlvbiBkaXNwb3NlQW5kUmVtb3ZlKHJlc3VsdDogSURpc3Bvc2FibGUsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfCBJRGlzcG9zYWJsZVtdIHwgdW5kZWZpbmVkKSB7XG5cdGlmIChkaXNwb3NhYmxlcyBpbnN0YW5jZW9mIERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdGRpc3Bvc2FibGVzLmRlbGV0ZShyZXN1bHQpO1xuXHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGlzcG9zYWJsZXMpKSB7XG5cdFx0Y29uc3QgaW5kZXggPSBkaXNwb3NhYmxlcy5pbmRleE9mKHJlc3VsdCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdH1cblx0cmVzdWx0LmRpc3Bvc2UoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CLFlBQVksZUFBZSxpQkFBOEIsb0JBQW9CO0FBQzFHLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQjtBQU8xQixNQUFNLG9DQUFvQztBQVMxQyxNQUFNLHNDQUFzQztBQUs1QyxNQUFNLGdDQUFnQztBQUN0QyxNQUFNLCtCQUErQjtBQUVyQyxTQUFTLDhCQUF1QztBQUMvQyxTQUFPLENBQUMsQ0FBQyxJQUFJLFlBQVk7QUFDMUI7QUFTTyxJQUFVO0FBQUEsQ0FBVixDQUFVQSxXQUFWO0FBQ0MsRUFBTUEsT0FBQSxPQUFtQixNQUFNLFdBQVc7QUFFakQsV0FBUyxzQkFBc0IsU0FBeUI7QUFDdkQsUUFBSSxxQ0FBcUM7QUFDeEMsWUFBTSxFQUFFLGtCQUFrQixtQkFBbUIsSUFBSTtBQUNqRCxZQUFNLFFBQVEsV0FBVyxPQUFPO0FBQ2hDLFVBQUksUUFBUTtBQUNaLGNBQVEsbUJBQW1CLE1BQU07QUFDaEMsWUFBSSxFQUFFLFVBQVUsR0FBRztBQUNsQixrQkFBUSxLQUFLLDRHQUE0RztBQUN6SCxnQkFBTSxNQUFNO0FBQUEsUUFDYjtBQUNBLDZCQUFxQjtBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFxQk8sV0FBUyxNQUFNLE9BQXVCLHVCQUFpQyxZQUEyQztBQUN4SCxXQUFPLFNBQXdCLE9BQU8sTUFBTSxRQUFRLEdBQUcsUUFBVyx5QkFBeUIsTUFBTSxRQUFXLFVBQVU7QUFBQSxFQUN2SDtBQUZPLEVBQUFBLE9BQVM7QUFTVCxXQUFTLEtBQVEsT0FBMkI7QUFDbEQsV0FBTyxDQUFDLFVBQVUsV0FBVyxNQUFNLGdCQUFpQjtBQUVuRCxVQUFJLFVBQVU7QUFDZCxV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SyxTQUFTO0FBQzdCLFVBQUksaUJBQWlCLENBQUM7QUFBQSxJQUN2QjtBQUNBLGVBQVcsS0FBSyxLQUFLLE9BQU87QUFDM0IsVUFBSSxJQUFJLEdBQUcsV0FBVyxDQUFDLENBQUM7QUFBQSxJQUN6QjtBQUNBLGNBQVUsSUFBSSxJQUFJLE9BQU87QUFBQSxFQUMxQixDQUFDLENBQUM7QUFDRixRQUFNLElBQUksR0FBRztBQUNiLFNBQU87QUFDUjtBQUdBLFNBQVMsaUJBQWlCLFFBQXFCLGFBQTBEO0FBQ3hHLE1BQUksdUJBQXVCLGlCQUFpQjtBQUMzQyxnQkFBWSxJQUFJLE1BQU07QUFBQSxFQUN2QixXQUFXLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDdEMsZ0JBQVksS0FBSyxNQUFNO0FBQUEsRUFDeEI7QUFDRDtBQUVBLFNBQVMsaUJBQWlCLFFBQXFCLGFBQTBEO0FBQ3hHLE1BQUksdUJBQXVCLGlCQUFpQjtBQUMzQyxnQkFBWSxPQUFPLE1BQU07QUFBQSxFQUMxQixXQUFXLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDdEMsVUFBTSxRQUFRLFlBQVksUUFBUSxNQUFNO0FBQ3hDLFFBQUksVUFBVSxJQUFJO0FBQ2pCLGtCQUFZLE9BQU8sT0FBTyxDQUFDO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQ0EsU0FBTyxRQUFRO0FBQ2hCOyIsCiAgIm5hbWVzIjogWyJFdmVudCIsICJtYXAiLCAiZmlsdGVyIiwgImJ1ZmZlciIsICJpZCIsICJjb3VudCIsICJkYXRhIl0KfQo=
