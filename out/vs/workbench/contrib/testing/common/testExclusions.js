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
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { MutableObservableValue } from "./observableValue.js";
import { StoredValue } from "./storedValue.js";
let TestExclusions = class extends Disposable {
  constructor(storageService) {
    super();
    this.storageService = storageService;
    this.excluded = this._register(
      MutableObservableValue.stored(new StoredValue({
        key: "excludedTestItems",
        scope: StorageScope.WORKSPACE,
        target: StorageTarget.MACHINE,
        serialization: {
          deserialize: (v) => new Set(JSON.parse(v)),
          serialize: (v) => JSON.stringify([...v])
        }
      }, this.storageService), /* @__PURE__ */ new Set())
    );
    this.onTestExclusionsChanged = this.excluded.onDidChange;
  }
  /**
   * Gets whether there's any excluded tests.
   */
  get hasAny() {
    return this.excluded.value.size > 0;
  }
  /**
   * Gets all excluded tests.
   */
  get all() {
    return this.excluded.value;
  }
  /**
   * Sets whether a test is excluded.
   */
  toggle(test, exclude) {
    if (exclude !== true && this.excluded.value.has(test.item.extId)) {
      this.excluded.value = new Set(Iterable.filter(this.excluded.value, (e) => e !== test.item.extId));
    } else if (exclude !== false && !this.excluded.value.has(test.item.extId)) {
      this.excluded.value = /* @__PURE__ */ new Set([...this.excluded.value, test.item.extId]);
    }
  }
  /**
   * Gets whether a test is excluded.
   */
  contains(test) {
    return this.excluded.value.has(test.item.extId);
  }
  /**
   * Removes all test exclusions.
   */
  clear() {
    this.excluded.value = /* @__PURE__ */ new Set();
  }
};
TestExclusions = __decorateClass([
  __decorateParam(0, IStorageService)
], TestExclusions);
export {
  TestExclusions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RFeGNsdXNpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IE11dGFibGVPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuL29ic2VydmFibGVWYWx1ZS5qcyc7XG5pbXBvcnQgeyBTdG9yZWRWYWx1ZSB9IGZyb20gJy4vc3RvcmVkVmFsdWUuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxUZXN0SXRlbSB9IGZyb20gJy4vdGVzdFR5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlc3RFeGNsdXNpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXhjbHVkZWQ6IE11dGFibGVPYnNlcnZhYmxlVmFsdWU8UmVhZG9ubHlTZXQ8c3RyaW5nPj47XG5cblx0Y29uc3RydWN0b3IoQElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZXhjbHVkZWQgPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdE11dGFibGVPYnNlcnZhYmxlVmFsdWUuc3RvcmVkKG5ldyBTdG9yZWRWYWx1ZTxSZWFkb25seVNldDxzdHJpbmc+Pih7XG5cdFx0XHRcdGtleTogJ2V4Y2x1ZGVkVGVzdEl0ZW1zJyxcblx0XHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdHRhcmdldDogU3RvcmFnZVRhcmdldC5NQUNISU5FLFxuXHRcdFx0XHRzZXJpYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzZXJpYWxpemU6IHYgPT4gbmV3IFNldChKU09OLnBhcnNlKHYpKSxcblx0XHRcdFx0XHRzZXJpYWxpemU6IHYgPT4gSlNPTi5zdHJpbmdpZnkoWy4uLnZdKVxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdGhpcy5zdG9yYWdlU2VydmljZSksIG5ldyBTZXQoKSlcblx0XHQpO1xuXHRcdHRoaXMub25UZXN0RXhjbHVzaW9uc0NoYW5nZWQgPSB0aGlzLmV4Y2x1ZGVkLm9uRGlkQ2hhbmdlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2ZW50IHRoYXQgZmlyZXMgd2hlbiB0aGUgZXhjbHVkZWQgdGVzdHMgY2hhbmdlLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IG9uVGVzdEV4Y2x1c2lvbnNDaGFuZ2VkOiBFdmVudDx1bmtub3duPjtcblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIHRoZXJlJ3MgYW55IGV4Y2x1ZGVkIHRlc3RzLlxuXHQgKi9cblx0cHVibGljIGdldCBoYXNBbnkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjbHVkZWQudmFsdWUuc2l6ZSA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbGwgZXhjbHVkZWQgdGVzdHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGFsbCgpOiBJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5leGNsdWRlZC52YWx1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgYSB0ZXN0IGlzIGV4Y2x1ZGVkLlxuXHQgKi9cblx0cHVibGljIHRvZ2dsZSh0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtLCBleGNsdWRlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChleGNsdWRlICE9PSB0cnVlICYmIHRoaXMuZXhjbHVkZWQudmFsdWUuaGFzKHRlc3QuaXRlbS5leHRJZCkpIHtcblx0XHRcdHRoaXMuZXhjbHVkZWQudmFsdWUgPSBuZXcgU2V0KEl0ZXJhYmxlLmZpbHRlcih0aGlzLmV4Y2x1ZGVkLnZhbHVlLCBlID0+IGUgIT09IHRlc3QuaXRlbS5leHRJZCkpO1xuXHRcdH0gZWxzZSBpZiAoZXhjbHVkZSAhPT0gZmFsc2UgJiYgIXRoaXMuZXhjbHVkZWQudmFsdWUuaGFzKHRlc3QuaXRlbS5leHRJZCkpIHtcblx0XHRcdHRoaXMuZXhjbHVkZWQudmFsdWUgPSBuZXcgU2V0KFsuLi50aGlzLmV4Y2x1ZGVkLnZhbHVlLCB0ZXN0Lml0ZW0uZXh0SWRdKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIGEgdGVzdCBpcyBleGNsdWRlZC5cblx0ICovXG5cdHB1YmxpYyBjb250YWlucyh0ZXN0OiBJbnRlcm5hbFRlc3RJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZXhjbHVkZWQudmFsdWUuaGFzKHRlc3QuaXRlbS5leHRJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhbGwgdGVzdCBleGNsdXNpb25zLlxuXHQgKi9cblx0cHVibGljIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZXhjbHVkZWQudmFsdWUgPSBuZXcgU2V0KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQkFBbUI7QUFHckIsSUFBTSxpQkFBTixjQUE2QixXQUFXO0FBQUEsRUFHOUMsWUFBOEMsZ0JBQWlDO0FBQzlFLFVBQU07QUFEdUM7QUFFN0MsU0FBSyxXQUFXLEtBQUs7QUFBQSxNQUNwQix1QkFBdUIsT0FBTyxJQUFJLFlBQWlDO0FBQUEsUUFDbEUsS0FBSztBQUFBLFFBQ0wsT0FBTyxhQUFhO0FBQUEsUUFDcEIsUUFBUSxjQUFjO0FBQUEsUUFDdEIsZUFBZTtBQUFBLFVBQ2QsYUFBYSxPQUFLLElBQUksSUFBSSxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsVUFDdkMsV0FBVyxPQUFLLEtBQUssVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDdEM7QUFBQSxNQUNELEdBQUcsS0FBSyxjQUFjLEdBQUcsb0JBQUksSUFBSSxDQUFDO0FBQUEsSUFDbkM7QUFDQSxTQUFLLDBCQUEwQixLQUFLLFNBQVM7QUFBQSxFQUM5QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsSUFBVyxTQUFTO0FBQ25CLFdBQU8sS0FBSyxTQUFTLE1BQU0sT0FBTztBQUFBLEVBQ25DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLE1BQXdCO0FBQ2xDLFdBQU8sS0FBSyxTQUFTO0FBQUEsRUFDdEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLE9BQU8sTUFBd0IsU0FBeUI7QUFDOUQsUUFBSSxZQUFZLFFBQVEsS0FBSyxTQUFTLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSyxHQUFHO0FBQ2pFLFdBQUssU0FBUyxRQUFRLElBQUksSUFBSSxTQUFTLE9BQU8sS0FBSyxTQUFTLE9BQU8sT0FBSyxNQUFNLEtBQUssS0FBSyxLQUFLLENBQUM7QUFBQSxJQUMvRixXQUFXLFlBQVksU0FBUyxDQUFDLEtBQUssU0FBUyxNQUFNLElBQUksS0FBSyxLQUFLLEtBQUssR0FBRztBQUMxRSxXQUFLLFNBQVMsUUFBUSxvQkFBSSxJQUFJLENBQUMsR0FBRyxLQUFLLFNBQVMsT0FBTyxLQUFLLEtBQUssS0FBSyxDQUFDO0FBQUEsSUFDeEU7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxTQUFTLE1BQWlDO0FBQ2hELFdBQU8sS0FBSyxTQUFTLE1BQU0sSUFBSSxLQUFLLEtBQUssS0FBSztBQUFBLEVBQy9DO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxRQUFjO0FBQ3BCLFNBQUssU0FBUyxRQUFRLG9CQUFJLElBQUk7QUFBQSxFQUMvQjtBQUNEO0FBOURhLGlCQUFOO0FBQUEsRUFHTztBQUFBLEdBSEQ7IiwKICAibmFtZXMiOiBbXQp9Cg==
