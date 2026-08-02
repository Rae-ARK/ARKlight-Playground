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
import { fork } from "child_process";
import { Limiter } from "../../../base/common/async.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { join } from "../../../base/common/path.js";
import { Promises } from "../../../base/node/pfs.js";
import { ILogService } from "../../log/common/log.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
let ExtensionsLifecycle = class extends Disposable {
  // Run max 5 processes in parallel
  constructor(userDataProfilesService, logService) {
    super();
    this.userDataProfilesService = userDataProfilesService;
    this.logService = logService;
    this.processesLimiter = new Limiter(5);
  }
  async postUninstall(extension) {
    const script = this.parseScript(extension, "uninstall");
    if (script) {
      this.logService.info(extension.identifier.id, extension.manifest.version, `Running post uninstall script`);
      await this.processesLimiter.queue(async () => {
        try {
          await this.runLifecycleHook(script.script, "uninstall", script.args, true, extension);
          this.logService.info(`Finished running post uninstall script`, extension.identifier.id, extension.manifest.version);
        } catch (error) {
          this.logService.error("Failed to run post uninstall script", extension.identifier.id, extension.manifest.version);
          this.logService.error(error);
        }
      });
    }
    try {
      await Promises.rm(this.getExtensionStoragePath(extension));
    } catch (error) {
      this.logService.error("Error while removing extension storage path", extension.identifier.id);
      this.logService.error(error);
    }
  }
  parseScript(extension, type) {
    const scriptKey = `vscode:${type}`;
    if (extension.location.scheme === Schemas.file && extension.manifest && extension.manifest["scripts"] && typeof extension.manifest["scripts"][scriptKey] === "string") {
      const script = extension.manifest["scripts"][scriptKey].split(" ");
      if (script.length < 2 || script[0] !== "node" || !script[1]) {
        this.logService.warn(extension.identifier.id, extension.manifest.version, `${scriptKey} should be a node script`);
        return null;
      }
      return { script: join(extension.location.fsPath, script[1]), args: script.slice(2) || [] };
    }
    return null;
  }
  runLifecycleHook(lifecycleHook, lifecycleType, args, timeout, extension) {
    return new Promise((c, e) => {
      const extensionLifecycleProcess = this.start(lifecycleHook, lifecycleType, args, extension);
      let timeoutHandler;
      const onexit = (error) => {
        if (timeoutHandler) {
          clearTimeout(timeoutHandler);
          timeoutHandler = null;
        }
        if (error) {
          e(error);
        } else {
          c(void 0);
        }
      };
      extensionLifecycleProcess.on("error", (err) => {
        onexit(toErrorMessage(err) || "Unknown");
      });
      extensionLifecycleProcess.on("exit", (code, signal) => {
        onexit(code ? `post-${lifecycleType} process exited with code ${code}` : void 0);
      });
      if (timeout) {
        timeoutHandler = setTimeout(() => {
          timeoutHandler = null;
          extensionLifecycleProcess.kill();
          e("timed out");
        }, 5e3);
      }
    });
  }
  start(uninstallHook, lifecycleType, args, extension) {
    const opts = {
      silent: true,
      execArgv: void 0
    };
    const extensionUninstallProcess = fork(uninstallHook, [`--type=extension-post-${lifecycleType}`, ...args], opts);
    extensionUninstallProcess.stdout.setEncoding("utf8");
    extensionUninstallProcess.stderr.setEncoding("utf8");
    const onStdout = Event.fromNodeEventEmitter(extensionUninstallProcess.stdout, "data");
    const onStderr = Event.fromNodeEventEmitter(extensionUninstallProcess.stderr, "data");
    this._register(onStdout((data) => this.logService.info(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
    this._register(onStderr((data) => this.logService.error(extension.identifier.id, extension.manifest.version, `post-${lifecycleType}`, data)));
    const onOutput = Event.any(
      Event.map(onStdout, (o) => ({ data: `%c${o}`, format: [""] }), this._store),
      Event.map(onStderr, (o) => ({ data: `%c${o}`, format: ["color: red"] }), this._store)
    );
    const onDebouncedOutput = Event.debounce(onOutput, (r, o) => {
      return r ? { data: r.data + o.data, format: [...r.format, ...o.format] } : { data: o.data, format: o.format };
    }, 100, void 0, void 0, void 0, this._store);
    onDebouncedOutput((data) => {
      console.group(extension.identifier.id);
      console.log(data.data, ...data.format);
      console.groupEnd();
    });
    return extensionUninstallProcess;
  }
  getExtensionStoragePath(extension) {
    return join(this.userDataProfilesService.defaultProfile.globalStorageHome.fsPath, extension.identifier.id.toLowerCase());
  }
};
ExtensionsLifecycle = __decorateClass([
  __decorateParam(0, IUserDataProfilesService),
  __decorateParam(1, ILogService)
], ExtensionsLifecycle);
export {
  ExtensionsLifecycle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25MaWZlY3ljbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3MsIGZvcmsgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IExpbWl0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElMb2NhbEV4dGVuc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uc0xpZmVjeWNsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcHJvY2Vzc2VzTGltaXRlcjogTGltaXRlcjx2b2lkPiA9IG5ldyBMaW1pdGVyKDUpOyAvLyBSdW4gbWF4IDUgcHJvY2Vzc2VzIGluIHBhcmFsbGVsXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHBvc3RVbmluc3RhbGwoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzY3JpcHQgPSB0aGlzLnBhcnNlU2NyaXB0KGV4dGVuc2lvbiwgJ3VuaW5zdGFsbCcpO1xuXHRcdGlmIChzY3JpcHQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgYFJ1bm5pbmcgcG9zdCB1bmluc3RhbGwgc2NyaXB0YCk7XG5cdFx0XHRhd2FpdCB0aGlzLnByb2Nlc3Nlc0xpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucnVuTGlmZWN5Y2xlSG9vayhzY3JpcHQuc2NyaXB0LCAndW5pbnN0YWxsJywgc2NyaXB0LmFyZ3MsIHRydWUsIGV4dGVuc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYEZpbmlzaGVkIHJ1bm5pbmcgcG9zdCB1bmluc3RhbGwgc2NyaXB0YCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBydW4gcG9zdCB1bmluc3RhbGwgc2NyaXB0JywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnJtKHRoaXMuZ2V0RXh0ZW5zaW9uU3RvcmFnZVBhdGgoZXh0ZW5zaW9uKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igd2hpbGUgcmVtb3ZpbmcgZXh0ZW5zaW9uIHN0b3JhZ2UgcGF0aCcsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZVNjcmlwdChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgdHlwZTogc3RyaW5nKTogeyBzY3JpcHQ6IHN0cmluZzsgYXJnczogc3RyaW5nW10gfSB8IG51bGwge1xuXHRcdGNvbnN0IHNjcmlwdEtleSA9IGB2c2NvZGU6JHt0eXBlfWA7XG5cdFx0aWYgKGV4dGVuc2lvbi5sb2NhdGlvbi5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBleHRlbnNpb24ubWFuaWZlc3QgJiYgZXh0ZW5zaW9uLm1hbmlmZXN0WydzY3JpcHRzJ10gJiYgdHlwZW9mIGV4dGVuc2lvbi5tYW5pZmVzdFsnc2NyaXB0cyddW3NjcmlwdEtleV0gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBzY3JpcHQgPSAoZXh0ZW5zaW9uLm1hbmlmZXN0WydzY3JpcHRzJ11bc2NyaXB0S2V5XSkuc3BsaXQoJyAnKTtcblx0XHRcdGlmIChzY3JpcHQubGVuZ3RoIDwgMiB8fCBzY3JpcHRbMF0gIT09ICdub2RlJyB8fCAhc2NyaXB0WzFdKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgYCR7c2NyaXB0S2V5fSBzaG91bGQgYmUgYSBub2RlIHNjcmlwdGApO1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHNjcmlwdDogam9pbihleHRlbnNpb24ubG9jYXRpb24uZnNQYXRoLCBzY3JpcHRbMV0pLCBhcmdzOiBzY3JpcHQuc2xpY2UoMikgfHwgW10gfTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHJ1bkxpZmVjeWNsZUhvb2sobGlmZWN5Y2xlSG9vazogc3RyaW5nLCBsaWZlY3ljbGVUeXBlOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCB0aW1lb3V0OiBib29sZWFuLCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXG5cdFx0XHRjb25zdCBleHRlbnNpb25MaWZlY3ljbGVQcm9jZXNzID0gdGhpcy5zdGFydChsaWZlY3ljbGVIb29rLCBsaWZlY3ljbGVUeXBlLCBhcmdzLCBleHRlbnNpb24pO1xuXHRcdFx0bGV0IHRpbWVvdXRIYW5kbGVyOiBUaW1lb3V0IHwgbnVsbDtcblxuXHRcdFx0Y29uc3Qgb25leGl0ID0gKGVycm9yPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICh0aW1lb3V0SGFuZGxlcikge1xuXHRcdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlcik7XG5cdFx0XHRcdFx0dGltZW91dEhhbmRsZXIgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGModW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gb24gZXJyb3Jcblx0XHRcdGV4dGVuc2lvbkxpZmVjeWNsZVByb2Nlc3Mub24oJ2Vycm9yJywgKGVycikgPT4ge1xuXHRcdFx0XHRvbmV4aXQodG9FcnJvck1lc3NhZ2UoZXJyKSB8fCAnVW5rbm93bicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIG9uIGV4aXRcblx0XHRcdGV4dGVuc2lvbkxpZmVjeWNsZVByb2Nlc3Mub24oJ2V4aXQnLCAoY29kZTogbnVtYmVyLCBzaWduYWw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRvbmV4aXQoY29kZSA/IGBwb3N0LSR7bGlmZWN5Y2xlVHlwZX0gcHJvY2VzcyBleGl0ZWQgd2l0aCBjb2RlICR7Y29kZX1gIDogdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGltZW91dCkge1xuXHRcdFx0XHQvLyB0aW1lb3V0OiBraWxsIHByb2Nlc3MgYWZ0ZXIgd2FpdGluZyBmb3IgNXNcblx0XHRcdFx0dGltZW91dEhhbmRsZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aW1lb3V0SGFuZGxlciA9IG51bGw7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uTGlmZWN5Y2xlUHJvY2Vzcy5raWxsKCk7XG5cdFx0XHRcdFx0ZSgndGltZWQgb3V0Jyk7XG5cdFx0XHRcdH0sIDUwMDApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydCh1bmluc3RhbGxIb29rOiBzdHJpbmcsIGxpZmVjeWNsZVR5cGU6IHN0cmluZywgYXJnczogc3RyaW5nW10sIGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogQ2hpbGRQcm9jZXNzIHtcblx0XHRjb25zdCBvcHRzID0ge1xuXHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0ZXhlY0FyZ3Y6IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVW5pbnN0YWxsUHJvY2VzcyA9IGZvcmsodW5pbnN0YWxsSG9vaywgW2AtLXR5cGU9ZXh0ZW5zaW9uLXBvc3QtJHtsaWZlY3ljbGVUeXBlfWAsIC4uLmFyZ3NdLCBvcHRzKTtcblxuXHRcdC8vIENhdGNoIGFsbCBvdXRwdXQgY29taW5nIGZyb20gdGhlIHByb2Nlc3Ncblx0XHR0eXBlIE91dHB1dCA9IHsgZGF0YTogc3RyaW5nOyBmb3JtYXQ6IHN0cmluZ1tdIH07XG5cdFx0ZXh0ZW5zaW9uVW5pbnN0YWxsUHJvY2Vzcy5zdGRvdXQhLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cdFx0ZXh0ZW5zaW9uVW5pbnN0YWxsUHJvY2Vzcy5zdGRlcnIhLnNldEVuY29kaW5nKCd1dGY4Jyk7XG5cblx0XHRjb25zdCBvblN0ZG91dCA9IEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPHN0cmluZz4oZXh0ZW5zaW9uVW5pbnN0YWxsUHJvY2Vzcy5zdGRvdXQhLCAnZGF0YScpO1xuXHRcdGNvbnN0IG9uU3RkZXJyID0gRXZlbnQuZnJvbU5vZGVFdmVudEVtaXR0ZXI8c3RyaW5nPihleHRlbnNpb25Vbmluc3RhbGxQcm9jZXNzLnN0ZGVyciEsICdkYXRhJyk7XG5cblx0XHQvLyBMb2cgb3V0cHV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25TdGRvdXQoZGF0YSA9PiB0aGlzLmxvZ1NlcnZpY2UuaW5mbyhleHRlbnNpb24uaWRlbnRpZmllci5pZCwgZXh0ZW5zaW9uLm1hbmlmZXN0LnZlcnNpb24sIGBwb3N0LSR7bGlmZWN5Y2xlVHlwZX1gLCBkYXRhKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uU3RkZXJyKGRhdGEgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24ubWFuaWZlc3QudmVyc2lvbiwgYHBvc3QtJHtsaWZlY3ljbGVUeXBlfWAsIGRhdGEpKSk7XG5cblx0XHRjb25zdCBvbk91dHB1dCA9IEV2ZW50LmFueShcblx0XHRcdEV2ZW50Lm1hcChvblN0ZG91dCwgbyA9PiAoeyBkYXRhOiBgJWMke299YCwgZm9ybWF0OiBbJyddIH0pLCB0aGlzLl9zdG9yZSksXG5cdFx0XHRFdmVudC5tYXAob25TdGRlcnIsIG8gPT4gKHsgZGF0YTogYCVjJHtvfWAsIGZvcm1hdDogWydjb2xvcjogcmVkJ10gfSksIHRoaXMuX3N0b3JlKVxuXHRcdCk7XG5cdFx0Ly8gRGVib3VuY2UgYWxsIG91dHB1dCwgc28gd2UgY2FuIHJlbmRlciBpdCBpbiB0aGUgQ2hyb21lIGNvbnNvbGUgYXMgYSBncm91cFxuXHRcdGNvbnN0IG9uRGVib3VuY2VkT3V0cHV0ID0gRXZlbnQuZGVib3VuY2U8T3V0cHV0Pihvbk91dHB1dCwgKHIsIG8pID0+IHtcblx0XHRcdHJldHVybiByXG5cdFx0XHRcdD8geyBkYXRhOiByLmRhdGEgKyBvLmRhdGEsIGZvcm1hdDogWy4uLnIuZm9ybWF0LCAuLi5vLmZvcm1hdF0gfVxuXHRcdFx0XHQ6IHsgZGF0YTogby5kYXRhLCBmb3JtYXQ6IG8uZm9ybWF0IH07XG5cdFx0fSwgMTAwLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cblx0XHQvLyBQcmludCBvdXQgb3V0cHV0XG5cdFx0b25EZWJvdW5jZWRPdXRwdXQoZGF0YSA9PiB7XG5cdFx0XHRjb25zb2xlLmdyb3VwKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRcdGNvbnNvbGUubG9nKGRhdGEuZGF0YSwgLi4uZGF0YS5mb3JtYXQpO1xuXHRcdFx0Y29uc29sZS5ncm91cEVuZCgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGV4dGVuc2lvblVuaW5zdGFsbFByb2Nlc3M7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvblN0b3JhZ2VQYXRoKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gam9pbih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLmZzUGF0aCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBdUIsWUFBWTtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFFbEMsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUE7QUFBQSxFQUluRCxZQUNtQyx5QkFDSixZQUM3QjtBQUNELFVBQU07QUFINEI7QUFDSjtBQUovQixTQUFRLG1CQUFrQyxJQUFJLFFBQVEsQ0FBQztBQUFBLEVBT3ZEO0FBQUEsRUFFQSxNQUFNLGNBQWMsV0FBMkM7QUFDOUQsVUFBTSxTQUFTLEtBQUssWUFBWSxXQUFXLFdBQVc7QUFDdEQsUUFBSSxRQUFRO0FBQ1gsV0FBSyxXQUFXLEtBQUssVUFBVSxXQUFXLElBQUksVUFBVSxTQUFTLFNBQVMsK0JBQStCO0FBQ3pHLFlBQU0sS0FBSyxpQkFBaUIsTUFBTSxZQUFZO0FB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
