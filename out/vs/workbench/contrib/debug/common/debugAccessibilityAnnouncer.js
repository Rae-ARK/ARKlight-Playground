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
import { IDebugService } from "./debug.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Expression } from "./debugModel.js";
let DebugWatchAccessibilityAnnouncer = class extends Disposable {
  constructor(_debugService, _logService, _accessibilityService, _configurationService) {
    super();
    this._debugService = _debugService;
    this._logService = _logService;
    this._accessibilityService = _accessibilityService;
    this._configurationService = _configurationService;
    this._listener = this._register(new MutableDisposable());
    this._setListener();
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("accessibility.debugWatchVariableAnnouncements")) {
        this._setListener();
      }
    }));
  }
  _setListener() {
    const value = this._configurationService.getValue("accessibility.debugWatchVariableAnnouncements");
    if (value && !this._listener.value) {
      this._listener.value = this._debugService.getModel().onDidChangeWatchExpressionValue((e) => {
        if (!e || e.value === Expression.DEFAULT_VALUE) {
          return;
        }
        this._accessibilityService.alert(`${e.name} = ${e.value}`);
        this._logService.trace(`debugAccessibilityAnnouncerValueChanged ${e.name} ${e.value}`);
      });
    } else {
      this._listener.clear();
    }
  }
};
DebugWatchAccessibilityAnnouncer.ID = "workbench.contrib.debugWatchAccessibilityAnnouncer";
DebugWatchAccessibilityAnnouncer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IAccessibilityService),
  __decorateParam(3, IConfigurationService)
], DebugWatchAccessibilityAnnouncer);
export {
  DebugWatchAccessibilityAnnouncer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z0FjY2Vzc2liaWxpdHlBbm5vdW5jZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4cHJlc3Npb24gfSBmcm9tICcuL2RlYnVnTW9kZWwuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdXYXRjaEFjY2Vzc2liaWxpdHlBbm5vdW5jZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5kZWJ1Z1dhdGNoQWNjZXNzaWJpbGl0eUFubm91bmNlcic7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NldExpc3RlbmVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdhY2Nlc3NpYmlsaXR5LmRlYnVnV2F0Y2hWYXJpYWJsZUFubm91bmNlbWVudHMnKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRMaXN0ZW5lcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldExpc3RlbmVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkuZGVidWdXYXRjaFZhcmlhYmxlQW5ub3VuY2VtZW50cycpO1xuXHRcdGlmICh2YWx1ZSAmJiAhdGhpcy5fbGlzdGVuZXIudmFsdWUpIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVyLnZhbHVlID0gdGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VXYXRjaEV4cHJlc3Npb25WYWx1ZSgoZSkgPT4ge1xuXHRcdFx0XHRpZiAoIWUgfHwgZS52YWx1ZSA9PT0gRXhwcmVzc2lvbi5ERUZBVUxUX1ZBTFVFKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVE9ETzogZ2V0IHVzZXIgZmVlZGJhY2ssIHBlcmhhcHMgc2V0dGluZyB0byBjb25maWd1cmUgdmVyYm9zaXR5ICsgd2hldGhlciB2YWx1ZSwgbmFtZSwgbmVpdGhlciwgb3IgYm90aCBhcmUgYW5ub3VuY2VkXG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGAke2UubmFtZX0gPSAke2UudmFsdWV9YCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYGRlYnVnQWNjZXNzaWJpbGl0eUFubm91bmNlclZhbHVlQ2hhbmdlZCAke2UubmFtZX0gJHtlLnZhbHVlfWApO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsWUFBeUIseUJBQXlCO0FBRTNELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBRXBCLElBQU0sbUNBQU4sY0FBK0MsV0FBNkM7QUFBQSxFQUdsRyxZQUNpQyxlQUNGLGFBQ1UsdUJBQ0EsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUwwQjtBQUNGO0FBQ1U7QUFDQTtBQUx6QyxTQUFpQixZQUE0QyxLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQVFsRyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxVQUFVLHNCQUFzQix5QkFBeUIsT0FBSztBQUNsRSxVQUFJLEVBQUUscUJBQXFCLCtDQUErQyxHQUFHO0FBQzVFLGFBQUssYUFBYTtBQUFBLE1BQ25CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxlQUFxQjtBQUM1QixVQUFNLFFBQVEsS0FBSyxzQkFBc0IsU0FBUywrQ0FBK0M7QUFDakcsUUFBSSxTQUFTLENBQUMsS0FBSyxVQUFVLE9BQU87QUFDbkMsV0FBSyxVQUFVLFFBQVEsS0FBSyxjQUFjLFNBQVMsRUFBRSxnQ0FBZ0MsQ0FBQyxNQUFNO0FBQzNGLFlBQUksQ0FBQyxLQUFLLEVBQUUsVUFBVSxXQUFXLGVBQWU7QUFDL0M7QUFBQSxRQUNEO0FBR0EsYUFBSyxzQkFBc0IsTUFBTSxHQUFHLEVBQUUsSUFBSSxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQ3pELGFBQUssWUFBWSxNQUFNLDJDQUEyQyxFQUFFLElBQUksSUFBSSxFQUFFLEtBQUssRUFBRTtBQUFBLE1BQ3RGLENBQUM7QUFBQSxJQUNGLE9BQU87QUFDTixXQUFLLFVBQVUsTUFBTTtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUNEO0FBbENhLGlDQUNMLEtBQUs7QUFEQSxtQ0FBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
