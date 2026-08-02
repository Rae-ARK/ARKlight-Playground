import { addLogger } from "./logging.js";
import { getClassName } from "../debugName.js";
import { Derived } from "../observables/derivedImpl.js";
let consoleObservableLogger;
function logObservableToConsole(obs) {
  if (!consoleObservableLogger) {
    consoleObservableLogger = new ConsoleObservableLogger();
    addLogger(consoleObservableLogger);
  }
  consoleObservableLogger.addFilteredObj(obs);
}
class ConsoleObservableLogger {
  constructor() {
    this.indentation = 0;
    this.changedObservablesSets = /* @__PURE__ */ new WeakMap();
  }
  addFilteredObj(obj) {
    if (!this._filteredObjects) {
      this._filteredObjects = /* @__PURE__ */ new Set();
    }
    this._filteredObjects.add(obj);
  }
  _isIncluded(obj) {
    return this._filteredObjects?.has(obj) ?? true;
  }
  textToConsoleArgs(text) {
    return consoleTextToArgs([
      normalText(repeat("|  ", this.indentation)),
      text
    ]);
  }
  formatInfo(info) {
    if (!info.hadValue) {
      return [
        normalText(` `),
        styled(formatValue(info.newValue, 60), {
          color: "green"
        }),
        normalText(` (initial)`)
      ];
    }
    return info.didChange ? [
      normalText(` `),
      styled(formatValue(info.oldValue, 70), {
        color: "red",
        strikeThrough: true
      }),
      normalText(` `),
      styled(formatValue(info.newValue, 60), {
        color: "green"
      })
    ] : [normalText(` (unchanged)`)];
  }
  handleObservableCreated(observable) {
    if (observable instanceof Derived) {
      const derived = observable;
      this.changedObservablesSets.set(derived, /* @__PURE__ */ new Set());
      const debugTrackUpdating = false;
      if (debugTrackUpdating) {
        const updating = [];
        derived.__debugUpdating = updating;
        const existingBeginUpdate = derived.beginUpdate;
        derived.beginUpdate = (obs) => {
          updating.push(obs);
          return existingBeginUpdate.apply(derived, [obs]);
        };
        const existingEndUpdate = derived.endUpdate;
        derived.endUpdate = (obs) => {
          const idx = updating.indexOf(obs);
          if (idx === -1) {
            console.error("endUpdate called without beginUpdate", derived.debugName, obs.debugName);
          }
          updating.splice(idx, 1);
          return existingEndUpdate.apply(derived, [obs]);
        };
      }
    }
  }
  handleOnListenerCountChanged(observable, newCount) {
  }
  handleObservableUpdated(observable, info) {
    if (!this._isIncluded(observable)) {
      return;
    }
    if (observable instanceof Derived) {
      this._handleDerivedRecomputed(observable, info);
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("observable value changed"),
      styled(observable.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info)
    ]));
  }
  formatChanges(changes) {
    if (changes.size === 0) {
      return void 0;
    }
    return styled(
      " (changed deps: " + [...changes].map((o) => o.debugName).join(", ") + ")",
      { color: "gray" }
    );
  }
  handleDerivedDependencyChanged(derived, observable, change) {
    if (!this._isIncluded(derived)) {
      return;
    }
    this.changedObservablesSets.get(derived)?.add(observable);
  }
  _handleDerivedRecomputed(derived, info) {
    if (!this._isIncluded(derived)) {
      return;
    }
    const changedObservables = this.changedObservablesSets.get(derived);
    if (!changedObservables) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("derived recomputed"),
      styled(derived.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info),
      this.formatChanges(changedObservables),
      { data: [{ fn: derived._debugNameData.referenceFn ?? derived._computeFn }] }
    ]));
    changedObservables.clear();
  }
  handleDerivedCleared(derived) {
    if (!this._isIncluded(derived)) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("derived cleared"),
      styled(derived.debugName, { color: "BlueViolet" })
    ]));
  }
  handleFromEventObservableTriggered(observable, info) {
    if (!this._isIncluded(observable)) {
      return;
    }
    console.log(...this.textToConsoleArgs([
      formatKind("observable from event triggered"),
      styled(observable.debugName, { color: "BlueViolet" }),
      ...this.formatInfo(info),
      { data: [{ fn: observable._getValue }] }
    ]));
  }
  handleAutorunCreated(autorun) {
    if (!this._isIncluded(autorun)) {
      return;
    }
    this.changedObservablesSets.set(autorun, /* @__PURE__ */ new Set());
  }
  handleAutorunDisposed(autorun) {
  }
  handleAutorunDependencyChanged(autorun, observable, change) {
    if (!this._isIncluded(autorun)) {
      return;
    }
    this.changedObservablesSets.get(autorun).add(observable);
  }
  handleAutorunStarted(autorun) {
    const changedObservables = this.changedObservablesSets.get(autorun);
    if (!changedObservables) {
      return;
    }
    if (this._isIncluded(autorun)) {
      console.log(...this.textToConsoleArgs([
        formatKind("autorun"),
        styled(autorun.debugName, { color: "BlueViolet" }),
        this.formatChanges(changedObservables),
        { data: [{ fn: autorun._debugNameData.referenceFn ?? autorun._runFn }] }
      ]));
    }
    changedObservables.clear();
    this.indentation++;
  }
  handleAutorunFinished(autorun) {
    this.indentation--;
  }
  handleBeginTransaction(transaction) {
    let transactionName = transaction.getDebugName();
    if (transactionName === void 0) {
      transactionName = "";
    }
    if (this._isIncluded(transaction)) {
      console.log(...this.textToConsoleArgs([
        formatKind("transaction"),
        styled(transactionName, { color: "BlueViolet" }),
        { data: [{ fn: transaction._fn }] }
      ]));
    }
    this.indentation++;
  }
  handleEndTransaction() {
    this.indentation--;
  }
}
function consoleTextToArgs(text) {
  const styles = new Array();
  const data = [];
  let firstArg = "";
  function process(t) {
    if ("length" in t) {
      for (const item of t) {
        if (item) {
          process(item);
        }
      }
    } else if ("text" in t) {
      firstArg += `%c${t.text}`;
      styles.push(t.style);
      if (t.data) {
        data.push(...t.data);
      }
    } else if ("data" in t) {
      data.push(...t.data);
    }
  }
  process(text);
  const result = [firstArg, ...styles];
  result.push(...data);
  return result;
}
function normalText(text) {
  return styled(text, { color: "black" });
}
function formatKind(kind) {
  return styled(padStr(`${kind}: `, 10), { color: "black", bold: true });
}
function styled(text, options = {
  color: "black"
}) {
  function objToCss(styleObj) {
    return Object.entries(styleObj).reduce(
      (styleString, [propName, propValue]) => {
        return `${styleString}${propName}:${propValue};`;
      },
      ""
    );
  }
  const style = {
    color: options.color
  };
  if (options.strikeThrough) {
    style["text-decoration"] = "line-through";
  }
  if (options.bold) {
    style["font-weight"] = "bold";
  }
  return {
    text,
    style: objToCss(style)
  };
}
function formatValue(value, availableLen) {
  switch (typeof value) {
    case "number":
      return "" + value;
    case "string":
      if (value.length + 2 <= availableLen) {
        return `"${value}"`;
      }
      return `"${value.substr(0, availableLen - 7)}"+...`;
    case "boolean":
      return value ? "true" : "false";
    case "undefined":
      return "undefined";
    case "object":
      if (value === null) {
        return "null";
      }
      if (Array.isArray(value)) {
        return formatArray(value, availableLen);
      }
      return formatObject(value, availableLen);
    case "symbol":
      return value.toString();
    case "function":
      return `[[Function${value.name ? " " + value.name : ""}]]`;
    default:
      return "" + value;
  }
}
function formatArray(value, availableLen) {
  let result = "[ ";
  let first = true;
  for (const val of value) {
    if (!first) {
      result += ", ";
    }
    if (result.length - 5 > availableLen) {
      result += "...";
      break;
    }
    first = false;
    result += `${formatValue(val, availableLen - result.length)}`;
  }
  result += " ]";
  return result;
}
function formatObject(value, availableLen) {
  if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
    const val = value.toString();
    if (val.length <= availableLen) {
      return val;
    }
    return val.substring(0, availableLen - 3) + "...";
  }
  const className = getClassName(value);
  let result = className ? className + "(" : "{ ";
  let first = true;
  for (const [key, val] of Object.entries(value)) {
    if (!first) {
      result += ", ";
    }
    if (result.length - 5 > availableLen) {
      result += "...";
      break;
    }
    first = false;
    result += `${key}: ${formatValue(val, availableLen - result.length)}`;
  }
  result += className ? ")" : " }";
  return result;
}
function repeat(str, count) {
  let result = "";
  for (let i = 1; i <= count; i++) {
    result += str;
  }
  return result;
}
function padStr(str, length) {
  while (str.length < length) {
    str += " ";
  }
  return str;
}
export {
  ConsoleObservableLogger,
  formatValue,
  logObservableToConsole
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvY29tbW9uL29ic2VydmFibGVJbnRlcm5hbC9sb2dnaW5nL2NvbnNvbGVPYnNlcnZhYmxlTG9nZ2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi9iYXNlLmpzJztcbmltcG9ydCB7IFRyYW5zYWN0aW9uSW1wbCB9IGZyb20gJy4uL3RyYW5zYWN0aW9uLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlTG9nZ2VyLCBJQ2hhbmdlSW5mb3JtYXRpb24sIGFkZExvZ2dlciB9IGZyb20gJy4vbG9nZ2luZy5qcyc7XG5pbXBvcnQgeyBGcm9tRXZlbnRPYnNlcnZhYmxlIH0gZnJvbSAnLi4vb2JzZXJ2YWJsZXMvb2JzZXJ2YWJsZUZyb21FdmVudC5qcyc7XG5pbXBvcnQgeyBnZXRDbGFzc05hbWUgfSBmcm9tICcuLi9kZWJ1Z05hbWUuanMnO1xuaW1wb3J0IHsgRGVyaXZlZCB9IGZyb20gJy4uL29ic2VydmFibGVzL2Rlcml2ZWRJbXBsLmpzJztcbmltcG9ydCB7IEF1dG9ydW5PYnNlcnZlciB9IGZyb20gJy4uL3JlYWN0aW9ucy9hdXRvcnVuSW1wbC5qcyc7XG5cbmxldCBjb25zb2xlT2JzZXJ2YWJsZUxvZ2dlcjogQ29uc29sZU9ic2VydmFibGVMb2dnZXIgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2dPYnNlcnZhYmxlVG9Db25zb2xlKG9iczogSU9ic2VydmFibGU8YW55Pik6IHZvaWQge1xuXHRpZiAoIWNvbnNvbGVPYnNlcnZhYmxlTG9nZ2VyKSB7XG5cdFx0Y29uc29sZU9ic2VydmFibGVMb2dnZXIgPSBuZXcgQ29uc29sZU9ic2VydmFibGVMb2dnZXIoKTtcblx0XHRhZGRMb2dnZXIoY29uc29sZU9ic2VydmFibGVMb2dnZXIpO1xuXHR9XG5cdGNvbnNvbGVPYnNlcnZhYmxlTG9nZ2VyLmFkZEZpbHRlcmVkT2JqKG9icyk7XG59XG5cbmV4cG9ydCBjbGFzcyBDb25zb2xlT2JzZXJ2YWJsZUxvZ2dlciBpbXBsZW1lbnRzIElPYnNlcnZhYmxlTG9nZ2VyIHtcblx0cHJpdmF0ZSBpbmRlbnRhdGlvbiA9IDA7XG5cblx0cHJpdmF0ZSBfZmlsdGVyZWRPYmplY3RzOiBTZXQ8dW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIGFkZEZpbHRlcmVkT2JqKG9iajogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZmlsdGVyZWRPYmplY3RzKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJlZE9iamVjdHMgPSBuZXcgU2V0KCk7XG5cdFx0fVxuXHRcdHRoaXMuX2ZpbHRlcmVkT2JqZWN0cy5hZGQob2JqKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSW5jbHVkZWQob2JqOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbHRlcmVkT2JqZWN0cz8uaGFzKG9iaikgPz8gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdGV4dFRvQ29uc29sZUFyZ3ModGV4dDogQ29uc29sZVRleHQpOiB1bmtub3duW10ge1xuXHRcdHJldHVybiBjb25zb2xlVGV4dFRvQXJncyhbXG5cdFx0XHRub3JtYWxUZXh0KHJlcGVhdCgnfCAgJywgdGhpcy5pbmRlbnRhdGlvbikpLFxuXHRcdFx0dGV4dCxcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgZm9ybWF0SW5mbyhpbmZvOiBJQ2hhbmdlSW5mb3JtYXRpb24pOiBDb25zb2xlVGV4dFtdIHtcblx0XHRpZiAoIWluZm8uaGFkVmFsdWUpIHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG5vcm1hbFRleHQoYCBgKSxcblx0XHRcdFx0c3R5bGVkKGZvcm1hdFZhbHVlKGluZm8ubmV3VmFsdWUsIDYwKSwge1xuXHRcdFx0XHRcdGNvbG9yOiAnZ3JlZW4nLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bm9ybWFsVGV4dChgIChpbml0aWFsKWApLFxuXHRcdFx0XTtcblx0XHR9XG5cdFx0cmV0dXJuIGluZm8uZGlkQ2hhbmdlXG5cdFx0XHQ/IFtcblx0XHRcdFx0bm9ybWFsVGV4dChgIGApLFxuXHRcdFx0XHRzdHlsZWQoZm9ybWF0VmFsdWUoaW5mby5vbGRWYWx1ZSwgNzApLCB7XG5cdFx0XHRcdFx0Y29sb3I6ICdyZWQnLFxuXHRcdFx0XHRcdHN0cmlrZVRocm91Z2g6IHRydWUsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRub3JtYWxUZXh0KGAgYCksXG5cdFx0XHRcdHN0eWxlZChmb3JtYXRWYWx1ZShpbmZvLm5ld1ZhbHVlLCA2MCksIHtcblx0XHRcdFx0XHRjb2xvcjogJ2dyZWVuJyxcblx0XHRcdFx0fSksXG5cdFx0XHRdXG5cdFx0XHQ6IFtub3JtYWxUZXh0KGAgKHVuY2hhbmdlZClgKV07XG5cdH1cblxuXHRoYW5kbGVPYnNlcnZhYmxlQ3JlYXRlZChvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+KTogdm9pZCB7XG5cdFx0aWYgKG9ic2VydmFibGUgaW5zdGFuY2VvZiBEZXJpdmVkKSB7XG5cdFx0XHRjb25zdCBkZXJpdmVkID0gb2JzZXJ2YWJsZTtcblx0XHRcdHRoaXMuY2hhbmdlZE9ic2VydmFibGVzU2V0cy5zZXQoZGVyaXZlZCwgbmV3IFNldCgpKTtcblxuXHRcdFx0Y29uc3QgZGVidWdUcmFja1VwZGF0aW5nID0gZmFsc2U7XG5cdFx0XHRpZiAoZGVidWdUcmFja1VwZGF0aW5nKSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0aW5nOiBJT2JzZXJ2YWJsZTxhbnk+W10gPSBbXTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdChkZXJpdmVkIGFzIGFueSkuX19kZWJ1Z1VwZGF0aW5nID0gdXBkYXRpbmc7XG5cblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdCZWdpblVwZGF0ZSA9IGRlcml2ZWQuYmVnaW5VcGRhdGU7XG5cdFx0XHRcdGRlcml2ZWQuYmVnaW5VcGRhdGUgPSAob2JzKSA9PiB7XG5cdFx0XHRcdFx0dXBkYXRpbmcucHVzaChvYnMpO1xuXHRcdFx0XHRcdHJldHVybiBleGlzdGluZ0JlZ2luVXBkYXRlLmFwcGx5KGRlcml2ZWQsIFtvYnNdKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBleGlzdGluZ0VuZFVwZGF0ZSA9IGRlcml2ZWQuZW5kVXBkYXRlO1xuXHRcdFx0XHRkZXJpdmVkLmVuZFVwZGF0ZSA9IChvYnMpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpZHggPSB1cGRhdGluZy5pbmRleE9mKG9icyk7XG5cdFx0XHRcdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ2VuZFVwZGF0ZSBjYWxsZWQgd2l0aG91dCBiZWdpblVwZGF0ZScsIGRlcml2ZWQuZGVidWdOYW1lLCBvYnMuZGVidWdOYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dXBkYXRpbmcuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nRW5kVXBkYXRlLmFwcGx5KGRlcml2ZWQsIFtvYnNdKTtcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRoYW5kbGVPbkxpc3RlbmVyQ291bnRDaGFuZ2VkKG9ic2VydmFibGU6IElPYnNlcnZhYmxlPGFueT4sIG5ld0NvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0fVxuXG5cdGhhbmRsZU9ic2VydmFibGVVcGRhdGVkKG9ic2VydmFibGU6IElPYnNlcnZhYmxlPHVua25vd24+LCBpbmZvOiBJQ2hhbmdlSW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQob2JzZXJ2YWJsZSkpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKG9ic2VydmFibGUgaW5zdGFuY2VvZiBEZXJpdmVkKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVEZXJpdmVkUmVjb21wdXRlZChvYnNlcnZhYmxlLCBpbmZvKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zb2xlLmxvZyguLi50aGlzLnRleHRUb0NvbnNvbGVBcmdzKFtcblx0XHRcdGZvcm1hdEtpbmQoJ29ic2VydmFibGUgdmFsdWUgY2hhbmdlZCcpLFxuXHRcdFx0c3R5bGVkKG9ic2VydmFibGUuZGVidWdOYW1lLCB7IGNvbG9yOiAnQmx1ZVZpb2xldCcgfSksXG5cdFx0XHQuLi50aGlzLmZvcm1hdEluZm8oaW5mbyksXG5cdFx0XSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBjaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBTZXQ8SU9ic2VydmFibGU8YW55Pj4+KCk7XG5cblx0Zm9ybWF0Q2hhbmdlcyhjaGFuZ2VzOiBTZXQ8SU9ic2VydmFibGU8YW55Pj4pOiBDb25zb2xlVGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGNoYW5nZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN0eWxlZChcblx0XHRcdCcgKGNoYW5nZWQgZGVwczogJyArXG5cdFx0XHRbLi4uY2hhbmdlc10ubWFwKChvKSA9PiBvLmRlYnVnTmFtZSkuam9pbignLCAnKSArXG5cdFx0XHQnKScsXG5cdFx0XHR7IGNvbG9yOiAnZ3JheScgfVxuXHRcdCk7XG5cdH1cblxuXHRoYW5kbGVEZXJpdmVkRGVwZW5kZW5jeUNoYW5nZWQoZGVyaXZlZDogRGVyaXZlZDxhbnk+LCBvYnNlcnZhYmxlOiBJT2JzZXJ2YWJsZTxhbnk+LCBjaGFuZ2U6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzSW5jbHVkZWQoZGVyaXZlZCkpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLmNoYW5nZWRPYnNlcnZhYmxlc1NldHMuZ2V0KGRlcml2ZWQpPy5hZGQob2JzZXJ2YWJsZSk7XG5cdH1cblxuXHRfaGFuZGxlRGVyaXZlZFJlY29tcHV0ZWQoZGVyaXZlZDogRGVyaXZlZDx1bmtub3duPiwgaW5mbzogSUNoYW5nZUluZm9ybWF0aW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0luY2x1ZGVkKGRlcml2ZWQpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY2hhbmdlZE9ic2VydmFibGVzID0gdGhpcy5jaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzLmdldChkZXJpdmVkKTtcblx0XHRpZiAoIWNoYW5nZWRPYnNlcnZhYmxlcykgeyByZXR1cm47IH1cblx0XHRjb25zb2xlLmxvZyguLi50aGlzLnRleHRUb0NvbnNvbGVBcmdzKFtcblx0XHRcdGZvcm1hdEtpbmQoJ2Rlcml2ZWQgcmVjb21wdXRlZCcpLFxuXHRcdFx0c3R5bGVkKGRlcml2ZWQuZGVidWdOYW1lLCB7IGNvbG9yOiAnQmx1ZVZpb2xldCcgfSksXG5cdFx0XHQuLi50aGlzLmZvcm1hdEluZm8oaW5mbyksXG5cdFx0XHR0aGlzLmZvcm1hdENoYW5nZXMoY2hhbmdlZE9ic2VydmFibGVzKSxcblx0XHRcdHsgZGF0YTogW3sgZm46IGRlcml2ZWQuX2RlYnVnTmFtZURhdGEucmVmZXJlbmNlRm4gPz8gZGVyaXZlZC5fY29tcHV0ZUZuIH1dIH1cblx0XHRdKSk7XG5cdFx0Y2hhbmdlZE9ic2VydmFibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRoYW5kbGVEZXJpdmVkQ2xlYXJlZChkZXJpdmVkOiBEZXJpdmVkPHVua25vd24+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0luY2x1ZGVkKGRlcml2ZWQpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc29sZS5sb2coLi4udGhpcy50ZXh0VG9Db25zb2xlQXJncyhbXG5cdFx0XHRmb3JtYXRLaW5kKCdkZXJpdmVkIGNsZWFyZWQnKSxcblx0XHRcdHN0eWxlZChkZXJpdmVkLmRlYnVnTmFtZSwgeyBjb2xvcjogJ0JsdWVWaW9sZXQnIH0pLFxuXHRcdF0pKTtcblx0fVxuXG5cdGhhbmRsZUZyb21FdmVudE9ic2VydmFibGVUcmlnZ2VyZWQob2JzZXJ2YWJsZTogRnJvbUV2ZW50T2JzZXJ2YWJsZTxhbnksIGFueT4sIGluZm86IElDaGFuZ2VJbmZvcm1hdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNJbmNsdWRlZChvYnNlcnZhYmxlKSkgeyByZXR1cm47IH1cblxuXHRcdGNvbnNvbGUubG9nKC4uLnRoaXMudGV4dFRvQ29uc29sZUFyZ3MoW1xuXHRcdFx0Zm9ybWF0S2luZCgnb2JzZXJ2YWJsZSBmcm9tIGV2ZW50IHRyaWdnZXJlZCcpLFxuXHRcdFx0c3R5bGVkKG9ic2VydmFibGUuZGVidWdOYW1lLCB7IGNvbG9yOiAnQmx1ZVZpb2xldCcgfSksXG5cdFx0XHQuLi50aGlzLmZvcm1hdEluZm8oaW5mbyksXG5cdFx0XHR7IGRhdGE6IFt7IGZuOiBvYnNlcnZhYmxlLl9nZXRWYWx1ZSB9XSB9XG5cdFx0XSkpO1xuXHR9XG5cblx0aGFuZGxlQXV0b3J1bkNyZWF0ZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0luY2x1ZGVkKGF1dG9ydW4pKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5jaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzLnNldChhdXRvcnVuLCBuZXcgU2V0KCkpO1xuXHR9XG5cblx0aGFuZGxlQXV0b3J1bkRpc3Bvc2VkKGF1dG9ydW46IEF1dG9ydW5PYnNlcnZlcik6IHZvaWQge1xuXHR9XG5cblx0aGFuZGxlQXV0b3J1bkRlcGVuZGVuY3lDaGFuZ2VkKGF1dG9ydW46IEF1dG9ydW5PYnNlcnZlciwgb2JzZXJ2YWJsZTogSU9ic2VydmFibGU8YW55PiwgY2hhbmdlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0luY2x1ZGVkKGF1dG9ydW4pKSB7IHJldHVybjsgfVxuXG5cdFx0dGhpcy5jaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzLmdldChhdXRvcnVuKSEuYWRkKG9ic2VydmFibGUpO1xuXHR9XG5cblx0aGFuZGxlQXV0b3J1blN0YXJ0ZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZE9ic2VydmFibGVzID0gdGhpcy5jaGFuZ2VkT2JzZXJ2YWJsZXNTZXRzLmdldChhdXRvcnVuKTtcblx0XHRpZiAoIWNoYW5nZWRPYnNlcnZhYmxlcykgeyByZXR1cm47IH1cblxuXHRcdGlmICh0aGlzLl9pc0luY2x1ZGVkKGF1dG9ydW4pKSB7XG5cdFx0XHRjb25zb2xlLmxvZyguLi50aGlzLnRleHRUb0NvbnNvbGVBcmdzKFtcblx0XHRcdFx0Zm9ybWF0S2luZCgnYXV0b3J1bicpLFxuXHRcdFx0XHRzdHlsZWQoYXV0b3J1bi5kZWJ1Z05hbWUsIHsgY29sb3I6ICdCbHVlVmlvbGV0JyB9KSxcblx0XHRcdFx0dGhpcy5mb3JtYXRDaGFuZ2VzKGNoYW5nZWRPYnNlcnZhYmxlcyksXG5cdFx0XHRcdHsgZGF0YTogW3sgZm46IGF1dG9ydW4uX2RlYnVnTmFtZURhdGEucmVmZXJlbmNlRm4gPz8gYXV0b3J1bi5fcnVuRm4gfV0gfVxuXHRcdFx0XSkpO1xuXHRcdH1cblx0XHRjaGFuZ2VkT2JzZXJ2YWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmluZGVudGF0aW9uKys7XG5cdH1cblxuXHRoYW5kbGVBdXRvcnVuRmluaXNoZWQoYXV0b3J1bjogQXV0b3J1bk9ic2VydmVyKTogdm9pZCB7XG5cdFx0dGhpcy5pbmRlbnRhdGlvbi0tO1xuXHR9XG5cblx0aGFuZGxlQmVnaW5UcmFuc2FjdGlvbih0cmFuc2FjdGlvbjogVHJhbnNhY3Rpb25JbXBsKTogdm9pZCB7XG5cdFx0bGV0IHRyYW5zYWN0aW9uTmFtZSA9IHRyYW5zYWN0aW9uLmdldERlYnVnTmFtZSgpO1xuXHRcdGlmICh0cmFuc2FjdGlvbk5hbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJhbnNhY3Rpb25OYW1lID0gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0luY2x1ZGVkKHRyYW5zYWN0aW9uKSkge1xuXHRcdFx0Y29uc29sZS5sb2coLi4udGhpcy50ZXh0VG9Db25zb2xlQXJncyhbXG5cdFx0XHRcdGZvcm1hdEtpbmQoJ3RyYW5zYWN0aW9uJyksXG5cdFx0XHRcdHN0eWxlZCh0cmFuc2FjdGlvbk5hbWUsIHsgY29sb3I6ICdCbHVlVmlvbGV0JyB9KSxcblx0XHRcdFx0eyBkYXRhOiBbeyBmbjogdHJhbnNhY3Rpb24uX2ZuIH1dIH1cblx0XHRcdF0pKTtcblx0XHR9XG5cdFx0dGhpcy5pbmRlbnRhdGlvbisrO1xuXHR9XG5cblx0aGFuZGxlRW5kVHJhbnNhY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5pbmRlbnRhdGlvbi0tO1xuXHR9XG59XG50eXBlIENvbnNvbGVUZXh0ID0gKENvbnNvbGVUZXh0IHwgdW5kZWZpbmVkKVtdIHxcbnsgdGV4dDogc3RyaW5nOyBzdHlsZTogc3RyaW5nOyBkYXRhPzogdW5rbm93bltdIH0gfFxueyBkYXRhOiB1bmtub3duW10gfTtcbmZ1bmN0aW9uIGNvbnNvbGVUZXh0VG9BcmdzKHRleHQ6IENvbnNvbGVUZXh0KTogdW5rbm93bltdIHtcblx0Y29uc3Qgc3R5bGVzID0gbmV3IEFycmF5PGFueT4oKTtcblx0Y29uc3QgZGF0YTogdW5rbm93bltdID0gW107XG5cdGxldCBmaXJzdEFyZyA9ICcnO1xuXG5cdGZ1bmN0aW9uIHByb2Nlc3ModDogQ29uc29sZVRleHQpOiB2b2lkIHtcblx0XHRpZiAoJ2xlbmd0aCcgaW4gdCkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHQpIHtcblx0XHRcdFx0aWYgKGl0ZW0pIHtcblx0XHRcdFx0XHRwcm9jZXNzKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICgndGV4dCcgaW4gdCkge1xuXHRcdFx0Zmlyc3RBcmcgKz0gYCVjJHt0LnRleHR9YDtcblx0XHRcdHN0eWxlcy5wdXNoKHQuc3R5bGUpO1xuXHRcdFx0aWYgKHQuZGF0YSkge1xuXHRcdFx0XHRkYXRhLnB1c2goLi4udC5kYXRhKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCdkYXRhJyBpbiB0KSB7XG5cdFx0XHRkYXRhLnB1c2goLi4udC5kYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcm9jZXNzKHRleHQpO1xuXG5cdGNvbnN0IHJlc3VsdCA9IFtmaXJzdEFyZywgLi4uc3R5bGVzXTtcblx0cmVzdWx0LnB1c2goLi4uZGF0YSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5mdW5jdGlvbiBub3JtYWxUZXh0KHRleHQ6IHN0cmluZyk6IENvbnNvbGVUZXh0IHtcblx0cmV0dXJuIHN0eWxlZCh0ZXh0LCB7IGNvbG9yOiAnYmxhY2snIH0pO1xufVxuZnVuY3Rpb24gZm9ybWF0S2luZChraW5kOiBzdHJpbmcpOiBDb25zb2xlVGV4dCB7XG5cdHJldHVybiBzdHlsZWQocGFkU3RyKGAke2tpbmR9OiBgLCAxMCksIHsgY29sb3I6ICdibGFjaycsIGJvbGQ6IHRydWUgfSk7XG59XG5mdW5jdGlvbiBzdHlsZWQoXG5cdHRleHQ6IHN0cmluZyxcblx0b3B0aW9uczogeyBjb2xvcjogc3RyaW5nOyBzdHJpa2VUaHJvdWdoPzogYm9vbGVhbjsgYm9sZD86IGJvb2xlYW4gfSA9IHtcblx0XHRjb2xvcjogJ2JsYWNrJyxcblx0fVxuKTogQ29uc29sZVRleHQge1xuXHRmdW5jdGlvbiBvYmpUb0NzcyhzdHlsZU9iajogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIE9iamVjdC5lbnRyaWVzKHN0eWxlT2JqKS5yZWR1Y2UoXG5cdFx0XHQoc3R5bGVTdHJpbmcsIFtwcm9wTmFtZSwgcHJvcFZhbHVlXSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gYCR7c3R5bGVTdHJpbmd9JHtwcm9wTmFtZX06JHtwcm9wVmFsdWV9O2A7XG5cdFx0XHR9LFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9XG5cblx0Y29uc3Qgc3R5bGU6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0Y29sb3I6IG9wdGlvbnMuY29sb3IsXG5cdH07XG5cdGlmIChvcHRpb25zLnN0cmlrZVRocm91Z2gpIHtcblx0XHRzdHlsZVsndGV4dC1kZWNvcmF0aW9uJ10gPSAnbGluZS10aHJvdWdoJztcblx0fVxuXHRpZiAob3B0aW9ucy5ib2xkKSB7XG5cdFx0c3R5bGVbJ2ZvbnQtd2VpZ2h0J10gPSAnYm9sZCc7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHRleHQsXG5cdFx0c3R5bGU6IG9ialRvQ3NzKHN0eWxlKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFZhbHVlKHZhbHVlOiB1bmtub3duLCBhdmFpbGFibGVMZW46IG51bWJlcik6IHN0cmluZyB7XG5cdHN3aXRjaCAodHlwZW9mIHZhbHVlKSB7XG5cdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdHJldHVybiAnJyArIHZhbHVlO1xuXHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRpZiAodmFsdWUubGVuZ3RoICsgMiA8PSBhdmFpbGFibGVMZW4pIHtcblx0XHRcdFx0cmV0dXJuIGBcIiR7dmFsdWV9XCJgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGBcIiR7dmFsdWUuc3Vic3RyKDAsIGF2YWlsYWJsZUxlbiAtIDcpfVwiKy4uLmA7XG5cblx0XHRjYXNlICdib29sZWFuJzpcblx0XHRcdHJldHVybiB2YWx1ZSA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cdFx0Y2FzZSAndW5kZWZpbmVkJzpcblx0XHRcdHJldHVybiAndW5kZWZpbmVkJztcblx0XHRjYXNlICdvYmplY3QnOlxuXHRcdFx0aWYgKHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiAnbnVsbCc7XG5cdFx0XHR9XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZvcm1hdEFycmF5KHZhbHVlLCBhdmFpbGFibGVMZW4pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZvcm1hdE9iamVjdCh2YWx1ZSwgYXZhaWxhYmxlTGVuKTtcblx0XHRjYXNlICdzeW1ib2wnOlxuXHRcdFx0cmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0Y2FzZSAnZnVuY3Rpb24nOlxuXHRcdFx0cmV0dXJuIGBbW0Z1bmN0aW9uJHt2YWx1ZS5uYW1lID8gJyAnICsgdmFsdWUubmFtZSA6ICcnfV1dYDtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICcnICsgdmFsdWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkodmFsdWU6IHVua25vd25bXSwgYXZhaWxhYmxlTGVuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0ID0gJ1sgJztcblx0bGV0IGZpcnN0ID0gdHJ1ZTtcblx0Zm9yIChjb25zdCB2YWwgb2YgdmFsdWUpIHtcblx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRyZXN1bHQgKz0gJywgJztcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5sZW5ndGggLSA1ID4gYXZhaWxhYmxlTGVuKSB7XG5cdFx0XHRyZXN1bHQgKz0gJy4uLic7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRyZXN1bHQgKz0gYCR7Zm9ybWF0VmFsdWUodmFsLCBhdmFpbGFibGVMZW4gLSByZXN1bHQubGVuZ3RoKX1gO1xuXHR9XG5cdHJlc3VsdCArPSAnIF0nO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBmb3JtYXRPYmplY3QodmFsdWU6IG9iamVjdCwgYXZhaWxhYmxlTGVuOiBudW1iZXIpOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIHZhbHVlLnRvU3RyaW5nID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLnRvU3RyaW5nICE9PSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nKSB7XG5cdFx0Y29uc3QgdmFsID0gdmFsdWUudG9TdHJpbmcoKTtcblx0XHRpZiAodmFsLmxlbmd0aCA8PSBhdmFpbGFibGVMZW4pIHtcblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fVxuXHRcdHJldHVybiB2YWwuc3Vic3RyaW5nKDAsIGF2YWlsYWJsZUxlbiAtIDMpICsgJy4uLic7XG5cdH1cblxuXHRjb25zdCBjbGFzc05hbWUgPSBnZXRDbGFzc05hbWUodmFsdWUpO1xuXG5cdGxldCByZXN1bHQgPSBjbGFzc05hbWUgPyBjbGFzc05hbWUgKyAnKCcgOiAneyAnO1xuXHRsZXQgZmlyc3QgPSB0cnVlO1xuXHRmb3IgKGNvbnN0IFtrZXksIHZhbF0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG5cdFx0aWYgKCFmaXJzdCkge1xuXHRcdFx0cmVzdWx0ICs9ICcsICc7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQubGVuZ3RoIC0gNSA+IGF2YWlsYWJsZUxlbikge1xuXHRcdFx0cmVzdWx0ICs9ICcuLi4nO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGZpcnN0ID0gZmFsc2U7XG5cdFx0cmVzdWx0ICs9IGAke2tleX06ICR7Zm9ybWF0VmFsdWUodmFsLCBhdmFpbGFibGVMZW4gLSByZXN1bHQubGVuZ3RoKX1gO1xuXHR9XG5cdHJlc3VsdCArPSBjbGFzc05hbWUgPyAnKScgOiAnIH0nO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByZXBlYXQoc3RyOiBzdHJpbmcsIGNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0ID0gJyc7XG5cdGZvciAobGV0IGkgPSAxOyBpIDw9IGNvdW50OyBpKyspIHtcblx0XHRyZXN1bHQgKz0gc3RyO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIHBhZFN0cihzdHI6IHN0cmluZywgbGVuZ3RoOiBudW1iZXIpOiBzdHJpbmcge1xuXHR3aGlsZSAoc3RyLmxlbmd0aCA8IGxlbmd0aCkge1xuXHRcdHN0ciArPSAnICc7XG5cdH1cblx0cmV0dXJuIHN0cjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQWdELGlCQUFpQjtBQUVqRSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFHeEIsSUFBSTtBQUVHLFNBQVMsdUJBQXVCLEtBQTZCO0FBQ25FLE1BQUksQ0FBQyx5QkFBeUI7QUFDN0IsOEJBQTBCLElBQUksd0JBQXdCO0FBQ3RELGNBQVUsdUJBQXVCO0FBQUEsRUFDbEM7QUFDQSwwQkFBd0IsZUFBZSxHQUFHO0FBQzNDO0FBRU8sTUFBTSx3QkFBcUQ7QUFBQSxFQUEzRDtBQUNOLFNBQVEsY0FBYztBQThGdEIsU0FBaUIseUJBQXlCLG9CQUFJLFFBQXVDO0FBQUE7QUFBQSxFQTFGOUUsZUFBZSxLQUFvQjtBQUN6QyxRQUFJLENBQUMsS0FBSyxrQkFBa0I7QUFDM0IsV0FBSyxtQkFBbUIsb0JBQUksSUFBSTtBQUFBLElBQ2pDO0FBQ0EsU0FBSyxpQkFBaUIsSUFBSSxHQUFHO0FBQUEsRUFDOUI7QUFBQSxFQUVRLFlBQVksS0FBdUI7QUFDMUMsV0FBTyxLQUFLLGtCQUFrQixJQUFJLEdBQUcsS0FBSztBQUFBLEVBQzNDO0FBQUEsRUFFUSxrQkFBa0IsTUFBOEI7QUFDdkQsV0FBTyxrQkFBa0I7QUFBQSxNQUN4QixXQUFXLE9BQU8sT0FBTyxLQUFLLFdBQVcsQ0FBQztBQUFBLE1BQzFDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsV0FBVyxNQUF5QztBQUMzRCxRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLGFBQU87QUFBQSxRQUNOLFdBQVcsR0FBRztBQUFBLFFBQ2QsT0FBTyxZQUFZLEtBQUss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
