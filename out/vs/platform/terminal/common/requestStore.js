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
import { timeout } from "../../../base/common/async.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
let RequestStore = class extends Disposable {
  /**
   * @param timeout How long in ms to allow requests to go unanswered for, undefined will use the
   * default (15 seconds).
   */
  constructor(timeout2, _logService) {
    super();
    this._logService = _logService;
    this._lastRequestId = 0;
    this._pendingRequests = /* @__PURE__ */ new Map();
    this._pendingRequestDisposables = /* @__PURE__ */ new Map();
    this._onCreateRequest = this._register(new Emitter());
    this.onCreateRequest = this._onCreateRequest.event;
    this._timeout = timeout2 === void 0 ? 15e3 : timeout2;
    this._register(toDisposable(() => {
      for (const d of this._pendingRequestDisposables.values()) {
        dispose(d);
      }
    }));
  }
  /**
   * Creates a request.
   * @param args The arguments to pass to the onCreateRequest event.
   */
  createRequest(args) {
    return new Promise((resolve, reject) => {
      const requestId = ++this._lastRequestId;
      this._pendingRequests.set(requestId, resolve);
      this._onCreateRequest.fire({ requestId, ...args });
      const tokenSource = new CancellationTokenSource();
      timeout(this._timeout, tokenSource.token).then(() => reject(`Request ${requestId} timed out (${this._timeout}ms)`));
      this._pendingRequestDisposables.set(requestId, [toDisposable(() => tokenSource.cancel())]);
    });
  }
  /**
   * Accept a reply to a request.
   * @param requestId The request ID originating from the onCreateRequest event.
   * @param data The reply data.
   */
  acceptReply(requestId, data) {
    const resolveRequest = this._pendingRequests.get(requestId);
    if (resolveRequest) {
      this._pendingRequests.delete(requestId);
      dispose(this._pendingRequestDisposables.get(requestId) || []);
      this._pendingRequestDisposables.delete(requestId);
      resolveRequest(data);
    } else {
      this._logService.warn(`RequestStore#acceptReply was called without receiving a matching request ${requestId}`);
    }
  }
};
RequestStore = __decorateClass([
  __decorateParam(1, ILogService)
], RequestStore);
export {
  RequestStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9yZXF1ZXN0U3RvcmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbi8qKlxuICogQSBoZWxwZXIgY2xhc3MgdG8gdHJhY2sgcmVxdWVzdHMgdGhhdCBoYXZlIHJlcGxpZXMuIFVzaW5nIHRoaXMgaXQncyBlYXN5IHRvIGltcGxlbWVudCBhbiBldmVudFxuICogdGhhdCBhY2NlcHRzIGEgcmVwbHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXF1ZXN0U3RvcmU8VCwgUmVxdWVzdEFyZ3M+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2xhc3RSZXF1ZXN0SWQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aW1lb3V0OiBudW1iZXI7XG5cdHByaXZhdGUgX3BlbmRpbmdSZXF1ZXN0czogTWFwPG51bWJlciwgKHJlc29sdmVkOiBUKSA9PiB2b2lkPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfcGVuZGluZ1JlcXVlc3REaXNwb3NhYmxlczogTWFwPG51bWJlciwgSURpc3Bvc2FibGVbXT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DcmVhdGVSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVxdWVzdEFyZ3MgJiB7IHJlcXVlc3RJZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvbkNyZWF0ZVJlcXVlc3QgPSB0aGlzLl9vbkNyZWF0ZVJlcXVlc3QuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB0aW1lb3V0IEhvdyBsb25nIGluIG1zIHRvIGFsbG93IHJlcXVlc3RzIHRvIGdvIHVuYW5zd2VyZWQgZm9yLCB1bmRlZmluZWQgd2lsbCB1c2UgdGhlXG5cdCAqIGRlZmF1bHQgKDE1IHNlY29uZHMpLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoXG5cdFx0dGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3RpbWVvdXQgPSB0aW1lb3V0ID09PSB1bmRlZmluZWQgPyAxNTAwMCA6IHRpbWVvdXQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZCBvZiB0aGlzLl9wZW5kaW5nUmVxdWVzdERpc3Bvc2FibGVzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGRpc3Bvc2UoZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSByZXF1ZXN0LlxuXHQgKiBAcGFyYW0gYXJncyBUaGUgYXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIG9uQ3JlYXRlUmVxdWVzdCBldmVudC5cblx0ICovXG5cdGNyZWF0ZVJlcXVlc3QoYXJnczogUmVxdWVzdEFyZ3MpOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gKyt0aGlzLl9sYXN0UmVxdWVzdElkO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChyZXF1ZXN0SWQsIHJlc29sdmUpO1xuXHRcdFx0dGhpcy5fb25DcmVhdGVSZXF1ZXN0LmZpcmUoeyByZXF1ZXN0SWQsIC4uLmFyZ3MgfSk7XG5cdFx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGltZW91dCh0aGlzLl90aW1lb3V0LCB0b2tlblNvdXJjZS50b2tlbikudGhlbigoKSA9PiByZWplY3QoYFJlcXVlc3QgJHtyZXF1ZXN0SWR9IHRpbWVkIG91dCAoJHt0aGlzLl90aW1lb3V0fW1zKWApKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0RGlzcG9zYWJsZXMuc2V0KHJlcXVlc3RJZCwgW3RvRGlzcG9zYWJsZSgoKSA9PiB0b2tlblNvdXJjZS5jYW5jZWwoKSldKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBY2NlcHQgYSByZXBseSB0byBhIHJlcXVlc3QuXG5cdCAqIEBwYXJhbSByZXF1ZXN0SWQgVGhlIHJlcXVlc3QgSUQgb3JpZ2luYXRpbmcgZnJvbSB0aGUgb25DcmVhdGVSZXF1ZXN0IGV2ZW50LlxuXHQgKiBAcGFyYW0gZGF0YSBUaGUgcmVwbHkgZGF0YS5cblx0ICovXG5cdGFjY2VwdFJlcGx5KHJlcXVlc3RJZDogbnVtYmVyLCBkYXRhOiBUKSB7XG5cdFx0Y29uc3QgcmVzb2x2ZVJlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKHJlc29sdmVSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3BlbmRpbmdSZXF1ZXN0RGlzcG9zYWJsZXMuZ2V0KHJlcXVlc3RJZCkgfHwgW10pO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3REaXNwb3NhYmxlcy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdHJlc29sdmVSZXF1ZXN0KGRhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJlcXVlc3RTdG9yZSNhY2NlcHRSZXBseSB3YXMgY2FsbGVkIHdpdGhvdXQgcmVjZWl2aW5nIGEgbWF0Y2hpbmcgcmVxdWVzdCAke3JlcXVlc3RJZH1gKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksU0FBc0Isb0JBQW9CO0FBQy9ELFNBQVMsbUJBQW1CO0FBTXJCLElBQU0sZUFBTixjQUEyQyxXQUFXO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWE1RCxZQUNDQSxVQUM4QixhQUM3QjtBQUNELFVBQU07QUFGd0I7QUFkL0IsU0FBUSxpQkFBaUI7QUFFekIsU0FBUSxtQkFBdUQsb0JBQUksSUFBSTtBQUN2RSxTQUFRLDZCQUF5RCxvQkFBSSxJQUFJO0FBRXpFLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUE2QyxDQUFDO0FBQ3JHLFNBQVMsa0JBQWtCLEtBQUssaUJBQWlCO0FBV2hELFNBQUssV0FBV0EsYUFBWSxTQUFZLE9BQVFBO0FBQ2hELFNBQUssVUFBVSxhQUFhLE1BQU07QUFDakMsaUJBQVcsS0FBSyxLQUFLLDJCQUEyQixPQUFPLEdBQUc7QUFDekQsZ0JBQVEsQ0FBQztBQUFBLE1BQ1Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsY0FBYyxNQUErQjtBQUM1QyxXQUFPLElBQUksUUFBVyxDQUFDLFNBQVMsV0FBVztBQUMxQyxZQUFNLFlBQVksRUFBRSxLQUFLO0FBQ3pCLFdBQUssaUJBQWlCLElBQUksV0FBVyxPQUFPO0FBQzVDLFdBQUssaUJBQWlCLEtBQUssRUFBRSxXQUFXLEdBQUcsS0FBSyxDQUFDO0FBQ2pELFlBQU0sY0FBYyxJQUFJLHdCQUF3QjtBQUNoRCxjQUFRLEtBQUssVUFBVSxZQUFZLEtBQUssRUFBRSxLQUFLLE1BQU0sT0FBTyxXQUFXLFNBQVMsZUFBZSxLQUFLLFFBQVEsS0FBSyxDQUFDO0FBQ2xILFdBQUssMkJBQTJCLElBQUksV0FBVyxDQUFDLGFBQWEsTUFBTSxZQUFZLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUMxRixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLFlBQVksV0FBbUIsTUFBUztBQUN2QyxVQUFNLGlCQUFpQixLQUFLLGlCQUFpQixJQUFJLFNBQVM7QUFDMUQsUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSyxpQkFBaUIsT0FBTyxTQUFTO0FBQ3RDLGNBQVEsS0FBSywyQkFBMkIsSUFBSSxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQzVELFdBQUssMkJBQTJCLE9BQU8sU0FBUztBQUNoRCxxQkFBZSxJQUFJO0FBQUEsSUFDcEIsT0FBTztBQUNOLFdBQUssWUFBWSxLQUFLLDRFQUE0RSxTQUFTLEVBQUU7QUFBQSxJQUM5RztBQUFBLEVBQ0Q7QUFDRDtBQXpEYSxlQUFOO0FBQUEsRUFlSjtBQUFBLEdBZlU7IiwKICAibmFtZXMiOiBbInRpbWVvdXQiXQp9Cg==
