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
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorunWithStore, observableFromEvent } from "../../../../base/common/observable.js";
import { IAccessibilitySignalService, AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IDebugService } from "../../debug/common/debug.js";
let AccessibilitySignalLineDebuggerContribution = class extends Disposable {
  constructor(debugService, accessibilitySignalService) {
    super();
    this.accessibilitySignalService = accessibilitySignalService;
    const isEnabled = observableFromEvent(
      this,
      accessibilitySignalService.onSoundEnabledChanged(AccessibilitySignal.onDebugBreak),
      () => accessibilitySignalService.isSoundEnabled(AccessibilitySignal.onDebugBreak)
    );
    this._register(autorunWithStore((reader, store) => {
      if (!isEnabled.read(reader)) {
        return;
      }
      const sessionDisposables = /* @__PURE__ */ new Map();
      store.add(toDisposable(() => {
        sessionDisposables.forEach((d) => d.dispose());
        sessionDisposables.clear();
      }));
      store.add(
        debugService.onDidNewSession(
          (session) => sessionDisposables.set(session, this.handleSession(session))
        )
      );
      store.add(debugService.onDidEndSession(({ session }) => {
        sessionDisposables.get(session)?.dispose();
        sessionDisposables.delete(session);
      }));
      debugService.getModel().getSessions().forEach(
        (session) => sessionDisposables.set(session, this.handleSession(session))
      );
    }));
  }
  handleSession(session) {
    return session.onDidChangeState((e) => {
      const stoppedDetails = session.getStoppedDetails();
      const BREAKPOINT_STOP_REASON = "breakpoint";
      if (stoppedDetails && stoppedDetails.reason === BREAKPOINT_STOP_REASON) {
        this.accessibilitySignalService.playSignal(AccessibilitySignal.onDebugBreak);
      }
    });
  }
};
AccessibilitySignalLineDebuggerContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IAccessibilitySignalService)
], AccessibilitySignalLineDebuggerContribution);
export {
  AccessibilitySignalLineDebuggerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHlTaWduYWxzL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbERlYnVnZ2VyQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuV2l0aFN0b3JlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIEFjY2Vzc2liaWxpdHlTaWduYWwsIEFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uIH0gZnJvbSAnLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcblxuZXhwb3J0IGNsYXNzIEFjY2Vzc2liaWxpdHlTaWduYWxMaW5lRGVidWdnZXJDb250cmlidXRpb25cblx0ZXh0ZW5kcyBEaXNwb3NhYmxlXG5cdGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEZWJ1Z1NlcnZpY2UgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBpc0VuYWJsZWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5vblNvdW5kRW5hYmxlZENoYW5nZWQoQWNjZXNzaWJpbGl0eVNpZ25hbC5vbkRlYnVnQnJlYWspLFxuXHRcdFx0KCkgPT4gYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuaXNTb3VuZEVuYWJsZWQoQWNjZXNzaWJpbGl0eVNpZ25hbC5vbkRlYnVnQnJlYWspXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHN1YnNjcmliZSB0byBkZWJ1ZyBzZXNzaW9ucyAqL1xuXHRcdFx0aWYgKCFpc0VuYWJsZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRpc3Bvc2FibGVzID0gbmV3IE1hcDxJRGVidWdTZXNzaW9uLCBJRGlzcG9zYWJsZT4oKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRzZXNzaW9uRGlzcG9zYWJsZXMuZm9yRWFjaChkID0+IGQuZGlzcG9zZSgpKTtcblx0XHRcdFx0c2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChcblx0XHRcdFx0ZGVidWdTZXJ2aWNlLm9uRGlkTmV3U2Vzc2lvbigoc2Vzc2lvbikgPT5cblx0XHRcdFx0XHRzZXNzaW9uRGlzcG9zYWJsZXMuc2V0KHNlc3Npb24sIHRoaXMuaGFuZGxlU2Vzc2lvbihzZXNzaW9uKSlcblx0XHRcdFx0KVxuXHRcdFx0KTtcblxuXHRcdFx0c3RvcmUuYWRkKGRlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oKHsgc2Vzc2lvbiB9KSA9PiB7XG5cdFx0XHRcdHNlc3Npb25EaXNwb3NhYmxlcy5nZXQoc2Vzc2lvbik/LmRpc3Bvc2UoKTtcblx0XHRcdFx0c2Vzc2lvbkRpc3Bvc2FibGVzLmRlbGV0ZShzZXNzaW9uKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0ZGVidWdTZXJ2aWNlXG5cdFx0XHRcdC5nZXRNb2RlbCgpXG5cdFx0XHRcdC5nZXRTZXNzaW9ucygpXG5cdFx0XHRcdC5mb3JFYWNoKChzZXNzaW9uKSA9PlxuXHRcdFx0XHRcdHNlc3Npb25EaXNwb3NhYmxlcy5zZXQoc2Vzc2lvbiwgdGhpcy5oYW5kbGVTZXNzaW9uKHNlc3Npb24pKVxuXHRcdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBzZXNzaW9uLm9uRGlkQ2hhbmdlU3RhdGUoZSA9PiB7XG5cdFx0XHRjb25zdCBzdG9wcGVkRGV0YWlscyA9IHNlc3Npb24uZ2V0U3RvcHBlZERldGFpbHMoKTtcblx0XHRcdGNvbnN0IEJSRUFLUE9JTlRfU1RPUF9SRUFTT04gPSAnYnJlYWtwb2ludCc7XG5cdFx0XHRpZiAoc3RvcHBlZERldGFpbHMgJiYgc3RvcHBlZERldGFpbHMucmVhc29uID09PSBCUkVBS1BPSU5UX1NUT1BfUkVBU09OKSB7XG5cdFx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLm9uRGVidWdCcmVhayk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxrQkFBa0IsMkJBQTJCO0FBQ3RELFNBQVMsNkJBQTZCLDJCQUF1RDtBQUU3RixTQUFTLHFCQUFvQztBQUV0QyxJQUFNLDhDQUFOLGNBQ0UsV0FDMEI7QUFBQSxFQUVsQyxZQUNnQixjQUMrQiw0QkFDN0M7QUFDRCxVQUFNO0FBRndDO0FBSTlDLFVBQU0sWUFBWTtBQUFBLE1BQW9CO0FBQUEsTUFDckMsMkJBQTJCLHNCQUFzQixvQkFBb0IsWUFBWTtBQUFBLE1BQ2pGLE1BQU0sMkJBQTJCLGVBQWUsb0JBQW9CLFlBQVk7QUFBQSxJQUNqRjtBQUNBLFNBQUssVUFBVSxpQkFBaUIsQ0FBQyxRQUFRLFVBQVU7QUFFbEQsVUFBSSxDQUFDLFVBQVUsS0FBSyxNQUFNLEdBQUc7QUFDNUI7QUFBQSxNQUNEO0FBRUEsWUFBTSxxQkFBcUIsb0JBQUksSUFBZ0M7QUFDL0QsWUFBTSxJQUFJLGFBQWEsTUFBTTtBQUM1QiwyQkFBbUIsUUFBUSxPQUFLLEVBQUUsUUFBUSxDQUFDO0FBQzNDLDJCQUFtQixNQUFNO0FBQUEsTUFDMUIsQ0FBQyxDQUFDO0FBRUYsWUFBTTtBQUFBLFFBQ0wsYUFBYTtBQUFBLFVBQWdCLENBQUMsWUFDN0IsbUJBQW1CLElBQUksU0FBUyxLQUFLLGNBQWMsT0FBTyxDQUFDO0FBQUEsUUFDNUQ7QUFBQSxNQUNEO0FBRUEsWUFBTSxJQUFJLGFBQWEsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLE1BQU07QUFDdkQsMkJBQW1CLElBQUksT0FBTyxHQUFHLFFBQVE7QUFDekMsMkJBQW1CLE9BQU8sT0FBTztBQUFBLE1BQ2xDLENBQUMsQ0FBQztBQUVGLG1CQUNFLFNBQVMsRUFDVCxZQUFZLEVBQ1o7QUFBQSxRQUFRLENBQUMsWUFDVCxtQkFBbUIsSUFBSSxTQUFTLEtBQUssY0FBYyxPQUFPLENBQUM7QUFBQSxNQUM1RDtBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsY0FBYyxTQUFxQztBQUMxRCxXQUFPLFFBQVEsaUJBQWlCLE9BQUs7QUFDcEMsWUFBTSxpQkFBaUIsUUFBUSxrQkFBa0I7QUFDakQsWUFBTSx5QkFBeUI7QUFDL0IsVUFBSSxrQkFBa0IsZUFBZSxXQUFXLHdCQUF3QjtBQUN2RSxhQUFLLDJCQUEyQixXQUFXLG9CQUFvQixZQUFZO0FBQUEsTUFDNUU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF2RGEsOENBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
