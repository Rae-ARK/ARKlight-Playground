import { Emitter } from "../../../../base/common/event.js";
import { timeout } from "../../../../base/common/async.js";
import { localize } from "../../../../nls.js";
class AbstractDebugAdapter {
  constructor() {
    this.pendingRequests = /* @__PURE__ */ new Map();
    this.pendingRequestTimers = /* @__PURE__ */ new Map();
    this.queue = [];
    this._onError = new Emitter();
    this._onExit = new Emitter();
    this.sequence = 1;
  }
  get onError() {
    return this._onError.event;
  }
  get onExit() {
    return this._onExit.event;
  }
  onMessage(callback) {
    if (this.messageCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Message' callback`));
    }
    this.messageCallback = callback;
  }
  onEvent(callback) {
    if (this.eventCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Event' callback`));
    }
    this.eventCallback = callback;
  }
  onRequest(callback) {
    if (this.requestCallback) {
      this._onError.fire(new Error(`attempt to set more than one 'Request' callback`));
    }
    this.requestCallback = callback;
  }
  sendResponse(response) {
    if (response.seq > 0) {
      this._onError.fire(new Error(`attempt to send more than one response for command ${response.command}`));
    } else {
      this.internalSend("response", response);
    }
  }
  sendRequest(command, args, clb, timeout2) {
    const request = {
      command
    };
    if (args && Object.keys(args).length > 0) {
      request.arguments = args;
    }
    this.internalSend("request", request);
    if (typeof timeout2 === "number") {
      const timer = setTimeout(() => {
        this.pendingRequestTimers.delete(request.seq);
        const clb2 = this.pendingRequests.get(request.seq);
        if (clb2) {
          this.pendingRequests.delete(request.seq);
          const err = {
            type: "response",
            seq: 0,
            request_seq: request.seq,
            success: false,
            command,
            message: localize("timeout", "Timeout after {0} ms for '{1}'", timeout2, command)
          };
          clb2(err);
        }
      }, timeout2);
      this.pendingRequestTimers.set(request.seq, timer);
    }
    if (clb) {
      this.pendingRequests.set(request.seq, clb);
    }
    return request.seq;
  }
  acceptMessage(message) {
    if (this.messageCallback) {
      this.messageCallback(message);
    } else {
      this.queue.push(message);
      if (this.queue.length === 1) {
        this.processQueue();
      }
    }
  }
  /**
   * Returns whether we should insert a timeout between processing messageA
   * and messageB. Artificially queueing protocol messages guarantees that any
   * microtasks for previous message finish before next message is processed.
   * This is essential ordering when using promises anywhere along the call path.
   *
   * For example, take the following, where `chooseAndSendGreeting` returns
   * a person name and then emits a greeting event:
   *
   * ```
   * let person: string;
   * adapter.onGreeting(() => console.log('hello', person));
   * person = await adapter.chooseAndSendGreeting();
   * ```
   *
   * Because the event is dispatched synchronously, it may fire before person
   * is assigned if they're processed in the same task. Inserting a task
   * boundary avoids this issue.
   */
  needsTaskBoundaryBetween(messageA, messageB) {
    return messageA.type !== "event" || messageB.type !== "event";
  }
  /**
   * Reads and dispatches items from the queue until it is empty.
   */
  async processQueue() {
    let message;
    while (this.queue.length) {
      if (!message || this.needsTaskBoundaryBetween(this.queue[0], message)) {
        await timeout(0);
      }
      message = this.queue.shift();
      if (!message) {
        return;
      }
      switch (message.type) {
        case "event":
          this.eventCallback?.(message);
          break;
        case "request":
          this.requestCallback?.(message);
          break;
        case "response": {
          const response = message;
          const clb = this.pendingRequests.get(response.request_seq);
          if (clb) {
            this.pendingRequests.delete(response.request_seq);
            this.clearPendingRequestTimer(response.request_seq);
            clb(response);
          }
          break;
        }
      }
    }
  }
  internalSend(typ, message) {
    message.type = typ;
    message.seq = this.sequence++;
    this.sendMessage(message);
  }
  async cancelPendingRequests() {
    if (this.pendingRequests.size === 0) {
      return Promise.resolve();
    }
    const pending = /* @__PURE__ */ new Map();
    this.pendingRequests.forEach((value, key) => pending.set(key, value));
    await timeout(500);
    pending.forEach((callback, request_seq) => {
      const err = {
        type: "response",
        seq: 0,
        request_seq,
        success: false,
        command: "canceled",
        message: "canceled"
      };
      callback(err);
      this.pendingRequests.delete(request_seq);
      this.clearPendingRequestTimer(request_seq);
    });
  }
  clearPendingRequestTimer(requestSeq) {
    clearTimeout(this.pendingRequestTimers.get(requestSeq));
    this.pendingRequestTimers.delete(requestSeq);
  }
  getPendingRequestIds() {
    return Array.from(this.pendingRequests.keys());
  }
  dispose() {
    for (const timer of this.pendingRequestTimers.values()) {
      clearTimeout(timer);
    }
    this.pendingRequestTimers.clear();
    this._onError.dispose();
    this._onExit.dispose();
    this.queue = [];
  }
}
export {
  AbstractDebugAdapter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9hYnN0cmFjdERlYnVnQWRhcHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURlYnVnQWRhcHRlciB9IGZyb20gJy4vZGVidWcuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuLyoqXG4gKiBBYnN0cmFjdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgbG93IGxldmVsIEFQSSBmb3IgYSBkZWJ1ZyBhZGFwdGVyLlxuICogTWlzc2luZyBpcyBob3cgdGhpcyBBUEkgY29tbXVuaWNhdGVzIHdpdGggdGhlIGRlYnVnIGFkYXB0ZXIuXG4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdERlYnVnQWRhcHRlciBpbXBsZW1lbnRzIElEZWJ1Z0FkYXB0ZXIge1xuXHRwcml2YXRlIHNlcXVlbmNlOiBudW1iZXI7XG5cdHByaXZhdGUgcGVuZGluZ1JlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIChlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKSA9PiB2b2lkPigpO1xuXHRwcml2YXRlIHBlbmRpbmdSZXF1ZXN0VGltZXJzID0gbmV3IE1hcDxudW1iZXIsIFRpbWVvdXQ+KCk7XG5cdHByaXZhdGUgcmVxdWVzdENhbGxiYWNrOiAoKHJlcXVlc3Q6IERlYnVnUHJvdG9jb2wuUmVxdWVzdCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZXZlbnRDYWxsYmFjazogKChyZXF1ZXN0OiBEZWJ1Z1Byb3RvY29sLkV2ZW50KSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtZXNzYWdlQ2FsbGJhY2s6ICgobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHF1ZXVlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZVtdID0gW107XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25FcnJvciA9IG5ldyBFbWl0dGVyPEVycm9yPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRXhpdCA9IG5ldyBFbWl0dGVyPG51bWJlciB8IG51bGw+KCk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5zZXF1ZW5jZSA9IDE7XG5cdH1cblxuXHRhYnN0cmFjdCBzdGFydFNlc3Npb24oKTogUHJvbWlzZTx2b2lkPjtcblxuXHRhYnN0cmFjdCBzdG9wU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGFic3RyYWN0IHNlbmRNZXNzYWdlKG1lc3NhZ2U6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlKTogdm9pZDtcblxuXHRnZXQgb25FcnJvcigpOiBFdmVudDxFcnJvcj4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRXhpdCgpOiBFdmVudDxudW1iZXIgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRXhpdC5ldmVudDtcblx0fVxuXG5cdG9uTWVzc2FnZShjYWxsYmFjazogKG1lc3NhZ2U6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVzc2FnZUNhbGxiYWNrKSB7XG5cdFx0XHR0aGlzLl9vbkVycm9yLmZpcmUobmV3IEVycm9yKGBhdHRlbXB0IHRvIHNldCBtb3JlIHRoYW4gb25lICdNZXNzYWdlJyBjYWxsYmFja2ApKTtcblx0XHR9XG5cdFx0dGhpcy5tZXNzYWdlQ2FsbGJhY2sgPSBjYWxsYmFjaztcblx0fVxuXG5cdG9uRXZlbnQoY2FsbGJhY2s6IChldmVudDogRGVidWdQcm90b2NvbC5FdmVudCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV2ZW50Q2FsbGJhY2spIHtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoYGF0dGVtcHQgdG8gc2V0IG1vcmUgdGhhbiBvbmUgJ0V2ZW50JyBjYWxsYmFja2ApKTtcblx0XHR9XG5cdFx0dGhpcy5ldmVudENhbGxiYWNrID0gY2FsbGJhY2s7XG5cdH1cblxuXHRvblJlcXVlc3QoY2FsbGJhY2s6IChyZXF1ZXN0OiBEZWJ1Z1Byb3RvY29sLlJlcXVlc3QpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5yZXF1ZXN0Q2FsbGJhY2spIHtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoYGF0dGVtcHQgdG8gc2V0IG1vcmUgdGhhbiBvbmUgJ1JlcXVlc3QnIGNhbGxiYWNrYCkpO1xuXHRcdH1cblx0XHR0aGlzLnJlcXVlc3RDYWxsYmFjayA9IGNhbGxiYWNrO1xuXHR9XG5cblx0c2VuZFJlc3BvbnNlKHJlc3BvbnNlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKTogdm9pZCB7XG5cdFx0aWYgKHJlc3BvbnNlLnNlcSA+IDApIHtcblx0XHRcdHRoaXMuX29uRXJyb3IuZmlyZShuZXcgRXJyb3IoYGF0dGVtcHQgdG8gc2VuZCBtb3JlIHRoYW4gb25lIHJlc3BvbnNlIGZvciBjb21tYW5kICR7cmVzcG9uc2UuY29tbWFuZH1gKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxTZW5kKCdyZXNwb25zZScsIHJlc3BvbnNlKTtcblx0XHR9XG5cdH1cblxuXHRzZW5kUmVxdWVzdChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IGFueSwgY2xiOiAocmVzdWx0OiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKSA9PiB2b2lkLCB0aW1lb3V0PzogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCByZXF1ZXN0OiBhbnkgPSB7XG5cdFx0XHRjb21tYW5kOiBjb21tYW5kXG5cdFx0fTtcblx0XHRpZiAoYXJncyAmJiBPYmplY3Qua2V5cyhhcmdzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXF1ZXN0LmFyZ3VtZW50cyA9IGFyZ3M7XG5cdFx0fVxuXHRcdHRoaXMuaW50ZXJuYWxTZW5kKCdyZXF1ZXN0JywgcmVxdWVzdCk7XG5cdFx0aWYgKHR5cGVvZiB0aW1lb3V0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdFRpbWVycy5kZWxldGUocmVxdWVzdC5zZXEpO1xuXHRcdFx0XHRjb25zdCBjbGIgPSB0aGlzLnBlbmRpbmdSZXF1ZXN0cy5nZXQocmVxdWVzdC5zZXEpO1xuXHRcdFx0XHRpZiAoY2xiKSB7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3Quc2VxKTtcblx0XHRcdFx0XHRjb25zdCBlcnI6IERlYnVnUHJvdG9jb2wuUmVzcG9uc2UgPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0XHRcdFx0c2VxOiAwLFxuXHRcdFx0XHRcdFx0cmVxdWVzdF9zZXE6IHJlcXVlc3Quc2VxLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3RpbWVvdXQnLCBcIlRpbWVvdXQgYWZ0ZXIgezB9IG1zIGZvciAnezF9J1wiLCB0aW1lb3V0LCBjb21tYW5kKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y2xiKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRpbWVvdXQpO1xuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdFRpbWVycy5zZXQocmVxdWVzdC5zZXEsIHRpbWVyKTtcblx0XHR9XG5cdFx0aWYgKGNsYikge1xuXHRcdFx0Ly8gc3RvcmUgY2FsbGJhY2sgZm9yIHRoaXMgcmVxdWVzdFxuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuc2V0KHJlcXVlc3Quc2VxLCBjbGIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXF1ZXN0LnNlcTtcblx0fVxuXG5cdGFjY2VwdE1lc3NhZ2UobWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZXNzYWdlQ2FsbGJhY2spIHtcblx0XHRcdHRoaXMubWVzc2FnZUNhbGxiYWNrKG1lc3NhZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnF1ZXVlLnB1c2gobWVzc2FnZSk7XG5cdFx0XHRpZiAodGhpcy5xdWV1ZS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gZmlyc3QgaXRlbSA9IG5lZWQgdG8gc3RhcnQgcHJvY2Vzc2luZyBsb29wXG5cdFx0XHRcdHRoaXMucHJvY2Vzc1F1ZXVlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB3ZSBzaG91bGQgaW5zZXJ0IGEgdGltZW91dCBiZXR3ZWVuIHByb2Nlc3NpbmcgbWVzc2FnZUFcblx0ICogYW5kIG1lc3NhZ2VCLiBBcnRpZmljaWFsbHkgcXVldWVpbmcgcHJvdG9jb2wgbWVzc2FnZXMgZ3VhcmFudGVlcyB0aGF0IGFueVxuXHQgKiBtaWNyb3Rhc2tzIGZvciBwcmV2aW91cyBtZXNzYWdlIGZpbmlzaCBiZWZvcmUgbmV4dCBtZXNzYWdlIGlzIHByb2Nlc3NlZC5cblx0ICogVGhpcyBpcyBlc3NlbnRpYWwgb3JkZXJpbmcgd2hlbiB1c2luZyBwcm9taXNlcyBhbnl3aGVyZSBhbG9uZyB0aGUgY2FsbCBwYXRoLlxuXHQgKlxuXHQgKiBGb3IgZXhhbXBsZSwgdGFrZSB0aGUgZm9sbG93aW5nLCB3aGVyZSBgY2hvb3NlQW5kU2VuZEdyZWV0aW5nYCByZXR1cm5zXG5cdCAqIGEgcGVyc29uIG5hbWUgYW5kIHRoZW4gZW1pdHMgYSBncmVldGluZyBldmVudDpcblx0ICpcblx0ICogYGBgXG5cdCAqIGxldCBwZXJzb246IHN0cmluZztcblx0ICogYWRhcHRlci5vbkdyZWV0aW5nKCgpID0+IGNvbnNvbGUubG9nKCdoZWxsbycsIHBlcnNvbikpO1xuXHQgKiBwZXJzb24gPSBhd2FpdCBhZGFwdGVyLmNob29zZUFuZFNlbmRHcmVldGluZygpO1xuXHQgKiBgYGBcblx0ICpcblx0ICogQmVjYXVzZSB0aGUgZXZlbnQgaXMgZGlzcGF0Y2hlZCBzeW5jaHJvbm91c2x5LCBpdCBtYXkgZmlyZSBiZWZvcmUgcGVyc29uXG5cdCAqIGlzIGFzc2lnbmVkIGlmIHRoZXkncmUgcHJvY2Vzc2VkIGluIHRoZSBzYW1lIHRhc2suIEluc2VydGluZyBhIHRhc2tcblx0ICogYm91bmRhcnkgYXZvaWRzIHRoaXMgaXNzdWUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgbmVlZHNUYXNrQm91bmRhcnlCZXR3ZWVuKG1lc3NhZ2VBOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSwgbWVzc2FnZUI6IERlYnVnUHJvdG9jb2wuUHJvdG9jb2xNZXNzYWdlKSB7XG5cdFx0cmV0dXJuIG1lc3NhZ2VBLnR5cGUgIT09ICdldmVudCcgfHwgbWVzc2FnZUIudHlwZSAhPT0gJ2V2ZW50Jztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhbmQgZGlzcGF0Y2hlcyBpdGVtcyBmcm9tIHRoZSBxdWV1ZSB1bnRpbCBpdCBpcyBlbXB0eS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcHJvY2Vzc1F1ZXVlKCkge1xuXHRcdGxldCBtZXNzYWdlOiBEZWJ1Z1Byb3RvY29sLlByb3RvY29sTWVzc2FnZSB8IHVuZGVmaW5lZDtcblx0XHR3aGlsZSAodGhpcy5xdWV1ZS5sZW5ndGgpIHtcblx0XHRcdGlmICghbWVzc2FnZSB8fCB0aGlzLm5lZWRzVGFza0JvdW5kYXJ5QmV0d2Vlbih0aGlzLnF1ZXVlWzBdLCBtZXNzYWdlKSkge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0fVxuXG5cdFx0XHRtZXNzYWdlID0gdGhpcy5xdWV1ZS5zaGlmdCgpO1xuXHRcdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gbWF5IGhhdmUgYmVlbiBkaXNwb3NlZCBvZlxuXHRcdFx0fVxuXG5cdFx0XHRzd2l0Y2ggKG1lc3NhZ2UudHlwZSkge1xuXHRcdFx0XHRjYXNlICdldmVudCc6XG5cdFx0XHRcdFx0dGhpcy5ldmVudENhbGxiYWNrPy4oPERlYnVnUHJvdG9jb2wuRXZlbnQ+bWVzc2FnZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3JlcXVlc3QnOlxuXHRcdFx0XHRcdHRoaXMucmVxdWVzdENhbGxiYWNrPy4oPERlYnVnUHJvdG9jb2wuUmVxdWVzdD5tZXNzYWdlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncmVzcG9uc2UnOiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSA8RGVidWdQcm90b2NvbC5SZXNwb25zZT5tZXNzYWdlO1xuXHRcdFx0XHRcdGNvbnN0IGNsYiA9IHRoaXMucGVuZGluZ1JlcXVlc3RzLmdldChyZXNwb25zZS5yZXF1ZXN0X3NlcSk7XG5cdFx0XHRcdFx0aWYgKGNsYikge1xuXHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlc3BvbnNlLnJlcXVlc3Rfc2VxKTtcblx0XHRcdFx0XHRcdHRoaXMuY2xlYXJQZW5kaW5nUmVxdWVzdFRpbWVyKHJlc3BvbnNlLnJlcXVlc3Rfc2VxKTtcblx0XHRcdFx0XHRcdGNsYihyZXNwb25zZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbnRlcm5hbFNlbmQodHlwOiAncmVxdWVzdCcgfCAncmVzcG9uc2UnIHwgJ2V2ZW50JywgbWVzc2FnZTogRGVidWdQcm90b2NvbC5Qcm90b2NvbE1lc3NhZ2UpOiB2b2lkIHtcblx0XHRtZXNzYWdlLnR5cGUgPSB0eXA7XG5cdFx0bWVzc2FnZS5zZXEgPSB0aGlzLnNlcXVlbmNlKys7XG5cdFx0dGhpcy5zZW5kTWVzc2FnZShtZXNzYWdlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBjYW5jZWxQZW5kaW5nUmVxdWVzdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMucGVuZGluZ1JlcXVlc3RzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nID0gbmV3IE1hcDxudW1iZXIsIChlOiBEZWJ1Z1Byb3RvY29sLlJlc3BvbnNlKSA9PiB2b2lkPigpO1xuXHRcdHRoaXMucGVuZGluZ1JlcXVlc3RzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHBlbmRpbmcuc2V0KGtleSwgdmFsdWUpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwMCk7XG5cdFx0cGVuZGluZy5mb3JFYWNoKChjYWxsYmFjaywgcmVxdWVzdF9zZXEpID0+IHtcblx0XHRcdGNvbnN0IGVycjogRGVidWdQcm90b2NvbC5SZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0c2VxOiAwLFxuXHRcdFx0XHRyZXF1ZXN0X3NlcSxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjYW5jZWxlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdjYW5jZWxlZCdcblx0XHRcdH07XG5cdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0dGhpcy5wZW5kaW5nUmVxdWVzdHMuZGVsZXRlKHJlcXVlc3Rfc2VxKTtcblx0XHRcdHRoaXMuY2xlYXJQZW5kaW5nUmVxdWVzdFRpbWVyKHJlcXVlc3Rfc2VxKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJQZW5kaW5nUmVxdWVzdFRpbWVyKHJlcXVlc3RTZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdGNsZWFyVGltZW91dCh0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLmdldChyZXF1ZXN0U2VxKSk7XG5cdFx0dGhpcy5wZW5kaW5nUmVxdWVzdFRpbWVycy5kZWxldGUocmVxdWVzdFNlcSk7XG5cdH1cblxuXHRnZXRQZW5kaW5nUmVxdWVzdElkcygpOiBudW1iZXJbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5wZW5kaW5nUmVxdWVzdHMua2V5cygpKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0aW1lciBvZiB0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdH1cblx0XHR0aGlzLnBlbmRpbmdSZXF1ZXN0VGltZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25FcnJvci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25FeGl0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnF1ZXVlID0gW107XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxlQUFlO0FBQ3hCLFNB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
