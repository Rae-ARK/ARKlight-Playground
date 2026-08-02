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
import { IUriIdentityService } from "./uriIdentity.js";
import { URI } from "../../../base/common/uri.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { IFileService, FileSystemProviderCapabilities } from "../../files/common/files.js";
import { ExtUri, normalizePath } from "../../../base/common/resources.js";
import { Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { quickSelect } from "../../../base/common/arrays.js";
const _Entry = class _Entry {
  constructor(uri) {
    this.uri = uri;
    this.time = _Entry._clock++;
  }
  touch() {
    this.time = _Entry._clock++;
    return this;
  }
};
_Entry._clock = 0;
let Entry = _Entry;
let UriIdentityService = class {
  constructor(_fileService) {
    this._fileService = _fileService;
    this._dispooables = new DisposableStore();
    this._limit = 2 ** 16;
    const schemeIgnoresPathCasingCache = /* @__PURE__ */ new Map();
    const ignorePathCasing = (uri) => {
      let ignorePathCasing2 = schemeIgnoresPathCasingCache.get(uri.scheme);
      if (ignorePathCasing2 === void 0) {
        ignorePathCasing2 = _fileService.hasProvider(uri) && !this._fileService.hasCapability(uri, FileSystemProviderCapabilities.PathCaseSensitive);
        schemeIgnoresPathCasingCache.set(uri.scheme, ignorePathCasing2);
      }
      return ignorePathCasing2;
    };
    this._dispooables.add(Event.any(
      _fileService.onDidChangeFileSystemProviderRegistrations,
      _fileService.onDidChangeFileSystemProviderCapabilities
    )((e) => {
      const oldIgnorePathCasingValue = schemeIgnoresPathCasingCache.get(e.scheme);
      if (oldIgnorePathCasingValue === void 0) {
        return;
      }
      schemeIgnoresPathCasingCache.delete(e.scheme);
      const newIgnorePathCasingValue = ignorePathCasing(URI.from({ scheme: e.scheme }));
      if (newIgnorePathCasingValue === newIgnorePathCasingValue) {
        return;
      }
      for (const [key, entry] of this._canonicalUris.entries()) {
        if (entry.uri.scheme !== e.scheme) {
          continue;
        }
        this._canonicalUris.delete(key);
      }
    }));
    this.extUri = new ExtUri(ignorePathCasing);
    this._canonicalUris = /* @__PURE__ */ new Map();
  }
  dispose() {
    this._dispooables.dispose();
    this._canonicalUris.clear();
  }
  asCanonicalUri(uri) {
    if (this._fileService.hasProvider(uri)) {
      uri = normalizePath(uri);
    }
    const uriKey = this.extUri.getComparisonKey(uri, true);
    const item = this._canonicalUris.get(uriKey);
    if (item) {
      return item.touch().uri.with({ fragment: uri.fragment });
    }
    this._canonicalUris.set(uriKey, new Entry(uri));
    this._checkTrim();
    return uri;
  }
  _checkTrim() {
    if (this._canonicalUris.size < this._limit) {
      return;
    }
    Entry._clock = 1;
    const times = [...this._canonicalUris.values()].map((e) => e.time);
    const median = quickSelect(
      Math.floor(times.length / 2),
      times,
      (a, b) => a - b
    );
    for (const [key, entry] of this._canonicalUris.entries()) {
      if (entry.time <= median) {
        this._canonicalUris.delete(key);
      } else {
        entry.time = 0;
      }
    }
  }
};
UriIdentityService = __decorateClass([
  __decorateParam(0, IFileService)
], UriIdentityService);
registerSingleton(IUriIdentityService, UriIdentityService, InstantiationType.Delayed);
export {
  UriIdentityService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgSUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50LCBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRXh0VXJpLCBJRXh0VXJpLCBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHF1aWNrU2VsZWN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuY2xhc3MgRW50cnkge1xuXHRzdGF0aWMgX2Nsb2NrID0gMDtcblx0dGltZTogbnVtYmVyID0gRW50cnkuX2Nsb2NrKys7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJKSB7IH1cblx0dG91Y2goKSB7XG5cdFx0dGhpcy50aW1lID0gRW50cnkuX2Nsb2NrKys7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVyaUlkZW50aXR5U2VydmljZSBpbXBsZW1lbnRzIElVcmlJZGVudGl0eVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGV4dFVyaTogSUV4dFVyaTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb29hYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2Fub25pY2FsVXJpczogTWFwPHN0cmluZywgRW50cnk+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9saW1pdCA9IDIgKiogMTY7XG5cblx0Y29uc3RydWN0b3IoQElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKSB7XG5cblx0XHRjb25zdCBzY2hlbWVJZ25vcmVzUGF0aENhc2luZ0NhY2hlID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cblx0XHQvLyBhc3N1bWUgcGF0aCBjYXNpbmcgbWF0dGVycyB1bmxlc3MgdGhlIGZpbGUgc3lzdGVtIHByb3ZpZGVyIHNwZWMnZWQgdGhlIG9wcG9zaXRlLlxuXHRcdC8vIGZvciBhbGwgb3RoZXIgY2FzZXMgcGF0aCBjYXNpbmcgbWF0dGVycywgZS5nIGZvclxuXHRcdC8vICogdmlydHVhbCBkb2N1bWVudHNcblx0XHQvLyAqIGluLW1lbW9yeSB1cmlzXG5cdFx0Ly8gKiBhbGwga2luZCBvZiBcInByaXZhdGVcIiBzY2hlbWVzXG5cdFx0Y29uc3QgaWdub3JlUGF0aENhc2luZyA9ICh1cmk6IFVSSSk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0bGV0IGlnbm9yZVBhdGhDYXNpbmcgPSBzY2hlbWVJZ25vcmVzUGF0aENhc2luZ0NhY2hlLmdldCh1cmkuc2NoZW1lKTtcblx0XHRcdGlmIChpZ25vcmVQYXRoQ2FzaW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gcmV0cmlldmUgb25jZSBhbmQgdGhlbiBjYXNlIHBlciBzY2hlbWUgdW50aWwgYSBjaGFuZ2UgaGFwcGVuc1xuXHRcdFx0XHRpZ25vcmVQYXRoQ2FzaW5nID0gX2ZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHVyaSkgJiYgIXRoaXMuX2ZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkodXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0XHRzY2hlbWVJZ25vcmVzUGF0aENhc2luZ0NhY2hlLnNldCh1cmkuc2NoZW1lLCBpZ25vcmVQYXRoQ2FzaW5nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpZ25vcmVQYXRoQ2FzaW5nO1xuXHRcdH07XG5cdFx0dGhpcy5fZGlzcG9vYWJsZXMuYWRkKEV2ZW50LmFueTxJRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzQ2hhbmdlRXZlbnQgfCBJRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uRXZlbnQ+KFxuXHRcdFx0X2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9ucyxcblx0XHRcdF9maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc1xuXHRcdCkoZSA9PiB7XG5cdFx0XHRjb25zdCBvbGRJZ25vcmVQYXRoQ2FzaW5nVmFsdWUgPSBzY2hlbWVJZ25vcmVzUGF0aENhc2luZ0NhY2hlLmdldChlLnNjaGVtZSk7XG5cdFx0XHRpZiAob2xkSWdub3JlUGF0aENhc2luZ1ZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c2NoZW1lSWdub3Jlc1BhdGhDYXNpbmdDYWNoZS5kZWxldGUoZS5zY2hlbWUpO1xuXHRcdFx0Y29uc3QgbmV3SWdub3JlUGF0aENhc2luZ1ZhbHVlID0gaWdub3JlUGF0aENhc2luZyhVUkkuZnJvbSh7IHNjaGVtZTogZS5zY2hlbWUgfSkpO1xuXHRcdFx0aWYgKG5ld0lnbm9yZVBhdGhDYXNpbmdWYWx1ZSA9PT0gbmV3SWdub3JlUGF0aENhc2luZ1ZhbHVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIHRoaXMuX2Nhbm9uaWNhbFVyaXMuZW50cmllcygpKSB7XG5cdFx0XHRcdGlmIChlbnRyeS51cmkuc2NoZW1lICE9PSBlLnNjaGVtZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2Nhbm9uaWNhbFVyaXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5leHRVcmkgPSBuZXcgRXh0VXJpKGlnbm9yZVBhdGhDYXNpbmcpO1xuXHRcdHRoaXMuX2Nhbm9uaWNhbFVyaXMgPSBuZXcgTWFwKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvb2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jYW5vbmljYWxVcmlzLmNsZWFyKCk7XG5cdH1cblxuXHRhc0Nhbm9uaWNhbFVyaSh1cmk6IFVSSSk6IFVSSSB7XG5cblx0XHQvLyAoMSkgbm9ybWFsaXplIFVSSVxuXHRcdGlmICh0aGlzLl9maWxlU2VydmljZS5oYXNQcm92aWRlcih1cmkpKSB7XG5cdFx0XHR1cmkgPSBub3JtYWxpemVQYXRoKHVyaSk7XG5cdFx0fVxuXG5cdFx0Ly8gKDIpIGZpbmQgdGhlIHVyaSBpbiBpdHMgY2Fub25pY2FsIGZvcm0gb3IgdXNlIHRoaXMgdXJpIHRvIGRlZmluZSBpdFxuXHRcdGNvbnN0IHVyaUtleSA9IHRoaXMuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpLCB0cnVlKTtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2Fub25pY2FsVXJpcy5nZXQodXJpS2V5KTtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0cmV0dXJuIGl0ZW0udG91Y2goKS51cmkud2l0aCh7IGZyYWdtZW50OiB1cmkuZnJhZ21lbnQgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gdGhpcyB1cmkgaXMgZmlyc3QgYW5kIGRlZmluZXMgdGhlIGNhbm9uaWNhbCBmb3JtXG5cdFx0dGhpcy5fY2Fub25pY2FsVXJpcy5zZXQodXJpS2V5LCBuZXcgRW50cnkodXJpKSk7XG5cdFx0dGhpcy5fY2hlY2tUcmltKCk7XG5cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hlY2tUcmltKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jYW5vbmljYWxVcmlzLnNpemUgPCB0aGlzLl9saW1pdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdEVudHJ5Ll9jbG9jayA9IDE7XG5cdFx0Y29uc3QgdGltZXMgPSBbLi4udGhpcy5fY2Fub25pY2FsVXJpcy52YWx1ZXMoKV0ubWFwKGUgPT4gZS50aW1lKTtcblx0XHRjb25zdCBtZWRpYW4gPSBxdWlja1NlbGVjdChcblx0XHRcdE1hdGguZmxvb3IodGltZXMubGVuZ3RoIC8gMiksXG5cdFx0XHR0aW1lcyxcblx0XHRcdChhLCBiKSA9PiBhIC0gYik7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgdGhpcy5fY2Fub25pY2FsVXJpcy5lbnRyaWVzKCkpIHtcblx0XHRcdC8vIEl0cyBpbXBvcnRhbnQgdG8gcmVtb3ZlIHRoZSBtZWRpYW4gdmFsdWUgaGVyZSAoPD0gbm90IDwpLlxuXHRcdFx0Ly8gSWYgd2UgaGF2ZSBub3QgdG91Y2hlZCBhbnkgaXRlbXMgc2luY2UgdGhlIGxhc3QgdHJpbSwgdGhlXG5cdFx0XHQvLyBtZWRpYW4gd2lsbCBiZSAwIGFuZCBubyBpdGVtcyB3aWxsIGJlIHJlbW92ZWQgb3RoZXJ3aXNlLlxuXHRcdFx0aWYgKGVudHJ5LnRpbWUgPD0gbWVkaWFuKSB7XG5cdFx0XHRcdHRoaXMuX2Nhbm9uaWNhbFVyaXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyeS50aW1lID0gMDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVVyaUlkZW50aXR5U2VydmljZSwgVXJpSWRlbnRpdHlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGNBQWMsc0NBQXdIO0FBQy9JLFNBQVMsUUFBaUIscUJBQXFCO0FBQy9DLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUU1QixNQUFNLFNBQU4sTUFBTSxPQUFNO0FBQUEsRUFHWCxZQUFxQixLQUFVO0FBQVY7QUFEckIsZ0JBQWUsT0FBTTtBQUFBLEVBQ1k7QUFBQSxFQUNqQyxRQUFRO0FBQ1AsU0FBSyxPQUFPLE9BQU07QUFDbEIsV0FBTztBQUFBLEVBQ1I7QUFD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
