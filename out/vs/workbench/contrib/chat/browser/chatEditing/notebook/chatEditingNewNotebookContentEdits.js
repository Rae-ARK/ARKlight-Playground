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
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CellEditType } from "../../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
let ChatEditingNewNotebookContentEdits = class {
  constructor(notebook, _notebookService) {
    this.notebook = notebook;
    this._notebookService = _notebookService;
    this.textEdits = [];
  }
  acceptTextEdits(edits) {
    if (edits.length) {
      this.textEdits.push(...edits);
    }
  }
  async generateEdits() {
    if (this.notebook.cells.length) {
      console.error(`Notebook edits not generated as notebook already has cells`);
      return [];
    }
    const content = this.generateContent();
    if (!content) {
      return [];
    }
    const notebookEdits = [];
    try {
      const { serializer } = await this._notebookService.withNotebookDataProvider(this.notebook.viewType);
      const data = await serializer.dataToNotebook(VSBuffer.fromString(content));
      for (let i = 0; i < data.cells.length; i++) {
        notebookEdits.push({
          editType: CellEditType.Replace,
          index: i,
          count: 0,
          cells: [data.cells[i]]
        });
      }
    } catch (ex) {
      console.error(`Failed to generate notebook edits from text edits ${content}`, ex);
      return [];
    }
    return notebookEdits;
  }
  generateContent() {
    try {
      return applyTextEdits(this.textEdits);
    } catch (ex) {
      console.error("Failed to generate content from text edits", ex);
      return "";
    }
  }
};
ChatEditingNewNotebookContentEdits = __decorateClass([
  __decorateParam(1, INotebookService)
], ChatEditingNewNotebookContentEdits);
function applyTextEdits(edits) {
  let output = "";
  for (const edit of edits) {
    output = output.slice(0, edit.range.startColumn) + edit.text + output.slice(edit.range.endColumn);
  }
  return output;
}
export {
  ChatEditingNewNotebookContentEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9ub3RlYm9vay9jaGF0RWRpdGluZ05ld05vdGVib29rQ29udGVudEVkaXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIElDZWxsRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbm90ZWJvb2svY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5cblxuLyoqXG4gKiBXaGVuIGFza2luZyBMTE0gdG8gZ2VuZXJhdGUgYSBuZXcgbm90ZWJvb2ssIExMTSBtaWdodCBlbmQgdXAgZ2VuZXJhdGluZyB0aGUgbm90ZWJvb2tcbiAqIHVzaW5nIHRoZSByYXcgZmlsZSBmb3JtYXQuXG4gKiBFLmcuIGFzc3VtZSB3ZSBhc2sgTExNIHRvIGdlbmVyYXRlIGEgbmV3IEdpdGh1YiBJc3N1ZXMgbm90ZWJvb2ssIExMTSBtaWdodCBlbmQgdXBcbiAqIGdlbnJhdGluZyB0aGUgbm90ZWJvb2sgdXNpbmcgdGhlIEpTT04gZm9ybWF0IG9mIGdpdGh1YiBpc3N1ZXMgZmlsZS5cbiAqIFN1Y2ggYSBmb3JtYXQgaXMgbm90IGtub3duIHRvIGNvcGlsb3QgZXh0ZW5zaW9uIGFuZCB0aG9zZSBhcmUgc2VudCBvdmVyIGFzIHJlZ3VsYXJcbiAqIHRleHQgZWRpdHMgZm9yIHRoZSBOb3RlYm9vayBVUkkuXG4gKlxuICogSW4gc3VjaCBjYXNlcyB3ZSBzaG91bGQgYWNjdW11bGF0ZSBhbGwgb2YgdGhlIGVkaXRzLCBnZW5lcmF0ZSB0aGUgY29udGVudCBhbmQgZGVzZXJpYWxpemUgdGhlIGNvbnRlbnRcbiAqIGludG8gYSBub3RlYm9vaywgdGhlbiBnZW5lcmF0ZSBub3RlYm9va2UgZWRpdHMgdG8gaW5zZXJ0IHRoZXNlIGNlbGxzLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdOZXdOb3RlYm9va0NvbnRlbnRFZGl0cyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dEVkaXRzOiBUZXh0RWRpdFtdID0gW107XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhY2NlcHRUZXh0RWRpdHMoZWRpdHM6IFRleHRFZGl0W10pOiB2b2lkIHtcblx0XHRpZiAoZWRpdHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnRleHRFZGl0cy5wdXNoKC4uLmVkaXRzKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZW5lcmF0ZUVkaXRzKCk6IFByb21pc2U8SUNlbGxFZGl0T3BlcmF0aW9uW10+IHtcblx0XHRpZiAodGhpcy5ub3RlYm9vay5jZWxscy5sZW5ndGgpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYE5vdGVib29rIGVkaXRzIG5vdCBnZW5lcmF0ZWQgYXMgbm90ZWJvb2sgYWxyZWFkeSBoYXMgY2VsbHNgKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuZ2VuZXJhdGVDb250ZW50KCk7XG5cdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBzZXJpYWxpemVyIH0gPSBhd2FpdCB0aGlzLl9ub3RlYm9va1NlcnZpY2Uud2l0aE5vdGVib29rRGF0YVByb3ZpZGVyKHRoaXMubm90ZWJvb2sudmlld1R5cGUpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHNlcmlhbGl6ZXIuZGF0YVRvTm90ZWJvb2soVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGEuY2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0bm90ZWJvb2tFZGl0cy5wdXNoKHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IGksXG5cdFx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdFx0Y2VsbHM6IFtkYXRhLmNlbGxzW2ldXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGdlbmVyYXRlIG5vdGVib29rIGVkaXRzIGZyb20gdGV4dCBlZGl0cyAke2NvbnRlbnR9YCwgZXgpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBub3RlYm9va0VkaXRzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZUNvbnRlbnQoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhcHBseVRleHRFZGl0cyh0aGlzLnRleHRFZGl0cyk7XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBjb250ZW50IGZyb20gdGV4dCBlZGl0cycsIGV4KTtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gYXBwbHlUZXh0RWRpdHMoZWRpdHM6IFRleHRFZGl0W10pOiBzdHJpbmcge1xuXHRsZXQgb3V0cHV0ID0gJyc7XG5cdGZvciAoY29uc3QgZWRpdCBvZiBlZGl0cykge1xuXHRcdG91dHB1dCA9IG91dHB1dC5zbGljZSgwLCBlZGl0LnJhbmdlLnN0YXJ0Q29sdW1uKVxuXHRcdFx0KyBlZGl0LnRleHRcblx0XHRcdCsgb3V0cHV0LnNsaWNlKGVkaXQucmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXHRyZXR1cm4gb3V0cHV0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUd6QixTQUFTLG9CQUF3QztBQUNqRCxTQUFTLHdCQUF3QjtBQWMxQixJQUFNLHFDQUFOLE1BQXlDO0FBQUEsRUFFL0MsWUFDa0IsVUFDa0Isa0JBQ2xDO0FBRmdCO0FBQ2tCO0FBSHBDLFNBQWlCLFlBQXdCLENBQUM7QUFBQSxFQUsxQztBQUFBLEVBRUEsZ0JBQWdCLE9BQXlCO0FBQ3hDLFFBQUksTUFBTSxRQUFRO0FBQ2pCLFdBQUssVUFBVSxLQUFLLEdBQUcsS0FBSztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxnQkFBK0M7QUFDcEQsUUFBSSxLQUFLLFNBQVMsTUFBTSxRQUFRO0FBQy9CLGNBQVEsTUFBTSw0REFBNEQ7QUFDMUUsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sVUFBVSxLQUFLLGdCQUFnQjtBQUNyQyxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLGdCQUFzQyxDQUFDO0FBQzdDLFFBQUk7QUFDSCxZQUFNLEVBQUUsV0FBVyxJQUFJLE1BQU0sS0FBSyxpQkFBaUIseUJBQXlCLEtBQUssU0FBUyxRQUFRO0FBQ2xHLFlBQU0sT0FBTyxNQUFNLFdBQVcsZUFBZSxTQUFTLFdBQVcsT0FBTyxDQUFDO0FBQ3pFLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxNQUFNLFFBQVEsS0FBSztBQUMzQyxzQkFBYyxLQUFLO0FBQUEsVUFDbEIsVUFBVSxhQUFhO0FBQUEsVUFDdkIsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsT0FBTyxDQUFDLEtBQUssTUFBTSxDQUFDLENBQUM7QUFBQSxRQUN0QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsU0FBUyxJQUFJO0FBQ1osY0FBUSxNQUFNLHFEQUFxRCxPQUFPLElBQUksRUFBRTtBQUNoRixhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUFrQjtBQUN6QixRQUFJO0FBQ0gsYUFBTyxlQUFlLEtBQUssU0FBUztBQUFBLElBQ3JDLFNBQVMsSUFBSTtBQUNaLGNBQVEsTUFBTSw4Q0FBOEMsRUFBRTtBQUM5RCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDRDtBQXBEYSxxQ0FBTjtBQUFBLEVBSUo7QUFBQSxHQUpVO0FBc0RiLFNBQVMsZUFBZSxPQUEyQjtBQUNsRCxNQUFJLFNBQVM7QUFDYixhQUFXLFFBQVEsT0FBTztBQUN6QixhQUFTLE9BQU8sTUFBTSxHQUFHLEtBQUssTUFBTSxXQUFXLElBQzVDLEtBQUssT0FDTCxPQUFPLE1BQU0sS0FBSyxNQUFNLFNBQVM7QUFBQSxFQUNyQztBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
