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
import { raceCancellation } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { localize } from "../../../../nls.js";
import { NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
let TextFileSaveParticipant = class extends Disposable {
  constructor(logService, progressService) {
    super();
    this.logService = logService;
    this.progressService = progressService;
    this.saveParticipants = new LinkedList();
  }
  addSaveParticipant(participant) {
    const remove = this.saveParticipants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(model, context, progress, token) {
    const cts = new CancellationTokenSource(token);
    model.textEditorModel?.pushStackElement();
    progress.report({
      message: localize("saveParticipants1", "Running Code Actions and Formatters...")
    });
    let bubbleCancel = false;
    await this.progressService.withProgress({
      priority: NotificationPriority.URGENT,
      location: ProgressLocation.Notification,
      cancellable: localize("skip", "Skip"),
      delay: model.isDirty() ? 5e3 : 3e3
    }, async (progress2) => {
      const participants = Array.from(this.saveParticipants).sort((a, b) => {
        const aValue = a.ordinal ?? 0;
        const bValue = b.ordinal ?? 0;
        return aValue - bValue;
      });
      for (const saveParticipant of participants) {
        if (cts.token.isCancellationRequested || !model.textEditorModel) {
          break;
        }
        try {
          const promise = saveParticipant.participate(model, context, progress2, cts.token);
          await raceCancellation(promise, cts.token);
        } catch (err) {
          if (!isCancellationError(err)) {
            this.logService.error(err);
          } else if (!cts.token.isCancellationRequested) {
            cts.cancel();
            bubbleCancel = true;
          }
        }
      }
    }, () => {
      cts.cancel();
    });
    model.textEditorModel?.pushStackElement();
    cts.dispose();
    if (bubbleCancel) {
      throw new CancellationError();
    }
  }
  dispose() {
    this.saveParticipants.clear();
    super.dispose();
  }
};
TextFileSaveParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProgressService)
], TextFileSaveParticipant);
export {
  TextFileSaveParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEZpbGVTYXZlUGFydGljaXBhbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCwgSVRleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQgfSBmcm9tICcuL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgVGV4dEZpbGVTYXZlUGFydGljaXBhbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNhdmVQYXJ0aWNpcGFudHMgPSBuZXcgTGlua2VkTGlzdDxJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhZGRTYXZlUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZW1vdmUgPSB0aGlzLnNhdmVQYXJ0aWNpcGFudHMucHVzaChwYXJ0aWNpcGFudCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHJlbW92ZSgpKTtcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgY29udGV4dDogSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblxuXHRcdC8vIHVuZG9TdG9wIGJlZm9yZSBwYXJ0aWNpcGF0aW9uXG5cdFx0bW9kZWwudGV4dEVkaXRvck1vZGVsPy5wdXNoU3RhY2tFbGVtZW50KCk7XG5cblx0XHQvLyByZXBvcnQgdG8gdGhlIFwib3V0ZXJcIiBwcm9ncmVzc1xuXHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2F2ZVBhcnRpY2lwYW50czEnLCBcIlJ1bm5pbmcgQ29kZSBBY3Rpb25zIGFuZCBGb3JtYXR0ZXJzLi4uXCIpXG5cdFx0fSk7XG5cblx0XHRsZXQgYnViYmxlQ2FuY2VsID0gZmFsc2U7XG5cblx0XHQvLyBjcmVhdGUgYW4gXCJpbm5lclwiIHByb2dyZXNzIHRvIGFsbG93IHRvIHNraXAgb3ZlciBsb25nIHJ1bm5pbmcgc2F2ZSBwYXJ0aWNpcGFudHNcblx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCxcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdGNhbmNlbGxhYmxlOiBsb2NhbGl6ZSgnc2tpcCcsIFwiU2tpcFwiKSxcblx0XHRcdGRlbGF5OiBtb2RlbC5pc0RpcnR5KCkgPyA1MDAwIDogMzAwMFxuXHRcdH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblxuXHRcdFx0Y29uc3QgcGFydGljaXBhbnRzID0gQXJyYXkuZnJvbSh0aGlzLnNhdmVQYXJ0aWNpcGFudHMpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0Y29uc3QgYVZhbHVlID0gYS5vcmRpbmFsID8/IDA7XG5cdFx0XHRcdGNvbnN0IGJWYWx1ZSA9IGIub3JkaW5hbCA/PyAwO1xuXHRcdFx0XHRyZXR1cm4gYVZhbHVlIC0gYlZhbHVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2F2ZVBhcnRpY2lwYW50IG9mIHBhcnRpY2lwYW50cykge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFtb2RlbC50ZXh0RWRpdG9yTW9kZWwgLyogZGlzcG9zZWQgKi8pIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZSA9IHNhdmVQYXJ0aWNpcGFudC5wYXJ0aWNpcGF0ZShtb2RlbCwgY29udGV4dCwgcHJvZ3Jlc3MsIGN0cy50b2tlbik7XG5cdFx0XHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbihwcm9taXNlLCBjdHMudG9rZW4pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHQvLyB3ZSBzZWUgYSBjYW5jZWxsYXRpb24gZXJyb3IgQlVUIHRoZSB0b2tlbiBkaWRuJ3Qgc2lnbmFsIGl0XG5cdFx0XHRcdFx0XHQvLyB0aGlzIG1lYW5zIHRoZSBwYXJ0aWNpcGFudCB3YW50cyB0aGUgc2F2ZSBvcGVyYXRpb24gdG8gYmUgY2FuY2VsbGVkXG5cdFx0XHRcdFx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0XHRcdFx0XHRidWJibGVDYW5jZWwgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sICgpID0+IHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHR9KTtcblxuXHRcdC8vIHVuZG9TdG9wIGFmdGVyIHBhcnRpY2lwYXRpb25cblx0XHRtb2RlbC50ZXh0RWRpdG9yTW9kZWw/LnB1c2hTdGFja0VsZW1lbnQoKTtcblxuXHRcdGN0cy5kaXNwb3NlKCk7XG5cblx0XHRpZiAoYnViYmxlQ2FuY2VsKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFvQixrQkFBaUMsd0JBQXdCO0FBRTdFLFNBQXNCLFlBQVksb0JBQW9CO0FBQ3RELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsbUJBQW1CLDJCQUEyQjtBQUVoRCxJQUFNLDBCQUFOLGNBQXNDLFdBQVc7QUFBQSxFQUl2RCxZQUMrQixZQUNLLGlCQUNsQztBQUNELFVBQU07QUFId0I7QUFDSztBQUpwQyxTQUFpQixtQkFBbUIsSUFBSSxXQUFxQztBQUFBLEVBTzdFO0FBQUEsRUFFQSxtQkFBbUIsYUFBb0Q7QUFDdEUsVUFBTSxTQUFTLEtBQUssaUJBQWlCLEtBQUssV0FBVztBQUVyRCxXQUFPLGFBQWEsTUFBTSxPQUFPLENBQUM7QUFBQSxFQUNuQztBQUFBLEVBRUEsTUFBTSxZQUFZLE9BQTZCLFNBQTBDLFVBQW9DLE9BQXlDO0FBQ3JLLFVBQU0sTUFBTSxJQUFJLHdCQUF3QixLQUFLO0FBRzdDLFVBQU0saUJBQWlCLGlCQUFpQjtBQUd4QyxhQUFTLE9BQU87QUFBQSxNQUNmLFNBQVMsU0FBUyxxQkFBcUIsd0NBQXdDO0FBQUEsSUFDaEYsQ0FBQztBQUVELFFBQUksZUFBZTtBQUduQixVQUFNLEtBQUssZ0JBQWdCLGFBQWE7QUFBQSxNQUN2QyxVQUFVLHFCQUFxQjtBQUFBLE1BQy9CLFVBQVUsaUJBQWlCO0FBQUEsTUFDM0IsYUFBYSxTQUFTLFFBQVEsTUFBTTtBQUFBLE1BQ3BDLE9BQU8sTUFBTSxRQUFRLElBQUksTUFBTztBQUFBLElBQ2pDLEdBQUcsT0FBTUEsY0FBWTtBQUVwQixZQUFNLGVBQWUsTUFBTSxLQUFLLEtBQUssZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUNyRSxjQUFNLFNBQVMsRUFBRSxXQUFXO0FBQzVCLGNBQU0sU0FBUyxFQUFFLFdBQVc7QUFDNUIsZUFBTyxTQUFTO0FBQUEsTUFDakIsQ0FBQztBQUVELGlCQUFXLG1CQUFtQixjQUFjO0FBQzNDLFlBQUksSUFBSSxNQUFNLDJCQUEyQixDQUFDLE1BQU0saUJBQWdDO0FBQy9FO0FBQUEsUUFDRDtBQUVBLFlBQUk7QUFDSCxnQkFBTSxVQUFVLGdCQUFnQixZQUFZLE9BQU8sU0FBU0EsV0FBVSxJQUFJLEtBQUs7QUFDL0UsZ0JBQU0saUJBQWlCLFNBQVMsSUFBSSxLQUFLO0FBQUEsUUFDMUMsU0FBUyxLQUFLO0FBQ2IsY0FBSSxDQUFDLG9CQUFvQixHQUFHLEdBQUc7QUFDOUIsaUJBQUssV0FBVyxNQUFNLEdBQUc7QUFBQSxVQUMxQixXQUFXLENBQUMsSUFBSSxNQUFNLHlCQUF5QjtBQUc5QyxnQkFBSSxPQUFPO0FBQ1gsMkJBQWU7QUFBQSxVQUNoQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLE1BQU07QUFDUixVQUFJLE9BQU87QUFBQSxJQUNaLENBQUM7QUFHRCxVQUFNLGlCQUFpQixpQkFBaUI7QUFFeEMsUUFBSSxRQUFRO0FBRVosUUFBSSxjQUFjO0FBQ2pCLFlBQU0sSUFBSSxrQkFBa0I7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssaUJBQWlCLE1BQU07QUFFNUIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBbEZhLDBCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogWyJwcm9ncmVzcyJdCn0K
