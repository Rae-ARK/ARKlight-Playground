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
import { createCancelablePromise, raceTimeout } from "../../../../base/common/async.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAiRelatedInformationService } from "./aiRelatedInformation.js";
let AiRelatedInformationService = class {
  constructor(logService) {
    this.logService = logService;
    // 10 seconds
    this._providers = /* @__PURE__ */ new Map();
  }
  isEnabled() {
    return this._providers.size > 0;
  }
  registerAiRelatedInformationProvider(type, provider) {
    const providers = this._providers.get(type) ?? [];
    providers.push(provider);
    this._providers.set(type, providers);
    return {
      dispose: () => {
        const providers2 = this._providers.get(type) ?? [];
        const index = providers2.indexOf(provider);
        if (index !== -1) {
          providers2.splice(index, 1);
        }
        if (providers2.length === 0) {
          this._providers.delete(type);
        }
      }
    };
  }
  async getRelatedInformation(query, types, token) {
    if (this._providers.size === 0) {
      throw new Error("No related information providers registered");
    }
    const providers = [];
    for (const type of types) {
      const typeProviders = this._providers.get(type);
      if (typeProviders) {
        providers.push(...typeProviders);
      }
    }
    if (providers.length === 0) {
      throw new Error("No related information providers registered for the given types");
    }
    const stopwatch = StopWatch.create();
    const cancellablePromises = providers.map((provider) => {
      return createCancelablePromise(async (t) => {
        try {
          const result = await provider.provideAiRelatedInformation(query, t);
          return result.filter((r) => types.includes(r.type));
        } catch (e) {
        }
        return [];
      });
    });
    try {
      const results = await raceTimeout(
        Promise.allSettled(cancellablePromises),
        AiRelatedInformationService.DEFAULT_TIMEOUT,
        () => {
          cancellablePromises.forEach((p) => p.cancel());
          this.logService.warn("[AiRelatedInformationService]: Related information provider timed out");
        }
      );
      if (!results) {
        return [];
      }
      const result = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
      return result;
    } finally {
      stopwatch.stop();
      this.logService.trace(`[AiRelatedInformationService]: getRelatedInformation took ${stopwatch.elapsed()}ms`);
    }
  }
};
AiRelatedInformationService.DEFAULT_TIMEOUT = 1e3 * 10;
AiRelatedInformationService = __decorateClass([
  __decorateParam(0, ILogService)
], AiRelatedInformationService);
registerSingleton(IAiRelatedInformationService, AiRelatedInformationService, InstantiationType.Delayed);
export {
  AiRelatedInformationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9haVJlbGF0ZWRJbmZvcm1hdGlvbi9jb21tb24vYWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFpUmVsYXRlZEluZm9ybWF0aW9uU2VydmljZSwgSUFpUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXIsIFJlbGF0ZWRJbmZvcm1hdGlvblR5cGUsIFJlbGF0ZWRJbmZvcm1hdGlvblJlc3VsdCB9IGZyb20gJy4vYWlSZWxhdGVkSW5mb3JtYXRpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlIGltcGxlbWVudHMgSUFpUmVsYXRlZEluZm9ybWF0aW9uU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9USU1FT1VUID0gMTAwMCAqIDEwOyAvLyAxMCBzZWNvbmRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzOiBNYXA8UmVsYXRlZEluZm9ybWF0aW9uVHlwZSwgSUFpUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXJbXT4gPSBuZXcgTWFwKCk7XG5cblx0Y29uc3RydWN0b3IoQElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHsgfVxuXG5cdGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJzLnNpemUgPiAwO1xuXHR9XG5cblx0cmVnaXN0ZXJBaVJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyKHR5cGU6IFJlbGF0ZWRJbmZvcm1hdGlvblR5cGUsIHByb3ZpZGVyOiBJQWlSZWxhdGVkSW5mb3JtYXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHR5cGUpID8/IFtdO1xuXHRcdHByb3ZpZGVycy5wdXNoKHByb3ZpZGVyKTtcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KHR5cGUsIHByb3ZpZGVycyk7XG5cblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuX3Byb3ZpZGVycy5nZXQodHlwZSkgPz8gW107XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gcHJvdmlkZXJzLmluZGV4T2YocHJvdmlkZXIpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKHR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldFJlbGF0ZWRJbmZvcm1hdGlvbihxdWVyeTogc3RyaW5nLCB0eXBlczogUmVsYXRlZEluZm9ybWF0aW9uVHlwZVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJlbGF0ZWRJbmZvcm1hdGlvblJlc3VsdFtdPiB7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5zaXplID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHJlbGF0ZWQgaW5mb3JtYXRpb24gcHJvdmlkZXJzIHJlZ2lzdGVyZWQnKTtcblx0XHR9XG5cblx0XHQvLyBnZXQgcHJvdmlkZXJzIGZvciBlYWNoIHR5cGVcblx0XHRjb25zdCBwcm92aWRlcnM6IElBaVJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgdHlwZXMpIHtcblx0XHRcdGNvbnN0IHR5cGVQcm92aWRlcnMgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHR5cGUpO1xuXHRcdFx0aWYgKHR5cGVQcm92aWRlcnMpIHtcblx0XHRcdFx0cHJvdmlkZXJzLnB1c2goLi4udHlwZVByb3ZpZGVycyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gcmVsYXRlZCBpbmZvcm1hdGlvbiBwcm92aWRlcnMgcmVnaXN0ZXJlZCBmb3IgdGhlIGdpdmVuIHR5cGVzJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcHdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXG5cdFx0Y29uc3QgY2FuY2VsbGFibGVQcm9taXNlczogQXJyYXk8Q2FuY2VsYWJsZVByb21pc2U8UmVsYXRlZEluZm9ybWF0aW9uUmVzdWx0W10+PiA9IHByb3ZpZGVycy5tYXAoKHByb3ZpZGVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgdCA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUFpUmVsYXRlZEluZm9ybWF0aW9uKHF1ZXJ5LCB0KTtcblx0XHRcdFx0XHQvLyBkb3VibGUgZmlsdGVyIGp1c3QgaW4gY2FzZVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQuZmlsdGVyKHIgPT4gdHlwZXMuaW5jbHVkZXMoci50eXBlKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBsb2dnZWQgaW4gZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdFByb21pc2UuYWxsU2V0dGxlZChjYW5jZWxsYWJsZVByb21pc2VzKSxcblx0XHRcdFx0QWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLkRFRkFVTFRfVElNRU9VVCxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGNhbmNlbGxhYmxlUHJvbWlzZXMuZm9yRWFjaChwID0+IHAuY2FuY2VsKCkpO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlXTogUmVsYXRlZCBpbmZvcm1hdGlvbiBwcm92aWRlciB0aW1lZCBvdXQnKTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGlmICghcmVzdWx0cykge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXN1bHRzXG5cdFx0XHRcdC5maWx0ZXIociA9PiByLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpXG5cdFx0XHRcdC5mbGF0TWFwKHIgPT4gKHIgYXMgUHJvbWlzZUZ1bGZpbGxlZFJlc3VsdDxSZWxhdGVkSW5mb3JtYXRpb25SZXN1bHRbXT4pLnZhbHVlKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3B3YXRjaC5zdG9wKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtBaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2VdOiBnZXRSZWxhdGVkSW5mb3JtYXRpb24gdG9vayAke3N0b3B3YXRjaC5lbGFwc2VkKCl9bXNgKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUFpUmVsYXRlZEluZm9ybWF0aW9uU2VydmljZSwgQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBNEIseUJBQXlCLG1CQUFtQjtBQUV4RSxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FB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
