import { fetchAuthorizationServerMetadata } from "../../../../../../base/common/oauth.js";
import { SequencerByKey } from "../../../../../../base/common/async.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { localize } from "../../../../../../nls.js";
import { IAuthenticationMcpAccessService } from "../../../../../services/authentication/browser/authenticationMcpAccessService.js";
import { IAuthenticationMcpService } from "../../../../../services/authentication/browser/authenticationMcpService.js";
import { IAuthenticationMcpUsageService } from "../../../../../services/authentication/browser/authenticationMcpUsageService.js";
import { getDynamicAuthenticationProviderId, IAuthenticationService } from "../../../../../services/authentication/common/authentication.js";
import { IDynamicAuthenticationProviderStorageService } from "../../../../../services/authentication/common/dynamicAuthenticationProviderStorage.js";
import { CHAT_SETUP_ACTION_ID } from "../../actions/chatActions.js";
function agentHostMcpServerId(authority, serverName, resourceUrl) {
  return `agent-host-mcp:${authority}/${encodeURIComponent(serverName)}/${encodeURIComponent(resourceUrl)}`;
}
class AgentHostAuthTokenCache {
  constructor() {
    this._completedTokens = /* @__PURE__ */ new Map();
    this._pendingAuthentications = /* @__PURE__ */ new Map();
    this._keyGenerations = /* @__PURE__ */ new Map();
    this._globalGeneration = 0;
  }
  /**
   * Forwards a token once per resource/scope pair. Same-token callers share
   * and await an in-flight authentication.
   */
  async authenticate(resource, scopes, token, authenticate) {
    const key = this._key(resource, scopes);
    const globalGeneration = this._globalGeneration;
    const keyGeneration = this._keyGenerations.get(key) ?? 0;
    const pending = this._pendingAuthentications.get(key);
    if (pending) {
      if (pending.token === token) {
        await pending.promise;
        if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
          throw new CancellationError();
        }
        return false;
      }
      try {
        await pending.promise;
      } catch {
      }
      if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
        throw new CancellationError();
      }
      return this.authenticate(resource, scopes, token, authenticate);
    }
    if (this._completedTokens.get(key) === token) {
      return false;
    }
    const promise = (async () => {
      await authenticate();
      if (!this._isCurrentGeneration(key, globalGeneration, keyGeneration)) {
        throw new CancellationError();
      }
      this._completedTokens.set(key, token);
    })();
    this._pendingAuthentications.set(key, { token, promise });
    try {
      await promise;
      return true;
    } finally {
      if (this._pendingAuthentications.get(key)?.promise === promise) {
        this._pendingAuthentications.delete(key);
      }
    }
  }
  /**
   * Clear the cached token for a specific resource/scope pair, a whole resource,
   * or all resources if no argument is given. Call after a failed `authenticate`
   * RPC or when the agent host process restarts.
   */
  clear(resource, scopes) {
    if (resource !== void 0) {
      if (scopes !== void 0) {
        const key = this._key(resource, scopes);
        this._invalidateKey(key);
        this._completedTokens.delete(key);
        this._pendingAuthentications.delete(key);
        return;
      }
      const prefix = `${resource}\0`;
      const keys = /* @__PURE__ */ new Set([...this._completedTokens.keys(), ...this._pendingAuthentications.keys(), ...this._keyGenerations.keys()]);
      for (const key of keys) {
        if (key.startsWith(prefix)) {
          this._invalidateKey(key);
          this._completedTokens.delete(key);
          this._pendingAuthentications.delete(key);
        }
      }
    } else {
      this._globalGeneration++;
      this._completedTokens.clear();
      this._pendingAuthentications.clear();
      this._keyGenerations.clear();
    }
  }
  _invalidateKey(key) {
    this._keyGenerations.set(key, (this._keyGenerations.get(key) ?? 0) + 1);
  }
  _isCurrentGeneration(key, globalGeneration, keyGeneration) {
    return this._globalGeneration === globalGeneration && (this._keyGenerations.get(key) ?? 0) === keyGeneration;
  }
  _key(resource, scopes) {
    return `${resource}\0${scopes ? [...new Set(scopes)].sort().join("\0") : ""}`;
  }
}
async function resolveTokenForResource(resourceServer, authorizationServers, scopes, authenticationService, logService, logPrefix) {
  for (const server of authorizationServers) {
    const serverUri = URI.parse(server);
    const providerId = await authenticationService.getOrActivateProviderIdForServer(serverUri, resourceServer);
    if (!providerId) {
      logService.trace(`${logPrefix} No auth provider found for server: ${server}`);
      continue;
    }
    logService.trace(`${logPrefix} Resolved auth provider '${providerId}' for server: ${server}`);
    const sessions = await authenticationService.getSessions(providerId, [...scopes], { authorizationServer: serverUri }, true);
    if (sessions.length > 0) {
      return sessions[0].accessToken;
    }
    const allSessions = await authenticationService.getSessions(providerId, void 0, { authorizationServer: serverUri }, true);
    const requestedSet = new Set(scopes);
    let bestToken;
    let bestExtraScopes = Infinity;
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
        const extraScopes = sessionScopes.size - requestedSet.size;
        if (extraScopes < bestExtraScopes) {
          bestExtraScopes = extraScopes;
          bestToken = session.accessToken;
        }
      }
    }
    if (bestToken) {
      return bestToken;
    }
  }
  return void 0;
}
async function forwardAuthenticationToken(options, resource, scopes, token) {
  const request = { resource, scopes, token };
  if (options.authTokenCache) {
    return options.authTokenCache.authenticate(resource, scopes, token, () => options.authenticate(request));
  }
  await options.authenticate(request);
  return true;
}
async function authenticateProtectedResources(accessor, agents, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const logService = accessor.get(ILogService);
  for (const agent of agents) {
    for (const resource of agent.protectedResources ?? []) {
      const resourceUri = URI.parse(resource.resource);
      const scopes = resource.scopes_supported ?? [];
      const token = await resolveTokenForResource(
        resourceUri,
        resource.authorization_servers ?? [],
        scopes,
        authenticationService,
        logService,
        options.logPrefix
      );
      if (!token) {
        logService.info(`${options.logPrefix} No token resolved for resource: ${resource.resource}`);
        continue;
      }
      const authenticated = await forwardAuthenticationToken(options, resource.resource, scopes, token);
      if (!authenticated) {
        logService.trace(`${options.logPrefix} Auth token for ${resource.resource} unchanged; skipping authenticate RPC`);
        continue;
      }
      logService.info(`${options.logPrefix} Authenticating for resource: ${resource.resource}`);
    }
  }
}
async function resolveAuthenticationInteractively(accessor, protectedResources, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const commandService = accessor.get(ICommandService);
  const logService = accessor.get(ILogService);
  for (const resource of protectedResources) {
    const resourceUri = URI.parse(resource.resource);
    const scopes = resource.scopes_supported ?? [];
    let token = await resolveTokenForResource(
      resourceUri,
      resource.authorization_servers ?? [],
      scopes,
      authenticationService,
      logService,
      options.logPrefix
    );
    if (token) {
      await forwardAuthenticationToken(options, resource.resource, scopes, token);
      logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
      return true;
    }
    const setupResult = await commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, {
      forceSignInDialog: true,
      additionalScopes: scopes,
      dialogTitle: localize("agentHost.signInDialogTitle", "Sign in to use GitHub Copilot"),
      disableChatViewReveal: true,
      returnResult: true
    });
    if (setupResult?.success === void 0) {
      return false;
    }
    if (!setupResult.success) {
      throw setupResult.error ?? new Error(localize("agentHost.signInFailed", "Failed to sign in to use GitHub Copilot."));
    }
    token = await resolveTokenForResource(
      resourceUri,
      resource.authorization_servers ?? [],
      scopes,
      authenticationService,
      logService,
      options.logPrefix
    );
    if (!token) {
      return false;
    }
    await forwardAuthenticationToken(options, resource.resource, scopes, token);
    logService.info(`${options.logPrefix} Interactive authentication succeeded for ${resource.resource}`);
    return true;
  }
  return false;
}
async function resolveMcpServerAuthentication(accessor, protectedResource, options) {
  const authenticationService = accessor.get(IAuthenticationService);
  const authenticationMcpAccessService = accessor.get(IAuthenticationMcpAccessService);
  const authenticationMcpService = accessor.get(IAuthenticationMcpService);
  const authenticationMcpUsageService = accessor.get(IAuthenticationMcpUsageService);
  const dynamicAuthenticationProviderStorageService = accessor.get(IDynamicAuthenticationProviderStorageService);
  const logService = accessor.get(ILogService);
  const agentHostMeta = options.agentHost ? { authority: options.agentHost.authority, label: accessor.get(ILabelService).getHostLabel(options.agentHost.scheme, options.agentHost.authority) } : void 0;
  const scopes = options.scopes.length > 0 || isGitHubMcpResource(protectedResource) ? options.scopes : protectedResource.scopes_supported ?? [];
  const authenticationOperations = getMcpAuthenticationOperations(authenticationService);
  for (const authorizationServer of protectedResource.authorization_servers ?? []) {
    const authorizationServerUri = URI.parse(authorizationServer);
    const providerOperationId = getDynamicAuthenticationProviderId(authorizationServerUri, protectedResource);
    const authenticated = await authenticationOperations.queue(providerOperationId, async () => {
      const providerId = await getOrCreateProviderForMcpResource(
        authorizationServerUri,
        protectedResource,
        options.oauthClient,
        authenticationService,
        dynamicAuthenticationProviderStorageService,
        logService,
        options.logPrefix,
        options.allowInteraction,
        options.authorizationServerMetadataFetcher ?? fetchAuthorizationServerMetadata
      );
      if (!providerId) {
        return false;
      }
      const oauthClientOptions = options.oauthClient ? { clientId: options.oauthClient.clientId, clientSecret: options.oauthClient.clientSecret } : {};
      const sessions = await authenticationService.getSessions(providerId, [...scopes], {
        authorizationServer: authorizationServerUri,
        resource: protectedResource.resource,
        ...oauthClientOptions,
        silent: !options.allowInteraction
      }, true);
      const allowedSession = getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options);
      if (allowedSession) {
        await authenticateMcpSession(providerId, allowedSession, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, false, agentHostMeta);
        return true;
      }
      if (!options.allowInteraction) {
        return false;
      }
      const provider = authenticationService.getProvider(providerId);
      const session = sessions.length ? provider.supportsMultipleAccounts ? await authenticationMcpService.selectSession(providerId, options.mcpServerId, options.mcpServerName, [...scopes], sessions) : sessions[0] : await authenticationService.createSession(providerId, [...scopes], {
        activateImmediate: true,
        authorizationServer: authorizationServerUri,
        resource: protectedResource.resource,
        ...oauthClientOptions
      });
      await authenticateMcpSession(providerId, session, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, true, agentHostMeta);
      return true;
    });
    if (authenticated) {
      return true;
    }
  }
  return false;
}
const mcpAuthenticationOperations = /* @__PURE__ */ new WeakMap();
function getMcpAuthenticationOperations(authenticationService) {
  let operations = mcpAuthenticationOperations.get(authenticationService);
  if (!operations) {
    operations = new SequencerByKey();
    mcpAuthenticationOperations.set(authenticationService, operations);
  }
  return operations;
}
function isGitHubMcpResource(resource) {
  return resource.resource_name === "GitHub MCP Server";
}
async function getOrCreateProviderForMcpResource(authorizationServer, protectedResource, oauthClient, authenticationService, dynamicAuthenticationProviderStorageService, logService, logPrefix, allowCreation, authorizationServerMetadataFetcher) {
  const resourceUri = URI.parse(protectedResource.resource);
  const dynamicProviderId = getDynamicAuthenticationProviderId(authorizationServer, protectedResource);
  let clientId = oauthClient?.clientId;
  let clientSecret = oauthClient?.clientSecret;
  if (oauthClient) {
    const isProviderActive = authenticationService.isDynamicAuthenticationProvider(dynamicProviderId);
    const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
    const clientMatches = registeredClient?.clientId === oauthClient.clientId && registeredClient.clientSecret === oauthClient.clientSecret;
    if (clientMatches) {
      if (isProviderActive) {
        return dynamicProviderId;
      }
    } else {
      if (!allowCreation) {
        return void 0;
      }
      if (isProviderActive) {
        authenticationService.unregisterAuthenticationProvider(dynamicProviderId);
        await dynamicAuthenticationProviderStorageService.removeDynamicProvider(dynamicProviderId);
      }
    }
  } else {
    const existing = await authenticationService.getOrActivateProviderIdForServer(authorizationServer, resourceUri);
    if (existing) {
      return existing;
    }
    const registeredClient = await dynamicAuthenticationProviderStorageService.getClientRegistration(dynamicProviderId);
    if (!registeredClient?.clientId && !allowCreation) {
      return void 0;
    }
    clientId = registeredClient?.clientId;
    clientSecret = registeredClient?.clientSecret;
  }
  try {
    const { metadata } = await authorizationServerMetadataFetcher(authorizationServer.toString(true));
    const provider = await authenticationService.createDynamicAuthenticationProvider(authorizationServer, metadata, protectedResource, clientId, clientSecret);
    return provider?.id;
  } catch (err) {
    logService.warn(`${logPrefix} Failed to create MCP auth provider for ${authorizationServer.toString(true)}`, err);
    return void 0;
  }
}
function getAllowedMcpSession(providerId, sessions, authenticationMcpAccessService, authenticationMcpService, options) {
  const accountNamePreference = authenticationMcpService.getAccountPreference(options.mcpServerId, providerId);
  if (accountNamePreference) {
    const preferred = sessions.find((session) => session.account.label === accountNamePreference);
    if (preferred && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, preferred.account.label, options.mcpServerId, options.mcpServerUrl)) {
      return preferred;
    }
  }
  if (sessions.length === 1 && authenticationMcpAccessService.isAccessAllowedForUrl(providerId, sessions[0].account.label, options.mcpServerId, options.mcpServerUrl)) {
    return sessions[0];
  }
  return void 0;
}
async function authenticateMcpSession(providerId, session, scopes, authenticationMcpAccessService, authenticationMcpService, authenticationMcpUsageService, logService, options, updateAccess, agentHost) {
  await forwardAuthenticationToken(options, options.mcpServerUrl, scopes, session.accessToken);
  if (updateAccess) {
    authenticationMcpAccessService.updateAllowedMcpServers(providerId, session.account.label, [{ id: options.mcpServerId, name: options.mcpServerName, allowed: true, url: options.mcpServerUrl, agentHost }]);
    authenticationMcpService.updateAccountPreference(options.mcpServerId, providerId, session.account);
  }
  authenticationMcpUsageService.addAccountUsage(providerId, session.account.label, scopes, options.mcpServerId, options.mcpServerName);
  logService.info(`${options.logPrefix} MCP authentication succeeded for ${options.mcpServerName}`);
}
export {
  AgentHostAuthTokenCache,
  agentHostMcpServerId,
  authenticateProtectedResources,
  resolveAuthenticationInteractively,
  resolveMcpServerAuthentication,
  resolveTokenForResource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBdXRoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZmV0Y2hBdXRob3JpemF0aW9uU2VydmVyTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYXV0aC5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXJCeUtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyB0eXBlIE1jcE9BdXRoQ2xpZW50LCB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyB0eXBlIEFnZW50SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBnZXREeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElEeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2R5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXR1cFJlc3VsdCB9IGZyb20gJy4uLy4uL2NoYXRTZXR1cC9jaGF0U2V0dXAuanMnO1xuXG4vKipcbiAqIFN0YWJsZSBpZGVudGl0eSBmb3IgYW4gYWdlbnQtaG9zdCBNQ1Agc2VydmVyLCB1c2VkIGFzIHRoZSBrZXkgZm9yXG4gKiByZW1lbWJlcmVkIGF1dGhlbnRpY2F0aW9uIChhbGxvd2VkLXNlcnZlciBhY2Nlc3MsIGFjY291bnQgcHJlZmVyZW5jZSBhbmRcbiAqIHVzYWdlKS4gQWdlbnQtaG9zdCBjdXN0b21pemF0aW9uIGlkcyBhcmUgKipub3QqKiBzdGFibGUgYWNyb3NzIHJlbG9hZHMgXHUyMDE0XG4gKiBiYXJlL3RvcC1sZXZlbCBpZHMgZW1iZWQgdGhlIGFnZW50LWhvc3Qgc2Vzc2lvbiBpZCwgYW5kIHN5bmNlZCBjaGlsZCBpZHNcbiAqIGVtYmVkIGEgcGVyLXN5bmMgbm9uY2UgXHUyMDE0IHNvIGtleWluZyByZW1lbWJlcmVkIGF1dGggb24gdGhlbSBvcnBoYW5zIHRoZVxuICogZ3JhbnQgb24gZXZlcnkgcmVsb2FkLiBJbnN0ZWFkIHdlIGtleSBvbiB0aGUgc2Vzc2lvbidzIGhvc3QgYGF1dGhvcml0eWBcbiAqIHBsdXMgdGhlIHNlcnZlciBgbmFtZWAgYW5kIGl0cyByZXNvdXJjZSBgdXJsYCwgYWxsIG9mIHdoaWNoIGFyZSBzdGFibGVcbiAqIGZvciBhIGdpdmVuIHNlcnZlciBhY3Jvc3Mgc2Vzc2lvbnMgYW5kIHJlbG9hZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZ2VudEhvc3RNY3BTZXJ2ZXJJZChhdXRob3JpdHk6IHN0cmluZywgc2VydmVyTmFtZTogc3RyaW5nLCByZXNvdXJjZVVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGBhZ2VudC1ob3N0LW1jcDoke2F1dGhvcml0eX0vJHtlbmNvZGVVUklDb21wb25lbnQoc2VydmVyTmFtZSl9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlc291cmNlVXJsKX1gO1xufVxuXG4vKipcbiAqIFRyYWNrcyB0aGUgbGFzdCBiZWFyZXIgdG9rZW4gcHVzaGVkIHRvIGEgZ2l2ZW4gYWdlbnQgaG9zdCBjb25uZWN0aW9uXG4gKiBmb3IgZWFjaCBwcm90ZWN0ZWQgcmVzb3VyY2UsIHNvIHRoYXQgcmVkdW5kYW50IGBhdXRoZW50aWNhdGVgIFJQQ3MgY2FuXG4gKiBiZSBzdXBwcmVzc2VkIHdoZW4gbmVpdGhlciB0aGUgcmVzb3VyY2Ugbm9yIHRoZSB0b2tlbiBoYXMgY2hhbmdlZC5cbiAqXG4gKiBPbmUgaW5zdGFuY2UgcGVyIGNvbm5lY3Rpb24uIE93bmVkIGJ5IHRoZSBjb250cmlidXRpb24gdGhhdCBkcml2ZXNcbiAqIGF1dGhlbnRpY2F0aW9uIGZvciB0aGF0IGNvbm5lY3Rpb24gc28gdGhlIGNhY2hlIGlzIGRyb3BwZWQgbmF0dXJhbGx5XG4gKiB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIGRpc3Bvc2VkLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0QXV0aFRva2VuQ2FjaGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0ZWRUb2tlbnMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQXV0aGVudGljYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgdG9rZW46IHN0cmluZzsgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTx2b2lkPiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXlHZW5lcmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgX2dsb2JhbEdlbmVyYXRpb24gPSAwO1xuXG5cdC8qKlxuXHQgKiBGb3J3YXJkcyBhIHRva2VuIG9uY2UgcGVyIHJlc291cmNlL3Njb3BlIHBhaXIuIFNhbWUtdG9rZW4gY2FsbGVycyBzaGFyZVxuXHQgKiBhbmQgYXdhaXQgYW4gaW4tZmxpZ2h0IGF1dGhlbnRpY2F0aW9uLlxuXHQgKi9cblx0YXN5bmMgYXV0aGVudGljYXRlKHJlc291cmNlOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIHRva2VuOiBzdHJpbmcsIGF1dGhlbnRpY2F0ZTogKCkgPT4gUHJvbWlzZTx1bmtub3duPik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShyZXNvdXJjZSwgc2NvcGVzKTtcblx0XHRjb25zdCBnbG9iYWxHZW5lcmF0aW9uID0gdGhpcy5fZ2xvYmFsR2VuZXJhdGlvbjtcblx0XHRjb25zdCBrZXlHZW5lcmF0aW9uID0gdGhpcy5fa2V5R2VuZXJhdGlvbnMuZ2V0KGtleSkgPz8gMDtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5nZXQoa2V5KTtcblx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0aWYgKHBlbmRpbmcudG9rZW4gPT09IHRva2VuKSB7XG5cdFx0XHRcdGF3YWl0IHBlbmRpbmcucHJvbWlzZTtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGtleSwgZ2xvYmFsR2VuZXJhdGlvbiwga2V5R2VuZXJhdGlvbikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHBlbmRpbmcucHJvbWlzZTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBUaGUgbmV3ZXIgdG9rZW4gZ2V0cyBpdHMgb3duIGF0dGVtcHQgcmVnYXJkbGVzcyBvZiB0aGUgcHJldmlvdXMgcmVzdWx0LlxuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGtleSwgZ2xvYmFsR2VuZXJhdGlvbiwga2V5R2VuZXJhdGlvbikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5hdXRoZW50aWNhdGUocmVzb3VyY2UsIHNjb3BlcywgdG9rZW4sIGF1dGhlbnRpY2F0ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbXBsZXRlZFRva2Vucy5nZXQoa2V5KSA9PT0gdG9rZW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGF1dGhlbnRpY2F0ZSgpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc0N1cnJlbnRHZW5lcmF0aW9uKGtleSwgZ2xvYmFsR2VuZXJhdGlvbiwga2V5R2VuZXJhdGlvbikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb21wbGV0ZWRUb2tlbnMuc2V0KGtleSwgdG9rZW4pO1xuXHRcdH0pKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5zZXQoa2V5LCB7IHRva2VuLCBwcm9taXNlIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm9taXNlO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nQXV0aGVudGljYXRpb25zLmdldChrZXkpPy5wcm9taXNlID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFyIHRoZSBjYWNoZWQgdG9rZW4gZm9yIGEgc3BlY2lmaWMgcmVzb3VyY2Uvc2NvcGUgcGFpciwgYSB3aG9sZSByZXNvdXJjZSxcblx0ICogb3IgYWxsIHJlc291cmNlcyBpZiBubyBhcmd1bWVudCBpcyBnaXZlbi4gQ2FsbCBhZnRlciBhIGZhaWxlZCBgYXV0aGVudGljYXRlYFxuXHQgKiBSUEMgb3Igd2hlbiB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIHJlc3RhcnRzLlxuXHQgKi9cblx0Y2xlYXIocmVzb3VyY2U/OiBzdHJpbmcsIHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0aWYgKHJlc291cmNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChzY29wZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkocmVzb3VyY2UsIHNjb3Blcyk7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVLZXkoa2V5KTtcblx0XHRcdFx0dGhpcy5fY29tcGxldGVkVG9rZW5zLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQXV0aGVudGljYXRpb25zLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmVmaXggPSBgJHtyZXNvdXJjZX1cXHgwMGA7XG5cdFx0XHRjb25zdCBrZXlzID0gbmV3IFNldChbLi4udGhpcy5fY29tcGxldGVkVG9rZW5zLmtleXMoKSwgLi4udGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5rZXlzKCksIC4uLnRoaXMuX2tleUdlbmVyYXRpb25zLmtleXMoKV0pO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0XHRpZiAoa2V5LnN0YXJ0c1dpdGgocHJlZml4KSkge1xuXHRcdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVLZXkoa2V5KTtcblx0XHRcdFx0XHR0aGlzLl9jb21wbGV0ZWRUb2tlbnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0F1dGhlbnRpY2F0aW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9nbG9iYWxHZW5lcmF0aW9uKys7XG5cdFx0XHR0aGlzLl9jb21wbGV0ZWRUb2tlbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdBdXRoZW50aWNhdGlvbnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2tleUdlbmVyYXRpb25zLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZUtleShrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2tleUdlbmVyYXRpb25zLnNldChrZXksICh0aGlzLl9rZXlHZW5lcmF0aW9ucy5nZXQoa2V5KSA/PyAwKSArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDdXJyZW50R2VuZXJhdGlvbihrZXk6IHN0cmluZywgZ2xvYmFsR2VuZXJhdGlvbjogbnVtYmVyLCBrZXlHZW5lcmF0aW9uOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2xvYmFsR2VuZXJhdGlvbiA9PT0gZ2xvYmFsR2VuZXJhdGlvbiAmJiAodGhpcy5fa2V5R2VuZXJhdGlvbnMuZ2V0KGtleSkgPz8gMCkgPT09IGtleUdlbmVyYXRpb247XG5cdH1cblxuXHRwcml2YXRlIF9rZXkocmVzb3VyY2U6IHN0cmluZywgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3Jlc291cmNlfVxceDAwJHtzY29wZXMgPyBbLi4ubmV3IFNldChzY29wZXMpXS5zb3J0KCkuam9pbignXFx4MDAnKSA6ICcnfWA7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhIGJlYXJlciB0b2tlbiBmb3IgYSBwcm90ZWN0ZWQgcmVzb3VyY2UgYnkgdHJ5aW5nIGVhY2hcbiAqIGF1dGhvcml6YXRpb24gc2VydmVyIGluIG9yZGVyLiBGaXJzdCBhdHRlbXB0cyBhbiBleGFjdCBzY29wZSBtYXRjaCxcbiAqIHRoZW4gZmFsbHMgYmFjayB0byBmaW5kaW5nIHRoZSBzZXNzaW9uIHdob3NlIHNjb3BlcyBhcmUgdGhlIG5hcnJvd2VzdFxuICogc3VwZXJzZXQgb2YgdGhlIHJlcXVlc3RlZCBzY29wZXMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShcblx0cmVzb3VyY2VTZXJ2ZXI6IFVSSSxcblx0YXV0aG9yaXphdGlvblNlcnZlcnM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRzY29wZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRsb2dQcmVmaXg6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGZvciAoY29uc3Qgc2VydmVyIG9mIGF1dGhvcml6YXRpb25TZXJ2ZXJzKSB7XG5cdFx0Y29uc3Qgc2VydmVyVXJpID0gVVJJLnBhcnNlKHNlcnZlcik7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihzZXJ2ZXJVcmksIHJlc291cmNlU2VydmVyKTtcblx0XHRpZiAoIXByb3ZpZGVySWQpIHtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSBObyBhdXRoIHByb3ZpZGVyIGZvdW5kIGZvciBzZXJ2ZXI6ICR7c2VydmVyfWApO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7bG9nUHJlZml4fSBSZXNvbHZlZCBhdXRoIHByb3ZpZGVyICcke3Byb3ZpZGVySWR9JyBmb3Igc2VydmVyOiAke3NlcnZlcn1gKTtcblxuXHRcdC8vIFRyeSBleGFjdCBzY29wZSBtYXRjaCBmaXJzdFxuXHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQsIFsuLi5zY29wZXNdLCB7IGF1dGhvcml6YXRpb25TZXJ2ZXI6IHNlcnZlclVyaSB9LCB0cnVlKTtcblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25zWzBdLmFjY2Vzc1Rva2VuO1xuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjazogZ2V0IGFsbCBzZXNzaW9ucyBhbmQgZmluZCB0aGUgbmFycm93ZXN0IHN1cGVyc2V0IG9mIHJlcXVlc3RlZCBzY29wZXNcblx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCB1bmRlZmluZWQsIHsgYXV0aG9yaXphdGlvblNlcnZlcjogc2VydmVyVXJpIH0sIHRydWUpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZFNldCA9IG5ldyBTZXQoc2NvcGVzKTtcblx0XHRsZXQgYmVzdFRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGJlc3RFeHRyYVNjb3BlcyA9IEluZmluaXR5O1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBhbGxTZXNzaW9ucykge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblNjb3BlcyA9IG5ldyBTZXQoc2Vzc2lvbi5zY29wZXMpO1xuXHRcdFx0bGV0IGlzU3VwZXJzZXQgPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiByZXF1ZXN0ZWRTZXQpIHtcblx0XHRcdFx0aWYgKCFzZXNzaW9uU2NvcGVzLmhhcyhzY29wZSkpIHtcblx0XHRcdFx0XHRpc1N1cGVyc2V0ID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc1N1cGVyc2V0KSB7XG5cdFx0XHRcdGNvbnN0IGV4dHJhU2NvcGVzID0gc2Vzc2lvblNjb3Blcy5zaXplIC0gcmVxdWVzdGVkU2V0LnNpemU7XG5cdFx0XHRcdGlmIChleHRyYVNjb3BlcyA8IGJlc3RFeHRyYVNjb3Blcykge1xuXHRcdFx0XHRcdGJlc3RFeHRyYVNjb3BlcyA9IGV4dHJhU2NvcGVzO1xuXHRcdFx0XHRcdGJlc3RUb2tlbiA9IHNlc3Npb24uYWNjZXNzVG9rZW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGJlc3RUb2tlbikge1xuXHRcdFx0cmV0dXJuIGJlc3RUb2tlbjtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0QXV0aGVudGljYXRlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3Blcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSB0b2tlbjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RBdXRoZW50aWNhdGlvbk9wdGlvbnMge1xuXHRyZWFkb25seSBhdXRoVG9rZW5DYWNoZT86IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlO1xuXHRyZWFkb25seSBsb2dQcmVmaXg6IHN0cmluZztcblx0cmVhZG9ubHkgYXV0aGVudGljYXRlOiAocmVxdWVzdDogSUFnZW50SG9zdEF1dGhlbnRpY2F0ZVJlcXVlc3QpID0+IFByb21pc2U8dW5rbm93bj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdE1jcEF1dGhlbnRpY2F0aW9uT3B0aW9uc0Jhc2Uge1xuXHRyZWFkb25seSBhbGxvd0ludGVyYWN0aW9uOiBib29sZWFuO1xuXHRyZWFkb25seSBhdXRoVG9rZW5DYWNoZT86IEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlO1xuXHRyZWFkb25seSBsb2dQcmVmaXg6IHN0cmluZztcblx0cmVhZG9ubHkgbWNwU2VydmVySWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbWNwU2VydmVyTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgb2F1dGhDbGllbnQ/OiBNY3BPQXV0aENsaWVudDtcblx0cmVhZG9ubHkgc2NvcGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgYXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcj86IHR5cGVvZiBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YTtcblx0LyoqXG5cdCAqIElkZW50aWZpZXMgdGhlIGFnZW50IGhvc3QgYmFja2luZyB0aGlzIE1DUCBzZXJ2ZXIgc28gcmVtZW1iZXJlZC1hdXRoXG5cdCAqIGVudHJpZXMgY2FuIGJlIHN1cmZhY2VkIGluIHRoZWlyIG93biBzZWN0aW9uIG9mIHRoZSBcIk1hbmFnZSBUcnVzdGVkIE1DUFxuXHQgKiBTZXJ2ZXJzXCIgcGlja2VyLiBXaGVuIHNldCwgdGhlIHJlc29sdmVkIGhvc3QgbGFiZWwgKHZpYVxuXHQgKiB7QGxpbmsgSUxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWx9KSBpcyByZWNvcmRlZCBvbiB0aGUgYWxsb3dlZC1zZXJ2ZXJcblx0ICogZW50cnkuIE9taXQgZm9yIG5vbi1hZ2VudC1ob3N0IGNhbGxlcnMuXG5cdCAqL1xuXHRyZWFkb25seSBhZ2VudEhvc3Q/OiB7IHJlYWRvbmx5IHNjaGVtZTogc3RyaW5nOyByZWFkb25seSBhdXRob3JpdHk6IHN0cmluZyB9O1xuXHRyZWFkb25seSBhdXRoZW50aWNhdGU6IChyZXF1ZXN0OiBJQWdlbnRIb3N0QXV0aGVudGljYXRlUmVxdWVzdCkgPT4gUHJvbWlzZTx1bmtub3duPjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZm9yd2FyZEF1dGhlbnRpY2F0aW9uVG9rZW4oXG5cdG9wdGlvbnM6IFBpY2s8SUFnZW50SG9zdEF1dGhlbnRpY2F0aW9uT3B0aW9ucywgJ2F1dGhUb2tlbkNhY2hlJyB8ICdhdXRoZW50aWNhdGUnPixcblx0cmVzb3VyY2U6IHN0cmluZyxcblx0c2NvcGVzOiByZWFkb25seSBzdHJpbmdbXSxcblx0dG9rZW46IHN0cmluZyxcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZXF1ZXN0ID0geyByZXNvdXJjZSwgc2NvcGVzLCB0b2tlbiB9O1xuXHRpZiAob3B0aW9ucy5hdXRoVG9rZW5DYWNoZSkge1xuXHRcdHJldHVybiBvcHRpb25zLmF1dGhUb2tlbkNhY2hlLmF1dGhlbnRpY2F0ZShyZXNvdXJjZSwgc2NvcGVzLCB0b2tlbiwgKCkgPT4gb3B0aW9ucy5hdXRoZW50aWNhdGUocmVxdWVzdCkpO1xuXHR9XG5cdGF3YWl0IG9wdGlvbnMuYXV0aGVudGljYXRlKHJlcXVlc3QpO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhbmQgZm9yd2FyZHMgYmVhcmVyIHRva2VucyBmb3IgdGhlIHByb3RlY3RlZCByZXNvdXJjZXMgZGVjbGFyZWQgYnlcbiAqIHRoZSBhZ2VudHMgY3VycmVudGx5IHB1Ymxpc2hlZCBmcm9tIGFuIGFnZW50IGhvc3QuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRhZ2VudHM6IHJlYWRvbmx5IEFnZW50SW5mb1tdLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zLFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBhZ2VudC5wcm90ZWN0ZWRSZXNvdXJjZXMgPz8gW10pIHtcblx0XHRcdGNvbnN0IHJlc291cmNlVXJpID0gVVJJLnBhcnNlKHJlc291cmNlLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNjb3BlcyA9IHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQgPz8gW107XG5cdFx0XHRjb25zdCB0b2tlbiA9IGF3YWl0IHJlc29sdmVUb2tlbkZvclJlc291cmNlKFxuXHRcdFx0XHRyZXNvdXJjZVVyaSxcblx0XHRcdFx0cmVzb3VyY2UuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdLFxuXHRcdFx0XHRzY29wZXMsXG5cdFx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRcdFx0bG9nU2VydmljZSxcblx0XHRcdFx0b3B0aW9ucy5sb2dQcmVmaXgsXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYCR7b3B0aW9ucy5sb2dQcmVmaXh9IE5vIHRva2VuIHJlc29sdmVkIGZvciByZXNvdXJjZTogJHtyZXNvdXJjZS5yZXNvdXJjZX1gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhd2FpdCBmb3J3YXJkQXV0aGVudGljYXRpb25Ub2tlbihvcHRpb25zLCByZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzLCB0b2tlbik7XG5cdFx0XHRpZiAoIWF1dGhlbnRpY2F0ZWQpIHtcblx0XHRcdFx0bG9nU2VydmljZS50cmFjZShgJHtvcHRpb25zLmxvZ1ByZWZpeH0gQXV0aCB0b2tlbiBmb3IgJHtyZXNvdXJjZS5yZXNvdXJjZX0gdW5jaGFuZ2VkOyBza2lwcGluZyBhdXRoZW50aWNhdGUgUlBDYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBBdXRoZW50aWNhdGluZyBmb3IgcmVzb3VyY2U6ICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUHJvbXB0cyB0aGUgdXNlciB0byBhdXRoZW50aWNhdGUgb25lIG9mIHRoZSBwcm92aWRlZCBwcm90ZWN0ZWQgcmVzb3VyY2VzIGFuZFxuICogZm9yd2FyZHMgdGhlIHJlc3VsdGluZyB0b2tlbiB0byB0aGUgYWdlbnQgaG9zdCBjb25uZWN0aW9uLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseShcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdHByb3RlY3RlZFJlc291cmNlczogcmVhZG9ubHkgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdLFxuXHRvcHRpb25zOiBJQWdlbnRIb3N0QXV0aGVudGljYXRpb25PcHRpb25zLFxuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcHJvdGVjdGVkUmVzb3VyY2VzKSB7XG5cdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSBVUkkucGFyc2UocmVzb3VyY2UucmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNjb3BlcyA9IHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQgPz8gW107XG5cdFx0bGV0IHRva2VuID0gYXdhaXQgcmVzb2x2ZVRva2VuRm9yUmVzb3VyY2UoXG5cdFx0XHRyZXNvdXJjZVVyaSxcblx0XHRcdHJlc291cmNlLmF1dGhvcml6YXRpb25fc2VydmVycyA/PyBbXSxcblx0XHRcdHNjb3Blcyxcblx0XHRcdGF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRvcHRpb25zLmxvZ1ByZWZpeCxcblx0XHQpO1xuXHRcdGlmICh0b2tlbikge1xuXHRcdFx0YXdhaXQgZm9yd2FyZEF1dGhlbnRpY2F0aW9uVG9rZW4ob3B0aW9ucywgcmVzb3VyY2UucmVzb3VyY2UsIHNjb3BlcywgdG9rZW4pO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBJbnRlcmFjdGl2ZSBhdXRoZW50aWNhdGlvbiBzdWNjZWVkZWQgZm9yICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXR1cFJlc3VsdCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElDaGF0U2V0dXBSZXN1bHQ+KENIQVRfU0VUVVBfQUNUSU9OX0lELCB1bmRlZmluZWQsIHtcblx0XHRcdGZvcmNlU2lnbkluRGlhbG9nOiB0cnVlLFxuXHRcdFx0YWRkaXRpb25hbFNjb3Blczogc2NvcGVzLFxuXHRcdFx0ZGlhbG9nVGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2lnbkluRGlhbG9nVGl0bGUnLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90XCIpLFxuXHRcdFx0ZGlzYWJsZUNoYXRWaWV3UmV2ZWFsOiB0cnVlLFxuXHRcdFx0cmV0dXJuUmVzdWx0OiB0cnVlLFxuXHRcdH0pO1xuXHRcdGlmIChzZXR1cFJlc3VsdD8uc3VjY2VzcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghc2V0dXBSZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0dGhyb3cgc2V0dXBSZXN1bHQuZXJyb3IgPz8gbmV3IEVycm9yKGxvY2FsaXplKCdhZ2VudEhvc3Quc2lnbkluRmFpbGVkJywgXCJGYWlsZWQgdG8gc2lnbiBpbiB0byB1c2UgR2l0SHViIENvcGlsb3QuXCIpKTtcblx0XHR9XG5cdFx0dG9rZW4gPSBhd2FpdCByZXNvbHZlVG9rZW5Gb3JSZXNvdXJjZShcblx0XHRcdHJlc291cmNlVXJpLFxuXHRcdFx0cmVzb3VyY2UuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdLFxuXHRcdFx0c2NvcGVzLFxuXHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdG9wdGlvbnMubG9nUHJlZml4LFxuXHRcdCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRhd2FpdCBmb3J3YXJkQXV0aGVudGljYXRpb25Ub2tlbihvcHRpb25zLCByZXNvdXJjZS5yZXNvdXJjZSwgc2NvcGVzLCB0b2tlbik7XG5cdFx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBJbnRlcmFjdGl2ZSBhdXRoZW50aWNhdGlvbiBzdWNjZWVkZWQgZm9yICR7cmVzb3VyY2UucmVzb3VyY2V9YCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb24oXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRwcm90ZWN0ZWRSZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSxcblx0b3B0aW9uczogSUFnZW50SG9zdE1jcEF1dGhlbnRpY2F0aW9uT3B0aW9uc0Jhc2UsXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0Y29uc3QgYXV0aGVudGljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSk7XG5cdGNvbnN0IGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSA9IGFjY2Vzc29yLmdldChJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlKTtcblx0Y29uc3QgYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlKTtcblx0Y29uc3QgZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBhZ2VudEhvc3RNZXRhID0gb3B0aW9ucy5hZ2VudEhvc3Rcblx0XHQ/IHsgYXV0aG9yaXR5OiBvcHRpb25zLmFnZW50SG9zdC5hdXRob3JpdHksIGxhYmVsOiBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSkuZ2V0SG9zdExhYmVsKG9wdGlvbnMuYWdlbnRIb3N0LnNjaGVtZSwgb3B0aW9ucy5hZ2VudEhvc3QuYXV0aG9yaXR5KSB9XG5cdFx0OiB1bmRlZmluZWQ7XG5cdC8vIEdpdEh1YiBNQ1Agc3VwcG9ydHMgZGVtYW5kLWRyaXZlbiBzdGVwLXVwIGF1dGgsIHdoaWxlIG90aGVyIHNlcnZlcnMgbWF5IHJlamVjdCBhdXRob3JpemF0aW9uIHJlcXVlc3RzIHdpdGggbm8gc2NvcGVzLlxuXHRjb25zdCBzY29wZXMgPSBvcHRpb25zLnNjb3Blcy5sZW5ndGggPiAwIHx8IGlzR2l0SHViTWNwUmVzb3VyY2UocHJvdGVjdGVkUmVzb3VyY2UpXG5cdFx0PyBvcHRpb25zLnNjb3Blc1xuXHRcdDogcHJvdGVjdGVkUmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCA/PyBbXTtcblx0Y29uc3QgYXV0aGVudGljYXRpb25PcGVyYXRpb25zID0gZ2V0TWNwQXV0aGVudGljYXRpb25PcGVyYXRpb25zKGF1dGhlbnRpY2F0aW9uU2VydmljZSk7XG5cdGZvciAoY29uc3QgYXV0aG9yaXphdGlvblNlcnZlciBvZiBwcm90ZWN0ZWRSZXNvdXJjZS5hdXRob3JpemF0aW9uX3NlcnZlcnMgPz8gW10pIHtcblx0XHRjb25zdCBhdXRob3JpemF0aW9uU2VydmVyVXJpID0gVVJJLnBhcnNlKGF1dGhvcml6YXRpb25TZXJ2ZXIpO1xuXHRcdGNvbnN0IHByb3ZpZGVyT3BlcmF0aW9uSWQgPSBnZXREeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlcklkKGF1dGhvcml6YXRpb25TZXJ2ZXJVcmksIHByb3RlY3RlZFJlc291cmNlKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGVkID0gYXdhaXQgYXV0aGVudGljYXRpb25PcGVyYXRpb25zLnF1ZXVlKHByb3ZpZGVyT3BlcmF0aW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVySWQgPSBhd2FpdCBnZXRPckNyZWF0ZVByb3ZpZGVyRm9yTWNwUmVzb3VyY2UoXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJVcmksXG5cdFx0XHRcdHByb3RlY3RlZFJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zLm9hdXRoQ2xpZW50LFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRcdG9wdGlvbnMubG9nUHJlZml4LFxuXHRcdFx0XHRvcHRpb25zLmFsbG93SW50ZXJhY3Rpb24sXG5cdFx0XHRcdG9wdGlvbnMuYXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlciA/PyBmZXRjaEF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YSxcblx0XHRcdCk7XG5cdFx0XHRpZiAoIXByb3ZpZGVySWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvYXV0aENsaWVudE9wdGlvbnMgPSBvcHRpb25zLm9hdXRoQ2xpZW50XG5cdFx0XHRcdD8geyBjbGllbnRJZDogb3B0aW9ucy5vYXV0aENsaWVudC5jbGllbnRJZCwgY2xpZW50U2VjcmV0OiBvcHRpb25zLm9hdXRoQ2xpZW50LmNsaWVudFNlY3JldCB9XG5cdFx0XHRcdDoge307XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBbLi4uc2NvcGVzXSwge1xuXHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyOiBhdXRob3JpemF0aW9uU2VydmVyVXJpLFxuXHRcdFx0XHRyZXNvdXJjZTogcHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdC4uLm9hdXRoQ2xpZW50T3B0aW9ucyxcblx0XHRcdFx0c2lsZW50OiAhb3B0aW9ucy5hbGxvd0ludGVyYWN0aW9uLFxuXHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBhbGxvd2VkU2Vzc2lvbiA9IGdldEFsbG93ZWRNY3BTZXNzaW9uKHByb3ZpZGVySWQsIHNlc3Npb25zLCBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwgb3B0aW9ucyk7XG5cdFx0XHRpZiAoYWxsb3dlZFNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgYXV0aGVudGljYXRlTWNwU2Vzc2lvbihwcm92aWRlcklkLCBhbGxvd2VkU2Vzc2lvbiwgc2NvcGVzLCBhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UsIGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZSwgYXV0aGVudGljYXRpb25NY3BVc2FnZVNlcnZpY2UsIGxvZ1NlcnZpY2UsIG9wdGlvbnMsIGZhbHNlLCBhZ2VudEhvc3RNZXRhKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3B0aW9ucy5hbGxvd0ludGVyYWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMubGVuZ3RoXG5cdFx0XHRcdD8gcHJvdmlkZXIuc3VwcG9ydHNNdWx0aXBsZUFjY291bnRzXG5cdFx0XHRcdFx0PyBhd2FpdCBhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2Uuc2VsZWN0U2Vzc2lvbihwcm92aWRlcklkLCBvcHRpb25zLm1jcFNlcnZlcklkLCBvcHRpb25zLm1jcFNlcnZlck5hbWUsIFsuLi5zY29wZXNdLCBzZXNzaW9ucylcblx0XHRcdFx0XHQ6IHNlc3Npb25zWzBdXG5cdFx0XHRcdDogYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgWy4uLnNjb3Blc10sIHtcblx0XHRcdFx0XHRhY3RpdmF0ZUltbWVkaWF0ZTogdHJ1ZSxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyOiBhdXRob3JpemF0aW9uU2VydmVyVXJpLFxuXHRcdFx0XHRcdHJlc291cmNlOiBwcm90ZWN0ZWRSZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdFx0XHQuLi5vYXV0aENsaWVudE9wdGlvbnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgYXV0aGVudGljYXRlTWNwU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9uLCBzY29wZXMsIGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSwgYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLCBhdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZSwgbG9nU2VydmljZSwgb3B0aW9ucywgdHJ1ZSwgYWdlbnRIb3N0TWV0YSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRpZiAoYXV0aGVudGljYXRlZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuY29uc3QgbWNwQXV0aGVudGljYXRpb25PcGVyYXRpb25zID0gbmV3IFdlYWtNYXA8SUF1dGhlbnRpY2F0aW9uU2VydmljZSwgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPj4oKTtcblxuZnVuY3Rpb24gZ2V0TWNwQXV0aGVudGljYXRpb25PcGVyYXRpb25zKGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSk6IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4ge1xuXHRsZXQgb3BlcmF0aW9ucyA9IG1jcEF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucy5nZXQoYXV0aGVudGljYXRpb25TZXJ2aWNlKTtcblx0aWYgKCFvcGVyYXRpb25zKSB7XG5cdFx0b3BlcmF0aW9ucyA9IG5ldyBTZXF1ZW5jZXJCeUtleSgpO1xuXHRcdG1jcEF1dGhlbnRpY2F0aW9uT3BlcmF0aW9ucy5zZXQoYXV0aGVudGljYXRpb25TZXJ2aWNlLCBvcGVyYXRpb25zKTtcblx0fVxuXHRyZXR1cm4gb3BlcmF0aW9ucztcbn1cblxuZnVuY3Rpb24gaXNHaXRIdWJNY3BSZXNvdXJjZShyZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVzb3VyY2UucmVzb3VyY2VfbmFtZSA9PT0gJ0dpdEh1YiBNQ1AgU2VydmVyJztcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0T3JDcmVhdGVQcm92aWRlckZvck1jcFJlc291cmNlKFxuXHRhdXRob3JpemF0aW9uU2VydmVyOiBVUkksXG5cdHByb3RlY3RlZFJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLFxuXHRvYXV0aENsaWVudDogTWNwT0F1dGhDbGllbnQgfCB1bmRlZmluZWQsXG5cdGF1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0ZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZTogSUR5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVyU3RvcmFnZVNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRsb2dQcmVmaXg6IHN0cmluZyxcblx0YWxsb3dDcmVhdGlvbjogYm9vbGVhbixcblx0YXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhRmV0Y2hlcjogdHlwZW9mIGZldGNoQXV0aG9yaXphdGlvblNlcnZlck1ldGFkYXRhLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgcmVzb3VyY2VVcmkgPSBVUkkucGFyc2UocHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2UpO1xuXHRjb25zdCBkeW5hbWljUHJvdmlkZXJJZCA9IGdldER5bmFtaWNBdXRoZW50aWNhdGlvblByb3ZpZGVySWQoYXV0aG9yaXphdGlvblNlcnZlciwgcHJvdGVjdGVkUmVzb3VyY2UpO1xuXHRsZXQgY2xpZW50SWQgPSBvYXV0aENsaWVudD8uY2xpZW50SWQ7XG5cdGxldCBjbGllbnRTZWNyZXQgPSBvYXV0aENsaWVudD8uY2xpZW50U2VjcmV0O1xuXHRpZiAob2F1dGhDbGllbnQpIHtcblx0XHRjb25zdCBpc1Byb3ZpZGVyQWN0aXZlID0gYXV0aGVudGljYXRpb25TZXJ2aWNlLmlzRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoZHluYW1pY1Byb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRDbGllbnQgPSBhd2FpdCBkeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldENsaWVudFJlZ2lzdHJhdGlvbihkeW5hbWljUHJvdmlkZXJJZCk7XG5cdFx0Y29uc3QgY2xpZW50TWF0Y2hlcyA9IHJlZ2lzdGVyZWRDbGllbnQ/LmNsaWVudElkID09PSBvYXV0aENsaWVudC5jbGllbnRJZCAmJiByZWdpc3RlcmVkQ2xpZW50LmNsaWVudFNlY3JldCA9PT0gb2F1dGhDbGllbnQuY2xpZW50U2VjcmV0O1xuXHRcdGlmIChjbGllbnRNYXRjaGVzKSB7XG5cdFx0XHRpZiAoaXNQcm92aWRlckFjdGl2ZSkge1xuXHRcdFx0XHRyZXR1cm4gZHluYW1pY1Byb3ZpZGVySWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghYWxsb3dDcmVhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzUHJvdmlkZXJBY3RpdmUpIHtcblx0XHRcdFx0YXV0aGVudGljYXRpb25TZXJ2aWNlLnVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGR5bmFtaWNQcm92aWRlcklkKTtcblx0XHRcdFx0YXdhaXQgZHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJTdG9yYWdlU2VydmljZS5yZW1vdmVEeW5hbWljUHJvdmlkZXIoZHluYW1pY1Byb3ZpZGVySWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IGF1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRPckFjdGl2YXRlUHJvdmlkZXJJZEZvclNlcnZlcihhdXRob3JpemF0aW9uU2VydmVyLCByZXNvdXJjZVVyaSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRDbGllbnQgPSBhd2FpdCBkeW5hbWljQXV0aGVudGljYXRpb25Qcm92aWRlclN0b3JhZ2VTZXJ2aWNlLmdldENsaWVudFJlZ2lzdHJhdGlvbihkeW5hbWljUHJvdmlkZXJJZCk7XG5cdFx0aWYgKCFyZWdpc3RlcmVkQ2xpZW50Py5jbGllbnRJZCAmJiAhYWxsb3dDcmVhdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y2xpZW50SWQgPSByZWdpc3RlcmVkQ2xpZW50Py5jbGllbnRJZDtcblx0XHRjbGllbnRTZWNyZXQgPSByZWdpc3RlcmVkQ2xpZW50Py5jbGllbnRTZWNyZXQ7XG5cdH1cblxuXHR0cnkge1xuXHRcdGNvbnN0IHsgbWV0YWRhdGEgfSA9IGF3YWl0IGF1dGhvcml6YXRpb25TZXJ2ZXJNZXRhZGF0YUZldGNoZXIoYXV0aG9yaXphdGlvblNlcnZlci50b1N0cmluZyh0cnVlKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlRHluYW1pY0F1dGhlbnRpY2F0aW9uUHJvdmlkZXIoYXV0aG9yaXphdGlvblNlcnZlciwgbWV0YWRhdGEsIHByb3RlY3RlZFJlc291cmNlLCBjbGllbnRJZCwgY2xpZW50U2VjcmV0KTtcblx0XHRyZXR1cm4gcHJvdmlkZXI/LmlkO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYCR7bG9nUHJlZml4fSBGYWlsZWQgdG8gY3JlYXRlIE1DUCBhdXRoIHByb3ZpZGVyIGZvciAke2F1dGhvcml6YXRpb25TZXJ2ZXIudG9TdHJpbmcodHJ1ZSl9YCwgZXJyKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEFsbG93ZWRNY3BTZXNzaW9uKFxuXHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdHNlc3Npb25zOiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXSxcblx0YXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BBY2Nlc3NTZXJ2aWNlLFxuXHRhdXRoZW50aWNhdGlvbk1jcFNlcnZpY2U6IElBdXRoZW50aWNhdGlvbk1jcFNlcnZpY2UsXG5cdG9wdGlvbnM6IElBZ2VudEhvc3RNY3BBdXRoZW50aWNhdGlvbk9wdGlvbnNCYXNlLFxuKTogQXV0aGVudGljYXRpb25TZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYWNjb3VudE5hbWVQcmVmZXJlbmNlID0gYXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLmdldEFjY291bnRQcmVmZXJlbmNlKG9wdGlvbnMubWNwU2VydmVySWQsIHByb3ZpZGVySWQpO1xuXHRpZiAoYWNjb3VudE5hbWVQcmVmZXJlbmNlKSB7XG5cdFx0Y29uc3QgcHJlZmVycmVkID0gc2Vzc2lvbnMuZmluZChzZXNzaW9uID0+IHNlc3Npb24uYWNjb3VudC5sYWJlbCA9PT0gYWNjb3VudE5hbWVQcmVmZXJlbmNlKTtcblx0XHRpZiAocHJlZmVycmVkICYmIGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWRGb3JVcmwocHJvdmlkZXJJZCwgcHJlZmVycmVkLmFjY291bnQubGFiZWwsIG9wdGlvbnMubWNwU2VydmVySWQsIG9wdGlvbnMubWNwU2VydmVyVXJsKSkge1xuXHRcdFx0cmV0dXJuIHByZWZlcnJlZDtcblx0XHR9XG5cdH1cblxuXHRpZiAoc2Vzc2lvbnMubGVuZ3RoID09PSAxICYmIGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZS5pc0FjY2Vzc0FsbG93ZWRGb3JVcmwocHJvdmlkZXJJZCwgc2Vzc2lvbnNbMF0uYWNjb3VudC5sYWJlbCwgb3B0aW9ucy5tY3BTZXJ2ZXJJZCwgb3B0aW9ucy5tY3BTZXJ2ZXJVcmwpKSB7XG5cdFx0cmV0dXJuIHNlc3Npb25zWzBdO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gYXV0aGVudGljYXRlTWNwU2Vzc2lvbihcblx0cHJvdmlkZXJJZDogc3RyaW5nLFxuXHRzZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24sXG5cdHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10sXG5cdGF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwQWNjZXNzU2VydmljZSxcblx0YXV0aGVudGljYXRpb25NY3BTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25NY3BTZXJ2aWNlLFxuXHRhdXRoZW50aWNhdGlvbk1jcFVzYWdlU2VydmljZTogSUF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0b3B0aW9uczogSUFnZW50SG9zdE1jcEF1dGhlbnRpY2F0aW9uT3B0aW9uc0Jhc2UsXG5cdHVwZGF0ZUFjY2VzczogYm9vbGVhbixcblx0YWdlbnRIb3N0OiB7IHJlYWRvbmx5IGF1dGhvcml0eTogc3RyaW5nOyByZWFkb25seSBsYWJlbDogc3RyaW5nIH0gfCB1bmRlZmluZWQsXG4pOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgZm9yd2FyZEF1dGhlbnRpY2F0aW9uVG9rZW4ob3B0aW9ucywgb3B0aW9ucy5tY3BTZXJ2ZXJVcmwsIHNjb3Blcywgc2Vzc2lvbi5hY2Nlc3NUb2tlbik7XG5cdGlmICh1cGRhdGVBY2Nlc3MpIHtcblx0XHRhdXRoZW50aWNhdGlvbk1jcEFjY2Vzc1NlcnZpY2UudXBkYXRlQWxsb3dlZE1jcFNlcnZlcnMocHJvdmlkZXJJZCwgc2Vzc2lvbi5hY2NvdW50LmxhYmVsLCBbeyBpZDogb3B0aW9ucy5tY3BTZXJ2ZXJJZCwgbmFtZTogb3B0aW9ucy5tY3BTZXJ2ZXJOYW1lLCBhbGxvd2VkOiB0cnVlLCB1cmw6IG9wdGlvbnMubWNwU2VydmVyVXJsLCBhZ2VudEhvc3QgfV0pO1xuXHRcdGF1dGhlbnRpY2F0aW9uTWNwU2VydmljZS51cGRhdGVBY2NvdW50UHJlZmVyZW5jZShvcHRpb25zLm1jcFNlcnZlcklkLCBwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQpO1xuXHR9XG5cdGF1dGhlbnRpY2F0aW9uTWNwVXNhZ2VTZXJ2aWNlLmFkZEFjY291bnRVc2FnZShwcm92aWRlcklkLCBzZXNzaW9uLmFjY291bnQubGFiZWwsIHNjb3Blcywgb3B0aW9ucy5tY3BTZXJ2ZXJJZCwgb3B0aW9ucy5tY3BTZXJ2ZXJOYW1lKTtcblx0bG9nU2VydmljZS5pbmZvKGAke29wdGlvbnMubG9nUHJlZml4fSBNQ1AgYXV0aGVudGljYXRpb24gc3VjY2VlZGVkIGZvciAke29wdGlvbnMubWNwU2VydmVyTmFtZX1gKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsV0FBVztBQUVwQixTQUFTLHVCQUF1QjtBQUdoQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFnQyxvQ0FBb0MsOEJBQThCO0FBQ2xHLFNBQVMsb0RBQW9EO0FBQzdELFNBQVMsNEJBQTRCO0FBYTlCLFNBQVMscUJBQXFCLFdBQW1CLFlBQW9CLGFBQTZCO0FBQ3hHLFNBQU8sa0JBQWtCLFNBQVMsSUFBSSxtQkFBbUIsVUFBVSxDQUFDLElBQUksbUJBQW1CLFdBQVcsQ0FBQztBQUN4RztBQVdPLE1BQU0sd0JBQXdCO0FBQUEsRUFBOUI7QUFDTixTQUFpQixtQkFBbUIsb0JBQUksSUFBb0I7QUFDNUQsU0FBaUIsMEJBQTBCLG9CQUFJLElBQXlFO0FBQ3hILFNBQWlCLGtCQUFrQixvQkFBSSxJQUFvQjtBQUMzRCxTQUFRLG9CQUFvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU01QixNQUFNLGFBQWEsVUFBa0IsUUFBdUMsT0FBZSxjQUF3RDtBQUNsSixVQUFNLE1BQU0sS0FBSyxLQUFLLFVBQVUsTUFBTTtBQUN0QyxVQUFNLG1CQUFtQixLQUFLO0FBQzlCLFVBQU0sZ0JBQWdCLEtBQUssZ0JBQWdCLElBQUksR0FBRyxLQUFLO0FBQ3ZELFVBQU0sVUFBVSxLQUFLLHdCQUF3QixJQUFJLEdBQUc7QUFDcEQsUUFBSSxTQUFTO0FBQ1osVUFBSSxRQUFRLFVBQVUsT0FBTztBQUM1QixjQUFNLFFBQVE7QUFDZCxZQUFJLENBQUMs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
