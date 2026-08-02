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
import { CancellationError, isCancellationError } from "../../../../base/common/errors.js";
import { NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { localize } from "../../../../nls.js";
let StoredFileWorkingCopySaveParticipant = class extends Disposable {
  constructor(logService, progressService) {
    super();
    this.logService = logService;
    this.progressService = progressService;
    this.saveParticipants = new LinkedList();
  }
  get length() {
    return this.saveParticipants.size;
  }
  addSaveParticipant(participant) {
    const remove = this.saveParticipants.push(participant);
    return toDisposable(() => remove());
  }
  async participate(workingCopy, context, progress, token) {
    const cts = new CancellationTokenSource(token);
    workingCopy.model?.pushStackElement();
    progress.report({
      message: localize("saveParticipants1", "Running Code Actions and Formatters...")
    });
    let bubbleCancel = false;
    await this.progressService.withProgress({
      priority: NotificationPriority.URGENT,
      location: ProgressLocation.Notification,
      cancellable: localize("skip", "Skip"),
      delay: workingCopy.isDirty() ? 5e3 : 3e3
    }, async (progress2) => {
      const participants = Array.from(this.saveParticipants).sort((a, b) => {
        const aValue = a.ordinal ?? 0;
        const bValue = b.ordinal ?? 0;
        return aValue - bValue;
      });
      for (const saveParticipant of participants) {
        if (cts.token.isCancellationRequested || workingCopy.isDisposed()) {
          break;
        }
        try {
          const promise = saveParticipant.participate(workingCopy, context, progress2, cts.token);
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
    workingCopy.model?.pushStackElement();
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
StoredFileWorkingCopySaveParticipant = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IProgressService)
], StoredFileWorkingCopySaveParticipant);
export {
  StoredFileWorkingCopySaveParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0IH0gZnJvbSAnLi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHksIElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbCB9IGZyb20gJy4vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5leHBvcnQgY2xhc3MgU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzYXZlUGFydGljaXBhbnRzID0gbmV3IExpbmtlZExpc3Q8SVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudD4oKTtcblxuXHRnZXQgbGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLnNhdmVQYXJ0aWNpcGFudHMuc2l6ZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YWRkU2F2ZVBhcnRpY2lwYW50KHBhcnRpY2lwYW50OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuc2F2ZVBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4gcmVtb3ZlKCkpO1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cblx0XHQvLyB1bmRvU3RvcCBiZWZvcmUgcGFydGljaXBhdGlvblxuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy5wdXNoU3RhY2tFbGVtZW50KCk7XG5cblx0XHQvLyByZXBvcnQgdG8gdGhlIFwib3V0ZXJcIiBwcm9ncmVzc1xuXHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnc2F2ZVBhcnRpY2lwYW50czEnLCBcIlJ1bm5pbmcgQ29kZSBBY3Rpb25zIGFuZCBGb3JtYXR0ZXJzLi4uXCIpXG5cdFx0fSk7XG5cblx0XHRsZXQgYnViYmxlQ2FuY2VsID0gZmFsc2U7XG5cblx0XHQvLyBjcmVhdGUgYW4gXCJpbm5lclwiIHByb2dyZXNzIHRvIGFsbG93IHRvIHNraXAgb3ZlciBsb25nIHJ1bm5pbmcgc2F2ZSBwYXJ0aWNpcGFudHNcblx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCxcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdGNhbmNlbGxhYmxlOiBsb2NhbGl6ZSgnc2tpcCcsIFwiU2tpcFwiKSxcblx0XHRcdGRlbGF5OiB3b3JraW5nQ29weS5pc0RpcnR5KCkgPyA1MDAwIDogMzAwMFxuXHRcdH0sIGFzeW5jIHByb2dyZXNzID0+IHtcblxuXHRcdFx0Y29uc3QgcGFydGljaXBhbnRzID0gQXJyYXkuZnJvbSh0aGlzLnNhdmVQYXJ0aWNpcGFudHMpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0Y29uc3QgYVZhbHVlID0gYS5vcmRpbmFsID8/IDA7XG5cdFx0XHRcdGNvbnN0IGJWYWx1ZSA9IGIub3JkaW5hbCA/PyAwO1xuXHRcdFx0XHRyZXR1cm4gYVZhbHVlIC0gYlZhbHVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2F2ZVBhcnRpY2lwYW50IG9mIHBhcnRpY2lwYW50cykge1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHdvcmtpbmdDb3B5LmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm9taXNlID0gc2F2ZVBhcnRpY2lwYW50LnBhcnRpY2lwYXRlKHdvcmtpbmdDb3B5LCBjb250ZXh0LCBwcm9ncmVzcywgY3RzLnRva2VuKTtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHByb21pc2UsIGN0cy50b2tlbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdC8vIHdlIHNlZSBhIGNhbmNlbGxhdGlvbiBlcnJvciBCVVQgdGhlIHRva2VuIGRpZG4ndCBzaWduYWwgaXRcblx0XHRcdFx0XHRcdC8vIHRoaXMgbWVhbnMgdGhlIHBhcnRpY2lwYW50IHdhbnRzIHRoZSBzYXZlIG9wZXJhdGlvbiB0byBiZSBjYW5jZWxsZWRcblx0XHRcdFx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdGJ1YmJsZUNhbmNlbCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gdW5kb1N0b3AgYWZ0ZXIgcGFydGljaXBhdGlvblxuXHRcdHdvcmtpbmdDb3B5Lm1vZGVsPy5wdXNoU3RhY2tFbGVtZW50KCk7XG5cblx0XHRjdHMuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKGJ1YmJsZUNhbmNlbCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVQYXJ0aWNpcGFudHMuY2xlYXIoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxtQkFBbUI7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
