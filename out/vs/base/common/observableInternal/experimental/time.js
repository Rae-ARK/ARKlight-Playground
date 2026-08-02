import { Disposable } from "../../lifecycle.js";
import { DisposableStore, toDisposable } from "../commonFacade/deps.js";
import { observableValue } from "../observables/observableValue.js";
import { autorun } from "../reactions/autorun.js";
class TotalTrueTimeObservable extends Disposable {
  constructor(value) {
    super();
    this.value = value;
    this._totalTime = 0;
    this._startTime = void 0;
    this._register(autorun((reader) => {
      const isTrue = this.value.read(reader);
      if (isTrue) {
        this._startTime = Date.now();
      } else {
        if (this._startTime !== void 0) {
          const delta = Date.now() - this._startTime;
          this._totalTime += delta;
          this._startTime = void 0;
        }
      }
    }));
  }
  /**
   * Reports the total time the observable has been true in milliseconds.
   * E.g. `true` for 100ms, then `false` for 50ms, then `true` for 200ms results in 300ms.
  */
  totalTimeMs() {
    if (this._startTime !== void 0) {
      return this._totalTime + (Date.now() - this._startTime);
    }
    return this._totalTime;
  }
  /**
   * Runs the callback when the total time the observable has been true increased by the given delta in milliseconds.
  */
  fireWhenTimeIncreasedBy(deltaTimeMs, callback) {
    const store = new DisposableStore();
    let accumulatedTime = 0;
    let startTime = void 0;
    store.add(autorun((reader) => {
      const isTrue = this.value.read(reader);
      if (isTrue) {
        startTime = Date.now();
        const remainingTime = deltaTimeMs - accumulatedTime;
        if (remainingTime <= 0) {
          callback();
          store.dispose();
          return;
        }
        const handle = setTimeout(() => {
          accumulatedTime += Date.now() - startTime;
          startTime = void 0;
          callback();
          store.dispose();
        }, remainingTime);
        reader.store.add(toDisposable(() => {
          clearTimeout(handle);
          if (startTime !== void 0) {
            accumulatedTime += Date.now() - startTime;
            startTime = void 0;
          }
        }));
      }
    }));
    return store;
  }
}
function wasTrueRecently(obs, timeMs, store) {
  const result = observableValue("wasTrueRecently", false);
  let timeout;
  store.add(autorun((reader) => {
    const value = obs.read(reader);
    if (value) {
      result.set(true, void 0);
      if (timeout !== void 0) {
        clearTimeout(timeout);
        timeout = void 0;
      }
    } else {
      timeout = setTimeout(() => {
        result.set(false, void 0);
        timeout = void 0;
      }, timeMs);
    }
  }));
  store.add(toDisposable(() => {
    if (timeout !== void 0) {
      clearTimeout(timeout);
    }
  }));
  return result;
}
export {
  TotalTrueTimeObservable,
  wasTrueRecently
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9leHBlcmltZW50YWwvdGltZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi9iYXNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uL2NvbW1vbkZhY2FkZS9kZXBzLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uL29ic2VydmFibGVzL29ic2VydmFibGVWYWx1ZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vcmVhY3Rpb25zL2F1dG9ydW4uanMnO1xuXG4vKiogTWVhc3VyZXMgdGhlIHRvdGFsIHRpbWUgYW4gb2JzZXJ2YWJsZSBoYWQgdGhlIHZhbHVlIFwidHJ1ZVwiLiAqL1xuZXhwb3J0IGNsYXNzIFRvdGFsVHJ1ZVRpbWVPYnNlcnZhYmxlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3RvdGFsVGltZSA9IDA7XG5cdHByaXZhdGUgX3N0YXJ0VGltZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmFsdWU6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzVHJ1ZSA9IHRoaXMudmFsdWUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzVHJ1ZSkge1xuXHRcdFx0XHR0aGlzLl9zdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0YXJ0VGltZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVsdGEgPSBEYXRlLm5vdygpIC0gdGhpcy5fc3RhcnRUaW1lO1xuXHRcdFx0XHRcdHRoaXMuX3RvdGFsVGltZSArPSBkZWx0YTtcblx0XHRcdFx0XHR0aGlzLl9zdGFydFRpbWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVwb3J0cyB0aGUgdG90YWwgdGltZSB0aGUgb2JzZXJ2YWJsZSBoYXMgYmVlbiB0cnVlIGluIG1pbGxpc2Vjb25kcy5cblx0ICogRS5nLiBgdHJ1ZWAgZm9yIDEwMG1zLCB0aGVuIGBmYWxzZWAgZm9yIDUwbXMsIHRoZW4gYHRydWVgIGZvciAyMDBtcyByZXN1bHRzIGluIDMwMG1zLlxuXHQqL1xuXHRwdWJsaWMgdG90YWxUaW1lTXMoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fc3RhcnRUaW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b3RhbFRpbWUgKyAoRGF0ZS5ub3coKSAtIHRoaXMuX3N0YXJ0VGltZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90b3RhbFRpbWU7XG5cdH1cblxuXHQvKipcblx0ICogUnVucyB0aGUgY2FsbGJhY2sgd2hlbiB0aGUgdG90YWwgdGltZSB0aGUgb2JzZXJ2YWJsZSBoYXMgYmVlbiB0cnVlIGluY3JlYXNlZCBieSB0aGUgZ2l2ZW4gZGVsdGEgaW4gbWlsbGlzZWNvbmRzLlxuXHQqL1xuXHRwdWJsaWMgZmlyZVdoZW5UaW1lSW5jcmVhc2VkQnkoZGVsdGFUaW1lTXM6IG51bWJlciwgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGFjY3VtdWxhdGVkVGltZSA9IDA7XG5cdFx0bGV0IHN0YXJ0VGltZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzVHJ1ZSA9IHRoaXMudmFsdWUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoaXNUcnVlKSB7XG5cdFx0XHRcdHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHRcdGNvbnN0IHJlbWFpbmluZ1RpbWUgPSBkZWx0YVRpbWVNcyAtIGFjY3VtdWxhdGVkVGltZTtcblxuXHRcdFx0XHRpZiAocmVtYWluaW5nVGltZSA8PSAwKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2soKTtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0YWNjdW11bGF0ZWRUaW1lICs9IChEYXRlLm5vdygpIC0gc3RhcnRUaW1lISk7XG5cdFx0XHRcdFx0c3RhcnRUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9LCByZW1haW5pbmdUaW1lKTtcblxuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KGhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0VGltZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRhY2N1bXVsYXRlZFRpbWUgKz0gKERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0XHRcdFx0c3RhcnRUaW1lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxufVxuXG4vKipcbiAqIFJldHVybnMgYW4gb2JzZXJ2YWJsZSB0aGF0IGlzIHRydWUgd2hlbiB0aGUgaW5wdXQgb2JzZXJ2YWJsZSB3YXMgdHJ1ZSB3aXRoaW4gdGhlIGxhc3QgYHRpbWVNc2AgbWlsbGlzZWNvbmRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2FzVHJ1ZVJlY2VudGx5KG9iczogSU9ic2VydmFibGU8Ym9vbGVhbj4sIHRpbWVNczogbnVtYmVyLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRjb25zdCByZXN1bHQgPSBvYnNlcnZhYmxlVmFsdWUoJ3dhc1RydWVSZWNlbnRseScsIGZhbHNlKTtcblx0bGV0IHRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBvYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0cmVzdWx0LnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cdFx0XHRcdHRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0cmVzdWx0LnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdH0sIHRpbWVNcyk7XG5cdFx0fVxuXHR9KSk7XG5cblx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0aWYgKHRpbWVvdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHJldHVybiByZXN1bHQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGlCQUE4QixvQkFBb0I7QUFDM0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBR2pCLE1BQU0sZ0NBQWdDLFdBQVc7QUFBQSxFQUl2RCxZQUNrQixPQUNoQjtBQUNELFVBQU07QUFGVztBQUpsQixTQUFRLGFBQWE7QUFDckIsU0FBUSxhQUFpQztBQU14QyxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sU0FBUyxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ3JDLFVBQUksUUFBUTtBQUNYLGFBQUssYUFBYSxLQUFLLElBQUk7QUFBQSxNQUM1QixPQUFPO0FBQ04sWUFBSSxLQUFLLGVBQWUsUUFBVztBQUNsQyxnQkFBTSxRQUFRLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDaEMsZUFBSyxjQUFjO0FBQ25CLGVBQUssYUFBYTtBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNTyxjQUFzQjtBQUM1QixRQUFJLEtBQUssZUFBZSxRQUFXO0FBQ2xDLGFBQU8sS0FBSyxjQUFjLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFBQSxJQUM3QztBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLHdCQUF3QixhQUFxQixVQUFtQztBQUN0RixVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsUUFBSSxrQkFBa0I7QUFDdEIsUUFBSSxZQUFnQztBQUVwQyxVQUFNLElBQUksUUFBUSxZQUFVO0FBQzNCLFlBQU0sU0FBUyxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBRXJDLFVBQUksUUFBUTtBQUNYLG9CQUFZLEtBQUssSUFBSTtBQUNyQixjQUFNLGdCQUFnQixjQUFjO0FBRXBDLFlBQUksaUJBQWlCLEdBQUc7QUFDdkIsbUJBQVM7QUFDVCxnQkFBTSxRQUFRO0FBQ2Q7QUFBQSxRQUNEO0FBRUEsY0FBTSxTQUFTLFdBQVcsTUFBTTtBQUMvQiw2QkFBb0IsS0FBSyxJQUFJLElBQUk7QUFDakMsc0JBQVk7QUFDWixtQkFBUztBQUNULGdCQUFNLFFBQVE7QUFBQSxRQUNmLEdBQUcsYUFBYTtBQUVoQixlQUFPLE1BQU0sSUFBSSxhQUFhLE1BQU07QUFDbkMsdUJBQWEsTUFBTTtBQUNuQixjQUFJLGNBQWMsUUFBVztBQUM1QiwrQkFBb0IsS0FBSyxJQUFJLElBQUk7QUFDakMsd0JBQVk7QUFBQSxVQUNiO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBS08sU0FBUyxnQkFBZ0IsS0FBMkIsUUFBZ0IsT0FBOEM7QUFDeEgsUUFBTSxTQUFTLGdCQUFnQixtQkFBbUIsS0FBSztBQUN2RCxNQUFJO0FBRUosUUFBTSxJQUFJLFFBQVEsWUFBVTtBQUMzQixVQUFNLFFBQVEsSUFBSSxLQUFLLE1BQU07QUFDN0IsUUFBSSxPQUFPO0FBQ1YsYUFBTyxJQUFJLE1BQU0sTUFBUztBQUMxQixVQUFJLFlBQVksUUFBVztBQUMxQixxQkFBYSxPQUFPO0FBQ3BCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLElBQ0QsT0FBTztBQUNOLGdCQUFVLFdBQVcsTUFBTTtBQUMxQixlQUFPLElBQUksT0FBTyxNQUFTO0FBQzNCLGtCQUFVO0FBQUEsTUFDWCxHQUFHLE1BQU07QUFBQSxJQUNWO0FBQUEsRUFDRCxDQUFDLENBQUM7QUFFRixRQUFNLElBQUksYUFBYSxNQUFNO0FBQzVCLFFBQUksWUFBWSxRQUFXO0FBQzFCLG1CQUFhLE9BQU87QUFBQSxJQUNyQjtBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogW10KfQo=
