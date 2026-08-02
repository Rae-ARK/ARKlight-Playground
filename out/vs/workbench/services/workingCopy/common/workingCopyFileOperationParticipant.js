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
import { ILogService } from "../../../../platform/log/common/log.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
let WorkingCopyFileOperationParticipant = class extends Disposable {
  constructor(logService, configurationService) {
    super();
    this.logService = logService;
    this.configurationService = configurationService;
    this.participants = new LinkedList();
  }
  addFileOperationParticipant(participant) {
    const remove = this.participants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(files, operation, undoInfo, token) {
    const timeout = this.configurationService.getValue("files.participants.timeout");
    if (typeof timeout !== "number" || timeout <= 0) {
      return;
    }
    for (const participant of this.participants) {
      try {
        await participant.participate(files, operation, undoInfo, timeout, token);
      } catch (err) {
        this.logService.warn(err);
      }
    }
  }
  dispose() {
    this.participants.clear();
    super.dispose();
  }
};
WorkingCopyFileOperationParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IConfigurationService)
], WorkingCopyFileOperationParticipant);
export {
  WorkingCopyFileOperationParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZU9wZXJhdGlvblBhcnRpY2lwYW50LCBTb3VyY2VUYXJnZXRQYWlyLCBJRmlsZU9wZXJhdGlvblVuZG9SZWRvSW5mbyB9IGZyb20gJy4vd29ya2luZ0NvcHlGaWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuXG5leHBvcnQgY2xhc3MgV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBhcnRpY2lwYW50cyA9IG5ldyBMaW5rZWRMaXN0PElXb3JraW5nQ29weUZpbGVPcGVyYXRpb25QYXJ0aWNpcGFudD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YWRkRmlsZU9wZXJhdGlvblBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJV29ya2luZ0NvcHlGaWxlT3BlcmF0aW9uUGFydGljaXBhbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5wYXJ0aWNpcGFudHMucHVzaChwYXJ0aWNpcGFudCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHJlbW92ZSgpKTtcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKGZpbGVzOiBTb3VyY2VUYXJnZXRQYWlyW10sIG9wZXJhdGlvbjogRmlsZU9wZXJhdGlvbiwgdW5kb0luZm86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdmaWxlcy5wYXJ0aWNpcGFudHMudGltZW91dCcpO1xuXHRcdGlmICh0eXBlb2YgdGltZW91dCAhPT0gJ251bWJlcicgfHwgdGltZW91dCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGVhY2ggcGFydGljaXBhbnRcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIHRoaXMucGFydGljaXBhbnRzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwYXJ0aWNpcGFudC5wYXJ0aWNpcGF0ZShmaWxlcywgb3BlcmF0aW9uLCB1bmRvSW5mbywgdGltZW91dCwgdG9rZW4pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnBhcnRpY2lwYW50cy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLFlBQVksb0JBQW9CO0FBR3RELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBRXBCLElBQU0sc0NBQU4sY0FBa0QsV0FBVztBQUFBLEVBSW5FLFlBQytCLFlBQ1Usc0JBQ3ZDO0FBQ0QsVUFBTTtBQUh3QjtBQUNVO0FBSnpDLFNBQWlCLGVBQWUsSUFBSSxXQUFpRDtBQUFBLEVBT3JGO0FBQUEsRUFFQSw0QkFBNEIsYUFBZ0U7QUFDM0YsVUFBTSxTQUFTLEtBQUssYUFBYSxLQUFLLFdBQVc7QUFFakQsV0FBTyxhQUFhLE1BQU0sT0FBTyxDQUFDO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQU0sWUFBWSxPQUEyQixXQUEwQixVQUFrRCxPQUF5QztBQUNqSyxVQUFNLFVBQVUsS0FBSyxxQkFBcUIsU0FBaUIsNEJBQTRCO0FBQ3ZGLFFBQUksT0FBTyxZQUFZLFlBQVksV0FBVyxHQUFHO0FBQ2hEO0FBQUEsSUFDRDtBQUdBLGVBQVcsZUFBZSxLQUFLLGNBQWM7QUFDNUMsVUFBSTtBQUNILGNBQU0sWUFBWSxZQUFZLE9BQU8sV0FBVyxVQUFVLFNBQVMsS0FBSztBQUFBLE1BQ3pFLFNBQVMsS0FBSztBQUNiLGFBQUssV0FBVyxLQUFLLEdBQUc7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGFBQWEsTUFBTTtBQUV4QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUF0Q2Esc0NBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
