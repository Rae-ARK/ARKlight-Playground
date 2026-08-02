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
import { es5ClassCompat } from "./es5ClassCompat.js";
import { Location } from "./location.js";
import { Range } from "./range.js";
var SymbolKind = /* @__PURE__ */ ((SymbolKind2) => {
  SymbolKind2[SymbolKind2["File"] = 0] = "File";
  SymbolKind2[SymbolKind2["Module"] = 1] = "Module";
  SymbolKind2[SymbolKind2["Namespace"] = 2] = "Namespace";
  SymbolKind2[SymbolKind2["Package"] = 3] = "Package";
  SymbolKind2[SymbolKind2["Class"] = 4] = "Class";
  SymbolKind2[SymbolKind2["Method"] = 5] = "Method";
  SymbolKind2[SymbolKind2["Property"] = 6] = "Property";
  SymbolKind2[SymbolKind2["Field"] = 7] = "Field";
  SymbolKind2[SymbolKind2["Constructor"] = 8] = "Constructor";
  SymbolKind2[SymbolKind2["Enum"] = 9] = "Enum";
  SymbolKind2[SymbolKind2["Interface"] = 10] = "Interface";
  SymbolKind2[SymbolKind2["Function"] = 11] = "Function";
  SymbolKind2[SymbolKind2["Variable"] = 12] = "Variable";
  SymbolKind2[SymbolKind2["Constant"] = 13] = "Constant";
  SymbolKind2[SymbolKind2["String"] = 14] = "String";
  SymbolKind2[SymbolKind2["Number"] = 15] = "Number";
  SymbolKind2[SymbolKind2["Boolean"] = 16] = "Boolean";
  SymbolKind2[SymbolKind2["Array"] = 17] = "Array";
  SymbolKind2[SymbolKind2["Object"] = 18] = "Object";
  SymbolKind2[SymbolKind2["Key"] = 19] = "Key";
  SymbolKind2[SymbolKind2["Null"] = 20] = "Null";
  SymbolKind2[SymbolKind2["EnumMember"] = 21] = "EnumMember";
  SymbolKind2[SymbolKind2["Struct"] = 22] = "Struct";
  SymbolKind2[SymbolKind2["Event"] = 23] = "Event";
  SymbolKind2[SymbolKind2["Operator"] = 24] = "Operator";
  SymbolKind2[SymbolKind2["TypeParameter"] = 25] = "TypeParameter";
  return SymbolKind2;
})(SymbolKind || {});
var SymbolTag = /* @__PURE__ */ ((SymbolTag2) => {
  SymbolTag2[SymbolTag2["Deprecated"] = 1] = "Deprecated";
  return SymbolTag2;
})(SymbolTag || {});
let SymbolInformation = class {
  static validate(candidate) {
    if (!candidate.name) {
      throw new Error("name must not be falsy");
    }
  }
  constructor(name, kind, rangeOrContainer, locationOrUri, containerName) {
    this.name = name;
    this.kind = kind;
    this.containerName = containerName;
    if (typeof rangeOrContainer === "string") {
      this.containerName = rangeOrContainer;
    }
    if (locationOrUri instanceof Location) {
      this.location = locationOrUri;
    } else if (rangeOrContainer instanceof Range) {
      this.location = new Location(locationOrUri, rangeOrContainer);
    }
    SymbolInformation.validate(this);
  }
  toJSON() {
    return {
      name: this.name,
      kind: SymbolKind[this.kind],
      location: this.location,
      containerName: this.containerName
    };
  }
};
SymbolInformation = __decorateClass([
  es5ClassCompat
], SymbolInformation);
export {
  SymbolInformation,
  SymbolKind,
  SymbolTag
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9zeW1ib2xJbmZvcm1hdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuL2xvY2F0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi9yYW5nZS5qcyc7XG5cbmV4cG9ydCBlbnVtIFN5bWJvbEtpbmQge1xuXHRGaWxlID0gMCxcblx0TW9kdWxlID0gMSxcblx0TmFtZXNwYWNlID0gMixcblx0UGFja2FnZSA9IDMsXG5cdENsYXNzID0gNCxcblx0TWV0aG9kID0gNSxcblx0UHJvcGVydHkgPSA2LFxuXHRGaWVsZCA9IDcsXG5cdENvbnN0cnVjdG9yID0gOCxcblx0RW51bSA9IDksXG5cdEludGVyZmFjZSA9IDEwLFxuXHRGdW5jdGlvbiA9IDExLFxuXHRWYXJpYWJsZSA9IDEyLFxuXHRDb25zdGFudCA9IDEzLFxuXHRTdHJpbmcgPSAxNCxcblx0TnVtYmVyID0gMTUsXG5cdEJvb2xlYW4gPSAxNixcblx0QXJyYXkgPSAxNyxcblx0T2JqZWN0ID0gMTgsXG5cdEtleSA9IDE5LFxuXHROdWxsID0gMjAsXG5cdEVudW1NZW1iZXIgPSAyMSxcblx0U3RydWN0ID0gMjIsXG5cdEV2ZW50ID0gMjMsXG5cdE9wZXJhdG9yID0gMjQsXG5cdFR5cGVQYXJhbWV0ZXIgPSAyNVxufVxuXG5leHBvcnQgZW51bSBTeW1ib2xUYWcge1xuXHREZXByZWNhdGVkID0gMVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBTeW1ib2xJbmZvcm1hdGlvbiB7XG5cblx0c3RhdGljIHZhbGlkYXRlKGNhbmRpZGF0ZTogU3ltYm9sSW5mb3JtYXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIWNhbmRpZGF0ZS5uYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25hbWUgbXVzdCBub3QgYmUgZmFsc3knKTtcblx0XHR9XG5cdH1cblxuXHRuYW1lOiBzdHJpbmc7XG5cdGxvY2F0aW9uITogTG9jYXRpb247XG5cdGtpbmQ6IFN5bWJvbEtpbmQ7XG5cdHRhZ3M/OiBTeW1ib2xUYWdbXTtcblx0Y29udGFpbmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywga2luZDogU3ltYm9sS2luZCwgY29udGFpbmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBsb2NhdGlvbjogTG9jYXRpb24pO1xuXHRjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIGtpbmQ6IFN5bWJvbEtpbmQsIHJhbmdlOiBSYW5nZSwgdXJpPzogVVJJLCBjb250YWluZXJOYW1lPzogc3RyaW5nKTtcblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBraW5kOiBTeW1ib2xLaW5kLCByYW5nZU9yQ29udGFpbmVyOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBSYW5nZSwgbG9jYXRpb25PclVyaT86IExvY2F0aW9uIHwgVVJJLCBjb250YWluZXJOYW1lPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHRcdHRoaXMuY29udGFpbmVyTmFtZSA9IGNvbnRhaW5lck5hbWU7XG5cblx0XHRpZiAodHlwZW9mIHJhbmdlT3JDb250YWluZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lck5hbWUgPSByYW5nZU9yQ29udGFpbmVyO1xuXHRcdH1cblxuXHRcdGlmIChsb2NhdGlvbk9yVXJpIGluc3RhbmNlb2YgTG9jYXRpb24pIHtcblx0XHRcdHRoaXMubG9jYXRpb24gPSBsb2NhdGlvbk9yVXJpO1xuXHRcdH0gZWxzZSBpZiAocmFuZ2VPckNvbnRhaW5lciBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHR0aGlzLmxvY2F0aW9uID0gbmV3IExvY2F0aW9uKGxvY2F0aW9uT3JVcmkhLCByYW5nZU9yQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHRTeW1ib2xJbmZvcm1hdGlvbi52YWxpZGF0ZSh0aGlzKTtcblx0fVxuXG5cdHRvSlNPTigpOiB7IG5hbWU6IHN0cmluZzsga2luZDogc3RyaW5nOyBsb2NhdGlvbjogTG9jYXRpb247IGNvbnRhaW5lck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGhpcy5uYW1lLFxuXHRcdFx0a2luZDogU3ltYm9sS2luZFt0aGlzLmtpbmRdLFxuXHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRjb250YWluZXJOYW1lOiB0aGlzLmNvbnRhaW5lck5hbWVcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBTUEsU0FBUyxzQkFB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
