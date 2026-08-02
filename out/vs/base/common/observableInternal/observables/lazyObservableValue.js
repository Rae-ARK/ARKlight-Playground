import { TransactionImpl } from "../transaction.js";
import { getLogger } from "../logging/logging.js";
import { BaseObservable } from "./baseObservable.js";
class LazyObservableValue extends BaseObservable {
  constructor(_debugNameData, initialValue, _equalityComparator, debugLocation) {
    super(debugLocation);
    this._debugNameData = _debugNameData;
    this._equalityComparator = _equalityComparator;
    this._isUpToDate = true;
    this._deltas = [];
    this._updateCounter = 0;
    this._value = initialValue;
  }
  get debugName() {
    return this._debugNameData.getDebugName(this) ?? "LazyObservableValue";
  }
  get() {
    this._update();
    return this._value;
  }
  _update() {
    if (this._isUpToDate) {
      return;
    }
    this._isUpToDate = true;
    if (this._deltas.length > 0) {
      for (const change of this._deltas) {
        getLogger()?.handleObservableUpdated(this, { change, didChange: true, oldValue: "(unknown)", newValue: this._value, hadValue: true });
        for (const observer of this._observers) {
          observer.handleChange(this, change);
        }
      }
      this._deltas.length = 0;
    } else {
      getLogger()?.handleObservableUpdated(this, { change: void 0, didChange: true, oldValue: "(unknown)", newValue: this._value, hadValue: true });
      for (const observer of this._observers) {
        observer.handleChange(this, void 0);
      }
    }
  }
  _beginUpdate() {
    this._updateCounter++;
    if (this._updateCounter === 1) {
      for (const observer of this._observers) {
        observer.beginUpdate(this);
      }
    }
  }
  _endUpdate() {
    this._updateCounter--;
    if (this._updateCounter === 0) {
      this._update();
      const observers = [...this._observers];
      for (const r of observers) {
        r.endUpdate(this);
      }
    }
  }
  addObserver(observer) {
    const shouldCallBeginUpdate = !this._observers.has(observer) && this._updateCounter > 0;
    super.addObserver(observer);
    if (shouldCallBeginUpdate) {
      observer.beginUpdate(this);
    }
  }
  removeObserver(observer) {
    const shouldCallEndUpdate = this._observers.has(observer) && this._updateCounter > 0;
    super.removeObserver(observer);
    if (shouldCallEndUpdate) {
      observer.endUpdate(this);
    }
  }
  set(value, tx, change) {
    if (change === void 0 && this._equalityComparator(this._value, value)) {
      return;
    }
    let _tx;
    if (!tx) {
      tx = _tx = new TransactionImpl(() => {
      }, () => `Setting ${this.debugName}`);
    }
    try {
      this._isUpToDate = false;
      this._setValue(value);
      if (change !== void 0) {
        this._deltas.push(change);
      }
      tx.updateObserver({
        beginUpdate: () => this._beginUpdate(),
        endUpdate: () => this._endUpdate(),
        handleChange: (observable, change2) => {
        },
        handlePossibleChange: (observable) => {
        }
      }, this);
      if (this._updateCounter > 1) {
        for (const observer of this._observers) {
          observer.handlePossibleChange(this);
        }
      }
    } finally {
      if (_tx) {
        _tx.finish();
      }
    }
  }
  toString() {
    return `${this.debugName}: ${this._value}`;
  }
  _setValue(newValue) {
    this._value = newValue;
  }
}
export {
  LazyObservableValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9vYnNlcnZhYmxlcy9sYXp5T2JzZXJ2YWJsZVZhbHVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXF1YWxpdHlDb21wYXJlciB9IGZyb20gJy4uL2NvbW1vbkZhY2FkZS9kZXBzLmpzJztcbmltcG9ydCB7IElPYnNlcnZlciwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vYmFzZS5qcyc7XG5pbXBvcnQgeyBUcmFuc2FjdGlvbkltcGwgfSBmcm9tICcuLi90cmFuc2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWJ1Z05hbWVEYXRhIH0gZnJvbSAnLi4vZGVidWdOYW1lLmpzJztcbmltcG9ydCB7IGdldExvZ2dlciB9IGZyb20gJy4uL2xvZ2dpbmcvbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBCYXNlT2JzZXJ2YWJsZSB9IGZyb20gJy4vYmFzZU9ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRGVidWdMb2NhdGlvbiB9IGZyb20gJy4uL2RlYnVnTG9jYXRpb24uanMnO1xuXG4vKipcbiAqIEhvbGRzIG9mZiB1cGRhdGluZyBvYnNlcnZlcnMgdW50aWwgdGhlIHZhbHVlIGlzIGFjdHVhbGx5IHJlYWQuXG4qL1xuZXhwb3J0IGNsYXNzIExhenlPYnNlcnZhYmxlVmFsdWU8VCwgVENoYW5nZSA9IHZvaWQ+XG5cdGV4dGVuZHMgQmFzZU9ic2VydmFibGU8VCwgVENoYW5nZT5cblx0aW1wbGVtZW50cyBJU2V0dGFibGVPYnNlcnZhYmxlPFQsIFRDaGFuZ2U+IHtcblx0cHJvdGVjdGVkIF92YWx1ZTogVDtcblx0cHJpdmF0ZSBfaXNVcFRvRGF0ZSA9IHRydWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbHRhczogVENoYW5nZVtdID0gW107XG5cblx0Z2V0IGRlYnVnTmFtZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVidWdOYW1lRGF0YS5nZXREZWJ1Z05hbWUodGhpcykgPz8gJ0xhenlPYnNlcnZhYmxlVmFsdWUnO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVidWdOYW1lRGF0YTogRGVidWdOYW1lRGF0YSxcblx0XHRpbml0aWFsVmFsdWU6IFQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXF1YWxpdHlDb21wYXJhdG9yOiBFcXVhbGl0eUNvbXBhcmVyPFQ+LFxuXHRcdGRlYnVnTG9jYXRpb246IERlYnVnTG9jYXRpb25cblx0KSB7XG5cdFx0c3VwZXIoZGVidWdMb2NhdGlvbik7XG5cdFx0dGhpcy5fdmFsdWUgPSBpbml0aWFsVmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0KCk6IFQge1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNVcFRvRGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1VwVG9EYXRlID0gdHJ1ZTtcblxuXHRcdGlmICh0aGlzLl9kZWx0YXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5fZGVsdGFzKSB7XG5cdFx0XHRcdGdldExvZ2dlcigpPy5oYW5kbGVPYnNlcnZhYmxlVXBkYXRlZCh0aGlzLCB7IGNoYW5nZSwgZGlkQ2hhbmdlOiB0cnVlLCBvbGRWYWx1ZTogJyh1bmtub3duKScsIG5ld1ZhbHVlOiB0aGlzLl92YWx1ZSwgaGFkVmFsdWU6IHRydWUgfSk7XG5cdFx0XHRcdGZvciAoY29uc3Qgb2JzZXJ2ZXIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0b2JzZXJ2ZXIuaGFuZGxlQ2hhbmdlKHRoaXMsIGNoYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlbHRhcy5sZW5ndGggPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRnZXRMb2dnZXIoKT8uaGFuZGxlT2JzZXJ2YWJsZVVwZGF0ZWQodGhpcywgeyBjaGFuZ2U6IHVuZGVmaW5lZCwgZGlkQ2hhbmdlOiB0cnVlLCBvbGRWYWx1ZTogJyh1bmtub3duKScsIG5ld1ZhbHVlOiB0aGlzLl92YWx1ZSwgaGFkVmFsdWU6IHRydWUgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IG9ic2VydmVyIG9mIHRoaXMuX29ic2VydmVycykge1xuXHRcdFx0XHRvYnNlcnZlci5oYW5kbGVDaGFuZ2UodGhpcywgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb3VudGVyID0gMDtcblxuXHRwcml2YXRlIF9iZWdpblVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVDb3VudGVyKys7XG5cdFx0aWYgKHRoaXMuX3VwZGF0ZUNvdW50ZXIgPT09IDEpIHtcblx0XHRcdGZvciAoY29uc3Qgb2JzZXJ2ZXIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdG9ic2VydmVyLmJlZ2luVXBkYXRlKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2VuZFVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVDb3VudGVyLS07XG5cdFx0aWYgKHRoaXMuX3VwZGF0ZUNvdW50ZXIgPT09IDApIHtcblx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXG5cdFx0XHQvLyBFbmQgdXBkYXRlIGNvdWxkIGNoYW5nZSB0aGUgb2JzZXJ2ZXIgbGlzdC5cblx0XHRcdGNvbnN0IG9ic2VydmVycyA9IFsuLi50aGlzLl9vYnNlcnZlcnNdO1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIG9ic2VydmVycykge1xuXHRcdFx0XHRyLmVuZFVwZGF0ZSh0aGlzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYWRkT2JzZXJ2ZXIob2JzZXJ2ZXI6IElPYnNlcnZlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZENhbGxCZWdpblVwZGF0ZSA9ICF0aGlzLl9vYnNlcnZlcnMuaGFzKG9ic2VydmVyKSAmJiB0aGlzLl91cGRhdGVDb3VudGVyID4gMDtcblx0XHRzdXBlci5hZGRPYnNlcnZlcihvYnNlcnZlcik7XG5cblx0XHRpZiAoc2hvdWxkQ2FsbEJlZ2luVXBkYXRlKSB7XG5cdFx0XHRvYnNlcnZlci5iZWdpblVwZGF0ZSh0aGlzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVtb3ZlT2JzZXJ2ZXIob2JzZXJ2ZXI6IElPYnNlcnZlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZENhbGxFbmRVcGRhdGUgPSB0aGlzLl9vYnNlcnZlcnMuaGFzKG9ic2VydmVyKSAmJiB0aGlzLl91cGRhdGVDb3VudGVyID4gMDtcblx0XHRzdXBlci5yZW1vdmVPYnNlcnZlcihvYnNlcnZlcik7XG5cblx0XHRpZiAoc2hvdWxkQ2FsbEVuZFVwZGF0ZSkge1xuXHRcdFx0Ly8gQ2FsbGluZyBlbmQgdXBkYXRlIGFmdGVyIHJlbW92aW5nIHRoZSBvYnNlcnZlciBtYWtlcyBzdXJlIGVuZFVwZGF0ZSBjYW5ub3QgYmUgY2FsbGVkIHR3aWNlIGhlcmUuXG5cdFx0XHRvYnNlcnZlci5lbmRVcGRhdGUodGhpcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldCh2YWx1ZTogVCwgdHg6IElUcmFuc2FjdGlvbiB8IHVuZGVmaW5lZCwgY2hhbmdlOiBUQ2hhbmdlKTogdm9pZCB7XG5cdFx0aWYgKGNoYW5nZSA9PT0gdW5kZWZpbmVkICYmIHRoaXMuX2VxdWFsaXR5Q29tcGFyYXRvcih0aGlzLl92YWx1ZSwgdmFsdWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IF90eDogVHJhbnNhY3Rpb25JbXBsIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghdHgpIHtcblx0XHRcdHR4ID0gX3R4ID0gbmV3IFRyYW5zYWN0aW9uSW1wbCgoKSA9PiB7IH0sICgpID0+IGBTZXR0aW5nICR7dGhpcy5kZWJ1Z05hbWV9YCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pc1VwVG9EYXRlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9zZXRWYWx1ZSh2YWx1ZSk7XG5cdFx0XHRpZiAoY2hhbmdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZGVsdGFzLnB1c2goY2hhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0dHgudXBkYXRlT2JzZXJ2ZXIoe1xuXHRcdFx0XHRiZWdpblVwZGF0ZTogKCkgPT4gdGhpcy5fYmVnaW5VcGRhdGUoKSxcblx0XHRcdFx0ZW5kVXBkYXRlOiAoKSA9PiB0aGlzLl9lbmRVcGRhdGUoKSxcblx0XHRcdFx0aGFuZGxlQ2hhbmdlOiAob2JzZXJ2YWJsZSwgY2hhbmdlKSA9PiB7IH0sXG5cdFx0XHRcdGhhbmRsZVBvc3NpYmxlQ2hhbmdlOiAob2JzZXJ2YWJsZSkgPT4geyB9LFxuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdGlmICh0aGlzLl91cGRhdGVDb3VudGVyID4gMSkge1xuXHRcdFx0XHQvLyBXZSBhbHJlYWR5IHN0YXJ0ZWQgYmVnaW4vZW5kIHVwZGF0ZSwgc28gd2UgbmVlZCB0byBtYW51YWxseSBjYWxsIGhhbmRsZVBvc3NpYmxlQ2hhbmdlXG5cdFx0XHRcdGZvciAoY29uc3Qgb2JzZXJ2ZXIgb2YgdGhpcy5fb2JzZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0b2JzZXJ2ZXIuaGFuZGxlUG9zc2libGVDaGFuZ2UodGhpcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoX3R4KSB7XG5cdFx0XHRcdF90eC5maW5pc2goKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmRlYnVnTmFtZX06ICR7dGhpcy5fdmFsdWV9YDtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2V0VmFsdWUobmV3VmFsdWU6IFQpOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZSA9IG5ld1ZhbHVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHNCQUFzQjtBQU14QixNQUFNLDRCQUNKLGVBQ21DO0FBQUEsRUFTM0MsWUFDa0IsZ0JBQ2pCLGNBQ2lCLHFCQUNqQixlQUNDO0FBQ0QsVUFBTSxhQUFhO0FBTEY7QUFFQTtBQVZsQixTQUFRLGNBQWM7QUFDdEIsU0FBaUIsVUFBcUIsQ0FBQztBQTJDdkMsU0FBUSxpQkFBaUI7QUE5QnhCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFBQSxFQVpBLElBQUksWUFBWTtBQUNmLFdBQU8sS0FBSyxlQUFlLGFBQWEsSUFBSSxLQUFLO0FBQUEsRUFDbEQ7QUFBQSxFQVlnQixNQUFTO0FBQ3hCLFNBQUssUUFBUTtBQUNiLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVRLFVBQWdCO0FBQ3ZCLFFBQUksS0FBSyxhQUFhO0FBQ3JCO0FBQUEsSUFDRDtBQUNBLFNBQUss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
