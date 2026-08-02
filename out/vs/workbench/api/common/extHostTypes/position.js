var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
import { illegalArgument } from "../../../../base/common/errors.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
let Position = class {
  static Min(...positions) {
    if (positions.length === 0) {
      throw new TypeError();
    }
    let result = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const p = positions[i];
      if (p.isBefore(result)) {
        result = p;
      }
    }
    return result;
  }
  static Max(...positions) {
    if (positions.length === 0) {
      throw new TypeError();
    }
    let result = positions[0];
    for (let i = 1; i < positions.length; i++) {
      const p = positions[i];
      if (p.isAfter(result)) {
        result = p;
      }
    }
    return result;
  }
  static isPosition(other) {
    if (!other) {
      return false;
    }
    if (other instanceof Position) {
      return true;
    }
    const { line, character } = other;
    if (typeof line === "number" && typeof character === "number") {
      return true;
    }
    return false;
  }
  static of(obj) {
    if (obj instanceof Position) {
      return obj;
    } else if (this.isPosition(obj)) {
      return new Position(obj.line, obj.character);
    }
    throw new Error("Invalid argument, is NOT a position-like object");
  }
  get line() {
    return this._line;
  }
  get character() {
    return this._character;
  }
  constructor(line, character) {
    if (line < 0) {
      throw illegalArgument("line must be non-negative");
    }
    if (character < 0) {
      throw illegalArgument("character must be non-negative");
    }
    this._line = line;
    this._character = character;
  }
  isBefore(other) {
    if (this._line < other._line) {
      return true;
    }
    if (other._line < this._line) {
      return false;
    }
    return this._character < other._character;
  }
  isBeforeOrEqual(other) {
    if (this._line < other._line) {
      return true;
    }
    if (other._line < this._line) {
      return false;
    }
    return this._character <= other._character;
  }
  isAfter(other) {
    return !this.isBeforeOrEqual(other);
  }
  isAfterOrEqual(other) {
    return !this.isBefore(other);
  }
  isEqual(other) {
    return this._line === other._line && this._character === other._character;
  }
  compareTo(other) {
    if (this._line < other._line) {
      return -1;
    } else if (this._line > other.line) {
      return 1;
    } else {
      if (this._character < other._character) {
        return -1;
      } else if (this._character > other._character) {
        return 1;
      } else {
        return 0;
      }
    }
  }
  translate(lineDeltaOrChange, characterDelta = 0) {
    if (lineDeltaOrChange === null || characterDelta === null) {
      throw illegalArgument();
    }
    let lineDelta;
    if (typeof lineDeltaOrChange === "undefined") {
      lineDelta = 0;
    } else if (typeof lineDeltaOrChange === "number") {
      lineDelta = lineDeltaOrChange;
    } else {
      lineDelta = typeof lineDeltaOrChange.lineDelta === "number" ? lineDeltaOrChange.lineDelta : 0;
      characterDelta = typeof lineDeltaOrChange.characterDelta === "number" ? lineDeltaOrChange.characterDelta : 0;
    }
    if (lineDelta === 0 && characterDelta === 0) {
      return this;
    }
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }
  with(lineOrChange, character = this.character) {
    if (lineOrChange === null || character === null) {
      throw illegalArgument();
    }
    let line;
    if (typeof lineOrChange === "undefined") {
      line = this.line;
    } else if (typeof lineOrChange === "number") {
      line = lineOrChange;
    } else {
      line = typeof lineOrChange.line === "number" ? lineOrChange.line : this.line;
      character = typeof lineOrChange.character === "number" ? lineOrChange.character : this.character;
    }
    if (line === this.line && character === this.character) {
      return this;
    }
    return new Position(line, character);
  }
  toJSON() {
    return { line: this.line, character: this.character };
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return `(${this.line}:${this.character})`;
  }
};
Position = __decorateClass([
  es5ClassCompat
], Position);
export {
  Position
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9wb3NpdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZXM1Q2xhc3NDb21wYXQgfSBmcm9tICcuL2VzNUNsYXNzQ29tcGF0LmpzJztcblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgUG9zaXRpb24ge1xuXG5cdHN0YXRpYyBNaW4oLi4ucG9zaXRpb25zOiBQb3NpdGlvbltdKTogUG9zaXRpb24ge1xuXHRcdGlmIChwb3NpdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSBwb3NpdGlvbnNbMF07XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBwb3NpdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHAgPSBwb3NpdGlvbnNbaV07XG5cdFx0XHRpZiAocC5pc0JlZm9yZShyZXN1bHQpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRzdGF0aWMgTWF4KC4uLnBvc2l0aW9uczogUG9zaXRpb25bXSk6IFBvc2l0aW9uIHtcblx0XHRpZiAocG9zaXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0ID0gcG9zaXRpb25zWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgcG9zaXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwID0gcG9zaXRpb25zW2ldO1xuXHRcdFx0aWYgKHAuaXNBZnRlcihyZXN1bHQpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHA7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRzdGF0aWMgaXNQb3NpdGlvbihvdGhlcjogdW5rbm93bik6IG90aGVyIGlzIFBvc2l0aW9uIHtcblx0XHRpZiAoIW90aGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvdGhlciBpbnN0YW5jZW9mIFBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgeyBsaW5lLCBjaGFyYWN0ZXIgfSA9IDxQb3NpdGlvbj5vdGhlcjtcblx0XHRpZiAodHlwZW9mIGxpbmUgPT09ICdudW1iZXInICYmIHR5cGVvZiBjaGFyYWN0ZXIgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0c3RhdGljIG9mKG9iajogdnNjb2RlLlBvc2l0aW9uKTogUG9zaXRpb24ge1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNQb3NpdGlvbihvYmopKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKG9iai5saW5lLCBvYmouY2hhcmFjdGVyKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50LCBpcyBOT1QgYSBwb3NpdGlvbi1saWtlIG9iamVjdCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGluZTogbnVtYmVyO1xuXHRwcml2YXRlIF9jaGFyYWN0ZXI6IG51bWJlcjtcblxuXHRnZXQgbGluZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lO1xuXHR9XG5cblx0Z2V0IGNoYXJhY3RlcigpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jaGFyYWN0ZXI7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihsaW5lOiBudW1iZXIsIGNoYXJhY3RlcjogbnVtYmVyKSB7XG5cdFx0aWYgKGxpbmUgPCAwKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2xpbmUgbXVzdCBiZSBub24tbmVnYXRpdmUnKTtcblx0XHR9XG5cdFx0aWYgKGNoYXJhY3RlciA8IDApIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY2hhcmFjdGVyIG11c3QgYmUgbm9uLW5lZ2F0aXZlJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2xpbmUgPSBsaW5lO1xuXHRcdHRoaXMuX2NoYXJhY3RlciA9IGNoYXJhY3Rlcjtcblx0fVxuXG5cdGlzQmVmb3JlKG90aGVyOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9saW5lIDwgb3RoZXIuX2xpbmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAob3RoZXIuX2xpbmUgPCB0aGlzLl9saW5lKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jaGFyYWN0ZXIgPCBvdGhlci5fY2hhcmFjdGVyO1xuXHR9XG5cblx0aXNCZWZvcmVPckVxdWFsKG90aGVyOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9saW5lIDwgb3RoZXIuX2xpbmUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAob3RoZXIuX2xpbmUgPCB0aGlzLl9saW5lKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jaGFyYWN0ZXIgPD0gb3RoZXIuX2NoYXJhY3Rlcjtcblx0fVxuXG5cdGlzQWZ0ZXIob3RoZXI6IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmlzQmVmb3JlT3JFcXVhbChvdGhlcik7XG5cdH1cblxuXHRpc0FmdGVyT3JFcXVhbChvdGhlcjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuaXNCZWZvcmUob3RoZXIpO1xuXHR9XG5cblx0aXNFcXVhbChvdGhlcjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZSA9PT0gb3RoZXIuX2xpbmUgJiYgdGhpcy5fY2hhcmFjdGVyID09PSBvdGhlci5fY2hhcmFjdGVyO1xuXHR9XG5cblx0Y29tcGFyZVRvKG90aGVyOiBQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2xpbmUgPCBvdGhlci5fbGluZSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fbGluZSA+IG90aGVyLmxpbmUpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBlcXVhbCBsaW5lXG5cdFx0XHRpZiAodGhpcy5fY2hhcmFjdGVyIDwgb3RoZXIuX2NoYXJhY3Rlcikge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2NoYXJhY3RlciA+IG90aGVyLl9jaGFyYWN0ZXIpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBlcXVhbCBsaW5lIGFuZCBjaGFyYWN0ZXJcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dHJhbnNsYXRlKGNoYW5nZTogeyBsaW5lRGVsdGE/OiBudW1iZXI7IGNoYXJhY3RlckRlbHRhPzogbnVtYmVyIH0pOiBQb3NpdGlvbjtcblx0dHJhbnNsYXRlKGxpbmVEZWx0YT86IG51bWJlciwgY2hhcmFjdGVyRGVsdGE/OiBudW1iZXIpOiBQb3NpdGlvbjtcblx0dHJhbnNsYXRlKGxpbmVEZWx0YU9yQ2hhbmdlOiBudW1iZXIgfCB1bmRlZmluZWQgfCB7IGxpbmVEZWx0YT86IG51bWJlcjsgY2hhcmFjdGVyRGVsdGE/OiBudW1iZXIgfSwgY2hhcmFjdGVyRGVsdGE6IG51bWJlciA9IDApOiBQb3NpdGlvbiB7XG5cblx0XHRpZiAobGluZURlbHRhT3JDaGFuZ2UgPT09IG51bGwgfHwgY2hhcmFjdGVyRGVsdGEgPT09IG51bGwpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHRcdH1cblxuXHRcdGxldCBsaW5lRGVsdGE6IG51bWJlcjtcblx0XHRpZiAodHlwZW9mIGxpbmVEZWx0YU9yQ2hhbmdlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0bGluZURlbHRhID0gMDtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBsaW5lRGVsdGFPckNoYW5nZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGxpbmVEZWx0YSA9IGxpbmVEZWx0YU9yQ2hhbmdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lRGVsdGEgPSB0eXBlb2YgbGluZURlbHRhT3JDaGFuZ2UubGluZURlbHRhID09PSAnbnVtYmVyJyA/IGxpbmVEZWx0YU9yQ2hhbmdlLmxpbmVEZWx0YSA6IDA7XG5cdFx0XHRjaGFyYWN0ZXJEZWx0YSA9IHR5cGVvZiBsaW5lRGVsdGFPckNoYW5nZS5jaGFyYWN0ZXJEZWx0YSA9PT0gJ251bWJlcicgPyBsaW5lRGVsdGFPckNoYW5nZS5jaGFyYWN0ZXJEZWx0YSA6IDA7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVEZWx0YSA9PT0gMCAmJiBjaGFyYWN0ZXJEZWx0YSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24odGhpcy5saW5lICsgbGluZURlbHRhLCB0aGlzLmNoYXJhY3RlciArIGNoYXJhY3RlckRlbHRhKTtcblx0fVxuXG5cdHdpdGgoY2hhbmdlOiB7IGxpbmU/OiBudW1iZXI7IGNoYXJhY3Rlcj86IG51bWJlciB9KTogUG9zaXRpb247XG5cdHdpdGgobGluZT86IG51bWJlciwgY2hhcmFjdGVyPzogbnVtYmVyKTogUG9zaXRpb247XG5cdHdpdGgobGluZU9yQ2hhbmdlOiBudW1iZXIgfCB1bmRlZmluZWQgfCB7IGxpbmU/OiBudW1iZXI7IGNoYXJhY3Rlcj86IG51bWJlciB9LCBjaGFyYWN0ZXI6IG51bWJlciA9IHRoaXMuY2hhcmFjdGVyKTogUG9zaXRpb24ge1xuXG5cdFx0aWYgKGxpbmVPckNoYW5nZSA9PT0gbnVsbCB8fCBjaGFyYWN0ZXIgPT09IG51bGwpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHRcdH1cblxuXHRcdGxldCBsaW5lOiBudW1iZXI7XG5cdFx0aWYgKHR5cGVvZiBsaW5lT3JDaGFuZ2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRsaW5lID0gdGhpcy5saW5lO1xuXG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgbGluZU9yQ2hhbmdlID09PSAnbnVtYmVyJykge1xuXHRcdFx0bGluZSA9IGxpbmVPckNoYW5nZTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lID0gdHlwZW9mIGxpbmVPckNoYW5nZS5saW5lID09PSAnbnVtYmVyJyA/IGxpbmVPckNoYW5nZS5saW5lIDogdGhpcy5saW5lO1xuXHRcdFx0Y2hhcmFjdGVyID0gdHlwZW9mIGxpbmVPckNoYW5nZS5jaGFyYWN0ZXIgPT09ICdudW1iZXInID8gbGluZU9yQ2hhbmdlLmNoYXJhY3RlciA6IHRoaXMuY2hhcmFjdGVyO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lID09PSB0aGlzLmxpbmUgJiYgY2hhcmFjdGVyID09PSB0aGlzLmNoYXJhY3Rlcikge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZSwgY2hhcmFjdGVyKTtcblx0fVxuXG5cdHRvSlNPTigpOiB7IGxpbmU6IG51bWJlcjsgY2hhcmFjdGVyOiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHsgbGluZTogdGhpcy5saW5lLCBjaGFyYWN0ZXI6IHRoaXMuY2hhcmFjdGVyIH07XG5cdH1cblxuXHRbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7XG5cdFx0cmV0dXJuIGAoJHt0aGlzLmxpbmV9OiR7dGhpcy5jaGFyYWN0ZXJ9KWA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUd4QixJQUFNLFdBQU4sTUFBZTtBQUFBLEVBRXJCLE9BQU8sT0FBTyxXQUFpQztBQUM5QyxRQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCLFlBQU0sSUFBSSxVQUFVO0FBQUEsSUFDckI7QUFDQSxRQUFJLFNBQVMsVUFBVSxDQUFDO0FBQ3hCLGFBQVMsSUFBSSxHQUFHLElBQUksVUFBVSxRQUFRLEtBQUs7QUFDMUMsWUFBTSxJQUFJLFVBQVUsQ0FBQztBQUNyQixVQUFJLEVBQUUsU0FBUyxNQUFNLEdBQUc7QUFDdkIsaUJBQVM7QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFPLE9BQU8sV0FBaUM7QUFDOUMsUUFBSSxVQUFVLFdBQVcsR0FBRztBQUMzQixZQUFNLElBQUksVUFBVTtBQUFBLElBQ3JCO0FBQ0EsUUFBSSxTQUFTLFVBQVUsQ0FBQztBQUN4QixhQUFTLElBQUksR0FB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
