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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IDebugService } from "./debug.js";
let ReplAccessibilityAnnouncer = class extends Disposable {
  constructor(debugService, accessibilityService, logService) {
    super();
    const viewModel = debugService.getViewModel();
    const mutableDispoable = this._register(new MutableDisposable());
    this._register(viewModel.onDidFocusSession((session) => {
      mutableDispoable.clear();
      if (!session) {
        return;
      }
      mutableDispoable.value = session.onDidChangeReplElements((element) => {
        if (!element || !("originalExpression" in element)) {
          return;
        }
        const value = element.toString();
        accessibilityService.status(value);
        logService.trace("ReplAccessibilityAnnouncer#onDidChangeReplElements", element.originalExpression + ": " + value);
      });
    }));
  }
};
ReplAccessibilityAnnouncer.ID = "debug.replAccessibilityAnnouncer";
ReplAccessibilityAnnouncer = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IAccessibilityService),
  __decorateParam(2, ILogService)
], ReplAccessibilityAnnouncer);
export {
  ReplAccessibilityAnnouncer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9yZXBsQWNjZXNzaWJpbGl0eUFubm91bmNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSB9IGZyb20gJy4vZGVidWcuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVwbEFjY2Vzc2liaWxpdHlBbm5vdW5jZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyBJRCA9ICdkZWJ1Zy5yZXBsQWNjZXNzaWJpbGl0eUFubm91bmNlcic7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpO1xuXHRcdGNvbnN0IG11dGFibGVEaXNwb2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld01vZGVsLm9uRGlkRm9jdXNTZXNzaW9uKChzZXNzaW9uKSA9PiB7XG5cdFx0XHRtdXRhYmxlRGlzcG9hYmxlLmNsZWFyKCk7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bXV0YWJsZURpc3BvYWJsZS52YWx1ZSA9IHNlc3Npb24ub25EaWRDaGFuZ2VSZXBsRWxlbWVudHMoKGVsZW1lbnQpID0+IHtcblx0XHRcdFx0aWYgKCFlbGVtZW50IHx8ICEoJ29yaWdpbmFsRXhwcmVzc2lvbicgaW4gZWxlbWVudCkpIHtcblx0XHRcdFx0XHQvLyBlbGVtZW50IHdhcyByZW1vdmVkIG9yIGhhc24ndCBiZWVuIHJlc29sdmVkIHlldFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVsZW1lbnQudG9TdHJpbmcoKTtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVNlcnZpY2Uuc3RhdHVzKHZhbHVlKTtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZSgnUmVwbEFjY2Vzc2liaWxpdHlBbm5vdW5jZXIjb25EaWRDaGFuZ2VSZXBsRWxlbWVudHMnLCBlbGVtZW50Lm9yaWdpbmFsRXhwcmVzc2lvbiArICc6ICcgKyB2YWx1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLHFCQUFxQjtBQUV2QixJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFFNUYsWUFDZ0IsY0FDUSxzQkFDVixZQUNaO0FBQ0QsVUFBTTtBQUNOLFVBQU0sWUFBWSxhQUFhLGFBQWE7QUFDNUMsVUFBTSxtQkFBbUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDL0QsU0FBSyxVQUFVLFVBQVUsa0JBQWtCLENBQUMsWUFBWTtBQUN2RCx1QkFBaUIsTUFBTTtBQUN2QixVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUNBLHVCQUFpQixRQUFRLFFBQVEsd0JBQXdCLENBQUMsWUFBWTtBQUNyRSxZQUFJLENBQUMsV0FBVyxFQUFFLHdCQUF3QixVQUFVO0FBRW5EO0FBQUEsUUFDRDtBQUNBLGNBQU0sUUFBUSxRQUFRLFNBQVM7QUFDL0IsNkJBQXFCLE9BQU8sS0FBSztBQUNqQyxtQkFBVyxNQUFNLHNEQUFzRCxRQUFRLHFCQUFxQixPQUFPLEtBQUs7QUFBQSxNQUNqSCxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUExQmEsMkJBQ0wsS0FBSztBQURBLDZCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFtdCn0K
