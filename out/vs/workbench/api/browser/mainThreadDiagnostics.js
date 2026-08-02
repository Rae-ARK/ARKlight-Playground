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
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext, ExtHostContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { ResourceMap } from "../../../base/common/map.js";
let MainThreadDiagnostics = class {
  constructor(extHostContext, _markerService, _uriIdentService) {
    this._markerService = _markerService;
    this._uriIdentService = _uriIdentService;
    this._activeOwners = /* @__PURE__ */ new Set();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);
    this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);
    this.extHostId = `extHost${MainThreadDiagnostics.ExtHostCounter++}`;
  }
  dispose() {
    this._markerListener.dispose();
    for (const owner of this._activeOwners) {
      const markersData = new ResourceMap();
      for (const marker of this._markerService.read({ owner })) {
        let data = markersData.get(marker.resource);
        if (data === void 0) {
          data = [];
          markersData.set(marker.resource, data);
        }
        if (marker.origin !== this.extHostId) {
          data.push(marker);
        }
      }
      for (const [resource, local] of markersData.entries()) {
        this._markerService.changeOne(owner, resource, local);
      }
    }
    this._activeOwners.clear();
  }
  _forwardMarkers(resources) {
    const data = [];
    for (const resource of resources) {
      const allMarkerData = this._markerService.read({ resource, ignoreResourceFilters: true });
      if (allMarkerData.length === 0) {
        data.push([resource, []]);
      } else {
        const foreignMarkerData = allMarkerData.filter((marker) => marker?.origin !== this.extHostId);
        if (foreignMarkerData.length > 0) {
          data.push([resource, foreignMarkerData]);
        }
      }
    }
    if (data.length > 0) {
      this._proxy.$acceptMarkersChange(data);
    }
  }
  $changeMany(owner, entries) {
    for (const entry of entries) {
      const [uri, markers] = entry;
      if (markers) {
        for (const marker of markers) {
          if (marker.relatedInformation) {
            for (const relatedInformation of marker.relatedInformation) {
              relatedInformation.resource = URI.revive(relatedInformation.resource);
            }
          }
          if (marker.code && typeof marker.code !== "string") {
            marker.code.target = URI.revive(marker.code.target);
          }
          if (marker.origin === void 0) {
            marker.origin = this.extHostId;
          }
        }
      }
      this._markerService.changeOne(owner, this._uriIdentService.asCanonicalUri(URI.revive(uri)), markers);
    }
    this._activeOwners.add(owner);
  }
  $clear(owner) {
    this._markerService.changeAll(owner, []);
    this._activeOwners.delete(owner);
  }
};
MainThreadDiagnostics.ExtHostCounter = 1;
MainThreadDiagnostics = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDiagnostics),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IUriIdentityService)
], MainThreadDiagnostics);
export {
  MainThreadDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRGlhZ25vc3RpY3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSwgSU1hcmtlckRhdGEsIHR5cGUgSU1hcmtlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREaWFnbm9zdGljc1NoYXBlLCBNYWluQ29udGV4dCwgRXh0SG9zdERpYWdub3N0aWNzU2hhcGUsIEV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRGlhZ25vc3RpY3MpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZERpYWdub3N0aWNzIGltcGxlbWVudHMgTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZU93bmVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0RGlhZ25vc3RpY3NTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWFya2VyTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgc3RhdGljIEV4dEhvc3RDb3VudGVyOiBudW1iZXIgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dEhvc3RJZDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0RGlhZ25vc3RpY3MpO1xuXG5cdFx0dGhpcy5fbWFya2VyTGlzdGVuZXIgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZCh0aGlzLl9mb3J3YXJkTWFya2VycywgdGhpcyk7XG5cdFx0dGhpcy5leHRIb3N0SWQgPSBgZXh0SG9zdCR7TWFpblRocmVhZERpYWdub3N0aWNzLkV4dEhvc3RDb3VudGVyKyt9YDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFya2VyTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGZvciAoY29uc3Qgb3duZXIgb2YgdGhpcy5fYWN0aXZlT3duZXJzKSB7XG5cdFx0XHRjb25zdCBtYXJrZXJzRGF0YTogUmVzb3VyY2VNYXA8SU1hcmtlcltdPiA9IG5ldyBSZXNvdXJjZU1hcDxJTWFya2VyW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiB0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlYWQoeyBvd25lciB9KSkge1xuXHRcdFx0XHRsZXQgZGF0YSA9IG1hcmtlcnNEYXRhLmdldChtYXJrZXIucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGF0YSA9IFtdO1xuXHRcdFx0XHRcdG1hcmtlcnNEYXRhLnNldChtYXJrZXIucmVzb3VyY2UsIGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtYXJrZXIub3JpZ2luICE9PSB0aGlzLmV4dEhvc3RJZCkge1xuXHRcdFx0XHRcdGRhdGEucHVzaChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgbG9jYWxdIG9mIG1hcmtlcnNEYXRhLmVudHJpZXMoKSkge1xuXHRcdFx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZShvd25lciwgcmVzb3VyY2UsIGxvY2FsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlT3duZXJzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3J3YXJkTWFya2VycyhyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YTogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0Y29uc3QgYWxsTWFya2VyRGF0YSA9IHRoaXMuX21hcmtlclNlcnZpY2UucmVhZCh7IHJlc291cmNlLCBpZ25vcmVSZXNvdXJjZUZpbHRlcnM6IHRydWUgfSk7XG5cdFx0XHRpZiAoYWxsTWFya2VyRGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0ZGF0YS5wdXNoKFtyZXNvdXJjZSwgW11dKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZvcmVpZ25NYXJrZXJEYXRhID0gYWxsTWFya2VyRGF0YS5maWx0ZXIobWFya2VyID0+IG1hcmtlcj8ub3JpZ2luICE9PSB0aGlzLmV4dEhvc3RJZCk7XG5cdFx0XHRcdGlmIChmb3JlaWduTWFya2VyRGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZGF0YS5wdXNoKFtyZXNvdXJjZSwgZm9yZWlnbk1hcmtlckRhdGFdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0TWFya2Vyc0NoYW5nZShkYXRhKTtcblx0XHR9XG5cdH1cblxuXHQkY2hhbmdlTWFueShvd25lcjogc3RyaW5nLCBlbnRyaWVzOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0Y29uc3QgW3VyaSwgbWFya2Vyc10gPSBlbnRyeTtcblx0XHRcdGlmIChtYXJrZXJzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnMpIHtcblx0XHRcdFx0XHRpZiAobWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCByZWxhdGVkSW5mb3JtYXRpb24gb2YgbWFya2VyLnJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0XHRyZWxhdGVkSW5mb3JtYXRpb24ucmVzb3VyY2UgPSBVUkkucmV2aXZlKHJlbGF0ZWRJbmZvcm1hdGlvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtYXJrZXIuY29kZSAmJiB0eXBlb2YgbWFya2VyLmNvZGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRtYXJrZXIuY29kZS50YXJnZXQgPSBVUkkucmV2aXZlKG1hcmtlci5jb2RlLnRhcmdldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtYXJrZXIub3JpZ2luID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdG1hcmtlci5vcmlnaW4gPSB0aGlzLmV4dEhvc3RJZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX21hcmtlclNlcnZpY2UuY2hhbmdlT25lKG93bmVyLCB0aGlzLl91cmlJZGVudFNlcnZpY2UuYXNDYW5vbmljYWxVcmkoVVJJLnJldml2ZSh1cmkpKSwgbWFya2Vycyk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZU93bmVycy5hZGQob3duZXIpO1xuXHR9XG5cblx0JGNsZWFyKG93bmVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLmNoYW5nZUFsbChvd25lciwgW10pO1xuXHRcdHRoaXMuX2FjdGl2ZU93bmVycy5kZWxldGUob3duZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQWlEO0FBQzFELFNBQVMsV0FBMEI7QUFDbkMsU0FBcUMsYUFB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
