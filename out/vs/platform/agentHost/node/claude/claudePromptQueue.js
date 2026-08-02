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
import { DeferredPromise } from "../../../../base/common/async.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../log/common/log.js";
let ClaudePromptQueue = class extends Disposable {
  constructor(_sessionId, _getAbortSignal, _onSteeringYielded, _logService) {
    super();
    this._sessionId = _sessionId;
    this._getAbortSignal = _getAbortSignal;
    this._onSteeringYielded = _onSteeringYielded;
    this._logService = _logService;
    this._toYield = [];
    this._yielded = [];
    /**
     * Entries that have been popped by {@link settleHead} during the
     * current turn but whose deferreds haven't been completed yet — we
     * batch-complete them when the turn fully drains so an intermediate
     * `result` (steering preempt; CONTEXT.md M10) does NOT settle the
     * original `sendMessage`'s deferred.
     */
    this._popped = [];
    this._pendingPromptDeferred = new DeferredPromise();
    this.iterable = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          while (true) {
            if (this._getAbortSignal().aborted) {
              return { done: true, value: void 0 };
            }
            if (this._toYield.length > 0) {
              const entry = this._toYield.shift();
              this._yielded.push(entry);
              this._logService.info(`[Claude:${this._sessionId}] queue yielded sdkUuid=${entry.sdkUuid} turnId=${entry.turnId}${entry.steeringPendingId ? ` steeringPendingId=${entry.steeringPendingId}` : ""}`);
              if (entry.steeringPendingId) {
                this._onSteeringYielded(entry.steeringPendingId);
              }
              return { done: false, value: entry.sdkMessage };
            }
            await this._pendingPromptDeferred.p;
            this._pendingPromptDeferred = new DeferredPromise();
          }
        }
      })
    };
  }
  /** True iff no entries are queued or in-flight. */
  get isEmpty() {
    return this._toYield.length === 0 && this._yielded.length === 0;
  }
  /**
   * Push an entry. Resolves with the entry's deferred (which the
   * consumer settles on `result` via {@link settleHead}).
   */
  push(entry) {
    this._toYield.push(entry);
    this._pendingPromptDeferred.complete();
    return entry.deferred.p;
  }
  /**
   * Most-recent in-flight or queued entry, used by steering to inherit
   * its parent's `turnId`. Prefers the in-flight head over the latest
   * queued entry (matches CONTEXT.md M10: steering folds into the
   * in-progress protocol Turn).
   */
  peekParent() {
    return this._yielded[0] ?? this._toYield[this._toYield.length - 1];
  }
  /**
   * Pop the head of the yielded list. If the queue is now fully
   * drained (no more pending or in-flight entries), batch-complete
   * every popped-but-deferred deferred from this turn including the
   * one we just popped. Otherwise hold the popped entry's deferred
   * until the turn ends — the M10 invariant for steering preempt.
   * Called by the consumer on every `result` message.
   */
  settleHead() {
    const completed = this._yielded.shift();
    if (!completed) {
      return void 0;
    }
    if (this.isEmpty) {
      completed.deferred.complete();
      for (const e of this._popped) {
        if (!e.deferred.isSettled) {
          e.deferred.complete();
        }
      }
      this._popped = [];
    } else {
      this._popped.push(completed);
    }
    return completed;
  }
  /** Reject every pending deferred with `err` and clear all lists. */
  failAll(err) {
    const rejectAll = (list) => {
      for (const entry of list) {
        if (!entry.deferred.isSettled) {
          entry.deferred.error(err);
        }
      }
    };
    rejectAll(this._toYield);
    rejectAll(this._yielded);
    rejectAll(this._popped);
    this._toYield = [];
    this._yielded = [];
    this._popped = [];
  }
  /** Wake any parked `next()` — call after the controller is aborted so the iterable returns `done`. */
  notifyAborted() {
    this._pendingPromptDeferred.complete();
  }
  /** Re-create the parked deferred for a fresh Query binding. */
  resetForRebind() {
    this._pendingPromptDeferred = new DeferredPromise();
  }
};
ClaudePromptQueue = __decorateClass([
  __decorateParam(3, ILogService)
], ClaudePromptQueue);
export {
  ClaudePromptQueue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVQcm9tcHRRdWV1ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgU0RLVXNlck1lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbi8qKlxuICogT25lIHtAbGluayBTREtVc2VyTWVzc2FnZX0gdGhlIHF1ZXVlIGhhcyBoYW5kZWQgdG8gKG9yIGlzIGFib3V0IHRvXG4gKiBoYW5kIHRvKSB0aGUgU0RLLiBMaWZlY3ljbGU6XG4gKiAgIDEuIENyZWF0ZWQgYnkgdGhlIGNhbGxlciBhbmQgcHVzaGVkIHZpYSB7QGxpbmsgQ2xhdWRlUHJvbXB0UXVldWUucHVzaH0uXG4gKiAgIDIuIFNoaWZ0ZWQgb2ZmIHRoZSB0by15aWVsZCBsaXN0IGFuZCBwdXNoZWQgdG8gdGhlIHlpZWxkZWQgbGlzdCB3aGVuXG4gKiAgICAgIHRoZSBwcm9tcHQgaXRlcmFibGUgaGFuZHMgaXQgdG8gdGhlIFNESy5cbiAqICAgMy4gU2hpZnRlZCBvZmYgdGhlIHlpZWxkZWQgbGlzdCBhbmQge0BsaW5rIGRlZmVycmVkfSBzZXR0bGVkIHdoZW5cbiAqICAgICAgdGhlIG1hdGNoaW5nIFNESyBgcmVzdWx0YCBtZXNzYWdlIGFycml2ZXMgKHZpYVxuICogICAgICB7QGxpbmsgQ2xhdWRlUHJvbXB0UXVldWUuc2V0dGxlSGVhZH0pLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQZW5kaW5nU2RrTWVzc2FnZSB7XG5cdHJlYWRvbmx5IHNka01lc3NhZ2U6IFNES1VzZXJNZXNzYWdlO1xuXHRyZWFkb25seSBzZGtVdWlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzdG9wV2F0Y2g6IFN0b3BXYXRjaDtcblx0cmVhZG9ubHkgZGVmZXJyZWQ6IERlZmVycmVkUHJvbWlzZTx2b2lkPjtcblx0cmVhZG9ubHkgc3RlZXJpbmdQZW5kaW5nSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogT3ducyB0aGUgcHJvbXB0IHF1ZXVlICsgdGhlIGFzeW5jIGl0ZXJhYmxlIGhhbmRlZCB0b1xuICogYFdhcm1RdWVyeS5xdWVyeSgpYC4gS25vd3Mgbm90aGluZyBhYm91dCB0aGUgU0RLIFF1ZXJ5IGxpZmVjeWNsZSxcbiAqIGNvbmZpZyBwdXNoLCBvciBtZXNzYWdlIGRpc3BhdGNoIFx1MjAxNCB0aG9zZSBsaXZlIG9uIHRoZSBwaXBlbGluZS5cbiAqXG4gKiBJbnZhcmlhbnRzOlxuICogICBcdTIwMjIgUHVzaGluZyB3YWtlcyB0aGUgaXRlcmFibGUncyBwYXJrZWQgYG5leHQoKWAuXG4gKiAgIFx1MjAyMiBUaGUgaXRlcmFibGUgcmV0dXJucyBgZG9uZWAgd2hlbiB0aGUgc3VwcGxpZWQgYGdldEFib3J0U2lnbmFsKClgXG4gKiAgICAgaXMgYWJvcnRlZDsgcGlwZWxpbmUgY2FsbHMge0BsaW5rIG5vdGlmeUFib3J0ZWR9IGFmdGVyIGZsaXBwaW5nXG4gKiAgICAgdGhlIGNvbnRyb2xsZXIgc28gdGhlIHBhcmtlZCBgbmV4dCgpYCByZXR1cm5zIGltbWVkaWF0ZWx5LlxuICogICBcdTIwMjIge0BsaW5rIHNldHRsZUhlYWR9IHBvcHMgdGhlIGhlYWQgb2YgdGhlIHlpZWxkZWQgbGlzdCAoY2FsbGVkIGJ5XG4gKiAgICAgdGhlIGNvbnN1bWVyIGxvb3Agb24gZXZlcnkgYHJlc3VsdGAgbWVzc2FnZSkuXG4gKiAgIFx1MjAyMiB7QGxpbmsgZmFpbEFsbH0gcmVqZWN0cyBldmVyeSBwZW5kaW5nIGRlZmVycmVkIGFuZCBjbGVhcnMgYm90aFxuICogICAgIGxpc3RzOyB1c2VkIGJ5IGFib3J0IGFuZCBjcmFzaCBmYW4tb3V0LlxuICogICBcdTIwMjIge0BsaW5rIHJlc2V0Rm9yUmViaW5kfSByZS1jcmVhdGVzIHRoZSBwYXJrZWQgZGVmZXJyZWQgZm9yIGEgZnJlc2hcbiAqICAgICBRdWVyeSBiaW5kaW5nICh0aGUgcXVldWUgaXRzZWxmIHN1cnZpdmVzIGFjcm9zcyByZWJpbmRzKS5cbiAqL1xuZXhwb3J0IGNsYXNzIENsYXVkZVByb21wdFF1ZXVlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfdG9ZaWVsZDogSVBlbmRpbmdTZGtNZXNzYWdlW10gPSBbXTtcblx0cHJpdmF0ZSBfeWllbGRlZDogSVBlbmRpbmdTZGtNZXNzYWdlW10gPSBbXTtcblx0LyoqXG5cdCAqIEVudHJpZXMgdGhhdCBoYXZlIGJlZW4gcG9wcGVkIGJ5IHtAbGluayBzZXR0bGVIZWFkfSBkdXJpbmcgdGhlXG5cdCAqIGN1cnJlbnQgdHVybiBidXQgd2hvc2UgZGVmZXJyZWRzIGhhdmVuJ3QgYmVlbiBjb21wbGV0ZWQgeWV0IFx1MjAxNCB3ZVxuXHQgKiBiYXRjaC1jb21wbGV0ZSB0aGVtIHdoZW4gdGhlIHR1cm4gZnVsbHkgZHJhaW5zIHNvIGFuIGludGVybWVkaWF0ZVxuXHQgKiBgcmVzdWx0YCAoc3RlZXJpbmcgcHJlZW1wdDsgQ09OVEVYVC5tZCBNMTApIGRvZXMgTk9UIHNldHRsZSB0aGVcblx0ICogb3JpZ2luYWwgYHNlbmRNZXNzYWdlYCdzIGRlZmVycmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcG9wcGVkOiBJUGVuZGluZ1Nka01lc3NhZ2VbXSA9IFtdO1xuXHRwcml2YXRlIF9wZW5kaW5nUHJvbXB0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0cmVhZG9ubHkgaXRlcmFibGU6IEFzeW5jSXRlcmFibGU8U0RLVXNlck1lc3NhZ2U+ID0ge1xuXHRcdFtTeW1ib2wuYXN5bmNJdGVyYXRvcl06ICgpID0+ICh7XG5cdFx0XHRuZXh0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2dldEFib3J0U2lnbmFsKCkuYWJvcnRlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZG9uZTogdHJ1ZSwgdmFsdWU6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5fdG9ZaWVsZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3RvWWllbGQuc2hpZnQoKSE7XG5cdFx0XHRcdFx0XHR0aGlzLl95aWVsZGVkLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7dGhpcy5fc2Vzc2lvbklkfV0gcXVldWUgeWllbGRlZCBzZGtVdWlkPSR7ZW50cnkuc2RrVXVpZH0gdHVybklkPSR7ZW50cnkudHVybklkfSR7ZW50cnkuc3RlZXJpbmdQZW5kaW5nSWQgPyBgIHN0ZWVyaW5nUGVuZGluZ0lkPSR7ZW50cnkuc3RlZXJpbmdQZW5kaW5nSWR9YCA6ICcnfWApO1xuXHRcdFx0XHRcdFx0aWYgKGVudHJ5LnN0ZWVyaW5nUGVuZGluZ0lkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uU3RlZXJpbmdZaWVsZGVkKGVudHJ5LnN0ZWVyaW5nUGVuZGluZ0lkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB7IGRvbmU6IGZhbHNlLCB2YWx1ZTogZW50cnkuc2RrTWVzc2FnZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wZW5kaW5nUHJvbXB0RGVmZXJyZWQucDtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUHJvbXB0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSksXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0QWJvcnRTaWduYWw6ICgpID0+IEFib3J0U2lnbmFsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uU3RlZXJpbmdZaWVsZGVkOiAocGVuZGluZ0lkOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqIFRydWUgaWZmIG5vIGVudHJpZXMgYXJlIHF1ZXVlZCBvciBpbi1mbGlnaHQuICovXG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90b1lpZWxkLmxlbmd0aCA9PT0gMCAmJiB0aGlzLl95aWVsZGVkLmxlbmd0aCA9PT0gMDtcblx0fVxuXHQvKipcblx0ICogUHVzaCBhbiBlbnRyeS4gUmVzb2x2ZXMgd2l0aCB0aGUgZW50cnkncyBkZWZlcnJlZCAod2hpY2ggdGhlXG5cdCAqIGNvbnN1bWVyIHNldHRsZXMgb24gYHJlc3VsdGAgdmlhIHtAbGluayBzZXR0bGVIZWFkfSkuXG5cdCAqL1xuXHRwdXNoKGVudHJ5OiBJUGVuZGluZ1Nka01lc3NhZ2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90b1lpZWxkLnB1c2goZW50cnkpO1xuXHRcdHRoaXMuX3BlbmRpbmdQcm9tcHREZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdHJldHVybiBlbnRyeS5kZWZlcnJlZC5wO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vc3QtcmVjZW50IGluLWZsaWdodCBvciBxdWV1ZWQgZW50cnksIHVzZWQgYnkgc3RlZXJpbmcgdG8gaW5oZXJpdFxuXHQgKiBpdHMgcGFyZW50J3MgYHR1cm5JZGAuIFByZWZlcnMgdGhlIGluLWZsaWdodCBoZWFkIG92ZXIgdGhlIGxhdGVzdFxuXHQgKiBxdWV1ZWQgZW50cnkgKG1hdGNoZXMgQ09OVEVYVC5tZCBNMTA6IHN0ZWVyaW5nIGZvbGRzIGludG8gdGhlXG5cdCAqIGluLXByb2dyZXNzIHByb3RvY29sIFR1cm4pLlxuXHQgKi9cblx0cGVla1BhcmVudCgpOiBJUGVuZGluZ1Nka01lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl95aWVsZGVkWzBdID8/IHRoaXMuX3RvWWllbGRbdGhpcy5fdG9ZaWVsZC5sZW5ndGggLSAxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQb3AgdGhlIGhlYWQgb2YgdGhlIHlpZWxkZWQgbGlzdC4gSWYgdGhlIHF1ZXVlIGlzIG5vdyBmdWxseVxuXHQgKiBkcmFpbmVkIChubyBtb3JlIHBlbmRpbmcgb3IgaW4tZmxpZ2h0IGVudHJpZXMpLCBiYXRjaC1jb21wbGV0ZVxuXHQgKiBldmVyeSBwb3BwZWQtYnV0LWRlZmVycmVkIGRlZmVycmVkIGZyb20gdGhpcyB0dXJuIGluY2x1ZGluZyB0aGVcblx0ICogb25lIHdlIGp1c3QgcG9wcGVkLiBPdGhlcndpc2UgaG9sZCB0aGUgcG9wcGVkIGVudHJ5J3MgZGVmZXJyZWRcblx0ICogdW50aWwgdGhlIHR1cm4gZW5kcyBcdTIwMTQgdGhlIE0xMCBpbnZhcmlhbnQgZm9yIHN0ZWVyaW5nIHByZWVtcHQuXG5cdCAqIENhbGxlZCBieSB0aGUgY29uc3VtZXIgb24gZXZlcnkgYHJlc3VsdGAgbWVzc2FnZS5cblx0ICovXG5cdHNldHRsZUhlYWQoKTogSVBlbmRpbmdTZGtNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21wbGV0ZWQgPSB0aGlzLl95aWVsZGVkLnNoaWZ0KCk7XG5cdFx0aWYgKCFjb21wbGV0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzRW1wdHkpIHtcblx0XHRcdGNvbXBsZXRlZC5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMuX3BvcHBlZCkge1xuXHRcdFx0XHRpZiAoIWUuZGVmZXJyZWQuaXNTZXR0bGVkKSB7XG5cdFx0XHRcdFx0ZS5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wb3BwZWQgPSBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcG9wcGVkLnB1c2goY29tcGxldGVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbXBsZXRlZDtcblx0fVxuXG5cdC8qKiBSZWplY3QgZXZlcnkgcGVuZGluZyBkZWZlcnJlZCB3aXRoIGBlcnJgIGFuZCBjbGVhciBhbGwgbGlzdHMuICovXG5cdGZhaWxBbGwoZXJyOiBFcnJvcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlamVjdEFsbCA9IChsaXN0OiBJUGVuZGluZ1Nka01lc3NhZ2VbXSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBsaXN0KSB7XG5cdFx0XHRcdGlmICghZW50cnkuZGVmZXJyZWQuaXNTZXR0bGVkKSB7XG5cdFx0XHRcdFx0ZW50cnkuZGVmZXJyZWQuZXJyb3IoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmVqZWN0QWxsKHRoaXMuX3RvWWllbGQpO1xuXHRcdHJlamVjdEFsbCh0aGlzLl95aWVsZGVkKTtcblx0XHRyZWplY3RBbGwodGhpcy5fcG9wcGVkKTtcblx0XHR0aGlzLl90b1lpZWxkID0gW107XG5cdFx0dGhpcy5feWllbGRlZCA9IFtdO1xuXHRcdHRoaXMuX3BvcHBlZCA9IFtdO1xuXHR9XG5cblx0LyoqIFdha2UgYW55IHBhcmtlZCBgbmV4dCgpYCBcdTIwMTQgY2FsbCBhZnRlciB0aGUgY29udHJvbGxlciBpcyBhYm9ydGVkIHNvIHRoZSBpdGVyYWJsZSByZXR1cm5zIGBkb25lYC4gKi9cblx0bm90aWZ5QWJvcnRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nUHJvbXB0RGVmZXJyZWQuY29tcGxldGUoKTtcblx0fVxuXG5cdC8qKiBSZS1jcmVhdGUgdGhlIHBhcmtlZCBkZWZlcnJlZCBmb3IgYSBmcmVzaCBRdWVyeSBiaW5kaW5nLiAqL1xuXHRyZXNldEZvclJlYmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nUHJvbXB0RGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxtQkFBbUI7QUFzQ3JCLElBQU0sb0JBQU4sY0FBZ0MsV0FBVztBQUFBLEVBcUNqRCxZQUNrQixZQUNBLGlCQUNBLG9CQUNhLGFBQzdCO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFDQTtBQUNhO0FBdkMvQixTQUFRLFdBQWlDLENBQUM7QUFDMUMsU0FBUSxXQUFpQyxDQUFDO0FBUTFDO0FBQUE7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
