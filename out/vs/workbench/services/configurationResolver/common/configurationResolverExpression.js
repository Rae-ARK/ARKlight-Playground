import { Iterable } from "../../../../base/common/iterator.js";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
const _ConfigurationResolverExpression = class _ConfigurationResolverExpression {
  constructor(object) {
    this.locations = /* @__PURE__ */ new Map();
    /**
     * Callbacks when a new replacement is made, so that nested resolutions from
     * `expr.unresolved()` can be fulfilled in the same iteration.
     */
    this.newReplacementNotifiers = /* @__PURE__ */ new Set();
    if (typeof object === "string") {
      this.stringRoot = true;
      this.root = { value: object };
    } else {
      this.stringRoot = false;
      this.root = structuredClone(object);
    }
  }
  /**
   * Creates a new {@link ConfigurationResolverExpression} from an object.
   * Note that platform-specific keys (i.e. `windows`, `osx`, `linux`) are
   * applied during parsing.
   */
  static parse(object) {
    if (object instanceof _ConfigurationResolverExpression) {
      return object;
    }
    const expr = new _ConfigurationResolverExpression(object);
    expr.applyPlatformSpecificKeys();
    expr.parseObject(expr.root);
    return expr;
  }
  applyPlatformSpecificKeys() {
    const config = this.root;
    const key = isWindows ? "windows" : isMacintosh ? "osx" : isLinux ? "linux" : void 0;
    if (key && config && typeof config === "object" && config.hasOwnProperty(key)) {
      Object.keys(config[key]).forEach((k) => config[k] = config[key][k]);
    }
    delete config.windows;
    delete config.osx;
    delete config.linux;
  }
  parseVariable(str, start) {
    if (str[start] !== "$" || str[start + 1] !== "{") {
      return void 0;
    }
    let end = start + 2;
    let braceCount = 1;
    while (end < str.length) {
      if (str[end] === "{") {
        braceCount++;
      } else if (str[end] === "}") {
        braceCount--;
        if (braceCount === 0) {
          break;
        }
      }
      end++;
    }
    if (braceCount !== 0) {
      return void 0;
    }
    const id = str.slice(start, end + 1);
    const inner = str.substring(start + 2, end);
    const colonIdx = inner.indexOf(":");
    if (colonIdx === -1) {
      return { replacement: { id, name: inner, inner }, end };
    }
    return {
      replacement: {
        id,
        inner,
        name: inner.slice(0, colonIdx),
        arg: inner.slice(colonIdx + 1)
      },
      end
    };
  }
  parseObject(obj) {
    if (typeof obj !== "object" || obj === null) {
      return;
    }
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value === "string") {
          this.parseString(obj, i, value);
        } else {
          this.parseObject(value);
        }
      }
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      this.parseString(obj, key, key, true);
      if (typeof value === "string") {
        this.parseString(obj, key, value);
      } else {
        this.parseObject(value);
      }
    }
  }
  parseString(object, propertyName, value, replaceKeyName, replacementPath) {
    let pos = 0;
    while (pos < value.length) {
      const match = value.indexOf("${", pos);
      if (match === -1) {
        break;
      }
      const parsed = this.parseVariable(value, match);
      if (parsed) {
        pos = parsed.end + 1;
        if (replacementPath?.includes(parsed.replacement.id)) {
          continue;
        }
        const locations = this.locations.get(parsed.replacement.id) || { locations: [], replacement: parsed.replacement };
        const newLocation = { object, propertyName, replaceKeyName };
        locations.locations.push(newLocation);
        this.locations.set(parsed.replacement.id, locations);
        if (locations.resolved) {
          this._resolveAtLocation(parsed.replacement, newLocation, locations.resolved, replacementPath);
        } else {
          this.newReplacementNotifiers.forEach((n) => n(parsed.replacement));
        }
      } else {
        pos = match + 2;
      }
    }
  }
  *unresolved() {
    const newReplacements = /* @__PURE__ */ new Map();
    const notifier = (replacement) => {
      newReplacements.set(replacement.id, replacement);
    };
    for (const location of this.locations.values()) {
      if (location.resolved === void 0) {
        newReplacements.set(location.replacement.id, location.replacement);
      }
    }
    this.newReplacementNotifiers.add(notifier);
    while (true) {
      const next = Iterable.first(newReplacements);
      if (!next) {
        break;
      }
      const [key, value] = next;
      yield value;
      newReplacements.delete(key);
    }
    this.newReplacementNotifiers.delete(notifier);
  }
  resolved() {
    return Iterable.map(Iterable.filter(this.locations.values(), (l) => !!l.resolved), (l) => [l.replacement, l.resolved]);
  }
  resolve(replacement, data) {
    if (typeof data !== "object") {
      data = { value: String(data) };
    }
    const location = this.locations.get(replacement.id);
    if (!location) {
      return;
    }
    location.resolved = data;
    if (data.value !== void 0) {
      for (const l of location.locations || Iterable.empty()) {
        this._resolveAtLocation(replacement, l, data);
      }
    }
  }
  _resolveAtLocation(replacement, { replaceKeyName, propertyName, object }, data, path = []) {
    if (data.value === void 0) {
      return;
    }
    path.push(replacement.id);
    if (replaceKeyName && typeof propertyName === "string") {
      const value = object[propertyName];
      const newKey = propertyName.replaceAll(replacement.id, data.value);
      delete object[propertyName];
      object[newKey] = value;
      this._renameKeyInLocations(object, propertyName, newKey);
      this.parseString(object, newKey, data.value, true, path);
    } else {
      object[propertyName] = object[propertyName].replaceAll(replacement.id, data.value);
      this.parseString(object, propertyName, data.value, false, path);
    }
    path.pop();
  }
  _renameKeyInLocations(obj, oldKey, newKey) {
    for (const location of this.locations.values()) {
      for (const loc of location.locations) {
        if (loc.object === obj && loc.propertyName === oldKey) {
          loc.propertyName = newKey;
        }
      }
    }
  }
  toObject() {
    if (this.stringRoot) {
      return this.root.value;
    }
    return this.root;
  }
};
_ConfigurationResolverExpression.VARIABLE_LHS = "${";
let ConfigurationResolverExpression = _ConfigurationResolverExpression;
export {
  ConfigurationResolverExpression
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVkSW5wdXQgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5cbi8qKiBBIHJlcGxhY2VtZW50IGZvdW5kIGluIHRoZSBvYmplY3QsIGFzICR7bmFtZX0gb3IgJHtuYW1lOmFyZ30gKi9cbmV4cG9ydCB0eXBlIFJlcGxhY2VtZW50ID0ge1xuXHQvKiogJHtuYW1lOmFyZ30gKi9cblx0aWQ6IHN0cmluZztcblx0LyoqIFRoZSBgbmFtZTphcmdgIGluICR7bmFtZTphcmd9ICovXG5cdGlubmVyOiBzdHJpbmc7XG5cdC8qKiBUaGUgYG5hbWVgIGluICR7bmFtZTphcmd9ICovXG5cdG5hbWU6IHN0cmluZztcblx0LyoqIFRoZSBgYXJnYCBpbiAke25hbWU6YXJnfSAqL1xuXHRhcmc/OiBzdHJpbmc7XG59O1xuXG5pbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248VD4ge1xuXHQvKipcblx0ICogR2V0cyB0aGUgcmVwbGFjZW1lbnRzIHdoaWNoIGhhdmUgbm90IHlldCBiZWVuXG5cdCAqIHJlc29sdmVkLlxuXHQgKi9cblx0dW5yZXNvbHZlZCgpOiBJdGVyYWJsZTxSZXBsYWNlbWVudD47XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHJlcGxhY2VtZW50cyB3aGljaCBoYXZlIGJlZW4gcmVzb2x2ZWQuXG5cdCAqL1xuXHRyZXNvbHZlZCgpOiBJdGVyYWJsZTxbUmVwbGFjZW1lbnQsIElSZXNvbHZlZFZhbHVlXT47XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgcmVwbGFjZW1lbnQgaW50byB0aGUgc3RyaW5nIHZhbHVlLlxuXHQgKiBJZiB0aGUgdmFsdWUgaXMgdW5kZWZpbmVkLCB0aGUgb3JpZ2luYWwgdmFyaWFibGUgdGV4dCB3aWxsIGJlIHByZXNlcnZlZC5cblx0ICovXG5cdHJlc29sdmUocmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50LCBkYXRhOiBzdHJpbmcgfCBJUmVzb2x2ZWRWYWx1ZSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNvbXBsZXRlIG9iamVjdC4gQW55IHVucmVzb2x2ZWQgcmVwbGFjZW1lbnRzIGFyZSBsZWZ0IGludGFjdC5cblx0ICovXG5cdHRvT2JqZWN0KCk6IFQ7XG59XG5cbnR5cGUgUHJvcGVydHlMb2NhdGlvbiA9IHtcblx0b2JqZWN0OiBhbnk7XG5cdHByb3BlcnR5TmFtZTogc3RyaW5nIHwgbnVtYmVyO1xuXHRyZXBsYWNlS2V5TmFtZT86IGJvb2xlYW47XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZFZhbHVlIHtcblx0dmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogUHJlc2VudCB3aGVuIHRoZSB2YXJpYWJsZSBpcyByZXNvbHZlZCBmcm9tIGFuIGlucHV0IGZpZWxkLiAqL1xuXHRpbnB1dD86IENvbmZpZ3VyZWRJbnB1dDtcbn1cblxuaW50ZXJmYWNlIElSZXBsYWNlbWVudExvY2F0aW9uIHtcblx0cmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50O1xuXHRsb2NhdGlvbnM6IFByb3BlcnR5TG9jYXRpb25bXTtcblx0cmVzb2x2ZWQ/OiBJUmVzb2x2ZWRWYWx1ZTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248VD4gaW1wbGVtZW50cyBJQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbjxUPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgVkFSSUFCTEVfTEhTID0gJyR7JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVwbGFjZW1lbnRMb2NhdGlvbj4oKTtcblx0cHJpdmF0ZSByb290OiBUO1xuXHRwcml2YXRlIHN0cmluZ1Jvb3Q6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDYWxsYmFja3Mgd2hlbiBhIG5ldyByZXBsYWNlbWVudCBpcyBtYWRlLCBzbyB0aGF0IG5lc3RlZCByZXNvbHV0aW9ucyBmcm9tXG5cdCAqIGBleHByLnVucmVzb2x2ZWQoKWAgY2FuIGJlIGZ1bGZpbGxlZCBpbiB0aGUgc2FtZSBpdGVyYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIG5ld1JlcGxhY2VtZW50Tm90aWZpZXJzID0gbmV3IFNldDwocjogUmVwbGFjZW1lbnQpID0+IHZvaWQ+KCk7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihvYmplY3Q6IFQpIHtcblx0XHQvLyBJZiB0aGUgaW5wdXQgaXMgYSBzdHJpbmcsIHdyYXAgaXQgaW4gYW4gb2JqZWN0IHNvIHdlIGNhbiB1c2UgdGhlIHNhbWUgbG9naWNcblx0XHRpZiAodHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc3RyaW5nUm9vdCA9IHRydWU7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHRoaXMucm9vdCA9IHsgdmFsdWU6IG9iamVjdCB9IGFzIGFueTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdHJpbmdSb290ID0gZmFsc2U7XG5cdFx0XHR0aGlzLnJvb3QgPSBzdHJ1Y3R1cmVkQ2xvbmUob2JqZWN0KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyB7QGxpbmsgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbn0gZnJvbSBhbiBvYmplY3QuXG5cdCAqIE5vdGUgdGhhdCBwbGF0Zm9ybS1zcGVjaWZpYyBrZXlzIChpLmUuIGB3aW5kb3dzYCwgYG9zeGAsIGBsaW51eGApIGFyZVxuXHQgKiBhcHBsaWVkIGR1cmluZyBwYXJzaW5nLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBwYXJzZTxUPihvYmplY3Q6IFQpOiBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uPFQ+IHtcblx0XHRpZiAob2JqZWN0IGluc3RhbmNlb2YgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIG9iamVjdDtcblx0XHR9XG5cblx0XHRjb25zdCBleHByID0gbmV3IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb248VD4ob2JqZWN0KTtcblx0XHRleHByLmFwcGx5UGxhdGZvcm1TcGVjaWZpY0tleXMoKTtcblx0XHRleHByLnBhcnNlT2JqZWN0KGV4cHIucm9vdCk7XG5cdFx0cmV0dXJuIGV4cHI7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5UGxhdGZvcm1TcGVjaWZpY0tleXMoKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5yb290IGFzIGFueTsgLy8gYWxyZWFkeSBjbG9uZWQgYnkgY3Rvciwgc2FmZSB0byBjaGFuZ2Vcblx0XHRjb25zdCBrZXkgPSBpc1dpbmRvd3MgPyAnd2luZG93cycgOiBpc01hY2ludG9zaCA/ICdvc3gnIDogaXNMaW51eCA/ICdsaW51eCcgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoa2V5ICYmIGNvbmZpZyAmJiB0eXBlb2YgY29uZmlnID09PSAnb2JqZWN0JyAmJiBjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdFx0T2JqZWN0LmtleXMoY29uZmlnW2tleV0pLmZvckVhY2goayA9PiBjb25maWdba10gPSBjb25maWdba2V5XVtrXSk7XG5cdFx0fVxuXG5cdFx0ZGVsZXRlIGNvbmZpZy53aW5kb3dzO1xuXHRcdGRlbGV0ZSBjb25maWcub3N4O1xuXHRcdGRlbGV0ZSBjb25maWcubGludXg7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlVmFyaWFibGUoc3RyOiBzdHJpbmcsIHN0YXJ0OiBudW1iZXIpOiB7IHJlcGxhY2VtZW50OiBSZXBsYWNlbWVudDsgZW5kOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHN0cltzdGFydF0gIT09ICckJyB8fCBzdHJbc3RhcnQgKyAxXSAhPT0gJ3snKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBlbmQgPSBzdGFydCArIDI7XG5cdFx0bGV0IGJyYWNlQ291bnQgPSAxO1xuXHRcdHdoaWxlIChlbmQgPCBzdHIubGVuZ3RoKSB7XG5cdFx0XHRpZiAoc3RyW2VuZF0gPT09ICd7Jykge1xuXHRcdFx0XHRicmFjZUNvdW50Kys7XG5cdFx0XHR9IGVsc2UgaWYgKHN0cltlbmRdID09PSAnfScpIHtcblx0XHRcdFx0YnJhY2VDb3VudC0tO1xuXHRcdFx0XHRpZiAoYnJhY2VDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbmQrKztcblx0XHR9XG5cblx0XHRpZiAoYnJhY2VDb3VudCAhPT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSk7XG5cdFx0Y29uc3QgaW5uZXIgPSBzdHIuc3Vic3RyaW5nKHN0YXJ0ICsgMiwgZW5kKTtcblx0XHRjb25zdCBjb2xvbklkeCA9IGlubmVyLmluZGV4T2YoJzonKTtcblx0XHRpZiAoY29sb25JZHggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4geyByZXBsYWNlbWVudDogeyBpZCwgbmFtZTogaW5uZXIsIGlubmVyIH0sIGVuZCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXBsYWNlbWVudDoge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0aW5uZXIsXG5cdFx0XHRcdG5hbWU6IGlubmVyLnNsaWNlKDAsIGNvbG9uSWR4KSxcblx0XHRcdFx0YXJnOiBpbm5lci5zbGljZShjb2xvbklkeCArIDEpXG5cdFx0XHR9LFxuXHRcdFx0ZW5kXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcGFyc2VPYmplY3Qob2JqOiBhbnkpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgfHwgb2JqID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvYmoubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBvYmpbaV07XG5cdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5wYXJzZVN0cmluZyhvYmosIGksIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBhcnNlT2JqZWN0KHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcblx0XHRcdHRoaXMucGFyc2VTdHJpbmcob2JqLCBrZXksIGtleSwgdHJ1ZSk7IC8vIHBhcnNlIGtleVxuXG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLnBhcnNlU3RyaW5nKG9iaiwga2V5LCB2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnBhcnNlT2JqZWN0KHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlU3RyaW5nKG9iamVjdDogYW55LCBwcm9wZXJ0eU5hbWU6IHN0cmluZyB8IG51bWJlciwgdmFsdWU6IHN0cmluZywgcmVwbGFjZUtleU5hbWU/OiBib29sZWFuLCByZXBsYWNlbWVudFBhdGg/OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGxldCBwb3MgPSAwO1xuXHRcdHdoaWxlIChwb3MgPCB2YWx1ZS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gdmFsdWUuaW5kZXhPZignJHsnLCBwb3MpO1xuXHRcdFx0aWYgKG1hdGNoID09PSAtMSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZCA9IHRoaXMucGFyc2VWYXJpYWJsZSh2YWx1ZSwgbWF0Y2gpO1xuXHRcdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0XHRwb3MgPSBwYXJzZWQuZW5kICsgMTtcblx0XHRcdFx0aWYgKHJlcGxhY2VtZW50UGF0aD8uaW5jbHVkZXMocGFyc2VkLnJlcGxhY2VtZW50LmlkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbG9jYXRpb25zID0gdGhpcy5sb2NhdGlvbnMuZ2V0KHBhcnNlZC5yZXBsYWNlbWVudC5pZCkgfHwgeyBsb2NhdGlvbnM6IFtdLCByZXBsYWNlbWVudDogcGFyc2VkLnJlcGxhY2VtZW50IH07XG5cdFx0XHRcdGNvbnN0IG5ld0xvY2F0aW9uOiBQcm9wZXJ0eUxvY2F0aW9uID0geyBvYmplY3QsIHByb3BlcnR5TmFtZSwgcmVwbGFjZUtleU5hbWUgfTtcblx0XHRcdFx0bG9jYXRpb25zLmxvY2F0aW9ucy5wdXNoKG5ld0xvY2F0aW9uKTtcblx0XHRcdFx0dGhpcy5sb2NhdGlvbnMuc2V0KHBhcnNlZC5yZXBsYWNlbWVudC5pZCwgbG9jYXRpb25zKTtcblxuXHRcdFx0XHRpZiAobG9jYXRpb25zLnJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZUF0TG9jYXRpb24ocGFyc2VkLnJlcGxhY2VtZW50LCBuZXdMb2NhdGlvbiwgbG9jYXRpb25zLnJlc29sdmVkLCByZXBsYWNlbWVudFBhdGgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubmV3UmVwbGFjZW1lbnROb3RpZmllcnMuZm9yRWFjaChuID0+IG4ocGFyc2VkLnJlcGxhY2VtZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHBvcyA9IG1hdGNoICsgMjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgKnVucmVzb2x2ZWQoKTogSXRlcmFibGU8UmVwbGFjZW1lbnQ+IHtcblx0XHRjb25zdCBuZXdSZXBsYWNlbWVudHMgPSBuZXcgTWFwPHN0cmluZywgUmVwbGFjZW1lbnQ+KCk7XG5cdFx0Y29uc3Qgbm90aWZpZXIgPSAocmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50KSA9PiB7XG5cdFx0XHRuZXdSZXBsYWNlbWVudHMuc2V0KHJlcGxhY2VtZW50LmlkLCByZXBsYWNlbWVudCk7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgdGhpcy5sb2NhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChsb2NhdGlvbi5yZXNvbHZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG5ld1JlcGxhY2VtZW50cy5zZXQobG9jYXRpb24ucmVwbGFjZW1lbnQuaWQsIGxvY2F0aW9uLnJlcGxhY2VtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLm5ld1JlcGxhY2VtZW50Tm90aWZpZXJzLmFkZChub3RpZmllcik7XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IEl0ZXJhYmxlLmZpcnN0KG5ld1JlcGxhY2VtZW50cyk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IFtrZXksIHZhbHVlXSA9IG5leHQ7XG5cdFx0XHR5aWVsZCB2YWx1ZTtcblx0XHRcdG5ld1JlcGxhY2VtZW50cy5kZWxldGUoa2V5KTtcblx0XHR9XG5cblx0XHR0aGlzLm5ld1JlcGxhY2VtZW50Tm90aWZpZXJzLmRlbGV0ZShub3RpZmllcik7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZWQoKTogSXRlcmFibGU8W1JlcGxhY2VtZW50LCBJUmVzb2x2ZWRWYWx1ZV0+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKEl0ZXJhYmxlLmZpbHRlcih0aGlzLmxvY2F0aW9ucy52YWx1ZXMoKSwgbCA9PiAhIWwucmVzb2x2ZWQpLCBsID0+IFtsLnJlcGxhY2VtZW50LCBsLnJlc29sdmVkIV0pO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmUocmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50LCBkYXRhOiBzdHJpbmcgfCBJUmVzb2x2ZWRWYWx1ZSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdGRhdGEgPSB7IHZhbHVlOiBTdHJpbmcoZGF0YSkgfTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMubG9jYXRpb25zLmdldChyZXBsYWNlbWVudC5pZCk7XG5cdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxvY2F0aW9uLnJlc29sdmVkID0gZGF0YTtcblxuXHRcdGlmIChkYXRhLnZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3QgbCBvZiBsb2NhdGlvbi5sb2NhdGlvbnMgfHwgSXRlcmFibGUuZW1wdHkoKSkge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlQXRMb2NhdGlvbihyZXBsYWNlbWVudCwgbCwgZGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUF0TG9jYXRpb24ocmVwbGFjZW1lbnQ6IFJlcGxhY2VtZW50LCB7IHJlcGxhY2VLZXlOYW1lLCBwcm9wZXJ0eU5hbWUsIG9iamVjdCB9OiBQcm9wZXJ0eUxvY2F0aW9uLCBkYXRhOiBJUmVzb2x2ZWRWYWx1ZSwgcGF0aDogc3RyaW5nW10gPSBbXSkge1xuXHRcdGlmIChkYXRhLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBhdm9pZCByZWN1cnNpdmUgcmVzb2x1dGlvbiwgZS5nLiAke2VudjpGT099IC0+ICR7ZW52OkJBUn09JHtlbnY6Rk9PfVxuXHRcdHBhdGgucHVzaChyZXBsYWNlbWVudC5pZCk7XG5cblx0XHQvLyBub3RlOiBpbiBuZXN0ZWQgYHRoaXMucGFyc2VTdHJpbmdgLCBwYXJzZSBvbmx5IHRoZSBuZXcgc3Vic3RyaW5nIGZvciBhbnkgcmVwbGFjZW1lbnRzLCBkb24ndCByZXBhcnNlIHRoZSB3aG9sZSBzdHJpbmdcblx0XHRpZiAocmVwbGFjZUtleU5hbWUgJiYgdHlwZW9mIHByb3BlcnR5TmFtZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gb2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdFx0XHRjb25zdCBuZXdLZXkgPSBwcm9wZXJ0eU5hbWUucmVwbGFjZUFsbChyZXBsYWNlbWVudC5pZCwgZGF0YS52YWx1ZSk7XG5cdFx0XHRkZWxldGUgb2JqZWN0W3Byb3BlcnR5TmFtZV07XG5cdFx0XHRvYmplY3RbbmV3S2V5XSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fcmVuYW1lS2V5SW5Mb2NhdGlvbnMob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIG5ld0tleSk7XG5cdFx0XHR0aGlzLnBhcnNlU3RyaW5nKG9iamVjdCwgbmV3S2V5LCBkYXRhLnZhbHVlLCB0cnVlLCBwYXRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b2JqZWN0W3Byb3BlcnR5TmFtZV0gPSBvYmplY3RbcHJvcGVydHlOYW1lXS5yZXBsYWNlQWxsKHJlcGxhY2VtZW50LmlkLCBkYXRhLnZhbHVlKTtcblx0XHRcdHRoaXMucGFyc2VTdHJpbmcob2JqZWN0LCBwcm9wZXJ0eU5hbWUsIGRhdGEudmFsdWUsIGZhbHNlLCBwYXRoKTtcblx0XHR9XG5cblx0XHRwYXRoLnBvcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuYW1lS2V5SW5Mb2NhdGlvbnMob2JqOiBvYmplY3QsIG9sZEtleTogc3RyaW5nLCBuZXdLZXk6IHN0cmluZykge1xuXHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgdGhpcy5sb2NhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgbG9jIG9mIGxvY2F0aW9uLmxvY2F0aW9ucykge1xuXHRcdFx0XHRpZiAobG9jLm9iamVjdCA9PT0gb2JqICYmIGxvYy5wcm9wZXJ0eU5hbWUgPT09IG9sZEtleSkge1xuXHRcdFx0XHRcdGxvYy5wcm9wZXJ0eU5hbWUgPSBuZXdLZXk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9PYmplY3QoKTogVCB7XG5cdFx0Ly8gSWYgd2Ugd3JhcHBlZCBhIHN0cmluZywgdW53cmFwIGl0XG5cdFx0aWYgKHRoaXMuc3RyaW5nUm9vdCkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRyZXR1cm4gKHRoaXMucm9vdCBhcyBhbnkpLnZhbHVlIGFzIFQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucm9vdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGFBQWEsaUJBQWlCO0FBMER6QyxNQUFNLG1DQUFOLE1BQU0saUNBQWtGO0FBQUEsRUFZdEYsWUFBWSxRQUFXO0FBVC9CLFNBQWlCLFlBQVksb0JBQUksSUFBa0M7QUFPbkU7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLDBCQUEwQixvQkFBSSxJQUE4QjtBQUluRSxRQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLFdBQUssYUFBYTtBQUVsQixXQUFLLE9BQU8sRUFBRSxPQUFPLE9BQU87QUFBQSxJQUM3QixPQUFPO0FBQ04sV0FBSyxhQUFhO0FBQ2xCLFdBQUssT0FBTyxnQkFBZ0IsTUFBTTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE9BQWMsTUFBUyxRQUErQztBQUNyRSxRQUFJLGtCQUFrQixrQ0FBaUM7QUFDdEQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sSUFBSSxpQ0FBbUMsTUFBTTtBQUMxRCxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLFlBQVksS0FBSyxJQUFJO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw0QkFBNEI7QUFFbkMsVUFBTSxTQUFTLEtBQUs7QUFDcEIsVUFBTSxNQUFNLFlBQVksWUFBWSxjQUFjLFFBQVEsVUFBVSxVQUFVO0FBRTlFLFFBQUksT0FBTyxVQUFVLE9BQU8sV0FBVyxZQUFZLE9BQU8sZUFBZSxHQUFHLEdBQUc7QUFDOUUsYUFBTyxLQUFLLE9BQU8sR0FBRyxDQUFDLEVBQUUsUUFBUSxPQUFLLE9BQU8sQ0FBQyxJQUFJLE9BQU8sR0FBRyxFQUFFLENBQUMsQ0FBQztBQUFBLElBQ2pFO0FBRUEsV0FBTyxPQUFPO0FBQ2QsV0FBTyxPQUFPO0FBQ2QsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUFB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
