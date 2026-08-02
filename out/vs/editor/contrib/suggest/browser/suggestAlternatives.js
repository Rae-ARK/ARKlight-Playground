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
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
let SuggestAlternatives = class {
  constructor(_editor, contextKeyService) {
    this._editor = _editor;
    this._index = 0;
    this._ckOtherSuggestions = SuggestAlternatives.OtherSuggestions.bindTo(contextKeyService);
  }
  dispose() {
    this.reset();
  }
  reset() {
    this._ckOtherSuggestions.reset();
    this._listener?.dispose();
    this._model = void 0;
    this._acceptNext = void 0;
    this._ignore = false;
  }
  set({ model, index }, acceptNext) {
    if (model.items.length === 0) {
      this.reset();
      return;
    }
    const nextIndex = SuggestAlternatives._moveIndex(true, model, index);
    if (nextIndex === index) {
      this.reset();
      return;
    }
    this._acceptNext = acceptNext;
    this._model = model;
    this._index = index;
    this._listener = this._editor.onDidChangeCursorPosition(() => {
      if (!this._ignore) {
        this.reset();
      }
    });
    this._ckOtherSuggestions.set(true);
  }
  static _moveIndex(fwd, model, index) {
    let newIndex = index;
    for (let rounds = model.items.length; rounds > 0; rounds--) {
      newIndex = (newIndex + model.items.length + (fwd ? 1 : -1)) % model.items.length;
      if (newIndex === index) {
        break;
      }
      if (!model.items[newIndex].completion.additionalTextEdits) {
        break;
      }
    }
    return newIndex;
  }
  next() {
    this._move(true);
  }
  prev() {
    this._move(false);
  }
  _move(fwd) {
    if (!this._model) {
      return;
    }
    try {
      this._ignore = true;
      this._index = SuggestAlternatives._moveIndex(fwd, this._model, this._index);
      this._acceptNext({ index: this._index, item: this._model.items[this._index], model: this._model });
    } finally {
      this._ignore = false;
    }
  }
};
SuggestAlternatives.OtherSuggestions = new RawContextKey("hasOtherSuggestions", false);
SuggestAlternatives = __decorateClass([
  __decorateParam(1, IContextKeyService)
], SuggestAlternatives);
export {
  SuggestAlternatives
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0QWx0ZXJuYXRpdmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi9jb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGVkU3VnZ2VzdGlvbiB9IGZyb20gJy4vc3VnZ2VzdFdpZGdldC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0QWx0ZXJuYXRpdmVzIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgT3RoZXJTdWdnZXN0aW9ucyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdoYXNPdGhlclN1Z2dlc3Rpb25zJywgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NrT3RoZXJTdWdnZXN0aW9uczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfaW5kZXg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX21vZGVsOiBDb21wbGV0aW9uTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FjY2VwdE5leHQ6ICgoc2VsZWN0ZWQ6IElTZWxlY3RlZFN1Z2dlc3Rpb24pID0+IHVua25vd24pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9saXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lnbm9yZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9ja090aGVyU3VnZ2VzdGlvbnMgPSBTdWdnZXN0QWx0ZXJuYXRpdmVzLk90aGVyU3VnZ2VzdGlvbnMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXNldCgpO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2tPdGhlclN1Z2dlc3Rpb25zLnJlc2V0KCk7XG5cdFx0dGhpcy5fbGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hY2NlcHROZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2lnbm9yZSA9IGZhbHNlO1xuXHR9XG5cblx0c2V0KHsgbW9kZWwsIGluZGV4IH06IElTZWxlY3RlZFN1Z2dlc3Rpb24sIGFjY2VwdE5leHQ6IChzZWxlY3RlZDogSVNlbGVjdGVkU3VnZ2VzdGlvbikgPT4gdW5rbm93bik6IHZvaWQge1xuXG5cdFx0Ly8gbm8gc3VnZ2VzdGlvbnMgLT4gbm90aGluZyB0byBkb1xuXHRcdGlmIChtb2RlbC5pdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBubyBhbHRlcm5hdGl2ZSBzdWdnZXN0aW9ucyAtPiBub3RoaW5nIHRvIGRvXG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gU3VnZ2VzdEFsdGVybmF0aXZlcy5fbW92ZUluZGV4KHRydWUsIG1vZGVsLCBpbmRleCk7XG5cdFx0aWYgKG5leHRJbmRleCA9PT0gaW5kZXgpIHtcblx0XHRcdHRoaXMucmVzZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9hY2NlcHROZXh0ID0gYWNjZXB0TmV4dDtcblx0XHR0aGlzLl9tb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2luZGV4ID0gaW5kZXg7XG5cdFx0dGhpcy5fbGlzdGVuZXIgPSB0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lnbm9yZSkge1xuXHRcdFx0XHR0aGlzLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fY2tPdGhlclN1Z2dlc3Rpb25zLnNldCh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9tb3ZlSW5kZXgoZndkOiBib29sZWFuLCBtb2RlbDogQ29tcGxldGlvbk1vZGVsLCBpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRsZXQgbmV3SW5kZXggPSBpbmRleDtcblx0XHRmb3IgKGxldCByb3VuZHMgPSBtb2RlbC5pdGVtcy5sZW5ndGg7IHJvdW5kcyA+IDA7IHJvdW5kcy0tKSB7XG5cdFx0XHRuZXdJbmRleCA9IChuZXdJbmRleCArIG1vZGVsLml0ZW1zLmxlbmd0aCArIChmd2QgPyArMSA6IC0xKSkgJSBtb2RlbC5pdGVtcy5sZW5ndGg7XG5cdFx0XHRpZiAobmV3SW5kZXggPT09IGluZGV4KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFtb2RlbC5pdGVtc1tuZXdJbmRleF0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3SW5kZXg7XG5cdH1cblxuXHRuZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdmUodHJ1ZSk7XG5cdH1cblxuXHRwcmV2KCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdmUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZShmd2Q6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIHJlYXNvbiBhYm91dFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faWdub3JlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2luZGV4ID0gU3VnZ2VzdEFsdGVybmF0aXZlcy5fbW92ZUluZGV4KGZ3ZCwgdGhpcy5fbW9kZWwsIHRoaXMuX2luZGV4KTtcblx0XHRcdHRoaXMuX2FjY2VwdE5leHQhKHsgaW5kZXg6IHRoaXMuX2luZGV4LCBpdGVtOiB0aGlzLl9tb2RlbC5pdGVtc1t0aGlzLl9pbmRleF0sIG1vZGVsOiB0aGlzLl9tb2RlbCB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faWdub3JlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFJeEQsSUFBTSxzQkFBTixNQUEwQjtBQUFBLEVBWWhDLFlBQ2tCLFNBQ0csbUJBQ25CO0FBRmdCO0FBUGxCLFNBQVEsU0FBaUI7QUFVeEIsU0FBSyxzQkFBc0Isb0JBQW9CLGlCQUFpQixPQUFPLGlCQUFpQjtBQUFBLEVBQ3pGO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssTUFBTTtBQUFBLEVBQ1o7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssV0FBVyxRQUFRO0FBQ3hCLFNBQUssU0FBUztBQUNkLFNBQUssY0FBYztBQUNuQixTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBRUEsSUFBSSxFQUFFLE9BQU8sTUFBTSxHQUF3QixZQUE4RDtBQUd4RyxRQUFJLE1BQU0sTUFBTSxXQUFXLEdBQUc7QUFDN0IsV0FBSyxNQUFNO0FBQ1g7QUFBQSxJQUNEO0FBR0EsVUFBTSxZQUFZLG9CQUFvQixXQUFXLE1BQU0sT0FBTyxLQUFLO0FBQ25FLFFBQUksY0FBYyxPQUFPO0FBQ3hCLFdBQUssTUFBTTtBQUNYO0FBQUEsSUFDRDtBQUVBLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVM7QUFDZCxTQUFLLFlBQVksS0FBSyxRQUFRLDBCQUEwQixNQUFNO0FBQzdELFVBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsYUFBSyxNQUFNO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssb0JBQW9CLElBQUksSUFBSTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxPQUFlLFdBQVcsS0FBYyxPQUF3QixPQUF1QjtBQUN0RixRQUFJLFdBQVc7QUFDZixhQUFTLFNBQVMsTUFBTSxNQUFNLFFBQVEsU0FBUyxHQUFHLFVBQVU7QUFDM0Qsa0JBQVksV0FBVyxNQUFNLE1BQU0sVUFBVSxNQUFNLElBQUssT0FBTyxNQUFNLE1BQU07QUFDM0UsVUFBSSxhQUFhLE9BQU87QUFDdkI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE1BQU0sTUFBTSxRQUFRLEVBQUUsV0FBVyxxQkFBcUI7QUFDMUQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFhO0FBQ1osU0FBSyxNQUFNLElBQUk7QUFBQSxFQUNoQjtBQUFBLEVBRUEsT0FBYTtBQUNaLFNBQUssTUFBTSxLQUFLO0FBQUEsRUFDakI7QUFBQSxFQUVRLE1BQU0sS0FBb0I7QUFDakMsUUFBSSxDQUFDLEtBQUssUUFBUTtBQUVqQjtBQUFBLElBQ0Q7QUFDQSxRQUFJO0FBQ0gsV0FBSyxVQUFVO0FBQ2YsV0FBSyxTQUFTLG9CQUFvQixXQUFXLEtBQUssS0FBSyxRQUFRLEtBQUssTUFBTTtBQUMxRSxXQUFLLFlBQWEsRUFBRSxPQUFPLEtBQUssUUFBUSxNQUFNLEtBQUssT0FBTyxNQUFNLEtBQUssTUFBTSxHQUFHLE9BQU8sS0FBSyxPQUFPLENBQUM7QUFBQSxJQUNuRyxVQUFFO0FBQ0QsV0FBSyxVQUFVO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBQ0Q7QUE1RmEsb0JBRUksbUJBQW1CLElBQUksY0FBdUIsdUJBQXVCLEtBQUs7QUFGOUUsc0JBQU47QUFBQSxFQWNKO0FBQUEsR0FkVTsiLAogICJuYW1lcyI6IFtdCn0K
