import { illegalArgument } from "../../../base/common/errors.js";
import * as extHostConverter from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { NotebookRange } from "./extHostTypes.js";
const _ExtHostNotebookEditor = class _ExtHostNotebookEditor {
  constructor(id, _proxy, notebookData, _visibleRanges, _selections, _viewColumn, viewType) {
    this.id = id;
    this._proxy = _proxy;
    this.notebookData = notebookData;
    this._visibleRanges = _visibleRanges;
    this._selections = _selections;
    this._viewColumn = _viewColumn;
    this.viewType = viewType;
    this._visible = false;
  }
  get apiEditor() {
    if (!this._editor) {
      const that = this;
      this._editor = {
        get notebook() {
          return that.notebookData.apiNotebook;
        },
        get selection() {
          return that._selections[0];
        },
        set selection(selection) {
          this.selections = [selection];
        },
        get selections() {
          return that._selections;
        },
        set selections(value) {
          if (!Array.isArray(value) || !value.every(extHostTypes.NotebookRange.isNotebookRange)) {
            throw illegalArgument("selections");
          }
          that._selections = value.length === 0 ? [new NotebookRange(0, 0)] : value;
          that._trySetSelections(that._selections);
        },
        get visibleRanges() {
          return that._visibleRanges;
        },
        revealRange(range, revealType) {
          that._proxy.$tryRevealRange(
            that.id,
            extHostConverter.NotebookRange.from(range),
            revealType ?? extHostTypes.NotebookEditorRevealType.Default
          );
        },
        get viewColumn() {
          return that._viewColumn;
        },
        get replOptions() {
          if (that.viewType === "repl") {
            return { appendIndex: this.notebook.cellCount - 1 };
          }
          return void 0;
        },
        [/* @__PURE__ */ Symbol.for("debug.description")]() {
          return `NotebookEditor(${this.notebook.uri.toString()})`;
        }
      };
      _ExtHostNotebookEditor.apiEditorsToExtHost.set(this._editor, this);
    }
    return this._editor;
  }
  get visible() {
    return this._visible;
  }
  _acceptVisibility(value) {
    this._visible = value;
  }
  _acceptVisibleRanges(value) {
    this._visibleRanges = value;
  }
  _acceptSelections(selections) {
    this._selections = selections;
  }
  _trySetSelections(value) {
    this._proxy.$trySetSelections(this.id, value.map(extHostConverter.NotebookRange.from));
  }
  _acceptViewColumn(value) {
    this._viewColumn = value;
  }
};
_ExtHostNotebookEditor.apiEditorsToExtHost = /* @__PURE__ */ new WeakMap();
let ExtHostNotebookEditor = _ExtHostNotebookEditor;
export {
  ExtHostNotebookEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3ROb3RlYm9va0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdENvbnZlcnRlciBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZXMgZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0ICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCB9IGZyb20gJy4vZXh0SG9zdE5vdGVib29rRG9jdW1lbnQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tSYW5nZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3ROb3RlYm9va0VkaXRvciB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBhcGlFZGl0b3JzVG9FeHRIb3N0ID0gbmV3IFdlYWtNYXA8dnNjb2RlLk5vdGVib29rRWRpdG9yLCBFeHRIb3N0Tm90ZWJvb2tFZGl0b3I+KCk7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2VkaXRvcj86IHZzY29kZS5Ob3RlYm9va0VkaXRvcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTm90ZWJvb2tFZGl0b3JzU2hhcGUsXG5cdFx0cmVhZG9ubHkgbm90ZWJvb2tEYXRhOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudCxcblx0XHRwcml2YXRlIF92aXNpYmxlUmFuZ2VzOiB2c2NvZGUuTm90ZWJvb2tSYW5nZVtdLFxuXHRcdHByaXZhdGUgX3NlbGVjdGlvbnM6IHZzY29kZS5Ob3RlYm9va1JhbmdlW10sXG5cdFx0cHJpdmF0ZSBfdmlld0NvbHVtbjogdnNjb2RlLlZpZXdDb2x1bW4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3VHlwZTogc3RyaW5nXG5cdCkgeyB9XG5cblx0Z2V0IGFwaUVkaXRvcigpOiB2c2NvZGUuTm90ZWJvb2tFZGl0b3Ige1xuXHRcdGlmICghdGhpcy5fZWRpdG9yKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdHRoaXMuX2VkaXRvciA9IHtcblx0XHRcdFx0Z2V0IG5vdGVib29rKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Lm5vdGVib29rRGF0YS5hcGlOb3RlYm9vaztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0IHNlbGVjdGlvbigpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhhdC5fc2VsZWN0aW9uc1swXTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0IHNlbGVjdGlvbihzZWxlY3Rpb246IHZzY29kZS5Ob3RlYm9va1JhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25zID0gW3NlbGVjdGlvbl07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCBzZWxlY3Rpb25zKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll9zZWxlY3Rpb25zO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXQgc2VsZWN0aW9ucyh2YWx1ZTogdnNjb2RlLk5vdGVib29rUmFuZ2VbXSkge1xuXHRcdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgIXZhbHVlLmV2ZXJ5KGV4dEhvc3RUeXBlcy5Ob3RlYm9va1JhbmdlLmlzTm90ZWJvb2tSYW5nZSkpIHtcblx0XHRcdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnc2VsZWN0aW9ucycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGF0Ll9zZWxlY3Rpb25zID0gdmFsdWUubGVuZ3RoID09PSAwID8gW25ldyBOb3RlYm9va1JhbmdlKDAsIDApXSA6IHZhbHVlO1xuXHRcdFx0XHRcdHRoYXQuX3RyeVNldFNlbGVjdGlvbnModGhhdC5fc2VsZWN0aW9ucyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCB2aXNpYmxlUmFuZ2VzKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll92aXNpYmxlUmFuZ2VzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXZlYWxSYW5nZShyYW5nZSwgcmV2ZWFsVHlwZSkge1xuXHRcdFx0XHRcdHRoYXQuX3Byb3h5LiR0cnlSZXZlYWxSYW5nZShcblx0XHRcdFx0XHRcdHRoYXQuaWQsXG5cdFx0XHRcdFx0XHRleHRIb3N0Q29udmVydGVyLk5vdGVib29rUmFuZ2UuZnJvbShyYW5nZSksXG5cdFx0XHRcdFx0XHRyZXZlYWxUeXBlID8/IGV4dEhvc3RUeXBlcy5Ob3RlYm9va0VkaXRvclJldmVhbFR5cGUuRGVmYXVsdFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldCB2aWV3Q29sdW1uKCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGF0Ll92aWV3Q29sdW1uO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXQgcmVwbE9wdGlvbnMoKSB7XG5cdFx0XHRcdFx0aWYgKHRoYXQudmlld1R5cGUgPT09ICdyZXBsJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgYXBwZW5kSW5kZXg6IHRoaXMubm90ZWJvb2suY2VsbENvdW50IC0gMSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRbU3ltYm9sLmZvcignZGVidWcuZGVzY3JpcHRpb24nKV0oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGBOb3RlYm9va0VkaXRvcigke3RoaXMubm90ZWJvb2sudXJpLnRvU3RyaW5nKCl9KWA7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdEV4dEhvc3ROb3RlYm9va0VkaXRvci5hcGlFZGl0b3JzVG9FeHRIb3N0LnNldCh0aGlzLl9lZGl0b3IsIHRoaXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yO1xuXHR9XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRfYWNjZXB0VmlzaWJpbGl0eSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2YWx1ZTtcblx0fVxuXG5cdF9hY2NlcHRWaXNpYmxlUmFuZ2VzKHZhbHVlOiB2c2NvZGUuTm90ZWJvb2tSYW5nZVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZVJhbmdlcyA9IHZhbHVlO1xuXHR9XG5cblx0X2FjY2VwdFNlbGVjdGlvbnMoc2VsZWN0aW9uczogdnNjb2RlLk5vdGVib29rUmFuZ2VbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBzZWxlY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJ5U2V0U2VsZWN0aW9ucyh2YWx1ZTogdnNjb2RlLk5vdGVib29rUmFuZ2VbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3h5LiR0cnlTZXRTZWxlY3Rpb25zKHRoaXMuaWQsIHZhbHVlLm1hcChleHRIb3N0Q29udmVydGVyLk5vdGVib29rUmFuZ2UuZnJvbSkpO1xuXHR9XG5cblx0X2FjY2VwdFZpZXdDb2x1bW4odmFsdWU6IHZzY29kZS5WaWV3Q29sdW1uIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdmlld0NvbHVtbiA9IHZhbHVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUVoQyxZQUFZLHNCQUFzQjtBQUNsQyxZQUFZLGtCQUFrQjtBQUc5QixTQUFTLHFCQUFxQjtBQUV2QixNQUFNLHlCQUFOLE1BQU0sdUJBQXNCO0FBQUEsRUFRbEMsWUFDVSxJQUNRLFFBQ1IsY0FDRCxnQkFDQSxhQUNBLGFBQ1MsVUFDaEI7QUFQUTtBQUNRO0FBQ1I7QUFDRDtBQUNBO0FBQ0E7QUFDUztBQVhsQixTQUFRLFdBQW9CO0FBQUEsRUFZeEI7QUFBQSxFQUVKLElBQUksWUFBbUM7QUFDdEMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixZQUFNLE9BQU87QUFDYixXQUFLLFVBQVU7QUFBQSxRQUNkLElBQUksV0FBVztBQUNkLGlCQUFPLEtBQUssYUFBYTtBQUFBLFFBQzFCO0FBQUEsUUFDQSxJQUFJLFlBQVk7QUFDZixpQkFBTyxLQUFLLFlBQVksQ0FBQztBQUFBLFFBQzFCO0FBQUEsUUFDQSxJQUFJLFVBQVUsV0FBaUM7QUFDOUMsZUFBSyxhQUFhLENBQUMsU0FBUztBQUFBLFFBQzdCO0FBQUEsUUFDQSxJQUFJLGFBQWE7QUFDaEIsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFBQSxRQUNBLElBQUksV0FBVyxPQUErQjtBQUM3QyxjQUFJLENBQUMsTUFBTSxRQUFRLEtBQUssS0FBSyxDQUFDLE1BQU0sTUFBTSxhQUFhLGNBQWMsZUFBZSxHQUFHO0FBQ3RGLGtCQUFNLGdCQUFnQixZQUFZO0FBQUEsVUFDbkM7QUFDQSxlQUFLLGNBQWMsTUFBTSxXQUFXLElBQUksQ0FBQyxJQUFJLGNBQWMsR0FBRyxDQUFDLENBQUMsSUFBSTtBQUNwRSxlQUFLLGtCQUFrQixLQUFLLFdBQVc7QUFBQSxRQUN4QztBQUFBLFFBQ0EsSUFBSSxnQkFBZ0I7QUFDbkIsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFBQSxRQUNBLFlBQVksT0FBTyxZQUFZO0FBQzlCLGVBQUssT0FBTztBQUFBLFlBQ1gsS0FBSztBQUFBLFlBQ0wsaUJBQWlCLGNBQWMsS0FBSyxLQUFLO0FBQUEsWUFDekMsY0FBYyxhQUFhLHlCQUF5QjtBQUFBLFVBQ3JEO0FBQUEsUUFDRDtBQUFBLFFBQ0EsSUFBSSxhQUFhO0FBQ2hCLGlCQUFPLEtBQUs7QUFBQSxRQUNiO0FBQUEsUUFDQSxJQUFJLGNBQWM7QUFDakIsY0FBSSxLQUFLLGFBQWEsUUFBUTtBQUM3QixtQkFBTyxFQUFFLGFBQWEsS0FBSyxTQUFTLFlBQVksRUFBRTtBQUFBLFVBQ25EO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQUEsUUFDQSxDQUFDLHVCQUFPLElBQUksbUJBQW1CLENBQUMsSUFBSTtBQUNuQyxpQkFBTyxrQkFBa0IsS0FBSyxTQUFTLElBQUksU0FBUyxDQUFDO0FBQUEsUUFDdEQ7QUFBQSxNQUNEO0FBRUEsNkJBQXNCLG9CQUFvQixJQUFJLEtBQUssU0FBUyxJQUFJO0FBQUEsSUFDakU7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGtCQUFrQixPQUFnQjtBQUNqQyxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBRUEscUJBQXFCLE9BQXFDO0FBQ3pELFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVBLGtCQUFrQixZQUEwQztBQUMzRCxTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBLEVBRVEsa0JBQWtCLE9BQXFDO0FBQzlELFNBQUssT0FBTyxrQkFBa0IsS0FBSyxJQUFJLE1BQU0sSUFBSSxpQkFBaUIsY0FBYyxJQUFJLENBQUM7QUFBQSxFQUN0RjtBQUFBLEVBRUEsa0JBQWtCLE9BQXNDO0FBQ3ZELFNBQUssY0FBYztBQUFBLEVBQ3BCO0FBQ0Q7QUE3RmEsdUJBRVcsc0JBQXNCLG9CQUFJLFFBQXNEO0FBRmpHLElBQU0sd0JBQU47IiwKICAibmFtZXMiOiBbXQp9Cg==
