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
import electron from "electron";
import { validatedIpcMain } from "../../../base/parts/ipc/electron-main/ipcMain.js";
import { Barrier, Promises, timeout } from "../../../base/common/async.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { cwd } from "../../../base/common/process.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { UnloadReason } from "../../window/electron-main/window.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { getAllWindowsExcludingOffscreen } from "../../windows/electron-main/windows.js";
const ILifecycleMainService = createDecorator("lifecycleMainService");
var ShutdownReason = /* @__PURE__ */ ((ShutdownReason2) => {
  ShutdownReason2[ShutdownReason2["QUIT"] = 1] = "QUIT";
  ShutdownReason2[ShutdownReason2["KILL"] = 2] = "KILL";
  return ShutdownReason2;
})(ShutdownReason || {});
var LifecycleMainPhase = /* @__PURE__ */ ((LifecycleMainPhase2) => {
  LifecycleMainPhase2[LifecycleMainPhase2["Starting"] = 1] = "Starting";
  LifecycleMainPhase2[LifecycleMainPhase2["Ready"] = 2] = "Ready";
  LifecycleMainPhase2[LifecycleMainPhase2["AfterWindowOpen"] = 3] = "AfterWindowOpen";
  LifecycleMainPhase2[LifecycleMainPhase2["Eventually"] = 4] = "Eventually";
  return LifecycleMainPhase2;
})(LifecycleMainPhase || {});
let LifecycleMainService = class extends Disposable {
  constructor(logService, stateService, environmentMainService) {
    super();
    this.logService = logService;
    this.stateService = stateService;
    this.environmentMainService = environmentMainService;
    this._onBeforeShutdown = this._register(new Emitter());
    this.onBeforeShutdown = this._onBeforeShutdown.event;
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onWillLoadWindow = this._register(new Emitter());
    this.onWillLoadWindow = this._onWillLoadWindow.event;
    this._onBeforeCloseWindow = this._register(new Emitter());
    this.onBeforeCloseWindow = this._onBeforeCloseWindow.event;
    this._quitRequested = false;
    this._wasRestarted = false;
    this._phase = 1 /* Starting */;
    this.windowToCloseRequest = /* @__PURE__ */ new Set();
    this.oneTimeListenerTokenGenerator = 0;
    this.windowCounter = 0;
    this.pendingQuitPromise = void 0;
    this.pendingQuitPromiseResolve = void 0;
    this.pendingWillShutdownPromise = void 0;
    this.mapWindowIdToPendingUnload = /* @__PURE__ */ new Map();
    this.phaseWhen = /* @__PURE__ */ new Map();
    this.relaunchHandler = void 0;
    this.resolveRestarted();
    this.when(2 /* Ready */).then(() => this.registerListeners());
  }
  get quitRequested() {
    return this._quitRequested;
  }
  get wasRestarted() {
    return this._wasRestarted;
  }
  get phase() {
    return this._phase;
  }
  resolveRestarted() {
    this._wasRestarted = !!this.stateService.getItem(LifecycleMainService.QUIT_AND_RESTART_KEY);
    if (this._wasRestarted) {
      this.stateService.removeItem(LifecycleMainService.QUIT_AND_RESTART_KEY);
    }
  }
  registerListeners() {
    const beforeQuitListener = () => {
      if (this._quitRequested) {
        return;
      }
      this.trace("Lifecycle#app.on(before-quit)");
      this._quitRequested = true;
      this.trace("Lifecycle#onBeforeShutdown.fire()");
      this._onBeforeShutdown.fire();
      if (isMacintosh && this.windowCounter === 0) {
        this.fireOnWillShutdown(1 /* QUIT */);
      }
    };
    electron.app.addListener("before-quit", beforeQuitListener);
    const windowAllClosedListener = () => {
      this.trace("Lifecycle#app.on(window-all-closed)");
      if (this._quitRequested || !isMacintosh) {
        electron.app.quit();
      }
    };
    electron.app.addListener("window-all-closed", windowAllClosedListener);
    electron.app.once("will-quit", (e) => {
      this.trace("Lifecycle#app.on(will-quit) - begin");
      e.preventDefault();
      const shutdownPromise = this.fireOnWillShutdown(1 /* QUIT */);
      shutdownPromise.finally(() => {
        this.trace("Lifecycle#app.on(will-quit) - after fireOnWillShutdown");
        this.resolvePendingQuitPromise(
          false
          /* no veto */
        );
        electron.app.removeListener("before-quit", beforeQuitListener);
        electron.app.removeListener("window-all-closed", windowAllClosedListener);
        this.trace("Lifecycle#app.on(will-quit) - calling app.quit()");
        electron.app.quit();
      });
    });
  }
  fireOnWillShutdown(reason) {
    if (this.pendingWillShutdownPromise) {
      return this.pendingWillShutdownPromise;
    }
    const logService = this.logService;
    this.trace("Lifecycle#onWillShutdown.fire()");
    const joiners = [];
    this._onWillShutdown.fire({
      reason,
      join(id, promise) {
        logService.trace(`Lifecycle#onWillShutdown - begin '${id}'`);
        joiners.push(promise.finally(() => {
          logService.trace(`Lifecycle#onWillShutdown - end '${id}'`);
        }));
      }
    });
    this.pendingWillShutdownPromise = (async () => {
      try {
        await Promises.settled(joiners);
      } catch (error) {
        this.logService.error(error);
      }
      try {
        await this.stateService.close();
      } catch (error) {
        this.logService.error(error);
      }
    })();
    return this.pendingWillShutdownPromise;
  }
  set phase(value) {
    if (value < this.phase) {
      throw new Error("Lifecycle cannot go backwards");
    }
    if (this._phase === value) {
      return;
    }
    this.trace(`lifecycle (main): phase changed (value: ${value})`);
    this._phase = value;
    const barrier = this.phaseWhen.get(this._phase);
    if (barrier) {
      barrier.open();
      this.phaseWhen.delete(this._phase);
    }
  }
  async when(phase) {
    if (phase <= this._phase) {
      return;
    }
    let barrier = this.phaseWhen.get(phase);
    if (!barrier) {
      barrier = new Barrier();
      this.phaseWhen.set(phase, barrier);
    }
    await barrier.wait();
  }
  registerWindow(window) {
    const windowListeners = new DisposableStore();
    this.windowCounter++;
    windowListeners.add(window.onWillLoad((e) => this._onWillLoadWindow.fire({ window, workspace: e.workspace, reason: e.reason })));
    const win = assertReturnsDefined(window.win);
    windowListeners.add(Event.fromNodeEventEmitter(win, "close")((e) => {
      const windowId = window.id;
      if (this.windowToCloseRequest.delete(windowId)) {
        return;
      }
      this.trace(`Lifecycle#window.on('close') - window ID ${window.id}`);
      e.preventDefault();
      this.unload(window, UnloadReason.CLOSE).then((veto) => {
        if (veto) {
          this.windowToCloseRequest.delete(windowId);
          return;
        }
        this.windowToCloseRequest.add(windowId);
        this.trace(`Lifecycle#onBeforeCloseWindow.fire() - window ID ${windowId}`);
        this._onBeforeCloseWindow.fire(window);
        window.close();
      });
    }));
    windowListeners.add(Event.fromNodeEventEmitter(win, "closed")(() => {
      this.trace(`Lifecycle#window.on('closed') - window ID ${window.id}`);
      this.windowCounter--;
      windowListeners.dispose();
      if (this.windowCounter === 0 && (!isMacintosh || this._quitRequested)) {
        this.fireOnWillShutdown(1 /* QUIT */);
      }
    }));
  }
  registerAuxWindow(auxWindow) {
    const win = assertReturnsDefined(auxWindow.win);
    const windowListeners = new DisposableStore();
    windowListeners.add(Event.fromNodeEventEmitter(win, "close")((e) => {
      this.trace(`Lifecycle#auxWindow.on('close') - window ID ${auxWindow.id}`);
      if (this._quitRequested) {
        this.trace(`Lifecycle#auxWindow.on('close') - preventDefault() because quit requested`);
        e.preventDefault();
      }
    }));
    windowListeners.add(Event.fromNodeEventEmitter(win, "closed")(() => {
      this.trace(`Lifecycle#auxWindow.on('closed') - window ID ${auxWindow.id}`);
      windowListeners.dispose();
    }));
  }
  async reload(window, cli) {
    const veto = await this.unload(window, UnloadReason.RELOAD);
    if (!veto) {
      window.reload(cli);
    }
  }
  unload(window, reason) {
    const pendingUnloadPromise = this.mapWindowIdToPendingUnload.get(window.id);
    if (pendingUnloadPromise) {
      return pendingUnloadPromise;
    }
    const unloadPromise = this.doUnload(window, reason).finally(() => {
      this.mapWindowIdToPendingUnload.delete(window.id);
    });
    this.mapWindowIdToPendingUnload.set(window.id, unloadPromise);
    return unloadPromise;
  }
  async doUnload(window, reason) {
    if (!window.isReady) {
      return false;
    }
    this.trace(`Lifecycle#unload() - window ID ${window.id}`);
    const windowUnloadReason = this._quitRequested ? UnloadReason.QUIT : reason;
    const veto = await this.onBeforeUnloadWindowInRenderer(window, windowUnloadReason);
    if (veto) {
      this.trace(`Lifecycle#unload() - veto in renderer (window ID ${window.id})`);
      return this.handleWindowUnloadVeto(veto);
    }
    await this.onWillUnloadWindowInRenderer(window, windowUnloadReason);
    return false;
  }
  handleWindowUnloadVeto(veto) {
    if (!veto) {
      return false;
    }
    this.resolvePendingQuitPromise(
      true
      /* veto */
    );
    this._quitRequested = false;
    return true;
  }
  resolvePendingQuitPromise(veto) {
    if (this.pendingQuitPromiseResolve) {
      this.pendingQuitPromiseResolve(veto);
      this.pendingQuitPromiseResolve = void 0;
      this.pendingQuitPromise = void 0;
    }
  }
  onBeforeUnloadWindowInRenderer(window, reason) {
    return new Promise((resolve) => {
      const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
      const okChannel = `vscode:ok${oneTimeEventToken}`;
      const cancelChannel = `vscode:cancel${oneTimeEventToken}`;
      const cleanup = (value) => {
        validatedIpcMain.removeListener(okChannel, okListener);
        validatedIpcMain.removeListener(cancelChannel, cancelListener);
        resolve(value);
      };
      const okListener = () => {
        cleanup(false);
      };
      const cancelListener = () => {
        cleanup(true);
      };
      validatedIpcMain.on(okChannel, okListener);
      validatedIpcMain.on(cancelChannel, cancelListener);
      window.send("vscode:onBeforeUnload", { okChannel, cancelChannel, reason });
    });
  }
  onWillUnloadWindowInRenderer(window, reason) {
    return new Promise((resolve) => {
      const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
      const replyChannel = `vscode:reply${oneTimeEventToken}`;
      validatedIpcMain.once(replyChannel, () => resolve());
      window.send("vscode:onWillUnload", { replyChannel, reason });
    });
  }
  quit(willRestart) {
    return this.doQuit(willRestart).then((veto) => {
      if (!veto && willRestart) {
        try {
          if (isWindows) {
            const currentWorkingDir = cwd();
            if (currentWorkingDir !== process.cwd()) {
              process.chdir(currentWorkingDir);
            }
          }
        } catch (err) {
          this.logService.error(err);
        }
      }
      return veto;
    });
  }
  doQuit(willRestart) {
    this.trace(`Lifecycle#quit() - begin (willRestart: ${willRestart})`);
    if (this.pendingQuitPromise) {
      this.trace("Lifecycle#quit() - returning pending quit promise");
      return this.pendingQuitPromise;
    }
    if (willRestart) {
      this.stateService.setItem(LifecycleMainService.QUIT_AND_RESTART_KEY, true);
    }
    this.pendingQuitPromise = new Promise((resolve) => {
      this.pendingQuitPromiseResolve = resolve;
      this.trace("Lifecycle#quit() - calling app.quit()");
      electron.app.quit();
    });
    return this.pendingQuitPromise;
  }
  trace(msg) {
    if (this.environmentMainService.args["enable-smoke-test-driver"]) {
      this.logService.info(msg);
    } else {
      this.logService.trace(msg);
    }
  }
  setRelaunchHandler(handler) {
    this.relaunchHandler = handler;
  }
  async relaunch(options) {
    this.trace("Lifecycle#relaunch()");
    const args = process.argv.slice(1);
    if (options?.addArgs) {
      args.push(...options.addArgs);
    }
    if (options?.removeArgs) {
      for (const a of options.removeArgs) {
        const idx = args.indexOf(a);
        if (idx >= 0) {
          args.splice(idx, 1);
        }
      }
    }
    const quitListener = () => {
      if (!this.relaunchHandler?.handleRelaunch(options)) {
        this.trace("Lifecycle#relaunch() - calling app.relaunch()");
        electron.app.relaunch({ args });
      }
    };
    electron.app.once("quit", quitListener);
    const veto = await this.quit(
      true
      /* will restart */
    );
    if (veto) {
      electron.app.removeListener("quit", quitListener);
    }
  }
  async kill(code) {
    this.trace("Lifecycle#kill()");
    await this.fireOnWillShutdown(2 /* KILL */);
    await Promise.race([
      // Still do not block more than 1s
      timeout(1e3),
      // Destroy any opened window: we do not unload windows here because
      // there is a chance that the unload is veto'd or long running due
      // to a participant within the window. this is not wanted when we
      // are asked to kill the application.
      (async () => {
        for (const window of getAllWindowsExcludingOffscreen()) {
          if (window && !window.isDestroyed()) {
            let whenWindowClosed;
            if (window.webContents && !window.webContents.isDestroyed()) {
              whenWindowClosed = new Promise((resolve) => window.once("closed", resolve));
            } else {
              whenWindowClosed = Promise.resolve();
            }
            window.destroy();
            await whenWindowClosed;
          }
        }
      })()
    ]);
    electron.app.exit(code);
  }
};
LifecycleMainService.QUIT_AND_RESTART_KEY = "lifecycle.quitAndRestart";
LifecycleMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IStateService),
  __decorateParam(2, IEnvironmentMainService)
], LifecycleMainService);
export {
  ILifecycleMainService,
  LifecycleMainPhase,
  LifecycleMainService,
  ShutdownReason
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xpZmVjeWNsZS9lbGVjdHJvbi1tYWluL2xpZmVjeWNsZU1haW5TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGVsZWN0cm9uIGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IHZhbGlkYXRlZElwY01haW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9lbGVjdHJvbi1tYWluL2lwY01haW4uanMnO1xuaW1wb3J0IHsgQmFycmllciwgUHJvbWlzZXMsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY3dkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IE5hdGl2ZVBhcnNlZEFyZ3MgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vYXJndi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL3N0YXRlL25vZGUvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvZGVXaW5kb3csIExvYWRSZWFzb24sIFVubG9hZFJlYXNvbiB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93IH0gZnJvbSAnLi4vLi4vYXV4aWxpYXJ5V2luZG93L2VsZWN0cm9uLW1haW4vYXV4aWxpYXJ5V2luZG93LmpzJztcbmltcG9ydCB7IGdldEFsbFdpbmRvd3NFeGNsdWRpbmdPZmZzY3JlZW4gfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5cbmV4cG9ydCBjb25zdCBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxpZmVjeWNsZU1haW5TZXJ2aWNlPignbGlmZWN5Y2xlTWFpblNlcnZpY2UnKTtcblxuaW50ZXJmYWNlIFdpbmRvd0xvYWRFdmVudCB7XG5cblx0LyoqXG5cdCAqIFRoZSB3aW5kb3cgdGhhdCBpcyBsb2FkZWQgdG8gYSBuZXcgd29ya3NwYWNlLlxuXHQgKi9cblx0cmVhZG9ubHkgd2luZG93OiBJQ29kZVdpbmRvdztcblxuXHQvKipcblx0ICogVGhlIHdvcmtzcGFjZSB0aGUgd2luZG93IGlzIGxvYWRlZCBpbnRvLlxuXHQgKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBNb3JlIGRldGFpbHMgd2h5IHRoZSB3aW5kb3cgbG9hZHMgdG8gYSBuZXcgd29ya3NwYWNlLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVhc29uOiBMb2FkUmVhc29uO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTaHV0ZG93blJlYXNvbiB7XG5cblx0LyoqXG5cdCAqIFRoZSBhcHBsaWNhdGlvbiBleGl0cyBub3JtYWxseS5cblx0ICovXG5cdFFVSVQgPSAxLFxuXG5cdC8qKlxuXHQgKiBUaGUgYXBwbGljYXRpb24gZXhpdHMgYWJub3JtYWxseSBhbmQgaXMgYmVpbmdcblx0ICoga2lsbGVkIHdpdGggYW4gZXhpdCBjb2RlIChlLmcuIGZyb20gaW50ZWdyYXRpb25cblx0ICogdGVzdCBydW4pXG5cdCAqL1xuXHRLSUxMXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2h1dGRvd25FdmVudCB7XG5cblx0LyoqXG5cdCAqIE1vcmUgZGV0YWlscyB3aHkgdGhlIGFwcGxpY2F0aW9uIGlzIHNodXR0aW5nIGRvd24uXG5cdCAqL1xuXHRyZWFzb246IFNodXRkb3duUmVhc29uO1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gam9pbiB0aGUgc2h1dGRvd24uIFRoZSBwcm9taXNlIGNhbiBiZSBhIGxvbmcgcnVubmluZyBvcGVyYXRpb24gYnV0IGl0XG5cdCAqIHdpbGwgYmxvY2sgdGhlIGFwcGxpY2F0aW9uIGZyb20gY2xvc2luZy5cblx0ICovXG5cdGpvaW4oaWQ6IHN0cmluZywgcHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbGF1bmNoSGFuZGxlciB7XG5cblx0LyoqXG5cdCAqIEFsbG93cyBhIGhhbmRsZXIgdG8gZGVhbCB3aXRoIHJlbGF1bmNoaW5nIHRoZSBhcHBsaWNhdGlvbi4gVGhlIHJldHVyblxuXHQgKiB2YWx1ZSBpbmRpY2F0ZXMgaWYgdGhlIHJlbGF1bmNoIGlzIGhhbmRsZWQgb3Igbm90LlxuXHQgKi9cblx0aGFuZGxlUmVsYXVuY2gob3B0aW9ucz86IElSZWxhdW5jaE9wdGlvbnMpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWxhdW5jaE9wdGlvbnMge1xuXHRyZWFkb25seSBhZGRBcmdzPzogc3RyaW5nW107XG5cdHJlYWRvbmx5IHJlbW92ZUFyZ3M/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlmZWN5Y2xlTWFpblNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2lsbCBiZSB0cnVlIGlmIHRoZSBwcm9ncmFtIHdhcyByZXN0YXJ0ZWQgKGUuZy4gZHVlIHRvIGV4cGxpY2l0IHJlcXVlc3Qgb3IgdXBkYXRlKS5cblx0ICovXG5cdHJlYWRvbmx5IHdhc1Jlc3RhcnRlZDogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2lsbCBiZSB0cnVlIGlmIHRoZSBwcm9ncmFtIHdhcyByZXF1ZXN0ZWQgdG8gcXVpdC5cblx0ICovXG5cdHJlYWRvbmx5IHF1aXRSZXF1ZXN0ZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEEgZmxhZyBpbmRpY2F0aW5nIGluIHdoYXQgcGhhc2Ugb2YgdGhlIGxpZmVjeWNsZSB3ZSBjdXJyZW50bHkgYXJlLlxuXHQgKi9cblx0cGhhc2U6IExpZmVjeWNsZU1haW5QaGFzZTtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIHRoZSBhcHBsaWNhdGlvbiBpcyBhYm91dCB0byBzaHV0ZG93biBiZWZvcmUgYW55IHdpbmRvdyBpcyBjbG9zZWQuXG5cdCAqIFRoZSBzaHV0ZG93biBjYW4gc3RpbGwgYmUgcHJldmVudGVkIGJ5IGFueSB3aW5kb3cgdGhhdCB2ZXRvcyB0aGlzIGV2ZW50LlxuXHQgKi9cblx0cmVhZG9ubHkgb25CZWZvcmVTaHV0ZG93bjogRXZlbnQ8dm9pZD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgZmlyZXMgYWZ0ZXIgdGhlIG9uQmVmb3JlU2h1dGRvd24gZXZlbnQgaGFzIGJlZW4gZmlyZWQgYW5kIGFmdGVyIG5vIHdpbmRvdyBoYXNcblx0ICogdmV0b2VkIHRoZSBzaHV0ZG93biBzZXF1ZW5jZS4gQXQgdGhpcyBwb2ludCBsaXN0ZW5lcnMgYXJlIGVuc3VyZWQgdGhhdCB0aGUgYXBwbGljYXRpb24gd2lsbFxuXHQgKiBxdWl0IHdpdGhvdXQgdmV0by5cblx0ICovXG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duOiBFdmVudDxTaHV0ZG93bkV2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIGEgd2luZG93IGlzIGxvYWRpbmcuIFRoaXMgY2FuIGVpdGhlciBiZSBhIHdpbmRvdyBvcGVuaW5nIGZvciB0aGVcblx0ICogZmlyc3QgdGltZSBvciBhIHdpbmRvdyByZWxvYWRpbmcgb3IgY2hhbmdpbmcgdG8gYW5vdGhlciBVUkwuXG5cdCAqL1xuXHRyZWFkb25seSBvbldpbGxMb2FkV2luZG93OiBFdmVudDxXaW5kb3dMb2FkRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGZpcmVzIGJlZm9yZSBhIHdpbmRvdyBjbG9zZXMuIFRoaXMgZXZlbnQgaXMgZmlyZWQgYWZ0ZXIgYW55IHZldG8gaGFzIGJlZW4gZGVhbHRcblx0ICogd2l0aCBzbyB0aGF0IGxpc3RlbmVycyBrbm93IGZvciBzdXJlIHRoYXQgdGhlIHdpbmRvdyB3aWxsIGNsb3NlIHdpdGhvdXQgdmV0by5cblx0ICovXG5cdHJlYWRvbmx5IG9uQmVmb3JlQ2xvc2VXaW5kb3c6IEV2ZW50PElDb2RlV2luZG93PjtcblxuXHQvKipcblx0ICogTWFrZSBhIGBJQ29kZVdpbmRvd2Aga25vd24gdG8gdGhlIGxpZmVjeWNsZSBtYWluIHNlcnZpY2UuXG5cdCAqL1xuXHRyZWdpc3RlcldpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93KTogdm9pZDtcblxuXHQvKipcblx0ICogTWFrZSBhIGBJQXV4aWxpYXJ5V2luZG93YCBrbm93biB0byB0aGUgbGlmZWN5Y2xlIG1haW4gc2VydmljZS5cblx0ICovXG5cdHJlZ2lzdGVyQXV4V2luZG93KGF1eFdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFJlbG9hZCBhIHdpbmRvdy4gQWxsIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhcmUgdHJpZ2dlcmVkLlxuXHQgKi9cblx0cmVsb2FkKHdpbmRvdzogSUNvZGVXaW5kb3csIGNsaT86IE5hdGl2ZVBhcnNlZEFyZ3MpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBVbmxvYWQgYSB3aW5kb3cgZm9yIHRoZSBwcm92aWRlZCByZWFzb24uIEFsbCBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYXJlIHRyaWdnZXJlZC5cblx0ICovXG5cdHVubG9hZCh3aW5kb3c6IElDb2RlV2luZG93LCByZWFzb246IFVubG9hZFJlYXNvbik6IFByb21pc2U8Ym9vbGVhbiAvKiB2ZXRvICovPjtcblxuXHQvKipcblx0ICogUmVzdGFydCB0aGUgYXBwbGljYXRpb24gd2l0aCBvcHRpb25hbCBhcmd1bWVudHMgKENMSSkuIEFsbCBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYXJlIHRyaWdnZXJlZC5cblx0ICovXG5cdHJlbGF1bmNoKG9wdGlvbnM/OiBJUmVsYXVuY2hPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogU2V0cyBhIGN1c3RvbSBoYW5kbGVyIGZvciByZWxhdW5jaGluZyB0aGUgYXBwbGljYXRpb24uXG5cdCAqL1xuXHRzZXRSZWxhdW5jaEhhbmRsZXIoaGFuZGxlcjogSVJlbGF1bmNoSGFuZGxlcik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFNodXRkb3duIHRoZSBhcHBsaWNhdGlvbiBub3JtYWxseS4gQWxsIGxpZmVjeWNsZSBldmVudCBoYW5kbGVycyBhcmUgdHJpZ2dlcmVkLlxuXHQgKi9cblx0cXVpdCh3aWxsUmVzdGFydD86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz47XG5cblx0LyoqXG5cdCAqIEZvcmNlZnVsbHkgc2h1dGRvd24gdGhlIGFwcGxpY2F0aW9uIGFuZCBvcHRpb25hbGx5IHNldCBhbiBleGl0IGNvZGUuXG5cdCAqXG5cdCAqIFRoaXMgbWV0aG9kIHNob3VsZCBvbmx5IGJlIHVzZWQgaW4gcmFyZSBzaXR1YXRpb25zIHdoZXJlIGl0IGlzIGltcG9ydGFudFxuXHQgKiB0byBzZXQgYW4gZXhpdCBjb2RlIChlLmcuIHJ1bm5pbmcgdGVzdHMpIG9yIHdoZW4gdGhlIGFwcGxpY2F0aW9uIGlzXG5cdCAqIG5vdCBpbiBhIGhlYWx0aHkgc3RhdGUgYW5kIHNob3VsZCB0ZXJtaW5hdGUgYXNhcC5cblx0ICpcblx0ICogVGhpcyBtZXRob2QgZG9lcyBub3QgZmlyZSB0aGUgbm9ybWFsIGxpZmVjeWNsZSBldmVudHMgdG8gdGhlIHdpbmRvd3MsXG5cdCAqIHRoYXQgbm9ybWFsbHkgY2FuIGJlIHZldG9lZC4gV2luZG93cyBhcmUgZGVzdHJveWVkIHdpdGhvdXQgYSBjaGFuY2Vcblx0ICogb2YgY29tcG9uZW50cyB0byBwYXJ0aWNpcGF0ZS4gVGhlIG9ubHkgbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXIgdGhhdFxuXHQgKiBpcyB0cmlnZ2VyZWQgaXMgYG9uV2lsbFNodXRkb3duYCBpbiB0aGUgbWFpbiBwcm9jZXNzLlxuXHQgKi9cblx0a2lsbChjb2RlPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGEgY2VydGFpbiBsaWZlY3ljbGUgcGhhc2Vcblx0ICogaGFzIHN0YXJ0ZWQuXG5cdCAqL1xuXHR3aGVuKHBoYXNlOiBMaWZlY3ljbGVNYWluUGhhc2UpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBMaWZlY3ljbGVNYWluUGhhc2Uge1xuXG5cdC8qKlxuXHQgKiBUaGUgZmlyc3QgcGhhc2Ugc2lnbmFscyB0aGF0IHdlIGFyZSBhYm91dCB0byBzdGFydHVwLlxuXHQgKi9cblx0U3RhcnRpbmcgPSAxLFxuXG5cdC8qKlxuXHQgKiBTZXJ2aWNlcyBhcmUgcmVhZHkgYW5kIGZpcnN0IHdpbmRvdyBpcyBhYm91dCB0byBvcGVuLlxuXHQgKi9cblx0UmVhZHkgPSAyLFxuXG5cdC8qKlxuXHQgKiBUaGlzIHBoYXNlIHNpZ25hbHMgYSBwb2ludCBpbiB0aW1lIGFmdGVyIHRoZSB3aW5kb3cgaGFzIG9wZW5lZFxuXHQgKiBhbmQgaXMgdHlwaWNhbGx5IHRoZSBiZXN0IHBsYWNlIHRvIGRvIHdvcmsgdGhhdCBpcyBub3QgcmVxdWlyZWRcblx0ICogZm9yIHRoZSB3aW5kb3cgdG8gb3Blbi5cblx0ICovXG5cdEFmdGVyV2luZG93T3BlbiA9IDMsXG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IHBoYXNlIGFmdGVyIGEgd2luZG93IGhhcyBvcGVuZWQgYW5kIHNvbWUgdGltZSBoYXMgcGFzc2VkXG5cdCAqICgyLTUgc2Vjb25kcykuXG5cdCAqL1xuXHRFdmVudHVhbGx5ID0gNFxufVxuXG5leHBvcnQgY2xhc3MgTGlmZWN5Y2xlTWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBRVUlUX0FORF9SRVNUQVJUX0tFWSA9ICdsaWZlY3ljbGUucXVpdEFuZFJlc3RhcnQnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25CZWZvcmVTaHV0ZG93biA9IHRoaXMuX29uQmVmb3JlU2h1dGRvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2h1dGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTaHV0ZG93bkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsU2h1dGRvd24gPSB0aGlzLl9vbldpbGxTaHV0ZG93bi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxMb2FkV2luZG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8V2luZG93TG9hZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25XaWxsTG9hZFdpbmRvdyA9IHRoaXMuX29uV2lsbExvYWRXaW5kb3cuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVDbG9zZVdpbmRvdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb2RlV2luZG93PigpKTtcblx0cmVhZG9ubHkgb25CZWZvcmVDbG9zZVdpbmRvdyA9IHRoaXMuX29uQmVmb3JlQ2xvc2VXaW5kb3cuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcXVpdFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRnZXQgcXVpdFJlcXVlc3RlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3F1aXRSZXF1ZXN0ZWQ7IH1cblxuXHRwcml2YXRlIF93YXNSZXN0YXJ0ZWQgPSBmYWxzZTtcblx0Z2V0IHdhc1Jlc3RhcnRlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3dhc1Jlc3RhcnRlZDsgfVxuXG5cdHByaXZhdGUgX3BoYXNlID0gTGlmZWN5Y2xlTWFpblBoYXNlLlN0YXJ0aW5nO1xuXHRnZXQgcGhhc2UoKTogTGlmZWN5Y2xlTWFpblBoYXNlIHsgcmV0dXJuIHRoaXMuX3BoYXNlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aW5kb3dUb0Nsb3NlUmVxdWVzdCA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRwcml2YXRlIG9uZVRpbWVMaXN0ZW5lclRva2VuR2VuZXJhdG9yID0gMDtcblx0cHJpdmF0ZSB3aW5kb3dDb3VudGVyID0gMDtcblxuXHRwcml2YXRlIHBlbmRpbmdRdWl0UHJvbWlzZTogUHJvbWlzZTxib29sZWFuPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwZW5kaW5nUXVpdFByb21pc2VSZXNvbHZlOiB7ICh2ZXRvOiBib29sZWFuKTogdm9pZCB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcGVuZGluZ1dpbGxTaHV0ZG93blByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBXaW5kb3dJZFRvUGVuZGluZ1VubG9hZCA9IG5ldyBNYXA8bnVtYmVyLCBQcm9taXNlPGJvb2xlYW4+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGhhc2VXaGVuID0gbmV3IE1hcDxMaWZlY3ljbGVNYWluUGhhc2UsIEJhcnJpZXI+KCk7XG5cblx0cHJpdmF0ZSByZWxhdW5jaEhhbmRsZXI6IElSZWxhdW5jaEhhbmRsZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElTdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0ZVNlcnZpY2U6IElTdGF0ZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRNYWluU2VydmljZTogSUVudmlyb25tZW50TWFpblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVzb2x2ZVJlc3RhcnRlZCgpO1xuXHRcdHRoaXMud2hlbihMaWZlY3ljbGVNYWluUGhhc2UuUmVhZHkpLnRoZW4oKCkgPT4gdGhpcy5yZWdpc3Rlckxpc3RlbmVycygpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVJlc3RhcnRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl93YXNSZXN0YXJ0ZWQgPSAhIXRoaXMuc3RhdGVTZXJ2aWNlLmdldEl0ZW0oTGlmZWN5Y2xlTWFpblNlcnZpY2UuUVVJVF9BTkRfUkVTVEFSVF9LRVkpO1xuXG5cdFx0aWYgKHRoaXMuX3dhc1Jlc3RhcnRlZCkge1xuXHRcdFx0Ly8gcmVtb3ZlIHRoZSBtYXJrZXIgcmlnaHQgYWZ0ZXIgaWYgZm91bmRcblx0XHRcdHRoaXMuc3RhdGVTZXJ2aWNlLnJlbW92ZUl0ZW0oTGlmZWN5Y2xlTWFpblNlcnZpY2UuUVVJVF9BTkRfUkVTVEFSVF9LRVkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBiZWZvcmUtcXVpdDogYW4gZXZlbnQgdGhhdCBpcyBmaXJlZCBpZiBhcHBsaWNhdGlvbiBxdWl0IHdhc1xuXHRcdC8vIHJlcXVlc3RlZCBidXQgYmVmb3JlIGFueSB3aW5kb3cgd2FzIGNsb3NlZC5cblx0XHRjb25zdCBiZWZvcmVRdWl0TGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcXVpdFJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNhcHAub24oYmVmb3JlLXF1aXQpJyk7XG5cdFx0XHR0aGlzLl9xdWl0UmVxdWVzdGVkID0gdHJ1ZTtcblxuXHRcdFx0Ly8gRW1pdCBldmVudCB0byBpbmRpY2F0ZSB0aGF0IHdlIGFyZSBhYm91dCB0byBzaHV0ZG93blxuXHRcdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI29uQmVmb3JlU2h1dGRvd24uZmlyZSgpJyk7XG5cdFx0XHR0aGlzLl9vbkJlZm9yZVNodXRkb3duLmZpcmUoKTtcblxuXHRcdFx0Ly8gbWFjT1M6IGNhbiBydW4gd2l0aG91dCBhbnkgd2luZG93IG9wZW4uIGluIHRoYXQgY2FzZSB3ZSBmaXJlXG5cdFx0XHQvLyB0aGUgb25XaWxsU2h1dGRvd24oKSBldmVudCBkaXJlY3RseSBiZWNhdXNlIHRoZXJlIGlzIG5vIHZldG9cblx0XHRcdC8vIHRvIGJlIGV4cGVjdGVkLlxuXHRcdFx0aWYgKGlzTWFjaW50b3NoICYmIHRoaXMud2luZG93Q291bnRlciA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmZpcmVPbldpbGxTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGVsZWN0cm9uLmFwcC5hZGRMaXN0ZW5lcignYmVmb3JlLXF1aXQnLCBiZWZvcmVRdWl0TGlzdGVuZXIpO1xuXG5cdFx0Ly8gd2luZG93LWFsbC1jbG9zZWQ6IGFuIGV2ZW50IHRoYXQgb25seSBmaXJlcyB3aGVuIHRoZSBsYXN0IHdpbmRvd1xuXHRcdC8vIHdhcyBjbG9zZWQuIFdlIG92ZXJyaWRlIHRoaXMgZXZlbnQgdG8gYmUgaW4gY2hhcmdlIGlmIGFwcC5xdWl0KClcblx0XHQvLyBzaG91bGQgYmUgY2FsbGVkIG9yIG5vdC5cblx0XHRjb25zdCB3aW5kb3dBbGxDbG9zZWRMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNhcHAub24od2luZG93LWFsbC1jbG9zZWQpJyk7XG5cblx0XHRcdC8vIFdpbmRvd3MvTGludXg6IHdlIHF1aXQgd2hlbiBhbGwgd2luZG93cyBoYXZlIGNsb3NlZFxuXHRcdFx0Ly8gTWFjOiB3ZSBvbmx5IHF1aXQgd2hlbiBxdWl0IHdhcyByZXF1ZXN0ZWRcblx0XHRcdGlmICh0aGlzLl9xdWl0UmVxdWVzdGVkIHx8ICFpc01hY2ludG9zaCkge1xuXHRcdFx0XHRlbGVjdHJvbi5hcHAucXVpdCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZWxlY3Ryb24uYXBwLmFkZExpc3RlbmVyKCd3aW5kb3ctYWxsLWNsb3NlZCcsIHdpbmRvd0FsbENsb3NlZExpc3RlbmVyKTtcblxuXHRcdC8vIHdpbGwtcXVpdDogYW4gZXZlbnQgdGhhdCBpcyBmaXJlZCBhZnRlciBhbGwgd2luZG93cyBoYXZlIGJlZW5cblx0XHQvLyBjbG9zZWQsIGJ1dCBiZWZvcmUgYWN0dWFsbHkgcXVpdHRpbmcuXG5cdFx0ZWxlY3Ryb24uYXBwLm9uY2UoJ3dpbGwtcXVpdCcsIGUgPT4ge1xuXHRcdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI2FwcC5vbih3aWxsLXF1aXQpIC0gYmVnaW4nKTtcblxuXHRcdFx0Ly8gUHJldmVudCB0aGUgcXVpdCB1bnRpbCB0aGUgc2h1dGRvd24gcHJvbWlzZSB3YXMgcmVzb2x2ZWRcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0Ly8gU3RhcnQgc2h1dGRvd24gc2VxdWVuY2Vcblx0XHRcdGNvbnN0IHNodXRkb3duUHJvbWlzZSA9IHRoaXMuZmlyZU9uV2lsbFNodXRkb3duKFNodXRkb3duUmVhc29uLlFVSVQpO1xuXG5cdFx0XHQvLyBXYWl0IHVudGlsIHNodXRkb3duIGlzIHNpZ25hbGVkIHRvIGJlIGNvbXBsZXRlXG5cdFx0XHRzaHV0ZG93blByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNhcHAub24od2lsbC1xdWl0KSAtIGFmdGVyIGZpcmVPbldpbGxTaHV0ZG93bicpO1xuXG5cdFx0XHRcdC8vIFJlc29sdmUgcGVuZGluZyBxdWl0IHByb21pc2Ugbm93IHdpdGhvdXQgdmV0b1xuXHRcdFx0XHR0aGlzLnJlc29sdmVQZW5kaW5nUXVpdFByb21pc2UoZmFsc2UgLyogbm8gdmV0byAqLyk7XG5cblx0XHRcdFx0Ly8gUXVpdCBhZ2FpbiwgdGhpcyB0aW1lIGRvIG5vdCBwcmV2ZW50IHRoaXMsIHNpbmNlIG91clxuXHRcdFx0XHQvLyB3aWxsLXF1aXQgbGlzdGVuZXIgaXMgb25seSBpbnN0YWxsZWQgXCJvbmNlXCIuIEFsc29cblx0XHRcdFx0Ly8gcmVtb3ZlIGFueSBsaXN0ZW5lciB3ZSBoYXZlIHRoYXQgaXMgbm8gbG9uZ2VyIG5lZWRlZFxuXG5cdFx0XHRcdGVsZWN0cm9uLmFwcC5yZW1vdmVMaXN0ZW5lcignYmVmb3JlLXF1aXQnLCBiZWZvcmVRdWl0TGlzdGVuZXIpO1xuXHRcdFx0XHRlbGVjdHJvbi5hcHAucmVtb3ZlTGlzdGVuZXIoJ3dpbmRvdy1hbGwtY2xvc2VkJywgd2luZG93QWxsQ2xvc2VkTGlzdGVuZXIpO1xuXG5cdFx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNhcHAub24od2lsbC1xdWl0KSAtIGNhbGxpbmcgYXBwLnF1aXQoKScpO1xuXG5cdFx0XHRcdGVsZWN0cm9uLmFwcC5xdWl0KCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZmlyZU9uV2lsbFNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5wZW5kaW5nV2lsbFNodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGVuZGluZ1dpbGxTaHV0ZG93blByb21pc2U7IC8vIHNodXRkb3duIGlzIGFscmVhZHkgcnVubmluZ1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSB0aGlzLmxvZ1NlcnZpY2U7XG5cdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI29uV2lsbFNodXRkb3duLmZpcmUoKScpO1xuXG5cdFx0Y29uc3Qgam9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cblx0XHR0aGlzLl9vbldpbGxTaHV0ZG93bi5maXJlKHtcblx0XHRcdHJlYXNvbixcblx0XHRcdGpvaW4oaWQsIHByb21pc2UpIHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZShgTGlmZWN5Y2xlI29uV2lsbFNodXRkb3duIC0gYmVnaW4gJyR7aWR9J2ApO1xuXHRcdFx0XHRqb2luZXJzLnB1c2gocHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBMaWZlY3ljbGUjb25XaWxsU2h1dGRvd24gLSBlbmQgJyR7aWR9J2ApO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLnBlbmRpbmdXaWxsU2h1dGRvd25Qcm9taXNlID0gKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Ly8gU2V0dGxlIGFsbCBzaHV0ZG93biBldmVudCBqb2luZXJzXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGpvaW5lcnMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlbiwgYWx3YXlzIG1ha2Ugc3VyZSBhdCB0aGUgZW5kXG5cdFx0XHQvLyB0aGUgc3RhdGUgc2VydmljZSBpcyBmbHVzaGVkLlxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5zdGF0ZVNlcnZpY2UuY2xvc2UoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB0aGlzLnBlbmRpbmdXaWxsU2h1dGRvd25Qcm9taXNlO1xuXHR9XG5cblx0c2V0IHBoYXNlKHZhbHVlOiBMaWZlY3ljbGVNYWluUGhhc2UpIHtcblx0XHRpZiAodmFsdWUgPCB0aGlzLnBoYXNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xpZmVjeWNsZSBjYW5ub3QgZ28gYmFja3dhcmRzJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BoYXNlID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYGxpZmVjeWNsZSAobWFpbik6IHBoYXNlIGNoYW5nZWQgKHZhbHVlOiAke3ZhbHVlfSlgKTtcblxuXHRcdHRoaXMuX3BoYXNlID0gdmFsdWU7XG5cblx0XHRjb25zdCBiYXJyaWVyID0gdGhpcy5waGFzZVdoZW4uZ2V0KHRoaXMuX3BoYXNlKTtcblx0XHRpZiAoYmFycmllcikge1xuXHRcdFx0YmFycmllci5vcGVuKCk7XG5cdFx0XHR0aGlzLnBoYXNlV2hlbi5kZWxldGUodGhpcy5fcGhhc2UpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHdoZW4ocGhhc2U6IExpZmVjeWNsZU1haW5QaGFzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChwaGFzZSA8PSB0aGlzLl9waGFzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBiYXJyaWVyID0gdGhpcy5waGFzZVdoZW4uZ2V0KHBoYXNlKTtcblx0XHRpZiAoIWJhcnJpZXIpIHtcblx0XHRcdGJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdFx0dGhpcy5waGFzZVdoZW4uc2V0KHBoYXNlLCBiYXJyaWVyKTtcblx0XHR9XG5cblx0XHRhd2FpdCBiYXJyaWVyLndhaXQoKTtcblx0fVxuXG5cdHJlZ2lzdGVyV2luZG93KHdpbmRvdzogSUNvZGVXaW5kb3cpOiB2b2lkIHtcblx0XHRjb25zdCB3aW5kb3dMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyB0cmFjayB3aW5kb3cgY291bnRcblx0XHR0aGlzLndpbmRvd0NvdW50ZXIrKztcblxuXHRcdC8vIFdpbmRvdyBXaWxsIExvYWRcblx0XHR3aW5kb3dMaXN0ZW5lcnMuYWRkKHdpbmRvdy5vbldpbGxMb2FkKGUgPT4gdGhpcy5fb25XaWxsTG9hZFdpbmRvdy5maXJlKHsgd2luZG93LCB3b3Jrc3BhY2U6IGUud29ya3NwYWNlLCByZWFzb246IGUucmVhc29uIH0pKSk7XG5cblx0XHQvLyBXaW5kb3cgQmVmb3JlIENsb3Npbmc6IE1haW4gLT4gUmVuZGVyZXJcblx0XHRjb25zdCB3aW4gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh3aW5kb3cud2luKTtcblx0XHR3aW5kb3dMaXN0ZW5lcnMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPGVsZWN0cm9uLkV2ZW50Pih3aW4sICdjbG9zZScpKGUgPT4ge1xuXG5cdFx0XHQvLyBUaGUgd2luZG93IGFscmVhZHkgYWNrbm93bGVkZ2VkIHRvIGJlIGNsb3NlZFxuXHRcdFx0Y29uc3Qgd2luZG93SWQgPSB3aW5kb3cuaWQ7XG5cdFx0XHRpZiAodGhpcy53aW5kb3dUb0Nsb3NlUmVxdWVzdC5kZWxldGUod2luZG93SWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50cmFjZShgTGlmZWN5Y2xlI3dpbmRvdy5vbignY2xvc2UnKSAtIHdpbmRvdyBJRCAke3dpbmRvdy5pZH1gKTtcblxuXHRcdFx0Ly8gT3RoZXJ3aXNlIHByZXZlbnQgdW5sb2FkIGFuZCBoYW5kbGUgaXQgZnJvbSB3aW5kb3dcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMudW5sb2FkKHdpbmRvdywgVW5sb2FkUmVhc29uLkNMT1NFKS50aGVuKHZldG8gPT4ge1xuXHRcdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRcdHRoaXMud2luZG93VG9DbG9zZVJlcXVlc3QuZGVsZXRlKHdpbmRvd0lkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLndpbmRvd1RvQ2xvc2VSZXF1ZXN0LmFkZCh3aW5kb3dJZCk7XG5cblx0XHRcdFx0Ly8gRmlyZSBvbkJlZm9yZUNsb3NlV2luZG93IGJlZm9yZSBhY3R1YWxseSBjbG9zaW5nXG5cdFx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSNvbkJlZm9yZUNsb3NlV2luZG93LmZpcmUoKSAtIHdpbmRvdyBJRCAke3dpbmRvd0lkfWApO1xuXHRcdFx0XHR0aGlzLl9vbkJlZm9yZUNsb3NlV2luZG93LmZpcmUod2luZG93KTtcblxuXHRcdFx0XHQvLyBObyB2ZXRvLCBjbG9zZSB3aW5kb3cgbm93XG5cdFx0XHRcdHdpbmRvdy5jbG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHdpbmRvd0xpc3RlbmVycy5hZGQoRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8ZWxlY3Ryb24uRXZlbnQ+KHdpbiwgJ2Nsb3NlZCcpKCgpID0+IHtcblx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSN3aW5kb3cub24oJ2Nsb3NlZCcpIC0gd2luZG93IElEICR7d2luZG93LmlkfWApO1xuXG5cdFx0XHQvLyB1cGRhdGUgd2luZG93IGNvdW50XG5cdFx0XHR0aGlzLndpbmRvd0NvdW50ZXItLTtcblxuXHRcdFx0Ly8gY2xlYXIgd2luZG93IGxpc3RlbmVyc1xuXHRcdFx0d2luZG93TGlzdGVuZXJzLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gaWYgdGhlcmUgYXJlIG5vIG1vcmUgY29kZSB3aW5kb3dzIG9wZW5lZCwgZmlyZSB0aGUgb25XaWxsU2h1dGRvd24gZXZlbnQsIHVubGVzc1xuXHRcdFx0Ly8gd2UgYXJlIG9uIG1hY09TIHdoZXJlIGl0IGlzIHBlcmZlY3RseSBmaW5lIHRvIGNsb3NlIHRoZSBsYXN0IHdpbmRvdyBhbmRcblx0XHRcdC8vIHRoZSBhcHBsaWNhdGlvbiBjb250aW51ZXMgcnVubmluZyAodW5sZXNzIHF1aXQgd2FzIGFjdHVhbGx5IHJlcXVlc3RlZClcblx0XHRcdGlmICh0aGlzLndpbmRvd0NvdW50ZXIgPT09IDAgJiYgKCFpc01hY2ludG9zaCB8fCB0aGlzLl9xdWl0UmVxdWVzdGVkKSkge1xuXHRcdFx0XHR0aGlzLmZpcmVPbldpbGxTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRyZWdpc3RlckF1eFdpbmRvdyhhdXhXaW5kb3c6IElBdXhpbGlhcnlXaW5kb3cpOiB2b2lkIHtcblx0XHRjb25zdCB3aW4gPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChhdXhXaW5kb3cud2luKTtcblxuXHRcdGNvbnN0IHdpbmRvd0xpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR3aW5kb3dMaXN0ZW5lcnMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPGVsZWN0cm9uLkV2ZW50Pih3aW4sICdjbG9zZScpKGUgPT4ge1xuXHRcdFx0dGhpcy50cmFjZShgTGlmZWN5Y2xlI2F1eFdpbmRvdy5vbignY2xvc2UnKSAtIHdpbmRvdyBJRCAke2F1eFdpbmRvdy5pZH1gKTtcblxuXHRcdFx0aWYgKHRoaXMuX3F1aXRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy50cmFjZShgTGlmZWN5Y2xlI2F1eFdpbmRvdy5vbignY2xvc2UnKSAtIHByZXZlbnREZWZhdWx0KCkgYmVjYXVzZSBxdWl0IHJlcXVlc3RlZGApO1xuXG5cdFx0XHRcdC8vIFdoZW4gcXVpdCBpcyByZXF1ZXN0ZWQsIEVsZWN0cm9uIHdpbGwgY2xvc2UgYWxsXG5cdFx0XHRcdC8vIGF1eGlsaWFyeSB3aW5kb3dzIGJlZm9yZSBjbG9zaW5nIHRoZSBtYWluIHdpbmRvd3MuXG5cdFx0XHRcdC8vIFRoaXMgcHJldmVudHMgdXMgZnJvbSBzdG9yaW5nIHRoZSBhdXhpbGlhcnkgd2luZG93XG5cdFx0XHRcdC8vIHN0YXRlIG9uIHNodXRkb3duIGFuZCB0aHVzIHdlIHByZXZlbnQgY2xvc2luZyBpZlxuXHRcdFx0XHQvLyBxdWl0IGlzIHJlcXVlc3RlZC5cblx0XHRcdFx0Ly9cblx0XHRcdFx0Ly8gSW50ZXJlc3RpbmdseSwgdGhpcyB3aWxsIG5vdCBwcmV2ZW50IHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0XHQvLyBmcm9tIHF1aXR0aW5nIGJlY2F1c2UgdGhlIGF1eGlsaWFyeSB3aW5kb3dzIHdpbGwgc3RpbGxcblx0XHRcdFx0Ly8gY2xvc2Ugb25jZSB0aGUgb3duaW5nIHdpbmRvdyBjbG9zZXMuXG5cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR3aW5kb3dMaXN0ZW5lcnMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPGVsZWN0cm9uLkV2ZW50Pih3aW4sICdjbG9zZWQnKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjYXV4V2luZG93Lm9uKCdjbG9zZWQnKSAtIHdpbmRvdyBJRCAke2F1eFdpbmRvdy5pZH1gKTtcblxuXHRcdFx0d2luZG93TGlzdGVuZXJzLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyByZWxvYWQod2luZG93OiBJQ29kZVdpbmRvdywgY2xpPzogTmF0aXZlUGFyc2VkQXJncyk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gT25seSByZWxvYWQgd2hlbiB0aGUgd2luZG93IGhhcyBub3QgdmV0b2VkIHRoaXNcblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy51bmxvYWQod2luZG93LCBVbmxvYWRSZWFzb24uUkVMT0FEKTtcblx0XHRpZiAoIXZldG8pIHtcblx0XHRcdHdpbmRvdy5yZWxvYWQoY2xpKTtcblx0XHR9XG5cdH1cblxuXHR1bmxvYWQod2luZG93OiBJQ29kZVdpbmRvdywgcmVhc29uOiBVbmxvYWRSZWFzb24pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz4ge1xuXG5cdFx0Ly8gRW5zdXJlIHRoZXJlIGlzIG9ubHkgMSB1bmxvYWQgcnVubmluZyBhdCB0aGUgc2FtZSB0aW1lXG5cdFx0Y29uc3QgcGVuZGluZ1VubG9hZFByb21pc2UgPSB0aGlzLm1hcFdpbmRvd0lkVG9QZW5kaW5nVW5sb2FkLmdldCh3aW5kb3cuaWQpO1xuXHRcdGlmIChwZW5kaW5nVW5sb2FkUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmdVbmxvYWRQcm9taXNlO1xuXHRcdH1cblxuXHRcdC8vIFN0YXJ0IHVubG9hZCBhbmQgcmVtZW1iZXIgaW4gbWFwIHVudGlsIGZpbmlzaGVkXG5cdFx0Y29uc3QgdW5sb2FkUHJvbWlzZSA9IHRoaXMuZG9VbmxvYWQod2luZG93LCByZWFzb24pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5tYXBXaW5kb3dJZFRvUGVuZGluZ1VubG9hZC5kZWxldGUod2luZG93LmlkKTtcblx0XHR9KTtcblx0XHR0aGlzLm1hcFdpbmRvd0lkVG9QZW5kaW5nVW5sb2FkLnNldCh3aW5kb3cuaWQsIHVubG9hZFByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHVubG9hZFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVW5sb2FkKHdpbmRvdzogSUNvZGVXaW5kb3csIHJlYXNvbjogVW5sb2FkUmVhc29uKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblxuXHRcdC8vIEFsd2F5cyBhbGxvdyB0byB1bmxvYWQgYSB3aW5kb3cgdGhhdCBpcyBub3QgeWV0IHJlYWR5XG5cdFx0aWYgKCF3aW5kb3cuaXNSZWFkeSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSN1bmxvYWQoKSAtIHdpbmRvdyBJRCAke3dpbmRvdy5pZH1gKTtcblxuXHRcdC8vIGZpcnN0IGFzayB0aGUgd2luZG93IGl0c2VsZiBpZiBpdCB2ZXRvcyB0aGUgdW5sb2FkXG5cdFx0Y29uc3Qgd2luZG93VW5sb2FkUmVhc29uID0gdGhpcy5fcXVpdFJlcXVlc3RlZCA/IFVubG9hZFJlYXNvbi5RVUlUIDogcmVhc29uO1xuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCB0aGlzLm9uQmVmb3JlVW5sb2FkV2luZG93SW5SZW5kZXJlcih3aW5kb3csIHdpbmRvd1VubG9hZFJlYXNvbik7XG5cdFx0aWYgKHZldG8pIHtcblx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSN1bmxvYWQoKSAtIHZldG8gaW4gcmVuZGVyZXIgKHdpbmRvdyBJRCAke3dpbmRvdy5pZH0pYCk7XG5cblx0XHRcdHJldHVybiB0aGlzLmhhbmRsZVdpbmRvd1VubG9hZFZldG8odmV0byk7XG5cdFx0fVxuXG5cdFx0Ly8gZmluYWxseSBpZiB0aGVyZSBhcmUgbm8gdmV0b3MsIHVubG9hZCB0aGUgcmVuZGVyZXJcblx0XHRhd2FpdCB0aGlzLm9uV2lsbFVubG9hZFdpbmRvd0luUmVuZGVyZXIod2luZG93LCB3aW5kb3dVbmxvYWRSZWFzb24pO1xuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVXaW5kb3dVbmxvYWRWZXRvKHZldG86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoIXZldG8pIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm8gdmV0b1xuXHRcdH1cblxuXHRcdC8vIGEgdmV0byByZXNvbHZlcyBhbnkgcGVuZGluZyBxdWl0IHdpdGggdmV0b1xuXHRcdHRoaXMucmVzb2x2ZVBlbmRpbmdRdWl0UHJvbWlzZSh0cnVlIC8qIHZldG8gKi8pO1xuXG5cdFx0Ly8gYSB2ZXRvIHJlc2V0cyB0aGUgcGVuZGluZyBxdWl0IHJlcXVlc3QgZmxhZ1xuXHRcdHRoaXMuX3F1aXRSZXF1ZXN0ZWQgPSBmYWxzZTtcblxuXHRcdHJldHVybiB0cnVlOyAvLyB2ZXRvXG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVQZW5kaW5nUXVpdFByb21pc2UodmV0bzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZVJlc29sdmUpIHtcblx0XHRcdHRoaXMucGVuZGluZ1F1aXRQcm9taXNlUmVzb2x2ZSh2ZXRvKTtcblx0XHRcdHRoaXMucGVuZGluZ1F1aXRQcm9taXNlUmVzb2x2ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucGVuZGluZ1F1aXRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25CZWZvcmVVbmxvYWRXaW5kb3dJblJlbmRlcmVyKHdpbmRvdzogSUNvZGVXaW5kb3csIHJlYXNvbjogVW5sb2FkUmVhc29uKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBvbmVUaW1lRXZlbnRUb2tlbiA9IHRoaXMub25lVGltZUxpc3RlbmVyVG9rZW5HZW5lcmF0b3IrKztcblx0XHRcdGNvbnN0IG9rQ2hhbm5lbCA9IGB2c2NvZGU6b2ske29uZVRpbWVFdmVudFRva2VufWA7XG5cdFx0XHRjb25zdCBjYW5jZWxDaGFubmVsID0gYHZzY29kZTpjYW5jZWwke29uZVRpbWVFdmVudFRva2VufWA7XG5cblx0XHRcdGNvbnN0IGNsZWFudXAgPSAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0dmFsaWRhdGVkSXBjTWFpbi5yZW1vdmVMaXN0ZW5lcihva0NoYW5uZWwsIG9rTGlzdGVuZXIpO1xuXHRcdFx0XHR2YWxpZGF0ZWRJcGNNYWluLnJlbW92ZUxpc3RlbmVyKGNhbmNlbENoYW5uZWwsIGNhbmNlbExpc3RlbmVyKTtcblx0XHRcdFx0cmVzb2x2ZSh2YWx1ZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBva0xpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKGZhbHNlKTsgLy8gbm8gdmV0b1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY2FuY2VsTGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHRcdGNsZWFudXAodHJ1ZSk7IC8vIHZldG9cblx0XHRcdH07XG5cblx0XHRcdHZhbGlkYXRlZElwY01haW4ub24ob2tDaGFubmVsLCBva0xpc3RlbmVyKTtcblx0XHRcdHZhbGlkYXRlZElwY01haW4ub24oY2FuY2VsQ2hhbm5lbCwgY2FuY2VsTGlzdGVuZXIpO1xuXG5cdFx0XHR3aW5kb3cuc2VuZCgndnNjb2RlOm9uQmVmb3JlVW5sb2FkJywgeyBva0NoYW5uZWwsIGNhbmNlbENoYW5uZWwsIHJlYXNvbiB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25XaWxsVW5sb2FkV2luZG93SW5SZW5kZXJlcih3aW5kb3c6IElDb2RlV2luZG93LCByZWFzb246IFVubG9hZFJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IG9uZVRpbWVFdmVudFRva2VuID0gdGhpcy5vbmVUaW1lTGlzdGVuZXJUb2tlbkdlbmVyYXRvcisrO1xuXHRcdFx0Y29uc3QgcmVwbHlDaGFubmVsID0gYHZzY29kZTpyZXBseSR7b25lVGltZUV2ZW50VG9rZW59YDtcblxuXHRcdFx0dmFsaWRhdGVkSXBjTWFpbi5vbmNlKHJlcGx5Q2hhbm5lbCwgKCkgPT4gcmVzb2x2ZSgpKTtcblxuXHRcdFx0d2luZG93LnNlbmQoJ3ZzY29kZTpvbldpbGxVbmxvYWQnLCB7IHJlcGx5Q2hhbm5lbCwgcmVhc29uIH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cXVpdCh3aWxsUmVzdGFydD86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz4ge1xuXHRcdHJldHVybiB0aGlzLmRvUXVpdCh3aWxsUmVzdGFydCkudGhlbih2ZXRvID0+IHtcblx0XHRcdGlmICghdmV0byAmJiB3aWxsUmVzdGFydCkge1xuXHRcdFx0XHQvLyBXaW5kb3dzOiB3ZSBhcmUgYWJvdXQgdG8gcmVzdGFydCBhbmQgYXMgc3VjaCB3ZSBuZWVkIHRvIHJlc3RvcmUgdGhlIG9yaWdpbmFsXG5cdFx0XHRcdC8vIGN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnkgd2UgaGFkIG9uIHN0YXJ0dXAgdG8gZ2V0IHRoZSBleGFjdCBzYW1lIHN0YXJ0dXBcblx0XHRcdFx0Ly8gYmVoYXZpb3VyLiBBcyBzdWNoLCB3ZSBicmllZmx5IGNoYW5nZSBiYWNrIHRvIHRoYXQgZGlyZWN0b3J5IGFuZCB0aGVuIHdoZW5cblx0XHRcdFx0Ly8gQ29kZSBzdGFydHMgaXQgd2lsbCBzZXQgaXQgYmFjayB0byB0aGUgaW5zdGFsbGF0aW9uIGRpcmVjdG9yeSBhZ2Fpbi5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50V29ya2luZ0RpciA9IGN3ZCgpO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRXb3JraW5nRGlyICE9PSBwcm9jZXNzLmN3ZCgpKSB7XG5cdFx0XHRcdFx0XHRcdHByb2Nlc3MuY2hkaXIoY3VycmVudFdvcmtpbmdEaXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZldG87XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUXVpdCh3aWxsUmVzdGFydD86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz4ge1xuXHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSNxdWl0KCkgLSBiZWdpbiAod2lsbFJlc3RhcnQ6ICR7d2lsbFJlc3RhcnR9KWApO1xuXG5cdFx0aWYgKHRoaXMucGVuZGluZ1F1aXRQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjcXVpdCgpIC0gcmV0dXJuaW5nIHBlbmRpbmcgcXVpdCBwcm9taXNlJyk7XG5cblx0XHRcdHJldHVybiB0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZTtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBpZiB3ZSBhcmUgYWJvdXQgdG8gcmVzdGFydFxuXHRcdGlmICh3aWxsUmVzdGFydCkge1xuXHRcdFx0dGhpcy5zdGF0ZVNlcnZpY2Uuc2V0SXRlbShMaWZlY3ljbGVNYWluU2VydmljZS5RVUlUX0FORF9SRVNUQVJUX0tFWSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wZW5kaW5nUXVpdFByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblxuXHRcdFx0Ly8gU3RvcmUgYXMgZmllbGQgdG8gYWNjZXNzIGl0IGZyb20gYSB3aW5kb3cgY2FuY2VsbGF0aW9uXG5cdFx0XHR0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZVJlc29sdmUgPSByZXNvbHZlO1xuXG5cdFx0XHQvLyBDYWxsaW5nIGFwcC5xdWl0KCkgd2lsbCB0cmlnZ2VyIHRoZSBjbG9zZSBoYW5kbGVycyBvZiBlYWNoIG9wZW5lZCB3aW5kb3dcblx0XHRcdC8vIGFuZCBvbmx5IGlmIG5vIHdpbmRvdyB2ZXRvZWQgdGhlIHNodXRkb3duLCB3ZSB3aWxsIGdldCB0aGUgd2lsbC1xdWl0IGV2ZW50XG5cdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjcXVpdCgpIC0gY2FsbGluZyBhcHAucXVpdCgpJyk7XG5cdFx0XHRlbGVjdHJvbi5hcHAucXVpdCgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMucGVuZGluZ1F1aXRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFjZShtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50TWFpblNlcnZpY2UuYXJnc1snZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJ10pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKG1zZyk7IC8vIGhlbHBzIGRpYWdub3NlIGlzc3VlcyB3aXRoIGV4aXRpbmcgZnJvbSBzbW9rZSB0ZXN0c1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UobXNnKTtcblx0XHR9XG5cdH1cblxuXHRzZXRSZWxhdW5jaEhhbmRsZXIoaGFuZGxlcjogSVJlbGF1bmNoSGFuZGxlcik6IHZvaWQge1xuXHRcdHRoaXMucmVsYXVuY2hIYW5kbGVyID0gaGFuZGxlcjtcblx0fVxuXG5cdGFzeW5jIHJlbGF1bmNoKG9wdGlvbnM/OiBJUmVsYXVuY2hPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI3JlbGF1bmNoKCknKTtcblxuXHRcdGNvbnN0IGFyZ3MgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMSk7XG5cdFx0aWYgKG9wdGlvbnM/LmFkZEFyZ3MpIHtcblx0XHRcdGFyZ3MucHVzaCguLi5vcHRpb25zLmFkZEFyZ3MpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy5yZW1vdmVBcmdzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGEgb2Ygb3B0aW9ucy5yZW1vdmVBcmdzKSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGFyZ3MuaW5kZXhPZihhKTtcblx0XHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdFx0YXJncy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHF1aXRMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5yZWxhdW5jaEhhbmRsZXI/LmhhbmRsZVJlbGF1bmNoKG9wdGlvbnMpKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNyZWxhdW5jaCgpIC0gY2FsbGluZyBhcHAucmVsYXVuY2goKScpO1xuXHRcdFx0XHRlbGVjdHJvbi5hcHAucmVsYXVuY2goeyBhcmdzIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZWxlY3Ryb24uYXBwLm9uY2UoJ3F1aXQnLCBxdWl0TGlzdGVuZXIpO1xuXG5cdFx0Ly8gYGFwcC5yZWxhdW5jaCgpYCBkb2VzIG5vdCBxdWl0IGF1dG9tYXRpY2FsbHksIHNvIHdlIHF1aXQgZmlyc3QsXG5cdFx0Ly8gY2hlY2sgZm9yIHZldG9lcyBhbmQgdGhlbiByZWxhdW5jaCBmcm9tIHRoZSBgYXBwLm9uKCdxdWl0JylgIGV2ZW50XG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMucXVpdCh0cnVlIC8qIHdpbGwgcmVzdGFydCAqLyk7XG5cdFx0aWYgKHZldG8pIHtcblx0XHRcdGVsZWN0cm9uLmFwcC5yZW1vdmVMaXN0ZW5lcigncXVpdCcsIHF1aXRMaXN0ZW5lcik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMga2lsbChjb2RlPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI2tpbGwoKScpO1xuXG5cdFx0Ly8gR2l2ZSBtYWluIHByb2Nlc3MgcGFydGljaXBhbnRzIGEgY2hhbmNlIHRvIG9yZGVybHkgc2h1dGRvd25cblx0XHRhd2FpdCB0aGlzLmZpcmVPbldpbGxTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5LSUxMKTtcblxuXHRcdC8vIEZyb20gZXh0ZW5zaW9uIHRlc3RzIHdlIGhhdmUgc2VlbiBpc3N1ZXMgd2hlcmUgY2FsbGluZyBhcHAuZXhpdCgpXG5cdFx0Ly8gd2l0aCBhbiBvcGVuZWQgd2luZG93IGNhbiBsZWFkIHRvIG5hdGl2ZSBjcmFzaGVzIChMaW51eCkuIEFzIHN1Y2gsXG5cdFx0Ly8gd2Ugc2hvdWxkIG1ha2Ugc3VyZSB0byBkZXN0cm95IGFueSBvcGVuZWQgd2luZG93IGJlZm9yZSBjYWxsaW5nXG5cdFx0Ly8gYGFwcC5leGl0KClgLlxuXHRcdC8vXG5cdFx0Ly8gTm90ZTogRWxlY3Ryb24gaW1wbGVtZW50cyBhIHNpbWlsYXIgbG9naWMgaGVyZTpcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vYmxvYi9mZTUzMThkNzUzNjM3YzM5MDNlMjNmYzFlZDFiMjYzMDI1ODg3YjZhL3NwZWMtbWFpbi93aW5kb3ctaGVscGVycy50cyNMNVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblxuXHRcdFx0Ly8gU3RpbGwgZG8gbm90IGJsb2NrIG1vcmUgdGhhbiAxc1xuXHRcdFx0dGltZW91dCgxMDAwKSxcblxuXHRcdFx0Ly8gRGVzdHJveSBhbnkgb3BlbmVkIHdpbmRvdzogd2UgZG8gbm90IHVubG9hZCB3aW5kb3dzIGhlcmUgYmVjYXVzZVxuXHRcdFx0Ly8gdGhlcmUgaXMgYSBjaGFuY2UgdGhhdCB0aGUgdW5sb2FkIGlzIHZldG8nZCBvciBsb25nIHJ1bm5pbmcgZHVlXG5cdFx0XHQvLyB0byBhIHBhcnRpY2lwYW50IHdpdGhpbiB0aGUgd2luZG93LiB0aGlzIGlzIG5vdCB3YW50ZWQgd2hlbiB3ZVxuXHRcdFx0Ly8gYXJlIGFza2VkIHRvIGtpbGwgdGhlIGFwcGxpY2F0aW9uLlxuXHRcdFx0KGFzeW5jICgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB3aW5kb3cgb2YgZ2V0QWxsV2luZG93c0V4Y2x1ZGluZ09mZnNjcmVlbigpKSB7XG5cdFx0XHRcdFx0aWYgKHdpbmRvdyAmJiAhd2luZG93LmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdFx0XHRcdGxldCB3aGVuV2luZG93Q2xvc2VkOiBQcm9taXNlPHZvaWQ+O1xuXHRcdFx0XHRcdFx0aWYgKHdpbmRvdy53ZWJDb250ZW50cyAmJiAhd2luZG93LndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdFx0XHRcdFx0d2hlbldpbmRvd0Nsb3NlZCA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gd2luZG93Lm9uY2UoJ2Nsb3NlZCcsIHJlc29sdmUpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHdoZW5XaW5kb3dDbG9zZWQgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0d2luZG93LmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdGF3YWl0IHdoZW5XaW5kb3dDbG9zZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSgpXG5cdFx0XSk7XG5cblx0XHQvLyBOb3cgZXhpdCBlaXRoZXIgYWZ0ZXIgMXMgb3IgYWxsIHdpbmRvd3MgZGVzdHJveWVkXG5cdFx0ZWxlY3Ryb24uYXBwLmV4aXQoY29kZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxVQUFVLGVBQWU7QUFDM0MsU0FBUyxTQUFTLGFB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QUFBQSxFQUVBLE1BQU0sU0FBUyxTQUEyQztBQUN6RCxTQUFLLE1BQU0sc0JBQXNCO0FBRWpDLFVBQU0sT0FBTyxRQUFRLEtBQUssTUFBTSxDQUFDO0FBQ2pDLFFBQUksU0FBUyxTQUFTO0FBQ3JCLFdBQUssS0FBSyxHQUFHLFFBQVEsT0FBTztBQUFBLElBQzdCO0FBRUEsUUFBSSxTQUFTLFlBQVk7QUFDeEIsaUJBQVcsS0FBSyxRQUFRLFlBQVk7QUFDbkMsY0FBTSxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQzFCLFlBQUksT0FBTyxHQUFHO0FBQ2IsZUFBSyxPQUFPLEtBQUssQ0FBQztBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsTUFBTTtBQUMxQixVQUFJLENBQUMsS0FBSyxpQkFBaUIsZUFBZSxPQUFPLEdBQUc7QUFDbkQsYUFBSyxNQUFNLCtDQUErQztBQUMxRCxpQkFBUyxJQUFJLFNBQVMsRUFBRSxLQUFLLENBQUM7QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFDQSxhQUFTLElBQUksS0FBSyxRQUFRLFlBQVk7QUFJdEMsVUFBTSxPQUFPLE1BQU0sS0FBSztBQUFBLE1BQUs7QUFBQTtBQUFBLElBQXVCO0FBQ3BELFFBQUksTUFBTTtBQUNULGVBQVMsSUFBSSxlQUFlLFFBQVEsWUFBWTtBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxLQUFLLE1BQThCO0FBQ3hDLFNBQUssTUFBTSxrQkFBa0I7QUFHN0IsVUFBTSxLQUFLLG1CQUFtQixZQUFtQjtBQVVqRCxVQUFNLFFBQVEsS0FBSztBQUFBO0FBQUEsTUFHbEIsUUFBUSxHQUFJO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxPQU1YLFlBQVk7QUFDWixtQkFBVyxVQUFVLGdDQUFnQyxHQUFHO0FBQ3ZELGNBQUksVUFBVSxDQUFDLE9BQU8sWUFBWSxHQUFHO0FBQ3BDLGdCQUFJO0FBQ0osZ0JBQUksT0FBTyxlQUFlLENBQUMsT0FBTyxZQUFZLFlBQVksR0FBRztBQUM1RCxpQ0FBbUIsSUFBSSxRQUFRLGFBQVcsT0FBTyxLQUFLLFVBQVUsT0FBTyxDQUFDO0FBQUEsWUFDekUsT0FBTztBQUNOLGlDQUFtQixRQUFRLFFBQVE7QUFBQSxZQUNwQztBQUVBLG1CQUFPLFFBQVE7QUFDZixrQkFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNEO0FBQUEsTUFDRCxHQUFHO0FBQUEsSUFDSixDQUFDO0FBR0QsYUFBUyxJQUFJLEtBQUssSUFBSTtBQUFBLEVBQ3ZCO0FBQ0Q7QUFoaUJhLHFCQUlZLHVCQUF1QjtBQUpuQyx1QkFBTjtBQUFBLEVBMkNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTdDVTsiLAogICJuYW1lcyI6IFsiU2h1dGRvd25SZWFzb24iLCAiTGlmZWN5Y2xlTWFpblBoYXNlIl0KfQo=
