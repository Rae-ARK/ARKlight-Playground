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
import { localize } from "../../../nls.js";
import { MarkerSeverity } from "../../../platform/markers/common/markers.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext } from "./extHost.protocol.js";
import { DiagnosticSeverity } from "./extHostTypes.js";
import * as converter from "./extHostTypeConverters.js";
import { Event, DebounceEmitter } from "../../../base/common/event.js";
import { coalesce } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ResourceMap } from "../../../base/common/map.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
class DiagnosticCollection {
  constructor(_name, _owner, _maxDiagnosticsTotal, _maxDiagnosticsPerFile, _modelVersionIdProvider, extUri, proxy, onDidChangeDiagnostics) {
    this._name = _name;
    this._owner = _owner;
    this._maxDiagnosticsTotal = _maxDiagnosticsTotal;
    this._maxDiagnosticsPerFile = _maxDiagnosticsPerFile;
    this._modelVersionIdProvider = _modelVersionIdProvider;
    this._isDisposed = false;
    this._maxDiagnosticsTotal = Math.max(_maxDiagnosticsPerFile, _maxDiagnosticsTotal);
    this.#data = new ResourceMap((uri) => extUri.getComparisonKey(uri));
    this.#proxy = proxy;
    this.#onDidChangeDiagnostics = onDidChangeDiagnostics;
  }
  #proxy;
  #onDidChangeDiagnostics;
  #data;
  dispose() {
    if (!this._isDisposed) {
      this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
      this.#proxy?.$clear(this._owner);
      this.#data.clear();
      this._isDisposed = true;
    }
  }
  get name() {
    this._checkDisposed();
    return this._name;
  }
  set(first, diagnostics) {
    if (!first) {
      this.clear();
      return;
    }
    this._checkDisposed();
    let toSync = [];
    if (URI.isUri(first)) {
      if (!diagnostics) {
        this.delete(first);
        return;
      }
      this.#data.set(first, coalesce(diagnostics));
      toSync = [first];
    } else if (Array.isArray(first)) {
      toSync = [];
      let lastUri;
      first = [...first].sort(DiagnosticCollection._compareIndexedTuplesByUri);
      for (const tuple of first) {
        const [uri, diagnostics2] = tuple;
        if (!lastUri || uri.toString() !== lastUri.toString()) {
          if (lastUri && this.#data.get(lastUri).length === 0) {
            this.#data.delete(lastUri);
          }
          lastUri = uri;
          toSync.push(uri);
          this.#data.set(uri, []);
        }
        if (!diagnostics2) {
          const currentDiagnostics = this.#data.get(uri);
          if (currentDiagnostics) {
            currentDiagnostics.length = 0;
          }
        } else {
          const currentDiagnostics = this.#data.get(uri);
          currentDiagnostics?.push(...coalesce(diagnostics2));
        }
      }
    }
    this.#onDidChangeDiagnostics.fire(toSync);
    if (!this.#proxy) {
      return;
    }
    const entries = [];
    let totalMarkerCount = 0;
    for (const uri of toSync) {
      let marker = [];
      const diagnostics2 = this.#data.get(uri);
      if (diagnostics2) {
        if (diagnostics2.length > this._maxDiagnosticsPerFile) {
          marker = [];
          const order = [DiagnosticSeverity.Error, DiagnosticSeverity.Warning, DiagnosticSeverity.Information, DiagnosticSeverity.Hint];
          orderLoop: for (let i = 0; i < 4; i++) {
            for (const diagnostic of diagnostics2) {
              if (diagnostic.severity === order[i]) {
                const len = marker.push({ ...converter.Diagnostic.from(diagnostic), modelVersionId: this._modelVersionIdProvider(uri) });
                if (len === this._maxDiagnosticsPerFile) {
                  break orderLoop;
                }
              }
            }
          }
          marker.push({
            severity: MarkerSeverity.Info,
            message: localize({ key: "limitHit", comment: ["amount of errors/warning skipped due to limits"] }, "Not showing {0} further errors and warnings.", diagnostics2.length - this._maxDiagnosticsPerFile),
            startLineNumber: marker[marker.length - 1].startLineNumber,
            startColumn: marker[marker.length - 1].startColumn,
            endLineNumber: marker[marker.length - 1].endLineNumber,
            endColumn: marker[marker.length - 1].endColumn
          });
        } else {
          marker = diagnostics2.map((diag) => ({ ...converter.Diagnostic.from(diag), modelVersionId: this._modelVersionIdProvider(uri) }));
        }
      }
      entries.push([uri, marker]);
      totalMarkerCount += marker.length;
      if (totalMarkerCount > this._maxDiagnosticsTotal) {
        break;
      }
    }
    this.#proxy.$changeMany(this._owner, entries);
  }
  delete(uri) {
    this._checkDisposed();
    this.#onDidChangeDiagnostics.fire([uri]);
    this.#data.delete(uri);
    this.#proxy?.$changeMany(this._owner, [[uri, void 0]]);
  }
  clear() {
    this._checkDisposed();
    this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
    this.#data.clear();
    this.#proxy?.$clear(this._owner);
  }
  forEach(callback, thisArg) {
    this._checkDisposed();
    for (const [uri, values] of this) {
      callback.call(thisArg, uri, values, this);
    }
  }
  *[Symbol.iterator]() {
    this._checkDisposed();
    for (const uri of this.#data.keys()) {
      yield [uri, this.get(uri)];
    }
  }
  get(uri) {
    this._checkDisposed();
    const result = this.#data.get(uri);
    if (Array.isArray(result)) {
      return Object.freeze(result.slice(0));
    }
    return [];
  }
  has(uri) {
    this._checkDisposed();
    return Array.isArray(this.#data.get(uri));
  }
  _checkDisposed() {
    if (this._isDisposed) {
      throw new Error("illegal state - object is disposed");
    }
  }
  static _compareIndexedTuplesByUri(a, b) {
    if (a[0].toString() < b[0].toString()) {
      return -1;
    } else if (a[0].toString() > b[0].toString()) {
      return 1;
    } else {
      return 0;
    }
  }
}
let ExtHostDiagnostics = class {
  constructor(mainContext, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors) {
    this._logService = _logService;
    this._fileSystemInfoService = _fileSystemInfoService;
    this._extHostDocumentsAndEditors = _extHostDocumentsAndEditors;
    this._collections = /* @__PURE__ */ new Map();
    this._onDidChangeDiagnostics = new DebounceEmitter({ merge: (all) => all.flat(), delay: 50 });
    this.onDidChangeDiagnostics = Event.map(this._onDidChangeDiagnostics.event, ExtHostDiagnostics._mapper);
    this._proxy = mainContext.getProxy(MainContext.MainThreadDiagnostics);
  }
  static _mapper(last) {
    const map = new ResourceMap();
    for (const uri of last) {
      map.set(uri, uri);
    }
    return { uris: Object.freeze(Array.from(map.values())) };
  }
  createDiagnosticCollection(extensionId, name) {
    const { _collections, _proxy, _onDidChangeDiagnostics, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors } = this;
    const loggingProxy = new class {
      $changeMany(owner2, entries) {
        _proxy.$changeMany(owner2, entries);
        _logService.trace("[DiagnosticCollection] change many (extension, owner, uris)", extensionId.value, owner2, entries.length === 0 ? "CLEARING" : entries);
      }
      $clear(owner2) {
        _proxy.$clear(owner2);
        _logService.trace("[DiagnosticCollection] remove all (extension, owner)", extensionId.value, owner2);
      }
      dispose() {
        _proxy.dispose();
      }
    }();
    let owner;
    if (!name) {
      name = "_generated_diagnostic_collection_name_#" + ExtHostDiagnostics._idPool++;
      owner = name;
    } else if (!_collections.has(name)) {
      owner = name;
    } else {
      this._logService.warn(`DiagnosticCollection with name '${name}' does already exist.`);
      do {
        owner = name + ExtHostDiagnostics._idPool++;
      } while (_collections.has(owner));
    }
    const result = new class extends DiagnosticCollection {
      constructor() {
        super(
          name,
          owner,
          ExtHostDiagnostics._maxDiagnosticsTotal,
          ExtHostDiagnostics._maxDiagnosticsPerFile,
          (uri) => _extHostDocumentsAndEditors.getDocument(uri)?.version,
          _fileSystemInfoService.extUri,
          loggingProxy,
          _onDidChangeDiagnostics
        );
        _collections.set(owner, this);
      }
      dispose() {
        super.dispose();
        _collections.delete(owner);
      }
    }();
    return result;
  }
  getDiagnostics(resource) {
    if (resource) {
      return this._getDiagnostics(resource);
    } else {
      const index = /* @__PURE__ */ new Map();
      const res = [];
      for (const collection of this._collections.values()) {
        collection.forEach((uri, diagnostics) => {
          let idx = index.get(uri.toString());
          if (typeof idx === "undefined") {
            idx = res.length;
            index.set(uri.toString(), idx);
            res.push([uri, []]);
          }
          res[idx][1] = res[idx][1].concat(diagnostics);
        });
      }
      return res;
    }
  }
  _getDiagnostics(resource) {
    let res = [];
    for (const collection of this._collections.values()) {
      if (collection.has(resource)) {
        res = res.concat(collection.get(resource));
      }
    }
    return res;
  }
  $acceptMarkersChange(data) {
    if (!this._mirrorCollection) {
      const name = "_generated_mirror";
      const collection = new DiagnosticCollection(
        name,
        name,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        // no limits because this collection is just a mirror of "sanitized" data
        (_uri) => void 0,
        this._fileSystemInfoService.extUri,
        void 0,
        this._onDidChangeDiagnostics
      );
      this._collections.set(name, collection);
      this._mirrorCollection = collection;
    }
    for (const [uri, markers] of data) {
      this._mirrorCollection.set(URI.revive(uri), markers.map(converter.Diagnostic.to));
    }
  }
};
ExtHostDiagnostics._idPool = 0;
ExtHostDiagnostics._maxDiagnosticsPerFile = 1e3;
ExtHostDiagnostics._maxDiagnosticsTotal = 1.1 * ExtHostDiagnostics._maxDiagnosticsPerFile;
ExtHostDiagnostics = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostFileSystemInfo)
], ExtHostDiagnostics);
export {
  DiagnosticCollection,
  ExtHostDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REaWFnbm9zdGljcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGUsIEV4dEhvc3REaWFnbm9zdGljc1NoYXBlLCBJTWFpbkNvbnRleHQgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpY1NldmVyaXR5IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0ICogYXMgY29udmVydGVyIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyLCBEZWJvdW5jZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRIb3N0RmlsZVN5c3RlbUluZm8gfSBmcm9tICcuL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBJRXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEaWFnbm9zdGljQ29sbGVjdGlvbiBpbXBsZW1lbnRzIHZzY29kZS5EaWFnbm9zdGljQ29sbGVjdGlvbiB7XG5cblx0cmVhZG9ubHkgI3Byb3h5OiBNYWluVGhyZWFkRGlhZ25vc3RpY3NTaGFwZSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgI29uRGlkQ2hhbmdlRGlhZ25vc3RpY3M6IEVtaXR0ZXI8cmVhZG9ubHkgdnNjb2RlLlVyaVtdPjtcblx0cmVhZG9ubHkgI2RhdGE6IFJlc291cmNlTWFwPHZzY29kZS5EaWFnbm9zdGljW10+O1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9uYW1lOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3duZXI6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXhEaWFnbm9zdGljc1RvdGFsOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWF4RGlhZ25vc3RpY3NQZXJGaWxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxWZXJzaW9uSWRQcm92aWRlcjogKHVyaTogVVJJKSA9PiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdFx0ZXh0VXJpOiBJRXh0VXJpLFxuXHRcdHByb3h5OiBNYWluVGhyZWFkRGlhZ25vc3RpY3NTaGFwZSB8IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZURpYWdub3N0aWNzOiBFbWl0dGVyPHJlYWRvbmx5IHZzY29kZS5VcmlbXT5cblx0KSB7XG5cdFx0dGhpcy5fbWF4RGlhZ25vc3RpY3NUb3RhbCA9IE1hdGgubWF4KF9tYXhEaWFnbm9zdGljc1BlckZpbGUsIF9tYXhEaWFnbm9zdGljc1RvdGFsKTtcblx0XHR0aGlzLiNkYXRhID0gbmV3IFJlc291cmNlTWFwKHVyaSA9PiBleHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHR0aGlzLiNwcm94eSA9IHByb3h5O1xuXHRcdHRoaXMuI29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MgPSBvbkRpZENoYW5nZURpYWdub3N0aWNzO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuI29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MuZmlyZShbLi4udGhpcy4jZGF0YS5rZXlzKCldKTtcblx0XHRcdHRoaXMuI3Byb3h5Py4kY2xlYXIodGhpcy5fb3duZXIpO1xuXHRcdFx0dGhpcy4jZGF0YS5jbGVhcigpO1xuXHRcdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX25hbWU7XG5cdH1cblxuXHRzZXQodXJpOiB2c2NvZGUuVXJpLCBkaWFnbm9zdGljczogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4pOiB2b2lkO1xuXHRzZXQoZW50cmllczogUmVhZG9ubHlBcnJheTxbdnNjb2RlLlVyaSwgUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz5dPik6IHZvaWQ7XG5cdHNldChmaXJzdDogdnNjb2RlLlVyaSB8IFJlYWRvbmx5QXJyYXk8W3ZzY29kZS5VcmksIFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+XT4sIGRpYWdub3N0aWNzPzogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4pIHtcblxuXHRcdGlmICghZmlyc3QpIHtcblx0XHRcdC8vIHRoaXMgc2V0LWNhbGwgaXMgYSBjbGVhci1jYWxsXG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gdGhlIGFjdHVhbCBpbXBsZW1lbnRhdGlvbiBmb3IgI3NldFxuXG5cdFx0dGhpcy5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdGxldCB0b1N5bmM6IHZzY29kZS5VcmlbXSA9IFtdO1xuXG5cdFx0aWYgKFVSSS5pc1VyaShmaXJzdCkpIHtcblxuXHRcdFx0aWYgKCFkaWFnbm9zdGljcykge1xuXHRcdFx0XHQvLyByZW1vdmUgdGhpcyBlbnRyeVxuXHRcdFx0XHR0aGlzLmRlbGV0ZShmaXJzdCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlIHNpbmdsZSByb3dcblx0XHRcdHRoaXMuI2RhdGEuc2V0KGZpcnN0LCBjb2FsZXNjZShkaWFnbm9zdGljcykpO1xuXHRcdFx0dG9TeW5jID0gW2ZpcnN0XTtcblxuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShmaXJzdCkpIHtcblx0XHRcdC8vIHVwZGF0ZSBtYW55IHJvd3Ncblx0XHRcdHRvU3luYyA9IFtdO1xuXHRcdFx0bGV0IGxhc3RVcmk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIGVuc3VyZSBzdGFibGUtc29ydFxuXHRcdFx0Zmlyc3QgPSBbLi4uZmlyc3RdLnNvcnQoRGlhZ25vc3RpY0NvbGxlY3Rpb24uX2NvbXBhcmVJbmRleGVkVHVwbGVzQnlVcmkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHR1cGxlIG9mIGZpcnN0KSB7XG5cdFx0XHRcdGNvbnN0IFt1cmksIGRpYWdub3N0aWNzXSA9IHR1cGxlO1xuXHRcdFx0XHRpZiAoIWxhc3RVcmkgfHwgdXJpLnRvU3RyaW5nKCkgIT09IGxhc3RVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGlmIChsYXN0VXJpICYmIHRoaXMuI2RhdGEuZ2V0KGxhc3RVcmkpIS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuI2RhdGEuZGVsZXRlKGxhc3RVcmkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0VXJpID0gdXJpO1xuXHRcdFx0XHRcdHRvU3luYy5wdXNoKHVyaSk7XG5cdFx0XHRcdFx0dGhpcy4jZGF0YS5zZXQodXJpLCBbXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWRpYWdub3N0aWNzKSB7XG5cdFx0XHRcdFx0Ly8gW1VyaSwgdW5kZWZpbmVkXSBtZWFucyBjbGVhciB0aGlzXG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudERpYWdub3N0aWNzID0gdGhpcy4jZGF0YS5nZXQodXJpKTtcblx0XHRcdFx0XHRpZiAoY3VycmVudERpYWdub3N0aWNzKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50RGlhZ25vc3RpY3MubGVuZ3RoID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY3VycmVudERpYWdub3N0aWNzID0gdGhpcy4jZGF0YS5nZXQodXJpKTtcblx0XHRcdFx0XHRjdXJyZW50RGlhZ25vc3RpY3M/LnB1c2goLi4uY29hbGVzY2UoZGlhZ25vc3RpY3MpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNlbmQgZXZlbnQgZm9yIGV4dGVuc2lvbnNcblx0XHR0aGlzLiNvbkRpZENoYW5nZURpYWdub3N0aWNzLmZpcmUodG9TeW5jKTtcblxuXHRcdC8vIGNvbXB1dGUgY2hhbmdlIGFuZCBzZW5kIHRvIG1haW4gc2lkZVxuXHRcdGlmICghdGhpcy4jcHJveHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cmllczogW1VSSSwgSU1hcmtlckRhdGFbXV1bXSA9IFtdO1xuXHRcdGxldCB0b3RhbE1hcmtlckNvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0b1N5bmMpIHtcblx0XHRcdGxldCBtYXJrZXI6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRcdGNvbnN0IGRpYWdub3N0aWNzID0gdGhpcy4jZGF0YS5nZXQodXJpKTtcblx0XHRcdGlmIChkaWFnbm9zdGljcykge1xuXG5cdFx0XHRcdC8vIG5vIG1vcmUgdGhhbiBOIGRpYWdub3N0aWNzIHBlciBmaWxlXG5cdFx0XHRcdGlmIChkaWFnbm9zdGljcy5sZW5ndGggPiB0aGlzLl9tYXhEaWFnbm9zdGljc1BlckZpbGUpIHtcblx0XHRcdFx0XHRtYXJrZXIgPSBbXTtcblx0XHRcdFx0XHRjb25zdCBvcmRlciA9IFtEaWFnbm9zdGljU2V2ZXJpdHkuRXJyb3IsIERpYWdub3N0aWNTZXZlcml0eS5XYXJuaW5nLCBEaWFnbm9zdGljU2V2ZXJpdHkuSW5mb3JtYXRpb24sIERpYWdub3N0aWNTZXZlcml0eS5IaW50XTtcblx0XHRcdFx0XHRvcmRlckxvb3A6IGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGRpYWdub3N0aWMgb2YgZGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGRpYWdub3N0aWMuc2V2ZXJpdHkgPT09IG9yZGVyW2ldKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbGVuID0gbWFya2VyLnB1c2goeyAuLi5jb252ZXJ0ZXIuRGlhZ25vc3RpYy5mcm9tKGRpYWdub3N0aWMpLCBtb2RlbFZlcnNpb25JZDogdGhpcy5fbW9kZWxWZXJzaW9uSWRQcm92aWRlcih1cmkpIH0pO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChsZW4gPT09IHRoaXMuX21heERpYWdub3N0aWNzUGVyRmlsZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YnJlYWsgb3JkZXJMb29wO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGFkZCAnc2lnbmFsJyBtYXJrZXIgZm9yIHNob3dpbmcgb21pdHRlZCBlcnJvcnMvd2FybmluZ3Ncblx0XHRcdFx0XHRtYXJrZXIucHVzaCh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKHsga2V5OiAnbGltaXRIaXQnLCBjb21tZW50OiBbJ2Ftb3VudCBvZiBlcnJvcnMvd2FybmluZyBza2lwcGVkIGR1ZSB0byBsaW1pdHMnXSB9LCBcIk5vdCBzaG93aW5nIHswfSBmdXJ0aGVyIGVycm9ycyBhbmQgd2FybmluZ3MuXCIsIGRpYWdub3N0aWNzLmxlbmd0aCAtIHRoaXMuX21heERpYWdub3N0aWNzUGVyRmlsZSksXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IG1hcmtlclttYXJrZXIubGVuZ3RoIC0gMV0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IG1hcmtlclttYXJrZXIubGVuZ3RoIC0gMV0uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBtYXJrZXJbbWFya2VyLmxlbmd0aCAtIDFdLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IG1hcmtlclttYXJrZXIubGVuZ3RoIC0gMV0uZW5kQ29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWFya2VyID0gZGlhZ25vc3RpY3MubWFwKGRpYWcgPT4gKHsgLi4uY29udmVydGVyLkRpYWdub3N0aWMuZnJvbShkaWFnKSwgbW9kZWxWZXJzaW9uSWQ6IHRoaXMuX21vZGVsVmVyc2lvbklkUHJvdmlkZXIodXJpKSB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZW50cmllcy5wdXNoKFt1cmksIG1hcmtlcl0pO1xuXG5cdFx0XHR0b3RhbE1hcmtlckNvdW50ICs9IG1hcmtlci5sZW5ndGg7XG5cdFx0XHRpZiAodG90YWxNYXJrZXJDb3VudCA+IHRoaXMuX21heERpYWdub3N0aWNzVG90YWwpIHtcblx0XHRcdFx0Ly8gaWdub3JlIG1hcmtlcnMgdGhhdCBhcmUgYWJvdmUgdGhlIGxpbWl0XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLiNwcm94eS4kY2hhbmdlTWFueSh0aGlzLl9vd25lciwgZW50cmllcyk7XG5cdH1cblxuXHRkZWxldGUodXJpOiB2c2NvZGUuVXJpKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdHRoaXMuI29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MuZmlyZShbdXJpXSk7XG5cdFx0dGhpcy4jZGF0YS5kZWxldGUodXJpKTtcblx0XHR0aGlzLiNwcm94eT8uJGNoYW5nZU1hbnkodGhpcy5fb3duZXIsIFtbdXJpLCB1bmRlZmluZWRdXSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0dGhpcy4jb25EaWRDaGFuZ2VEaWFnbm9zdGljcy5maXJlKFsuLi50aGlzLiNkYXRhLmtleXMoKV0pO1xuXHRcdHRoaXMuI2RhdGEuY2xlYXIoKTtcblx0XHR0aGlzLiNwcm94eT8uJGNsZWFyKHRoaXMuX293bmVyKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6ICh1cmk6IFVSSSwgZGlhZ25vc3RpY3M6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+LCBjb2xsZWN0aW9uOiBEaWFnbm9zdGljQ29sbGVjdGlvbikgPT4gdW5rbm93biwgdGhpc0FyZz86IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0Zm9yIChjb25zdCBbdXJpLCB2YWx1ZXNdIG9mIHRoaXMpIHtcblx0XHRcdGNhbGxiYWNrLmNhbGwodGhpc0FyZywgdXJpLCB2YWx1ZXMsIHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFt1cmk6IHZzY29kZS5VcmksIGRpYWdub3N0aWNzOiByZWFkb25seSB2c2NvZGUuRGlhZ25vc3RpY1tdXT4ge1xuXHRcdHRoaXMuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0aGlzLiNkYXRhLmtleXMoKSkge1xuXHRcdFx0eWllbGQgW3VyaSwgdGhpcy5nZXQodXJpKV07XG5cdFx0fVxuXHR9XG5cblx0Z2V0KHVyaTogVVJJKTogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4ge1xuXHRcdHRoaXMuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLiNkYXRhLmdldCh1cmkpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHJlc3VsdCkpIHtcblx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKHJlc3VsdC5zbGljZSgwKSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGhhcyh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheSh0aGlzLiNkYXRhLmdldCh1cmkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrRGlzcG9zZWQoKSB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaWxsZWdhbCBzdGF0ZSAtIG9iamVjdCBpcyBkaXNwb3NlZCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wYXJlSW5kZXhlZFR1cGxlc0J5VXJpKGE6IFt2c2NvZGUuVXJpLCByZWFkb25seSB2c2NvZGUuRGlhZ25vc3RpY1tdXSwgYjogW3ZzY29kZS5VcmksIHJlYWRvbmx5IHZzY29kZS5EaWFnbm9zdGljW11dKTogbnVtYmVyIHtcblx0XHRpZiAoYVswXS50b1N0cmluZygpIDwgYlswXS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhWzBdLnRvU3RyaW5nKCkgPiBiWzBdLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3REaWFnbm9zdGljcyBpbXBsZW1lbnRzIEV4dEhvc3REaWFnbm9zdGljc1NoYXBlIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfaWRQb29sOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfbWF4RGlhZ25vc3RpY3NQZXJGaWxlOiBudW1iZXIgPSAxMDAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfbWF4RGlhZ25vc3RpY3NUb3RhbDogbnVtYmVyID0gMS4xICogdGhpcy5fbWF4RGlhZ25vc3RpY3NQZXJGaWxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkRGlhZ25vc3RpY3NTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGVjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgRGlhZ25vc3RpY0NvbGxlY3Rpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MgPSBuZXcgRGVib3VuY2VFbWl0dGVyPHJlYWRvbmx5IHZzY29kZS5VcmlbXT4oeyBtZXJnZTogYWxsID0+IGFsbC5mbGF0KCksIGRlbGF5OiA1MCB9KTtcblxuXHRzdGF0aWMgX21hcHBlcihsYXN0OiByZWFkb25seSB2c2NvZGUuVXJpW10pOiB7IHVyaXM6IHJlYWRvbmx5IHZzY29kZS5VcmlbXSB9IHtcblx0XHRjb25zdCBtYXAgPSBuZXcgUmVzb3VyY2VNYXA8dnNjb2RlLlVyaT4oKTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiBsYXN0KSB7XG5cdFx0XHRtYXAuc2V0KHVyaSwgdXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdXJpczogT2JqZWN0LmZyZWV6ZShBcnJheS5mcm9tKG1hcC52YWx1ZXMoKSkpIH07XG5cdH1cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZURpYWdub3N0aWNzOiBFdmVudDx2c2NvZGUuRGlhZ25vc3RpY0NoYW5nZUV2ZW50PiA9IEV2ZW50Lm1hcCh0aGlzLl9vbkRpZENoYW5nZURpYWdub3N0aWNzLmV2ZW50LCBFeHRIb3N0RGlhZ25vc3RpY3MuX21hcHBlcik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0RmlsZVN5c3RlbUluZm8gcHJpdmF0ZSByZWFkb25seSBfZmlsZVN5c3RlbUluZm9TZXJ2aWNlOiBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzOiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkRGlhZ25vc3RpY3MpO1xuXHR9XG5cblx0Y3JlYXRlRGlhZ25vc3RpY0NvbGxlY3Rpb24oZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIG5hbWU/OiBzdHJpbmcpOiB2c2NvZGUuRGlhZ25vc3RpY0NvbGxlY3Rpb24ge1xuXG5cdFx0Y29uc3QgeyBfY29sbGVjdGlvbnMsIF9wcm94eSwgX29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MsIF9sb2dTZXJ2aWNlLCBfZmlsZVN5c3RlbUluZm9TZXJ2aWNlLCBfZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSA9IHRoaXM7XG5cblx0XHRjb25zdCBsb2dnaW5nUHJveHkgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBNYWluVGhyZWFkRGlhZ25vc3RpY3NTaGFwZSB7XG5cdFx0XHQkY2hhbmdlTWFueShvd25lcjogc3RyaW5nLCBlbnRyaWVzOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXSB8IHVuZGVmaW5lZF1bXSk6IHZvaWQge1xuXHRcdFx0XHRfcHJveHkuJGNoYW5nZU1hbnkob3duZXIsIGVudHJpZXMpO1xuXHRcdFx0XHRfbG9nU2VydmljZS50cmFjZSgnW0RpYWdub3N0aWNDb2xsZWN0aW9uXSBjaGFuZ2UgbWFueSAoZXh0ZW5zaW9uLCBvd25lciwgdXJpcyknLCBleHRlbnNpb25JZC52YWx1ZSwgb3duZXIsIGVudHJpZXMubGVuZ3RoID09PSAwID8gJ0NMRUFSSU5HJyA6IGVudHJpZXMpO1xuXHRcdFx0fVxuXHRcdFx0JGNsZWFyKG93bmVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0X3Byb3h5LiRjbGVhcihvd25lcik7XG5cdFx0XHRcdF9sb2dTZXJ2aWNlLnRyYWNlKCdbRGlhZ25vc3RpY0NvbGxlY3Rpb25dIHJlbW92ZSBhbGwgKGV4dGVuc2lvbiwgb3duZXIpJywgZXh0ZW5zaW9uSWQudmFsdWUsIG93bmVyKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0XHRcdF9wcm94eS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXG5cdFx0bGV0IG93bmVyOiBzdHJpbmc7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRuYW1lID0gJ19nZW5lcmF0ZWRfZGlhZ25vc3RpY19jb2xsZWN0aW9uX25hbWVfIycgKyBFeHRIb3N0RGlhZ25vc3RpY3MuX2lkUG9vbCsrO1xuXHRcdFx0b3duZXIgPSBuYW1lO1xuXHRcdH0gZWxzZSBpZiAoIV9jb2xsZWN0aW9ucy5oYXMobmFtZSkpIHtcblx0XHRcdG93bmVyID0gbmFtZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBEaWFnbm9zdGljQ29sbGVjdGlvbiB3aXRoIG5hbWUgJyR7bmFtZX0nIGRvZXMgYWxyZWFkeSBleGlzdC5gKTtcblx0XHRcdGRvIHtcblx0XHRcdFx0b3duZXIgPSBuYW1lICsgRXh0SG9zdERpYWdub3N0aWNzLl9pZFBvb2wrKztcblx0XHRcdH0gd2hpbGUgKF9jb2xsZWN0aW9ucy5oYXMob3duZXIpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBEaWFnbm9zdGljQ29sbGVjdGlvbiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoXG5cdFx0XHRcdFx0bmFtZSEsIG93bmVyLFxuXHRcdFx0XHRcdEV4dEhvc3REaWFnbm9zdGljcy5fbWF4RGlhZ25vc3RpY3NUb3RhbCxcblx0XHRcdFx0XHRFeHRIb3N0RGlhZ25vc3RpY3MuX21heERpYWdub3N0aWNzUGVyRmlsZSxcblx0XHRcdFx0XHR1cmkgPT4gX2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmdldERvY3VtZW50KHVyaSk/LnZlcnNpb24sXG5cdFx0XHRcdFx0X2ZpbGVTeXN0ZW1JbmZvU2VydmljZS5leHRVcmksIGxvZ2dpbmdQcm94eSwgX29uRGlkQ2hhbmdlRGlhZ25vc3RpY3Ncblx0XHRcdFx0KTtcblx0XHRcdFx0X2NvbGxlY3Rpb25zLnNldChvd25lciwgdGhpcyk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdFx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0XHRcdF9jb2xsZWN0aW9ucy5kZWxldGUob3duZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0RGlhZ25vc3RpY3MocmVzb3VyY2U6IHZzY29kZS5VcmkpOiBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPjtcblx0Z2V0RGlhZ25vc3RpY3MoKTogUmVhZG9ubHlBcnJheTxbdnNjb2RlLlVyaSwgUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz5dPjtcblx0Z2V0RGlhZ25vc3RpY3MocmVzb3VyY2U/OiB2c2NvZGUuVXJpKTogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4gfCBSZWFkb25seUFycmF5PFt2c2NvZGUuVXJpLCBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPl0+O1xuXHRnZXREaWFnbm9zdGljcyhyZXNvdXJjZT86IHZzY29kZS5VcmkpOiBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPiB8IFJlYWRvbmx5QXJyYXk8W3ZzY29kZS5VcmksIFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+XT4ge1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldERpYWdub3N0aWNzKHJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdFx0Y29uc3QgcmVzOiBbdnNjb2RlLlVyaSwgdnNjb2RlLkRpYWdub3N0aWNbXV1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIHRoaXMuX2NvbGxlY3Rpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbGxlY3Rpb24uZm9yRWFjaCgodXJpLCBkaWFnbm9zdGljcykgPT4ge1xuXHRcdFx0XHRcdGxldCBpZHggPSBpbmRleC5nZXQodXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaWR4ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0aWR4ID0gcmVzLmxlbmd0aDtcblx0XHRcdFx0XHRcdGluZGV4LnNldCh1cmkudG9TdHJpbmcoKSwgaWR4KTtcblx0XHRcdFx0XHRcdHJlcy5wdXNoKFt1cmksIFtdXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc1tpZHhdWzFdID0gcmVzW2lkeF1bMV0uY29uY2F0KGRpYWdub3N0aWNzKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldERpYWdub3N0aWNzKHJlc291cmNlOiB2c2NvZGUuVXJpKTogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4ge1xuXHRcdGxldCByZXM6IHZzY29kZS5EaWFnbm9zdGljW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgdGhpcy5fY29sbGVjdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChjb2xsZWN0aW9uLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0cmVzID0gcmVzLmNvbmNhdChjb2xsZWN0aW9uLmdldChyZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWlycm9yQ29sbGVjdGlvbjogdnNjb2RlLkRpYWdub3N0aWNDb2xsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdCRhY2NlcHRNYXJrZXJzQ2hhbmdlKGRhdGE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKTogdm9pZCB7XG5cblx0XHRpZiAoIXRoaXMuX21pcnJvckNvbGxlY3Rpb24pIHtcblx0XHRcdGNvbnN0IG5hbWUgPSAnX2dlbmVyYXRlZF9taXJyb3InO1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBEaWFnbm9zdGljQ29sbGVjdGlvbihcblx0XHRcdFx0bmFtZSwgbmFtZSxcblx0XHRcdFx0TnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAvLyBubyBsaW1pdHMgYmVjYXVzZSB0aGlzIGNvbGxlY3Rpb24gaXMganVzdCBhIG1pcnJvciBvZiBcInNhbml0aXplZFwiIGRhdGFcblx0XHRcdFx0X3VyaSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdHRoaXMuX2ZpbGVTeXN0ZW1JbmZvU2VydmljZS5leHRVcmksIHVuZGVmaW5lZCwgdGhpcy5fb25EaWRDaGFuZ2VEaWFnbm9zdGljc1xuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2NvbGxlY3Rpb25zLnNldChuYW1lLCBjb2xsZWN0aW9uKTtcblx0XHRcdHRoaXMuX21pcnJvckNvbGxlY3Rpb24gPSBjb2xsZWN0aW9uO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3VyaSwgbWFya2Vyc10gb2YgZGF0YSkge1xuXHRcdFx0dGhpcy5fbWlycm9yQ29sbGVjdGlvbi5zZXQoVVJJLnJldml2ZSh1cmkpLCBtYXJrZXJzLm1hcChjb252ZXJ0ZXIuRGlhZ25vc3RpYy50bykpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixzQkFBc0I7QUFDNUMsU0FBUyxXQUEwQjtBQUVuQyxTQUFTLG1CQUFzRjtBQUMvRixTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLGVBQWU7QUFDM0IsU0FBUyxPQUFnQix1QkFBdUI7QUFDaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyw4QkFBOEI7QUFJaEMsTUFBTSxxQkFBNEQ7QUFBQSxFQVF4RSxZQUNrQixPQUNBLFFBQ0Esc0JBQ0Esd0JBQ0EseUJBQ2pCLFFBQ0EsT0FDQSx3QkFDQztBQVJnQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBUGxC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
