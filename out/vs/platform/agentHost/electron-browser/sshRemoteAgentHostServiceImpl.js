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
import { Emitter } from "../../../base/common/event.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { ISharedProcessService } from "../../ipc/electron-browser/services.js";
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from "../common/remoteAgentHostService.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IQuickInputService } from "../../quickinput/common/quickInput.js";
import { AhpJsonlLogger } from "../common/ahpJsonlLogger.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../common/agentService.js";
import { SSHRelayTransport } from "./sshRelayTransport.js";
import { RemoteAgentHostProtocolClient } from "../browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../common/agentHostClientInfo.js";
import { PROTOCOL_VERSION } from "../common/state/protocol/version/registry.js";
import {
  SSH_REMOTE_AGENT_HOST_CHANNEL
} from "../common/sshRemoteAgentHost.js";
const ISSHRelayClientFactory = createDecorator("sshRelayClientFactory");
let SSHRelayClientFactory = class {
  constructor(_instantiationService, _configurationService, _environmentService) {
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
  }
  createClient(mainService, connectionId, address) {
    const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
    const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
      AhpJsonlLogger,
      { logsHome: this._environmentService.logsHome, connectionId, transport: "ssh" }
    ) : void 0;
    const transport = this._instantiationService.createInstance(SSHRelayTransport, connectionId, mainService, logger);
    return this._instantiationService.createInstance(RemoteAgentHostProtocolClient, address, transport, void 0, void 0, agentsWindowAgentHostClientInfo);
  }
};
SSHRelayClientFactory = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentService)
], SSHRelayClientFactory);
let SSHRemoteAgentHostService = class extends Disposable {
  constructor(sharedProcessService, _remoteAgentHostService, _logService, _configurationService, _relayClientFactory, _quickInputService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._relayClientFactory = _relayClientFactory;
    this._quickInputService = _quickInputService;
    this._onDidChangeConnections = this._register(new Emitter());
    this.onDidChangeConnections = this._onDidChangeConnections.event;
    this._connections = /* @__PURE__ */ new Map();
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(SSH_REMOTE_AGENT_HOST_CHANNEL)
    );
    this.onDidReportConnectProgress = this._mainService.onDidReportConnectProgress;
    this._register(this._mainService.onDidCloseConnection((connectionId) => {
      this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: connectionId=${connectionId}`);
      const handle = this._connections.get(connectionId);
      if (handle) {
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: found handle for ${connectionId}, cleaning up`);
        this._connections.delete(connectionId);
        handle.fireClose();
        handle.dispose();
        this._onDidChangeConnections.fire();
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: notifying protocol client for ${handle.localAddress}`);
        this._remoteAgentHostService.notifyConnectionClosed(handle.localAddress);
      } else {
        this._logService.info(`[SSHRemoteAgentHost] onDidCloseConnection: no renderer-side handle for ${connectionId} (already cleaned up?)`);
      }
    }));
    this._register(this._mainService.onDidRequestKeyboardInteractive((request) => {
      this._handleKeyboardInteractiveRequest(request);
    }));
  }
  get connections() {
    return [...this._connections.values()];
  }
  async connect(config) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const augmentedConfig = this._augmentConfig(config);
    this._logService.info(`[SSHRemoteAgentHost] Connecting to ${config.host}`);
    const result = await this._mainService.connect(augmentedConfig);
    this._logService.trace(`[SSHRemoteAgentHost] SSH tunnel established, connectionId=${result.connectionId}`);
    return this._setupConnection(result);
  }
  async disconnect(host) {
    await this._mainService.disconnect(host);
  }
  async listSSHConfigHosts() {
    return this._mainService.listSSHConfigHosts();
  }
  async ensureUserSSHConfig() {
    return this._mainService.ensureUserSSHConfig();
  }
  async listSSHConfigFiles() {
    return this._mainService.listSSHConfigFiles();
  }
  async resolveSSHConfig(host) {
    return this._mainService.resolveSSHConfig(host);
  }
  async reconnect(sshConfigHost, name) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const commandOverride = this._getRemoteAgentHostCommand();
    const agentForward = this._isSSHAgentForwardingEnabled();
    this._logService.info(`[SSHRemoteAgentHost] Reconnecting to ${sshConfigHost}`);
    const result = await this._mainService.reconnect(sshConfigHost, name, commandOverride, agentForward);
    return this._setupConnection(result);
  }
  /**
   * Build the renderer-side handle, do the protocol handshake, and register
   * with IRemoteAgentHostService. Any failure after the shared-process tunnel
   * was established tears it back down so we don't leak it.
   */
  async _setupConnection(result) {
    const existing = this._connections.get(result.connectionId);
    if (existing) {
      if (this._remoteAgentHostService.getConnection(result.address)) {
        this._logService.trace("[SSHRemoteAgentHost] Returning existing connection handle");
        return existing;
      }
      this._logService.info(`[SSHRemoteAgentHost] Replacing stale connection handle for ${result.address}`);
      this._connections.delete(result.connectionId);
      existing.fireClose();
      existing.dispose();
      this._onDidChangeConnections.fire();
    }
    let registeredHandle = false;
    const protocolClient = this._createRelayClient(result);
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.trace("[SSHRemoteAgentHost] Protocol handshake completed");
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        this._logService.error("[SSHRemoteAgentHost] Connection setup failed", err);
        protocolClient.dispose();
        this._mainService.disconnect(result.connectionId).catch(() => {
        });
        throw err;
      }
      this._logService.warn(`[SSHRemoteAgentHost] Incompatible with ${result.address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    const handle = new SSHAgentHostConnectionHandle(
      result.config,
      result.address,
      result.name,
      () => this._mainService.disconnect(result.connectionId)
    );
    try {
      this._connections.set(result.connectionId, handle);
      registeredHandle = true;
      this._onDidChangeConnections.fire();
      await this._remoteAgentHostService.addManagedConnection({
        name: result.name,
        connectionToken: result.connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.SSH,
          address: result.address,
          sshConfigHost: result.sshConfigHost,
          hostName: result.config.host,
          user: result.config.username || void 0,
          port: result.config.port
        }
      }, protocolClient, this._createTransportDisposable(result.connectionId, handle), status);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Connection setup failed", err);
      if (registeredHandle && this._connections.get(result.connectionId) === handle) {
        this._connections.delete(result.connectionId);
        this._onDidChangeConnections.fire();
      }
      handle.dispose();
      protocolClient.dispose();
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    if (connectError) {
      throw connectError;
    }
    return handle;
  }
  /**
   * Build a disposable that the {@link IRemoteAgentHostService} will own
   * for the lifetime of this entry. When the entry is removed (either by
   * the user via "Remove Remote" or by config reconciliation), this runs
   * and tears down the renderer-side handle and the shared-process SSH
   * tunnel together. Without this hookup, the SSH tunnel would leak and
   * the next `connect()` would silently reuse it.
   */
  _createTransportDisposable(connectionId, handle) {
    return toDisposable(() => {
      if (this._connections.get(connectionId) === handle) {
        this._connections.delete(connectionId);
        this._onDidChangeConnections.fire();
      }
      handle.fireClose();
      handle.dispose();
      this._mainService.disconnect(connectionId).catch(() => {
      });
    });
  }
  _createRelayClient(result) {
    return this._relayClientFactory.createClient(this._mainService, result.connectionId, result.address);
  }
  _augmentConfig(config) {
    const result = { ...config };
    const commandOverride = this._getRemoteAgentHostCommand();
    if (commandOverride) {
      result.remoteAgentHostCommand = commandOverride;
    }
    if (this._isSSHAgentForwardingEnabled() && config.agentForward) {
      result.agentForward = true;
    }
    return result;
  }
  _getRemoteAgentHostCommand() {
    return this._configurationService.getValue("chat.sshRemoteAgentHostCommand") || void 0;
  }
  _isSSHAgentForwardingEnabled() {
    return this._configurationService.getValue("chat.agentHost.forwardSSHAgent") || void 0;
  }
  /**
   * Show a quick-input prompt for each entry in a keyboard-interactive
   * challenge and forward the responses (or cancel) back to the main service.
   *
   * The renderer collects all prompts up front before responding so the
   * server gets a single batched answer set, matching how OpenSSH presents
   * keyboard-interactive challenges.
   */
  async _handleKeyboardInteractiveRequest(request) {
    this._logService.info(`[SSHRemoteAgentHost] Keyboard-interactive prompt for ${request.displayHost} (${request.prompts.length} prompt(s))`);
    const cts = new CancellationTokenSource();
    const cancelListener = this._mainService.onDidCancelKeyboardInteractive((requestId) => {
      if (requestId === request.requestId) {
        cts.cancel();
      }
    });
    try {
      if (request.prompts.length === 0) {
        await this._mainService.respondKeyboardInteractive(request.requestId, []);
        return;
      }
      const responses = [];
      for (let i = 0; i < request.prompts.length; i++) {
        if (cts.token.isCancellationRequested) {
          return;
        }
        const prompt = request.prompts[i];
        const cleanedPrompt = prompt.prompt.replace(/[\s:]+$/, "");
        const title = request.prompts.length > 1 ? `${request.displayHost} (${i + 1}/${request.prompts.length})` : request.displayHost;
        const value = await this._quickInputService.input({
          title,
          prompt: cleanedPrompt || localize("sshKbiDefaultPrompt", "Authentication required for {0}@{1}", request.username, request.displayHost),
          password: !prompt.echo,
          ignoreFocusLost: true
        }, cts.token);
        if (cts.token.isCancellationRequested) {
          return;
        }
        if (value === void 0) {
          await this._mainService.respondKeyboardInteractive(request.requestId, void 0);
          return;
        }
        responses.push(value);
      }
      if (cts.token.isCancellationRequested) {
        return;
      }
      await this._mainService.respondKeyboardInteractive(request.requestId, responses);
    } catch (err) {
      this._logService.error("[SSHRemoteAgentHost] Failed handling keyboard-interactive prompt", err);
      try {
        await this._mainService.respondKeyboardInteractive(request.requestId, void 0);
      } catch {
      }
    } finally {
      cancelListener.dispose();
      cts.dispose();
    }
  }
};
SSHRemoteAgentHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ISSHRelayClientFactory),
  __decorateParam(5, IQuickInputService)
], SSHRemoteAgentHostService);
class SSHAgentHostConnectionHandle extends Disposable {
  constructor(config, localAddress, name, disconnectFn) {
    super();
    this.config = config;
    this.localAddress = localAddress;
    this.name = name;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._closedByMain = false;
    this._register(toDisposable(() => {
      if (!this._closedByMain) {
        disconnectFn().catch(() => {
        });
      }
    }));
  }
  /** Called by the service when the main process signals connection closure. */
  fireClose() {
    this._closedByMain = true;
    this._onDidClose.fire();
  }
}
export {
  ISSHRelayClientFactory,
  SSHRelayClientFactory,
  SSHRemoteAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9lbGVjdHJvbi1icm93c2VyL3NzaFJlbW90ZUFnZW50SG9zdFNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQWhwSnNvbmxMb2dnZXIgfSBmcm9tICcuLi9jb21tb24vYWhwSnNvbmxMb2dnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTU0hSZWxheVRyYW5zcG9ydCB9IGZyb20gJy4vc3NoUmVsYXlUcmFuc3BvcnQuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi9icm93c2VyL3JlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LmpzJztcbmltcG9ydCB7IGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHtcblx0SVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFNTSF9SRU1PVEVfQUdFTlRfSE9TVF9DSEFOTkVMLFxuXHR0eXBlIElTU0hBZ2VudEhvc3RDb25maWcsXG5cdHR5cGUgSVNTSEFnZW50SG9zdENvbm5lY3Rpb24sXG5cdHR5cGUgSVNTSENvbm5lY3RSZXN1bHQsXG5cdHR5cGUgSVNTSEtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0LFxuXHR0eXBlIElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSxcblx0dHlwZSBJU1NIUmVzb2x2ZWRDb25maWcsXG5cdHR5cGUgSVNTSENvbm5lY3RQcm9ncmVzcyxcbn0gZnJvbSAnLi4vY29tbW9uL3NzaFJlbW90ZUFnZW50SG9zdC5qcyc7XG5cbmV4cG9ydCBjb25zdCBJU1NIUmVsYXlDbGllbnRGYWN0b3J5ID0gY3JlYXRlRGVjb3JhdG9yPElTU0hSZWxheUNsaWVudEZhY3Rvcnk+KCdzc2hSZWxheUNsaWVudEZhY3RvcnknKTtcblxuZXhwb3J0IGludGVyZmFjZSBJU1NIUmVsYXlDbGllbnRGYWN0b3J5IHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjcmVhdGVDbGllbnQobWFpblNlcnZpY2U6IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSwgY29ubmVjdGlvbklkOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZyk6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50O1xufVxuXG5leHBvcnQgY2xhc3MgU1NIUmVsYXlDbGllbnRGYWN0b3J5IGltcGxlbWVudHMgSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNyZWF0ZUNsaWVudChtYWluU2VydmljZTogSVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlLCBjb25uZWN0aW9uSWQ6IHN0cmluZywgYWRkcmVzczogc3RyaW5nKTogUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQge1xuXHRcdGNvbnN0IGFocExvZ2dpbmdFbmFibGVkID0gISF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQpO1xuXHRcdGNvbnN0IGxvZ2dlciA9IGFocExvZ2dpbmdFbmFibGVkID8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRBaHBKc29ubExvZ2dlcixcblx0XHRcdHsgbG9nc0hvbWU6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSwgY29ubmVjdGlvbklkLCB0cmFuc3BvcnQ6ICdzc2gnIH0sXG5cdFx0KSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTU0hSZWxheVRyYW5zcG9ydCwgY29ubmVjdGlvbklkLCBtYWluU2VydmljZSwgbG9nZ2VyKTtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsIGFkZHJlc3MsIHRyYW5zcG9ydCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8pO1xuXHR9XG59XG5cbi8qKlxuICogUmVuZGVyZXItc2lkZSBpbXBsZW1lbnRhdGlvbiBvZiB7QGxpbmsgSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2V9IHRoYXRcbiAqIGRlbGVnYXRlcyB0aGUgYWN0dWFsIFNTSCB3b3JrIHRvIHRoZSBtYWluIHByb2Nlc3MgdmlhIElQQywgdGhlbiByZWdpc3RlcnNcbiAqIHRoZSByZXN1bHRpbmcgY29ubmVjdGlvbiB3aXRoIHRoZSByZW5kZXJlci1sb2NhbCB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2V9LlxuICovXG5leHBvcnQgY2xhc3MgU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21haW5TZXJ2aWNlOiBJU1NIUmVtb3RlQWdlbnRIb3N0TWFpblNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbm5lY3Rpb25zOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZXZlbnQ7XG5cblx0cmVhZG9ubHkgb25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3M6IEV2ZW50PElTU0hDb25uZWN0UHJvZ3Jlc3M+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIFNTSEFnZW50SG9zdENvbm5lY3Rpb25IYW5kbGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTaGFyZWRQcm9jZXNzU2VydmljZSBzaGFyZWRQcm9jZXNzU2VydmljZTogSVNoYXJlZFByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU1NIUmVsYXlDbGllbnRGYWN0b3J5IHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5Q2xpZW50RmFjdG9yeTogSVNTSFJlbGF5Q2xpZW50RmFjdG9yeSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9tYWluU2VydmljZSA9IFByb3h5Q2hhbm5lbC50b1NlcnZpY2U8SVNTSFJlbW90ZUFnZW50SG9zdE1haW5TZXJ2aWNlPihcblx0XHRcdHNoYXJlZFByb2Nlc3NTZXJ2aWNlLmdldENoYW5uZWwoU1NIX1JFTU9URV9BR0VOVF9IT1NUX0NIQU5ORUwpLFxuXHRcdCk7XG5cblx0XHR0aGlzLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzID0gdGhpcy5fbWFpblNlcnZpY2Uub25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3M7XG5cblx0XHQvLyBXaGVuIHNoYXJlZCBwcm9jZXNzIGZpcmVzIG9uRGlkQ2xvc2VDb25uZWN0aW9uLCBjbGVhbiB1cCB0aGUgcmVuZGVyZXItc2lkZSBoYW5kbGUuXG5cdFx0Ly8gRG8gTk9UIHJlbW92ZSB0aGUgY29uZmlndXJlZCBlbnRyeSBcdTIwMTQgaXQgc3RheXMgcGVyc2lzdGVkIHNvIHN0YXJ0dXAgcmVjb25uZWN0XG5cdFx0Ly8gY2FuIHJlLWVzdGFibGlzaCB0aGUgU1NIIHR1bm5lbCBvbiBuZXh0IGxhdW5jaC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tYWluU2VydmljZS5vbkRpZENsb3NlQ29ubmVjdGlvbihjb25uZWN0aW9uSWQgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBvbkRpZENsb3NlQ29ubmVjdGlvbjogY29ubmVjdGlvbklkPSR7Y29ubmVjdGlvbklkfWApO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1NTSFJlbW90ZUFnZW50SG9zdF0gb25EaWRDbG9zZUNvbm5lY3Rpb246IGZvdW5kIGhhbmRsZSBmb3IgJHtjb25uZWN0aW9uSWR9LCBjbGVhbmluZyB1cGApO1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbklkKTtcblx0XHRcdFx0aGFuZGxlLmZpcmVDbG9zZSgpO1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblxuXHRcdFx0XHQvLyBEZWZlbnNlLWluLWRlcHRoOiBhbHNvIHNpZ25hbCB0aGUgcHJvdG9jb2wgY2xpZW50IGRpcmVjdGx5LiBUaGVcblx0XHRcdFx0Ly8gU1NIUmVsYXlUcmFuc3BvcnQgbm9ybWFsbHkgb2JzZXJ2ZXMgYG9uRGlkUmVsYXlDbG9zZWAgKGZpcmVkIGZyb21cblx0XHRcdFx0Ly8gdGhlIHNhbWUgc2hhcmVkLXByb2Nlc3MgY29kZSBwYXRoIGFzIHRoaXMgZXZlbnQpIGFuZCBjYWxscyBiYWNrXG5cdFx0XHRcdC8vIGludG8gdGhlIGNsaWVudC4gSWYgdGhhdCBJUEMgZGVsaXZlcnkgaXMgbWlzc2VkIGZvciBhbnkgcmVhc29uLFxuXHRcdFx0XHQvLyB0aGUgcmVuZGVyZXItc2lkZSBjbGllbnQgd291bGQgc3RheSBpbiBgQ29ubmVjdGVkYCB1bnRpbCBpdHNcblx0XHRcdFx0Ly8gbGl2ZW5lc3Mgd2F0Y2hkb2cgZmlyZXMgXHUyMDE0IHdoaWNoIGNhbiB0YWtlIGhvdXJzIHdoZW4gdGhlXG5cdFx0XHRcdC8vIHJlbmRlcmVyIGlzIGJhY2tncm91bmRlZCBhbmQgQ2hyb21pdW0gdGhyb3R0bGVzIGBzZXRUaW1lb3V0YC5cblx0XHRcdFx0Ly8gVXNlIHRoZSBoYW5kbGUncyBhZGRyZXNzIChlLmcuLCBcInNzaDptYWNib29rLWFpclwiKSBzaW5jZVxuXHRcdFx0XHQvLyBSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIGtleXMgaXRzIGNsaWVudHMgYnkgYWRkcmVzcywgbm90IGNvbm5lY3Rpb25JZC5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBvbkRpZENsb3NlQ29ubmVjdGlvbjogbm90aWZ5aW5nIHByb3RvY29sIGNsaWVudCBmb3IgJHtoYW5kbGUubG9jYWxBZGRyZXNzfWApO1xuXHRcdFx0XHR0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLm5vdGlmeUNvbm5lY3Rpb25DbG9zZWQoaGFuZGxlLmxvY2FsQWRkcmVzcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIG9uRGlkQ2xvc2VDb25uZWN0aW9uOiBubyByZW5kZXJlci1zaWRlIGhhbmRsZSBmb3IgJHtjb25uZWN0aW9uSWR9IChhbHJlYWR5IGNsZWFuZWQgdXA/KWApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJyaWRnZSBrZXlib2FyZC1pbnRlcmFjdGl2ZSBwcm9tcHRzIGZyb20gdGhlIHNoYXJlZCBwcm9jZXNzIHRvIHRoZVxuXHRcdC8vIHF1aWNrIGlucHV0IFVJIHNvIHBhc3N3b3JkIC8gMkZBIGZhbGxiYWNrcyB3b3JrIGZvciBTU0ggY29uZmlnIGhvc3RzXG5cdFx0Ly8gd2hlcmUga2V5LWJhc2VkIGF1dGggZmFpbHMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFpblNlcnZpY2Uub25EaWRSZXF1ZXN0S2V5Ym9hcmRJbnRlcmFjdGl2ZShyZXF1ZXN0ID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZUtleWJvYXJkSW50ZXJhY3RpdmVSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBjb25uZWN0aW9ucygpOiByZWFkb25seSBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2Nvbm5lY3Rpb25zLnZhbHVlcygpXTtcblx0fVxuXG5cdGFzeW5jIGNvbm5lY3QoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogUHJvbWlzZTxJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbj4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBhdWdtZW50ZWRDb25maWcgPSB0aGlzLl9hdWdtZW50Q29uZmlnKGNvbmZpZyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBDb25uZWN0aW5nIHRvICR7Y29uZmlnLmhvc3R9YCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fbWFpblNlcnZpY2UuY29ubmVjdChhdWdtZW50ZWRDb25maWcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTU0hSZW1vdGVBZ2VudEhvc3RdIFNTSCB0dW5uZWwgZXN0YWJsaXNoZWQsIGNvbm5lY3Rpb25JZD0ke3Jlc3VsdC5jb25uZWN0aW9uSWR9YCk7XG5cdFx0cmV0dXJuIHRoaXMuX3NldHVwQ29ubmVjdGlvbihyZXN1bHQpO1xuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChob3N0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KGhvc3QpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFNTSENvbmZpZ0hvc3RzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fbWFpblNlcnZpY2UubGlzdFNTSENvbmZpZ0hvc3RzKCk7XG5cdH1cblxuXHRhc3luYyBlbnN1cmVVc2VyU1NIQ29uZmlnKCk6IFByb21pc2U8VVJJPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21haW5TZXJ2aWNlLmVuc3VyZVVzZXJTU0hDb25maWcoKTtcblx0fVxuXG5cdGFzeW5jIGxpc3RTU0hDb25maWdGaWxlcygpOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21haW5TZXJ2aWNlLmxpc3RTU0hDb25maWdGaWxlcygpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNTSENvbmZpZyhob3N0OiBzdHJpbmcpOiBQcm9taXNlPElTU0hSZXNvbHZlZENvbmZpZz4ge1xuXHRcdHJldHVybiB0aGlzLl9tYWluU2VydmljZS5yZXNvbHZlU1NIQ29uZmlnKGhvc3QpO1xuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KHNzaENvbmZpZ0hvc3Q6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTxJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbj4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlbW90ZSBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kT3ZlcnJpZGUgPSB0aGlzLl9nZXRSZW1vdGVBZ2VudEhvc3RDb21tYW5kKCk7XG5cdFx0Y29uc3QgYWdlbnRGb3J3YXJkID0gdGhpcy5faXNTU0hBZ2VudEZvcndhcmRpbmdFbmFibGVkKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU1NIUmVtb3RlQWdlbnRIb3N0XSBSZWNvbm5lY3RpbmcgdG8gJHtzc2hDb25maWdIb3N0fWApO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlY29ubmVjdChzc2hDb25maWdIb3N0LCBuYW1lLCBjb21tYW5kT3ZlcnJpZGUsIGFnZW50Rm9yd2FyZCk7XG5cdFx0cmV0dXJuIHRoaXMuX3NldHVwQ29ubmVjdGlvbihyZXN1bHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSByZW5kZXJlci1zaWRlIGhhbmRsZSwgZG8gdGhlIHByb3RvY29sIGhhbmRzaGFrZSwgYW5kIHJlZ2lzdGVyXG5cdCAqIHdpdGggSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UuIEFueSBmYWlsdXJlIGFmdGVyIHRoZSBzaGFyZWQtcHJvY2VzcyB0dW5uZWxcblx0ICogd2FzIGVzdGFibGlzaGVkIHRlYXJzIGl0IGJhY2sgZG93biBzbyB3ZSBkb24ndCBsZWFrIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2V0dXBDb25uZWN0aW9uKHJlc3VsdDogSVNTSENvbm5lY3RSZXN1bHQpOiBQcm9taXNlPElTU0hBZ2VudEhvc3RDb25uZWN0aW9uPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQocmVzdWx0LmNvbm5lY3Rpb25JZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHQvLyBSZXVzZSB0aGUgZXhpc3RpbmcgaGFuZGxlIG9ubHkgaWYgdGhlIG1hbmFnZWQgZW50cnkgaXMgc3RpbGxcblx0XHRcdC8vIGluIGEgdXNhYmxlIHN0YXRlLiBBZnRlciBhIGByZWNvbm5lY3RgIHRoYXQgcmVwbGFjZWQgdGhlXG5cdFx0XHQvLyB1bmRlcmx5aW5nIFNTSCByZWxheSAoZS5nLiBmb2xsb3dpbmcgYSBDTEktZHJpdmVuIHNlcnZlclxuXHRcdFx0Ly8gdXBncmFkZSksIHRoZSBwcmV2aW91cyBwcm90b2NvbCBjbGllbnQgaXMgYm91bmQgdG8gYVxuXHRcdFx0Ly8gdG9ybi1kb3duIHRyYW5zcG9ydCBhbmQgXHUyMDE0IGlmIGl0cyBoYW5kc2hha2UgaGFkIGZhaWxlZCB3aXRoXG5cdFx0XHQvLyBgaW5jb21wYXRpYmxlYCBcdTIwMTQgd2lsbCBuZXZlciByZS1oYW5kc2hha2Ugb24gaXRzIG93bi4gRHJvcFxuXHRcdFx0Ly8gdGhlIHN0YWxlIGxvY2FsIHN0YXRlIGFuZCBmYWxsIHRocm91Z2ggdG8gYSBmcmVzaFxuXHRcdFx0Ly8gaGFuZHNoYWtlOyB0aGUgc3Vic2VxdWVudCBgYWRkTWFuYWdlZENvbm5lY3Rpb25gIGNhbGxcblx0XHRcdC8vIGRpc3Bvc2VzIHRoZSBzdGFsZSBwcm90b2NvbCBjbGllbnQgYnkgcmVwbGFjaW5nIHRoZSBlbnRyeS5cblx0XHRcdGlmICh0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24ocmVzdWx0LmFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIFJldHVybmluZyBleGlzdGluZyBjb25uZWN0aW9uIGhhbmRsZScpO1xuXHRcdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIFJlcGxhY2luZyBzdGFsZSBjb25uZWN0aW9uIGhhbmRsZSBmb3IgJHtyZXN1bHQuYWRkcmVzc31gKTtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShyZXN1bHQuY29ubmVjdGlvbklkKTtcblx0XHRcdC8vIE1hcmsgY2xvc2VkLWJ5LW1haW4gc28gZGlzcG9zaW5nIHRoZSBoYW5kbGUgZG9lcyBOT1QgY2FsbFxuXHRcdFx0Ly8gZGlzY29ubmVjdCgpIFx1MjAxNCB0aGUgbWFpbiBzZXJ2aWNlIGtlcHQgdGhlIFNTSCBjbGllbnQgYWxpdmVcblx0XHRcdC8vIGFjcm9zcyBgcmVwbGFjZVJlbGF5YCwgYW5kIHdlJ2Qga2lsbCB0aGUgYnJhbmQtbmV3IHR1bm5lbFxuXHRcdFx0Ly8gb3RoZXJ3aXNlLlxuXHRcdFx0ZXhpc3RpbmcuZmlyZUNsb3NlKCk7XG5cdFx0XHRleGlzdGluZy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHR9XG5cdFx0bGV0IHJlZ2lzdGVyZWRIYW5kbGUgPSBmYWxzZTtcblx0XHRjb25zdCBwcm90b2NvbENsaWVudCA9IHRoaXMuX2NyZWF0ZVJlbGF5Q2xpZW50KHJlc3VsdCk7XG5cdFx0bGV0IHN0YXR1cyA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkO1xuXHRcdGxldCBjb25uZWN0RXJyb3I6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3RvY29sQ2xpZW50LmNvbm5lY3QoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tTU0hSZW1vdGVBZ2VudEhvc3RdIFByb3RvY29sIGhhbmRzaGFrZSBjb21wbGV0ZWQnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IGluY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZnJvbUNvbm5lY3RFcnJvcihlcnIsIFtQUk9UT0NPTF9WRVJTSU9OXSk7XG5cdFx0XHRpZiAoIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoaW5jb21wYXRpYmxlKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbU1NIUmVtb3RlQWdlbnRIb3N0XSBDb25uZWN0aW9uIHNldHVwIGZhaWxlZCcsIGVycik7XG5cdFx0XHRcdHByb3RvY29sQ2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbWFpblNlcnZpY2UuZGlzY29ubmVjdChyZXN1bHQuY29ubmVjdGlvbklkKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QgZWZmb3J0ICovIH0pO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIEluY29tcGF0aWJsZSB3aXRoICR7cmVzdWx0LmFkZHJlc3N9OiAke2luY29tcGF0aWJsZS5tZXNzYWdlfWApO1xuXHRcdFx0c3RhdHVzID0gaW5jb21wYXRpYmxlO1xuXHRcdFx0Y29ubmVjdEVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZSA9IG5ldyBTU0hBZ2VudEhvc3RDb25uZWN0aW9uSGFuZGxlKFxuXHRcdFx0cmVzdWx0LmNvbmZpZyxcblx0XHRcdHJlc3VsdC5hZGRyZXNzLFxuXHRcdFx0cmVzdWx0Lm5hbWUsXG5cdFx0XHQoKSA9PiB0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLFxuXHRcdCk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuc2V0KHJlc3VsdC5jb25uZWN0aW9uSWQsIGhhbmRsZSk7XG5cdFx0XHRyZWdpc3RlcmVkSGFuZGxlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKHtcblx0XHRcdFx0bmFtZTogcmVzdWx0Lm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0gsXG5cdFx0XHRcdFx0YWRkcmVzczogcmVzdWx0LmFkZHJlc3MsXG5cdFx0XHRcdFx0c3NoQ29uZmlnSG9zdDogcmVzdWx0LnNzaENvbmZpZ0hvc3QsXG5cdFx0XHRcdFx0aG9zdE5hbWU6IHJlc3VsdC5jb25maWcuaG9zdCxcblx0XHRcdFx0XHR1c2VyOiByZXN1bHQuY29uZmlnLnVzZXJuYW1lIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwb3J0OiByZXN1bHQuY29uZmlnLnBvcnQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBwcm90b2NvbENsaWVudCwgdGhpcy5fY3JlYXRlVHJhbnNwb3J0RGlzcG9zYWJsZShyZXN1bHQuY29ubmVjdGlvbklkLCBoYW5kbGUpLCBzdGF0dXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW1NTSFJlbW90ZUFnZW50SG9zdF0gQ29ubmVjdGlvbiBzZXR1cCBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWRIYW5kbGUgJiYgdGhpcy5fY29ubmVjdGlvbnMuZ2V0KHJlc3VsdC5jb25uZWN0aW9uSWQpID09PSBoYW5kbGUpIHtcblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuZGVsZXRlKHJlc3VsdC5jb25uZWN0aW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbm5lY3Rpb25zLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbm5lY3RFcnJvcikge1xuXHRcdFx0dGhyb3cgY29ubmVjdEVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgYSBkaXNwb3NhYmxlIHRoYXQgdGhlIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0U2VydmljZX0gd2lsbCBvd25cblx0ICogZm9yIHRoZSBsaWZldGltZSBvZiB0aGlzIGVudHJ5LiBXaGVuIHRoZSBlbnRyeSBpcyByZW1vdmVkIChlaXRoZXIgYnlcblx0ICogdGhlIHVzZXIgdmlhIFwiUmVtb3ZlIFJlbW90ZVwiIG9yIGJ5IGNvbmZpZyByZWNvbmNpbGlhdGlvbiksIHRoaXMgcnVuc1xuXHQgKiBhbmQgdGVhcnMgZG93biB0aGUgcmVuZGVyZXItc2lkZSBoYW5kbGUgYW5kIHRoZSBzaGFyZWQtcHJvY2VzcyBTU0hcblx0ICogdHVubmVsIHRvZ2V0aGVyLiBXaXRob3V0IHRoaXMgaG9va3VwLCB0aGUgU1NIIHR1bm5lbCB3b3VsZCBsZWFrIGFuZFxuXHQgKiB0aGUgbmV4dCBgY29ubmVjdCgpYCB3b3VsZCBzaWxlbnRseSByZXVzZSBpdC5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVRyYW5zcG9ydERpc3Bvc2FibGUoY29ubmVjdGlvbklkOiBzdHJpbmcsIGhhbmRsZTogU1NIQWdlbnRIb3N0Q29ubmVjdGlvbkhhbmRsZSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdC8vIERyb3AgdGhlIHJlbmRlcmVyLXNpZGUgaGFuZGxlIG1hcCBlbnRyeSBmaXJzdCBzbyBhIGNvbmN1cnJlbnRcblx0XHRcdC8vIGBjb25uZWN0KClgIGZvciB0aGUgc2FtZSBrZXkgZG9lc24ndCBsYXRjaCBvbnRvIGEgYmVpbmctdG9ybi1kb3duXG5cdFx0XHQvLyBjb25uZWN0aW9uLlxuXHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uSWQpID09PSBoYW5kbGUpIHtcblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbnMuZGVsZXRlKGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvbnMuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTWFyayB0aGUgaGFuZGxlIGFzIGFscmVhZHkgY2xvc2VkLWZyb20tbWFpbiBzbyBkaXNwb3NpbmcgaXRcblx0XHRcdC8vIGRvZXNuJ3Qga2ljayBvZmYgYSByZWR1bmRhbnQgc2Vjb25kIGRpc2Nvbm5lY3QgSVBDLiBUaGUgYWN0dWFsXG5cdFx0XHQvLyBkaXNjb25uZWN0IGlzIGluaXRpYXRlZCBiZWxvdy5cblx0XHRcdGhhbmRsZS5maXJlQ2xvc2UoKTtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KGNvbm5lY3Rpb25JZCkuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlbGF5Q2xpZW50KHJlc3VsdDogeyBjb25uZWN0aW9uSWQ6IHN0cmluZzsgYWRkcmVzczogc3RyaW5nIH0pOiBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbGF5Q2xpZW50RmFjdG9yeS5jcmVhdGVDbGllbnQodGhpcy5fbWFpblNlcnZpY2UsIHJlc3VsdC5jb25uZWN0aW9uSWQsIHJlc3VsdC5hZGRyZXNzKTtcblx0fVxuXG5cdHByaXZhdGUgX2F1Z21lbnRDb25maWcoY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29uZmlnKTogSVNTSEFnZW50SG9zdENvbmZpZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0geyAuLi5jb25maWcgfTtcblx0XHRjb25zdCBjb21tYW5kT3ZlcnJpZGUgPSB0aGlzLl9nZXRSZW1vdGVBZ2VudEhvc3RDb21tYW5kKCk7XG5cdFx0aWYgKGNvbW1hbmRPdmVycmlkZSkge1xuXHRcdFx0cmVzdWx0LnJlbW90ZUFnZW50SG9zdENvbW1hbmQgPSBjb21tYW5kT3ZlcnJpZGU7XG5cdFx0fVxuXHRcdC8vIEFnZW50IGZvcndhcmRpbmcgcmVxdWlyZXMgYm90aCB0aGUgZ2xvYmFsIHNldHRpbmcgKHNlY3VyaXR5IG9wdC1pbilcblx0XHQvLyBhbmQgdGhlIHBlci1ob3N0IFNTSCBjb25maWcgYEZvcndhcmRBZ2VudCB5ZXNgIHRvIGJlIGVuYWJsZWQuXG5cdFx0aWYgKHRoaXMuX2lzU1NIQWdlbnRGb3J3YXJkaW5nRW5hYmxlZCgpICYmIGNvbmZpZy5hZ2VudEZvcndhcmQpIHtcblx0XHRcdHJlc3VsdC5hZ2VudEZvcndhcmQgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVtb3RlQWdlbnRIb3N0Q29tbWFuZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LnNzaFJlbW90ZUFnZW50SG9zdENvbW1hbmQnKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NTSEFnZW50Rm9yd2FyZGluZ0VuYWJsZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmFnZW50SG9zdC5mb3J3YXJkU1NIQWdlbnQnKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU2hvdyBhIHF1aWNrLWlucHV0IHByb21wdCBmb3IgZWFjaCBlbnRyeSBpbiBhIGtleWJvYXJkLWludGVyYWN0aXZlXG5cdCAqIGNoYWxsZW5nZSBhbmQgZm9yd2FyZCB0aGUgcmVzcG9uc2VzIChvciBjYW5jZWwpIGJhY2sgdG8gdGhlIG1haW4gc2VydmljZS5cblx0ICpcblx0ICogVGhlIHJlbmRlcmVyIGNvbGxlY3RzIGFsbCBwcm9tcHRzIHVwIGZyb250IGJlZm9yZSByZXNwb25kaW5nIHNvIHRoZVxuXHQgKiBzZXJ2ZXIgZ2V0cyBhIHNpbmdsZSBiYXRjaGVkIGFuc3dlciBzZXQsIG1hdGNoaW5nIGhvdyBPcGVuU1NIIHByZXNlbnRzXG5cdCAqIGtleWJvYXJkLWludGVyYWN0aXZlIGNoYWxsZW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVLZXlib2FyZEludGVyYWN0aXZlUmVxdWVzdChyZXF1ZXN0OiBJU1NIS2V5Ym9hcmRJbnRlcmFjdGl2ZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTU0hSZW1vdGVBZ2VudEhvc3RdIEtleWJvYXJkLWludGVyYWN0aXZlIHByb21wdCBmb3IgJHtyZXF1ZXN0LmRpc3BsYXlIb3N0fSAoJHtyZXF1ZXN0LnByb21wdHMubGVuZ3RofSBwcm9tcHQocykpYCk7XG5cblx0XHQvLyBIb25vciBjYW5jZWxsYXRpb24gaWYgdGhlIHVuZGVybHlpbmcgY29ubmVjdCBhdHRlbXB0IGZhaWxzIG9yXG5cdFx0Ly8gY29tcGxldGVzIHdoaWxlIHdlJ3JlIHN0aWxsIGdhdGhlcmluZyByZXNwb25zZXMuIFBhc3MgdGhlXG5cdFx0Ly8gQ2FuY2VsbGF0aW9uVG9rZW4gaW50byBxdWlja0lucHV0IHNvIGFuIGluLWZsaWdodCBwcm9tcHQgaXNcblx0XHQvLyBkaXNtaXNzZWQgaW1tZWRpYXRlbHkgcmF0aGVyIHRoYW4gbGluZ2VyaW5nIG9uIHNjcmVlbi5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBjYW5jZWxMaXN0ZW5lciA9IHRoaXMuX21haW5TZXJ2aWNlLm9uRGlkQ2FuY2VsS2V5Ym9hcmRJbnRlcmFjdGl2ZShyZXF1ZXN0SWQgPT4ge1xuXHRcdFx0aWYgKHJlcXVlc3RJZCA9PT0gcmVxdWVzdC5yZXF1ZXN0SWQpIHtcblx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChyZXF1ZXN0LnByb21wdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3QucmVxdWVzdElkLCBbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXF1ZXN0LnByb21wdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcm9tcHQgPSByZXF1ZXN0LnByb21wdHNbaV07XG5cdFx0XHRcdC8vIFRyaW0gdHJhaWxpbmcgd2hpdGVzcGFjZS9jb2xvbnMgZnJvbSB0aGUgc2VydmVyLXN1cHBsaWVkXG5cdFx0XHRcdC8vIHByb21wdCBmb3IgYSBjbGVhbmVyIHRpdGxlIChlLmcuIFwiUGFzc3dvcmQ6IFwiIC0+IFwiUGFzc3dvcmRcIikuXG5cdFx0XHRcdGNvbnN0IGNsZWFuZWRQcm9tcHQgPSBwcm9tcHQucHJvbXB0LnJlcGxhY2UoL1tcXHM6XSskLywgJycpO1xuXHRcdFx0XHRjb25zdCB0aXRsZSA9IHJlcXVlc3QucHJvbXB0cy5sZW5ndGggPiAxXG5cdFx0XHRcdFx0PyBgJHtyZXF1ZXN0LmRpc3BsYXlIb3N0fSAoJHtpICsgMX0vJHtyZXF1ZXN0LnByb21wdHMubGVuZ3RofSlgXG5cdFx0XHRcdFx0OiByZXF1ZXN0LmRpc3BsYXlIb3N0O1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRwcm9tcHQ6IGNsZWFuZWRQcm9tcHQgfHwgbG9jYWxpemUoJ3NzaEtiaURlZmF1bHRQcm9tcHQnLCBcIkF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkIGZvciB7MH1AezF9XCIsIHJlcXVlc3QudXNlcm5hbWUsIHJlcXVlc3QuZGlzcGxheUhvc3QpLFxuXHRcdFx0XHRcdHBhc3N3b3JkOiAhcHJvbXB0LmVjaG8sXG5cdFx0XHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdFx0XHR9LCBjdHMudG9rZW4pO1xuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gVXNlciBjYW5jZWxsZWQgXHUyMDE0IGFib3J0IHRoZSBvd25pbmcgY29ubmVjdGlvbiBhdHRlbXB0LlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3QucmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNwb25zZXMucHVzaCh2YWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UucmVzcG9uZEtleWJvYXJkSW50ZXJhY3RpdmUocmVxdWVzdC5yZXF1ZXN0SWQsIHJlc3BvbnNlcyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbU1NIUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgaGFuZGxpbmcga2V5Ym9hcmQtaW50ZXJhY3RpdmUgcHJvbXB0JywgZXJyKTtcblx0XHRcdC8vIEJlc3QgZWZmb3J0OiB0ZWxsIHRoZSBtYWluIHNlcnZpY2UgdG8gZ2l2ZSB1cCBvbiB0aGlzIGF0dGVtcHRcblx0XHRcdC8vIHNvIHRoZSBTU0ggY29ubmVjdCBwcm9taXNlIHJlamVjdHMgcmF0aGVyIHRoYW4gaGFuZ2luZy5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnJlc3BvbmRLZXlib2FyZEludGVyYWN0aXZlKHJlcXVlc3QucmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdFx0fSBjYXRjaCB7IC8qIHN3YWxsb3cgKi8gfVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIExpZ2h0d2VpZ2h0IHJlbmRlcmVyLXNpZGUgaGFuZGxlIHRoYXQgcmVwcmVzZW50cyBhIGNvbm5lY3Rpb25cbiAqIG1hbmFnZWQgYnkgdGhlIG1haW4gcHJvY2Vzcy5cbiAqL1xuY2xhc3MgU1NIQWdlbnRIb3N0Q29ubmVjdGlvbkhhbmRsZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZSA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY2xvc2VkQnlNYWluID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29uZmlnOiBJU1NIQWdlbnRIb3N0Q29ubmVjdGlvblsnY29uZmlnJ10sXG5cdFx0cmVhZG9ubHkgbG9jYWxBZGRyZXNzOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdGRpc2Nvbm5lY3RGbjogKCkgPT4gUHJvbWlzZTx2b2lkPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFdoZW4gdGhpcyBoYW5kbGUgaXMgZGlzcG9zZWQsIHRlYXIgZG93biB0aGUgbWFpbi1wcm9jZXNzIHR1bm5lbFxuXHRcdC8vIChza2lwIGlmIGFscmVhZHkgY2xvc2VkIGZyb20gdGhlIG1haW4gcHJvY2VzcyBzaWRlKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2Nsb3NlZEJ5TWFpbikge1xuXHRcdFx0XHRkaXNjb25uZWN0Rm4oKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QgZWZmb3J0ICovIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBDYWxsZWQgYnkgdGhlIHNlcnZpY2Ugd2hlbiB0aGUgbWFpbiBwcm9jZXNzIHNpZ25hbHMgY29ubmVjdGlvbiBjbG9zdXJlLiAqL1xuXHRmaXJlQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xvc2VkQnlNYWluID0gdHJ1ZTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsWUFBeUIsb0JBQW9CO0FBRXRELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCLGlDQUFpQywwQkFBMEIsd0NBQXdDO0FBQ3JJLFNBQVMsaUJBQWlCLDZCQUE2QjtBQUN2RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixT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
