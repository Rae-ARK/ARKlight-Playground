import { assertFn, BugIndicatingError, DisposableStore, markAsDisposed, onBugIndicatingError, trackDisposable } from "../commonFacade/deps.js";
import { getLogger } from "../logging/logging.js";
var AutorunState = /* @__PURE__ */ ((AutorunState2) => {
  AutorunState2[AutorunState2["dependenciesMightHaveChanged"] = 1] = "dependenciesMightHaveChanged";
  AutorunState2[AutorunState2["stale"] = 2] = "stale";
  AutorunState2[AutorunState2["upToDate"] = 3] = "upToDate";
  return AutorunState2;
})(AutorunState || {});
function autorunStateToString(state) {
  switch (state) {
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
class AutorunObserver {
  constructor(_debugNameData, _runFn, _changeTracker, debugLocation) {
    this._debugNameData = _debugNameData;
    this._runFn = _runFn;
    this._changeTracker = _changeTracker;
    this._state = 2 /* stale */;
    this._updateCount = 0;
    this._disposed = false;
    this._dependencies = /* @__PURE__ */ new Set();
    this._dependenciesToBeRemoved = /* @__PURE__ */ new Set();
    this._isRunning = false;
    this._iteration = 0;
    this._store = void 0;
    this._delayedStore = void 0;
    this._changeSummary = this._changeTracker?.createChangeSummary(void 0);
    getLogger()?.handleAutorunCreated(this, debugLocation);
    this._run();
    trackDisposable(this);
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "(anonymous)";
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    for (const o of this._dependencies) {
      o.removeObserver(this);
    }
    this._dependencies.clear();
    if (this._store !== void 0) {
      this._store.dispose();
    }
    if (this._delayedStore !== void 0) {
      this._delayedStore.dispose();
    }
    getLogger()?.handleAutorunDisposed(this);
    markAsDisposed(this);
  }
  _run() {
    const emptySet = this._dependenciesToBeRemoved;
    this._dependenciesToBeRemoved = this._dependencies;
    this._dependencies = emptySet;
    this._state = 3 /* upToDate */;
    try {
      if (!this._disposed) {
        getLogger()?.handleAutorunStarted(this);
        const changeSummary = this._changeSummary;
        const delayedStore = this._delayedStore;
        if (delayedStore !== void 0) {
          this._delayedStore = void 0;
        }
        try {
          this._isRunning = true;
          if (this._changeTracker) {
            this._changeTracker.beforeUpdate?.(this, changeSummary);
            this._changeSummary = this._changeTracker.createChangeSummary(changeSummary);
          }
          if (this._store !== void 0) {
            this._store.dispose();
            this._store = void 0;
          }
          this._runFn(this, changeSummary);
        } catch (e) {
          onBugIndicatingError(e);
        } finally {
          this._isRunning = false;
          if (delayedStore !== void 0) {
            delayedStore.dispose();
          }
        }
      }
    } finally {
      if (!this._disposed) {
        getLogger()?.handleAutorunFinished(this);
      }
      for (const o of this._dependenciesToBeRemoved) {
        o.removeObserver(this);
      }
      this._dependenciesToBeRemoved.clear();
    }
  }
  toString() {
    return `Autorun<${this.debugName}>`;
  }
  // IObserver implementation
  beginUpdate(_observable) {
    if (this._state === 3 /* upToDate */) {
      this._checkIterations();
      this._state = 1 /* dependenciesMightHaveChanged */;
    }
    this._updateCount++;
  }
  endUpdate(_observable) {
    try {
      if (this._updateCount === 1) {
        this._iteration = 1;
        do {
          if (this._checkIterations()) {
            return;
          }
          if (this._state === 1 /* dependenciesMightHaveChanged */) {
            this._state = 3 /* upToDate */;
            for (const d of this._dependencies) {
              d.reportChanges();
              if (this._state === 2 /* stale */) {
                break;
              }
            }
          }
          this._iteration++;
          if (this._state !== 3 /* upToDate */) {
            this._run();
          }
        } while (this._state !== 3 /* upToDate */);
      }
    } finally {
      this._updateCount--;
    }
    assertFn(() => this._updateCount >= 0);
  }
  handlePossibleChange(observable) {
    if (this._state === 3 /* upToDate */ && this._isDependency(observable)) {
      this._checkIterations();
      this._state = 1 /* dependenciesMightHaveChanged */;
    }
  }
  handleChange(observable, change) {
    if (this._isDependency(observable)) {
      getLogger()?.handleAutorunDependencyChanged(this, observable, change);
      try {
        const shouldReact = this._changeTracker ? this._changeTracker.handleChange({
          changedObservable: observable,
          change,
          // eslint-disable-next-line local/code-no-any-casts
          didChange: (o) => o === observable
        }, this._changeSummary) : true;
        if (shouldReact) {
          this._checkIterations();
          this._state = 2 /* stale */;
        }
      } catch (e) {
        onBugIndicatingError(e);
      }
    }
  }
  _isDependency(observable) {
    return this._dependencies.has(observable) && !this._dependenciesToBeRemoved.has(observable);
  }
  // IReader implementation
  _ensureNoRunning() {
    if (!this._isRunning) {
      throw new BugIndicatingError("The reader object cannot be used outside its compute function!");
    }
  }
  readObservable(observable) {
    this._ensureNoRunning();
    if (this._disposed) {
      return observable.get();
    }
    observable.addObserver(this);
    const value = observable.get();
    this._dependencies.add(observable);
    this._dependenciesToBeRemoved.delete(observable);
    return value;
  }
  get store() {
    this._ensureNoRunning();
    if (this._disposed) {
      throw new BugIndicatingError("Cannot access store after dispose");
    }
    if (this._store === void 0) {
      this._store = new DisposableStore();
    }
    return this._store;
  }
  get delayedStore() {
    this._ensureNoRunning();
    if (this._disposed) {
      throw new BugIndicatingError("Cannot access store after dispose");
    }
    if (this._delayedStore === void 0) {
      this._delayedStore = new DisposableStore();
    }
    return this._delayedStore;
  }
  debugGetState() {
    return {
      isRunning: this._isRunning,
      updateCount: this._updateCount,
      dependencies: this._dependencies,
      state: this._state,
      stateStr: autorunStateToString(this._state)
    };
  }
  debugRerun() {
    if (!this._isRunning) {
      this._run();
    } else {
      this._state = 2 /* stale */;
    }
  }
  _checkIterations() {
    if (this._iteration > 100) {
      onBugIndicatingError(new BugIndicatingError(`Autorun '${this.debugName}' is stuck in an infinite update loop.`));
      return true;
    }
    return false;
  }
}
export {
  AutorunObserver,
  AutorunState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9yZWFjdGlvbnMvYXV0b3J1bkltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlLCBJT2JzZXJ2ZXIsIElSZWFkZXJXaXRoU3RvcmUgfSBmcm9tICcuLi9iYXNlLmpzJztcbmltcG9ydCB7IERlYnVnTmFtZURhdGEgfSBmcm9tICcuLi9kZWJ1Z05hbWUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0Rm4sIEJ1Z0luZGljYXRpbmdFcnJvciwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgbWFya0FzRGlzcG9zZWQsIG9uQnVnSW5kaWNhdGluZ0Vycm9yLCB0cmFja0Rpc3Bvc2FibGUgfSBmcm9tICcuLi9jb21tb25GYWNhZGUvZGVwcy5qcyc7XG5pbXBvcnQgeyBnZXRMb2dnZXIgfSBmcm9tICcuLi9sb2dnaW5nL2xvZ2dpbmcuanMnO1xuaW1wb3J0IHsgSUNoYW5nZVRyYWNrZXIgfSBmcm9tICcuLi9jaGFuZ2VUcmFja2VyLmpzJztcbmltcG9ydCB7IERlYnVnTG9jYXRpb24gfSBmcm9tICcuLi9kZWJ1Z0xvY2F0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gQXV0b3J1blN0YXRlIHtcblx0LyoqXG5cdCAqIEEgZGVwZW5kZW5jeSBjb3VsZCBoYXZlIGNoYW5nZWQuXG5cdCAqIFdlIG5lZWQgdG8gZXhwbGljaXRseSBhc2sgdGhlbSBpZiBhdCBsZWFzdCBvbmUgZGVwZW5kZW5jeSBjaGFuZ2VkLlxuXHQgKi9cblx0ZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZCA9IDEsXG5cblx0LyoqXG5cdCAqIEEgZGVwZW5kZW5jeSBjaGFuZ2VkIGFuZCB3ZSBuZWVkIHRvIHJlY29tcHV0ZS5cblx0ICovXG5cdHN0YWxlID0gMixcblx0dXBUb0RhdGUgPSAzLFxufVxuXG5mdW5jdGlvbiBhdXRvcnVuU3RhdGVUb1N0cmluZyhzdGF0ZTogQXV0b3J1blN0YXRlKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgQXV0b3J1blN0YXRlLmRlcGVuZGVuY2llc01pZ2h0SGF2ZUNoYW5nZWQ6IHJldHVybiAnZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZCc7XG5cdFx0Y2FzZSBBdXRvcnVuU3RhdGUuc3RhbGU6IHJldHVybiAnc3RhbGUnO1xuXHRcdGNhc2UgQXV0b3J1blN0YXRlLnVwVG9EYXRlOiByZXR1cm4gJ3VwVG9EYXRlJztcblx0XHRkZWZhdWx0OiByZXR1cm4gJzx1bmtub3duPic7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9ydW5PYnNlcnZlcjxUQ2hhbmdlU3VtbWFyeSA9IGFueT4gaW1wbGVtZW50cyBJT2JzZXJ2ZXIsIElSZWFkZXJXaXRoU3RvcmUsIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfc3RhdGUgPSBBdXRvcnVuU3RhdGUuc3RhbGU7XG5cdHByaXZhdGUgX3VwZGF0ZUNvdW50ID0gMDtcblx0cHJpdmF0ZSBfZGlzcG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGVwZW5kZW5jaWVzID0gbmV3IFNldDxJT2JzZXJ2YWJsZTxhbnk+PigpO1xuXHRwcml2YXRlIF9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCA9IG5ldyBTZXQ8SU9ic2VydmFibGU8YW55Pj4oKTtcblx0cHJpdmF0ZSBfY2hhbmdlU3VtbWFyeTogVENoYW5nZVN1bW1hcnkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzUnVubmluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9pdGVyYXRpb24gPSAwO1xuXG5cdHB1YmxpYyBnZXQgZGVidWdOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlYnVnTmFtZURhdGEuZ2V0RGVidWdOYW1lKHRoaXMpID8/ICcoYW5vbnltb3VzKSc7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgX2RlYnVnTmFtZURhdGE6IERlYnVnTmFtZURhdGEsXG5cdFx0cHVibGljIHJlYWRvbmx5IF9ydW5GbjogKHJlYWRlcjogSVJlYWRlcldpdGhTdG9yZSwgY2hhbmdlU3VtbWFyeTogVENoYW5nZVN1bW1hcnkpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlVHJhY2tlcjogSUNoYW5nZVRyYWNrZXI8VENoYW5nZVN1bW1hcnk+IHwgdW5kZWZpbmVkLFxuXHRcdGRlYnVnTG9jYXRpb246IERlYnVnTG9jYXRpb25cblx0KSB7XG5cdFx0dGhpcy5fY2hhbmdlU3VtbWFyeSA9IHRoaXMuX2NoYW5nZVRyYWNrZXI/LmNyZWF0ZUNoYW5nZVN1bW1hcnkodW5kZWZpbmVkKTtcblx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlQXV0b3J1bkNyZWF0ZWQodGhpcywgZGVidWdMb2NhdGlvbik7XG5cdFx0dGhpcy5fcnVuKCk7XG5cblx0XHR0cmFja0Rpc3Bvc2FibGUodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWQgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgbyBvZiB0aGlzLl9kZXBlbmRlbmNpZXMpIHtcblx0XHRcdG8ucmVtb3ZlT2JzZXJ2ZXIodGhpcyk7IC8vIFdhcm5pbmc6IGV4dGVybmFsIGNhbGwhXG5cdFx0fVxuXHRcdHRoaXMuX2RlcGVuZGVuY2llcy5jbGVhcigpO1xuXG5cdFx0aWYgKHRoaXMuX3N0b3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RlbGF5ZWRTdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kZWxheWVkU3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGdldExvZ2dlcigpPy5oYW5kbGVBdXRvcnVuRGlzcG9zZWQodGhpcyk7XG5cdFx0bWFya0FzRGlzcG9zZWQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW4oKSB7XG5cdFx0Y29uc3QgZW1wdHlTZXQgPSB0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZDtcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXNUb0JlUmVtb3ZlZCA9IHRoaXMuX2RlcGVuZGVuY2llcztcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXMgPSBlbXB0eVNldDtcblxuXHRcdHRoaXMuX3N0YXRlID0gQXV0b3J1blN0YXRlLnVwVG9EYXRlO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZUF1dG9ydW5TdGFydGVkKHRoaXMpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fY2hhbmdlU3VtbWFyeSE7XG5cdFx0XHRcdGNvbnN0IGRlbGF5ZWRTdG9yZSA9IHRoaXMuX2RlbGF5ZWRTdG9yZTtcblx0XHRcdFx0aWYgKGRlbGF5ZWRTdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5faXNSdW5uaW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAodGhpcy5fY2hhbmdlVHJhY2tlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fY2hhbmdlVHJhY2tlci5iZWZvcmVVcGRhdGU/Lih0aGlzLCBjaGFuZ2VTdW1tYXJ5KTtcblx0XHRcdFx0XHRcdHRoaXMuX2NoYW5nZVN1bW1hcnkgPSB0aGlzLl9jaGFuZ2VUcmFja2VyLmNyZWF0ZUNoYW5nZVN1bW1hcnkoY2hhbmdlU3VtbWFyeSk7IC8vIFdhcm5pbmc6IGV4dGVybmFsIGNhbGwhXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLl9zdG9yZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdG9yZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9ydW5Gbih0aGlzLCBjaGFuZ2VTdW1tYXJ5KTsgLy8gV2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdG9uQnVnSW5kaWNhdGluZ0Vycm9yKGUpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2lzUnVubmluZyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChkZWxheWVkU3RvcmUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZGVsYXllZFN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCF0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlQXV0b3J1bkZpbmlzaGVkKHRoaXMpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2UgZG9uJ3Qgd2FudCBvdXIgb2JzZXJ2ZWQgb2JzZXJ2YWJsZXMgdG8gdGhpbmsgdGhhdCB0aGV5IGFyZSAobm90IGV2ZW4gdGVtcG9yYXJpbHkpIG5vdCBiZWluZyBvYnNlcnZlZC5cblx0XHRcdC8vIFRodXMsIHdlIG9ubHkgdW5zdWJzY3JpYmUgZnJvbSBvYnNlcnZhYmxlcyB0aGF0IGFyZSBkZWZpbml0ZWx5IG5vdCByZWFkIGFueW1vcmUuXG5cdFx0XHRmb3IgKGNvbnN0IG8gb2YgdGhpcy5fZGVwZW5kZW5jaWVzVG9CZVJlbW92ZWQpIHtcblx0XHRcdFx0by5yZW1vdmVPYnNlcnZlcih0aGlzKTsgLy8gV2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBBdXRvcnVuPCR7dGhpcy5kZWJ1Z05hbWV9PmA7XG5cdH1cblxuXHQvLyBJT2JzZXJ2ZXIgaW1wbGVtZW50YXRpb25cblx0cHVibGljIGJlZ2luVXBkYXRlKF9vYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBBdXRvcnVuU3RhdGUudXBUb0RhdGUpIHtcblx0XHRcdHRoaXMuX2NoZWNrSXRlcmF0aW9ucygpO1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQ291bnQrKztcblx0fVxuXG5cdHB1YmxpYyBlbmRVcGRhdGUoX29ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4pOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuX3VwZGF0ZUNvdW50ID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX2l0ZXJhdGlvbiA9IDE7XG5cdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRpZiAodGhpcy5fY2hlY2tJdGVyYXRpb25zKCkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0YXRlID09PSBBdXRvcnVuU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUudXBUb0RhdGU7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGQgb2YgdGhpcy5fZGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdFx0XHRcdGQucmVwb3J0Q2hhbmdlcygpOyAvLyBXYXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgYXMgQXV0b3J1blN0YXRlID09PSBBdXRvcnVuU3RhdGUuc3RhbGUpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBUaGUgb3RoZXIgZGVwZW5kZW5jaWVzIHdpbGwgcmVmcmVzaCBvbiBkZW1hbmRcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2l0ZXJhdGlvbisrO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gQXV0b3J1blN0YXRlLnVwVG9EYXRlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9ydW4oKTsgLy8gV2FybmluZzogaW5kaXJlY3QgZXh0ZXJuYWwgY2FsbCFcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gd2hpbGUgKHRoaXMuX3N0YXRlICE9PSBBdXRvcnVuU3RhdGUudXBUb0RhdGUpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl91cGRhdGVDb3VudC0tO1xuXHRcdH1cblxuXHRcdGFzc2VydEZuKCgpID0+IHRoaXMuX3VwZGF0ZUNvdW50ID49IDApO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVBvc3NpYmxlQ2hhbmdlKG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgPT09IEF1dG9ydW5TdGF0ZS51cFRvRGF0ZSAmJiB0aGlzLl9pc0RlcGVuZGVuY3kob2JzZXJ2YWJsZSkpIHtcblx0XHRcdHRoaXMuX2NoZWNrSXRlcmF0aW9ucygpO1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBBdXRvcnVuU3RhdGUuZGVwZW5kZW5jaWVzTWlnaHRIYXZlQ2hhbmdlZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlQ2hhbmdlPFQsIFRDaGFuZ2U+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxULCBUQ2hhbmdlPiwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGVwZW5kZW5jeShvYnNlcnZhYmxlKSkge1xuXHRcdFx0Z2V0TG9nZ2VyKCk/LmhhbmRsZUF1dG9ydW5EZXBlbmRlbmN5Q2hhbmdlZCh0aGlzLCBvYnNlcnZhYmxlLCBjaGFuZ2UpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gV2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUmVhY3QgPSB0aGlzLl9jaGFuZ2VUcmFja2VyID8gdGhpcy5fY2hhbmdlVHJhY2tlci5oYW5kbGVDaGFuZ2Uoe1xuXHRcdFx0XHRcdGNoYW5nZWRPYnNlcnZhYmxlOiBvYnNlcnZhYmxlLFxuXHRcdFx0XHRcdGNoYW5nZSxcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRkaWRDaGFuZ2U6IChvKTogdGhpcyBpcyBhbnkgPT4gbyA9PT0gb2JzZXJ2YWJsZSBhcyBhbnksXG5cdFx0XHRcdH0sIHRoaXMuX2NoYW5nZVN1bW1hcnkhKSA6IHRydWU7XG5cdFx0XHRcdGlmIChzaG91bGRSZWFjdCkge1xuXHRcdFx0XHRcdHRoaXMuX2NoZWNrSXRlcmF0aW9ucygpO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gQXV0b3J1blN0YXRlLnN0YWxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdG9uQnVnSW5kaWNhdGluZ0Vycm9yKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzRGVwZW5kZW5jeShvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8YW55LCBhbnk+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlcGVuZGVuY2llcy5oYXMob2JzZXJ2YWJsZSkgJiYgIXRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkLmhhcyhvYnNlcnZhYmxlKTtcblx0fVxuXG5cdC8vIElSZWFkZXIgaW1wbGVtZW50YXRpb25cblxuXHRwcml2YXRlIF9lbnN1cmVOb1J1bm5pbmcoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1J1bm5pbmcpIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVGhlIHJlYWRlciBvYmplY3QgY2Fubm90IGJlIHVzZWQgb3V0c2lkZSBpdHMgY29tcHV0ZSBmdW5jdGlvbiEnKTsgfVxuXHR9XG5cblx0cHVibGljIHJlYWRPYnNlcnZhYmxlPFQ+KG9ic2VydmFibGU6IElPYnNlcnZhYmxlPFQ+KTogVCB7XG5cdFx0dGhpcy5fZW5zdXJlTm9SdW5uaW5nKCk7XG5cblx0XHQvLyBJbiBjYXNlIHRoZSBydW4gYWN0aW9uIGRpc3Bvc2VzIHRoZSBhdXRvcnVuXG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gb2JzZXJ2YWJsZS5nZXQoKTsgLy8gd2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHR9XG5cblx0XHRvYnNlcnZhYmxlLmFkZE9ic2VydmVyKHRoaXMpOyAvLyB3YXJuaW5nOiBleHRlcm5hbCBjYWxsIVxuXHRcdGNvbnN0IHZhbHVlID0gb2JzZXJ2YWJsZS5nZXQoKTsgLy8gd2FybmluZzogZXh0ZXJuYWwgY2FsbCFcblx0XHR0aGlzLl9kZXBlbmRlbmNpZXMuYWRkKG9ic2VydmFibGUpO1xuXHRcdHRoaXMuX2RlcGVuZGVuY2llc1RvQmVSZW1vdmVkLmRlbGV0ZShvYnNlcnZhYmxlKTtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRnZXQgc3RvcmUoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHR0aGlzLl9lbnN1cmVOb1J1bm5pbmcoKTtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0Nhbm5vdCBhY2Nlc3Mgc3RvcmUgYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsYXllZFN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBkZWxheWVkU3RvcmUoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHR0aGlzLl9lbnN1cmVOb1J1bm5pbmcoKTtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0Nhbm5vdCBhY2Nlc3Mgc3RvcmUgYWZ0ZXIgZGlzcG9zZScpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kZWxheWVkU3RvcmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZGVsYXllZFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVsYXllZFN0b3JlO1xuXHR9XG5cblx0cHVibGljIGRlYnVnR2V0U3RhdGUoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzUnVubmluZzogdGhpcy5faXNSdW5uaW5nLFxuXHRcdFx0dXBkYXRlQ291bnQ6IHRoaXMuX3VwZGF0ZUNvdW50LFxuXHRcdFx0ZGVwZW5kZW5jaWVzOiB0aGlzLl9kZXBlbmRlbmNpZXMsXG5cdFx0XHRzdGF0ZTogdGhpcy5fc3RhdGUsXG5cdFx0XHRzdGF0ZVN0cjogYXV0b3J1blN0YXRlVG9TdHJpbmcodGhpcy5fc3RhdGUpLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZGVidWdSZXJ1bigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzUnVubmluZykge1xuXHRcdFx0dGhpcy5fcnVuKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gQXV0b3J1blN0YXRlLnN0YWxlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrSXRlcmF0aW9ucygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXRlcmF0aW9uID4gMTAwKSB7XG5cdFx0XHRvbkJ1Z0luZGljYXRpbmdFcnJvcihuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBBdXRvcnVuICcke3RoaXMuZGVidWdOYW1lfScgaXMgc3R1Y2sgaW4gYW4gaW5maW5pdGUgdXBkYXRlIGxvb3AuYCkpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyxVQUFVLG9CQUFvQixpQkFBOEIsZ0JBQWdCLHNCQUFzQix1QkFBdUI7QUFDbEksU0FBUyxpQkFBaUI7QUFJbkIsSUFBVyxlQUFYLGtCQUFXQSxrQkFBWDtBQUtOLEVBQUFBLDRCQUFBLGtDQUErQixLQUEvQjtBQUtBLEVBQUFBLDRCQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLDRCQUFBLGNBQVcsS0FBWDtBQVhpQixTQUFBQTtBQUFBLEdBQUE7QUFjbEIsU0FBUyxxQkFBcUIsT0FBNkI7QUFDMUQsVUFBUSxPQUFPO0FBQUEsSUFDZCxLQUFLO0FBQTJDLGFBQU87QUFBQSxJQUN2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
