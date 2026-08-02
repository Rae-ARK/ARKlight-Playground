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
import * as DOM from "../../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { EXPAND_CELL_OUTPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { CellContentPart } from "../cellPart.js";
const $ = DOM.$;
let CollapsedCellOutput = class extends CellContentPart {
  constructor(notebookEditor, cellOutputCollapseContainer, keybindingService) {
    super();
    this.notebookEditor = notebookEditor;
    const placeholder = DOM.append(cellOutputCollapseContainer, $("span.expandOutputPlaceholder"));
    placeholder.textContent = localize("cellOutputsCollapsedMsg", "Outputs are collapsed");
    const expandIcon = DOM.append(cellOutputCollapseContainer, $("span.expandOutputIcon"));
    expandIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.more));
    const keybinding = keybindingService.lookupKeybinding(EXPAND_CELL_OUTPUT_COMMAND_ID);
    if (keybinding) {
      placeholder.title = localize("cellExpandOutputButtonLabelWithDoubleClick", "Double-click to expand cell output ({0})", keybinding.getLabel());
      cellOutputCollapseContainer.title = localize("cellExpandOutputButtonLabel", "Expand Cell Output (${0})", keybinding.getLabel());
    }
    DOM.hide(cellOutputCollapseContainer);
    this._register(DOM.addDisposableListener(expandIcon, DOM.EventType.CLICK, () => this.expand()));
    this._register(DOM.addDisposableListener(cellOutputCollapseContainer, DOM.EventType.DBLCLICK, () => this.expand()));
  }
  expand() {
    if (!this.currentCell) {
      return;
    }
    if (!this.currentCell) {
      return;
    }
    const textModel = this.notebookEditor.textModel;
    const index = textModel.cells.indexOf(this.currentCell.model);
    if (index < 0) {
      return;
    }
    this.currentCell.isOutputCollapsed = !this.currentCell.isOutputCollapsed;
  }
};
CollapsedCellOutput = __decorateClass([
  __decorateParam(2, IKeybindingService)
], CollapsedCellOutput);
export {
  CollapsedCellOutput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY29sbGFwc2VkQ2VsbE91dHB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBFWFBBTkRfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCwgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IENlbGxDb250ZW50UGFydCB9IGZyb20gJy4uL2NlbGxQYXJ0LmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2VkQ2VsbE91dHB1dCBleHRlbmRzIENlbGxDb250ZW50UGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvcixcblx0XHRjZWxsT3V0cHV0Q29sbGFwc2VDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBET00uYXBwZW5kKGNlbGxPdXRwdXRDb2xsYXBzZUNvbnRhaW5lciwgJCgnc3Bhbi5leHBhbmRPdXRwdXRQbGFjZWhvbGRlcicpKSBhcyBIVE1MRWxlbWVudDtcblx0XHRwbGFjZWhvbGRlci50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjZWxsT3V0cHV0c0NvbGxhcHNlZE1zZycsIFwiT3V0cHV0cyBhcmUgY29sbGFwc2VkXCIpO1xuXHRcdGNvbnN0IGV4cGFuZEljb24gPSBET00uYXBwZW5kKGNlbGxPdXRwdXRDb2xsYXBzZUNvbnRhaW5lciwgJCgnc3Bhbi5leHBhbmRPdXRwdXRJY29uJykpO1xuXHRcdGV4cGFuZEljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLm1vcmUpKTtcblxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEVYUEFORF9DRUxMX09VVFBVVF9DT01NQU5EX0lEKTtcblx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0cGxhY2Vob2xkZXIudGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4cGFuZE91dHB1dEJ1dHRvbkxhYmVsV2l0aERvdWJsZUNsaWNrJywgXCJEb3VibGUtY2xpY2sgdG8gZXhwYW5kIGNlbGwgb3V0cHV0ICh7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSk7XG5cdFx0XHRjZWxsT3V0cHV0Q29sbGFwc2VDb250YWluZXIudGl0bGUgPSBsb2NhbGl6ZSgnY2VsbEV4cGFuZE91dHB1dEJ1dHRvbkxhYmVsJywgXCJFeHBhbmQgQ2VsbCBPdXRwdXQgKCR7MH0pXCIsIGtleWJpbmRpbmcuZ2V0TGFiZWwoKSk7XG5cdFx0fVxuXG5cdFx0RE9NLmhpZGUoY2VsbE91dHB1dENvbGxhcHNlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZXhwYW5kSWNvbiwgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5leHBhbmQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2VsbE91dHB1dENvbGxhcHNlQ29udGFpbmVyLCBET00uRXZlbnRUeXBlLkRCTENMSUNLLCAoKSA9PiB0aGlzLmV4cGFuZCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGV4cGFuZCgpIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudENlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY3VycmVudENlbGwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLm5vdGVib29rRWRpdG9yLnRleHRNb2RlbCE7XG5cdFx0Y29uc3QgaW5kZXggPSB0ZXh0TW9kZWwuY2VsbHMuaW5kZXhPZih0aGlzLmN1cnJlbnRDZWxsLm1vZGVsKTtcblxuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRDZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gIXRoaXMuY3VycmVudENlbGwuaXNPdXRwdXRDb2xsYXBzZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFDQUFzRDtBQUMvRCxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLElBQUksSUFBSTtBQUVQLElBQU0sc0JBQU4sY0FBa0MsZ0JBQWdCO0FBQUEsRUFDeEQsWUFDa0IsZ0JBQ2pCLDZCQUNvQixtQkFDbkI7QUFDRCxVQUFNO0FBSlc7QUFNakIsVUFBTSxjQUFjLElBQUksT0FBTyw2QkFBNkIsRUFBRSw4QkFBOEIsQ0FBQztBQUM3RixnQkFBWSxjQUFjLFNBQVMsMkJBQTJCLHVCQUF1QjtBQUNyRixVQUFNLGFBQWEsSUFBSSxPQUFPLDZCQUE2QixFQUFFLHVCQUF1QixDQUFDO0FBQ3JGLGVBQVcsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxJQUFJLENBQUM7QUFFcEUsVUFBTSxhQUFhLGtCQUFrQixpQkFBaUIsNkJBQTZCO0FBQ25GLFFBQUksWUFBWTtBQUNmLGtCQUFZLFFBQVEsU0FBUyw4Q0FBOEMsNENBQTRDLFdBQVcsU0FBUyxDQUFDO0FBQzVJLGtDQUE0QixRQUFRLFNBQVMsK0JBQStCLDZCQUE2QixXQUFXLFNBQVMsQ0FBQztBQUFBLElBQy9IO0FBRUEsUUFBSSxLQUFLLDJCQUEyQjtBQUVwQyxTQUFLLFVBQVUsSUFBSSxzQkFBc0IsWUFBWSxJQUFJLFVBQVUsT0FBTyxNQUFNLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDOUYsU0FBSyxVQUFVLElBQUksc0JBQXNCLDZCQUE2QixJQUFJLFVBQVUsVUFBVSxNQUFNLEtBQUssT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNuSDtBQUFBLEVBRVEsU0FBUztBQUNoQixRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLEtBQUssZUFBZTtBQUN0QyxVQUFNLFFBQVEsVUFBVSxNQUFNLFFBQVEsS0FBSyxZQUFZLEtBQUs7QUFFNUQsUUFBSSxRQUFRLEdBQUc7QUFDZDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFlBQVksb0JBQW9CLENBQUMsS0FBSyxZQUFZO0FBQUEsRUFDeEQ7QUFDRDtBQTNDYSxzQkFBTjtBQUFBLEVBSUo7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
