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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
let TableColumnResizeQuickPick = class extends Disposable {
  constructor(_table, _quickInputService) {
    super();
    this._table = _table;
    this._quickInputService = _quickInputService;
  }
  async show() {
    const items = [];
    this._table.getColumnLabels().forEach((label, index) => {
      if (label) {
        items.push({ label, index });
      }
    });
    const column = await this._quickInputService.pick(items, { placeHolder: localize("table.column.selection", "Select the column to resize, type to filter.") });
    if (!column) {
      return;
    }
    const value = await this._quickInputService.input({
      placeHolder: localize("table.column.resizeValue.placeHolder", "i.e. 20, 60, 100..."),
      prompt: localize("table.column.resizeValue.prompt", "Please enter a width in percentage for the '{0}' column.", column.label),
      validateInput: (input) => this._validateColumnResizeValue(input)
    });
    const percentageValue = value ? Number.parseInt(value) : void 0;
    if (!percentageValue) {
      return;
    }
    this._table.resizeColumn(column.index, percentageValue);
  }
  async _validateColumnResizeValue(input) {
    const percentage = Number.parseInt(input);
    if (input && !Number.isInteger(percentage)) {
      return localize("table.column.resizeValue.invalidType", "Please enter an integer.");
    } else if (percentage < 0 || percentage > 100) {
      return localize("table.column.resizeValue.invalidRange", "Please enter a number greater than 0 and less than or equal to 100.");
    }
    return null;
  }
};
TableColumnResizeQuickPick = __decorateClass([
  __decorateParam(1, IQuickInputService)
], TableColumnResizeQuickPick);
export {
  TableColumnResizeQuickPick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xpc3QvYnJvd3Nlci90YWJsZUNvbHVtblJlc2l6ZVF1aWNrUGljay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlV2lkZ2V0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcblxuaW50ZXJmYWNlIElDb2x1bW5SZXNpemVRdWlja1BpY2tJdGVtIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgVGFibGVDb2x1bW5SZXNpemVRdWlja1BpY2sgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFibGU6IFRhYmxlPHVua25vd24+LFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHNob3coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXRlbXM6IElDb2x1bW5SZXNpemVRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHR0aGlzLl90YWJsZS5nZXRDb2x1bW5MYWJlbHMoKS5mb3JFYWNoKChsYWJlbCwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHsgbGFiZWwsIGluZGV4IH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbHVtbiA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2s8SUNvbHVtblJlc2l6ZVF1aWNrUGlja0l0ZW0+KGl0ZW1zLCB7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgndGFibGUuY29sdW1uLnNlbGVjdGlvbicsIFwiU2VsZWN0IHRoZSBjb2x1bW4gdG8gcmVzaXplLCB0eXBlIHRvIGZpbHRlci5cIikgfSk7XG5cdFx0aWYgKCFjb2x1bW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3RhYmxlLmNvbHVtbi5yZXNpemVWYWx1ZS5wbGFjZUhvbGRlcicsIFwiaS5lLiAyMCwgNjAsIDEwMC4uLlwiKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ3RhYmxlLmNvbHVtbi5yZXNpemVWYWx1ZS5wcm9tcHQnLCBcIlBsZWFzZSBlbnRlciBhIHdpZHRoIGluIHBlcmNlbnRhZ2UgZm9yIHRoZSAnezB9JyBjb2x1bW4uXCIsIGNvbHVtbi5sYWJlbCksXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiAoaW5wdXQ6IHN0cmluZykgPT4gdGhpcy5fdmFsaWRhdGVDb2x1bW5SZXNpemVWYWx1ZShpbnB1dClcblx0XHR9KTtcblx0XHRjb25zdCBwZXJjZW50YWdlVmFsdWUgPSB2YWx1ZSA/IE51bWJlci5wYXJzZUludCh2YWx1ZSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFwZXJjZW50YWdlVmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdGFibGUucmVzaXplQ29sdW1uKGNvbHVtbi5pbmRleCwgcGVyY2VudGFnZVZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3ZhbGlkYXRlQ29sdW1uUmVzaXplVmFsdWUoaW5wdXQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBlcmNlbnRhZ2UgPSBOdW1iZXIucGFyc2VJbnQoaW5wdXQpO1xuXHRcdGlmIChpbnB1dCAmJiAhTnVtYmVyLmlzSW50ZWdlcihwZXJjZW50YWdlKSkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0YWJsZS5jb2x1bW4ucmVzaXplVmFsdWUuaW52YWxpZFR5cGUnLCBcIlBsZWFzZSBlbnRlciBhbiBpbnRlZ2VyLlwiKTtcblx0XHR9IGVsc2UgaWYgKHBlcmNlbnRhZ2UgPCAwIHx8IHBlcmNlbnRhZ2UgPiAxMDApIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGFibGUuY29sdW1uLnJlc2l6ZVZhbHVlLmludmFsaWRSYW5nZScsIFwiUGxlYXNlIGVudGVyIGEgbnVtYmVyIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gMTAwLlwiKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEM7QUFNNUMsSUFBTSw2QkFBTixjQUF5QyxXQUFXO0FBQUEsRUFDMUQsWUFDa0IsUUFDb0Isb0JBQ3BDO0FBQ0QsVUFBTTtBQUhXO0FBQ29CO0FBQUEsRUFHdEM7QUFBQSxFQUVBLE1BQU0sT0FBc0I7QUFDM0IsVUFBTSxRQUFzQyxDQUFDO0FBQzdDLFNBQUssT0FBTyxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsT0FBTyxVQUFVO0FBQ3ZELFVBQUksT0FBTztBQUNWLGNBQU0sS0FBSyxFQUFFLE9BQU8sTUFBTSxDQUFDO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxLQUFLLG1CQUFtQixLQUFpQyxPQUFPLEVBQUUsYUFBYSxTQUFTLDBCQUEwQiw4Q0FBOEMsRUFBRSxDQUFDO0FBQ3hMLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLE1BQU0sS0FBSyxtQkFBbUIsTUFBTTtBQUFBLE1BQ2pELGFBQWEsU0FBUyx3Q0FBd0MscUJBQXFCO0FBQUEsTUFDbkYsUUFBUSxTQUFTLG1DQUFtQyw0REFBNEQsT0FBTyxLQUFLO0FBQUEsTUFDNUgsZUFBZSxDQUFDLFVBQWtCLEtBQUssMkJBQTJCLEtBQUs7QUFBQSxJQUN4RSxDQUFDO0FBQ0QsVUFBTSxrQkFBa0IsUUFBUSxPQUFPLFNBQVMsS0FBSyxJQUFJO0FBQ3pELFFBQUksQ0FBQyxpQkFBaUI7QUFDckI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxPQUFPLGFBQWEsT0FBTyxPQUFPLGVBQWU7QUFBQSxFQUN2RDtBQUFBLEVBRUEsTUFBYywyQkFBMkIsT0FBNkY7QUFDckksVUFBTSxhQUFhLE9BQU8sU0FBUyxLQUFLO0FBQ3hDLFFBQUksU0FBUyxDQUFDLE9BQU8sVUFBVSxVQUFVLEdBQUc7QUFDM0MsYUFBTyxTQUFTLHdDQUF3QywwQkFBMEI7QUFBQSxJQUNuRixXQUFXLGFBQWEsS0FBSyxhQUFhLEtBQUs7QUFDOUMsYUFBTyxTQUFTLHlDQUF5QyxxRUFBcUU7QUFBQSxJQUMvSDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF4Q2EsNkJBQU47QUFBQSxFQUdKO0FBQUEsR0FIVTsiLAogICJuYW1lcyI6IFtdCn0K
