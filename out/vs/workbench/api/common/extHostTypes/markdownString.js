var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _delegate;
import { MarkdownString as BaseMarkdownString } from "../../../../base/common/htmlContent.js";
import { es5ClassCompat } from "./es5ClassCompat.js";
let MarkdownString = class {
  constructor(value, supportThemeIcons = false) {
    __privateAdd(this, _delegate);
    __privateSet(this, _delegate, new BaseMarkdownString(value, { supportThemeIcons }));
  }
  static isMarkdownString(thing) {
    if (thing instanceof MarkdownString) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return thing.appendCodeblock && thing.appendMarkdown && thing.appendText && thing.value !== void 0;
  }
  get value() {
    return __privateGet(this, _delegate).value;
  }
  set value(value) {
    __privateGet(this, _delegate).value = value;
  }
  get isTrusted() {
    return __privateGet(this, _delegate).isTrusted;
  }
  set isTrusted(value) {
    __privateGet(this, _delegate).isTrusted = value;
  }
  get supportThemeIcons() {
    return __privateGet(this, _delegate).supportThemeIcons;
  }
  set supportThemeIcons(value) {
    __privateGet(this, _delegate).supportThemeIcons = value;
  }
  get supportHtml() {
    return __privateGet(this, _delegate).supportHtml;
  }
  set supportHtml(value) {
    __privateGet(this, _delegate).supportHtml = value;
  }
  get supportAlertSyntax() {
    return __privateGet(this, _delegate).supportAlertSyntax;
  }
  set supportAlertSyntax(value) {
    __privateGet(this, _delegate).supportAlertSyntax = value;
  }
  get baseUri() {
    return __privateGet(this, _delegate).baseUri;
  }
  set baseUri(value) {
    __privateGet(this, _delegate).baseUri = value;
  }
  appendText(value) {
    __privateGet(this, _delegate).appendText(value);
    return this;
  }
  appendMarkdown(value) {
    __privateGet(this, _delegate).appendMarkdown(value);
    return this;
  }
  appendCodeblock(value, language) {
    __privateGet(this, _delegate).appendCodeblock(language ?? "", value);
    return this;
  }
};
_delegate = new WeakMap();
MarkdownString = __decorateClass([
  es5ClassCompat
], MarkdownString);
export {
  MarkdownString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9tYXJrZG93blN0cmluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyBhcyBCYXNlTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nVHJ1c3RlZE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBlczVDbGFzc0NvbXBhdCB9IGZyb20gJy4vZXM1Q2xhc3NDb21wYXQuanMnO1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBNYXJrZG93blN0cmluZyBpbXBsZW1lbnRzIHZzY29kZS5NYXJrZG93blN0cmluZyB7XG5cblx0cmVhZG9ubHkgI2RlbGVnYXRlOiBCYXNlTWFya2Rvd25TdHJpbmc7XG5cblx0c3RhdGljIGlzTWFya2Rvd25TdHJpbmcodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyB2c2NvZGUuTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCF0aGluZyB8fCB0eXBlb2YgdGhpbmcgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAodGhpbmcgYXMgdnNjb2RlLk1hcmtkb3duU3RyaW5nKS5hcHBlbmRDb2RlYmxvY2sgJiYgKHRoaW5nIGFzIHZzY29kZS5NYXJrZG93blN0cmluZykuYXBwZW5kTWFya2Rvd24gJiYgKHRoaW5nIGFzIHZzY29kZS5NYXJrZG93blN0cmluZykuYXBwZW5kVGV4dCAmJiAoKHRoaW5nIGFzIHZzY29kZS5NYXJrZG93blN0cmluZykudmFsdWUgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZT86IHN0cmluZywgc3VwcG9ydFRoZW1lSWNvbnM6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHRoaXMuI2RlbGVnYXRlID0gbmV3IEJhc2VNYXJrZG93blN0cmluZyh2YWx1ZSwgeyBzdXBwb3J0VGhlbWVJY29ucyB9KTtcblx0fVxuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS52YWx1ZTtcblx0fVxuXHRzZXQgdmFsdWUodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMuI2RlbGVnYXRlLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgaXNUcnVzdGVkKCk6IGJvb2xlYW4gfCBNYXJrZG93blN0cmluZ1RydXN0ZWRPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jZGVsZWdhdGUuaXNUcnVzdGVkO1xuXHR9XG5cblx0c2V0IGlzVHJ1c3RlZCh2YWx1ZTogYm9vbGVhbiB8IE1hcmtkb3duU3RyaW5nVHJ1c3RlZE9wdGlvbnMgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5pc1RydXN0ZWQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBzdXBwb3J0VGhlbWVJY29ucygpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jZGVsZWdhdGUuc3VwcG9ydFRoZW1lSWNvbnM7XG5cdH1cblxuXHRzZXQgc3VwcG9ydFRoZW1lSWNvbnModmFsdWU6IGJvb2xlYW4gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5zdXBwb3J0VGhlbWVJY29ucyA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRIdG1sKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS5zdXBwb3J0SHRtbDtcblx0fVxuXG5cdHNldCBzdXBwb3J0SHRtbCh2YWx1ZTogYm9vbGVhbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuI2RlbGVnYXRlLnN1cHBvcnRIdG1sID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgc3VwcG9ydEFsZXJ0U3ludGF4KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNkZWxlZ2F0ZS5zdXBwb3J0QWxlcnRTeW50YXg7XG5cdH1cblxuXHRzZXQgc3VwcG9ydEFsZXJ0U3ludGF4KHZhbHVlOiBib29sZWFuIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy4jZGVsZWdhdGUuc3VwcG9ydEFsZXJ0U3ludGF4ID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgYmFzZVVyaSgpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jZGVsZWdhdGUuYmFzZVVyaTtcblx0fVxuXG5cdHNldCBiYXNlVXJpKHZhbHVlOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy4jZGVsZWdhdGUuYmFzZVVyaSA9IHZhbHVlO1xuXHR9XG5cblx0YXBwZW5kVGV4dCh2YWx1ZTogc3RyaW5nKTogdnNjb2RlLk1hcmtkb3duU3RyaW5nIHtcblx0XHR0aGlzLiNkZWxlZ2F0ZS5hcHBlbmRUZXh0KHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZE1hcmtkb3duKHZhbHVlOiBzdHJpbmcpOiB2c2NvZGUuTWFya2Rvd25TdHJpbmcge1xuXHRcdHRoaXMuI2RlbGVnYXRlLmFwcGVuZE1hcmtkb3duKHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFwcGVuZENvZGVibG9jayh2YWx1ZTogc3RyaW5nLCBsYW5ndWFnZT86IHN0cmluZyk6IHZzY29kZS5NYXJrZG93blN0cmluZyB7XG5cdFx0dGhpcy4jZGVsZWdhdGUuYXBwZW5kQ29kZWJsb2NrKGxhbmd1YWdlID8/ICcnLCB2YWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFNQSxTQUFTLGtCQUFrQiwwQkFBd0Q7QUFDbkYsU0FBUyxzQkFBc0I7QUFHeEIsSUFBTSxpQkFBTixNQUFzRDtBQUFBLEVBYzVELFlBQVksT0FBZ0Isb0JBQTZCLE9BQU87QUFaaEUsdUJBQVM7QUFhUix1QkFBSyxXQUFZLElBQUksbUJBQW1CLE9BQU8sRUFBRSxrQkFBa0IsQ0FBQztBQUFBLEVBQ3JFO0FBQUEsRUFaQSxPQUFPLGlCQUFpQixPQUFnRDtBQUN2RSxRQUFJLGlCQUFpQixnQkFBZ0I7QUFDcEMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQVEsTUFBZ0MsbUJBQW9CLE1BQWdDLGtCQUFtQixNQUFnQyxjQUFnQixNQUFnQyxVQUFVO0FBQUEsRUFDMU07QUFBQSxFQU1BLElBQUksUUFBZ0I7QUFDbkIsV0FBTyxtQkFBSyxXQUFVO0FBQUEsRUFDdkI7QUFBQSxFQUNBLElBQUksTUFBTSxPQUFlO0FBQ3hCLHVCQUFLLFdBQVUsUUFBUTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxJQUFJLFlBQWdFO0FBQ25FLFdBQU8sbUJBQUssV0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLFVBQVUsT0FBMkQ7QUFDeEUsdUJBQUssV0FBVSxZQUFZO0FBQUEsRUFDNUI7QUFBQSxFQUVBLElBQUksb0JBQXlDO0FBQzVDLFdBQU8sbUJBQUssV0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLGtCQUFrQixPQUE0QjtBQUNqRCx1QkFBSyxXQUFVLG9CQUFvQjtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxJQUFJLGNBQW1DO0FBQ3RDLFdBQU8sbUJBQUssV0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLFlBQVksT0FBNEI7QUFDM0MsdUJBQUssV0FBVSxjQUFjO0FBQUEsRUFDOUI7QUFBQSxFQUVBLElBQUkscUJBQTBDO0FBQzdDLFdBQU8sbUJBQUssV0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLG1CQUFtQixPQUE0QjtBQUNsRCx1QkFBSyxXQUFVLHFCQUFxQjtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFdBQU8sbUJBQUssV0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxJQUFJLFFBQVEsT0FBK0I7QUFDMUMsdUJBQUssV0FBVSxVQUFVO0FBQUEsRUFDMUI7QUFBQSxFQUVBLFdBQVcsT0FBc0M7QUFDaEQsdUJBQUssV0FBVSxXQUFXLEtBQUs7QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGVBQWUsT0FBc0M7QUFDcEQsdUJBQUssV0FBVSxlQUFlLEtBQUs7QUFDbkMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGdCQUFnQixPQUFlLFVBQTBDO0FBQ3hFLHVCQUFLLFdBQVUsZ0JBQWdCLFlBQVksSUFBSSxLQUFLO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUE3RVU7QUFGRyxpQkFBTjtBQUFBLEVBRE47QUFBQSxHQUNZOyIsCiAgIm5hbWVzIjogW10KfQo=
