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
import { groupBy } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { extUri } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IChatContextPickService, picksWithPromiseFn } from "../../chat/browser/attachments/chatContextPickService.js";
import { IDiagnosticVariableEntryFilterData } from "../../chat/common/attachments/chatVariableEntries.js";
let MarkerChatContextPick = class {
  constructor(_markerService, _labelService, _editorService) {
    this._markerService = _markerService;
    this._labelService = _labelService;
    this._editorService = _editorService;
    this.type = "pickerPick";
    this.label = localize("chatContext.diagnstic", "Problems...");
    this.icon = Codicon.error;
    this.ordinal = -100;
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsProblemAttachments;
  }
  asPicker() {
    return {
      placeholder: localize("chatContext.diagnstic.placeholder", "Select a problem to attach"),
      picks: picksWithPromiseFn(async (query, token) => {
        return this.getPicksForQuery(query);
      })
    };
  }
  /**
   * @internal For testing purposes only
   */
  getPicksForQuery(query) {
    const markers = this._markerService.read({ severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
    const grouped = groupBy(markers, (a, b) => extUri.compare(a.resource, b.resource));
    const activeEditorUri = EditorResourceAccessor.getCanonicalUri(this._editorService.activeEditor);
    const sortedGroups = grouped.sort((groupA, groupB) => {
      const resourceA = groupA[0].resource;
      const resourceB = groupB[0].resource;
      if (activeEditorUri) {
        const isAActiveFile = extUri.isEqual(resourceA, activeEditorUri);
        const isBActiveFile = extUri.isEqual(resourceB, activeEditorUri);
        if (isAActiveFile && !isBActiveFile) {
          return -1;
        }
        if (!isAActiveFile && isBActiveFile) {
          return 1;
        }
      }
      return extUri.compare(resourceA, resourceB);
    });
    const severities = /* @__PURE__ */ new Set();
    const items = [];
    let pickCount = 0;
    for (const group of sortedGroups) {
      const resource = group[0].resource;
      const isActiveFile = activeEditorUri && extUri.isEqual(resource, activeEditorUri);
      const fileLabel = this._labelService.getUriLabel(resource, { relative: true });
      const separatorLabel = isActiveFile ? `${fileLabel} (current file)` : fileLabel;
      items.push({ type: "separator", label: separatorLabel });
      for (const marker of group) {
        pickCount++;
        severities.add(marker.severity);
        items.push({
          label: marker.message,
          description: localize("markers.panel.at.ln.col.number", "[Ln {0}, Col {1}]", "" + marker.startLineNumber, "" + marker.startColumn),
          asAttachment() {
            return IDiagnosticVariableEntryFilterData.toEntry(IDiagnosticVariableEntryFilterData.fromMarker(marker));
          }
        });
      }
    }
    items.unshift({
      label: localize("markers.panel.allErrors", "All Problems"),
      asAttachment() {
        return IDiagnosticVariableEntryFilterData.toEntry({
          filterSeverity: MarkerSeverity.Info
        });
      }
    });
    return items;
  }
};
MarkerChatContextPick = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IEditorService)
], MarkerChatContextPick);
let MarkerChatContextContribution = class extends Disposable {
  constructor(contextPickService, instantiationService) {
    super();
    this._store.add(contextPickService.registerChatContextItem(instantiationService.createInstance(MarkerChatContextPick)));
  }
};
MarkerChatContextContribution.ID = "workbench.contrib.chat.markerChatContextContribution";
MarkerChatContextContribution = __decorateClass([
  __decorateParam(0, IChatContextPickService),
  __decorateParam(1, IInstantiationService)
], MarkerChatContextContribution);
export {
  MarkerChatContextContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzQ2hhdENvbnRleHQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRleHRQaWNrZXJJdGVtLCBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbSwgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsIElDaGF0Q29udGV4dFBpY2tlciwgcGlja3NXaXRoUHJvbWlzZUZuIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRDb250ZXh0UGlja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5cbmNsYXNzIE1hcmtlckNoYXRDb250ZXh0UGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFBpY2tlckl0ZW0ge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAncGlja2VyUGljayc7XG5cdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ2NoYXRDb250ZXh0LmRpYWduc3RpYycsICdQcm9ibGVtcy4uLicpO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi5lcnJvcjtcblx0cmVhZG9ubHkgb3JkaW5hbCA9IC0xMDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0aXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpOiBQcm9taXNlPGJvb2xlYW4+IHwgYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNQcm9ibGVtQXR0YWNobWVudHM7XG5cdH1cblx0YXNQaWNrZXIoKTogSUNoYXRDb250ZXh0UGlja2VyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0Q29udGV4dC5kaWFnbnN0aWMucGxhY2Vob2xkZXInLCAnU2VsZWN0IGEgcHJvYmxlbSB0byBhdHRhY2gnKSxcblx0XHRcdHBpY2tzOiBwaWNrc1dpdGhQcm9taXNlRm4oYXN5bmMgKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRQaWNrc0ZvclF1ZXJ5KHF1ZXJ5KTtcblx0XHRcdH0pXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW50ZXJuYWwgRm9yIHRlc3RpbmcgcHVycG9zZXMgb25seVxuXHQgKi9cblx0Z2V0UGlja3NGb3JRdWVyeShxdWVyeTogc3RyaW5nKTogKElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSB7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMuX21hcmtlclNlcnZpY2UucmVhZCh7IHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB8IE1hcmtlclNldmVyaXR5LkluZm8gfSk7XG5cdFx0Y29uc3QgZ3JvdXBlZCA9IGdyb3VwQnkobWFya2VycywgKGEsIGIpID0+IGV4dFVyaS5jb21wYXJlKGEucmVzb3VyY2UsIGIucmVzb3VyY2UpKTtcblxuXHRcdC8vIEdldCB0aGUgYWN0aXZlIGVkaXRvciBVUkkgZm9yIHByaW9yaXRpemF0aW9uXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yVXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkodGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IpO1xuXG5cdFx0Ly8gU29ydCBncm91cHMgdG8gcHJpb3JpdGl6ZSBhY3RpdmUgZmlsZVxuXHRcdGNvbnN0IHNvcnRlZEdyb3VwcyA9IGdyb3VwZWQuc29ydCgoZ3JvdXBBLCBncm91cEIpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlQSA9IGdyb3VwQVswXS5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IHJlc291cmNlQiA9IGdyb3VwQlswXS5yZXNvdXJjZTtcblxuXHRcdFx0Ly8gSWYgb25lIGdyb3VwIGlzIGZyb20gdGhlIGFjdGl2ZSBmaWxlLCBwcmlvcml0aXplIGl0XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yVXJpKSB7XG5cdFx0XHRcdGNvbnN0IGlzQUFjdGl2ZUZpbGUgPSBleHRVcmkuaXNFcXVhbChyZXNvdXJjZUEsIGFjdGl2ZUVkaXRvclVyaSk7XG5cdFx0XHRcdGNvbnN0IGlzQkFjdGl2ZUZpbGUgPSBleHRVcmkuaXNFcXVhbChyZXNvdXJjZUIsIGFjdGl2ZUVkaXRvclVyaSk7XG5cblx0XHRcdFx0aWYgKGlzQUFjdGl2ZUZpbGUgJiYgIWlzQkFjdGl2ZUZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7IC8vIEEgY29tZXMgZmlyc3Rcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWlzQUFjdGl2ZUZpbGUgJiYgaXNCQWN0aXZlRmlsZSkge1xuXHRcdFx0XHRcdHJldHVybiAxOyAvLyBCIGNvbWVzIGZpcnN0XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gT3RoZXJ3aXNlLCBzb3J0IGJ5IHJlc291cmNlIFVSSSBhcyBiZWZvcmVcblx0XHRcdHJldHVybiBleHRVcmkuY29tcGFyZShyZXNvdXJjZUEsIHJlc291cmNlQik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXZlcml0aWVzID0gbmV3IFNldDxNYXJrZXJTZXZlcml0eT4oKTtcblx0XHRjb25zdCBpdGVtczogKElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXG5cdFx0bGV0IHBpY2tDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBzb3J0ZWRHcm91cHMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZ3JvdXBbMF0ucmVzb3VyY2U7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZUZpbGUgPSBhY3RpdmVFZGl0b3JVcmkgJiYgZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIGFjdGl2ZUVkaXRvclVyaSk7XG5cdFx0XHRjb25zdCBmaWxlTGFiZWwgPSB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzZXBhcmF0b3JMYWJlbCA9IGlzQWN0aXZlRmlsZSA/IGAke2ZpbGVMYWJlbH0gKGN1cnJlbnQgZmlsZSlgIDogZmlsZUxhYmVsO1xuXG5cdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBzZXBhcmF0b3JMYWJlbCB9KTtcblx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIGdyb3VwKSB7XG5cdFx0XHRcdHBpY2tDb3VudCsrO1xuXHRcdFx0XHRzZXZlcml0aWVzLmFkZChtYXJrZXIuc2V2ZXJpdHkpO1xuXG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBtYXJrZXIubWVzc2FnZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21hcmtlcnMucGFuZWwuYXQubG4uY29sLm51bWJlcicsIFwiW0xuIHswfSwgQ29sIHsxfV1cIiwgJycgKyBtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCAnJyArIG1hcmtlci5zdGFydENvbHVtbiksXG5cdFx0XHRcdFx0YXNBdHRhY2htZW50KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEudG9FbnRyeShJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLmZyb21NYXJrZXIobWFya2VyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpdGVtcy51bnNoaWZ0KHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWFya2Vycy5wYW5lbC5hbGxFcnJvcnMnLCAnQWxsIFByb2JsZW1zJyksXG5cdFx0XHRhc0F0dGFjaG1lbnQoKSB7XG5cdFx0XHRcdHJldHVybiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLnRvRW50cnkoe1xuXHRcdFx0XHRcdGZpbHRlclNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJDaGF0Q29udGV4dENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdC5tYXJrZXJDaGF0Q29udGV4dENvbnRyaWJ1dGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlIGNvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyQ2hhdENvbnRleHRQaWNrKSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCLHNCQUFzQjtBQUUvQyxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUE2RCx5QkFBNkMsMEJBQTBCO0FBQ3BJLFNBQVMsMENBQTBDO0FBR25ELElBQU0sd0JBQU4sTUFBOEQ7QUFBQSxFQU83RCxZQUNrQyxnQkFDRCxlQUNDLGdCQUNoQztBQUhnQztBQUNEO0FBQ0M7QUFSbEMs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
