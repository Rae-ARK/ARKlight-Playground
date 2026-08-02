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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isUndefined, isUndefinedOrNull } from "../../../base/common/types.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
var SaveStrategy = /* @__PURE__ */ ((SaveStrategy2) => {
  SaveStrategy2[SaveStrategy2["IMMEDIATE"] = 0] = "IMMEDIATE";
  SaveStrategy2[SaveStrategy2["DELAYED"] = 1] = "DELAYED";
  return SaveStrategy2;
})(SaveStrategy || {});
class FileStorage extends Disposable {
  constructor(storagePath, saveStrategy, logService, fileService) {
    super();
    this.storagePath = storagePath;
    this.logService = logService;
    this.fileService = fileService;
    this.storage = /* @__PURE__ */ Object.create(null);
    this.lastSavedStorageContents = "";
    this.initializing = void 0;
    this.closing = void 0;
    this.flushDelayer = this._register(new ThrottledDelayer(
      saveStrategy === 0 /* IMMEDIATE */ ? 0 : 100
      /* buffer saves over a short time */
    ));
  }
  init() {
    if (!this.initializing) {
      this.initializing = this.doInit();
    }
    return this.initializing;
  }
  async doInit() {
    try {
      this.lastSavedStorageContents = (await this.fileService.readFile(this.storagePath)).value.toString();
      this.storage = JSON.parse(this.lastSavedStorageContents);
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
    }
  }
  getItem(key, defaultValue) {
    const res = this.storage[key];
    if (isUndefinedOrNull(res)) {
      return defaultValue;
    }
    return res;
  }
  setItem(key, data) {
    this.setItems([{ key, data }]);
  }
  setItems(items) {
    let save = false;
    for (const { key, data } of items) {
      if (this.storage[key] === data) {
        continue;
      }
      if (isUndefinedOrNull(data)) {
        if (!isUndefined(this.storage[key])) {
          this.storage[key] = void 0;
          save = true;
        }
      } else {
        this.storage[key] = data;
        save = true;
      }
    }
    if (save) {
      this.save();
    }
  }
  removeItem(key) {
    if (!isUndefined(this.storage[key])) {
      this.storage[key] = void 0;
      this.save();
    }
  }
  async save() {
    if (this.closing) {
      return;
    }
    return this.flushDelayer.trigger(() => this.doSave());
  }
  async doSave() {
    if (!this.initializing) {
      return;
    }
    await this.initializing;
    const serializedDatabase = JSON.stringify(this.storage, null, 4);
    if (serializedDatabase === this.lastSavedStorageContents) {
      return;
    }
    try {
      await this.fileService.writeFile(this.storagePath, VSBuffer.fromString(serializedDatabase), { atomic: { postfix: ".vsctmp" } });
      this.lastSavedStorageContents = serializedDatabase;
    } catch (error) {
      this.logService.error(error);
    }
  }
  async close() {
    if (!this.closing) {
      this.closing = this.flushDelayer.trigger(
        () => this.doSave(),
        0
        /* as soon as possible */
      );
    }
    return this.closing;
  }
}
let StateReadonlyService = class extends Disposable {
  constructor(saveStrategy, environmentService, logService, fileService) {
    super();
    this.fileStorage = this._register(new FileStorage(environmentService.stateResource, saveStrategy, logService, fileService));
  }
  async init() {
    await this.fileStorage.init();
  }
  getItem(key, defaultValue) {
    return this.fileStorage.getItem(key, defaultValue);
  }
};
StateReadonlyService = __decorateClass([
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService)
], StateReadonlyService);
class StateService extends StateReadonlyService {
  setItem(key, data) {
    this.fileStorage.setItem(key, data);
  }
  setItems(items) {
    this.fileStorage.setItems(items);
  }
  removeItem(key) {
    this.fileStorage.removeItem(key);
  }
  close() {
    return this.fileStorage.close();
  }
}
export {
  FileStorage,
  SaveStrategy,
  StateReadonlyService,
  StateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3N0YXRlL25vZGUvc3RhdGVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWQsIGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RhdGVSZWFkU2VydmljZSwgSVN0YXRlU2VydmljZSB9IGZyb20gJy4vc3RhdGUuanMnO1xuXG50eXBlIFN0b3JhZ2VEYXRhYmFzZSA9IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXG5leHBvcnQgY29uc3QgZW51bSBTYXZlU3RyYXRlZ3kge1xuXHRJTU1FRElBVEUsXG5cdERFTEFZRURcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVTdG9yYWdlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdG9yYWdlOiBTdG9yYWdlRGF0YWJhc2UgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRwcml2YXRlIGxhc3RTYXZlZFN0b3JhZ2VDb250ZW50cyA9ICcnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmx1c2hEZWxheWVyOiBUaHJvdHRsZWREZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgaW5pdGlhbGl6aW5nOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNsb3Npbmc6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlUGF0aDogVVJJLFxuXHRcdHNhdmVTdHJhdGVneTogU2F2ZVN0cmF0ZWd5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5mbHVzaERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPihzYXZlU3RyYXRlZ3kgPT09IFNhdmVTdHJhdGVneS5JTU1FRElBVEUgPyAwIDogMTAwIC8qIGJ1ZmZlciBzYXZlcyBvdmVyIGEgc2hvcnQgdGltZSAqLykpO1xuXHR9XG5cblx0aW5pdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6aW5nKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxpemluZyA9IHRoaXMuZG9Jbml0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6aW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0luaXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubGFzdFNhdmVkU3RvcmFnZUNvbnRlbnRzID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5zdG9yYWdlUGF0aCkpLnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0XHR0aGlzLnN0b3JhZ2UgPSBKU09OLnBhcnNlKHRoaXMubGFzdFNhdmVkU3RvcmFnZUNvbnRlbnRzKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0SXRlbTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVDtcblx0Z2V0SXRlbTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQgfCB1bmRlZmluZWQ7XG5cdGdldEl0ZW08VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXMgPSB0aGlzLnN0b3JhZ2Vba2V5XTtcblx0XHRpZiAoaXNVbmRlZmluZWRPck51bGwocmVzKSkge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzIGFzIFQ7XG5cdH1cblxuXHRzZXRJdGVtKGtleTogc3RyaW5nLCBkYXRhPzogb2JqZWN0IHwgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLnNldEl0ZW1zKFt7IGtleSwgZGF0YSB9XSk7XG5cdH1cblxuXHRzZXRJdGVtcyhpdGVtczogcmVhZG9ubHkgeyBrZXk6IHN0cmluZzsgZGF0YT86IG9iamVjdCB8IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4gfCB1bmRlZmluZWQgfCBudWxsIH1bXSk6IHZvaWQge1xuXHRcdGxldCBzYXZlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHsga2V5LCBkYXRhIH0gb2YgaXRlbXMpIHtcblxuXHRcdFx0Ly8gU2hvcnRjdXQgZm9yIGRhdGEgdGhhdCBkaWQgbm90IGNoYW5nZVxuXHRcdFx0aWYgKHRoaXMuc3RvcmFnZVtrZXldID09PSBkYXRhKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgaXRlbXMgd2hlbiB0aGV5IGFyZSB1bmRlZmluZWQgb3IgbnVsbFxuXHRcdFx0aWYgKGlzVW5kZWZpbmVkT3JOdWxsKGRhdGEpKSB7XG5cdFx0XHRcdGlmICghaXNVbmRlZmluZWQodGhpcy5zdG9yYWdlW2tleV0pKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlW2tleV0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0c2F2ZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIGFkZCBhbiBpdGVtXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlW2tleV0gPSBkYXRhO1xuXHRcdFx0XHRzYXZlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2F2ZSkge1xuXHRcdFx0dGhpcy5zYXZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlSXRlbShrZXk6IHN0cmluZyk6IHZvaWQge1xuXG5cdFx0Ly8gT25seSB1cGRhdGUgaWYgdGhlIGtleSBpcyBhY3R1YWxseSBwcmVzZW50IChub3QgdW5kZWZpbmVkKVxuXHRcdGlmICghaXNVbmRlZmluZWQodGhpcy5zdG9yYWdlW2tleV0pKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2Vba2V5XSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2F2ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jbG9zaW5nKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgYWJvdXQgdG8gY2xvc2Vcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5mbHVzaERlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLmRvU2F2ZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXppbmcpIHtcblx0XHRcdHJldHVybjsgLy8gaWYgd2UgbmV2ZXIgaW5pdGlhbGl6ZWQsIHdlIHNob3VsZCBub3Qgc2F2ZSBvdXIgc3RhdGVcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gd2FpdCBmb3IgaW5pdCB0byBmaW5pc2ggZmlyc3Rcblx0XHRhd2FpdCB0aGlzLmluaXRpYWxpemluZztcblxuXHRcdC8vIFJldHVybiBlYXJseSBpZiB0aGUgZGF0YWJhc2UgaGFzIG5vdCBjaGFuZ2VkXG5cdFx0Y29uc3Qgc2VyaWFsaXplZERhdGFiYXNlID0gSlNPTi5zdHJpbmdpZnkodGhpcy5zdG9yYWdlLCBudWxsLCA0KTtcblx0XHRpZiAoc2VyaWFsaXplZERhdGFiYXNlID09PSB0aGlzLmxhc3RTYXZlZFN0b3JhZ2VDb250ZW50cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdyaXRlIHRvIGRpc2tcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5zdG9yYWdlUGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhzZXJpYWxpemVkRGF0YWJhc2UpLCB7IGF0b21pYzogeyBwb3N0Zml4OiAnLnZzY3RtcCcgfSB9KTtcblx0XHRcdHRoaXMubGFzdFNhdmVkU3RvcmFnZUNvbnRlbnRzID0gc2VyaWFsaXplZERhdGFiYXNlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5jbG9zaW5nKSB7XG5cdFx0XHR0aGlzLmNsb3NpbmcgPSB0aGlzLmZsdXNoRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMuZG9TYXZlKCksIDAgLyogYXMgc29vbiBhcyBwb3NzaWJsZSAqLyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY2xvc2luZztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdGVSZWFkb25seVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVN0YXRlUmVhZFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBmaWxlU3RvcmFnZTogRmlsZVN0b3JhZ2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c2F2ZVN0cmF0ZWd5OiBTYXZlU3RyYXRlZ3ksXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZmlsZVN0b3JhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmlsZVN0b3JhZ2UoZW52aXJvbm1lbnRTZXJ2aWNlLnN0YXRlUmVzb3VyY2UsIHNhdmVTdHJhdGVneSwgbG9nU2VydmljZSwgZmlsZVNlcnZpY2UpKTtcblx0fVxuXG5cdGFzeW5jIGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5maWxlU3RvcmFnZS5pbml0KCk7XG5cdH1cblxuXHRnZXRJdGVtPFQ+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQpOiBUO1xuXHRnZXRJdGVtPFQ+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZDtcblx0Z2V0SXRlbTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTdG9yYWdlLmdldEl0ZW0oa2V5LCBkZWZhdWx0VmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGF0ZVNlcnZpY2UgZXh0ZW5kcyBTdGF0ZVJlYWRvbmx5U2VydmljZSBpbXBsZW1lbnRzIElTdGF0ZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHNldEl0ZW0oa2V5OiBzdHJpbmcsIGRhdGE/OiBvYmplY3QgfCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuZmlsZVN0b3JhZ2Uuc2V0SXRlbShrZXksIGRhdGEpO1xuXHR9XG5cblx0c2V0SXRlbXMoaXRlbXM6IHJlYWRvbmx5IHsga2V5OiBzdHJpbmc7IGRhdGE/OiBvYmplY3QgfCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkIHwgbnVsbCB9W10pOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVTdG9yYWdlLnNldEl0ZW1zKGl0ZW1zKTtcblx0fVxuXG5cdHJlbW92ZUl0ZW0oa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVTdG9yYWdlLnJlbW92ZUl0ZW0oa2V5KTtcblx0fVxuXG5cdGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTdG9yYWdlLmNsb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhLHlCQUF5QjtBQUUvQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUE2QixxQkFBcUIsb0JBQW9CO0FBQ3RFLFNBQVMsbUJBQW1CO0FBS3JCLElBQVcsZUFBWCxrQkFBV0Esa0JBQVg7QUFDTixFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBRmlCLFNBQUFBO0FBQUEsR0FBQTtBQUtYLE1BQU0sb0JBQW9CLFdBQVc7QUFBQSxFQVUzQyxZQUNrQixhQUNqQixjQUNpQixZQUNBLGFBQ2hCO0FBQ0QsVUFBTTtBQUxXO0FBRUE7QUFDQTtBQVpsQixTQUFRLFVBQTJCLHVCQUFPLE9BQU8sSUFBSTtBQUNyRCxTQUFRLDJCQUEyQjtBQUluQyxTQUFRLGVBQTBDO0FBQ2xELFNBQVEsVUFBcUM7QUFVNUMsU0FBSyxlQUFlLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFBdUIsaUJBQWlCLG9CQUF5QixJQUFJO0FBQUE7QUFBQSxJQUF3QyxDQUFDO0FBQUEsRUFDdEo7QUFBQSxFQUVBLE9BQXNCO0FBQ3JCLFFBQUksQ0FBQyxLQUFLLGNBQWM7QUFDdkIsV0FBSyxlQUFlLEtBQUssT0FBTztBQUFBLElBQ2pDO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsTUFBYyxTQUF3QjtBQUNyQyxRQUFJO0FBQ0gsV0FBSyw0QkFBNEIsTUFBTSxLQUFLLFlBQVksU0FBUyxLQUFLLFdBQVcsR0FBRyxNQUFNLFNBQVM7QUFDbkcsV0FBSyxVQUFVLEtBQUssTUFBTSxLQUFLLHdCQUF3QjtBQUFBLElBQ3hELFNBQVMsT0FBTztBQUNmLFVBQXlCLE1BQU8sd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFDM0YsYUFBSyxXQUFXLE1BQU0sS0FBSztBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUlBLFFBQVcsS0FBYSxjQUFpQztBQUN4RCxVQUFNLE1BQU0sS0FBSyxRQUFRLEdBQUc7QUFDNUIsUUFBSSxrQkFBa0IsR0FBRyxHQUFHO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFFBQVEsS0FBYSxNQUFvRTtBQUN4RixTQUFLLFNBQVMsQ0FBQyxFQUFFLEtBQUssS0FBSyxDQUFDLENBQUM7QUFBQSxFQUM5QjtBQUFBLEVBRUEsU0FBUyxPQUF1RztBQUMvRyxRQUFJLE9BQU87QUFFWCxlQUFXLEVBQUUsS0FBSyxLQUFLLEtBQUssT0FBTztBQUdsQyxVQUFJLEtBQUssUUFBUSxHQUFHLE1BQU0sTUFBTTtBQUMvQjtBQUFBLE1BQ0Q7QUFHQSxVQUFJLGtCQUFrQixJQUFJLEdBQUc7QUFDNUIsWUFBSSxDQUFDLFlBQVksS0FBSyxRQUFRLEdBQUcsQ0FBQyxHQUFHO0FBQ3BDLGVBQUssUUFBUSxHQUFHLElBQUk7QUFDcEIsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxPQUdLO0FBQ0osYUFBSyxRQUFRLEdBQUcsSUFBSTtBQUNwQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU07QUFDVCxXQUFLLEtBQUs7QUFBQSxJQUNYO0FBQUEsRUFDRDtBQUFBLEVBRUEsV0FBVyxLQUFtQjtBQUc3QixRQUFJLENBQUMsWUFBWSxLQUFLLFFBQVEsR0FBRyxDQUFDLEdBQUc7QUFDcEMsV0FBSyxRQUFRLEdBQUcsSUFBSTtBQUNwQixXQUFLLEtBQUs7QUFBQSxJQUNYO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxPQUFzQjtBQUNuQyxRQUFJLEtBQUssU0FBUztBQUNqQjtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUssYUFBYSxRQUFRLE1BQU0sS0FBSyxPQUFPLENBQUM7QUFBQSxFQUNyRDtBQUFBLEVBRUEsTUFBYyxTQUF3QjtBQUNyQyxRQUFJLENBQUMsS0FBSyxjQUFjO0FBQ3ZCO0FBQUEsSUFDRDtBQUdBLFVBQU0sS0FBSztBQUdYLFVBQU0scUJBQXFCLEtBQUssVUFBVSxLQUFLLFNBQVMsTUFBTSxDQUFDO0FBQy9ELFFBQUksdUJBQXVCLEtBQUssMEJBQTBCO0FBQ3pEO0FBQUEsSUFDRDtBQUdBLFFBQUk7QUFDSCxZQUFNLEtBQUssWUFBWSxVQUFVLEtBQUssYUFBYSxTQUFTLFdBQVcsa0JBQWtCLEdBQUcsRUFBRSxRQUFRLEVBQUUsU0FBUyxVQUFVLEVBQUUsQ0FBQztBQUM5SCxXQUFLLDJCQUEyQjtBQUFBLElBQ2pDLFNBQVMsT0FBTztBQUNmLFdBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sUUFBdUI7QUFDNUIsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixXQUFLLFVBQVUsS0FBSyxhQUFhO0FBQUEsUUFBUSxNQUFNLEtBQUssT0FBTztBQUFBLFFBQUc7QUFBQTtBQUFBLE1BQTJCO0FBQUEsSUFDMUY7QUFFQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFTyxJQUFNLHVCQUFOLGNBQW1DLFdBQXdDO0FBQUEsRUFNakYsWUFDQyxjQUNxQixvQkFDUixZQUNDLGFBQ2I7QUFDRCxVQUFNO0FBRU4sU0FBSyxjQUFjLEtBQUssVUFBVSxJQUFJLFlBQVksbUJBQW1CLGVBQWUsY0FBYyxZQUFZLFdBQVcsQ0FBQztBQUFBLEVBQzNIO0FBQUEsRUFFQSxNQUFNLE9BQXNCO0FBQzNCLFVBQU0sS0FBSyxZQUFZLEtBQUs7QUFBQSxFQUM3QjtBQUFBLEVBSUEsUUFBVyxLQUFhLGNBQWlDO0FBQ3hELFdBQU8sS0FBSyxZQUFZLFFBQVEsS0FBSyxZQUFZO0FBQUEsRUFDbEQ7QUFDRDtBQTFCYSx1QkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7QUE0Qk4sTUFBTSxxQkFBcUIscUJBQThDO0FBQUEsRUFJL0UsUUFBUSxLQUFhLE1BQW9FO0FBQ3hGLFNBQUssWUFBWSxRQUFRLEtBQUssSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFQSxTQUFTLE9BQXVHO0FBQy9HLFNBQUssWUFBWSxTQUFTLEtBQUs7QUFBQSxFQUNoQztBQUFBLEVBRUEsV0FBVyxLQUFtQjtBQUM3QixTQUFLLFlBQVksV0FBVyxHQUFHO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFFBQXVCO0FBQ3RCLFdBQU8sS0FBSyxZQUFZLE1BQU07QUFBQSxFQUMvQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJTYXZlU3RyYXRlZ3kiXQp9Cg==
