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
import { Worker } from "worker_threads";
import { Disposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { ILogService } from "../../log/common/log.js";
import { DEFAULT_DIFF_TIMEOUT_MS } from "../common/diffComputeService.js";
let NodeWorkerDiffComputeService = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._workerFailures = 0;
    this._nextId = 1;
    this._pending = /* @__PURE__ */ new Map();
  }
  async computeDiffCounts(original, modified, timeoutMs = DEFAULT_DIFF_TIMEOUT_MS) {
    return this._callWorker("computeDiffCounts", original, modified, timeoutMs);
  }
  async computeDetailedDiff(original, modified, timeoutMs = DEFAULT_DIFF_TIMEOUT_MS) {
    return this._callWorker("computeDetailedDiff", original, modified, timeoutMs);
  }
  async _callWorker(functionName, original, modified, timeoutMs) {
    const worker = this._ensureWorker();
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve: (value) => resolve(value), reject });
      try {
        worker.postMessage({ id, fn: functionName, args: [original, modified, timeoutMs] });
      } catch (err) {
        this._pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
  _ensureWorker() {
    if (this._workerFailures >= 3) {
      throw new Error("Diff compute worker failed too many times");
    }
    if (!this._worker) {
      const workerPath = FileAccess.asFileUri("vs/platform/agentHost/node/diffWorkerMain.js").fsPath;
      const w = new Worker(workerPath, { name: "Diff compute worker" });
      w.on("message", (msg) => {
        const handler = this._pending.get(msg.id);
        if (!handler) {
          return;
        }
        this._pending.delete(msg.id);
        if (msg.err) {
          const error = new Error(msg.err.message);
          if (msg.err.stack) {
            error.stack = msg.err.stack;
          }
          handler.reject(error);
        } else {
          handler.resolve(msg.res);
        }
      });
      w.on("error", (err) => {
        this._logService.error("[DiffComputeService] Worker error", err);
        for (const [, handler] of this._pending) {
          handler.reject(err);
        }
        this._pending.clear();
        this._worker = void 0;
        this._workerFailures++;
      });
      this._worker = w;
    }
    return this._worker;
  }
  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = void 0;
    }
    for (const [, handler] of this._pending) {
      handler.reject(new Error("DiffComputeService disposed"));
    }
    this._pending.clear();
    super.dispose();
  }
};
NodeWorkerDiffComputeService = __decorateClass([
  __decorateParam(0, ILogService)
], NodeWorkerDiffComputeService);
export {
  NodeWorkerDiffComputeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2RpZmZDb21wdXRlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFdvcmtlciB9IGZyb20gJ3dvcmtlcl90aHJlYWRzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0RJRkZfVElNRU9VVF9NUywgSURpZmZDb21wdXRlU2VydmljZSwgdHlwZSBJRGV0YWlsZWREaWZmUmVzdWx0LCB0eXBlIElEaWZmQ291bnRSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBOb2RlLmpzIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJRGlmZkNvbXB1dGVTZXJ2aWNlfSB0aGF0IHJ1bnNcbiAqIHtAbGluayBEZWZhdWx0TGluZXNEaWZmQ29tcHV0ZXJ9IGluIGEgd29ya2VyIHRocmVhZCB0byBhdm9pZCBibG9ja2luZ1xuICogdGhlIG1haW4gdGhyZWFkLlxuICovXG5leHBvcnQgY2xhc3MgTm9kZVdvcmtlckRpZmZDb21wdXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGlmZkNvbXB1dGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF93b3JrZXI6IFdvcmtlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd29ya2VyRmFpbHVyZXMgPSAwO1xuXHRwcml2YXRlIF9uZXh0SWQgPSAxO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nID0gbmV3IE1hcDxudW1iZXIsIHsgcmVzb2x2ZTogKHZhbHVlOiBJRGlmZkNvdW50UmVzdWx0IHwgSURldGFpbGVkRGlmZlJlc3VsdCkgPT4gdm9pZDsgcmVqZWN0OiAoZXJyOiBFcnJvcikgPT4gdm9pZCB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGNvbXB1dGVEaWZmQ291bnRzKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIHRpbWVvdXRNczogbnVtYmVyID0gREVGQVVMVF9ESUZGX1RJTUVPVVRfTVMpOiBQcm9taXNlPElEaWZmQ291bnRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2FsbFdvcmtlcignY29tcHV0ZURpZmZDb3VudHMnLCBvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcyk7XG5cdH1cblxuXHRhc3luYyBjb21wdXRlRGV0YWlsZWREaWZmKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIHRpbWVvdXRNczogbnVtYmVyID0gREVGQVVMVF9ESUZGX1RJTUVPVVRfTVMpOiBQcm9taXNlPElEZXRhaWxlZERpZmZSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2FsbFdvcmtlcignY29tcHV0ZURldGFpbGVkRGlmZicsIG9yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NhbGxXb3JrZXI8VCBleHRlbmRzIElEaWZmQ291bnRSZXN1bHQgfCBJRGV0YWlsZWREaWZmUmVzdWx0PihmdW5jdGlvbk5hbWU6IHN0cmluZywgb3JpZ2luYWw6IHN0cmluZywgbW9kaWZpZWQ6IHN0cmluZywgdGltZW91dE1zOiBudW1iZXIpOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCB3b3JrZXIgPSB0aGlzLl9lbnN1cmVXb3JrZXIoKTtcblx0XHRjb25zdCBpZCA9IHRoaXMuX25leHRJZCsrO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nLnNldChpZCwgeyByZXNvbHZlOiB2YWx1ZSA9PiByZXNvbHZlKHZhbHVlIGFzIFQpLCByZWplY3QgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR3b3JrZXIucG9zdE1lc3NhZ2UoeyBpZCwgZm46IGZ1bmN0aW9uTmFtZSwgYXJnczogW29yaWdpbmFsLCBtb2RpZmllZCwgdGltZW91dE1zXSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHJlamVjdChlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlV29ya2VyKCk6IFdvcmtlciB7XG5cdFx0aWYgKHRoaXMuX3dvcmtlckZhaWx1cmVzID49IDMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRGlmZiBjb21wdXRlIHdvcmtlciBmYWlsZWQgdG9vIG1hbnkgdGltZXMnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdGNvbnN0IHdvcmtlclBhdGggPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvZGlmZldvcmtlck1haW4uanMnKS5mc1BhdGg7XG5cdFx0XHRjb25zdCB3ID0gbmV3IFdvcmtlcih3b3JrZXJQYXRoLCB7IG5hbWU6ICdEaWZmIGNvbXB1dGUgd29ya2VyJyB9KTtcblx0XHRcdHcub24oJ21lc3NhZ2UnLCAobXNnOiB7IGlkOiBudW1iZXI7IHJlcz86IElEaWZmQ291bnRSZXN1bHQgfCBJRGV0YWlsZWREaWZmUmVzdWx0OyBlcnI/OiB7IG1lc3NhZ2U6IHN0cmluZzsgc3RhY2s/OiBzdHJpbmcgfSB9KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9wZW5kaW5nLmdldChtc2cuaWQpO1xuXHRcdFx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVuZGluZy5kZWxldGUobXNnLmlkKTtcblx0XHRcdFx0aWYgKG1zZy5lcnIpIHtcblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihtc2cuZXJyLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdGlmIChtc2cuZXJyLnN0YWNrKSB7XG5cdFx0XHRcdFx0XHRlcnJvci5zdGFjayA9IG1zZy5lcnIuc3RhY2s7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGhhbmRsZXIucmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoYW5kbGVyLnJlc29sdmUobXNnLnJlcyEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHcub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0RpZmZDb21wdXRlU2VydmljZV0gV29ya2VyIGVycm9yJywgZXJyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbLCBoYW5kbGVyXSBvZiB0aGlzLl9wZW5kaW5nKSB7XG5cdFx0XHRcdFx0aGFuZGxlci5yZWplY3QoZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX3dvcmtlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fd29ya2VyRmFpbHVyZXMrKztcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fd29ya2VyID0gdztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtlcjtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dvcmtlcikge1xuXHRcdFx0dGhpcy5fd29ya2VyLnRlcm1pbmF0ZSgpO1xuXHRcdFx0dGhpcy5fd29ya2VyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFssIGhhbmRsZXJdIG9mIHRoaXMuX3BlbmRpbmcpIHtcblx0XHRcdGhhbmRsZXIucmVqZWN0KG5ldyBFcnJvcignRGlmZkNvbXB1dGVTZXJ2aWNlIGRpc3Bvc2VkJykpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtCQUFxRztBQU92RyxJQUFNLCtCQUFOLGNBQTJDLFdBQTBDO0FBQUEsRUFTM0YsWUFDK0IsYUFDN0I7QUFDRCxVQUFNO0FBRndCO0FBTC9CLFNBQVEsa0JBQWtCO0FBQzFCLFNB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
