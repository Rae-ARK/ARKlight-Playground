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
import { mapFindFirst } from "../../../base/common/arraysFind.js";
import { disposableTimeout, RunOnceScheduler } from "../../../base/common/async.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../base/common/observable.js";
import Severity from "../../../base/common/severity.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as nls from "../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { ISecretStorageService } from "../../../platform/secrets/common/secrets.js";
import { IWorkbenchMcpGatewayService } from "../../contrib/mcp/common/mcpGatewayService.js";
import { IMcpRegistry } from "../../contrib/mcp/common/mcpRegistryTypes.js";
import { extensionPrefixedIdentifier, McpCollectionSortOrder, McpConnectionState, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust, mcpOAuthClientSecretStorageKey, UserInteractionRequiredError } from "../../contrib/mcp/common/mcpTypes.js";
import { mcpEnterpriseManagedAuthIdpSection } from "../../contrib/mcp/common/mcpConfiguration.js";
import { IAuthenticationMcpAccessService } from "../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../services/authentication/browser/authenticationMcpUsageService.js";
import { IAuthenticationService } from "../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { ExtensionHostKind, extensionHostKindToString } from "../../services/extensions/common/extensionHostKind.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadMcp = class extends Disposable {
  constructor(_extHostContext, _mcpRegistry, dialogService, _authenticationService, authenticationMcpServersService, authenticationMCPServerAccessService, authenticationMCPServerUsageService, _dynamicAuthenticationProviderStorageService, _extensionService, _contextKeyService, _telemetryService, _mcpGatewayService, _configurationService, _secretStorageService) {
    super();
    this._extHostContext = _extHostContext;
    this._mcpRegistry = _mcpRegistry;
    this.dialogService = dialogService;
    this._authenticationService = _authenticationService;
    this.authenticationMcpServersService = authenticationMcpServersService;
    this.authenticationMCPServerAccessService = authenticationMCPServerAccessService;
    this.authenticationMCPServerUsageService = authenticationMCPServerUsageService;
    this._dynamicAuthenticationProviderStorageService = _dynamicAuthenticationProviderStorageService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._telemetryService = _telemetryService;
    this._mcpGatewayService = _mcpGatewayService;
    this._configurationService = _configurationService;
    this._secretStorageService = _secretStorageService;
    this._serverIdCounter = 0;
    this._servers = /* @__PURE__ */ new Map();
    this._serverDefinitions = /* @__PURE__ */ new Map();
    this._serverAuthTracking = new McpServerAuthTracker();
    this._collectionDefinitions = this._register(new DisposableMap());
    this._gateways = this._register(new DisposableMap());
    this._register(_authenticationService.onDidChangeSessions((e) => this._onDidChangeAuthSessions(e.providerId, e.label)));
    const proxy = this._proxy = _extHostContext.getProxy(ExtHostContext.ExtHostMcp);
    this._register(this._mcpRegistry.registerDelegate({
      // Prefer Node.js extension hosts when they're available. No CORS issues etc.
      priority: _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker ? 0 : 1,
      waitForInitialProviderPromises() {
        return proxy.$waitForInitialCollectionProviders();
      },
      canStart(collection, serverDefinition) {
        if (collection.remoteAuthority !== _extHostContext.remoteAuthority) {
          return false;
        }
        if (serverDefinition.launch.type === McpServerTransportType.Stdio && _extHostContext.extensionHostKind === ExtensionHostKind.LocalWebWorker) {
          return false;
        }
        return true;
      },
      async substituteVariables(serverDefinition, launch) {
        const ser = await proxy.$substituteVariables(serverDefinition.variableReplacement?.folder?.uri, McpServerLaunch.toSerialized(launch));
        return McpServerLaunch.fromSerialized(ser);
      },
      start: (_collection, serverDefiniton, resolveLaunch, options) => {
        const id = ++this._serverIdCounter;
        const launch = new ExtHostMcpServerLaunch(
          _extHostContext.extensionHostKind,
          () => proxy.$stopMcp(id),
          (msg) => proxy.$sendMessage(id, JSON.stringify(msg))
        );
        this._servers.set(id, launch);
        this._serverDefinitions.set(id, serverDefiniton);
        proxy.$startMcp(id, {
          launch: resolveLaunch,
          defaultCwd: serverDefiniton.variableReplacement?.folder?.uri,
          errorOnUserInteraction: options?.errorOnUserInteraction
        });
        return launch;
      }
    }));
    const onDidChangeMcpServerDefinitionsTrigger = this._register(new RunOnceScheduler(() => this._publishServerDefinitions(), 500));
    this._register(autorun((reader) => {
      const collections = this._mcpRegistry.collections.read(reader);
      for (const collection of collections) {
        collection.serverDefinitions.read(reader);
      }
      if (!onDidChangeMcpServerDefinitionsTrigger.isScheduled()) {
        onDidChangeMcpServerDefinitionsTrigger.schedule();
      }
    }));
    onDidChangeMcpServerDefinitionsTrigger.schedule();
  }
  _publishServerDefinitions() {
    const collections = this._mcpRegistry.collections.get();
    const allServers = [];
    for (const collection of collections) {
      const servers = collection.serverDefinitions.get();
      for (const server of servers) {
        allServers.push(McpServerDefinition.toSerialized(server));
      }
    }
    this._proxy.$onDidChangeMcpServerDefinitions(allServers);
  }
  $upsertMcpCollection(collection, serversDto) {
    const servers = serversDto.map(McpServerDefinition.fromSerialized);
    const existing = this._collectionDefinitions.get(collection.id);
    if (existing) {
      existing.servers.set(servers, void 0);
    } else {
      const serverDefinitions = observableValue("mcpServers", servers);
      const extensionId = new ExtensionIdentifier(collection.extensionId);
      const store = new DisposableStore();
      const handle = store.add(new MutableDisposable());
      const register = () => {
        handle.value ??= this._mcpRegistry.registerCollection({
          ...collection,
          source: extensionId,
          order: McpCollectionSortOrder.Extension,
          resolveServerLanch: collection.canResolveLaunch ? (async (def) => {
            const r = await this._proxy.$resolveMcpLaunch(collection.id, def.label);
            return r ? McpServerLaunch.fromSerialized(r) : void 0;
          }) : void 0,
          trustBehavior: collection.isTrustedByDefault ? McpServerTrust.Kind.Trusted : McpServerTrust.Kind.TrustedOnNonce,
          remoteAuthority: this._extHostContext.remoteAuthority,
          serverDefinitions
        });
      };
      const whenClauseStr = mapFindFirst(this._extensionService.extensions, (e) => ExtensionIdentifier.equals(extensionId, e.identifier) ? e.contributes?.mcpServerDefinitionProviders?.find((p) => extensionPrefixedIdentifier(extensionId, p.id) === collection.id)?.when : void 0);
      const whenClause = whenClauseStr && ContextKeyExpr.deserialize(whenClauseStr);
      if (!whenClause) {
        register();
      } else {
        const evaluate = () => {
          if (this._contextKeyService.contextMatchesRules(whenClause)) {
            register();
          } else {
            handle.clear();
          }
        };
        store.add(this._contextKeyService.onDidChangeContext(evaluate));
        evaluate();
      }
      this._collectionDefinitions.set(collection.id, {
        servers: serverDefinitions,
        dispose: () => store.dispose()
      });
    }
  }
  $deleteMcpCollection(collectionId) {
    this._collectionDefinitions.deleteAndDispose(collectionId);
  }
  $onDidChangeState(id, update) {
    const server = this._servers.get(id);
    if (!server) {
      return;
    }
    server.state.set(update, void 0);
    if (!McpConnectionState.isRunning(update)) {
      server.dispose();
      this._servers.delete(id);
      this._serverDefinitions.delete(id);
      this._serverAuthTracking.untrack(id);
    }
  }
  $onDidPublishLog(id, level, log) {
    if (typeof level === "string") {
      level = LogLevel.Info;
      log = level;
    }
    this._servers.get(id)?.pushLog(level, log);
  }
  $onDidReceiveMessage(id, message) {
    this._servers.get(id)?.pushMessage(message);
  }
  async $getTokenForProviderId(id, providerId, scopes, options = {}) {
    const server = this._serverDefinitions.get(id);
    if (!server) {
      return void 0;
    }
    return this._getSessionForProvider(id, server, providerId, scopes, void 0, options.errorOnUserInteraction, options.clientId);
  }
  async $getTokenFromServerMetadata(id, authDetails, { errorOnUserInteraction, forceNewRegistration, clientId } = {}) {
    const server = this._serverDefinitions.get(id);
    if (!server) {
      return void 0;
    }
    const authorizationServer = URI.revive(authDetails.authorizationServer);
    const resourceServer = authDetails.resourceMetadata?.resource ? URI.parse(authDetails.resourceMetadata.resource) : void 0;
    const resolvedScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? authDetails.authorizationServerMetadata.scopes_supported ?? [];
    if (authDetails.enterpriseManaged) {
      const resource = authDetails.resourceMetadata?.resource;
      if (!resource) {
        throw new Error(nls.localize("mcp.enterpriseManaged.missingResource", "The enterprise-managed MCP server '{0}' did not advertise a protected-resource metadata document with a 'resource' identifier.", server.label));
      }
      const resourceAuthServers = authDetails.resourceMetadata?.authorization_servers ?? [];
      const audience = resourceAuthServers[0];
      if (!audience) {
        throw new Error(nls.localize("mcp.enterpriseManaged.missingAS", "The enterprise-managed MCP server '{0}' did not advertise an `authorization_servers` entry in its protected-resource metadata.", server.label));
      }
      const xaaScopes = authDetails.scopes ?? authDetails.resourceMetadata?.scopes_supported ?? [];
      const issuer = this._ensureXaaIssuer();
      const xaaProviderId = await this._authenticationService.createOrGetXaaProvider(issuer);
      if (!xaaProviderId) {
        return void 0;
      }
      const resourceClientId = clientId ?? authDetails.clientId;
      let resourceClientSecret;
      if (resourceClientId) {
        try {
          resourceClientSecret = await this._secretStorageService.get(mcpOAuthClientSecretStorageKey(resource, resourceClientId));
        } catch {
        }
      }
      return this._getSessionForProvider(id, server, xaaProviderId, xaaScopes, issuer, errorOnUserInteraction, resourceClientId, resource, audience, resourceClientSecret);
    }
    let providerId = await this._authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceServer);
    const resolvedClientId = clientId ?? authDetails.clientId;
    const mcpServerUrl = server.launch.type === McpServerTransportType.HTTP ? server.launch.uri.toString(true) : void 0;
    let clientSecret;
    let didLookupClientSecret = false;
    if (resolvedClientId && mcpServerUrl) {
      try {
        clientSecret = await this._secretStorageService.get(mcpOAuthClientSecretStorageKey(mcpServerUrl, resolvedClientId));
        didLookupClientSecret = true;
      } catch {
      }
    }
    if (didLookupClientSecret && providerId && !forceNewRegistration && this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
      const registered = await this._dynamicAuthenticationProviderStorageService.getClientRegistration(providerId);
      if (registered && registered.clientSecret !== clientSecret) {
        forceNewRegistration = true;
      }
    }
    if (forceNewRegistration && providerId) {
      if (!this._authenticationService.isDynamicAuthenticationProvider(providerId)) {
        throw new Error("Cannot force new registration for a non-dynamic authentication provider.");
      }
      this._authenticationService.unregisterAuthenticationProvider(providerId);
      await this._dynamicAuthenticationProviderStorageService.removeDynamicProvider(providerId);
      providerId = void 0;
    }
    if (!providerId) {
      const provider = await this._authenticationService.createDynamicAuthenticationProvider(authorizationServer, authDetails.authorizationServerMetadata, authDetails.resourceMetadata, resolvedClientId, clientSecret);
      if (!provider) {
        return void 0;
      }
      providerId = provider.id;
    }
    return this._getSessionForProvider(
      id,
      server,
      providerId,
      resolvedScopes,
      authorizationServer,
      errorOnUserInteraction,
      resolvedClientId,
      authDetails.resourceMetadata?.resource,
      /* audience */
      void 0,
      clientSecret
    );
  }
  _ensureXaaIssuer() {
    const config = this._configurationService.getValue(mcpEnterpriseManagedAuthIdpSection) ?? {};
    const configuredIssuer = config.issuer?.trim();
    if (!configuredIssuer) {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerMissing", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to be configured. Set it via enterprise policy (Windows Group Policy / macOS managed preferences / Linux `/etc/vscode/policy.json`) or, for local testing, by hand-editing `settings.json`."));
    }
    let parsed;
    try {
      parsed = URI.parse(configuredIssuer);
    } catch {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerInvalid", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to be a valid URL; got '{0}'.", configuredIssuer));
    }
    if (parsed.scheme !== "https" && parsed.scheme !== "http") {
      throw new Error(nls.localize("mcp.enterpriseManaged.issuerNotHttp", "Enterprise-managed MCP authentication requires `mcp.enterpriseManagedAuth.idp.issuer` to use the `https` or `http` scheme; got '{0}'.", configuredIssuer));
    }
    return parsed;
  }
  async _getSessionForProvider(serverId, server, providerId, scopes, authorizationServer, errorOnUserInteraction = false, clientId, resource, audience, clientSecret) {
    const authContext = { authorizationServer, clientId, resource, audience };
    const sessions = await this._authenticationService.getSessions(providerId, scopes, { authorizationServer, clientId, clientSecret, resource, audience }, true);
    if (server.launch.type !== McpServerTransportType.HTTP) {
      return void 0;
    }
    const mcpServerUrl = server.launch.uri.toString(true);
    const accountNamePreference = this.authenticationMcpServersService.getAccountPreference(server.id, providerId);
    let matchingAccountPreferenceSession;
    if (accountNamePreference) {
      matchingAccountPreferenceSession = sessions.find((session2) => session2.account.label === accountNamePreference);
    }
    const provider = this._authenticationService.getProvider(providerId);
    let session;
    if (sessions.length) {
      if (matchingAccountPreferenceSession && this.authenticationMCPServerAccessService.isAccessAllowedForUrl(providerId, matchingAccountPreferenceSession.account.label, server.id, mcpServerUrl)) {
        this.authenticationMCPServerUsageService.addAccountUsage(providerId, matchingAccountPreferenceSession.account.label, scopes, server.id, server.label);
        this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
        return matchingAccountPreferenceSession.accessToken;
      }
      if (!provider.supportsMultipleAccounts && this.authenticationMCPServerAccessService.isAccessAllowedForUrl(providerId, sessions[0].account.label, server.id, mcpServerUrl)) {
        this.authenticationMCPServerUsageService.addAccountUsage(providerId, sessions[0].account.label, scopes, server.id, server.label);
        this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
        return sessions[0].accessToken;
      }
    }
    if (errorOnUserInteraction) {
      throw new UserInteractionRequiredError("authentication");
    }
    const isAllowed = await this.loginPrompt(server.label, provider.label, false);
    if (!isAllowed) {
      throw new Error("User did not consent to login.");
    }
    if (sessions.length) {
      if (provider.supportsMultipleAccounts && errorOnUserInteraction) {
        throw new UserInteractionRequiredError("authentication");
      }
      session = provider.supportsMultipleAccounts ? await this.authenticationMcpServersService.selectSession(providerId, server.id, server.label, scopes, sessions) : sessions[0];
    } else {
      if (errorOnUserInteraction) {
        throw new UserInteractionRequiredError("authentication");
      }
      const accountToCreate = matchingAccountPreferenceSession?.account;
      do {
        session = await this._authenticationService.createSession(
          providerId,
          scopes,
          {
            activateImmediate: true,
            account: accountToCreate,
            authorizationServer,
            clientId,
            clientSecret,
            resource,
            audience
          }
        );
      } while (accountToCreate && accountToCreate.label !== session.account.label && !await this.continueWithIncorrectAccountPrompt(session.account.label, accountToCreate.label));
    }
    this.authenticationMCPServerAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: server.id, name: server.label, allowed: true, url: mcpServerUrl }]);
    this.authenticationMcpServersService.updateAccountPreference(server.id, providerId, session.account);
    this.authenticationMCPServerUsageService.addAccountUsage(providerId, session.account.label, scopes, server.id, server.label);
    this._serverAuthTracking.track(providerId, serverId, scopes, authContext);
    return session.accessToken;
  }
  async continueWithIncorrectAccountPrompt(chosenAccountLabel, requestedAccountLabel) {
    const result = await this.dialogService.prompt({
      message: nls.localize("incorrectAccount", "Incorrect account detected"),
      detail: nls.localize("incorrectAccountDetail", "The chosen account, {0}, does not match the requested account, {1}.", chosenAccountLabel, requestedAccountLabel),
      type: Severity.Warning,
      cancelButton: true,
      buttons: [
        {
          label: nls.localize("keep", "Keep {0}", chosenAccountLabel),
          run: () => chosenAccountLabel
        },
        {
          label: nls.localize("loginWith", "Login with {0}", requestedAccountLabel),
          run: () => requestedAccountLabel
        }
      ]
    });
    if (!result.result) {
      throw new CancellationError();
    }
    return result.result === chosenAccountLabel;
  }
  async _onDidChangeAuthSessions(providerId, providerLabel) {
    const serversUsingProvider = this._serverAuthTracking.get(providerId);
    if (!serversUsingProvider) {
      return;
    }
    for (const { serverId, scopes, context } of serversUsingProvider) {
      const server = this._servers.get(serverId);
      const serverDefinition = this._serverDefinitions.get(serverId);
      if (!server || !serverDefinition) {
        continue;
      }
      const state = server.state.get();
      if (state.state !== McpConnectionState.Kind.Running) {
        continue;
      }
      try {
        await this._getSessionForProvider(serverId, serverDefinition, providerId, scopes, context.authorizationServer, true, context.clientId, context.resource, context.audience);
      } catch (e) {
        if (UserInteractionRequiredError.is(e)) {
          server.pushLog(LogLevel.Warning, nls.localize("mcpAuthSessionRemoved", "Authentication session for {0} removed, stopping server", providerLabel));
          server.stop();
        }
      }
    }
  }
  $logMcpAuthSetup(data) {
    this._telemetryService.publicLog2("mcp/authSetup", data);
  }
  async $startMcpGateway(chatSessionResource) {
    const result = await this._mcpGatewayService.createGateway(
      this._extHostContext.extensionHostKind === ExtensionHostKind.Remote,
      chatSessionResource ? URI.revive(chatSessionResource) : void 0
    );
    if (!result) {
      return void 0;
    }
    if (this._store.isDisposed) {
      result.dispose();
      return void 0;
    }
    const gatewayId = generateUuid();
    const store = new DisposableStore();
    store.add(result);
    store.add(result.onDidChangeServers((servers) => {
      this._proxy.$onDidChangeGatewayServers(gatewayId, servers.map((s) => ({ label: s.label, address: s.address })));
    }));
    this._gateways.set(gatewayId, store);
    return {
      servers: result.servers.map((s) => ({ label: s.label, address: s.address })),
      gatewayId
    };
  }
  $disposeMcpGateway(gatewayId) {
    this._gateways.deleteAndDispose(gatewayId);
  }
  async loginPrompt(mcpLabel, providerLabel, recreatingSession) {
    const message = recreatingSession ? nls.localize("confirmRelogin", "The MCP Server Definition '{0}' wants you to authenticate to {1}.", mcpLabel, providerLabel) : nls.localize("confirmLogin", "The MCP Server Definition '{0}' wants to authenticate to {1}.", mcpLabel, providerLabel);
    const buttons = [
      {
        label: nls.localize({ key: "allow", comment: ["&& denotes a mnemonic"] }, "&&Allow"),
        run() {
          return true;
        }
      }
    ];
    const { result } = await this.dialogService.prompt({
      type: Severity.Info,
      message,
      buttons,
      cancelButton: true
    });
    return result ?? false;
  }
  dispose() {
    for (const server of this._servers.values()) {
      server.extHostDispose();
    }
    this._servers.clear();
    this._serverDefinitions.clear();
    this._serverAuthTracking.clear();
    super.dispose();
  }
};
MainThreadMcp = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadMcp),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IAuthenticationService),
  __decorateParam(4, IAuthenticationMcpService),
  __decorateParam(5, IAuthenticationMcpAccessService),
  __decorateParam(6, IAuthenticationMcpUsageService),
  __decorateParam(7, IDynamicAuthenticationProviderStorageService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IWorkbenchMcpGatewayService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ISecretStorageService)
], MainThreadMcp);
class ExtHostMcpServerLaunch extends Disposable {
  constructor(extHostKind, stop, send) {
    super();
    this.stop = stop;
    this.send = send;
    this.state = observableValue("mcpServerState", { state: McpConnectionState.Kind.Starting });
    this._onDidLog = this._register(new Emitter());
    this.onDidLog = this._onDidLog.event;
    this._onDidReceiveMessage = this._register(new Emitter());
    this.onDidReceiveMessage = this._onDidReceiveMessage.event;
    this._register(disposableTimeout(() => {
      this.pushLog(LogLevel.Info, `Starting server from ${extensionHostKindToString(extHostKind)} extension host`);
    }));
  }
  pushLog(level, message) {
    this._onDidLog.fire({ message, level });
  }
  pushMessage(message) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      this.pushLog(LogLevel.Warning, `Failed to parse message: ${JSON.stringify(message)}`);
    }
    if (parsed) {
      if (Array.isArray(parsed)) {
        parsed.forEach((p) => this._onDidReceiveMessage.fire(p));
      } else {
        this._onDidReceiveMessage.fire(parsed);
      }
    }
  }
  extHostDispose() {
    if (McpConnectionState.isRunning(this.state.get())) {
      this.pushLog(LogLevel.Warning, "Extension host shut down, server will stop.");
      this.state.set({ state: McpConnectionState.Kind.Stopped }, void 0);
    }
    this.dispose();
  }
  dispose() {
    if (McpConnectionState.isRunning(this.state.get())) {
      this.stop();
    }
    super.dispose();
  }
}
class McpServerAuthTracker {
  constructor() {
    // Provider ID -> Array of tracked servers (serverId, scopes, and the auth context to replay)
    this._tracking = /* @__PURE__ */ new Map();
  }
  /**
   * Track authentication for a server with a specific provider.
   * Replaces any existing tracking for this server/provider combination.
   */
  track(providerId, serverId, scopes, context) {
    const servers = this._tracking.get(providerId) || [];
    const filtered = servers.filter((s) => s.serverId !== serverId);
    filtered.push({ serverId, scopes, context });
    this._tracking.set(providerId, filtered);
  }
  /**
   * Remove all authentication tracking for a server across all providers.
   */
  untrack(serverId) {
    for (const [providerId, servers] of this._tracking.entries()) {
      const filtered = servers.filter((s) => s.serverId !== serverId);
      if (filtered.length === 0) {
        this._tracking.delete(providerId);
      } else {
        this._tracking.set(providerId, filtered);
      }
    }
  }
  /**
   * Get all servers using a specific authentication provider.
   */
  get(providerId) {
    return this._tracking.get(providerId);
  }
  /**
   * Clear all tracking data.
   */
  clear() {
    this._tracking.clear();
  }
}
export {
  MainThreadMcp,
  McpServerAuthTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTWNwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFwRmluZEZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaE1jcEdhdGV3YXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcEdhdGV3YXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BNZXNzYWdlVHJhbnNwb3J0LCBJTWNwUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBleHRlbnNpb25QcmVmaXhlZElkZW50aWZpZXIsIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSwgTWNwU2VydmVyVHJ1c3QsIG1jcE9BdXRoQ2xpZW50U2VjcmV0U3RvcmFnZUtleSwgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwQ29uZmlnLCBtY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21vZGVsQ29udGV4dFByb3RvY29sLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIEF1dGhlbnRpY2F0aW9uU2Vzc2lvbkFjY291bnQsIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kLCBleHRlbnNpb25Ib3N0S2luZFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEtpbmQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IFByb3hpZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RNY3BTaGFwZSwgSU1jcEF1dGhlbnRpY2F0aW9uRGV0YWlscywgSU1jcEF1dGhlbnRpY2F0aW9uT3B0aW9ucywgSUF1dGhNZXRhZGF0YVNvdXJjZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRNY3BTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRNY3ApXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZE1jcCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkTWNwU2hhcGUge1xuXG5cdHByaXZhdGUgX3NlcnZlcklkQ291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmVycyA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0TWNwU2VydmVyTGF1bmNoPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJEZWZpbml0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBNY3BTZXJ2ZXJEZWZpbml0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJBdXRoVHJhY2tpbmcgPSBuZXcgTWNwU2VydmVyQXV0aFRyYWNrZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IFByb3hpZWQ8RXh0SG9zdE1jcFNoYXBlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGVjdGlvbkRlZmluaXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCB7XG5cdFx0c2VydmVyczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBNY3BTZXJ2ZXJEZWZpbml0aW9uW10+O1xuXHRcdGRpc3Bvc2UoKTogdm9pZDtcblx0fT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dhdGV3YXlzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElNY3BSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF9tY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uTWNwU2VydmVyc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXRoZW50aWNhdGlvbk1DUFNlcnZlckFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1dGhlbnRpY2F0aW9uTUNQU2VydmVyVXNhZ2VTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsXG5cdFx0QElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2U6IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTWNwR2F0ZXdheVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwR2F0ZXdheVNlcnZpY2U6IElXb3JrYmVuY2hNY3BHYXRld2F5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTZWNyZXRTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZWNyZXRTdG9yYWdlU2VydmljZTogSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IHRoaXMuX29uRGlkQ2hhbmdlQXV0aFNlc3Npb25zKGUucHJvdmlkZXJJZCwgZS5sYWJlbCkpKTtcblx0XHRjb25zdCBwcm94eSA9IHRoaXMuX3Byb3h5ID0gX2V4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RNY3ApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21jcFJlZ2lzdHJ5LnJlZ2lzdGVyRGVsZWdhdGUoe1xuXHRcdFx0Ly8gUHJlZmVyIE5vZGUuanMgZXh0ZW5zaW9uIGhvc3RzIHdoZW4gdGhleSdyZSBhdmFpbGFibGUuIE5vIENPUlMgaXNzdWVzIGV0Yy5cblx0XHRcdHByaW9yaXR5OiBfZXh0SG9zdENvbnRleHQuZXh0ZW5zaW9uSG9zdEtpbmQgPT09IEV4dGVuc2lvbkhvc3RLaW5kLkxvY2FsV2ViV29ya2VyID8gMCA6IDEsXG5cdFx0XHR3YWl0Rm9ySW5pdGlhbFByb3ZpZGVyUHJvbWlzZXMoKSB7XG5cdFx0XHRcdHJldHVybiBwcm94eS4kd2FpdEZvckluaXRpYWxDb2xsZWN0aW9uUHJvdmlkZXJzKCk7XG5cdFx0XHR9LFxuXHRcdFx0Y2FuU3RhcnQoY29sbGVjdGlvbiwgc2VydmVyRGVmaW5pdGlvbikge1xuXHRcdFx0XHRpZiAoY29sbGVjdGlvbi5yZW1vdGVBdXRob3JpdHkgIT09IF9leHRIb3N0Q29udGV4dC5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlcnZlckRlZmluaXRpb24ubGF1bmNoLnR5cGUgPT09IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8gJiYgX2V4dEhvc3RDb250ZXh0LmV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFdlYldvcmtlcikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyBzdWJzdGl0dXRlVmFyaWFibGVzKHNlcnZlckRlZmluaXRpb24sIGxhdW5jaCkge1xuXHRcdFx0XHRjb25zdCBzZXIgPSBhd2FpdCBwcm94eS4kc3Vic3RpdHV0ZVZhcmlhYmxlcyhzZXJ2ZXJEZWZpbml0aW9uLnZhcmlhYmxlUmVwbGFjZW1lbnQ/LmZvbGRlcj8udXJpLCBNY3BTZXJ2ZXJMYXVuY2gudG9TZXJpYWxpemVkKGxhdW5jaCkpO1xuXHRcdFx0XHRyZXR1cm4gTWNwU2VydmVyTGF1bmNoLmZyb21TZXJpYWxpemVkKHNlcik7XG5cdFx0XHR9LFxuXHRcdFx0c3RhcnQ6IChfY29sbGVjdGlvbiwgc2VydmVyRGVmaW5pdG9uLCByZXNvbHZlTGF1bmNoLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlkID0gKyt0aGlzLl9zZXJ2ZXJJZENvdW50ZXI7XG5cdFx0XHRcdGNvbnN0IGxhdW5jaCA9IG5ldyBFeHRIb3N0TWNwU2VydmVyTGF1bmNoKFxuXHRcdFx0XHRcdF9leHRIb3N0Q29udGV4dC5leHRlbnNpb25Ib3N0S2luZCxcblx0XHRcdFx0XHQoKSA9PiBwcm94eS4kc3RvcE1jcChpZCksXG5cdFx0XHRcdFx0bXNnID0+IHByb3h5LiRzZW5kTWVzc2FnZShpZCwgSlNPTi5zdHJpbmdpZnkobXNnKSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX3NlcnZlcnMuc2V0KGlkLCBsYXVuY2gpO1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXJEZWZpbml0aW9ucy5zZXQoaWQsIHNlcnZlckRlZmluaXRvbik7XG5cdFx0XHRcdHByb3h5LiRzdGFydE1jcChpZCwge1xuXHRcdFx0XHRcdGxhdW5jaDogcmVzb2x2ZUxhdW5jaCxcblx0XHRcdFx0XHRkZWZhdWx0Q3dkOiBzZXJ2ZXJEZWZpbml0b24udmFyaWFibGVSZXBsYWNlbWVudD8uZm9sZGVyPy51cmksXG5cdFx0XHRcdFx0ZXJyb3JPblVzZXJJbnRlcmFjdGlvbjogb3B0aW9ucz8uZXJyb3JPblVzZXJJbnRlcmFjdGlvbixcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIGxhdW5jaDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIE1DUCBzZXJ2ZXIgZGVmaW5pdGlvbiBjaGFuZ2VzIGFuZCBub3RpZnkgZXh0IGhvc3Rcblx0XHRjb25zdCBvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zVHJpZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX3B1Ymxpc2hTZXJ2ZXJEZWZpbml0aW9ucygpLCA1MDApKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb2xsZWN0aW9ucyA9IHRoaXMuX21jcFJlZ2lzdHJ5LmNvbGxlY3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIFJlYWQgYWxsIHNlcnZlciBkZWZpbml0aW9ucyB0byB0cmFjayBjaGFuZ2VzXG5cdFx0XHRmb3IgKGNvbnN0IGNvbGxlY3Rpb24gb2YgY29sbGVjdGlvbnMpIHtcblx0XHRcdFx0Y29sbGVjdGlvbi5zZXJ2ZXJEZWZpbml0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHQvLyBOb3RpZnkgZXh0IGhvc3QgdGhhdCBkZWZpbml0aW9ucyBjaGFuZ2VkIChpdCB3aWxsIHJlLWZldGNoIGlmIG5lZWRlZClcblx0XHRcdGlmICghb25EaWRDaGFuZ2VNY3BTZXJ2ZXJEZWZpbml0aW9uc1RyaWdnZXIuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHRvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zVHJpZ2dlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG9uRGlkQ2hhbmdlTWNwU2VydmVyRGVmaW5pdGlvbnNUcmlnZ2VyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wdWJsaXNoU2VydmVyRGVmaW5pdGlvbnMoKSB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbnMgPSB0aGlzLl9tY3BSZWdpc3RyeS5jb2xsZWN0aW9ucy5nZXQoKTtcblx0XHRjb25zdCBhbGxTZXJ2ZXJzOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLlNlcmlhbGl6ZWRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIGNvbGxlY3Rpb25zKSB7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gY29sbGVjdGlvbi5zZXJ2ZXJEZWZpbml0aW9ucy5nZXQoKTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHNlcnZlcnMpIHtcblx0XHRcdFx0YWxsU2VydmVycy5wdXNoKE1jcFNlcnZlckRlZmluaXRpb24udG9TZXJpYWxpemVkKHNlcnZlcikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZU1jcFNlcnZlckRlZmluaXRpb25zKGFsbFNlcnZlcnMpO1xuXHR9XG5cblx0JHVwc2VydE1jcENvbGxlY3Rpb24oY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24uRnJvbUV4dEhvc3QsIHNlcnZlcnNEdG86IE1jcFNlcnZlckRlZmluaXRpb24uU2VyaWFsaXplZFtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHNlcnZlcnNEdG8ubWFwKE1jcFNlcnZlckRlZmluaXRpb24uZnJvbVNlcmlhbGl6ZWQpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY29sbGVjdGlvbkRlZmluaXRpb25zLmdldChjb2xsZWN0aW9uLmlkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLnNlcnZlcnMuc2V0KHNlcnZlcnMsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlcnZlckRlZmluaXRpb25zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IE1jcFNlcnZlckRlZmluaXRpb25bXT4oJ21jcFNlcnZlcnMnLCBzZXJ2ZXJzKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoY29sbGVjdGlvbi5leHRlbnNpb25JZCk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRjb25zdCByZWdpc3RlciA9ICgpID0+IHtcblx0XHRcdFx0aGFuZGxlLnZhbHVlID8/PSB0aGlzLl9tY3BSZWdpc3RyeS5yZWdpc3RlckNvbGxlY3Rpb24oe1xuXHRcdFx0XHRcdC4uLmNvbGxlY3Rpb24sXG5cdFx0XHRcdFx0c291cmNlOiBleHRlbnNpb25JZCxcblx0XHRcdFx0XHRvcmRlcjogTWNwQ29sbGVjdGlvblNvcnRPcmRlci5FeHRlbnNpb24sXG5cdFx0XHRcdFx0cmVzb2x2ZVNlcnZlckxhbmNoOiBjb2xsZWN0aW9uLmNhblJlc29sdmVMYXVuY2ggPyAoYXN5bmMgZGVmID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZU1jcExhdW5jaChjb2xsZWN0aW9uLmlkLCBkZWYubGFiZWwpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHIgPyBNY3BTZXJ2ZXJMYXVuY2guZnJvbVNlcmlhbGl6ZWQocikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dHJ1c3RCZWhhdmlvcjogY29sbGVjdGlvbi5pc1RydXN0ZWRCeURlZmF1bHQgPyBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWQgOiBNY3BTZXJ2ZXJUcnVzdC5LaW5kLlRydXN0ZWRPbk5vbmNlLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdGhpcy5fZXh0SG9zdENvbnRleHQucmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0XHRcdHNlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHdoZW5DbGF1c2VTdHIgPSBtYXBGaW5kRmlyc3QodGhpcy5fZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLCBlID0+XG5cdFx0XHRcdEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbklkLCBlLmlkZW50aWZpZXIpXG5cdFx0XHRcdFx0PyBlLmNvbnRyaWJ1dGVzPy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzPy5maW5kKHAgPT4gZXh0ZW5zaW9uUHJlZml4ZWRJZGVudGlmaWVyKGV4dGVuc2lvbklkLCBwLmlkKSA9PT0gY29sbGVjdGlvbi5pZCk/LndoZW5cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB3aGVuQ2xhdXNlID0gd2hlbkNsYXVzZVN0ciAmJiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuQ2xhdXNlU3RyKTtcblxuXHRcdFx0aWYgKCF3aGVuQ2xhdXNlKSB7XG5cdFx0XHRcdHJlZ2lzdGVyKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBldmFsdWF0ZSA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuQ2xhdXNlKSkge1xuXHRcdFx0XHRcdFx0cmVnaXN0ZXIoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGFuZGxlLmNsZWFyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZXZhbHVhdGUpKTtcblx0XHRcdFx0ZXZhbHVhdGUoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY29sbGVjdGlvbkRlZmluaXRpb25zLnNldChjb2xsZWN0aW9uLmlkLCB7XG5cdFx0XHRcdHNlcnZlcnM6IHNlcnZlckRlZmluaXRpb25zLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQkZGVsZXRlTWNwQ29sbGVjdGlvbihjb2xsZWN0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbGxlY3Rpb25EZWZpbml0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbGxlY3Rpb25JZCk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VTdGF0ZShpZDogbnVtYmVyLCB1cGRhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3NlcnZlcnMuZ2V0KGlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNlcnZlci5zdGF0ZS5zZXQodXBkYXRlLCB1bmRlZmluZWQpO1xuXHRcdGlmICghTWNwQ29ubmVjdGlvblN0YXRlLmlzUnVubmluZyh1cGRhdGUpKSB7XG5cdFx0XHRzZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc2VydmVycy5kZWxldGUoaWQpO1xuXHRcdFx0dGhpcy5fc2VydmVyRGVmaW5pdGlvbnMuZGVsZXRlKGlkKTtcblx0XHRcdHRoaXMuX3NlcnZlckF1dGhUcmFja2luZy51bnRyYWNrKGlkKTtcblx0XHR9XG5cdH1cblxuXHQkb25EaWRQdWJsaXNoTG9nKGlkOiBudW1iZXIsIGxldmVsOiBMb2dMZXZlbCwgbG9nOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGxldmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0bGV2ZWwgPSBMb2dMZXZlbC5JbmZvO1xuXHRcdFx0bG9nID0gbGV2ZWwgYXMgdW5rbm93biBhcyBzdHJpbmc7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VydmVycy5nZXQoaWQpPy5wdXNoTG9nKGxldmVsLCBsb2cpO1xuXHR9XG5cblx0JG9uRGlkUmVjZWl2ZU1lc3NhZ2UoaWQ6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmVycy5nZXQoaWQpPy5wdXNoTWVzc2FnZShtZXNzYWdlKTtcblx0fVxuXG5cdGFzeW5jICRnZXRUb2tlbkZvclByb3ZpZGVySWQoaWQ6IG51bWJlciwgcHJvdmlkZXJJZDogc3RyaW5nLCBzY29wZXM6IHN0cmluZ1tdLCBvcHRpb25zOiBJTWNwQXV0aGVudGljYXRpb25PcHRpb25zID0ge30pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3NlcnZlckRlZmluaXRpb25zLmdldChpZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRTZXNzaW9uRm9yUHJvdmlkZXIoaWQsIHNlcnZlciwgcHJvdmlkZXJJZCwgc2NvcGVzLCB1bmRlZmluZWQsIG9wdGlvbnMuZXJyb3JPblVzZXJJbnRlcmFjdGlvbiwgb3B0aW9ucy5jbGllbnRJZCk7XG5cdH1cblxuXHRhc3luYyAkZ2V0VG9rZW5Gcm9tU2VydmVyTWV0YWRhdGEoaWQ6IG51bWJlciwgYXV0aERldGFpbHM6IElNY3BBdXRoZW50aWNhdGlvbkRldGFpbHMsIHsgZXJyb3JPblVzZXJJbnRlcmFjdGlvbiwgZm9yY2VOZXdSZWdpc3RyYXRpb24sIGNsaWVudElkIH06IElNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnMgPSB7fSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fc2VydmVyRGVmaW5pdGlvbnMuZ2V0KGlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYXV0aG9yaXphdGlvblNlcnZlciA9IFVSSS5yZXZpdmUoYXV0aERldGFpbHMuYXV0aG9yaXphdGlvblNlcnZlcik7XG5cdFx0Y29uc3QgcmVzb3VyY2VTZXJ2ZXIgPSBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZSA/IFVSSS5wYXJzZShhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhLnJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXNvbHZlZFNjb3BlcyA9IGF1dGhEZXRhaWxzLnNjb3BlcyA/PyBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5zY29wZXNfc3VwcG9ydGVkID8/IGF1dGhEZXRhaWxzLmF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YS5zY29wZXNfc3VwcG9ydGVkID8/IFtdO1xuXG5cdFx0Ly8gRW50ZXJwcmlzZS1tYW5hZ2VkIHNlcnZlcnMgcm91dGUgdGhyb3VnaCBhbiBYQUEgLyBJRC1KQUcgcHJvdmlkZXIga2V5ZWQgYnkgdGhlIHVzZXItY29uZmlndXJlZFxuXHRcdC8vIFNTTyBpc3N1ZXIgaW5zdGVhZCBvZiBkb2luZyBhIHBlci1zZXJ2ZXIgRENSIGFnYWluc3QgdGhlIHJlc291cmNlJ3MgYXV0aG9yaXphdGlvbiBzZXJ2ZXIuXG5cdFx0aWYgKGF1dGhEZXRhaWxzLmVudGVycHJpc2VNYW5hZ2VkKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGF1dGhEZXRhaWxzLnJlc291cmNlTWV0YWRhdGE/LnJlc291cmNlO1xuXHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWQubWlzc2luZ1Jlc291cmNlJywgXCJUaGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBzZXJ2ZXIgJ3swfScgZGlkIG5vdCBhZHZlcnRpc2UgYSBwcm90ZWN0ZWQtcmVzb3VyY2UgbWV0YWRhdGEgZG9jdW1lbnQgd2l0aCBhICdyZXNvdXJjZScgaWRlbnRpZmllci5cIiwgc2VydmVyLmxhYmVsKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBQZXIgSUQtSkFHIChkcmFmdC1pZXRmLW9hdXRoLWlkZW50aXR5LWFzc2VydGlvbi1hdXRoei1ncmFudCksIHRoZSB0b2tlbiBleGNoYW5nZVxuXHRcdFx0Ly8gYGF1ZGllbmNlYCBpcyB0aGUgKmF1dGhvcml6YXRpb24gc2VydmVyKiBvZiB0aGUgcmVzb3VyY2UgXHUyMDE0IGkuZS4gdGhlIGlzc3VlciB0aGF0IHdpbGxcblx0XHRcdC8vIHJlZGVlbSB0aGUgSUQtSkFHIGFzc2VydGlvbi4gV2UgcGljayB0aGUgZmlyc3Qgc2VydmVyIGFkdmVydGlzZWQgYnkgdGhlIHJlc291cmNlJ3Ncblx0XHRcdC8vIG9hdXRoLXByb3RlY3RlZC1yZXNvdXJjZSBtZXRhZGF0YS5cblx0XHRcdGNvbnN0IHJlc291cmNlQXV0aFNlcnZlcnMgPSBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5hdXRob3JpemF0aW9uX3NlcnZlcnMgPz8gW107XG5cdFx0XHRjb25zdCBhdWRpZW5jZSA9IHJlc291cmNlQXV0aFNlcnZlcnNbMF07XG5cdFx0XHRpZiAoIWF1ZGllbmNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ21jcC5lbnRlcnByaXNlTWFuYWdlZC5taXNzaW5nQVMnLCBcIlRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIHNlcnZlciAnezB9JyBkaWQgbm90IGFkdmVydGlzZSBhbiBgYXV0aG9yaXphdGlvbl9zZXJ2ZXJzYCBlbnRyeSBpbiBpdHMgcHJvdGVjdGVkLXJlc291cmNlIG1ldGFkYXRhLlwiLCBzZXJ2ZXIubGFiZWwpKTtcblx0XHRcdH1cblx0XHRcdC8vIEZvciBYQUEgdGhlIHNjb3BlcyBzZW50IHRvIHRoZSBJZFAgdG9rZW4tZXhjaGFuZ2Ugc3RlcCBhcmUgdGhlICpyZXNvdXJjZSogc2NvcGVzXG5cdFx0XHQvLyAoZS5nLiBcInRvZG9zLnJlYWQgbWNwLmFjY2Vzc1wiKSwgTk9UIHRoZSBJZFAgbG9naW4gc2NvcGVzIChvcGVuaWQvb2ZmbGluZV9hY2Nlc3MvXHUyMDI2KS5cblx0XHRcdC8vIGByZXNvbHZlZFNjb3Blc2AgbWF5IGhhdmUgZmFsbGVuIHRocm91Z2ggdG8gYGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YS5zY29wZXNfc3VwcG9ydGVkYFxuXHRcdFx0Ly8gd2hpY2ggaXMgdGhlIElkUCdzIG1ldGFkYXRhIFx1MjAxNCB3cm9uZyBmb3IgdGhpcyBzdGVwLiBVc2Ugb25seSB0aGUgc2NvcGVzIGRlcml2ZWQgZnJvbSB0aGVcblx0XHRcdC8vIFdXVy1BdXRoZW50aWNhdGUgY2hhbGxlbmdlIG9yIHRoZSByZXNvdXJjZSdzIG93biBtZXRhZGF0YS5cblx0XHRcdGNvbnN0IHhhYVNjb3BlcyA9IGF1dGhEZXRhaWxzLnNjb3BlcyA/PyBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5zY29wZXNfc3VwcG9ydGVkID8/IFtdO1xuXHRcdFx0Y29uc3QgaXNzdWVyID0gdGhpcy5fZW5zdXJlWGFhSXNzdWVyKCk7XG5cdFx0XHRjb25zdCB4YWFQcm92aWRlcklkID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZU9yR2V0WGFhUHJvdmlkZXIoaXNzdWVyKTtcblx0XHRcdGlmICgheGFhUHJvdmlkZXJJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb3VyY2VDbGllbnRJZCA9IGNsaWVudElkID8/IGF1dGhEZXRhaWxzLmNsaWVudElkO1xuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgcmVzb3VyY2UtQVMgY2xpZW50IHNlY3JldCBmcm9tIHNlY3JldCBzdG9yYWdlLCBrZXllZCBieSB0aGUgcmVzb3VyY2UgaW5kaWNhdG9yXG5cdFx0XHQvLyArIHRoZSBjb25maWd1cmVkIHJlc291cmNlIGNsaWVudF9pZC4gU2V0IHZpYSB0aGUgXCJTZXQgQ2xpZW50IFNlY3JldFwiIGNvZGUgbGVucyBhYm92ZVxuXHRcdFx0Ly8gYG9hdXRoLmNsaWVudElkYCBpbiBtY3AuanNvbiAodGhlIHNlcnZlciBVUkwgZXF1YWxzIHRoZSByZXNvdXJjZSBpbmRpY2F0b3IgcGVyIFJGQyA5NDcwKS5cblx0XHRcdC8vIFVzaW5nIGByZXNvdXJjZWAgKG5vdCB0aGUgc2VydmVyIGxhdW5jaCBVUkkpIGVuc3VyZXMgdGhlIGtleSBtYXRjaGVzIHdoYXQgdGhlIHByb21wdFxuXHRcdFx0Ly8gd3JpdGVzIGluICRwcm9tcHRGb3JSZXNvdXJjZUNsaWVudFNlY3JldCwgc28gcHJvbXB0ZWQgc2VjcmV0cyBzdXJ2aXZlIHdpbmRvdyByZWxvYWQuXG5cdFx0XHRsZXQgcmVzb3VyY2VDbGllbnRTZWNyZXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZXNvdXJjZUNsaWVudElkKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VDbGllbnRTZWNyZXQgPSBhd2FpdCB0aGlzLl9zZWNyZXRTdG9yYWdlU2VydmljZS5nZXQobWNwT0F1dGhDbGllbnRTZWNyZXRTdG9yYWdlS2V5KHJlc291cmNlLCByZXNvdXJjZUNsaWVudElkKSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEJlc3QtZWZmb3J0IGxvb2t1cDsgZmFsbCB0aHJvdWdoLlxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0U2Vzc2lvbkZvclByb3ZpZGVyKGlkLCBzZXJ2ZXIsIHhhYVByb3ZpZGVySWQsIHhhYVNjb3BlcywgaXNzdWVyLCBlcnJvck9uVXNlckludGVyYWN0aW9uLCByZXNvdXJjZUNsaWVudElkLCByZXNvdXJjZSwgYXVkaWVuY2UsIHJlc291cmNlQ2xpZW50U2VjcmV0KTtcblx0XHR9XG5cblx0XHRsZXQgcHJvdmlkZXJJZCA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihhdXRob3JpemF0aW9uU2VydmVyLCByZXNvdXJjZVNlcnZlcik7XG5cblx0XHRjb25zdCByZXNvbHZlZENsaWVudElkID0gY2xpZW50SWQgPz8gYXV0aERldGFpbHMuY2xpZW50SWQ7XG5cdFx0Y29uc3QgbWNwU2VydmVyVXJsID0gc2VydmVyLmxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAgPyBzZXJ2ZXIubGF1bmNoLnVyaS50b1N0cmluZyh0cnVlKSA6IHVuZGVmaW5lZDtcblx0XHRsZXQgY2xpZW50U2VjcmV0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRpZExvb2t1cENsaWVudFNlY3JldCA9IGZhbHNlO1xuXHRcdGlmIChyZXNvbHZlZENsaWVudElkICYmIG1jcFNlcnZlclVybCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2xpZW50U2VjcmV0ID0gYXdhaXQgdGhpcy5fc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KG1jcE9BdXRoQ2xpZW50U2VjcmV0U3RvcmFnZUtleShtY3BTZXJ2ZXJVcmwsIHJlc29sdmVkQ2xpZW50SWQpKTtcblx0XHRcdFx0ZGlkTG9va3VwQ2xpZW50U2VjcmV0ID0gdHJ1ZTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBCZXN0LWVmZm9ydCBsb29rdXA7IHByb2NlZWQgd2l0aG91dCBhIGNsaWVudCBzZWNyZXQuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgZXhwbGljaXRseSBjb25maWd1cmVkIGFuIE9BdXRoIGNsaWVudF9pZCBpbiBtY3AuanNvbiBhbmQgdGhlIHN0b3JlZFxuXHRcdC8vIGNsaWVudCBzZWNyZXQgZGlmZmVycyBmcm9tIHdoYXQgdGhlIGV4aXN0aW5nIHByb3ZpZGVyIHdhcyByZWdpc3RlcmVkIHdpdGgsIGZvcmNlIGFcblx0XHQvLyByZS1yZWdpc3RyYXRpb24gc28gdGhlIG5ldyBzZWNyZXQgdGFrZXMgZWZmZWN0IG9uIHN1YnNlcXVlbnQgdG9rZW4gZXhjaGFuZ2VzLlxuXHRcdC8vIFdpdGhvdXQgdGhpcywgdGhlIHVzZXIgY2FuIG5ldmVyIHJlcGxhY2UgYSBjYWNoZWQgY2xpZW50IHNlY3JldCBpbiB0aGUgZXh0ZW5zaW9uXG5cdFx0Ly8gaG9zdCdzIER5bmFtaWNBdXRoUHJvdmlkZXIgYWZ0ZXIgdGhlIHByb3ZpZGVyIGhhcyBiZWVuIHJlZ2lzdGVyZWQuXG5cdFx0aWYgKGRpZExvb2t1cENsaWVudFNlY3JldCAmJiBwcm92aWRlcklkICYmICFmb3JjZU5ld1JlZ2lzdHJhdGlvbiAmJiB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuaXNEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlcklkKSkge1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHRoaXMuX2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UuZ2V0Q2xpZW50UmVnaXN0cmF0aW9uKHByb3ZpZGVySWQpO1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWQgJiYgcmVnaXN0ZXJlZC5jbGllbnRTZWNyZXQgIT09IGNsaWVudFNlY3JldCkge1xuXHRcdFx0XHRmb3JjZU5ld1JlZ2lzdHJhdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGZvcmNlTmV3UmVnaXN0cmF0aW9uICYmIHByb3ZpZGVySWQpIHtcblx0XHRcdGlmICghdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIocHJvdmlkZXJJZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9yY2UgbmV3IHJlZ2lzdHJhdGlvbiBmb3IgYSBub24tZHluYW1pYyBhdXRoZW50aWNhdGlvbiBwcm92aWRlci4nKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS51bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihwcm92aWRlcklkKTtcblx0XHRcdC8vIFRPRE86IEVuY2Fwc3VsYXRlIHRoaXMgYW5kIHRoZSB1bnJlZ2lzdGVyIGluIG9uZSBjYWxsIGluIHRoZSBhdXRoIHNlcnZpY2Vcblx0XHRcdGF3YWl0IHRoaXMuX2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UucmVtb3ZlRHluYW1pY1Byb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdFx0cHJvdmlkZXJJZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXByb3ZpZGVySWQpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyKGF1dGhvcml6YXRpb25TZXJ2ZXIsIGF1dGhEZXRhaWxzLmF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSwgYXV0aERldGFpbHMucmVzb3VyY2VNZXRhZGF0YSwgcmVzb2x2ZWRDbGllbnRJZCwgY2xpZW50U2VjcmV0KTtcblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHByb3ZpZGVySWQgPSBwcm92aWRlci5pZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0U2Vzc2lvbkZvclByb3ZpZGVyKGlkLCBzZXJ2ZXIsIHByb3ZpZGVySWQsIHJlc29sdmVkU2NvcGVzLCBhdXRob3JpemF0aW9uU2VydmVyLCBlcnJvck9uVXNlckludGVyYWN0aW9uLCByZXNvbHZlZENsaWVudElkLCBhdXRoRGV0YWlscy5yZXNvdXJjZU1ldGFkYXRhPy5yZXNvdXJjZSwgLyogYXVkaWVuY2UgKi8gdW5kZWZpbmVkLCBjbGllbnRTZWNyZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlWGFhSXNzdWVyKCk6IFVSSSB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SU1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcENvbmZpZyB8IHVuZGVmaW5lZD4obWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwU2VjdGlvbikgPz8ge307XG5cdFx0Y29uc3QgY29uZmlndXJlZElzc3VlciA9IGNvbmZpZy5pc3N1ZXI/LnRyaW0oKTtcblx0XHRpZiAoIWNvbmZpZ3VyZWRJc3N1ZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ21jcC5lbnRlcnByaXNlTWFuYWdlZC5pc3N1ZXJNaXNzaW5nJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgTUNQIGF1dGhlbnRpY2F0aW9uIHJlcXVpcmVzIGBtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5pc3N1ZXJgIHRvIGJlIGNvbmZpZ3VyZWQuIFNldCBpdCB2aWEgZW50ZXJwcmlzZSBwb2xpY3kgKFdpbmRvd3MgR3JvdXAgUG9saWN5IC8gbWFjT1MgbWFuYWdlZCBwcmVmZXJlbmNlcyAvIExpbnV4IGAvZXRjL3ZzY29kZS9wb2xpY3kuanNvbmApIG9yLCBmb3IgbG9jYWwgdGVzdGluZywgYnkgaGFuZC1lZGl0aW5nIGBzZXR0aW5ncy5qc29uYC5cIikpO1xuXHRcdH1cblx0XHRsZXQgcGFyc2VkOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IFVSSS5wYXJzZShjb25maWd1cmVkSXNzdWVyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ21jcC5lbnRlcnByaXNlTWFuYWdlZC5pc3N1ZXJJbnZhbGlkJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgTUNQIGF1dGhlbnRpY2F0aW9uIHJlcXVpcmVzIGBtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5pc3N1ZXJgIHRvIGJlIGEgdmFsaWQgVVJMOyBnb3QgJ3swfScuXCIsIGNvbmZpZ3VyZWRJc3N1ZXIpKTtcblx0XHR9XG5cdFx0aWYgKHBhcnNlZC5zY2hlbWUgIT09ICdodHRwcycgJiYgcGFyc2VkLnNjaGVtZSAhPT0gJ2h0dHAnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWQuaXNzdWVyTm90SHR0cCcsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlcyBgbWNwLmVudGVycHJpc2VNYW5hZ2VkQXV0aC5pZHAuaXNzdWVyYCB0byB1c2UgdGhlIGBodHRwc2Agb3IgYGh0dHBgIHNjaGVtZTsgZ290ICd7MH0nLlwiLCBjb25maWd1cmVkSXNzdWVyKSk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRTZXNzaW9uRm9yUHJvdmlkZXIoXG5cdFx0c2VydmVySWQ6IG51bWJlcixcblx0XHRzZXJ2ZXI6IE1jcFNlcnZlckRlZmluaXRpb24sXG5cdFx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRcdHNjb3Blczogc3RyaW5nW10sXG5cdFx0YXV0aG9yaXphdGlvblNlcnZlcj86IFVSSSxcblx0XHRlcnJvck9uVXNlckludGVyYWN0aW9uOiBib29sZWFuID0gZmFsc2UsXG5cdFx0Y2xpZW50SWQ/OiBzdHJpbmcsXG5cdFx0cmVzb3VyY2U/OiBzdHJpbmcsXG5cdFx0YXVkaWVuY2U/OiBzdHJpbmcsXG5cdFx0Y2xpZW50U2VjcmV0Pzogc3RyaW5nLFxuXHQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGF1dGhDb250ZXh0OiBJTWNwU2VydmVyQXV0aENvbnRleHQgPSB7IGF1dGhvcml6YXRpb25TZXJ2ZXIsIGNsaWVudElkLCByZXNvdXJjZSwgYXVkaWVuY2UgfTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBzY29wZXMsIHsgYXV0aG9yaXphdGlvblNlcnZlciwgY2xpZW50SWQsIGNsaWVudFNlY3JldCwgcmVzb3VyY2UsIGF1ZGllbmNlIH0sIHRydWUpO1xuXHRcdC8vIE9ubHkgSFRUUCBzZXJ2ZXJzIGF1dGhlbnRpY2F0ZSwgc28gdGhlIHNlcnZlciBVUkwgaXMgYWx3YXlzIGtub3duIGhlcmUuIEEgdG9rZW4gaXMgb25seSByZWxlYXNlZFxuXHRcdC8vIHRvIGEgc2VydmVyIHdob3NlIGN1cnJlbnQgVVJMIG1hdGNoZXMgdGhlIG9uZSB0aGUgdXNlciBjb25zZW50ZWQgdG8sIHNvIGNoYW5naW5nIHRoZSBVUkwgd2hpbGVcblx0XHQvLyBrZWVwaW5nIHRoZSBzYW1lIGlkIHJlcXVpcmVzIHJlLWNvbnNlbnQuXG5cdFx0aWYgKHNlcnZlci5sYXVuY2gudHlwZSAhPT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5IVFRQKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtY3BTZXJ2ZXJVcmwgPSBzZXJ2ZXIubGF1bmNoLnVyaS50b1N0cmluZyh0cnVlKTtcblx0XHRjb25zdCBhY2NvdW50TmFtZVByZWZlcmVuY2UgPSB0aGlzLmF1dGhlbnRpY2F0aW9uTWNwU2VydmVyc1NlcnZpY2UuZ2V0QWNjb3VudFByZWZlcmVuY2Uoc2VydmVyLmlkLCBwcm92aWRlcklkKTtcblx0XHRsZXQgbWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYWNjb3VudE5hbWVQcmVmZXJlbmNlKSB7XG5cdFx0XHRtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLmFjY291bnQubGFiZWwgPT09IGFjY291bnROYW1lUHJlZmVyZW5jZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdGxldCBzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb247XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCkge1xuXHRcdFx0Ly8gSWYgd2UgaGF2ZSBhbiBleGlzdGluZyBzZXNzaW9uIHByZWZlcmVuY2UsIHVzZSB0aGF0LiBJZiBub3QsIHdlJ2xsIHJldHVybiBhbnkgdmFsaWQgc2Vzc2lvbiBhdCB0aGUgZW5kIG9mIHRoaXMgZnVuY3Rpb24uXG5cdFx0XHRpZiAobWF0Y2hpbmdBY2NvdW50UHJlZmVyZW5jZVNlc3Npb24gJiYgdGhpcy5hdXRoZW50aWNhdGlvbk1DUFNlcnZlckFjY2Vzc1NlcnZpY2UuaXNBY2Nlc3NBbGxvd2VkRm9yVXJsKHByb3ZpZGVySWQsIG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uLmFjY291bnQubGFiZWwsIHNlcnZlci5pZCwgbWNwU2VydmVyVXJsKSkge1xuXHRcdFx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTUNQU2VydmVyVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBtYXRjaGluZ0FjY291bnRQcmVmZXJlbmNlU2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBzY29wZXMsIHNlcnZlci5pZCwgc2VydmVyLmxhYmVsKTtcblx0XHRcdFx0dGhpcy5fc2VydmVyQXV0aFRyYWNraW5nLnRyYWNrKHByb3ZpZGVySWQsIHNlcnZlcklkLCBzY29wZXMsIGF1dGhDb250ZXh0KTtcblx0XHRcdFx0cmV0dXJuIG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uLmFjY2Vzc1Rva2VuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgd2Ugb25seSBoYXZlIG9uZSBhY2NvdW50IGZvciBhIHNpbmdsZSBhdXRoIHByb3ZpZGVyLCBsZXRzIGp1c3QgY2hlY2sgaWYgaXQncyBhbGxvd2VkIGFuZCByZXR1cm4gaXQgaWYgaXQgaXMuXG5cdFx0XHRpZiAoIXByb3ZpZGVyLnN1cHBvcnRzTXVsdGlwbGVBY2NvdW50cyAmJiB0aGlzLmF1dGhlbnRpY2F0aW9uTUNQU2VydmVyQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWRGb3JVcmwocHJvdmlkZXJJZCwgc2Vzc2lvbnNbMF0uYWNjb3VudC5sYWJlbCwgc2VydmVyLmlkLCBtY3BTZXJ2ZXJVcmwpKSB7XG5cdFx0XHRcdHRoaXMuYXV0aGVudGljYXRpb25NQ1BTZXJ2ZXJVc2FnZVNlcnZpY2UuYWRkQWNjb3VudFVzYWdlKHByb3ZpZGVySWQsIHNlc3Npb25zWzBdLmFjY291bnQubGFiZWwsIHNjb3Blcywgc2VydmVyLmlkLCBzZXJ2ZXIubGFiZWwpO1xuXHRcdFx0XHR0aGlzLl9zZXJ2ZXJBdXRoVHJhY2tpbmcudHJhY2socHJvdmlkZXJJZCwgc2VydmVySWQsIHNjb3BlcywgYXV0aENvbnRleHQpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbnNbMF0uYWNjZXNzVG9rZW47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVycm9yT25Vc2VySW50ZXJhY3Rpb24pIHtcblx0XHRcdHRocm93IG5ldyBVc2VySW50ZXJhY3Rpb25SZXF1aXJlZEVycm9yKCdhdXRoZW50aWNhdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQWxsb3dlZCA9IGF3YWl0IHRoaXMubG9naW5Qcm9tcHQoc2VydmVyLmxhYmVsLCBwcm92aWRlci5sYWJlbCwgZmFsc2UpO1xuXHRcdGlmICghaXNBbGxvd2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VzZXIgZGlkIG5vdCBjb25zZW50IHRvIGxvZ2luLicpO1xuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9ucy5sZW5ndGgpIHtcblx0XHRcdGlmIChwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHMgJiYgZXJyb3JPblVzZXJJbnRlcmFjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignYXV0aGVudGljYXRpb24nKTtcblx0XHRcdH1cblx0XHRcdHNlc3Npb24gPSBwcm92aWRlci5zdXBwb3J0c011bHRpcGxlQWNjb3VudHNcblx0XHRcdFx0PyBhd2FpdCB0aGlzLmF1dGhlbnRpY2F0aW9uTWNwU2VydmVyc1NlcnZpY2Uuc2VsZWN0U2Vzc2lvbihwcm92aWRlcklkLCBzZXJ2ZXIuaWQsIHNlcnZlci5sYWJlbCwgc2NvcGVzLCBzZXNzaW9ucylcblx0XHRcdFx0OiBzZXNzaW9uc1swXTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAoZXJyb3JPblVzZXJJbnRlcmFjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvcignYXV0aGVudGljYXRpb24nKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjY291bnRUb0NyZWF0ZTogQXV0aGVudGljYXRpb25TZXNzaW9uQWNjb3VudCB8IHVuZGVmaW5lZCA9IG1hdGNoaW5nQWNjb3VudFByZWZlcmVuY2VTZXNzaW9uPy5hY2NvdW50O1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24oXG5cdFx0XHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdFx0XHRzY29wZXMsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0YWN0aXZhdGVJbW1lZGlhdGU6IHRydWUsXG5cdFx0XHRcdFx0XHRhY2NvdW50OiBhY2NvdW50VG9DcmVhdGUsXG5cdFx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyLFxuXHRcdFx0XHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRcdFx0XHRjbGllbnRTZWNyZXQsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHRcdGF1ZGllbmNlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9IHdoaWxlIChcblx0XHRcdFx0YWNjb3VudFRvQ3JlYXRlXG5cdFx0XHRcdCYmIGFjY291bnRUb0NyZWF0ZS5sYWJlbCAhPT0gc2Vzc2lvbi5hY2NvdW50LmxhYmVsXG5cdFx0XHRcdCYmICFhd2FpdCB0aGlzLmNvbnRpbnVlV2l0aEluY29ycmVjdEFjY291bnRQcm9tcHQoc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBhY2NvdW50VG9DcmVhdGUubGFiZWwpXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXV0aGVudGljYXRpb25NQ1BTZXJ2ZXJBY2Nlc3NTZXJ2aWNlLnVwZGF0ZUFsbG93ZWRNY3BTZXJ2ZXJzKHByb3ZpZGVySWQsIHNlc3Npb24uYWNjb3VudC5sYWJlbCwgW3sgaWQ6IHNlcnZlci5pZCwgbmFtZTogc2VydmVyLmxhYmVsLCBhbGxvd2VkOiB0cnVlLCB1cmw6IG1jcFNlcnZlclVybCB9XSk7XG5cdFx0dGhpcy5hdXRoZW50aWNhdGlvbk1jcFNlcnZlcnNTZXJ2aWNlLnVwZGF0ZUFjY291bnRQcmVmZXJlbmNlKHNlcnZlci5pZCwgcHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50KTtcblx0XHR0aGlzLmF1dGhlbnRpY2F0aW9uTUNQU2VydmVyVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNjb3Blcywgc2VydmVyLmlkLCBzZXJ2ZXIubGFiZWwpO1xuXHRcdHRoaXMuX3NlcnZlckF1dGhUcmFja2luZy50cmFjayhwcm92aWRlcklkLCBzZXJ2ZXJJZCwgc2NvcGVzLCBhdXRoQ29udGV4dCk7XG5cdFx0cmV0dXJuIHNlc3Npb24uYWNjZXNzVG9rZW47XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbnRpbnVlV2l0aEluY29ycmVjdEFjY291bnRQcm9tcHQoY2hvc2VuQWNjb3VudExhYmVsOiBzdHJpbmcsIHJlcXVlc3RlZEFjY291bnRMYWJlbDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2luY29ycmVjdEFjY291bnQnLCBcIkluY29ycmVjdCBhY2NvdW50IGRldGVjdGVkXCIpLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2luY29ycmVjdEFjY291bnREZXRhaWwnLCBcIlRoZSBjaG9zZW4gYWNjb3VudCwgezB9LCBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWVzdGVkIGFjY291bnQsIHsxfS5cIiwgY2hvc2VuQWNjb3VudExhYmVsLCByZXF1ZXN0ZWRBY2NvdW50TGFiZWwpLFxuXHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2tlZXAnLCAnS2VlcCB7MH0nLCBjaG9zZW5BY2NvdW50TGFiZWwpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gY2hvc2VuQWNjb3VudExhYmVsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdsb2dpbldpdGgnLCAnTG9naW4gd2l0aCB7MH0nLCByZXF1ZXN0ZWRBY2NvdW50TGFiZWwpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gcmVxdWVzdGVkQWNjb3VudExhYmVsXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdC5yZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQucmVzdWx0ID09PSBjaG9zZW5BY2NvdW50TGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vbkRpZENoYW5nZUF1dGhTZXNzaW9ucyhwcm92aWRlcklkOiBzdHJpbmcsIHByb3ZpZGVyTGFiZWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlcnNVc2luZ1Byb3ZpZGVyID0gdGhpcy5fc2VydmVyQXV0aFRyYWNraW5nLmdldChwcm92aWRlcklkKTtcblx0XHRpZiAoIXNlcnZlcnNVc2luZ1Byb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHNlcnZlcklkLCBzY29wZXMsIGNvbnRleHQgfSBvZiBzZXJ2ZXJzVXNpbmdQcm92aWRlcikge1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5fc2VydmVycy5nZXQoc2VydmVySWQpO1xuXHRcdFx0Y29uc3Qgc2VydmVyRGVmaW5pdGlvbiA9IHRoaXMuX3NlcnZlckRlZmluaXRpb25zLmdldChzZXJ2ZXJJZCk7XG5cblx0XHRcdGlmICghc2VydmVyIHx8ICFzZXJ2ZXJEZWZpbml0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IHZhbGlkYXRlIHNlcnZlcnMgdGhhdCBhcmUgcnVubmluZ1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2ZXIuc3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoc3RhdGUuc3RhdGUgIT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbGlkYXRlIGlmIHRoZSBzZXNzaW9uIGlzIHN0aWxsIGF2YWlsYWJsZS4gUmVwbGF5IHRoZSBhdXRob3JpemF0aW9uIHNlcnZlciwgY2xpZW50XG5cdFx0XHQvLyBpZCwgcmVzb3VyY2UsIGFuZCBhdWRpZW5jZSBjYXB0dXJlZCB3aGVuIHRoZSBzZXNzaW9uIHdhcyBlc3RhYmxpc2hlZCBzbyB0aGUgc2lsZW50XG5cdFx0XHQvLyB0b2tlbiByZXF1ZXN0IHRhcmdldHMgdGhlIHNhbWUgYXV0aG9yaXR5IHRoZSB1c2VyIHNpZ25lZCBpbiBhZ2FpbnN0IFx1MjAxNCBkcm9wcGluZyB0aGVcblx0XHRcdC8vIGF1dGhvcml6YXRpb24gc2VydmVyIGhlcmUgd291bGQgZmFsbCBiYWNrIHRvIHRoZSBwcm92aWRlcidzIGRlZmF1bHQgYXV0aG9yaXR5IChlLmcuXG5cdFx0XHQvLyB0aGUgTWljcm9zb2Z0IHByb3ZpZGVyJ3MgYG9yZ2FuaXphdGlvbnNgIHRlbmFudCkgYW5kIGNhbiB0ZWFyIGRvd24gYSB3b3JraW5nIHNlcnZlci5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2dldFNlc3Npb25Gb3JQcm92aWRlcihzZXJ2ZXJJZCwgc2VydmVyRGVmaW5pdGlvbiwgcHJvdmlkZXJJZCwgc2NvcGVzLCBjb250ZXh0LmF1dGhvcml6YXRpb25TZXJ2ZXIsIHRydWUsIGNvbnRleHQuY2xpZW50SWQsIGNvbnRleHQucmVzb3VyY2UsIGNvbnRleHQuYXVkaWVuY2UpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoVXNlckludGVyYWN0aW9uUmVxdWlyZWRFcnJvci5pcyhlKSkge1xuXHRcdFx0XHRcdC8vIFNlc3Npb24gaXMgbm8gbG9uZ2VyIHZhbGlkLCBzdG9wIHRoZSBzZXJ2ZXJcblx0XHRcdFx0XHRzZXJ2ZXIucHVzaExvZyhMb2dMZXZlbC5XYXJuaW5nLCBubHMubG9jYWxpemUoJ21jcEF1dGhTZXNzaW9uUmVtb3ZlZCcsIFwiQXV0aGVudGljYXRpb24gc2Vzc2lvbiBmb3IgezB9IHJlbW92ZWQsIHN0b3BwaW5nIHNlcnZlclwiLCBwcm92aWRlckxhYmVsKSk7XG5cdFx0XHRcdFx0c2VydmVyLnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZ25vcmUgb3RoZXIgZXJyb3JzIHRvIGF2b2lkIGRpc3J1cHRpbmcgb3RoZXIgc2VydmVyc1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdCRsb2dNY3BBdXRoU2V0dXAoZGF0YTogSUF1dGhNZXRhZGF0YVNvdXJjZSk6IHZvaWQge1xuXHRcdHR5cGUgTWNwQXV0aFNldHVwQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ1R5bGVyTGVvbmhhcmR0Jztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3MgaG93IE1DUCBPQXV0aCBhdXRoZW50aWNhdGlvbiBzZXR1cCB3YXMgZGlzY292ZXJlZCBhbmQgY29uZmlndXJlZCc7XG5cdFx0XHRyZXNvdXJjZU1ldGFkYXRhU291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IHJlc291cmNlIG1ldGFkYXRhIHdhcyBkaXNjb3ZlcmVkIChoZWFkZXIsIHdlbGxLbm93biwgb3Igbm9uZSknIH07XG5cdFx0XHRzZXJ2ZXJNZXRhZGF0YVNvdXJjZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hvdyBhdXRob3JpemF0aW9uIHNlcnZlciBtZXRhZGF0YSB3YXMgZGlzY292ZXJlZCAocmVzb3VyY2VNZXRhZGF0YSwgd2VsbEtub3duLCBvciBkZWZhdWx0KScgfTtcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJQXV0aE1ldGFkYXRhU291cmNlLCBNY3BBdXRoU2V0dXBDbGFzc2lmaWNhdGlvbj4oJ21jcC9hdXRoU2V0dXAnLCBkYXRhKTtcblx0fVxuXG5cdGFzeW5jICRzdGFydE1jcEdhdGV3YXkoY2hhdFNlc3Npb25SZXNvdXJjZT86IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHsgc2VydmVyczogeyBsYWJlbDogc3RyaW5nOyBhZGRyZXNzOiBVUkkgfVtdOyBnYXRld2F5SWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fbWNwR2F0ZXdheVNlcnZpY2UuY3JlYXRlR2F0ZXdheShcblx0XHRcdHRoaXMuX2V4dEhvc3RDb250ZXh0LmV4dGVuc2lvbkhvc3RLaW5kID09PSBFeHRlbnNpb25Ib3N0S2luZC5SZW1vdGUsXG5cdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlID8gVVJJLnJldml2ZShjaGF0U2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBnYXRld2F5SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQocmVzdWx0KTtcblx0XHRzdG9yZS5hZGQocmVzdWx0Lm9uRGlkQ2hhbmdlU2VydmVycyhzZXJ2ZXJzID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUdhdGV3YXlTZXJ2ZXJzKGdhdGV3YXlJZCwgc2VydmVycy5tYXAocyA9PiAoeyBsYWJlbDogcy5sYWJlbCwgYWRkcmVzczogcy5hZGRyZXNzIH0pKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2dhdGV3YXlzLnNldChnYXRld2F5SWQsIHN0b3JlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXJ2ZXJzOiByZXN1bHQuc2VydmVycy5tYXAocyA9PiAoeyBsYWJlbDogcy5sYWJlbCwgYWRkcmVzczogcy5hZGRyZXNzIH0pKSxcblx0XHRcdGdhdGV3YXlJZCxcblx0XHR9O1xuXHR9XG5cblx0JGRpc3Bvc2VNY3BHYXRld2F5KGdhdGV3YXlJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2F0ZXdheXMuZGVsZXRlQW5kRGlzcG9zZShnYXRld2F5SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2dpblByb21wdChtY3BMYWJlbDogc3RyaW5nLCBwcm92aWRlckxhYmVsOiBzdHJpbmcsIHJlY3JlYXRpbmdTZXNzaW9uOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHJlY3JlYXRpbmdTZXNzaW9uXG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29uZmlybVJlbG9naW4nLCBcIlRoZSBNQ1AgU2VydmVyIERlZmluaXRpb24gJ3swfScgd2FudHMgeW91IHRvIGF1dGhlbnRpY2F0ZSB0byB7MX0uXCIsIG1jcExhYmVsLCBwcm92aWRlckxhYmVsKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2NvbmZpcm1Mb2dpbicsIFwiVGhlIE1DUCBTZXJ2ZXIgRGVmaW5pdGlvbiAnezB9JyB3YW50cyB0byBhdXRoZW50aWNhdGUgdG8gezF9LlwiLCBtY3BMYWJlbCwgcHJvdmlkZXJMYWJlbCk7XG5cblx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPGJvb2xlYW4gfCB1bmRlZmluZWQ+W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdhbGxvdycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkFsbG93XCIpLFxuXHRcdFx0XHRydW4oKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0XTtcblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWUsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0ID8/IGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLl9zZXJ2ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRzZXJ2ZXIuZXh0SG9zdERpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2VydmVycy5jbGVhcigpO1xuXHRcdHRoaXMuX3NlcnZlckRlZmluaXRpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2VydmVyQXV0aFRyYWNraW5nLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY2xhc3MgRXh0SG9zdE1jcFNlcnZlckxhdW5jaCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwTWVzc2FnZVRyYW5zcG9ydCB7XG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxNY3BDb25uZWN0aW9uU3RhdGU+KCdtY3BTZXJ2ZXJTdGF0ZScsIHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0YXJ0aW5nIH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTG9nID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBsZXZlbDogTG9nTGV2ZWw7IG1lc3NhZ2U6IHN0cmluZyB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkTG9nID0gdGhpcy5fb25EaWRMb2cuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlTWVzc2FnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1DUC5KU09OUlBDTWVzc2FnZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFJlY2VpdmVNZXNzYWdlID0gdGhpcy5fb25EaWRSZWNlaXZlTWVzc2FnZS5ldmVudDtcblxuXHRwdXNoTG9nKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRMb2cuZmlyZSh7IG1lc3NhZ2UsIGxldmVsIH0pO1xuXHR9XG5cblx0cHVzaE1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHBhcnNlZDogTUNQLkpTT05SUENNZXNzYWdlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKG1lc3NhZ2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMucHVzaExvZyhMb2dMZXZlbC5XYXJuaW5nLCBgRmFpbGVkIHRvIHBhcnNlIG1lc3NhZ2U6ICR7SlNPTi5zdHJpbmdpZnkobWVzc2FnZSl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnNlZCkge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkgeyAvLyBzdHJlYW1hYmxlIEhUVFAgc3VwcG9ydHMgYmF0Y2hpbmdcblx0XHRcdFx0cGFyc2VkLmZvckVhY2gocCA9PiB0aGlzLl9vbkRpZFJlY2VpdmVNZXNzYWdlLmZpcmUocCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZWNlaXZlTWVzc2FnZS5maXJlKHBhcnNlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdEtpbmQ6IEV4dGVuc2lvbkhvc3RLaW5kLFxuXHRcdHB1YmxpYyByZWFkb25seSBzdG9wOiAoKSA9PiB2b2lkLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZW5kOiAobWVzc2FnZTogTUNQLkpTT05SUENNZXNzYWdlKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5wdXNoTG9nKExvZ0xldmVsLkluZm8sIGBTdGFydGluZyBzZXJ2ZXIgZnJvbSAke2V4dGVuc2lvbkhvc3RLaW5kVG9TdHJpbmcoZXh0SG9zdEtpbmQpfSBleHRlbnNpb24gaG9zdGApO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBleHRIb3N0RGlzcG9zZSgpIHtcblx0XHRpZiAoTWNwQ29ubmVjdGlvblN0YXRlLmlzUnVubmluZyh0aGlzLnN0YXRlLmdldCgpKSkge1xuXHRcdFx0dGhpcy5wdXNoTG9nKExvZ0xldmVsLldhcm5pbmcsICdFeHRlbnNpb24gaG9zdCBzaHV0IGRvd24sIHNlcnZlciB3aWxsIHN0b3AuJyk7XG5cdFx0XHR0aGlzLnN0YXRlLnNldCh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKE1jcENvbm5lY3Rpb25TdGF0ZS5pc1J1bm5pbmcodGhpcy5zdGF0ZS5nZXQoKSkpIHtcblx0XHRcdHRoaXMuc3RvcCgpO1xuXHRcdH1cblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBjb250ZXh0IG5lZWRlZCB0byByZS1hY3F1aXJlIGEgdG9rZW4gZm9yIGEgdHJhY2tlZCBNQ1Agc2VydmVyLCBjYXB0dXJlZCB3aGVuIHRoZVxuICogc2Vzc2lvbiB3YXMgZmlyc3QgZXN0YWJsaXNoZWQuIFRoZSB0cmFja2VyIGhvbGRzIHRoaXMgb3BhcXVlbHkgYW5kIHJlcGxheXMgaXQgdmVyYmF0aW0gb25cbiAqIHJlLXZhbGlkYXRpb24gc28gdGhlIHNpbGVudCB0b2tlbiByZXF1ZXN0IHRhcmdldHMgdGhlIHNhbWUgYXV0aG9yaXR5IC8gcmVzb3VyY2UgLyBhdWRpZW5jZVxuICogdGhhdCB0aGUgb3JpZ2luYWwgc2lnbi1pbiB1c2VkLiBEcm9wcGluZyB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIgaGVyZSB3b3VsZCBsZXQgdGhlIHByb3ZpZGVyXG4gKiBmYWxsIGJhY2sgdG8gYSBkZWZhdWx0IGF1dGhvcml0eSAoZS5nLiB0aGUgTWljcm9zb2Z0IHByb3ZpZGVyJ3MgYG9yZ2FuaXphdGlvbnNgIHRlbmFudCkgYW5kXG4gKiByZXF1ZXN0IGEgdG9rZW4gYWdhaW5zdCB0aGUgd3JvbmcgdGVuYW50LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNY3BTZXJ2ZXJBdXRoQ29udGV4dCB7XG5cdHJlYWRvbmx5IGF1dGhvcml6YXRpb25TZXJ2ZXI/OiBVUkk7XG5cdHJlYWRvbmx5IGNsaWVudElkPzogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZT86IHN0cmluZztcblx0cmVhZG9ubHkgYXVkaWVuY2U/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogVHJhY2tzIHdoaWNoIE1DUCBzZXJ2ZXJzIGFyZSB1c2luZyB3aGljaCBhdXRoZW50aWNhdGlvbiBwcm92aWRlcnMuXG4gKiBPcmdhbml6ZWQgYnkgcHJvdmlkZXIgSUQgZm9yIGVmZmljaWVudCBsb29rdXAgd2hlbiBhdXRoIHNlc3Npb25zIGNoYW5nZS5cbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFNlcnZlckF1dGhUcmFja2VyIHtcblx0Ly8gUHJvdmlkZXIgSUQgLT4gQXJyYXkgb2YgdHJhY2tlZCBzZXJ2ZXJzIChzZXJ2ZXJJZCwgc2NvcGVzLCBhbmQgdGhlIGF1dGggY29udGV4dCB0byByZXBsYXkpXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYWNraW5nID0gbmV3IE1hcDxzdHJpbmcsIEFycmF5PHsgc2VydmVySWQ6IG51bWJlcjsgc2NvcGVzOiBzdHJpbmdbXTsgY29udGV4dDogSU1jcFNlcnZlckF1dGhDb250ZXh0IH0+PigpO1xuXG5cdC8qKlxuXHQgKiBUcmFjayBhdXRoZW50aWNhdGlvbiBmb3IgYSBzZXJ2ZXIgd2l0aCBhIHNwZWNpZmljIHByb3ZpZGVyLlxuXHQgKiBSZXBsYWNlcyBhbnkgZXhpc3RpbmcgdHJhY2tpbmcgZm9yIHRoaXMgc2VydmVyL3Byb3ZpZGVyIGNvbWJpbmF0aW9uLlxuXHQgKi9cblx0dHJhY2socHJvdmlkZXJJZDogc3RyaW5nLCBzZXJ2ZXJJZDogbnVtYmVyLCBzY29wZXM6IHN0cmluZ1tdLCBjb250ZXh0OiBJTWNwU2VydmVyQXV0aENvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJ2ZXJzID0gdGhpcy5fdHJhY2tpbmcuZ2V0KHByb3ZpZGVySWQpIHx8IFtdO1xuXHRcdGNvbnN0IGZpbHRlcmVkID0gc2VydmVycy5maWx0ZXIocyA9PiBzLnNlcnZlcklkICE9PSBzZXJ2ZXJJZCk7XG5cdFx0ZmlsdGVyZWQucHVzaCh7IHNlcnZlcklkLCBzY29wZXMsIGNvbnRleHQgfSk7XG5cdFx0dGhpcy5fdHJhY2tpbmcuc2V0KHByb3ZpZGVySWQsIGZpbHRlcmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgYWxsIGF1dGhlbnRpY2F0aW9uIHRyYWNraW5nIGZvciBhIHNlcnZlciBhY3Jvc3MgYWxsIHByb3ZpZGVycy5cblx0ICovXG5cdHVudHJhY2soc2VydmVySWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVySWQsIHNlcnZlcnNdIG9mIHRoaXMuX3RyYWNraW5nLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgZmlsdGVyZWQgPSBzZXJ2ZXJzLmZpbHRlcihzID0+IHMuc2VydmVySWQgIT09IHNlcnZlcklkKTtcblx0XHRcdGlmIChmaWx0ZXJlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fdHJhY2tpbmcuZGVsZXRlKHByb3ZpZGVySWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdHJhY2tpbmcuc2V0KHByb3ZpZGVySWQsIGZpbHRlcmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGFsbCBzZXJ2ZXJzIHVzaW5nIGEgc3BlY2lmaWMgYXV0aGVudGljYXRpb24gcHJvdmlkZXIuXG5cdCAqL1xuXHRnZXQocHJvdmlkZXJJZDogc3RyaW5nKTogUmVhZG9ubHlBcnJheTx7IHNlcnZlcklkOiBudW1iZXI7IHNjb3Blczogc3RyaW5nW107IGNvbnRleHQ6IElNY3BTZXJ2ZXJBdXRoQ29udGV4dCB9PiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyYWNraW5nLmdldChwcm92aWRlcklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciBhbGwgdHJhY2tpbmcgZGF0YS5cblx0ICovXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyYWNraW5nLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksZUFBZSxpQkFBaUIseUJBQXlCO0FBQzlFLFNBQVMsU0FBOEIsdUJBQXVCO0FBQzlELE9BQU8sY0FBYztBQUNyQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBcUM7QUFDOUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBK0Isb0JBQW9CO0FBQ25ELFNBQVMsNkJBQXNELHdCQUF3QixvQkFBb0IscUJBQXFCLGlCQUFpQix3QkFBd0IsZ0JBQWdCLGdDQUFnQyxvQ0FBb0M7QUFDN1AsU0FBNkMsMENBQTBDO0FBRXZGLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQThELDhCQUE4QjtBQUM1RixTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLG1CQUFtQixpQ0FBaUM7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBMEIsNEJBQTRCO0FBRXRELFNBQVMsZ0JBQTRHLG1CQUF1QztBQUdySixJQUFNLGdCQUFOLGNBQTRCLFdBQXlDO0FBQUEsRUFjM0UsWUFDa0IsaUJBQ2MsY0FDRSxlQUNRLHdCQUNHLGlDQUNNLHNDQUNELHFDQUNjLDhDQUMzQixtQkFDQyxvQkFDRCxtQkFDVSxv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
