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
import { doHash } from "../../../base/common/hash.js";
import { LRUCache } from "../../../base/common/map.js";
import { clamp, MovingAverage, SlidingWindowAverage } from "../../../base/common/numbers.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { matchesScheme } from "../../../base/common/network.js";
const ILanguageFeatureDebounceService = createDecorator("ILanguageFeatureDebounceService");
var IdentityHash;
((IdentityHash2) => {
  const _hashes = /* @__PURE__ */ new WeakMap();
  let pool = 0;
  function of(obj) {
    let value = _hashes.get(obj);
    if (value === void 0) {
      value = ++pool;
      _hashes.set(obj, value);
    }
    return value;
  }
  IdentityHash2.of = of;
})(IdentityHash || (IdentityHash = {}));
class NullDebounceInformation {
  constructor(_default) {
    this._default = _default;
  }
  get(_model) {
    return this._default;
  }
  update(_model, _value) {
    return this._default;
  }
  default() {
    return this._default;
  }
}
class FeatureDebounceInformation {
  constructor(_logService, _name, _registry, _default, _min, _max) {
    this._logService = _logService;
    this._name = _name;
    this._registry = _registry;
    this._default = _default;
    this._min = _min;
    this._max = _max;
    this._cache = new LRUCache(50, 0.7);
  }
  _key(model) {
    return model.id + this._registry.all(model).reduce((hashVal, obj) => doHash(IdentityHash.of(obj), hashVal), 0);
  }
  get(model) {
    const key = this._key(model);
    const avg = this._cache.get(key);
    return avg ? clamp(avg.value, this._min, this._max) : this.default();
  }
  update(model, value) {
    const key = this._key(model);
    let avg = this._cache.get(key);
    if (!avg) {
      avg = new SlidingWindowAverage(6);
      this._cache.set(key, avg);
    }
    const newValue = clamp(avg.update(value), this._min, this._max);
    if (!matchesScheme(model.uri, "output")) {
      this._logService.trace(`[DEBOUNCE: ${this._name}] for ${model.uri.toString()} is ${newValue}ms`);
    }
    return newValue;
  }
  _overall() {
    const result = new MovingAverage();
    for (const [, avg] of this._cache) {
      result.update(avg.value);
    }
    return result.value;
  }
  default() {
    const value = this._overall() | 0 || this._default;
    return clamp(value, this._min, this._max);
  }
}
let LanguageFeatureDebounceService = class {
  constructor(_logService, envService) {
    this._logService = _logService;
    this._data = /* @__PURE__ */ new Map();
    this._isDev = envService.isExtensionDevelopment || !envService.isBuilt;
  }
  for(feature, name, config) {
    const min = config?.min ?? 50;
    const max = config?.max ?? min ** 2;
    const extra = config?.key ?? void 0;
    const key = `${IdentityHash.of(feature)},${min}${extra ? "," + extra : ""}`;
    let info = this._data.get(key);
    if (!info) {
      if (this._isDev) {
        this._logService.debug(`[DEBOUNCE: ${name}] is disabled in developed mode`);
        info = new NullDebounceInformation(min * 1.5);
      } else {
        info = new FeatureDebounceInformation(
          this._logService,
          name,
          feature,
          this._overallAverage() | 0 || min * 1.5,
          // default is overall default or derived from min-value
          min,
          max
        );
      }
      this._data.set(key, info);
    }
    return info;
  }
  _overallAverage() {
    const result = new MovingAverage();
    for (const info of this._data.values()) {
      result.update(info.default());
    }
    return result.value;
  }
};
LanguageFeatureDebounceService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IEnvironmentService)
], LanguageFeatureDebounceService);
registerSingleton(ILanguageFeatureDebounceService, LanguageFeatureDebounceService, InstantiationType.Delayed);
export {
  ILanguageFeatureDebounceService,
  LanguageFeatureDebounceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkb0hhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGNsYW1wLCBNb3ZpbmdBdmVyYWdlLCBTbGlkaW5nV2luZG93QXZlcmFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5cblxuZXhwb3J0IGNvbnN0IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZT4oJ0lMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Zm9yKGZlYXR1cmU6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PG9iamVjdD4sIGRlYnVnTmFtZTogc3RyaW5nLCBjb25maWc/OiB7IG1pbj86IG51bWJlcjsgbWF4PzogbnVtYmVyOyBzYWx0Pzogc3RyaW5nIH0pOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIHtcblx0Z2V0KG1vZGVsOiBJVGV4dE1vZGVsKTogbnVtYmVyO1xuXHR1cGRhdGUobW9kZWw6IElUZXh0TW9kZWwsIHZhbHVlOiBudW1iZXIpOiBudW1iZXI7XG5cdGRlZmF1bHQoKTogbnVtYmVyO1xufVxuXG5uYW1lc3BhY2UgSWRlbnRpdHlIYXNoIHtcblx0Y29uc3QgX2hhc2hlcyA9IG5ldyBXZWFrTWFwPG9iamVjdCwgbnVtYmVyPigpO1xuXHRsZXQgcG9vbCA9IDA7XG5cdGV4cG9ydCBmdW5jdGlvbiBvZihvYmo6IG9iamVjdCk6IG51bWJlciB7XG5cdFx0bGV0IHZhbHVlID0gX2hhc2hlcy5nZXQob2JqKTtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUgPSArK3Bvb2w7XG5cdFx0XHRfaGFzaGVzLnNldChvYmosIHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbmNsYXNzIE51bGxEZWJvdW5jZUluZm9ybWF0aW9uIGltcGxlbWVudHMgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0OiBudW1iZXIpIHsgfVxuXG5cdGdldChfbW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0O1xuXHR9XG5cdHVwZGF0ZShfbW9kZWw6IElUZXh0TW9kZWwsIF92YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdDtcblx0fVxuXHRkZWZhdWx0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHQ7XG5cdH1cbn1cblxuY2xhc3MgRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24gaW1wbGVtZW50cyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IExSVUNhY2hlPHN0cmluZywgU2xpZGluZ1dpbmRvd0F2ZXJhZ2U+KDUwLCAwLjcpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX25hbWU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8b2JqZWN0Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWluOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWF4OiBudW1iZXIsXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBfa2V5KG1vZGVsOiBJVGV4dE1vZGVsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbW9kZWwuaWQgKyB0aGlzLl9yZWdpc3RyeS5hbGwobW9kZWwpLnJlZHVjZSgoaGFzaFZhbCwgb2JqKSA9PiBkb0hhc2goSWRlbnRpdHlIYXNoLm9mKG9iaiksIGhhc2hWYWwpLCAwKTtcblx0fVxuXG5cdGdldChtb2RlbDogSVRleHRNb2RlbCk6IG51bWJlciB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KG1vZGVsKTtcblx0XHRjb25zdCBhdmcgPSB0aGlzLl9jYWNoZS5nZXQoa2V5KTtcblx0XHRyZXR1cm4gYXZnXG5cdFx0XHQ/IGNsYW1wKGF2Zy52YWx1ZSwgdGhpcy5fbWluLCB0aGlzLl9tYXgpXG5cdFx0XHQ6IHRoaXMuZGVmYXVsdCgpO1xuXHR9XG5cblx0dXBkYXRlKG1vZGVsOiBJVGV4dE1vZGVsLCB2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkobW9kZWwpO1xuXHRcdGxldCBhdmcgPSB0aGlzLl9jYWNoZS5nZXQoa2V5KTtcblx0XHRpZiAoIWF2Zykge1xuXHRcdFx0YXZnID0gbmV3IFNsaWRpbmdXaW5kb3dBdmVyYWdlKDYpO1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KGtleSwgYXZnKTtcblx0XHR9XG5cdFx0Y29uc3QgbmV3VmFsdWUgPSBjbGFtcChhdmcudXBkYXRlKHZhbHVlKSwgdGhpcy5fbWluLCB0aGlzLl9tYXgpO1xuXHRcdGlmICghbWF0Y2hlc1NjaGVtZShtb2RlbC51cmksICdvdXRwdXQnKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0RFQk9VTkNFOiAke3RoaXMuX25hbWV9XSBmb3IgJHttb2RlbC51cmkudG9TdHJpbmcoKX0gaXMgJHtuZXdWYWx1ZX1tc2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3VmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9vdmVyYWxsKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1vdmluZ0F2ZXJhZ2UoKTtcblx0XHRmb3IgKGNvbnN0IFssIGF2Z10gb2YgdGhpcy5fY2FjaGUpIHtcblx0XHRcdHJlc3VsdC51cGRhdGUoYXZnLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC52YWx1ZTtcblx0fVxuXG5cdGRlZmF1bHQoKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSAodGhpcy5fb3ZlcmFsbCgpIHwgMCkgfHwgdGhpcy5fZGVmYXVsdDtcblx0XHRyZXR1cm4gY2xhbXAodmFsdWUsIHRoaXMuX21pbiwgdGhpcy5fbWF4KTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgaW1wbGVtZW50cyBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhID0gbmV3IE1hcDxzdHJpbmcsIElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNEZXY6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudlNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXG5cdFx0dGhpcy5faXNEZXYgPSBlbnZTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgfHwgIWVudlNlcnZpY2UuaXNCdWlsdDtcblx0fVxuXG5cdGZvcihmZWF0dXJlOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxvYmplY3Q+LCBuYW1lOiBzdHJpbmcsIGNvbmZpZz86IHsgbWluPzogbnVtYmVyOyBtYXg/OiBudW1iZXI7IGtleT86IHN0cmluZyB9KTogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIHtcblx0XHRjb25zdCBtaW4gPSBjb25maWc/Lm1pbiA/PyA1MDtcblx0XHRjb25zdCBtYXggPSBjb25maWc/Lm1heCA/PyBtaW4gKiogMjtcblx0XHRjb25zdCBleHRyYSA9IGNvbmZpZz8ua2V5ID8/IHVuZGVmaW5lZDtcblx0XHRjb25zdCBrZXkgPSBgJHtJZGVudGl0eUhhc2gub2YoZmVhdHVyZSl9LCR7bWlufSR7ZXh0cmEgPyAnLCcgKyBleHRyYSA6ICcnfWA7XG5cdFx0bGV0IGluZm8gPSB0aGlzLl9kYXRhLmdldChrZXkpO1xuXHRcdGlmICghaW5mbykge1xuXHRcdFx0aWYgKHRoaXMuX2lzRGV2KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtERUJPVU5DRTogJHtuYW1lfV0gaXMgZGlzYWJsZWQgaW4gZGV2ZWxvcGVkIG1vZGVgKTtcblx0XHRcdFx0aW5mbyA9IG5ldyBOdWxsRGVib3VuY2VJbmZvcm1hdGlvbihtaW4gKiAxLjUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5mbyA9IG5ldyBGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbihcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0ZmVhdHVyZSxcblx0XHRcdFx0XHQodGhpcy5fb3ZlcmFsbEF2ZXJhZ2UoKSB8IDApIHx8IChtaW4gKiAxLjUpLCAvLyBkZWZhdWx0IGlzIG92ZXJhbGwgZGVmYXVsdCBvciBkZXJpdmVkIGZyb20gbWluLXZhbHVlXG5cdFx0XHRcdFx0bWluLFxuXHRcdFx0XHRcdG1heFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGF0YS5zZXQoa2V5LCBpbmZvKTtcblx0XHR9XG5cdFx0cmV0dXJuIGluZm87XG5cdH1cblxuXHRwcml2YXRlIF9vdmVyYWxsQXZlcmFnZSgpOiBudW1iZXIge1xuXHRcdC8vIEF2ZXJhZ2Ugb2YgYWxsIGxhbmd1YWdlIGZlYXR1cmVzLiBOb3QgYSBncmVhdCB2YWx1ZSBidXQgYW4gYXBwcm94aW1hdGlvblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNb3ZpbmdBdmVyYWdlKCk7XG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIHRoaXMuX2RhdGEudmFsdWVzKCkpIHtcblx0XHRcdHJlc3VsdC51cGRhdGUoaW5mby5kZWZhdWx0KCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LnZhbHVlO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIExhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLE9BQU8sZUFBZSw0QkFBNEI7QUFHM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMscUJBQXFCO0FBR3ZCLE1BQU0sa0NBQWtDLGdCQUFpRCxpQ0FBaUM7QUFlakksSUFBVTtBQUFBLENBQVYsQ0FBVUEsa0JBQVY7QUFDQyxRQUFNLFVBQVUsb0JBQUksUUFBd0I7QUFDNUMsTUFBSSxPQUFPO0FBQ0osV0FBUyxHQUFHLEtBQXFCO0FBQ3ZDLFFBQUksUUFBUSxRQUFRLElBQUksR0FB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
