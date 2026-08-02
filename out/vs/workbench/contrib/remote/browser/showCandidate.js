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
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
let ShowCandidateContribution = class extends Disposable {
  constructor(remoteExplorerService, environmentService) {
    super();
    const showPortCandidate = environmentService.options?.tunnelProvider?.showPortCandidate;
    if (showPortCandidate) {
      this._register(remoteExplorerService.setCandidateFilter(async (candidates) => {
        const filters = await Promise.all(candidates.map((candidate) => showPortCandidate(candidate.host, candidate.port, candidate.detail ?? "")));
        const filteredCandidates = [];
        if (filters.length !== candidates.length) {
          return candidates;
        }
        for (let i = 0; i < candidates.length; i++) {
          if (filters[i]) {
            filteredCandidates.push(candidates[i]);
          }
        }
        return filteredCandidates;
      }));
    }
  }
};
ShowCandidateContribution.ID = "workbench.contrib.showPortCandidate";
ShowCandidateContribution = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], ShowCandidateContribution);
export {
  ShowCandidateContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3Nob3dDYW5kaWRhdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5kaWRhdGVQb3J0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi90dW5uZWxNb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTaG93Q2FuZGlkYXRlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zaG93UG9ydENhbmRpZGF0ZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHNob3dQb3J0Q2FuZGlkYXRlID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbFByb3ZpZGVyPy5zaG93UG9ydENhbmRpZGF0ZTtcblx0XHRpZiAoc2hvd1BvcnRDYW5kaWRhdGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRDYW5kaWRhdGVGaWx0ZXIoYXN5bmMgKGNhbmRpZGF0ZXM6IENhbmRpZGF0ZVBvcnRbXSk6IFByb21pc2U8Q2FuZGlkYXRlUG9ydFtdPiA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbHRlcnM6IGJvb2xlYW5bXSA9IGF3YWl0IFByb21pc2UuYWxsKGNhbmRpZGF0ZXMubWFwKGNhbmRpZGF0ZSA9PiBzaG93UG9ydENhbmRpZGF0ZShjYW5kaWRhdGUuaG9zdCwgY2FuZGlkYXRlLnBvcnQsIGNhbmRpZGF0ZS5kZXRhaWwgPz8gJycpKSk7XG5cdFx0XHRcdGNvbnN0IGZpbHRlcmVkQ2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdID0gW107XG5cdFx0XHRcdGlmIChmaWx0ZXJzLmxlbmd0aCAhPT0gY2FuZGlkYXRlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlcztcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNhbmRpZGF0ZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAoZmlsdGVyc1tpXSkge1xuXHRcdFx0XHRcdFx0ZmlsdGVyZWRDYW5kaWRhdGVzLnB1c2goY2FuZGlkYXRlc1tpXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmaWx0ZXJlZENhbmRpZGF0ZXM7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsOEJBQThCO0FBR2hDLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQUkzRixZQUN5Qix1QkFDYSxvQkFDcEM7QUFDRCxVQUFNO0FBQ04sVUFBTSxvQkFBb0IsbUJBQW1CLFNBQVMsZ0JBQWdCO0FBQ3RFLFFBQUksbUJBQW1CO0FBQ3RCLFdBQUssVUFBVSxzQkFBc0IsbUJBQW1CLE9BQU8sZUFBMEQ7QUFDeEgsY0FBTSxVQUFxQixNQUFNLFFBQVEsSUFBSSxXQUFXLElBQUksZUFBYSxrQkFBa0IsVUFBVSxNQUFNLFVBQVUsTUFBTSxVQUFVLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFDbkosY0FBTSxxQkFBc0MsQ0FBQztBQUM3QyxZQUFJLFFBQVEsV0FBVyxXQUFXLFFBQVE7QUFDekMsaUJBQU87QUFBQSxRQUNSO0FBQ0EsaUJBQVMsSUFBSSxHQUFHLElBQUksV0FBVyxRQUFRLEtBQUs7QUFDM0MsY0FBSSxRQUFRLENBQUMsR0FBRztBQUNmLCtCQUFtQixLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQUEsVUFDdEM7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1IsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFDRDtBQTFCYSwwQkFFSSxLQUFLO0FBRlQsNEJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
