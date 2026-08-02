import { defaultGenerator } from "../../../../base/common/idGenerator.js";
import { equals } from "../../../../base/common/objects.js";
var LoadingPhase = /* @__PURE__ */ ((LoadingPhase2) => {
  LoadingPhase2[LoadingPhase2["Created"] = 1] = "Created";
  LoadingPhase2[LoadingPhase2["Loading"] = 2] = "Loading";
  LoadingPhase2[LoadingPhase2["Loaded"] = 3] = "Loaded";
  LoadingPhase2[LoadingPhase2["Errored"] = 4] = "Errored";
  LoadingPhase2[LoadingPhase2["Disposed"] = 5] = "Disposed";
  return LoadingPhase2;
})(LoadingPhase || {});
class FileQueryCacheState {
  constructor(cacheQuery, loadFn, disposeFn, previousCacheState) {
    this.cacheQuery = cacheQuery;
    this.loadFn = loadFn;
    this.disposeFn = disposeFn;
    this.previousCacheState = previousCacheState;
    this._cacheKey = defaultGenerator.nextId();
    this.query = this.cacheQuery(this._cacheKey);
    this.loadingPhase = 1 /* Created */;
    if (this.previousCacheState) {
      const current = Object.assign({}, this.query, { cacheKey: null });
      const previous = Object.assign({}, this.previousCacheState.query, { cacheKey: null });
      if (!equals(current, previous)) {
        this.previousCacheState.dispose();
        this.previousCacheState = void 0;
      }
    }
  }
  get cacheKey() {
    if (this.loadingPhase === 3 /* Loaded */ || !this.previousCacheState) {
      return this._cacheKey;
    }
    return this.previousCacheState.cacheKey;
  }
  get isLoaded() {
    const isLoaded = this.loadingPhase === 3 /* Loaded */;
    return isLoaded || !this.previousCacheState ? isLoaded : this.previousCacheState.isLoaded;
  }
  get isUpdating() {
    const isUpdating = this.loadingPhase === 2 /* Loading */;
    return isUpdating || !this.previousCacheState ? isUpdating : this.previousCacheState.isUpdating;
  }
  load() {
    if (this.isUpdating) {
      return this;
    }
    this.loadingPhase = 2 /* Loading */;
    this.loadPromise = (async () => {
      try {
        await this.loadFn(this.query);
        this.loadingPhase = 3 /* Loaded */;
        if (this.previousCacheState) {
          this.previousCacheState.dispose();
          this.previousCacheState = void 0;
        }
      } catch (error) {
        this.loadingPhase = 4 /* Errored */;
        throw error;
      }
    })();
    return this;
  }
  dispose() {
    if (this.loadPromise) {
      (async () => {
        try {
          await this.loadPromise;
        } catch (error) {
        }
        this.loadingPhase = 5 /* Disposed */;
        this.disposeFn(this._cacheKey);
      })();
    } else {
      this.loadingPhase = 5 /* Disposed */;
    }
    if (this.previousCacheState) {
      this.previousCacheState.dispose();
      this.previousCacheState = void 0;
    }
  }
}
export {
  FileQueryCacheState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9jb21tb24vY2FjaGVTdGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZmF1bHRHZW5lcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pZEdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBJRmlsZVF1ZXJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5cbmVudW0gTG9hZGluZ1BoYXNlIHtcblx0Q3JlYXRlZCA9IDEsXG5cdExvYWRpbmcgPSAyLFxuXHRMb2FkZWQgPSAzLFxuXHRFcnJvcmVkID0gNCxcblx0RGlzcG9zZWQgPSA1XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlUXVlcnlDYWNoZVN0YXRlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZUtleTtcblx0Z2V0IGNhY2hlS2V5KCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMubG9hZGluZ1BoYXNlID09PSBMb2FkaW5nUGhhc2UuTG9hZGVkIHx8ICF0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NhY2hlS2V5O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5jYWNoZUtleTtcblx0fVxuXG5cdGdldCBpc0xvYWRlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBpc0xvYWRlZCA9IHRoaXMubG9hZGluZ1BoYXNlID09PSBMb2FkaW5nUGhhc2UuTG9hZGVkO1xuXG5cdFx0cmV0dXJuIGlzTG9hZGVkIHx8ICF0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSA/IGlzTG9hZGVkIDogdGhpcy5wcmV2aW91c0NhY2hlU3RhdGUuaXNMb2FkZWQ7XG5cdH1cblxuXHRnZXQgaXNVcGRhdGluZygpOiBib29sZWFuIHtcblx0XHRjb25zdCBpc1VwZGF0aW5nID0gdGhpcy5sb2FkaW5nUGhhc2UgPT09IExvYWRpbmdQaGFzZS5Mb2FkaW5nO1xuXG5cdFx0cmV0dXJuIGlzVXBkYXRpbmcgfHwgIXRoaXMucHJldmlvdXNDYWNoZVN0YXRlID8gaXNVcGRhdGluZyA6IHRoaXMucHJldmlvdXNDYWNoZVN0YXRlLmlzVXBkYXRpbmc7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHF1ZXJ5O1xuXG5cdHByaXZhdGUgbG9hZGluZ1BoYXNlO1xuXHRwcml2YXRlIGxvYWRQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY2FjaGVRdWVyeTogKGNhY2hlS2V5OiBzdHJpbmcpID0+IElGaWxlUXVlcnksXG5cdFx0cHJpdmF0ZSBsb2FkRm46IChxdWVyeTogSUZpbGVRdWVyeSkgPT4gUHJvbWlzZTx1bmtub3duPixcblx0XHRwcml2YXRlIGRpc3Bvc2VGbjogKGNhY2hlS2V5OiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0cHJpdmF0ZSBwcmV2aW91c0NhY2hlU3RhdGU6IEZpbGVRdWVyeUNhY2hlU3RhdGUgfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0dGhpcy5fY2FjaGVLZXkgPSBkZWZhdWx0R2VuZXJhdG9yLm5leHRJZCgpO1xuXHRcdHRoaXMucXVlcnkgPSB0aGlzLmNhY2hlUXVlcnkodGhpcy5fY2FjaGVLZXkpO1xuXHRcdHRoaXMubG9hZGluZ1BoYXNlID0gTG9hZGluZ1BoYXNlLkNyZWF0ZWQ7XG5cdFx0aWYgKHRoaXMucHJldmlvdXNDYWNoZVN0YXRlKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5xdWVyeSwgeyBjYWNoZUtleTogbnVsbCB9KTtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5wcmV2aW91c0NhY2hlU3RhdGUucXVlcnksIHsgY2FjaGVLZXk6IG51bGwgfSk7XG5cdFx0XHRpZiAoIWVxdWFscyhjdXJyZW50LCBwcmV2aW91cykpIHtcblx0XHRcdFx0dGhpcy5wcmV2aW91c0NhY2hlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRsb2FkKCk6IEZpbGVRdWVyeUNhY2hlU3RhdGUge1xuXHRcdGlmICh0aGlzLmlzVXBkYXRpbmcpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHRoaXMubG9hZGluZ1BoYXNlID0gTG9hZGluZ1BoYXNlLkxvYWRpbmc7XG5cblx0XHR0aGlzLmxvYWRQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubG9hZEZuKHRoaXMucXVlcnkpO1xuXG5cdFx0XHRcdHRoaXMubG9hZGluZ1BoYXNlID0gTG9hZGluZ1BoYXNlLkxvYWRlZDtcblxuXHRcdFx0XHRpZiAodGhpcy5wcmV2aW91c0NhY2hlU3RhdGUpIHtcblx0XHRcdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5wcmV2aW91c0NhY2hlU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9hZGluZ1BoYXNlID0gTG9hZGluZ1BoYXNlLkVycm9yZWQ7XG5cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sb2FkUHJvbWlzZSkge1xuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmxvYWRQcm9taXNlO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuRGlzcG9zZWQ7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZUZuKHRoaXMuX2NhY2hlS2V5KTtcblx0XHRcdH0pKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9hZGluZ1BoYXNlID0gTG9hZGluZ1BoYXNlLkRpc3Bvc2VkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSkge1xuXHRcdFx0dGhpcy5wcmV2aW91c0NhY2hlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wcmV2aW91c0NhY2hlU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGNBQWM7QUFFdkIsSUFBSyxlQUFMLGtCQUFLQSxrQkFBTDtBQUNDLEVBQUFBLDRCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDRCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDRCQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLDRCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDRCQUFBLGNBQVcsS0FBWDtBQUxJLFNBQUFBO0FBQUEsR0FBQTtBQVFFLE1BQU0sb0JBQW9CO0FBQUEsRUE0QmhDLFlBQ1MsWUFDQSxRQUNBLFdBQ0Esb0JBQ1A7QUFKTztBQUNBO0FBQ0E7QUFDQTtBQUVSLFNBQUssWUFBWSxpQkFBaUIsT0FBTztBQUN6QyxTQUFLLFFBQVEsS0FBSyxXQUFXLEtBQUssU0FBUztBQUMzQyxTQUFLLGVBQWU7QUFDcEIsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixZQUFNLFVBQVUsT0FBTyxPQUFPLENBQUMsR0FBRyxLQUFLLE9BQU8sRUFBRSxVQUFVLEtBQUssQ0FBQztBQUNoRSxZQUFNLFdBQVcsT0FBTyxPQUFPLENBQUMsR0FBRyxLQUFLLG1CQUFtQixPQUFPLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFDcEYsVUFBSSxDQUFDLE9BQU8sU0FBUyxRQUFRLEdBQUc7QUFDL0IsYUFBSyxtQkFBbUIsUUFBUTtBQUNoQyxhQUFLLHFCQUFxQjtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQTFDQSxJQUFJLFdBQW1CO0FBQ3RCLFFBQUksS0FBSyxpQkFBaUIsa0JBQXVCLENBQUMsS0FBSyxvQkFBb0I7QUFDMUUsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUVBLFdBQU8sS0FBSyxtQkFBbUI7QUFBQSxFQUNoQztBQUFBLEVBRUEsSUFBSSxXQUFvQjtBQUN2QixVQUFNLFdBQVcsS0FBSyxpQkFBaUI7QUFFdkMsV0FBTyxZQUFZLENBQUMsS0FBSyxxQkFBcUIsV0FBVyxLQUFLLG1CQUFtQjtBQUFBLEVBQ2xGO0FBQUEsRUFFQSxJQUFJLGFBQXNCO0FBQ3pCLFVBQU0sYUFBYSxLQUFLLGlCQUFpQjtBQUV6QyxXQUFPLGNBQWMsQ0FBQyxLQUFLLHFCQUFxQixhQUFhLEtBQUssbUJBQW1CO0FBQUEsRUFDdEY7QUFBQSxFQTBCQSxPQUE0QjtBQUMzQixRQUFJLEtBQUssWUFBWTtBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssZUFBZTtBQUVwQixTQUFLLGVBQWUsWUFBWTtBQUMvQixVQUFJO0FBQ0gsY0FBTSxLQUFLLE9BQU8sS0FBSyxLQUFLO0FBRTVCLGFBQUssZUFBZTtBQUVwQixZQUFJLEtBQUssb0JBQW9CO0FBQzVCLGVBQUssbUJBQW1CLFFBQVE7QUFDaEMsZUFBSyxxQkFBcUI7QUFBQSxRQUMzQjtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxlQUFlO0FBRXBCLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxHQUFHO0FBRUgsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsUUFBSSxLQUFLLGFBQWE7QUFDckIsT0FBQyxZQUFZO0FBQ1osWUFBSTtBQUNILGdCQUFNLEtBQUs7QUFBQSxRQUNaLFNBQVMsT0FBTztBQUFBLFFBRWhCO0FBRUEsYUFBSyxlQUFlO0FBQ3BCLGFBQUssVUFBVSxLQUFLLFNBQVM7QUFBQSxNQUM5QixHQUFHO0FBQUEsSUFDSixPQUFPO0FBQ04sV0FBSyxlQUFlO0FBQUEsSUFDckI7QUFFQSxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLFdBQUssbUJBQW1CLFFBQVE7QUFDaEMsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsiTG9hZGluZ1BoYXNlIl0KfQo=
