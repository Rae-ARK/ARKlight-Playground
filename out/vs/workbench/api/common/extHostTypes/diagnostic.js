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
import { equals } from "../../../../base/common/arrays.js";
import { URI } from "../../../../base/common/uri.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Range } from "./range.js";
var DiagnosticTag = /* @__PURE__ */ ((DiagnosticTag2) => {
  DiagnosticTag2[DiagnosticTag2["Unnecessary"] = 1] = "Unnecessary";
  DiagnosticTag2[DiagnosticTag2["Deprecated"] = 2] = "Deprecated";
  return DiagnosticTag2;
})(DiagnosticTag || {});
var DiagnosticSeverity = /* @__PURE__ */ ((DiagnosticSeverity2) => {
  DiagnosticSeverity2[DiagnosticSeverity2["Hint"] = 3] = "Hint";
  DiagnosticSeverity2[DiagnosticSeverity2["Information"] = 2] = "Information";
  DiagnosticSeverity2[DiagnosticSeverity2["Warning"] = 1] = "Warning";
  DiagnosticSeverity2[DiagnosticSeverity2["Error"] = 0] = "Error";
  return DiagnosticSeverity2;
})(DiagnosticSeverity || {});
let DiagnosticRelatedInformation = class {
  static is(thing) {
    if (!thing) {
      return false;
    }
    return typeof thing.message === "string" && thing.location && Range.isRange(thing.location.range) && URI.isUri(thing.location.uri);
  }
  constructor(location, message) {
    this.location = location;
    this.message = message;
  }
  static isEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.message === b.message && a.location.range.isEqual(b.location.range) && a.location.uri.toString() === b.location.uri.toString();
  }
};
DiagnosticRelatedInformation = __decorateClass([
  es5ClassCompat
], DiagnosticRelatedInformation);
let Diagnostic = class {
  constructor(range, message, severity = 0 /* Error */) {
    if (!Range.isRange(range)) {
      throw new TypeError("range must be set");
    }
    if (!message) {
      throw new TypeError("message must be set");
    }
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
  toJSON() {
    return {
      severity: DiagnosticSeverity[this.severity],
      message: this.message,
      range: this.range,
      source: this.source,
      code: this.code
    };
  }
  static isEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.message === b.message && a.severity === b.severity && a.code === b.code && a.severity === b.severity && a.source === b.source && a.range.isEqual(b.range) && equals(a.tags, b.tags) && equals(a.relatedInformation, b.relatedInformation, DiagnosticRelatedInformation.isEqual);
  }
};
Diagnostic = __decorateClass([
  es5ClassCompat
], Diagnostic);
export {
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9kaWFnbm9zdGljLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuL2xvY2F0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi9yYW5nZS5qcyc7XG5cbmV4cG9ydCBlbnVtIERpYWdub3N0aWNUYWcge1xuXHRVbm5lY2Vzc2FyeSA9IDEsXG5cdERlcHJlY2F0ZWQgPSAyXG59XG5cbmV4cG9ydCBlbnVtIERpYWdub3N0aWNTZXZlcml0eSB7XG5cdEhpbnQgPSAzLFxuXHRJbmZvcm1hdGlvbiA9IDIsXG5cdFdhcm5pbmcgPSAxLFxuXHRFcnJvciA9IDBcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiB7XG5cblx0c3RhdGljIGlzKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiB7XG5cdFx0aWYgKCF0aGluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mICg8RGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbj50aGluZykubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdCYmICg8RGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbj50aGluZykubG9jYXRpb25cblx0XHRcdCYmIFJhbmdlLmlzUmFuZ2UoKDxEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uPnRoaW5nKS5sb2NhdGlvbi5yYW5nZSlcblx0XHRcdCYmIFVSSS5pc1VyaSgoPERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24+dGhpbmcpLmxvY2F0aW9uLnVyaSk7XG5cdH1cblxuXHRsb2NhdGlvbjogTG9jYXRpb247XG5cdG1lc3NhZ2U6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihsb2NhdGlvbjogTG9jYXRpb24sIG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHRoaXMubG9jYXRpb24gPSBsb2NhdGlvbjtcblx0XHR0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHR9XG5cblx0c3RhdGljIGlzRXF1YWwoYTogRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiwgYjogRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLm1lc3NhZ2UgPT09IGIubWVzc2FnZVxuXHRcdFx0JiYgYS5sb2NhdGlvbi5yYW5nZS5pc0VxdWFsKGIubG9jYXRpb24ucmFuZ2UpXG5cdFx0XHQmJiBhLmxvY2F0aW9uLnVyaS50b1N0cmluZygpID09PSBiLmxvY2F0aW9uLnVyaS50b1N0cmluZygpO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERpYWdub3N0aWMge1xuXG5cdHJhbmdlOiBSYW5nZTtcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRzZXZlcml0eTogRGlhZ25vc3RpY1NldmVyaXR5O1xuXHRzb3VyY2U/OiBzdHJpbmc7XG5cdGNvZGU/OiBzdHJpbmcgfCBudW1iZXI7XG5cdHJlbGF0ZWRJbmZvcm1hdGlvbj86IERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb25bXTtcblx0dGFncz86IERpYWdub3N0aWNUYWdbXTtcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIG1lc3NhZ2U6IHN0cmluZywgc2V2ZXJpdHk6IERpYWdub3N0aWNTZXZlcml0eSA9IERpYWdub3N0aWNTZXZlcml0eS5FcnJvcikge1xuXHRcdGlmICghUmFuZ2UuaXNSYW5nZShyYW5nZSkpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ3JhbmdlIG11c3QgYmUgc2V0Jyk7XG5cdFx0fVxuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignbWVzc2FnZSBtdXN0IGJlIHNldCcpO1xuXHRcdH1cblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLnNldmVyaXR5ID0gc2V2ZXJpdHk7XG5cdH1cblxuXHR0b0pTT04oKTogeyBzZXZlcml0eTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmc7IHJhbmdlOiBSYW5nZTsgc291cmNlPzogc3RyaW5nOyBjb2RlPzogc3RyaW5nIHwgbnVtYmVyIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogRGlhZ25vc3RpY1NldmVyaXR5W3RoaXMuc2V2ZXJpdHldLFxuXHRcdFx0bWVzc2FnZTogdGhpcy5tZXNzYWdlLFxuXHRcdFx0cmFuZ2U6IHRoaXMucmFuZ2UsXG5cdFx0XHRzb3VyY2U6IHRoaXMuc291cmNlLFxuXHRcdFx0Y29kZTogdGhpcy5jb2RlLFxuXHRcdH07XG5cdH1cblxuXHRzdGF0aWMgaXNFcXVhbChhOiBEaWFnbm9zdGljIHwgdW5kZWZpbmVkLCBiOiBEaWFnbm9zdGljIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWEgfHwgIWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGEubWVzc2FnZSA9PT0gYi5tZXNzYWdlXG5cdFx0XHQmJiBhLnNldmVyaXR5ID09PSBiLnNldmVyaXR5XG5cdFx0XHQmJiBhLmNvZGUgPT09IGIuY29kZVxuXHRcdFx0JiYgYS5zZXZlcml0eSA9PT0gYi5zZXZlcml0eVxuXHRcdFx0JiYgYS5zb3VyY2UgPT09IGIuc291cmNlXG5cdFx0XHQmJiBhLnJhbmdlLmlzRXF1YWwoYi5yYW5nZSlcblx0XHRcdCYmIGVxdWFscyhhLnRhZ3MsIGIudGFncylcblx0XHRcdCYmIGVxdWFscyhhLnJlbGF0ZWRJbmZvcm1hdGlvbiwgYi5yZWxhdGVkSW5mb3JtYXRpb24sIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24uaXNFcXVhbCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsYUFBYTtBQUVmLElBQUssZ0JBQUwsa0JBQUtBLG1CQUFMO0FBQ04sRUFBQUEsOEJBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLDhCQUFBLGdCQUFhLEtBQWI7QUFGVyxTQUFB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
