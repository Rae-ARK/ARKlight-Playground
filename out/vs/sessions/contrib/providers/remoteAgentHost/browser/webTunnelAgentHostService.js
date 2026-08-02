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
import { RemoteAgentHostProtocolClient } from "../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../../../../../platform/agentHost/common/agentHostClientInfo.js";
import { RemoteAgentHostEntryType, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from "../../../../../platform/agentHost/common/transportConstants.js";
import {
  TUNNEL_ADDRESS_PREFIX,
  TUNNEL_MIN_PROTOCOL_VERSION,
  TunnelTags
} from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../../../workbench/services/environment/browser/environmentService.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
const LOG_PREFIX = "[WebTunnelAgentHost]";
const CACHED_TUNNELS_KEY = "tunnelAgentHost.recentTunnels";
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = "tunnelAgentHost.autoConnectSuppressedTunnels";
let WebTunnelAgentHostService = class extends Disposable {
  constructor(_remoteAgentHostService, environmentService, _logService, _instantiationService, _configurationService, _authenticationService, _storageService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._storageService = _storageService;
    this._onDidChangeTunnels = this._register(new Emitter());
    this.onDidChangeTunnels = this._onDidChangeTunnels.event;
    this._discoveryProvider = environmentService.options?.tunnelDiscoveryProvider;
    if (!this._discoveryProvider) {
      this._logService.debug(`${LOG_PREFIX} No tunnelDiscoveryProvider \u2014 tunnel discovery disabled`);
    }
  }
  // Discovery
  async listTunnels(options) {
    if (!this._discoveryProvider) {
      return [];
    }
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return [];
    }
    try {
      const discovered = await this._discoveryProvider.listTunnels();
      const results = [];
      let droppedByProtocolVersion = 0;
      let withoutIds = 0;
      for (const tunnel of discovered) {
        const info = this._toTunnelInfo(tunnel);
        if (!info) {
          withoutIds++;
          continue;
        }
        if (info.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
          droppedByProtocolVersion++;
          this._logService.debug(
            `${LOG_PREFIX} Dropping tunnel ${info.tunnelId} (protocolVersion=${info.protocolVersion} < ${TUNNEL_MIN_PROTOCOL_VERSION})`
          );
          continue;
        }
        results.push(info);
      }
      const withActiveHost = results.filter((t) => t.hostConnectionCount > 0).length;
      this._logService.info(
        `${LOG_PREFIX} Discovery complete: total=${discovered.length}, accepted=${results.length}, withActiveHost=${withActiveHost}, droppedByProtocolVersion=${droppedByProtocolVersion}, droppedMissingIds=${withoutIds}`
      );
      return results;
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Failed to list tunnels`, err);
      return [];
    }
  }
  _toTunnelInfo(tunnel) {
    if (!tunnel.tunnelId || !tunnel.clusterId) {
      return void 0;
    }
    const tags = new TunnelTags(tunnel.tags);
    return {
      tunnelId: tunnel.tunnelId,
      clusterId: tunnel.clusterId,
      name: tags.name || tunnel.name || tunnel.tunnelId,
      tags: tunnel.tags,
      protocolVersion: tags.protocolVersion,
      hostConnectionCount: tunnel.hostConnectionCount
    };
  }
  // Connection (via embedder)
  async connect(tunnel, authProvider) {
    if (!this._discoveryProvider) {
      throw new Error("No tunnelDiscoveryProvider available");
    }
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const { tunnelId, clusterId } = tunnel;
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnelId})`);
    const connection = await this._discoveryProvider.connect(tunnelId, clusterId);
    const connectionToken = await deriveConnectionToken(tunnelId);
    const transport = new TunnelConnectionTransport(connection, this._logService);
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    const protocolClient = this._instantiationService.createInstance(
      RemoteAgentHostProtocolClient,
      address,
      transport,
      void 0,
      void 0,
      agentsWindowAgentHostClientInfo
    );
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        protocolClient.dispose();
        this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
        throw err;
      }
      this._logService.warn(`${LOG_PREFIX} Incompatible with ${address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    this.cacheTunnel(tunnel, authProvider);
    try {
      await this._remoteAgentHostService.addManagedConnection({
        name: tunnel.name,
        connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId,
          clusterId,
          label: tunnel.name,
          authProvider
        }
      }, protocolClient, void 0, status);
    } catch (err) {
      protocolClient.dispose();
      this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
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
  // Auth
  async getAuthProvider(options) {
    for (const provider of ["github", "microsoft"]) {
      const sessions = await this._authenticationService.getSessions(provider, void 0, {}, true);
      if (sessions.length > 0) {
        return provider;
      }
    }
    return void 0;
  }
  // Tunnel cache
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
WebTunnelAgentHostService = __decorateClass([
  __decorateParam(0, IRemoteAgentHostService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IStorageService)
], WebTunnelAgentHostService);
class TunnelConnectionTransport extends Disposable {
  constructor(_connection, _logService) {
    super();
    this._connection = _connection;
    this._logService = _logService;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._malformedFrames = 0;
    this._register(_connection.onMessage((data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch (err) {
        this._malformedFrames++;
        if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
          const preview = data.length > 80 ? data.slice(0, 80) + "\u2026" : data;
          this._logService.warn(
            `[TunnelConnectionTransport] Malformed frame #${this._malformedFrames} (len=${data.length}): ${preview}`,
            err instanceof Error ? err.message : String(err)
          );
        }
        if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
          this._logService.warn(
            "[TunnelConnectionTransport] Malformed frame threshold exceeded; forcing tunnel close."
          );
          this._connection.close();
        }
        return;
      }
      this._onMessage.fire(message);
    }));
    this._register(_connection.onClose(() => {
      this._onClose.fire();
    }));
  }
  send(message) {
    this._connection.send(JSON.stringify(message));
  }
  dispose() {
    this._connection.close();
    super.dispose();
  }
}
async function deriveConnectionToken(tunnelId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(tunnelId);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let result = btoa(String.fromCharCode(...hashArray)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (result.startsWith("-")) {
    result = "a" + result;
  }
  return result;
}
export {
  WebTunnelAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3dlYlR1bm5lbEFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSwgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvdG9jb2xUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25UcmFuc3BvcnQuanMnO1xuaW1wb3J0IHR5cGUgeyBQcm90b2NvbE1lc3NhZ2UsIEFocFNlcnZlck5vdGlmaWNhdGlvbiwgSnNvblJwY1Jlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTUFMRk9STUVEX0ZSQU1FU19GT1JDRV9DTE9TRV9USFJFU0hPTEQsIE1BTEZPUk1FRF9GUkFNRVNfTE9HX0NBUCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHJhbnNwb3J0Q29uc3RhbnRzLmpzJztcbmltcG9ydCB7XG5cdElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlLFxuXHRUVU5ORUxfQUREUkVTU19QUkVGSVgsXG5cdFRVTk5FTF9NSU5fUFJPVE9DT0xfVkVSU0lPTixcblx0VHVubmVsVGFncyxcblx0dHlwZSBJQ2FjaGVkVHVubmVsLFxuXHR0eXBlIElUdW5uZWxJbmZvLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJRGlzY292ZXJlZFR1bm5lbCwgSVR1bm5lbENvbm5lY3Rpb24sIElUdW5uZWxEaXNjb3ZlcnlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3dlYi5hcGkuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuXG5jb25zdCBMT0dfUFJFRklYID0gJ1tXZWJUdW5uZWxBZ2VudEhvc3RdJztcblxuLyoqIFN0b3JhZ2Uga2V5IGZvciByZWNlbnRseSB1c2VkIHR1bm5lbCBjYWNoZS4gKi9cbmNvbnN0IENBQ0hFRF9UVU5ORUxTX0tFWSA9ICd0dW5uZWxBZ2VudEhvc3QucmVjZW50VHVubmVscyc7XG4vKiogU3RvcmFnZSBrZXkgZm9yIHR1bm5lbHMgdGhlIHVzZXIgZXhwbGljaXRseSBkaXNjb25uZWN0ZWQuICovXG5jb25zdCBBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSA9ICd0dW5uZWxBZ2VudEhvc3QuYXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyc7XG5cbi8qKlxuICogV2ViIChicm93c2VyKSBpbXBsZW1lbnRhdGlvbiBvZiB7QGxpbmsgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2V9LlxuICpcbiAqIERlbGVnYXRlcyB0byB0aGUgZW1iZWRkZXIncyB7QGxpbmsgSVR1bm5lbERpc2NvdmVyeVByb3ZpZGVyfSAocHJvdmlkZWQgdmlhXG4gKiBgSVdvcmtiZW5jaENvbnN0cnVjdGlvbk9wdGlvbnMudHVubmVsRGlzY292ZXJ5UHJvdmlkZXJgKSBmb3I6XG4gKiAtICoqRGlzY292ZXJ5Kio6IGxpc3RpbmcgYXZhaWxhYmxlIGFnZW50IGhvc3QgdHVubmVsc1xuICogLSAqKlJlbGF5IGFkZHJlc3MqKjogb2J0YWluaW5nIHRoZSBXZWJTb2NrZXQgcHJveHkgVVJMIGZvciBjb25uZWN0aW5nXG4gKlxuICogVGhpcyBkZWNvdXBsZXMgVlMgQ29kZSBjb3JlIGZyb20gYW55IHNwZWNpZmljIGVtYmVkZGVyICh2c2NvZGUuZGV2LFxuICogZ2l0aHViLmRldiwgZXRjLikuIFRoZSBlbWJlZGRlciBoYW5kbGVzIHRoZSBhY3R1YWwgRGV2IFR1bm5lbHMgQVBJXG4gKiBjYWxscyBhbmQgcmVsYXkgcHJveHlpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBXZWJUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUdW5uZWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHVubmVsczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY292ZXJ5UHJvdmlkZXI6IElUdW5uZWxEaXNjb3ZlcnlQcm92aWRlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kaXNjb3ZlcnlQcm92aWRlciA9IGVudmlyb25tZW50U2VydmljZS5vcHRpb25zPy50dW5uZWxEaXNjb3ZlcnlQcm92aWRlcjtcblx0XHRpZiAoIXRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke0xPR19QUkVGSVh9IE5vIHR1bm5lbERpc2NvdmVyeVByb3ZpZGVyIFx1MjAxNCB0dW5uZWwgZGlzY292ZXJ5IGRpc2FibGVkYCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRGlzY292ZXJ5XG5cblx0YXN5bmMgbGlzdFR1bm5lbHMob3B0aW9ucz86IHsgc2lsZW50PzogYm9vbGVhbiB9KTogUHJvbWlzZTxJVHVubmVsSW5mb1tdPiB7XG5cdFx0aWYgKCF0aGlzLl9kaXNjb3ZlcnlQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFRoZSBlbWJlZGRlciBhY3F1aXJlcyB0b2tlbnMgaW50ZXJuYWxseSB2aWEgaXRzIG93biBhdXRoIGZsb3dcblx0XHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlcnlQcm92aWRlci5saXN0VHVubmVscygpO1xuXHRcdFx0Y29uc3QgcmVzdWx0czogSVR1bm5lbEluZm9bXSA9IFtdO1xuXHRcdFx0bGV0IGRyb3BwZWRCeVByb3RvY29sVmVyc2lvbiA9IDA7XG5cdFx0XHRsZXQgd2l0aG91dElkcyA9IDA7XG5cblx0XHRcdGZvciAoY29uc3QgdHVubmVsIG9mIGRpc2NvdmVyZWQpIHtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX3RvVHVubmVsSW5mbyh0dW5uZWwpO1xuXHRcdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0XHR3aXRob3V0SWRzKys7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGluZm8ucHJvdG9jb2xWZXJzaW9uIDwgVFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OKSB7XG5cdFx0XHRcdFx0ZHJvcHBlZEJ5UHJvdG9jb2xWZXJzaW9uKys7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1Zyhcblx0XHRcdFx0XHRcdGAke0xPR19QUkVGSVh9IERyb3BwaW5nIHR1bm5lbCAke2luZm8udHVubmVsSWR9IChwcm90b2NvbFZlcnNpb249JHtpbmZvLnByb3RvY29sVmVyc2lvbn0gPCAke1RVTk5FTF9NSU5fUFJPVE9DT0xfVkVSU0lPTn0pYFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0cy5wdXNoKGluZm8pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aXRoQWN0aXZlSG9zdCA9IHJlc3VsdHMuZmlsdGVyKHQgPT4gdC5ob3N0Q29ubmVjdGlvbkNvdW50ID4gMCkubGVuZ3RoO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0XHRgJHtMT0dfUFJFRklYfSBEaXNjb3ZlcnkgY29tcGxldGU6IHRvdGFsPSR7ZGlzY292ZXJlZC5sZW5ndGh9LCBhY2NlcHRlZD0ke3Jlc3VsdHMubGVuZ3RofSwgd2l0aEFjdGl2ZUhvc3Q9JHt3aXRoQWN0aXZlSG9zdH0sIGRyb3BwZWRCeVByb3RvY29sVmVyc2lvbj0ke2Ryb3BwZWRCeVByb3RvY29sVmVyc2lvbn0sIGRyb3BwZWRNaXNzaW5nSWRzPSR7d2l0aG91dElkc31gXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdHM7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBsaXN0IHR1bm5lbHNgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvVHVubmVsSW5mbyh0dW5uZWw6IElEaXNjb3ZlcmVkVHVubmVsKTogSVR1bm5lbEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdHVubmVsLnR1bm5lbElkIHx8ICF0dW5uZWwuY2x1c3RlcklkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhZ3MgPSBuZXcgVHVubmVsVGFncyh0dW5uZWwudGFncyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdGNsdXN0ZXJJZDogdHVubmVsLmNsdXN0ZXJJZCxcblx0XHRcdG5hbWU6IHRhZ3MubmFtZSB8fCB0dW5uZWwubmFtZSB8fCB0dW5uZWwudHVubmVsSWQsXG5cdFx0XHR0YWdzOiB0dW5uZWwudGFncyBhcyBzdHJpbmdbXSxcblx0XHRcdHByb3RvY29sVmVyc2lvbjogdGFncy5wcm90b2NvbFZlcnNpb24sXG5cdFx0XHRob3N0Q29ubmVjdGlvbkNvdW50OiB0dW5uZWwuaG9zdENvbm5lY3Rpb25Db3VudCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gQ29ubmVjdGlvbiAodmlhIGVtYmVkZGVyKVxuXG5cdGFzeW5jIGNvbm5lY3QodHVubmVsOiBJVHVubmVsSW5mbywgYXV0aFByb3ZpZGVyPzogJ2dpdGh1YicgfCAnbWljcm9zb2Z0Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZGlzY292ZXJ5UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gdHVubmVsRGlzY292ZXJ5UHJvdmlkZXIgYXZhaWxhYmxlJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IHR1bm5lbElkLCBjbHVzdGVySWQgfSA9IHR1bm5lbDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGluZyB0byB0dW5uZWwgJyR7dHVubmVsLm5hbWV9JyAoJHt0dW5uZWxJZH0pYCk7XG5cblx0XHQvLyBUaGUgZW1iZWRkZXIgaGFuZGxlcyB0aGUgZnVsbCBjb25uZWN0aW9uIGluY2x1ZGluZyBhdXRoXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyLmNvbm5lY3QodHVubmVsSWQsIGNsdXN0ZXJJZCk7XG5cblx0XHQvLyBEZXJpdmUgY29ubmVjdGlvbiB0b2tlbiBmcm9tIHR1bm5lbCBJRCAoc2FtZSBjb252ZW50aW9uIGFzIENMSSBhbmQgZGVza3RvcClcblx0XHRjb25zdCBjb25uZWN0aW9uVG9rZW4gPSBhd2FpdCBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQpO1xuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gbmV3IFR1bm5lbENvbm5lY3Rpb25UcmFuc3BvcnQoY29ubmVjdGlvbiwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3R1bm5lbElkfWA7XG5cdFx0Y29uc3QgcHJvdG9jb2xDbGllbnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCBhZGRyZXNzLCB0cmFuc3BvcnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvLFxuXHRcdCk7XG5cblx0XHQvLyBLZWVwIGFuIGluY29tcGF0aWJsZSBoYW5kc2hha2UgZnJvbSB0ZWFyaW5nIGRvd24gdGhlIHJlbGF5OiB0aGVcblx0XHQvLyBwcm90b2NvbCBjbGllbnQgbXVzdCByZW1haW4gcmVnaXN0ZXJlZCB3aXRoIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlXG5cdFx0Ly8gc28gYHRyaWdnZXJTZXJ2ZXJVcGdyYWRlYCBjYW4gbG9jYXRlIGl0IGFuZCBzZW5kIGBfdnNjb2RlVXBncmFkZWBcblx0XHQvLyBvdmVyIHRoZSBzdGlsbC1vcGVuIHRyYW5zcG9ydC5cblx0XHRsZXQgc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0bGV0IGNvbm5lY3RFcnJvcjogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdG9jb2xDbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFByb3RvY29sIGhhbmRzaGFrZSBjb21wbGV0ZWQgd2l0aCAke2FkZHJlc3N9YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCBpbmNvbXBhdGlibGUgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmZyb21Db25uZWN0RXJyb3IoZXJyLCBbUFJPVE9DT0xfVkVSU0lPTl0pO1xuXHRcdFx0aWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKGluY29tcGF0aWJsZSkpIHtcblx0XHRcdFx0cHJvdG9jb2xDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IENvbm5lY3Rpb24gc2V0dXAgZmFpbGVkYCwgZXJyKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEluY29tcGF0aWJsZSB3aXRoICR7YWRkcmVzc306ICR7aW5jb21wYXRpYmxlLm1lc3NhZ2V9YCk7XG5cdFx0XHRzdGF0dXMgPSBpbmNvbXBhdGlibGU7XG5cdFx0XHRjb25uZWN0RXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FjaGUgYmVmb3JlIGFubm91bmNpbmcgdGhlIGxpdmUgY29ubmVjdGlvbiBzbyB0aGUgY29udHJpYnV0aW9uJ3Ncblx0XHQvLyBgb25EaWRDaGFuZ2VUdW5uZWxzYCBoYW5kbGVyIGhhcyBjcmVhdGVkIHRoZSBwcm92aWRlciBieSB0aGUgdGltZVxuXHRcdC8vIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBmaXJlcyBmcm9tIGBhZGRNYW5hZ2VkQ29ubmVjdGlvbmAgYW5kXG5cdFx0Ly8gd2lyZXMgdGhlIGNvbm5lY3Rpb24uIEFsc28gZmlyZXMgYG9uRGlkQ2hhbmdlVHVubmVsc2AuXG5cdFx0dGhpcy5jYWNoZVR1bm5lbCh0dW5uZWwsIGF1dGhQcm92aWRlcik7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5hZGRNYW5hZ2VkQ29ubmVjdGlvbih7XG5cdFx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdGNvbm5lY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuVHVubmVsLFxuXHRcdFx0XHRcdHR1bm5lbElkLFxuXHRcdFx0XHRcdGNsdXN0ZXJJZCxcblx0XHRcdFx0XHRsYWJlbDogdHVubmVsLm5hbWUsXG5cdFx0XHRcdFx0YXV0aFByb3ZpZGVyLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgcHJvdG9jb2xDbGllbnQsIHVuZGVmaW5lZCwgc3RhdHVzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHByb3RvY29sQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gYWRkTWFuYWdlZENvbm5lY3Rpb24gZmFpbGVkYCwgZXJyKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHRpZiAoY29ubmVjdEVycm9yKSB7XG5cdFx0XHR0aHJvdyBjb25uZWN0RXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLnJlbW92ZVJlbW90ZUFnZW50SG9zdChhZGRyZXNzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZmlyZSgpO1xuXHR9XG5cblx0Ly8gQXV0aFxuXG5cdGFzeW5jIGdldEF1dGhQcm92aWRlcihvcHRpb25zPzogeyBzaWxlbnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPCdnaXRodWInIHwgJ21pY3Jvc29mdCcgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIFsnZ2l0aHViJywgJ21pY3Jvc29mdCddIGFzIGNvbnN0KSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlciwgdW5kZWZpbmVkLCB7fSwgdHJ1ZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gcHJvdmlkZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBUdW5uZWwgY2FjaGVcblxuXHRnZXRDYWNoZWRUdW5uZWxzKCk6IElDYWNoZWRUdW5uZWxbXSB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KENBQ0hFRF9UVU5ORUxTX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRjYWNoZVR1bm5lbCh0dW5uZWw6IElUdW5uZWxJbmZvLCBhdXRoUHJvdmlkZXI/OiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5nZXRDYWNoZWRUdW5uZWxzKCk7XG5cdFx0Y29uc3QgZmlsdGVyZWQgPSBjYWNoZWQuZmlsdGVyKHQgPT4gdC50dW5uZWxJZCAhPT0gdHVubmVsLnR1bm5lbElkKTtcblx0XHRmaWx0ZXJlZC51bnNoaWZ0KHtcblx0XHRcdHR1bm5lbElkOiB0dW5uZWwudHVubmVsSWQsXG5cdFx0XHRjbHVzdGVySWQ6IHR1bm5lbC5jbHVzdGVySWQsXG5cdFx0XHRuYW1lOiB0dW5uZWwubmFtZSxcblx0XHRcdGF1dGhQcm92aWRlcixcblx0XHR9KTtcblx0XHR0aGlzLmNsZWFyQXV0b0Nvbm5lY3RTdXBwcmVzc2lvbih0dW5uZWwudHVubmVsSWQpO1xuXHRcdHRoaXMuX3N0b3JlQ2FjaGVkVHVubmVscyhmaWx0ZXJlZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxzLmZpcmUoKTtcblx0fVxuXG5cdHJlbW92ZUNhY2hlZFR1bm5lbCh0dW5uZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5nZXRDYWNoZWRUdW5uZWxzKCk7XG5cdFx0dGhpcy5fc3RvcmVDYWNoZWRUdW5uZWxzKGNhY2hlZC5maWx0ZXIodCA9PiB0LnR1bm5lbElkICE9PSB0dW5uZWxJZCkpO1xuXHRcdHRoaXMuY2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbElkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZmlyZSgpO1xuXHR9XG5cblx0aXNBdXRvQ29ubmVjdFN1cHByZXNzZWQodHVubmVsSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9nZXRBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKCkuaGFzKHR1bm5lbElkKTtcblx0fVxuXG5cdHN1cHByZXNzQXV0b0Nvbm5lY3QodHVubmVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN1cHByZXNzZWQgPSB0aGlzLl9nZXRBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKCk7XG5cdFx0c3VwcHJlc3NlZC5hZGQodHVubmVsSWQpO1xuXHRcdHRoaXMuX3N0b3JlQXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyhzdXBwcmVzc2VkKTtcblx0fVxuXG5cdGNsZWFyQXV0b0Nvbm5lY3RTdXBwcmVzc2lvbih0dW5uZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZCA9IHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKTtcblx0XHRpZiAoIXN1cHByZXNzZWQuZGVsZXRlKHR1bm5lbElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yZUF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoc3VwcHJlc3NlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZUNhY2hlZFR1bm5lbHModHVubmVsczogSUNhY2hlZFR1bm5lbFtdKTogdm9pZCB7XG5cdFx0aWYgKHR1bm5lbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoQ0FDSEVEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDQUNIRURfVFVOTkVMU19LRVksIEpTT04uc3RyaW5naWZ5KHR1bm5lbHMpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KEFVVE9fQ09OTkVDVF9TVVBQUkVTU0VEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkOiB1bmtub3duID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgU2V0KHBhcnNlZC5maWx0ZXIoaXRlbSA9PiB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcmVBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKHR1bm5lbElkczogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHRpZiAodHVubmVsSWRzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQVVUT19DT05ORUNUX1NVUFBSRVNTRURfVFVOTkVMU19LRVksIEpTT04uc3RyaW5naWZ5KFsuLi50dW5uZWxJZHNdKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEFkYXB0cyBhbiB7QGxpbmsgSVR1bm5lbENvbm5lY3Rpb259IChlbWJlZGRlci1wcm92aWRlZCkgaW50byBhblxuICoge0BsaW5rIElQcm90b2NvbFRyYW5zcG9ydH0gZm9yIHtAbGluayBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudH0uXG4gKlxuICogVGhlIGNvbm5lY3Rpb24gaXMgYWxyZWFkeSBlc3RhYmxpc2hlZCBieSB0aGUgdGltZSB0aGlzIGFkYXB0ZXIgaXMgY3JlYXRlZCxcbiAqIHNvIHRoZXJlIGlzIG5vIGBjb25uZWN0KClgIG1ldGhvZCBcdTIwMTQgdGhlIHByb3RvY29sIGNsaWVudCBza2lwcyB0aGF0IHN0ZXAuXG4gKi9cbmNsYXNzIFR1bm5lbENvbm5lY3Rpb25UcmFuc3BvcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb3RvY29sVHJhbnNwb3J0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25NZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UHJvdG9jb2xNZXNzYWdlPigpKTtcblx0cmVhZG9ubHkgb25NZXNzYWdlID0gdGhpcy5fb25NZXNzYWdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25DbG9zZSA9IHRoaXMuX29uQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbWFsZm9ybWVkRnJhbWVzID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uOiBJVHVubmVsQ29ubmVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfY29ubmVjdGlvbi5vbk1lc3NhZ2UoKGRhdGE6IHN0cmluZykgPT4ge1xuXHRcdFx0bGV0IG1lc3NhZ2U6IFByb3RvY29sTWVzc2FnZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBKU09OLnBhcnNlKGRhdGEpIGFzIFByb3RvY29sTWVzc2FnZTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9tYWxmb3JtZWRGcmFtZXMrKztcblx0XHRcdFx0aWYgKHRoaXMuX21hbGZvcm1lZEZyYW1lcyA8PSBNQUxGT1JNRURfRlJBTUVTX0xPR19DQVApIHtcblx0XHRcdFx0XHRjb25zdCBwcmV2aWV3ID0gZGF0YS5sZW5ndGggPiA4MCA/IGRhdGEuc2xpY2UoMCwgODApICsgJ1x1MjAyNicgOiBkYXRhO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2Fybihcblx0XHRcdFx0XHRcdGBbVHVubmVsQ29ubmVjdGlvblRyYW5zcG9ydF0gTWFsZm9ybWVkIGZyYW1lICMke3RoaXMuX21hbGZvcm1lZEZyYW1lc30gKGxlbj0ke2RhdGEubGVuZ3RofSk6ICR7cHJldmlld31gLFxuXHRcdFx0XHRcdFx0ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fbWFsZm9ybWVkRnJhbWVzID4gTUFMRk9STUVEX0ZSQU1FU19GT1JDRV9DTE9TRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oXG5cdFx0XHRcdFx0XHQnW1R1bm5lbENvbm5lY3Rpb25UcmFuc3BvcnRdIE1hbGZvcm1lZCBmcmFtZSB0aHJlc2hvbGQgZXhjZWVkZWQ7IGZvcmNpbmcgdHVubmVsIGNsb3NlLidcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uY2xvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbk1lc3NhZ2UuZmlyZShtZXNzYWdlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2Nvbm5lY3Rpb24ub25DbG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkNsb3NlLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZW5kKG1lc3NhZ2U6IFByb3RvY29sTWVzc2FnZSB8IEFocFNlcnZlck5vdGlmaWNhdGlvbiB8IEpzb25ScGNSZXNwb25zZSk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24uc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24uY2xvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXJpdmUgYSBjb25uZWN0aW9uIHRva2VuIGZyb20gYSB0dW5uZWwgSUQgdXNpbmcgdGhlIHNhbWUgY29udmVudGlvblxuICogYXMgdGhlIFZTIENvZGUgQ0xJIGFuZCB0aGUgZGVza3RvcCBzaGFyZWQtcHJvY2VzcyBzZXJ2aWNlLlxuICovXG5hc3luYyBmdW5jdGlvbiBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IGVuY29kZXIgPSBuZXcgVGV4dEVuY29kZXIoKTtcblx0Y29uc3QgZGF0YSA9IGVuY29kZXIuZW5jb2RlKHR1bm5lbElkKTtcblx0Y29uc3QgaGFzaEJ1ZmZlciA9IGF3YWl0IGdsb2JhbFRoaXMuY3J5cHRvLnN1YnRsZS5kaWdlc3QoJ1NIQS0yNTYnLCBkYXRhKTtcblx0Y29uc3QgaGFzaEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoaGFzaEJ1ZmZlcik7XG5cblx0Ly8gQmFzZTY0dXJsIGVuY29kZSAobWF0Y2hlcyBOb2RlJ3MgY3JlYXRlSGFzaCgnc2hhMjU2JykuZGlnZXN0KCdiYXNlNjR1cmwnKSlcblx0bGV0IHJlc3VsdCA9IGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZSguLi5oYXNoQXJyYXkpKVxuXHRcdC5yZXBsYWNlKC9cXCsvZywgJy0nKVxuXHRcdC5yZXBsYWNlKC9cXC8vZywgJ18nKVxuXHRcdC5yZXBsYWNlKC89KyQvLCAnJyk7XG5cblx0aWYgKHJlc3VsdC5zdGFydHNXaXRoKCctJykpIHtcblx0XHRyZXN1bHQgPSAnYScgKyByZXN1bHQ7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDBCQUEwQix5QkFBeUIsaUNBQWlDLHdDQUF3QztBQUNySSxTQUFTLHdCQUF3QjtBQUdqQyxTQUFTLHdDQUF3QyxnQ0FBZ0M7QUFDakY7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUdNO0FBQ1AsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFFN0QsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSxhQUFhO0FBR25CLE1BQU0scUJBQXFCO0FBRTNCLE1BQU0sc0NBQXNDO0FBY3JDLElBQU0sNEJBQU4sY0FBd0MsV0FBOEM7QUFBQSxFQVE1RixZQUMyQyx5QkFDTCxvQkFDUCxhQUNVLHVCQUNBLHVCQUNDLHdCQUNQLGlCQUNqQztBQUNELFVBQU07QUFSb0M7QUFFWjtBQUNVO0FBQ0E7QUFDQztBQUNQO0FBWm5DLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDekUsU0FBUyxxQkFBa0MsS0FBSyxvQkFBb0I7QUFjbkUsU0FBSyxxQkFBcUIsbUJBQW1CLFNBQVM7QUFDdEQsUUFBSSxDQUFDLEtBQUssb0JBQW9CO0FBQzdCLFdBQUssWUFBWSxNQUFNLEdBQUcsVUFBVSw4REFBeUQ7QUFBQSxJQUM5RjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSUEsTUFBTSxZQUFZLFNBQXdEO0FBQ3pFLFFBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QixhQUFPLENBQUM7QUFB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
