import { autorun } from "../reactions/autorun.js";
import { observableValue } from "../observables/observableValue.js";
import { DisposableStore, toDisposable } from "../commonFacade/deps.js";
import { derived, derivedOpts } from "../observables/derived.js";
import { observableFromEvent } from "../observables/observableFromEvent.js";
import { observableSignal } from "../observables/observableSignal.js";
import { _setKeepObserved, _setRecomputeInitiallyAndOnChange } from "../observables/baseObservable.js";
import { DebugLocation } from "../debugLocation.js";
function observableFromPromise(promise) {
  const observable = observableValue("promiseValue", {});
  promise.then((value) => {
    observable.set({ value }, void 0);
  });
  return observable;
}
function signalFromObservable(owner, observable) {
  return derivedOpts({
    owner,
    equalsFn: () => false
  }, (reader) => {
    observable.read(reader);
  });
}
function debouncedObservable(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
  let hasValue = false;
  let lastValue;
  let timeout = void 0;
  return observableFromEvent(void 0, (cb) => {
    const d = autorun((reader) => {
      const value = observable.read(reader);
      if (!hasValue) {
        hasValue = true;
        lastValue = value;
      } else {
        if (timeout) {
          clearTimeout(timeout);
        }
        const debounceDuration = typeof debounceMs === "number" ? debounceMs : debounceMs(lastValue, value);
        if (debounceDuration === 0) {
          lastValue = value;
          cb();
          return;
        }
        timeout = setTimeout(() => {
          lastValue = value;
          cb();
        }, debounceDuration);
      }
    });
    return {
      dispose() {
        d.dispose();
        hasValue = false;
        lastValue = void 0;
      }
    };
  }, () => {
    if (hasValue) {
      return lastValue;
    } else {
      return observable.get();
    }
  }, debugLocation);
}
function throttledObservable(observable, throttleMs, debugLocation = DebugLocation.ofCaller()) {
  let hasValue = false;
  let lastValue;
  let timeout = void 0;
  return observableFromEvent(void 0, (cb) => {
    const d = autorun((reader) => {
      const value = observable.read(reader);
      if (!hasValue) {
        hasValue = true;
        lastValue = value;
      } else if (!timeout) {
        timeout = setTimeout(() => {
          timeout = void 0;
          lastValue = observable.read(void 0);
          cb();
        }, throttleMs);
      }
    });
    return {
      dispose() {
        d.dispose();
        if (timeout) {
          clearTimeout(timeout);
          timeout = void 0;
        }
        hasValue = false;
        lastValue = void 0;
      }
    };
  }, () => {
    if (hasValue) {
      return lastValue;
    } else {
      return observable.get();
    }
  }, debugLocation);
}
function debouncedObservable2(observable, debounceMs, debugLocation = DebugLocation.ofCaller()) {
  const s = observableSignal("handleTimeout");
  let currentValue = void 0;
  let timeout = void 0;
  const d = derivedOpts({
    owner: void 0,
    onLastObserverRemoved: () => {
      currentValue = void 0;
    }
  }, (reader) => {
    const val = observable.read(reader);
    s.read(reader);
    if (val !== currentValue) {
      const debounceDuration = typeof debounceMs === "number" ? debounceMs : debounceMs(currentValue, val);
      if (debounceDuration === 0) {
        currentValue = val;
        return val;
      }
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => {
        currentValue = val;
        s.trigger(void 0);
      }, debounceDuration);
    }
    return currentValue;
  }, debugLocation);
  return d;
}
function wasEventTriggeredRecently(event, timeoutMs, disposableStore) {
  const observable = observableValue("triggeredRecently", false);
  let timeout = void 0;
  disposableStore.add(event(() => {
    observable.set(true, void 0);
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      observable.set(false, void 0);
    }, timeoutMs);
  }));
  return observable;
}
function keepObserved(observable) {
  const o = new KeepAliveObserver(false, void 0);
  observable.addObserver(o);
  return toDisposable(() => {
    observable.removeObserver(o);
  });
}
_setKeepObserved(keepObserved);
function recomputeInitiallyAndOnChange(observable, handleValue) {
  const o = new KeepAliveObserver(true, handleValue);
  observable.addObserver(o);
  try {
    o.beginUpdate(observable);
  } finally {
    o.endUpdate(observable);
  }
  return toDisposable(() => {
    observable.removeObserver(o);
  });
}
_setRecomputeInitiallyAndOnChange(recomputeInitiallyAndOnChange);
class KeepAliveObserver {
  constructor(_forceRecompute, _handleValue) {
    this._forceRecompute = _forceRecompute;
    this._handleValue = _handleValue;
    this._counter = 0;
  }
  beginUpdate(observable) {
    this._counter++;
  }
  endUpdate(observable) {
    if (this._counter === 1 && this._forceRecompute) {
      if (this._handleValue) {
        this._handleValue(observable.get());
      } else {
        observable.reportChanges();
      }
    }
    this._counter--;
  }
  handlePossibleChange(observable) {
  }
  handleChange(observable, change) {
  }
}
function derivedObservableWithCache(owner, computeFn) {
  let lastValue = void 0;
  const observable = derivedOpts({ owner, debugReferenceFn: computeFn }, (reader) => {
    lastValue = computeFn(reader, lastValue);
    return lastValue;
  });
  return observable;
}
function derivedObservableWithWritableCache(owner, computeFn) {
  let lastValue = void 0;
  const onChange = observableSignal("derivedObservableWithWritableCache");
  const observable = derived(owner, (reader) => {
    onChange.read(reader);
    lastValue = computeFn(reader, lastValue);
    return lastValue;
  });
  return Object.assign(observable, {
    clearCache: (tx) => {
      lastValue = void 0;
      onChange.trigger(tx);
    },
    setCache: (newValue, tx) => {
      lastValue = newValue;
      onChange.trigger(tx);
    }
  });
}
function mapObservableArrayCached(owner, items, map, keySelector) {
  let m = new ArrayMap(map, keySelector);
  const self = derivedOpts({
    debugReferenceFn: map,
    owner,
    onLastObserverRemoved: () => {
      m.dispose();
      m = new ArrayMap(map);
    }
  }, (reader) => {
    const i = items.read(reader);
    m.setItems(i);
    return m.getItems();
  });
  return self;
}
class ArrayMap {
  constructor(_map, _keySelector) {
    this._map = _map;
    this._keySelector = _keySelector;
    this._cache = /* @__PURE__ */ new Map();
    this._items = [];
  }
  dispose() {
    this._cache.forEach((entry) => entry.store.dispose());
    this._cache.clear();
  }
  setItems(items) {
    const newItems = [];
    const itemsToRemove = new Set(this._cache.keys());
    for (const item of items) {
      const key = this._keySelector ? this._keySelector(item) : item;
      let entry = this._cache.get(key);
      if (!entry) {
        const store = new DisposableStore();
        const out = this._map(item, store);
        entry = { out, store };
        this._cache.set(key, entry);
      } else {
        itemsToRemove.delete(key);
      }
      newItems.push(entry.out);
    }
    for (const item of itemsToRemove) {
      const entry = this._cache.get(item);
      entry.store.dispose();
      this._cache.delete(item);
    }
    this._items = newItems;
  }
  getItems() {
    return this._items;
  }
}
function isObservable(obj) {
  return !!obj && obj.read !== void 0 && obj.reportChanges !== void 0;
}
export {
  KeepAliveObserver,
  debouncedObservable,
  debouncedObservable2,
  derivedObservableWithCache,
  derivedObservableWithWritableCache,
  isObservable,
  keepObserved,
  mapObservableArrayCached,
  observableFromPromise,
  recomputeInitiallyAndOnChange,
  signalFromObservable,
  throttledObservable,
  wasEventTriggeredRecently
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC91dGlscy91dGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi9yZWFjdGlvbnMvYXV0b3J1bi5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJT2JzZXJ2ZXIsIElSZWFkZXIsIElUcmFuc2FjdGlvbiB9IGZyb20gJy4uL2Jhc2UuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZVZhbHVlLmpzJztcbmltcG9ydCB7IERlYnVnT3duZXIgfSBmcm9tICcuLi9kZWJ1Z05hbWUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBFdmVudCwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uL2NvbW1vbkZhY2FkZS9kZXBzLmpzJztcbmltcG9ydCB7IGRlcml2ZWQsIGRlcml2ZWRPcHRzIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvZGVyaXZlZC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZUZyb21FdmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlU2lnbmFsIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZVNpZ25hbC5qcyc7XG5pbXBvcnQgeyBfc2V0S2VlcE9ic2VydmVkLCBfc2V0UmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UgfSBmcm9tICcuLi9vYnNlcnZhYmxlcy9iYXNlT2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0xvY2F0aW9uIH0gZnJvbSAnLi4vZGVidWdMb2NhdGlvbi5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBvYnNlcnZhYmxlRnJvbVByb21pc2U8VD4ocHJvbWlzZTogUHJvbWlzZTxUPik6IElPYnNlcnZhYmxlPHsgdmFsdWU/OiBUIH0+IHtcblx0Y29uc3Qgb2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTx7IHZhbHVlPzogVCB9PigncHJvbWlzZVZhbHVlJywge30pO1xuXHRwcm9taXNlLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0b2JzZXJ2YWJsZS5zZXQoeyB2YWx1ZSB9LCB1bmRlZmluZWQpO1xuXHR9KTtcblx0cmV0dXJuIG9ic2VydmFibGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduYWxGcm9tT2JzZXJ2YWJsZTxUPihvd25lcjogRGVidWdPd25lciB8IHVuZGVmaW5lZCwgb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiBJT2JzZXJ2YWJsZTx2b2lkPiB7XG5cdHJldHVybiBkZXJpdmVkT3B0cyh7XG5cdFx0b3duZXIsXG5cdFx0ZXF1YWxzRm46ICgpID0+IGZhbHNlLFxuXHR9LCByZWFkZXIgPT4ge1xuXHRcdG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIG9ic2VydmFibGUgdGhhdCBkZWJvdW5jZXMgdGhlIGlucHV0IG9ic2VydmFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWJvdW5jZWRPYnNlcnZhYmxlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+LCBkZWJvdW5jZU1zOiBudW1iZXIgfCAoKGxhc3RWYWx1ZTogVCB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IFQpID0+IG51bWJlciksIGRlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpOiBJT2JzZXJ2YWJsZTxUPiB7XG5cdGxldCBoYXNWYWx1ZSA9IGZhbHNlO1xuXHRsZXQgbGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXG5cdGxldCB0aW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50PFQsIHZvaWQ+KHVuZGVmaW5lZCwgY2IgPT4ge1xuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoIWhhc1ZhbHVlKSB7XG5cdFx0XHRcdGhhc1ZhbHVlID0gdHJ1ZTtcblx0XHRcdFx0bGFzdFZhbHVlID0gdmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGltZW91dCkge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkZWJvdW5jZUR1cmF0aW9uID0gdHlwZW9mIGRlYm91bmNlTXMgPT09ICdudW1iZXInID8gZGVib3VuY2VNcyA6IGRlYm91bmNlTXMobGFzdFZhbHVlLCB2YWx1ZSk7XG5cdFx0XHRcdGlmIChkZWJvdW5jZUR1cmF0aW9uID09PSAwKSB7XG5cdFx0XHRcdFx0bGFzdFZhbHVlID0gdmFsdWU7XG5cdFx0XHRcdFx0Y2IoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGxhc3RWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0XHRcdGNiKCk7XG5cdFx0XHRcdH0sIGRlYm91bmNlRHVyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0aGFzVmFsdWUgPSBmYWxzZTtcblx0XHRcdFx0bGFzdFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9LCAoKSA9PiB7XG5cdFx0aWYgKGhhc1ZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gbGFzdFZhbHVlITtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIG9ic2VydmFibGUuZ2V0KCk7XG5cdFx0fVxuXHR9LCBkZWJ1Z0xvY2F0aW9uKTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGFuIG9ic2VydmFibGUgdGhhdCB0aHJvdHRsZXMgdGhlIGlucHV0IG9ic2VydmFibGUuXG4gKiBVbmxpa2Uge0BsaW5rIGRlYm91bmNlZE9ic2VydmFibGV9LCB0aGUgdGltZXIgc3RhcnRzIG9uIHRoZSBmaXJzdCBjaGFuZ2VcbiAqIGFuZCBpcyBub3QgcmVzZXQgYnkgc3Vic2VxdWVudCBjaGFuZ2VzLCBwcmV2ZW50aW5nIHN0YXJ2YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0aHJvdHRsZWRPYnNlcnZhYmxlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+LCB0aHJvdHRsZU1zOiBudW1iZXIsIGRlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpOiBJT2JzZXJ2YWJsZTxUPiB7XG5cdGxldCBoYXNWYWx1ZSA9IGZhbHNlO1xuXHRsZXQgbGFzdFZhbHVlOiBUIHwgdW5kZWZpbmVkO1xuXG5cdGxldCB0aW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50PFQsIHZvaWQ+KHVuZGVmaW5lZCwgY2IgPT4ge1xuXHRcdGNvbnN0IGQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoIWhhc1ZhbHVlKSB7XG5cdFx0XHRcdGhhc1ZhbHVlID0gdHJ1ZTtcblx0XHRcdFx0bGFzdFZhbHVlID0gdmFsdWU7XG5cdFx0XHR9IGVsc2UgaWYgKCF0aW1lb3V0KSB7XG5cdFx0XHRcdC8vIE9ubHkgc3RhcnQgYSB0aW1lciBpZiBvbmUgaXNuJ3QgYWxyZWFkeSBydW5uaW5nXG5cdFx0XHRcdHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGxhc3RWYWx1ZSA9IG9ic2VydmFibGUucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGNiKCk7XG5cdFx0XHRcdH0sIHRocm90dGxlTXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHRpbWVvdXQpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdFx0dGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRoYXNWYWx1ZSA9IGZhbHNlO1xuXHRcdFx0XHRsYXN0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH0sICgpID0+IHtcblx0XHRpZiAoaGFzVmFsdWUpIHtcblx0XHRcdHJldHVybiBsYXN0VmFsdWUhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZS5nZXQoKTtcblx0XHR9XG5cdH0sIGRlYnVnTG9jYXRpb24pO1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYW4gb2JzZXJ2YWJsZSB0aGF0IGRlYm91bmNlcyB0aGUgaW5wdXQgb2JzZXJ2YWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlYm91bmNlZE9ic2VydmFibGUyPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+LCBkZWJvdW5jZU1zOiBudW1iZXIgfCAoKGN1cnJlbnRWYWx1ZTogVCB8IHVuZGVmaW5lZCwgbmV3VmFsdWU6IFQpID0+IG51bWJlciksIGRlYnVnTG9jYXRpb24gPSBEZWJ1Z0xvY2F0aW9uLm9mQ2FsbGVyKCkpOiBJT2JzZXJ2YWJsZTxUPiB7XG5cdGNvbnN0IHMgPSBvYnNlcnZhYmxlU2lnbmFsKCdoYW5kbGVUaW1lb3V0Jyk7XG5cblx0bGV0IGN1cnJlbnRWYWx1ZTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IHRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3QgZCA9IGRlcml2ZWRPcHRzKHtcblx0XHRvd25lcjogdW5kZWZpbmVkLFxuXHRcdG9uTGFzdE9ic2VydmVyUmVtb3ZlZDogKCkgPT4ge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSwgcmVhZGVyID0+IHtcblx0XHRjb25zdCB2YWwgPSBvYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRzLnJlYWQocmVhZGVyKTtcblxuXHRcdGlmICh2YWwgIT09IGN1cnJlbnRWYWx1ZSkge1xuXHRcdFx0Y29uc3QgZGVib3VuY2VEdXJhdGlvbiA9IHR5cGVvZiBkZWJvdW5jZU1zID09PSAnbnVtYmVyJyA/IGRlYm91bmNlTXMgOiBkZWJvdW5jZU1zKGN1cnJlbnRWYWx1ZSwgdmFsKTtcblxuXHRcdFx0aWYgKGRlYm91bmNlRHVyYXRpb24gPT09IDApIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gdmFsO1xuXHRcdFx0XHRyZXR1cm4gdmFsO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGltZW91dCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHR9XG5cdFx0XHR0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGN1cnJlbnRWYWx1ZSA9IHZhbDtcblx0XHRcdFx0cy50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0XHR9LCBkZWJvdW5jZUR1cmF0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmVudFZhbHVlITtcblx0fSwgZGVidWdMb2NhdGlvbik7XG5cblx0cmV0dXJuIGQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YXNFdmVudFRyaWdnZXJlZFJlY2VudGx5KGV2ZW50OiBFdmVudDxhbnk+LCB0aW1lb3V0TXM6IG51bWJlciwgZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdGNvbnN0IG9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3RyaWdnZXJlZFJlY2VudGx5JywgZmFsc2UpO1xuXG5cdGxldCB0aW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQoZXZlbnQoKCkgPT4ge1xuXHRcdG9ic2VydmFibGUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRpZiAodGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdH1cblx0XHR0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRvYnNlcnZhYmxlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9LCB0aW1lb3V0TXMpO1xuXHR9KSk7XG5cblx0cmV0dXJuIG9ic2VydmFibGU7XG59XG5cbi8qKlxuICogVGhpcyBtYWtlcyBzdXJlIHRoZSBvYnNlcnZhYmxlIGlzIGJlaW5nIG9ic2VydmVkIGFuZCBrZWVwcyBpdHMgY2FjaGUgYWxpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBrZWVwT2JzZXJ2ZWQ8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG8gPSBuZXcgS2VlcEFsaXZlT2JzZXJ2ZXIoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdG9ic2VydmFibGUuYWRkT2JzZXJ2ZXIobyk7XG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdG9ic2VydmFibGUucmVtb3ZlT2JzZXJ2ZXIobyk7XG5cdH0pO1xufVxuXG5fc2V0S2VlcE9ic2VydmVkKGtlZXBPYnNlcnZlZCk7XG5cbi8qKlxuICogVGhpcyBjb252ZXJ0cyB0aGUgZ2l2ZW4gb2JzZXJ2YWJsZSBpbnRvIGFuIGF1dG9ydW4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPiwgaGFuZGxlVmFsdWU/OiAodmFsdWU6IFQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG8gPSBuZXcgS2VlcEFsaXZlT2JzZXJ2ZXIodHJ1ZSwgaGFuZGxlVmFsdWUpO1xuXHRvYnNlcnZhYmxlLmFkZE9ic2VydmVyKG8pO1xuXHR0cnkge1xuXHRcdG8uYmVnaW5VcGRhdGUob2JzZXJ2YWJsZSk7XG5cdH0gZmluYWxseSB7XG5cdFx0by5lbmRVcGRhdGUob2JzZXJ2YWJsZSk7XG5cdH1cblxuXHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRvYnNlcnZhYmxlLnJlbW92ZU9ic2VydmVyKG8pO1xuXHR9KTtcbn1cblxuX3NldFJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKTtcblxuZXhwb3J0IGNsYXNzIEtlZXBBbGl2ZU9ic2VydmVyIGltcGxlbWVudHMgSU9ic2VydmVyIHtcblx0cHJpdmF0ZSBfY291bnRlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9yY2VSZWNvbXB1dGU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlVmFsdWU6ICgodmFsdWU6IGFueSkgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0YmVnaW5VcGRhdGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb3VudGVyKys7XG5cdH1cblxuXHRlbmRVcGRhdGU8VD4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGU8VD4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY291bnRlciA9PT0gMSAmJiB0aGlzLl9mb3JjZVJlY29tcHV0ZSkge1xuXHRcdFx0aWYgKHRoaXMuX2hhbmRsZVZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVZhbHVlKG9ic2VydmFibGUuZ2V0KCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b2JzZXJ2YWJsZS5yZXBvcnRDaGFuZ2VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NvdW50ZXItLTtcblx0fVxuXG5cdGhhbmRsZVBvc3NpYmxlQ2hhbmdlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogdm9pZCB7XG5cdFx0Ly8gTk8gT1Bcblx0fVxuXG5cdGhhbmRsZUNoYW5nZTxULCBUQ2hhbmdlPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8VCwgVENoYW5nZT4sIGNoYW5nZTogVENoYW5nZSk6IHZvaWQge1xuXHRcdC8vIE5PIE9QXG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPFQ+KG93bmVyOiBEZWJ1Z093bmVyLCBjb21wdXRlRm46IChyZWFkZXI6IElSZWFkZXIsIGxhc3RWYWx1ZTogVCB8IHVuZGVmaW5lZCkgPT4gVCk6IElPYnNlcnZhYmxlPFQ+IHtcblx0bGV0IGxhc3RWYWx1ZTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29uc3Qgb2JzZXJ2YWJsZSA9IGRlcml2ZWRPcHRzKHsgb3duZXIsIGRlYnVnUmVmZXJlbmNlRm46IGNvbXB1dGVGbiB9LCByZWFkZXIgPT4ge1xuXHRcdGxhc3RWYWx1ZSA9IGNvbXB1dGVGbihyZWFkZXIsIGxhc3RWYWx1ZSk7XG5cdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0fSk7XG5cdHJldHVybiBvYnNlcnZhYmxlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlZE9ic2VydmFibGVXaXRoV3JpdGFibGVDYWNoZTxUPihvd25lcjogb2JqZWN0LCBjb21wdXRlRm46IChyZWFkZXI6IElSZWFkZXIsIGxhc3RWYWx1ZTogVCB8IHVuZGVmaW5lZCkgPT4gVCk6IElPYnNlcnZhYmxlPFQ+XG5cdCYgeyBjbGVhckNhY2hlKHRyYW5zYWN0aW9uOiBJVHJhbnNhY3Rpb24pOiB2b2lkOyBzZXRDYWNoZShuZXdWYWx1ZTogVCB8IHVuZGVmaW5lZCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQgfSB7XG5cdGxldCBsYXN0VmFsdWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGNvbnN0IG9uQ2hhbmdlID0gb2JzZXJ2YWJsZVNpZ25hbCgnZGVyaXZlZE9ic2VydmFibGVXaXRoV3JpdGFibGVDYWNoZScpO1xuXHRjb25zdCBvYnNlcnZhYmxlID0gZGVyaXZlZChvd25lciwgcmVhZGVyID0+IHtcblx0XHRvbkNoYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0bGFzdFZhbHVlID0gY29tcHV0ZUZuKHJlYWRlciwgbGFzdFZhbHVlKTtcblx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHR9KTtcblx0cmV0dXJuIE9iamVjdC5hc3NpZ24ob2JzZXJ2YWJsZSwge1xuXHRcdGNsZWFyQ2FjaGU6ICh0eDogSVRyYW5zYWN0aW9uKSA9PiB7XG5cdFx0XHRsYXN0VmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRvbkNoYW5nZS50cmlnZ2VyKHR4KTtcblx0XHR9LFxuXHRcdHNldENhY2hlOiAobmV3VmFsdWU6IFQgfCB1bmRlZmluZWQsIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGxhc3RWYWx1ZSA9IG5ld1ZhbHVlO1xuXHRcdFx0b25DaGFuZ2UudHJpZ2dlcih0eCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuLyoqXG4gKiBXaGVuIHRoZSBpdGVtcyBhcnJheSBjaGFuZ2VzLCByZWZlcmVudGlhbCBlcXVhbCBpdGVtcyBhcmUgbm90IG1hcHBlZCBhZ2Fpbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcE9ic2VydmFibGVBcnJheUNhY2hlZDxUSW4sIFRPdXQsIFRLZXkgPSBUSW4+KG93bmVyOiBEZWJ1Z093bmVyLCBpdGVtczogSU9ic2VydmFibGU8cmVhZG9ubHkgVEluW10+LCBtYXA6IChpbnB1dDogVEluLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKSA9PiBUT3V0LCBrZXlTZWxlY3Rvcj86IChpbnB1dDogVEluKSA9PiBUS2V5KTogSU9ic2VydmFibGU8cmVhZG9ubHkgVE91dFtdPiB7XG5cdGxldCBtID0gbmV3IEFycmF5TWFwKG1hcCwga2V5U2VsZWN0b3IpO1xuXHRjb25zdCBzZWxmID0gZGVyaXZlZE9wdHMoe1xuXHRcdGRlYnVnUmVmZXJlbmNlRm46IG1hcCxcblx0XHRvd25lcixcblx0XHRvbkxhc3RPYnNlcnZlclJlbW92ZWQ6ICgpID0+IHtcblx0XHRcdG0uZGlzcG9zZSgpO1xuXHRcdFx0bSA9IG5ldyBBcnJheU1hcChtYXApO1xuXHRcdH1cblx0fSwgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IGkgPSBpdGVtcy5yZWFkKHJlYWRlcik7XG5cdFx0bS5zZXRJdGVtcyhpKTtcblx0XHRyZXR1cm4gbS5nZXRJdGVtcygpO1xuXHR9KTtcblx0cmV0dXJuIHNlbGY7XG59XG5cbmNsYXNzIEFycmF5TWFwPFRJbiwgVE91dCwgVEtleT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IE1hcDxUS2V5LCB7IG91dDogVE91dDsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9PigpO1xuXHRwcml2YXRlIF9pdGVtczogVE91dFtdID0gW107XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcDogKGlucHV0OiBUSW4sIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpID0+IFRPdXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfa2V5U2VsZWN0b3I/OiAoaW5wdXQ6IFRJbikgPT4gVEtleSxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZS5mb3JFYWNoKGVudHJ5ID0+IGVudHJ5LnN0b3JlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fY2FjaGUuY2xlYXIoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRJdGVtcyhpdGVtczogcmVhZG9ubHkgVEluW10pOiB2b2lkIHtcblx0XHRjb25zdCBuZXdJdGVtczogVE91dFtdID0gW107XG5cdFx0Y29uc3QgaXRlbXNUb1JlbW92ZSA9IG5ldyBTZXQodGhpcy5fY2FjaGUua2V5cygpKTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5U2VsZWN0b3IgPyB0aGlzLl9rZXlTZWxlY3RvcihpdGVtKSA6IGl0ZW0gYXMgdW5rbm93biBhcyBUS2V5O1xuXG5cdFx0XHRsZXQgZW50cnkgPSB0aGlzLl9jYWNoZS5nZXQoa2V5KTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IG91dCA9IHRoaXMuX21hcChpdGVtLCBzdG9yZSk7XG5cdFx0XHRcdGVudHJ5ID0geyBvdXQsIHN0b3JlIH07XG5cdFx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIGVudHJ5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGl0ZW1zVG9SZW1vdmUuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0XHRuZXdJdGVtcy5wdXNoKGVudHJ5Lm91dCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGl0ZW1zVG9SZW1vdmUpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fY2FjaGUuZ2V0KGl0ZW0pITtcblx0XHRcdGVudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpdGVtKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pdGVtcyA9IG5ld0l0ZW1zO1xuXHR9XG5cblx0cHVibGljIGdldEl0ZW1zKCk6IFRPdXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1zO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc09ic2VydmFibGU8VD4ob2JqOiB1bmtub3duKTogb2JqIGlzIElPYnNlcnZhYmxlPFQ+IHtcblx0cmV0dXJuICEhb2JqICYmICg8SU9ic2VydmFibGU8VD4+b2JqKS5yZWFkICE9PSB1bmRlZmluZWQgJiYgKDxJT2JzZXJ2YWJsZTxUPj5vYmopLnJlcG9ydENoYW5nZXMgIT09IHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUV4QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGlCQUFxQyxvQkFBb0I7QUFDbEUsU0FBUyxTQUFTLG1CQUFtQjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQix5Q0FBeUM7QUFDcEUsU0FBUyxxQkFBcUI7QUFFdkIsU0FBUyxzQkFBeUIsU0FBaUQ7QUFDekYsUUFBTSxhQUFhLGdCQUErQixnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3BFLFVBQVEsS0FBSyxDQUFDLFVBQVU7QUFDdkIsZUFBVyxJQUFJLEVBQUUsTUFBTSxHQUFHLE1BQVM7QUFBQSxFQUNwQyxDQUFDO0FBQ0QsU0FBTztBQUNSO0FBRU8sU0FBUyxxQkFBd0IsT0FBK0IsWUFBK0M7QUFDckgsU0FBTyxZQUFZO0FBQUEsSUFDbEI7QUFBQSxJQUNBLFVBQVUsTUFBTTtBQUFBLEVBQ2pCLEdBQUcsWUFBVTtBQUNaLGVBQVcsS0FBSyxNQUFNO0FBQUEsRUFDdkIsQ0FBQztBQUNGO0FBS08s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QUFBLElBQ2xCO0FBQUEsSUFDQSx1QkFBdUIsTUFBTTtBQUM1QixRQUFFLFFBQVE7QUFDVixVQUFJLElBQUksU0FBUyxHQUFHO0FBQUEsSUFDckI7QUFBQSxFQUNELEdBQUcsQ0FBQyxXQUFXO0FBQ2QsVUFBTSxJQUFJLE1BQU0sS0FBSyxNQUFNO0FBQzNCLE1BQUUsU0FBUyxDQUFDO0FBQ1osV0FBTyxFQUFFLFNBQVM7QUFBQSxFQUNuQixDQUFDO0FBQ0QsU0FBTztBQUNSO0FBRUEsTUFBTSxTQUFpRDtBQUFBLEVBR3RELFlBQ2tCLE1BQ0EsY0FDaEI7QUFGZ0I7QUFDQTtBQUpsQixTQUFpQixTQUFTLG9CQUFJLElBQWlEO0FBQy9FLFNBQVEsU0FBaUIsQ0FBQztBQUFBLEVBSzFCO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixTQUFLLE9BQU8sUUFBUSxXQUFTLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDbEQsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBRU8sU0FBUyxPQUE2QjtBQUM1QyxVQUFNLFdBQW1CLENBQUM7QUFDMUIsVUFBTSxnQkFBZ0IsSUFBSSxJQUFJLEtBQUssT0FBTyxLQUFLLENBQUM7QUFFaEQsZUFBVyxRQUFRLE9BQU87QUFDekIsWUFBTSxNQUFNLEtBQUssZUFBZSxLQUFLLGFBQWEsSUFBSSxJQUFJO0FBRTFELFVBQUksUUFBUSxLQUFLLE9BQU8sSUFBSSxHQUFHO0FBQy9CLFVBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLGNBQU0sTUFBTSxLQUFLLEtBQUssTUFBTSxLQUFLO0FBQ2pDLGdCQUFRLEVBQUUsS0FBSyxNQUFNO0FBQ3JCLGFBQUssT0FBTyxJQUFJLEtBQUssS0FBSztBQUFBLE1BQzNCLE9BQU87QUFDTixzQkFBYyxPQUFPLEdBQUc7QUFBQSxNQUN6QjtBQUNBLGVBQVMsS0FBSyxNQUFNLEdBQUc7QUFBQSxJQUN4QjtBQUVBLGVBQVcsUUFBUSxlQUFlO0FBQ2pDLFlBQU0sUUFBUSxLQUFLLE9BQU8sSUFBSSxJQUFJO0FBQ2xDLFlBQU0sTUFBTSxRQUFRO0FBQ3BCLFdBQUssT0FBTyxPQUFPLElBQUk7QUFBQSxJQUN4QjtBQUVBLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQUVPLFdBQW1CO0FBQ3pCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVPLFNBQVMsYUFBZ0IsS0FBcUM7QUFDcEUsU0FBTyxDQUFDLENBQUMsT0FBd0IsSUFBSyxTQUFTLFVBQThCLElBQUssa0JBQWtCO0FBQ3JHOyIsCiAgIm5hbWVzIjogW10KfQo=
