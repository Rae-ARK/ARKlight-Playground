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
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
let ExternalUriResolverContribution = class extends Disposable {
  constructor(_openerService, _workbenchEnvironmentService) {
    super();
    if (_workbenchEnvironmentService.options?.resolveExternalUri) {
      this._register(_openerService.registerExternalUriResolver({
        resolveExternalUri: async (resource) => {
          return {
            resolved: await _workbenchEnvironmentService.options.resolveExternalUri(resource),
            dispose: () => {
            }
          };
        }
      }));
    }
  }
};
ExternalUriResolverContribution.ID = "workbench.contrib.externalUriResolver";
ExternalUriResolverContribution = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], ExternalUriResolverContribution);
export {
  ExternalUriResolverContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VybC9icm93c2VyL2V4dGVybmFsVXJpUmVzb2x2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZXJuYWxVcmlSZXNvbHZlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZXh0ZXJuYWxVcmlSZXNvbHZlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy5yZXNvbHZlRXh0ZXJuYWxVcmkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKF9vcGVuZXJTZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxVcmlSZXNvbHZlcih7XG5cdFx0XHRcdHJlc29sdmVFeHRlcm5hbFVyaTogYXN5bmMgKHJlc291cmNlKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHJlc29sdmVkOiBhd2FpdCBfd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMhLnJlc29sdmVFeHRlcm5hbFVyaSEocmVzb3VyY2UpLFxuXHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBUT0RPQG1qYnZ6IC0gZG8gd2UgbmVlZCB0byBkbyBhbnl0aGluZyBoZXJlP1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywyQ0FBMkM7QUFFN0MsSUFBTSxrQ0FBTixjQUE4QyxXQUE2QztBQUFBLEVBSWpHLFlBQ2lCLGdCQUNxQiw4QkFDcEM7QUFDRCxVQUFNO0FBRU4sUUFBSSw2QkFBNkIsU0FBUyxvQkFBb0I7QUFDN0QsV0FBSyxVQUFVLGVBQWUsNEJBQTRCO0FBQUEsUUFDekQsb0JBQW9CLE9BQU8sYUFBYTtBQUN2QyxpQkFBTztBQUFBLFlBQ04sVUFBVSxNQUFNLDZCQUE2QixRQUFTLG1CQUFvQixRQUFRO0FBQUEsWUFDbEYsU0FBUyxNQUFNO0FBQUEsWUFFZjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUNEO0FBdkJhLGdDQUVJLEtBQUs7QUFGVCxrQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
