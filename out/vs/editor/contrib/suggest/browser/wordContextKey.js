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
import { EditorOption } from "../../../common/config/editorOptions.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { localize } from "../../../../nls.js";
let WordContextKey = class {
  constructor(_editor, contextKeyService) {
    this._editor = _editor;
    this._enabled = false;
    this._ckAtEnd = WordContextKey.AtEnd.bindTo(contextKeyService);
    this._configListener = this._editor.onDidChangeConfiguration((e) => e.hasChanged(EditorOption.tabCompletion) && this._update());
    this._update();
  }
  dispose() {
    this._configListener.dispose();
    this._selectionListener?.dispose();
    this._ckAtEnd.reset();
  }
  _update() {
    const enabled = this._editor.getOption(EditorOption.tabCompletion) === "on";
    if (this._enabled === enabled) {
      return;
    }
    this._enabled = enabled;
    if (this._enabled) {
      const checkForWordEnd = () => {
        if (!this._editor.hasModel()) {
          this._ckAtEnd.set(false);
          return;
        }
        const model = this._editor.getModel();
        const selection = this._editor.getSelection();
        const word = model.getWordAtPosition(selection.getStartPosition());
        if (!word) {
          this._ckAtEnd.set(false);
          return;
        }
        this._ckAtEnd.set(word.endColumn === selection.getStartPosition().column && selection.getStartPosition().lineNumber === selection.getEndPosition().lineNumber);
      };
      this._selectionListener = this._editor.onDidChangeCursorSelection(checkForWordEnd);
      checkForWordEnd();
    } else if (this._selectionListener) {
      this._ckAtEnd.reset();
      this._selectionListener.dispose();
      this._selectionListener = void 0;
    }
  }
};
WordContextKey.AtEnd = new RawContextKey("atEndOfWord", false, { type: "boolean", description: localize("desc", "A context key that is true when at the end of a word. Note that this is only defined when tab-completions are enabled") });
WordContextKey = __decorateClass([
  __decorateParam(1, IContextKeyService)
], WordContextKey);
export {
  WordContextKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci93b3JkQ29udGV4dEtleS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXb3JkQ29udGV4dEtleSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IEF0RW5kID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2F0RW5kT2ZXb3JkJywgZmFsc2UsIHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2Rlc2MnLCBcIkEgY29udGV4dCBrZXkgdGhhdCBpcyB0cnVlIHdoZW4gYXQgdGhlIGVuZCBvZiBhIHdvcmQuIE5vdGUgdGhhdCB0aGlzIGlzIG9ubHkgZGVmaW5lZCB3aGVuIHRhYi1jb21wbGV0aW9ucyBhcmUgZW5hYmxlZFwiKSB9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ja0F0RW5kOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlnTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uTGlzdGVuZXI/OiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cblx0XHR0aGlzLl9ja0F0RW5kID0gV29yZENvbnRleHRLZXkuQXRFbmQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb25maWdMaXN0ZW5lciA9IHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnRhYkNvbXBsZXRpb24pICYmIHRoaXMuX3VwZGF0ZSgpKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uZmlnTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3NlbGVjdGlvbkxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2tBdEVuZC5yZXNldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdC8vIG9ubHkgdXBkYXRlIHRoaXMgd2hlbiB0YWIgY29tcGxldGlvbnMgYXJlIGVuYWJsZWRcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24udGFiQ29tcGxldGlvbikgPT09ICdvbic7XG5cdFx0aWYgKHRoaXMuX2VuYWJsZWQgPT09IGVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZW5hYmxlZCA9IGVuYWJsZWQ7XG5cblx0XHRpZiAodGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0Y29uc3QgY2hlY2tGb3JXb3JkRW5kID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2tBdEVuZC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHdvcmQgPSBtb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2tBdEVuZC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9ja0F0RW5kLnNldCh3b3JkLmVuZENvbHVtbiA9PT0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKS5jb2x1bW4gJiYgc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKS5saW5lTnVtYmVyID09PSBzZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKS5saW5lTnVtYmVyKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25MaXN0ZW5lciA9IHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbihjaGVja0ZvcldvcmRFbmQpO1xuXHRcdFx0Y2hlY2tGb3JXb3JkRW5kKCk7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX3NlbGVjdGlvbkxpc3RlbmVyKSB7XG5cdFx0XHR0aGlzLl9ja0F0RW5kLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25MaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBc0Isb0JBQW9CLHFCQUFxQjtBQUMvRCxTQUFTLGdCQUFnQjtBQUVsQixJQUFNLGlCQUFOLE1BQXFCO0FBQUEsRUFVM0IsWUFDa0IsU0FDRyxtQkFDbkI7QUFGZ0I7QUFKbEIsU0FBUSxXQUFvQjtBQVEzQixTQUFLLFdBQVcsZUFBZSxNQUFNLE9BQU8saUJBQWlCO0FBQzdELFNBQUssa0JBQWtCLEtBQUssUUFBUSx5QkFBeUIsT0FBSyxFQUFFLFdBQVcsYUFBYSxhQUFhLEtBQUssS0FBSyxRQUFRLENBQUM7QUFDNUgsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLGdCQUFnQixRQUFRO0FBQzdCLFNBQUssb0JBQW9CLFFBQVE7QUFDakMsU0FBSyxTQUFTLE1BQU07QUFBQSxFQUNyQjtBQUFBLEVBRVEsVUFBZ0I7QUFFdkIsVUFBTSxVQUFVLEtBQUssUUFBUSxVQUFVLGFBQWEsYUFBYSxNQUFNO0FBQ3ZFLFFBQUksS0FBSyxhQUFhLFNBQVM7QUFDOUI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxXQUFXO0FBRWhCLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFlBQU0sa0JBQWtCLE1BQU07QUFDN0IsWUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0IsZUFBSyxTQUFTLElBQUksS0FBSztBQUN2QjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsY0FBTSxZQUFZLEtBQUssUUFBUSxhQUFhO0FBQzVDLGNBQU0sT0FBTyxNQUFNLGtCQUFrQixVQUFVLGlCQUFpQixDQUFDO0FBQ2pFLFlBQUksQ0FBQyxNQUFNO0FBQ1YsZUFBSyxTQUFTLElBQUksS0FBSztBQUN2QjtBQUFBLFFBQ0Q7QUFDQSxhQUFLLFNBQVMsSUFBSSxLQUFLLGNBQWMsVUFBVSxpQkFBaUIsRUFBRSxVQUFVLFVBQVUsaUJBQWlCLEVBQUUsZUFBZSxVQUFVLGVBQWUsRUFBRSxVQUFVO0FBQUEsTUFDOUo7QUFDQSxXQUFLLHFCQUFxQixLQUFLLFFBQVEsMkJBQTJCLGVBQWU7QUFDakYsc0JBQWdCO0FBQUEsSUFFakIsV0FBVyxLQUFLLG9CQUFvQjtBQUNuQyxXQUFLLFNBQVMsTUFBTTtBQUNwQixXQUFLLG1CQUFtQixRQUFRO0FBQ2hDLFdBQUsscUJBQXFCO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQ0Q7QUExRGEsZUFFSSxRQUFRLElBQUksY0FBdUIsZUFBZSxPQUFPLEVBQUUsTUFBTSxXQUFXLGFBQWEsU0FBUyxRQUFRLHVIQUF1SCxFQUFFLENBQUM7QUFGeE8saUJBQU47QUFBQSxFQVlKO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
