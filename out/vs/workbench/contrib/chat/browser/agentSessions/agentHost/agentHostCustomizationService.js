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
import { URI } from "../../../../../../base/common/uri.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { compare } from "../../../../../../base/common/strings.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableResourceMap, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { NKeyMap, ResourceSet } from "../../../../../../base/common/map.js";
import { StringSHA1 } from "../../../../../../base/common/hash.js";
import { AgentHostMcpServersConfigKey } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { IAgentHostConnectionsService } from "../../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { getEffectiveAgents } from "../../../../../../platform/agentHost/common/customAgents.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/protocol/actions.js";
import { CustomizationType, McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ROOT_STATE_URI, StateComponents } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { InstantiationType, registerSingleton } from "../../../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILoggerService, ILogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ContributionEnablementState, EnablementModel, isContributionEnabled } from "../../../common/enablement.js";
import { localize } from "../../../../../../nls.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { isUntitledChatSession } from "../../../common/model/chatUri.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { resolveMcpServerAuthentication, agentHostMcpServerId } from "./agentHostAuth.js";
import { IOutputService } from "../../../../../services/output/common/output.js";
const MCP_SERVER_ENABLEMENT_STORAGE_KEY = "chat.agentHost.mcpServerEnablement";
const IAgentHostCustomizationService = createDecorator("agentHostCustomizationService");
class NullAgentHostCustomizationService {
  constructor() {
    this.onDidChangeCustomAgents = Event.None;
    this.onDidChangeCustomizations = Event.None;
  }
  getCustomAgents(_sessionResource) {
    return [];
  }
  getCustomizations(_sessionResource) {
    return [];
  }
  getWorkingDirectory(sessionResource) {
    return void 0;
  }
  getWorkingDirectories(_sessionResource) {
    return [];
  }
  getMcpServers(_sessionResource) {
    return [];
  }
  addMcpServer(_sessionResource, _name, _config) {
  }
  authenticateMcpServer(_sessionResource, _serverId) {
    return Promise.resolve(false);
  }
  getMcpServerEnablement(_sessionResource, _serverName, _reader) {
    return ContributionEnablementState.EnabledProfile;
  }
  setMcpServerEnablement(_sessionResource, _serverName, _state) {
  }
  prepareMcpServersForTurn(_sessionResource) {
  }
  async showMcpServerLog(_sessionResource, _serverId, beforeShow) {
    await beforeShow?.();
  }
}
class AbstractAgentHostCustomizationService extends Disposable {
  constructor(_instantiationService, _logService, storageService) {
    super();
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    this._mcpServerTracking = new NKeyMap();
    /**
     * Sessions whose MCP diagnostics we mirror into per-server Output channels.
     * A session is tracked once the user reveals a server's output; from then
     * on every state change is recorded via {@link onDidChangeCustomizations},
     * so subsequent failures and recoveries land in the channel history.
     */
    this._mcpDiagnosticSessions = new ResourceSet();
    this._mcpEnablementModel = this._register(new EnablementModel(MCP_SERVER_ENABLEMENT_STORAGE_KEY, storageService));
    this._mcpLogRegistry = this._register(this._instantiationService.createInstance(AgentHostMcpServerLogRegistry));
    this._register(this.onDidChangeCustomizations(() => this._recordMcpDiagnostics()));
  }
  getCustomAgents(sessionResource) {
    return getEffectiveAgents(this._resolveTarget(sessionResource)?.customizations);
  }
  getCustomizations(sessionResource) {
    return this._resolveTarget(sessionResource)?.customizations ?? [];
  }
  getWorkingDirectory(sessionResource) {
    return this._resolveTarget(sessionResource)?.workingDirectory;
  }
  getWorkingDirectories(sessionResource) {
    return this._resolveTarget(sessionResource)?.workingDirectories ?? [];
  }
  getMcpServers(sessionResource) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return [];
    }
    return this._flattenMcpServers(target.customizations).map((c) => ({
      id: this._scopedMcpServerId(sessionResource, c.id),
      name: c.name,
      enabled: c.enabled,
      status: c.state.kind,
      state: c.state,
      logOutputChannelId: channelIdForMcpServer(sessionResource.toString(), c.id),
      setEnabled: (enabled) => target.setCustomizationEnabled(c.id, enabled),
      start: () => target.startMcpServer(c.id),
      stop: () => target.stopMcpServer(c.id)
    }));
  }
  showMcpServerLog(sessionResource, serverId, beforeShow) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return Promise.resolve();
    }
    const server = this._flattenMcpServers(target.customizations).find((c) => this._scopedMcpServerId(sessionResource, c.id) === serverId);
    if (!server) {
      return Promise.resolve();
    }
    this._trackMcpDiagnostics(sessionResource, target);
    const channelId = this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: server.enabled, state: server.state });
    return this._mcpLogRegistry.show(channelId, beforeShow);
  }
  /**
   * Registers `sessionResource` for MCP diagnostics mirroring and records the
   * currently-observed state of each of its servers. Idempotent: registering
   * an already-tracked session simply re-records (dedup'd by state signature).
   */
  _trackMcpDiagnostics(sessionResource, target) {
    this._mcpDiagnosticSessions.add(sessionResource);
    for (const server of this._flattenMcpServers(target.customizations)) {
      this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: server.enabled, state: server.state });
    }
  }
  /** Re-records every tracked session's MCP server states (on any customizations change). */
  _recordMcpDiagnostics() {
    for (const sessionResource of this._mcpDiagnosticSessions) {
      const target = this._resolveTarget(sessionResource);
      if (!target) {
        continue;
      }
      for (const server of this._flattenMcpServers(target.customizations)) {
        this._mcpLogRegistry.record({ sessionResource, rawId: server.id, name: server.name, enabled: server.enabled, state: server.state });
      }
    }
  }
  /** Stops mirroring and disposes all MCP diagnostics channels for a session that is going away. */
  _disposeMcpDiagnostics(sessionResource) {
    this._mcpDiagnosticSessions.delete(sessionResource);
    this._mcpLogRegistry.disposeForSession(sessionResource);
  }
  addMcpServer(sessionResource, name, config) {
    const target = this._resolveTarget(sessionResource);
    const existingServers = target?.rootConfig?.values?.[AgentHostMcpServersConfigKey];
    if (!target || !target.rootConfig) {
      return;
    }
    const servers = existingServers && typeof existingServers === "object" && !Array.isArray(existingServers) ? existingServers : {};
    target.setRootConfigValue(AgentHostMcpServersConfigKey, {
      ...servers,
      [name]: config
    });
  }
  async authenticateMcpServer(sessionResource, serverId) {
    const target = this._resolveTarget(sessionResource);
    if (!target) {
      return false;
    }
    const server = this._findMcpServer(target.customizations, serverId);
    if (!server || server.state.kind !== McpServerStatus.AuthRequired) {
      return false;
    }
    const scopedServerId = agentHostMcpServerId(sessionResource.authority, server.name, server.state.resource.resource);
    try {
      return await this._instantiationService.invokeFunction(resolveMcpServerAuthentication, server.state.resource, {
        allowInteraction: true,
        logPrefix: "[AgentHost]",
        mcpServerId: scopedServerId,
        mcpServerName: server.name,
        mcpServerUrl: server.state.resource.resource,
        oauthClient: server.state.oauthClient,
        scopes: server.state.requiredScopes ?? [],
        agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
        authenticate: (request) => target.authenticate(request)
      });
    } catch (err) {
      this._logService.error(`[AgentHost] Failed to authenticate MCP server '${server.name}'`, err);
      return false;
    }
  }
  getMcpServerEnablement(sessionResource, serverName, reader) {
    return this._mcpEnablementModel.readEnabledWithWorkspaceKey(
      this._mcpServerProfileEnablementKey(sessionResource, serverName),
      this._mcpServerWorkspaceEnablementKey(sessionResource, serverName),
      reader
    );
  }
  setMcpServerEnablement(sessionResource, serverName, state) {
    this._mcpEnablementModel.setEnabledWithWorkspaceKey(
      this._mcpServerProfileEnablementKey(sessionResource, serverName),
      this._mcpServerWorkspaceEnablementKey(sessionResource, serverName),
      state
    );
  }
  prepareMcpServersForTurn(sessionResource) {
    const trackingResource = this._mcpTrackingResource(sessionResource);
    const target = this._resolveTarget(trackingResource);
    if (!target) {
      return;
    }
    this._reconcileMcpServerTracking(trackingResource, this._flattenMcpServers(target.customizations), target);
  }
  /** Drops all durable-enablement tracking for a session that is no longer known. */
  _clearMcpServerTracking(sessionResource) {
    this._mcpServerTracking.deleteAll(this._mcpTrackingResource(sessionResource).toString());
  }
  _reconcileMcpServerTracking(sessionResource, servers, target) {
    const sessionKey = sessionResource.toString();
    const currentRawIds = new Set(servers.map((server) => server.id));
    for (const entry of this._mcpServerTracking.getAll(sessionKey)) {
      if (!currentRawIds.has(entry.rawId)) {
        this._mcpServerTracking.delete(sessionKey, entry.rawId);
      }
    }
    for (const server of servers) {
      const durableState = this.getMcpServerEnablement(sessionResource, server.name);
      const previous = this._mcpServerTracking.get(sessionKey, server.id);
      if (previous?.serverName === server.name && previous.durableState === durableState) {
        continue;
      }
      this._mcpServerTracking.set({ rawId: server.id, serverName: server.name, durableState }, sessionKey, server.id);
      if (previous || durableState !== ContributionEnablementState.EnabledProfile) {
        target.setCustomizationEnabled(server.id, isContributionEnabled(durableState));
      }
    }
  }
  _mcpServerProfileEnablementKey(sessionResource, serverName) {
    return JSON.stringify([sessionResource.scheme, serverName]);
  }
  _mcpServerWorkspaceEnablementKey(sessionResource, serverName) {
    const roots = this.getWorkingDirectories(sessionResource);
    if (roots.length === 0) {
      return void 0;
    }
    if (roots.length === 1) {
      return JSON.stringify([sessionResource.scheme, roots[0], serverName]);
    }
    const canonical = this._canonicalWorkspaceRoots(roots);
    if (canonical.length === 1) {
      return JSON.stringify([sessionResource.scheme, canonical[0], serverName]);
    }
    return JSON.stringify(["roots-v2", sessionResource.scheme, canonical, serverName]);
  }
  /**
   * De-duplicates working-directory roots by canonical URI identity (so
   * `file:///a` and `file:///a/` or case variants collapse to one root) and
   * returns a stable, order-independent list of representative strings.
   *
   * Order-independence requires that (a) a trailing path separator does not
   * change identity — {@link IExtUri.getComparisonKey} preserves it, so it is
   * stripped first — and (b) among case-variant spellings that share a
   * comparison key, a deterministic representative is chosen (the
   * lexicographically smallest) rather than the first one encountered.
   *
   * @example
   * // Distinct roots (any order) → same sorted list:
   * _canonicalWorkspaceRoots(['file:///b', 'file:///a']) // ['file:///a', 'file:///b']
   * _canonicalWorkspaceRoots(['file:///a', 'file:///b']) // ['file:///a', 'file:///b']
   *
   * // Trailing separator collapses (`/a/` === `/a`):
   * _canonicalWorkspaceRoots(['file:///a/', 'file:///a']) // ['file:///a']
   *
   * // Case-variant spellings of one root collapse to the smallest spelling,
   * // regardless of order (for case-insensitive schemes):
   * _canonicalWorkspaceRoots(['vscode-remote://h/Repo', 'vscode-remote://h/repo'])
   * _canonicalWorkspaceRoots(['vscode-remote://h/repo', 'vscode-remote://h/Repo'])
   * // both → ['vscode-remote://h/Repo']  ('R' (0x52) sorts before 'r' (0x72))
   */
  _canonicalWorkspaceRoots(roots) {
    const byComparisonKey = /* @__PURE__ */ new Map();
    for (const root of roots) {
      let key;
      let representative;
      try {
        const uri = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(URI.parse(root));
        key = extUriBiasedIgnorePathCase.getComparisonKey(uri);
        representative = uri.toString();
      } catch {
        key = root;
        representative = root;
      }
      const existing = byComparisonKey.get(key);
      if (existing === void 0 || compare(representative, existing) < 0) {
        byComparisonKey.set(key, representative);
      }
    }
    return [...byComparisonKey.values()].sort(compare);
  }
  _mcpTrackingResource(sessionResource) {
    return sessionResource.fragment ? sessionResource.with({ fragment: null }) : sessionResource;
  }
  _fireCustomAgentsChanged() {
    this._onDidChangeCustomAgents.fire();
  }
  _fireCustomizationsChanged() {
    this._onDidChangeCustomizations.fire();
  }
  _flattenMcpServers(customizations) {
    return customizations.flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children?.filter((c2) => c2.type === CustomizationType.McpServer) ?? []);
  }
  _findMcpServer(customizations, serverId) {
    for (const server of this._flattenMcpServers(customizations)) {
      if (server.id === serverId || this._isScopedMcpServerIdForRawId(serverId, server.id)) {
        return server;
      }
    }
    return void 0;
  }
  _scopedMcpServerId(sessionResource, rawId) {
    return `${sessionResource.authority}/${rawId}`;
  }
  _isScopedMcpServerIdForRawId(serverId, rawId) {
    const separator = serverId.indexOf("/");
    return separator >= 0 && serverId.slice(separator + 1) === rawId;
  }
}
let WorkbenchAgentHostCustomizationService = class extends AbstractAgentHostCustomizationService {
  constructor(_connectionsService, _provisionalSessionService, instantiationService, logService, _chatService, storageService) {
    super(instantiationService, logService, storageService);
    this._connectionsService = _connectionsService;
    this._provisionalSessionService = _provisionalSessionService;
    this._chatService = _chatService;
    this._sessionStateSubscriptions = this._register(new DisposableResourceMap());
    this._register(this._connectionsService.ambientConnection.onDidAction((envelope) => {
      switch (envelope.action.type) {
        case ActionType.SessionCustomizationsChanged:
        case ActionType.SessionCustomizationUpdated:
        case ActionType.SessionMcpServerStateChanged:
          this._fireCustomizationsChanged();
          this._fireCustomAgentsChanged();
          break;
      }
    }));
    this._register(this._provisionalSessionService.onDidChange((sessionResource) => {
      const existing = this._sessionStateSubscriptions.get(sessionResource);
      const currentBackend = this._provisionalSessionService.get(sessionResource);
      if (existing && existing.backendSession.toString() !== currentBackend?.toString()) {
        this._clearMcpServerTracking(sessionResource);
        this._disposeMcpDiagnostics(sessionResource);
      }
      this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    }));
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        this._sessionStateSubscriptions.deleteAndDispose(sessionResource);
        this._clearMcpServerTracking(sessionResource);
        this._disposeMcpDiagnostics(sessionResource);
      }
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    }));
  }
  _resolveTarget(sessionResource) {
    const target = this._resolveSessionTarget(sessionResource);
    if (!target) {
      return void 0;
    }
    const sessionState = this._readSessionState(sessionResource);
    const rootState = target.connection.rootState.value;
    const channel = target.backendSession.toString();
    return {
      customizations: sessionState?.customizations ?? [],
      workingDirectory: sessionState?.workingDirectories?.[0],
      workingDirectories: sessionState?.workingDirectories,
      rootConfig: rootState && !(rootState instanceof Error) ? rootState.config : void 0,
      authenticate: (request) => target.connection.authenticate(request),
      setCustomizationEnabled: (rawId, enabled) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionCustomizationToggled,
          id: rawId,
          enabled
        });
      },
      startMcpServer: (rawId) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionMcpServerStartRequested,
          id: rawId
        });
        return Promise.resolve();
      },
      stopMcpServer: (rawId) => {
        target.connection.dispatch(channel, {
          type: ActionType.SessionMcpServerStopRequested,
          id: rawId
        });
        return Promise.resolve();
      },
      setRootConfigValue: (property, value) => {
        target.connection.dispatch(ROOT_STATE_URI, {
          type: ActionType.RootConfigChanged,
          config: { [property]: value }
        });
      }
    };
  }
  _readSessionState(sessionResource) {
    const target = this._resolveSessionTarget(sessionResource);
    const value = target ? this._ensureSessionStateSubscription(sessionResource, target)?.sub.value : void 0;
    return value && !(value instanceof Error) ? value : void 0;
  }
  _ensureSessionStateSubscription(sessionResource, target) {
    const existing = this._sessionStateSubscriptions.get(sessionResource);
    if (existing?.backendSession.toString() === target.backendSession.toString() && existing.connection === target.connection) {
      return existing;
    }
    const ref = target.connection.getSubscription(StateComponents.Session, target.backendSession, "AgentHostCustomizationService");
    const sub = ref.object;
    const listener = sub.onDidChange(() => {
      this._fireCustomizationsChanged();
      this._fireCustomAgentsChanged();
    });
    const entry = {
      connection: target.connection,
      backendSession: target.backendSession,
      sub,
      dispose: () => {
        listener.dispose();
        ref.dispose();
      }
    };
    this._sessionStateSubscriptions.set(sessionResource, entry);
    return entry;
  }
  /**
   * Resolves a chat session resource to the backend agent-session URI plus
   * the {@link IAgentConnection} (local or remote) that owns it. Returns
   * `undefined` for sessions not backed by an agent host.
   */
  _resolveSessionTarget(sessionResource) {
    const provisionalSession = this._provisionalSessionService.get(sessionResource);
    if (provisionalSession) {
      return { connection: this._connectionsService.ambientConnection, backendSession: provisionalSession };
    }
    if (isUntitledChatSession(sessionResource)) {
      return void 0;
    }
    return this._connectionsService.resolveSessionResource(sessionResource);
  }
};
WorkbenchAgentHostCustomizationService = __decorateClass([
  __decorateParam(0, IAgentHostConnectionsService),
  __decorateParam(1, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IStorageService)
], WorkbenchAgentHostCustomizationService);
registerSingleton(IAgentHostCustomizationService, WorkbenchAgentHostCustomizationService, InstantiationType.Delayed);
let AgentHostMcpServerLogRegistry = class extends Disposable {
  constructor(_loggerService, _outputService) {
    super();
    this._loggerService = _loggerService;
    this._outputService = _outputService;
    this._entries = /* @__PURE__ */ new Map();
    /** Channel ids grouped by owning session key, so a session teardown can dispose them all. */
    this._bySession = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      for (const key of [...this._bySession.keys()]) {
        this._disposeSessionKey(key);
      }
    }));
  }
  /**
   * Ensures a hidden diagnostics channel exists for the MCP server identified
   * by `(sessionResource, rawId)` and records a line whenever its state
   * changes (including the first observed state). Returns the stable channel
   * id for the service to reveal via {@link show} -- the id is internal.
   */
  record(server) {
    const sessionKey = server.sessionResource.toString();
    const channelId = channelIdForMcpServer(sessionKey, server.rawId);
    let entry = this._entries.get(channelId);
    if (!entry) {
      const logger = this._loggerService.createLogger(channelId, {
        hidden: true,
        name: localize("agentHost.mcpServer.outputChannel", "MCP: {0}", server.name)
      });
      const dispose = () => {
        logger.dispose();
        this._loggerService.deregisterLogger(channelId);
      };
      entry = { logger, dispose, lastSignature: void 0 };
      this._entries.set(channelId, entry);
      let group = this._bySession.get(sessionKey);
      if (!group) {
        group = /* @__PURE__ */ new Set();
        this._bySession.set(sessionKey, group);
      }
      group.add(channelId);
    }
    const { signature, message, isError } = describeMcpServerState(server.name, server.enabled, server.state);
    if (entry.lastSignature !== signature) {
      entry.lastSignature = signature;
      if (isError) {
        entry.logger.error(message);
      } else {
        entry.logger.info(message);
      }
    }
    return channelId;
  }
  /** Reveals the diagnostics channel `channelId`, making its hidden logger visible. */
  async show(channelId, beforeShow) {
    if (!this._entries.has(channelId)) {
      return;
    }
    this._loggerService.setVisibility(channelId, true);
    await beforeShow?.();
    await this._outputService.showChannel(channelId);
  }
  /** Disposes every channel/logger owned by `sessionResource` (session teardown). */
  disposeForSession(sessionResource) {
    this._disposeSessionKey(sessionResource.toString());
  }
  _disposeSessionKey(sessionKey) {
    const group = this._bySession.get(sessionKey);
    if (!group) {
      return;
    }
    this._bySession.delete(sessionKey);
    for (const channelId of group) {
      this._entries.get(channelId)?.dispose();
      this._entries.delete(channelId);
    }
  }
};
AgentHostMcpServerLogRegistry = __decorateClass([
  __decorateParam(0, ILoggerService),
  __decorateParam(1, IOutputService)
], AgentHostMcpServerLogRegistry);
function channelIdForMcpServer(sessionKey, rawId) {
  const sha = new StringSHA1();
  sha.update(sessionKey);
  sha.update("\0");
  sha.update(rawId);
  return `agentHostMcpServer.${sha.digest()}`;
}
function describeMcpServerState(name, enabled, state) {
  if (!enabled) {
    return { signature: "disabled", message: localize("agentHost.mcpServer.disabled", "Server '{0}' is disabled", name), isError: false };
  }
  switch (state.kind) {
    case McpServerStatus.Ready:
      return { signature: "ready", message: localize("agentHost.mcpServer.ready", "Server '{0}' is running", name), isError: false };
    case McpServerStatus.Starting:
      return { signature: "starting", message: localize("agentHost.mcpServer.starting", "Server '{0}' is starting", name), isError: false };
    case McpServerStatus.AuthRequired:
      return { signature: `authRequired:${state.resource.resource}`, message: localize("agentHost.mcpServer.authRequired", "Server '{0}' requires authentication ({1})", name, state.resource.resource), isError: false };
    case McpServerStatus.Error:
      return { signature: `error:${state.error.errorType}:${state.error.message}`, message: localize("agentHost.mcpServer.error", "Server '{0}' failed: {1}", name, state.error.message), isError: true };
    case McpServerStatus.Stopped:
    default:
      return { signature: "stopped", message: localize("agentHost.mcpServer.stopped", "Server '{0}' is stopped", name), isError: false };
  }
}
export {
  AbstractAgentHostCustomizationService,
  IAgentHostCustomizationService,
  NullAgentHostCustomizationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVSZXNvdXJjZU1hcCwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOS2V5TWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdTSEExIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJUmVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNY3BTZXJ2ZXJzLCBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UsIElBZ2VudEhvc3RTZXNzaW9uUmVzb2x1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEVmZmVjdGl2ZUFnZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY3VzdG9tQWdlbnRzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJTdGF0ZSwgdHlwZSBSb290Q29uZmlnU3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb24sIFJPT1RfU1RBVEVfVVJJLCBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgRW5hYmxlbWVudE1vZGVsLCBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RNY3BTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyByZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24sIGFnZW50SG9zdE1jcFNlcnZlcklkIH0gZnJvbSAnLi9hZ2VudEhvc3RBdXRoLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuXG5jb25zdCBNQ1BfU0VSVkVSX0VOQUJMRU1FTlRfU1RPUkFHRV9LRVkgPSAnY2hhdC5hZ2VudEhvc3QubWNwU2VydmVyRW5hYmxlbWVudCc7XG5cbmludGVyZmFjZSBJTWNwU2VydmVyVHJhY2tpbmdFbnRyeSB7XG5cdHJlYWRvbmx5IHJhd0lkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZHVyYWJsZVN0YXRlOiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGU7XG59XG5cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlPignYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9uczogRXZlbnQ8dm9pZD47XG5cblx0Z2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW107XG5cblx0Z2V0Q3VzdG9taXphdGlvbnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBDdXN0b21pemF0aW9uW107XG5cblx0Z2V0V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIGZ1bGwgb3JkZXJlZCBzZXQgb2Ygd29ya2luZy1kaXJlY3Rvcnkgcm9vdHMgZm9yIGEgc2Vzc2lvbiAoaW5kZXggMCA9XG5cdCAqIHByaW1hcnkpLiBVc2VkIGFzIHRoZSB3b3Jrc3BhY2UgaWRlbnRpdHkgZm9yIGR1cmFibGUgTUNQLXNlcnZlciBlbmFibGVtZW50LlxuXHQgKiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGZvciBzZXNzaW9ucyB3aXRoIG5vIHdvcmtpbmcgZGlyZWN0b3J5LlxuXHQgKi9cblx0Z2V0V29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIE1DUCBzZXJ2ZXJzIGV4cG9zZWQgYnkgYW4gYWdlbnQtaG9zdCBzZXNzaW9uLiBFYWNoIGVudHJ5XG5cdCAqIGNhcnJpZXMgdGhlIGN1cnJlbnQgc3RhdHVzLCBhIHtAbGluayBJQWdlbnRIb3N0TWNwU2VydmVyLnNldEVuYWJsZWR9XG5cdCAqIG1ldGhvZCB0aGF0IGRpc3BhdGNoZXMgdGhlIHByb3RvY29sLWxldmVsIHRvZ2dsZSBvbiBiZWhhbGYgb2YgdGhlXG5cdCAqIGNhbGxlciwgYW5kIGxpZmVjeWNsZSBhY3Rpb25zLiBQZXItc2VydmVyIGRpYWdub3N0aWNzIGFyZSByZXZlYWxlZCB2aWFcblx0ICoge0BsaW5rIHNob3dNY3BTZXJ2ZXJMb2d9LiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGZvciBzZXNzaW9ucyBub3Rcblx0ICogYmFja2VkIGJ5IGFuIGFnZW50IGhvc3QsIG9yIHRoYXQgZG9uJ3QgZXhwb3NlIGFueSBNQ1Agc2VydmVycy5cblx0ICovXG5cdGdldE1jcFNlcnZlcnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRIb3N0TWNwU2VydmVyW107XG5cblx0LyoqXG5cdCAqIEFkZHMgKG9yIHJlcGxhY2VzKSBhbiBhZ2VudC1ob3N0LWxldmVsIE1DUCBzZXJ2ZXIgaW4gdGhlIHJvb3QgY29uZmlnIG9mXG5cdCAqIHRoZSBhZ2VudCBob3N0IGJhY2tpbmcgYHNlc3Npb25SZXNvdXJjZWAuIFRoZSB3cml0ZSBpcyByb3V0ZWQgdG8gdGhlXG5cdCAqIGNvcnJlY3QgY29ubmVjdGlvbiAobG9jYWwgb3IgcmVtb3RlKSBmb3IgdGhhdCBzZXNzaW9uLiBOby1vcCBmb3Jcblx0ICogc2Vzc2lvbnMgbm90IGJhY2tlZCBieSBhbiBhZ2VudCBob3N0LlxuXHQgKi9cblx0YWRkTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZTogVVJJLCBuYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSdW5zIGludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uIGZvciBhbiBhdXRoLXJlcXVpcmVkIE1DUCBzZXJ2ZXIgaW4gYW5cblx0ICogYWdlbnQtaG9zdCBzZXNzaW9uLiBSZXR1cm5zIGZhbHNlIHdoZW4gdGhlIHNlc3Npb24vc2VydmVyIGNhbm5vdCBiZVxuXHQgKiByZXNvbHZlZCBvciBhdXRoZW50aWNhdGlvbiBkaWQgbm90IGNvbXBsZXRlLlxuXHQgKi9cblx0YXV0aGVudGljYXRlTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPjtcblxuXHQvKiogUmVhZHMgdGhlIGR1cmFibGUgcHJvZmlsZS93b3Jrc3BhY2UgcG9saWN5IHNoYXJlZCBieSBtYXRjaGluZyBzZXJ2ZXJzIG9uIHRoZSBzYW1lIGFnZW50IGhvc3QuICovXG5cdGdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlck5hbWU6IHN0cmluZywgcmVhZGVyPzogSVJlYWRlcik6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZTtcblxuXHQvKiogUGVyc2lzdHMgYSBkdXJhYmxlIHBvbGljeSB0aGF0IHdpbGwgYXBwbHkgYmVmb3JlIHRoZSBzZXNzaW9uJ3MgbmV4dCB0dXJuLiAqL1xuXHRzZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIHN0YXRlOiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUpOiB2b2lkO1xuXG5cdC8qKiBBcHBsaWVzIGR1cmFibGUgTUNQIHByZWZlcmVuY2VzIHRoYXQgY2hhbmdlZCBzaW5jZSB0aGlzIHNlc3Npb24ncyBwcmV2aW91cyB0dXJuLiAqL1xuXHRwcmVwYXJlTWNwU2VydmVyc0ZvclR1cm4oc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXZlYWxzIHRoZSBwZXItc2VydmVyIE1DUCBkaWFnbm9zdGljcyBPdXRwdXQgY2hhbm5lbCBmb3IgdGhlIHNlcnZlclxuXHQgKiBgc2VydmVySWRgIGluIHRoZSBhZ2VudC1ob3N0IHNlc3Npb24gYHNlc3Npb25SZXNvdXJjZWAsIG1ha2luZyBpdHMgaGlkZGVuXG5cdCAqIGxvZ2dlciB2aXNpYmxlIGZpcnN0LiBUaGUgY2hhbm5lbCBpcyBhbiBpbnRlcm5hbCBkZXRhaWwgb2YgdGhpcyBzZXJ2aWNlIC0tXG5cdCAqIGNhbGxlcnMgaWRlbnRpZnkgdGhlIHNlcnZlciB0aGUgc2FtZSB3YXkgdGhleSBkbyBmb3Jcblx0ICoge0BsaW5rIGF1dGhlbnRpY2F0ZU1jcFNlcnZlcn0uIE5vLW9wIHdoZW4gdGhlIHNlc3Npb24vc2VydmVyIGNhbm5vdCBiZVxuXHQgKiByZXNvbHZlZC5cblx0ICovXG5cdHNob3dNY3BTZXJ2ZXJMb2coc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcklkOiBzdHJpbmcsIGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNsYXNzIE51bGxBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRnZXRDdXN0b21BZ2VudHMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRnZXRDdXN0b21pemF0aW9ucyhfc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRnZXRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGdldFdvcmtpbmdEaXJlY3Rvcmllcyhfc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGdldE1jcFNlcnZlcnMoX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgSUFnZW50SG9zdE1jcFNlcnZlcltdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0YWRkTWNwU2VydmVyKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX25hbWU6IHN0cmluZywgX2NvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cdGF1dGhlbnRpY2F0ZU1jcFNlcnZlcihfc2Vzc2lvblJlc291cmNlOiBVUkksIF9zZXJ2ZXJJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdH1cblx0Z2V0TWNwU2VydmVyRW5hYmxlbWVudChfc2Vzc2lvblJlc291cmNlOiBVUkksIF9zZXJ2ZXJOYW1lOiBzdHJpbmcsIF9yZWFkZXI/OiBJUmVhZGVyKTogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIHtcblx0XHRyZXR1cm4gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlO1xuXHR9XG5cdHNldE1jcFNlcnZlckVuYWJsZW1lbnQoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfc2VydmVyTmFtZTogc3RyaW5nLCBfc3RhdGU6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblx0cHJlcGFyZU1jcFNlcnZlcnNGb3JUdXJuKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblx0YXN5bmMgc2hvd01jcFNlcnZlckxvZyhfc2Vzc2lvblJlc291cmNlOiBVUkksIF9zZXJ2ZXJJZDogc3RyaW5nLCBiZWZvcmVTaG93PzogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGJlZm9yZVNob3c/LigpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25UYXJnZXQge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nO1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgcm9vdENvbmZpZz86IFJvb3RDb25maWdTdGF0ZTtcblx0YXV0aGVudGljYXRlKHJlcXVlc3Q6IHsgcmVzb3VyY2U6IHN0cmluZzsgc2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107IHRva2VuOiBzdHJpbmcgfSk6IFByb21pc2U8dW5rbm93bj47XG5cdHNldEN1c3RvbWl6YXRpb25FbmFibGVkKHJhd0lkOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHRzdGFydE1jcFNlcnZlcihyYXdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0c3RvcE1jcFNlcnZlcihyYXdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0Um9vdENvbmZpZ1ZhbHVlKHByb3BlcnR5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0QWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUN1c3RvbUFnZW50cy5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9uczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcEVuYWJsZW1lbnRNb2RlbDogRW5hYmxlbWVudE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2ZXJUcmFja2luZyA9IG5ldyBOS2V5TWFwPElNY3BTZXJ2ZXJUcmFja2luZ0VudHJ5LCBbc3RyaW5nLCBzdHJpbmddPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BMb2dSZWdpc3RyeTogQWdlbnRIb3N0TWNwU2VydmVyTG9nUmVnaXN0cnk7XG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB3aG9zZSBNQ1AgZGlhZ25vc3RpY3Mgd2UgbWlycm9yIGludG8gcGVyLXNlcnZlciBPdXRwdXQgY2hhbm5lbHMuXG5cdCAqIEEgc2Vzc2lvbiBpcyB0cmFja2VkIG9uY2UgdGhlIHVzZXIgcmV2ZWFscyBhIHNlcnZlcidzIG91dHB1dDsgZnJvbSB0aGVuXG5cdCAqIG9uIGV2ZXJ5IHN0YXRlIGNoYW5nZSBpcyByZWNvcmRlZCB2aWEge0BsaW5rIG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnN9LFxuXHQgKiBzbyBzdWJzZXF1ZW50IGZhaWx1cmVzIGFuZCByZWNvdmVyaWVzIGxhbmQgaW4gdGhlIGNoYW5uZWwgaGlzdG9yeS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcERpYWdub3N0aWNTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21jcEVuYWJsZW1lbnRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbmFibGVtZW50TW9kZWwoTUNQX1NFUlZFUl9FTkFCTEVNRU5UX1NUT1JBR0VfS0VZLCBzdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMuX21jcExvZ1JlZ2lzdHJ5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0TWNwU2VydmVyTG9nUmVnaXN0cnkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMoKCkgPT4gdGhpcy5fcmVjb3JkTWNwRGlhZ25vc3RpY3MoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25UYXJnZXQgfCB1bmRlZmluZWQ7XG5cblx0Z2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQWdlbnRDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiBnZXRFZmZlY3RpdmVBZ2VudHModGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2UpPy5jdXN0b21pemF0aW9ucyk7XG5cdH1cblxuXHRnZXRDdXN0b21pemF0aW9ucyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKT8uY3VzdG9taXphdGlvbnMgPz8gW107XG5cdH1cblxuXHRnZXRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2UpPy53b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0Z2V0V29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk/LndvcmtpbmdEaXJlY3RvcmllcyA/PyBbXTtcblx0fVxuXG5cdGdldE1jcFNlcnZlcnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBJQWdlbnRIb3N0TWNwU2VydmVyW10ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZmxhdHRlbk1jcFNlcnZlcnModGFyZ2V0LmN1c3RvbWl6YXRpb25zKVxuXHRcdFx0Lm1hcCgoYyk6IElBZ2VudEhvc3RNY3BTZXJ2ZXIgPT4gKHtcblx0XHRcdFx0aWQ6IHRoaXMuX3Njb3BlZE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZSwgYy5pZCksXG5cdFx0XHRcdG5hbWU6IGMubmFtZSxcblx0XHRcdFx0ZW5hYmxlZDogYy5lbmFibGVkLFxuXHRcdFx0XHRzdGF0dXM6IGMuc3RhdGUua2luZCxcblx0XHRcdFx0c3RhdGU6IGMuc3RhdGUsXG5cdFx0XHRcdGxvZ091dHB1dENoYW5uZWxJZDogY2hhbm5lbElkRm9yTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCBjLmlkKSxcblx0XHRcdFx0c2V0RW5hYmxlZDogKGVuYWJsZWQ6IGJvb2xlYW4pID0+IHRhcmdldC5zZXRDdXN0b21pemF0aW9uRW5hYmxlZChjLmlkLCBlbmFibGVkKSxcblx0XHRcdFx0c3RhcnQ6ICgpID0+IHRhcmdldC5zdGFydE1jcFNlcnZlcihjLmlkKSxcblx0XHRcdFx0c3RvcDogKCkgPT4gdGFyZ2V0LnN0b3BNY3BTZXJ2ZXIoYy5pZCksXG5cdFx0XHR9KSk7XG5cdH1cblxuXHRzaG93TWNwU2VydmVyTG9nKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJJZDogc3RyaW5nLCBiZWZvcmVTaG93PzogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpLmZpbmQoYyA9PiB0aGlzLl9zY29wZWRNY3BTZXJ2ZXJJZChzZXNzaW9uUmVzb3VyY2UsIGMuaWQpID09PSBzZXJ2ZXJJZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Ly8gRW5zdXJlIHRoZSBzZXNzaW9uIGlzIHRyYWNrZWQgYW5kIGl0cyBjaGFubmVscyBleGlzdCwgdGhlbiByZXZlYWwuXG5cdFx0dGhpcy5fdHJhY2tNY3BEaWFnbm9zdGljcyhzZXNzaW9uUmVzb3VyY2UsIHRhcmdldCk7XG5cdFx0Y29uc3QgY2hhbm5lbElkID0gdGhpcy5fbWNwTG9nUmVnaXN0cnkucmVjb3JkKHsgc2Vzc2lvblJlc291cmNlLCByYXdJZDogc2VydmVyLmlkLCBuYW1lOiBzZXJ2ZXIubmFtZSwgZW5hYmxlZDogc2VydmVyLmVuYWJsZWQsIHN0YXRlOiBzZXJ2ZXIuc3RhdGUgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX21jcExvZ1JlZ2lzdHJ5LnNob3coY2hhbm5lbElkLCBiZWZvcmVTaG93KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYHNlc3Npb25SZXNvdXJjZWAgZm9yIE1DUCBkaWFnbm9zdGljcyBtaXJyb3JpbmcgYW5kIHJlY29yZHMgdGhlXG5cdCAqIGN1cnJlbnRseS1vYnNlcnZlZCBzdGF0ZSBvZiBlYWNoIG9mIGl0cyBzZXJ2ZXJzLiBJZGVtcG90ZW50OiByZWdpc3RlcmluZ1xuXHQgKiBhbiBhbHJlYWR5LXRyYWNrZWQgc2Vzc2lvbiBzaW1wbHkgcmUtcmVjb3JkcyAoZGVkdXAnZCBieSBzdGF0ZSBzaWduYXR1cmUpLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2tNY3BEaWFnbm9zdGljcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblRhcmdldCk6IHZvaWQge1xuXHRcdHRoaXMuX21jcERpYWdub3N0aWNTZXNzaW9ucy5hZGQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHR0aGlzLl9tY3BMb2dSZWdpc3RyeS5yZWNvcmQoeyBzZXNzaW9uUmVzb3VyY2UsIHJhd0lkOiBzZXJ2ZXIuaWQsIG5hbWU6IHNlcnZlci5uYW1lLCBlbmFibGVkOiBzZXJ2ZXIuZW5hYmxlZCwgc3RhdGU6IHNlcnZlci5zdGF0ZSB9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmUtcmVjb3JkcyBldmVyeSB0cmFja2VkIHNlc3Npb24ncyBNQ1Agc2VydmVyIHN0YXRlcyAob24gYW55IGN1c3RvbWl6YXRpb25zIGNoYW5nZSkuICovXG5cdHByaXZhdGUgX3JlY29yZE1jcERpYWdub3N0aWNzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvblJlc291cmNlIG9mIHRoaXMuX21jcERpYWdub3N0aWNTZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHRcdHRoaXMuX21jcExvZ1JlZ2lzdHJ5LnJlY29yZCh7IHNlc3Npb25SZXNvdXJjZSwgcmF3SWQ6IHNlcnZlci5pZCwgbmFtZTogc2VydmVyLm5hbWUsIGVuYWJsZWQ6IHNlcnZlci5lbmFibGVkLCBzdGF0ZTogc2VydmVyLnN0YXRlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBTdG9wcyBtaXJyb3JpbmcgYW5kIGRpc3Bvc2VzIGFsbCBNQ1AgZGlhZ25vc3RpY3MgY2hhbm5lbHMgZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIGdvaW5nIGF3YXkuICovXG5cdHByb3RlY3RlZCBfZGlzcG9zZU1jcERpYWdub3N0aWNzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fbWNwRGlhZ25vc3RpY1Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX21jcExvZ1JlZ2lzdHJ5LmRpc3Bvc2VGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhZGRNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlOiBVUkksIG5hbWU6IHN0cmluZywgY29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVUYXJnZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZ1NlcnZlcnMgPSB0YXJnZXQ/LnJvb3RDb25maWc/LnZhbHVlcz8uW0FnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXldO1xuXHRcdGlmICghdGFyZ2V0IHx8ICF0YXJnZXQucm9vdENvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJzOiBBZ2VudEhvc3RNY3BTZXJ2ZXJzID0gZXhpc3RpbmdTZXJ2ZXJzICYmIHR5cGVvZiBleGlzdGluZ1NlcnZlcnMgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGV4aXN0aW5nU2VydmVycylcblx0XHRcdD8gZXhpc3RpbmdTZXJ2ZXJzIGFzIEFnZW50SG9zdE1jcFNlcnZlcnNcblx0XHRcdDoge307XG5cdFx0dGFyZ2V0LnNldFJvb3RDb25maWdWYWx1ZShBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5LCB7XG5cdFx0XHQuLi5zZXJ2ZXJzLFxuXHRcdFx0W25hbWVdOiBjb25maWcsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fZmluZE1jcFNlcnZlcih0YXJnZXQuY3VzdG9taXphdGlvbnMsIHNlcnZlcklkKTtcblx0XHRpZiAoIXNlcnZlciB8fCBzZXJ2ZXIuc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzY29wZWRTZXJ2ZXJJZCA9IGFnZW50SG9zdE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksIHNlcnZlci5uYW1lLCBzZXJ2ZXIuc3RhdGUucmVzb3VyY2UucmVzb3VyY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZU1jcFNlcnZlckF1dGhlbnRpY2F0aW9uLCBzZXJ2ZXIuc3RhdGUucmVzb3VyY2UsIHtcblx0XHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogdHJ1ZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW0FnZW50SG9zdF0nLFxuXHRcdFx0XHRtY3BTZXJ2ZXJJZDogc2NvcGVkU2VydmVySWQsXG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRtY3BTZXJ2ZXJVcmw6IHNlcnZlci5zdGF0ZS5yZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdFx0b2F1dGhDbGllbnQ6IHNlcnZlci5zdGF0ZS5vYXV0aENsaWVudCxcblx0XHRcdFx0c2NvcGVzOiBzZXJ2ZXIuc3RhdGUucmVxdWlyZWRTY29wZXMgPz8gW10sXG5cdFx0XHRcdGFnZW50SG9zdDogeyBzY2hlbWU6IHNlc3Npb25SZXNvdXJjZS5zY2hlbWUsIGF1dGhvcml0eTogc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSB9LFxuXHRcdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGFyZ2V0LmF1dGhlbnRpY2F0ZShyZXF1ZXN0KSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdF0gRmFpbGVkIHRvIGF1dGhlbnRpY2F0ZSBNQ1Agc2VydmVyICcke3NlcnZlci5uYW1lfSdgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGdldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlck5hbWU6IHN0cmluZywgcmVhZGVyPzogSVJlYWRlcik6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX21jcEVuYWJsZW1lbnRNb2RlbC5yZWFkRW5hYmxlZFdpdGhXb3Jrc3BhY2VLZXkoXG5cdFx0XHR0aGlzLl9tY3BTZXJ2ZXJQcm9maWxlRW5hYmxlbWVudEtleShzZXNzaW9uUmVzb3VyY2UsIHNlcnZlck5hbWUpLFxuXHRcdFx0dGhpcy5fbWNwU2VydmVyV29ya3NwYWNlRW5hYmxlbWVudEtleShzZXNzaW9uUmVzb3VyY2UsIHNlcnZlck5hbWUpLFxuXHRcdFx0cmVhZGVyLFxuXHRcdCk7XG5cdH1cblxuXHRzZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJOYW1lOiBzdHJpbmcsIHN0YXRlOiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9tY3BFbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZFdpdGhXb3Jrc3BhY2VLZXkoXG5cdFx0XHR0aGlzLl9tY3BTZXJ2ZXJQcm9maWxlRW5hYmxlbWVudEtleShzZXNzaW9uUmVzb3VyY2UsIHNlcnZlck5hbWUpLFxuXHRcdFx0dGhpcy5fbWNwU2VydmVyV29ya3NwYWNlRW5hYmxlbWVudEtleShzZXNzaW9uUmVzb3VyY2UsIHNlcnZlck5hbWUpLFxuXHRcdFx0c3RhdGUsXG5cdFx0KTtcblx0fVxuXG5cdHByZXBhcmVNY3BTZXJ2ZXJzRm9yVHVybihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHRyYWNraW5nUmVzb3VyY2UgPSB0aGlzLl9tY3BUcmFja2luZ1Jlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZVRhcmdldCh0cmFja2luZ1Jlc291cmNlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbmNpbGVNY3BTZXJ2ZXJUcmFja2luZyh0cmFja2luZ1Jlc291cmNlLCB0aGlzLl9mbGF0dGVuTWNwU2VydmVycyh0YXJnZXQuY3VzdG9taXphdGlvbnMpLCB0YXJnZXQpO1xuXHR9XG5cblx0LyoqIERyb3BzIGFsbCBkdXJhYmxlLWVuYWJsZW1lbnQgdHJhY2tpbmcgZm9yIGEgc2Vzc2lvbiB0aGF0IGlzIG5vIGxvbmdlciBrbm93bi4gKi9cblx0cHJvdGVjdGVkIF9jbGVhck1jcFNlcnZlclRyYWNraW5nKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fbWNwU2VydmVyVHJhY2tpbmcuZGVsZXRlQWxsKHRoaXMuX21jcFRyYWNraW5nUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKS50b1N0cmluZygpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZU1jcFNlcnZlclRyYWNraW5nKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJzOiByZWFkb25seSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10sIHRhcmdldDogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25UYXJnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY3VycmVudFJhd0lkcyA9IG5ldyBTZXQoc2VydmVycy5tYXAoc2VydmVyID0+IHNlcnZlci5pZCkpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbWNwU2VydmVyVHJhY2tpbmcuZ2V0QWxsKHNlc3Npb25LZXkpKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRSYXdJZHMuaGFzKGVudHJ5LnJhd0lkKSkge1xuXHRcdFx0XHR0aGlzLl9tY3BTZXJ2ZXJUcmFja2luZy5kZWxldGUoc2Vzc2lvbktleSwgZW50cnkucmF3SWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdGNvbnN0IGR1cmFibGVTdGF0ZSA9IHRoaXMuZ2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5uYW1lKTtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fbWNwU2VydmVyVHJhY2tpbmcuZ2V0KHNlc3Npb25LZXksIHNlcnZlci5pZCk7XG5cdFx0XHRpZiAocHJldmlvdXM/LnNlcnZlck5hbWUgPT09IHNlcnZlci5uYW1lICYmIHByZXZpb3VzLmR1cmFibGVTdGF0ZSA9PT0gZHVyYWJsZVN0YXRlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWNwU2VydmVyVHJhY2tpbmcuc2V0KHsgcmF3SWQ6IHNlcnZlci5pZCwgc2VydmVyTmFtZTogc2VydmVyLm5hbWUsIGR1cmFibGVTdGF0ZSB9LCBzZXNzaW9uS2V5LCBzZXJ2ZXIuaWQpO1xuXHRcdFx0aWYgKHByZXZpb3VzIHx8IGR1cmFibGVTdGF0ZSAhPT0gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKSB7XG5cdFx0XHRcdHRhcmdldC5zZXRDdXN0b21pemF0aW9uRW5hYmxlZChzZXJ2ZXIuaWQsIGlzQ29udHJpYnV0aW9uRW5hYmxlZChkdXJhYmxlU3RhdGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tY3BTZXJ2ZXJQcm9maWxlRW5hYmxlbWVudEtleShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVyTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoW3Nlc3Npb25SZXNvdXJjZS5zY2hlbWUsIHNlcnZlck5hbWVdKTtcblx0fVxuXG5cdHByaXZhdGUgX21jcFNlcnZlcldvcmtzcGFjZUVuYWJsZW1lbnRLZXkoc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlck5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLmdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChyb290cy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIE5vIHdvcmtpbmcgZGlyZWN0b3J5IChkZWZlbnNpdmUpOiBmYWxsIHRocm91Z2ggdG8gcHJvZmlsZS9kZWZhdWx0LlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHJvb3RzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Ly8gU2luZ2xlLXJvb3QgKGluY2wuIHdvcmtzcGFjZS1sZXNzIHNjcmF0Y2ggY3dkKTogZXhhY3QgbGVnYWN5IHNoYXBlIG1lYW5zXG5cdFx0XHQvLyBieXRlLWlkZW50aWNhbCB3aXRoIHByZS1tdWx0aS1yb290IGtleXMsIHNvIG5vIG1pZ3JhdGlvbiBpcyBuZWVkZWQuXG5cdFx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoW3Nlc3Npb25SZXNvdXJjZS5zY2hlbWUsIHJvb3RzWzBdLCBzZXJ2ZXJOYW1lXSk7XG5cdFx0fVxuXHRcdC8vIE11bHRpLXJvb3Q6IGNhbm9uaWNhbGl6ZSAoZGVkdXAgYnkgVVJJIGlkZW50aXR5KSArIHNvcnQgc28gdGhlIGtleSBpc1xuXHRcdC8vIG9yZGVyLWluZGVwZW5kZW50IChyZS1waWNraW5nIHRoZSBwcmltYXJ5IGtlZXBzIHRoZSBzYW1lIGlkZW50aXR5KS5cblx0XHRjb25zdCBjYW5vbmljYWwgPSB0aGlzLl9jYW5vbmljYWxXb3Jrc3BhY2VSb290cyhyb290cyk7XG5cdFx0aWYgKGNhbm9uaWNhbC5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShbc2Vzc2lvblJlc291cmNlLnNjaGVtZSwgY2Fub25pY2FsWzBdLCBzZXJ2ZXJOYW1lXSk7XG5cdFx0fVxuXHRcdC8vIFZlcnNpb25lZCBkaXNjcmltaW5hdG9yIHNvIGEgbXVsdGktcm9vdCBrZXkgY2FuIG5ldmVyIGJlIG1pc3Rha2VuIGZvciBhXG5cdFx0Ly8gbGVnYWN5IDMtdHVwbGUuIE5ldmVyIGZhbGxzIGJhY2sgdG8gYSBzaW5nbGUtcHJpbWFyeSBrZXkuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KFsncm9vdHMtdjInLCBzZXNzaW9uUmVzb3VyY2Uuc2NoZW1lLCBjYW5vbmljYWwsIHNlcnZlck5hbWVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZS1kdXBsaWNhdGVzIHdvcmtpbmctZGlyZWN0b3J5IHJvb3RzIGJ5IGNhbm9uaWNhbCBVUkkgaWRlbnRpdHkgKHNvXG5cdCAqIGBmaWxlOi8vL2FgIGFuZCBgZmlsZTovLy9hL2Agb3IgY2FzZSB2YXJpYW50cyBjb2xsYXBzZSB0byBvbmUgcm9vdCkgYW5kXG5cdCAqIHJldHVybnMgYSBzdGFibGUsIG9yZGVyLWluZGVwZW5kZW50IGxpc3Qgb2YgcmVwcmVzZW50YXRpdmUgc3RyaW5ncy5cblx0ICpcblx0ICogT3JkZXItaW5kZXBlbmRlbmNlIHJlcXVpcmVzIHRoYXQgKGEpIGEgdHJhaWxpbmcgcGF0aCBzZXBhcmF0b3IgZG9lcyBub3Rcblx0ICogY2hhbmdlIGlkZW50aXR5IFx1MjAxNCB7QGxpbmsgSUV4dFVyaS5nZXRDb21wYXJpc29uS2V5fSBwcmVzZXJ2ZXMgaXQsIHNvIGl0IGlzXG5cdCAqIHN0cmlwcGVkIGZpcnN0IFx1MjAxNCBhbmQgKGIpIGFtb25nIGNhc2UtdmFyaWFudCBzcGVsbGluZ3MgdGhhdCBzaGFyZSBhXG5cdCAqIGNvbXBhcmlzb24ga2V5LCBhIGRldGVybWluaXN0aWMgcmVwcmVzZW50YXRpdmUgaXMgY2hvc2VuICh0aGVcblx0ICogbGV4aWNvZ3JhcGhpY2FsbHkgc21hbGxlc3QpIHJhdGhlciB0aGFuIHRoZSBmaXJzdCBvbmUgZW5jb3VudGVyZWQuXG5cdCAqXG5cdCAqIEBleGFtcGxlXG5cdCAqIC8vIERpc3RpbmN0IHJvb3RzIChhbnkgb3JkZXIpIFx1MjE5MiBzYW1lIHNvcnRlZCBsaXN0OlxuXHQgKiBfY2Fub25pY2FsV29ya3NwYWNlUm9vdHMoWydmaWxlOi8vL2InLCAnZmlsZTovLy9hJ10pIC8vIFsnZmlsZTovLy9hJywgJ2ZpbGU6Ly8vYiddXG5cdCAqIF9jYW5vbmljYWxXb3Jrc3BhY2VSb290cyhbJ2ZpbGU6Ly8vYScsICdmaWxlOi8vL2InXSkgLy8gWydmaWxlOi8vL2EnLCAnZmlsZTovLy9iJ11cblx0ICpcblx0ICogLy8gVHJhaWxpbmcgc2VwYXJhdG9yIGNvbGxhcHNlcyAoYC9hL2AgPT09IGAvYWApOlxuXHQgKiBfY2Fub25pY2FsV29ya3NwYWNlUm9vdHMoWydmaWxlOi8vL2EvJywgJ2ZpbGU6Ly8vYSddKSAvLyBbJ2ZpbGU6Ly8vYSddXG5cdCAqXG5cdCAqIC8vIENhc2UtdmFyaWFudCBzcGVsbGluZ3Mgb2Ygb25lIHJvb3QgY29sbGFwc2UgdG8gdGhlIHNtYWxsZXN0IHNwZWxsaW5nLFxuXHQgKiAvLyByZWdhcmRsZXNzIG9mIG9yZGVyIChmb3IgY2FzZS1pbnNlbnNpdGl2ZSBzY2hlbWVzKTpcblx0ICogX2Nhbm9uaWNhbFdvcmtzcGFjZVJvb3RzKFsndnNjb2RlLXJlbW90ZTovL2gvUmVwbycsICd2c2NvZGUtcmVtb3RlOi8vaC9yZXBvJ10pXG5cdCAqIF9jYW5vbmljYWxXb3Jrc3BhY2VSb290cyhbJ3ZzY29kZS1yZW1vdGU6Ly9oL3JlcG8nLCAndnNjb2RlLXJlbW90ZTovL2gvUmVwbyddKVxuXHQgKiAvLyBib3RoIFx1MjE5MiBbJ3ZzY29kZS1yZW1vdGU6Ly9oL1JlcG8nXSAgKCdSJyAoMHg1Mikgc29ydHMgYmVmb3JlICdyJyAoMHg3MikpXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5vbmljYWxXb3Jrc3BhY2VSb290cyhyb290czogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgYnlDb21wYXJpc29uS2V5ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHJvb3Qgb2Ygcm9vdHMpIHtcblx0XHRcdGxldCBrZXk6IHN0cmluZztcblx0XHRcdGxldCByZXByZXNlbnRhdGl2ZTogc3RyaW5nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UucmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKFVSSS5wYXJzZShyb290KSk7XG5cdFx0XHRcdGtleSA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkodXJpKTtcblx0XHRcdFx0cmVwcmVzZW50YXRpdmUgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRrZXkgPSByb290O1xuXHRcdFx0XHRyZXByZXNlbnRhdGl2ZSA9IHJvb3Q7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGJ5Q29tcGFyaXNvbktleS5nZXQoa2V5KTtcblx0XHRcdGlmIChleGlzdGluZyA9PT0gdW5kZWZpbmVkIHx8IGNvbXBhcmUocmVwcmVzZW50YXRpdmUsIGV4aXN0aW5nKSA8IDApIHtcblx0XHRcdFx0YnlDb21wYXJpc29uS2V5LnNldChrZXksIHJlcHJlc2VudGF0aXZlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5ieUNvbXBhcmlzb25LZXkudmFsdWVzKCldLnNvcnQoY29tcGFyZSk7XG5cdH1cblxuXHRwcml2YXRlIF9tY3BUcmFja2luZ1Jlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gc2Vzc2lvblJlc291cmNlLmZyYWdtZW50ID8gc2Vzc2lvblJlc291cmNlLndpdGgoeyBmcmFnbWVudDogbnVsbCB9KSA6IHNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlyZUN1c3RvbUFnZW50c0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmxhdHRlbk1jcFNlcnZlcnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIGN1c3RvbWl6YXRpb25zLmZsYXRNYXAoYyA9PiBjLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlclxuXHRcdFx0PyBbY11cblx0XHRcdDogYy5jaGlsZHJlbj8uZmlsdGVyKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpID8/IFtdKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNY3BTZXJ2ZXIoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSwgc2VydmVySWQ6IHN0cmluZyk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuX2ZsYXR0ZW5NY3BTZXJ2ZXJzKGN1c3RvbWl6YXRpb25zKSkge1xuXHRcdFx0aWYgKHNlcnZlci5pZCA9PT0gc2VydmVySWQgfHwgdGhpcy5faXNTY29wZWRNY3BTZXJ2ZXJJZEZvclJhd0lkKHNlcnZlcklkLCBzZXJ2ZXIuaWQpKSB7XG5cdFx0XHRcdHJldHVybiBzZXJ2ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Njb3BlZE1jcFNlcnZlcklkKHNlc3Npb25SZXNvdXJjZTogVVJJLCByYXdJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7c2Vzc2lvblJlc291cmNlLmF1dGhvcml0eX0vJHtyYXdJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNTY29wZWRNY3BTZXJ2ZXJJZEZvclJhd0lkKHNlcnZlcklkOiBzdHJpbmcsIHJhd0lkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXBhcmF0b3IgPSBzZXJ2ZXJJZC5pbmRleE9mKCcvJyk7XG5cdFx0cmV0dXJuIHNlcGFyYXRvciA+PSAwICYmIHNlcnZlcklkLnNsaWNlKHNlcGFyYXRvciArIDEpID09PSByYXdJZDtcblx0fVxufVxuXG5jbGFzcyBXb3JrYmVuY2hBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSBleHRlbmRzIEFic3RyYWN0QWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwPElEaXNwb3NhYmxlICYgeyByZWFkb25seSBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uOyByZWFkb25seSBiYWNrZW5kU2Vzc2lvbjogVVJJOyByZWFkb25seSBzdWI6IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IH0+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zU2VydmljZTogSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSxcblx0XHRASUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlOiBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2Nvbm5lY3Rpb25zU2VydmljZS5hbWJpZW50Q29ubmVjdGlvbi5vbkRpZEFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGVudmVsb3BlLmFjdGlvbi50eXBlKSB7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkOlxuXHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkOlxuXHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXRlQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2VkKCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZUN1c3RvbUFnZW50c0NoYW5nZWQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5vbkRpZENoYW5nZShzZXNzaW9uUmVzb3VyY2UgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY3VycmVudEJhY2tlbmQgPSB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkgIT09IGN1cnJlbnRCYWNrZW5kPy50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyTWNwU2VydmVyVHJhY2tpbmcoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZU1jcERpYWdub3N0aWNzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVTdWJzY3JpcHRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMuX2ZpcmVDdXN0b21pemF0aW9uc0NoYW5nZWQoKTtcblx0XHRcdHRoaXMuX2ZpcmVDdXN0b21BZ2VudHNDaGFuZ2VkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkRGlzcG9zZVNlc3Npb24oZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb25SZXNvdXJjZSBvZiBlLnNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX2NsZWFyTWNwU2VydmVyVHJhY2tpbmcoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZU1jcERpYWdub3N0aWNzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9taXphdGlvbnNDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9maXJlQ3VzdG9tQWdlbnRzQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfcmVzb2x2ZVRhcmdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblRhcmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9yZWFkU2Vzc2lvblN0YXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgcm9vdFN0YXRlID0gdGFyZ2V0LmNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSB0YXJnZXQuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9taXphdGlvbnM6IHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMgPz8gW10sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBzZXNzaW9uU3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzZXNzaW9uU3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdHJvb3RDb25maWc6IHJvb3RTdGF0ZSAmJiAhKHJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHJvb3RTdGF0ZS5jb25maWcgOiB1bmRlZmluZWQsXG5cdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGFyZ2V0LmNvbm5lY3Rpb24uYXV0aGVudGljYXRlKHJlcXVlc3QpLFxuXHRcdFx0c2V0Q3VzdG9taXphdGlvbkVuYWJsZWQ6IChyYXdJZCwgZW5hYmxlZCkgPT4ge1xuXHRcdFx0XHR0YXJnZXQuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblRvZ2dsZWQsXG5cdFx0XHRcdFx0aWQ6IHJhd0lkLFxuXHRcdFx0XHRcdGVuYWJsZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHN0YXJ0TWNwU2VydmVyOiByYXdJZCA9PiB7XG5cdFx0XHRcdHRhcmdldC5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYW5uZWwsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NY3BTZXJ2ZXJTdGFydFJlcXVlc3RlZCxcblx0XHRcdFx0XHRpZDogcmF3SWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9LFxuXHRcdFx0c3RvcE1jcFNlcnZlcjogcmF3SWQgPT4ge1xuXHRcdFx0XHR0YXJnZXQuY29ubmVjdGlvbi5kaXNwYXRjaChjaGFubmVsLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RvcFJlcXVlc3RlZCxcblx0XHRcdFx0XHRpZDogcmF3SWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0Um9vdENvbmZpZ1ZhbHVlOiAocHJvcGVydHksIHZhbHVlKSA9PiB7XG5cdFx0XHRcdHRhcmdldC5jb25uZWN0aW9uLmRpc3BhdGNoKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0XHRjb25maWc6IHsgW3Byb3BlcnR5XTogdmFsdWUgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRTZXNzaW9uU3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVGFyZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSB0YXJnZXQgPyB0aGlzLl9lbnN1cmVTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlLCB0YXJnZXQpPy5zdWIudmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGFyZ2V0OiBJQWdlbnRIb3N0U2Vzc2lvblJlc29sdXRpb24pOiAoSURpc3Bvc2FibGUgJiB7IHJlYWRvbmx5IGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb247IHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uOiBVUkk7IHJlYWRvbmx5IHN1YjogSUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4gfSkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3Rpbmc/LmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkgPT09IHRhcmdldC5iYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpICYmIGV4aXN0aW5nLmNvbm5lY3Rpb24gPT09IHRhcmdldC5jb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmID0gdGFyZ2V0LmNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB0YXJnZXQuYmFja2VuZFNlc3Npb24sICdBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZScpO1xuXHRcdGNvbnN0IHN1YiA9IHJlZi5vYmplY3Q7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBzdWIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmlyZUN1c3RvbWl6YXRpb25zQ2hhbmdlZCgpO1xuXHRcdFx0dGhpcy5fZmlyZUN1c3RvbUFnZW50c0NoYW5nZWQoKTtcblx0XHR9KTtcblx0XHRjb25zdCBlbnRyeSA9IHtcblx0XHRcdGNvbm5lY3Rpb246IHRhcmdldC5jb25uZWN0aW9uLFxuXHRcdFx0YmFja2VuZFNlc3Npb246IHRhcmdldC5iYWNrZW5kU2Vzc2lvbixcblx0XHRcdHN1Yixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgZW50cnkpO1xuXHRcdHJldHVybiBlbnRyeTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIGNoYXQgc2Vzc2lvbiByZXNvdXJjZSB0byB0aGUgYmFja2VuZCBhZ2VudC1zZXNzaW9uIFVSSSBwbHVzXG5cdCAqIHRoZSB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbn0gKGxvY2FsIG9yIHJlbW90ZSkgdGhhdCBvd25zIGl0LiBSZXR1cm5zXG5cdCAqIGB1bmRlZmluZWRgIGZvciBzZXNzaW9ucyBub3QgYmFja2VkIGJ5IGFuIGFnZW50IGhvc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlU2Vzc2lvblRhcmdldChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElBZ2VudEhvc3RTZXNzaW9uUmVzb2x1dGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJvdmlzaW9uYWxTZXNzaW9uID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZS5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAocHJvdmlzaW9uYWxTZXNzaW9uKSB7XG5cdFx0XHQvLyBQcm92aXNpb25hbCAodW50aXRsZWQpIHNlc3Npb25zIGFyZSBhbHdheXMgYmFja2VkIGJ5IHRoZSBhbWJpZW50IGhvc3QuXG5cdFx0XHRyZXR1cm4geyBjb25uZWN0aW9uOiB0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2UuYW1iaWVudENvbm5lY3Rpb24sIGJhY2tlbmRTZXNzaW9uOiBwcm92aXNpb25hbFNlc3Npb24gfTtcblx0XHR9XG5cblx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2Nvbm5lY3Rpb25zU2VydmljZS5yZXNvbHZlU2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBXb3JrYmVuY2hBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8qKlxuICogT3ducyBvbmUgaGlkZGVuIE91dHB1dCBjaGFubmVsIHBlciAoYWdlbnQtaG9zdCBzZXNzaW9uLCBNQ1Agc2VydmVyKSBwYWlyLlxuICoge0BsaW5rIHJlY29yZH0gYXBwZW5kcyBhIGxpbmUgd2hlbmV2ZXIgYSBzZXJ2ZXIncyBvYnNlcnZhYmxlIHN0YXRlIGNoYW5nZXNcbiAqIChpdHMgbGlmZWN5Y2xlIGtpbmQsIGVycm9yLCBvciBlbmFibGVtZW50KSBzbyBvcGVuaW5nIHRoZSBjaGFubmVsIHNob3dzIHRoZVxuICogc2VydmVyJ3MgaGlzdG9yeSBpbmNsdWRpbmcgYW55IGZhaWx1cmUgZGV0YWlsLiB7QGxpbmsgc2hvd30gcmV2ZWFscyB0aGVcbiAqIChvdGhlcndpc2UgaGlkZGVuKSBjaGFubmVsLCBhbmQge0BsaW5rIGRpc3Bvc2VGb3JTZXNzaW9ufSB0ZWFycyBkb3duIGV2ZXJ5XG4gKiBjaGFubmVsIGJlbG9uZ2luZyB0byBhIHNlc3Npb24gdGhhdCBpcyBnb2luZyBhd2F5LlxuICovXG5jbGFzcyBBZ2VudEhvc3RNY3BTZXJ2ZXJMb2dSZWdpc3RyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgeyByZWFkb25seSBsb2dnZXI6IElMb2dnZXI7IHJlYWRvbmx5IGRpc3Bvc2U6ICgpID0+IHZvaWQ7IGxhc3RTaWduYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZCB9PigpO1xuXHQvKiogQ2hhbm5lbCBpZHMgZ3JvdXBlZCBieSBvd25pbmcgc2Vzc2lvbiBrZXksIHNvIGEgc2Vzc2lvbiB0ZWFyZG93biBjYW4gZGlzcG9zZSB0aGVtIGFsbC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYnlTZXNzaW9uID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLl9ieVNlc3Npb24ua2V5cygpXSkge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlU2Vzc2lvbktleShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIGEgaGlkZGVuIGRpYWdub3N0aWNzIGNoYW5uZWwgZXhpc3RzIGZvciB0aGUgTUNQIHNlcnZlciBpZGVudGlmaWVkXG5cdCAqIGJ5IGAoc2Vzc2lvblJlc291cmNlLCByYXdJZClgIGFuZCByZWNvcmRzIGEgbGluZSB3aGVuZXZlciBpdHMgc3RhdGVcblx0ICogY2hhbmdlcyAoaW5jbHVkaW5nIHRoZSBmaXJzdCBvYnNlcnZlZCBzdGF0ZSkuIFJldHVybnMgdGhlIHN0YWJsZSBjaGFubmVsXG5cdCAqIGlkIGZvciB0aGUgc2VydmljZSB0byByZXZlYWwgdmlhIHtAbGluayBzaG93fSAtLSB0aGUgaWQgaXMgaW50ZXJuYWwuXG5cdCAqL1xuXHRyZWNvcmQoc2VydmVyOiB7IHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJOyByZWFkb25seSByYXdJZDogc3RyaW5nOyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47IHJlYWRvbmx5IHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSB9KTogc3RyaW5nIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2VydmVyLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYW5uZWxJZCA9IGNoYW5uZWxJZEZvck1jcFNlcnZlcihzZXNzaW9uS2V5LCBzZXJ2ZXIucmF3SWQpO1xuXHRcdGxldCBlbnRyeSA9IHRoaXMuX2VudHJpZXMuZ2V0KGNoYW5uZWxJZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0Y29uc3QgbG9nZ2VyID0gdGhpcy5fbG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoY2hhbm5lbElkLCB7XG5cdFx0XHRcdGhpZGRlbjogdHJ1ZSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdC5tY3BTZXJ2ZXIub3V0cHV0Q2hhbm5lbCcsIFwiTUNQOiB7MH1cIiwgc2VydmVyLm5hbWUpLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBNaXJyb3IgdGhlIHdvcmtiZW5jaCBNQ1Agc2VydmVyIHBhdHRlcm46IGEgbG9nZ2VyIGRpc3Bvc2VkIGJ1dCBub3Rcblx0XHRcdC8vIGRlcmVnaXN0ZXJlZCBpcyByZXVzZWQgYXMgYSBuby1vcCBpbnN0YW5jZSwgc28gZGVyZWdpc3RlciBvbiBkaXNwb3NlLlxuXHRcdFx0Y29uc3QgZGlzcG9zZSA9ICgpID0+IHtcblx0XHRcdFx0bG9nZ2VyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyU2VydmljZS5kZXJlZ2lzdGVyTG9nZ2VyKGNoYW5uZWxJZCk7XG5cdFx0XHR9O1xuXHRcdFx0ZW50cnkgPSB7IGxvZ2dlciwgZGlzcG9zZSwgbGFzdFNpZ25hdHVyZTogdW5kZWZpbmVkIH07XG5cdFx0XHR0aGlzLl9lbnRyaWVzLnNldChjaGFubmVsSWQsIGVudHJ5KTtcblx0XHRcdGxldCBncm91cCA9IHRoaXMuX2J5U2Vzc2lvbi5nZXQoc2Vzc2lvbktleSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0gbmV3IFNldCgpO1xuXHRcdFx0XHR0aGlzLl9ieVNlc3Npb24uc2V0KHNlc3Npb25LZXksIGdyb3VwKTtcblx0XHRcdH1cblx0XHRcdGdyb3VwLmFkZChjaGFubmVsSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2lnbmF0dXJlLCBtZXNzYWdlLCBpc0Vycm9yIH0gPSBkZXNjcmliZU1jcFNlcnZlclN0YXRlKHNlcnZlci5uYW1lLCBzZXJ2ZXIuZW5hYmxlZCwgc2VydmVyLnN0YXRlKTtcblx0XHRpZiAoZW50cnkubGFzdFNpZ25hdHVyZSAhPT0gc2lnbmF0dXJlKSB7XG5cdFx0XHRlbnRyeS5sYXN0U2lnbmF0dXJlID0gc2lnbmF0dXJlO1xuXHRcdFx0aWYgKGlzRXJyb3IpIHtcblx0XHRcdFx0ZW50cnkubG9nZ2VyLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cnkubG9nZ2VyLmluZm8obWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjaGFubmVsSWQ7XG5cdH1cblxuXHQvKiogUmV2ZWFscyB0aGUgZGlhZ25vc3RpY3MgY2hhbm5lbCBgY2hhbm5lbElkYCwgbWFraW5nIGl0cyBoaWRkZW4gbG9nZ2VyIHZpc2libGUuICovXG5cdGFzeW5jIHNob3coY2hhbm5lbElkOiBzdHJpbmcsIGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lbnRyaWVzLmhhcyhjaGFubmVsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ2dlclNlcnZpY2Uuc2V0VmlzaWJpbGl0eShjaGFubmVsSWQsIHRydWUpO1xuXHRcdGF3YWl0IGJlZm9yZVNob3c/LigpO1xuXHRcdGF3YWl0IHRoaXMuX291dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwoY2hhbm5lbElkKTtcblx0fVxuXG5cdC8qKiBEaXNwb3NlcyBldmVyeSBjaGFubmVsL2xvZ2dlciBvd25lZCBieSBgc2Vzc2lvblJlc291cmNlYCAoc2Vzc2lvbiB0ZWFyZG93bikuICovXG5cdGRpc3Bvc2VGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zZVNlc3Npb25LZXkoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZVNlc3Npb25LZXkoc2Vzc2lvbktleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9ieVNlc3Npb24uZ2V0KHNlc3Npb25LZXkpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYnlTZXNzaW9uLmRlbGV0ZShzZXNzaW9uS2V5KTtcblx0XHRmb3IgKGNvbnN0IGNoYW5uZWxJZCBvZiBncm91cCkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5nZXQoY2hhbm5lbElkKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZW50cmllcy5kZWxldGUoY2hhbm5lbElkKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBTdGFibGUsIGluamVjdGl2ZSwgZmlsZXN5c3RlbS1zYWZlIE91dHB1dC9sb2dnZXIgaWQgZm9yIHRoZSBNQ1Agc2VydmVyXG4gKiBgcmF3SWRgIGluIHRoZSBzZXNzaW9uIGtleWVkIGJ5IGBzZXNzaW9uS2V5YC4gVGhlIGNvbXBvc2l0ZSBrZXkgaXMgU0hBMS1oYXNoZWRcbiAqIHRvIGhleDogaGV4IGNoYXJhY3RlcnMgYXJlIG5ldmVyIHRvdWNoZWQgYnkgdGhlIGxvZ2dlciBzZXJ2aWNlJ3Mgb3duIHJlc2VydmVkLVxuICogY2hhcmFjdGVyIHN0cmlwcGluZyAoc28gZGlzdGluY3Qgc2VydmVycyBjYW4ndCBjb2xsYXBzZSBvbnRvIG9uZSBjaGFubmVsKSwgYW5kXG4gKiBoYXNoaW5nIGtlZXBzIHRoZSBpZCBib3VuZGVkIHJlZ2FyZGxlc3Mgb2YgaG93IGxvbmcgdGhlIHNlc3Npb24gVVJJIG9yIHJhdyBpZFxuICogaXMuXG4gKi9cbmZ1bmN0aW9uIGNoYW5uZWxJZEZvck1jcFNlcnZlcihzZXNzaW9uS2V5OiBzdHJpbmcsIHJhd0lkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzaGEgPSBuZXcgU3RyaW5nU0hBMSgpO1xuXHRzaGEudXBkYXRlKHNlc3Npb25LZXkpO1xuXHRzaGEudXBkYXRlKCdcXDAnKTtcblx0c2hhLnVwZGF0ZShyYXdJZCk7XG5cdHJldHVybiBgYWdlbnRIb3N0TWNwU2VydmVyLiR7c2hhLmRpZ2VzdCgpfWA7XG59XG5cbi8qKlxuICogUmVuZGVycyBhbiBNQ1Agc2VydmVyJ3MgY3VycmVudCBzdGF0ZSBpbnRvIGEgZGlhZ25vc3RpY3MgbG9nIGxpbmUsIGEgY2hhbmdlXG4gKiBzaWduYXR1cmUgKHVzZWQgdG8gc3VwcHJlc3MgZHVwbGljYXRlIHJlY29yZHMpLCBhbmQgd2hldGhlciBpdCBpcyBhbiBlcnJvci5cbiAqL1xuZnVuY3Rpb24gZGVzY3JpYmVNY3BTZXJ2ZXJTdGF0ZShuYW1lOiBzdHJpbmcsIGVuYWJsZWQ6IGJvb2xlYW4sIHN0YXRlOiBNY3BTZXJ2ZXJTdGF0ZSk6IHsgc2lnbmF0dXJlOiBzdHJpbmc7IG1lc3NhZ2U6IHN0cmluZzsgaXNFcnJvcjogYm9vbGVhbiB9IHtcblx0aWYgKCFlbmFibGVkKSB7XG5cdFx0cmV0dXJuIHsgc2lnbmF0dXJlOiAnZGlzYWJsZWQnLCBtZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFNlcnZlci5kaXNhYmxlZCcsIFwiU2VydmVyICd7MH0nIGlzIGRpc2FibGVkXCIsIG5hbWUpLCBpc0Vycm9yOiBmYWxzZSB9O1xuXHR9XG5cdHN3aXRjaCAoc3RhdGUua2luZCkge1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlJlYWR5OlxuXHRcdFx0cmV0dXJuIHsgc2lnbmF0dXJlOiAncmVhZHknLCBtZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFNlcnZlci5yZWFkeScsIFwiU2VydmVyICd7MH0nIGlzIHJ1bm5pbmdcIiwgbmFtZSksIGlzRXJyb3I6IGZhbHNlIH07XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmc6XG5cdFx0XHRyZXR1cm4geyBzaWduYXR1cmU6ICdzdGFydGluZycsIG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwU2VydmVyLnN0YXJ0aW5nJywgXCJTZXJ2ZXIgJ3swfScgaXMgc3RhcnRpbmdcIiwgbmFtZSksIGlzRXJyb3I6IGZhbHNlIH07XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkOlxuXHRcdFx0cmV0dXJuIHsgc2lnbmF0dXJlOiBgYXV0aFJlcXVpcmVkOiR7c3RhdGUucmVzb3VyY2UucmVzb3VyY2V9YCwgbWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5tY3BTZXJ2ZXIuYXV0aFJlcXVpcmVkJywgXCJTZXJ2ZXIgJ3swfScgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gKHsxfSlcIiwgbmFtZSwgc3RhdGUucmVzb3VyY2UucmVzb3VyY2UpLCBpc0Vycm9yOiBmYWxzZSB9O1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkVycm9yOlxuXHRcdFx0cmV0dXJuIHsgc2lnbmF0dXJlOiBgZXJyb3I6JHtzdGF0ZS5lcnJvci5lcnJvclR5cGV9OiR7c3RhdGUuZXJyb3IubWVzc2FnZX1gLCBtZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFNlcnZlci5lcnJvcicsIFwiU2VydmVyICd7MH0nIGZhaWxlZDogezF9XCIsIG5hbWUsIHN0YXRlLmVycm9yLm1lc3NhZ2UpLCBpc0Vycm9yOiB0cnVlIH07XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZDpcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHsgc2lnbmF0dXJlOiAnc3RvcHBlZCcsIG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwU2VydmVyLnN0b3BwZWQnLCBcIlNlcnZlciAnezB9JyBpcyBzdG9wcGVkXCIsIG5hbWUpLCBpc0Vycm9yOiBmYWxzZSB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHVCQUFvQyxvQkFBb0I7QUFDN0UsU0FBUyxTQUFTLG1CQUFtQjtBQUNyQyxTQUFTLGtCQUFrQjtBQUUzQixTQUE4QixvQ0FBb0M7QUFFbEUsU0FBUyxvQ0FBaUU7QUFDMUUsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBMkMsdUJBQXlHO0FBQzdKLFNBQTZCLGdCQUFnQix1QkFBdUI7QUFDcEUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLDZCQUE2QjtBQUV2RCxTQUFrQixnQkFBZ0IsbUJBQW1CO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCLGlCQUFpQiw2QkFBNkI7QUFDcEYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtREFBbUQ7QUFFNUQsU0FBUyxnQ0FBZ0MsNEJBQTRCO0FBQ3JFLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sb0NBQW9DO0FBUW5DLE1BQU0saUNBQWlDLGdCQUFnRCwrQkFBK0I7QUFpRXRILE1BQU0sa0NBQTRFO0FBQUEsRUFBbEY7QUFFTixTQUFTLDBCQUEwQixNQUFNO0FBQ3pDLFNBQVMsNEJBQTRCLE1BQU07QUFBQTtBQUFBLEVBQzNDLGdCQUFnQixrQkFBc0Q7QUFDckUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBQ0Esa0JBQWtCLGtCQUFpRDtBQUNsRSxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUEsRUFDQSxvQkFBb0Is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
