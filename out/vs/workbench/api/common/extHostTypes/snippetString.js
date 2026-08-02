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
let SnippetString = class {
  constructor(value) {
    this._tabstop = 1;
    this.value = value || "";
  }
  static isSnippetString(thing) {
    if (thing instanceof SnippetString) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return typeof thing.value === "string";
  }
  static _escape(value) {
    return value.replace(/\$|}|\\/g, "\\$&");
  }
  appendText(string) {
    this.value += SnippetString._escape(string);
    return this;
  }
  appendTabstop(number = this._tabstop++) {
    this.value += "$";
    this.value += number;
    return this;
  }
  appendPlaceholder(value, number = this._tabstop++) {
    if (typeof value === "function") {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      value(nested);
      this._tabstop = nested._tabstop;
      value = nested.value;
    } else {
      value = SnippetString._escape(value);
    }
    this.value += "${";
    this.value += number;
    this.value += ":";
    this.value += value;
    this.value += "}";
    return this;
  }
  appendChoice(values, number = this._tabstop++) {
    const value = values.map((s) => s.replaceAll(/[|\\,]/g, "\\$&")).join(",");
    this.value += "${";
    this.value += number;
    this.value += "|";
    this.value += value;
    this.value += "|}";
    return this;
  }
  appendVariable(name, defaultValue) {
    if (typeof defaultValue === "function") {
      const nested = new SnippetString();
      nested._tabstop = this._tabstop;
      defaultValue(nested);
      this._tabstop = nested._tabstop;
      defaultValue = nested.value;
    } else if (typeof defaultValue === "string") {
      defaultValue = defaultValue.replace(/\$|}/g, "\\$&");
    }
    this.value += "${";
    this.value += name;
    if (defaultValue) {
      this.value += ":";
      this.value += defaultValue;
    }
    this.value += "}";
    return this;
  }
};
SnippetString = __decorateClass([
  es5ClassCompat
], SnippetString);
export {
  SnippetString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUeXBlcy9zbmlwcGV0U3RyaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZXM1Q2xhc3NDb21wYXQgfSBmcm9tICcuL2VzNUNsYXNzQ29tcGF0LmpzJztcblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgU25pcHBldFN0cmluZyB7XG5cblx0c3RhdGljIGlzU25pcHBldFN0cmluZyh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIFNuaXBwZXRTdHJpbmcge1xuXHRcdGlmICh0aGluZyBpbnN0YW5jZW9mIFNuaXBwZXRTdHJpbmcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiAoPFNuaXBwZXRTdHJpbmc+dGhpbmcpLnZhbHVlID09PSAnc3RyaW5nJztcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9lc2NhcGUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xcJHx9fFxcXFwvZywgJ1xcXFwkJicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGFic3RvcDogbnVtYmVyID0gMTtcblxuXHR2YWx1ZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlPzogc3RyaW5nKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlIHx8ICcnO1xuXHR9XG5cblx0YXBwZW5kVGV4dChzdHJpbmc6IHN0cmluZyk6IFNuaXBwZXRTdHJpbmcge1xuXHRcdHRoaXMudmFsdWUgKz0gU25pcHBldFN0cmluZy5fZXNjYXBlKHN0cmluZyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhcHBlbmRUYWJzdG9wKG51bWJlcjogbnVtYmVyID0gdGhpcy5fdGFic3RvcCsrKTogU25pcHBldFN0cmluZyB7XG5cdFx0dGhpcy52YWx1ZSArPSAnJCc7XG5cdFx0dGhpcy52YWx1ZSArPSBudW1iZXI7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhcHBlbmRQbGFjZWhvbGRlcih2YWx1ZTogc3RyaW5nIHwgKChzbmlwcGV0OiBTbmlwcGV0U3RyaW5nKSA9PiB1bmtub3duKSwgbnVtYmVyOiBudW1iZXIgPSB0aGlzLl90YWJzdG9wKyspOiBTbmlwcGV0U3RyaW5nIHtcblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGNvbnN0IG5lc3RlZCA9IG5ldyBTbmlwcGV0U3RyaW5nKCk7XG5cdFx0XHRuZXN0ZWQuX3RhYnN0b3AgPSB0aGlzLl90YWJzdG9wO1xuXHRcdFx0dmFsdWUobmVzdGVkKTtcblx0XHRcdHRoaXMuX3RhYnN0b3AgPSBuZXN0ZWQuX3RhYnN0b3A7XG5cdFx0XHR2YWx1ZSA9IG5lc3RlZC52YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsdWUgPSBTbmlwcGV0U3RyaW5nLl9lc2NhcGUodmFsdWUpO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgKz0gJyR7Jztcblx0XHR0aGlzLnZhbHVlICs9IG51bWJlcjtcblx0XHR0aGlzLnZhbHVlICs9ICc6Jztcblx0XHR0aGlzLnZhbHVlICs9IHZhbHVlO1xuXHRcdHRoaXMudmFsdWUgKz0gJ30nO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhcHBlbmRDaG9pY2UodmFsdWVzOiBzdHJpbmdbXSwgbnVtYmVyOiBudW1iZXIgPSB0aGlzLl90YWJzdG9wKyspOiBTbmlwcGV0U3RyaW5nIHtcblx0XHRjb25zdCB2YWx1ZSA9IHZhbHVlcy5tYXAocyA9PiBzLnJlcGxhY2VBbGwoL1t8XFxcXCxdL2csICdcXFxcJCYnKSkuam9pbignLCcpO1xuXG5cdFx0dGhpcy52YWx1ZSArPSAnJHsnO1xuXHRcdHRoaXMudmFsdWUgKz0gbnVtYmVyO1xuXHRcdHRoaXMudmFsdWUgKz0gJ3wnO1xuXHRcdHRoaXMudmFsdWUgKz0gdmFsdWU7XG5cdFx0dGhpcy52YWx1ZSArPSAnfH0nO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRhcHBlbmRWYXJpYWJsZShuYW1lOiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IHN0cmluZyB8ICgoc25pcHBldDogU25pcHBldFN0cmluZykgPT4gdW5rbm93bikpOiBTbmlwcGV0U3RyaW5nIHtcblxuXHRcdGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBuZXN0ZWQgPSBuZXcgU25pcHBldFN0cmluZygpO1xuXHRcdFx0bmVzdGVkLl90YWJzdG9wID0gdGhpcy5fdGFic3RvcDtcblx0XHRcdGRlZmF1bHRWYWx1ZShuZXN0ZWQpO1xuXHRcdFx0dGhpcy5fdGFic3RvcCA9IG5lc3RlZC5fdGFic3RvcDtcblx0XHRcdGRlZmF1bHRWYWx1ZSA9IG5lc3RlZC52YWx1ZTtcblxuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZS5yZXBsYWNlKC9cXCR8fS9nLCAnXFxcXCQmJyk7IC8vIENvZGVRTCBbU00wMjM4M10gSSBkbyBub3Qgd2FudCB0byBlc2NhcGUgYmFja3NsYXNoZXMgaGVyZVxuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgKz0gJyR7Jztcblx0XHR0aGlzLnZhbHVlICs9IG5hbWU7XG5cdFx0aWYgKGRlZmF1bHRWYWx1ZSkge1xuXHRcdFx0dGhpcy52YWx1ZSArPSAnOic7XG5cdFx0XHR0aGlzLnZhbHVlICs9IGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0dGhpcy52YWx1ZSArPSAnfSc7XG5cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFHeEIsSUFBTSxnQkFBTixNQUFvQjtBQUFBLEVBb0IxQixZQUFZLE9BQWdCO0FBSjVCLFNBQVEsV0FBbUI7QUFLMUIsU0FBSyxRQUFRLFNBQVM7QUFBQSxFQUN2QjtBQUFBLEVBcEJBLE9BQU8sZ0JBQWdCLE9BQXdDO0FBQzlELFFBQUksaUJBQWlCLGVBQWU7QUFDbkMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sT0FBdUIsTUFBTyxVQUFVO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLE9BQWUsUUFBUSxPQUF1QjtBQUM3QyxXQUFPLE1BQU0sUUFBUSxZQUFZLE1BQU07QUFBQSxFQUN4QztBQUFBLEVBVUEsV0FBVyxRQUErQjtBQUN6QyxTQUFLLFNBQVMsY0FBYyxRQUFRLE1BQU07QUFDMUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGNBQWMsU0FBaUIsS0FBSyxZQUEyQjtBQUM5RCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsa0JBQWtCLE9BQXVELFNBQWlCLEtBQUssWUFBMkI7QUFFekgsUUFBSSxPQUFPLFVBQVUsWUFBWTtBQUNoQyxZQUFNLFNBQVMsSUFBSSxjQUFjO0FBQ2pDLGFBQU8sV0FBVyxLQUFLO0FBQ3ZCLFlBQU0sTUFBTTtBQUNaLFdBQUssV0FBVyxPQUFPO0FBQ3ZCLGNBQVEsT0FBTztBQUFBLElBQ2hCLE9BQU87QUFDTixjQUFRLGNBQWMsUUFBUSxLQUFLO0FBQUEsSUFDcEM7QUFFQSxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFFZCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsYUFBYSxRQUFrQixTQUFpQixLQUFLLFlBQTJCO0FBQy9FLFVBQU0sUUFBUSxPQUFPLElBQUksT0FBSyxFQUFFLFdBQVcsV0FBVyxNQUFNLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFFdkUsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBRWQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGVBQWUsTUFBYyxjQUE4RTtBQUUxRyxRQUFJLE9BQU8saUJBQWlCLFlBQVk7QUFDdkMsWUFBTSxTQUFTLElBQUksY0FBYztBQUNqQyxhQUFPLFdBQVcsS0FBSztBQUN2QixtQkFBYSxNQUFNO0FBQ25CLFdBQUssV0FBVyxPQUFPO0FBQ3ZCLHFCQUFlLE9BQU87QUFBQSxJQUV2QixXQUFXLE9BQU8saUJBQWlCLFVBQVU7QUFDNUMscUJBQWUsYUFBYSxRQUFRLFNBQVMsTUFBTTtBQUFBLElBQ3BEO0FBRUEsU0FBSyxTQUFTO0FBQ2QsU0FBSyxTQUFTO0FBQ2QsUUFBSSxjQUFjO0FBQ2pCLFdBQUssU0FBUztBQUNkLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFDQSxTQUFLLFNBQVM7QUFHZCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBNUZhLGdCQUFOO0FBQUEsRUFETjtBQUFBLEdBQ1k7IiwKICAibmFtZXMiOiBbXQp9Cg==
