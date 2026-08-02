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
import { MainContext } from "./extHost.protocol.js";
import { Disposable, FileDecoration } from "./extHostTypes.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { asArray, groupBy } from "../../../base/common/arrays.js";
import { compare, count } from "../../../base/common/strings.js";
import { dirname } from "../../../base/common/path.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
let ExtHostDecorations = class {
  constructor(extHostRpc, _logService) {
    this._logService = _logService;
    this._provider = /* @__PURE__ */ new Map();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadDecorations);
  }
  registerFileDecorationProvider(provider, extensionDescription) {
    const handle = ExtHostDecorations._handlePool++;
    this._provider.set(handle, { provider, extensionDescription });
    this._proxy.$registerDecorationProvider(handle, extensionDescription.identifier.value);
    const listener = provider.onDidChangeFileDecorations && provider.onDidChangeFileDecorations((e) => {
      if (!e) {
        this._proxy.$onDidChange(handle, null);
        return;
      }
      const array = asArray(e);
      if (array.length <= ExtHostDecorations._maxEventSize) {
        this._proxy.$onDidChange(handle, array);
        return;
      }
      this._logService.warn("[Decorations] CAPPING events from decorations provider", extensionDescription.identifier.value, array.length);
      const mapped = array.map((uri) => ({ uri, rank: count(uri.path, "/") }));
      const groups = groupBy(mapped, (a, b) => a.rank - b.rank || compare(a.uri.path, b.uri.path));
      const picked = [];
      outer: for (const uris of groups) {
        let lastDirname;
        for (const obj of uris) {
          const myDirname = dirname(obj.uri.path);
          if (lastDirname !== myDirname) {
            lastDirname = myDirname;
            if (picked.push(obj.uri) >= ExtHostDecorations._maxEventSize) {
              break outer;
            }
          }
        }
      }
      this._proxy.$onDidChange(handle, picked);
    });
    return new Disposable(() => {
      listener?.dispose();
      this._proxy.$unregisterDecorationProvider(handle);
      this._provider.delete(handle);
    });
  }
  async $provideDecorations(handle, requests, token) {
    if (!this._provider.has(handle)) {
      return /* @__PURE__ */ Object.create(null);
    }
    const result = /* @__PURE__ */ Object.create(null);
    const { provider, extensionDescription: extensionId } = this._provider.get(handle);
    await Promise.all(requests.map(async (request) => {
      try {
        const { uri, id } = request;
        const data = await Promise.resolve(provider.provideFileDecoration(URI.revive(uri), token));
        if (!data) {
          return;
        }
        try {
          FileDecoration.validate(data);
          if (data.badge && typeof data.badge !== "string") {
            checkProposedApiEnabled(extensionId, "codiconDecoration");
          }
          result[id] = [data.propagate, data.tooltip, data.badge, data.color];
        } catch (e) {
          this._logService.warn(`INVALID decoration from extension '${extensionId.identifier.value}': ${e}`);
        }
      } catch (err) {
        this._logService.error(err);
      }
    }));
    return result;
  }
};
ExtHostDecorations._handlePool = 0;
ExtHostDecorations._maxEventSize = 250;
ExtHostDecorations = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService)
], ExtHostDecorations);
const IExtHostDecorations = createDecorator("IExtHostDecorations");
export {
  ExtHostDecorations,
  IExtHostDecorations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3REZWNvcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIEV4dEhvc3REZWNvcmF0aW9uc1NoYXBlLCBNYWluVGhyZWFkRGVjb3JhdGlvbnNTaGFwZSwgRGVjb3JhdGlvbkRhdGEsIERlY29yYXRpb25SZXF1ZXN0LCBEZWNvcmF0aW9uUmVwbHkgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRmlsZURlY29yYXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGFzQXJyYXksIGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgY29tcGFyZSwgY291bnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmludGVyZmFjZSBQcm92aWRlckRhdGEge1xuXHRwcm92aWRlcjogdnNjb2RlLkZpbGVEZWNvcmF0aW9uUHJvdmlkZXI7XG5cdGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RGVjb3JhdGlvbnMgaW1wbGVtZW50cyBFeHRIb3N0RGVjb3JhdGlvbnNTaGFwZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZVBvb2wgPSAwO1xuXHRwcml2YXRlIHN0YXRpYyBfbWF4RXZlbnRTaXplID0gMjUwO1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXIgPSBuZXcgTWFwPG51bWJlciwgUHJvdmlkZXJEYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZERlY29yYXRpb25zU2hhcGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERlY29yYXRpb25zKTtcblx0fVxuXG5cdHJlZ2lzdGVyRmlsZURlY29yYXRpb25Qcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkZpbGVEZWNvcmF0aW9uUHJvdmlkZXIsIGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdERlY29yYXRpb25zLl9oYW5kbGVQb29sKys7XG5cdFx0dGhpcy5fcHJvdmlkZXIuc2V0KGhhbmRsZSwgeyBwcm92aWRlciwgZXh0ZW5zaW9uRGVzY3JpcHRpb24gfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRGVjb3JhdGlvblByb3ZpZGVyKGhhbmRsZSwgZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZURlY29yYXRpb25zICYmIHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZURlY29yYXRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKCFlKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZShoYW5kbGUsIG51bGwpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhcnJheSA9IGFzQXJyYXkoZSk7XG5cdFx0XHRpZiAoYXJyYXkubGVuZ3RoIDw9IEV4dEhvc3REZWNvcmF0aW9ucy5fbWF4RXZlbnRTaXplKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZShoYW5kbGUsIGFycmF5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB0b28gbWFueSByZXNvdXJjZXMgcGVyIGV2ZW50LiBwaWNrIG9uZSByZXNvdXJjZSBwZXIgZm9sZGVyLCBzdGFydGluZ1xuXHRcdFx0Ly8gd2l0aCBwYXJlbnQgZm9sZGVyc1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbRGVjb3JhdGlvbnNdIENBUFBJTkcgZXZlbnRzIGZyb20gZGVjb3JhdGlvbnMgcHJvdmlkZXInLCBleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLCBhcnJheS5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbWFwcGVkID0gYXJyYXkubWFwKHVyaSA9PiAoeyB1cmksIHJhbms6IGNvdW50KHVyaS5wYXRoLCAnLycpIH0pKTtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdyb3VwQnkobWFwcGVkLCAoYSwgYikgPT4gYS5yYW5rIC0gYi5yYW5rIHx8IGNvbXBhcmUoYS51cmkucGF0aCwgYi51cmkucGF0aCkpO1xuXHRcdFx0Y29uc3QgcGlja2VkOiBVUklbXSA9IFtdO1xuXHRcdFx0b3V0ZXI6IGZvciAoY29uc3QgdXJpcyBvZiBncm91cHMpIHtcblx0XHRcdFx0bGV0IGxhc3REaXJuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3Qgb2JqIG9mIHVyaXMpIHtcblx0XHRcdFx0XHRjb25zdCBteURpcm5hbWUgPSBkaXJuYW1lKG9iai51cmkucGF0aCk7XG5cdFx0XHRcdFx0aWYgKGxhc3REaXJuYW1lICE9PSBteURpcm5hbWUpIHtcblx0XHRcdFx0XHRcdGxhc3REaXJuYW1lID0gbXlEaXJuYW1lO1xuXHRcdFx0XHRcdFx0aWYgKHBpY2tlZC5wdXNoKG9iai51cmkpID49IEV4dEhvc3REZWNvcmF0aW9ucy5fbWF4RXZlbnRTaXplKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrIG91dGVyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlKGhhbmRsZSwgcGlja2VkKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJEZWNvcmF0aW9uUHJvdmlkZXIoaGFuZGxlKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVEZWNvcmF0aW9ucyhoYW5kbGU6IG51bWJlciwgcmVxdWVzdHM6IERlY29yYXRpb25SZXF1ZXN0W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVjb3JhdGlvblJlcGx5PiB7XG5cblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyLmhhcyhoYW5kbGUpKSB7XG5cdFx0XHQvLyBtaWdodCBoYXZlIGJlZW4gdW5yZWdpc3RlcmVkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBEZWNvcmF0aW9uUmVwbHkgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBleHRlbnNpb25JZCB9ID0gdGhpcy5fcHJvdmlkZXIuZ2V0KGhhbmRsZSkhO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVxdWVzdHMubWFwKGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgeyB1cmksIGlkIH0gPSByZXF1ZXN0O1xuXHRcdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVGaWxlRGVjb3JhdGlvbihVUkkucmV2aXZlKHVyaSksIHRva2VuKSk7XG5cdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdEZpbGVEZWNvcmF0aW9uLnZhbGlkYXRlKGRhdGEpO1xuXHRcdFx0XHRcdGlmIChkYXRhLmJhZGdlICYmIHR5cGVvZiBkYXRhLmJhZGdlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uSWQsICdjb2RpY29uRGVjb3JhdGlvbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHRbaWRdID0gPERlY29yYXRpb25EYXRhPltkYXRhLnByb3BhZ2F0ZSwgZGF0YS50b29sdGlwLCBkYXRhLmJhZGdlLCBkYXRhLmNvbG9yXTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgSU5WQUxJRCBkZWNvcmF0aW9uIGZyb20gZXh0ZW5zaW9uICcke2V4dGVuc2lvbklkLmlkZW50aWZpZXIudmFsdWV9JzogJHtlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0RGVjb3JhdGlvbnMgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3REZWNvcmF0aW9ucz4oJ0lFeHRIb3N0RGVjb3JhdGlvbnMnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3REZWNvcmF0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
