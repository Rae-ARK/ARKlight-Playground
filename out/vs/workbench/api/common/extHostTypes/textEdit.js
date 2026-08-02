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
import { Range } from "./range.js";
var EndOfLine = /* @__PURE__ */ ((EndOfLine2) => {
  EndOfLine2[EndOfLine2["LF"] = 1] = "LF";
  EndOfLine2[EndOfLine2["CRLF"] = 2] = "CRLF";
  return EndOfLine2;
})(EndOfLine || {});
let TextEdit = class {
  static isTextEdit(thing) {
    if (thing instanceof TextEdit) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return Range.isRange(thing) && typeof thing.newText === "string";
  }
  static replace(range, newText) {
    return new TextEdit(range, newText);
  }
  static insert(position, newText) {
    return TextEdit.replace(new Range(position, position), newText);
  }
  static delete(range) {
    return TextEdit.replace(range, "");
  }
  static setEndOfLine(eol) {
    const ret = new TextEdit(new Range(new Position(0, 0), new Position(0, 0)), "");
    ret.newEol = eol;
    return ret;
  }
  get range() {
    return this._range;
  }
  set range(value) {
    if (value && !Range.isRange(value)) {
      throw illegalArgument("range");
    }
    this._range = value;
  }
  get newText() {
    return this._newText || "";
  }
  set newText(value) {
    if (value && typeof value !== "string") {
      throw illegalArgument("newText");
    }
    this._newText = value;
  }
  get newEol() {
    return this._newEol;
  }
  set newEol(value) {
    if (value && typeof value !== "number") {
      throw illegalArgument("newEol");
    }
    this._newEol = value;
  }
  constructor(range, newText) {
    this._range = range;
    this._newText = newText;
  }
  toJSON() {
    return {
      range: this.range,
      newText: this.newText,
      newEol: this._newEol
    };
  }
};
TextEdit = __decorateClass([
  es5ClassCompat
], TextEdit);
export {
  EndOfLine,
  TextEdit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy90ZXh0RWRpdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi9yYW5nZS5qcyc7XG5cbmV4cG9ydCBlbnVtIEVuZE9mTGluZSB7XG5cdExGID0gMSxcblx0Q1JMRiA9IDJcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVGV4dEVkaXQge1xuXG5cdHN0YXRpYyBpc1RleHRFZGl0KHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgVGV4dEVkaXQge1xuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIFRleHRFZGl0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCF0aGluZyB8fCB0eXBlb2YgdGhpbmcgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBSYW5nZS5pc1JhbmdlKCg8VGV4dEVkaXQ+dGhpbmcpKVxuXHRcdFx0JiYgdHlwZW9mICg8VGV4dEVkaXQ+dGhpbmcpLm5ld1RleHQgPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0c3RhdGljIHJlcGxhY2UocmFuZ2U6IFJhbmdlLCBuZXdUZXh0OiBzdHJpbmcpOiBUZXh0RWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0RWRpdChyYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRzdGF0aWMgaW5zZXJ0KHBvc2l0aW9uOiBQb3NpdGlvbiwgbmV3VGV4dDogc3RyaW5nKTogVGV4dEVkaXQge1xuXHRcdHJldHVybiBUZXh0RWRpdC5yZXBsYWNlKG5ldyBSYW5nZShwb3NpdGlvbiwgcG9zaXRpb24pLCBuZXdUZXh0KTtcblx0fVxuXG5cdHN0YXRpYyBkZWxldGUocmFuZ2U6IFJhbmdlKTogVGV4dEVkaXQge1xuXHRcdHJldHVybiBUZXh0RWRpdC5yZXBsYWNlKHJhbmdlLCAnJyk7XG5cdH1cblxuXHRzdGF0aWMgc2V0RW5kT2ZMaW5lKGVvbDogRW5kT2ZMaW5lKTogVGV4dEVkaXQge1xuXHRcdGNvbnN0IHJldCA9IG5ldyBUZXh0RWRpdChuZXcgUmFuZ2UobmV3IFBvc2l0aW9uKDAsIDApLCBuZXcgUG9zaXRpb24oMCwgMCkpLCAnJyk7XG5cdFx0cmV0Lm5ld0VvbCA9IGVvbDtcblx0XHRyZXR1cm4gcmV0O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yYW5nZTogUmFuZ2U7XG5cdHByb3RlY3RlZCBfbmV3VGV4dDogc3RyaW5nIHwgbnVsbDtcblx0cHJvdGVjdGVkIF9uZXdFb2w/OiBFbmRPZkxpbmU7XG5cblx0Z2V0IHJhbmdlKCk6IFJhbmdlIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2U7XG5cdH1cblxuXHRzZXQgcmFuZ2UodmFsdWU6IFJhbmdlKSB7XG5cdFx0aWYgKHZhbHVlICYmICFSYW5nZS5pc1JhbmdlKHZhbHVlKSkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdyYW5nZScpO1xuXHRcdH1cblx0XHR0aGlzLl9yYW5nZSA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IG5ld1RleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV3VGV4dCB8fCAnJztcblx0fVxuXG5cdHNldCBuZXdUZXh0KHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCduZXdUZXh0Jyk7XG5cdFx0fVxuXHRcdHRoaXMuX25ld1RleHQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBuZXdFb2woKTogRW5kT2ZMaW5lIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV3RW9sO1xuXHR9XG5cblx0c2V0IG5ld0VvbCh2YWx1ZTogRW5kT2ZMaW5lIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbmV3RW9sJyk7XG5cdFx0fVxuXHRcdHRoaXMuX25ld0VvbCA9IHZhbHVlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCBuZXdUZXh0OiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0dGhpcy5fcmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLl9uZXdUZXh0ID0gbmV3VGV4dDtcblx0fVxuXG5cdHRvSlNPTigpOiB7IHJhbmdlOiBSYW5nZTsgbmV3VGV4dDogc3RyaW5nOyBuZXdFb2w6IEVuZE9mTGluZSB8IHVuZGVmaW5lZCB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IHRoaXMucmFuZ2UsXG5cdFx0XHRuZXdUZXh0OiB0aGlzLm5ld1RleHQsXG5cdFx0XHRuZXdFb2w6IHRoaXMuX25ld0VvbFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFZixJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDTixFQUFBQSxzQkFBQSxRQUFLLEtBQUw7QUFDQSxFQUFBQSxzQkFBQSxVQUFPLEtBQVA7QUFGVyxTQUFBQTtBQUFBLEdBQUE7QUFNTCxJQUFNLFdBQU4sTUFBZTtBQUFBLEVBRXJCLE9BQU8sV0FBVyxPQUFtQztBQUNwRCxRQUFJLGlCQUFpQixVQUFVO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDeEMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLE1BQU0sUUFBbUIsS0FBTSxLQUNsQyxPQUFrQixNQUFPLFlBQVk7QUFBQSxFQUMxQztBQUFBLEVBRUEsT0FBTyxRQUFRLE9BQWMsU0FBMkI7QUFDdkQsV0FBTyxJQUFJLFNBQVMsT0FBTyxPQUFPO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE9BQU8sT0FBTyxVQUFvQixTQUEyQjtBQUM1RCxXQUFPLFNBQVMsUUFBUSxJQUFJLE1BQU0sVUFBVSxRQUFRLEdBQUcsT0FBTztBQUFBLEVBQy9EO0FBQUEsRUFFQSxPQUFPLE9BQU8sT0FBd0I7QUFDckMsV0FBTyxTQUFTLFFBQVEsT0FBTyxFQUFFO0FBQUEsRUFDbEM7QUFBQSxFQUVBLE9BQU8sYUFBYSxLQUEwQjtBQUM3QyxVQUFNLE1BQU0sSUFBSSxTQUFTLElBQUksTUFBTSxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRTtBQUM5RSxRQUFJLFNBQVM7QUFDYixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBTUEsSUFBSSxRQUFlO0FBQ2xCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFjO0FBQ3ZCLFFBQUksU0FBUyxDQUFDLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDbkMsWUFBTSxnQkFBZ0IsT0FBTztBQUFBLElBQzlCO0FBQ0EsU0FBSyxTQUFTO0FBQUEsRUFDZjtBQUFBLEVBRUEsSUFBSSxVQUFrQjtBQUNyQixXQUFPLEtBQUssWUFBWTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLFFBQVEsT0FBZTtBQUMxQixRQUFJLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDdkMsWUFBTSxnQkFBZ0IsU0FBUztBQUFBLElBQ2hDO0FBQ0EsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVBLElBQUksU0FBZ0M7QUFDbkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxPQUFPLE9BQThCO0FBQ3hDLFFBQUksU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN2QyxZQUFNLGdCQUFnQixRQUFRO0FBQUEsSUFDL0I7QUFDQSxTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBRUEsWUFBWSxPQUFjLFNBQXdCO0FBQ2pELFNBQUssU0FBUztBQUNkLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxTQUEyRTtBQUMxRSxXQUFPO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLFNBQVMsS0FBSztBQUFBLE1BQ2QsUUFBUSxLQUFLO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFDRDtBQWhGYSxXQUFOO0FBQUEsRUFETjtBQUFBLEdBQ1k7IiwKICAibmFtZXMiOiBbIkVuZE9mTGluZSJdCn0K
