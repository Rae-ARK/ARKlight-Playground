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
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { disposableTimeout, IntervalTimer } from "../../../../../base/common/async.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import * as nls from "../../../../../nls.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, getEntryAddress } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TunnelAgentHostsSettingId } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { CloudSandboxEnabledSettingId } from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { AgentHostLocalFilePermissionsSettingId } from "../../../../../platform/agentHost/common/agentHostResourceService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { OpenSessionEventsFileAction } from "../../agentHost/browser/openSessionEventsFileActions.js";
import { authenticateProtectedResources, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js";
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js";
import { AgentHostSessionHandler } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js";
import { IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { ChatSessionsExtensions, IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { IAgentHostFileSystemService } from "../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { createRemoteAgentHarnessDescriptor, RemoteAgentPluginController } from "./remoteAgentHostCustomizationHarness.js";
import { RemoteAgentHostLogForwarder } from "./remoteAgentHostLogForwarder.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from "./remoteAgentHostConnectionCustomization.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
import { ISSHRemoteAgentHostService, SSHAuthMethod } from "../../../../../platform/agentHost/common/sshRemoteAgentHost.js";
import { IAgentHostTerminalService } from "../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { logTerminalRecovery } from "../../../../common/sessionsTelemetry.js";
Registry.as(ChatSessionsExtensions.AsyncActivation).register({
  matchSessionType: (sessionType) => isRemoteAgentHostSessionType(sessionType),
  waitForActivation: waitForRemoteAgentHostActivation
});
async function waitForRemoteAgentHostActivation(accessor, sessionType) {
  const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
  const address = getAddressForSessionType(sessionType, remoteAgentHostService);
  if (!address) {
    return false;
  }
  while (true) {
    const connection = remoteAgentHostService.getConnection(address);
    if (connection) {
      const rootState = connection.rootState.value;
      if (rootState instanceof Error) {
        return false;
      }
      if (rootState) {
        const authority = agentHostAuthority(address);
        return rootState.agents.some((agent) => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
      }
      await Promise.race([
        Event.toPromise(connection.rootState.onDidChange),
        Event.toPromise(remoteAgentHostService.onDidChangeConnections)
      ]);
      continue;
    }
    const connectionInfo = remoteAgentHostService.connections.find((connection2) => connection2.address === address);
    if (connectionInfo && !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo.status)) {
      return false;
    }
    if (!connectionInfo && !remoteAgentHostService.configuredEntries.some((entry) => getEntryAddress(entry) === address)) {
      return false;
    }
    await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
  }
}
function getAddressForSessionType(sessionType, remoteAgentHostService) {
  const authorities = /* @__PURE__ */ new Map();
  for (const connection of remoteAgentHostService.connections) {
    authorities.set(agentHostAuthority(connection.address), connection.address);
  }
  for (const entry of remoteAgentHostService.configuredEntries) {
    const address = getEntryAddress(entry);
    authorities.set(agentHostAuthority(address), address);
  }
  const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, authorities.keys());
  return authority ? authorities.get(authority) : void 0;
}
const SSH_RECONNECT_INITIAL_DELAY = 1e3;
const SSH_RECONNECT_MAX_DELAY = 3e4;
const SSH_RECONNECT_MAX_ATTEMPTS = 10;
const SSH_RECONNECT_PAUSE_AUTO_RESUME_MS = 5 * 60 * 1e3;
const SSH_RECONNECT_PERIODIC_INTERVAL_MS = 6e4;
class SSHReconnectState extends Disposable {
  constructor() {
    super(...arguments);
    this._timer = this._register(new MutableDisposable());
    /** Consecutive failed reconnect attempts. */
    this.attempts = 0;
    /** True after we've given up auto-reconnecting until something resumes us. */
    this.paused = false;
    /** Wall-clock timestamp when {@link paused} was last set to true. */
    this.pausedAt = 0;
  }
  get hasPendingTimer() {
    return !!this._timer.value;
  }
  scheduleRetry(delayMs, handler) {
    this._timer.value = disposableTimeout(() => {
      this._timer.value = void 0;
      handler();
    }, delayMs);
  }
  cancelTimer() {
    this._timer.clear();
  }
  resetForResume() {
    this.attempts = 0;
    this.paused = false;
    this._timer.clear();
  }
}
function shouldPauseSSHReconnectAfterFailure(err) {
  return isCancellationError(err);
}
function sshConnectionKey(connection) {
  return connection.sshConfigHost ? `ssh:${connection.sshConfigHost}` : `${connection.user ?? connection.hostName}@${connection.hostName}:${connection.port ?? 22}`;
}
async function disconnectSSHEntry(connection, remoteAgentHostService, sshService) {
  await remoteAgentHostService.removeRemoteAgentHost(connection.address);
  await sshService.disconnect(sshConnectionKey(connection));
}
class ConnectionState extends Disposable {
  constructor(name, connection) {
    super();
    this.name = name;
    this.connection = connection;
    this.store = this._register(new DisposableStore());
    this.agents = this._register(new DisposableMap());
    this.modelProviders = /* @__PURE__ */ new Map();
    /** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
    this.authTokenCache = new AgentHostAuthTokenCache();
  }
}
let RemoteAgentHostContribution = class extends Disposable {
  constructor(_remoteAgentHostService, _chatSessionsService, _languageModelsService, _logService, _instantiationService, _authenticationService, _defaultAccountService, _notificationService, _sessionsProvidersService, _configurationService, _agentHostFileSystemService, _sshService, _customizationHarnessService, _agentHostTerminalService, _telemetryService, _activeClientService, _connectionCustomizations) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._chatSessionsService = _chatSessionsService;
    this._languageModelsService = _languageModelsService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._authenticationService = _authenticationService;
    this._defaultAccountService = _defaultAccountService;
    this._notificationService = _notificationService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._configurationService = _configurationService;
    this._agentHostFileSystemService = _agentHostFileSystemService;
    this._sshService = _sshService;
    this._customizationHarnessService = _customizationHarnessService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._telemetryService = _telemetryService;
    this._activeClientService = _activeClientService;
    this._connectionCustomizations = _connectionCustomizations;
    /** Per-connection state: client state + per-agent registrations. */
    this._connections = this._register(new DisposableMap());
    /** Per-address sessions provider, registered for all configured entries. */
    this._providerStores = this._register(new DisposableMap());
    this._providerInstances = /* @__PURE__ */ new Map();
    /**
     * In-flight reconnect attempts keyed by host id (`sshConfigHost` for SSH,
     * `distro` for WSL). Stores the {@link _attemptManagedReconnect} promise
     * so concurrent on-demand callers (e.g. a user click on "Select..." while
     * the periodic poll is already reconnecting) join the existing attempt
     * rather than racing it.
     */
    this._pendingSSHReconnects = /* @__PURE__ */ new Map();
    /** Per-host SSH auto-reconnect state (timer + attempts + paused). */
    this._sshReconnectStates = this._register(new DisposableMap());
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
        this._resumeSSHReconnects();
        this._reconcile();
      }
    }));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._resumeSSHReconnects();
      this._reconcile();
    }));
    this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
    this._register(this._authenticationService.onDidChangeSessions(() => this._authenticateAllConnections()));
    this._reconcile();
    this._register(new IntervalTimer()).cancelAndSet(
      () => {
        this._logService.trace("[RemoteAgentHost] Periodic reconcile (backstop)");
        this._reconcile();
      },
      SSH_RECONNECT_PERIODIC_INTERVAL_MS
    );
  }
  _reconcile() {
    this._reconcileProviders();
    this._reconcileConnections();
    this._reconnectSSHEntries();
    for (const [address, connState] of this._connections) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      const provider = this._providerInstances.get(address);
      if (provider) {
        provider.setConnection(connState.connection, connectionInfo?.defaultDirectory);
      }
    }
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
      } else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
  _reconcileProviders() {
    const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const entries = enabled ? this._remoteAgentHostService.configuredEntries : [];
    const desiredAddresses = new Set(entries.map((e) => getEntryAddress(e)));
    for (const [address] of this._providerStores) {
      if (!desiredAddresses.has(address)) {
        this._providerStores.deleteAndDispose(address);
      }
    }
    for (const entry of entries) {
      const address = getEntryAddress(entry);
      const existing = this._providerInstances.get(address);
      if (existing && existing.label !== (entry.name || address)) {
        this._providerStores.deleteAndDispose(address);
      }
      if (!this._providerStores.has(address)) {
        this._createProvider(entry);
      }
    }
  }
  _createProvider(entry) {
    const address = getEntryAddress(entry);
    const sshConnection = entry.connection.type === RemoteAgentHostEntryType.SSH ? entry.connection : void 0;
    let connectOnDemand;
    let disconnectOnDemand;
    if (sshConnection) {
      connectOnDemand = () => this._connectSSHOnDemand(sshConnection, entry.name, address);
      disconnectOnDemand = () => this._disconnectSSHOnDemand(sshConnection);
    }
    const store = new DisposableStore();
    const provider = this._instantiationService.createInstance(
      RemoteAgentHostSessionsProvider,
      { address, name: entry.name, connectOnDemand, disconnectOnDemand }
    );
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => this._providerInstances.delete(address)));
    this._providerStores.set(address, store);
  }
  /**
   * Re-establish SSH connections for configured entries that have an
   * sshConfigHost but no active connection. Schedules retries with
   * exponential backoff on failure so a transient outage doesn't leave
   * the host stuck "disconnected" until the next config / connection
   * change. Auto-reconnect pauses after {@link SSH_RECONNECT_MAX_ATTEMPTS}
   * consecutive failures and resumes when {@link _reconcile} runs again
   * (config change, connection event) or {@link _resumeSSHReconnects} is
   * called.
   */
  _reconnectSSHEntries() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      this._sshReconnectStates.clearAndDisposeAll();
      return;
    }
    const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
    const entries = this._remoteAgentHostService.configuredEntries;
    const stillConfigured = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (entry.connection.type !== RemoteAgentHostEntryType.SSH || !entry.connection.sshConfigHost) {
        continue;
      }
      const sshConfigHost = entry.connection.sshConfigHost;
      stillConfigured.add(sshConfigHost);
      const address = getEntryAddress(entry);
      const hasConnection = this._remoteAgentHostService.connections.some(
        (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
      );
      if (hasConnection) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        continue;
      }
      if (this._pendingSSHReconnects.has(sshConfigHost)) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: reconnect already in progress, skipping`);
        continue;
      }
      const state = this._sshReconnectStates.get(sshConfigHost);
      if (state?.hasPendingTimer) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: retry timer already scheduled, skipping`);
        continue;
      }
      if (state?.paused) {
        const pausedMs = Date.now() - state.pausedAt;
        if (pausedMs < SSH_RECONNECT_PAUSE_AUTO_RESUME_MS) {
          this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: paused (${Math.round(pausedMs / 1e3)}s ago), skipping`);
          continue;
        }
        this._logService.info(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: auto-resuming after ${Math.round(pausedMs / 1e3)}s pause`);
        state.resetForResume();
      }
      if (!autoConnect) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: auto-connect disabled, skipping`);
        continue;
      }
      void this._attemptSSHReconnect(sshConfigHost, entry.name, address);
    }
    for (const host of [...this._sshReconnectStates.keys()]) {
      if (!stillConfigured.has(host)) {
        this._sshReconnectStates.deleteAndDispose(host);
      }
    }
  }
  async _connectSSHOnDemand(connection, name, address) {
    const sshConfigHost = connection.sshConfigHost;
    if (!sshConfigHost) {
      await this._sshService.connect({
        host: connection.hostName,
        port: connection.port,
        username: connection.user ?? connection.hostName,
        authMethod: SSHAuthMethod.Agent,
        name
      });
      return;
    }
    if (this._pendingSSHReconnects.has(sshConfigHost)) {
      await this._pendingSSHReconnects.get(sshConfigHost).catch(() => void 0);
      return;
    }
    this._sshReconnectStates.get(sshConfigHost)?.resetForResume();
    await this._attemptSSHReconnect(sshConfigHost, name, address, { userInitiated: true });
  }
  async _disconnectSSHOnDemand(connection) {
    if (connection.sshConfigHost) {
      this._sshReconnectStates.deleteAndDispose(connection.sshConfigHost);
    }
    await disconnectSSHEntry(connection, this._remoteAgentHostService, this._sshService);
  }
  async _attemptSSHReconnect(sshConfigHost, name, address, options = {}) {
    await this._attemptManagedReconnect({
      kind: "SSH",
      key: sshConfigHost,
      address,
      userInitiated: !!options.userInitiated,
      maxAttempts: SSH_RECONNECT_MAX_ATTEMPTS,
      shouldPause: shouldPauseSSHReconnectAfterFailure,
      pending: this._pendingSSHReconnects,
      states: this._sshReconnectStates,
      getOrCreateState: (key) => this._getOrCreateSSHReconnectState(key),
      doConnect: () => this._sshService.reconnect(sshConfigHost, name).then(() => void 0),
      schedule: (state) => this._scheduleSSHReconnect(sshConfigHost, name, address, state)
    });
  }
  _scheduleSSHReconnect(sshConfigHost, name, address, state) {
    const delay = Math.min(SSH_RECONNECT_INITIAL_DELAY * Math.pow(2, state.attempts - 1), SSH_RECONNECT_MAX_DELAY);
    this._logService.info(`[RemoteAgentHost] Scheduling SSH reconnect for ${sshConfigHost} in ${delay}ms (attempt ${state.attempts + 1}/${SSH_RECONNECT_MAX_ATTEMPTS})`);
    state.scheduleRetry(delay, () => {
      if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        return;
      }
      const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
      if (!autoConnect) {
        return;
      }
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        return;
      }
      if (this._pendingSSHReconnects.has(sshConfigHost)) {
        return;
      }
      void this._attemptSSHReconnect(sshConfigHost, name, address);
    });
  }
  _getOrCreateSSHReconnectState(sshConfigHost) {
    let state = this._sshReconnectStates.get(sshConfigHost);
    if (!state) {
      state = new SSHReconnectState();
      this._sshReconnectStates.set(sshConfigHost, state);
    }
    return state;
  }
  /**
   * Resume SSH auto-reconnect for any paused hosts. Called by the reconcile
   * path so that a fresh trigger (config change, new connection event) gives
   * paused hosts another chance.
   */
  _resumeSSHReconnects() {
    let resumed = 0;
    for (const [, state] of this._sshReconnectStates) {
      if (state.paused) {
        state.resetForResume();
        resumed++;
      }
    }
    if (resumed > 0) {
      this._logService.info(`[RemoteAgentHost] Resuming SSH auto-reconnect for ${resumed} paused host(s)`);
    }
  }
  /**
   * Shared retry-loop body for SSH managed-reconnect entries.
   *
   * Handles `connecting`/`disconnected`/`incompatible` provider status,
   * cached-session unpublishing on failure, pause-on-cancel, and
   * pause-after-max-attempts. An optional pre-check can bail out without
   * incrementing the attempt counter (returns `{ skip: true }`).
   */
  async _attemptManagedReconnect(opts) {
    const runPromise = (async () => {
      const state = opts.getOrCreateState(opts.key);
      const attempt = state.attempts;
      const provider = this._providerInstances.get(opts.address);
      if (opts.userInitiated) {
        provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      }
      this._logService.info(`[RemoteAgentHost] Re-establishing ${opts.kind} connection for ${opts.key} (attempt ${attempt + 1})`);
      try {
        if (opts.preCheck) {
          const result = await opts.preCheck(opts.userInitiated);
          if (result?.skip) {
            if (result.reason) {
              this._logService.info(`[RemoteAgentHost] ${opts.kind} reconnect for ${opts.key}: ${result.reason}; skipping`);
            }
            return;
          }
        }
        await opts.doConnect();
        opts.states.deleteAndDispose(opts.key);
        this._logService.info(`[RemoteAgentHost] ${opts.kind} connection re-established for ${opts.key}`);
      } catch (err) {
        if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
          opts.states.deleteAndDispose(opts.key);
          return;
        }
        if (opts.userInitiated) {
          provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
        }
        if (opts.shouldPause(err)) {
          this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after user cancellation`);
          provider?.unpublishCachedSessions();
          const liveState2 = opts.getOrCreateState(opts.key);
          liveState2.paused = true;
          liveState2.pausedAt = Date.now();
          return;
        }
        this._logService.error(`[RemoteAgentHost] ${opts.kind} reconnect failed for ${opts.key}`, err);
        const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
        if (incompatible) {
          provider?.setConnectionStatus(incompatible);
          opts.states.deleteAndDispose(opts.key);
          return;
        }
        provider?.unpublishCachedSessions();
        const liveState = opts.getOrCreateState(opts.key);
        liveState.attempts = attempt + 1;
        if (liveState.attempts >= opts.maxAttempts) {
          this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${liveState.attempts} consecutive failures`);
          liveState.paused = true;
          liveState.pausedAt = Date.now();
          return;
        }
        if (opts.userInitiated) {
          return;
        }
        opts.schedule(liveState);
      }
    })();
    opts.pending.set(opts.key, runPromise);
    try {
      await runPromise;
    } finally {
      opts.pending.delete(opts.key);
    }
  }
  _reconcileConnections() {
    const currentConnections = this._remoteAgentHostService.connections;
    const connectedAddresses = new Set(
      currentConnections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).map((c) => c.address)
    );
    const allAddresses = new Set(currentConnections.map((c) => c.address));
    for (const [address] of this._connections) {
      if (!allAddresses.has(address)) {
        this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
        this._providerInstances.get(address)?.clearConnection();
        this._connections.deleteAndDispose(address);
      } else if (!connectedAddresses.has(address)) {
      }
    }
    for (const connectionInfo of currentConnections) {
      if (!RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
        continue;
      }
      const existing = this._connections.get(connectionInfo.address);
      if (existing) {
        const nameChanged = existing.name !== connectionInfo.name;
        const clientIdChanged = existing.connection.clientId !== connectionInfo.clientId;
        if (nameChanged || clientIdChanged) {
          this._logService.info(`[RemoteAgentHost] Reconnecting contribution for ${connectionInfo.address}: oldClientId=${existing.connection.clientId}, newClientId=${connectionInfo.clientId}, nameChanged=${nameChanged}`);
          const oldClientId = existing.connection.clientId;
          this._connections.deleteAndDispose(connectionInfo.address);
          this._setupConnection(connectionInfo);
          if (clientIdChanged) {
            const newConnection = this._remoteAgentHostService.getConnection(connectionInfo.address);
            if (newConnection) {
              this._agentHostTerminalService.reconnectTerminals(newConnection, oldClientId).then(
                ({ recovered, total }) => {
                  if (total > 0) {
                    this._logService.info(`[RemoteAgentHost] Terminal reconnection: ${recovered}/${total} recovered`);
                    logTerminalRecovery(this._telemetryService, { recoveredCount: recovered, totalCount: total });
                  }
                },
                (err) => this._logService.warn("[RemoteAgentHost] Terminal reconnection failed", err)
              );
            }
          }
        }
      } else {
        this._setupConnection(connectionInfo);
      }
    }
  }
  _setupConnection(connectionInfo) {
    const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
    if (!connection) {
      return;
    }
    const { address, name } = connectionInfo;
    const connState = this._instantiationService.createInstance(ConnectionState, name, connection);
    this._connections.set(address, connState);
    const store = connState.store;
    store.add(this._instantiationService.createInstance(
      RemoteAgentHostLogForwarder,
      connection,
      address,
      name || address
    ));
    const authority = agentHostAuthority(address);
    store.add(this._agentHostFileSystemService.registerAuthority(authority, connection));
    store.add(connection.rootState.onDidChange((rootState) => {
      this._handleRootStateChange(address, connection, rootState);
    }));
    const initialRootState = connection.rootState.value;
    if (initialRootState && !(initialRootState instanceof Error)) {
      this._handleRootStateChange(address, connection, initialRootState);
    }
    const provider = this._providerInstances.get(address);
    if (provider) {
      provider.setConnection(connection, connectionInfo.defaultDirectory);
    }
  }
  _handleRootStateChange(address, connection, rootState) {
    const connState = this._connections.get(address);
    if (!connState) {
      return;
    }
    const incoming = new Set(rootState.agents.map((a) => a.provider));
    for (const [provider] of connState.agents) {
      if (!incoming.has(provider)) {
        connState.agents.deleteAndDispose(provider);
        connState.modelProviders.delete(provider);
      }
    }
    this._authenticateWithConnection(address, connection, rootState.agents).catch(() => {
    });
    for (const agent of rootState.agents) {
      if (!connState.agents.has(agent.provider)) {
        this._registerAgent(address, connection, agent, connState.name);
      } else {
        const modelProvider = connState.modelProviders.get(agent.provider);
        modelProvider?.updateModels(agent.models);
      }
    }
  }
  _registerAgent(address, connection, agent, configuredName) {
    const connState = this._connections.get(address);
    if (!connState) {
      return;
    }
    const agentStore = new DisposableStore();
    connState.agents.set(agent.provider, agentStore);
    connState.store.add(agentStore);
    const sanitized = agentHostAuthority(address);
    const providerId = `agenthost-${sanitized}`;
    const sessionType = remoteAgentHostSessionTypeId(sanitized, agent.provider);
    const agentId = sessionType;
    const vendor = sessionType;
    const hostLabel = configuredName || address;
    const agentLabel = agent.displayName?.trim() || agent.provider;
    const displayName = `${agentLabel} [${hostLabel}]`;
    const sessionWorkingDirs = /* @__PURE__ */ new Map();
    agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));
    const resolveWorkingDirectory = (sessionResource) => {
      const resourceKey = sessionResource.toString();
      const cached = sessionWorkingDirs.get(resourceKey);
      if (cached) {
        return cached;
      }
      const provider = this._sessionsProvidersService.getProvider(providerId);
      const session = provider?.getSessionByResource(sessionResource);
      const workingDirectory = session?.workspace.get()?.folders[0]?.workingDirectory;
      if (workingDirectory) {
        sessionWorkingDirs.set(resourceKey, workingDirectory);
        return workingDirectory;
      }
      return void 0;
    };
    const isNewSession = (sessionResource) => {
      const provider = this._sessionsProvidersService.getProvider(providerId);
      return provider?.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
    };
    agentStore.add(this._chatSessionsService.registerChatSessionContribution({
      type: sessionType,
      name: agentId,
      displayName,
      description: agent.description,
      canDelegate: true,
      requiresCustomModels: true,
      supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
      agentHostProviderId: agent.provider,
      supportsDelegation: true,
      capabilities: {
        supportsCheckpoints: true,
        supportsPromptAttachments: true,
        supportsImageAttachments: true,
        get terminalCommandPrefix() {
          return connection.initializeResult.get()?.terminalCommandPrefix;
        }
      }
    }));
    const pluginController = agentStore.add(this._instantiationService.createInstance(
      RemoteAgentPluginController,
      hostLabel,
      sanitized,
      connection
    ));
    const agentRegistration = agentStore.add(this._activeClientService.registerForAgent(sessionType, { includeUserStorage: true }));
    const syncProvider = agentRegistration.syncProvider;
    const itemProvider = agentStore.add(this._instantiationService.createInstance(
      AgentCustomizationItemProvider,
      sanitized,
      (customization, clientId) => {
        if (clientId !== void 0) {
          return void 0;
        }
        return [{
          id: "remoteAgentHost.removeConfiguredPlugin",
          label: nls.localize("remoteAgentHost.removeConfiguredPlugin", "Remove from Remote Host"),
          icon: Codicon.trash,
          run: () => pluginController.removeConfiguredPlugin(customization)
        }];
      },
      (syncedUri) => agentRegistration.bundler.getOrigin(syncedUri)
    ));
    const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, pluginController, itemProvider, syncProvider);
    agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));
    const sessionHandler = agentStore.add(this._instantiationService.createInstance(
      AgentHostSessionHandler,
      {
        provider: agent.provider,
        backendSessionScheme: this._connectionCustomizations.get(address)?.backendSessionScheme?.(agent.provider),
        agentId,
        sessionType,
        fullName: displayName,
        description: agent.description,
        connection,
        connectionAuthority: sanitized,
        extensionId: "vscode.remote-agent-host",
        extensionDisplayName: "Remote Agent Host",
        resolveWorkingDirectory,
        isNewSession,
        resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(address, connection, resources)
      }
    ));
    agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));
    const vendorDescriptor = { vendor, displayName, configuration: void 0, managementCommand: void 0, when: void 0 };
    this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
    agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
    const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
    connState.modelProviders.set(agent.provider, modelProvider);
    agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
    agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
    modelProvider.updateModels(agent.models);
    this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
  }
  _authenticateAllConnections() {
    for (const [address, connState] of this._connections) {
      const rootState = connState.connection.rootState.value;
      if (rootState && !(rootState instanceof Error)) {
        this._authenticateWithConnection(address, connState.connection, rootState.agents).catch(() => {
        });
      }
    }
  }
  /**
   * Authenticate using protectedResources from agent info in root state.
   * Resolves tokens via the standard VS Code authentication service.
   *
   * Marks the matching provider's `authenticationPending` observable while
   * the auth pass is in flight so that sessions surface as still loading.
   */
  async _authenticateWithConnection(address, connection, agents) {
    const providerId = `agenthost-${agentHostAuthority(address)}`;
    const provider = this._sessionsProvidersService.getProvider(providerId);
    const authTokenCache = this._connections.get(address)?.authTokenCache;
    provider?.setAuthenticationPending(true);
    try {
      await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
        authTokenCache,
        logPrefix: "[RemoteAgentHost]",
        authenticate: this._authenticateCallback(address, connection)
      });
    } catch (err) {
      this._logService.error("[RemoteAgentHost] Failed to authenticate with connection", err);
    } finally {
      provider?.setAuthenticationPending(false);
    }
  }
  /**
   * Build the `authenticate` callback for a connection. Host-agnostic by default (forwards the
   * request unchanged); a connection kind may inject a token transform via
   * {@link IRemoteAgentHostConnectionCustomizationService} — e.g. cloud sandbox connections, whose
   * host rejects plaintext bearers over the relay (`-32602`) and requires a Mission-Control-sealed
   * envelope. The transform owns fail-closed validation, so a raw token can never reach the host.
   */
  _authenticateCallback(address, connection) {
    const transform = this._connectionCustomizations.get(address)?.authenticate;
    if (!transform) {
      return (request) => connection.authenticate(request);
    }
    return async (request) => connection.authenticate(await transform(request));
  }
  /**
   * Interactively prompt the user to authenticate when the server requires it.
   * Returns true if authentication succeeded.
   */
  async _resolveAuthenticationInteractively(address, connection, protectedResources) {
    const authTokenCache = this._connections.get(address)?.authTokenCache;
    if (authTokenCache && this._connectionCustomizations.get(address)?.authenticate) {
      authTokenCache.clear();
    }
    return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
      authTokenCache,
      logPrefix: "[RemoteAgentHost]",
      authenticate: this._authenticateCallback(address, connection)
    });
  }
};
RemoteAgentHostContribution.ID = "sessions.contrib.remoteAgentHostContribution";
RemoteAgentHostContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentHostService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IDefaultAccountService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, ISessionsProvidersService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAgentHostFileSystemService),
  __decorateParam(11, ISSHRemoteAgentHostService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, IAgentHostTerminalService),
  __decorateParam(14, ITelemetryService),
  __decorateParam(15, IAgentHostActiveClientService),
  __decorateParam(16, IRemoteAgentHostConnectionCustomizationService)
], RemoteAgentHostContribution);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);
registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerAction2(OpenSessionEventsFileAction);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  properties: {
    [RemoteAgentHostsEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.remoteAgentHosts.enabled", "Enable connecting to remote agent hosts."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [RemoteAgentHostAutoConnectSettingId]: {
      type: "boolean",
      description: nls.localize("chat.remoteAgentHosts.autoConnect", "Automatically connect to online dev tunnel and SSH-configured remote agent hosts on startup. When disabled, cached sessions are still shown but connections are established only on demand."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    // Off by default: sandbox tasks currently carry the `copilot-developer-cli` slug, which the
    // Copilot extension's cloud provider does not list, so the two do not overlap. That slug is
    // expected to change, at which point both providers would list the same task — see
    // `CLOUD_SANDBOX_AGENT_SLUG`.
    [CloudSandboxEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.cloudSandbox.enabled", "Enable connecting to Copilot cloud sandbox sessions over a live Agent Host Protocol relay. When enabled, opening a Copilot CLI cloud session connects to its sandbox for slash commands and a responsive, steerable experience instead of only polling logs."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    "chat.sshRemoteAgentHostCommand": {
      type: "string",
      description: nls.localize("chat.sshRemoteAgentHostCommand", "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    "chat.agentHost.forwardSSHAgent": {
      type: "boolean",
      description: nls.localize("chat.agentHost.forwardSSHAgent", "When enabled, forwards the local SSH agent to the remote machine during SSH agent host connections to hosts whose SSH config has `ForwardAgent yes`. Only enable this for trusted hosts. The remote agent host process must be restarted for this setting to take effect."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [RemoteAgentHostsSettingId]: {
      type: "array",
      items: {
        type: "object",
        properties: {
          address: { type: "string", description: nls.localize("chat.remoteAgentHosts.address", 'The WebSocket address of the remote agent host (e.g. "localhost:3000").') },
          name: { type: "string", description: nls.localize("chat.remoteAgentHosts.name", "A display name for this remote agent host.") },
          connectionToken: { type: "string", description: nls.localize("chat.remoteAgentHosts.connectionToken", "An optional connection token for authenticating with the remote agent host.") }
        },
        required: ["address", "name"]
      },
      description: nls.localize("chat.remoteAgentHosts", 'A list of WebSocket remote agent host addresses to connect to (e.g. "localhost:3000"). SSH remote agent host details are managed by VS Code.'),
      default: [],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [TunnelAgentHostsSettingId]: {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.remoteAgentTunnels", "Additional dev tunnel names to look for when connecting to remote agent hosts. These are looked up in addition to tunnels automatically enumerated from your account."),
      default: [],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostLocalFilePermissionsSettingId]: {
      type: "object",
      description: nls.localize("chat.agentHost.localFilePermissions", "Per-host filesystem grants for remote agent hosts. Maps a remote agent host address to URI strings and the access mode the host has been granted (`r` for read, `rw` for read and write). Hosts cannot read or write any files outside the granted URIs without prompting; a URI grant covers descendants. This setting is normally maintained by the agent-host permission prompts and rarely edited by hand."),
      additionalProperties: {
        type: "object",
        additionalProperties: {
          type: "string",
          enum: ["r", "rw"],
          enumDescriptions: [
            nls.localize("chat.agentHost.localFilePermissions.read", "Read-only access."),
            nls.localize("chat.agentHost.localFilePermissions.readWrite", "Read and write access.")
          ]
        }
      },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    }
  }
});
import "./remoteAgentHostActions.js";
import "./manageRemoteAgentHosts.js";
import "../../agentHost/browser/agentHostAgentPicker.js";
import { AgentCustomizationItemProvider } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js";
import { Codicon } from "../../../../../base/common/codicons.js";
export {
  RemoteAgentHostContribution,
  SSHReconnectState,
  disconnectSSHEntry,
  shouldPauseSSHReconnectAfterFailure,
  sshConnectionKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3JlbW90ZUFnZW50SG9zdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgSW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyB0eXBlIEFnZW50UHJvdmlkZXIsIHR5cGUgQXV0aGVudGljYXRlUGFyYW1zLCB0eXBlIEF1dGhlbnRpY2F0ZVJlc3VsdCwgdHlwZSBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvLCBJUmVtb3RlQWdlbnRIb3N0RW50cnksIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCB0eXBlIElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uLCBSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCwgUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCwgZ2V0RW50cnlBZGRyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFR1bm5lbEFnZW50SG9zdHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBDbG91ZFNhbmRib3hFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jbG91ZFNhbmRib3hBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgdHlwZSBBZ2VudEluZm8sIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9uIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvb3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlLCByZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEF1dGguanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLCBhZ2VudEhvc3RQcm92aWRlclN1cHBvcnRzQXV0b01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uc0V4dGVuc2lvbnMsIElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5LCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBmaW5kUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHksIGlzUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGUsIHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZUFnZW50SGFybmVzc0Rlc2NyaXB0b3IsIFJlbW90ZUFnZW50UGx1Z2luQ29udHJvbGxlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0Q3VzdG9taXphdGlvbkhhcm5lc3MuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0TG9nRm9yd2FyZGVyIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RMb2dGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuL3JlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgd2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zIH0gZnJvbSAnLi9yZW1vdGVIb3N0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgU1NIQXV0aE1ldGhvZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3NoUmVtb3RlQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9icm93c2VyL2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGxvZ1Rlcm1pbmFsUmVjb3ZlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbnNUZWxlbWV0cnkuanMnO1xuXG5SZWdpc3RyeS5hczxJQXN5bmNDaGF0U2Vzc2lvbkFjdGl2YXRpb25SZWdpc3RyeT4oQ2hhdFNlc3Npb25zRXh0ZW5zaW9ucy5Bc3luY0FjdGl2YXRpb24pLnJlZ2lzdGVyKHtcblx0bWF0Y2hTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUgPT4gaXNSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSksXG5cdHdhaXRGb3JBY3RpdmF0aW9uOiB3YWl0Rm9yUmVtb3RlQWdlbnRIb3N0QWN0aXZhdGlvbixcbn0pO1xuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yUmVtb3RlQWdlbnRIb3N0QWN0aXZhdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvblR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgYWRkcmVzcyA9IGdldEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdGlmICghYWRkcmVzcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0Y29uc3Qgcm9vdFN0YXRlID0gY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJvb3RTdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0XHRcdHJldHVybiByb290U3RhdGUuYWdlbnRzLnNvbWUoYWdlbnQgPT4gcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZChhdXRob3JpdHksIGFnZW50LnByb3ZpZGVyKSA9PT0gc2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRFdmVudC50b1Byb21pc2UoY29ubmVjdGlvbi5yb290U3RhdGUub25EaWRDaGFuZ2UpLFxuXHRcdFx0XHRFdmVudC50b1Byb21pc2UocmVtb3RlQWdlbnRIb3N0U2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdGlmIChjb25uZWN0aW9uSW5mbyAmJiAhUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RpbmcoY29ubmVjdGlvbkluZm8uc3RhdHVzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghY29ubmVjdGlvbkluZm8gJiYgIXJlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29uZmlndXJlZEVudHJpZXMuc29tZShlbnRyeSA9PiBnZXRFbnRyeUFkZHJlc3MoZW50cnkpID09PSBhZGRyZXNzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZTogc3RyaW5nLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGF1dGhvcml0aWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRhdXRob3JpdGllcy5zZXQoYWdlbnRIb3N0QXV0aG9yaXR5KGNvbm5lY3Rpb24uYWRkcmVzcyksIGNvbm5lY3Rpb24uYWRkcmVzcyk7XG5cdH1cblx0Zm9yIChjb25zdCBlbnRyeSBvZiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzKSB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGdldEVudHJ5QWRkcmVzcyhlbnRyeSk7XG5cdFx0YXV0aG9yaXRpZXMuc2V0KGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKSwgYWRkcmVzcyk7XG5cdH1cblxuXHRjb25zdCBhdXRob3JpdHkgPSBmaW5kUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHkoc2Vzc2lvblR5cGUsIGF1dGhvcml0aWVzLmtleXMoKSk7XG5cdHJldHVybiBhdXRob3JpdHkgPyBhdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEluaXRpYWwgYXV0by1yZWNvbm5lY3QgZGVsYXkgYWZ0ZXIgYSBmYWlsZWQgU1NIIHJlY29ubmVjdCBhdHRlbXB0LiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9JTklUSUFMX0RFTEFZID0gMTAwMDtcbi8qKiBNYXhpbXVtIGF1dG8tcmVjb25uZWN0IGJhY2tvZmYgZGVsYXkgZm9yIFNTSC4gKi9cbmNvbnN0IFNTSF9SRUNPTk5FQ1RfTUFYX0RFTEFZID0gMzBfMDAwO1xuLyoqXG4gKiBDb25zZWN1dGl2ZSBTU0ggcmVjb25uZWN0IGZhaWx1cmVzIGJlZm9yZSBwYXVzaW5nIGF1dG8tcmVjb25uZWN0LiBXZSByZXN1bWVcbiAqIHdoZW4gdGhlIHVzZXIgY2hhbmdlcyBjb25maWcsIHdoZW4ge0BsaW5rIF9yZWNvbmNpbGV9IGlzIG90aGVyd2lzZSB0cmlnZ2VyZWRcbiAqIChlLmcuIGEgbmV3IGNvbm5lY3Rpb24gYXJyaXZlcyksIG9yIHdoZW4ge0BsaW5rIF9yZXN1bWVTU0hSZWNvbm5lY3RzfSBpc1xuICogZXhwbGljaXRseSBpbnZva2VkLiBUaGlzIGJvdW5kcyBub2lzZSBmcm9tIGEgcGVybWFuZW50bHktZGVhZCBob3N0IHdoaWxlXG4gKiBzdGlsbCBiZWluZyByZXNwb25zaXZlIHRvIFwidGhlIG5ldHdvcmsganVzdCBjYW1lIGJhY2tcIi5cbiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9NQVhfQVRURU1QVFMgPSAxMDtcbi8qKlxuICogQWZ0ZXIgdGhpcyBtdWNoIHdhbGwtY2xvY2sgdGltZSwgYSBwYXVzZWQgYXV0by1yZWNvbm5lY3QgaXMgYXV0b21hdGljYWxseVxuICogcmVzdW1lZCBieSB0aGUgcGVyaW9kaWMgcmVjb25jaWxlLiBDb3ZlcnMgdGhlIGNhc2Ugd2hlcmUgcmVjb25uZWN0IGF0dGVtcHRzXG4gKiBhbGwgZmFpbGVkIHF1aWNrbHkgKGUuZy4gbmV0d29yayBub3QgcmVhZHkgcmlnaHQgYWZ0ZXIgc2xlZXApLCBleGhhdXN0ZWQgdGhlXG4gKiBhdHRlbXB0IGJ1ZGdldCwgYW5kIG5vIG90aGVyIHRyaWdnZXIgKGNvbmZpZyBjaGFuZ2UsIGNvbm5lY3Rpb24gZXZlbnQpIGZpcmVkXG4gKiB0byBnaXZlIHRoZW0gYSBmcmVzaCBjaGFuY2UuXG4gKi9cbmNvbnN0IFNTSF9SRUNPTk5FQ1RfUEFVU0VfQVVUT19SRVNVTUVfTVMgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcbi8qKlxuICogSG93IG9mdGVuIHRoZSBwZXJpb2RpYyByZWNvbmNpbGUgYmFja3N0b3AgcnVucy4gVGhpcyBmaXJlcyB7QGxpbmsgX3JlY29uY2lsZX1cbiAqIGV2ZW4gd2hlbiBubyBldmVudCBhcnJpdmVzLCBzbyBhIGJyb2tlbiBldmVudCBjaGFpbiBkb2Vzbid0IGxlYXZlIFNTSCBob3N0c1xuICogZGlzY29ubmVjdGVkIGluZGVmaW5pdGVseS5cbiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9QRVJJT0RJQ19JTlRFUlZBTF9NUyA9IDYwXzAwMDsgLy8gMSBtaW51dGVcblxuLyoqXG4gKiBQZXItaG9zdCBTU0ggYXV0by1yZWNvbm5lY3Qgc3RhdGUuIE93bmVkIGJ5IHtAbGluayBSZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24uX3NzaFJlY29ubmVjdFN0YXRlc31cbiAqIHdoaWNoIGRpc3Bvc2VzIHRoZSBlbnRyeSBcdTIwMTQgYW5kIHRoZXJlZm9yZSB0aGUgcGVuZGluZyB0aW1lciBcdTIwMTQgd2hlbiB0aGUgaG9zdFxuICogaXMgbm8gbG9uZ2VyIGNvbmZpZ3VyZWQgb3Igd2hlbiB0aGUgY29udHJpYnV0aW9uIGl0c2VsZiBpcyBkaXNwb3NlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNTSFJlY29ubmVjdFN0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBDb25zZWN1dGl2ZSBmYWlsZWQgcmVjb25uZWN0IGF0dGVtcHRzLiAqL1xuXHRhdHRlbXB0cyA9IDA7XG5cdC8qKiBUcnVlIGFmdGVyIHdlJ3ZlIGdpdmVuIHVwIGF1dG8tcmVjb25uZWN0aW5nIHVudGlsIHNvbWV0aGluZyByZXN1bWVzIHVzLiAqL1xuXHRwYXVzZWQgPSBmYWxzZTtcblx0LyoqIFdhbGwtY2xvY2sgdGltZXN0YW1wIHdoZW4ge0BsaW5rIHBhdXNlZH0gd2FzIGxhc3Qgc2V0IHRvIHRydWUuICovXG5cdHBhdXNlZEF0ID0gMDtcblxuXHRnZXQgaGFzUGVuZGluZ1RpbWVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3RpbWVyLnZhbHVlO1xuXHR9XG5cblx0c2NoZWR1bGVSZXRyeShkZWxheU1zOiBudW1iZXIsIGhhbmRsZXI6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl90aW1lci52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdC8vIERyb3AgdGhlIGRpc3Bvc2FibGUgbm93IHRoYXQgdGhlIHRpbWVyIGhhcyBmaXJlZCBzb1xuXHRcdFx0Ly8gYGhhc1BlbmRpbmdUaW1lcmAgcmVmbGVjdHMgcmVhbGl0eSBldmVuIGlmIGBoYW5kbGVyYCByZXR1cm5zXG5cdFx0XHQvLyBlYXJseSB3aXRob3V0IHNjaGVkdWxpbmcgYSBmb2xsb3ctdXAgYXR0ZW1wdC5cblx0XHRcdHRoaXMuX3RpbWVyLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0aGFuZGxlcigpO1xuXHRcdH0sIGRlbGF5TXMpO1xuXHR9XG5cblx0Y2FuY2VsVGltZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fdGltZXIuY2xlYXIoKTtcblx0fVxuXG5cdHJlc2V0Rm9yUmVzdW1lKCk6IHZvaWQge1xuXHRcdHRoaXMuYXR0ZW1wdHMgPSAwO1xuXHRcdHRoaXMucGF1c2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fdGltZXIuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkUGF1c2VTU0hSZWNvbm5lY3RBZnRlckZhaWx1cmUoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycik7XG59XG5cbi8qKlxuICogQ29ubmVjdGlvbiBrZXkgcGFzc2VkIHRvIHtAbGluayBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZS5kaXNjb25uZWN0fSBmb3JcbiAqIGFuIFNTSC1iYWNrZWQgcmVtb3RlIGFnZW50IGhvc3QgZW50cnkuIE1pcnJvcnMgdGhlIGtleSB0aGUgU1NIIHNlcnZpY2VcbiAqIGl0c2VsZiBjb25zdHJ1Y3RzIHdoZW4gaXQgc3RvcmVzIHRoZSBjb25uZWN0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3NoQ29ubmVjdGlvbktleShjb25uZWN0aW9uOiBJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbik6IHN0cmluZyB7XG5cdHJldHVybiBjb25uZWN0aW9uLnNzaENvbmZpZ0hvc3Rcblx0XHQ/IGBzc2g6JHtjb25uZWN0aW9uLnNzaENvbmZpZ0hvc3R9YFxuXHRcdDogYCR7Y29ubmVjdGlvbi51c2VyID8/IGNvbm5lY3Rpb24uaG9zdE5hbWV9QCR7Y29ubmVjdGlvbi5ob3N0TmFtZX06JHtjb25uZWN0aW9uLnBvcnQgPz8gMjJ9YDtcbn1cblxuLyoqXG4gKiBTZXF1ZW5jZSB0aGUgc3RlcHMgdG8gZGlzY29ubmVjdCBhbiBTU0gtYmFja2VkIHJlbW90ZSBhZ2VudCBob3N0IGVudHJ5XG4gKiB0cmlnZ2VyZWQgYnkgdGhlIHVzZXIgKGUuZy4gY2xpY2tpbmcgWCBpbiB0aGUgd29ya3NwYWNlIHBpY2tlcikuXG4gKlxuICogT3JkZXIgbWF0dGVyczogYHJlbW92ZVJlbW90ZUFnZW50SG9zdGAgTVVTVCBydW4gYmVmb3JlIHRoZSBTU0ggdHVubmVsXG4gKiB0ZWFyZG93bi4gYHNzaFNlcnZpY2UuZGlzY29ubmVjdCgpYCBmaXJlcyBgb25EaWRDbG9zZUNvbm5lY3Rpb25gXG4gKiBzeW5jaHJvbm91c2x5LCB3aGljaCB0aGUgcmVuZGVyZXIgdHJhbnNsYXRlcyBpbnRvIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYFxuICogYW5kIHRoZSBjb250cmlidXRpb24ncyBgX3JlY29uY2lsZWAgXHUyMTkyIGBfcmVjb25uZWN0U1NIRW50cmllc2AuIElmIHRoZSBlbnRyeVxuICogaXMgc3RpbGwgaW4gY29uZmlndXJlZCBzdG9yYWdlIGF0IHRoYXQgcG9pbnQsIHRoZSBhdXRvLXJlY29ubmVjdCBwYXRoXG4gKiBpbW1lZGlhdGVseSByZWNvbm5lY3RzIHRoZSBob3N0IHdlIGp1c3QgdG9sZCBpdCB0byBkaXNjb25uZWN0LlxuICpcbiAqIGByZW1vdmVSZW1vdGVBZ2VudEhvc3RgIGl0c2VsZiBydW5zIHRoZSBlbnRyeSdzIHRyYW5zcG9ydCBkaXNwb3NhYmxlXG4gKiAod2hpY2ggY2FsbHMgYF9tYWluU2VydmljZS5kaXNjb25uZWN0KGNvbm5lY3Rpb25JZClgKSwgc28gdGhlIHVuZGVybHlpbmdcbiAqIFNTSCB0dW5uZWwgaXMgYWxyZWFkeSBjbG9zZWQgd2hlbiB0aGlzIHJldHVybnMuIFRoZSBleHBsaWNpdFxuICogYHNzaFNlcnZpY2UuZGlzY29ubmVjdChjb25uZWN0aW9uS2V5KWAgaXMgYmVsdC1hbmQtc3VzcGVuZGVycyB0byBjbGVhclxuICogdGhlIGNvbm5lY3Rpb24gYnkgaXRzIGNvbm5lY3Rpb24ga2V5IGFzIHdlbGwsIG1hdGNoaW5nIHRoZSBwcmlvclxuICogdGVhcmRvd24gYmVoYXZpb3IuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkaXNjb25uZWN0U1NIRW50cnkoXG5cdGNvbm5lY3Rpb246IElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uLFxuXHRyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBQaWNrPElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCAncmVtb3ZlUmVtb3RlQWdlbnRIb3N0Jz4sXG5cdHNzaFNlcnZpY2U6IFBpY2s8SVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UsICdkaXNjb25uZWN0Jz4sXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoY29ubmVjdGlvbi5hZGRyZXNzKTtcblx0YXdhaXQgc3NoU2VydmljZS5kaXNjb25uZWN0KHNzaENvbm5lY3Rpb25LZXkoY29ubmVjdGlvbikpO1xufVxuXG4vKiogUGVyLWNvbm5lY3Rpb24gc3RhdGUgYnVuZGxlLCBkaXNwb3NlZCB3aGVuIGEgY29ubmVjdGlvbiBpcyByZW1vdmVkLiAqL1xuY2xhc3MgQ29ubmVjdGlvblN0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cmVhZG9ubHkgYWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8QWdlbnRQcm92aWRlciwgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cmVhZG9ubHkgbW9kZWxQcm92aWRlcnMgPSBuZXcgTWFwPEFnZW50UHJvdmlkZXIsIEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlcj4oKTtcblx0LyoqIERlZHVwZXMgcmVkdW5kYW50IGBhdXRoZW50aWNhdGVgIFJQQ3Mgd2hlbiB0aGUgcmVzb2x2ZWQgdG9rZW4gaGFzbid0IGNoYW5nZWQuICovXG5cdHJlYWRvbmx5IGF1dGhUb2tlbkNhY2hlID0gbmV3IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBEaXNjb3ZlcnMgYXZhaWxhYmxlIGFnZW50cyBmcm9tIGVhY2ggY29ubmVjdGVkIHJlbW90ZSBhZ2VudCBob3N0IGFuZFxuICogZHluYW1pY2FsbHkgcmVnaXN0ZXJzIGVhY2ggb25lIGFzIGEgY2hhdCBzZXNzaW9uIHR5cGUgd2l0aCBpdHMgb3duXG4gKiBzZXNzaW9uIGhhbmRsZXIgYW5kIGxhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLlxuICpcbiAqIFVzZXMgdGhlIHNhbWUgdW5pZmllZCB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXJ9IGFzIHRoZSBsb2NhbFxuICogYWdlbnQgaG9zdCwgb2J0YWluaW5nIHBlci1jb25uZWN0aW9uIHtAbGluayBJQWdlbnRDb25uZWN0aW9ufVxuICogaW5zdGFuY2VzIGZyb20ge0BsaW5rIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb259LlxuICovXG5leHBvcnQgY2xhc3MgUmVtb3RlQWdlbnRIb3N0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jb250cmliLnJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbic7XG5cblx0LyoqIFBlci1jb25uZWN0aW9uIHN0YXRlOiBjbGllbnQgc3RhdGUgKyBwZXItYWdlbnQgcmVnaXN0cmF0aW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENvbm5lY3Rpb25TdGF0ZT4oKSk7XG5cblx0LyoqIFBlci1hZGRyZXNzIHNlc3Npb25zIHByb3ZpZGVyLCByZWdpc3RlcmVkIGZvciBhbGwgY29uZmlndXJlZCBlbnRyaWVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlclN0b3JlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJJbnN0YW5jZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4oKTtcblx0LyoqXG5cdCAqIEluLWZsaWdodCByZWNvbm5lY3QgYXR0ZW1wdHMga2V5ZWQgYnkgaG9zdCBpZCAoYHNzaENvbmZpZ0hvc3RgIGZvciBTU0gsXG5cdCAqIGBkaXN0cm9gIGZvciBXU0wpLiBTdG9yZXMgdGhlIHtAbGluayBfYXR0ZW1wdE1hbmFnZWRSZWNvbm5lY3R9IHByb21pc2Vcblx0ICogc28gY29uY3VycmVudCBvbi1kZW1hbmQgY2FsbGVycyAoZS5nLiBhIHVzZXIgY2xpY2sgb24gXCJTZWxlY3QuLi5cIiB3aGlsZVxuXHQgKiB0aGUgcGVyaW9kaWMgcG9sbCBpcyBhbHJlYWR5IHJlY29ubmVjdGluZykgam9pbiB0aGUgZXhpc3RpbmcgYXR0ZW1wdFxuXHQgKiByYXRoZXIgdGhhbiByYWNpbmcgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU1NIUmVjb25uZWN0cyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXG5cdC8qKiBQZXItaG9zdCBTU0ggYXV0by1yZWNvbm5lY3Qgc3RhdGUgKHRpbWVyICsgYXR0ZW1wdHMgKyBwYXVzZWQpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zc2hSZWNvbm5lY3RTdGF0ZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFNTSFJlY29ubmVjdFN0YXRlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZTogSUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLFxuXHRcdEBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zc2hTZXJ2aWNlOiBJU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlOiBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ2xpZW50U2VydmljZTogSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkN1c3RvbWl6YXRpb25zOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUmVjb25jaWxlIHByb3ZpZGVycyB3aGVuIGNvbmZpZ3VyZWQgZW50cmllcyBjaGFuZ2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdEF1dG9Db25uZWN0U2V0dGluZ0lkKSkge1xuXHRcdFx0XHQvLyBVc2VyIGNoYW5nZWQgY29uZmlnIFx1MjAxNCBnaXZlIHBhdXNlZCBhdXRvLXJlY29ubmVjdCBhIGZyZXNoIGNoYW5jZS5cblx0XHRcdFx0dGhpcy5fcmVzdW1lU1NIUmVjb25uZWN0cygpO1xuXHRcdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZWNvbmNpbGUgd2hlbiBjb25uZWN0aW9ucyBjaGFuZ2UgKGFkZGVkL3JlbW92ZWQvcmVjb25uZWN0ZWQpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKCgpID0+IHtcblx0XHRcdC8vIE5ldy9yZW1vdmVkIGNvbm5lY3Rpb24gXHUyMDE0IHBhdXNlZCBhdXRvLXJlY29ubmVjdCBtYXkgaGF2ZSBiZWVuXG5cdFx0XHQvLyBjYXVzZWQgYnkgYSB0cmFuc2llbnQgb3V0YWdlIHRoYXQncyBub3cgcmVzb2x2ZWQuXG5cdFx0XHR0aGlzLl9yZXN1bWVTU0hSZWNvbm5lY3RzKCk7XG5cdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgU1NIIHJlY29ubmVjdCB0aW1lcnMgb24gZGlzcG9zZS5cblx0XHQvLyAoSGFuZGxlZCBhdXRvbWF0aWNhbGx5IGJ5IHRoZSBEaXNwb3NhYmxlTWFwIGFib3ZlOyBub3RoaW5nIGV4dHJhIG5lZWRlZCBoZXJlLilcblxuXHRcdC8vIFB1c2ggYXV0aCB0b2tlbiB3aGVuZXZlciB0aGUgZGVmYXVsdCBhY2NvdW50IG9yIHNlc3Npb25zIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHRoaXMuX2F1dGhlbnRpY2F0ZUFsbENvbm5lY3Rpb25zKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB0aGlzLl9hdXRoZW50aWNhdGVBbGxDb25uZWN0aW9ucygpKSk7XG5cblx0XHQvLyBJbml0aWFsIHNldHVwIGZvciBjb25maWd1cmVkIGVudHJpZXMgYW5kIGNvbm5lY3RlZCByZW1vdGVzXG5cdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cblx0XHQvLyBQZXJpb2RpYyBiYWNrc3RvcDogZXZlbiBpZiB0aGUgZXZlbnQtZHJpdmVuIGNoYWluIGJyZWFrcyAoZS5nLiBJUENcblx0XHQvLyBkZWxpdmVyeSBmYWlscyBhZnRlciBhIHNsZWVwL3dha2UgY3ljbGUpLCB0aGlzIGVuc3VyZXMgd2UgcmV0cnkgU1NIXG5cdFx0Ly8gcmVjb25uZWN0cyBhbmQgcmVjb25jaWxlIHByb3ZpZGVycyBhdCBtb3N0IG9uY2UgcGVyIG1pbnV0ZS5cblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJ2YWxUaW1lcigpKS5jYW5jZWxBbmRTZXQoXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tSZW1vdGVBZ2VudEhvc3RdIFBlcmlvZGljIHJlY29uY2lsZSAoYmFja3N0b3ApJyk7XG5cdFx0XHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXHRcdFx0fSxcblx0XHRcdFNTSF9SRUNPTk5FQ1RfUEVSSU9ESUNfSU5URVJWQUxfTVMsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNvbmNpbGVQcm92aWRlcnMoKTtcblx0XHR0aGlzLl9yZWNvbmNpbGVDb25uZWN0aW9ucygpO1xuXHRcdHRoaXMuX3JlY29ubmVjdFNTSEVudHJpZXMoKTtcblxuXHRcdC8vIEVuc3VyZSBldmVyeSBsaXZlIGNvbm5lY3Rpb24gaXMgd2lyZWQgdG8gaXRzIHByb3ZpZGVyLiBUaGlzIGNvdmVyc1xuXHRcdC8vIHRoZSBjYXNlIHdoZXJlIGEgcHJvdmlkZXIgd2FzIHJlY3JlYXRlZCAoZS5nLiBuYW1lIGNoYW5nZSkgd2hpbGUgYVxuXHRcdC8vIGNvbm5lY3Rpb24gZm9yIHRoYXQgYWRkcmVzcyBhbHJlYWR5IGV4aXN0ZWQuXG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgY29ublN0YXRlXSBvZiB0aGlzLl9jb25uZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk7XG5cdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvbihjb25uU3RhdGUuY29ubmVjdGlvbiwgY29ubmVjdGlvbkluZm8/LmRlZmF1bHREaXJlY3RvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBjb25uZWN0aW9uIHN0YXR1cyBvbiBhbGwgcHJvdmlkZXJzIChpbmNsdWRpbmcgdGhvc2Vcblx0XHQvLyB0aGF0IGFyZSByZWNvbm5lY3RpbmcgYW5kIGRvbid0IGhhdmUgYW4gYWN0aXZlIGNvbm5lY3Rpb24pLlxuXHRcdGZvciAoY29uc3QgW2FkZHJlc3MsIHByb3ZpZGVyXSBvZiB0aGlzLl9wcm92aWRlckluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdC8vIFNlcnZpY2UgaGFzIGFuIGVudHJ5IGZvciB0aGlzIGFkZHJlc3MgXHUyMDE0IGl0cyBzdGF0dXMgaXNcblx0XHRcdFx0Ly8gYXV0aG9yaXRhdGl2ZSAoaW5jbHVkaW5nIHRoZSBgaW5jb21wYXRpYmxlYCBzZXQgYnkgdGhlXG5cdFx0XHRcdC8vIFdlYlNvY2tldCBjb25uZWN0IGZhaWx1cmUgcGF0aCwgYW5kIHRoZSBgY29ubmVjdGluZ2Bcblx0XHRcdFx0Ly8gc3RhdHVzIG9mIGEgZnJlc2ggcmVjb25uZWN0IGF0dGVtcHQgYWZ0ZXIgYW4gdXBncmFkZSkuXG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoY29ubmVjdGlvbkluZm8uc3RhdHVzKTtcblx0XHRcdH0gZWxzZSBpZiAoIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUocHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKSkpIHtcblx0XHRcdFx0Ly8gTm8gc2VydmljZSBlbnRyeS4gUHJlc2VydmUgaW5jb21wYXRpYmxlIHN0YXRlIHNldCBieVxuXHRcdFx0XHQvLyB0aGUgU1NIIHJlY29ubmVjdCBjYXRjaCAod2hlcmUgdGhlIGZhaWx1cmUgaGFwcGVuc1xuXHRcdFx0XHQvLyBiZWZvcmUgdGhlIHNlcnZpY2UgZXZlciBzZWVzIGFuIGVudHJ5KTsgb3RoZXJ3aXNlIGZhbGxcblx0XHRcdFx0Ly8gYmFjayB0byBkaXNjb25uZWN0ZWQuXG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZVByb3ZpZGVycygpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBlbmFibGVkID8gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25maWd1cmVkRW50cmllcyA6IFtdO1xuXHRcdGNvbnN0IGRlc2lyZWRBZGRyZXNzZXMgPSBuZXcgU2V0KGVudHJpZXMubWFwKGUgPT4gZ2V0RW50cnlBZGRyZXNzKGUpKSk7XG5cblx0XHQvLyBSZW1vdmUgcHJvdmlkZXJzIG5vIGxvbmdlciBjb25maWd1cmVkXG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzc10gb2YgdGhpcy5fcHJvdmlkZXJTdG9yZXMpIHtcblx0XHRcdGlmICghZGVzaXJlZEFkZHJlc3Nlcy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJTdG9yZXMuZGVsZXRlQW5kRGlzcG9zZShhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgb3IgcmVjcmVhdGUgcHJvdmlkZXJzIGZvciBjb25maWd1cmVkIGVudHJpZXNcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGFkZHJlc3MgPSBnZXRFbnRyeUFkZHJlc3MoZW50cnkpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgJiYgZXhpc3RpbmcubGFiZWwgIT09IChlbnRyeS5uYW1lIHx8IGFkZHJlc3MpKSB7XG5cdFx0XHRcdC8vIE5hbWUgY2hhbmdlZCBcdTIwMTQgcmVjcmVhdGUgc2luY2UgSVNlc3Npb25zUHJvdmlkZXIubGFiZWwgaXMgcmVhZG9ubHlcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJTdG9yZXMuZGVsZXRlQW5kRGlzcG9zZShhZGRyZXNzKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fcHJvdmlkZXJTdG9yZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZVByb3ZpZGVyKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVQcm92aWRlcihlbnRyeTogSVJlbW90ZUFnZW50SG9zdEVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGdldEVudHJ5QWRkcmVzcyhlbnRyeSk7XG5cdFx0Y29uc3Qgc3NoQ29ubmVjdGlvbiA9IGVudHJ5LmNvbm5lY3Rpb24udHlwZSA9PT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCA/IGVudHJ5LmNvbm5lY3Rpb24gOiB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbm5lY3RPbkRlbWFuZDogKCgpID0+IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkaXNjb25uZWN0T25EZW1hbmQ6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc3NoQ29ubmVjdGlvbikge1xuXHRcdFx0Y29ubmVjdE9uRGVtYW5kID0gKCkgPT4gdGhpcy5fY29ubmVjdFNTSE9uRGVtYW5kKHNzaENvbm5lY3Rpb24sIGVudHJ5Lm5hbWUsIGFkZHJlc3MpO1xuXHRcdFx0ZGlzY29ubmVjdE9uRGVtYW5kID0gKCkgPT4gdGhpcy5fZGlzY29ubmVjdFNTSE9uRGVtYW5kKHNzaENvbm5lY3Rpb24pO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwgeyBhZGRyZXNzLCBuYW1lOiBlbnRyeS5uYW1lLCBjb25uZWN0T25EZW1hbmQsIGRpc2Nvbm5lY3RPbkRlbWFuZCB9KTtcblx0XHRzdG9yZS5hZGQocHJvdmlkZXIpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdHN0b3JlLmFkZCh3YXRjaEZvckluY29tcGF0aWJsZU5vdGlmaWNhdGlvbnMocHJvdmlkZXIsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuc2V0KGFkZHJlc3MsIHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmRlbGV0ZShhZGRyZXNzKSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLnNldChhZGRyZXNzLCBzdG9yZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtZXN0YWJsaXNoIFNTSCBjb25uZWN0aW9ucyBmb3IgY29uZmlndXJlZCBlbnRyaWVzIHRoYXQgaGF2ZSBhblxuXHQgKiBzc2hDb25maWdIb3N0IGJ1dCBubyBhY3RpdmUgY29ubmVjdGlvbi4gU2NoZWR1bGVzIHJldHJpZXMgd2l0aFxuXHQgKiBleHBvbmVudGlhbCBiYWNrb2ZmIG9uIGZhaWx1cmUgc28gYSB0cmFuc2llbnQgb3V0YWdlIGRvZXNuJ3QgbGVhdmVcblx0ICogdGhlIGhvc3Qgc3R1Y2sgXCJkaXNjb25uZWN0ZWRcIiB1bnRpbCB0aGUgbmV4dCBjb25maWcgLyBjb25uZWN0aW9uXG5cdCAqIGNoYW5nZS4gQXV0by1yZWNvbm5lY3QgcGF1c2VzIGFmdGVyIHtAbGluayBTU0hfUkVDT05ORUNUX01BWF9BVFRFTVBUU31cblx0ICogY29uc2VjdXRpdmUgZmFpbHVyZXMgYW5kIHJlc3VtZXMgd2hlbiB7QGxpbmsgX3JlY29uY2lsZX0gcnVucyBhZ2FpblxuXHQgKiAoY29uZmlnIGNoYW5nZSwgY29ubmVjdGlvbiBldmVudCkgb3Ige0BsaW5rIF9yZXN1bWVTU0hSZWNvbm5lY3RzfSBpc1xuXHQgKiBjYWxsZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvbm5lY3RTU0hFbnRyaWVzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b0Nvbm5lY3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCk7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29uZmlndXJlZEVudHJpZXM7XG5cdFx0Y29uc3Qgc3RpbGxDb25maWd1cmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoZW50cnkuY29ubmVjdGlvbi50eXBlICE9PSBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUuU1NIIHx8ICFlbnRyeS5jb25uZWN0aW9uLnNzaENvbmZpZ0hvc3QpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzc2hDb25maWdIb3N0ID0gZW50cnkuY29ubmVjdGlvbi5zc2hDb25maWdIb3N0O1xuXHRcdFx0c3RpbGxDb25maWd1cmVkLmFkZChzc2hDb25maWdIb3N0KTtcblx0XHRcdGNvbnN0IGFkZHJlc3MgPSBnZXRFbnRyeUFkZHJlc3MoZW50cnkpO1xuXHRcdFx0Ly8gU2tpcCBpZiBhbHJlYWR5IGNvbm5lY3RlZDogY2xlYXIgYW55IHJldHJ5IHN0YXRlLlxuXHRcdFx0Y29uc3QgaGFzQ29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShcblx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cylcblx0XHRcdCk7XG5cdFx0XHRpZiAoaGFzQ29ubmVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShzc2hDb25maWdIb3N0KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ1NTSFJlY29ubmVjdHMuaGFzKHNzaENvbmZpZ0hvc3QpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RdIFNTSCByZWNvbm5lY3QgZm9yICR7c3NoQ29uZmlnSG9zdH06IHJlY29ubmVjdCBhbHJlYWR5IGluIHByb2dyZXNzLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmdldChzc2hDb25maWdIb3N0KTtcblx0XHRcdGlmIChzdGF0ZT8uaGFzUGVuZGluZ1RpbWVyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RdIFNTSCByZWNvbm5lY3QgZm9yICR7c3NoQ29uZmlnSG9zdH06IHJldHJ5IHRpbWVyIGFscmVhZHkgc2NoZWR1bGVkLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZT8ucGF1c2VkKSB7XG5cdFx0XHRcdGNvbnN0IHBhdXNlZE1zID0gRGF0ZS5ub3coKSAtIHN0YXRlLnBhdXNlZEF0O1xuXHRcdFx0XHRpZiAocGF1c2VkTXMgPCBTU0hfUkVDT05ORUNUX1BBVVNFX0FVVE9fUkVTVU1FX01TKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1JlbW90ZUFnZW50SG9zdF0gU1NIIHJlY29ubmVjdCBmb3IgJHtzc2hDb25maWdIb3N0fTogcGF1c2VkICgke01hdGgucm91bmQocGF1c2VkTXMgLyAxMDAwKX1zIGFnbyksIHNraXBwaW5nYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gUGF1c2UgZHVyYXRpb24gZXhjZWVkZWQgXHUyMDE0IGdpdmUgaXQgYW5vdGhlciBjaGFuY2UgYXV0b21hdGljYWxseS5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBTU0ggcmVjb25uZWN0IGZvciAke3NzaENvbmZpZ0hvc3R9OiBhdXRvLXJlc3VtaW5nIGFmdGVyICR7TWF0aC5yb3VuZChwYXVzZWRNcyAvIDEwMDApfXMgcGF1c2VgKTtcblx0XHRcdFx0c3RhdGUucmVzZXRGb3JSZXN1bWUoKTtcblx0XHRcdH1cblx0XHRcdGlmICghYXV0b0Nvbm5lY3QpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1JlbW90ZUFnZW50SG9zdF0gU1NIIHJlY29ubmVjdCBmb3IgJHtzc2hDb25maWdIb3N0fTogYXV0by1jb25uZWN0IGRpc2FibGVkLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHZvaWQgdGhpcy5fYXR0ZW1wdFNTSFJlY29ubmVjdChzc2hDb25maWdIb3N0LCBlbnRyeS5uYW1lLCBhZGRyZXNzKTtcblx0XHR9XG5cblx0XHQvLyBEcm9wIHJldHJ5IHN0YXRlIGZvciBob3N0cyB0aGF0IGFyZSBubyBsb25nZXIgY29uZmlndXJlZC5cblx0XHRmb3IgKGNvbnN0IGhvc3Qgb2YgWy4uLnRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIXN0aWxsQ29uZmlndXJlZC5oYXMoaG9zdCkpIHtcblx0XHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2UoaG9zdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29ubmVjdFNTSE9uRGVtYW5kKGNvbm5lY3Rpb246IElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uLCBuYW1lOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNzaENvbmZpZ0hvc3QgPSBjb25uZWN0aW9uLnNzaENvbmZpZ0hvc3Q7XG5cdFx0aWYgKCFzc2hDb25maWdIb3N0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zc2hTZXJ2aWNlLmNvbm5lY3Qoe1xuXHRcdFx0XHRob3N0OiBjb25uZWN0aW9uLmhvc3ROYW1lLFxuXHRcdFx0XHRwb3J0OiBjb25uZWN0aW9uLnBvcnQsXG5cdFx0XHRcdHVzZXJuYW1lOiBjb25uZWN0aW9uLnVzZXIgPz8gY29ubmVjdGlvbi5ob3N0TmFtZSxcblx0XHRcdFx0YXV0aE1ldGhvZDogU1NIQXV0aE1ldGhvZC5BZ2VudCxcblx0XHRcdFx0bmFtZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcGVuZGluZ1NTSFJlY29ubmVjdHMuaGFzKHNzaENvbmZpZ0hvc3QpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wZW5kaW5nU1NIUmVjb25uZWN0cy5nZXQoc3NoQ29uZmlnSG9zdCkhLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcy5nZXQoc3NoQ29uZmlnSG9zdCk/LnJlc2V0Rm9yUmVzdW1lKCk7XG5cdFx0YXdhaXQgdGhpcy5fYXR0ZW1wdFNTSFJlY29ubmVjdChzc2hDb25maWdIb3N0LCBuYW1lLCBhZGRyZXNzLCB7IHVzZXJJbml0aWF0ZWQ6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNjb25uZWN0U1NIT25EZW1hbmQoY29ubmVjdGlvbjogSVJlbW90ZUFnZW50SG9zdFNTSENvbm5lY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29ubmVjdGlvbi5zc2hDb25maWdIb3N0KSB7XG5cdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShjb25uZWN0aW9uLnNzaENvbmZpZ0hvc3QpO1xuXHRcdH1cblx0XHRhd2FpdCBkaXNjb25uZWN0U1NIRW50cnkoY29ubmVjdGlvbiwgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZSwgdGhpcy5fc3NoU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdHRlbXB0U1NIUmVjb25uZWN0KHNzaENvbmZpZ0hvc3Q6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcsIG9wdGlvbnM6IHsgdXNlckluaXRpYXRlZD86IGJvb2xlYW4gfSA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fYXR0ZW1wdE1hbmFnZWRSZWNvbm5lY3Qoe1xuXHRcdFx0a2luZDogJ1NTSCcsXG5cdFx0XHRrZXk6IHNzaENvbmZpZ0hvc3QsXG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0dXNlckluaXRpYXRlZDogISFvcHRpb25zLnVzZXJJbml0aWF0ZWQsXG5cdFx0XHRtYXhBdHRlbXB0czogU1NIX1JFQ09OTkVDVF9NQVhfQVRURU1QVFMsXG5cdFx0XHRzaG91bGRQYXVzZTogc2hvdWxkUGF1c2VTU0hSZWNvbm5lY3RBZnRlckZhaWx1cmUsXG5cdFx0XHRwZW5kaW5nOiB0aGlzLl9wZW5kaW5nU1NIUmVjb25uZWN0cyxcblx0XHRcdHN0YXRlczogdGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLFxuXHRcdFx0Z2V0T3JDcmVhdGVTdGF0ZToga2V5ID0+IHRoaXMuX2dldE9yQ3JlYXRlU1NIUmVjb25uZWN0U3RhdGUoa2V5KSxcblx0XHRcdGRvQ29ubmVjdDogKCkgPT4gdGhpcy5fc3NoU2VydmljZS5yZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdCwgbmFtZSkudGhlbigoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0c2NoZWR1bGU6IHN0YXRlID0+IHRoaXMuX3NjaGVkdWxlU1NIUmVjb25uZWN0KHNzaENvbmZpZ0hvc3QsIG5hbWUsIGFkZHJlc3MsIHN0YXRlIGFzIFNTSFJlY29ubmVjdFN0YXRlKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlU1NIUmVjb25uZWN0KHNzaENvbmZpZ0hvc3Q6IHN0cmluZywgbmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcsIHN0YXRlOiBTU0hSZWNvbm5lY3RTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGRlbGF5ID0gTWF0aC5taW4oU1NIX1JFQ09OTkVDVF9JTklUSUFMX0RFTEFZICogTWF0aC5wb3coMiwgc3RhdGUuYXR0ZW1wdHMgLSAxKSwgU1NIX1JFQ09OTkVDVF9NQVhfREVMQVkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gU2NoZWR1bGluZyBTU0ggcmVjb25uZWN0IGZvciAke3NzaENvbmZpZ0hvc3R9IGluICR7ZGVsYXl9bXMgKGF0dGVtcHQgJHtzdGF0ZS5hdHRlbXB0cyArIDF9LyR7U1NIX1JFQ09OTkVDVF9NQVhfQVRURU1QVFN9KWApO1xuXHRcdHN0YXRlLnNjaGVkdWxlUmV0cnkoZGVsYXksICgpID0+IHtcblx0XHRcdC8vIFJlLWNoZWNrIGVsaWdpYmlsaXR5IFx1MjAxNCBjb25maWcgbWlnaHQgaGF2ZSBjaGFuZ2VkLCBvciBhIG1hbnVhbFxuXHRcdFx0Ly8gY29ubmVjdCBtaWdodCBoYXZlIHN1Y2NlZWRlZCB3aGlsZSB3ZSB3ZXJlIHdhaXRpbmcuXG5cdFx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShzc2hDb25maWdIb3N0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXV0b0Nvbm5lY3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCk7XG5cdFx0XHRpZiAoIWF1dG9Db25uZWN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpdmUgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGxpdmUgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChsaXZlLnN0YXR1cykpIHtcblx0XHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2Uoc3NoQ29uZmlnSG9zdCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nU1NIUmVjb25uZWN0cy5oYXMoc3NoQ29uZmlnSG9zdCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9hdHRlbXB0U1NIUmVjb25uZWN0KHNzaENvbmZpZ0hvc3QsIG5hbWUsIGFkZHJlc3MpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVTU0hSZWNvbm5lY3RTdGF0ZShzc2hDb25maWdIb3N0OiBzdHJpbmcpOiBTU0hSZWNvbm5lY3RTdGF0ZSB7XG5cdFx0bGV0IHN0YXRlID0gdGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmdldChzc2hDb25maWdIb3N0KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRzdGF0ZSA9IG5ldyBTU0hSZWNvbm5lY3RTdGF0ZSgpO1xuXHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLnNldChzc2hDb25maWdIb3N0LCBzdGF0ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN1bWUgU1NIIGF1dG8tcmVjb25uZWN0IGZvciBhbnkgcGF1c2VkIGhvc3RzLiBDYWxsZWQgYnkgdGhlIHJlY29uY2lsZVxuXHQgKiBwYXRoIHNvIHRoYXQgYSBmcmVzaCB0cmlnZ2VyIChjb25maWcgY2hhbmdlLCBuZXcgY29ubmVjdGlvbiBldmVudCkgZ2l2ZXNcblx0ICogcGF1c2VkIGhvc3RzIGFub3RoZXIgY2hhbmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdW1lU1NIUmVjb25uZWN0cygpOiB2b2lkIHtcblx0XHRsZXQgcmVzdW1lZCA9IDA7XG5cdFx0Zm9yIChjb25zdCBbLCBzdGF0ZV0gb2YgdGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzKSB7XG5cdFx0XHRpZiAoc3RhdGUucGF1c2VkKSB7XG5cdFx0XHRcdHN0YXRlLnJlc2V0Rm9yUmVzdW1lKCk7XG5cdFx0XHRcdHJlc3VtZWQrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc3VtZWQgPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlc3VtaW5nIFNTSCBhdXRvLXJlY29ubmVjdCBmb3IgJHtyZXN1bWVkfSBwYXVzZWQgaG9zdChzKWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTaGFyZWQgcmV0cnktbG9vcCBib2R5IGZvciBTU0ggbWFuYWdlZC1yZWNvbm5lY3QgZW50cmllcy5cblx0ICpcblx0ICogSGFuZGxlcyBgY29ubmVjdGluZ2AvYGRpc2Nvbm5lY3RlZGAvYGluY29tcGF0aWJsZWAgcHJvdmlkZXIgc3RhdHVzLFxuXHQgKiBjYWNoZWQtc2Vzc2lvbiB1bnB1Ymxpc2hpbmcgb24gZmFpbHVyZSwgcGF1c2Utb24tY2FuY2VsLCBhbmRcblx0ICogcGF1c2UtYWZ0ZXItbWF4LWF0dGVtcHRzLiBBbiBvcHRpb25hbCBwcmUtY2hlY2sgY2FuIGJhaWwgb3V0IHdpdGhvdXRcblx0ICogaW5jcmVtZW50aW5nIHRoZSBhdHRlbXB0IGNvdW50ZXIgKHJldHVybnMgYHsgc2tpcDogdHJ1ZSB9YCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hdHRlbXB0TWFuYWdlZFJlY29ubmVjdChvcHRzOiB7XG5cdFx0cmVhZG9ubHkga2luZDogJ1NTSCc7XG5cdFx0cmVhZG9ubHkga2V5OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgYWRkcmVzczogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgbWF4QXR0ZW1wdHM6IG51bWJlcjtcblx0XHRyZWFkb25seSBzaG91bGRQYXVzZTogKGVycjogdW5rbm93bikgPT4gYm9vbGVhbjtcblx0XHRyZWFkb25seSBwZW5kaW5nOiBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+Pjtcblx0XHRyZWFkb25seSBzdGF0ZXM6IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBTU0hSZWNvbm5lY3RTdGF0ZT47XG5cdFx0cmVhZG9ubHkgZ2V0T3JDcmVhdGVTdGF0ZTogKGtleTogc3RyaW5nKSA9PiBTU0hSZWNvbm5lY3RTdGF0ZTtcblx0XHRyZWFkb25seSBwcmVDaGVjaz86ICh1c2VySW5pdGlhdGVkOiBib29sZWFuKSA9PiBQcm9taXNlPHsgcmVhZG9ubHkgc2tpcDogYm9vbGVhbjsgcmVhZG9ubHkgcmVhc29uPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXHRcdHJlYWRvbmx5IGRvQ29ubmVjdDogKCkgPT4gUHJvbWlzZTx2b2lkPjtcblx0XHRyZWFkb25seSBzY2hlZHVsZTogKHN0YXRlOiBTU0hSZWNvbm5lY3RTdGF0ZSkgPT4gdm9pZDtcblx0fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFdyYXAgdGhlIGJvZHkgc28gd2UgY2FuIHN0b3JlIG91ciBvd24gcHJvbWlzZSBpbiBgb3B0cy5wZW5kaW5nYCBmb3Jcblx0XHQvLyBjb25jdXJyZW50IG9uLWRlbWFuZCBjYWxsZXJzIHRvIGpvaW4uIFRoZSBpbm5lciBJSUZFIGtlZXBzIHRoZVxuXHRcdC8vIGV4aXN0aW5nIGNvbnRyb2wgZmxvdyBpbnRhY3Q7IG9ubHkgdGhlIGJvb2trZWVwaW5nIG1vdmVzIG91dC5cblx0XHRjb25zdCBydW5Qcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gb3B0cy5nZXRPckNyZWF0ZVN0YXRlKG9wdHMua2V5KTtcblx0XHRcdGNvbnN0IGF0dGVtcHQgPSBzdGF0ZS5hdHRlbXB0cztcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KG9wdHMuYWRkcmVzcyk7XG5cdFx0XHRpZiAob3B0cy51c2VySW5pdGlhdGVkKSB7XG5cdFx0XHRcdHByb3ZpZGVyPy5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlLWVzdGFibGlzaGluZyAke29wdHMua2luZH0gY29ubmVjdGlvbiBmb3IgJHtvcHRzLmtleX0gKGF0dGVtcHQgJHthdHRlbXB0ICsgMX0pYCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAob3B0cy5wcmVDaGVjaykge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHMucHJlQ2hlY2sob3B0cy51c2VySW5pdGlhdGVkKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0Py5za2lwKSB7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0LnJlYXNvbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdICR7b3B0cy5raW5kfSByZWNvbm5lY3QgZm9yICR7b3B0cy5rZXl9OiAke3Jlc3VsdC5yZWFzb259OyBza2lwcGluZ2ApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCBvcHRzLmRvQ29ubmVjdCgpO1xuXHRcdFx0XHRvcHRzLnN0YXRlcy5kZWxldGVBbmREaXNwb3NlKG9wdHMua2V5KTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSAke29wdHMua2luZH0gY29ubmVjdGlvbiByZS1lc3RhYmxpc2hlZCBmb3IgJHtvcHRzLmtleX1gKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRcdG9wdHMuc3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2Uob3B0cy5rZXkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0cy51c2VySW5pdGlhdGVkKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXI/LnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcHRzLnNob3VsZFBhdXNlKGVycikpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFBhdXNpbmcgJHtvcHRzLmtpbmR9IGF1dG8tcmVjb25uZWN0IGZvciAke29wdHMua2V5fSBhZnRlciB1c2VyIGNhbmNlbGxhdGlvbmApO1xuXHRcdFx0XHRcdHByb3ZpZGVyPy51bnB1Ymxpc2hDYWNoZWRTZXNzaW9ucygpO1xuXHRcdFx0XHRcdGNvbnN0IGxpdmVTdGF0ZSA9IG9wdHMuZ2V0T3JDcmVhdGVTdGF0ZShvcHRzLmtleSk7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1JlbW90ZUFnZW50SG9zdF0gJHtvcHRzLmtpbmR9IHJlY29ubmVjdCBmYWlsZWQgZm9yICR7b3B0cy5rZXl9YCwgZXJyKTtcblx0XHRcdFx0Ly8gU3VyZmFjZSBwcm90b2NvbC12ZXJzaW9uIG1pc21hdGNoZXMgb24gdGhlIHByb3ZpZGVyIHNvIHRoZVxuXHRcdFx0XHQvLyB3b3Jrc3BhY2UgcGlja2VyIGNhbiBzaG93IHRoZSBob3N0J3MgbWVzc2FnZSBhbmQgdGhlIHVzZXJcblx0XHRcdFx0Ly8gY2FuIHJlYWQgaXQuIE90aGVyIGVycm9ycyBzdGF5IGFzIHRoZSBleGlzdGluZyBkaXNjb25uZWN0ZWRcblx0XHRcdFx0Ly8gc3RhdGUuXG5cdFx0XHRcdGNvbnN0IGluY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZnJvbUNvbm5lY3RFcnJvcihlcnIsIFtQUk9UT0NPTF9WRVJTSU9OXSk7XG5cdFx0XHRcdGlmIChpbmNvbXBhdGlibGUpIHtcblx0XHRcdFx0XHRwcm92aWRlcj8uc2V0Q29ubmVjdGlvblN0YXR1cyhpbmNvbXBhdGlibGUpO1xuXHRcdFx0XHRcdC8vIERvbid0IGtlZXAgcmV0cnlpbmcgb24gaW5jb21wYXRpYmxlIFx1MjAxNCB1c2VyIG5lZWRzIHRvXG5cdFx0XHRcdFx0Ly8gdXBncmFkZS9kb3duZ3JhZGUuIERyb3AgcmV0cnkgc3RhdGUgaW5zdGVhZCBvZiBwYXVzaW5nLlxuXHRcdFx0XHRcdG9wdHMuc3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2Uob3B0cy5rZXkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBIb3N0IGlzIHVucmVhY2hhYmxlIFx1MjAxNCB1bnB1Ymxpc2ggYW55IGNhY2hlZCBzZXNzaW9ucyB3ZVxuXHRcdFx0XHQvLyB3ZXJlIHNob3dpbmcgc28gdGhlIFVJIGRvZXNuJ3QgbGlzdCBzdGFsZSBlbnRyaWVzIGZvciBhXG5cdFx0XHRcdC8vIGhvc3Qgd2UgY2Fubm90IGN1cnJlbnRseSByZWFjaC5cblx0XHRcdFx0cHJvdmlkZXI/LnVucHVibGlzaENhY2hlZFNlc3Npb25zKCk7XG5cdFx0XHRcdC8vIFN0YXRlIG1heSBoYXZlIGJlZW4gY2xlYXJlZCAoZS5nLiBob3N0IHJlbW92ZWQpIHdoaWxlIHRoZVxuXHRcdFx0XHQvLyByZWNvbm5lY3Qgd2FzIGluIGZsaWdodCBcdTIwMTQgcmUtcmVzb2x2ZSB0byBiZSBzYWZlLlxuXHRcdFx0XHRjb25zdCBsaXZlU3RhdGUgPSBvcHRzLmdldE9yQ3JlYXRlU3RhdGUob3B0cy5rZXkpO1xuXHRcdFx0XHRsaXZlU3RhdGUuYXR0ZW1wdHMgPSBhdHRlbXB0ICsgMTtcblx0XHRcdFx0aWYgKGxpdmVTdGF0ZS5hdHRlbXB0cyA+PSBvcHRzLm1heEF0dGVtcHRzKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBQYXVzaW5nICR7b3B0cy5raW5kfSBhdXRvLXJlY29ubmVjdCBmb3IgJHtvcHRzLmtleX0gYWZ0ZXIgJHtsaXZlU3RhdGUuYXR0ZW1wdHN9IGNvbnNlY3V0aXZlIGZhaWx1cmVzYCk7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdHMudXNlckluaXRpYXRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcHRzLnNjaGVkdWxlKGxpdmVTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0XHRvcHRzLnBlbmRpbmcuc2V0KG9wdHMua2V5LCBydW5Qcm9taXNlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcnVuUHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0b3B0cy5wZW5kaW5nLmRlbGV0ZShvcHRzLmtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlQ29ubmVjdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudENvbm5lY3Rpb25zID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucztcblx0XHRjb25zdCBjb25uZWN0ZWRBZGRyZXNzZXMgPSBuZXcgU2V0KFxuXHRcdFx0Y3VycmVudENvbm5lY3Rpb25zXG5cdFx0XHRcdC5maWx0ZXIoYyA9PiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKSlcblx0XHRcdFx0Lm1hcChjID0+IGMuYWRkcmVzcylcblx0XHQpO1xuXHRcdGNvbnN0IGFsbEFkZHJlc3NlcyA9IG5ldyBTZXQoY3VycmVudENvbm5lY3Rpb25zLm1hcChjID0+IGMuYWRkcmVzcykpO1xuXG5cdFx0Ly8gUmVtb3ZlIGNvbnRyaWJ1dGlvbiBzdGF0ZSBmb3IgY29ubmVjdGlvbnMgdGhhdCBhcmUgbm8gbG9uZ2VyIHByZXNlbnQgYXQgYWxsXG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzc10gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGlmICghYWxsQWRkcmVzc2VzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlbW92aW5nIGNvbnRyaWJ1dGlvbiBmb3IgJHthZGRyZXNzfWApO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk/LmNsZWFyQ29ubmVjdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGFkZHJlc3MpO1xuXHRcdFx0fSBlbHNlIGlmICghY29ubmVjdGVkQWRkcmVzc2VzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHQvLyBDb25uZWN0aW9uIGV4aXN0cyBidXQgaXMgbm90IGNvbm5lY3RlZCAocmVjb25uZWN0aW5nIG9yIGRpc2Nvbm5lY3RlZCkuXG5cdFx0XHRcdC8vIEtlZXAgdGhlIGNvbnRyaWJ1dGlvbiBzdGF0ZSBidXQgZG9uJ3QgY2xlYXIgdGhlIHByb3ZpZGVyIFx1MjAxNFxuXHRcdFx0XHQvLyB0aGUgc2Vzc2lvbiBjYWNoZSBpcyBwcmVzZXJ2ZWQgZHVyaW5nIHJlY29ubmVjdC5cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgb3IgdXBkYXRlIGNvbm5lY3Rpb25zXG5cdFx0Zm9yIChjb25zdCBjb25uZWN0aW9uSW5mbyBvZiBjdXJyZW50Q29ubmVjdGlvbnMpIHtcblx0XHRcdC8vIE9ubHkgc2V0IHVwIGNvbnRyaWJ1dGlvbiBzdGF0ZSBmb3IgY29ubmVjdGVkIGVudHJpZXNcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uSW5mby5zdGF0dXMpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbkluZm8uYWRkcmVzcyk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0Y29uc3QgbmFtZUNoYW5nZWQgPSBleGlzdGluZy5uYW1lICE9PSBjb25uZWN0aW9uSW5mby5uYW1lO1xuXHRcdFx0XHRjb25zdCBjbGllbnRJZENoYW5nZWQgPSBleGlzdGluZy5jb25uZWN0aW9uLmNsaWVudElkICE9PSBjb25uZWN0aW9uSW5mby5jbGllbnRJZDtcblxuXHRcdFx0XHQvLyBJZiB0aGUgbmFtZSBvciBjbGllbnRJZCBjaGFuZ2VkLCB0ZWFyIGRvd24gYW5kIHJlLXJlZ2lzdGVyXG5cdFx0XHRcdGlmIChuYW1lQ2hhbmdlZCB8fCBjbGllbnRJZENoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlY29ubmVjdGluZyBjb250cmlidXRpb24gZm9yICR7Y29ubmVjdGlvbkluZm8uYWRkcmVzc306IG9sZENsaWVudElkPSR7ZXhpc3RpbmcuY29ubmVjdGlvbi5jbGllbnRJZH0sIG5ld0NsaWVudElkPSR7Y29ubmVjdGlvbkluZm8uY2xpZW50SWR9LCBuYW1lQ2hhbmdlZD0ke25hbWVDaGFuZ2VkfWApO1xuXHRcdFx0XHRcdGNvbnN0IG9sZENsaWVudElkID0gZXhpc3RpbmcuY29ubmVjdGlvbi5jbGllbnRJZDtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbm5lY3Rpb25JbmZvLmFkZHJlc3MpO1xuXHRcdFx0XHRcdHRoaXMuX3NldHVwQ29ubmVjdGlvbihjb25uZWN0aW9uSW5mbyk7XG5cblx0XHRcdFx0XHQvLyBSZWNvbm5lY3QgYWN0aXZlIHRlcm1pbmFscyBvbmx5IHdoZW4gdGhlIGJhY2tpbmdcblx0XHRcdFx0XHQvLyBjbGllbnQgY2hhbmdlZC4gTmFtZS1vbmx5IHVwZGF0ZXMgZG9uJ3QgaW52YWxpZGF0ZVxuXHRcdFx0XHRcdC8vIHN1YnNjcmlwdGlvbnMgYW5kIHdvdWxkIGNhdXNlIHVubmVjZXNzYXJ5IGJ1ZmZlclxuXHRcdFx0XHRcdC8vIGNsZWFyL3JlcGxheSBmbGlja2VyLlxuXHRcdFx0XHRcdGlmIChjbGllbnRJZENoYW5nZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5ld0Nvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24oY29ubmVjdGlvbkluZm8uYWRkcmVzcyk7XG5cdFx0XHRcdFx0XHRpZiAobmV3Q29ubmVjdGlvbikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UucmVjb25uZWN0VGVybWluYWxzKG5ld0Nvbm5lY3Rpb24sIG9sZENsaWVudElkKS50aGVuKFxuXHRcdFx0XHRcdFx0XHRcdCh7IHJlY292ZXJlZCwgdG90YWwgfSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHRvdGFsID4gMCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFRlcm1pbmFsIHJlY29ubmVjdGlvbjogJHtyZWNvdmVyZWR9LyR7dG90YWx9IHJlY292ZXJlZGApO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRsb2dUZXJtaW5hbFJlY292ZXJ5KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHsgcmVjb3ZlcmVkQ291bnQ6IHJlY292ZXJlZCwgdG90YWxDb3VudDogdG90YWwgfSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbUmVtb3RlQWdlbnRIb3N0XSBUZXJtaW5hbCByZWNvbm5lY3Rpb24gZmFpbGVkJywgZXJyKVxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2V0dXBDb25uZWN0aW9uKGNvbm5lY3Rpb25JbmZvKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cENvbm5lY3Rpb24oY29ubmVjdGlvbkluZm86IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24oY29ubmVjdGlvbkluZm8uYWRkcmVzcyk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBhZGRyZXNzLCBuYW1lIH0gPSBjb25uZWN0aW9uSW5mbztcblx0XHRjb25zdCBjb25uU3RhdGUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25uZWN0aW9uU3RhdGUsIG5hbWUsIGNvbm5lY3Rpb24pO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLnNldChhZGRyZXNzLCBjb25uU3RhdGUpO1xuXHRcdGNvbnN0IHN0b3JlID0gY29ublN0YXRlLnN0b3JlO1xuXG5cdFx0Ly8gQnJpZGdlIHRoZSBob3N0J3MgT1RMUCBsb2dzIGNoYW5uZWwgaW50byBhIGRlZGljYXRlZCB3b3JrYmVuY2hcblx0XHQvLyBPdXRwdXQgY2hhbm5lbCAoYEFnZW50IEhvc3QgKCR7bmFtZX0pYCkuIENvbmNyZXRlIGNsaWVudHNcblx0XHQvLyByZXR1cm5lZCBieSBgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbmAgYXJlIGFsd2F5c1xuXHRcdC8vIGBSZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudGAgaW5zdGFuY2VzIFx1MjAxNCBgSUFnZW50Q29ubmVjdGlvbmBcblx0XHQvLyBlcmFzZXMgdGhlIGNvbmNyZXRlIHR5cGUsIHNvIGNhc3QgaGVyZSBhdCB0aGUgaW50ZWdyYXRpb25cblx0XHQvLyBwb2ludCByYXRoZXIgdGhhbiBwb2xsdXRpbmcgdGhhdCBpbnRlcmZhY2Ugd2l0aCBPVExQLXNwZWNpZmljXG5cdFx0Ly8gc3VyZmFjZS5cblx0XHRzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRSZW1vdGVBZ2VudEhvc3RMb2dGb3J3YXJkZXIsXG5cdFx0XHRjb25uZWN0aW9uIGFzIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LFxuXHRcdFx0YWRkcmVzcyxcblx0XHRcdG5hbWUgfHwgYWRkcmVzcyxcblx0XHQpKTtcblxuXHRcdC8vIFRyYWNrIGF1dGhvcml0eSAtPiBjb25uZWN0aW9uIG1hcHBpbmcgZm9yIEZTIHByb3ZpZGVyIHJvdXRpbmdcblx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLnJlZ2lzdGVyQXV0aG9yaXR5KGF1dGhvcml0eSwgY29ubmVjdGlvbikpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gcm9vdCBzdGF0ZSBjaGFuZ2VzIChhZ2VudCBkaXNjb3ZlcnkpXG5cdFx0c3RvcmUuYWRkKGNvbm5lY3Rpb24ucm9vdFN0YXRlLm9uRGlkQ2hhbmdlKHJvb3RTdGF0ZSA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVSb290U3RhdGVDaGFuZ2UoYWRkcmVzcywgY29ubmVjdGlvbiwgcm9vdFN0YXRlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBJZiByb290IHN0YXRlIGlzIGFscmVhZHkgYXZhaWxhYmxlLCBwcm9jZXNzIGl0IGltbWVkaWF0ZWx5XG5cdFx0Y29uc3QgaW5pdGlhbFJvb3RTdGF0ZSA9IGNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGlmIChpbml0aWFsUm9vdFN0YXRlICYmICEoaW5pdGlhbFJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5faGFuZGxlUm9vdFN0YXRlQ2hhbmdlKGFkZHJlc3MsIGNvbm5lY3Rpb24sIGluaXRpYWxSb290U3RhdGUpO1xuXHRcdH1cblxuXHRcdC8vIFdpcmUgY29ubmVjdGlvbiB0byBleGlzdGluZyBzZXNzaW9ucyBwcm92aWRlclxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvbihjb25uZWN0aW9uLCBjb25uZWN0aW9uSW5mby5kZWZhdWx0RGlyZWN0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSb290U3RhdGVDaGFuZ2UoYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCByb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5TdGF0ZSA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChhZGRyZXNzKTtcblx0XHRpZiAoIWNvbm5TdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluY29taW5nID0gbmV3IFNldChyb290U3RhdGUuYWdlbnRzLm1hcChhID0+IGEucHJvdmlkZXIpKTtcblxuXHRcdC8vIFJlbW92ZSBhZ2VudHMgbm8gbG9uZ2VyIHByZXNlbnRcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlcl0gb2YgY29ublN0YXRlLmFnZW50cykge1xuXHRcdFx0aWYgKCFpbmNvbWluZy5oYXMocHJvdmlkZXIpKSB7XG5cdFx0XHRcdGNvbm5TdGF0ZS5hZ2VudHMuZGVsZXRlQW5kRGlzcG9zZShwcm92aWRlcik7XG5cdFx0XHRcdGNvbm5TdGF0ZS5tb2RlbFByb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEF1dGhlbnRpY2F0ZSB1c2luZyBwcm90ZWN0ZWRSZXNvdXJjZXMgZnJvbSBhZ2VudCBpbmZvXG5cdFx0dGhpcy5fYXV0aGVudGljYXRlV2l0aENvbm5lY3Rpb24oYWRkcmVzcywgY29ubmVjdGlvbiwgcm9vdFN0YXRlLmFnZW50cylcblx0XHRcdC5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbmV3IGFnZW50cywgcHVzaCBtb2RlbCB1cGRhdGVzIHRvIGV4aXN0aW5nIG9uZXNcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIHJvb3RTdGF0ZS5hZ2VudHMpIHtcblx0XHRcdGlmICghY29ublN0YXRlLmFnZW50cy5oYXMoYWdlbnQucHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQWdlbnQoYWRkcmVzcywgY29ubmVjdGlvbiwgYWdlbnQsIGNvbm5TdGF0ZS5uYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsUHJvdmlkZXIgPSBjb25uU3RhdGUubW9kZWxQcm92aWRlcnMuZ2V0KGFnZW50LnByb3ZpZGVyKTtcblx0XHRcdFx0bW9kZWxQcm92aWRlcj8udXBkYXRlTW9kZWxzKGFnZW50Lm1vZGVscyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZ2VudChhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGFnZW50OiBBZ2VudEluZm8sIGNvbmZpZ3VyZWROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb25uU3RhdGUgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKCFjb25uU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbm5TdGF0ZS5hZ2VudHMuc2V0KGFnZW50LnByb3ZpZGVyLCBhZ2VudFN0b3JlKTtcblx0XHRjb25uU3RhdGUuc3RvcmUuYWRkKGFnZW50U3RvcmUpO1xuXG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpO1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBgYWdlbnRob3N0LSR7c2FuaXRpemVkfWA7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKHNhbml0aXplZCwgYWdlbnQucHJvdmlkZXIpO1xuXHRcdGNvbnN0IGFnZW50SWQgPSBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCB2ZW5kb3IgPSBzZXNzaW9uVHlwZTtcblxuXHRcdC8vIFVzZXItZmFjaW5nIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyBhZ2VudC4gV2UgYWx3YXlzIGluY2x1ZGUgdGhlXG5cdFx0Ly8gYWdlbnQncyBvd24gbmFtZSBzbyB0aGF0IGEgaG9zdCBleHBvc2luZyBtdWx0aXBsZSBhZ2VudHMgKGUuZy5cblx0XHQvLyBgY29waWxvdGAgKyBgb3BlbmFpYCBmcm9tIHRoZSBzYW1lIG1hY2hpbmUpIHByb2R1Y2VzIGRpc3RpbmN0XG5cdFx0Ly8gbGFiZWxzIGluc3RlYWQgb2YgY29sbGFwc2luZyB0byBhIHNpbmdsZSBgY29uZmlndXJlZE5hbWVgLlxuXHRcdGNvbnN0IGhvc3RMYWJlbCA9IGNvbmZpZ3VyZWROYW1lIHx8IGFkZHJlc3M7XG5cdFx0Y29uc3QgYWdlbnRMYWJlbCA9IGFnZW50LmRpc3BsYXlOYW1lPy50cmltKCkgfHwgYWdlbnQucHJvdmlkZXI7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBgJHthZ2VudExhYmVsfSBbJHtob3N0TGFiZWx9XWA7XG5cblx0XHQvLyBQZXItYWdlbnQgd29ya2luZyBkaXJlY3RvcnkgY2FjaGUsIHNjb3BlZCB0byB0aGUgYWdlbnQgc3RvcmUgbGlmZXRpbWVcblx0XHRjb25zdCBzZXNzaW9uV29ya2luZ0RpcnMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXNzaW9uV29ya2luZ0RpcnMuY2xlYXIoKSkpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgZnJvbSB0aGUgc2Vzc2lvbiB0aGF0IGlzIGJlaW5nIGNyZWF0ZWQuXG5cdFx0Y29uc3QgcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgPSAoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IHNlc3Npb25Xb3JraW5nRGlycy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXI/LmdldFNlc3Npb25CeVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0c2Vzc2lvbldvcmtpbmdEaXJzLnNldChyZXNvdXJjZUtleSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGlzTmV3U2Vzc2lvbiA9IChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZCk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXI/LmdldFNlc3Npb25CeVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk/LnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZDtcblx0XHR9O1xuXG5cdFx0Ly8gQ2hhdCBzZXNzaW9uIGNvbnRyaWJ1dGlvblxuXHRcdGFnZW50U3RvcmUuYWRkKHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7XG5cdFx0XHR0eXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdG5hbWU6IGFnZW50SWQsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGNhbkRlbGVnYXRlOiB0cnVlLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0c0F1dG9Nb2RlbDogYWdlbnRIb3N0UHJvdmlkZXJTdXBwb3J0c0F1dG9Nb2RlbChhZ2VudC5wcm92aWRlciksXG5cdFx0XHRhZ2VudEhvc3RQcm92aWRlcklkOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdHN1cHBvcnRzRGVsZWdhdGlvbjogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRzdXBwb3J0c0NoZWNrcG9pbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0ltYWdlQXR0YWNobWVudHM6IHRydWUsXG5cdFx0XHRcdGdldCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24uaW5pdGlhbGl6ZVJlc3VsdC5nZXQoKT8udGVybWluYWxDb21tYW5kUHJlZml4O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIEN1c3RvbWl6YXRpb24gaGFybmVzcyBmb3IgdGhpcyByZW1vdGUgYWdlbnRcblx0XHRjb25zdCBwbHVnaW5Db250cm9sbGVyID0gYWdlbnRTdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlQWdlbnRQbHVnaW5Db250cm9sbGVyLFxuXHRcdFx0aG9zdExhYmVsLFxuXHRcdFx0c2FuaXRpemVkLFxuXHRcdFx0Y29ubmVjdGlvbixcblx0XHQpKTtcblxuXHRcdGNvbnN0IGFnZW50UmVnaXN0cmF0aW9uID0gYWdlbnRTdG9yZS5hZGQodGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5yZWdpc3RlckZvckFnZW50KHNlc3Npb25UeXBlLCB7IGluY2x1ZGVVc2VyU3RvcmFnZTogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gYWdlbnRSZWdpc3RyYXRpb24uc3luY1Byb3ZpZGVyO1xuXG5cdFx0Y29uc3QgaXRlbVByb3ZpZGVyID0gYWdlbnRTdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLFxuXHRcdFx0c2FuaXRpemVkLFxuXHRcdFx0KGN1c3RvbWl6YXRpb24sIGNsaWVudElkKSA9PiB7XG5cdFx0XHRcdGlmIChjbGllbnRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gQ3VzdG9taXphdGlvbiBjYW1lIGZyb20gdGhlIGNsaWVudDsgd2UgZG9uJ3QgYWxsb3cgYWN0aW9ucyBvbiB0aGVzZSBzaW5jZSB0aGV5J3JlIHJlYWQtb25seSByZWZsZWN0aW9ucyBvZiBjbGllbnQgc3RhdGUuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRpZDogJ3JlbW90ZUFnZW50SG9zdC5yZW1vdmVDb25maWd1cmVkUGx1Z2luJyxcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGVBZ2VudEhvc3QucmVtb3ZlQ29uZmlndXJlZFBsdWdpbicsIFwiUmVtb3ZlIGZyb20gUmVtb3RlIEhvc3RcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50cmFzaCxcblx0XHRcdFx0XHRydW46ICgpID0+IHBsdWdpbkNvbnRyb2xsZXIucmVtb3ZlQ29uZmlndXJlZFBsdWdpbihjdXN0b21pemF0aW9uKSxcblx0XHRcdFx0fV07XG5cdFx0XHR9LFxuXHRcdFx0c3luY2VkVXJpID0+IGFnZW50UmVnaXN0cmF0aW9uLmJ1bmRsZXIuZ2V0T3JpZ2luKHN5bmNlZFVyaSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IGhhcm5lc3NEZXNjcmlwdG9yID0gY3JlYXRlUmVtb3RlQWdlbnRIYXJuZXNzRGVzY3JpcHRvcihzZXNzaW9uVHlwZSwgZGlzcGxheU5hbWUsIHBsdWdpbkNvbnRyb2xsZXIsIGl0ZW1Qcm92aWRlciwgc3luY1Byb3ZpZGVyKTtcblx0XHRhZ2VudFN0b3JlLmFkZCh0aGlzLl9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoaGFybmVzc0Rlc2NyaXB0b3IpKTtcblxuXHRcdC8vIFNlc3Npb24gaGFuZGxlciAodW5pZmllZClcblx0XHRjb25zdCBzZXNzaW9uSGFuZGxlciA9IGFnZW50U3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIHtcblx0XHRcdHByb3ZpZGVyOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdGJhY2tlbmRTZXNzaW9uU2NoZW1lOiB0aGlzLl9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnMuZ2V0KGFkZHJlc3MpPy5iYWNrZW5kU2Vzc2lvblNjaGVtZT8uKGFnZW50LnByb3ZpZGVyKSxcblx0XHRcdGFnZW50SWQsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdGZ1bGxOYW1lOiBkaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGNvbm5lY3Rpb24sXG5cdFx0XHRjb25uZWN0aW9uQXV0aG9yaXR5OiBzYW5pdGl6ZWQsXG5cdFx0XHRleHRlbnNpb25JZDogJ3ZzY29kZS5yZW1vdGUtYWdlbnQtaG9zdCcsXG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJ1JlbW90ZSBBZ2VudCBIb3N0Jyxcblx0XHRcdHJlc29sdmVXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0aXNOZXdTZXNzaW9uLFxuXHRcdFx0cmVzb2x2ZUF1dGhlbnRpY2F0aW9uOiAocmVzb3VyY2VzKSA9PiB0aGlzLl9yZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5KGFkZHJlc3MsIGNvbm5lY3Rpb24sIHJlc291cmNlcyksXG5cdFx0fSkpO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZSwgc2Vzc2lvbkhhbmRsZXIpKTtcblxuXHRcdC8vIExhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLlxuXHRcdC8vIE9yZGVyIG1hdHRlcnM6IGB1cGRhdGVNb2RlbHNgIG11c3QgYmUgY2FsbGVkIGFmdGVyXG5cdFx0Ly8gYHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyYCBzbyB0aGUgaW5pdGlhbCBgb25EaWRDaGFuZ2VgIGlzIG9ic2VydmVkLlxuXHRcdGNvbnN0IHZlbmRvckRlc2NyaXB0b3IgPSB7IHZlbmRvciwgZGlzcGxheU5hbWUsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH07XG5cdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFt2ZW5kb3JEZXNjcmlwdG9yXSwgW10pO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW10sIFt2ZW5kb3JEZXNjcmlwdG9yXSkpKTtcblx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gYWdlbnRTdG9yZS5hZGQobmV3IEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlcihzZXNzaW9uVHlwZSwgdmVuZG9yKSk7XG5cdFx0Y29ublN0YXRlLm1vZGVsUHJvdmlkZXJzLnNldChhZ2VudC5wcm92aWRlciwgbW9kZWxQcm92aWRlcik7XG5cdFx0YWdlbnRTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbm5TdGF0ZS5tb2RlbFByb3ZpZGVycy5kZWxldGUoYWdlbnQucHJvdmlkZXIpKSk7XG5cdFx0YWdlbnRTdG9yZS5hZGQodGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHZlbmRvciwgbW9kZWxQcm92aWRlcikpO1xuXHRcdG1vZGVsUHJvdmlkZXIudXBkYXRlTW9kZWxzKGFnZW50Lm1vZGVscyk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlZ2lzdGVyZWQgYWdlbnQgJHthZ2VudC5wcm92aWRlcn0gZnJvbSAke2FkZHJlc3N9IGFzICR7c2Vzc2lvblR5cGV9YCk7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRoZW50aWNhdGVBbGxDb25uZWN0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBjb25uU3RhdGVdIG9mIHRoaXMuX2Nvbm5lY3Rpb25zKSB7XG5cdFx0XHRjb25zdCByb290U3RhdGUgPSBjb25uU3RhdGUuY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAocm9vdFN0YXRlICYmICEocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0ZVdpdGhDb25uZWN0aW9uKGFkZHJlc3MsIGNvbm5TdGF0ZS5jb25uZWN0aW9uLCByb290U3RhdGUuYWdlbnRzKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBdXRoZW50aWNhdGUgdXNpbmcgcHJvdGVjdGVkUmVzb3VyY2VzIGZyb20gYWdlbnQgaW5mbyBpbiByb290IHN0YXRlLlxuXHQgKiBSZXNvbHZlcyB0b2tlbnMgdmlhIHRoZSBzdGFuZGFyZCBWUyBDb2RlIGF1dGhlbnRpY2F0aW9uIHNlcnZpY2UuXG5cdCAqXG5cdCAqIE1hcmtzIHRoZSBtYXRjaGluZyBwcm92aWRlcidzIGBhdXRoZW50aWNhdGlvblBlbmRpbmdgIG9ic2VydmFibGUgd2hpbGVcblx0ICogdGhlIGF1dGggcGFzcyBpcyBpbiBmbGlnaHQgc28gdGhhdCBzZXNzaW9ucyBzdXJmYWNlIGFzIHN0aWxsIGxvYWRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hdXRoZW50aWNhdGVXaXRoQ29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGFnZW50czogcmVhZG9ubHkgQWdlbnRJbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gYGFnZW50aG9zdC0ke2FnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKX1gO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyPFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IGF1dGhUb2tlbkNhY2hlID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGFkZHJlc3MpPy5hdXRoVG9rZW5DYWNoZTtcblx0XHRwcm92aWRlcj8uc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIGFnZW50cywge1xuXHRcdFx0XHRhdXRoVG9rZW5DYWNoZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW1JlbW90ZUFnZW50SG9zdF0nLFxuXHRcdFx0XHRhdXRoZW50aWNhdGU6IHRoaXMuX2F1dGhlbnRpY2F0ZUNhbGxiYWNrKGFkZHJlc3MsIGNvbm5lY3Rpb24pLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgdG8gYXV0aGVudGljYXRlIHdpdGggY29ubmVjdGlvbicsIGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb3ZpZGVyPy5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgYGF1dGhlbnRpY2F0ZWAgY2FsbGJhY2sgZm9yIGEgY29ubmVjdGlvbi4gSG9zdC1hZ25vc3RpYyBieSBkZWZhdWx0IChmb3J3YXJkcyB0aGVcblx0ICogcmVxdWVzdCB1bmNoYW5nZWQpOyBhIGNvbm5lY3Rpb24ga2luZCBtYXkgaW5qZWN0IGEgdG9rZW4gdHJhbnNmb3JtIHZpYVxuXHQgKiB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uU2VydmljZX0gXHUyMDE0IGUuZy4gY2xvdWQgc2FuZGJveCBjb25uZWN0aW9ucywgd2hvc2Vcblx0ICogaG9zdCByZWplY3RzIHBsYWludGV4dCBiZWFyZXJzIG92ZXIgdGhlIHJlbGF5IChgLTMyNjAyYCkgYW5kIHJlcXVpcmVzIGEgTWlzc2lvbi1Db250cm9sLXNlYWxlZFxuXHQgKiBlbnZlbG9wZS4gVGhlIHRyYW5zZm9ybSBvd25zIGZhaWwtY2xvc2VkIHZhbGlkYXRpb24sIHNvIGEgcmF3IHRva2VuIGNhbiBuZXZlciByZWFjaCB0aGUgaG9zdC5cblx0ICovXG5cdHByaXZhdGUgX2F1dGhlbnRpY2F0ZUNhbGxiYWNrKGFkZHJlc3M6IHN0cmluZywgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbik6IChyZXF1ZXN0OiBBdXRoZW50aWNhdGVQYXJhbXMpID0+IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgdHJhbnNmb3JtID0gdGhpcy5fY29ubmVjdGlvbkN1c3RvbWl6YXRpb25zLmdldChhZGRyZXNzKT8uYXV0aGVudGljYXRlO1xuXHRcdGlmICghdHJhbnNmb3JtKSB7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdCA9PiBjb25uZWN0aW9uLmF1dGhlbnRpY2F0ZShyZXF1ZXN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzeW5jIHJlcXVlc3QgPT4gY29ubmVjdGlvbi5hdXRoZW50aWNhdGUoYXdhaXQgdHJhbnNmb3JtKHJlcXVlc3QpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnRlcmFjdGl2ZWx5IHByb21wdCB0aGUgdXNlciB0byBhdXRoZW50aWNhdGUgd2hlbiB0aGUgc2VydmVyIHJlcXVpcmVzIGl0LlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgYXV0aGVudGljYXRpb24gc3VjY2VlZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseShhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHByb3RlY3RlZFJlc291cmNlczogcmVhZG9ubHkgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYXV0aFRva2VuQ2FjaGUgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoYWRkcmVzcyk/LmF1dGhUb2tlbkNhY2hlO1xuXHRcdC8vIFdoZW4gdGhlIGNvbm5lY3Rpb24gdHJhbnNmb3JtcyB0aGUgb3V0Z29pbmcgdG9rZW4gKGUuZy4gc2VhbGluZyksIHRoZSByZXNvbHZlZCBwbGFpbnRleHRcblx0XHQvLyBpcyBub3QgdGhlIGlkZW50aXR5IHRoYXQgd2FzIGFjdHVhbGx5IHNlbnQsIGFuZCB0aGUgc2VhbGVkIGVudmVsb3BlIGhhcyBpdHMgb3duIGxpZmV0aW1lLlxuXHRcdC8vIEEgaG9zdC1yZXF1ZXN0ZWQgcmUtYXV0aCAodGhpcyBwYXRoKSBtdXN0IHRoZXJlZm9yZSBzZW5kIGEgZnJlc2ggdHJhbnNmb3JtZWQgdG9rZW4sIHNvIGRyb3Bcblx0XHQvLyB0aGUgcGxhaW50ZXh0LWtleWVkIGRlZHVwZSBmaXJzdCBcdTIwMTQgb3RoZXJ3aXNlIGFuIHVuY2hhbmdlZCBwbGFpbnRleHQgd291bGQgYmUgc3VwcHJlc3NlZCBhbmRcblx0XHQvLyB0aGUgaG9zdCB3b3VsZCBuZXZlciByZWNlaXZlIGEgZnJlc2ggZW52ZWxvcGUuXG5cdFx0aWYgKGF1dGhUb2tlbkNhY2hlICYmIHRoaXMuX2Nvbm5lY3Rpb25DdXN0b21pemF0aW9ucy5nZXQoYWRkcmVzcyk/LmF1dGhlbnRpY2F0ZSkge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGUuY2xlYXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHksIHByb3RlY3RlZFJlc291cmNlcywge1xuXHRcdFx0YXV0aFRva2VuQ2FjaGUsXG5cdFx0XHRsb2dQcmVmaXg6ICdbUmVtb3RlQWdlbnRIb3N0XScsXG5cdFx0XHRhdXRoZW50aWNhdGU6IHRoaXMuX2F1dGhlbnRpY2F0ZUNhbGxiYWNrKGFkZHJlc3MsIGNvbm5lY3Rpb24pLFxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihSZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24uSUQsIFJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuU2Vzc2lvbkV2ZW50c0ZpbGVBY3Rpb24pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5yZW1vdGVBZ2VudEhvc3RzLmVuYWJsZWQnLCBcIkVuYWJsZSBjb25uZWN0aW5nIHRvIHJlbW90ZSBhZ2VudCBob3N0cy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlbW90ZUFnZW50SG9zdHMuYXV0b0Nvbm5lY3QnLCBcIkF1dG9tYXRpY2FsbHkgY29ubmVjdCB0byBvbmxpbmUgZGV2IHR1bm5lbCBhbmQgU1NILWNvbmZpZ3VyZWQgcmVtb3RlIGFnZW50IGhvc3RzIG9uIHN0YXJ0dXAuIFdoZW4gZGlzYWJsZWQsIGNhY2hlZCBzZXNzaW9ucyBhcmUgc3RpbGwgc2hvd24gYnV0IGNvbm5lY3Rpb25zIGFyZSBlc3RhYmxpc2hlZCBvbmx5IG9uIGRlbWFuZC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHQvLyBPZmYgYnkgZGVmYXVsdDogc2FuZGJveCB0YXNrcyBjdXJyZW50bHkgY2FycnkgdGhlIGBjb3BpbG90LWRldmVsb3Blci1jbGlgIHNsdWcsIHdoaWNoIHRoZVxuXHRcdC8vIENvcGlsb3QgZXh0ZW5zaW9uJ3MgY2xvdWQgcHJvdmlkZXIgZG9lcyBub3QgbGlzdCwgc28gdGhlIHR3byBkbyBub3Qgb3ZlcmxhcC4gVGhhdCBzbHVnIGlzXG5cdFx0Ly8gZXhwZWN0ZWQgdG8gY2hhbmdlLCBhdCB3aGljaCBwb2ludCBib3RoIHByb3ZpZGVycyB3b3VsZCBsaXN0IHRoZSBzYW1lIHRhc2sgXHUyMDE0IHNlZVxuXHRcdC8vIGBDTE9VRF9TQU5EQk9YX0FHRU5UX1NMVUdgLlxuXHRcdFtDbG91ZFNhbmRib3hFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY2xvdWRTYW5kYm94LmVuYWJsZWQnLCBcIkVuYWJsZSBjb25uZWN0aW5nIHRvIENvcGlsb3QgY2xvdWQgc2FuZGJveCBzZXNzaW9ucyBvdmVyIGEgbGl2ZSBBZ2VudCBIb3N0IFByb3RvY29sIHJlbGF5LiBXaGVuIGVuYWJsZWQsIG9wZW5pbmcgYSBDb3BpbG90IENMSSBjbG91ZCBzZXNzaW9uIGNvbm5lY3RzIHRvIGl0cyBzYW5kYm94IGZvciBzbGFzaCBjb21tYW5kcyBhbmQgYSByZXNwb25zaXZlLCBzdGVlcmFibGUgZXhwZXJpZW5jZSBpbnN0ZWFkIG9mIG9ubHkgcG9sbGluZyBsb2dzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHQnY2hhdC5zc2hSZW1vdGVBZ2VudEhvc3RDb21tYW5kJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnNzaFJlbW90ZUFnZW50SG9zdENvbW1hbmQnLCBcIkZvciBkZXZlbG9wbWVudDogT3ZlcnJpZGUgdGhlIGNvbW1hbmQgdXNlZCB0byBzdGFydCB0aGUgcmVtb3RlIGFnZW50IGhvc3Qgb3ZlciBTU0guIFdoZW4gc2V0LCBza2lwcyBhdXRvbWF0aWMgQ0xJIGluc3RhbGxhdGlvbiBhbmQgcnVucyB0aGlzIGNvbW1hbmQgaW5zdGVhZC4gVGhlIGNvbW1hbmQgbXVzdCBwcmludCBhIFdlYlNvY2tldCBVUkwgbWF0Y2hpbmcgd3M6Ly8xMjcuMC4wLjE6UE9SVCAob3B0aW9uYWxseSB3aXRoID90a249VE9LRU4pIHRvIHN0ZG91dCBvciBzdGRlcnIuL1wiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHQnY2hhdC5hZ2VudEhvc3QuZm9yd2FyZFNTSEFnZW50Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuZm9yd2FyZFNTSEFnZW50JywgXCJXaGVuIGVuYWJsZWQsIGZvcndhcmRzIHRoZSBsb2NhbCBTU0ggYWdlbnQgdG8gdGhlIHJlbW90ZSBtYWNoaW5lIGR1cmluZyBTU0ggYWdlbnQgaG9zdCBjb25uZWN0aW9ucyB0byBob3N0cyB3aG9zZSBTU0ggY29uZmlnIGhhcyBgRm9yd2FyZEFnZW50IHllc2AuIE9ubHkgZW5hYmxlIHRoaXMgZm9yIHRydXN0ZWQgaG9zdHMuIFRoZSByZW1vdGUgYWdlbnQgaG9zdCBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciB0aGlzIHNldHRpbmcgdG8gdGFrZSBlZmZlY3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtSZW1vdGVBZ2VudEhvc3RzU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YWRkcmVzczogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5yZW1vdGVBZ2VudEhvc3RzLmFkZHJlc3MnLCBcIlRoZSBXZWJTb2NrZXQgYWRkcmVzcyBvZiB0aGUgcmVtb3RlIGFnZW50IGhvc3QgKGUuZy4gXFxcImxvY2FsaG9zdDozMDAwXFxcIikuXCIpIH0sXG5cdFx0XHRcdFx0bmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5yZW1vdGVBZ2VudEhvc3RzLm5hbWUnLCBcIkEgZGlzcGxheSBuYW1lIGZvciB0aGlzIHJlbW90ZSBhZ2VudCBob3N0LlwiKSB9LFxuXHRcdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5yZW1vdGVBZ2VudEhvc3RzLmNvbm5lY3Rpb25Ub2tlbicsIFwiQW4gb3B0aW9uYWwgY29ubmVjdGlvbiB0b2tlbiBmb3IgYXV0aGVudGljYXRpbmcgd2l0aCB0aGUgcmVtb3RlIGFnZW50IGhvc3QuXCIpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2FkZHJlc3MnLCAnbmFtZSddLFxuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRIb3N0cycsIFwiQSBsaXN0IG9mIFdlYlNvY2tldCByZW1vdGUgYWdlbnQgaG9zdCBhZGRyZXNzZXMgdG8gY29ubmVjdCB0byAoZS5nLiBcXFwibG9jYWxob3N0OjMwMDBcXFwiKS4gU1NIIHJlbW90ZSBhZ2VudCBob3N0IGRldGFpbHMgYXJlIG1hbmFnZWQgYnkgVlMgQ29kZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W1R1bm5lbEFnZW50SG9zdHNTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRUdW5uZWxzJywgXCJBZGRpdGlvbmFsIGRldiB0dW5uZWwgbmFtZXMgdG8gbG9vayBmb3Igd2hlbiBjb25uZWN0aW5nIHRvIHJlbW90ZSBhZ2VudCBob3N0cy4gVGhlc2UgYXJlIGxvb2tlZCB1cCBpbiBhZGRpdGlvbiB0byB0dW5uZWxzIGF1dG9tYXRpY2FsbHkgZW51bWVyYXRlZCBmcm9tIHlvdXIgYWNjb3VudC5cIiksXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdExvY2FsRmlsZVBlcm1pc3Npb25zU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5sb2NhbEZpbGVQZXJtaXNzaW9ucycsIFwiUGVyLWhvc3QgZmlsZXN5c3RlbSBncmFudHMgZm9yIHJlbW90ZSBhZ2VudCBob3N0cy4gTWFwcyBhIHJlbW90ZSBhZ2VudCBob3N0IGFkZHJlc3MgdG8gVVJJIHN0cmluZ3MgYW5kIHRoZSBhY2Nlc3MgbW9kZSB0aGUgaG9zdCBoYXMgYmVlbiBncmFudGVkIChgcmAgZm9yIHJlYWQsIGByd2AgZm9yIHJlYWQgYW5kIHdyaXRlKS4gSG9zdHMgY2Fubm90IHJlYWQgb3Igd3JpdGUgYW55IGZpbGVzIG91dHNpZGUgdGhlIGdyYW50ZWQgVVJJcyB3aXRob3V0IHByb21wdGluZzsgYSBVUkkgZ3JhbnQgY292ZXJzIGRlc2NlbmRhbnRzLiBUaGlzIHNldHRpbmcgaXMgbm9ybWFsbHkgbWFpbnRhaW5lZCBieSB0aGUgYWdlbnQtaG9zdCBwZXJtaXNzaW9uIHByb21wdHMgYW5kIHJhcmVseSBlZGl0ZWQgYnkgaGFuZC5cIiksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ3InLCAncncnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmxvY2FsRmlsZVBlcm1pc3Npb25zLnJlYWQnLCBcIlJlYWQtb25seSBhY2Nlc3MuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5sb2NhbEZpbGVQZXJtaXNzaW9ucy5yZWFkV3JpdGUnLCBcIlJlYWQgYW5kIHdyaXRlIGFjY2Vzcy5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdH0sXG59KTtcblxuLy8gU2lkZS1lZmZlY3QgcmVnaXN0cmF0aW9ucyBmb3IgdGhlIHJlbW90ZSBhZ2VudCBob3N0IGZlYXR1cmVcbmltcG9ydCAnLi9yZW1vdGVBZ2VudEhvc3RBY3Rpb25zLmpzJztcbmltcG9ydCAnLi9tYW5hZ2VSZW1vdGVBZ2VudEhvc3RzLmpzJztcbmltcG9ydCAnLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvYWdlbnRIb3N0QWdlbnRQaWNrZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDNUYsU0FBUyxtQkFBbUIscUJBQXFCO0FBQ2pELFNBQVMsMkJBQTJCO0FBRXBDLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUduQyxTQUFnRSx5QkFBNkQscUNBQXFDLGlDQUFpQywwQkFBMEIsa0NBQWtDLDJCQUEyQix1QkFBdUI7QUFDalQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4Q0FBOEM7QUFHdkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0IsY0FBYywrQkFBdUQ7QUFDbEcsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBaUMsZ0NBQWdDLHNC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
