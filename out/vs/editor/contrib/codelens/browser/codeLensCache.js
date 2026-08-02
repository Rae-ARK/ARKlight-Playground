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
import { Event } from "../../../../base/common/event.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Range } from "../../../common/core/range.js";
import { CodeLensModel } from "./codelens.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
const ICodeLensCache = createDecorator("ICodeLensCache");
class CacheItem {
  constructor(lineCount, data) {
    this.lineCount = lineCount;
    this.data = data;
  }
}
let CodeLensCache = class {
  constructor(storageService) {
    this._fakeProvider = new class {
      provideCodeLenses() {
        throw new Error("not supported");
      }
    }();
    this._cache = new LRUCache(20, 0.75);
    const oldkey = "codelens/cache";
    runWhenWindowIdle(mainWindow, () => storageService.remove(oldkey, StorageScope.WORKSPACE));
    const key = "codelens/cache2";
    const raw = storageService.get(key, StorageScope.WORKSPACE, "{}");
    this._deserialize(raw);
    const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, (e) => e.reason === WillSaveStateReason.SHUTDOWN);
    Event.once(onWillSaveStateBecauseOfShutdown)((e) => {
      storageService.store(key, this._serialize(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
  }
  put(model, data) {
    const copyItems = data.lenses.map((item2) => {
      return {
        range: item2.symbol.range,
        command: item2.symbol.command && { id: "", title: item2.symbol.command?.title }
      };
    });
    const copyModel = new CodeLensModel();
    copyModel.add({ lenses: copyItems }, this._fakeProvider);
    const item = new CacheItem(model.getLineCount(), copyModel);
    this._cache.set(model.uri.toString(), item);
  }
  get(model) {
    const item = this._cache.get(model.uri.toString());
    return item && item.lineCount === model.getLineCount() ? item.data : void 0;
  }
  delete(model) {
    this._cache.delete(model.uri.toString());
  }
  // --- persistence
  _serialize() {
    const data = /* @__PURE__ */ Object.create(null);
    for (const [key, value] of this._cache) {
      const lines = /* @__PURE__ */ new Set();
      for (const d of value.data.lenses) {
        lines.add(d.symbol.range.startLineNumber);
      }
      data[key] = {
        lineCount: value.lineCount,
        lines: [...lines.values()]
      };
    }
    return JSON.stringify(data);
  }
  _deserialize(raw) {
    try {
      const data = JSON.parse(raw);
      for (const key in data) {
        const element = data[key];
        const lenses = [];
        for (const line of element.lines) {
          lenses.push({ range: new Range(line, 1, line, 11) });
        }
        const model = new CodeLensModel();
        model.add({ lenses }, this._fakeProvider);
        this._cache.set(key, new CacheItem(element.lineCount, model));
      }
    } catch {
    }
  }
};
CodeLensCache = __decorateClass([
  __decorateParam(0, IStorageService)
], CodeLensCache);
registerSingleton(ICodeLensCache, CodeLensCache, InstantiationType.Delayed);
export {
  CodeLensCache,
  ICodeLensCache
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvZGVsZW5zL2Jyb3dzZXIvY29kZUxlbnNDYWNoZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvZGVMZW5zLCBDb2RlTGVuc0xpc3QsIENvZGVMZW5zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IENvZGVMZW5zTW9kZWwgfSBmcm9tICcuL2NvZGVsZW5zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCwgV2lsbFNhdmVTdGF0ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgcnVuV2hlbldpbmRvd0lkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuZXhwb3J0IGNvbnN0IElDb2RlTGVuc0NhY2hlID0gY3JlYXRlRGVjb3JhdG9yPElDb2RlTGVuc0NhY2hlPignSUNvZGVMZW5zQ2FjaGUnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29kZUxlbnNDYWNoZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHV0KG1vZGVsOiBJVGV4dE1vZGVsLCBkYXRhOiBDb2RlTGVuc01vZGVsKTogdm9pZDtcblx0Z2V0KG1vZGVsOiBJVGV4dE1vZGVsKTogQ29kZUxlbnNNb2RlbCB8IHVuZGVmaW5lZDtcblx0ZGVsZXRlKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkQ2FjaGVEYXRhIHtcblx0bGluZUNvdW50OiBudW1iZXI7XG5cdGxpbmVzOiBudW1iZXJbXTtcbn1cblxuY2xhc3MgQ2FjaGVJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBsaW5lQ291bnQ6IG51bWJlcixcblx0XHRyZWFkb25seSBkYXRhOiBDb2RlTGVuc01vZGVsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2RlTGVuc0NhY2hlIGltcGxlbWVudHMgSUNvZGVMZW5zQ2FjaGUge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zha2VQcm92aWRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIENvZGVMZW5zUHJvdmlkZXIge1xuXHRcdHByb3ZpZGVDb2RlTGVuc2VzKCk6IENvZGVMZW5zTGlzdCB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBzdXBwb3J0ZWQnKTtcblx0XHR9XG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBDYWNoZUl0ZW0+KDIwLCAwLjc1KTtcblxuXHRjb25zdHJ1Y3RvcihASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblxuXHRcdC8vIHJlbW92ZSBvbGQgZGF0YVxuXHRcdGNvbnN0IG9sZGtleSA9ICdjb2RlbGVucy9jYWNoZSc7XG5cdFx0cnVuV2hlbldpbmRvd0lkbGUobWFpbldpbmRvdywgKCkgPT4gc3RvcmFnZVNlcnZpY2UucmVtb3ZlKG9sZGtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkpO1xuXG5cdFx0Ly8gcmVzdG9yZSBsZW5zIGRhdGEgb24gc3RhcnRcblx0XHRjb25zdCBrZXkgPSAnY29kZWxlbnMvY2FjaGUyJztcblx0XHRjb25zdCByYXcgPSBzdG9yYWdlU2VydmljZS5nZXQoa2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAne30nKTtcblx0XHR0aGlzLl9kZXNlcmlhbGl6ZShyYXcpO1xuXG5cdFx0Ly8gc3RvcmUgbGVucyBkYXRhIG9uIHNodXRkb3duXG5cdFx0Y29uc3Qgb25XaWxsU2F2ZVN0YXRlQmVjYXVzZU9mU2h1dGRvd24gPSBFdmVudC5maWx0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlLCBlID0+IGUucmVhc29uID09PSBXaWxsU2F2ZVN0YXRlUmVhc29uLlNIVVRET1dOKTtcblx0XHRFdmVudC5vbmNlKG9uV2lsbFNhdmVTdGF0ZUJlY2F1c2VPZlNodXRkb3duKShlID0+IHtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGtleSwgdGhpcy5fc2VyaWFsaXplKCksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdXQobW9kZWw6IElUZXh0TW9kZWwsIGRhdGE6IENvZGVMZW5zTW9kZWwpOiB2b2lkIHtcblx0XHQvLyBjcmVhdGUgYSBjb3B5IG9mIHRoZSBtb2RlbCB0aGF0IGlzIHdpdGhvdXQgY29tbWFuZC1pZHNcblx0XHQvLyBidXQgd2l0aCBjb21hbmQtbGFiZWxzXG5cdFx0Y29uc3QgY29weUl0ZW1zID0gZGF0YS5sZW5zZXMubWFwKChpdGVtKTogQ29kZUxlbnMgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IGl0ZW0uc3ltYm9sLnJhbmdlLFxuXHRcdFx0XHRjb21tYW5kOiBpdGVtLnN5bWJvbC5jb21tYW5kICYmIHsgaWQ6ICcnLCB0aXRsZTogaXRlbS5zeW1ib2wuY29tbWFuZD8udGl0bGUgfSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgY29weU1vZGVsID0gbmV3IENvZGVMZW5zTW9kZWwoKTtcblx0XHRjb3B5TW9kZWwuYWRkKHsgbGVuc2VzOiBjb3B5SXRlbXMgfSwgdGhpcy5fZmFrZVByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBuZXcgQ2FjaGVJdGVtKG1vZGVsLmdldExpbmVDb3VudCgpLCBjb3B5TW9kZWwpO1xuXHRcdHRoaXMuX2NhY2hlLnNldChtb2RlbC51cmkudG9TdHJpbmcoKSwgaXRlbSk7XG5cdH1cblxuXHRnZXQobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KG1vZGVsLnVyaS50b1N0cmluZygpKTtcblx0XHRyZXR1cm4gaXRlbSAmJiBpdGVtLmxpbmVDb3VudCA9PT0gbW9kZWwuZ2V0TGluZUNvdW50KCkgPyBpdGVtLmRhdGEgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkZWxldGUobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUobW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Ly8gLS0tIHBlcnNpc3RlbmNlXG5cblx0cHJpdmF0ZSBfc2VyaWFsaXplKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGF0YTogUmVjb3JkPHN0cmluZywgSVNlcmlhbGl6ZWRDYWNoZURhdGE+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiB0aGlzLl9jYWNoZSkge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRcdGZvciAoY29uc3QgZCBvZiB2YWx1ZS5kYXRhLmxlbnNlcykge1xuXHRcdFx0XHRsaW5lcy5hZGQoZC5zeW1ib2wucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdGRhdGFba2V5XSA9IHtcblx0XHRcdFx0bGluZUNvdW50OiB2YWx1ZS5saW5lQ291bnQsXG5cdFx0XHRcdGxpbmVzOiBbLi4ubGluZXMudmFsdWVzKCldXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNlcmlhbGl6ZShyYXc6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBJU2VyaWFsaXplZENhY2hlRGF0YT4gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBkYXRhW2tleV07XG5cdFx0XHRcdGNvbnN0IGxlbnNlczogQ29kZUxlbnNbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgZWxlbWVudC5saW5lcykge1xuXHRcdFx0XHRcdGxlbnNlcy5wdXNoKHsgcmFuZ2U6IG5ldyBSYW5nZShsaW5lLCAxLCBsaW5lLCAxMSkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBDb2RlTGVuc01vZGVsKCk7XG5cdFx0XHRcdG1vZGVsLmFkZCh7IGxlbnNlcyB9LCB0aGlzLl9mYWtlUHJvdmlkZXIpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZS5zZXQoa2V5LCBuZXcgQ2FjaGVJdGVtKGVsZW1lbnQubGluZUNvdW50LCBtb2RlbCkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlLi4uXG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDb2RlTGVuc0NhY2hlLCBDb2RlTGVuc0NhY2hlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUd0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUIsY0FBYyxlQUFlLDJCQUEyQjtBQUNsRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUUzQixNQUFNLGlCQUFpQixnQkFBZ0MsZ0JBQWdCO0FBYzlFLE1BQU0sVUFBVTtBQUFBLEVBRWYsWUFDVSxXQUNBLE1BQ1I7QUFGUTtBQUNBO0FBQUEsRUFDTjtBQUNMO0FBRU8sSUFBTSxnQkFBTixNQUE4QztBQUFBLEVBWXBELFlBQTZCLGdCQUFpQztBQVI5RCxTQUFpQixn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
