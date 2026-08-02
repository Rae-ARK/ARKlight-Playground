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
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { FileAccess, Schemas } from "../../../base/common/network.js";
import { Client } from "../../../base/parts/ipc/node/ipc.cp.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { parsePtyHostDebugPort } from "../../environment/node/environmentService.js";
let NodePtyHostStarter = class extends Disposable {
  constructor(_reconnectConstants, _environmentService) {
    super();
    this._reconnectConstants = _reconnectConstants;
    this._environmentService = _environmentService;
  }
  start() {
    const opts = {
      serverName: "Pty Host",
      args: ["--type=ptyHost", "--logsPath", this._environmentService.logsHome.with({ scheme: Schemas.file }).fsPath],
      env: {
        VSCODE_ESM_ENTRYPOINT: "vs/platform/terminal/node/ptyHostMain",
        VSCODE_PIPE_LOGGING: "true",
        VSCODE_VERBOSE_LOGGING: "true",
        // transmit console logs from server to client,
        VSCODE_RECONNECT_GRACE_TIME: this._reconnectConstants.graceTime,
        VSCODE_RECONNECT_SHORT_GRACE_TIME: this._reconnectConstants.shortGraceTime,
        VSCODE_RECONNECT_SCROLLBACK: this._reconnectConstants.scrollback
      }
    };
    const ptyHostDebug = parsePtyHostDebugPort(this._environmentService.args, this._environmentService.isBuilt);
    if (ptyHostDebug) {
      if (ptyHostDebug.break && ptyHostDebug.port) {
        opts.debugBrk = ptyHostDebug.port;
      } else if (!ptyHostDebug.break && ptyHostDebug.port) {
        opts.debug = ptyHostDebug.port;
      }
    }
    const client = new Client(FileAccess.asFileUri("bootstrap-fork").fsPath, opts);
    const store = new DisposableStore();
    store.add(client);
    return {
      client,
      store,
      onDidProcessExit: client.onDidProcessExit
    };
  }
};
NodePtyHostStarter = __decorateClass([
  __decorateParam(1, IEnvironmentService)
], NodePtyHostStarter);
export {
  NodePtyHostStarter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvbm9kZVB0eUhvc3RTdGFydGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IENsaWVudCwgSUlQQ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5jcC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlLCBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHBhcnNlUHR5SG9zdERlYnVnUG9ydCB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L25vZGUvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZWNvbm5lY3RDb25zdGFudHMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVB0eUhvc3RDb25uZWN0aW9uLCBJUHR5SG9zdFN0YXJ0ZXIgfSBmcm9tICcuL3B0eUhvc3QuanMnO1xuXG5leHBvcnQgY2xhc3MgTm9kZVB0eUhvc3RTdGFydGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQdHlIb3N0U3RhcnRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdENvbnN0YW50czogSVJlY29ubmVjdENvbnN0YW50cyxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHN0YXJ0KCk6IElQdHlIb3N0Q29ubmVjdGlvbiB7XG5cdFx0Y29uc3Qgb3B0czogSUlQQ09wdGlvbnMgPSB7XG5cdFx0XHRzZXJ2ZXJOYW1lOiAnUHR5IEhvc3QnLFxuXHRcdFx0YXJnczogWyctLXR5cGU9cHR5SG9zdCcsICctLWxvZ3NQYXRoJywgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lLndpdGgoeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSB9KS5mc1BhdGhdLFxuXHRcdFx0ZW52OiB7XG5cdFx0XHRcdFZTQ09ERV9FU01fRU5UUllQT0lOVDogJ3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvcHR5SG9zdE1haW4nLFxuXHRcdFx0XHRWU0NPREVfUElQRV9MT0dHSU5HOiAndHJ1ZScsXG5cdFx0XHRcdFZTQ09ERV9WRVJCT1NFX0xPR0dJTkc6ICd0cnVlJywgLy8gdHJhbnNtaXQgY29uc29sZSBsb2dzIGZyb20gc2VydmVyIHRvIGNsaWVudCxcblx0XHRcdFx0VlNDT0RFX1JFQ09OTkVDVF9HUkFDRV9USU1FOiB0aGlzLl9yZWNvbm5lY3RDb25zdGFudHMuZ3JhY2VUaW1lLFxuXHRcdFx0XHRWU0NPREVfUkVDT05ORUNUX1NIT1JUX0dSQUNFX1RJTUU6IHRoaXMuX3JlY29ubmVjdENvbnN0YW50cy5zaG9ydEdyYWNlVGltZSxcblx0XHRcdFx0VlNDT0RFX1JFQ09OTkVDVF9TQ1JPTExCQUNLOiB0aGlzLl9yZWNvbm5lY3RDb25zdGFudHMuc2Nyb2xsYmFja1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwdHlIb3N0RGVidWcgPSBwYXJzZVB0eUhvc3REZWJ1Z1BvcnQodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3MsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0KTtcblx0XHRpZiAocHR5SG9zdERlYnVnKSB7XG5cdFx0XHRpZiAocHR5SG9zdERlYnVnLmJyZWFrICYmIHB0eUhvc3REZWJ1Zy5wb3J0KSB7XG5cdFx0XHRcdG9wdHMuZGVidWdCcmsgPSBwdHlIb3N0RGVidWcucG9ydDtcblx0XHRcdH0gZWxzZSBpZiAoIXB0eUhvc3REZWJ1Zy5icmVhayAmJiBwdHlIb3N0RGVidWcucG9ydCkge1xuXHRcdFx0XHRvcHRzLmRlYnVnID0gcHR5SG9zdERlYnVnLnBvcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpZW50ID0gbmV3IENsaWVudChGaWxlQWNjZXNzLmFzRmlsZVVyaSgnYm9vdHN0cmFwLWZvcmsnKS5mc1BhdGgsIG9wdHMpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGNsaWVudCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2xpZW50LFxuXHRcdFx0c3RvcmUsXG5cdFx0XHRvbkRpZFByb2Nlc3NFeGl0OiBjbGllbnQub25EaWRQcm9jZXNzRXhpdFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLGNBQTJCO0FBQ3BDLFNBQVMsMkJBQXNEO0FBQy9ELFNBQVMsNkJBQTZCO0FBSS9CLElBQU0scUJBQU4sY0FBaUMsV0FBc0M7QUFBQSxFQUM3RSxZQUNrQixxQkFDcUIscUJBQ3JDO0FBQ0QsVUFBTTtBQUhXO0FBQ3FCO0FBQUEsRUFHdkM7QUFBQSxFQUVBLFFBQTRCO0FBQzNCLFVBQU0sT0FBb0I7QUFBQSxNQUN6QixZQUFZO0FBQUEsTUFDWixNQUFNLENBQUMsa0JBQWtCLGNBQWMsS0FBSyxvQkFBb0IsU0FBUyxLQUFLLEVBQUUsUUFBUSxRQUFRLEtBQUssQ0FBQyxFQUFFLE1BQU07QUFBQSxNQUM5RyxLQUFLO0FBQUEsUUFDSix1QkFBdUI7QUFBQSxRQUN2QixxQkFBcUI7QUFBQSxRQUNyQix3QkFBd0I7QUFBQTtBQUFBLFFBQ3hCLDZCQUE2QixLQUFLLG9CQUFvQjtBQUFBLFFBQ3RELG1DQUFtQyxLQUFLLG9CQUFvQjtBQUFBLFFBQzVELDZCQUE2QixLQUFLLG9CQUFvQjtBQUFBLE1BQ3ZEO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxzQkFBc0IsS0FBSyxvQkFBb0IsTUFBTSxLQUFLLG9CQUFvQixPQUFPO0FBQzFHLFFBQUksY0FBYztBQUNqQixVQUFJLGFBQWEsU0FBUyxhQUFhLE1BQU07QUFDNUMsYUFBSyxXQUFXLGFBQWE7QUFBQSxNQUM5QixXQUFXLENBQUMsYUFBYSxTQUFTLGFBQWEsTUFBTTtBQUNwRCxhQUFLLFFBQVEsYUFBYTtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxJQUFJLE9BQU8sV0FBVyxVQUFVLGdCQUFnQixFQUFFLFFBQVEsSUFBSTtBQUU3RSxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxJQUFJLE1BQU07QUFFaEIsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQSxrQkFBa0IsT0FBTztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUNEO0FBMUNhLHFCQUFOO0FBQUEsRUFHSjtBQUFBLEdBSFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
