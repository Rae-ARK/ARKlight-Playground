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
import { Promises } from "../../../base/common/async.js";
import { canceled } from "../../../base/common/errors.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { extensionHostGraceTimeMs } from "../common/extensionHostStarter.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { WindowUtilityProcess } from "../../utilityProcess/electron-main/utilityProcess.js";
import { IWindowsMainService } from "../../windows/electron-main/windows.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
let ExtensionHostStarter = class extends Disposable {
  constructor(_logService, _lifecycleMainService, _windowsMainService, _telemetryService, _configurationService) {
    super();
    this._logService = _logService;
    this._lifecycleMainService = _lifecycleMainService;
    this._windowsMainService = _windowsMainService;
    this._telemetryService = _telemetryService;
    this._configurationService = _configurationService;
    this._extHosts = /* @__PURE__ */ new Map();
    this._shutdown = false;
    this._register(this._lifecycleMainService.onWillShutdown((e) => {
      this._shutdown = true;
      e.join("extHostStarter", this._waitForAllExit(6e3));
    }));
  }
  dispose() {
    super.dispose();
  }
  _getExtHost(id) {
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      throw new Error(`Unknown extension host!`);
    }
    return extHostProcess;
  }
  onDynamicStdout(id) {
    return this._getExtHost(id).onStdout;
  }
  onDynamicStderr(id) {
    return this._getExtHost(id).onStderr;
  }
  onDynamicMessage(id) {
    return this._getExtHost(id).onMessage;
  }
  onDynamicExit(id) {
    return this._getExtHost(id).onExit;
  }
  async createExtensionHost() {
    if (this._shutdown) {
      throw canceled();
    }
    const id = String(++ExtensionHostStarter._lastId);
    const extHost = new WindowUtilityProcess(this._logService, this._windowsMainService, this._telemetryService, this._lifecycleMainService);
    this._extHosts.set(id, extHost);
    const disposable = extHost.onExit(({ pid, code, signal }) => {
      disposable.dispose();
      this._logService.info(`Extension host with pid ${pid} exited with code: ${code}, signal: ${signal}.`);
      setTimeout(() => {
        extHost.dispose();
        this._extHosts.delete(id);
      });
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          this._logService.error(`Extension host with pid ${pid} still exists, forcefully killing it...`);
          process.kill(pid);
        } catch (er) {
        }
      }, 1e3);
    });
    return { id };
  }
  async start(id, opts) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHost = this._getExtHost(id);
    const args = ["--skipWorkspaceStorageLock"];
    if (this._configurationService.getValue("extensions.supportNodeGlobalNavigator")) {
      args.push("--supportGlobalNavigator");
    }
    extHost.start({
      ...opts,
      type: "extensionHost",
      name: "extension-host",
      entryPoint: "vs/workbench/api/node/extensionHostProcess",
      args,
      execArgv: opts.execArgv,
      allowLoadingUnsignedLibraries: true,
      respondToAuthRequestsFromMainProcess: true,
      windowLifecycleBound: true,
      windowLifecycleGraceTime: extensionHostGraceTimeMs,
      correlationId: id
    });
    const pid = await Event.toPromise(extHost.onSpawn);
    return { pid };
  }
  async enableInspectPort(id) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return false;
    }
    return extHostProcess.enableInspectPort();
  }
  async kill(id) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return;
    }
    extHostProcess.kill();
  }
  async waitForExit(id, maxWaitTimeMs) {
    if (this._shutdown) {
      throw canceled();
    }
    const extHostProcess = this._extHosts.get(id);
    if (!extHostProcess) {
      return;
    }
    await extHostProcess.waitForExit(maxWaitTimeMs);
  }
  async _killAllNow() {
    for (const [, extHost] of this._extHosts) {
      extHost.kill();
    }
  }
  async _waitForAllExit(maxWaitTimeMs) {
    const exitPromises = [];
    for (const [, extHost] of this._extHosts) {
      exitPromises.push(extHost.waitForExit(maxWaitTimeMs));
    }
    return Promises.settled(exitPromises).then(() => {
    });
  }
};
ExtensionHostStarter._lastId = 0;
ExtensionHostStarter = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ILifecycleMainService),
  __decorateParam(2, IWindowsMainService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IConfigurationService)
], ExtensionHostStarter);
export {
  ExtensionHostStarter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbnMvZWxlY3Ryb24tbWFpbi9leHRlbnNpb25Ib3N0U3RhcnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY2FuY2VsZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRlbnNpb25Ib3N0R3JhY2VUaW1lTXMsIElFeHRlbnNpb25Ib3N0UHJvY2Vzc09wdGlvbnMsIElFeHRlbnNpb25Ib3N0U3RhcnRlciB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25Ib3N0U3RhcnRlci5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgV2luZG93VXRpbGl0eVByb2Nlc3MgfSBmcm9tICcuLi8uLi91dGlsaXR5UHJvY2Vzcy9lbGVjdHJvbi1tYWluL3V0aWxpdHlQcm9jZXNzLmpzJztcbmltcG9ydCB7IElXaW5kb3dzTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkhvc3RTdGFydGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlLCBJRXh0ZW5zaW9uSG9zdFN0YXJ0ZXIge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBfbGFzdElkOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RzID0gbmV3IE1hcDxzdHJpbmcsIFdpbmRvd1V0aWxpdHlQcm9jZXNzPigpO1xuXHRwcml2YXRlIF9zaHV0ZG93biA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxpZmVjeWNsZU1haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsXG5cdFx0QElXaW5kb3dzTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBPbiBzaHV0ZG93bjogZ3JhY2VmdWxseSBhd2FpdCBleHRlbnNpb24gaG9zdCBzaHV0ZG93bnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saWZlY3ljbGVNYWluU2VydmljZS5vbldpbGxTaHV0ZG93bihlID0+IHtcblx0XHRcdHRoaXMuX3NodXRkb3duID0gdHJ1ZTtcblx0XHRcdGUuam9pbignZXh0SG9zdFN0YXJ0ZXInLCB0aGlzLl93YWl0Rm9yQWxsRXhpdCg2MDAwKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBJbnRlbnRpb25hbGx5IG5vdCBraWxsaW5nIHRoZSBleHRlbnNpb24gaG9zdCBwcm9jZXNzZXNcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFeHRIb3N0KGlkOiBzdHJpbmcpOiBXaW5kb3dVdGlsaXR5UHJvY2VzcyB7XG5cdFx0Y29uc3QgZXh0SG9zdFByb2Nlc3MgPSB0aGlzLl9leHRIb3N0cy5nZXQoaWQpO1xuXHRcdGlmICghZXh0SG9zdFByb2Nlc3MpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBleHRlbnNpb24gaG9zdCFgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dEhvc3RQcm9jZXNzO1xuXHR9XG5cblx0b25EeW5hbWljU3Rkb3V0KGlkOiBzdHJpbmcpOiBFdmVudDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0SG9zdChpZCkub25TdGRvdXQ7XG5cdH1cblxuXHRvbkR5bmFtaWNTdGRlcnIoaWQ6IHN0cmluZyk6IEV2ZW50PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRFeHRIb3N0KGlkKS5vblN0ZGVycjtcblx0fVxuXG5cdG9uRHluYW1pY01lc3NhZ2UoaWQ6IHN0cmluZyk6IEV2ZW50PHVua25vd24+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0SG9zdChpZCkub25NZXNzYWdlO1xuXHR9XG5cblx0b25EeW5hbWljRXhpdChpZDogc3RyaW5nKTogRXZlbnQ8eyBjb2RlOiBudW1iZXI7IHNpZ25hbDogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RXh0SG9zdChpZCkub25FeGl0O1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlRXh0ZW5zaW9uSG9zdCgpOiBQcm9taXNlPHsgaWQ6IHN0cmluZyB9PiB7XG5cdFx0aWYgKHRoaXMuX3NodXRkb3duKSB7XG5cdFx0XHR0aHJvdyBjYW5jZWxlZCgpO1xuXHRcdH1cblx0XHRjb25zdCBpZCA9IFN0cmluZygrK0V4dGVuc2lvbkhvc3RTdGFydGVyLl9sYXN0SWQpO1xuXHRcdGNvbnN0IGV4dEhvc3QgPSBuZXcgV2luZG93VXRpbGl0eVByb2Nlc3ModGhpcy5fbG9nU2VydmljZSwgdGhpcy5fd2luZG93c01haW5TZXJ2aWNlLCB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB0aGlzLl9saWZlY3ljbGVNYWluU2VydmljZSk7XG5cdFx0dGhpcy5fZXh0SG9zdHMuc2V0KGlkLCBleHRIb3N0KTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZXh0SG9zdC5vbkV4aXQoKHsgcGlkLCBjb2RlLCBzaWduYWwgfSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYEV4dGVuc2lvbiBob3N0IHdpdGggcGlkICR7cGlkfSBleGl0ZWQgd2l0aCBjb2RlOiAke2NvZGV9LCBzaWduYWw6ICR7c2lnbmFsfS5gKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRleHRIb3N0LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZXh0SG9zdHMuZGVsZXRlKGlkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5NDQ3N1xuXHRcdFx0Ly8gV2UgaGF2ZSBvYnNlcnZlZCB0aGF0IHNvbWV0aW1lcyB0aGUgcHJvY2VzcyBzZW5kcyBhbiBleGl0XG5cdFx0XHQvLyBldmVudCwgYnV0IGRvZXMgbm90IHJlYWxseSBleGl0IGFuZCBpcyBzdHVjayBpbiBhbiBlbmRsZXNzXG5cdFx0XHQvLyBsb29wLiBJbiB0aGVzZSBjYXNlcyB3ZSBraWxsIHRoZSBwcm9jZXNzIGZvcmNlZnVsbHkgYWZ0ZXJcblx0XHRcdC8vIGEgY2VydGFpbiB0aW1lb3V0LlxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cHJvY2Vzcy5raWxsKHBpZCwgMCk7IC8vIHdpbGwgdGhyb3cgaWYgdGhlIHByb2Nlc3MgZG9lc24ndCBleGlzdCBhbnltb3JlLlxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEV4dGVuc2lvbiBob3N0IHdpdGggcGlkICR7cGlkfSBzdGlsbCBleGlzdHMsIGZvcmNlZnVsbHkga2lsbGluZyBpdC4uLmApO1xuXHRcdFx0XHRcdHByb2Nlc3Mua2lsbChwaWQpO1xuXHRcdFx0XHR9IGNhdGNoIChlcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSwgYXMgdGhlIHByb2Nlc3MgaXMgYWxyZWFkeSBnb25lXG5cdFx0XHRcdH1cblx0XHRcdH0sIDEwMDApO1xuXHRcdH0pO1xuXHRcdHJldHVybiB7IGlkIH07XG5cdH1cblxuXHRhc3luYyBzdGFydChpZDogc3RyaW5nLCBvcHRzOiBJRXh0ZW5zaW9uSG9zdFByb2Nlc3NPcHRpb25zKTogUHJvbWlzZTx7IHBpZDogbnVtYmVyIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd24pIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dEhvc3QgPSB0aGlzLl9nZXRFeHRIb3N0KGlkKTtcblx0XHRjb25zdCBhcmdzID0gWyctLXNraXBXb3Jrc3BhY2VTdG9yYWdlTG9jayddO1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZXh0ZW5zaW9ucy5zdXBwb3J0Tm9kZUdsb2JhbE5hdmlnYXRvcicpKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tc3VwcG9ydEdsb2JhbE5hdmlnYXRvcicpO1xuXHRcdH1cblx0XHRleHRIb3N0LnN0YXJ0KHtcblx0XHRcdC4uLm9wdHMsXG5cdFx0XHR0eXBlOiAnZXh0ZW5zaW9uSG9zdCcsXG5cdFx0XHRuYW1lOiAnZXh0ZW5zaW9uLWhvc3QnLFxuXHRcdFx0ZW50cnlQb2ludDogJ3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9leHRlbnNpb25Ib3N0UHJvY2VzcycsXG5cdFx0XHRhcmdzLFxuXHRcdFx0ZXhlY0FyZ3Y6IG9wdHMuZXhlY0FyZ3YsXG5cdFx0XHRhbGxvd0xvYWRpbmdVbnNpZ25lZExpYnJhcmllczogdHJ1ZSxcblx0XHRcdHJlc3BvbmRUb0F1dGhSZXF1ZXN0c0Zyb21NYWluUHJvY2VzczogdHJ1ZSxcblx0XHRcdHdpbmRvd0xpZmVjeWNsZUJvdW5kOiB0cnVlLFxuXHRcdFx0d2luZG93TGlmZWN5Y2xlR3JhY2VUaW1lOiBleHRlbnNpb25Ib3N0R3JhY2VUaW1lTXMsXG5cdFx0XHRjb3JyZWxhdGlvbklkOiBpZFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBpZCA9IGF3YWl0IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Lm9uU3Bhd24pO1xuXHRcdHJldHVybiB7IHBpZCB9O1xuXHR9XG5cblx0YXN5bmMgZW5hYmxlSW5zcGVjdFBvcnQoaWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93bikge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZXh0SG9zdFByb2Nlc3MgPSB0aGlzLl9leHRIb3N0cy5nZXQoaWQpO1xuXHRcdGlmICghZXh0SG9zdFByb2Nlc3MpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dEhvc3RQcm9jZXNzLmVuYWJsZUluc3BlY3RQb3J0KCk7XG5cdH1cblxuXHRhc3luYyBraWxsKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd24pIHtcblx0XHRcdHRocm93IGNhbmNlbGVkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dEhvc3RQcm9jZXNzID0gdGhpcy5fZXh0SG9zdHMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4dEhvc3RQcm9jZXNzKSB7XG5cdFx0XHQvLyBhbHJlYWR5IGdvbmUhXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGV4dEhvc3RQcm9jZXNzLmtpbGwoKTtcblx0fVxuXG5cdGFzeW5jIHdhaXRGb3JFeGl0KGlkOiBzdHJpbmcsIG1heFdhaXRUaW1lTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93bikge1xuXHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZXh0SG9zdFByb2Nlc3MgPSB0aGlzLl9leHRIb3N0cy5nZXQoaWQpO1xuXHRcdGlmICghZXh0SG9zdFByb2Nlc3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgZXh0SG9zdFByb2Nlc3Mud2FpdEZvckV4aXQobWF4V2FpdFRpbWVNcyk7XG5cdH1cblxuXHRhc3luYyBfa2lsbEFsbE5vdygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IFssIGV4dEhvc3RdIG9mIHRoaXMuX2V4dEhvc3RzKSB7XG5cdFx0XHRleHRIb3N0LmtpbGwoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBfd2FpdEZvckFsbEV4aXQobWF4V2FpdFRpbWVNczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpdFByb21pc2VzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFssIGV4dEhvc3RdIG9mIHRoaXMuX2V4dEhvc3RzKSB7XG5cdFx0XHRleGl0UHJvbWlzZXMucHVzaChleHRIb3N0LndhaXRGb3JFeGl0KG1heFdhaXRUaW1lTXMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2VzLnNldHRsZWQoZXhpdFByb21pc2VzKS50aGVuKCgpID0+IHsgfSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsZ0NBQXFGO0FBQzlGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBRS9CLElBQU0sdUJBQU4sY0FBbUMsV0FBeUQ7QUFBQSxFQVNsRyxZQUMrQixhQUNVLHVCQUNGLHFCQUNGLG1CQUNJLHVCQUN2QztBQUNELFVBQU07QUFOd0I7QUFDVTtBQUNGO0FBQ0Y7QUFDSTtBQVJ6QyxTQUFpQixZQUFZLG9CQUFJLElBQWtDO0FBQ25FLFNBQVEsWUFBWTtBQVluQixTQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxPQUFLO0FBQzdELFdBQUssWUFBWTtBQUNqQixRQUFFLEtBQUssa0JBQWtCLEtBQUss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
