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
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
let FindWidgetSearchHistory = class {
  constructor(storageService) {
    this.storageService = storageService;
    this.inMemoryValues = /* @__PURE__ */ new Set();
    this._onDidChangeEmitter = new Emitter();
    this.onDidChange = this._onDidChangeEmitter.event;
    this.load();
  }
  static getOrCreate(storageService) {
    if (!FindWidgetSearchHistory._instance) {
      FindWidgetSearchHistory._instance = new FindWidgetSearchHistory(storageService);
    }
    return FindWidgetSearchHistory._instance;
  }
  delete(t) {
    const result = this.inMemoryValues.delete(t);
    this.save();
    return result;
  }
  add(t) {
    this.inMemoryValues.add(t);
    this.save();
    return this;
  }
  has(t) {
    return this.inMemoryValues.has(t);
  }
  clear() {
    this.inMemoryValues.clear();
    this.save();
  }
  forEach(callbackfn, thisArg) {
    this.load();
    return this.inMemoryValues.forEach(callbackfn);
  }
  replace(t) {
    this.inMemoryValues = new Set(t);
    this.save();
  }
  load() {
    let result;
    const raw = this.storageService.get(
      FindWidgetSearchHistory.FIND_HISTORY_KEY,
      StorageScope.WORKSPACE
    );
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch (e) {
      }
    }
    this.inMemoryValues = new Set(result || []);
  }
  // Run saves async
  save() {
    const elements = [];
    this.inMemoryValues.forEach((e) => elements.push(e));
    return new Promise((resolve) => {
      this.storageService.store(
        FindWidgetSearchHistory.FIND_HISTORY_KEY,
        JSON.stringify(elements),
        StorageScope.WORKSPACE,
        StorageTarget.USER
      );
      this._onDidChangeEmitter.fire(elements);
      resolve();
    });
  }
};
FindWidgetSearchHistory.FIND_HISTORY_KEY = "workbench.find.history";
FindWidgetSearchHistory._instance = null;
FindWidgetSearchHistory = __decorateClass([
  __decorateParam(0, IStorageService)
], FindWidgetSearchHistory);
export {
  FindWidgetSearchHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSBpbXBsZW1lbnRzIElIaXN0b3J5PHN0cmluZz4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEZJTkRfSElTVE9SWV9LRVkgPSAnd29ya2JlbmNoLmZpbmQuaGlzdG9yeSc7XG5cdHByaXZhdGUgaW5NZW1vcnlWYWx1ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2U/OiBFdmVudDxzdHJpbmdbXT47XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlRW1pdHRlcjogRW1pdHRlcjxzdHJpbmdbXT47XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2luc3RhbmNlOiBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSB8IG51bGwgPSBudWxsO1xuXG5cdHN0YXRpYyBnZXRPckNyZWF0ZShcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpOiBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSB7XG5cdFx0aWYgKCFGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5faW5zdGFuY2UpIHtcblx0XHRcdEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5Ll9pbnN0YW5jZSA9IG5ldyBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeShzdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXHRcdHJldHVybiBGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5faW5zdGFuY2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8c3RyaW5nW10+KCk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlRW1pdHRlci5ldmVudDtcblx0XHR0aGlzLmxvYWQoKTtcblx0fVxuXG5cdGRlbGV0ZSh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmluTWVtb3J5VmFsdWVzLmRlbGV0ZSh0KTtcblx0XHR0aGlzLnNhdmUoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YWRkKHQ6IHN0cmluZyk6IHRoaXMge1xuXHRcdHRoaXMuaW5NZW1vcnlWYWx1ZXMuYWRkKHQpO1xuXHRcdHRoaXMuc2F2ZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aGFzKHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmluTWVtb3J5VmFsdWVzLmhhcyh0KTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5NZW1vcnlWYWx1ZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNhdmUoKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2tmbjogKHZhbHVlOiBzdHJpbmcsIHZhbHVlMjogc3RyaW5nLCBzZXQ6IFNldDxzdHJpbmc+KSA9PiB2b2lkLCB0aGlzQXJnPzogdW5rbm93bik6IHZvaWQge1xuXHRcdC8vIGZldGNoIGxhdGVzdCBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLmxvYWQoKTtcblx0XHRyZXR1cm4gdGhpcy5pbk1lbW9yeVZhbHVlcy5mb3JFYWNoKGNhbGxiYWNrZm4pO1xuXHR9XG5cdHJlcGxhY2U/KHQ6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5pbk1lbW9yeVZhbHVlcyA9IG5ldyBTZXQodCk7XG5cdFx0dGhpcy5zYXZlKCk7XG5cdH1cblxuXHRsb2FkKCkge1xuXHRcdGxldCByZXN1bHQ6IFtdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFxuXHRcdFx0RmluZFdpZGdldFNlYXJjaEhpc3RvcnkuRklORF9ISVNUT1JZX0tFWSxcblx0XHRcdFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0Vcblx0XHQpO1xuXG5cdFx0aWYgKHJhdykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzdWx0ID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyBJbnZhbGlkIGRhdGFcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmluTWVtb3J5VmFsdWVzID0gbmV3IFNldChyZXN1bHQgfHwgW10pO1xuXHR9XG5cblx0Ly8gUnVuIHNhdmVzIGFzeW5jXG5cdHNhdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWxlbWVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0dGhpcy5pbk1lbW9yeVZhbHVlcy5mb3JFYWNoKGUgPT4gZWxlbWVudHMucHVzaChlKSk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0RmluZFdpZGdldFNlYXJjaEhpc3RvcnkuRklORF9ISVNUT1JZX0tFWSxcblx0XHRcdFx0SlNPTi5zdHJpbmdpZnkoZWxlbWVudHMpLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0XHRTdG9yYWdlVGFyZ2V0LlVTRVIsXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoZWxlbWVudHMpO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFFdEQsSUFBTSwwQkFBTixNQUEwRDtBQUFBLEVBaUJoRSxZQUNtQyxnQkFDakM7QUFEaUM7QUFoQm5DLFNBQVEsaUJBQThCLG9CQUFJLElBQUk7QUFrQjdDLFNBQUssc0JBQXNCLElBQUksUUFBa0I7QUFDakQsU0FBSyxjQUFjLEtBQUssb0JBQW9CO0FBQzVDLFNBQUssS0FBSztBQUFBLEVBQ1g7QUFBQSxFQWZBLE9BQU8sWUFDTixnQkFDMEI7QUFDMUIsUUFBSSxDQUFDLHdCQUF3QixXQUFXO0FBQ3ZDLDhCQUF3QixZQUFZLElBQUksd0JBQXdCLGNBQWM7QUFBQSxJQUMvRTtBQUNBLFdBQU8sd0JBQXdCO0FBQUEsRUFDaEM7QUFBQSxFQVVBLE9BQU8sR0FBb0I7QUFDMUIsVUFBTSxTQUFTLEtBQUssZUFBZSxPQUFPLENBQUM7QUFDM0MsU0FBSyxLQUFLO0FBQ1YsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLElBQUksR0FBaUI7QUFDcEIsU0FBSyxlQUFlLElBQUksQ0FBQztBQUN6QixTQUFLLEtBQUs7QUFDVixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBSSxHQUFvQjtBQUN2QixXQUFPLEtBQUssZUFBZSxJQUFJLENBQUM7QUFBQSxFQUNqQztBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssZUFBZSxNQUFNO0FBQzFCLFNBQUssS0FBSztBQUFBLEVBQ1g7QUFBQSxFQUVBLFFBQVEsWUFBdUUsU0FBeUI7QUFFdkcsU0FBSyxLQUFLO0FBQ1YsV0FBTyxLQUFLLGVBQWUsUUFBUSxVQUFVO0FBQUEsRUFDOUM7QUFBQSxFQUNBLFFBQVMsR0FBbUI7QUFDM0IsU0FBSyxpQkFBaUIsSUFBSSxJQUFJLENBQUM7QUFDL0IsU0FBSyxLQUFLO0FBQUEsRUFDWDtBQUFBLEVBRUEsT0FBTztBQUNOLFFBQUk7QUFDSixVQUFNLE1BQU0sS0FBSyxlQUFlO0FBQUEsTUFDL0Isd0JBQXdCO0FBQUEsTUFDeEIsYUFBYTtBQUFBLElBQ2Q7QUFFQSxRQUFJLEtBQUs7QUFDUixVQUFJO0FBQ0gsaUJBQVMsS0FBSyxNQUFNLEdBQUc7QUFBQSxNQUN4QixTQUFTLEdBQUc7QUFBQSxNQUVaO0FBQUEsSUFDRDtBQUVBLFNBQUssaUJBQWlCLElBQUksSUFBSSxVQUFVLENBQUMsQ0FBQztBQUFBLEVBQzNDO0FBQUE7QUFBQSxFQUdBLE9BQXNCO0FBQ3JCLFVBQU0sV0FBcUIsQ0FBQztBQUM1QixTQUFLLGVBQWUsUUFBUSxPQUFLLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDakQsV0FBTyxJQUFJLFFBQWMsYUFBVztBQUNuQyxXQUFLLGVBQWU7QUFBQSxRQUNuQix3QkFBd0I7QUFBQSxRQUN4QixLQUFLLFVBQVUsUUFBUTtBQUFBLFFBQ3ZCLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxNQUNmO0FBQ0EsV0FBSyxvQkFBb0IsS0FBSyxRQUFRO0FBQ3RDLGNBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF6RmEsd0JBQ1csbUJBQW1CO0FBRDlCLHdCQU1HLFlBQTRDO0FBTi9DLDBCQUFOO0FBQUEsRUFrQko7QUFBQSxHQWxCVTsiLAogICJuYW1lcyI6IFtdCn0K
