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
import { handleVetos } from "../../../../platform/lifecycle/common/lifecycle.js";
import { ILifecycleService, WillShutdownJoinerOrder } from "../common/lifecycle.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ipcRenderer } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractLifecycleService } from "../common/lifecycleService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Promises, disposableTimeout, raceCancellation } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
let NativeLifecycleService = class extends AbstractLifecycleService {
  constructor(nativeHostService, storageService, logService) {
    super(logService, storageService);
    this.nativeHostService = nativeHostService;
    this.registerListeners();
  }
  registerListeners() {
    const windowId = this.nativeHostService.windowId;
    ipcRenderer.on("vscode:onBeforeUnload", async (event, ...args) => {
      const reply = args[0];
      this.logService.trace(`[lifecycle] onBeforeUnload (reason: ${reply.reason})`);
      const veto = await this.handleBeforeShutdown(reply.reason);
      if (veto) {
        this.logService.trace("[lifecycle] onBeforeUnload prevented via veto");
        this._onShutdownVeto.fire();
        ipcRenderer.send(reply.cancelChannel, windowId);
      } else {
        this.logService.trace("[lifecycle] onBeforeUnload continues without veto");
        this.shutdownReason = reply.reason;
        ipcRenderer.send(reply.okChannel, windowId);
      }
    });
    ipcRenderer.on("vscode:onWillUnload", async (event, ...args) => {
      const reply = args[0];
      this.logService.trace(`[lifecycle] onWillUnload (reason: ${reply.reason})`);
      await this.handleWillShutdown(reply.reason);
      this._onDidShutdown.fire();
      ipcRenderer.send(reply.replyChannel, windowId);
    });
  }
  async handleBeforeShutdown(reason) {
    const logService = this.logService;
    const vetos = [];
    const pendingVetos = /* @__PURE__ */ new Set();
    let finalVeto = void 0;
    let finalVetoId = void 0;
    this._onBeforeShutdown.fire({
      reason,
      veto(value, id) {
        vetos.push(value);
        if (value === true) {
          logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
        } else if (value instanceof Promise) {
          pendingVetos.add(id);
          value.then((veto) => {
            if (veto === true) {
              logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
            }
          }).finally(() => pendingVetos.delete(id));
        }
      },
      finalVeto(value, id) {
        if (!finalVeto) {
          finalVeto = value;
          finalVetoId = id;
        } else {
          throw new Error(`[lifecycle]: Final veto is already defined (id: ${id})`);
        }
      }
    });
    const longRunningBeforeShutdownWarning = disposableTimeout(() => {
      logService.warn(`[lifecycle] onBeforeShutdown is taking a long time, pending operations: ${Array.from(pendingVetos).join(", ")}`);
    }, NativeLifecycleService.BEFORE_SHUTDOWN_WARNING_DELAY);
    try {
      let veto = await handleVetos(vetos, (error) => this.handleBeforeShutdownError(error, reason));
      if (veto) {
        return veto;
      }
      if (finalVeto) {
        try {
          pendingVetos.add(finalVetoId);
          veto = await finalVeto();
          if (veto) {
            logService.info(`[lifecycle]: Shutdown was prevented by final veto (id: ${finalVetoId})`);
          }
        } catch (error) {
          veto = true;
          this.handleBeforeShutdownError(error, reason);
        }
      }
      return veto;
    } finally {
      longRunningBeforeShutdownWarning.dispose();
    }
  }
  handleBeforeShutdownError(error, reason) {
    this.logService.error(`[lifecycle]: Error during before-shutdown phase (error: ${toErrorMessage(error)})`);
    this._onBeforeShutdownError.fire({ reason, error });
  }
  async handleWillShutdown(reason) {
    this._willShutdown = true;
    const joiners = [];
    const lastJoiners = [];
    const pendingJoiners = /* @__PURE__ */ new Set();
    const cts = new CancellationTokenSource();
    this._onWillShutdown.fire({
      reason,
      token: cts.token,
      joiners: () => Array.from(pendingJoiners.values()),
      join(promiseOrPromiseFn, joiner) {
        pendingJoiners.add(joiner);
        if (joiner.order === WillShutdownJoinerOrder.Last) {
          const promiseFn = typeof promiseOrPromiseFn === "function" ? promiseOrPromiseFn : () => promiseOrPromiseFn;
          lastJoiners.push(() => promiseFn().finally(() => pendingJoiners.delete(joiner)));
        } else {
          const promise = typeof promiseOrPromiseFn === "function" ? promiseOrPromiseFn() : promiseOrPromiseFn;
          promise.finally(() => pendingJoiners.delete(joiner));
          joiners.push(promise);
        }
      },
      force: () => {
        cts.dispose(true);
      }
    });
    const longRunningWillShutdownWarning = disposableTimeout(() => {
      this.logService.warn(`[lifecycle] onWillShutdown is taking a long time, pending operations: ${Array.from(pendingJoiners).map((joiner) => joiner.id).join(", ")}`);
    }, NativeLifecycleService.WILL_SHUTDOWN_WARNING_DELAY);
    try {
      await raceCancellation(Promises.settled(joiners), cts.token);
    } catch (error) {
      this.logService.error(`[lifecycle]: Error during will-shutdown phase in default joiners (error: ${toErrorMessage(error)})`);
    }
    try {
      await raceCancellation(Promises.settled(lastJoiners.map((lastJoiner) => lastJoiner())), cts.token);
    } catch (error) {
      this.logService.error(`[lifecycle]: Error during will-shutdown phase in last joiners (error: ${toErrorMessage(error)})`);
    }
    longRunningWillShutdownWarning.dispose();
  }
  shutdown() {
    return this.nativeHostService.closeWindow();
  }
};
NativeLifecycleService.BEFORE_SHUTDOWN_WARNING_DELAY = 5e3;
NativeLifecycleService.WILL_SHUTDOWN_WARNING_DELAY = 800;
NativeLifecycleService = __decorateClass([
  __decorateParam(0, INativeHostService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILogService)
], NativeLifecycleService);
registerSingleton(ILifecycleService, NativeLifecycleService, InstantiationType.Eager);
export {
  NativeLifecycleService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9saWZlY3ljbGUvZWxlY3Ryb24tYnJvd3Nlci9saWZlY3ljbGVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaGFuZGxlVmV0b3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTaHV0ZG93blJlYXNvbiwgSUxpZmVjeWNsZVNlcnZpY2UsIElXaWxsU2h1dGRvd25FdmVudEpvaW5lciwgV2lsbFNodXRkb3duSm9pbmVyT3JkZXIgfSBmcm9tICcuLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgaXBjUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvZWxlY3Ryb24tYnJvd3Nlci9nbG9iYWxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2xpZmVjeWNsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgZGlzcG9zYWJsZVRpbWVvdXQsIHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVMaWZlY3ljbGVTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RMaWZlY3ljbGVTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBCRUZPUkVfU0hVVERPV05fV0FSTklOR19ERUxBWSA9IDUwMDA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFdJTExfU0hVVERPV05fV0FSTklOR19ERUxBWSA9IDgwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2luZG93SWQgPSB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd0lkO1xuXG5cdFx0Ly8gTWFpbiBzaWRlIGluZGljYXRlcyB0aGF0IHdpbmRvdyBpcyBhYm91dCB0byB1bmxvYWQsIGNoZWNrIGZvciB2ZXRvc1xuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6b25CZWZvcmVVbmxvYWQnLCBhc3luYyAoZXZlbnQ6IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwbHkgPSBhcmdzWzBdIGFzIHsgb2tDaGFubmVsOiBzdHJpbmc7IGNhbmNlbENoYW5uZWw6IHN0cmluZzsgcmVhc29uOiBTaHV0ZG93blJlYXNvbiB9O1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbbGlmZWN5Y2xlXSBvbkJlZm9yZVVubG9hZCAocmVhc29uOiAke3JlcGx5LnJlYXNvbn0pYCk7XG5cblx0XHRcdC8vIHRyaWdnZXIgb25CZWZvcmVTaHV0ZG93biBldmVudHMgYW5kIHZldG8gY29sbGVjdGluZ1xuXHRcdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMuaGFuZGxlQmVmb3JlU2h1dGRvd24ocmVwbHkucmVhc29uKTtcblxuXHRcdFx0Ly8gdmV0bzogY2FuY2VsIHVubG9hZFxuXHRcdFx0aWYgKHZldG8pIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbbGlmZWN5Y2xlXSBvbkJlZm9yZVVubG9hZCBwcmV2ZW50ZWQgdmlhIHZldG8nKTtcblxuXHRcdFx0XHQvLyBJbmRpY2F0ZSBhcyBldmVudFxuXHRcdFx0XHR0aGlzLl9vblNodXRkb3duVmV0by5maXJlKCk7XG5cblx0XHRcdFx0aXBjUmVuZGVyZXIuc2VuZChyZXBseS5jYW5jZWxDaGFubmVsLCB3aW5kb3dJZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG5vIHZldG86IGFsbG93IHVubG9hZFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnW2xpZmVjeWNsZV0gb25CZWZvcmVVbmxvYWQgY29udGludWVzIHdpdGhvdXQgdmV0bycpO1xuXG5cdFx0XHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSByZXBseS5yZWFzb247XG5cdFx0XHRcdGlwY1JlbmRlcmVyLnNlbmQocmVwbHkub2tDaGFubmVsLCB3aW5kb3dJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBNYWluIHNpZGUgaW5kaWNhdGVzIHRoYXQgd2Ugd2lsbCBpbmRlZWQgc2h1dGRvd25cblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOm9uV2lsbFVubG9hZCcsIGFzeW5jIChldmVudDogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXBseSA9IGFyZ3NbMF0gYXMgeyByZXBseUNoYW5uZWw6IHN0cmluZzsgcmVhc29uOiBTaHV0ZG93blJlYXNvbiB9O1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbbGlmZWN5Y2xlXSBvbldpbGxVbmxvYWQgKHJlYXNvbjogJHtyZXBseS5yZWFzb259KWApO1xuXG5cdFx0XHQvLyB0cmlnZ2VyIG9uV2lsbFNodXRkb3duIGV2ZW50cyBhbmQgam9pbmluZ1xuXHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVXaWxsU2h1dGRvd24ocmVwbHkucmVhc29uKTtcblxuXHRcdFx0Ly8gdHJpZ2dlciBvbkRpZFNodXRkb3duIGV2ZW50IG5vdyB0aGF0IHdlIGtub3cgd2Ugd2lsbCBxdWl0XG5cdFx0XHR0aGlzLl9vbkRpZFNodXRkb3duLmZpcmUoKTtcblxuXHRcdFx0Ly8gYWNrbm93bGVkZ2UgdG8gbWFpbiBzaWRlXG5cdFx0XHRpcGNSZW5kZXJlci5zZW5kKHJlcGx5LnJlcGx5Q2hhbm5lbCwgd2luZG93SWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGhhbmRsZUJlZm9yZVNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gdGhpcy5sb2dTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgdmV0b3M6IChib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPilbXSA9IFtdO1xuXHRcdGNvbnN0IHBlbmRpbmdWZXRvcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0bGV0IGZpbmFsVmV0bzogKCgpID0+IGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZmluYWxWZXRvSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIGJlZm9yZS1zaHV0ZG93biBldmVudCB3aXRoIHZldG8gc3VwcG9ydFxuXHRcdHRoaXMuX29uQmVmb3JlU2h1dGRvd24uZmlyZSh7XG5cdFx0XHRyZWFzb24sXG5cdFx0XHR2ZXRvKHZhbHVlLCBpZCkge1xuXHRcdFx0XHR2ZXRvcy5wdXNoKHZhbHVlKTtcblxuXHRcdFx0XHQvLyBMb2cgYW55IHZldG8gaW5zdGFudGx5XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgW2xpZmVjeWNsZV06IFNodXRkb3duIHdhcyBwcmV2ZW50ZWQgKGlkOiAke2lkfSlgKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRyYWNrIHByb21pc2UgY29tcGxldGlvblxuXHRcdFx0XHRlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRcdFx0XHRwZW5kaW5nVmV0b3MuYWRkKGlkKTtcblx0XHRcdFx0XHR2YWx1ZS50aGVuKHZldG8gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHZldG8gPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGBbbGlmZWN5Y2xlXTogU2h1dGRvd24gd2FzIHByZXZlbnRlZCAoaWQ6ICR7aWR9KWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4gcGVuZGluZ1ZldG9zLmRlbGV0ZShpZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0ZmluYWxWZXRvKHZhbHVlLCBpZCkge1xuXHRcdFx0XHRpZiAoIWZpbmFsVmV0bykge1xuXHRcdFx0XHRcdGZpbmFsVmV0byA9IHZhbHVlO1xuXHRcdFx0XHRcdGZpbmFsVmV0b0lkID0gaWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbbGlmZWN5Y2xlXTogRmluYWwgdmV0byBpcyBhbHJlYWR5IGRlZmluZWQgKGlkOiAke2lkfSlgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9uZ1J1bm5pbmdCZWZvcmVTaHV0ZG93bldhcm5pbmcgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtsaWZlY3ljbGVdIG9uQmVmb3JlU2h1dGRvd24gaXMgdGFraW5nIGEgbG9uZyB0aW1lLCBwZW5kaW5nIG9wZXJhdGlvbnM6ICR7QXJyYXkuZnJvbShwZW5kaW5nVmV0b3MpLmpvaW4oJywgJyl9YCk7XG5cdFx0fSwgTmF0aXZlTGlmZWN5Y2xlU2VydmljZS5CRUZPUkVfU0hVVERPV05fV0FSTklOR19ERUxBWSk7XG5cblx0XHR0cnkge1xuXG5cdFx0XHQvLyBGaXJzdDogcnVuIGxpc3Qgb2YgdmV0b3MgaW4gcGFyYWxsZWxcblx0XHRcdGxldCB2ZXRvID0gYXdhaXQgaGFuZGxlVmV0b3ModmV0b3MsIGVycm9yID0+IHRoaXMuaGFuZGxlQmVmb3JlU2h1dGRvd25FcnJvcihlcnJvciwgcmVhc29uKSk7XG5cdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRyZXR1cm4gdmV0bztcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2Vjb25kOiBydW4gdGhlIGZpbmFsIHZldG8gaWYgZGVmaW5lZFxuXHRcdFx0aWYgKGZpbmFsVmV0bykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHBlbmRpbmdWZXRvcy5hZGQoZmluYWxWZXRvSWQgYXMgdW5rbm93biBhcyBzdHJpbmcpO1xuXHRcdFx0XHRcdHZldG8gPSBhd2FpdCAoZmluYWxWZXRvIGFzICgpID0+IFByb21pc2U8Ym9vbGVhbj4pKCk7XG5cdFx0XHRcdFx0aWYgKHZldG8pIHtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgW2xpZmVjeWNsZV06IFNodXRkb3duIHdhcyBwcmV2ZW50ZWQgYnkgZmluYWwgdmV0byAoaWQ6ICR7ZmluYWxWZXRvSWR9KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR2ZXRvID0gdHJ1ZTsgLy8gdHJlYXQgZXJyb3IgYXMgdmV0b1xuXG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVCZWZvcmVTaHV0ZG93bkVycm9yKGVycm9yLCByZWFzb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2ZXRvO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsb25nUnVubmluZ0JlZm9yZVNodXRkb3duV2FybmluZy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVCZWZvcmVTaHV0ZG93bkVycm9yKGVycm9yOiBFcnJvciwgcmVhc29uOiBTaHV0ZG93blJlYXNvbik6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2xpZmVjeWNsZV06IEVycm9yIGR1cmluZyBiZWZvcmUtc2h1dGRvd24gcGhhc2UgKGVycm9yOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX0pYCk7XG5cblx0XHR0aGlzLl9vbkJlZm9yZVNodXRkb3duRXJyb3IuZmlyZSh7IHJlYXNvbiwgZXJyb3IgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFuZGxlV2lsbFNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl93aWxsU2h1dGRvd24gPSB0cnVlO1xuXG5cdFx0Y29uc3Qgam9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Y29uc3QgbGFzdEpvaW5lcnM6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KVtdID0gW107XG5cdFx0Y29uc3QgcGVuZGluZ0pvaW5lcnMgPSBuZXcgU2V0PElXaWxsU2h1dGRvd25FdmVudEpvaW5lcj4oKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9vbldpbGxTaHV0ZG93bi5maXJlKHtcblx0XHRcdHJlYXNvbixcblx0XHRcdHRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHRqb2luZXJzOiAoKSA9PiBBcnJheS5mcm9tKHBlbmRpbmdKb2luZXJzLnZhbHVlcygpKSxcblx0XHRcdGpvaW4ocHJvbWlzZU9yUHJvbWlzZUZuLCBqb2luZXIpIHtcblx0XHRcdFx0cGVuZGluZ0pvaW5lcnMuYWRkKGpvaW5lcik7XG5cblx0XHRcdFx0aWYgKGpvaW5lci5vcmRlciA9PT0gV2lsbFNodXRkb3duSm9pbmVyT3JkZXIuTGFzdCkge1xuXHRcdFx0XHRcdGNvbnN0IHByb21pc2VGbiA9IHR5cGVvZiBwcm9taXNlT3JQcm9taXNlRm4gPT09ICdmdW5jdGlvbicgPyBwcm9taXNlT3JQcm9taXNlRm4gOiAoKSA9PiBwcm9taXNlT3JQcm9taXNlRm47XG5cdFx0XHRcdFx0bGFzdEpvaW5lcnMucHVzaCgoKSA9PiBwcm9taXNlRm4oKS5maW5hbGx5KCgpID0+IHBlbmRpbmdKb2luZXJzLmRlbGV0ZShqb2luZXIpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZSA9IHR5cGVvZiBwcm9taXNlT3JQcm9taXNlRm4gPT09ICdmdW5jdGlvbicgPyBwcm9taXNlT3JQcm9taXNlRm4oKSA6IHByb21pc2VPclByb21pc2VGbjtcblx0XHRcdFx0XHRwcm9taXNlLmZpbmFsbHkoKCkgPT4gcGVuZGluZ0pvaW5lcnMuZGVsZXRlKGpvaW5lcikpO1xuXHRcdFx0XHRcdGpvaW5lcnMucHVzaChwcm9taXNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGZvcmNlOiAoKSA9PiB7XG5cdFx0XHRcdGN0cy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbG9uZ1J1bm5pbmdXaWxsU2h1dGRvd25XYXJuaW5nID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtsaWZlY3ljbGVdIG9uV2lsbFNodXRkb3duIGlzIHRha2luZyBhIGxvbmcgdGltZSwgcGVuZGluZyBvcGVyYXRpb25zOiAke0FycmF5LmZyb20ocGVuZGluZ0pvaW5lcnMpLm1hcChqb2luZXIgPT4gam9pbmVyLmlkKS5qb2luKCcsICcpfWApO1xuXHRcdH0sIE5hdGl2ZUxpZmVjeWNsZVNlcnZpY2UuV0lMTF9TSFVURE9XTl9XQVJOSU5HX0RFTEFZKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKFByb21pc2VzLnNldHRsZWQoam9pbmVycyksIGN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2xpZmVjeWNsZV06IEVycm9yIGR1cmluZyB3aWxsLXNodXRkb3duIHBoYXNlIGluIGRlZmF1bHQgam9pbmVycyAoZXJyb3I6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfSlgKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbihQcm9taXNlcy5zZXR0bGVkKGxhc3RKb2luZXJzLm1hcChsYXN0Sm9pbmVyID0+IGxhc3RKb2luZXIoKSkpLCBjdHMudG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtsaWZlY3ljbGVdOiBFcnJvciBkdXJpbmcgd2lsbC1zaHV0ZG93biBwaGFzZSBpbiBsYXN0IGpvaW5lcnMgKGVycm9yOiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX0pYCk7XG5cdFx0fVxuXG5cdFx0bG9uZ1J1bm5pbmdXaWxsU2h1dGRvd25XYXJuaW5nLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHNodXRkb3duKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLmNsb3NlV2luZG93KCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUxpZmVjeWNsZVNlcnZpY2UsIE5hdGl2ZUxpZmVjeWNsZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBeUIsbUJBQTZDLCtCQUErQjtBQUNyRyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxVQUFVLG1CQUFtQix3QkFBd0I7QUFDOUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBK0I7QUFFakMsSUFBTSx5QkFBTixjQUFxQyx5QkFBeUI7QUFBQSxFQUtwRSxZQUNzQyxtQkFDcEIsZ0JBQ0osWUFDWjtBQUNELFVBQU0sWUFBWSxjQUFjO0FBSks7QUFNckMsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEs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
