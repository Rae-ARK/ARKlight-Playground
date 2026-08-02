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
import { URI } from "../../../../base/common/uri.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Position } from "./position.js";
import { Range } from "./range.js";
let Location = class {
  static isLocation(thing) {
    if (thing instanceof Location) {
      return true;
    }
    if (!thing) {
      return false;
    }
    return Range.isRange(thing.range) && URI.isUri(thing.uri);
  }
  constructor(uri, rangeOrPosition) {
    this.uri = uri;
    if (!rangeOrPosition) {
    } else if (Range.isRange(rangeOrPosition)) {
      this.range = Range.of(rangeOrPosition);
    } else if (Position.isPosition(rangeOrPosition)) {
      this.range = new Range(rangeOrPosition, rangeOrPosition);
    } else {
      throw new Error("Illegal argument");
    }
  }
  toJSON() {
    return {
      uri: this.uri,
      range: this.range
    };
  }
};
Location = __decorateClass([
  es5ClassCompat
], Location);
export {
  Location
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9sb2NhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZXM1Q2xhc3NDb21wYXQgfSBmcm9tICcuL2VzNUNsYXNzQ29tcGF0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4vcmFuZ2UuanMnO1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBMb2NhdGlvbiB7XG5cblx0c3RhdGljIGlzTG9jYXRpb24odGhpbmc6IHVua25vd24pOiB0aGluZyBpcyB2c2NvZGUuTG9jYXRpb24ge1xuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIExvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCF0aGluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUmFuZ2UuaXNSYW5nZSgoPExvY2F0aW9uPnRoaW5nKS5yYW5nZSlcblx0XHRcdCYmIFVSSS5pc1VyaSgoPExvY2F0aW9uPnRoaW5nKS51cmkpO1xuXHR9XG5cblx0dXJpOiBVUkk7XG5cdHJhbmdlITogUmFuZ2U7XG5cblx0Y29uc3RydWN0b3IodXJpOiBVUkksIHJhbmdlT3JQb3NpdGlvbjogUmFuZ2UgfCBQb3NpdGlvbikge1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXG5cdFx0aWYgKCFyYW5nZU9yUG9zaXRpb24pIHtcblx0XHRcdC8vdGhhdCdzIE9LXG5cdFx0fSBlbHNlIGlmIChSYW5nZS5pc1JhbmdlKHJhbmdlT3JQb3NpdGlvbikpIHtcblx0XHRcdHRoaXMucmFuZ2UgPSBSYW5nZS5vZihyYW5nZU9yUG9zaXRpb24pO1xuXHRcdH0gZWxzZSBpZiAoUG9zaXRpb24uaXNQb3NpdGlvbihyYW5nZU9yUG9zaXRpb24pKSB7XG5cdFx0XHR0aGlzLnJhbmdlID0gbmV3IFJhbmdlKHJhbmdlT3JQb3NpdGlvbiwgcmFuZ2VPclBvc2l0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIGFyZ3VtZW50Jyk7XG5cdFx0fVxuXHR9XG5cblx0dG9KU09OKCk6IGFueSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogdGhpcy51cmksXG5cdFx0XHRyYW5nZTogdGhpcy5yYW5nZVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBR2YsSUFBTSxXQUFOLE1BQWU7QUFBQSxFQUVyQixPQUFPLFdBQVcsT0FBMEM7QUFDM0QsUUFBSSxpQkFBaUIsVUFBVTtBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLE1BQU0sUUFBbUIsTUFBTyxLQUFLLEtBQ3hDLElBQUksTUFBaUIsTUFBTyxHQUFHO0FBQUEsRUFDcEM7QUFBQSxFQUtBLFlBQVksS0FBVSxpQkFBbUM7QUFDeEQsU0FBSyxNQUFNO0FBRVgsUUFBSSxDQUFDLGlCQUFpQjtBQUFBLElBRXRCLFdBQVcsTUFBTSxRQUFRLGVBQWUsR0FBRztBQUMxQyxXQUFLLFFBQVEsTUFBTSxHQUFHLGVBQWU7QUFBQSxJQUN0QyxXQUFXLFNBQVMsV0FBVyxlQUFlLEdBQUc7QUFDaEQsV0FBSyxRQUFRLElBQUksTUFBTSxpQkFBaUIsZUFBZTtBQUFBLElBQ3hELE9BQU87QUFDTixZQUFNLElBQUksTUFBTSxrQkFBa0I7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFNBQWM7QUFDYixXQUFPO0FBQUEsTUFDTixLQUFLLEtBQUs7QUFBQSxNQUNWLE9BQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQ0Q7QUFwQ2EsV0FBTjtBQUFBLEVBRE47QUFBQSxHQUNZOyIsCiAgIm5hbWVzIjogW10KfQo=
