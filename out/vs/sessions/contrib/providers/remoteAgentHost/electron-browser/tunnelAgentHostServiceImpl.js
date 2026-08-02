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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ProxyChannel } from "../../../../../base/parts/ipc/common/ipc.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ISharedProcessService } from "../../../../../platform/ipc/electron-browser/services.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import {
  TUNNEL_AGENT_HOST_CHANNEL,
  TunnelAgentHostsSettingId
} from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { AhpJsonlLogger } from "../../../../../platform/agentHost/common/ahpJsonlLogger.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { RemoteAgentHostProtocolClient } from "../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../../../../../platform/agentHost/common/agentHostClientInfo.js";
import { TunnelRelayTransport } from "../../../../../platform/agentHost/electron-browser/tunnelRelayTransport.js";
const LOG_PREFIX = "[TunnelAgentHost]";
const CACHED_TUNNELS_KEY = "tunnelAgentHost.recentTunnels";
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = "tunnelAgentHost.autoConnectSuppressedTunnels";
let TunnelAgentHostService = class extends Disposable {
  constructor(sharedProcessService, _remoteAgentHostService, _logService, _instantiationService, _configurationService, _authenticationService, _productService, _storageService, _environmentService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._storageService = _storageService;
    this._environmentService = _environmentService;
    this._onDidChangeTunnels = this._register(new Emitter());
    this.onDidChangeTunnels = this._onDidChangeTunnels.event;
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(TUNNEL_AGENT_HOST_CHANNEL)
    );
  }
  async listTunnels(options) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return [];
    }
    const silent = options?.silent ?? false;
    const auth = await this._getToken(silent);
    if (!auth) {
      if (silent) {
        this._logService.debug(`${LOG_PREFIX} No cached token available for silent tunnel enumeration`);
      } else {
        this._logService.warn(`${LOG_PREFIX} No auth token available for tunnel enumeration`);
      }
      return [];
    }
    const additionalNames = this._configurationService.getValue(TunnelAgentHostsSettingId) ?? [];
    return this._mainService.listTunnels(auth.token, auth.provider, additionalNames.length > 0 ? additionalNames : void 0);
  }
  async connect(tunnel, authProvider) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const auth = authProvider ? await this._getTokenForProvider(authProvider, false) : await this._getToken(false);
    if (!auth) {
      throw new Error("No authentication available");
    }
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnel.tunnelId})`);
    const result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
    this._logService.info(`${LOG_PREFIX} Tunnel relay connected, connectionId=${result.connectionId}`);
    let protocolClient;
    try {
      const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
      const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
        AhpJsonlLogger,
        { logsHome: this._environmentService.logsHome, connectionId: result.connectionId, transport: "tunnel" }
      ) : void 0;
      const transport = new TunnelRelayTransport(result.connectionId, this._mainService, logger);
      protocolClient = this._instantiationService.createInstance(
        RemoteAgentHostProtocolClient,
        result.address,
        transport,
        void 0,
        void 0,
        agentsWindowAgentHostClientInfo
      );
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${result.address}`);
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
        protocolClient.dispose();
        this._mainService.disconnect(result.connectionId).catch(() => {
        });
        throw err;
      }
      this._logService.warn(`${LOG_PREFIX} Incompatible with ${result.address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    this.cacheTunnel(tunnel, auth.provider);
    try {
      await this._remoteAgentHostService.addManagedConnection({
        name: result.name,
        connectionToken: result.connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: tunnel.tunnelId,
          clusterId: tunnel.clusterId,
          label: tunnel.name,
          authProvider: auth.provider
        }
      }, protocolClient, void 0, status);
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
      protocolClient.dispose();
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    if (connectError) {
      throw connectError;
    }
  }
  async disconnect(address) {
    await this._remoteAgentHostService.removeRemoteAgentHost(address);
    this._onDidChangeTunnels.fire();
  }
  /**
   * Get an auth token, trying cached sessions first (silent),
   * then prompting interactively if `silent` is false.
   */
  async _getToken(silent) {
    if (this._lastAuthProvider) {
      const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
      if (result) {
        return result;
      }
    }
    for (const provider of ["github", "microsoft"]) {
      if (provider === this._lastAuthProvider) {
        continue;
      }
      const result = await this._getTokenForProvider(provider, true);
      if (result) {
        return result;
      }
    }
    return void 0;
  }
  /**
   * Get a token for a specific auth provider.
   * @param provider The auth provider to use.
   * @param silent If true, only try cached sessions. If false, prompt the user.
   */
  _getScopesForProvider(provider) {
    const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
    return config?.[provider]?.scopes ?? [];
  }
  async _getTokenForProvider(provider, silent) {
    const providerId = provider;
    const scopes = this._getScopesForProvider(provider);
    if (scopes.length === 0) {
      return void 0;
    }
    try {
      let sessions = await this._authenticationService.getSessions(providerId, scopes, {}, true);
      if (sessions.length === 0) {
        const allSessions = await this._authenticationService.getSessions(providerId, void 0, {}, true);
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
        const session = await this._authenticationService.createSession(providerId, scopes, { activateImmediate: true });
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
      this._logService.debug(`${LOG_PREFIX} Failed to get ${provider} token: ${err}`);
    }
    return void 0;
  }
  async getAuthProvider(options) {
    const result = await this._getToken(options?.silent ?? true);
    return result?.provider;
  }
  getCachedTunnels() {
    const raw = this._storageService.get(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  cacheTunnel(tunnel, authProvider) {
    const cached = this.getCachedTunnels();
    const filtered = cached.filter((t) => t.tunnelId !== tunnel.tunnelId);
    filtered.unshift({
      tunnelId: tunnel.tunnelId,
      clusterId: tunnel.clusterId,
      name: tunnel.name,
      authProvider
    });
    this.clearAutoConnectSuppression(tunnel.tunnelId);
    this._storeCachedTunnels(filtered);
    this._onDidChangeTunnels.fire();
  }
  removeCachedTunnel(tunnelId) {
    const cached = this.getCachedTunnels();
    this._storeCachedTunnels(cached.filter((t) => t.tunnelId !== tunnelId));
    this.clearAutoConnectSuppression(tunnelId);
    this._onDidChangeTunnels.fire();
  }
  isAutoConnectSuppressed(tunnelId) {
    return this._getAutoConnectSuppressedTunnels().has(tunnelId);
  }
  suppressAutoConnect(tunnelId) {
    const suppressed = this._getAutoConnectSuppressedTunnels();
    suppressed.add(tunnelId);
    this._storeAutoConnectSuppressedTunnels(suppressed);
  }
  clearAutoConnectSuppression(tunnelId) {
    const suppressed = this._getAutoConnectSuppressedTunnels();
    if (!suppressed.delete(tunnelId)) {
      return;
    }
    this._storeAutoConnectSuppressedTunnels(suppressed);
  }
  _storeCachedTunnels(tunnels) {
    if (tunnels.length === 0) {
      this._storageService.remove(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
    } else {
      this._storageService.store(CACHED_TUNNELS_KEY, JSON.stringify(tunnels), StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
  _getAutoConnectSuppressedTunnels() {
    const raw = this._storageService.get(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return /* @__PURE__ */ new Set();
      }
      return new Set(parsed.filter((item) => typeof item === "string"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  _storeAutoConnectSuppressedTunnels(tunnelIds) {
    if (tunnelIds.size === 0) {
      this._storageService.remove(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
    } else {
      this._storageService.store(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, JSON.stringify([...tunnelIds]), StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
};
TunnelAgentHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IEnvironmentService)
], TunnelAgentHostService);
export {
  TunnelAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9lbGVjdHJvbi1icm93c2VyL3R1bm5lbEFnZW50SG9zdFNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2VsZWN0cm9uLWJyb3dzZXIvc2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSwgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRJVHVubmVsQWdlbnRIb3N0U2VydmljZSxcblx0VFVOTkVMX0FHRU5UX0hPU1RfQ0hBTk5FTCxcblx0VHVubmVsQWdlbnRIb3N0c1NldHRpbmdJZCxcblx0dHlwZSBJQ2FjaGVkVHVubmVsLFxuXHR0eXBlIElUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZSxcblx0dHlwZSBJVHVubmVsSW5mbyxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90dW5uZWxBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgQWhwSnNvbmxMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FocEpzb25sTG9nZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFocEpzb25sTG9nZ2luZ1NldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBUdW5uZWxSZWxheVRyYW5zcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9lbGVjdHJvbi1icm93c2VyL3R1bm5lbFJlbGF5VHJhbnNwb3J0LmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbVHVubmVsQWdlbnRIb3N0XSc7XG5cbi8qKiBTdG9yYWdlIGtleSBmb3IgcmVjZW50bHkgdXNlZCB0dW5uZWwgY2FjaGUuICovXG5jb25zdCBDQUNIRURfVFVOTkVMU19LRVkgPSAndHVubmVsQWdlbnRIb3N0LnJlY2VudFR1bm5lbHMnO1xuLyoqIFN0b3JhZ2Uga2V5IGZvciB0dW5uZWxzIHRoZSB1c2VyIGV4cGxpY2l0bHkgZGlzY29ubmVjdGVkLiAqL1xuY29uc3QgQVVUT19DT05ORUNUX1NVUFBSRVNTRURfVFVOTkVMU19LRVkgPSAndHVubmVsQWdlbnRIb3N0LmF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMnO1xuXG4vKipcbiAqIFJlbmRlcmVyLXNpZGUgaW1wbGVtZW50YXRpb24gb2Yge0BsaW5rIElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlfSB0aGF0XG4gKiBkZWxlZ2F0ZXMgdHVubmVsIFNESyBvcGVyYXRpb25zIHRvIHRoZSBzaGFyZWQgcHJvY2VzcyB2aWEgSVBDLCB0aGVuXG4gKiByZWdpc3RlcnMgY29ubmVjdGlvbnMgd2l0aCB0aGUgcmVuZGVyZXItbG9jYWwge0BsaW5rIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlfS5cbiAqL1xuZXhwb3J0IGNsYXNzIFR1bm5lbEFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluU2VydmljZTogSVR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVHVubmVscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVR1bm5lbHM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxzLmV2ZW50O1xuXG5cdC8qKiBUcmFja3Mgd2hpY2ggYXV0aCBwcm92aWRlciB3YXMgbGFzdCB1c2VkIHN1Y2Nlc3NmdWxseS4gKi9cblx0cHJpdmF0ZSBfbGFzdEF1dGhQcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNoYXJlZFByb2Nlc3NTZXJ2aWNlIHNoYXJlZFByb2Nlc3NTZXJ2aWNlOiBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX21haW5TZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2U+KFxuXHRcdFx0c2hhcmVkUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbChUVU5ORUxfQUdFTlRfSE9TVF9DSEFOTkVMKSxcblx0XHQpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFR1bm5lbHMob3B0aW9ucz86IHsgc2lsZW50PzogYm9vbGVhbiB9KTogUHJvbWlzZTxJVHVubmVsSW5mb1tdPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzaWxlbnQgPSBvcHRpb25zPy5zaWxlbnQgPz8gZmFsc2U7XG5cdFx0Y29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuX2dldFRva2VuKHNpbGVudCk7XG5cdFx0aWYgKCFhdXRoKSB7XG5cdFx0XHRpZiAoc2lsZW50KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYCR7TE9HX1BSRUZJWH0gTm8gY2FjaGVkIHRva2VuIGF2YWlsYWJsZSBmb3Igc2lsZW50IHR1bm5lbCBlbnVtZXJhdGlvbmApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IE5vIGF1dGggdG9rZW4gYXZhaWxhYmxlIGZvciB0dW5uZWwgZW51bWVyYXRpb25gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhZGRpdGlvbmFsTmFtZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmdbXT4oVHVubmVsQWdlbnRIb3N0c1NldHRpbmdJZCkgPz8gW107XG5cdFx0cmV0dXJuIHRoaXMuX21haW5TZXJ2aWNlLmxpc3RUdW5uZWxzKGF1dGgudG9rZW4sIGF1dGgucHJvdmlkZXIsIGFkZGl0aW9uYWxOYW1lcy5sZW5ndGggPiAwID8gYWRkaXRpb25hbE5hbWVzIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIGNvbm5lY3QodHVubmVsOiBJVHVubmVsSW5mbywgYXV0aFByb3ZpZGVyPzogJ2dpdGh1YicgfCAnbWljcm9zb2Z0Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRoID0gYXV0aFByb3ZpZGVyXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIoYXV0aFByb3ZpZGVyLCBmYWxzZSlcblx0XHRcdDogYXdhaXQgdGhpcy5fZ2V0VG9rZW4oZmFsc2UpO1xuXHRcdGlmICghYXV0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBhdXRoZW50aWNhdGlvbiBhdmFpbGFibGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGluZyB0byB0dW5uZWwgJyR7dHVubmVsLm5hbWV9JyAoJHt0dW5uZWwudHVubmVsSWR9KWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLmNvbm5lY3QoYXV0aC50b2tlbiwgYXV0aC5wcm92aWRlciwgdHVubmVsLnR1bm5lbElkLCB0dW5uZWwuY2x1c3RlcklkKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVHVubmVsIHJlbGF5IGNvbm5lY3RlZCwgY29ubmVjdGlvbklkPSR7cmVzdWx0LmNvbm5lY3Rpb25JZH1gKTtcblxuXHRcdC8vIEJ1aWxkIHJlbGF5IHRyYW5zcG9ydCArIHByb3RvY29sIGNsaWVudC4gSWYgY29uc3RydWN0aW9uIGl0c2VsZlxuXHRcdC8vIGZhaWxzIChyYXJlIFx1MjAxNCB3b3VsZCBtZWFuIHRoZSBBSFAgbG9nZ2VyIG9yIHRyYW5zcG9ydCBjdG9yIHRocmV3KVxuXHRcdC8vIHRlYXIgdGhlIGp1c3Qtb3BlbmVkIG1haW4tc2lkZSByZWxheSBkb3duIGJlZm9yZSBwcm9wYWdhdGluZy5cblx0XHRsZXQgcHJvdG9jb2xDbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhaHBMb2dnaW5nRW5hYmxlZCA9ICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKTtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IGFocExvZ2dpbmdFbmFibGVkID8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFocEpzb25sTG9nZ2VyLFxuXHRcdFx0XHR7IGxvZ3NIb21lOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsIGNvbm5lY3Rpb25JZDogcmVzdWx0LmNvbm5lY3Rpb25JZCwgdHJhbnNwb3J0OiAndHVubmVsJyB9LFxuXHRcdFx0KSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBUdW5uZWxSZWxheVRyYW5zcG9ydChyZXN1bHQuY29ubmVjdGlvbklkLCB0aGlzLl9tYWluU2VydmljZSwgbG9nZ2VyKTtcblx0XHRcdHByb3RvY29sQ2xpZW50ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCByZXN1bHQuYWRkcmVzcywgdHJhbnNwb3J0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IENvbm5lY3Rpb24gc2V0dXAgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QocmVzdWx0LmNvbm5lY3Rpb25JZCkuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHQvLyBLZWVwIGFuIGluY29tcGF0aWJsZSBoYW5kc2hha2UgZnJvbSB0ZWFyaW5nIGRvd24gdGhlIHJlbGF5OiB0aGVcblx0XHQvLyBwcm90b2NvbCBjbGllbnQgbXVzdCByZW1haW4gcmVnaXN0ZXJlZCB3aXRoIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlXG5cdFx0Ly8gc28gYHRyaWdnZXJTZXJ2ZXJVcGdyYWRlYCBjYW4gbG9jYXRlIGl0IGFuZCBzZW5kIGBfdnNjb2RlVXBncmFkZWBcblx0XHQvLyBvdmVyIHRoZSBzdGlsbC1vcGVuIHRyYW5zcG9ydC5cblx0XHRsZXQgc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0bGV0IGNvbm5lY3RFcnJvcjogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdG9jb2xDbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFByb3RvY29sIGhhbmRzaGFrZSBjb21wbGV0ZWQgd2l0aCAke3Jlc3VsdC5hZGRyZXNzfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5mcm9tQ29ubmVjdEVycm9yKGVyciwgW1BST1RPQ09MX1ZFUlNJT05dKTtcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShpbmNvbXBhdGlibGUpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGlvbiBzZXR1cCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QocmVzdWx0LmNvbm5lY3Rpb25JZCkuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEluY29tcGF0aWJsZSB3aXRoICR7cmVzdWx0LmFkZHJlc3N9OiAke2luY29tcGF0aWJsZS5tZXNzYWdlfWApO1xuXHRcdFx0c3RhdHVzID0gaW5jb21wYXRpYmxlO1xuXHRcdFx0Y29ubmVjdEVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FjaGVUdW5uZWwodHVubmVsLCBhdXRoLnByb3ZpZGVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKHtcblx0XHRcdFx0bmFtZTogcmVzdWx0Lm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsXG5cdFx0XHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdFx0XHRjbHVzdGVySWQ6IHR1bm5lbC5jbHVzdGVySWQsXG5cdFx0XHRcdFx0bGFiZWw6IHR1bm5lbC5uYW1lLFxuXHRcdFx0XHRcdGF1dGhQcm92aWRlcjogYXV0aC5wcm92aWRlcixcblx0XHRcdFx0fSxcblx0XHRcdH0sIHByb3RvY29sQ2xpZW50LCB1bmRlZmluZWQsIHN0YXR1cyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IGFkZE1hbmFnZWRDb25uZWN0aW9uIGZhaWxlZGAsIGVycik7XG5cdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbm5lY3RFcnJvcikge1xuXHRcdFx0dGhyb3cgY29ubmVjdEVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRpc2Nvbm5lY3QoYWRkcmVzczogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxzLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYW4gYXV0aCB0b2tlbiwgdHJ5aW5nIGNhY2hlZCBzZXNzaW9ucyBmaXJzdCAoc2lsZW50KSxcblx0ICogdGhlbiBwcm9tcHRpbmcgaW50ZXJhY3RpdmVseSBpZiBgc2lsZW50YCBpcyBmYWxzZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldFRva2VuKHNpbGVudDogYm9vbGVhbik6IFByb21pc2U8eyB0b2tlbjogc3RyaW5nOyBwcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gVHJ5IHRoZSBsYXN0IGtub3duIHByb3ZpZGVyIGZpcnN0XG5cdFx0aWYgKHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIodGhpcy5fbGFzdEF1dGhQcm92aWRlciwgc2lsZW50KTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcnkgYm90aCBwcm92aWRlcnMgc2lsZW50bHlcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIFsnZ2l0aHViJywgJ21pY3Jvc29mdCddIGFzIGNvbnN0KSB7XG5cdFx0XHRpZiAocHJvdmlkZXIgPT09IHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIEFscmVhZHkgdHJpZWQgYWJvdmVcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIocHJvdmlkZXIsIHRydWUpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vdCBzaWxlbnQsIHdlIHdvdWxkIG5lZWQgdGhlIGNhbGxlciB0byBwcm9tcHQgZm9yIHByb3ZpZGVyIHNlbGVjdGlvbi5cblx0XHQvLyBSZXR1cm4gdW5kZWZpbmVkIFx1MjAxNCB0aGUgY2FsbGVyIChwcm9tcHRUb0Nvbm5lY3RWaWFUdW5uZWwpIGhhbmRsZXMgdGhlIGludGVyYWN0aXZlIGZsb3cuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSB0b2tlbiBmb3IgYSBzcGVjaWZpYyBhdXRoIHByb3ZpZGVyLlxuXHQgKiBAcGFyYW0gcHJvdmlkZXIgVGhlIGF1dGggcHJvdmlkZXIgdG8gdXNlLlxuXHQgKiBAcGFyYW0gc2lsZW50IElmIHRydWUsIG9ubHkgdHJ5IGNhY2hlZCBzZXNzaW9ucy4gSWYgZmFsc2UsIHByb21wdCB0aGUgdXNlci5cblx0ICovXG5cdHByaXZhdGUgX2dldFNjb3Blc0ZvclByb3ZpZGVyKHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnR1bm5lbEFwcGxpY2F0aW9uQ29uZmlnPy5hdXRoZW50aWNhdGlvblByb3ZpZGVycztcblx0XHRyZXR1cm4gY29uZmlnPy5bcHJvdmlkZXJdPy5zY29wZXMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUb2tlbkZvclByb3ZpZGVyKFxuXHRcdHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLFxuXHRcdHNpbGVudDogYm9vbGVhbixcblx0KTogUHJvbWlzZTx7IHRva2VuOiBzdHJpbmc7IHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gcHJvdmlkZXI7XG5cdFx0Y29uc3Qgc2NvcGVzID0gdGhpcy5fZ2V0U2NvcGVzRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdGlmIChzY29wZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBUcnkgZXhhY3Qgc2NvcGUgbWF0Y2ggZmlyc3Rcblx0XHRcdGxldCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBzY29wZXMsIHt9LCB0cnVlKTtcblxuXHRcdFx0Ly8gRmFsbCBiYWNrOiBmaW5kIGFueSBzZXNzaW9uIHdob3NlIHNjb3BlcyBhcmUgYSBzdXBlcnNldFxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCB1bmRlZmluZWQsIHt9LCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdGVkU2V0ID0gbmV3IFNldChzY29wZXMpO1xuXHRcdFx0XHRsZXQgYmVzdFNlc3Npb246IHR5cGVvZiBhbGxTZXNzaW9uc1tudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgYmVzdEV4dHJhID0gSW5maW5pdHk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBhbGxTZXNzaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25TY29wZXMgPSBuZXcgU2V0KHNlc3Npb24uc2NvcGVzKTtcblx0XHRcdFx0XHRsZXQgaXNTdXBlcnNldCA9IHRydWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiByZXF1ZXN0ZWRTZXQpIHtcblx0XHRcdFx0XHRcdGlmICghc2Vzc2lvblNjb3Blcy5oYXMoc2NvcGUpKSB7XG5cdFx0XHRcdFx0XHRcdGlzU3VwZXJzZXQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc1N1cGVyc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRyYSA9IHNlc3Npb25TY29wZXMuc2l6ZSAtIHJlcXVlc3RlZFNldC5zaXplO1xuXHRcdFx0XHRcdFx0aWYgKGV4dHJhIDwgYmVzdEV4dHJhKSB7XG5cdFx0XHRcdFx0XHRcdGJlc3RFeHRyYSA9IGV4dHJhO1xuXHRcdFx0XHRcdFx0XHRiZXN0U2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChiZXN0U2Vzc2lvbikge1xuXHRcdFx0XHRcdHNlc3Npb25zID0gW2Jlc3RTZXNzaW9uXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnRlcmFjdGl2ZSBmYWxsYmFjazogY3JlYXRlIGEgbmV3IHNlc3Npb25cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDAgJiYgIXNpbGVudCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVzLCB7IGFjdGl2YXRlSW1tZWRpYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRzZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBzZXNzaW9uc1swXS5hY2Nlc3NUb2tlbjtcblx0XHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdEF1dGhQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0XHRcdHJldHVybiB7IHRva2VuLCBwcm92aWRlciB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBnZXQgJHtwcm92aWRlcn0gdG9rZW46ICR7ZXJyfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0QXV0aFByb3ZpZGVyKG9wdGlvbnM/OiB7IHNpbGVudD86IGJvb2xlYW4gfSk6IFByb21pc2U8J2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuKG9wdGlvbnM/LnNpbGVudCA/PyB0cnVlKTtcblx0XHRyZXR1cm4gcmVzdWx0Py5wcm92aWRlcjtcblx0fVxuXG5cdGdldENhY2hlZFR1bm5lbHMoKTogSUNhY2hlZFR1bm5lbFtdIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQ0FDSEVEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGNhY2hlVHVubmVsKHR1bm5lbDogSVR1bm5lbEluZm8sIGF1dGhQcm92aWRlcj86ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IGNhY2hlZC5maWx0ZXIodCA9PiB0LnR1bm5lbElkICE9PSB0dW5uZWwudHVubmVsSWQpO1xuXHRcdGZpbHRlcmVkLnVuc2hpZnQoe1xuXHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdGNsdXN0ZXJJZDogdHVubmVsLmNsdXN0ZXJJZCxcblx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0YXV0aFByb3ZpZGVyLFxuXHRcdH0pO1xuXHRcdHRoaXMuY2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbC50dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVDYWNoZWRUdW5uZWxzKGZpbHRlcmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZmlyZSgpO1xuXHR9XG5cblx0cmVtb3ZlQ2FjaGVkVHVubmVsKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHR0aGlzLl9zdG9yZUNhY2hlZFR1bm5lbHMoY2FjaGVkLmZpbHRlcih0ID0+IHQudHVubmVsSWQgIT09IHR1bm5lbElkKSk7XG5cdFx0dGhpcy5jbGVhckF1dG9Db25uZWN0U3VwcHJlc3Npb24odHVubmVsSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblxuXHRpc0F1dG9Db25uZWN0U3VwcHJlc3NlZCh0dW5uZWxJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKS5oYXModHVubmVsSWQpO1xuXHR9XG5cblx0c3VwcHJlc3NBdXRvQ29ubmVjdCh0dW5uZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZCA9IHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKTtcblx0XHRzdXBwcmVzc2VkLmFkZCh0dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKHN1cHByZXNzZWQpO1xuXHR9XG5cblx0Y2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwcmVzc2VkID0gdGhpcy5fZ2V0QXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscygpO1xuXHRcdGlmICghc3VwcHJlc3NlZC5kZWxldGUodHVubmVsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JlQXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyhzdXBwcmVzc2VkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlQ2FjaGVkVHVubmVscyh0dW5uZWxzOiBJQ2FjaGVkVHVubmVsW10pOiB2b2lkIHtcblx0XHRpZiAodHVubmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDQUNIRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENBQ0hFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkodHVubmVscyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQVVUT19DT05ORUNUX1NVUFBSRVNTRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZXQocGFyc2VkLmZpbHRlcihpdGVtID0+IHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZUF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHModHVubmVsSWRzOiBTZXQ8c3RyaW5nPik6IHZvaWQge1xuXHRcdGlmICh0dW5uZWxJZHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFVVE9fQ09OTkVDVF9TVVBQUkVTU0VEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnR1bm5lbElkc10pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04s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
