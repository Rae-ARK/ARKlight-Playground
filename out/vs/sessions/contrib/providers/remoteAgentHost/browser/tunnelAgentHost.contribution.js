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
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import * as nls from "../../../../../nls.js";
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { logTunnelConnectAttempt, logTunnelConnectResolved, logTunnelDiscoveryResult } from "../../../../common/sessionsTelemetry.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
const STATUS_CHECK_INTERVAL = 5 * 60 * 1e3;
const RECONNECT_INITIAL_DELAY = 1e3;
const RECONNECT_MAX_DELAY = 3e4;
const RECONNECT_MAX_ATTEMPTS = 10;
const RESUME_RATE_LIMIT_MS = 1e4;
let TunnelAgentHostContribution = class extends Disposable {
  constructor(_tunnelService, _remoteAgentHostService, _sessionsProvidersService, _configurationService, _instantiationService, _notificationService, _logService, _authenticationService, _telemetryService, agentHostFilterService) {
    super();
    this._tunnelService = _tunnelService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._authenticationService = _authenticationService;
    this._telemetryService = _telemetryService;
    this._providerStores = this._register(new DisposableMap());
    this._providerInstances = /* @__PURE__ */ new Map();
    this._pendingConnects = /* @__PURE__ */ new Map();
    this._lastStatusCheck = 0;
    /**
     * `false` until the first {@link _silentStatusCheck} resolves. Until then
     * we keep newly-created providers in the `Connecting` state so the picker
     * doesn't briefly show every cached tunnel as "Offline" on startup.
     */
    this._initialStatusChecked = false;
    /** Previous connection status per address — used to detect Connected→Disconnected transitions. */
    this._previousStatuses = /* @__PURE__ */ new Map();
    /** Pending auto-reconnect timer per address. */
    this._reconnectTimeouts = /* @__PURE__ */ new Map();
    /** Consecutive failed auto-reconnect attempts per address. */
    this._reconnectAttempts = /* @__PURE__ */ new Map();
    /** Addresses whose auto-reconnect loop has paused after too many failures. */
    this._reconnectPaused = /* @__PURE__ */ new Set();
    /** Addresses paused specifically because the remote host is offline. */
    this._hostOfflinePaused = /* @__PURE__ */ new Set();
    /** Timestamp of the last wake-triggered resume, to rate-limit rapid tab toggles. */
    this._lastResumeAt = 0;
    /**
     * Per-address connect sessions for telemetry. A session starts at the
     * first attempt of a connect cycle (initial or reconnect) and ends on
     * terminal resolution (connected, host-offline, max-attempts).
     */
    this._connectSessions = /* @__PURE__ */ new Map();
    this._reconcileProviders();
    this._register(agentHostFilterService.registerDiscoveryHandler(() => this._silentStatusCheck()));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._handleConnectionChanges();
      this._updateConnectionStatuses();
      this._wireConnections();
    }));
    this._register(this._tunnelService.onDidChangeTunnels(() => {
      this._reconcileProviders();
      this._pruneReconnectState();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        this._reconcileProviders();
        this._pruneReconnectState();
      }
    }));
    this._register(this._authenticationService.onDidChangeSessions((e) => {
      if (e.providerId !== "github") {
        return;
      }
      this._handleSessionsChange(e);
    }));
    if (isWeb) {
      const onWake = () => this._resumeReconnects("wake");
      mainWindow.addEventListener("online", onWake);
      this._register(toDisposable(() => mainWindow.removeEventListener("online", onWake)));
      const onVisibilityChange = () => {
        if (mainWindow.document.visibilityState === "visible") {
          this._resumeReconnects("visible");
        }
      };
      mainWindow.document.addEventListener("visibilitychange", onVisibilityChange);
      this._register(toDisposable(() => mainWindow.document.removeEventListener("visibilitychange", onVisibilityChange)));
    }
    this._register(toDisposable(() => {
      for (const timer of this._reconnectTimeouts.values()) {
        clearTimeout(timer);
      }
      this._reconnectTimeouts.clear();
    }));
    agentHostFilterService.rediscover();
  }
  /**
   * Called by the workspace picker when it opens. Silently re-checks
   * tunnel statuses if more than 5 minutes have elapsed since the last check.
   */
  async checkTunnelStatuses() {
    if (Date.now() - this._lastStatusCheck < STATUS_CHECK_INTERVAL) {
      return;
    }
    await this._silentStatusCheck();
  }
  // -- Provider management --
  _reconcileProviders() {
    const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const cached = enabled ? this._getProviderTunnels() : [];
    const desiredAddresses = new Set(cached.map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    for (const [address] of this._providerStores) {
      if (!desiredAddresses.has(address)) {
        this._providerStores.deleteAndDispose(address);
        this._providerInstances.delete(address);
      }
    }
    for (const tunnel of cached) {
      const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
      if (!this._providerStores.has(address)) {
        this._createProvider(address, tunnel.name);
      }
    }
  }
  _getProviderTunnels() {
    return this._tunnelService.getCachedTunnels().filter((tunnel) => !this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId));
  }
  _createProvider(address, name) {
    const store = new DisposableStore();
    const provider = this._instantiateProvider(address, name);
    provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => this._providerInstances.delete(address)));
    this._providerStores.set(address, store);
  }
  _instantiateProvider(address, name) {
    return this._instantiationService.createInstance(
      RemoteAgentHostSessionsProvider,
      {
        address,
        name,
        connectOnDemand: () => this._connectTunnel(address, { userInitiated: true }),
        disconnectOnDemand: () => this._disconnectTunnel(address)
      }
    );
  }
  // -- Connection status --
  _updateConnectionStatuses() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
        continue;
      }
      if (RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        continue;
      }
      if (this._pendingConnects.has(address)) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      } else if (!this._initialStatusChecked) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      } else {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
  /**
   * Wire live connections to their providers so session operations work.
   */
  _wireConnections() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find(
        (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
      );
      if (connectionInfo) {
        const connection = this._remoteAgentHostService.getConnection(address);
        if (connection) {
          provider.setConnection(connection, connectionInfo.defaultDirectory);
        }
      }
    }
  }
  // -- On-demand connection --
  /**
   * Establish a relay connection to a cached tunnel. Called on demand
   * when the user invokes the browse action on an online-but-not-connected tunnel.
   */
  _connectTunnel(address, options) {
    const existing = this._pendingConnects.get(address);
    if (existing) {
      return existing;
    }
    const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
    const cached = this._tunnelService.getCachedTunnels().find((t) => t.tunnelId === tunnelId);
    if (!cached) {
      return Promise.resolve();
    }
    if (!options.userInitiated && this._tunnelService.isAutoConnectSuppressed(tunnelId)) {
      this._logService.info(`[TunnelAgentHost] Skipping background connect for user-disconnected tunnel ${address}`);
      return Promise.resolve();
    }
    if (options.userInitiated) {
      this._tunnelService.clearAutoConnectSuppression(tunnelId);
      const provider = this._providerInstances.get(address);
      if (provider && RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      }
    }
    this._cancelReconnect(address);
    const { attemptNumber, attemptStart, session, isReconnect } = this._beginConnectAttempt(address);
    const promise = (async () => {
      let handle;
      const timer = options.userInitiated ? setTimeout(() => {
        handle = this._notificationService.notify({
          severity: Severity.Info,
          message: nls.localize("tunnelConnecting", "Connecting to tunnel '{0}'...", cached.name),
          progress: { infinite: true }
        });
      }, 1e3) : void 0;
      this._updateConnectionStatuses();
      try {
        const tunnelInfo = {
          tunnelId: cached.tunnelId,
          clusterId: cached.clusterId,
          name: cached.name,
          tags: [],
          protocolVersion: 5,
          hostConnectionCount: 0
        };
        await this._tunnelService.connect(tunnelInfo, cached.authProvider);
        if (!options.userInitiated && this._tunnelService.isAutoConnectSuppressed(cached.tunnelId)) {
          this._logService.info(`[TunnelAgentHost] Disconnecting background connection for user-disconnected tunnel ${address}`);
          await this._tunnelService.disconnect(address);
          this._connectSessions.delete(address);
          return;
        }
        this._finishConnectAttempt(address, { success: true, attemptNumber, attemptStart, session, isReconnect });
      } catch (err) {
        this._logService.warn(`[TunnelAgentHost] Connect to ${cached.name} failed:`, err);
        const errorCategory = this._categorizeError(err);
        this._finishConnectAttempt(address, { success: false, attemptNumber, attemptStart, session, isReconnect, error: err });
        this._pendingConnects.delete(address);
        const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
        if (incompatible) {
          this._providerInstances.get(address)?.setConnectionStatus(incompatible);
          this._resetReconnectState(address);
          throw err;
        }
        if (errorCategory === "authExpired" || errorCategory === "auth") {
          this._pauseReconnect(address, errorCategory);
          throw err;
        }
        const hostOnline = await this._probeHostOnline(cached.tunnelId);
        if (hostOnline === false) {
          this._pauseReconnect(address, "hostOffline");
        } else {
          this._logService.info(`[TunnelAgentHost] Scheduling reconnect for ${address}`);
          this._scheduleReconnect(address);
        }
        throw err;
      } finally {
        if (timer !== void 0) {
          clearTimeout(timer);
        }
        handle?.close();
        this._pendingConnects.delete(address);
        this._updateConnectionStatuses();
      }
    })();
    promise.catch(() => {
    });
    this._pendingConnects.set(address, promise);
    return promise;
  }
  /**
   * Tear down the active tunnel relay for {@link address} and cancel any
   * pending auto-reconnect. The cached tunnel entry is kept so the user
   * can re-connect later; only the live WebSocket is closed.
   */
  async _disconnectTunnel(address) {
    this._cancelReconnect(address);
    this._resetReconnectState(address);
    this._tunnelService.suppressAutoConnect(address.slice(TUNNEL_ADDRESS_PREFIX.length));
    this._previousStatuses.delete(address);
    await this._tunnelService.disconnect(address);
  }
  /**
   * Detect tunnel connections that transitioned from Connected to
   * Disconnected and schedule an auto-reconnect.
   *
   * Important: we only trigger on a Connected → Disconnected transition
   * where the connection entry is still present. If the entry has been
   * removed from the service (e.g. the user clicked "Remove Remote"),
   * we do NOT schedule a reconnect — that would override their intent.
   */
  _handleConnectionChanges() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const cachedAddresses = new Set(this._getProviderTunnels().map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    const currentStatuses = /* @__PURE__ */ new Map();
    for (const conn of this._remoteAgentHostService.connections) {
      currentStatuses.set(conn.address, conn.status);
    }
    for (const address of cachedAddresses) {
      const previous = this._previousStatuses.get(address);
      const current = currentStatuses.get(address);
      const wasConnected = RemoteAgentHostConnectionStatus.isConnected(previous);
      const isExplicitlyDisconnected = RemoteAgentHostConnectionStatus.isDisconnected(current);
      if (wasConnected && isExplicitlyDisconnected && !this._pendingConnects.has(address)) {
        this._logService.info(`[TunnelAgentHost] Connection lost for ${address}, scheduling reconnect`);
        if (!this._connectSessions.has(address)) {
          this._connectSessions.set(address, { startedAt: Date.now(), attempts: 0, isReconnect: true });
        }
        this._scheduleReconnect(
          address,
          /*immediate*/
          true
        );
      }
      if (current !== void 0) {
        this._previousStatuses.set(address, current);
      } else {
        this._previousStatuses.delete(address);
        this._resetReconnectState(address);
      }
    }
    for (const address of [...this._previousStatuses.keys()]) {
      if (!cachedAddresses.has(address)) {
        this._previousStatuses.delete(address);
      }
    }
  }
  _scheduleReconnect(address, immediate = false) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
    const cached = this._tunnelService.getCachedTunnels().find((t) => t.tunnelId === tunnelId);
    if (!cached) {
      return;
    }
    if (this._pendingConnects.has(address)) {
      return;
    }
    const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
    if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
      this._clearReconnectBackoff(address);
      return;
    }
    this._cancelReconnect(address);
    const attempt = this._reconnectAttempts.get(address) ?? 0;
    if (attempt >= RECONNECT_MAX_ATTEMPTS) {
      this._pauseReconnect(address, "maxAttemptsReached");
      return;
    }
    const delay = immediate ? 0 : Math.min(RECONNECT_INITIAL_DELAY * Math.pow(2, attempt), RECONNECT_MAX_DELAY);
    this._logService.info(
      `[TunnelAgentHost] Scheduling reconnect for ${address} in ${delay}ms (attempt ${attempt + 1}/${RECONNECT_MAX_ATTEMPTS})`
    );
    const timer = setTimeout(() => {
      this._reconnectTimeouts.delete(address);
      if (this._pendingConnects.has(address)) {
        return;
      }
      const live2 = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live2 && RemoteAgentHostConnectionStatus.isConnected(live2.status)) {
        this._clearReconnectBackoff(address);
        return;
      }
      this._reconnectAttempts.set(address, attempt + 1);
      this._connectTunnel(address, { userInitiated: false }).catch(() => {
      });
    }, delay);
    this._reconnectTimeouts.set(address, timer);
  }
  /**
   * Best-effort probe of whether the host backing `tunnelId` is online
   * (has any host connections). Returns `undefined` if we couldn't
   * determine — caller should treat as "retry normally" in that case.
   */
  async _probeHostOnline(tunnelId) {
    try {
      const tunnels = await this._tunnelService.listTunnels({ silent: true });
      if (!tunnels) {
        return void 0;
      }
      const info = tunnels.find((t) => t.tunnelId === tunnelId);
      if (!info) {
        return false;
      }
      return info.hostConnectionCount > 0;
    } catch {
      return void 0;
    }
  }
  _cancelReconnect(address) {
    const timer = this._reconnectTimeouts.get(address);
    if (timer !== void 0) {
      clearTimeout(timer);
      this._reconnectTimeouts.delete(address);
    }
  }
  /** Clear retry-backoff and pause state for an address. */
  _clearReconnectBackoff(address) {
    this._reconnectAttempts.delete(address);
    this._reconnectPaused.delete(address);
    this._hostOfflinePaused.delete(address);
  }
  /** Drop all reconnect + telemetry state for an address (e.g. on removal). */
  _resetReconnectState(address) {
    this._cancelReconnect(address);
    this._clearReconnectBackoff(address);
    this._connectSessions.delete(address);
  }
  /**
   * React to auth session add/remove. Additions re-run discovery (a fresh
   * token may unblock a previously auth-paused tunnel). Removals drop any
   * tunnel state that depended on that provider — otherwise we'd sit on a
   * stale auth pause forever, or hammer a provider whose session is gone.
   */
  _handleSessionsChange(e) {
    const added = (e.event.added?.length ?? 0) > 0;
    const removed = (e.event.removed?.length ?? 0) > 0;
    if (removed) {
      const cached = this._tunnelService.getCachedTunnels();
      for (const tunnel of cached) {
        if (tunnel.authProvider !== e.providerId) {
          continue;
        }
        const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
        this._logService.info(
          `[TunnelAgentHost] Auth session removed for ${e.providerId}; tearing down ${address}.`
        );
        this._resetReconnectState(address);
        this._tunnelService.disconnect(address).catch(() => {
        });
      }
    }
    if (added) {
      this._logService.info(`[TunnelAgentHost] ${e.providerId} session added; resuming reconnects and rediscovering.`);
      this._resumeReconnects("sessionAdded");
      this._silentStatusCheck("sessionChange");
    }
  }
  /**
   * Stop auto-reconnecting for an address until a wake/online/visibility
   * event resumes us, and close out any active telemetry session.
   */
  _pauseReconnect(address, reason) {
    this._cancelReconnect(address);
    this._reconnectAttempts.delete(address);
    this._reconnectPaused.add(address);
    if (reason === "hostOffline") {
      this._hostOfflinePaused.add(address);
    } else {
      this._hostOfflinePaused.delete(address);
    }
    this._logService.info(
      `[TunnelAgentHost] Pausing auto-reconnect for ${address} (${reason}); will resume on network-online, tab-visible, session change, or next status check.`
    );
    const session = this._connectSessions.get(address);
    if (session) {
      logTunnelConnectResolved(this._telemetryService, {
        isReconnect: session.isReconnect,
        totalAttempts: session.attempts,
        totalDurationMs: Date.now() - session.startedAt,
        success: false,
        failureReason: reason
      });
      this._connectSessions.delete(address);
    }
  }
  /**
   * Begin (or continue) a connect telemetry session for `address` and
   * return the bookkeeping needed to later finish the attempt. A session
   * already exists if `_handleConnectionChanges` marked this as a
   * reconnect cycle; otherwise this starts a fresh initial-connect session.
   */
  _beginConnectAttempt(address) {
    let session = this._connectSessions.get(address);
    if (!session) {
      session = { startedAt: Date.now(), attempts: 0, isReconnect: false };
      this._connectSessions.set(address, session);
    }
    session.attempts++;
    return { session, attemptNumber: session.attempts, attemptStart: Date.now(), isReconnect: session.isReconnect };
  }
  /**
   * Finalize the telemetry for a single connect attempt. On success, also
   * clears backoff state and closes the session; on failure, only the
   * per-attempt event is emitted (the caller decides whether to retry).
   */
  _finishConnectAttempt(address, args) {
    const { success, attemptNumber, attemptStart, session, isReconnect, error } = args;
    const durationMs = Date.now() - attemptStart;
    if (success) {
      this._clearReconnectBackoff(address);
      logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: true });
      logTunnelConnectResolved(this._telemetryService, { isReconnect, totalAttempts: attemptNumber, totalDurationMs: Date.now() - session.startedAt, success: true });
      this._connectSessions.delete(address);
    } else {
      logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: false, errorCategory: this._categorizeError(error) });
    }
  }
  _categorizeError(err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/\b(401|403)\b|token.*expired|expired.*token|invalid[_ -]?grant/i.test(message)) {
      return "authExpired";
    }
    if (/authenticat|unauthoriz|auth.*(fail|error|invalid)/i.test(message)) {
      return "auth";
    }
    if (/WebSocket relay connection failed|failed to connect to relay/i.test(message)) {
      return "relayConnectionFailed";
    }
    if (/network|fetch|offline|ECONN|ENOTFOUND|ETIMEDOUT/i.test(message)) {
      return "network";
    }
    return "other";
  }
  /**
   * Invoked on `online` / `visibilitychange→visible`. Kicks off an
   * immediate attempt for any disconnected cached tunnel.
   *
   * Rate-limited: at most one resume per RESUME_RATE_LIMIT_MS so that
   * rapid tab toggling can't hammer a permanently broken endpoint with
   * an unbounded number of attempt bursts. Resumes the normal backoff
   * sequence (by clearing the pause flag) rather than zeroing the
   * attempt counter.
   */
  _resumeReconnects(trigger) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const now = Date.now();
    if (now - this._lastResumeAt < RESUME_RATE_LIMIT_MS) {
      return;
    }
    this._lastResumeAt = now;
    const cached = this._getProviderTunnels();
    for (const tunnel of cached) {
      const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
      if (this._pendingConnects.has(address)) {
        continue;
      }
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        continue;
      }
      this._logService.info(`[TunnelAgentHost] Resuming reconnect for ${address} (trigger: ${trigger})`);
      if (this._reconnectPaused.has(address)) {
        this._clearReconnectBackoff(address);
      }
      this._scheduleReconnect(
        address,
        /*immediate*/
        true
      );
    }
  }
  /** Drop reconnect state for addresses whose tunnel is no longer cached. */
  _pruneReconnectState() {
    const cachedAddresses = new Set(this._getProviderTunnels().map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    const tracked = /* @__PURE__ */ new Set([
      ...this._reconnectTimeouts.keys(),
      ...this._reconnectAttempts.keys(),
      ...this._reconnectPaused,
      ...this._connectSessions.keys()
    ]);
    for (const address of tracked) {
      if (!cachedAddresses.has(address)) {
        this._resetReconnectState(address);
      }
    }
  }
  // -- Silent status check --
  async _silentStatusCheck(trigger) {
    const resolvedTrigger = trigger ?? (this._initialStatusChecked ? "rediscover" : "startup");
    const hostsEnabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const autoConnectEnabled = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
    if (!hostsEnabled) {
      this._initialStatusChecked = true;
      this._updateConnectionStatuses();
      logTunnelDiscoveryResult(this._telemetryService, {
        trigger: resolvedTrigger,
        totalFound: 0,
        withActiveHost: 0,
        cachedBefore: this._tunnelService.getCachedTunnels().length,
        autoConnectEnabled,
        hostsEnabled,
        success: true
      });
      return;
    }
    this._lastStatusCheck = Date.now();
    const cachedBefore = this._tunnelService.getCachedTunnels().length;
    let onlineTunnels;
    try {
      onlineTunnels = await this._tunnelService.listTunnels({ silent: true });
    } catch {
      this._initialStatusChecked = true;
      this._updateConnectionStatuses();
      logTunnelDiscoveryResult(this._telemetryService, {
        trigger: resolvedTrigger,
        totalFound: 0,
        withActiveHost: 0,
        cachedBefore,
        autoConnectEnabled,
        hostsEnabled,
        success: false
      });
      return;
    }
    const cached = this._tunnelService.getCachedTunnels();
    if (onlineTunnels) {
      const onlineIds = new Set(onlineTunnels.map((t) => t.tunnelId));
      for (const tunnel of cached) {
        if (!onlineIds.has(tunnel.tunnelId)) {
          this._tunnelService.removeCachedTunnel(tunnel.tunnelId);
        }
      }
      const cachedIds = new Set(cached.map((t) => t.tunnelId));
      for (const tunnel of onlineTunnels) {
        if (!cachedIds.has(tunnel.tunnelId)) {
          this._tunnelService.cacheTunnel(tunnel, "github");
        }
      }
      const onlineTunnelMap = new Map(onlineTunnels.map((t) => [t.tunnelId, t]));
      for (const [address, provider] of this._providerInstances) {
        const hasConnection = this._remoteAgentHostService.connections.some(
          (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
        );
        if (hasConnection) {
          continue;
        }
        const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
        const info = onlineTunnelMap.get(tunnelId);
        if (info && info.hostConnectionCount > 0) {
          provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
          if (this._hostOfflinePaused.has(address)) {
            this._logService.info(
              `[TunnelAgentHost] Host came back online for ${address}; auto-resuming reconnect.`
            );
            this._clearReconnectBackoff(address);
            this._scheduleReconnect(
              address,
              /*immediate*/
              true
            );
          }
        } else {
          provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
          provider.unpublishCachedSessions();
        }
      }
      const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
      if (autoConnect) {
        for (const tunnel of onlineTunnels) {
          if (tunnel.hostConnectionCount > 0) {
            const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
            if (this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId)) {
              continue;
            }
            const alreadyConnected = this._remoteAgentHostService.connections.some(
              (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
            );
            if (!alreadyConnected) {
              this._connectTunnel(address, { userInitiated: false });
            }
          }
        }
      }
    }
    this._initialStatusChecked = true;
    this._updateConnectionStatuses();
    const totalFound = onlineTunnels?.length ?? 0;
    const withActiveHost = onlineTunnels?.filter((t) => t.hostConnectionCount > 0).length ?? 0;
    this._logService.info(
      `[TunnelAgentHost] Silent status check (${resolvedTrigger}): totalFound=${totalFound}, withActiveHost=${withActiveHost}, cachedBefore=${cachedBefore}, autoConnect=${autoConnectEnabled}`
    );
    logTunnelDiscoveryResult(this._telemetryService, {
      trigger: resolvedTrigger,
      totalFound,
      withActiveHost,
      cachedBefore,
      autoConnectEnabled,
      hostsEnabled,
      success: true
    });
  }
};
TunnelAgentHostContribution.ID = "sessions.contrib.tunnelAgentHostContribution";
TunnelAgentHostContribution = __decorateClass([
  __decorateParam(0, ITunnelAgentHostService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ISessionsProvidersService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IAuthenticationService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IAgentHostFilterService)
], TunnelAgentHostContribution);
registerWorkbenchContribution2(TunnelAgentHostContribution.ID, TunnelAgentHostContribution, WorkbenchPhase.AfterRestored);
export {
  TunnelAgentHostContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL3R1bm5lbEFnZW50SG9zdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdEF1dG9Db25uZWN0U2V0dGluZ0lkLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHVubmVsQWdlbnRIb3N0U2VydmljZSwgVFVOTkVMX0FERFJFU1NfUFJFRklYLCB0eXBlIElUdW5uZWxJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90dW5uZWxBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2dUdW5uZWxDb25uZWN0QXR0ZW1wdCwgbG9nVHVubmVsQ29ubmVjdFJlc29sdmVkLCBsb2dUdW5uZWxEaXNjb3ZlcnlSZXN1bHQsIFR1bm5lbENvbm5lY3RFcnJvckNhdGVnb3J5LCBUdW5uZWxDb25uZWN0RmFpbHVyZVJlYXNvbiwgVHVubmVsRGlzY292ZXJ5VHJpZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3RGaWx0ZXIvY29tbW9uL2FnZW50SG9zdEZpbHRlci5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IHdhdGNoRm9ySW5jb21wYXRpYmxlTm90aWZpY2F0aW9ucyB9IGZyb20gJy4vcmVtb3RlSG9zdE9wdGlvbnMuanMnO1xuXG4vKiogTWluaW11bSBpbnRlcnZhbCBiZXR3ZWVuIHNpbGVudCBzdGF0dXMgY2hlY2tzICg1IG1pbnV0ZXMpLiAqL1xuY29uc3QgU1RBVFVTX0NIRUNLX0lOVEVSVkFMID0gNSAqIDYwICogMTAwMDtcblxuLyoqIEluaXRpYWwgYXV0by1yZWNvbm5lY3QgZGVsYXkgYWZ0ZXIgYW4gdW5leHBlY3RlZCB0dW5uZWwgZGlzY29ubmVjdC4gKi9cbmNvbnN0IFJFQ09OTkVDVF9JTklUSUFMX0RFTEFZID0gMTAwMDtcbi8qKiBNYXhpbXVtIGF1dG8tcmVjb25uZWN0IGJhY2tvZmYgZGVsYXkuICovXG5jb25zdCBSRUNPTk5FQ1RfTUFYX0RFTEFZID0gMzBfMDAwO1xuLyoqXG4gKiBDb25zZWN1dGl2ZSBmYWlsdXJlcyBiZWZvcmUgcGF1c2luZyBhdXRvLXJlY29ubmVjdC4gV2UgcmVzdW1lIGltbWVkaWF0ZWx5XG4gKiBvbiBhIG5ldHdvcmstb25saW5lIGV2ZW50IG9yIHdoZW4gdGhlIHRhYiBiZWNvbWVzIHZpc2libGUsIHNvIHRoaXMgaXNcbiAqIG1vc3RseSBhIGd1YXJkIGFnYWluc3QgYSBwZXJtYW5lbnRseSBkZWFkIHR1bm5lbC5cbiAqL1xuY29uc3QgUkVDT05ORUNUX01BWF9BVFRFTVBUUyA9IDEwO1xuXG4vKiogTWluaW11bSBnYXAgYmV0d2VlbiB3YWtlL3Zpc2liaWxpdHktdHJpZ2dlcmVkIHJlc3VtZXMuICovXG5jb25zdCBSRVNVTUVfUkFURV9MSU1JVF9NUyA9IDEwXzAwMDtcblxuZXhwb3J0IGNsYXNzIFR1bm5lbEFnZW50SG9zdENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi50dW5uZWxBZ2VudEhvc3RDb250cmlidXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyU3RvcmVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nIC8qIGFkZHJlc3MgKi8sIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDb25uZWN0cyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXHRwcml2YXRlIF9sYXN0U3RhdHVzQ2hlY2sgPSAwO1xuXHQvKipcblx0ICogYGZhbHNlYCB1bnRpbCB0aGUgZmlyc3Qge0BsaW5rIF9zaWxlbnRTdGF0dXNDaGVja30gcmVzb2x2ZXMuIFVudGlsIHRoZW5cblx0ICogd2Uga2VlcCBuZXdseS1jcmVhdGVkIHByb3ZpZGVycyBpbiB0aGUgYENvbm5lY3RpbmdgIHN0YXRlIHNvIHRoZSBwaWNrZXJcblx0ICogZG9lc24ndCBicmllZmx5IHNob3cgZXZlcnkgY2FjaGVkIHR1bm5lbCBhcyBcIk9mZmxpbmVcIiBvbiBzdGFydHVwLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5pdGlhbFN0YXR1c0NoZWNrZWQgPSBmYWxzZTtcblxuXHQvKiogUHJldmlvdXMgY29ubmVjdGlvbiBzdGF0dXMgcGVyIGFkZHJlc3MgXHUyMDE0IHVzZWQgdG8gZGV0ZWN0IENvbm5lY3RlZFx1MjE5MkRpc2Nvbm5lY3RlZCB0cmFuc2l0aW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlvdXNTdGF0dXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPigpO1xuXHQvKiogUGVuZGluZyBhdXRvLXJlY29ubmVjdCB0aW1lciBwZXIgYWRkcmVzcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+KCk7XG5cdC8qKiBDb25zZWN1dGl2ZSBmYWlsZWQgYXV0by1yZWNvbm5lY3QgYXR0ZW1wdHMgcGVyIGFkZHJlc3MuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdEF0dGVtcHRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0LyoqIEFkZHJlc3NlcyB3aG9zZSBhdXRvLXJlY29ubmVjdCBsb29wIGhhcyBwYXVzZWQgYWZ0ZXIgdG9vIG1hbnkgZmFpbHVyZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdFBhdXNlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHQvKiogQWRkcmVzc2VzIHBhdXNlZCBzcGVjaWZpY2FsbHkgYmVjYXVzZSB0aGUgcmVtb3RlIGhvc3QgaXMgb2ZmbGluZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaG9zdE9mZmxpbmVQYXVzZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0LyoqIFRpbWVzdGFtcCBvZiB0aGUgbGFzdCB3YWtlLXRyaWdnZXJlZCByZXN1bWUsIHRvIHJhdGUtbGltaXQgcmFwaWQgdGFiIHRvZ2dsZXMuICovXG5cdHByaXZhdGUgX2xhc3RSZXN1bWVBdCA9IDA7XG5cblx0LyoqXG5cdCAqIFBlci1hZGRyZXNzIGNvbm5lY3Qgc2Vzc2lvbnMgZm9yIHRlbGVtZXRyeS4gQSBzZXNzaW9uIHN0YXJ0cyBhdCB0aGVcblx0ICogZmlyc3QgYXR0ZW1wdCBvZiBhIGNvbm5lY3QgY3ljbGUgKGluaXRpYWwgb3IgcmVjb25uZWN0KSBhbmQgZW5kcyBvblxuXHQgKiB0ZXJtaW5hbCByZXNvbHV0aW9uIChjb25uZWN0ZWQsIGhvc3Qtb2ZmbGluZSwgbWF4LWF0dGVtcHRzKS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3RTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IHN0YXJ0ZWRBdDogbnVtYmVyOyBhdHRlbXB0czogbnVtYmVyOyBpc1JlY29ubmVjdDogYm9vbGVhbiB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVHVubmVsQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90dW5uZWxTZXJ2aWNlOiBJVHVubmVsQWdlbnRIb3N0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSBhZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIENyZWF0ZSBwcm92aWRlcnMgZm9yIGNhY2hlZCB0dW5uZWxzXG5cdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cblx0XHQvLyBQbHVnIG91ciBzaWxlbnQgc3RhdHVzIGNoZWNrIGludG8gdGhlIHNoYXJlZCBob3N0IHBpY2tlciBVWCBzb1xuXHRcdC8vIHRoZSB1c2VyLXRyaWdnZXJlZCBcIlJlLWRpc2NvdmVyIGhvc3RzXCIgYWN0aW9uIHJ1bnMgdGhlIHNhbWVcblx0XHQvLyBkaXNjb3Zlcnkgcm91dGluZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLnJlZ2lzdGVyRGlzY292ZXJ5SGFuZGxlcigoKSA9PiB0aGlzLl9zaWxlbnRTdGF0dXNDaGVjaygpKSk7XG5cblx0XHQvLyBVcGRhdGUgY29ubmVjdGlvbiBzdGF0dXNlcyB3aGVuIGNvbm5lY3Rpb25zIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDb25uZWN0aW9uQ2hhbmdlcygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHR0aGlzLl93aXJlQ29ubmVjdGlvbnMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWNvbmNpbGUgcHJvdmlkZXJzIHdoZW4gdGhlIHR1bm5lbCBjYWNoZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHVubmVsU2VydmljZS5vbkRpZENoYW5nZVR1bm5lbHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cdFx0XHQvLyBTdG9wIGFueSByZWNvbm5lY3QgbG9vcHMgZm9yIHR1bm5lbHMgdGhhdCBubyBsb25nZXIgZXhpc3Rcblx0XHRcdHRoaXMuX3BydW5lUmVjb25uZWN0U3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cdFx0XHRcdHRoaXMuX3BydW5lUmVjb25uZWN0U3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1ydW4gZGlzY292ZXJ5IHdoZW4gYSBHaXRIdWIgc2Vzc2lvbiBiZWNvbWVzIGF2YWlsYWJsZSxcblx0XHQvLyBhbmQgdGVhciBkb3duIHR1bm5lbCBzdGF0ZSBib3VuZCB0byB0aGF0IHByb3ZpZGVyIGlmIGl0cyBzZXNzaW9uXG5cdFx0Ly8gaXMgcmVtb3ZlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHtcblx0XHRcdGlmIChlLnByb3ZpZGVySWQgIT09ICdnaXRodWInKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhbmRsZVNlc3Npb25zQ2hhbmdlKGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdha2UtdHJpZ2dlcmVkIHJldHJ5OiB3aGVuIHRoZSBicm93c2VyIHJlZ2FpbnMgY29ubmVjdGl2aXR5IG9yXG5cdFx0Ly8gdGhlIHRhYiBiZWNvbWVzIHZpc2libGUgYWdhaW4sIGltbWVkaWF0ZWx5IGF0dGVtcHQgdG8gcmVjb25uZWN0XG5cdFx0Ly8gYW55IGRpc2Nvbm5lY3RlZCB0dW5uZWxzLiBUaGlzIGNvdmVycyBsYXB0b3Atc2xlZXAgLyBXaS1GaS1kcm9wXG5cdFx0Ly8gc2NlbmFyaW9zIHdoZXJlIHdlIG1heSBoYXZlIHBhdXNlZCB0aGUgcmVjb25uZWN0IGxvb3AuXG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRjb25zdCBvbldha2UgPSAoKSA9PiB0aGlzLl9yZXN1bWVSZWNvbm5lY3RzKCd3YWtlJyk7XG5cdFx0XHRtYWluV2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ29ubGluZScsIG9uV2FrZSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gbWFpbldpbmRvdy5yZW1vdmVFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBvbldha2UpKSk7XG5cblx0XHRcdGNvbnN0IG9uVmlzaWJpbGl0eUNoYW5nZSA9ICgpID0+IHtcblx0XHRcdFx0aWYgKG1haW5XaW5kb3cuZG9jdW1lbnQudmlzaWJpbGl0eVN0YXRlID09PSAndmlzaWJsZScpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXN1bWVSZWNvbm5lY3RzKCd2aXNpYmxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3Zpc2liaWxpdHljaGFuZ2UnLCBvblZpc2liaWxpdHlDaGFuZ2UpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG1haW5XaW5kb3cuZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigndmlzaWJpbGl0eWNoYW5nZScsIG9uVmlzaWJpbGl0eUNoYW5nZSkpKTtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgcmVjb25uZWN0IHRpbWVycyBvbiBkaXNwb3NhbC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB0aW1lciBvZiB0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZW91dHMuY2xlYXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTaWxlbnRseSBjaGVjayBzdGF0dXMgb2YgY2FjaGVkIHR1bm5lbHMgb24gc3RhcnR1cC4gUm91dGVkXG5cdFx0Ly8gdGhyb3VnaCB0aGUgZmlsdGVyIHNlcnZpY2UncyBgcmVkaXNjb3ZlcmAgc28gdGhlIGhvc3QgcGlsbFxuXHRcdC8vIHB1bHNlcyB3aGlsZSB0aGUgaW5pdGlhbCBhdXRvbWF0aWMgZGlzY292ZXJ5IGlzIGluIGZsaWdodCxcblx0XHQvLyB0aGVuIHN3aXRjaGVzIHRvIGEgc3RhdGljIGxhYmVsIG9uY2Ugd2Uga25vdyB3aGF0IGhvc3RzIGV4aXN0LlxuXHRcdGFnZW50SG9zdEZpbHRlclNlcnZpY2UucmVkaXNjb3ZlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBieSB0aGUgd29ya3NwYWNlIHBpY2tlciB3aGVuIGl0IG9wZW5zLiBTaWxlbnRseSByZS1jaGVja3Ncblx0ICogdHVubmVsIHN0YXR1c2VzIGlmIG1vcmUgdGhhbiA1IG1pbnV0ZXMgaGF2ZSBlbGFwc2VkIHNpbmNlIHRoZSBsYXN0IGNoZWNrLlxuXHQgKi9cblx0YXN5bmMgY2hlY2tUdW5uZWxTdGF0dXNlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoRGF0ZS5ub3coKSAtIHRoaXMuX2xhc3RTdGF0dXNDaGVjayA8IFNUQVRVU19DSEVDS19JTlRFUlZBTCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zaWxlbnRTdGF0dXNDaGVjaygpO1xuXHR9XG5cblx0Ly8gLS0gUHJvdmlkZXIgbWFuYWdlbWVudCAtLVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZVByb3ZpZGVycygpOiB2b2lkIHtcblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IGVuYWJsZWQgPyB0aGlzLl9nZXRQcm92aWRlclR1bm5lbHMoKSA6IFtdO1xuXHRcdGNvbnN0IGRlc2lyZWRBZGRyZXNzZXMgPSBuZXcgU2V0KGNhY2hlZC5tYXAodCA9PiBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0LnR1bm5lbElkfWApKTtcblxuXHRcdC8vIFJlbW92ZSBwcm92aWRlcnMgbm8gbG9uZ2VyIGNhY2hlZFxuXHRcdGZvciAoY29uc3QgW2FkZHJlc3NdIG9mIHRoaXMuX3Byb3ZpZGVyU3RvcmVzKSB7XG5cdFx0XHRpZiAoIWRlc2lyZWRBZGRyZXNzZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgcHJvdmlkZXJzIGZvciBjYWNoZWQgdHVubmVsc1xuXHRcdGZvciAoY29uc3QgdHVubmVsIG9mIGNhY2hlZCkge1xuXHRcdFx0Y29uc3QgYWRkcmVzcyA9IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3R1bm5lbC50dW5uZWxJZH1gO1xuXHRcdFx0aWYgKCF0aGlzLl9wcm92aWRlclN0b3Jlcy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlUHJvdmlkZXIoYWRkcmVzcywgdHVubmVsLm5hbWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFByb3ZpZGVyVHVubmVscygpIHtcblx0XHRyZXR1cm4gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkuZmlsdGVyKHR1bm5lbCA9PiAhdGhpcy5fdHVubmVsU2VydmljZS5pc0F1dG9Db25uZWN0U3VwcHJlc3NlZCh0dW5uZWwudHVubmVsSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVByb3ZpZGVyKGFkZHJlc3M6IHN0cmluZywgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pbnN0YW50aWF0ZVByb3ZpZGVyKGFkZHJlc3MsIG5hbWUpO1xuXHRcdC8vIFN1cmZhY2UgYXMgXCJDb25uZWN0aW5nXCIgdW50aWwgdGhlIGZpcnN0IHNpbGVudCBzdGF0dXMgY2hlY2sgb3IgYW5cblx0XHQvLyBhdXRvLWNvbm5lY3QgYXR0ZW1wdCBkZXRlcm1pbmVzIHRoZSByZWFsIHN0YXRlOyBvdGhlcndpc2UgdGhlIHBpY2tlclxuXHRcdC8vIGZsYXNoZXMgXCJPZmZsaW5lXCIgZm9yIGV2ZXJ5IGNhY2hlZCB0dW5uZWwgb24gc3RhcnR1cC5cblx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zKHByb3ZpZGVyLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLnNldChhZGRyZXNzLCBwcm92aWRlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5kZWxldGUoYWRkcmVzcykpKTtcblx0XHR0aGlzLl9wcm92aWRlclN0b3Jlcy5zZXQoYWRkcmVzcywgc3RvcmUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9pbnN0YW50aWF0ZVByb3ZpZGVyKGFkZHJlc3M6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwge1xuXHRcdFx0YWRkcmVzcyxcblx0XHRcdG5hbWUsXG5cdFx0XHRjb25uZWN0T25EZW1hbmQ6ICgpID0+IHRoaXMuX2Nvbm5lY3RUdW5uZWwoYWRkcmVzcywgeyB1c2VySW5pdGlhdGVkOiB0cnVlIH0pLFxuXHRcdFx0ZGlzY29ubmVjdE9uRGVtYW5kOiAoKSA9PiB0aGlzLl9kaXNjb25uZWN0VHVubmVsKGFkZHJlc3MpLFxuXHRcdH0sXG5cdFx0KTtcblx0fVxuXG5cdC8vIC0tIENvbm5lY3Rpb24gc3RhdHVzIC0tXG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2FkZHJlc3MsIHByb3ZpZGVyXSBvZiB0aGlzLl9wcm92aWRlckluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdC8vIFNlcnZpY2UgaGFzIGFuIGVudHJ5IFx1MjAxNCBpdHMgc3RhdHVzIGlzIGF1dGhvcml0YXRpdmVcblx0XHRcdFx0Ly8gKGluY2x1ZGluZyBpbmNvbXBhdGlibGUgZnJvbSB0aGUgV2ViU29ja2V0IGNvbm5lY3Rcblx0XHRcdFx0Ly8gZmFpbHVyZSBwYXRoLCBhbmQgY29ubmVjdGluZy9jb25uZWN0ZWQgZnJvbSBhIGZyZXNoXG5cdFx0XHRcdC8vIHJlY29ubmVjdCBhZnRlciBhbiB1cGdyYWRlKS5cblx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvblN0YXR1cyhjb25uZWN0aW9uSW5mby5zdGF0dXMpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFByZXNlcnZlIGluY29tcGF0aWJsZSBzdGF0ZSBzZXQgYnkgYF9jb25uZWN0VHVubmVsYCdzIGNhdGNoXG5cdFx0XHQvLyAod2hlcmUgdGhlIGZhaWx1cmUgaGFwcGVucyBiZWZvcmUgdGhlIHNlcnZpY2UgZXZlciBoYXMgYW5cblx0XHRcdC8vIGVudHJ5KSB1bnRpbCB0aGUgdXNlciByZXRyaWVzIFx1MjAxNCBvdGhlcndpc2UgdGhlIGBmaW5hbGx5YFxuXHRcdFx0Ly8gYmxvY2sgd291bGQgaW1tZWRpYXRlbHkgb3ZlcndyaXRlIGl0IGJhY2sgdG8gYGRpc2Nvbm5lY3RlZGAuXG5cdFx0XHRpZiAoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzLmdldCgpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nQ29ubmVjdHMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nKTtcblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuX2luaXRpYWxTdGF0dXNDaGVja2VkKSB7XG5cdFx0XHRcdC8vIEtlZXAgdGhlIGluaXRpYWwgXCJDb25uZWN0aW5nXCIgc3RhdGUgc28gdGhlIHBpY2tlciBkb2Vzbid0XG5cdFx0XHRcdC8vIGZsYXNoIFwiT2ZmbGluZVwiIGJlZm9yZSB0aGUgZmlyc3Qgc2lsZW50IHN0YXR1cyBjaGVjayBydW5zLlxuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2lyZSBsaXZlIGNvbm5lY3Rpb25zIHRvIHRoZWlyIHByb3ZpZGVycyBzbyBzZXNzaW9uIG9wZXJhdGlvbnMgd29yay5cblx0ICovXG5cdHByaXZhdGUgX3dpcmVDb25uZWN0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKFxuXHRcdFx0XHRjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKVxuXHRcdFx0KTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5nZXRDb25uZWN0aW9uKGFkZHJlc3MpO1xuXHRcdFx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb24oY29ubmVjdGlvbiwgY29ubmVjdGlvbkluZm8uZGVmYXVsdERpcmVjdG9yeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLSBPbi1kZW1hbmQgY29ubmVjdGlvbiAtLVxuXG5cdC8qKlxuXHQgKiBFc3RhYmxpc2ggYSByZWxheSBjb25uZWN0aW9uIHRvIGEgY2FjaGVkIHR1bm5lbC4gQ2FsbGVkIG9uIGRlbWFuZFxuXHQgKiB3aGVuIHRoZSB1c2VyIGludm9rZXMgdGhlIGJyb3dzZSBhY3Rpb24gb24gYW4gb25saW5lLWJ1dC1ub3QtY29ubmVjdGVkIHR1bm5lbC5cblx0ICovXG5cdHByaXZhdGUgX2Nvbm5lY3RUdW5uZWwoYWRkcmVzczogc3RyaW5nLCBvcHRpb25zOiB7IHJlYWRvbmx5IHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCB0dW5uZWxJZCA9IGFkZHJlc3Muc2xpY2UoVFVOTkVMX0FERFJFU1NfUFJFRklYLmxlbmd0aCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkuZmluZCh0ID0+IHQudHVubmVsSWQgPT09IHR1bm5lbElkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRpZiAoIW9wdGlvbnMudXNlckluaXRpYXRlZCAmJiB0aGlzLl90dW5uZWxTZXJ2aWNlLmlzQXV0b0Nvbm5lY3RTdXBwcmVzc2VkKHR1bm5lbElkKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsQWdlbnRIb3N0XSBTa2lwcGluZyBiYWNrZ3JvdW5kIGNvbm5lY3QgZm9yIHVzZXItZGlzY29ubmVjdGVkIHR1bm5lbCAke2FkZHJlc3N9YCk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnVzZXJJbml0aWF0ZWQpIHtcblx0XHRcdHRoaXMuX3R1bm5lbFNlcnZpY2UuY2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbElkKTtcblx0XHRcdC8vIENsZWFyIGFueSBzdGlja3kgYGluY29tcGF0aWJsZWAgc3RhdGUgc28gdGhpcyBhdHRlbXB0IGNhblxuXHRcdFx0Ly8gdHJhbnNpdGlvbiB0aHJvdWdoIGBjb25uZWN0aW5nYCBhbmQgcmVwb3J0IGEgZnJlc2ggcmVzdWx0LlxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk7XG5cdFx0XHRpZiAocHJvdmlkZXIgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShwcm92aWRlci5jb25uZWN0aW9uU3RhdHVzLmdldCgpKSkge1xuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQSBuZXcgYXR0ZW1wdCBpcyBzdGFydGluZyBcdTIwMTQgY2FuY2VsIGFueSBzY2hlZHVsZWQgcmVjb25uZWN0IHRpbWVyO1xuXHRcdC8vIHN1Y2Nlc3MvZmFpbHVyZSBvZiB0aGlzIGF0dGVtcHQgd2lsbCBkcml2ZSB0aGUgbmV4dCBkZWNpc2lvbi5cblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cblx0XHRjb25zdCB7IGF0dGVtcHROdW1iZXIsIGF0dGVtcHRTdGFydCwgc2Vzc2lvbiwgaXNSZWNvbm5lY3QgfSA9IHRoaXMuX2JlZ2luQ29ubmVjdEF0dGVtcHQoYWRkcmVzcyk7XG5cblx0XHRjb25zdCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFNob3cgYSBwcm9ncmVzcyBub3RpZmljYXRpb24gYWZ0ZXIgYSBzaG9ydCBkZWxheSBzbyBxdWlja1xuXHRcdFx0Ly8gY29ubmVjdHMgZG9uJ3QgZmxhc2ggYSBub3RpZmljYXRpb24uIE9ubHkgc2hvdyBmb3IgdXNlci1pbml0aWF0ZWRcblx0XHRcdC8vIGNvbm5lY3RzOyBiYWNrZ3JvdW5kIGF1dG8tY29ubmVjdHMgYW5kIHJlY29ubmVjdHMgc3RheSBzaWxlbnQuXG5cdFx0XHRsZXQgaGFuZGxlOiB7IGNsb3NlKCk6IHZvaWQgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRpbWVyID0gb3B0aW9ucy51c2VySW5pdGlhdGVkID8gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGhhbmRsZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3R1bm5lbENvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcgdG8gdHVubmVsICd7MH0nLi4uXCIsIGNhY2hlZC5uYW1lKSxcblx0XHRcdFx0XHRwcm9ncmVzczogeyBpbmZpbml0ZTogdHJ1ZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sIDEwMDApIDogdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbEluZm86IElUdW5uZWxJbmZvID0ge1xuXHRcdFx0XHRcdHR1bm5lbElkOiBjYWNoZWQudHVubmVsSWQsXG5cdFx0XHRcdFx0Y2x1c3RlcklkOiBjYWNoZWQuY2x1c3RlcklkLFxuXHRcdFx0XHRcdG5hbWU6IGNhY2hlZC5uYW1lLFxuXHRcdFx0XHRcdHRhZ3M6IFtdLFxuXHRcdFx0XHRcdHByb3RvY29sVmVyc2lvbjogNSxcblx0XHRcdFx0XHRob3N0Q29ubmVjdGlvbkNvdW50OiAwLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90dW5uZWxTZXJ2aWNlLmNvbm5lY3QodHVubmVsSW5mbywgY2FjaGVkLmF1dGhQcm92aWRlcik7XG5cdFx0XHRcdC8vIFJlLWNoZWNrIGFmdGVyIHRoZSBhd2FpdDogdGhlIHVzZXIgbWF5IGhhdmUgZGlzY29ubmVjdGVkIHRoaXNcblx0XHRcdFx0Ly8gdHVubmVsIHdoaWxlIHRoaXMgYmFja2dyb3VuZCBjb25uZWN0IHdhcyBhbHJlYWR5IGluIGZsaWdodC5cblx0XHRcdFx0aWYgKCFvcHRpb25zLnVzZXJJbml0aWF0ZWQgJiYgdGhpcy5fdHVubmVsU2VydmljZS5pc0F1dG9Db25uZWN0U3VwcHJlc3NlZChjYWNoZWQudHVubmVsSWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsQWdlbnRIb3N0XSBEaXNjb25uZWN0aW5nIGJhY2tncm91bmQgY29ubmVjdGlvbiBmb3IgdXNlci1kaXNjb25uZWN0ZWQgdHVubmVsICR7YWRkcmVzc31gKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl90dW5uZWxTZXJ2aWNlLmRpc2Nvbm5lY3QoYWRkcmVzcyk7XG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdFNlc3Npb25zLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZmluaXNoQ29ubmVjdEF0dGVtcHQoYWRkcmVzcywgeyBzdWNjZXNzOiB0cnVlLCBhdHRlbXB0TnVtYmVyLCBhdHRlbXB0U3RhcnQsIHNlc3Npb24sIGlzUmVjb25uZWN0IH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1R1bm5lbEFnZW50SG9zdF0gQ29ubmVjdCB0byAke2NhY2hlZC5uYW1lfSBmYWlsZWQ6YCwgZXJyKTtcblx0XHRcdFx0Y29uc3QgZXJyb3JDYXRlZ29yeSA9IHRoaXMuX2NhdGVnb3JpemVFcnJvcihlcnIpO1xuXHRcdFx0XHR0aGlzLl9maW5pc2hDb25uZWN0QXR0ZW1wdChhZGRyZXNzLCB7IHN1Y2Nlc3M6IGZhbHNlLCBhdHRlbXB0TnVtYmVyLCBhdHRlbXB0U3RhcnQsIHNlc3Npb24sIGlzUmVjb25uZWN0LCBlcnJvcjogZXJyIH0pO1xuXHRcdFx0XHQvLyBDbGVhciB0aGUgcGVuZGluZy1jb25uZWN0IGVudHJ5IEJFRk9SRSBkZWNpZGluZyB3aGF0IHRvIGRvXG5cdFx0XHRcdC8vIG5leHQ7IG90aGVyd2lzZSBgX3NjaGVkdWxlUmVjb25uZWN0YCdzIGluLWZsaWdodCBndWFyZFxuXHRcdFx0XHQvLyAoYF9wZW5kaW5nQ29ubmVjdHMuaGFzKGFkZHJlc3MpYCkgd291bGQgc2lsZW50bHkgYmFpbCBhbmRcblx0XHRcdFx0Ly8gd2UnZCBuZXZlciByZS1hcm0gdGhlIHRpbWVyLCBsZWF2aW5nIHRoZSB0dW5uZWwgc3R1Y2suXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0cy5kZWxldGUoYWRkcmVzcyk7XG5cblx0XHRcdFx0Ly8gUHJvdG9jb2wgdmVyc2lvbiBtaXNtYXRjaCBpcyBhIGRldGVybWluaXN0aWMgZmFpbHVyZSB0aGF0XG5cdFx0XHRcdC8vIGNhbm5vdCBiZSBmaXhlZCBieSByZXRyeWluZy4gU3VyZmFjZSBpdCBvbiB0aGUgcHJvdmlkZXIgc29cblx0XHRcdFx0Ly8gdGhlIHdvcmtzcGFjZSBwaWNrZXIgY2FuIHNob3cgdGhlIGhvc3QncyBtZXNzYWdlLCBhbmQgc3RvcFxuXHRcdFx0XHQvLyBzY2hlZHVsaW5nIHJlY29ubmVjdHMgdW50aWwgdGhlIHVzZXIgbWFudWFsbHkgcmV0cmllcyB2aWFcblx0XHRcdFx0Ly8gdGhlIHBpY2tlcidzIE1hbmFnZSBtZW51LlxuXHRcdFx0XHRjb25zdCBpbmNvbXBhdGlibGUgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmZyb21Db25uZWN0RXJyb3IoZXJyLCBbUFJPVE9DT0xfVkVSU0lPTl0pO1xuXHRcdFx0XHRpZiAoaW5jb21wYXRpYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpPy5zZXRDb25uZWN0aW9uU3RhdHVzKGluY29tcGF0aWJsZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBdXRoIGZhaWx1cmVzIGFyZSBub3Qgd29ydGggcmV0cnlpbmcgXHUyMDE0IGEgZnJlc2ggdG9rZW4gbXVzdFxuXHRcdFx0XHQvLyBiZSBhY3F1aXJlZCBieSB0aGUgdXNlciBvciBieSBhIHNlc3Npb24tY2hhbmdlIGV2ZW50LiBQYXVzZVxuXHRcdFx0XHQvLyBpbW1lZGlhdGVseSBhbmQgbGV0IGBfaGFuZGxlU2Vzc2lvbnNDaGFuZ2VgIHJlc3VtZSB1cyB3aGVuXG5cdFx0XHRcdC8vIGEgbmV3IHNlc3Npb24gYXBwZWFycy5cblx0XHRcdFx0aWYgKGVycm9yQ2F0ZWdvcnkgPT09ICdhdXRoRXhwaXJlZCcgfHwgZXJyb3JDYXRlZ29yeSA9PT0gJ2F1dGgnKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGF1c2VSZWNvbm5lY3QoYWRkcmVzcywgZXJyb3JDYXRlZ29yeSk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaG9zdE9ubGluZSA9IGF3YWl0IHRoaXMuX3Byb2JlSG9zdE9ubGluZShjYWNoZWQudHVubmVsSWQpO1xuXHRcdFx0XHRpZiAoaG9zdE9ubGluZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9wYXVzZVJlY29ubmVjdChhZGRyZXNzLCAnaG9zdE9mZmxpbmUnKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtUdW5uZWxBZ2VudEhvc3RdIFNjaGVkdWxpbmcgcmVjb25uZWN0IGZvciAke2FkZHJlc3N9YCk7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKHRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhbmRsZT8uY2xvc2UoKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdC8vIFN3YWxsb3cgdGhlIHByb21pc2UgcmVqZWN0aW9uIGhlcmUgc28gdW5oYW5kbGVkIHJlamVjdGlvbiBub2lzZVxuXHRcdC8vIGRvZXNuJ3QgYnViYmxlIHVwIGZvciB0aGUgYmFja2dyb3VuZCByZWNvbm5lY3QgcGF0aDsgY2FsbGVycyB0aGF0XG5cdFx0Ly8gYXdhaXQgYF9jb25uZWN0VHVubmVsYCBkaXJlY3RseSB3aWxsIHN0aWxsIHNlZSBpdCB2aWEgdGhlaXIgb3duIGBhd2FpdGAuXG5cdFx0cHJvbWlzZS5jYXRjaCgoKSA9PiB7IC8qIGhhbmRsZWQgdmlhIF9zY2hlZHVsZVJlY29ubmVjdCAqLyB9KTtcblxuXHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0cy5zZXQoYWRkcmVzcywgcHJvbWlzZSk7XG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBkb3duIHRoZSBhY3RpdmUgdHVubmVsIHJlbGF5IGZvciB7QGxpbmsgYWRkcmVzc30gYW5kIGNhbmNlbCBhbnlcblx0ICogcGVuZGluZyBhdXRvLXJlY29ubmVjdC4gVGhlIGNhY2hlZCB0dW5uZWwgZW50cnkgaXMga2VwdCBzbyB0aGUgdXNlclxuXHQgKiBjYW4gcmUtY29ubmVjdCBsYXRlcjsgb25seSB0aGUgbGl2ZSBXZWJTb2NrZXQgaXMgY2xvc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZGlzY29ubmVjdFR1bm5lbChhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLnN1cHByZXNzQXV0b0Nvbm5lY3QoYWRkcmVzcy5zbGljZShUVU5ORUxfQUREUkVTU19QUkVGSVgubGVuZ3RoKSk7XG5cdFx0Ly8gTWFyayBhcyBleHBsaWNpdGx5IGRpc2Nvbm5lY3RlZCBzbyBgX2hhbmRsZUNvbm5lY3Rpb25DaGFuZ2VzYCBkb2VzXG5cdFx0Ly8gbm90IHRyZWF0IHRoZSBpbXBlbmRpbmcgQ29ubmVjdGVkXHUyMTkyKHJlbW92ZWQpIHRyYW5zaXRpb24gYXMgYVxuXHRcdC8vIHJlY29ubmVjdC13b3J0aHkgZHJvcC5cblx0XHR0aGlzLl9wcmV2aW91c1N0YXR1c2VzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRhd2FpdCB0aGlzLl90dW5uZWxTZXJ2aWNlLmRpc2Nvbm5lY3QoYWRkcmVzcyk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZWN0IHR1bm5lbCBjb25uZWN0aW9ucyB0aGF0IHRyYW5zaXRpb25lZCBmcm9tIENvbm5lY3RlZCB0b1xuXHQgKiBEaXNjb25uZWN0ZWQgYW5kIHNjaGVkdWxlIGFuIGF1dG8tcmVjb25uZWN0LlxuXHQgKlxuXHQgKiBJbXBvcnRhbnQ6IHdlIG9ubHkgdHJpZ2dlciBvbiBhIENvbm5lY3RlZCBcdTIxOTIgRGlzY29ubmVjdGVkIHRyYW5zaXRpb25cblx0ICogd2hlcmUgdGhlIGNvbm5lY3Rpb24gZW50cnkgaXMgc3RpbGwgcHJlc2VudC4gSWYgdGhlIGVudHJ5IGhhcyBiZWVuXG5cdCAqIHJlbW92ZWQgZnJvbSB0aGUgc2VydmljZSAoZS5nLiB0aGUgdXNlciBjbGlja2VkIFwiUmVtb3ZlIFJlbW90ZVwiKSxcblx0ICogd2UgZG8gTk9UIHNjaGVkdWxlIGEgcmVjb25uZWN0IFx1MjAxNCB0aGF0IHdvdWxkIG92ZXJyaWRlIHRoZWlyIGludGVudC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUNvbm5lY3Rpb25DaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkQWRkcmVzc2VzID0gbmV3IFNldCh0aGlzLl9nZXRQcm92aWRlclR1bm5lbHMoKS5tYXAodCA9PiBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0LnR1bm5lbElkfWApKTtcblx0XHRjb25zdCBjdXJyZW50U3RhdHVzZXMgPSBuZXcgTWFwPHN0cmluZywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oKTtcblx0XHRmb3IgKGNvbnN0IGNvbm4gb2YgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucykge1xuXHRcdFx0Y3VycmVudFN0YXR1c2VzLnNldChjb25uLmFkZHJlc3MsIGNvbm4uc3RhdHVzKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgY2FjaGVkQWRkcmVzc2VzKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3ByZXZpb3VzU3RhdHVzZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGN1cnJlbnRTdGF0dXNlcy5nZXQoYWRkcmVzcyk7XG5cblx0XHRcdC8vIE9ubHkgc2NoZWR1bGUgYSByZWNvbm5lY3Qgb24gYW4gZXhwbGljaXQgQ29ubmVjdGVkXHUyMTkyRGlzY29ubmVjdGVkXG5cdFx0XHQvLyB0cmFuc2l0aW9uLiBJZiB0aGUgYWRkcmVzcyBpcyBhYnNlbnQgZnJvbSB0aGUgY29ubmVjdGlvbiBsaXN0LFxuXHRcdFx0Ly8gdGhlIHVzZXIgKG9yIGFub3RoZXIgY29kZSBwYXRoKSByZW1vdmVkIGl0IFx1MjAxNCBob25vdXIgdGhhdC5cblx0XHRcdGNvbnN0IHdhc0Nvbm5lY3RlZCA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQocHJldmlvdXMpO1xuXHRcdFx0Y29uc3QgaXNFeHBsaWNpdGx5RGlzY29ubmVjdGVkID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Rpc2Nvbm5lY3RlZChjdXJyZW50KTtcblxuXHRcdFx0aWYgKHdhc0Nvbm5lY3RlZCAmJiBpc0V4cGxpY2l0bHlEaXNjb25uZWN0ZWQgJiYgIXRoaXMuX3BlbmRpbmdDb25uZWN0cy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsQWdlbnRIb3N0XSBDb25uZWN0aW9uIGxvc3QgZm9yICR7YWRkcmVzc30sIHNjaGVkdWxpbmcgcmVjb25uZWN0YCk7XG5cdFx0XHRcdGlmICghdGhpcy5fY29ubmVjdFNlc3Npb25zLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5zZXQoYWRkcmVzcywgeyBzdGFydGVkQXQ6IERhdGUubm93KCksIGF0dGVtcHRzOiAwLCBpc1JlY29ubmVjdDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZVJlY29ubmVjdChhZGRyZXNzLCAvKmltbWVkaWF0ZSovIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IHRyYWNrIHByZXZpb3VzIHN0YXR1cyB3aGlsZSB0aGUgZW50cnkgaXMgcHJlc2VudCBzbyBhXG5cdFx0XHQvLyBmdXR1cmUgcmUtcmVnaXN0cmF0aW9uIHN0YXJ0cyBmcm9tIGEgY2xlYW4gc2xhdGUuIElmIHRoZVxuXHRcdFx0Ly8gZW50cnkgZGlzYXBwZWFyZWQgKGUuZy4gdXNlci1pbml0aWF0ZWQgcmVtb3ZhbCksIGFsc28gY2FuY2VsXG5cdFx0XHQvLyBhbnkgYWxyZWFkeS1zY2hlZHVsZWQgcmVjb25uZWN0IGFuZCBjbGVhciBpdHMgYmFja29mZiBzdGF0ZVxuXHRcdFx0Ly8gc28gdGhlIHJlbW92YWwgaXMgaG9ub3VyZWQgZXZlbiBpZiBhIHRpbWVyIHdhcyBhbHJlYWR5IGFybWVkLlxuXHRcdFx0aWYgKGN1cnJlbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1N0YXR1c2VzLnNldChhZGRyZXNzLCBjdXJyZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzU3RhdHVzZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0XHR0aGlzLl9yZXNldFJlY29ubmVjdFN0YXRlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERyb3AgcHJldmlvdXMtc3RhdHVzIGVudHJpZXMgZm9yIGFkZHJlc3NlcyBubyBsb25nZXIgY2FjaGVkLlxuXHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBbLi4udGhpcy5fcHJldmlvdXNTdGF0dXNlcy5rZXlzKCldKSB7XG5cdFx0XHRpZiAoIWNhY2hlZEFkZHJlc3Nlcy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0dXNlcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVSZWNvbm5lY3QoYWRkcmVzczogc3RyaW5nLCBpbW1lZGlhdGUgPSBmYWxzZSk6IHZvaWQge1xuXHRcdC8vIFJlc3BlY3QgZW5hYmxlbWVudCBhbmQgdHVubmVsLXN0aWxsLWNhY2hlZC5cblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0dW5uZWxJZCA9IGFkZHJlc3Muc2xpY2UoVFVOTkVMX0FERFJFU1NfUFJFRklYLmxlbmd0aCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkuZmluZCh0ID0+IHQudHVubmVsSWQgPT09IHR1bm5lbElkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFscmVhZHkgY29ubmVjdGVkIG9yIGEgY29ubmVjdCBpcyBpbiBmbGlnaHQgXHUyMDE0IG5vdGhpbmcgdG8gZG8uXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdDb25uZWN0cy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0aWYgKGxpdmUgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChsaXZlLnN0YXR1cykpIHtcblx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgYW55IGV4aXN0aW5nIHRpbWVyIFx1MjAxNCB3ZSdyZSByZXNjaGVkdWxpbmcuXG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KGFkZHJlc3MpO1xuXG5cdFx0Y29uc3QgYXR0ZW1wdCA9IHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmdldChhZGRyZXNzKSA/PyAwO1xuXG5cdFx0aWYgKGF0dGVtcHQgPj0gUkVDT05ORUNUX01BWF9BVFRFTVBUUykge1xuXHRcdFx0dGhpcy5fcGF1c2VSZWNvbm5lY3QoYWRkcmVzcywgJ21heEF0dGVtcHRzUmVhY2hlZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlbGF5ID0gaW1tZWRpYXRlXG5cdFx0XHQ/IDBcblx0XHRcdDogTWF0aC5taW4oUkVDT05ORUNUX0lOSVRJQUxfREVMQVkgKiBNYXRoLnBvdygyLCBhdHRlbXB0KSwgUkVDT05ORUNUX01BWF9ERUxBWSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRgW1R1bm5lbEFnZW50SG9zdF0gU2NoZWR1bGluZyByZWNvbm5lY3QgZm9yICR7YWRkcmVzc30gaW4gJHtkZWxheX1tcyAoYXR0ZW1wdCAke2F0dGVtcHQgKyAxfS8ke1JFQ09OTkVDVF9NQVhfQVRURU1QVFN9KWBcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmRlbGV0ZShhZGRyZXNzKTtcblxuXHRcdFx0Ly8gQSBtYW51YWwgKG9yIG90aGVyKSBjb25uZWN0IG1heSBoYXZlIHN0YXJ0ZWQgb3IgY29tcGxldGVkIHdoaWxlXG5cdFx0XHQvLyB3ZSB3ZXJlIHdhaXRpbmcuIFJlLWNoZWNrIGJlZm9yZSBjb3VudGluZyB0aGlzIGFzIGEgbmV3IGF0dGVtcHQsXG5cdFx0XHQvLyBvdGhlcndpc2UgYF9jb25uZWN0VHVubmVsYCB3b3VsZCBqdXN0IHJldHVybiB0aGUgaW4tZmxpZ2h0IHByb21pc2Vcblx0XHRcdC8vIGFuZCB3ZSdkIGluZmxhdGUgdGhlIGJhY2tvZmYgY291bnRlciB3aXRob3V0IHJlYWxseSB0cnlpbmcgYWdhaW4uXG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaXZlID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGlmIChsaXZlICYmIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQobGl2ZS5zdGF0dXMpKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RBdHRlbXB0cy5zZXQoYWRkcmVzcywgYXR0ZW1wdCArIDEpO1xuXHRcdFx0dGhpcy5fY29ubmVjdFR1bm5lbChhZGRyZXNzLCB7IHVzZXJJbml0aWF0ZWQ6IGZhbHNlIH0pLmNhdGNoKCgpID0+IHsgLyogX2Nvbm5lY3RUdW5uZWwgYWxyZWFkeSByZS1zY2hlZHVsZXMgb24gZmFpbHVyZSAqLyB9KTtcblx0XHR9LCBkZWxheSk7XG5cdFx0dGhpcy5fcmVjb25uZWN0VGltZW91dHMuc2V0KGFkZHJlc3MsIHRpbWVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCZXN0LWVmZm9ydCBwcm9iZSBvZiB3aGV0aGVyIHRoZSBob3N0IGJhY2tpbmcgYHR1bm5lbElkYCBpcyBvbmxpbmVcblx0ICogKGhhcyBhbnkgaG9zdCBjb25uZWN0aW9ucykuIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgd2UgY291bGRuJ3Rcblx0ICogZGV0ZXJtaW5lIFx1MjAxNCBjYWxsZXIgc2hvdWxkIHRyZWF0IGFzIFwicmV0cnkgbm9ybWFsbHlcIiBpbiB0aGF0IGNhc2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9wcm9iZUhvc3RPbmxpbmUodHVubmVsSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0dW5uZWxzID0gYXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5saXN0VHVubmVscyh7IHNpbGVudDogdHJ1ZSB9KTtcblx0XHRcdGlmICghdHVubmVscykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5mbyA9IHR1bm5lbHMuZmluZCh0ID0+IHQudHVubmVsSWQgPT09IHR1bm5lbElkKTtcblx0XHRcdGlmICghaW5mbykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5mby5ob3N0Q29ubmVjdGlvbkNvdW50ID4gMDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUmVjb25uZWN0KGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRpbWVyID0gdGhpcy5fcmVjb25uZWN0VGltZW91dHMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICh0aW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZW91dHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBDbGVhciByZXRyeS1iYWNrb2ZmIGFuZCBwYXVzZSBzdGF0ZSBmb3IgYW4gYWRkcmVzcy4gKi9cblx0cHJpdmF0ZSBfY2xlYXJSZWNvbm5lY3RCYWNrb2ZmKGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR0aGlzLl9yZWNvbm5lY3RQYXVzZWQuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX2hvc3RPZmZsaW5lUGF1c2VkLmRlbGV0ZShhZGRyZXNzKTtcblx0fVxuXG5cdC8qKiBEcm9wIGFsbCByZWNvbm5lY3QgKyB0ZWxlbWV0cnkgc3RhdGUgZm9yIGFuIGFkZHJlc3MgKGUuZy4gb24gcmVtb3ZhbCkuICovXG5cdHByaXZhdGUgX3Jlc2V0UmVjb25uZWN0U3RhdGUoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KGFkZHJlc3MpO1xuXHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHR0aGlzLl9jb25uZWN0U2Vzc2lvbnMuZGVsZXRlKGFkZHJlc3MpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWN0IHRvIGF1dGggc2Vzc2lvbiBhZGQvcmVtb3ZlLiBBZGRpdGlvbnMgcmUtcnVuIGRpc2NvdmVyeSAoYSBmcmVzaFxuXHQgKiB0b2tlbiBtYXkgdW5ibG9jayBhIHByZXZpb3VzbHkgYXV0aC1wYXVzZWQgdHVubmVsKS4gUmVtb3ZhbHMgZHJvcCBhbnlcblx0ICogdHVubmVsIHN0YXRlIHRoYXQgZGVwZW5kZWQgb24gdGhhdCBwcm92aWRlciBcdTIwMTQgb3RoZXJ3aXNlIHdlJ2Qgc2l0IG9uIGFcblx0ICogc3RhbGUgYXV0aCBwYXVzZSBmb3JldmVyLCBvciBoYW1tZXIgYSBwcm92aWRlciB3aG9zZSBzZXNzaW9uIGlzIGdvbmUuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVTZXNzaW9uc0NoYW5nZShlOiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXZlbnQ6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudCB9KTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkZWQgPSAoZS5ldmVudC5hZGRlZD8ubGVuZ3RoID8/IDApID4gMDtcblx0XHRjb25zdCByZW1vdmVkID0gKGUuZXZlbnQucmVtb3ZlZD8ubGVuZ3RoID8/IDApID4gMDtcblxuXHRcdGlmIChyZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl90dW5uZWxTZXJ2aWNlLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHRcdGZvciAoY29uc3QgdHVubmVsIG9mIGNhY2hlZCkge1xuXHRcdFx0XHRpZiAodHVubmVsLmF1dGhQcm92aWRlciAhPT0gZS5wcm92aWRlcklkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWRkcmVzcyA9IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3R1bm5lbC50dW5uZWxJZH1gO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRcdFx0YFtUdW5uZWxBZ2VudEhvc3RdIEF1dGggc2Vzc2lvbiByZW1vdmVkIGZvciAke2UucHJvdmlkZXJJZH07IHRlYXJpbmcgZG93biAke2FkZHJlc3N9LmBcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHRcdFx0Ly8gQmVzdC1lZmZvcnQgZGlzY29ubmVjdCBcdTIwMTQgdGhlIHRyYW5zcG9ydCBtYXkgYWxyZWFkeSBiZSBkZWFkLlxuXHRcdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLmRpc2Nvbm5lY3QoYWRkcmVzcykuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFkZGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtUdW5uZWxBZ2VudEhvc3RdICR7ZS5wcm92aWRlcklkfSBzZXNzaW9uIGFkZGVkOyByZXN1bWluZyByZWNvbm5lY3RzIGFuZCByZWRpc2NvdmVyaW5nLmApO1xuXHRcdFx0dGhpcy5fcmVzdW1lUmVjb25uZWN0cygnc2Vzc2lvbkFkZGVkJyk7XG5cdFx0XHR0aGlzLl9zaWxlbnRTdGF0dXNDaGVjaygnc2Vzc2lvbkNoYW5nZScpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9wIGF1dG8tcmVjb25uZWN0aW5nIGZvciBhbiBhZGRyZXNzIHVudGlsIGEgd2FrZS9vbmxpbmUvdmlzaWJpbGl0eVxuXHQgKiBldmVudCByZXN1bWVzIHVzLCBhbmQgY2xvc2Ugb3V0IGFueSBhY3RpdmUgdGVsZW1ldHJ5IHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9wYXVzZVJlY29ubmVjdChhZGRyZXNzOiBzdHJpbmcsIHJlYXNvbjogVHVubmVsQ29ubmVjdEZhaWx1cmVSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX3JlY29ubmVjdFBhdXNlZC5hZGQoYWRkcmVzcyk7XG5cdFx0aWYgKHJlYXNvbiA9PT0gJ2hvc3RPZmZsaW5lJykge1xuXHRcdFx0dGhpcy5faG9zdE9mZmxpbmVQYXVzZWQuYWRkKGFkZHJlc3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ob3N0T2ZmbGluZVBhdXNlZC5kZWxldGUoYWRkcmVzcyk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbVHVubmVsQWdlbnRIb3N0XSBQYXVzaW5nIGF1dG8tcmVjb25uZWN0IGZvciAke2FkZHJlc3N9ICgke3JlYXNvbn0pOyBgICtcblx0XHRcdGB3aWxsIHJlc3VtZSBvbiBuZXR3b3JrLW9ubGluZSwgdGFiLXZpc2libGUsIHNlc3Npb24gY2hhbmdlLCBvciBuZXh0IHN0YXR1cyBjaGVjay5gXG5cdFx0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fY29ubmVjdFNlc3Npb25zLmdldChhZGRyZXNzKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0bG9nVHVubmVsQ29ubmVjdFJlc29sdmVkKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0aXNSZWNvbm5lY3Q6IHNlc3Npb24uaXNSZWNvbm5lY3QsXG5cdFx0XHRcdHRvdGFsQXR0ZW1wdHM6IHNlc3Npb24uYXR0ZW1wdHMsXG5cdFx0XHRcdHRvdGFsRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHNlc3Npb24uc3RhcnRlZEF0LFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0ZmFpbHVyZVJlYXNvbjogcmVhc29uLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9jb25uZWN0U2Vzc2lvbnMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCZWdpbiAob3IgY29udGludWUpIGEgY29ubmVjdCB0ZWxlbWV0cnkgc2Vzc2lvbiBmb3IgYGFkZHJlc3NgIGFuZFxuXHQgKiByZXR1cm4gdGhlIGJvb2trZWVwaW5nIG5lZWRlZCB0byBsYXRlciBmaW5pc2ggdGhlIGF0dGVtcHQuIEEgc2Vzc2lvblxuXHQgKiBhbHJlYWR5IGV4aXN0cyBpZiBgX2hhbmRsZUNvbm5lY3Rpb25DaGFuZ2VzYCBtYXJrZWQgdGhpcyBhcyBhXG5cdCAqIHJlY29ubmVjdCBjeWNsZTsgb3RoZXJ3aXNlIHRoaXMgc3RhcnRzIGEgZnJlc2ggaW5pdGlhbC1jb25uZWN0IHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9iZWdpbkNvbm5lY3RBdHRlbXB0KGFkZHJlc3M6IHN0cmluZyk6IHsgc2Vzc2lvbjogeyBzdGFydGVkQXQ6IG51bWJlcjsgYXR0ZW1wdHM6IG51bWJlcjsgaXNSZWNvbm5lY3Q6IGJvb2xlYW4gfTsgYXR0ZW1wdE51bWJlcjogbnVtYmVyOyBhdHRlbXB0U3RhcnQ6IG51bWJlcjsgaXNSZWNvbm5lY3Q6IGJvb2xlYW4gfSB7XG5cdFx0bGV0IHNlc3Npb24gPSB0aGlzLl9jb25uZWN0U2Vzc2lvbnMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0c2Vzc2lvbiA9IHsgc3RhcnRlZEF0OiBEYXRlLm5vdygpLCBhdHRlbXB0czogMCwgaXNSZWNvbm5lY3Q6IGZhbHNlIH07XG5cdFx0XHR0aGlzLl9jb25uZWN0U2Vzc2lvbnMuc2V0KGFkZHJlc3MsIHNlc3Npb24pO1xuXHRcdH1cblx0XHRzZXNzaW9uLmF0dGVtcHRzKys7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbiwgYXR0ZW1wdE51bWJlcjogc2Vzc2lvbi5hdHRlbXB0cywgYXR0ZW1wdFN0YXJ0OiBEYXRlLm5vdygpLCBpc1JlY29ubmVjdDogc2Vzc2lvbi5pc1JlY29ubmVjdCB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmFsaXplIHRoZSB0ZWxlbWV0cnkgZm9yIGEgc2luZ2xlIGNvbm5lY3QgYXR0ZW1wdC4gT24gc3VjY2VzcywgYWxzb1xuXHQgKiBjbGVhcnMgYmFja29mZiBzdGF0ZSBhbmQgY2xvc2VzIHRoZSBzZXNzaW9uOyBvbiBmYWlsdXJlLCBvbmx5IHRoZVxuXHQgKiBwZXItYXR0ZW1wdCBldmVudCBpcyBlbWl0dGVkICh0aGUgY2FsbGVyIGRlY2lkZXMgd2hldGhlciB0byByZXRyeSkuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5pc2hDb25uZWN0QXR0ZW1wdChhZGRyZXNzOiBzdHJpbmcsIGFyZ3M6IHtcblx0XHRzdWNjZXNzOiBib29sZWFuO1xuXHRcdGF0dGVtcHROdW1iZXI6IG51bWJlcjtcblx0XHRhdHRlbXB0U3RhcnQ6IG51bWJlcjtcblx0XHRzZXNzaW9uOiB7IHN0YXJ0ZWRBdDogbnVtYmVyOyBhdHRlbXB0czogbnVtYmVyOyBpc1JlY29ubmVjdDogYm9vbGVhbiB9O1xuXHRcdGlzUmVjb25uZWN0OiBib29sZWFuO1xuXHRcdGVycm9yPzogdW5rbm93bjtcblx0fSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgc3VjY2VzcywgYXR0ZW1wdE51bWJlciwgYXR0ZW1wdFN0YXJ0LCBzZXNzaW9uLCBpc1JlY29ubmVjdCwgZXJyb3IgfSA9IGFyZ3M7XG5cdFx0Y29uc3QgZHVyYXRpb25NcyA9IERhdGUubm93KCkgLSBhdHRlbXB0U3RhcnQ7XG5cdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdGxvZ1R1bm5lbENvbm5lY3RBdHRlbXB0KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHsgaXNSZWNvbm5lY3QsIGF0dGVtcHQ6IGF0dGVtcHROdW1iZXIsIGR1cmF0aW9uTXMsIHN1Y2Nlc3M6IHRydWUgfSk7XG5cdFx0XHRsb2dUdW5uZWxDb25uZWN0UmVzb2x2ZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgeyBpc1JlY29ubmVjdCwgdG90YWxBdHRlbXB0czogYXR0ZW1wdE51bWJlciwgdG90YWxEdXJhdGlvbk1zOiBEYXRlLm5vdygpIC0gc2Vzc2lvbi5zdGFydGVkQXQsIHN1Y2Nlc3M6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9jb25uZWN0U2Vzc2lvbnMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dUdW5uZWxDb25uZWN0QXR0ZW1wdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7IGlzUmVjb25uZWN0LCBhdHRlbXB0OiBhdHRlbXB0TnVtYmVyLCBkdXJhdGlvbk1zLCBzdWNjZXNzOiBmYWxzZSwgZXJyb3JDYXRlZ29yeTogdGhpcy5fY2F0ZWdvcml6ZUVycm9yKGVycm9yKSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYXRlZ29yaXplRXJyb3IoZXJyOiB1bmtub3duKTogVHVubmVsQ29ubmVjdEVycm9yQ2F0ZWdvcnkge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0Ly8gRXhwaXJlZCAvIGludmFsaWQgY3JlZGVudGlhbCBcdTIwMTQgY2FsbGVycyBzaG9ydC1jaXJjdWl0IHRoaXMgY2F0ZWdvcnlcblx0XHQvLyB0byBhdm9pZCBidXJuaW5nIHJldHJ5IGJ1ZGdldCBvbiBhIHRva2VuIHRoZSB1c2VyIGhhcyB0byByZWZyZXNoLlxuXHRcdGlmICgvXFxiKDQwMXw0MDMpXFxifHRva2VuLipleHBpcmVkfGV4cGlyZWQuKnRva2VufGludmFsaWRbXyAtXT9ncmFudC9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiAnYXV0aEV4cGlyZWQnO1xuXHRcdH1cblx0XHQvLyBNYXRjaCBhdXRoZW50aWNhdGlvbi1zcGVjaWZpYyBsYW5ndWFnZSBidXQgTk9UIFwiY29ubmVjdGlvbiB0b2tlblwiXG5cdFx0Ly8gb3Igb3RoZXIgcHJvdG9jb2wgdXNlcyBvZiB0aGUgd29yZCBcInRva2VuXCIuXG5cdFx0aWYgKC9hdXRoZW50aWNhdHx1bmF1dGhvcml6fGF1dGguKihmYWlsfGVycm9yfGludmFsaWQpL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0cmV0dXJuICdhdXRoJztcblx0XHR9XG5cdFx0aWYgKC9XZWJTb2NrZXQgcmVsYXkgY29ubmVjdGlvbiBmYWlsZWR8ZmFpbGVkIHRvIGNvbm5lY3QgdG8gcmVsYXkvaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0XHRyZXR1cm4gJ3JlbGF5Q29ubmVjdGlvbkZhaWxlZCc7XG5cdFx0fVxuXHRcdGlmICgvbmV0d29ya3xmZXRjaHxvZmZsaW5lfEVDT05OfEVOT1RGT1VORHxFVElNRURPVVQvaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0XHRyZXR1cm4gJ25ldHdvcmsnO1xuXHRcdH1cblx0XHRyZXR1cm4gJ290aGVyJztcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnZva2VkIG9uIGBvbmxpbmVgIC8gYHZpc2liaWxpdHljaGFuZ2VcdTIxOTJ2aXNpYmxlYC4gS2lja3Mgb2ZmIGFuXG5cdCAqIGltbWVkaWF0ZSBhdHRlbXB0IGZvciBhbnkgZGlzY29ubmVjdGVkIGNhY2hlZCB0dW5uZWwuXG5cdCAqXG5cdCAqIFJhdGUtbGltaXRlZDogYXQgbW9zdCBvbmUgcmVzdW1lIHBlciBSRVNVTUVfUkFURV9MSU1JVF9NUyBzbyB0aGF0XG5cdCAqIHJhcGlkIHRhYiB0b2dnbGluZyBjYW4ndCBoYW1tZXIgYSBwZXJtYW5lbnRseSBicm9rZW4gZW5kcG9pbnQgd2l0aFxuXHQgKiBhbiB1bmJvdW5kZWQgbnVtYmVyIG9mIGF0dGVtcHQgYnVyc3RzLiBSZXN1bWVzIHRoZSBub3JtYWwgYmFja29mZlxuXHQgKiBzZXF1ZW5jZSAoYnkgY2xlYXJpbmcgdGhlIHBhdXNlIGZsYWcpIHJhdGhlciB0aGFuIHplcm9pbmcgdGhlXG5cdCAqIGF0dGVtcHQgY291bnRlci5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3VtZVJlY29ubmVjdHModHJpZ2dlcjogJ3dha2UnIHwgJ3Zpc2libGUnIHwgJ3Nlc3Npb25BZGRlZCcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJhdGUtbGltaXQgcmFwaWQgd2FrZS92aXNpYmlsaXR5IGV2ZW50cyAoZS5nLiBhbHQtdGFiIGJ1cnN0cyBvclxuXHRcdC8vIGZsYWt5IFdpLUZpIHRvZ2dsaW5nIG9ubGluZS9vZmZsaW5lKSBzbyB3ZSBkb24ndCBoYW1tZXIgdGhlIHJlbGF5XG5cdFx0Ly8gd2l0aCBpbW1lZGlhdGUgcmV0cmllcy4gVGhpcyBpcyBhbiBldmVudC1zbW9vdGhpbmcgZ2F0ZSwgbm90IGFuXG5cdFx0Ly8gZXJyb3ItYmFja29mZiBcdTIwMTQgdGhhdCdzIGhhbmRsZWQgYnkgYF9zY2hlZHVsZVJlY29ubmVjdGAuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRpZiAobm93IC0gdGhpcy5fbGFzdFJlc3VtZUF0IDwgUkVTVU1FX1JBVEVfTElNSVRfTVMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFJlc3VtZUF0ID0gbm93O1xuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fZ2V0UHJvdmlkZXJUdW5uZWxzKCk7XG5cdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgY2FjaGVkKSB7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsLnR1bm5lbElkfWA7XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpdmUgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGxpdmUgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChsaXZlLnN0YXR1cykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbEFnZW50SG9zdF0gUmVzdW1pbmcgcmVjb25uZWN0IGZvciAke2FkZHJlc3N9ICh0cmlnZ2VyOiAke3RyaWdnZXJ9KWApO1xuXHRcdFx0Ly8gSWYgd2Ugd2VyZSBwYXVzZWQgKGV4aGF1c3RlZCB0aGUgYmFja29mZiBidWRnZXQpLCBnaXZlIGEgZnJlc2hcblx0XHRcdC8vIGJ1ZGdldCBzaW5jZSB0aGUgd2FrZSBldmVudCBpcyBpdHNlbGYgZXZpZGVuY2UgdGhlIGVudmlyb25tZW50XG5cdFx0XHQvLyBoYXMgY2hhbmdlZC4gT3RoZXJ3aXNlIGtlZXAgdGhlIGN1cnJlbnQgYXR0ZW1wdCBjb3VudGVyIHNvIGFuXG5cdFx0XHQvLyBpbi1wcm9ncmVzcyBiYWNrb2ZmIGlzbid0IHNob3J0LWNpcmN1aXRlZC5cblx0XHRcdGlmICh0aGlzLl9yZWNvbm5lY3RQYXVzZWQuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIC8qaW1tZWRpYXRlKi8gdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERyb3AgcmVjb25uZWN0IHN0YXRlIGZvciBhZGRyZXNzZXMgd2hvc2UgdHVubmVsIGlzIG5vIGxvbmdlciBjYWNoZWQuICovXG5cdHByaXZhdGUgX3BydW5lUmVjb25uZWN0U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkQWRkcmVzc2VzID0gbmV3IFNldCh0aGlzLl9nZXRQcm92aWRlclR1bm5lbHMoKS5tYXAodCA9PiBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0LnR1bm5lbElkfWApKTtcblx0XHRjb25zdCB0cmFja2VkID0gbmV3IFNldDxzdHJpbmc+KFtcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmtleXMoKSxcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmtleXMoKSxcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdFBhdXNlZCxcblx0XHRcdC4uLnRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5rZXlzKCksXG5cdFx0XSk7XG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIHRyYWNrZWQpIHtcblx0XHRcdGlmICghY2FjaGVkQWRkcmVzc2VzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9yZXNldFJlY29ubmVjdFN0YXRlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFNpbGVudCBzdGF0dXMgY2hlY2sgLS1cblxuXHRwcml2YXRlIGFzeW5jIF9zaWxlbnRTdGF0dXNDaGVjayh0cmlnZ2VyPzogVHVubmVsRGlzY292ZXJ5VHJpZ2dlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkVHJpZ2dlcjogVHVubmVsRGlzY292ZXJ5VHJpZ2dlciA9IHRyaWdnZXIgPz8gKHRoaXMuX2luaXRpYWxTdGF0dXNDaGVja2VkID8gJ3JlZGlzY292ZXInIDogJ3N0YXJ0dXAnKTtcblx0XHRjb25zdCBob3N0c0VuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCk7XG5cdFx0Y29uc3QgYXV0b0Nvbm5lY3RFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQpO1xuXHRcdGlmICghaG9zdHNFbmFibGVkKSB7XG5cdFx0XHR0aGlzLl9pbml0aWFsU3RhdHVzQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTtcblx0XHRcdGxvZ1R1bm5lbERpc2NvdmVyeVJlc3VsdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHJlc29sdmVkVHJpZ2dlcixcblx0XHRcdFx0dG90YWxGb3VuZDogMCxcblx0XHRcdFx0d2l0aEFjdGl2ZUhvc3Q6IDAsXG5cdFx0XHRcdGNhY2hlZEJlZm9yZTogdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkubGVuZ3RoLFxuXHRcdFx0XHRhdXRvQ29ubmVjdEVuYWJsZWQsXG5cdFx0XHRcdGhvc3RzRW5hYmxlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RTdGF0dXNDaGVjayA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgY2FjaGVkQmVmb3JlID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkubGVuZ3RoO1xuXG5cdFx0Ly8gRmV0Y2ggdHVubmVsIGxpc3Qgc2lsZW50bHkgdG8gY2hlY2sgb25saW5lIHN0YXR1c1xuXHRcdGxldCBvbmxpbmVUdW5uZWxzOiBJVHVubmVsSW5mb1tdIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRvbmxpbmVUdW5uZWxzID0gYXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5saXN0VHVubmVscyh7IHNpbGVudDogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE5vIGNhY2hlZCB0b2tlbiBvciBuZXR3b3JrIGVycm9yIFx1MjAxNCBsZWF2ZSBzdGF0dXNlcyBhcy1pc1xuXHRcdFx0dGhpcy5faW5pdGlhbFN0YXR1c0NoZWNrZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHRsb2dUdW5uZWxEaXNjb3ZlcnlSZXN1bHQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHR0cmlnZ2VyOiByZXNvbHZlZFRyaWdnZXIsXG5cdFx0XHRcdHRvdGFsRm91bmQ6IDAsXG5cdFx0XHRcdHdpdGhBY3RpdmVIb3N0OiAwLFxuXHRcdFx0XHRjYWNoZWRCZWZvcmUsXG5cdFx0XHRcdGF1dG9Db25uZWN0RW5hYmxlZCxcblx0XHRcdFx0aG9zdHNFbmFibGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3R1bm5lbFNlcnZpY2UuZ2V0Q2FjaGVkVHVubmVscygpO1xuXHRcdGlmIChvbmxpbmVUdW5uZWxzKSB7XG5cdFx0XHRjb25zdCBvbmxpbmVJZHMgPSBuZXcgU2V0KG9ubGluZVR1bm5lbHMubWFwKHQgPT4gdC50dW5uZWxJZCkpO1xuXHRcdFx0Ly8gUmVtb3ZlIGNhY2hlZCB0dW5uZWxzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IG9uIHRoZSBhY2NvdW50XG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiBjYWNoZWQpIHtcblx0XHRcdFx0aWYgKCFvbmxpbmVJZHMuaGFzKHR1bm5lbC50dW5uZWxJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLnJlbW92ZUNhY2hlZFR1bm5lbCh0dW5uZWwudHVubmVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF1dG8tY2FjaGUgZXZlcnkgZGlzY292ZXJlZCB0dW5uZWwgdGhhdCBpc24ndCBjYWNoZWQgeWV0IHNvXG5cdFx0XHQvLyBpdCBhcHBlYXJzIGluIHRoZSBwaWNrZXIgb24gZmlyc3QgZGlzY292ZXJ5IChlLmcuIGZyZXNoIHdlYlxuXHRcdFx0Ly8gc2Vzc2lvbiksIGluY2x1ZGluZyB0dW5uZWxzIHdob3NlIGhvc3QgcHJvY2VzcyBpcyBjdXJyZW50bHlcblx0XHRcdC8vIG9mZmxpbmUgXHUyMDE0IHRob3NlIHJlbmRlciBncmF5ZWQtb3V0IHZpYSB0aGUgc3RhdHVzLXVwZGF0ZSBsb29wXG5cdFx0XHQvLyBiZWxvdy4gUGFzcyAnZ2l0aHViJyBhcyBhdXRoUHJvdmlkZXIgc28gX2hhbmRsZVNlc3Npb25zQ2hhbmdlXG5cdFx0XHQvLyBjYW4gbWF0Y2ggdGhlc2UgdHVubmVscyBmb3IgdGVhcmRvd24gb24gc2Vzc2lvbiByZW1vdmFsLlxuXHRcdFx0Y29uc3QgY2FjaGVkSWRzID0gbmV3IFNldChjYWNoZWQubWFwKHQgPT4gdC50dW5uZWxJZCkpO1xuXHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2Ygb25saW5lVHVubmVscykge1xuXHRcdFx0XHRpZiAoIWNhY2hlZElkcy5oYXModHVubmVsLnR1bm5lbElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3R1bm5lbFNlcnZpY2UuY2FjaGVUdW5uZWwodHVubmVsLCAnZ2l0aHViJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIG9ubGluZS9vZmZsaW5lIHN0YXR1cyBiYXNlZCBvbiBob3N0Q29ubmVjdGlvbkNvdW50LlxuXHRcdFx0Ly8gRm9yIHR1bm5lbHMsIENvbm5lY3RlZCBtZWFucyBcImhvc3QgaXMgb25saW5lXCIgKGNsaWNrYWJsZSB0byBjb25uZWN0KSxcblx0XHRcdC8vIERpc2Nvbm5lY3RlZCBtZWFucyBcImhvc3QgaXMgb2ZmbGluZVwiLiBBY3R1YWwgcmVsYXkgY29ubmVjdGlvblxuXHRcdFx0Ly8gZXN0YWJsaXNobWVudCBoYXBwZW5zIHdoZW4gdGhlIHVzZXIgY2xpY2tzIHRoZSB0dW5uZWwgKG9yIHZpYVxuXHRcdFx0Ly8gYXV0by1jb25uZWN0IGJlbG93IHdoZW4gZW5hYmxlZCkuXG5cdFx0XHRjb25zdCBvbmxpbmVUdW5uZWxNYXAgPSBuZXcgTWFwKG9ubGluZVR1bm5lbHMubWFwKHQgPT4gW3QudHVubmVsSWQsIHRdKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdFx0Ly8gU2tpcCB0dW5uZWxzIHRoYXQgYWxyZWFkeSBoYXZlIGFuIGFjdGl2ZSByZWxheSBjb25uZWN0aW9uXG5cdFx0XHRcdGNvbnN0IGhhc0Nvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLnNvbWUoXG5cdFx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cylcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKGhhc0Nvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHR1bm5lbElkID0gYWRkcmVzcy5zbGljZShUVU5ORUxfQUREUkVTU19QUkVGSVgubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IG9ubGluZVR1bm5lbE1hcC5nZXQodHVubmVsSWQpO1xuXHRcdFx0XHRpZiAoaW5mbyAmJiBpbmZvLmhvc3RDb25uZWN0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCk7XG5cblx0XHRcdFx0XHQvLyBJZiB3ZSBwYXVzZWQgcmVjb25uZWN0cyBiZWNhdXNlIHRoZSBob3N0IGhhZCBnb25lXG5cdFx0XHRcdFx0Ly8gb2ZmbGluZSwgdGhlIHN0YXR1cyBjaGVjayBpcyBvdXIgY3VlIHRvIHJlc3VtZSBcdTIwMTRcblx0XHRcdFx0XHQvLyBkb24ndCB3YWl0IGZvciBhIHdha2UvdmlzaWJpbGl0eSBldmVudC4gQ292ZXJzIHRoZVxuXHRcdFx0XHRcdC8vIGNvbW1vbiBcIm15IGxhcHRvcCBjYW1lIGJhY2ssIHRoZSByZW1vdGUgaG9zdCBjYW1lXG5cdFx0XHRcdFx0Ly8gYmFjayBmaXJzdFwiIHNjZW5hcmlvIGRldGVybWluaXN0aWNhbGx5LlxuXHRcdFx0XHRcdGlmICh0aGlzLl9ob3N0T2ZmbGluZVBhdXNlZC5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdFx0XHRcdFx0YFtUdW5uZWxBZ2VudEhvc3RdIEhvc3QgY2FtZSBiYWNrIG9ubGluZSBmb3IgJHthZGRyZXNzfTsgYXV0by1yZXN1bWluZyByZWNvbm5lY3QuYFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIC8qaW1tZWRpYXRlKi8gdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRcdC8vIEhvc3QgaXMgbm90IG9ubGluZSBcdTIwMTQgZHJvcCBhbnkgY2FjaGVkIHNlc3Npb25zIHdlIHdlcmVcblx0XHRcdFx0XHQvLyBzaG93aW5nIGZvciBpdCBzbyB0aGUgVUkgZG9lc24ndCBsaXN0IHN0YWxlIGVudHJpZXMuXG5cdFx0XHRcdFx0cHJvdmlkZXIudW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXRvLWNvbm5lY3Qgb25saW5lIHR1bm5lbHMgdGhhdCBhcmVuJ3QgY29ubmVjdGVkIHlldCB3aGVuIHRoZVxuXHRcdFx0Ly8gdXNlciBoYXMgb3B0ZWQgaW50byBhdXRvLWNvbm5lY3QgKGRlZmF1bHQgb24pLiBUaGlzIG1pcnJvcnMgdGhlXG5cdFx0XHQvLyB3ZWIgZW1iZWRkZXIgYmVoYXZpb3VyIHdoZXJlIG5vIHdvcmtzcGFjZSBwaWNrZXIgaXMgYXZhaWxhYmxlXG5cdFx0XHQvLyB0byB0cmlnZ2VyIG1hbnVhbCBjb25uZWN0aW9uLlxuXHRcdFx0Y29uc3QgYXV0b0Nvbm5lY3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCk7XG5cdFx0XHRpZiAoYXV0b0Nvbm5lY3QpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2Ygb25saW5lVHVubmVscykge1xuXHRcdFx0XHRcdGlmICh0dW5uZWwuaG9zdENvbm5lY3Rpb25Db3VudCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWwudHVubmVsSWR9YDtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl90dW5uZWxTZXJ2aWNlLmlzQXV0b0Nvbm5lY3RTdXBwcmVzc2VkKHR1bm5lbC50dW5uZWxJZCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBhbHJlYWR5Q29ubmVjdGVkID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5zb21lKFxuXHRcdFx0XHRcdFx0XHRjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGlmICghYWxyZWFkeUNvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25uZWN0VHVubmVsKGFkZHJlc3MsIHsgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5pdGlhbFN0YXR1c0NoZWNrZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3VwZGF0ZUNvbm5lY3Rpb25TdGF0dXNlcygpO1xuXG5cdFx0Y29uc3QgdG90YWxGb3VuZCA9IG9ubGluZVR1bm5lbHM/Lmxlbmd0aCA/PyAwO1xuXHRcdGNvbnN0IHdpdGhBY3RpdmVIb3N0ID0gb25saW5lVHVubmVscz8uZmlsdGVyKHQgPT4gdC5ob3N0Q29ubmVjdGlvbkNvdW50ID4gMCkubGVuZ3RoID8/IDA7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0YFtUdW5uZWxBZ2VudEhvc3RdIFNpbGVudCBzdGF0dXMgY2hlY2sgKCR7cmVzb2x2ZWRUcmlnZ2VyfSk6IHRvdGFsRm91bmQ9JHt0b3RhbEZvdW5kfSwgd2l0aEFjdGl2ZUhvc3Q9JHt3aXRoQWN0aXZlSG9zdH0sIGNhY2hlZEJlZm9yZT0ke2NhY2hlZEJlZm9yZX0sIGF1dG9Db25uZWN0PSR7YXV0b0Nvbm5lY3RFbmFibGVkfWBcblx0XHQpO1xuXHRcdGxvZ1R1bm5lbERpc2NvdmVyeVJlc3VsdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0cmlnZ2VyOiByZXNvbHZlZFRyaWdnZXIsXG5cdFx0XHR0b3RhbEZvdW5kLFxuXHRcdFx0d2l0aEFjdGl2ZUhvc3QsXG5cdFx0XHRjYWNoZWRCZWZvcmUsXG5cdFx0XHRhdXRvQ29ubmVjdEVuYWJsZWQsXG5cdFx0XHRob3N0c0VuYWJsZWQsXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihUdW5uZWxBZ2VudEhvc3RDb250cmlidXRpb24uSUQsIFR1bm5lbEFnZW50SG9zdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QixxQ0FBcUMsaUNBQWlDLHdDQUF3QztBQUNoSixTQUFTLHlCQUF5Qiw2QkFBK0M7QUFDakYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBNEMsOEJBQThCO0FBQzFFLFNBQVMseUJBQXlCLDBCQUEwQixnQ0FBZ0g7QUFDNUssU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx5Q0FBeUM7QUFHbEQsTUFBTSx3QkFBd0IsSUFBSSxLQUFLO0FBR3ZDLE1BQU0sMEJBQTBCO0FBRWhDLE1BQU0sc0JBQXNCO0FBTTVCLE1BQU0seUJBQXlCO0FBRy9CLE1BQU0sdUJBQXVCO0FBRXRCLElBQU0sOEJBQU4sY0FBMEMsV0FBNkM7QUFBQSxFQW1DN0YsWUFDMkMsZ0JBQ0EseUJBQ0UsMkJBQ0osdUJBQ0EsdUJBQ0Qsc0JBQ1QsYUFDVyx3QkFDTCxtQkFDWCx3QkFDeEI7QUFDRCxVQUFNO0FBWG9DO0FBQ0E7QUFDRTtBQUNKO0FBQ0E7QUFDRDtBQUNUO0FBQ1c7QUFDTDtBQXhDckMsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGNBQXFELENBQUM7QUFDNUcsU0FBaUIscUJBQXFCLG9CQUFJLElBQTZDO0FBQ3ZG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
