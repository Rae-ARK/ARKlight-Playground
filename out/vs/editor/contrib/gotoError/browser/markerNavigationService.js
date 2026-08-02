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
import { binarySearch2, equals } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { compare } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../common/core/range.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isEqual } from "../../../../base/common/resources.js";
class MarkerCoordinate {
  constructor(marker, index, total) {
    this.marker = marker;
    this.index = index;
    this.total = total;
  }
}
let MarkerList = class {
  constructor(resourceFilter, _markerService, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._dispoables = new DisposableStore();
    this._markers = [];
    this._nextIdx = -1;
    if (URI.isUri(resourceFilter)) {
      this._resourceFilter = (uri) => uri.toString() === resourceFilter.toString();
    } else if (resourceFilter) {
      this._resourceFilter = resourceFilter;
    }
    const compareOrder = this._configService.getValue("problems.sortOrder");
    const compareMarker = (a, b) => {
      let res = compare(a.resource.toString(), b.resource.toString());
      if (res === 0) {
        if (compareOrder === "position") {
          res = Range.compareRangesUsingStarts(a, b) || MarkerSeverity.compare(a.severity, b.severity);
        } else {
          res = MarkerSeverity.compare(a.severity, b.severity) || Range.compareRangesUsingStarts(a, b);
        }
      }
      return res;
    };
    const updateMarker = () => {
      let newMarkers = this._markerService.read({
        resource: URI.isUri(resourceFilter) ? resourceFilter : void 0,
        severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
      });
      if (typeof resourceFilter === "function") {
        newMarkers = newMarkers.filter((m) => this._resourceFilter(m.resource));
      }
      newMarkers.sort(compareMarker);
      if (equals(
        newMarkers,
        this._markers,
        (a, b) => a.resource.toString() === b.resource.toString() && a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn && a.severity === b.severity && a.message === b.message
      )) {
        return false;
      }
      this._markers = newMarkers;
      return true;
    };
    updateMarker();
    this._dispoables.add(_markerService.onMarkerChanged((uris) => {
      if (!this._resourceFilter || uris.some((uri) => this._resourceFilter(uri))) {
        if (updateMarker()) {
          this._nextIdx = -1;
          this._onDidChange.fire();
        }
      }
    }));
  }
  dispose() {
    this._dispoables.dispose();
    this._onDidChange.dispose();
  }
  matches(uri) {
    if (!this._resourceFilter && !uri) {
      return true;
    }
    if (!this._resourceFilter || !uri) {
      return false;
    }
    return this._resourceFilter(uri);
  }
  get selected() {
    const marker = this._markers[this._nextIdx];
    return marker && new MarkerCoordinate(marker, this._nextIdx + 1, this._markers.length);
  }
  _initIdx(model, position, fwd) {
    let idx = this._markers.findIndex((marker) => isEqual(marker.resource, model.uri));
    if (idx < 0) {
      idx = binarySearch2(this._markers.length, (idx2) => compare(this._markers[idx2].resource.toString(), model.uri.toString()));
      if (idx < 0) {
        idx = ~idx;
      }
      if (fwd) {
        this._nextIdx = idx;
      } else {
        this._nextIdx = (this._markers.length + idx - 1) % this._markers.length;
      }
    } else {
      let found = false;
      let wentPast = false;
      for (let i = idx; i < this._markers.length; i++) {
        let range = Range.lift(this._markers[i]);
        if (range.isEmpty()) {
          const word = model.getWordAtPosition(range.getStartPosition());
          if (word) {
            range = new Range(range.startLineNumber, word.startColumn, range.startLineNumber, word.endColumn);
          }
        }
        if (position && (range.containsPosition(position) || position.isBeforeOrEqual(range.getStartPosition()))) {
          this._nextIdx = i;
          found = true;
          wentPast = !range.containsPosition(position);
          break;
        }
        if (this._markers[i].resource.toString() !== model.uri.toString()) {
          break;
        }
      }
      if (!found) {
        this._nextIdx = fwd ? 0 : this._markers.length - 1;
      } else if (wentPast && !fwd) {
        this._nextIdx -= 1;
      }
    }
    if (this._nextIdx < 0) {
      this._nextIdx = this._markers.length - 1;
    }
  }
  resetIndex() {
    this._nextIdx = -1;
  }
  move(fwd, model, position) {
    if (this._markers.length === 0) {
      return false;
    }
    const oldIdx = this._nextIdx;
    if (this._nextIdx === -1) {
      this._initIdx(model, position, fwd);
    } else if (fwd) {
      this._nextIdx = (this._nextIdx + 1) % this._markers.length;
    } else if (!fwd) {
      this._nextIdx = (this._nextIdx - 1 + this._markers.length) % this._markers.length;
    }
    if (oldIdx !== this._nextIdx) {
      return true;
    }
    return false;
  }
  find(uri, position) {
    let idx = this._markers.findIndex((marker) => marker.resource.toString() === uri.toString());
    if (idx < 0) {
      return void 0;
    }
    for (; idx < this._markers.length; idx++) {
      if (Range.containsPosition(this._markers[idx], position)) {
        return new MarkerCoordinate(this._markers[idx], idx + 1, this._markers.length);
      }
    }
    return void 0;
  }
};
MarkerList = __decorateClass([
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService)
], MarkerList);
const IMarkerNavigationService = createDecorator("IMarkerNavigationService");
let MarkerNavigationService = class {
  constructor(_markerService, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._provider = new LinkedList();
  }
  registerProvider(provider) {
    const remove = this._provider.unshift(provider);
    return toDisposable(() => remove());
  }
  getMarkerList(resource) {
    for (const provider of this._provider) {
      const result = provider.getMarkerList(resource);
      if (result) {
        return result;
      }
    }
    return new MarkerList(resource, this._markerService, this._configService);
  }
};
MarkerNavigationService = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IConfigurationService)
], MarkerNavigationService);
registerSingleton(IMarkerNavigationService, MarkerNavigationService, InstantiationType.Delayed);
export {
  IMarkerNavigationService,
  MarkerCoordinate,
  MarkerList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2dvdG9FcnJvci9icm93c2VyL21hcmtlck5hdmlnYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYmluYXJ5U2VhcmNoMiwgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IGNvbXBhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTWFya2VyQ29vcmRpbmF0ZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG1hcmtlcjogSU1hcmtlcixcblx0XHRyZWFkb25seSBpbmRleDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHRvdGFsOiBudW1iZXJcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlckxpc3Qge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VGaWx0ZXI/OiAodXJpOiBVUkkpID0+IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3BvYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBfbWFya2VyczogSU1hcmtlcltdID0gW107XG5cdHByaXZhdGUgX25leHRJZHg6IG51bWJlciA9IC0xO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlc291cmNlRmlsdGVyOiBVUkkgfCAoKHVyaTogVVJJKSA9PiBib29sZWFuKSB8IHVuZGVmaW5lZCxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2VGaWx0ZXIpKSB7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZUZpbHRlciA9IHVyaSA9PiB1cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2VGaWx0ZXIudG9TdHJpbmcoKTtcblx0XHR9IGVsc2UgaWYgKHJlc291cmNlRmlsdGVyKSB7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZUZpbHRlciA9IHJlc291cmNlRmlsdGVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXBhcmVPcmRlciA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPigncHJvYmxlbXMuc29ydE9yZGVyJyk7XG5cdFx0Y29uc3QgY29tcGFyZU1hcmtlciA9IChhOiBJTWFya2VyLCBiOiBJTWFya2VyKTogbnVtYmVyID0+IHtcblx0XHRcdGxldCByZXMgPSBjb21wYXJlKGEucmVzb3VyY2UudG9TdHJpbmcoKSwgYi5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChyZXMgPT09IDApIHtcblx0XHRcdFx0aWYgKGNvbXBhcmVPcmRlciA9PT0gJ3Bvc2l0aW9uJykge1xuXHRcdFx0XHRcdHJlcyA9IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLCBiKSB8fCBNYXJrZXJTZXZlcml0eS5jb21wYXJlKGEuc2V2ZXJpdHksIGIuc2V2ZXJpdHkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlcyA9IE1hcmtlclNldmVyaXR5LmNvbXBhcmUoYS5zZXZlcml0eSwgYi5zZXZlcml0eSkgfHwgUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEsIGIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVNYXJrZXIgPSAoKSA9PiB7XG5cdFx0XHRsZXQgbmV3TWFya2VycyA9IHRoaXMuX21hcmtlclNlcnZpY2UucmVhZCh7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuaXNVcmkocmVzb3VyY2VGaWx0ZXIpID8gcmVzb3VyY2VGaWx0ZXIgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB8IE1hcmtlclNldmVyaXR5LkluZm9cblx0XHRcdH0pO1xuXHRcdFx0aWYgKHR5cGVvZiByZXNvdXJjZUZpbHRlciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRuZXdNYXJrZXJzID0gbmV3TWFya2Vycy5maWx0ZXIobSA9PiB0aGlzLl9yZXNvdXJjZUZpbHRlciEobS5yZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdFx0bmV3TWFya2Vycy5zb3J0KGNvbXBhcmVNYXJrZXIpO1xuXG5cdFx0XHRpZiAoZXF1YWxzKG5ld01hcmtlcnMsIHRoaXMuX21hcmtlcnMsIChhLCBiKSA9PlxuXHRcdFx0XHRhLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGIucmVzb3VyY2UudG9TdHJpbmcoKVxuXHRcdFx0XHQmJiBhLnN0YXJ0TGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXJcblx0XHRcdFx0JiYgYS5zdGFydENvbHVtbiA9PT0gYi5zdGFydENvbHVtblxuXHRcdFx0XHQmJiBhLmVuZExpbmVOdW1iZXIgPT09IGIuZW5kTGluZU51bWJlclxuXHRcdFx0XHQmJiBhLmVuZENvbHVtbiA9PT0gYi5lbmRDb2x1bW5cblx0XHRcdFx0JiYgYS5zZXZlcml0eSA9PT0gYi5zZXZlcml0eVxuXHRcdFx0XHQmJiBhLm1lc3NhZ2UgPT09IGIubWVzc2FnZVxuXHRcdFx0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX21hcmtlcnMgPSBuZXdNYXJrZXJzO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZU1hcmtlcigpO1xuXG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5hZGQoX21hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKHVyaXMgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9yZXNvdXJjZUZpbHRlciB8fCB1cmlzLnNvbWUodXJpID0+IHRoaXMuX3Jlc291cmNlRmlsdGVyISh1cmkpKSkge1xuXHRcdFx0XHRpZiAodXBkYXRlTWFya2VyKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9uZXh0SWR4ID0gLTE7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRtYXRjaGVzKHVyaTogVVJJIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCF0aGlzLl9yZXNvdXJjZUZpbHRlciAmJiAhdXJpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9yZXNvdXJjZUZpbHRlciB8fCAhdXJpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZUZpbHRlcih1cmkpO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkKCk6IE1hcmtlckNvb3JkaW5hdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuX21hcmtlcnNbdGhpcy5fbmV4dElkeF07XG5cdFx0cmV0dXJuIG1hcmtlciAmJiBuZXcgTWFya2VyQ29vcmRpbmF0ZShtYXJrZXIsIHRoaXMuX25leHRJZHggKyAxLCB0aGlzLl9tYXJrZXJzLmxlbmd0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0SWR4KG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIGZ3ZDogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0bGV0IGlkeCA9IHRoaXMuX21hcmtlcnMuZmluZEluZGV4KG1hcmtlciA9PiBpc0VxdWFsKG1hcmtlci5yZXNvdXJjZSwgbW9kZWwudXJpKSk7XG5cdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdC8vIGlnbm9yZSBtb2RlbCwgcG9zaXRpb24gYmVjYXVzZSB0aGlzIHdpbGwgYmUgYSBkaWZmZXJlbnQgZmlsZVxuXHRcdFx0aWR4ID0gYmluYXJ5U2VhcmNoMih0aGlzLl9tYXJrZXJzLmxlbmd0aCwgaWR4ID0+IGNvbXBhcmUodGhpcy5fbWFya2Vyc1tpZHhdLnJlc291cmNlLnRvU3RyaW5nKCksIG1vZGVsLnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0XHRpZHggPSB+aWR4O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZ3ZCkge1xuXHRcdFx0XHR0aGlzLl9uZXh0SWR4ID0gaWR4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbmV4dElkeCA9ICh0aGlzLl9tYXJrZXJzLmxlbmd0aCArIGlkeCAtIDEpICUgdGhpcy5fbWFya2Vycy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGZpbmQgbWFya2VyIGZvciBmaWxlXG5cdFx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRcdGxldCB3ZW50UGFzdCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IGlkeDsgaSA8IHRoaXMuX21hcmtlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bGV0IHJhbmdlID0gUmFuZ2UubGlmdCh0aGlzLl9tYXJrZXJzW2ldKTtcblxuXHRcdFx0XHRpZiAocmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0aWYgKHdvcmQpIHtcblx0XHRcdFx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHBvc2l0aW9uICYmIChyYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSB8fCBwb3NpdGlvbi5pc0JlZm9yZU9yRXF1YWwocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSkpIHtcblx0XHRcdFx0XHR0aGlzLl9uZXh0SWR4ID0gaTtcblx0XHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0d2VudFBhc3QgPSAhcmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fbWFya2Vyc1tpXS5yZXNvdXJjZS50b1N0cmluZygpICE9PSBtb2RlbC51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZm91bmQpIHtcblx0XHRcdFx0Ly8gYWZ0ZXIgdGhlIGxhc3QgY2hhbmdlXG5cdFx0XHRcdHRoaXMuX25leHRJZHggPSBmd2QgPyAwIDogdGhpcy5fbWFya2Vycy5sZW5ndGggLSAxO1xuXHRcdFx0fSBlbHNlIGlmICh3ZW50UGFzdCAmJiAhZndkKSB7XG5cdFx0XHRcdC8vIHdlIHdlbnQgcGFzdCBhbmQgaGF2ZSB0byBnbyBvbmUgYmFja1xuXHRcdFx0XHR0aGlzLl9uZXh0SWR4IC09IDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX25leHRJZHggPCAwKSB7XG5cdFx0XHR0aGlzLl9uZXh0SWR4ID0gdGhpcy5fbWFya2Vycy5sZW5ndGggLSAxO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0SW5kZXgoKSB7XG5cdFx0dGhpcy5fbmV4dElkeCA9IC0xO1xuXHR9XG5cblx0bW92ZShmd2Q6IGJvb2xlYW4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbWFya2Vycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRJZHggPSB0aGlzLl9uZXh0SWR4O1xuXHRcdGlmICh0aGlzLl9uZXh0SWR4ID09PSAtMSkge1xuXHRcdFx0dGhpcy5faW5pdElkeChtb2RlbCwgcG9zaXRpb24sIGZ3ZCk7XG5cdFx0fSBlbHNlIGlmIChmd2QpIHtcblx0XHRcdHRoaXMuX25leHRJZHggPSAodGhpcy5fbmV4dElkeCArIDEpICUgdGhpcy5fbWFya2Vycy5sZW5ndGg7XG5cdFx0fSBlbHNlIGlmICghZndkKSB7XG5cdFx0XHR0aGlzLl9uZXh0SWR4ID0gKHRoaXMuX25leHRJZHggLSAxICsgdGhpcy5fbWFya2Vycy5sZW5ndGgpICUgdGhpcy5fbWFya2Vycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0aWYgKG9sZElkeCAhPT0gdGhpcy5fbmV4dElkeCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZpbmQodXJpOiBVUkksIHBvc2l0aW9uOiBQb3NpdGlvbik6IE1hcmtlckNvb3JkaW5hdGUgfCB1bmRlZmluZWQge1xuXHRcdGxldCBpZHggPSB0aGlzLl9tYXJrZXJzLmZpbmRJbmRleChtYXJrZXIgPT4gbWFya2VyLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKTtcblx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yICg7IGlkeCA8IHRoaXMuX21hcmtlcnMubGVuZ3RoOyBpZHgrKykge1xuXHRcdFx0aWYgKFJhbmdlLmNvbnRhaW5zUG9zaXRpb24odGhpcy5fbWFya2Vyc1tpZHhdLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZXJDb29yZGluYXRlKHRoaXMuX21hcmtlcnNbaWR4XSwgaWR4ICsgMSwgdGhpcy5fbWFya2Vycy5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlPignSU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyOiBJTWFya2VyTGlzdFByb3ZpZGVyKTogSURpc3Bvc2FibGU7XG5cdGdldE1hcmtlckxpc3QocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IE1hcmtlckxpc3Q7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1hcmtlckxpc3RQcm92aWRlciB7XG5cdGdldE1hcmtlckxpc3QocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IE1hcmtlckxpc3QgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIE1hcmtlck5hdmlnYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlLCBJTWFya2VyTGlzdFByb3ZpZGVyIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXIgPSBuZXcgTGlua2VkTGlzdDxJTWFya2VyTGlzdFByb3ZpZGVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZWdpc3RlclByb3ZpZGVyKHByb3ZpZGVyOiBJTWFya2VyTGlzdFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuX3Byb3ZpZGVyLnVuc2hpZnQocHJvdmlkZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcmVtb3ZlKCkpO1xuXHR9XG5cblx0Z2V0TWFya2VyTGlzdChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogTWFya2VyTGlzdCB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcHJvdmlkZXIuZ2V0TWFya2VyTGlzdChyZXNvdXJjZSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIGRlZmF1bHRcblx0XHRyZXR1cm4gbmV3IE1hcmtlckxpc3QocmVzb3VyY2UsIHRoaXMuX21hcmtlclNlcnZpY2UsIHRoaXMuX2NvbmZpZ1NlcnZpY2UpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElNYXJrZXJOYXZpZ2F0aW9uU2VydmljZSwgTWFya2VyTmF2aWdhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWUsY0FBYztBQUN0QyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsYUFBYTtBQUV0QixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBa0IsZ0JBQWdCLHNCQUFzQjtBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFFakIsTUFBTSxpQkFBaUI7QUFBQSxFQUM3QixZQUNVLFFBQ0EsT0FDQSxPQUNSO0FBSFE7QUFDQTtBQUNBO0FBQUEsRUFDTjtBQUNMO0FBRU8sSUFBTSxhQUFOLE1BQWlCO0FBQUEsRUFXdkIsWUFDQyxnQkFDaUMsZ0JBQ08sZ0JBQ3ZDO0FBRmdDO0FBQ087QUFaekMsU0FBaUIsZUFBZSxJQUFJLFFBQWM7QUFDbEQsU0FBUyxjQUEyQixLQUFLLGFBQWE7QUFHdEQsU0FBaUIsY0FBYyxJQUFJLGdCQUFnQjtBQUVuRCxTQUFRLFdBQXNCLENBQUM7QUFDL0IsU0FBUSxXQUFtQjtBQU8xQixRQUFJLElBQUksTUFBTSxjQUFjLEdBQUc7QUFDOUIsV0FBSyxrQkFBa0IsU0FBTyxJQUFJLFNBQVMsTUFBTSxlQUFlLFNBQVM7QUFBQSxJQUMxRSxXQUFXLGdCQUFnQjtBQUMxQixXQUFLLGtCQUFrQjtBQUFBLElBQ3hCO0FBRUEsVUFBTSxlQUFlLEtBQUssZUFBZSxTQUFp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
