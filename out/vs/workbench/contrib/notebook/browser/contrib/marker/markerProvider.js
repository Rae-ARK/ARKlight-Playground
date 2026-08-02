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
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../../../common/contributions.js";
import { MarkerList, IMarkerNavigationService } from "../../../../../../editor/contrib/gotoError/browser/markerNavigationService.js";
import { CellUri } from "../../../common/notebookCommon.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../platform/markers/common/markers.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { NotebookOverviewRulerLane } from "../../notebookBrowser.js";
import { registerNotebookContribution } from "../../notebookEditorExtensions.js";
import { throttle } from "../../../../../../base/common/decorators.js";
import { editorErrorForeground, editorWarningForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { isEqual } from "../../../../../../base/common/resources.js";
let MarkerListProvider = class {
  constructor(_markerService, markerNavigation, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._dispoables = markerNavigation.registerProvider(this);
  }
  dispose() {
    this._dispoables.dispose();
  }
  getMarkerList(resource) {
    if (!resource) {
      return void 0;
    }
    const data = CellUri.parse(resource);
    if (!data) {
      return void 0;
    }
    return new MarkerList((uri) => {
      const otherData = CellUri.parse(uri);
      return otherData?.notebook.toString() === data.notebook.toString();
    }, this._markerService, this._configService);
  }
};
MarkerListProvider.ID = "workbench.contrib.markerListProvider";
MarkerListProvider = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IMarkerNavigationService),
  __decorateParam(2, IConfigurationService)
], MarkerListProvider);
let NotebookMarkerDecorationContribution = class extends Disposable {
  constructor(_notebookEditor, _markerService) {
    super();
    this._notebookEditor = _notebookEditor;
    this._markerService = _markerService;
    this._markersOverviewRulerDecorations = [];
    this._update();
    this._register(this._notebookEditor.onDidChangeModel(() => this._update()));
    this._register(this._markerService.onMarkerChanged((e) => {
      if (e.some((uri) => this._notebookEditor.getCellsInRange().some((cell) => isEqual(cell.uri, uri)))) {
        this._update();
      }
    }));
  }
  _update() {
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const cellDecorations = [];
    this._notebookEditor.getCellsInRange().forEach((cell) => {
      const marker = this._markerService.read({ resource: cell.uri, severities: MarkerSeverity.Error | MarkerSeverity.Warning });
      marker.forEach((m) => {
        const color = m.severity === MarkerSeverity.Error ? editorErrorForeground : editorWarningForeground;
        const range = { startLineNumber: m.startLineNumber, startColumn: m.startColumn, endLineNumber: m.endLineNumber, endColumn: m.endColumn };
        cellDecorations.push({
          handle: cell.handle,
          options: {
            overviewRuler: {
              color,
              modelRanges: [range],
              includeOutput: false,
              position: NotebookOverviewRulerLane.Right
            }
          }
        });
      });
    });
    this._markersOverviewRulerDecorations = this._notebookEditor.deltaCellDecorations(this._markersOverviewRulerDecorations, cellDecorations);
  }
};
NotebookMarkerDecorationContribution.id = "workbench.notebook.markerDecoration";
__decorateClass([
  throttle(100)
], NotebookMarkerDecorationContribution.prototype, "_update", 1);
NotebookMarkerDecorationContribution = __decorateClass([
  __decorateParam(1, IMarkerService)
], NotebookMarkerDecorationContribution);
registerWorkbenchContribution2(MarkerListProvider.ID, MarkerListProvider, WorkbenchPhase.BlockRestore);
registerNotebookContribution(NotebookMarkerDecorationContribution.id, NotebookMarkerDecorationContribution);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9tYXJrZXIvbWFya2VyUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElNYXJrZXJMaXN0UHJvdmlkZXIsIE1hcmtlckxpc3QsIElNYXJrZXJOYXZpZ2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9FcnJvci9icm93c2VyL21hcmtlck5hdmlnYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENlbGxVcmkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RlbHRhRGVjb3JhdGlvbiwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24sIE5vdGVib29rT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyB0aHJvdHRsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuXG5jbGFzcyBNYXJrZXJMaXN0UHJvdmlkZXIgaW1wbGVtZW50cyBJTWFya2VyTGlzdFByb3ZpZGVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubWFya2VyTGlzdFByb3ZpZGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb2FibGVzOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElNYXJrZXJOYXZpZ2F0aW9uU2VydmljZSBtYXJrZXJOYXZpZ2F0aW9uOiBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fZGlzcG9hYmxlcyA9IG1hcmtlck5hdmlnYXRpb24ucmVnaXN0ZXJQcm92aWRlcih0aGlzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fZGlzcG9hYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRNYXJrZXJMaXN0KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBNYXJrZXJMaXN0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gQ2VsbFVyaS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IE1hcmtlckxpc3QodXJpID0+IHtcblx0XHRcdGNvbnN0IG90aGVyRGF0YSA9IENlbGxVcmkucGFyc2UodXJpKTtcblx0XHRcdHJldHVybiBvdGhlckRhdGE/Lm5vdGVib29rLnRvU3RyaW5nKCkgPT09IGRhdGEubm90ZWJvb2sudG9TdHJpbmcoKTtcblx0XHR9LCB0aGlzLl9tYXJrZXJTZXJ2aWNlLCB0aGlzLl9jb25maWdTZXJ2aWNlKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va01hcmtlckRlY29yYXRpb25Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIGlkOiBzdHJpbmcgPSAnd29ya2JlbmNoLm5vdGVib29rLm1hcmtlckRlY29yYXRpb24nO1xuXHRwcml2YXRlIF9tYXJrZXJzT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90ZWJvb2tFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkKGUgPT4ge1xuXHRcdFx0aWYgKGUuc29tZSh1cmkgPT4gdGhpcy5fbm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbHNJblJhbmdlKCkuc29tZShjZWxsID0+IGlzRXF1YWwoY2VsbC51cmksIHVyaSkpKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRAdGhyb3R0bGUoMTAwKVxuXHRwcml2YXRlIF91cGRhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbERlY29yYXRpb25zOiBJTm90ZWJvb2tEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZSgpLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogY2VsbC51cmksIHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KTtcblx0XHRcdG1hcmtlci5mb3JFYWNoKG0gPT4ge1xuXHRcdFx0XHRjb25zdCBjb2xvciA9IG0uc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkVycm9yID8gZWRpdG9yRXJyb3JGb3JlZ3JvdW5kIDogZWRpdG9yV2FybmluZ0ZvcmVncm91bmQ7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IG0uc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogbS5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogbS5lbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IG0uZW5kQ29sdW1uIH07XG5cdFx0XHRcdGNlbGxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRoYW5kbGU6IGNlbGwuaGFuZGxlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0XHRcdFx0Y29sb3I6IGNvbG9yLFxuXHRcdFx0XHRcdFx0XHRtb2RlbFJhbmdlczogW3JhbmdlXSxcblx0XHRcdFx0XHRcdFx0aW5jbHVkZU91dHB1dDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBOb3RlYm9va092ZXJ2aWV3UnVsZXJMYW5lLlJpZ2h0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbWFya2Vyc092ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyA9IHRoaXMuX25vdGVib29rRWRpdG9yLmRlbHRhQ2VsbERlY29yYXRpb25zKHRoaXMuX21hcmtlcnNPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMsIGNlbGxEZWNvcmF0aW9ucyk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE1hcmtlckxpc3RQcm92aWRlci5JRCwgTWFya2VyTGlzdFByb3ZpZGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuXG5yZWdpc3Rlck5vdGVib29rQ29udHJpYnV0aW9uKE5vdGVib29rTWFya2VyRGVjb3JhdGlvbkNvbnRyaWJ1dGlvbi5pZCwgTm90ZWJvb2tNYXJrZXJEZWNvcmF0aW9uQ29udHJpYnV0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0Isc0NBQXNDO0FBQy9ELFNBQThCLFlBQVksZ0NBQWdDO0FBQzFFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQixzQkFBc0I7QUFDL0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBK0I7QUFDeEMsU0FBaUYsaUNBQWlDO0FBQ2xILFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCLCtCQUErQjtBQUMvRCxTQUFTLGVBQWU7QUFFeEIsSUFBTSxxQkFBTixNQUF3RDtBQUFBLEVBTXZELFlBQ2tDLGdCQUNQLGtCQUNjLGdCQUN2QztBQUhnQztBQUVPO0FBRXhDLFNBQUssY0FBYyxpQkFBaUIsaUJBQWlCLElBQUk7QUFBQSxFQUMxRDtBQUFBLEVBRUEsVUFBVTtBQUNULFNBQUssWUFBWSxRQUFRO0FBQUEsRUFDMUI7QUFBQSxFQUVBLGNBQWMsVUFBbUQ7QUFDaEUsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUTtBQUNuQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxJQUFJLFdBQVcsU0FBTztBQUM1QixZQUFNLFlBQVksUUFBUSxNQUFNLEdBQUc7QUFDbkMsYUFBTyxXQUFXLFNBQVMsU0FBUyxNQUFNLEtBQUssU0FBUyxTQUFTO0FBQUEsSUFDbEUsR0FBRyxLQUFLLGdCQUFnQixLQUFLLGNBQWM7QUFBQSxFQUM1QztBQUNEO0FBL0JNLG1CQUVXLEtBQUs7QUFGaEIscUJBQU47QUFBQSxFQU9HO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRHO0FBaUNOLElBQU0sdUNBQU4sY0FBbUQsV0FBa0Q7QUFBQSxFQUdwRyxZQUNrQixpQkFDZ0IsZ0JBQ2hDO0FBQ0QsVUFBTTtBQUhXO0FBQ2dCO0FBSGxDLFNBQVEsbUNBQTZDLENBQUM7QUFPckQsU0FBSyxRQUFRO0FBQ2IsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLGlCQUFpQixNQUFNLEtBQUssUUFBUSxDQUFDLENBQUM7QUFDMUUsU0FBSyxVQUFVLEtBQUssZUFBZSxnQkFBZ0IsT0FBSztBQUN2RCxVQUFJLEVBQUUsS0FBSyxTQUFPLEtBQUssZ0JBQWdCLGdCQUFnQixFQUFFLEtBQUssVUFBUSxRQUFRLEtBQUssS0FBSyxHQUFHLENBQUMsQ0FBQyxHQUFHO0FBQy9GLGFBQUssUUFBUTtBQUFBLE1BQ2Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUdRLFVBQVU7QUFDakIsUUFBSSxDQUFDLEtBQUssZ0JBQWdCLFNBQVMsR0FBRztBQUNyQztBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUE4QyxDQUFDO0FBQ3JELFNBQUssZ0JBQWdCLGdCQUFnQixFQUFFLFFBQVEsVUFBUTtBQUN0RCxZQUFNLFNBQVMsS0FBSyxlQUFlLEtBQUssRUFBRSxVQUFVLEtBQUssS0FBSyxZQUFZLGVBQWUsUUFBUSxlQUFlLFFBQVEsQ0FBQztBQUN6SCxhQUFPLFFBQVEsT0FBSztBQUNuQixjQUFNLFFBQVEsRUFBRSxhQUFhLGVBQWUsUUFBUSx3QkFBd0I7QUFDNUUsY0FBTSxRQUFRLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLGFBQWEsRUFBRSxhQUFhLGVBQWUsRUFBRSxlQUFlLFdBQVcsRUFBRSxVQUFVO0FBQ3ZJLHdCQUFnQixLQUFLO0FBQUEsVUFDcEIsUUFBUSxLQUFLO0FBQUEsVUFDYixTQUFTO0FBQUEsWUFDUixlQUFlO0FBQUEsY0FDZDtBQUFBLGNBQ0EsYUFBYSxDQUFDLEtBQUs7QUFBQSxjQUNuQixlQUFlO0FBQUEsY0FDZixVQUFVLDBCQUEwQjtBQUFBLFlBQ3JDO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssbUNBQW1DLEtBQUssZ0JBQWdCLHFCQUFxQixLQUFLLGtDQUFrQyxlQUFlO0FBQUEsRUFDekk7QUFDRDtBQTlDTSxxQ0FDRSxLQUFhO0FBa0JaO0FBQUEsRUFEUCxTQUFTLEdBQUc7QUFBQSxHQWxCUixxQ0FtQkc7QUFuQkgsdUNBQU47QUFBQSxFQUtHO0FBQUEsR0FMRztBQWdETiwrQkFBK0IsbUJBQW1CLElBQUksb0JBQW9CLGVBQWUsWUFBWTtBQUVyRyw2QkFBNkIscUNBQXFDLElBQUksb0NBQW9DOyIsCiAgIm5hbWVzIjogW10KfQo=
