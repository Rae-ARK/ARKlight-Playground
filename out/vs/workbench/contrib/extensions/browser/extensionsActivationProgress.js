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
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { localize } from "../../../../nls.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
let ExtensionActivationProgress = class {
  constructor(extensionService, progressService, logService) {
    const options = {
      location: ProgressLocation.Window,
      title: localize("activation", "Activating Extensions...")
    };
    let deferred;
    let count = 0;
    this._listener = extensionService.onWillActivateByEvent((e) => {
      logService.trace("onWillActivateByEvent: ", e.event);
      if (!deferred) {
        deferred = new DeferredPromise();
        progressService.withProgress(options, (_) => deferred.p);
      }
      count++;
      Promise.race([e.activation, timeout(5e3, CancellationToken.None)]).finally(() => {
        if (--count === 0) {
          deferred.complete(void 0);
          deferred = void 0;
        }
      });
    });
  }
  dispose() {
    this._listener.dispose();
  }
};
ExtensionActivationProgress = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, ILogService)
], ExtensionActivationProgress);
export {
  ExtensionActivationProgress
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zQWN0aXZhdGlvblByb2dyZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uQWN0aXZhdGlvblByb2dyZXNzIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FjdGl2YXRpb24nLCBcIkFjdGl2YXRpbmcgRXh0ZW5zaW9ucy4uLlwiKVxuXHRcdH07XG5cblx0XHRsZXQgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTxhbnk+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjb3VudCA9IDA7XG5cblx0XHR0aGlzLl9saXN0ZW5lciA9IGV4dGVuc2lvblNlcnZpY2Uub25XaWxsQWN0aXZhdGVCeUV2ZW50KGUgPT4ge1xuXHRcdFx0bG9nU2VydmljZS50cmFjZSgnb25XaWxsQWN0aXZhdGVCeUV2ZW50OiAnLCBlLmV2ZW50KTtcblxuXHRcdFx0aWYgKCFkZWZlcnJlZCkge1xuXHRcdFx0XHRkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2UoKTtcblx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhvcHRpb25zLCBfID0+IGRlZmVycmVkIS5wKTtcblx0XHRcdH1cblxuXHRcdFx0Y291bnQrKztcblxuXHRcdFx0UHJvbWlzZS5yYWNlKFtlLmFjdGl2YXRpb24sIHRpbWVvdXQoNTAwMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSldKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0aWYgKC0tY291bnQgPT09IDApIHtcblx0XHRcdFx0XHRkZWZlcnJlZCEuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRkZWZlcnJlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUUzQixJQUFNLDhCQUFOLE1BQW9FO0FBQUEsRUFJMUUsWUFDb0Isa0JBQ0QsaUJBQ0wsWUFDWjtBQUVELFVBQU0sVUFBVTtBQUFBLE1BQ2YsVUFBVSxpQkFBaUI7QUFBQSxNQUMzQixPQUFPLFNBQVMsY0FBYywwQkFBMEI7QUFBQSxJQUN6RDtBQUVBLFFBQUk7QUFDSixRQUFJLFFBQVE7QUFFWixTQUFLLFlBQVksaUJBQWlCLHNCQUFzQixPQUFLO0FBQzVELGlCQUFXLE1BQU0sMkJBQTJCLEVBQUUsS0FBSztBQUVuRCxVQUFJLENBQUMsVUFBVTtBQUNkLG1CQUFXLElBQUksZ0JBQWdCO0FBQy9CLHdCQUFnQixhQUFhLFNBQVMsT0FBSyxTQUFVLENBQUM7QUFBQSxNQUN2RDtBQUVBO0FBRUEsY0FBUSxLQUFLLENBQUMsRUFBRSxZQUFZLFFBQVEsS0FBTSxrQkFBa0IsSUFBSSxDQUFDLENBQUMsRUFBRSxRQUFRLE1BQU07QUFDakYsWUFBSSxFQUFFLFVBQVUsR0FBRztBQUNsQixtQkFBVSxTQUFTLE1BQVM7QUFDNUIscUJBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFVBQVUsUUFBUTtBQUFBLEVBQ3hCO0FBQ0Q7QUF4Q2EsOEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
