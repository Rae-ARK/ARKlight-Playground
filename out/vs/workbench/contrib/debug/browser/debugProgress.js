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
import { Event } from "../../../../base/common/event.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IDebugService, VIEWLET_ID } from "../common/debug.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
let DebugProgressContribution = class {
  constructor(debugService, progressService, viewsService) {
    this.toDispose = [];
    let progressListener;
    const listenOnProgress = (session) => {
      if (progressListener) {
        progressListener.dispose();
        progressListener = void 0;
      }
      if (session) {
        progressListener = session.onDidProgressStart(async (progressStartEvent) => {
          const promise = new Promise((r) => {
            const listener = Event.any(
              Event.filter(session.onDidProgressEnd, (e) => e.body.progressId === progressStartEvent.body.progressId),
              session.onDidEndAdapter
            )(() => {
              listener.dispose();
              r();
            });
          });
          if (viewsService.isViewContainerVisible(VIEWLET_ID)) {
            progressService.withProgress({ location: VIEWLET_ID }, () => promise);
          }
          const source = debugService.getAdapterManager().getDebuggerLabel(session.configuration.type);
          progressService.withProgress({
            location: ProgressLocation.Notification,
            title: progressStartEvent.body.title,
            cancellable: progressStartEvent.body.cancellable,
            source,
            delay: 500
          }, (progressStep) => {
            let total = 0;
            const reportProgress = (progress) => {
              let increment = void 0;
              if (typeof progress.percentage === "number") {
                increment = progress.percentage - total;
                total += increment;
              }
              progressStep.report({
                message: progress.message,
                increment,
                total: typeof increment === "number" ? 100 : void 0
              });
            };
            if (progressStartEvent.body.message) {
              reportProgress(progressStartEvent.body);
            }
            const progressUpdateListener = session.onDidProgressUpdate((e) => {
              if (e.body.progressId === progressStartEvent.body.progressId) {
                reportProgress(e.body);
              }
            });
            return promise.then(() => progressUpdateListener.dispose());
          }, () => session.cancel(progressStartEvent.body.progressId));
        });
      }
    };
    this.toDispose.push(debugService.getViewModel().onDidFocusSession(listenOnProgress));
    listenOnProgress(debugService.getViewModel().focusedSession);
    this.toDispose.push(debugService.onWillNewSession((session) => {
      if (!progressListener) {
        listenOnProgress(session);
      }
    }));
  }
  dispose() {
    dispose(this.toDispose);
  }
};
DebugProgressContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, IViewsService)
], DebugProgressContribution);
export {
  DebugProgressContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdQcm9ncmVzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgVklFV0xFVF9JRCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1Byb2dyZXNzQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZVxuXHQpIHtcblx0XHRsZXQgcHJvZ3Jlc3NMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGlzdGVuT25Qcm9ncmVzcyA9IChzZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAocHJvZ3Jlc3NMaXN0ZW5lcikge1xuXHRcdFx0XHRwcm9ncmVzc0xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0cHJvZ3Jlc3NMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdHByb2dyZXNzTGlzdGVuZXIgPSBzZXNzaW9uLm9uRGlkUHJvZ3Jlc3NTdGFydChhc3luYyBwcm9ncmVzc1N0YXJ0RXZlbnQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcblx0XHRcdFx0XHRcdC8vIFNob3cgcHJvZ3Jlc3MgdW50aWwgYSBwcm9ncmVzcyBlbmQgZXZlbnQgY29tZXMgb3IgdGhlIHNlc3Npb24gZW5kc1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBFdmVudC5hbnkoRXZlbnQuZmlsdGVyKHNlc3Npb24ub25EaWRQcm9ncmVzc0VuZCwgZSA9PiBlLmJvZHkucHJvZ3Jlc3NJZCA9PT0gcHJvZ3Jlc3NTdGFydEV2ZW50LmJvZHkucHJvZ3Jlc3NJZCksXG5cdFx0XHRcdFx0XHRcdHNlc3Npb24ub25EaWRFbmRBZGFwdGVyKSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdHIoKTtcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAodmlld3NTZXJ2aWNlLmlzVmlld0NvbnRhaW5lclZpc2libGUoVklFV0xFVF9JRCkpIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogVklFV0xFVF9JRCB9LCAoKSA9PiBwcm9taXNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gZGVidWdTZXJ2aWNlLmdldEFkYXB0ZXJNYW5hZ2VyKCkuZ2V0RGVidWdnZXJMYWJlbChzZXNzaW9uLmNvbmZpZ3VyYXRpb24udHlwZSk7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0XHR0aXRsZTogcHJvZ3Jlc3NTdGFydEV2ZW50LmJvZHkudGl0bGUsXG5cdFx0XHRcdFx0XHRjYW5jZWxsYWJsZTogcHJvZ3Jlc3NTdGFydEV2ZW50LmJvZHkuY2FuY2VsbGFibGUsXG5cdFx0XHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdFx0XHRkZWxheTogNTAwXG5cdFx0XHRcdFx0fSwgcHJvZ3Jlc3NTdGVwID0+IHtcblx0XHRcdFx0XHRcdGxldCB0b3RhbCA9IDA7XG5cdFx0XHRcdFx0XHRjb25zdCByZXBvcnRQcm9ncmVzcyA9IChwcm9ncmVzczogeyBtZXNzYWdlPzogc3RyaW5nOyBwZXJjZW50YWdlPzogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0XHRcdFx0bGV0IGluY3JlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBwcm9ncmVzcy5wZXJjZW50YWdlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHRcdGluY3JlbWVudCA9IHByb2dyZXNzLnBlcmNlbnRhZ2UgLSB0b3RhbDtcblx0XHRcdFx0XHRcdFx0XHR0b3RhbCArPSBpbmNyZW1lbnQ7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NTdGVwLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogcHJvZ3Jlc3MubWVzc2FnZSxcblx0XHRcdFx0XHRcdFx0XHRpbmNyZW1lbnQsXG5cdFx0XHRcdFx0XHRcdFx0dG90YWw6IHR5cGVvZiBpbmNyZW1lbnQgPT09ICdudW1iZXInID8gMTAwIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGlmIChwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS5tZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydFByb2dyZXNzKHByb2dyZXNzU3RhcnRFdmVudC5ib2R5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzVXBkYXRlTGlzdGVuZXIgPSBzZXNzaW9uLm9uRGlkUHJvZ3Jlc3NVcGRhdGUoZSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChlLmJvZHkucHJvZ3Jlc3NJZCA9PT0gcHJvZ3Jlc3NTdGFydEV2ZW50LmJvZHkucHJvZ3Jlc3NJZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJlcG9ydFByb2dyZXNzKGUuYm9keSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+IHByb2dyZXNzVXBkYXRlTGlzdGVuZXIuZGlzcG9zZSgpKTtcblx0XHRcdFx0XHR9LCAoKSA9PiBzZXNzaW9uLmNhbmNlbChwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS5wcm9ncmVzc0lkKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1Nlc3Npb24obGlzdGVuT25Qcm9ncmVzcykpO1xuXHRcdGxpc3Rlbk9uUHJvZ3Jlc3MoZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRlYnVnU2VydmljZS5vbldpbGxOZXdTZXNzaW9uKHNlc3Npb24gPT4ge1xuXHRcdFx0aWYgKCFwcm9ncmVzc0xpc3RlbmVyKSB7XG5cdFx0XHRcdGxpc3Rlbk9uUHJvZ3Jlc3Moc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMudG9EaXNwb3NlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBc0IsZUFBZTtBQUNyQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFFbkQsU0FBUyxlQUE4QixrQkFBa0I7QUFDekQsU0FBUyxxQkFBcUI7QUFFdkIsSUFBTSw0QkFBTixNQUFrRTtBQUFBLEVBSXhFLFlBQ2dCLGNBQ0csaUJBQ0gsY0FDZDtBQU5GLFNBQVEsWUFBMkIsQ0FBQztBQU9uQyxRQUFJO0FBQ0osVUFBTSxtQkFBbUIsQ0FBQyxZQUF1QztBQUNoRSxVQUFJLGtCQUFrQjtBQUNyQix5QkFBaUIsUUFBUTtBQUN6QiwyQkFBbUI7QUFBQSxNQUNwQjtBQUNBLFVBQUksU0FBUztBQUNaLDJCQUFtQixRQUFRLG1CQUFtQixPQUFNLHVCQUFzQjtBQUN6RSxnQkFBTSxVQUFVLElBQUksUUFBYyxPQUFLO0FBRXRDLGtCQUFNLFdBQVcsTUFBTTtBQUFBLGNBQUksTUFBTSxPQUFPLFFBQVEsa0JBQWtCLE9BQUssRUFBRSxLQUFLLGVBQWUsbUJBQW1CLEtBQUssVUFBVTtBQUFBLGNBQzlILFFBQVE7QUFBQSxZQUFlLEVBQUUsTUFBTTtBQUM5Qix1QkFBUyxRQUFRO0FBQ2pCLGdCQUFFO0FBQUEsWUFDSCxDQUFDO0FBQUEsVUFDSCxDQUFDO0FBRUQsY0FBSSxhQUFhLHVCQUF1QixVQUFVLEdBQUc7QUFDcEQsNEJBQWdCLGFBQWEsRUFBRSxVQUFVLFdBQVcsR0FBRyxNQUFNLE9BQU87QUFBQSxVQUNyRTtBQUNBLGdCQUFNLFNBQVMsYUFBYSxrQkFBa0IsRUFBRSxpQkFBaUIsUUFBUSxjQUFjLElBQUk7QUFDM0YsMEJBQWdCLGFBQWE7QUFBQSxZQUM1QixVQUFVLGlCQUFpQjtBQUFBLFlBQzNCLE9BQU8sbUJBQW1CLEtBQUs7QUFBQSxZQUMvQixhQUFhLG1CQUFtQixLQUFLO0FBQUEsWUFDckM7QUFBQSxZQUNBLE9BQU87QUFBQSxVQUNSLEdBQUcsa0JBQWdCO0FBQ2xCLGdCQUFJLFFBQVE7QUFDWixrQkFBTSxpQkFBaUIsQ0FBQyxhQUF3RDtBQUMvRSxrQkFBSSxZQUFZO0FBQ2hCLGtCQUFJLE9BQU8sU0FBUyxlQUFlLFVBQVU7QUFDNUMsNEJBQVksU0FBUyxhQUFhO0FBQ2xDLHlCQUFTO0FBQUEsY0FDVjtBQUNBLDJCQUFhLE9BQU87QUFBQSxnQkFDbkIsU0FBUyxTQUFTO0FBQUEsZ0JBQ2xCO0FBQUEsZ0JBQ0EsT0FBTyxPQUFPLGNBQWMsV0FBVyxNQUFNO0FBQUEsY0FDOUMsQ0FBQztBQUFBLFlBQ0Y7QUFFQSxnQkFBSSxtQkFBbUIsS0FBSyxTQUFTO0FBQ3BDLDZCQUFlLG1CQUFtQixJQUFJO0FBQUEsWUFDdkM7QUFDQSxrQkFBTSx5QkFBeUIsUUFBUSxvQkFBb0IsT0FBSztBQUMvRCxrQkFBSSxFQUFFLEtBQUssZUFBZSxtQkFBbUIsS0FBSyxZQUFZO0FBQzdELCtCQUFlLEVBQUUsSUFBSTtBQUFBLGNBQ3RCO0FBQUEsWUFDRCxDQUFDO0FBRUQsbUJBQU8sUUFBUSxLQUFLLE1BQU0sdUJBQXVCLFFBQVEsQ0FBQztBQUFBLFVBQzNELEdBQUcsTUFBTSxRQUFRLE9BQU8sbUJBQW1CLEtBQUssVUFBVSxDQUFDO0FBQUEsUUFDNUQsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsU0FBSyxVQUFVLEtBQUssYUFBYSxhQUFhLEVBQUUsa0JBQWtCLGdCQUFnQixDQUFDO0FBQ25GLHFCQUFpQixhQUFhLGFBQWEsRUFBRSxjQUFjO0FBQzNELFNBQUssVUFBVSxLQUFLLGFBQWEsaUJBQWlCLGFBQVc7QUFDNUQsVUFBSSxDQUFDLGtCQUFrQjtBQUN0Qix5QkFBaUIsT0FBTztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFlBQVEsS0FBSyxTQUFTO0FBQUEsRUFDdkI7QUFDRDtBQTdFYSw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
