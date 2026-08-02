import { isFalsyOrEmpty, isNonEmptyArray } from "../../../base/common/arrays.js";
import { MicrotaskEmitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { MarkerSeverity } from "./markers.js";
const unsupportedSchemas = /* @__PURE__ */ new Set([
  Schemas.inMemory,
  Schemas.vscodeSourceControl,
  Schemas.walkThrough,
  Schemas.walkThroughSnippet,
  Schemas.vscodeChatCodeBlock,
  Schemas.vscodeTerminal
]);
class DoubleResourceMap {
  constructor() {
    this._byResource = new ResourceMap();
    this._byOwner = /* @__PURE__ */ new Map();
  }
  set(resource, owner, value) {
    let ownerMap = this._byResource.get(resource);
    if (!ownerMap) {
      ownerMap = /* @__PURE__ */ new Map();
      this._byResource.set(resource, ownerMap);
    }
    ownerMap.set(owner, value);
    let resourceMap = this._byOwner.get(owner);
    if (!resourceMap) {
      resourceMap = new ResourceMap();
      this._byOwner.set(owner, resourceMap);
    }
    resourceMap.set(resource, value);
  }
  get(resource, owner) {
    const ownerMap = this._byResource.get(resource);
    return ownerMap?.get(owner);
  }
  delete(resource, owner) {
    let removedA = false;
    let removedB = false;
    const ownerMap = this._byResource.get(resource);
    if (ownerMap) {
      removedA = ownerMap.delete(owner);
    }
    const resourceMap = this._byOwner.get(owner);
    if (resourceMap) {
      removedB = resourceMap.delete(resource);
    }
    if (removedA !== removedB) {
      throw new Error("illegal state");
    }
    return removedA && removedB;
  }
  values(key) {
    if (typeof key === "string") {
      return this._byOwner.get(key)?.values() ?? Iterable.empty();
    }
    if (URI.isUri(key)) {
      return this._byResource.get(key)?.values() ?? Iterable.empty();
    }
    return Iterable.map(Iterable.concat(...this._byOwner.values()), (map) => map[1]);
  }
}
class MarkerStats {
  constructor(service) {
    this.errors = 0;
    this.infos = 0;
    this.warnings = 0;
    this.unknowns = 0;
    this._data = new ResourceMap();
    this._service = service;
    this._subscription = service.onMarkerChanged(this._update, this);
  }
  dispose() {
    this._subscription.dispose();
  }
  _update(resources) {
    for (const resource of resources) {
      const oldStats = this._data.get(resource);
      if (oldStats) {
        this._substract(oldStats);
      }
      const newStats = this._resourceStats(resource);
      this._add(newStats);
      this._data.set(resource, newStats);
    }
  }
  _resourceStats(resource) {
    const result = { errors: 0, warnings: 0, infos: 0, unknowns: 0 };
    if (unsupportedSchemas.has(resource.scheme)) {
      return result;
    }
    for (const { severity } of this._service.read({ resource })) {
      if (severity === MarkerSeverity.Error) {
        result.errors += 1;
      } else if (severity === MarkerSeverity.Warning) {
        result.warnings += 1;
      } else if (severity === MarkerSeverity.Info) {
        result.infos += 1;
      } else {
        result.unknowns += 1;
      }
    }
    return result;
  }
  _substract(op) {
    this.errors -= op.errors;
    this.warnings -= op.warnings;
    this.infos -= op.infos;
    this.unknowns -= op.unknowns;
  }
  _add(op) {
    this.errors += op.errors;
    this.warnings += op.warnings;
    this.infos += op.infos;
    this.unknowns += op.unknowns;
  }
}
class MarkerService {
  constructor() {
    this._onMarkerChanged = new MicrotaskEmitter({
      merge: MarkerService._merge
    });
    this.onMarkerChanged = this._onMarkerChanged.event;
    this._data = new DoubleResourceMap();
    this._stats = new MarkerStats(this);
    this._filteredResources = new ResourceMap();
  }
  dispose() {
    this._stats.dispose();
    this._onMarkerChanged.dispose();
  }
  getStatistics() {
    return this._stats;
  }
  remove(owner, resources) {
    for (const resource of resources || []) {
      this.changeOne(owner, resource, []);
    }
  }
  changeOne(owner, resource, markerData) {
    if (isFalsyOrEmpty(markerData)) {
      const removed = this._data.delete(resource, owner);
      if (removed) {
        this._onMarkerChanged.fire([resource]);
      }
    } else {
      const markers = [];
      for (const data of markerData) {
        const marker = MarkerService._toMarker(owner, resource, data);
        if (marker) {
          markers.push(marker);
        }
      }
      this._data.set(resource, owner, markers);
      this._onMarkerChanged.fire([resource]);
    }
  }
  installResourceFilter(resource, reason) {
    let reasons = this._filteredResources.get(resource);
    if (!reasons) {
      reasons = [];
      this._filteredResources.set(resource, reasons);
    }
    reasons.push(reason);
    this._onMarkerChanged.fire([resource]);
    return toDisposable(() => {
      const reasons2 = this._filteredResources.get(resource);
      if (!reasons2) {
        return;
      }
      const reasonIndex = reasons2.indexOf(reason);
      if (reasonIndex !== -1) {
        reasons2.splice(reasonIndex, 1);
        if (reasons2.length === 0) {
          this._filteredResources.delete(resource);
        }
        this._onMarkerChanged.fire([resource]);
      }
    });
  }
  static _toMarker(owner, resource, data) {
    let {
      code,
      severity,
      message,
      source,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      relatedInformation,
      modelVersionId,
      tags,
      origin
    } = data;
    if (!message) {
      return void 0;
    }
    startLineNumber = startLineNumber > 0 ? startLineNumber : 1;
    startColumn = startColumn > 0 ? startColumn : 1;
    endLineNumber = endLineNumber >= startLineNumber ? endLineNumber : startLineNumber;
    endColumn = endColumn > 0 ? endColumn : startColumn;
    return {
      resource,
      owner,
      code,
      severity,
      message,
      source,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      relatedInformation,
      modelVersionId,
      tags,
      origin
    };
  }
  changeAll(owner, data) {
    const changes = [];
    const existing = this._data.values(owner);
    if (existing) {
      for (const data2 of existing) {
        const first = Iterable.first(data2);
        if (first) {
          changes.push(first.resource);
          this._data.delete(first.resource, owner);
        }
      }
    }
    if (isNonEmptyArray(data)) {
      const groups = new ResourceMap();
      for (const { resource, marker: markerData } of data) {
        const marker = MarkerService._toMarker(owner, resource, markerData);
        if (!marker) {
          continue;
        }
        const array = groups.get(resource);
        if (!array) {
          groups.set(resource, [marker]);
          changes.push(resource);
        } else {
          array.push(marker);
        }
      }
      for (const [resource, value] of groups) {
        this._data.set(resource, owner, value);
      }
    }
    if (changes.length > 0) {
      this._onMarkerChanged.fire(changes);
    }
  }
  /**
   * Creates an information marker for filtered resources
   */
  _createFilteredMarker(resource, reasons) {
    const message = reasons.length === 1 ? localize("filtered", 'Problems are paused because: "{0}"', reasons[0]) : localize("filtered.network", 'Problems are paused because: "{0}" and {1} more', reasons[0], reasons.length - 1);
    return {
      owner: "markersFilter",
      resource,
      severity: MarkerSeverity.Info,
      message,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1
    };
  }
  read(filter = /* @__PURE__ */ Object.create(null)) {
    let { owner, resource, severities, take } = filter;
    if (!take || take < 0) {
      take = -1;
    }
    if (owner && resource) {
      const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : void 0;
      if (reasons?.length) {
        const infoMarker = this._createFilteredMarker(resource, reasons);
        return [infoMarker];
      }
      const data = this._data.get(resource, owner);
      if (!data) {
        return [];
      }
      const result = [];
      for (const marker of data) {
        if (take > 0 && result.length === take) {
          break;
        }
        const reasons2 = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : void 0;
        if (reasons2?.length) {
          result.push(this._createFilteredMarker(resource, reasons2));
        } else if (MarkerService._accept(marker, severities)) {
          result.push(marker);
        }
      }
      return result;
    } else {
      const iterable = !owner && !resource ? this._data.values() : this._data.values(resource ?? owner);
      const result = [];
      const filtered = new ResourceSet();
      for (const markers of iterable) {
        for (const data of markers) {
          if (filtered.has(data.resource)) {
            continue;
          }
          if (take > 0 && result.length === take) {
            break;
          }
          const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(data.resource) : void 0;
          if (reasons?.length) {
            result.push(this._createFilteredMarker(data.resource, reasons));
            filtered.add(data.resource);
          } else if (MarkerService._accept(data, severities)) {
            result.push(data);
          }
        }
      }
      return result;
    }
  }
  static _accept(marker, severities) {
    return severities === void 0 || (severities & marker.severity) === marker.severity;
  }
  // --- event debounce logic
  static _merge(all) {
    const set = new ResourceMap();
    for (const array of all) {
      for (const item of array) {
        set.set(item, true);
      }
    }
    return Array.from(set.keys());
  }
}
export {
  MarkerService,
  unsupportedSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0ZhbHN5T3JFbXB0eSwgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IE1pY3JvdGFza0VtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyRGF0YSwgSU1hcmtlclJlYWRPcHRpb25zLCBJTWFya2VyU2VydmljZSwgSVJlc291cmNlTWFya2VyLCBNYXJrZXJTZXZlcml0eSwgTWFya2VyU3RhdGlzdGljcyB9IGZyb20gJy4vbWFya2Vycy5qcyc7XG5cbmV4cG9ydCBjb25zdCB1bnN1cHBvcnRlZFNjaGVtYXMgPSBuZXcgU2V0KFtcblx0U2NoZW1hcy5pbk1lbW9yeSxcblx0U2NoZW1hcy52c2NvZGVTb3VyY2VDb250cm9sLFxuXHRTY2hlbWFzLndhbGtUaHJvdWdoLFxuXHRTY2hlbWFzLndhbGtUaHJvdWdoU25pcHBldCxcblx0U2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrLFxuXHRTY2hlbWFzLnZzY29kZVRlcm1pbmFsXG5dKTtcblxuY2xhc3MgRG91YmxlUmVzb3VyY2VNYXA8Vj4ge1xuXG5cdHByaXZhdGUgX2J5UmVzb3VyY2UgPSBuZXcgUmVzb3VyY2VNYXA8TWFwPHN0cmluZywgVj4+KCk7XG5cdHByaXZhdGUgX2J5T3duZXIgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VNYXA8Vj4+KCk7XG5cblx0c2V0KHJlc291cmNlOiBVUkksIG93bmVyOiBzdHJpbmcsIHZhbHVlOiBWKSB7XG5cdFx0bGV0IG93bmVyTWFwID0gdGhpcy5fYnlSZXNvdXJjZS5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghb3duZXJNYXApIHtcblx0XHRcdG93bmVyTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0dGhpcy5fYnlSZXNvdXJjZS5zZXQocmVzb3VyY2UsIG93bmVyTWFwKTtcblx0XHR9XG5cdFx0b3duZXJNYXAuc2V0KG93bmVyLCB2YWx1ZSk7XG5cblx0XHRsZXQgcmVzb3VyY2VNYXAgPSB0aGlzLl9ieU93bmVyLmdldChvd25lcik7XG5cdFx0aWYgKCFyZXNvdXJjZU1hcCkge1xuXHRcdFx0cmVzb3VyY2VNYXAgPSBuZXcgUmVzb3VyY2VNYXAoKTtcblx0XHRcdHRoaXMuX2J5T3duZXIuc2V0KG93bmVyLCByZXNvdXJjZU1hcCk7XG5cdFx0fVxuXHRcdHJlc291cmNlTWFwLnNldChyZXNvdXJjZSwgdmFsdWUpO1xuXHR9XG5cblx0Z2V0KHJlc291cmNlOiBVUkksIG93bmVyOiBzdHJpbmcpOiBWIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvd25lck1hcCA9IHRoaXMuX2J5UmVzb3VyY2UuZ2V0KHJlc291cmNlKTtcblx0XHRyZXR1cm4gb3duZXJNYXA/LmdldChvd25lcik7XG5cdH1cblxuXHRkZWxldGUocmVzb3VyY2U6IFVSSSwgb3duZXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGxldCByZW1vdmVkQSA9IGZhbHNlO1xuXHRcdGxldCByZW1vdmVkQiA9IGZhbHNlO1xuXHRcdGNvbnN0IG93bmVyTWFwID0gdGhpcy5fYnlSZXNvdXJjZS5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChvd25lck1hcCkge1xuXHRcdFx0cmVtb3ZlZEEgPSBvd25lck1hcC5kZWxldGUob3duZXIpO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZU1hcCA9IHRoaXMuX2J5T3duZXIuZ2V0KG93bmVyKTtcblx0XHRpZiAocmVzb3VyY2VNYXApIHtcblx0XHRcdHJlbW92ZWRCID0gcmVzb3VyY2VNYXAuZGVsZXRlKHJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKHJlbW92ZWRBICE9PSByZW1vdmVkQikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbGxlZ2FsIHN0YXRlJyk7XG5cdFx0fVxuXHRcdHJldHVybiByZW1vdmVkQSAmJiByZW1vdmVkQjtcblx0fVxuXG5cdHZhbHVlcyhrZXk/OiBVUkkgfCBzdHJpbmcpOiBJdGVyYWJsZTxWPiB7XG5cdFx0aWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnlPd25lci5nZXQoa2V5KT8udmFsdWVzKCkgPz8gSXRlcmFibGUuZW1wdHkoKTtcblx0XHR9XG5cdFx0aWYgKFVSSS5pc1VyaShrZXkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnlSZXNvdXJjZS5nZXQoa2V5KT8udmFsdWVzKCkgPz8gSXRlcmFibGUuZW1wdHkoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gSXRlcmFibGUubWFwKEl0ZXJhYmxlLmNvbmNhdCguLi50aGlzLl9ieU93bmVyLnZhbHVlcygpKSwgbWFwID0+IG1hcFsxXSk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2VyU3RhdHMgaW1wbGVtZW50cyBNYXJrZXJTdGF0aXN0aWNzIHtcblxuXHRlcnJvcnM6IG51bWJlciA9IDA7XG5cdGluZm9zOiBudW1iZXIgPSAwO1xuXHR3YXJuaW5nczogbnVtYmVyID0gMDtcblx0dW5rbm93bnM6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YSA9IG5ldyBSZXNvdXJjZU1hcDxNYXJrZXJTdGF0aXN0aWNzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2aWNlOiBJTWFya2VyU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaXB0aW9uOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3RvcihzZXJ2aWNlOiBJTWFya2VyU2VydmljZSkge1xuXHRcdHRoaXMuX3NlcnZpY2UgPSBzZXJ2aWNlO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbiA9IHNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKHRoaXMuX3VwZGF0ZSwgdGhpcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUocmVzb3VyY2VzOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBvbGRTdGF0cyA9IHRoaXMuX2RhdGEuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChvbGRTdGF0cykge1xuXHRcdFx0XHR0aGlzLl9zdWJzdHJhY3Qob2xkU3RhdHMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV3U3RhdHMgPSB0aGlzLl9yZXNvdXJjZVN0YXRzKHJlc291cmNlKTtcblx0XHRcdHRoaXMuX2FkZChuZXdTdGF0cyk7XG5cdFx0XHR0aGlzLl9kYXRhLnNldChyZXNvdXJjZSwgbmV3U3RhdHMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc291cmNlU3RhdHMocmVzb3VyY2U6IFVSSSk6IE1hcmtlclN0YXRpc3RpY3Mge1xuXHRcdGNvbnN0IHJlc3VsdDogTWFya2VyU3RhdGlzdGljcyA9IHsgZXJyb3JzOiAwLCB3YXJuaW5nczogMCwgaW5mb3M6IDAsIHVua25vd25zOiAwIH07XG5cblx0XHQvLyBUT0RPIHRoaXMgaXMgYSBoYWNrXG5cdFx0aWYgKHVuc3VwcG9ydGVkU2NoZW1hcy5oYXMocmVzb3VyY2Uuc2NoZW1lKSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgc2V2ZXJpdHkgfSBvZiB0aGlzLl9zZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSB9KSkge1xuXHRcdFx0aWYgKHNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRyZXN1bHQuZXJyb3JzICs9IDE7XG5cdFx0XHR9IGVsc2UgaWYgKHNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSB7XG5cdFx0XHRcdHJlc3VsdC53YXJuaW5ncyArPSAxO1xuXHRcdFx0fSBlbHNlIGlmIChzZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuSW5mbykge1xuXHRcdFx0XHRyZXN1bHQuaW5mb3MgKz0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC51bmtub3ducyArPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zdWJzdHJhY3Qob3A6IE1hcmtlclN0YXRpc3RpY3MpIHtcblx0XHR0aGlzLmVycm9ycyAtPSBvcC5lcnJvcnM7XG5cdFx0dGhpcy53YXJuaW5ncyAtPSBvcC53YXJuaW5ncztcblx0XHR0aGlzLmluZm9zIC09IG9wLmluZm9zO1xuXHRcdHRoaXMudW5rbm93bnMgLT0gb3AudW5rbm93bnM7XG5cdH1cblxuXHRwcml2YXRlIF9hZGQob3A6IE1hcmtlclN0YXRpc3RpY3MpIHtcblx0XHR0aGlzLmVycm9ycyArPSBvcC5lcnJvcnM7XG5cdFx0dGhpcy53YXJuaW5ncyArPSBvcC53YXJuaW5ncztcblx0XHR0aGlzLmluZm9zICs9IG9wLmluZm9zO1xuXHRcdHRoaXMudW5rbm93bnMgKz0gb3AudW5rbm93bnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlclNlcnZpY2UgaW1wbGVtZW50cyBJTWFya2VyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NYXJrZXJDaGFuZ2VkID0gbmV3IE1pY3JvdGFza0VtaXR0ZXI8cmVhZG9ubHkgVVJJW10+KHtcblx0XHRtZXJnZTogTWFya2VyU2VydmljZS5fbWVyZ2Vcblx0fSk7XG5cblx0cmVhZG9ubHkgb25NYXJrZXJDaGFuZ2VkID0gdGhpcy5fb25NYXJrZXJDaGFuZ2VkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGEgPSBuZXcgRG91YmxlUmVzb3VyY2VNYXA8SU1hcmtlcltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0cyA9IG5ldyBNYXJrZXJTdGF0cyh0aGlzKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsdGVyZWRSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nW10+KCk7XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0cy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25NYXJrZXJDaGFuZ2VkLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldFN0YXRpc3RpY3MoKTogTWFya2VyU3RhdGlzdGljcyB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRzO1xuXHR9XG5cblx0cmVtb3ZlKG93bmVyOiBzdHJpbmcsIHJlc291cmNlczogVVJJW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcyB8fCBbXSkge1xuXHRcdFx0dGhpcy5jaGFuZ2VPbmUob3duZXIsIHJlc291cmNlLCBbXSk7XG5cdFx0fVxuXHR9XG5cblx0Y2hhbmdlT25lKG93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblxuXHRcdGlmIChpc0ZhbHN5T3JFbXB0eShtYXJrZXJEYXRhKSkge1xuXHRcdFx0Ly8gcmVtb3ZlIG1hcmtlciBmb3IgdGhpcyAob3duZXIscmVzb3VyY2UpLXR1cGxlXG5cdFx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5fZGF0YS5kZWxldGUocmVzb3VyY2UsIG93bmVyKTtcblx0XHRcdGlmIChyZW1vdmVkKSB7XG5cdFx0XHRcdHRoaXMuX29uTWFya2VyQ2hhbmdlZC5maXJlKFtyZXNvdXJjZV0pO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGluc2VydCBtYXJrZXIgZm9yIHRoaXMgKG93bmVyLHJlc291cmNlKS10dXBsZVxuXHRcdFx0Y29uc3QgbWFya2VyczogSU1hcmtlcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgbWFya2VyRGF0YSkge1xuXHRcdFx0XHRjb25zdCBtYXJrZXIgPSBNYXJrZXJTZXJ2aWNlLl90b01hcmtlcihvd25lciwgcmVzb3VyY2UsIGRhdGEpO1xuXHRcdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdFx0bWFya2Vycy5wdXNoKG1hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2RhdGEuc2V0KHJlc291cmNlLCBvd25lciwgbWFya2Vycyk7XG5cdFx0XHR0aGlzLl9vbk1hcmtlckNoYW5nZWQuZmlyZShbcmVzb3VyY2VdKTtcblx0XHR9XG5cdH1cblxuXHRpbnN0YWxsUmVzb3VyY2VGaWx0ZXIocmVzb3VyY2U6IFVSSSwgcmVhc29uOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0bGV0IHJlYXNvbnMgPSB0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0aWYgKCFyZWFzb25zKSB7XG5cdFx0XHRyZWFzb25zID0gW107XG5cdFx0XHR0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5zZXQocmVzb3VyY2UsIHJlYXNvbnMpO1xuXHRcdH1cblx0XHRyZWFzb25zLnB1c2gocmVhc29uKTtcblx0XHR0aGlzLl9vbk1hcmtlckNoYW5nZWQuZmlyZShbcmVzb3VyY2VdKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVhc29ucyA9IHRoaXMuX2ZpbHRlcmVkUmVzb3VyY2VzLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXJlYXNvbnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVhc29uSW5kZXggPSByZWFzb25zLmluZGV4T2YocmVhc29uKTtcblx0XHRcdGlmIChyZWFzb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0cmVhc29ucy5zcGxpY2UocmVhc29uSW5kZXgsIDEpO1xuXHRcdFx0XHRpZiAocmVhc29ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uTWFya2VyQ2hhbmdlZC5maXJlKFtyZXNvdXJjZV0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3RvTWFya2VyKG93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBVUkksIGRhdGE6IElNYXJrZXJEYXRhKTogSU1hcmtlciB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHtcblx0XHRcdGNvZGUsIHNldmVyaXR5LFxuXHRcdFx0bWVzc2FnZSwgc291cmNlLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uLFxuXHRcdFx0cmVsYXRlZEluZm9ybWF0aW9uLFxuXHRcdFx0bW9kZWxWZXJzaW9uSWQsXG5cdFx0XHR0YWdzLCBvcmlnaW5cblx0XHR9ID0gZGF0YTtcblxuXHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBzYW50aXplIGRhdGFcblx0XHRzdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXIgPiAwID8gc3RhcnRMaW5lTnVtYmVyIDogMTtcblx0XHRzdGFydENvbHVtbiA9IHN0YXJ0Q29sdW1uID4gMCA/IHN0YXJ0Q29sdW1uIDogMTtcblx0XHRlbmRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlciA+PSBzdGFydExpbmVOdW1iZXIgPyBlbmRMaW5lTnVtYmVyIDogc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGVuZENvbHVtbiA9IGVuZENvbHVtbiA+IDAgPyBlbmRDb2x1bW4gOiBzdGFydENvbHVtbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdG93bmVyLFxuXHRcdFx0Y29kZSxcblx0XHRcdHNldmVyaXR5LFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHNvdXJjZSxcblx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uLFxuXHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdGVuZENvbHVtbixcblx0XHRcdHJlbGF0ZWRJbmZvcm1hdGlvbixcblx0XHRcdG1vZGVsVmVyc2lvbklkLFxuXHRcdFx0dGFncyxcblx0XHRcdG9yaWdpblxuXHRcdH07XG5cdH1cblxuXHRjaGFuZ2VBbGwob3duZXI6IHN0cmluZywgZGF0YTogSVJlc291cmNlTWFya2VyW10pOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VzOiBVUklbXSA9IFtdO1xuXG5cdFx0Ly8gcmVtb3ZlIG9sZCBtYXJrZXJcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2RhdGEudmFsdWVzKG93bmVyKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBleGlzdGluZykge1xuXHRcdFx0XHRjb25zdCBmaXJzdCA9IEl0ZXJhYmxlLmZpcnN0KGRhdGEpO1xuXHRcdFx0XHRpZiAoZmlyc3QpIHtcblx0XHRcdFx0XHRjaGFuZ2VzLnB1c2goZmlyc3QucmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX2RhdGEuZGVsZXRlKGZpcnN0LnJlc291cmNlLCBvd25lcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBhZGQgbmV3IG1hcmtlcnNcblx0XHRpZiAoaXNOb25FbXB0eUFycmF5KGRhdGEpKSB7XG5cblx0XHRcdC8vIGdyb3VwIGJ5IHJlc291cmNlXG5cdFx0XHRjb25zdCBncm91cHMgPSBuZXcgUmVzb3VyY2VNYXA8SU1hcmtlcltdPigpO1xuXHRcdFx0Zm9yIChjb25zdCB7IHJlc291cmNlLCBtYXJrZXI6IG1hcmtlckRhdGEgfSBvZiBkYXRhKSB7XG5cdFx0XHRcdGNvbnN0IG1hcmtlciA9IE1hcmtlclNlcnZpY2UuX3RvTWFya2VyKG93bmVyLCByZXNvdXJjZSwgbWFya2VyRGF0YSk7XG5cdFx0XHRcdGlmICghbWFya2VyKSB7XG5cdFx0XHRcdFx0Ly8gZmlsdGVyIGJhZCBtYXJrZXJzXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYXJyYXkgPSBncm91cHMuZ2V0KHJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFhcnJheSkge1xuXHRcdFx0XHRcdGdyb3Vwcy5zZXQocmVzb3VyY2UsIFttYXJrZXJdKTtcblx0XHRcdFx0XHRjaGFuZ2VzLnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFycmF5LnB1c2gobWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBpbnNlcnQgYWxsXG5cdFx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgdmFsdWVdIG9mIGdyb3Vwcykge1xuXHRcdFx0XHR0aGlzLl9kYXRhLnNldChyZXNvdXJjZSwgb3duZXIsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbk1hcmtlckNoYW5nZWQuZmlyZShjaGFuZ2VzKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBpbmZvcm1hdGlvbiBtYXJrZXIgZm9yIGZpbHRlcmVkIHJlc291cmNlc1xuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlRmlsdGVyZWRNYXJrZXIocmVzb3VyY2U6IFVSSSwgcmVhc29uczogc3RyaW5nW10pOiBJTWFya2VyIHtcblx0XHRjb25zdCBtZXNzYWdlID0gcmVhc29ucy5sZW5ndGggPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2ZpbHRlcmVkJywgXCJQcm9ibGVtcyBhcmUgcGF1c2VkIGJlY2F1c2U6IFxcXCJ7MH1cXFwiXCIsIHJlYXNvbnNbMF0pXG5cdFx0XHQ6IGxvY2FsaXplKCdmaWx0ZXJlZC5uZXR3b3JrJywgXCJQcm9ibGVtcyBhcmUgcGF1c2VkIGJlY2F1c2U6IFxcXCJ7MH1cXFwiIGFuZCB7MX0gbW9yZVwiLCByZWFzb25zWzBdLCByZWFzb25zLmxlbmd0aCAtIDEpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG93bmVyOiAnbWFya2Vyc0ZpbHRlcicsXG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogMSxcblx0XHRcdGVuZENvbHVtbjogMSxcblx0XHR9O1xuXHR9XG5cblx0cmVhZChmaWx0ZXI6IElNYXJrZXJSZWFkT3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCkpOiBJTWFya2VyW10ge1xuXG5cdFx0bGV0IHsgb3duZXIsIHJlc291cmNlLCBzZXZlcml0aWVzLCB0YWtlIH0gPSBmaWx0ZXI7XG5cblx0XHRpZiAoIXRha2UgfHwgdGFrZSA8IDApIHtcblx0XHRcdHRha2UgPSAtMTtcblx0XHR9XG5cblx0XHRpZiAob3duZXIgJiYgcmVzb3VyY2UpIHtcblx0XHRcdC8vIGV4YWN0bHkgb25lIG93bmVyIEFORCByZXNvdXJjZVxuXHRcdFx0Y29uc3QgcmVhc29ucyA9ICFmaWx0ZXIuaWdub3JlUmVzb3VyY2VGaWx0ZXJzID8gdGhpcy5fZmlsdGVyZWRSZXNvdXJjZXMuZ2V0KHJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZWFzb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgaW5mb01hcmtlciA9IHRoaXMuX2NyZWF0ZUZpbHRlcmVkTWFya2VyKHJlc291cmNlLCByZWFzb25zKTtcblx0XHRcdFx0cmV0dXJuIFtpbmZvTWFya2VyXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RhdGEuZ2V0KHJlc291cmNlLCBvd25lcik7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQ6IElNYXJrZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgZGF0YSkge1xuXHRcdFx0XHRpZiAodGFrZSA+IDAgJiYgcmVzdWx0Lmxlbmd0aCA9PT0gdGFrZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlYXNvbnMgPSAhZmlsdGVyLmlnbm9yZVJlc291cmNlRmlsdGVycyA/IHRoaXMuX2ZpbHRlcmVkUmVzb3VyY2VzLmdldChyZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChyZWFzb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLl9jcmVhdGVGaWx0ZXJlZE1hcmtlcihyZXNvdXJjZSwgcmVhc29ucykpO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoTWFya2VyU2VydmljZS5fYWNjZXB0KG1hcmtlciwgc2V2ZXJpdGllcykpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG9mIG9uZSByZXNvdXJjZSBPUiBvd25lclxuXHRcdFx0Y29uc3QgaXRlcmFibGUgPSAhb3duZXIgJiYgIXJlc291cmNlXG5cdFx0XHRcdD8gdGhpcy5fZGF0YS52YWx1ZXMoKVxuXHRcdFx0XHQ6IHRoaXMuX2RhdGEudmFsdWVzKHJlc291cmNlID8/IG93bmVyISk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSU1hcmtlcltdID0gW107XG5cdFx0XHRjb25zdCBmaWx0ZXJlZCA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IG1hcmtlcnMgb2YgaXRlcmFibGUpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIG1hcmtlcnMpIHtcblx0XHRcdFx0XHRpZiAoZmlsdGVyZWQuaGFzKGRhdGEucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRha2UgPiAwICYmIHJlc3VsdC5sZW5ndGggPT09IHRha2UpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZWFzb25zID0gIWZpbHRlci5pZ25vcmVSZXNvdXJjZUZpbHRlcnMgPyB0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5nZXQoZGF0YS5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHJlYXNvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5fY3JlYXRlRmlsdGVyZWRNYXJrZXIoZGF0YS5yZXNvdXJjZSwgcmVhc29ucykpO1xuXHRcdFx0XHRcdFx0ZmlsdGVyZWQuYWRkKGRhdGEucmVzb3VyY2UpO1xuXG5cdFx0XHRcdFx0fSBlbHNlIGlmIChNYXJrZXJTZXJ2aWNlLl9hY2NlcHQoZGF0YSwgc2V2ZXJpdGllcykpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGRhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYWNjZXB0KG1hcmtlcjogSU1hcmtlciwgc2V2ZXJpdGllcz86IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzZXZlcml0aWVzID09PSB1bmRlZmluZWQgfHwgKHNldmVyaXRpZXMgJiBtYXJrZXIuc2V2ZXJpdHkpID09PSBtYXJrZXIuc2V2ZXJpdHk7XG5cdH1cblxuXHQvLyAtLS0gZXZlbnQgZGVib3VuY2UgbG9naWNcblxuXHRwcml2YXRlIHN0YXRpYyBfbWVyZ2UoYWxsOiAocmVhZG9ubHkgVVJJW10pW10pOiBVUklbXSB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cdFx0Zm9yIChjb25zdCBhcnJheSBvZiBhbGwpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBhcnJheSkge1xuXHRcdFx0XHRzZXQuc2V0KGl0ZW0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShzZXQua2V5cygpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0IsdUJBQXVCO0FBQ2hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBb0Ysc0JBQXdDO0FBRXJILE1BQU0scUJBQXFCLG9CQUFJLElBQUk7QUFBQSxFQUN6QyxRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQ1QsQ0FBQztBQUVELE1BQU0sa0JBQXFCO0FBQUEsRUFBM0I7QUFFQyxTQUFRLGNBQWMsSUFBSSxZQUE0QjtBQUN0RCxTQUFRLFdBQVcsb0JBQUksSUFBNEI7QUFBQTtBQUFBLEVBRW5ELElBQUksVUFBZSxPQUFlLE9BQVU7QUFDM0MsUUFBSSxXQUFXLEtBQUssWUFBWSxJQUFJLFFBQVE7QUFDNUMsUUFBSSxDQUFDLFVBQVU7QUFDZCxpQkFBVyxvQkFBSSxJQUFJO0FBQ25CLFdBQUssWUFBWSxJQUFJLFVBQVUsUUFBUTtBQUFBLElBQ3hDO0FBQ0EsYUFBUyxJQUFJLE9BQU8sS0FBSztBQUV6QixRQUFJLGNBQWMsS0FBSyxTQUFTLElBQUksS0FBSztBQUN6QyxRQUFJLENBQUMsYUFBYTtBQUNqQixvQkFBYyxJQUFJLFlBQVk7QUFDOUIsV0FBSyxTQUFTLElBQUksT0FBTyxXQUFXO0FBQUEsSUFDckM7QUFDQSxnQkFBWSxJQUFJLFVBQVUsS0FBSztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxJQUFJLFVBQWUsT0FBOEI7QUFDaEQsVUFBTSxXQUFXLEtBQUssWUFBWSxJQUFJLFFBQVE7QUFDOUMsV0FBTyxVQUFVLElBQUksS0FBSztBQUFBLEVBQzNCO0FBQUEsRUFFQSxPQUFPLFVBQWUsT0FBd0I7QUFDN0MsUUFBSSxXQUFXO0FBQ2YsUUFBSSxXQUFXO0FBQ2YsVUFBTSxXQUFXLEtBQUssWUFBWSxJQUFJLFFBQVE7QUFDOUMsUUFBSSxVQUFVO0FBQ2IsaUJBQVcsU0FBUyxPQUFPLEtBQUs7QUFBQSxJQUNqQztBQUNBLFVBQU0sY0FBYyxLQUFLLFNBQVMsSUFBSSxLQUFLO0FBQzNDLFFBQUksYUFBYTtBQUNoQixpQkFBVyxZQUFZLE9BQU8sUUFBUTtBQUFBLElBQ3ZDO0FBQ0EsUUFBSSxhQUFhLFVBQVU7QUFDMUIsWUFBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLElBQ2hDO0FBQ0EsV0FBTyxZQUFZO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE9BQU8sS0FBaUM7QUFDdkMsUUFBSSxPQUFPLFFBQVEsVUFBVTtBQUM1QixhQUFPLEtBQUssU0FBUyxJQUFJLEdBQUcsR0FBRyxPQUFPLEtBQUssU0FBUyxNQUFNO0FBQUEsSUFDM0Q7QUFDQSxRQUFJLElBQUksTUFBTSxHQUFHLEdBQUc7QUFDbkIsYUFBTyxLQUFLLFlBQVksSUFBSSxHQUFHLEdBQUcsT0FBTyxLQUFLLFNBQVMsTUFBTTtBQUFBLElBQzlEO0FBRUEsV0FBTyxTQUFTLElBQUksU0FBUyxPQUFPLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxHQUFHLFNBQU8sSUFBSSxDQUFDLENBQUM7QUFBQSxFQUM5RTtBQUNEO0FBRUEsTUFBTSxZQUF3QztBQUFBLEVBVzdDLFlBQVksU0FBeUI7QUFUckMsa0JBQWlCO0FBQ2pCLGlCQUFnQjtBQUNoQixvQkFBbUI7QUFDbkIsb0JBQW1CO0FBRW5CLFNBQWlCLFFBQVEsSUFBSSxZQUE4QjtBQUsxRCxTQUFLLFdBQVc7QUFDaEIsU0FBSyxnQkFBZ0IsUUFBUSxnQkFBZ0IsS0FBSyxTQUFTLElBQUk7QUFBQSxFQUNoRTtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLGNBQWMsUUFBUTtBQUFBLEVBQzVCO0FBQUEsRUFFUSxRQUFRLFdBQWlDO0FBQ2hELGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFlBQU0sV0FBVyxLQUFLLE1BQU0sSUFBSSxRQUFRO0FBQ3hDLFVBQUksVUFBVTtBQUNiLGFBQUssV0FBVyxRQUFRO0FBQUEsTUFDekI7QUFDQSxZQUFNLFdBQVcsS0FBSyxlQUFlLFFBQVE7QUFDN0MsV0FBSyxLQUFLLFFBQVE7QUFDbEIsV0FBSyxNQUFNLElBQUksVUFBVSxRQUFRO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLFVBQWlDO0FBQ3ZELFVBQU0sU0FBMkIsRUFBRSxRQUFRLEdBQUcsVUFBVSxHQUFHLE9BQU8sR0FBRyxVQUFVLEVBQUU7QUFHakYsUUFBSSxtQkFBbUIsSUFBSSxTQUFTLE1BQU0sR0FBRztBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUVBLGVBQVcsRUFBRSxTQUFTLEtBQUssS0FBSyxTQUFTLEtBQUssRUFBRSxTQUFTLENBQUMsR0FBRztBQUM1RCxVQUFJLGFBQWEsZUFBZSxPQUFPO0FBQ3RDLGVBQU8sVUFBVTtBQUFBLE1BQ2xCLFdBQVcsYUFBYSxlQUFlLFNBQVM7QUFDL0MsZUFBTyxZQUFZO0FBQUEsTUFDcEIsV0FBVyxhQUFhLGVBQWUsTUFBTTtBQUM1QyxlQUFPLFNBQVM7QUFBQSxNQUNqQixPQUFPO0FBQ04sZUFBTyxZQUFZO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFdBQVcsSUFBc0I7QUFDeEMsU0FBSyxVQUFVLEdBQUc7QUFDbEIsU0FBSyxZQUFZLEdBQUc7QUFDcEIsU0FBSyxTQUFTLEdBQUc7QUFDakIsU0FBSyxZQUFZLEdBQUc7QUFBQSxFQUNyQjtBQUFBLEVBRVEsS0FBSyxJQUFzQjtBQUNsQyxTQUFLLFVBQVUsR0FBRztBQUNsQixTQUFLLFlBQVksR0FBRztBQUNwQixTQUFLLFNBQVMsR0FBRztBQUNqQixTQUFLLFlBQVksR0FBRztBQUFBLEVBQ3JCO0FBQ0Q7QUFFTyxNQUFNLGNBQXdDO0FBQUEsRUFBOUM7QUFJTixTQUFpQixtQkFBbUIsSUFBSSxpQkFBaUM7QUFBQSxNQUN4RSxPQUFPLGNBQWM7QUFBQSxJQUN0QixDQUFDO0FBRUQsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFFakQsU0FBaUIsUUFBUSxJQUFJLGtCQUE2QjtBQUMxRCxTQUFpQixTQUFTLElBQUksWUFBWSxJQUFJO0FBQzlDLFNBQWlCLHFCQUFxQixJQUFJLFlBQXNCO0FBQUE7QUFBQSxFQUVoRSxVQUFnQjtBQUNmLFNBQUssT0FBTyxRQUFRO0FBQ3BCLFNBQUssaUJBQWlCLFFBQVE7QUFBQSxFQUMvQjtBQUFBLEVBRUEsZ0JBQWtDO0FBQ2pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE9BQU8sT0FBZSxXQUF3QjtBQUM3QyxlQUFXLFlBQVksYUFBYSxDQUFDLEdBQUc7QUFDdkMsV0FBSyxVQUFVLE9BQU8sVUFBVSxDQUFDLENBQUM7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFVBQVUsT0FBZSxVQUFlLFlBQWlDO0FBRXhFLFFBQUksZUFBZSxVQUFVLEdBQUc7QUFFL0IsWUFBTSxVQUFVLEtBQUssTUFBTSxPQUFPLFVBQVUsS0FBSztBQUNqRCxVQUFJLFNBQVM7QUFDWixhQUFLLGlCQUFpQixLQUFLLENBQUMsUUFBUSxDQUFDO0FBQUEsTUFDdEM7QUFBQSxJQUVELE9BQU87QUFFTixZQUFNLFVBQXFCLENBQUM7QUFDNUIsaUJBQVcsUUFBUSxZQUFZO0FBQzlCLGNBQU0sU0FBUyxjQUFjLFVBQVUsT0FBTyxVQUFVLElBQUk7QUFDNUQsWUFBSSxRQUFRO0FBQ1gsa0JBQVEsS0FBSyxNQUFNO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxNQUFNLElBQUksVUFBVSxPQUFPLE9BQU87QUFDdkMsV0FBSyxpQkFBaUIsS0FBSyxDQUFDLFFBQVEsQ0FBQztBQUFBLElBQ3RDO0FBQUEsRUFDRDtBQUFBLEVBRUEsc0JBQXNCLFVBQWUsUUFBNkI7QUFDakUsUUFBSSxVQUFVLEtBQUssbUJBQW1CLElBQUksUUFBUTtBQUVsRCxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLENBQUM7QUFDWCxXQUFLLG1CQUFtQixJQUFJLFVBQVUsT0FBTztBQUFBLElBQzlDO0FBQ0EsWUFBUSxLQUFLLE1BQU07QUFDbkIsU0FBSyxpQkFBaUIsS0FBSyxDQUFDLFFBQVEsQ0FBQztBQUVyQyxXQUFPLGFBQWEsTUFBTTtBQUN6QixZQUFNQSxXQUFVLEtBQUssbUJBQW1CLElBQUksUUFBUTtBQUNwRCxVQUFJLENBQUNBLFVBQVM7QUFDYjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGNBQWNBLFNBQVEsUUFBUSxNQUFNO0FBQzFDLFVBQUksZ0JBQWdCLElBQUk7QUFDdkIsUUFBQUEsU0FBUSxPQUFPLGFBQWEsQ0FBQztBQUM3QixZQUFJQSxTQUFRLFdBQVcsR0FBRztBQUN6QixlQUFLLG1CQUFtQixPQUFPLFFBQVE7QUFBQSxRQUN4QztBQUNBLGFBQUssaUJBQWlCLEtBQUssQ0FBQyxRQUFRLENBQUM7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE9BQWUsVUFBVSxPQUFlLFVBQWUsTUFBd0M7QUFDOUYsUUFBSTtBQUFBLE1BQ0g7QUFBQSxNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQVM7QUFBQSxNQUNUO0FBQUEsTUFBaUI7QUFBQSxNQUFhO0FBQUEsTUFBZTtBQUFBLE1BQzdDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUFNO0FBQUEsSUFDUCxJQUFJO0FBRUosUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUdBLHNCQUFrQixrQkFBa0IsSUFBSSxrQkFBa0I7QUFDMUQsa0JBQWMsY0FBYyxJQUFJLGNBQWM7QUFDOUMsb0JBQWdCLGlCQUFpQixrQkFBa0IsZ0JBQWdCO0FBQ25FLGdCQUFZLFlBQVksSUFBSSxZQUFZO0FBRXhDLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFVLE9BQWUsTUFBK0I7QUFDdkQsVUFBTSxVQUFpQixDQUFDO0FBR3hCLFVBQU0sV0FBVyxLQUFLLE1BQU0sT0FBTyxLQUFLO0FBQ3hDLFFBQUksVUFBVTtBQUNiLGlCQUFXQyxTQUFRLFVBQVU7QUFDNUIsY0FBTSxRQUFRLFNBQVMsTUFBTUEsS0FBSTtBQUNqQyxZQUFJLE9BQU87QUFDVixrQkFBUSxLQUFLLE1BQU0sUUFBUTtBQUMzQixlQUFLLE1BQU0sT0FBTyxNQUFNLFVBQVUsS0FBSztBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLGdCQUFnQixJQUFJLEdBQUc7QUFHMUIsWUFBTSxTQUFTLElBQUksWUFBdUI7QUFDMUMsaUJBQVcsRUFBRSxVQUFVLFFBQVEsV0FBVyxLQUFLLE1BQU07QUFDcEQsY0FBTSxTQUFTLGNBQWMsVUFBVSxPQUFPLFVBQVUsVUFBVTtBQUNsRSxZQUFJLENBQUMsUUFBUTtBQUVaO0FBQUEsUUFDRDtBQUNBLGNBQU0sUUFBUSxPQUFPLElBQUksUUFBUTtBQUNqQyxZQUFJLENBQUMsT0FBTztBQUNYLGlCQUFPLElBQUksVUFBVSxDQUFDLE1BQU0sQ0FBQztBQUM3QixrQkFBUSxLQUFLLFFBQVE7QUFBQSxRQUN0QixPQUFPO0FBQ04sZ0JBQU0sS0FBSyxNQUFNO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBR0EsaUJBQVcsQ0FBQyxVQUFVLEtBQUssS0FBSyxRQUFRO0FBQ3ZDLGFBQUssTUFBTSxJQUFJLFVBQVUsT0FBTyxLQUFLO0FBQUEsTUFDdEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixXQUFLLGlCQUFpQixLQUFLLE9BQU87QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHNCQUFzQixVQUFlLFNBQTRCO0FBQ3hFLFVBQU0sVUFBVSxRQUFRLFdBQVcsSUFDaEMsU0FBUyxZQUFZLHNDQUF3QyxRQUFRLENBQUMsQ0FBQyxJQUN2RSxTQUFTLG9CQUFvQixtREFBcUQsUUFBUSxDQUFDLEdBQUcsUUFBUSxTQUFTLENBQUM7QUFFbkgsV0FBTztBQUFBLE1BQ04sT0FBTztBQUFBLE1BQ1A7QUFBQSxNQUNBLFVBQVUsZUFBZTtBQUFBLE1BQ3pCO0FBQUEsTUFDQSxpQkFBaUI7QUFBQSxNQUNqQixhQUFhO0FBQUEsTUFDYixlQUFlO0FBQUEsTUFDZixXQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQUssU0FBNkIsdUJBQU8sT0FBTyxJQUFJLEdBQWM7QUFFakUsUUFBSSxFQUFFLE9BQU8sVUFBVSxZQUFZLEtBQUssSUFBSTtBQUU1QyxRQUFJLENBQUMsUUFBUSxPQUFPLEdBQUc7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFNBQVMsVUFBVTtBQUV0QixZQUFNLFVBQVUsQ0FBQyxPQUFPLHdCQUF3QixLQUFLLG1CQUFtQixJQUFJLFFBQVEsSUFBSTtBQUN4RixVQUFJLFNBQVMsUUFBUTtBQUNwQixjQUFNLGFBQWEsS0FBSyxzQkFBc0IsVUFBVSxPQUFPO0FBQy9ELGVBQU8sQ0FBQyxVQUFVO0FBQUEsTUFDbkI7QUFFQSxZQUFNLE9BQU8sS0FBSyxNQUFNLElBQUksVUFBVSxLQUFLO0FBQzNDLFVBQUksQ0FBQyxNQUFNO0FBQ1YsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUVBLFlBQU0sU0FBb0IsQ0FBQztBQUMzQixpQkFBVyxVQUFVLE1BQU07QUFDMUIsWUFBSSxPQUFPLEtBQUssT0FBTyxXQUFXLE1BQU07QUFDdkM7QUFBQSxRQUNEO0FBQ0EsY0FBTUQsV0FBVSxDQUFDLE9BQU8sd0JBQXdCLEtBQUssbUJBQW1CLElBQUksUUFBUSxJQUFJO0FBQ3hGLFlBQUlBLFVBQVMsUUFBUTtBQUNwQixpQkFBTyxLQUFLLEtBQUssc0JBQXNCLFVBQVVBLFFBQU8sQ0FBQztBQUFBLFFBRTFELFdBQVcsY0FBYyxRQUFRLFFBQVEsVUFBVSxHQUFHO0FBQ3JELGlCQUFPLEtBQUssTUFBTTtBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUVSLE9BQU87QUFFTixZQUFNLFdBQVcsQ0FBQyxTQUFTLENBQUMsV0FDekIsS0FBSyxNQUFNLE9BQU8sSUFDbEIsS0FBSyxNQUFNLE9BQU8sWUFBWSxLQUFNO0FBRXZDLFlBQU0sU0FBb0IsQ0FBQztBQUMzQixZQUFNLFdBQVcsSUFBSSxZQUFZO0FBRWpDLGlCQUFXLFdBQVcsVUFBVTtBQUMvQixtQkFBVyxRQUFRLFNBQVM7QUFDM0IsY0FBSSxTQUFTLElBQUksS0FBSyxRQUFRLEdBQUc7QUFDaEM7QUFBQSxVQUNEO0FBQ0EsY0FBSSxPQUFPLEtBQUssT0FBTyxXQUFXLE1BQU07QUFDdkM7QUFBQSxVQUNEO0FBQ0EsZ0JBQU0sVUFBVSxDQUFDLE9BQU8sd0JBQXdCLEtBQUssbUJBQW1CLElBQUksS0FBSyxRQUFRLElBQUk7QUFDN0YsY0FBSSxTQUFTLFFBQVE7QUFDcEIsbUJBQU8sS0FBSyxLQUFLLHNCQUFzQixLQUFLLFVBQVUsT0FBTyxDQUFDO0FBQzlELHFCQUFTLElBQUksS0FBSyxRQUFRO0FBQUEsVUFFM0IsV0FBVyxjQUFjLFFBQVEsTUFBTSxVQUFVLEdBQUc7QUFDbkQsbUJBQU8sS0FBSyxJQUFJO0FBQUEsVUFDakI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBZSxRQUFRLFFBQWlCLFlBQThCO0FBQ3JFLFdBQU8sZUFBZSxXQUFjLGFBQWEsT0FBTyxjQUFjLE9BQU87QUFBQSxFQUM5RTtBQUFBO0FBQUEsRUFJQSxPQUFlLE9BQU8sS0FBZ0M7QUFDckQsVUFBTSxNQUFNLElBQUksWUFBcUI7QUFDckMsZUFBVyxTQUFTLEtBQUs7QUFDeEIsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQUksSUFBSSxNQUFNLElBQUk7QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFDQSxXQUFPLE1BQU0sS0FBSyxJQUFJLEtBQUssQ0FBQztBQUFBLEVBQzdCO0FBQ0Q7IiwKICAibmFtZXMiOiBbInJlYXNvbnMiLCAiZGF0YSJdCn0K
