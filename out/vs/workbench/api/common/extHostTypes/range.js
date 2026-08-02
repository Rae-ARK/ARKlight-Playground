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
import { Position } from "./position.js";
let Range = class {
  static isRange(thing) {
    if (thing instanceof Range) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return Position.isPosition(thing.start) && Position.isPosition(thing.end);
  }
  static of(obj) {
    if (obj instanceof Range) {
      return obj;
    }
    if (this.isRange(obj)) {
      return new Range(obj.start, obj.end);
    }
    throw new Error("Invalid argument, is NOT a range-like object");
  }
  get start() {
    return this._start;
  }
  get end() {
    return this._end;
  }
  constructor(startLineOrStart, startColumnOrEnd, endLine, endColumn) {
    let start;
    let end;
    if (typeof startLineOrStart === "number" && typeof startColumnOrEnd === "number" && typeof endLine === "number" && typeof endColumn === "number") {
      start = new Position(startLineOrStart, startColumnOrEnd);
      end = new Position(endLine, endColumn);
    } else if (Position.isPosition(startLineOrStart) && Position.isPosition(startColumnOrEnd)) {
      start = Position.of(startLineOrStart);
      end = Position.of(startColumnOrEnd);
    }
    if (!start || !end) {
      throw new Error("Invalid arguments");
    }
    if (start.isBefore(end)) {
      this._start = start;
      this._end = end;
    } else {
      this._start = end;
      this._end = start;
    }
  }
  contains(positionOrRange) {
    if (Range.isRange(positionOrRange)) {
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    } else if (Position.isPosition(positionOrRange)) {
      if (Position.of(positionOrRange).isBefore(this._start)) {
        return false;
      }
      if (this._end.isBefore(positionOrRange)) {
        return false;
      }
      return true;
    }
    return false;
  }
  isEqual(other) {
    return this._start.isEqual(other._start) && this._end.isEqual(other._end);
  }
  intersection(other) {
    const start = Position.Max(other.start, this._start);
    const end = Position.Min(other.end, this._end);
    if (start.isAfter(end)) {
      return void 0;
    }
    return new Range(start, end);
  }
  union(other) {
    if (this.contains(other)) {
      return this;
    } else if (other.contains(this)) {
      return other;
    }
    const start = Position.Min(other.start, this._start);
    const end = Position.Max(other.end, this.end);
    return new Range(start, end);
  }
  get isEmpty() {
    return this._start.isEqual(this._end);
  }
  get isSingleLine() {
    return this._start.line === this._end.line;
  }
  with(startOrChange, end = this.end) {
    if (startOrChange === null || end === null) {
      throw illegalArgument();
    }
    let start;
    if (!startOrChange) {
      start = this.start;
    } else if (Position.isPosition(startOrChange)) {
      start = startOrChange;
    } else {
      start = startOrChange.start || this.start;
      end = startOrChange.end || this.end;
    }
    if (start.isEqual(this._start) && end.isEqual(this.end)) {
      return this;
    }
    return new Range(start, end);
  }
  toJSON() {
    return [this.start, this.end];
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return getDebugDescriptionOfRange(this);
  }
};
Range = __decorateClass([
  es5ClassCompat
], Range);
function getDebugDescriptionOfRange(range) {
  return range.isEmpty ? `[${range.start.line}:${range.start.character})` : `[${range.start.line}:${range.start.character} -> ${range.end.line}:${range.end.character})`;
}
export {
  Range,
  getDebugDescriptionOfRange
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9yYW5nZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBpbGxlZ2FsQXJndW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZXM1Q2xhc3NDb21wYXQgfSBmcm9tICcuL2VzNUNsYXNzQ29tcGF0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi9wb3NpdGlvbi5qcyc7XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFJhbmdlIHtcblxuXHRzdGF0aWMgaXNSYW5nZSh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIHZzY29kZS5SYW5nZSB7XG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgUmFuZ2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIFBvc2l0aW9uLmlzUG9zaXRpb24oKDxSYW5nZT50aGluZykuc3RhcnQpXG5cdFx0XHQmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKCg8UmFuZ2U+dGhpbmcpLmVuZCk7XG5cdH1cblxuXHRzdGF0aWMgb2Yob2JqOiB2c2NvZGUuUmFuZ2UpOiBSYW5nZSB7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc1JhbmdlKG9iaikpIHtcblx0XHRcdHJldHVybiBuZXcgUmFuZ2Uob2JqLnN0YXJ0LCBvYmouZW5kKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50LCBpcyBOT1QgYSByYW5nZS1saWtlIG9iamVjdCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zdGFydDogUG9zaXRpb247XG5cdHByb3RlY3RlZCBfZW5kOiBQb3NpdGlvbjtcblxuXHRnZXQgc3RhcnQoKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydDtcblx0fVxuXG5cdGdldCBlbmQoKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9lbmQ7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihzdGFydDogdnNjb2RlLlBvc2l0aW9uLCBlbmQ6IHZzY29kZS5Qb3NpdGlvbik7XG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBQb3NpdGlvbiwgZW5kOiBQb3NpdGlvbik7XG5cdGNvbnN0cnVjdG9yKHN0YXJ0TGluZTogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyKTtcblx0Y29uc3RydWN0b3Ioc3RhcnRMaW5lT3JTdGFydDogbnVtYmVyIHwgUG9zaXRpb24gfCB2c2NvZGUuUG9zaXRpb24sIHN0YXJ0Q29sdW1uT3JFbmQ6IG51bWJlciB8IFBvc2l0aW9uIHwgdnNjb2RlLlBvc2l0aW9uLCBlbmRMaW5lPzogbnVtYmVyLCBlbmRDb2x1bW4/OiBudW1iZXIpIHtcblx0XHRsZXQgc3RhcnQ6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBlbmQ6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHR5cGVvZiBzdGFydExpbmVPclN0YXJ0ID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3RhcnRDb2x1bW5PckVuZCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGVuZExpbmUgPT09ICdudW1iZXInICYmIHR5cGVvZiBlbmRDb2x1bW4gPT09ICdudW1iZXInKSB7XG5cdFx0XHRzdGFydCA9IG5ldyBQb3NpdGlvbihzdGFydExpbmVPclN0YXJ0LCBzdGFydENvbHVtbk9yRW5kKTtcblx0XHRcdGVuZCA9IG5ldyBQb3NpdGlvbihlbmRMaW5lLCBlbmRDb2x1bW4pO1xuXHRcdH0gZWxzZSBpZiAoUG9zaXRpb24uaXNQb3NpdGlvbihzdGFydExpbmVPclN0YXJ0KSAmJiBQb3NpdGlvbi5pc1Bvc2l0aW9uKHN0YXJ0Q29sdW1uT3JFbmQpKSB7XG5cdFx0XHRzdGFydCA9IFBvc2l0aW9uLm9mKHN0YXJ0TGluZU9yU3RhcnQpO1xuXHRcdFx0ZW5kID0gUG9zaXRpb24ub2Yoc3RhcnRDb2x1bW5PckVuZCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzdGFydCB8fCAhZW5kKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0LmlzQmVmb3JlKGVuZCkpIHtcblx0XHRcdHRoaXMuX3N0YXJ0ID0gc3RhcnQ7XG5cdFx0XHR0aGlzLl9lbmQgPSBlbmQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXJ0ID0gZW5kO1xuXHRcdFx0dGhpcy5fZW5kID0gc3RhcnQ7XG5cdFx0fVxuXHR9XG5cblx0Y29udGFpbnMocG9zaXRpb25PclJhbmdlOiBQb3NpdGlvbiB8IFJhbmdlKTogYm9vbGVhbiB7XG5cdFx0aWYgKFJhbmdlLmlzUmFuZ2UocG9zaXRpb25PclJhbmdlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udGFpbnMocG9zaXRpb25PclJhbmdlLnN0YXJ0KVxuXHRcdFx0XHQmJiB0aGlzLmNvbnRhaW5zKHBvc2l0aW9uT3JSYW5nZS5lbmQpO1xuXG5cdFx0fSBlbHNlIGlmIChQb3NpdGlvbi5pc1Bvc2l0aW9uKHBvc2l0aW9uT3JSYW5nZSkpIHtcblx0XHRcdGlmIChQb3NpdGlvbi5vZihwb3NpdGlvbk9yUmFuZ2UpLmlzQmVmb3JlKHRoaXMuX3N0YXJ0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fZW5kLmlzQmVmb3JlKHBvc2l0aW9uT3JSYW5nZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlzRXF1YWwob3RoZXI6IFJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0LmlzRXF1YWwob3RoZXIuX3N0YXJ0KSAmJiB0aGlzLl9lbmQuaXNFcXVhbChvdGhlci5fZW5kKTtcblx0fVxuXG5cdGludGVyc2VjdGlvbihvdGhlcjogUmFuZ2UpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBQb3NpdGlvbi5NYXgob3RoZXIuc3RhcnQsIHRoaXMuX3N0YXJ0KTtcblx0XHRjb25zdCBlbmQgPSBQb3NpdGlvbi5NaW4ob3RoZXIuZW5kLCB0aGlzLl9lbmQpO1xuXHRcdGlmIChzdGFydC5pc0FmdGVyKGVuZCkpIHtcblx0XHRcdC8vIHRoaXMgaGFwcGVucyB3aGVuIHRoZXJlIGlzIG5vIG92ZXJsYXA6XG5cdFx0XHQvLyB8LS0tLS18XG5cdFx0XHQvLyAgICAgICAgICB8LS0tLXxcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQsIGVuZCk7XG5cdH1cblxuXHR1bmlvbihvdGhlcjogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0aWYgKHRoaXMuY29udGFpbnMob3RoZXIpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9IGVsc2UgaWYgKG90aGVyLmNvbnRhaW5zKHRoaXMpKSB7XG5cdFx0XHRyZXR1cm4gb3RoZXI7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXJ0ID0gUG9zaXRpb24uTWluKG90aGVyLnN0YXJ0LCB0aGlzLl9zdGFydCk7XG5cdFx0Y29uc3QgZW5kID0gUG9zaXRpb24uTWF4KG90aGVyLmVuZCwgdGhpcy5lbmQpO1xuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnQsIGVuZCk7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnQuaXNFcXVhbCh0aGlzLl9lbmQpO1xuXHR9XG5cblx0Z2V0IGlzU2luZ2xlTGluZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnQubGluZSA9PT0gdGhpcy5fZW5kLmxpbmU7XG5cdH1cblxuXHR3aXRoKGNoYW5nZTogeyBzdGFydD86IFBvc2l0aW9uOyBlbmQ/OiBQb3NpdGlvbiB9KTogUmFuZ2U7XG5cdHdpdGgoc3RhcnQ/OiBQb3NpdGlvbiwgZW5kPzogUG9zaXRpb24pOiBSYW5nZTtcblx0d2l0aChzdGFydE9yQ2hhbmdlOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCB8IHsgc3RhcnQ/OiBQb3NpdGlvbjsgZW5kPzogUG9zaXRpb24gfSwgZW5kOiBQb3NpdGlvbiA9IHRoaXMuZW5kKTogUmFuZ2Uge1xuXG5cdFx0aWYgKHN0YXJ0T3JDaGFuZ2UgPT09IG51bGwgfHwgZW5kID09PSBudWxsKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoKTtcblx0XHR9XG5cblx0XHRsZXQgc3RhcnQ6IFBvc2l0aW9uO1xuXHRcdGlmICghc3RhcnRPckNoYW5nZSkge1xuXHRcdFx0c3RhcnQgPSB0aGlzLnN0YXJ0O1xuXG5cdFx0fSBlbHNlIGlmIChQb3NpdGlvbi5pc1Bvc2l0aW9uKHN0YXJ0T3JDaGFuZ2UpKSB7XG5cdFx0XHRzdGFydCA9IHN0YXJ0T3JDaGFuZ2U7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhcnQgPSBzdGFydE9yQ2hhbmdlLnN0YXJ0IHx8IHRoaXMuc3RhcnQ7XG5cdFx0XHRlbmQgPSBzdGFydE9yQ2hhbmdlLmVuZCB8fCB0aGlzLmVuZDtcblx0XHR9XG5cblx0XHRpZiAoc3RhcnQuaXNFcXVhbCh0aGlzLl9zdGFydCkgJiYgZW5kLmlzRXF1YWwodGhpcy5lbmQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydCwgZW5kKTtcblx0fVxuXG5cdHRvSlNPTigpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gW3RoaXMuc3RhcnQsIHRoaXMuZW5kXTtcblx0fVxuXG5cdFtTeW1ib2wuZm9yKCdkZWJ1Zy5kZXNjcmlwdGlvbicpXSgpIHtcblx0XHRyZXR1cm4gZ2V0RGVidWdEZXNjcmlwdGlvbk9mUmFuZ2UodGhpcyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlYnVnRGVzY3JpcHRpb25PZlJhbmdlKHJhbmdlOiB2c2NvZGUuUmFuZ2UpOiBzdHJpbmcge1xuXHRyZXR1cm4gcmFuZ2UuaXNFbXB0eVxuXHRcdD8gYFske3JhbmdlLnN0YXJ0LmxpbmV9OiR7cmFuZ2Uuc3RhcnQuY2hhcmFjdGVyfSlgXG5cdFx0OiBgWyR7cmFuZ2Uuc3RhcnQubGluZX06JHtyYW5nZS5zdGFydC5jaGFyYWN0ZXJ9IC0+ICR7cmFuZ2UuZW5kLmxpbmV9OiR7cmFuZ2UuZW5kLmNoYXJhY3Rlcn0pYDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUdsQixJQUFN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
