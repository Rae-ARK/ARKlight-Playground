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
import { URI } from "../../../base/common/uri.js";
import { Emitter } from "../../../base/common/event.js";
import { dispose } from "../../../base/common/lifecycle.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDecorationsService } from "../../services/decorations/common/decorations.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { DeferredPromise } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
class DecorationRequestsQueue {
  constructor(_proxy, _handle) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._idPool = 0;
    this._requests = /* @__PURE__ */ new Map();
    this._resolver = /* @__PURE__ */ new Map();
  }
  enqueue(uri, token) {
    const id = ++this._idPool;
    const defer = new DeferredPromise();
    this._requests.set(id, { id, uri });
    this._resolver.set(id, defer);
    this._processQueue();
    const sub = token.onCancellationRequested(() => {
      this._requests.delete(id);
      this._resolver.delete(id);
      defer.error(new CancellationError());
    });
    return defer.p.finally(() => sub.dispose());
  }
  _processQueue() {
    if (this._timer !== void 0) {
      return;
    }
    this._timer = setTimeout(() => {
      const requests = this._requests;
      const resolver = this._resolver;
      this._proxy.$provideDecorations(this._handle, [...requests.values()], CancellationToken.None).then((data) => {
        for (const [id, defer] of resolver) {
          defer.complete(data[id]);
        }
      });
      this._requests = /* @__PURE__ */ new Map();
      this._resolver = /* @__PURE__ */ new Map();
      this._timer = void 0;
    }, 0);
  }
}
let MainThreadDecorations = class {
  constructor(context, _decorationsService) {
    this._decorationsService = _decorationsService;
    this._provider = /* @__PURE__ */ new Map();
    this._proxy = context.getProxy(ExtHostContext.ExtHostDecorations);
  }
  dispose() {
    this._provider.forEach((value) => dispose(value));
    this._provider.clear();
  }
  $registerDecorationProvider(handle, label) {
    const emitter = new Emitter();
    const queue = new DecorationRequestsQueue(this._proxy, handle);
    const registration = this._decorationsService.registerDecorationsProvider({
      label,
      onDidChange: emitter.event,
      provideDecorations: async (uri, token) => {
        const data = await queue.enqueue(uri, token);
        if (!data) {
          return void 0;
        }
        const [bubble, tooltip, letter, themeColor] = data;
        return {
          weight: 10,
          bubble: bubble ?? false,
          color: themeColor?.id,
          tooltip,
          letter
        };
      }
    });
    this._provider.set(handle, [emitter, registration]);
  }
  $onDidChange(handle, resources) {
    const provider = this._provider.get(handle);
    if (provider) {
      const [emitter] = provider;
      emitter.fire(resources && resources.map((r) => URI.revive(r)));
    }
  }
  $unregisterDecorationProvider(handle) {
    const provider = this._provider.get(handle);
    if (provider) {
      dispose(provider);
      this._provider.delete(handle);
    }
  }
};
MainThreadDecorations = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDecorations),
  __decorateParam(1, IDecorationsService)
], MainThreadDecorations);
export {
  MainThreadDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRGVjb3JhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBNYWluQ29udGV4dCwgTWFpblRocmVhZERlY29yYXRpb25zU2hhcGUsIEV4dEhvc3REZWNvcmF0aW9uc1NoYXBlLCBEZWNvcmF0aW9uRGF0YSwgRGVjb3JhdGlvblJlcXVlc3QgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBJRGVjb3JhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5jbGFzcyBEZWNvcmF0aW9uUmVxdWVzdHNRdWV1ZSB7XG5cblx0cHJpdmF0ZSBfaWRQb29sID0gMDtcblx0cHJpdmF0ZSBfcmVxdWVzdHMgPSBuZXcgTWFwPG51bWJlciwgRGVjb3JhdGlvblJlcXVlc3Q+KCk7XG5cdHByaXZhdGUgX3Jlc29sdmVyID0gbmV3IE1hcDxudW1iZXIsIERlZmVycmVkUHJvbWlzZTxEZWNvcmF0aW9uRGF0YT4+KCk7XG5cblx0cHJpdmF0ZSBfdGltZXI6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3REZWNvcmF0aW9uc1NoYXBlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRsZTogbnVtYmVyXG5cdCkge1xuXHRcdC8vXG5cdH1cblxuXHRlbnF1ZXVlKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERlY29yYXRpb25EYXRhPiB7XG5cdFx0Y29uc3QgaWQgPSArK3RoaXMuX2lkUG9vbDtcblxuXHRcdGNvbnN0IGRlZmVyID0gbmV3IERlZmVycmVkUHJvbWlzZTxEZWNvcmF0aW9uRGF0YT4oKTtcblx0XHR0aGlzLl9yZXF1ZXN0cy5zZXQoaWQsIHsgaWQsIHVyaSB9KTtcblx0XHR0aGlzLl9yZXNvbHZlci5zZXQoaWQsIGRlZmVyKTtcblx0XHR0aGlzLl9wcm9jZXNzUXVldWUoKTtcblxuXHRcdGNvbnN0IHN1YiA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHRoaXMuX3JlcXVlc3RzLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlci5kZWxldGUoaWQpO1xuXHRcdFx0ZGVmZXIuZXJyb3IobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBkZWZlci5wLmZpbmFsbHkoKCkgPT4gc3ViLmRpc3Bvc2UoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9jZXNzUXVldWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIGFscmVhZHkgcXVldWVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHQvLyBtYWtlIHJlcXVlc3Rcblx0XHRcdGNvbnN0IHJlcXVlc3RzID0gdGhpcy5fcmVxdWVzdHM7XG5cdFx0XHRjb25zdCByZXNvbHZlciA9IHRoaXMuX3Jlc29sdmVyO1xuXHRcdFx0dGhpcy5fcHJveHkuJHByb3ZpZGVEZWNvcmF0aW9ucyh0aGlzLl9oYW5kbGUsIFsuLi5yZXF1ZXN0cy52YWx1ZXMoKV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oZGF0YSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2lkLCBkZWZlcl0gb2YgcmVzb2x2ZXIpIHtcblx0XHRcdFx0XHRkZWZlci5jb21wbGV0ZShkYXRhW2lkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyByZXNldFxuXHRcdFx0dGhpcy5fcmVxdWVzdHMgPSBuZXcgTWFwKCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlciA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX3RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH0sIDApO1xuXHR9XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRGVjb3JhdGlvbnMpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERlY29yYXRpb25zIGltcGxlbWVudHMgTWFpblRocmVhZERlY29yYXRpb25zU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyID0gbmV3IE1hcDxudW1iZXIsIFtFbWl0dGVyPFVSSVtdPiwgSURpc3Bvc2FibGVdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdERlY29yYXRpb25zU2hhcGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGNvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdERlY29yYXRpb25zKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fcHJvdmlkZXIuZm9yRWFjaCh2YWx1ZSA9PiBkaXNwb3NlKHZhbHVlKSk7XG5cdFx0dGhpcy5fcHJvdmlkZXIuY2xlYXIoKTtcblx0fVxuXG5cdCRyZWdpc3RlckRlY29yYXRpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlciwgbGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxVUklbXT4oKTtcblx0XHRjb25zdCBxdWV1ZSA9IG5ldyBEZWNvcmF0aW9uUmVxdWVzdHNRdWV1ZSh0aGlzLl9wcm94eSwgaGFuZGxlKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9kZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRwcm92aWRlRGVjb3JhdGlvbnM6IGFzeW5jICh1cmksIHRva2VuKTogUHJvbWlzZTxJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHF1ZXVlLmVucXVldWUodXJpLCB0b2tlbik7XG5cdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgW2J1YmJsZSwgdG9vbHRpcCwgbGV0dGVyLCB0aGVtZUNvbG9yXSA9IGRhdGE7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiAxMCxcblx0XHRcdFx0XHRidWJibGU6IGJ1YmJsZSA/PyBmYWxzZSxcblx0XHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvcj8uaWQsXG5cdFx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0XHRsZXR0ZXJcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9wcm92aWRlci5zZXQoaGFuZGxlLCBbZW1pdHRlciwgcmVnaXN0cmF0aW9uXSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2UoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlczogVXJpQ29tcG9uZW50c1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlci5nZXQoaGFuZGxlKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IFtlbWl0dGVyXSA9IHByb3ZpZGVyO1xuXHRcdFx0ZW1pdHRlci5maXJlKHJlc291cmNlcyAmJiByZXNvdXJjZXMubWFwKHIgPT4gVVJJLnJldml2ZShyKSkpO1xuXHRcdH1cblx0fVxuXG5cdCR1bnJlZ2lzdGVyRGVjb3JhdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlci5nZXQoaGFuZGxlKTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdGRpc3Bvc2UocHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXIuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLGVBQWU7QUFDckMsU0FBUyxnQkFBZ0IsbUJBQTJHO0FBQ3BJLFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsMkJBQTRDO0FBQ3JELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0sd0JBQXdCO0FBQUEsRUFRN0IsWUFDa0IsUUFDQSxTQUNoQjtBQUZnQjtBQUNBO0FBUmxCLFNBQVEsVUFBVTtBQUNsQixTQUFRLFlBQVksb0JBQUksSUFBK0I7QUFDdkQsU0FBUSxZQUFZLG9CQUFJLElBQTZDO0FBQUEsRUFTckU7QUFBQSxFQUVBLFFBQVEsS0FBVSxPQUFtRDtBQUNwRSxVQUFNLEtBQUssRUFBRSxLQUFLO0FBRWxCLFVBQU0sUUFBUSxJQUFJLGdCQUFnQztBQUNsRCxTQUFLLFVBQVUsSUFBSSxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUM7QUFDbEMsU0FBSyxVQUFVLElBQUksSUFBSSxLQUFLO0FBQzVCLFNBQUssY0FBYztBQUVuQixVQUFNLE1BQU0sTUFBTSx3QkFBd0IsTUFBTTtBQUMvQyxXQUFLLFVBQVUsT0FBTyxFQUFFO0FBQ3hCLFdBQUssVUFBVSxPQUFPLEVBQUU7QUFDeEIsWUFBTSxNQUFNLElBQUksa0JBQWtCLENBQUM7QUFBQSxJQUNwQyxDQUFDO0FBQ0QsV0FBTyxNQUFNLEVBQUUsUUFBUSxN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
