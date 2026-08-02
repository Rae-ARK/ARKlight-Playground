import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { McpError } from "./mcpTypes.js";
import { MCP } from "./modelContextProtocol.js";
class McpTaskManager extends Disposable {
  constructor() {
    super(...arguments);
    this._serverTasks = this._register(new DisposableMap());
    this._clientTasks = this._register(new DisposableMap());
    this._onDidUpdateTask = this._register(new Emitter());
    this.onDidUpdateTask = this._onDidUpdateTask.event;
  }
  /**
   * Attach a new handler to this task manager.
   * Updates all client tasks to use the new handler.
   */
  setHandler(handler) {
    for (const task of this._clientTasks.values()) {
      task.setHandler(handler);
    }
  }
  /**
   * Get a client task by ID for status notification handling.
   */
  getClientTask(taskId) {
    return this._clientTasks.get(taskId);
  }
  /**
   * Track a new client task.
   */
  adoptClientTask(task) {
    this._clientTasks.set(task.id, task);
  }
  /**
   * Untracks a client task.
   */
  abandonClientTask(taskId) {
    this._clientTasks.deleteAndDispose(taskId);
  }
  /**
   * Create a new task and execute it asynchronously.
   * Returns the task immediately while execution continues in the background.
   */
  createTask(ttl, executor) {
    const taskId = generateUuid();
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const createdAtTime = Date.now();
    const task = {
      taskId,
      status: "working",
      createdAt,
      ttl,
      lastUpdatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      pollInterval: 1e3
      // Suggest 1 second polling interval
    };
    const store = new DisposableStore();
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    const executionPromise = this._executeTask(taskId, executor, cts.token);
    if (ttl) {
      store.add(disposableTimeout(() => this._serverTasks.deleteAndDispose(taskId), ttl));
    } else {
      executionPromise.finally(() => {
        const timeout = this._register(disposableTimeout(() => {
          this._serverTasks.deleteAndDispose(taskId);
          this._store.delete(timeout);
        }, 6e4));
      });
    }
    this._serverTasks.set(taskId, {
      task,
      cts,
      dispose: () => store.dispose(),
      createdAtTime,
      executionPromise
    });
    return { task };
  }
  /**
   * Execute a task asynchronously and update its state.
   */
  async _executeTask(taskId, executor, token) {
    try {
      const result = await executor(token);
      this._updateTaskStatus(taskId, "completed", void 0, result);
    } catch (error) {
      if (error instanceof CancellationError) {
        this._updateTaskStatus(taskId, "cancelled", "Task was cancelled by the client");
      } else if (error instanceof McpError) {
        this._updateTaskStatus(taskId, "failed", error.message, void 0, {
          code: error.code,
          message: error.message,
          data: error.data
        });
      } else if (error instanceof Error) {
        this._updateTaskStatus(taskId, "failed", error.message, void 0, {
          code: MCP.INTERNAL_ERROR,
          message: error.message
        });
      } else {
        this._updateTaskStatus(taskId, "failed", "Unknown error", void 0, {
          code: MCP.INTERNAL_ERROR,
          message: "Unknown error"
        });
      }
    }
  }
  /**
   * Update task status and optionally store result or error.
   */
  _updateTaskStatus(taskId, status, statusMessage, result, error) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      return;
    }
    entry.task.status = status;
    entry.task.lastUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
    if (statusMessage !== void 0) {
      entry.task.statusMessage = statusMessage;
    }
    if (result !== void 0) {
      entry.result = result;
    }
    if (error !== void 0) {
      entry.error = error;
    }
    this._onDidUpdateTask.fire({ ...entry.task });
  }
  /**
   * Get the current state of a task.
   * Returns an error if the task doesn't exist or has expired.
   */
  getTask(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    return { ...entry.task };
  }
  /**
   * Get the result of a completed task.
   * Blocks until the task completes if it's still in progress.
   */
  async getTaskResult(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (entry.task.status === "working" || entry.task.status === "input_required") {
      await entry.executionPromise;
    }
    const updatedEntry = this._serverTasks.get(taskId);
    if (!updatedEntry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (updatedEntry.error) {
      throw new McpError(updatedEntry.error.code, updatedEntry.error.message, updatedEntry.error.data);
    }
    if (!updatedEntry.result) {
      throw new McpError(MCP.INTERNAL_ERROR, "Task completed but no result available");
    }
    return updatedEntry.result;
  }
  /**
   * Cancel a task.
   */
  cancelTask(taskId) {
    const entry = this._serverTasks.get(taskId);
    if (!entry) {
      throw new McpError(MCP.INVALID_PARAMS, `Task not found: ${taskId}`);
    }
    if (entry.task.status === "completed" || entry.task.status === "failed" || entry.task.status === "cancelled") {
      throw new McpError(MCP.INVALID_PARAMS, `Cannot cancel task in ${entry.task.status} status`);
    }
    entry.task.status = "cancelled";
    entry.task.statusMessage = "Task was cancelled by the client";
    entry.cts.cancel();
    return { ...entry.task };
  }
  /**
   * List all tasks.
   */
  listTasks() {
    const tasks = [];
    for (const entry of this._serverTasks.values()) {
      tasks.push({ ...entry.task });
    }
    return { tasks };
  }
}
export {
  McpTaskManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwVGFza01hbmFnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4vbWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgTWNwRXJyb3IgfSBmcm9tICcuL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IE1DUCB9IGZyb20gJy4vbW9kZWxDb250ZXh0UHJvdG9jb2wuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNY3BUYXNrSW50ZXJuYWwgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdG9uRGlkVXBkYXRlU3RhdGUodGFzazogTUNQLlRhc2spOiB2b2lkO1xuXHRzZXRIYW5kbGVyKGhhbmRsZXI6IE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIHwgdW5kZWZpbmVkKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIFRhc2tFbnRyeSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0dGFzazogTUNQLlRhc2s7XG5cdHJlc3VsdD86IE1DUC5SZXN1bHQ7XG5cdGVycm9yPzogTUNQLkVycm9yO1xuXHRjdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlO1xuXHQvKiogVGltZSB3aGVuIHRoZSB0YXNrIHdhcyBjcmVhdGVkIChjbGllbnQgdGltZSksIHVzZWQgdG8gY2FsY3VsYXRlIFRUTCBleHBpcmF0aW9uICovXG5cdGNyZWF0ZWRBdFRpbWU6IG51bWJlcjtcblx0LyoqIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSB0YXNrIGV4ZWN1dGlvbiBjb21wbGV0ZXMgKi9cblx0ZXhlY3V0aW9uUHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIGluLW1lbW9yeSB0YXNrIHN0YXRlIGZvciBzZXJ2ZXItc2lkZSBNQ1AgdGFza3MgKHNhbXBsaW5nIGFuZCBlbGljaXRhdGlvbikuXG4gKiBBbHNvIHRyYWNrcyBjbGllbnQtc2lkZSB0YXNrcyB0byBzdXJ2aXZlIGhhbmRsZXIgcmVjb25uZWN0aW9ucy5cbiAqIExpZmVjeWNsZSBpcyB0aWVkIHRvIHRoZSBNY3BTZXJ2ZXIgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BUYXNrTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJUYXNrcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgVGFza0VudHJ5PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50VGFza3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElNY3BUYXNrSW50ZXJuYWw+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVRhc2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNQ1AuVGFzaz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFVwZGF0ZVRhc2sgPSB0aGlzLl9vbkRpZFVwZGF0ZVRhc2suZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEF0dGFjaCBhIG5ldyBoYW5kbGVyIHRvIHRoaXMgdGFzayBtYW5hZ2VyLlxuXHQgKiBVcGRhdGVzIGFsbCBjbGllbnQgdGFza3MgdG8gdXNlIHRoZSBuZXcgaGFuZGxlci5cblx0ICovXG5cdHNldEhhbmRsZXIoaGFuZGxlcjogTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5fY2xpZW50VGFza3MudmFsdWVzKCkpIHtcblx0XHRcdHRhc2suc2V0SGFuZGxlcihoYW5kbGVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgY2xpZW50IHRhc2sgYnkgSUQgZm9yIHN0YXR1cyBub3RpZmljYXRpb24gaGFuZGxpbmcuXG5cdCAqL1xuXHRnZXRDbGllbnRUYXNrKHRhc2tJZDogc3RyaW5nKTogSU1jcFRhc2tJbnRlcm5hbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NsaWVudFRhc2tzLmdldCh0YXNrSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYWNrIGEgbmV3IGNsaWVudCB0YXNrLlxuXHQgKi9cblx0YWRvcHRDbGllbnRUYXNrKHRhc2s6IElNY3BUYXNrSW50ZXJuYWwpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGllbnRUYXNrcy5zZXQodGFzay5pZCwgdGFzayk7XG5cdH1cblxuXHQvKipcblx0ICogVW50cmFja3MgYSBjbGllbnQgdGFzay5cblx0ICovXG5cdGFiYW5kb25DbGllbnRUYXNrKHRhc2tJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xpZW50VGFza3MuZGVsZXRlQW5kRGlzcG9zZSh0YXNrSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyB0YXNrIGFuZCBleGVjdXRlIGl0IGFzeW5jaHJvbm91c2x5LlxuXHQgKiBSZXR1cm5zIHRoZSB0YXNrIGltbWVkaWF0ZWx5IHdoaWxlIGV4ZWN1dGlvbiBjb250aW51ZXMgaW4gdGhlIGJhY2tncm91bmQuXG5cdCAqL1xuXHRwdWJsaWMgY3JlYXRlVGFzazxUUmVzdWx0IGV4dGVuZHMgTUNQLlJlc3VsdD4oXG5cdFx0dHRsOiBudW1iZXIgfCBudWxsLFxuXHRcdGV4ZWN1dG9yOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPFRSZXN1bHQ+XG5cdCk6IE1DUC5DcmVhdGVUYXNrUmVzdWx0IHtcblx0XHRjb25zdCB0YXNrSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjcmVhdGVkQXQgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgY3JlYXRlZEF0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHRjb25zdCB0YXNrOiBNQ1AuVGFzayA9IHtcblx0XHRcdHRhc2tJZCxcblx0XHRcdHN0YXR1czogJ3dvcmtpbmcnLFxuXHRcdFx0Y3JlYXRlZEF0LFxuXHRcdFx0dHRsLFxuXHRcdFx0bGFzdFVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cG9sbEludGVydmFsOiAxMDAwLCAvLyBTdWdnZXN0IDEgc2Vjb25kIHBvbGxpbmcgaW50ZXJ2YWxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0Y29uc3QgZXhlY3V0aW9uUHJvbWlzZSA9IHRoaXMuX2V4ZWN1dGVUYXNrKHRhc2tJZCwgZXhlY3V0b3IsIGN0cy50b2tlbik7XG5cblx0XHQvLyBEZWxldGUgdGhlIHRhc2sgYWZ0ZXIgaXRzIFRUTC4gT3IsIGlmIG5vIFRUTCBpcyBnaXZlbiwgZGVsZXRlIGl0IHNob3J0bHkgYWZ0ZXIgdGhlIHRhc2sgY29tcGxldGVzLlxuXHRcdGlmICh0dGwpIHtcblx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB0aGlzLl9zZXJ2ZXJUYXNrcy5kZWxldGVBbmREaXNwb3NlKHRhc2tJZCksIHR0bCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleGVjdXRpb25Qcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0aW1lb3V0ID0gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3NlcnZlclRhc2tzLmRlbGV0ZUFuZERpc3Bvc2UodGFza0lkKTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUodGltZW91dCk7XG5cdFx0XHRcdH0sIDYwXzAwMCkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VydmVyVGFza3Muc2V0KHRhc2tJZCwge1xuXHRcdFx0dGFzayxcblx0XHRcdGN0cyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0XHRcdGNyZWF0ZWRBdFRpbWUsXG5cdFx0XHRleGVjdXRpb25Qcm9taXNlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgdGFzayB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGUgYSB0YXNrIGFzeW5jaHJvbm91c2x5IGFuZCB1cGRhdGUgaXRzIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZVRhc2s8VFJlc3VsdCBleHRlbmRzIE1DUC5SZXN1bHQ+KFxuXHRcdHRhc2tJZDogc3RyaW5nLFxuXHRcdGV4ZWN1dG9yOiAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPFRSZXN1bHQ+LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZXhlY3V0b3IodG9rZW4pO1xuXHRcdFx0dGhpcy5fdXBkYXRlVGFza1N0YXR1cyh0YXNrSWQsICdjb21wbGV0ZWQnLCB1bmRlZmluZWQsIHJlc3VsdCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRhc2tTdGF0dXModGFza0lkLCAnY2FuY2VsbGVkJywgJ1Rhc2sgd2FzIGNhbmNlbGxlZCBieSB0aGUgY2xpZW50Jyk7XG5cdFx0XHR9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgTWNwRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFza1N0YXR1cyh0YXNrSWQsICdmYWlsZWQnLCBlcnJvci5tZXNzYWdlLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRjb2RlOiBlcnJvci5jb2RlLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0ZGF0YTogZXJyb3IuZGF0YSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlVGFza1N0YXR1cyh0YXNrSWQsICdmYWlsZWQnLCBlcnJvci5tZXNzYWdlLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRjb2RlOiBNQ1AuSU5URVJOQUxfRVJST1IsXG5cdFx0XHRcdFx0bWVzc2FnZTogZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUYXNrU3RhdHVzKHRhc2tJZCwgJ2ZhaWxlZCcsICdVbmtub3duIGVycm9yJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0Y29kZTogTUNQLklOVEVSTkFMX0VSUk9SLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdVbmtub3duIGVycm9yJyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0YXNrIHN0YXR1cyBhbmQgb3B0aW9uYWxseSBzdG9yZSByZXN1bHQgb3IgZXJyb3IuXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVUYXNrU3RhdHVzKFxuXHRcdHRhc2tJZDogc3RyaW5nLFxuXHRcdHN0YXR1czogTUNQLlRhc2tTdGF0dXMsXG5cdFx0c3RhdHVzTWVzc2FnZT86IHN0cmluZyxcblx0XHRyZXN1bHQ/OiBNQ1AuUmVzdWx0LFxuXHRcdGVycm9yPzogTUNQLkVycm9yXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2VydmVyVGFza3MuZ2V0KHRhc2tJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVudHJ5LnRhc2suc3RhdHVzID0gc3RhdHVzO1xuXHRcdGVudHJ5LnRhc2subGFzdFVwZGF0ZWRBdCA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblxuXHRcdGlmIChzdGF0dXNNZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVudHJ5LnRhc2suc3RhdHVzTWVzc2FnZSA9IHN0YXR1c01lc3NhZ2U7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkucmVzdWx0ID0gcmVzdWx0O1xuXHRcdH1cblx0XHRpZiAoZXJyb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZW50cnkuZXJyb3IgPSBlcnJvcjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZFVwZGF0ZVRhc2suZmlyZSh7IC4uLmVudHJ5LnRhc2sgfSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IHN0YXRlIG9mIGEgdGFzay5cblx0ICogUmV0dXJucyBhbiBlcnJvciBpZiB0aGUgdGFzayBkb2Vzbid0IGV4aXN0IG9yIGhhcyBleHBpcmVkLlxuXHQgKi9cblx0cHVibGljIGdldFRhc2sodGFza0lkOiBzdHJpbmcpOiBNQ1AuR2V0VGFza1Jlc3VsdCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXJ2ZXJUYXNrcy5nZXQodGFza0lkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgTWNwRXJyb3IoTUNQLklOVkFMSURfUEFSQU1TLCBgVGFzayBub3QgZm91bmQ6ICR7dGFza0lkfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IC4uLmVudHJ5LnRhc2sgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIHJlc3VsdCBvZiBhIGNvbXBsZXRlZCB0YXNrLlxuXHQgKiBCbG9ja3MgdW50aWwgdGhlIHRhc2sgY29tcGxldGVzIGlmIGl0J3Mgc3RpbGwgaW4gcHJvZ3Jlc3MuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0VGFza1Jlc3VsdCh0YXNrSWQ6IHN0cmluZyk6IFByb21pc2U8TUNQLkdldFRhc2tQYXlsb2FkUmVzdWx0PiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXJ2ZXJUYXNrcy5nZXQodGFza0lkKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgTWNwRXJyb3IoTUNQLklOVkFMSURfUEFSQU1TLCBgVGFzayBub3QgZm91bmQ6ICR7dGFza0lkfWApO1xuXHRcdH1cblxuXHRcdGlmIChlbnRyeS50YXNrLnN0YXR1cyA9PT0gJ3dvcmtpbmcnIHx8IGVudHJ5LnRhc2suc3RhdHVzID09PSAnaW5wdXRfcmVxdWlyZWQnKSB7XG5cdFx0XHRhd2FpdCBlbnRyeS5leGVjdXRpb25Qcm9taXNlO1xuXHRcdH1cblxuXHRcdC8vIFJlZnJlc2ggZW50cnkgYWZ0ZXIgd2FpdGluZ1xuXHRcdGNvbnN0IHVwZGF0ZWRFbnRyeSA9IHRoaXMuX3NlcnZlclRhc2tzLmdldCh0YXNrSWQpO1xuXHRcdGlmICghdXBkYXRlZEVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgTWNwRXJyb3IoTUNQLklOVkFMSURfUEFSQU1TLCBgVGFzayBub3QgZm91bmQ6ICR7dGFza0lkfWApO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVkRW50cnkuZXJyb3IpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcih1cGRhdGVkRW50cnkuZXJyb3IuY29kZSwgdXBkYXRlZEVudHJ5LmVycm9yLm1lc3NhZ2UsIHVwZGF0ZWRFbnRyeS5lcnJvci5kYXRhKTtcblx0XHR9XG5cblx0XHRpZiAoIXVwZGF0ZWRFbnRyeS5yZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5URVJOQUxfRVJST1IsICdUYXNrIGNvbXBsZXRlZCBidXQgbm8gcmVzdWx0IGF2YWlsYWJsZScpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1cGRhdGVkRW50cnkucmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCBhIHRhc2suXG5cdCAqL1xuXHRwdWJsaWMgY2FuY2VsVGFzayh0YXNrSWQ6IHN0cmluZyk6IE1DUC5DYW5jZWxUYXNrUmVzdWx0IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3NlcnZlclRhc2tzLmdldCh0YXNrSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5WQUxJRF9QQVJBTVMsIGBUYXNrIG5vdCBmb3VuZDogJHt0YXNrSWR9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYWxyZWFkeSBpbiB0ZXJtaW5hbCBzdGF0dXNcblx0XHRpZiAoZW50cnkudGFzay5zdGF0dXMgPT09ICdjb21wbGV0ZWQnIHx8IGVudHJ5LnRhc2suc3RhdHVzID09PSAnZmFpbGVkJyB8fCBlbnRyeS50YXNrLnN0YXR1cyA9PT0gJ2NhbmNlbGxlZCcpIHtcblx0XHRcdHRocm93IG5ldyBNY3BFcnJvcihNQ1AuSU5WQUxJRF9QQVJBTVMsIGBDYW5ub3QgY2FuY2VsIHRhc2sgaW4gJHtlbnRyeS50YXNrLnN0YXR1c30gc3RhdHVzYCk7XG5cdFx0fVxuXG5cdFx0ZW50cnkudGFzay5zdGF0dXMgPSAnY2FuY2VsbGVkJztcblx0XHRlbnRyeS50YXNrLnN0YXR1c01lc3NhZ2UgPSAnVGFzayB3YXMgY2FuY2VsbGVkIGJ5IHRoZSBjbGllbnQnO1xuXHRcdGVudHJ5LmN0cy5jYW5jZWwoKTtcblxuXHRcdHJldHVybiB7IC4uLmVudHJ5LnRhc2sgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaXN0IGFsbCB0YXNrcy5cblx0ICovXG5cdHB1YmxpYyBsaXN0VGFza3MoKTogTUNQLkxpc3RUYXNrc1Jlc3VsdCB7XG5cdFx0Y29uc3QgdGFza3M6IE1DUC5UYXNrW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fc2VydmVyVGFza3MudmFsdWVzKCkpIHtcblx0XHRcdHRhc2tzLnB1c2goeyAuLi5lbnRyeS50YXNrIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHRhc2tzIH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTRC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
