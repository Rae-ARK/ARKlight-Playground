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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import {
  CLOUD_SANDBOX_AGENT_PROVIDER,
  CLOUD_SANDBOX_SESSION_SCHEME,
  CloudSandboxEnabledSettingId,
  CloudSandboxEnvironmentOfflineError,
  cloudSandboxAddress,
  ICloudSandboxAgentHostService,
  ICloudSandboxCredentialsService
} from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { AgentSession } from "../../../../../platform/agentHost/common/agentService.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { ChatSessionsExtensions } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { IRemoteAgentHostConnectionCustomizationService } from "./remoteAgentHostConnectionCustomization.js";
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from "./cloudSandboxConnectionCustomization.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
const LOG_PREFIX = "[CloudSandboxAgentHost]";
const SANDBOX_SESSION_SCHEME_ALIAS = {
  ui: CLOUD_SANDBOX_AGENT_PROVIDER,
  backend: CLOUD_SANDBOX_SESSION_SCHEME
};
let CloudSandboxAgentHostContribution = class extends Disposable {
  constructor(_cloudSandboxService, _credentialsService, _remoteAgentHostService, _connectionCustomizations, _sessionsProvidersService, _agentHostFilterService, _configurationService, _authenticationService, _instantiationService, _notificationService, _logService) {
    super();
    this._cloudSandboxService = _cloudSandboxService;
    this._credentialsService = _credentialsService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._connectionCustomizations = _connectionCustomizations;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._agentHostFilterService = _agentHostFilterService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    /** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
    this._providerInstances = /* @__PURE__ */ new Map();
    this._providerStores = this._register(new DisposableMap());
    /** Environment metadata keyed by connection address, for on-demand reconnect. */
    this._environments = /* @__PURE__ */ new Map();
    /** In-flight connects keyed by address, so concurrent opens share one attempt. */
    this._pendingConnects = /* @__PURE__ */ new Map();
    /**
     * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
     * discovery and connects abort instead of committing state after teardown has run.
     */
    this._enabledCts = new CancellationTokenSource();
    /** Whether discovery has completed at least once, used to stop the auth-driven retry. */
    this._hasDiscovered = false;
    this._register(this._connectionCustomizations.register(
      isCloudSandboxConnectionAddress,
      (address) => createCloudSandboxConnectionCustomization(address, this._cloudSandboxService)
    ));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._wireConnections();
      this._updateConnectionStatuses();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CloudSandboxEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        if (this._isEnabled()) {
          void this._discoverAndSeed();
        } else {
          this._teardownAll();
        }
      }
    }));
    this._register(this._agentHostFilterService.registerDiscoveryHandler(() => this._discoverAndSeed()));
    void this._discoverAndSeed();
    const retryUntilFirstSuccess = this._register(new DisposableStore());
    const retry = () => {
      if (this._hasDiscovered) {
        retryUntilFirstSuccess.clear();
        return;
      }
      void this._discoverAndSeed();
    };
    retryUntilFirstSuccess.add(this._authenticationService.onDidChangeSessions(retry));
    retryUntilFirstSuccess.add(this._authenticationService.onDidRegisterAuthenticationProvider(retry));
    this._register(toDisposable(() => {
      this._enabledCts.cancel();
      this._enabledCts.dispose();
    }));
    this._register(Registry.as(ChatSessionsExtensions.AsyncActivation).register({
      matchSessionType: (sessionType) => this._findAddressForSessionType(sessionType) !== void 0,
      waitForActivation: (_accessor, sessionType) => this._waitForActivation(sessionType)
    }));
  }
  /**
   * Discover environment-bound sandbox sessions and seed them into per-environment providers so
   * they appear in the sessions list **without** connecting. Reconciles against the result:
   * environments that have vanished from discovery (e.g. their task was archived) and are not
   * currently connected are torn down, so stale providers/sessions don't linger. Best-effort:
   * a failed discovery is logged and leaves existing state untouched.
   *
   * Runs are serialized, with at most one follow-up queued, so overlapping triggers can't
   * interleave their reconciliation passes.
   */
  _discoverAndSeed() {
    if (this._discoveryInFlight) {
      this._discoveryQueued ??= this._discoveryInFlight.then(() => {
        this._discoveryQueued = void 0;
        return this._discoverAndSeed();
      });
      return this._discoveryQueued;
    }
    this._discoveryInFlight = this._doDiscoverAndSeed().finally(() => {
      this._discoveryInFlight = void 0;
    });
    return this._discoveryInFlight;
  }
  async _doDiscoverAndSeed() {
    if (!this._isEnabled()) {
      return;
    }
    const token = this._enabledCts.token;
    let result;
    try {
      result = await this._credentialsService.listSessions(token);
    } catch (error) {
      result = { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    if (result.kind === "failed") {
      this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
      return;
    }
    if (token.isCancellationRequested || !this._isEnabled()) {
      return;
    }
    this._hasDiscovered = true;
    const present = /* @__PURE__ */ new Set();
    for (const session of result.sessions) {
      if (!session.environmentId || !session.sessionId) {
        continue;
      }
      const address = cloudSandboxAddress(session.environmentId);
      present.add(address);
      this._ensureProvider({ environmentId: session.environmentId, sessionId: session.sessionId, name: session.name });
      const provider = this._providerInstances.get(address);
      const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
      const modifiedTime = Number.isNaN(parsed) ? Date.now() : parsed;
      const meta = {
        // Seed under the agent-provider (UI) scheme, preserving the session id. Mission Control
        // issues each session as `ahp-session:/<id>` (the id it also returns here), and the
        // Copilot host lists that same id back, so the seed reconciles deterministically with
        // the live `listSessions()` result on connect. See copilot-host session-identity docs.
        session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, session.sessionId),
        startTime: modifiedTime,
        modifiedTime,
        summary: session.name
      };
      provider?.seedSessions([meta]);
    }
    if (result.kind === "complete") {
      for (const address of [...this._environments.keys()]) {
        if (present.has(address)) {
          continue;
        }
        const connected = this._remoteAgentHostService.connections.some((c) => c.address === address);
        if (!connected) {
          this._teardownEnvironment(address);
        }
      }
    }
    this._logService.info(`${LOG_PREFIX} Seeded ${present.size} discovered sandbox environment(s)${result.kind === "partial" ? " (partial scan; kept existing entries)" : ""}.`);
  }
  /**
   * Remove the connection (and its credential refresher) for an environment while keeping the
   * provider and its cached sessions visible in a disconnected state. Disposing the protocol
   * client stops the soft-reconnect loop; the {@link CloudSandboxAgentHostService} prunes the
   * refresher via `onDidChangeConnections`.
   */
  async _disconnectEnvironment(address) {
    try {
      await this._remoteAgentHostService.removeRemoteAgentHost(address);
    } catch (error) {
      this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
   * remove its connection + credential refresher. Used when an environment vanishes from discovery
   * or the feature is disabled.
   */
  _teardownEnvironment(address) {
    this._environments.delete(address);
    this._pendingConnects.delete(address);
    this._providerStores.deleteAndDispose(address);
    void this._disconnectEnvironment(address);
  }
  /** Tear down every known sandbox environment (feature disabled). */
  _teardownAll() {
    this._enabledCts.cancel();
    this._enabledCts.dispose();
    this._enabledCts = new CancellationTokenSource();
    for (const address of [...this._environments.keys()]) {
      this._teardownEnvironment(address);
    }
  }
  /** Map each known sandbox connection authority to its address (`cloudsandbox:<envId>`). */
  _authoritiesByAddress() {
    const byAuthority = /* @__PURE__ */ new Map();
    for (const address of this._environments.keys()) {
      byAuthority.set(agentHostAuthority(address), address);
    }
    return byAuthority;
  }
  /** Resolve the sandbox address owning a remote-agent-host session type, if any. */
  _findAddressForSessionType(sessionType) {
    const byAuthority = this._authoritiesByAddress();
    const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, byAuthority.keys());
    return authority ? byAuthority.get(authority) : void 0;
  }
  /**
   * Async-activation hook for a sandbox session type: establish the relay connection on demand,
   * then resolve once the host advertises the agent backing this session type (its content
   * provider is registered), so the chat can load. Returns false if the environment is unknown,
   * the connection fails, or the agent never appears.
   */
  async _waitForActivation(sessionType) {
    const address = this._findAddressForSessionType(sessionType);
    const env = address ? this._environments.get(address) : void 0;
    if (!address || !env) {
      return false;
    }
    try {
      await this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name });
    } catch (error) {
      this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof CloudSandboxEnvironmentOfflineError) {
        this._notificationService.warn(error.message);
      }
      return false;
    }
    const authority = agentHostAuthority(address);
    while (true) {
      const connection = this._remoteAgentHostService.getConnection(address);
      if (!connection) {
        return false;
      }
      const rootState = connection.rootState.value;
      if (rootState instanceof Error) {
        return false;
      }
      if (rootState) {
        return rootState.agents.some((agent) => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
      }
      await Event.toPromise(connection.rootState.onDidChange);
    }
  }
  /**
   * Ensure a provider exists for the environment and establish (or reuse) the
   * connection. Resolves with the connection's display address.
   */
  async connect(options) {
    if (!this._isEnabled()) {
      throw new Error("Copilot cloud sandbox connections are not enabled.");
    }
    const address = cloudSandboxAddress(options.environmentId);
    this._ensureProvider({ environmentId: options.environmentId, sessionId: options.sessionId, name: options.name });
    const pending = this._pendingConnects.get(address);
    if (pending) {
      return pending;
    }
    const token = this._enabledCts.token;
    const attempt = (async () => {
      try {
        this._providerInstances.get(address)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
        const result = await this._cloudSandboxService.connect(options, token);
        if (token.isCancellationRequested || !this._isEnabled()) {
          void this._disconnectEnvironment(address);
          throw new CancellationError();
        }
        this._wireConnections();
        return result;
      } finally {
        this._pendingConnects.delete(address);
      }
    })();
    this._pendingConnects.set(address, attempt);
    return attempt;
  }
  _isEnabled() {
    return this._configurationService.getValue(CloudSandboxEnabledSettingId) && this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
  }
  /** Create the sessions provider for an environment if it doesn't exist yet. */
  _ensureProvider(env) {
    const address = cloudSandboxAddress(env.environmentId);
    this._environments.set(address, env);
    if (this._providerStores.has(address)) {
      return;
    }
    const store = new DisposableStore();
    const provider = this._instantiationService.createInstance(
      RemoteAgentHostSessionsProvider,
      {
        address,
        name: env.name,
        connectOnDemand: () => this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(() => {
        }),
        sessionSchemeAlias: SANDBOX_SESSION_SCHEME_ALIAS
      }
    );
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => this._providerInstances.delete(address)));
    this._providerStores.set(address, store);
    this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
  }
  /** Wire each live connection to its provider so session enumeration runs. */
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
  /** Push the service's authoritative connection status onto each provider. */
  _updateConnectionStatuses() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
      } else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
};
CloudSandboxAgentHostContribution.ID = "workbench.contrib.cloudSandboxAgentHost";
CloudSandboxAgentHostContribution = __decorateClass([
  __decorateParam(0, ICloudSandboxAgentHostService),
  __decorateParam(1, ICloudSandboxCredentialsService),
  __decorateParam(2, IRemoteAgentHostService),
  __decorateParam(3, IRemoteAgentHostConnectionCustomizationService),
  __decorateParam(4, ISessionsProvidersService),
  __decorateParam(5, IAgentHostFilterService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAuthenticationService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, ILogService)
], CloudSandboxAgentHostContribution);
export {
  CloudSandboxAgentHostContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL2Nsb3VkU2FuZGJveEFnZW50SG9zdENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIFN1cmZhY2VzIENvcGlsb3QgY2xvdWQgc2FuZGJveCAoY29waWxvdC1kZXZlbG9wZXItY2xpKSBzZXNzaW9ucyBhcyBuYXRpdmUgYWdlbnQtaG9zdCBzZXNzaW9ucy5cbi8vIE93bnMgYSBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHBlciBzYW5kYm94IGVudmlyb25tZW50LCBjb25uZWN0cyBvbiBkZW1hbmQgdmlhXG4vLyBDbG91ZFNhbmRib3hBZ2VudEhvc3RTZXJ2aWNlLCBhbmQgd2lyZXMgdGhlIGxpdmUgY29ubmVjdGlvbiB0byB0aGUgcHJvdmlkZXIgc28gdGhlIG5hdGl2ZSBzZXNzaW9uXG4vLyBtYWNoaW5lcnkgY2FuIGVudW1lcmF0ZSBhbmQgcmVuZGVyIHRoZSBob3N0J3Mgc2Vzc2lvbnMuXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHtcblx0Q0xPVURfU0FOREJPWF9BR0VOVF9QUk9WSURFUixcblx0Q0xPVURfU0FOREJPWF9TRVNTSU9OX1NDSEVNRSxcblx0Q2xvdWRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCxcblx0Q2xvdWRTYW5kYm94RW52aXJvbm1lbnRPZmZsaW5lRXJyb3IsXG5cdGNsb3VkU2FuZGJveEFkZHJlc3MsXG5cdElDbG91ZFNhbmRib3hBZ2VudEhvc3RTZXJ2aWNlLFxuXHRJQ2xvdWRTYW5kYm94Q3JlZGVudGlhbHNTZXJ2aWNlLFxuXHR0eXBlIElDbG91ZFNhbmRib3hDb25uZWN0T3B0aW9ucyxcblx0dHlwZSBJQ2xvdWRTYW5kYm94RGlzY292ZXJ5UmVzdWx0LFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2Nsb3VkU2FuZGJveEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIHR5cGUgSUFnZW50U2Vzc2lvbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgZmluZFJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlQXV0aG9yaXR5LCByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uVHlwZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uc0V4dGVuc2lvbnMsIElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdEZpbHRlci9jb21tb24vYWdlbnRIb3N0RmlsdGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvblNjaGVtZUFsaWFzLCBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuL3JlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNsb3VkU2FuZGJveENvbm5lY3Rpb25DdXN0b21pemF0aW9uLCBpc0Nsb3VkU2FuZGJveENvbm5lY3Rpb25BZGRyZXNzIH0gZnJvbSAnLi9jbG91ZFNhbmRib3hDb25uZWN0aW9uQ3VzdG9taXphdGlvbi5qcyc7XG5pbXBvcnQgeyB3YXRjaEZvckluY29tcGF0aWJsZU5vdGlmaWNhdGlvbnMgfSBmcm9tICcuL3JlbW90ZUhvc3RPcHRpb25zLmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbQ2xvdWRTYW5kYm94QWdlbnRIb3N0XSc7XG5cbi8qKlxuICogTWlzc2lvbiBDb250cm9sIGNyZWF0ZXMgZXZlcnkgc2FuZGJveCBzZXNzaW9uIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmAgd2hpbGUgdGhlIGhvc3QgYWR2ZXJ0aXNlcyB0aGVcbiAqIGBjb3BpbG90YCBhZ2VudCwgc28gdGhlIHR3byBzY2hlbWVzIG5hbWUgdGhlIHNhbWUgc2Vzc2lvbi5cbiAqL1xuY29uc3QgU0FOREJPWF9TRVNTSU9OX1NDSEVNRV9BTElBUzogSVNlc3Npb25TY2hlbWVBbGlhcyA9IHtcblx0dWk6IENMT1VEX1NBTkRCT1hfQUdFTlRfUFJPVklERVIsXG5cdGJhY2tlbmQ6IENMT1VEX1NBTkRCT1hfU0VTU0lPTl9TQ0hFTUUsXG59O1xuXG4vKiogQSBkaXNjb3ZlcmVkIHNhbmRib3ggZW52aXJvbm1lbnQgd2UgY2FuIGNyZWF0ZSBhIHByb3ZpZGVyIGZvci4gKi9cbmludGVyZmFjZSBJQ2xvdWRTYW5kYm94RW52aXJvbm1lbnQge1xuXHRyZWFkb25seSBlbnZpcm9ubWVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQ2xvdWRTYW5kYm94QWdlbnRIb3N0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2xvdWRTYW5kYm94QWdlbnRIb3N0JztcblxuXHQvKiogUHJvdmlkZXIgaW5zdGFuY2VzIGtleWVkIGJ5IGNvbm5lY3Rpb24gYWRkcmVzcyAoYGNsb3Vkc2FuZGJveDo8ZW52SWQ+YCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyU3RvcmVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0LyoqIEVudmlyb25tZW50IG1ldGFkYXRhIGtleWVkIGJ5IGNvbm5lY3Rpb24gYWRkcmVzcywgZm9yIG9uLWRlbWFuZCByZWNvbm5lY3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2xvdWRTYW5kYm94RW52aXJvbm1lbnQ+KCk7XG5cdC8qKiBJbi1mbGlnaHQgY29ubmVjdHMga2V5ZWQgYnkgYWRkcmVzcywgc28gY29uY3VycmVudCBvcGVucyBzaGFyZSBvbmUgYXR0ZW1wdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Nvbm5lY3RzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8c3RyaW5nPj4oKTtcblx0LyoqXG5cdCAqIENhbmNlbGxlZCB3aGVuIHRoZSBmZWF0dXJlIGlzIGRpc2FibGVkIChvciB0aGUgY29udHJpYnV0aW9uIGlzIGRpc3Bvc2VkKSwgc28gaW4tZmxpZ2h0XG5cdCAqIGRpc2NvdmVyeSBhbmQgY29ubmVjdHMgYWJvcnQgaW5zdGVhZCBvZiBjb21taXR0aW5nIHN0YXRlIGFmdGVyIHRlYXJkb3duIGhhcyBydW4uXG5cdCAqL1xuXHRwcml2YXRlIF9lbmFibGVkQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdC8qKiBTZXJpYWxpemVzIGRpc2NvdmVyeSBzbyBvdmVybGFwcGluZyB0cmlnZ2VycyBjYW4ndCBpbnRlcmxlYXZlIHJlY29uY2lsaWF0aW9uLiAqL1xuXHRwcml2YXRlIF9kaXNjb3ZlcnlJbkZsaWdodDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzY292ZXJ5UXVldWVkOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciBkaXNjb3ZlcnkgaGFzIGNvbXBsZXRlZCBhdCBsZWFzdCBvbmNlLCB1c2VkIHRvIHN0b3AgdGhlIGF1dGgtZHJpdmVuIHJldHJ5LiAqL1xuXHRwcml2YXRlIF9oYXNEaXNjb3ZlcmVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDbG91ZFNhbmRib3hBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nsb3VkU2FuZGJveFNlcnZpY2U6IElDbG91ZFNhbmRib3hBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ2xvdWRTYW5kYm94Q3JlZGVudGlhbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NyZWRlbnRpYWxzU2VydmljZTogSUNsb3VkU2FuZGJveENyZWRlbnRpYWxzU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkN1c3RvbWl6YXRpb25zOiBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUFnZW50SG9zdEZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0RmlsdGVyU2VydmljZTogSUFnZW50SG9zdEZpbHRlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFN1cHBseSB0aGUgZ2VuZXJpYyByZW1vdGUtYWdlbnQtaG9zdCBjb250cmlidXRpb24gd2l0aCB0aGUgc2FuZGJveCBob3N0J3MgcGVyLWNvbm5lY3Rpb25cblx0XHQvLyBkZXZpYXRpb25zIChzZWFsZWQtdG9rZW4gYXV0aCArIGBhaHAtc2Vzc2lvbmAgYmFja2VuZCBzY2hlbWUpIHdpdGhvdXQgbGVha2luZyBzYW5kYm94XG5cdFx0Ly8gc3BlY2lmaWNzIGludG8gdGhhdCBzaGFyZWQgY29kZSBwYXRoLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Nvbm5lY3Rpb25DdXN0b21pemF0aW9ucy5yZWdpc3Rlcihcblx0XHRcdGlzQ2xvdWRTYW5kYm94Q29ubmVjdGlvbkFkZHJlc3MsXG5cdFx0XHRhZGRyZXNzID0+IGNyZWF0ZUNsb3VkU2FuZGJveENvbm5lY3Rpb25DdXN0b21pemF0aW9uKGFkZHJlc3MsIHRoaXMuX2Nsb3VkU2FuZGJveFNlcnZpY2UpISxcblx0XHQpKTtcblxuXHRcdC8vIEtlZXAgcHJvdmlkZXJzIHdpcmVkIHRvIHRoZWlyIGxpdmUgY29ubmVjdGlvbnMgYW5kIHRoZWlyIHN0YXR1cyBmcmVzaC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fd2lyZUNvbm5lY3Rpb25zKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWFjdCB0byB0aGUgZmVhdHVyZSB0b2dnbGVzIGF0IHJ1bnRpbWU6IChyZSlkaXNjb3ZlciB3aGVuIGVuYWJsZWQsIHRlYXIgZXZlcnl0aGluZyBkb3duXG5cdFx0Ly8gd2hlbiBkaXNhYmxlZCwgc28gZW5hYmxpbmcgdGhlIHNldHRpbmcgZG9lc24ndCByZXF1aXJlIGEgcmVsb2FkIGFuZCBkaXNhYmxpbmcgaXQgZG9lc24ndFxuXHRcdC8vIGxlYXZlIHN0YWxlIHByb3ZpZGVycywgY29ubmVjdGlvbnMsIG9yIGNyZWRlbnRpYWwgcmVmcmVzaGVycyBiZWhpbmQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2xvdWRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLl9kaXNjb3ZlckFuZFNlZWQoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl90ZWFyZG93bkFsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGF6eSBkaXNjb3Zlcnk6IHN1cmZhY2UgZW52aXJvbm1lbnQtYm91bmQgc2FuZGJveCBzZXNzaW9ucyBpbiB0aGUgbGlzdFxuXHRcdC8vIHdpdGhvdXQgY29ubmVjdGluZy4gUnVucyB3aGVuIHRoZSBBZ2VudHMgd2luZG93IChyZSlkaXNjb3ZlcnMgaG9zdHMgYW5kXG5cdFx0Ly8gb25jZSBub3cgc28gc2Vzc2lvbnMgYXBwZWFyIG9uIHN0YXJ0dXAuIENvbm5lY3RpbmcgaGFwcGVucyBvbiBvcGVuIHZpYVxuXHRcdC8vIHRoZSBzYW5kYm94IGFzeW5jIGFjdGl2YXRvci5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLnJlZ2lzdGVyRGlzY292ZXJ5SGFuZGxlcigoKSA9PiB0aGlzLl9kaXNjb3ZlckFuZFNlZWQoKSkpO1xuXHRcdHZvaWQgdGhpcy5fZGlzY292ZXJBbmRTZWVkKCk7XG5cblx0XHQvLyBEaXNjb3ZlcnkgbmVlZHMgYSBHaXRIdWIgc2Vzc2lvbiwgYW5kIHRoZSBhdXRoIHByb3ZpZGVyIGlzIGNvbnRyaWJ1dGVkIGJ5IGFuIGV4dGVuc2lvbiB0aGF0XG5cdFx0Ly8gbWF5IG5vdCBiZSByZWdpc3RlcmVkIHlldCBhdCBzdGFydHVwLiBSZXRyeSBhcyBzZXNzaW9ucyBiZWNvbWUgYXZhaWxhYmxlLCB1bnRpbCB0aGUgZmlyc3Rcblx0XHQvLyBzdWNjZXNzOyBmcm9tIHRoZW4gb24gdGhlIGRpc2NvdmVyeSBoYW5kbGVyIGFib3ZlIGRyaXZlcyByZWZyZXNoZXMuXG5cdFx0Y29uc3QgcmV0cnlVbnRpbEZpcnN0U3VjY2VzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmV0cnkgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faGFzRGlzY292ZXJlZCkge1xuXHRcdFx0XHRyZXRyeVVudGlsRmlyc3RTdWNjZXNzLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHZvaWQgdGhpcy5fZGlzY292ZXJBbmRTZWVkKCk7XG5cdFx0fTtcblx0XHRyZXRyeVVudGlsRmlyc3RTdWNjZXNzLmFkZCh0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhyZXRyeSkpO1xuXHRcdHJldHJ5VW50aWxGaXJzdFN1Y2Nlc3MuYWRkKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZFJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihyZXRyeSkpO1xuXG5cdFx0Ly8gQ29ubmVjdC1vbi1vcGVuOiB3aGVuIGEgc2VlZGVkIHNhbmRib3ggc2Vzc2lvbiBpcyBvcGVuZWQsIHRoZSBjaGF0XG5cdFx0Ly8gc2VydmljZSByZXNvbHZlcyBpdCB0aHJvdWdoIHRoaXMgYXN5bmMgYWN0aXZhdG9yLCB3aGljaCBlc3RhYmxpc2hlcyB0aGVcblx0XHQvLyByZWxheSBjb25uZWN0aW9uIGFuZCB3YWl0cyBmb3IgdGhlIGhvc3QgdG8gYWR2ZXJ0aXNlIHRoZSBzZXNzaW9uJ3MgYWdlbnRcblx0XHQvLyAoc28gaXRzIGNvbnRlbnQgcHJvdmlkZXIgcmVnaXN0ZXJzKSBiZWZvcmUgdGhlIGNoYXQgbG9hZHMuIFNjb3BlZCB0byBvdXJcblx0XHQvLyBzYW5kYm94IGF1dGhvcml0aWVzIHNvIGl0IG5ldmVyIGludGVyY2VwdHMgb3RoZXIgcmVtb3RlLWFnZW50LWhvc3QgdHlwZXMuXG5cdFx0Ly8gVGhlIHNvdXJjZSBpcyBzd2FwcGVkIG91dCBieSBgX3RlYXJkb3duQWxsYCwgc28gY2FuY2VsIHdoaWNoZXZlciBvbmUgaXMgY3VycmVudCBvbiBkaXNwb3NlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9lbmFibGVkQ3RzLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fZW5hYmxlZEN0cy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVnaXN0cnkuYXM8SUFzeW5jQ2hhdFNlc3Npb25BY3RpdmF0aW9uUmVnaXN0cnk+KENoYXRTZXNzaW9uc0V4dGVuc2lvbnMuQXN5bmNBY3RpdmF0aW9uKS5yZWdpc3Rlcih7XG5cdFx0XHRtYXRjaFNlc3Npb25UeXBlOiBzZXNzaW9uVHlwZSA9PiB0aGlzLl9maW5kQWRkcmVzc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKSAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0d2FpdEZvckFjdGl2YXRpb246IChfYWNjZXNzb3IsIHNlc3Npb25UeXBlKSA9PiB0aGlzLl93YWl0Rm9yQWN0aXZhdGlvbihzZXNzaW9uVHlwZSksXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc2NvdmVyIGVudmlyb25tZW50LWJvdW5kIHNhbmRib3ggc2Vzc2lvbnMgYW5kIHNlZWQgdGhlbSBpbnRvIHBlci1lbnZpcm9ubWVudCBwcm92aWRlcnMgc29cblx0ICogdGhleSBhcHBlYXIgaW4gdGhlIHNlc3Npb25zIGxpc3QgKip3aXRob3V0KiogY29ubmVjdGluZy4gUmVjb25jaWxlcyBhZ2FpbnN0IHRoZSByZXN1bHQ6XG5cdCAqIGVudmlyb25tZW50cyB0aGF0IGhhdmUgdmFuaXNoZWQgZnJvbSBkaXNjb3ZlcnkgKGUuZy4gdGhlaXIgdGFzayB3YXMgYXJjaGl2ZWQpIGFuZCBhcmUgbm90XG5cdCAqIGN1cnJlbnRseSBjb25uZWN0ZWQgYXJlIHRvcm4gZG93biwgc28gc3RhbGUgcHJvdmlkZXJzL3Nlc3Npb25zIGRvbid0IGxpbmdlci4gQmVzdC1lZmZvcnQ6XG5cdCAqIGEgZmFpbGVkIGRpc2NvdmVyeSBpcyBsb2dnZWQgYW5kIGxlYXZlcyBleGlzdGluZyBzdGF0ZSB1bnRvdWNoZWQuXG5cdCAqXG5cdCAqIFJ1bnMgYXJlIHNlcmlhbGl6ZWQsIHdpdGggYXQgbW9zdCBvbmUgZm9sbG93LXVwIHF1ZXVlZCwgc28gb3ZlcmxhcHBpbmcgdHJpZ2dlcnMgY2FuJ3Rcblx0ICogaW50ZXJsZWF2ZSB0aGVpciByZWNvbmNpbGlhdGlvbiBwYXNzZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNjb3ZlckFuZFNlZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2Rpc2NvdmVyeUluRmxpZ2h0KSB7XG5cdFx0XHR0aGlzLl9kaXNjb3ZlcnlRdWV1ZWQgPz89IHRoaXMuX2Rpc2NvdmVyeUluRmxpZ2h0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kaXNjb3ZlcnlRdWV1ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kaXNjb3ZlckFuZFNlZWQoKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Rpc2NvdmVyeVF1ZXVlZDtcblx0XHR9XG5cdFx0dGhpcy5fZGlzY292ZXJ5SW5GbGlnaHQgPSB0aGlzLl9kb0Rpc2NvdmVyQW5kU2VlZCgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGlzY292ZXJ5SW5GbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc2NvdmVyeUluRmxpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9EaXNjb3ZlckFuZFNlZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2VuYWJsZWRDdHMudG9rZW47XG5cdFx0bGV0IHJlc3VsdDogSUNsb3VkU2FuZGJveERpc2NvdmVyeVJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlZGVudGlhbHNTZXJ2aWNlLmxpc3RTZXNzaW9ucyh0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJlc3VsdCA9IHsga2luZDogJ2ZhaWxlZCcsIHJlYXNvbjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpIH07XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ2ZhaWxlZCcpIHtcblx0XHRcdC8vIE5vdCBcIm5vIHNlc3Npb25zXCIgXHUyMDE0IGxlYXZlIGV4aXN0aW5nIHN0YXRlIGFsb25lLCBhbmQgc3RheSBlbGlnaWJsZSBmb3IgdGhlIGF1dGggcmV0cnkuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRGlzY292ZXJ5IGZhaWxlZDogJHtyZXN1bHQucmVhc29ufWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgZmVhdHVyZSBtYXkgaGF2ZSBiZWVuIGRpc2FibGVkIHdoaWxlIHRoZSBzY2FuIHdhcyBpbiBmbGlnaHQuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9oYXNEaXNjb3ZlcmVkID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHByZXNlbnQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgcmVzdWx0LnNlc3Npb25zKSB7XG5cdFx0XHRpZiAoIXNlc3Npb24uZW52aXJvbm1lbnRJZCB8fCAhc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gY2xvdWRTYW5kYm94QWRkcmVzcyhzZXNzaW9uLmVudmlyb25tZW50SWQpO1xuXHRcdFx0cHJlc2VudC5hZGQoYWRkcmVzcyk7XG5cdFx0XHR0aGlzLl9lbnN1cmVQcm92aWRlcih7IGVudmlyb25tZW50SWQ6IHNlc3Npb24uZW52aXJvbm1lbnRJZCwgc2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCwgbmFtZTogc2Vzc2lvbi5uYW1lIH0pO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBzZXNzaW9uLnVwZGF0ZWRBdCA/IERhdGUucGFyc2Uoc2Vzc2lvbi51cGRhdGVkQXQpIDogTnVtYmVyLk5hTjtcblx0XHRcdGNvbnN0IG1vZGlmaWVkVGltZSA9IE51bWJlci5pc05hTihwYXJzZWQpID8gRGF0ZS5ub3coKSA6IHBhcnNlZDtcblx0XHRcdGNvbnN0IG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHtcblx0XHRcdFx0Ly8gU2VlZCB1bmRlciB0aGUgYWdlbnQtcHJvdmlkZXIgKFVJKSBzY2hlbWUsIHByZXNlcnZpbmcgdGhlIHNlc3Npb24gaWQuIE1pc3Npb24gQ29udHJvbFxuXHRcdFx0XHQvLyBpc3N1ZXMgZWFjaCBzZXNzaW9uIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmAgKHRoZSBpZCBpdCBhbHNvIHJldHVybnMgaGVyZSksIGFuZCB0aGVcblx0XHRcdFx0Ly8gQ29waWxvdCBob3N0IGxpc3RzIHRoYXQgc2FtZSBpZCBiYWNrLCBzbyB0aGUgc2VlZCByZWNvbmNpbGVzIGRldGVybWluaXN0aWNhbGx5IHdpdGhcblx0XHRcdFx0Ly8gdGhlIGxpdmUgYGxpc3RTZXNzaW9ucygpYCByZXN1bHQgb24gY29ubmVjdC4gU2VlIGNvcGlsb3QtaG9zdCBzZXNzaW9uLWlkZW50aXR5IGRvY3MuXG5cdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoQ0xPVURfU0FOREJPWF9BR0VOVF9QUk9WSURFUiwgc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0XHRzdGFydFRpbWU6IG1vZGlmaWVkVGltZSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lLFxuXHRcdFx0XHRzdW1tYXJ5OiBzZXNzaW9uLm5hbWUsXG5cdFx0XHR9O1xuXHRcdFx0cHJvdmlkZXI/LnNlZWRTZXNzaW9ucyhbbWV0YV0pO1xuXHRcdH1cblxuXHRcdC8vIE5lZ2F0aXZlIHJlY29uY2lsaWF0aW9uOiBkcm9wIGVudmlyb25tZW50cyB0aGF0IGFyZSBubyBsb25nZXIgZGlzY292ZXJhYmxlIGFuZCBhcmVuJ3Rcblx0XHQvLyBjdXJyZW50bHkgY29ubmVjdGVkIChhbiBvcGVuL2Nvbm5lY3RlZCBzZXNzaW9uIGlzIGtlcHQgc28gYWN0aXZlIHVzZSBpc24ndCBkaXNydXB0ZWQpLlxuXHRcdC8vIE9ubHkgYSBjb21wbGV0ZSBzY2FuIGlzIGF1dGhvcml0YXRpdmUgXHUyMDE0IGEgcGFydGlhbCBvbmUgaXMgbWlzc2luZyBlbnRyaWVzIHRoYXQgc3RpbGwgZXhpc3QuXG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnY29tcGxldGUnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgWy4uLnRoaXMuX2Vudmlyb25tZW50cy5rZXlzKCldKSB7XG5cdFx0XHRcdGlmIChwcmVzZW50LmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RlZCA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRcdGlmICghY29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVhcmRvd25FbnZpcm9ubWVudChhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTZWVkZWQgJHtwcmVzZW50LnNpemV9IGRpc2NvdmVyZWQgc2FuZGJveCBlbnZpcm9ubWVudChzKSR7cmVzdWx0LmtpbmQgPT09ICdwYXJ0aWFsJyA/ICcgKHBhcnRpYWwgc2Nhbjsga2VwdCBleGlzdGluZyBlbnRyaWVzKScgOiAnJ30uYCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIHRoZSBjb25uZWN0aW9uIChhbmQgaXRzIGNyZWRlbnRpYWwgcmVmcmVzaGVyKSBmb3IgYW4gZW52aXJvbm1lbnQgd2hpbGUga2VlcGluZyB0aGVcblx0ICogcHJvdmlkZXIgYW5kIGl0cyBjYWNoZWQgc2Vzc2lvbnMgdmlzaWJsZSBpbiBhIGRpc2Nvbm5lY3RlZCBzdGF0ZS4gRGlzcG9zaW5nIHRoZSBwcm90b2NvbFxuXHQgKiBjbGllbnQgc3RvcHMgdGhlIHNvZnQtcmVjb25uZWN0IGxvb3A7IHRoZSB7QGxpbmsgQ2xvdWRTYW5kYm94QWdlbnRIb3N0U2VydmljZX0gcHJ1bmVzIHRoZVxuXHQgKiByZWZyZXNoZXIgdmlhIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2Nvbm5lY3RFbnZpcm9ubWVudChhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBGYWlsZWQgdG8gZGlzY29ubmVjdCAke2FkZHJlc3N9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRnVsbHkgdGVhciBkb3duIGFuIGVudmlyb25tZW50OiBkaXNwb3NlIGl0cyBwcm92aWRlciAodW5yZWdpc3RlcmluZyBpdCBhbmQgaXRzIHNlc3Npb25zKSBhbmRcblx0ICogcmVtb3ZlIGl0cyBjb25uZWN0aW9uICsgY3JlZGVudGlhbCByZWZyZXNoZXIuIFVzZWQgd2hlbiBhbiBlbnZpcm9ubWVudCB2YW5pc2hlcyBmcm9tIGRpc2NvdmVyeVxuXHQgKiBvciB0aGUgZmVhdHVyZSBpcyBkaXNhYmxlZC5cblx0ICovXG5cdHByaXZhdGUgX3RlYXJkb3duRW52aXJvbm1lbnQoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZW52aXJvbm1lbnRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0dm9pZCB0aGlzLl9kaXNjb25uZWN0RW52aXJvbm1lbnQoYWRkcmVzcyk7XG5cdH1cblxuXHQvKiogVGVhciBkb3duIGV2ZXJ5IGtub3duIHNhbmRib3ggZW52aXJvbm1lbnQgKGZlYXR1cmUgZGlzYWJsZWQpLiAqL1xuXHRwcml2YXRlIF90ZWFyZG93bkFsbCgpOiB2b2lkIHtcblx0XHQvLyBBYm9ydCBpbi1mbGlnaHQgZGlzY292ZXJ5L2Nvbm5lY3RzIGZpcnN0IHNvIG5vdGhpbmcgY29tbWl0cyBzdGF0ZSBhZnRlciB0aGlzIHJ1bnMuXG5cdFx0dGhpcy5fZW5hYmxlZEN0cy5jYW5jZWwoKTtcblx0XHR0aGlzLl9lbmFibGVkQ3RzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lbmFibGVkQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIFsuLi50aGlzLl9lbnZpcm9ubWVudHMua2V5cygpXSkge1xuXHRcdFx0dGhpcy5fdGVhcmRvd25FbnZpcm9ubWVudChhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHQvKiogTWFwIGVhY2gga25vd24gc2FuZGJveCBjb25uZWN0aW9uIGF1dGhvcml0eSB0byBpdHMgYWRkcmVzcyAoYGNsb3Vkc2FuZGJveDo8ZW52SWQ+YCkuICovXG5cdHByaXZhdGUgX2F1dGhvcml0aWVzQnlBZGRyZXNzKCk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IGJ5QXV0aG9yaXR5ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgdGhpcy5fZW52aXJvbm1lbnRzLmtleXMoKSkge1xuXHRcdFx0YnlBdXRob3JpdHkuc2V0KGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKSwgYWRkcmVzcyk7XG5cdFx0fVxuXHRcdHJldHVybiBieUF1dGhvcml0eTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlIHRoZSBzYW5kYm94IGFkZHJlc3Mgb3duaW5nIGEgcmVtb3RlLWFnZW50LWhvc3Qgc2Vzc2lvbiB0eXBlLCBpZiBhbnkuICovXG5cdHByaXZhdGUgX2ZpbmRBZGRyZXNzRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnlBdXRob3JpdHkgPSB0aGlzLl9hdXRob3JpdGllc0J5QWRkcmVzcygpO1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGZpbmRSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUF1dGhvcml0eShzZXNzaW9uVHlwZSwgYnlBdXRob3JpdHkua2V5cygpKTtcblx0XHRyZXR1cm4gYXV0aG9yaXR5ID8gYnlBdXRob3JpdHkuZ2V0KGF1dGhvcml0eSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQXN5bmMtYWN0aXZhdGlvbiBob29rIGZvciBhIHNhbmRib3ggc2Vzc2lvbiB0eXBlOiBlc3RhYmxpc2ggdGhlIHJlbGF5IGNvbm5lY3Rpb24gb24gZGVtYW5kLFxuXHQgKiB0aGVuIHJlc29sdmUgb25jZSB0aGUgaG9zdCBhZHZlcnRpc2VzIHRoZSBhZ2VudCBiYWNraW5nIHRoaXMgc2Vzc2lvbiB0eXBlIChpdHMgY29udGVudFxuXHQgKiBwcm92aWRlciBpcyByZWdpc3RlcmVkKSwgc28gdGhlIGNoYXQgY2FuIGxvYWQuIFJldHVybnMgZmFsc2UgaWYgdGhlIGVudmlyb25tZW50IGlzIHVua25vd24sXG5cdCAqIHRoZSBjb25uZWN0aW9uIGZhaWxzLCBvciB0aGUgYWdlbnQgbmV2ZXIgYXBwZWFycy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JBY3RpdmF0aW9uKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBhZGRyZXNzID0gdGhpcy5fZmluZEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgZW52ID0gYWRkcmVzcyA/IHRoaXMuX2Vudmlyb25tZW50cy5nZXQoYWRkcmVzcykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFhZGRyZXNzIHx8ICFlbnYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29ubmVjdCh7IGVudmlyb25tZW50SWQ6IGVudi5lbnZpcm9ubWVudElkLCBzZXNzaW9uSWQ6IGVudi5zZXNzaW9uSWQsIG5hbWU6IGVudi5uYW1lIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gY29ubmVjdC1vbi1vcGVuIGZhaWxlZCBmb3IgJHthZGRyZXNzfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHQvLyBUT0RPOiByZW5kZXIgdGhlIHNlc3Npb24ncyBoaXN0b3J5IHJlYWQtb25seSBhbmQgcXVldWUgZm9sbG93LXVwcyBpbnN0ZWFkIG9mIHJlZnVzaW5nIHRvXG5cdFx0XHQvLyBvcGVuIGl0LiBOZWVkcyBhIGhpc3Rvcnkgc291cmNlIHRoYXQgZG9lcyBub3QgZGVwZW5kIG9uIHRoZSByZWxheS5cblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIENsb3VkU2FuZGJveEVudmlyb25tZW50T2ZmbGluZUVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihlcnJvci5tZXNzYWdlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5nZXRDb25uZWN0aW9uKGFkZHJlc3MpO1xuXHRcdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJvb3RTdGF0ZSA9IGNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlO1xuXHRcdFx0aWYgKHJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChyb290U3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuIHJvb3RTdGF0ZS5hZ2VudHMuc29tZShhZ2VudCA9PiByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKGF1dGhvcml0eSwgYWdlbnQucHJvdmlkZXIpID09PSBzZXNzaW9uVHlwZSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoY29ubmVjdGlvbi5yb290U3RhdGUub25EaWRDaGFuZ2UpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmUgYSBwcm92aWRlciBleGlzdHMgZm9yIHRoZSBlbnZpcm9ubWVudCBhbmQgZXN0YWJsaXNoIChvciByZXVzZSkgdGhlXG5cdCAqIGNvbm5lY3Rpb24uIFJlc29sdmVzIHdpdGggdGhlIGNvbm5lY3Rpb24ncyBkaXNwbGF5IGFkZHJlc3MuXG5cdCAqL1xuXHRhc3luYyBjb25uZWN0KG9wdGlvbnM6IElDbG91ZFNhbmRib3hDb25uZWN0T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3BpbG90IGNsb3VkIHNhbmRib3ggY29ubmVjdGlvbnMgYXJlIG5vdCBlbmFibGVkLicpO1xuXHRcdH1cblx0XHRjb25zdCBhZGRyZXNzID0gY2xvdWRTYW5kYm94QWRkcmVzcyhvcHRpb25zLmVudmlyb25tZW50SWQpO1xuXHRcdHRoaXMuX2Vuc3VyZVByb3ZpZGVyKHsgZW52aXJvbm1lbnRJZDogb3B0aW9ucy5lbnZpcm9ubWVudElkLCBzZXNzaW9uSWQ6IG9wdGlvbnMuc2Vzc2lvbklkLCBuYW1lOiBvcHRpb25zLm5hbWUgfSk7XG5cblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmdldChhZGRyZXNzKTtcblx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fZW5hYmxlZEN0cy50b2tlbjtcblx0XHRjb25zdCBhdHRlbXB0ID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmdldChhZGRyZXNzKT8uc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jbG91ZFNhbmRib3hTZXJ2aWNlLmNvbm5lY3Qob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHQvLyBUaGUgZmVhdHVyZSBtYXkgaGF2ZSBiZWVuIGRpc2FibGVkIHdoaWxlIGNvbm5lY3Rpbmc7IGRyb3AgdGhlIGNvbm5lY3Rpb24gcmF0aGVyXG5cdFx0XHRcdC8vIHRoYW4gbGVhdmluZyBhIGxpdmUgcmVsYXkgb3BlbiBhZnRlciB0ZWFyZG93bi5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fZGlzY29ubmVjdEVudmlyb25tZW50KGFkZHJlc3MpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBmaXJlcyBmcm9tIGFkZE1hbmFnZWRDb25uZWN0aW9uIGFuZCB3aXJlcyB0aGVcblx0XHRcdFx0Ly8gcHJvdmlkZXI7IGNhbGwgX3dpcmVDb25uZWN0aW9ucyBkaXJlY3RseSB0b28gaW4gY2FzZSBpdCBhbHJlYWR5IGZpcmVkLlxuXHRcdFx0XHR0aGlzLl93aXJlQ29ubmVjdGlvbnMoKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuc2V0KGFkZHJlc3MsIGF0dGVtcHQpO1xuXHRcdHJldHVybiBhdHRlbXB0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDbG91ZFNhbmRib3hFbmFibGVkU2V0dGluZ0lkKVxuXHRcdFx0JiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpO1xuXHR9XG5cblx0LyoqIENyZWF0ZSB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgZm9yIGFuIGVudmlyb25tZW50IGlmIGl0IGRvZXNuJ3QgZXhpc3QgeWV0LiAqL1xuXHRwcml2YXRlIF9lbnN1cmVQcm92aWRlcihlbnY6IElDbG91ZFNhbmRib3hFbnZpcm9ubWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBjbG91ZFNhbmRib3hBZGRyZXNzKGVudi5lbnZpcm9ubWVudElkKTtcblx0XHR0aGlzLl9lbnZpcm9ubWVudHMuc2V0KGFkZHJlc3MsIGVudik7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciwge1xuXHRcdFx0YWRkcmVzcyxcblx0XHRcdG5hbWU6IGVudi5uYW1lLFxuXHRcdFx0Y29ubmVjdE9uRGVtYW5kOiAoKSA9PiB0aGlzLmNvbm5lY3QoeyBlbnZpcm9ubWVudElkOiBlbnYuZW52aXJvbm1lbnRJZCwgc2Vzc2lvbklkOiBlbnYuc2Vzc2lvbklkLCBuYW1lOiBlbnYubmFtZSB9KS50aGVuKCgpID0+IHsgfSksXG5cdFx0XHRzZXNzaW9uU2NoZW1lQWxpYXM6IFNBTkRCT1hfU0VTU0lPTl9TQ0hFTUVfQUxJQVMsXG5cdFx0fSk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zKHByb3ZpZGVyLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLnNldChhZGRyZXNzLCBwcm92aWRlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5kZWxldGUoYWRkcmVzcykpKTtcblx0XHR0aGlzLl9wcm92aWRlclN0b3Jlcy5zZXQoYWRkcmVzcywgc3RvcmUpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBSZWdpc3RlcmVkIHNlc3Npb25zIHByb3ZpZGVyIGZvciAke2FkZHJlc3N9YCk7XG5cdH1cblxuXHQvKiogV2lyZSBlYWNoIGxpdmUgY29ubmVjdGlvbiB0byBpdHMgcHJvdmlkZXIgc28gc2Vzc2lvbiBlbnVtZXJhdGlvbiBydW5zLiAqL1xuXHRwcml2YXRlIF93aXJlQ29ubmVjdGlvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uSW5mbyA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChcblx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cyksXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24oYWRkcmVzcyk7XG5cdFx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvbihjb25uZWN0aW9uLCBjb25uZWN0aW9uSW5mby5kZWZhdWx0RGlyZWN0b3J5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBQdXNoIHRoZSBzZXJ2aWNlJ3MgYXV0aG9yaXRhdGl2ZSBjb25uZWN0aW9uIHN0YXR1cyBvbnRvIGVhY2ggcHJvdmlkZXIuICovXG5cdHByaXZhdGUgX3VwZGF0ZUNvbm5lY3Rpb25TdGF0dXNlcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25JbmZvLnN0YXR1cyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFVQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLG9CQUFvQjtBQUN6RSxTQUFTLGdCQUFnQjtBQUN6QjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUdNO0FBQ1AsU0FBUyxvQkFBZ0Q7QUFDekQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5Q0FBeUMsb0NBQW9DO0FBQ3RGLFNBQVMseUJBQXlCLGlDQUFpQyx3Q0FBd0M7QUFDM0csU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyw4QkFBbUU7QUFDNUUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBOEIsdUNBQXVDO0FBQ3JFLFNBQVMsc0RBQXNEO0FBQy9ELFNBQVMsMkNBQTJDLHVDQUF1QztBQUMzRixTQUFTLHlDQUF5QztBQUVsRCxNQUFNLGFBQWE7QUFNbkIsTUFBTSwrQkFBb0Q7QUFBQSxFQUN6RCxJQUFJO0FBQUEsRUFDSixTQUFTO0FBQ1Y7QUFTTyxJQUFNLG9DQUFOLGNBQWdELFdBQTZDO0FBQUEsRUFxQm5HLFlBQ2lELHNCQUNFLHFCQUNSLHlCQUN1QiwyQkFDckIsMkJBQ0YseUJBQ0YsdUJBQ0Msd0JBQ0QsdUJBQ0Qsc0JBQ1QsYUFDN0I7QUFDRCxVQUFNO0FBWjBDO0FBQ0U7QUFDUjtBQUN1QjtBQUNyQjtBQUNGO0FBQ0Y7QUFDQztBQUNEO0FBQ0Q7QUFDVDtBQTVCL0I7QUFBQSxTQUFpQixxQkFBcUIsb0JBQUksSUFBNkM7QUFDdkYsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGNBQXNCLENBQUM7QUFFN0U7QUFBQSxTQUFpQixnQkFBZ0Isb0JBQUksSUFBc0M7QUFFM0U7QUFBQSxTQUFpQixtQkFBbUIsb0JBQUksSUFBNkI7QUFLckU7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLGNBQWMsSUFBSSx3QkFBd0I7QUFLbEQ7QUFBQSxTQUFRLGlCQUFpQjtBQW9CeEIsU0FBSyxVQUFVLEtBQUssMEJBQTBCO0FBQUEsTUFDN0M7QUFBQSxNQUNBLGFBQVcsMENBQTBDLFNBQVMsS0FBSyxvQkFBb0I7QUFBQSxJQUN4RixDQUFDO0FBR0QsU0FBSyxVQUFVLEtBQUssd0JBQXdCLHVCQUF1QixNQUFNO0FBQ3hFLFdBQUssaUJBQWlCO0FBQ3RCLFdBQUssMEJBQTBCO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBS0YsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHlCQUF5QixPQUFLO0FBQ3ZFLFVBQUksRUFBRSxxQkFBcUIsNEJBQTRCLEtBQUssRUFBRSxxQkFBcUIsZ0NBQWdDLEdBQUc7QUFDckgsWUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixlQUFLLEtBQUssaUJBQWlCO0FBQUEsUUFDNUIsT0FBTztBQUNOLGVBQUssYUFBYTtBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBTUYsU0FBSyxVQUFVLEtBQUssd0JBQXdCLHlCQUF5QixNQUFNLEtBQUssaUJBQWlCLENBQUMsQ0FBQztBQUNuRyxTQUFLLEtBQUssaUJBQWlCO0FBSzNCLFVBQU0seUJBQXlCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBQ25FLFVBQU0sUUFBUSxNQUFNO0FBQ25CLFVBQUksS0FBSyxnQkFBZ0I7QUFDeEIsK0JBQXVCLE1BQU07QUFDN0I7QUFBQSxNQUNEO0FBQ0EsV0FBSyxLQUFLLGlCQUFpQjtBQUFBLElBQzVCO0FBQ0EsMkJBQXVCLElBQUksS0FBSyx1QkFBdUIsb0JBQW9CLEtBQUssQ0FBQztBQUNqRiwyQkFBdUIsSUFBSSxLQUFLLHVCQUF1QixvQ0FBb0MsS0FBSyxDQUFDO0FBUWpHLFNBQUssVUFBVSxhQUFhLE1BQU07QUFDakMsV0FBSyxZQUFZLE9BQU87QUFDeEIsV0FBSyxZQUFZLFFBQVE7QUFBQSxJQUMxQixDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsU0FBUyxHQUF3Qyx1QkFBdUIsZUFBZSxFQUFFLFNBQVM7QUFBQSxNQUNoSCxrQkFBa0IsaUJBQWUsS0FBSywyQkFBMkIsV0FBVyxNQUFNO0FBQUEsTUFDbEYsbUJBQW1CLENBQUMsV0FBVyxnQkFBZ0IsS0FBSyxtQkFBbUIsV0FBVztBQUFBLElBQ25GLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWVEsbUJBQWtDO0FBQ3pDLFFBQUksS0FBSyxvQkFBb0I7QUFDNUIsV0FBSyxxQkFBcUIsS0FBSyxtQkFBbUIsS0FBSyxNQUFNO0FBQzVELGFBQUssbUJBQW1CO0FBQ3hCLGVBQU8sS0FBSyxpQkFBaUI7QUFBQSxNQUM5QixDQUFDO0FBQ0QsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFNBQUsscUJBQXFCLEtBQUssbUJBQW1CLEVBQUUsUUFBUSxNQUFNO0FBQ2pFLFdBQUsscUJBQXFCO0FBQUEsSUFDM0IsQ0FBQztBQUNELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMscUJBQW9DO0FBQ2pELFFBQUksQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN2QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsS0FBSyxZQUFZO0FBQy9CLFFBQUk7QUFDSixRQUFJO0FBQ0gsZUFBUyxNQUFNLEtBQUssb0JBQW9CLGFBQWEsS0FBSztBQUFBLElBQzNELFNBQVMsT0FBTztBQUNmLGVBQVMsRUFBRSxNQUFNLFVBQVUsUUFBUSxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLEVBQUU7QUFBQSxJQUMzRjtBQUNBLFFBQUksT0FBTyxTQUFTLFVBQVU7QUFFN0IsV0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLHNCQUFzQixPQUFPLE1BQU0sRUFBRTtBQUN4RTtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sMkJBQTJCLENBQUMsS0FBSyxXQUFXLEdBQUc7QUFDeEQ7QUFBQSxJQUNEO0FBQ0EsU0FBSyxpQkFBaUI7QUFFdEIsVUFBTSxVQUFVLG9CQUFJLElBQVk7QUFDaEMsZUFBVyxXQUFXLE9BQU8sVUFBVTtBQUN0QyxVQUFJLENBQUMsUUFBUSxpQkFBaUIsQ0FBQyxRQUFRLFdBQVc7QUFDakQ7QUFBQSxNQUNEO0FBQ0EsWUFBTSxVQUFVLG9CQUFvQixRQUFRLGFBQWE7QUFDekQsY0FBUSxJQUFJLE9BQU87QUFDbkIsV0FBSyxnQkFBZ0IsRUFBRSxlQUFlLFFBQVEsZUFBZSxXQUFXLFFBQVEsV0FBVyxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBQy9HLFlBQU0sV0FBVyxLQUFLLG1CQUFtQixJQUFJLE9BQU87QUFDcEQsWUFBTSxTQUFTLFFBQVEsWUFBWSxLQUFLLE1BQU0sUUFBUSxTQUFTLElBQUksT0FBTztBQUMxRSxZQUFNLGVBQWUsT0FBTyxNQUFNLE1BQU0sSUFBSSxLQUFLLElBQUksSUFBSTtBQUN6RCxZQUFNLE9BQThCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxRQUtuQyxTQUFTLGFBQWEsSUFBSSw4QkFBOEIsUUFBUSxTQUFTO0FBQUEsUUFDekUsV0FBVztBQUFBLFFBQ1g7QUFBQSxRQUNBLFNBQVMsUUFBUTtBQUFBLE1BQ2xCO0FBQ0EsZ0JBQVUsYUFBYSxDQUFDLElBQUksQ0FBQztBQUFBLElBQzlCO0FBS0EsUUFBSSxPQUFPLFNBQVMsWUFBWTtBQUMvQixpQkFBVyxXQUFXLENBQUMsR0FBRyxLQUFLLGNBQWMsS0FBSyxDQUFDLEdBQUc7QUFDckQsWUFBSSxRQUFRLElBQUksT0FBTyxHQUFHO0FBQ3pCO0FBQUEsUUFDRDtBQUNBLGNBQU0sWUFBWSxLQUFLLHdCQUF3QixZQUFZLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTztBQUMxRixZQUFJLENBQUMsV0FBVztBQUNmLGVBQUsscUJBQXFCLE9BQU87QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLFdBQVcsUUFBUSxJQUFJLHFDQUFxQyxPQUFPLFNBQVMsWUFBWSwyQ0FBMkMsRUFBRSxHQUFHO0FBQUEsRUFDNUs7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQWMsdUJBQXVCLFNBQWdDO0FBQ3BFLFFBQUk7QUFDSCxZQUFNLEtBQUssd0JBQXdCLHNCQUFzQixPQUFPO0FBQUEsSUFDakUsU0FBUyxPQUFPO0FBQ2YsV0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLHlCQUF5QixPQUFPLEtBQUssaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUNqSTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxxQkFBcUIsU0FBdUI7QUFDbkQsU0FBSyxjQUFjLE9BQU8sT0FBTztBQUNqQyxTQUFLLGlCQUFpQixPQUFPLE9BQU87QUFDcEMsU0FBSyxnQkFBZ0IsaUJBQWlCLE9BQU87QUFDN0MsU0FBSyxLQUFLLHVCQUF1QixPQUFPO0FBQUEsRUFDekM7QUFBQTtBQUFBLEVBR1EsZUFBcUI7QUFFNUIsU0FBSyxZQUFZLE9BQU87QUFDeEIsU0FBSyxZQUFZLFFBQVE7QUFDekIsU0FBSyxjQUFjLElBQUksd0JBQXdCO0FBQy9DLGVBQVcsV0FBVyxDQUFDLEdBQUcsS0FBSyxjQUFjLEtBQUssQ0FBQyxHQUFHO0FBQ3JELFdBQUsscUJBQXFCLE9BQU87QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR1Esd0JBQTZDO0FBQ3BELFVBQU0sY0FBYyxvQkFBSSxJQUFvQjtBQUM1QyxlQUFXLFdBQVcsS0FBSyxjQUFjLEtBQUssR0FBRztBQUNoRCxrQkFBWSxJQUFJLG1CQUFtQixPQUFPLEdBQUcsT0FBTztBQUFBLElBQ3JEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR1EsMkJBQTJCLGFBQXlDO0FBQzNFLFVBQU0sY0FBYyxLQUFLLHNCQUFzQjtBQUMvQyxVQUFNLFlBQVksd0NBQXdDLGFBQWEsWUFBWSxLQUFLLENBQUM7QUFDekYsV0FBTyxZQUFZLFlBQVksSUFBSSxTQUFTLElBQUk7QUFBQSxFQUNqRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyxtQkFBbUIsYUFBdUM7QUFDdkUsVUFBTSxVQUFVLEtBQUssMkJBQTJCLFdBQVc7QUFDM0QsVUFBTSxNQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksT0FBTyxJQUFJO0FBQ3hELFFBQUksQ0FBQyxXQUFXLENBQUMsS0FBSztBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUk7QUFDSCxZQUFNLEtBQUssUUFBUSxFQUFFLGVBQWUsSUFBSSxlQUFlLFdBQVcsSUFBSSxXQUFXLE1BQU0sSUFBSSxLQUFLLENBQUM7QUFBQSxJQUNsRyxTQUFTLE9BQU87QUFDZixXQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUsK0JBQStCLE9BQU8sS0FBSyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLENBQUMsRUFBRTtBQUd0SSxVQUFJLGlCQUFpQixxQ0FBcUM7QUFDekQsYUFBSyxxQkFBcUIsS0FBSyxNQUFNLE9BQU87QUFBQSxNQUM3QztBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxZQUFZLG1CQUFtQixPQUFPO0FBQzVDLFdBQU8sTUFBTTtBQUNaLFlBQU0sYUFBYSxLQUFLLHdCQUF3QixjQUFjLE9BQU87QUFDckUsVUFBSSxDQUFDLFlBQVk7QUFDaEIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFlBQVksV0FBVyxVQUFVO0FBQ3ZDLFVBQUkscUJBQXFCLE9BQU87QUFDL0IsZUFBTztBQUFBLE1BQ1I7QUFDQSxVQUFJLFdBQVc7QUFDZCxlQUFPLFVBQVUsT0FBTyxLQUFLLFdBQVMsNkJBQTZCLFdBQVcsTUFBTSxRQUFRLE1BQU0sV0FBVztBQUFBLE1BQzlHO0FBQ0EsWUFBTSxNQUFNLFVBQVUsV0FBVyxVQUFVLFdBQVc7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBTSxRQUFRLFNBQXVEO0FBQ3BFLFFBQUksQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN2QixZQUFNLElBQUksTUFBTSxvREFBb0Q7QUFBQSxJQUNyRTtBQUNBLFVBQU0sVUFBVSxvQkFBb0IsUUFBUSxhQUFhO0FBQ3pELFNBQUssZ0JBQWdCLEVBQUUsZUFBZSxRQUFRLGVBQWUsV0FBVyxRQUFRLFdBQVcsTUFBTSxRQUFRLEtBQUssQ0FBQztBQUUvRyxVQUFNLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxPQUFPO0FBQ2pELFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWTtBQUMvQixVQUFNLFdBQVcsWUFBWTtBQUM1QixVQUFJO0FBQ0gsYUFBSyxtQkFBbUIsSUFBSSxPQUFPLEdBQUcsb0JBQW9CLGdDQUFnQyxVQUFVO0FBQ3BHLGNBQU0sU0FBUyxNQUFNLEtBQUsscUJBQXFCLFFBQVEsU0FBUyxLQUFLO0FBR3JFLFlBQUksTUFBTSwyQkFBMkIsQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN4RCxlQUFLLEtBQUssdUJBQXVCLE9BQU87QUFDeEMsZ0JBQU0sSUFBSSxrQkFBa0I7QUFBQSxRQUM3QjtBQUdBLGFBQUssaUJBQWlCO0FBQ3RCLGVBQU87QUFBQSxNQUNSLFVBQUU7QUFDRCxhQUFLLGlCQUFpQixPQUFPLE9BQU87QUFBQSxNQUNyQztBQUFBLElBQ0QsR0FBRztBQUNILFNBQUssaUJBQWlCLElBQUksU0FBUyxPQUFPO0FBQzFDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxhQUFzQjtBQUM3QixXQUFPLEtBQUssc0JBQXNCLFNBQWtCLDRCQUE0QixLQUM1RSxLQUFLLHNCQUFzQixTQUFrQixnQ0FBZ0M7QUFBQSxFQUNsRjtBQUFBO0FBQUEsRUFHUSxnQkFBZ0IsS0FBcUM7QUFDNUQsVUFBTSxVQUFVLG9CQUFvQixJQUFJLGFBQWE7QUFDckQsU0FBSyxjQUFjLElBQUksU0FBUyxHQUFHO0FBQ25DLFFBQUksS0FBSyxnQkFBZ0IsSUFBSSxPQUFPLEdBQUc7QUFDdEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFVBQU0sV0FBVyxLQUFLLHNCQUFzQjtBQUFBLE1BQzNDO0FBQUEsTUFBaUM7QUFBQSxRQUNqQztBQUFBLFFBQ0EsTUFBTSxJQUFJO0FBQUEsUUFDVixpQkFBaUIsTUFBTSxLQUFLLFFBQVEsRUFBRSxlQUFlLElBQUksZUFBZSxXQUFXLElBQUksV0FBVyxNQUFNLElBQUksS0FBSyxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQUEsUUFBRSxDQUFDO0FBQUEsUUFDbEksb0JBQW9CO0FBQUEsTUFDckI7QUFBQSxJQUFDO0FBQ0QsVUFBTSxJQUFJLFFBQVE7QUFDbEIsVUFBTSxJQUFJLEtBQUssMEJBQTBCLGlCQUFpQixRQUFRLENBQUM7QUFDbkUsVUFBTSxJQUFJLGtDQUFrQyxVQUFVLEtBQUssdUJBQXVCLEtBQUssb0JBQW9CLENBQUM7QUFDNUcsU0FBSyxtQkFBbUIsSUFBSSxTQUFTLFFBQVE7QUFDN0MsVUFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLG1CQUFtQixPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBQ3JFLFNBQUssZ0JBQWdCLElBQUksU0FBUyxLQUFLO0FBQ3ZDLFNBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxxQ0FBcUMsT0FBTyxFQUFFO0FBQUEsRUFDbEY7QUFBQTtBQUFBLEVBR1EsbUJBQXlCO0FBQ2hDLGVBQVcsQ0FBQyxTQUFTLFFBQVEsS0FBSyxLQUFLLG9CQUFvQjtBQUMxRCxZQUFNLGlCQUFpQixLQUFLLHdCQUF3QixZQUFZO0FBQUEsUUFDL0QsT0FBSyxFQUFFLFlBQVksV0FBVyxnQ0FBZ0MsWUFBWSxFQUFFLE1BQU07QUFBQSxNQUNuRjtBQUNBLFVBQUksZ0JBQWdCO0FBQ25CLGNBQU0sYUFBYSxLQUFLLHdCQUF3QixjQUFjLE9BQU87QUFDckUsWUFBSSxZQUFZO0FBQ2YsbUJBQVMsY0FBYyxZQUFZLGVBQWUsZ0JBQWdCO0FBQUEsUUFDbkU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR1EsNEJBQWtDO0FBQ3pDLGVBQVcsQ0FBQyxTQUFTLFFBQVEsS0FBSyxLQUFLLG9CQUFvQjtBQUMxRCxZQUFNLGlCQUFpQixLQUFLLHdCQUF3QixZQUFZLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTztBQUMvRixVQUFJLGdCQUFnQjtBQUNuQixpQkFBUyxvQkFBb0IsZUFBZSxNQUFNO0FBQUEsTUFDbkQsV0FBVyxDQUFDLGdDQUFnQyxlQUFlLFNBQVMsaUJBQWlCLElBQUksQ0FBQyxHQUFHO0FBQzVGLGlCQUFTLG9CQUFvQixnQ0FBZ0MsWUFBWTtBQUFBLE1BQzFFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXZYYSxrQ0FDSSxLQUFLO0FBRFQsb0NBQU47QUFBQSxFQXNCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhDVTsiLAogICJuYW1lcyI6IFtdCn0K
