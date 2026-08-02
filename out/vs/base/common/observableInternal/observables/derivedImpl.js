import { BaseObservable } from "./baseObservable.js";
import { BugIndicatingError, DisposableStore, assertFn, onBugIndicatingError } from "../commonFacade/deps.js";
import { getLogger } from "../logging/logging.js";
var DerivedState = /* @__PURE__ */ ((DerivedState2) => {
  DerivedState2[DerivedState2["initial"] = 0] = "initial";
  DerivedState2[DerivedState2["dependenciesMightHaveChanged"] = 1] = "dependenciesMightHaveChanged";
  DerivedState2[DerivedState2["stale"] = 2] = "stale";
  DerivedState2[DerivedState2["upToDate"] = 3] = "upToDate";
  return DerivedState2;
})(DerivedState || {});
function derivedStateToString(state) {
  switch (state) {
    case 0 /* initial */:
      return "initial";
    case 1 /* dependenciesMightHaveChanged */:
      return "dependenciesMightHaveChanged";
    case 2 /* stale */:
      return "stale";
    case 3 /* upToDate */:
      return "upToDate";
    default:
      return "<unknown>";
  }
}
class Derived extends BaseObservable {
  constructor(_debugNameData, _computeFn, _changeTracker, _handleLastObserverRemoved = void 0, _equalityComparator, debugLocation) {
    super(debugLocation);
    this._debugNameData = _debugNameData;
    this._computeFn = _computeFn;
    this._changeTracker = _changeTracker;
    this._handleLastObserverRemoved = _handleLastObserverRemoved;
    this._equalityComparator = _equalityComparator;
    this._state = 0 /* initial */;
    this._value = void 0;
    this._updateCount = 0;
    this._dependencies = /* @__PURE__ */ new Set();
    this._dependenciesToBeRemoved = /* @__PURE__ */ new Set();
    this._changeSummary = void 0;
    this._isUpdating = false;
    this._isComputing = false;
    this._didReportChange = false;
    this._isInBeforeUpdate = false;
    this._isReaderValid = false;
    this._store = void 0;
    this._delayedStore = void 0;
    this._removedObserverToCallEndUpdateOn = null;
    this._changeSummary = this._changeTracker?.createChangeSummary(void 0);
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "(anonymous)";
  }
  onLastObserverRemoved() {
    this._state = 0 /* initial */;
    this._value = void 0;
    getLogger()?.handleDerivedCleared(this);
    for (const d of this._dependencies) {
      d.removeObserver(this);
    }
    this._dependencies.clear();
    if (this._store !== void 0) {
      this._store.dispose();
      this._store = void 0;
    }
    if (this._delayedStore !== void 0) {
      this._delayedStore.dispose();
      this._delayedStore = void 0;
    }
    this._handleLastObserverRemoved?.();
  }
  get() {
    const checkEnabled = false;
    if (this._isComputing && checkEnabled) {
      throw new BugIndicatingError("Cyclic deriveds are not supported yet!");
    }
    if (this._observers.size === 0) {
      let result;
      try {
        this._isReaderValid = true;
        let changeSummary = void 0;
        if (this._changeTracker) {
          changeSummary = this._changeTracker.createChangeSummary(void 0);
          this._changeTracker.beforeUpdate?.(this, changeSummary);
        }
        result = this._computeFn(this, changeSummary);
      } finally {
        this._isReaderValid = false;
      }
      this.onLastObserverRemoved();
      return result;
    } else {
      do {
        if (this._state === 1 /* dependenciesMightHaveChanged */) {
          for (const d of this._dependencies) {
            d.reportChanges();
            if (this._state === 2 /* stale */) {
              break;
            }
          }
        }
        if (this._state === 1 /* dependenciesMightHaveChanged */) {
          this._state = 3 /* upToDate */;
        }
        if (this._state !== 3 /* upToDate */) {
          this._recompute();
        }
      } while (this._state !== 3 /* upToDate */);
      return this._value;
    }
  }
  _recompute() {
    let didChange = false;
    this._isComputing = true;
    this._didReportChange = false;
    const emptySet = this._dependenciesToBeRemoved;
    this._dependenciesToBeRemoved = this._dependencies;
    this._dependencies = emptySet;
    try {
      const changeSummary = this._changeSummary;
      this._isReaderValid = true;
      if (this._changeTracker) {
        this._isInBeforeUpdate = true;
        this._changeTracker.beforeUpdate?.(this, changeSummary);
        this._isInBeforeUpdate = false;
        this._changeSummary = this._changeTracker?.createChangeSummary(changeSummary);
      }
      const hadValue = this._state !== 0 /* initial */;
      const oldValue = this._value;
      this._state = 3 /* upToDate */;
      const delayedStore = this._delayedStore;
      if (delayedStore !== void 0) {
        this._delayedStore = void 0;
      }
      try {
        if (this._store !== void 0) {
          this._store.dispose();
          this._store = void 0;
        }
        this._value = this._computeFn(this, changeSummary);
      } finally {
        this._isReaderValid = false;
        for (const o of this._dependenciesToBeRemoved) {
          o.removeObserver(this);
        }
        this._dependenciesToBeRemoved.clear();
        if (delayedStore !== void 0) {
          delayedStore.dispose();
        }
      }
      didChange = this._didReportChange || hadValue && !this._equalityComparator(oldValue, this._value);
      getLogger()?.handleObservableUpdated(this, {
        oldValue,
        newValue: this._value,
        change: void 0,
        didChange,
        hadValue
      });
    } catch (e) {
      onBugIndicatingError(e);
    }
    this._isComputing = false;
    if (!this._didReportChange && didChange) {
      for (const r of this._observers) {
        r.handleChange(this, void 0);
      }
    } else {
      this._didReportChange = false;
    }
  }
  toString() {
    return `LazyDerived<${this.debugName}>`;
  }
  // IObserver Implementation
  beginUpdate(_observable) {
    if (this._isUpdating) {
      throw new BugIndicatingError("Cyclic deriveds are not supported yet!");
    }
    this._updateCount++;
    this._isUpdating = true;
    try {
      const propagateBeginUpdate = this._updateCount === 1;
      if (this._state === 3 /* upToDate */) {
        this._state = 1 /* dependenciesMightHaveChanged */;
        if (!propagateBeginUpdate) {
          for (const r of this._observers) {
            r.handlePossibleChange(this);
          }
        }
      }
      if (propagateBeginUpdate) {
        for (const r of this._observers) {
          r.beginUpdate(this);
        }
      }
    } finally {
      this._isUpdating = false;
    }
  }
  endUpdate(_observable) {
    this._updateCount--;
    if (this._updateCount === 0) {
      const observers = [...this._observers];
      for (const r of observers) {
        r.endUpdate(this);
      }
      if (this._removedObserverToCallEndUpdateOn) {
        const observers2 = [...this._removedObserverToCallEndUpdateOn];
        this._removedObserverToCallEndUpdateOn = null;
        for (const r of observers2) {
          r.endUpdate(this);
        }
      }
    }
    assertFn(() => this._updateCount >= 0);
  }
  handlePossibleChange(observable) {
    if (this._state === 3 /* upToDate */ && this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable)) {
      this._state = 1 /* dependenciesMightHaveChanged */;
      for (const r of this._observers) {
        r.handlePossibleChange(this);
      }
    }
  }
  handleChange(observable, change) {
    if (this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable) || this._isInBeforeUpdate) {
      getLogger()?.handleDerivedDependencyChanged(this, observable, change);
      let shouldReact = false;
      try {
        shouldReact = this._changeTracker ? this._changeTracker.handleChange({
          changedObservable: observable,
          change,
          // eslint-disable-next-line local/code-no-any-casts
          didChange: (o) => o === observable
        }, this._changeSummary) : true;
      } catch (e) {
        onBugIndicatingError(e);
      }
      const wasUpToDate = this._state === 3 /* upToDate */;
      if (shouldReact && (this._state === 1 /* dependenciesMightHaveChanged */ || wasUpToDate)) {
        this._state = 2 /* stale */;
        if (wasUpToDate) {
          for (const r of this._observers) {
            r.handlePossibleChange(this);
          }
        }
      }
    }
  }
  // IReader Implementation
  _ensureReaderValid() {
    if (!this._isReaderValid) {
      throw new BugIndicatingError("The reader object cannot be used outside its compute function!");
    }
  }
  readObservable(observable) {
    this._ensureReaderValid();
    observable.addObserver(this);
    const value = observable.get();
    this._dependencies.add(observable);
    this._dependenciesToBeRemoved.delete(observable);
    return value;
  }
  reportChange(change) {
    this._ensureReaderValid();
    this._didReportChange = true;
    for (const r of this._observers) {
      r.handleChange(this, change);
    }
  }
  get store() {
    this._ensureReaderValid();
    if (this._store === void 0) {
      this._store = new DisposableStore();
    }
    return this._store;
  }
  get delayedStore() {
    this._ensureReaderValid();
    if (this._delayedStore === void 0) {
      this._delayedStore = new DisposableStore();
    }
    return this._delayedStore;
  }
  addObserver(observer) {
    const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCount > 0;
    super.addObserver(observer);
    if (shouldCallBeginUpdate) {
      if (!this._removedObserverToCallEndUpdateOn?.delete(observer)) {
        observer.beginUpdate(this);
      }
    }
  }
  removeObserver(observer) {
    if (this._observers.has(observer) && this._updateCount > 0) {
      if (!this._removedObserverToCallEndUpdateOn) {
        this._removedObserverToCallEndUpdateOn = /* @__PURE__ */ new Set();
      }
      this._removedObserverToCallEndUpdateOn.add(observer);
    }
    super.removeObserver(observer);
  }
  debugGetState() {
    return {
      state: this._state,
      stateStr: derivedStateToString(this._state),
      updateCount: this._updateCount,
      isComputing: this._isComputing,
      dependencies: this._dependencies,
      value: this._value
    };
  }
  debugSetValue(newValue) {
    this._value = newValue;
  }
  debugRecompute() {
    this.beginUpdate(this);
    try {
      if (!this._isComputing) {
        this._recompute();
      } else {
        this._state = 2 /* stale */;
      }
    } finally {
      this.endUpdate(this);
    }
  }
  setValue(newValue, tx, change) {
    this._value = newValue;
    const observers = this._observers;
    tx.updateObserver(this, this);
    for (const d of observers) {
      d.handleChange(this, change);
    }
  }
}
class DerivedWithSetter extends Derived {
  constructor(debugNameData, computeFn, changeTracker, handleLastObserverRemoved = void 0, equalityComparator, set, debugLocation) {
    super(
      debugNameData,
      computeFn,
      changeTracker,
      handleLastObserverRemoved,
      equalityComparator,
      debugLocation
    );
    this.set = set;
  }
}
export {
  Derived,
  DerivedState,
  DerivedWithSetter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9vYnNlcnZhYmxlcy9kZXJpdmVkSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElPYnNlcnZlciwgSVJlYWRlcldpdGhTdG9yZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCB9IGZyb20gJy4uL2Jhc2UuanMnO1xuaW1wb3J0IHsgQmFzZU9ic2VydmFibGUgfSBmcm9tICcuL2Jhc2VPYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IERlYnVnTmFtZURhdGEgfSBmcm9tICcuLi9kZWJ1Z05hbWUuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBEaXNwb3NhYmxlU3RvcmUsIEVxdWFsaXR5Q29tcGFyZXIsIGFzc2VydEZuLCBvbkJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uL2NvbW1vbkZhY2FkZS9kZXBzLmpzJztcbmltcG9ydCB7IGdldExvZ2dlciB9IGZyb20gJy4uL2xvZ2dpbmcvbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBJQ2hhbmdlVHJhY2tlciB9IGZyb20gJy4uL2NoYW5nZVRyYWNrZXIuanMnO1xuaW1wb3J0IHsgRGVidWdMb2NhdGlvbiB9IGZyb20gJy4uL2RlYnVnTG9jYXRpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEZXJpdmVkUmVhZGVyPFRDaGFuZ2UgPSB2b2lkPiBleHRlbmRzIElSZWFkZXJXaXRoU3RvcmUge1xuXHQvKipcblx0ICogQ2FsbCB0aGlzIHRvIHJlcG9ydCBhIGNoYW5nZSBkZWx0YSBvciB0byBmb3JjZSByZXBvcnQgYSBjaGFuZ2UsIGV2ZW4gaWYgdGhlIG5ldyB2YWx1ZSBpcyB0aGUgc2FtZSBhcyB0aGUgb2xkIHZhbHVlLlxuXHQqL1xuXHRyZXBvcnRDaGFuZ2UoY2hhbmdlOiBUQ2hhbmdlKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRGVyaXZlZFN0YXRlIHtcblx0LyoqIEluaXRpYWwgc3RhdGUsIG5vIHByZXZpb3VzIHZhbHVlLCByZWNvbXB1dGF0aW9uIG5lZWRlZCAqL1xuXHRpbml0aWFsID0gMCxcblxuXHQvKipcblx0ICogQSBkZXBlbmRlbmN5IGNvdWxkIGhhdmUgY2hhbmdlZC5cblx0ICogV2UgbmVlZCB0byBleHBsaWNpdGx5IGFzayB0aGVtIGlmIGF0IGxlYXN0IG9uZSBkZXBlbmRlbmN5IGNoYW5nZWQuXG5cdCAqL1xuXHRkZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkID0gMSxcblxuXHQvKipcblx0ICogQSBkZXBlbmRlbmN5IGNoYW5nZWQgYW5kIHdlIG5lZWQgdG8gcmVjb21wdXRlLlxuXHQgKiBBZnRlciByZWNvbXB1dGF0aW9uLCB3ZSBuZWVkIHRvIGNoZWNrIHRoZSBwcmV2aW91cyB2YWx1ZSB0byBzZWUgaWYgd2UgY2hhbmdlZCBhcyB3ZWxsLlxuXHQgKi9cblx0c3RhbGUgPSAyLFxuXG5cdC8qKlxuXHQgKiBObyBjaGFuZ2UgcmVwb3J0ZWQsIG91ciBjYWNoZWQgdmFsdWUgaXMgdXAgdG8gZGF0ZS5cblx0ICovXG5cdHVwVG9EYXRlID0gMyxcbn1cblxuZnVuY3Rpb24gZGVyaXZlZFN0YXRlVG9TdHJpbmcoc3RhdGU6IERlcml2ZWRTdGF0ZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdGUpIHtcblx0XHRjYXNlIERlcml2ZWRTdGF0ZS5pbml0aWFsOiByZXR1cm4gJ2luaXRpYWwnO1xuXHRcdGNhc2UgRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQ6IHJldHVybiAnZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZCc7XG5cdFx0Y2FzZSBEZXJpdmVkU3RhdGUuc3RhbGU6IHJldHVybiAnc3RhbGUnO1xuXHRcdGNhc2UgRGVyaXZlZFN0YXRlLnVwVG9EYXRlOiByZXR1cm4gJ3VwVG9EYXRlJztcblx0XHRkZWZhdWx0OiByZXR1cm4gJzx1bmtub3duPic7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlcml2ZWQ8VCwgVENoYW5nZVN1bW1hcnkgPSBhbnksIFRDaGFuZ2UgPSB2b2lkPiBleHRlbmRzIEJhc2VPYnNlcnZhYmxlPFQsIFRDaGFuZ2U+IGltcGxlbWVudHMgSURlcml2ZWRSZWFkZXI8VENoYW5nZT4sIElPYnNlcnZlciB7XG5cdHByaXZhdGUgX3N0YXRlID0gRGVyaXZlZFN0YXRlLmluaXRpYWw7XG5cdHByaXZhdGUgX3ZhbHVlOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91cGRhdGVDb3VudCA9IDA7XG5cdHByaXZhdGUgX2RlcGVuZGVuY2llcyA9IG5ldyBTZXQ8SU9ic2VydmFibGU8YW55Pj4oKTtcblx0cHJpdmF0ZSBfZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQgPSBuZXcgU2V0PElPYnNlcnZhYmxlPGFueT4+KCk7XG5cdHByaXZhdGUgX2NoYW5nZVN1bW1hcnk6IFRDaGFuZ2VTdW1tYXJ5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc1VwZGF0aW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzQ29tcHV0aW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2RpZFJlcG9ydENoYW5nZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0luQmVmb3JlVXBkYXRlID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUmVhZGVyVmFsaWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVsYXllZFN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uOiBTZXQ8SU9ic2VydmVyPiB8IG51bGwgPSBudWxsO1xuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgZGVidWdOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnTmFtZURhdGEuZ2V0RGVidWdOYW1lKHRoaXMpID8/ICcoYW5vbnltb3VzKSc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgX2RlYnVnTmFtZURhdGE6IERlYnVnTmFtZURhdGEsXG5cdFx0cHVibGljIHJlYWRvbmx5IF9jb21wdXRlRm46IChyZWFkZXI6IElEZXJpdmVkUmVhZGVyPFRDaGFuZ2U+LCBjaGFuZ2VTdW1tYXJ5OiBUQ2hhbmdlU3VtbWFyeSkgPT4gVCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VUcmFja2VyOiBJQ2hhbmdlVHJhY2tlcjxUQ2hhbmdlU3VtbWFyeT4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlTGFzdE9ic2VydmVyUmVtb3ZlZDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VxdWFsaXR5Q29tcGFyYXRvcjogRXF1YWxpdHlDb21wYXJlcjxUPixcblx0XHRkZWJ1Z0xvY2F0aW9uOiBEZWJ1Z0xvY2F0aW9uLFxuXHQpIHtcblx0XHRzdXBlcihkZWJ1Z0xvY2F0aW9uKTtcblx0XHR0aGlzLl9jaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlVHJhY2tlcj8uY3JlYXRlQ2hhbmdlU3VtbWFyeSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uTGFzdE9ic2VydmVyUmVtb3ZlZCgpOiB2b2lkIHtcblx0XHQvKipcblx0XHQgKiBXZSBhcmUgbm90IHRyYWNraW5nIGNoYW5nZXMgYW55bW9yZSwgdGh1cyB3ZSBoYXZlIHRvIGFzc3VtZVxuXHRcdCAqIHRoYXQgb3VyIGNhY2hlIGlzIGludmFsaWQuXG5cdFx0ICovXG5cdFx0dGhpcy5fc3RhdGUgPSBEZXJpdmVkU3RhdGUuaW5pdGlhbDtcblx0XHR0aGlzLl92YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlRGVyaXZlZENsZWFyZWQodGhpcyk7XG5cdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMuX2RlcGVuZGVuY2llcykge1xuXHRcdFx0ZC5yZW1vdmVPYnNlcnZlcih0aGlzKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVwZW5kZW5jaWVzLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fc3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc3RvcmUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWxheWVkU3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2RlbGF5ZWRTdG9yZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9oYW5kbGVMYXN0T2JzZXJ2ZXJSZW1vdmVkPy4oKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQoKTogVCB7XG5cdFx0Y29uc3QgY2hlY2tFbmFibGVkID0gZmFsc2U7IC8vIFRPRE8gc2V0IHRvIHRydWVcblx0XHRpZiAodGhpcy5faXNDb21wdXRpbmcgJiYgY2hlY2tFbmFibGVkKSB7XG5cdFx0XHQvLyBpbnZlc3RpZ2F0ZSB3aHkgdGhpcyBmYWlscyBpbiB0aGUgZGlmZiBlZGl0b3IhXG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDeWNsaWMgZGVyaXZlZHMgYXJlIG5vdCBzdXBwb3J0ZWQgeWV0IScpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9vYnNlcnZlcnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0bGV0IHJlc3VsdDtcblx0XHRcdC8vIFdpdGhvdXQgb2JzZXJ2ZXJzLCB3ZSBkb24ndCBrbm93IHdoZW4gdG8gY2xlYW4gdXAgc3R1ZmYuXG5cdFx0XHQvLyBUaHVzLCB3ZSBkb24ndCBjYWNoZSBhbnl0aGluZyB0byBwcmV2ZW50IG1lbW9yeSBsZWFrcy5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2lzUmVhZGVyVmFsaWQgPSB0cnVlO1xuXHRcdFx0XHRsZXQgY2hhbmdlU3VtbWFyeSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYW5nZVRyYWNrZXIpIHtcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlVHJhY2tlci5jcmVhdGVDaGFuZ2VTdW1tYXJ5KHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dGhpcy5fY2hhbmdlVHJhY2tlci5iZWZvcmVVcGRhdGU/Lih0aGlzLCBjaGFuZ2VTdW1tYXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLl9jb21wdXRlRm4odGhpcywgY2hhbmdlU3VtbWFyeSEpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5faXNSZWFkZXJWYWxpZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2xlYXIgbmV3IGRlcGVuZGVuY2llc1xuXHRcdFx0dGhpcy5vbkxhc3RPYnNlcnZlclJlbW92ZWQoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHQvLyBXZSBtaWdodCBub3QgZ2V0IGEgbm90aWZpY2F0aW9uIGZvciBhIGRlcGVuZGVuY3kgdGhhdCBjaGFuZ2VkIHdoaWxlIGl0IGlzIHVwZGF0aW5nLFxuXHRcdFx0XHQvLyB0aHVzIHdlIGFsc28gaGF2ZSB0byBhc2sgYWxsIG91ciBkZXBlZGVuY2llcyBpZiB0aGV5IGNoYW5nZWQgaW4gdGhpcyBjYXNlLlxuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IERlcml2ZWRTdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMuX2RlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdFx0LyoqIG1pZ2h0IGNhbGwge0BsaW5rIGhhbmRsZUNoYW5nZX0gaW5kaXJlY3RseSwgd2hpY2ggY291bGQgbWFrZSB1cyBzdGFsZSAqL1xuXHRcdFx0XHRcdFx0ZC5yZXBvcnRDaGFuZ2VzKCk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSBhcyBEZXJpdmVkU3RhdGUgPT09IERlcml2ZWRTdGF0ZS5zdGFsZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGUgb3RoZXIgZGVwZW5kZW5jaWVzIHdpbGwgcmVmcmVzaCBvbiBkZW1hbmQsIHNvIGVhcmx5IGJyZWFrXG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIGNhbGxlZCByZXBvcnQgY2hhbmdlcyBvZiBhbGwgZGVwZW5kZW5jaWVzLlxuXHRcdFx0XHQvLyBJZiB3ZSBhcmUgc3RpbGwgbm90IHN0YWxlLCB3ZSBjYW4gYXNzdW1lIHRvIGJlIHVwIHRvIGRhdGUgYWdhaW4uXG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZSA9IERlcml2ZWRTdGF0ZS51cFRvRGF0ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb21wdXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSW4gY2FzZSByZWNvbXB1dGF0aW9uIGNoYW5nZWQgb25lIG9mIG91ciBkZXBlbmRlbmNpZXMsIHdlIG5lZWQgdG8gcmVjb21wdXRlIGFnYWluLlxuXHRcdFx0fSB3aGlsZSAodGhpcy5fc3RhdGUgIT09IERlcml2ZWRTdGF0ZS51cFRvRGF0ZSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdmFsdWUhO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZSgpIHtcblx0XHRsZXQgZGlkQ2hhbmdlID0gZmFsc2U7XG5cdFx0dGhpcy5faXNDb21wdXRpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX2RpZFJlcG9ydENoYW5nZSA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgZW1wdHlTZXQgPSB0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZDtcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCA9IHRoaXMuX2RlcGVuZGVuY2llcztcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXMgPSBlbXB0eVNldDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlU3VtbWFyeSE7XG5cblx0XHRcdHRoaXMuX2lzUmVhZGVyVmFsaWQgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMuX2NoYW5nZVRyYWNrZXIpIHtcblx0XHRcdFx0dGhpcy5faXNJbkJlZm9yZVVwZGF0ZSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZVRyYWNrZXIuYmVmb3JlVXBkYXRlPy4odGhpcywgY2hhbmdlU3VtbWFyeSk7XG5cdFx0XHRcdHRoaXMuX2lzSW5CZWZvcmVVcGRhdGUgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fY2hhbmdlU3VtbWFyeSA9IHRoaXMuX2NoYW5nZVRyYWNrZXI/LmNyZWF0ZUNoYW5nZVN1bW1hcnkoY2hhbmdlU3VtbWFyeSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhhZFZhbHVlID0gdGhpcy5fc3RhdGUgIT09IERlcml2ZWRTdGF0ZS5pbml0aWFsO1xuXHRcdFx0Y29uc3Qgb2xkVmFsdWUgPSB0aGlzLl92YWx1ZTtcblx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlO1xuXG5cdFx0XHRjb25zdCBkZWxheWVkU3RvcmUgPSB0aGlzLl9kZWxheWVkU3RvcmU7XG5cdFx0XHRpZiAoZGVsYXllZFN0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0LyoqIG1pZ2h0IGNhbGwge0BsaW5rIGhhbmRsZUNoYW5nZX0gaW5kaXJlY3RseSwgd2hpY2ggY291bGQgaW52YWxpZGF0ZSB1cyAqL1xuXHRcdFx0XHR0aGlzLl92YWx1ZSA9IHRoaXMuX2NvbXB1dGVGbih0aGlzLCBjaGFuZ2VTdW1tYXJ5KTtcblxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0dGhpcy5faXNSZWFkZXJWYWxpZCA9IGZhbHNlO1xuXHRcdFx0XHQvLyBXZSBkb24ndCB3YW50IG91ciBvYnNlcnZlZCBvYnNlcnZhYmxlcyB0byB0aGluayB0aGF0IHRoZXkgYXJlIChub3QgZXZlbiB0ZW1wb3JhcmlseSkgbm90IGJlaW5nIG9ic2VydmVkLlxuXHRcdFx0XHQvLyBUaHVzLCB3ZSBvbmx5IHVuc3Vic2NyaWJlIGZyb20gb2JzZXJ2YWJsZXMgdGhhdCBhcmUgZGVmaW5pdGVseSBub3QgcmVhZCBhbnltb3JlLlxuXHRcdFx0XHRmb3IgKGNvbnN0IG8gb2YgdGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQpIHtcblx0XHRcdFx0XHRvLnJlbW92ZU9ic2VydmVyKHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkLmNsZWFyKCk7XG5cblx0XHRcdFx0aWYgKGRlbGF5ZWRTdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsYXllZFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRkaWRDaGFuZ2UgPSB0aGlzLl9kaWRSZXBvcnRDaGFuZ2UgfHwgKGhhZFZhbHVlICYmICEodGhpcy5fZXF1YWxpdHlDb21wYXJhdG9yKG9sZFZhbHVlISwgdGhpcy5fdmFsdWUpKSk7XG5cblx0XHRcdGdldExvZ2dlcigpPy5oYW5kbGVPYnNlcnZhYmxlVXBkYXRlZCh0aGlzLCB7XG5cdFx0XHRcdG9sZFZhbHVlLFxuXHRcdFx0XHRuZXdWYWx1ZTogdGhpcy5fdmFsdWUsXG5cdFx0XHRcdGNoYW5nZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRkaWRDaGFuZ2UsXG5cdFx0XHRcdGhhZFZhbHVlLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25CdWdJbmRpY2F0aW5nRXJyb3IoZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNDb21wdXRpbmcgPSBmYWxzZTtcblxuXHRcdGlmICghdGhpcy5fZGlkUmVwb3J0Q2hhbmdlICYmIGRpZENoYW5nZSkge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRyLmhhbmRsZUNoYW5nZSh0aGlzLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kaWRSZXBvcnRDaGFuZ2UgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYExhenlEZXJpdmVkPCR7dGhpcy5kZWJ1Z05hbWV9PmA7XG5cdH1cblxuXHQvLyBJT2JzZXJ2ZXIgSW1wbGVtZW50YXRpb25cblxuXHRwdWJsaWMgYmVnaW5VcGRhdGU8VD4oX29ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVXBkYXRpbmcpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0N5Y2xpYyBkZXJpdmVkcyBhcmUgbm90IHN1cHBvcnRlZCB5ZXQhJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlQ291bnQrKztcblx0XHR0aGlzLl9pc1VwZGF0aW5nID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvcGFnYXRlQmVnaW5VcGRhdGUgPSB0aGlzLl91cGRhdGVDb3VudCA9PT0gMTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gRGVyaXZlZFN0YXRlLnVwVG9EYXRlKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQ7XG5cdFx0XHRcdC8vIElmIHdlIHByb3BhZ2F0ZSBiZWdpbiB1cGRhdGUsIHRoYXQgd2lsbCBhbHJlYWR5IHNpZ25hbCBhIHBvc3NpYmxlIGNoYW5nZS5cblx0XHRcdFx0aWYgKCFwcm9wYWdhdGVCZWdpblVwZGF0ZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdFx0XHRcdHIuaGFuZGxlUG9zc2libGVDaGFuZ2UodGhpcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvcGFnYXRlQmVnaW5VcGRhdGUpIHtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRcdHIuYmVnaW5VcGRhdGUodGhpcyk7IC8vIFRoaXMgc2lnbmFscyBhIHBvc3NpYmxlIGNoYW5nZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzVXBkYXRpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZW5kVXBkYXRlPFQ+KF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdHRoaXMuX3VwZGF0ZUNvdW50LS07XG5cdFx0aWYgKHRoaXMuX3VwZGF0ZUNvdW50ID09PSAwKSB7XG5cdFx0XHQvLyBFbmQgdXBkYXRlIGNvdWxkIGNoYW5nZSB0aGUgb2JzZXJ2ZXIgbGlzdC5cblx0XHRcdGNvbnN0IG9ic2VydmVycyA9IFsuLi50aGlzLl9vYnNlcnZlcnNdO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIG9ic2VydmVycykge1xuXHRcdFx0XHRyLmVuZFVwZGF0ZSh0aGlzKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9yZW1vdmVkT2JzZXJ2ZXJUb0NhbGxFbmRVcGRhdGVPbikge1xuXHRcdFx0XHRjb25zdCBvYnNlcnZlcnMgPSBbLi4udGhpcy5fcmVtb3ZlZE9ic2VydmVyVG9DYWxsRW5kVXBkYXRlT25dO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVkT2JzZXJ2ZXJUb0NhbGxFbmRVcGRhdGVPbiA9IG51bGw7XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiBvYnNlcnZlcnMpIHtcblx0XHRcdFx0XHRyLmVuZFVwZGF0ZSh0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRhc3NlcnRGbigoKSA9PiB0aGlzLl91cGRhdGVDb3VudCA+PSAwKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVQb3NzaWJsZUNoYW5nZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IHZvaWQge1xuXHRcdC8vIEluIGFsbCBvdGhlciBzdGF0ZXMsIG9ic2VydmVycyBhbHJlYWR5IGtub3cgdGhhdCB3ZSBtaWdodCBoYXZlIGNoYW5nZWQuXG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBEZXJpdmVkU3RhdGUudXBUb0RhdGUgJiYgdGhpcy5fZGVwZW5kZW5jaWVzLmhhcyhvYnNlcnZhYmxlKSAmJiAhdGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuaGFzKG9ic2VydmFibGUpKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IERlcml2ZWRTdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRyLmhhbmRsZVBvc3NpYmxlQ2hhbmdlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDaGFuZ2U8VCwgVENoYW5nZT4ob2JzZXJ2YWJsZTogSU9ic2VydmFibGVXaXRoQ2hhbmdlPFQsIFRDaGFuZ2U+LCBjaGFuZ2U6IFRDaGFuZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVwZW5kZW5jaWVzLmhhcyhvYnNlcnZhYmxlKSAmJiAhdGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuaGFzKG9ic2VydmFibGUpIHx8IHRoaXMuX2lzSW5CZWZvcmVVcGRhdGUpIHtcblx0XHRcdGdldExvZ2dlcigpPy5oYW5kbGVEZXJpdmVkRGVwZW5kZW5jeUNoYW5nZWQodGhpcywgb2JzZXJ2YWJsZSwgY2hhbmdlKTtcblxuXHRcdFx0bGV0IHNob3VsZFJlYWN0ID0gZmFsc2U7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzaG91bGRSZWFjdCA9IHRoaXMuX2NoYW5nZVRyYWNrZXIgPyB0aGlzLl9jaGFuZ2VUcmFja2VyLmhhbmRsZUNoYW5nZSh7XG5cdFx0XHRcdFx0Y2hhbmdlZE9ic2VydmFibGU6IG9ic2VydmFibGUsXG5cdFx0XHRcdFx0Y2hhbmdlLFxuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdGRpZENoYW5nZTogKG8pOiB0aGlzIGlzIGFueSA9PiBvID09PSBvYnNlcnZhYmxlIGFzIGFueSxcblx0XHRcdFx0fSwgdGhpcy5fY2hhbmdlU3VtbWFyeSEpIDogdHJ1ZTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0b25CdWdJbmRpY2F0aW5nRXJyb3IoZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdhc1VwVG9EYXRlID0gdGhpcy5fc3RhdGUgPT09IERlcml2ZWRTdGF0ZS51cFRvRGF0ZTtcblx0XHRcdGlmIChzaG91bGRSZWFjdCAmJiAodGhpcy5fc3RhdGUgPT09IERlcml2ZWRTdGF0ZS5kZXBlbmRlbmNpZXNNaWdodEhhdmVDaGFuZ2VkIHx8IHdhc1VwVG9EYXRlKSkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZSA9IERlcml2ZWRTdGF0ZS5zdGFsZTtcblx0XHRcdFx0aWYgKHdhc1VwVG9EYXRlKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRcdFx0ci5oYW5kbGVQb3NzaWJsZUNoYW5nZSh0aGlzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBJUmVhZGVyIEltcGxlbWVudGF0aW9uXG5cblx0cHJpdmF0ZSBfZW5zdXJlUmVhZGVyVmFsaWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1JlYWRlclZhbGlkKSB7IHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1RoZSByZWFkZXIgb2JqZWN0IGNhbm5vdCBiZSB1c2VkIG91dHNpZGUgaXRzIGNvbXB1dGUgZnVuY3Rpb24hJyk7IH1cblx0fVxuXG5cdHB1YmxpYyByZWFkT2JzZXJ2YWJsZTxUPihvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxUPik6IFQge1xuXHRcdHRoaXMuX2Vuc3VyZVJlYWRlclZhbGlkKCk7XG5cblx0XHQvLyBTdWJzY3JpYmUgYmVmb3JlIGdldHRpbmcgdGhlIHZhbHVlIHRvIGVuYWJsZSBjYWNoaW5nXG5cdFx0b2JzZXJ2YWJsZS5hZGRPYnNlcnZlcih0aGlzKTtcblx0XHQvKiogVGhpcyBtaWdodCBjYWxsIHtAbGluayBoYW5kbGVDaGFuZ2V9IGluZGlyZWN0bHksIHdoaWNoIGNvdWxkIGludmFsaWRhdGUgdXMgKi9cblx0XHRjb25zdCB2YWx1ZSA9IG9ic2VydmFibGUuZ2V0KCk7XG5cdFx0Ly8gV2hpY2ggaXMgd2h5IHdlIG9ubHkgYWRkIHRoZSBvYnNlcnZhYmxlIHRvIHRoZSBkZXBlbmRlbmNpZXMgbm93LlxuXHRcdHRoaXMuX2RlcGVuZGVuY2llcy5hZGQob2JzZXJ2YWJsZSk7XG5cdFx0dGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQuZGVsZXRlKG9ic2VydmFibGUpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyByZXBvcnRDaGFuZ2UoY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fZW5zdXJlUmVhZGVyVmFsaWQoKTtcblxuXHRcdHRoaXMuX2RpZFJlcG9ydENoYW5nZSA9IHRydWU7XG5cdFx0Ly8gVE9ETyBhZGQgbG9nZ2luZ1xuXHRcdGZvciAoY29uc3QgciBvZiB0aGlzLl9vYnNlcnZlcnMpIHtcblx0XHRcdHIuaGFuZGxlQ2hhbmdlKHRoaXMsIGNoYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHN0b3JlKCk6IERpc3Bvc2FibGVTdG9yZSB7XG5cdFx0dGhpcy5fZW5zdXJlUmVhZGVyVmFsaWQoKTtcblxuXHRcdGlmICh0aGlzLl9zdG9yZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlO1xuXHR9XG5cblx0Z2V0IGRlbGF5ZWRTdG9yZSgpOiBEaXNwb3NhYmxlU3RvcmUge1xuXHRcdHRoaXMuX2Vuc3VyZVJlYWRlclZhbGlkKCk7XG5cblx0XHRpZiAodGhpcy5fZGVsYXllZFN0b3JlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2RlbGF5ZWRTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlbGF5ZWRTdG9yZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhZGRPYnNlcnZlcihvYnNlcnZlcjogSU9ic2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvdWxkQ2FsbEJlZ2luVXBkYXRlID0gIXRoaXMuX29ic2VydmVycy5oYXMob2JzZXJ2ZXIpICYmIHRoaXMuX3VwZGF0ZUNvdW50ID4gMDtcblx0XHRzdXBlci5hZGRPYnNlcnZlcihvYnNlcnZlcik7XG5cblx0XHRpZiAoc2hvdWxkQ2FsbEJlZ2luVXBkYXRlKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uPy5kZWxldGUob2JzZXJ2ZXIpKSB7XG5cdFx0XHRcdG9ic2VydmVyLmJlZ2luVXBkYXRlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSByZW1vdmVPYnNlcnZlcihvYnNlcnZlcjogSU9ic2VydmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX29ic2VydmVycy5oYXMob2JzZXJ2ZXIpICYmIHRoaXMuX3VwZGF0ZUNvdW50ID4gMCkge1xuXHRcdFx0aWYgKCF0aGlzLl9yZW1vdmVkT2JzZXJ2ZXJUb0NhbGxFbmRVcGRhdGVPbikge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVkT2JzZXJ2ZXJUb0NhbGxFbmRVcGRhdGVPbiA9IG5ldyBTZXQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbW92ZWRPYnNlcnZlclRvQ2FsbEVuZFVwZGF0ZU9uLmFkZChvYnNlcnZlcik7XG5cdFx0fVxuXHRcdHN1cGVyLnJlbW92ZU9ic2VydmVyKG9ic2VydmVyKTtcblx0fVxuXG5cdHB1YmxpYyBkZWJ1Z0dldFN0YXRlKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0ZTogdGhpcy5fc3RhdGUsXG5cdFx0XHRzdGF0ZVN0cjogZGVyaXZlZFN0YXRlVG9TdHJpbmcodGhpcy5fc3RhdGUpLFxuXHRcdFx0dXBkYXRlQ291bnQ6IHRoaXMuX3VwZGF0ZUNvdW50LFxuXHRcdFx0aXNDb21wdXRpbmc6IHRoaXMuX2lzQ29tcHV0aW5nLFxuXHRcdFx0ZGVwZW5kZW5jaWVzOiB0aGlzLl9kZXBlbmRlbmNpZXMsXG5cdFx0XHR2YWx1ZTogdGhpcy5fdmFsdWUsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBkZWJ1Z1NldFZhbHVlKG5ld1ZhbHVlOiB1bmtub3duKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dGhpcy5fdmFsdWUgPSBuZXdWYWx1ZSBhcyBhbnk7XG5cdH1cblxuXHRwdWJsaWMgZGVidWdSZWNvbXB1dGUoKTogdm9pZCB7XG5cdFx0dGhpcy5iZWdpblVwZGF0ZSh0aGlzKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0NvbXB1dGluZykge1xuXHRcdFx0XHR0aGlzLl9yZWNvbXB1dGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlID0gRGVyaXZlZFN0YXRlLnN0YWxlO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmVuZFVwZGF0ZSh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUobmV3VmFsdWU6IFQsIHR4OiBJVHJhbnNhY3Rpb24sIGNoYW5nZTogVENoYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlID0gbmV3VmFsdWU7XG5cdFx0Y29uc3Qgb2JzZXJ2ZXJzID0gdGhpcy5fb2JzZXJ2ZXJzO1xuXHRcdHR4LnVwZGF0ZU9ic2VydmVyKHRoaXMsIHRoaXMpO1xuXHRcdGZvciAoY29uc3QgZCBvZiBvYnNlcnZlcnMpIHtcblx0XHRcdGQuaGFuZGxlQ2hhbmdlKHRoaXMsIGNoYW5nZSk7XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIERlcml2ZWRXaXRoU2V0dGVyPFQsIFRDaGFuZ2VTdW1tYXJ5ID0gYW55LCBUT3V0Q2hhbmdlcyA9IGFueT4gZXh0ZW5kcyBEZXJpdmVkPFQsIFRDaGFuZ2VTdW1tYXJ5LCBUT3V0Q2hhbmdlcz4gaW1wbGVtZW50cyBJU2V0dGFibGVPYnNlcnZhYmxlPFQsIFRPdXRDaGFuZ2VzPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRlYnVnTmFtZURhdGE6IERlYnVnTmFtZURhdGEsXG5cdFx0Y29tcHV0ZUZuOiAocmVhZGVyOiBJRGVyaXZlZFJlYWRlcjxUT3V0Q2hhbmdlcz4sIGNoYW5nZVN1bW1hcnk6IFRDaGFuZ2VTdW1tYXJ5KSA9PiBULFxuXHRcdGNoYW5nZVRyYWNrZXI6IElDaGFuZ2VUcmFja2VyPFRDaGFuZ2VTdW1tYXJ5PiB8IHVuZGVmaW5lZCxcblx0XHRoYW5kbGVMYXN0T2JzZXJ2ZXJSZW1vdmVkOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQsXG5cdFx0ZXF1YWxpdHlDb21wYXJhdG9yOiBFcXVhbGl0eUNvbXBhcmVyPFQ+LFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXQ6ICh2YWx1ZTogVCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCwgY2hhbmdlOiBUT3V0Q2hhbmdlcykgPT4gdm9pZCxcblx0XHRkZWJ1Z0xvY2F0aW9uOiBEZWJ1Z0xvY2F0aW9uLFxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdGRlYnVnTmFtZURhdGEsXG5cdFx0XHRjb21wdXRlRm4sXG5cdFx0XHRjaGFuZ2VUcmFja2VyLFxuXHRcdFx0aGFuZGxlTGFzdE9ic2VydmVyUmVtb3ZlZCxcblx0XHRcdGVxdWFsaXR5Q29tcGFyYXRvcixcblx0XHRcdGRlYnVnTG9jYXRpb24sXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxvQkFBb0IsaUJBQW1DLFVBQVUsNEJBQTRCO0FBQ3RHLFNBQVMsaUJBQWlCO0FBV25CLElBQVcsZUFBWCxrQkFBV0Esa0JBQVg7QUFFTixFQUFBQSw0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TyxRQUFRLEdBQUc7QUFDOUQsaUJBQVMsWUFBWSxJQUFJO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRWdCLGVBQWUsVUFBMkI7QUFDekQsUUFBSSxLQUFLLFdBQVcsSUFBSSxRQUFRLEtBQUssS0FBSyxlQUFlLEdBQUc7QUFDM0QsVUFBSSxDQUFDLEtBQUssbUNBQW1DO0FBQzVDLGFBQUssb0NBQW9DLG9CQUFJLElBQUk7QUFBQSxNQUNsRDtBQUNBLFdBQUssa0NBQWtDLElBQUksUUFBUTtBQUFBLElBQ3BEO0FBQ0EsVUFBTSxlQUFlLFFBQVE7QUFBQSxFQUM5QjtBQUFBLEVBRU8sZ0JBQWdCO0FBQ3RCLFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osVUFBVSxxQkFBcUIsS0FBSyxNQUFNO0FBQUEsTUFDMUMsYUFBYSxLQUFLO0FBQUEsTUFDbEIsYUFBYSxLQUFLO0FBQUEsTUFDbEIsY0FBYyxLQUFLO0FBQUEsTUFDbkIsT0FBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGNBQWMsVUFBbUI7QUFFdkMsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRU8saUJBQXVCO0FBQzdCLFNBQUssWUFBWSxJQUFJO0FBQ3JCLFFBQUk7QUFDSCxVQUFJLENBQUMsS0FBSyxjQUFjO0FBQ3ZCLGFBQUssV0FBVztBQUFBLE1BQ2pCLE9BQU87QUFDTixhQUFLLFNBQVM7QUFBQSxNQUNmO0FBQUEsSUFDRCxVQUFFO0FBQ0QsV0FBSyxVQUFVLElBQUk7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLFNBQVMsVUFBYSxJQUFrQixRQUF1QjtBQUNyRSxTQUFLLFNBQVM7QUFDZCxVQUFNLFlBQVksS0FBSztBQUN2QixPQUFHLGVBQWUsTUFBTSxJQUFJO0FBQzVCLGVBQVcsS0FBSyxXQUFXO0FBQzFCLFFBQUUsYUFBYSxNQUFNLE1BQU07QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFDRDtBQUdPLE1BQU0sMEJBQXNFLFFBQXVGO0FBQUEsRUFDekssWUFDQyxlQUNBLFdBQ0EsZUFDQSw0QkFBc0QsUUFDdEQsb0JBQ2dCLEtBQ2hCLGVBQ0M7QUFDRDtBQUFBLE1BQ0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFWZ0I7QUFBQSxFQVdqQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJEZXJpdmVkU3RhdGUiLCAib2JzZXJ2ZXJzIl0KfQo=
