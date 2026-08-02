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
import { parse } from "../../../base/common/path.js";
import { debounce, throttle } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { listProcesses } from "../../../base/node/ps.js";
import { ILogService } from "../../log/common/log.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["InactiveThrottleDuration"] = 5e3] = "InactiveThrottleDuration";
  Constants2[Constants2["ActiveDebounceDuration"] = 1e3] = "ActiveDebounceDuration";
  return Constants2;
})(Constants || {});
const ignoreProcessNames = [];
let ChildProcessMonitor = class extends Disposable {
  constructor(_pid, _logService) {
    super();
    this._pid = _pid;
    this._logService = _logService;
    this._hasChildProcesses = false;
    this._onDidChangeHasChildProcesses = this._register(new Emitter());
    /**
     * An event that fires when whether the process has child processes changes.
     */
    this.onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
  }
  set hasChildProcesses(value) {
    if (this._hasChildProcesses !== value) {
      this._hasChildProcesses = value;
      this._logService.debug("ChildProcessMonitor: Has child processes changed", value);
      this._onDidChangeHasChildProcesses.fire(value);
    }
  }
  /**
   * Whether the process has child processes.
   */
  get hasChildProcesses() {
    return this._hasChildProcesses;
  }
  /**
   * Updates the pid to monitor. This is needed when the pid is not available
   * immediately after spawn (e.g. node-pty deferred conpty connection).
   */
  setPid(pid) {
    this._pid = pid;
  }
  /**
   * Input was triggered on the process.
   */
  handleInput() {
    this._refreshActive();
  }
  /**
   * Output was triggered on the process.
   */
  handleOutput() {
    this._refreshInactive();
  }
  async _refreshActive() {
    if (this._store.isDisposed) {
      return;
    }
    try {
      const processItem = await listProcesses(this._pid);
      this.hasChildProcesses = this._processContainsChildren(processItem);
    } catch (e) {
      this._logService.debug("ChildProcessMonitor: Fetching process tree failed", e);
    }
  }
  _refreshInactive() {
    this._refreshActive();
  }
  _processContainsChildren(processItem) {
    if (!processItem.children) {
      return false;
    }
    if (processItem.children.length === 1) {
      const item = processItem.children[0];
      let cmd;
      if (item.cmd.startsWith(`"`)) {
        cmd = item.cmd.substring(1, item.cmd.indexOf(`"`, 1));
      } else {
        const spaceIndex = item.cmd.indexOf(` `);
        if (spaceIndex === -1) {
          cmd = item.cmd;
        } else {
          cmd = item.cmd.substring(0, spaceIndex);
        }
      }
      return ignoreProcessNames.indexOf(parse(cmd).name) === -1;
    }
    return processItem.children.length > 0;
  }
};
__decorateClass([
  debounce(1e3 /* ActiveDebounceDuration */)
], ChildProcessMonitor.prototype, "_refreshActive", 1);
__decorateClass([
  throttle(5e3 /* InactiveThrottleDuration */)
], ChildProcessMonitor.prototype, "_refreshInactive", 1);
ChildProcessMonitor = __decorateClass([
  __decorateParam(1, ILogService)
], ChildProcessMonitor);
export {
  ChildProcessMonitor,
  ignoreProcessNames
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvY2hpbGRQcm9jZXNzTW9uaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBkZWJvdW5jZSwgdGhyb3R0bGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFByb2Nlc3NJdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzc2VzLmpzJztcbmltcG9ydCB7IGxpc3RQcm9jZXNzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2YgdGltZSB0byB0aHJvdHRsZSBjaGVja3Mgd2hlbiB0aGUgcHJvY2VzcyByZWNlaXZlcyBvdXRwdXQuXG5cdCAqL1xuXHRJbmFjdGl2ZVRocm90dGxlRHVyYXRpb24gPSA1MDAwLFxuXHQvKipcblx0ICogVGhlIGFtb3VudCBvZiB0aW1lIHRvIGRlYm91bmNlIGNoZWNrIHdoZW4gdGhlIHByb2Nlc3MgcmVjZWl2ZXMgaW5wdXQuXG5cdCAqL1xuXHRBY3RpdmVEZWJvdW5jZUR1cmF0aW9uID0gMTAwMCxcbn1cblxuZXhwb3J0IGNvbnN0IGlnbm9yZVByb2Nlc3NOYW1lczogc3RyaW5nW10gPSBbXTtcblxuLyoqXG4gKiBNb25pdG9ycyBhIHByb2Nlc3MgZm9yIGNoaWxkIHByb2Nlc3NlcywgY2hlY2tpbmcgYXQgZGlmZmVyaW5nIHRpbWVzIGRlcGVuZGluZyBvbiBpbnB1dCBhbmQgb3V0cHV0XG4gKiBjYWxscyBpbnRvIHRoZSBtb25pdG9yLlxuICovXG5leHBvcnQgY2xhc3MgQ2hpbGRQcm9jZXNzTW9uaXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9oYXNDaGlsZFByb2Nlc3NlczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHNldCBoYXNDaGlsZFByb2Nlc3Nlcyh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9oYXNDaGlsZFByb2Nlc3NlcyAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX2hhc0NoaWxkUHJvY2Vzc2VzID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDaGlsZFByb2Nlc3NNb25pdG9yOiBIYXMgY2hpbGQgcHJvY2Vzc2VzIGNoYW5nZWQnLCB2YWx1ZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzLmZpcmUodmFsdWUpO1xuXHRcdH1cblx0fVxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcHJvY2VzcyBoYXMgY2hpbGQgcHJvY2Vzc2VzLlxuXHQgKi9cblx0Z2V0IGhhc0NoaWxkUHJvY2Vzc2VzKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzQ2hpbGRQcm9jZXNzZXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGZpcmVzIHdoZW4gd2hldGhlciB0aGUgcHJvY2VzcyBoYXMgY2hpbGQgcHJvY2Vzc2VzIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzID0gdGhpcy5fb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcy5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9waWQ6IG51bWJlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBwaWQgdG8gbW9uaXRvci4gVGhpcyBpcyBuZWVkZWQgd2hlbiB0aGUgcGlkIGlzIG5vdCBhdmFpbGFibGVcblx0ICogaW1tZWRpYXRlbHkgYWZ0ZXIgc3Bhd24gKGUuZy4gbm9kZS1wdHkgZGVmZXJyZWQgY29ucHR5IGNvbm5lY3Rpb24pLlxuXHQgKi9cblx0c2V0UGlkKHBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcGlkID0gcGlkO1xuXHR9XG5cblx0LyoqXG5cdCAqIElucHV0IHdhcyB0cmlnZ2VyZWQgb24gdGhlIHByb2Nlc3MuXG5cdCAqL1xuXHRoYW5kbGVJbnB1dCgpIHtcblx0XHR0aGlzLl9yZWZyZXNoQWN0aXZlKCk7XG5cdH1cblxuXHQvKipcblx0ICogT3V0cHV0IHdhcyB0cmlnZ2VyZWQgb24gdGhlIHByb2Nlc3MuXG5cdCAqL1xuXHRoYW5kbGVPdXRwdXQoKSB7XG5cdFx0dGhpcy5fcmVmcmVzaEluYWN0aXZlKCk7XG5cdH1cblxuXHRAZGVib3VuY2UoQ29uc3RhbnRzLkFjdGl2ZURlYm91bmNlRHVyYXRpb24pXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hBY3RpdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb2Nlc3NJdGVtID0gYXdhaXQgbGlzdFByb2Nlc3Nlcyh0aGlzLl9waWQpO1xuXHRcdFx0dGhpcy5oYXNDaGlsZFByb2Nlc3NlcyA9IHRoaXMuX3Byb2Nlc3NDb250YWluc0NoaWxkcmVuKHByb2Nlc3NJdGVtKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDaGlsZFByb2Nlc3NNb25pdG9yOiBGZXRjaGluZyBwcm9jZXNzIHRyZWUgZmFpbGVkJywgZSk7XG5cdFx0fVxuXHR9XG5cblx0QHRocm90dGxlKENvbnN0YW50cy5JbmFjdGl2ZVRocm90dGxlRHVyYXRpb24pXG5cdHByaXZhdGUgX3JlZnJlc2hJbmFjdGl2ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZyZXNoQWN0aXZlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9jZXNzQ29udGFpbnNDaGlsZHJlbihwcm9jZXNzSXRlbTogUHJvY2Vzc0l0ZW0pOiBib29sZWFuIHtcblx0XHQvLyBObyBjaGlsZCBwcm9jZXNzZXNcblx0XHRpZiAoIXByb2Nlc3NJdGVtLmNoaWxkcmVuKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQSBzaW5nbGUgY2hpbGQgcHJvY2VzcywgaGFuZGxlIHNwZWNpYWwgY2FzZXNcblx0XHRpZiAocHJvY2Vzc0l0ZW0uY2hpbGRyZW4ubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gcHJvY2Vzc0l0ZW0uY2hpbGRyZW5bMF07XG5cdFx0XHRsZXQgY21kOiBzdHJpbmc7XG5cdFx0XHRpZiAoaXRlbS5jbWQuc3RhcnRzV2l0aChgXCJgKSkge1xuXHRcdFx0XHRjbWQgPSBpdGVtLmNtZC5zdWJzdHJpbmcoMSwgaXRlbS5jbWQuaW5kZXhPZihgXCJgLCAxKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzcGFjZUluZGV4ID0gaXRlbS5jbWQuaW5kZXhPZihgIGApO1xuXHRcdFx0XHRpZiAoc3BhY2VJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRjbWQgPSBpdGVtLmNtZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbWQgPSBpdGVtLmNtZC5zdWJzdHJpbmcoMCwgc3BhY2VJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBpZ25vcmVQcm9jZXNzTmFtZXMuaW5kZXhPZihwYXJzZShjbWQpLm5hbWUpID09PSAtMTtcblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjaywgY291bnQgY2hpbGQgcHJvY2Vzc2VzXG5cdFx0cmV0dXJuIHByb2Nlc3NJdGVtLmNoaWxkcmVuLmxlbmd0aCA+IDA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBRTVCLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUlDLEVBQUFBLHNCQUFBLDhCQUEyQixPQUEzQjtBQUlBLEVBQUFBLHNCQUFBLDRCQUF5QixPQUF6QjtBQVJVLFNBQUFBO0FBQUEsR0FBQTtBQVdKLE1BQU0scUJBQStCLENBQUM7QUFNdEMsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFvQm5ELFlBQ1MsTUFDc0IsYUFDN0I7QUFDRCxVQUFNO0FBSEU7QUFDc0I7QUFyQi9CLFNBQVEscUJBQThCO0FBYXRDLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUFpQixDQUFDO0FBSXRGO0FBQUE7QUFBQTtBQUFBLFNBQVMsK0JBQStCLEtBQUssOEJBQThCO0FBQUEsRUFPM0U7QUFBQSxFQXZCQSxJQUFZLGtCQUFrQixPQUFnQjtBQUM3QyxRQUFJLEtBQUssdUJBQXVCLE9BQU87QUFDdEMsV0FBSyxxQkFBcUI7QUFDMUIsV0FBSyxZQUFZLE1BQU0sb0RBQW9ELEtBQUs7QUFDaEYsV0FBSyw4QkFBOEIsS0FBSyxLQUFLO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFJQSxJQUFJLG9CQUE2QjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQW9CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQW1CbkUsT0FBTyxLQUFtQjtBQUN6QixTQUFLLE9BQU87QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxjQUFjO0FBQ2IsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGVBQWU7QUFDZCxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFHQSxNQUFjLGlCQUFnQztBQUM3QyxRQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxZQUFNLGNBQWMsTUFBTSxjQUFjLEtBQUssSUFBSTtBQUNqRCxXQUFLLG9CQUFvQixLQUFLLHlCQUF5QixXQUFXO0FBQUEsSUFDbkUsU0FBUyxHQUFHO0FBQ1gsV0FBSyxZQUFZLE1BQU0scURBQXFELENBQUM7QUFBQSxJQUM5RTtBQUFBLEVBQ0Q7QUFBQSxFQUdRLG1CQUF5QjtBQUNoQyxTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRVEseUJBQXlCLGFBQW1DO0FBRW5FLFFBQUksQ0FBQyxZQUFZLFVBQVU7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFHQSxRQUFJLFlBQVksU0FBUyxXQUFXLEdBQUc7QUFDdEMsWUFBTSxPQUFPLFlBQVksU0FBUyxDQUFDO0FBQ25DLFVBQUk7QUFDSixVQUFJLEtBQUssSUFBSSxXQUFXLEdBQUcsR0FBRztBQUM3QixjQUFNLEtBQUssSUFBSSxVQUFVLEdBQUcsS0FBSyxJQUFJLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUNyRCxPQUFPO0FBQ04sY0FBTSxhQUFhLEtBQUssSUFBSSxRQUFRLEdBQUc7QUFDdkMsWUFBSSxlQUFlLElBQUk7QUFDdEIsZ0JBQU0sS0FBSztBQUFBLFFBQ1osT0FBTztBQUNOLGdCQUFNLEtBQUssSUFBSSxVQUFVLEdBQUcsVUFBVTtBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUNBLGFBQU8sbUJBQW1CLFFBQVEsTUFBTSxHQUFHLEVBQUUsSUFBSSxNQUFNO0FBQUEsSUFDeEQ7QUFHQSxXQUFPLFlBQVksU0FBUyxTQUFTO0FBQUEsRUFDdEM7QUFDRDtBQTNDZTtBQUFBLEVBRGIsU0FBUyxnQ0FBZ0M7QUFBQSxHQWpEOUIsb0JBa0RFO0FBYU47QUFBQSxFQURQLFNBQVMsa0NBQWtDO0FBQUEsR0E5RGhDLG9CQStESjtBQS9ESSxzQkFBTjtBQUFBLEVBc0JKO0FBQUEsR0F0QlU7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyJdCn0K
