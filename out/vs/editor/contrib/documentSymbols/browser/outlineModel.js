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
import { binarySearch, coalesceInPlace, equals } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LRUCache } from "../../../../base/common/map.js";
import { commonPrefixLength } from "../../../../base/common/strings.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IModelService } from "../../../common/services/model.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
class TreeElement {
  remove() {
    this.parent?.children.delete(this.id);
  }
  static findId(candidate, container) {
    let candidateId;
    if (typeof candidate === "string") {
      candidateId = `${container.id}/${candidate}`;
    } else {
      candidateId = `${container.id}/${candidate.name}`;
      if (container.children.get(candidateId) !== void 0) {
        candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`;
      }
    }
    let id = candidateId;
    for (let i = 0; container.children.get(id) !== void 0; i++) {
      id = `${candidateId}_${i}`;
    }
    return id;
  }
  static getElementById(id, element) {
    if (!id) {
      return void 0;
    }
    const len = commonPrefixLength(id, element.id);
    if (len === id.length) {
      return element;
    }
    if (len < element.id.length) {
      return void 0;
    }
    for (const [, child] of element.children) {
      const candidate = TreeElement.getElementById(id, child);
      if (candidate) {
        return candidate;
      }
    }
    return void 0;
  }
  static size(element) {
    let res = 1;
    for (const [, child] of element.children) {
      res += TreeElement.size(child);
    }
    return res;
  }
  static empty(element) {
    return element.children.size === 0;
  }
}
class OutlineElement extends TreeElement {
  constructor(id, parent, symbol) {
    super();
    this.id = id;
    this.parent = parent;
    this.symbol = symbol;
    this.children = /* @__PURE__ */ new Map();
  }
}
class OutlineGroup extends TreeElement {
  constructor(id, parent, label, order) {
    super();
    this.id = id;
    this.parent = parent;
    this.label = label;
    this.order = order;
    this.children = /* @__PURE__ */ new Map();
  }
  getItemEnclosingPosition(position) {
    return position ? this._getItemEnclosingPosition(position, this.children) : void 0;
  }
  _getItemEnclosingPosition(position, children) {
    for (const [, item] of children) {
      if (!item.symbol.range || !Range.containsPosition(item.symbol.range, position)) {
        continue;
      }
      return this._getItemEnclosingPosition(position, item.children) || item;
    }
    return void 0;
  }
  updateMarker(marker) {
    for (const [, child] of this.children) {
      this._updateMarker(marker, child);
    }
  }
  _updateMarker(markers, item) {
    item.marker = void 0;
    const idx = binarySearch(markers, item.symbol.range, Range.compareRangesUsingStarts);
    let start;
    if (idx < 0) {
      start = ~idx;
      if (start > 0 && Range.areIntersecting(markers[start - 1], item.symbol.range)) {
        start -= 1;
      }
    } else {
      start = idx;
    }
    const myMarkers = [];
    let myTopSev;
    for (; start < markers.length && Range.areIntersecting(item.symbol.range, markers[start]); start++) {
      const marker = markers[start];
      myMarkers.push(marker);
      markers[start] = void 0;
      if (!myTopSev || marker.severity > myTopSev) {
        myTopSev = marker.severity;
      }
    }
    for (const [, child] of item.children) {
      this._updateMarker(myMarkers, child);
    }
    if (myTopSev) {
      item.marker = {
        count: myMarkers.length,
        topSev: myTopSev
      };
    }
    coalesceInPlace(markers);
  }
}
class OutlineModel extends TreeElement {
  constructor(uri) {
    super();
    this.uri = uri;
    this.id = "root";
    this.parent = void 0;
    this._groups = /* @__PURE__ */ new Map();
    this.children = /* @__PURE__ */ new Map();
    this.id = "root";
    this.parent = void 0;
  }
  static create(registry, textModel, token) {
    const cts = new CancellationTokenSource(token);
    const result = new OutlineModel(textModel.uri);
    const provider = registry.ordered(textModel);
    const promises = provider.map((provider2, index) => {
      const id = TreeElement.findId(`provider_${index}`, result);
      const group = new OutlineGroup(id, result, provider2.displayName ?? "Unknown Outline Provider", index);
      return Promise.resolve(provider2.provideDocumentSymbols(textModel, cts.token)).then((result2) => {
        for (const info of result2 || []) {
          OutlineModel._makeOutlineElement(info, group);
        }
        return group;
      }, (err) => {
        onUnexpectedExternalError(err);
        return group;
      }).then((group2) => {
        if (!TreeElement.empty(group2)) {
          result._groups.set(id, group2);
        } else {
          group2.remove();
        }
      });
    });
    const listener = registry.onDidChange(() => {
      const newProvider = registry.ordered(textModel);
      if (!equals(newProvider, provider)) {
        cts.cancel();
      }
    });
    return Promise.all(promises).then(() => {
      if (cts.token.isCancellationRequested && !token.isCancellationRequested) {
        return OutlineModel.create(registry, textModel, token);
      } else {
        return result._compact();
      }
    }).finally(() => {
      cts.dispose();
      listener.dispose();
      cts.dispose();
    });
  }
  static _makeOutlineElement(info, container) {
    const id = TreeElement.findId(info, container);
    const res = new OutlineElement(id, container, info);
    if (info.children) {
      for (const childInfo of info.children) {
        OutlineModel._makeOutlineElement(childInfo, res);
      }
    }
    container.children.set(res.id, res);
  }
  static get(element) {
    while (element) {
      if (element instanceof OutlineModel) {
        return element;
      }
      element = element.parent;
    }
    return void 0;
  }
  _compact() {
    let count = 0;
    for (const [key, group] of this._groups) {
      if (group.children.size === 0) {
        this._groups.delete(key);
      } else {
        count += 1;
      }
    }
    if (count !== 1) {
      this.children = this._groups;
    } else {
      const group = Iterable.first(this._groups.values());
      for (const [, child] of group.children) {
        child.parent = this;
        this.children.set(child.id, child);
      }
    }
    return this;
  }
  merge(other) {
    if (this.uri.toString() !== other.uri.toString()) {
      return false;
    }
    if (this._groups.size !== other._groups.size) {
      return false;
    }
    this._groups = other._groups;
    this.children = other.children;
    return true;
  }
  getItemEnclosingPosition(position, context) {
    let preferredGroup;
    if (context) {
      let candidate = context.parent;
      while (candidate && !preferredGroup) {
        if (candidate instanceof OutlineGroup) {
          preferredGroup = candidate;
        }
        candidate = candidate.parent;
      }
    }
    let result = void 0;
    for (const [, group] of this._groups) {
      result = group.getItemEnclosingPosition(position);
      if (result && (!preferredGroup || preferredGroup === group)) {
        break;
      }
    }
    return result;
  }
  getItemById(id) {
    return TreeElement.getElementById(id, this);
  }
  updateMarker(marker) {
    marker.sort(Range.compareRangesUsingStarts);
    for (const [, group] of this._groups) {
      group.updateMarker(marker.slice(0));
    }
  }
  getTopLevelSymbols() {
    const roots = [];
    for (const child of this.children.values()) {
      if (child instanceof OutlineElement) {
        roots.push(child.symbol);
      } else {
        roots.push(...Iterable.map(child.children.values(), (child2) => child2.symbol));
      }
    }
    return roots.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  }
  asListOfDocumentSymbols() {
    const roots = this.getTopLevelSymbols();
    const bucket = [];
    OutlineModel._flattenDocumentSymbols(bucket, roots, "");
    return bucket.sort(
      (a, b) => Position.compare(Range.getStartPosition(a.range), Range.getStartPosition(b.range)) || Position.compare(Range.getEndPosition(b.range), Range.getEndPosition(a.range))
    );
  }
  static _flattenDocumentSymbols(bucket, entries, overrideContainerLabel) {
    for (const entry of entries) {
      bucket.push({
        kind: entry.kind,
        tags: entry.tags,
        name: entry.name,
        detail: entry.detail,
        containerName: entry.containerName || overrideContainerLabel,
        range: entry.range,
        selectionRange: entry.selectionRange,
        children: void 0
        // we flatten it...
      });
      if (entry.children) {
        OutlineModel._flattenDocumentSymbols(bucket, entry.children, entry.name);
      }
    }
  }
}
const IOutlineModelService = createDecorator("IOutlineModelService");
let OutlineModelService = class {
  constructor(_languageFeaturesService, debounces, modelService) {
    this._languageFeaturesService = _languageFeaturesService;
    this._disposables = new DisposableStore();
    this._cache = new LRUCache(15, 0.7);
    this._debounceInformation = debounces.for(_languageFeaturesService.documentSymbolProvider, "DocumentSymbols", { min: 350 });
    this._disposables.add(modelService.onModelRemoved((textModel) => {
      this._cache.delete(textModel.id);
    }));
  }
  dispose() {
    this._disposables.dispose();
  }
  async getOrCreate(textModel, token) {
    const registry = this._languageFeaturesService.documentSymbolProvider;
    const provider = registry.ordered(textModel);
    let data = this._cache.get(textModel.id);
    if (!data || data.versionId !== textModel.getVersionId() || !equals(data.provider, provider)) {
      const source = new CancellationTokenSource();
      data = {
        versionId: textModel.getVersionId(),
        provider,
        promiseCnt: 0,
        source,
        promise: OutlineModel.create(registry, textModel, source.token),
        model: void 0
      };
      this._cache.set(textModel.id, data);
      const now = Date.now();
      data.promise.then((outlineModel) => {
        data.model = outlineModel;
        this._debounceInformation.update(textModel, Date.now() - now);
      }).catch((_err) => {
        this._cache.delete(textModel.id);
      });
    }
    if (data.model) {
      return data.model;
    }
    data.promiseCnt += 1;
    const listener = token.onCancellationRequested(() => {
      if (--data.promiseCnt === 0) {
        data.source.cancel();
        this._cache.delete(textModel.id);
      }
    });
    try {
      return await data.promise;
    } finally {
      listener.dispose();
    }
  }
  getDebounceValue(textModel) {
    return this._debounceInformation.get(textModel);
  }
  getCachedModels() {
    return Iterable.filter(Iterable.map(this._cache.values(), (entry) => entry.model), (model) => model !== void 0);
  }
};
OutlineModelService = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, ILanguageFeatureDebounceService),
  __decorateParam(2, IModelService)
], OutlineModelService);
registerSingleton(IOutlineModelService, OutlineModelService, InstantiationType.Delayed);
export {
  IOutlineModelService,
  OutlineElement,
  OutlineGroup,
  OutlineModel,
  OutlineModelService,
  TreeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGJpbmFyeVNlYXJjaCwgY29hbGVzY2VJblBsYWNlLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjb21tb25QcmVmaXhMZW5ndGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRTeW1ib2wsIERvY3VtZW50U3ltYm9sUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFRyZWVFbGVtZW50IHtcblxuXHRhYnN0cmFjdCBpZDogc3RyaW5nO1xuXHRhYnN0cmFjdCBjaGlsZHJlbjogTWFwPHN0cmluZywgVHJlZUVsZW1lbnQ+O1xuXHRhYnN0cmFjdCBwYXJlbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHJlbW92ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBhcmVudD8uY2hpbGRyZW4uZGVsZXRlKHRoaXMuaWQpO1xuXHR9XG5cblx0c3RhdGljIGZpbmRJZChjYW5kaWRhdGU6IERvY3VtZW50U3ltYm9sIHwgc3RyaW5nLCBjb250YWluZXI6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHQvLyBjb21wbGV4IGlkLWNvbXB1dGF0aW9uIHdoaWNoIGNvbnRhaW5zIHRoZSBvcmlnaW4vZXh0ZW5zaW9uLFxuXHRcdC8vIHRoZSBwYXJlbnQgcGF0aCwgYW5kIHNvbWUgZGVkdXBlIGxvZ2ljIHdoZW4gbmFtZXMgY29sbGlkZVxuXHRcdGxldCBjYW5kaWRhdGVJZDogc3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgY2FuZGlkYXRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y2FuZGlkYXRlSWQgPSBgJHtjb250YWluZXIuaWR9LyR7Y2FuZGlkYXRlfWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNhbmRpZGF0ZUlkID0gYCR7Y29udGFpbmVyLmlkfS8ke2NhbmRpZGF0ZS5uYW1lfWA7XG5cdFx0XHRpZiAoY29udGFpbmVyLmNoaWxkcmVuLmdldChjYW5kaWRhdGVJZCkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjYW5kaWRhdGVJZCA9IGAke2NvbnRhaW5lci5pZH0vJHtjYW5kaWRhdGUubmFtZX1fJHtjYW5kaWRhdGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfV8ke2NhbmRpZGF0ZS5yYW5nZS5zdGFydENvbHVtbn1gO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBpZCA9IGNhbmRpZGF0ZUlkO1xuXHRcdGZvciAobGV0IGkgPSAwOyBjb250YWluZXIuY2hpbGRyZW4uZ2V0KGlkKSAhPT0gdW5kZWZpbmVkOyBpKyspIHtcblx0XHRcdGlkID0gYCR7Y2FuZGlkYXRlSWR9XyR7aX1gO1xuXHRcdH1cblxuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdHN0YXRpYyBnZXRFbGVtZW50QnlJZChpZDogc3RyaW5nLCBlbGVtZW50OiBUcmVlRWxlbWVudCk6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsZW4gPSBjb21tb25QcmVmaXhMZW5ndGgoaWQsIGVsZW1lbnQuaWQpO1xuXHRcdGlmIChsZW4gPT09IGlkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXHRcdGlmIChsZW4gPCBlbGVtZW50LmlkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBUcmVlRWxlbWVudC5nZXRFbGVtZW50QnlJZChpZCwgY2hpbGQpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0c3RhdGljIHNpemUoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGxldCByZXMgPSAxO1xuXHRcdGZvciAoY29uc3QgWywgY2hpbGRdIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcblx0XHRcdHJlcyArPSBUcmVlRWxlbWVudC5zaXplKGNoaWxkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdHN0YXRpYyBlbXB0eShlbGVtZW50OiBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuLnNpemUgPT09IDA7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3V0bGluZU1hcmtlciB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRzdGFydENvbHVtbjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdGVuZENvbHVtbjogbnVtYmVyO1xuXHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHk7XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRsaW5lRWxlbWVudCBleHRlbmRzIFRyZWVFbGVtZW50IHtcblxuXHRjaGlsZHJlbiA9IG5ldyBNYXA8c3RyaW5nLCBPdXRsaW5lRWxlbWVudD4oKTtcblx0bWFya2VyOiB7IGNvdW50OiBudW1iZXI7IHRvcFNldjogTWFya2VyU2V2ZXJpdHkgfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHB1YmxpYyBwYXJlbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IHN5bWJvbDogRG9jdW1lbnRTeW1ib2xcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3V0bGluZUdyb3VwIGV4dGVuZHMgVHJlZUVsZW1lbnQge1xuXG5cdGNoaWxkcmVuID0gbmV3IE1hcDxzdHJpbmcsIE91dGxpbmVFbGVtZW50PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHBhcmVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcblx0XHRyZWFkb25seSBvcmRlcjogbnVtYmVyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0SXRlbUVuY2xvc2luZ1Bvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBPdXRsaW5lRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHBvc2l0aW9uID8gdGhpcy5fZ2V0SXRlbUVuY2xvc2luZ1Bvc2l0aW9uKHBvc2l0aW9uLCB0aGlzLmNoaWxkcmVuKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEl0ZW1FbmNsb3NpbmdQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uLCBjaGlsZHJlbjogTWFwPHN0cmluZywgT3V0bGluZUVsZW1lbnQ+KTogT3V0bGluZUVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgWywgaXRlbV0gb2YgY2hpbGRyZW4pIHtcblx0XHRcdGlmICghaXRlbS5zeW1ib2wucmFuZ2UgfHwgIVJhbmdlLmNvbnRhaW5zUG9zaXRpb24oaXRlbS5zeW1ib2wucmFuZ2UsIHBvc2l0aW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24ocG9zaXRpb24sIGl0ZW0uY2hpbGRyZW4pIHx8IGl0ZW07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR1cGRhdGVNYXJrZXIobWFya2VyOiBJT3V0bGluZU1hcmtlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0dGhpcy5fdXBkYXRlTWFya2VyKG1hcmtlciwgY2hpbGQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1hcmtlcihtYXJrZXJzOiBJT3V0bGluZU1hcmtlcltdLCBpdGVtOiBPdXRsaW5lRWxlbWVudCk6IHZvaWQge1xuXHRcdGl0ZW0ubWFya2VyID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gZmluZCB0aGUgcHJvcGVyIHN0YXJ0IGluZGV4IHRvIGNoZWNrIGZvciBpdGVtL21hcmtlciBvdmVybGFwLlxuXHRcdGNvbnN0IGlkeCA9IGJpbmFyeVNlYXJjaDxJUmFuZ2U+KG1hcmtlcnMsIGl0ZW0uc3ltYm9sLnJhbmdlLCBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdGxldCBzdGFydDogbnVtYmVyO1xuXHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRzdGFydCA9IH5pZHg7XG5cdFx0XHRpZiAoc3RhcnQgPiAwICYmIFJhbmdlLmFyZUludGVyc2VjdGluZyhtYXJrZXJzW3N0YXJ0IC0gMV0sIGl0ZW0uc3ltYm9sLnJhbmdlKSkge1xuXHRcdFx0XHRzdGFydCAtPSAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydCA9IGlkeDtcblx0XHR9XG5cblx0XHRjb25zdCBteU1hcmtlcnM6IElPdXRsaW5lTWFya2VyW10gPSBbXTtcblx0XHRsZXQgbXlUb3BTZXY6IE1hcmtlclNldmVyaXR5IHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yICg7IHN0YXJ0IDwgbWFya2Vycy5sZW5ndGggJiYgUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKGl0ZW0uc3ltYm9sLnJhbmdlLCBtYXJrZXJzW3N0YXJ0XSk7IHN0YXJ0KyspIHtcblx0XHRcdC8vIHJlbW92ZSBtYXJrZXJzIGludGVyc2VjdGluZyB3aXRoIHRoaXMgb3V0bGluZSBlbGVtZW50XG5cdFx0XHQvLyBhbmQgc3RvcmUgdGhlbSBpbiBhICdwcml2YXRlJyBhcnJheS5cblx0XHRcdGNvbnN0IG1hcmtlciA9IG1hcmtlcnNbc3RhcnRdO1xuXHRcdFx0bXlNYXJrZXJzLnB1c2gobWFya2VyKTtcblx0XHRcdChtYXJrZXJzIGFzIEFycmF5PElPdXRsaW5lTWFya2VyIHwgdW5kZWZpbmVkPilbc3RhcnRdID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFteVRvcFNldiB8fCBtYXJrZXIuc2V2ZXJpdHkgPiBteVRvcFNldikge1xuXHRcdFx0XHRteVRvcFNldiA9IG1hcmtlci5zZXZlcml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZWN1cnNlIGludG8gY2hpbGRyZW4gYW5kIGxldCB0aGVtIG1hdGNoIG1hcmtlcnMgdGhhdCBoYXZlIG1hdGNoZWRcblx0XHQvLyB0aGlzIG91dGxpbmUgZWxlbWVudC4gVGhpcyBtaWdodCByZW1vdmUgbWFya2VycyBmcm9tIHRoaXMgZWxlbWVudCBhbmRcblx0XHQvLyB0aGVyZWZvcmUgd2UgcmVtZW1iZXIgdGhhdCB3ZSBoYXZlIGhhZCBtYXJrZXJzLiBUaGF0IGFsbG93cyB1cyB0byByZW5kZXJcblx0XHQvLyB0aGUgZG90LCBzYXlpbmcgJ3RoaXMgZWxlbWVudCBoYXMgY2hpbGRyZW4gd2l0aCBtYXJrZXJzJ1xuXHRcdGZvciAoY29uc3QgWywgY2hpbGRdIG9mIGl0ZW0uY2hpbGRyZW4pIHtcblx0XHRcdHRoaXMuX3VwZGF0ZU1hcmtlcihteU1hcmtlcnMsIGNoaWxkKTtcblx0XHR9XG5cblx0XHRpZiAobXlUb3BTZXYpIHtcblx0XHRcdGl0ZW0ubWFya2VyID0ge1xuXHRcdFx0XHRjb3VudDogbXlNYXJrZXJzLmxlbmd0aCxcblx0XHRcdFx0dG9wU2V2OiBteVRvcFNldlxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb2FsZXNjZUluUGxhY2UobWFya2Vycyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE91dGxpbmVNb2RlbCBleHRlbmRzIFRyZWVFbGVtZW50IHtcblxuXHRzdGF0aWMgY3JlYXRlKHJlZ2lzdHJ5OiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxEb2N1bWVudFN5bWJvbFByb3ZpZGVyPiwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE91dGxpbmVNb2RlbD4ge1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgT3V0bGluZU1vZGVsKHRleHRNb2RlbC51cmkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVnaXN0cnkub3JkZXJlZCh0ZXh0TW9kZWwpO1xuXHRcdGNvbnN0IHByb21pc2VzID0gcHJvdmlkZXIubWFwKChwcm92aWRlciwgaW5kZXgpID0+IHtcblxuXHRcdFx0Y29uc3QgaWQgPSBUcmVlRWxlbWVudC5maW5kSWQoYHByb3ZpZGVyXyR7aW5kZXh9YCwgcmVzdWx0KTtcblx0XHRcdGNvbnN0IGdyb3VwID0gbmV3IE91dGxpbmVHcm91cChpZCwgcmVzdWx0LCBwcm92aWRlci5kaXNwbGF5TmFtZSA/PyAnVW5rbm93biBPdXRsaW5lIFByb3ZpZGVyJywgaW5kZXgpO1xuXG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZURvY3VtZW50U3ltYm9scyh0ZXh0TW9kZWwsIGN0cy50b2tlbikpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBpbmZvIG9mIHJlc3VsdCB8fCBbXSkge1xuXHRcdFx0XHRcdE91dGxpbmVNb2RlbC5fbWFrZU91dGxpbmVFbGVtZW50KGluZm8sIGdyb3VwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKGVycik7XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH0pLnRoZW4oZ3JvdXAgPT4ge1xuXHRcdFx0XHRpZiAoIVRyZWVFbGVtZW50LmVtcHR5KGdyb3VwKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5fZ3JvdXBzLnNldChpZCwgZ3JvdXApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGdyb3VwLnJlbW92ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxpc3RlbmVyID0gcmVnaXN0cnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3UHJvdmlkZXIgPSByZWdpc3RyeS5vcmRlcmVkKHRleHRNb2RlbCk7XG5cdFx0XHRpZiAoIWVxdWFscyhuZXdQcm92aWRlciwgcHJvdmlkZXIpKSB7XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gT3V0bGluZU1vZGVsLmNyZWF0ZShyZWdpc3RyeSwgdGV4dE1vZGVsLCB0b2tlbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Ll9jb21wYWN0KCk7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tYWtlT3V0bGluZUVsZW1lbnQoaW5mbzogRG9jdW1lbnRTeW1ib2wsIGNvbnRhaW5lcjogT3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpZCA9IFRyZWVFbGVtZW50LmZpbmRJZChpbmZvLCBjb250YWluZXIpO1xuXHRcdGNvbnN0IHJlcyA9IG5ldyBPdXRsaW5lRWxlbWVudChpZCwgY29udGFpbmVyLCBpbmZvKTtcblx0XHRpZiAoaW5mby5jaGlsZHJlbikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZEluZm8gb2YgaW5mby5jaGlsZHJlbikge1xuXHRcdFx0XHRPdXRsaW5lTW9kZWwuX21ha2VPdXRsaW5lRWxlbWVudChjaGlsZEluZm8sIHJlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5jaGlsZHJlbi5zZXQocmVzLmlkLCByZXMpO1xuXHR9XG5cblx0c3RhdGljIGdldChlbGVtZW50OiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCk6IE91dGxpbmVNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0d2hpbGUgKGVsZW1lbnQpIHtcblx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3V0bGluZU1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdFx0fVxuXHRcdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVhZG9ubHkgaWQgPSAncm9vdCc7XG5cdHJlYWRvbmx5IHBhcmVudCA9IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgX2dyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBPdXRsaW5lR3JvdXA+KCk7XG5cdGNoaWxkcmVuID0gbmV3IE1hcDxzdHJpbmcsIE91dGxpbmVHcm91cCB8IE91dGxpbmVFbGVtZW50PigpO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3RvcihyZWFkb25seSB1cmk6IFVSSSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmlkID0gJ3Jvb3QnO1xuXHRcdHRoaXMucGFyZW50ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGFjdCgpOiB0aGlzIHtcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgW2tleSwgZ3JvdXBdIG9mIHRoaXMuX2dyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwLmNoaWxkcmVuLnNpemUgPT09IDApIHsgLy8gZW1wdHlcblx0XHRcdFx0dGhpcy5fZ3JvdXBzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y291bnQgKz0gMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNvdW50ICE9PSAxKSB7XG5cdFx0XHQvL1xuXHRcdFx0dGhpcy5jaGlsZHJlbiA9IHRoaXMuX2dyb3Vwcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gYWRvcHQgYWxsIGVsZW1lbnRzIG9mIHRoZSBmaXJzdCBncm91cFxuXHRcdFx0Y29uc3QgZ3JvdXAgPSBJdGVyYWJsZS5maXJzdCh0aGlzLl9ncm91cHMudmFsdWVzKCkpITtcblx0XHRcdGZvciAoY29uc3QgWywgY2hpbGRdIG9mIGdyb3VwLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkLnBhcmVudCA9IHRoaXM7XG5cdFx0XHRcdHRoaXMuY2hpbGRyZW4uc2V0KGNoaWxkLmlkLCBjaGlsZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0bWVyZ2Uob3RoZXI6IE91dGxpbmVNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnVyaS50b1N0cmluZygpICE9PSBvdGhlci51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZ3JvdXBzLnNpemUgIT09IG90aGVyLl9ncm91cHMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9ncm91cHMgPSBvdGhlci5fZ3JvdXBzO1xuXHRcdHRoaXMuY2hpbGRyZW4gPSBvdGhlci5jaGlsZHJlbjtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldEl0ZW1FbmNsb3NpbmdQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0PzogT3V0bGluZUVsZW1lbnQpOiBPdXRsaW5lRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cblx0XHRsZXQgcHJlZmVycmVkR3JvdXA6IE91dGxpbmVHcm91cCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0bGV0IGNhbmRpZGF0ZSA9IGNvbnRleHQucGFyZW50O1xuXHRcdFx0d2hpbGUgKGNhbmRpZGF0ZSAmJiAhcHJlZmVycmVkR3JvdXApIHtcblx0XHRcdFx0aWYgKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIE91dGxpbmVHcm91cCkge1xuXHRcdFx0XHRcdHByZWZlcnJlZEdyb3VwID0gY2FuZGlkYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhbmRpZGF0ZSA9IGNhbmRpZGF0ZS5wYXJlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogT3V0bGluZUVsZW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBbLCBncm91cF0gb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRyZXN1bHQgPSBncm91cC5nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0aWYgKHJlc3VsdCAmJiAoIXByZWZlcnJlZEdyb3VwIHx8IHByZWZlcnJlZEdyb3VwID09PSBncm91cCkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRJdGVtQnlJZChpZDogc3RyaW5nKTogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdHJldHVybiBUcmVlRWxlbWVudC5nZXRFbGVtZW50QnlJZChpZCwgdGhpcyk7XG5cdH1cblxuXHR1cGRhdGVNYXJrZXIobWFya2VyOiBJT3V0bGluZU1hcmtlcltdKTogdm9pZCB7XG5cdFx0Ly8gc29ydCBtYXJrZXJzIGJ5IHN0YXJ0IHJhbmdlIHNvIHRoYXQgd2UgY2FuIHVzZVxuXHRcdC8vIG91dGxpbmUgZWxlbWVudCBzdGFydHMgZm9yIHF1aWNrZXIgbG9vayB1cFxuXHRcdG1hcmtlci5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHRmb3IgKGNvbnN0IFssIGdyb3VwXSBvZiB0aGlzLl9ncm91cHMpIHtcblx0XHRcdGdyb3VwLnVwZGF0ZU1hcmtlcihtYXJrZXIuc2xpY2UoMCkpO1xuXHRcdH1cblx0fVxuXG5cdGdldFRvcExldmVsU3ltYm9scygpOiBEb2N1bWVudFN5bWJvbFtdIHtcblx0XHRjb25zdCByb290czogRG9jdW1lbnRTeW1ib2xbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGhpcy5jaGlsZHJlbi52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgT3V0bGluZUVsZW1lbnQpIHtcblx0XHRcdFx0cm9vdHMucHVzaChjaGlsZC5zeW1ib2wpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cm9vdHMucHVzaCguLi5JdGVyYWJsZS5tYXAoY2hpbGQuY2hpbGRyZW4udmFsdWVzKCksIGNoaWxkID0+IGNoaWxkLnN5bWJvbCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcm9vdHMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblx0fVxuXG5cdGFzTGlzdE9mRG9jdW1lbnRTeW1ib2xzKCk6IERvY3VtZW50U3ltYm9sW10ge1xuXHRcdGNvbnN0IHJvb3RzID0gdGhpcy5nZXRUb3BMZXZlbFN5bWJvbHMoKTtcblx0XHRjb25zdCBidWNrZXQ6IERvY3VtZW50U3ltYm9sW10gPSBbXTtcblx0XHRPdXRsaW5lTW9kZWwuX2ZsYXR0ZW5Eb2N1bWVudFN5bWJvbHMoYnVja2V0LCByb290cywgJycpO1xuXHRcdHJldHVybiBidWNrZXQuc29ydCgoYSwgYikgPT5cblx0XHRcdFBvc2l0aW9uLmNvbXBhcmUoUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbihhLnJhbmdlKSwgUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbihiLnJhbmdlKSkgfHwgUG9zaXRpb24uY29tcGFyZShSYW5nZS5nZXRFbmRQb3NpdGlvbihiLnJhbmdlKSwgUmFuZ2UuZ2V0RW5kUG9zaXRpb24oYS5yYW5nZSkpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9mbGF0dGVuRG9jdW1lbnRTeW1ib2xzKGJ1Y2tldDogRG9jdW1lbnRTeW1ib2xbXSwgZW50cmllczogRG9jdW1lbnRTeW1ib2xbXSwgb3ZlcnJpZGVDb250YWluZXJMYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRidWNrZXQucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IGVudHJ5LmtpbmQsXG5cdFx0XHRcdHRhZ3M6IGVudHJ5LnRhZ3MsXG5cdFx0XHRcdG5hbWU6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdGRldGFpbDogZW50cnkuZGV0YWlsLFxuXHRcdFx0XHRjb250YWluZXJOYW1lOiBlbnRyeS5jb250YWluZXJOYW1lIHx8IG92ZXJyaWRlQ29udGFpbmVyTGFiZWwsXG5cdFx0XHRcdHJhbmdlOiBlbnRyeS5yYW5nZSxcblx0XHRcdFx0c2VsZWN0aW9uUmFuZ2U6IGVudHJ5LnNlbGVjdGlvblJhbmdlLFxuXHRcdFx0XHRjaGlsZHJlbjogdW5kZWZpbmVkLCAvLyB3ZSBmbGF0dGVuIGl0Li4uXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmVjdXJzZSBvdmVyIGNoaWxkcmVuXG5cdFx0XHRpZiAoZW50cnkuY2hpbGRyZW4pIHtcblx0XHRcdFx0T3V0bGluZU1vZGVsLl9mbGF0dGVuRG9jdW1lbnRTeW1ib2xzKGJ1Y2tldCwgZW50cnkuY2hpbGRyZW4sIGVudHJ5Lm5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5cbmV4cG9ydCBjb25zdCBJT3V0bGluZU1vZGVsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJT3V0bGluZU1vZGVsU2VydmljZT4oJ0lPdXRsaW5lTW9kZWxTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dGxpbmVNb2RlbFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGdldE9yQ3JlYXRlKG1vZGVsOiBJVGV4dE1vZGVsLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE91dGxpbmVNb2RlbD47XG5cdGdldERlYm91bmNlVmFsdWUodGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogbnVtYmVyO1xuXHRnZXRDYWNoZWRNb2RlbHMoKTogSXRlcmFibGU8T3V0bGluZU1vZGVsPjtcbn1cblxuaW50ZXJmYWNlIENhY2hlRW50cnkge1xuXHR2ZXJzaW9uSWQ6IG51bWJlcjtcblx0cHJvdmlkZXI6IERvY3VtZW50U3ltYm9sUHJvdmlkZXJbXTtcblxuXHRwcm9taXNlQ250OiBudW1iZXI7XG5cdHNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdHByb21pc2U6IFByb21pc2U8T3V0bGluZU1vZGVsPjtcblx0bW9kZWw6IE91dGxpbmVNb2RlbCB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE91dGxpbmVNb2RlbFNlcnZpY2UgaW1wbGVtZW50cyBJT3V0bGluZU1vZGVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlSW5mb3JtYXRpb246IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBDYWNoZUVudHJ5PigxNSwgMC43KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgZGVib3VuY2VzOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uID0gZGVib3VuY2VzLmZvcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlciwgJ0RvY3VtZW50U3ltYm9scycsIHsgbWluOiAzNTAgfSk7XG5cblx0XHQvLyBkb24ndCBjYWNoZSBvdXRsaW5lIG1vZGVscyBsb25nZXIgdGhhbiB0aGVpciB0ZXh0IG1vZGVsXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1vZGVsU2VydmljZS5vbk1vZGVsUmVtb3ZlZCh0ZXh0TW9kZWwgPT4ge1xuXHRcdFx0dGhpcy5fY2FjaGUuZGVsZXRlKHRleHRNb2RlbC5pZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyBnZXRPckNyZWF0ZSh0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8T3V0bGluZU1vZGVsPiB7XG5cblx0XHRjb25zdCByZWdpc3RyeSA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXI7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZWdpc3RyeS5vcmRlcmVkKHRleHRNb2RlbCk7XG5cblx0XHRsZXQgZGF0YSA9IHRoaXMuX2NhY2hlLmdldCh0ZXh0TW9kZWwuaWQpO1xuXHRcdGlmICghZGF0YSB8fCBkYXRhLnZlcnNpb25JZCAhPT0gdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpIHx8ICFlcXVhbHMoZGF0YS5wcm92aWRlciwgcHJvdmlkZXIpKSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdHZlcnNpb25JZDogdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0XHRwcm92aWRlcixcblx0XHRcdFx0cHJvbWlzZUNudDogMCxcblx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRwcm9taXNlOiBPdXRsaW5lTW9kZWwuY3JlYXRlKHJlZ2lzdHJ5LCB0ZXh0TW9kZWwsIHNvdXJjZS50b2tlbiksXG5cdFx0XHRcdG1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KHRleHRNb2RlbC5pZCwgZGF0YSk7XG5cblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRkYXRhLnByb21pc2UudGhlbihvdXRsaW5lTW9kZWwgPT4ge1xuXHRcdFx0XHRkYXRhIS5tb2RlbCA9IG91dGxpbmVNb2RlbDtcblx0XHRcdFx0dGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi51cGRhdGUodGV4dE1vZGVsLCBEYXRlLm5vdygpIC0gbm93KTtcblx0XHRcdH0pLmNhdGNoKF9lcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUodGV4dE1vZGVsLmlkKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChkYXRhLm1vZGVsKSB7XG5cdFx0XHQvLyByZXNvbHZlZCAtPiByZXR1cm4gZGF0YVxuXHRcdFx0cmV0dXJuIGRhdGEubW9kZWw7XG5cdFx0fVxuXG5cdFx0Ly8gaW5jcmVhc2UgdXNhZ2UgY291bnRlclxuXHRcdGRhdGEucHJvbWlzZUNudCArPSAxO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHQvLyBsYXN0IC0+IGNhbmNlbCBwcm92aWRlciByZXF1ZXN0LCByZW1vdmUgY2FjaGVkIHByb21pc2Vcblx0XHRcdGlmICgtLWRhdGEucHJvbWlzZUNudCA9PT0gMCkge1xuXHRcdFx0XHRkYXRhLnNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY2FjaGUuZGVsZXRlKHRleHRNb2RlbC5pZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGRhdGEucHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGdldERlYm91bmNlVmFsdWUodGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQodGV4dE1vZGVsKTtcblx0fVxuXG5cdGdldENhY2hlZE1vZGVscygpOiBJdGVyYWJsZTxPdXRsaW5lTW9kZWw+IHtcblx0XHRyZXR1cm4gSXRlcmFibGUuZmlsdGVyPE91dGxpbmVNb2RlbCB8IHVuZGVmaW5lZCwgT3V0bGluZU1vZGVsPihJdGVyYWJsZS5tYXAodGhpcy5fY2FjaGUudmFsdWVzKCksIGVudHJ5ID0+IGVudHJ5Lm1vZGVsKSwgbW9kZWwgPT4gbW9kZWwgIT09IHVuZGVmaW5lZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSU91dGxpbmVNb2RlbFNlcnZpY2UsIE91dGxpbmVNb2RlbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWMsaUJBQWlCLGNBQWM7QUFDdEQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFpQixhQUFhO0FBSTlCLFNBQXNDLHVDQUF1QztBQUM3RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxxQkFBcUI7QUFDOUIs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
