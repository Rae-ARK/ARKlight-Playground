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
import { localize } from "../../../../nls.js";
import {
  TUNNEL_HOST_CHANNEL,
  TUNNEL_HOST_LOG_ID
} from "../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ISharedProcessService } from "../../../../platform/ipc/electron-browser/services.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { joinPath } from "../../../../base/common/resources.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
const CONFIGURATION_KEY_MICROSOFT_AUTH = "remote.tunnels.access.enableMicrosoftAuth";
const SHOW_TUNNEL_HOST_OUTPUT_ID = "sessions.tunnelHost.showOutput";
let TunnelHostService = class extends Disposable {
  constructor(sharedProcessService, _authenticationService, _productService, _agentHostService, _configurationService, loggerService, environmentService) {
    super();
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._agentHostService = _agentHostService;
    this._configurationService = _configurationService;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._isSharing = false;
    this._isConnecting = false;
    this._logger = this._register(loggerService.createLogger(
      joinPath(environmentService.logsHome, `${TUNNEL_HOST_LOG_ID}.log`),
      { id: TUNNEL_HOST_LOG_ID, name: localize("tunnelHost.outputChannel", "Remote Connections") }
    ));
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(TUNNEL_HOST_CHANNEL)
    );
    this._register(this._mainService.onDidChangeStatus((status) => {
      this._isSharing = status.active;
      this._sharingInfo = status.active ? status.info : void 0;
      this._onDidChangeStatus.fire();
    }));
    this._mainService.getStatus().then((status) => {
      this._isSharing = status.active;
      this._sharingInfo = status.active ? status.info : void 0;
      if (status.active) {
        this._onDidChangeStatus.fire();
      }
    });
  }
  get isSharing() {
    return this._isSharing;
  }
  get isConnecting() {
    return this._isConnecting;
  }
  get sharingInfo() {
    return this._sharingInfo;
  }
  async startSharing() {
    this._isConnecting = true;
    this._onDidChangeStatus.fire();
    try {
      const auth = await this._getToken(false);
      if (!auth) {
        this._logger.warn("No auth token available for tunnel hosting");
        throw new Error(localize("tunnelHost.noAuth", "No authentication token available. Please sign in and try again."));
      }
      this._logger.info("Starting tunnel hosting...");
      const socketInfo = await this._agentHostService.startWebSocketServer();
      const info = await this._mainService.startHosting(auth.token, auth.provider, socketInfo);
      this._isSharing = true;
      this._sharingInfo = info;
    } finally {
      this._isConnecting = false;
      this._onDidChangeStatus.fire();
    }
  }
  async stopSharing() {
    this._logger.info("Stopping tunnel hosting...");
    await this._mainService.stopHosting();
    this._isSharing = false;
    this._sharingInfo = void 0;
    this._onDidChangeStatus.fire();
  }
  _getEnabledProviders() {
    const microsoftEnabled = this._configurationService.getValue(CONFIGURATION_KEY_MICROSOFT_AUTH);
    return microsoftEnabled ? ["microsoft", "github"] : ["github"];
  }
  async _getToken(silent) {
    const enabledProviders = this._getEnabledProviders();
    if (this._lastAuthProvider && enabledProviders.includes(this._lastAuthProvider)) {
      const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
      if (result) {
        return result;
      }
    }
    for (const provider of enabledProviders) {
      if (provider === this._lastAuthProvider) {
        continue;
      }
      const result = await this._getTokenForProvider(provider, true);
      if (result) {
        return result;
      }
    }
    if (!silent) {
      for (const provider of enabledProviders) {
        const result = await this._getTokenForProvider(provider, false);
        if (result) {
          return result;
        }
      }
    }
    return void 0;
  }
  _getScopesForProvider(provider) {
    const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
    return config?.[provider]?.scopes ?? [];
  }
  async _getTokenForProvider(provider, silent) {
    const scopes = this._getScopesForProvider(provider);
    if (scopes.length === 0) {
      return void 0;
    }
    try {
      let sessions = await this._authenticationService.getSessions(provider, scopes, {}, true);
      if (sessions.length === 0) {
        const allSessions = await this._authenticationService.getSessions(provider, void 0, {}, true);
        const requestedSet = new Set(scopes);
        let bestSession;
        let bestExtra = Infinity;
        for (const session of allSessions) {
          const sessionScopes = new Set(session.scopes);
          let isSuperset = true;
          for (const scope of requestedSet) {
            if (!sessionScopes.has(scope)) {
              isSuperset = false;
              break;
            }
          }
          if (isSuperset) {
            const extra = sessionScopes.size - requestedSet.size;
            if (extra < bestExtra) {
              bestExtra = extra;
              bestSession = session;
            }
          }
        }
        if (bestSession) {
          sessions = [bestSession];
        }
      }
      if (sessions.length === 0 && !silent) {
        const session = await this._authenticationService.createSession(provider, scopes, { activateImmediate: true });
        sessions = [session];
      }
      if (sessions.length > 0) {
        const token = sessions[0].accessToken;
        if (token) {
          this._lastAuthProvider = provider;
          return { token, provider };
        }
      }
    } catch (err) {
      this._logger.debug(`Failed to get ${provider} token: ${err}`);
    }
    return void 0;
  }
};
TunnelHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IAgentHostService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILoggerService),
  __decorateParam(6, IEnvironmentService)
], TunnelHostService);
export {
  CONFIGURATION_KEY_MICROSOFT_AUTH,
  SHOW_TUNNEL_HOST_OUTPUT_ID,
  TunnelHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci90dW5uZWxIb3N0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7XG5cdElUdW5uZWxBZ2VudEhvc3RIb3N0aW5nU2VydmljZSxcblx0VFVOTkVMX0hPU1RfQ0hBTk5FTCxcblx0VFVOTkVMX0hPU1RfTE9HX0lELFxuXHR0eXBlIElUdW5uZWxIb3N0SW5mbyxcblx0dHlwZSBUdW5uZWxIb3N0U3RhdHVzLFxufSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVR1bm5lbEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3R1bm5lbEhvc3QuanMnO1xuXG5leHBvcnQgY29uc3QgQ09ORklHVVJBVElPTl9LRVlfTUlDUk9TT0ZUX0FVVEggPSAncmVtb3RlLnR1bm5lbHMuYWNjZXNzLmVuYWJsZU1pY3Jvc29mdEF1dGgnO1xuZXhwb3J0IGNvbnN0IFNIT1dfVFVOTkVMX0hPU1RfT1VUUFVUX0lEID0gJ3Nlc3Npb25zLnR1bm5lbEhvc3Quc2hvd091dHB1dCc7XG5cbmV4cG9ydCBjbGFzcyBUdW5uZWxIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHVubmVsSG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluU2VydmljZTogSVR1bm5lbEFnZW50SG9zdEhvc3RpbmdTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0dXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0dXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfaXNTaGFyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzQ29ubmVjdGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zaGFyaW5nSW5mbzogSVR1bm5lbEhvc3RJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBUcmFja3Mgd2hpY2ggYXV0aCBwcm92aWRlciB3YXMgbGFzdCB1c2VkIHN1Y2Nlc3NmdWxseS4gKi9cblx0cHJpdmF0ZSBfbGFzdEF1dGhQcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNoYXJlZFByb2Nlc3NTZXJ2aWNlIHNoYXJlZFByb2Nlc3NTZXJ2aWNlOiBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBsb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9sb2dnZXIgPSB0aGlzLl9yZWdpc3Rlcihsb2dnZXJTZXJ2aWNlLmNyZWF0ZUxvZ2dlcihcblx0XHRcdGpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgYCR7VFVOTkVMX0hPU1RfTE9HX0lEfS5sb2dgKSxcblx0XHRcdHsgaWQ6IFRVTk5FTF9IT1NUX0xPR19JRCwgbmFtZTogbG9jYWxpemUoJ3R1bm5lbEhvc3Qub3V0cHV0Q2hhbm5lbCcsIFwiUmVtb3RlIENvbm5lY3Rpb25zXCIpIH0sXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9tYWluU2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SVR1bm5lbEFnZW50SG9zdEhvc3RpbmdTZXJ2aWNlPihcblx0XHRcdHNoYXJlZFByb2Nlc3NTZXJ2aWNlLmdldENoYW5uZWwoVFVOTkVMX0hPU1RfQ0hBTk5FTCksXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21haW5TZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzKChzdGF0dXM6IFR1bm5lbEhvc3RTdGF0dXMpID0+IHtcblx0XHRcdHRoaXMuX2lzU2hhcmluZyA9IHN0YXR1cy5hY3RpdmU7XG5cdFx0XHR0aGlzLl9zaGFyaW5nSW5mbyA9IHN0YXR1cy5hY3RpdmUgPyBzdGF0dXMuaW5mbyA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9tYWluU2VydmljZS5nZXRTdGF0dXMoKS50aGVuKHN0YXR1cyA9PiB7XG5cdFx0XHR0aGlzLl9pc1NoYXJpbmcgPSBzdGF0dXMuYWN0aXZlO1xuXHRcdFx0dGhpcy5fc2hhcmluZ0luZm8gPSBzdGF0dXMuYWN0aXZlID8gc3RhdHVzLmluZm8gOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3RhdHVzLmFjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgaXNTaGFyaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1NoYXJpbmc7XG5cdH1cblxuXHRnZXQgaXNDb25uZWN0aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0Nvbm5lY3Rpbmc7XG5cdH1cblxuXHRnZXQgc2hhcmluZ0luZm8oKTogSVR1bm5lbEhvc3RJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2hhcmluZ0luZm87XG5cdH1cblxuXHRhc3luYyBzdGFydFNoYXJpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faXNDb25uZWN0aW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuX2dldFRva2VuKGZhbHNlKTtcblx0XHRcdGlmICghYXV0aCkge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIud2FybignTm8gYXV0aCB0b2tlbiBhdmFpbGFibGUgZm9yIHR1bm5lbCBob3N0aW5nJyk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndHVubmVsSG9zdC5ub0F1dGgnLCBcIk5vIGF1dGhlbnRpY2F0aW9uIHRva2VuIGF2YWlsYWJsZS4gUGxlYXNlIHNpZ24gaW4gYW5kIHRyeSBhZ2Fpbi5cIikpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbygnU3RhcnRpbmcgdHVubmVsIGhvc3RpbmcuLi4nKTtcblxuXHRcdFx0Y29uc3Qgc29ja2V0SW5mbyA9IGF3YWl0IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uuc3RhcnRXZWJTb2NrZXRTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLl9tYWluU2VydmljZS5zdGFydEhvc3RpbmcoYXV0aC50b2tlbiwgYXV0aC5wcm92aWRlciwgc29ja2V0SW5mbyk7XG5cdFx0XHR0aGlzLl9pc1NoYXJpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy5fc2hhcmluZ0luZm8gPSBpbmZvO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc0Nvbm5lY3RpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9wU2hhcmluZygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbygnU3RvcHBpbmcgdHVubmVsIGhvc3RpbmcuLi4nKTtcblx0XHRhd2FpdCB0aGlzLl9tYWluU2VydmljZS5zdG9wSG9zdGluZygpO1xuXHRcdHRoaXMuX2lzU2hhcmluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3NoYXJpbmdJbmZvID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVuYWJsZWRQcm92aWRlcnMoKTogcmVhZG9ubHkgKCdnaXRodWInIHwgJ21pY3Jvc29mdCcpW10ge1xuXHRcdGNvbnN0IG1pY3Jvc29mdEVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDT05GSUdVUkFUSU9OX0tFWV9NSUNST1NPRlRfQVVUSCk7XG5cdFx0cmV0dXJuIG1pY3Jvc29mdEVuYWJsZWQgPyBbJ21pY3Jvc29mdCcsICdnaXRodWInXSA6IFsnZ2l0aHViJ107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUb2tlbihzaWxlbnQ6IGJvb2xlYW4pOiBQcm9taXNlPHsgdG9rZW46IHN0cmluZzsgcHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGVuYWJsZWRQcm92aWRlcnMgPSB0aGlzLl9nZXRFbmFibGVkUHJvdmlkZXJzKCk7XG5cblx0XHRpZiAodGhpcy5fbGFzdEF1dGhQcm92aWRlciAmJiBlbmFibGVkUHJvdmlkZXJzLmluY2x1ZGVzKHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9nZXRUb2tlbkZvclByb3ZpZGVyKHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIsIHNpbGVudCk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBlbmFibGVkUHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAocHJvdmlkZXIgPT09IHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9nZXRUb2tlbkZvclByb3ZpZGVyKHByb3ZpZGVyLCB0cnVlKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNpbGVudCkge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBlbmFibGVkUHJvdmlkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIocHJvdmlkZXIsIGZhbHNlKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2NvcGVzRm9yUHJvdmlkZXIocHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UudHVubmVsQXBwbGljYXRpb25Db25maWc/LmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzO1xuXHRcdHJldHVybiBjb25maWc/Lltwcm92aWRlcl0/LnNjb3BlcyA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRva2VuRm9yUHJvdmlkZXIoXG5cdFx0cHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcsXG5cdFx0c2lsZW50OiBib29sZWFuLFxuXHQpOiBQcm9taXNlPHsgdG9rZW46IHN0cmluZzsgcHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNjb3BlcyA9IHRoaXMuX2dldFNjb3Blc0ZvclByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRpZiAoc2NvcGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVyLCBzY29wZXMsIHt9LCB0cnVlKTtcblxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlciwgdW5kZWZpbmVkLCB7fSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RlZFNldCA9IG5ldyBTZXQoc2NvcGVzKTtcblx0XHRcdFx0bGV0IGJlc3RTZXNzaW9uOiB0eXBlb2YgYWxsU2Vzc2lvbnNbbnVtYmVyXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGJlc3RFeHRyYSA9IEluZmluaXR5O1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgYWxsU2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uU2NvcGVzID0gbmV3IFNldChzZXNzaW9uLnNjb3Blcyk7XG5cdFx0XHRcdFx0bGV0IGlzU3VwZXJzZXQgPSB0cnVlO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2YgcmVxdWVzdGVkU2V0KSB7XG5cdFx0XHRcdFx0XHRpZiAoIXNlc3Npb25TY29wZXMuaGFzKHNjb3BlKSkge1xuXHRcdFx0XHRcdFx0XHRpc1N1cGVyc2V0ID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNTdXBlcnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXh0cmEgPSBzZXNzaW9uU2NvcGVzLnNpemUgLSByZXF1ZXN0ZWRTZXQuc2l6ZTtcblx0XHRcdFx0XHRcdGlmIChleHRyYSA8IGJlc3RFeHRyYSkge1xuXHRcdFx0XHRcdFx0XHRiZXN0RXh0cmEgPSBleHRyYTtcblx0XHRcdFx0XHRcdFx0YmVzdFNlc3Npb24gPSBzZXNzaW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYmVzdFNlc3Npb24pIHtcblx0XHRcdFx0XHRzZXNzaW9ucyA9IFtiZXN0U2Vzc2lvbl07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCAmJiAhc2lsZW50KSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbihwcm92aWRlciwgc2NvcGVzLCB7IGFjdGl2YXRlSW1tZWRpYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRzZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBzZXNzaW9uc1swXS5hY2Nlc3NUb2tlbjtcblx0XHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdEF1dGhQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0XHRcdHJldHVybiB7IHRva2VuLCBwcm92aWRlciB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYEZhaWxlZCB0byBnZXQgJHtwcm92aWRlcn0gdG9rZW46ICR7ZXJyfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekI7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLE9BR007QUFDUCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFrQixzQkFBc0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDhCQUE4QjtB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
