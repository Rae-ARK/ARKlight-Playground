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
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Emitter } from "../../../../base/common/event.js";
import { splitGlobAware } from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
import { namespaceTestTag } from "./testTypes.js";
const ITestExplorerFilterState = createDecorator("testingFilterState");
const tagRe = /!?@([^ ,:]+)/g;
const trimExtraWhitespace = (str) => str.replace(/\s\s+/g, " ").trim();
let TestExplorerFilterState = class extends Disposable {
  constructor(storageService) {
    super();
    this.focusEmitter = this._register(new Emitter());
    /**
     * Mapping of terms to whether they're included in the text.
     */
    this.termFilterState = {};
    /** @inheritdoc */
    this.globList = [];
    /** @inheritdoc */
    this.includeTags = /* @__PURE__ */ new Set();
    /** @inheritdoc */
    this.excludeTags = /* @__PURE__ */ new Set();
    /** @inheritdoc */
    this.text = this._register(new MutableObservableValue(""));
    this.reveal = observableValue("TestExplorerFilterState.reveal", void 0);
    this.onDidRequestInputFocus = this.focusEmitter.event;
    this.selectTestInExplorerEmitter = this._register(new Emitter());
    this.onDidSelectTestInExplorer = this.selectTestInExplorerEmitter.event;
    this.fuzzy = this._register(MutableObservableValue.stored(new StoredValue({
      key: "testHistoryFuzzy",
      scope: StorageScope.PROFILE,
      target: StorageTarget.USER
    }, storageService), false));
  }
  /** @inheritdoc */
  didSelectTestInExplorer(testId) {
    this.selectTestInExplorerEmitter.fire(testId);
  }
  /** @inheritdoc */
  focusInput() {
    this.focusEmitter.fire();
  }
  /** @inheritdoc */
  setText(text) {
    if (text === this.text.value) {
      return;
    }
    this.termFilterState = {};
    this.globList = [];
    this.includeTags.clear();
    this.excludeTags.clear();
    let globText = "";
    let lastIndex = 0;
    for (const match of text.matchAll(tagRe)) {
      let nextIndex = match.index + match[0].length;
      const tag = match[0];
      const isFilterTerm = allTestFilterTerms.includes(tag);
      if (isFilterTerm) {
        this.termFilterState[tag] = true;
      }
      let isTag = false;
      if (text[nextIndex] === ":") {
        isTag = true;
        nextIndex++;
        let delimiter = text[nextIndex];
        if (delimiter !== `"` && delimiter !== `'`) {
          delimiter = " ";
        } else {
          nextIndex++;
        }
        let tagId = "";
        while (nextIndex < text.length && text[nextIndex] !== delimiter) {
          if (text[nextIndex] === "\\") {
            tagId += text[nextIndex + 1];
            nextIndex += 2;
          } else {
            tagId += text[nextIndex];
            nextIndex++;
          }
        }
        if (match[0].startsWith("!")) {
          this.excludeTags.add(namespaceTestTag(match[1], tagId));
        } else {
          this.includeTags.add(namespaceTestTag(match[1], tagId));
        }
        nextIndex++;
      }
      if (!isFilterTerm && !isTag) {
        continue;
      }
      globText += text.slice(lastIndex, match.index);
      lastIndex = nextIndex;
    }
    globText += text.slice(lastIndex).trim();
    if (globText.length) {
      for (const filter of splitGlobAware(globText, ",").map((s) => s.trim()).filter((s) => !!s.length)) {
        if (filter.startsWith("!")) {
          this.globList.push({ include: false, text: filter.slice(1).toLowerCase() });
        } else {
          this.globList.push({ include: true, text: filter.toLowerCase() });
        }
      }
    }
    this.text.value = text;
  }
  /** @inheritdoc */
  isFilteringFor(term) {
    return !!this.termFilterState[term];
  }
  /** @inheritdoc */
  toggleFilteringFor(term, shouldFilter) {
    const text = this.text.value.trim();
    if (shouldFilter !== false && !this.termFilterState[term]) {
      this.setText(text ? `${text} ${term}` : term);
    } else if (shouldFilter !== true && this.termFilterState[term]) {
      this.setText(trimExtraWhitespace(text.replace(term, "")));
    }
  }
};
TestExplorerFilterState = __decorateClass([
  __decorateParam(0, IStorageService)
], TestExplorerFilterState);
var TestFilterTerm = /* @__PURE__ */ ((TestFilterTerm2) => {
  TestFilterTerm2["Failed"] = "@failed";
  TestFilterTerm2["Executed"] = "@executed";
  TestFilterTerm2["CurrentDoc"] = "@doc";
  TestFilterTerm2["OpenedFiles"] = "@openedFiles";
  TestFilterTerm2["Hidden"] = "@hidden";
  return TestFilterTerm2;
})(TestFilterTerm || {});
const allTestFilterTerms = [
  "@failed" /* Failed */,
  "@executed" /* Executed */,
  "@doc" /* CurrentDoc */,
  "@openedFiles" /* OpenedFiles */,
  "@hidden" /* Hidden */
];
export {
  ITestExplorerFilterState,
  TestExplorerFilterState,
  TestFilterTerm
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RFeHBsb3JlckZpbHRlclN0YXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgc3BsaXRHbG9iQXdhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZVZhbHVlLCBNdXRhYmxlT2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi9vYnNlcnZhYmxlVmFsdWUuanMnO1xuaW1wb3J0IHsgU3RvcmVkVmFsdWUgfSBmcm9tICcuL3N0b3JlZFZhbHVlLmpzJztcbmltcG9ydCB7IG5hbWVzcGFjZVRlc3RUYWcgfSBmcm9tICcuL3Rlc3RUeXBlcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKiBDdXJyZW50IGZpbHRlciB0ZXh0ICovXG5cdHJlYWRvbmx5IHRleHQ6IElPYnNlcnZhYmxlVmFsdWU8c3RyaW5nPjtcblxuXHQvKiogVGVzdCBJRCB0aGUgdXNlciB3YW50cyB0byByZXZlYWwgaW4gdGhlIGV4cGxvcmVyICovXG5cdHJlYWRvbmx5IHJldmVhbDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBBIHRlc3Qgd2FzIHNlbGVjdGVkIGluIHRoZSBleHBsb3Jlci4gKi9cblx0cmVhZG9ubHkgb25EaWRTZWxlY3RUZXN0SW5FeHBsb3JlcjogRXZlbnQ8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHQvKiogRXZlbnQgdGhhdCBmaXJlcyB3aGVuIHtAbGluayBmb2N1c0lucHV0fSBpcyBpbnZva2VkLiAqL1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RJbnB1dEZvY3VzOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogR2xvYiBsaXN0IHRvIGZpbHRlciBmb3IgYmFzZWQgb24gdGhlIHtAbGluayB0ZXh0fVxuXHQgKi9cblx0cmVhZG9ubHkgZ2xvYkxpc3Q6IHJlYWRvbmx5IHsgaW5jbHVkZTogYm9vbGVhbjsgdGV4dDogc3RyaW5nIH1bXTtcblxuXHQvKipcblx0ICogVGhlIHVzZXIgcmVxdWVzdGVkIHRvIGZpbHRlciBpbmNsdWRpbmcgdGFncy5cblx0ICovXG5cdHJlYWRvbmx5IGluY2x1ZGVUYWdzOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXG5cdC8qKlxuXHQgKiBUaGUgdXNlciByZXF1ZXN0ZWQgdG8gZmlsdGVyIGV4Y2x1ZGluZyB0YWdzLlxuXHQgKi9cblx0cmVhZG9ubHkgZXhjbHVkZVRhZ3M6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgZnV6enkgc2VhcmNoaW5nIGlzIGVuYWJsZWQuXG5cdCAqL1xuXHRyZWFkb25seSBmdXp6eTogTXV0YWJsZU9ic2VydmFibGVWYWx1ZTxib29sZWFuPjtcblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgZmlsdGVyIGlucHV0IGluIHRoZSB0ZXN0IGV4cGxvcmVyIHZpZXcuXG5cdCAqL1xuXHRmb2N1c0lucHV0KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlcGxhY2VzIHRoZSBmaWx0ZXIge0BsaW5rIHRleHR9LlxuXHQgKi9cblx0c2V0VGV4dCh0ZXh0OiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgdGhlIHtAbGluayB0ZXh0fSBpcyBmaWx0ZXJpbmcgZm9yIGEgc3BlY2lhbCB0ZXJtLlxuXHQgKi9cblx0aXNGaWx0ZXJpbmdGb3IodGVybTogVGVzdEZpbHRlclRlcm0pOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgdGhlIHtAbGluayB0ZXh0fSBpbmNsdWRlcyBhIHNwZWNpYWwgZmlsdGVyIHRlcm0uXG5cdCAqL1xuXHR0b2dnbGVGaWx0ZXJpbmdGb3IodGVybTogVGVzdEZpbHRlclRlcm0sIHNob3VsZEZpbHRlcj86IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhIHRlc3QgaW4gdGhlIHRlc3QgZXhwbG9yZXIgaXMgc2VsZWN0ZWQuXG5cdCAqL1xuXHRkaWRTZWxlY3RUZXN0SW5FeHBsb3Jlcih0ZXN0SWQ6IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUgPSBjcmVhdGVEZWNvcmF0b3I8SVRlc3RFeHBsb3JlckZpbHRlclN0YXRlPigndGVzdGluZ0ZpbHRlclN0YXRlJyk7XG5cbmNvbnN0IHRhZ1JlID0gLyE/QChbXiAsOl0rKS9nO1xuY29uc3QgdHJpbUV4dHJhV2hpdGVzcGFjZSA9IChzdHI6IHN0cmluZykgPT4gc3RyLnJlcGxhY2UoL1xcc1xccysvZywgJyAnKS50cmltKCk7XG5cbmV4cG9ydCBjbGFzcyBUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0LyoqXG5cdCAqIE1hcHBpbmcgb2YgdGVybXMgdG8gd2hldGhlciB0aGV5J3JlIGluY2x1ZGVkIGluIHRoZSB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSB0ZXJtRmlsdGVyU3RhdGU6IHsgW0sgaW4gVGVzdEZpbHRlclRlcm1dPzogdHJ1ZSB9ID0ge307XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBnbG9iTGlzdDogeyBpbmNsdWRlOiBib29sZWFuOyB0ZXh0OiBzdHJpbmcgfVtdID0gW107XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBpbmNsdWRlVGFncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZXhjbHVkZVRhZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlYWRvbmx5IHRleHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZU9ic2VydmFibGVWYWx1ZSgnJykpO1xuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZnV6enk6IE11dGFibGVPYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj47XG5cblx0cHVibGljIHJlYWRvbmx5IHJldmVhbDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gb2JzZXJ2YWJsZVZhbHVlKCdUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS5yZXZlYWwnLCB1bmRlZmluZWQpO1xuXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFJlcXVlc3RJbnB1dEZvY3VzID0gdGhpcy5mb2N1c0VtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBzZWxlY3RUZXN0SW5FeHBsb3JlckVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRTZWxlY3RUZXN0SW5FeHBsb3JlciA9IHRoaXMuc2VsZWN0VGVzdEluRXhwbG9yZXJFbWl0dGVyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmZ1enp5ID0gdGhpcy5fcmVnaXN0ZXIoTXV0YWJsZU9ic2VydmFibGVWYWx1ZS5zdG9yZWQobmV3IFN0b3JlZFZhbHVlPGJvb2xlYW4+KHtcblx0XHRcdGtleTogJ3Rlc3RIaXN0b3J5RnV6enknLFxuXHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5QUk9GSUxFLFxuXHRcdFx0dGFyZ2V0OiBTdG9yYWdlVGFyZ2V0LlVTRVIsXG5cdFx0fSwgc3RvcmFnZVNlcnZpY2UpLCBmYWxzZSkpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBkaWRTZWxlY3RUZXN0SW5FeHBsb3Jlcih0ZXN0SWQ6IHN0cmluZykge1xuXHRcdHRoaXMuc2VsZWN0VGVzdEluRXhwbG9yZXJFbWl0dGVyLmZpcmUodGVzdElkKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgZm9jdXNJbnB1dCgpIHtcblx0XHR0aGlzLmZvY3VzRW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHNldFRleHQodGV4dDogc3RyaW5nKSB7XG5cdFx0aWYgKHRleHQgPT09IHRoaXMudGV4dC52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudGVybUZpbHRlclN0YXRlID0ge307XG5cdFx0dGhpcy5nbG9iTGlzdCA9IFtdO1xuXHRcdHRoaXMuaW5jbHVkZVRhZ3MuY2xlYXIoKTtcblx0XHR0aGlzLmV4Y2x1ZGVUYWdzLmNsZWFyKCk7XG5cblx0XHRsZXQgZ2xvYlRleHQgPSAnJztcblx0XHRsZXQgbGFzdEluZGV4ID0gMDtcblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIHRleHQubWF0Y2hBbGwodGFnUmUpKSB7XG5cdFx0XHRsZXQgbmV4dEluZGV4ID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG5cblx0XHRcdGNvbnN0IHRhZyA9IG1hdGNoWzBdO1xuXHRcdFx0Y29uc3QgaXNGaWx0ZXJUZXJtID0gYWxsVGVzdEZpbHRlclRlcm1zLmluY2x1ZGVzKHRhZyBhcyBUZXN0RmlsdGVyVGVybSk7XG5cdFx0XHRpZiAoaXNGaWx0ZXJUZXJtKSB7XG5cdFx0XHRcdHRoaXMudGVybUZpbHRlclN0YXRlW3RhZyBhcyBUZXN0RmlsdGVyVGVybV0gPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyByZWNvZ25pemUgYW5kIHBhcnNlIEBjdHJsSWQ6dGFnSWQgb3IgcXVvdGVkIGxpa2UgQGN0cmxJZDpcInRhZyBcXFxcXCJpZFwiXG5cdFx0XHRsZXQgaXNUYWcgPSBmYWxzZTtcblx0XHRcdGlmICh0ZXh0W25leHRJbmRleF0gPT09ICc6Jykge1xuXHRcdFx0XHRpc1RhZyA9IHRydWU7XG5cdFx0XHRcdG5leHRJbmRleCsrO1xuXG5cdFx0XHRcdGxldCBkZWxpbWl0ZXIgPSB0ZXh0W25leHRJbmRleF07XG5cdFx0XHRcdGlmIChkZWxpbWl0ZXIgIT09IGBcImAgJiYgZGVsaW1pdGVyICE9PSBgJ2ApIHtcblx0XHRcdFx0XHRkZWxpbWl0ZXIgPSAnICc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV4dEluZGV4Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgdGFnSWQgPSAnJztcblx0XHRcdFx0d2hpbGUgKG5leHRJbmRleCA8IHRleHQubGVuZ3RoICYmIHRleHRbbmV4dEluZGV4XSAhPT0gZGVsaW1pdGVyKSB7XG5cdFx0XHRcdFx0aWYgKHRleHRbbmV4dEluZGV4XSA9PT0gJ1xcXFwnKSB7XG5cdFx0XHRcdFx0XHR0YWdJZCArPSB0ZXh0W25leHRJbmRleCArIDFdO1xuXHRcdFx0XHRcdFx0bmV4dEluZGV4ICs9IDI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRhZ0lkICs9IHRleHRbbmV4dEluZGV4XTtcblx0XHRcdFx0XHRcdG5leHRJbmRleCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaFswXS5zdGFydHNXaXRoKCchJykpIHtcblx0XHRcdFx0XHR0aGlzLmV4Y2x1ZGVUYWdzLmFkZChuYW1lc3BhY2VUZXN0VGFnKG1hdGNoWzFdLCB0YWdJZCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuaW5jbHVkZVRhZ3MuYWRkKG5hbWVzcGFjZVRlc3RUYWcobWF0Y2hbMV0sIHRhZ0lkKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV4dEluZGV4Kys7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBALXByZWZpeGVkIHRleHQgaXMgbm90IGEga25vd24gZmlsdGVyIHRlcm0gb3IgdGFnLFxuXHRcdFx0Ly8gdHJlYXQgaXQgYXMgcmVndWxhciBmaWx0ZXIgdGV4dCAoZS5nLiwgYSB0ZXN0IG5hbWVkIFwiQHNtb2tlXCIpXG5cdFx0XHRpZiAoIWlzRmlsdGVyVGVybSAmJiAhaXNUYWcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGdsb2JUZXh0ICs9IHRleHQuc2xpY2UobGFzdEluZGV4LCBtYXRjaC5pbmRleCk7XG5cdFx0XHRsYXN0SW5kZXggPSBuZXh0SW5kZXg7XG5cdFx0fVxuXG5cdFx0Z2xvYlRleHQgKz0gdGV4dC5zbGljZShsYXN0SW5kZXgpLnRyaW0oKTtcblxuXHRcdGlmIChnbG9iVGV4dC5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3QgZmlsdGVyIG9mIHNwbGl0R2xvYkF3YXJlKGdsb2JUZXh0LCAnLCcpLm1hcChzID0+IHMudHJpbSgpKS5maWx0ZXIocyA9PiAhIXMubGVuZ3RoKSkge1xuXHRcdFx0XHRpZiAoZmlsdGVyLnN0YXJ0c1dpdGgoJyEnKSkge1xuXHRcdFx0XHRcdHRoaXMuZ2xvYkxpc3QucHVzaCh7IGluY2x1ZGU6IGZhbHNlLCB0ZXh0OiBmaWx0ZXIuc2xpY2UoMSkudG9Mb3dlckNhc2UoKSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmdsb2JMaXN0LnB1c2goeyBpbmNsdWRlOiB0cnVlLCB0ZXh0OiBmaWx0ZXIudG9Mb3dlckNhc2UoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudGV4dC52YWx1ZSA9IHRleHQ7IC8vIHB1cnBvc2VseSBhZnRlcndhcmRzIHNvIGV2ZXJ5dGhpbmcgaXMgdXBkYXRlZCB3aGVuIHRoZSBjaGFuZ2UgZXZlbnQgaGFwcGVuXG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGlzRmlsdGVyaW5nRm9yKHRlcm06IFRlc3RGaWx0ZXJUZXJtKSB7XG5cdFx0cmV0dXJuICEhdGhpcy50ZXJtRmlsdGVyU3RhdGVbdGVybV07XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHRvZ2dsZUZpbHRlcmluZ0Zvcih0ZXJtOiBUZXN0RmlsdGVyVGVybSwgc2hvdWxkRmlsdGVyPzogYm9vbGVhbikge1xuXHRcdGNvbnN0IHRleHQgPSB0aGlzLnRleHQudmFsdWUudHJpbSgpO1xuXHRcdGlmIChzaG91bGRGaWx0ZXIgIT09IGZhbHNlICYmICF0aGlzLnRlcm1GaWx0ZXJTdGF0ZVt0ZXJtXSkge1xuXHRcdFx0dGhpcy5zZXRUZXh0KHRleHQgPyBgJHt0ZXh0fSAke3Rlcm19YCA6IHRlcm0pO1xuXHRcdH0gZWxzZSBpZiAoc2hvdWxkRmlsdGVyICE9PSB0cnVlICYmIHRoaXMudGVybUZpbHRlclN0YXRlW3Rlcm1dKSB7XG5cdFx0XHR0aGlzLnNldFRleHQodHJpbUV4dHJhV2hpdGVzcGFjZSh0ZXh0LnJlcGxhY2UodGVybSwgJycpKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RGaWx0ZXJUZXJtIHtcblx0RmFpbGVkID0gJ0BmYWlsZWQnLFxuXHRFeGVjdXRlZCA9ICdAZXhlY3V0ZWQnLFxuXHRDdXJyZW50RG9jID0gJ0Bkb2MnLFxuXHRPcGVuZWRGaWxlcyA9ICdAb3BlbmVkRmlsZXMnLFxuXHRIaWRkZW4gPSAnQGhpZGRlbicsXG59XG5cbmNvbnN0IGFsbFRlc3RGaWx0ZXJUZXJtczogcmVhZG9ubHkgVGVzdEZpbHRlclRlcm1bXSA9IFtcblx0VGVzdEZpbHRlclRlcm0uRmFpbGVkLFxuXHRUZXN0RmlsdGVyVGVybS5FeGVjdXRlZCxcblx0VGVzdEZpbHRlclRlcm0uQ3VycmVudERvYyxcblx0VGVzdEZpbHRlclRlcm0uT3BlbmVkRmlsZXMsXG5cdFRlc3RGaWx0ZXJUZXJtLkhpZGRlbixcbl07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsZUFBc0I7QUFD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LE9BQU87QUFDTixlQUFLLFlBQVksSUFBSSxpQkFBaUIsTUFBTSxDQUFDLEdBQUcsS0FBSyxDQUFDO0FBQUEsUUFDdkQ7QUFDQTtBQUFBLE1BQ0Q7QUFJQSxVQUFJLENBQUMsZ0JBQWdCLENBQUMsT0FBTztBQUM1QjtBQUFBLE1BQ0Q7QUFFQSxrQkFBWSxLQUFLLE1BQU0sV0FBVyxNQUFNLEtBQUs7QUFDN0Msa0JBQVk7QUFBQSxJQUNiO0FBRUEsZ0JBQVksS0FBSyxNQUFNLFNBQVMsRUFBRSxLQUFLO0FBRXZDLFFBQUksU0FBUyxRQUFRO0FBQ3BCLGlCQUFXLFVBQVUsZUFBZSxVQUFVLEdBQUcsRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLENBQUMsRUFBRSxPQUFPLE9BQUssQ0FBQyxDQUFDLEVBQUUsTUFBTSxHQUFHO0FBQzlGLFlBQUksT0FBTyxXQUFXLEdBQUcsR0FBRztBQUMzQixlQUFLLFNBQVMsS0FBSyxFQUFFLFNBQVMsT0FBTyxNQUFNLE9BQU8sTUFBTSxDQUFDLEVBQUUsWUFBWSxFQUFFLENBQUM7QUFBQSxRQUMzRSxPQUFPO0FBQ04sZUFBSyxTQUFTLEtBQUssRUFBRSxTQUFTLE1BQU0sTUFBTSxPQUFPLFlBQVksRUFBRSxDQUFDO0FBQUEsUUFDakU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssS0FBSyxRQUFRO0FBQUEsRUFDbkI7QUFBQTtBQUFBLEVBR08sZUFBZSxNQUFzQjtBQUMzQyxXQUFPLENBQUMsQ0FBQyxLQUFLLGdCQUFnQixJQUFJO0FBQUEsRUFDbkM7QUFBQTtBQUFBLEVBR08sbUJBQW1CLE1BQXNCLGNBQXdCO0FBQ3ZFLFVBQU0sT0FBTyxLQUFLLEtBQUssTUFBTSxLQUFLO0FBQ2xDLFFBQUksaUJBQWlCLFNBQVMsQ0FBQyxLQUFLLGdCQUFnQixJQUFJLEdBQUc7QUFDMUQsV0FBSyxRQUFRLE9BQU8sR0FBRyxJQUFJLElBQUksSUFBSSxLQUFLLElBQUk7QUFBQSxJQUM3QyxXQUFXLGlCQUFpQixRQUFRLEtBQUssZ0JBQWdCLElBQUksR0FBRztBQUMvRCxXQUFLLFFBQVEsb0JBQW9CLEtBQUssUUFBUSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBQ0Q7QUFoSmEsMEJBQU47QUFBQSxFQStCSjtBQUFBLEdBL0JVO0FBa0pOLElBQVcsaUJBQVgsa0JBQVdBLG9CQUFYO0FBQ04sRUFBQUEsZ0JBQUEsWUFBUztBQUNULEVBQUFBLGdCQUFBLGNBQVc7QUFDWCxFQUFBQSxnQkFBQSxnQkFBYTtBQUNiLEVBQUFBLGdCQUFBLGlCQUFjO0FBQ2QsRUFBQUEsZ0JBQUEsWUFBUztBQUxRLFNBQUFBO0FBQUEsR0FBQTtBQVFsQixNQUFNLHFCQUFnRDtBQUFBLEVBQ3JEO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEOyIsCiAgIm5hbWVzIjogWyJUZXN0RmlsdGVyVGVybSJdCn0K
