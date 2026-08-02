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
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { listErrorForeground, listWarningForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
class MarkersDecorationsProvider {
  constructor(_markerService) {
    this._markerService = _markerService;
    this.label = localize("label", "Problems");
    this.onDidChange = _markerService.onMarkerChanged;
  }
  provideDecorations(resource) {
    const markers = this._markerService.read({
      resource,
      severities: MarkerSeverity.Error | MarkerSeverity.Warning
    });
    let first;
    for (const marker of markers) {
      if (!first || marker.severity > first.severity) {
        first = marker;
      }
    }
    if (!first) {
      return void 0;
    }
    return {
      weight: 100 * first.severity,
      bubble: true,
      tooltip: markers.length === 1 ? localize("tooltip.1", "1 problem in this file") : localize("tooltip.N", "{0} problems in this file", markers.length),
      letter: markers.length < 10 ? markers.length.toString() : "9+",
      color: first.severity === MarkerSeverity.Error ? listErrorForeground : listWarningForeground
    };
  }
}
let MarkersFileDecorations = class {
  constructor(_markerService, _decorationsService, _configurationService) {
    this._markerService = _markerService;
    this._decorationsService = _decorationsService;
    this._configurationService = _configurationService;
    this._disposables = [
      this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("problems.visibility")) {
          this._updateEnablement();
        }
      })
    ];
    this._updateEnablement();
  }
  dispose() {
    dispose(this._provider);
    dispose(this._disposables);
  }
  _updateEnablement() {
    const problem = this._configurationService.getValue("problems.visibility");
    if (problem === void 0) {
      return;
    }
    const value = this._configurationService.getValue("problems");
    const shouldEnable = problem && value.decorations.enabled;
    if (shouldEnable === this._enabled) {
      if (!problem || !value.decorations.enabled) {
        this._provider?.dispose();
        this._provider = void 0;
      }
      return;
    }
    this._enabled = shouldEnable;
    if (this._enabled) {
      const provider = new MarkersDecorationsProvider(this._markerService);
      this._provider = this._decorationsService.registerDecorationsProvider(provider);
    } else if (this._provider) {
      this._provider.dispose();
    }
  }
};
MarkersFileDecorations = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IDecorationsService),
  __decorateParam(2, IConfigurationService)
], MarkersFileDecorations);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  "id": "problems",
  "order": 101,
  "type": "object",
  "properties": {
    "problems.decorations.enabled": {
      "markdownDescription": localize("markers.showOnFile", "Show Errors & Warnings on files and folder. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    }
  }
});
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(MarkersFileDecorations, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzRmlsZURlY29yYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIElNYXJrZXIsIE1hcmtlclNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxpc3RFcnJvckZvcmVncm91bmQsIGxpc3RXYXJuaW5nRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuY2xhc3MgTWFya2Vyc0RlY29yYXRpb25zUHJvdmlkZXIgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IGxvY2FsaXplKCdsYWJlbCcsIFwiUHJvYmxlbXNcIik7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxyZWFkb25seSBVUklbXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5vbkRpZENoYW5nZSA9IF9tYXJrZXJTZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZDtcblx0fVxuXG5cdHByb3ZpZGVEZWNvcmF0aW9ucyhyZXNvdXJjZTogVVJJKTogSURlY29yYXRpb25EYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXJrZXJzID0gdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0c2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nXG5cdFx0fSk7XG5cdFx0bGV0IGZpcnN0OiBJTWFya2VyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgbWFya2VyIG9mIG1hcmtlcnMpIHtcblx0XHRcdGlmICghZmlyc3QgfHwgbWFya2VyLnNldmVyaXR5ID4gZmlyc3Quc2V2ZXJpdHkpIHtcblx0XHRcdFx0Zmlyc3QgPSBtYXJrZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFmaXJzdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d2VpZ2h0OiAxMDAgKiBmaXJzdC5zZXZlcml0eSxcblx0XHRcdGJ1YmJsZTogdHJ1ZSxcblx0XHRcdHRvb2x0aXA6IG1hcmtlcnMubGVuZ3RoID09PSAxID8gbG9jYWxpemUoJ3Rvb2x0aXAuMScsIFwiMSBwcm9ibGVtIGluIHRoaXMgZmlsZVwiKSA6IGxvY2FsaXplKCd0b29sdGlwLk4nLCBcInswfSBwcm9ibGVtcyBpbiB0aGlzIGZpbGVcIiwgbWFya2Vycy5sZW5ndGgpLFxuXHRcdFx0bGV0dGVyOiBtYXJrZXJzLmxlbmd0aCA8IDEwID8gbWFya2Vycy5sZW5ndGgudG9TdHJpbmcoKSA6ICc5KycsXG5cdFx0XHRjb2xvcjogZmlyc3Quc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkVycm9yID8gbGlzdEVycm9yRm9yZWdyb3VuZCA6IGxpc3RXYXJuaW5nRm9yZWdyb3VuZCxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlcnNGaWxlRGVjb3JhdGlvbnMgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSBfcHJvdmlkZXI/OiBJRGlzcG9zYWJsZTtcblx0cHJpdmF0ZSBfZW5hYmxlZD86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMgPSBbXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdwcm9ibGVtcy52aXNpYmlsaXR5JykpIHtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVFbmFibGVtZW50KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdF07XG5cdFx0dGhpcy5fdXBkYXRlRW5hYmxlbWVudCgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX3Byb3ZpZGVyKTtcblx0XHRkaXNwb3NlKHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUVuYWJsZW1lbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvYmxlbSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdwcm9ibGVtcy52aXNpYmlsaXR5Jyk7XG5cdFx0aWYgKHByb2JsZW0gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgZGVjb3JhdGlvbnM6IHsgZW5hYmxlZDogYm9vbGVhbiB9IH0+KCdwcm9ibGVtcycpO1xuXHRcdGNvbnN0IHNob3VsZEVuYWJsZSA9IChwcm9ibGVtICYmIHZhbHVlLmRlY29yYXRpb25zLmVuYWJsZWQpO1xuXG5cdFx0aWYgKHNob3VsZEVuYWJsZSA9PT0gdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0aWYgKCFwcm9ibGVtIHx8ICF2YWx1ZS5kZWNvcmF0aW9ucy5lbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VuYWJsZWQgPSBzaG91bGRFbmFibGUgYXMgYm9vbGVhbjtcblx0XHRpZiAodGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTWFya2Vyc0RlY29yYXRpb25zUHJvdmlkZXIodGhpcy5fbWFya2VyU2VydmljZSk7XG5cdFx0XHR0aGlzLl9wcm92aWRlciA9IHRoaXMuX2RlY29yYXRpb25zU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25zUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fcHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0J2lkJzogJ3Byb2JsZW1zJyxcblx0J29yZGVyJzogMTAxLFxuXHQndHlwZSc6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQncHJvYmxlbXMuZGVjb3JhdGlvbnMuZW5hYmxlZCc6IHtcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ21hcmtlcnMuc2hvd09uRmlsZScsIFwiU2hvdyBFcnJvcnMgJiBXYXJuaW5ncyBvbiBmaWxlcyBhbmQgZm9sZGVyLiBPdmVyd3JpdHRlbiBieSB7MH0gd2hlbiBpdCBpcyBvZmYuXCIsICdgI3Byb2JsZW1zLnZpc2liaWxpdHkjYCcpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWVcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyByZWdpc3RlciBmaWxlIGRlY29yYXRpb25zXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaClcblx0LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE1hcmtlcnNGaWxlRGVjb3JhdGlvbnMsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBa0UsY0FBYywyQkFBMkI7QUFDM0csU0FBUyxnQkFBeUIsc0JBQXNCO0FBQ3hELFNBQVMsMkJBQWtFO0FBQzNFLFNBQXNCLGVBQWU7QUFHckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNE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
